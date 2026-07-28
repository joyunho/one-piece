'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js','ord_app.js'])require(path.join(EXT,file));

const App=global.ORDApp.App;
const T=global.ORDApp._test;
const upperId='V80H';
const stamp=Date.now();
const snap=(key,at)=>({source:'test',sessionId:'route-atomic',seq:at,dataHash:key,at,counts:{[upperId]:1},currentAbilities:{}});
const app=Object.create(App.prototype);

app.catalog=global.ORD_TMO_UNITS;
app.state=Object.assign(T.normalizeInitialState({}),{
  snapshot:snap('before',stamp),
  mode:'magic',
  magicRoute:'dual',
  locks:[{stage:'upper',id:upperId,source:'manual-blueprint',sticky:true}],
  directionStatus:'selected',
  directionKey:'dual',
  directionUpperId:upperId,
  upperBlueprint:{
    upperId,
    lineupIds:[upperId,'A40h','B40h'],
    buildOrderIds:['A40h','B40h',upperId],
    mode:'magic',
    magicRoute:'dual',
    revision:7,
    fullPartyVerified:true,
    commitment:'full-party'
  },
  upperDetection:{candidateId:'',streak:0,lastSnapshotKey:'',lastSeenAt:0}
});
app._squadCacheKey='old';
app._upperRankCacheKey='old';
app._upperRankCache=[{upperId}];
app._directionRankCacheKey='old';
app._directionDesiredKey='old';
app._blueprintRankings=[{upperId}];
app._blueprintRankingsKey='old';
app._blueprintDesiredKey='old';
app._v15CacheKey='old';
app._v15Cache={authority:true};
app.persist=()=>{};
app.render=()=>{};
app.recordAuditAction=payload=>{app.audit=payload;};

app.setOpt('magicRoute','singleEnd');
assert.deepStrictEqual(
  [app.state.magicRoute,app.state.directionKey,app.state.directionStatus,app.state.directionUpperId],
  ['singleEnd','singleEnd','selected',upperId],
  '사용자가 고른 마딜 경로를 세 방향 상태에 원자적으로 반영해야 합니다.'
);
assert.strictEqual(app.upperLock().id,upperId,'경로 변경이 메인 상위 잠금을 풀면 안 됩니다.');
assert.deepStrictEqual(app.state.upperBlueprint.lineupIds,[upperId],'이전 경로 전용 보조 풀파티 청사진을 유지하면 안 됩니다.');
assert.deepStrictEqual(app.state.upperBlueprint.buildOrderIds,[upperId]);
assert.strictEqual(app.state.upperBlueprint.magicRoute,'singleEnd');
assert.strictEqual(app.state.upperBlueprint.fullPartyVerified,false);
assert.strictEqual(app.state.upperBlueprint.commitment,'upper-route');
assert(app.state.upperBlueprint.revision>7,'경로 변경은 청사진 revision을 올려야 합니다.');
assert.deepStrictEqual(
  [app._squadCacheKey,app._upperRankCacheKey,app._directionRankCacheKey,app._directionDesiredKey,app._blueprintRankings,app._blueprintRankingsKey,app._blueprintDesiredKey,app._v15CacheKey,app._v15Cache],
  ['','','','',null,'','','',null],
  '경로에 의존하는 모든 추천 캐시를 폐기해야 합니다.'
);

const revision=app.state.upperBlueprint.revision;
for(let index=1;index<=2;index++){
  const previous=snap(`accepted-${index-1}`,stamp+index-1),next=snap(`accepted-${index}`,stamp+index);
  app.observeUpper(previous,next);
  assert.deepStrictEqual(
    [app.state.magicRoute,app.state.directionKey,app.state.upperBlueprint.magicRoute],
    ['singleEnd','singleEnd','singleEnd'],
    '후속 TMO 스냅샷이 명시적으로 바꾼 경로를 예전 directionKey로 되돌리면 안 됩니다.'
  );
}
assert.strictEqual(app.state.upperBlueprint.revision,revision,'동일 경로 스냅샷마다 청사진을 다시 만들면 안 됩니다.');

app.state.magicRoute='singleEnd';
app.state.directionKey='dual';
app.state.upperBlueprint=Object.assign({},app.state.upperBlueprint,{
  lineupIds:[upperId,'A40h'],
  buildOrderIds:['A40h',upperId],
  magicRoute:'dual',
  revision:20,
  fullPartyVerified:true,
  commitment:'full-party'
});
app.syncUpperMode(upperId,app.catalogDb());
assert.deepStrictEqual(
  [app.state.magicRoute,app.state.directionKey,app.state.upperBlueprint.magicRoute,app.state.upperBlueprint.commitment],
  ['singleEnd','singleEnd','singleEnd','upper-route'],
  '저장된 legacy 불일치도 magicRoute를 기준으로 복구해야 합니다.'
);

app.setOpt('magicRoute','auto');
assert.deepStrictEqual(
  [app.state.magicRoute,app.state.directionKey,app.state.directionStatus,app.state.directionUpperId,app.state.upperBlueprint,app.upperLock().id],
  ['auto','','open','',null,upperId],
  '자동 경로는 상위 잠금만 남기고 경로 전용 선택과 청사진을 비워야 합니다.'
);
app.observeUpper(snap('auto-before',stamp+10),snap('auto-after',stamp+11));
assert.deepStrictEqual([app.state.magicRoute,app.state.directionKey,app.state.upperBlueprint],['auto','',null]);

console.log('PASS  magic route, direction key, and upper blueprint stay atomic across accepted snapshots');
