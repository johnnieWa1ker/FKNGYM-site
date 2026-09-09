import { createPrivateKey, sign } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteRoot } from './sync-app-data.mjs';

const origin = 'https://api.appstoreconnect.apple.com';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
export function makeToken({keyId,issuerId,privateKey},now = Math.floor(Date.now()/1000)) {
  if (!keyId || !issuerId || !privateKey) throw new Error('Configure APPSTORE_KEY_ID, APPSTORE_ISSUER_ID, and APPSTORE_PRIVATE_KEY or ASC_KEY_PATH.');
  const signingInput = `${encode({alg:'ES256',kid:keyId,typ:'JWT'})}.${encode({iss:issuerId,iat:now,exp:now+600,aud:'appstoreconnect-v1'})}`;
  const signature = sign('sha256',Buffer.from(signingInput),{key:createPrivateKey(privateKey),dsaEncoding:'ieee-p1363'}).toString('base64url');
  return `${signingInput}.${signature}`;
}
export function createClient(token,fetcher = fetch) {
  return async function getAll(path) {
    let next = new URL(path,origin), data = [], included = [];
    const seen = new Set();
    while (next) {
      if (next.origin !== origin || !next.pathname.startsWith('/v1/') || seen.has(next.href)) throw new Error('Invalid App Store Connect pagination URL');
      seen.add(next.href);
      const response = await fetcher(next,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error(`App Store Connect ${response.status} for ${next.pathname}. No public data was changed.`);
      const body = await response.json();
      data.push(...(Array.isArray(body.data) ? body.data : body.data ? [body.data] : []));
      included.push(...(body.included || []));
      next = body.links?.next ? new URL(body.links.next,origin) : null;
    }
    return {data,included};
  };
}
const resourceKey = resource => `${resource.type}:${resource.id}`;
function requireAmount(value) {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) throw new Error('Invalid customer price from Apple');
  return value;
}
const offerDurations = {
  THREE_DAYS:{count:3,unit:'day'}, ONE_WEEK:{count:1,unit:'week'}, TWO_WEEKS:{count:2,unit:'week'},
  ONE_MONTH:{count:1,unit:'month'}, TWO_MONTHS:{count:2,unit:'month'}, THREE_MONTHS:{count:3,unit:'month'},
  SIX_MONTHS:{count:6,unit:'month'}, ONE_YEAR:{count:1,unit:'year'},
};
function activeTrial(offers,territory,today) {
  const matches = offers.filter(offer => {
    const a = offer.attributes;
    return offer.relationships?.territory?.data?.id === territory && a.offerMode === 'FREE_TRIAL'
      && (!a.targetSubscriptionPlanType || a.targetSubscriptionPlanType === 'UPFRONT')
      && (!a.startDate || a.startDate <= today) && (!a.endDate || a.endDate >= today);
  });
  if (!matches.length) return null;
  const trials = matches.map(offer => {
    const period = offerDurations[offer.attributes.duration];
    const count = offer.attributes.numberOfPeriods;
    if (!period || !Number.isInteger(count) || count < 1) throw new Error(`Unsupported trial duration for ${territory}`);
    return {count:period.count*count,unit:period.unit};
  });
  if (new Set(trials.map(trial => JSON.stringify(trial))).size !== 1) throw new Error(`Ambiguous trial offers for ${territory}`);
  return trials[0];
}
export function selectTerritoryPrices(prices,territories,offers,today) {
  const included = new Map(prices.included.map(resource => [resourceKey(resource),resource]));
  const output = {};
  for (const territory of territories) {
    const candidates = prices.data.filter(price => {
      const a = price.attributes;
      return price.relationships?.territory?.data?.id === territory.id
        && a.preserved !== true && (!a.planType || a.planType === 'UPFRONT')
        && (!a.startDate || a.startDate <= today);
    }).sort((a,b) => (b.attributes.startDate || '').localeCompare(a.attributes.startDate || ''));
    if (!candidates.length) throw new Error(`No current new-subscriber price for available territory ${territory.id}`);
    const latestDate = candidates[0].attributes.startDate || '';
    const latest = candidates.filter(price => (price.attributes.startDate || '') === latestDate);
    const values = latest.map(price => {
      const relation = price.relationships?.subscriptionPricePoint?.data;
      const point = relation && included.get(resourceKey(relation));
      if (!point) throw new Error(`Missing included price point for ${territory.id}`);
      return requireAmount(point.attributes.customerPrice);
    });
    if (new Set(values.map(Number)).size !== 1) throw new Error(`Ambiguous current price for ${territory.id}`);
    const currency = territory.attributes.currency;
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`Invalid currency for ${territory.id}`);
    output[territory.id] = {price:values[0],currency,trial:activeTrial(offers,territory.id,today)};
  }
  return Object.fromEntries(Object.entries(output).sort(([a],[b])=>a.localeCompare(b)));
}
export async function exportPrices(get,appData,now = new Date()) {
  const apps = await get('/v1/apps?filter[bundleId]=com.johnnie.fkngym&limit=2');
  if (apps.data.length !== 1) throw new Error('Expected one FKNGYM app in App Store Connect');
  const groups = await get(`/v1/apps/${encodeURIComponent(apps.data[0].id)}/subscriptionGroups?limit=200`);
  const subscriptions = (await Promise.all(groups.data.map(group => get(`/v1/subscriptionGroups/${encodeURIComponent(group.id)}/subscriptions?limit=200`)))).flatMap(result=>result.data);
  const products = {};
  for (const product of Object.values(appData.products)) {
    const matches = subscriptions.filter(s => s.attributes.productId === product.id);
    if (matches.length !== 1) throw new Error(`Expected one ASC subscription for ${product.id}`);
    const id = encodeURIComponent(matches[0].id);
    const [prices,plans,offers] = await Promise.all([
      get(`/v1/subscriptions/${id}/prices?include=territory,subscriptionPricePoint&limit=200`),
      get(`/v1/subscriptions/${id}/planAvailabilities?limit=200`),
      get(`/v1/subscriptions/${id}/introductoryOffers?limit=200`),
    ]);
    const upfront = plans.data.filter(plan=>plan.attributes.planType === 'UPFRONT');
    if (upfront.length !== 1) throw new Error(`Expected one up-front billing plan for ${product.id}`);
    const territories = await get(`/v1/subscriptionPlanAvailabilities/${encodeURIComponent(upfront[0].id)}/availableTerritories?limit=200`);
    products[product.id] = {territories:selectTerritoryPrices(prices,territories.data,offers.data,now.toISOString().slice(0,10))};
  }
  if (!Object.values(products).some(product=>Object.keys(product.territories).length)) throw new Error('Apple returned no available territories');
  return {schemaVersion:1,source:{provider:'app-store-connect',fetchedAt:now.toISOString()},products};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let privateKey = process.env.APPSTORE_PRIVATE_KEY;
  if (!privateKey && process.env.ASC_KEY_PATH) privateKey = await readFile(process.env.ASC_KEY_PATH,'utf8');
  const token = makeToken({keyId:process.env.APPSTORE_KEY_ID,issuerId:process.env.APPSTORE_ISSUER_ID,privateKey:privateKey?.replaceAll('\\n','\n')});
  const appData = JSON.parse(await readFile(resolve(siteRoot,'data/app-data.json'),'utf8'));
  const result = await exportPrices(createClient(token),appData);
  const output = resolve(siteRoot,'data/regional-prices.json');
  // Only replace the snapshot after both products and all pages validate successfully.
  await writeFile(`${output}.tmp`,JSON.stringify(result,null,2)+'\n');
  await rename(`${output}.tmp`,output);
  console.log(`Exported Apple prices for ${Object.keys(result.products).length} subscriptions. No prices in App Store Connect were modified.`);
}
