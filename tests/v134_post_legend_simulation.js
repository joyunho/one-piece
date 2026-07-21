'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const extensionCandidates=[
  'ord_tmo_auto_extension_v15_0_0_rebuild'
];
const extensionName=extensionCandidates.find(name=>fs.existsSync(path.join(ROOT,name,'ord_core.js')))
  ||fs.readdirSync(ROOT).find(name=>/^ord_tmo_auto_extension_v13_4/.test(name)&&fs.existsSync(path.join(ROOT,name,'ord_core.js')));
assert(extensionName,'v13.4 extension fixture was not found');
const EXT=path.join(ROOT,extensionName);

global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const units=global.ORD_TMO_UNITS;
const db=C.buildDb(units);
const RAYLEIGH_HIDDEN='unit_1767884906256_4990';
const NIKA_ITEM='700I';

const settings=(round,extra={})=>Object.assign({
  currentRound:round,
  mode:'physical',
  purpose:'',
  postLegendRoute:'',
  gorosei:'none',
  magicRoute:'auto',
  targetSquadCount:9,
  manualCounts:{},
  stunConditions:{},
  superKumaOwned:true,
  allowWarped:true,
  recommendWarped:true,
  upperPreviewId:''
},extra);

function stateAt(round,counts={},progress={},extra={}){
  const live=Object.entries(progress).map(([id,tmoPercent])=>({id,tmoPercent}));
  return C.normalizeState(units,{source:'v13.4-route-replay',at:Date.now(),counts,units:live,currentAbilities:{}},settings(round,extra));
}

function planAt(round,counts={},progress={},extra={},locks=[]){
  const options=settings(round,extra),state=stateAt(round,counts,progress,extra);
  return C.recommendationPlan(state,locks,options,global.ORD_UPPER_MEMO,global.ORD_SYNERGY_MEMO);
}

function upperHand(base={}){
  const counts=Object.assign({[C.WISP_ID]:36,V20h:1,T20h:1},base);
  for(const unit of units){
    if(C.isCommon(unit))counts[unit.id]=Math.max(C.num(counts[unit.id]),14);
    else if(C.isUncommon(unit))counts[unit.id]=Math.max(C.num(counts[unit.id]),7);
    else if(C.isSpecialTier(unit))counts[unit.id]=Math.max(C.num(counts[unit.id]),4);
  }
  for(const unit of db.rares)counts[unit.id]=Math.max(C.num(counts[unit.id]),2);
  return counts;
}

const checkpoints=[];
function record(round,label,plan,note=''){
  const names=(plan.actions||[]).slice(0,3).map(row=>`${C.nameOf(row.unit)} ${C.num(row.progress)}%`).join(' → ')||'추천 없음';
  checkpoints.push({round,label,phase:plan.flow.phase,purpose:plan.purpose,recommendation:names,note});
}

function assertCompletionOrder(rows){
  for(let index=1;index<rows.length;index++){
    assert(rows[index-1].progress>=rows[index].progress,`TMO order inverted: ${rows[index-1].unit.id} ${rows[index-1].progress}% < ${rows[index].unit.id} ${rows[index].progress}%`);
  }
}

assert(db.byId.has('V20h')&&db.byId.has('T20h')&&db.byId.has('A30h'),'legend replay fixtures missing');
assert(db.byId.has('KB0H')&&db.byId.has(RAYLEIGH_HIDDEN)&&db.byId.has(NIKA_ITEM),'prerequisite fixtures missing');

// 7R: the first Rare remains completion-first.
const rareFixtures=db.rares.slice(0,3);
assert.strictEqual(rareFixtures.length,3,'rare fixtures missing');
const rareProgress={
  [rareFixtures[0].id]:57,
  [rareFixtures[1].id]:96,
  [rareFixtures[2].id]:81
};
const firstRare=planAt(7,{},rareProgress);
assert.deepStrictEqual([firstRare.flow.phase,firstRare.purpose],['first-rare','rare']);
assert.strictEqual(firstRare.actions[0].unit.id,rareFixtures[1].id);
assertCompletionOrder(firstRare.actions);
record(7,'첫 희귀',firstRare,'TMO 완성도 96% 후보 선택');

// 20R: a locked 100% Rayleigh recipe is omitted, so the closest legal first
// Legend/Hidden is selected solely by transmitted completion.
const firstLegendProgress={A30h:100,V20h:96,T20h:88,'630h':74};
const firstLegend=planAt(20,{[rareFixtures[1].id]:1},firstLegendProgress);
assert.deepStrictEqual([firstLegend.flow.phase,firstLegend.purpose],['first-legend','story']);
assert.strictEqual(firstLegend.actions[0].unit.id,'V20h');
assert(!firstLegend.rows.some(row=>row.unit.id==='A30h'),'Rayleigh-gated legend leaked into first-Legend ranking');
assertCompletionOrder(firstLegend.actions);
record(20,'첫 전설·히든',firstLegend,'레일리 히든 미보유 A30h 100% 제외');

// Once the first Legend exists, route='' intentionally reproduces the app's
// fresh decision baseline: no recommendation may run before the user chooses.
const choice20=planAt(20,{V20h:1},{});
assert.deepStrictEqual([choice20.flow.phase,choice20.purpose,choice20.selectionMode],['post-legend-choice','choice','decision']);
assert.strictEqual(choice20.flow.postLegendDecisionRequired,true);
assert.deepStrictEqual([choice20.actions.length,choice20.rows.length,choice20.watch.length,choice20.prep.length],[0,0,0,0]);
record(20,'사용자 선택 대기',choice20,'actions 0 · 자동 상위 전환 없음');

// The user chooses one more Legend/Hidden. Completion outranks strategy score,
// while the same missing prerequisite continues to exclude A30h.
const additionalProgress={A30h:100,T20h:97,'630h':91,O20h:83};
const additional20=planAt(20,{V20h:1},additionalProgress,{postLegendRoute:'legend'});
assert.deepStrictEqual([additional20.flow.phase,additional20.purpose,additional20.completionForced],['additional-legend','story',true]);
assert.deepStrictEqual(additional20.actions.slice(0,3).map(row=>[row.unit.id,row.progress,row.completionRank]),[
  ['T20h',97,1],['630h',91,2],['O20h',83,3]
]);
assert(!additional20.rows.some(row=>row.unit.id==='A30h'));
assertCompletionOrder(additional20.rows);
record(20,'전설·히든 한 기 더',additional20,'97% → 91% → 83% TMO 순서');

// After that unit is completed, the core input route='' returns to the choice
// state. This is the core-side equivalent of the app clearing its baseline.
const choice25=planAt(25,{V20h:1,T20h:1},additionalProgress);
assert.deepStrictEqual([choice25.flow.phase,choice25.purpose,choice25.flow.postLegendDecisionRequired],['post-legend-choice','choice',true]);
assert.strictEqual(choice25.actions.length,0);
record(25,'추가 전설 완성 후 재선택',choice25,'route="" · actions 0');

// A user's Legend choice is respected at both 25R and 30R; the round number
// cannot silently force the route to Upper preparation.
const continue25=planAt(25,{V20h:1,T20h:1},additionalProgress,{postLegendRoute:'legend'});
const continue30=planAt(30,{V20h:1,T20h:1},additionalProgress,{postLegendRoute:'legend'});
for(const plan of [continue25,continue30]){
  assert.deepStrictEqual([plan.flow.phase,plan.purpose,plan.flow.postLegendRoute],['additional-legend','story','legend']);
  assert(plan.actions.length>0);
  assertCompletionOrder(plan.actions);
}
record(25,'전설 경로 유지',continue25,'25라운드 선택 존중');
record(30,'전설 경로 유지',continue30,'30라운드도 강제 상위 전환 없음');

// Acquiring the prerequisite makes the 100% Rayleigh recipe immediately rejoin
// the completion ranking at number one.
const rayleighOpen=planAt(25,{V20h:1,T20h:1,[RAYLEIGH_HIDDEN]:1},additionalProgress,{postLegendRoute:'legend'});
assert.strictEqual(rayleighOpen.actions[0].unit.id,'A30h');
assert.strictEqual(rayleighOpen.actions[0].progress,100);
record(25,'레일리 히든 획득',rayleighOpen,'A30h 100% 후보 복귀');

// Switching to Upper preparation produces only legal 80%+ upper candidates.
// Nika Eternal is 100%, but remains absent until its exact item is owned.
const upperProgress={KB0H:100,J40h:96,C40h:91,A40h:86};
const upperCounts=upperHand();
const upper25=planAt(25,upperCounts,upperProgress,{postLegendRoute:'upper'});
assert.deepStrictEqual([upper25.flow.phase,upper25.purpose,upper25.flow.postLegendRoute],['upper-choice','upper','upper']);
assert(upper25.actions.length>0,'upper preparation produced no candidates');
assert(upper25.actions.every(row=>C.isUpper(row.unit)&&row.progress>=80));
assert(upper25.actions.every(row=>C.specialPrerequisiteStatus(db,row.unit,upper25.reserved.stock).allowed));
assert(!upper25.rows.some(row=>row.unit.id==='KB0H'),'item-gated Nika leaked into upper candidates');
record(25,'상위 준비 선택',upper25,'특수 선행재료 없는 80%+ 상위만 표시');

const itemOpenCounts=upperHand({[NIKA_ITEM]:1});
const itemOpen=planAt(25,itemOpenCounts,upperProgress,{postLegendRoute:'upper'});
assert(itemOpen.rows.some(row=>row.unit.id==='KB0H'),'Nika did not return after its exact item was acquired');

// Confirmation outranks the old Legend route, and actual ownership returns to
// the existing upper-build -> reinforcement progression.
const chosenUpper=upper25.actions[0].unit;
const lock=[{stage:'upper',id:chosenUpper.id}];
const lockedState=stateAt(25,upperCounts,upperProgress,{postLegendRoute:'upper'});
const lockedFlow=C.gameFlow(lockedState,lock,settings(25,{postLegendRoute:'upper'}));
assert.deepStrictEqual([lockedFlow.phase,lockedFlow.purpose,lockedFlow.upperDecided,lockedFlow.upperBuilt],['upper-build','spec',true,false]);
const lockedAt30=C.gameFlow(lockedState,lock,settings(30,{postLegendRoute:'legend'}));
assert.deepStrictEqual([lockedAt30.phase,lockedAt30.purpose,lockedAt30.upperDecided],['upper-build','spec',true]);
const lockedPlan30=planAt(30,upperCounts,upperProgress,{postLegendRoute:'legend'},lock);
assert.strictEqual(lockedPlan30.selectionMode,'upper-first');
assert.strictEqual(lockedPlan30.actions.length,1,'30라 전후에는 보조 조합보다 확정 상위를 먼저 제작해야 합니다.');
assert.strictEqual(C.canonicalUpperId(lockedPlan30.actions[0].unit.id),C.canonicalUpperId(chosenUpper.id));
assert.strictEqual(lockedPlan30.upperBuildRow.wispBreakdown.basis,'current','확정 상위 재료를 예약 재고에서 이중 차감했습니다.');

const starvedPlan30=planAt(30,{[C.WISP_ID]:0,V20h:1},upperProgress,{postLegendRoute:'legend'},lock);
assert.strictEqual(starvedPlan30.flow.phase,'upper-build');
assert.strictEqual(starvedPlan30.actions.length,0,'재료가 모자란 상위를 제작 가능으로 표시했습니다.');
assert(starvedPlan30.upperBuildRow&&C.canonicalUpperId(starvedPlan30.upperBuildRow.unit.id)===C.canonicalUpperId(chosenUpper.id));
assert.strictEqual(C.canonicalUpperId(starvedPlan30.watch[0].unit.id),C.canonicalUpperId(chosenUpper.id),'재료 부족 확정 상위가 보조 후보 뒤로 밀렸습니다.');

const ownedCounts=upperHand({[chosenUpper.id]:1});
const reinforce30=planAt(30,ownedCounts,upperProgress,{postLegendRoute:'legend'});
assert.deepStrictEqual([reinforce30.flow.phase,reinforce30.purpose,reinforce30.flow.upperDecided,reinforce30.flow.upperBuilt],['reinforce','spec',true,true]);
assert.strictEqual(reinforce30.flow.milestones.find(item=>item.key==='lineHold').done,true);
assert(reinforce30.actions.length>0,'existing reinforcement flow did not resume');
record(25,'상위 확정',Object.assign({},lockedPlan30,{flow:lockedFlow,purpose:lockedFlow.purpose}),`${C.nameOf(chosenUpper)} 방향 잠금 · 30라 상위 우선`);
record(30,'상위 보유 후 보강',reinforce30,'기존 부족 스펙 보강 흐름 재개');

console.log('\n=== v13.4 첫 전설 이후 분기 시뮬레이션 ===');
for(const row of checkpoints){
  console.log(`${String(row.round).padStart(2,'0')}R | ${row.label.padEnd(14,' ')} | ${row.phase.padEnd(18,' ')} | ${row.recommendation}`);
  console.log(`    ${row.note}`);
}
console.log('\nPASS  첫 희귀 → 첫 전설 → 사용자 분기 → 상위 확정 → 기존 보강 흐름');
console.log('PASS  20/25/30라운드 사용자 선택 유지 및 route="" 재선택 대기');
console.log('PASS  추가 전설·히든 TMO 완성도 순위와 레일리/아이템 선행재료 필터');
console.log(`PASS  총 ${checkpoints.length}개 체크포인트 · 최종 상위 ${C.nameOf(chosenUpper)}`);
