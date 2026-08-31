'use strict';

// v23.3.1 계약 — 사용자 리포트: "초월 유닛은 하나만 만들 수 있는데 2개
// 추천하는게 이상해".
//
// 0817 15:30 판 실측: 확정 상위 나미(V80H, 초월 [마딜])인데 두 번째 상위
// 후보에 키자루(5B0H)·타시기(N50H) — 둘 다 초월 — 가 '2상위 확정' 버튼과
// 함께 노출됐다.  게임 규칙: 초월·세라핌은 판당 1기.  플래너의 제작
// 게이트(transcendUsed+trans>=1)는 이미 막고 있었고, v19 두 번째 상위
// UI 목록·처방 합류 루프만 뚫려 있었다.  사용자는 그 판에서 직접
// 에이스(950h, 영원 — 합법)를 골랐다.
//
// 계약: ① 메인이 초월이면 2상위 후보에서 초월 제외(영원·불멸은 유지)
//      ② 초월/세라핌 사용량(transcendUsed·seraphUsed)도 같은 게이트
//      ③ 처방 추천도 우회 불가  ④ 확정 핸들러 하드 가드(토스트 거부)

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,App=context.ORDApp.App;
const units=context.ORD_TMO_UNITS;
const NAMI='V80H',KIZARU='5B0H',TASHIGI='N50H',HANCOCK='C50h';

const tests=[];
function test(name,fn){tests.push([name,fn]);}
function appStub(overrides){
  const obj=Object.create(App.prototype);
  obj.state=Object.assign({mode:'magic',magicRoute:'auto',transcendUsed:0,seraphUsed:0,changedUsed:0,rerollsUsed:0,currentRound:30,vetoIds:[]},overrides||{});
  obj.actualRound=()=>30;
  obj.v197PrescribedSecondIds=()=>[];
  return obj;
}
function stateOf(counts){return C.normalizeState(units,{counts:counts||{},currentAbilities:{}},{manualCounts:{}});}

test('전제: 나미·키자루·타시기=초월 [마딜], 핸콕=영원 [마딜]',()=>{
  const db=C.buildDb(units);
  for(const id of [NAMI,KIZARU,TASHIGI])assert(C.isTranscend(db.byId.get(id)),`${id}가 초월이 아니다`);
  assert(!C.isTranscend(db.byId.get(HANCOCK)));
  assert(C.familyOf(db.byId.get(HANCOCK))==='magic');
});

test('① 메인이 초월(나미)이면 2상위 후보에 초월이 오르지 않는다 — 영원·불멸은 유지',()=>{
  const app=appStub(),state=stateOf({[NAMI]:1});
  const main=state.db.byId.get(NAMI);
  const rows=app.v19SecondUpperCandidates(state,{mode:'magic',settings:{}},main);
  assert(rows.length>0,'후보가 통째로 비었다 — 게이트가 과도하다');
  for(const row of rows)assert(!C.isTranscend(row.unit),`초월 후보가 살아 있다: ${row.unit.name}`);
  assert(rows.some(row=>/영원|불멸/.test(C.groupName(row.unit))),'합법 티어(영원·불멸) 후보까지 사라졌다');
});

test('② 메인이 영원(핸콕)이면 초월 후보 허용 — 단 transcendUsed=1 이면 다시 제외',()=>{
  const app=appStub(),state=stateOf({[HANCOCK]:1});
  const main=state.db.byId.get(HANCOCK);
  const open=app.v19SecondUpperCandidates(state,{mode:'magic',settings:{}},main);
  assert(open.some(row=>C.isTranscend(row.unit)),'초월 미사용인데 초월 후보가 없다 — 게이트 과도');
  const used=appStub({transcendUsed:1});
  const closed=used.v19SecondUpperCandidates(state,{mode:'magic',settings:{}},main);
  assert(!closed.some(row=>C.isTranscend(row.unit)),'초월을 이미 썼는데 초월 후보가 남았다');
});

test('③④ 처방 우회 차단 + 확정 핸들러 하드 가드 (소스 계약)',()=>{
  const app=read('ord_app.js');
  assert(app.includes('처방 추천도 배타 티어(초월·세라핌 판당 1기)를 우회 못 한다'),'처방 게이트 부재');
  assert(app.includes('초월은 판당 1기만 만들 수 있습니다'),'확정 핸들러 초월 가드 부재');
  assert(app.includes('세라핌은 판당 1기만 만들 수 있습니다'),'확정 핸들러 세라핌 가드 부재');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_3_1_EXCLUSIVE_TIER_SECOND_UPPER ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
