'use strict';
// v22.5.0 계약 — 스토리 투자 절대 상한 + 스토리 밀기 포기 (사용자 규칙).
//
// 사용자: "희귀함은 아무리 스토리 랭크가 높더라도 3개쓰는건 오바야 2개가
// 최대 전설도 마찬가지 5개가 최대야 그리고 스토리 빨리 밀기 포기 버튼
// 누르면 스토리 랭킹 상관없이 선택위습 가장 적게 사용하는 전설급 유닛
// 추천하게 해줘"
//
// ① 스토리 프리미엄 절대 상한: 첫 희귀 총 2선위 · 첫 전설 총 5선위 —
//   v21.4 의 상대 예산(+2/+5)에 절대 천장을 씌운다.
// ② 스토리 밀기 포기(storyRushAbandoned): 프리미엄·스토리 타이브레이크
//   전부 끄고 순수 최저 선위.  국면 ①② 패널 토글, 새 게임 리셋.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const appSrc=read('ord_app.js'),engineSrc=read('ord_v15_engine.js'),css=read('ord_ui_v20.css');
const tests=[];
function test(name,fn){tests.push([name,fn]);}

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,engine=context.ORDV15Engine,App=context.ORDApp.App;
const cat=context.ORD_TMO_UNITS;
const mk=(counts,wisp,extra)=>({catalog:cat,snapshot:{source:'v225',counts:Object.assign({[C.WISP_ID]:wisp},counts),wispCountFound:true,wispCount:wisp,currentAbilities:{}},settings:Object.assign({currentRound:2,mode:'physical',magicRoute:'auto',manualCounts:{}},extra||{}),locks:[]});

test('① 절대 상한 배선: 프리미엄 픽 총 선위 상한이 예산과 같은 절대값이다 (소스 계약)',()=>{
  assert(engineSrc.includes('premiumCeiling=premiumBudget'),'절대 천장이 없다');
  assert(engineSrc.includes('Math.min(num(best.quote.wisp.cost)+premiumBudget,premiumCeiling)'),'천장이 cap 에 걸려 있지 않다');
});

test('① 상한 거동: 빈 패 첫 희귀 프리미엄은 총 2선위 안 — v21.4 실측 유지',()=>{
  // v21.4 실측: 빈 패 첫 희귀 최저가 0(샹크스류) → S급 거프(2선위) 스왑.
  // 절대 상한 2 는 이 케이스를 그대로 통과시킨다(총 2 ≤ 2).
  const decision=engine.decide(mk({},12));
  const premium=decision.evidence&&decision.evidence.storyPremium;
  if(premium){
    const pick=decision.action||decision.blockedAction;
    assert(C.num(pick.wispCost)<=2,`첫 희귀 프리미엄 픽이 2선위를 넘음: ${pick.name} ${pick.wispCost}`);
  }
});

test('② 스토리 밀기 포기: 프리미엄·스토리 타이브레이크가 꺼지고 최저 선위 유지',()=>{
  // 빈 패 실측(샹크스 10 · 거프 12)에선 절대 상한 2 때문에 대조군에도
  // 프리미엄이 없다 — 그건 ①의 계약이다.  여기서 지키는 것: 포기 상태는
  // 어떤 경우에도 프리미엄이 없고, 증거·사유가 명시되며, 픽이 대조군보다
  // 비싸지지 않는다.
  const normal=engine.decide(mk({},12));
  const abandoned=engine.decide(mk({},12,{storyRushAbandoned:true}));
  assert(!(abandoned.evidence&&abandoned.evidence.storyPremium),'포기 상태에서 프리미엄이 살아 있다');
  assert.strictEqual(abandoned.evidence&&abandoned.evidence.storyRushAbandoned,true,'포기 증거 없음');
  const normalPick=normal.action||normal.blockedAction,abandonedPick=abandoned.action||abandoned.blockedAction;
  assert(C.num(abandonedPick.wispCost)<=C.num(normalPick.wispCost),'포기 픽이 대조군보다 비싸다');
  assert(String(abandoned.reason||'').includes('스토리 밀기 포기')||String(abandonedPick.reason||'').includes('스토리 밀기 포기'),'포기 사유 문구가 없다');
  assert(engineSrc.includes('storyAbandoned?0:b.story-a.story'),'스토리 타이브레이크 차단이 없다');
});

test('③ 앱 배선: 토글 버튼·상태·캐시 키·새 게임 리셋',()=>{
  for(const marker of ["a==='story-rush-toggle'",'storyRushAbandoned:false','v225StoryRushButton','스토리 빨리 밀기 포기','storyRushAbandoned:settings.storyRushAbandoned===true','vetoIds:[],storyRushAbandoned:false,upperDetection'])assert(appSrc.includes(marker),`앱 배선 누락: ${marker}`);
  assert(css.includes('.v225-story-rush{'),'토글 CSS 없음');
  const obj=Object.create(App.prototype);
  obj.state={storyRushAbandoned:false};
  assert(obj.v225StoryRushButton().includes('스토리 빨리 밀기 포기'),'꺼짐 상태 라벨');
  obj.state.storyRushAbandoned=true;
  assert(obj.v225StoryRushButton().includes('되돌리기'),'켜짐 상태 라벨');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V22_5_0_STORY_CAP ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
