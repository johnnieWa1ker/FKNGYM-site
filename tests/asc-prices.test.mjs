import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync,verify } from 'node:crypto';
import { createClient,makeToken,selectTerritoryPrices } from '../scripts/export-asc-prices.mjs';
function row(id,price,{startDate=null,preserved=false,planType='UPFRONT',territory='USA'}={}) {
  return {record:{type:'subscriptionPrices',id,attributes:{startDate,preserved,planType},relationships:{territory:{data:{type:'territories',id:territory}},subscriptionPricePoint:{data:{type:'subscriptionPricePoints',id}}}},point:{type:'subscriptionPricePoints',id,attributes:{customerPrice:price}}};
}
const territory={type:'territories',id:'USA',attributes:{currency:'USD'}};
const collect=rows=>({data:rows.map(r=>r.record),included:rows.map(r=>r.point)});
test('new-subscriber price excludes preserved, future, and different billing plans',()=>{
  const rows=[row('base','1.99'),row('past','2.99',{startDate:'2026-08-01'}),row('old','0.99',{preserved:true}),row('future','5.99',{startDate:'2026-10-01'}),row('commitment','0.49',{startDate:'2026-09-01',planType:'MONTHLY'})];
  assert.equal(selectTerritoryPrices(collect(rows),[territory],[],'2026-09-09').USA.price,'2.99');
});
test('incomplete and ambiguous prices fail instead of overwriting a usable snapshot',()=>{
  assert.throws(()=>selectTerritoryPrices({data:[],included:[]},[territory],[],'2026-09-09'),/No current/);
  assert.throws(()=>selectTerritoryPrices(collect([row('a','1.99'),row('b','2.99')]),[territory],[],'2026-09-09'),/Ambiguous/);
  const missing=collect([row('a','1.99')]); missing.included=[];
  assert.throws(()=>selectTerritoryPrices(missing,[territory],[],'2026-09-09'),/Missing included/);
});
test('trial is tied to territory and current eligibility window',()=>{
  const offer={attributes:{offerMode:'FREE_TRIAL',duration:'THREE_DAYS',numberOfPeriods:1,startDate:'2026-09-01',endDate:'2026-09-30'},relationships:{territory:{data:{id:'USA'}}}};
  assert.deepEqual(selectTerritoryPrices(collect([row('a','1.99')]),[territory],[offer],'2026-09-09').USA.trial,{count:3,unit:'day'});
  assert.equal(selectTerritoryPrices(collect([row('a','1.99')]),[territory],[offer],'2026-10-01').USA.trial,null);
});
test('all pages and included records are collected; auth never leaves Apple',async()=>{
  const calls=[];
  const get=createClient('private-token',async(url,options)=>{
    calls.push([url.href,options]);
    return {ok:true,json:async()=>({data:[{id:String(calls.length)}],included:[{id:'included'+calls.length}],links:calls.length===1?{next:'/v1/test?cursor=2'}:{}})};
  });
  const response=await get('/v1/test');
  assert.equal(response.data.length,2);assert.equal(response.included.length,2);
  assert.equal(calls[0][1].redirect,'error');
  const unsafe=createClient('private-token',async()=>({ok:true,json:async()=>({data:[],links:{next:'https://example.com/v1/steal'}})}));
  await assert.rejects(()=>unsafe('/v1/test'),/Invalid.*pagination/);
});
test('JWT uses ES256, a ten-minute lifetime and a raw P1363 signature',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
  const token=makeToken({keyId:'test-key',issuerId:'test-issuer',privateKey:privateKey.export({type:'pkcs8',format:'pem'})},1000);
  const [header,payload,signature]=token.split('.');
  assert.equal(JSON.parse(Buffer.from(payload,'base64url')).exp,1600);
  assert.equal(Buffer.from(signature,'base64url').length,64);
  assert(verify('sha256',Buffer.from(`${header}.${payload}`),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')));
});
