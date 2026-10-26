import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { siteRoot } from './sync-app-data.mjs';
import { nativeLanguageNames,languageFlags,formatPrice,formatPeriod,template,marketName,priceFor,availableMarkets } from '../pricing.js';

export const pages = ['index.html','privacy/index.html','terms/index.html','support/index.html'];
const escape = text => text.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function replaceContent(html,attribute,value,content,hidden) {
  const pattern = new RegExp(`(<([a-z0-9]+)\\b[^>]*\\b${attribute}${value ? `="${value}"` : '(?:="")?'}[^>]*>)[\\s\\S]*?</\\2>`, 'g');
  return html.replace(pattern, (_,start,tag) => {
    if (hidden !== undefined) start = start.replace(/\s+hidden(?:="[^"]*")?/g,'').replace(/>$/,hidden ? ' hidden>' : '>');
    return `${start}${content}</${tag}>`;
  });
}
export async function renderHTML(appData,{root=siteRoot,check=false}={}) {
  const [english,regional] = await Promise.all(['locales/en.json','data/regional-prices.json'].map(async file => JSON.parse(await readFile(resolve(root,file),'utf8'))));
  const markets = availableMarkets(appData,regional);
  const market = markets.includes(appData.source.storefront) ? appData.source.storefront : markets[0];
  // Generate with Node's full ICU data. Some WebKit builds lack Georgian Intl data.
  const formats = Object.fromEntries(appData.locales.map(locale => {
    const result = {markets:{},prices:{},periods:{}};
    for (const id of markets) {
      result.markets[id] = marketName(id,locale);
      for (const plan of ['monthly','annual']) {
        const product = appData.products[plan];
        const price = priceFor(appData,regional,plan,id);
        const trial = regional.source ? price?.trial : product.trial;
        if (price) result.prices[`${price.currency}:${price.price}`] = formatPrice(price.price,price.currency,locale);
        for (const period of [product.period,trial].filter(Boolean)) result.periods[`${period.unit}:${period.count}`] = formatPeriod(period,locale);
      }
    }
    return [locale,result];
  }));
  const formatsPath = resolve(root,'data/formats.json');
  const formatted = JSON.stringify(formats,null,2)+'\n';
  let previous;
  try { previous = await readFile(formatsPath,'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (formatted !== previous) {
    if (check) throw new Error('Localized price formats are stale. Run npm run sync.');
    await writeFile(formatsPath,formatted);
  }
  const options = appData.locales.map(locale => `<option value="${locale}"${locale==='en'?' selected':''}>${languageFlags[locale]} ${escape(nativeLanguageNames[locale] || new Intl.DisplayNames([locale],{type:'language'}).of(locale))}</option>`).join('');
  for (const path of pages) {
    const fullPath=resolve(root,path), before=await readFile(fullPath,'utf8');
    let html=before.replace(/(<([a-z0-9]+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)[\s\S]*?<\/\2>/g,
      (_,start,tag,key) => { if (!english[key]) throw new Error(`Missing English key ${key}`); return `${start}${english[key]}</${tag}>`; });
    html=replaceContent(html,'data-language-select','',options);
    html=replaceContent(html,'data-market-select','',markets.map(id=>`<option value="${id}"${id===market?' selected':''}>${escape(marketName(id,'en'))}</option>`).join(''));
    for (const plan of ['monthly','annual']) {
      const product=appData.products[plan], price=priceFor(appData,regional,plan,market);
      const trial=regional.source ? price?.trial : product.trial;
      const period=formatPeriod(product.period,'en');
      html=replaceContent(html,'data-plan-name',plan,escape(product.localizations.en.name));
      html=replaceContent(html,'data-price',plan,price?formatPrice(price.price,price.currency,'en'):english.priceUnavailable);
      html=replaceContent(html,'data-period',plan,template(english.billingPeriod,{period}),!price);
      html=replaceContent(html,'data-trial',plan,trial?template(english.freeTrial,{period:formatPeriod(trial,'en')}):'',!price||!trial);
      html=replaceContent(html,'data-trial-after',plan,price&&trial?template(english.trialAfter,{price:formatPrice(price.price,price.currency,'en'),period}):'',!price||!trial);
    }
    const price=['monthly','annual'].map(plan=>priceFor(appData,regional,plan,market)).find(Boolean);
    html=replaceContent(html,'data-price-source','',template(english.priceSourceNotice,{market:marketName(market,'en'),currency:price.currency}));
    if (html !== before) {
      if (check) throw new Error(`${path} has stale static content. Run npm run sync.`);
      await writeFile(fullPath,html);
    }
  }
}
