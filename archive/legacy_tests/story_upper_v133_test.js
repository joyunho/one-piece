'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_story_upper_data.js'])require(path.join(EXT,file));

const data=global.ORD_STORY_UPPER_V2305;
const entries=Object.values(data||{});
const sourceRows=entries.flatMap(entry=>entry.variants||[]).sort((a,b)=>a.rank-b.rank);
const catalogById=new Map((global.ORD_TMO_UNITS||[]).map(unit=>[unit.id,unit]));
const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('dataset preserves all 80 source ranks contiguously',()=>{
  assert.strictEqual(sourceRows.length,80);
  assert.strictEqual(new Set(sourceRows.map(row=>row.rank)).size,80);
  assert.deepStrictEqual(sourceRows.map(row=>row.rank),Array.from({length:80},(_,i)=>i+1));
  assert.strictEqual(entries.length,78); // 77 measured IDs plus the alternate Nika recipe alias.
});

test('all direct and variant IDs exist in the patched v2.305 catalog',()=>{
  for(const entry of entries)assert(catalogById.has(entry.id),`missing catalog ID: ${entry.id}`);
  for(const row of sourceRows)assert(catalogById.has(row.id),`missing source catalog ID: ${row.id} (${row.displayName})`);
});

test('all mapped catalog units are upper grades',()=>{
  const upperGroup=/초월|불멸|영원|제한|신비/;
  for(const entry of entries){
    const unit=catalogById.get(entry.id);
    assert(upperGroup.test(String(unit.groupName||'')),`non-upper unit leaked: ${entry.id} ${unit.groupName} ${unit.name}`);
  }
});

test('table tiers and metric shapes match the eight source tables',()=>{
  for(const row of sourceRows){
    assert.strictEqual(row.tableTier,Math.ceil(row.rank/10),`wrong table tier at rank ${row.rank}`);
    assert.strictEqual(row.metricType,row.rank<=14?'seconds':'percent');
    assert.strictEqual(typeof row.value,'number');
    assert.strictEqual(row.approximate,false);
    assert.strictEqual(typeof row.note,'string');
    assert.strictEqual(typeof row.stateKey,'string');
  }
});

test('rank order is internally consistent within both metric systems',()=>{
  const seconds=sourceRows.filter(row=>row.metricType==='seconds');
  const percents=sourceRows.filter(row=>row.metricType==='percent');
  for(let i=1;i<seconds.length;i++)assert(seconds[i-1].value<=seconds[i].value,`seconds order breaks at rank ${seconds[i].rank}`);
  for(let i=1;i<percents.length;i++)assert(percents[i-1].value>=percents[i].value,`percent order breaks at rank ${percents[i].rank}`);
});

test('duplicate measured states are preserved as variants with base representatives',()=>{
  assert.deepStrictEqual(data['unit_1761123532798_5416'].variants.map(row=>row.rank),[5,80]);
  assert.strictEqual(data['unit_1761123532798_5416'].rank,80);
  assert.deepStrictEqual(data.JC0h.variants.map(row=>row.rank),[34,41]);
  assert.strictEqual(data.JC0h.rank,41);
  assert.deepStrictEqual(data['unit_1761060002112_2027'].variants.map(row=>row.rank),[57,72]);
  assert.strictEqual(data['unit_1761060002112_2027'].rank,72);
});

test('alternate Nika recipe has a catalog-safe direct alias without duplicating a source row',()=>{
  assert.strictEqual(data.KB0H.rank,11);
  assert.strictEqual(data.KB0H_.rank,11);
  assert.strictEqual(data.KB0H_.aliasOf,'KB0H');
  assert.deepStrictEqual(data.KB0H_.variants,[]);
});

test('representative source spot checks and catalog aliases are exact',()=>{
  assert.deepStrictEqual(sourceRows[0],{
    id:'unit_1761065051171_5253',rank:1,tableTier:1,imageTier:'신비',displayName:'료우기시키',
    metricType:'seconds',value:15.87,approximate:false,note:'',stateKey:'measured'
  });
  assert.strictEqual(data.G40h.displayName,'제파');
  assert(/제트/.test(catalogById.get('G40h').name));
  assert.deepStrictEqual([data.W80H.rank,data.W80H.value,data.W80H.note],[14,56.17,'300골 세팅']);
  assert.deepStrictEqual([data.A90H.rank,data.A90H.metricType,data.A90H.value],[15,'percent',99.76]);
  assert.strictEqual(data['2B0H'].displayName,'루피 기어포스');
  assert.strictEqual(data.Y80H.note,'써니호 2대 ON');
  assert.deepStrictEqual([sourceRows[79].displayName,sourceRows[79].value,sourceRows[79].note],['샌즈',4.62,'강화 X']);
});

let failed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS  ${name}`);}catch(error){failed++;console.error(`FAIL  ${name}\n${error.stack}`);}
}
if(failed)process.exit(1);
console.log(`\n${tests.length}/${tests.length} upper story-data checks passed.`);
