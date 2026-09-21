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

const pdf = await loadSourceModule(`
  export { countPdfPages, createPrintPlan, isAcceptablePageCount } from "./src/background/pdf-generator.ts";
`);
const bytes = (value) => new TextEncoder().encode(value);
assert.equal(pdf.countPdfPages(bytes("%PDF-1.7\n1 0 obj << /Type /Pages /Count 1 >> endobj\n2 0 obj << /Type /Page >> endobj")), 1);
assert.equal(pdf.countPdfPages(bytes("%PDF-1.7\n1 0 obj << /Type/Page >> endobj\n2 0 obj << /Type /Page /Parent 3 0 R >> endobj")), 2);
assert.equal(pdf.countPdfPages(bytes("%PDF-1.7\n1 0 obj << /Type /Pages /Count 0 >> endobj")), undefined);

const normalPlan = pdf.createPrintPlan({ width: 1440, height: 12000 });
assert.equal(normalPlan.mode, "single-page");
assert.equal(normalPlan.scale, 1);
assert.equal(normalPlan.paperWidth, 15.01);
assert.deepEqual(normalPlan.paperHeights, [125.01, 125.04, 125.1]);
assert.equal(normalPlan.estimatedPageCount, 1);
assert.equal(pdf.isAcceptablePageCount(normalPlan, 1), true);
assert.equal(pdf.isAcceptablePageCount(normalPlan, 2), false);

const wikipediaPlan = pdf.createPrintPlan({ width: 2180, height: 31934 });
assert.equal(wikipediaPlan.mode, "paginated");
assert.equal(wikipediaPlan.scale, 1);
assert.ok(wikipediaPlan.paperWidth > 22 && wikipediaPlan.paperWidth < 23);
assert.deepEqual(wikipediaPlan.paperHeights, [200]);
assert.equal(wikipediaPlan.estimatedPageCount, 2);
assert.equal(pdf.isAcceptablePageCount(wikipediaPlan, 2), true);
assert.equal(pdf.isAcceptablePageCount(wikipediaPlan, 3), true);

const tallPlan = pdf.createPrintPlan({ width: 1440, height: 200000 });
assert.equal(tallPlan.mode, "paginated");
assert.equal(tallPlan.estimatedPageCount, 11);

const widePlan = pdf.createPrintPlan({ width: 30000, height: 12000 });
assert.equal(widePlan.mode, "single-page");
assert.ok(widePlan.scale > 0.63 && widePlan.scale < 0.65);
assert.ok(Math.abs(widePlan.paperWidth - 200) < 0.000001);

assert.equal(pdf.createPrintPlan({ width: 200000, height: 12000 }), undefined);

console.log("Export logic tests: OK");
