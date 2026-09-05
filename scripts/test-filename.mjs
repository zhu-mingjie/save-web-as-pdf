import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/shared/filename.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`;
const { createPdfFilename } = await import(moduleUrl);

assert.equal(
  createPdfFilename("监督学习 - 维基百科，自由的百科全书"),
  "监督学习 - 维基百科，自由的百科全书.pdf"
);
assert.equal(createPdfFilename("Hello: World / Test?"), "Hello_ World _ Test_.pdf");
assert.equal(createPdfFilename("", "https://example.com/path"), "example.com.pdf");
assert.equal(createPdfFilename("   "), "webpage.pdf");
assert.equal(createPdfFilename("日本語ページ"), "日本語ページ.pdf");
assert.equal(createPdfFilename("한국어 페이지"), "한국어 페이지.pdf");
assert.equal(createPdfFilename("Café résumé"), "Café résumé.pdf");
assert.equal(createPdfFilename("Test 🚀 Page"), "Test 🚀 Page.pdf");
assert.equal(createPdfFilename("CON"), "_CON.pdf");

const longFilename = createPdfFilename("🚀".repeat(200));
assert.ok(new TextEncoder().encode(longFilename).byteLength <= 180);
assert.ok(longFilename.endsWith(".pdf"));
assert.ok(!longFilename.includes("�"));

console.log("Filename tests: OK");
