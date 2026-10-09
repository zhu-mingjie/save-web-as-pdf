import { takePdf } from "../shared/pdf-store";
import { createPdfDownloadFilename } from "../shared/filename";
import { initializeI18n, onLanguageChange, localizeDocument, userError, visibleError } from "../shared/i18n";
import { optimizeLastPageHeight } from "./last-page-optimizer";

await initializeI18n().catch(() => undefined);
localizeDocument();
onLanguageChange(() => localizeDocument());

const filenameInput = document.querySelector<HTMLInputElement>("#filename")!;
const downloadButton = document.querySelector<HTMLButtonElement>("#download")!;
const preview = document.querySelector<HTMLEmbedElement>("#preview")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const source = document.querySelector<HTMLParagraphElement>("#source")!;
let objectUrl: string | null = null;
const controller = new AbortController();
const cancelButton = document.querySelector<HTMLButtonElement>("#cancel-processing")!;
cancelButton.addEventListener("click", () => controller.abort());

async function load(): Promise<void> {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) throw userError("errorPdfIdentifierMissing");
  const record = await takePdf(id);
  if (!record) throw userError("errorPreviewExpired");
  filenameInput.value = record.metadata.filename;
  source.textContent = record.metadata.url;
  source.title = record.metadata.url;
  const originalPdf = new Uint8Array(await record.blob.arrayBuffer());
  console.info("PDF print diagnostics:", record.printDiagnostics);
  const result = await optimizeLastPageHeight(originalPdf, { allowSinglePage: record.optimizeSinglePage, signal: controller.signal });
  controller.signal.throwIfAborted();
  console.info("Last-page height optimization:", {
    status: result.status,
    reason: result.reason,
    originalLastPageHeight: result.originalLastPageHeight,
    optimizedLastPageHeight: result.optimizedLastPageHeight
  });
  objectUrl = URL.createObjectURL(new Blob([result.pdf.slice().buffer], { type: "application/pdf" }));
  preview.src = objectUrl;
  preview.style.display = "block";
  status.hidden = true;
  downloadButton.disabled = false;
  cancelButton.hidden = true;
  if (result.status === "fallback" || result.reason === "no-safe-space-to-trim") {
    status.dataset.i18n = "optimizationUnchanged";
    localizeDocument(); status.hidden = false;
  }
}

downloadButton.addEventListener("click", async () => {
  if (!objectUrl) return;
  downloadButton.disabled = true;
  try {
    await chrome.downloads.download({
      url: objectUrl,
      filename: createPdfDownloadFilename(filenameInput.value),
      saveAs: true
    });
  } catch (error) {
    status.hidden = false;
    status.textContent = visibleError(error, "errorDownloadFailed");
  } finally {
    downloadButton.disabled = false;
  }
});

window.addEventListener("beforeunload", () => {
  controller.abort();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

void load().catch((error: unknown) => {
  cancelButton.hidden = true;
  status.hidden = false;
  delete status.dataset.i18n;
  if (controller.signal.aborted) { status.dataset.i18n = "errorExportCanceled"; localizeDocument(); }
  else status.textContent = visibleError(error);
});
