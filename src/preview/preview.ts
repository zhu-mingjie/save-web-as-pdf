import { takePdf } from "../shared/pdf-store";
import { createPdfDownloadFilename } from "../shared/filename";
import { localizeDocument, t, userError, visibleError } from "../shared/i18n";
import { addSourceFooter } from "../shared/source-footer";
import { optimizeLastPageHeight } from "./last-page-optimizer";

localizeDocument();

const filenameInput = document.querySelector<HTMLInputElement>("#filename")!;
const downloadButton = document.querySelector<HTMLButtonElement>("#download")!;
const preview = document.querySelector<HTMLEmbedElement>("#preview")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const source = document.querySelector<HTMLParagraphElement>("#source")!;
let objectUrl: string | null = null;

async function load(): Promise<void> {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) throw userError("errorPdfIdentifierMissing");
  const record = await takePdf(id);
  if (!record) throw userError("errorPreviewExpired");
  filenameInput.value = record.metadata.filename;
  source.textContent = record.metadata.url;
  source.title = record.metadata.url;
  const originalPdf = new Uint8Array(await record.blob.arrayBuffer());
  const result = await optimizeLastPageHeight(originalPdf);
  console.info("Last-page height optimization:", {
    status: result.status,
    reason: result.reason,
    originalLastPageHeight: result.originalLastPageHeight,
    optimizedLastPageHeight: result.optimizedLastPageHeight
  });
  let finalPdf = result.pdf;
  let footerFailed = false;
  // Stamp after last-page optimization so the footer is never mistaken for page content.
  if (record.includeSourceFooter) {
    try {
      finalPdf = await addSourceFooter(result.pdf, { url: record.metadata.url, savedAt: record.createdAt });
    } catch (error) {
      console.error("Save Web as PDF source footer failed", error);
      footerFailed = true;
    }
  }
  objectUrl = URL.createObjectURL(new Blob([finalPdf.slice().buffer], { type: "application/pdf" }));
  preview.src = objectUrl;
  preview.style.display = "block";
  status.hidden = !footerFailed;
  if (footerFailed) status.textContent = t("errorSourceFooterFailed");
  downloadButton.disabled = false;
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
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

void load().catch((error: unknown) => {
  status.hidden = false;
  status.textContent = visibleError(error);
});
