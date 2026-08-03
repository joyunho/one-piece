(function () {
  'use strict';

  // v19.9.9 live cockpit bridge; connector protocol stays v13.
  // v19.4(사용자 요청): 도우미 번호 무관 — 숫자 id 전부 후보. 여러 탭이면
  // 주 도우미(32172) 우선.
  const PATTERNS = [
    'https://tmo.gg/*/build-helper/*',
    'https://www.tmo.gg/*/build-helper/*',
    'https://tmo.gg/build-helper/*',
    'https://www.tmo.gg/build-helper/*'
  ];
  const PARSER = 'ord-tmo-parser-v13-adapter';
  const PRIMARY_HELPER_ID = '32172';
  const SOURCE_KEY = 'ordPinnedTmoTabId';
  const EPOCH_KEY = 'ordPinnedSourceEpoch';
  let monitorId = 0;
  let renderTimer = 0;
  let pinnedTabId = 0;
  let pinnedEpoch = 0;
  let checking = false;

  function get(keys) {
    return new Promise(resolve => {
      try { chrome.storage.local.get(keys, value => resolve(value || {})); }
      catch (_) { resolve({}); }
    });
  }
  function runtime(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          void chrome.runtime.lastError;
          resolve(response || {});
        });
      } catch (_) { resolve({}); }
    });
  }
  function tabs(query) {
    return new Promise(resolve => {
      try { chrome.tabs.query(query, result => resolve(result || [])); }
      catch (_) { resolve([]); }
    });
  }
  function tabById(tabId) {
    return new Promise(resolve => {
      try {
        if (!chrome.tabs.get) {
          tabs({}).then(all => resolve(all.find(tab => tab.id === tabId) || null));
          return;
        }
        chrome.tabs.get(tabId, tab => {
          const error = chrome.runtime.lastError;
          resolve(error ? null : tab || null);
        });
      } catch (_) { resolve(null); }
    });
  }
  function send(tabId, message) {
    return new Promise(resolve => {
      try {
        chrome.tabs.sendMessage(tabId, message, response => {
          const error = chrome.runtime.lastError;
          resolve(error ? {
            ok: false,
            error: error.message,
            noReceiver: /Receiving end|Could not establish/i.test(error.message || '')
          } : response || {ok: true});
        });
      } catch (error) { resolve({ok: false, error: String(error)}); }
    });
  }
  function inject(tabId) {
    return new Promise(resolve => {
      try {
        chrome.scripting.executeScript({target: {tabId}, files: ['content-tmo.js']}, () => {
          const error = chrome.runtime.lastError;
          resolve(error ? {ok: false, error: error.message} : {ok: true});
        });
      } catch (error) { resolve({ok: false, error: String(error)}); }
    });
  }
  function helperId(url) {
    const match = String(url || '').match(/\/build-helper\/(\d+)/);
    return match ? match[1] : '';
  }
  function supported(id) { return /^\d{1,8}$/.test(String(id || '')); }
  function validSnapshot(snapshot) {
    const id = String(snapshot && snapshot.helperId || '');
    const collection = snapshot && snapshot.collection || {};
    const counts = snapshot && snapshot.countDiscovery || {};
    const unitCount = Number(snapshot && snapshot.unitCount) || 0;
    return !!(snapshot && supported(id) && helperId(snapshot.url) === id && snapshot.parser === PARSER &&
      snapshot.sessionId && Number(snapshot.seq) > 0 && snapshot.dataHash && collection.found === true &&
      // v17.13: background/popup/content 어댑터와 같은 300~380으로 정합 —
      // background가 저장 게이트라 380 초과는 어차피 도달하지 않지만, 카탈로그
      // 확장 시 4파일이 함께 움직이도록 상한을 한 곳과 다르게 두지 않는다.
      Number(collection.confidence) >= 0.72 && counts.found === true && unitCount >= 300 && unitCount <= 380 &&
      Number(counts.parsed) === unitCount && Number(counts.missing || 0) === 0 && Number(counts.ambiguous || 0) === 0 &&
      snapshot.wispCountFound === true);
  }
  function sourceMatches(snapshot) {
    return pinnedTabId > 0 && pinnedEpoch > 0 && validSnapshot(snapshot) &&
      Number(snapshot.sourceEpoch) === pinnedEpoch && Number(snapshot.sourceTabId) === pinnedTabId;
  }
  function matchingHeartbeat(snapshot, heartbeat) {
    return !!(snapshot && heartbeat && heartbeat.dataHash === snapshot.dataHash &&
      heartbeat.sessionId === snapshot.sessionId && Number(heartbeat.seq) === Number(snapshot.seq) &&
      Number(heartbeat.sourceEpoch) === Number(snapshot.sourceEpoch) &&
      Number(heartbeat.sourceTabId) === Number(snapshot.sourceTabId));
  }
  function withHeartbeat(snapshot, heartbeat) {
    if (!matchingHeartbeat(snapshot, heartbeat)) return snapshot;
    return Object.assign({}, snapshot, {
      bridgeAt: Number(heartbeat.bridgeAt) || Number(snapshot.bridgeAt) || 0,
      scanAt: Number(heartbeat.scanAt) || Number(snapshot.scanAt) || Number(snapshot.at) || 0
    });
  }
  function touchHeartbeat(app, heartbeat) {
    const current = app && app.state && app.state.snapshot;
    if (!current || !matchingHeartbeat(current, heartbeat)) return false;
    current.bridgeAt = Number(heartbeat.bridgeAt) || current.bridgeAt || 0;
    current.scanAt = Number(heartbeat.scanAt) || current.scanAt || current.at || 0;
    app.state.liveAt = current.bridgeAt;
    // A heartbeat carries no new hand data. Replacing the whole root here
    // used to close an open native select/details every ~3.5 seconds.
    // The app's one-second clock owns any eventual health-state transition.
    app.updateLiveStatusOnly();
    return true;
  }
  function freshHeartbeat(snapshot, heartbeat, maxAge) {
    return matchingHeartbeat(snapshot, heartbeat) &&
      Date.now() - Number(heartbeat.bridgeAt || heartbeat.scanAt || 0) <= maxAge;
  }

  async function selectTab() {
    const [all, source, stored] = await Promise.all([
      tabs({url: PATTERNS}),
      runtime({type: 'ORD_GET_SOURCE'}),
      get(['ordLastTmoUrl'])
    ]);
    const list = all.filter(tab => supported(helperId(tab.url)));
    if (!list.length) return null;
    let selected = list.find(tab => tab.id === Number(source.tabId));
    // v19.7(호환 ①): 예전에는 비활성 32172 탭이 활성인 다른 번호 탭을 항상
    // 이겼다 — 사용자가 지금 보고 있는 도우미가 최우선이다.  URL 비교도
    // 완전 일치 대신 번호 비교(쿼리·해시 차이로 불발되던 것).
    if (!selected) selected = list.find(tab => tab.active);
    if (!selected && supported(helperId(stored.ordLastTmoUrl))) selected = list.find(tab => helperId(tab.url) === helperId(stored.ordLastTmoUrl));
    if (!selected) selected = list.find(tab => helperId(tab.url) === PRIMARY_HELPER_ID);
    return selected || list[0];
  }
  async function pin(tab) {
    if (!tab || !supported(helperId(tab.url))) return false;
    const result = await runtime({type: 'ORD_PIN_SOURCE', tabId: tab.id, helperId: helperId(tab.url), url: tab.url});
    if (!result.ok) return false;
    pinnedTabId = Number(result.tabId) || tab.id;
    pinnedEpoch = Number(result.sourceEpoch) || pinnedEpoch;
    return true;
  }
  async function unpin() {
    const result = await runtime({type: 'ORD_PIN_SOURCE', tabId: 0, helperId: '', url: ''});
    pinnedTabId = 0;
    pinnedEpoch = Number(result.sourceEpoch) || pinnedEpoch;
    return result;
  }
  async function ensureContent(tab) {
    if (!tab) return {ok: false, error: 'TMO 탭 없음'};
    let result = await send(tab.id, {type: 'ORD_PING'});
    if (!result.noReceiver) return result;
    const injected = await inject(tab.id);
    if (!injected.ok) return injected;
    await new Promise(resolve => setTimeout(resolve, 260));
    return send(tab.id, {type: 'ORD_PING'});
  }
  async function collect(tab) {
    if (!tab) return {ok: false, error: 'TMO 탭 없음'};
    let result = await send(tab.id, {type: 'ORD_COLLECT_NOW'});
    if (result.noReceiver) {
      const injected = await inject(tab.id);
      if (!injected.ok) return injected;
      await new Promise(resolve => setTimeout(resolve, 260));
      result = await send(tab.id, {type: 'ORD_COLLECT_NOW'});
    }
    return result;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const root = document.getElementById('ord-root');
    let app;
    try { app = window.ORDApp.create(root, window.ORD_TMO_UNITS || [], {source: 'extension', directionWorkerUrl: chrome.runtime.getURL('ord_direction_worker.js')}); }
    catch (error) {
      // v17.7: 오류 문자열이 HTML로 해석되지 않도록 textContent로 넣는다.
      const errorPanel = document.createElement('pre');
      errorPanel.style.cssText = 'padding:24px;color:#fff;background:#080d18;white-space:pre-wrap';
      errorPanel.textContent = String(error && (error.stack || error.message) || error);
      root.replaceChildren(errorPanel);
      return;
    }
    window.ORD_APP = app;

    // ===== v19.9.6(A안): 로컬 직결 수집기 =====
    // TMO 데스크톱의 Horse 서버(/datas)를 배경 경유로 직접 읽어 DOM 호환
    // 스냅샷을 합성한다.  성공 수신이 신선한 동안(8초)은 로컬이 수량의
    // 유일한 원본이고, TMO 탭 DOM 패는 완성도%·현재 능력치 보강용으로만
    // 쌓인다 — 두 소스를 번갈아 적용하면 시차 수량이 오르내려 감지(리롤
    // 해제·수동 제작 경고·상위 관측)가 흔들리기 때문이다.
    const LM = window.ORD_LOCAL_MAP || null;
    const localCatalogIds = new Set((window.ORD_TMO_UNITS || []).map(unit => String(unit.id)));
    // v19.9.9(외부 점검 P0-1): 카탈로그 unit.codes 역색인 — 합성 id
    // (세라핌·왜곡·초월 등) 60종의 로우코드를 카탈로그가 이미 알고 있다.
    // 폼 변형 충돌은 캐노니컬 동일성으로 첫 형태에 귀속시킨다.
    const localCodeIndex = LM && window.ORDCore ? LM.buildCodeIndex(window.ORD_TMO_UNITS || [], window.ORDCore.canonicalUpperId) : null;
    const local = {
      sessionId: 'local-' + Date.now().toString(36),
      seq: 0,
      lastHash: '',
      dataChangedAt: 0,
      auto: null,
      autoLoaded: false,
      lastGoodAt: 0,
      lastTriedAt: 0,
      domStash: null,
      busy: false,
      timer: 0
    };
    const localFresh = () => !!LM && Date.now() - local.lastGoodAt <= 8000;
    async function localAutoState() {
      if (local.autoLoaded) return local.auto;
      const stored = await get(['ordLocalAutoRound']);
      // 자동 라운드 세대는 storage 에 남긴다 — 판 중간에 대시보드를 새로
      // 고쳐도 세대가 이어져 라운드가 1로 되돌아가지 않는다.
      local.auto = stored.ordLocalAutoRound && typeof stored.ordLocalAutoRound === 'object' ? stored.ordLocalAutoRound : null;
      local.autoLoaded = true;
      return local.auto;
    }
    function persistLocalAuto() {
      try { chrome.storage.local.set({ordLocalAutoRound: local.auto}); } catch (_) {}
    }
    function handleLocalUnits(units) {
      if (!LM) return false;
      const now = Date.now();
      const translated = LM.translate(units || null, localCatalogIds, localCodeIndex);
      if (!translated.matched) {
        // 아는 코드가 하나도 없으면(게임 꺼짐·메뉴) 판이 없는 것이다.
        // 마지막 보드는 얼려 두고(결과 입력용) 자동 라운드만 비활성 전이.
        if (local.auto && local.auto.active) {
          local.auto = LM.nextLocalAutoRound(local.auto, 0, 0, now);
          persistLocalAuto();
        }
        return false;
      }
      const hash = LM.countsHash(translated);
      if (hash !== local.lastHash) {
        local.lastHash = hash;
        local.seq += 1;
        local.dataChangedAt = now;
      }
      if (!local.dataChangedAt) local.dataChangedAt = now;
      const auto = LM.nextLocalAutoRound(local.auto, translated.playableUnitCount, local.dataChangedAt, now);
      const autoChanged = !local.auto || auto.generation !== Number(local.auto.generation) || auto.active !== (local.auto.active === true);
      local.auto = auto;
      if (autoChanged) persistLocalAuto();
      const snapshot = LM.buildLocalSnapshot({
        translated,
        catalog: window.ORD_TMO_UNITS || [],
        domStash: local.domStash,
        sessionId: local.sessionId,
        seq: Math.max(1, local.seq),
        dataChangedAt: local.dataChangedAt,
        autoRound: auto,
        now
      });
      local.lastGoodAt = now;
      try { app.updateSnapshot(snapshot); }
      catch (error) { console.error(error); }
      return true;
    }
    async function localPoll() {
      if (!LM || local.busy) return;
      local.busy = true;
      try {
        await localAutoState();
        local.lastTriedAt = Date.now();
        // 127.0.0.1 fetch 는 background 한 곳에만 있다(주소 허용목록 유지).
        const result = await runtime({type: 'ORD_LOCAL_PROBE', url: LM.LOCAL_DATAS_URL});
        if (!result || result.ok !== true) return;
        let payload = null;
        try { payload = JSON.parse(String(result.text || '')); } catch (_) { return; }
        handleLocalUnits(payload && typeof payload.units === 'object' ? payload.units : null);
      } finally { local.busy = false; }
    }

    const clearSource = () => {
      if (!app.state.snapshot) return;
      // 로컬 직결 스냅샷은 TMO 탭 소속이 아니다 — 탭 재고정으로 지우지 않는다.
      if (app.state.snapshot.source === 'local-direct') return;
      app.state.snapshot = null;
      app.state.liveAt = 0;
      app.setMessage('TMO 원본 탭이 바뀌어 현재 패를 다시 확인합니다.');
      app.render();
    };
    const apply = snapshot => {
      if (!sourceMatches(snapshot)) return;
      // v19.9.6(A안): DOM 패는 항상 보강 저장고에 쌓고, 로컬 직결이
      // 신선하면 수량 적용은 건너뛴다(로컬이 원본).
      local.domStash = snapshot;
      if (localFresh()) return;
      try { app.updateSnapshot(snapshot); }
      catch (error) {
        console.error(error);
        app.toast('스냅샷 적용 오류: ' + error.message);
      }
    };
    const scheduleRender = () => {
      if (renderTimer) return;
      renderTimer = setTimeout(() => {
        renderTimer = 0;
        try { app.render(); } catch (error) { console.error(error); }
      }, 120);
    };
    const touch = heartbeat => { touchHeartbeat(app, heartbeat); };

    // v19.5(점검 결함): 리스너 등록이 초기 읽기(await 2회) 뒤에 있어, 그
    // 사이 도착한 스냅샷 변경이 이벤트에도 초기 읽기에도 안 잡혔다 —
    // 다음 변경까지 낡은 패가 보였다.  리스너를 먼저 걸고 읽는다.  같은
    // 스냅샷이 이벤트+초기 읽기로 두 번 적용될 수 있으나 updateSnapshot
    // 이 지문으로 걸러낸다.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const nextTabId = changes[SOURCE_KEY] ? Number(changes[SOURCE_KEY].newValue) || 0 : pinnedTabId;
      const nextEpoch = changes[EPOCH_KEY] ? Number(changes[EPOCH_KEY].newValue) || 0 : pinnedEpoch;
      const changedSource = nextTabId !== pinnedTabId || nextEpoch !== pinnedEpoch;
      pinnedTabId = nextTabId;
      pinnedEpoch = nextEpoch;
      if (changedSource) clearSource();
      const nextSnapshot = changes.ordLatestSnapshot && changes.ordLatestSnapshot.newValue;
      const nextHeartbeat = changes.ordLatestHeartbeat && changes.ordLatestHeartbeat.newValue;
      if (changes.ordLatestDiagnostic) {
        app.state.connectionDiagnostic = changes.ordLatestDiagnostic.newValue || null;
        if (app.state.tab === 'data') scheduleRender();
      }
      // v19.9.6(A안): 숨김 대시보드 보험 — 페이지 타이머가 분당 1회로
      // 조여져도 storage 이벤트는 즉시 온다.  background 15초 알람이 저장한
      // /datas 원본으로 합성한다(보일 때는 2.5초 자체 폴링이 더 빠르다).
      if (changes.ordLocalDirectFeed && LM) {
        const feed = changes.ordLocalDirectFeed.newValue;
        if (feed && feed.ok === true && (document.hidden || Date.now() - local.lastTriedAt > 5000)) {
          localAutoState().then(() => {
            try { handleLocalUnits(feed.units && typeof feed.units === 'object' ? feed.units : null); }
            catch (error) { console.error(error); }
          });
        }
      }
      if (nextSnapshot) apply(withHeartbeat(nextSnapshot, nextHeartbeat));
      else if (nextHeartbeat) touch(nextHeartbeat);
    });

    const source = await runtime({type: 'ORD_GET_SOURCE'});
    pinnedTabId = Number(source.tabId) || 0;
    pinnedEpoch = Number(source.sourceEpoch) || 0;
    const stored = await get(['ordLatestSnapshot', 'ordLatestHeartbeat', 'ordLatestDiagnostic']);
    app.state.connectionDiagnostic = stored.ordLatestDiagnostic || null;
    apply(withHeartbeat(stored.ordLatestSnapshot, stored.ordLatestHeartbeat));
    if (!stored.ordLatestSnapshot && stored.ordLatestDiagnostic && app.state.tab === 'data') scheduleRender();


    app.onConnectionTest = async () => {
      const tab = await selectTab();
      if (!tab) {
        app.toast('열려 있는 TMO 조합도우미 탭이 없습니다.');
        return;
      }
      const beforeTab = pinnedTabId;
      const beforeEpoch = pinnedEpoch;
      if (!await pin(tab)) {
        app.toast('TMO 원본 탭을 고정하지 못했습니다.');
        return;
      }
      if (beforeTab !== pinnedTabId || beforeEpoch !== pinnedEpoch) clearSource();
      const result = await collect(tab);
      if (result && result.ok) {
        const latest = await get(['ordLatestSnapshot', 'ordLatestHeartbeat']);
        apply(withHeartbeat(latest.ordLatestSnapshot, latest.ordLatestHeartbeat));
        const snapshot = result.snapshot || {};
        const counts = snapshot.countDiscovery || {};
        app.toast(`TMO 수신 성공 · ${helperId(tab.url)} · 수량 ${counts.parsed || 0}/${snapshot.unitCount || 0} · 신뢰 ${(Number(snapshot.collection && snapshot.collection.confidence || 0) * 100).toFixed(0)}%`);
      } else {
        app.toast('TMO 수신 거부: ' + ((result && result.error) || '수량 탐색이 불완전합니다. TMO 페이지를 새로고침하세요.'));
      }
    };
    app.onOpenTmo = async () => {
      const storedUrl = await get(['ordLastTmoUrl']);
      const url = supported(helperId(storedUrl.ordLastTmoUrl))
        ? storedUrl.ordLastTmoUrl
        : `https://tmo.gg/ko/build-helper/${PRIMARY_HELPER_ID}`;
      chrome.tabs.create({url});
    };

    const initial = await selectTab();
    if (initial) {
      const beforeTab = pinnedTabId;
      const beforeEpoch = pinnedEpoch;
      if (await pin(initial)) {
        if (beforeTab !== pinnedTabId || beforeEpoch !== pinnedEpoch) clearSource();
        const latest = await get(['ordLatestSnapshot', 'ordLatestHeartbeat']);
        if (sourceMatches(latest.ordLatestSnapshot) && freshHeartbeat(latest.ordLatestSnapshot, latest.ordLatestHeartbeat, 10000)) {
          apply(withHeartbeat(latest.ordLatestSnapshot, latest.ordLatestHeartbeat));
        } else {
          await collect(initial);
        }
      }
    } else {
      // v19.9.6(A안): 로컬 직결이 살아 있으면 TMO 탭 안내는 필요 없다 —
      // 첫 로컬 폴링이 끝날 시간을 준 뒤에만 띄운다.
      setTimeout(() => {
        if (!localFresh()) app.toast('tmo.gg 도우미 탭을 열거나 TMO.GG 데스크톱 앱을 실행해 주세요. 게임 중에는 로컬 직결(/datas)로 탭 없이도 수집됩니다.');
      }, 1500);
    }

    if (LM) {
      local.timer = setInterval(() => { if (!document.hidden) localPoll(); }, 2500);
      localPoll();
    }

    monitorId = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        let tab = null;
        if (pinnedTabId) {
          tab = await tabById(pinnedTabId);
          if (tab && !supported(helperId(tab.url))) tab = null;
          if (!tab) {
            await unpin();
            clearSource();
          }
        }
        if (!tab) {
          tab = await selectTab();
          if (tab) {
            const beforeEpoch = pinnedEpoch;
            if (await pin(tab) && beforeEpoch !== pinnedEpoch) clearSource();
          }
        }
        if (tab) {
          const latest = await get(['ordLatestSnapshot', 'ordLatestHeartbeat']);
          if (!sourceMatches(latest.ordLatestSnapshot) || !freshHeartbeat(latest.ordLatestSnapshot, latest.ordLatestHeartbeat, 12000)) {
            await ensureContent(tab);
          }
        }
      } finally { checking = false; }
    }, 8000);

    addEventListener('beforeunload', () => {
      clearInterval(monitorId);
      clearInterval(local.timer);
      clearTimeout(renderTimer);
    }, {once: true});
  });
})();
