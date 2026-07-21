'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js','ord_squad_planner.js','ord_app.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const App=global.ORDApp.App;
const catalog=global.ORD_TMO_UNITS;
const db=C.buildDb(catalog);

function fixture(source='extension'){
  const app=Object.create(App.prototype);
  app.catalog=catalog;
  app.config={source};
  app.state={
    manualCounts:{},pendingCounts:{legacy:1},pendingAt:{legacy:Date.now()},pendingTransaction:null,
    virtualSpecialId:'',changedUsed:0,transcendUsed:0,seraphUsed:0,firstRareRewardClaimed:false,
    locks:[],purpose:'spec',watchStability:{context:'old',stableIds:['x'],pendingIds:[],pendingStreak:0,lastObservationKey:'old'},
    currentRound:25,wispOverride:'',snapshot:null
  };
  app.persist=()=>{};
  app.toast=message=>{app.lastToast=message;};
  app.setMessage=message=>{app.lastMessage=message;};
  app.actualRound=()=>25;
  return app;
}

const result=db.legendish.find(unit=>!C.isUpper(unit)&&!C.isChanged(unit)&&!C.isTranscend(unit)&&!C.isSeraph(unit));
const secondResult=db.legendish.find(unit=>unit.id!==result.id&&!C.isUpper(unit)&&!C.isChanged(unit)&&!C.isTranscend(unit)&&!C.isSeraph(unit));
const changedResult=db.legendish.find(unit=>C.isChanged(unit));
const materialA=db.specials[0];
const materialB=db.commons[0];
assert(result&&secondResult&&changedResult&&materialA&&materialB,'atomic transaction fixtures missing');

const sourceFields={source:'tmo',parser:'ord-tmo-parser-v13-adapter',helperId:'32172',sourceTabId:11,sourceEpoch:1,sessionId:'source-session'};

function initialCounts(){return{
  [result.id]:0,[secondResult.id]:0,[materialA.id]:2,[materialB.id]:1,[C.WISP_ID]:5
};}
function firstRow(){return{
  unit:result,availableWisp:5,
  solve:{consumed:{[materialA.id]:1,[materialB.id]:1},stockAfter:{[result.id]:0,[materialA.id]:1,[materialB.id]:0},wispCost:2}
};}

// Extension-mode projection is one indivisible transaction: output, every
// material decrement, and selection-wisp decrement are visible together.
const app=fixture('extension');
const raw=initialCounts();
app.state.snapshot=Object.assign({},sourceFields,{seq:1,dataHash:'before-build',dataChangedAt:100,scanAt:110,bridgeAt:120,at:110,counts:raw});
app.state.manualCounts[materialA.id]=2;
app.state.virtualSpecialId=materialA.id;
app.state.locks=[{stage:'legend',id:result.id}];
app.markBuild(firstRow(),{state:{counts:raw,wisp:5}});

const tx=app.state.pendingTransaction;
assert(tx,'extension build did not create a pending transaction');
assert.deepStrictEqual(tx.expected,{
  [materialA.id]:1,
  [materialB.id]:0,
  [result.id]:1,
  [C.WISP_ID]:3
});
const projected=app.effectiveManualCounts(app.state.snapshot);
assert.deepStrictEqual(Object.fromEntries(Object.keys(tx.expected).map(id=>[id,projected[id]])),tx.expected);
assert.strictEqual(app.state.manualCounts[materialA.id],2,'pending transaction mutated a persistent manual override');
assert.strictEqual(app.state.virtualSpecialId,'','a consumed virtual special remained reusable');
assert(!app.state.locks.some(lock=>lock.stage==='legend'),'completed legend route lock remained active');
assert.match(app.lastToast,/모든 소모 재료/);

// Twenty seconds changes the transaction to a review state; it must never
// discard or partially release the projected counts by timeout.
assert.strictEqual(app.prunePending(app.state.snapshot,tx.lastAt+20001),true);
assert.strictEqual(app.state.pendingTransaction.status,'review');
assert.deepStrictEqual(app.effectiveManualCounts(app.state.snapshot),projected);
assert.strictEqual(app.prunePending(app.state.snapshot,tx.lastAt+120000),false);
assert(app.state.pendingTransaction,'review transaction expired after a longer timeout');

const heartbeat=Object.assign({},app.state.snapshot,{scanAt:9999,bridgeAt:10000,at:9999});
assert.strictEqual(app.prunePending(heartbeat,tx.lastAt+130000),false,'heartbeat cleared a build transaction');
assert(app.state.pendingTransaction);

const partial=Object.assign({},app.state.snapshot,{
  seq:2,dataHash:'partial-tmo-change',dataChangedAt:200,
  counts:Object.assign({},raw,{[result.id]:1})
});
assert.strictEqual(app.prunePending(partial,tx.lastAt+140000),false,'partial TMO match cleared an atomic transaction');
assert(app.state.pendingTransaction);

const confirmed=Object.assign({},partial,{dataHash:'confirmed-build',dataChangedAt:300,counts:Object.assign({},raw,tx.expected)});
assert.strictEqual(app.prunePending(confirmed,tx.lastAt+150000),true);
assert.strictEqual(app.state.pendingTransaction,null,'exact TMO confirmation did not release the projection');
assert.strictEqual(app.state.virtualSpecialId,'','a committed transaction rolled back its side effects');
assert(!app.state.locks.some(lock=>lock.stage==='legend'),'a committed transaction restored its completed route lock');

// Multiple clicked builds merge into one transaction while retaining the
// already projected first result and its material/wisp state.
const chained=fixture('extension');
chained.state.snapshot=Object.assign({},sourceFields,{sessionId:'chain-session',seq:1,dataHash:'chain-base',dataChangedAt:400,at:400,counts:raw});
chained.markBuild(firstRow(),{state:{counts:raw,wisp:5}});
const afterFirst=chained.effectiveManualCounts(chained.state.snapshot);
const row2={
  unit:secondResult,availableWisp:afterFirst[C.WISP_ID],
  solve:{consumed:{[materialA.id]:1},stockAfter:{[secondResult.id]:0,[materialA.id]:0},wispCost:1}
};
chained.markBuild(row2,{state:{counts:Object.assign({},raw,afterFirst),wisp:afterFirst[C.WISP_ID]}});
assert.strictEqual(chained.state.pendingTransaction.steps.length,2);
assert.strictEqual(chained.state.pendingTransaction.expected[result.id],1);
assert.strictEqual(chained.state.pendingTransaction.expected[secondResult.id],1);
assert.strictEqual(chained.state.pendingTransaction.expected[materialA.id],0);
assert.strictEqual(chained.state.pendingTransaction.expected[C.WISP_ID],2);

// Route reservations are planning-only holds. A build transaction must debit
// the real hand by this step's consumption, not replace it with the solver's
// reservation-reduced stock or reservation-reduced available-wisp balance.
const reserved=fixture('extension');
const reservedRaw={
  [secondResult.id]:0,[materialA.id]:3,[C.WISP_ID]:10
};
reserved.state.snapshot=Object.assign({},sourceFields,{sessionId:'reserved-session',seq:1,dataHash:'reserved-base',dataChangedAt:600,at:600,counts:reservedRaw});
const reservedRow={
  unit:secondResult,
  availableWisp:7, // 3 wisps are protected for another locked route.
  solve:{
    consumed:{[materialA.id]:1},
    stockAfter:{[secondResult.id]:0,[materialA.id]:1}, // one more material is reserved.
    wispCost:2
  }
};
reserved.markBuild(reservedRow,{state:{counts:reservedRaw,wisp:10}});
assert.strictEqual(reserved.state.pendingTransaction.expected[secondResult.id],1);
assert.strictEqual(reserved.state.pendingTransaction.expected[materialA.id],2,'planning reservation was incorrectly debited from the real hand');
assert.strictEqual(reserved.state.pendingTransaction.expected[C.WISP_ID],8,'reserved wisps were incorrectly debited from the real hand');

// Dismissal is a true rollback of build-side state. Persistent manual values
// were never modified while pending, while route/reward/usage state returns to
// the exact pre-transaction snapshot.
const rollback=fixture('extension');
const rollbackRaw={[changedResult.id]:0,[materialA.id]:2,[C.WISP_ID]:5};
rollback.state.snapshot=Object.assign({},sourceFields,{sessionId:'rollback-session',seq:1,dataHash:'rollback-base',dataChangedAt:700,at:700,counts:rollbackRaw});
rollback.state.manualCounts[materialA.id]=2;
rollback.state.virtualSpecialId=materialA.id;
rollback.state.changedUsed=1;
rollback.state.transcendUsed=0;
rollback.state.seraphUsed=0;
rollback.state.firstRareRewardClaimed=false;
rollback.state.wispOverride='9';
rollback.state.locks=[{stage:'legend',id:changedResult.id}];
rollback.state.purpose='spec';
const changedRow={unit:changedResult,availableWisp:5,solve:{consumed:{[materialA.id]:1},stockAfter:{[changedResult.id]:0,[materialA.id]:1},wispCost:1}};
rollback.markBuild(changedRow,{state:{counts:rollbackRaw,wisp:5}});
assert.strictEqual(rollback.state.changedUsed,2);
assert.strictEqual(rollback.state.virtualSpecialId,'');
assert.strictEqual(rollback.state.manualCounts[materialA.id],2);
rollback.act('dismiss-transaction',{dataset:{}});
assert.strictEqual(rollback.state.pendingTransaction,null);
assert.strictEqual(rollback.state.manualCounts[materialA.id],2);
assert.strictEqual(rollback.state.virtualSpecialId,materialA.id);
assert.strictEqual(rollback.state.changedUsed,1);
assert.strictEqual(rollback.state.transcendUsed,0);
assert.strictEqual(rollback.state.seraphUsed,0);
assert.strictEqual(rollback.state.wispOverride,'9');
assert.deepStrictEqual(rollback.state.locks,[{stage:'legend',id:changedResult.id}]);
assert.strictEqual(rollback.state.purpose,'spec');

const rareResult=db.rares[0],rareRollback=fixture('extension'),rareRaw={[rareResult.id]:0,[materialB.id]:1,[C.WISP_ID]:2};
rareRollback.actualRound=()=>7;
rareRollback.state.snapshot=Object.assign({},sourceFields,{sessionId:'rare-rollback',seq:1,dataHash:'rare-base',dataChangedAt:800,at:800,counts:rareRaw});
rareRollback.state.locks=[{stage:'rare',id:rareResult.id}];
rareRollback.markBuild({unit:rareResult,availableWisp:2,solve:{consumed:{[materialB.id]:1},stockAfter:{[rareResult.id]:0,[materialB.id]:0},wispCost:1}},{state:{counts:rareRaw,wisp:2}});
assert.strictEqual(rareRollback.state.firstRareRewardClaimed,false,'removed reward ledger was mutated by a build');
rareRollback.act('dismiss-transaction',{dataset:{}});
assert.strictEqual(rareRollback.state.firstRareRewardClaimed,false);
assert.deepStrictEqual(rareRollback.state.locks,[{stage:'rare',id:rareResult.id}]);

// Exact counts from a different source identity are not proof of this build.
// Each identity change must roll the transaction back instead of committing it.
for(const [label,identityChange] of [
  ['source epoch',{sourceEpoch:2}],
  ['source tab',{sourceTabId:22}],
  ['parser session',{sessionId:'other-session'}]
]){
  const sourceSwap=fixture('extension'),swapRaw=initialCounts();
  sourceSwap.state.snapshot=Object.assign({},sourceFields,{seq:1,dataHash:`${label}-base`,dataChangedAt:900,at:900,counts:swapRaw});
  sourceSwap.state.virtualSpecialId=materialA.id;
  sourceSwap.state.locks=[{stage:'legend',id:result.id}];
  sourceSwap.state.purpose='spec';
  sourceSwap.markBuild(firstRow(),{state:{counts:swapRaw,wisp:5}});
  const expected=sourceSwap.state.pendingTransaction.expected;
  const foreign=Object.assign({},sourceSwap.state.snapshot,identityChange,{seq:2,dataHash:`${label}-foreign`,dataChangedAt:1000,counts:Object.assign({},swapRaw,expected)});
  assert.strictEqual(sourceSwap.prunePending(foreign,Date.now()),true,`${label} did not trigger rollback`);
  assert.strictEqual(sourceSwap.state.pendingTransaction,null,`${label} left a foreign transaction active`);
  assert.strictEqual(sourceSwap.state.virtualSpecialId,materialA.id,`${label} exact counts were incorrectly committed`);
  assert.deepStrictEqual(sourceSwap.state.locks,[{stage:'legend',id:result.id}],`${label} route state was not rolled back`);
  assert.strictEqual(sourceSwap.state.purpose,'spec',`${label} purpose was not rolled back`);
}

// Standalone mode commits the same atomic projection permanently to manual
// counts instead of waiting for a TMO acknowledgement.
const manual=fixture('standalone-manual');
manual.state.snapshot={source:'manual',dataHash:'manual-base',dataChangedAt:500,at:500,counts:raw};
manual.markBuild(firstRow(),{state:{counts:raw,wisp:5}});
assert.strictEqual(manual.state.pendingTransaction,null);
assert.strictEqual(manual.state.manualCounts[result.id],1);
assert.strictEqual(manual.state.manualCounts[materialA.id],1);
assert.strictEqual(manual.state.manualCounts[materialB.id],0);
assert.strictEqual(Number(manual.state.wispOverride),3);

console.log('PASS  build transaction atomically projects output, all materials, and selection wisps');
console.log('PASS  review timeout and heartbeat never discard an unconfirmed transaction');
console.log('PASS  only an exact changed TMO hand confirms and clears the transaction');
console.log('PASS  chained and standalone builds preserve the same atomic accounting');
console.log('PASS  planning reservations never become extra real-hand debits');
console.log('PASS  dismissal restores route, usage, virtual-material, and purpose state');
console.log('PASS  source epoch/tab/session changes cannot falsely confirm a transaction');
