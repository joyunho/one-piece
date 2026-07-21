'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const P=require(path.join(EXT,'ord_squad_planner.js'));
require(path.join(EXT,'ord_app.js'));
const C=global.ORDCore;
const App=global.ORDApp.App;

const tests=[];
function test(name,fn){tests.push([name,fn]);}

function fixture(){
  const materials=[
    {id:'fixture-rare',name:'희귀 재료',groupName:'희귀함',abilities:{},stuffs:[]},
    {id:'fixture-special',name:'특별 재료',groupName:'특별함',abilities:{},stuffs:[]},
    {id:'fixture-uncommon',name:'안흔 재료',groupName:'안흔함',abilities:{},stuffs:[]},
    {id:'fixture-common',name:'흔함 재료',groupName:'흔함',abilities:{},stuffs:[]}
  ];
  const upper={id:'fixture-upper',name:'검증 상위',groupName:'초월 [물딜]',abilities:{},stuffs:[]};
  const supportIds=['rare-first','special-second','uncommon-third','common-fourth','low-wisp','high-wisp'];
  const supports=supportIds.map(id=>({id,name:id,groupName:'전설 [물딜]',abilities:{},stuffs:[]}));
  const db=C.buildDb(materials.concat(upper,supports));
  const counts={
    'fixture-rare':10,
    'fixture-special':10,
    'fixture-uncommon':10,
    'fixture-common':10,
    [C.WISP_ID]:100
  };
  const state={db,counts,percent:{},currentAbilities:{}};
  return{db,state,upper:db.byId.get(upper.id)};
}

const BURNS={
  'rare-first':[2,0,0,0,20],
  'special-second':[1,2,0,0,20],
  'uncommon-third':[1,1,2,0,20],
  'common-fourth':[1,1,1,2,20],
  'low-wisp':[1,1,1,1,1],
  'high-wisp':[1,1,1,1,3]
};
const EXPECTED=['rare-first','special-second','uncommon-third','common-fourth','low-wisp','high-wisp'];

function consumed(vector){
  return{
    'fixture-rare':vector[0],
    'fixture-special':vector[1],
    'fixture-uncommon':vector[2],
    'fixture-common':vector[3]
  };
}

test('upper support list consumes Rare, Special, Uncommon and Common lexicographically, then minimizes wisps',()=>{
  const {db,state,upper}=fixture();
  const rows=Object.entries(BURNS).map(([id,vector])=>({
    unit:db.byId.get(id),
    feasible:true,
    pairSynergy:null,
    coverage:10,
    valueStatus:'efficient',
    solve:{wispCost:vector[4],consumed:consumed(vector)}
  }));
  const profile=C.upperProfileData(state,upper,{mode:'physical',rows},null,null);

  // The live card surface shows only ranks 1~3, while rankedSupports keeps the
  // complete deterministic order for previews, diagnostics and regressions.
  assert.deepStrictEqual(profile.now.map(row=>row.unit.id),EXPECTED.slice(0,3));
  assert.deepStrictEqual(profile.rankedSupports.map(row=>row.unit.id),EXPECTED);
});

test('physical armor and minimum stun share one hard-priority stage before hand burn',()=>{
  const {db,state,upper}=fixture(),make=(id,vector,key,label)=>({
    unit:db.byId.get(id),feasible:true,pairSynergy:null,coverage:10,valueStatus:'efficient',
    solve:{wispCost:vector[4],consumed:consumed(vector)},
    impact:{rows:[{key,label,gapBefore:1,gapAfter:0,closed:true}],regressed:[]}
  }),rows=[
    make('common-fourth',[0,0,0,2,0],'armor','상시 풀방깎'),
    make('rare-first',[1,0,0,0,10],'stunBase','최소 0.5스턴')
  ],profile=C.upperProfileData(state,upper,{mode:'physical',deficits:{clearRows:[
    {key:'armor',label:'상시 풀방깎'},{key:'stunBase',label:'최소 0.5스턴'}
  ]},rows},null,null);
  assert.strictEqual(profile.now[0].unit.id,'rare-first','equal physical hard gates were incorrectly ordered before Rare burn');
});

function comparableNode(id,vector,complete=true){
  const rows=complete?[]:[{key:'armor',label:'상시 풀방깎',required:true,current:179,target:180,gap:1,weight:110}];
  const used={
    rare:vector[0],
    special:vector[1],
    uncommon:vector[2],
    common:vector[3],
    wisp:vector[4],
    commonPressure:0
  };
  return{
    id,
    target:7,
    projectedCount:7,
    complete,
    requirements:{complete,readiness:complete?100:99,route:'physical',rows},
    requiredDebt:complete?0:1/180,
    used,
    rareClearedTypes:0,
    rareUsedTypes:0,
    excessStun:0,
    excessSlow:0,
    handFit:{metrics:{
      rareSpent:used.rare,
      specialSpent:used.special,
      uncommonSpent:used.uncommon,
      commonSpent:used.common,
      wispSubstitute:used.wisp,
      rareScore:0,
      lowerScore:0,
      weightedClearedTypes:0,
      weightedUsedTypes:0,
      commonSubstituted:0,
      commonPressure:0,
      weightedSpent:0
    }},
    blueprintMatched:0,
    materialOverlap:{penalty:0},
    score:0,
    actions:[{id}]
  };
}

test('planner node comparison uses the same four-tier lexicographic order and exact-tie wisp rule',()=>{
  const ranked=Object.entries(BURNS)
    .map(([id,vector])=>comparableNode(id,vector))
    .sort(P._test.nodeCompare);
  assert.deepStrictEqual(ranked.map(row=>row.id),EXPECTED);
});

test('a hard-clear-complete support stays ahead of a higher-burn incomplete support',()=>{
  const clear=comparableNode('clear',[0,0,0,0,20],true);
  const incomplete=comparableNode('incomplete',[99,99,99,99,0],false);
  assert(P._test.nodeCompare(clear,incomplete)<0);
  assert.strictEqual([incomplete,clear].sort(P._test.nodeCompare)[0].id,'clear');
});

test('an unused Rare is rerolled even while the selected final party is incomplete',()=>{
  const catalog=global.ORD_TMO_UNITS,db=C.buildDb(catalog),rare=db.rares[0];
  const state={db,counts:{[rare.id]:1},percent:{},currentAbilities:{}};
  const app=Object.create(App.prototype);app.state={locks:[],virtualSpecialId:''};
  const rareAllocation=[{id:rare.id,initial:1,spent:0,reserved:0,remaining:1}];
  const plan=(complete)=>({squadPlan:{
    targetCount:9,
    plannedCount:complete?9:8,
    roleCoverage:{planned:{complete}},
    wispBudget:{fullPartyFeasible:complete},
    handFit:{feasible:complete},
    rareAllocation,
    timelineReadiness:{rare:{rows:[{id:rare.id,name:C.displayNameOf(rare),initial:1,spent:0,hold:0,reroll:1,deadlineRound:40,reason:'선택 파티의 현재 유효 사용처 없음',destinations:[]}],owned:1,spentNow:0,actionableReserved:0,unassigned:1,conflict:0,pass:false}}
  }});

  const incomplete=app.renderRareResolution(state,plan(false));
  assert.match(incomplete,/class="hold"><h3>보류 <small>0장<\/small>/);
  assert.match(incomplete,/class="reroll"><h3>리롤 <small>1장<\/small>/);

  const complete=app.renderRareResolution(state,plan(true));
  assert.match(complete,/class="hold"><h3>보류 <small>0장<\/small>/);
  assert.match(complete,/class="reroll"><h3>리롤 <small>1장<\/small>/);
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();passed++;console.log('PASS',name);}
  catch(error){console.error('FAIL',name);throw error;}
}
console.log(`Lexicographic support ranking v14.0.0 tests: ${passed}/${tests.length} passed`);
