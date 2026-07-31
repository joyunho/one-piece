'use strict';

// v19.7(사용자 요청 ⑦) — "티모지지 사이트 결국에는 화면에 띄어놔야 데이터
// 적용되더라"의 근본 원인 수정.
//
// tmo.gg 도우미 페이지는 window.setInterval(연동 200ms · 미연동 2초)로
// http://127.0.0.1:25625/datas (TMO 데스크톱 프로그램)를 폴링해 화면(DOM)을
// 갱신한다 — 프로덕션 번들에서 실확인.  탭이 숨겨지면 크롬이 페이지 타이머를
// 조이므로(즉시 1초, 5분 뒤 분당 1회) DOM 자체가 동결된다.  코치의 v19.4
// 대책(30초 알람 스캔)은 낡은 DOM 을 더 자주 읽었을 뿐이다.
//
// Web Worker 의 타이머는 이 스로틀을 받지 않는다.  MAIN world(페이지 세계)
// 에서 setInterval 을 워커 구동 스케줄러로 감싸, 숨김 상태에서도 페이지가
// 로컬 프로그램을 계속 읽고 DOM 을 계속 그리게 한다.
//
// 안전 원칙:
//  · 함수 콜백 + 100ms~2.5초 주기만 워커로 보낸다(TMO 폴 200/2000ms 포섭,
//    파급 최소화).  그 외에는 네이티브 그대로.
//  · 워커 생성 실패(사이트가 CSP 를 도입하는 등)면 아무것도 바꾸지 않고
//    조용히 물러난다 — 페이지는 원래대로 동작한다.
//  · 워커 틱마다 postMessage 로 콘텐츠 스크립트에 알린다(이벤트 배달은
//    스로틀 없음) — 숨김 상태에서 갓 갱신된 DOM 을 곧바로 스캔하게.
(() => {
  if (window.__ordUnthrottleInstalled) return;
  window.__ordUnthrottleInstalled = true;
  const nativeSet = window.setInterval.bind(window);
  const nativeClear = window.clearInterval.bind(window);
  let worker = null;
  try {
    const src = 'const t=new Map();onmessage=e=>{const d=e.data;if(d.op==="set")t.set(d.id,setInterval(()=>postMessage(d.id),d.ms));else if(d.op==="clear"){clearInterval(t.get(d.id));t.delete(d.id);}};';
    worker = new Worker(URL.createObjectURL(new Blob([src], {type: 'text/javascript'})));
  } catch (_) { worker = null; }
  if (!worker) return;
  const jobs = new Map();
  const ID_BASE = 1 << 30;
  let nextId = ID_BASE + 1;
  worker.onmessage = event => {
    const job = jobs.get(event.data);
    if (!job) return;
    try { job.fn.apply(window, job.args); } catch (_) { /* 페이지 콜백 오류는 페이지 몫 */ }
    try { window.postMessage({__ord: 'tmo-poll-tick'}, window.location.origin); } catch (_) {}
  };
  window.setInterval = function (fn, delay) {
    const ms = Number(delay) || 0;
    if (typeof fn !== 'function' || ms < 100 || ms > 2500) return nativeSet.apply(window, arguments);
    const id = nextId;
    nextId += 1;
    jobs.set(id, {fn, args: Array.prototype.slice.call(arguments, 2)});
    worker.postMessage({op: 'set', id, ms});
    return id;
  };
  window.clearInterval = function (id) {
    if (typeof id === 'number' && id > ID_BASE && jobs.has(id)) {
      jobs.delete(id);
      worker.postMessage({op: 'clear', id});
      return;
    }
    return nativeClear(id);
  };
})();
