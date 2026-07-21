'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const read=file=>fs.readFileSync(path.join(EXT,file),'utf8');
const appSource=read('ord_app.js');
const css=read('ord_app.css');
const tests=[];

function test(name,fn){tests.push([name,fn]);}

function loadRuntime(){
  const memory=new Map();
  const context=vm.createContext({
    console,
    localStorage:{
      getItem:key=>memory.has(key)?memory.get(key):null,
      setItem:(key,value)=>memory.set(key,String(value)),
      removeItem:key=>memory.delete(key)
    }
  });
  context.window=context;
  context.globalThis=context;
  for(const file of ['ord_units_data.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_app.js']){
    vm.runInContext(read(file),context,{filename:file});
  }
  return context;
}

const runtime=loadRuntime();
const C=runtime.ORDCore;
const App=runtime.ORDApp.App;
const T=runtime.ORDApp._test;
const catalog=runtime.ORD_TMO_UNITS;
const leagueOrder=['rare','upper','legend'];
const expectedTotals={rare:42,upper:89,legend:81};

test('story league state defaults to rare and rejects stale values',()=>{
  assert.match(appSource,/storyLeague:'rare'/);
  assert.strictEqual(T.normalizeInitialState({}).storyLeague,'rare');
  assert.strictEqual(T.normalizeInitialState({storyLeague:'upper'}).storyLeague,'upper');
  assert.strictEqual(T.normalizeInitialState({storyLeague:'legend'}).storyLeague,'legend');
  assert.strictEqual(T.normalizeInitialState({storyLeague:'obsolete'}).storyLeague,'rare');
});

test('story renderer remains available to data tools but is removed from the live navigation',()=>{
  assert(!appSource.includes('data-tab="story">스토리 등급</button>'),'single-screen live UI must not expose the legacy story tab');
  assert(appSource.includes("order=['rare','upper','legend']"),'story league order must be Rare, Upper, Legendary');
  assert(appSource.includes('C.storyLeagueRows(state.db.units)'),'catalog must use the core league API');
  assert(appSource.includes('class="story-leagues"'),'three-league tab list is missing');
  assert(appSource.includes('data-act="story-league"'),'story league action is missing');
  assert(appSource.includes('data-story-league="${league}"'),'catalog does not expose its active league');
});

test('league switch action resets a stale tier filter and ignores invalid league keys',()=>{
  const app=Object.create(App.prototype);
  let persisted=0,rendered=0;
  app.state={storyLeague:'rare',storyTier:'S',pendingTransaction:null};
  app.persist=()=>{persisted++;};
  app.render=()=>{rendered++;};

  app.act('story-league',{dataset:{league:'upper'}});
  assert.strictEqual(app.state.storyLeague,'upper');
  assert.strictEqual(app.state.storyTier,'');
  assert.deepStrictEqual([persisted,rendered],[1,1]);

  app.state.storyTier='A';
  app.act('story-league',{dataset:{league:'invalid'}});
  assert.strictEqual(app.state.storyLeague,'upper');
  assert.strictEqual(app.state.storyTier,'A');
  assert.deepStrictEqual([persisted,rendered],[1,1]);
});

test('core catalog partitions the shipped units into 42 Rare, 89 Upper, and 81 Legendary rows',()=>{
  const rows=C.storyLeagueRows(catalog),counts={rare:0,upper:0,legend:0};
  for(const row of rows){
    assert(leagueOrder.includes(row.league),`unexpected story league: ${row.league}`);
    counts[row.league]++;
    assert.strictEqual(row.grade.league,row.league);
  }
  for(const key of leagueOrder)assert.strictEqual(counts[key],expectedTotals[key],`${key} catalog count changed`);
  assert.strictEqual(rows.length,212,'material and item rows leaked into the combat-story leagues');

  const rare=C.storyLeagueRows(catalog,'rare');
  const upper=C.storyLeagueRows(catalog,'upper');
  const legend=C.storyLeagueRows(catalog,'legend');
  assert.deepStrictEqual([rare[0].unit.id,rare[0].grade.leagueRank],['Q10h',1]);
  assert.deepStrictEqual([upper[0].unit.id,upper[0].grade.leagueRank],['unit_1761065051171_5253',1]);
  assert.deepStrictEqual([legend[0].unit.id,legend[0].grade.leagueRank],['J70h',1]);
  assert.strictEqual(C.storyLeagueKey(catalog.find(unit=>unit.id==='unit_1761122598665_345')),'upper','Mystery units from the upper table must remain Upper');
  assert.strictEqual(C.storyLeagueKey(catalog.find(unit=>unit.id==='unit_1767884457709_1523')),'legend','Special units from the non-upper table must remain Legendary');
});

test('real catalog renderer prints all three totals and only active-league cards',()=>{
  const state={db:C.buildDb(catalog)};
  for(const league of leagueOrder){
    const app=Object.create(App.prototype);
    app.state={storyLeague:league,storyQuery:'',storyTier:'',storyBasis:''};
    const html=app.renderStoryCatalog(state);
    const tabOrder=[...html.matchAll(/data-act="story-league" data-league="(rare|upper|legend)"/g)].map(match=>match[1]);
    assert.deepStrictEqual(tabOrder,leagueOrder,`${league} tab order changed`);
    for(const key of leagueOrder)assert(html.includes(`<b>${expectedTotals[key]}기</b>`),`${key} total is not rendered in the league tabs`);
    assert(html.includes(`class="story-catalog" data-story-league="${league}"`),`${league} catalog marker missing`);
    assert(html.includes(`class="on league-${league}" data-act="story-league"`),`${league} active tab marker missing`);
    assert.strictEqual((html.match(/<article class="story-card /g)||[]).length,expectedTotals[league],`${league} rendered card count changed`);
    for(const other of leagueOrder.filter(key=>key!==league)){
      assert(!html.includes(`story-card measured league-${other}`),`${other} cards leaked into the ${league} catalog`);
      assert(!html.includes(`story-card estimated league-${other}`),`${other} estimated cards leaked into the ${league} catalog`);
    }
  }
});

test('league tabs, accents, rank badges, and mobile overrides are present in CSS',()=>{
  for(const marker of [
    '.story-leagues{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))',
    '.story-leagues .league-rare.on',
    '.story-leagues .league-upper.on',
    '.story-leagues .league-legend.on',
    '.story-card.league-rare',
    '.story-card.league-upper',
    '.story-card.league-legend',
    '.story-card-title>span.ranked',
    '.story-card-title>span.estimated',
    '@media(max-width:520px){.story-leagues'
  ])assert(css.includes(marker),`missing story-league CSS marker: ${marker}`);
});

let failed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS  ${name}`);}
  catch(error){failed++;console.error(`FAIL  ${name}\n${error.stack}`);}
}
if(failed)process.exit(1);
console.log(`\n${tests.length}/${tests.length} v14.0.0 story-league UI checks passed.`);
