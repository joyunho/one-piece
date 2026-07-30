'use strict';

// v17.28.0 local decision runtime. The v13 parser identifier is retained for
// stored-snapshot and connector protocol compatibility.
const PARSER = 'ord-tmo-parser-v13-adapter';
// v19.4(사용자 요청): 도우미 번호는 방/시즌마다 바뀐다 — 숫자 id 전부 허용.
// "이 페이지가 정말 ORD 2.305 도우미인가"는 번호가 아니라 validSnapshot 의
// 내용 게이트(유닛 300~380종 · 수량 전량 파싱 · 신뢰도 0.72+)가 판정한다.
const HELPER_ID_PATTERN = /^\d{1,8}$/;
const SOURCE_KEY = 'ordPinnedTmoTabId';
const HELPER_KEY = 'ordPinnedHelperId';
const EPOCH_KEY = 'ordPinnedSourceEpoch';
const AUTO_ROUND_KEY = 'ordAutoRoundState';
const latestSeq = new Map();
let mutationQueue = Promise.resolve();

function get(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, value => resolve(value || {})));
}

function set(value) {
  return new Promise(resolve => chrome.storage.local.set(value, () => resolve()));
}

function supported(helperId) {
  return HELPER_ID_PATTERN.test(String(helperId || ''));
}

function helperIdFromUrl(url) {
  const match = String(url || '').match(/\/build-helper\/(\d+)/);
  return match ? match[1] : '';
}

function validSnapshot(snapshot) {
  if (!snapshot || snapshot.parser !== PARSER || !supported(snapshot.helperId)) return false;
  if (!snapshot.sessionId || !Number.isFinite(Number(snapshot.seq)) || Number(snapshot.seq) < 1) return false;
  if (!snapshot.dataHash || !Number(snapshot.scanAt || snapshot.at) || !Number(snapshot.dataChangedAt)) return false;
  if (!snapshot.url || helperIdFromUrl(snapshot.url) !== String(snapshot.helperId || '') || !Array.isArray(snapshot.units) || !snapshot.counts) return false;

  const collection = snapshot.collection || {};
  const counts = snapshot.countDiscovery || {};
  const unitCount = Number(snapshot.unitCount) || 0;
  const parsedCount = Number(counts.parsed) || 0;
  const confidence = Number(collection.confidence) || 0;
  const parsedCoverage = unitCount > 0 ? parsedCount / unitCount : 0;
  return collection.found === true && counts.found === true && unitCount >= 300 && unitCount <= 380 &&
    parsedCoverage === 1 && Number(counts.missing || 0) === 0 && Number(counts.ambiguous || 0) === 0 &&
    snapshot.wispCountFound === true && confidence >= 0.72;
}

function nextAutoRound(previous, snapshot, sourceEpoch, scanAt) {
  const prior = previous && typeof previous === 'object' ? previous : {};
  const sameSource = Number(prior.sourceEpoch) === Number(sourceEpoch);
  const hasPlayableUnit = Number(snapshot && (snapshot.playableUnitCount != null ? snapshot.playableUnitCount : snapshot.playableNonzero)) > 0;
  let generation = sameSource ? Math.max(0, Number(prior.generation) || 0) : 0;
  let active = sameSource && prior.active === true;
  let startedAt = sameSource ? Math.max(0, Number(prior.startedAt) || 0) : 0;
  if (!hasPlayableUnit) {
    active = false;
    startedAt = 0;
  } else if (!active) {
    generation += 1;
    active = true;
    startedAt = Math.max(1, Number(snapshot && snapshot.dataChangedAt) || Number(scanAt) || Date.now());
  }
  return {
    sourceEpoch: Number(sourceEpoch) || 0,
    generation,
    active,
    startedAt,
    triggerHash: active ? String(snapshot && snapshot.dataHash || '') : '',
    playableUnitCount: Math.max(0, Number(snapshot && snapshot.playableUnitCount) || 0)
  };
}

async function pinSource(tabId, helperId, url) {
  const id = String(helperId || '');
  if (tabId && !supported(id)) return {ok: false, error: 'unsupported-helper'};
  const current = await get([SOURCE_KEY, HELPER_KEY, EPOCH_KEY]);
  const oldTab = Number(current[SOURCE_KEY]) || 0;
  const oldHelper = String(current[HELPER_KEY] || '');
  const oldEpoch = Number(current[EPOCH_KEY]) || 0;
  const changed = oldEpoch === 0 || oldTab !== tabId || oldHelper !== id;
  const sourceEpoch = changed ? oldEpoch + 1 : oldEpoch;
  const update = {
    [SOURCE_KEY]: tabId,
    [HELPER_KEY]: id,
    [EPOCH_KEY]: sourceEpoch,
    ordLastTmoUrl: url || ''
  };
  if (changed) {
    Object.assign(update, {
      ordLatestSnapshot: null,
      ordLatestHeartbeat: null,
      [AUTO_ROUND_KEY]: {sourceEpoch, generation: 0, active: false, startedAt: 0, triggerHash: '', playableUnitCount: 0},
      ordLatestDiagnostic: {
        bridgeAt: Date.now(),
        helperId: id,
        sourceTabId: tabId,
        sourceEpoch,
        reason: 'source-changed'
      }
    });
    latestSeq.clear();
  }
  await set(update);
  // v19.4(사용자 요청): 최소화된 TMO 탭이 메모리 절약 기능으로 폐기되면
  // 콘텐츠 스크립트가 통째로 죽는다 — 고정된 소스 탭은 자동 폐기를 끈다.
  if (tabId) {
    try { chrome.tabs.update(tabId, {autoDiscardable: false}, () => void chrome.runtime.lastError); } catch (_) {}
  }
  return {ok: true, tabId, helperId: id, sourceEpoch, changed};
}

// v19.4(사용자 요청): "티모지지 사이트를 최소화 해두면 데이터를 안받아오던데".
// 숨김 탭에서는 크롬이 콘텐츠 스크립트의 타이머를 강하게 조인다(5분 뒤
// 분당 1회).  메시지 전달은 조여지지 않으므로, 서비스 워커의 알람(30초)이
// 고정된 소스 탭을 두드려 즉시 스캔·발행을 시킨다.  탭이 보일 때는 기존
// 2초 폴링이 그대로 돌므로 이 알람은 사실상 숨김 탭 전용 보험이다.
const SCAN_ALARM = 'ord-background-scan';
function ensureScanAlarm() {
  try { chrome.alarms.create(SCAN_ALARM, {periodInMinutes: 0.5}); } catch (_) {}
}
ensureScanAlarm();
if (chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener(ensureScanAlarm);
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(ensureScanAlarm);
if (chrome.alarms && chrome.alarms.onAlarm) chrome.alarms.onAlarm.addListener(alarm => {
  if (!alarm || alarm.name !== SCAN_ALARM) return;
  enqueue(async () => {
    const current = await get([SOURCE_KEY]);
    const tabId = Number(current[SOURCE_KEY]) || 0;
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, {type: 'ORD_BACKGROUND_TICK'}, () => void chrome.runtime.lastError);
  }).catch(() => {});
});

function enqueue(work) {
  const task = mutationQueue.then(work);
  mutationQueue = task.catch(() => {});
  return task;
}

function openDashboard(reply) {
  const url = chrome.runtime.getURL('ord_helper.html');
  chrome.tabs.query({}, tabs => {
    void chrome.runtime.lastError;
    const existing = (tabs || []).find(tab => String(tab.url || '').split('#')[0] === url);
    if (existing && existing.id) {
      chrome.tabs.update(existing.id, {active: true}, () => {
        void chrome.runtime.lastError;
        reply({ok: true, reused: true, tabId: existing.id});
      });
      return;
    }
    chrome.tabs.create({url}, tab => {
      void chrome.runtime.lastError;
      reply({ok: true, reused: false, tabId: tab && tab.id || 0});
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message && message.type === 'ORD_OPEN_DASHBOARD') {
    openDashboard(reply);
    return true;
  }

  if (message && message.type === 'ORD_PIN_SOURCE') {
    const tabId = Number(message.tabId) || 0;
    const helperId = String(message.helperId || '');
    enqueue(() => pinSource(tabId, helperId, message.url || ''))
      .then(reply)
      .catch(error => reply({ok: false, error: String(error)}));
    return true;
  }

  if (message && message.type === 'ORD_GET_SOURCE') {
    enqueue(async () => {
      const current = await get([SOURCE_KEY, HELPER_KEY, EPOCH_KEY, 'ordLastTmoUrl']);
      reply({
        ok: true,
        tabId: Number(current[SOURCE_KEY]) || 0,
        helperId: String(current[HELPER_KEY] || ''),
        sourceEpoch: Number(current[EPOCH_KEY]) || 0,
        url: current.ordLastTmoUrl || ''
      });
    }).catch(error => reply({ok: false, error: String(error)}));
    return true;
  }

  if (message && message.type === 'ORD_HEARTBEAT' && message.heartbeat) {
    const incoming = message.heartbeat;
    const tabId = sender.tab && sender.tab.id || 0;
    enqueue(async () => {
      const stored = await get([
        SOURCE_KEY,
        HELPER_KEY,
        EPOCH_KEY,
        'ordLatestSnapshot',
        'ordLatestHeartbeat',
        AUTO_ROUND_KEY
      ]);
      const pinnedTabId = Number(stored[SOURCE_KEY]) || 0;
      const pinnedHelperId = String(stored[HELPER_KEY] || '');
      const sourceEpoch = Number(stored[EPOCH_KEY]) || 0;
      const snapshot = stored.ordLatestSnapshot;
      if (!snapshot || !pinnedTabId || !tabId || tabId !== pinnedTabId) {
        reply({ok: false, ignored: 'unselected-tab-or-no-snapshot'});
        return;
      }
      if (incoming.parser !== PARSER || !supported(incoming.helperId) ||
          pinnedHelperId !== String(incoming.helperId || '') ||
          helperIdFromUrl(incoming.url) !== pinnedHelperId) {
        reply({ok: false, ignored: 'invalid-heartbeat-source'});
        return;
      }
      if (snapshot.sessionId !== String(incoming.sessionId || '') ||
          Number(snapshot.seq) !== Number(incoming.seq) ||
          snapshot.dataHash !== String(incoming.dataHash || '') ||
          Number(snapshot.sourceEpoch) !== sourceEpoch ||
          Number(snapshot.sourceTabId) !== tabId) {
        reply({ok: false, ignored: 'heartbeat-data-mismatch'});
        return;
      }
      const scanAt = Number(incoming.scanAt) || 0;
      const previousScanAt = Number(stored.ordLatestHeartbeat && stored.ordLatestHeartbeat.scanAt) || Number(snapshot.scanAt || snapshot.at) || 0;
      if (!scanAt || (previousScanAt && scanAt < previousScanAt - 1000)) {
        reply({ok: false, ignored: 'older-heartbeat'});
        return;
      }
      const bridgeAt = Date.now();
      const heartbeat = {
        bridgeAt,
        scanAt,
        dataChangedAt: Number(snapshot.dataChangedAt) || scanAt,
        helperId: snapshot.helperId,
        adapterId: snapshot.adapterId,
        parser: snapshot.parser,
        sessionId: snapshot.sessionId,
        seq: Number(snapshot.seq),
        dataHash: snapshot.dataHash,
        sourceTabId: tabId,
        sourceEpoch,
        url: snapshot.url
      };
      // This is intentionally the only storage write for unchanged data; the
      // 300+ row snapshot remains untouched.
      await set({ordLatestHeartbeat: heartbeat});
      reply({ok: true, accepted: true, heartbeat: true, compact: true, sourceEpoch, bridgeAt});
    }).catch(error => reply({ok: false, error: String(error)}));
    return true;
  }

  if (message && message.type === 'ORD_SNAPSHOT' && message.snapshot) {
    const incoming = message.snapshot;
    const tabId = sender.tab && sender.tab.id || 0;
    enqueue(async () => {
      const stored = await get([
        SOURCE_KEY,
        HELPER_KEY,
        EPOCH_KEY,
        'ordLatestSnapshot',
        'ordLatestHeartbeat',
        AUTO_ROUND_KEY
      ]);
      const pinnedTabId = Number(stored[SOURCE_KEY]) || 0;
      const pinnedHelperId = String(stored[HELPER_KEY] || '');
      const sourceEpoch = Number(stored[EPOCH_KEY]) || 0;

      if (!supported(incoming.helperId)) {
        reply({ok: false, ignored: 'unsupported-helper'});
        return;
      }
      if (!pinnedTabId || !tabId || tabId !== pinnedTabId) {
        reply({ok: false, ignored: 'unselected-tab'});
        return;
      }
      if (pinnedHelperId !== String(incoming.helperId || '')) {
        reply({ok: false, ignored: 'unselected-helper'});
        return;
      }

      const old = stored.ordLatestSnapshot;
      const sessionId = String(incoming.sessionId || '');
      const seq = Number(incoming.seq) || 0;
      const seqKey = `${sourceEpoch}:${tabId}:${sessionId}`;
      const storedSeq = old && old.sessionId === sessionId ? Number(old.seq) || 0 : 0;
      const previousSeq = Math.max(latestSeq.get(seqKey) || 0, storedSeq);
      if (old && old.sessionId === sessionId && old.dataHash === incoming.dataHash && seq !== storedSeq) {
        reply({ok: false, ignored: 'sequence-without-data-change'});
        return;
      }
      if (seq < previousSeq || (seq === previousSeq && old && old.sessionId === sessionId && old.dataHash !== incoming.dataHash)) {
        reply({ok: false, ignored: 'old-sequence'});
        return;
      }

      const oldHeartbeat = stored.ordLatestHeartbeat;
      const oldSnapshotScanAt = old && Number(old.sourceEpoch) === sourceEpoch ? Number(old.scanAt || old.at) || 0 : 0;
      const oldHeartbeatScanAt = oldHeartbeat && Number(oldHeartbeat.sourceEpoch) === sourceEpoch ? Number(oldHeartbeat.scanAt) || 0 : 0;
      const oldScanAt = Math.max(oldSnapshotScanAt, oldHeartbeatScanAt);
      const scanAt = Number(incoming.scanAt || incoming.at) || 0;
      if (oldScanAt && scanAt < oldScanAt - 1000) {
        reply({ok: false, ignored: 'older-scan'});
        return;
      }

      if (!validSnapshot(incoming)) {
        const collection = incoming.collection || {};
        const counts = incoming.countDiscovery || {};
        await set({
          ordLatestDiagnostic: {
            bridgeAt: Date.now(),
            scanAt,
            dataChangedAt: Number(incoming.dataChangedAt) || 0,
            helperId: incoming.helperId,
            parser: incoming.parser,
            found: collection.found === true,
            confidence: Number(collection.confidence) || 0,
            errors: [].concat(collection.errors || [], counts.errors || []).slice(0, 30),
            unitCount: Number(incoming.unitCount) || 0,
            countParsed: Number(counts.parsed) || 0,
            sourceTabId: tabId,
            sourceEpoch,
            reason: 'invalid-snapshot'
          }
        });
        reply({ok: false, ignored: 'invalid-snapshot'});
        return;
      }

      latestSeq.set(seqKey, Math.max(previousSeq, seq));
      const bridgeAt = Date.now();
      const autoRound = nextAutoRound(stored[AUTO_ROUND_KEY], incoming, sourceEpoch, scanAt);
      const snapshot = Object.assign({}, incoming, {
        sourceTabId: tabId,
        sourceEpoch,
        bridgeAt,
        autoRound
      });
      const heartbeat = {
        bridgeAt,
        scanAt,
        dataChangedAt: Number(snapshot.dataChangedAt) || scanAt,
        helperId: snapshot.helperId,
        adapterId: snapshot.adapterId,
        parser: snapshot.parser,
        sessionId,
        seq,
        dataHash: snapshot.dataHash,
        sourceTabId: tabId,
        sourceEpoch,
        url: snapshot.url
      };

      const sameData = old && Number(old.sourceEpoch) === sourceEpoch &&
        old.sessionId === sessionId && old.dataHash === snapshot.dataHash;
      if (sameData) {
        await set({ordLatestHeartbeat: heartbeat, [AUTO_ROUND_KEY]: autoRound, ordLastTmoUrl: snapshot.url || ''});
        reply({ok: true, accepted: true, heartbeat: true, sourceEpoch, bridgeAt});
        return;
      }

      await set({
        ordLatestSnapshot: snapshot,
        ordLatestHeartbeat: heartbeat,
        [AUTO_ROUND_KEY]: autoRound,
        ordLastTmoUrl: snapshot.url || '',
        ordLatestDiagnostic: {
          bridgeAt,
          scanAt,
          dataChangedAt: snapshot.dataChangedAt,
          helperId: snapshot.helperId,
          adapterId: snapshot.adapterId,
          parser: snapshot.parser,
          sessionId,
          seq,
          dataHash: snapshot.dataHash,
          found: snapshot.collection.found,
          confidence: snapshot.collection.confidence,
          errors: snapshot.collection.errors || [],
          unitCount: snapshot.unitCount,
          countParsed: snapshot.countDiscovery.parsed,
          sourceTabId: tabId,
          sourceEpoch,
          reason: 'accepted-data-change'
        }
      });
      reply({ok: true, accepted: true, changed: true, sourceEpoch, bridgeAt});
    }).catch(error => reply({ok: false, error: String(error)}));
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  enqueue(async () => {
    const current = await get([SOURCE_KEY]);
    if (Number(current[SOURCE_KEY]) === Number(tabId)) await pinSource(0, '', '');
  }).catch(() => {});
});
