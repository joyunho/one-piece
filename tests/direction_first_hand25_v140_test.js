'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js'])require(path.join(EXT,file));
const planner=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore;

// 사용자가 제시한 실제 25라운드 패.
const counts={
  // 흔함 63
  '300h':5,'200h':8,'100h':10,'700h':5,'400h':9,'800h':4,'500h':8,'900h':9,'600h':5,
  // 안흔함 8
  'G00h':2,'O00h':1,'N00h':1,'E00h':2,'L00h':2,
  // 특별함 8
  'B00h':1,'E10h':1,'I10h':2,'A10h':1,'710h':1,'R00h':1,'P00h':1,
  // 희귀함 6
  'Z10h':1,'C20h':1,'320h':1,'K20h':2,'L50h':1,
  [C.WISP_ID]:1
};

const board=planner.rankDeckDirections({
  catalog:global.ORD_TMO_UNITS,
  snapshot:{counts,currentAbilities:{}},
  // 기본 UI 모드가 물딜이어도 마딜 두 경로를 누락하면 안 된다.
  settings:{mode:'physical',currentRound:25,targetSquadCount:9,targetLegendEquivalent:9,superKumaOwned:true,recommendWarped:true}
},{perLane:2,exact:true});

const lanes=Object.fromEntries(board.lanes.map(lane=>[lane.key,lane]));
assert.deepStrictEqual(board.lanes.map(lane=>lane.key),['physical','dual','singleEnd'],'세 경로는 전역 점수로 합치지 않고 독립 레인으로 표시해야 합니다.');
assert.deepStrictEqual(
  board.lanes.map(lane=>[lane.key,lane.mode,lane.route]),
  [['physical','physical','physical'],['dual','magic','dual'],['singleEnd','magic','singleEnd']]
);
assert(board.lanes.every(lane=>lane.rows.length>0),'기본 물딜 모드 때문에 마딜 후보가 사라졌습니다.');
assert(board.lanes.every(lane=>lane.rows.length<=2),'방향별 후보는 최대 두 개여야 합니다.');
assert(['hold','provisional-upper','single-dominant'].includes(board.decision));

const physical=lanes.physical.rows[0];
const dual=lanes.dual.rows[0];
const single=lanes.singleEnd.rows[0];

assert.strictEqual(physical.upperId,'190H','이 실제 패의 물딜 방향은 쵸파 상위가 최상단이어야 합니다.');
assert.deepStrictEqual(physical.safePrefix.actions.map(action=>action.id),['190H']);
assert.strictEqual(physical.safePrefix.checkpointPass,false,'쵸파 상위 한 기만으로 30라 상위+전설 체크를 통과시켰습니다.');
assert.strictEqual(physical.projectedComplete,false);
assert.strictEqual(physical.wispFeasible,false);
assert(physical.wispShortage>0,'미래 9기의 선택위습 부채가 숨겨졌습니다.');

for(const row of [physical,dual,single]){
  assert.strictEqual(row.safePrefix.basis,'current-tmo-stock-only');
  assert(row.safePrefix.actions.length<=2,'현재 확정 행동은 다음 1~2기만 보여야 합니다.');
  assert.strictEqual(row.projectedComplete,false,'미래 드랍 의존 청사진을 완성 파티로 표시했습니다.');
  assert.strictEqual(row.handFeasible,false);
  assert.strictEqual(row.wispFeasible,false);
  assert(row.wispShortage>0);
}

function replay(prefix){
  const state=C.normalizeState(global.ORD_TMO_UNITS,{counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});
  let stock=Object.assign({},state.counts),wisp=C.num(stock[C.WISP_ID]);
  for(const action of prefix.actions){
    // The planner's effective solve intentionally exempts Absalom's zombie
    // material. Replaying the raw core recipe would re-introduce that one
    // documented exception, so verify the effective ledger itself against the
    // live stock and then advance to its recorded stockAfter.
    const solve=action.solve;
    assert.strictEqual(solve.hardMissing.length,0,`${action.name} 특수 재료가 없습니다.`);
    for(const [id,value] of Object.entries(solve.consumed||{})){
      assert(C.num(stock[id])>=C.num(value),`${action.name} ${id} ${value}/${C.num(stock[id])} 원장 초과 소비`);
    }
    assert(solve.wispCost<=wisp,`${action.name} 선위 ${solve.wispCost}/${wisp}`);
    stock=Object.assign({},solve.stockAfter);wisp-=solve.wispCost;stock[C.WISP_ID]=wisp;stock[action.id]=C.num(stock[action.id])+1;
    assert(Object.values(stock).every(value=>C.num(value)>=0),'확정 행동 재생 중 음수 재고가 생겼습니다.');
  }
  for(const [id,value] of Object.entries(prefix.afterStock||{}))assert.strictEqual(C.num(stock[id]),C.num(value),`${id} 재고 원장 불일치`);
}
for(const row of [physical,dual,single])replay(row.safePrefix);

assert.strictEqual(dual.upperId,'V80H');
assert.strictEqual(single.upperId,'V80H');
assert.deepStrictEqual(dual.safePrefix.actions.map(action=>action.id),['V80H','030h']);
assert.deepStrictEqual(single.safePrefix.actions.map(action=>action.id),['V80H','030h']);
assert.strictEqual(dual.safePrefix.checkpointPass,true);
assert.strictEqual(single.safePrefix.checkpointPass,true);
assert(board.provisionalDirection,'30라를 닫는 단기 상위 방향이 표시되지 않았습니다.');
assert.strictEqual(board.provisionalDirection.upperCanonicalId,C.canonicalUpperId('V80H'));
assert.deepStrictEqual(board.provisionalDirection.routeKeys.sort(),['dual','singleEnd']);
assert.strictEqual(board.decision,'provisional-upper');
assert.strictEqual(board.dominant,'','마딜 세부 경로가 같은 prefix일 때 dual/single을 억지 확정하면 안 됩니다.');
assert.deepStrictEqual(board.safeReroll,[],'실제 제작 전에는 희귀 리롤을 확정하면 안 됩니다.');

console.log('PASS three direction lanes remain independent and expose only current-stock prefixes');
console.log('PASS the physical one-unit route is warned as an R30 miss with its full future wisp debt');
console.log('PASS Nami Upper -> Kuma is replayable and closes R30 without pretending to solve R50');
