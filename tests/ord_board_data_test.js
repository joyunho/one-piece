'use strict';

// ORD 악몽 보드(v28 전면 신작) — 증류 데이터 계약.
//
// data.js 는 생성물이다(tools/build_ord_board_data.js).  다섯 달의 검증
// 지식이 굳은 그대로인지 — 특히 사용자가 직접 확정한 정본들 — 을 계약
// 한다.  깨지면 재생성 누락이거나 증류기 회귀다.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const NEW=path.join(__dirname,'..','ord_board');
const ctx={console};ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(NEW,'data.js'),'utf8'),ctx,{filename:'data.js'});
const DATA=ctx.ORD_BOARD_DATA;
const byId=new Map(DATA.units.map(u=>[u.id,u]));

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① 뼈대 — 2.314 카탈로그 전수·티어·상위/전설급 구분',()=>{
  assert.strictEqual(DATA.gameVersion,'2.314');
  assert(DATA.units.length>=320,`유닛 수 이상: ${DATA.units.length}`);
  const uppers=DATA.units.filter(u=>u.upper);
  assert(uppers.length>=70,`상위 수 이상: ${uppers.length}`);
  for(const u of uppers)assert(/제한됨|초월|불멸|영원/.test(u.group),`상위 그룹 위반: ${u.name}`);
  // 세라핌은 상위가 아니다(2.314 재검증 정본) — 전설급이다.
  const seraphs=DATA.units.filter(u=>u.seraph);
  assert.strictEqual(seraphs.length,4,'세라핌 4종 아님');
  for(const s of seraphs){assert(!s.upper,`세라핌이 상위로 분류: ${s.name}`);assert(s.legendish,`세라핌이 전설급이 아님: ${s.name}`);}
  // 흔함은 위습 1개로 산다 — 솔버의 위습 환산 전제.
  const commons=DATA.units.filter(u=>u.tier==='common'&&u.stuffs.length);
  assert(commons.length>=8,'흔함 표본 부족');
  for(const c of commons)assert(c.stuffs.length===1&&c.stuffs[0].id===DATA.wispId,`흔함 위습 전제 위반: ${c.name}`);
});

test('② 역할 굳힘 — 사용자 확정 정본이 데이터에 남아 있다',()=>{
  // (변화)베이비5: 광보잡 아님 + 암브(2.310 공식 · 사용자 0826g).
  const baby=byId.get('N70h');
  assert(baby&&!baby.roles.boss&&!baby.roles.frenzy,'베이비5 광보잡 잔재');
  assert(baby.roles.armorBreak,'베이비5 암브 소실');
  // 미나토(신비): 마뎀증3 → 마방깎3 (2.314 공식).
  const minato=byId.get('unit_1761062663657_987');
  assert.strictEqual(minato.roles.magicAmp,0,'미나토 마뎀증 잔재');
  assert.strictEqual(minato.roles.magicDef,3,'미나토 마방깎 소실');
  // 캐럿(변화) 폭뎀증 램프 25 · 페로나(왜곡) 폭뎀증 10 (맵 원문 승격).
  assert.strictEqual(byId.get('J70h').roles.explosionAmp,25,'캐럿 폭뎀증 회귀');
  assert.strictEqual(byId.get('840h').roles.explosionAmp,10,'페로나 폭뎀증 회귀');
  // 도플라밍고(변화) 단일 0.5.
  assert.strictEqual(byId.get('S50h').roles.single,0.5,'도플(변화) 단일 회귀');
  // S-베어 사용자 고정 규칙: 광보잡으로 세지 않고 끝딜 1 · 짤스턴.
  const sbear=DATA.units.find(u=>/S-베어/.test(u.name));
  assert(!sbear.roles.boss&&!sbear.roles.frenzy&&sbear.roles.end>=1,'S-베어 규칙 회귀');
  // 유효 스턴 연구표 반영 표본: 방주맥심 0.05 인분.
  const maxim=byId.get('X30h');
  assert(Math.abs(maxim.roles.stun-0.05)<1e-9,'방주맥심 유효 스턴 회귀');
});

test('③ 클리어 실측·코드맵·목표',()=>{
  const canons=Object.keys(DATA.clear);
  assert(canons.length>=60,`상위 실측 정본 수 이상: ${canons.length}`);
  let games=0,partners=0,pairs=0;
  for(const c of canons){games+=DATA.clear[c].games;partners+=DATA.clear[c].partners.length;pairs+=DATA.clear[c].pairs.length;}
  assert(games>100000,`실측 판수 이상: ${games}`);
  assert(partners>100&&pairs>100,'동반·페어 데이터 소실');
  // 수신 번역 지식: 궤적 확정 3종 + 카탈로그 직결.
  assert.strictEqual(DATA.codeMap['S40h'],'unit_1767884940750_9880','초월쿠마 코드 소실');
  assert.strictEqual(DATA.codeMap['060h'],'unit_1767884925665_1037','해적선 코드 소실');
  assert(Object.keys(DATA.codeMap).length>=300,'코드맵 축소');
  // 스펙 목표 정본(2.312R 맵 + 오로성).
  assert.strictEqual(DATA.targets.slow.nasjuro,117);
  assert.strictEqual(DATA.targets.armor.warcurySoft,195);
  assert.strictEqual(DATA.targets.stun.floor,0.7);
  assert.strictEqual(DATA.targets.bossFrenzy.physical,1.5);
  assert.strictEqual(DATA.targets.bossFrenzy.magic,1);
});

test('④ 표기 분해 — 본명/스펙 괄호 분리 + 정체 괄호 유지',()=>{
  const vega=DATA.units.filter(u=>/^베가펑크 \(/.test(u.name)&&u.upper);
  assert(vega.length>=3,'베가펑크 변형 표본 부족');
  const shorts=new Set(vega.map(u=>u.short));
  assert.strictEqual(shorts.size,vega.length,`베가펑크 변형이 본명에서 뭉개짐: ${[...shorts].join('/')}`);
  const withSpec=DATA.units.find(u=>u.note&&/\d/.test(u.note));
  assert(withSpec,'스펙 괄호 분해가 전혀 없음');
  for(const u of DATA.units)if(u.note)assert(!u.short.includes(u.note),`본명에 노트 중복: ${u.name}`);
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`ORD_BOARD_DATA ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
