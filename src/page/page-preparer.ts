import {
  MAX_HEIGHT_GROWTH_ITERATIONS,
  MAX_PAGE_HEIGHT_PX,
  MAX_SCROLL_ITERATIONS,
  RESOURCE_WAIT_TIMEOUT_MS
} from "../shared/constants";
import type { PrepareResult } from "../shared/types";
import { hasPageState, setPageState, takePageState } from "./page-state";

function throwIfCanceled(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Export canceled.");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Export canceled."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, signal: AbortSignal): Promise<T | undefined> {
  return Promise.race([promise, sleep(ms, signal).then(() => undefined)]);
}

function documentHeight(): number {
  const body = document.body;
  const root = document.documentElement;
  return Math.max(
    root.scrollHeight,
    root.offsetHeight,
    root.clientHeight,
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0
  );
}

async function preScroll(signal: AbortSignal): Promise<void> {
  throwIfCanceled(signal);
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  await sleep(80, signal);

  let position = 0;
  let lastHeight = documentHeight();
  let growthCount = 0;

  for (let iteration = 0; iteration < MAX_SCROLL_ITERATIONS; iteration += 1) {
    throwIfCanceled(signal);
    const height = documentHeight();
    if (height > MAX_PAGE_HEIGHT_PX) break;

    position = Math.min(position + Math.max(480, window.innerHeight * 0.85), height);
    window.scrollTo({ top: position, left: 0, behavior: "instant" });
    await sleep(65, signal);

    const nextHeight = documentHeight();
    if (nextHeight > lastHeight + 2) {
      growthCount += 1;
      lastHeight = nextHeight;
      if (growthCount >= MAX_HEIGHT_GROWTH_ITERATIONS) break;
    }

    if (position + window.innerHeight >= nextHeight) {
      await sleep(180, signal);
      const settledHeight = documentHeight();
      if (settledHeight <= nextHeight + 2) break;
      lastHeight = settledHeight;
    }
  }
}

async function waitForResources(signal: AbortSignal): Promise<void> {
  const fonts = "fonts" in document ? document.fonts.ready.then(() => undefined) : Promise.resolve();
  const images = Array.from(document.images)
    .filter((image) => !image.complete)
    .map(
      (image) =>
        new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        })
    );
  await withTimeout(Promise.all([fonts, ...images]).then(() => undefined), RESOURCE_WAIT_TIMEOUT_MS, signal);
  throwIfCanceled(signal);
}

export async function preparePage(signal: AbortSignal): Promise<PrepareResult> {
  if (hasPageState()) await cleanupPage();

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const styleElement = document.createElement("style");
  styleElement.dataset.swpPreparation = "true";
  styleElement.textContent = `
    html, body {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    *, *::before, *::after {
      animation-play-state: paused !important;
      transition-property: none !important;
      caret-color: transparent !important;
    }
  `;
  (document.head ?? document.documentElement).append(styleElement);
  setPageState({ scrollX, scrollY, styleElement });

  try {
    await preScroll(signal);
    await waitForResources(signal);
    window.scrollTo({ top: scrollY, left: scrollX, behavior: "instant" });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    return {
      width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
      height: documentHeight(),
      title: document.title,
      url: location.href
    };
  } catch (error) {
    await cleanupPage();
    throw error;
  }
}

export async function cleanupPage(): Promise<void> {
  const state = takePageState();
  if (!state) return;
  state.styleElement.remove();
  window.scrollTo({ top: state.scrollY, left: state.scrollX, behavior: "instant" });
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
