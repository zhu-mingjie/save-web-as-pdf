import assert from "node:assert/strict";
import { build } from "esbuild";

async function loadSourceModule(source) {
  const result = await build({
    stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "test-entry.ts" },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome120",
    write: false
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const rules = await loadSourceModule(`
  export { defaultCaptureMode, extractZhihuAnswerId, hasViewportUnitToken } from "./src/page/capture-rules.ts";
`);

assert.equal(rules.extractZhihuAnswerId("https://www.zhihu.com/question/123/answer/456"), "456");
assert.equal(rules.extractZhihuAnswerId("https://zhihu.com/question/123/answer/456?utm_source=test"), "456");
assert.equal(rules.extractZhihuAnswerId("https://www.zhihu.com/question/123"), undefined);
assert.equal(rules.extractZhihuAnswerId("https://example.com/question/123/answer/456"), undefined);
assert.equal(rules.defaultCaptureMode("https://www.zhihu.com/"), "loaded-snapshot");
assert.equal(rules.defaultCaptureMode("https://www.zhihu.com/question/123/answer/456"), "zhihu-answer");
assert.equal(rules.defaultCaptureMode("https://example.com/article"), "full-page");

for (const value of ["100vh", "calc(100svh - 4rem)", "35dvh", "min(100lvh, 900px)"]) {
  assert.equal(rules.hasViewportUnitToken(value), true, value);
}
for (const value of ["100vw", "900px", "var(--height)", "auto", "url(/image-vh.png)"]) {
  assert.equal(rules.hasViewportUnitToken(value), false, value);
}

const pdf = await loadSourceModule(`export { countPdfPages } from "./src/background/pdf-generator.ts";`);
const bytes = (value) => new TextEncoder().encode(value);
assert.equal(pdf.countPdfPages(bytes("%PDF-1.7\n1 0 obj << /Type /Pages /Count 1 >> endobj\n2 0 obj << /Type /Page >> endobj")), 1);
assert.equal(pdf.countPdfPages(bytes("%PDF-1.7\n1 0 obj << /Type/Page >> endobj\n2 0 obj << /Type /Page /Parent 3 0 R >> endobj")), 2);
assert.equal(pdf.countPdfPages(bytes("%PDF-1.7\n1 0 obj << /Type /Pages /Count 0 >> endobj")), undefined);

console.log("Export logic tests: OK");
