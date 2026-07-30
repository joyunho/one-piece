'use strict';

// v19.1: 세 가지 사용자 교정.
//
//   ① "내 파티에 확정 이런거 있으면 좋을듯? 내가 버튼 누르면 자꾸
//      사라지니까 짜증나네." → 파티 확정/해제 버튼 + v151ComputeParty가
//      실제로 확정된 청사진을 적용하도록 고침(이전엔 항상 null로 넘겨
//      확정이 화면에만 뜨고 아무 효과가 없었다).
//   ② "상위 만들 떄 화면에 명령어 나오게 해줘 눌러서 들어가야
//      봐지는거 말고." → 1번 패널(지금 할 일)에 클릭 없이 명령어 노출.
//   ③ "이름 가리는거 고쳐줘." → 재료 그리드(direct-grid·lowest-grid·
//      raw-ability-grid)의 이름 칸이 넘쳐 옆 카드를 덮던 CSS 결함 수정.
//
// UI 동적 왕복(버튼을 실제로 눌러 상태가 바뀌는지)은 tests/ui_smoke_test.js
// 가 픽스처로 검증한다.  여기서는 소스 배선과 순수 로직만 잰다 — 브라우저
// 없이도 항상 돈다.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'ord_tmo_auto_extension_v15_0_0_rebuild');
const APP = fs.readFileSync(path.join(EXT, 'ord_app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(EXT, 'ord_cockpit_v15.css'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(EXT, 'ord_app.css'), 'utf8');

const tests = [];
let failed = 0;
function test(name, fn) { tests.push([name, fn]); }
function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `시작 지점을 찾지 못함: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
  assert(end > start, `끝 지점을 찾지 못함: ${endMarker}`);
  return source.slice(start, end);
}

// ── ① 파티 확정 버튼 ─────────────────────────────────────────────────────
test('buildPartyBlueprint가 자동(엄격)·수동(완화) 두 확정을 공유한다', () => {
  assert(/buildPartyBlueprint\(id,squad,options\)/.test(APP), 'buildPartyBlueprint 헬퍼가 없음');
  assert(/captureUpperBlueprint\(id,squad\)\{return this\.buildPartyBlueprint\(id,squad,\{requireFeasible:true\}\);\}/.test(APP),
    '자동 확정이 엄격 모드를 쓰지 않음 — 확정 즉시 완성 보장을 잃는다');
  assert(/captureCurrentParty\(id,squad\)\{return this\.buildPartyBlueprint\(id,squad,\{requireFeasible:false\}\);\}/.test(APP),
    '수동 확정이 완화 모드를 쓰지 않음 — 미완성 파티를 확정할 수 없다');
  const helper = slice(APP, 'buildPartyBlueprint(id,squad,options){', '\n  captureUpperBlueprint');
  assert(helper.includes('lineupIds.length<2||!containsUpper'), '최소 인원·상위 포함 검사가 빠짐');
  assert(helper.includes('options.requireFeasible'), '엄격 모드 분기가 없음');
});

test('파티 확정/해제 액션이 배선돼 있고 캐시를 비운다', () => {
  const handler = slice(APP, "if(a==='confirm-party')", "if(a==='lock-legend')");
  assert(/a==='confirm-party'/.test(handler) && /a==='release-party'/.test(handler), '확정/해제 핸들러를 찾지 못함');
  assert(handler.includes('captureCurrentParty'), '확정 핸들러가 완화 모드 캡처를 쓰지 않음');
  assert(handler.includes("this._squadCacheKey=''"), '확정/해제가 파티 캐시를 비우지 않아 화면이 안 바뀐다');
  const logListMatch = APP.match(/const RUN_LOG_ACTIONS=new Set\(\[([^\]]*)\]\);/);
  assert(logListMatch, 'RUN_LOG_ACTIONS 정의를 찾지 못함');
  for (const action of ['confirm-party', 'release-party', 'confirm-second-upper', 'release-second-upper']) {
    assert(logListMatch[1].includes(`'${action}'`), `${action}가 감사 로그 목록에 없음`);
  }
});

test('5번 패널이 확정 상태 배지와 버튼을 그린다', () => {
  const panel = slice(APP, 'renderV153UpperParty(state,plan){', '\n  renderCoach(');
  assert(panel.includes('v153-party-lock'), '파티 확정 상태 줄이 없음');
  assert(panel.includes("data-act=\"confirm-party\"") && panel.includes("data-act=\"release-party\""), '확정/해제 버튼 마크업이 없음');
  assert(/kept:'그대로 유지'.*adapted:'일부만 가변 교체'.*invalid:'유지 불가/.test(panel), '확정 상태 세 가지(kept/adapted/invalid) 라벨이 없음');
});

test('v151ComputeParty가 확정된 청사진을 실제로 넘긴다(버그 수정)', () => {
  // 이전 버그: upperBlueprint:null, preferredLineupIds:[] 을 항상 넘겨서
  // 자동 확정(confirm-upper)도 수동 확정(파티 확정 버튼)도 상태에만
  // 저장되고 실제 파티 계산에는 반영되지 않았다.  같은 상위를 미리보는
  // 중일 때만 반영하고, 다른 상위를 미리볼 때는 섞이지 않아야 한다.
  const fn = slice(APP, 'v151ComputeParty(state,plan,upperId){', '\n  v151ProtectRareDecision(');
  assert(!/upperBlueprint:null/.test(fn), '여전히 upperBlueprint를 null로 고정 — 확정이 다시 무효화된 회귀');
  assert(!/preferredLineupIds:\[\]/.test(fn), '여전히 preferredLineupIds를 빈 배열로 고정');
  assert(/canonicalUpperId\(confirmed\.upperId\)===C\.canonicalUpperId\(upperId\)/.test(fn),
    '미리보는 상위와 확정된 상위가 같은지 검사하지 않음 — 다른 상위 미리보기에 남의 청사진이 섞인다');
  assert(fn.includes('upperBlueprint:blueprintForPreview'), '계산된 청사진을 플래너에 실제로 넘기지 않음');
});

// ── ② 클릭 없이 명령어 노출 ──────────────────────────────────────────────
test('1번 패널이 상세 모달 없이 명령어 줄을 보여준다', () => {
  const panel = slice(APP, 'renderV151NextAction(state,plan,health){', '\n  renderV151Recovery(');
  assert(panel.includes('this.renderCommandLine(unit)'), '지금 할 일 카드가 명령어를 렌더하지 않음 — 여전히 클릭해야 보인다');
  assert(/unit&&this\.commandInfo\(unit\)\.hasVerified\?this\.renderCommandLine\(unit\)/.test(panel),
    '검증된 명령어가 있을 때만 보이도록 가드하지 않음 — 없는데 빈 카드가 뜬다');
});

// ── ③ 이름 가리는 CSS 결함 ───────────────────────────────────────────────
test('재료 그리드 카드가 이름을 옆 카드로 흘리지 않는다', () => {
  for (const rule of [
    /\.direct-grid>div\{[^}]*min-width:0[^}]*\}/,
    /\.lowest-grid>div\{[^}]*grid-template-columns:9px minmax\(0,1fr\) auto[^}]*min-width:0[^}]*\}/,
    /\.raw-ability-grid>div\{[^}]*min-width:0[^}]*\}/
  ]) {
    assert(rule.test(APP_CSS), `이름 넘침 방지 규칙을 찾지 못함: ${rule}`);
  }
  assert(/\.direct-grid>div>span\{min-width:0/.test(APP_CSS), 'direct-grid 이름 span에 min-width:0이 없음');
  assert(/\.lowest-grid>div>span\{min-width:0/.test(APP_CSS), 'lowest-grid 이름 span에 min-width:0이 없음');
});

test('파티 확정 CSS가 6패널 화면 계약을 위해 압축 규칙도 갖는다', () => {
  assert(/\.v153-party-lock\{/.test(CSS), '파티 확정 줄 스타일이 없음');
  const tight = slice(CSS, '@media (max-height:1000px) and (min-width:1240px){', '\n}');
  assert(tight.includes('.v153-party-lock'), '낮은 높이에서 파티 확정 줄을 압축하지 않음 — 6패널 한 화면 계약을 깰 수 있다');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n  ${error && error.message}`); }
}
console.log(`V19_1_PARTY_CONFIRM_COMMAND ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
