'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of [
  'ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js',
  'ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js'
])require(path.join(EXT,file));

const C=global.ORDCore,M=global.ORDV15Model,E=global.ORDV15Engine;
const wisp={id:C.WISP_ID,name:'선택위습',groupName:'특수재료',abilities:{},stuffs:[]};
const reward={id:'v152-special',name:'152 보상 특별함',groupName:'특별함',abilities:{},stuffs:[{id:C.WISP_ID,count:4}]};
const helped={id:'v152-helped-rare',name:'예상치 역전 희귀',groupName:'희귀함',abilities:{},stuffs:[{id:reward.id,count:1},{id:C.WISP_ID,count:6}]};
const plain={id:'v152-plain-rare',name:'원본 1위 희귀',groupName:'희귀함',abilities:{},stuffs:[{id:C.WISP_ID,count:10}]};
const catalog=[wisp,reward,helped,plain];

function input({virtualSpecialId='',rewardCount=0,helpedPercent=35,plainPercent=60}={}){
  const counts={[C.WISP_ID]:100,[reward.id]:rewardCount};
  const percents={[helped.id]:helpedPercent,[plain.id]:plainPercent};
  const units=catalog.map(unit=>Object.assign({},unit,{count:Number(counts[unit.id]||0),tmoPercent:Number(percents[unit.id]||0)}));
  return{
    catalog,
    snapshot:{source:'v152-fixture',sessionId:'v152',seq:1,at:1,dataChangedAt:1,wispCountFound:true,wispCount:100,counts,units,currentAbilities:{}},
    settings:{currentRound:5,mode:'physical',magicRoute:'auto',postLegendRoute:'',manualCounts:{},superKumaOwned:false,wispOverride:'',virtualSpecialId,gorosei:'none'},
    locks:[]
  };
}

// No selection: live TMO completion remains the only ranking authority.
{
  const model=M.build(input()),detail=M.completionFor(model,helped),decision=E.decide(Object.assign(input(),{model}));
  assert.strictEqual(detail.originalTmoPercent,35);
  assert.strictEqual(detail.predictedTmoPercent,35);
  assert.strictEqual(detail.isProjected,false);
  assert.strictEqual(decision.action.id,plain.id);
}

// Selecting the absent 152 reward adds only its exact recipe-distance delta:
// 4 saved wisp-equivalents / 10 total = +40 percentage points.
{
  const source=input({virtualSpecialId:reward.id}),model=M.build(source),detail=M.completionFor(model,helped),unaffected=M.completionFor(model,plain),decision=E.decide(Object.assign({},source,{model}));
  assert.strictEqual(model.observed.counts[reward.id]||0,0,'scenario reward leaked into observed TMO evidence');
  assert.strictEqual(model.effective.counts[reward.id],1);
  assert.strictEqual(model.patch.virtualSpecial.applied,true);
  assert.strictEqual(detail.originalTmoPercent,35);
  assert.strictEqual(detail.predictedTmoPercent,75);
  assert.strictEqual(detail.delta,40);
  assert.strictEqual(detail.isProjected,true);
  assert.strictEqual(detail.method,'observed-tmo-plus-recipe-counterfactual');
  assert.deepStrictEqual(
    {total:detail.recipe.totalWispEquivalent,before:detail.recipe.beforeWispEquivalent,after:detail.recipe.afterWispEquivalent,saved:detail.recipe.savedWispEquivalent,consumed:detail.recipe.materialConsumed},
    {total:10,before:10,after:6,saved:4,consumed:1}
  );
  assert.strictEqual(unaffected.originalTmoPercent,60);
  assert.strictEqual(unaffected.predictedTmoPercent,60);
  assert.strictEqual(unaffected.isProjected,false);
  assert.strictEqual(decision.action.id,helped.id,'first Rare did not use the 152-inclusive predicted TMO ranking');
  assert.strictEqual(decision.action.row.progressOriginal,35);
  assert.strictEqual(decision.action.row.progressPredicted,75);
  assert.strictEqual(decision.action.completion.isProjected,true);
  assert.match(decision.reason,/예상 TMO 완성도 75%/);
  assert.match(decision.reason,/원 TMO 35%/);
  assert.strictEqual(decision.evidence.completionBasis,'observed-tmo-plus-recipe-counterfactual');
}

// Once TMO really reports the reward, its live completion already includes
// that card. Keeping the selector temporarily set must not add the delta twice.
{
  const source=input({virtualSpecialId:reward.id,rewardCount:1,helpedPercent:75}),model=M.build(source),detail=M.completionFor(model,helped),decision=E.decide(Object.assign({},source,{model}));
  assert.strictEqual(model.patch.virtualSpecial.applied,false);
  assert.strictEqual(model.patch.virtualSpecial.alreadyObserved,true);
  assert.strictEqual(model.effective.counts[reward.id],1);
  assert.strictEqual(detail.originalTmoPercent,75);
  assert.strictEqual(detail.predictedTmoPercent,75);
  assert.strictEqual(detail.delta,0);
  assert.strictEqual(detail.isProjected,false);
  assert.strictEqual(detail.reason,'actual-special-already-observed');
  assert.strictEqual(decision.action.id,helped.id);
  assert.doesNotMatch(decision.reason,/\+40/);
  assert.strictEqual(decision.evidence.completionBasis,'observed-tmo');
}

console.log('PASS v15.1 keeps original TMO completion separate from 152-reward prediction');
console.log('PASS v15.1 first-Rare ranking uses the projected value and prevents double counting');
