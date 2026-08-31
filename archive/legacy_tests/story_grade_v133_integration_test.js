'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const nonupper=global.ORD_STORY_NONUPPER_V2305;
const upper=global.ORD_STORY_UPPER_V2305;
const catalogById=new Map(global.ORD_TMO_UNITS.map(unit=>[unit.id,unit]));
const grade=id=>{
  const unit=catalogById.get(id);
  assert(unit,`catalog unit missing: ${id}`);
  return C.storyGrade(unit);
};
const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('both measured story tables are loaded before and consumed by core',()=>{
  assert.strictEqual(Object.keys(nonupper).length,76);
  assert(Object.keys(upper).length>=75);
  const lowerGrade=grade('J70h'),upperGrade=grade('unit_1761065051171_5253');
  assert.deepStrictEqual([lowerGrade.scope,lowerGrade.storyRank,lowerGrade.basis],['nonupper',1,'measured']);
  assert.deepStrictEqual([upperGrade.scope,upperGrade.storyRank,upperGrade.basis],['upper',1,'measured']);
  assert.strictEqual(lowerGrade.rankBasis,'measured-rank');
  assert.strictEqual(upperGrade.rankBasis,'measured-rank');
});

test('every direct measured ID keeps its representative source rank',()=>{
  for(const [scope,data] of [['nonupper',nonupper],['upper',upper]]){
    for(const [id,row] of Object.entries(data)){
      const result=grade(id);
      assert.strictEqual(result.scope,scope,`${id} scope`);
      assert.strictEqual(result.storyRank,row.rank,`${id} rank`);
      assert.strictEqual(result.metricType,row.metricType,`${id} metric type`);
      assert.strictEqual(result.value,row.value,`${id} display value`);
    }
  }
});

test('rank, never raw seconds/percent magnitude, controls measured score',()=>{
  const secondsFirst=grade('J70h');       // rank 1, 44 seconds
  const percentFirst=grade('Y20h');       // rank 5, 97.10 percent
  assert(secondsFirst.value<percentFirst.value,'fixture must catch raw-number sorting');
  assert(secondsFirst.score>percentFirst.score,'rank 1 must outrank rank 5');
  assert.strictEqual(secondsFirst.score,100);
  assert.strictEqual(grade('Q30h').score,0);

  const upperSeconds=grade('W80H');       // rank 14, 56.17 seconds
  const upperPercent=grade('A90H');       // rank 15, 99.76 percent
  assert(upperSeconds.value<upperPercent.value,'upper fixture must cross metric systems');
  assert(upperSeconds.score>upperPercent.score,'upper rank 14 must outrank rank 15');
});

test('scores are monotonic by representative rank inside each source table',()=>{
  for(const data of [nonupper,upper]){
    const rows=Object.values(data).map(row=>({row,result:grade(row.id)})).sort((a,b)=>a.row.rank-b.row.rank);
    for(let i=1;i<rows.length;i++){
      if(rows[i-1].row.rank<rows[i].row.rank)assert(rows[i-1].result.score>rows[i].result.score,`score order breaks at ${rows[i].row.id}`);
    }
  }
});

test('same-ID measured states remain intact as variants and base stays representative',()=>{
  const multi=Object.values(upper).filter(row=>Array.isArray(row.variants)&&row.variants.length>1);
  assert.strictEqual(multi.length,3);
  for(const row of multi){
    const result=grade(row.id),base=row.variants.find(variant=>variant.stateKey==='base');
    assert(base,`${row.id} base variant missing`);
    assert.strictEqual(result.storyRank,base.rank,`${row.id} must use base rank`);
    assert.strictEqual(result.variantCount,row.variants.length);
    assert.deepStrictEqual(result.variants.map(variant=>[variant.rank,variant.stateKey]),row.variants.map(variant=>[variant.rank,variant.stateKey]));
  }
});

test('alternate Nika catalog ID resolves directly without inventing a variant',()=>{
  const result=grade('KB0H_');
  assert.strictEqual(result.aliasOf,'KB0H');
  assert.strictEqual(result.storyRank,upper.KB0H.rank);
  assert.strictEqual(result.variantCount,0);
});

test('legacy rare experiment and estimated fallbacks still work',()=>{
  const rare=grade('420h');
  assert.strictEqual(rare.basis,'measured');
  assert.strictEqual(rare.storyRank,undefined);
  const common=grade('300h');
  assert.strictEqual(common.basis,'estimated');
});

let failed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS  ${name}`);}catch(error){failed++;console.error(`FAIL  ${name}\n${error.stack}`);}
}
if(failed)process.exit(1);
console.log(`\n${tests.length}/${tests.length} measured-story core integration checks passed.`);
