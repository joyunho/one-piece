'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

class MemoryStorage{
  constructor(){this.map=new Map();}
  getItem(key){return this.map.has(key)?this.map.get(key):null;}
  setItem(key,value){this.map.set(key,String(value));}
  removeItem(key){this.map.delete(key);}
}

(async()=>{
  const storage=new MemoryStorage();global.localStorage=storage;global.window=global;
  for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_run_log_compactor.js','ord_run_log.js','ord_app.js'])require(path.join(EXT,file));
  const C=global.ORDCore,Log=global.ORDRunLog,App=global.ORDApp.App,app=Object.create(App.prototype),snapshot={at:1000,dataChangedAt:1000,seq:1,unitCount:global.ORD_TMO_UNITS.length,wispCount:2,wispCountFound:true,collection:{confidence:1},counts:{'300h':5,'Z10h':1,[C.WISP_ID]:2},currentAbilities:{'방어력 감소':10},units:[{id:'Z10h',tmoPercent:63}]};
  Object.assign(app,{root:{querySelectorAll:()=>[]},catalog:global.ORD_TMO_UNITS,config:{source:'test'},state:{snapshot,manualCounts:{},pendingCounts:{},pendingAt:{},pendingTransaction:null,wispOverride:'',virtualSpecialId:'',locks:[],directionStatus:'open',directionKey:'',directionUpperId:'',postLegendRoute:'',currentRound:25,roundStartedAt:0,roundPrepSeconds:10,roundNormalSeconds:35,roundBossSeconds:60},_runLogReady:true,_runLogBaseline:null,_runLogLastDecisionDigest:'',runLog:Log.createRecorder({indexedDB:false,storage,keyPrefix:'appIntegration',flushDelayMs:5000})});
  app.actualRound=()=>25;await app.runLog.ready();app.runLog.startRun({startedAt:0,nonce:'app-integration'});
  const first=app.recordAcceptedSnapshot(snapshot,null,true);assert(first&&first.added,'accepted snapshot was not logged');assert.strictEqual(app.recordAcceptedSnapshot(snapshot,snapshot,false),null,'same snapshot produced a second log event');
  const state=C.normalizeState(global.ORD_TMO_UNITS,snapshot,{manualCounts:{}}),unit=state.db.byId.get('930h'),pack={state,settings:{currentRound:25,mode:'physical',magicRoute:'auto'},plan:{purpose:'upper',mode:'physical',actions:[{unit,progress:70,feasible:true,solve:{wispCost:1,rareUse:{Z10h:1},consumed:{Z10h:1}},why:{headline:'현재 패에서 가장 가까운 보강'}}],watch:[],deficits:{readiness:20,requirements:[{key:'armor',label:'상시 풀방깎',current:10,target:180,gap:170,required:true}]}}};
  assert(app.captureRunDecision(pack,true).added,'compact recommendation was not logged');app.recordAuditAction({actor:'user',action:'mark-made',targetId:unit.id});
  const summary=app.runLog.summary();assert.strictEqual(summary.eventTypes.snapshot,1);assert.strictEqual(summary.eventTypes.decision,1);assert.strictEqual(summary.eventTypes['user-action'],1);assert.deepStrictEqual(app.runLog.currentRun.events.map(event=>event.source),['tmo','system','user']);const savedBaseline=app._runLogBaseline;app._runLogBaseline=null;assert.strictEqual(app.captureRunDecision(pack,true),null,'a decision without an accepted snapshot baseline must not be logged');app._runLogBaseline=savedBaseline;const exported=app.runLog.exportJson();assert(!/https?:\/\//.test(exported));assert(!/production-|commands|chat.command/i.test(exported));assert(exported.includes('상시 풀방깎'));
  Object.assign(app,{_runLogHistory:[],_runLogSelectedRun:null,_runLogSelectedId:'',_runLogFilter:'all',_runResultOpen:true,_runResultDraft:{kind:'r50_failed',failureReason:'unknown',round:'50',bossHpPercent:'18',attackUpgrade:'',slowUpgrade:'',hpRegenUpgrade:'',mpRegenUpgrade:'',helperUsed:false,note:'라인 안정'}});app.health=()=>({ready:true,key:'ok',label:'정상 연동',ageSec:1});
  const timelineHtml=app.renderRunLog(state,pack.plan,app.health()),resultHtml=app.renderRunResultModal(app.health());assert(timelineHtml.includes('다음 추천'));assert(timelineHtml.includes('상시 풀방깎'));assert(resultHtml.includes('보스 남은 체력 %'));assert(resultHtml.includes('JSON 자동 저장'));app._runResultSaving=true;const beforeGuard=app.runLog.summary().eventCount;await app.saveRunOutcome();assert.strictEqual(app.runLog.summary().eventCount,beforeGuard,'double result save must be ignored');app._runResultSaving=false;app.runLog.endRun('failed');app._runResultOpen=true;let guardToast='';app.toast=message=>{guardToast=message;};await app.saveRunOutcome();assert.strictEqual(app.runLog.summary().eventCount,beforeGuard,'an outcome must not be appended to an ended run');assert(guardToast.includes('종료된 기록'));
  await app.runLog.destroy();

  const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8'),helper=fs.readFileSync(path.join(EXT,'ord_helper.html'),'utf8');
  assert(!source.includes('data-tab="runlog"'),'single-screen UI revived the legacy run-log tab');
  for(const marker of ['data-region="game-recording"','판단 녹화 중','data-act="run-log-export"','data-act="run-result-open"','50라 실패','50라 보스 처치','51~65라 실패','65라 클리어','data-run-field="bossHpPercent"','data-run-field="attackUpgrade"','data-run-field="helperUsed"'])assert(source.includes(marker),`run-log UI marker missing: ${marker}`);
  assert(helper.indexOf('ord_run_log_compactor.js')<helper.indexOf('ord_run_log.js'));
  assert(helper.indexOf('ord_run_log.js')<helper.indexOf('ord_app.js'));
  assert(!/on(click|change|input)=/i.test(source+helper),'inline event handler was introduced');
  console.log('PASS run log records accepted TMO input, compact recommendation and user choice');
  console.log('PASS duplicate snapshot does not grow the audit trail');
  console.log('PASS run-log/result UI renders and privacy-safe export is integrated');
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
