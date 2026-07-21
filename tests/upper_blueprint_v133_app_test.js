'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_app.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const App=global.ORDApp.App;
const T=global.ORDApp._test;

let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

check('confirmed blueprint normalization preserves duplicate final units and exact build order',()=>{
  const value=T.normalizeUpperBlueprint({upperId:'F90H',lineupIds:['F90H','A40h','A40h','B40h'],buildOrderIds:['A40h','A40h','F90H'],mode:'physical',magicRoute:'physical',revision:4});
  assert.deepStrictEqual(value.lineupIds,['F90H','A40h','A40h','B40h']);
  assert.deepStrictEqual(value.buildOrderIds,['A40h','A40h','F90H']);
  assert.strictEqual(value.revision,4);
});

check('first-Rare phase renders no separate next-preparation panel',()=>{
  const app=Object.create(App.prototype);
  assert.strictEqual(typeof app.renderPrep,'undefined');
  assert(!fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8').includes('다음 준비'));
});

check('no arbitrary weighted-party panel appears before an upper preview or confirmation',()=>{
  const app=Object.create(App.prototype);
  app.state={upperPreviewId:'',locks:[],currentRound:25,roundStartedAt:0,roundPrepSeconds:10,roundNormalSeconds:35,roundBossSeconds:60};
  assert.strictEqual(app.renderSquadPlan({},{}),'');
});

check('preview capture requires a role-complete blueprint that fits the shared hand and wisp budget',()=>{
  const app=Object.create(App.prototype);
  app.state={mode:'magic',upperBlueprint:null,snapshot:{dataHash:'hand-25'}};
  const valid={mode:'magic',magicRoute:'dual',targetCount:9,targetBoardCount:5,plannedCount:9,finalLineup:['090H','760h','A','B','C'].map(id=>({id})),actions:[{id:'760h'},{id:'090H'}],roleCoverage:{planned:{complete:true}},handFit:{feasible:true},wispBudget:{fullPartyFeasible:true}};
  const captured=app.captureUpperBlueprint('090H',valid);
  assert.deepStrictEqual(captured.lineupIds,['090H','760h','A','B','C']);
  assert.deepStrictEqual(captured.buildOrderIds,['760h','090H']);
  assert.strictEqual(captured.capturedFingerprint,'hand-25');
  assert.strictEqual(captured.magicRoute,'dual');
  assert.strictEqual(app.captureUpperBlueprint('090H',Object.assign({},valid,{wispBudget:{fullPartyFeasible:false}})),null,'an over-budget party was confirmable');
  assert.strictEqual(app.captureUpperBlueprint('090H',Object.assign({},valid,{handFit:{feasible:true,futurePending:[{id:'missing-future-rare'}]},wispBudget:{fullPartyFeasible:false}})),null,'a future-drop reference was persisted as a confirmed party');
  assert.strictEqual(app.captureUpperBlueprint('090H',Object.assign({},valid,{handFit:{feasible:false}})),null,'a hand-conflicted party was confirmable');
  assert.strictEqual(app.captureUpperBlueprint('090H',Object.assign({},valid,{roleCoverage:{planned:{complete:false}}})),null);
  const draft=app.captureUpperCommitment('090H','magic','dual');
  assert.deepStrictEqual(draft.lineupIds,['090H']);
  assert.strictEqual(draft.fullPartyVerified,false);
  assert.strictEqual(draft.commitment,'upper-route');
  assert.strictEqual(draft.adaptiveSupports,true);
  const plannerDraft=global.ORDSquadPlanner._test.normalizeBlueprint({upperBlueprint:draft},{},{db:C.buildDb(global.ORD_TMO_UNITS)});
  assert.strictEqual(plannerDraft.fullPartyVerified,false);
  assert.strictEqual(plannerDraft.commitment,'upper-route');
  const metadata=global.ORDSquadPlanner._test.blueprintMetadata({db:C.buildDb(global.ORD_TMO_UNITS)},plannerDraft,{});
  assert.deepStrictEqual([metadata.status,metadata.fullPartyVerified,metadata.adaptiveSupports],['draft',false,true]);
});

check('upper rows expose both preview and confirmation controls plus whole-hand metrics',()=>{
  const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(source.includes('data-act="select-upper"'));
  assert(source.includes('data-act="confirm-upper"'));
  assert(source.includes('plan.directionBoard=board'));
  assert(source.includes('exactConfirmable'));
  assert(source.includes('containsPreviewUpper'));
  assert(source.includes('settings.currentRound>=25'));
  assert(source.includes('상위 방향을 먼저 잠급니다. 보조 조합은 패가 바뀔 때마다 가변 재계산합니다.'));
  assert(source.includes('전체 패 적합도 기준 상위 후보'));
  assert(source.includes('희귀·특별·안흔함만 표시'));
  assert(!source.includes('희귀·특별·안흔·흔함'));
});

check('future-drop 보조안은 상위 방향 잠금을 막지 않고 adaptive draft로 저장된다',()=>{
  const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(source.includes('futurePendingCount'));
  assert(source.includes('이 9기 목록은 미래 역할 참고안입니다.'));
  assert(source.includes('captureUpperCommitment'));
  assert(source.includes('fullPartyVerified:false'));
  assert(source.includes("commitment:'upper-route'"));
  assert(source.includes('상위·조합 방향 확정은 25라운드부터'));
  assert(source.includes('재료 계통 충돌'));
  assert(source.includes('lineupIds.length<targetBoard||plannedEquivalent<targetEquivalent||!planned.complete'));
  assert(source.includes("this.state.gorosei==='nasjuro'?117:102"));
  assert(source.includes('스턴 1.5는 후순위 보강'));
  assert(source.includes('초과분 가점 0'));
  assert(source.includes('초과 미적용'));
  assert(source.includes("capped?'유효 ':''"));
  assert.strictEqual(C.GOROSEI.none.slowPhysical,102);
  assert.strictEqual(C.GOROSEI.warcury.slowPhysical,102);
  assert.strictEqual(C.GOROSEI.saturn.slowPhysical,102);
  assert.strictEqual(C.GOROSEI.nasjuro.slowPhysical,117);
});

check('planner ranking cache key follows the real hand and excludes heartbeat timestamps',()=>{
  const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(source.includes('this._upperRankCacheKey'));
  assert(source.includes("rankKey=[fingerprint(this.state.snapshot),JSON.stringify(rankInputs)].join('|')"));
  assert(!/rankInputs=\{[^}]*liveAt/.test(source));
});

check('25라 incomplete 보조안도 상위 방향 자체는 확정한다',()=>{
  const db=C.buildDb(global.ORD_TMO_UNITS),unit=db.uppers.find(candidate=>C.familyOf(candidate)==='physical');
  assert(unit,'physical upper fixture missing');
  const squad={mode:'physical',magicRoute:'physical',targetCount:9,targetBoardCount:7,plannedCount:4,finalLineup:[{id:unit.id}],actions:[],roleCoverage:{planned:{complete:false}},handFit:{feasible:false},wispBudget:{fullPartyFeasible:false}};
  const app=Object.create(App.prototype);app.state=Object.assign(T.normalizeInitialState({}),{snapshot:{dataHash:'incomplete-25',counts:{},at:1000},currentRound:25,roundStartedAt:0,locks:[],upperBlueprint:null,upperPreviewId:unit.id,purpose:'upper',upperDetection:{}});app._squadCacheKey='cached';app._squadCache=squad;app.plan=()=>({state:{db},plan:{upperRankings:[],squadPlan:squad}});app.persist=()=>{};app.toast=message=>{app.lastToast=message;};
  app.act('confirm-upper',{dataset:{id:unit.id}});
  assert.strictEqual(app.upperLock().id,unit.id);
  assert.strictEqual(app.upperLock().source,'manual-route');
  assert.strictEqual(app.state.upperBlueprint.fullPartyVerified,false);
  assert.strictEqual(app.state.upperBlueprint.commitment,'upper-route');
  assert.match(app.lastToast,/30라 전후에는 이 상위를 먼저/);
});

check('real upper phase loads three worker-computed lanes, then previews and confirms only the selected upper',()=>{
  const catalog=global.ORD_TMO_UNITS,db=C.buildDb(catalog),counts={[C.WISP_ID]:45,V20h:1};
  for(const unit of catalog){if(C.isCommon(unit))counts[unit.id]=14;else if(C.isUncommon(unit))counts[unit.id]=7;else if(C.isSpecialTier(unit))counts[unit.id]=4;}
  for(const id of Object.keys(C.SPECIAL_IDS))counts[id]=4;
  for(const unit of db.rares.slice(0,8))counts[unit.id]=C.num(counts[unit.id])+1;
  const physicalUppers=db.uppers.filter(unit=>C.familyOf(unit)==='physical').slice(0,8),units=physicalUppers.map((unit,index)=>({id:unit.id,tmoPercent:96-index}));
  const app=Object.create(App.prototype),base=T.normalizeInitialState({mode:'',currentRound:25,postLegendRoute:'upper'});
  app.catalog=catalog;app.config={source:'standalone-manual'};app.state=Object.assign({},base,{snapshot:{dataHash:'upper-hand-cache',at:Date.now(),counts,units,currentAbilities:{}},manualCounts:{},pendingCounts:{},pendingAt:{},pendingTransaction:null,locks:[],upperBlueprint:null,upperDetection:{},watchStability:{},upperPreviewId:'',purpose:'',roundStartedAt:0,currentRound:25});app._squadCacheKey='';app._squadCache=null;app._upperRankCacheKey='';app._upperRankCache=[];app._directionRankCacheKey='';app._directionRankCache=null;app._directionDesiredKey='';app._directionRankSeq=0;app._directionRankTimer=0;app._directionWorker=null;app._directionInFlight=null;app._directionWorkerDisabled=false;
  const original=global.ORDSquadPlanner.rankDeckDirections;let calls=0;global.ORDSquadPlanner.rankDeckDirections=function(...args){calls++;return original.apply(this,args);};
  try{
    const loading=app.plan();assert.strictEqual(loading.plan.purpose,'upper');assert.strictEqual(loading.plan.directionBoard.loading,true);assert.strictEqual(calls,0,'the main thread synchronously ranked every upper');clearTimeout(app._directionRankTimer);app._directionRankTimer=0;
    const workerBoard=original({catalog,state:app.normalized(),settings:app.settings(),locks:[]},{perLane:2,candidateCap:8});app._directionRankCacheKey=app._directionDesiredKey;app._directionRankCache=workerBoard;
    const first=app.plan(),lanes=first.plan.directionBoard&&first.plan.directionBoard.lanes||[];assert(first.plan.upperBlueprintRanked);assert.deepStrictEqual(lanes.map(lane=>lane.key),['physical','dual','singleEnd']);assert(lanes.every(lane=>lane.rows.length>0));assert(first.plan.upperRankings.length<=6);assert(!first.plan.squadPlan,'a free squad was produced before choosing a direction');
    const second=app.plan();assert.strictEqual(calls,0,'same hand reran direction blueprints on the main thread');assert.deepStrictEqual(second.plan.upperRankings.map(row=>`${row.directionKey}:${row.upperId}`),first.plan.upperRankings.map(row=>`${row.directionKey}:${row.upperId}`));
    const selected=lanes.find(lane=>lane.key==='physical').rows[0],selectedUpperId=selected.upperId;app.state.directionStatus='preview';app.state.directionKey='physical';app.state.directionUpperId=selectedUpperId;app.state.mode='physical';app.state.magicRoute='auto';app.state.upperPreviewId=selectedUpperId;app.state.purpose='upper';app._squadCacheKey='';const preview=app.plan(),previewIds=preview.plan.squadPlan&&preview.plan.squadPlan.finalLineup.map(row=>row.id);assert(preview.plan.squadPlan&&previewIds.length===7,'selected upper did not open its seven-board/nine-equivalent preview');assert.strictEqual(preview.plan.squadPlan.targetBoardCount,7);assert.strictEqual(preview.plan.squadPlan.plannedCount,9);assert(previewIds.includes(selectedUpperId),'adaptive preview released the selected Upper');assert.strictEqual(preview.plan.squadPlan.roleCoverage.planned.complete,true);assert.strictEqual(preview.plan.squadPlan.blueprint.active,false,'preview was persisted before confirmation');
    app.persist=()=>{};app.toast=message=>{app.lastToast=message;};app.act('confirm-upper',{dataset:{id:app.state.upperPreviewId}});assert(app.upperLock(),'confirmed upper was not locked');assert(app.state.upperBlueprint&&app.state.upperBlueprint.lineupIds.length===7,'confirmed seven-board preview party was not persisted');assert.deepStrictEqual(app.state.upperBlueprint.lineupIds,previewIds,'confirmation did not persist the party actually shown in preview');assert.strictEqual(app.state.upperPreviewId,'');assert.strictEqual(app.state.purpose,'spec');const followed=app.plan();assert(followed.plan.squadPlan.blueprint.active,'confirmed party was not passed back into adaptive planning');
  }finally{global.ORDSquadPlanner.rankDeckDirections=original;}
});

console.log(`\n${checks}/${checks} v14.0.0 upper-blueprint app checks passed.`);
