export type MessageSubstitutions = string | string[];

export class UserFacingError extends Error {}

export function t(key: string, substitutions?: MessageSubstitutions): string {
  const value = chrome.i18n.getMessage(key, substitutions);
  if (value) return value;
  return chrome.i18n.getMessage("errorPdfCouldNotBeGenerated") || "The PDF could not be generated.";
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
  document.documentElement.lang = chrome.i18n.getUILanguage().replace(/_/g, "-");
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-i18n]"))) {
    element.textContent = t(element.dataset.i18n!);
  }
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-i18n-title]"))) {
    element.title = t(element.dataset.i18nTitle!);
  }
}
