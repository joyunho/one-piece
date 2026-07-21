'use strict';
const assert=require('assert');
const path=require('path');
const fs=require('fs');
const candidates=[path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild')];
const EXT=candidates.find(p=>fs.existsSync(path.join(p,'ord_core.js')));assert(EXT,'extension directory not found');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const C=ORDCore,units=ORD_TMO_UNITS;
let seed=230510;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}function int(n){return Math.floor(random()*n);}
const rounds=[1,5,8,9,15,20,21,30,39,40,45,51,55,65],modes=['','physical','magic'];
for(let ix=0;ix<240;ix++){
  const counts={[C.WISP_ID]:int(91)},progress={},currentAbilities={};
  for(const u of units){if(C.isCommon(u))counts[u.id]=int(7);else if(C.isUncommon(u)||C.isSpecialTier(u))counts[u.id]=int(4);else if(C.isRare(u)&&random()<.38)counts[u.id]=1+int(3);else if(C.isLegendish(u)&&random()<.04)counts[u.id]=1;if(C.isUpper(u))progress[u.id]=int(101);}
  if(ix%9===0){const upper=units.filter(C.isUpper)[int(units.filter(C.isUpper).length)];counts[upper.id]=1;}
  if(ix%3===0)Object.assign(currentAbilities,{'스턴':Math.round(random()*20)/10,'이동속도 감소':int(130),'방어력 감소':int(230)});
  const settings={mode:modes[ix%modes.length],magicRoute:'auto',targetSquadCount:9,purpose:'',gorosei:['none','nasjuro','warcury','saturn'][ix%4],superKumaOwned:ix%5!==0,virtualSpecialId:'',wispOverride:'',upperPreviewId:'',currentRound:rounds[ix%rounds.length],manualCounts:{},allowWarped:true,recommendWarped:ix%2===0};
  const now=Date.now(),live=Object.entries(progress).map(([id,p])=>({id,count:counts[id]||0,tmoPercent:p,percent:p})),snapshot={at:now,scanAt:now,bridgeAt:now,dataChangedAt:now,source:'tmo',parser:'ord-tmo-parser-v13-adapter',helperId:'32172',unitCount:units.length,collection:{found:true,confidence:.95},countDiscovery:{found:true,parsed:units.length,missing:0,ambiguous:0},wispCountFound:true,abilityCount:Object.keys(currentAbilities).length,units:live,counts,currentAbilities},state=C.normalizeState(units,snapshot,settings),plan=C.recommendationPlan(state,[],settings,ORD_UPPER_MEMO,ORD_SYNERGY_MEMO);
  assert(plan.actions.length<=plan.actionCap);if(plan.selectionMode!=='queue')assert.strictEqual(new Set(plan.actions.map(x=>x.unit.id)).size,plan.actions.length);if(plan.completionForced){assert.strictEqual(plan.actions[0]&&plan.actions[0].unit.id,plan.rows[0]&&plan.rows[0].unit.id);assert(plan.actions.every((row,index)=>index===0||plan.actions[index-1].progress>=row.progress));}else assert(plan.actions.every(x=>x.feasible));
  assert(plan.watch.length<=plan.watchCap);assert.strictEqual(new Set(plan.watch.map(x=>x.unit.id)).size,plan.watch.length);assert(plan.watch.every(x=>!plan.actions.some(a=>a.unit.id===x.unit.id)&&!C.num(state.counts[x.unit.id])));assert(plan.watch.every(x=>['unlock','material','wisp','progress','alternative','value'].includes(x.watchKind)&&x.watchReason));
  const rareTotal=state.db.rares.reduce((sum,u)=>sum+C.num(state.counts[u.id]),0),plannedRare=plan.selectionMode==='queue'?plan.actions.reduce((sum,row)=>sum+row.rareSpend.total,0):C.num(plan.actions[0]&&plan.actions[0].rareSpend.total);assert.strictEqual(plan.rareInventory.total,rareTotal);assert.strictEqual(plan.rareInventory.protected,0);assert.strictEqual(plan.rareInventory.expendable,rareTotal);assert(Number.isFinite(plan.rarePressure.score)&&plan.rarePressure.score>=0&&plan.rarePressure.score<=100);assert(['safe','watch','high','critical'].includes(plan.rarePressure.status));assert.match(plan.rarePressure.note,/총 \d+장 · 보호 \d+장 · 소진 가능 \d+장 · 목표 \d+장/);assert.strictEqual(plan.rareSpend.plannedSpend,plannedRare);assert.strictEqual(plan.rareSpend.after,rareTotal-plannedRare);assert(plan.rareSpend.after>=plan.rareSpend.protected);assert(plan.actions.every(row=>row.rareSpend.total===Object.values(row.solve.rareUse||{}).reduce((s,n)=>s+C.num(n),0)&&row.rareAfter>=0));
  if(plan.purpose==='rare')assert(plan.actions.every(x=>C.isRare(x.unit)));if(plan.purpose==='story')assert(plan.actions.every(x=>/^전설|^히든/.test(C.groupName(x.unit))));if(plan.purpose==='upper')assert(plan.actions.every(x=>C.isUpper(x.unit)&&x.progress>=80));
  if(plan.purpose==='upper')assert(plan.watch.every(x=>C.isUpper(x.unit)&&x.progress>=60));
  if(plan.selectionMode==='queue'){let stock=Object.assign({},plan.reserved.stock);if(plan.projectedUpper&&!state.counts[plan.projectedUpper.id])stock[plan.projectedUpper.id]=(stock[plan.projectedUpper.id]||0)+1;let wisp=plan.availableWisp;for(const row of plan.actions){assert.strictEqual(row.availableWisp,wisp);assert.strictEqual(C.num(stock[row.unit.id]),0,'queue may repeat a unit only after it was consumed');assert(row.coverage>=0,'compatible queue must never lower clear readiness solely to burn rares');const solve=C.recipeSolve(state.db,row.unit.id,stock);assert.strictEqual(solve.wispCost,row.solve.wispCost);stock=solve.stockAfter;wisp=Math.max(0,wisp-solve.wispCost);stock[C.WISP_ID]=wisp;stock[row.unit.id]=(stock[row.unit.id]||0)+1;}assert(wisp>=0);}
  for(const row of C.rareResolution(state,plan,[])){assert(row.use>=0&&row.hold>=0&&row.reroll>=0);assert.strictEqual(row.use+row.hold+row.reroll,row.have);}
  for(const value of Object.values(plan.spec))if(typeof value==='number')assert(Number.isFinite(value));
}
console.log('PASS  240 deterministic recommendation scenarios');
