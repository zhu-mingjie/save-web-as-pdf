import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const artifactDirectory = process.env.PDF_TEST_OUTPUT_DIRECTORY;

function chromeExecutable() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === "darwin") return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (process.platform === "win32") return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return "google-chrome";
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForFile(file, timeout = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      return await readFile(file, "utf8");
    } catch {
      await wait(50);
    }
  }
  throw new Error(`Timed out waiting for ${file}`);
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(url);
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method) {
    return new Promise((resolve) => {
      const callback = (params) => {
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((entry) => entry !== callback));
        resolve(params);
      };
      this.listeners.set(method, [...(this.listeners.get(method) ?? []), callback]);
    });
  }

  close() {
    this.socket.close();
  }
}

async function navigate(client, url) {
  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loaded;
  await client.send("Runtime.evaluate", {
    expression: "Promise.all([document.fonts.ready, ...Array.from(document.images, image => image.complete ? null : new Promise(resolve => { image.onload = image.onerror = resolve; }))])",
    awaitPromise: true
  });
}

function base64ToBytes(value) {
  return Buffer.from(value, "base64");
}

const harnessBuild = await build({
  stdin: {
    sourcefile: "last-page-browser-harness.ts",
    loader: "ts",
    resolveDir: root,
    contents: `
      import "./src/shared/browser-compat.ts";
      import { AnnotationMode, GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
      GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.js");
      import { optimizeLastPageHeight } from "./src/preview/last-page-optimizer.ts";
      import { addDecorations } from "./src/page/decorations.ts";
      import { createPrintPlan } from "./src/background/pdf-generator.ts";
      globalThis.prepareMetadataTest = async (header, footer) => {
        const font = new Uint8Array(await (await fetch('/fonts/NotoSans-Regular.ttf')).arrayBuffer());
        const state = { nodes: [], fonts: [] };
        await addDecorations(state, { header, footer, timestamp: '2026-10-09 12:34:56 UTC+05:45', fontBase64: encode(font) }, new AbortController().signal);
        await document.fonts.ready;
        const metrics = { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight };
        const plan = createPrintPlan(metrics);
        return { metrics, plan, nodes: state.nodes.length, url: location.origin + location.pathname };
      };
      globalThis.runLifecycleTest = async (base64) => {
        const pdf = decode(base64), NativeWorker = globalThis.Worker;
        let count = 0, terminated = 0;
        globalThis.Worker = class extends NativeWorker {
          constructor() { super('/busy-worker.js'); this.addEventListener('message', () => count++); }
          terminate() { terminated++; super.terminate(); }
        };
        try {
          const start = performance.now();
          const timeout = await optimizeLastPageHeight(pdf);
          const elapsed = performance.now() - start, stoppedAt = count;
          await new Promise(resolve => setTimeout(resolve, 150));
          if (timeout.reason !== 'optimization-deadline' || terminated !== 1 || count !== stoppedAt || elapsed < 19900 || elapsed > 21500) throw new Error('Hard deadline did not terminate busy worker');
          const abort = new AbortController();
          const canceled = optimizeLastPageHeight(pdf, { signal: abort.signal });
          setTimeout(() => abort.abort(), 250);
          let canceledName = '';
          try { await canceled; } catch (error) { canceledName = error.name; }
          const stoppedAfterCancel = count;
          await new Promise(resolve => setTimeout(resolve, 150));
          if (canceledName !== 'AbortError' || terminated !== 2 || count !== stoppedAfterCancel) throw new Error('Cancellation did not stop worker');
          globalThis.Worker = class { constructor() { throw new Error('simulated missing worker'); } };
          const failed = await optimizeLastPageHeight(pdf);
          if (failed.reason !== 'worker-initialization-failed') throw new Error('Missing worker fallback');
          globalThis.Worker = class extends NativeWorker { constructor() { super('/missing-worker.js', { type: 'module' }); } };
          const missingResource = await optimizeLastPageHeight(pdf);
          if (missingResource.reason !== 'worker-initialization-failed') throw new Error('Missing resource fallback');
          globalThis.Worker = NativeWorker;
          const recovery = await optimizeLastPageHeight(pdf, { allowSinglePage: true });
          if (recovery.status !== 'optimized') throw new Error('Retry after cancellation failed');
          return { elapsedMs: Math.round(elapsed), terminated, canceledName, recovery: recovery.status };
        } finally { globalThis.Worker = NativeWorker; }
      };

      function decode(value: string): Uint8Array {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
      }
      function encode(bytes: Uint8Array): string {
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        return btoa(binary);
      }
      async function inspect(bytes: Uint8Array) {
        const task = getDocument({ data: bytes.slice(), stopAtErrors: true, useWasm: false });
        try {
          const document = await task.promise;
          const pages = [];
          for (let number = 1; number <= document.numPages; number += 1) {
            const page = await document.getPage(number);
            const [text, annotations] = await Promise.all([
              page.getTextContent({ disableNormalization: true }),
              page.getAnnotations({ intent: "display" })
            ]);
            pages.push({
              view: [...page.view],
              text: text.items.map(item => "str" in item ? item.str : "").join("\\u0000"),
              annotations: annotations.map(annotation => ({
                subtype: annotation.subtype,
                rect: annotation.rect,
                url: annotation.url,
                dest: annotation.dest
              }))
            });
          }
          const lastPage = await document.getPage(document.numPages);
          const viewport = lastPage.getViewport({ scale: 1 });
          const canvas = globalThis.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { willReadFrequently: true });
          await lastPage.render({
            canvas,
            canvasContext: context,
            viewport,
            annotationMode: AnnotationMode.ENABLE,
            background: "rgba(0,0,0,0)",
            recordImages: true
          }).promise;
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let whitePageBackground = true;
          const bottomStats = { minR: 255, maxR: 0, minG: 255, maxG: 0, minB: 255, maxB: 0, minA: 255, maxA: 0 };
          const bottomStart = Math.max(0, canvas.height - 4) * canvas.width * 4;
          for (let offset = bottomStart; offset < pixels.length; offset += 4) {
            bottomStats.minR = Math.min(bottomStats.minR, pixels[offset]); bottomStats.maxR = Math.max(bottomStats.maxR, pixels[offset]);
            bottomStats.minG = Math.min(bottomStats.minG, pixels[offset + 1]); bottomStats.maxG = Math.max(bottomStats.maxG, pixels[offset + 1]);
            bottomStats.minB = Math.min(bottomStats.minB, pixels[offset + 2]); bottomStats.maxB = Math.max(bottomStats.maxB, pixels[offset + 2]);
            bottomStats.minA = Math.min(bottomStats.minA, pixels[offset + 3]); bottomStats.maxA = Math.max(bottomStats.maxA, pixels[offset + 3]);
            if (pixels[offset] < 248 || pixels[offset + 1] < 248 || pixels[offset + 2] < 248 || pixels[offset + 3] <= 8) {
              whitePageBackground = false;
              break;
            }
          }
          let contentBottom = 0;
          outer: for (let row = canvas.height - 1; row >= 0; row -= 1) {
            for (let alpha = row * canvas.width * 4 + 3; alpha < (row + 1) * canvas.width * 4; alpha += 4) {
              const whiteBackgroundPixel = whitePageBackground && pixels[alpha] > 8 && pixels[alpha - 3] >= 252 && pixels[alpha - 2] >= 252 && pixels[alpha - 1] >= 252;
              if (pixels[alpha] > 8 && !whiteBackgroundPixel) {
                contentBottom = row + 1;
                break outer;
              }
            }
          }
          const imageCoordinates = lastPage.imageCoordinates;
          if (imageCoordinates && imageCoordinates.length % 6 === 0) {
            for (let offset = 0; offset < imageCoordinates.length; offset += 6) {
              contentBottom = Math.max(contentBottom, Math.max(imageCoordinates[offset + 1], imageCoordinates[offset + 3], imageCoordinates[offset + 5]) * canvas.height);
            }
          }
          const lastAnnotations = await lastPage.getAnnotations({ intent: "display" });
          for (const annotation of lastAnnotations) {
            if (!annotation.rect || annotation.rect.length !== 4) continue;
            const [x1, y1, x2, y2] = annotation.rect;
            const points = [
              viewport.convertToViewportPoint(x1, y1), viewport.convertToViewportPoint(x1, y2),
              viewport.convertToViewportPoint(x2, y1), viewport.convertToViewportPoint(x2, y2)
            ];
            contentBottom = Math.max(contentBottom, ...points.map(point => point[1]));
          }
          return { pages, blankBottomPoints: canvas.height - contentBottom, whitePageBackground, bottomStats, imageCoordinates: imageCoordinates ? Array.from(imageCoordinates) : [] };
        } finally {
          await task.destroy();
        }
      }
      globalThis.runPdfTest = async (base64: string, allowSinglePage = false) => {
        const original = decode(base64);
        const before = await inspect(original);
        const result = await optimizeLastPageHeight(original, { allowSinglePage });
        const after = await inspect(result.pdf);
        return {
          result: {
            status: result.status,
            reason: result.reason,
            originalLastPageHeight: result.originalLastPageHeight,
            optimizedLastPageHeight: result.optimizedLastPageHeight
          },
          before,
          after,
          optimizedPdf: encode(result.pdf)
        };
      };
    `
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  define: { process: "undefined" },
  minify: true,
  write: false
});

const fixture = await readFile(path.join(root, "scripts/fixtures/export-regression.html"));
const forcedBreak = await readFile(path.join(root, "scripts/fixtures/forced-break.css"));
const worker = await readFile(path.join(root, "dist/vendor/pdf.worker.min.js"));
const harness = harnessBuild.outputFiles[0].contents;
const harnessHtml = Buffer.from(
  '<!doctype html><meta charset="utf-8"><script>globalThis.chrome={runtime:{getURL:path=>location.origin+"/"+path}}</script><script type="module" src="/harness.js"></script>'
);
const english = JSON.parse(await readFile(path.join(root, '_locales/en/messages.json'), 'utf8'));
const popupMock = `let saved=JSON.parse(localStorage.getItem('settings')||'null'), listeners=[];
  globalThis.testStorage={fail:false};
  globalThis.chrome={i18n:{getMessage:key=>(${JSON.stringify(english)})[key]?.message||'',getUILanguage:()=> 'en-US'},
  storage:{onChanged:{addListener:fn=>listeners.push(fn)},local:{get:async()=>({'settings-v1':saved}),set:async data=>{
    if(testStorage.fail)throw new Error('simulated storage failure');
    saved=data['settings-v1'];localStorage.setItem('settings',JSON.stringify(saved));listeners.forEach(fn=>fn({'settings-v1':{newValue:saved}},'local'));
  }}}};`;
const fontResource = await readFile(path.join(root, "assets/fonts/NotoSans-Regular.ttf"));
const popupResource = Buffer.from((await readFile(path.join(root,'dist/popup/popup.html'),'utf8')).replace('<head>', '<head><base href="/popup/"><script>'+popupMock+'</script>'));
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const resources = {
    "/export-regression.html": ["text/html; charset=utf-8", fixture],
    "/forced-break.css": ["text/css; charset=utf-8", forcedBreak],
    "/harness.html": ["text/html; charset=utf-8", harnessHtml],
    "/harness.js": ["text/javascript; charset=utf-8", harness],
    "/vendor/pdf.worker.min.js": ["text/javascript; charset=utf-8", worker],
    "/fonts/NotoSans-Regular.ttf": ["font/ttf", fontResource],
    "/busy-worker.js": ["text/javascript", Buffer.from("onmessage=()=>{let n=0;while(true){if(++n%10000000===0)postMessage({tick:n});}}")],
    "/metadata-fixture.html": ["text/html", Buffer.from('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:960px}body{font:16px sans-serif}.body{height:'+new URL(request.url,"http://localhost").searchParams.get("height")+'px;display:flex;flex-direction:column;justify-content:space-between}</style><div class="body"><p>BODY_START 中文 العربية</p><a href="https://example.com/body">BODY_END 最后一行</a></div><script>globalThis.chrome={runtime:{getURL:path=>location.origin+"/"+path}}</script><script type="module" src="/harness.js"></script>')],
    "/popup-test.html": ["text/html", popupResource]

  };
  let resource = resources[pathname];
  if (!resource && (pathname.startsWith("/preview/") || pathname.startsWith("/vendor/") || pathname.startsWith("/popup/") || pathname.startsWith("/icons/"))) {
    try {
      const data = await readFile(path.join(root, "dist", pathname.slice(1)));
      resource = [pathname.endsWith(".js") ? "text/javascript" : pathname.endsWith(".css") ? "text/css" : pathname.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream", data];
    } catch {}
  }
  if (!resource) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": resource[0], "cache-control": "no-store" });
  response.end(resource[1]);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const profile = await mkdtemp(path.join(os.tmpdir(), "save-web-as-pdf-chrome-"));
if (artifactDirectory) await mkdir(artifactDirectory, { recursive: true });
const chrome = spawn(
  chromeExecutable(),
  [`--headless=${process.env.CHROME_HEADLESS_MODE ?? "new"}`, "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"],
  { stdio: ["ignore", "ignore", "pipe"] }
);

let chromeDiagnostics = "";
chrome.stderr.on("data", chunk => { chromeDiagnostics = (chromeDiagnostics + chunk.toString()).slice(-5000); });
let client;
try {
  const activePort = (await waitForFile(path.join(profile, "DevToolsActivePort"))).trim().split(/\s+/);
  const debugPort = activePort[0];
  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`, {
    method: "PUT"
  }).then((response) => response.json());
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  client.listeners.set("Runtime.consoleAPICalled", [
    (event) => {
      if (event.type === "warning" || event.type === "error") {
        console.error("Browser console:", event.args.map((argument) => argument.description ?? argument.value).join(" "));
      }
    }
  ]);

  const cases = [
    { name: "two-page-text", height: 19_500, ending: "text", expected: "optimized" },
    { name: "three-page-link", height: 40_000, ending: "link", expected: "optimized" },
    { name: "two-page-image", height: 19_500, ending: "image", expected: "optimized" },
    { name: "two-page-table", height: 19_500, ending: "table", expected: "optimized" },
    { name: "two-page-svg", height: 19_500, ending: "svg", expected: "optimized" },
    { name: "two-page-light", height: 19_500, ending: "light", expected: "optimized" },
    { name: "two-page-shadow", height: 19_500, ending: "shadow", expected: "optimized" },
    { name: "two-page-background", height: 19_500, ending: "text", background: "page", expected: "unchanged" },
    { name: "two-page-nearly-full", height: 38_390, ending: "text", expected: "unchanged" },
    { name: "single-page", height: 12_000, ending: "text", paperHeight: 125.01, expected: "unchanged" },
    { name: "fallback-single-page", height: 12_000, ending: "link", allowSinglePage: true, expected: "optimized" }
  ];
  const summaries = [];
  for (const testCase of cases) {
    const query = new URLSearchParams({ height: String(testCase.height), ending: testCase.ending });
    if (testCase.background) query.set("background", testCase.background);
    await navigate(client, `${origin}/export-regression.html?${query}`);
    const printed = await client.send("Page.printToPDF", {
      printBackground: true,
      paperWidth: 10.01,
      paperHeight: testCase.paperHeight ?? 200,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      scale: 1,
      preferCSSPageSize: false,
      transferMode: "ReturnAsBase64"
    });
    await navigate(client, `${origin}/harness.html`);
    const evaluation = await client.send("Runtime.evaluate", {
      expression: `runPdfTest(${JSON.stringify(printed.data)}, ${testCase.allowSinglePage === true})`,
      awaitPromise: true,
      returnByValue: true
    });
    if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.text);
    const value = evaluation.result.value;
    if (value.result.status !== testCase.expected) console.error("Unexpected result:", JSON.stringify({ ...value, optimizedPdf: "omitted" }, null, 2).slice(0, 8000));
    assert.equal(value.result.status, testCase.expected, `${testCase.name}: ${value.result.reason}`);
    assert.equal(value.before.pages.length, value.after.pages.length, testCase.name);
    assert.deepEqual(
      value.before.pages.slice(0, -1).map((page) => page.view),
      value.after.pages.slice(0, -1).map((page) => page.view),
      testCase.name
    );
    assert.equal(value.before.pages.at(-1).text, value.after.pages.at(-1).text, testCase.name);
    assert.deepEqual(value.before.pages.at(-1).annotations, value.after.pages.at(-1).annotations, testCase.name);
    if (testCase.expected === "optimized") {
      assert.ok(value.after.pages.at(-1).view[3] - value.after.pages.at(-1).view[1] < value.before.pages.at(-1).view[3] - value.before.pages.at(-1).view[1]);
      assert.ok(value.after.blankBottomPoints >= 10 && value.after.blankBottomPoints <= 16, `${testCase.name}: padding ${value.after.blankBottomPoints}`);
    }
    if (testCase.name === "two-page-text" && artifactDirectory) {
      await writeFile(path.join(artifactDirectory, "last-page-before.pdf"), base64ToBytes(printed.data));
      await writeFile(path.join(artifactDirectory, "last-page-after.pdf"), base64ToBytes(value.optimizedPdf));
    }
    summaries.push({
      name: testCase.name,
      status: value.result.status,
      reason: value.result.reason,
      pages: value.after.pages.length,
      beforeHeight: value.before.pages.at(-1).view[3] - value.before.pages.at(-1).view[1],
      afterHeight: value.after.pages.at(-1).view[3] - value.after.pages.at(-1).view[1],
      blankBottomPoints: value.after.blankBottomPoints,
      annotations: value.after.pages.at(-1).annotations.length
    });
  }
  console.log(JSON.stringify(summaries, null, 2));
  const evaluate = async expression => {
    const response = await client.send('Runtime.evaluate', { expression, awaitPromise:true, returnByValue:true });
    if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);
    return response.result.value;
  };
  const choices = ['none','url','time','url-time'];
  const metadataSummaries=[];
  for(const height of [1200,19500])for(const header of choices)for(const footer of choices){
    await navigate(client, `${origin}/metadata-fixture.html?height=${height}&private=secret#private`);
    const prepared=await evaluate(`prepareMetadataTest('${header}','${footer}')`);
    assert.equal(prepared.nodes,Number(header!=='none')+Number(footer!=='none'));
    const printed=await client.send('Page.printToPDF',{printBackground:true,paperWidth:prepared.plan.paperWidth,paperHeight:prepared.plan.paperHeights.at(-1),scale:prepared.plan.scale,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,preferCSSPageSize:false});
    await navigate(client,`${origin}/harness.html`);
    const value=await evaluate(`runPdfTest(${JSON.stringify(printed.data)})`);
    const pages=value.after.pages;
    const urlCount=Number(header.includes('url'))+Number(footer.includes('url'));
    assert.equal(pages.flatMap(p=>p.annotations).filter(a=>a.url===prepared.url).length,urlCount,'URL annotations');
    const timeCount=Number(header.includes('time'))+Number(footer.includes('time'));
    const text=pages.map(p=>p.text.replaceAll('\\u0000','').replaceAll(String.fromCharCode(0),'')).join(' ');
    assert.equal(text.split('2026-10-09 12:34:56 UTC+05:45').length-1,timeCount,'timestamp occurrences');
    assert.ok(!text.includes('private=secret'));
    if(artifactDirectory&&height===19500&&header==='url-time'&&footer==='url-time')await writeFile(path.join(artifactDirectory,'metadata-after.pdf'),base64ToBytes(value.optimizedPdf));
    assert.ok(pages[0].text.includes('BODY_START')&&pages.at(-1).text.includes('BODY_END'));
    if(header.includes('time'))assert.ok(pages[0].text.includes('UTC+05:45'));
    if(footer.includes('time'))assert.ok(pages.at(-1).text.includes('UTC+05:45'));
    if(pages.length>1){
      if(header.includes('url'))assert.equal(pages[0].annotations.filter(a=>a.url===prepared.url).length,1);
      if(footer.includes('url'))assert.equal(pages.at(-1).annotations.filter(a=>a.url===prepared.url).length,1);
      assert.ok(value.after.blankBottomPoints<=16,'metadata counted in tail bound');
    }
    metadataSummaries.push({height,header,footer,pages:pages.length});
  }
  for(const test of [{height:19185,long:false,pages:2},{height:1200,long:true},{height:40000,long:false,pages:3}]){
    await navigate(client,`${origin}/metadata-fixture.html?height=${test.height}`);
    if(test.long)await evaluate(`history.replaceState(null,'','/中文/العربية/'+ 'long-path-'.repeat(40)+'?secret=value#secret')`);
    const prepared=await evaluate("prepareMetadataTest('url-time','url-time')");
    const printed=await client.send('Page.printToPDF',{printBackground:true,paperWidth:prepared.plan.paperWidth,paperHeight:prepared.plan.paperHeights.at(-1),scale:prepared.plan.scale,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,preferCSSPageSize:false});
    await navigate(client,`${origin}/harness.html`);
    const value=await evaluate(`runPdfTest(${JSON.stringify(printed.data)})`);
    if(!test.long)assert.equal(value.after.pages.length,test.pages,'metadata must use common safe pagination');
    for(const middle of value.after.pages.slice(1,-1)){assert.ok(!middle.text.includes('UTC+05:45'));assert.ok(!middle.annotations.some(a=>a.url===prepared.url));}
    assert.ok(value.after.pages.every(p=>p.view[3]-p.view[1]<=14400));
    assert.equal(value.after.pages.flatMap(p=>p.annotations).filter(a=>a.url.includes('secret')).length,0);
    assert.ok(value.after.pages.at(-1).text.includes('UTC+05:45'));
    assert.equal(value.before.pages.at(-1).text,value.after.pages.at(-1).text);
  }
  console.log('Metadata: all 16 combinations on single/multiple pages, Unicode long URL and capacity boundary OK');
  await navigate(client,`${origin}/popup-test.html`);
  await wait(100);
  assert.deepEqual(await evaluate("['language','header','footer'].map(id=>document.getElementById(id).value)"),['auto','none','none']);
  await evaluate("document.getElementById('settings-open').click()");
  assert.equal(await evaluate("document.getElementById('settings-view').hidden"),false);
  assert.equal(await evaluate("document.body.scrollWidth"),320);
  assert.ok(await evaluate("document.body.scrollHeight < 300"));
  await evaluate("document.getElementById('language').value='zh_CN';document.getElementById('language').dispatchEvent(new Event('change'));new Promise(r=>setTimeout(r,60))");
  assert.equal(await evaluate("document.getElementById('settings-open').getAttribute('aria-label')"),'设置');
  if(artifactDirectory){
    const height=await evaluate('document.body.scrollHeight');
    const screenshot=await client.send('Page.captureScreenshot',{clip:{x:0,y:0,width:320,height,scale:2}});
    await writeFile(path.join(artifactDirectory,'settings.png'),Buffer.from(screenshot.data,'base64'));
  }
  await navigate(client,`${origin}/popup-test.html`);await wait(100);
  assert.equal(await evaluate("document.getElementById('language').value"),'zh_CN');
  await evaluate("document.getElementById('settings-open').click();testStorage.fail=true;document.getElementById('header').value='time';document.getElementById('header').dispatchEvent(new Event('change'));new Promise(r=>setTimeout(r,60))");
  assert.equal(await evaluate("document.getElementById('header').value"),'none');
  assert.equal(await evaluate("document.getElementById('settings-status').hidden"),false);
  await evaluate("testStorage.fail=false;document.getElementById('language').value='auto';document.getElementById('language').dispatchEvent(new Event('change'));new Promise(r=>setTimeout(r,60))");
  assert.equal(await evaluate("document.getElementById('settings-open').getAttribute('aria-label')"),'Settings');
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
  assert.equal(await evaluate("document.getElementById('home-view').hidden"),false);
  await evaluate("localStorage.setItem('settings',JSON.stringify({language:'invalid',header:'old',footer:'obsolete'}))");
  await navigate(client,`${origin}/popup-test.html`);await wait(100);
  assert.deepEqual(await evaluate("['language','header','footer'].map(id=>document.getElementById(id).value)"),['auto','none','none']);
  console.log('Popup: defaults, native selects, 320px/content height, manual/auto language, persistence, failed write rollback, Escape/back and invalid values OK');
  await navigate(client,`${origin}/export-regression.html?height=1200&ending=link`);
  const lifecyclePdf=await client.send('Page.printToPDF',{paperWidth:10.01,paperHeight:200,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,printBackground:true});
  await navigate(client,`${origin}/harness.html`);
  console.log('Worker lifecycle:',await evaluate(`runLifecycleTest(${JSON.stringify(lifecyclePdf.data)})`));
  console.log("Last-page browser integration tests: OK");
} catch (error) {
  console.error("Chrome diagnostics:", chromeDiagnostics);
  throw error;
} finally {
  client?.close();
  const exited = new Promise((resolve) => chrome.once("exit", resolve));
  chrome.kill("SIGTERM");
  await Promise.race([exited, wait(2_000)]);
  server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
