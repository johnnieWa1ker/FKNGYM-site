import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const defaultAppRoot = resolve(siteRoot, '../FKNGYM');
const currencies = {
  USA: 'USD', GBR: 'GBP', CAN: 'CAD', AUS: 'AUD', RUS: 'RUB', UKR: 'UAH',
  FRA: 'EUR', DEU: 'EUR', ESP: 'EUR', ITA: 'EUR', NLD: 'EUR', FIN: 'EUR',
  PRT: 'EUR', GRC: 'EUR', AUT: 'EUR', IRL: 'EUR', BEL: 'EUR', HRV: 'EUR',
  BRA: 'BRL', JPN: 'JPY', KOR: 'KRW', CHN: 'CNY', TWN: 'TWD', HKG: 'HKD',
  IND: 'INR', ISR: 'ILS', SAU: 'SAR', ARE: 'AED', POL: 'PLN', CZE: 'CZK',
  DNK: 'DKK', SWE: 'SEK', NOR: 'NOK', CHE: 'CHF', TUR: 'TRY', ROU: 'RON',
  HUN: 'HUF', IDN: 'IDR', VNM: 'VND', THA: 'THB', GEO: 'GEL',
};
const preferredStoreLocales = { en: 'en-US', es: 'es-ES' };
export function normalizeLocale(value) {
  return Intl.getCanonicalLocales(value.replaceAll('_', '-'))[0];
}
function amount(value) {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
    throw new Error(`Invalid StoreKit price: ${JSON.stringify(value)}`);
  }
  return value;
}
function duration(value) {
  const match = /^P([1-9]\d*)([DWMY])$/.exec(value);
  if (!match) throw new Error(`Unsupported StoreKit duration: ${value}`);
  return { count: Number(match[1]), unit: {D:'day',W:'week',M:'month',Y:'year'}[match[2]] };
}
function localizationsFor(items, locales, sourceLocale) {
  const all = Object.fromEntries(items.map(item => [normalizeLocale(item.locale), {
    name: item.displayName, description: item.description,
  }]));
  return Object.fromEntries(locales.map(locale => {
    const match = [locale, preferredStoreLocales[locale]].find(key => all[key]);
    // A language translation is not a storefront price. Keep them separate.
    const source = match || sourceLocale;
    if (!all[source]) throw new Error(`Missing StoreKit fallback localization: ${source}`);
    return [locale, { ...all[source], locale: source }];
  }));
}
function freeTrial(product) {
  // New StoreKit versions may include the same offer in singular and plural fields.
  const offers = product.introductoryOffers?.length
    ? product.introductoryOffers
    : product.introductoryOffer ? [product.introductoryOffer] : [];
  if (!offers.length) return null;
  if (offers.length !== 1 || offers[0].paymentMode !== 'free') {
    throw new Error(`Review unsupported introductory offer for ${product.productID}`);
  }
  const offer = offers[0];
  if (!Number.isInteger(offer.numberOfPeriods) || offer.numberOfPeriods < 1) throw new Error('Invalid trial period count');
  const period = duration(offer.subscriptionPeriod);
  return { count: period.count * offer.numberOfPeriods, unit: period.unit };
}
export function createAppData(store, strings, hashes) {
  const locales = [...new Set([strings.sourceLanguage, ...Object.values(strings.strings)
    .flatMap(value => Object.keys(value.localizations || {}))].map(normalizeLocale))].sort();
  const storefront = store.settings._storefront;
  const currency = currencies[storefront];
  if (!currency) throw new Error(`Unknown currency for storefront ${storefront}; add an explicit mapping before syncing`);
  const sourceLocale = normalizeLocale(store.settings._locale);
  const subscriptions = store.subscriptionGroups.flatMap(group => group.subscriptions);
  const products = {};
  for (const plan of ['monthly','annual']) {
    const id = `com.johnnie.fkngym.statistics.premium.${plan}`;
    const matches = subscriptions.filter(product => product.productID === id);
    if (matches.length !== 1) throw new Error(`Expected exactly one ${id}`);
    const product = matches[0];
    const price = amount(product.displayPrice);
    const billing = (product.billingPlans || []).filter(plan => plan.isEnabled);
    if (billing.some(plan => plan.billingPlanType !== 'BILLED_UPFRONT' || amount(plan.displayPrice) !== price)) {
      throw new Error(`Unsupported or inconsistent billing plans for ${id}`);
    }
    products[plan] = {
      id, price, period: duration(product.recurringSubscriptionPeriod),
      trial: freeTrial(product),
      localizations: localizationsFor(product.localizations, locales, sourceLocale),
    };
  }
  return { schemaVersion: 1, source: {storefront, currency, locale: sourceLocale, ...hashes}, locales, products };
}
function hash(text) { return createHash('sha256').update(text).digest('hex'); }
export async function syncAppData({ appRoot = defaultAppRoot, outputRoot = siteRoot, check = false } = {}) {
  const [storeText, stringsText] = await Promise.all([
    readFile(resolve(appRoot, 'Resources/Prices.storekit'), 'utf8'),
    readFile(resolve(appRoot, 'Resources/Localizable.xcstrings'), 'utf8'),
  ]);
  const data = createAppData(JSON.parse(storeText), JSON.parse(stringsText), {
    pricesSHA256: hash(storeText), localizationsSHA256: hash(stringsText),
  });
  const output = JSON.stringify(data, null, 2) + '\n';
  const target = resolve(outputRoot, 'data/app-data.json');
  let previous;
  try { previous = await readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous !== output) {
    if (check) throw new Error('App data is stale. Run npm run sync with the current FKNGYM checkout.');
    await mkdir(dirname(target), {recursive:true});
    await writeFile(target, output);
  }
  return data;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appIndex = process.argv.indexOf('--app-root');
  const data = await syncAppData({
    appRoot: appIndex >= 0 ? resolve(process.argv[appIndex + 1]) : process.env.FKNGYM_APP_ROOT || defaultAppRoot,
    check: process.argv.includes('--check'),
  });
  console.log(`Synced ${data.locales.length} app locales; ${data.source.storefront}/${data.source.currency}: monthly ${data.products.monthly.price}, annual ${data.products.annual.price}.`);
}
