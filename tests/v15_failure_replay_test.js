'use strict';

const assert=require('assert');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;

// The catalog patch reports harmless data-normalization warnings while loading.
// Keep this replay's output focused on decision failures.
const originalWarn=console.warn;
console.warn=()=>{};
for(const file of [
  'ord_units_data.js',
  'ord_data_patch.js',
  'ord_core.js',
  'ord_v15_model.js',
  'ord_v15_ledger.js',
  'ord_v15_policy.js',
  'ord_v15_engine.js'
])require(path.join(EXT,file));
console.warn=originalWarn;

const Engine=global.ORDV15Engine;
const units=global.ORD_TMO_UNITS;

assert(Engine&&typeof Engine.decide==='function','v15 decision engine API is unavailable');

function settings(round){
  return{
    mode:'physical',
    magicRoute:'physical',
    currentRound:round,
    gorosei:'nasjuro',
    postLegendRoute:'upper',
    superKumaOwned:true,
    allowWarped:true,
    recommendWarped:true
  };
}

function decide(counts,currentAbilities,round,upperId){
  return Engine.decide({
    catalog:units,
    snapshot:{
      source:'v15-failure-replay',
      counts,
      currentAbilities:currentAbilities||{},
      wispCountFound:true,
      wispCount:Number(counts['810e'])||0
    },
    settings:settings(round),
    locks:[{stage:'upper',id:upperId,source:'failure-log-regression'}]
  });
}

function rowByKey(assessment,key){
  return(assessment&&assessment.requirements||[]).find(row=>row.key===key);
}

function rareById(decision,id){
  return(decision&&decision.rare&&decision.rare.rows||[]).find(row=>row.id===id);
}

function decisionSummary(decision){
  const proposed=decision.action||decision.blockedAction;
  return JSON.stringify({
    state:decision.state,
    proposed:proposed&&proposed.id,
    wisp:proposed&&proposed.wispCost,
    actualEquivalent:decision.assessment&&decision.assessment.actual&&decision.assessment.actual.legendEquivalent,
    blockers:decision.assessment&&decision.assessment.blockers
  });
}

const tests=[];
function test(name,fn){tests.push([name,fn]);}

// Failure log 163714, compact reconstruction immediately after Mihawk was
// completed (snapshot seq 559 / round 46). The old route spent all ten wisps
// on a small armor/stun patch even though slow was 77 short. Marco is directly
// buildable for five and leaves five wisps for the remaining survival route.
const fixtureA={
  counts:{
    '100h':7,'300h':2,'340h':1,'400h':1,'500h':7,'540h':1,'800h':3,'810e':10,
    '830h':1,'900h':4,'910h':1,D00h:2,I70h:1,K00h:4,M00h:2,M20h:1,N30h:1,
    W20h:1,X10h:1,unit_1767884906256_4990:1,unit_1767884925665_1037:1,
    unit_1779015467592_9245:1
  },
  abilities:{
    '공격력 증가':45,'공격속도 증가':5,'공중이동':1,'광폭화':2,'바제스':2,
    '발동방어력 감소':15,'발동이동속도 감소':20,'방어력 감소':172,
    '보스 잡기':2,'스턴':.9,'이동속도 감소':30,'체력 재생':2.85
  }
};

test('A: fund the slow route first and keep the Marco line alive',()=>{
  // The original invariant was 'Marco for five wisps'.  With Rares in the
  // action universe the engine may open with Kid (이감15, one wisp) and reach
  // Marco next — an equal end state with a cheaper first step.  What must
  // hold: the first action closes the slow deficit, the armor/stun patches
  // (Bonkure/Bartolomeo) never displace it, and Baby 5 is never rerolled.
  const decision=decide(fixtureA.counts,fixtureA.abilities,46,'I70h');
  assert.strictEqual(decision.state,'ACT_NOW',`expected an executable slow repair; ${decisionSummary(decision)}`);
  assert(decision.action,`ACT_NOW did not expose an action; ${decisionSummary(decision)}`);
  assert(!['O30h','Z20h'].includes(decision.action.id),'Bon Clay/Bartolomeo must not consume the protected slow budget');
  const slowDelta=(decision.action.deltas||[]).find(row=>row.key==='slow');
  assert(slowDelta&&slowDelta.gapGain>0,`first action must reduce the slow deficit; ${decisionSummary(decision)}`);
  const pathIds=(decision.action.path||[]).map(step=>step.id);
  const marcoInPath=pathIds.includes('T20h'),baby5=rareById(decision,'M20h');
  assert(baby5,'Marco material Baby 5 disappeared from the exclusive Rare ledger');
  assert(marcoInPath||baby5.use+baby5.hold>=1,'the Marco slow line was abandoned: Baby 5 neither used nor held');
  assert.strictEqual(baby5.reroll,0,'Marco material was simultaneously exposed as reroll');
  assert.strictEqual(baby5.proof.exclusive,true,'Rare use/hold/reroll allocation is not exclusive');
});

// Failure log 150107, last live stock (snapshot seq 602 / round 55). Kid's
// +15 slow is already part of the still-incomplete live control profile. It is
// therefore a combat hold, even if no final recipe currently consumes it.
const fixtureC={
  counts:{
    '100h':1,'200h':1,'300h':1,'400h':1,'800h':1,A30h:1,D20h:1,H10h:1,
    H30h:1,J40h:1,M30h:1,'630h':1,'930h':1,unit_1779016886375_9574:1
  },
  abilities:{
    '스턴':1,'공격력 증가':90,'방어력 감소':160,'바제스':3,'보조딜':2,
    '아머브레이크':3,'이동속도 감소':110,'광폭화':3,'공중이동':2,
    '보스 잡기':1,'발동공격력 증가':40,'발동방어력 감소':18
  }
};

test('C: live Kid slow is combat-held and never offered as reroll',()=>{
  const decision=decide(fixtureC.counts,fixtureC.abilities,55,'J40h');
  const kid=rareById(decision,'D20h');
  assert(kid,'owned Kid is missing from the Rare ledger');
  assert.strictEqual(kid.use,0);
  assert.strictEqual(kid.hold,1,'Kid must remain on board while its slow is required');
  assert.strictEqual(kid.reroll,0,'Kid was exposed as reroll despite protecting a mandatory slow deficit');
  assert.strictEqual(kid.proof.exclusive,true,'Kid disposition is not exclusive');
  assert((kid.proof.liveCombat||[]).some(label=>/이감/.test(label)),'Kid hold lacks live slow evidence');
  assert(!decision.rare.safeReroll||decision.rare.safeReroll.id!=='D20h','Kid became the one-click safe reroll');
});

// Failure log 163714 immediately before Vivi changed (snapshot seq 678 /
// round 55). The board is already twelve legend-equivalent, but slow is still
// deficient. Vivi is a free, useful repair and her Rare cannot also be reroll.
const fixtureD={
  counts:{
    '540h':1,'810e':3,'830h':1,I70h:1,N30h:1,N70h:1,O10h:1,Q30h:1,
    W20h:1,Z20h:1,unit_1779015467592_9245:1,unit_1779016886375_9574:1
  },
  abilities:{
    '공격력 증가':45,'공격속도 증가':5,'공중이동':3,'광폭화':4,'바제스':2,
    '발동방어력 감소':15,'발동이동속도 감소':20,'방어력 감소':194,
    '보스 잡기':4,'스턴':1.8,'아머브레이크':1,'이동속도 감소':70,'체력 재생':4.1
  }
};

test('D: Vivi is one committed use and never simultaneously reroll',()=>{
  const decision=decide(fixtureD.counts,fixtureD.abilities,55,'I70h');
  const proposed=decision.action||decision.blockedAction;
  assert(proposed,`Vivi disappeared from both executable and protected repair paths; ${decisionSummary(decision)}`);
  assert.strictEqual(proposed.id,'W50h',`expected Vivi changed; ${decisionSummary(decision)}`);
  assert.strictEqual(proposed.wispCost,0,'Vivi should consume the owned Rare with no selection wisp');
  assert.strictEqual(proposed.wispAfter,3,'a free Vivi repair changed the wisp balance');
  const vivi=rareById(decision,'O10h');
  assert(vivi,'owned Vivi Rare is missing from the exclusive ledger');
  assert.strictEqual(vivi.use,1,'Vivi Rare was not assigned to the committed changed unit');
  assert.strictEqual(vivi.hold,0);
  assert.strictEqual(vivi.reroll,0,'Vivi was shown in both use and reroll');
  assert.strictEqual(vivi.proof.exclusive,true,'Vivi disposition is not exclusive');
});

test('nine-equivalent is a checkpoint, not a stop condition',()=>{
  const decision=decide(fixtureD.counts,fixtureD.abilities,55,'I70h');
  assert(decision.assessment.actual.legendEquivalent>=9,'fixture no longer represents an over-target board');
  assert.strictEqual(decision.assessment.structuralPass,false,'slow-deficient board was declared structurally complete');
  const slowBefore=rowByKey(decision.assessment,'slow');
  assert(slowBefore&&slowBefore.gap>0,'fixture must retain a mandatory slow deficit');
  assert.strictEqual(decision.state,'ACT_NOW',`engine stopped at the count target despite a free repair; ${decisionSummary(decision)}`);
  assert(decision.action&&decision.action.id==='W50h',`engine did not continue with the available deficit repair; ${decisionSummary(decision)}`);
  const slowAfter=rowByKey(decision.afterAction,'slow');
  assert(slowAfter&&slowAfter.current>slowBefore.current,'Vivi action did not improve the mandatory slow deficit');
  assert.strictEqual(slowAfter.current,100,'Vivi replay should raise conservative Nasjuro slow to 100');
  assert.strictEqual(slowAfter.gap,17,'Vivi must not be mislabeled as completing the remaining slow gate');
});

let passed=0;
const failures=[];
for(const [name,fn] of tests){
  try{
    fn();
    passed++;
    console.log(`PASS ${name}`);
  }catch(error){
    failures.push({name,error});
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

console.log(`V15_FAILURE_REPLAY ${passed}/${tests.length} passed`);
if(failures.length){
  console.error('The v15 engine still violates failure-log invariants:');
  for(const failure of failures)console.error(`- ${failure.name}: ${failure.error.message}`);
  process.exitCode=1;
}
