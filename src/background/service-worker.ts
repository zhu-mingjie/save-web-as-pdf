import type { MessageResponse, PrepareResponse, RuntimeRequest } from "../shared/messages";
import { sanitizePdfFilename } from "../shared/filename";
import { deleteExpiredPdfs, putPdf } from "../shared/pdf-store";
import type { ExportMode, PrepareResult } from "../shared/types";
import { generatePdf } from "./pdf-generator";

const activeExports = new Set<number>();

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Cannot access|Missing host permission|chrome:\/\/|Chrome Web Store/i.test(message)) {
    return "This page cannot be saved because Chrome does not allow extensions to access it.";
  }
  if (/Another debugger|target is already attached/i.test(message)) {
    return "Chrome's debugger is already being used for this tab. Close DevTools or the other debugger and try again.";
  }
  return message || "The PDF could not be generated.";
}

async function injectFile(tabId: number, file: string): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
}

async function sendToTab<T>(tabId: number, message: RuntimeRequest): Promise<T> {
  return (await chrome.tabs.sendMessage(tabId, message)) as T;
}

async function prepareTab(tabId: number): Promise<PrepareResult> {
  await injectFile(tabId, "page/page-agent.js");
  const response = await sendToTab<PrepareResponse>(tabId, { type: "PREPARE_PAGE" });
  if (!response.ok || !response.data) throw new Error(response.ok ? "The page did not return its dimensions." : response.error);
  return response.data;
}

async function cleanupTab(tabId: number): Promise<void> {
  try {
    await sendToTab(tabId, { type: "CLEANUP_PAGE" });
  } catch {
    // The tab may have closed or navigated.
  }
}

async function finishEditor(tabId: number): Promise<void> {
  try {
    await sendToTab(tabId, { type: "EDITOR_FINISH" });
  } catch {
    // The tab may have closed or navigated.
  }
}

async function exportTab(tabId: number, mode: ExportMode): Promise<void> {
  if (activeExports.has(tabId)) throw new Error("An export is already running for this tab.");
  activeExports.add(tabId);
  let prepared = false;
  try {
    const page = await prepareTab(tabId);
    prepared = true;
    const { pdf } = await generatePdf(tabId);
    const id = crypto.randomUUID();
    await putPdf({
      id,
      blob: new Blob(
        [pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer],
        { type: "application/pdf" }
      ),
      filename: sanitizePdfFilename(page.title),
      sourceUrl: page.url,
      createdAt: Date.now()
    });
    await chrome.tabs.create({ url: chrome.runtime.getURL(`preview/preview.html?id=${encodeURIComponent(id)}`) });
    void deleteExpiredPdfs();
  } finally {
    if (prepared) await cleanupTab(tabId);
    if (mode === "edit") await finishEditor(tabId);
    activeExports.delete(tabId);
  }
}

async function startEditor(tabId: number): Promise<void> {
  await injectFile(tabId, "editor/editor.js");
  const response = await sendToTab<MessageResponse>(tabId, { type: "EDITOR_START" });
  if (!response.ok) throw new Error(response.error);
}

chrome.runtime.onInstalled.addListener(() => void deleteExpiredPdfs());

chrome.runtime.onMessage.addListener((message: RuntimeRequest, sender, sendResponse) => {
  const run = async (): Promise<MessageResponse> => {
    try {
      if (message.type === "START_EXPORT") {
        await exportTab(message.tabId, "full");
        return { ok: true };
      }
      if (message.type === "START_EDITOR") {
        await startEditor(message.tabId);
        return { ok: true };
      }
      if (message.type === "EDIT_SAVE_REQUEST") {
        const tabId = sender.tab?.id;
        if (tabId === undefined) throw new Error("The source tab is no longer available.");
        await exportTab(tabId, "edit");
        return { ok: true };
      }
      return { ok: false, error: "Unknown request." };
    } catch (error) {
      return { ok: false, error: friendlyError(error) };
    }
  };
  void run().then(sendResponse);
  return true;
});
