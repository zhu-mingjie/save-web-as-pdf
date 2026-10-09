import en from "../../_locales/en/messages.json";
import de from "../../_locales/de/messages.json";
import es from "../../_locales/es/messages.json";
import fr from "../../_locales/fr/messages.json";
import it from "../../_locales/it/messages.json";
import ja from "../../_locales/ja/messages.json";
import ko from "../../_locales/ko/messages.json";
import pt_BR from "../../_locales/pt_BR/messages.json";
import pt_PT from "../../_locales/pt_PT/messages.json";
import zh_CN from "../../_locales/zh_CN/messages.json";
import zh_TW from "../../_locales/zh_TW/messages.json";

export interface MessageEntry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}
export const catalogs: Record<string, Record<string, MessageEntry>> = {
  en, de, es, fr, it, ja, ko, pt_BR, pt_PT, zh_CN, zh_TW
};

export function formatMessage(entry: MessageEntry, substitutions: string | string[] = []): string {
  const values = typeof substitutions === "string" ? [substitutions] : substitutions;
  return entry.message.replace(/\$([a-z][a-z0-9_]*)\$/gi, (_, name: string) => {
    const definition = entry.placeholders?.[name.toLowerCase()];
    return definition?.content.replace(/\$(\d+)/g, (_match, index: string) => values[Number(index) - 1] ?? "") ?? "";
  }).replace(/\$\$/g, "$");
}
