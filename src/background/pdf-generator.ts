import { MAX_PAPER_INCHES, PDF_DPI } from "../shared/constants";
import { userError } from "../shared/i18n";
import type { PageMetrics, PrepareResult } from "../shared/types";
import { DebuggerSession } from "./debugger-session";

interface LayoutMetricsResponse {
  cssContentSize?: { width: number; height: number };
  contentSize?: { width: number; height: number };
}

interface PrintResponse {
  stream?: string;
  data?: string;
}

interface ReadResponse {
  data: string;
  base64Encoded?: boolean;
  eof: boolean;
}

export interface PrintPlan {
  mode: "single-page" | "paginated";
  scale: number;
  paperWidth: number;
  paperHeights: number[];
  estimatedPageCount: number;
}

const MIN_PRINT_SCALE = 0.1;
const PAPER_WIDTH_PADDING_INCHES = 0.01;
const MAX_ROUNDING_PADDING_INCHES = 0.1;

function decodeBase64Chunk(value: string): Uint8Array {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function textChunk(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function readPdfStream(session: DebuggerSession, handle: string): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  try {
    while (true) {
      const part = await session.send<ReadResponse>("IO.read", { handle, size: 1_048_576 });
      const bytes = part.base64Encoded ? decodeBase64Chunk(part.data) : textChunk(part.data);
      if (bytes.length > 0) {
        chunks.push(bytes);
        totalLength += bytes.length;
      }
      if (part.eof) break;
    }
  } finally {
    try {
      await session.send("IO.close", { handle });
    } catch {
      // Closing is best-effort; detach below is the final safety net.
    }
  }

  const pdf = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, offset);
    offset += chunk.length;
  }
  return pdf;
}

export function countPdfPages(pdf: Uint8Array): number | undefined {
  const slash = 47;
  const type = [84, 121, 112, 101];
  const page = [80, 97, 103, 101];
  const isWhitespace = (byte: number) => byte === 0 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32;
  const matchesAt = (offset: number, pattern: number[]) => pattern.every((byte, index) => pdf[offset + index] === byte);
  let count = 0;

  for (let index = 0; index < pdf.length - 11; index += 1) {
    if (pdf[index] !== slash || !matchesAt(index + 1, type)) continue;
    let cursor = index + 1 + type.length;
    while (cursor < pdf.length && isWhitespace(pdf[cursor]!)) cursor += 1;
    if (pdf[cursor] !== slash || !matchesAt(cursor + 1, page)) continue;
    const boundary = pdf[cursor + 1 + page.length];
    if (boundary === undefined || isWhitespace(boundary) || boundary === 47 || boundary === 62) count += 1;
  }
  return count > 0 ? count : undefined;
}

function normalizeMetrics(metrics: LayoutMetricsResponse): PageMetrics {
  const size = metrics.cssContentSize ?? metrics.contentSize;
  if (
    !size ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw userError("errorMeasureWebpage");
  }
  return { width: Math.ceil(size.width * 100) / 100, height: Math.ceil(size.height * 100) / 100 };
}

export function createPrintPlan({ width, height }: PageMetrics): PrintPlan | undefined {
  const widthInches = width / PDF_DPI;
  const maximumContentWidth = MAX_PAPER_INCHES - PAPER_WIDTH_PADDING_INCHES;
  const requiredScale = Math.min(1, maximumContentWidth / widthInches);
  if (!Number.isFinite(requiredScale) || requiredScale < MIN_PRINT_SCALE) return undefined;

  const scaledHeight = (height * requiredScale) / PDF_DPI;
  const maximumSinglePageContentHeight = MAX_PAPER_INCHES - MAX_ROUNDING_PADDING_INCHES;
  const singlePage = scaledHeight <= maximumSinglePageContentHeight;
  const paperHeights = singlePage
    ? [0.01, 0.04, MAX_ROUNDING_PADDING_INCHES].map((padding) => scaledHeight + padding)
    : [MAX_PAPER_INCHES];

  return {
    mode: singlePage ? "single-page" : "paginated",
    scale: requiredScale,
    paperWidth: Math.min(MAX_PAPER_INCHES, widthInches * requiredScale + PAPER_WIDTH_PADDING_INCHES),
    paperHeights,
    estimatedPageCount: singlePage ? 1 : Math.ceil(scaledHeight / MAX_PAPER_INCHES)
  };
}

export function isAcceptablePageCount(plan: PrintPlan, pageCount: number): boolean {
  return pageCount >= 1 && (plan.mode === "paginated" || pageCount === 1);
}

function validatePreparedMetrics(measured: PageMetrics, prepared: PrepareResult): void {
  const heightTolerance = Math.max(8, prepared.height * 0.002);
  const widthTolerance = Math.max(4, prepared.width * 0.002);
  if (
    Math.abs(measured.height - prepared.height) > heightTolerance ||
    Math.abs(measured.width - prepared.width) > widthTolerance
  ) {
    throw userError("errorLayoutChanged");
  }
}

export async function generatePdf(
  tabId: number,
  prepared: PrepareResult
): Promise<{ pdf: Uint8Array; metrics: PageMetrics }> {
  const session = new DebuggerSession(tabId);
  const attempts: Array<{
    scale: number;
    paperWidth: number;
    paperHeight: number;
    pageCount?: number;
    durationMs: number;
  }> = [];
  try {
    await session.attach();
    await session.send("Page.enable");
    await session.send("Emulation.setEmulatedMedia", { media: "screen" });
    const metrics = normalizeMetrics(await session.send<LayoutMetricsResponse>("Page.getLayoutMetrics"));
    validatePreparedMetrics(metrics, prepared);
    const printPlan = createPrintPlan(metrics);
    if (!printPlan) {
      throw userError("errorWebpageTooLarge", [
        String(Math.round(metrics.width)),
        String(Math.round(metrics.height)),
        String(MAX_PAPER_INCHES)
      ]);
    }

    const { scale, paperWidth } = printPlan;
    let lastPageCount: number | undefined;

    for (const paperHeight of printPlan.paperHeights) {
      const startedAt = performance.now();
      const result = await session.send<PrintResponse>("Page.printToPDF", {
        paperWidth,
        paperHeight,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        printBackground: true,
        displayHeaderFooter: false,
        preferCSSPageSize: false,
        scale,
        transferMode: "ReturnAsStream"
      });
      if (!result.stream) throw userError("errorMissingPdfStream");
      const pdf = await readPdfStream(session, result.stream);
      lastPageCount = countPdfPages(pdf);
      attempts.push({
        scale,
        paperWidth,
        paperHeight,
        pageCount: lastPageCount,
        durationMs: Math.round(performance.now() - startedAt)
      });
      if (lastPageCount === undefined) {
        throw userError("errorUnverifiedPageCount");
      }
      if (isAcceptablePageCount(printPlan, lastPageCount)) return { pdf, metrics };
    }

    console.info("Save Web as PDF print attempts", {
      printMode: printPlan.mode,
      estimatedPageCount: printPlan.estimatedPageCount,
      captureMode: prepared.captureMode,
      prepared: prepared.diagnostics.prepared,
      measured: metrics,
      attempts
    });
    const inaccessibleStyles = prepared.diagnostics.inaccessibleStyleSheets;
    const pageCount = lastPageCount === undefined ? "?" : String(lastPageCount);
    throw userError(inaccessibleStyles > 0 ? "errorMultiplePagesCrossOrigin" : "errorMultiplePages", pageCount);
  } finally {
    try {
      await session.send("Emulation.setEmulatedMedia", { media: "" });
    } catch {
      // Detach still runs if the tab closed or emulation restoration failed.
    }
    await session.detach();
  }
}
