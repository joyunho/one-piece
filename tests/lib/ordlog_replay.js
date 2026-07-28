'use strict';

// 실전 로그(.ordlog.json) 재생 하니스.
//
// 지금까지 회귀 검증은 로그에서 한두 라운드를 손으로 뽑아 fixture로
// 굳히는 방식이었다(v16_stall_recovery_replay, v17_23_reconcile).  그
// 방식은 이미 아는 증상만 잡는다.  "68라운드 중 47라운드가 무응답"
// 같은 판 전체의 성질은 판을 통째로 다시 돌려야만 보인다.
//
// 이 모듈은 로그 하나를 라운드 단위로 복원해 살아 있는 엔진에 다시
// 먹이고, 그 판이 어떻게 흘렀는지 숫자로 돌려준다.  기록된 판단이
// 아니라 지금 코드의 판단을 재는 것이 요점이다 — 로그는 입력(패·설정)의
// 출처일 뿐이고, 출력은 매번 현재 엔진에서 새로 나온다.

const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'../..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
const DATA=path.join(ROOT,'data');

function loadEngine(){
  if(global.ORDV15Engine)return global.ORDV15Engine;
  global.window=global;
  const warn=console.warn;
  console.warn=()=>{};
  for(const file of [
    'ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js',
    'ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js',
    'ord_upper_combat_data.js','ord_upper_skill_digest.js',
    'ord_upper_skill_dps.js','ord_meta_stats.js','ord_core.js',
    'ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js',
    'ord_v15_policy.js','ord_v15_engine.js'
  ])require(path.join(EXT,file));
  console.warn=warn;
  return global.ORDV15Engine;
}

const Compactor=require(path.join(EXT,'ord_run_log_compactor.js'));
const WISP_ID='810e';

// 패키지에 들어 있는 실전 로그 전부.  outcome은 사용자가 알려준
// 실제 결과다 — clear 한 판만 라벨된 정답이고 나머지는 대조군이다.
const RUNS=Object.freeze([
  {key:'0723a',file:'ORD_2305_20260723_064335_active.ordlog.json',outcome:'loss'},
  {key:'0723b',file:'ORD_2305_20260723_215148_active.ordlog.json',outcome:'loss'},
  {key:'0724', file:'ORD_2305_20260724_160110_active.ordlog.json',outcome:'loss'},
  {key:'0725', file:'ORD_2305_20260725_120442_active.ordlog.json',outcome:'loss'},
  {key:'0728a',file:'ORD_2305_20260728_053445_active.ordlog.json',outcome:'loss'},
  {key:'0728c',file:'ORD_2305_20260728_081549_clear.ordlog.json',  outcome:'clear'},
  // v18.0.0으로 실제 플레이한 첫 판.  53라에 죽었고, 고정한 상위가 TMO
  // 읽기에서 20번 빠지면서 역할표가 계속 무너진 것이 원인이었다.
  {key:'0728d',file:'ORD_2305_20260728_170254_active.ordlog.json',outcome:'loss'}
]);

function num(value){const n=Number(value);return Number.isFinite(n)?n:0;}

// 로그 한 판을 라운드별 입력으로 복원한다.  스냅샷은 델타 접기로,
// 설정(모드·경로·고정·고로세이)은 기록된 decision.input과 user-action
// 에서 되살린다.  라운드마다 마지막 상태를 쓴다 — 그 라운드에서
// 사용자가 최종적으로 마주한 판이기 때문이다.
function loadRun(fileOrKey){
  const entry=RUNS.find(run=>run.key===fileOrKey||run.file===fileOrKey);
  const file=entry?path.join(DATA,entry.file):fileOrKey;
  const log=JSON.parse(fs.readFileSync(file,'utf8'));
  const events=(log.events||[]).slice().sort((a,b)=>num(a.seq)-num(b.seq));

  let baseline=null;
  let gorosei='none';
  const byRound=new Map();
  // v18.1: 실전에서 TMO가 최종 등급 유닛 하나를 읽기에서 빠뜨리는 일이
  // 있다.  라이브 앱이 그걸 보정하므로 재생도 같은 보정을 거쳐야 실제로
  // 사용자가 본 판단을 재현한다.  보정 전 원본은 rawCounts로 남긴다.
  const engineForDb=loadEngine&&loadEngine();
  const db=global.ORDCore&&global.ORD_TMO_UNITS?global.ORDCore.buildDb(global.ORD_TMO_UNITS):null;
  let guard=null;

  for(const event of events){
    if(event.type==='snapshot'){
      baseline=Compactor.applySnapshotRecord(baseline,event.payload,{digest:false});
      continue;
    }
    if(event.type==='user-action'){
      const payload=event.payload||{};
      if(payload.action==='setting-change'&&payload.key==='gorosei')gorosei=String(payload.after||'none');
      continue;
    }
    if(event.type!=='decision'||!baseline)continue;
    const payload=event.payload||{};
    const round=Math.max(1,num(payload.round)||num(event.round));
    const input=payload.input||{};
    const rawCounts=Object.assign({},baseline.counts);
    let counts=rawCounts,held=[];
    if(db&&global.ORDCore&&global.ORDCore.stabilizeFinalUnits){
      const fixed=global.ORDCore.stabilizeFinalUnits(guard,rawCounts,db,{});
      guard={counts:Object.assign({},fixed.counts),misses:fixed.misses};
      counts=fixed.counts;held=fixed.held;
    }
    const progress=Object.assign({},baseline.progress);
    const ids=new Set([...Object.keys(counts),...Object.keys(progress)]);
    byRound.set(round,{
      round,
      seq:num(event.seq),
      outcome:entry?entry.outcome:'unknown',
      gorosei,
      snapshot:{
        source:'ordlog-replay',
        sessionId:String(log.runId||'replay'),
        seq:num(event.seq),
        at:1,
        dataChangedAt:1,
        wispCountFound:true,
        wispCount:num(counts[WISP_ID]),
        counts,
        currentAbilities:Object.assign({},baseline.currentAbilities),
        units:[...ids].map(id=>({id,count:num(counts[id]),tmoPercent:num(progress[id])}))
      },
      settings:{
        currentRound:round,
        mode:String(payload.mode||'physical'),
        magicRoute:String(input.directionKey||''),
        postLegendRoute:String(input.postLegendRoute||''),
        gorosei,
        superKumaOwned:true
      },
      locks:(input.locks||[]).map(lock=>({stage:String(lock.stage||'upper'),id:String(lock.id||''),name:String(lock.name||''),source:String(lock.source||'v15-exact-route')})),
      // 기록된 판단.  현재 엔진의 출력과 비교해 "무엇이 달라졌나"를
      // 볼 때만 쓴다 — 판정 기준으로는 쓰지 않는다.
      heldFinalUnits:held,
      recorded:payload.v15||null
    });
  }

  const rounds=[...byRound.values()].sort((a,b)=>a.round-b.round);
  return {
    key:entry?entry.key:path.basename(file),
    file,
    outcome:entry?entry.outcome:'unknown',
    runId:String(log.runId||''),
    rounds
  };
}

// 라운드 하나를 현재 엔진에 먹인다.  엔진이 던지면 그 라운드는
// throw로 표시하고 계속 간다 — 한 라운드의 예외가 판 전체 측정을
// 못 하게 만들면 하니스로서 쓸모가 없다.
function decideRound(engine,catalog,step,extraSettings){
  try{
    const decision=engine.decide({
      catalog,
      snapshot:step.snapshot,
      settings:Object.assign({},step.settings,extraSettings||{}),
      locks:step.locks
    });
    return {decision,error:null};
  }catch(error){
    return {decision:null,error:error&&error.message||String(error)};
  }
}

// 판단 하나에서 이 프로젝트가 실제로 신경 쓰는 것만 뽑는다.
function summarize(decision){
  if(!decision)return null;
  const assessment=decision.assessment||{};
  const action=decision.action||null;
  const blocked=decision.blockedAction||null;
  return {
    state:String(decision.state||''),
    status:String(assessment.status||''),
    structuralPass:assessment.structuralPass===true,
    // readiness는 assessment가 아니라 core의 역할표에 있다.
    readiness:num(assessment.role&&assessment.role.readiness),
    legendEquivalent:num(assessment.legendEquivalent),
    // 화면에 다음 행동이 하나라도 뜨는가.  승인된 행동이든 보류
    // 카드든, 사용자가 볼 게 있으면 참이다.
    hasAction:!!action,
    hasAnything:!!(action||blocked||(decision.alternatives||[]).length||(decision.recovery&&(decision.recovery.targets||[]).length)||(decision.routeCandidates||[]).length),
    actionName:String(action&&(action.name||action.label||action.id)||blocked&&(blocked.name||blocked.label||blocked.id)||''),
    blockers:(assessment.blockers||[]).slice(),
    // v18: 코치가 이 라운드에 실제로 말을 했는가.  이름 붙은 다음 행동이든
    // 마감 구간 운영 지시든, 둘 중 하나는 반드시 있어야 한다.
    confidence:decision.confidence?String(decision.confidence.level||''):'',
    confidenceKey:decision.confidence?String(decision.confidence.key||''):'',
    coachName:String(decision.coachAction&&decision.coachAction.name||''),
    coachNote:String(decision.confidence&&decision.confidence.note||''),
    speaks:!!(decision.coachAction||decision.confidence&&decision.confidence.note),
    // 감당 불가 목표를 지목하는 것 자체는 거짓말이 아니다 — "이걸 위해
    // 모으는 중"이라고 말하는 국면(PREPARE·예약)이 실제로 있다.  거짓말이
    // 되는 경우는 둘이다: 지금 하라고 승인해 놓고 못 만드는 것이거나,
    // 못 만든다는 사실을 부족량과 함께 밝히지 않는 것이다.
    unaffordable:!!(decision.coachAction&&decision.coachAction.affordable===false),
    unaffordableApproved:!!(decision.coachAction&&decision.coachAction.affordable===false&&decision.confidence&&decision.confidence.key==='approved'),
    unaffordableUnexplained:!!(decision.coachAction&&decision.coachAction.affordable===false&&!(num(decision.coachAction.wispShort)>0)),
    survivalPass:assessment.survivalPass===true,
    survivalPace:assessment.survivalPace?String(assessment.survivalPace.state||''):'',
    firepowerPass:!!(assessment.axes&&assessment.axes.firepower&&assessment.axes.firepower.applicable&&assessment.axes.firepower.pass)
  };
}

// 판 전체를 재생하고 이 프로젝트가 계속 되묻는 세 가지를 잰다:
//   silentRounds — 화면에 아무것도 없던 라운드 (침묵)
//   nullActionRounds — 승인된 다음 행동이 없던 라운드
//   safeRounds — 엔진이 "이 판은 됐다"고 말한 라운드
// 이긴 판에서 safeRounds가 0이면 기준이 현실보다 높다는 뜻이고,
// 진 판에서 safeRounds가 크면 오탐이다.
function replayRun(runOrKey,options){
  const engine=loadEngine();
  const catalog=global.ORD_TMO_UNITS;
  const run=typeof runOrKey==='string'?loadRun(runOrKey):runOrKey;
  const from=num(options&&options.fromRound)||1;
  const to=num(options&&options.toRound)||Infinity;
  const steps=run.rounds.filter(step=>step.round>=from&&step.round<=to);
  const rows=[];
  for(const step of steps){
    const {decision,error}=decideRound(engine,catalog,step,options&&options.settings);
    rows.push(Object.assign({round:step.round,error},summarize(decision)||{},{decision:options&&options.keepDecisions?decision:null}));
  }
  const counted=rows.filter(row=>!row.error);
  return {
    key:run.key,
    outcome:run.outcome,
    file:run.file,
    rounds:rows,
    totals:{
      rounds:rows.length,
      errors:rows.length-counted.length,
      silentRounds:counted.filter(row=>!row.hasAnything).map(row=>row.round),
      nullActionRounds:counted.filter(row=>!row.hasAction).map(row=>row.round),
      // v18 침묵 금지의 실제 측정치 — 코치가 한마디도 못 한 라운드.
      muteRounds:counted.filter(row=>!row.speaks).map(row=>row.round),
      unaffordableRounds:counted.filter(row=>row.unaffordable).map(row=>row.round),
      unaffordableApprovedRounds:counted.filter(row=>row.unaffordableApproved).map(row=>row.round),
      unaffordableUnexplainedRounds:counted.filter(row=>row.unaffordableUnexplained).map(row=>row.round),
      structuralPassRounds:counted.filter(row=>row.structuralPass).map(row=>row.round),
      survivalClosedRounds:counted.filter(row=>row.survivalPass).map(row=>row.round),
      onTimeRounds:counted.filter(row=>row.survivalPace==='on-time').map(row=>row.round),
      byConfidence:counted.reduce((acc,row)=>{acc[row.confidenceKey||'-']=(acc[row.confidenceKey||'-']||0)+1;return acc;},{}),
      byState:counted.reduce((acc,row)=>{acc[row.state||'-']=(acc[row.state||'-']||0)+1;return acc;},{}),
      byStatus:counted.reduce((acc,row)=>{acc[row.status||'-']=(acc[row.status||'-']||0)+1;return acc;},{})
    }
  };
}

module.exports={RUNS,DATA,loadEngine,loadRun,replayRun,summarize,WISP_ID};
