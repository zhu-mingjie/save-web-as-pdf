import type { RuntimeRequest } from "../shared/messages";
import { cleanupPage, preparePage } from "./page-preparer";

declare global {
  interface Window {
    __swpPageAgentInstalled?: boolean;
  }
}

if (!window.__swpPageAgentInstalled) {
  window.__swpPageAgentInstalled = true;
  chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) => {
    if (message.type === "PREPARE_PAGE") {
      preparePage()
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
        );
      return true;
    }
    if (message.type === "CLEANUP_PAGE") {
      cleanupPage()
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
        );
      return true;
    }
    return undefined;
  });
}
