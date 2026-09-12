import type { RuntimeRequest } from "../shared/messages";
import { visibleError } from "../shared/i18n";
import { cleanupPage, preparePage } from "./page-preparer";

declare global {
  interface Window {
    __swpPageAgentInstalled?: boolean;
  }
}

let preparationController: AbortController | null = null;

if (!window.__swpPageAgentInstalled) {
  window.__swpPageAgentInstalled = true;
  chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) => {
    if (message.type === "PREPARE_PAGE") {
      preparationController?.abort();
      preparationController = new AbortController();
      preparePage(preparationController.signal)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: visibleError(error) })
        );
      return true;
    }
    if (message.type === "CANCEL_PAGE_PREPARATION") {
      preparationController?.abort();
      preparationController = null;
      cleanupPage()
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: visibleError(error) })
        );
      return true;
    }
    if (message.type === "CLEANUP_PAGE") {
      preparationController?.abort();
      preparationController = null;
      cleanupPage()
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: visibleError(error) })
        );
      return true;
    }
    return undefined;
  });
}
