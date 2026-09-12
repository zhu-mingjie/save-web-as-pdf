import type { CaptureMode } from "../shared/types";

const VIEWPORT_UNIT_PATTERN = /(?:^|[^a-z])[-+]?(?:\d*\.)?\d+(?:dvh|svh|lvh|vh)\b/i;
const ZHIHU_ANSWER_URL = /^https:\/\/(?:www\.)?zhihu\.com\/question\/\d+\/answer\/(\d+)(?:[/?#]|$)/i;

export function hasViewportUnitToken(value: string): boolean {
  return VIEWPORT_UNIT_PATTERN.test(value);
}

export function extractZhihuAnswerId(url: string): string | undefined {
  return url.match(ZHIHU_ANSWER_URL)?.[1];
}

export function defaultCaptureMode(url: string): CaptureMode {
  if (extractZhihuAnswerId(url)) return "zhihu-answer";
  try {
    return /^(?:www\.)?zhihu\.com$/i.test(new URL(url).hostname) ? "loaded-snapshot" : "full-page";
  } catch {
    return "full-page";
  }
}
