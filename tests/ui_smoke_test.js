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
    // v18.4: 6패널 개편 — 희귀 장부가 "만들 수 있는 전설급"(3번)과 "필요없는
// 희귀"(6번)로 나뉘고, "할 일 미리보기"(2번)가 새로 들어왔다.
const REGIONS=['game-status','next-action','next-preview','craftable-legends','clear-gaps','upper-party','unused-rare'];
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
          docHeight:document.documentElement.scrollHeight,
          legacyTabs:document.querySelectorAll('.ord-tabs').length
        };
      });
      assert.strictEqual(metrics.version,RELEASE_VERSION);
      assert.strictEqual(metrics.health.ready,true,`${cfg.name} fixture health blocked`);
      assert.deepStrictEqual(metrics.regions,REGIONS,`${cfg.name} region set/order changed`);
      // v18.4: 상시 노출이 4패널에서 6패널로 바뀌었다(지금 할 일 / 미리보기 /
      // 제작 가능 전설급 / 현재 스펙 / 최종 파티 / 필요없는 희귀).
      assert.strictEqual(metrics.panelCount,6,`${cfg.name} expected exactly six decision panels`);
      assert(metrics.gapCards<=4,`${cfg.name} clear gaps exceeded the four-card cap`);
      assert(metrics.hasAction||metrics.hasRecovery,`${cfg.name} replay of the recorded stall must show an action or recovery ladder (state=${metrics.decisionState})`);
      assert.strictEqual(metrics.legacyTabs,0,`${cfg.name} legacy tab bar returned`);
      assert(metrics.scrollWidth<=metrics.clientWidth+1,`${cfg.name} horizontal overflow: ${metrics.scrollWidth-metrics.clientWidth}`);
      // v18.6(사용자 요청): 계약이 뒤집혔다. 4패널 시절에는 "화면을 채울 것"이
      // 목표라 grid >= 80vh 를 요구했는데, 6패널에서는 "6번까지 한 화면에
      // 보일 것"이 목표다. 채우기를 강제하면 패널을 늘려 스크롤을 만들게 된다.
      // 그래서 스크롤이 생기지 않는지를 잰다 — 이게 사용자가 요구한 것이다.
      if(cfg.width>=1440){
        assert(metrics.docHeight<=metrics.viewportHeight+8,
          `${cfg.name} 6패널이 한 화면에 안 들어감: 문서 ${Math.round(metrics.docHeight)}px > 뷰포트 ${metrics.viewportHeight}px`);
      }
      await page.screenshot({path:path.resolve(__dirname,`ui_${cfg.name}_v16.png`),fullPage:cfg.width<1440});
      console.log(`PASS  ${cfg.name} state=${metrics.decisionState} panels=${metrics.panelCount} grid=${Math.round(metrics.gridHeight)}px 문서=${Math.round(metrics.docHeight)}px/${metrics.viewportHeight}px`);
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
