import { PDFDocument, PDFString, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

// PDF viewers commonly reject page dimensions above 14,400 user units (200 inches).
const MAX_PAGE_POINTS = 14_400;
const MARGIN_POINTS = 10;
const LINE_GAP_POINTS = 3;
const MAX_FONT_SIZE = 8;
const MIN_FONT_SIZE = 4;
const BOX_TOLERANCE_POINTS = 0.02;

export interface SourceFooter {
  url: string;
  savedAt: number;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function formatFooterTimestamp(timestamp: number, offsetMinutes = -new Date(timestamp).getTimezoneOffset()): string {
  const local = new Date(timestamp + offsetMinutes * 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absoluteOffset = Math.abs(offsetMinutes);
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ` +
    `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())} ` +
    `UTC${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`
  );
}

// The footer uses a standard PDF font (WinAnsi), so keep its text printable ASCII.
function asciiText(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, "?");
}

export function sourceFooterLines(footer: SourceFooter): [string, string] {
  return [asciiText(`Source: ${footer.url}`), asciiText(`Saved: ${formatFooterTimestamp(footer.savedAt)}`)];
}

function fitLine(font: PDFFont, text: string, fontSize: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && font.widthOfTextAtSize(`${text.slice(0, end)}...`, fontSize) > maxWidth) end -= 1;
  return `${text.slice(0, end)}...`;
}

function chooseFontSize(font: PDFFont, lines: string[], maxWidth: number): number {
  const widest = Math.max(...lines.map((line) => font.widthOfTextAtSize(line, 1)));
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, maxWidth / widest));
}

function approxEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= BOX_TOLERANCE_POINTS;
}

type Box = { x: number; y: number; width: number; height: number };

function sameBox(left: Box, right: Box): boolean {
  return (
    approxEqual(left.x, right.x) &&
    approxEqual(left.y, right.y) &&
    approxEqual(left.width, right.width) &&
    approxEqual(left.height, right.height)
  );
}

function canExtendDownward(page: PDFPage, bandHeight: number): boolean {
  const media = page.getMediaBox();
  return (
    page.getRotation().angle % 360 === 0 &&
    sameBox(media, page.getCropBox()) &&
    media.height + bandHeight <= MAX_PAGE_POINTS
  );
}

function extendDownward(page: PDFPage, bandHeight: number): Box {
  const media = page.getMediaBox();
  const extended = { x: media.x, y: media.y - bandHeight, width: media.width, height: media.height + bandHeight };
  for (const [box, setter] of [
    [page.getBleedBox(), page.setBleedBox.bind(page)],
    [page.getTrimBox(), page.setTrimBox.bind(page)],
    [page.getArtBox(), page.setArtBox.bind(page)]
  ] as const) {
    if (sameBox(media, box)) setter(extended.x, extended.y, extended.width, extended.height);
  }
  page.setMediaBox(extended.x, extended.y, extended.width, extended.height);
  page.setCropBox(extended.x, extended.y, extended.width, extended.height);
  return { x: media.x, y: extended.y, width: media.width, height: bandHeight };
}

function addUriLink(document: PDFDocument, page: PDFPage, rect: Box, uri: string): void {
  const annotation = document.context.register(
    document.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(uri) }
    })
  );
  page.node.addAnnot(annotation);
}

/**
 * Appends a two-line source/time footer below the last page's content. The last page is
 * extended downward when its boxes allow it; otherwise a short footer page is appended.
 */
export async function addSourceFooter(pdf: Uint8Array, footer: SourceFooter): Promise<Uint8Array> {
  const document = await PDFDocument.load(pdf, { updateMetadata: false });
  const lastPage = document.getPages().at(-1);
  if (!lastPage) throw new Error("source-footer-no-pages");

  const font = await document.embedFont(StandardFonts.Helvetica);
  const lines = sourceFooterLines(footer);
  const pageWidth = lastPage.getMediaBox().width;
  const maxTextWidth = Math.max(1, pageWidth - MARGIN_POINTS * 2);
  const fontSize = chooseFontSize(font, lines, maxTextWidth);
  const lineHeight = fontSize + LINE_GAP_POINTS;
  const bandHeight = Math.ceil(MARGIN_POINTS * 2 + lineHeight + fontSize);

  let page: PDFPage;
  let band: Box;
  if (canExtendDownward(lastPage, bandHeight)) {
    page = lastPage;
    band = extendDownward(lastPage, bandHeight);
  } else {
    page = document.addPage([pageWidth, bandHeight]);
    band = { x: 0, y: 0, width: pageWidth, height: bandHeight };
  }

  page.drawRectangle({ x: band.x, y: band.y, width: band.width, height: band.height, color: rgb(1, 1, 1) });
  const textX = band.x + MARGIN_POINTS;
  const urlBaseline = band.y + MARGIN_POINTS + lineHeight;
  const color = rgb(0.4, 0.4, 0.4);
  const [urlLine, timeLine] = lines.map((line) => fitLine(font, line, fontSize, maxTextWidth));
  page.drawText(urlLine!, { x: textX, y: urlBaseline, size: fontSize, font, color });
  page.drawText(timeLine!, { x: textX, y: band.y + MARGIN_POINTS, size: fontSize, font, color });

  if (/^https?:\/\//i.test(footer.url)) {
    addUriLink(
      document,
      page,
      {
        x: textX,
        y: urlBaseline - fontSize * 0.25,
        width: font.widthOfTextAtSize(urlLine!, fontSize),
        height: fontSize * 1.2
      },
      footer.url
    );
  }

  return document.save({ addDefaultPage: false, objectsPerTick: 50, useObjectStreams: false });
}
