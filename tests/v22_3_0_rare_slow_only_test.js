'use strict';
// v22.3.0 계약 — 추천 정책 게이트 (사용자 규칙, 2026-08-10).
//
// 사용자: "희귀함은 이감 부족한 거 채우는 목적 아니면 추천하지마 그리고
// 첫 전설 만들고 희귀함은 왜 자꾸 추천하는거야 상위 선택해도 이상한
// 전설 추천하고"
//
// ① 단독 희귀 제작 후보는 이감 마감 전용 — 열린 이감 결손이 있고 그
//   희귀가 이감에 기여할 때만 후보 우주에 들어온다.  스턴·방깎 목적의
//   희귀 승격과 v17.6 의 50라+ 화력 희귀 예외는 은퇴.
// ② 상위 확정 후 비상위 전설은 파티 계획 소속이거나 열린 필수 결손을
//   직접 닫거나 기존 잉여·화력 예외일 때만 승인(아니면 명시 사유 HOLD).

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const engineSrc=read('ord_v15_engine.js');
const tests=[];
function test(name,fn){tests.push([name,fn]);}

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,engine=context.ORDV15Engine;
const db=C.buildDb(context.ORD_TMO_UNITS);
const model=round=>({knowledge:{db},round:{value:round},settings:{}});
const route={mode:'physical'};
const rows=list=>({requirements:list});
const openRow=key=>({key,label:key,required:true,waived:false,gap:10});
const closedRow=key=>({key,label:key,required:true,waived:false,gap:0});

// v24.2(사용자 0824: 152 특별함을 고르자 크로커다일이 "선위 4개 쓰고
// 먹으라"로 떴다): 필러 희귀는 현재 패 선위 2 이하일 때만 후보다.
// 이 테스트의 재료-풍족 패는 모든 등급 재료 9장 — 이감 희귀 전원이
// 선위 0으로 상한 안에 들어온다.
const richCounts=(()=>{const counts={};for(const unit of db.units||[...db.byId.values()])if(['common','uncommon','special'].includes(C.tierKey(unit)))counts[unit.id]=9;return counts;})();

test('① 이감이 열려 있으면 이감 기여 희귀만 후보에 오른다 (재료 풍족 패)',()=>{
  const picked=engine._test.combatRareCandidates(model(30),route,rows([openRow('slow'),openRow('stunFull')]),richCounts);
  assert(picked.length>0,'이감 마감용 희귀가 아예 없다');
  for(const unit of picked){
    assert(C.num(C.roleContribution(unit,'physical').slow)>0,`이감 기여 없는 희귀가 올라옴: ${unit.name}`);
  }
  const names=picked.map(unit=>String(unit.name||''));
  assert(names.some(name=>/페로나|크로커다일/.test(name)),'대표 이감 희귀(페로나·크로커다일)가 빠짐');
});

test('①-v24.2 필러 선위 상한: 빈 패(전원 2선위 초과)에서는 이감 희귀도 0명',()=>{
  const picked=engine._test.combatRareCandidates(model(30),route,rows([openRow('slow'),openRow('stunFull')]),{});
  assert.strictEqual(picked.length,0,`선위 2 초과 희귀가 후보에 남음: ${picked.map(u=>u.name).join(',')}`);
});

test('① 이감이 닫혀 있으면 다른 결손이 열려 있어도 희귀는 0명 — 스턴·방깎 목적 희귀 승격 금지',()=>{
  const picked=engine._test.combatRareCandidates(model(30),route,rows([closedRow('slow'),openRow('stunFull'),openRow('armor'),openRow('bossFrenzy')]),{});
  assert.strictEqual(picked.length,0,`이감이 닫혔는데 희귀 ${picked.length}명이 후보에 남음`);
});

test('① 예외의 경계 — 필수 전부 닫힌 50라+ 보스 창에서만 화력 희귀 허용 (구상 ⑥ + v17.6)',()=>{
  // 필수가 하나라도 열려 있으면(이감 닫힘·스턴 열림) 50라+ 라도 0명.
  const midBoss=engine._test.combatRareCandidates(model(52),route,rows([closedRow('slow'),openRow('stunFull')]),{});
  assert.strictEqual(midBoss.length,0,'필수 열린 50라+에 비이감 희귀가 올라옴');
  // 전부 닫힌 50라+ — 구상 ⑥ "스펙에 도움이 되는 희귀함": 화력 희귀 허용.
  const closedBoss=engine._test.combatRareCandidates(model(52),route,rows([closedRow('slow'),closedRow('single')]),{});
  assert(closedBoss.length>0,'완성 상태 보스 창의 화력 희귀 예외(v17.6·구상 ⑥)가 사라짐');
  // 50라 전에는 전부 닫혀도 희귀 없음.
  const early=engine._test.combatRareCandidates(model(45),route,rows([closedRow('slow')]),{});
  assert.strictEqual(early.length,0,'50라 전 완성 상태에 희귀가 올라옴');
});

test('③ 재료 라인 보호 — 열린 결손을 닫는 실존 전설의 희귀 재료는 리롤로 새지 않는다 (소스 계약)',()=>{
  // 희귀 후보 축소(①)의 부작용으로 마르코(이감30) 재료 베이비 5가
  // "사용처 없음 → 리롤"로 강등된 0810 재생 실측의 봉합.  부모는 엔진
  // 자신의 후보 게이트(계통·락)와 정확 원장 견적(이미 보유·차단·뽑기
  // 결손 배제)을 통과하고 위습 지평 안이어야 한다 — v16.7 "무용 희귀는
  // 리롤 후보"(P0-1)와의 경계.  행동 계약은 v15_failure_replay(A)와
  // v17_6_audit(P0-1)이 양쪽에서 잡는다.
  assert(engineSrc.includes('function materialLineProtection'),'재료 라인 보호가 없다');
  assert(engineSrc.includes('재료 — 열린 필수 마감 후보 보호'),'보호 사유 문구가 없다');
  assert(engineSrc.includes('wispOnlyShort'),'위습 부족 허용 경계가 없다');
  assert(engineSrc.includes('materialLine:materialLabels'),'원장 증거 키가 없다');
});

test('② 계획 밖 전설 보류 배선 (소스 계약)',()=>{
  assert(engineSrc.includes('planLegendOk='),'계획 밖 전설 게이트가 없다');
  assert(engineSrc.includes('planLegendOk&&(best.regression===0'),'게이트가 commit 판정에 걸려 있지 않다');
  assert(engineSrc.includes('확정 상위 계획 밖 전설이라 승인을 보류합니다'),'보류 사유 문구가 없다');
  assert(engineSrc.includes('planLegendHeld'),'보류 증거 키가 없다');
  // 예외 세 가지(필수 마감·잉여·화력)와 파티 계획 소속이 모두 통로다.
  assert(engineSrc.includes('planIds.has(String(first.quote.unit.id))||requiredRepair||surplusUpgrade||firepowerUpgrade'),'승인 통로 구성이 계약과 다르다');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V22_3_0_RARE_SLOW_ONLY ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
