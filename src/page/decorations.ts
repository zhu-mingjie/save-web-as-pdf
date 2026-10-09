import type { ExportDecorations, Decoration } from "../shared/settings";
import { createSourcePageMetadata } from "../shared/filename";
import type { PagePreparationState } from "./page-state";

// Regular document flow: Chrome lays out metadata once, with the same searchable
// text/link pipeline as the body, before the common print-height plan is made.
export async function addDecorations(
  state: PagePreparationState, settings: ExportDecorations | undefined, signal: AbortSignal
): Promise<void> {
  if (!settings || (settings.header === "none" && settings.footer === "none")) return;
  signal.throwIfAborted();
  const metadata = createSourcePageMetadata(document.title, location.href);
  const family = `SWP_Metadata_${crypto.randomUUID().replaceAll("-", "")}`;
  if (!settings.fontBase64) throw new Error("metadata-font-missing");
  const bytes = Uint8Array.from(atob(settings.fontBase64), value => value.charCodeAt(0));
  const font = new FontFace(family, bytes.buffer);
  state.fonts.push(font);
  const loadedFont = await font.load();
  signal.throwIfAborted();
  document.fonts.add(loadedFont);
  const width = Math.max(document.documentElement.clientWidth, document.body.scrollWidth);
  const make = (choice: Decoration): HTMLElement | null => {
    if (choice === "none") return null;
    const host = document.createElement("div");
    state.nodes.push(host);
    // Inline !important prevents page styles from making metadata fixed/repeated.
    for (const [property, value] of Object.entries({
      display: "block", position: "relative", width: `${width}px`,
      "box-sizing": "border-box", margin: "0", padding: "8px 12px",
      height: "auto", "min-height": "0", "max-height": "none",
      transform: "none", float: "none", "break-inside": "avoid",
      "page-break-inside": "avoid", overflow: "visible", "z-index": "auto"
    })) host.style.setProperty(property, value, "important");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `:host { color: #555; } div { font: 12px/1.5 "${family}"; color: #555; overflow-wrap: anywhere; word-break: break-word; white-space: normal; } a { color: inherit; text-decoration: none; }`;
    shadow.append(style);
    if (choice === "url" || choice === "url-time") {
      const line = document.createElement("div");
      const link = document.createElement("a");
      // Canonical URL retains the original path while removing query/fragment;
      // Unicode hosts/paths use their valid ASCII URL encoding, never lossy fonts.
      link.href = metadata.url; link.textContent = metadata.url;
      line.append(link); shadow.append(line);
    }
    if (choice === "time" || choice === "url-time") {
      const line = document.createElement("div"); line.textContent = settings.timestamp; shadow.append(line);
    }
    return host;
  };
  const header = make(settings.header);
  if (header) document.documentElement.insertBefore(header, document.body);
  // Body overflow may extend beyond its flow box. Locate the actual prepared
  // document bottom before adding the footer, then compensate only that gap.
  const root = document.documentElement;
  const contentBottom = Math.max(document.body.scrollHeight + document.body.getBoundingClientRect().top + scrollY,
    document.body.getBoundingClientRect().bottom + scrollY, root.scrollHeight);
  const footer = make(settings.footer);
  if (footer) {
    root.append(footer);
    const flowTop = footer.getBoundingClientRect().top + scrollY;
    footer.style.setProperty("margin-top", `${Math.max(0, contentBottom - flowTop)}px`, "important");
  }
}
