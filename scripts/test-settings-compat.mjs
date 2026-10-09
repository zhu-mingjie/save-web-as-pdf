import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readdir,mkdtemp,writeFile,rm } from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateDist} from './release-utils.mjs';
async function load(contents) {
  const output = await build({stdin:{contents,resolveDir:process.cwd(),sourcefile:'settings-test.ts'},bundle:true,format:'esm',platform:'browser',target:'chrome120',write:false});
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
}
let saved, readOverride, fail=false;
const listeners=[];
globalThis.chrome={storage:{local:{get:async()=>readOverride?await readOverride():{'settings-v1':saved},set:async value=>{
  if(fail)throw Error('storage failed');saved=value['settings-v1'];listeners.forEach(fn=>fn({'settings-v1':{newValue:saved}},'local'));
}},onChanged:{addListener:fn=>listeners.push(fn)}},i18n:{getMessage:key=>'native:'+key,getUILanguage:()=> 'en-US'}};
const settings=await load('export * from "./src/shared/settings.ts"; export * from "./src/shared/catalogs.ts"; export * from "./src/shared/i18n.ts";');
assert.deepEqual(Object.keys(settings.LOCALES).sort(),(await readdir('_locales')).sort());
assert.deepEqual(await settings.readSettings(),{language:'auto',header:'none',footer:'none'});
assert.deepEqual(settings.normalizeSettings({language:'__proto__',header:'invalid',footer:null}),settings.DEFAULT_SETTINGS);
await settings.initializeI18n();assert.equal(settings.t('settingsTitle'),'native:settingsTitle');
await settings.writeSettings({language:'zh_CN',header:'url-time'});
assert.equal(settings.t('settingsTitle'),'设置');
assert.equal((await settings.readSettings()).header,'url-time');
assert.equal(settings.t('editorRemovedCount','7'),settings.formatMessage(settings.catalogs.zh_CN.editorRemovedCount,'7'));
fail=true;await assert.rejects(settings.writeSettings({footer:'time'}));assert.equal(saved.footer,'none');fail=false;
await settings.writeSettings({language:'auto'});assert.equal(settings.t('settingsTitle'),'native:settingsTitle');
let finishRead;readOverride=()=>new Promise(resolve=>{finishRead=resolve});
const initializing=settings.initializeI18n();
listeners.forEach(fn=>fn({'settings-v1':{newValue:{language:'ja'}}},'local'));
finishRead({'settings-v1':{language:'auto'}});await initializing;readOverride=null;
assert.equal(settings.t('settingsTitle'),settings.catalogs.ja.settingsTitle.message,'stale initialization must not overwrite new selection');
const oldTimezone=process.env.TZ;
process.env.TZ="Asia/Kathmandu";assert.ok(settings.exportTimestamp(Date.UTC(2026,0,1)).endsWith("UTC+05:45"));
process.env.TZ="America/St_Johns";assert.ok(settings.exportTimestamp(Date.UTC(2026,0,1)).endsWith("UTC-03:30"));
if(oldTimezone===undefined)delete process.env.TZ;else process.env.TZ=oldTimezone;
assert.match(settings.exportTimestamp(Date.UTC(2026,9,9)),/^2026-10-\d\d \d\d:\d\d:\d\d UTC[+-]\d\d:\d\d$/);
assert.equal(settings.formatMessage({message:'$COUNT$ $$',placeholders:{count:{content:'$1'}}},'7'),'7 $');
const nativeIterator=ReadableStream.prototype[Symbol.asyncIterator];
delete ReadableStream.prototype[Symbol.asyncIterator];
await load('import "./src/shared/browser-compat.ts"; export const loaded=true;');
let canceled=false;
const stream=new ReadableStream({start(controller){controller.enqueue('one');controller.enqueue('two');},cancel(){canceled=true;}});
for await(const value of stream){assert.equal(value,'one');break;}
assert.equal(canceled,true);assert.equal(stream.locked,false);
const values=[];for await(const value of new ReadableStream({start(c){c.enqueue(1);c.close();}}))values.push(value);
assert.deepEqual(values,[1]);
ReadableStream.prototype[Symbol.asyncIterator]=nativeIterator;
const generator=await load('export {generatePdf} from "./src/background/pdf-generator.ts";');
let printNumber=0, lastPdf, detached=0;
let currentDom={width:960,height:1200};
chrome.scripting={executeScript:async()=>[{frameId:0,result:currentDom}]};
chrome.debugger={attach:async()=>{},detach:async()=>{detached++;},sendCommand:async(_,method)=>{
  if(method==='Page.getLayoutMetrics')return {cssContentSize:{width:960,height:1200}};
  if(method==='Page.printToPDF'){
    printNumber++;const pageCount=printNumber<=3?2:1;
    lastPdf=btoa('%PDF-1.7\n'+Array.from({length:pageCount},()=>'/Type /Page\n').join('')+'%%EOF');
    return {stream:'test'};
  }
  if(method==='IO.read')return {data:lastPdf,base64Encoded:true,eof:true};
  return {};
}};
const generated=await generator.generatePdf(1,{width:960,height:1200,captureMode:'full-page',diagnostics:{prepared:{}}});
assert.equal(printNumber,4);assert.equal(generated.optimizeSinglePage,true);
assert.equal(generated.diagnostics.fallback,true);assert.equal(detached,1);
currentDom={width:960,height:1600};
const beforeRejectedPrint=printNumber;
await assert.rejects(generator.generatePdf(1,{width:960,height:1200,captureMode:'full-page',diagnostics:{prepared:{}}}),/errorLayoutChanged/);
assert.equal(printNumber,beforeRejectedPrint,'changed DOM must be rejected before printing');
assert.equal(detached,2,'layout rejection must detach');
currentDom={width:960,height:1200};
const wrapper=await load('export * from "./src/preview/last-page-optimizer.ts";');
chrome.runtime={getURL:path=>'extension:'+path};
let workers=[];
globalThis.Worker=class{constructor(){this.terminated=false;workers.push(this);}postMessage(value){this.task=value;}terminate(){this.terminated=true;}};
const bytes=new Uint8Array([1,2,3]);
const old=wrapper.optimizeLastPageHeight(bytes,{timeoutMs:10});
const stale=workers[0];const callback=stale.onmessage;
assert.equal((await old).reason,'optimization-deadline');assert.equal(stale.terminated,true);
const next=wrapper.optimizeLastPageHeight(bytes);
callback({data:{taskId:stale.task.taskId,result:{pdf:new Uint8Array([9]),status:'optimized',reason:'stale'}}});
const current=workers[1];current.onmessage({data:{taskId:current.task.taskId,result:{pdf:bytes,status:'unchanged',reason:'current'}}});
assert.equal((await next).reason,'current');assert.equal(current.terminated,true);
const sample=await mkdtemp(path.join(tmpdir(),'swp-package-scan-'));
try {
 await writeFile(path.join(sample,'manifest.json'),JSON.stringify({manifest_version:3,version:'0.5.3'}));
 await writeFile(path.join(sample,'runtime.js'),'throw new Error("PDFNodeStream only supports file:// URLs.")');await validateDist(sample);
 await writeFile(path.join(sample,'runtime.js'),'const resource="file:///private/test.txt"');await assert.rejects(validateDist(sample),/file URL/);
 await writeFile(path.join(sample,'runtime.js'),'const resource="file://example.test/path"');await assert.rejects(validateDist(sample),/file URL/);
} finally {await rm(sample,{recursive:true,force:true});}
console.log('Settings/compatibility tests: OK (storage, locale resources, stale reads, stream API simulation, maximum-height single-page branch, old-worker isolation)');
