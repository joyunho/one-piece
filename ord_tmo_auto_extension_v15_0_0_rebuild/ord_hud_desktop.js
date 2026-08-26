(function () {
  'use strict';

  // v26.3.0 — 인게임 HUD 렌더러.  앱을 두 번 돌리지 않는다(엔진·런로그
  // 이중 구동 금지) — 메인 창이 이미 그린 "지금 할 일" 카드와 상단 HUD
  // 조각을 그대로 받아 표시만 한다.
  //
  // v23.9(사용자: "클릭은 되는데 가려서 안 보이니까 클릭이 힘들어"):
  // 창은 평소 클릭 통과(forward 모드 — 마우스 이동은 계속 들어온다).
  // 승인 버튼 위에 커서가 있는 동안만 메인 프로세스에 클릭 활성을 요청
  // 하고, 눌린 버튼은 메인 창의 같은 버튼으로 중계한다 — 게임도 코치도
  // 둘 다 클릭된다.
  var root = document.getElementById('ord-hud-root');
  var bridge = window.ORD_DESKTOP || null;
  if (!root || !bridge || typeof bridge.onHudState !== 'function') return;

  bridge.onHudState(function (payload) {
    try {
      var hud = payload && typeof payload.hudHtml === 'string' ? payload.hudHtml : '';
      var action = payload && typeof payload.actionHtml === 'string' ? payload.actionHtml : '';
      if (!hud && !action) return;
      root.innerHTML = hud + action;
    } catch (_) {}
  });

  var interactive = false;
  function setInteractive(on) {
    on = on === true;
    if (on === interactive) return;
    interactive = on;
    if (typeof bridge.setHudInteractive === 'function') bridge.setHudInteractive(on);
    try { document.body.classList.toggle('hud-hot', on); } catch (_) {}
  }
  document.addEventListener('mousemove', function (event) {
    var el = document.elementFromPoint(event.clientX, event.clientY);
    setInteractive(!!(el && el.closest && el.closest('#ord-hud-root button.primary[data-act]')));
  });
  document.addEventListener('mouseleave', function () { setInteractive(false); });
  document.addEventListener('click', function (event) {
    var btn = event.target && event.target.closest ? event.target.closest('#ord-hud-root button.primary[data-act]') : null;
    if (!btn) return;
    if (typeof bridge.sendHudClick === 'function') {
      bridge.sendHudClick({act: String(btn.dataset.act || ''), id: String(btn.dataset.id || ''), step: String(btn.dataset.step || ''), key: String(btn.dataset.key || '')});
    }
    setInteractive(false);
  });
})();
