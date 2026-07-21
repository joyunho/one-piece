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

  const Log=global.ORDRunLog,App=global.ORDApp.App;
  const recorder=Log.createRecorder({indexedDB:false,storage,keyPrefix:'lateFailureDefault',flushDelayMs:5000});
  await recorder.ready();recorder.startRun({startedAt:1000,nonce:'late-default'});
  recorder.recordOutcome('r51_65_failed',{round:65,failureReason:'line'},{round:65,at:2000});
  assert.strictEqual(recorder.summary().status,'failed','late failure must terminate the run as failed by default');
  assert.strictEqual(recorder.summary().lastOutcome,'r51_65_failed');
  assert.ok(recorder.summary().endedAt,'late failure must set endedAt');
  await recorder.destroy();

  const appRecorder=Log.createRecorder({indexedDB:false,storage,keyPrefix:'lateFailureApp',flushDelayMs:5000});
  await appRecorder.ready();appRecorder.startRun({startedAt:3000,nonce:'late-app'});
  const app=Object.create(App.prototype),toasts=[];
  Object.assign(app,{
    config:{source:'test'},state:{tab:'coach',pendingTransaction:null},runLog:appRecorder,_runLogReady:true,_runLogSelectedRun:null,_runLogSelectedId:'',_runResultOpen:false,_runResultSaving:false,_runLogLastDecisionDigest:'late-decision',
    actualRound:()=>65,health:()=>({ready:true,key:'ok',label:'정상 연동',ageSec:1}),render:()=>{},refreshRunLogHistory:async()=>[],downloadRunLog:async()=>true,toast:message=>toasts.push(message)
  });
  app.act('run-result-open',{dataset:{}});
  assert.strictEqual(app._runResultDraft.kind,'r51_65_failed','opening the result modal after round 50 must default to late failure');
  assert.strictEqual(app._runResultDraft.round,'65');
  const html=app.renderRunResultModal(app.health());
  assert.ok(html.includes('data-value="r51_65_failed"'));
  assert.ok(html.includes('51~65라 실패'));
  assert.ok(html.includes('data-run-field="failureReason"'),'late failure needs the same cause selector as round-50 failure');
  const eventInfo=app.runLogEventInfo({type:'outcome',payload:{kind:'r51_65_failed',failureReason:'line'}},null);
  assert.strictEqual(eventInfo.tone,'outcome fail');
  assert.ok(eventInfo.headline.includes('51~65라 실패'));

  app._runResultDraft={kind:'r51_65_failed',failureReason:'line',round:'65',bossHpPercent:'',attackUpgrade:'30',slowUpgrade:'5',hpRegenUpgrade:'',mpRegenUpgrade:'',helperUsed:false,note:'65라 라인사'};
  await app.saveRunOutcome();
  const saved=appRecorder.exportObject(),last=saved.events[saved.events.length-1];
  assert.strictEqual(saved.status,'failed','app save must not leave a round 51-65 death active');
  assert.strictEqual(last.type,'outcome');
  assert.strictEqual(last.payload.kind,'r51_65_failed');
  assert.strictEqual(last.payload.round,65);
  assert.strictEqual(last.payload.failureReason,'line');
  assert.ok(toasts.some(message=>message.includes('JSON 파일로 저장')));
  await appRecorder.destroy();

  const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8'),css=fs.readFileSync(path.join(EXT,'ord_app.css'),'utf8');
  for(const marker of ["r51_65_failed:'51~65라 실패'","button('r51_65_failed','51~65라 실패'","RUN_FAILURE_KINDS.has(kind)","round>50?'r51_65_failed'"])assert.ok(source.includes(marker),`late-failure UI marker missing: ${marker}`);
  assert.ok(css.includes('.result-kinds{display:grid;grid-template-columns:repeat(4'), 'four outcome choices must have a matching desktop layout');
  console.log('PASS round 51-65 failure is terminal, visible, cause-aware and exported');
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
