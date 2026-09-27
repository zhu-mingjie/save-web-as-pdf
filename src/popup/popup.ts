import type { MessageResponse, RuntimeRequest } from "../shared/messages";
import { createSourcePageMetadata } from "../shared/filename";
import { localizeDocument, t, userError, UserFacingError, visibleError } from "../shared/i18n";
import {
  CHROME_WEB_STORE_REVIEW_URL,
  GITHUB_URL,
  safeExternalUrl,
  SUPPORT_URL,
  WEBSITE_URL
} from "./links";

localizeDocument();

const saveButton = document.querySelector<HTMLButtonElement>("#save")!;
const editButton = document.querySelector<HTMLButtonElement>("#edit")!;
const cancelButton = document.querySelector<HTMLButtonElement>("#cancel")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const websiteLink = document.querySelector<HTMLAnchorElement>("#website-link")!;
const supportLink = document.querySelector<HTMLAnchorElement>("#support-link")!;
const reviewLink = document.querySelector<HTMLAnchorElement>("#review-link")!;
const githubLink = document.querySelector<HTMLAnchorElement>("#github-link")!;
const footer = document.querySelector<HTMLElement>("footer")!;
let currentTabId: number | null = null;
let exporting = false;
let completed = false;
let keepalivePort: chrome.runtime.Port | null = null;
let keepaliveTimer: number | null = null;

function enableExternalLink(link: HTMLAnchorElement, url: string): void {
  const href = safeExternalUrl(url);
  if (!href) return;
  link.dataset.href = href;
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.classList.remove("is-disabled");
  link.removeAttribute("aria-disabled");
}

enableExternalLink(websiteLink, WEBSITE_URL);
enableExternalLink(supportLink, SUPPORT_URL);
enableExternalLink(githubLink, GITHUB_URL);
enableExternalLink(reviewLink, CHROME_WEB_STORE_REVIEW_URL);

footer.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("a[aria-disabled='true']")) event.preventDefault();
});
footer.addEventListener("keydown", (event) => {
  if (
    (event.key === "Enter" || event.key === " ") &&
    event.target instanceof Element &&
    event.target.closest("a[aria-disabled='true']")
  ) {
    event.preventDefault();
  }
});

function setFooterLinksBusy(busy: boolean): void {
  for (const link of [websiteLink, supportLink, githubLink, reviewLink]) {
    const href = link.dataset.href;
    if (!href) continue;
    if (busy) {
      link.removeAttribute("href");
      link.classList.add("is-disabled");
      link.setAttribute("aria-disabled", "true");
    } else {
      link.href = href;
      link.classList.remove("is-disabled");
      link.removeAttribute("aria-disabled");
    }
  }
}

function setStatus(message = "", kind: "busy" | "error" | "" = ""): void {
  status.textContent = message;
  status.className = kind;
  status.hidden = message.length === 0;
}

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
  setFooterLinksBusy(busy);
  saveButton.disabled = busy;
  editButton.disabled = busy;
  cancelButton.hidden = !busy;
  cancelButton.disabled = false;
  if (busy) setStatus(busyText, "busy");
  else if (status.classList.contains("busy")) setStatus();
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
    setBusy(false);
    setStatus(visibleError(error), "error");
  } finally {
    stopKeepalive();
    currentTabId = null;
  }
}

saveButton.addEventListener("click", async () => {
  setStatus();
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
    setStatus(visibleError(error), "error");
  }
});

editButton.addEventListener("click", async () => {
  setStatus();
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
    setStatus(visibleError(error), "error");
  }
});

cancelButton.addEventListener("click", async () => {
  if (!exporting || currentTabId === null) return;
  cancelButton.disabled = true;
  setStatus(t("cancelingExport"), "busy");
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "CANCEL_EXPORT",
      tabId: currentTabId
    } satisfies RuntimeRequest)) as MessageResponse;
    if (!response.ok) throw new UserFacingError(response.error);
  } catch (error) {
    setStatus(visibleError(error), "error");
    cancelButton.disabled = false;
  }
});

window.addEventListener("beforeunload", () => {
  if (exporting && !completed && currentTabId !== null) {
    void chrome.runtime.sendMessage({ type: "CANCEL_EXPORT", tabId: currentTabId } satisfies RuntimeRequest);
  }
  stopKeepalive();
});
