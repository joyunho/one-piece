'use strict';

const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const EXT=path.join(ROOT,'archive','legacy_program');
// v19.5(점검 결함): 기본값이 저장소 밖 업로드 파일 + 그 파일 전용 seq 로
// 박혀 있었다 — data/ 최신 ordlog 를 고르고, seq 는 명시 인자일 때만 쓴다.
function latestOrdlog(){
  const dir=path.join(ROOT,'data');
  const logs=fs.existsSync(dir)?fs.readdirSync(dir).filter(name=>name.endsWith('.ordlog.json')).sort():[];
  if(!logs.length)throw new Error('data/*.ordlog.json 이 없습니다 — 로그 경로를 인자로 주세요');
  return path.join(dir,logs[logs.length-1]);
}
const LOG=path.resolve(process.argv[2]||latestOrdlog());
const requestedArg=(process.argv[3]||'').split(',').filter(part=>part.trim()!=='').map(Number).filter(Number.isFinite);

global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of [
  'ord_story_nonupper_data.js','ord_story_upper_data.js','ord_units_data.js',
  'ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js',
  'ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js',
  'ord_meta_stats.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js',
  'ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js'
])require(path.join(EXT,file));

const Compactor=require(path.join(EXT,'ord_run_log_compactor.js'));
const C=global.ORDCore;
const P=global.ORDSquadPlanner;
const E=global.ORDV15Engine;
const App=global.ORDApp.App;
const catalog=global.ORD_TMO_UNITS;
const log=JSON.parse(fs.readFileSync(LOG,'utf8'));
// seq 미지정이면 이 로그의 마지막 스냅샷 4개(대개 실패 직전 구간)를 재생한다.
const requested=requestedArg.length?requestedArg
  :(log.events||[]).filter(event=>event.type==='snapshot').map(event=>Number(event.seq)).slice(-4);
const snapshots=new Map();
let baseline=null;
for(const event of log.events||[]){
  if(event.type!=='snapshot')continue;
  baseline=Compactor.applySnapshotRecord(baseline,event.payload,{digest:false});
  if(requested.includes(Number(event.seq)))snapshots.set(Number(event.seq),{event,state:JSON.parse(JSON.stringify(baseline))});
}

function nextDecision(snapshotEvent){
  const matches=(log.events||[]).filter(event=>event.type==='decision'&&event.snapshotId===snapshotEvent.snapshotId&&event.seq>snapshotEvent.seq);
  return matches[matches.length-1]||null;
}
function makeSnapshot(fixture){
  const compact=fixture.state,ids=new Set([...Object.keys(compact.counts||{}),...Object.keys(compact.progress||{})]);
  return{
    source:'failure-replay',sessionId:'20260727',seq:fixture.event.seq,at:1,dataChangedAt:1,
    counts:Object.assign({},compact.counts||{}),currentAbilities:Object.assign({},compact.currentAbilities||{}),
    wispCountFound:true,wispCount:C.num(compact.counts&&compact.counts[C.WISP_ID]),
    units:[...ids].map(id=>({id,count:Math.max(0,C.num(compact.counts&&compact.counts[id])),tmoPercent:C.num(compact.progress&&compact.progress[id])}))
  };
}
function makeSettings(fixture,record){
  const payload=record&&record.payload||{},input=payload.input||{},route=payload.route;
  return{
    currentRound:fixture.event.round,mode:payload.mode||'magic',
    magicRoute:['dual','singleEnd'].includes(route)?route:'auto',
    postLegendRoute:'upper',gorosei:'saturn',story10Reward:'',
    targetSquadCount:9,targetLegendEquivalent:9,manualCounts:{},
    superKumaOwned:true,wispOverride:'',virtualSpecialId:'',
    virtualSpecialBaselineId:'',virtualSpecialBaselineCount:0,upperResearchLevel:21,
    directionKey:input.directionKey||'',directionStatus:input.directionStatus||'open',
    directionUpperId:input.directionUpperId||'',rerollsUsed:0
  };
}
function locksFrom(record){
  return(record&&record.payload&&record.payload.input&&record.payload.input.locks||[]).map(lock=>({stage:lock.stage,id:lock.id,source:lock.source||'replay',sticky:lock.stage==='upper'}));
}
function rareSummary(decision){
  return(decision&&decision.rare&&decision.rare.rows||[]).map(row=>`${row.name}:${row.initial}/${row.use}/${row.hold}/${row.reroll}`).join(', ');
}

for(const seq of requested){
  const fixture=snapshots.get(seq);
  if(!fixture){console.log(`seq=${seq}\tmissing`);continue;}
  const recorded=nextDecision(fixture.event),snapshot=makeSnapshot(fixture),settings=makeSettings(fixture,recorded),locks=locksFrom(recorded);
  const raw=E.decide({catalog,snapshot,settings,locks});
  let workerDecision=null;
  let directAngles='';
  if(raw.state==='ROUTE_CHOICE'&&Array.isArray(raw.routeCandidateLanes)&&raw.routeCandidateLanes.length){
    const injected={};
    for(const lane of raw.routeCandidateLanes){
      const laneSettings=Object.assign({},settings,{mode:lane.mode,magicRoute:lane.route||lane.key,upperPreviewId:'',preferredLineupIds:[]});
      const ranked=P.rankUpperBlueprints({catalog,snapshot,settings:laneSettings,locks:[],upperMemo:global.ORD_UPPER_MEMO,synergyMemo:global.ORD_SYNERGY_MEMO},{candidateIds:lane.candidateIds})||[];
      injected[lane.key]=Object.fromEntries(ranked.map(row=>[String(row.upperId),row]));
    }
    workerDecision=E.decide({catalog,snapshot,settings:Object.assign({},settings,{_blueprintRankings:injected,_blueprintPlanSync:false}),locks});
    const angleRows=[];
    for(const route of E._test.routeOptions(raw.model)){
      for(const unit of raw.model.knowledge.db.uppers){
        const row=E._test.upperRouteRow(raw.model,unit,route);
        if(!row||row.specialGate||row.storyReward)continue;
        const rareUse=Object.values(row.quote&&row.quote.rareUse||{}).reduce((sum,value)=>sum+C.num(value),0);
        if(rareUse>0)angleRows.push({name:row.name,tier:row.powerTier&&row.powerTier.letter||'?',rareUse,wisp:row.wispCost,route:row.routeKey});
      }
    }
    directAngles=angleRows.sort((a,b)=>b.rareUse-a.rareUse||a.wisp-b.wisp).slice(0,8).map(row=>`${row.name}[${row.tier}:희귀${row.rareUse}:선위${row.wisp}:${row.route}]`).join(' > ');
  }
  let reconciled=raw,squad=null,guarded=raw;
  const upperLock=locks.find(lock=>lock.stage==='upper');
  if(upperLock){
    const state=C.normalizeState(catalog,snapshot,settings);
    squad=P.planAdaptiveFinalSquad({catalog,state,settings:Object.assign({},settings,{upperPreviewId:upperLock.id,preferredLineupIds:[]}),locks,upperBlueprint:null,upperMemo:global.ORD_UPPER_MEMO,synergyMemo:global.ORD_SYNERGY_MEMO},{minTarget:9,maxTarget:11});
    reconciled=E.reconcileSquadExecution(raw,squad,locks);
    const app=Object.create(App.prototype);
    app.state={locks,snapshot,rerollsUsed:0};
    app.actualRound=()=>settings.currentRound;
    guarded=app.v151ProtectRareDecision(reconciled,squad,state);
  }
  const candidateSource=workerDecision&&workerDecision.routeCandidates||raw.routeCandidates||[];
  const candidates=candidateSource.slice(0,8).map(row=>`${row.name}[${row.powerTier&&row.powerTier.letter||'?'}:${row.angleLabel||'미평가'}:희귀${C.num(row.blueprintEvaluation&&row.blueprintEvaluation.rareUsed)}]`).join(' > ');
  console.log([
    `R${fixture.event.round}`,`seq=${seq}`,`recorded=${recorded&&recorded.payload&&recorded.payload.v15&&recorded.payload.v15.action&&recorded.payload.v15.action.id||'-'}`,
    `raw=${raw.action&&raw.action.id||raw.state}`,`prefix=${squad&&squad.safePrefix&&squad.safePrefix.actions&&squad.safePrefix.actions[0]&&squad.safePrefix.actions[0].id||'-'}`,
    `fixed=${guarded.action&&guarded.action.id||guarded.state}`,candidates&&`candidates=${candidates}`,directAngles&&`directAngles=${directAngles}`,rareSummary(guarded)&&`rare=${rareSummary(guarded)}`
  ].filter(Boolean).join('\t'));
}
