export const WEBSITE_URL = "https://miengieh.com/";
export const SUPPORT_URL = "https://buy.stripe.com/00wdRbedhaXG55x2I7gYU00";
export const GITHUB_URL = "https://github.com/zhu-mingjie/save-web-as-pdf";

// Set this after the Chrome Web Store listing has a stable review URL.
export const CHROME_WEB_STORE_REVIEW_URL = "";

export function safeExternalUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}
