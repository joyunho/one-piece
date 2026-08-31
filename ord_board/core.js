(function(global){
'use strict';
// ═══════════════════════════════════════════════════════════════════════
// ORD 악몽 보드 — 코어 (v28.1.0 전면 신작)
//
// 철학(사용자 확정, v26→신작 승계): 결정은 사용자가 티모지지를 보며
// 직접 내린다.  프로그램은 세 가지 사실만 보여준다 —
//   ① 지금 패로 만들 수 있는 전설급(+서로 겹치는 패)
//   ② 상위 실측 조합(악몽 클리어 코퍼스)
//   ③ 현재 파티 스펙
//
// 이 파일은 순수 함수만 담는다: 데이터(data.js 증류물) + 패(counts) 가
// 들어오면 표시용 사실이 나온다.  DOM·상태·타이머 없음.
// ═══════════════════════════════════════════════════════════════════════

const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const round2=v=>Math.round(num(v)*100)/100;

// ── 데이터 색인 ─────────────────────────────────────────────────────────
function buildIndex(data){
  const byId=new Map();
  for(const u of data.units)byId.set(u.id,u);
  const byCanon=new Map();
  for(const u of data.units){
    if(!u.upper)continue;
    if(!byCanon.has(u.canon))byCanon.set(u.canon,u);
  }
  const specialSet=new Set(data.playableSpecialIds||[]);
  const ignoreSet=new Set(data.ignoreCodes||[]);
  return{data,byId,byCanon,uppers:data.units.filter(u=>u.upper),legendish:data.units.filter(u=>u.legendish),
    specialSet,ignoreSet,wispId:data.wispId,superKumaId:data.superKumaId};
}

// ── 수신 번역: /datas(로우코드→수량) → 패(counts) ───────────────────────
// /datas 는 보유 유닛 전수를 준다(없으면 키 자체가 없음 = 0 이 진실).
function translateFeed(index,liveUnits){
  const counts={},unknown={};
  let matched=0,wisp=0,playable=0;
  const live=liveUnits&&typeof liveUnits==='object'?liveUnits:{};
  for(const code of Object.keys(live)){
    if(index.ignoreSet.has(code))continue;
    const count=Math.max(0,num(live[code]));
    const id=index.data.codeMap[code]||(index.byId.has(code)?code:'');
    if(!id){if(!/0e$/i.test(code)&&count>0)unknown[code]=count;continue;}
    counts[id]=num(counts[id])+count;
    matched+=1;
    if(id===index.wispId)wisp+=count;
    else if(!index.specialSet.has(id))playable+=count;
  }
  return{counts,matched,wisp,playable,unknown,ok:matched>0};
}

// 미해석 코드 안정화: 같은 수량으로 연속 3회 관측된 것만 인정(전투 임시
// 개체의 초단위 요동이 보드를 흔들지 않게 — 0805 실측 지식 승계).
function stabilizeUnknown(previous,unknown,now){
  const prior=previous&&previous.codes||{};
  const codes={},stable={};
  for(const code of Object.keys(unknown||{})){
    const count=Math.max(0,num(unknown[code]));
    if(count<=0)continue;
    const before=prior[code];
    const streak=before&&num(before.count)===count?num(before.streak)+1:1;
    codes[code]={count,streak,lastAt:num(now)};
    if(streak>=3)stable[code]=count;
  }
  return{codes,stable};
}

// 자동 판 감지: 실전 유닛 0 → 비활성, 0→1 전이 때 세대 증가(새 판).
// 저장 기록 없이 첫 관측부터 유닛이 있으면(판 중간 첫 실행) 세대를
// 올리지 않는다 — 올리면 라운드가 1로 되돌아간다.
function nextAutoRound(previous,playable,now){
  const prior=previous&&typeof previous==='object'?previous:null;
  let generation=prior?Math.max(0,num(prior.generation)):0;
  let active=prior?prior.active===true:false;
  let startedAt=prior?Math.max(0,num(prior.startedAt)):0;
  if(playable<=0){active=false;startedAt=0;}
  else if(!active){if(prior)generation+=1;active=true;startedAt=Math.max(1,num(now)||Date.now());}
  return{generation,active,startedAt,playable:Math.max(0,num(playable))};
}

function countsFingerprint(counts,stableUnknown){
  const parts=Object.keys(counts||{}).sort().map(id=>id+':'+counts[id]);
  for(const code of Object.keys(stableUnknown||{}).sort())parts.push('?'+code+':'+stableUnknown[code]);
  return parts.join('|');
}

// ── 레시피 솔버 ─────────────────────────────────────────────────────────
// 의미론(게임 규칙): 흔함은 선택위습 1개로 산다(흔함 stuffs=[위습]) —
// 재귀가 자연히 위습 환산을 만든다.  부족한 희귀는 흔함까지 재귀해
// 위습으로 충당된다.  'hard' 티어(초월 쿠마 등 선행 유닛)·아이템·랜덤·
// 신비함은 조합으로 못 만든다 → 결손으로 남는다.
// 반환: {wispCost, consumed(재고에서 실제 소비), stockAfter,
//        hardMissing[{id,name,count}], missingCommons{id:count}}
function solve(index,targetId,initialCounts){
  const stock=Object.assign({},initialCounts||{});
  const consumed={},hardShort={},missingCommons={};
  let wispCost=0;
  const wispId=index.wispId;
  function acquire(id,qty,stack){
    qty=num(qty);if(qty<=0)return;
    if(id===wispId){wispCost+=qty;return;}
    const unit=index.byId.get(id);
    const tier=unit?unit.tier:(index.data.specialIds[id]?'hard':'other');
    const have=Math.min(Math.max(0,num(stock[id])),qty);
    if(have>0){stock[id]=num(stock[id])-have;consumed[id]=num(consumed[id])+have;qty-=have;}
    if(qty<=0)return;
    if(tier==='common')missingCommons[id]=num(missingCommons[id])+qty;
    if(stack.has(id)){hardShort[id]=num(hardShort[id])+qty;return;}
    const stuffs=unit&&unit.stuffs||[];
    const craftable=stuffs.length>0&&tier!=='hard'&&tier!=='other'&&!/아이템|기타|랜덤유닛|신비함/.test(unit&&unit.group||'');
    if(!craftable){hardShort[id]=num(hardShort[id])+qty;return;}
    const next=new Set(stack);next.add(id);
    for(const s of stuffs)acquire(s.id,num(s.count)*qty,next);
  }
  acquire(String(targetId),1,new Set());
  // hard = 선행 유닛(초월 쿠마 등 'hard' 티어)만.  아이템·랜덤·신비함
  // 결손은 게임 내 별도 획득 경로가 있어 조합 차단으로 세지 않는다
  // (구 정본과 동일 의미론 — 파리티 검증으로 고정).
  const hardMissing=Object.entries(hardShort)
    .filter(([id])=>{const u=index.byId.get(id);const tier=u?u.tier:(index.data.specialIds[id]?'hard':'other');return tier==='hard';})
    .map(([id,count])=>({id,count,name:index.data.specialIds[id]||(index.byId.get(id)||{}).short||id}));
  return{targetId:String(targetId),wispCost,consumed,stockAfter:stock,hardMissing,missingCommons};
}

// ── 조합식 계획(사용자 0831: "조합식도 나왔으면 · 선위를 어떻게 써야
// 하는지도 · 상위도 포함해서") ──────────────────────────────────────────
// 대상 하나의 제작 계획을 표시용으로 편다:
//  · direct  — 직접 조합 재료(보유/필요)
//  · eats    — 내 패에서 소비되는 희귀·특별·안흔
//  · wispPlan — 선위 사용처: 선위로 사야 하는 흔함 목록(= 솔버의
//               missingCommons.  흔함 1기 = 선위 1이라 합이 곧 선위다)
//  · wispCost/hardMissing — 총 선위·선행 결손
function recipePlan(index,targetId,counts){
  const unit=index.byId.get(String(targetId));
  if(!unit)return null;
  const result=solve(index,unit.id,counts);
  const nameOf=id=>{const m=index.byId.get(id);return m?m.short:(index.data.specialIds[id]||id);};
  const direct=(unit.stuffs||[]).map(s=>{
    const mat=index.byId.get(s.id);
    return{id:s.id,name:s.id===index.wispId?'선택위습':nameOf(s.id),need:num(s.count),owned:Math.max(0,num((counts||{})[s.id])),tier:mat?mat.tier:(index.data.specialIds[s.id]?'hard':'other')};
  });
  const wispPlan=Object.entries(result.missingCommons||{})
    .map(([id,count])=>{const mat=index.byId.get(id);return{id,name:nameOf(id),count:num(count),color:mat&&mat.color||''};})
    .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ko'));
  return{unit,direct,eats:eatsOf(index,result),wispPlan,wispCost:num(result.wispCost),hardMissing:result.hardMissing,owned:num((counts||{})[unit.id])>0};
}

// ── 패 파생 사실(게이트 입력) ───────────────────────────────────────────
function handFacts(index,counts){
  let seraphOwned=0,changedOwned=0,upperCanons=new Set();
  for(const[id,count]of Object.entries(counts||{})){
    if(num(count)<=0)continue;
    const u=index.byId.get(id);if(!u)continue;
    if(u.seraph)seraphOwned+=num(count);
    if(u.changed)changedOwned+=num(count);
    if(u.upper)upperCanons.add(u.canon);
  }
  return{seraphOwned,changedOwned,upperCanons,wisp:num((counts||{})[index.wispId])};
}

// ── ① 만들 수 있는 전설급 보드 ─────────────────────────────────────────
// 등재 규칙(사용자 계약 승계):
//  · 전설급만, 보유 제외 · 하드 결손 없음 · 계통 필터(공용 통과)
//  · 내 희귀·특별·안흔을 실제 소비하거나 지금 바로 가능(빈손 소음 봉합)
//  · 선위 10 이하 · 변화됨은 50라 이후 + 판당 2 · 세라핌은 판당 1
function eatsOf(index,result){
  const eats=[];
  for(const[id,need]of Object.entries(result.consumed||{})){
    const mat=index.byId.get(id);if(!mat)continue;
    if(!['rare','special','uncommon'].includes(mat.tier))continue;
    eats.push({id,name:mat.short,tier:mat.tier,need:num(need)});
  }
  return eats;
}
function craftRows(index,counts,opts){
  const mode=opts&&opts.mode||'';
  const round=num(opts&&opts.round)||1;
  const facts=handFacts(index,counts);
  const rows=[];
  for(const unit of index.legendish){
    if(num(counts[unit.id])>0)continue;
    if(unit.changed&&(round<50||facts.changedOwned>=2))continue;
    if(unit.seraph&&facts.seraphOwned>=1)continue;
    if(unit.family!=='neutral'&&mode&&unit.family!==mode)continue;
    const result=solve(index,unit.id,counts);
    if(result.hardMissing.length)continue;
    const eats=eatsOf(index,result);
    const cost=num(result.wispCost),gap=Math.max(0,cost-facts.wisp);
    if(!eats.length&&gap>0)continue;
    if(cost>index.data.maxWispCost)continue;
    rows.push({unit,cost,gap,ready:gap<=0,eats,result,locks:[]});
  }
  rows.sort((a,b)=>Number(b.ready)-Number(a.ready)||a.gap-b.gap||a.cost-b.cost||a.unit.short.localeCompare(b.unit.short,'ko'));
  // 상호배타(사용자: "이 패를 가면 이 패는 못가고 한눈에"): 이 행을 만든
  // 뒤(제작 결과물 +1 — 원형→왜곡 거짓 배타 방지) 다른 행을 재계산해
  // 선행이 끊기거나 선위가 상한을 넘으면 '못 감' — 사유까지 싣는다.
  const cap=num(index.data.conflictCap)||20;
  const scope=rows.slice(0,cap);
  for(const row of scope){
    const after=Object.assign({},row.result.stockAfter);
    after[row.unit.id]=num(after[row.unit.id])+1;
    const mine=new Set(row.eats.map(e=>e.id));
    for(const other of scope){
      if(other===row)continue;
      const re=solve(index,other.unit.id,after);
      const reCost=num(re.wispCost);
      if(!re.hardMissing.length&&reCost<=index.data.maxWispCost)continue;
      let cause;
      if(re.hardMissing.length)cause=`${re.hardMissing[0].name} 끊김`;
      else{
        const shared=[...new Set(other.eats.filter(e=>mine.has(e.id)).map(e=>e.name))];
        cause=shared.length?`${shared.slice(0,2).join('·')} 뺏겨 선위 ${reCost}`:`선위 ${reCost}로 폭등`;
      }
      row.locks.push({id:other.unit.id,name:other.unit.short,cause});
    }
  }
  return{rows,facts};
}

// 선택 여파(사용자: "확실하게 알 수 있도록"): 행 하나를 찍으면 사라지는
// 선택지(⛔)와 선위가 밀리는 선택지(⏳)를 그 자리에서 계산한다.
// 아무것도 소비하지 않는다 — 표시 전용.
function pickImpact(index,board,pickId){
  const row=board.rows.find(r=>r.unit.id===pickId);
  if(!row)return null;
  const after=Object.assign({},row.result.stockAfter);
  after[row.unit.id]=num(after[row.unit.id])+1;
  const wispAfter=Math.max(0,board.facts.wisp-row.cost);
  const gone=[],delayed=[];
  for(const other of board.rows){
    if(other===row)continue;
    const re=solve(index,other.unit.id,after);
    const reCost=num(re.wispCost);
    if(re.hardMissing.length||reCost>index.data.maxWispCost){
      const mine=new Set(row.eats.map(e=>e.id));
      const shared=[...new Set(other.eats.filter(e=>mine.has(e.id)).map(e=>e.name))];
      gone.push({id:other.unit.id,name:other.unit.short,
        cause:re.hardMissing.length?`${re.hardMissing[0].name} 끊김`:shared.length?`${shared.slice(0,2).join('·')} 뺏겨 선위 ${reCost}`:`선위 ${reCost}로 폭등`});
    }else if(other.ready&&reCost>wispAfter){
      delayed.push({id:other.unit.id,name:other.unit.short,extra:reCost-wispAfter});
    }
  }
  return{row,gone,delayed};
}

// ── ② 상위 실측 조합 ────────────────────────────────────────────────────
// 세라핌은 상위가 아니다(2.314 재검증 정본) — 기준 상위 후보는 정본
// 상위(제한·초월·불멸·영원)만.  초월은 초월 쿠마가 hard 선행이라 미보유
// 패에서 하드 결손으로 자연 배제된다.
function upperOptions(index,mode){
  const seen=new Set(),options=[];
  for(const unit of index.uppers){
    if(seen.has(unit.canon))continue;seen.add(unit.canon);
    if(unit.family!=='neutral'&&mode&&unit.family!==mode)continue;
    const stats=index.data.clear[unit.canon]||null;
    options.push({unit,games:num(stats&&stats.games)});
  }
  options.sort((a,b)=>b.games-a.games||a.unit.short.localeCompare(b.unit.short,'ko'));
  return options;
}

// 지금 패 추천 TOP3: 조합이 닫히고(하드 결손 없음) 내 패를 실제로
// 소비하거나 지금 바로 갈 수 있는 상위를, 도달 거리(선위 10 단위 버킷)
// → 클리어 실측 순으로 최대 3.  확정·완성 2기면 표시하지 않는다.
function upperPicks(index,counts,opts){
  const mode=opts&&opts.mode||'';
  const round=num(opts&&opts.round)||1;
  if(opts&&opts.lockedId)return[];
  const facts=handFacts(index,counts);
  if(facts.upperCanons.size>=2)return[];
  const best=new Map();
  for(const unit of index.uppers){
    if(facts.upperCanons.has(unit.canon))continue;
    if(unit.family!=='neutral'&&mode&&unit.family!==mode)continue;
    if(unit.changed&&round<50)continue;
    const result=solve(index,unit.id,counts);
    if(result.hardMissing.length)continue;
    const cost=num(result.wispCost);
    const eatsMine=Object.keys(result.consumed||{}).some(id=>{
      const mat=index.byId.get(id);if(!mat)return false;
      return['rare','special','uncommon'].includes(mat.tier)||(mat.legendish&&mat.tier!=='hard');
    });
    if(!eatsMine&&cost>facts.wisp)continue;
    const games=num((index.data.clear[unit.canon]||{}).games);
    const prev=best.get(unit.canon);
    if(!prev||cost<prev.cost)best.set(unit.canon,{unit,cost,games});
  }
  return[...best.values()]
    .sort((a,b)=>Math.floor(a.cost/10)-Math.floor(b.cost/10)||b.games-a.games||a.cost-b.cost||a.unit.short.localeCompare(b.unit.short,'ko'))
    .slice(0,3);
}

// 상위 몫: 기준 상위 트리가 현재 패에서 소비할 희귀·특별·안흔 —
// "다른 데 쓰면 패가 겹칩니다".
function upperReserve(index,counts,upperId){
  const unit=index.byId.get(String(upperId));
  if(!unit||num(counts[unit.id])>0)return null;
  const result=solve(index,unit.id,counts);
  const mats=eatsOf(index,result);
  if(!mats.length)return null;
  const order={rare:0,special:1,uncommon:2};
  mats.sort((a,b)=>order[a.tier]-order[b.tier]||b.need-a.need);
  return{unit,mats,ids:new Set(mats.map(m=>m.id))};
}

// 선택 상위의 실측 조합: 동반 전설(top8 등장률)·2상위 페어(판수순).
function upperCombos(index,counts,board,upperId){
  const canon=String((index.byId.get(String(upperId))||{}).canon||upperId);
  const sel=index.byCanon.get(canon)||null;
  if(!sel)return null;
  const stats=index.data.clear[canon]||{games:0,dualGames:0,partners:[],pairs:[]};
  const rowById=new Map(board.rows.map(r=>[r.unit.id,r]));
  const partners=[],hidden=[];
  for(const p of stats.partners||[]){
    const owned=num(counts[p.id])>0;
    const row=rowById.get(p.id);
    if(owned||row)partners.push({id:p.id,name:p.name,share:p.share,owned,row});
    else hidden.push(p);
  }
  const pairs=(stats.pairs||[]).map(p=>({unit:index.byCanon.get(p.id)||null,games:p.games})).filter(p=>p.unit);
  return{sel,games:num(stats.games),dualGames:num(stats.dualGames),partners,hiddenCount:hidden.length,pairs};
}

// ── ③ 현재 파티 스펙 ────────────────────────────────────────────────────
// 실보유 완성 유닛(전설급·상위)의 굳힌 역할 합산 — 판정이 아니라 사실.
function partySpec(index,counts,opts){
  const mode=opts&&opts.mode||'';
  const gorosei=opts&&opts.gorosei||'none';
  const t=index.data.targets;
  const sum={slow:0,triggerSlow:0,armor:0,triggerArmor:0,singleArmor:0,stackArmor:0,stun:0,boss:0,frenzy:0,
    magicDef:0,magicAmp:0,explosionAmp:0,finish:0,armorBreak:0,attack:0,speed:0,units:0};
  for(const[id,count]of Object.entries(counts||{})){
    const n=num(count);if(n<=0)continue;
    const u=index.byId.get(id);if(!u)continue;
    if(!u.legendish&&!u.upper)continue;
    const r=u.roles;
    sum.units+=n;
    sum.slow+=r.slow*n;sum.triggerSlow+=r.triggerSlow*n;
    sum.armor+=r.armor*n;sum.triggerArmor+=r.triggerArmor*n;sum.singleArmor+=r.singleArmor*n;sum.stackArmor+=r.stackArmor*n;
    sum.stun+=r.stun*n;
    if(r.boss)sum.boss+=n;if(r.frenzy)sum.frenzy+=n;
    sum.magicDef+=r.magicDef*n;sum.magicAmp+=r.magicAmp*n;sum.explosionAmp+=r.explosionAmp*n;
    if(!u.upper)sum.finish+=r.finishCredit*n;
    if(r.armorBreak)sum.armorBreak+=n;
    sum.attack+=r.attack*n;sum.speed+=r.speed*n;
  }
  const bossFrenzy=Math.min(sum.boss,sum.frenzy);
  const slowTarget=gorosei==='nasjuro'?t.slow.nasjuro:t.slow.base;
  const armorTarget=gorosei==='warcury'?t.armor.warcurySoft:t.armor.soft;
  const armorFull=gorosei==='warcury'?t.armor.warcuryFull:t.armor.full;
  const rows=[
    {key:'slow',label:'이감',current:round2(sum.slow),target:slowTarget,extra:sum.triggerSlow>0?`발동 +${round2(sum.triggerSlow)}`:''},
    {key:'armor',label:'방깎',current:round2(sum.armor),target:armorTarget,
      extra:[sum.triggerArmor>0?`발동 +${round2(sum.triggerArmor)}`:'',sum.stackArmor>0?`중첩 +${round2(sum.stackArmor)}`:''].filter(Boolean).join(' · '),full:armorFull},
    {key:'stun',label:'스턴',current:round2(sum.stun),target:t.stun.floor,safe:t.stun.safe},
    {key:'bossFrenzy',label:'광보잡',current:bossFrenzy,target:mode==='magic'?t.bossFrenzy.magic:t.bossFrenzy.physical}
  ];
  if(mode==='magic'){
    rows.push({key:'finish',label:'단·끝딜',current:round2(sum.finish),target:t.finishMagic});
    rows.push({key:'magicDef',label:'마방깎',current:round2(sum.magicDef),target:0,info:true});
    rows.push({key:'explosionAmp',label:'폭뎀증',current:round2(sum.explosionAmp),target:0,info:true});
  }else{
    rows.push({key:'armorBreak',label:'암브',current:sum.armorBreak,target:0,info:true});
  }
  for(const row of rows)row.gap=row.info?0:Math.max(0,round2(num(row.target)-num(row.current)));
  return{rows,sum,gorosei,goroseiNote:(t.gorosei[gorosei]||t.gorosei.none).note};
}

// 계통 자동 추정: 보유 전설급·상위의 계통 다수결(공용 제외).
function inferMode(index,counts){
  let physical=0,magic=0;
  for(const[id,count]of Object.entries(counts||{})){
    const n=num(count);if(n<=0)continue;
    const u=index.byId.get(id);if(!u||(!u.legendish&&!u.upper))continue;
    if(u.family==='physical')physical+=n;
    if(u.family==='magic')magic+=n;
  }
  if(physical===magic)return'';
  return physical>magic?'physical':'magic';
}

global.ORD_BOARD_CORE={
  VERSION:'28.1.0',
  num,esc,round2,
  buildIndex,translateFeed,stabilizeUnknown,nextAutoRound,countsFingerprint,
  solve,handFacts,craftRows,pickImpact,recipePlan,
  upperOptions,upperPicks,upperReserve,upperCombos,
  partySpec,inferMode
};
})(typeof window!=='undefined'?window:globalThis);
