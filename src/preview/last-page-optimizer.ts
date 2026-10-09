import type { LastPageOptimizationResult } from "./last-page-processor";
export type { LastPageOptimizationResult } from "./last-page-processor";
export interface OptimizationOptions { allowSinglePage?: boolean; signal?: AbortSignal; timeoutMs?: number }
export const OPTIMIZATION_TIMEOUT_MS = 20_000;

export function optimizeLastPageHeight(pdf: Uint8Array, options: OptimizationOptions = {}): Promise<LastPageOptimizationResult> {
  const startedAt = performance.now();
  if (options.signal?.aborted) return Promise.reject(new DOMException("Export canceled", "AbortError"));
  if (pdf.byteLength > 64 * 1024 * 1024) return Promise.resolve({ pdf, status: "fallback", reason: "pdf-size-budget" });
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); }
    };
    const finish = (result: LastPageOptimizationResult) => {
      if (settled) return; settled = true; cleanup(); resolve(result);
    };
    const cancel = () => {
      if (settled) return; settled = true; cleanup(); reject(new DOMException("Export canceled", "AbortError"));
    };
    options.signal?.addEventListener("abort", cancel, { once: true });
    const deadlineAt = performance.timeOrigin + startedAt + (options.timeoutMs ?? OPTIMIZATION_TIMEOUT_MS);
    const remaining = Math.max(0, deadlineAt - (performance.timeOrigin + performance.now()));
    timer = setTimeout(() => finish({ pdf, status: "fallback", reason: "optimization-deadline" }), remaining);
    try {
      worker = new Worker(chrome.runtime.getURL("preview/optimizer-worker.js"), { type: "module" });
      const taskId = crypto.randomUUID();
      worker.onmessage = event => {
        if (event.data?.taskId !== taskId || settled) return;
        if (event.data.error || !event.data.result?.pdf) finish({ pdf, status: "fallback", reason: `worker-error:${event.data.error ?? "invalid-result"}` });
        else finish(event.data.result);
      };
      worker.onerror = event => { event.preventDefault(); finish({ pdf, status: "fallback", reason: "worker-initialization-failed" }); };
      const copy = pdf.slice(); // Retain the valid original if the task fails.
      worker.postMessage({ taskId, pdf: copy, baseUrl: chrome.runtime.getURL(""), allowSinglePage: options.allowSinglePage === true, deadlineAt }, [copy.buffer]);
    } catch (error) {
      console.warn("PDF optimizer initialization failed", error);
      finish({ pdf, status: "fallback", reason: "worker-initialization-failed" });
    }
  });
}
