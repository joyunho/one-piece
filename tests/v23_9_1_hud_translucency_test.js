'use strict';

// v23.9.1 계약 — 사용자(0819): "오버레이 창이 반투명해도 ㄱㅊ을듯?"
// F8 HUD 콘텐츠 판을 반투명(.62)으로 낮춰 게임이 비쳐 보이게 한다.
// 가독은 글자 그림자로, 승인 버튼 호버 순간에는 다시 진해진다(.92).

const assert=require('assert'),fs=require('fs'),path=require('path');
const hud=fs.readFileSync(path.join(__dirname,'..','ord_tmo_auto_extension_v15_0_0_rebuild','ord_hud_desktop.html'),'utf8');

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('반투명 판 + 글자 그림자 + 호버 시 복원',()=>{
  assert(hud.includes('#ord-hud-root>*{background:rgba(10,8,12,.62) !important;}'),'반투명 판(.62) 부재');
  assert(hud.includes('#ord-hud-root{text-shadow:0 1px 3px rgba(0,0,0,.85);}'),'가독용 글자 그림자 부재');
  assert(hud.includes('body.hud-hot #ord-hud-root>*{background:rgba(10,8,12,.92) !important;}'),'호버 시 불투명 복원 부재');
  const overrideAt=hud.indexOf('background:rgba(10,8,12,.62)');
  const baseAt=hud.indexOf('background:rgba(10,8,12,.92) !important');
  assert(baseAt>=0&&overrideAt>baseAt,'반투명 규칙이 기본 규칙보다 뒤에 있어야 우선한다');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V23_9_1_HUD_TRANSLUCENCY ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);