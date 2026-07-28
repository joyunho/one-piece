'use strict';

// v17.25 집중형 UI 계약. 상시 화면은 상태 스트립과 네 가지 판단만 남긴다.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ext = path.join(__dirname, '../ord_tmo_auto_extension_v15_0_0_rebuild');
const app = fs.readFileSync(path.join(ext, 'ord_app.js'), 'utf8');
const css = fs.readFileSync(path.join(ext, 'ord_cockpit_v15.css'), 'utf8');
const slice = (start, end) => app.slice(app.indexOf(start), app.indexOf(end));

const tests = [];
let failed = 0;
function test(name, fn) { tests.push([name, fn]); }

test('renderCoach는 상태와 4개 핵심 판단 영역만 배치한다', () => {
  const coach = slice('renderCoach(state,plan,phase,clock,health){', 'renderCoachDetails(state,plan,open=false){');
  const regions = [...coach.matchAll(/data-region="([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(regions, ['next-action', 'clear-gaps', 'rare-ledger', 'upper-party']);
  assert(coach.includes('renderV153Status(state,clock,health)'));
  assert(!coach.includes('renderV151RunHeader'));
  assert(!coach.includes('renderV152RarePlan'));
});

test('다음 행동은 확정 카드 하나와 후속 후보 최대 2개만 보인다', () => {
  const coach = slice('renderCoach(state,plan,phase,clock,health){', 'renderCoachDetails(state,plan,open=false){');
  const candidate = slice('renderV153NextCandidate(state,plan){', 'renderV153Spec(state,plan){');
  assert(coach.includes('renderV151NextAction(state,plan,health)'));
  assert(coach.includes('renderV153NextCandidate(state,plan)'));
  assert(candidate.includes('picked.length>=2'));
  assert(candidate.includes('그다음 후보 · 지금 고정하지 않음'));
});

test('클리어 결손은 전설 환산과 최우선 결손 최대 4개만 보여준다', () => {
  const spec = slice('renderV153Spec(state,plan){', 'renderV153RareLedger(state,plan){');
  assert(spec.includes('C.progressionCounts(state)'));
  assert(spec.includes("open.filter(row=>row.key!=='slow').slice(0,4)"));
  assert(spec.includes('v153-slow-pin'));
  for (const marker of ['전설급 환산', '남은 필수 결손', '확보한 조건', '최우선']) {
    assert(spec.includes(marker), marker);
  }
  assert(!spec.includes('지금 내 파티'));
});

test('희귀 장부는 사용·보류·리롤과 즉시 제작 전설급을 함께 보여준다', () => {
  const rare = slice('renderV153RareLedger(state,plan){', 'renderV153UpperParty(state,plan){');
  for (const marker of ['상위 올리기 전 안전 리롤', "key:'use'", "key:'hold'", "key:'reroll'", '내 희귀함으로 만들 수 있는 전설급']) {
    assert(rare.includes(marker), marker);
  }
  // v17.28: 이 칸은 "내 희귀함으로 만들 수 있는" 목록이므로 보유 희귀를
  // 실제로 쓰는 조합만 실어야 한다(v153RareCraftRows → rareCraftableLegends).
  // 희귀 소모를 요구하지 않는 v151BuildableLegendRows를 쓰면 "희귀 직접
  // 소모 없음" 항목이 그대로 실린다.
  assert(rare.includes('this.v153RareCraftRows(state,plan)'));
  assert(!rare.includes('.filter(row=>row&&row.feasible).slice(0,3)'));
  assert(rare.includes('후보 중 하나라도 사용하는 희귀는 돌리지 않습니다.'));
});

test('상위 후보와 확정 후 보조·해적선 후보는 각각 최대 3개다', () => {
  const upper = slice('renderV153UpperParty(state,plan){', 'renderCoach(state,plan,phase,clock,health){');
  assert(upper.includes('(decision.routeCandidates||[]).slice(0,3)'));
  assert(upper.includes('this.v151BuildableLegendRows(state,plan)'));
  assert(upper.includes('v153ShipOpportunity(state,plan)'));
  assert(upper.includes('supports=ship?'));
  assert(upper.includes('.slice(0,3)'));
  for (const marker of ['파티 보기', '다음 보조 전설급', '전체 파티 보기']) assert(upper.includes(marker), marker);
});

test('설정·기록·진단은 상태 스트립의 기본 접힘 도구함에 남는다', () => {
  const status = slice('renderV153Status(state,clock,health){', 'renderV153NextCandidate(state,plan){');
  const settings = slice('renderV153Settings(state){', 'renderV153Status(state,clock,health){');
  assert(status.includes('<details class="v153-tools">'));
  for (const marker of ['TMO 동기화', '기록 보기', 'JSON 저장', '게임 결과', '수동 패 보정', '연결 진단']) assert(status.includes(marker), marker);
  for (const marker of ['data-opt="gorosei"', 'data-opt="virtualSpecialId"', 'data-opt="story10Reward"', '연구소 설정']) assert(settings.includes(marker), marker);
});

test('대형 타이포와 반응형 12열 그리드를 사용한다', () => {
  assert(css.includes('.v153-screen{'));
  assert(css.includes('font-size:16px'));
  assert(css.includes('.v153-panel>header h2'));
  assert(css.includes('font-size:22px'));
  assert(css.includes('.v153-next .v151-action-title{font-size:28px'));
  assert(css.includes('.v153-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr))'));
  assert(css.includes('@media(max-width:760px)'));
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}\n  ${error && error.message}`); }
}
console.log(`V17_25_LAYOUT ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
