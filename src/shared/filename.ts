import type { SourcePageMetadata } from "./types";

const PDF_EXTENSION = ".pdf";
const MAX_FILENAME_UTF8_BYTES = 180;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const INVISIBLE_FORMATTING = /[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;
const WINDOWS_1252_BYTES = new Map<string, number>([
  ["€", 0x80], ["‚", 0x82], ["ƒ", 0x83], ["„", 0x84], ["…", 0x85], ["†", 0x86],
  ["‡", 0x87], ["ˆ", 0x88], ["‰", 0x89], ["Š", 0x8a], ["‹", 0x8b], ["Œ", 0x8c],
  ["Ž", 0x8e], ["‘", 0x91], ["’", 0x92], ["“", 0x93], ["”", 0x94], ["•", 0x95],
  ["–", 0x96], ["—", 0x97], ["˜", 0x98], ["™", 0x99], ["š", 0x9a], ["›", 0x9b],
  ["œ", 0x9c], ["ž", 0x9e], ["Ÿ", 0x9f]
]);

function decodePercentEncodedTitle(value: string): string {
  if ((value.match(/%[0-9a-f]{2}/gi) ?? []).length < 2) return value;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.includes("\ufffd") ? value : decoded;
  } catch {
    return value;
  }
}

function decodeUtf8Mojibake(value: string): string {
  const characters = [...value];
  let decoded = "";
  let repaired = false;
  const asByte = (character: string): number | undefined => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0xff ? codePoint : WINDOWS_1252_BYTES.get(character);
  };

  for (let index = 0; index < characters.length; index += 1) {
    const lead = asByte(characters[index]!);
    const length = lead !== undefined && lead >= 0xc2 && lead <= 0xdf
      ? 2
      : lead !== undefined && lead >= 0xe0 && lead <= 0xef
        ? 3
        : lead !== undefined && lead >= 0xf0 && lead <= 0xf4
          ? 4
          : 0;
    if (length > 0 && index + length <= characters.length) {
      const sequence = characters.slice(index, index + length).map(asByte);
      if (sequence.every((byte, offset) => byte !== undefined && (offset === 0 || (byte >= 0x80 && byte <= 0xbf)))) {
        try {
          decoded += new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(sequence as number[]));
          index += length - 1;
          repaired = true;
          continue;
        } catch {
          // Preserve the original characters when this byte sequence is not valid UTF-8.
        }
      }
    }
    decoded += characters[index]!;
  }
  return repaired ? decoded : value;
}

export function normalizePageTitle(pageTitle: string | undefined): string {
  if (!pageTitle) return "";
  const decoded = decodeUtf8Mojibake(decodePercentEncodedTitle(pageTitle));
  return decoded.normalize("NFC").replace(INVISIBLE_FORMATTING, "").replace(/\s+/g, " ").trim();
}

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
  const title = normalizePageTitle(pageTitle) || hostnameFromUrl(pageUrl) || "webpage";
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
  const title = normalizePageTitle(pageTitle);
  const url = privacySafeUrl(pageUrl);
  return {
    title,
    url,
    hostname: hostnameFromUrl(url),
    filename: createPdfFilename(title, url)
  };
}

export function createLiveSourcePageMetadata(
  capturedMetadata: SourcePageMetadata,
  livePageTitle: string | undefined,
  livePageUrl?: string
): SourcePageMetadata {
  const title = normalizePageTitle(livePageTitle) || normalizePageTitle(capturedMetadata.title);
  return createSourcePageMetadata(title, livePageUrl || capturedMetadata.url);
}
