#!/usr/bin/env node
// TMO.GG 공개 API에서 원랜디(ORDR2) 악몽 상위권 클리어 기록을 수집한다.
//
// 발견 경위: tmo.gg는 Next.js SPA이고 화면 데이터는 api.tmo.gg 공개 REST API에서
// 온다(인증 불필요). 기존 방식(프로필 Ctrl+S 저장본 → tmo_profile_parse.js)의
// 두 한계를 이 API가 해결한다:
//   1. 상대 날짜("14시간 전") → createdAt 절대 ISO 타임스탬프
//   2. 유닛 이름 표기 차이(별칭 매핑 필요) → code(TMO rawcode) 필드 제공
//
// 쓰는 엔드포인트:
//   GET /ranks/ordr2/top-users?categoryId=nightmare-clear            누적 상위 20
//   GET /ranks/ordr2/seasons/<YYYY-MM>/top-users?categoryId=...&next= 월간 랭킹(커서)
//   GET /ranks/ordr2/users/<닉네임>/histories?next=<ISO커서>          판별 기록(커서)
//
// 기록은 클리어된 판만 존재한다(실패 판 없음 — 생존 편향은 분석 시 명시할 것).
//
// 사용:
//   node tools/tmo_api_collect.js                # data/tmo_api_histories_<날짜>.json 생성
//   node tools/tmo_api_collect.js --cutoff 2026-06-04T15:00:00Z --out data/foo.json
//
// 프록시 환경(HTTPS_PROXY)에서는 NODE_USE_ENV_PROXY=1 을 함께 지정한다.

'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'https://api.tmo.gg';
const RANK_ID = 'ordr2';
const CATEGORY = 'nightmare-clear';
// 2.305 출시 경계: 문서 기준 6/5, 사용자 기준 6/6(KST). KST 6/5 00:00(UTC 6/4 15:00)
// 까지 내려 받아 두고 분석 단계에서 컷을 고른다.
const DEFAULT_CUTOFF = '2026-06-04T15:00:00Z';
const SEASONS = ['2026-06', '2026-07'];
const TOP_N_PER_SEASON = 30;
const REQUEST_GAP_MS = 250;
const MAX_PAGES_PER_USER = 80; // 20판/페이지 × 80 = 1,600판 상한(폭주 방지)

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, attempt = 0) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      await sleep(1000 * 2 ** attempt);
      return getJson(url, attempt + 1);
    }
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  return res.json();
}

async function seasonTopUsers(season, limit) {
  const users = [];
  let cursor = null;
  while (users.length < limit) {
    let url = `${BASE}/ranks/${RANK_ID}/seasons/${season}/top-users?categoryId=${CATEGORY}`;
    if (cursor) url += `&next=${encodeURIComponent(String(cursor))}`;
    const d = await getJson(url);
    if (!Array.isArray(d.users) || d.users.length === 0) break;
    users.push(...d.users);
    cursor = d.nextCursor;
    if (!cursor) break;
    await sleep(REQUEST_GAP_MS);
  }
  return users.slice(0, limit).map((u, i) => ({ ...u, season, seasonRank: i + 1 }));
}

async function cumulativeTopUsers() {
  const d = await getJson(`${BASE}/ranks/${RANK_ID}/top-users?categoryId=${CATEGORY}`);
  return (d.users || []).map((u, i) => ({ ...u, season: 'cumulative', seasonRank: i + 1 }));
}

// image URL은 부피만 크고 분석에 안 쓰므로 버린다. code/name/count만 보존.
function compactRecord(r) {
  return {
    createdAt: r.createdAt,
    difficulty: r.difficulty,
    categoryScores: r.categoryScores,
    unitCount: r.statisticDatas ? r.statisticDatas.unitCount : r.unitCount,
    score: r.statisticDatas ? r.statisticDatas.score : undefined,
    units: (r.units || []).map((u) => ({ code: u.code, name: u.name, count: u.count })),
  };
}

async function userHistories(nickname, cutoffIso) {
  const recs = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES_PER_USER; page++) {
    let url = `${BASE}/ranks/${RANK_ID}/users/${encodeURIComponent(nickname)}/histories`;
    if (cursor) url += `?next=${encodeURIComponent(cursor)}`;
    const d = await getJson(url);
    const h = d.histories || [];
    if (h.length === 0) break;
    recs.push(...h);
    cursor = d.nextCursor;
    if (!cursor || h[h.length - 1].createdAt < cutoffIso) break;
    await sleep(REQUEST_GAP_MS);
  }
  return recs.filter((r) => r.createdAt >= cutoffIso).map(compactRecord);
}

async function main() {
  const cutoff = arg('--cutoff', DEFAULT_CUTOFF);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const out = arg('--out', path.join(__dirname, '..', 'data', `tmo_api_histories_${stamp}.json`));

  console.log(`수집 기준: ${CATEGORY}, 컷오프 ${cutoff}`);

  const pools = [await cumulativeTopUsers()];
  for (const s of SEASONS) {
    pools.push(await seasonTopUsers(s, TOP_N_PER_SEASON));
    await sleep(REQUEST_GAP_MS);
  }

  // 닉네임 기준 합집합. 어느 풀에서 몇 위였는지 근거로 남긴다.
  const byName = new Map();
  for (const u of pools.flat()) {
    const e = byName.get(u.nickname) || { userId: u.userId, nickname: u.nickname, ranks: [] };
    e.ranks.push({ pool: u.season, rank: u.seasonRank, score: u.score });
    byName.set(u.nickname, e);
  }
  const targets = [...byName.values()];
  console.log(`대상 플레이어 합집합: ${targets.length}명 (누적 top20 ∪ ${SEASONS.join('/')} 월간 top${TOP_N_PER_SEASON})`);

  const players = [];
  let totalGames = 0;
  for (const [i, t] of targets.entries()) {
    try {
      const records = await userHistories(t.nickname, cutoff);
      totalGames += records.length;
      players.push({ ...t, gameCount: records.length, records });
      console.log(`  [${i + 1}/${targets.length}] ${t.nickname}: ${records.length}판 (누계 ${totalGames})`);
    } catch (e) {
      players.push({ ...t, gameCount: 0, records: [], error: String(e.message || e) });
      console.log(`  [${i + 1}/${targets.length}] ${t.nickname}: 실패 — ${e.message}`);
    }
    await sleep(REQUEST_GAP_MS);
  }

  const payload = {
    schema: 'tmo-api-histories-v1',
    collectedAt: new Date().toISOString(),
    rankId: RANK_ID,
    categoryId: CATEGORY,
    cutoff,
    pools: { cumulative: 20, seasons: SEASONS, topNPerSeason: TOP_N_PER_SEASON },
    caveats: [
      '클리어된 판만 기록됨(실패 판 없음) — 생존 편향',
      'unitCount = 클리어 후 남은 유닛 수(사용자 확인 정의)',
      '파티는 최종 보유 유닛이며 판 중간의 패·판단 이력은 없음',
    ],
    playerCount: players.length,
    totalGames,
    players,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload));
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
  console.log(`저장: ${out} (${mb}MB, ${players.length}명 ${totalGames}판)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
