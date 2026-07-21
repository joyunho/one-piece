'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const css=fs.readFileSync(path.join(EXT,'ord_app.css'),'utf8');
const appSource=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
let checks=0;

function check(name,fn){
  fn();
  checks++;
  console.log(`PASS  ${name}`);
}
function after(later,earlier,message){
  const laterAt=css.lastIndexOf(later),earlierAt=css.lastIndexOf(earlier);
  assert(laterAt>=0,`missing CSS rule: ${later}`);
  assert(earlierAt>=0,`missing comparison CSS rule: ${earlier}`);
  assert(laterAt>earlierAt,message||`${later} must override ${earlier}`);
}

check('desktop frame is narrowed to 1440px after the previous wide-frame rule',()=>{
  after('.ord-app{max-width:1440px}','.ord-app{max-width:1780px','the 1440px cap must win in the cascade');
  assert(css.includes('.ord-layout{grid-template-columns:minmax(0,1fr) 272px}'),'desktop layout must use a compact 272px sidebar');
  assert(css.includes('@media(max-width:1260px){.ord-layout{grid-template-columns:minmax(0,1fr) 252px}}'),'mid-size sidebar reduction is missing');
});

check('mobile one-column layout remains after the new desktop override',()=>{
  after('@media(max-width:850px){.ord-layout{grid-template-columns:1fr}.rare-columns>div>.rare-stack{max-height:none}}','.ord-layout{grid-template-columns:minmax(0,1fr) 272px}','late mobile override must follow the desktop grid');
});

check('Rare reroll lanes stack vertically and override the former three-column grid',()=>{
  after('.rare-columns{grid-template-columns:1fr;gap:9px}','.rare-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}','vertical Rare reroll rule must win in the cascade');
  assert(css.includes('.rare-columns>div{max-height:none;overflow:hidden'),'category containers must keep their headings fixed');
  assert(css.includes('.rare-columns>div>.rare-stack{display:grid;grid-template-columns:1fr;gap:5px;max-height:220px;overflow:auto'),'only each long Rare list should scroll');
});

check('Rare reroll renderer emits three independent scroll stacks in use-hold-reroll order',()=>{
  assert(appSource.includes('class="rare-stack"'),'Rare renderer is missing the per-category list wrapper');
  global.window=global;
  global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
  for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_app.js'])require(path.join(EXT,file));
  const C=global.ORDCore,App=global.ORDApp.App,catalog=global.ORD_TMO_UNITS,db=C.buildDb(catalog),rare=db.rares[0];
  const settings={currentRound:25,mode:'physical',manualCounts:{},allowWarped:true,recommendWarped:true};
  const state=C.normalizeState(catalog,{counts:{[rare.id]:3},units:[],currentAbilities:{}},settings);
  const app=Object.create(App.prototype);
  app.state={locks:[],virtualSpecialId:''};
  const html=app.renderRareResolution(state,{squadPlan:{rareAllocation:[{id:rare.id,initial:3,spent:1,reserved:1,remaining:1}]}});
  assert.strictEqual((html.match(/class="rare-stack"/g)||[]).length,3,'each category needs its own scroll stack');
  const useAt=html.indexOf('<div class="use">'),holdAt=html.indexOf('<div class="hold">'),rerollAt=html.indexOf('<div class="reroll">');
  assert(useAt>=0&&useAt<holdAt&&holdAt<rerollAt,'Rare lanes must render as use, hold, reroll');
  for(const start of [useAt,holdAt,rerollAt]){
    const end=html.indexOf('</div></div>',start);
    assert(html.indexOf('<h3>',start)<html.indexOf('class="rare-stack"',start),'category heading must precede its scroll stack');
    assert(end>start,'Rare lane markup is incomplete');
  }
});

console.log(`\n${checks}/${checks} v14.0.0 narrow/vertical layout checks passed.`);
