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
// v19.6(사용자 루미너스 UI): 2번(다음 판단)이 1번 패널 안의 레일이 되고,
// 스펙이 첫 행 오른쪽으로 — 영역 순서 갱신.
// v21.1: 참고 3패널(희귀→전설·최종 파티·남는 희귀)은 reference 탭 안으로
// 들어갔다 — 상시 5패널이 '정보 중구난방'의 원인이었다.  세 지역은 DOM에
// 남고(탭 전환) reference 가 그 컨테이너다.
const REGIONS=['game-status','next-action','next-preview','clear-gaps','reference','craftable-legends','upper-party','unused-rare'];
    for(const cfg of [{name:'desktop',width:1920,height:1080},{name:'laptop',width:1440,height:900},{name:'mobile',width:430,height:900}]){
      await page.setViewportSize({width:cfg.width,height:cfg.height});
      await page.goto('file://'+path.resolve(__dirname,'ui_fixture.html'),{waitUntil:'domcontentloaded'});
      await page.waitForSelector('.v155-dashboard');
      const metrics=await page.evaluate(()=>{
        const app=window.TEST_APP,decision=app.plan().plan.v15Decision||{};
        const grid=document.querySelector('.v155-dashboard'),gridRect=grid.getBoundingClientRect();
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
      // v19.6(사용자 루미너스 UI): "다음 판단"이 1번 패널 안의 레일로 합쳐져
      // .v153-panel 은 5장 — 판단 영역 자체는 여전히 6개(REGIONS 로 검사).
      // v21.1: 참고 탭 컨테이너(v211-refer)가 패널로 서고, 그 안의 세 옛 패널도
      // .v153-panel 클래스를 유지한다(스타일은 접힘) — 총 6장.
      assert.strictEqual(metrics.panelCount,6,`${cfg.name} expected six panel shells (v21.1)`);
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

    // v19.1(사용자 요청): "상위 만들 때 화면에 명령어 나오게 해줘 눌러서
    // 들어가야 봐지는거 말고" — 1번 패널(지금 할 일)에 클릭 없이 채팅
    // 명령어가 보여야 한다.  어떤 유닛이 추천될지는 픽스처마다 달라지므로,
    // "검증된 명령어가 있으면 반드시 보이고 없으면 안 보인다"는 대응만 잰다.
    const cmdCheck=await page.evaluate(()=>{
      const app=window.TEST_APP,plan=app.plan().plan,decision=plan.v15Decision||{},
        shown=decision.action||decision.blockedAction||decision.coachAction||null,unit=shown&&shown.unit||null,
        verified=unit?app.commandInfo(unit).hasVerified:false,
        hasCommandLine=!!document.querySelector('[data-region="next-action"] .command-line');
      return{unitId:unit&&unit.id||'',verified,hasCommandLine};
    });
    if(cmdCheck.unitId){
      assert.strictEqual(cmdCheck.hasCommandLine,cmdCheck.verified,
        `${cmdCheck.unitId} 명령어 표시 불일치: 검증됨=${cmdCheck.verified} 화면표시=${cmdCheck.hasCommandLine}`);
      console.log(`PASS  next-action 명령어 라인 ${cmdCheck.verified?'표시됨':'검증 없어 정상적으로 숨김'} (${cmdCheck.unitId})`);
    }else{
      console.log('INFO  이 픽스처 상태에는 next-action 대상 유닛이 없어 명령어 검사를 건너뜀');
    }

    // v19.1(사용자 요청): "내 파티에 확정 이런거 있으면 좋을듯? 내가 버튼
    // 누르면 자꾸 사라지니까 짜증나네" — 5번 패널의 파티 확정 버튼이 실제로
    // 상태를 뒤집는지 왕복으로 확인한다.
    // v22.0(사용자 승인 목업): 참고 패널은 기본 접힘 서랍이 됐다 — 파티
    // 검사는 서랍(최종 파티 탭)을 열고 진행한다.
    await page.locator('[data-act="v211-tab"][data-tab="party"]').click();
    await page.waitForSelector('[data-region="upper-party"] .v153-party-lock');
    const lockBefore=await page.evaluate(()=>document.querySelector('[data-region="upper-party"] .v153-party-lock').className);
    assert(/\boff\b/.test(lockBefore),`파티 확정이 미확정 상태로 시작하지 않음: ${lockBefore}`);
    assert.strictEqual(await page.locator('[data-region="upper-party"] [data-act="confirm-party"]').count(),1,'파티 확정 버튼이 없음');
    await page.locator('[data-region="upper-party"] [data-act="confirm-party"]').click();
    await page.waitForFunction(()=>{const el=document.querySelector('[data-region="upper-party"] .v153-party-lock');return el&&!el.className.includes('off');});
    assert.strictEqual(await page.locator('[data-region="upper-party"] [data-act="release-party"]').count(),1,'확정 후 해제 버튼이 없음');
    console.log('PASS  파티 확정 버튼이 잠금 줄을 미확정 상태에서 바꾼다');
    await page.locator('[data-region="upper-party"] [data-act="release-party"]').click();
    await page.waitForFunction(()=>{const el=document.querySelector('[data-region="upper-party"] .v153-party-lock');return el&&el.className.includes('off');});
    console.log('PASS  파티 해제 버튼이 잠금 줄을 다시 미확정으로 되돌린다');

    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
