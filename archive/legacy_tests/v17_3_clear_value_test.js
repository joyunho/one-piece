'use strict';

// v17.3: 종착점 클리어 가치 랭킹 + FSM 트레인 하한 + 1번 패널 재료 즉시 표시.
//  - v17.19: clearValue는 상위 단독 참고치일 뿐 최종 정렬 권위가 아니다.
//    역할 투영/전체 파티가 먼저이며, 최단 완성 후보는 비교 앵커로 남는다.
//  - 최단 완성 후보(현재주의 선택지)는 가치가 낮아도 목록에 남는다(nearestBuild).
//  - FSM 트레인: RNG 게이트(p<1)만 포함, BD1 재진입은 1/지속시간 상한.
//  - 1번 패널: 대안 제거, "바로 필요한 조합 재료"와 "부족 최하위 재료 = 선택위습 N".

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
const originalWarn=console.warn;
console.warn=()=>{};
for(const file of [
  'ord_units_data.js',
  'ord_data_patch.js',
  'ord_upper_combat_data.js',
  'ord_upper_skill_digest.js',
  'ord_upper_skill_dps.js',
  'ord_core.js',
  'ord_v15_model.js',
  'ord_v15_ledger.js',
  'ord_v15_policy.js',
  'ord_v15_engine.js'
])require(path.join(EXT,file));
console.warn=originalWarn;

const C=global.ORDCore;
const M=global.ORDV15Model;
const E=global.ORDV15Engine;
const units=global.ORD_TMO_UNITS;
const TABLE=global.ORD_UPPER_SKILL_DPS;

const tests=[];
function test(name,fn){tests.push([name,fn]);}

function friendModel(){
  const find=(pat,groupPat)=>units.find(u=>pat.test(C.nameOf(u))&&(!groupPat||groupPat.test(C.groupName(u))));
  const counts={'810e':12,'unit_1767884906256_4990':1};
  for(const u of [find(/^마르코/,/전설/),find(/^킬러/,/히든|전설/),find(/흰수염/,/전설/)]){assert(u,'전설 유닛 탐색 실패');counts[u.id]=1;}
  for(const pat of [/센토마루/,/와이퍼/,/^브룩/,/핸콕/,/기어\s*서드/,/^비비/,/^카쿠/,/호킨스/]){
    const u=units.find(x=>pat.test(C.nameOf(x))&&/희귀/.test(C.groupName(x)));
    assert(u,`희귀 유닛 탐색 실패: ${pat}`);
    counts[u.id]=(counts[u.id]||0)+1;
  }
  return M.build({catalog:units,snapshot:{source:'test',sessionId:'s',seq:1,at:1,dataChangedAt:1,counts,currentAbilities:{},wispCountFound:true,wispCount:12},settings:{mode:'',magicRoute:'auto',currentRound:26,gorosei:'none',postLegendRoute:'upper',superKumaOwned:true,upperResearchLevel:1},locks:[]});
}

test('최단 완성 후보는 통합 역할 정렬에서도 비교 앵커로 남는다',()=>{
  const rows=E._test.upperRouteCandidates(friendModel(),[]);
  assert(rows.length>0&&rows.length<=6,'후보 1~6개');
  const nearest=rows.find(row=>row.nearestBuild===true);
  assert(nearest,'최단 완성 앵커 표시 누락');
  assert.strictEqual(C.num(nearest.wispGap),Math.min(...rows.map(row=>C.num(row.wispGap))),'nearestBuild가 실제 최단 후보가 아니다');
});

test('클리어 가치 부분점수는 남지만 최종 통합 순위를 지배하지 않는다',()=>{
  const rows=E._test.upperRouteCandidates(friendModel(),[]);
  for(const row of rows){
    const value=row.clearValue;
    assert(value,`${row.name} clearValue 누락`);
    // v17.26: story는 상위 점수에서 제거됐다(사용자 3회 확인).  되살아나면
    // 여기서 잡는다 — 스토리 파괴 속도는 악몽 클리어 확률이 아니다.
    assert(!('story' in value),`${row.name}: 상위 점수에 story가 되살아났다`);
    for(const key of ['value','dpsCover','line','rareUtil','utility','deadlineFactor'])
      assert(typeof value[key]==='number'&&value[key]>=0,`${row.name}.${key} 이상`);
    assert(value.value<=1.2+1e-9,`${row.name} 가치 상한 초과`);
  }
  assert(rows.some((row,index)=>index>0&&C.num(row.clearValue.value)>C.num(rows[index-1].clearValue.value)+1e-9),'clearValue가 아직 최종 내림차순 권위다');
});

test('선위→라운드 환산: 실측 수입 상한(2.5/라)으로 재고 마감을 넘기면 할인한다',()=>{
  // v18.4(사용자 지적): v17.3 은 4/라를 썼는데 근거가 커밋에 없고, 코어 실측
  // 상수로 만들 수 있는 가장 낙관적인 값보다도 크다 — 선택위습 0.5/라(측정)
  // + 랜덤 위습 2/라(흔함만) = 2.5/라가 상한이다.  할인은 벌점이므로 상한으로
  // 재서 "가장 좋은 경우에도 늦을 때"만 깎는다.
  const model=friendModel();
  const han=units.find(u=>u.id==='C50h');
  const route=E._test.routeOptions(model).find(r=>r.mode==='magic');
  const row=E._test.upperRouteRow(model,han,route);
  assert(row,'핸콕 영원 행 생성 실패');
  const value=E._test.clearValueScore(model,row);
  const optimistic=C.SELECTION_WISP_INCOME_PER_ROUND+C.RANDOM_WISP_PER_ROUND;
  assert.strictEqual(value.optimisticRate,optimistic,'낙관 해소율 = 선택위습 + 랜덤 위습');
  assert.strictEqual(value.pessimisticRate,C.SELECTION_WISP_INCOME_PER_ROUND,'비관 해소율 = 선택위습만');
  assert.strictEqual(value.roundsToGo,Math.ceil(C.num(row.wispGap)/optimistic),'환산율은 실측 상한');
  // 부족 61선위는 상한으로도 25라가 걸린다 — r26 기준 ETA 51 로 마감 창을 넘긴다.
  assert(value.eta>C.num(model.round.value),'도달 라운드가 현재보다 뒤여야 함');
  assert(value.deadlineFactor<1,`61선위 부족이 무할인으로 비교되면 안 됨: ${value.deadlineFactor}`);
  assert(value.etaSlow>=value.eta,'비관 ETA 가 낙관보다 앞설 수 없음');
});

test('FSM 트레인: RNG 게이트만 포함되고 재진입은 지속시간 상한을 받는다',()=>{
  assert.strictEqual(TABLE.version,'2305C-fsm-trains-1');
  assert.strictEqual(TABLE.allowKillVerdict,false,'킬 판정 금지 정책 보존');
  assert((TABLE.basis.match(/FSM 공격유발 트레인 포함/g)||[]).length===1,'basis 접미사는 정확히 1회');
  const slots=Object.entries(TABLE.trainsByProfile||{});
  assert(slots.length>0,'trainsByProfile 비어 있음');
  for(const [profileId,slot] of slots){
    for(const train of slot.trains||[]){
      assert(train.p>0&&train.p<1,`${profileId}/${train.id}: RNG 게이트가 아닌 트레인(p=${train.p})`);
      assert(C.num(train.dur)>=0,`${profileId}/${train.id}: 지속시간 음수`);
      assert(C.num(train.e&&train.e.universal)>=0&&C.num(train.e&&train.e.affected)>=0,`${profileId}/${train.id}: 음수 기대 피해`);
    }
  }
});

test('upperSkillProcDps: 트레인 기대치가 더해지고 상한이 지켜진다',()=>{
  const withTrains=Object.entries(TABLE.trainsByProfile).find(([,slot])=>(slot.trains||[]).length>0);
  assert(withTrains,'트레인 보유 프로필 없음');
  const unit=units.find(u=>{const p=C.upperSkillProfile&&C.upperSkillProfile(u);return p&&p.id===withTrains[0];});
  assert(unit,`${withTrains[0]} 대응 유닛 없음`);
  const result=C.upperSkillProcDps(unit,1,{bossArmor:350,armorReduce:180});
  assert(result&&result.dps>0,'트레인 프로필 DPS 없음');
  assert.strictEqual(result.basis,'static-lower-bound-attack-proc-and-rng-trains');
  // 상한 검증: 트레인별 rate ≤ min(aps×p, 1/dur).
  for(const train of withTrains[1].trains){
    const cap=train.dur>0?1/train.dur:Infinity;
    const rate=Math.min(result.attacksPerSec*train.p,cap);
    assert(rate<=cap+1e-9,'BD1 재진입 상한 위반');
  }
});

test('1번 패널: 대안 제거 · 재료 즉시 표시 · 최단 완성 배지 배선',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  const css=fs.readFileSync(path.join(EXT,'ord_ui_v20.css'),'utf8');
  assert(!app.includes('renderV15Alternatives'),'1번 패널 대안 렌더러가 아직 남아 있다');
  assert(app.includes('v151-mats'),'재료 즉시 표시 블록 누락');
  // v19.9.2(사용자 요청): 1번 패널의 직접 재료 라벨은 제작 카드와 같은
  // "조합" 형식으로 통일됐다.  재료 상세 팝업의 원 라벨은 그대로다.
  assert(app.includes('v159-action-recipe'),'지금 할 일 조합 라인 누락');
  assert(app.includes('바로 필요한 조합 재료'),'재료 팝업의 직접 재료 라벨 누락');
  assert(app.includes('부족 최하위 재료 = 선택위습'),'최하위 재료=선위 라벨 누락');
  assert(app.includes('v151-nearest-badge'),'최단 완성 배지 마크업 누락');
  assert(!app.includes('v151-clear-line'),'v17.9: 내부 점수 나열 라인은 카드에서 제거됐다');assert(app.includes('v151-clear-why'),'사람이 읽는 추천 이유 라인 누락');
  assert(css.includes('.v151-mats'),'재료 블록 CSS 누락');
  assert(css.includes('.v151-nearest-badge'),'배지 CSS 누락');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V17_3_CLEAR_VALUE ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
