(function (global) {
  'use strict';

  // v19.9.6(A안 4단계 — 매핑 확정 + 로컬 직결 합성기)
  //
  // 0801 실전 한 판(48쌍 표본, 로우코드 102종 · DOM 카탈로그 69종)으로
  // /datas(인게임 로우코드→수량) ↔ TMO DOM(카탈로그 id→수량)을 대조한 결과:
  //
  //  · 직결 72종 — 게임에 실존하는 유닛의 카탈로그 id 는 인게임 로우코드와
  //    같다('####h' 꼴).  즉 카탈로그 id 집합에 있는 코드는 그대로 쓴다.
  //    (아래 CODE_MAP 에 나열하지 않는다 — 카탈로그가 곧 매핑이다.)
  //  · 궤적 확정 3종 — 카탈로그 id 가 합성('unit_...')인 특수재료는 수량
  //    변화 궤적이 전 표본에서 유일하게 일치한 것만 확정했다.
  //      060h → 해적선   (수량 2→1→0 궤적 완전 일치)
  //      H00h → 좀비     (24번째 표본 단독 2개 스파이크 일치)
  //      S40h → 초월쿠마 (첫 표본 단독 1개 → 소비, 단일 표본 근거)
  //  · 배제 2종 — PA0H·Y50h 는 판 내내 상수 1이라 '랜덤유닛/토큰'
  //    (unit_1767884970331_9084)과 궤적이 셋 다 동일했다.  둘 중 무엇이
  //    진짜인지 구분 불가(상수 궤적 위양성) — 확정하지 않고 무시한다.
  //  · 나머지 25종 — 환경·타개체 코드(A0H 계열, e-접미 일시 코드, 상수
  //    단독 코드)로 DOM 상대가 없다.  수집기는 무시하되 진단에 남긴다.
  //
  // /datas 는 보유 유닛만 준다(없으면 키 자체가 없음) — DOM 파싱과 달리
  // "안 보임=0"이 서버 원본 기준으로 정당하다.  그래서 여기 합성 스냅샷은
  // 흔들리는 수집 신뢰도 게이트(300~380종 전수 파싱) 대신 소유 전수 계약을
  // 쓴다.  완성도%·현재 능력치는 TMO 탭이 열려 있을 때만 보강된다.

  var LOCAL_DATAS_URL = 'http://127.0.0.1:25625/datas';
  // 로컬 소스 고정 epoch(포트 번호) — DOM 고정 epoch(1,2,3…)와 절대 겹치지
  // 않는 상수여야 대시보드 재로드 때 판 중간 라운드 리셋이 없다.
  var LOCAL_SOURCE_EPOCH = 25625;

  var CODE_MAP = {
    '060h': 'unit_1767884925665_1037', // 해적선
    'H00h': 'unit_1767884889420_456',  // 좀비
    'S40h': 'unit_1767884940750_9880'  // 초월쿠마
  };

  var RESOURCE_CODES = ['GOLD', 'LUMBER', 'FOOD'];
  var IGNORE_CODES = RESOURCE_CODES.concat([
    // A0H 계열 — 판 내내 상수 1, 게임 환경 개체(0801 표본 전체에서 불변)
    'OA0H', 'PA0H', 'QA0H', 'RA0H', 'SA0H', 'TA0H', 'UA0H', 'ZA0H', '0B0H',
    // 상수 단독 코드 — DOM 상대 없음
    '4C0H', 'A70h', 'A80h', 'C80h', 'JA0h', 'M50H', 'Q60h', 'R60h', 'S60h', 'U50h', 'Y50h',
    // 일시 코드(라운드 개체 추정) — 한두 표본만 나타나고 DOM 상대 없음
    '610e', '630e', 'HK0e', 'JK0e', 'XI0e', '960h', 'B60h'
  ]);
  var IGNORE_SET = {};
  for (var i = 0; i < IGNORE_CODES.length; i += 1) IGNORE_SET[IGNORE_CODES[i]] = true;

  // content-tmo SPECIAL_ROWS 와 같은 특수행 id — playableUnitCount(실전
  // 유닛 총수) 계산에서 뺀다.  자동 라운드 시작(첫 실제 유닛 감지)이 이
  // 수를 보므로 위습·특수재료로 시작 오탐이 나면 안 된다.
  var SPECIAL_IDS = [
    'unit_1746119237460_7641', 'RANDOM', '810e',
    'unit_1767884840242_5227', 'unit_1767884871133_6843', 'unit_1767884889420_456',
    'unit_1767884906256_4990', 'unit_1767884925665_1037', 'unit_1767884940750_9880',
    'unit_1767884970331_9084', 'unit_1779016778159_2512', 'unit_1767884989406_3833',
    'unit_1767885034730_2200', 'unit_1761061085749_3333', 'unit_1761061102389_3',
    'unit_1761061295036_310', 'unit_1761061550524_6203', 'unit_1767884457709_1523',
    'unit_1767884591387_9300', 'unit_1767884614234_8036'
  ];
  var SPECIAL_SET = {};
  for (var j = 0; j < SPECIAL_IDS.length; j += 1) SPECIAL_SET[SPECIAL_IDS[j]] = true;

  function num(value) { var parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

  function fnv1a(value) {
    var hash = 2166136261;
    for (var index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  // v19.9.9(외부 점검 P0-1): 합성 id('unit_...') 유닛 73종 중 60종은
  // 카탈로그가 이미 로우코드를 들고 있다(unit.codes) — 세라핌·왜곡·
  // 초월 등 실전 제작 대상이 전부 여기다.  궤적 대조로 3종만 확정하고
  // 나머지를 미해석으로 버리던 공백을 codes 역색인으로 닫는다.
  //   · 1:1 코드 → 자동 매핑.
  //   · 1:N 코드 중 전원이 같은 상위의 폼 변형(190H 쵸파/몬스터포인트,
  //     DA0h 카이도/용폼, G90H 상디/제르마)이면 첫 형태로 매핑한다 —
  //     인게임에선 같은 유닛의 폼 전환이라 로우코드가 하나다.
  //   · 진짜 다른 유닛이 코드를 공유하면(AA0H 베가펑크 4종, BA0H)
  //     매핑하지 않고 미해석으로 남긴다 — 틀린 매핑이 무매핑보다 나쁘다.
  function buildCodeIndex(catalog, canonicalOf) {
    var byCode = {};
    var list = Array.isArray(catalog) ? catalog : [];
    for (var u = 0; u < list.length; u += 1) {
      var unit = list[u];
      var codes = unit && Array.isArray(unit.codes) ? unit.codes : [];
      for (var c = 0; c < codes.length; c += 1) {
        var code = String(codes[c] || '');
        if (!code) continue;
        if (!byCode[code]) byCode[code] = [];
        if (byCode[code].indexOf(String(unit.id)) < 0) byCode[code].push(String(unit.id));
      }
    }
    var map = {}, ambiguous = [], ignoredConflicts = [];
    for (var key in byCode) {
      var ids = byCode[key];
      if (ids.length === 1) map[key] = ids[0];
      else if (typeof canonicalOf === 'function') {
        var canon = {};
        for (var i = 0; i < ids.length; i += 1) canon[String(canonicalOf(ids[i]))] = true;
        if (Object.keys(canon).length === 1) map[key] = ids[0];
        else ambiguous.push(key);
      } else ambiguous.push(key);
      if (map[key] && IGNORE_SET[key] === true) ignoredConflicts.push(key);
    }
    return {map: map, ambiguous: ambiguous, ignoredConflicts: ignoredConflicts};
  }

  // /datas units(로우코드→수량) → 카탈로그 id→수량.  catalogIds 는 Set,
  // codeIndex 는 buildCodeIndex 결과(없으면 직결+CODE_MAP 만 사용).
  function translate(liveUnits, catalogIds, codeIndex) {
    var counts = {}, unknown = [], unknownCounts = {}, ignored = 0, matched = 0;
    var wisp = 0, wispFound = false, playableUnitCount = 0;
    var indexMap = codeIndex && codeIndex.map || null;
    var entries = liveUnits && typeof liveUnits === 'object' ? Object.keys(liveUnits) : [];
    for (var k = 0; k < entries.length; k += 1) {
      var code = entries[k];
      var count = Math.max(0, num(liveUnits[code]));
      if (IGNORE_SET[code] === true) { ignored += 1; continue; }
      var id = CODE_MAP[code] || (catalogIds && catalogIds.has(code) ? code : '') || (indexMap && indexMap[code]) || '';
      if (!id) { unknown.push(code); unknownCounts[code] = count; continue; }
      counts[id] = (counts[id] || 0) + count;
      matched += 1;
      if (id === '810e') { wisp += count; wispFound = true; }
      else if (SPECIAL_SET[id] !== true) playableUnitCount += count;
    }
    return {counts: counts, matched: matched, unknown: unknown, unknownCounts: unknownCounts,
      ignored: ignored, wisp: wisp, wispFound: wispFound, playableUnitCount: playableUnitCount};
  }

  function countsHash(translated, stableUnknownCounts) {
    var counts = translated && translated.counts || {};
    var keys = Object.keys(counts).sort();
    var parts = [];
    for (var k = 0; k < keys.length; k += 1) parts.push(keys[k] + ':' + counts[keys[k]]);
    // v19.9.9(외부 점검 P0-1): 미해석 코드도 해시에 넣는다 — 안 넣으면
    // 미해석 유닛이 새로 생겨도 seq·dataChangedAt 이 안 움직여, 신선한
    // 로컬이 DOM 까지 눌러둔 채 화면이 옛 패에 머문다.
    // v19.15.1(0805 실측): 단, 전장 임시 개체(580h·T30e 등)가 초단위로
    // 미해석 수량을 흔들어 재판단이 초마다 돌았다 — 63라에서 승인 카드가
    // 2분간 8번 왕복한 원인.  부트가 안정화 집합(연속 3회 관측)을 주면
    // 그것만 해시에 넣는다.  인자를 안 주면 종전 그대로(하위 호환).
    var unknownCounts = stableUnknownCounts != null ? stableUnknownCounts : (translated && translated.unknownCounts || {});
    var unknownKeys = Object.keys(unknownCounts).sort();
    for (var q = 0; q < unknownKeys.length; q += 1) parts.push('?' + unknownKeys[q] + ':' + unknownCounts[unknownKeys[q]]);
    return fnv1a(parts.join('|'));
  }

  // v19.15.1 — 미해석 코드 안정화.  같은 수량으로 연속 STABLE_POLLS 회
  // 관측된 미해석 코드만 '실제 보유'로 인정한다.  'e' 접미(…0e) 코드는
  // 전원 전투 임시 개체라(실유닛 중 0e 는 위습 810e 뿐이고, 위습은
  // 카탈로그 직결이라 여기 오지 않는다) 아예 안정 대상에서 제외한다.
  var UNKNOWN_STABLE_POLLS = 3;
  function nextUnknownStability(previous, unknownCounts, now) {
    var prior = previous && typeof previous === 'object' && previous.codes ? previous.codes : {};
    var next = {}, stable = {};
    var live = unknownCounts && typeof unknownCounts === 'object' ? unknownCounts : {};
    for (var code in live) {
      if (/0e$/i.test(code)) continue;
      var count = Math.max(0, num(live[code]));
      if (count <= 0) continue;
      var before = prior[code];
      var streak = before && num(before.count) === count ? num(before.streak) + 1 : 1;
      next[code] = {count: count, streak: streak, lastAt: num(now) || 0};
      if (streak >= UNKNOWN_STABLE_POLLS) stable[code] = count;
    }
    return {codes: next, stable: stable};
  }

  // background nextAutoRound 와 같은 의미론 + 콜드 스타트 채택 규칙:
  // 저장 기록이 아예 없는데 첫 관측부터 실전 유닛이 있으면(판 중간 최초
  // 사용) generation 을 올리지 않는다 — 올리면 앱이 라운드를 1로 되돌린다.
  function nextLocalAutoRound(previous, playableUnitCount, dataChangedAt, now) {
    var prior = previous && typeof previous === 'object' ? previous : null;
    var generation = prior ? Math.max(0, num(prior.generation)) : 0;
    var active = prior ? prior.active === true : false;
    var startedAt = prior ? Math.max(0, num(prior.startedAt)) : 0;
    var playable = Math.max(0, num(playableUnitCount));
    if (playable <= 0) {
      active = false;
      startedAt = 0;
    } else if (!active) {
      if (prior) generation += 1;
      active = true;
      startedAt = Math.max(1, num(dataChangedAt) || num(now) || Date.now());
    }
    return {sourceEpoch: LOCAL_SOURCE_EPOCH, generation: generation, active: active,
      startedAt: startedAt, playableUnitCount: playable};
  }

  // DOM 호환 스냅샷 합성.  opts:
  //  translated(translate 결과) · catalog(ORD_TMO_UNITS 배열) ·
  //  domStash(신선한 DOM 스냅샷 — %·능력치 보강, 없으면 null) ·
  //  sessionId · seq · dataChangedAt · autoRound · now
  function buildLocalSnapshot(opts) {
    var t = opts.translated, now = num(opts.now) || Date.now();
    var catalog = Array.isArray(opts.catalog) ? opts.catalog : [];
    var byId = {};
    for (var c = 0; c < catalog.length; c += 1) byId[String(catalog[c].id)] = catalog[c];
    var domStash = opts.domStash || null;
    var domRows = {};
    var domFreshFor = 60000;
    var domAt = domStash ? num(domStash.scanAt || domStash.at) : 0;
    var domUsable = !!(domStash && domAt && now - domAt <= domFreshFor);
    if (domUsable) {
      var stashUnits = Array.isArray(domStash.units) ? domStash.units : [];
      for (var d = 0; d < stashUnits.length; d += 1) {
        var row = stashUnits[d];
        if (row && row.id) domRows[String(row.id)] = row;
      }
    }
    // 소유 행 + (보강용) DOM 진행도 행의 합집합.  수량은 항상 로컬이 이긴다
    // — /datas 에 없는 유닛은 0이 서버 기준 진실이다.
    var rowIds = {}, ids = [];
    var owned = Object.keys(t.counts);
    for (var o = 0; o < owned.length; o += 1) { if (!rowIds[owned[o]]) { rowIds[owned[o]] = true; ids.push(owned[o]); } }
    if (domUsable) {
      var domIds = Object.keys(domRows);
      for (var p = 0; p < domIds.length; p += 1) {
        var domRow = domRows[domIds[p]];
        if (num(domRow.tmoPercent) > 0 && byId[domIds[p]] && !rowIds[domIds[p]]) { rowIds[domIds[p]] = true; ids.push(domIds[p]); }
      }
    }
    var rows = [], counts = {}, nonzero = 0, playableNonzero = 0, percentCount = 0;
    for (var r = 0; r < ids.length; r += 1) {
      var id = ids[r];
      var base = byId[id];
      var enrich = domRows[id];
      var count = Math.max(0, num(t.counts[id]));
      var tmoPercent = enrich ? Math.max(0, num(enrich.tmoPercent)) : 0;
      if (tmoPercent > 0) percentCount += 1;
      if (count > 0) {
        nonzero += 1;
        if (SPECIAL_SET[id] !== true) playableNonzero += 1;
      }
      counts[id] = count;
      rows.push({
        id: id,
        name: base && base.name || (enrich && enrich.name) || id,
        groupName: base && base.groupName || (enrich && enrich.groupName) || '',
        count: count,
        countFound: true,
        countConfidence: 1,
        countSource: 'local-datas',
        tmoPercent: tmoPercent
      });
    }
    var abilities = domUsable && domStash.currentAbilities && Object.keys(domStash.currentAbilities).length
      ? Object.assign({}, domStash.currentAbilities) : {};
    var abilityCount = Object.keys(abilities).length;
    var dataChangedAt = Math.max(1, num(opts.dataChangedAt) || now);
    var snapshot = {
      source: 'local-direct',
      parser: 'ord-local-datas-v1',
      adapterId: 'local-datas',
      adapterLabel: '로컬 직결(TMO 데스크톱 /datas)',
      sessionId: String(opts.sessionId || ''),
      seq: Math.max(1, num(opts.seq)),
      at: now,
      scanAt: now,
      collectedAt: now,
      dataChangedAt: dataChangedAt,
      bridgeAt: now,
      url: LOCAL_DATAS_URL,
      helperId: 'local',
      connected: true,
      collection: {found: true, confidence: 1, errors: []},
      countDiscovery: {found: true, parsed: rows.length, missing: 0, ambiguous: 0, confidence: 1, errors: []},
      unitCount: rows.length,
      nonzero: nonzero,
      playableNonzero: playableNonzero,
      playableUnitCount: Math.max(0, num(t.playableUnitCount)),
      percentCount: percentCount,
      visiblePercentCount: percentCount,
      tooltipPercentCount: 0,
      wispCount: Math.max(0, num(t.wisp)),
      // /datas 는 보유 전수라 위습 키가 없으면 0이 서버 기준 진실이다.
      wispCountFound: true,
      wispAliasId: '810e',
      currentAbilities: abilities,
      currentAbilitiesFound: abilityCount > 0,
      currentAbilitySource: abilityCount > 0 ? 'local-direct-tmo-enrich' : 'local-direct-none',
      abilityCount: abilityCount,
      progressSample: rows.filter(function (unit) { return unit.tmoPercent > 0; })
        .sort(function (a, b) { return b.tmoPercent - a.tmoPercent; }).slice(0, 12)
        .map(function (unit) { return {id: unit.id, name: unit.name, percent: unit.tmoPercent, source: 'tmo-dom-enrich'}; }),
      units: rows,
      counts: counts,
      missingSpecialIds: [],
      localDirect: {
        matched: Math.max(0, num(t.matched)),
        ignored: Math.max(0, num(t.ignored)),
        // v19.15.1: 부트가 안정화 집합을 주면 그것만 노출 — 전투 임시
        // 개체 요동이 건강 배지('미해석 N종')와 런로그를 흔들지 않게.
        unknownCodes: opts.stableUnknown != null ? Object.keys(opts.stableUnknown).slice(0, 20) : (t.unknown || []).slice(0, 20),
        // v19.12.2: 미해석 수량 궤적 — 판을 넘나드는 대조(예: V40h가
        // 레일리(히든)인지)를 런로그만으로 할 수 있게 수량까지 싣는다.
        unknownCounts: Object.assign({}, opts.stableUnknown != null ? opts.stableUnknown : (t.unknownCounts || {})),
        enrichedFromDomAt: domUsable ? domAt : 0
      },
      sourceTabId: 0,
      sourceEpoch: LOCAL_SOURCE_EPOCH,
      autoRound: opts.autoRound || null
    };
    var abilityText = Object.keys(abilities).sort().map(function (key) { return key + ':' + abilities[key]; }).join('|');
    snapshot.dataHash = fnv1a(rows.slice().sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); })
      .map(function (unit) { return unit.id + ':' + unit.count + ':' + unit.tmoPercent; }).join('|') + '#' + abilityText);
    snapshot.observationKey = snapshot.sessionId + ':' + snapshot.seq + ':' + snapshot.dataHash;
    return snapshot;
  }

  global.ORD_LOCAL_MAP = {
    VERSION: '20.1.0',
    LOCAL_DATAS_URL: LOCAL_DATAS_URL,
    LOCAL_SOURCE_EPOCH: LOCAL_SOURCE_EPOCH,
    CODE_MAP: CODE_MAP,
    IGNORE_CODES: IGNORE_CODES,
    SPECIAL_IDS: SPECIAL_IDS,
    buildCodeIndex: buildCodeIndex,
    translate: translate,
    countsHash: countsHash,
    nextLocalAutoRound: nextLocalAutoRound,
    nextUnknownStability: nextUnknownStability,
    buildLocalSnapshot: buildLocalSnapshot
  };
})(typeof window !== 'undefined' ? window : globalThis);
