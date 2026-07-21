'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore;

const common=(id,name)=>({id,name,groupName:'흔함',abilities:{},stuffs:[{id:C.WISP_ID,count:1}]});
const rare=(id,name,commonId,count)=>({id,name,groupName:'희귀함',abilities:{},stuffs:[{id:commonId,count}]});
const final=(id,name,stuffs=[])=>({id,name,groupName:'전설 [물딜]',abilities:{},stuffs});

const catalog=[
  common('test-common-a','테스트 흔함 A'),
  common('test-common-b','테스트 흔함 B'),
  rare('test-rare-shared','테스트 공유 희귀','test-common-a',4),
  rare('test-rare-other','테스트 다른 희귀','test-common-b',4),
  final('test-direct-13','개별 13선위',[{id:C.WISP_ID,count:13}]),
  final('test-direct-4','개별 4선위',[{id:C.WISP_ID,count:4}]),
  final('test-shared-a','공유 희귀 사용 A',[{id:'test-rare-shared',count:1}]),
  final('test-shared-b','공유 희귀 사용 B',[{id:'test-rare-shared',count:1}]),
  final('test-diverse','다른 희귀 사용',[{id:'test-rare-other',count:1}]),
  ...Array.from({length:7},(_,index)=>final(`test-free-${index+1}`,`빈칸 ${index+1}`))
];

function stateFromCounts(counts){
  return C.normalizeState(catalog,{source:'cumulative-wisp-budget-test',counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});
}
function future(state,id){
  const unit=state.db.byId.get(id);
  return{id,name:C.displayNameOf(unit),unit,status:'future'};
}
function emptyBest(state){
  return{
    counts:Object.assign({},state.counts),
    wisp:C.num(state.counts[C.WISP_ID]),
    used:P._test.consumptionTotals([],state),
    actions:[]
  };
}
function allocation(state,ids){
  return P._test.fullHandAllocation(
    state,
    state.counts,
    emptyBest(state),
    ids.map(id=>future(state,id)),
    P._test.normalizeCommonPolicy({},state)
  );
}

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('nine-unit feasibility uses the cumulative wisp total, not nine independent affordability checks',()=>{
  const state=stateFromCounts({[C.WISP_ID]:15});
  const ids=[...Array.from({length:7},(_,index)=>`test-free-${index+1}`),'test-direct-13','test-direct-4'];

  // Both candidates look affordable if each one is solved against the original
  // 15-wisp hand. That must never be used as proof that the whole squad is
  // buildable.
  assert.strictEqual(C.recipeSolve(state.db,'test-direct-13',state.counts).wispCost,13);
  assert.strictEqual(C.recipeSolve(state.db,'test-direct-4',state.counts).wispCost,4);
  assert(C.recipeSolve(state.db,'test-direct-13',state.counts).wispCost<=15);
  assert(C.recipeSolve(state.db,'test-direct-4',state.counts).wispCost<=15);

  const lineup=ids.map(id=>future(state,id));
  const feasibility=P._test.deferredFutureFeasibility(state,emptyBest(state),lineup);
  const hand=allocation(state,ids);
  assert.strictEqual(feasibility.futureWispCost,17);
  assert.strictEqual(feasibility.wispFeasible,false);
  assert.strictEqual(hand.wisp.initial,15);
  assert.strictEqual(hand.wisp.required,17);
  assert.strictEqual(hand.wisp.reserved,15);
  assert.strictEqual(hand.wisp.conflict,2);
  assert.strictEqual(hand.feasible,false);
});

test('an unfunded future Rare recipe pays its full common debt, while distinct owned Rares avoid that debt',()=>{
  const state=stateFromCounts({
    [C.WISP_ID]:3,
    'test-rare-shared':1,
    'test-rare-other':1
  });
  const free=Array.from({length:7},(_,index)=>`test-free-${index+1}`);
  const repeatedIds=[...free,'test-shared-a','test-shared-b'];
  const diverseIds=[...free,'test-diverse','test-shared-b'];

  // Static per-card costs hide the conflict: both shared-Rare candidates show
  // zero wisps before either one consumes the only owned Rare.
  assert.strictEqual(C.recipeSolve(state.db,'test-shared-a',state.counts).wispCost,0);
  assert.strictEqual(C.recipeSolve(state.db,'test-shared-b',state.counts).wispCost,0);

  const repeated=P._test.deferredFutureFeasibility(state,emptyBest(state),repeatedIds.map(id=>future(state,id)));
  const diverse=P._test.deferredFutureFeasibility(state,emptyBest(state),diverseIds.map(id=>future(state,id)));
  assert.deepStrictEqual(
    [repeated.futureWispCost,repeated.wispFeasible],
    [4,false],
    'a future Rare drop must not erase the four missing Commons from the guaranteed budget'
  );
  assert.deepStrictEqual([diverse.futureWispCost,diverse.wispFeasible],[0,true]);

  const repeatedHand=allocation(state,repeatedIds),diverseHand=allocation(state,diverseIds);
  assert.strictEqual(repeatedHand.wisp.required,4);
  assert.strictEqual(repeatedHand.wisp.conflict,1);
  assert.strictEqual(repeatedHand.feasible,false);
  assert.strictEqual(repeatedHand.tiers.rare.summary.assigned,1);
  assert.strictEqual(repeatedHand.tiers.rare.summary.conflict,0,'the same owned Rare was reserved twice');
  assert(
    repeatedHand.futurePending.some(row=>row.tier==='common'&&row.count===4),
    'the second shared-Rare recipe did not record its later ordinary-drop wait'
  );
  assert.strictEqual(diverseHand.wisp.required,0);
  assert.strictEqual(diverseHand.wisp.conflict,0);
  assert.strictEqual(diverseHand.feasible,true);
  assert.strictEqual(diverseHand.tiers.rare.summary.assigned,2);
  assert.strictEqual(diverseHand.futurePending.length,0);
  assert(
    diverseHand.metrics.rareScore>repeatedHand.metrics.rareScore,
    'the route consuming both distinct owned Rare cards must have the better Rare-hand fit'
  );
  assert(
    P._test.compareHandFit(diverseHand.metrics,repeatedHand.metrics,false)<0,
    'equal-current-wisp routes did not prefer the party that consumes distinct owned Rare cards'
  );
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();passed++;console.log('PASS',name);}
  catch(error){console.error('FAIL',name);throw error;}
}
console.log(`Cumulative selection-wisp budget tests: ${passed}/${tests.length} passed`);
