import {
  LAYOUT_STABILITY_SAMPLE_MS,
  LAYOUT_STABILITY_TIMEOUT_MS,
  LAYOUT_STABILITY_TOLERANCE_PX,
  LAYOUT_STABLE_SAMPLE_COUNT,
  MAX_CAPTURE_GROWTH_RATIO,
  MAX_CAPTURE_GROWTH_VIEWPORTS,
  MAX_PAGE_HEIGHT_PX,
  MAX_SCROLL_ITERATIONS,
  PREPARATION_TIMEOUT_MS,
  RESOURCE_WAIT_TIMEOUT_MS
} from "../shared/constants";
import type {
  CaptureMode,
  PageMetrics,
  PreparationDiagnostics,
  PreparationStopReason,
  PrepareResult
} from "../shared/types";
import type { PagePreparationState } from "./page-state";
import { hasPageState, setPageState, takePageState } from "./page-state";
import { defaultCaptureMode, extractZhihuAnswerId, hasViewportUnitToken } from "./capture-rules";

const VIEWPORT_LAYOUT_PROPERTIES = [
  "height",
  "min-height",
  "max-height",
  "block-size",
  "min-block-size",
  "max-block-size",
  "flex-basis",
  "padding-top",
  "padding-bottom",
  "padding-block-start",
  "padding-block-end",
  "margin-top",
  "margin-bottom",
  "margin-block-start",
  "margin-block-end",
  "row-gap",
  "top",
  "bottom",
  "inset-block-start",
  "inset-block-end"
] as const;

interface CapturePlan {
  mode: CaptureMode;
  label: string;
  resourceRoots: ParentNode[];
  scrollTarget: Element | null;
  hiddenBranches: number;
}

interface ScrollResult {
  stopReason: PreparationStopReason;
  observedGrowth: number;
}

interface StabilityResult {
  stable: boolean;
  stableSamples: number;
  metrics: PageMetrics;
}

interface FreezeResult {
  frozen: number;
  inaccessibleStyleSheets: number;
}

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

async function yieldToBrowser(signal: AbortSignal): Promise<void> {
  throwIfCanceled(signal);
  const schedulerApi = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (schedulerApi?.yield) {
    await schedulerApi.yield();
    return;
  }
  await sleep(0, signal);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, signal: AbortSignal): Promise<T | undefined> {
  return Promise.race([promise, sleep(ms, signal).then(() => undefined)]);
}

function remainingPreparationTime(startedAt: number): number {
  return Math.max(0, PREPARATION_TIMEOUT_MS - (performance.now() - startedAt));
}

function throwIfPreparationTimedOut(startedAt: number): void {
  if (remainingPreparationTime(startedAt) <= 0) {
    throw new Error("This page could not be prepared within the safe export time limit. No incomplete PDF was saved.");
  }
}

function pageMetrics(): PageMetrics {
  const body = document.body;
  const root = document.documentElement;
  return {
    width: Math.max(root.scrollWidth, root.offsetWidth, root.clientWidth, body?.scrollWidth ?? 0, body?.offsetWidth ?? 0),
    height: Math.max(
      root.scrollHeight,
      root.offsetHeight,
      root.clientHeight,
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0
    )
  };
}

function elementDocumentBottom(element: Element): number {
  const rect = element.getBoundingClientRect();
  return Math.max(0, rect.bottom + window.scrollY);
}

function applyTemporaryStyle(
  state: PagePreparationState,
  element: HTMLElement,
  property: string,
  value: string
): void {
  const existing = state.styleChanges.find((change) => change.element === element && change.property === property);
  if (existing) {
    element.style.setProperty(property, value, "important");
    existing.appliedValue = value;
    return;
  }
  state.styleChanges.push({
    element,
    property,
    originalValue: element.style.getPropertyValue(property),
    originalPriority: element.style.getPropertyPriority(property),
    appliedValue: value,
    appliedPriority: "important"
  });
  element.style.setProperty(property, value, "important");
}

function applyTemporaryAttribute(
  state: PagePreparationState,
  element: Element,
  name: string,
  value: string
): void {
  const existing = state.attributeChanges.find((change) => change.element === element && change.name === name);
  if (existing) {
    element.setAttribute(name, value);
    existing.appliedValue = value;
    return;
  }
  state.attributeChanges.push({ element, name, originalValue: element.getAttribute(name), appliedValue: value });
  element.setAttribute(name, value);
}

function valueReferencesViewportUnit(value: string, element: Element, seen = new Set<string>()): boolean {
  if (hasViewportUnitToken(value)) return true;
  const variablePattern = /var\(\s*(--[\w-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = variablePattern.exec(value))) {
    const variable = match[1]!;
    if (seen.has(variable)) continue;
    seen.add(variable);
    const resolved = getComputedStyle(element).getPropertyValue(variable);
    if (resolved && valueReferencesViewportUnit(resolved, element, seen)) return true;
  }
  return false;
}

function freezeDeclaration(
  state: PagePreparationState,
  element: Element,
  declaration: CSSStyleDeclaration
): number {
  if (!(element instanceof HTMLElement)) return 0;
  const computed = getComputedStyle(element);
  let frozen = 0;
  for (const property of VIEWPORT_LAYOUT_PROPERTIES) {
    const declared = declaration.getPropertyValue(property);
    if (!declared || !valueReferencesViewportUnit(declared, element)) continue;
    const resolved = computed.getPropertyValue(property).trim();
    if (!/^-?(?:\d*\.)?\d+px$/i.test(resolved)) continue;
    const numeric = Number.parseFloat(resolved);
    if (!Number.isFinite(numeric) || numeric < 0) continue;
    applyTemporaryStyle(state, element, property, resolved);
    frozen += 1;
  }
  return frozen;
}

async function freezeViewportDependentSizing(
  state: PagePreparationState,
  signal: AbortSignal,
  startedAt: number
): Promise<FreezeResult> {
  let frozen = 0;
  let inaccessibleStyleSheets = 0;
  let deadline = performance.now() + 40;

  const visitRules = async (rules: CSSRuleList): Promise<void> => {
    for (const rule of Array.from(rules)) {
      throwIfCanceled(signal);
      throwIfPreparationTimedOut(startedAt);
      if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue;
      if (rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue;
      if (rule instanceof CSSStyleRule) {
        const hasCandidate = VIEWPORT_LAYOUT_PROPERTIES.some((property) => {
          const value = rule.style.getPropertyValue(property);
          return value.includes("var(") || hasViewportUnitToken(value);
        });
        if (!hasCandidate) continue;
        let matches: NodeListOf<Element>;
        try {
          matches = document.querySelectorAll(rule.selectorText);
        } catch {
          continue;
        }
        for (const element of Array.from(matches)) frozen += freezeDeclaration(state, element, rule.style);
      } else if ("cssRules" in rule) {
        try {
          await visitRules((rule as CSSGroupingRule).cssRules);
        } catch {
          // Some browser-managed rule groups cannot be inspected from an isolated world.
        }
      }
      if (performance.now() >= deadline) {
        await yieldToBrowser(signal);
        deadline = performance.now() + 40;
      }
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    throwIfPreparationTimedOut(startedAt);
    try {
      await visitRules(sheet.cssRules);
    } catch {
      inaccessibleStyleSheets += 1;
    }
  }

  for (const element of Array.from(document.querySelectorAll<HTMLElement>("[style]"))) {
    throwIfPreparationTimedOut(startedAt);
    frozen += freezeDeclaration(state, element, element.style);
    if (performance.now() >= deadline) {
      await yieldToBrowser(signal);
      deadline = performance.now() + 40;
    }
  }

  return { frozen, inaccessibleStyleSheets };
}

function containsAnswerId(element: Element, answerId: string): boolean {
  const exactIdPattern = new RegExp(`(?:^|[^0-9])${answerId}(?:[^0-9]|$)`);
  const candidates = [
    element,
    ...Array.from(
      element.querySelectorAll(
        '[data-zop], [data-za-extra-module], [data-id], [data-answer-id], [itemid], [id], [name], a[href*="/answer/"]'
      )
    )
  ];
  return candidates.some((candidate) =>
    Array.from(candidate.attributes).some((attribute) => exactIdPattern.test(attribute.value))
  );
}

function hideOutsideSelection(state: PagePreparationState, preserved: Element[]): number {
  let hidden = 0;
  const visit = (element: Element): void => {
    const insidePreserved = preserved.some((kept) => kept === element || kept.contains(element));
    if (insidePreserved) return;
    const containsPreserved = preserved.some((kept) => element.contains(kept));
    if (!containsPreserved) {
      if (element instanceof HTMLElement) {
        applyTemporaryStyle(state, element, "display", "none");
        hidden += 1;
      }
      return;
    }
    for (const child of Array.from(element.children)) visit(child);
  };
  for (const child of Array.from(document.body.children)) visit(child);
  return hidden;
}

function hideFixedInterface(state: PagePreparationState, root: ParentNode, preserved: Element[]): number {
  let hidden = 0;
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    const position = getComputedStyle(element).position;
    if (position !== "fixed" && position !== "sticky") continue;
    if (preserved.some((kept) => element === kept || element.contains(kept))) continue;
    applyTemporaryStyle(state, element, "display", "none");
    hidden += 1;
  }
  return hidden;
}

function findZhihuQuestionSection(title: Element, answer: Element): Element {
  const candidates = [
    title.closest(".QuestionHeader"),
    document.querySelector(".QuestionHeader"),
    title.closest("header")
  ];
  return candidates.find((candidate) => candidate?.contains(title) && !candidate.contains(answer)) ?? title;
}

function createCapturePlan(state: PagePreparationState): CapturePlan {
  const answerId = extractZhihuAnswerId(location.href);
  if (!answerId) {
    const mode = defaultCaptureMode(location.href);
    return {
      mode,
      label: mode === "loaded-snapshot" ? "Loaded-content snapshot" : "Full page",
      resourceRoots: [document],
      scrollTarget: null,
      hiddenBranches: 0
    };
  }

  const answerItems = Array.from(document.querySelectorAll(".AnswerItem"));
  const matches = answerItems.filter((item) => containsAnswerId(item, answerId));
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "The requested Zhihu answer could not be identified. Open the full answer and try again."
        : "The requested Zhihu answer matched more than one page section, so no PDF was saved."
    );
  }

  const answer = matches[0]!;
  if (answer.querySelector(".RichContent--collapsed")) {
    throw new Error("This Zhihu answer is collapsed. Expand the full answer before saving it.");
  }
  const title = document.querySelector(".QuestionHeader-title") ?? document.querySelector("h1");
  if (!title) throw new Error("The Zhihu question title could not be identified, so no PDF was saved.");
  const questionSection = findZhihuQuestionSection(title, answer);

  let hiddenBranches = hideOutsideSelection(state, [questionSection, answer]);
  hiddenBranches += hideFixedInterface(state, document.body, [questionSection, answer]);
  return {
    mode: "zhihu-answer",
    label: "Zhihu question and selected answer",
    resourceRoots: [questionSection, answer],
    scrollTarget: answer,
    hiddenBranches
  };
}

function imagesInRoots(roots: ParentNode[]): HTMLImageElement[] {
  return Array.from(new Set(roots.flatMap((root) => Array.from(root.querySelectorAll<HTMLImageElement>("img")))));
}

function eagerLoadImages(state: PagePreparationState, roots: ParentNode[]): void {
  for (const image of imagesInRoots(roots)) {
    applyTemporaryAttribute(state, image, "loading", "eager");
  }
}

async function preScroll(
  signal: AbortSignal,
  plan: CapturePlan,
  startedAt: number
): Promise<ScrollResult> {
  throwIfCanceled(signal);
  const initial = pageMetrics();
  const growthBudget = Math.max(
    window.innerHeight * MAX_CAPTURE_GROWTH_VIEWPORTS,
    initial.height * MAX_CAPTURE_GROWTH_RATIO
  );
  const genericBoundary = Math.min(MAX_PAGE_HEIGHT_PX, initial.height + growthBudget);
  let observedGrowth = 0;
  let lastHeight = initial.height;
  let position = plan.scrollTarget ? Math.max(0, plan.scrollTarget.getBoundingClientRect().top + window.scrollY) : 0;

  window.scrollTo({ top: position, left: 0, behavior: "instant" });
  await sleep(80, signal);

  if (plan.mode === "loaded-snapshot") {
    return { stopReason: "loaded-boundary", observedGrowth: 0 };
  }

  for (let iteration = 0; iteration < MAX_SCROLL_ITERATIONS; iteration += 1) {
    throwIfCanceled(signal);
    if (performance.now() - startedAt >= PREPARATION_TIMEOUT_MS) {
      return { stopReason: "time-limit", observedGrowth };
    }
    const metrics = pageMetrics();
    if (metrics.height > MAX_PAGE_HEIGHT_PX) return { stopReason: "height-limit", observedGrowth };

    const targetBottom = plan.scrollTarget ? elementDocumentBottom(plan.scrollTarget) : Math.min(metrics.height, genericBoundary);
    position = Math.min(position + Math.max(480, window.innerHeight * 0.85), targetBottom);
    window.scrollTo({ top: position, left: 0, behavior: "instant" });
    await sleep(80, signal);

    const nextHeight = pageMetrics().height;
    if (nextHeight > lastHeight + LAYOUT_STABILITY_TOLERANCE_PX) observedGrowth += 1;
    lastHeight = nextHeight;

    const updatedBottom = plan.scrollTarget ? elementDocumentBottom(plan.scrollTarget) : Math.min(nextHeight, genericBoundary);
    if (position + window.innerHeight >= updatedBottom - LAYOUT_STABILITY_TOLERANCE_PX) {
      await sleep(180, signal);
      const settledBottom = plan.scrollTarget
        ? elementDocumentBottom(plan.scrollTarget)
        : Math.min(pageMetrics().height, genericBoundary);
      if (position + window.innerHeight >= settledBottom - LAYOUT_STABILITY_TOLERANCE_PX) {
        const stopReason = plan.scrollTarget
          ? "target-bottom"
          : pageMetrics().height > genericBoundary
            ? "loaded-boundary"
            : "target-bottom";
        return { stopReason, observedGrowth };
      }
    }
  }
  return { stopReason: "scroll-limit", observedGrowth };
}

async function waitForResources(roots: ParentNode[], signal: AbortSignal, timeoutMs: number): Promise<boolean> {
  const fonts = "fonts" in document ? document.fonts.ready.then(() => undefined) : Promise.resolve();
  const images = imagesInRoots(roots)
    .filter((image) => !image.complete)
    .map(
      (image) =>
        new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        })
    );
  const completed = await withTimeout(Promise.all([fonts, ...images]).then(() => true), timeoutMs, signal);
  throwIfCanceled(signal);
  return completed !== true;
}

async function waitForStableLayout(signal: AbortSignal, timeoutMs: number): Promise<StabilityResult> {
  const startedAt = performance.now();
  let previous = pageMetrics();
  let stableSamples = 0;
  while (performance.now() - startedAt < timeoutMs) {
    await sleep(LAYOUT_STABILITY_SAMPLE_MS, signal);
    const current = pageMetrics();
    const stable =
      Math.abs(current.width - previous.width) <= LAYOUT_STABILITY_TOLERANCE_PX &&
      Math.abs(current.height - previous.height) <= LAYOUT_STABILITY_TOLERANCE_PX;
    stableSamples = stable ? stableSamples + 1 : 0;
    if (stableSamples >= LAYOUT_STABLE_SAMPLE_COUNT) {
      return { stable: true, stableSamples, metrics: current };
    }
    previous = current;
  }
  return { stable: false, stableSamples, metrics: pageMetrics() };
}

export async function preparePage(signal: AbortSignal): Promise<PrepareResult> {
  if (hasPageState()) await cleanupPage();

  const startedAt = performance.now();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const initial = pageMetrics();
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
  const state: PagePreparationState = {
    scrollX,
    scrollY,
    styleElement,
    styleChanges: [],
    attributeChanges: []
  };
  setPageState(state);

  try {
    const plan = createCapturePlan(state);
    eagerLoadImages(state, plan.resourceRoots);
    const scroll = await preScroll(signal, plan, startedAt);
    throwIfPreparationTimedOut(startedAt);
    const resourceTimeout = Math.min(RESOURCE_WAIT_TIMEOUT_MS, remainingPreparationTime(startedAt));
    const resourceWaitTimedOut = await waitForResources(plan.resourceRoots, signal, resourceTimeout);
    throwIfPreparationTimedOut(startedAt);
    const freeze = await freezeViewportDependentSizing(state, signal, startedAt);
    window.scrollTo({ top: scrollY, left: scrollX, behavior: "instant" });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    throwIfPreparationTimedOut(startedAt);
    const stabilityTimeout = Math.min(LAYOUT_STABILITY_TIMEOUT_MS, remainingPreparationTime(startedAt));
    const stability = await waitForStableLayout(signal, stabilityTimeout);

    if (!stability.stable) {
      throw new Error("This page kept changing during preparation. Wait for it to finish loading and try again.");
    }
    if (scroll.stopReason === "height-limit") {
      throw new Error("This page exceeds the safe size limit for one continuous PDF page.");
    }
    if (scroll.stopReason === "time-limit" || scroll.stopReason === "scroll-limit") {
      throw new Error("This page could not be prepared within the safe export limit. No incomplete PDF was saved.");
    }

    const prepared = pageMetrics();
    const captureMode: CaptureMode =
      plan.mode === "full-page" && scroll.stopReason === "loaded-boundary" ? "loaded-snapshot" : plan.mode;
    const diagnostics: PreparationDiagnostics = {
      captureMode,
      stopReason: scroll.stopReason,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      initial,
      prepared,
      stableSamples: stability.stableSamples,
      observedGrowth: scroll.observedGrowth,
      viewportRulesFrozen: freeze.frozen,
      inaccessibleStyleSheets: freeze.inaccessibleStyleSheets,
      hiddenBranches: plan.hiddenBranches,
      resourceWaitTimedOut
    };
    console.info("Save Web as PDF preparation", diagnostics);

    return {
      width: prepared.width,
      height: prepared.height,
      title: document.title,
      url: location.href,
      captureMode,
      captureLabel: captureMode === plan.mode ? plan.label : "Loaded-content snapshot",
      diagnostics
    };
  } catch (error) {
    await cleanupPage();
    throw error;
  }
}

export async function cleanupPage(): Promise<void> {
  const state = takePageState();
  if (!state) return;

  for (const change of [...state.styleChanges].reverse()) {
    const currentValue = change.element.style.getPropertyValue(change.property);
    const currentPriority = change.element.style.getPropertyPriority(change.property);
    if (currentValue !== change.appliedValue || currentPriority !== change.appliedPriority) continue;
    if (change.originalValue) {
      change.element.style.setProperty(change.property, change.originalValue, change.originalPriority);
    } else {
      change.element.style.removeProperty(change.property);
    }
  }
  for (const change of [...state.attributeChanges].reverse()) {
    if (change.element.getAttribute(change.name) !== change.appliedValue) continue;
    if (change.originalValue === null) change.element.removeAttribute(change.name);
    else change.element.setAttribute(change.name, change.originalValue);
  }
  state.styleElement.remove();
  window.scrollTo({ top: state.scrollY, left: state.scrollX, behavior: "instant" });
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
