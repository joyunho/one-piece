'use strict';
// v20.2.0 계약 — 제작 진행 중 잠금 + 회복 목표 오해 방지.
//
// 근거 로그: data/ORD_2310_20260806_125925_active.ordlog.json (v20.1.2 기록 · 2.310 물딜).
//  ① r48 13:22:37~13:23:14 — 승인 카드가 킬러(광보잡) → 샬롯 크래커 →
//     킬러 → HOLD → 킬러로 요동했다.  같은 창에서 선택 위습은
//     14→11→9→7→5 로 계속 줄고 있었다(= 킬러의 하위 재료를 찍는 중).
//     엔진이 중간 상태를 매번 새 판단으로 취급한 것이 원인.
//     r1 의 레베카→봉쿠레→레베카(9초·8초)도 같은 원인.
//  ② 네코(Z90h, "전설 [마딜]")는 이 물딜 판에서 승인 카드로는 한 번도
//     나오지 않았고 회복 목표(roleKey=bossFrenzy)에만 118회 등장했는데,
//     사용자가 "추천"으로 읽었다 — 목표와 지금 할 일의 구분이 화면에
//     없었기 때문(센고쿠 HOLD 사건과 같은 계열).
//
// ① 잠금 유지 — 엔진이 다른 답을 내도 잠근 대상을 유지한다.
// ② 선위 부족 — HOLD/교체 대신 PREPARE 로 "얼마나 부족한지" 말한다.
// ③ 사실 기반 해제 — 이미 보유하면 잠기지 않는다.
// ④ 수명 관리 배선 — 앱이 잠금을 세우고 푸는 규칙.
// ⑤ 회복 목표 표시 — "지금 만들라는 뜻이 아닙니다" + 계열 주석.
const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

const lib=require('./lib/ordlog_replay.js');
const engine=lib.loadEngine();
const catalog=global.ORD_TMO_UNITS;

// 0806 로그 r48 크래커 전환 시점의 실제 스냅샷으로 판을 세운다.
const LOG=JSON.parse(fs.readFileSync(path.join(ROOT,'data/ORD_2310_20260806_125925_active.ordlog.json'),'utf8'));
const events=LOG.events;
const flipIndex=events.findIndex(event=>event.type==='decision'&&event.at.startsWith('2026-08-06T13:22:46'));
assert(flipIndex>0,'0806 로그에 13:22:46 요동 시점이 없다');
let snapshot=null;
for(let i=flipIndex;i>=0;i--)if(events[i].type==='snapshot'){snapshot=events[i].payload;break;}
assert(snapshot&&snapshot.counts,'요동 시점 직전 스냅샷 없음');
const flip=events[flipIndex].payload;
const KILLER=(events.find(event=>event.type==='decision'&&event.payload&&event.payload.v15&&event.payload.v15.action&&/킬러/.test(event.payload.v15.action.name))||{}).payload.v15.action.id;
assert.strictEqual(KILLER,'540h','킬러 id 확인');

const BASE={mode:flip.mode,magicRoute:'auto',currentRound:flip.round,gorosei:'none',postLegendRoute:'upper',superKumaOwned:true};
const decide=(counts,wisp,extra)=>engine.decide({
  catalog,
  snapshot:{counts,currentAbilities:snapshot.currentAbilities||{},wispCountFound:true,wispCount:wisp},
  settings:Object.assign({},BASE,extra||{}),
  locks:(flip.input&&flip.input.locks)||[]
});
const shownId=decision=>String((decision.action||decision.blockedAction||{}).id||'');

check('① 제작 진행 중 잠금 — 엔진이 다른 답을 내도 대상이 유지된다',()=>{
  const free=decide(snapshot.counts,11,{});
  assert(shownId(free)!==KILLER,`잠금 없이 이미 킬러면 이 판이 재현이 아니다 (${shownId(free)})`);
  const held=decide(snapshot.counts,11,{_craftLockId:KILLER});
  assert.strictEqual(shownId(held),KILLER,'잠근 대상이 유지되지 않음');
  assert(held.craftLock&&held.craftLock.held===true,'craftLock 표식 없음');
  // 정직성: 엔진의 이번 1순위를 숨기지 않는다.
  assert(held.craftLock.alternative,'엔진 1순위(대안) 표기 없음');
  assert(/제작 진행 중/.test(String(held.reason||'')),`사유 문구 없음: ${String(held.reason||'').slice(0,60)}`);
});

check('② 선위가 모자라도 교체·HOLD 대신 부족분을 말한다',()=>{
  const broke=decide(snapshot.counts,0,{_craftLockId:KILLER});
  assert.strictEqual(broke.state,'PREPARE','선위 부족 시 PREPARE 가 아님');
  assert.strictEqual(shownId(broke),KILLER,'선위 부족에서 대상이 바뀜');
  assert(broke.craftLock.wispShort>0,'부족 선위 수치가 없음');
  assert.strictEqual(broke.action,null,'제작 불가인데 승인 버튼이 열림');
});

check('③ 사실 기반 해제 — 이미 보유하면 잠그지 않는다',()=>{
  const owned=Object.assign({},snapshot.counts);owned[KILLER]=1;
  const released=decide(owned,11,{_craftLockId:KILLER});
  assert(!released.craftLock,'보유 후에도 잠금이 남음');
  assert(shownId(released)!==KILLER,'보유한 대상을 계속 제시함');
  // 연결·방향 흐름은 잠금이 가로채지 않는다.
  const src=read('ord_v15_engine.js');
  assert(src.includes("CRAFT_LOCK_SKIP_STATES=new Set(['SYNC_BLOCKED','ROUTE_CHOICE'])"),'동기화·방향 상태 예외 없음');
});

check('④ 화면 카드를 만드는 층(reconcile)에도 잠금이 걸린다',()=>{
  // 0806 재생에서 v15 원시 1순위(봉쿠레)와 화면 카드(킬러)가 달랐다 —
  // 즉 사용자가 보는 카드는 reconcileSquadExecution 이 만든다.  엔진
  // decide 안에만 잠금을 걸면 사용자 화면은 그대로 요동한다.
  const src=read('ord_v15_engine.js');
  assert(src.includes('function reconcileSquadExecutionRaw(decision,squad,locks){'),'reconcile 원본 분리 없음');
  assert(/function reconcileSquadExecution\(decision,squad,locks\)\{[\s\S]{0,900}applyCraftLock\(reconciled,model,locks\|\|\[\]\)/.test(src),'reconcile 끝단 잠금 적용 없음');
  // 필수 역할 회귀(stop)는 잠금보다 강하다.
  assert(/audit\.level\|\|audit\)==='stop'\)return reconciled/.test(src),'회귀 판정 우선 규칙 없음');
  // 앱은 화면에 뜬 카드(reconcile 후)로 잠금을 세운다 — 원시 판단이 아니라.
  const app=read('ord_app.js');
  assert(app.includes('this.v202NoteCraftLock(v15&&(v15.action||v15.blockedAction),settings);'),'표시 카드 기준 잠금 기록 없음');
  assert(!/_v15Cache&&\(this\._v15Cache\.action\|\|this\._v15Cache\.blockedAction\);\s*\n\s*if\(proposed&&proposed\.id\)this\._stickyActionId=String\(proposed\.id\);\s*\n\s*this\.v202NoteCraftLock/.test(app),'원시 판단 기준 잠금 기록이 남아 있음');
});

check('⑤ 앱 수명 관리 — 세우기·해제 규칙 배선',()=>{
  const app=read('ord_app.js');
  assert(app.includes('_craftLockId:this.v202CraftLockId(settings)'),'엔진에 잠금 전달 없음');
  assert(app.includes('v202NoteCraftLock(proposed,settings)'),'잠금 기록 없음');
  // 해제 3종: 보유 완료 · 2라운드 경과 · 선위 회복(그 대상에 안 쓰는 중).
  assert(app.includes('if(C.num(counts[lock.id])>0){this._v202CraftLock=null;return\'\';}'),'보유 해제 없음');
  assert(app.includes('round-lock.round>=2'),'라운드 경과 해제 없음');
  assert(app.includes('if(wisp>C.num(lock.wisp)){this._v202CraftLock=null;return\'\';}'),'선위 회복 해제 없음');
  // 수동 제작(무엇을 만들든)은 잠금을 놓는다.
  assert(/markBuild\(row,pack\)\{[\s\S]{0,400}v202ReleaseCraftLock\(\)/.test(app),'수동 제작 해제 없음');
  assert(app.includes('v202-craft-lock')&&app.includes('제작 진행 중 — 지금 할 일을 고정했습니다'),'카드 배너 없음');
});

check('⑥ 회복 목표는 "지금 만들라"가 아니다 — 머리말·계열 주석',()=>{
  const app=read('ord_app.js');
  assert(app.includes('앞으로 닫을 목표 — 지금 만들라는 뜻이 아닙니다'),'회복 목표 머리말 없음');
  assert(app.includes('지금 만들 것은 위의 큰 카드 하나뿐입니다'),'구분 문구 없음');
  // 물딜 판의 마딜 계열(네코) 같은 교차 계열 목표에 근거를 단다.
  assert(app.includes('v202-cross')&&app.includes('계열과 무관하게 계산됩니다'),'계열 주석 없음');
  const css=read('ord_ui_v20.css');
  for(const sel of ['.v202-craft-lock','.v202-recovery-head','.v202-cross'])
    assert(css.includes(sel),`스타일 없음: ${sel}`);
  // 네코가 물딜에서 광보잡으로 세지는 것 자체는 모델상 옳다(마딜에서만 제외).
  const C=global.ORDCore,neko=catalog.find(unit=>unit.id==='Z90h');
  assert(neko,'Z90h 없음');
  assert.strictEqual(C.roleContribution(neko,'physical').bossFrenzy,1,'물딜에서 네코 광보잡이 안 세짐');
  assert.strictEqual(C.roleContribution(neko,'magic').bossFrenzy,0,'마딜에서 네코 광보잡이 세짐(제외 규칙 소실)');
});

check('⑦ 완성도% — v20.5 사용자 결정으로 화면에서 철거됐다',()=>{
  // v20.2 는 "완성도 %가 안보이니까 불편한데"에 답해 코치 원장 진행도를
  // 넣었다.  v20.5 에서 사용자가 뒤집었다 — "티모 %이제 필요없잖아 없애줘".
  // 실제로 1라 빈 패에서는 모든 칸이 0% 라 정보가 아니라 소음이었다.
  // 계약도 뒤집는다: 화면에 완성도 %를 그리지 않는다.  대신 행동을 바꾸는
  // 사실(희귀 n/m · 남은 흔함 장수 · 선위)만 남는다.
  const app=read('ord_app.js'),engine=read('ord_v15_engine.js');
  for(const gone of ['v202-progress','v202-queue-pct','v202-coach-pct',
    'TMO 완성도','코치 계산 재료 진행도','완성도 확인 불가'])
    assert(!app.includes(gone),`화면에 완성도% 잔재: ${gone}`);
  // 엔진의 판단 이유에서도 % 어휘를 걷어냈다(그 문장이 화면 카드에 그대로 뜬다).
  for(const gone of ['TMO 완성도','원 TMO'])
    assert(!engine.includes(gone),`엔진 사유에 완성도% 잔재: ${gone}`);
  // 대체 사실은 남아 있어야 한다 — 빈칸으로 두는 게 목적이 아니다.
  // v22.9 재핀: 그 대체 사실(남은 흔함 장수)이 부족 희귀 수 오배선에서
  // 계획 차감 실비용(shownCost)으로 바로잡혔다 — 사실이 남는다는 원칙
  // 그대로, 수치만 정직해졌다.
  assert(app.includes('부족 흔함 ${shownCost}장 = 선위'),'희귀 카드 대체 사실 없음');
  assert(engine.includes('흔함 ${short}장 남음'),'대안 부제 대체 사실 없음');
  // 계산 함수 자체는 코어에 남긴다(다시 필요해지면 화면만 붙이면 된다).
  assert(typeof global.ORDCore.ledgerCompletion==='function','ledgerCompletion 제거됨 — 계산은 남겨 둔다');
});

console.log(`\n${checks} checks passed (v20.2.0 — 제작 잠금·회복 목표 표시·완성도 대체)`);
