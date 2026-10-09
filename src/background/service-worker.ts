import type { MessageResponse, PrepareResponse, RuntimeRequest } from "../shared/messages";
import { createLiveSourcePageMetadata } from "../shared/filename";
import { initializeI18n, t, userError, UserFacingError, visibleError } from "../shared/i18n";
import { readSettings, exportTimestamp, type ExportDecorations } from "../shared/settings";
import { deleteExpiredPdfs, deletePdf, putPdf } from "../shared/pdf-store";
import type { ExportMode, ExportSession, PrepareResult, SourcePageMetadata } from "../shared/types";
import { generatePdf } from "./pdf-generator";

const EXPORT_SESSION_PREFIX = "export-session:";
const EXPORT_SESSION_MAX_AGE_MS = 10 * 60 * 1000;
const POPUP_URL = chrome.runtime.getURL("popup/popup.html");

function friendlyError(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  if (/Cannot access|Missing host permission|chrome:\/\/|Chrome Web Store/i.test(message)) {
    return t("errorRestrictedPage");
  }
  if (/Another debugger|target is already attached/i.test(message)) {
    return t("errorDebuggerBusy");
  }
  return visibleError(error);
}

function exportSessionKey(tabId: number): string {
  return `${EXPORT_SESSION_PREFIX}${tabId}`;
}

async function getExportSession(tabId: number): Promise<ExportSession | undefined> {
  const key = exportSessionKey(tabId);
  const values = await chrome.storage.session.get(key);
  return values[key] as ExportSession | undefined;
}

async function beginExportSession(tabId: number): Promise<string> {
  const key = exportSessionKey(tabId);
  const current = await getExportSession(tabId);
  if (current && Date.now() - current.startedAt < EXPORT_SESSION_MAX_AGE_MS) {
    throw userError("errorExportAlreadyRunning");
  }

  const operationId = crypto.randomUUID();
  const session: ExportSession = { operationId, status: "running", startedAt: Date.now() };
  await chrome.storage.session.set({ [key]: session });

  // Confirm ownership so near-simultaneous requests cannot both enter the critical section.
  if ((await getExportSession(tabId))?.operationId !== operationId) {
    throw userError("errorExportRace");
  }
  return operationId;
}

async function exportWasCanceled(tabId: number, operationId: string): Promise<boolean> {
  const session = await getExportSession(tabId);
  return session?.operationId !== operationId || session.status === "canceling";
}

async function assertExportActive(tabId: number, operationId: string): Promise<void> {
  if (await exportWasCanceled(tabId, operationId)) throw userError("errorExportCanceled");
}

async function endExportSession(tabId: number, operationId: string): Promise<void> {
  const key = exportSessionKey(tabId);
  if ((await getExportSession(tabId))?.operationId === operationId) {
    await chrome.storage.session.remove(key);
  }
}

async function injectFile(tabId: number, file: string): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
}

async function sendToTab<T>(tabId: number, message: RuntimeRequest): Promise<T> {
  return (await chrome.tabs.sendMessage(tabId, message)) as T;
}

async function prepareTab(tabId: number, decorations: ExportDecorations): Promise<PrepareResult> {
  await injectFile(tabId, "page/page-agent.js");
  const response = await sendToTab<PrepareResponse>(tabId, { type: "PREPARE_PAGE", decorations });
  if (!response.ok || !response.data) {
    throw response.ok ? userError("errorMissingDimensions") : new UserFacingError(response.error);
  }
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

async function hideEditorForExport(tabId: number): Promise<void> {
  const response = await sendToTab<MessageResponse>(tabId, { type: "EDITOR_HIDE_FOR_EXPORT" });
  if (!response.ok) throw new UserFacingError(response.error);
}

async function cancelExport(tabId: number): Promise<boolean> {
  const key = exportSessionKey(tabId);
  const session = await getExportSession(tabId);
  if (!session) return false;

  await chrome.storage.session.set({ [key]: { ...session, status: "canceling" } satisfies ExportSession });
  await Promise.allSettled([
    sendToTab(tabId, { type: "CANCEL_PAGE_PREPARATION" }),
    chrome.debugger.detach({ tabId })
  ]);
  return true;
}

async function exportTab(tabId: number, mode: ExportMode, capturedMetadata: SourcePageMetadata): Promise<void> {
  const startedAt = Date.now();
  const operationId = await beginExportSession(tabId);
  let prepared = false;
  let pendingPdfId: string | undefined;
  let previewTabId: number | undefined;
  try {
    await assertExportActive(tabId, operationId);
    const settings = await readSettings();
    const decorations: ExportDecorations = { header: settings.header, footer: settings.footer, timestamp: exportTimestamp(startedAt) };
    if (settings.header !== "none" || settings.footer !== "none") {
      const response = await fetch(chrome.runtime.getURL("fonts/NotoSans-Regular.ttf"));
      if (!response.ok) throw new Error("metadata-font-resource");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      decorations.fontBase64 = btoa(binary);
    }
    await assertExportActive(tabId, operationId);
    const page = await prepareTab(tabId, decorations);
    prepared = true;
    await assertExportActive(tabId, operationId);
    const metadata = createLiveSourcePageMetadata(capturedMetadata, page.title, page.url);
    if (mode === "edit") await hideEditorForExport(tabId);
    const { pdf, optimizeSinglePage, diagnostics } = await generatePdf(tabId, page);
    await assertExportActive(tabId, operationId);
    const id = crypto.randomUUID();
    pendingPdfId = id;
    await putPdf({
      id,
      blob: new Blob(
        [pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer],
        { type: "application/pdf" }
      ),
      metadata,
      optimizeSinglePage,
      printDiagnostics: diagnostics,
      createdAt: Date.now()
    });
    await assertExportActive(tabId, operationId);
    const previewTab = await chrome.tabs.create({ url: chrome.runtime.getURL(`preview/preview.html?id=${encodeURIComponent(id)}`) });
    previewTabId = previewTab.id;
    if (await exportWasCanceled(tabId, operationId)) {
      if (previewTab.id !== undefined) await chrome.tabs.remove(previewTab.id).catch(() => undefined);
      throw userError("errorExportCanceled");
    }
    pendingPdfId = undefined;
    void deleteExpiredPdfs().catch(() => undefined);
  } catch (error) {
    if (await exportWasCanceled(tabId, operationId)) throw userError("errorExportCanceled");
    throw error;
  } finally {
    try {
      if (pendingPdfId) await deletePdf(pendingPdfId).catch(() => undefined);
      if (prepared) await cleanupTab(tabId);
      if (mode === "edit") await finishEditor(tabId);
      // A cancel arriving during source cleanup must also stop a preview that
      // was just opened; closing its document aborts its worker and revokes URLs.
      if (previewTabId !== undefined && await exportWasCanceled(tabId, operationId)) {
        await chrome.tabs.remove(previewTabId).catch(() => undefined);
        throw userError("errorExportCanceled");
      }
    } finally {
      await endExportSession(tabId, operationId);
    }
  }
}

async function startEditor(tabId: number, metadata: SourcePageMetadata): Promise<void> {
  await injectFile(tabId, "editor/editor.js");
  const response = await sendToTab<MessageResponse>(tabId, { type: "EDITOR_START", metadata });
  if (!response.ok) throw new UserFacingError(response.error);
}

function isPopupSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && sender.url === POPUP_URL;
}

function isContentScriptSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && sender.tab?.id !== undefined;
}

function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  if (!value || typeof value !== "object") return false;
  return typeof (value as { type?: unknown }).type === "string";
}

chrome.runtime.onInstalled.addListener(() => void deleteExpiredPdfs().catch(() => undefined));

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "export-keepalive" || port.sender?.id !== chrome.runtime.id) return;
  port.onMessage.addListener(() => void chrome.runtime.getPlatformInfo());
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const run = async (): Promise<MessageResponse> => {
    try {
      await initializeI18n();
      if (!isRuntimeRequest(message)) throw new Error("Invalid request.");
      if (message.type === "START_EXPORT") {
        if (!isPopupSender(sender)) throw new Error("Export requests must come from the extension popup.");
        await exportTab(message.tabId, "full", message.metadata);
        return { ok: true };
      }
      if (message.type === "START_EDITOR") {
        if (!isPopupSender(sender)) throw new Error("Editor requests must come from the extension popup.");
        await startEditor(message.tabId, message.metadata);
        return { ok: true };
      }
      if (message.type === "EDIT_SAVE_REQUEST") {
        if (!isContentScriptSender(sender)) throw new Error("Edit requests must come from the source page.");
        await exportTab(sender.tab!.id!, "edit", message.metadata);
        return { ok: true };
      }
      if (message.type === "CANCEL_EXPORT") {
        const tabId = isContentScriptSender(sender) ? sender.tab!.id : isPopupSender(sender) ? message.tabId : undefined;
        if (tabId === undefined) throw userError("errorCancelUnavailable");
        await cancelExport(tabId);
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
