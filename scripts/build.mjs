import { readFile,mkdir,cp,rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { siteRoot,syncAppData,defaultAppRoot } from './sync-app-data.mjs';
import { renderHTML } from './render-html.mjs';
import { validateSite } from './validate.mjs';
const app = process.argv.includes('--snapshot')
  ? JSON.parse(await readFile(resolve(siteRoot,'data/app-data.json'),'utf8'))
  : await syncAppData({appRoot:process.env.FKNGYM_APP_ROOT||defaultAppRoot});
await renderHTML(app);
const result=await validateSite();
const destination=resolve(siteRoot,'dist');
await rm(destination,{recursive:true,force:true});
await mkdir(destination,{recursive:true});
// An allowlist prevents tools, private keys, environment files, and repository metadata from being published.
for (const file of ['index.html','privacy','terms','support','styles.css','script.js','pricing.js','assets','locales','data','CNAME','.nojekyll']) {
  await cp(resolve(siteRoot,file),resolve(destination,file),{recursive:true});
}
console.log(`Built dist/: ${result.pages} pages, ${result.locales} complete locales, ${result.keys} strings each.`);
