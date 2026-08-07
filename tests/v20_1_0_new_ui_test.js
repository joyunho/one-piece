'use strict';
// v20.1.0 계약 — UI 완전 신작 "Operator Console" ("UI를 완전히 새로
// 만들어줘" + "색감도 다르게 해줘").
//
// ord_cockpit_v15.css(v15~v19 퇴적층)는 페이지에서 은퇴하고 레거시로
// 보존한다.  신작 시트 ord_ui_v20.css 가 화면 전체를 백지에서 그린다.
// 클래스 어휘·data-act·data-region·HUD 중계(.v153-hud/.v151-action)는
// 유지 — 기하·타이포·색이 전부 새것이다.
//
// ① 로드 교체 — 두 helper 페이지·픽스처·매뉴얼 빌더가 신작 시트를 쓴다.
// ② 신작 시트 계약 — 3칼럼 콘솔 기하·노을 팔레트·골드는 지금 할 일만.
// ③ 오버레이 계약 — 미니 패널에서 명령어 줄은 절대 숨기지 않는다.
// ④ 레거시 보존 — cockpit 파일은 남고(테스트·구 매뉴얼 계보) 페이지
//    로드에서만 빠진다.
const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

const sheet=read('ord_ui_v20.css');

check('① 로드 교체 — 페이지·픽스처·매뉴얼이 신작 시트를 쓴다',()=>{
  for(const page of ['ord_helper.html','ord_helper_desktop.html']){
    const html=read(page);
    assert(html.includes('ord_ui_v20.css'),`${page} 신작 시트 링크 없음`);
    assert(!html.includes('ord_cockpit_v15.css'),`${page} 가 여전히 cockpit 을 로드`);
  }
  const fixture=fs.readFileSync(path.join(ROOT,'tests/ui_fixture.html'),'utf8');
  assert(fixture.includes('ord_ui_v20.css')&&!fixture.includes('ord_cockpit_v15.css'),'픽스처 로드 불일치');
  const builder=read('tools/build_manual.js');
  assert(builder.includes("'ord_ui_v20.css'")&&builder.includes('data-source="ord_ui_v20.css"'),'매뉴얼 빌더가 신작 시트를 인라인하지 않음');
});

check('② 신작 시트 계약 — 콘솔 기하·노을 팔레트·골드 위계',()=>{
  assert(sheet.includes('Operator Console'),'신작 마커 없음');
  // 3칼럼 지휘 콘솔: 좌 명령 칼럼 / 중 스펙·제작 / 우 파티 / 하단 희귀.
  // v21.1(사용자: '필요한 UI만 남기고'): 3열 상시 5패널 → 2열 + 참고 탭.
  assert(sheet.includes('"action status"')&&sheet.includes('"action refer"'),'2열 기하 없음');
  assert(sheet.includes('.v211-tabs')&&sheet.includes('.v211-pane'),'참고 탭 스타일 없음');
  // 노을 콘솔: 웜 차콜 + 로즈 상호작용("색감도 다르게").
  assert(sheet.includes('--accent:#e05c7e'),'로즈 강조색 없음');
  assert(sheet.includes('--bg:#131015'),'웜 차콜 배경 없음');
  // 골드는 지금 할 일 전용 — 승인 버튼과 액션 존 마커만 금색이다.
  assert(sheet.includes('--gold:#d9a441'),'골드 토큰 없음');
  assert(sheet.includes('.v151-action-foot .primary{')&&sheet.match(/\.v151-action-foot \.primary\{[^}]*var\(--gold\)/),'승인 버튼 골드 없음');
  assert(sheet.match(/\.v155-action-zone\{border-left-color:var\(--gold\)\}/),'액션 존 골드 마커 없음');
  // 한 화면 계약: 뷰포트 높이 고정 + 패널 내부 스크롤.
  assert(sheet.includes('height:calc(100dvh - 26px)'),'한 화면 높이 경계 없음');
  // 데스크톱 HUD 중계 대상 클래스가 신작에서도 살아 있다.
  assert(sheet.includes('.v153-hud')&&sheet.includes('.v151-action{'),'HUD 중계 클래스 소실');
});

check('③ 오버레이(F9 미니 패널) — 명령어 줄은 절대 숨기지 않는다',()=>{
  assert(sheet.includes('body.ord-overlay-mode .v153-spec'),'오버레이 패널 숨김 없음');
  assert(sheet.includes('body.ord-overlay-mode .command-line{display:flex}'),'명령어 줄 표시 보장 없음');
});

check('④ 레거시 보존 — cockpit 파일은 남고 페이지에서만 은퇴',()=>{
  const legacy=read('ord_cockpit_v15.css');
  assert(legacy.length>50000,'cockpit 레거시 파일 소실');
  assert(legacy.includes('v20.1 레거시'),'cockpit 은퇴 표기 없음');
});

console.log(`\n${checks} checks passed (v20.1.0 — UI 완전 신작)`);
