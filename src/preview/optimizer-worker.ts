import "../shared/browser-compat";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { configurePdfResources, processLastPageHeight } from "./last-page-processor";

// PDF.js uses its loopback parser in this worker, not the UI thread. Terminating
// this single worker stops parsing, rendering, scanning AND pdf-lib rewriting.
(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = { WorkerMessageHandler };
self.addEventListener("message", async (event: MessageEvent) => {
  const { taskId, pdf, baseUrl, allowSinglePage, deadlineAt } = event.data ?? {};
  if (typeof taskId !== "string" || !(pdf instanceof Uint8Array)) return;
  try {
    configurePdfResources(baseUrl);
    const result = await processLastPageHeight(pdf, allowSinglePage === true, Math.max(0, deadlineAt - (performance.timeOrigin + performance.now())));
    self.postMessage({ taskId, result }, { transfer: [result.pdf.buffer] });
  } catch (error) {
    self.postMessage({ taskId, error: error instanceof Error ? error.message : "worker-error" });
  }
});
