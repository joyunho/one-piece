'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore,units=global.ORD_TMO_UNITS;

// Compact fixture reconstructed from run ord-mrtg6lu5-a09fe855, snapshot seq
// 309 (R30).  Only the candidate percentages affect this regression.
const counts={
  '100h':8,'200h':3,'300h':1,'400h':4,'500h':7,'510h':1,'540h':1,'600h':3,'700h':3,'810e':4,'900h':2,'910h':1,
  'A00h':1,'C00h':1,'D00h':3,'E00h':1,'F00h':1,'G20h':1,'H30h':1,'H40h':1,'K00h':2,'M00h':1,'M20h':1,'N00h':1,
  'O00h':1,'Q00h':1,'R10h':1,'W20h':1,'X00h':1,'unit_1767884906256_4990':1,'unit_1767884970331_9084':1,'unit_1779015467592_9245':1
};
const progress={I70h:92,J40h:58};
const snapshot={counts,currentAbilities:{'공격력 증가':45,'공격속도 증가':5,'광폭화':1,'방어력 감소':87,'보스 잡기':1,'순간이동':1,'스턴':.9,'이동속도 감소':30},units:units.map(unit=>({id:unit.id,count:counts[unit.id]||0,tmoPercent:progress[unit.id]||0}))};
const settings={mode:'physical',magicRoute:'physical',currentRound:30,targetSquadCount:9,targetLegendEquivalent:9,gorosei:'nasjuro',superKumaOwned:true,recommendWarped:true};
const state=C.normalizeState(units,snapshot,settings),ranked=P.rankUpperBlueprints({state,settings},{candidateIds:['I70h','J40h']}),byId=new Map(ranked.map(row=>[row.upperId,row])),katakuri=byId.get('I70h'),roger=byId.get('J40h');

assert(katakuri&&roger,'R30 upper candidates were not ranked');
for(const row of [katakuri,roger]){
  assert(row.candidateProjection,'candidate role projection is missing');
  assert.strictEqual(row.candidateProjection.includedUpperId,row.upperId);
  assert.strictEqual(row.candidateProjection.hypothetical,true,'an unowned upper must stay explicitly hypothetical');
  assert.strictEqual(row.candidateProjection.resourceVerified,false,'a hypothetical role sheet must not claim resources');
  if(!row.containsUpper)assert(!row.blueprint.lineupIds.includes(row.upperId),'hypothetical upper leaked into the committed material blueprint');
  assert.deepStrictEqual(row.requirementPriority,row.candidateProjection.requirementPriority,'ranking did not use the candidate role projection');
  assert.strictEqual(row.readiness,row.candidateProjection.readiness);
  assert.strictEqual(row.guaranteed,false,'an omitted/unowned candidate became a guaranteed party');
  assert.strictEqual(row.clearComplete,false,'a hypothetical candidate became a clear claim');
  assert(row.upperPreparation&&row.upperPreparation.recipeVerified,'upper preparation recipe was not audited');
}
assert(roger.candidateProjection.spec.armor>katakuri.candidateProjection.spec.armor,'Roger armor was not projected');
assert(roger.candidateProjection.spec.slow>katakuri.candidateProjection.spec.slow,'Roger slow was not projected');
assert.notDeepStrictEqual(roger.requirementPriority,katakuri.requirementPriority,'distinct upper roles collapsed to one support-only rank vector');
assert(katakuri.upperPreparation.wispCost<roger.upperPreparation.wispCost,'R30 preparation cost was not kept separate from role projection');
assert(roger.upperPreparation.wispCost>C.MAX_WISP_COST,'the fixture no longer reproduces a 24+ wisp fantasy');
assert.strictEqual(roger.angleBand,0,'a 24+ wisp hypothetical route received a good-angle promotion');
const angleFixture={
  upperId:'I70h',
  rareConflict:0,
  lineagePairs:0,
  controlCapOverflow:0,
  readiness:75,
  hardConflictTotal:0,
  wispConflict:0,
  upperPreparation:{
    immediate:true,
    materialReady:true,
    rareUsed:1,
    rareClearedTypes:1,
    specialUsed:0,
    wispCost:C.MAX_WISP_COST
  },
  safePrefix:{actions:[{id:'I70h'}]}
};
assert(P._test.upperAngleBand(angleFixture)>0,'23-wisp boundary was incorrectly excluded from angle evaluation');
assert.strictEqual(P._test.upperAngleBand(Object.assign({},angleFixture,{
  upperPreparation:Object.assign({},angleFixture.upperPreparation,{wispCost:C.MAX_WISP_COST+1})
})),0,'24-wisp boundary leaked into a good angle');
const rankAudit=ranked.map(row=>({
  id:row.upperId,
  tier:row.powerTier&&row.powerTier.letter,
  effectiveTierRank:row.effectiveTierRank,
  angle:row.angleLabel,
  angleBand:row.angleBand,
  guaranteed:row.guaranteed,
  ownedRareUse:row.upperPreparation.rareUsed,
  handFeasible:row.handFeasible,
  wispFeasible:row.wispFeasible,
  safetyBand:row.safetyBand,
  readiness:row.readiness,
  wispShortage:row.wispShortage,
  futureDependencyCount:row.futureDependencyCount,
  materialReady:row.upperPreparation.materialReady,
  wispCost:row.upperPreparation.wispCost,
  wispGap:row.upperPreparation.wispGap,
  prefixActions:row.prefixActionCount
}));
assert.strictEqual(ranked[0].upperId,'I70h',`the 52-wisp hypothetical route incorrectly displaced the near-ready upper: ${JSON.stringify(rankAudit)}`);

const pool=P._test.directionUpperShortlist(state,'physical',8,{settings}),ids=new Set(pool.ids);
assert(pool.deficitBest.length>0,'physical deficit coverage was not calculated');
for(const row of pool.deficitBest)assert(ids.has(row.id),`${row.key} best upper was dropped from the shortlist`);
for(const key of ['main','armor','slow'])assert(pool.deficitBest.some(row=>row.key===key),`active ${key} deficit has no protected upper candidate`);

console.log('PASS R30 unbuilt uppers receive distinct hypothetical role sheets without resource/clear claims');
console.log('PASS physical shortlist protects a best upper for each active hard deficit');
