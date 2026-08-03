'use strict';
// v19.10.0(외부 점검 §11): 원시 랭킹 수집 파일의 개인 식별자 제거.
//
// 공개 랭킹에서 수집한 값이라도 배포본에 userId·nickname 원문을 실을
// 이유가 없다 — 실행에 쓰이는 것은 records(판 기록)뿐이다
// (tools/build_meta_stats.js 는 p.error 와 p.records 만 읽는다).
//
// v19.10 검증 수리(적대 검증이 잡은 누수 3종):
//  · error 문자열 속 요청 URL(/users/<닉네임>/)에 실명이 남던 것 → URL
//    경로를 마스킹한다(한글 닉네임의 %-인코딩 포함: /users/ 뒤 전부 치환).
//  · tmo_profile_* 파일의 player 필드가 대상에서 빠져 있던 것 → 포함.
//  · 이미 마스킹된 파일을 다시 돌려도 '치환 n건'을 보고하던 것 → 값이
//    실제로 바뀔 때만 세고, 바이트가 같으면 쓰지 않는다(수렴 보고).
// 쓰기는 tmp+rename — 기록 중 중단돼도 원본이 파손되지 않는다.
//
// 사용: node tools/anonymize_raw_rankings.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA = path.resolve(__dirname, '..', 'data');
const MASKED_URL = /(\/users\/)[^/]+(\/)/g;

function scrubErrorText(text, mask) {
  return String(text).replace(MASKED_URL, `$1${mask}$2`);
}

function anonymizePlayers(players) {
  let changed = 0;
  (players || []).forEach((player, index) => {
    if (!player || typeof player !== 'object') return;
    const mask = 'player-' + String(index + 1).padStart(3, '0');
    if ('userId' in player && player.userId !== index + 1) { player.userId = index + 1; changed += 1; }
    if ('nickname' in player && player.nickname !== mask) { player.nickname = mask; changed += 1; }
    if (typeof player.error === 'string' && MASKED_URL.test(player.error)) {
      const scrubbed = scrubErrorText(player.error, mask);
      MASKED_URL.lastIndex = 0;
      if (scrubbed !== player.error) { player.error = scrubbed; changed += 1; }
    }
  });
  return changed;
}

// players 배열이 없는 요약·프로필 파일: 알려진 식별자 키를 재귀로 마스킹.
function scrubTree(node, counter) {
  if (Array.isArray(node)) { node.forEach(item => scrubTree(item, counter)); return; }
  if (!node || typeof node !== 'object') return;
  for (const key of ['nickname', 'player']) {
    if (typeof node[key] === 'string' && node[key] && node[key] !== 'player') { node[key] = 'player'; counter.changed += 1; }
  }
  if ('userId' in node && node.userId !== 0) { node.userId = 0; counter.changed += 1; }
  if (typeof node.error === 'string' && MASKED_URL.test(node.error)) {
    const scrubbed = scrubErrorText(node.error, 'player');
    MASKED_URL.lastIndex = 0;
    if (scrubbed !== node.error) { node.error = scrubbed; counter.changed += 1; }
  }
  for (const value of Object.values(node)) scrubTree(value, counter);
}

function safeWrite(file, buffer) {
  const tmp = file + '.tmp-anon';
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, file);
}

let total = 0;
for (const name of fs.readdirSync(DATA)) {
  if (!/^tmo_(api_histories|nightmare_all|nightmare_stats|profile)_.*\.json(\.gz)?$/.test(name)) continue;
  const file = path.join(DATA, name);
  const gz = /\.gz$/.test(name);
  const original = fs.readFileSync(file);
  const payload = JSON.parse(gz ? zlib.gunzipSync(original) : original);
  let changed = 0;
  if (Array.isArray(payload.players)) changed += anonymizePlayers(payload.players);
  else { const counter = {changed: 0}; scrubTree(payload, counter); changed += counter.changed; }
  if (changed > 0) {
    const text = JSON.stringify(payload);
    safeWrite(file, gz ? zlib.gzipSync(text, {level: 9}) : Buffer.from(text));
  }
  console.log(`${name}: 식별자 ${changed}건 치환`);
  total += changed;
}
console.log(total ? `총 ${total}건 익명화 완료` : '치환할 식별자 없음 (수렴)');
