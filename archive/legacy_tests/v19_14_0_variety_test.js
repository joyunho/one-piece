'use strict';
// v19.14.0 계약 — 상위 추천 다양성 (사용자: "추천이 좀 더 다양했으면").
//
// 손패 적합(eta·마감 계수)이 같은 급이면 메타·전투력 동률이 판마다 같은
// 얼굴을 1순위로 밀었다.  최근 판에 쓴 메인 상위는 후보 카드에서 순위를
// 뒤로 물린다 — 빼지 않고 배지와 함께 내리며, 신선한 후보가 없으면
// 원순위 유지.  이번 판에서 확정한 자기 자신은 감점 대상이 아니다.
const assert=require('assert'),fs=require('fs'),path=require('path');
const lib=require('./lib/ordlog_replay.js');
const EXT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

const engine=lib.loadEngine();
const catalog=global.ORD_TMO_UNITS;
const C=global.ORDCore;
const run=lib.loadRun('0804L');
const step=run.rounds.find(item=>item.round===25);
const decideWith=recent=>engine.decide({catalog,snapshot:step.snapshot,settings:Object.assign({},step.settings,{recentMainUppers:recent}),locks:[]});

check('① 최근 판 메인 감점 — 0804L 25라 재현 (빅맘 1순위 → 뒤로)',()=>{
  const before=decideWith([]);
  const beforeRows=before.routeCandidates||[];
  assert(beforeRows.length>=4,'후보가 모자람');
  const topKey=String(C.canonicalUpperId(beforeRows[0].id));
  const after=decideWith([topKey]);
  const afterRows=after.routeCandidates||[];
  assert.notStrictEqual(String(C.canonicalUpperId(afterRows[0].id)),topKey,'최근 사용 메인이 여전히 1순위');
  const demoted=afterRows.find(row=>String(C.canonicalUpperId(row.id))===topKey);
  assert(demoted,'감점 후보가 카드에서 사라짐 — 빼지 않고 내려야 한다');
  assert(demoted.recentUse&&demoted.recentUse.gamesAgo===1,'recentUse 배지 데이터 없음');
  assert(afterRows.indexOf(demoted)>afterRows.length-3,'감점 후보가 충분히 뒤로 가지 않음');
});

check('② 안전선 — 신선한 후보가 없으면 원순위 유지 + 확정 자신 제외',()=>{
  const before=decideWith([]);
  const allKeys=[...new Set((before.routeCandidates||[]).map(row=>String(C.canonicalUpperId(row.id))))];
  // 전부 최근 사용으로 칠하면(상한 3이라 상위 3만) fresh 가 남는 한 재배열,
  // 전혀 없으면 원순위 — 엔진 가드가 splice 를 건너뛴다는 정적 핀으로 잰다.
  const src=read('ord_v15_engine.js');
  assert(src.includes('if(fresh.length&&used.length)picked.splice'),'신선 후보 없음 가드 없음');
  assert(src.includes('recentKeys.length&&!lock'),'확정 상태 감점 금지 가드 없음');
  const app=read('ord_app.js');
  assert(app.includes('v1914RecentMains'),'설정 배선 없음');
  assert(app.includes('key!==currentKey'),'이번 판 확정 메인 제외 없음');
  assert(app.includes('판 전 메인 — 다양성 위해 순위 뒤로'),'카드 배지 없음');
  assert(allKeys.length>=2,'재현 판 후보 다양성 부족');
});

console.log(`\n${checks} checks passed (v19.14.0 상위 다양성)`);
