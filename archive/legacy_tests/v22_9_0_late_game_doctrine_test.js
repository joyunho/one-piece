'use strict';
// v22.9.0 계약 — 0810b r51_65 실패 포렌식 3건 (사용자 요청, 2026-08-10).
//
// 사용자: "첫 전설 만들고 희귀함은 왜 추천하는거야? 그리고 후반에
// 희귀->전설 페이지에서 선택위습 숫자가 잘못 표기되는 것 같아 7개라고
// 적혀있는데 그것보다 많이 필요할때가 많아 그리고 마지막에 전설급 유닛
// 짜내는게 부족한 것 같아 다 만들고 선택위습이 많이 남았는데도 이걸
// 사용해서 짜내지 않더라"
//
// 포렌식(0810b): 첫 전설(16라) 직후 r16~20 슬로우 희귀가 연속 top 추천 ·
// r49~52 위습 9~14를 든 채 파티 층 침묵(그 창이 카쿠 끝딜의 마지막 제작
// 기회) · r58 라인 사망.
//
// ① 희귀 필러 유예 — 40라 전 + 마감 절벽 아님 + 전설·상위 진행 목표
//    실존이면 단독 희귀 첫수를 승인하지 않는다
// ② 신세계 짜내기 — 51라+ 정규 승인 부재 시 무회귀 전설급 완주 승인,
//    파티 층이 뒤집지 못한다
// ③ 희귀→전설 카드 — 계획 예약 차감 실비용 표기 + 예약 겹침 칩

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const engineSrc=read('ord_v15_engine.js'),appSrc=read('ord_app.js');
const tests=[];
function test(name,fn){tests.push([name,fn]);}

const context={console};context.window=context;vm.createContext(context);
context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const C=context.ORDCore,engine=context.ORDV15Engine,App=context.ORDApp.App;
const cat=context.ORD_TMO_UNITS;
const db=C.buildDb(cat);
const isRareUnit=unit=>unit&&!C.isLegendish(unit)&&!C.isUpper(unit)&&/희귀/.test(C.groupName(unit));
const mk=(counts,wisp,round)=>({catalog:cat,snapshot:{source:'v229',counts:Object.assign({[C.WISP_ID]:wisp},counts),wispCountFound:true,wispCount:wisp,currentAbilities:{}},settings:{currentRound:round,mode:'physical',magicRoute:'auto',manualCounts:{}},locks:[]});
// 0810b 재현 축: 첫 전설(로브 루치 R20h) 완성 직후, 위습만 든 패.
const HAND={R20h:1};

test('① 첫 전설 직후(18라) 단독 희귀 첫수는 승인되지 않는다',()=>{
  const decision=engine.decide(mk(HAND,12,18));
  const pick=decision.action||decision.blockedAction;
  if(decision.state==='ACT_NOW'){
    assert(pick&&pick.unit,'승인인데 대상이 없다');
    assert(!isRareUnit(pick.unit),`단독 희귀(${pick.name})가 여전히 즉시 승인된다`);
  }else{
    // 보류라면 유예 증거나 진행 목표가 사유에 있어야 한다 — 조용한 침묵 금지.
    const held=decision.evidence&&decision.evidence.rareFillerHeld;
    assert(held||pick,'보류인데 유예 증거도 보류 카드도 없다');
    if(held)assert(String(decision.reason||'').includes('전설·상위 진행이 우선'),'유예 사유 문구가 없다');
  }
});

test('① 40라부터는 유예가 풀린다 — 같은 패에서 rareFillerHeld 증거 없음',()=>{
  const decision=engine.decide(mk(HAND,12,41));
  assert(!(decision.evidence&&decision.evidence.rareFillerHeld),'40라+에도 필러 유예가 걸려 있다');
});

test('① 유예 배선 (소스 계약) — 경계·절벽·진행 목표·재료 시퀀스 예외',()=>{
  assert(engineSrc.includes('RARE_FILLER_ROUND=40,SLOW_DEADLINE_ROUND=45'),'유예 경계 상수가 없다');
  assert(engineSrc.includes('!rareFillerHeld&&planLegendOk&&(best.regression===0'),'유예가 commit 판정 앞에 없다 (v22_3 자구 계약 포함)');
  assert(engineSrc.includes('slowCliff'),'이감 마감 절벽 조기 개방이 없다');
  assert(engineSrc.includes('feedsFinal'),'전설·상위 재료 시퀀스 예외가 없다');
  assert(engineSrc.includes('if(finalPath)best=finalPath'),'전설 진행 경로 선점이 없다');
  assert(engineSrc.includes('전설·상위 진행이 우선입니다'),'유예 사유 문구가 없다');
  assert(engineSrc.includes('rareFillerHeld:rareFillerHeld||false'),'유예 증거 키가 없다');
});

test('② 신세계 짜내기 배선 (소스 계약) — 트리거·정렬·증거·위습 보전',()=>{
  const idx=engineSrc.indexOf("roundNow>=OPERATIONS_ROUND&&state!=='ACT_NOW'&&route&&route.key!=='singleEnd'&&!upperReserve");
  assert(idx>=0,'짜내기 트리거(51라+ · 비승인 · 비단끝 · 상위 예약 없음)가 없다');
  const block=engineSrc.slice(idx,idx+4200);
  assert(block.includes('right.gapGain-left.gapGain||right.combatDelta-left.combatDelta'),'정렬(결손 기여→화력 델타→최저 선위)이 계약과 다르다');
  assert(block.includes("label:'신세계 · 잉여 위습 환원'"),'짜내기 라벨이 없다');
  assert(block.includes('lateSqueeze:true'),'짜내기 증거 키가 없다');
  assert(block.includes('clearClaim:false'),'짜내기가 클리어 판정을 주장한다');
  assert(engineSrc.includes('wispFloor'),'회복 목표 위습 보전 가드가 없다');
  // v17.6 화력 예외의 50라 경계 보정 — stunFull 잔결손만 열려 있고 닫을 수
  // 없으면 전부 닫힘과 동급.
  assert(engineSrc.includes("[...openRequiredKeys].every(key=>key==='stunFull')"),'firepowerUpgrade stunFull 확장이 없다');
});

test('② 짜내기 승인은 파티 층이 뒤집지 못한다',()=>{
  const approved={state:'ACT_NOW',evidence:{lateSqueeze:true},action:{id:'KC0h',name:'카쿠 (끝딜, 블링크)'},model:{settings:{}}};
  const out=engine.reconcileSquadExecution(approved,{safePrefix:{actions:[]}},[]);
  assert.strictEqual(out.state,'ACT_NOW','빈 프리픽스가 짜내기 승인을 강등했다');
  assert(out.evidence&&out.evidence.squadBypassLateSqueeze,'짜내기 우회 증거가 없다');
});

test('② 51라+ 무회귀 정규 승인도 라인업 불일치로 침묵하지 않는다 (0810b r49~52 봉합)',()=>{
  // lateSqueezeSafe: 소비 없는(after=현재) 승인은 정의상 무회귀 → 통과.
  const base=engine.decide(mk(HAND,12,55));
  assert(base.model,'decide 가 model 을 싣지 않는다');
  const counts=base.model.effective.counts;
  const safeAction={quote:{feasible:true,after:counts}};
  assert.strictEqual(engine._test.lateSqueezeSafe(base.model,safeAction,[]),true,'무회귀 승인이 안전 판정을 통과하지 못한다');
  assert.strictEqual(engine._test.lateSqueezeSafe(base.model,{quote:{feasible:false,after:counts}},[]),false,'불가 견적이 안전 판정을 통과한다');
  const okDecision=Object.assign({},base,{state:'ACT_NOW',action:Object.assign({id:'X',name:'x'},safeAction),evidence:{}});
  const out=engine.reconcileSquadExecution(okDecision,{safePrefix:{actions:[{id:'다른유닛',name:'다른유닛'}]},finalLineup:[{id:'다른유닛'}]},[]);
  assert.strictEqual(out.state,'ACT_NOW','51라+ 무회귀 승인이 라인업 불일치로 강등됐다');
  assert(out.evidence&&out.evidence.squadBypassLateSqueeze,'51라+ 무회귀 우회 증거가 없다');
});

test('③ 희귀→전설 카드 — 계획 예약 차감 실비용 (킨에몬 경합 재현)',()=>{
  // 샬롯 크래커(H30h)=G20h+킨에몬(J20h)+720h.  세 재료 전부 보유 —
  // 생 counts 실비용은 싸다.  파티 계획이 킨에몬을 다른 유닛에 예약하면
  // 실비용이 뛰고(예약 겹침), 예약 목적지가 자기 자신이면 반환돼 그대로다.
  const state={db,counts:{G20h:1,J20h:1,'720h':1},wisp:20};
  const planFor=destId=>({mode:'physical',settings:{},deficits:{rows:[]},squadPlan:{handFit:{tiers:{rare:{rows:[{id:'J20h',spent:0,reserved:1,usedBy:[{id:destId,count:1}]}]}}}}});
  const app=Object.create(App.prototype);
  app.state={mode:'physical'};
  app.actualRound=()=>30;
  app.v151FamilyIntent=()=>'';
  const rowsOther=app.v153RareCraftRows(state,planFor('ZZZZ'));
  const cracker=rowsOther.find(item=>String(item.unit.id)==='H30h');
  assert(cracker,'크래커 카드가 후보에 없다');
  assert(cracker.planWispCost!=null&&cracker.planWispCost>C.num(cracker.solve.wispCost),`예약 경합인데 실비용이 안 올랐다 (${cracker.solve.wispCost} → ${cracker.planWispCost})`);
  assert(C.num(cracker.planExtra)>0,'예약 겹침 증거(planExtra)가 없다');
  const appSelf=Object.create(App.prototype);
  appSelf.state={mode:'physical'};appSelf.actualRound=()=>30;appSelf.v151FamilyIntent=()=>'';
  const rowsSelf=appSelf.v153RareCraftRows(state,planFor('H30h'));
  const selfRow=rowsSelf.find(item=>String(item.unit.id)==='H30h');
  assert(selfRow&&C.num(selfRow.planExtra)===0,'자기 카드로 향하는 예약이 반환되지 않았다(이중과금)');
});

test('③ 카드 표기 — 실비용 선위 · 예약 겹침 칩 · 흔함=선위 동치 푸터',()=>{
  const obj=Object.create(App.prototype);
  obj.v153RareCraftRows=()=>[{unit:{id:'T1',name:'표기검증'},feasible:true,solve:{wispCost:5,direct:[]},rareSpend:{total:1,byId:[]},rareProgress:{owned:1,short:0,total:1,ratio:1,ingredients:[]},blocked:[],wispGap:0,recommendationRank:0,planWispCost:9,planExtra:4}];
  obj.v153Icon=()=>'';
  const html=obj.renderV153CraftableLegends({db,counts:{},wisp:6},{});
  assert(html.includes('선위 9'),'계획 차감 실비용이 표기되지 않는다');
  assert(html.includes('예약 겹침 +4'),'예약 겹침 칩이 없다');
  assert(html.includes('부족 흔함 9장 = 선위'),'흔함=선위 동치 푸터가 없다');
  assert(html.includes('선위 3 부족'),'실비용 기준 부족 상태가 아니다 (9-6=3)');
  assert(read('ord_ui_v20.css').includes('.v229-claim'),'예약 겹침 칩 스타일이 없다');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V22_9_0_LATE_GAME_DOCTRINE ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
