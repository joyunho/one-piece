'use strict';

const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js'])require(path.join(EXT,file));
const C=global.ORDCore;
const P=require(path.join(EXT,'ord_squad_planner.js'));

const counts={
  '300h':5,'200h':8,'100h':10,'700h':5,'400h':9,'800h':4,'500h':8,'900h':9,'600h':5,
  'G00h':2,'O00h':1,'N00h':1,'E00h':2,'L00h':2,
  'B00h':1,'E10h':1,'I10h':2,'A10h':1,'710h':1,'R00h':1,'P00h':1,
  'Z10h':1,'C20h':1,'320h':1,'K20h':2,'L50h':1,
  [C.WISP_ID]:1
};
const state=C.normalizeState(global.ORD_TMO_UNITS,{counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});
const result=P.planFinalSquad({state,settings:{
  mode:'physical',currentRound:25,targetSquadCount:9,targetLegendEquivalent:9,
  upperPreviewId:'190H',superKumaOwned:true,recommendWarped:true
}});
const rows=result.finalLineup.map(row=>{
  const unit=row.unit||state.db.byId.get(row.id),profile=C.roleProfile(unit);
  return{
    name:C.displayNameOf(unit),group:C.groupName(unit),status:row.status,
    story:C.storyGrade(unit).label,stun:profile.stun,
    slow:profile.slow+profile.triggerSlow,armor:profile.armor+profile.triggerArmor,
    boss:profile.boss,frenzy:profile.frenzy,
    damageProxy:{support:profile.supportDamage,percent:profile.percent,single:profile.single,end:profile.end}
  };
});

process.stdout.write(`${JSON.stringify({rows,decision:result.decision,route:result.routeEvaluation,wispBudget:result.wispBudget,safePrefix:result.safePrefix,timeline:result.timelineReadiness},null,2)}\n`);
