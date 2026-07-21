'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const planner=global.ORDSquadPlanner;
const catalog=global.ORD_TMO_UNITS;
const db=C.buildDb(catalog);
const unit=id=>{const value=db.byId.get(id);assert(value,`missing fixture ${id}`);return value;};
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

const qualifiedNames={
  G30h:'징베(전설)',S30h:'울티(전설)',F30h:'카르가라(전설)',HA0h:'킹(전설)',MC0h:'히바리(전설)',
  Q20h:'라분(전설)',U20h:'검은수염(전설)',Z90h:'네코(전설)',R20h:'로브 루치(전설)',Y20h:'루나메(전설)',
  X20h:'블랙마리아(전설)','430h':'상디(전설)','730h':'슈가(전설)',S20h:'조로(전설)',I30h:'제파(전설)',
  N30h:'료쿠규(히든)',M30h:'사보(히든)','740h':'피셔타이거(히든)',J30h:'시류(히든)',Z30h:'아카이누(히든)',
  J70h:'캐럿(변화)','unit_1752903381904_1445':'블랙마리아(왜곡)',V30h:'코알라(왜곡)',IC0h:'퀸(왜곡)',
  '840h':'페로나(왜곡)','unit_1779015610844_6407':'바제스(왜곡)',U30h:'레드포스호(해적선)',
  '720h':'슈가(희귀)',O20h:'에이스(전설)','unit_1779015467592_9245':'에이스(왜곡)',L70h:'캐럿(히든)'
};

check('flag numbers use grade-qualified UI names without touching calculation names',()=>{
  for(const [id,expected] of Object.entries(qualifiedNames))assert.strictEqual(C.displayNameOf(unit(id)),expected,id);
  assert(C.nameOf(unit('730h')).includes('2'),'calculation name for Sugar was mutated');
  assert(C.nameOf(unit('X20h')).includes('3'),'calculation name for Black Maria was mutated');
  assert(C.nameOf(unit('unit_1752903381904_1445')).includes('2'),'warped Black Maria calculation name was mutated');
});

check('real character number in Baby 5 is preserved',()=>{
  assert(C.displayNameOf(unit('N70h')).includes('베이비 5'));
});

check('Koala warped is shared utility and never boss/frenzy handling',()=>{
  const koala=unit('V30h'),role=C.roleProfile(koala),keys=C.skillFacts(koala).mechanics.map(x=>x.key),physical=C.roleContribution(koala,'physical'),magic=C.roleContribution(koala,'magic');
  assert.deepStrictEqual([role.family,role.boss,role.frenzy,role.supportDamage,role.utility,role.sharedUtility,role.mana],['neutral',false,false,true,true,true,3.25]);
  assert(keys.includes('supportDamage'));
  assert(!keys.some(key=>['bossFrenzy','boss','frenzy'].includes(key)));
  for(const contribution of [physical,magic])assert.deepStrictEqual([contribution.boss,contribution.frenzy,contribution.bossFrenzy,contribution.subdamage,contribution.utility,contribution.mana],[0,0,0,1,1,3.25]);
  const state=C.normalizeState(catalog,{source:'manual',counts:{V30h:1},units:[],currentAbilities:{}},{currentRound:30,manualCounts:{}}),spec=C.currentSpec(state,'physical',{});
  assert.deepStrictEqual([spec.boss,spec.frenzy,spec.bossFrenzy,spec.subdamage,spec.utility],[0,0,0,1,1]);
  const summary=C.summarizeRoles({role},'physical');
  assert(summary.includes('공용 유틸')&&summary.includes('보조딜')&&summary.includes('마젠 3.25')&&!summary.includes('광보잡'));
  assert.strictEqual(C.summarizeRoles({role},'magic'),summary);
  const planningState=C.normalizeState(catalog,{source:'manual',counts:{},units:[],currentAbilities:{}},{currentRound:50,manualCounts:{}}),settings={currentRound:50,allowChangedEarly:false,superKumaOwned:true,recommendWarped:true};
  assert.strictEqual(planner._test.allowedCandidate(koala,'physical','physical',settings,planningState,planningState.counts),true);
  assert.strictEqual(planner._test.allowedCandidate(koala,'magic','dual',settings,planningState,planningState.counts),true);
  assert.strictEqual(planner._test.allowedCandidate(koala,'magic','singleEnd',settings,planningState,planningState.counts),true);
});

check('Baratie is neutral shared attack-speed utility',()=>{
  const baratie=unit('P30h'),role=C.roleProfile(baratie),contribution=C.roleContribution(baratie,'physical'),summary=C.summarizeRoles({role},'physical');
  assert.deepStrictEqual([role.family,role.speed,role.utility,role.sharedUtility],['neutral',22,true,true]);
  assert.deepStrictEqual([contribution.speed,contribution.utility],[22,1]);
  assert(summary.includes('공용 유틸')&&summary.includes('공속 22'));
});

check('S-Bear stays utility-only until its finish-damage source is verified',()=>{
  const bear=unit('unit_1779017164417_3162'),role=C.roleProfile(bear),summary=C.summarizeRoles({role},'magic');
  assert.deepStrictEqual([role.family,role.utility,role.boss,role.frenzy,role.end,role.stun,role.magicDef,role.magicAmp],['magic',true,false,false,0,.25,1,8]);
  assert.deepStrictEqual([C.magicFinishProfile(bear).directCredit,C.magicFinishProfile(bear).maxCredit],[0,1]);
  assert(summary.includes('마딜 유틸'));
});

console.log(`\n${checks}/${checks} role/name correction checks passed.`);
