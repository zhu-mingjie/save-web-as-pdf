import { takePdf } from "../shared/pdf-store";
import { createPdfDownloadFilename } from "../shared/filename";
import { localizeDocument, userError, visibleError } from "../shared/i18n";

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
  objectUrl = URL.createObjectURL(record.blob);
  preview.src = objectUrl;
  preview.style.display = "block";
  status.hidden = true;
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
