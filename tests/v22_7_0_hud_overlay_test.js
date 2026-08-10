'use strict';
// v22.7.0 계약 — F8 인게임 HUD · F9 미니 패널 재설계.
//
// 사용자: "f8 f9 기능이 너무 별로야 정보가 중구난방으로 정리되어있고
// 글씨도 작아 해결해줘".
//
// 포렌식: HUD 페이지(ord_hud_desktop.html)는 v20.1 리스킨(cockpit 은퇴,
// v20_1_0_new_ui_test 는 helper 페이지 두 장만 검사)에서 누락돼 은퇴한
// ord_cockpit_v15.css 를 계속 로드했다.  중계 조각(.v153-hud/.v151-action)
// 의 스타일은 전부 ord_ui_v20.css 에 있으므로 HUD 는 맨몸 HTML 로
// 그려졌다 — "중구난방"의 정체.
//
// ① F8 — 신작 시트 로드 + 토큰 스코프(v153-screen 루트)
// ② F8 — 고정 순서(라운드→국면→마감→필) + 확대 + 소음 정리
// ③ F9 — 서랍 잔해 숨김 · 단일 열 · 확대, 국면 패널(스토리 스텝퍼)은 생존
// ④ 기존 계약 유지 — 투명 배경·버튼 정리·명령어 줄·레거시 핀

const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const hud=read('ord_hud_desktop.html'),css=read('ord_ui_v20.css');
const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('① F8 HUD 페이지가 실제 스킨(ord_ui_v20.css)을 로드한다',()=>{
  assert(hud.includes('ord_ui_v20.css'),'신작 시트 링크 없음 — 중계 조각이 맨몸으로 그려진다');
  assert(!hud.includes('ord_cockpit_v15.css'),'은퇴한 cockpit 시트를 여전히 로드');
  // 디자인 토큰(var(--…))은 .v153-screen 에 정의된다 — 루트가 그 클래스를
  // 달아야 조각 스타일이 색·글꼴을 얻는다.
  assert(hud.includes('id="ord-hud-root" class="v153-screen"'),'HUD 루트에 토큰 스코프 클래스 없음');
});

test('② F8 — 고정 순서 + 확대 + 소음 정리',()=>{
  for(const marker of ['.v153-round{order:0','.v22-phase{order:1','.v22-due{order:2','.v153-pill{order:3'])
    assert(hud.includes(marker),`표시 순서 고정 누락: ${marker}`);
  assert(hud.includes('#ord-hud-root [data-clock],#ord-hud-root .v153-mode{display:none'),'시계·계통 스위치 숨김 없음');
  assert(hud.includes('#ord-hud-root .v151-action-title,#ord-hud-root .v151-action-main b{font-size:22px'),'카드 제목 확대 없음');
  assert(hud.includes('.v153-next-candidates')&&hud.includes('.v221-story')&&hud.includes('.v222-vetoed')&&hud.includes('.v151-action-facts'),'보조 블록 정리 없음');
  // 관전 동결 경고의 버튼은 문장 일부 — 숨기면 문장이 깨지므로 평문화.
  assert(hud.includes('.v216-freeze-note button{display:inline'),'동결 경고 버튼 평문화 없음');
});

test('③ F9 — 서랍 잔해 숨김 · 단일 열 · 확대 · 국면 패널 생존',()=>{
  // v21.1 참고 서랍은 v22.0 이후 오버레이에서 탭 껍데기만 보였다.
  assert(css.includes('body.ord-overlay-mode .v211-refer,'),'참고 서랍(v211-refer) 숨김 없음');
  assert(css.includes('body.ord-overlay-mode .v153-screen{display:block;height:auto;font-size:16px}'),'단일 열·기본 글씨 16px 없음');
  assert(css.includes('body.ord-overlay-mode .v151-action-title,body.ord-overlay-mode .v151-action-main b{font-size:22px}'),'카드 제목 22px 없음');
  // 국면 패널은 이제 숨기지 않는다 — 스토리 스텝퍼(v221)가 게임 중 유일한
  // 손 입력이다.  대신 긴 블록만 접는다.
  assert(!css.includes('body.ord-overlay-mode .v153-spec,'),'국면 패널이 여전히 숨김 목록에 있다');
  assert(css.includes('body.ord-overlay-mode .v153-spec{min-height:0;overflow:visible}'),'국면 패널 생존 규칙 없음');
  assert(css.includes('body.ord-overlay-mode .v22-spec-fold,'),'전체 스펙 표 접기 없음');
  assert(css.includes('body.ord-overlay-mode .v221-story-row button{min-width:44px'),'스토리 스텝퍼 터치 크기 없음');
});

test('④ 기존 계약 유지 — 투명·버튼 정리·명령어 줄·레거시 핀',()=>{
  assert(hud.includes('background:transparent'),'투명 배경 소실');
  assert(hud.includes('ord_hud_desktop.js'),'HUD 스크립트 소실');
  assert(hud.includes('button:not(.v151-recovery-row)'),'버튼 정리(회복 줄 예외) 소실');
  assert(!/\son\w+\s*=/.test(hud),'인라인 핸들러 금지 위반');
  // v19_11/v20_1 이 요구하는 셀렉터 문자열은 재편 후에도 남아야 한다.
  assert(css.includes('body.ord-overlay-mode .v153-spec')&&css.includes('body.ord-overlay-mode .v155-rare-strip'),'레거시 셀렉터 핀 소실');
  assert(css.includes('body.ord-overlay-mode .command-line{display:flex}'),'조합 명령어 줄 보장 소실');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V22_7_0_HUD_OVERLAY ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
