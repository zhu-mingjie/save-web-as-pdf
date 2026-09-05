import { getPdf } from "../shared/pdf-store";

const filenameInput = document.querySelector<HTMLInputElement>("#filename")!;
const downloadButton = document.querySelector<HTMLButtonElement>("#download")!;
const preview = document.querySelector<HTMLEmbedElement>("#preview")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const source = document.querySelector<HTMLParagraphElement>("#source")!;
let objectUrl: string | null = null;
let downloadFilename = "webpage.pdf";

async function load(): Promise<void> {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) throw new Error("The PDF identifier is missing.");
  const record = await getPdf(id);
  if (!record) throw new Error("This PDF preview has expired. Generate it again from the webpage.");
  downloadFilename = record.metadata.filename;
  filenameInput.value = downloadFilename;
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
      filename: downloadFilename,
      saveAs: true
    });
  } catch (error) {
    status.hidden = false;
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    downloadButton.disabled = false;
  }
});

window.addEventListener("beforeunload", () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

void load().catch((error: unknown) => {
  status.hidden = false;
  status.textContent = error instanceof Error ? error.message : String(error);
});
