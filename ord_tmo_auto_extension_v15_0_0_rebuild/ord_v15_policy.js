(function(root,factory){
'use strict';
const api=factory(root&&root.ORDCore,root&&root.ORDV15Model);
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.ORDV15Policy=api;
})(typeof window!=='undefined'?window:globalThis,function(C,M){
'use strict';

const VERSION='18.2.0';
const ROUTES=Object.freeze({
  physical:Object.freeze({key:'physical',mode:'physical',label:'물딜 1상위',groups:[['main'],['armor','stunBase'],['slow','bossFrenzy'],['stunFull']],priority:'상위 → 상시 방깎·최소 0.5스턴 → 이감·광보잡 → 1.5스턴'}),
  dual:Object.freeze({key:'dual',mode:'magic',label:'마딜 2상위·토키',groups:[['main','stunBase'],['slow'],['stunFull'],['bossFrenzy','toki']],priority:'상위 2기·최소 0.5스턴 → 이감 → 1.5스턴 → 광보잡·토키'}),
  singleEnd:Object.freeze({key:'singleEnd',mode:'magic',label:'마딜 1상위·단끝',groups:[['main'],['bossFrenzy','stunBase'],['slow'],['stunFull'],['singleEndExpected','single','end']],priority:'상위 → 광보잡·최소 0.5스턴 → 이감 → 1.5스턴 → 안정 단·끝'})
});

function num(value){return C&&C.num?C.num(value):(Number(value)||0);}
function round(value,digits=3){const p=Math.pow(10,digits);return Math.round(num(value)*p)/p;}
function clamp(value,low,high){return Math.max(low,Math.min(high,num(value)));}
function resolveRoute(intent,settings){const mode=intent&&intent.damageMode||settings&&settings.mode;if(mode==='physical')return ROUTES.physical;if(mode!=='magic')return null;const requested=intent&&intent.magicRoute||settings&&settings.magicRoute;if(requested==='dual')return ROUTES.dual;if(requested==='singleEnd')return ROUTES.singleEnd;return null;}
function checkpointFor(roundNow){
  const round=Math.max(1,Math.round(num(roundNow)||1));
  if(round<=7)return{key:'rare7',label:'첫 희귀 마감',dueRound:7,rareMinimum:1,equivalent:0,upper:0,nonUpper:0,rareMaximum:Infinity,activeGroups:0};
  if(round<=20)return{key:'first-final20',label:'첫 전설·히든 마감',dueRound:20,rareMinimum:0,equivalent:1,upper:0,nonUpper:1,rareMaximum:Infinity,activeGroups:0};
  if(round<=30)return{key:'line30',label:'상위+전설 라인 유지',dueRound:30,rareMinimum:0,equivalent:4,upper:1,nonUpper:1,rareMaximum:6,activeGroups:0};
  if(round<=40)return{key:'build40',label:'중간 전력 마감',dueRound:40,rareMinimum:0,equivalent:6,upper:1,nonUpper:1,rareMaximum:3,activeGroups:2};
  if(round<=45)return{key:'build45',label:'50라 전 구조 마감',dueRound:45,rareMinimum:0,equivalent:8,upper:1,nonUpper:1,rareMaximum:1,activeGroups:3};
  if(round<=50)return{key:'boss50',label:'50라 보스 구조 마감',dueRound:50,rareMinimum:0,equivalent:9,upper:1,nonUpper:1,rareMaximum:0,activeGroups:99};
  // v16: 51~65 is no longer one flat 15-round window.  The recorded loss sat
  // in an urgency-free late65 for 12 rounds; intermediate deadlines restore a
  // gradient for coverage quotes and for the UI countdown.
  if(round<=55)return{key:'late55',label:'55라 생존 보강 마감',dueRound:55,rareMinimum:0,equivalent:9,upper:1,nonUpper:1,rareMaximum:0,activeGroups:99};
  if(round<=60)return{key:'late60',label:'60라 생존 보강 마감',dueRound:60,rareMinimum:0,equivalent:9,upper:1,nonUpper:1,rareMaximum:0,activeGroups:99};
  return{key:'late65',label:'65라 최종 마감',dueRound:65,rareMinimum:0,equivalent:9,upper:1,nonUpper:1,rareMaximum:0,activeGroups:99};
}
function requirementMap(role){return new Map((role&&role.deficits&&role.deficits.requirements||[]).map(row=>[row.key,row]));}
function fallbackRequirement(key){const labels={main:'상위 딜러',armor:'상시 풀방깎',stunBase:'최소 0.5스턴',slow:'안전 이감',bossFrenzy:'광보잡',stunFull:'충분한 1.5스턴',toki:'토키',singleEndExpected:'검증된 단일·끝딜'};return{key,label:labels[key]||key,current:0,target:1,gap:1,required:true,status:'bad'};}
// v17.22: 필수 역할 그룹이 순수 사전식이면 앞 그룹이 완전히 닫힐 때까지
// 뒤 그룹은 자원을 한 톨도 못 받는다.  물딜의 상시 방깎 180~190은 역할표
// 전체에서 가장 큰 수치라 판이 끝날 때까지 안 닫히는 일이 흔하고, 그
// 동안 이감은 0에 방치된다 — 0725 로그에서 이감이 55라 내내 10/102로
// 고정된 원인이고, 45라까지 이감 유닛이 "다음 행동"으로 한 번도 제시되지
// 않은 이유다.  더 나쁜 건 이감을 늦출수록 비싸진다는 점이다: 같은 패
// 재생에서 30라엔 선위 4개로 이감 110을 만들 수 있었는데 45라엔 16개를
// 써도 95에서 멈췄다(방깎 전설이 같은 하위 재료를 먼저 먹는다).
//
// 그래서 정적 순서 대신 "마감 대비 얼마나 뒤처졌는가"로 정렬한다.
// 그룹마다 체크포인트 마감이 있고(방깎·0.5스턴 40라, 이감·광보잡 45라,
// 1.5스턴·보스화력 50라), 지금 라운드에서 요구되는 진척과 실제 진척의
// 차이가 큰 쪽이 먼저 온다.  이러면 한 그룹이 자원을 독점하지 않고
// 번갈아 진행된다.  하드 게이트(무엇이 필수인가)는 건드리지 않는다 —
// 순서만 바꾼다.
const ROLE_DEADLINE_ROUND=Object.freeze({main:30,armor:40,stunBase:40,slow:45,bossFrenzy:45,stunFull:50,toki:50,single:50,end:50,singleEndExpected:50,singleEndStable:50});
// v18: 생존 축 마감.  실측 근거는 6판 재생이다 — 첫 클리어는 생존 축을
// r49에 닫았고, 두 축을 모두 닫고도 진 0724는 r56에 닫았다.  나머지 진
// 판 4개는 끝까지 못 닫았다.  보스 구간 진입선인 50라를 마감으로 쓴다.
const SURVIVAL_DEADLINE_ROUND=50;
const PACE_START_ROUND=10;
const PACE_SWAP_MARGIN=.08;
function groupDeadline(rows){
  let due=50;
  for(const row of rows||[]){const value=ROLE_DEADLINE_ROUND[row&&row.key];if(value!=null)due=Math.min(due,value);}
  return due;
}
// 그룹 진척은 최악 행이 아니라 행 평균으로 본다.  최악 행만 보면 미충족
// 이진 역할(광보잡 0/1) 하나가 그룹 전체를 0으로 만들어, 서로 다른 두
// 그룹이 똑같이 "진척 0"으로 보이고 정렬이 정적 순서로 되돌아간다.
function groupPaceBehind(rows,roundNow){
  const active=(rows||[]).filter(row=>row&&row.required!==false&&!row.waived);
  if(!active.length)return -1;
  const debt=active.reduce((total,row)=>total+clamp(Math.max(0,num(row.gap))/Math.max(.01,num(row.target)),0,1),0);
  const progress=1-debt/active.length;
  const due=groupDeadline(active),span=Math.max(1,due-PACE_START_ROUND);
  const pace=clamp((num(roundNow)-PACE_START_ROUND)/span,0,1);
  return round(pace-progress,6);
}
function groupRows(route,role,checkpoint,roundInput){
  const map=requirementMap(role),covered=new Set(route.groups.flat());
  const groups=route.groups.map(keys=>keys.map(key=>map.get(key)||fallbackRequirement(key)));
  // v16: main-upper strategic requirements (e.g. Dragon's 단일 2 / 끝딜 1) come
  // from the core deficit table with route-agnostic keys.  They were invisible
  // to structuralPass and to the action search because the static route groups
  // never referenced them — the recorded '단일 1/2' deficit could not be acted
  // on.  Append every uncovered required row as a trailing group.
  const extras=[...map.values()].filter(row=>row&&row.required!==false&&!covered.has(row.key));
  if(extras.length)groups.push(extras);
  // v16.4: two straight losses died at round 60 with 이감 starved while an
  // almost-closed armor group kept outranking it in the static order.  When a
  // non-main group is nearly done (worst relative gap <=10%) it sinks below
  // any group still wide open (>=30%), so the search funds the real deadline.
  const relativeGap=rows=>Math.max(0,...rows.map(row=>row.waived?0:Math.max(0,num(row.gap))/Math.max(.01,num(row.target))));
  // v16.8: a round-50 boss death shipped with 광보잡 0/1 open for the whole
  // game while a 0~1-wisp closer existed — armor's partial progress always
  // outranked it in the static order.  From the round-40 build window on, a
  // completely untouched one-unit required role (target<=1, current 0 —
  // 광보잡·보잡·암브·보조딜·토키) may not sit behind partial numeric pools.
  const binaryOpen=rows=>rows.some(row=>row.required!==false&&!row.waived&&num(row.target)>0&&num(row.target)<=1&&num(row.current)<=0&&num(row.gap)>0);
  const currentRound=Math.max(1,num(roundInput)||num(checkpoint&&checkpoint.dueRound)||1),bossPhase=currentRound>=40;
  // v17.4: two straight round-55 boss deaths (도플라밍고) shipped with the
  // boss-power pool (단일·끝딜 환산 1/3 → 2.5/3, 1.5스턴 0.4) still open while
  // wisps kept funding partial survival fragments (이감 7%, 스턴 조각).  The
  // extras group holding singleEndExpected sits last in static order, so from
  // the round-50 boss window on, groups with an open boss-power role float
  // above the rest — but only while no survival group is in crisis: if any
  // non-boss group is still wide open (relative gap >30% — e.g. the r50
  // replay's 이감 25/102) the float stays off for the whole state, because
  // lines kill you before the boss does.  The gate is state-level, not
  // pairwise, so the ordering stays a coherent total order inside the search.
  const BOSS_POWER_KEYS=new Set(['single','end','singleEndExpected','attack','toki','stunFull']);
  const bossPowerOpen=rows=>rows.some(row=>row.required!==false&&!row.waived&&BOSS_POWER_KEYS.has(row.key)&&num(row.gap)>0);
  const bossWindow=currentRound>=50;
  const head=groups.slice(0,1),tail=groups.slice(1).map((rows,offset)=>({rows,offset,rel:relativeGap(rows),binary:binaryOpen(rows),bossPowerRows:bossPowerOpen(rows),behind:groupPaceBehind(rows,currentRound)}));
  const survivalCrisis=tail.some(item=>!item.bossPowerRows&&item.rel>.3);
  for(const item of tail)item.bossPower=bossWindow&&!survivalCrisis&&item.bossPowerRows;
  tail.sort((a,b)=>{
    if(bossPhase&&a.binary!==b.binary)return a.binary?-1:1;
    if(a.bossPower!==b.bossPower)return a.bossPower?-1:1;
    const aNearlyDone=a.rel<=.1,bNearlyDone=b.rel<=.1;
    if(aNearlyDone!==bNearlyDone&&Math.max(a.rel,b.rel)>=.3)return aNearlyDone?1:-1;
    // 마감 대비 뒤처짐이 뚜렷하게 다를 때만 정적 순서를 뒤집는다 —
    // 미세한 차이로 매 라운드 순서가 흔들리면 추천이 요동친다.
    if(Math.abs(a.behind-b.behind)>PACE_SWAP_MARGIN)return b.behind-a.behind;
    return a.offset-b.offset;
  });
  const ordered=head.concat(tail.map(item=>item.rows));
  return ordered.map((rows,index)=>{const keys=rows.map(row=>row.key),missed=rows.filter(row=>num(row.gap)>1e-9&&!row.waived),debt=rows.reduce((total,row)=>total+(row.waived?0:Math.max(0,num(row.gap))/Math.max(.01,num(row.target))),0);return{index,keys,rows,missed:missed.length,debt:round(debt,6),pass:missed.length===0,label:rows.map(row=>row.label).join(' · ')};});
}
function groupVector(groups,count){const limit=Math.min(groups.length,Math.max(0,num(count)));const vector=[];for(const group of groups.slice(0,limit))vector.push(group.missed,group.debt);return vector;}
function rareCount(model,counts){let total=0;for(const unit of model.knowledge.db.rares)total+=Math.max(0,num(counts[unit.id]));return total;}
function evaluate(model,counts,routeInput,options){
  const roundNow=options&&options.round||model.round.value,route=typeof routeInput==='string'?ROUTES[routeInput]:routeInput,checkpoint=checkpointFor(roundNow),stock=counts||model.effective.counts,summary=M.finalSummary(model,stock),rare=rareCount(model,stock),mode=route&&route.mode||model.intent.damageMode;
  if(!route)return{version:VERSION,status:'unknown',label:'경로 선택 필요',route:null,checkpoint,actual:summary,rareRemaining:rare,requirements:[],groups:[],activeGroups:[],checkpointVector:[1],fullVector:[1],blockers:['물딜 또는 마딜 세부 경로를 먼저 선택해야 합니다.'],unknowns:['보스 DPS','라인 처리력'],evidence:{kind:'observed-plus-exact-ledger',combat:'unmeasured'}};
  // v16: requirement currents use the live owned board (Rare/Special direct
  // combat roles included), matching the documented survival role table.
  // Durability is enforced by the regression guards instead: any craft that
  // consumes a combat Rare visibly reopens the gap it was covering.
  const role=M.roleState(model,stock,mode,Object.assign({},model.settings,{magicRoute:route.key,_resolvedMagicRoute:route.key}),options&&options.locks||[],false),groups=groupRows(route,role,checkpoint,roundNow),activeCount=Math.min(groups.length,checkpoint.activeGroups),active=groups.slice(0,activeCount),structureRows=[
    // v16.9: 4/6/9 환산은 공개 검증된 보스킬 최소치가 아니라 경제 진행
    // 경고선이다(사용자 검증 지침).  라벨로 이 성격을 드러낸다.
    {key:'equivalent',label:'전설 환산(경제선)',current:summary.legendEquivalent,target:checkpoint.equivalent,gap:Math.max(0,checkpoint.equivalent-summary.legendEquivalent)},
    {key:'upperCount',label:'상위',current:summary.upperCount,target:checkpoint.upper,gap:Math.max(0,checkpoint.upper-summary.upperCount)},
    {key:'nonUpperFinal',label:'비상위 전설급',current:summary.nonUpperFinalCount,target:checkpoint.nonUpper,gap:Math.max(0,checkpoint.nonUpper-summary.nonUpperFinalCount)}
  ],rareMinimumGap=Math.max(0,num(checkpoint.rareMinimum)-rare),rareExcess=Number.isFinite(checkpoint.rareMaximum)?Math.max(0,rare-num(checkpoint.rareMaximum)):0,structureMisses=structureRows.filter(row=>row.gap>0).length+(rareMinimumGap>0?1:0),activeMisses=active.reduce((total,group)=>total+group.missed,0),checkpointVector=[structureMisses,round(structureRows[0].gap),round(structureRows[1].gap),round(structureRows[2].gap),rareMinimumGap].concat(groupVector(groups,activeCount),[rareExcess]),fullVector=groupVector(groups,groups.length),blockers=structureRows.filter(row=>row.gap>0).map(row=>`${row.label} +${round(row.gap)}`).concat(rareMinimumGap>0?[`희귀 +${rareMinimumGap}`]:[],active.flatMap(group=>group.rows.filter(row=>num(row.gap)>0&&!row.waived).map(row=>`${row.label} +${round(row.gap)}`)),rareExcess>0?[`미사용 희귀 ${rareExcess}장`]:[]),structuralPass=structureMisses===0&&rareMinimumGap<=0&&activeMisses===0&&rareExcess<=0;
  // v18: 하나의 'unsafe'를 축으로 쪼갠다.  실전 6판 재생 결과 생존 축이
  // 뚫린 판은 예외 없이 졌고(5판 중 4판은 끝까지 못 닫았다), 첫 클리어는
  // 화력 축을 미달인 채로 이겼다.  두 상황을 같은 단어로 부르면 사용자가
  // "지금 죽는 문제인지 미는 문제인지"를 구분할 수 없다.
  const axes=(role&&role.deficits&&role.deficits.axes)||{},survivalPass=!!(axes.survival&&axes.survival.applicable&&axes.survival.pass);
  const economyShort=summary.legendEquivalent<checkpoint.equivalent||summary.upperCount<checkpoint.upper||summary.nonUpperFinalCount<checkpoint.nonUpper;
  let status,label;
  if(structuralPass){status='structural';label='구조 조건 충족 · 화력 미검증';}
  // 생존이 뚫려 있으면 경제선보다 그 말을 먼저 한다.  equivalent 4/6/9는
  // 코드 주석이 스스로 '경제 진행 경고선'이라 선언한 값이고, 이감 10/102는
  // 그 라운드에 죽는 사유다.  급한 쪽이 앞에 와야 한다.
  else if(!survivalPass){status='survival-open';label='생존 구조 미달 · 이대로면 라인이 뚫린다';}
  else if(economyShort){status='developing';label='완성 전력 마감 미달';}
  else{status='firepower-open';label='생존 구조 완성 · 화력 미달';}
  // 생존 축을 언제 닫았는지가 실제 승패와 붙어 있다.  기록상 클리어한
  // 판은 r49에 닫았고, 두 축을 모두 닫고도 진 0724는 r56에 닫았다.
  //
  // 다만 판정은 라운드마다 독립이라 "언제 닫혔는지"는 알 수 없다.  50라를
  // 넘긴 시점에 닫혀 있다고 해서 늦게 닫혔다고 말하면 엔진이 모르는 걸
  // 주장하는 것이다.  확실히 말할 수 있는 것만 말한다: 마감 전에 닫혀
  // 있는가, 마감을 넘겼는데 아직 열려 있는가.
  const survivalPace=survivalPass
    ?(roundNow<=SURVIVAL_DEADLINE_ROUND
      ?{state:'on-time',note:`생존 구조 마감 · 기록상 클리어한 판도 ${SURVIVAL_DEADLINE_ROUND}라 전(49라)에 닫았습니다`}
      :{state:'held',note:'생존 구조 유지 중'})
    :(roundNow>SURVIVAL_DEADLINE_ROUND
      ?{state:'overdue',note:`생존 구조가 ${SURVIVAL_DEADLINE_ROUND}라 마감을 넘겨 열려 있습니다 · 기록상 진 판 4개가 여기서 못 닫았습니다`}
      :{state:'open',note:`생존 구조는 ${SURVIVAL_DEADLINE_ROUND}라 전에 닫아야 합니다`});
  const unknowns=['50~65라 실제 보스 DPS','라인 처리 속도'];if(route.key==='singleEnd')unknowns.push('단일·끝딜 컨트롤 수행');
  const requirements=groups.flatMap(group=>group.rows.map(row=>Object.assign({},row,{group:group.index,priority:group.index+1,active:group.index<activeCount})));
  return{version:VERSION,status,label,route,checkpoint,actual:summary,rareRemaining:rare,rareExcess,role,requirements,groups,activeGroups:active,structureRows,structureMisses,activeMisses,checkpointVector,fullVector,structuralPass,axes,survivalPass,survivalPace,survivalDeadline:SURVIVAL_DEADLINE_ROUND,blockers,unknowns,evidence:{kind:'observed-plus-exact-ledger',inventory:'current-stock-only',roles:'live-owned-with-regression-guards',combat:'unmeasured',triggerPolicy:'core-safe-envelope',axisBasis:'replay-of-six-recorded-runs'}};
}
function compareVector(left,right){const length=Math.max((left||[]).length,(right||[]).length);for(let index=0;index<length;index++){const a=num(left&&left[index]),b=num(right&&right[index]);if(Math.abs(a-b)>1e-9)return a-b;}return 0;}
function improved(before,after){return compareVector(after&&after.checkpointVector,before&&before.checkpointVector)<0||compareVector(after&&after.fullVector,before&&before.fullVector)<0;}

return{VERSION,ROUTES,SURVIVAL_DEADLINE_ROUND,resolveRoute,checkpointFor,evaluate,compareVector,improved,_test:{groupRows,groupVector,rareCount,requirementMap,fallbackRequirement,groupPaceBehind,groupDeadline,ROLE_DEADLINE_ROUND}};
});
