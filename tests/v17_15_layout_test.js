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

test('renderCoach는 상태와 6개 핵심 판단 영역만 배치한다', () => {
  const coach = slice('renderCoach(state,plan,phase,clock,health){', 'renderCoachDetails(state,plan,open=false){');
  const regions = [...coach.matchAll(/data-region="([^"]+)"/g)].map(m => m[1]);
  // v18.4(사용자 목업): 6개 판단 영역. 아래 이름 순서가 곧 화면 순서다.
  assert.deepStrictEqual(regions, ['next-action', 'next-preview', 'craftable-legends', 'clear-gaps', 'upper-party', 'unused-rare']);
  assert(coach.includes('renderV153Status(state,clock,health)'));
  assert(!coach.includes('renderV151RunHeader'));
  assert(!coach.includes('renderV152RarePlan'));
});

test('다음 행동은 확정 카드 하나와 후속 후보 최대 2개만 보인다', () => {
  const coach = slice('renderCoach(state,plan,phase,clock,health){', 'renderCoachDetails(state,plan,open=false){');
  const candidate = slice('renderV153Preview(state,plan){', 'renderV153CraftableLegends(state,plan){');
  assert(coach.includes('renderV151NextAction(state,plan,health)'));
  assert(coach.includes('renderV153Preview(state,plan)'));
  // v18.4: 후속 후보 수집이 v153NextCandidateRows 로 빠졌다(1번 카드와 2번
  // 패널이 같은 목록을 보게 하려고). 상한 계약은 그 헬퍼에서 지킨다.
  const candidateRows = slice('v153NextCandidateRows(plan){', 'renderV153NextCandidate(state,plan){');
  assert(candidateRows.includes('picked.length>=2'));
  // v18.4: 문구가 2번 패널로 옮겨졌다. "지금 고정하지 않는다"는 계약은 유지 —
  // 확정은 1번 카드 하나뿐이라는 말이 화면에 남아야 한다.
  assert(candidate.includes('지금 확정하는 것은 1번 카드 하나뿐입니다.'));
});

test('스펙은 한 가지 행 형식으로 통일되고 축으로만 묶인다', () => {
  // v18.7(사용자 지적: "스펙 표기가 중구난방"): 같은 정보를 축 카드·이감 전용
  // 핀·요약 3칸·결손 카드 네 형식으로 보여 주던 것을 한 행 형식으로 합쳤다.
  //   [아이콘] 역할명 · 현재/목표 · 부족 N
  // 축(생존/화력)은 행 형식을 바꾸지 않고 묶음 제목으로만 남는다 — v18 이 축을
  // 나눈 이유(생존은 뚫리면 죽고 화력은 밀릴 뿐)는 계속 지킨다.
  const spec = slice('renderV153Spec(state,plan){', 'renderV153RareLedger(state,plan){');
  assert(spec.includes('C.progressionCounts(state)'));
  assert(spec.includes('v153-role'), '통일 행 클래스가 없음');
  assert(spec.includes("group('survival'") && spec.includes("group('firepower'"), '축 묶음이 사라짐');
  for (const marker of ['전설급 환산', '남은 필수 결손', '최우선', '부족 ']) {
    assert(spec.includes(marker), marker);
  }
  // 옛 형식이 되살아나면 다시 중구난방이 된다.
  for (const gone of ['v153-slow-pin', 'v153-axis-row', 'v153-spec-summary', 'v153-gap-grid']) {
    assert(!spec.includes(gone), `옛 형식이 남아 있음: ${gone}`);
  }
  assert(!spec.includes('지금 내 파티'));
});

test('희귀 판단은 만들 수 있는 전설급(3번)과 안 쓰는 희귀(6번)로 갈린다', () => {
  // v18.4(사용자 목업): 한 칸에 뭉쳐 있던 희귀 판단을 둘로 나눴다. 나뉘어도
  // 사용·보류 장부는 사라지지 않는다 — 6번 패널 안에 접어서 유지한다.
  const rare = slice('renderV153CraftableLegends(state,plan){', 'renderV153UnusedRare(state,plan){');
  const unused = slice('renderV153UnusedRare(state,plan){', 'renderV153UpperParty(state,plan){');
  for (const marker of ['상위 올리기 전 안전 리롤', "key:'use'", "key:'hold'"]) {
    assert(unused.includes(marker), marker);
  }
  assert(unused.includes("row.reroll"), '리롤 후보 추출이 사라짐');
  // v17.28: 이 칸은 "내 희귀함으로 만들 수 있는" 목록이므로 보유 희귀를
  // 실제로 쓰는 조합만 실어야 한다(v153RareCraftRows → rareCraftableLegends).
  // 희귀 소모를 요구하지 않는 v151BuildableLegendRows를 쓰면 "희귀 직접
  // 소모 없음" 항목이 그대로 실린다.
  assert(rare.includes('this.v153RareCraftRows(state,plan)'));
  assert(!rare.includes('.filter(row=>row&&row.feasible).slice(0,3)'));
  assert(unused.includes('후보 중 하나라도 사용하는 희귀는 돌리지 않습니다.'));
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
  const status = slice('renderV153Status(state,clock,health){', 'renderV153Preview(state,plan){');
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
