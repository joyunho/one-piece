'use strict';
// v23.0.0 계약 — 2312 카탈로그 전면 마이그레이션 + 리롤 항법 + 방주맥심 스턴.
//
// 사용자: "v23 마이그레이션 착수해 리롤 항법이랑 방주맥심 스턴도 같이 넣어줘"
//
// ① 카탈로그 베이스 교체 — ord_units_data.js 가 2312 카탈로그(324) +
//    계승 1(카이도 용폼)으로 재생성됐다.  생성기 산출물 표식 핀.
// ② 상위 티어 승계 — 2312 가 (S)~(F) 접두사를 버려서 구 덤프 73개 티어를
//    id 승계표로 보존했다.  전 상위 티어 판독 가능 + 표본 핀.
// ③ 어휘 이행 — '대미지→데미지' 등 새 키가 별칭으로 흡수돼 roleProfile 이
//    값을 잃지 않는다 (마뎀증·마방깎·단일마법).
// ④ 리롤 항법 — 기본 2회 · 도박광 +1(연속베팅 시 기본 비활성) · 카지노 +1
//    · 리스크헷지 +2·목재0 (맵 war3map.j 확정).  설정 UI + 엔진 상한 배선.
// ⑤ 방주맥심 유효 스턴 0.05 — 맵 JASS 판독(공격 카운터 150타·가동률
//    1.24~1.88%)의 정직한 산입.
// ⑥ 처형 축 — 조로(전설)·카벤딧슈 '처형'은 유닛삭제와 같은 라인 정리 축.
// ⑦ 검증 원장 — 차분 199건 맵 대조(문서·감사 파일 존재).

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const REPO=path.join(__dirname,'..');
const ROOT=path.join(REPO,'ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const tests=[];
function test(name,fn){tests.push([name,fn]);}

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_core.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_squad_planner.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,App=context.ORDApp.App;
const db=C.buildDb(context.ORD_TMO_UNITS);

test('① 카탈로그 베이스 — 2312 재생성(324+계승 1) · 생성기 표식',()=>{
  const src=read('ord_units_data.js');
  assert(src.includes('tools/build_units_data_2312.js'),'생성기 표식 없음 — 수동 편집 덤프로 회귀');
  assert.strictEqual(context.ORD_TMO_UNITS.length,325,`유닛 수 ${context.ORD_TMO_UNITS.length} ≠ 325(324+카이도 용폼 계승)`);
  // 계승 행: 카이도 용폼 — 라이브 TMO 가 활성 폼 id 를 실어오는 변신 페어.
  const dragon=db.byId.get('unit_1767886180546_6011');
  assert(dragon&&/용폼/.test(dragon.name),'카이도 용폼 계승 행이 없다');
  // 2312 에서 새로 온 실질 항목 표본 — 가이몬(탐색)·오타마(귀속).
  assert(db.byId.get('unit_1785943488472_5481'),'가이몬 없음');
  const otama=db.byId.get('unit_1767884614234_8036');
  assert(otama&&(otama.codes||[]).includes('P50h'),'오타마 실측 조인 코드(P50h) 소실');
});

test('② 상위 티어 승계 — 전 상위 판독 가능 + 표본(료쿠규 S·레베카 D)',()=>{
  const uppers=context.ORD_TMO_UNITS.filter(u=>C.isUpper(u));
  assert(uppers.length>=70,'상위 수가 비정상적으로 적다');
  for(const u of uppers){
    const tier=C.upperPowerTier(u,db);
    assert(tier.known&&/^(S|A|B|C|D|F)$/.test(tier.letter),`${u.id} ${u.name} 티어 판독 불가`);
  }
  assert.strictEqual(C.upperPowerTier(db.byId.get('LB0h')||db.byId.get('LB0H'),db).letter,'S','료쿠규 초월 S 승계 실패');
  assert.strictEqual(C.upperPowerTier(db.byId.get('I50h'),db).letter,'D','레베카 제한 D 승계 실패');
  const src=read('ord_core.js');
  assert(src.includes('UPPER_POWER_TIER_CARRYOVER'),'티어 승계표 상수 없음');
});

test('③ 어휘 이행 — 새 카탈로그 키가 역할 원장에 실효한다',()=>{
  // 시키(불멸): '마법데미지 증폭' 15 → magicAmp 15.
  assert.strictEqual(C.roleProfile(db.byId.get('B40h')).magicAmp,15,'마뎀증 새 키가 소실됐다');
  // 방주맥심: '마법방어력 감소' 10 → magicDef 10.
  assert.strictEqual(C.roleProfile(db.byId.get('X30h')).magicDef,10,'마방깎 새 키가 소실됐다');
  // 위습은 흔함 그룹으로 옮겨졌지만 흔함 유닛으로 세지 않는다.
  assert.strictEqual(C.isCommon(db.byId.get(C.WISP_ID)),false,'위습이 흔함 유닛으로 센다');
});

test('④ 리롤 항법 — navProfile 수치 + 설정 UI + 엔진 상한 배선',()=>{
  assert.deepStrictEqual(
    [C.navProfile('none','').rerollMax,C.navProfile('gambler','').rerollMax,C.navProfile('gambler','casino').rerollMax,C.navProfile('gambler','hedge').rerollMax,C.navProfile('gambler','betting').rerollMax],
    [2,3,4,5,2],'항법 리롤 상한 수치가 맵 확정과 다르다');
  assert.strictEqual(C.navProfile('gambler','hedge').rerollWood,0,'리스크헷지 목재 0 소실');
  assert.strictEqual(C.navProfile('conqueror','martial').upperCap,0,'계엄령 상위 금지 소실');
  assert.strictEqual(C.navProfile('conqueror','').upperCap,1,'패왕의길 상위 1기 소실');
  const stub=Object.create(App.prototype);
  stub.state={gorosei:'none',navFamily:'gambler',navPerk:'hedge',virtualSpecialId:'',story10Reward:'',labResearch:{},upperResearchLevel:1,rerollsUsed:0};
  assert.strictEqual(stub.rerollLimit(),5,'앱 rerollLimit 배선 실패');
  const html=stub.renderV153Settings({db:null,wisp:0});
  assert(html.includes('data-opt="navFamily"')&&html.includes('data-opt="navPerk"'),'항법 설정 UI 없음');
  assert(html.includes('v230-nav'),'항법 효과 요약 표시 없음');
  const engine=read('ord_v15_engine.js');
  assert(engine.includes('settings.rerollLimit'),'엔진이 항법 리롤 상한을 받지 않는다');
  const app=read('ord_app.js');
  assert(app.includes('rerollLimit:this.rerollLimit()'),'설정 페이로드에 리롤 상한 없음');
});

test('⑤ 방주맥심 유효 스턴 0.05 — 맵 판독 산입',()=>{
  const maxim=db.byId.get('X30h');
  const role=C.roleProfile(maxim);
  assert(role.stun>0.04&&role.stun<0.06,`맥심 유효 스턴이 0.05 부근이 아니다: ${role.stun}`);
  assert(C.STUN_RESEARCH.X30h&&C.STUN_RESEARCH.X30h.displayStun===.05,'스턴 연구표 X30h 항목 없음');
  assert(String(maxim.desc||'').includes('150타'),'공격 카운터형 판독 desc 없음');
});

test('⑥ 처형 축 — 유닛삭제와 같은 라인 정리 축으로 합산',()=>{
  assert.strictEqual(C.roleProfile(db.byId.get('S20h')).deletion,true,'조로(전설) 처형이 삭제 축에 없다');
  assert.strictEqual(C.roleProfile(db.byId.get('B50h')).deletion,true,'카벤딧슈 처형이 삭제 축에 없다');
});

test('⑦ 검증 원장 — 맵 대조 문서·데이터 실존',()=>{
  assert(fs.existsSync(path.join(REPO,'맵데이터_분석_20260811.txt')),'맵 분석 문서 없음');
  assert(fs.existsSync(path.join(REPO,'data/ORDR_S2_2312R_맵_전수문서화_v1.zip')),'맵 원본 zip 없음');
  assert(fs.existsSync(path.join(REPO,'tools/build_units_data_2312.js')),'카탈로그 생성기 없음');
  // 페루는 카탈로그 오기(100)를 맵 원문(40%)으로 이긴 대표 사례 — 패치 유지.
  assert.strictEqual(C.num((db.byId.get('unit_1767884647613_2996').abilities||{})['공격력 증가']),40,'페루 공증 맵 확정(40)이 풀렸다');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_0_0_CATALOG_2312 ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
