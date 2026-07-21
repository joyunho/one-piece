'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const extension = path.resolve(process.argv[2] || path.join(root, 'ord_tmo_auto_extension_v15_0_0_rebuild'));
const read = name => fs.readFileSync(path.join(extension, name), 'utf8');
let passed = 0;
function pass(message) { passed += 1; console.log(`PASS  ${message}`); }

function backgroundHarness() {
  const storage = {};
  const writes = [];
  let listener = null;
  const chrome = {
    runtime: {
      lastError: null,
      getURL: name => `chrome-extension://ord/${name}`,
      onMessage: {addListener(value) { listener = value; }}
    },
    storage: {local: {
      get(keys, callback) {
        const result = {};
        for (const key of keys) result[key] = storage[key];
        callback(result);
      },
      set(update, callback) {
        writes.push({keys: Object.keys(update).sort(), bytes: JSON.stringify(update).length});
        Object.assign(storage, update);
        if (callback) callback();
      }
    }},
    tabs: {
      query(_query, callback) { callback([]); },
      create(options, callback) { if (callback) callback({id: 99, url: options.url}); },
      update(id, _options, callback) { if (callback) callback({id}); },
      onRemoved: {addListener() {}}
    }
  };
  vm.runInNewContext(read('background.js'), {chrome, console, Map, Set, Promise, Date, Math, Number, String, Object, Array, JSON, Error});
  assert(listener, 'background listener missing');
  function dispatch(message, tabId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`timeout: ${message.type}`)), 1000);
      listener(message, tabId ? {tab: {id: tabId}} : {}, response => {
        clearTimeout(timeout);
        resolve(response);
      });
    });
  }
  return {storage, writes, dispatch};
}

function fullSnapshot(now = Date.now()) {
  const units = Array.from({length: 307}, (_, index) => ({
    id: `u${index}`, name: `unit-${index}`, count: index === 0 ? 1 : 0,
    countFound: true, tmoPercent: index % 101, abilities: {}
  }));
  return {
    source: 'tmo', parser: 'ord-tmo-parser-v13-adapter', adapterId: 'tmo-32172-main', helperId: '32172',
    sessionId: 'performance-session', seq: 1, dataHash: 'hand-a', scanAt: now, dataChangedAt: now, at: now,
    url: 'https://tmo.gg/ko/build-helper/32172', unitCount: units.length, units,
    counts: Object.fromEntries(units.map(unit => [unit.id, unit.count])),
    wispCount: 0, wispCountFound: true,
    collection: {found: true, confidence: .95, errors: []},
    countDiscovery: {found: true, parsed: units.length, missing: 0, ambiguous: 0, confidence: 1, errors: []}
  };
}

(async () => {
  const content = read('content-tmo.js');
  assert(content.includes('const POLL_INTERVAL_MS = 2000'));
  assert(content.includes('const FULL_AUDIT_INTERVAL_MS = 30000'));
  assert(content.includes('setInterval(poll, POLL_INTERVAL_MS)'));
  assert(content.includes("type: 'ORD_HEARTBEAT'"));
  assert(content.includes('persistentRowScopeCache'));
  assert(content.includes('probeFingerprint'));
  assert(!content.includes("setInterval(() => publish(false, 'fallback-poll'), 4000)"));
  pass('unchanged fallback uses a two-second shallow fingerprint and a 30-second full audit');

  const observerBlock = content.slice(content.indexOf('observer.observe(root'), content.indexOf('intervalId = setInterval'));
  assert(!observerBlock.includes('characterData'));
  assert(observerBlock.includes("attributeFilter: ['data-tooltip-content', 'value', 'aria-valuenow']"));
  pass('mutation observer ignores unrelated character-data animation churn');

  const harness = backgroundHarness();
  await harness.dispatch({type: 'ORD_PIN_SOURCE', tabId: 31, helperId: '32172', url: 'https://tmo.gg/ko/build-helper/32172'});
  const snapshot = fullSnapshot();
  const accepted = await harness.dispatch({type: 'ORD_SNAPSHOT', snapshot}, 31);
  assert.strictEqual(accepted.changed, true);
  const storedSnapshot = harness.storage.ordLatestSnapshot;
  const fullWriteBytes = harness.writes[harness.writes.length - 1].bytes;

  const compact = {
    parser: snapshot.parser, helperId: snapshot.helperId, adapterId: snapshot.adapterId,
    sessionId: snapshot.sessionId, seq: snapshot.seq, dataHash: snapshot.dataHash,
    scanAt: snapshot.scanAt + 7000, dataChangedAt: snapshot.dataChangedAt,
    url: snapshot.url, reason: 'fallback-heartbeat'
  };
  assert(JSON.stringify({type: 'ORD_HEARTBEAT', heartbeat: compact}).length < 600, 'heartbeat message is unexpectedly large');
  const heartbeat = await harness.dispatch({type: 'ORD_HEARTBEAT', heartbeat: compact}, 31);
  assert.strictEqual(heartbeat.compact, true);
  assert.strictEqual(harness.storage.ordLatestSnapshot, storedSnapshot, 'heartbeat replaced the full snapshot');
  assert.deepStrictEqual(harness.writes[harness.writes.length - 1].keys, ['ordLatestHeartbeat']);
  assert(harness.writes[harness.writes.length - 1].bytes * 20 < fullWriteBytes, 'compact heartbeat did not materially reduce storage payload');
  pass('unchanged data sends and stores only a compact heartbeat');

  const mismatch = await harness.dispatch({type: 'ORD_HEARTBEAT', heartbeat: Object.assign({}, compact, {dataHash: 'wrong-hand'})}, 31);
  assert.strictEqual(mismatch.ignored, 'heartbeat-data-mismatch');
  assert.strictEqual(harness.storage.ordLatestSnapshot, storedSnapshot);
  pass('background rejects a heartbeat that does not match the accepted hand');

  const boot = read('ord_boot_extension.js');
  assert(boot.includes('function tabById(tabId)'));
  assert(boot.includes('function freshHeartbeat(snapshot, heartbeat, maxAge)'));
  assert(boot.includes('}, 8000);'));
  assert(boot.includes('freshHeartbeat(latest.ordLatestSnapshot, latest.ordLatestHeartbeat, 12000)'));
  pass('dashboard monitor uses direct tab lookup and skips ping while heartbeat is fresh');

  assert(content.includes('const specialLabelCandidates = Array.from(document.querySelectorAll'));
  assert(content.includes('const scope = rowScope(card, persistentRowScopeCache)'));
  assert(content.includes('const count = countFromCard(card, scope)'));
  assert(content.includes('const visible = visiblePercent(card, scope)'));
  pass('full scan shares row scope work and performs one special-label DOM query');

  console.log(`performance regression tests: ${passed}/6 passed`);
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
