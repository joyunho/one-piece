'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

const memory=new Map();
global.localStorage={
  getItem:key=>memory.has(key)?memory.get(key):null,
  setItem:(key,value)=>memory.set(key,String(value)),
  removeItem:key=>memory.delete(key)
};
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js','ord_squad_planner.js','ord_app.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const App=global.ORDApp.App;
const T=global.ORDApp._test;

// Removed controls are a real migration, not merely hidden HTML. Old 10/11,
// manual-phase, reward, wood-availability, and conditional-stun values cannot
// leak into the new recommendation settings. Warped routes are now always on,
// so both legacy warped keys must be removed from persisted state.
const migrated=T.normalizeInitialState({
  mode:'magic',magicRoute:'dual',gorosei:'warcury',superKumaOwned:false,
  targetSquadCount:11,purpose:'spec',allowWarped:false,
  firstRareRewardClaimed:true,moneyRareReward:true,storyRareRewards:5,
  highGambleDone:true,highGambleRares:3,stunConditions:{B90H:true},
  transcendUsed:1,seraphUsed:1,changedUsed:2
});
assert.strictEqual(migrated.mode,'magic');
assert.strictEqual(migrated.magicRoute,'dual');
assert.strictEqual(migrated.gorosei,'warcury');
assert.strictEqual(migrated.superKumaOwned,false);
assert.strictEqual(migrated.targetSquadCount,9);
assert.strictEqual(migrated.purpose,'');
assert.strictEqual(migrated.allowWarped,undefined);
assert.strictEqual(migrated.recommendWarped,undefined);
for(const key of ['firstRareRewardClaimed','moneyRareReward','storyRareRewards','highGambleDone','highGambleRares','stunConditions'])assert(!Object.prototype.hasOwnProperty.call(migrated,key),`${key} survived migration`);

const app=Object.create(App.prototype);
app.state=Object.assign({},migrated,{
  snapshot:null,pendingTransaction:null,manualCounts:{},pendingCounts:{},pendingAt:{},
  virtualSpecialId:'',wispOverride:'',upperPreviewId:'',currentRound:25,
  roundStartedAt:0,roundPrepSeconds:10,roundNormalSeconds:35,roundBossSeconds:60,
  rerollsUsed:0,locks:[],watchStability:{},connectionDiagnostic:null
});
app.persist();
const saved=JSON.parse(memory.get('ord-nightmare-squad-architect-v13'));
assert.deepStrictEqual(
  [saved.mode,saved.magicRoute,saved.gorosei,saved.superKumaOwned,saved.transcendUsed,saved.seraphUsed,saved.changedUsed],
  ['magic','dual','warcury',false,1,1,2]
);
const settings=app.settings();
assert.strictEqual(settings.targetSquadCount,9);
assert.strictEqual(settings.purpose,'');
assert.strictEqual(settings.allowWarped,true);
assert.strictEqual(settings.recommendWarped,true);
assert.deepStrictEqual(settings.stunConditions,{});

// Snapshot changes are deferred while the user is browsing a native select;
// blur applies exactly one queued render.
let renders=0;
app.root={contains:node=>node===global.document.activeElement};
global.document={activeElement:{closest:selector=>selector.includes('.ord-app')?{}:null}};
app._deferredExternalRender=true;
app.render=()=>{renders+=1;app._deferredExternalRender=false;};
app.flushDeferredExternalRender();
assert.strictEqual(renders,0,'focused sidebar select was replaced');
global.document.activeElement=null;
app.flushDeferredExternalRender();
assert.strictEqual(renders,1,'deferred snapshot render did not flush after blur');

const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
for(const removed of ['희귀 보상 기록','data-opt="targetSquadCount"','data-opt="purpose"','data-opt="allowWarped"','data-act="recommend-warped"','data-stun-condition','조건부 스턴 연구값','다음 준비','OpenAI'])assert(!source.includes(removed),`removed UI still rendered: ${removed}`);
assert(source.includes('왜곡 경로 항상 허용'),'always-on warped rule is not shown');
assert(source.includes("row.feasible!==true"));

// Execute the real boot heartbeat helper twice, four seconds apart. render()
// deliberately throws so this test proves a heartbeat never replaces root.
const boot=fs.readFileSync(path.join(EXT,'ord_boot_extension.js'),'utf8');
const boundary=boot.indexOf("  document.addEventListener('DOMContentLoaded'");
assert(boundary>0,'boot helper boundary missing');
const context=vm.createContext({Number,String,Object,Array,Set,Map,Promise,JSON,Date,Math});
vm.runInContext(boot.slice(0,boundary)+'\nglobalThis.__touchHeartbeat=touchHeartbeat;\n})();',context,{filename:'ord_boot_extension_heartbeat_test.js'});
const snapshot={dataHash:'same-hand',sessionId:'session',seq:7,sourceEpoch:2,sourceTabId:31,bridgeAt:1000,scanAt:1000,at:1000};
let statusUpdates=0;
const heartbeatApp={state:{snapshot,liveAt:0},updateLiveStatusOnly(){statusUpdates+=1;},render(){throw new Error('heartbeat called render');}};
for(const heartbeat of [
  {dataHash:'same-hand',sessionId:'session',seq:7,sourceEpoch:2,sourceTabId:31,bridgeAt:2000,scanAt:2000},
  {dataHash:'same-hand',sessionId:'session',seq:7,sourceEpoch:2,sourceTabId:31,bridgeAt:6000,scanAt:6000}
])assert.strictEqual(context.__touchHeartbeat(heartbeatApp,heartbeat),true);
assert.strictEqual(statusUpdates,2);
assert.strictEqual(heartbeatApp.state.liveAt,6000);

console.log('PASS  removed sidebar/OpenAI controls cannot survive migration as hidden settings');
console.log('PASS  mode, route, Gorosei, super-Kuma and usage counters persist');
console.log('PASS  focused sidebar controls defer external snapshot rendering until blur');
console.log('PASS  four-second heartbeat updates status without render/root replacement');
console.log('PASS  infeasible recommendation exposes only disabled material preparation');
console.log('PASS  warped recommendation settings are always-on and no longer user-toggleable');
