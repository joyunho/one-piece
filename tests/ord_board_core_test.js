'use strict';

// ORD 악몽 보드(v28 전면 신작) — 코어 계약.
//
// v26 보조 모드에서 사용자가 확정한 규칙들을 신작 코어가 그대로
// 지키는지 계약한다: 전설급 등재 규칙 · 배타 · 선택 여파 · 상위
// TOP3 · 상위 몫 · 파티 스펙 · 수신 번역 · 자동 판 감지.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const NEW=path.join(__dirname,'..','ord_board');
const ctx={console};ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
for(const f of ['data.js','core.js'])vm.runInContext(fs.readFileSync(path.join(NEW,f),'utf8'),ctx,{filename:f});
const B=ctx.ORD_BOARD_CORE,DATA=ctx.ORD_BOARD_DATA;
const index=B.buildIndex(DATA);
const num=B.num;

const rich=(()=>{const c={};for(const u of DATA.units)if(['common','uncommon','special'].includes(u.tier)&&u.id!==DATA.wispId)c[u.id]=2;c[DATA.wispId]=8;return c;})();
const scarce=(()=>{const c={};let r=0,un=0,co=0;for(const u of DATA.units){if(u.tier==='rare'&&r<7){c[u.id]=1;r++;}if(u.tier==='uncommon'&&un<8){c[u.id]=1;un++;}if(u.tier==='common'&&u.id!==DATA.wispId&&co<6){c[u.id]=1;co++;}}c[DATA.wispId]=6;return c;})();

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① 전설급 등재 — 빈손 0 · 선위 상한 · 내 재료 소비 · 게이트',()=>{
  assert.strictEqual(B.craftRows(index,{},{mode:'',round:1}).rows.length,0,'빈손인데 목록이 뜬다');
  const board=B.craftRows(index,rich,{mode:'magic',round:20});
  assert(board.rows.length>=5,'풍족 패에서 목록이 비었다');
  for(const row of board.rows){
    assert(row.unit.legendish,`전설급 아님: ${row.unit.name}`);
    assert(num(rich[row.unit.id])<=0,`보유 유닛 등재: ${row.unit.name}`);
    assert(row.cost<=DATA.maxWispCost,`선위 상한 초과: ${row.unit.name} ${row.cost}`);
    assert(row.eats.length>0||row.ready,`재료 소비 없는 선위 전액 경로: ${row.unit.name}`);
    assert(!(row.unit.family!=='neutral'&&row.unit.family!=='magic'),`마딜 선택인데 물딜 등재: ${row.unit.name}`);
    assert(!row.unit.changed,'50라 전인데 변화됨 등재');
    assert(!B.solve(index,row.unit.id,rich).hardMissing.length,`하드 결손 등재: ${row.unit.name}`);
  }
  for(let i=1;i<board.rows.length;i++){
    const a=board.rows[i-1],b=board.rows[i];
    if(a.ready!==b.ready){assert(a.ready,'정렬: 지금 가능이 뒤로 밀림');continue;}
    assert(a.gap<=b.gap,'정렬: 선위 부족 오름차순 위반');
  }
  // 세라핌 판당 1: 세라핌을 이미 쥐면 다른 세라핌이 빠진다.
  const seraph=DATA.units.find(u=>u.seraph);
  const withSeraph=Object.assign({},rich);withSeraph[seraph.id]=1;
  const gated=B.craftRows(index,withSeraph,{mode:'',round:20});
  assert(!gated.rows.some(r=>r.unit.seraph),'세라핌 보유인데 세라핌이 또 등재');
  // 변화됨은 50라 이후 등장 가능.
  const late=B.craftRows(index,rich,{mode:'',round:55});
  const early=B.craftRows(index,rich,{mode:'',round:20});
  assert(!early.rows.some(r=>r.unit.changed),'50라 전 변화됨 등재');
  assert(late.rows.length>=early.rows.length,'50라 이후 목록이 오히려 줄었다');
});

test('② 배타·선택 여파 — 재계산 규칙 파리티 + 소비 없음',()=>{
  const board=B.craftRows(index,scarce,{mode:'',round:20});
  assert(board.rows.length>=2,'희소 픽스처 목록 부족');
  assert(board.rows.some(r=>r.locks.length>0),'희소 패인데 배타가 전혀 없다');
  for(const row of board.rows.slice(0,DATA.conflictCap)){
    for(const lock of row.locks){
      const after=Object.assign({},row.result.stockAfter);
      after[row.unit.id]=num(after[row.unit.id])+1;
      const re=B.solve(index,lock.id,after);
      assert(re.hardMissing.length||re.wispCost>DATA.maxWispCost,`배타 재검산 불일치: ${row.unit.name} → ${lock.name}`);
      assert(/끊김|뺏겨|폭등/.test(lock.cause),`배타 사유 없음: ${lock.cause}`);
    }
  }
  const before=JSON.stringify(scarce);
  const impact=B.pickImpact(index,board,board.rows[0].unit.id);
  assert(impact&&Array.isArray(impact.gone)&&Array.isArray(impact.delayed),'선택 여파 구조 이상');
  assert.strictEqual(JSON.stringify(scarce),before,'선택 여파가 패를 소비했다');
  for(const g of impact.gone){
    const after=Object.assign({},board.rows[0].result.stockAfter);
    after[board.rows[0].unit.id]=num(after[board.rows[0].unit.id])+1;
    const re=B.solve(index,g.id,after);
    assert(re.hardMissing.length||re.wispCost>DATA.maxWispCost,`사라짐 재검산 불일치: ${g.name}`);
  }
});

test('③ 상위 — 후보에 세라핌 없음 · TOP3 규칙 · 상위 몫',()=>{
  const options=B.upperOptions(index,'');
  assert(options.length>=60,'상위 후보 수 이상');
  assert(!options.some(o=>o.unit.seraph||!o.unit.upper),'상위 후보 오염');
  const magicOptions=B.upperOptions(index,'magic');
  assert(!magicOptions.some(o=>o.unit.family==='physical'),'마딜 선택인데 물딜 상위');
  // TOP3: 빈손 0 · 확정 시 0 · 조합 닫힘 · 최대 3.
  assert.strictEqual(B.upperPicks(index,{},{mode:'',round:1}).length,0,'빈손 추천');
  assert.strictEqual(B.upperPicks(index,rich,{mode:'',round:20,lockedId:'V80H'}).length,0,'확정 후 추천');
  const picks=B.upperPicks(index,rich,{mode:'magic',round:20});
  assert(picks.length>=1&&picks.length<=3,'추천 수 이상');
  for(const p of picks){
    assert(p.unit.upper&&!p.unit.seraph,'상위 아닌 추천');
    assert(!B.solve(index,p.unit.id,rich).hardMissing.length,'조합 안 닫히는 추천');
    assert(p.unit.family!=='physical','마딜인데 물딜 추천');
  }
  // 완성 상위 2기면 추천 없음.
  const two={};const uppers=index.uppers.filter(u=>u.canon===u.id).slice(0,2);
  const withTwo=Object.assign({},rich);for(const u of index.uppers.slice(0,8))if(new Set(index.uppers.slice(0,8).map(x=>x.canon)).size>=2)withTwo[u.id]=1;
  const canons=new Set(index.uppers.filter(u=>num(withTwo[u.id])>0).map(u=>u.canon));
  if(canons.size>=2)assert.strictEqual(B.upperPicks(index,withTwo,{mode:'',round:20}).length,0,'상위 2기 완성인데 추천');
  // 상위 몫: 미보유 상위의 희귀·특별·안흔 소비만.
  const target=options.find(o=>{const r=B.solve(index,o.unit.id,rich);return!r.hardMissing.length&&Object.keys(r.consumed).length;});
  const reserve=B.upperReserve(index,rich,target.unit.id);
  assert(reserve&&reserve.mats.length>=1,'상위 몫이 비었다');
  for(const m of reserve.mats)assert(['rare','special','uncommon'].includes(m.tier),`상위 몫 티어 위반: ${m.name}`);
});

test('④ 파티 스펙 — 역할 합산 파리티 + 오로성 목표',()=>{
  const owned={};
  const legends=DATA.units.filter(u=>u.legendish).slice(0,6);
  for(const u of legends)owned[u.id]=1;
  const spec=B.partySpec(index,owned,{mode:'physical',gorosei:'none'});
  const slowRow=spec.rows.find(r=>r.key==='slow');
  const expectSlow=legends.reduce((s,u)=>s+u.roles.slow,0);
  assert(Math.abs(slowRow.current-B.round2(expectSlow))<1e-9,`이감 합산 불일치 ${slowRow.current} vs ${expectSlow}`);
  assert.strictEqual(slowRow.target,DATA.targets.slow.base);
  const nas=B.partySpec(index,owned,{mode:'physical',gorosei:'nasjuro'});
  assert.strictEqual(nas.rows.find(r=>r.key==='slow').target,DATA.targets.slow.nasjuro,'나스쥬로 이감 목표 미반영');
  const war=B.partySpec(index,owned,{mode:'physical',gorosei:'warcury'});
  assert.strictEqual(war.rows.find(r=>r.key==='armor').target,DATA.targets.armor.warcurySoft,'워큐리 방깎 목표 미반영');
  assert.strictEqual(B.partySpec(index,owned,{mode:'physical',gorosei:'none'}).rows.find(r=>r.key==='bossFrenzy').target,1.5);
  assert.strictEqual(B.partySpec(index,owned,{mode:'magic',gorosei:'none'}).rows.find(r=>r.key==='bossFrenzy').target,1);
  assert(B.partySpec(index,owned,{mode:'magic',gorosei:'none'}).rows.some(r=>r.key==='finish'),'마딜 단끝 줄 부재');
  // 재료 티어는 스펙에 안 섞인다.
  const matsOnly=B.partySpec(index,rich,{mode:'physical',gorosei:'none'});
  assert.strictEqual(matsOnly.sum.units,0,'재료가 완성 스펙으로 합산됨');
});

test('⑤ 수신 번역·판 감지 — 코드맵·무시·위습·콜드 스타트',()=>{
  const seraphless=DATA.units.find(u=>u.tier==='rare');
  const feed=B.translateFeed(index,{[seraphless.id]:2,'810e':5,'PA0H':1,'ZZZ9':3,'610e':4});
  assert.strictEqual(num(feed.counts[seraphless.id]),2,'직결 코드 번역 실패');
  assert.strictEqual(feed.wisp,5,'위습 집계 실패');
  assert(!('PA0H' in feed.unknown),'무시 코드가 미해석으로 샜다');
  assert(!('610e' in feed.unknown),'전투 임시(0e) 코드가 미해석으로 샜다');
  assert.strictEqual(num(feed.unknown['ZZZ9']),3,'미해석 수량 소실');
  assert.strictEqual(feed.playable,2,'실전 유닛 수 이상(위습 제외)');
  // 안정화: 같은 수량 3회 연속 관측만 인정.
  let stab=null;
  for(let i=0;i<3;i++)stab=B.stabilizeUnknown(stab,{ZZZ9:3},1000+i);
  assert.strictEqual(num(stab.stable.ZZZ9),3,'미해석 안정화 실패');
  assert(!B.stabilizeUnknown(null,{ZZZ9:3},1).stable.ZZZ9,'1회 관측이 즉시 안정 처리됨');
  // 판 감지: 저장 없음 + 첫 관측부터 유닛 있음 → 세대 유지(판 중간 합류).
  const mid=B.nextAutoRound(null,10,1000);
  assert.strictEqual(mid.generation,0,'판 중간 첫 실행에서 세대가 올랐다');
  assert(mid.active,'활성 전이 실패');
  const idle=B.nextAutoRound(mid,0,2000);
  assert(!idle.active,'유닛 0인데 활성 유지');
  const restart=B.nextAutoRound(idle,3,3000);
  assert.strictEqual(restart.generation,1,'새 판 세대 증가 실패');
});

test('⑥ 조합식 계획 — 직접 재료·선위 사용처 검산 (전설급·상위, 사용자 0831)',()=>{
  const board=B.craftRows(index,scarce,{mode:'',round:20});
  assert(board.rows.length>=2,'픽스처 목록 부족');
  for(const row of board.rows){
    const plan=B.recipePlan(index,row.unit.id,scarce);
    // 조합식 = 카탈로그 직접 재료 그대로(보유 수 포함).
    assert.strictEqual(plan.direct.length,row.unit.stuffs.length,`직접 재료 수 불일치: ${row.unit.name}`);
    for(let i=0;i<plan.direct.length;i++){
      assert.strictEqual(plan.direct[i].id,row.unit.stuffs[i].id,'직접 재료 순서 불일치');
      assert.strictEqual(plan.direct[i].owned,Math.max(0,num(scarce[plan.direct[i].id])),'보유 수 불일치');
    }
    // 선위 사용처: 흔함 1기=선위 1 — 사용처 합이 곧 총선위다.
    const sum=plan.wispPlan.reduce((s,w)=>s+w.count,0);
    assert.strictEqual(sum,plan.wispCost,`선위 사용처 합 불일치: ${row.unit.name} ${sum}!==${plan.wispCost}`);
    for(const w of plan.wispPlan)assert.strictEqual((index.byId.get(w.id)||{}).tier,'common',`선위 사용처에 흔함 아닌 재료: ${w.name}`);
    assert.strictEqual(plan.wispCost,row.cost,'보드 선위와 플랜 선위 불일치');
  }
  // 상위도 포함해서: 상위 표본 8종 — 같은 검산 + 하드 결손 정직 표기.
  const sample=index.uppers.filter(u=>u.canon===u.id).slice(0,8);
  assert(sample.length>=4,'상위 표본 부족');
  for(const u of sample){
    const plan=B.recipePlan(index,u.id,scarce);
    const sum=plan.wispPlan.reduce((s,w)=>s+w.count,0);
    assert.strictEqual(sum,plan.wispCost,`상위 선위 사용처 합 불일치: ${u.name}`);
    const re=B.solve(index,u.id,scarce);
    assert.strictEqual(plan.hardMissing.length,re.hardMissing.length,'하드 결손 표기 불일치');
  }
  // 흔함 색상 증류: 정본 9색이 굳어 있다.
  const colored=DATA.units.filter(u=>u.tier==='common'&&u.color);
  assert(colored.length>=8,`흔함 색상 소실: ${colored.length}`);
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`ORD_BOARD_CORE ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
