'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js','ord_app.js'])require(path.join(EXT,file));

const C=global.ORDCore,App=global.ORDApp.App,catalog=global.ORD_TMO_UNITS,db=C.buildDb(catalog);
const counts={[C.WISP_ID]:100};
for(const unit of catalog)if(C.isCommon(unit)||C.isUncommon(unit)||C.isSpecialTier(unit)||C.isRare(unit))counts[unit.id]=8;
for(const id of Object.keys(C.SPECIAL_IDS))counts[id]=4;
const state=C.normalizeState(catalog,{source:'fixture',counts,units:[],currentAbilities:{}},{currentRound:45,mode:'physical',manualCounts:{}});
const settings={currentRound:45,mode:'physical',targetSquadCount:9,manualCounts:{},allowWarped:true,recommendWarped:true,superKumaOwned:true};
const corePlan=C.recommendationPlan(state,[],settings,global.ORD_UPPER_MEMO,global.ORD_SYNERGY_MEMO);
assert.strictEqual(corePlan.watchCap,6);
assert(corePlan.watch.length<=6,`core returned ${corePlan.watch.length} watch candidates`);

const rows=db.legendish.filter(unit=>C.familyOf(unit)==='physical').slice(0,8).map((unit,index)=>({
  unit,progress:80-index,watchKind:'alternative',watchReason:'fixture'
}));
assert.strictEqual(rows.length,8,'fixture requires eight valid watch rows');
const app=Object.create(App.prototype);
app.state={
  snapshot:{source:'tmo',sessionId:'watch-cap',seq:1,dataHash:'watch-cap',dataChangedAt:1},
  locks:[],upperBlueprint:null,watchStability:{}
};
const wide={mode:'physical',purpose:'spec',upper:null,watchCap:99,actions:[],watch:rows,rows};
app.stabilizeWatch(wide,state,settings);
assert.strictEqual(wide.watch.length,6,'UI stabilization did not enforce the six-candidate cap');
assert.deepStrictEqual(wide.watch.map(row=>row.unit.id),rows.slice(0,6).map(row=>row.unit.id));

console.log('PASS  core and UI expose at most six advance candidates');
