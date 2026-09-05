import type { MessageResponse, RuntimeRequest } from "../shared/messages";
import { createSourcePageMetadata } from "../shared/filename";
import type { SourcePageMetadata } from "../shared/types";
import { ElementSelector } from "./element-selector";
import { RemovalHistory } from "./removal-history";

declare global {
  interface Window {
    __swpEditorInstalled?: boolean;
  }
}

const HOST_ID = "__swp_editor_host__";
const REMOVED_CLASS = "__swp_removed__";
const REMOVAL_STYLE_ID = "__swp_removal_style__";

class EditorController {
  private host: HTMLDivElement | null = null;
  private selector: ElementSelector | null = null;
  private history = new RemovalHistory(REMOVED_CLASS);
  private undoButton: HTMLButtonElement | null = null;
  private redoButton: HTMLButtonElement | null = null;
  private restoreButton: HTMLButtonElement | null = null;
  private saveButton: HTMLButtonElement | null = null;
  private status: HTMLSpanElement | null = null;
  private saving = false;
  private metadata: SourcePageMetadata | null = null;

  start(metadata: SourcePageMetadata): void {
    if (this.host) return;
    this.metadata = createSourcePageMetadata(
      metadata.title || document.title,
      metadata.url || location.href
    );
    this.ensureRemovalStyle();
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.dataset.swpExtensionRoot = "true";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        #overlay { position: fixed; z-index: 2147483645; pointer-events: none; box-sizing: border-box; border: 2px solid #d93025; background: rgba(217, 48, 37, .09); }
        #toolbar { position: fixed; z-index: 2147483647; top: 16px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 6px; padding: 8px; border: 1px solid rgba(0,0,0,.14); border-radius: 12px; background: #fff; box-shadow: 0 8px 30px rgba(0,0,0,.22); font: 13px/1.2 system-ui, sans-serif; color: #202124; }
        button { min-height: 32px; padding: 0 12px; border: 1px solid #dadce0; border-radius: 7px; background: #fff; color: #202124; font: 600 13px system-ui, sans-serif; cursor: pointer; }
        button:hover:not(:disabled) { background: #f1f3f4; }
        button.primary { border-color: #0b57d0; background: #0b57d0; color: #fff; }
        button.danger { color: #b3261e; }
        button:disabled { opacity: .45; cursor: default; }
        #status { min-width: 72px; margin: 0 4px; color: #5f6368; white-space: nowrap; }
        #tip { position: fixed; z-index: 2147483647; inset: 0; display: grid; place-items: center; background: rgba(32,33,36,.36); font: 14px/1.5 system-ui, sans-serif; }
        #tip-card { width: min(340px, calc(100vw - 40px)); padding: 22px; border-radius: 14px; background: #fff; color: #202124; box-shadow: 0 12px 42px rgba(0,0,0,.28); }
        #tip h2 { margin: 0 0 8px; font-size: 18px; }
        #tip p { margin: 0 0 16px; color: #5f6368; }
        [hidden] { display: none !important; }
      </style>
      <div id="overlay" hidden></div>
      <div id="toolbar">
        <button id="undo" type="button">Undo</button>
        <button id="redo" type="button">Redo</button>
        <button id="restore" type="button">Restore</button>
        <span id="status">0 removed</span>
        <button id="save" class="primary" type="button">Save PDF</button>
        <button id="exit" class="danger" type="button">Exit</button>
      </div>
      <div id="tip">
        <div id="tip-card">
          <h2>Remove unwanted elements</h2>
          <p>Hover over any section and click to remove it. You can undo your changes before saving.</p>
          <button id="got-it" class="primary" type="button">Got it</button>
        </div>
      </div>
    `;
    (document.documentElement ?? document.body).append(host);
    this.host = host;
    this.undoButton = shadow.querySelector("#undo");
    this.redoButton = shadow.querySelector("#redo");
    this.restoreButton = shadow.querySelector("#restore");
    this.saveButton = shadow.querySelector("#save");
    this.status = shadow.querySelector("#status");
    const overlay = shadow.querySelector<HTMLElement>("#overlay")!;
    this.selector = new ElementSelector(overlay, host, (element) => {
      this.history.remove(element);
      this.updateControls();
    });
    this.selector.start();

    shadow.querySelector("#undo")?.addEventListener("click", (event) => {
      event.stopPropagation();
      this.history.undo();
      this.updateControls();
    });
    shadow.querySelector("#redo")?.addEventListener("click", (event) => {
      event.stopPropagation();
      this.history.redo();
      this.updateControls();
    });
    shadow.querySelector("#restore")?.addEventListener("click", (event) => {
      event.stopPropagation();
      this.history.restoreAll();
      this.updateControls();
    });
    shadow.querySelector("#exit")?.addEventListener("click", (event) => {
      event.stopPropagation();
      this.destroy();
    });
    shadow.querySelector("#got-it")?.addEventListener("click", (event) => {
      event.stopPropagation();
      shadow.querySelector<HTMLElement>("#tip")!.hidden = true;
    });
    shadow.querySelector("#save")?.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.save();
    });
    this.updateControls();
  }

  finish(): void {
    this.destroy();
  }

  private ensureRemovalStyle(): void {
    if (document.getElementById(REMOVAL_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = REMOVAL_STYLE_ID;
    style.textContent = `.${REMOVED_CLASS} { display: none !important; }`;
    (document.head ?? document.documentElement).append(style);
  }

  private updateControls(): void {
    if (this.undoButton) this.undoButton.disabled = !this.history.canUndo || this.saving;
    if (this.redoButton) this.redoButton.disabled = !this.history.canRedo || this.saving;
    if (this.restoreButton) this.restoreButton.disabled = this.history.count === 0 || this.saving;
    if (this.saveButton) this.saveButton.disabled = this.saving;
    if (this.status) this.status.textContent = this.saving ? "Preparing…" : `${this.history.count} removed`;
  }

  private async save(): Promise<void> {
    if (this.saving || !this.host || !this.metadata) return;
    this.saving = true;
    this.selector?.stop();
    this.host.style.visibility = "hidden";
    this.updateControls();
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "EDIT_SAVE_REQUEST",
        metadata: this.metadata
      } satisfies RuntimeRequest)) as MessageResponse;
      if (!response.ok) throw new Error(response.error);
    } catch (error) {
      alert(`Save Web as PDF: ${error instanceof Error ? error.message : String(error)}`);
      this.destroy();
    }
  }

  private destroy(): void {
    this.selector?.stop();
    this.selector = null;
    this.history.restoreAll();
    document.getElementById(REMOVAL_STYLE_ID)?.remove();
    this.host?.remove();
    this.host = null;
    this.metadata = null;
    this.saving = false;
  }
}

if (!window.__swpEditorInstalled) {
  window.__swpEditorInstalled = true;
  const controller = new EditorController();
  chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) => {
    if (message.type === "EDITOR_START") {
      try {
        controller.start(message.metadata);
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    } else if (message.type === "EDITOR_FINISH") {
      controller.finish();
      sendResponse({ ok: true });
    }
  });
}
