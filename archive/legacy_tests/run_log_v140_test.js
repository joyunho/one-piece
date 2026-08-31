'use strict';

const assert=require('assert');
const Log=require('../ord_tmo_auto_extension_v15_0_0_rebuild/ord_run_log.js');

let passed=0;
async function test(name,fn){try{await fn();passed++;process.stdout.write(`PASS ${name}\n`);}catch(error){process.stderr.write(`FAIL ${name}: ${error.stack||error}\n`);process.exitCode=1;}}

class MemoryStorage{
  constructor(){this.map=new Map();this.writes=[];}
  getItem(key){return this.map.has(key)?this.map.get(key):null;}
  setItem(key,value){this.map.set(String(key),String(value));this.writes.push({key:String(key),bytes:String(value).length});}
  removeItem(key){this.map.delete(String(key));}
  key(index){return[...this.map.keys()][index]||null;}
  get length(){return this.map.size;}
}

(async()=>{
await test('schema creates a JSON-safe gameplay-only run',()=>{
  const run=Log.createRun({startedAt:'2026-07-20T10:00:00.000Z',nonce:'fixed',app:{version:'14.0.0',userName:'do-not-store'},game:{version:'2.305',difficulty:'nightmare'}});
  assert.strictEqual(run.schemaName,'ord-helper-run-log');assert.strictEqual(run.schemaVersion,1);assert.ok(/^ord-/.test(run.runId));assert.strictEqual(run.privacy.containsPersonalData,false);assert.strictEqual(run.app.userName,undefined);assert.deepStrictEqual(JSON.parse(JSON.stringify(run)),run);
});

await test('snapshot fingerprint is deterministic and duplicate scans collapse',()=>{
  const left={round:25,counts:{b:2,a:1},settings:{mode:'physical'}},right={settings:{mode:'physical'},counts:{a:1,b:2},round:25};
  assert.strictEqual(Log.snapshotFingerprint(left),Log.snapshotFingerprint(right));
  const run=Log.createRun({startedAt:0,nonce:'snap'}),one=Log.recordSnapshot(run,left,{at:1000}),two=Log.recordSnapshot(run,right,{at:2000});
  assert.strictEqual(one.added,true);assert.strictEqual(two.added,false);assert.strictEqual(two.deduplicated,true);assert.strictEqual(run.events.length,1);assert.strictEqual(run.events[0].repeatCount,2);assert.strictEqual(run.events[0].snapshotId,run.events[0].eventId);
});

await test('same decision on the same input is deduplicated by a stable fingerprint',()=>{
  const run=Log.createRun({startedAt:0,nonce:'decision'}),snapshot=Log.recordSnapshot(run,{round:25,counts:{rareA:1}},{at:1000}).event;
  const one=Log.recordDecision(run,{round:25,selected:{id:'V80H'},candidates:[{id:'V80H',rank:1}],generatedAt:'first'},{snapshotId:snapshot.eventId,at:1100}),two=Log.recordDecision(run,{candidates:[{rank:1,id:'V80H'}],selected:{id:'V80H'},round:25,generatedAt:'second'},{snapshotId:snapshot.eventId,at:1200});
  assert.strictEqual(one.event.decisionFingerprint,two.event.decisionFingerprint);assert.strictEqual(two.added,false);assert.strictEqual(run.events.filter(event=>event.type==='decision').length,1);assert.strictEqual(two.event.repeatCount,2);
});

await test('a changed snapshot preserves the same recommendation as a new decision',()=>{
  const run=Log.createRun({startedAt:0,nonce:'changed'}),s1=Log.recordSnapshot(run,{round:25,counts:{a:1}},{at:1000}).event;Log.recordDecision(run,{selectedId:'x'},{snapshotId:s1.eventId,at:1100});const s2=Log.recordSnapshot(run,{round:26,counts:{a:2}},{at:2000}).event;const second=Log.recordDecision(run,{selectedId:'x'},{snapshotId:s2.eventId,at:2100});
  assert.strictEqual(second.added,true);assert.strictEqual(run.events.filter(event=>event.type==='decision').length,2);
});

await test('user actions and outcomes remain ordered replay events',()=>{
  const run=Log.createRun({startedAt:'2026-07-20T10:00:00Z',nonce:'replay'}),snapshot=Log.recordSnapshot(run,{round:49,counts:{upper:1}},{at:'2026-07-20T10:00:01Z'}).event;Log.recordDecision(run,{selectedId:'support-1',reason:['armor-gap']},{snapshotId:snapshot.eventId,at:'2026-07-20T10:00:02Z'});Log.recordUserAction(run,{action:'mark-made',targetId:'support-1'},{snapshotId:snapshot.eventId,round:49,at:'2026-07-20T10:00:03Z'});Log.recordUserAction(run,{action:'mark-made',targetId:'support-1'},{snapshotId:snapshot.eventId,round:49,at:'2026-07-20T10:00:04Z'});Log.finishRun(run,'failed',{kind:'boss-failed',bossRound:50,remainingHpPercent:31},{round:50,at:'2026-07-20T10:00:05Z'});
  assert.deepStrictEqual(run.events.map(event=>event.type),['snapshot','decision','user-action','user-action','outcome']);assert.deepStrictEqual(run.events.map(event=>event.seq),[1,2,3,4,5]);assert.strictEqual(run.status,'failed');assert.strictEqual(run.endedAt,'2026-07-20T10:00:05.000Z');assert.ok(Log.validateRun(run).valid);
});

await test('private fields are discarded and private strings are redacted',()=>{
  const clean=Log.plain({apiKey:'sk-abcdefghijklmnop',email:'person@example.com',userName:'someone',note:'contact person@example.com from 10.0.0.8',counts:{rare:2},sourceUrl:'https://example.test/private'});
  assert.deepStrictEqual(Object.keys(clean).sort(),['counts','note']);assert.ok(clean.note.includes('[redacted-email]'));assert.ok(clean.note.includes('[redacted-ip]'));assert.ok(!JSON.stringify(clean).includes('person@example.com'));
});

await test('JSON export/import validates schema and preserves replay data',()=>{
  const run=Log.createRun({startedAt:0,nonce:'export'}),snapshot=Log.recordSnapshot(run,{round:25,counts:{r1:2},settings:{mode:'magic'}},{at:1}).event;Log.recordDecision(run,{route:'dual',candidates:[{id:'u1',score:[0,2,1]}],selectedId:'u1'},{snapshotId:snapshot.eventId,at:2});const text=Log.exportRun(run);const restored=Log.importRun(text);
  assert.deepStrictEqual(restored,run);assert.ok(Log.validateRun(restored).valid);assert.throws(()=>Log.importRun('{broken'),/Invalid run-log JSON/);const wrong=JSON.parse(text);wrong.schemaVersion=99;assert.throws(()=>Log.importRun(JSON.stringify(wrong)),/schemaVersion/);
});

await test('unsafe imported fields are rejected rather than silently trusted',()=>{
  const run=Log.createRun({startedAt:0,nonce:'unsafe'});run.events.push({seq:1,eventId:`${run.runId}:1`,type:'snapshot',at:new Date(1).toISOString(),elapsedMs:1,round:1,source:'app',snapshotId:`${run.runId}:1`,fingerprint:'snap-1-abcd',payload:{apiKey:'secret'}});run.nextSeq=2;
  const check=Log.validateRun(run);assert.strictEqual(check.valid,false);assert.ok(check.errors.some(error=>error.includes('private or unsafe field')));assert.throws(()=>Log.importRun(JSON.stringify(run)),/private or unsafe/);
});

await test('in-memory history and each run are strictly bounded',()=>{
  const run=Log.createRun({startedAt:0,nonce:'bound',limits:{maxEventsPerRun:20}});for(let i=0;i<30;i++)Log.recordUserAction(run,{action:'tick',index:i},{at:i+1});assert.strictEqual(run.events.length,20);assert.strictEqual(run.droppedEventCount,10);assert.strictEqual(run.firstRetainedSeq,11);assert.ok(Log.validateRun(run).valid);
  const history=Log.createHistory({maxRuns:2,maxEventsPerRun:20,maxBytes:50000,at:0});for(let i=0;i<3;i++){const item=Log.createRun({startedAt:i*1000,nonce:`history-${i}`});Log.recordOutcome(item,{kind:'checkpoint',index:i},{at:i*1000+1});Log.putRun(history,item,{at:i*1000+2});}assert.strictEqual(history.runs.length,2);assert.ok(history.runs[0].startedAt>history.runs[1].startedAt);
});

await test('localStorage fallback persists throttled per-run chunks, never one full history array',async()=>{
  const storage=new MemoryStorage(),repo=Log.createRepository({indexedDB:false,storage,keyPrefix:'testRunLog',chunkEvents:10,flushDelayMs:5000,limits:{maxRuns:2,maxEventsPerRun:100,maxBytes:500000}}),run=Log.createRun({startedAt:0,nonce:'repo',limits:{maxEventsPerRun:100}});Log.recordSnapshot(run,{round:25,counts:{rare:6}},{at:1});for(let i=0;i<24;i++)Log.recordUserAction(run,{action:'candidate-click',index:i},{round:25,at:i+2});repo.captureRun(run);assert.ok(repo.pending>0);assert.strictEqual(storage.length,0);await repo.flush();
  const keys=[...storage.map.keys()];assert.ok(keys.includes('testRunLog:index'));assert.ok(keys.includes(`testRunLog:run:${encodeURIComponent(run.runId)}:meta`));assert.strictEqual(keys.filter(key=>key.includes(':events:')).length,3);assert.ok(!keys.includes('testRunLog'));assert.ok(storage.writes.every(write=>write.bytes<120000));const restored=await repo.getRun(run.runId);assert.strictEqual(restored.events.length,25);assert.deepStrictEqual(restored.events.map(event=>event.seq),Array.from({length:25},(_,i)=>i+1));assert.ok(Log.validateRun(restored).valid);await repo.close();
});

await test('fallback updates one event chunk and prunes old runs by metadata',async()=>{
  const storage=new MemoryStorage(),repo=Log.createRepository({indexedDB:false,storage,keyPrefix:'boundedRepo',chunkEvents:10,flushDelayMs:5000,limits:{maxRuns:2,maxEventsPerRun:50,maxBytes:500000}}),runs=[];
  for(let i=0;i<3;i++){const run=Log.createRun({startedAt:i*1000,nonce:`repo-${i}`});Log.recordSnapshot(run,{round:25+i,counts:{x:i+1}},{at:i*1000+1});repo.captureRun(run);runs.push(run);}await repo.flush();const listed=await repo.listRuns();assert.strictEqual(listed.length,2);assert.strictEqual(await repo.getRun(runs[0].runId),null);assert.ok(await repo.getRun(runs[2].runId));await repo.close();
});

await test('all exported public structures stay plain and localStorage-safe',()=>{
  const run=Log.createRun({startedAt:0,nonce:'plain'}),snapshot=Log.recordSnapshot(run,{round:25,counts:{a:1}},{at:1}).event;Log.recordDecision(run,{selectedId:'a',metrics:{armor:180,stun:.5}},{snapshotId:snapshot.eventId,at:2});const copy=JSON.parse(JSON.stringify(run));assert.deepStrictEqual(copy,run);assert.strictEqual(Object.getPrototypeOf(copy),Object.prototype);assert.strictEqual(Object.getPrototypeOf(copy.events[0]),Object.prototype);
});

await test('application audit sources retain their distinct origin labels',()=>{
  const run=Log.createRun({startedAt:0,nonce:'sources'}),sources=['extension','standalone-manual','tmo-observation','recommendation-engine','user-result','user-reset'];for(let i=0;i<sources.length;i++)Log.recordUserAction(run,{action:'source-check',index:i},{source:sources[i],at:i+1});Log.recordUserAction(run,{action:'unknown-source'},{source:'not-allowed',at:20});assert.deepStrictEqual(run.events.map(event=>event.source),sources.concat('app'));
});

await test('run metadata is copied without touching the potentially large event array',()=>{
  const run=Log.createRun({startedAt:0,nonce:'meta-copy'});Object.defineProperty(run,'events',{enumerable:true,get(){throw new Error('events must not be read');}});const meta=Log._test.runMeta(run);assert.strictEqual(meta.runId,run.runId);assert.strictEqual(Object.prototype.hasOwnProperty.call(meta,'events'),false);
});

await test('IndexedDB retention planning applies run, event, and byte ceilings',()=>{
  const older=Log.createRun({startedAt:0,nonce:'idb-old'}),newer=Log.createRun({startedAt:1000,nonce:'idb-new'}),large=Array.from({length:20},(_,i)=>`${i}-${'x'.repeat(1900)}`);for(let i=0;i<3;i++){Log.recordUserAction(older,{action:'large',large,index:i},{at:i+1});Log.recordUserAction(newer,{action:'large',large,index:i},{at:1001+i});}const metas=[Log._test.runMeta(older),Log._test.runMeta(newer)],events=[...older.events.map(event=>Object.assign({runId:older.runId},event)),...newer.events.map(event=>Object.assign({runId:newer.runId},event))],plan=Log._test.indexedRetentionPlan(metas,events,{maxRuns:2,maxEventsPerRun:100,maxBytes:50000});assert(plan.bytes<=50000,`expected an IndexedDB plan under 50 KB, got ${plan.bytes}`);assert(plan.deleteRunIds.includes(older.runId));assert(plan.deleteEventKeys.some(key=>key[0]===newer.runId));assert(plan.metaUpdates.some(meta=>meta.runId===newer.runId&&meta.droppedEventCount>0));
});

await test('recorder exposes synchronous summaries and the requested outcome semantics',async()=>{
  const storage=new MemoryStorage(),recorder=Log.createRecorder({indexedDB:false,storage,keyPrefix:'recorderApi',flushDelayMs:5000,app:{version:'14.0.0'}});await recorder.ready();recorder.startRun({startedAt:0,nonce:'recorder-api'});const snapshot=recorder.record('snapshot',{round:25,counts:{rare:6}},{at:1}).event;recorder.record('decision',{selectedId:'V80H',reason:['current-stock-prefix']},{snapshotId:snapshot.eventId,round:25,at:2});recorder.record('userAction',{action:'upper-confirm',targetId:'V80H'},{snapshotId:snapshot.eventId,round:25,at:3});recorder.recordOutcome('r50_killed',{remainingSeconds:8},{round:50,at:4});
  let summary=recorder.summary();assert.strictEqual(summary.ready,true);assert.strictEqual(summary.status,'active');assert.strictEqual(summary.lastOutcome,'r50_killed');assert.strictEqual(summary.eventTypes.decision,1);assert.strictEqual(recorder.peekEvents(2).length,2);recorder.recordOutcome('r65_cleared',{round:65},{round:65,terminal:true,at:5});summary=recorder.summary();assert.strictEqual(summary.status,'completed');assert.strictEqual(summary.lastOutcome,'r65_cleared');assert.strictEqual(recorder.exportObject().privacy.containsPersonalData,false);assert.doesNotThrow(()=>JSON.parse(recorder.exportJson()));await recorder.flush();await recorder.destroy();
});

await test('recorder asynchronously restores an active run and clearAll removes chunks',async()=>{
  const storage=new MemoryStorage(),one=Log.createRecorder({indexedDB:false,storage,keyPrefix:'recorderRestore',flushDelayMs:5000});await one.ready();one.startRun({startedAt:1000,nonce:'restore'});one.record('snapshot',{round:33,counts:{r1:1}},{round:33,at:1001});one.recordOutcome('r50_killed',{note:'continued'},{round:50,at:1002});await one.flush();await one.destroy();
  const two=Log.createRecorder({indexedDB:false,storage,keyPrefix:'recorderRestore',flushDelayMs:5000});await two.ready();assert.strictEqual(two.summary().hasRun,true);assert.strictEqual(two.summary().status,'active');assert.strictEqual(two.summary().lastRound,50);assert.strictEqual(two.peekEvents(10).length,2);await two.clearAll();assert.strictEqual(two.summary().hasRun,false);assert.strictEqual([...storage.map.keys()].filter(key=>key.startsWith('recorderRestore')).length,0);await two.destroy();
});

await test('storage denial degrades to bounded memory without blocking the helper',async()=>{
  const recorder=Log.createRecorder({indexedDB:false,storage:null,flushDelayMs:5000,limits:{maxRuns:2,maxEventsPerRun:20,maxBytes:50000}});await recorder.ready();recorder.startRun({startedAt:0,nonce:'memory-only'});for(let i=0;i<25;i++)recorder.record('user-action',{action:'tick',index:i},{round:i,at:i+1});await recorder.flush();assert.strictEqual(recorder.summary().persistence,'memory');assert.strictEqual(recorder.peekEvents(100).length,20);assert.strictEqual(recorder.summary().droppedEventCount,5);await recorder.destroy();
});

await test('chunk fallback enforces its byte ceiling with oversized diagnostic input',async()=>{
  const storage=new MemoryStorage(),repo=Log.createRepository({indexedDB:false,storage,keyPrefix:'byteBound',chunkEvents:10,flushDelayMs:5000,limits:{maxRuns:2,maxEventsPerRun:100,maxBytes:50000}}),run=Log.createRun({startedAt:0,nonce:'byte-bound',limits:{maxEventsPerRun:100}}),large=Array.from({length:30},(_,i)=>`${i}-${'x'.repeat(1900)}`);for(let i=0;i<4;i++)Log.recordUserAction(run,{action:'diagnostic',index:i,large},{at:i+1});assert.ok(JSON.stringify(run.events[0].payload).length<=24000);repo.captureRun(run);await repo.flush();const total=[...storage.map.values()].reduce((sum,value)=>sum+value.length,0);assert.ok(total<=52000,`expected bounded fallback, got ${total} bytes`);const restored=await repo.getRun(run.runId);assert.ok(restored.events.length<4);assert.ok(restored.events.length>=1);await repo.close();
});

await test('a 65-round-sized audit buffers synchronously without touching storage',async()=>{
  const storage=new MemoryStorage(),recorder=Log.createRecorder({indexedDB:false,storage,keyPrefix:'performanceRun',flushDelayMs:5000,limits:{maxRuns:2,maxEventsPerRun:600,maxBytes:2000000}});await recorder.ready();recorder.startRun({startedAt:0,nonce:'performance'});const snapshot=recorder.record('snapshot',{round:1,counts:{rareA:1,wisp:2}},{round:1,at:1}).event,started=Date.now();for(let index=0;index<250;index++)recorder.record('decision',{round:index%65+1,mode:index%2?'physical':'magic',actions:[{id:`unit-${index%12}`,name:`후보 ${index%12}`,wisp:index%5}],blockers:[`gap-${index%7}`]},{snapshotId:snapshot.eventId,round:index%65+1,at:index+2});const elapsed=Date.now()-started;assert.strictEqual(storage.length,0,'events were written synchronously during gameplay');assert(elapsed<1000,`250 in-memory decisions took ${elapsed}ms`);assert(Buffer.byteLength(recorder.exportJson())<1000000,'single-run export unexpectedly exceeded 1 MB');await recorder.flush();assert(storage.length>0);await recorder.destroy();
});

process.stdout.write(`RUN_LOG_TESTS ${passed}/20 passed\n`);
if(process.exitCode)process.exit(process.exitCode);
})().catch(error=>{process.stderr.write(`${error.stack||error}\n`);process.exit(1);});
