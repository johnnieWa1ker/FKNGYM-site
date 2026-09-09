import test from 'node:test';
import assert from 'node:assert/strict';
import { matchLocale,suggestedStorefront,formatPrice,priceFor } from '../pricing.js';
import { createAppData } from '../scripts/sync-app-data.mjs';

function storeFixture() {
  return {settings:{_locale:'en_US',_storefront:'USA'},subscriptionGroups:[{subscriptions:['monthly','annual'].map(plan=>({
    productID:`com.johnnie.fkngym.statistics.premium.${plan}`,displayPrice:plan==='monthly'?'1.99':'12.99',
    recurringSubscriptionPeriod:plan==='monthly'?'P1M':'P1Y',
    localizations:[{locale:'en_US',displayName:plan,description:'Stats'},{locale:'ru',displayName:'Статистика',description:'История'}],
    ...(plan==='annual'?{introductoryOffer:{paymentMode:'free',subscriptionPeriod:'P3D',numberOfPeriods:1},introductoryOffers:[{paymentMode:'free',subscriptionPeriod:'P3D',numberOfPeriods:1}]}:{}),
  }))}]};
}
const strings={sourceLanguage:'ru',strings:{title:{localizations:{en:{},ru:{},ka:{},'zh-Hans':{},'zh-Hant':{}}}}};
test('imports prices, app locales and deduplicated trial without making up regional prices',()=>{
  const data=createAppData(storeFixture(),strings,{});
  assert.equal(data.products.annual.price,'12.99');
  assert.deepEqual(data.products.annual.trial,{count:3,unit:'day'});
  assert.equal(data.products.monthly.trial,null);
  assert.deepEqual(data.locales,['en','ka','ru','zh-Hans','zh-Hant']);
  assert.equal(data.products.monthly.localizations.ka.locale,'en-US');
  assert.equal(priceFor(data,null,'monthly','RUS'),null);
});
test('source edits change the next generated value',()=>{
  const store=storeFixture();store.subscriptionGroups[0].subscriptions[0].displayPrice='3.49';
  assert.equal(createAppData(store,strings,{}).products.monthly.price,'3.49');
});
test('unknown currency or inconsistent enabled billing plan fails instead of publishing wrong amounts',()=>{
  const store=storeFixture();store.settings._storefront='UNKNOWN';
  assert.throws(()=>createAppData(store,strings,{}),/Unknown currency/);
  store.settings._storefront='USA';store.subscriptionGroups[0].subscriptions[0].billingPlans=[{isEnabled:true,billingPlanType:'BILLED_UPFRONT',displayPrice:'99.00'}];
  assert.throws(()=>createAppData(store,strings,{}),/inconsistent/);
});
test('paid introductory offers are not mislabeled as free',()=>{
  const store=storeFixture();store.subscriptionGroups[0].subscriptions[1].introductoryOffers[0].paymentMode='payUpFront';
  assert.throws(()=>createAppData(store,strings,{}),/introductory offer/);
});
test('BCP47 matching retains Chinese script and Brazilian Portuguese',()=>{
  const supported=['en','ru','pt-BR','zh-Hans','zh-Hant'];
  for (const [input,expected] of [['en_GB','en'],['ru-RU','ru'],['pt-PT','pt-BR'],['zh-TW','zh-Hant'],['zh-HK','zh-Hant'],['zh-CN','zh-Hans'],['zh-Hant-CN','zh-Hant'],['bad_locale! ',null]]) assert.equal(matchLocale(input,supported),expected);
});
test('language formatting keeps USD amount and currency; storefront chooses actual prices',()=>{
  const data=createAppData(storeFixture(),strings,{});
  assert.equal(formatPrice('1.99','USD','ru'),new Intl.NumberFormat('ru',{style:'currency',currency:'USD'}).format(1.99));
  const regional={source:{provider:'app-store-connect'},products:{[data.products.monthly.id]:{territories:{DEU:{price:'2.49',currency:'EUR'}}}}};
  assert.deepEqual(priceFor(data,regional,'monthly','DEU'),{price:'2.49',currency:'EUR'});
  assert.equal(priceFor(data,regional,'monthly','USA'),null);
  assert.equal(suggestedStorefront('de',['USA','DEU']),'DEU');
  assert.equal(suggestedStorefront('ru',['USA','DEU']),'USA');
});
test('generated ICU formatting is used when browser locale support is incomplete',async()=>{
  const {formatPeriod,marketName}=await import('../pricing.js');
  const formats={ka:{prices:{'USD:1.99':'1,99 US$'},periods:{'month:1':'1 თვე'},markets:{USA:'ამერიკის შეერთებული შტატები'}}};
  assert.equal(formatPrice('1.99','USD','ka',formats),'1,99 US$');
  assert.equal(formatPeriod({count:1,unit:'month'},'ka',formats),'1 თვე');
  assert.equal(marketName('USA','ka',formats),'ამერიკის შეერთებული შტატები');
});
