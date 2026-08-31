'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore,units=global.ORD_TMO_UNITS,db=C.buildDb(units);

const tests=[];function test(name,fn){tests.push([name,fn]);}

function handMetrics(wisp,rareScore,lowerScore){
  return{wispSubstitute:wisp,rareSpent:rareScore,specialSpent:0,uncommonSpent:0,commonSpent:0,rareScore,lowerScore,weightedClearedTypes:0,weightedUsedTypes:0,commonSubstituted:wisp,commonPressure:0,weightedSpent:0};
}
function completeUpper(id,wisp,rareUsed,lowerScore){
  return{upperId:id,upperName:id,clearComplete:true,fullyBuildable:true,projectedCount:9,readiness:100,lineagePairs:0,wispCost:wisp,rareUsed,rareClearedTypes:3,rareUsedTypes:3,controlCapOverflow:0,handFitMetrics:handMetrics(wisp,rareUsed,lowerScore),materialOverlapPenalty:0,controlExcessScore:0,excessStun:0,excessSlow:0,rareConflict:0,completion:0};
}
function completeNode(id,wisp,rareUsed,lowerScore){
  return{id,target:9,projectedCount:9,complete:true,requirements:{complete:true,readiness:100},requiredDebt:0,used:{wisp,rare:rareUsed,special:0,uncommon:0,common:0,commonPressure:0},rareClearedTypes:3,rareUsedTypes:3,excessStun:0,excessSlow:0,handFit:{metrics:handMetrics(wisp,rareUsed,lowerScore)},blueprintMatched:0,materialOverlap:{penalty:0},score:0,actions:[{id}]};
}

test('equal-clear plans maximize owned Rare burn before using wisps as an exact-tier tie-break',()=>{
  const cheapUpper=completeUpper('zero-wisp',0,7,10),expensiveUpper=completeUpper('twelve-wisp',12,8,999);
  assert.strictEqual([expensiveUpper,cheapUpper].sort(P._test.upperBlueprintCompare)[0].upperId,'twelve-wisp','upper rank ignored the higher owned-Rare burn');

  const cheapNode=completeNode('zero-wisp',0,7,10),expensiveNode=completeNode('twelve-wisp',12,8,999);
  assert.strictEqual([expensiveNode,cheapNode].sort(P._test.nodeCompare)[0].id,'twelve-wisp','squad search ignored the higher owned-Rare burn');

  const cheapFit=handMetrics(0,7,1),expensiveFit=handMetrics(12,7,999);
  assert(P._test.compareHandFit(cheapFit,expensiveFit,true)<0,'equal four-tier burn did not minimize selection wisps');
});

test('Black Maria is repriced from zero to 12 wisps after Laboon consumes their shared Brook',()=>{
  const blackMariaId='unit_1752903381904_1445',laboonId='Q20h',brookId='N10h';
  const counts={
    [C.WISP_ID]:50,
    X20h:1, // 블랙마리아(전설)
    [brookId]:1, // 브룩 음악가: 라분과 블랙마리아(왜곡)의 공유 희귀
    S00h:1, // 로빈 오하라
    W10h:1,
    '620h':1
  };

  const initialBlackMaria=C.recipeSolve(db,blackMariaId,counts);
  assert.strictEqual(initialBlackMaria.wispCost,0,'fixture must initially show a completed Black Maria recipe');

  const laboon=C.recipeSolve(db,laboonId,counts);
  assert.strictEqual(laboon.wispCost,0);
  assert.strictEqual(laboon.consumed[brookId],1,'Laboon did not consume the shared Brook card');
  const afterLaboon=Object.assign({},laboon.stockAfter,{
    [C.WISP_ID]:counts[C.WISP_ID]-laboon.wispCost,
    [laboonId]:1
  });

  // This second solve must use the current post-Laboon stock. Reusing the
  // initial static candidate row would incorrectly keep Black Maria at 0.
  const repricedBlackMaria=C.recipeSolve(db,blackMariaId,afterLaboon);
  assert.strictEqual(repricedBlackMaria.wispCost,12);
  assert.strictEqual(Object.values(repricedBlackMaria.lowestMissing).reduce((total,value)=>total+C.num(value),0),12);
  assert.deepStrictEqual(repricedBlackMaria.lowestMissing,{
    '200h':3,'800h':3,'400h':2,'600h':2,'100h':1,'300h':1
  });
});

test('deferred swaps replay shared stock and prefer feasible low-wisp replacements before control',()=>{
  const hard={id:'test-hard',name:'공유 특수재료',groupName:'특수재료',abilities:{},stuffs:[]},consumer={id:'test-consumer',name:'선행 소비',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:hard.id,count:1}]},reuser={id:'test-reuser',name:'낮은 제어·재료 중복',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:hard.id,count:1}]},cheap={id:'test-cheap',name:'실현 가능 저선위',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:C.WISP_ID,count:2}]},expensive={id:'test-expensive',name:'고선위',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:C.WISP_ID,count:6}]},testDb=C.buildDb([hard,consumer,reuser,cheap,expensive]),counts={[hard.id]:1,[C.WISP_ID]:5},state={db:testDb,counts},best={counts,wisp:5,used:{wisp:3}},future=unit=>({id:unit.id,name:unit.name,unit,status:'future'});
  const blocked=P._test.deferredFutureFeasibility(state,best,[future(consumer),future(reuser)]),low=P._test.deferredFutureFeasibility(state,best,[future(consumer),future(cheap)]),high=P._test.deferredFutureFeasibility(state,best,[future(consumer),future(expensive)]);
  assert.strictEqual(blocked.hardFeasible,false,'second future slot reused a hard material consumed by the first');
  assert.deepStrictEqual([low.hardFeasible,low.wispFeasible,low.futureWispCost,low.totalWispCost],[true,true,2,5]);
  assert.deepStrictEqual([high.hardFeasible,high.wispFeasible,high.futureWispCost],[true,false,6]);
  const option=(row,feasibility,overflow,overlap)=>Object.assign({row:{unit:row},overflow,overlap:{penalty:overlap}},feasibility),ranked=[option(reuser,blocked,0,0),option(expensive,high,0,0),option(cheap,low,999,999)].sort(P._test.compareDeferredSwaps);
  assert.strictEqual(ranked[0].row.unit.id,cheap.id,'control/overlap displaced the only hard- and wisp-feasible low-wisp swap');
});

function deferredFixture(units,counts,target){
  const testDb=C.buildDb(units),state={db:testDb,counts:Object.assign({},counts),percent:{},currentAbilities:{}},settings={mode:'physical',magicRoute:'physical',currentRound:25,targetSquadCount:target,gorosei:'none',recommendWarped:true,superKumaOwned:true,changedUsed:0,seraphUsed:0,transcendUsed:0},policy=P._test.normalizeCommonPolicy({},state),spec=P._test.finalOnlySpec(state,state.counts,'physical'),requirements=P._test.requirementRows(spec,[],'physical','physical',settings,null),used=P._test.consumptionTotals([],state),best={actions:[],lineup:[],counts:Object.assign({},state.counts),wisp:C.num(state.counts[C.WISP_ID]),spec,mainUpper:null,requirements,used,handFit:P._test.handFitMetrics(state,state.counts,state.counts,used)},rows=units.filter(C.isLegendish).map(unit=>({unit,vector:{},mandatory:0,blueprintBonus:0})),lineup=P._test.buildDeferred(state,best,rows,'physical','physical',settings,[],target,policy),allocation=P._test.fullHandAllocation(state,state.counts,best,lineup,policy),budget=P._test.wispBudgetSummary(allocation,lineup.length,target);return{state,best,lineup,allocation,budget,settings,policy};
}

test('all nine-slot wisps share one finite budget instead of nine independent allowances',()=>{
  const units=['a','b','c'].map(id=>({id,name:id,groupName:'전설 [물딜]',abilities:{},stuffs:[{id:C.WISP_ID,count:4}]})),result=deferredFixture(units,{[C.WISP_ID]:5},2);
  assert.strictEqual(result.lineup.length,1,'two individually affordable 4-wisp cards exceeded the shared 5-wisp pool');
  assert(result.allocation.wisp.required<=5);assert.strictEqual(result.allocation.wisp.conflict,0);assert.strictEqual(result.budget.withinBudget,true);assert.strictEqual(result.budget.fullPartyFeasible,false);
});

test('equal-clear equal-total-wisp future parties maximize actual owned Rare consumption',()=>{
  const rares=[{id:'rare-a',name:'희귀 A',groupName:'희귀함',abilities:{},stuffs:[]},{id:'rare-b',name:'희귀 B',groupName:'희귀함',abilities:{},stuffs:[]}],finals=[
    {id:'rare-user-a',name:'희귀소모 A',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:'rare-a',count:1},{id:C.WISP_ID,count:1}]},
    {id:'rare-user-b',name:'희귀소모 B',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:'rare-b',count:1},{id:C.WISP_ID,count:1}]},
    {id:'no-rare-a',name:'비소모 A',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:C.WISP_ID,count:1}]},
    {id:'no-rare-b',name:'비소모 B',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:C.WISP_ID,count:1}]}
  ],result=deferredFixture(rares.concat(finals),{[C.WISP_ID]:2,'rare-a':1,'rare-b':1},2),ids=result.lineup.map(row=>row.id).sort();
  assert.deepStrictEqual(ids,['rare-user-a','rare-user-b']);assert.strictEqual(result.allocation.tiers.rare.summary.reserved,2);assert.strictEqual(result.allocation.wisp.required,2);assert.strictEqual(result.budget.fullPartyFeasible,true);
});

test('missing ordinary Rare and Special cards keep the explicit future-drop reason and never become an immediate action',()=>{
  const rare={id:'missing-rare',name:'없는 희귀',groupName:'희귀함',abilities:{},stuffs:[]},special={id:'missing-special',name:'없는 특별',groupName:'특별함',abilities:{},stuffs:[]},blocked={id:'fake-zero',name:'재료부족 0선위',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:rare.id,count:1},{id:special.id,count:1}]},real={id:'real-one',name:'실현가능 1선위',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:C.WISP_ID,count:1}]},result=deferredFixture([rare,special,blocked,real],{[C.WISP_ID]:1},1);
  assert.deepStrictEqual(result.lineup.map(row=>row.id),[blocked.id]);
  assert.strictEqual(result.lineup[0].status,'future');
  assert.strictEqual(result.lineup[0].futureDropPending,true);
  assert.strictEqual(result.lineup[0].reason,'후속 보상·재료가 잡히면 제작');
  assert.strictEqual(result.allocation.wisp.required,0);
  assert.strictEqual(result.allocation.feasible,true);
  assert.strictEqual(result.budget.fullPartyFeasible,true);
  assert(result.allocation.futurePending.some(row=>row.id===rare.id&&row.tier==='rare'));
  assert(result.allocation.futurePending.some(row=>row.id===special.id&&row.tier==='special'));

  const pending=C.recipeSolve(result.state.db,blocked.id,result.state.counts);
  assert.deepStrictEqual(pending.hardMissing,[],'ordinary Rare/Special waits must not be mislabeled as a hard prerequisite');

  const staticData=P._test.makeLightStaticData(result.state,'physical','physical',result.settings,result.policy);
  const immediate=P._test.searchRouteLight(result.state,'physical','physical',result.settings,result.policy,[blocked.id],staticData);
  assert(
    !immediate.best.actions.some(action=>action.id===blocked.id),
    'the current build queue fabricated a unit whose ordinary Rare material is still missing'
  );
});

let passed=0;for(const [name,fn] of tests){try{fn();passed++;console.log('PASS',name);}catch(error){console.error('FAIL',name);throw error;}}
console.log(`Selection-wisp priority v14.0.0 tests: ${passed}/${tests.length} passed`);
