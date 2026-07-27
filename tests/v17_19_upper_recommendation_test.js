'use strict';

// v17.19 — 사용자 보고: "상위를 계속 똑같은 걸 추천한다. 가반이 그렇게
// 좋지 않은데 계속 올라온다."
//
// 실측 원인(2026-07 로그 4판 재생):
//   · clearValueScore의 88%가 유닛별 상수(story .3 + dpsCover .3 + line .15
//     + utility .13)여서 패가 바뀌어도 순위가 고정됐다.  물딜 고정 점수
//     1위 카벤딧슈 0.733 · 2위 스코퍼가반 0.5385 · 3위 0.4156 — 1~2위
//     격차가 유일한 패 반응 축(rareUtil 상한 0.12)보다 커서 어떤 패로도
//     순서가 바뀔 수 없었다.  로그에서도 물딜 3판 전부 1·2위가 같았다.
//   · 스코퍼가반은 상시방깎 0 · 이감 0 · 스턴 0으로 물딜 필수 6역할 중
//     4개에 기여가 없는데 story 0.99만으로 2위를 유지했다.
//   · 카벤딧슈의 dpsCover 1.14는 스킬 proc 4,973,450/초(평타의 47배)에서
//     나오는데, 그 프로필은 status=pending · unknownConditions 15로 파서가
//     스스로 미검증이라고 표시해둔 값이다.
//
// 계약: 결손 기여(roleFit)가 최상위 축 · story 제거 · 미검증 프로필 감산.

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_core.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js'])require(path.join(EXT,file));

const C=global.ORDCore,M=global.ORDV15Model,P=global.ORDV15Policy,E=global.ORDV15Engine,units=global.ORD_TMO_UNITS;
const GABAN='F40h',CAVENDISH='B50h';
let passed=0;
function test(name,fn){fn();passed+=1;console.log(`PASS ${name}`);}

// 0725 로그 27라 실제 보드(재구성): 방깎 43 · 이감 10 · 스턴 0.9 ·
// 선위 22.  이 패에서 프로그램은 카벤딧슈와 가반만 계속 올렸다.
function realHandModel(round,extraCounts){
  // v15 엔진의 roleState는 관측 능력치가 아니라 보유 유닛에서 스펙을 다시
  // 만든다(모델 주석: in-game purchased upgrades are not credited here).
  // 결손을 바꾸려면 능력치가 아니라 보유 유닛을 바꿔야 한다.
  const counts=Object.assign({'100h':4,'200h':3,'220h':1,'400h':2,'420h':1,'500h':2,'600h':1,'700h':2,'800h':1,'810e':22,'830h':1,'900h':1,'930h':1,'D00h':1,'F00h':2,'H30h':1,'I00h':1,'300h':1},extraCounts||{});
  const abilities={'방어력 감소':43,'이동속도 감소':10,'스턴':.9,'보스 잡기':1,'광폭화':1};
  const catalogUnits=units.map(unit=>({id:unit.id,count:Math.max(0,C.num(counts[unit.id])),tmoPercent:0}));
  return M.build({
    catalog:units,
    snapshot:{source:'v17-19-fixture',sessionId:'upper-reco',seq:1,at:1,dataChangedAt:1,wispCountFound:true,wispCount:C.num(counts['810e']),counts,currentAbilities:abilities,units:catalogUnits},
    settings:{currentRound:round,mode:'physical',magicRoute:'physical',gorosei:'warcury',postLegendRoute:'upper',manualCounts:{},superKumaOwned:true,wispOverride:'',virtualSpecialId:'',upperResearchLevel:21},
    locks:[]
  });
}

test('상위 점수에 story가 없고 결손 기여(roleFit)가 대신 들어간다',()=>{
  const rows=E._test.upperRouteCandidates(realHandModel(27),[]);
  assert(rows.length>0,'후보가 비었다');
  for(const row of rows){
    assert(row.clearValue,`${row.name} clearValue 누락`);
    assert(!('story' in row.clearValue),`${row.name}: 상위 점수에 story가 되살아났다`);
    assert(typeof row.clearValue.roleFit==='number','roleFit 부분점수 누락');
  }
});

test('필수 역할 기여가 0에 가까운 상위(스코퍼가반)는 후보 상단을 차지하지 못한다',()=>{
  const model=realHandModel(27),route=P.ROUTES.physical;
  const baseline=P.evaluate(model,model.effective.counts,route,{round:27,locks:[]});
  const db=model.knowledge.db,gaban=db.byId.get(GABAN),cavendish=db.byId.get(CAVENDISH);
  assert(gaban&&cavendish,'픽스처 유닛 탐색 실패');

  // 데이터 전제: 가반은 상시방깎·이감·스턴 전부 0이다(단일깍60은 역할표의
  // 상시 풀방깎에 잡히지 않는다).  이 전제가 깨지면 아래 단언도 무의미하다.
  const gabanRole=C.roleProfile(gaban);
  assert.strictEqual(C.num(gabanRole.armor),0,'픽스처 드리프트: 가반 상시방깎');
  assert.strictEqual(C.num(gabanRole.slow),0,'픽스처 드리프트: 가반 이감');
  assert.strictEqual(C.num(gabanRole.stun),0,'픽스처 드리프트: 가반 스턴');

  const fitOf=unit=>E._test.upperRoleFit(unit,baseline,route);
  assert(fitOf(gaban)<fitOf(cavendish),'결손 기여가 카벤딧슈보다 높게 나왔다');

  const rows=E._test.upperRouteCandidates(model,[]);
  const gabanIndex=rows.findIndex(row=>C.canonicalUpperId(row.id)===C.canonicalUpperId(GABAN));
  assert(gabanIndex<0||gabanIndex>=3,`스코퍼가반이 여전히 상단(${gabanIndex+1}위)에 있다`);
  // 상단은 실제로 결손을 닫는 상위여야 한다.
  for(const row of rows.slice(0,3)){
    assert(C.num(row.clearValue.roleFit)>0,`${row.name}: 결손 기여 0인 상위가 상단에 있다`);
  }
});

test('후보 목록은 패에 반응한다 — 방깎이 이미 찬 패와 빈 패의 1순위가 다르다',()=>{
  const route=P.ROUTES.physical;
  const openBoard=realHandModel(27);
  // 같은 라운드·같은 패에 방깎 전설급만 얹어 상시 방깎을 크게 메운 보드
  // (시저30 + 에이스33 + 울티27 + 미호크25 + 크래커25…).
  const closedBoard=realHandModel(27,{'830h':1,'O20h':1,'S30h':1,'340h':1,'H30h':2,'F00h':3});
  const fitOf=(model,id)=>E._test.upperRoleFit(model.knowledge.db.byId.get(id),P.evaluate(model,model.effective.counts,route,{round:27,locks:[]}),route);
  const openFit=fitOf(openBoard,CAVENDISH),closedFit=fitOf(closedBoard,CAVENDISH);
  assert(openFit!==closedFit,`결손이 달라져도 같은 상위의 기여 점수가 그대로다 — 고정 티어표 회귀 (${openFit} vs ${closedFit})`);

  // 그리고 그 차이가 실제 목록 순서까지 바꿔야 한다.  v17.18까지는
  // 점수의 88%가 유닛별 상수라 어떤 패에서도 순서가 같았다.
  const listOf=model=>E._test.upperRouteCandidates(model,[]).map(row=>C.canonicalUpperId(row.id));
  const openList=listOf(openBoard),closedList=listOf(closedBoard);
  assert(openList.length>0&&closedList.length>0,'후보 산출 실패');
  assert(openList.join('|')!==closedList.join('|'),`보드가 달라져도 후보 순서가 동일하다 — 고정 티어표 회귀 (${openList.join(',')})`);
});

test('미검증 스킬 프로필의 발동 DPS는 감산되어 순위에 들어간다',()=>{
  const db=C.buildDb(units),cavendish=db.byId.get(CAVENDISH);
  const proc=C.upperSkillProcDps(cavendish,21,{bossArmor:372,armorReduce:180});
  assert(proc,'카벤딧슈 스킬 프로필 없음');
  assert.strictEqual(proc.verified,false,'픽스처 드리프트: 이 프로필은 미검증이어야 한다');
  assert(proc.trust>0&&proc.trust<1,`신뢰도가 (0,1) 밖: ${proc.trust}`);
  assert(proc.trustedDps<proc.dps,'미검증 프로필이 감산되지 않았다');
  assert(proc.trustedDps>0,'감산이 아니라 삭제가 됐다 — 계약은 감산이다');

  // 검증된 프로필은 감산되지 않는다.
  const clean=C.skillProcTrust({damageSeen:4,damageEvaluated:4,profileDamageActions:4,unknownConditions:0},'linked_sources_action_ast_complete');
  assert.strictEqual(clean.verified,true);
  assert.strictEqual(clean.trust,1);
  // coverage가 없으면 하한까지 감산한다(모르는 건 신뢰하지 않는다).
  assert.strictEqual(C.skillProcTrust(null,'').verified,false);
  assert(C.skillProcTrust(null,'').trust<=.1+1e-9);
});

test('보조 유닛 순위: 등급 소모량이 누적 선위·후속 커버리지보다 뒤에 온다',()=>{
  const source=require('fs').readFileSync(path.join(EXT,'ord_v15_engine.js'),'utf8');
  const line=source.split('\n').find(text=>text.includes('node.rankVector=['));
  assert(line,'nodeRank의 rankVector 조립부를 찾지 못했다');
  const at=token=>line.indexOf(token);
  assert(at('-coverage.affordableCount')>0&&at('num(node.resources.wisp)')>0,'커버리지·선위 축 누락');
  assert(at('-coverage.affordableCount')<at('num(node.resources.wisp)'),'후속 커버리지가 선위보다 뒤에 있다');
  assert(at('num(node.resources.wisp)')<at('-num(tier.rare)'),'등급 소모량이 누적 선위보다 앞에 있다 — 패를 더 태우는 조합이 더 싼 조합을 이긴다');
  assert(at('-node.story')<0,'행동 선택 순위에 story가 되살아났다');
});

console.log(`V17_19_UPPER_RECOMMENDATION ${passed}/5 passed`);
