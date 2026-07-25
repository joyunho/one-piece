'use strict';

// v17.15: 6영역 재구성 계약 — 사용자 지정 정보 구조가 유지되는지 고정한다.
//  0 라운드·녹화 스트립 / 1 다음 행동(최대 5) / 2 파티 스펙(히어로 타일)
//  3 희귀 활용 방안 / 4 상위·파티 특징 / 5 기타 설정.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ext = path.join(__dirname, '../ord_tmo_auto_extension_v15_0_0_rebuild');
const app = fs.readFileSync(path.join(ext, 'ord_app.js'), 'utf8');
const css = fs.readFileSync(path.join(ext, 'ord_cockpit_v15.css'), 'utf8');

const tests = [];
let failed = 0;
function test(name, fn) { tests.push([name, fn]); }

test('renderCoach는 정확히 6영역을 사용자 순서로 배치한다', () => {
  const start = app.indexOf('renderCoach(state,plan,phase,clock,health){');
  const end = app.indexOf('renderCoachDetails(state,plan,open=false){');
  const coach = app.slice(start, end);
  const regions = [...coach.matchAll(/data-region="([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(regions, ['game-recording', 'next-action', 'current-spec', 'rare-plan', 'upper-info', 'gorosei']);
});

test('다음 행동: 확정 카드 + 이어질 후보(최대 4 = 합계 5) 리스트', () => {
  assert(app.includes('renderV151NextAction(state,plan,health)}${this.renderV151Preparation(state,plan)'), '준비 목록이 다음 행동 영역에 없음');
  assert(app.includes('items.slice(0,4)'), '이어질 후보가 4개(합계 5)로 제한되지 않음');
  assert(app.includes('이어질 행동 후보'), '우선순위 리스트 제목이 사라짐');
});

test('파티 스펙: 히어로 타일(전설급 환산·선위·최우선 결손)', () => {
  for (const marker of ['v152-hero-row', '전설급 환산', '목표 9~11', '최우선 결손']) {
    assert(app.includes(marker), `히어로 타일 마커가 사라짐: ${marker}`);
  }
  assert(app.includes('C.isUpper(unit)?3:1'), '전설급 환산 규칙(상위×3)이 사라짐');
  assert(css.includes('.v152-hero b{font-size:30px'), '히어로 수치 대형 타이포가 사라짐');
});

test('희귀 활용 방안: 파티 미리보기·이유 문장·리롤·제작 가능 전설급', () => {
  assert(app.includes('renderV152RarePlan(state,plan){'), '희귀 활용 렌더러가 사라짐');
  for (const marker of ['v151ComputeParty(state,plan,unit.id)', 'rareAllocation', '남는 희귀(리롤 후보)', 'v151RerollTargets(state,plan,decision)', '지금 희귀로 만들 수 있는 전설급']) {
    assert(app.includes(marker), `희귀 활용 구성요소가 사라짐: ${marker}`);
  }
  // 이유 문장 폴백은 파티 계산의 희귀 배분에서 온다 — 표시 전용.
  const rarePlan = app.slice(app.indexOf('renderV152RarePlan(state,plan){'), app.indexOf('renderV151CurrentSpec(state,plan){'));
  assert(rarePlan.includes("use.status==='spent'") && rarePlan.includes("use.status==='reserved'"), 'rareAllocation 사용처 분해가 사라짐');
});

test('상위·파티 특징: upperStrategy 문장 + 메모 + 실측 동반', () => {
  for (const marker of ['v152-upper-guide', 'C.upperStrategy(upper)', 'C.upperMemoFor', '이 상위·파티의 특징']) {
    assert(app.includes(marker), `운영 가이드 구성요소가 사라짐: ${marker}`);
  }
});

test('기타 설정: 연구소 입력이 설정 패널로 이동', () => {
  const spec = app.slice(app.indexOf('renderV151CurrentSpec(state,plan){'), app.indexOf('v151FamilyIntent(state){'));
  assert(!spec.includes('v151-upg-row'), '연구소 입력이 스펙 패널에 남아 있음');
  const gorosei = app.slice(app.indexOf('renderV151Gorosei(state,plan){'), app.indexOf('renderV151ClearParty(party){'));
  assert(gorosei.includes('v151-upg-row') && gorosei.includes('upperLevel'), '연구소 입력이 설정 패널에 없음');
});

test('타이포 확대: 코치 화면 기본 14px + 그리드 정의', () => {
  assert(css.includes('.v152-screen{font-size:14px}'), '기본 글자 확대가 사라짐');
  assert(css.includes('.v152-grid{display:grid'), 'v152 그리드가 사라짐');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}\n  ${error && error.message}`); }
}
console.log(`V17_15_LAYOUT ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
