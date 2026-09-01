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

test('③ 상위 — 후보에 세라핌 없음 · TOP5 규칙 · 상위 몫',()=>{
  const options=B.upperOptions(index,'');
  assert(options.length>=60,'상위 후보 수 이상');
  assert(!options.some(o=>o.unit.seraph||!o.unit.upper),'상위 후보 오염');
  const magicOptions=B.upperOptions(index,'magic');
  assert(!magicOptions.some(o=>o.unit.family==='physical'),'마딜 선택인데 물딜 상위');
  // TOP5(사용자 0901 "상위를 5개까지"): 빈손 0 · 확정 시 0 · 조합 닫힘 ·
  // 최대 5 — 후보가 5 이상인 패에서는 정확히 5가 나와야 한다.
  assert.strictEqual(B.upperPicks(index,{},{mode:'',round:1}).length,0,'빈손 추천');
  assert.strictEqual(B.upperPicks(index,rich,{mode:'',round:20,lockedId:'V80H'}).length,0,'확정 후 추천');
  const picks=B.upperPicks(index,rich,{mode:'magic',round:20});
  assert(picks.length>=1&&picks.length<=5,'추천 수 이상');
  const wide=Object.assign({},rich);wide[DATA.wispId]=60;
  const widePicks=B.upperPicks(index,wide,{mode:'',round:20});
  assert.strictEqual(widePicks.length,5,`선위 풍족 패 추천이 5가 아님: ${widePicks.length}`);
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
  // v30 live 기준(사용자 0831d): 완성 유닛 수는 전설·상위만 세지만,
  // 보유 희귀·특별·안흔의 직접 역할은 능력치에 합산된다.
  const matsOnly=B.partySpec(index,rich,{mode:'physical',gorosei:'none'});
  assert.strictEqual(matsOnly.sum.units,0,'재료가 완성 유닛 수로 합산됨');
  const expectMatSlow=DATA.units.filter(u=>['uncommon','special'].includes(u.tier)&&rich[u.id]).reduce((s,u)=>s+u.roles.slow*rich[u.id],0);
  assert(Math.abs(matsOnly.sum.slow-expectMatSlow)<1e-6,`희귀·특별 직접 역할 미합산: ${matsOnly.sum.slow} vs ${expectMatSlow}`);
  assert(matsOnly.sum.slow>0||matsOnly.sum.armor>0||matsOnly.sum.attack>0,'live 스펙이 전부 0');
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

test('⑦ 2상위 추천 — 실측 페어 × 지금 패 도달 (사용자 0831b)',()=>{
  const sel=B.upperOptions(index,'')[0];
  const pp=B.pairPicks(index,scarce,sel.unit.id,{mode:'',round:20});
  assert(pp.picks.length>=1&&pp.picks.length<=5,'추천 수 이상');
  const stats=DATA.clear[sel.unit.canon];
  for(const p of pp.picks){
    assert(p.unit.upper&&!p.unit.seraph,'상위 아닌 2상위 추천');
    assert(p.unit.canon!==sel.unit.canon,'선택 상위 자신을 추천');
    assert(p.games>0&&(stats.pairs||[]).some(x=>x.id===p.unit.canon&&x.games===p.games),'실측 페어 아님');
    const result=B.solve(index,p.unit.id,scarce);
    assert(!result.hardMissing.length,'조합 안 닫히는 2상위 추천');
    assert.strictEqual(p.cost,result.wispCost,'선위 표기 불일치');
  }
  // 정렬: 도달 버킷(선위 10) → 동반 판수.
  for(let i=1;i<pp.picks.length;i++){
    const a=pp.picks[i-1],b=pp.picks[i];
    const ab=Math.floor(a.cost/10),bb=Math.floor(b.cost/10);
    assert(ab<bb||(ab===bb&&a.games>=b.games),'추천 정렬 위반');
  }
  // 이미 보유한 상위 canon 은 추천하지 않는다.
  if(pp.picks.length){
    const withPair=Object.assign({},scarce);withPair[pp.picks[0].unit.id]=1;
    const again=B.pairPicks(index,withPair,sel.unit.id,{mode:'',round:20});
    assert(!again.picks.some(p=>p.unit.canon===pp.picks[0].unit.canon),'보유 상위를 또 추천');
  }
  // 계통 게이트 + 숨김 정직성.
  const magic=B.pairPicks(index,scarce,sel.unit.id,{mode:'magic',round:20});
  assert(!magic.picks.some(p=>p.unit.family==='physical'),'마딜인데 물딜 2상위 추천');
  assert(pp.hidden>=0&&(pp.picks.length+pp.hidden)>=Math.min(3,(stats.pairs||[]).length?1:0),'숨김 집계 이상');
});

test('⑧ 라운드 시계 — 맵 JASS 정본(35/60 · 전환70 · 신세계32) + 재앵커 불변식 (사용자 0831c·0831d 교정)',()=>{
  const now=1700000000000;
  // 수동(시계 없음)
  const manual=B.roundClock(0,now);
  assert(!manual.running&&manual.round===0,'기점 0인데 시계가 돈다');
  // 준비 구간: 기점 직후 30초는 라운드 0 (0831f 실측 보정 — 시작 유닛은
  // 1라보다 ~30초 먼저 잡힌다)
  const prep=B.roundClock(now-3000,now);
  assert(prep.running&&prep.prep&&prep.round===0&&prep.remaining===27,`준비 구간 오류: ${JSON.stringify(prep)}`);
  // 1라 진행: 준비 뒤 34초까지 1라, 35초에 2라
  assert.strictEqual(B.roundClock(now-(30+34)*1000,now).round,1,'35초 전 1라 유지 실패');
  assert.strictEqual(B.roundClock(now-(30+35)*1000,now).round,2,'35초에 2라 전환 실패');
  // 전반 보스(10/20/30/40/50)는 60초
  const boss=B.roundClock(B.clockAnchor(10,now),now);
  assert(boss.round===10&&boss.boss===true&&boss.remaining===60,`10라 보스 오류: ${JSON.stringify(boss)}`);
  assert.strictEqual(B.roundClock(B.clockAnchor(10,now)-59000,now).round,10,'보스 59초 유지 실패');
  assert.strictEqual(B.roundClock(B.clockAnchor(10,now)-60000,now).round,11,'보스 60초 전환 실패');
  // 신세계 전환: 50라 60초 뒤 70초 전환 구간(라운드 50 유지·shift 표기)
  const shift=B.roundClock(B.clockAnchor(50,now)-60000,now);
  assert(shift.shift===true&&shift.round===50&&shift.remaining===70,`신세계 전환 오류: ${JSON.stringify(shift)}`);
  assert.strictEqual(B.clockAnchor(51,now)-B.clockAnchor(50,now),-(60+70)*1000,'50→51 간격이 60+70초가 아님');
  // 신세계 51~65라는 전부 32초 — 55/60/65 보스는 동시 스폰(추가 시간 없음)
  assert.strictEqual(B.roundClock(B.clockAnchor(51,now)-31000,now).round,51,'51라 32초 유지 실패');
  assert.strictEqual(B.roundClock(B.clockAnchor(51,now)-32000,now).round,52,'51라 32초 전환 실패');
  const co=B.roundClock(B.clockAnchor(55,now),now);
  assert(co.round===55&&co.boss===true&&co.remaining===32,`55라 동시 스폰 오류: ${JSON.stringify(co)}`);
  assert.strictEqual(B.roundClock(B.clockAnchor(55,now)-32000,now).round,56,'55라가 60초로 계산됨(구 오류)');
  // 재앵커 불변식: 1..65 전 라운드
  for(let r=1;r<=B.MAX_ROUND;r++)assert.strictEqual(B.roundClock(B.clockAnchor(r,now),now).round,r,`재앵커 불변식 붕괴 r=${r}`);
  assert.strictEqual(B.MAX_ROUND,65,'최대 라운드는 65');
  // 상한: 아주 오래 지나도 65에서 멈추고 남은 초 0
  const capped=B.roundClock(now-9e7,now);
  assert(capped.round===65&&capped.remaining===0,`65 상한 오류: ${JSON.stringify(capped)}`);
});

test('⑨ 유니크 아이템 게이트 — 없으면 추천 금지 (사용자 0831d)',()=>{
  const itemIds=new Set(DATA.units.filter(u=>u.group==='아이템').map(u=>u.id));
  const needy=DATA.units.filter(u=>(u.stuffs||[]).some(s=>itemIds.has(s.id)));
  assert(needy.length>=4,`아이템 필요 유닛 표본 부족: ${needy.length}`);
  for(const u of needy){
    const r=B.solve(index,u.id,rich);
    assert(r.itemMissing.length>0,`아이템 결손 미탐지: ${u.name}`);
    assert.strictEqual(r.hardMissing.length+0,r.hardMissing.length,'hardMissing 의미 불변');
  }
  // 아이템을 손에 쥐면 결손이 사라진다(추천 재개)
  const withItem=Object.assign({},rich);
  for(const id of itemIds)withItem[id]=1;
  for(const u of needy)
    assert.strictEqual(B.solve(index,u.id,withItem).itemMissing.length,0,`아이템 보유에도 결손: ${u.name}`);
  // 게이트 전수: 보드·상위 TOP3·2상위 추천 어디에도 아이템 결손 유닛 없음
  const board=B.craftRows(index,rich,{mode:'',round:60});
  for(const row of board.rows)assert.strictEqual(row.result.itemMissing.length,0,`보드에 아이템 결손: ${row.unit.name}`);
  for(const p of B.upperPicks(index,rich,{mode:'',round:60,lockedId:''}))
    assert.strictEqual(B.solve(index,p.unit.id,rich).itemMissing.length,0,`TOP3 에 아이템 결손: ${p.unit.name}`);
  const withPairs=index.uppers.find(u=>DATA.clear[u.canon]&&(DATA.clear[u.canon].pairs||[]).length>10);
  for(const p of B.pairPicks(index,rich,withPairs.id,{mode:'',round:60}).picks)
    assert.strictEqual(B.solve(index,p.unit.id,rich).itemMissing.length,0,`2상위에 아이템 결손: ${p.unit.name}`);
  // 조합식 계획은 결손을 정직하게 표시
  assert(B.recipePlan(index,needy[0].id,rich).itemMissing.length>0,'조합식 계획에 특수 재료 결손 없음');
});

test('⑩ 첫 희귀 최속 + 짤 희귀 (사용자 0831d)',()=>{
  const fr=B.firstRares(index,scarce);
  assert.strictEqual(fr.picks.length,3,'첫 희귀 TOP3 아님');
  for(const p of fr.picks)assert.strictEqual(p.unit.tier,'rare',`희귀 아님: ${p.unit.name}`);
  for(let i=1;i<fr.picks.length;i++)assert(fr.picks[i-1].cost<=fr.picks[i].cost,'첫 희귀 비용 정렬 붕괴');
  // 첫 희귀 국면(0831g 교정): 희귀·전설급·상위를 하나도 안 쥔 동안만.
  // 152 진화체는 첫 희귀보다 먼저 잡히므로 기준이 아니다.
  assert.strictEqual(fr.firstPhase,false,'희귀 보유 픽스처인데 첫 희귀 국면');
  const preRare={};let unA=0;for(const u of DATA.units){if(u.tier==='uncommon'&&unA<6){preRare[u.id]=1;unA++;}}
  preRare[DATA.wispId]=5;
  assert.strictEqual(B.firstRares(index,preRare).firstPhase,true,'안흔만 쥔 초반이 첫 희귀 국면이 아님');
  const withEvo=Object.assign({},preRare);
  const evo=DATA.units.find(u=>u.tier==='special');
  withEvo[evo.id]=1;
  const frEvo=B.firstRares(index,withEvo);
  assert(frEvo.specialOwned>0&&frEvo.firstPhase===true,'152 진화체가 첫 희귀 국면을 끝내면 안 된다(희귀 전 획득)');
  const withRare=Object.assign({},preRare);
  const anyRare=DATA.units.find(u=>u.tier==='rare');
  withRare[anyRare.id]=1;
  assert.strictEqual(B.firstRares(index,withRare).firstPhase,false,'첫 희귀를 쥐어도 국면이 안 끝남');
  // 짤 희귀: 희귀만 · 역할 태그(방깎/이감/공증) · 지금 선위 내 · 비용 정렬
  const fill=B.fillerRares(index,rich);
  assert(fill.picks.length>0,'풍족 패에서 짤 희귀 0');
  const wisp=B.num(rich[DATA.wispId]);
  for(const p of fill.picks){
    assert.strictEqual(p.unit.tier,'rare',`희귀 아님: ${p.unit.name}`);
    assert(p.cost<=wisp,`선위 초과 짤 희귀: ${p.unit.name} ${p.cost}`);
    assert(p.tags.length&&p.tags.every(t=>['방깎','이감','공증'].includes(t)),`역할 태그 오류: ${p.tags}`);
  }
  for(let i=1;i<fill.picks.length;i++)assert(fill.picks[i-1].cost<=fill.picks[i].cost,'짤 희귀 비용 정렬 붕괴');
});

test('⑪ TMO 페이지 정합 + 현재 능력치 전 유닛 합산 (사용자 0831h)',()=>{
  // 사용자가 붙여넣은 티모지지 조합도우미 페이지(2026-08-31)의 유닛 DB
  // 수치가 증류 정본이다 — 드리프트 파수꾼(밸런스 변경 반영 확인).
  const r=id=>index.byId.get(id).roles;
  assert.strictEqual(r('unit_1779016653060_4000').explosionAmp,30,'S-스네이크 폭뎀증 30 아님');
  assert.strictEqual(r('A50h').attack,78,'버기 영원 공증 78 아님');
  assert.strictEqual(r('C50h').armor,55,'핸콕 영원 방깍 55 아님');
  assert.strictEqual(r('KB0H').stun,1,'니카 스턴 1 아님');
  assert.strictEqual(r('E90H').triggerSlow,45,'도플라밍고 초월 발동이감 45 아님');
  assert.strictEqual(r('790H').slow,70,'아오키지 초월 이감 70 아님');
  assert(r('XB0H').triggerArmor===40&&r('XB0H').stackArmor===0,'보니 발동깍40/중첩깍0 정리 안 됨');
  assert.strictEqual(r(DATA.codeMap['AI04']).slow,12,'둔화의지팡이 이감 12 아님');
  assert(r(DATA.codeMap['AI08']).speed===4&&r(DATA.codeMap['AI08']).attack===0,'가죽장갑은 공속증 유지(TMO 자기모순 필드 미채택)');
  // 현재 능력치 셈법: 사이트처럼 보유 '전' 유닛 합산 — 아이템·특수함도
  // 게이지에 들어간다(별도 능력치 API 없음이 페이지 분석으로 확정).
  const counts={};
  counts[DATA.codeMap['AI04']]=1;            // 둔화의지팡이 이감12
  counts['unit_1767884516176_6218']=1;        // 특수함 블고리 방깍25
  counts['unit_1767884539590_2352']=1;        // 특수함 베티 공속11 체젠1.25 마젠1.25
  const spec=B.partySpec(index,counts,{mode:'physical',gorosei:'none'});
  assert.strictEqual(spec.rows.find(x=>x.key==='slow').current,12,'아이템 이감 미합산');
  assert.strictEqual(spec.rows.find(x=>x.key==='armor').current,25,'특수함 방깍 미합산');
  assert.strictEqual(spec.rows.find(x=>x.key==='speed').current,11,'공속 정보 줄 부재');
  assert.strictEqual(spec.rows.find(x=>x.key==='regen').current,1.25,'체젠 정보 줄 부재');
  assert.strictEqual(spec.rows.find(x=>x.key==='mana').current,1.25,'마젠 정보 줄 부재');
  assert.strictEqual(spec.sum.units,0,'아이템·특수함이 완성 유닛 수로 합산됨');
  for(const k of ['attack','speed','regen','mana'])
    assert(!B.partySpec(index,{},{mode:'physical'}).rows.some(x=>x.key===k),'빈 패에 버프 정보 줄이 떠 있음: '+k);
  // 악몽 목표 교차 검증: 페이지의 가짜 필터 유닛(풀이감 102 · 풀방깍 211)
  // = 이 저장소 targets 와 동일해야 한다.
  assert.strictEqual(DATA.targets.slow.base,102,'풀이감 102 불일치');
  assert.strictEqual(DATA.targets.armor.full,211,'풀방깍(악몽) 211 불일치');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`ORD_BOARD_CORE ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
