'use strict';

// v23.6.0 계약 — 사용자 지시(0818): "그럼 리스크헷지 기준으로 리롤 추천
// 더 적극적으로 해줘."
//
// 계약: ① navProfile.aggressiveReroll — 리롤이 싼 항법만 참(리스크헷지
//        목재 0 · 카지노 4회).  기본 도박광(3회·목재 2)·연속베팅(2회)·
//        타 계열은 거짓.  참이면 설정 노트에 '적극 리롤 권장 모드'.
//      ② 희귀 원장 개방 라운드 — 적극 모드 + 상위 확정이면 18라,
//        아니면 종전 25라 유지 (v151ProtectRareDecision 소스 계약)
//      ③ 막판 소진 독촉 — 적극 모드에서 40라 이후 리롤이 남아 있으면
//        잔여 칩이 경고 톤으로 '막판 소진 권장' (소스 계약)
//      ④ 리롤 권장 힌트 — 목재 0 항법이면 '아끼지 마세요' 강조 (소스 계약)

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore;

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① aggressiveReroll — 리스크헷지·카지노만 참',()=>{
  const hedge=C.navProfile('gambler','hedge');
  assert.strictEqual(hedge.aggressiveReroll,true,'리스크헷지는 적극 모드여야');
  assert.strictEqual(hedge.rerollMax,5);assert.strictEqual(hedge.rerollWood,0);
  assert(hedge.notes.some(note=>note.includes('적극 리롤')),'리스크헷지 설정 노트 부재');
  assert.strictEqual(C.navProfile('gambler','casino').aggressiveReroll,true,'카지노(4회)는 적극 모드여야');
  assert.strictEqual(C.navProfile('gambler','').aggressiveReroll,false,'기본 도박광(3회·목재 2)은 아님');
  assert.strictEqual(C.navProfile('gambler','betting').aggressiveReroll,false,'연속베팅(2회)은 아님');
  assert.strictEqual(C.navProfile('none','').aggressiveReroll,false);
  assert.strictEqual(C.navProfile('union','trait').aggressiveReroll,false);
});

test('②③④ 앱 배선 — 원장 18라 개방·막판 소진 독촉·힌트 강조 (소스 계약)',()=>{
  const app=read('ord_app.js');
  // v24.3 재핀: 적극 18라 게이트는 "확정 즉시 개방"에 흡수됐다 — 적극
  // 항법의 몫은 weakDestOnly(계획 밖 사용처 리롤 허용)로 계속 산다.
  assert(app.includes('rerollGateRound=this.upperLock()?0:25'),'원장 개방 로직 부재(확정 즉시/미확정 25라)');
  assert(app.includes('this.actualRound()>=rerollGateRound'),'원장 개방이 gateRound 를 안 쓴다');
  assert(app.includes('라 전 리롤 잠금 · 사용처 재계산')&&app.includes('${rerollGateRound}라 전 리롤 잠금'),'잠금 사유 문구가 개방 라운드를 안 따라간다');
  assert(app.includes('막판 소진 권장 — 아끼지 마세요'),'막판 소진 독촉 문구 부재');
  assert(app.includes('aggressiveReroll&&rerollLeft>0&&this.actualRound()>=40'),'막판 독촉 조건(적극·잔여·40라) 부재');
  assert(app.includes("rerollWood===0?' · 목재 0 — 아끼지 마세요'"),'리롤 권장 힌트의 목재 0 강조 부재');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_6_0_AGGRESSIVE_REROLL ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);