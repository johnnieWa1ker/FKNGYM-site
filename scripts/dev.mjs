import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { watch,watchFile,unwatchFile } from 'node:fs';
import { resolve,extname,sep } from 'node:path';
import { syncAppData,siteRoot,defaultAppRoot } from './sync-app-data.mjs';
import { renderHTML } from './render-html.mjs';
const appRoot=process.env.FKNGYM_APP_ROOT||defaultAppRoot;
let revision=0, syncing=Promise.resolve();
async function sync() { const data=await syncAppData({appRoot}); await renderHTML(data); revision++; }
await sync();
const sourceFiles=['Prices.storekit','Localizable.xcstrings'].map(file=>resolve(appRoot,'Resources',file));
for (const file of sourceFiles) watchFile(file,{interval:750},()=>{
  syncing=syncing.then(sync).then(()=>console.log('Updated data from FKNGYM.')).catch(error=>console.error(`Sync failed; keeping last valid data: ${error.message}`));
});
const watcher=watch(siteRoot,{recursive:true},(_,filename)=>{ if (filename && !/^(\.git|dist|node_modules)/.test(filename)) revision++; });
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const reloadScript=`let current; setInterval(async()=>{try{const next=await(await fetch('/__revision')).text();if(current!==undefined&&current!==next)location.reload();current=next;}catch{}},1000);`;
const server=createServer(async(req,res)=>{
  try {
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    res.setHeader('Cache-Control','no-store');
    if (path==='/__revision') return res.end(String(revision));
    if (path==='/__reload.js') {res.setHeader('Content-Type',types['.js']);return res.end(reloadScript);}
    if (!/^\/(?:$|index\.html$|(?:privacy|terms|support)(?:\/|$)|assets\/|locales\/|data\/|(?:script|pricing)\.js$|styles\.css$)/.test(path)) {res.writeHead(404);return res.end('Not found');}
    let target=resolve(siteRoot,`.${path}`);
    if (!target.startsWith(siteRoot+sep)&&target!==siteRoot) {res.writeHead(403);return res.end('Forbidden');}
    if ((await stat(target)).isDirectory()) target=resolve(target,'index.html');
    let body=await readFile(target);
    if (extname(target)==='.html') body=body.toString().replace('</body>','<script type="module" src="/__reload.js"></script></body>');
    res.setHeader('Content-Type',types[extname(target)]||'application/octet-stream');res.end(body);
  } catch {res.writeHead(404);res.end('Not found');}
});
const port=Number(process.env.PORT||8765);
server.listen(port,'127.0.0.1',()=>console.log(`FKNGYM website: http://127.0.0.1:${port}/ — watching website and app pricing/locales.`));
process.on('SIGINT',()=>{watcher.close();sourceFiles.forEach(file=>unwatchFile(file));server.close(()=>process.exit());});
