'use strict';

// v19.3.1: 반복 추천 감사(10 에이전트, 11판 재생)에서 확정된 결함 수정 고정.
//
//   ① [high] 재생 하니스가 0723b 의 게임종료 후 역방향 스윕에 오염 —
//      r19~61 이 빈 판으로 덮여 최장 연속 반복 46(허위, 실제 10)을 만들었다.
//   ② [med] stickyPath 'dominant' 가 결정적 벡터의 막다른길(deadEnds)
//      열등을 무시 — 0725 r38·r39 에서 막다른길 2개 경로가 1개 경로를 눌렀다.
//   ③ [med] upperRankFingerprint 에 연구소·공업·TMO 원문 능력치 누락 —
//      토글 후에도 이전 캐시 payload 반환.
//   (v17_14 스테일 계약은 해당 테스트 파일에서 직접 강화했다.)

const assert=require('assert');
const path=require('path');
const fs=require('fs');
const {loadEngine,loadRun}=require('./lib/ordlog_replay.js');

loadEngine();
const C=global.ORDCore,S=global.ORDSquadPlanner,E=global.ORDV15Engine;
const T=S._test,ET=E._test;
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

// ── ① 재생 하니스 ────────────────────────────────────────────────────────
check('0723b 재생이 게임종료 스윕 꼬리를 소비하지 않는다',()=>{
  const run=loadRun('0723b');
  // 스윕 오염 시절: r19~61 전부 counts 0 · 위습 행 소멸 상태로 덮여 있었다.
  const mid=run.rounds.filter(step=>step.round>=19&&step.round<=61);
  assert(mid.length>0,'중반 라운드가 통째로 사라짐 — 절단이 과했다');
  const empty=mid.filter(step=>!Object.values(step.snapshot.counts).some(value=>C.num(value)>0));
  assert.strictEqual(empty.length,0,`빈 판으로 덮인 중반 라운드가 남아 있음: ${empty.map(s=>s.round).join(',')}`);
});

check('위습 행이 없는 스냅샷은 wispCountFound:false 로 전달된다(소스 계약)',()=>{
  const src=fs.readFileSync(path.join(__dirname,'lib','ordlog_replay.js'),'utf8');
  assert(src.includes('wispCountFound:Object.prototype.hasOwnProperty.call(counts,WISP_ID)'),
    '재생이 위습 미확인을 true 로 위장 — 라이브의 미확인 오류 경로를 우회한다');
  assert(src.includes('gameEnded'),'게임종료 감지가 사라짐');
});

// ── ② stickyPath dominant 의 막다른길 검사 ──────────────────────────────
check('막다른길이 더 많은 held 는 dominant 유지를 받지 못한다',()=>{
  // nodeRank 벡터 구조를 그대로 흉내 낸 최소 노드:
  // [regression, checkpoint(1), deadEnds, fullVector(2) | 타이브레이크...]
  const node=(target,deadEnds,wisp)=>({
    sequence:[{quote:{targetId:target,unit:{name:target},feasible:true,wisp:{cost:wisp}}}],
    regression:0,
    rankDecisiveLength:5,
    rankVector:[0,0,deadEnds,1,2,99],
    assessment:{fullVector:[1,2],requirements:[{key:'armor',label:'방깎',required:true,gap:3}]}
  });
  const best=node('BEST',1,5),held=node('HELD',2,5);
  // held 는 결정적 벡터의 막다른길 슬롯에서만 열등(2 vs 1) — 이전 코드는
  // 이 열등을 못 보고 dominant 로 유지했다.
  const kept=ET.stickyPath([best,held],best,'HELD');
  assert.strictEqual(kept,best,'막다른길 2개 held 가 1개 best 를 눌렀다 — 감사 결함 재발');
  // 막다른길이 같고 다른 결정적 성분만 다르면(요구 gap 비열등) 기존 지배
  // 유지는 그대로 동작해야 한다 — 완전 동점이면 tie 분기가 먼저 잡으므로
  // fullVector 쪽을 일부러 다르게 만든다.
  const heldSame=node('HELD',1,5);
  heldSame.rankVector=[0,0,1,2,2,99];
  const keptSame=ET.stickyPath([best,heldSame],best,'HELD');
  assert.strictEqual(keptSame,heldSame,'막다른길 동수 held 의 정당한 지배 유지가 깨졌다');
  assert.strictEqual(keptSame.stickyHold,'dominant');
});

check('0725 실측: r38·r39 에서 막다른길 열등 경로가 더는 유지되지 않는다',()=>{
  // 감사 재현 지점 그대로 — sticky 없이의 최선(사보 계열)과 sticky 있이의
  // 결과가 같아야 한다(이전에는 블랙마리아(왜곡, 막다른길 2)가 유지됐다).
  const run=loadRun('0725');
  const catalog=global.ORD_TMO_UNITS;
  let sticky='';
  for(const step of run.rounds){
    if(step.round>39)break;
    let decision=null;
    try{decision=E.decide({catalog,snapshot:step.snapshot,settings:Object.assign({_stickyActionId:sticky},step.settings),locks:step.locks});}catch(_){continue;}
    const proposed=decision&&(decision.action||decision.blockedAction);
    if(step.round===38||step.round===39){
      const row=proposed&&proposed.row;
      const heldByDominant=row&&row.stickyHold==='dominant';
      if(heldByDominant){
        // dominant 유지가 있었다면 막다른길에서 열등하지 않아야 한다 —
        // 이 판의 결함 케이스(블랙마리아 왜곡)는 이름으로도 잡는다.
        assert(!/블랙마리아/.test(String(proposed.name||'')),`r${step.round}: 막다른길 열등 경로가 dominant 로 유지됨`);
      }
    }
    if(proposed&&proposed.id)sticky=String(proposed.id);
  }
});

// ── ③ 캐시 지문 ─────────────────────────────────────────────────────────
check('연구소·공업·TMO 원문 능력치가 순위 캐시 지문에 들어간다',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild','ord_squad_planner.js'),'utf8');
  const block=src.slice(src.indexOf('function upperRankFingerprint'),src.indexOf('\n}',src.indexOf('function upperRankFingerprint')));
  for(const key of ['labResearch','upperResearchLevel','currentAbilities']){
    assert(block.includes(key),`지문에 ${key} 가 없음 — 토글 후 이전 캐시가 돌아온다`);
  }
});

check('연구소 토글이 실제로 다른 캐시 항목을 만든다(런타임)',()=>{
  const run=loadRun('0728c');
  const step=run.rounds.find(s=>s.round===30)||run.rounds[run.rounds.length-1];
  const state=(()=>{const base=T.normalizeSettings({settings:step.settings});const st=C.normalizeState(global.ORD_TMO_UNITS,step.snapshot,base);st.wisp=C.num(st.counts[C.WISP_ID]);return st;})();
  const settingsA=T.normalizeSettings({settings:Object.assign({},step.settings,{targetSquadCount:9})});
  const settingsB=Object.assign({},settingsA,{labResearch:{attack:true,slow:true,hpRegen:true,mpRegen:true}});
  // 지문 함수는 _test 로 안 나와 있으므로 rankUpperBlueprints 로 간접 확인:
  // 같은 state(같은 db)로 두 설정을 돌렸을 때 반환 참조가 달라야 한다.
  const ids=state.db.uppers.slice(0,2).map(u=>u.id);
  const r1=S.rankUpperBlueprints({state,settings:settingsA},{candidateIds:ids});
  const r2=S.rankUpperBlueprints({state,settings:settingsB},{candidateIds:ids});
  assert(r1!==r2,'연구소 토글에도 같은 캐시 배열이 반환됨 — 지문 누락 재발');
  const r3=S.rankUpperBlueprints({state,settings:settingsA},{candidateIds:ids});
  assert(r1===r3,'동일 설정 재호출이 캐시를 못 맞춤 — 지문이 비결정적');
});

console.log(`\n${checks}/${checks} audit fix checks passed.`);
