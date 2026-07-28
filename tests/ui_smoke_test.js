'use strict';

// v18: 버전 리터럴을 테스트에 박아 두면 릴리스마다 여기서 먼저 깨진다
// (v17.20·v17.22·v18에서 세 번 반복됐다).  package.json 을 단일
// 원천으로 읽어 '모듈들이 서로 같은 버전인가'만 검사한다.
const RELEASE_VERSION=require('../package.json').version;

// Real-browser smoke for the focused one-screen cockpit,
// no horizontal overflow, the grid fills a desktop viewport, and the
// round-50 replay fixture (open 이감/단일 deficits) shows an actionable next
// step instead of the silent HOLD recorded in the 2026-07-20 loss log.

const assert=require('assert');
const fs=require('fs');
const path=require('path');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
// playwright 는 devDependency 라 npm install 전 컨테이너에는 없다.  모듈 로드
// 시점에 그냥 throw 하면 run_all 의 SKIP 규약(브라우저 없는 환경용)을 타지
// 못하고 FAIL 로 집계돼, 환경 미비가 회귀처럼 보인다.  ORD_REQUIRE_ALL=1 이면
// 여전히 실패로 처리된다(run_all 이 SKIP 을 실패로 승격).
let chromium;
try{({chromium}=require('playwright'));}
catch(error){
  console.log('SKIP ui_smoke: playwright 미설치 — `npm install` 후 다시 실행하세요');
  process.exit(0);
}

(async()=>{
  // Resolution order: explicit override → Playwright's own registry (covers
  // `npx playwright install chromium` on CI and standard installs) →
  // known container fallbacks.
  let registryPath='';
  try{registryPath=chromium.executablePath()||'';}catch(_){registryPath='';}
  const candidates=[
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    registryPath,
    '/opt/pw-browsers/chromium',
    '/tmp/ord-chromium',
    '/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
    '/root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell'
  ].filter(Boolean);
  const executablePath=candidates.find(candidate=>{try{return fs.existsSync(candidate);}catch(_){return false;}});
  if(!executablePath){console.log('SKIP  UI smoke: Playwright Chromium executable not installed');return;}

  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--single-process','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage();
    await page.route('http*://**',route=>route.abort());
    const REGIONS=['game-status','next-action','clear-gaps','rare-ledger','upper-party'];
    for(const cfg of [{name:'desktop',width:1920,height:1080},{name:'laptop',width:1440,height:900},{name:'mobile',width:430,height:900}]){
      await page.setViewportSize({width:cfg.width,height:cfg.height});
      await page.goto('file://'+path.resolve(__dirname,'ui_fixture.html'),{waitUntil:'domcontentloaded'});
      await page.waitForSelector('.v153-grid');
      const metrics=await page.evaluate(()=>{
        const app=window.TEST_APP,decision=app.plan().plan.v15Decision||{};
        const grid=document.querySelector('.v153-grid'),gridRect=grid.getBoundingClientRect();
        return{
          version:window.ORDCore.VERSION,
          health:app.health(),
          decisionState:decision.state||'',
          hasAction:!!(decision.action&&decision.action.id),
          hasRecovery:!!(decision.recovery&&decision.recovery.targets&&decision.recovery.targets.length),
          regions:[...document.querySelectorAll('[data-region]')].map(node=>node.dataset.region),
          panelCount:document.querySelectorAll('.v153-panel').length,
          gapCards:document.querySelectorAll('.v153-gap-grid article').length,
          scrollWidth:document.documentElement.scrollWidth,
          clientWidth:document.documentElement.clientWidth,
          viewportHeight:window.innerHeight,
          gridHeight:gridRect.height,
          legacyTabs:document.querySelectorAll('.ord-tabs').length
        };
      });
      assert.strictEqual(metrics.version,RELEASE_VERSION);
      assert.strictEqual(metrics.health.ready,true,`${cfg.name} fixture health blocked`);
      assert.deepStrictEqual(metrics.regions,REGIONS,`${cfg.name} region set/order changed`);
      assert.strictEqual(metrics.panelCount,4,`${cfg.name} expected exactly four decision panels`);
      assert(metrics.gapCards<=4,`${cfg.name} clear gaps exceeded the four-card cap`);
      assert(metrics.hasAction||metrics.hasRecovery,`${cfg.name} replay of the recorded stall must show an action or recovery ladder (state=${metrics.decisionState})`);
      assert.strictEqual(metrics.legacyTabs,0,`${cfg.name} legacy tab bar returned`);
      assert(metrics.scrollWidth<=metrics.clientWidth+1,`${cfg.name} horizontal overflow: ${metrics.scrollWidth-metrics.clientWidth}`);
      if(cfg.width>=1440)assert(metrics.gridHeight>=metrics.viewportHeight*.8,`${cfg.name} cockpit leaves the bottom of the screen empty (grid ${Math.round(metrics.gridHeight)}px of ${metrics.viewportHeight}px)`);
      await page.screenshot({path:path.resolve(__dirname,`ui_${cfg.name}_v16.png`),fullPage:cfg.width<1440});
      console.log(`PASS  ${cfg.name} state=${metrics.decisionState} panels=${metrics.panelCount} grid=${Math.round(metrics.gridHeight)}px/${metrics.viewportHeight}px`);
    }

    await page.setViewportSize({width:1600,height:1000});
    await page.goto('file://'+path.resolve(__dirname,'ui_fixture.html'),{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-region="next-action"] [data-act="detail"]');
    await page.locator('[data-region="next-action"] [data-act="detail"]').first().click();
    await page.waitForSelector('.detail-modal');
    const detail=await page.evaluate(()=>({title:(document.querySelector('.detail-modal h2')||{}).textContent||''}));
    assert(detail.title.length>0,'detail modal has no title');
    await page.locator('.modal-x').click();
    assert.strictEqual(await page.locator('.detail-modal').count(),0);
    console.log('PASS  detail modal opens from the next-action panel and closes');
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
