import type { MessageResponse, RuntimeRequest } from "../shared/messages";
import { createSourcePageMetadata } from "../shared/filename";
import { localizeDocument, t, userError, UserFacingError, visibleError } from "../shared/i18n";

localizeDocument();

const saveButton = document.querySelector<HTMLButtonElement>("#save")!;
const editButton = document.querySelector<HTMLButtonElement>("#edit")!;
const cancelButton = document.querySelector<HTMLButtonElement>("#cancel")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
let currentTabId: number | null = null;
let exporting = false;
let completed = false;
let keepalivePort: chrome.runtime.Port | null = null;
let keepaliveTimer: number | null = null;

function preparationStatus(url?: string): string {
  return /^https:\/\/(?:www\.)?zhihu\.com\/question\/\d+\/answer\/\d+(?:[/?#]|$)/i.test(url ?? "")
    ? t("preparingZhihuAnswer")
    : /^(?:https:\/\/)?(?:www\.)?zhihu\.com\//i.test(url ?? "")
      ? t("preparingZhihuSnapshot")
      : t("preparingFullPage");
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw userError("errorNoActiveTab");
  return tab;
}

function startKeepalive(): void {
  keepalivePort = chrome.runtime.connect({ name: "export-keepalive" });
  keepalivePort.postMessage({ type: "PING" });
  keepaliveTimer = window.setInterval(() => keepalivePort?.postMessage({ type: "PING" }), 20_000);
}

function stopKeepalive(): void {
  if (keepaliveTimer !== null) window.clearInterval(keepaliveTimer);
  keepaliveTimer = null;
  keepalivePort?.disconnect();
  keepalivePort = null;
}

function setBusy(busy: boolean, busyText = ""): void {
  exporting = busy;
  saveButton.disabled = busy;
  editButton.disabled = busy;
  cancelButton.hidden = !busy;
  cancelButton.disabled = false;
  status.className = busy ? "busy" : "";
  if (busyText) status.textContent = busyText;
}

async function request(message: RuntimeRequest, busyText: string, tabId: number): Promise<void> {
  currentTabId = tabId;
  completed = false;
  setBusy(true, busyText);
  startKeepalive();
  try {
    const response = (await chrome.runtime.sendMessage(message)) as MessageResponse;
    if (!response.ok) throw new UserFacingError(response.error);
    completed = true;
    window.close();
  } catch (error) {
    status.textContent = visibleError(error);
    setBusy(false);
  } finally {
    stopKeepalive();
    currentTabId = null;
  }
}

saveButton.addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    await request(
      {
        type: "START_EXPORT",
        tabId: tab.id!,
        metadata: createSourcePageMetadata(tab.title, tab.url)
      },
      preparationStatus(tab.url),
      tab.id!
    );
  } catch (error) {
    status.textContent = visibleError(error);
  }
});

editButton.addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    await request(
      {
        type: "START_EDITOR",
        tabId: tab.id!,
        metadata: createSourcePageMetadata(tab.title, tab.url)
      },
      t("openingEditor"),
      tab.id!
    );
  } catch (error) {
    status.textContent = visibleError(error);
  }
});

cancelButton.addEventListener("click", async () => {
  if (!exporting || currentTabId === null) return;
  cancelButton.disabled = true;
  status.textContent = t("cancelingExport");
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "CANCEL_EXPORT",
      tabId: currentTabId
    } satisfies RuntimeRequest)) as MessageResponse;
    if (!response.ok) throw new UserFacingError(response.error);
  } catch (error) {
    status.textContent = visibleError(error);
    cancelButton.disabled = false;
  }
});

window.addEventListener("beforeunload", () => {
  if (exporting && !completed && currentTabId !== null) {
    void chrome.runtime.sendMessage({ type: "CANCEL_EXPORT", tabId: currentTabId } satisfies RuntimeRequest);
  }
  stopKeepalive();
});
