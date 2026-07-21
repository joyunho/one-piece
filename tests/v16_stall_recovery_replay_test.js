'use strict';

// Regression replay for ORD_2305_20260720_210515_active.ordlog.json.
//
// That magic singleEnd run sat in a silent HOLD from round 43 to round 62
// while required deficits stayed open (이감 65/102, 단일 1/2, 검증된 보조
// 단일·끝딜 2/3).  Three structural v15 defects caused it:
//   1. the action universe was legendish+uppers only, so a Rare that closes a
//      required combat role could never be proposed;
//   2. policy evaluation used durable-final-only counts, so no Rare craft
//      could ever register as an improvement;
//   3. main-upper strategic requirements (Dragon's 단일/끝딜) were outside the
//      static route groups and invisible to the whole judgement pipeline.
// The fixtures below are the exact reconstructed TMO states (snapshot folds)
// of rounds 50 and 57 from that log.  v16 must produce either an executable
// required-deficit repair or an explicit recovery ladder — never a silent
// empty board.

const assert=require('assert');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
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

const FIXTURES={
  r50:{
    round:50,wisp:4,
    counts:{'100h':5,'200h':1,'300h':2,'310h':1,'400h':7,'500h':2,'600h':3,'700h':2,'720h':1,'780h':1,'800h':1,'810e':4,'900h':5,'910h':1,D10h:2,D40h:1,G00h:1,J30h:1,K00h:1,Q20h:1,U10h:1,X20h:1,Z30h:1,unit_1767884925665_1037:1}
  },
  r57:{
    round:57,wisp:2,
    counts:{'100h':1,'200h':1,'300h':2,'310h':1,'400h':4,'500h':1,'550h':1,'600h':1,'700h':7,'780h':1,'800h':2,'810e':2,'900h':1,D10h:1,D40h:1,E00h:1,G00h:1,I00h:2,J30h:1,M00h:1,Q20h:1,Q30h:1,X20h:1,Z30h:1}
  }
};

function decide(fixture){
  return Engine.decide({
    catalog:units,
    snapshot:{source:'stall-recovery-replay',counts:fixture.counts,currentAbilities:{},wispCountFound:true,wispCount:fixture.wisp},
    settings:{mode:'magic',magicRoute:'singleEnd',currentRound:fixture.round,gorosei:'saturn',postLegendRoute:'upper',superKumaOwned:true},
    locks:[{stage:'upper',id:'D40h',source:'v15-exact-route'}]
  });
}

function requirementByKey(decision,key){
  return(decision.assessment&&decision.assessment.requirements||[]).find(row=>row.key===key);
}

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('r50 replay proposes a required-deficit repair instead of holding',()=>{
  const decision=decide(FIXTURES.r50);
  const actionable=decision.state==='ACT_NOW'&&decision.action;
  const guided=decision.recovery&&decision.recovery.targets&&decision.recovery.targets.length>0;
  assert(actionable||guided,`the r50 stall state must yield an action or a recovery ladder, got ${decision.state}`);
  if(actionable){
    const repairsSlow=(decision.action.deltas||[]).some(row=>row.key==='slow'&&row.gapGain>0);
    assert(repairsSlow,'the r50 action must reduce the open 이감 deficit');
  }
});

test('r57 replay never returns the silent empty board from the log',()=>{
  const decision=decide(FIXTURES.r57);
  const actionable=decision.state==='ACT_NOW'&&decision.action;
  const guided=decision.recovery&&decision.recovery.targets&&decision.recovery.targets.length>0;
  assert(actionable||guided,`round 57 held for 10+ recorded rounds; v16 must act or guide, got ${decision.state}`);
});

test('main-upper strategic requirements (단일/끝딜) join the judged requirement table',()=>{
  const decision=decide(FIXTURES.r57);
  const single=requirementByKey(decision,'single');
  assert(single,'Dragon single-target requirement is missing from the assessment');
  assert(single.required!==false,'the single requirement must stay required');
  assert(Number(single.target)>=2,'Dragon requires two single-target dealers');
  const structural=decision.assessment.structuralPass;
  assert.strictEqual(structural,false,'open strategic requirements must block structuralPass');
});

test('live Rare combat roles are credited by the assessment (no durable-only blindness)',()=>{
  const decision=decide(FIXTURES.r57);
  const slow=requirementByKey(decision,'slow');
  assert(slow,'slow requirement missing');
  assert(Number(slow.current)>0,'owned live slow contributions were zeroed out by a durable-only evaluation');
});

test('policy evaluate publishes a concrete status/label (labeled-statement bug fixed)',()=>{
  const decision=decide(FIXTURES.r57);
  assert(['structural','developing','unsafe'].includes(decision.assessment.status),`status was '${decision.assessment.status}'`);
  assert(decision.assessment.label&&decision.assessment.label.length>0,'assessment label is empty');
});

test('recovery plan names nearest closers with wisp distance when crafting is blocked',()=>{
  const model=decide(FIXTURES.r57).model;
  const P=global.ORDV15Policy;
  const route=P.resolveRoute(model.intent,model.settings);
  const assessment=P.evaluate(model,model.effective.counts,route,{round:model.round.value,locks:[]});
  const plan=Engine._test.recoveryPlan(model,route,[],assessment);
  assert(plan&&plan.targets.length>0,'recovery plan must exist while required deficits are open');
  for(const target of plan.targets){
    assert(target.name,'recovery target lacks a name');
    assert(target.roleLabel,'recovery target lacks a role label');
    assert(Number.isFinite(Number(target.wispCost)),'recovery target lacks a wisp cost');
  }
});

// Fourth log (ORD_2305_20260721_145141): Alvida auto-detected at round 20
// pushed the spec search below round 25 for the first time, tripping a latent
// `const hold` reassignment in rareDisposition — five rounds of '판단 엔진
// 점검 필요' on the live screen.  Exact folded TMO state of the first crash.
const ALVIDA_R20={
  round:20,wisp:7,
  counts:{'100h':1,'200h':3,'300h':1,'400h':2,'500h':3,'700h':5,'800h':4,'810e':7,'900h':3,C20h:1,E20h:1,F10h:1,I00h:1,I10h:1,J10h:1,L00h:1,L20h:1,M00h:1,O00h:1,Q80h:1,S00h:1,T30h:1,U00h:1,X00h:1}
};
function decideAlvida(){
  return Engine.decide({
    catalog:units,
    snapshot:{source:'alvida-r20-replay',counts:ALVIDA_R20.counts,currentAbilities:{},wispCountFound:true,wispCount:ALVIDA_R20.wisp},
    settings:{mode:'physical',magicRoute:'auto',currentRound:ALVIDA_R20.round,gorosei:'saturn',postLegendRoute:'upper',superKumaOwned:true},
    locks:[{stage:'upper',id:'Q80h',source:'tmo'}]
  });
}

test('pre-round-25 spec search with spare rares no longer crashes (const hold regression)',()=>{
  const decision=decideAlvida();
  assert.notStrictEqual(decision.state,'SYNC_BLOCKED',`engine returned its crash fallback: ${decision.reason}`);
  assert(decision.state,'decision state missing');
});

test('Alvida waives stun requirements: stunless route is not gated or chased',()=>{
  const decision=decideAlvida();
  const stunBase=requirementByKey(decision,'stunBase'),stunFull=requirementByKey(decision,'stunFull');
  assert(stunBase&&stunBase.waived===true,'Alvida stunBase must be waived');
  assert(stunFull&&stunFull.waived===true,'Alvida stunFull must be waived');
  const blockers=decision.assessment.blockers||[];
  assert(!blockers.some(text=>/스턴/.test(text)),`stun still listed as a blocker: ${blockers.join(' | ')}`);
  for(const target of decision.recovery&&decision.recovery.targets||[])
    assert(!['stunBase','stunFull'].includes(target.roleKey),'recovery ladder chased a waived stun role');
  const slow=requirementByKey(decision,'slow');
  assert(slow&&slow.required!==false&&!slow.waived,'slow must stay a hard requirement for the stunless route');
});

let failures=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);}
  catch(error){failures+=1;console.error(`FAIL ${name}`);console.error(error&&error.message||error);}
}
console.log(`V16_STALL_RECOVERY ${tests.length-failures}/${tests.length} passed`);
if(failures)process.exit(1);
