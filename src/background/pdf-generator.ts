import { MAX_PAPER_INCHES, PDF_DPI } from "../shared/constants";
import type { PageMetrics } from "../shared/types";
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

function countPdfPages(pdf: Uint8Array): number | undefined {
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
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    throw new Error("Chrome could not measure this webpage.");
  }
  return { width: Math.ceil(size.width * 100) / 100, height: Math.ceil(size.height * 100) / 100 };
}

function validateSize({ width, height }: PageMetrics): void {
  const widthInches = width / PDF_DPI;
  const heightInches = height / PDF_DPI;
  if (widthInches > MAX_PAPER_INCHES || heightInches > MAX_PAPER_INCHES) {
    throw new Error(
      `This webpage is too long or wide to export as one continuous PDF page (${Math.round(width)} × ${Math.round(height)} CSS px). Chrome's safe single-page limit is ${MAX_PAPER_INCHES} inches.`
    );
  }
}

export async function generatePdf(tabId: number): Promise<{ pdf: Uint8Array; metrics: PageMetrics }> {
  const session = new DebuggerSession(tabId);
  try {
    await session.attach();
    await session.send("Page.enable");
    await session.send("Emulation.setEmulatedMedia", { media: "screen" });
    const metrics = normalizeMetrics(await session.send<LayoutMetricsResponse>("Page.getLayoutMetrics"));
    validateSize(metrics);

    const paperWidth = metrics.width / PDF_DPI + 0.01;
    const basePaperHeight = metrics.height / PDF_DPI;
    const roundingPadding = [0.01, 0.04, 0.1];
    let lastPageCount: number | undefined;

    for (const padding of roundingPadding) {
      const paperHeight = basePaperHeight + padding;
      if (paperHeight > MAX_PAPER_INCHES) break;
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
        scale: 1,
        transferMode: "ReturnAsStream"
      });
      if (!result.stream) throw new Error("Chrome did not return a PDF stream.");
      const pdf = await readPdfStream(session, result.stream);
      lastPageCount = countPdfPages(pdf);
      if (lastPageCount === 1) return { pdf, metrics };
      if (lastPageCount === undefined) {
        throw new Error("Chrome returned a PDF whose page count could not be verified. No unverified file was saved.");
      }
    }

    throw new Error(
      `Chrome produced ${lastPageCount ?? "multiple"} PDF pages after rounding retries. No screenshot or automatic pagination fallback was used.`
    );
  } finally {
    try {
      await session.send("Emulation.setEmulatedMedia", { media: "" });
    } catch {
      // Detach still runs if the tab closed or emulation restoration failed.
    }
    await session.detach();
  }
}
