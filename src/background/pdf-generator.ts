import { MAX_PAPER_INCHES, PDF_DPI } from "../shared/constants";
import { userError } from "../shared/i18n";
import type { PageMetrics, PrepareResult } from "../shared/types";
import { DebuggerSession } from "./debugger-session";
import { pageMetrics } from "../shared/page-metrics";

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

interface PrintSizing {
  scale: number;
  paperWidth: number;
  scaledHeight: number;
}

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

export function isCompletePdfDocument(pdf: Uint8Array): boolean {
  const header = [37, 80, 68, 70, 45];
  if (pdf.length < header.length || !header.every((byte, index) => pdf[index] === byte)) return false;

  const eof = [37, 37, 69, 79, 70];
  const start = Math.max(header.length, pdf.length - 2048);
  for (let index = pdf.length - eof.length; index >= start; index -= 1) {
    if (eof.every((byte, offset) => pdf[index + offset] === byte)) return true;
  }
  return false;
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

function createPrintSizing({ width, height }: PageMetrics): PrintSizing | undefined {
  const widthInches = width / PDF_DPI;
  const maximumContentWidth = MAX_PAPER_INCHES - PAPER_WIDTH_PADDING_INCHES;
  const requiredScale = Math.min(1, maximumContentWidth / widthInches);
  if (!Number.isFinite(requiredScale) || requiredScale < MIN_PRINT_SCALE) return undefined;

  return {
    scale: requiredScale,
    paperWidth: Math.min(MAX_PAPER_INCHES, widthInches * requiredScale + PAPER_WIDTH_PADDING_INCHES),
    scaledHeight: (height * requiredScale) / PDF_DPI
  };
}

export function createPrintPlan(metrics: PageMetrics): PrintPlan | undefined {
  const sizing = createPrintSizing(metrics);
  if (!sizing) return undefined;

  const { scale, paperWidth, scaledHeight } = sizing;
  const maximumSinglePageContentHeight = MAX_PAPER_INCHES - MAX_ROUNDING_PADDING_INCHES;
  const singlePage = scaledHeight <= maximumSinglePageContentHeight;
  const paperHeights = singlePage
    ? [0.01, 0.04, MAX_ROUNDING_PADDING_INCHES].map((padding) => scaledHeight + padding)
    : [MAX_PAPER_INCHES];

  return {
    mode: singlePage ? "single-page" : "paginated",
    scale,
    paperWidth,
    paperHeights,
    estimatedPageCount: singlePage ? 1 : Math.ceil(scaledHeight / MAX_PAPER_INCHES)
  };
}

export function createMaximumHeightPrintPlan(metrics: PageMetrics): PrintPlan | undefined {
  const sizing = createPrintSizing(metrics);
  if (!sizing) return undefined;
  return {
    mode: "paginated",
    scale: sizing.scale,
    paperWidth: sizing.paperWidth,
    paperHeights: [MAX_PAPER_INCHES],
    estimatedPageCount: Math.max(1, Math.ceil(sizing.scaledHeight / MAX_PAPER_INCHES))
  };
}

export function isAcceptablePageCount(plan: PrintPlan, pageCount: number): boolean {
  return pageCount >= 1 && (plan.mode === "paginated" || pageCount === 1);
}

async function validatePreparedMetrics(tabId: number, printMetrics: PageMetrics, prepared: PrepareResult): Promise<void> {
  // DOM offset/scroll sizes and CDP content sizes differ for scaled or clipped
  // bodies. Compare DOM with DOM; use CDP separately to size the printed PDF.
  const results = await chrome.scripting.executeScript({ target: { tabId }, func: pageMetrics });
  const measured = results.find((entry) => entry.frameId === 0)?.result;
  if (!measured || !Number.isFinite(measured.width) || !Number.isFinite(measured.height) ||
      measured.width <= 0 || measured.height <= 0) throw userError("errorMeasureWebpage");
  const heightTolerance = Math.max(8, prepared.height * 0.002);
  const widthTolerance = Math.max(4, prepared.width * 0.002);
  if (
    Math.abs(measured.height - prepared.height) > heightTolerance ||
    Math.abs(measured.width - prepared.width) > widthTolerance
  ) {
    console.info("Save Web as PDF layout changed", {
      prepared: { width: prepared.width, height: prepared.height }, current: measured, printMetrics
    });
    throw userError("errorLayoutChanged");
  }
}

export async function generatePdf(
  tabId: number,
  prepared: PrepareResult
): Promise<{ pdf: Uint8Array; metrics: PageMetrics; optimizeSinglePage: boolean; diagnostics: Record<string, unknown> }> {
  const session = new DebuggerSession(tabId);
  const attempts: Array<{
    phase: "initial" | "maximum-height-fallback";
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
    await validatePreparedMetrics(tabId, metrics, prepared);
    const initialPlan = createPrintPlan(metrics);
    if (!initialPlan) {
      throw userError("errorWebpageTooLarge", [
        String(Math.round(metrics.width)),
        String(Math.round(metrics.height)),
        String(MAX_PAPER_INCHES)
      ]);
    }

    const printWithPlan = async (
      printPlan: PrintPlan,
      phase: "initial" | "maximum-height-fallback"
    ): Promise<Uint8Array | undefined> => {
      const { scale, paperWidth } = printPlan;
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
        if (!isCompletePdfDocument(pdf)) throw userError("errorUnverifiedPageCount");
        const pageCount = countPdfPages(pdf);
        attempts.push({
          phase,
          scale,
          paperWidth,
          paperHeight,
          pageCount,
          durationMs: Math.round(performance.now() - startedAt)
        });
        if (pageCount === undefined) throw userError("errorUnverifiedPageCount");
        if (isAcceptablePageCount(printPlan, pageCount)) return pdf;
      }
      return undefined;
    };

    const initialPdf = await printWithPlan(initialPlan, "initial");
    if (initialPdf) return {
      pdf: initialPdf, metrics, optimizeSinglePage: initialPlan.mode === "paginated",
      diagnostics: { initialPlan, metrics, attempts, fallback: false }
    };

    const refreshedMetrics = normalizeMetrics(await session.send<LayoutMetricsResponse>("Page.getLayoutMetrics"));
    await validatePreparedMetrics(tabId, refreshedMetrics, prepared);
    const fallbackPlan = createMaximumHeightPrintPlan(refreshedMetrics);
    if (!fallbackPlan) {
      throw userError("errorWebpageTooLarge", [
        String(Math.round(refreshedMetrics.width)),
        String(Math.round(refreshedMetrics.height)),
        String(MAX_PAPER_INCHES)
      ]);
    }
    const fallbackPdf = await printWithPlan(fallbackPlan, "maximum-height-fallback");
    if (fallbackPdf) {
      console.info("Save Web as PDF print attempts", {
        initialPlan,
        finalPlan: fallbackPlan,
        fallbackReason: "single-page-plan-produced-multiple-pages",
        captureMode: prepared.captureMode,
        prepared: prepared.diagnostics.prepared,
        initialMeasured: metrics,
        refreshedMeasured: refreshedMetrics,
        attempts
      });
      return { pdf: fallbackPdf, metrics: refreshedMetrics, optimizeSinglePage: true,
        diagnostics: { initialPlan, finalPlan: fallbackPlan, refreshedMetrics, attempts, fallback: true } };
    }

    console.info("Save Web as PDF print attempts", {
      initialPlan,
      finalPlan: fallbackPlan,
      captureMode: prepared.captureMode,
      prepared: prepared.diagnostics.prepared,
      initialMeasured: metrics,
      refreshedMeasured: refreshedMetrics,
      attempts
    });
    throw userError("errorUnverifiedPageCount");
  } finally {
    try {
      await session.send("Emulation.setEmulatedMedia", { media: "" });
    } catch {
      // Detach still runs if the tab closed or emulation restoration failed.
    }
    await session.detach();
  }
}
