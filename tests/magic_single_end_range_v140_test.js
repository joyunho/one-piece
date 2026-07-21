'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js'])require(path.join(EXT,file));
const planner=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore;
const db=C.buildDb(global.ORD_TMO_UNITS);
const unit=id=>{const value=db.byId.get(id);assert(value,`missing fixture ${id}`);return value;};
let checks=0;

function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}
function finish(id){return C.magicFinishProfile(unit(id));}

check('name-only matches never invent verified single/end damage',()=>{
  const changedCarrot=finish('J70h');
  const hiddenRyuma=finish('440h');
  const physicalZoro=finish('F90H');
  const headset=finish('H00I');
  const sBear=finish('unit_1779017164417_3162');

  assert.deepStrictEqual(
    [changedCarrot.directSingle,changedCarrot.directEnd,changedCarrot.directCredit,changedCarrot.maxCredit],
    [0,0,0,0],
    '캐럿(변화)은 이름 추정 0.6단일을 받으면 안 됩니다.'
  );
  assert.deepStrictEqual(
    [hiddenRyuma.directSingle,hiddenRyuma.directEnd,hiddenRyuma.directCredit],
    [.5,0,.5],
    '류마(히든)는 TMO abilities의 0.5단일만 인정해야 합니다.'
  );
  assert.deepStrictEqual(
    [physicalZoro.directCredit,physicalZoro.maxCredit,headset.directCredit,headset.maxCredit],
    [0,0,0,0],
    '물딜 조로와 우타의 헤드셋은 이름 때문에 끝딜로 오인하면 안 됩니다.'
  );
  assert.deepStrictEqual(
    [sBear.directCredit,sBear.maxCredit,sBear.verified,sBear.theoretical],
    [0,1,false,true],
    'S-베어 끝딜은 직접 자료가 없어 이론 상한에만 남아야 합니다.'
  );
});

check('main upper is excluded from the three-to-four support finish count',()=>{
  const fakeUpper={id:'fixture-upper',name:'테스트 상위',groupName:'초월 [마딜]',abilities:{'단일':1}};
  const profile=C.magicFinishProfile(fakeUpper);
  const evaluation=C.evaluateMagicSingleEnd([fakeUpper,unit('R20h'),unit('430h')]);
  assert.deepStrictEqual([profile.directSingle,profile.directCredit,profile.maxCredit],[1,0,0]);
  assert.deepStrictEqual([evaluation.expected,evaluation.maximum,evaluation.verifiedUnits],[2,2,2]);
});

check('four verified full-credit supports form the stable band',()=>{
  const lineup=[unit('R20h'),unit('430h'),unit('550h'),unit('unit_1779016653060_4000')];
  const result=C.evaluateMagicSingleEnd(lineup);
  assert.deepStrictEqual(
    [result.status,result.label,result.expected,result.largest,result.stable,result.maximum,result.verifiedUnits],
    ['stable','스펙상 안정 후보',4,1,3,4,4]
  );
  const route=planner._test.routeEvaluationFor(lineup,{rows:[]},'magic','singleEnd');
  assert.strictEqual(route.confirmable,true);
  assert.strictEqual(route.status,'stable');
});

check('three verified full-credit supports are explicitly control-dependent',()=>{
  const lineup=[unit('R20h'),unit('430h'),unit('550h')];
  const result=C.evaluateMagicSingleEnd(lineup);
  assert.deepStrictEqual(
    [result.status,result.label,result.expected,result.largest,result.stable,result.maximum,result.verifiedUnits],
    ['control','컨트롤 의존',3,1,2,3,3]
  );
  const route=planner._test.routeEvaluationFor(lineup,{rows:[]},'magic','singleEnd');
  assert.strictEqual(route.confirmable,false,'컨트롤 의존 3지원은 사용자가 실측 예외를 열기 전까지 확정하면 안 됩니다.');
  assert.strictEqual(route.controlDependent,true);
  assert.strictEqual(route.status,'control');
});

check('unverified finish credit can open only the theoretical band',()=>{
  const lineup=[unit('R20h'),unit('430h'),unit('unit_1779017164417_3162')];
  const result=C.evaluateMagicSingleEnd(lineup);
  assert.deepStrictEqual(
    [result.status,result.label,result.expected,result.stable,result.maximum,result.verifiedUnits,result.maxUnits],
    ['theoretical','자료 확인 필요 · 확정 금지',2,1,3,2,3]
  );
  const route=planner._test.routeEvaluationFor(lineup,{rows:[]},'magic','singleEnd');
  assert.strictEqual(route.confirmable,false,'이론 상한만 3인 파티는 확정되면 안 됩니다.');
  assert.strictEqual(route.status,'theoretical');
});

check('four half-credit supports remain below the required operating value',()=>{
  const lineup=[unit('330h'),unit('440h'),unit('S50h'),unit('KC0h')];
  const result=C.evaluateMagicSingleEnd(lineup);
  assert.deepStrictEqual(
    [result.status,result.expected,result.largest,result.stable,result.maximum,result.verifiedUnits],
    ['insufficient',2,.5,1.5,2,4]
  );
  const route=planner._test.routeEvaluationFor(lineup,{rows:[]},'magic','singleEnd');
  assert.strictEqual(route.confirmable,false);
});

console.log(`\n${checks}/${checks} magic single/end range checks passed.`);
