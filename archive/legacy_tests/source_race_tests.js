'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const ext=path.resolve(process.argv[2]||path.join(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild'));
assert(fs.existsSync(path.join(ext,'background.js')),'v13 extension directory not found');

function backgroundHarness(){
  const code=fs.readFileSync(path.join(ext,'background.js'),'utf8');
  const storage={},listeners={},removed=[];
  let delayNextSnapshot=false,delayGets=false;
  const chrome={
    storage:{local:{
      get(keys,callback){const out={};for(const key of keys)out[key]=storage[key];setTimeout(()=>callback(out),delayGets?25:0);},
      set(update,callback){const delayed=delayNextSnapshot&&update.ordLatestSnapshot;if(delayed)delayNextSnapshot=false;setTimeout(()=>{Object.assign(storage,update);if(callback)callback();},delayed?60:0);}
    }},
    runtime:{onMessage:{addListener(listener){listeners.message=listener;}},getURL:value=>value,lastError:null},
    tabs:{
      query(query,callback){callback([]);},create(options,callback){if(callback)callback({id:99,url:options.url});},
      update(id,options,callback){if(callback)callback({id});},onRemoved:{addListener(listener){removed.push(listener);}}
    }
  };
  vm.runInNewContext(code,{chrome,console,Map,Set,Promise,Date,Math,Number,String,Object,Array,JSON,Error,setTimeout,clearTimeout});
  function dispatch(message,tabId=0){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`message timeout: ${message.type}`)),2000);listeners.message(message,tabId?{tab:{id:tabId}}:{},result=>{clearTimeout(timer);resolve(result);});});}
  function snapshot(helperId,dataHash='hand-a',seq=1,at=Date.now()){
    const units=Array.from({length:307},(_,index)=>({id:`u${index}`,name:`unit-${index}`,count:0,countFound:true}));
    return{
      source:'tmo',parser:'ord-tmo-parser-v13-adapter',adapterId:helperId==='32172'?'tmo-32172-main':'tmo-34366-compat',
      helperId,url:`https://tmo.gg/ko/build-helper/${helperId}`,sessionId:'race-session',seq,dataHash,
      scanAt:at,dataChangedAt:at,at,unitCount:units.length,units,counts:Object.fromEntries(units.map(unit=>[unit.id,0])),
      wispCount:0,wispCountFound:true,collection:{found:true,confidence:.95,errors:[]},countDiscovery:{found:true,parsed:units.length,missing:0,ambiguous:0,confidence:1,errors:[]}
    };
  }
  return{storage,removed,dispatch,snapshot,setDelaySnapshot(){delayNextSnapshot=true;},setDelayGets(value){delayGets=value;}};
}

async function verifySnapshotPinRace(){
  const h=backgroundHarness();
  await h.dispatch({type:'ORD_PIN_SOURCE',tabId:11,helperId:'32172',url:'https://tmo.gg/ko/build-helper/32172'});
  h.setDelaySnapshot();
  const oldWrite=h.dispatch({type:'ORD_SNAPSHOT',snapshot:h.snapshot('32172')},11);
  await new Promise(resolve=>setTimeout(resolve,10));
  const pinB=await h.dispatch({type:'ORD_PIN_SOURCE',tabId:22,helperId:'34366',url:'https://tmo.gg/ko/build-helper/34366'});
  await oldWrite;
  assert.strictEqual(pinB.sourceEpoch,2);
  assert.strictEqual(h.storage.ordPinnedTmoTabId,22);
  assert.strictEqual(h.storage.ordPinnedHelperId,'34366');
  assert.strictEqual(h.storage.ordPinnedSourceEpoch,2);
  assert.strictEqual(h.storage.ordLatestSnapshot,null,'old source snapshot survived a source change');
  assert.strictEqual(h.storage.ordLatestHeartbeat,null,'old source heartbeat survived a source change');
}

async function verifyRemovedTabRace(){
  const h=backgroundHarness();
  await h.dispatch({type:'ORD_PIN_SOURCE',tabId:11,helperId:'32172',url:'https://tmo.gg/ko/build-helper/32172'});
  h.setDelayGets(true);
  h.removed[0](11);
  await new Promise(resolve=>setTimeout(resolve,1));
  const pinB=await h.dispatch({type:'ORD_PIN_SOURCE',tabId:22,helperId:'34366',url:'https://tmo.gg/ko/build-helper/34366'});
  const source=await h.dispatch({type:'ORD_GET_SOURCE'});
  assert.strictEqual(pinB.ok,true);
  assert.strictEqual(source.tabId,22,'late onRemoved unpinned the newly selected tab');
  assert.strictEqual(source.helperId,'34366');
  assert.strictEqual(h.storage.ordPinnedTmoTabId,22);
}

(async()=>{
  await verifySnapshotPinRace();
  await verifyRemovedTabRace();
  console.log('PASS  source pin serializes against a delayed v13 snapshot write');
  console.log('PASS  removal of an old tab cannot unpin a newly selected helper');
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
