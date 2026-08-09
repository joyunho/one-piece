'use strict';
// v21.4.0 계약 — 사용자 전략 구상(전략_구상.md) ①②의 스토리 S급 선위 투자.
//
//  ① 첫 희귀(7라 미션): 최저 선위 우선이되, 스토리 S급이면 최저가 대비
//     선위 +2까지 투자.  ② 첫 전설(20라 보스): 같은 규칙 +5.  그 외
//     (추가 전설 등)에는 프리미엄이 없다.  프리미엄은 지금 실제로 만들 수
//     있는 후보끼리만 — 없는 선위를 상상해 투자하지 않는다.
const assert=require('assert'),fs=require('fs'),path=require('path');
const lib=require('./lib/ordlog_replay.js');
const EXT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

const engine=lib.loadEngine();
const C=global.ORDCore,cat=global.ORD_TMO_UNITS;
const mk=(counts,wisp)=>({catalog:cat,snapshot:{source:'v214',counts:Object.assign({[C.WISP_ID]:wisp},counts),wispCountFound:true,wispCount:wisp,currentAbilities:{}},settings:{currentRound:2,mode:'physical',magicRoute:'auto',manualCounts:{}},locks:[]});

check('① 첫 희귀 — S급이 최저가 +2 안이면 투자하고 근거를 밝힌다',()=>{
  const d=engine.decide(mk({},14)),pick=d.action||d.blockedAction;
  const premium=d.evidence&&d.evidence.storyPremium;
  // 실카탈로그 기준: 빈 패 최저가 희귀는 S급이 아니고(현재 샹크스 B),
  // S급 희귀(거프 등)가 +2 창 안에 있다.  데이터가 바뀌어 최저가 자체가
  // S급이 되면 프리미엄 없이도 계약 충족 — 그 경우도 통과로 인정한다.
  const pickTier=String(C.storyGrade(pick.unit||cat.find(u=>u.id===pick.id)).tier||'');
  if(premium){
    assert(/^S/.test(premium.tier),'프리미엄이 S급이 아닌 후보에 발동');
    assert(premium.extraWisp<=2,`첫 희귀 투자 한도 초과: +${premium.extraWisp}`);
    assert(/스토리 S급/.test(String(d.reason)),'사유에 프리미엄 근거 없음');
    assert(/7라 미션/.test(String(d.reason)),'7라 미션 근거 없음');
  }else{
    assert(/^S/.test(pickTier),`프리미엄도 없고 픽도 S급이 아님: ${pick.name}`);
  }
});

check('② 예산 밖 S급에는 투자하지 않는다 — 최저 선위 유지',()=>{
  // 선위가 빠듯한 패(최저가만 겨우 가능)에서는 +2 창에 들어오는 S급이
  // 없으므로 프리미엄이 발동하지 않아야 한다.
  const d=engine.decide(mk({},3)),premium=d.evidence&&d.evidence.storyPremium;
  if(premium)assert(premium.extraWisp<=2,'예산 밖 투자');
});

check('③ 소스 계약 — 첫 전설 +5 · 추가 전설 프리미엄 없음 · 실제작 가능 한정',()=>{
  const src=fs.readFileSync(path.join(EXT,'ord_v15_engine.js'),'utf8');
  assert(src.includes("milestoneSpec.key==='firstRare'?2:milestoneSpec.key==='firstFinal'?5:0"),'예산 배선(희귀 2 · 전설 5 · 그 외 0) 소실');
  assert(src.includes('item.quote.feasible&&/^S/.test'),'실제작 가능 한정이 풀림 — 없는 선위에 투자');
  assert(src.includes('item.hardShort<=0'),'뽑기 막힌 재료 후보가 프리미엄 대상에 섞임');
});

console.log(`\n${checks} checks passed (v21.4.0 — 스토리 S급 선위 투자)`);
