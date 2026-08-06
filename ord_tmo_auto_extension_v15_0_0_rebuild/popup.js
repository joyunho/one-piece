'use strict';

// v20.2.0 compact popup; parser protocol remains v13-compatible.
const state = document.getElementById('state');
const detail = document.getElementById('detail');
const testButton = document.getElementById('test');
const PARSER = 'ord-tmo-parser-v13-adapter';
// v19.4(사용자 요청): 도우미 번호 무관 — 숫자 id 는 전부 후보로 본다.
// 여러 탭이 열려 있으면 주 도우미(32172) → 활성 탭 순으로 고른다.
const PRIMARY_HELPER_ID = '32172';
const PATTERNS = [
  'https://tmo.gg/*/build-helper/*',
  'https://www.tmo.gg/*/build-helper/*',
  'https://tmo.gg/build-helper/*',
  'https://www.tmo.gg/build-helper/*'
];

function helperId(url) {
  const match = String(url || '').match(/\/build-helper\/(\d+)/);
  return match ? match[1] : '';
}
function supported(id) { return /^\d{1,8}$/.test(String(id || '')); }
function runtime(message) {
  return new Promise(resolve => chrome.runtime.sendMessage(message, response => {
    const error = chrome.runtime.lastError;
    resolve(error ? {ok: false, error: error.message} : response || {});
  }));
}
function queryTabs(query) {
  return new Promise(resolve => chrome.tabs.query(query, tabs => resolve(tabs || [])));
}
function send(tabId, message) {
  return new Promise(resolve => chrome.tabs.sendMessage(tabId, message, response => {
    const error = chrome.runtime.lastError;
    resolve(error ? {
      ok: false,
      error: error.message,
      noReceiver: /Receiving end|Could not establish/i.test(error.message || '')
    } : response || {});
  }));
}
function inject(tabId) {
  return new Promise(resolve => chrome.scripting.executeScript({target: {tabId}, files: ['content-tmo.js']}, () => {
    const error = chrome.runtime.lastError;
    resolve(error ? {ok: false, error: error.message} : {ok: true});
  }));
}
function selectPreferred(tabs) {
  // v19.7(호환 ①): 사용자가 지금 보고 있는 도우미 탭이 최우선이다 — 예전에는
  // 비활성 32172 탭이 활성인 다른 번호 탭을 이겨 수동 동기화조차 안 됐다.
  const supportedTabs = tabs.filter(tab => supported(helperId(tab.url)));
  return supportedTabs.find(tab => tab.active) ||
    supportedTabs.find(tab => helperId(tab.url) === PRIMARY_HELPER_ID) ||
    supportedTabs[0] || null;
}
function matchingHeartbeat(snapshot, heartbeat, epoch) {
  return !!(snapshot && heartbeat && heartbeat.dataHash === snapshot.dataHash &&
    heartbeat.sessionId === snapshot.sessionId && Number(heartbeat.seq) === Number(snapshot.seq) &&
    Number(heartbeat.sourceEpoch) === epoch && Number(snapshot.sourceEpoch) === epoch);
}
function renderStored(value) {
  const snapshot = value.ordLatestSnapshot;
  const heartbeat = value.ordLatestHeartbeat;
  const diagnostic = value.ordLatestDiagnostic || {};
  const tabId = Number(value.ordPinnedTmoTabId) || 0;
  const epoch = Number(value.ordPinnedSourceEpoch) || 0;
  const collection = snapshot && snapshot.collection || {};
  const counts = snapshot && snapshot.countDiscovery || {};
  const unitCount = Number(snapshot && snapshot.unitCount) || 0;
  const coverage = unitCount ? (Number(counts.parsed) || 0) / unitCount : 0;
  const valid = !!(snapshot && tabId && supported(snapshot.helperId) && snapshot.parser === PARSER &&
    Number(snapshot.sourceTabId) === tabId && Number(snapshot.sourceEpoch) === epoch &&
    collection.found === true && Number(collection.confidence) >= 0.72 && counts.found === true &&
    unitCount >= 300 && unitCount <= 380 && coverage === 1 && Number(counts.missing || 0) === 0 &&
    Number(counts.ambiguous || 0) === 0 && snapshot.wispCountFound === true);
  if (!valid) {
    const confidence = Number(diagnostic.confidence) || 0;
    // v19.7(호환 ①): "왜 안 되는지"를 보인다 — background 가 기록한 마지막
    // 기각 사유가 최신이면 단계·번호까지 그대로 표시한다.
    const reject = value.ordLatestReject || null;
    const rejectFresh = reject && (!snapshot || Number(reject.at) > (Number(snapshot.bridgeAt) || 0));
    if (rejectFresh) {
      const REASONS = {
        'no-pinned-source': '연결 미고정 — 코치 화면을 한 번 열거나 아래 동기화를 누르세요',
        'unselected-tab': '다른 탭이 고정돼 있음 — 지금 탭에서 동기화를 누르세요',
        'unselected-helper': `고정 번호 ${reject.pinnedHelperId || '?'} ≠ 수신 번호 ${reject.incomingHelperId || '?'} — 동기화로 재고정`,
        'unsupported-helper': `도우미 번호를 URL에서 못 읽음 (${reject.incomingHelperId || '없음'})`,
        'invalid-snapshot': `수집 게이트 미달 · 유닛 ${Number(reject.unitCount) || 0}종 · 위습 ${reject.wispCountFound ? '인식' : '미인식'} · 신뢰 ${((Number(reject.confidence) || 0) * 100).toFixed(0)}%`,
        'helper-repinned': `도우미 번호 변경 감지 — ${reject.to || '?'}로 재고정됨, 수신 대기 중`,
        'content-script-revived': '소스 탭 스크립트 끊김 감지 — 자동 재주입 완료, 수신 재개 대기'
      };
      state.textContent = `수신 기각 · ${REASONS[reject.reason] || reject.reason}`;
      detail.textContent = (reject.topErrors || []).slice(0, 3).join(' · ') || (diagnostic.errors || []).slice(0, 3).join(' · ');
      return;
    }
    state.textContent = diagnostic.reason === 'invalid-snapshot'
      ? `수집 불완전 · 신뢰 ${(confidence * 100).toFixed(0)}% · 수량을 0으로 임의 처리하지 않음`
      : '아직 유효한 TMO 조합도우미 수신 데이터가 없습니다.';
    detail.textContent = (diagnostic.errors || []).slice(0, 3).join(' · ');
    return;
  }
  const bridgeAt = matchingHeartbeat(snapshot, heartbeat, epoch)
    ? Number(heartbeat.bridgeAt) || Number(snapshot.bridgeAt) || 0
    : Number(snapshot.bridgeAt) || 0;
  const scanAt = matchingHeartbeat(snapshot, heartbeat, epoch)
    ? Number(heartbeat.scanAt) || Number(snapshot.scanAt) || 0
    : Number(snapshot.scanAt) || 0;
  const bridgeAge = bridgeAt ? Math.max(0, Math.floor((Date.now() - bridgeAt) / 1000)) : 9999;
  const dataAge = snapshot.dataChangedAt ? Math.max(0, Math.floor((Date.now() - Number(snapshot.dataChangedAt)) / 1000)) : 9999;
  const label = bridgeAge <= 5 ? '실시간' : bridgeAge <= 10 ? '수신 지연' : '오래된 브릿지';
  state.textContent = `${label} · ${bridgeAge}초 전 · ${snapshot.helperId} · 수량 ${counts.parsed || 0}/${snapshot.unitCount || 0} · 신뢰 ${(Number(collection.confidence) * 100).toFixed(0)}%`;
  const warning = (collection.errors || []).slice(0, 2).join(', ');
  detail.textContent = `스캔 ${scanAt ? Math.max(0, Math.floor((Date.now() - scanAt) / 1000)) : '?'}초 전 · 실제 패 변화 ${dataAge < 9999 ? dataAge + '초 전' : '없음'} · 관찰 ${snapshot.sessionId}:${snapshot.seq}${warning ? ' · 경고 ' + warning : ''}`;
}
// v19.9.6(A안): background 15초 알람이 저장한 /datas 원본이 신선하면 TMO
// 탭 없이도 게임 데이터가 흐르고 있다는 뜻이다 — 팝업에서 바로 보여준다.
function localDirectLine(value) {
  const feed = value && value.ordLocalDirectFeed;
  if (!feed || feed.ok !== true || !feed.units) return '';
  const age = Math.max(0, Math.floor((Date.now() - (Number(feed.at) || 0)) / 1000));
  if (age > 35) return '';
  const kinds = Object.keys(feed.units).length;
  return `로컬 직결 ✓ ${kinds}종 · ${age}초 전`;
}
function refreshStatus() {
  chrome.storage.local.get([
    'ordLatestSnapshot',
    'ordLatestHeartbeat',
    'ordLatestDiagnostic',
    'ordLatestReject',
    'ordPinnedTmoTabId',
    'ordPinnedSourceEpoch',
    'ordLocalDirectFeed'
  ], value => {
    renderStored(value);
    const line = localDirectLine(value);
    if (line) detail.textContent = (detail.textContent ? detail.textContent + ' · ' : '') + line;
  });
}

document.getElementById('open').onclick = () => runtime({type: 'ORD_OPEN_DASHBOARD'});
document.getElementById('tmo').onclick = () => {
  // v19.7(호환 ①): 마지막으로 쓰던 도우미 번호를 우선 연다(없으면 주 도우미).
  chrome.storage.local.get(['ordLastTmoUrl'], value => {
    const last = String(value && value.ordLastTmoUrl || '');
    chrome.tabs.create({url: supported(helperId(last)) ? last : `https://tmo.gg/ko/build-helper/${PRIMARY_HELPER_ID}`});
  });
};
// v19.7(⑦ 폴백): TMO 탭을 작은 팝업 창으로 분리 — 게임을 창모드로 두고
// 화면 구석·보조 모니터에 두면 언스로틀러가 무력해진 경우에도(사이트 개편
// 등) 페이지가 계속 보이는 상태로 갱신된다.
document.getElementById('miniwin').onclick = async () => {
  const all = await queryTabs({url: PATTERNS});
  const tab = selectPreferred(all);
  if (!tab) {
    state.textContent = 'TMO 조합도우미 탭이 없습니다. 먼저 열어주세요.';
    return;
  }
  chrome.windows.create({tabId: tab.id, type: 'popup', width: 380, height: 320, left: 12, top: 12, focused: false});
};
testButton.onclick = async () => {
  testButton.disabled = true;
  state.textContent = 'TMO 탭 확인 중...';
  detail.textContent = '';
  try {
    const all = await queryTabs({url: PATTERNS});
    const tab = selectPreferred(all);
    if (!tab) {
      state.textContent = 'TMO 조합도우미 탭이 없습니다. 먼저 열어주세요.';
      return;
    }
    const id = helperId(tab.url);
    const pinned = await runtime({type: 'ORD_PIN_SOURCE', tabId: tab.id, helperId: id, url: tab.url});
    if (!pinned.ok) {
      state.textContent = 'TMO 탭 고정 실패: ' + (pinned.error || '알 수 없음');
      return;
    }
    let result = await send(tab.id, {type: 'ORD_COLLECT_NOW'});
    if (result.noReceiver) {
      const injected = await inject(tab.id);
      if (!injected.ok) {
        state.textContent = 'TMO 주입 실패: ' + injected.error;
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 260));
      result = await send(tab.id, {type: 'ORD_COLLECT_NOW'});
    }
    if (result.ok && result.snapshot) {
      const snapshot = result.snapshot;
      const counts = snapshot.countDiscovery || {};
      state.textContent = `수신 성공 · ${snapshot.helperId} · 수량 ${counts.parsed || 0}/${snapshot.unitCount || 0} · 신뢰 ${(Number(snapshot.collection && snapshot.collection.confidence || 0) * 100).toFixed(0)}%`;
      detail.textContent = `관찰 ${snapshot.sessionId}:${snapshot.seq}:${snapshot.dataHash}`;
    } else {
      state.textContent = '수신 거부 · ' + (result.error || 'TMO 화면을 새로고침하세요.');
      detail.textContent = '수량 탐색 실패를 0개로 간주하지 않습니다.';
    }
  } finally {
    testButton.disabled = false;
    setTimeout(refreshStatus, 350);
  }
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.ordLatestSnapshot || changes.ordLatestHeartbeat || changes.ordLatestDiagnostic || changes.ordLatestReject || changes.ordLocalDirectFeed)) refreshStatus();
});
refreshStatus();
