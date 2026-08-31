import {
  MAX_HEIGHT_GROWTH_ITERATIONS,
  MAX_PAGE_HEIGHT_PX,
  MAX_SCROLL_ITERATIONS,
  RESOURCE_WAIT_TIMEOUT_MS
} from "../shared/constants";
import type { PrepareResult } from "../shared/types";
import { hasPageState, setPageState, takePageState } from "./page-state";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise, sleep(ms).then(() => undefined)]);
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

async function preScroll(): Promise<void> {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  await sleep(80);

  let position = 0;
  let lastHeight = documentHeight();
  let growthCount = 0;

  for (let iteration = 0; iteration < MAX_SCROLL_ITERATIONS; iteration += 1) {
    const height = documentHeight();
    if (height > MAX_PAGE_HEIGHT_PX) break;

    position = Math.min(position + Math.max(480, window.innerHeight * 0.85), height);
    window.scrollTo({ top: position, left: 0, behavior: "instant" });
    await sleep(65);

    const nextHeight = documentHeight();
    if (nextHeight > lastHeight + 2) {
      growthCount += 1;
      lastHeight = nextHeight;
      if (growthCount >= MAX_HEIGHT_GROWTH_ITERATIONS) break;
    }

    if (position + window.innerHeight >= nextHeight) {
      await sleep(180);
      const settledHeight = documentHeight();
      if (settledHeight <= nextHeight + 2) break;
      lastHeight = settledHeight;
    }
  }
}

async function waitForResources(): Promise<void> {
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
  await withTimeout(Promise.all([fonts, ...images]).then(() => undefined), RESOURCE_WAIT_TIMEOUT_MS);
}

export async function preparePage(): Promise<PrepareResult> {
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
    [data-swp-extension-root="true"] {
      visibility: hidden !important;
    }
  `;
  (document.head ?? document.documentElement).append(styleElement);
  setPageState({ scrollX, scrollY, styleElement });

  try {
    await preScroll();
    await waitForResources();
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
