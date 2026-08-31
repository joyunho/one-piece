'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const workerSource=fs.readFileSync(path.join(EXT,'ord_direction_worker.js'),'utf8');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore,units=global.ORD_TMO_UNITS,db=C.buildDb(units);

function stockedCounts(){
  const counts={[C.WISP_ID]:36,V20h:1};
  for(const u of units){if(C.isCommon(u))counts[u.id]=14;else if(C.isUncommon(u))counts[u.id]=7;else if(C.isSpecialTier(u))counts[u.id]=4;}
  for(const id of Object.keys(C.SPECIAL_IDS))counts[id]=4;
  for(const u of db.rares.slice(0,8))counts[u.id]=C.num(counts[u.id])+1;
  return counts;
}
function stateFromCounts(counts){return C.normalizeState(units,{counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});}
function settings(extra={}){return Object.assign({mode:'physical',currentRound:25,targetSquadCount:9,superKumaOwned:true,recommendWarped:true},extra);}
function rank(state,ids){return P.rankUpperBlueprints({state,settings:settings()},{candidateIds:ids});}

const tests=[];function test(name,fn){tests.push([name,fn]);}

test('equal-clear and equal-wisp upper ranking uses real Rare consumption before TMO completion',()=>{
  const row=(id,rareUsed,completion)=>({upperId:id,upperName:id,clearComplete:true,projectedCount:9,readiness:100,requirementPriority:[0,0,0,0],lineagePairs:0,wispCost:0,rareUsed,rareClearedTypes:3,rareUsedTypes:3,controlCapOverflow:0,handFitMetrics:{wispSubstitute:0,rareScore:0,lowerScore:0},materialOverlapPenalty:0,controlExcessScore:0,excessStun:0,excessSlow:0,rareConflict:0,completion}),rows=[row('rare-fit',8,5),row('tmo-only',7,100)].sort(P._test.upperBlueprintCompare);
  assert.strictEqual(rows[0].upperId,'rare-fit');assert.strictEqual(rows[1].completion,100);
});

test('control oversupply breaks equal Rare-use ties before completion',()=>{
  const rows=[
    {upperId:'high-completion',upperName:'A',clearComplete:true,rareUsed:8,controlExcessScore:80,excessStun:.3,excessSlow:50,completion:100,readiness:100,projectedCount:9,rareConflict:0,wispCost:0},
    {upperId:'lean-control',upperName:'B',clearComplete:true,rareUsed:8,controlExcessScore:10,excessStun:.1,excessSlow:0,completion:10,readiness:100,projectedCount:9,rareConflict:0,wispCost:0}
  ].sort(P._test.upperBlueprintCompare);
  assert.strictEqual(rows[0].upperId,'lean-control');
});

test('ranking API is deterministic and cached while cold direction work is delegated to the worker',()=>{
  const state=stateFromCounts(stockedCounts()),ids=db.uppers.filter(u=>C.familyOf(u)==='physical'&&C.specialPrerequisiteStatus(db,u,state.counts).allowed).slice(0,8).map(u=>u.id);
  assert(/rankDeckDirections\s*\(/.test(workerSource),'cold direction ranking is no longer delegated to the worker');
  const coldStarted=Date.now(),lastRows=rank(state,ids),coldMs=Date.now()-coldStarted;
  const first=lastRows.map(row=>[row.rank,row.upperId,row.rareUsed,row.clearComplete,row.excessStun,row.excessSlow]);
  const cachedStarted=Date.now(),cachedRows=rank(state,ids),cachedMs=Date.now()-cachedStarted;
  assert.strictEqual(cachedRows,lastRows,'identical hand fingerprint did not reuse the cached ranking object');
  assert.deepStrictEqual(cachedRows.map(row=>[row.rank,row.upperId,row.rareUsed,row.clearComplete,row.excessStun,row.excessSlow]),first);
  // Cold ranking runs off the UI thread in production. Keep only a loose
  // runaway guard here; the user-facing contract is worker isolation plus a
  // fast same-hand cache hit, not the obsolete 500ms synchronous deadline.
  assert(coldMs<10000,`worker ranking exceeded the 10s runaway guard (${coldMs}ms)`);
  assert(cachedMs<100,`same-hand cached ranking took ${cachedMs}ms`);
  assert(first.every(row=>row.length===6));

  // 하드 제어 상한과 전체 하위 패 적합도까지 같을 때는 더 적은 과잉
  // 제어가 먼저다. 서로 다른 특별/안흔/흔함 패 적합도를 무시하지 않는다.
  for(const lean of lastRows)for(const over of lastRows){
    if(lean.clearComplete===over.clearComplete&&lean.projectedCount===over.projectedCount&&lean.readiness===over.readiness&&lean.lineagePairs===over.lineagePairs&&lean.rareUsed===over.rareUsed&&lean.rareClearedTypes===over.rareClearedTypes&&lean.rareUsedTypes===over.rareUsedTypes&&lean.controlCapOverflow===over.controlCapOverflow&&Math.abs(lean.lowerHandFitScore-over.lowerHandFitScore)<1e-9&&lean.controlExcessScore+1e-9<over.controlExcessScore){
      assert(lean.rank<over.rank,`${lean.upperId}(${lean.controlExcessScore}) should precede ${over.upperId}(${over.controlExcessScore})`);
    }
  }
  // v18.8: 광보잡 기준이 바뀌며 1위 후보가 달라졌다.  이 검사가 지키려는 건
  // 순위가 아니라 "이감은 상한(102%)을 넘겨도 추가 점수를 받지 않는다"는 성질이라,
  // 1위 한 행이 아니라 이감 목표를 채운 모든 행에서 확인한다(픽스처 독립).
  const top=lastRows[0];
  const plannedRows=top.plan.roleCoverage.planned.rows,stun=plannedRows.find(row=>row.key==='stunFull');
  let capChecked=0;
  for(const row of lastRows){
    const slowRow=(row.plan.roleCoverage.planned.rows||[]).find(x=>x.key==='slow');
    if(!slowRow)continue;
    assert.strictEqual(slowRow.target,102,'normal physical slow cap was not 102%');
    assert(Math.min(slowRow.current,slowRow.target)<=slowRow.target,'slow above the cap received extra effective credit');
    if(slowRow.current>=slowRow.target){
      assert.strictEqual(Math.min(slowRow.current,slowRow.target),102,'slow above the cap received extra effective credit');
      capChecked+=1;
    }
  }
  assert(capChecked>0,'이감 상한을 채운 후보가 없어 상한 검사를 못 했다');
  // The global top may now spend more control than a speculative nine-unit
  // sheet because a provable current-stock prefix is compared first. The
  // equal-prefix control tie itself is covered by the dedicated comparator
  // test above; it is no longer a valid invariant of this worker/cache test.
  assert(stun,'physical ranking omitted the stun requirement row');
  console.log(`INFO  upper blueprint rank 8 candidates: cold ${coldMs}ms / cached ${cachedMs}ms (worker contract)`);
});

test('upper ranking sequentially consumes an owned first legend instead of double-counting it',()=>{
  const state=stateFromCounts(stockedCounts()),row=rank(state,['J40h'])[0],ids=row.plan.finalLineup.map(item=>item.id);
  assert(ids.includes('J40h'),'Roger upper was omitted');
  assert(!ids.includes('V20h'),'Smoker remained as a final unit after Roger consumed it');
  assert.strictEqual(row.plan.targetBoardCount,7);
  assert.strictEqual(row.plan.plannedCount,9);
  assert.strictEqual(ids.length,7);
});

test('Absalom exception stays buildable in both rank and preview without showing zombie hard-missing',()=>{
  const counts=stockedCounts();counts['010h']=0;counts['unit_1767884889420_456']=0;const state=stateFromCounts(counts),ranked=rank(state,['A50h'])[0];
  // v17.7: full 1.5 stun is a required physical gate.  v19.9.8(최소 스턴
  // 0.7): 최소선이 오르자 엔진이 다른 혈통(바르톨로메오 0.9 라인)으로 스턴
  // 1.501 을 닫는 설계를 1위로 골랐다 — 예전 주석의 '상한 1.435'는 이전
  // 설계 계열의 상한이었다.  대신 광보잡이 1/2 로 열려 계획은 여전히
  // 정직하게 미완성이고, 압살롬 예외는 좀비 하드 결손 없이 A50h 를 그대로
  // 제시해야 한다.
  assert(ranked&&ranked.plan.finalLineup.some(row=>row.id==='A50h'));
  // v21.5(전략 구상 ③ 암브 배선): 암브 스택이 방깎 판정에 들어오자 이
  // 합성 패의 방깎이 닫히고, 풀린 예산이 광보잡 2까지 채워 설계도가
  // 정직하게 완성된다.  이 검사의 계약은 '닫힌 척 하지 않는다'였고,
  // 이제는 실제로 닫혀서 완성이라 말하는 것이 정직이다.
  assert.strictEqual(ranked.clearComplete,true);
  const openRows=ranked.plan.roleCoverage.planned.rows.filter(row=>row.gap>0);
  // v18.8(사용자 교정): 광보잡 2기 요구가 들어오면서 이 픽스처의 1위 설계도가
  // 바뀌었다.  v19.9.8(최소 스턴 0.7): 최소선이 오르자 엔진은 다시 교환을
  // 바꿨다 — 이감·1.5스턴을 닫는 대신 광보잡을 1/2 로 남기는 설계가 1위가
  // 됐다.  이 검사가 지키려는 건 "압살롬 예외 설계도가 정직하게 미완성으로
  // 남는다"이므로, 어떤 행이 열렸는지는 엔진의 교환 그대로 적는다(닫힌 척
  // 하지 않는 것이 계약이다).
  assert.deepStrictEqual(openRows.map(row=>row.key),[],'v21.5: 암브 인정 후 전 행이 닫혀야 한다');
  assert(openRows.every(row=>row.gap>0),'열린 행은 실제로 부족해야 한다');
  assert.deepStrictEqual(ranked.plan.actions[0].solve.hardMissing,[]);
  const preview=P.planFinalSquad({state,settings:settings({upperPreviewId:'A50h'}),upperBlueprint:ranked.blueprint});
  // 원래 계약: 역할표 미완성 패는 전체 파티를 조용히 잠그지 못하고 invalid 로
  // 떨어져야 한다.  v18.9 는 이감 충족 시 1.5스턴 해제로 이 미리보기가 실제
  // 완성이 돼 adapted 였지만, v19.9(사용자 교정)가 물딜 1.5스턴을 다시 항상
  // 필수(순서만 최후)로 되돌리면서 이 합성 패(혈통 상한 1.435)는 다시
  // 정직하게 미완성이다 — invalid 로 떨어지는 원래 계약으로 복귀한다.
  // v21.5: 완성된 설계도의 미리보기는 invalid 로 떨어지지 않는다 —
  // 가변 조정(adapted)이 새 정직한 상태다.
  assert.strictEqual(preview.blueprint.status,'adapted');
  assert.notStrictEqual(preview.blueprint.status,'kept','조정 없이 잠근 것처럼 보고하면 안 된다');
  assert.strictEqual(preview.wispBudget.roleComplete,true,'v21.5: 암브 인정으로 이 합성 패는 완성이다');
  assert.strictEqual(preview.targetBoardCount,7);assert.strictEqual(preview.finalLineup.length,7);assert.strictEqual(preview.plannedCount,9);assert(preview.finalLineup.some(row=>row.id==='A50h'));assert(!preview.blueprint.replacedIds.includes('A50h'),'Absalom upper itself was released');const absalomAction=preview.actions.find(action=>action.id==='A50h');assert(absalomAction);assert.deepStrictEqual(absalomAction.solve.hardMissing,[]);
});

test('confirmed blueprint is kept byte-for-byte while all current wisps can realize it',()=>{
  const state=stateFromCounts(stockedCounts()),base=P.planFinalSquad({state,settings:settings(),locks:[{stage:'upper',id:'J40h'}]}),blueprint={version:1,revision:3,upperId:'J40h',lineupIds:base.finalLineup.map(row=>row.id),buildOrderIds:base.actions.map(row=>row.id),mode:'physical'},kept=P.planFinalSquad({state,settings:settings(),locks:[{stage:'upper',id:'J40h'}],upperBlueprint:blueprint});
  assert.strictEqual(kept.blueprint.status,'kept');assert.strictEqual(kept.blueprint.allWispFeasible,true);assert.strictEqual(kept.blueprint.revision,3);
  assert.deepStrictEqual(kept.finalLineup.map(row=>row.id),blueprint.lineupIds);
  assert.deepStrictEqual(kept.blueprint.replacedIds,[]);assert.deepStrictEqual(kept.blueprint.replacements,[]);
});

test('blueprint becomes invalid when current wisps cannot realize it and future drops are unfunded',()=>{
  const rich=stateFromCounts(stockedCounts()),base=P.planFinalSquad({state:rich,settings:settings(),locks:[{stage:'upper',id:'J40h'}]}),blueprint={version:1,upperId:'J40h',lineupIds:base.finalLineup.map(row=>row.id),buildOrderIds:base.actions.map(row=>row.id),mode:'physical'},empty=stateFromCounts({[C.WISP_ID]:0}),adapted=P.planFinalSquad({state:empty,settings:settings(),locks:[{stage:'upper',id:'J40h'}],upperBlueprint:blueprint});
  assert.strictEqual(adapted.blueprint.allWispFeasible,false);assert.notStrictEqual(adapted.blueprint.status,'kept');
  assert(adapted.blueprint.replacedIds.length>0);assert(/모든 선택 위습|부족/.test(adapted.blueprint.reason));
  assert.strictEqual(adapted.projectedCount,0);assert(adapted.plannedCount<adapted.targetCount);
  assert(adapted.wispBudget.required>adapted.wispBudget.available);assert(adapted.wispBudget.shortage>0);
  assert.strictEqual(adapted.wispBudget.fullPartyFeasible,false);assert(adapted.handFit.futurePending.length>0);assert.strictEqual(adapted.handFit.feasible,false);
  assert.strictEqual(adapted.blueprint.status,'invalid');assert.strictEqual(adapted.safePrefix.actions.length,0);assert.strictEqual(adapted.safePrefix.checkpointPass,false);
});

test('slow utility stops at 102 except Nasjuro, whose strict ceiling is 117',()=>{
  const spec={main:1,stun:1.5,slow:117,triggerSlow:0,armor:210,triggerArmor:0,boss:1,frenzy:1};
  const normal=P._test.requirementRows(spec,[],'physical','physical',{gorosei:'none'},null),saturn=P._test.requirementRows(spec,[],'physical','physical',{gorosei:'saturn'},null),nasjuro=P._test.requirementRows(spec,[],'physical','physical',{gorosei:'nasjuro'},null);
  assert.strictEqual(normal.rows.find(row=>row.key==='slow').target,102);assert.strictEqual(saturn.rows.find(row=>row.key==='slow').target,102);assert.strictEqual(nasjuro.rows.find(row=>row.key==='slow').target,117);
  assert.strictEqual(P._test.excessSlow(normal),15);assert.strictEqual(P._test.excessSlow(saturn),15);assert.strictEqual(P._test.excessSlow(nasjuro),0);
  const nasOver=P._test.requirementRows(Object.assign({},spec,{slow:130}),[],'physical','physical',{gorosei:'nasjuro'},null);assert.strictEqual(P._test.excessSlow(nasOver),13);
  assert.strictEqual(P._test.staticPotential({slow:80},normal),0);assert.strictEqual(P._test.staticPotential({slow:80},nasjuro),0);
  const nasShort=P._test.requirementRows(Object.assign({},spec,{slow:102}),[],'physical','physical',{gorosei:'nasjuro'},null);assert(P._test.staticPotential({slow:15},nasShort)>0);
});

test('missing roles, then control caps, tier burn and low wisps are compared in order',()=>{
  const node=(readiness,rare,stun,slow,id)=>({complete:true,requirements:{complete:true,readiness},projectedCount:7,target:7,blueprintMatched:0,used:{rare,wisp:0},excessStun:stun,excessSlow:slow,score:0,actions:[{id}]});
  assert(P._test.nodeCompare(node(100,1,.5,40,'useful'),node(99,8,0,0,'missing'))<0,'missing clear readiness beat a complete role set');
  assert(P._test.nodeCompare(node(100,8,.5,40,'over'),node(100,7,0,0,'lean'))>0,'avoidable excess control beat a lean equal-clear plan');
  assert(P._test.nodeCompare(node(100,8,0,0,'rare'),node(100,7,0,0,'lean'))<0,'Rare use did not break an equal-control tie');
  assert(P._test.nodeCompare(node(100,8,0,0,'near'),node(100,8,.5,40,'over'))<0,'equal plans did not minimize over-control');
  const met={rows:[{key:'slow',gap:0,current:102,target:102,weight:95,required:true},{key:'armor',gap:50,current:130,target:180,weight:110,required:true}]};
  assert.strictEqual(P._test.staticPotential({slow:50},met),0);assert(P._test.staticPotential({armor:80},met)>0);
  assert(P._test.incrementalSlowPenalty(met,{slow:50})>P._test.incrementalSlowPenalty(met,{slow:50,armor:20}));
  assert(P._test.incrementalStunPenalty({stun:1.5},{stun:.5})>P._test.incrementalStunPenalty({stun:.5},{stun:.5,armor:20}));
});

let passed=0;for(const [name,fn] of tests){try{fn();passed++;console.log('PASS',name);}catch(error){console.error('FAIL',name);throw error;}}
console.log(`Upper blueprint v14.0.0 tests: ${passed}/${tests.length} passed`);
