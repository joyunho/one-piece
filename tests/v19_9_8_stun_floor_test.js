'use strict';
// v19.9.8 계약 — 스턴 하드 최소선 0.5 → 0.7 상향.
//
// 사용자 실측(0802 판 직후): "아오키지 원스턴은 불가능한듯, 적어도 0.7은
// 잡혀야 스턴이 잡히는 느낌이야. 이것도 최소라 새긴 하는데."
// 0802 판은 스턴 0.51~0.61(아오키지 단독)로 단끝에서 새서 죽었다 —
// 0.5 최소선은 '충족'으로 보였지만 실전에서는 그물이 아니었다.
// 최소선을 0.7 로 올리되, 0.7 도 '조금은 새는' 최소선이며 완성 목표는
// 그대로 1.5 다(v19.9.7: 어느 모드에서도 해제 없음).
const assert=require('assert'),path=require('path');
const R=require('./lib/ordlog_replay.js');
R.loadEngine();
const C=global.ORDCore;
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

check('① 상수 — STUN_BASE_FLOOR 0.7 이 코어에 하나로 존재하고 수출된다',()=>{
  assert.strictEqual(C.STUN_BASE_FLOOR,.7,'스턴 최소선 상수가 0.7이 아니다');
  assert.strictEqual(C.CONTROL_ENVELOPE.physicalExpertStun,.7,'제어 프로파일 하드 최소선 미상향');
  assert.strictEqual(C.CONTROL_PROFILES.physical.operational.expertStun,.7,'물딜 운영 프로파일 expertStun 미상향');
});

check('② 세 경로 전부 — stunBase 목표 0.7, 0.51 보드는 열린 결손',()=>{
  const spec=extra=>Object.assign({source:'test',main:2,stun:.51,slow:200,triggerSlow:0,armor:210,triggerArmor:0,boss:2,frenzy:2,toki:1,single:2,end:1,singleEnd:3,singleEndUnits:3,singleEndExpected:3,singleEndMax:3,singleEndLargest:1,singleEndStable:3,magicDef:0,magicAmp:0,explosionAmp:0},extra);
  for(const[mode,route]of[['physical','physical'],['magic','dual'],['magic','singleEnd']]){
    const settings={mode,magicRoute:route==='physical'?'':route,_resolvedMagicRoute:route==='physical'?'':route,manualCounts:{}};
    const def=C.deficits(spec({mode}),mode,settings);
    const row=def.requirements.find(r=>r.key==='stunBase');
    assert.strictEqual(row.target,.7,`${route}: stunBase 목표가 ${row.target}`);
    assert.strictEqual(row.label,'최소 0.7 스턴',`${route}: 라벨이 '${row.label}'`);
    assert(row.required!==false,`${route}: stunBase 가 필수가 아니다`);
    // 0802 사망 보드 수준(0.51)은 이제 최소선 미달로 화면에 남는다.
    const open=def.clearRows.find(r=>r.key==='stunBase');
    assert(open&&C.num(open.gap)>0,`${route}: 스턴 0.51 이 최소선을 통과했다`);
    // 아오키지 단독(0.506)도 마찬가지다 — 이 판의 교훈 그 자체.
    const aokiji=C.deficits(spec({mode,stun:.506}),mode,settings);
    assert(aokiji.clearRows.some(r=>r.key==='stunBase'),`${route}: 아오키지 단독이 최소선을 통과했다`);
    // 0.7 이면 최소선은 닫히고 1.5(stunFull)만 남는다.
    const atFloor=C.deficits(spec({mode,stun:.7}),mode,settings);
    assert(!atFloor.clearRows.some(r=>r.key==='stunBase'),`${route}: 0.7 이 최소선을 못 닫는다`);
    assert(atFloor.clearRows.some(r=>r.key==='stunFull'&&r.required),`${route}: 0.7 에서 1.5 필수가 사라졌다`);
  }
});

check('③ 0802 재생 — 죽기 전 라운드에서 최소선 결손이 화면에 남는다',()=>{
  const run=R.loadRun('0802L');
  const late=run.rounds.filter(step=>step.round>=50&&step.round<=60&&step.settings.mode==='magic');
  assert(late.length>=5,`50~60라 마딜 라운드가 ${late.length}개뿐이다`);
  for(const step of late){
    const settings=Object.assign({},step.settings,{manualCounts:{},magicRoute:'singleEnd',_resolvedMagicRoute:'singleEnd'});
    const ns=C.normalizeState(global.ORD_TMO_UNITS,step.snapshot,settings);
    const spec=C.currentSpec(ns,'magic',settings);
    const def=C.deficits(spec,'magic',settings);
    assert(def.clearRows.some(r=>r.key==='stunBase'&&C.num(r.gap)>0),
      `r${step.round}: 스턴 ${spec.stun} 인데 최소선 결손이 안 보인다`);
  }
});

check('④ 역할 기여 — 유닛별 stunBase 기여 상한도 0.7 로 올라간다',()=>{
  // 시키(1스턴) 한 기가 최소선을 혼자 닫을 수 있어야 한다 — 예전 캡 0.5 는
  // 1스턴 유닛의 기여를 최소선보다 낮게 잘랐다.
  const shiki=(global.ORD_TMO_UNITS||[]).find(u=>String(u.id)==='930h');
  assert(shiki,'시키(930h)가 카탈로그에 없다');
  const contribution=C.roleContribution(shiki,'physical');
  assert(C.num(contribution.stunBase)>=.7-1e-9,`시키 stunBase 기여가 ${contribution.stunBase} — 0.7 캡 미적용`);
});

console.log(`\n${checks} checks passed (v19.9.8 스턴 최소선 0.7)`);
