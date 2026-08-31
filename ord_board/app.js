(function(global){
'use strict';
// ═══════════════════════════════════════════════════════════════════════
// ORD 악몽 보드 — 앱 (v30.2.0 전면 신작)
//
// 상태·수신·렌더·이벤트만 담는다.  계산은 전부 core.js(순수 함수),
// 데이터는 data.js(빌드 타임 증류물).  옛 프로그램 파일은 로드하지
// 않는다.
//
// 화면 = 상단 스트립 + 보조 보드 3블록:
//   ① 만들 수 있는 전설급   ② 상위 실측 조합   ③ 현재 파티 스펙
// 결정은 사용자가 티모지지를 보며 직접 — 보드는 사실만 보여준다.
// ═══════════════════════════════════════════════════════════════════════
const B=global.ORD_BOARD_CORE,DATA=global.ORD_BOARD_DATA;
const {num,esc,round2}=B;
const STORE_KEY='ordBoardState.v28';
const V26_FILTERS=[
  ['','전체',()=>true],
  ['end','끝딜',r=>num(r.end)>0],
  ['single','단일',r=>num(r.single)>0],
  ['bossFrenzy','광보잡',r=>!!(r.boss||r.frenzy)],
  ['stun','스턴',r=>num(r.stun)>0],
  ['slow','이감',r=>num(r.slow)>0||num(r.triggerSlow)>0||num(r.singleSlow)>0],
  ['armor','방깎',r=>num(r.armor)>0||num(r.triggerArmor)>0||num(r.singleArmor)>0||num(r.stackArmor)>0||r.armorBreak],
  ['util','유틸·보조',r=>r.utility||r.supportDamage||r.deletion]
];
const PAGE=8;

function App(root){
  this.root=root;
  this.index=B.buildIndex(DATA);
  this.counts={};
  this.wisp=0;
  this.gold=0;
  this.lumber=0;
  this.scan=null;      // 로컬 서버 엔드포인트 조사 결과(데스크톱 셸이 1회 보냄)
  this.playable=0;
  this.lastGoodAt=0;
  this.auto=null;
  this.unknownStab=null;
  this.fingerprint='';
  this.state=Object.assign({
    mode:'',            // ''=자동 추정, physical, magic
    gorosei:'none',
    round:1,            // 수동 앵커 — 시계가 돌면 시계가 우선
    clockStartedAt:0,   // 라운드 시계 기점(0=수동) — 수신에서 자동 시작
    upperPick:'',
    pairPick:'',
    auxPick:'',         // 첫 희귀·짤 희귀 알약 선택(조합식 패널)
    drillRoot:'',       // 조합식 드릴다운이 붙은 패널의 유닛 id
    drill:[],           // 드릴다운 체인(재료 id 순서)
    filter:'',
    page:0,
    search:'',
    pick:''
  },this.load());
  if(!Array.isArray(this.state.drill))this.state.drill=[];
  // 재실행 = 새 시작(사용자 0831e): 라운드·시계는 세션을 넘겨 저장하지
  // 않는다.  판 중간에 다시 열면 수신 합류가 1라에서 시계를 이어 걸고,
  // ±로 실제 라운드에 맞추면 된다.  모드·오로성 등 설정은 유지.
  this.state.round=1;
  this.state.clockStartedAt=0;
  this.hudSig='';
  this.render();
  this.bind();
  const push=()=>this.pushHud();
  setInterval(push,400);
  // 라운드 시계: 초마다 남은 초만 갱신, 라운드가 넘어가면 전체 렌더.
  this._clockShown=-1;
  setInterval(()=>this.tickClock(),1000);
}
App.prototype.load=function(){
  try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{};}catch(_){return{};}
};
App.prototype.save=function(){
  try{localStorage.setItem(STORE_KEY,JSON.stringify(this.state));}catch(_){}
};
App.prototype.mode=function(){
  return this.state.mode||B.inferMode(this.index,this.counts);
};
// 유효 라운드: 시계가 돌면 시계, 아니면 수동 앵커.
App.prototype.roundNow=function(){
  const clk=B.roundClock(this.state.clockStartedAt,Date.now());
  return clk.running&&clk.round>0?clk.round:Math.max(1,num(this.state.round)||1);
};
App.prototype.clockLabel=function(clk){
  if(!clk.running)return`${Math.max(1,num(this.state.round)||1)}라 <i>수동</i>`;
  if(clk.prep)return`준비 <i>${clk.remaining}초</i>`;
  if(clk.shift)return`신세계 전환 <i>${clk.remaining}초</i>`;
  return`${clk.round}라 <i>${clk.boss?'보스 · ':''}${clk.remaining}초</i>`;
};
App.prototype.tickClock=function(){
  const clk=B.roundClock(this.state.clockStartedAt,Date.now());
  if(!clk.running){this._clockShown=-1;return;}
  const shown=clk.prep?0:clk.round;
  if(shown!==this._clockShown){
    this._clockShown=shown;
    if(clk.round>0){this.state.round=clk.round;this.save();}
    this.render();return;
  }
  const el=this.root&&typeof this.root.querySelector==='function'?this.root.querySelector('[data-clock]'):null;
  if(el)el.innerHTML=this.clockLabel(clk);
};

// ── 수신 ────────────────────────────────────────────────────────────────
App.prototype.onFeed=function(payload){
  const units=payload&&typeof payload.units==='object'?payload.units:null;
  if(!units)return;
  const now=Date.now();
  const feed=B.translateFeed(this.index,units);
  this.unknownStab=B.stabilizeUnknown(this.unknownStab,feed.unknown,now);
  const wasActive=!!(this.auto&&this.auto.active);
  const auto=B.nextAutoRound(this.auto,feed.playable,now);
  const newGame=this.auto&&auto.generation!==this.auto.generation;
  this.auto=auto;
  if(wasActive&&!auto.active&&(this.state.clockStartedAt||this.state.round>1)){
    // 판 종료(실전 유닛 0, 사용자 0831e): 시계를 멈추고 라운드를 1로
    // 초기화한다 — 다음 판은 첫 유닛 감지가 다시 1라를 앵커한다.
    this.state.round=1;this.state.clockStartedAt=0;this.save();
  }
  if(!feed.ok&&feed.playable<=0&&!Object.keys(feed.counts).length)return;
  this.lastGoodAt=now;
  const fp=B.countsFingerprint(feed.counts,this.unknownStab.stable);
  if(fp===this.fingerprint&&!newGame)return;
  this.fingerprint=fp;
  this.counts=feed.counts;
  this.wisp=feed.wisp;
  this.gold=feed.gold;
  this.lumber=feed.lumber;
  this.playable=feed.playable;
  if(newGame){
    // 새 판: 라운드·선택 초기화(모드·오로성은 유지 — 세션 설정).
    // 첫 유닛 감지 = 1라 시작 — 시계를 자동으로 앵커한다(사용자 0831c).
    this.state.round=1;this.state.clockStartedAt=B.clockAnchor(1,auto.startedAt||now);
    this.state.upperPick='';this.state.pairPick='';this.state.auxPick='';this.state.drillRoot='';this.state.drill=[];
    this.state.pick='';this.state.page=0;this.save();
  }else if(auto.active&&!this.state.clockStartedAt){
    // 판 중간 합류: 현재 수동 라운드에서 시계를 이어 시작 — ±로 맞추면
    // 그대로 이어진다(구 정본 UX 승계).
    this.state.clockStartedAt=B.clockAnchor(Math.max(1,num(this.state.round)||1),now);this.save();
  }
  this.render();
};
App.prototype.stale=function(){
  return!this.lastGoodAt||Date.now()-this.lastGoodAt>8000;
};

// ── 렌더 ────────────────────────────────────────────────────────────────
App.prototype.render=function(){
  const mode=this.mode();
  const board=B.craftRows(this.index,this.counts,{mode,round:this.roundNow()});
  const spec=B.partySpec(this.index,this.counts,{mode,gorosei:this.state.gorosei});
  this.root.innerHTML=
    this.renderStrip(mode)+
    `<main class="board-wrap">`+
      (this.stale()?`<div class="stale"><b>TMO 수신 대기</b><span>아래는 마지막으로 읽은 패 기준입니다 — TMO.GG 데스크톱과 게임 실행을 확인하세요.</span><button data-act="probe">다시 읽기</button></div>`:'')+
      `<p class="board-note">결정은 티모지지를 보며 직접 — 보드는 사실만 보여줍니다.</p>`+
      `<div class="board">`+
        `<section class="block b1"><header><b>만들 수 있는 전설급</b><small>지금 보유 재료 기준 · 선위 ${this.index.data.maxWispCost} 이하 · 행을 누르면 겹치는 패 영향</small></header>${this.renderCraft(board)}</section>`+
        `<section class="block b2"><header><b>상위 실측 조합</b><small>악몽 클리어 코퍼스 — 표시 전용, 결정은 직접</small></header>${this.renderUppers(board,mode)}</section>`+
        `<section class="block b3"><header><b>현재 파티 스펙</b><small>실보유 완성 유닛 기준</small></header>${this.renderSpec(spec,mode)}</section>`+
      `</div>`+
    `</main>`;
  this.pushHud(board,spec,mode);
};
App.prototype.renderStrip=function(mode){
  const inferred=!this.state.mode&&mode;
  const g=this.index.data.targets.gorosei;
  return`<header class="strip">`+
    `<div class="logo"><b>ORD 악몽 보드</b><small>2.314 · v${DATA.version}</small></div>`+
    `<div class="round-ctl"><button data-act="round" data-value="-1">−</button><b data-clock data-act="sync" title="라운드 시계 — 수신에서 자동 시작.  ± = 라운드 보정, 숫자 탭 = 인게임 라운드가 막 바뀐 순간 눌러 초 단위 동기화">${this.clockLabel(B.roundClock(this.state.clockStartedAt,Date.now()))}</b><button data-act="round" data-value="1">＋</button></div>`+
    `<div class="seg">`+
      `<button data-act="mode" data-value="" class="${this.state.mode===''?'on':''}">자동${inferred?` · ${mode==='magic'?'마딜':'물딜'}`:''}</button>`+
      `<button data-act="mode" data-value="physical" class="${this.state.mode==='physical'?'on':''}">물딜</button>`+
      `<button data-act="mode" data-value="magic" class="${this.state.mode==='magic'?'on':''}">마딜</button>`+
    `</div>`+
    `<select class="gorosei" data-opt="gorosei" aria-label="오로성">${Object.keys(g).map(key=>`<option value="${key}" ${this.state.gorosei===key?'selected':''}>오로성 · ${esc(g[key].label)}</option>`).join('')}</select>`+
    `<span class="chip">선위 <b>${this.wisp}</b></span>`+
    `<span class="chip">실전 유닛 <b>${this.playable}</b></span>`+
    `<span class="feed ${this.stale()?'':'on'}"><i></i><small>${this.stale()?'TMO 미연결':'로컬 직결 수신 중'}</small></span>`+
  `</header>`;
};

// ── ① 전설급 ────────────────────────────────────────────────────────────
App.prototype.renderCraft=function(board){
  const rows=board.rows;
  const chips=V26_FILTERS.map(([key,label,test])=>{
    const count=key?rows.filter(r=>test(r.unit.roles)).length:rows.length;
    return`<button class="filter ${this.state.filter===key?'on':''}" data-act="filter" data-value="${key}">${label} <i>${count}</i></button>`;
  }).join('');
  const active=V26_FILTERS.find(([key])=>key&&key===this.state.filter);
  const view=active?rows.filter(r=>active[2](r.unit.roles)):rows;
  if(!view.length){
    return`<div class="filters">${chips}</div>${this.renderAux(board)}<div class="empty-panel"><i>✦</i><b>${active?`${esc(active[1])} 역할로 지금 만들 수 있는 전설급이 없습니다`:'지금 가진 희귀·재료로 닿는 전설급이 없습니다'}</b><small>${active?'다른 필터를 보거나 전체로 돌아가세요.':'게임에서 희귀가 잡히면 여기부터 채워집니다 — 결정은 티모지지를 보며 직접.'}</small></div>`;
  }
  const pages=Math.max(1,Math.ceil(view.length/PAGE));
  const page=Math.min(Math.max(0,num(this.state.page)),pages-1);
  const slice=view.slice(page*PAGE,page*PAGE+PAGE);
  const impact=this.state.pick?B.pickImpact(this.index,board,this.state.pick):null;
  const goneById=new Map((impact&&impact.gone||[]).map(x=>[x.id,x]));
  const delayedById=new Map((impact&&impact.delayed||[]).map(x=>[x.id,x]));
  const cards=slice.map(row=>{
    const u=row.unit;
    const face=u.image?`<img class="face" src="${esc(u.image)}" alt="" loading="lazy">`:`<span class="face-ph">${esc(u.short.charAt(0))}</span>`;
    const fam=u.family!=='neutral'?`<i class="fam ${u.family}">${u.family==='magic'?'마딜':'물딜'}</i>`:'';
    const story=u.story?`<i class="story-badge">스토리 ${esc(u.story.tier)}${u.story.rank?` · ${u.story.rank}위`:''}</i>`:'';
    const gone=goneById.get(u.id),delayed=delayedById.get(u.id);
    const tag=gone?`<i class="dead-tag">⛔ ${esc((impact.row.unit.short))} 가면 못 감</i>`:delayed?`<i class="delay-tag">⏳ 선위 ${delayed.extra} 밀림</i>`:'';
    const lockLine=row.locks.length?`<span class="locks">이걸 가면 못 감: ${row.locks.slice(0,2).map(l=>`${esc(l.name)} <i>(${esc(l.cause)})</i>`).join(' · ')}${row.locks.length>2?` <i>외 ${row.locks.length-2}</i>`:''}</span>`:'';
    const cls=['card',row.ready?'ready':'',this.state.pick===u.id?'picked':'',gone?'dead':'',delayed?'delay':''].filter(Boolean).join(' ');
    return`<button class="${cls}" data-act="pick" data-id="${esc(u.id)}" title="${esc(u.name)}">${face}<span class="main"><b>${esc(u.short)}</b>${fam}${story}${tag}${u.note?`<span class="name-note">${esc(u.note)}</span>`:''}</span><small class="state ${row.ready?'ok':'gap'}">${row.ready?`지금 가능 · 선위 ${row.cost}`:`선위 ${row.gap} 부족`}</small>${lockLine}</button>`;
  }).join('');
  const pager=pages>1?`<div class="pager"><button data-act="page" data-value="-1" ${page<=0?'disabled':''}>◀ 이전</button><em>${page+1} / ${pages} 페이지 · 전체 ${view.length}</em><button data-act="page" data-value="1" ${page>=pages-1?'disabled':''}>다음 ▶</button></div>`:'';
  const readyCount=view.filter(r=>r.ready).length;
  return`<div class="filters">${chips}</div>${this.renderAux(board)}${this.renderImpact(impact)}<div class="cards"><small>지금 가능 ${readyCount} · 선위만 부족 ${view.length-readyCount}</small>${cards}</div>${pager}`;
};
// 보조 알약(사용자 0831d): 첫 희귀 최속(초반 전용 — 152킬 특별함이
// 잡히면 내림) + 짤 희귀(50라+ 전설 불가 시 방깎·이감·공증 슬롯 채우기).
App.prototype.renderAux=function(board){
  let html='';
  // 초반 한정: 152킬 특별함이 잡히면 내리고, 수신이 특별함을 놓쳐도
  // 25라부터는 초반이 아니므로 내린다(이중 안전).
  const fr=this.roundNow()<25?B.firstRares(this.index,this.counts):{picks:[],specialOwned:1};
  if(fr.specialOwned===0&&fr.picks.length){
    html+=`<div class="aux first-rares"><small>첫 희귀 최속 — 지금 패에서 가장 싸게 닿는 희귀 · 눌러서 조합식 · 152킬 특별함이 잡히면 이 안내는 사라집니다</small><div class="aux-pills">${fr.picks.map(p=>`<button class="pair${this.state.auxPick===p.unit.id?' on':''}" data-act="aux-pick" data-id="${esc(p.unit.id)}" title="${esc(p.unit.name)}"><b>${esc(p.unit.short)}</b><i>${p.ready?`지금 가능 · 선위 ${p.cost}`:`선위 ${p.cost}`}</i></button>`).join('')}</div></div>`;
  }
  if(this.roundNow()>=50&&!board.rows.some(r=>r.ready)){
    const fill=B.fillerRares(this.index,this.counts);
    if(fill.picks.length){
      html+=`<div class="aux filler-rares"><small>짤 희귀 — 전설이 더 안 나오는 마감 구간, 지금 선위로 슬롯 채우기(방깎·이감·공증)</small><div class="aux-pills">${fill.picks.map(p=>`<button class="pair${this.state.auxPick===p.unit.id?' on':''}" data-act="aux-pick" data-id="${esc(p.unit.id)}" title="${esc(p.unit.name)}"><b>${esc(p.unit.short)}</b><i>${esc(p.tags.join('·'))} · 선위 ${p.cost}</i></button>`).join('')}</div></div>`;
    }
  }
  if(html&&this.state.auxPick){
    const plan=B.recipePlan(this.index,this.state.auxPick,this.counts);
    if(plan)html+=`<div class="upper-recipe"><small class="combo-head">${esc(plan.unit.short)} 조합식 — 지금 패 기준</small>${this.renderRecipe(plan,plan.unit.id)}</div>`;
  }
  return html;
};
// 조합식 패널(사용자 0831: "조합식도 · 선위를 어떻게 써야하는지도 ·
// 상위도 포함해서") — 전설급 선택 패널과 선택 상위 아래에서 공용.
// v29.1(사용자 0831c): 제작 가능한 재료는 눌러서 그 재료의 조합식을
// 체인으로 펼친다("에이스 왜곡 → 에이스 전설 → 마르코 희귀 …").
App.prototype.drillable=function(id){
  if(String(id)===this.index.wispId)return false;
  const u=this.index.byId.get(String(id));
  return!!(u&&(u.stuffs||[]).length&&!['common','hard','other'].includes(u.tier)&&!/아이템|기타|랜덤유닛|신비함/.test(u.group||''));
};
App.prototype.recipeBody=function(plan,rootId,depth){
  const tierName={rare:'희귀',special:'특별',uncommon:'안흔',common:'흔함',legend:'전설급',upper:'상위',hard:'선행'};
  const direct=plan.direct.map(m=>{
    const enough=m.owned>=m.need;
    const cls=`mat ${m.tier}${enough?' ok':''}`;
    const inner=`${esc(m.name)} <b>${m.owned}/${m.need}</b>`;
    if(rootId&&this.drillable(m.id)){
      const open=this.state.drillRoot===rootId&&this.state.drill[depth]===m.id;
      return`<button class="${cls}${open?' open':''}" data-act="drill" data-root="${esc(rootId)}" data-depth="${depth}" data-id="${esc(m.id)}" title="누르면 ${esc(m.name)} 만드는 공식이 아래로 열립니다">${inner}<i class="drill-ind">${open?'▾':'▸'}</i></button>`;
    }
    return`<span class="${cls}" title="${esc(tierName[m.tier]||m.tier)}">${inner}</span>`;
  }).join('');
  const eats=plan.eats.length?`<div class="recipe-line"><i>내 패 소비</i>${plan.eats.map(e=>`<span class="mat ${e.tier}">${esc(e.name)}${e.need>1?`×${e.need}`:''}</span>`).join('')}</div>`:'';
  const wisp=plan.wispPlan.length
    ?`<div class="recipe-line"><i>선위 ${plan.wispCost} 사용처</i>${plan.wispPlan.map(w=>`<span class="mat common">${w.color?`<em style="background:${esc(w.color)}"></em>`:''}${esc(w.name)}×${w.count}</span>`).join('')}<small>흔함 1기 = 선위 1 — 부족한 흔함을 선위로 삽니다</small></div>`
    :(plan.wispCost>0?`<div class="recipe-line"><i>선위 ${plan.wispCost} 사용처</i><small>하위 재료 조합에 선위 ${plan.wispCost}가 듭니다</small></div>`:`<div class="recipe-line"><i>선위</i><small>추가 선위 없이 지금 재료로 완성됩니다</small></div>`);
  const hard=plan.hardMissing.length?`<div class="recipe-line hard"><i>선행 결손</i>${plan.hardMissing.map(h=>`<span class="mat hard">${esc(h.name)}</span>`).join('')}<small>조합으로 못 만드는 선행 유닛 — 게임에서 확보해야 열립니다</small></div>`:'';
  const item=plan.itemMissing&&plan.itemMissing.length?`<div class="recipe-line hard"><i>특수 재료</i>${plan.itemMissing.map(h=>`<span class="mat hard">${esc(h.name)}${h.count>1?`×${h.count}`:''}</span>`).join('')}<small>유니크 아이템 — 게임에서 얻기 전에는 추천에서 제외합니다</small></div>`:'';
  return`<div class="recipe-line"><i>조합식</i>${direct||'<small>직접 재료 없음</small>'}</div>${eats}${wisp}${hard}${item}`;
};
App.prototype.renderRecipe=function(plan,rootId){
  if(!plan)return'';
  let html=`<div class="recipe">${this.recipeBody(plan,rootId,0)}</div>`;
  if(rootId&&this.state.drillRoot===rootId){
    for(let i=0;i<this.state.drill.length;i++){
      const sub=B.recipePlan(this.index,this.state.drill[i],this.counts);
      if(!sub)break;
      html+=`<div class="recipe drill"><small class="drill-head">↳ <b>${esc(sub.unit.short)}</b>${sub.unit.note?` (${esc(sub.unit.note)})`:''} 만드는 공식${sub.owned?' · 이미 보유':''}</small>${this.recipeBody(sub,rootId,i+1)}</div>`;
    }
  }
  return html;
};
App.prototype.renderImpact=function(impact){
  if(!impact)return'';
  const gone=impact.gone.map(x=>`<div class="impact-row gone">⛔ ${esc(x.name)} <i>(${esc(x.cause)})</i></div>`).join('');
  const delayed=impact.delayed.map(x=>`<div class="impact-row delayed">⏳ ${esc(x.name)} — 선위 ${x.extra} 더 필요</div>`).join('');
  const cmd=impact.row.unit.command;
  const cmdLine=cmd?`<div class="command-line">조합 명령어 <b>${esc(cmd.korean||cmd.english)}</b>${cmd.korean&&cmd.english?` <i>/ ${esc(cmd.english)}</i>`:''}${cmd.inherited?' <i>(원형 최초 제작 명령)</i>':''}</div>`:'';
  const recipe=this.renderRecipe(B.recipePlan(this.index,impact.row.unit.id,this.counts),impact.row.unit.id);
  return`<div class="impact"><small><b>${esc(impact.row.unit.short)}</b> 를 만들면 — 계산일 뿐 패는 소비되지 않습니다</small>${recipe}${gone||delayed?gone+delayed:'<div class="impact-none">사라지는 선택지 없음 — 겹치는 패가 없습니다.</div>'}${cmdLine}<small class="impact-note">행을 다시 누르면 해제됩니다.</small></div>`;
};

// ── ② 상위 ──────────────────────────────────────────────────────────────
App.prototype.renderUppers=function(board,mode){
  const options=B.upperOptions(this.index,mode);
  const picks=B.upperPicks(this.index,this.counts,{mode,round:this.roundNow(),lockedId:''});
  const shorts=picks.map(p=>p.unit.short);
  const dupes=new Set(shorts.filter((s,i)=>shorts.indexOf(s)!==i));
  const top3=picks.length?`<div class="top3"><small>지금 패 추천 TOP3 — 조합이 닫히는 상위를 도달 거리 → 실측 순으로</small>${picks.map((pick,i)=>{
    const u=pick.unit;
    const face=u.image?`<img class="face" src="${esc(u.image)}" alt="" loading="lazy">`:'';
    const label=dupes.has(u.short)?u.name:u.short;
    return`<button class="top3-row${i===0?' top':''}" data-act="upper" data-id="${esc(u.id)}" title="${esc(u.name)}"><i class="top3-rank">${i+1}</i>${face}<span class="top3-main"><b>${esc(label)}</b><small class="top3-meta">선위 ${pick.cost} · ${pick.games?`실측 ${pick.games}판`:'실측 부족'}</small>${u.note?`<small class="top3-note">${esc(u.note)}</small>`:''}</span></button>`;
  }).join('')}</div>`:'';
  const query=String(this.state.search||'').trim();
  const found=query?options.filter(o=>o.unit.name.toLowerCase().includes(query.toLowerCase())).slice(0,8):[];
  const fShorts=found.map(o=>o.unit.short);
  const fDupes=new Set(fShorts.filter((s,i)=>fShorts.indexOf(s)!==i));
  const search=`<div class="upper-search"><input data-live="search" value="${esc(this.state.search)}" placeholder="상위 이름 검색 후 엔터" aria-label="상위 검색">${query?found.length?`<div class="search-found">${found.map(o=>`<button data-act="upper" data-id="${esc(o.unit.id)}" title="${esc(o.unit.name)}">${esc(fDupes.has(o.unit.short)?o.unit.name:o.unit.short)}${o.games?` · ${o.games}판`:''}</button>`).join('')}</div>`:'<small class="search-miss">일치하는 상위가 없습니다.</small>':''}</div>`;
  const select=`<label class="upper-pick"><span>상위 선택</span><select data-opt="upperPick"><option value="">— 상위를 고르세요 —</option>${options.map(o=>`<option value="${esc(o.unit.id)}" ${this.state.upperPick&&this.index.byId.get(this.state.upperPick)&&this.index.byId.get(this.state.upperPick).canon===o.unit.canon?'selected':''}>${esc(o.unit.name)}${o.games?` · ${o.games}판`:''}</option>`).join('')}</select></label>`;
  let body='<small class="combo-head">상위를 고르면 악몽 클리어 실측에서 함께 쓰인 조합을 보여줍니다.</small>';
  if(this.state.upperPick){
    const combos=B.upperCombos(this.index,this.counts,board,this.state.upperPick);
    if(combos){
      const reserve=B.upperReserve(this.index,this.counts,combos.sel.id);
      const reserveHtml=reserve?`<div class="reserve"><b>선택 상위 몫 — 다른 데 쓰면 패가 겹칩니다</b>${reserve.mats.map(m=>`<em class="${m.tier}">${esc(m.name)}${m.need>1?`×${m.need}`:''}</em>`).join('')}</div>`:'';
      // 사용자 0831("상위도 포함해서"): 선택 상위의 조합식·선위 사용처.
      const upperPlan=B.recipePlan(this.index,combos.sel.id,this.counts);
      const upperRecipe=upperPlan&&!upperPlan.owned?`<div class="upper-recipe"><small class="combo-head">${esc(combos.sel.short)} 조합식 — 지금 패 기준</small>${this.renderRecipe(upperPlan,combos.sel.id)}</div>`:'';
      const pShorts=combos.partners.map(p=>{const u=this.index.byId.get(p.id);return u?u.short:p.name;});
      const pDupes=new Set(pShorts.filter((s,i)=>pShorts.indexOf(s)!==i));
      const partners=combos.partners.map((p,i)=>{
        const u=this.index.byId.get(p.id);
        const face=u&&u.image?`<img class="face" src="${esc(u.image)}" alt="" loading="lazy">`:'';
        const flag=p.owned?'<i class="have">보유</i>':p.row&&p.row.ready?'<i class="can">지금 제작 가능</i>':p.row?`<i class="can dim">선위 ${p.row.gap} 부족</i>`:'';
        const label=pDupes.has(pShorts[i])?(u?u.name:p.name):pShorts[i];
        return`<button class="partner" data-act="pick" data-id="${esc(p.id)}" title="${esc(u?u.name:p.name)}">${face}<b>${esc(label)}</b><em>${num(p.share)}%</em>${flag}</button>`;
      }).join('')+(combos.hiddenCount>0?`<small class="hidden-note">실측 top8 중 ${combos.hiddenCount}개는 지금 내 패로 못 가 숨김</small>`:'');
      // 2상위 추천(사용자 0831: "이 상위랑 어울리는 다른 상위도 추천").
      const pp=B.pairPicks(this.index,this.counts,combos.sel.id,{mode,round:this.roundNow()});
      const ppShorts=pp.picks.map(p=>p.unit.short);
      const ppDupes=new Set(ppShorts.filter((s,i)=>ppShorts.indexOf(s)!==i));
      const pairRec=pp.picks.length?`<div class="top3 pair-picks"><small>2상위 추천 — ${esc(combos.sel.short)}와 함께 간 상위를 지금 패 도달 → 동반 실측 순으로 · 눌러서 조합식 확인</small>${pp.picks.map((p,i)=>{
        const u=p.unit;
        const face=u.image?`<img class="face" src="${esc(u.image)}" alt="" loading="lazy">`:'';
        const label=ppDupes.has(u.short)?u.name:u.short;
        return`<button class="top3-row${i===0?' top':''}${this.state.pairPick===u.id?' picked':''}" data-act="pair-pick" data-id="${esc(u.id)}" title="${esc(u.name)}"><i class="top3-rank">${i+1}</i>${face}<span class="top3-main"><b>${esc(label)}</b><small class="top3-meta">선위 ${p.cost} · 동반 실측 ${p.games}판</small>${u.note?`<small class="top3-note">${esc(u.note)}</small>`:''}</span></button>`;
      }).join('')}${pp.hidden>0?`<small class="hidden-note">실측 페어 중 ${pp.hidden}개는 지금 내 패로 못 가거나 계통이 달라 숨김</small>`:''}</div>`
      :(combos.pairs.length?`<small class="hidden-note">함께 간 2상위 실측은 있지만 지금 내 패로 갈 수 있는 상위가 없습니다.</small>`:'');
      const pairPlan=this.state.pairPick?B.recipePlan(this.index,this.state.pairPick,this.counts):null;
      const pairRecipe=pairPlan&&!pairPlan.owned?`<div class="upper-recipe"><small class="combo-head">${esc(pairPlan.unit.short)} 조합식 — 지금 패 기준</small>${this.renderRecipe(pairPlan,pairPlan.unit.id)}</div>`:'';
      const restPairs=combos.pairs.filter(p=>!pp.picks.some(x=>x.unit.canon===p.unit.canon)).slice(0,4)
        .map(p=>`<button class="pair" data-act="pair-pick" data-id="${esc(p.unit.id)}" title="${esc(p.unit.name)}"><b>${esc(p.unit.short)}</b><i>동반 실측 ${p.games}판</i></button>`).join('');
      body=`${upperRecipe}${reserveHtml}<small class="combo-head">${esc(combos.sel.short)} — 클리어 실측 ${combos.games}판${combos.dualGames?` (2상위 판 ${combos.dualGames})`:''} · 함께 쓰인 전설·히든 중 내 패로 갈 수 있는 것</small>${combos.partners.length?`<div class="partners">${partners}</div>`:''}${pairRec}${pairRecipe}${restPairs?`<small class="combo-head">그 외 실측 페어 · 눌러서 조합식 확인</small><div class="pairs">${restPairs}</div>`:''}`;
    }
  }
  return`<div class="uppers">${top3}${search}${select}${body}</div>`;
};

// ── ③ 스펙 ──────────────────────────────────────────────────────────────
App.prototype.renderSpec=function(spec,mode){
  const head=`<small class="spec-head">${mode?`${mode==='magic'?'마딜':'물딜'} 목표 기준`:'계통 미판정 — 상단에서 물딜/마딜을 고르면 목표가 잡힙니다'} · 완성 유닛 ${spec.sum.units}기</small>`;
  const gauges=spec.rows.map(row=>{
    if(row.info)return`<div class="gauge info"><label><span>${esc(row.label)}</span><b>${row.current}</b></label>${row.extra?`<small class="extra">${esc(row.extra)}</small>`:''}</div>`;
    const target=Math.max(num(row.target),0.0001);
    const pct=Math.max(4,Math.min(100,Math.round(num(row.current)/target*100)));
    const miss=row.gap>0;
    return`<div class="gauge"><label><span>${esc(row.label)}</span><b class="${miss?'miss':''}">${row.current} / ${row.target}${row.full?` <small>(풀 ${row.full})</small>`:''}</b></label><div class="bar"><i class="${miss?(pct>=70?'warn':'bad'):'ok'}" style="width:${pct}%"></i></div>${row.extra?`<small class="extra">${esc(row.extra)}</small>`:''}</div>`;
  }).join('');
  // 능력치 출처 조사(사용자 0831d "티모지지 프로그램에서 불러올 수 있을
  // 것 같은데 알아봐줘"): 데스크톱 셸이 로컬 서버(127.0.0.1:25625)의
  // 후보 경로를 1회 조사해 보내준다 — 능력치 전용 API 존재 여부의 실측.
  let scanHtml='';
  if(this.scan){
    const extra=(this.scan.found||[]).filter(f=>f.path!=='/datas');
    scanHtml=`<small class="scan-note">로컬 서버 조사: /datas ${(this.scan.found||[]).some(f=>f.path==='/datas')?'응답':'무응답'}${extra.length?` · 추가 경로 ${extra.map(f=>`${esc(f.path)}(${f.status})`).join(' ')}`:' · 능력치 전용 경로 없음 — 위 게이지는 보드가 직접 합산(희귀 직접 역할 포함)'}</small>`;
  }
  return`${head}<div class="gauges">${gauges}</div>${spec.goroseiNote?`<small class="gorosei-note">⚠ ${esc(spec.goroseiNote)}</small>`:''}${scanHtml}`;
};

// ── 인게임 HUD: 전용 조각(메인 앱을 복제하지 않는다 — 표시 전용) ────────
App.prototype.renderHud=function(board,spec,mode){
  const ready=board.rows.filter(r=>r.ready).slice(0,4);
  const rows=ready.map(row=>`<div class="hud-row">${row.unit.image?`<img src="${esc(row.unit.image)}" alt="">`:'<span></span>'}<b>${esc(row.unit.short)}</b><small class="ok">선위 ${row.cost}</small></div>`).join('');
  const gauges=spec.rows.filter(r=>!r.info).map(row=>{
    const target=Math.max(num(row.target),0.0001);
    const pct=Math.max(4,Math.min(100,Math.round(num(row.current)/target*100)));
    const miss=row.gap>0;
    return`<div class="gauge"><label><span>${esc(row.label)}</span><b class="${miss?'miss':''}">${row.current}/${row.target}</b></label><div class="bar"><i class="${miss?(pct>=70?'warn':'bad'):'ok'}" style="width:${pct}%"></i></div></div>`;
  }).join('');
  // 사이트 없이 게임 위에서 답이 나오게(사용자 0831f): 초반엔 첫 희귀
  // 최속, 마감(50라+ 전설 불가)엔 짤 희귀를 표시 전용 줄로 싣는다.
  let aux='';
  const roundNow=this.roundNow();
  if(roundNow<25){
    const fr=B.firstRares(this.index,this.counts);
    if(fr.specialOwned===0&&fr.picks.length)aux=`<div class="hud-aux"><i>첫 희귀 최속</i>${fr.picks.map(p=>`<span><b>${esc(p.unit.short)}</b> 선위 ${p.cost}</span>`).join('')}</div>`;
  }else if(roundNow>=50&&!board.rows.some(r=>r.ready)){
    const fill=B.fillerRares(this.index,this.counts);
    if(fill.picks.length)aux=`<div class="hud-aux"><i>짤 희귀</i>${fill.picks.slice(0,3).map(p=>`<span><b>${esc(p.unit.short)}</b> ${esc(p.tags[0])} · 선위 ${p.cost}</span>`).join('')}</div>`;
  }
  return`<div class="hud-panel"><div class="hud-head"><b>${roundNow}라</b><span>${mode?(mode==='magic'?'마딜':'물딜'):'계통 미판정'}</span><span>선위 ${this.wisp}</span>${this.stale()?'<span>· 수신 대기</span>':''}</div>${aux}${rows||'<div class="hud-empty">지금 만들 수 있는 전설급 없음</div>'}<div class="hud-gauges">${gauges}</div></div>`;
};
App.prototype.pushHud=function(board,spec,mode){
  const bridge=global.ORD_DESKTOP;
  if(!bridge||typeof bridge.sendHudState!=='function')return;
  mode=mode||this.mode();
  board=board||B.craftRows(this.index,this.counts,{mode,round:this.roundNow()});
  spec=spec||B.partySpec(this.index,this.counts,{mode,gorosei:this.state.gorosei});
  const hudHtml=this.renderHud(board,spec,mode);
  if(hudHtml===this.hudSig)return;
  this.hudSig=hudHtml;
  bridge.sendHudState({at:Date.now(),hudHtml});
};

// ── 이벤트 ──────────────────────────────────────────────────────────────
App.prototype.bind=function(){
  this.root.addEventListener('click',event=>{
    const btn=event.target.closest('[data-act]');
    if(!btn)return;
    const act=btn.getAttribute('data-act'),value=btn.getAttribute('data-value'),id=btn.getAttribute('data-id');
    if(act==='round'){
      // ± 보정: 시계가 돌면 유효 라운드 기준으로 재앵커 — 그대로 이어진다.
      const next=Math.max(1,Math.min(B.MAX_ROUND,this.roundNow()+num(value)));
      this.state.round=next;
      if(this.state.clockStartedAt)this.state.clockStartedAt=B.clockAnchor(next,Date.now());
    }
    else if(act==='mode'){this.state.mode=value||'';this.state.page=0;}
    else if(act==='filter'){this.state.filter=value===this.state.filter?value:value;this.state.filter=value;this.state.page=0;}
    else if(act==='page'){this.state.page=Math.max(0,this.state.page+num(value));}
    else if(act==='pick'){this.state.pick=this.state.pick===id?'':id;this.state.drillRoot='';this.state.drill=[];}
    else if(act==='upper'){this.state.upperPick=id;this.state.pairPick='';this.state.search='';this.state.drillRoot='';this.state.drill=[];}
    else if(act==='pair-pick'){this.state.pairPick=this.state.pairPick===id?'':id;this.state.drillRoot='';this.state.drill=[];}
    else if(act==='aux-pick'){this.state.auxPick=this.state.auxPick===id?'':id;this.state.drillRoot='';this.state.drill=[];}
    else if(act==='sync'){
      // 시계 탭 동기화(사용자 0831f "20초 차이"): 인게임 라운드가 막
      // 바뀐 순간 탭하면 '지금 = 이 라운드 시작'으로 초 단위가 맞는다.
      const r=this.roundNow();
      this.state.round=r;
      this.state.clockStartedAt=B.clockAnchor(r,Date.now());
    }
    else if(act==='drill'){
      const root=btn.getAttribute('data-root'),depth=num(btn.getAttribute('data-depth'));
      if(this.state.drillRoot!==root){this.state.drillRoot=root;this.state.drill=[id];}
      else if(this.state.drill[depth]===id){this.state.drill=this.state.drill.slice(0,depth);if(!this.state.drill.length)this.state.drillRoot='';}
      else{this.state.drill=this.state.drill.slice(0,depth).concat([id]);}
    }
    else if(act==='probe'){this.probe();return;}
    else return;
    this.save();this.render();
  });
  this.root.addEventListener('change',event=>{
    const sel=event.target.closest('[data-opt]');
    if(!sel)return;
    const opt=sel.getAttribute('data-opt');
    if(opt==='upperPick'){this.state.upperPick=sel.value;this.state.pairPick='';this.state.drillRoot='';this.state.drill=[];}
    if(opt==='gorosei')this.state.gorosei=sel.value;
    this.save();this.render();
  });
  this.root.addEventListener('keydown',event=>{
    if(event.key!=='Enter')return;
    const input=event.target.closest('[data-live="search"]');
    if(!input)return;
    this.state.search=input.value;
    this.save();this.render();
  });
};
App.prototype.probe=async function(){
  const bridge=global.ORD_DESKTOP;
  if(!bridge||typeof bridge.probe!=='function')return;
  const r=await bridge.probe().catch(()=>null);
  if(r&&r.ok&&r.payload)this.onFeed(r.payload);
  else this.render();
};

// ── 부트 ────────────────────────────────────────────────────────────────
function boot(){
  const root=document.getElementById('board-root');
  if(!root)return;
  const app=new App(root);
  global.ORD_BOARD_APP=app;
  const bridge=global.ORD_DESKTOP;
  if(bridge&&typeof bridge.onDatas==='function')bridge.onDatas(payload=>{try{app.onFeed(payload);}catch(e){console.error(e);}});
  if(bridge&&typeof bridge.onOverlayMode==='function')bridge.onOverlayMode(on=>{try{document.body.classList.toggle('ord-overlay-mode',on===true);}catch(_){}});
  if(bridge&&typeof bridge.onEndpointScan==='function')bridge.onEndpointScan(scan=>{try{app.scan=scan;app.render();}catch(_){}});
  // 수신이 끊겨도 배너가 스스로 갱신되게 가벼운 감시(8초 문턱).
  setInterval(()=>{const stale=app.stale();if(stale!==app._staleShown){app._staleShown=stale;app.render();}},2000);
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
}
global.ORD_BOARD_UI={App,V26_FILTERS,PAGE};
})(typeof window!=='undefined'?window:globalThis);
