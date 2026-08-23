(function () {
  'use strict';

  // v23.11.0 — 데스크톱 셸 부트.  확장 브리지(ord_boot_extension)의 로컬
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
      // v23.8: 새 패 반영 직후 HUD 즉시 갱신(렌더 완료 뒤).
      if (window.__ORD_HUD_PUSH) setTimeout(window.__ORD_HUD_PUSH, 60);
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

    // v23.2(0816 포렌식): 신세계 한복판에서 /datas 푸시가 죽자(메인 프로세스
    // 폴링은 실패를 렌더러에 통지하지 않는다) 판단 잠금만 남고 회복 경로가
    // 없었다.  ① 45초 무수신이면 렌더러가 preload.probe 로 직접 재프로브
    // 한다(성공 시 즉시 합성 재개).  ② '판단 잠금' 배너의 'TMO 다시 읽기'
    // 버튼도 여태 데스크톱에서 무동작이었다 — onConnectionTest 를 배선한다.
    if (bridge && typeof bridge.probe === 'function') {
      setInterval(async () => {
        if (local.lastGoodAt && Date.now() - local.lastGoodAt < 45000) return;
        try {
          const r = await bridge.probe();
          if (r && r.ok && r.payload && typeof r.payload.units === 'object') handleUnits(r.payload.units);
        } catch (_) {}
      }, 5000);
      app.onConnectionTest = async () => {
        const r = await bridge.probe().catch(() => null);
        if (r && r.ok && r.payload && typeof r.payload.units === 'object') {
          handleUnits(r.payload.units);
          app.toast('로컬 직결 재프로브 성공 — 수신을 재개합니다.');
        } else {
          app.toast('로컬 직결 응답 없음: ' + String((r && r.error) || 'TMO.GG 데스크톱 앱과 게임 실행을 확인하세요.'));
        }
      };
    }

    // v19.15.0: 인게임 HUD 급전 — 메인 창이 그린 상단 HUD 조각과 "지금
    // 할 일" 카드를 HUD 창으로 보낸다.  앱을 두 번 돌리지 않기 위한
    // 표시 전용 복제(엔진·런로그 이중 구동 금지).
    // v23.8(사용자: "우선 너무 느려 갱신이"): 1.5초 고정 주기를 버린다 —
    // ① 스냅샷 반영 직후 즉시 push(렌더 완료 대기 60ms) ② 보조 주기
    // 400ms.  내용이 같으면 전송하지 않아(전문 비교) HUD 쪽 재렌더
    // 깜빡임도 함께 사라진다.
    if (bridge && typeof bridge.sendHudState === 'function') {
      let lastHudSig = '';
      const pushHud = () => {
        try {
          const hud = document.querySelector('.v153-hud');
          const action = document.querySelector('[data-region="next-action"] .v151-action');
          const hudHtml = hud ? hud.outerHTML : '';
          const actionHtml = action ? action.outerHTML : '';
          const sig = hudHtml + '' + actionHtml;
          if (sig === lastHudSig) return;
          lastHudSig = sig;
          bridge.sendHudState({at: Date.now(), hudHtml, actionHtml});
        } catch (_) {}
      };
      window.__ORD_HUD_PUSH = pushHud;
      setInterval(pushHud, 400);
    }

    // v23.9(사용자: "클릭은 되는데 가려서 안 보이니까 클릭이 힘들어"):
    // HUD에서 누른 승인 버튼을 메인 창의 같은 버튼으로 중계한다.  중계
    // 허용 목록 — 제작 확인·리롤 확인·재읽기·패 수용·리롤 대기 해제만.
    if (bridge && typeof bridge.onHudClick === 'function') {
      // v23.10: 2상위 확정 카드(0821 포렌식)가 HUD에도 뜬다 — 확정도
      // 게임 위에서 바로 누를 수 있게 허용(해제 버튼은 본창에만).
      var HUD_CLICK_OK = {'mark-made': 1, 'reroll-confirmed': 1, 'connection': 1, 'accept-snapshot': 1, 'cancel-reroll': 1, 'confirm-second-upper': 1};
      bridge.onHudClick(function (payload) {
        try {
          var act = payload && String(payload.act || '');
          if (!act || !HUD_CLICK_OK[act]) return;
          var sel = '[data-act="' + act + '"]' + (payload.id ? '[data-id="' + CSS.escape(String(payload.id)) + '"]' : '');
          var btn = document.querySelector('[data-region="next-action"] ' + sel) || document.querySelector(sel);
          if (btn) btn.click();
        } catch (_) {}
      });
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
