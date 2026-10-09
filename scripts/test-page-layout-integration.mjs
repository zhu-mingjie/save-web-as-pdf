import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { PDFDocument } from 'pdf-lib';

// This suite bridges only Chrome API transport. Page preparation, dimension
// validation and PDF generation are production code running in a real browser.
const root = process.cwd();
const baseline = process.env.LAYOUT_TEST_BASELINE_REF;
const bundle = await build({
  stdin: { contents: `
    import { preparePage, cleanupPage } from './src/page/page-preparer';
    import { generatePdf } from './src/background/pdf-generator';
    globalThis.testLayout = async (header, footer, fontBase64, mutate = false) => {
      const before = { html: document.documentElement.style.cssText, body: document.body.style.cssText, children: document.documentElement.children.length };
      const prepared = await preparePage(new AbortController().signal, { header, footer, fontBase64, timestamp: '2026-10-09 12:34:56 UTC+08:00' });
      if (mutate) document.querySelector('main').style.height = '4200px';
      let generated, failure;
      try { generated = await generatePdf(1, prepared); }
      catch (error) { failure = error.message; }
      finally { await cleanupPage(); }
      const after = { html: document.documentElement.style.cssText, body: document.body.style.cssText, children: document.documentElement.children.length };
      const fonts = [...document.fonts].filter(font => font.family.startsWith('SWP_Metadata')).length;
      let base64 = '';
      if (generated) {
        let binary = ''; for(let n=0; n<generated.pdf.length; n+=8192) binary += String.fromCharCode(...generated.pdf.subarray(n,n+8192));
        base64 = btoa(binary);
      }
      return { prepared, diagnostics: generated?.diagnostics, failure, base64, before, after, fonts };
    };
  `, resolveDir: root, loader: 'ts' },
  bundle: true, format: 'iife', target: 'chrome120', write: false,
  plugins: baseline ? [{ name: 'previous-source', setup(builder) {
    builder.onLoad({ filter: /src\/(page\/page-preparer|background\/pdf-generator)\.ts$/ }, ({ path: file }) => ({
      contents: execFileSync('git', ['show', `${baseline}:${path.relative(root, file)}`], { encoding: 'utf8' }),
      loader: 'ts', resolveDir: path.dirname(file)
    }));
  }}] : []
});
const fontBase64 = (await readFile('assets/fonts/NotoSans-Regular.ttf')).toString('base64');
let nextId = 0, buffer = '', browserSession;
const pending = new Map();
let chrome;
const send = (method, params = {}, sessionId = browserSession) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 35_000);
  pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
  chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/cdp') {
      let body = ''; for await (const chunk of request) body += chunk;
      const { method, params } = JSON.parse(body);
      const result = await send(method, params);
      response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(result)); return;
    }
    const height = Number(url.searchParams.get('height') || 2100);
    const zoom = url.searchParams.get('zoom') || '1';
    const choice = url.searchParams.get('style') || 'percentage';
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><meta charset="utf-8"><title>Layout regression</title>
      <style>html,body{margin:0}html{zoom:${zoom}}${choice === 'percentage' ? 'html,body{height:100%}' : choice === 'constrained' ? 'body{max-width:700px;margin:24px auto}' : ''}
      main{height:${height}px;display:flex;flex-direction:column;justify-content:space-between}p{margin:0}</style>
      <main><p>BODY_START searchable</p><a href="https://example.com/body-end">BODY_END searchable</a></main>
      <script>globalThis.chrome={i18n:{getMessage:key=>key},scripting:{executeScript:async options=>[{frameId:0,result:options.func()}]},debugger:{attach:async()=>{},detach:async()=>{},sendCommand:async(_,method,params)=>(await fetch('/cdp',{method:'POST',body:JSON.stringify({method,params})})).json()}};</script>`);
  } catch (error) { response.statusCode = 500; response.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = await mkdtemp(path.join(os.tmpdir(), 'swp-layout-'));
const executable = process.env.CHROME_PATH ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome');
chrome = spawn(executable, [`--headless=${process.env.CHROME_HEADLESS_MODE || 'new'}`, '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe', `--user-data-dir=${profile}`], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
chrome.stdio[4].on('data', chunk => {
  buffer += chunk;
  while (buffer.includes('\0')) {
    const offset = buffer.indexOf('\0'), packet = buffer.slice(0, offset); buffer = buffer.slice(offset + 1);
    if (!packet) continue;
    const message = JSON.parse(packet), task = pending.get(message.id);
    if (task) { pending.delete(message.id); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); }
  }
});
try {
  console.log('Browser', (await send('Browser.getVersion', {}, null)).product, baseline ? `baseline=${baseline}` : 'current');
  const target = await send('Target.createTarget', { url: 'about:blank' }, null);
  browserSession = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, null)).sessionId;
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const cases = [
    ['percentage-both', 'percentage', 2100, '1', 'url-time', 'url-time'],
    ['percentage-header', 'percentage', 2100, '1', 'url', 'none'],
    ['percentage-footer', 'percentage', 2100, '1', 'none', 'time'],
    ['percentage-none', 'percentage', 2100, '1', 'none', 'none'],
    ['percentage-long', 'percentage', 19500, '1', 'url-time', 'url-time'],
    ['scaled-root', 'percentage', 2100, '.8', 'url-time', 'url-time'],
    ['constrained-body', 'constrained', 2100, '1', 'url-time', 'url-time'],
    ['real-layout-change', 'percentage', 2100, '1', 'url-time', 'url-time', true]
  ];
  let baselineFailures = 0;
  for (const [name, style, height, zoom, header, footer, mutate] of cases) {
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?style=${style}&height=${height}&zoom=${zoom}` });
    for (let n = 0; n < 100; n++) { if (await evaluate("document.readyState==='complete' && !!document.querySelector('main')")) break; await wait(50); }
    await evaluate(bundle.outputFiles[0].text);
    const result = await evaluate(`testLayout(${JSON.stringify(header)},${JSON.stringify(footer)},${JSON.stringify(fontBase64)},${!!mutate})`);
    assert.deepEqual(result.after, result.before, `${name}: temporary DOM/styles must restore`);
    assert.equal(result.fonts, 0, `${name}: font cleanup`);
    if (mutate) { assert.equal(result.failure, 'errorLayoutChanged'); console.log(name, 'correctly rejected'); continue; }
    if (baseline && name === 'scaled-root') { assert.equal(result.failure, 'errorLayoutChanged'); baselineFailures++; console.log(name, 'reproduced false layout error'); continue; }
    assert.equal(result.failure, undefined, `${name}: ${result.failure}`);
    const pdf = await PDFDocument.load(Buffer.from(result.base64, 'base64'));
    const expectedPages = height < 19000 ? 1 : 2;
    if (baseline && name === 'percentage-both') { assert.ok(pdf.getPageCount() > expectedPages); baselineFailures++; console.log(name, 'reproduced unnecessary pagination'); continue; }
    if (baseline) { console.log(name, pdf.getPageCount(), 'pages'); continue; }
    assert.equal(pdf.getPageCount(), expectedPages, `${name}: unexpected pagination`);
    assert.equal(result.diagnostics.attempts.length, 1, `${name}: unnecessary print retry`);
    // Validate searchable text and link presence through PDF.js, using the
    // browser PDF matrix for raster/box checks separately.
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(Buffer.from(result.base64, 'base64')), useSystemFonts: true, isEvalSupported: false });
    const document = await task.promise;
    let text = '', links = [], pageTexts = [];
    try { for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n); const pageText = (await page.getTextContent()).items.map(item => item.str || '').join(' '); text += pageText; pageTexts.push(pageText);
      links.push(...(await page.getAnnotations()).filter(item => item.subtype === 'Link').map(item => item.url));
    } } finally { await task.destroy(); }
    assert.ok(text.includes('BODY_START searchable') && text.includes('BODY_END searchable'), `${name}: body text lost`);
    assert.ok(links.includes('https://example.com/body-end'), `${name}: body link lost`);
    if (header.includes('url') || footer.includes('url')) assert.ok(links.some(link => link.startsWith('http://127.0.0.1:')), `${name}: metadata link lost`);
    if (header.includes('time') || footer.includes('time')) assert.ok(text.includes('2026-10-09'), `${name}: timestamp lost`);
    if (height >= 19000) {
      assert.ok(pageTexts[0].includes('BODY_START searchable') && !pageTexts[0].includes('BODY_END searchable'));
      assert.ok(pageTexts.at(-1).includes('BODY_END searchable'));
      assert.equal(pageTexts[0].split('2026-10-09').length - 1, 1, 'header must occur on the first page only');
      assert.equal(pageTexts.at(-1).split('2026-10-09').length - 1, 1, 'footer must occur on the last page only');
    }
    if (process.env.PDF_TEST_OUTPUT_DIRECTORY) await writeFile(path.join(process.env.PDF_TEST_OUTPUT_DIRECTORY, `${name}.pdf`), Buffer.from(result.base64, 'base64'));
    console.log(name, 'OK', { pages: pdf.getPageCount(), prepared: { width: result.prepared.width, height: result.prepared.height }, print: result.diagnostics.metrics });
  }
  if (baseline) assert.equal(baselineFailures, 2);
  console.log('Page layout integration: OK');
} finally {
  chrome.kill('SIGTERM'); await wait(500); server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
