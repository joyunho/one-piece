'use strict';
// v20.5.0 계약 — 가독성·구조 (사용자 스크린샷 지적 4건).
//
// "UI 구조 이게 최선이야? 그리고 티모 %이제 필요없잖아 없애줘.
//  전체적으로 글자가 작고 정보를 한눈에 알아보기 힘들어.
//  특히 희귀->전설이 그래 가시성도 생각해서 구조를 다시 짜줘"
//
// 1900×970(사용자 해상도)으로 재현해 확인한 원인:
//  ① 글자가 작다 — 원인은 폰트 설정이 아니라 두 겹의 축소였다.
//     @media(max-height:1120px) 압축 티어가 본문을 13px 로 못 박고 있었고
//     (이 조건은 거의 모든 노트북·창에 걸리므로 사실상 기본값이었다),
//     그 위에 @media(max-height:1000px) 의 zoom:.9 가 화면 전체를 90%로
//     한 번 더 줄였다.  선언된 본문 15.5px 는 실제로 적용된 적이 거의 없다.
//  ② 희귀→전설 — 좁은 가운데 칼럼에 3열, 이름 13.5px + 말줄임(…).
//     ".v158-six" 가 ".v153-craft-cards" 의 열 수를 3으로 되돌리고 있었다.
//  ③ 문구 뭉침 — "딜 계통을 선택하세요상단의 물딜·마딜…" 처럼 <b> 와
//     <span> 이 붙었다.  v20.1 시트 이관에서 빈 상태 4종의 스타일이
//     통째로 빠져 있었고, 파티 빈 슬롯 9개는 맨 숫자 "123456789" 로 찍혔다.
//  ④ 완성도 % — 1라 빈 패에서는 모든 칸이 0% 라 소음이었다.
const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const EXT=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
const css=read('ord_ui_v20.css'),app=read('ord_app.js');
const noComments=css.replace(/\/\*[\s\S]*?\*\//g,'');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS ',name);};

check('① 글자를 깎아 한 화면을 만들지 않는다',()=>{
  // 화면 전체 축소(zoom)는 폐기 — 글자만 깎는 장치였다.
  assert(!/\{zoom:\.[89]\}/.test(noComments),'zoom:.9/.8 축소가 되살아남');
  // 압축 티어가 있어도 읽을 수 있는 하한을 지킨다.
  for(const m of noComments.match(/\.v153-screen\{font-size:([\d.]+)px\}/g)||[]){
    const size=Number(m.match(/([\d.]+)px/)[1]);
    assert(size>=14,`압축 티어 본문이 ${size}px — 14px 하한 위반`);
  }
  // 한 화면 계약은 높이 고정 + 패널 내부 스크롤로 지킨다(축소가 아니라).
  assert(/\.v153-screen\{display:flex;flex-direction:column;height:calc\(100dvh/.test(noComments),'한 화면 높이 계약이 사라짐');
});

check('② 희귀→전설 — 2열 · 말줄임 대신 두 줄 · 큰 이름',()=>{
  // .v158-six 가 열 수를 3으로 되돌리던 것이 실제 원인이었다.
  assert(/\.v158-six\{display:grid;grid-template-columns:repeat\(2,/.test(noComments),'.v158-six 가 2열이 아님');
  assert(/\.v153-craft-cards\{display:grid;grid-template-columns:repeat\(2,/.test(noComments),'카드 그리드가 2열이 아님');
  assert(!/\.v153-craft-cards\{[^}]*repeat\(3,/.test(noComments),'3열이 남아 있음');
  // 이름·역할은 잘라내지 말고 접는다.
  const name=noComments.match(/\.v153-craft-cards>button>header b\{([^}]*)\}/);
  assert(name,'카드 이름 규칙 없음');
  assert(/-webkit-line-clamp:2/.test(name[1]),'이름이 두 줄 접기가 아님');
  assert(!/text-overflow:ellipsis/.test(name[1]),'이름이 여전히 말줄임');
  assert(/font-size:1[6-9]px/.test(name[1]),`이름이 16px 미만: ${name[1]}`);
});

check('③ 빈 상태 — <b>와 <span>이 뭉치지 않는다',()=>{
  // v20.1 이관에서 빠졌던 네 클래스.  스타일이 없으면 인라인으로 붙는다.
  for(const sel of ['.v153-spec-wait','.v153-upper-empty','.v155-party-idle','.v155-party-ghost'])
    assert(noComments.includes(sel),`빈 상태 스타일 없음: ${sel}`);
  assert(/\.v153-spec-wait,\.v153-upper-empty\{[^}]*display:grid/.test(noComments),'빈 상태가 블록 배치가 아님');
  assert(/\.v153-no-crafts\{[^}]*display:grid/.test(noComments),'희귀 빈 상태가 블록 배치가 아님');
  // 9환산 빈 자리는 "123456789" 가 아니라 칸 9개로 보여야 한다.
  assert(/\.v155-party-ghost\{[^}]*grid-template-columns:repeat\(3,/.test(noComments),'빈 자리가 3×3 격자가 아님');
  assert(/\.v155-party-ghost>i\{[^}]*border:1px dashed/.test(noComments),'빈 자리 칸 테두리가 없음');
  // 유닛명 옆 등급 태그가 이름에 달라붙지 않는다("샹크스희귀 B · 24위").
  assert(/\.v151-story\{[^}]*margin-left:/.test(noComments),'등급 태그 간격 없음');
  // 토스트가 상단 바 위로 늘어나지 않는다(구 시트 top:16px 잔재).
  assert(/\.ord-toast\{[^}]*top:auto/.test(noComments),'토스트 top 해제 없음');
});

check('④ 완성도 % 는 화면 어디에도 없다',()=>{
  for(const gone of ['v202-progress','v202-queue-pct','v156-ratio','TMO 완성도','코치 계산 재료 진행도'])
    assert(!app.includes(gone),`완성도% 잔재: ${gone}`);
  // 처음엔 ord_app.js 와 ord_v15_engine.js 만 훑었다가, 빌드된 매뉴얼을
  // 문자열로 뒤져 ord_core.js 에 두 곳이 살아 있는 걸 뒤늦게 찾았다.
  // 판단 사유(why.headline)와 경로 안내(note)는 둘 다 화면에 그려진다.
  // 그래서 훑는 대상을 "화면에 문구를 싣는 모든 파일"로 넓힌다.
  for(const file of ['ord_app.js','ord_v15_engine.js','ord_core.js','ord_v15_policy.js','ord_squad_planner.js']){
    const src=read(file).replace(/\/\/[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');
    for(const gone of ['TMO 완성도','원 TMO'])assert(!src.includes(gone),`${file} 에 완성도% 잔재: ${gone}`);
  }
  // 152 보상 칸이 마지막 % 표시였다 — 같은 사실을 선택위습 환산으로 말한다.
  assert(app.includes('선위 ${fmt(row.wispSaved)} 절약'),'152 칸 선택위습 환산 없음');
  // 상태줄도 마찬가지 — 없는 표시를 기다리라고 말하지 않는다.
  assert(!read('ord_core.js').includes('%·능력치는 TMO 탭 보강 대기'),'상태줄이 사라진 %를 계속 기다림');
  // 대체 사실 — 행동을 바꾸는 것만 남는다.
  assert(app.includes('흔함 ${C.num(progress.short)}장 남음'),'남은 흔함 장수가 없음');
});

console.log(`\n${checks} checks passed (v20.5.0 — 가독성·구조)`);
