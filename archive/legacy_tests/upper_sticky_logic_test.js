'use strict';
const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js','ord_app.js'])require(path.join(EXT,file));

const App=global.ORDApp.App;
const app=Object.create(App.prototype);
app.catalog=global.ORD_TMO_UNITS;
app.state={locks:[],upperDetection:{candidateId:'',streak:0,lastSnapshotKey:'',lastSeenAt:0},upperPreviewId:'',purpose:''};

const base='F90H',upgrade='unit_1767356628978_5789',stamp=Date.now();
const snap=(counts,key,at)=>({at:at||Date.now(),counts,dataHash:key});
const empty=snap({},'empty',stamp),first=snap({[base]:1},'first',stamp+1),second=snap({[base]:1},'second',stamp+2);

app.observeUpper(empty,first);
assert.deepStrictEqual([app.state.upperDetection.candidateId,app.state.upperDetection.streak],[base,1]);
app.observeUpper(empty,first);
assert.strictEqual(app.state.upperDetection.streak,1,'같은 TMO 스냅샷을 두 번 세면 안 됩니다.');
app.observeUpper(first,second);
assert.strictEqual(app.upperLock().id,base,'서로 다른 정상 스냅샷 2회 후 상위를 고정해야 합니다.');
app.observeUpper(second,snap({},'temporary-miss',stamp+3));
assert.strictEqual(app.upperLock().id,base,'TMO 순간 누락이 고정 상위를 해제하면 안 됩니다.');

app.state.locks=[{stage:'upper',id:upgrade,source:'tmo',sticky:true,routeRootId:base,activeVariantId:upgrade}];
app.observeUpper(snap({[upgrade]:1},'up-live',stamp+4),snap({[base]:1},'base-only',stamp+5));
assert.strictEqual(app.upperLock().id,upgrade,'하위 형태만 잡힌 스냅샷으로 활성 상위를 강등하면 안 됩니다.');

app.state.locks=[{stage:'upper',id:base,source:'tmo',sticky:true,routeRootId:base,activeVariantId:base}];
app.observeUpper(snap({[base]:1},'base-live',stamp+6),snap({[upgrade]:1},'up-first',stamp+7));
assert.deepStrictEqual([app.upperLock().id,app.upperLock().variantCandidateId,app.upperLock().variantStreak],[base,upgrade,1]);
app.observeUpper(snap({[upgrade]:1},'up-first',stamp+7),snap({[upgrade]:1},'up-second',stamp+8));
assert.strictEqual(app.upperLock().id,upgrade,'활성 형태도 서로 다른 정상 스냅샷 2회 후에만 갱신해야 합니다.');

app.state.locks=[];
app.state.upperDetection={candidateId:base,streak:1,lastSnapshotKey:'old',lastSeenAt:Date.now()-9001};
app.observeUpper(empty,snap({[base]:1},'fresh-after-expiry',stamp+9));
assert.deepStrictEqual([app.state.upperDetection.candidateId,app.state.upperDetection.streak,!!app.upperLock()],[base,1,false]);

console.log('PASS  sticky upper survives misses and requires two fresh snapshots for lock/variant upgrade');
