'use strict';
// v22.8.0 계약 — 접힘(details) 열림 상태가 재렌더를 넘어 보존된다.
//
// 사용자: "오로성 선택하는거랑 특별 선택하는거 하나 선택하면 접히고
// 하나선택하면 접히던데 선택할 때는 안접히고 내가 원할 떄 접히게 해줘".
//
// 원인: renderUnsafe 의 전체 innerHTML 교체가 <details> 열림을 매번
// 초기화했다.  설정 팝업(v153-tools)의 오로성·152킬 특별함·스토리 10
// 셀렉트는 setOpt 끝의 render() 때문에 선택 즉시 팝업이 접혔고, 연구소
// (v153-lab)·전체 스펙 표(v22-spec-fold)·2상위 접기도 같은 증상이었다.
//
// ① 배선 — 캡처는 innerHTML 교체 전, 복원은 스크롤 복원 뒤
// ② 거동 — 캡처/복원이 클래스+등장순서 키로 열림만 복원(강제 닫기 없음)
// ③ 마크업 불변 — <details class="v153-tools"> 리터럴 유지(open 보간 금지)
// ④ 실브라우저 — 팝업 연 채 오로성 변경 → 열림 유지, summary 로 닫으면
//    다음 렌더에도 닫힘 유지 (사용자가 원할 때만 접힘)

const assert=require('assert'),fs=require('fs'),path=require('path');
const EXT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

check('① 배선 — 캡처는 교체 전, 복원은 스크롤 복원 뒤',()=>{
  const unsafe=source.slice(source.indexOf('  renderUnsafe(){'),source.indexOf('  renderAuxiliaryPage('));
  assert(unsafe.includes('savedFolds=this.captureOpenFolds()'),'렌더 전 열림 캡처 없음');
  const capAt=unsafe.indexOf('captureOpenFolds()'),replaceAt=unsafe.indexOf('this.root.innerHTML'),restoreAt=unsafe.indexOf('this.restoreOpenFolds(savedFolds)');
  assert(capAt>=0&&replaceAt>capAt,'캡처가 innerHTML 교체보다 뒤에 있다');
  assert(restoreAt>unsafe.indexOf('this.restoreScrollPositions(savedScroll)'),'복원이 스크롤 복원보다 앞이다');
  // setOpt 는 root 없는 스텁으로도 불린다(기존 테스트 계약) — 접힘 로직은
  // render 경로에만 살아야 한다.
  const setOpt=source.slice(source.indexOf('  setOpt('),source.indexOf('  actualRound('));
  assert(!setOpt.includes('OpenFolds'),'setOpt 가 접힘 로직을 직접 만진다');
});

check('② 거동 — 클래스+등장순서 키, 열림만 복원',()=>{
  const vm=require('vm');
  const context={console};context.window=context;vm.createContext(context);
  context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_upper_playbook.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js'])
    vm.runInContext(fs.readFileSync(path.join(EXT,file),'utf8'),context,{filename:file});
  const App=context.ORDApp.App;
  const fold=(className,open)=>({className,open});
  const app=Object.create(App.prototype);
  const before=[fold('v153-tools',true),fold('v153-lab',false),fold('v22-spec-fold',true),fold('',true),fold('',false)];
  app.root={querySelectorAll:sel=>sel==='details'?before:[]};
  // VM 컨텍스트가 만든 배열은 호스트 Array.prototype 과 달라 deepStrictEqual
  // 이 실패한다 — 호스트 배열로 복사해 비교한다.
  const saved=app.captureOpenFolds();
  assert.deepStrictEqual(Array.from(saved),['v153-tools#0','v22-spec-fold#0','#0'],'키는 클래스명#등장순서');
  // 재렌더 후: 전부 닫힌 새 DOM + 클래스 없는 details 순서 유지.
  const after=[fold('v153-tools',false),fold('v153-lab',false),fold('v22-spec-fold',false),fold('',false),fold('',false)];
  app.root={querySelectorAll:sel=>sel==='details'?after:[]};
  app.restoreOpenFolds(saved);
  assert.deepStrictEqual(after.map(el=>el.open),[true,false,true,true,false],'열림만 복원되고 닫힌 것은 닫힌 채');
  // root 없는 스텁·빈 목록에서도 조용히 통과(렌더 계약: 실패해도 화면 유지).
  const bare=Object.create(App.prototype);
  assert.deepStrictEqual(Array.from(bare.captureOpenFolds()),[]);
  bare.restoreOpenFolds(['v153-tools#0']);
});

check('③ 마크업 불변 — details 리터럴 핀 유지',()=>{
  assert(source.includes('<details class="v153-tools">'),'v153-tools 태그 리터럴 소실');
  assert(source.includes('<details class="hand-tier-ledger"><summary>등급별 상세 사용처</summary>'),'hand-tier-ledger 리터럴 소실');
  assert(!source.includes('class="v153-tools"${'),'open 보간 금지 — DOM 복원 방식이어야 한다');
});

(async()=>{
  let chromium;
  try{({chromium}=require('playwright'));}
  catch(_){console.log('SKIP v22_8 fold persist(browser): playwright 미설치');console.log(`\n${checks} checks passed (v22.8.0 접힘 보존 · 브라우저 생략)`);return;}
  let registryPath='';
  try{registryPath=chromium.executablePath()||'';}catch(_){registryPath='';}
  const candidates=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,registryPath,'/opt/pw-browsers/chromium','/tmp/ord-chromium'].filter(Boolean);
  const executablePath=candidates.find(candidate=>{try{return fs.existsSync(candidate);}catch(_){return false;}});
  if(!executablePath){console.log('SKIP v22_8 fold persist(browser): Chromium 없음');console.log(`\n${checks} checks passed (v22.8.0 접힘 보존 · 브라우저 생략)`);return;}
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--single-process','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await(await browser.newContext({viewport:{width:1920,height:1080}})).newPage();
    await page.route('http*://**',route=>route.abort());
    await page.goto('file://'+path.resolve(__dirname,'ui_fixture.html'),{waitUntil:'domcontentloaded'});
    await page.waitForSelector('.v153-tools');
    // 팝업을 열고 오로성을 바꾼다 — 열림이 유지되어야 한다.
    await page.click('.v153-tools>summary');
    await page.waitForSelector('.v153-tools[open]');
    await page.selectOption('.v153-tools-pop select[data-opt="gorosei"]',{index:1});
    await page.waitForFunction(()=>!!document.querySelector('.v153-tools[open]'),null,{timeout:5000});
    // 연구소 접기도 연 채 체크박스를 눌러 본다 — 둘 다 열려 있어야 한다.
    await page.click('.v153-lab>summary');
    await page.waitForSelector('.v153-lab[open]');
    const lab=await page.$('.v153-lab input[data-upg="slow"]');
    if(lab){await lab.click();await page.waitForFunction(()=>!!document.querySelector('.v153-tools[open]')&&!!document.querySelector('.v153-lab[open]'),null,{timeout:5000});}
    // 사용자가 닫으면 다음 렌더에도 닫힘 유지.
    await page.click('.v153-tools>summary');
    await page.waitForFunction(()=>!document.querySelector('.v153-tools[open]'),null,{timeout:5000});
    await page.evaluate(()=>window.TEST_APP.render());
    const reopened=await page.evaluate(()=>!!document.querySelector('.v153-tools[open]'));
    assert.strictEqual(reopened,false,'사용자가 닫은 접힘이 렌더로 다시 열렸다');
    checks++;console.log('PASS  ④ 실브라우저 — 선택해도 열림 유지, 닫으면 닫힘 유지');
  }finally{await browser.close();}
  console.log(`\n${checks} checks passed (v22.8.0 접힘 보존)`);
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
