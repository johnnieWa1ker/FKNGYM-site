import { nativeLanguageNames, storefrontRegions, matchLocale, suggestedStorefront, marketName, formatPrice, formatPeriod, template, priceFor, availableMarkets } from './pricing.js';

const baseURL = new URL('.', import.meta.url);
const readJSON = async (path) => {
  const response = await fetch(new URL(path, baseURL), {cache:'no-cache'});
  if (!response.ok) throw new Error(`Cannot load ${path}: ${response.status}`);
  return response.json();
};
function saved(key) { try { return localStorage.getItem(key); } catch { return null; } }
function save(key,value) { try { localStorage.setItem(key,value); } catch { /* Optional preference storage. */ } }
const languageKey = 'fkngym-public-language';
const marketKey = 'fkngym-public-market';
const themeKey = 'fkngym-public-theme';
const themeQuery = matchMedia('(prefers-color-scheme: dark)');
const themeOrder = ['system','light','dark'];
let themePreference = document.documentElement.dataset.themePreference || 'system';
const header = document.querySelector('.home-header');
if (header) {
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--header-offset', `${header.getBoundingClientRect().height}px`);
  }).observe(header);
}
const dictionaries = new Map();
let appData, regional, formats, screenshots, widgets, language = 'en', dictionary, market, marketExplicit = false, languageRequest = 0;

const themeLabels = {
  en: {theme:'Theme',system:'System',light:'Light',dark:'Dark',next:'Switch to'},
  ru: {theme:'Тема',system:'Системная',light:'Светлая',dark:'Тёмная',next:'Переключить на'}
};
const themeIcons = {
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.5" y="5" width="17" height="12" rx="2.5"/><path d="M9 21h6M12 17v4"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20.2 15.1A8.3 8.3 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"/></svg>'
};
function resolvedTheme(preference=themePreference) {
  return preference === 'system' ? (themeQuery.matches ? 'dark' : 'light') : preference;
}
function syncThemeControls() {
  const labels = themeLabels[language] || themeLabels.en;
  const next = themeOrder[(themeOrder.indexOf(themePreference) + 1) % themeOrder.length];
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.dataset.theme = themePreference;
    button.querySelector('[data-theme-icon]').innerHTML = themeIcons[themePreference];
    button.setAttribute('aria-label',`${labels.theme}: ${labels[themePreference]}. ${labels.next}: ${labels[next]}`);
    button.title = button.getAttribute('aria-label');
  });
}
function applyTheme(preference,{persist=true}={}) {
  themePreference = themeOrder.includes(preference) ? preference : 'system';
  document.documentElement.dataset.themePreference = themePreference;
  document.documentElement.dataset.theme = resolvedTheme();
  if (persist) save(themeKey,themePreference);
  syncThemeControls();
  if (screenshots) updateScreenshots();
  if (widgets) updateWidgets();
}
function initializeThemeControls() {
  document.querySelectorAll('.header-bar,.topbar').forEach(bar => {
    const languageControl = bar.querySelector('.language-control');
    if (!languageControl) return;
    const group = document.createElement('div');
    group.className = 'preference-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    button.dataset.themeToggle = '';
    button.innerHTML = '<span class="theme-icon" data-theme-icon aria-hidden="true"></span>';
    button.addEventListener('click',() => applyTheme(themeOrder[(themeOrder.indexOf(themePreference) + 1) % themeOrder.length]));
    bar.insertBefore(group,languageControl);
    group.append(button,languageControl);
  });
  syncThemeControls();
}
themeQuery.addEventListener('change',() => { if (themePreference === 'system') applyTheme('system',{persist:false}); });

const pickers = new Map();
function enhancePicker(select) {
  if (!('showPopover' in HTMLElement.prototype)) return;
  const isLanguage = select.hasAttribute('data-language-select');
  const control = select.parentElement;
  const label = control.querySelector('[data-i18n]');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'picker-trigger';
  trigger.innerHTML = `<span class="picker-symbol" aria-hidden="true">${isLanguage ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg>' : ''}</span><span class="picker-value"></span><svg class="picker-chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m4 6 4 4 4-4"/></svg>`;
  const panel = document.createElement('div');
  panel.className = 'picker-panel';
  panel.id = `picker-${pickers.size + 1}`;
  panel.setAttribute('popover','auto');
  panel.setAttribute('role','dialog');
  panel.innerHTML = '<div class="picker-heading"></div><div class="picker-search"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" autocomplete="off" spellcheck="false"></div><div class="picker-options"></div>';
  const search = panel.querySelector('input');
  search.autofocus = true;
  const options = panel.querySelector('.picker-options');
  // Associate the invoker so light-dismiss does not close the panel before
  // the same button's activation toggles it, accidentally reopening it.
  trigger.setAttribute('popovertarget',panel.id);
  trigger.setAttribute('aria-haspopup','dialog');
  trigger.setAttribute('aria-controls',panel.id);
  trigger.setAttribute('aria-expanded','false');
  document.body.append(panel);
  control.append(trigger);
  control.classList.add('picker-ready');
  select.hidden = true;
  const fold = value => value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();
  function renderOptions() {
    const query = fold(search.value.trim());
    const matching = [...select.options]
      .filter(option => fold(`${option.text} ${option.value}`).includes(query))
      .sort((a,b) => Number(b.value === select.value) - Number(a.value === select.value));
    options.replaceChildren(...matching.map(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'picker-option';
      button.setAttribute('aria-pressed',String(option.value === select.value));
      button.textContent = option.text;
      if (isLanguage) button.lang = option.value;
      button.dir = 'auto';
      button.addEventListener('click',() => {
        select.value = option.value;
        panel.hidePopover();
        trigger.focus();
        select.dispatchEvent(new Event('change',{bubbles:true}));
      });
      return button;
    }));
  }
  function position() {
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(360,innerWidth - 24);
    const below = innerHeight - rect.bottom - 20;
    const above = rect.top - 20;
    const opensAbove = below < 300 && above > below;
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(12,Math.min(document.documentElement.dir === 'rtl' ? rect.left : rect.right - width,innerWidth - width - 12))}px`;
    panel.style.maxHeight = `${Math.max(140,Math.min(460,opensAbove ? above : below))}px`;
    panel.style.top = opensAbove ? 'auto' : `${rect.bottom + 10}px`;
    panel.style.bottom = opensAbove ? `${innerHeight - rect.top + 10}px` : 'auto';
  }
  panel.addEventListener('beforetoggle',event => {
    if (event.newState !== 'open') return;
    search.value = '';
    renderOptions();
    position();
  });
  panel.addEventListener('toggle',event => trigger.setAttribute('aria-expanded',String(event.newState === 'open')));
  search.addEventListener('input',renderOptions);
  panel.addEventListener('keydown',event => {
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    if (event.target === search && event.key !== 'ArrowDown') return;
    const buttons = [...options.children];
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  });
  window.addEventListener('resize',() => { if (panel.matches(':popover-open')) position(); });
  document.addEventListener('scroll',() => { if (panel.matches(':popover-open')) position(); },true);
  function sync() {
    const selected = select.selectedOptions[0];
    trigger.querySelector('.picker-value').textContent = selected?.text || '';
    trigger.setAttribute('aria-label',`${label.textContent}: ${selected?.text || ''}`);
    trigger.disabled = select.disabled;
    panel.setAttribute('aria-label',label.textContent);
    panel.querySelector('.picker-heading').textContent = label.textContent;
    search.setAttribute('aria-label',label.textContent);
    if (!isLanguage) {
      const region = storefrontRegions[select.value];
      trigger.querySelector('.picker-symbol').textContent = region ? [...region].map(char => String.fromCodePoint(127397 + char.charCodeAt(0))).join('') : '◎';
    }
    if (panel.matches(':popover-open')) renderOptions();
  }
  pickers.set(select,{sync});
  sync();
}
function syncPickers() { pickers.forEach(picker => picker.sync()); }

function languageName(locale) {
  return nativeLanguageNames[locale] || new Intl.DisplayNames([locale], {type:'language'}).of(locale);
}
function initializeLanguageSelectors() {
  document.querySelectorAll('[data-language-select]').forEach(select => {
    select.replaceChildren(...appData.locales.map(locale => new Option(languageName(locale), locale)));
    select.addEventListener('change', () => setLanguage(select.value));
    select.disabled = false;
  });
}
function updateMarketSelector() {
  const markets = availableMarkets(appData,regional);
  if (!markets.includes(market)) market = suggestedStorefront(language,markets,appData.source.storefront);
  document.querySelectorAll('[data-market-select]').forEach(select => {
    select.replaceChildren(...markets.map(id => new Option(marketName(id,language,formats),id)));
    select.value = market;
    select.disabled = markets.length < 2;
  });
  syncPickers();
}
function updatePrices() {
  if (!dictionary) return;
  updateMarketSelector();
  for (const plan of ['monthly','annual']) {
    const product = appData.products[plan];
    const price = priceFor(appData,regional,plan,market);
    const localized = product.localizations[language];
    const sourceName = matchLocale(localized?.locale,[language]) ? localized.name : dictionary[`${plan}Plan`];
    document.querySelectorAll(`[data-plan-name="${plan}"]`).forEach(node => { node.textContent = sourceName; });
    document.querySelectorAll(`[data-price="${plan}"]`).forEach(node => {
      node.textContent = price ? formatPrice(price.price,price.currency,language,formats) : dictionary.priceUnavailable;
      node.classList.toggle('price-unavailable',!price);
    });
    const period = formatPeriod(product.period,language,formats);
    document.querySelectorAll(`[data-period="${plan}"]`).forEach(node => {
      node.textContent = template(dictionary.billingPeriod,{period});
      node.hidden = !price;
    });
    // Only the StoreKit base storefront's trial is known without an ASC offer export.
    // Regional snapshots explicitly supply eligible offers per territory, never infer them from language.
    const trial = regional?.source ? price?.trial : product.trial;
    document.querySelectorAll(`[data-trial="${plan}"]`).forEach(node => {
      node.hidden = !price || !trial;
      node.textContent = price && trial ? template(dictionary.freeTrial,{period:formatPeriod(trial,language,formats)}) : '';
    });
    document.querySelectorAll(`[data-trial-after="${plan}"]`).forEach(node => {
      node.hidden = !price || !trial;
      node.textContent = price && trial ? template(dictionary.trialAfter,{price:formatPrice(price.price,price.currency,language,formats),period}) : '';
    });
  }
  const displayed = ['monthly','annual'].map(plan => priceFor(appData,regional,plan,market)).find(Boolean);
  document.querySelectorAll('[data-price-source]').forEach(node => {
    node.textContent = template(dictionary.priceSourceNotice,{market:marketName(market,language,formats),currency:displayed?.currency || ''});
  });
}
function updateLocalLinks() {
  document.querySelectorAll('a[href]').forEach(link => {
    const raw = link.getAttribute('href');
    if (!raw.startsWith('/') || raw.startsWith('//')) return;
    const url = new URL(raw,location.origin);
    url.searchParams.set('lang',language);
    if (marketExplicit && market) url.searchParams.set('market',market);
    else url.searchParams.delete('market');
    link.setAttribute('href',`${url.pathname}${url.search}${url.hash}`);
  });
}
function updateScreenshots() {
  const theme = resolvedTheme();
  const fallbackLocale = screenshots.locales[screenshots.defaultLocale];
  const fallback = fallbackLocale[theme] || fallbackLocale.light;
  const localizedLocale = screenshots.locales[language] || fallbackLocale;
  const localized = localizedLocale[theme] || localizedLocale.light || fallback;
  document.querySelectorAll('[data-screenshot]').forEach(image => {
    const path = localized[image.dataset.screenshot] || fallback[image.dataset.screenshot];
    image.src = new URL(path,baseURL).href;
  });
}
function updateWidgets() {
  const theme = resolvedTheme();
  const fallbackLocale = widgets.locales[widgets.defaultLocale];
  const fallbackRoot = fallbackLocale[theme] || fallbackLocale.light;
  const localizedLocale = widgets.locales[language] || fallbackLocale;
  const root = localizedLocale[theme] || localizedLocale.light || fallbackRoot;
  document.querySelectorAll('[data-widget]').forEach(image => {
    image.src = new URL(`${root}/${image.dataset.widget}.png`,baseURL).href;
  });
}
function initializeWidgetWall() {
  const wall = document.querySelector('.widget-wall');
  if (!wall) return;
  const tiles = [...wall.querySelectorAll('.widget-tile')];
  wall.replaceChildren(...tiles);
  let frame;
  const layout = () => {
    const compact = innerWidth < 560;
    const rowHeight = compact
      ? Math.min(68,Math.max(52,innerWidth * 0.16))
      : Math.min(180,Math.max(88,innerWidth * 0.095));
    const gap = compact ? 7 : Math.min(18,Math.max(10,innerWidth * 0.011));
    const verticalInset = compact ? 8 : 16;
    const cursor = [-rowHeight * 0.72,-rowHeight * 0.18,-rowHeight * 0.94];
    const lastType = ['', '', ''];
    const orderedTiles = [
      ...tiles.filter(tile => tile.classList.contains('widget-large')),
      ...tiles.filter(tile => !tile.classList.contains('widget-large'))
    ];

    for (const tile of orderedTiles) {
      const name = tile.querySelector('[data-widget]').dataset.widget;
      const type = name.split('-')[0];
      const large = tile.classList.contains('widget-large');
      const height = large ? rowHeight * 2 + gap : rowHeight;
      const ratio = large ? 1092 / 1146 : tile.classList.contains('widget-medium') ? 1092 / 510 : 492 / 510;
      // Anchor tall cards together first; the remaining cards then backfill all three lanes.
      const candidates = large ? [0] : [0,1,2];
      const row = candidates.reduce((best,next) => {
        const bestStart = large ? Math.max(cursor[best],cursor[best + 1]) : cursor[best];
        const nextStart = large ? Math.max(cursor[next],cursor[next + 1]) : cursor[next];
        const bestRepeat = large ? lastType[best] === type || lastType[best + 1] === type : lastType[best] === type;
        const nextRepeat = large ? lastType[next] === type || lastType[next + 1] === type : lastType[next] === type;
        return nextStart + (nextRepeat ? rowHeight * 3 : 0) < bestStart + (bestRepeat ? rowHeight * 3 : 0) ? next : best;
      },candidates[0]);
      const left = large ? Math.max(cursor[row],cursor[row + 1]) : cursor[row];
      tile.style.cssText = `left:${left}px;top:${verticalInset + row * (rowHeight + gap)}px;width:${height * ratio}px;height:${height}px`;
      cursor[row] = left + height * ratio + gap;
      lastType[row] = type;
      if (large) {
        cursor[row + 1] = cursor[row];
        lastType[row + 1] = type;
      }
    }
    wall.style.height = `${rowHeight * 3 + gap * 2 + verticalInset * 2}px`;
    wall.dataset.layoutReady = '';
  };
  layout();
  addEventListener('resize',() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(layout);
  });
}
async function setLanguage(requested) {
  const selected = matchLocale(requested,appData.locales) || 'en';
  const request = ++languageRequest;
  try {
    if (!dictionaries.has(selected)) dictionaries.set(selected,await readJSON(`locales/${selected}.json`));
    if (request !== languageRequest) return;
    const next = dictionaries.get(selected);
    if (!Object.keys(dictionaries.get('en')).every(key => typeof next[key] === 'string' && next[key])) throw new Error('Incomplete translation');
    language = selected;
    dictionary = next;
    document.documentElement.lang = language;
    document.documentElement.dir = ['ar','he'].includes(language) ? 'rtl' : 'ltr';
    document.title = `FKNGYM — ${dictionary[document.body.dataset.pageTitle || 'homePageTitle']}`;
    document.querySelectorAll('[data-i18n]').forEach(node => {
      const value = dictionary[node.dataset.i18n];
      // Translation files are bundled first-party content, validated at build time.
      if (value.includes('<a ')) node.innerHTML = value;
      else node.textContent = value;
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(node => node.setAttribute('aria-label',dictionary[node.dataset.i18nAria]));
    document.querySelectorAll('[data-language-select]').forEach(select => { select.value = language; });
    syncThemeControls();
    syncPickers();
    document.querySelectorAll('[data-language-status]').forEach(node => { node.textContent = ''; });
    if (!marketExplicit) market = suggestedStorefront(language,availableMarkets(appData,regional),appData.source.storefront);
    updatePrices();
    updateScreenshots();
    updateWidgets();
    updateLocalLinks();
    save(languageKey,language);
    const url = new URL(location.href);
    url.searchParams.set('lang',language);
    history.replaceState(null,'',url);
  } catch (error) {
    if (request !== languageRequest) return;
    document.querySelectorAll('[data-language-select]').forEach(select => { select.value = language; });
    document.querySelectorAll('[data-language-status]').forEach(node => { node.textContent = dictionary?.languageError || 'Could not load this language. Please try again.'; });
    console.error('Language loading failed',error);
  }
}
async function initialize() {
  // Lay out decorative images before any network requests can delay initialization.
  initializeWidgetWall();
  [appData,regional,formats,screenshots,widgets] = await Promise.all([readJSON('data/app-data.json'),readJSON('data/regional-prices.json'),readJSON('data/formats.json'),readJSON('data/screenshots.json'),readJSON('data/widgets.json')]);
  dictionary = await readJSON('locales/en.json');
  dictionaries.set('en',dictionary);
  initializeLanguageSelectors();
  initializeThemeControls();
  applyTheme(saved(themeKey) || themePreference,{persist:false});
  const query = new URLSearchParams(location.search);
  const requestedMarket = query.get('market') || saved(marketKey);
  marketExplicit = availableMarkets(appData,regional).includes(requestedMarket);
  market = marketExplicit ? requestedMarket : appData.source.storefront;
  document.querySelectorAll('[data-market-select]').forEach(select => {
    select.addEventListener('change',() => {
      market = select.value;
      marketExplicit = true;
      save(marketKey,market);
      const url = new URL(location.href); url.searchParams.set('market',market); history.replaceState(null,'',url);
      updatePrices(); updateLocalLinks();
    });
  });
  const requested = [query.get('lang'),saved(languageKey),...(navigator.languages || [navigator.language])]
    .map(value => matchLocale(value,appData.locales)).find(Boolean) || 'en';
  await setLanguage(requested);
  document.querySelectorAll('[data-language-select],[data-market-select]').forEach(enhancePicker);
}
initialize().catch(error => {
  // The generated English HTML, prices, legal text, and links remain available.
  console.error('Site data loading failed',error);
});
