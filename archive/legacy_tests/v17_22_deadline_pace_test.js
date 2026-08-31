'use strict';

// v17.22 — 사망 직결 결함: 필수 역할 그룹이 순수 사전식이라 앞 그룹이
// 완전히 닫힐 때까지 뒤 그룹이 자원을 한 톨도 못 받았다.
//
// 실측(ORD_2305_20260725_120442 재생):
//   · 이감이 1라~55라 내내 10/102로 고정. 방깎만 43 → 178로 올랐다.
//   · 45라까지 이감 유닛이 "다음 행동"으로 한 번도 제시되지 않았고,
//     46라 이후 제시된 이감 총합은 60인데 부족분은 92였다 — 프로그램을
//     100% 따라도 산술적으로 닫을 수 없었다.
//   · 늦출수록 비싸진다: 같은 패에서 30라엔 선위 4개로 이감 110을 만들 수
//     있었는데 45라엔 16개를 써도 95에서 멈췄다(방깎 전설이 같은 하위
//     재료를 먼저 소비한다).
//
// 계약: 그룹 순서는 "마감 대비 뒤처짐"으로 정한다. 하드 게이트(무엇이
// 필수인가)는 그대로이고 순서만 바뀐다.

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js'])require(path.join(EXT,file));

const C=global.ORDCore,M=global.ORDV15Model,P=global.ORDV15Policy,E=global.ORDV15Engine,catalog=global.ORD_TMO_UNITS;
const LOG=path.join(__dirname,'../data/ORD_2305_20260725_120442_active.ordlog.json');
const CAVENDISH='B50h';
let passed=0;
function test(name,fn){fn();passed+=1;console.log(`PASS ${name}`);}

function modelAt(round){
  const log=JSON.parse(fs.readFileSync(LOG,'utf8'));
  let counts={},abilities={},progress={},target=null;
  for(const event of log.events){
    if(event.type!=='snapshot')continue;
    const p=event.payload;
    if(p.kind==='full'){counts=Object.assign({},p.counts||{});abilities=Object.assign({},p.currentAbilities||{});progress=Object.assign({},p.progress||{});}
    else{
      for(const [k,v] of Object.entries(p.counts||{})){if(v===null)delete counts[k];else counts[k]=v;}
      for(const [k,v] of Object.entries(p.currentAbilities||{})){if(v===null)delete abilities[k];else abilities[k]=v;}
      for(const [k,v] of Object.entries(p.progress||{})){if(v===null)delete progress[k];else progress[k]=v;}
    }
    if(event.round<=round)target={counts:Object.assign({},counts),abilities:Object.assign({},abilities),progress:Object.assign({},progress)};
  }
  assert(target,`R${round} 스냅샷 없음`);
  const ids=new Set([...Object.keys(target.counts),...Object.keys(target.progress)]);
  return M.build({
    catalog,
    snapshot:{source:'replay',sessionId:'v17-22',seq:1,at:1,dataChangedAt:1,wispCountFound:true,wispCount:C.num(target.counts[C.WISP_ID]),counts:target.counts,currentAbilities:target.abilities,units:[...ids].map(id=>({id,count:Math.max(0,C.num(target.counts[id])),tmoPercent:C.num(target.progress[id])}))},
    settings:{currentRound:round,mode:'physical',magicRoute:'physical',gorosei:'warcury',postLegendRoute:'upper',manualCounts:{},superKumaOwned:true,wispOverride:'',virtualSpecialId:'',upperResearchLevel:21},
    locks:[]
  });
}
function actionAt(round){
  const decision=E.decide({model:modelAt(round),locks:[{stage:'upper',id:CAVENDISH,source:'test',sticky:true}]});
  return decision.action||decision.blockedAction||null;
}
function slowOf(action){
  if(!action||!action.unit)return 0;
  const role=C.roleProfile(action.unit);
  return C.num(role.slow)+C.num(role.triggerSlow);
}

test('마감 대비 뒤처짐이 큰 그룹이 앞으로 온다',()=>{
  const behind=P._test.groupPaceBehind;
  assert.strictEqual(typeof behind,'function','groupPaceBehind가 노출되지 않았다');
  // 방깎(마감 40라)이 70% 진행, 이감(마감 45라)이 0% 진행인 35라 상황.
  const armor=[{key:'armor',required:true,gap:57,target:190},{key:'stunBase',required:true,gap:0,target:.5}];
  const slow=[{key:'slow',required:true,gap:102,target:102},{key:'bossFrenzy',required:true,gap:0,target:1}];
  assert(behind(slow,35)>behind(armor,35),'0% 진행인 이감이 70% 진행인 방깎보다 덜 뒤처진 것으로 계산됐다');
  // 반대로 이감이 거의 찼으면 방깎이 앞선다.
  const slowNearlyDone=[{key:'slow',required:true,gap:5,target:102},{key:'bossFrenzy',required:true,gap:0,target:1}];
  assert(behind(armor,35)>behind(slowNearlyDone,35),'거의 찬 이감이 여전히 방깎보다 앞선다');
  // 면제·비필수 행은 세지 않는다.
  assert.strictEqual(behind([{key:'slow',required:false,gap:102,target:102}],35),-1,'비필수만 있는 그룹이 순서 경쟁에 참여했다');
});

test('실전 패: 이감 유닛이 46라가 아니라 40라 전에 다음 행동으로 나온다',()=>{
  // 기존(v17.21까지): 45라까지 이감 유닛 제시 0회.
  const rounds=[32,35,38,40,42];
  const slowRounds=rounds.filter(round=>slowOf(actionAt(round))>0);
  assert(slowRounds.length>0,`32~42라에 이감 유닛 추천이 한 번도 없다`);
  assert(Math.min(...slowRounds)<=40,`이감 추천이 ${Math.min(...slowRounds)}라에나 나온다 — 늦을수록 재료가 소진돼 닫을 수 없다`);
  // 그리고 그때 제시되는 이감은 뒷북용 잔챙이가 아니어야 한다.
  const best=Math.max(...slowRounds.map(round=>slowOf(actionAt(round))));
  assert(best>=30,`제시된 이감이 최대 ${best}뿐 — 102를 닫기엔 너무 잘다`);
});

test('방깎이 굶지 않는다 — 순서만 바뀌고 필수 판정은 그대로다',()=>{
  // 초중반에는 방깎이 여전히 먼저 온다(마감이 더 이르다).
  const early=[30,32,35].map(round=>actionAt(round)).filter(Boolean);
  assert(early.some(action=>C.num(C.roleProfile(action.unit).armor)>0),'30~35라에 방깎 추천이 사라졌다');
  // 역할표의 필수 목록 자체는 변하지 않는다.
  const model=modelAt(40),route=P.ROUTES.physical;
  const assessment=P.evaluate(model,model.effective.counts,route,{round:40,locks:[]});
  const keys=new Set((assessment.requirements||[]).filter(row=>row.required!==false).map(row=>row.key));
  for(const key of ['main','armor','stunBase','slow','bossFrenzy','stunFull'])
    assert(keys.has(key),`필수 역할 ${key}가 사라졌다 — 순서 변경이 게이트를 건드렸다`);
});

console.log(`V17_22_DEADLINE_PACE ${passed}/3 passed`);
