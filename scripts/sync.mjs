import { resolve } from 'node:path';
import { syncAppData,defaultAppRoot } from './sync-app-data.mjs';
import { renderHTML } from './render-html.mjs';
const appIndex=process.argv.indexOf('--app-root');
const data=await syncAppData({appRoot:appIndex>=0?resolve(process.argv[appIndex+1]):process.env.FKNGYM_APP_ROOT||defaultAppRoot,check:process.argv.includes('--check')});
await renderHTML(data,{check:process.argv.includes('--check')});
console.log(`StoreKit data and English HTML are current: ${data.locales.length} locales, ${data.source.currency} ${data.products.monthly.price} / ${data.products.annual.price}.`);
