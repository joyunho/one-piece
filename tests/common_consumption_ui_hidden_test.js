'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
const css=fs.readFileSync(path.join(EXT,'ord_app.css'),'utf8');

let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

check('common cards remain in the internal hand ledger and recipe diagnostics',()=>{
  assert(app.includes("{key:'common',label:'흔함',aliases:['common','흔함']}"));
  assert(app.includes("ledger.tiers.common.wispSubstitute"));
  assert(app.includes('commonTop:C.commonTop'));
  assert(app.includes('(row.commonTop||[])'));
  assert(app.includes('solve.lowestMissing'));
});

check('all coaching consumption summaries use only Rare, Special, and Uncommon',()=>{
  assert(app.includes("const VISIBLE_HAND_TIER_META=HAND_TIER_META.filter(meta=>meta.key!=='common')"));
  assert(app.includes("tierKeys=['rare','special','uncommon']"));
  assert(app.includes("tierHtml=['rare','special','uncommon'].map"));
  assert(app.includes('usageParts=VISIBLE_HAND_TIER_META.map'));
  assert(app.includes('tierSummaryHtml=VISIBLE_HAND_TIER_META.map'));
  assert(app.includes('tierDetailHtml=VISIBLE_HAND_TIER_META.map'));
  assert(app.includes('tierLines=VISIBLE_HAND_TIER_META.map'));
  assert(!app.includes("tierKeys=['rare','special','uncommon','common']"));
  assert(!app.includes("tierHtml=['rare','special','uncommon','common'].map"));
});

check('common spent and remaining figures are absent from user-facing copy',()=>{
  for(const forbidden of [
    '흔함 잔량',
    '전체 흔함 요구',
    '보유 흔함 사용',
    '희귀·특별·안흔·흔함',
    '희귀 → 특별 → 안흔 → 흔함',
    '부족 흔함 대체'
  ])assert(!app.includes(forbidden),`still exposes: ${forbidden}`);
  assert(app.includes('희귀·특별·안흔함만 표시합니다.'));
});

check('the verbose allocation ledger is collapsed and three-column layouts remain balanced',()=>{
  assert(app.includes('<details class="hand-tier-ledger"><summary>등급별 상세 사용처</summary>'));
  assert(css.includes('.hand-tier-summaries{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))'));
  assert(css.includes('.support-tier-vector{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))'));
  assert(css.includes('.direction-hand{display:grid;grid-template-columns:repeat(4,1fr)'));
});

console.log(`\n${checks}/${checks} common-consumption UI checks passed.`);
