import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const localeRoot = path.join(root, "_locales");
const expectedLocales = ["de", "en", "es", "fr", "it", "ja", "ko", "pt_BR", "pt_PT", "zh_CN", "zh_TW"];
const actualLocales = (await readdir(localeRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(actualLocales, expectedLocales);

const catalogs = new Map();
for (const locale of expectedLocales) {
  const filename = path.join(localeRoot, locale, "messages.json");
  const catalog = JSON.parse(await readFile(filename, "utf8"));
  catalogs.set(locale, catalog);
}

const english = catalogs.get("en");
const englishKeys = Object.keys(english).sort();
assert.ok(englishKeys.length > 0);

function placeholderTokens(message) {
  return [...message.matchAll(/\$([A-Z][A-Z0-9_]*)\$/g)].map((match) => match[1].toLowerCase()).sort();
}

for (const [locale, catalog] of catalogs) {
  assert.deepEqual(Object.keys(catalog).sort(), englishKeys, `${locale} message keys`);
  for (const key of englishKeys) {
    const entry = catalog[key];
    assert.equal(typeof entry?.message, "string", `${locale}.${key} message`);
    assert.ok(entry.message.trim(), `${locale}.${key} is empty`);
    assert.deepEqual(placeholderTokens(entry.message), placeholderTokens(english[key].message), `${locale}.${key} placeholders`);
    assert.deepEqual(
      Object.keys(entry.placeholders ?? {}).sort(),
      Object.keys(english[key].placeholders ?? {}).sort(),
      `${locale}.${key} placeholder definitions`
    );
  }
}

const sourceFiles = [
  "src/shared/i18n.ts",
  "src/popup/popup.ts",
  "src/preview/preview.ts",
  "src/editor/editor-controller.ts",
  "src/page/page-preparer.ts",
  "src/background/pdf-generator.ts",
  "src/background/service-worker.ts",
  "src/popup/popup.html",
  "src/preview/preview.html"
];
const referencedKeys = new Set();
for (const filename of sourceFiles) {
  const source = await readFile(path.join(root, filename), "utf8");
  for (const match of source.matchAll(/(?:\bt|userError)\(\s*["']([A-Za-z0-9_]+)["']/g)) referencedKeys.add(match[1]);
  for (const match of source.matchAll(/data-i18n(?:-title)?=["']([A-Za-z0-9_]+)["']/g)) referencedKeys.add(match[1]);
}
for (const key of referencedKeys) assert.ok(english[key], `Missing English message: ${key}`);

const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
assert.equal(manifest.default_locale, "en");
for (const value of [manifest.name, manifest.description, manifest.action.default_title]) {
  const match = /^__MSG_([A-Za-z0-9_]+)__$/.exec(value);
  assert.ok(match, `Manifest value is not localized: ${value}`);
  assert.ok(english[match[1]], `Missing manifest message: ${match[1]}`);
}

function chromeLocaleCandidates(language) {
  const [lang, region] = language.replace(/_/g, "-").toLowerCase().split("-", 2);
  if (lang === "pt") return [region === "br" || !region ? "pt_BR" : "pt_PT", "en"];
  if (lang === "zh") return [region === "tw" || region === "hk" || region === "mo" ? "zh_TW" : "zh_CN", "en"];
  return [region ? `${lang}_${region.toUpperCase()}` : lang, lang, "en"];
}

function resolveMessage(language, key, overrideCatalogs = catalogs) {
  for (const locale of chromeLocaleCandidates(language)) {
    const message = overrideCatalogs.get(locale)?.[key]?.message;
    if (message) return { locale, message };
  }
  return undefined;
}

const cases = {
  "en-US": "en", "de-AT": "de", "it-CH": "it", "es-MX": "es", "fr-CA": "fr",
  "ja-JP": "ja", "ko-KR": "ko", "pt-BR": "pt_BR", "pt-PT": "pt_PT",
  "zh-CN": "zh_CN", "zh-SG": "zh_CN", "zh-TW": "zh_TW", "zh-HK": "zh_TW", "nl-NL": "en"
};
for (const [language, locale] of Object.entries(cases)) {
  assert.equal(resolveMessage(language, "saveFullPage")?.locale, locale, language);
}

const missingGerman = new Map(catalogs);
missingGerman.set("de", { ...catalogs.get("de"), saveFullPage: undefined });
assert.equal(resolveMessage("de-DE", "saveFullPage", missingGerman)?.locale, "en");
assert.equal(resolveMessage("de-DE", "saveFullPage", missingGerman)?.message, english.saveFullPage.message);

for (const filename of ["README.md", "PRIVACY.md"]) {
  const content = await readFile(path.join(root, filename), "utf8");
  assert.match(content, /support@miengieh\.com/);
}

const popupCss = await readFile(path.join(root, "src/popup/popup.css"), "utf8");
assert.match(popupCss, /html, body\s*\{[^}]*width:\s*340px;[^}]*min-width:\s*340px;/s);
assert.doesNotMatch(popupCss, /max-width:\s*100vw/);
assert.match(popupCss, /button\s*\{[^}]*white-space:\s*nowrap;[^}]*text-wrap:\s*nowrap;/s);

console.log(`i18n tests: OK (${expectedLocales.length} locale catalogs, ${englishKeys.length} messages)`);
