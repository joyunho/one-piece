'use strict';

// v19.4: 사용자 요청 두 건의 배선 고정.
//
//   ② "티모지지 사이트 뒤에 34366 같은거 번호 달라도 인식할 수 있게" —
//      번호 하드코딩 4곳(manifest·background·popup·boot) 해제, content 는
//      임의 숫자 번호용 범용 어댑터.  "정말 ORD 도우미인가"는 번호가 아니라
//      validSnapshot 의 내용 게이트(유닛 300~380종 · 전량 파싱 · 신뢰도)가
//      계속 판정한다.
//   ③ "티모지지 사이트를 최소화 해두면 데이터를 안받아오던데" — 숨김 탭
//      타이머 스로틀 우회 3종: 서비스 워커 알람 틱(30초) → 메시지로 즉시
//      스캔, 숨김 상태 400ms 안정 확인 생략, 소스 탭 자동 폐기 금지.

const assert=require('assert');
const path=require('path');
const fs=require('fs');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const read=name=>fs.readFileSync(path.join(EXT,name),'utf8');
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

const manifest=JSON.parse(read('manifest.json'));
const background=read('background.js');
const content=read('content-tmo.js');
const popup=read('popup.js');
const boot=read('ord_boot_extension.js');

check('도우미 번호 하드코딩이 인식 경로에서 사라졌다',()=>{
  // manifest: 와일드카드 매치(tmo.gg /build-helper/ 밖으로는 안 넓어짐 —
  // 상세 경계는 package_validation 이 잰다).
  assert(manifest.content_scripts[0].matches.every(p=>p.endsWith('/build-helper/*')),'매치가 번호 고정으로 되돌아감');
  // background/popup/boot: 숫자 id 전반 허용.
  for(const [name,src] of [['background',background],['popup',popup],['boot',boot]]){
    assert(/\^\\d\{1,8\}\$/.test(src),`${name} 의 숫자 id 허용이 없음`);
    assert(!src.includes("new Set(['32172'")&&!src.includes("new Set([PRIMARY_HELPER_ID, '34366'])"),`${name} 이 번호 집합을 다시 고정했음`);
  }
  // content: 새 번호는 범용 어댑터로 인식.
  assert(content.includes('tmo-${key}-auto'),'범용 어댑터가 없음 — 새 번호에서 커넥터가 침묵한다');
  // 내용 게이트는 그대로 — 번호 해제가 검증 완화가 되면 안 된다.
  assert(background.includes('unitCount >= 300')&&background.includes('unitCount <= 380'),'스냅샷 내용 게이트가 사라짐');
  assert(background.includes('confidence >= 0.72'),'신뢰도 게이트가 사라짐');
});

check('알람 틱이 고정된 소스 탭을 두드려 숨김 스캔을 시킨다',()=>{
  assert(manifest.permissions.includes('alarms'),'alarms 권한이 없음');
  assert(background.includes("chrome.alarms.create(SCAN_ALARM, {periodInMinutes: 0.5})"),'30초 알람이 없음');
  assert(background.includes("chrome.tabs.sendMessage(tabId, {type: 'ORD_BACKGROUND_TICK'}"),'알람이 소스 탭을 두드리지 않음');
  // 알람 등록은 설치·재시작에도 살아나야 한다(서비스 워커는 수시로 잠든다).
  assert(background.includes('onInstalled.addListener(ensureScanAlarm)'),'onInstalled 재등록 없음');
  assert(background.includes('onStartup.addListener(ensureScanAlarm)'),'onStartup 재등록 없음');
  // content 쪽 수신 핸들러: 즉시 스캔·발행(메시지 실행은 스로틀 안 됨).
  assert(content.includes("message.type === 'ORD_BACKGROUND_TICK'"),'content 틱 핸들러 없음');
  assert(content.includes("publish(true, 'background-tick')"),'틱이 즉시 발행하지 않음');
});

check('숨김 탭 패스트패스 — 안정 확인 생략·표시 전환 재스캔·폐기 금지',()=>{
  assert(content.includes("document.visibilityState === 'hidden'"),'숨김 감지가 없음');
  assert(content.includes('if (changed && !starved && !hiddenTab && pendingHash !== snapshot.dataHash)'),
    '숨김 상태에서 400ms 안정 확인을 여전히 기다림 — 스로틀로 1초~1분이 된다');
  assert(content.includes("document.addEventListener('visibilitychange'"),'표시 전환 재스캔이 없음');
  assert(background.includes('autoDiscardable: false'),'소스 탭 자동 폐기 금지가 없음 — 메모리 절약이 커넥터를 죽인다');
});

console.log(`\n${checks}/${checks} background reach checks passed.`);
