'use strict';

// v17.23 — 2026-07-27 사망 로그의 직접 원인은 "지금 제작"과 최종
// 파티의 safePrefix가 서로 다른 유닛을 승인한 것이다.  대용량 최신 로그
// 자체는 패키지에 넣지 않는다. 실행 권위 회귀는 이미 패키지에 포함된
// 07-25 실전 로그의 동일 증상(R35)을 재생하고, 상위 각 회귀는 07-27
// R30 seq141에서 필요한 패/완성도만 축약한 고정 fixture로 검증한다.

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of [
  'ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js',
  'ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js',
  'ord_upper_combat_data.js','ord_upper_skill_digest.js',
  'ord_upper_skill_dps.js','ord_meta_stats.js','ord_core.js',
  'ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js',
  'ord_v15_policy.js','ord_v15_engine.js'
])require(path.join(EXT,file));

const C=global.ORDCore;
const M=global.ORDV15Model;
const P=global.ORDSquadPlanner;
const E=global.ORDV15Engine;
const Compactor=require(path.join(EXT,'ord_run_log_compactor.js'));
const catalog=global.ORD_TMO_UNITS;

function snapshotAtSeq(file,seq){
  const log=JSON.parse(fs.readFileSync(file,'utf8'));
  let baseline=null,target=null,event=null;
  for(const item of log.events){
    if(item.type!=='snapshot')continue;
    baseline=Compactor.applySnapshotRecord(baseline,item.payload,{digest:false});
    if(item.seq===seq){
      target=JSON.parse(JSON.stringify(baseline));
      event=item;
      break;
    }
  }
  assert(target&&event,`snapshot seq ${seq} missing`);
  const ids=new Set([
    ...Object.keys(target.counts||{}),
    ...Object.keys(target.progress||{})
  ]);
  return{
    event,
    snapshot:{
      source:'replay',
      sessionId:'v17-23-reconcile',
      seq,
      at:1,
      dataChangedAt:1,
      wispCountFound:true,
      wispCount:C.num(target.counts[C.WISP_ID]),
      counts:target.counts,
      currentAbilities:target.currentAbilities,
      units:[...ids].map(id=>({
        id,
        count:C.num(target.counts[id]),
        tmoPercent:C.num(target.progress[id])
      }))
    }
  };
}

{
  // Packaged 07-25 log seq254, R35:
  // raw V15 = V20h(울티), final squad prefix = 830h(시저).
  const replay=snapshotAtSeq(
    path.join(ROOT,'data/ORD_2305_20260725_120442_active.ordlog.json'),
    254
  );
  const settings={
    currentRound:35,
    mode:'physical',
    magicRoute:'physical',
    postLegendRoute:'upper',
    gorosei:'warcury',
    manualCounts:{},
    superKumaOwned:true,
    upperPreviewId:'B50h',
    targetSquadCount:9,
    targetLegendEquivalent:9
  };
  const locks=[{stage:'upper',id:'B50h',source:'test',sticky:true}];
  const model=M.build({catalog,snapshot:replay.snapshot,settings,locks});
  const state=C.normalizeState(catalog,replay.snapshot,settings);
  const raw=E.decide({model,locks});
  const squad=P.planAdaptiveFinalSquad(
    {catalog,state,settings,locks,upperBlueprint:null},
    {minTarget:9,maxTarget:9}
  );
  const first=squad.safePrefix&&squad.safePrefix.actions&&
    squad.safePrefix.actions[0];

  assert.strictEqual(raw.state,'ACT_NOW');
  assert.strictEqual(raw.action.id,'V20h','packaged R35 raw-action fixture drift');
  assert(first,'final squad produced no safePrefix action');
  assert.strictEqual(first.id,'830h','packaged R35 squad-prefix fixture drift');
  assert.notStrictEqual(raw.action.id,first.id,'fixture no longer reproduces split authority');

  const reconciled=E.reconcileSquadExecution(raw,squad,locks);
  assert.strictEqual(reconciled.state,'ACT_NOW');
  assert(reconciled.action&&reconciled.action.quote.feasible);
  assert.strictEqual(reconciled.action.id,first.id);
  assert.strictEqual(reconciled.action.path[0].id,first.id);
  assert.strictEqual(
    reconciled.evidence.executionAuthority,
    'squad-prefix-requoted-v15'
  );
  assert.strictEqual(reconciled.evidence.rawActionReplaced,true);

  // safePrefix가 계산된 뒤 그 재료가 사라진 stale 패를 흉내 낸다.
  // 원래 raw V15 행동으로 되돌아가면 안 되고 반드시 동기화 차단해야 한다.
  const staleCounts=Object.assign({},model.effective.counts);
  for(const id of Object.keys(reconciled.action.quote.consumed||{}))
    staleCounts[id]=0;
  staleCounts[C.WISP_ID]=0;
  const staleModel=Object.assign({},model,{
    effective:Object.assign({},model.effective,{counts:staleCounts,wisp:0})
  });
  const staleDecision=Object.assign({},raw,{model:staleModel});
  const blocked=E.reconcileSquadExecution(staleDecision,squad,locks);
  assert.strictEqual(blocked.state,'SYNC_BLOCKED');
  assert.strictEqual(blocked.action,null);
  // v17.28(사용자 지적): 승인은 계속 막되(action null) 화면까지 비우지는
  // 않는다.  "이 타이밍에 추천을 안 해버리면 굉장히 곤란해진다" — 실측
  // 로그에서 r38~r52의 9개 라운드가 이 상태로 1번 카드가 비어 있었다.
  // 무엇을 왜 기다리는지는 blockedAction으로 계속 보여준다.
  assert(blocked.blockedAction===null||blocked.blockedAction&&blocked.blockedAction.id,'대체 카드가 형식을 갖추지 않았다');
  assert.notStrictEqual(blocked.blockedAction&&blocked.blockedAction.id,first.id,'차단된 바로 그 제작을 대체 카드로 내보냈다');
  assert.strictEqual(blocked.evidence.squadPrefixRejected,true);
  assert.strictEqual(blocked.evidence.plannedId,first.id);
  assert.notStrictEqual(
    blocked.action&&blocked.action.id,
    raw.action.id,
    'stale prefix silently fell back to the raw V15 action'
  );
}

{
  // Exact compact state from the supplied 07-27 failure log, R30 seq141.
  // Full event history/provenance is intentionally excluded from the package.
  const counts={
    '020h':1,'100h':4,'200h':7,'300h':7,'400h':5,'500h':9,'600h':2,
    '620h':1,'700h':10,'710h':1,'800h':7,'810e':20,'900h':4,
    A20h:1,C00h:2,C20h:1,D20h:1,E20h:1,E30h:1,F00h:3,F10h:1,
    G00h:1,I00h:5,J00h:2,K00h:2,K10h:1,M00h:1,O00h:2,O10h:1,
    P00h:1,Q00h:2,V00h:1,W00h:1,
    unit_1767884457709_1523:1,
    unit_1767884925665_1037:1,
    unit_1767884970331_9084:1
  };
  const progress={
    Q40h:82,B40h:85,H90H:95,'4B0H':96,W80H:91,'5B0H':83,C50h:82,
    '590H':78
  };
  const settings={
    currentRound:30,
    mode:'magic',
    magicRoute:'auto',
    postLegendRoute:'upper',
    gorosei:'none',
    superKumaOwned:true,
    targetSquadCount:9,
    targetLegendEquivalent:9
  };
  const snapshot={
    source:'compact-r30',
    sessionId:'v17-23-r30',
    seq:141,
    at:1,
    dataChangedAt:1,
    wispCountFound:true,
    wispCount:20,
    counts,
    currentAbilities:{
      '공격력 증가':35,
      '단일':1,
      '발동이동속도 감소':11,
      '순간이동':1,
      '스턴':.6,
      '이동속도 감소':20
    },
    units:Object.entries(progress).map(([id,tmoPercent])=>({
      id,count:C.num(counts[id]),tmoPercent
    }))
  };
  const state=C.normalizeState(catalog,snapshot,settings);
  const ranked=P.rankUpperBlueprints(
    {catalog,state,settings,locks:[]},
    {candidateIds:['Q40h','4B0H','B40h','H90H','W80H']}
  );
  const byId=new Map(ranked.map(row=>[row.upperId,row]));
  const bigMom=byId.get('Q40h');
  const sanji=byId.get('H90H');
  const kid=byId.get('4B0H');

  assert(bigMom&&sanji&&kid,'R30 upper shortlist fixture drift');
  assert.strictEqual(bigMom.powerTier.letter,'S');
  assert.strictEqual(bigMom.upperPreparation.rareUsed,0);
  assert.strictEqual((bigMom.safePrefix.actions||[]).length,0);
  assert.strictEqual(bigMom.upperPreparation.wispCost,21);

  assert.strictEqual(sanji.powerTier.letter,'A');
  assert.strictEqual(sanji.upperPreparation.rareUsed,1);
  assert.strictEqual(sanji.upperPreparation.rareClearedTypes,1);
  assert.strictEqual(sanji.upperPreparation.wispCost,3);
  assert.strictEqual(sanji.safePrefix.actions[0].id,'H90H');
  assert(sanji.readiness>=70,'Sanji no longer closes enough of the R30 role sheet');

  // A티어가 S티어를 넘는 예외는 "보유 희귀를 지금 실제로 비우고,
  // 저위습이며, safePrefix 첫 행동이고, 역할 준비도까지 충분"할 때뿐.
  assert(
    sanji.angleBand>=2,
    'the current-hand Rare angle was downgraded because preparation ignored the feasible safePrefix'
  );
  assert.strictEqual(sanji.effectiveTierRank,bigMom.effectiveTierRank);
  assert.strictEqual(ranked[0].upperId,'H90H');

  // 키드도 희귀를 쓰고 2위습이지만 준비도 64라 "아주 좋은 각"은 아니다.
  // 따라서 단순 재료 근접성만으로 S티어 빅맘을 넘으면 안 된다.
  assert.strictEqual(kid.upperPreparation.rareUsed,1);
  assert.strictEqual(kid.upperPreparation.wispCost,2);
  assert(kid.readiness<70);
  assert(ranked.indexOf(bigMom)<ranked.indexOf(kid));
}

console.log('PASS packaged R35 split authority is replaced by the re-quoted squad safePrefix');
console.log('PASS stale squad prefix blocks synchronization without raw-action fallback');
console.log('PASS compact latest-log R30 promotes only a verified high-quality Rare angle');
