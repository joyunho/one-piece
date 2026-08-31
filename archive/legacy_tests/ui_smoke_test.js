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
    // v24.0(사용자: "구조 자체가 문제인것같은데"): 플레이/분석 2화면 분리 —
// 판 중 화면(coach)은 상태·지금 할 일·레일 3영역뿐이고, 국면·최종 파티·
// 희귀→전설·남는 희귀는 분석 화면(analysis 탭)이 세로로 편다.
// v26.0(보조 모드): 다음 제작 레일 은퇴 — 플레이 화면은 상태 + 보조 보드.
const REGIONS=['game-status','next-action'];
const ANALYSIS_REGIONS=['clear-gaps','upper-party','craftable-legends','unused-rare'];
    for(const cfg of [{name:'desktop',width:1920,height:1080},{name:'laptop',width:1440,height:900},{name:'mobile',width:430,height:900}]){
      await page.setViewportSize({width:cfg.width,height:cfg.height});
      await page.goto('file://'+path.resolve(__dirname,'ui_fixture.html'),{waitUntil:'domcontentloaded'});
      await page.waitForSelector('.v155-dashboard');
      // v23.8 재핀: 첫 실행 가이드 오버레이가 뜨면 닫는다(신규 사용자 흐름).
      await page.evaluate(()=>{const b=document.querySelector('[data-act="dismiss-onboarding"]');if(b)b.click();});
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
      // v24.0: 플레이 화면의 패널 껍데기는 액션 존 하나뿐이다 — 나머지는
      // 분석 화면에 있다(아래 별도 검사).
      assert.strictEqual(metrics.panelCount,1,`${cfg.name} expected a single play panel shell (v24.0)`);
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
    // v26.0(보조 모드): 보드 행 클릭 = 겹침 영향(v26-pick) → 영향 패널의
    // '유닛 상세'로 모달 진입 — 왕복을 새 흐름으로 계약한다.
    await page.waitForSelector('[data-region="next-action"] [data-act="v26-pick"]');
    // v23.8 재핀: 첫 실행 가이드 오버레이 닫기.
    await page.evaluate(()=>{const b=document.querySelector('[data-act="dismiss-onboarding"]');if(b)b.click();});
    await page.locator('[data-region="next-action"] [data-act="v26-pick"]').first().click();
    await page.waitForSelector('.v26-impact');
    await page.locator('.v26-impact [data-act="detail"]').first().click();
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
    // v26.0 재핀: 처방 카드 은퇴 — 명령어 줄은 보드에서 찍은 유닛의 겹침
    // 영향 패널에 노출된다(검증된 명령만, 없으면 숨김 — 원 계약 유지).
    const cmdCheck=await page.evaluate(()=>{
      const app=window.TEST_APP,
        picked=document.querySelector('[data-region="next-action"] .v26-row.picked'),
        unitId=picked?picked.dataset.id:'',
        unit=unitId?app.plan().state.db.byId.get(unitId):null,
        verified=unit?app.commandInfo(unit).hasVerified:false,
        hasCommandLine=!!document.querySelector('[data-region="next-action"] .v26-impact .command-line');
      return{unitId:unitId||'',verified,hasCommandLine};
    });
    if(cmdCheck.unitId){
      assert.strictEqual(cmdCheck.hasCommandLine,cmdCheck.verified,
        `${cmdCheck.unitId} 명령어 표시 불일치: 검증됨=${cmdCheck.verified} 화면표시=${cmdCheck.hasCommandLine}`);
      console.log(`PASS  next-action 명령어 라인 ${cmdCheck.verified?'표시됨':'검증 없어 정상적으로 숨김'} (${cmdCheck.unitId})`);
    }else{
      console.log('INFO  이 픽스처 상태에는 next-action 대상 유닛이 없어 명령어 검사를 건너뜀');
    }

    // v19.1(사용자 요청): "내 파티에 확정 이런거 있으면 좋을듯? 내가 버튼
    // 누르면 자꾸 사라지니까 짜증나네" — 파티 확정 버튼이 실제로 상태를
    // 뒤집는지 왕복으로 확인한다.
    // v24.0: 최종 파티는 분석 화면에 있다 — 상단 분석 버튼으로 전환 후
    // 검사한다(분석 화면 4영역 구성도 여기서 함께 계약).
    await page.locator('[data-act="tab"][data-tab="analysis"]').click();
    await page.waitForSelector('[data-region="upper-party"] .v153-party-lock');
    const analysisRegions=await page.evaluate(()=>[...document.querySelectorAll('[data-region]')].map(node=>node.dataset.region));
    assert.deepStrictEqual(analysisRegions,ANALYSIS_REGIONS,'analysis region set/order changed');
    console.log('PASS  분석 화면 4영역 세로 펼침 확인');
    const lockBefore=await page.evaluate(()=>document.querySelector('[data-region="upper-party"] .v153-party-lock').className);
    assert(/\boff\b/.test(lockBefore),`파티 확정이 미확정 상태로 시작하지 않음: ${lockBefore}`);
    assert.strictEqual(await page.locator('[data-region="upper-party"] [data-act="confirm-party"]').count(),1,'파티 확정 버튼이 없음');
    // v23.2(0816 포렌식): 필수 역할 미완이면 확정이 2단 확인(3.5초 arm)을
    // 거친다 — 스턴 0.56 파티가 원클릭으로 확정되던 것을 막는 정직성 장치.
    // 픽스처가 미완일 수 있으므로 두 번 눌러 armed → confirm 을 모두 통과한다.
    await page.locator('[data-region="upper-party"] [data-act="confirm-party"]').click();
    await page.waitForTimeout(200);
    if(await page.locator('[data-region="upper-party"] [data-act="confirm-party"]').count())
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
