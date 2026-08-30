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
  // 상위 선택 → 상위 몫·동반·페어.
  const opt=B.upperOptions(app.index,'magic')[0];
  feed(app,rich,{pick:'',upperPick:opt.unit.id});
  html=root.innerHTML;
  assert(html.includes('클리어 실측'),'실측 헤드 부재');
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

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`ORD_BOARD_UI ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
