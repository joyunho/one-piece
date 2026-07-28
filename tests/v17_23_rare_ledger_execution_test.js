'use strict';

// v17.23: the card shown as "use", "hold", or "reroll" must come from one
// shared current-hand ledger.  This prevents the live action engine from
// consuming one future while the squad planner protects a different future,
// which left several owned Rares unused until death.

const assert=require('assert');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of [
  'ord_units_data.js','ord_data_patch.js','ord_core.js','ord_squad_planner.js',
  'ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js',
  'ord_v15_engine.js','ord_app.js'
])require(path.join(EXT,file));

const C=global.ORDCore;
const M=global.ORDV15Model;
const P=global.ORDV15Policy;
const E=global.ORDV15Engine;
const App=global.ORDApp.App;
const appTest=global.ORDApp._test;

function rare(id,name){
  return{id,name,groupName:'희귀함',abilities:{},stuffs:[]};
}

const useRare=rare('ledger-rare-use','즉시 사용 희귀');
const allocationRare=rare('ledger-rare-allocation','파티 예약 희귀');
const deadlineRare=rare('ledger-rare-deadline','마감 예약 희귀');
const unusedRare=rare('ledger-rare-unused','미사용 희귀');
const plannedLegend={
  id:'ledger-planned-legend',name:'파티 첫 전설',groupName:'전설 [물딜]',
  abilities:{'방어력 감소':20},stuffs:[{id:useRare.id,count:1}]
};
const rawLegend={
  id:'ledger-raw-legend',name:'구 판단 전설',groupName:'전설 [물딜]',
  abilities:{'이동속도 감소':10},stuffs:[{id:unusedRare.id,count:1}]
};
const catalog=[useRare,allocationRare,deadlineRare,unusedRare,plannedLegend,rawLegend];

function modelFor(counts){
  const units=catalog.map(unit=>Object.assign({},unit,{
    count:Number(counts[unit.id]||0),tmoPercent:0
  }));
  return M.build({
    catalog,
    snapshot:{
      source:'rare-ledger-fixture',sessionId:'v17-23-rare-ledger',seq:1,
      at:1,dataChangedAt:1,wispCountFound:true,wispCount:0,
      counts:Object.assign({},counts),currentAbilities:{},units
    },
    settings:{
      currentRound:31,mode:'physical',magicRoute:'physical',
      postLegendRoute:'upper',manualCounts:{},superKumaOwned:false,
      wispOverride:'',virtualSpecialId:'',gorosei:'none',rerollsUsed:0
    }
  });
}

function makeApp(state,rerollsUsed){
  const app=Object.create(App.prototype);
  app.state={
    currentRound:31,roundStartedAt:0,rerollsUsed,
    locks:[],snapshot:{counts:Object.assign({},state.counts)}
  };
  return app;
}

function assertExclusiveActualLedger(rareLedger,state,remainingBudget){
  const expected=new Map(state.db.rares
    .filter(unit=>C.num(state.counts[unit.id])>0)
    .map(unit=>[String(unit.id),C.num(state.counts[unit.id])]));
  assert.strictEqual(rareLedger.rows.length,expected.size,'an owned Rare disappeared from the ledger');
  let rerolls=0;
  for(const row of rareLedger.rows){
    assert(expected.has(String(row.id)),`${row.id}: non-owned Rare appeared`);
    assert.strictEqual(row.initial,expected.get(String(row.id)),`${row.id}: initial count is not the actual hand`);
    assert.strictEqual(row.use+row.hold+row.reroll,row.initial,`${row.id}: use + hold + reroll is not exclusive`);
    assert.strictEqual(row.proof.exclusive,true,`${row.id}: exclusive proof was not set`);
    assert(row.use>=0&&row.hold>=0&&row.reroll>=0,`${row.id}: negative disposition`);
    rerolls+=row.reroll;
  }
  assert(rerolls<=remainingBudget,`ledger allocated ${rerolls} rerolls with only ${remainingBudget} remaining`);
  assert.strictEqual(rareLedger.conflict,false,'valid actual-hand ledger reported a conflict');
  return rerolls;
}

const currentCounts={
  [useRare.id]:2,
  [allocationRare.id]:2,
  [deadlineRare.id]:1,
  [unusedRare.id]:3
};
const currentModel=modelFor(currentCounts);
const state=currentModel.effective;
const squad={
  targetCount:9,
  finalLineup:[{id:plannedLegend.id}],
  safePrefix:{
    actions:[{id:plannedLegend.id,name:plannedLegend.name,wispCost:0,reason:'현재 패 첫 제작'}],
    audit:{level:'pass'}
  },
  rareAllocation:[
    {id:useRare.id,spent:1,reserved:0,usedBy:[{name:plannedLegend.name,status:'spent'}]},
    {id:allocationRare.id,spent:0,reserved:1,usedBy:[{name:'후속 보조 전설',status:'reserved'}]}
  ],
  timelineReadiness:{
    rare:{rows:[
      {id:deadlineRare.id,spent:0,hold:1,destinations:[{name:'필수 마감 보강',disposition:'hold'}]}
    ]}
  }
};

// The squad prefix replaces the old raw action and is re-quoted against the
// exact V15 hand.  Consequently only the Rare truly consumed by that quote is
// marked "use".
const rawDecision={
  state:'ACT_NOW',model:currentModel,
  action:{id:rawLegend.id,name:rawLegend.name},
  assessment:{route:P.ROUTES.physical},
  evidence:{}
};
const reconciled=E.reconcileSquadExecution(rawDecision,squad,[]);
assert.strictEqual(reconciled.state,'ACT_NOW');
assert.strictEqual(reconciled.action.id,plannedLegend.id,'raw V15 action overrode the squad prefix');
assert.strictEqual(reconciled.action.quote.rareUse[useRare.id],1,'prefix action was not re-quoted with actual Rare use');
assert.strictEqual(C.num(reconciled.action.quote.rareUse[unusedRare.id]),0,'old raw action Rare leaked into the reconciled quote');
assert.strictEqual(reconciled.evidence.executionAuthority,'squad-prefix-requoted-v15');

const guarded=makeApp(state,0).v151ProtectRareDecision(reconciled,squad,state);
assert.strictEqual(guarded.state,'ACT_NOW','Rare reroll planning replaced an immediate verified craft');
assert.strictEqual(guarded.rare.rows.find(row=>row.id===useRare.id).use,1);
assert(guarded.rare.rows.find(row=>row.id===allocationRare.id).hold>=1,'squad allocation reservation was not protected');
assert.strictEqual(guarded.rare.rows.find(row=>row.id===deadlineRare.id).hold,1,'deadline reservation was not protected');
assert.strictEqual(assertExclusiveActualLedger(guarded.rare,state,2),2,'the two available rerolls were not assigned to truly disposable cards');
assert.strictEqual(guarded.rare.safeReroll,null,'ACT_NOW must not expose a competing reroll action');

// Reroll capacity is a game-wide card count, not a per-Rare-type allowance.
// One prior reroll permits at most one additional card.
const holdDecision={state:'HOLD',label:'재계산',reason:'현재 제작 없음',action:null,evidence:{}};
const oneLeft=makeApp(state,1).v151ProtectRareDecision(holdDecision,squad,state);
assert.strictEqual(oneLeft.state,'REROLL_ONE');
assert.strictEqual(assertExclusiveActualLedger(oneLeft.rare,state,1),1);
assert(oneLeft.rare.safeReroll&&oneLeft.rare.safeReroll.reroll>0,'remaining safe reroll was not exposed');

// After both rerolls are consumed, no owned Rare may remain labelled reroll
// and an incoming stale REROLL_ONE recommendation must be cancelled.
const exhaustedInput={state:'REROLL_ONE',label:'stale reroll',reason:'old result',action:null,evidence:{}};
const exhausted=makeApp(state,2).v151ProtectRareDecision(exhaustedInput,squad,state);
assert.strictEqual(exhausted.state,'HOLD');
assert.strictEqual(assertExclusiveActualLedger(exhausted.rare,state,0),0);
assert.strictEqual(exhausted.rare.safeReroll,null);
assert(exhausted.rare.rows.every(row=>row.reroll===0),'reroll survived after the two-use cap');

// A stale squad prefix must fail closed; it may not fall back to the old raw
// action that consumes a different Rare.
const staleModel=modelFor(Object.assign({},currentCounts,{[useRare.id]:0}));
const stale=E.reconcileSquadExecution(Object.assign({},rawDecision,{model:staleModel}),squad,[]);
assert.strictEqual(stale.state,'SYNC_BLOCKED');
assert.strictEqual(stale.action,null);
assert.strictEqual(stale.evidence.squadPrefixRejected,true);

// Projection-only rows are not actionable recommendations while the async
// full-party evaluation is still pending.
assert.strictEqual(appTest.routeCandidateReady({blueprintEvaluation:{basis:'route-projection-only',planned:false,rank:1}}),false);
assert.strictEqual(appTest.routeCandidateReady({blueprintEvaluation:{basis:'upper-plus-support-full-squad',rank:0}}),false);
assert.strictEqual(appTest.routeCandidateReady({blueprintEvaluation:{basis:'upper-plus-support-full-squad',rank:1}}),true);
assert.strictEqual(appTest.routeCandidateReady({keepUpper:true}),true);

console.log('PASS reconciled squad prefix owns the exact immediate Rare consumption');
console.log('PASS every actual Rare satisfies use + hold + reroll = initial');
console.log('PASS reroll allocation is capped at 2 - rerollsUsed and closes at two');
console.log('PASS squad and deadline reservations survive the unified Rare ledger');
console.log('PASS stale prefixes fail closed and provisional route rows stay disabled');
