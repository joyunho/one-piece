#!/usr/bin/env node
// TMO.GG 공개 API에서 "악몽 클리어 기록 전체"를 수집한다.
//
// tools/tmo_api_collect.js 와의 차이: 저쪽은 상위권 표본(누적 top20 ∪ 월간 top30)만
// 받는다. 이 스크립트는 월간 악몽 랭킹을 커서 끝까지 훑어 컷오프 이후 악몽을 1판
// 이라도 클리어한 플레이어 전원을 대상으로 한다(= 모집단 전수).
//
// 월간 랭킹은 그 달에 클리어한 사람만 실리므로, 컷오프가 속한 달부터 실행 달까지의
// 월간 랭킹 합집합 = 컷오프 이후 클리어자 전원이다(중도 닉변경은 예외 — 아래 주의).
//
// 쓰는 엔드포인트:
//   GET /ranks/ordr2/seasons/<YYYY-MM>/top-users?categoryId=nightmare-clear&next=<커서>
//   GET /ranks/ordr2/users/<닉네임>/histories?next=<ISO커서>
//   GET /ranks/ordr2/top-users?categoryId=nightmare-clear   (누적 top20 — 커서는 서버 500)
//
// 기록은 클리어된 판만 존재한다(실패 판 없음 — 생존 편향은 분석 시 명시할 것).
//
// 사용:
//   node tools/tmo_nightmare_collect_all.js
//   node tools/tmo_nightmare_collect_all.js --cutoff 2026-06-05T15:00:00Z --concurrency 6
//
// 프록시 환경(HTTPS_PROXY)에서는 NODE_USE_ENV_PROXY=1 을 함께 지정한다.

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BASE = 'https://api.tmo.gg';
const RANK_ID = 'ordr2';
const CATEGORY = 'nightmare-clear';
// 사용자 기준 컷오프: KST 6/6 00:00 = UTC 6/5 15:00.
const DEFAULT_CUTOFF = '2026-06-05T15:00:00Z';
const REQUEST_GAP_MS = 100; // 워커 1개당 간격 — 동시성과 곱해 전체 부하가 결정된다
const MAX_RANK_PAGES = 5000; // 랭킹 커서 폭주 방지(20명/페이지)
const MAX_PAGES_PER_USER = 400; // 20판/페이지 × 400 = 8,000판 상한

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let requestCount = 0;
let retryCount = 0;

async function getJson(url, attempt = 0) {
  requestCount += 1;
  let res;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (error) {
    // 일시적 네트워크 오류(ECONNRESET 등)도 재시도 — 한 번의 순단으로
    // 플레이어 하나가 통째로 탈락하지 않게 한다.
    if (attempt < 5) {
      retryCount += 1;
      await sleep(700 * 2 ** attempt);
      return getJson(url, attempt + 1);
    }
    throw error;
  }
  if (!res.ok) {
    if (attempt < 5 && (res.status === 429 || res.status >= 500)) {
      retryCount += 1;
      await sleep(700 * 2 ** attempt);
      return getJson(url, attempt + 1);
    }
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  return res.json();
}

// 컷오프가 속한 달부터 실행 시점의 달까지 — 하드코딩 목록은 시즌이 바뀌면 낡는다.
function seasonsSince(cutoffIso, nowMs) {
  const start = new Date(Date.parse(cutoffIso));
  const now = new Date(nowMs);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(now.getTime())) {
    throw new Error(`시즌 범위 계산 불가: ${cutoffIso}`);
  }
  const out = [];
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  while (year < now.getUTCFullYear() || (year === now.getUTCFullYear() && month <= now.getUTCMonth())) {
    out.push(`${year}-${String(month + 1).padStart(2, '0')}`);
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  return out;
}

// 시즌 랭킹을 커서 끝까지 — 상위 N 자르기 없음(전수 수집의 핵심).
async function seasonAllUsers(season) {
  const base = `${BASE}/ranks/${RANK_ID}/seasons/${season}/top-users?categoryId=${CATEGORY}`;
  const users = [];
  let cursor = null;
  let pages = 0;
  let truncated = false;
  for (;;) {
    if (pages >= MAX_RANK_PAGES) { truncated = true; break; }
    const url = cursor ? `${base}&next=${encodeURIComponent(String(cursor))}` : base;
    const d = await getJson(url);
    const us = d.users || [];
    if (!us.length) break;
    for (const u of us) users.push({ ...u, season, seasonRank: users.length + 1 });
    pages += 1;
    cursor = d.nextCursor;
    if (!cursor) break;
    if (pages % 50 === 0) {
      process.stdout.write(`  ${season}: ${users.length}명 수집(최저 ${us[us.length - 1].score}클)\n`);
    }
    await sleep(REQUEST_GAP_MS);
  }
  if (truncated) console.warn(`  경고: ${season} 랭킹이 페이지 상한에서 절단됨`);
  return { users, truncated };
}

async function cumulativeTopUsers() {
  // 누적 랭킹은 커서(next)가 서버 500이라 1페이지(top20)만 근거로 남긴다.
  try {
    const d = await getJson(`${BASE}/ranks/${RANK_ID}/top-users?categoryId=${CATEGORY}`);
    return (d.users || []).map((u, i) => ({ ...u, season: 'cumulative', seasonRank: i + 1 }));
  } catch (e) {
    console.warn(`  경고: 누적 랭킹 조회 실패 — ${e.message}`);
    return [];
  }
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

async function userHistories(nickname, cutoffMs) {
  const recs = [];
  let cursor = null;
  let truncated = false;
  let pages = 0;
  for (;;) {
    if (pages >= MAX_PAGES_PER_USER) { truncated = true; break; }
    let url = `${BASE}/ranks/${RANK_ID}/users/${encodeURIComponent(nickname)}/histories`;
    if (cursor) url += `?next=${encodeURIComponent(cursor)}`;
    const d = await getJson(url);
    const h = d.histories || [];
    if (!h.length) break;
    recs.push(...h);
    pages += 1;
    cursor = d.nextCursor;
    // 페이지는 createdAt 내림차순 — 마지막 판이 컷오프보다 과거면 더 볼 필요 없다.
    // ISO 문자열 비교는 밀리초 유무가 섞이면 경계를 잘못 자르므로 epoch로 비교한다.
    if (!cursor || Date.parse(h[h.length - 1].createdAt) < cutoffMs) break;
    await sleep(REQUEST_GAP_MS);
  }
  return {
    truncated,
    pages,
    records: recs
      .filter((r) => Date.parse(r.createdAt) >= cutoffMs)
      .map(compactRecord),
  };
}

// 동시성 풀 — 순차 수집은 모집단 전수에서 몇 시간이 걸린다.
async function pool(items, concurrency, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const cutoff = arg('--cutoff', DEFAULT_CUTOFF);
  const cutoffMs = Date.parse(cutoff);
  if (!Number.isFinite(cutoffMs)) throw new Error(`잘못된 컷오프: ${cutoff}`);
  const concurrency = Number(arg('--concurrency', '6')) || 6;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // 파일명을 tmo_api_histories_* 와 다르게 둔다 — build_meta_stats.js 의 "최신 파일"
  // 자동 선택이 상위권 표본에서 전수 표본으로 조용히 바뀌지 않게 하기 위함.
  // 전수 원본은 70MB급이라 기본 출력은 .gz(약 5MB) — 통계 도구가 그대로 읽는다.
  const out = arg('--out', path.join(__dirname, '..', 'data', `tmo_nightmare_all_${stamp}.json.gz`));

  const seasons = seasonsSince(cutoff, Date.now());
  console.log(`수집 기준: ${CATEGORY}, 컷오프 ${cutoff}, 시즌 ${seasons.join('/')}, 동시성 ${concurrency}`);

  const seasonPools = {};
  // 랭킹 점수 합계 = 그 달의 악몽 클리어 총량. 수집한 판수와 대조하면 누락을
  // 잡을 수 있다(컷오프가 달 중간이면 그만큼 적게 나오는 게 정상).
  const seasonClears = {};
  const seasonTruncated = [];
  const all = [];
  for (const s of seasons) {
    const { users, truncated } = await seasonAllUsers(s);
    seasonPools[s] = users.length;
    seasonClears[s] = users.reduce((a, u) => a + (u.score || 0), 0);
    if (truncated) seasonTruncated.push(s);
    all.push(...users);
    console.log(`${s} 랭킹: ${users.length}명, 클리어 합계 ${seasonClears[s]}`);
  }
  const cumulative = await cumulativeTopUsers();
  all.push(...cumulative);

  // 닉네임 기준 합집합(histories 조회 키가 닉네임이라 닉네임이 정본).
  const byName = new Map();
  for (const u of all) {
    const e = byName.get(u.nickname) || { userId: u.userId, nickname: u.nickname, ranks: [] };
    e.ranks.push({ pool: u.season, rank: u.seasonRank, score: u.score });
    byName.set(u.nickname, e);
  }
  const targets = [...byName.values()];
  console.log(`대상 플레이어 합집합: ${targets.length}명`);

  const players = new Array(targets.length);
  let done = 0;
  let totalGames = 0;
  let failed = 0;
  const startedAt = Date.now();
  await pool(targets, concurrency, async (t, i) => {
    try {
      const { records, truncated, pages } = await userHistories(t.nickname, cutoffMs);
      const nightmare = records.filter((r) => r.difficulty === '악몽');
      totalGames += nightmare.length;
      const entry = { ...t, gameCount: nightmare.length, otherDifficultyCount: records.length - nightmare.length, records: nightmare };
      if (truncated) {
        entry.truncated = true;
        console.warn(`  경고: ${t.nickname} 기록이 페이지 상한(${MAX_PAGES_PER_USER})에서 절단됨`);
      }
      entry.pages = pages;
      players[i] = entry;
    } catch (e) {
      failed += 1;
      players[i] = { ...t, gameCount: 0, records: [], error: String(e.message || e) };
    }
    done += 1;
    if (done % 100 === 0 || done === targets.length) {
      const secs = (Date.now() - startedAt) / 1000;
      const rate = done / Math.max(1, secs);
      const eta = Math.round((targets.length - done) / Math.max(0.001, rate));
      console.log(`  [${done}/${targets.length}] 누계 ${totalGames}판, 실패 ${failed}, 요청 ${requestCount}, ${secs.toFixed(0)}s 경과, ETA ${eta}s`);
    }
  });

  const payload = {
    schema: 'tmo-nightmare-all-v1',
    collectedAt: new Date().toISOString(),
    rankId: RANK_ID,
    categoryId: CATEGORY,
    cutoff,
    scope: '월간 악몽 랭킹 전수(상위 N 자르기 없음) — 컷오프 이후 클리어자 모집단',
    pools: { seasons: seasonPools, seasonClears, seasonTruncated, cumulativeTop: cumulative.length },
    caveats: [
      '클리어된 판만 기록됨(실패 판 없음) — 생존 편향',
      'unitCount = 클리어 후 남은 유닛 수(사용자 확인 정의)',
      '파티는 최종 보유 유닛이며 판 중간의 패·판단 이력은 없음',
      '수집 중 닉네임을 바꾼 계정은 랭킹 표기와 histories 조회가 어긋날 수 있음',
    ],
    playerCount: players.filter((p) => p && !p.error).length,
    failedPlayerCount: failed,
    truncatedPlayerCount: players.filter((p) => p && p.truncated).length,
    totalGames,
    requestCount,
    retryCount,
    players,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const body = JSON.stringify(payload);
  fs.writeFileSync(out, /\.gz$/.test(out) ? zlib.gzipSync(body, { level: 6 }) : body);
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
  console.log(`저장: ${out} (${mb}MB, ${payload.playerCount}명 ${totalGames}판, 요청 ${requestCount}회/재시도 ${retryCount}회)`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
module.exports = { seasonsSince, compactRecord };
