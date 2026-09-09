import { readFile,readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { siteRoot } from './sync-app-data.mjs';
import { pages } from './render-html.mjs';
const values = (value,pattern) => [...value.matchAll(pattern)].map(match=>match[1]).sort();
const equal = (left,right) => JSON.stringify(left)===JSON.stringify(right);
export async function validateSite(root=siteRoot) {
  const load = async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
  const [app,base,regional,formats] = await Promise.all(['data/app-data.json','locales/en.json','data/regional-prices.json','data/formats.json'].map(load));
  const keys=Object.keys(base).sort();
  const files=(await readdir(resolve(root,'locales'))).filter(file=>file.endsWith('.json')).map(file=>file.slice(0,-5)).sort();
  if (!equal(files,[...app.locales].sort())) throw new Error(`Website translations must match all ${app.locales.length} app locales. Found: ${files.join(', ')}`);
  for (const locale of app.locales) {
    const dict=await load(`locales/${locale}.json`);
    if (!formats[locale] || !Object.keys(formats[locale].prices).length) throw new Error(`${locale}: missing generated price formatting`);
    if (!equal(Object.keys(dict).sort(),keys)) throw new Error(`${locale}: translation keys differ from English`);
    for (const key of keys) {
      const text=dict[key];
      if (typeof text!=='string'||!text.trim()) throw new Error(`${locale}/${key}: empty translation`);
      if (!equal(values(text,/\{(\w+)\}/g),values(base[key],/\{(\w+)\}/g))) throw new Error(`${locale}/${key}: template parameters differ`);
      if (!equal(values(text,/href="([^"]+)"/g),values(base[key],/href="([^"]+)"/g))) throw new Error(`${locale}/${key}: link targets differ`);
      if (/<(?!\/?a(?:\s|>))|<a\s+(?!href=")|on\w+=|javascript:/i.test(text)) throw new Error(`${locale}/${key}: unsupported HTML`);
    }
  }
  const ids = {};
  const htmlByPage = Object.fromEntries(await Promise.all(pages.map(async page=>[page,await readFile(resolve(root,page),'utf8')])));
  for (const [page,html] of Object.entries(htmlByPage)) {
    ids[page]=values(html,/\bid="([^"]+)"/g);
    if (new Set(ids[page]).size!==ids[page].length) throw new Error(`${page}: duplicate IDs`);
    if ([...html.matchAll(/<h1\b/g)].length!==1) throw new Error(`${page}: expected one h1`);
    for (const key of values(html,/data-i18n(?:-aria)?="([^"]+)"/g)) if (!(key in base)) throw new Error(`${page}: unknown translation ${key}`);
  }
  for (const [page,html] of Object.entries(htmlByPage)) {
    for (const link of values(html,/href="([^"]+)"/g)) {
      const url=new URL(link,`https://fkngym.com/${page}`);
      if (url.origin!=='https://fkngym.com'||!url.hash) continue;
      const target=url.pathname.replace(/^\//,'').replace(/\/$/,'/index.html')||'index.html';
      if (!ids[target]?.includes(decodeURIComponent(url.hash.slice(1)))) throw new Error(`${page}: broken section link ${link}`);
    }
  }
  if (regional.schemaVersion !== 1) throw new Error('Unsupported regional snapshot schema');
  if (regional.source) {
    if (regional.source.provider !== 'app-store-connect' || Number.isNaN(Date.parse(regional.source.fetchedAt))) throw new Error('Invalid Apple snapshot provenance');
    if (!equal(Object.keys(regional.products).sort(),Object.values(app.products).map(p=>p.id).sort())) throw new Error('Regional snapshot must include both subscriptions');
    for (const id of Object.keys(regional.products)) if (!Object.values(app.products).some(product=>product.id===id)) throw new Error(`Regional prices refer to unknown SKU ${id}`);
    for (const product of Object.values(regional.products)) for (const value of Object.values(product.territories)) {
      if (!/^\d+(\.\d+)?$/.test(value.price)||!/^[A-Z]{3}$/.test(value.currency)) throw new Error('Invalid regional price');
    }
  }
  return {locales:app.locales.length,keys:keys.length,pages:pages.length};
}
