import type { SourcePageMetadata } from "./types";

const PDF_EXTENSION = ".pdf";
const MAX_FILENAME_UTF8_BYTES = 180;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function hostnameFromUrl(pageUrl?: string): string {
  if (!pageUrl) return "";
  try {
    return new URL(pageUrl).hostname.trim();
  } catch {
    return "";
  }
}

function privacySafeUrl(pageUrl?: string): string {
  if (!pageUrl) return "";
  try {
    const url = new URL(pageUrl);
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const character of value) {
    const size = encoder.encode(character).byteLength;
    if (bytes + size > maxBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}

export function createPdfFilename(pageTitle: string | undefined, pageUrl?: string): string {
  const title = pageTitle?.trim() || hostnameFromUrl(pageUrl) || "webpage";
  let base = title
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  if (!base) base = hostnameFromUrl(pageUrl) || "webpage";
  if (WINDOWS_RESERVED_NAME.test(base)) base = `_${base}`;
  base = truncateUtf8(base, MAX_FILENAME_UTF8_BYTES - PDF_EXTENSION.length).replace(/[. ]+$/g, "");
  return `${base || "webpage"}${PDF_EXTENSION}`;
}

export function createSourcePageMetadata(
  pageTitle: string | undefined,
  pageUrl?: string
): SourcePageMetadata {
  const url = privacySafeUrl(pageUrl);
  return {
    title: pageTitle?.trim() ?? "",
    url,
    hostname: hostnameFromUrl(url),
    filename: createPdfFilename(pageTitle, url)
  };
}
