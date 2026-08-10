'use strict';

// v17.7: 외부 개선본 조율 회귀 테스트.
//  1) 완성 마일스톤 분리 — 추가 전설·히든에는 하드 마감이 없다
//  2) 전투 기여 점수 — 화력 예외는 스턴·구조 축을 제외한 combatGain으로만 열린다
//  3) 대안 목록 — 최우선 후보가 대안에 중복 노출되지 않는다
//  4) 152 기준선 — 이미 보유한 특별함 위에 선택분 1개를 정확히 얹는다
//  5) 설정 마이그레이션 — 구버전 암묵 물딜은 자동('')으로 돌아간다
//  6) 리롤 사후 확인 — 해당 희귀 수량 감소로만 대기가 풀린다(소스 검증)

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
const originalWarn=console.warn;
console.warn=()=>{};
for(const file of [
  'ord_units_data.js',
  'ord_upper_memo.js',
  'ord_synergy_memo.js',
  'ord_data_patch.js',
  'ord_story_nonupper_data.js',
  'ord_story_upper_data.js',
  'ord_upper_combat_data.js',
  'ord_upper_skill_digest.js',
  'ord_upper_skill_dps.js',
  'ord_core.js',
  'ord_squad_planner.js',
  'ord_v15_model.js',
  'ord_v15_ledger.js',
  'ord_v15_policy.js',
  'ord_v15_engine.js',
  'ord_app.js'
])require(path.join(EXT,file));
console.warn=originalWarn;

const C=global.ORDCore;
const M=global.ORDV15Model;
const P=global.ORDV15Policy;
const E=global.ORDV15Engine;
const T=global.ORDApp._test;
const units=global.ORD_TMO_UNITS;
const byName=n=>units.find(u=>C.nameOf(u)===n)||units.find(u=>C.nameOf(u).startsWith(n));

const tests=[];
function test(name,fn){tests.push([name,fn]);}

// 합성 카탈로그: 희귀 1(보유), 전설 3종(보유 1 · 99% 제작불가 · 96% 즉시가능).
function milestoneFixture({round,ownLegend,postLegendRoute}){
  const wisp={id:C.WISP_ID,name:'선택위습',groupName:'특수재료',abilities:{},stuffs:[]};
  const common={id:'ms-common',name:'흔함',groupName:'흔함',abilities:{},stuffs:[]};
  const rareOwned={id:'ms-rare',name:'희귀 보유',groupName:'희귀함',abilities:{},stuffs:[{id:common.id,count:1}]};
  const legendOwned={id:'ms-legend-owned',name:'전설 보유',groupName:'전설',abilities:{},stuffs:[{id:common.id,count:1}]};
  const legendTop={id:'ms-legend-top',name:'전설 최고완성',groupName:'전설',abilities:{},stuffs:[{id:common.id,count:1},{id:C.WISP_ID,count:9}]};
  const legendNow={id:'ms-legend-now',name:'전설 즉시가능',groupName:'전설',abilities:{},stuffs:[{id:common.id,count:1}]};
  const catalog=[wisp,common,rareOwned,legendOwned,legendTop,legendNow];
  const counts={[common.id]:2,'ms-rare':1,[C.WISP_ID]:2};
  if(ownLegend)counts[legendOwned.id]=1;
  return E.decide({catalog,snapshot:{source:'t',counts,currentAbilities:{},wispCountFound:true,wispCount:2,units:catalog.map(u=>Object.assign({},u,{count:C.num(counts[u.id]),tmoPercent:u.id===legendTop.id?99:u.id===legendNow.id?96:0}))},settings:{mode:'',magicRoute:'auto',currentRound:round,postLegendRoute:postLegendRoute||'',gorosei:'none',superKumaOwned:false,manualCounts:{}},locks:[]});
}

test('마일스톤 분리: 첫 전설은 20라 마감 탈출, 추가 전설은 마감 없이 최고 완성도 유지',()=>{
  // 첫 전설: 20라를 넘기면 제작 불가 99% 대신 즉시 가능 96%로 전환한다.
  const first=milestoneFixture({round:21,ownLegend:false});
  assert.strictEqual(first.evidence.completionMilestone,'firstFinal','첫 전설 마일스톤이 아니다');
  assert.strictEqual(first.state,'ACT_NOW',`첫 전설이 즉시 가능 픽을 두고 대기: ${first.state}`);
  assert.strictEqual(first.action&&first.action.id,'ms-legend-now');
  // v21.3(사용자: "제일 빠르게 만들 수 있는 걸로"): 첫 픽이 속도 우선이라
  // 즉시 가능 96%를 처음부터 고른다 — 완성도 1위(제작 불가 99%)를 쫓다가
  // 마감에 몰려서야 갈아타던 "탈출"은 일어날 일 자체가 없어졌다.  지켜야
  // 하는 것은 "마감을 넘긴 채 제작 불가를 붙들지 않는다"이고, 그건 즉시
  // 가능 픽 + 탈출 증거 없음으로 더 강하게 성립한다.
  assert.strictEqual(first.evidence.deadlineEscape,null,'속도 우선인데 마감 탈출이 발생 — 순위가 완성도로 회귀했다');
  // 추가 전설: 마감이 없으므로 같은 라운드 조건에서도 전환 없이 준비를 유지한다.
  const additional=milestoneFixture({round:25,ownLegend:true,postLegendRoute:'legend'});
  assert.strictEqual(additional.evidence.completionMilestone,'additionalFinal','추가 전설 마일스톤이 아니다');
  assert.strictEqual(additional.state,'PREPARE',`추가 전설이 마감 탈출로 오염됐다: ${additional.state}`);
  assert.strictEqual(additional.blockedAction&&additional.blockedAction.id,'ms-legend-top','최고 완성도 우선이 무너졌다');
  assert.strictEqual(additional.evidence.deadlineEscape,null,'추가 전설에 마감 탈출 증거가 생겼다');
});

test('완성 마일스톤 대안 목록은 최우선 후보를 중복 노출하지 않는다',()=>{
  const additional=milestoneFixture({round:25,ownLegend:true,postLegendRoute:'legend'});
  const bestId=additional.blockedAction.id;
  assert((additional.alternatives||[]).length>0,'대안이 비어 픽스처가 무의미하다');
  assert(!additional.alternatives.some(alt=>alt.id===bestId),'최우선 후보가 대안에도 중복 노출됐다');
});

test('전투 기여 점수: 물딜 축은 스턴·구조 지원을 세지 않는다',()=>{
  const route=P.ROUTES.physical;
  const bajess=units.find(u=>u.id==='V10h');
  const akainu=units.find(u=>u.id==='P10h');
  assert(bajess&&C.num(C.roleContribution(bajess,'physical').stun)>0,'바제스 픽스처 붕괴(스턴 희귀 아님)');
  assert.strictEqual(E._test.combatPowerScore(bajess,route),0,'스턴 전용 희귀가 전투 기여 점수를 받았다');
  assert(E._test.combatPowerScore(akainu,route)>0,'보스딜 희귀의 전투 기여 점수가 0이다');
  // 보드 점수는 단순 합산: 아카이누 1기 추가 = 단일 점수만큼 정확히 상승.
  const model=M.build({catalog:units,snapshot:{source:'t',sessionId:'s',seq:1,at:1,dataChangedAt:1,counts:{P10h:1},currentAbilities:{},wispCountFound:true,wispCount:0},settings:{mode:'physical',magicRoute:'auto',currentRound:50,gorosei:'none',superKumaOwned:true},locks:[]});
  const before=E._test.boardCombatScore(model,{},route),after=E._test.boardCombatScore(model,{P10h:1},route);
  assert.strictEqual(after-before,E._test.combatPowerScore(akainu,route));
});

// v17.6 감사 테스트와 같은 화력 픽스처(아카이누)로 대안 중복 제거를 확인한다.
function firepowerFixture(round){
  const picks={F50h:1};
  for(const [n,c] of [['료쿠규 2',2],['에이스 (깍40 공증20 이감20)',2],['킹 3',1],['스모커 (이감50 암브)',1],['시키 (1스턴, 암브)',1],['바르톨로메오 (0.9스턴, 깍 12)',1],['킬러 (광보잡, 깍12)',1],['흰수염 (깍15 발동이감 보조딜)',1]]){
    const u=byName(n);assert(u,`픽스처 유닛 없음: ${n}`);picks[u.id]=(picks[u.id]||0)+c;
  }
  const akainu=units.find(u=>u.id==='P10h');
  for(const s of akainu.stuffs)picks[s.id]=(picks[s.id]||0)+s.count;
  picks['810e']=3;
  // v22.3(사용자: "희귀함은 이감 부족한 거 채우는 목적 아니면 추천하지마"):
  // 단독 희귀는 필수가 전부 닫힌 50라+ 화력 창에서만 허용된다.  이 픽스처는
  // v17_6 사본(v18.8에서 피셔타이거 보강)과 달리 광보잡 1/2이 열린 채였다 —
  // 같은 보강으로 "완전 충족 + 화력 창" 전제를 지킨다.  이 테스트의 원칙
  // (대안 목록 중복 제거)은 그대로다.
  picks['740h']=(picks['740h']||0)+1;
  const locks=[{stage:'upper',id:'F50h',source:'t'}];
  return{model:M.build({catalog:units,snapshot:{source:'t',sessionId:'s',seq:round,at:round,dataChangedAt:round,counts:picks,currentAbilities:{},wispCountFound:true,wispCount:3},settings:{mode:'physical',magicRoute:'auto',currentRound:round,gorosei:'none',postLegendRoute:'upper',superKumaOwned:true},locks}),locks};
}

test('탐색 대안 목록도 확정 행동을 중복 노출하지 않는다',()=>{
  const{model,locks}=firepowerFixture(56);
  const decision=E.decide({model,locks});
  assert.strictEqual(decision.state,'ACT_NOW','화력 픽스처가 ACT_NOW가 아니다');
  assert(!(decision.alternatives||[]).some(alt=>alt.id===decision.action.id),'확정 행동이 대안에도 중복 노출됐다');
});

function baselineModel(counts,settings){
  return M.build({catalog:units,snapshot:{source:'t',sessionId:'s',seq:1,at:1,dataChangedAt:1,counts,currentAbilities:{},wispCountFound:true,wispCount:0},settings:Object.assign({mode:'',magicRoute:'auto',currentRound:30,gorosei:'none',superKumaOwned:true},settings),locks:[]});
}

test('152 기준선: 이미 보유한 특별함 위에 선택분 1개를 정확히 얹는다',()=>{
  // 기준선 없이 2개를 보유 중이면 선택 자체가 이미 반영된 것으로 본다(중복 방지).
  const noBaseline=baselineModel({'610h':2},{virtualSpecialId:'610h'});
  assert.strictEqual(C.num(noBaseline.effective.counts['610h']),2,'기준선 없는 보유분에 가상 1개가 중복 삽입됐다');
  assert.strictEqual(noBaseline.patch.virtualSpecial.alreadyObserved,true);
  // 선택 시점 보유 2개를 기준선으로 잡으면 예상 3개가 된다.
  const withBaseline=baselineModel({'610h':2},{virtualSpecialId:'610h',virtualSpecialBaselineId:'610h',virtualSpecialBaselineCount:2});
  assert.strictEqual(C.num(withBaseline.effective.counts['610h']),3,'기준선 2보유+선택이 3으로 예상되지 않았다');
  assert.strictEqual(withBaseline.patch.virtualSpecial.applied,true);
  // 기준선보다 실제 수량이 늘면(3개 관측) 보상 도착으로 보고 더 얹지 않는다.
  const arrived=baselineModel({'610h':3},{virtualSpecialId:'610h',virtualSpecialBaselineId:'610h',virtualSpecialBaselineCount:2});
  assert.strictEqual(C.num(arrived.effective.counts['610h']),3,'보상 도착 후에도 가상 1개가 더 얹혔다');
  assert.strictEqual(arrived.patch.virtualSpecial.alreadyObserved,true);
});

test('설정 마이그레이션: 구버전 암묵 물딜만 자동으로 돌아가고 명시 선택은 유지된다',()=>{
  // 구버전(리비전<177)의 물딜은 기본값 잔재일 수 있으므로 자동('')으로 되돌린다.
  const implicit=T.normalizeInitialState({mode:'physical'});
  assert.strictEqual(implicit.mode,'','구버전 암묵 물딜이 자동으로 돌아가지 않았다');
  assert.strictEqual(implicit.modeExplicit,false);
  assert.strictEqual(implicit.settingsRevision,178);
  // 구버전이라도 마딜은 반드시 사용자가 고른 값이므로 유지한다.
  assert.strictEqual(T.normalizeInitialState({mode:'magic'}).mode,'magic');
  // 방향 확정·상위 잠금 등 실사용 증거가 있으면 물딜도 유지한다.
  assert.strictEqual(T.normalizeInitialState({mode:'physical',directionKey:'physical'}).mode,'physical');
  assert.strictEqual(T.normalizeInitialState({mode:'physical',locks:[{stage:'upper',id:'F50h'}]}).mode,'physical');
  // 신버전 명시 선택은 그대로.
  const explicit=T.normalizeInitialState({mode:'physical',modeExplicit:true,settingsRevision:177});
  assert.strictEqual(explicit.mode,'physical');
  assert.strictEqual(explicit.modeExplicit,true);
});

test('리롤 사후 확인: 수량 감소·타임아웃 안전장치로 대기가 풀린다(소스 검증)',()=>{
  // v17.12.1: 20260725 교착 로그로 "대상 감소로만 해제" 계약을 폐기.
  // 대상 감소(target) 외에 다른 유닛 감소(other)·2라운드/120초(timeout)
  // 해제와 수동 해제 버튼을 요구한다.
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes('pendingRerollRelease'),'해제 판정 메서드 누락');
  assert(app.includes("return'target'"),'대상 감소 해제 누락');
  assert(app.includes("return'other'"),'다른 유닛 감소 해제 누락');
  assert(app.includes("return'timeout'"),'타임아웃 해제 누락');
  assert(app.includes('리롤 결과 확인 대기'),'리롤 대기 SYNC_BLOCKED 라벨 누락');
  assert(app.includes('data-act="cancel-reroll"'),'수동 해제 버튼 누락');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V17_7_RECONCILE ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
