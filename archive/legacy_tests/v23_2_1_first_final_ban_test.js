'use strict';

// v23.2.1 계약 — 사용자 규칙: "첫전설 레베카(히든), 킬러(히든) 추천 금지".
//
// 근거: 0812 로그 r14 veto(T30h·540h ...) · 0816 로그 r10 veto(540h·T30h) —
// 매판 수동으로 거부하던 두 유닛을 첫 전설·히든 마일스톤에서 상시 제외.
// 범위는 첫 전설 슬롯 한정: 추가 전설(additionalFinal)·후반 역할 보강에서
// 킬러(광보잡)·레베카(방깎)는 종전대로 정상 후보다.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,M=context.ORDV15Model,E=context.ORDV15Engine;
const units=context.ORD_TMO_UNITS;
const REBECCA='T30h',KILLER='540h';

const tests=[];
function test(name,fn){tests.push([name,fn]);}
function unitOf(id){const found=units.find(u=>u.id===id);assert(found,`픽스처 유닛 ${id} 없음`);return found;}
function buildModel(counts,round){
  return M.build({
    catalog:units,
    snapshot:{source:'v23-2-1-test',counts:counts||{},currentAbilities:{},wispCountFound:true,wispCount:(counts||{})[C.WISP_ID]||0},
    settings:{mode:'',magicRoute:'auto',currentRound:round||12,gorosei:'saturn',postLegendRoute:'',manualCounts:{}},
    locks:[]
  });
}

test('전제: 금지 대상 확인 — T30h 레베카(히든)·540h 킬러(히든), 재료를 줘도 제작 가능한 픽스처',()=>{
  assert(/레베카/.test(unitOf(REBECCA).name));assert(/히든/.test(unitOf(REBECCA).groupName));
  assert(/킬러/.test(unitOf(KILLER).name));assert(/히든/.test(unitOf(KILLER).groupName));
  // 두 유닛 재료 전량 보유 픽스처에서 원장 견적이 실제로 성립해야
  // "싼데도 안 뽑는다"가 검증된다.
  const counts={'720h':1,V10h:1,D20h:1,I10h:1,B10h:1,'610h':1,[C.WISP_ID]:12};
  const model=buildModel(counts);
  for(const id of [REBECCA,KILLER]){
    const solve=C.recipeSolve(model.knowledge.db,id,model.effective.counts);
    assert(C.num(solve.wispCost)<=12,`${id} 픽스처 견적 실패(선위 ${solve.wispCost})`);
  }
});

test('첫 전설 마일스톤: 재료가 다 있어 최저 선위여도 레베카·킬러 히든은 후보에서 제외된다',()=>{
  const counts={'720h':1,V10h:1,D20h:1,I10h:1,B10h:1,'610h':1,[C.WISP_ID]:12};
  const model=buildModel(counts);
  const pool=[unitOf(REBECCA),unitOf(KILLER),unitOf('E30h')/* 코비 전설 — 빈 재료라 비쌈 */];
  const decision=E._test.completionDecision(model,pool,'첫 전설·히든');
  const chosen=decision.action||decision.blockedAction;
  assert(chosen,'첫 전설 후보가 비었다 — 대조 유닛(코비)이 선정돼야 한다');
  assert(![REBECCA,KILLER].includes(String(chosen.id)),`금지 유닛이 첫 전설로 추천됨: ${chosen.name}`);
  for(const alt of decision.alternatives||[])
    assert(![REBECCA,KILLER].includes(String(alt.id)),`금지 유닛이 차선 목록에 노출됨: ${alt.name}`);
});

test('금지 유닛만 남으면 첫 전설은 후보 없음(HOLD)이다 — 몰래 되살리지 않는다',()=>{
  const counts={'720h':1,V10h:1,D20h:1,I10h:1,B10h:1,'610h':1,[C.WISP_ID]:12};
  const model=buildModel(counts);
  const decision=E._test.completionDecision(model,[unitOf(REBECCA),unitOf(KILLER)],'첫 전설·히든');
  assert.strictEqual(decision.state,'HOLD');
  assert(!decision.action&&!decision.blockedAction);
});

test('범위 한정: 추가 전설(additionalFinal)에서는 두 유닛이 종전대로 정상 후보다',()=>{
  const counts={'720h':1,V10h:1,D20h:1,I10h:1,B10h:1,'610h':1,[C.WISP_ID]:12};
  const model=buildModel(counts,30);
  const decision=E._test.completionDecision(model,[unitOf(REBECCA),unitOf(KILLER)],{key:'additionalFinal',label:'추가 전설',dueRound:null});
  const chosen=decision.action||decision.blockedAction;
  assert(chosen,'추가 전설 단계에서 후보가 사라졌다 — 금지 범위가 과도하다');
  assert([REBECCA,KILLER].includes(String(chosen.id)));
});

test('소스 계약: 금지 상수와 firstFinal 한정 조건이 명시돼 있다',()=>{
  const src=read('ord_v15_engine.js');
  assert(src.includes('FIRST_FINAL_USER_BANNED'),'금지 상수 부재');
  assert(src.includes("'T30h','540h'"),'금지 id 목록 불일치');
  assert(src.includes("milestoneSpec.key==='firstFinal'&&FIRST_FINAL_USER_BANNED"),'첫 전설 한정 조건 부재');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_2_1_FIRST_FINAL_BAN ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
