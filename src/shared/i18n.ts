import { catalogs, formatMessage } from "./catalogs";
import { readSettings, SETTINGS_KEY, normalizeSettings, type Language } from "./settings";
export type MessageSubstitutions = string | string[];
let language: Language = "auto";
let revision = 0;
const listeners = new Set<() => void>();

export async function initializeI18n(): Promise<void> {
  watchLanguage();
  const current = revision;
  const settings = await readSettings();
  if (revision === current) language = settings.language;
}

export function onLanguageChange(listener: () => void): void { listeners.add(listener); }
let watching = false;
function watchLanguage(): void {
  if (watching) return;
  watching = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return;
    revision += 1;
    language = normalizeSettings(changes[SETTINGS_KEY].newValue).language;
    for (const listener of listeners) listener();
  });
}


export class UserFacingError extends Error {}

export function t(key: string, substitutions?: MessageSubstitutions): string {
  const entry = catalogs[language]?.[key] ?? catalogs.en?.[key];
  const value = language === "auto" ? chrome.i18n.getMessage(key, substitutions) : entry && formatMessage(entry, substitutions);
  if (value) return value;
  return entry ? formatMessage(entry, substitutions) : "The PDF could not be generated.";
}

export function userError(key: string, substitutions?: MessageSubstitutions): UserFacingError {
  return new UserFacingError(t(key, substitutions));
}

export function visibleError(error: unknown, fallbackKey = "errorPdfCouldNotBeGenerated"): string {
  if (error instanceof UserFacingError && error.message) return error.message;
  console.error("Save Web as PDF internal error", error);
  return t(fallbackKey);
}

export function localizeDocument(root: ParentNode = document): void {
  if (root === document) document.documentElement.lang = (language === "auto" ? chrome.i18n.getUILanguage() : language).replace(/_/g, "-");
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-i18n]"))) {
    element.textContent = t(element.dataset.i18n!);
  }
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-i18n-title]"))) {
    element.title = t(element.dataset.i18nTitle!);
  }
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-i18n-aria-label]"))) {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel!));
    if (!element.dataset.i18nTitle) element.title = t(element.dataset.i18nAriaLabel!);
  }
}
