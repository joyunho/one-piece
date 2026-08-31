'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_story_nonupper_data.js'])require(path.join(EXT,file));

const data=global.ORD_STORY_NONUPPER_V2305;
const entries=Object.values(data||{});
const catalogById=new Map((global.ORD_TMO_UNITS||[]).map(unit=>[unit.id,unit]));
const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('dataset has 76 unique catalog IDs and contiguous ranks 1-76',()=>{
  assert.strictEqual(entries.length,76);
  assert.strictEqual(new Set(Object.keys(data)).size,76);
  assert.strictEqual(new Set(entries.map(row=>row.rank)).size,76);
  assert.deepStrictEqual(entries.map(row=>row.rank),Array.from({length:76},(_,i)=>i+1));
  for(const [id,row] of Object.entries(data))assert.strictEqual(row.id,id);
});

test('all IDs exist in the patched v2.305 catalog',()=>{
  for(const row of entries)assert(catalogById.has(row.id),`missing catalog ID: ${row.id} (${row.displayName})`);
});

test('table tiers and metric shapes match the seven source tables',()=>{
  for(const row of entries){
    const expectedTier=row.rank<=60?Math.ceil(row.rank/10):7;
    assert.strictEqual(row.tableTier,expectedTier,`wrong table tier at rank ${row.rank}`);
    assert(['seconds','percent'].includes(row.metricType));
    assert.strictEqual(typeof row.value,'number');
    assert.strictEqual(typeof row.approximate,'boolean');
    assert.strictEqual(typeof row.note,'string');
    assert.strictEqual(row.metricType,row.rank<=4?'seconds':'percent');
  }
});

test('rank order is internally consistent for seconds and percentages',()=>{
  const seconds=entries.filter(row=>row.metricType==='seconds');
  const percents=entries.filter(row=>row.metricType==='percent');
  for(let i=1;i<seconds.length;i++)assert(seconds[i-1].value<=seconds[i].value);
  for(let i=1;i<percents.length;i++)assert(percents[i-1].value>=percents[i].value,`percent order breaks at rank ${percents[i].rank}`);
});

test('known source rows and aliases are preserved exactly',()=>{
  assert.deepStrictEqual(data.J70h,{id:'J70h',rank:1,tableTier:1,imageTier:'변화',displayName:'캐럿',metricType:'seconds',value:44,approximate:true,note:''});
  assert.strictEqual(data.Y20h.displayName,'루피 나이트메어');
  assert.strictEqual(data.U30h.rank,11);
  assert.strictEqual(data['230h'].approximate,true);
  assert.strictEqual(data.C30h.note,'스킬 2회');
  assert.strictEqual(data['unit_1752901441310_3608'].displayName,'쵸파 유령강화');
  assert.deepStrictEqual([data.Q30h.rank,data.Q30h.value],[76,4.04]);
});

test('approximation and conditional-note flags match the source images',()=>{
  assert.deepStrictEqual(entries.filter(row=>row.approximate).map(row=>row.rank),[1,2,3,4,9,13,19,31]);
  assert.deepStrictEqual(entries.filter(row=>row.note).map(row=>row.rank),[9,13,19,31,39,69,70,71]);
});

test('no upper-grade catalog IDs are present',()=>{
  const upperGroup=/초월|불멸|영원|제한|신비/;
  for(const row of entries){
    const unit=catalogById.get(row.id);
    assert(!upperGroup.test(String(unit.groupName||'')),`upper unit leaked: ${row.id} ${unit.groupName} ${unit.name}`);
  }
});

let failed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS  ${name}`);}catch(error){failed++;console.error(`FAIL  ${name}\n${error.stack}`);}
}
if(failed)process.exit(1);
console.log(`\n${tests.length}/${tests.length} non-upper story-data checks passed.`);
