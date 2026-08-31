'use strict';

// v23.1.1(사용자 리포트): "사보 히든은 물딜인데 파티에 왜 넣는거냐"
//
// 나미(초월 [마딜]) 기준 클리어 파티 참고안에 보유 중인 사보(히든 [물딜])가
// '보유' 배지로 실렸다.  원인: 스쿼드 플래너의 보유 최종 유닛 시드
// (finalEntries)가 계통 무관이었다 — 미래 후보는 allowedCandidate 가
// unitFamily 로 걸렀지만, 이미 손에 있는 유닛은 그대로 계획에 들어갔다.
//
// 계약:
//  ① 계획 경로(finalEntries + mode)는 반대 계통 명시 유닛을 제외한다.
//     중립(스턴·왜곡 등 무표기)은 양쪽 모두 유지.
//  ② mode 없이 부르면 종전대로 실제 보드 전체 — 체크포인트·보드 슬롯
//     계산은 물리적 사실을 재야 하므로 필터하지 않는다.
//  ③ planFinalSquad 는 제외 근거를 familyExcluded 로 노출하고, 파티
//     팝업이 이를 표기한다(왜 빠졌는지 역질문에 답).

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js'])require(path.join(EXT,file));
const C=global.ORDCore;
const P=global.ORDSquadPlanner;
const units=global.ORD_TMO_UNITS;

// 픽스처 id (2.312 카탈로그): V80H 나미(초월 [마딜]) · M30h 사보(히든 [물딜])
// · 290H 사보(초월 [물딜]) · 780h 토키(전설 [마딜]) · W20h 드래곤(전설 [스턴]=중립)
const NAMI='V80H',SABO_HIDDEN='M30h',SABO_TRANS='290H',TOKI='780h',DRAGON='W20h';

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('전제: 카탈로그 계통 판정(사보 히든=물딜, 나미 초월=마딜, 드래곤 스턴=중립)',()=>{
  const db=C.buildDb(units);
  assert.strictEqual(C.familyOf(db.byId.get(SABO_HIDDEN)),'physical');
  assert.strictEqual(C.familyOf(db.byId.get(NAMI)),'magic');
  assert.strictEqual(C.familyOf(db.byId.get(TOKI)),'magic');
  assert.strictEqual(C.familyOf(db.byId.get(DRAGON)),'neutral');
});

test('마딜 파티: 보유 사보 히든(물딜)은 라인업 제외 + familyExcluded 근거 노출',()=>{
  const plan=P.planFinalSquad({units,counts:{[NAMI]:1,[SABO_HIDDEN]:1,[DRAGON]:1,[TOKI]:1},wisp:20,settings:{mode:'magic',upperPreviewId:NAMI,targetSquadCount:9},locks:[]});
  assert(!plan.error,`플랜 오류: ${plan.error}`);
  const ids=(plan.finalLineup||[]).map(row=>row.id);
  assert(!ids.includes(SABO_HIDDEN),`사보 히든이 마딜 파티에 혼입: ${ids.join(',')}`);
  assert(ids.includes(NAMI),'기준 상위 나미 누락');
  assert(ids.includes(DRAGON),'중립(스턴) 드래곤은 유지돼야 한다');
  assert(ids.includes(TOKI),'같은 계통 토키는 유지돼야 한다');
  const excluded=(plan.familyExcluded||[]).map(row=>row.id);
  assert(excluded.includes(SABO_HIDDEN),'familyExcluded 에 사보 히든 근거 누락');
});

test('물딜 파티(거울): 보유 토키(마딜)는 제외, 사보 히든·중립 드래곤은 유지',()=>{
  const plan=P.planFinalSquad({units,counts:{[SABO_TRANS]:1,[SABO_HIDDEN]:1,[DRAGON]:1,[TOKI]:1},wisp:20,settings:{mode:'physical',upperPreviewId:SABO_TRANS,targetSquadCount:9},locks:[]});
  assert(!plan.error,`플랜 오류: ${plan.error}`);
  const ids=(plan.finalLineup||[]).map(row=>row.id);
  assert(!ids.includes(TOKI),`토키(마딜)가 물딜 파티에 혼입: ${ids.join(',')}`);
  assert(ids.includes(SABO_HIDDEN),'사보 히든(물딜)은 물딜 파티에 유지돼야 한다');
  assert(ids.includes(DRAGON),'중립(스턴) 드래곤은 유지돼야 한다');
  const excluded=(plan.familyExcluded||[]).map(row=>row.id);
  assert(excluded.includes(TOKI),'familyExcluded 에 토키 근거 누락');
});

test('실제 보드 판정은 불변: mode 없는 finalEntries 는 반대 계통도 전량 집계',()=>{
  const state={db:C.buildDb(units),counts:{[NAMI]:1,[SABO_HIDDEN]:1}};
  const board=P._test.finalEntries(state,state.counts).map(u=>u.id);
  assert(board.includes(SABO_HIDDEN),'보드 사실 집계에서 사보 히든이 사라지면 안 된다(체크포인트·슬롯 계산)');
  const planned=P._test.finalEntries(state,state.counts,'magic').map(u=>u.id);
  assert(!planned.includes(SABO_HIDDEN),'계획 집계(mode=magic)는 사보 히든을 제외해야 한다');
  assert(planned.includes(NAMI));
});

test('배선: 파티 팝업이 계통 제외를 표기(소스·CSS 검증)',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes('familyExcluded'),'앱이 familyExcluded 를 소비하지 않음');
  assert(app.includes('계통 제외'),'파티 팝업 계통 제외 문구 누락');
  assert(app.includes('v151-party-excluded'),'제외 안내 클래스 누락');
  const css=fs.readFileSync(path.join(EXT,'ord_cockpit_v15.css'),'utf8');
  assert(css.includes('.v151-party-excluded'),'제외 안내 CSS 누락');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_1_1_PARTY_FAMILY_GATE ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
