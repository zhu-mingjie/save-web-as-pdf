import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/popup/links.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`;
const links = await import(moduleUrl);

assert.equal(links.WEBSITE_URL, "https://miengieh.com/");
assert.equal(links.SUPPORT_URL, "https://buy.stripe.com/00wdRbedhaXG55x2I7gYU00");
assert.equal(links.GITHUB_URL, "https://github.com/zhu-mingjie/save-web-as-pdf");
assert.equal(links.CHROME_WEB_STORE_REVIEW_URL, "");
assert.equal(links.safeExternalUrl(""), null);
assert.equal(links.safeExternalUrl("javascript:alert(1)"), null);
assert.equal(links.safeExternalUrl("http://example.com/review"), null);
assert.equal(links.safeExternalUrl("https://chromewebstore.google.com/detail/example/reviews"), "https://chromewebstore.google.com/detail/example/reviews");

const html = await readFile("src/popup/popup.html", "utf8");
const css = await readFile("src/popup/popup.css", "utf8");
const websiteIndex = html.indexOf('id="website-link"');
const supportIndex = html.indexOf('id="support-link"');
const reviewIndex = html.indexOf('id="review-link"');
const githubIndex = html.indexOf('id="github-link"');
assert.ok(websiteIndex >= 0 && websiteIndex < supportIndex && supportIndex < reviewIndex && reviewIndex < githubIndex);
assert.match(html, /id="review-link"[^>]*aria-disabled="true"[^>]*tabindex="0"/);
assert.doesNotMatch(html.match(/<a id="review-link"[^>]*>/)?.[0] ?? "", /\shref=/);
assert.match(html, /src="\.\.\/icons\/popup-brand\.svg"/);
assert.match(html, /class="brand-icon"[^>]*width="24"[^>]*height="24"/);
assert.match(html, /src="\.\.\/icons\/globe\.svg"/);

for (const asset of ["icons/popup-brand.svg", "icons/globe.svg"]) {
  assert.match(await readFile(asset, "utf8"), /<svg\b/);
}

assert.match(css, /html, body\s*\{[^}]*width:\s*320px;[^}]*min-width:\s*320px;/s);
assert.match(css, /\.brand-header\s*\{[^}]*min-height:\s*48px;[^}]*padding:\s*10px 16px;/s);
assert.match(css, /main\s*\{[^}]*padding:\s*15px 16px 0;/s);
assert.match(css, /button\s*\{[^}]*min-height:\s*40px;[^}]*font-size:\s*14px;/s);
assert.match(css, /\[hidden\],\s*#status\[hidden\]\s*\{\s*display:\s*none\s*!important;/s);
assert.match(css, /#status\s*\{[^}]*max-height:\s*120px;[^}]*overflow-y:\s*auto;/s);
assert.match(css, /footer\s*\{[^}]*flex-wrap:\s*wrap;[^}]*justify-content:\s*center;[^}]*gap:\s*6px;[^}]*padding:\s*11px 8px;[^}]*font-size:\s*12px;/s);
assert.match(css, /\.website-link\s*\{[^}]*min-width:\s*24px;[^}]*min-height:\s*24px;/s);
assert.match(css, /\.footer-link\s*\{[^}]*min-height:\s*24px;/s);
assert.doesNotMatch(css, /(?:html|body|main)\s*\{[^}]*(?:^|[;\s])(?:height|min-height)\s*:/ms);

console.log("Popup UI/link tests: OK");
