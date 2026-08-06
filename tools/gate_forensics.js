'use strict';
// 회귀 게이트(reconcileSquadExecutionRaw) 발화 실측 도구.
//
// 사용: node tools/gate_forensics.js
//
// 왜 별도 도구인가: 게이트는 engine.decide() 안이 아니라
// reconcileSquadExecution 안에 있어서 tests/lib/ordlog_replay.js 의
// replayRun 으로는 보이지 않는다.  게다가 라이브 앱은 초당 폴링이라 한
// 라운드에서 게이트가 수십 번 켜지는데 replayRun 은 라운드당 1판단만
// 본다(0806b 실측 120건/19라운드 vs 재생 2건/2라운드).
// 그래서 이 도구는 로그의 decision 이벤트를 **전건** 복원하고(스냅샷
// 델타 접기 + stabilizeFinalUnits), 발화 시점마다 M.build → L.quote(파티
// 첫 제작) → P.evaluate(before/after) 를 게이트와 같은 인자로 다시 돌린다.
//
// 대조 검증: 재계산한 before 를 로그에 기록된 역할표와 항목별로 맞춰 본다
// (v20.3 작업 시 173건 중 169건이 소수점까지 일치했다).  이 대조가 깨지면
// 설정 복원이 틀린 것이므로 수치를 믿으면 안 된다.
//
// 설정 복원에서 실제로 틀렸다가 고친 것(이것 없이는 전부 어긋난다):
//  · 고로세이 — 로그 시작 전에 이미 켜져 있으면 setting-change 이벤트가
//    없다.  역할표 target 으로 역산한다.
//  · 연구소(labResearch) — 앱 기본값이 4종 전부 on 이고 이감 +10 이다.
//  · 가상 특별(virtualSpecialId) — 켰다가 실제 관측 후 해제되므로 미적용.

const fs=require('fs');
const path=require('path');
const REPLAY=require('/home/user/one-piece/tests/lib/ordlog_replay.js');
const EXT='/home/user/one-piece/ord_tmo_auto_extension_v15_0_0_rebuild';
REPLAY.loadEngine();
const C=global.ORDCore,M=global.ORDV15Model,L=global.ORDV15Ledger,P=global.ORDV15Policy;
const Compactor=require(path.join(EXT,'ord_run_log_compactor.js'));
const WISP_ID=REPLAY.WISP_ID,CATALOG=global.ORD_TMO_UNITS;
const GATE_RE=/최종 파티 첫 제작이 현재 필수 역할을 악화시킵니다/;
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};

// 로그의 역할표 target 으로 고로세이를 역산한다(설정 이벤트가 로그 시작
// 전에 이미 켜져 있으면 setting-change 가 없다 — A판이 그렇다).
function goroseiFromTargets(req){
  const slow=(req||[]).find(r=>r.key==='slow'),armor=(req||[]).find(r=>r.key==='armor');
  if(!slow||!armor)return null;
  if(num(slow.target)===117)return 'nasjuro';
  if(num(armor.target)===195)return 'warcury';
  return 'none';
}

function loadEvents(file){
  const log=JSON.parse(fs.readFileSync(file,'utf8'));
  const events=(log.events||[]).slice().sort((a,b)=>num(a.seq)-num(b.seq));
  const db=C.buildDb(CATALOG);
  let baseline=null,guard=null,populated=false,ended=false;
  let gorosei='none',virtualSpecialId='';
  const rows=[];
  for(const event of events){
    if(event.type==='snapshot'){
      baseline=Compactor.applySnapshotRecord(baseline,event.payload,{digest:false});
      const has=Object.values(baseline&&baseline.counts||{}).some(v=>num(v)>0);
      if(has)populated=true;else if(populated)ended=true;
      continue;
    }
    if(ended)continue;
    if(event.type==='user-action'){
      const p=event.payload||{};
      if(p.action==='setting-change'&&p.key==='gorosei')gorosei=String(p.after||'none');
      if(p.action==='setting-change'&&p.key==='virtualSpecialId')virtualSpecialId=String(p.after||'');
      continue;
    }
    if(event.type!=='decision'||!baseline)continue;
    const payload=event.payload||{};
    const round=Math.max(1,num(payload.round)||num(event.round));
    const input=payload.input||{};
    const logged=((payload.v15||{}).assessment||{}).requirements||[];
    const inferred=goroseiFromTargets(logged);
    const rawCounts=Object.assign({},baseline.counts);
    let counts=rawCounts;
    if(C.stabilizeFinalUnits){
      const fixed=C.stabilizeFinalUnits(guard,rawCounts,db,{});
      guard={counts:Object.assign({},fixed.counts),misses:fixed.misses};
      counts=fixed.counts;
    }
    const progress=Object.assign({},baseline.progress);
    const ids=new Set([...Object.keys(counts),...Object.keys(progress)]);
    rows.push({
      seq:num(event.seq),round,payload,counts,
      loggedRequirements:logged,
      snapshot:{source:'ordlog-replay',sessionId:String(log.runId||'replay'),seq:num(event.seq),at:1,dataChangedAt:1,
        wispCountFound:Object.prototype.hasOwnProperty.call(counts,WISP_ID),wispCount:num(counts[WISP_ID]),counts,
        currentAbilities:Object.assign({},baseline.currentAbilities),
        units:[...ids].map(id=>({id,count:num(counts[id]),tmoPercent:num(progress[id])}))},
      settings:{currentRound:round,mode:String(payload.mode||'physical'),magicRoute:String(input.directionKey||''),
        postLegendRoute:String(input.postLegendRoute||''),gorosei:inferred||gorosei,
        virtualSpecialId:'',superKumaOwned:true,
        // 앱 기본값(ord_app.js:34) — 연구소 4종 풀 강화 가정.  이감 +10 이
        // 여기서 나온다(미반영 시 재계산 이감이 로그보다 정확히 10 낮았다).
        labResearch:{attack:true,slow:true,hpRegen:true,mpRegen:true,round:null},
        upperResearchLevel:1,allowWarped:true,recommendWarped:true,targetSquadCount:9},
      locks:(input.locks||[]).map(l=>({stage:String(l.stage||'upper'),id:String(l.id||''),name:String(l.name||''),source:String(l.source||'v15-exact-route')}))
    });
  }
  return{runId:String(log.runId||''),file,rows};
}

function routeFor(step){
  const key=String(step.payload.route||'');
  if(P.ROUTES[key])return P.ROUTES[key];
  if(String(step.payload.mode||'')==='physical')return P.ROUTES.physical;
  return P.ROUTES[String(step.settings.magicRoute||'')]||null;
}
// 역할 key 가 route 의 몇 번째 우선순위 그룹인가(0이 최우선).
function groupIndex(route,key){
  const groups=route&&route.groups||[];
  for(let i=0;i<groups.length;i++)if(groups[i].includes(key))return i;
  return groups.length;
}

function measure(step){
  const payload=step.payload,v15=payload.v15||{},squad=payload.squad||{};
  const prefix=(squad.safePrefix&&squad.safePrefix.actions||[]),planned=prefix[0]||null;
  const out={seq:step.seq,round:step.round,ok:false,note:'',
    plannedId:String(planned&&planned.id||''),plannedName:String(planned&&planned.name||''),
    loggedReason:String(v15.reason||'')};
  if(!planned||!planned.id){out.note='safePrefix.actions 로그 미기록';return out;}
  const model=M.build({catalog:CATALOG,snapshot:step.snapshot,settings:step.settings,locks:step.locks});
  const unit=model.knowledge.db.byId.get(out.plannedId);
  if(!unit){out.note='카탈로그 미확인';return out;}
  const route=routeFor(step);
  if(!route){out.note='경로 미확인';return out;}
  const quote=L.quote(model,unit,model.effective.counts,{availableRound:model.round.value});
  if(!quote||!quote.feasible){out.note='재견적 불가';return out;}
  const locks=step.locks;
  const before=P.evaluate(model,model.effective.counts,route,{round:model.round.value,locks});
  const after=P.evaluate(model,quote.after,route,{round:model.round.value,locks});
  // 대조 검증: 재계산한 before 가 로그에 기록된 역할표와 같은가
  const loggedBy=new Map((step.loggedRequirements||[]).map(r=>[String(r.key),r]));
  let cmpRows=0,cmpMatch=0,worstDiff=0;
  for(const row of before.requirements||[]){
    const lg=loggedBy.get(String(row.key));if(!lg)continue;
    cmpRows++;
    const d=Math.max(Math.abs(num(lg.current)-num(row.current)),Math.abs(num(lg.target)-num(row.target)),Math.abs(num(lg.gap)-num(row.gap)));
    if(d<=0.01)cmpMatch++;else worstDiff=Math.max(worstDiff,d);
  }
  out.verifyRows=cmpRows;out.verifyMatch=cmpMatch;out.verifyWorstDiff=worstDiff;
  const afterBy=new Map((after.requirements||[]).map(r=>[r.key,r]));
  const req=(before.requirements||[]).filter(r=>r.required!==false&&!r.waived);
  const worse=[],better=[];
  for(const row of req){
    const next=afterBy.get(row.key);if(!next)continue;
    const d=num(next.gap)-num(row.gap),target=Math.max(.01,num(row.target));
    const item={key:row.key,label:row.label,target:num(row.target),gapBefore:num(row.gap),gapAfter:num(next.gap),
      curBefore:num(row.current),curAfter:num(next.current),delta:d,pct:Math.abs(d)/target*100,group:groupIndex(route,row.key)};
    if(d>.005)worse.push(item);else if(d<-.005)better.push(item);
  }
  out.ok=true;out.worse=worse;out.better=better;
  out.lossPct=worse.reduce((t,r)=>t+r.pct,0);
  out.gainPct=better.reduce((t,r)=>t+r.pct,0);
  out.netPct=out.gainPct-out.lossPct;
  out.recomputedLabels=worse.map(r=>r.label).join(' · ');
  out.loggedLabels=(out.loggedReason.split(':')[1]||'').trim();
  out.labelMatch=out.recomputedLabels===out.loggedLabels;
  // 이미 닫혀 있던 역할을 깨는가(gapBefore==0) vs 이미 열린 역할을 더 벌리는가
  out.breaksClosed=worse.some(r=>r.gapBefore<=1e-9);
  out.worstGroup=worse.length?Math.min(...worse.map(r=>r.group)):null;
  out.bestGainGroup=better.length?Math.min(...better.map(r=>r.group)):null;
  // 정책 자신의 사전식 벡터로 본 개선 여부
  out.policyImproved=P.improved(before,after);
  out.checkpointVectorCmp=P.compareVector(after.checkpointVector,before.checkpointVector);
  out.fullVectorCmp=P.compareVector(after.fullVector,before.fullVector);
  out.structuralBefore=before.structuralPass;out.survivalBefore=before.survivalPass;
  out.legendEqBefore=num(before.actual&&before.actual.legendEquivalent);
  out.legendEqAfter=num(after.actual&&after.actual.legendEquivalent);
  // 계획 완성 시점(roleCoverage.planned)
  const plannedRows=new Map(((squad.roles||{}).rows||[]).map(r=>[String(r.key),r]));
  out.plannedClose=worse.map(r=>{const row=plannedRows.get(r.key);
    return{key:r.key,label:r.label,recorded:!!row,plannedGap:row?num(row.gap):null,plannedCurrent:row?num(row.current):null,plannedTarget:row?num(row.target):null,closed:row?num(row.gap)<=1e-9:null};});
  out.plannedRowsAll=[...plannedRows.values()].map(r=>({key:String(r.key),gap:num(r.gap),current:num(r.current),target:num(r.target),required:r.required!==false}));
  out.plannedComplete=(squad.roles||{}).complete===true;
  out.plannedReadiness=num((squad.roles||{}).readiness);
  out.plannedCount=num((squad.counts||{}).planned);out.targetCount=num((squad.counts||{}).target);
  // 마감
  const cur=(squad.timeline||{}).currentCheckpoint||{};
  out.checkpointKey=String(cur.key||'');out.checkpointDue=num(cur.dueRound);
  out.roundsToCheckpoint=cur.dueRound?num(cur.dueRound)-step.round:null;
  out.checkpointStatus=String(cur.status||'');
  out.roundsToBoss50=50-step.round;
  // 대안
  const prop=v15.proposed||null;
  out.rawProposalId=String(prop&&prop.id||'');out.rawProposalName=String(prop&&prop.name||'');
  out.rawProposalResult=String(prop&&prop.result||'');out.rawProposalFeasible=!!(prop&&prop.feasible);
  out.rawSameAsPlanned=out.rawProposalId===out.plannedId;
  out.recoveryTargets=((v15.recovery||{}).targets||[]).map(t=>({id:String(t.id||''),name:String(t.name||''),roleKey:String(t.roleKey||''),feasible:!!t.feasible,wispCost:num(t.wispCost),wispGap:num(t.wispGap)}));
  out.recoveryFeasibleCount=out.recoveryTargets.filter(t=>t.feasible).length;
  out.recoveryCoversRegressed=out.recoveryTargets.some(t=>t.feasible&&worse.some(w=>w.key===t.roleKey));
  out.altCount=(v15.alternatives||[]).length;
  out.prefixLen=prefix.length;
  out.state=String(v15.state||'');
  out.wispAvailable=num((payload.input||{}).selectionWisp);
  out.wispCost=num(quote.wisp&&quote.wisp.cost);
  out.rareUse=Object.values(quote.rareUse||{}).reduce((t,v)=>t+num(v),0);
  return out;
}

function main(){
  const runs=[
    {key:'A',label:'0806a ORD_2310_20260806_125925',file:'/home/user/one-piece/data/ORD_2310_20260806_125925_active.ordlog.json'},
    {key:'B',label:'0806b ORD_2310_20260806_134555',file:'/home/user/one-piece/data/ORD_2310_20260806_134555_active.ordlog.json'}
  ];
  const out={runs:{},all:[]};
  for(const run of runs){
    const loaded=loadEvents(run.file);
    const rows=[];
    for(const step of loaded.rows){
      if(!GATE_RE.test(String(step.payload.v15&&step.payload.v15.reason||'')))continue;
      let m;try{m=measure(step);}catch(e){m={seq:step.seq,round:step.round,ok:false,note:'예외 '+String(e&&e.message||e)};}
      m.run=run.key;rows.push(m);out.all.push(m);
    }
    // 라운드별 상태
    const byRound=new Map();
    for(const r of loaded.rows){
      const st=String(r.payload.v15&&r.payload.v15.state||'');
      const g=GATE_RE.test(String(r.payload.v15&&r.payload.v15.reason||''));
      if(!byRound.has(r.round))byRound.set(r.round,{round:r.round,total:0,act:0,gate:0});
      const b=byRound.get(r.round);b.total++;if(st==='ACT_NOW')b.act++;if(g)b.gate++;
    }
    // 막힌 유닛의 이후 취득 시점 + 역할 궤적
    const acquired=new Map();
    for(const r of loaded.rows)for(const [id,v] of Object.entries(r.counts||{}))
      if(num(v)>0&&!acquired.has(id))acquired.set(id,r.round);
    const trajectory=new Map(); // key -> [{round,current,target,gap}]
    for(const r of loaded.rows){
      for(const row of r.loggedRequirements||[]){
        if(!trajectory.has(row.key))trajectory.set(row.key,[]);
        const arr=trajectory.get(row.key);
        if(!arr.length||arr[arr.length-1].round!==r.round)arr.push({round:r.round,current:num(row.current),target:num(row.target),gap:num(row.gap)});
        else{const last=arr[arr.length-1];last.current=num(row.current);last.gap=num(row.gap);last.target=num(row.target);}
      }
    }
    const last=loaded.rows[loaded.rows.length-1];
    out.runs[run.key]={label:run.label,runId:loaded.runId,decisions:loaded.rows.length,rounds:byRound.size,
      gateEvents:rows.length,gateRounds:[...new Set(rows.map(r=>r.round))].sort((a,b)=>a-b),
      roundsNoApproval:[...byRound.values()].filter(b=>b.act===0).map(b=>b.round).sort((a,b)=>a-b),
      roundsNoApprovalWithGate:[...byRound.values()].filter(b=>b.act===0&&b.gate>0).map(b=>b.round).sort((a,b)=>a-b),
      roundsWithGate:[...byRound.values()].filter(b=>b.gate>0).map(b=>b.round).sort((a,b)=>a-b),
      finalRound:last.round,
      finalRequirements:(last.loggedRequirements||[]).map(r=>({key:r.key,label:r.label,current:num(r.current),target:num(r.target),gap:num(r.gap)})),
      acquired:Object.fromEntries([...acquired.entries()]),
      trajectory:Object.fromEntries([...trajectory.entries()]),
      rows};
  }
  fs.writeFileSync('/tmp/ord_gate_rows.json',JSON.stringify(out,null,1));
  for(const [k,m] of Object.entries(out.runs)){
    const ok=m.rows.filter(r=>r.ok);
    const verified=ok.filter(r=>r.verifyRows>0&&r.verifyMatch===r.verifyRows).length;
    const labels=ok.filter(r=>r.labelMatch).length;
    console.log(`# ${k} ${m.label} 판단 ${m.decisions} 라운드 ${m.rounds} 게이트 ${m.gateEvents} 재현 ${ok.length} 역할표대조전항일치 ${verified} 라벨일치 ${labels}`);
    const bad=ok.filter(r=>r.verifyMatch!==r.verifyRows);
    if(bad.length)console.log('  대조 불일치 표본:',bad.slice(0,5).map(r=>`r${r.round} worst=${Math.round(r.verifyWorstDiff*100)/100}`).join(' '));
  }
}
if(require.main===module)main();
module.exports={loadEvents,measure,routeFor,main};
