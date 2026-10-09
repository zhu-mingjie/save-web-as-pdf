import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import {createServer} from 'node:http';
import path from 'node:path';
const root=process.cwd();
const server=createServer((request,response)=>{response.setHeader('content-type','text/html; charset=utf-8');response.end('<!doctype html><meta charset="utf-8"><title>Controlled 中文</title><style>html,body{margin:0;width:960px;height:100%}main{height:19500px;display:flex;flex-direction:column;justify-content:space-between}</style><main><p>START 中文</p><a href="https://example.com/end">END 最后一行</a></main>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const executable=process.env.CHROME_PATH??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':'google-chrome');
const profile=await mkdtemp(path.join(os.tmpdir(),'swp-pipe-'));
const processChrome=spawn(executable,['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--enable-unsafe-extension-debugging',`--user-data-dir=${profile}`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let id=0,pending=new Map(),buffer='';
processChrome.stderr.on('data',()=>{});
processChrome.stdio[4].on('data',chunk=>{buffer+=chunk.toString();while(buffer.includes('\0')){const offset=buffer.indexOf('\0');const packet=buffer.slice(0,offset);buffer=buffer.slice(offset+1);if(!packet)continue;const value=JSON.parse(packet);const item=pending.get(value.id);if(item){pending.delete(value.id);if(value.error)item.reject(Error(value.error.message));else item.resolve(value.result);}}});
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});processChrome.stdio[3].write(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})})+'\0');});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 console.log('Version',await send('Browser.getVersion'));
 const extension=await send('Extensions.loadUnpacked',{path:path.join(root,'dist')});console.log('Loaded',extension);
 const created=await send('Target.createTarget',{url:`chrome-extension://${extension.id}/popup/popup.html`});
 const attached=await send('Target.attachToTarget',{targetId:created.targetId,flatten:true});const session=attached.sessionId;
 await wait(500);
 const evaluate=async expression=>{const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description);return value.result.value;};
 console.log('Popup',await evaluate("({version:chrome.runtime.getManifest().version,storage:!!chrome.storage.local,title:document.title})"));
 console.log('Resources',await evaluate("Promise.all(['fonts/NotoSans-Regular.ttf','preview/optimizer-worker.js','vendor/cmaps/Adobe-GB1-UCS2.bcmap'].map(async p=>{const r=await fetch(chrome.runtime.getURL(p));return {path:p,ok:r.ok,bytes:(await r.arrayBuffer()).byteLength}}))"));
 // Chrome's own protocol produces a fixture PDF. Seed only the local handoff DB,
 // then open the unmodified production preview under real extension CSP.
 const fixture=await send('Target.createTarget',{url:origin});
 const page=await send('Target.attachToTarget',{targetId:fixture.targetId,flatten:true});
 await wait(500);
 const printed=await send('Page.printToPDF',{paperWidth:10.01,paperHeight:200,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,printBackground:true},page.sessionId);
 await evaluate(`(async()=>{
   await chrome.storage.local.set({'settings-v1':{language:'zh_CN',header:'none',footer:'none'}});
   const req=indexedDB.open('save-web-as-pdf',1);req.onupgradeneeded=()=>req.result.createObjectStore('pdfs',{keyPath:'id'});
   const db=await new Promise((r,j)=>{req.onsuccess=()=>r(req.result);req.onerror=()=>j(req.error)});
   const tx=db.transaction('pdfs','readwrite');tx.objectStore('pdfs').put({id:'native-smoke',blob:new Blob([Uint8Array.from(atob(${JSON.stringify(printed.data)}),c=>c.charCodeAt(0))],{type:'application/pdf'}),metadata:{title:'中文',filename:'中文.pdf',url:'https://example.com/article',hostname:'example.com'},createdAt:Date.now()});await new Promise((r,j)=>{tx.oncomplete=r;tx.onerror=j});db.close();return true;
 })()`);
 await send('Page.navigate',{url:`chrome-extension://${extension.id}/preview/preview.html?id=native-smoke`},session);
 let result;
 for(let attempt=0;attempt<100;attempt++){await wait(250);result=await evaluate("({ready:!document.getElementById('download')?.disabled,status:document.getElementById('status')?.textContent,src:document.getElementById('preview')?.src,label:document.getElementById('download')?.textContent})");if(result.ready&&result.src?.startsWith('blob:'))break;}
 if(!result.ready||!result.src?.startsWith('blob:chrome-extension:'))throw Error(JSON.stringify(result));
 console.log('Native extension CSP/preview worker OK',result);
 const output=await evaluate("(async()=>{const bytes=new Uint8Array(await(await fetch(document.getElementById('preview').src)).arrayBuffer());let str='';for(let n=0;n<bytes.length;n+=8192)str+=String.fromCharCode(...bytes.subarray(n,n+8192));return btoa(str)})()");
 if(process.env.PDF_TEST_OUTPUT_DIRECTORY)await writeFile(path.join(process.env.PDF_TEST_OUTPUT_DIRECTORY,'native-preview.pdf'),Buffer.from(output,'base64'));

 await evaluate("chrome.storage.local.set({'settings-v1':{language:'zh_CN',header:'url-time',footer:'url-time'}})");
 // Activate the real toolbar action, granting activeTab to this local fixture.
 await send('Page.bringToFront',{},page.sessionId);
 const tabs=await send('Target.getTargets',{filter:[{type:'tab'}]});
 const fixtureTab=tabs.targetInfos.find(target=>target.url===origin+'/');
 if(!fixtureTab)throw Error('Fixture tab target missing');
 await send('Extensions.triggerAction',{id:extension.id,targetId:fixtureTab.targetId});await wait(300);
 let targets=await send('Target.getTargets');
 const popup=targets.targetInfos.find(target=>target.url.endsWith('/popup/popup.html')&&target.targetId!==created.targetId);
 if(!popup)throw Error('Toolbar popup did not open');
 const popupSession=await send('Target.attachToTarget',{targetId:popup.targetId,flatten:true});
 const readyPopup=async sessionId=>{for(let attempt=0;attempt<40;attempt++){const ready=await send('Runtime.evaluate',{expression:"document.getElementById('language')?.disabled===false&&document.readyState==='complete'",returnByValue:true},sessionId);if(ready.result.value){await wait(30);return;}await wait(100);}throw Error('Popup initialization timed out');};
 await readyPopup(popupSession.sessionId);
 await send('Runtime.evaluate',{expression:"document.getElementById('save').click()"},popupSession.sessionId);
 let exported;
 for(let attempt=0;attempt<120;attempt++){
   await wait(250);targets=await send('Target.getTargets');
   exported=targets.targetInfos.find(target=>target.url.includes('/preview/preview.html?id=')&&!target.url.endsWith('native-smoke'));
   if(exported)break;
 }
 if(!exported){const failure=await send('Runtime.evaluate',{expression:"document.getElementById('status').textContent",returnByValue:true},popupSession.sessionId);throw Error('Full-save preview missing: '+failure.result.value);}
 const exportedSession=await send('Target.attachToTarget',{targetId:exported.targetId,flatten:true});
 let exportedState;
 for(let attempt=0;attempt<100;attempt++){
   await wait(250);const state=await send('Runtime.evaluate',{expression:"({ready:!document.getElementById('download')?.disabled,source:document.getElementById('source')?.textContent,filename:document.getElementById('filename')?.value,src:document.getElementById('preview')?.src})",returnByValue:true},exportedSession.sessionId);exportedState=state.result.value;if(exportedState?.ready&&exportedState.src?.startsWith('blob:'))break;
 }
 if(!exportedState?.ready||!exportedState.filename.includes('Controlled 中文'))throw Error(JSON.stringify(exportedState));
 await wait(500);
 const clean=await send('Runtime.evaluate',{expression:"({nodes:document.documentElement.children.length,fonts:[...document.fonts].filter(f=>f.family.startsWith('SWP_Metadata')).length,rootHeight:document.documentElement.style.height,bodyHeight:document.body.style.height})",returnByValue:true},page.sessionId);
 if(clean.result.value.rootHeight||clean.result.value.bodyHeight)throw Error('Temporary root/body sizing leaked');
 if(clean.result.value.fonts!==0)throw Error('Temporary fonts leaked');
 console.log('Installed full-save pipeline OK',exportedState.filename,clean.result.value);

 await send('Page.bringToFront',{},page.sessionId);
 await send('Extensions.triggerAction',{id:extension.id,targetId:fixtureTab.targetId});await wait(300);
 targets=await send('Target.getTargets');
 const editorPopup=targets.targetInfos.find(target=>target.url.endsWith('/popup/popup.html')&&target.targetId!==created.targetId);
 const editorPopupSession=await send('Target.attachToTarget',{targetId:editorPopup.targetId,flatten:true});
 await readyPopup(editorPopupSession.sessionId);
 await send('Runtime.evaluate',{expression:"document.getElementById('edit').click()"},editorPopupSession.sessionId);await wait(500);
 const editorNode=async id=>{
   const tree=await send('DOM.getDocument',{depth:-1,pierce:true},page.sessionId);
   const search=node=>{if(node.attributes?.some((value,index)=>value==='id'&&node.attributes[index+1]===id))return node;for(const child of [...(node.children??[]),...(node.shadowRoots??[])]){const match=search(child);if(match)return match;}};
   const node=search(tree.root);if(!node)throw Error('Editor node missing: '+id);
   return (await send('DOM.resolveNode',{nodeId:node.nodeId},page.sessionId)).object.objectId;
 };
 const clickEditor=async id=>await send('Runtime.callFunctionOn',{objectId:await editorNode(id),functionDeclaration:'function(){this.click()}'},page.sessionId);
 for(let attempt=0;attempt<40;attempt++){const ready=await send('Runtime.evaluate',{expression:"!!document.getElementById('__swp_editor_host__')",returnByValue:true},page.sessionId);if(ready.result.value)break;await wait(100);}
 await clickEditor('got-it');
 await evaluate("chrome.storage.local.set({'settings-v1':{language:'en',header:'url-time',footer:'url-time'}})");await wait(100);
 const undo=await send('Runtime.callFunctionOn',{objectId:await editorNode('undo'),functionDeclaration:'function(){return this.textContent}',returnByValue:true},page.sessionId);
 if(undo.result.value!=='Undo')throw Error('Closed editor failed immediate language update');
 await clickEditor('save');
 let edited;
 for(let attempt=0;attempt<120;attempt++){
   await wait(250);targets=await send('Target.getTargets');edited=targets.targetInfos.find(target=>target.url.includes('/preview/preview.html?id=')&&!target.url.endsWith('native-smoke')&&target.targetId!==exported.targetId);if(edited)break;
 }
 if(!edited)throw Error('Edit-save preview missing');
 const editedSession=await send('Target.attachToTarget',{targetId:edited.targetId,flatten:true});
 let editedState;
 for(let attempt=0;attempt<100;attempt++){
   await wait(250);const state=await send('Runtime.evaluate',{expression:"({ready:!document.getElementById('download')?.disabled,label:document.getElementById('download')?.textContent,src:document.getElementById('preview')?.src})",returnByValue:true},editedSession.sessionId);editedState=state.result.value;if(editedState?.ready&&editedState.src?.startsWith('blob:'))break;
 }
 if(!editedState?.ready||editedState.label!=='Download PDF')throw Error(JSON.stringify(editedState));
 await wait(500);
 const editorClean=await send('Runtime.evaluate',{expression:"({editor:!!document.getElementById('__swp_editor_host__'),fonts:[...document.fonts].filter(f=>f.family.startsWith('SWP_Metadata')).length})",returnByValue:true},page.sessionId);
 if(editorClean.result.value.editor||editorClean.result.value.fonts)throw Error('Editor/page resources leaked: '+JSON.stringify(editorClean.result.value));
 console.log('Installed edit-save/language/cleanup OK',editorClean.result.value);

 await send('Page.bringToFront',{},page.sessionId);
 const beforeCancel=(await send('Target.getTargets')).targetInfos.filter(t=>t.url.includes('/preview/preview.html?id=')).map(t=>t.targetId);
 await send('Extensions.triggerAction',{id:extension.id,targetId:fixtureTab.targetId});await wait(300);
 targets=await send('Target.getTargets');
 const cancelPopup=targets.targetInfos.find(t=>t.url.endsWith('/popup/popup.html')&&t.targetId!==created.targetId);
 const cancelSession=await send('Target.attachToTarget',{targetId:cancelPopup.targetId,flatten:true});await readyPopup(cancelSession.sessionId);
 await send('Runtime.evaluate',{expression:"(async()=>{document.getElementById('save').click();await new Promise(r=>setTimeout(r,100));document.getElementById('cancel').click()})()",awaitPromise:true},cancelSession.sessionId);
 await wait(1500);
 const afterCancel=(await send('Target.getTargets')).targetInfos.filter(t=>t.url.includes('/preview/preview.html?id=')).map(t=>t.targetId);
 if(afterCancel.some(id=>!beforeCancel.includes(id)))throw Error('Canceled export opened preview');
 const cancelState=await send('Runtime.evaluate',{expression:"({message:document.getElementById('status').textContent,enabled:!document.getElementById('save').disabled})",returnByValue:true},cancelSession.sessionId);
 if(!cancelState.result.value.enabled||!cancelState.result.value.message.toLowerCase().includes('cancel'))throw Error(JSON.stringify(cancelState.result.value));
 console.log('Installed active export cancel: no preview, controls restored OK');
 console.log('Installed extension runtime tests: OK (actual CSP, storage, resources, production preview)');
}finally{processChrome.kill('SIGTERM');await wait(1000);server.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
