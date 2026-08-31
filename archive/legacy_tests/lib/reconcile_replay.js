'use strict';

// 화면에 실제로 뜬 판단을 재생하는 하니스.
//
// 왜 따로 필요한가: 기존 ordlog_replay.js 는 engine.decide() 만 부른다.
// 그런데 사용자가 보는 승인 카드는 그 원시 판단이 아니라
// reconcileSquadExecution(rawV15, squad, locks) 이 만든다(ord_app.js:559).
// 그 사이에 있는 파티 검증 게이트가 0806b 로그에서 판단의 31%(120/387)를
// 막았는데, 재생 지표에는 한 번도 잡히지 않았다 — 재는 곳과 보는 곳이
// 달랐기 때문이다.  은퇴한 CSS 시트를 읽던 계약 테스트와 같은 종류의
// 맹점이라, 같은 방식으로 닫는다: **앱이 하는 순서를 그대로 한다.**
//
//   engine.decide()  →  planFinalSquad()  →  reconcileSquadExecution()
//
// 파티 계획이 없는 라운드(상위 미보유 등)는 앱과 마찬가지로 원시 판단이
// 그대로 화면이 된다.
//
// ── 충실도 한계(반드시 읽을 것) ────────────────────────────────
// 이 하니스는 라이브 앱을 그대로 재현하지 못한다.  실측(15판 기준):
//   · noPartyRounds 가 판당 19~40 라운드 — 상위 잠금이 로그 step 에 실려
//     있지 않거나 아직 상위 미보유라 파티 자체를 못 세운다.  그 라운드는
//     게이트를 아예 지나가지 않는다.
//   · 세운 파티도 앱의 것과 다르다(청사진 upperBlueprint·수동 보정
//     manualCounts·프리뷰 상위를 재생이 복원하지 못한다).  그래서
//     SYNC_BLOCKED('검증된 첫 제작이 최종 파티 목록과 일치하지 않습니다')가
//     실제보다 많이 난다 — 15판 합계 252건.
//   · loadRun 은 라운드당 마지막 판단 1건만 남긴다.  라이브는 초당 폴링이라
//     같은 라운드에서 게이트가 수십 번 켜진다(0806b 로그 실측 120건/19라운드
//     vs 이 하니스 2건/2라운드).
// 결론: **절대 수치를 현실로 인용하지 말 것.**  같은 하니스로 정책 변경
// 전/후를 돌려 비교하는 **델타**로만 쓴다.  게이트 발화의 실제 규모는
// 로그의 decision 이벤트를 전수로 다시 재는 쪽(0806 포렌식 스크립트)이
// 정확하다.

const path=require('path');
const base=require('./ordlog_replay.js');

const num=value=>{const n=Number(value);return Number.isFinite(n)?n:0;};

function coreOf(){return global.ORDCore;}

// ord_app.js v151ComputeParty 의 재생용 최소 재현.  청사진·프리뷰·캐시처럼
// 화면에만 쓰이는 갈래는 뺀다(재생에는 확정 상위 하나만 있으면 된다).
function computeParty(state,settings,upperId,locks){
  const planner=global.ORDSquadPlanner,C=coreOf();
  if(!planner||typeof planner.planFinalSquad!=='function'||!upperId||!state||!state.db)return null;
  const unit=state.db.byId.get(upperId);
  if(!unit||!C.isUpper(unit))return null;
  const mode=C.familyOf(unit)==='magic'?'magic':'physical';
  const plannerSettings=Object.assign({},settings,{mode,upperPreviewId:upperId,preferredLineupIds:[],targetSquadCount:9});
  const scoped=(locks||[]).filter(lock=>!(lock&&lock.stage==='upper'&&C.canonicalUpperId(lock.id)!==C.canonicalUpperId(upperId)));
  try{return planner.planFinalSquad(state,plannerSettings,[upperId],scoped);}
  catch(error){return{error:String(error&&error.message||error)};}
}

// 앱이 파티 상위를 고르는 규칙(ord_app.js:553): 상위 잠금이 있으면 그것,
// 없으면 실제로 보유한 메인 상위.
function partyUpperId(state,locks){
  const C=coreOf();
  const lock=(locks||[]).find(item=>item&&item.stage==='upper'&&item.id);
  if(lock&&lock.id)return String(lock.id);
  const upper=C.mainUpper&&C.mainUpper(state);
  return upper&&num(state.counts[upper.id])>0?String(upper.id):'';
}

// 라운드 하나 — 원시 판단부터 화면 판단까지.
function decideDisplayed(engine,catalog,step,extraSettings,sticky){
  const C=coreOf();
  const settings=Object.assign({_stickyActionId:sticky||''},step.settings,extraSettings||{});
  let raw=null,error=null;
  try{raw=engine.decide({catalog,snapshot:step.snapshot,settings,locks:step.locks});}
  catch(e){return{raw:null,displayed:null,squad:null,error:e&&e.message||String(e)};}
  let state=null;
  try{state=C.normalizeState(catalog,step.snapshot,settings);}
  catch(e){return{raw,displayed:raw,squad:null,error:null,squadError:String(e&&e.message||e)};}
  const upperId=partyUpperId(state,step.locks);
  if(!upperId)return{raw,displayed:raw,squad:null,error,noParty:true};
  const squad=computeParty(state,Object.assign({},settings,{currentRound:step.round}),upperId,step.locks);
  if(!squad||squad.error)return{raw,displayed:raw,squad:null,error,squadError:squad&&squad.error||'no-squad'};
  let displayed=raw;
  try{
    if(engine&&typeof engine.reconcileSquadExecution==='function')
      displayed=engine.reconcileSquadExecution(raw,squad,step.locks||[]);
  }catch(e){return{raw,displayed:raw,squad,error:null,reconcileError:String(e&&e.message||e)};}
  return{raw,displayed,squad,error:null};
}

// 화면 판단 하나에서 게이트 관련 사실만 뽑는다.
function summarizeDisplayed(result,round){
  const d=result&&result.displayed,raw=result&&result.raw;
  if(!d)return{round,error:result&&result.error||'no-decision'};
  const state=String(d.state||''),reason=String(d.reason||'');
  const action=d.action||null,blocked=d.blockedAction||null;
  const evidence=d.evidence||{};
  const gated=/필수 역할을 악화/.test(reason)||Array.isArray(evidence.regressedRequired)&&evidence.regressedRequired.length>0;
  return{
    round,
    state,
    rawState:String(raw&&raw.state||''),
    reason:reason.slice(0,120),
    gated,
    gatedRoles:[].concat(evidence.regressedRequired||[]),
    gateVerdict:String(evidence.regressionVerdict||''),
    hasAction:!!(action&&action.id),
    // v17.28 계약: 막더라도 화면은 비지 않는다.
    hasCard:!!((action&&action.id)||(blocked&&blocked.id)),
    actionName:String(action&&action.name||blocked&&blocked.name||''),
    squadError:String(result.squadError||''),
    reconcileError:String(result.reconcileError||''),
    noParty:!!result.noParty,
  };
}

function replayDisplayed(runOrKey,options){
  const engine=base.loadEngine();
  const catalog=global.ORD_TMO_UNITS;
  const run=typeof runOrKey==='string'?base.loadRun(runOrKey):runOrKey;
  const from=num(options&&options.fromRound)||1;
  const to=num(options&&options.toRound)||Infinity;
  const steps=run.rounds.filter(step=>step.round>=from&&step.round<=to);
  const rows=[];
  let sticky='';
  for(const step of steps){
    const result=decideDisplayed(engine,catalog,step,options&&options.settings,sticky);
    const proposed=result.displayed&&(result.displayed.action||result.displayed.blockedAction);
    if(proposed&&proposed.id)sticky=String(proposed.id);
    const row=summarizeDisplayed(result,step.round);
    if(options&&options.keepDecisions)row.decision=result.displayed;
    if(options&&options.keepSquads)row.squad=result.squad;
    rows.push(row);
  }
  const counted=rows.filter(row=>!row.error);
  const roundsWith=predicate=>[...new Set(counted.filter(predicate).map(row=>row.round))];
  const approved=new Set(roundsWith(row=>row.state==='ACT_NOW'));
  const gateRoles={};
  for(const row of counted)for(const role of row.gatedRoles||[])gateRoles[role]=(gateRoles[role]||0)+1;
  return{
    key:run.key,
    outcome:run.outcome,
    rounds:rows,
    totals:{
      rounds:new Set(counted.map(row=>row.round)).size,
      decisions:counted.length,
      errors:rows.length-counted.length,
      byState:counted.reduce((acc,row)=>{acc[row.state||'-']=(acc[row.state||'-']||0)+1;return acc;},{}),
      // 게이트 실측 — 발화 건수와 그 발자국(라운드).
      gateFirings:counted.filter(row=>row.gated).length,
      gateRounds:roundsWith(row=>row.gated).length,
      // 게이트가 켜졌지만 그 라운드가 결국 승인으로 끝난 경우 = 지연일 뿐.
      gateRoundsRecovered:roundsWith(row=>row.gated).filter(round=>approved.has(round)).length,
      gateRoundsSilent:roundsWith(row=>row.gated).filter(round=>!approved.has(round)).length,
      gateRoles,
      gateVerdicts:counted.reduce((acc,row)=>{if(row.gateVerdict)acc[row.gateVerdict]=(acc[row.gateVerdict]||0)+1;return acc;},{}),
      // 승인이 한 번도 없던 라운드.
      silentRounds:roundsWith(()=>true).filter(round=>!approved.has(round)).length,
      // v17.28: 카드가 통째로 빈 판단(방향 선택 대기는 제외 — 그건 다른 화면이다).
      emptyCards:counted.filter(row=>!row.hasCard&&row.state!=='ROUTE_CHOICE').length,
      squadErrors:counted.filter(row=>row.squadError).length,
      reconcileErrors:counted.filter(row=>row.reconcileError).length,
      noPartyRounds:roundsWith(row=>row.noParty).length,
    },
  };
}

module.exports={replayDisplayed,decideDisplayed,computeParty,partyUpperId,summarizeDisplayed,RUNS:base.RUNS,loadEngine:base.loadEngine,loadRun:base.loadRun};
