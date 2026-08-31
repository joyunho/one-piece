'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js','ord_app.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const db=C.buildDb(global.ORD_TMO_UNITS);
const App=global.ORDApp.App;
const ids=['D40h','E40h','C40h','B40h','F50h','A40h'];
for(const id of ids)assert(db.byId.has(id),`watch fixture unit missing: ${id}`);

const universe=ids.map(id=>({unit:db.byId.get(id),progress:70,watchKind:'progress',watchReason:'test'}));
const byId=new Map(universe.map(row=>[row.unit.id,row]));
const watchIds=plan=>plan.watch.map(row=>row.unit.id);
const makePlan=(watch,actions=[])=>({
  mode:'physical',purpose:'upper',upper:null,watchCap:8,
  watch:watch.map(id=>byId.get(id)),actions:actions.map(id=>byId.get(id)),rows:universe.slice()
});
const observation=(seq,hash,changedAt)=>({
  source:'tmo',sessionId:'session-v13',seq,dataHash:hash,dataChangedAt:changedAt,
  scanAt:changedAt+10,bridgeAt:changedAt+20,at:changedAt+10
});
const settings={currentRound:25,manualCounts:{}};
const state={counts:{},wisp:12};
const app=Object.create(App.prototype);
app.state={snapshot:observation(1,'hand-a',100),watchStability:{context:'',stableIds:[],pendingIds:[],pendingStreak:0,lastObservationKey:''}};

let plan=makePlan(ids.slice(0,2));
app.stabilizeWatch(plan,state,settings);
assert.deepStrictEqual(watchIds(plan),ids.slice(0,2),'first observation becomes the stable baseline');

app.state.snapshot=observation(2,'hand-b',200);
plan=makePlan(ids.slice(2,4));
app.stabilizeWatch(plan,state,settings);
assert.deepStrictEqual(watchIds(plan),ids.slice(2,4),'stale candidates absent from the current valid pool were resurrected');
assert.strictEqual(app.state.watchStability.pendingStreak,1);

// A rerender and a bridge heartbeat preserve session/seq/hash/dataChangedAt and
// therefore must not count as another game-data observation.
plan=makePlan(ids.slice(2,4));
app.stabilizeWatch(plan,state,settings);
assert.deepStrictEqual(watchIds(plan),ids.slice(2,4));
assert.strictEqual(app.state.watchStability.pendingStreak,1,'rerender counted as a fresh observation');
app.state.snapshot=Object.assign({},app.state.snapshot,{scanAt:999,bridgeAt:1000,at:999});
plan=makePlan(ids.slice(2,4));
app.stabilizeWatch(plan,state,settings);
assert.deepStrictEqual(watchIds(plan),ids.slice(2,4));
assert.strictEqual(app.state.watchStability.pendingStreak,1,'heartbeat counted as a data change');

app.state.snapshot=observation(3,'hand-c',300);
plan=makePlan(ids.slice(2,4));
app.stabilizeWatch(plan,state,settings);
assert.deepStrictEqual(watchIds(plan),ids.slice(2,4),'current valid fallback disappeared while promotion was provisional');
assert.strictEqual(app.state.watchStability.pendingStreak,2);
assert.deepStrictEqual(plan.watchStabilizing,{pendingStreak:2,required:3,pendingIds:ids.slice(2,4)});

app.state.snapshot=observation(4,'hand-d',400);
plan=makePlan(ids.slice(2,4));
app.stabilizeWatch(plan,state,settings);
assert.deepStrictEqual(watchIds(plan),ids.slice(2,4),'three matching data changes must replace the stable candidates');
assert.deepStrictEqual(app.state.watchStability.stableIds,ids.slice(2,4));
assert.strictEqual(app.state.watchStability.pendingStreak,0);

// If old candidates become invalid, actions/ownership are removed immediately;
// the current valid list is allowed as a safe fallback without waiting three frames.
app.state.snapshot=observation(5,'hand-e',500);
const ownedState={counts:{[ids[3]]:1},wisp:12};
plan=makePlan(ids.slice(4,6),[ids[2]]);
app.stabilizeWatch(plan,ownedState,settings);
assert(!watchIds(plan).includes(ids[2]),'a candidate promoted to an action remained visible');
assert(!watchIds(plan).includes(ids[3]),'an owned candidate remained visible');
assert.deepStrictEqual(watchIds(plan),ids.slice(4,6));

console.log('PASS  watch promotion requires three observations without resurrecting stale rows');
console.log('PASS  rerenders and heartbeat-only timestamp changes do not advance stability');
console.log('PASS  action and owned candidates are removed immediately');
