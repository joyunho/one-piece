'use strict';

// v16.7 semantics (user request, seventh feedback round):
//  1. 희귀 이하 후보는 물딜/마딜을 구분하지 않는다.  전설급·상위 후보만
//     계열 필터를 받고, 자동 모드에서는 첫 전설(보유 비상위 전설·히든)의
//     계열이 이후 전설 추천 방향을 정한다.
//  2. 첫 희귀·첫 전설 설계에서 완성도·선위 소모가 같으면 스토리 파괴
//     속도(스토리 등급 점수)가 빠른 쪽을 먼저 추천한다.
//  3. 확정 상위 트리에도, 검토된 보조 경로에도, 현재 전투 역할에도
//     쓰이지 않는 희귀는 리롤 대상으로 노출된다.

const assert=require('assert');
const fs=require('fs');
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

const C=global.ORDCore;
const M=global.ORDV15Model;
const Engine=global.ORDV15Engine;
const units=global.ORD_TMO_UNITS;

const PHYSICAL_LEGEND='T20h';   // 마르코 (이감30 보조딜) · 전설 [물딜]
const MAGIC_LEGEND='780h';      // 토키 (이감25, 공속20) · 전설 [마딜]
const MAGIC_RARE='120h';        // 검은수염 · 희귀함 [마딜]

function buildModel(counts,mode,round){
  return M.build({
    catalog:units,
    snapshot:{source:'v16-7-test',counts:counts||{},currentAbilities:{},wispCountFound:true,wispCount:(counts||{})['810e']||0},
    settings:{mode:mode||'',magicRoute:'auto',currentRound:round||10,gorosei:'saturn',postLegendRoute:'',superKumaOwned:true},
    locks:[]
  });
}
function unitOf(id){const found=units.find(u=>u.id===id);assert(found,`fixture unit ${id} missing from catalog`);return found;}

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('명시 물딜 선택에서도 희귀는 계열 무관하게 후보로 남는다',()=>{
  const model=buildModel({},'physical');
  assert.strictEqual(C.familyOf(unitOf(MAGIC_RARE)),'magic','fixture rare must be magic-family');
  assert.strictEqual(Engine._test.intentFamilyOk(model,unitOf(MAGIC_RARE)),true,'magic rare must pass under explicit physical mode');
  assert.strictEqual(Engine._test.intentFamilyOk(model,unitOf(MAGIC_LEGEND)),false,'magic legend must be filtered under explicit physical mode');
  assert.strictEqual(Engine._test.intentFamilyOk(model,unitOf(PHYSICAL_LEGEND)),true,'physical legend must pass');
});

test('자동 모드: 첫 전설의 계열이 이후 전설 추천 방향을 정한다',()=>{
  const empty=buildModel({},'');
  assert.strictEqual(Engine._test.familyIntent(empty),'','no owned legend → no family direction yet');
  assert.strictEqual(Engine._test.intentFamilyOk(empty,unitOf(MAGIC_LEGEND)),true,'both families stay open before the first legend');
  const afterPhysical=buildModel({[PHYSICAL_LEGEND]:1},'');
  assert.strictEqual(Engine._test.familyIntent(afterPhysical),'physical','first physical legend must set the direction');
  assert.strictEqual(Engine._test.intentFamilyOk(afterPhysical,unitOf(MAGIC_LEGEND)),false,'magic legends leave the candidate set');
  assert.strictEqual(Engine._test.intentFamilyOk(afterPhysical,unitOf(MAGIC_RARE)),true,'rares still ignore the direction');
  const afterMagic=buildModel({[MAGIC_LEGEND]:1},'');
  assert.strictEqual(Engine._test.familyIntent(afterMagic),'magic','first magic legend must set the direction');
  assert.strictEqual(Engine._test.intentFamilyOk(afterMagic,unitOf(PHYSICAL_LEGEND)),false,'physical legends leave the candidate set');
});

test('첫 희귀: 완성도·선위가 같으면 스토리 등급이 빠른 쪽을 먼저 설계한다',()=>{
  const model=buildModel({'810e':0},'');
  const db=model.knowledge.db;
  // Find a same-wisp group among rares dynamically so the assertion survives
  // catalog updates: equal empty-hand wisp cost, allowed prerequisites, and
  // at least two distinct story scores.
  const groups=new Map();
  for(const unit of db.rares){
    if(!C.specialPrerequisiteStatus(db,unit,{}).allowed)continue;
    const cost=C.recipeSolve(db,unit.id,{}).wispCost;
    if(!groups.has(cost))groups.set(cost,[]);
    groups.get(cost).push(unit);
  }
  const tied=[...groups.values()].find(list=>list.length>=2&&new Set(list.map(unit=>C.num(C.storyGrade(unit).score))).size>1);
  assert(tied,'catalog no longer has a same-wisp rare group with distinct story scores');
  const expected=tied.slice().sort((a,b)=>C.num(C.storyGrade(b).score)-C.num(C.storyGrade(a).score))[0];
  const decision=Engine._test.completionDecision(model,tied,'첫 희귀');
  const chosen=decision.action||decision.blockedAction;
  assert(chosen,'completion decision returned no candidate');
  assert.strictEqual(chosen.id,expected.id,`equal-wisp tie must break by story score: expected ${expected.name}, got ${chosen.name}`);
});

test('확정 상위·보조 경로에 사용처 없는 희귀는 리롤 대상으로 노출된다',()=>{
  // Log-7 round-58 stock plus one magic rare (검은수염) that is neither in
  // the locked physical transcend upper's tree nor useful to the physical
  // route: it must surface with reroll > 0 in the rare ledger.
  const counts={'300h':1,'500h':3,'600h':1,'700h':1,'810e':5,'910h':1,F30h:1,IC0h:1,L00h:1,O20h:1,O30h:1,P00h:1,Q30h:1,Z20h:1,unit_1779016886375_9574:1,[MAGIC_RARE]:1};
  const decision=Engine.decide({
    catalog:units,
    snapshot:{source:'v16-7-reroll-test',counts,currentAbilities:{},wispCountFound:true,wispCount:counts['810e']},
    settings:{mode:'physical',magicRoute:'auto',currentRound:58,gorosei:'warcury',postLegendRoute:'upper',virtualSpecialId:'610h',superKumaOwned:true},
    locks:[{stage:'upper',id:'unit_1747756917990_920',source:'v15-exact-route'}]
  });
  const row=(decision.rare&&decision.rare.rows||[]).find(item=>item.id===MAGIC_RARE);
  assert(row,'the useless rare is missing from the rare ledger');
  assert(C.num(row.reroll)>0,`검은수염 must be steered to reroll, got use=${row.use} hold=${row.hold} reroll=${row.reroll} (${row.reason})`);
});

test('UI: 4번 패널 계열 필터·스토리 동순위, 2번 패널 리롤 유도가 소스에 존재한다',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes('v151FamilyIntent'),'buildable-legends family intent helper missing');
  assert(app.includes("familyOk=unit=>familyMode!=='physical'&&familyMode!=='magic'||C.familyOf(unit)!=="),'panel-4 family filter missing');
  assert(app.includes('v151-reroll-hint'),'panel-2 reroll guidance markup missing');
  const css=fs.readFileSync(path.join(EXT,'ord_cockpit_v15.css'),'utf8');
  assert(css.includes('.v151-reroll-hint'),'reroll hint style missing');
  const engine=fs.readFileSync(path.join(EXT,'ord_v15_engine.js'),'utf8');
  assert(engine.includes('b.story-a.story'),'completion sort story tiebreak missing');
});

let failures=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);}
  catch(error){failures+=1;console.error(`FAIL ${name}`);console.error(error&&error.message||error);}
}
console.log(`V16_7_FAMILY_STORY_REROLL ${tests.length-failures}/${tests.length} passed`);
if(failures)process.exit(1);
