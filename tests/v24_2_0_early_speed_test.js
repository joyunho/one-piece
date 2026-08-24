'use strict';

// v24.2.0 계약 — 초반 속도 규칙 + 특별함발 고선위 희귀 봉합 (사용자 0824).
//
// 사용자: "처음 특별함 적용하면 제대로 지금 할일이 반영이 안되는 것 같아
// 모몬가가 바로 만들어지는데 자꾸 크로커다일 선위 4개쓰고 먹으라고 하네
// 그냥 스토리고 뭐고 초반 희귀함 전설은 빨리 만들어지는데로 근데 전설은
// 스토리랭킹 적어도 d이상으로 해줘"
//
// 규명: 152 특별함으로 크로커다일(이감5·A10h)을 고르면 이감 희귀
// 크로커다일(H20h)이 최저가 이감 필러가 되고, v22.3 이감 게이트가 선위
// 상한 없이 그를 후보로 올렸다 — 선위 4개 요구.  동시에 첫 픽에는
// 스토리 프리미엄(+2/+5 선위 투자)이 남아 있었다.
//
// ① 이감 필러 희귀 = 현재 패 선위 2 이하만 후보(v22.5 원문 일반화).
//    특별함으로 싸져도 2 초과면 제외 — 재료가 모이면 복귀.
// ② 첫 희귀·첫 전설 = 순수 최저 선위(스토리 프리미엄 은퇴).  152 특별함
//    적용이 첫 희귀 픽을 바꾸지 못한다(모몬가 시나리오 재현).
// ③ 전설 스토리 D 이상: 첫 전설에서 리그 E·F 제외(v23.8 필터)는 유지.
// ④ 국면 패널·토스트 문구가 은퇴한 프리미엄을 약속하지 않는다.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const appSrc=read('ord_app.js'),engineSrc=read('ord_v15_engine.js');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,engine=context.ORDV15Engine;
const cat=context.ORD_TMO_UNITS,db=C.buildDb(cat);
// 사용자 시나리오 고정 유닛: 모몬가(희귀 S, Y10h) · 크로커다일 특별(A10h) ·
// 크로커다일 희귀(이감15, H20h).
const MOMONGA='Y10h',CROC_SPECIAL='A10h',CROC_RARE='H20h';
// 모몬가 완제 재료(빈손 solve 정본).
const MOMONGA_HAND={'300h':1,'900h':3,'600h':4,'500h':1,'200h':2,'800h':1,'400h':1,'K00h':1,'A00h':1,'D00h':1,'E00h':1,'810h':1,'I10h':1,'F10h':1};
const mk=(counts,wisp,extra)=>({catalog:cat,snapshot:{source:'v242',counts:Object.assign({[C.WISP_ID]:wisp},counts),wispCountFound:true,wispCount:wisp,currentAbilities:{}},settings:Object.assign({currentRound:5,mode:'',magicRoute:'auto',manualCounts:{},gorosei:'none',superKumaOwned:true},extra||{}),locks:[]});

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① 이감 필러 상한 — 특별함 패의 크로커다일(선위 2 초과)은 후보 밖, 재료가 모이면 복귀',()=>{
  const model={knowledge:{db},round:{value:20},settings:{},effective:{counts:{}}};
  const route={mode:'physical'};
  const rows={requirements:[{key:'slow',required:true,waived:false,gap:50}]};
  const specialOnly={[CROC_SPECIAL]:1,'700h':2,'300h':1};
  assert(C.num(C.recipeSolve(db,CROC_RARE,specialOnly).wispCost)>2,'픽스처 무효 — 특별함 패 크로커다일이 이미 2선위 이하');
  const capped=engine._test.combatRareCandidates(model,route,rows,specialOnly);
  assert(!capped.some(u=>u.id===CROC_RARE),'선위 2 초과 크로커다일이 필러 후보에 남음(사용자 버그 재발)');
  const rich={[CROC_SPECIAL]:1,'810h':1,'410h':1,'700h':3,'300h':2,'500h':2,'900h':1,'600h':2,'400h':2,'200h':1,'100h':2,'L00h':1,'N00h':1,'K00h':1,'A00h':1,'I00h':1,'O00h':1};
  assert(C.num(C.recipeSolve(db,CROC_RARE,rich).wispCost)<=2,'픽스처 무효 — 풍족 패 크로커다일이 2선위 초과');
  assert(engine._test.combatRareCandidates(model,route,rows,rich).some(u=>u.id===CROC_RARE),'상한 안 크로커다일이 복귀하지 않음');
});

test('② 첫 희귀 — 특별함을 적용해도 즉시 제작(모몬가 0선위)이 흔들리지 않는다',()=>{
  for(const virtual of ['',CROC_SPECIAL]){
    const d=engine.decide(mk(MOMONGA_HAND,5,{virtualSpecialId:virtual}));
    const pick=d.action||d.blockedAction;
    assert.strictEqual(d.evidence&&d.evidence.completionMilestone,'firstRare','첫 희귀 국면이 아님');
    assert.strictEqual(pick&&pick.id,MOMONGA,`특별함(${virtual||'없음'}) 상태 픽이 모몬가가 아님: ${pick&&pick.name}(${pick&&pick.wispCost}선위)`);
    assert.strictEqual(C.num(pick.wispCost),0,'모몬가가 0선위 즉시 제작이 아님');
    assert(!(d.evidence&&d.evidence.storyPremium),'은퇴한 스토리 프리미엄 발동');
  }
});

test('③ 전설 D 이상 — 첫 전설 리그 E·F 제외 유지 + 은퇴 배선 부재',()=>{
  assert(engineSrc.includes('firstFinalStoryTooSlow'),'첫 전설 D 미만 제외 필터 소실');
  assert(engineSrc.includes("/^[EF]$/"),'E·F 제외 판정 소실');
  assert(!engineSrc.includes('premiumBudget'),'은퇴한 프리미엄 예산이 남아 있다');
  assert(engineSrc.includes('fillerAffordable'),'필러 선위 상한 배선 소실');
});

test('④ 문구 — 국면 패널·복원 토스트가 선위 투자를 약속하지 않는다',()=>{
  for(const gone of ['S급이 최대 5선위 안이면 투자','스토리 S급이면 최대 2선위까지 투자','S급 프리미엄(희귀 2·전설 5 상한)을 다시 적용'])assert(!appSrc.includes(gone),`은퇴한 프리미엄 문구: ${gone}`);
  assert(appSrc.includes('빨리 만들어지는 순(스토리 D 미만 제외)'),'새 규칙 문구(첫 전설) 부재');
  assert(appSrc.includes('선위 추가 투자는 없습니다'),'복원 토스트 새 문구 부재');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V24_2_0_EARLY_SPEED ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
