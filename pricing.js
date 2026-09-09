// Shared, pure pricing/locale helpers used by the browser and validation tools.
export const storefrontRegions = Object.fromEntries(`AFG:AF ALB:AL DZA:DZ AGO:AO AIA:AI ATG:AG ARG:AR ARM:AM AUS:AU AUT:AT AZE:AZ BHS:BS BHR:BH BRB:BB BLR:BY BEL:BE BLZ:BZ BEN:BJ BMU:BM BTN:BT BOL:BO BIH:BA BWA:BW BRA:BR VGB:VG BRN:BN BGR:BG BFA:BF KHM:KH CMR:CM CAN:CA CPV:CV CYM:KY TCD:TD CHL:CL CHN:CN COL:CO COD:CD COG:CG CRI:CR CIV:CI HRV:HR CYP:CY CZE:CZ DNK:DK DMA:DM DOM:DO ECU:EC EGY:EG SLV:SV EST:EE SWZ:SZ FJI:FJ FIN:FI FRA:FR GAB:GA GMB:GM GEO:GE DEU:DE GHA:GH GRC:GR GRD:GD GTM:GT GNB:GW GUY:GY HND:HN HKG:HK HUN:HU ISL:IS IND:IN IDN:ID IRQ:IQ IRL:IE ISR:IL ITA:IT JAM:JM JPN:JP JOR:JO KAZ:KZ KEN:KE KOR:KR XKX:XK KWT:KW KGZ:KG LAO:LA LVA:LV LBN:LB LBR:LR LBY:LY LTU:LT LUX:LU MAC:MO MDG:MG MWI:MW MYS:MY MDV:MV MLI:ML MLT:MT MRT:MR MUS:MU MEX:MX FSM:FM MDA:MD MNG:MN MNE:ME MSR:MS MAR:MA MOZ:MZ MMR:MM NAM:NA NPL:NP NLD:NL NZL:NZ NIC:NI NER:NE NGA:NG MKD:MK NOR:NO OMN:OM PAK:PK PLW:PW PAN:PA PNG:PG PRY:PY PER:PE PHL:PH POL:PL PRT:PT QAT:QA ROU:RO RUS:RU RWA:RW KNA:KN LCA:LC VCT:VC STP:ST SAU:SA SEN:SN SRB:RS SYC:SC SLE:SL SGP:SG SVK:SK SVN:SI SLB:SB ZAF:ZA ESP:ES LKA:LK SUR:SR SWE:SE CHE:CH TWN:TW TJK:TJ TZA:TZ THA:TH TON:TO TTO:TT TUN:TN TUR:TR TKM:TM TCA:TC UGA:UG UKR:UA ARE:AE GBR:GB USA:US URY:UY UZB:UZ VUT:VU VEN:VE VNM:VN YEM:YE ZMB:ZM ZWE:ZW`.split(' ').map(pair => pair.split(':')));

export const nativeLanguageNames = {
  ar: 'العربية', cs: 'Čeština', da: 'Dansk', de: 'Deutsch', el: 'Ελληνικά', en: 'English',
  es: 'Español', fi: 'Suomi', fr: 'Français', he: 'עברית', hi: 'हिन्दी', hu: 'Magyar',
  id: 'Bahasa Indonesia', it: 'Italiano', ja: '日本語', ka: 'ქართული', ko: '한국어',
  nl: 'Nederlands', pl: 'Polski', 'pt-BR': 'Português (Brasil)', ro: 'Română', ru: 'Русский',
  sv: 'Svenska', th: 'ไทย', tr: 'Türkçe', uk: 'Українська', vi: 'Tiếng Việt',
  'zh-Hans': '简体中文', 'zh-Hant': '繁體中文',
};

export function matchLocale(requested, supported) {
  if (!requested) return null;
  let locale;
  try { locale = new Intl.Locale(requested.replaceAll('_','-')); } catch { return null; }
  const exact = supported.find(value => value.toLowerCase() === locale.baseName.toLowerCase());
  if (exact) return exact;
  if (locale.language === 'zh') {
    const script = locale.maximize().script;
    return supported.find(value => value === `zh-${script}`) || null;
  }
  return supported.find(value => value === locale.language)
    || supported.find(value => value.split('-')[0] === locale.language) || null;
}
export function suggestedStorefront(locale, markets, fallback = 'USA') {
  let region;
  try { region = new Intl.Locale(locale).maximize().region; } catch { return markets.includes(fallback) ? fallback : markets[0]; }
  return markets.find(id => storefrontRegions[id] === region)
    || (markets.includes(fallback) ? fallback : markets[0]);
}
export function marketName(market, locale, formats) {
  if (formats?.[locale]?.markets?.[market]) return formats[locale].markets[market];
  const region = storefrontRegions[market];
  return region ? new Intl.DisplayNames([locale], { type:'region' }).of(region) : market;
}
export function formatPrice(price, currency, locale, formats) {
  if (formats?.[locale]?.prices?.[`${currency}:${price}`]) return formats[locale].prices[`${currency}:${price}`];
  // Number formatting never converts currencies. Values come from the source storefront.
  return new Intl.NumberFormat(locale, {style:'currency',currency,currencyDisplay:'symbol'}).format(Number(price));
}
export function formatPeriod(period, locale, formats) {
  if (formats?.[locale]?.periods?.[`${period.unit}:${period.count}`]) return formats[locale].periods[`${period.unit}:${period.count}`];
  return new Intl.NumberFormat(locale, {style:'unit',unit:period.unit,unitDisplay:'long'}).format(period.count);
}
export function template(value, replacements) {
  return value.replace(/\{(\w+)\}/g, (_,key) => replacements[key] ?? `{${key}}`);
}
export function priceFor(appData, regional, plan, market) {
  // Once an ASC snapshot exists, never fill missing territories with an unrelated USD price.
  if (regional?.source) return regional.products[appData.products[plan].id]?.territories[market] || null;
  if (market !== appData.source.storefront) return null;
  return {price:appData.products[plan].price,currency:appData.source.currency};
}
export function availableMarkets(appData, regional) {
  if (!regional?.source) return [appData.source.storefront];
  return [...new Set(Object.values(regional.products).flatMap(product => Object.keys(product.territories)))].sort();
}
