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
const { createPdfFilename, createLiveSourcePageMetadata, createSourcePageMetadata, normalizePageTitle } = await import(moduleUrl);

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
assert.equal(createPdfFilename("%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98"), "中文标题.pdf");
assert.equal(createPdfFilename("ä¸­æ–‡æ ‡é¢˜"), "中文标题.pdf");
assert.equal(createPdfFilename("FranÃ§ais – actualités"), "Français – actualités.pdf");
assert.equal(createPdfFilename("Märchen und Café"), "Märchen und Café.pdf");
assert.equal(normalizePageTitle("\ufeff  标题\u200b  测试  "), "标题 测试");

const longFilename = createPdfFilename("🚀".repeat(200));
assert.ok(new TextEncoder().encode(longFilename).byteLength <= 180);
assert.ok(longFilename.endsWith(".pdf"));
assert.ok(!longFilename.includes("�"));

assert.deepEqual(
  createSourcePageMetadata("Private page", "https://example.com/account?token=secret#section"),
  {
    title: "Private page",
    url: "https://example.com/account",
    hostname: "example.com",
    filename: "Private page.pdf"
  }
);

assert.deepEqual(
  createLiveSourcePageMetadata(
    {
      title: "ä¸­æ–‡æ ‡é¢˜",
      url: "https://example.com/old?token=secret",
      hostname: "example.com",
      filename: "ä¸­æ–‡æ ‡é¢˜.pdf"
    },
    "实时中文标题",
    "https://example.com/current?token=secret#section"
  ),
  {
    title: "实时中文标题",
    url: "https://example.com/current",
    hostname: "example.com",
    filename: "实时中文标题.pdf"
  }
);

console.log("Filename tests: OK");
