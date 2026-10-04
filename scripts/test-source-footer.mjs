import assert from "node:assert/strict";
import { build } from "esbuild";
import { PDFDocument, PDFName } from "pdf-lib";

const result = await build({
  entryPoints: ["src/shared/source-footer.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`;
const { addSourceFooter, formatFooterTimestamp, sourceFooterLines } = await import(moduleUrl);

const savedAt = Date.UTC(2026, 9, 3, 6, 5, 9);
assert.equal(formatFooterTimestamp(savedAt, 480), "2026-10-03 14:05:09 UTC+08:00");
assert.equal(formatFooterTimestamp(savedAt, -270), "2026-10-03 01:35:09 UTC-04:30");
assert.equal(formatFooterTimestamp(savedAt, 0), "2026-10-03 06:05:09 UTC+00:00");
const [urlLine, timeLine] = sourceFooterLines({ url: "https://example.com/café", savedAt });
assert.equal(urlLine, "Source: https://example.com/caf?");
assert.match(timeLine, /^Saved: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC[+-]\d{2}:\d{2}$/);
assert.equal(sourceFooterLines({ url: "https://例子.com/", savedAt })[0], "Source: https://??.com/");

async function createPdf(pageSizes) {
  const document = await PDFDocument.create();
  for (const size of pageSizes) document.addPage(size);
  return document.save();
}

function linkUris(page) {
  const annotations = page.node.Annots();
  if (!annotations) return [];
  return annotations.asArray().map((ref) => {
    const annotation = page.doc.context.lookup(ref);
    return annotation.lookup(PDFName.of("A")).lookup(PDFName.of("URI")).decodeText();
  });
}

// The last page grows downward; earlier pages and the original top edge are untouched.
{
  const input = await createPdf([[960, 14_400], [960, 3_000]]);
  const output = await addSourceFooter(input, { url: "https://example.com/article", savedAt });
  const document = await PDFDocument.load(output);
  const pages = document.getPages();
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].getMediaBox(), { x: 0, y: 0, width: 960, height: 14_400 });
  const media = pages[1].getMediaBox();
  assert.ok(media.y < 0 && media.y > -60, `footer band height ${-media.y}`);
  assert.equal(media.y + media.height, 3_000);
  assert.deepEqual(pages[1].getCropBox(), media);
  assert.deepEqual(linkUris(pages[1]), ["https://example.com/article"]);
}

// A last page already at the 200-inch limit gets a separate short footer page instead.
{
  const input = await createPdf([[960, 14_400]]);
  const output = await addSourceFooter(input, { url: "https://example.com/", savedAt });
  const document = await PDFDocument.load(output);
  const pages = document.getPages();
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].getMediaBox(), { x: 0, y: 0, width: 960, height: 14_400 });
  assert.equal(pages[1].getWidth(), 960);
  assert.ok(pages[1].getHeight() < 60);
  assert.deepEqual(linkUris(pages[1]), ["https://example.com/"]);
}

// Narrow pages and very long URLs stay within the page; non-web URLs get no link.
{
  const input = await createPdf([[120, 400]]);
  const output = await addSourceFooter(input, { url: `file:///${"a".repeat(500)}`, savedAt });
  const document = await PDFDocument.load(output);
  const [page] = document.getPages();
  assert.equal(page.getWidth(), 120);
  assert.deepEqual(linkUris(page), []);
}

console.log("Source footer tests: OK");
