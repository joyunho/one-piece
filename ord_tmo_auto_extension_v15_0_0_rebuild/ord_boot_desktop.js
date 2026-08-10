(function () {
  'use strict';

  // v22.6.0 — 데스크톱 셸 부트.  확장 브리지(ord_boot_extension)의 로컬
  // 직결 합성 경로를 그대로 옮기되 크롬 API 가 전혀 없다:
  //  · /datas 는 Electron 메인 프로세스가 1초마다 밀어준다(ORD_DESKTOP.onDatas).
  //  · 자동 라운드 세대는 localStorage 에 영속(판 중간 새로고침 보호).
  //  · TMO 탭 보강(완성도%·현재 능력치)은 없다 — 건강 판정이 '보강 대기'
  //    partial 로 정직하게 표시한다.
  //  · ordlog 는 60초마다 문서 폴더에 자동 저장된다(수동 내보내기 불필요).
  const AUTO_KEY = 'ordDesktopAutoRound';

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('ord-root');
    let app;
    try { app = window.ORDApp.create(root, window.ORD_TMO_UNITS || [], {source: 'desktop', directionWorkerUrl: 'ord_direction_worker.js'}); }
    catch (error) {
      const panel = document.createElement('pre');
      panel.style.cssText = 'padding:24px;color:#fff;background:#080d18;white-space:pre-wrap';
      panel.textContent = String(error && (error.stack || error.message) || error);
      root.replaceChildren(panel);
      return;
    }
    window.ORD_APP = app;

    const LM = window.ORD_LOCAL_MAP || null;
    const bridge = window.ORD_DESKTOP || null;
    const catalogIds = new Set((window.ORD_TMO_UNITS || []).map(unit => String(unit.id)));
    const codeIndex = LM && window.ORDCore ? LM.buildCodeIndex(window.ORD_TMO_UNITS || [], window.ORDCore.canonicalUpperId) : null;
    const local = {sessionId: 'desktop-' + Date.now().toString(36), seq: 0, lastHash: '', dataChangedAt: 0, auto: null, lastGoodAt: 0};
    try { local.auto = JSON.parse(localStorage.getItem(AUTO_KEY) || 'null'); } catch (_) { local.auto = null; }
    const persistAuto = () => { try { localStorage.setItem(AUTO_KEY, JSON.stringify(local.auto)); } catch (_) {} };

    function handleUnits(units) {
      if (!LM) return false;
      const now = Date.now();
      const translated = LM.translate(units || null, catalogIds, codeIndex);
      if (!translated.matched) {
        // 게임 꺼짐·메뉴 — 마지막 보드는 얼려 두고 자동 라운드만 비활성 전이.
        if (local.auto && local.auto.active) {
          local.auto = LM.nextLocalAutoRound(local.auto, 0, 0, now);
          persistAuto();
        }
        return false;
      }
      // v19.12: 첫 유효 수신에 이미 패가 여러 개 = 게임 시작(0→1)을 못 본
      // 중간 합류 — 라운드가 어긋날 수 있어 앱이 보정 배너를 띄운다.
      if (local.midJoin == null) {
        local.midJoin = !(local.auto && local.auto.active === true) && translated.playableUnitCount >= 6;
      }
      // v19.15.1: 전투 임시 개체의 미해석 요동이 초단위 재판단을 만들지
      // 않게, 연속 3회 같은 수량으로 관측된 미해석만 보드 변화로 인정.
      const stability = LM.nextUnknownStability ? LM.nextUnknownStability(local.unknownStab, translated.unknownCounts, now) : null;
      if (stability) local.unknownStab = stability;
      const stableUnknown = stability ? stability.stable : null;
      const hash = LM.countsHash(translated, stableUnknown);
      if (hash !== local.lastHash) {
        local.lastHash = hash;
        local.seq += 1;
        local.dataChangedAt = now;
      }
      if (!local.dataChangedAt) local.dataChangedAt = now;
      const auto = LM.nextLocalAutoRound(local.auto, translated.playableUnitCount, local.dataChangedAt, now);
      const autoChanged = !local.auto || auto.generation !== Number(local.auto.generation) || auto.active !== (local.auto.active === true);
      local.auto = auto;
      if (autoChanged) persistAuto();
      const snapshot = LM.buildLocalSnapshot({
        translated,
        catalog: window.ORD_TMO_UNITS || [],
        domStash: null,
        sessionId: local.sessionId,
        seq: Math.max(1, local.seq),
        dataChangedAt: local.dataChangedAt,
        autoRound: auto,
        stableUnknown,
        now
      });
      if (local.midJoin === true && snapshot.localDirect) snapshot.localDirect.midJoin = true;
      local.lastGoodAt = now;
      try { app.updateSnapshot(snapshot); }
      catch (error) { console.error(error); }
      return true;
    }
    // 테스트 관측용 — 합성 경로를 headless 로 구동할 수 있게 노출한다.
    window.__ORD_DESKTOP_BRIDGE = {handleUnits, local};

    // v19.14.1: F8 오버레이 = 우상단 미니 패널.  메인 프로세스가 창을
    // 줄이고, 여기서는 컴팩트 표시 클래스만 켠다(지금 할 일·결손 중심).
    if (bridge && typeof bridge.onOverlayMode === 'function') {
      bridge.onOverlayMode(on => {
        try { document.body.classList.toggle('ord-overlay-mode', on === true); } catch (_) {}
      });
    }
    if (bridge && typeof bridge.onDatas === 'function') {
      bridge.onDatas(payload => {
        try { handleUnits(payload && typeof payload.units === 'object' ? payload.units : null); }
        catch (error) { console.error(error); }
      });
    } else {
      setTimeout(() => app.toast('데스크톱 브리지가 없습니다 — preload 로드를 확인하세요.'), 400);
    }

    // v19.15.0: 인게임 HUD 급전 — 메인 창이 그린 상단 HUD 조각과 "지금
    // 할 일" 카드를 1.5초마다 HUD 창으로 보낸다.  앱을 두 번 돌리지
    // 않기 위한 표시 전용 복제(엔진·런로그 이중 구동 금지).
    if (bridge && typeof bridge.sendHudState === 'function') {
      setInterval(() => {
        try {
          const hud = document.querySelector('.v153-hud');
          const action = document.querySelector('[data-region="next-action"] .v151-action');
          bridge.sendHudState({
            at: Date.now(),
            hudHtml: hud ? hud.outerHTML : '',
            actionHtml: action ? action.outerHTML : ''
          });
        } catch (_) {}
      }, 1500);
    }

    // ordlog 자동 저장: 판이 활성인 동안 60초마다 문서 폴더에 덮어쓴다.
    if (bridge && typeof bridge.saveRunLog === 'function') {
      setInterval(() => {
        try {
          if (app._runLogReady && app.runLog && app.runLog.summary && app.runLog.summary().status === 'active') {
            bridge.saveRunLog('ORD_2310_desktop_autosave', app.runLog.exportJson());
          }
        } catch (_) {}
      }, 60000);
    }
  });
})();
