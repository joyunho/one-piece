'use strict';
// v21.5.0 계약 — 전략 구상 ③ 암브 배선 + 희귀 사용 계획.
//
//  ① 암브(아머브레이크) 스택은 방깎 판정에 75 전액이 아니라 포화 모델
//     armorBreakStacks(w)=75×(1−0.5^w) 로 들어간다 — 유닛이 많을수록
//     빨리 쌓인다는 사용자 실측("유닛 수에 따라 올라가는 속도가 달라져")
//     의 정착 상태 근사.  1기 38 · 2기 56 · 3기 66, 75에는 영원히 미달.
//     이 모델은 표시용으로만 있었고 판정에는 0으로 계산되고 있었다.
//  ② 상위 확정 후 남는 희귀 탭이 희귀별 사용 계획(목적지/보류/리롤)을
//     목록으로 승격한다 — "어떤 희귀 2개로 이걸 만들고 … 활용 못할
//     희귀는 리롤로 추천".
const assert=require('assert'),fs=require('fs'),path=require('path');
const lib=require('./lib/ordlog_replay.js');
const EXT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

lib.loadEngine();
const C=global.ORDCore;

check('① 암브 포화 곡선이 방깎 판정에 들어간다 (75 전액 금지)',()=>{
  const armorAt=n=>{
    const spec={mode:'physical',main:1,armor:100,triggerArmor:0,armorBreak:n,stun:0.7,slow:102,boss:2,frenzy:2};
    return (C.deficits(spec,'physical',{gorosei:'none'}).requirements||[]).find(r=>r.key==='armor').current;
  };
  assert.strictEqual(armorAt(0),100,'암브 0인데 기여가 생김');
  assert.strictEqual(armorAt(1),138,'암브 1기 포화 기여(38)가 아님');
  assert.strictEqual(armorAt(2),156,'암브 2기 포화 기여(56)가 아님');
  assert(armorAt(4)<175,'암브 4기가 75 전액에 근접 — 포화 모델이 풀림');
  // 발동방깎 65% 할인(기존)과 상시는 그대로다.
  const src=fs.readFileSync(path.join(EXT,'ord_core.js'),'utf8');
  assert(src.includes('triggerArmor*.65'),'발동방깎 65% 할인 소실');
  assert(src.includes('armorBreakCredit=armorBreakStacks(num(spec.armorBreak))'),'암브 포화 배선 소실');
});

check('② 희귀 사용 계획 목록 — 목적지·보류·리롤 승격',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes('v215-rare-plan'),'사용 계획 블록 없음');
  assert(app.includes('희귀 사용 계획 — 전량 활용, 남는 것만 리롤'),'계획 머리말 없음');
  assert(app.includes("isReroll?'리롤 추천'"),'리롤 추천 표기 없음');
  const css=fs.readFileSync(path.join(EXT,'ord_ui_v20.css'),'utf8');
  assert(css.includes('.v215-plan-row.reroll>i'),'리롤 행 스타일 없음');
});

console.log(`\n${checks} checks passed (v21.5.0 — 암브 배선 · 희귀 계획)`);
