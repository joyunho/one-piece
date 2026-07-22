'use strict';

// v17.0: 2.305 [C] 전투 수치·방어 공식·연구소 모델 검증.
//  - DefenseArmor=0.02, 음수 방어 증폭식 2-0.98^(-A) 재현
//  - 상위 평타 raw DPS 공식이 검증 예시 5종을 정확히 재현
//  - 센고쿠 필요 raw DPS 표(방깎 160/180/190/211) 재현
//  - 연구소 4종 1회 구매 효과(+12%p 공증 표기·+10 이감·+0.45 체젠·+0.8 마젠)
//  - 렌더 예외 가드(화면 사망 방지) 존재

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
  'ord_upper_combat_data.js',
  'ord_core.js'
])require(path.join(EXT,file));
console.warn=originalWarn;

const C=global.ORDCore;
const units=global.ORD_TMO_UNITS;

const tests=[];
function test(name,fn){tests.push([name,fn]);}
const near=(actual,expected,eps,label)=>assert(Math.abs(actual-expected)<=eps,`${label}: ${actual} vs ${expected}`);

test('방어 공식: 계수 0.02, 음수 방어는 실제 증폭(검증표 재현)',()=>{
  assert.strictEqual(C.DEFENSE_ARMOR,.02);
  near(C.armorMultiplier(138-160),1.3588,.0001,'아카이누 방깎160');
  near(C.armorMultiplier(138-180),1.5719,.0001,'아카이누 방깎180');
  near(C.armorMultiplier(138-190),1.6503,.0001,'아카이누 방깎190');
  near(C.armorMultiplier(138-211),1.7712,.0001,'아카이누 방깎211');
  near(C.armorMultiplier(191-160),.6173,.0001,'오로치 방깎160');
  near(C.armorMultiplier(191-211),1.3324,.0001,'오로치 방깎211');
  near(C.armorMultiplier(201-180),.7042,.0001,'워큐리 오로치 방깎180');
  near(C.armorMultiplier(201-211),1.1829,.0001,'워큐리 오로치 방깎211');
});

test('상위 평타 raw DPS 공식이 검증 예시를 정확히 재현한다',()=>{
  const byId=id=>units.find(u=>u.id===id)||units.find(u=>(u.codes||[]).includes(id));
  const dps=(id,level)=>Math.round(C.upperRawDps(byId(id),level,0).raw);
  assert.strictEqual(dps('J40h',1),963047,'로저');
  assert.strictEqual(dps('I70h',1),215988,'카타쿠리');
  assert.strictEqual(dps('850h',1),89195,'미호크 영원');
  assert.strictEqual(dps('Q90h',1),536296,'마르코 불사조폼');
  assert.strictEqual(dps('O80h',1),282782,'마르코 인간폼');
  const rogerLv2=C.upperRawDps(byId('J40h'),2,0);
  assert(rogerLv2.raw>963047,'등급 공업 레벨이 오르면 DPS가 올라야 한다');
  const capped=C.upperRawDps(byId('J40h'),1,900);
  assert.strictEqual(capped.speedMultiplier,5,'공속배율 상한 5');
});

test('센고쿠 필요 raw DPS(방깎별)와 보스 방어·상성이 내장된다',()=>{
  assert.deepStrictEqual([50,55,60,65].map(r=>C.BOSS_META.bossArmor[r]),[350,360,372,395]);
  assert.deepStrictEqual(C.ATTACK_TYPE_VS_BOSS,{pierce:1.25,normal:1,siege:.75,hero:1.05});
  const preview=C.bossPreview(50,'saturn');
  assert.strictEqual(preview.bossArmor,350);
  near(C.bossRawDpsNeed(preview,160,'normal'),15807998,3,'방깎160 → 15.808M');
  near(C.bossRawDpsNeed(preview,180,'normal'),14490665,3,'방깎180 → 14.491M');
  near(C.bossRawDpsNeed(preview,190,'normal'),13831999,3,'방깎190 → 13.832M');
  near(C.bossRawDpsNeed(preview,211,'normal'),12448799,3,'방깎211 → 12.449M');
  const pierceNeed=C.bossRawDpsNeed(preview,211,'pierce');
  near(pierceNeed,12448799/1.25,3,'관통 1.25배 상성');
});

test('연구소 4종은 1회 구매 고정 효과로 가산되고 미체크는 불변이다',()=>{
  const snapshot={counts:{},currentAbilities:{},wispCountFound:true,wispCount:0};
  const base={mode:'physical',gorosei:'saturn'};
  const state=C.normalizeState(units,snapshot,base);
  const plain=C.currentSpec(state,'physical',base);
  const all=C.currentSpec(state,'physical',Object.assign({},base,{labResearch:{attack:true,slow:true,hpRegen:true,mpRegen:true,round:30}}));
  assert.strictEqual(C.num(all.slow),C.num(plain.slow)+10,'이감업 +10%p');
  assert.strictEqual(C.num(all.attack),C.num(plain.attack)+12,'공업 +12%');
  assert.strictEqual(C.num(all.regen),C.num(plain.regen)+.45,'체젠 +0.45/s');
  assert.strictEqual(C.num(all.mana),C.num(plain.mana)+.8,'마젠 +0.8/s');
  assert(all.source.includes('연구소'));
  const none=C.currentSpec(state,'physical',Object.assign({},base,{labResearch:{attack:false,slow:false,hpRegen:false,mpRegen:false,round:null}}));
  assert.strictEqual(C.num(none.slow),C.num(plain.slow),'미체크는 불변');
  assert(!none.source.includes('연구소'));
});

test('상위 전투 데이터는 72행이며 확정 상위 조회가 동작한다',()=>{
  const table=global.ORD_UPPER_COMBAT;
  assert.strictEqual(table.version,'2305C');
  assert.strictEqual(Object.keys(table.rows).length,72);
  const croc=units.find(u=>u.id==='F50h');
  const combat=C.upperCombatFor(croc);
  assert(combat&&combat.atkType==='pierce','크로커다일 관통 평타');
  const result=C.upperBossDps(croc,1,{bossArmor:350,armorReduce:180,speedBuffPct:0});
  assert(result&&result.effective>0&&result.multiplier>0,'보스 실효 DPS 계산');
});

test('UI: 렌더 예외 가드·연구소 체크박스·DPS 표시가 소스에 존재한다',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes('renderUnsafe()'),'render guard missing');
  assert(app.includes('v151-render-error'),'render error note missing');
  assert(app.includes('labResearch'),'lab research state missing');
  assert(app.includes('v151-upper-dps'),'upper dps display missing');
  assert(app.includes('percent01(draft.bossHpPercent)'),'bossHpPercent 0~100 clamp missing');
  const helper=fs.readFileSync(path.join(EXT,'ord_helper.html'),'utf8');
  assert(helper.includes('ord_upper_combat_data.js'),'combat data not loaded by helper');
});

let failures=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);}
  catch(error){failures+=1;console.error(`FAIL ${name}`);console.error(error&&error.message||error);}
}
console.log(`V17_0_COMBAT_DATA ${tests.length-failures}/${tests.length} passed`);
if(failures)process.exit(1);
