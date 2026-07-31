'use strict';

// v19.7.1(외부 감사): "112/112 통과는 내부 계약 일관성이지 2.305 원본
// 데이터가 맞다는 뜻이 아니다" — 코드가 쓰는 수치를 저장소에 동봉한
// 2.305 데이터팩(data/coach_datapack_2305, ordsearch 교차검증본)과 직접
// 대조한다.  수치는 테스트에 박지 않고 데이터팩 원문에서 파싱한다 —
// 데이터팩이 갱신되면 코드가 낡았음이 여기서 드러난다.
//
// 감사에서 실제로 잡힌 것: S-베어 마증 8(구값) vs 실측 4, 키드 이감 33 vs 35.

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const PACK=path.resolve(__dirname,'../data/coach_datapack_2305');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js'])require(path.join(EXT,file));
const C=global.ORDCore;
const support=JSON.parse(fs.readFileSync(path.join(PACK,'data_support_resources.json'),'utf8'));
const prescriptions=JSON.parse(fs.readFileSync(path.join(PACK,'data_upper_prescriptions.json'),'utf8'));
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}
const unitByName=name=>global.ORD_TMO_UNITS.find(u=>C.nameOf(u).includes(name));

check('S-베어 — 마증·마방깎은 데이터팩 실측, 역할은 사용자 고정 규칙',()=>{
  const kit=(support.seraphim||[]).find(row=>row.name==='S-베어');
  assert(kit,'데이터팩에 S-베어 없음');
  const facts=kit.facts.join(' ');
  const amp=Number((facts.match(/마법데미지\s*(\d+)%\s*증폭/)||[])[1]);
  const magicDef=Number((facts.match(/마법방어력\s*(\d+)%\s*감소/)||[])[1]);
  assert(amp>0&&magicDef>0,'데이터팩 수치 파싱 실패');
  const role=C.roleProfile(unitByName('S-베어'));
  assert.strictEqual(role.magicAmp,amp,`마증 불일치: 코드 ${role.magicAmp} vs 실측 ${amp}`);
  assert.strictEqual(role.magicDef,magicDef,`마방깎 불일치: 코드 ${role.magicDef} vs 실측 ${magicDef}`);
  // 사용자 고정 규칙(hard_overrides): 광보잡으로 세지 않고 짤스턴 0.2~0.3,
  // 역할은 마딜 끝딜.
  const overrides=(support.meta&&support.meta.hard_overrides||[]).join(' ');
  assert(/S-베어.*짤스턴\s*0\.2~0\.3/.test(overrides),'사용자 고정 규칙 원문이 데이터팩에서 사라짐');
  assert(role.stun>=0.2&&role.stun<=0.3,`짤스턴 범위 밖: ${role.stun}`);
  assert.strictEqual(role.boss,false,'사용자 규칙 위반: 보잡으로 셈');
  assert.strictEqual(role.frenzy,false,'사용자 규칙 위반: 광폭으로 셈');
  assert((kit.roles.magic||[]).includes('끝딜')&&role.end>=1,'마딜 끝딜 역할 누락');
});

check('키드 초월 — 범위 이감은 데이터팩 실측',()=>{
  const kit=(prescriptions.units||[]).find(row=>row.key==='transcendent:kid');
  assert(kit,'데이터팩에 키드 없음');
  const slow=Number(((kit.provides||[]).join(' ').match(/범위\s*(\d+)%\s*이감/)||[])[1]);
  assert(slow>0,'데이터팩 이감 파싱 실패');
  const role=C.roleProfile(global.ORD_TMO_UNITS.find(u=>u.id==='4B0H'));
  assert.strictEqual(role.slow,slow,`이감 불일치: 코드 ${role.slow} vs 실측 ${slow}`);
});

check('방주맥심 — 마방깎·폭증·발동이감 묶음은 사용자 고정 규칙 수치',()=>{
  const overrides=(support.meta&&support.meta.hard_overrides||[]).join(' ');
  const m=overrides.match(/방주맥심은\s*마방깎\s*(\d+)%·발동\s*이감\s*(\d+)%·폭발형\s*증폭\s*(\d+)%/);
  assert(m,'방주맥심 규칙 원문 파싱 실패');
  const role=C.roleProfile(unitByName('방주맥심'));
  assert.strictEqual(role.magicDef,Number(m[1]),'마방깎 불일치');
  assert.strictEqual(role.triggerSlow,Number(m[2]),'발동이감 불일치');
  assert.strictEqual(role.explosionAmp,Number(m[3]),'폭증 불일치');
});

check('써니호·코비 — 사용자 고정 규칙(광폭 전용 · 마나젠 제외)',()=>{
  const overrides=(support.meta&&support.meta.hard_overrides||[]).join(' ');
  assert(/써니호는.*광폭화\s*전용/.test(overrides)&&/코비\s*전설은\s*마나젠으로\s*세지\s*않음/.test(overrides),'규칙 원문 소실');
  const sunny=global.ORD_TMO_UNITS.find(u=>/^써니호/.test(C.nameOf(u))&&C.isShip(u));
  if(sunny){const role=C.roleProfile(sunny);assert.strictEqual(role.boss,false);assert.strictEqual(role.frenzy,true);}
});

console.log(`\n${checks}/${checks} data contract checks passed.`);
