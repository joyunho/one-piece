'use strict';

// ORD 악몽 보드(v28 전면 신작) — 앱·화면·셸 배선 계약.

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const NEW=path.join(__dirname,'..','ord_board');
const readNew=f=>fs.readFileSync(path.join(NEW,f),'utf8');

const ctx={console,Date,setInterval:()=>0,localStorage:{getItem:()=>null,setItem:()=>{}}};
ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
for(const f of ['data.js','core.js','app.js'])vm.runInContext(readNew(f),ctx,{filename:f});
const B=ctx.ORD_BOARD_CORE,UI=ctx.ORD_BOARD_UI,DATA=ctx.ORD_BOARD_DATA;

const mkApp=()=>{
  const root={innerHTML:'',addEventListener:()=>{}};
  const app=new UI.App(root);
  return{app,root};
};
const rich=(()=>{const c={};for(const u of DATA.units)if(['common','uncommon','special'].includes(u.tier)&&u.id!==DATA.wispId)c[u.id]=2;c[DATA.wispId]=8;return c;})();
const feed=(app,counts,extra)=>{
  app.counts=counts;app.wisp=B.num(counts[DATA.wispId]);app.playable=30;app.lastGoodAt=Date.now();
  Object.assign(app.state,extra||{});
  app.render();
};

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① 화면 뼈대 — 스트립 + 3블록, 빈손 안내 패널, TOP3 부재',()=>{
  const{app,root}=mkApp();
  const html=root.innerHTML;
  assert(html.includes('ORD 악몽 보드'),'스트립 부재');
  assert(html.includes('만들 수 있는 전설급')&&html.includes('상위 실측 조합')&&html.includes('현재 파티 스펙'),'3블록 부재');
  assert(html.includes('empty-panel'),'빈손 안내 패널 부재');
  assert(!html.includes('추천 TOP3'),'빈손인데 TOP3 렌더');
  assert(html.includes('결정은 티모지지를 보며 직접'),'보조 모드 선언 부재');
  assert((html.match(/data-region|v153|v26-/g)||[]),'');
  // 신작은 옛 프로그램의 클래스 체계를 쓰지 않는다(전면 재작성 증명).
  assert(!/v1\d\d-|v2\d\d?-|ord_tmo_auto_extension/.test(html),'옛 프로그램 표면 유출');
});

test('② 실전 렌더 — 카드·배타·페이지·선택 여파·상위·게이지',()=>{
  const{app,root}=mkApp();
  feed(app,rich,{round:20,mode:'magic'});
  let html=root.innerHTML;
  assert((html.match(/class="card/g)||[]).length>=5,'카드 부재');
  assert((html.match(/class="filter/g)||[]).length===9,'역할 필터 칩 9개(전체+8역할) 아님');
  assert(html.includes('top3-row'),'TOP3 부재');
  const board=B.craftRows(app.index,rich,{mode:'magic',round:20});
  const pages=Math.max(1,Math.ceil(board.rows.length/UI.PAGE));
  if(pages>1)assert(html.includes('페이지 · 전체'),'페이지 넘김 부재');
  // 선택 여파: 찍으면 ⛔ 소거가 화면에 나타난다(사라짐이 있을 때).
  const impactRow=board.rows.find(r=>B.pickImpact(app.index,board,r.unit.id).gone.length>0);
  if(impactRow){
    feed(app,rich,{pick:impactRow.unit.id});
    html=root.innerHTML;
    assert(html.includes('impact'),'선택 여파 패널 부재');
    assert(html.includes('dead-tag')||html.includes('impact-row gone'),'⛔ 소거 표기 부재');
    assert(html.includes('소비되지 않습니다'),'비소비 문구 부재');
  }
  // 선택 패널에 조합식·선위 사용처(사용자 0831).
  if(impactRow){
    assert(root.innerHTML.includes('class="recipe"'),'조합식 패널 부재');
    assert(root.innerHTML.includes('사용처')||root.innerHTML.includes('추가 선위 없이'),'선위 사용처 부재');
  }
  // 상위 선택 → 상위 몫·동반·페어 + 상위 조합식(사용자 0831: "상위도 포함해서").
  const opt=B.upperOptions(app.index,'magic')[0];
  feed(app,rich,{pick:'',upperPick:opt.unit.id});
  html=root.innerHTML;
  assert(html.includes('클리어 실측'),'실측 헤드 부재');
  const uPlan=B.recipePlan(app.index,opt.unit.id,rich);
  if(!uPlan.owned){
    assert(html.includes('조합식 — 지금 패 기준'),'상위 조합식 헤드 부재');
    assert(html.includes('class="recipe"'),'상위 조합식 패널 부재');
  }
  // 2상위 추천(사용자 0831b): 추천 행 + 누르면 그 상위의 조합식.
  const pp=B.pairPicks(app.index,rich,opt.unit.id,{mode:'magic',round:20});
  if(pp.picks.length){
    assert(html.includes('2상위 추천'),'2상위 추천 블록 부재');
    assert((html.match(/data-act="pair-pick"/g)||[]).length>=pp.picks.length,'2상위 추천 버튼 부족');
    feed(app,rich,{pairPick:pp.picks[0].unit.id});
    const html2=root.innerHTML;
    assert((html2.match(/class="recipe"/g)||[]).length>=2,'2상위 조합식 패널 부재');
    assert(html2.includes(`${B.esc(pp.picks[0].unit.short)} 조합식`)||html2.includes('조합식 — 지금 패 기준'),'2상위 조합식 헤드 부재');
  }
  assert((html.match(/class="gauge/g)||[]).length>=4,'스펙 게이지 부재');
  // 검색: 엔터 배선 + 결과 버튼.
  feed(app,rich,{search:'센고쿠'});
  assert(root.innerHTML.includes('search-found')||root.innerHTML.includes('search-miss'),'검색 결과 영역 부재');
  assert(readNew('app.js').includes(`data-live="search"`)&&readNew('app.js').includes("event.key!=='Enter'"),'검색 엔터 배선 부재');
});

test('③ HUD — 전용 조각 표시 전용(앱 이중 구동·버튼 없음)',()=>{
  const{app}=mkApp();
  feed(app,rich,{round:20});
  const board=B.craftRows(app.index,rich,{mode:app.mode(),round:20});
  const spec=B.partySpec(app.index,rich,{mode:app.mode(),gorosei:'none'});
  const hud=app.renderHud(board,spec,app.mode());
  assert(hud.includes('hud-panel'),'HUD 조각 부재');
  assert(!hud.includes('<button'),'HUD 에 버튼이 있다(표시 전용 위반)');
  assert((hud.match(/hud-row/g)||[]).length<=4,'HUD 행 상한 초과');
  const hudJs=readNew('hud.js');
  assert(hudJs.includes('onHudState')&&!hudJs.includes('ORD_BOARD_CORE'),'HUD 가 앱을 이중 구동한다');
  // v30.2(사용자 0831f "프로그램으로 모든게 해결"): 초반 HUD 에 첫 희귀
  // 최속, 마감 HUD 에 짤 희귀 — 표시 전용(버튼 금지 불변).
  const early={};let un3=0;for(const u of DATA.units){if(u.tier==='uncommon'&&un3<5){early[u.id]=1;un3++;}}
  early[DATA.wispId]=4;
  feed(app,early,{round:5,clockStartedAt:0});
  const earlyBoard=B.craftRows(app.index,early,{mode:app.mode(),round:5});
  const earlySpec=B.partySpec(app.index,early,{mode:app.mode(),gorosei:'none'});
  const hudEarly=app.renderHud(earlyBoard,earlySpec,app.mode());
  assert(hudEarly.includes('첫 희귀 최속')&&!hudEarly.includes('<button'),'초반 HUD 첫 희귀 안내 부재/버튼 위반');
  const late={};let un4=0;for(const u of DATA.units){if(u.tier==='uncommon'&&un4<4){late[u.id]=1;un4++;}}
  late[DATA.wispId]=10;
  feed(app,late,{round:55,clockStartedAt:0});
  const lateBoard2=B.craftRows(app.index,late,{mode:app.mode(),round:55});
  const hudLate=app.renderHud(lateBoard2,B.partySpec(app.index,late,{mode:app.mode(),gorosei:'none'}),app.mode());
  assert(hudLate.includes('짤 희귀')&&!hudLate.includes('<button'),'마감 HUD 짤 희귀 안내 부재/버튼 위반');
  assert(readNew('hud.html').includes('hud.js')&&readNew('hud.html').includes('board.css'),'HUD 페이지 구성 이상');
});

test('④ 셸 배선 — 데스크톱이 신작만 로드, 패키징 추종',()=>{
  const main=fs.readFileSync(path.join(__dirname,'..','desktop','main.js'),'utf8');
  assert(main.includes("'ord_board', 'index.html'")||main.includes("'ord_board','index.html'"),'메인 창이 신작을 로드하지 않는다');
  assert(main.includes("resolveUiFile('hud.html')"),'HUD 창이 신작을 로드하지 않는다');
  assert(!/path\.join\([^)]*ord_tmo_auto_extension/.test(main),'셸 로드 경로가 옛 프로그램을 참조한다');
  const buildUi=fs.readFileSync(path.join(__dirname,'..','desktop','build_ui.js'),'utf8');
  assert(buildUi.includes("'ord_board'")&&buildUi.includes('matchAll'),'패키징이 신작을 파싱 복사하지 않는다');
  // index.html 이 로드하는 스크립트는 신작 3형제뿐이다.
  const page=readNew('index.html');
  const srcs=[...page.matchAll(/src="([^"]+)"/g)].map(m=>m[1]);
  assert.deepStrictEqual(srcs,['data.js','core.js','app.js'],`페이지 스크립트 오염: ${srcs}`);
  for(const f of ['data.js','core.js','app.js','hud.js'])
    assert(!readNew(f).includes('ord_tmo_auto_extension'),`신작이 옛 폴더를 참조: ${f}`);
});

test('⑤ 라운드 시계 + 조합식 드릴다운 (사용자 0831c)',()=>{
  const{app,root}=mkApp();
  // 시계 없음 → 수동 표기, 시계 앵커 → 라운드·남은 초 표기.
  feed(app,rich,{round:20,mode:'magic',clockStartedAt:0});
  assert(root.innerHTML.includes('data-clock')&&root.innerHTML.includes('수동'),'수동 표기 부재');
  feed(app,rich,{clockStartedAt:B.clockAnchor(12,Date.now())});
  assert(/data-clock[^>]*>12라/.test(root.innerHTML),'시계 라운드 표기 부재');
  assert(app.roundNow()===12,'유효 라운드가 시계를 따르지 않는다');
  // ± 재앵커: 시계가 돌 때 +1 은 유효 라운드 기준으로 앵커를 옮긴다.
  const src=readNew('app.js');
  assert(src.includes('clockAnchor')&&src.includes("act==='drill'"),'재앵커·드릴 배선 부재');
  // 판 종료(실전 유닛 0 관측, 사용자 0831e) → 시계 정지 + 라운드 1 초기화.
  app.auto={generation:1,active:true,startedAt:Date.now(),playable:30};
  app.onFeed({units:{}});
  assert(app.state.clockStartedAt===0&&app.state.round===1,'판 종료 시 시계 정지·라운드 초기화 실패');
  // 재실행 초기화(사용자 0831e): 저장된 라운드·시계는 새 세션에 안 넘어온다.
  const savedGet=ctx.localStorage.getItem;
  ctx.localStorage.getItem=()=>JSON.stringify({round:44,clockStartedAt:Date.now()-9e6,mode:'magic'});
  try{
    const fresh=new UI.App({innerHTML:'',addEventListener:()=>{}});
    assert(fresh.state.round===1&&fresh.state.clockStartedAt===0,'재실행에 라운드·시계가 살아남음');
    assert.strictEqual(fresh.state.mode,'magic','설정(모드)까지 초기화됨 — 세션 설정은 유지해야');
  }finally{ctx.localStorage.getItem=savedGet;}
  // 드릴다운: 상위 조합식의 제작 가능 재료는 버튼, 누른 체인은 패널로.
  const opt=B.upperOptions(app.index,'magic')[0];
  feed(app,rich,{upperPick:opt.unit.id,pairPick:'',drillRoot:'',drill:[]});
  const html=root.innerHTML;
  const drills=[...html.matchAll(/data-act="drill" data-root="([^"]+)" data-depth="0" data-id="([^"]+)"/g)];
  if(drills.length){
    for(const m of drills){
      const u=app.index.byId.get(m[2]);
      assert(u&&(u.stuffs||[]).length&&!['common','hard','other'].includes(u.tier),`드릴 불가 재료가 버튼: ${m[2]}`);
    }
    feed(app,rich,{drillRoot:drills[0][1],drill:[drills[0][2]]});
    const html2=root.innerHTML;
    assert(html2.includes('class="recipe drill"')&&html2.includes('만드는 공식'),'드릴 체인 패널 부재');
    for(const m of html2.matchAll(/data-act="drill" data-root="[^"]+" data-depth="\d+" data-id="([^"]+)"/g)){
      const u=app.index.byId.get(m[1]);
      assert(u&&!['common','hard','other'].includes(u.tier)&&m[1]!==DATA.wispId,`드릴 불가 재료가 버튼(체인): ${m[1]}`);
    }
  }
  // 흔함·선행(하드)은 어떤 조합식에서도 드릴 버튼이 아니다(소스 계약).
  assert(src.includes("['common','hard','other'].includes(u.tier)"),'드릴 허용 티어 가드 부재');
});

test('⑥ v30 — 자원 칩·첫 희귀·짤 희귀·특수 재료·로컬 조사 (사용자 0831d)',()=>{
  const{app,root}=mkApp();
  // 자원: 번역은 유지(진단용)하되 화면에는 안 싣는다 — 인게임과 안
  // 맞는 값 표시 금지(사용자 0831f "골드랑 목재랑 잘 안맞는것 같아").
  const feedOut=B.translateFeed(app.index,{GOLD:1234,LUMBER:7});
  assert(feedOut.gold===1234&&feedOut.lumber===7,'자원 번역 누락');
  app.gold=1234;app.lumber=7;
  feed(app,rich,{round:20,mode:'magic',clockStartedAt:0});
  assert(!root.innerHTML.includes('목재')&&!root.innerHTML.includes('골드'),'검증 안 된 자원 칩이 화면에 있음');
  // 시계 탭 동기화(사용자 0831f): 숫자 탭 = 지금이 이 라운드 시작.
  assert(readNew('app.js').includes("act==='sync'")&&root.innerHTML.includes('data-act="sync"'),'시계 탭 동기화 부재');
  // 첫 희귀 최속: 특별함(152 진화체)이 없을 때만 보인다.
  const scarce={};let r=0,un=0,co=0;
  for(const u of DATA.units){if(u.tier==='uncommon'&&un<8){scarce[u.id]=1;un++;}if(u.tier==='common'&&u.id!==DATA.wispId&&co<6){scarce[u.id]=1;co++;}}
  scarce[DATA.wispId]=6;
  feed(app,scarce,{round:5});
  assert(root.innerHTML.includes('첫 희귀'),'첫 희귀 패널 부재(초반)');
  // 특별함이 있어도 첫 희귀를 안 쥐었으면 유지(0831g 교정), 첫 희귀를
  // 쥐면 내려간다.
  feed(app,rich,{});  // rich = 특별함 보유·희귀 0 → 유지
  assert(root.innerHTML.includes('첫 희귀'),'특별함 때문에 첫 희귀 패널이 조기 소멸(0831g 재발)');
  const withRareHand=Object.assign({},scarce);
  withRareHand[DATA.units.find(u=>u.tier==='rare').id]=1;
  feed(app,withRareHand,{});
  assert(!root.innerHTML.includes('첫 희귀 —'),'첫 희귀 보유 후에도 패널 잔존');
  // 짤 희귀: 50라+ 전설이 안 나올 때만 — 안흔 잔량 + 선위 10 픽스처
  // (전설급은 선위 부족으로 전부 닫힘, 역할 희귀는 지금 가능).
  const lateHand={};let un2=0;
  for(const u of DATA.units){if(u.tier==='uncommon'&&un2<4){lateHand[u.id]=1;un2++;}}
  lateHand[DATA.wispId]=10;
  feed(app,lateHand,{round:55,clockStartedAt:0,auxPick:''});
  const lateBoard=B.craftRows(app.index,lateHand,{mode:app.mode(),round:55});
  assert(!lateBoard.rows.some(x=>x.ready),'픽스처 붕괴: 전설이 이미 열림');
  assert(B.fillerRares(app.index,lateHand).picks.length>0,'픽스처 붕괴: 짤 희귀 없음');
  assert(root.innerHTML.includes('짤 희귀'),'짤 희귀 블록 부재(마감 구간)');
  const pill=root.innerHTML.match(/class="aux filler-rares"[\s\S]*?data-act="aux-pick" data-id="([^"]+)"/);
  assert(pill,'짤 희귀 알약 부재');
  feed(app,lateHand,{auxPick:pill[1]});
  assert(root.innerHTML.includes('조합식 — 지금 패 기준'),'짤 희귀 조합식 패널 부재');
  feed(app,lateHand,{round:20,auxPick:''});
  assert(!root.innerHTML.includes('짤 희귀'),'마감 전인데 짤 희귀 표시');
  // 첫 희귀 이중 안전: 특별함을 못 잡아도 25라부터는 내린다.
  feed(app,scarce,{round:30});
  assert(!root.innerHTML.includes('첫 희귀 —'),'25라+ 인데 첫 희귀 패널 잔존');
  feed(app,scarce,{round:5});
  // 특수 재료(유니크 아이템): 아이템 필요 상위를 고르면 결손 줄이 뜬다.
  const itemIds=new Set(DATA.units.filter(u=>u.group==='아이템').map(u=>u.id));
  const needy=DATA.units.find(u=>u.upper&&u.canon===u.id&&(u.stuffs||[]).some(s=>itemIds.has(s.id)));
  feed(app,rich,{upperPick:needy.id,pairPick:'',auxPick:''});
  assert(root.innerHTML.includes('특수 재료')&&root.innerHTML.includes('추천에서 제외'),'특수 재료 결손 줄 부재');
  // 로컬 서버 조사 결과 표시(능력치 API 실측 — 데스크톱 셸이 보냄).
  app.scan={at:Date.now(),tried:14,found:[{path:'/datas',status:200,size:1000}]};
  app.render();
  assert(root.innerHTML.includes('로컬 서버 조사'),'조사 결과 줄 부재');
  assert(readNew('app.js').includes('onEndpointScan'),'조사 수신 배선 부재');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`ORD_BOARD_UI ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
