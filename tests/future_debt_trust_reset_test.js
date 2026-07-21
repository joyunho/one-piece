'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
for(const file of [
  'ord_units_data.js',
  'ord_data_patch.js',
  'ord_story_nonupper_data.js',
  'ord_story_upper_data.js',
  'ord_core.js'
])require(path.join(EXT,file));

const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore;
const units=global.ORD_TMO_UNITS;

function sum(map){return Object.values(map||{}).reduce((total,value)=>total+C.num(value),0);}
function stateFrom(catalog,counts,source){
  return C.normalizeState(
    catalog,
    {source,counts,currentAbilities:{}},
    {manualCounts:{},superKumaOwned:true}
  );
}

const tests=[];
function test(name,fn){tests.push([name,fn]);}

// The exact round-25 hand reported by the user after the failed run.
function userRound25State(){
  const counts={
    // Common: 63
    '300h':5,'200h':8,'100h':10,'700h':5,'400h':9,
    '800h':4,'500h':8,'900h':9,'600h':5,
    // Uncommon: 8
    'G00h':2,'O00h':1,'N00h':1,'E00h':2,'L00h':2,
    // Special: 8
    'B00h':1,'E10h':1,'I10h':2,'A10h':1,
    '710h':1,'R00h':1,'P00h':1,
    // Rare: 6
    'Z10h':1,'C20h':1,'320h':1,'K20h':2,'L50h':1,
    [C.WISP_ID]:1
  };
  return stateFrom(units,counts,'future-debt-user-round-25');
}

function userRound25Plan(){
  const state=userRound25State();
  const result=P.planFinalSquad({
    state,
    settings:{
      mode:'physical',
      currentRound:25,
      targetSquadCount:9,
      targetLegendEquivalent:9,
      upperPreviewId:'190H',
      superKumaOwned:true,
      recommendWarped:true
    }
  });
  return{state,result};
}

test('user round-25 blueprint exposes the complete future wisp debt',()=>{
  const {result}=userRound25Plan(),budget=result.wispBudget;

  assert(
    budget.futureWorstCase>1,
    `future material debt was collapsed back to ${budget.futureWorstCase}`
  );
  assert(
    budget.required>1,
    `the whole blueprint was incorrectly priced at ${budget.required} selection wisp(s)`
  );
  assert.strictEqual(
    budget.worstCaseRequired,
    budget.used+budget.futureWorstCase,
    'the displayed worst-case total does not include every future slot'
  );
  assert.strictEqual(budget.withinBudget,false);
  assert.strictEqual(budget.fullPartyFeasible,false);
  assert(budget.shortage>0,'an unfunded future blueprint must expose a shortage');
  assert.strictEqual(budget.evidence,'future-random-drops-not-funded');
});

test('safePrefix replays against the current TMO stock without a negative card count',()=>{
  const {state,result}=userRound25Plan(),prefix=result.safePrefix;

  assert.strictEqual(prefix.basis,'current-tmo-stock-only');
  assert(prefix.actions.length>0,'the fixture should have at least one exact next craft');

  let stock=Object.assign({},state.counts);
  let availableWisp=C.num(stock[C.WISP_ID]);
  for(const action of prefix.actions){
    const solve=C.recipeSolve(state.db,action.id,stock);
    const nonWispMissing=['uncommon','special','rare','hard','other']
      .reduce((total,tier)=>total+sum(solve.missingByTier&&solve.missingByTier[tier]),0);

    assert.strictEqual(
      nonWispMissing,
      0,
      `${action.name} depends on a non-wisp material not present in the current hand`
    );
    assert(
      solve.wispCost<=availableWisp,
      `${action.name} needs ${solve.wispCost} wisps but only ${availableWisp} remain`
    );
    assert.strictEqual(action.wispCost,solve.wispCost);
    assert.deepStrictEqual(action.spend,solve.consumed);

    stock=Object.assign({},solve.stockAfter);
    availableWisp-=solve.wispCost;
    stock[C.WISP_ID]=availableWisp;
    stock[action.id]=C.num(stock[action.id])+1;

    for(const [id,count] of Object.entries(stock)){
      assert(C.num(count)>=0,`${id} became negative after crafting ${action.name}: ${count}`);
    }
  }

  for(const [id,count] of Object.entries(prefix.afterStock||{})){
    assert.strictEqual(C.num(stock[id]),C.num(count),`safePrefix afterStock drifted for ${id}`);
  }
  assert.strictEqual(availableWisp,C.num(prefix.actions.at(-1).remainingWisp));
});

test('an unowned future Rare recipe is charged at full common-substitution cost',()=>{
  const common={
    id:'trust-common',name:'검증용 흔함',groupName:'흔함',abilities:{},
    stuffs:[{id:C.WISP_ID,count:1}]
  };
  const rare={
    id:'trust-rare',name:'검증용 희귀',groupName:'희귀함',abilities:{},
    stuffs:[{id:common.id,count:4}]
  };
  const final={
    id:'trust-final',name:'검증용 전설',groupName:'전설 [물딜]',abilities:{},
    stuffs:[{id:rare.id,count:1}]
  };
  const state=stateFrom([common,rare,final],{[C.WISP_ID]:1},'future-debt-unit-fixture');
  const solve=C.recipeSolve(state.db,final.id,state.counts);
  const prerequisite=P._test.prerequisiteStatus(state,final,state.counts);
  const charge=P._test.futureWispCharge(state,solve,prerequisite);

  assert.strictEqual(charge.dropPending,true);
  assert.strictEqual(charge.optimisticRequired,0,'fixture drift: this is the old free-future-drop case');
  assert.strictEqual(charge.worstCase,4);
  assert.strictEqual(charge.required,4,'future drops must not erase four missing Commons');
  assert.strictEqual(charge.guaranteedRequired,charge.worstCase);

  const used=P._test.consumptionTotals([],state);
  const best={
    counts:Object.assign({},state.counts),
    wisp:C.num(state.counts[C.WISP_ID]),
    used,
    actions:[],
    handFit:P._test.handFitMetrics(state,state.counts,state.counts,used)
  };
  const hand=P._test.fullHandAllocation(
    state,
    state.counts,
    best,
    [{id:final.id,name:C.displayNameOf(final),unit:final,status:'future'}],
    P._test.normalizeCommonPolicy({},state)
  );
  const budget=P._test.wispBudgetSummary(hand,1,1);

  assert.strictEqual(hand.wisp.futureWorstCase,4);
  assert.strictEqual(hand.wisp.required,4);
  assert.strictEqual(hand.wisp.conflict,3);
  assert.strictEqual(hand.feasible,false);
  assert.strictEqual(budget.fullPartyFeasible,false);
  assert.strictEqual(budget.shortage,3);
});

test('role-sheet completion is never presented as verified boss damage',()=>{
  const requirements={
    rows:[
      {key:'main',label:'상위 딜러',required:true,gap:0},
      {key:'armor',label:'상시 풀방깎',required:true,gap:0},
      {key:'stunBase',label:'최소 0.5 스턴',required:true,gap:0},
      {key:'slow',label:'이감 102%',required:true,gap:0},
      {key:'bossFrenzy',label:'광보잡',required:true,gap:0}
    ]
  };
  const evaluation=P._test.routeEvaluationFor([],requirements,'physical','physical');

  assert.strictEqual(evaluation.staticComplete,true);
  assert.strictEqual(evaluation.roleOnly,true);
  assert.strictEqual(evaluation.status,'role-only');
  assert.strictEqual(evaluation.combatVerified,false);
  assert.match(evaluation.label,/화력 미검증/);

  const {result}=userRound25Plan();
  assert.strictEqual(result.timelineReadiness.boss50.verified,false);
  assert.match(result.timelineReadiness.boss50.evidence,/DPS 실측표 없음/);
});

let passed=0;
for(const [name,fn] of tests){
  try{
    fn();
    passed++;
    console.log('PASS',name);
  }catch(error){
    console.error('FAIL',name);
    throw error;
  }
}
console.log(`Future-debt trust-reset tests: ${passed}/${tests.length} passed`);
