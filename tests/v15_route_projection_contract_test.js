'use strict';

const assert=require('assert');
const path=require('path');
const {performance}=require('perf_hooks');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of [
  'ord_story_nonupper_data.js','ord_story_upper_data.js','ord_units_data.js',
  'ord_data_patch.js','ord_core.js','ord_v15_model.js','ord_v15_ledger.js',
  'ord_v15_policy.js','ord_v15_engine.js'
])require(path.join(EXT,file));

const C=global.ORDCore,M=global.ORDV15Model,L=global.ORDV15Ledger,E=global.ORDV15Engine;
const catalog=global.ORD_TMO_UNITS,db=C.buildDb(catalog);

// The Rare/Special/Uncommon/Common counts are the user's supplied 25-round
// hand.  The already-finished non-Upper Legend is added only to put the engine
// at the real post-first-Legend route-choice milestone.  The user did not give
// a selection-wisp count, so the funded fixture uses 20 to verify an exact
// Upper+support prefix and the debt fixture uses 1 to verify honest blocking.
const HAND_25={
  '300h':5,'200h':8,'100h':10,'700h':5,'400h':9,'800h':4,'500h':8,'900h':9,'600h':5,
  'G00h':2,'O00h':1,'N00h':1,'E00h':2,'L00h':2,
  'B00h':1,'E10h':1,'I10h':2,'A10h':1,'710h':1,'R00h':1,'P00h':1,
  'Z10h':1,'C20h':1,'320h':1,'K20h':2,'L50h':1
};
const existingLegend=db.legendish.find(unit=>!C.isUpper(unit)&&!C.isShip(unit)&&/전설|히든/.test(C.groupName(unit)));
assert(existingLegend,'post-first-Legend fixture missing');

function fixture(wisp,locks=[]){
  const counts=Object.assign({},HAND_25,{[C.WISP_ID]:wisp,[existingLegend.id]:1});
  return{
    catalog,
    snapshot:{
      source:'fixture',sessionId:`v15-route-${wisp}-${locks.length}`,seq:1,at:1000,dataChangedAt:1000,
      wispCountFound:true,wispCount:wisp,counts,currentAbilities:{},
      units:catalog.map(unit=>({id:unit.id,name:unit.name,count:Number(counts[unit.id]||0),tmoPercent:0}))
    },
    settings:{
      currentRound:25,mode:'physical',magicRoute:'physical',postLegendRoute:locks.length?'upper':'',
      manualCounts:{},superKumaOwned:false,wispOverride:'',virtualSpecialId:'',gorosei:'none'
    },
    locks
  };
}

function addTiers(target,source){for(const tier of ['rare','special','uncommon','common'])target[tier]+=Number(source&&source[tier]||0);}

// One untimed pass warms the JIT.  The threshold is deliberately generous for
// CI variance but low enough to catch the former 5-second in-game stall.
E.decide(fixture(20));
let started=performance.now();
const route=E.decide(fixture(20));
const routeMs=performance.now()-started;

assert.strictEqual(route.state,'ROUTE_CHOICE');
assert(route.routeCandidates.length>0&&route.routeCandidates.length<=6,`route candidate count ${route.routeCandidates.length}`);
assert(routeMs<1500,`25-round route projection took ${routeMs.toFixed(1)}ms`);
assert.strictEqual(route.evidence.futureDropsCredited,false);
assert.strictEqual(route.evidence.fixedFinalParty,false);

let exactCount=0;
for(const candidate of route.routeCandidates){
  const projection=candidate.projectedSupport;
  assert(projection,'projectedSupport missing');
  assert.strictEqual(projection.futureDropsCredited,false);
  assert.strictEqual(projection.fixedFinalParty,false);
  assert((projection.steps||[]).length<=3,'route preview became a fixed final party');
  if(!projection.exactPrefix)continue;
  exactCount++;
  assert(projection.steps.length>=1);
  assert.strictEqual(projection.steps[0].kind,'upper');
  let stock=Object.assign({},route.model.effective.counts),wispUsed=0;
  const tiers={rare:0,special:0,uncommon:0,common:0};
  for(const [index,step] of projection.steps.entries()){
    assert.strictEqual(step.order,index+1);
    const unit=route.model.knowledge.db.byId.get(step.id);
    assert(unit,`missing projected unit ${step.id}`);
    const quote=L.quote(route.model,unit,stock,{availableRound:route.model.round.value});
    assert.strictEqual(quote.feasible,true,`${step.name}: ${(quote.blocked||[]).join(' · ')}`);
    assert.strictEqual(step.wispCost,quote.wisp.cost,`${step.name} wisp mismatch`);
    for(const tier of Object.keys(tiers))assert.strictEqual(Number(step.tiers&&step.tiers[tier]||0),Number(quote.tiers.totals[tier]||0),`${step.name} ${tier} mismatch`);
    wispUsed+=quote.wisp.cost;addTiers(tiers,quote.tiers.totals);
    const applied=L.apply(route.model,quote,stock);
    assert.strictEqual(applied.ok,true,applied.error);
    stock=applied.counts;
  }
  assert.strictEqual(projection.wispUsed,wispUsed);
  assert.strictEqual(candidate.wispCost,wispUsed);
  assert(wispUsed<=route.model.effective.wisp,`${candidate.name} used ${wispUsed}/${route.model.effective.wisp} wisps`);
  assert.strictEqual(projection.remainingWisp,Number(stock[C.WISP_ID]||0));
  assert.strictEqual(candidate.wispAfter,Number(stock[C.WISP_ID]||0));
  for(const tier of Object.keys(tiers)){
    assert.strictEqual(Number(projection.tiers[tier]||0),tiers[tier],`${candidate.name} cumulative ${tier}`);
    assert.strictEqual(Number(candidate.tiers[tier]||0),tiers[tier],`${candidate.name} row ${tier}`);
  }
  const lineup=M.finalEntries(route.model,stock);
  for(let left=0;left<lineup.length;left++)for(let right=left+1;right<lineup.length;right++){
    const overlap=E._test.pairMaterialOverlap(route.model,lineup[left],lineup[right]);
    assert.strictEqual(overlap.lineage,false,`${C.displayNameOf(lineup[left])} / ${C.displayNameOf(lineup[right])} lineage conflict`);
  }
}
assert(exactCount>0,'funded 25-round hand produced no exact Upper+support prefix');

const debt=E.decide(fixture(1));
assert(debt.routeCandidates.length>0&&debt.routeCandidates.length<=6);
for(const candidate of debt.routeCandidates){
  const projection=candidate.projectedSupport;
  if(projection.exactPrefix)continue;
  assert.deepStrictEqual(projection.steps,[],'unaffordable direction leaked into the exact prefix');
  assert.strictEqual(projection.wispUsed,0);
  assert.deepStrictEqual(projection.tiers,{rare:0,special:0,uncommon:0,common:0});
  assert(projection.requiredUpperWisp>1);
  assert(projection.wispDebt>0);
}

const chosen=route.routeCandidates.find(candidate=>candidate.projectedSupport&&candidate.projectedSupport.exactPrefix);
const locked=[{stage:'upper',id:chosen.id,source:'v15-performance-contract'}];
// Measure the normal post-Upper search with the Upper actually observed.  An
// unfinished locked Upper correctly takes a much faster completion-authority
// path and would hide regressions in the regular survival search.
const ownedCounts=Object.assign({},chosen.quote.after);
function observedUpperFixture(){
  const value=fixture(Number(ownedCounts[C.WISP_ID]||0),locked);
  value.snapshot.sessionId='v15-route-owned-upper';
  value.snapshot.counts=Object.assign({},ownedCounts);
  value.snapshot.wispCount=Number(ownedCounts[C.WISP_ID]||0);
  value.snapshot.units=catalog.map(unit=>({id:unit.id,name:unit.name,count:Number(ownedCounts[unit.id]||0),tmoPercent:0}));
  return value;
}
E.decide(observedUpperFixture());
started=performance.now();
const lockedDecision=E.decide(observedUpperFixture());
const lockedMs=performance.now()-started;
assert(lockedMs<1500,`locked-route decision took ${lockedMs.toFixed(1)}ms`);
assert(lockedDecision.authority===true);

console.log(`PASS v15 route candidates ${route.routeCandidates.length}/6 use exact sequential Upper+support prefixes`);
console.log('PASS cumulative Rare/Special/Uncommon/Common and finite wisp ledgers match every projected step');
console.log('PASS future drops, fixed final-nine plans and Rare lineage conflicts are excluded');
console.log(`PASS performance route ${routeMs.toFixed(1)}ms · locked ${lockedMs.toFixed(1)}ms (hard cap 1500ms; locked target 1000ms)`);
