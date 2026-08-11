'use strict';
// v22.12.0 계약 — 웹 수집 정본 반영 (사용자: "너가 데이터를 웹서핑을 통해
// 더 모을 수 없어?").
//
// 출처: 디시 원랜디 갤러리 공식 누적 패치노트(no=189308) +
// api.tmo.gg/posts/41824 "개뿔 원랜디 2.312(가로)" 카탈로그.
// 정본 문서: 원랜디_오로성_패치_정본_20260811.txt
//
// ① 오로성 악몽 저주 정본 — GOROSEI curse 필드 + 공통 저주 export.
//    나스쥬로 117=102×1.15 · 워큐리 195=180+15 검증치가 문구에 산다.
// ② 설정 화면 배선 — 오로성 셀렉트 밑 저주 원문(.v2212-curse), 새턴은
//    화력 저주(스펙표 밖)라 warn 톤.  CSS 존재.
// ③ patch2312 — I50h 레베카 발동이감 50→60 (이름 교정 + roleProfile 실효),
//    V80H/OC0H/B90H/090H desc 추가.
// ④ 2.312 카탈로그 스냅샷 — data/ord_catalog_2312_20260810.json
//    31그룹/324유닛 파싱 + 오로성 3종 보정값 (v23 마이그레이션의 원본).

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

test('① 오로성 악몽 저주 정본 — curse 필드 + 공통 저주',()=>{
  assert(typeof C.GOROSEI_COMMON_CURSE==='string'&&C.GOROSEI_COMMON_CURSE.includes('공통(악몽)'),'공통 저주 export 없음');
  assert(C.GOROSEI_COMMON_CURSE.includes('+1,000만')&&C.GOROSEI_COMMON_CURSE.includes('+50만/초'),'공통 저주 수치가 정본과 다르다');
  const{nasjuro,warcury,saturn,none}=C.GOROSEI;
  assert(!none.curse,'오로성 미선택에 저주가 붙었다');
  // 나스쥬로 — 이속·공속·라인몬.  기존 이감 보정 117=102×1.15 검증치 명시.
  assert(nasjuro.curse.includes('이속 +15%')&&nasjuro.curse.includes('공속 -15%'),'나스쥬로 저주 수치 누락');
  assert(nasjuro.curse.includes('117'),'나스쥬로 검증치(117=102×1.15) 문구 없음');
  // 워큐리 — 방 +15(고정) · 마방 +15%(퍼센트).  v22.12.1: 맵 원본
  // (war3map.j 9369)으로 마방이 % 임이 확정 — 고정치 표기는 오류.
  assert(warcury.curse.includes('방어력 +15')&&warcury.curse.includes('마법방어력 +15%'),'워큐리 저주 수치 누락/마방 % 표기 누락');
  assert(warcury.curse.includes('195'),'워큐리 검증치(195=180+15) 문구 없음');
  // 새턴 — 화력 저주(스펙표 밖).  코치가 아직 목표치로 다루지 않음을 자백.
  assert(saturn.curse.includes('공격력 -30%')&&saturn.curse.includes('-10%'),'새턴 저주 수치 누락');
  assert(saturn.curse.includes('스펙표 밖'),'새턴 화력 저주가 스펙표 밖임을 밝히지 않는다');
});

test('② 설정 화면 — 오로성 저주 표시 (.v2212-curse, 새턴 warn)',()=>{
  const stub=Object.create(App.prototype);
  stub.state={gorosei:'saturn',virtualSpecialId:'',story10Reward:'',labResearch:{},upperResearchLevel:1};
  const saturnHtml=stub.renderV153Settings({db:null,wisp:0});
  assert(saturnHtml.includes('v2212-curse warn'),'새턴 저주에 warn 톤이 없다');
  assert(saturnHtml.includes('공통(악몽)'),'공통 저주가 화면에 없다');
  stub.state.gorosei='nasjuro';
  const nasHtml=stub.renderV153Settings({db:null,wisp:0});
  assert(nasHtml.includes('v2212-curse')&&!nasHtml.includes('v2212-curse warn'),'나스쥬로는 경고 톤이 아니어야 한다');
  stub.state.gorosei='none';
  const noneHtml=stub.renderV153Settings({db:null,wisp:0});
  assert(!noneHtml.includes('v2212-curse'),'미선택인데 저주 블록이 떴다');
  const css=read('ord_ui_v20.css');
  assert(css.includes('.v2212-curse{')&&css.includes('.v2212-curse.warn'),'CSS .v2212-curse 규칙 없음');
});

test('③ patch2312 — I50h 발동이감 60 실효 + 설명 패치 4건',()=>{
  const i50=context.ORD_TMO_UNITS.find(u=>u.id==='I50h');
  assert(i50,'I50h 레베카가 카탈로그에 없다');
  assert.strictEqual(C.num(i50.abilities['발동이동속도 감소']),60,'발동이감이 60이 아니다');
  // v23.0 재핀: 2312 카탈로그 베이스는 이름에 발동이감 태그를 달지 않는다
  // ("레베카 💙 (스플딜러 방깍38)") — 이름 교정 계약은 '옛 50 표기가 없다'
  // 로만 남긴다.  수치 실효(60)와 roleProfile 이 본계약이다.
  assert(!/발동이감50/.test(String(i50.name)),'이름에 옛 발동이감50 표기가 남았다');
  assert.strictEqual(C.num(C.roleProfile(i50).triggerSlow),60,'roleProfile triggerSlow 실효가 60이 아니다');
  // v22.12.1: 방주맥심 스턴 1.2초는 맵 원본(A0BG) 확정 — desc 로만 명시
  // (스턴 인분 산입은 협의 대상), 레베카는 맵 원본 확정 문구 포함.
  assert(String(i50.desc||'').includes('맵 원본'),'I50h 맵 원본 확정 문구 없음');
  const expects=[['V80H','중첩되지'],['OC0H','11만'],['B90H','15%'],['090H','강진'],['X30h','스턴 1.2초']];
  for(const[id,token]of expects){
    const unit=context.ORD_TMO_UNITS.find(u=>u.id===id);
    assert(unit,`${id} 가 카탈로그에 없다`);
    assert(String(unit.desc||'').includes(token),`${id} 설명 패치 누락 (${token})`);
  }
  // 패치 레이어 자체 — patch2312 블록이 소스에 산다 (자구 핀).
  const src=read('ord_data_patch.js');
  assert(src.includes('patch2312'),'ord_data_patch.js 에 patch2312 블록 없음');
});

test('④ 2.312 카탈로그 스냅샷 — 31그룹/324유닛 + 오로성 보정값',()=>{
  const raw=fs.readFileSync(path.join(REPO,'data/ord_catalog_2312_20260810.json'),'utf8');
  const catalog=JSON.parse(raw);
  assert.strictEqual(catalog.schema,'ord-catalog-2312','스키마 표식 없음');
  assert(String(catalog.source).includes('api.tmo.gg/posts/41824'),'출처 표기 없음');
  assert.strictEqual(catalog.groups.length,31,`그룹 수 ${catalog.groups.length} ≠ 31`);
  const units=catalog.groups.flatMap(g=>g.units||[]);
  assert.strictEqual(units.length,324,`유닛 수 ${units.length} ≠ 324`);
  // 오로성 3종 보정값 — 코치 curse 문구의 원본 근거.
  const byName=name=>units.find(u=>String(u.name||'').includes(name));
  const nasjuro=byName('나스쥬로'),warcury=byName('워큐리'),saturn=byName('새턴');
  assert(nasjuro&&C.num(nasjuro.abilities['공격속도 증가'])===-15&&C.num(nasjuro.abilities['이동속도 감소'])===-15,'나스쥬로 보정값 불일치');
  assert(warcury&&C.num(warcury.abilities['방어력 감소'])===-15&&C.num(warcury.abilities['마법방어력 감소'])===-15,'워큐리 보정값 불일치');
  assert(saturn&&C.num(saturn.abilities['공격력 증가'])===-30&&C.num(saturn.abilities['폭발형 데미지 증폭'])===-10,'새턴 보정값 불일치');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V22_12_0_WEB_CANON ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
