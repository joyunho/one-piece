'use strict';

// v23.7.0 계약 — 사용자 리포트(0818, 스크린샷):
// ① "이거 화면을 너무 가린다 이것만 보고 하기에도 힘들고" — F8 HUD 가
//    게임 자체 우상단 정보(시즌 패널·유닛 카운트 체인·점수표)를 덮고,
//    잠금 카드의 안내 문단까지 통째로 중계돼 패널이 거대했다.
// ② "상위 준비를 누르면 지금 할 일에 상위를 선택하는 목록들이 떠야
//    하는데 전설급 유닛 추천하고 있더라" — postLegendRoute='upper' 뒤
//    엔진이 방향을 자동 채택하고 일반 탐색으로 떨어져, 보조 전설 제작이
//    카드를 차지했다.
//
// 계약: ① HUD — 잠금 카드 안내 문단·아이콘 숨김, 여백·글자 한 단계
//        축소(가독 하한: 제목 18px·본문 13px), 기본 창 자리 y+210·폭 348
//        (F9 로 끌어 놓은 자리가 있으면 그 자리 우선)
//      ② 앱 — 상위 준비 + 상위 미확정이면 지금 할 일에 상위 후보 선택
//        카드(v237-upper-pick): choose-direction 확정 버튼 + 저격 버튼 +
//        엔진 최선 한 줄(mark-made — v21.0 '멈추지 않는다' 유지)

const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('① HUD 내용 다이어트 — 잠금 문단 숨김·축소 스케일',()=>{
  const hud=read('ord_hud_desktop.html');
  assert(hud.includes('.v151-action.blocked .v151-action-copy p,#ord-hud-root .v151-action.blocked .v151-action-copy i{display:none !important;}'),'잠금 카드 안내 문단 숨김 규칙 부재');
  assert(hud.includes('#ord-hud-root .v151-action-title,#ord-hud-root .v151-action-main b{font-size:18px;}'),'제목 축소(18px) 부재');
  assert(hud.includes('.v158-blocked-spec{font-size:12px;}'),'결손 블록 축소 부재');
  assert(hud.includes('화면을 너무 가린다'),'사용자 리포트 근거 주석 부재');
});

test('① HUD 기본 창 자리 — 게임 우상단 정보 아래(y+210)·폭 348',()=>{
  const main=fs.readFileSync(path.join(__dirname,'..','desktop','main.js'),'utf8');
  assert(main.includes('y: area.y + 210, width: 348'),'기본 자리 하향(y+210)·폭 348 부재');
  assert(main.includes('remembered ||'),'F9 지정 자리(remembered) 우선 규칙이 사라짐');
});

test('② 상위 준비 → 상위 선택 카드 (지금 할 일)',()=>{
  const app=read('ord_app.js');
  assert(app.includes("this.state.postLegendRoute==='upper'&&!this.upperLock()&&!plan.upper&&!this.state.upperPreviewId"),'상위 준비 분기 조건 부재');
  assert(app.includes('v237-upper-pick'),'상위 선택 카드 마크업 부재');
  const start=app.indexOf('상위 준비 카드를 세우고')>=0?app.indexOf('상위 준비 카드를 세우고'):app.indexOf('v237-engine-step');
  const pick=app.slice(Math.max(0,start-1200),start+2600);
  assert(pick.includes('data-act="choose-direction"'),'후보 확정 버튼(choose-direction) 부재');
  assert(pick.includes('data-act="snipe-open"'),'저격 버튼 부재');
  assert(pick.includes('data-act="mark-made"'),'엔진 최선 한 줄(제작 승인) 부재 — 선택 대기 동결 재발 위험');
  for(const file of ['ord_ui_v20.css','ord_cockpit_v15.css'])assert(read(file).includes('.v237-engine-step'),`${file} 스타일 부재`);
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_7_0_HUD_UPPER_PICK ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);