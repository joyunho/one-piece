(function () {
  'use strict';

  // v21.5.0 — 인게임 HUD 렌더러.  앱을 두 번 돌리지 않는다(엔진·런로그
  // 이중 구동 금지) — 메인 창이 이미 그린 "지금 할 일" 카드와 상단 HUD
  // 조각을 그대로 받아 표시만 한다.  이 창은 클릭 통과·포커스 불가라
  // 게임 입력을 전혀 뺏지 않는다.
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
})();
