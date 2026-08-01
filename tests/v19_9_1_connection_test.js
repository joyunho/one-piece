'use strict';
// v19.9.1 계약 — 사용자 보고 3건.
//
// "티모연결이 자꾸 끊긴다 / 티모지지 모니터에 안 띄워놓으면 잘 인식 못한다":
// ① 숨김 탭에서 워커 틱·숨김 전환은 조여지는 타이머(schedule/setTimeout)를
//    거치지 않고 즉시 publish 한다.
// ② 백그라운드 보험 알람이 15초 간격 두 개로 늘고, 받을 콘텐츠 스크립트가
//    없으면(페이지 새로고침·크래시) 자동 재주입 후 즉시 다시 두드린다.
// "조합 지금 할일에도 떴으면 / 이거 짤린다 / 조합에는 능력치 안 써도 됨":
// ③ 지금 할 일 카드에 제작 카드와 같은 "조합" 줄(direct 폴백 재계산 포함),
//    조합식 이름에서 능력치 주석 제거, 제작 카드 조합 줄은 두 줄 랩.
const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const app=read('ord_app.js'),content=read('content-tmo.js'),background=read('background.js'),popup=read('popup.js'),css=read('ord_cockpit_v15.css');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

check('① 숨김 탭 워커 틱·숨김 전환이 타이머 없이 즉시 발행한다',()=>{
  const tick=content.slice(content.indexOf("event.data.__ord !== 'tmo-poll-tick'"));
  assert(tick.includes("publish(false, 'worker-tick')"),'워커 틱이 직접 publish 하지 않음');
  assert(!content.includes("schedule(true, 'worker-tick')"),'워커 틱이 아직 조여지는 schedule 을 탄다');
  assert(content.includes("publish(true, 'tab-hidden')"),'숨김 전환 직발행 없음');
  // 숨김 탭 부하 상한: 2.5초 간격(보이는 탭 2초 폴과 동급).
  assert(tick.includes('2500'),'숨김 스캔 간격 상한 없음');
});

check('② 보험 알람 2개(15초 간격) + 죽은 콘텐츠 스크립트 자동 재주입',()=>{
  assert(background.includes("const SCAN_ALARM_B = 'ord-background-scan-b'"),'두 번째 알람 없음');
  assert(background.includes('when: Date.now() + 15000'),'15초 어긋난 시작 없음');
  assert(background.includes("alarm.name !== SCAN_ALARM && alarm.name !== SCAN_ALARM_B"),'두 번째 알람이 핸들러에 안 물림');
  assert(background.includes("chrome.scripting.executeScript({target: {tabId}, files: ['content-tmo.js']}"),'자동 재주입 없음');
  assert(background.includes("recordReject('content-script-revived'"),'재주입 기록 없음');
  // 재주입 후 즉시 다시 두드린다 — 다음 알람(15초)을 기다리지 않는다.
  const revive=background.slice(background.indexOf("recordReject('content-script-revived'"));
  assert(revive.includes("ORD_BACKGROUND_TICK"),'재주입 후 즉시 틱 없음');
  assert(popup.includes("'content-script-revived'"),'팝업 사유 표기 없음');
  // 재주입은 이중 주입 가드 위에서만 안전하다 — 가드가 사라지면 안 된다.
  assert(content.includes('window.__ORD_TMO_V13_CONNECTOR')&&content.includes('previousAlive'),'콘텐츠 스크립트 이중 주입 가드가 사라짐');
});

check('③ 지금 할 일 조합 줄 + 능력치 주석 제거 + 두 줄 랩',()=>{
  assert(app.includes('v159-action-recipe'),'지금 할 일 조합 줄 없음');
  assert(app.includes('function recipeNameOf'),'능력치 주석 제거 헬퍼 없음');
  // 조합식 이름은 제작 카드·지금 할 일 두 곳 모두 헬퍼를 탄다.
  assert((app.match(/recipeNameOf\(C\.materialName/g)||[]).length>=2,'조합식 이름 정리 적용 지점 부족');
  // direct 가 빈 엔진 견적이어도 조합 줄이 나오도록 폴백 재계산.
  assert(app.includes('fresh.direct'),'direct 폴백 재계산 없음');
  assert(css.includes('-webkit-line-clamp:2'),'제작 카드 조합 줄 두 줄 랩 없음');
  assert(css.includes('v159-action-recipe'),'지금 할 일 조합 줄 스타일 없음');
  // 능력치 주석 제거 규칙: 공백 뒤 괄호만 지운다 — "(D)드래곤"은 보존.
  const strip=name=>String(name||'').replace(/\s+\(.*\)\s*$/,'');
  assert.strictEqual(strip('슈가 (마젠0.6)'),'슈가');
  assert.strictEqual(strip('이완코브 (0.5스턴 깍11 단일공중45)'),'이완코브');
  assert.strictEqual(strip('(D)드래곤'),'(D)드래곤');
  assert(app.includes("replace(/\\s+\\(.*\\)\\s*$/,'')"),'소스의 제거 규칙이 검증된 규칙과 다름');
});

console.log(`\n${checks}/${checks} v19.9.1 connection/recipe checks passed.`);
