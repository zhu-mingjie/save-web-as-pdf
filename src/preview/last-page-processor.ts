import "../shared/browser-compat";
import {
  AnnotationMode,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, type PDFPage } from "pdf-lib";
import { calculateLastPageTrim } from "../shared/last-page-height";

const MAX_PDF_BYTES = 64 * 1024 * 1024;
const MAX_CANVAS_PIXELS = 4_000_000;
const TARGET_CANVAS_WIDTH = 768;
const RENDER_TIMEOUT_MS = 12_000;
const OPTIMIZATION_DEADLINE_MS = 20_000;
const PIXEL_ALPHA_THRESHOLD = 8;
const WHITE_BACKGROUND_MIN_CHANNEL = 248;
const WHITE_BACKGROUND_TOLERANCE = 3;
const BOX_TOLERANCE_POINTS = 0.02;
const RENDER_DIFF_TOLERANCE = 8;
const RENDER_DIFFERING_PIXEL_RATIO = 0.003;

type PageSnapshot = {
  view: number[];
  text?: string;
  annotations?: string;
};

export type LastPageOptimizationResult = {
  pdf: Uint8Array;
  status: "optimized" | "unchanged" | "fallback";
  reason: string;
  originalLastPageHeight?: number;
  optimizedLastPageHeight?: number;
};

// Both the display API and parser execute inside one dedicated outer worker.
// No child worker can outlive termination of the task. Legacy initializes its
// bundled compatibility implementations before any PDF API is invoked.
export function configurePdfResources(baseUrl: string): void {
  resourceBase = baseUrl;
}
let resourceBase = "";

// OffscreenCanvas cannot reference DOM/SVG filter elements. For detection use
// PDF.js's base filter behavior; complete image bounds remain included, including
// soft masks/shadows. The PDF streams themselves are never rendered/replaced.
class WorkerFilterFactory {
  addFilter(maps?: ArrayLike<ArrayLike<number>>) {
    if (maps && Array.from(maps).some(map => Array.from(map).some((value, index) => value !== index))) {
      throw new Error("unsupported-worker-transfer-filter");
    }
    return "none";
  }
  addHCMFilter() { return "none"; }
  addAlphaFilter() { return "none"; }
  addLuminosityFilter() { return "none"; }
  addKnockoutFilter() { return "none"; }
  destroy() {}
}

class WorkerCanvasFactory {
  create(width: number, height: number) {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("worker-canvas-unavailable");
    return { canvas, context };
  }
  reset(target: { canvas: OffscreenCanvas }, width: number, height: number) {
    target.canvas.width = width; target.canvas.height = height;
  }
  destroy(target: { canvas: OffscreenCanvas | null; context: unknown }) {
    if (target.canvas) target.canvas.width = target.canvas.height = 0;
    target.canvas = null; target.context = null;
  }
}

function approxEqual(left: number, right: number, tolerance = BOX_TOLERANCE_POINTS): boolean {
  return Math.abs(left - right) <= tolerance;
}

function sameBox(left: number[], right: number[]): boolean {
  return left.length === 4 && right.length === 4 && left.every((value, index) => approxEqual(value, right[index]!));
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeValue(entry)])
    );
  }
  return typeof value === "number" ? Number(value.toFixed(4)) : value;
}

function annotationFingerprint(annotations: Array<Record<string, unknown>>): string {
  const relevant = annotations.map((annotation) =>
    normalizeValue({
      annotationType: annotation.annotationType,
      subtype: annotation.subtype,
      rect: annotation.rect,
      url: annotation.url,
      unsafeUrl: annotation.unsafeUrl,
      dest: annotation.dest,
      action: annotation.action,
      contents: annotation.contentsObj ?? annotation.contents,
      fieldName: annotation.fieldName,
      fieldType: annotation.fieldType
    })
  );
  return JSON.stringify(relevant);
}

async function snapshotPage(page: PDFPageProxy, includeContent = true): Promise<PageSnapshot> {
  if (!includeContent) return { view: [...page.view] };
  const [textContent, annotations] = await Promise.all([
    page.getTextContent({ disableNormalization: true }),
    page.getAnnotations({ intent: "display" })
  ]);
  return {
    view: [...page.view],
    text: textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join("\u0000"),
    annotations: annotationFingerprint(annotations as Array<Record<string, unknown>>)
  };
}

function assertWithinDeadline(startedAt: number): void {
  if (performance.now() - startedAt > OPTIMIZATION_DEADLINE_MS) {
    throw new Error("last-page-optimization-timeout");
  }
}

function hasPdfEnvelope(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) return false;
  const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
  return tail.includes("%%EOF");
}

function createCanvas(width: number, height: number): OffscreenCanvas { return new OffscreenCanvas(width, height); }

async function renderPage(page: PDFPageProxy, scale: number): Promise<OffscreenCanvas> {
  const viewport = page.getViewport({ scale });
  const width = Math.max(1, Math.ceil(viewport.width));
  const height = Math.max(1, Math.ceil(viewport.height));
  if (width * height > MAX_CANVAS_PIXELS) throw new Error("last-page-canvas-budget");

  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("last-page-canvas-unavailable");
  const task = page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
    annotationMode: AnnotationMode.ENABLE,
    background: "rgba(0, 0, 0, 0)",
    recordImages: true
  });
  let timeoutId = 0;
  try {
    await Promise.race([
      task.promise,
      new Promise<never>((_, reject) => {
        timeoutId = globalThis.setTimeout(() => {
          task.cancel();
          reject(new Error("last-page-render-timeout"));
        }, RENDER_TIMEOUT_MS);
      })
    ]);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
  return canvas;
}

async function yieldToBrowser(): Promise<void> {
  const browserScheduler = (globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<void> };
  }).scheduler;
  if (browserScheduler?.yield) {
    await browserScheduler.yield();
    return;
  }
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
}

async function findPaintedContentBottom(canvas: OffscreenCanvas): Promise<number> {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("last-page-canvas-unavailable");
  const bottomStripHeight = Math.min(4, canvas.height);
  const bottomStrip = context.getImageData(0, canvas.height - bottomStripHeight, canvas.width, bottomStripHeight).data;
  let whitePageBackground = true;
  for (let offset = 0; offset < bottomStrip.length; offset += 4) {
    if (
      bottomStrip[offset]! < WHITE_BACKGROUND_MIN_CHANNEL ||
      bottomStrip[offset + 1]! < WHITE_BACKGROUND_MIN_CHANNEL ||
      bottomStrip[offset + 2]! < WHITE_BACKGROUND_MIN_CHANNEL ||
      bottomStrip[offset + 3]! <= PIXEL_ALPHA_THRESHOLD
    ) {
      whitePageBackground = false;
      break;
    }
  }
  const rowsPerChunk = 256;
  for (let chunkBottom = canvas.height; chunkBottom > 0; chunkBottom -= rowsPerChunk) {
    const top = Math.max(0, chunkBottom - rowsPerChunk);
    const height = chunkBottom - top;
    const pixels = context.getImageData(0, top, canvas.width, height).data;
    for (let row = height - 1; row >= 0; row -= 1) {
      const start = row * canvas.width * 4 + 3;
      const end = start + canvas.width * 4;
      for (let alpha = start; alpha < end; alpha += 4) {
        const opacity = pixels[alpha]!;
        if (opacity <= PIXEL_ALPHA_THRESHOLD) continue;
        if (
          whitePageBackground &&
          opacity > PIXEL_ALPHA_THRESHOLD &&
          pixels[alpha - 3]! >= 255 - WHITE_BACKGROUND_TOLERANCE &&
          pixels[alpha - 2]! >= 255 - WHITE_BACKGROUND_TOLERANCE &&
          pixels[alpha - 1]! >= 255 - WHITE_BACKGROUND_TOLERANCE
        ) {
          continue;
        }
        return top + row + 1;
      }
    }
    await yieldToBrowser();
  }
  return 0;
}

function includeImageBottom(page: PDFPageProxy, canvas: OffscreenCanvas, paintedBottom: number): number {
  const coordinates = page.imageCoordinates as ArrayLike<number> | null;
  if (!coordinates || coordinates.length % 6 !== 0) return paintedBottom;
  let contentBottom = paintedBottom;
  for (let offset = 0; offset < coordinates.length; offset += 6) {
    const bottom = Math.max(coordinates[offset + 1]!, coordinates[offset + 3]!, coordinates[offset + 5]!);
    if (Number.isFinite(bottom)) contentBottom = Math.max(contentBottom, bottom * canvas.height);
  }
  return Math.min(canvas.height, Math.max(0, contentBottom));
}

async function includeAnnotationBottom(page: PDFPageProxy, scale: number, paintedBottom: number): Promise<number> {
  const viewport = page.getViewport({ scale });
  const annotations = (await page.getAnnotations({ intent: "display" })) as Array<{ rect?: number[] }>;
  let contentBottom = paintedBottom;
  for (const annotation of annotations) {
    if (!annotation.rect || annotation.rect.length !== 4) continue;
    const [x1, y1, x2, y2] = annotation.rect;
    if (![x1, y1, x2, y2].every(Number.isFinite)) throw new Error("last-page-invalid-annotation");
    const corners = [
      viewport.convertToViewportPoint(x1!, y1!),
      viewport.convertToViewportPoint(x1!, y2!),
      viewport.convertToViewportPoint(x2!, y1!),
      viewport.convertToViewportPoint(x2!, y2!)
    ];
    contentBottom = Math.max(contentBottom, ...corners.map((corner) => corner[1]));
  }
  return Math.min(viewport.height, Math.max(0, contentBottom));
}

function boxesMatch(page: PDFPage): boolean {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  return (
    approxEqual(media.x, crop.x) &&
    approxEqual(media.y, crop.y) &&
    approxEqual(media.width, crop.width) &&
    approxEqual(media.height, crop.height)
  );
}

function updateMatchingOptionalBox(
  original: { x: number; y: number; width: number; height: number },
  optional: { x: number; y: number; width: number; height: number },
  setter: (x: number, y: number, width: number, height: number) => void,
  bottomTrimPoints: number
): void {
  if (
    approxEqual(original.x, optional.x) &&
    approxEqual(original.y, optional.y) &&
    approxEqual(original.width, optional.width) &&
    approxEqual(original.height, optional.height)
  ) {
    setter(original.x, original.y + bottomTrimPoints, original.width, original.height - bottomTrimPoints);
  }
}

async function rewriteLastPage(pdf: Uint8Array, bottomTrimPoints: number): Promise<Uint8Array> {
  const document = await PDFDocument.load(pdf, { updateMetadata: false });
  const page = document.getPages().at(-1);
  if (!page || page.getRotation().angle % 360 !== 0 || !boxesMatch(page)) {
    throw new Error("last-page-unsupported-boxes");
  }
  const media = page.getMediaBox();
  if (bottomTrimPoints <= 0 || bottomTrimPoints >= media.height) throw new Error("last-page-invalid-trim");
  updateMatchingOptionalBox(media, page.getBleedBox(), page.setBleedBox.bind(page), bottomTrimPoints);
  updateMatchingOptionalBox(media, page.getTrimBox(), page.setTrimBox.bind(page), bottomTrimPoints);
  updateMatchingOptionalBox(media, page.getArtBox(), page.setArtBox.bind(page), bottomTrimPoints);
  page.setMediaBox(media.x, media.y + bottomTrimPoints, media.width, media.height - bottomTrimPoints);
  page.setCropBox(media.x, media.y + bottomTrimPoints, media.width, media.height - bottomTrimPoints);
  return document.save({ addDefaultPage: false, objectsPerTick: 50, useObjectStreams: false });
}

function chooseRenderScale(page: PDFPageProxy): number {
  const baseViewport = page.getViewport({ scale: 1 });
  const widthScale = Math.min(1, TARGET_CANVAS_WIDTH / baseViewport.width);
  // Leave headroom for integer canvas rounding at both dimensions.
  const pixelScale = Math.sqrt(MAX_CANVAS_PIXELS / (baseViewport.width * baseViewport.height)) * 0.98;
  return Math.min(widthScale, pixelScale);
}

function canvasDifferenceRatio(original: OffscreenCanvas, optimized: OffscreenCanvas): number {
  if (original.width !== optimized.width || optimized.height > original.height) return 1;
  const originalContext = original.getContext("2d", { willReadFrequently: true });
  const optimizedContext = optimized.getContext("2d", { willReadFrequently: true });
  if (!originalContext || !optimizedContext) return 1;
  const left = originalContext.getImageData(0, 0, optimized.width, optimized.height).data;
  const right = optimizedContext.getImageData(0, 0, optimized.width, optimized.height).data;
  let differingPixels = 0;
  for (let offset = 0; offset < left.length; offset += 4) {
    const leftAlpha = left[offset + 3]! / 255;
    const rightAlpha = right[offset + 3]! / 255;
    const leftRed = left[offset]! * leftAlpha + 255 * (1 - leftAlpha);
    const leftGreen = left[offset + 1]! * leftAlpha + 255 * (1 - leftAlpha);
    const leftBlue = left[offset + 2]! * leftAlpha + 255 * (1 - leftAlpha);
    const rightRed = right[offset]! * rightAlpha + 255 * (1 - rightAlpha);
    const rightGreen = right[offset + 1]! * rightAlpha + 255 * (1 - rightAlpha);
    const rightBlue = right[offset + 2]! * rightAlpha + 255 * (1 - rightAlpha);
    if (
      Math.abs(leftRed - rightRed) > RENDER_DIFF_TOLERANCE ||
      Math.abs(leftGreen - rightGreen) > RENDER_DIFF_TOLERANCE ||
      Math.abs(leftBlue - rightBlue) > RENDER_DIFF_TOLERANCE
    ) {
      differingPixels += 1;
    }
  }
  return differingPixels / (optimized.width * optimized.height);
}

function openPdf(pdf: Uint8Array) {
  return getDocument({
    data: pdf.slice(),
    stopAtErrors: true,
    maxImageSize: MAX_CANVAS_PIXELS,
    canvasMaxAreaInBytes: MAX_CANVAS_PIXELS * 4,
    isOffscreenCanvasSupported: true,
    isImageDecoderSupported: false,
    useWasm: false,
    useSystemFonts: false,
    ownerDocument: { fonts: (globalThis as unknown as { fonts: FontFaceSet }).fonts } as Document,
    CanvasFactory: WorkerCanvasFactory,
    FilterFactory: WorkerFilterFactory,
    useWorkerFetch: true,
    cMapUrl: `${resourceBase}vendor/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${resourceBase}vendor/standard_fonts/`
  });
}

async function validateRewrite(
  originalDocument: PDFDocumentProxy,
  originalSnapshots: PageSnapshot[],
  originalCanvas: OffscreenCanvas,
  optimizedPdf: Uint8Array,
  scale: number,
  expectedHeight: number,
  startedAt: number
): Promise<string | null> {
  const loadingTask = openPdf(optimizedPdf);
  try {
    const optimizedDocument = await loadingTask.promise;
    if (optimizedDocument.numPages !== originalDocument.numPages) return "page-count";
    for (let pageNumber = 1; pageNumber <= optimizedDocument.numPages; pageNumber += 1) {
      assertWithinDeadline(startedAt);
      const page = await optimizedDocument.getPage(pageNumber);
      const isLastPage = pageNumber === optimizedDocument.numPages;
      const snapshot = await snapshotPage(page, isLastPage);
      const original = originalSnapshots[pageNumber - 1]!;
      if (!isLastPage && !sameBox(snapshot.view, original.view)) return "earlier-page-box";
      if (isLastPage) {
        if (snapshot.text !== original.text) return "last-page-text";
        if (snapshot.annotations !== original.annotations) return "last-page-annotations";
        const originalWidth = original.view[2]! - original.view[0]!;
        const optimizedWidth = snapshot.view[2]! - snapshot.view[0]!;
        const optimizedHeight = snapshot.view[3]! - snapshot.view[1]!;
        if (!approxEqual(originalWidth, optimizedWidth)) return "last-page-width";
        if (!approxEqual(optimizedHeight, expectedHeight)) return "last-page-height";
        const optimizedCanvas = await renderPage(page, scale);
        const differenceRatio = canvasDifferenceRatio(originalCanvas, optimizedCanvas);
        if (differenceRatio > RENDER_DIFFERING_PIXEL_RATIO) {
          return `last-page-render-${differenceRatio.toFixed(6)}`;
        }
      }
    }
    const bytes = await optimizedDocument.getData();
    return hasPdfEnvelope(bytes) ? null : "pdf-envelope";
  } finally {
    await loadingTask.destroy();
  }
}

export async function processLastPageHeight(pdf: Uint8Array, allowSinglePage = false, remainingBudgetMs = OPTIMIZATION_DEADLINE_MS): Promise<LastPageOptimizationResult> {
  if (pdf.byteLength > MAX_PDF_BYTES) return { pdf, status: "fallback", reason: "pdf-size-budget" };
  // Reuse the client deadline: initialization already consumed part of this budget.
  const startedAt = performance.now() - (OPTIMIZATION_DEADLINE_MS - Math.min(OPTIMIZATION_DEADLINE_MS, remainingBudgetMs));
  let loadingTask: ReturnType<typeof openPdf> | undefined;
  try {
    assertWithinDeadline(startedAt);
    loadingTask = openPdf(pdf);
    const document = await loadingTask.promise;
    if (document.numPages <= 1 && !allowSinglePage) return { pdf, status: "unchanged", reason: "single-page" };

    const snapshots: PageSnapshot[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      assertWithinDeadline(startedAt);
      const page = await document.getPage(pageNumber);
      snapshots.push(await snapshotPage(page, pageNumber === document.numPages));
    }
    const lastPage = await document.getPage(document.numPages);
    if (lastPage.rotate % 360 !== 0 || lastPage.userUnit !== 1) {
      return { pdf, status: "fallback", reason: "unsupported-page-transform" };
    }
    const scale = chooseRenderScale(lastPage);
    if (!Number.isFinite(scale) || scale <= 0) return { pdf, status: "fallback", reason: "canvas-budget" };
    const originalCanvas = await renderPage(lastPage, scale);
    const paintedBottom = await findPaintedContentBottom(originalCanvas);
    const imageBottom = includeImageBottom(lastPage, originalCanvas, paintedBottom);
    const contentBottom = await includeAnnotationBottom(lastPage, scale, imageBottom);
    const pageHeight = lastPage.view[3]! - lastPage.view[1]!;
    const trim = calculateLastPageTrim(pageHeight, contentBottom, originalCanvas.height, scale);
    if (!trim) {
      return { pdf, status: "unchanged", reason: "no-safe-space-to-trim", originalLastPageHeight: pageHeight };
    }

    const optimizedPdf = await rewriteLastPage(pdf, trim.bottomTrimPoints);
    const validationFailure = await validateRewrite(
      document,
      snapshots,
      originalCanvas,
      optimizedPdf,
      scale,
      trim.newHeightPoints,
      startedAt
    );
    if (validationFailure) {
      return { pdf, status: "fallback", reason: `post-write-validation-${validationFailure}` };
    }
    return {
      pdf: optimizedPdf,
      status: "optimized",
      reason: "last-page-shortened",
      originalLastPageHeight: pageHeight,
      optimizedLastPageHeight: trim.newHeightPoints
    };
  } catch (error) {
    console.warn("Last-page height optimization kept the original PDF.", error);
    return { pdf, status: "fallback", reason: `optimizer-error:${error instanceof Error ? error.message : "unknown"}` };
  } finally {
    await loadingTask?.destroy().catch(() => undefined);
  }
}
