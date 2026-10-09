export const LOCALES = {
  en: "English", zh_CN: "简体中文", zh_TW: "繁體中文", de: "Deutsch",
  it: "Italiano", es: "Español", pt_BR: "Português (Brasil)",
  pt_PT: "Português (Portugal)", fr: "Français", ja: "日本語", ko: "한국어"
} as const;
export type Language = "auto" | keyof typeof LOCALES;
export type Decoration = "none" | "url" | "time" | "url-time";
export interface Settings { language: Language; header: Decoration; footer: Decoration }
export const SETTINGS_KEY = "settings-v1";
export const DEFAULT_SETTINGS: Settings = { language: "auto", header: "none", footer: "none" };

export function normalizeSettings(value: unknown): Settings {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const decoration = (v: unknown): Decoration =>
    v === "url" || v === "time" || v === "url-time" ? v : "none";
  return {
    language: typeof data.language === "string" && Object.hasOwn(LOCALES, data.language)
      ? data.language as Language : "auto",
    header: decoration(data.header), footer: decoration(data.footer)
  };
}

export async function readSettings(): Promise<Settings> {
  return normalizeSettings((await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const settings = normalizeSettings({ ...await readSettings(), ...patch });
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

export function exportTimestamp(startedAt: number): string {
  const date = new Date(startedAt);
  const offset = -date.getTimezoneOffset();
  const local = new Date(startedAt + offset * 60_000).toISOString().slice(0, 19).replace("T", " ");
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${local} UTC${offset < 0 ? "-" : "+"}${hours}:${minutes}`;
}

export interface ExportDecorations {
  header: Decoration;
  footer: Decoration;
  timestamp: string;
  fontBase64?: string;
}
