(function(){
'use strict';
// ORD 악몽 보드 — 인게임 HUD (v28.0.0 전면 신작).
// 표시 전용: 메인 창이 그린 전용 조각(hudHtml)을 받아 그대로 보여준다.
// 앱을 두 번 돌리지 않고, 버튼도 없다 — 클릭은 전부 게임으로 통과.
const root=document.getElementById('hud-root');
const bridge=window.ORD_DESKTOP;
if(root&&bridge&&typeof bridge.onHudState==='function'){
  bridge.onHudState(payload=>{
    try{root.innerHTML=payload&&typeof payload.hudHtml==='string'?payload.hudHtml:'';}catch(_){}
  });
}
})();
