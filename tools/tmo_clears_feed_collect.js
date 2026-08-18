#!/usr/bin/env node
// TMO.GG 실시간 클리어 피드(/ranks/ordr2/clears) 수집기.
//
// tmo_nightmare_collect_all.js(월간 랭킹→유저별 histories 전수)와 달리 이
// 엔드포인트는 사이트 /clear 화면이 쓰는 최신순 피드다: 전 난이도(악몽·
// 지옥·신)가 섞여 오고, 판별 최종 유닛 구성·난이도·categoryScores 를 담는다.
// 페이지네이션은 ?next=<ISO 커서>(nextCursor 필드) — 20건/페이지.
//
// ⚠ 실측 주의(2026-08-18): 익명 클라이언트로 약 1,700페이지(3만여 건)를
// 연속 순회하자 이후 페이지네이션 요청이 HTTP 401 로 차단됐다(첫 페이지는
// 계속 허용). 대량 백필은 이 피드가 아니라 histories 수집기를 쓰고, 이
// 스크립트는 며칠 단위 증분 수집에만 쓸 것.  중단 시 표준에러에 재개
// 커서가 남고, 출력은 JSONL 증분(append)이라 유실되지 않는다.
//
// 사용: node tools/tmo_clears_feed_collect.js <cutoffISO> <out.jsonl> [startCursor]
'use strict';
const fs = require('fs');
const CUTOFF = process.argv[2];
const OUT = process.argv[3];
const START = process.argv[4] || null;
if (!CUTOFF || !OUT) { console.error('사용: tmo_clears_feed_collect.js <cutoffISO> <out.jsonl> [startCursor]'); process.exit(1); }
const MAX_PAGES = 4000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {headers: {accept: 'application/json'}});
      if (res.status === 401 || res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' (영구)');
      return await res.json();
    } catch (e) {
      if (/영구/.test(String(e.message)) || attempt >= 9) throw e;
      const wait = Math.min(120000, 2000 * 2 ** attempt);
      console.error(`재시도 ${attempt + 1} (${e.message}) — ${Math.round(wait / 1000)}s 대기`);
      await sleep(wait);
    }
  }
}

(async () => {
  const cutoffMs = Date.parse(CUTOFF);
  let cursor = START, pages = 0, count = 0, done = false;
  const stream = fs.createWriteStream(OUT, {flags: 'a'});
  try {
    while (!done && pages < MAX_PAGES) {
      const url = 'https://api.tmo.gg/ranks/ordr2/clears' + (cursor ? '?next=' + encodeURIComponent(cursor) : '');
      const j = await getJson(url);
      const rows = j.clears || [];
      if (!rows.length) break;
      for (const c of rows) {
        if (Date.parse(c.createdAt) < cutoffMs) { done = true; break; }
        stream.write(JSON.stringify(c) + '\n'); count++;
      }
      cursor = j.nextCursor || null;
      if (!cursor) break;
      pages += 1;
      if (pages % 50 === 0) console.error(`...${pages}p ${count}건 (커서 ${cursor})`);
      await sleep(200);
    }
    console.log(`완료: ${count}건 추가 (${pages}p, 마지막 커서 ${cursor})`);
  } catch (e) {
    console.error(`중단: ${e.message} — ${count}건은 저장됨, 재개 커서: ${cursor}`);
    process.exitCode = 2;
  } finally { stream.end(); }
})();
