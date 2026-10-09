import type { PageMetrics } from "./types";

// Keep this function self-contained: the background also injects it to compare
// the prepared DOM with the current DOM, in the same coordinate system.
export function pageMetrics(): PageMetrics {
  const body = document.body;
  const root = document.documentElement;
  return {
    width: Math.max(root.scrollWidth, root.offsetWidth, root.clientWidth, body?.scrollWidth ?? 0, body?.offsetWidth ?? 0),
    height: Math.max(root.scrollHeight, root.offsetHeight, root.clientHeight, body?.scrollHeight ?? 0, body?.offsetHeight ?? 0)
  };
}
