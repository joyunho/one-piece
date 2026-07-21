(function(root,factory){
'use strict';
const api=factory(root);
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.ORDRunLog=api;
})(typeof window!=='undefined'?window:globalThis,function(env){
'use strict';

// Gameplay-only audit log.  This module deliberately does not read the DOM,
// browser identity, URL, clipboard, or network state.  Callers must provide the
// game state they want to record and every value is converted to JSON-safe data.
const SCHEMA_NAME='ord-helper-run-log';
const HISTORY_SCHEMA_NAME='ord-helper-run-history';
const SCHEMA_VERSION=1;
const DEFAULT_STORAGE_KEY='ordRunHistoryV1';
const DEFAULT_LIMITS=Object.freeze({maxRuns:12,maxEventsPerRun:1500,maxBytes:3500000});
const EVENT_TYPES=Object.freeze(['snapshot','decision','user-action','outcome']);
const EVENT_TYPE_SET=new Set(EVENT_TYPES);
const EVENT_SOURCES=Object.freeze(['app','tmo','user','system','import','replay','extension','standalone-manual','tmo-observation','recommendation-engine','user-result','user-reset']);
const EVENT_SOURCE_SET=new Set(EVENT_SOURCES);
const DANGEROUS_KEYS=new Set(['__proto__','prototype','constructor']);
const PRIVATE_KEY_RE=/^(?:api[_-]?key|authorization|password|passwd|secret|access[_-]?token|refresh[_-]?token|cookie|cookies|email|e[_-]?mail|phone|telephone|ip|ip[_-]?address|machine[_-]?id|computer[_-]?name|windows[_-]?user|username|user[_-]?name|account[_-]?id|discord[_-]?id|tmo[_-]?code|chat[_-]?command|clipboard|source[_-]?url)$/i;
const VOLATILE_DECISION_KEYS=new Set(['at','timestamp','generatedAt','createdAt','updatedAt','lastSeenAt','durationMs','latencyMs','computeMs','renderMs','repeatCount']);
const MAX_DEPTH=10;
const MAX_STRING=2000;
const MAX_ARRAY=800;
const MAX_OBJECT_KEYS=1200;
const MAX_EVENT_PAYLOAD_BYTES=24000;

function num(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function clampInt(value,min,max,fallback){const n=Math.round(num(value));return n>=min&&n<=max?n:fallback;}
function iso(value){const date=value instanceof Date?value:new Date(value==null?Date.now():value);return Number.isNaN(date.getTime())?new Date(0).toISOString():date.toISOString();}
function isPlainObject(value){if(!value||Object.prototype.toString.call(value)!=='[object Object]')return false;const proto=Object.getPrototypeOf(value);return proto===Object.prototype||proto===null;}
function redactString(value){
  let text=String(value);
  // These patterns are not game data and can identify a person or credential.
  text=text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[redacted-email]');
  text=text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[redacted-ip]');
  text=text.replace(/\b(?:sk|sess|Bearer)[-_ ][A-Za-z0-9._-]{12,}\b/gi,'[redacted-secret]');
  text=text.replace(/[A-Za-z]:\\Users\\[^\\\s]+/gi,'[redacted-user-path]');
  return text.length>MAX_STRING?`${text.slice(0,MAX_STRING)}…[truncated]`:text;
}
function sanitize(value,depth,seen){
  depth=depth||0;seen=seen||new Set();
  if(value==null)return value===null?null:undefined;
  if(typeof value==='string')return redactString(value);
  if(typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value==='bigint')return String(value);
  if(typeof value==='function'||typeof value==='symbol')return undefined;
  if(depth>=MAX_DEPTH)return '[truncated-depth]';
  if(value instanceof Date)return iso(value);
  if(seen.has(value))return '[circular]';
  seen.add(value);
  if(Array.isArray(value)){
    const out=[];
    for(const item of value.slice(0,MAX_ARRAY)){const clean=sanitize(item,depth+1,seen);if(clean!==undefined)out.push(clean);}
    seen.delete(value);return out;
  }
  const out={};let used=0;
  for(const key of Object.keys(value).sort()){
    if(used>=MAX_OBJECT_KEYS)break;
    if(DANGEROUS_KEYS.has(key)||PRIVATE_KEY_RE.test(key))continue;
    const clean=sanitize(value[key],depth+1,seen);if(clean!==undefined){out[key]=clean;used++;}
  }
  seen.delete(value);return out;
}
function plain(value){return sanitize(value,0,new Set());}
function clonePlain(value){return JSON.parse(JSON.stringify(plain(value)));}
function fitValue(value,budget){
  let candidate=value,text=JSON.stringify(candidate);if(text.length<=budget)return candidate;if(Array.isArray(candidate)){let size=Math.min(candidate.length,100);while(size>0){candidate=value.slice(0,size);if(JSON.stringify(candidate).length<=budget)return candidate;size=Math.floor(size/2);}}else if(isPlainObject(candidate)){const out={};for(const key of Object.keys(candidate)){const next=Object.assign({},out,{[key]:candidate[key]});if(JSON.stringify(next).length>budget)break;out[key]=candidate[key];}if(Object.keys(out).length)return out;}return`[omitted:${text.length} bytes]`;
}
function boundedPayload(value){
  const clean=plain(value||{}),text=JSON.stringify(clean);if(text.length<=MAX_EVENT_PAYLOAD_BYTES)return clean;const out={_truncated:{reason:'payload-byte-limit',limit:MAX_EVENT_PAYLOAD_BYTES,originalFingerprint:fingerprint('payload',clean,{dropVolatile:true})}},priority=['round','counts','settings','inputFingerprint','inputSnapshotFingerprint','selected','selectedId','candidates','reason','gates','costs','prefix','metrics'],keys=[...new Set(priority.concat(Object.keys(clean).sort()))];for(const key of keys){if(!Object.prototype.hasOwnProperty.call(clean,key))continue;const used=JSON.stringify(out).length,remaining=MAX_EVENT_PAYLOAD_BYTES-used-key.length-16;if(remaining<100)break;out[key]=fitValue(clean[key],remaining);if(JSON.stringify(out).length>MAX_EVENT_PAYLOAD_BYTES)delete out[key];}return out;
}

function canonicalValue(value,options,depth){
  options=options||{};depth=depth||0;
  if(value==null||typeof value==='boolean'||typeof value==='string')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(Array.isArray(value))return value.map(item=>canonicalValue(item,options,depth+1));
  const out={};
  for(const key of Object.keys(value||{}).sort()){
    if(options.dropVolatile&&VOLATILE_DECISION_KEYS.has(key))continue;
    out[key]=canonicalValue(value[key],options,depth+1);
  }
  return out;
}
function stableStringify(value,options){return JSON.stringify(canonicalValue(plain(value),options||{},0));}
function hash32(text,seed){let hash=seed>>>0;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return(hash>>>0).toString(16).padStart(8,'0');}
function fingerprint(kind,value,options){const body=stableStringify(value,options);return`${kind}-1-${hash32(body,2166136261)}${hash32(body,3339675911)}`;}
function snapshotFingerprint(snapshot){return fingerprint('snap',snapshot,{dropVolatile:true});}
function decisionFingerprint(decision){return fingerprint('decision',decision,{dropVolatile:true});}

let runCounter=0;
function makeRunId(startedAt,nonce){
  const millis=new Date(startedAt).getTime(),suffix=nonce==null?`${(++runCounter).toString(36)}${Math.floor(Math.random()*0x1000000).toString(36)}`:String(nonce);
  return`ord-${Number.isFinite(millis)?millis.toString(36):'0'}-${fingerprint('id',suffix).slice(-8)}`;
}
function normalizedLimits(input){const raw=input||{};return{maxRuns:clampInt(raw.maxRuns,1,100,DEFAULT_LIMITS.maxRuns),maxEventsPerRun:clampInt(raw.maxEventsPerRun,20,10000,DEFAULT_LIMITS.maxEventsPerRun),maxBytes:clampInt(raw.maxBytes,50000,5000000,DEFAULT_LIMITS.maxBytes)};}
function createRun(options){
  options=options||{};const startedAt=iso(options.startedAt),limits=normalizedLimits(options.limits),requestedId=String(options.runId||''),runId=/^ord-[a-z0-9-]+$/i.test(requestedId)?requestedId:makeRunId(startedAt,options.nonce);
  return{
    schemaName:SCHEMA_NAME,schemaVersion:SCHEMA_VERSION,runId,startedAt,endedAt:null,status:'active',
    app:plain(options.app||{}),game:plain(options.game||{version:'2.305',difficulty:'nightmare'}),
    privacy:{scope:'gameplay-only',containsPersonalData:false,policyVersion:1},
    limits:{maxEvents:limits.maxEventsPerRun},droppedEventCount:0,firstRetainedSeq:1,nextSeq:1,events:[]
  };
}
function assertRun(run){if(!run||run.schemaName!==SCHEMA_NAME||run.schemaVersion!==SCHEMA_VERSION||!Array.isArray(run.events))throw new TypeError('ORD run log object is required');}
function eventSnapshotFingerprint(run,event){
  if(!event)return'';if(event.type==='snapshot')return event.fingerprint||'';
  const id=String(event.snapshotId||'');if(!id)return'';const snapshot=run.events.find(item=>item.eventId===id&&item.type==='snapshot');return snapshot&&snapshot.fingerprint||'';
}
function latestSnapshot(run){for(let i=run.events.length-1;i>=0;i--)if(run.events[i].type==='snapshot')return run.events[i];return null;}
function boundRun(run,maxEvents){
  maxEvents=clampInt(maxEvents,20,10000,num(run&&run.limits&&run.limits.maxEvents)||DEFAULT_LIMITS.maxEventsPerRun);if(run.events.length<=maxEvents)return run;
  const removeCount=run.events.length-maxEvents,tail=run.events.slice(removeCount),first=tail[0],neededSnapshotId=first&&first.type!=='snapshot'&&first.snapshotId;
  if(neededSnapshotId&&!tail.some(event=>event.eventId===neededSnapshotId)){
    const anchor=run.events.slice(0,removeCount).reverse().find(event=>event.eventId===neededSnapshotId&&event.type==='snapshot');
    if(anchor){tail.shift();tail.unshift(anchor);tail.sort((a,b)=>a.seq-b.seq);}
  }
  const retained=new Set(tail.map(event=>event.eventId)),actuallyDropped=run.events.filter(event=>!retained.has(event.eventId)).length;
  run.events=tail;run.droppedEventCount=num(run.droppedEventCount)+actuallyDropped;run.firstRetainedSeq=tail.length?tail[0].seq:run.nextSeq;return run;
}
function append(run,type,payload,options){
  assertRun(run);options=options||{};if(!EVENT_TYPE_SET.has(type))throw new TypeError(`Unsupported run-log event type: ${type}`);
  const at=iso(options.at),seq=Math.max(1,Math.round(num(run.nextSeq)||1)),clean=boundedPayload(payload||{}),snapshotId=String(options.snapshotId||clean&&clean.snapshotId||'');
  if(clean&&Object.prototype.hasOwnProperty.call(clean,'snapshotId'))delete clean.snapshotId;
  const source=EVENT_SOURCE_SET.has(options.source)?options.source:'app',event={seq,eventId:`${run.runId}:${seq}`,type,at,elapsedMs:Math.max(0,new Date(at).getTime()-new Date(run.startedAt).getTime()),round:options.round==null&&clean&&clean.round==null?null:Math.max(0,Math.round(num(options.round==null?clean.round:options.round))),source,snapshotId:snapshotId||null,fingerprint:fingerprint(`event-${type}`,{snapshotId,payload:clean},{dropVolatile:true}),payload:clean};
  run.nextSeq=seq+1;run.events.push(event);boundRun(run,num(run.limits&&run.limits.maxEvents));return{run,event,added:true,deduplicated:false};
}
function recordSnapshot(run,snapshot,options){
  assertRun(run);options=options||{};const clean=plain(snapshot||{}),fp=snapshotFingerprint(clean),previous=latestSnapshot(run);
  if(!options.force&&previous&&previous.fingerprint===fp){previous.repeatCount=Math.max(1,num(previous.repeatCount))+1;previous.lastSeenAt=iso(options.at);return{run,event:previous,added:false,deduplicated:true};}
  const result=append(run,'snapshot',clean,options);result.event.fingerprint=fp;result.event.snapshotId=result.event.eventId;return result;
}
function recordDecision(run,decision,options){
  assertRun(run);options=options||{};const clean=plain(decision||{}),snapshotId=String(options.snapshotId||clean.snapshotId||latestSnapshot(run)&&latestSnapshot(run).eventId||'');if(Object.prototype.hasOwnProperty.call(clean,'snapshotId'))delete clean.snapshotId;
  const snapshot=run.events.find(event=>event.eventId===snapshotId&&event.type==='snapshot'),inputFingerprint=String(options.inputFingerprint||snapshot&&snapshot.fingerprint||''),fp=decisionFingerprint({inputFingerprint,round:options.round==null?clean.round:options.round,decision:clean}),dedupKey=`${inputFingerprint}|${fp}`;
  if(options.deduplicate!==false){for(let i=run.events.length-1;i>=0;i--){const event=run.events[i];if(event.type==='decision'&&event.dedupKey===dedupKey){event.repeatCount=Math.max(1,num(event.repeatCount))+1;event.lastSeenAt=iso(options.at);return{run,event,added:false,deduplicated:true};}}}
  const result=append(run,'decision',clean,Object.assign({},options,{snapshotId}));result.event.decisionFingerprint=fp;result.event.inputFingerprint=inputFingerprint||null;result.event.dedupKey=dedupKey;return result;
}
function recordUserAction(run,action,options){return append(run,'user-action',action,options);}
function recordOutcome(run,outcome,options){return append(run,'outcome',outcome,options);}
function finishRun(run,status,outcome,options){
  assertRun(run);options=options||{};if(outcome)recordOutcome(run,outcome,options);run.status=['completed','failed','abandoned'].includes(status)?status:'completed';run.endedAt=iso(options.at);return run;
}

function scanUnsafe(value,path,errors,seen){
  if(!value||typeof value!=='object')return;seen=seen||new Set();if(seen.has(value))return;seen.add(value);
  for(const key of Object.keys(value)){
    const next=path?`${path}.${key}`:key;if(DANGEROUS_KEYS.has(key)||PRIVATE_KEY_RE.test(key))errors.push(`${next}: private or unsafe field is not allowed`);
    const child=value[key];if(typeof child==='string'&&(/(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.test(child)||/\b(?:sk|sess|Bearer)[-_ ][A-Za-z0-9._-]{12,}\b/i.test(child)))errors.push(`${next}: private value is not allowed`);else scanUnsafe(child,next,errors,seen);
  }
}
function validateRun(value){
  const errors=[],warnings=[];if(!isPlainObject(value))return{valid:false,errors:['root: plain object required'],warnings};scanUnsafe(value,'',errors);
  if(value.schemaName!==SCHEMA_NAME)errors.push(`schemaName: expected ${SCHEMA_NAME}`);if(value.schemaVersion!==SCHEMA_VERSION)errors.push(`schemaVersion: expected ${SCHEMA_VERSION}`);if(typeof value.runId!=='string'||!/^ord-[a-z0-9-]+$/i.test(value.runId))errors.push('runId: invalid');if(Number.isNaN(new Date(value.startedAt).getTime()))errors.push('startedAt: invalid ISO date');if(value.endedAt!=null&&Number.isNaN(new Date(value.endedAt).getTime()))errors.push('endedAt: invalid ISO date');if(!['active','completed','failed','abandoned'].includes(value.status))errors.push('status: invalid');if(!Array.isArray(value.events))errors.push('events: array required');
  const ids=new Set(),seqs=new Set(),snapshotIds=new Set();let priorSeq=-1;
  for(const [index,event] of (Array.isArray(value.events)?value.events:[]).entries()){
    const at=`events[${index}]`;if(!isPlainObject(event)){errors.push(`${at}: plain object required`);continue;}if(!EVENT_TYPE_SET.has(event.type))errors.push(`${at}.type: invalid`);if(!Number.isInteger(event.seq)||event.seq<1||event.seq<=priorSeq)errors.push(`${at}.seq: must be strictly increasing`);priorSeq=event.seq;if(typeof event.eventId!=='string'||ids.has(event.eventId))errors.push(`${at}.eventId: missing or duplicate`);ids.add(event.eventId);seqs.add(event.seq);if(Number.isNaN(new Date(event.at).getTime()))errors.push(`${at}.at: invalid ISO date`);if(!isPlainObject(event.payload))errors.push(`${at}.payload: plain object required`);if(typeof event.fingerprint!=='string'||!/^[a-z0-9-]+$/i.test(event.fingerprint))errors.push(`${at}.fingerprint: invalid`);if(event.type==='snapshot')snapshotIds.add(event.eventId);if(event.type==='decision'&&typeof event.decisionFingerprint!=='string')errors.push(`${at}.decisionFingerprint: required`);
  }
  for(const [index,event] of (Array.isArray(value.events)?value.events:[]).entries())if(event.snapshotId&&!snapshotIds.has(event.snapshotId)){const message=`events[${index}].snapshotId: referenced snapshot is not retained`;if(num(value.droppedEventCount)>0)warnings.push(message);else errors.push(message);}
  if(value.privacy&&value.privacy.containsPersonalData!==false)errors.push('privacy.containsPersonalData: must be false');if(num(value.droppedEventCount)>0)warnings.push(`replay begins at retained event ${value.firstRetainedSeq||'unknown'}; ${value.droppedEventCount} older events were pruned`);
  return{valid:errors.length===0,errors,warnings};
}
// v16: exports default to compact JSON — pretty-printing inflated a 4.6MB run
// into a 7.4MB file with no analytical benefit.
function exportRun(run,options){const check=validateRun(run);if(!check.valid)throw new TypeError(`Invalid ORD run log: ${check.errors.join('; ')}`);return JSON.stringify(clonePlain(run),null,options&&options.pretty===true?2:0);}
function importRun(text){
  if(typeof text!=='string')throw new TypeError('Run-log import must be JSON text');if(text.length>5000000)throw new RangeError('Run-log import exceeds 5 MB');let value;try{value=JSON.parse(text);}catch(error){throw new SyntaxError(`Invalid run-log JSON: ${error.message}`);}const check=validateRun(value);if(!check.valid)throw new TypeError(`Invalid ORD run log: ${check.errors.join('; ')}`);return clonePlain(value);
}

function createHistory(options){const limits=normalizedLimits(options);return{schemaName:HISTORY_SCHEMA_NAME,schemaVersion:SCHEMA_VERSION,updatedAt:iso(options&&options.at),limits,runs:[]};}
function historyBytes(history){return JSON.stringify(history).length;}
function pruneHistory(history){
  const limits=normalizedLimits(history&&history.limits);history.limits=limits;history.runs=(history.runs||[]).filter(run=>validateRun(run).valid).sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt))).slice(0,limits.maxRuns);for(const run of history.runs){run.limits=Object.assign({},run.limits,{maxEvents:limits.maxEventsPerRun});boundRun(run,limits.maxEventsPerRun);}
  while(historyBytes(history)>limits.maxBytes&&history.runs.length>1)history.runs.pop();
  while(historyBytes(history)>limits.maxBytes&&history.runs.length&&history.runs[0].events.length>20){const run=history.runs[0],next=Math.max(20,Math.floor(run.events.length*.7));boundRun(run,next);}
  return history;
}
function putRun(history,run,options){
  const check=validateRun(run);if(!check.valid)throw new TypeError(`Invalid ORD run log: ${check.errors.join('; ')}`);if(!history||history.schemaName!==HISTORY_SCHEMA_NAME||history.schemaVersion!==SCHEMA_VERSION)throw new TypeError('ORD run history object is required');const copy=clonePlain(run),index=history.runs.findIndex(item=>item.runId===copy.runId);if(index>=0)history.runs.splice(index,1);history.runs.unshift(copy);history.updatedAt=iso(options&&options.at);return pruneHistory(history);
}
function validateHistory(value){
  const errors=[];if(!isPlainObject(value))return{valid:false,errors:['root: plain object required'],warnings:[]};if(value.schemaName!==HISTORY_SCHEMA_NAME)errors.push(`schemaName: expected ${HISTORY_SCHEMA_NAME}`);if(value.schemaVersion!==SCHEMA_VERSION)errors.push(`schemaVersion: expected ${SCHEMA_VERSION}`);if(!Array.isArray(value.runs))errors.push('runs: array required');const warnings=[];for(const [index,run] of (value.runs||[]).entries()){const check=validateRun(run);errors.push(...check.errors.map(error=>`runs[${index}].${error}`));warnings.push(...check.warnings.map(warning=>`runs[${index}].${warning}`));}return{valid:errors.length===0,errors,warnings};
}

function runMeta(run){const source={};for(const key of Object.keys(run||{}))if(key!=='events')source[key]=run[key];return clonePlain(source);}
function storageBytes(value){try{return JSON.stringify(value).length;}catch(_){return 0;}}
function indexedRetentionPlan(metaRows,eventRows,inputLimits){
  const limits=normalizedLimits(inputLimits),entries=(metaRows||[]).filter(meta=>meta&&typeof meta.runId==='string').map(meta=>({meta:clonePlain(meta),events:[],deleteSeqs:[]})),byId=new Map(entries.map(entry=>[entry.meta.runId,entry])),orphanEventKeys=[];
  for(const row of eventRows||[]){const entry=row&&byId.get(String(row.runId||''));if(entry&&Number.isInteger(row.seq))entry.events.push(row);else if(row&&typeof row.runId==='string'&&Number.isInteger(row.seq))orphanEventKeys.push([row.runId,row.seq]);}
  for(const entry of entries){entry.events.sort((a,b)=>a.seq-b.seq);while(entry.events.length>limits.maxEventsPerRun){const removed=entry.events.shift();entry.deleteSeqs.push(removed.seq);}}
  entries.sort((a,b)=>String(b.meta.startedAt).localeCompare(String(a.meta.startedAt)));const kept=entries.slice(0,limits.maxRuns),deleteRunIds=entries.slice(limits.maxRuns).map(entry=>entry.meta.runId);
  function refreshMeta(entry){const lastSeq=entry.events.length?entry.events[entry.events.length-1].seq:0,inferredDropped=Math.max(0,lastSeq-entry.events.length),firstSeq=entry.events.length?entry.events[0].seq:Math.max(1,num(entry.meta.nextSeq)||1);entry.meta.droppedEventCount=Math.max(num(entry.meta.droppedEventCount),inferredDropped);entry.meta.firstRetainedSeq=firstSeq;}
  function refreshSize(entry){refreshMeta(entry);entry.metaBytes=storageBytes(entry.meta);entry.eventBytes=entry.events.reduce((sum,event)=>sum+storageBytes(event),0);entry.bytes=entry.metaBytes+entry.eventBytes;}
  for(const entry of kept)refreshSize(entry);let total=kept.reduce((sum,entry)=>sum+entry.bytes,0);
  while(total>limits.maxBytes&&kept.length>1){const removed=kept.pop();total-=removed.bytes;deleteRunIds.push(removed.meta.runId);}
  if(total>limits.maxBytes&&kept.length){const entry=kept[0];while(total>limits.maxBytes&&entry.events.length>1){const removed=entry.events.shift();entry.deleteSeqs.push(removed.seq);const bytes=storageBytes(removed);entry.eventBytes-=bytes;entry.bytes-=bytes;total-=bytes;}const oldMetaBytes=entry.metaBytes;refreshMeta(entry);entry.metaBytes=storageBytes(entry.meta);entry.bytes+=entry.metaBytes-oldMetaBytes;total+=entry.metaBytes-oldMetaBytes;while(total>limits.maxBytes&&entry.events.length>1){const removed=entry.events.shift();entry.deleteSeqs.push(removed.seq);const bytes=storageBytes(removed);entry.eventBytes-=bytes;entry.bytes-=bytes;total-=bytes;const priorMetaBytes=entry.metaBytes;refreshMeta(entry);entry.metaBytes=storageBytes(entry.meta);entry.bytes+=entry.metaBytes-priorMetaBytes;total+=entry.metaBytes-priorMetaBytes;}}
  const deletedRuns=new Set(deleteRunIds);return{bytes:Math.max(0,total),deleteRunIds:[...deletedRuns],deleteEventKeys:orphanEventKeys.concat(...kept.filter(entry=>!deletedRuns.has(entry.meta.runId)).map(entry=>entry.deleteSeqs.map(seq=>[entry.meta.runId,seq]))),metaUpdates:kept.filter(entry=>!deletedRuns.has(entry.meta.runId)&&entry.deleteSeqs.length).map(entry=>entry.meta)};
}
function requestPromise(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('IndexedDB request failed'));});}
function transactionPromise(transaction){return new Promise((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onabort=()=>reject(transaction.error||new Error('IndexedDB transaction aborted'));transaction.onerror=()=>reject(transaction.error||new Error('IndexedDB transaction failed'));});}

// Persistence is intentionally separate from the application's main state.
// IndexedDB receives small batched writes.  The localStorage fallback rewrites
// only one small event chunk, never a complete run or the complete run history.
function createRepository(options){
  options=options||{};const limits=normalizedLimits(options.limits),prefix=String(options.keyPrefix||DEFAULT_STORAGE_KEY),chunkEvents=clampInt(options.chunkEvents,10,100,40),flushDelayMs=clampInt(options.flushDelayMs,25,5000,500),storage=options.storage||(env&&env.localStorage)||null,indexedDB=options.indexedDB===false?null:(options.indexedDB||(env&&env.indexedDB)||null),keyRange=options.IDBKeyRange||(env&&env.IDBKeyRange)||null;
  let mode=indexedDB?'indexeddb':storage?'localstorage':'memory',dbPromise=null,db=null,timer=null,flushing=null,closed=false,indexedBytesKnown=false,indexedApproxBytes=0;const queue=[],highWater=new Map(),memoryMeta=new Map(),memoryEvents=new Map();
  const fallbackIndexKey=`${prefix}:index`,fallbackMetaKey=id=>`${prefix}:run:${encodeURIComponent(id)}:meta`,fallbackChunkKey=(id,index)=>`${prefix}:run:${encodeURIComponent(id)}:events:${index}`;
  function schedule(){if(closed||timer!=null)return;timer=setTimeout(()=>{timer=null;flush().catch(()=>{});},flushDelayMs);}
  function queueMeta(run){const check=validateRun(run);if(!check.valid)throw new TypeError(`Invalid ORD run log: ${check.errors.join('; ')}`);queue.push({kind:'meta',runId:run.runId,value:runMeta(run),firstRetainedSeq:num(run.firstRetainedSeq)||1});schedule();}
  function queueEvent(runId,event){if(!event||!EVENT_TYPE_SET.has(event.type)||!Number.isInteger(event.seq))throw new TypeError('Valid run-log event is required');queue.push({kind:'event',runId:String(runId),value:clonePlain(event)});highWater.set(String(runId),Math.max(num(highWater.get(String(runId))),event.seq));schedule();}
  function captureRun(run){queueMeta(run);const after=Math.max(0,num(highWater.get(run.runId)));for(const event of run.events)if(event.seq>after)queueEvent(run.runId,event);queue.push({kind:'trim',runId:run.runId,firstRetainedSeq:num(run.firstRetainedSeq)||1});schedule();return run;}
  function openDb(){
    if(!indexedDB)return Promise.reject(new Error('IndexedDB unavailable'));if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{let request;try{request=indexedDB.open(`${prefix}-db`,1);}catch(error){reject(error);return;}request.onupgradeneeded=()=>{const target=request.result;if(!target.objectStoreNames.contains('runs'))target.createObjectStore('runs',{keyPath:'runId'});if(!target.objectStoreNames.contains('events')){const store=target.createObjectStore('events',{keyPath:['runId','seq']});store.createIndex('runId','runId',{unique:false});}};request.onsuccess=()=>{db=request.result;resolve(db);};request.onerror=()=>reject(request.error||new Error('IndexedDB open failed'));});return dbPromise;
  }
  async function deleteIdbRun(database,runId){const tx=database.transaction(['runs','events'],'readwrite'),events=tx.objectStore('events');tx.objectStore('runs').delete(runId);const index=events.index('runId'),request=index.openCursor(runId);request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};await transactionPromise(tx);}
  async function enforceIndexedLimits(database){
    const readTx=database.transaction(['runs','events'],'readonly'),metaRequest=readTx.objectStore('runs').getAll(),eventRequest=readTx.objectStore('events').getAll(),[metas,storedEvents]=await Promise.all([requestPromise(metaRequest),requestPromise(eventRequest)]),targetBytes=Math.max(50000,Math.floor(limits.maxBytes*.85)),plan=indexedRetentionPlan(metas,storedEvents,Object.assign({},limits,{maxBytes:targetBytes}));if(!plan.deleteRunIds.length&&!plan.deleteEventKeys.length&&!plan.metaUpdates.length)return plan.bytes;
    const tx=database.transaction(['runs','events'],'readwrite'),runs=tx.objectStore('runs'),events=tx.objectStore('events');for(const runId of plan.deleteRunIds)runs.delete(runId);for(const key of plan.deleteEventKeys)events.delete(key);for(const meta of plan.metaUpdates)runs.put(meta);for(const runId of plan.deleteRunIds){const request=events.index('runId').openCursor(runId);request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};}await transactionPromise(tx);return plan.bytes;
  }
  async function flushIndexed(batch){
    const database=await openDb(),tx=database.transaction(['runs','events'],'readwrite'),runs=tx.objectStore('runs'),events=tx.objectStore('events');
    const lastSeqByRun=new Map();for(const op of batch){if(op.kind==='meta')runs.put(op.value);else if(op.kind==='event'){events.put(Object.assign({runId:op.runId},op.value));lastSeqByRun.set(op.runId,Math.max(num(lastSeqByRun.get(op.runId)),op.value.seq));}else if(op.kind==='trim'&&keyRange){const upper=Math.max(0,op.firstRetainedSeq-1);if(upper>0){const request=events.openCursor(keyRange.bound([op.runId,0],[op.runId,upper]));request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};}}}
    if(keyRange)for(const [runId,lastSeq] of lastSeqByRun){const upper=Math.max(0,lastSeq-limits.maxEventsPerRun);if(upper>0){const request=events.openCursor(keyRange.bound([runId,0],[runId,upper]));request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};}}
    await transactionPromise(tx);const all=await requestPromise(database.transaction('runs','readonly').objectStore('runs').getAll()),excess=all.sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt))).slice(limits.maxRuns);for(const meta of excess)await deleteIdbRun(database,meta.runId);
    const writeUpperBound=batch.reduce((sum,op)=>sum+(op.kind==='meta'?storageBytes(op.value):op.kind==='event'?storageBytes(Object.assign({runId:op.runId},op.value)):0),0);if(!indexedBytesKnown||indexedApproxBytes+writeUpperBound>limits.maxBytes){indexedApproxBytes=await enforceIndexedLimits(database);indexedBytesKnown=true;}else indexedApproxBytes+=writeUpperBound;
  }
  function loadFallbackIndex(){
    if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')throw new Error('No persistent run-log storage is available');const text=storage.getItem(fallbackIndexKey);if(!text)return{schemaVersion:SCHEMA_VERSION,updatedAt:iso(),runs:[]};try{const parsed=JSON.parse(text);return parsed&&parsed.schemaVersion===SCHEMA_VERSION&&Array.isArray(parsed.runs)?parsed:{schemaVersion:SCHEMA_VERSION,updatedAt:iso(),runs:[]};}catch(_){return{schemaVersion:SCHEMA_VERSION,updatedAt:iso(),runs:[]};}
  }
  function readChunk(runId,index){const text=storage.getItem(fallbackChunkKey(runId,index));if(!text)return[];try{const rows=JSON.parse(text);return Array.isArray(rows)?rows:[];}catch(_){return[];}}
  function flushFallback(batch){
    const index=loadFallbackIndex(),groups=new Map();for(const op of batch){if(!groups.has(op.runId))groups.set(op.runId,[]);groups.get(op.runId).push(op);}
    for(const [runId,ops] of groups){let entry=index.runs.find(item=>item.runId===runId);if(!entry){entry={runId,startedAt:'',status:'active',chunks:[],eventCount:0,prunedEventCount:0};index.runs.push(entry);}const metaOps=ops.filter(op=>op.kind==='meta');if(metaOps.length){const meta=metaOps[metaOps.length-1].value;storage.setItem(fallbackMetaKey(runId),JSON.stringify(meta));entry.startedAt=meta.startedAt;entry.status=meta.status;}
      const eventOps=ops.filter(op=>op.kind==='event').sort((a,b)=>a.value.seq-b.value.seq);for(const op of eventOps){const event=op.value;let descriptor=entry.chunks.find(item=>event.seq>=item.firstSeq&&event.seq<=item.lastSeq),chunk;if(descriptor){chunk=readChunk(runId,descriptor.index);const existing=chunk.findIndex(item=>item.seq===event.seq);if(existing>=0)chunk[existing]=event;else chunk.push(event);}else{descriptor=entry.chunks[entry.chunks.length-1];chunk=descriptor&&descriptor.count<chunkEvents?readChunk(runId,descriptor.index):null;if(!descriptor||!chunk||chunk.length>=chunkEvents){const nextIndex=entry.chunks.length?Math.max(...entry.chunks.map(item=>num(item.index)))+1:0;descriptor={index:nextIndex,firstSeq:event.seq,lastSeq:event.seq,count:0};entry.chunks.push(descriptor);chunk=[];}chunk.push(event);}chunk.sort((a,b)=>a.seq-b.seq);descriptor.firstSeq=chunk[0].seq;descriptor.lastSeq=chunk[chunk.length-1].seq;descriptor.count=chunk.length;storage.setItem(fallbackChunkKey(runId,descriptor.index),JSON.stringify(chunk));}
      const trim=ops.filter(op=>op.kind==='trim').slice(-1)[0],firstSeq=trim?trim.firstRetainedSeq:0;if(firstSeq>0){for(const descriptor of entry.chunks.slice()){let chunk=readChunk(runId,descriptor.index),removed=0;if(descriptor.lastSeq<firstSeq){removed=chunk.length;storage.removeItem(fallbackChunkKey(runId,descriptor.index));entry.chunks.splice(entry.chunks.indexOf(descriptor),1);}else if(descriptor.firstSeq<firstSeq){const kept=chunk.filter(event=>event.seq>=firstSeq);removed=chunk.length-kept.length;if(kept.length){descriptor.firstSeq=kept[0].seq;descriptor.lastSeq=kept[kept.length-1].seq;descriptor.count=kept.length;storage.setItem(fallbackChunkKey(runId,descriptor.index),JSON.stringify(kept));}else{storage.removeItem(fallbackChunkKey(runId,descriptor.index));entry.chunks.splice(entry.chunks.indexOf(descriptor),1);}}entry.prunedEventCount+=removed;}}
      entry.chunks.sort((a,b)=>a.firstSeq-b.firstSeq);entry.eventCount=entry.chunks.reduce((sum,item)=>sum+num(item.count),0);let excess=Math.max(0,entry.eventCount-limits.maxEventsPerRun);while(excess>0&&entry.chunks.length){const descriptor=entry.chunks[0],chunk=readChunk(runId,descriptor.index);if(chunk.length<=excess){excess-=chunk.length;entry.prunedEventCount+=chunk.length;storage.removeItem(fallbackChunkKey(runId,descriptor.index));entry.chunks.shift();}else{const kept=chunk.slice(excess);entry.prunedEventCount+=excess;excess=0;descriptor.firstSeq=kept[0].seq;descriptor.lastSeq=kept[kept.length-1].seq;descriptor.count=kept.length;storage.setItem(fallbackChunkKey(runId,descriptor.index),JSON.stringify(kept));}}entry.eventCount=entry.chunks.reduce((sum,item)=>sum+num(item.count),0);entry.metaBytes=String(storage.getItem(fallbackMetaKey(runId))||'').length;for(const descriptor of entry.chunks)descriptor.bytes=String(storage.getItem(fallbackChunkKey(runId,descriptor.index))||'').length;
    }
    index.runs.sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)));const removeStoredRun=removed=>{storage.removeItem(fallbackMetaKey(removed.runId));for(const chunk of removed.chunks||[])storage.removeItem(fallbackChunkKey(removed.runId,chunk.index));};for(const removed of index.runs.splice(limits.maxRuns))removeStoredRun(removed);const usedBytes=()=>JSON.stringify(index).length+index.runs.reduce((total,entry)=>total+num(entry.metaBytes)+(entry.chunks||[]).reduce((sum,chunk)=>sum+num(chunk.bytes),0),0);while(usedBytes()>limits.maxBytes&&index.runs.length>1)removeStoredRun(index.runs.pop());while(usedBytes()>limits.maxBytes&&index.runs.length&&index.runs[0].chunks.length>1){const entry=index.runs[0],removed=entry.chunks.shift();entry.eventCount-=num(removed.count);entry.prunedEventCount+=num(removed.count);storage.removeItem(fallbackChunkKey(entry.runId,removed.index));}if(usedBytes()>limits.maxBytes&&index.runs.length&&index.runs[0].chunks.length){const entry=index.runs[0],descriptor=entry.chunks[0],rows=readChunk(entry.runId,descriptor.index);while(rows.length>1&&usedBytes()>limits.maxBytes){rows.shift();entry.eventCount--;entry.prunedEventCount++;const text=JSON.stringify(rows);descriptor.firstSeq=rows[0].seq;descriptor.count=rows.length;descriptor.bytes=text.length;storage.setItem(fallbackChunkKey(entry.runId,descriptor.index),text);}}index.updatedAt=iso();storage.setItem(fallbackIndexKey,JSON.stringify(index));
  }
  function flushMemory(batch){
    for(const op of batch){if(op.kind==='meta')memoryMeta.set(op.runId,clonePlain(op.value));else if(op.kind==='event'){if(!memoryEvents.has(op.runId))memoryEvents.set(op.runId,new Map());memoryEvents.get(op.runId).set(op.value.seq,clonePlain(op.value));}else if(op.kind==='trim'&&memoryEvents.has(op.runId))for(const seq of memoryEvents.get(op.runId).keys())if(seq<op.firstRetainedSeq)memoryEvents.get(op.runId).delete(seq);}
    for(const events of memoryEvents.values())while(events.size>limits.maxEventsPerRun)events.delete(Math.min(...events.keys()));const keep=[...memoryMeta.values()].sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt))).slice(0,limits.maxRuns),ids=new Set(keep.map(meta=>meta.runId));for(const id of memoryMeta.keys())if(!ids.has(id)){memoryMeta.delete(id);memoryEvents.delete(id);}
  }
  async function flush(){
    if(flushing)return flushing;if(timer!=null){clearTimeout(timer);timer=null;}if(!queue.length)return;const batch=queue.splice(0,queue.length);flushing=(async()=>{if(mode==='indexeddb'){try{await flushIndexed(batch);return;}catch(_){mode=storage?'localstorage':'memory';dbPromise=null;db=null;}}if(mode==='localstorage')flushFallback(batch);else flushMemory(batch);})();try{await flushing;}catch(error){queue.unshift(...batch);throw error;}finally{flushing=null;if(queue.length)schedule();}
  }
  async function listRuns(){await flush();if(mode==='indexeddb'){try{const database=await openDb(),rows=await requestPromise(database.transaction('runs','readonly').objectStore('runs').getAll());return rows.sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)));}catch(_){mode=storage?'localstorage':'memory';dbPromise=null;db=null;}}if(mode==='memory')return[...memoryMeta.values()].map(clonePlain).sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)));const index=loadFallbackIndex();return index.runs.map(entry=>{const text=storage.getItem(fallbackMetaKey(entry.runId));try{return JSON.parse(text);}catch(_){return null;}}).filter(Boolean);}
  async function getRun(runId){
    await flush();let meta,events=[];if(mode==='indexeddb'){try{const database=await openDb(),tx=database.transaction(['runs','events'],'readonly');meta=await requestPromise(tx.objectStore('runs').get(String(runId)));events=await requestPromise(tx.objectStore('events').index('runId').getAll(String(runId)));}catch(_){mode=storage?'localstorage':'memory';dbPromise=null;db=null;}}if(mode==='memory'){meta=memoryMeta.get(String(runId));events=[...(memoryEvents.get(String(runId))||new Map()).values()];}else if(mode!=='indexeddb'){const text=storage.getItem(fallbackMetaKey(String(runId)));if(!text)return null;try{meta=JSON.parse(text);}catch(_){return null;}const entry=loadFallbackIndex().runs.find(item=>item.runId===String(runId));for(const descriptor of entry&&entry.chunks||[])events.push(...readChunk(String(runId),descriptor.index));}
    if(!meta)return null;events.sort((a,b)=>a.seq-b.seq);const lastSeq=events.length?events[events.length-1].seq:0,inferredDropped=Math.max(0,lastSeq-events.length);return Object.assign({},meta,{droppedEventCount:Math.max(num(meta.droppedEventCount),inferredDropped),firstRetainedSeq:events.length?events[0].seq:num(meta.firstRetainedSeq)||1,nextSeq:Math.max(num(meta.nextSeq),lastSeq+1),events});
  }
  async function clearAll(){
    if(timer!=null){clearTimeout(timer);timer=null;}queue.length=0;highWater.clear();indexedBytesKnown=false;indexedApproxBytes=0;if(mode==='indexeddb'){try{const database=await openDb(),tx=database.transaction(['runs','events'],'readwrite');tx.objectStore('runs').clear();tx.objectStore('events').clear();await transactionPromise(tx);return;}catch(_){mode=storage?'localstorage':'memory';}}
    if(mode==='memory'){memoryMeta.clear();memoryEvents.clear();return;}if(storage){const index=loadFallbackIndex();for(const entry of index.runs){storage.removeItem(fallbackMetaKey(entry.runId));for(const chunk of entry.chunks||[])storage.removeItem(fallbackChunkKey(entry.runId,chunk.index));}storage.removeItem(fallbackIndexKey);}
  }
  async function close(){closed=true;if(timer!=null){clearTimeout(timer);timer=null;}await flush();if(db&&typeof db.close==='function')db.close();}
  return{
    get mode(){return mode;},get pending(){return queue.length;},limits,
    startRun(run){queueMeta(run);return run;},appendEvent(runId,event){queueEvent(runId,event);return event;},captureRun,
    finishRun(run){queueMeta(run);for(const event of run.events)if(event.seq>num(highWater.get(run.runId)))queueEvent(run.runId,event);schedule();return run;},
    flush,listRuns,getRun,clearAll,close,
    _keys:{index:fallbackIndexKey,meta:fallbackMetaKey,chunk:fallbackChunkKey}
  };
}

const OUTCOME_DEFAULTS=Object.freeze({
  r50_failed:{terminal:true,status:'failed'},r50_killed:{terminal:false,status:'active'},r51_65_failed:{terminal:true,status:'failed'},r65_cleared:{terminal:true,status:'completed'},abandoned:{terminal:true,status:'abandoned'}
});
function createRecorder(options){
  options=options||{};const repository=options.repository||createRepository(options.persistence||options),baseRunOptions={app:plain(options.app||{}),game:plain(options.game||{version:'2.305',difficulty:'nightmare'}),limits:options.limits};let run=null,loading=true,destroyed=false,manualStart=false;
  const readyPromise=(async()=>{try{const metas=await repository.listRuns();if(!run&&options.resume!==false){const active=metas.find(item=>item.status==='active');if(active)run=await repository.getRun(active.runId);}}catch(_){/* Logging must never block the helper when browser storage is denied. */}finally{loading=false;}return api;})();
  function ensureAlive(){if(destroyed)throw new Error('ORD run recorder is destroyed');}
  function startRun(runOptions){
    ensureAlive();runOptions=runOptions||{};manualStart=true;if(run&&run.status==='active'&&!runOptions.force)return run;if(run&&run.status==='active'&&runOptions.force){const ended=recordOutcome('abandoned',{reason:'new-run-started'},{terminal:true,at:runOptions.startedAt});if(!ended)finishRun(run,'abandoned',null,{at:runOptions.startedAt});}
    run=createRun(Object.assign({},baseRunOptions,runOptions,{app:Object.assign({},baseRunOptions.app,plain(runOptions.app||{})),game:Object.assign({},baseRunOptions.game,plain(runOptions.game||{}))}));repository.startRun(run);return run;
  }
  function ensureRun(context){return run||startRun({startedAt:context&&context.at});}
  function persistResult(result){if(result&&result.event)repository.appendEvent(result.run.runId,result.event);return result;}
  function record(type,payload,context){
    ensureAlive();context=context||{};const current=ensureRun(context),aliases={userAction:'user-action',action:'user-action'},eventType=aliases[type]||type;let result;if(eventType==='snapshot')result=recordSnapshot(current,payload,context);else if(eventType==='decision')result=recordDecision(current,payload,context);else if(eventType==='user-action')result=recordUserAction(current,payload,context);else if(eventType==='outcome')result=recordOutcomeEvent(current,payload,context);else throw new TypeError(`Unsupported recorder event type: ${type}`);persistResult(result);return result;
  }
  // Alias avoids shadowing the public recordOutcome method below.
  function recordOutcomeEvent(current,payload,context){return append(current,'outcome',payload,context);}
  function recordOutcome(kind,details,context){
    ensureAlive();context=context||{};const defaults=OUTCOME_DEFAULTS[kind]||{terminal:false,status:'active'},terminal=context.terminal==null?defaults.terminal:context.terminal===true,result=record('outcome',Object.assign({kind:String(kind||'unknown')},plain(details||{})),context);if(terminal){const status=['completed','failed','abandoned'].includes(context.status)?context.status:defaults.status==='active'?'completed':defaults.status;finishRun(result.run,status,null,context);repository.finishRun(result.run);}return result;
  }
  function endRun(status,details,context){
    ensureAlive();context=context||{};if(!run)return null;const normalized=['completed','failed','abandoned'].includes(status)?status:'abandoned';if(details)record('outcome',Object.assign({kind:details.kind||normalized},plain(details)),context);finishRun(run,normalized,null,context);repository.finishRun(run);return run;
  }
  function summary(){
    const events=run&&run.events||[],counts={snapshot:0,decision:0,'user-action':0,outcome:0};for(const event of events)counts[event.type]=num(counts[event.type])+1;const lastRound=[...events].reverse().find(event=>event.round!=null),lastDecision=[...events].reverse().find(event=>event.type==='decision'),lastOutcome=[...events].reverse().find(event=>event.type==='outcome');return{ready:!loading,hasRun:!!run,runId:run&&run.runId||null,status:run&&run.status||'idle',startedAt:run&&run.startedAt||null,endedAt:run&&run.endedAt||null,eventCount:events.length,droppedEventCount:num(run&&run.droppedEventCount),lastRound:lastRound?lastRound.round:null,eventTypes:counts,lastDecisionFingerprint:lastDecision&&lastDecision.decisionFingerprint||null,lastOutcome:lastOutcome&&lastOutcome.payload&&lastOutcome.payload.kind||null,persistence:repository.mode,pendingWrites:num(repository.pending)};
  }
  function peekEvents(limit){const count=clampInt(limit,1,500,50);return clonePlain((run&&run.events||[]).slice(-count));}
  function exportObject(){return run?clonePlain(run):null;}
  function exportJson(exportOptions){if(!run)throw new Error('No ORD run is active or restored');return exportRun(run,exportOptions);}
  async function clearAll(){ensureAlive();run=null;await repository.clearAll();return true;}
  async function flush(){ensureAlive();await repository.flush();return summary();}
  async function destroy(){if(destroyed)return;await repository.flush();await repository.close();destroyed=true;}
  const api={ready(){return readyPromise;},startRun,record,recordOutcome,endRun,summary,peekEvents,exportObject,exportJson,clearAll,flush,destroy,get currentRun(){return run;},get repository(){return repository;}};
  if(options.autoStart===true&&!manualStart)startRun(options.run||{});return api;
}

return{
  SCHEMA_NAME,HISTORY_SCHEMA_NAME,SCHEMA_VERSION,DEFAULT_STORAGE_KEY,DEFAULT_LIMITS,EVENT_TYPES,EVENT_SOURCES,
  plain,stableStringify,fingerprint,snapshotFingerprint,decisionFingerprint,
  createRun,recordSnapshot,recordDecision,recordUserAction,recordOutcome,finishRun,boundRun,
  validateRun,exportRun,importRun,createHistory,putRun,pruneHistory,validateHistory,createRepository,createRecorder,OUTCOME_DEFAULTS,
  _test:{redactString,scanUnsafe,historyBytes,eventSnapshotFingerprint,latestSnapshot,runMeta,storageBytes,indexedRetentionPlan}
};
});
