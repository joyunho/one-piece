'use strict';

// The R31~R40 checkpoint has one dueRound (40), but pace is not allowed to
// treat every decision in that window as if it were already R40.  This
// fixture deliberately crosses the 0.08 reorder margin between R31 and R39.

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_core.js','ord_v15_model.js','ord_v15_policy.js'])require(path.join(EXT,file));

const P=global.ORDV15Policy;
const requirement=(key,current,target)=>({
  key,
  label:key,
  current,
  target,
  gap:Math.max(0,target-current),
  required:true,
  status:current>=target?'ok':'bad'
});
const role={deficits:{requirements:[
  requirement('main',1,1),
  requirement('armor',50,100),
  requirement('stunBase',.5,1),
  requirement('slow',31,100),
  requirement('bossFrenzy',.31,1),
  requirement('stunFull',1.5,1.5)
]}};
const checkpoint={key:'build40',dueRound:40};
const groupIndex=(groups,key)=>groups.findIndex(group=>group.keys.includes(key));

const at31=P._test.groupRows(P.ROUTES.physical,role,checkpoint,31);
const at39=P._test.groupRows(P.ROUTES.physical,role,checkpoint,39);
const armor31=groupIndex(at31,'armor'),slow31=groupIndex(at31,'slow');
const armor39=groupIndex(at39,'armor'),slow39=groupIndex(at39,'slow');

assert(armor31>=0&&slow31>=0&&armor39>=0&&slow39>=0,'fixture groups are missing');
assert(
  slow31<armor31,
  `R31 should fund the less-progressed slow group first: ${at31.map(group=>group.keys.join('+')).join(' > ')}`
);
assert(
  armor39<slow39,
  `R39 should restore the nearer armor deadline first: ${at39.map(group=>group.keys.join('+')).join(' > ')}`
);
assert.notDeepStrictEqual(
  at31.map(group=>group.keys),
  at39.map(group=>group.keys),
  'R31 and R39 collapsed to checkpoint.dueRound=40'
);

console.log('V17_23_POLICY_ACTUAL_ROUND 3/3 passed');
