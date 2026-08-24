'use strict';
// v21.4.0 계약 — 재핀 이력:
//   v21.4: 스토리 S급 선위 투자(첫 희귀 +2 · 첫 전설 +5).
//   v22.5: 절대 상한(희귀 2 · 전설 5).
//   v24.2(사용자 0824: "그냥 스토리고 뭐고 초반 희귀함 전설은 빨리
//   만들어지는데로"): 프리미엄 은퇴 — 첫 픽은 순수 최저 선위.  스토리는
//   같은 속도(동률)의 마지막 타이브레이크와 첫 전설 D 미만 제외 필터로만
//   남는다.  이 파일은 "프리미엄이 되살아나지 않는다"를 계약한다.
const assert=require('assert'),fs=require('fs'),path=require('path');
const lib=require('./lib/ordlog_replay.js');
const EXT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

const engine=lib.loadEngine();
const C=global.ORDCore,cat=global.ORD_TMO_UNITS;
const mk=(counts,wisp)=>({catalog:cat,snapshot:{source:'v214',counts:Object.assign({[C.WISP_ID]:wisp},counts),wispCountFound:true,wispCount:wisp,currentAbilities:{}},settings:{currentRound:2,mode:'physical',magicRoute:'auto',manualCounts:{}},locks:[]});

check('① 첫 희귀 — 프리미엄 없이 순수 최저 선위 픽 (v24.2 재핀)',()=>{
  const d=engine.decide(mk({},14)),pick=d.action||d.blockedAction;
  assert(pick,'첫 희귀 픽이 비었다');
  assert(!(d.evidence&&d.evidence.storyPremium),'은퇴한 스토리 프리미엄이 되살아남');
  assert(!/스토리 S급 — 최저 선위/.test(String(d.reason||'')),'사유에 프리미엄 문구가 남아 있다');
  // 빈 패 14선위: 픽은 최저 선위여야 한다 — 대안 중 픽보다 싼 후보가 없다.
  for(const alt of d.alternatives||[])assert(C.num(alt.wispCost)>=C.num(pick.wispCost),`최저 선위가 아님: 픽 ${pick.name}(${pick.wispCost}) > 대안 ${alt.name}(${alt.wispCost})`);
});

check('② 선위가 빠듯해도 같은 규칙 — 프리미엄 발동 없음',()=>{
  const d=engine.decide(mk({},3));
  assert(!(d.evidence&&d.evidence.storyPremium),'빠듯한 패에서 프리미엄 발동');
});

check('③ 소스 계약 — 프리미엄 배선 제거 · 속도 정렬·D 미만 제외는 유지',()=>{
  const src=fs.readFileSync(path.join(EXT,'ord_v15_engine.js'),'utf8');
  assert(!src.includes('premiumBudget'),'프리미엄 예산 배선이 남아 있다');
  assert(!src.includes('premiumCeiling'),'프리미엄 천장 배선이 남아 있다');
  assert(src.includes('const storyPremium=null'),'프리미엄 은퇴 표기 소실');
  // 살아남는 것: fastest-first 정렬 + 동률 스토리 타이브레이크 + 첫 전설 E·F 제외.
  assert(src.includes('a.wispGap-b.wispGap||a.quote.wisp.cost-b.quote.wisp.cost'),'속도 정렬 소실');
  assert(src.includes('storyAbandoned?0:b.story-a.story'),'동률 스토리 타이브레이크 소실');
  assert(src.includes('firstFinalStoryTooSlow'),'첫 전설 D 미만(E·F) 제외 필터 소실');
});

console.log(`\n${checks} checks passed (v21.4.0 — 스토리 프리미엄 은퇴 재핀)`);
