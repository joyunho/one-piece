(function(root,factory){
'use strict';
const api=factory(root&&root.ORDCore);
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.ORDSquadPlanner=api;
})(typeof window!=='undefined'?window:globalThis,function(C){
'use strict';

const VERSION='19.12.1';
const DEFAULTS={beamWidth:8,branchWidth:5,branchScan:8,candidateCap:44,maxDepth:14};
// v19.9.8: 스턴풀 구제 탐색 모드 — searchRoute 가 1차 미완성일 때만 켠다.
// 켜진 동안 requirementPriorityVector 가 스턴풀을 생존 그룹에 합쳐 본다.
let SEARCH_STUN_EARLY=false;
const ROUTE_LABELS={physical:'물딜',dual:'마딜 2상위+토키',singleEnd:'마딜 1상위+단끝'};
const STUN_OVERSUPPLY_PENALTY=420;
const SLOW_OVERSUPPLY_PENALTY=4;
const SIDE_STUN_PENALTY=100;
const SIDE_SLOW_PENALTY=.9;
// v17.17(사용자 요청): "클리어에 더 도움되는" 파티 — 유계 타이브레이크.
// v18.1: clearAffinity = 기준 상위와의 동반 조건부 확률 P(보조|상위) log 스케일
// (상한 0.8). 동반 기록이 없는 보조는 전체 픽률로 그 아래에서만 줄 세운다.
// 사전식 비교의 최말단(기존 id 사전순 자리)에서만 쓰여, 필수 요구·비용·패
// 소모가 같은 후보끼리의 순서만 바꾼다. 게이트·필터·점수 가산에는 절대
// 쓰지 않으며(usage.gate=false), 다이제스트가 없으면 0으로 조용히 무해하다.
const META_STATS=(typeof window!=='undefined'&&window.ORD_META_STATS)||(typeof globalThis!=='undefined'&&globalThis.ORD_META_STATS)||null;
// v18.1: 판수가 아니라 픽률(0~1)을 돌려준다 — 표본이 8배가 돼도 값이 같아야 한다.
// 구버전 다이제스트(rate 없음)는 판수/총판수로 환산해 물러난다.
function metaGamesOf(unit){
  if(!META_STATS||!META_STATS.usage||META_STATS.usage.softTiebreak!==true)return 0;
  const byCode=META_STATS.byCode||{},total=Math.max(1,num(META_STATS.gameCount));let best=0;
  for(const code of unit&&unit.codes||[]){
    const entry=byCode[String(code).toLowerCase()];if(!entry)continue;
    const rate=entry.rate!=null?num(entry.rate):num(entry.games)/total;
    if(rate>best)best=rate;
  }
  return best;
}
// v17.18(사용자 교정): 최종 파티에서 스토리 랭크는 중요치 않다 — 스토리
// 성분을 제거하고, 기준 상위와의 실측 동반(upperPairs: 그 상위와 함께
// 클리어한 판 수)을 주성분(상한 0.8), 전체 실측 픽을 보조(상한 0.2)로
// 쓴다. 상위 유닛 자신은 동반 목록에 없으므로 자동으로 개별 평가(전체
// 실측 픽)만 받는다. 컨텍스트(기준 상위)는 planFinalSquad 진입 시마다
// 재설정되며, 없으면 동반 성분 0으로 무해하다.
let AFFINITY_CONTEXT=null;
let AFFINITY_MEMO=new Map();
let CURATED_SUPPORT_CONTEXT=null;
function resolveSupportMemo(input){
  if(input&&Object.prototype.hasOwnProperty.call(input,'synergyMemo'))return input.synergyMemo;
  if(input&&Object.prototype.hasOwnProperty.call(input,'upperMemo'))return input.upperMemo;
  return(typeof window!=='undefined'&&window.ORD_SYNERGY_MEMO)||(typeof globalThis!=='undefined'&&globalThis.ORD_SYNERGY_MEMO)||null;
}
function supportRankAffinity(rank){
  rank=num(rank);if(rank<=0||rank>=999)return 0;
  return 1/rank;
}
function setAffinityContext(upperUnits,supportMemo){
  AFFINITY_MEMO=new Map();
  AFFINITY_CONTEXT=null;
  const pairGames=new Map();
  if(META_STATS&&META_STATS.usage&&META_STATS.usage.softTiebreak===true){
    for(const upper of upperUnits||[]){
      for(const code of upper&&upper.codes||[]){
        const list=(META_STATS.upperPairs||{})[String(code).toLowerCase()]||[];
        // v18.1: 3번째 원소가 조건부 확률 P(보조|상위). 원시 판수(2번째)는 표본
        // 크기에 딸려 다녀서, 표본이 커지면 코드 변경 없이 가중치가 올라갔다.
        // 구버전 다이제스트(2원소)는 판수/상위판수로 환산해 물러난다.
        const upperN=num((META_STATS.upperGames||{})[String(code).toLowerCase()])
          ||num(((META_STATS.byCode||{})[String(code).toLowerCase()]||{}).games);
        for(const entry of list){
          const key=String(entry[0]).toLowerCase();
          const cond=entry.length>2?num(entry[2]):(upperN>0?num(entry[1])/upperN:0);
          if(cond>num(pairGames.get(key)))pairGames.set(key,cond);
        }
      }
    }
  }
  if(pairGames.size)AFFINITY_CONTEXT={pairGames};
  const byUnitId=new Map(),memo=supportMemo||null;
  if(memo&&C&&typeof C.upperMemoFor==='function'){
    for(const upper of upperUnits||[]){
      const entry=C.upperMemoFor(upper,memo);if(!entry)continue;
      for(const support of entry.supports||[])for(const id of support.unitIds||[]){const rank=Math.max(1,num(support.rank)||999),prior=byUnitId.get(String(id));if(!prior||rank<prior.rank)byUnitId.set(String(id),{rank,name:String(support.name||''),reason:String(support.reason||support.reinforce||''),upperId:String(upper.id||'')});}
    }
  }
  CURATED_SUPPORT_CONTEXT=byUnitId.size?{byUnitId}:null;
}
function pairGamesOf(unit){
  if(!AFFINITY_CONTEXT)return 0;
  let best=0;
  for(const code of unit&&unit.codes||[]){const games=num(AFFINITY_CONTEXT.pairGames.get(String(code).toLowerCase()));if(games>best)best=games;}
  return best;
}
// v18.1: 동반 성분을 조건부 확률로 바꾸고, 전체 픽 성분을 "더하는" 대신
// "동반 기록이 없는 보조끼리만 줄 세우는" 대체값으로 내렸다.
//
// 근거는 실측이다 — tools/tmo_backtest.js 로 6월 학습 → 7월 평가(top-8 recall,
// 전설급 보조):  인기순 24.86% < 기존 pair+pick 43.62% < 이 배치 44.70%.
// 픽을 더하면 동반 신호가 있는 보조들의 순위를 흔들어 0.66p를 깎아먹었다.
// 상한 0.8/0.2와 log 스케일은 그대로다 — clearAffinity 는 비교뿐 아니라
// storyProxy 합산에도 들어가므로 출력 범위가 바뀌면 다른 성분과의 균형이 흔들린다.
// REF_PAIR 은 조건부(0~1)를 기존 수치대로 되돌리는 환산 상수일 뿐, 순위에는
// 영향이 없다(log 는 단조).
const REF_PAIR=1300;
const PAIR_FLOOR=Math.min(.8,.16*Math.log10(1+REF_PAIR/20000));
function clearAffinity(unit){
  if(!unit||typeof unit!=='object')return 0;
  const memoKey=String(unit.id||'');
  if(memoKey&&AFFINITY_MEMO.has(memoKey))return AFFINITY_MEMO.get(memoKey);
  const cond=pairGamesOf(unit);
  const value=cond>0
    ?Math.round(Math.min(.8,.16*Math.log10(1+cond*REF_PAIR))*10000)/10000
    :Math.round(Math.min(PAIR_FLOOR,.2*metaGamesOf(unit)*PAIR_FLOOR)*10000)/10000;
  if(memoKey)AFFINITY_MEMO.set(memoKey,value);
  return value;
}
function compareAffinity(a,b){const av=clearAffinity(a),bv=clearAffinity(b);return av===bv?0:bv-av;}
function curatedSupportEvidence(unit){
  const row=unit&&CURATED_SUPPORT_CONTEXT&&CURATED_SUPPORT_CONTEXT.byUnitId.get(String(unit.id||''));
  return row?Object.assign({affinity:supportRankAffinity(row.rank)},row):{rank:999,name:'',reason:'',upperId:'',affinity:0};
}
function compareCuratedSupport(a,b){const av=curatedSupportEvidence(a),bv=curatedSupportEvidence(b);if(av.affinity!==bv.affinity)return bv.affinity-av.affinity;if(av.rank!==bv.rank)return av.rank-bv.rank;return 0;}
function curatedLineupEvidence(lineup){
  const seen=new Set(),hits=[];
  for(const item of lineup||[]){const unit=item&&item.unit||item,id=String(unit&&unit.id||item&&item.id||'');if(!unit||!id||seen.has(id)||C.isUpper(unit))continue;seen.add(id);const evidence=curatedSupportEvidence(unit);if(evidence.affinity>0)hits.push({id,name:displayNameOf(unit),rank:evidence.rank,upperId:evidence.upperId,reason:evidence.reason,affinity:evidence.affinity});}
  hits.sort((a,b)=>b.affinity-a.affinity||a.rank-b.rank||compareText(a.id,b.id));const core=hits.slice(0,3);
  return{score:round(core.reduce((total,row)=>total+num(row.affinity),0),6),matches:core};
}
const OVERLAP_HEURISTIC_WEIGHT=.08;
const RECIPE_PROFILE_CACHE=new WeakMap();
const PAIR_OVERLAP_CACHE=new WeakMap();
const HAND_TIER_UNIT_CACHE=new WeakMap();
const HAND_INVENTORY_CACHE=new WeakMap();
const UPPER_RANK_RESULT_CACHE=new WeakMap();
const HAND_TIERS=['rare','special','uncommon','common'];
const HAND_FIT_WEIGHTS={
  rare:{spent:15,usedType:10,clearedType:24,utilization:10},
  special:{spent:5,usedType:7,clearedType:16,utilization:8},
  uncommon:{spent:2,usedType:5,clearedType:10,utilization:6},
  common:{spent:.45,usedType:1.5,clearedType:3,utilization:3}
};

function num(v){return C&&C.num?C.num(v):(Number(v)||0);}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function round(v,n=2){const p=Math.pow(10,n);return Math.round(num(v)*p)/p;}
function clone(x){return Object.assign({},x||{});}
function sum(map){return Object.values(map||{}).reduce((a,b)=>a+num(b),0);}
function hasAny(map){return Object.values(map||{}).some(v=>num(v)>0);}
function nameOf(u){return C&&C.nameOf?C.nameOf(u):String(u&&u.name||u&&u.id||'');}
function displayNameOf(u){return C&&C.displayNameOf?C.displayNameOf(u):nameOf(u);}
function groupOf(u){return C&&C.groupName?C.groupName(u):String(u&&u.groupName||'');}
function unitFamily(u){return C&&C.familyOf?C.familyOf(u):/마딜/.test(groupOf(u))?'magic':/물딜/.test(groupOf(u))?'physical':'neutral';}
function compareText(a,b){return String(a||'').localeCompare(String(b||''),'ko');}
function stableId(u){return String(u&&u.id||'');}
function tierOf(u){return C&&C.tierKey?C.tierKey(u):'other';}
function isFinalUnit(u){return !!u&&((C&&C.isLegendish&&C.isLegendish(u))||(C&&C.isUpper&&C.isUpper(u)));}
function isToki(u){return /(?:^|\s)토키(?:\s|$|\()/.test(nameOf(u));}
function isNikaOrGarpException(u){return /니카.*영원|거프.*불멸/.test(nameOf(u));}
function canonicalUpper(u){return C&&C.canonicalUpperId?C.canonicalUpperId(u&&u.id):stableId(u);}
function lineupKey(u){return C&&C.isUpper&&C.isUpper(u)?`upper:${canonicalUpper(u)}`:`unit:${stableId(u)}`;}
function upperRankFingerprint(state,settings,policy,candidateIds,supportMemo){
  const counts=Object.entries(state&&state.counts||{}).filter(([,value])=>num(value)!==0).sort((a,b)=>compareText(a[0],b[0])).map(([id,value])=>`${id}:${round(value,3)}`).join(','),percent=(candidateIds||[]).map(id=>`${id}:${round(state&&state.percent&&state.percent[id],2)}`).join(','),avoid=[...(policy&&policy.avoid||[])].sort(compareText).join(','),memoVersion=String(supportMemo&&supportMemo.version||''),
    // v19: 두 번째 상위 확정·관성은 순위를 바꾸므로 캐시 키에 들어가야 한다.
    upperCommitment=[String(settings.secondUpperId||''),[].concat(settings.stickyUpperIds||[]).map(String).sort(compareText).join('+')].join('/'),
    // v19.4.0(감사 확정 결함): 연구소 체크·공업 레벨·TMO 원문 능력치도
    // currentSpec 을 거쳐 순위 payload(currentStage·timelineReadiness)에
    // 들어간다 — 키에 없으면 토글 후에도 이전 캐시 항목이 돌아온다
    // (0728c r30 실측: 연구소 토글에도 반환 배열 참조 동일).
    research=[JSON.stringify(settings.labResearch||null),String(settings.upperResearchLevel||'')].join('/'),
    abilities=Object.entries(state&&state.currentAbilities||{}).sort((a,b)=>compareText(a[0],b[0])).map(([key,value])=>`${key}:${round(num(value),3)}`).join(',');
  return[settings.mode,settings.magicRoute,settings.targetSquadCount,settings.currentRound,settings.gorosei,settings.superKumaOwned?1:0,settings.changedUsed,settings.seraphUsed,settings.transcendUsed,upperCommitment,research,abilities,(candidateIds||[]).join(','),percent,avoid,memoVersion,counts].join('|');
}

// Structural recipe demand is independent of the current hand. Using only a
// solve's `rareUse` hides overlap after the first candidate consumes the stock,
// so every final unit receives a cached transitive material profile instead.
function recipeProfile(state,u){
  if(!state||!state.db||!u)return{finalAncestors:new Set(),warpedNodes:new Set(),rare:{},special:{},uncommon:{},common:{}};let byId=RECIPE_PROFILE_CACHE.get(state.db);if(!byId){byId=new Map();RECIPE_PROFILE_CACHE.set(state.db,byId);}if(byId.has(u.id))return byId.get(u.id);
  const profile={finalAncestors:new Set(),warpedNodes:new Set(),rare:{},special:{},uncommon:{},common:{}},add=(map,id,value)=>{map[id]=num(map[id])+num(value);},rootId=u.id;
  function walk(id,multiplier,path){const unit=state.db.byId.get(id);if(!unit||path.has(id))return;const next=new Set(path);next.add(id);if(id!==rootId){if(isFinalUnit(unit))profile.finalAncestors.add(id);if(C.isWarped&&C.isWarped(unit))profile.warpedNodes.add(id);const tier=tierOf(unit);if(profile[tier])add(profile[tier],id,multiplier);}for(const stuff of unit.stuffs||[])walk(stuff.id,multiplier*num(stuff.count),next);}
  if(C.isWarped&&C.isWarped(u))profile.warpedNodes.add(u.id);walk(u.id,1,new Set());byId.set(u.id,profile);return profile;
}
function mapOverlap(a,b){let total=0;for(const id of new Set(Object.keys(a||{}).concat(Object.keys(b||{}))))total+=Math.min(num(a&&a[id]),num(b&&b[id]));return total;}
function mapTotal(map){return Object.values(map||{}).reduce((sum,value)=>sum+num(value),0);}
function pairMaterialOverlap(state,a,b){
  if(!state||!state.db||!a||!b)return{lineage:false,rare:0,special:0,uncommon:0,common:0,rareRatio:0,denseRare:false,penalty:0};
  let byPair=PAIR_OVERLAP_CACHE.get(state.db);if(!byPair){byPair=new Map();PAIR_OVERLAP_CACHE.set(state.db,byPair);}const ids=[stableId(a),stableId(b)].sort(),key=`${ids[0]}|${ids[1]}`;if(byPair.has(key))return byPair.get(key);
  const left=recipeProfile(state,a),right=recipeProfile(state,b),rare=mapOverlap(left.rare,right.rare),special=mapOverlap(left.special,right.special),uncommon=mapOverlap(left.uncommon,right.uncommon),common=mapOverlap(left.common,right.common),lineage=left.finalAncestors.has(b.id)||right.finalAncestors.has(a.id),rareBase=Math.max(1,Math.min(mapTotal(left.rare),mapTotal(right.rare))),rareRatio=rare/rareBase,denseRare=rare>=2&&rareRatio>=.75,penalty=round(rare*55+special*9+uncommon*3+common*.18+(denseRare?120:0),3),result={lineage,rare,special,uncommon,common,rareRatio:round(rareRatio,3),denseRare,penalty};byPair.set(key,result);return result;
}
function lineupMaterialOverlap(state,lineup){let penalty=0,lineagePairs=0,densePairs=0;const pairs=[];for(let i=0;i<(lineup||[]).length;i++)for(let j=i+1;j<lineup.length;j++){const pair=pairMaterialOverlap(state,lineup[i],lineup[j]);if(pair.lineage)lineagePairs++;if(pair.denseRare)densePairs++;penalty+=pair.penalty;if(pair.lineage||pair.denseRare)pairs.push({left:lineup[i].id,right:lineup[j].id,lineage:pair.lineage,rare:pair.rare,rareRatio:pair.rareRatio,penalty:pair.penalty});}return{penalty:round(penalty,3),lineagePairs,densePairs,pairs};}
function lineageConflictKeys(state,lineup){const keys=new Set();for(let i=0;i<(lineup||[]).length;i++)for(let j=i+1;j<lineup.length;j++)if(pairMaterialOverlap(state,lineup[i],lineup[j]).lineage)keys.add([lineup[i].id,lineup[j].id].sort().join('|'));return keys;}
function introducesLineageConflict(state,before,after){const prior=lineageConflictKeys(state,before);for(const key of lineageConflictKeys(state,after))if(!prior.has(key))return true;return false;}
function candidateOverlapPenalty(state,candidate,lineup,counts){let penalty=0;const profile=recipeProfile(state,candidate);for(const existing of lineup||[]){if(profile.finalAncestors.has(existing.id)&&num(counts&&counts[existing.id])<=1)continue;const pair=pairMaterialOverlap(state,candidate,existing);penalty+=pair.lineage?10000:pair.penalty;}return round(penalty,3);}

function normalizeBlueprint(input,settings,state){
  const raw=input&&input.upperBlueprint||settings&&settings.upperBlueprint||{},legacy=settings&&settings.preferredLineupIds;
  const ids=[].concat(raw.lineupIds||raw.preferredLineupIds||legacy||[]).map(String).filter(id=>state&&state.db.byId.has(id));
  if(!ids.length)return null;
  const upperId=String(raw.upperId||ids.find(id=>{const u=state.db.byId.get(id);return u&&C.isUpper(u);})||'');
  const fullPartyVerified=raw.fullPartyVerified===true||raw.fullPartyVerified==null&&ids.length>1;return{version:Math.max(1,num(raw.version)||1),revision:Math.max(0,num(raw.revision)),upperId,lineupIds:ids.slice(0,11),buildOrderIds:[].concat(raw.buildOrderIds||ids).map(String).filter(id=>state.db.byId.has(id)),mode:raw.mode==='magic'?'magic':raw.mode==='physical'?'physical':'',magicRoute:['dual','singleEnd'].includes(raw.magicRoute)?raw.magicRoute:'',createdFingerprint:String(raw.createdFingerprint||raw.capturedFingerprint||''),fullPartyVerified,commitment:fullPartyVerified?'full-party':'upper-route',adaptiveSupports:raw.adaptiveSupports!==false};
}

function multiset(values){const out={};for(const value of values||[])out[value]=num(out[value])+1;return out;}
function lineupKeyCounts(state,ids){return multiset((ids||[]).map(id=>state.db.byId.get(id)).filter(Boolean).map(lineupKey));}
function entryKeyCounts(entries){return multiset((entries||[]).map(lineupKey));}
function multisetMatched(a,b){let total=0;for(const [key,value] of Object.entries(a||{}))total+=Math.min(num(value),num(b&&b[key]));return total;}
function settingsWithBlueprint(settings,state,blueprint){
  if(!blueprint)return Object.assign({},settings,{_blueprint:null,_preferredLineupKeys:null});
  return Object.assign({},settings,{_blueprint:blueprint,_preferredLineupKeys:lineupKeyCounts(state,blueprint.lineupIds)});
}
function preferredCount(settings,u){return num(settings&&settings._preferredLineupKeys&&settings._preferredLineupKeys[lineupKey(u)]);}

function prerequisiteStatus(state,u,counts){
  if(!state||!u)return{allowed:true,blocked:false,missing:[],exception:false};
  if(C&&typeof C.specialPrerequisiteStatus==='function'){
    const result=C.specialPrerequisiteStatus(state.db,u,counts||state.counts)||{};
    return Object.assign({allowed:result.blocked!==true,blocked:result.allowed===false,missing:[],exception:false},result);
  }
  // Compatibility fallback for packages loaded before the core helper. Absalom's
  // zombie material is intentionally ignored; every other hard/item prerequisite
  // must actually be in the live hand before the unit may enter a recommendation.
  const solve=C.recipeSolve(state.db,u.id,counts||state.counts),missing=[];
  for(const [id,value] of Object.entries(solve.missing||{})){
    const material=state.db.byId.get(id),label=C.materialName(state.db,id);
    if(/좀비|압살롬/.test(label))continue;
    if((C.isItem&&C.isItem(material))||tierOf(material)==='hard')missing.push({id,name:label,count:num(value)});
  }
  return{allowed:missing.length===0,blocked:missing.length>0,missing,exception:false};
}

function normalizeSettings(input){
  const raw=Object.assign({},input&&input.settings||{}),snapshot=input&&input.snapshot||{},mode=raw.mode==='magic'?'magic':'physical';
  const targetLegendEquivalent=clamp(Math.round(num(raw.targetLegendEquivalent||raw.targetSquadCount||input&&input.targetSquadCount||9)),9,11);
  return Object.assign(raw,{
    mode,
    magicRoute:['dual','singleEnd','auto'].includes(raw.magicRoute)?raw.magicRoute:'auto',
    targetLegendEquivalent,
    targetSquadCount:targetLegendEquivalent,
    currentRound:Math.max(1,Math.round(num(raw.currentRound||snapshot.round||input&&input.round||25))),
    gorosei:raw.gorosei||'none',
    allowWarped:true,
    recommendWarped:true,
    superKumaOwned:raw.superKumaOwned!==false,
    changedUsed:Math.max(0,num(raw.changedUsed)),seraphUsed:Math.max(0,num(raw.seraphUsed)),transcendUsed:Math.max(0,num(raw.transcendUsed))
  });
}

// v19(사용자 요청): "물딜도 2상위 각이 보이면 갈 수 있게".
//
// 게임 규칙은 상위 2기 보유까지 허용한다(ord_core: '상위 2개 보유로 추가
// 상위 제외').  물딜 상한 1은 규칙이 아니라 플래너가 걸어 둔 전략 제약이었다.
//
// 다만 상한만 슬쩍 2로 여는 것은 틀린다.  상위는 전설 환산 3을 먹고
// (finalWeight), 보드 목표는 routeBoardTarget 이 `9환산 - 상위×2`로 계산한다.
// 상한만 열면 물딜이 기회주의적으로 상위를 하나 더 집어 보드 7기 + 상위 2기
// = 11환산이 되고, 9환산 계약이 깨진다(실제로 v19 첫 시도에서 회귀 4건이
// 여기서 터졌다).  그래서 물딜 2상위는 "사용자가 두 번째 상위를 확정했을
// 때"만 열린다 — 그때 보드 목표도 5기로 함께 줄어든다.  마딜 dual 은 원래
// 2상위 경로라 그대로다.
function committedSecondUpper(settings){return!!String(settings&&settings.secondUpperId||'');}
function expectedUpperCount(mode,route,settings){
  // v19.10(외부 점검 4-4): 실행 엔진과 같은 단일 규칙(C.upperSlotLimit)을
  // 소비한다.  마딜 단끝은 단·끝 3기를 위한 자리가 필요한 1상위 경로다 —
  // 2상위로 가려면 dual 경로를 고르는 것이 맞아서 확정을 세지 않는다.
  if(mode==='magic'&&route==='dual')return C.upperSlotLimit?C.upperSlotLimit('dual',settings):2;
  if(route==='physical')return C.upperSlotLimit?C.upperSlotLimit('physical',settings):(committedSecondUpper(settings)?2:1);
  return 1;
}
function maxUpperCount(mode,route,settings){return expectedUpperCount(mode,route,settings);}
// 두 번째 상위 확정(사용자가 버튼으로 고른 것).  메인 상위와 같은 계열이면
// 무시한다 — 같은 상위를 두 번 세는 확정은 없다.
function secondUpperKeyOf(state,settings,fixed){
  const id=String(settings&&settings.secondUpperId||'');if(!id)return'';
  const unit=state&&state.db.byId.get(id);if(!unit||!C.isUpper(unit))return'';
  const key=canonicalUpper(unit);
  for(const fixedId of fixed||[]){const other=state.db.byId.get(fixedId);if(other&&C.isUpper(other)&&canonicalUpper(other)===key)return'';}
  return key;
}
// v19(사용자 요청 ①): 두 번째 상위가 라운드마다 바뀌는 문제.
//
// 상위는 만드는 데 여러 라운드가 걸린다.  만들다가 바뀌면 그때까지 태운
// 재료가 낭비된다.  v18.2 가 행동 추천에 넣은 관성과 같은 취지로, 직전
// 라운드에 계획했던 상위를 "타이브레이크 수준 차이로는" 놓지 않는다.
// 필수 역할을 더 닫는 후보가 실제로 나타나면 그 즉시 바뀐다.
function stickyUpperHold(state,settings,unit){
  if(!unit||!C.isUpper(unit))return 0;
  const held=settings&&settings._stickyUpperKeys;if(!held||!held.size)return 0;
  return held.has(canonicalUpper(unit))?1:0;
}
function stickyUpperKeySet(state,settings){
  const out=new Set();for(const id of [].concat(settings&&settings.stickyUpperIds||[])){const unit=state&&state.db.byId.get(String(id));if(unit&&C.isUpper(unit))out.add(canonicalUpper(unit));}
  return out;
}
// v19.7.1(외부 감사 ④): 전수 메모 처방의 추천 2상위 — 앱이 계열 필터를
// 거친 id 목록으로 넘긴다(플래너는 플레이북 전역을 모른다).  stickyUpperHold
// 와 같은 원칙: 점수·게이트에는 절대 넣지 않고 nodeCompare 의 후단
// 타이브레이크로만 쓴다 — 필수 역할·경제성이 같을 때만 처방 페어가 이긴다.
function prescribedPairHold(state,settings,unit){
  if(!unit||!C.isUpper(unit))return 0;
  const keys=settings&&settings._prescribedSecondKeys;if(!keys||!keys.size)return 0;
  return keys.has(canonicalUpper(unit))?1:0;
}
function prescribedSecondKeySet(state,settings){
  const out=new Set();for(const id of [].concat(settings&&settings.prescribedSecondUpperIds||[])){const unit=state&&state.db.byId.get(String(id));if(unit&&C.isUpper(unit))out.add(canonicalUpper(unit));}
  return out;
}
function withUpperCommitments(settings,state,fixed){
  const secondKey=secondUpperKeyOf(state,settings,fixed),sticky=stickyUpperKeySet(state,settings);
  if(secondKey)sticky.delete(secondKey);
  for(const id of fixed||[]){const unit=state&&state.db.byId.get(id);if(unit&&C.isUpper(unit))sticky.delete(canonicalUpper(unit));}
  return Object.assign({},settings,{_secondUpperKey:secondKey,_stickyUpperKeys:sticky,_prescribedSecondKeys:prescribedSecondKeySet(state,settings)});
}
// 확정된 두 번째 상위가 있으면 그 자리는 다른 상위에게 넘기지 않는다.
// 확정이 없으면 아무것도 막지 않는다(관성은 순서로만 작동한다).
function secondUpperBlocked(settings,unit,fixed,state){
  const key=String(settings&&settings._secondUpperKey||'');if(!key||!unit||!C.isUpper(unit))return false;
  if(canonicalUpper(unit)===key)return false;
  for(const id of fixed||[]){const other=state&&state.db.byId.get(id);if(other&&C.isUpper(other)&&canonicalUpper(other)===canonicalUpper(unit))return false;}
  return true;
}
function routeBoardTarget(settings,mode,route){const equivalent=Math.max(9,num(settings&&settings.targetLegendEquivalent||settings&&settings.targetSquadCount||9)),uppers=expectedUpperCount(mode,route,settings);return Math.max(uppers,Math.round(equivalent-uppers*2));}
function settingsForRoute(settings,route){return Object.assign({},settings,{targetLegendEquivalent:num(settings&&settings.targetLegendEquivalent||settings&&settings.targetSquadCount||9),targetSquadCount:routeBoardTarget(settings,settings.mode,route),_boardTargetResolved:true});}
function finalWeight(u){return u&&C.isUpper(u)?3:1;}
function legendEquivalentCount(units){return(units||[]).reduce((total,item)=>{const unit=item&&item.unit||item;return total+finalWeight(unit);},0);}
function decorateLegendEquivalent(result,settings){
  if(!result)return result;const targetEquivalent=num(settings&&settings.targetLegendEquivalent||9),targetBoard=num(result.targetCount),projectedBoard=num(result.projectedCount),plannedBoard=num(result.plannedCount),projectedRows=(result.finalLineup||[]).filter(row=>String(row&&row.status||'')!=='future').slice(0,projectedBoard);
  result.targetBoardCount=targetBoard;result.projectedBoardCount=projectedBoard;result.plannedBoardCount=plannedBoard;result.targetLegendEquivalent=targetEquivalent;result.projectedLegendEquivalent=legendEquivalentCount(projectedRows);result.plannedLegendEquivalent=legendEquivalentCount(result.finalLineup||[]);result.targetCount=targetEquivalent;result.projectedCount=result.projectedLegendEquivalent;result.plannedCount=result.plannedLegendEquivalent;return result;
}
function squadDecisionSummary(state,result){
  const coverage=result&&result.roleCoverage&&result.roleCoverage.planned||{},rows=coverage.rows||[],spec=coverage.spec||{},row=key=>rows.find(item=>item.key===key)||{},tiers={},source=result&&result.handFit&&result.handFit.tiers||{};
  for(const tier of HAND_TIERS){const data=source[tier]||{},items=(data.rows||[]).filter(item=>num(item.initial)>0),assigned=num(data.assigned!=null?data.assigned:num(data.spent)+num(data.reserved));tiers[tier]={initial:num(data.initial),assigned,remaining:num(data.remaining),left:items.filter(item=>num(item.remaining)>0).map(item=>({id:item.id,name:item.name||displayNameOf(state.db.byId.get(item.id)),count:num(item.remaining)}))};}
  const armor=row('armor'),main=row('main'),stunBase=row('stunBase'),slow=row('slow'),boss=row('bossFrenzy'),stunFull=row('stunFull'),toki=row('toki'),finish=row('singleEndExpected'),physical=result&&result.mode==='physical',dual=!physical&&result.magicRoute==='dual',primaryReady=physical?num(armor.gap)<=0&&num(stunBase.gap)<=0:dual?num(main.gap)<=0&&num(stunBase.gap)<=0:num(boss.gap)<=0&&num(stunBase.gap)<=0,secondaryReady=physical?num(slow.gap)<=0&&num(boss.gap)<=0:num(slow.gap)<=0,routeReady=physical?primaryReady&&secondaryReady:dual?primaryReady&&secondaryReady&&num(stunFull.gap)<=0&&num(boss.gap)<=0&&num(toki.gap)<=0:primaryReady&&secondaryReady&&num(stunFull.gap)<=0&&num(finish.gap)<=0,priorityGroups=physical?[['armor','stunBase'],['slow','bossFrenzy'],['stunFull']]:dual?[['main','stunBase'],['slow'],['bossFrenzy','toki'],['stunFull']]:[['bossFrenzy','stunBase'],['slow'],['singleEndExpected'],['stunFull']];
  const reason=physical?(primaryReady&&secondaryReady&&num(stunFull.gap)>0?'방깎·최소 스턴·이감·광보잡을 먼저 지켜 1.5스턴은 후순위로 보류했습니다.':primaryReady&&!secondaryReady?'방깎과 최소 스턴은 고정하고 이감·광보잡 결손을 먼저 보강합니다.':'상시 방깎과 최소 0.7스턴을 가장 먼저 맞춥니다.'):dual?'상위 2기와 최소 0.7스턴을 먼저 지키고, 이감 → 광보잡·토키 → 1.5스턴(마지막 필수) 순서로 판정합니다.':'광보잡과 최소 0.7스턴을 먼저 지키고, 이감 → 검증된 보조 단·끝 → 1.5스턴(마지막 필수) 순서로 판정합니다.';
  return{policy:physical?'physical-operational':dual?'magic-dual':'magic-single-end',counts:{board:num(result&&result.plannedBoardCount),boardTarget:num(result&&result.targetBoardCount),equivalent:num(result&&result.plannedCount),equivalentTarget:num(result&&result.targetCount)},priorityGroups,spec:{armor:num(spec.armor),triggerArmor:num(spec.triggerArmor),stun:num(spec.stun),staticSlow:num(spec.slow),triggerSlow:num(spec.triggerSlow),creditedSlow:num(slow.current),bossFrenzy:Math.min(num(spec.boss),num(spec.frenzy)),main:num(spec.main),toki:num(spec.toki),singleEndExpected:num(spec.singleEndExpected),singleEndStable:num(spec.singleEndStable),singleEndMax:num(spec.singleEndMax)},gates:{primaryReady,secondaryReady,operationalReady:routeReady,armorTarget:num(armor.target),mainTarget:num(main.target),stunBaseTarget:num(stunBase.target),slowTarget:num(slow.target),bossFrenzyTarget:num(boss.target),tokiTarget:num(toki.target),finishTarget:num(finish.target),comfortStunTarget:num(stunFull.target),comfortStunGap:num(stunFull.gap)},tiers,reason};
}

// A final blueprint is useful at round 25, but it is not proof that the board
// can survive round 50.  Keep three states separate:
//   actual       = final units that TMO reports as already completed
//   craftableNow = actual plus the exact sequential actions affordable now
//   blueprint    = the full route, including future rewards and drops
// Only `actual` is allowed to pass a round checkpoint.
function finalStageSnapshot(state,counts,mode,route,settings,fixed){
  const units=finalEntries(state,counts),spec=finalOnlySpec(state,counts,mode),main=mainUpperFor(state,counts,fixed),requirements=requirementRows(spec,units,mode,route,settings,main),routeEvaluation=routeEvaluationFor(units,requirements,mode,route);
  return{source:'tmo-owned-final-only',unitIds:units.map(stableId),boardCount:units.length,legendEquivalent:legendEquivalentCount(units),upperCount:new Set(units.filter(C.isUpper).map(canonicalUpper)).size,nonUpperFinalCount:units.filter(unit=>!C.isUpper(unit)).length,spec,requirements,routeEvaluation,mainUpperId:main&&main.id||''};
}

function strategyGateRows(units,spec){
  const rows=[],seen=new Set();for(const upper of (units||[]).filter(C.isUpper)){const strategy=C.upperStrategy?C.upperStrategy(upper):null;for(const need of strategy&&strategy.needs||[]){const key=String(need.key||''),token=`${canonicalUpper(upper)}:${key}`;if(!key||seen.has(token))continue;seen.add(token);const current=num(spec&&spec[key]),target=Math.max(.01,num(need.target)||1);rows.push({upperId:upper.id,upperName:displayNameOf(upper),key,label:need.label||key,current:round(current,3),target:round(target,3),gap:round(Math.max(0,target-current),3),pass:current+1e-9>=target,reason:need.reason||'메인 상위 핵심 시너지'});}}
  return rows;
}

function stageGateSnapshot(stage,mode,route){
  const rows=stage&&stage.requirements&&stage.requirements.rows||[],byKey=key=>rows.find(row=>row.key===key)||{},coreKeys=mode==='physical'?['main','armor','bossFrenzy']:route==='dual'?['main','bossFrenzy','toki']:['main','bossFrenzy','singleEndExpected'],controlKeys=['stunFull','slow'],coreRows=coreKeys.map(byKey),controlRows=controlKeys.map(byKey),strategyRows=strategyGateRows((stage&&stage.unitIds||[]).map(id=>stage._state&&stage._state.db.byId.get(id)).filter(Boolean),stage&&stage.spec),corePass=coreRows.every(row=>row.key&&num(row.gap)<=0)&&strategyRows.every(row=>row.pass),controlPass=controlRows.every(row=>row.key&&num(row.gap)<=0),coreParts=coreRows.length+strategyRows.length,coreDone=coreRows.filter(row=>row.key&&num(row.gap)<=0).length+strategyRows.filter(row=>row.pass).length;
  return{damageCore:{pass:corePass,progress:coreParts?Math.round(coreDone/coreParts*100):0,rows:coreRows.concat(strategyRows),blockers:coreRows.filter(row=>!row.key||num(row.gap)>0).map(row=>row.label||row.key||'보스 핵심 역할').concat(strategyRows.filter(row=>!row.pass).map(row=>`${row.upperName} · ${row.label}`))},controlCore:{pass:controlPass,rows:controlRows,blockers:controlRows.filter(row=>!row.key||num(row.gap)>0).map(row=>row.label||row.key||'제어 핵심')}};
}

function checkpointRequirementKeys(mode,route,dueRound){
  if(mode==='physical'){
    if(dueRound<=40)return['main','armor','stunBase'];
    if(dueRound<=45)return['main','armor','stunBase','slow','bossFrenzy'];
    return['main','armor','stunBase','slow','bossFrenzy','stunFull'];
  }
  if(route==='dual'){
    if(dueRound<=40)return['main','stunBase'];
    if(dueRound<=45)return['main','stunBase','slow','stunFull'];
    return['main','stunBase','slow','stunFull','bossFrenzy','toki'];
  }
  if(dueRound<=40)return['main','bossFrenzy','stunBase'];
  if(dueRound<=45)return['main','bossFrenzy','stunBase','slow','stunFull'];
  // v18: 마감 게이트에서 singleEndStable을 뺀다.
  //
  // 이 행은 core에서 required:false(권장)로 선언돼 있는데 여기서만 하드
  // 게이트로 쓰이고 있었다.  그 불일치가 "좋은각·완벽각 실전 0건"의
  // 마지막 자물쇠였다: 첫 클리어 보드는 생존 5행(main·광보잡·최소 스턴·
  // 이감·1.5스턴)을 전부 닫았는데 singleEndStable만 1/3이라 checkpointPass가
  // false였고, 그 하나 때문에 각 판정 전체가 잠겼다.
  //
  // 물딜·dual 게이트는 원래 생존 행만으로 구성돼 있다.  singleEnd만 화력
  // 행을 하나 얹고 있던 것을 물딜과 같은 기준으로 맞춘다.  화력이 사라지는
  // 것이 아니라 요구치 표(single·end·singleEndExpected·singleEndStable)에
  // 그대로 남아 화력 축으로 따로 보고된다.
  return['main','bossFrenzy','stunBase','slow','stunFull'];
}
function checkpointRequirementRows(stage,mode,route,dueRound){
  // v19.9.9(외부 점검 P1): 필수 행이 없으면 gap:Infinity 를 줬는데 하류의
  // num() 이 Infinity 를 0으로 정규화해 "부족 무한대"가 "부족 0"이 되는
  // fail-open 이었다 — 유한 대부채(999)로 바꿔 누락이 항상 미충족으로 남는다.
  const rows=stage&&stage.requirements&&stage.requirements.rows||[],byKey=new Map(rows.map(row=>[row.key,row]));return checkpointRequirementKeys(mode,route,dueRound).map(key=>byKey.get(key)||{key,label:key,target:1,gap:999,required:true,missingRow:true});
}
function checkpointStagePass(stage,mode,route,dueRound){
  const rows=checkpointRequirementRows(stage,mode,route,dueRound),strategyPass=dueRound<50||!!(stage&&stage.damageCore&&stage.damageCore.rows||[]).filter(row=>row&&row.upperId).every(row=>row.pass);return rows.every(row=>Number.isFinite(num(row.gap))&&num(row.gap)<=0)&&strategyPass;
}
function activeCheckpoint(checkpoints,roundNow){
  const overdue=(checkpoints||[]).find(item=>item.dueRound<=roundNow&&!item.pass);if(overdue)return overdue;return(checkpoints||[]).find(item=>item.dueRound>roundNow)||(checkpoints||[]).slice(-1)[0]||null;
}

// A rare can still be part of the live combat specification even when it no
// longer has a valid recipe destination.  Treating every such rare as reroll
// after round 45 can remove the last slow/stun/armor contribution that keeps a
// run alive.  Preserve only the minimum number of copies whose removal would
// reopen or worsen a required/recommended clear-spec gap; genuine excess
// copies remain rerollable.
function directRareRoleReservation(unit,available,liveDef,mode,liveSpec){
  const pool=Math.max(0,num(available)),requirements=liveDef&&liveDef.requirements||[],contribution=unit&&C.roleContribution?C.roleContribution(unit,mode):{},relevant=requirements.filter(row=>(row.required||row.recommended)&&num(contribution[row.key])>0);if(!pool||!relevant.length)return{count:0,labels:[]};
  // `stunBase.current` is deliberately capped at the STUN_BASE_FLOOR (0.7). Subtracting a Rare's
  // stun from that capped number made a 1.9-stun board look as if removing one
  // Jozu reopened the minimum-stun gate. Use the uncapped live stun for both
  // stun rows; every other role keeps the route's credited current value.
  const current=row=>row.key==='stunBase'||row.key==='stunFull'?num(liveSpec&&liveSpec.stun):num(row.current),gap=row=>Math.max(0,num(row.target)-current(row));
  let keep=pool;for(let candidate=0;candidate<=pool;candidate++){const removed=pool-candidate,worsens=relevant.some(row=>{const projected=current(row)-num(contribution[row.key])*removed,projectedGap=Math.max(0,num(row.target)-projected);return projectedGap>gap(row)+.005;});if(!worsens){keep=candidate;break;}}
  if(!keep)return{count:0,labels:[]};const labels=relevant.filter(row=>{const projected=current(row)-num(contribution[row.key])*keep;return projected<num(row.target)+.005||gap(row)>0;}).map(row=>row.label||row.key);return{count:keep,labels:[...new Set(labels)]};
}

function rareDeadlineAssessment(state,result,settings,fixed){
  const roundNow=Math.max(1,num(settings&&settings.currentRound)||25),mode=result&&result.mode||settings&&settings.mode||'physical',route=result&&result.magicRoute||routeFor(mode,settings&&settings.magicRoute),liveSettings=Object.assign({},settings,{mode,magicRoute:route,_resolvedMagicRoute:route,_upperUnit:mainUpperFor(state,state.counts,fixed)}),liveSpec=C.currentSpec(state,mode,liveSettings),liveDef=C.deficits(liveSpec,mode,liveSettings),alloc=Array.isArray(result&&result.rareAllocation)?result.rareAllocation:[],lineup=result&&result.finalLineup||[],fixedKeys=new Set((fixed||[]).map(id=>{const unit=state.db.byId.get(id);return unit?lineupKey(unit):`unit:${id}`;})),firstFuture=lineup.find(row=>row&&row.status==='future'),rows=[],actualOwned=state.db.rares.reduce((sum,unit)=>sum+Math.max(0,num(state.counts[unit.id])),0),craftableRemaining=state.db.rares.reduce((sum,unit)=>sum+Math.max(0,num(result&&result.afterStock&&result.afterStock[unit.id])),0),prefixUse={},prefixDestinations={};
  // The exact current-stock action is stronger evidence than a speculative
  // final blueprint. Reserve its Rare cards before exposing anything to the
  // reroll panel, so one screen can never say "make Vivi" and "reroll Vivi".
  for(const action of result&&result.safePrefix&&result.safePrefix.actions||[])for(const [id,value] of Object.entries(action&&action.solve&&action.solve.rareUse||{})){if(num(value)<=0)continue;prefixUse[id]=num(prefixUse[id])+num(value);(prefixDestinations[id]||(prefixDestinations[id]=[])).push({id:action.id,name:action.name,count:num(value),disposition:'hold',reason:'현재 패로 검증된 다음 제작 재료'});}
  const source=alloc.length?alloc:state.db.rares.map(unit=>({id:unit.id,name:displayNameOf(unit),initial:num(state.counts[unit.id]),spent:0,reserved:0,remaining:num(state.counts[unit.id]),conflict:0,usedBy:[]})).filter(row=>row.initial>0);
  for(const raw of source){const initial=Math.max(0,num(raw.initial)),spent=Math.min(initial,Math.max(0,num(raw.spent))),destinations=(raw.usedBy||[]).filter(dest=>dest.status==='reserved'),lineupFor=dest=>lineup.find(row=>row&&row.id===dest.id&&row.status==='future'),useByDestination=[];let hold=0,released=0;
    for(const dest of destinations){const target=lineupFor(dest),unit=target&&(target.unit||state.db.byId.get(target.id)),count=Math.max(0,num(dest.count)),locked=!!(unit&&C.isUpper(unit)&&fixedKeys.has(lineupKey(unit))),hard=!!(target&&target.futureDropPending!==true&&(!target.prerequisite||target.prerequisite.allowed!==false)),near=!!(target&&num(target.status==='future'&&lineup.indexOf(target))<num(result&&result.projectedBoardCount)+2),first=!!(target&&firstFuture&&target===firstFuture),keep=locked||(roundNow<35)||(roundNow<40&&hard&&near)||(roundNow<45&&hard&&first);if(keep)hold+=count;else released+=count;useByDestination.push({id:dest.id,name:dest.name,count,disposition:keep?'hold':'reroll',reason:locked?'확정 상위 핵심 재료':keep&&hard?'현재 순서에서 제작 가능한 가까운 사용처':keep?'35라 전 조건부 예약':target&&target.futureDropPending?'후속 드랍 의존 예약 만료':roundNow>=45?'45라 제작 마감 초과':'현재 제작 순서 밖 예약'});}
    // Older/light plans may not expose destination rows. Never allow an
    // anonymous future reservation to survive the round-45 deadline.
    const anonymousReserved=Math.max(0,num(raw.reserved)-destinations.reduce((sum,item)=>sum+num(item.count),0));if(roundNow<35)hold+=anonymousReserved;else released+=anonymousReserved;
    const remaining=Math.max(0,num(raw.remaining)),unit=state.db.byId.get(raw.id);let reroll=remaining+released;const prefixHold=Math.min(reroll,Math.max(0,num(prefixUse[raw.id])-spent));if(prefixHold>0){hold+=prefixHold;reroll-=prefixHold;useByDestination.push(...(prefixDestinations[raw.id]||[]).map(item=>Object.assign({},item,{count:Math.min(prefixHold,num(item.count))})));}const direct=directRareRoleReservation(unit,reroll,liveDef,mode,liveSpec),directHold=Math.min(reroll,direct.count);if(directHold>0){hold+=directHold;reroll-=directHold;useByDestination.push({id:`combat:${raw.id}`,name:`현재 전투 · ${(direct.labels||[]).join(' · ')||'클리어 역할'}`,count:directHold,disposition:'hold',reason:'대체 전력이 완성될 때까지 직접 전투 역할 보호'});}const conflict=Math.max(0,num(raw.conflict)),directText=directHold>0?`현재 전투 결손 직접 보완 · ${(direct.labels||[]).join(' · ')||'클리어 역할'}`:'',prefixText=prefixHold>0?'현재 패 확정 제작 재료':'';rows.push({id:raw.id,name:raw.name||displayNameOf(unit),initial,spent,hold,reroll,conflict,deadlineRound:(directHold>0||prefixHold>0)&&reroll<=0?0:roundNow>=45?roundNow:roundNow>=40?45:40,destinations:useByDestination,reason:prefixText?(reroll>0?`${prefixText} ${prefixHold}장 보류 · 초과 ${reroll}장 리롤`:prefixText):directText?(reroll>0?`${directText} ${directHold}장 보류 · 초과 ${reroll}장 리롤`:directText):reroll>0?(roundNow>=45?'45라 제작 마감 뒤 사용처 없음':'선택 파티의 현재 유효 사용처 없음'):hold>0?'검증된 제작 사용처 보호':spent>0?'지금 제작에 사용':'현재 희귀 없음'});
  }
  const totals=rows.reduce((out,row)=>{out.owned+=row.initial;out.spentNow+=row.spent;out.actionableReserved+=row.hold;out.unassigned+=row.reroll;out.conflict+=row.conflict;return out;},{owned:0,spentNow:0,actionableReserved:0,unassigned:0,conflict:0});return Object.assign(totals,{conditionalReserved:0,pass:totals.unassigned<=0&&totals.conflict<=0,actualOwned,actualCleared:actualOwned<=0,craftableRemaining,craftableCleared:craftableRemaining<=0,rows});
}

function timelineReadiness(state,result,settings,fixed){
  if(!result)return null;const roundNow=Math.max(1,num(settings&&settings.currentRound)||25),mode=result.mode||settings.mode,route=result.magicRoute||routeFor(mode,settings.magicRoute),liveSettings=Object.assign({},settings,{mode,magicRoute:route,_resolvedMagicRoute:route}),actual=finalStageSnapshot(state,state.counts,mode,route,liveSettings,fixed),craftCounts=result.afterStock||state.counts,craftState=Object.assign({},state,{counts:craftCounts}),craftable=finalStageSnapshot(state,craftCounts,mode,route,liveSettings,fixed),attachLive=(stage,sourceState,counts)=>{const main=mainUpperFor(state,counts,fixed),units=C.ownedUnits?C.ownedUnits(sourceState,C.isRoleBearingUnit):[],spec=C.currentSpec(sourceState,mode,Object.assign({},liveSettings,{_upperUnit:main}));stage.finalOnlySpec=stage.spec;stage.spec=spec;stage.requirements=requirementRows(spec,units,mode,route,liveSettings,main);stage.routeEvaluation=routeEvaluationFor(units,stage.requirements,mode,route);stage.combatSource='TMO 현재 보유 역할 전체';return stage;};attachLive(actual,state,state.counts);attachLive(craftable,craftState,craftCounts);actual._state=state;craftable._state=state;Object.assign(actual,stageGateSnapshot(actual,mode,route));Object.assign(craftable,stageGateSnapshot(craftable,mode,route));delete actual._state;delete craftable._state;
  const rare=rareDeadlineAssessment(state,result,settings,fixed),futureRows=(result.finalLineup||[]).filter(row=>row&&row.status==='future'),blueprint={boardCount:num(result.plannedBoardCount),legendEquivalent:num(result.plannedLegendEquivalent),futureCount:futureRows.length,futureDependencyCount:futureRows.filter(row=>row.futureDropPending||row.prerequisite&&row.prerequisite.allowed===false).length},definitions=[{key:'r30',dueRound:30,equivalent:4,extra:'상위 1기 + 라인 전설급 1기'},{key:'r40',dueRound:40,equivalent:6,extra:'경로 최우선 역할 + 실제 환산 6'},{key:'r45',dueRound:45,equivalent:8,extra:'핵심 역할 + 실제 환산 8 + 미배정 희귀 0'},{key:'r50',dueRound:50,equivalent:9,extra:'실제 환산 9 + 충분한 1.5스턴 + 잔여 희귀 0'}],checkpoints=definitions.map(def=>{const stagePass=def.dueRound===30?actual.upperCount>=1&&actual.nonUpperFinalCount>=1:checkpointStagePass(actual,mode,route,def.dueRound),craftableStagePass=def.dueRound===30?craftable.upperCount>=1&&craftable.nonUpperFinalCount>=1:checkpointStagePass(craftable,mode,route,def.dueRound),rarePass=def.dueRound<45?true:def.dueRound<50?rare.pass:rare.actualCleared,craftableRarePass=def.dueRound<45?true:def.dueRound<50?rare.pass:rare.craftableCleared,pass=actual.legendEquivalent>=def.equivalent&&stagePass&&rarePass,craftablePass=craftable.legendEquivalent>=def.equivalent&&craftableStagePass&&craftableRarePass,blockers=[];if(actual.legendEquivalent<def.equivalent)blockers.push(`실제 전설 환산 ${def.equivalent-actual.legendEquivalent} 부족`);if(def.dueRound===30){if(actual.upperCount<1)blockers.push('실제 완성 상위 1기 부족');if(actual.nonUpperFinalCount<1)blockers.push('실제 완성 라인 전설급 1기 부족');}else for(const row of checkpointRequirementRows(actual,mode,route,def.dueRound))if(num(row.gap)>0)blockers.push(row.label||row.key);if(def.dueRound>=50)blockers.push(...(actual.damageCore&&actual.damageCore.rows||[]).filter(row=>row&&row.upperId&&!row.pass).map(row=>`${row.upperName} · ${row.label}`));if(def.dueRound>=50&&!rare.actualCleared)blockers.push(`실제 잔여 희귀 ${rare.actualOwned}장`);else if(def.dueRound>=45&&!rare.pass)blockers.push(`미배정 희귀 ${rare.unassigned}장${rare.conflict?` · 충돌 ${rare.conflict}`:''}`);const status=pass?'passed':craftablePass?'recoverable':roundNow>=def.dueRound?'blocked':def.dueRound-roundNow<=5?'urgent':'pending';return{key:def.key,dueRound:def.dueRound,status,pass,craftablePass,requiredEquivalent:def.equivalent,extra:def.extra,blockers:[...new Set(blockers)]};}),boss=checkpoints.find(item=>item.key==='r50'),current=activeCheckpoint(checkpoints,roundNow),verified=false;
  return{round:roundNow,source:'tmo-live-roles+owned-final-count',actual,craftableNow:Object.assign({},craftable,{addedBoard:Math.max(0,craftable.boardCount-actual.boardCount),addedEquivalent:Math.max(0,craftable.legendEquivalent-actual.legendEquivalent),actionIds:(result.actions||[]).map(action=>action.id)}),blueprint,rare,checkpoints,currentCheckpoint:current,boss50:{status:boss.pass?'unverified':boss.craftablePass?'recoverable':'blocked',structuralPass:actual.legendEquivalent>=9,damagePass:actual.damageCore.pass,controlPass:actual.controlCore.pass,rarePass:rare.actualCleared,verified,evidence:'50라 보스 DPS 실측표 없음',blockers:boss.blockers,note:boss.pass?'보수적 구조 기준은 충족했지만 보스 화력은 실측되지 않았습니다. 클리어 확정으로 표시하지 않습니다.':boss.craftablePass?'위 제작 순서를 실제로 완료하고 TMO에서 확인해야 50라 구조 기준에 도달합니다.':'미래 청사진은 제외했습니다. 현재 완성 전력으로 50라 구조 기준을 통과하지 못합니다.'}};
}

// Receding-horizon exact prefix.  A round-25 fixed nine-unit forecast cannot
// be proved without the random future drops.  What can be proved is the next
// one or two crafts from the inventory TMO reports now.  The first step is the
// selected upper when it is not owned yet; after that we prove one support.
function exactPrefixStage(state,node,mode,route,settings,fixed){
  const stage=finalStageSnapshot(state,node.counts,mode,route,settings,fixed);stage._state=state;Object.assign(stage,stageGateSnapshot(stage,mode,route));delete stage._state;return stage;
}
function exactPrefixCheckpoint(roundNow,stage,mode,route,rareRemaining){
  const definitions=[{key:'r30',dueRound:30,equivalent:4},{key:'r40',dueRound:40,equivalent:6},{key:'r45',dueRound:45,equivalent:8},{key:'r50',dueRound:50,equivalent:9}],pass=def=>stage.legendEquivalent>=def.equivalent&&(def.dueRound===30?stage.upperCount>=1&&stage.nonUpperFinalCount>=1:checkpointStagePass(stage,mode,route,def.dueRound))&&(def.dueRound<45||rareRemaining<=0),overdue=definitions.find(def=>def.dueRound<=roundNow&&!pass(def));return overdue||definitions.find(def=>def.dueRound>roundNow)||definitions[definitions.length-1];
}
function checkpointDebtVector(stage,mode,route,dueRound){
  const keys=new Set(checkpointRequirementKeys(mode,route,dueRound)),requirements=stage&&stage.requirements&&stage.requirements.rows||[],byKey=new Map(requirements.map(row=>[row.key,row])),groups=mode==='physical'?[['main'],['armor','stunBase'],['slow','bossFrenzy'],['stunFull']]:route==='dual'?[['main','stunBase'],['slow'],['bossFrenzy','toki'],['stunFull']]:[['main'],['bossFrenzy','stunBase'],['slow'],['singleEndStable','singleEndExpected'],['stunFull']],vector=[];
  // v19.9.9(외부 점검 P1): Infinity 는 num() 에서 0이 된다 — 위와 같은
  // fail-open 봉합(누락 행 = 유한 대부채 999).
  for(const group of groups){const selected=group.filter(key=>keys.has(key)).map(key=>byKey.get(key)||{key,target:1,gap:999,missingRow:true});if(!selected.length)continue;const missed=selected.filter(row=>num(row.gap)>0).length,debt=selected.reduce((total,row)=>total+num(row.gap)/Math.max(.01,num(row.target)||1),0);vector.push(missed,round(debt,6));}return vector;
}
function exactPrefixMetrics(state,node,mode,route,settings,fixed){
  const roundNow=Math.max(1,num(settings&&settings.currentRound)||25),stage=exactPrefixStage(state,node,mode,route,settings,fixed),rareRemaining=state.db.rares.reduce((total,unit)=>total+Math.max(0,num(node.counts[unit.id])),0),checkpoint=exactPrefixCheckpoint(roundNow,stage,mode,route,rareRemaining),used=node.used||consumptionTotals(node.actions||[],state),lineUnits=finalEntries(state,node.counts),storyProxy=Math.round(lineUnits.reduce((total,unit)=>total+clearAffinity(unit),0)*10000)/10000,fixedMissing=(fixed||[]).filter(id=>{const unit=state.db.byId.get(id);return unit&&!lineUnits.some(owned=>lineupKey(owned)===lineupKey(unit));}).length,vector=[],gateVector=[],checkpointDebts=checkpoint.dueRound===30?[]:checkpointDebtVector(stage,mode,route,checkpoint.dueRound),checkpointMisses=checkpointDebts.filter((value,index)=>index%2===0),strategyMisses=(stage.damageCore&&stage.damageCore.rows||[]).filter(row=>row&&row.upperId).map(row=>row.pass?0:1),equivalentGap=Math.max(0,checkpoint.equivalent-stage.legendEquivalent);
  if(checkpoint.key==='r30'){vector.push(fixedMissing,Math.max(0,1-stage.upperCount),Math.max(0,1-stage.nonUpperFinalCount),equivalentGap);gateVector.push(...vector);}
  else if(checkpoint.key==='r40'){vector.push(fixedMissing,...checkpointDebts,equivalentGap);gateVector.push(fixedMissing,...checkpointMisses,equivalentGap);}
  else if(checkpoint.key==='r45'){vector.push(fixedMissing,...checkpointDebts,equivalentGap,rareRemaining);gateVector.push(fixedMissing,...checkpointMisses,equivalentGap,rareRemaining);}
  else{vector.push(fixedMissing,...checkpointDebts,...strategyMisses,equivalentGap,rareRemaining);gateVector.push(fixedMissing,...checkpointMisses,...strategyMisses,equivalentGap,rareRemaining);}
  const pass=vector.every(value=>num(value)<=0),tierUse={rare:num(used.rare),special:num(used.special),uncommon:num(used.uncommon),common:num(used.common)};
  return{stage,checkpoint,vector,gateVector,pass,rareRemaining,wispUsed:num(used.wisp),tierUse,requirementPriority:requirementPriorityVector(stage.requirements),commonPressure:num(used.commonPressure),storyProxy,actionCount:(node.actions||[]).length};
}
function compareExactPrefixMetrics(a,b){
  const left=a&&a.metrics||a||{},right=b&&b.metrics||b||{},lv=left.vector||[],rv=right.vector||[],length=Math.max(lv.length,rv.length);for(let index=0;index<length;index++){const av=num(lv[index]),bv=num(rv[index]);if(av!==bv)return av-bv;}
  if(num(left.stage&&left.stage.legendEquivalent)!==num(right.stage&&right.stage.legendEquivalent))return num(right.stage&&right.stage.legendEquivalent)-num(left.stage&&left.stage.legendEquivalent);
  const roleOrder=comparePriorityVectors(left.requirementPriority,right.requirementPriority);if(roleOrder)return roleOrder;
  if(num(left.rareRemaining)!==num(right.rareRemaining))return num(left.rareRemaining)-num(right.rareRemaining);
  for(const tier of ['special','uncommon','common'])if(num(left.tierUse&&left.tierUse[tier])!==num(right.tierUse&&right.tierUse[tier]))return num(right.tierUse&&right.tierUse[tier])-num(left.tierUse&&left.tierUse[tier]);
  if(num(left.wispUsed)!==num(right.wispUsed))return num(left.wispUsed)-num(right.wispUsed);
  if(num(left.commonPressure)!==num(right.commonPressure))return num(left.commonPressure)-num(right.commonPressure);
  if(num(left.storyProxy)!==num(right.storyProxy))return num(right.storyProxy)-num(left.storyProxy);
  return 0;
}
function exactPrefixPlan(state,mode,route,settings,policy,fixed){
  const target=settings.targetSquadCount,baseSpec=finalOnlySpec(state,state.counts,mode),initial=evaluateNode(state,{counts:clone(state.counts),wisp:num(state.counts[C.WISP_ID]),spec:baseSpec,actions:[]},mode,route,settings,fixed,target);initial.target=target;initial.metrics=exactPrefixMetrics(state,initial,mode,route,settings,fixed);
  const data=makeLightStaticData(state,mode,route,settings,policy),allRows=staticCandidatePool(data),fixedUnits=(fixed||[]).map(id=>state.db.byId.get(id)).filter(Boolean),fixedMissing=fixedUnits.filter(unit=>!initial.lineup.some(owned=>lineupKey(owned)===lineupKey(unit))),maxDepth=fixedMissing.length?2:1,actionTarget=Math.max(target,initial.lineup.length+maxDepth);let frontier=[initial],archive=[initial];
  for(let depth=0;depth<maxDepth;depth++){
    const children=[];for(const node of frontier){let rows=allRows;if(depth===0&&fixedMissing.length){const requiredKeys=new Set(fixedMissing.map(lineupKey));rows=rows.filter(row=>requiredKeys.has(lineupKey(row.unit)));}
      for(const row of rows){if(num(node.counts[row.unit.id])>0||ruleBlocked(state,node,row.unit,mode,route,settings,fixed))continue;const next=expandNode(state,node,row,mode,route,settings,fixed,actionTarget,policy);if(!next)continue;next.target=target;next.metrics=exactPrefixMetrics(state,next,mode,route,settings,fixed);children.push(next);}
    }
    if(!children.length)break;const dedup=new Map();for(const node of children){const key=nodeSignature(node,state),old=dedup.get(key);if(!old||compareExactPrefixMetrics(node,old)<0)dedup.set(key,node);}frontier=[...dedup.values()].sort((a,b)=>compareExactPrefixMetrics(a,b)||nodeCompare(a,b));archive.push(...frontier);
  }
  const eligibleRaw=archive.filter(node=>fixedMissing.length===0||(node.actions||[]).some(action=>fixedMissing.some(unit=>lineupKey(action.unit)===lineupKey(unit)))),fixedMissingKeys=new Set(fixedMissing.map(lineupKey)),isRequiredFixed=node=>(node.actions||[]).some(action=>fixedMissingKeys.has(lineupKey(action.unit))),initialRows=new Map((initial.metrics.stage.requirements.rows||[]).map(row=>[row.key,row]));let criticalRoleGuarded=false,roleGuardedRaw=eligibleRaw;
  // Once minimum stun is secured and armor is only a small patch away, do not
  // spend the whole finite wisp pool on armor/stun if that makes an affordable
  // slow unit impossible. This is the R46 failure guard: armor +8 could be
  // repaired later, but losing Marco's slow route left the final board at
  // 100/117 slow with no remaining budget.
  if(mode==='physical'&&num(settings&&settings.currentRound)>=40){const armor=initialRows.get('armor')||{},stun=initialRows.get('stunBase')||{},slow=initialRows.get('slow')||{},slowOptions=eligibleRaw.filter(node=>(node.actions||[]).length>0&&num((node.metrics.stage.requirements.rows||[]).find(row=>row.key==='slow')&&((node.metrics.stage.requirements.rows||[]).find(row=>row.key==='slow').current))>num(slow.current)+.005).sort((a,b)=>num(a.metrics.wispUsed)-num(b.metrics.wispUsed));if(num(armor.gap)>0&&num(armor.gap)<=15&&num(stun.gap)<=0&&num(slow.gap)>0&&slowOptions.length){const protectedSlow=slowOptions[0],slowCost=num(protectedSlow.metrics.wispUsed),available=num(initial.wisp);roleGuardedRaw=eligibleRaw.filter(node=>{if(!(node.actions||[]).length||isRequiredFixed(node)||node===protectedSlow)return true;const rows=node.metrics.stage.requirements.rows||[],nextArmor=rows.find(row=>row.key==='armor')||armor,nextSlow=rows.find(row=>row.key==='slow')||slow,armorGain=num(armor.gap)-num(nextArmor.gap),slowGain=num(slow.gap)-num(nextSlow.gap),starves=armorGain>0&&slowGain<=.005&&num(node.metrics.wispUsed)+slowCost>available;if(starves)criticalRoleGuarded=true;return!starves;});if(!roleGuardedRaw.length)roleGuardedRaw=eligibleRaw;}}
  const economyAlternative=node=>roleGuardedRaw.some(alt=>alt!==node&&(alt.actions||[]).length>0&&!isRequiredFixed(alt)&&num(alt.metrics&&alt.metrics.wispUsed)<num(node.metrics&&node.metrics.wispUsed)&&num(alt.metrics&&alt.metrics.rareRemaining)<=num(node.metrics&&node.metrics.rareRemaining)&&comparePriorityVectors(alt.metrics&&alt.metrics.gateVector,node.metrics&&node.metrics.gateVector)<=0),eligible=roleGuardedRaw.filter(node=>isRequiredFixed(node)||num(node.metrics&&node.metrics.wispUsed)<=num(C.PREFERRED_WISP_COST)||node.metrics&&node.metrics.pass||!economyAlternative(node)),economyGuarded=eligible.length<roleGuardedRaw.length,best=(eligible.length?eligible:roleGuardedRaw.length?roleGuardedRaw:archive).slice().sort((a,b)=>compareExactPrefixMetrics(a,b)||nodeCompare(a,b))[0]||initial,metrics=best.metrics||exactPrefixMetrics(state,best,mode,route,settings,fixed),spent=consumptionTotals(best.actions||[],state),ledger=Object.entries(spent.consumedById||{}).filter(([,count])=>num(count)>0).map(([id,count])=>({id,name:displayNameOf(state.db.byId.get(id)),tier:tierOf(state.db.byId.get(id)),count:num(count)}));
  const blockers=[];if(fixedMissing.length&&!(best.actions||[]).some(action=>fixedMissing.some(unit=>lineupKey(action.unit)===lineupKey(unit)))){for(const unit of fixedMissing){const prerequisite=prerequisiteStatus(state,unit,state.counts),solve=effectiveSolve(C.recipeSolve(state.db,unit.id,state.counts),prerequisite);if(!prerequisite.allowed)blockers.push(`${displayNameOf(unit)} · ${prerequisite.missing.map(item=>item.name).join('·')} 필요`);else if(missingNonWisp(solve,prerequisite))blockers.push(`${displayNameOf(unit)} · 특수 재료 부족`);else if(solve.wispCost>num(state.counts[C.WISP_ID]))blockers.push(`${displayNameOf(unit)} · 선택위습 ${solve.wispCost-num(state.counts[C.WISP_ID])}개 부족`);}}
  if(!blockers.length&&!metrics.pass)blockers.push(`${metrics.checkpoint.dueRound}라 체크포인트까지 후속 패 재계산 필요`);const comparison=compareExactPrefixMetrics(metrics,initial.metrics),regressedRequired=(initial.metrics.stage.requirements.rows||[]).filter(before=>before.required&&num(before.gap)<=0).filter(before=>{const after=(metrics.stage.requirements.rows||[]).find(row=>row.key===before.key);return after&&num(after.gap)>0;}).map(row=>row.label),auditLevel=regressedRequired.length?'stop':metrics.pass&&!initial.metrics.pass?'checkpoint-recovery':comparison<0?'progress':'hold',audit={level:auditLevel,recipeVerified:(best.actions||[]).length>0,improvesActiveCheckpoint:comparison<0,checkpointPassBefore:initial.metrics.pass,checkpointPassAfter:metrics.pass,beforeEquivalent:num(initial.metrics.stage.legendEquivalent),afterEquivalent:num(metrics.stage.legendEquivalent),rareBefore:num(initial.metrics.rareRemaining),rareAfter:num(metrics.rareRemaining),wispUsed:num(metrics.wispUsed),regressedRequired,evidence:'재료·선위만 검증됨 · 보스 화력은 검증되지 않음'};
  return{basis:'current-tmo-stock-only',guaranteed:true,economyGuarded,criticalRoleGuarded,mode,route,checkpoint:metrics.checkpoint,checkpointPass:metrics.pass,rankVector:metrics.vector.slice(),requirementPriority:[].concat(metrics.requirementPriority||[]),actions:(best.actions||[]).map(action=>({order:action.order,id:action.id,name:action.name,unit:action.unit,solve:action.solve,wispCost:action.wispCost,remainingWisp:action.remainingWisp,reason:action.reason,roles:action.roles,spend:clone(action.solve&&action.solve.consumed)})),afterStock:clone(best.counts),stage:metrics.stage,rareRemaining:metrics.rareRemaining,wispUsed:metrics.wispUsed,tierUse:clone(metrics.tierUse),commonPressure:metrics.commonPressure,storyProxy:metrics.storyProxy,actionCount:metrics.actionCount,materialLedger:ledger,blockers:[...new Set(blockers)],audit,note:(best.actions||[]).length?`${criticalRoleGuarded?'이감 제작 예산을 먼저 예약해 방깎·스턴 과소비 후보를 제외했습니다. ':''}${economyGuarded?'필수 게이트를 닫지 못한 고비용 후보를 제외했습니다. ':''}현재 TMO 패만 사용해 순서대로 제작 가능함을 검증했습니다. 패가 바뀌면 다시 계산합니다.`:'현재 패로 확정할 다음 제작이 없습니다. 미래 드랍을 공짜로 가정하지 않습니다.'};
}

function addAlreadyOwned(counts,owned){
  for(const row of owned||[]){const id=typeof row==='string'?row:row&&row.id;if(!id)continue;counts[id]=num(counts[id])+(typeof row==='string'?1:Math.max(1,num(row.count)||1));}
}

function makeState(input,settings){
  if(!C)throw new Error('ORDCore가 먼저 로드되어야 합니다.');
  const supplied=input&&input.state;
  let state;
  if(supplied&&supplied.db&&supplied.counts){state=Object.assign({},supplied,{counts:clone(supplied.counts),rawCounts:clone(supplied.rawCounts||supplied.counts),currentAbilities:clone(supplied.currentAbilities),percent:clone(supplied.percent)});}
  else{
    const catalog=input&&input.catalog||input&&input.units||root.ORD_TMO_UNITS||[],snapshot=Object.assign({},input&&input.snapshot||{}),counts=clone(snapshot.counts||input&&input.counts);
    if(snapshot.wisp!=null&&!Object.prototype.hasOwnProperty.call(counts,C.WISP_ID))counts[C.WISP_ID]=num(snapshot.wisp);
    snapshot.counts=counts;state=C.normalizeState(catalog,snapshot,settings);
  }
  addAlreadyOwned(state.counts,input&&input.alreadyOwned);state.wisp=num(state.counts[C.WISP_ID]);return state;
}

function commonIdByKey(db,key){
  if(db.byId.has(key)&&C.isCommon(db.byId.get(key)))return key;
  const cleaned=String(key||'').trim();const exact=db.commons.find(u=>nameOf(u)===cleaned);if(exact)return exact.id;
  const fuzzy=db.commons.find(u=>nameOf(u).includes(cleaned)||cleaned.includes(nameOf(u)));return fuzzy&&fuzzy.id||'';
}

function normalizeCommonPolicy(input,state){
  const reserve={},avoid=new Set(),rawReserve=Object.assign({},input&&input.bottleneckReserve||{},input&&input.commonReserve||{});
  for(const [key,value] of Object.entries(rawReserve)){const id=commonIdByKey(state.db,key);if(id)reserve[id]=Math.max(0,num(value));}
  for(const key of [].concat(input&&input.avoidCommons||[],input&&input.bottleneckCommons||[])){const id=commonIdByKey(state.db,key);if(id)avoid.add(id);}
  const usopp=commonIdByKey(state.db,'우솝');if(usopp)avoid.add(usopp);
  const stock=clone(state.counts),reserved={};for(const [id,value] of Object.entries(reserve)){const kept=Math.min(num(stock[id]),value);if(kept>0){stock[id]-=kept;reserved[id]=kept;}}
  const commonValues=state.db.commons.map(u=>num(stock[u.id])).filter(Number.isFinite).sort((a,b)=>a-b),median=commonValues.length?commonValues[Math.floor(commonValues.length/2)]:0;
  return{stock,reserve,reserved,avoid,usopp,median};
}

function fixedUpperIds(state,locks,settings,blueprint){
  const ids=[];for(const row of locks||[])if(row&&row.stage==='upper'&&state.db.byId.has(row.id))ids.push(row.id);
  if(settings.upperPreviewId&&state.db.byId.has(settings.upperPreviewId))ids.push(settings.upperPreviewId);
  if(blueprint&&blueprint.upperId&&state.db.byId.has(blueprint.upperId))ids.push(blueprint.upperId);
  return[...new Set(ids)];
}

function makePlanningState(base,policy){
  const state=Object.assign({},base,{counts:clone(policy.stock)});state.wisp=num(state.counts[C.WISP_ID]);return state;
}

function finalEntries(state,counts){
  const out=[],variantSeen=new Set();
  for(const u of state.db.units){let count=Math.floor(num(counts[u.id]));if(count<=0||!isFinalUnit(u))continue;
    if(C.isUpper(u)){const key=canonicalUpper(u);if(variantSeen.has(key))continue;variantSeen.add(key);count=1;}
    for(let i=0;i<count;i++)out.push(u);
  }
  return out.sort((a,b)=>(C.isUpper(b)?1:0)-(C.isUpper(a)?1:0)||compareText(nameOf(a),nameOf(b))||compareText(a.id,b.id));
}
function ownedFinalBoardCount(state){return finalEntries(state,state&&state.counts||{}).length;}

function emptyFinalSpec(mode){return{source:'최종 전설급 라인업만 집계',mode,main:0,stun:0,slow:0,triggerSlow:0,triggerSlowSources:0,armor:0,triggerArmor:0,singleArmor:0,stackArmor:0,armorBreak:0,single:0,end:0,singleEnd:0,singleEndUnits:0,singleEndExpected:0,singleEndMax:0,singleEndLargest:0,singleEndStable:0,toki:0,boss:0,frenzy:0,bossFrenzy:0,utility:0,subdamage:0,magicDef:0,magicAmp:0,explosionAmp:0,attack:0,triggerAttack:0,speed:0,regen:0,mana:0,deletion:0,total:0};}
function finalOnlySpec(state,counts,mode){let spec=emptyFinalSpec(mode);for(const unit of finalEntries(state,counts)){spec=addUnitRole(spec,unit,mode);spec.total++;}return spec;}

function routeFor(mode,requested){if(mode!=='magic')return'physical';return requested==='dual'?'dual':'singleEnd';}
function targetSlow(settings,mode){const g=C.GOROSEI&&C.GOROSEI[settings.gorosei]||C.GOROSEI&&C.GOROSEI.none||{};return num(mode==='magic'?g.slowMagic:g.slowPhysical)||102;}

function requirementRows(spec,lineup,mode,route,settings,mainUpper){
  const profileSettings=Object.assign({},settings,{magicRoute:route,_resolvedMagicRoute:route,_upperUnit:mainUpper||null}),ctl=C.controlState?C.controlState(spec,mode,profileSettings):null,profile=C.clearProfileDetails?C.clearProfileDetails(spec,mode,profileSettings):null,rows=[];
  const add=(key,label,current,target,weight,required=true,meta={})=>rows.push({key,label,current:round(current,3),target:round(target,3),gap:round(Math.max(0,target-current),3),weight,required,status:current>=target?'ok':current>=target*.7?'warn':'bad',meta});
  if(profile&&Array.isArray(profile.requirements))for(const row of profile.requirements)add(row.key,row.label,row.current,row.target,row.weight,row.required!==false,row.meta||{});
  else{const triggerWeight=num(C&&C.CONTROL_ENVELOPE&&C.CONTROL_ENVELOPE.triggerSafeWeightOne)||.5;add('main','상위 딜러',spec.main,mode==='magic'&&route==='dual'?2:1,120);add('stunBase','최소 0.7 스턴',Math.min(num(C&&C.STUN_BASE_FLOOR)||.7,num(spec.stun)),num(C&&C.STUN_BASE_FLOOR)||.7,110);add('slow','이감 102%',num(spec.slow)+num(spec.triggerSlow)*triggerWeight,targetSlow(settings,mode),95);add('stunFull','충분한 1.5 스턴',spec.stun,1.5,78);}
  if(mode==='physical'&&!rows.some(row=>row.key==='bossFrenzy'))add('bossFrenzy','광보잡',Math.min(num(spec.boss),num(spec.frenzy)),1,95,true);
  if(mode==='magic'&&route==='singleEnd')add('singleEndStable','한 기 누락 후 단일·끝딜 하한',num(spec.singleEndStable),3,34,false,{maximum:num(spec.singleEndMax)});
  if(mode==='magic')add('magicSupport','마딜 증폭·마방깎',num(spec.magicDef)+num(spec.magicAmp)+num(spec.explosionAmp),1,32,false);
  if(mainUpper&&C.upperStrategy){const strategy=C.upperStrategy(mainUpper);for(const need of strategy.needs||[]){if(rows.some(x=>x.key===need.key))continue;add(need.key,need.label,num(spec[need.key]),num(need.target)||1,60,true,{mechanic:true,reason:need.reason});}
    if(strategy.lineSelf==='support'&&!rows.some(x=>x.key==='subdamage'))add('subdamage','보조·방무딜',num(spec.subdamage),1,60,true,{mechanic:true,reason:'라인딜이 부족한 상위라 보조딜이 필수입니다.'});}
  const required=rows.filter(x=>x.required),weight=required.reduce((s,x)=>s+x.weight,0)||1,readiness=Math.round(required.reduce((s,x)=>s+x.weight*Math.min(1,x.current/Math.max(.01,x.target)),0)/weight*100),complete=required.every(x=>x.gap<=0);
  return{rows,deficits:rows.filter(x=>x.gap>0),readiness,complete,control:ctl,route};
}

function routeEvaluationFor(units,requirements,mode,route){
  const requiredMissing=(requirements&&requirements.rows||[]).filter(row=>row.required&&num(row.gap)>0),baseMissing=requiredMissing.filter(row=>row.key!=='singleEndExpected');
  if(mode==='magic'&&route==='singleEnd'){
    const finish=C.evaluateMagicSingleEnd?C.evaluateMagicSingleEnd(units):{status:'insufficient',label:'단끝 자료 없음',note:'단일·끝딜 직접 수치를 확인할 수 없습니다.',stable:0,expected:0,maximum:0,rows:[]},status=baseMissing.length?'insufficient':finish.status,label=baseMissing.length?'핵심 스펙 부족':finish.label,note=baseMissing.length?`${baseMissing.map(row=>row.label).join(' · ')}을 먼저 채워야 합니다.`:finish.note;
    return{route,status,label,note,confirmable:baseMissing.length===0&&finish.status==='stable',staticComplete:requiredMissing.length===0&&finish.status==='stable',baseMissing:baseMissing.map(row=>row.label),finish,controlDependent:finish.status==='control',combatVerified:false};
  }
  const complete=requiredMissing.length===0;return{route,status:complete?'role-only':'insufficient',label:complete?'역할표만 충족 · 제작·화력 미검증':'핵심 역할 부족',note:complete?'정적 역할 합계만 맞습니다. 누적 재료·선택위습과 실제 보스 화력은 별도 검증이 필요합니다.':`${requiredMissing.map(row=>row.label).join(' · ')}을 먼저 채워야 합니다.`,confirmable:complete,staticComplete:complete,roleOnly:complete,combatVerified:false,baseMissing:requiredMissing.map(row=>row.label)};
}

function mainUpperFor(state,counts,fixed){
  for(const id of fixed||[]){const u=state.db.byId.get(id);if(u&&num(counts[u.id])>0)return u;}
  return finalEntries(state,counts).find(u=>C.isUpper(u))||null;
}

function missingNonWisp(solve,prerequisite){
  if(['uncommon','special','rare','other'].some(k=>hasAny(solve.missingByTier&&solve.missingByTier[k])))return true;
  const hard=solve.missingByTier&&solve.missingByTier.hard||{};if(!hasAny(hard))return false;
  if(!prerequisite||!prerequisite.exception)return true;
  const stillRequired=new Set((prerequisite.missing||[]).map(x=>String(x.id)));return Object.entries(hard).some(([id,value])=>num(value)>0&&stillRequired.has(String(id)));
}
function directOrdinaryStats(state,solve){
  return(solve&&solve.direct||[]).reduce((out,item)=>{const unit=state.db.byId.get(String(item&&item.id||'')),needed=num(item&&item.count),owned=Math.min(needed,num(item&&item.owned)),ordinary=unit&&(['rare','special','uncommon'].includes(tierOf(unit))||C.isLegendish(unit));if(ordinary){out.owned+=owned;out.missing+=Math.max(0,needed-owned);}return out;},{owned:0,missing:0});
}
function directOrdinaryMissing(state,solve){return directOrdinaryStats(state,solve).missing;}
function futureDropPending(state,solve,prerequisite){
  // A missing Common is not a free future reward: it consumes a selection
  // wisp unless the user actually receives that Common later. Only a missing
  // ordinary non-Common leaf is treated as a future-drop dependency.
  return directOrdinaryMissing(state,solve)>0||missingNonWisp(solve,prerequisite);
}
function futureWispCharge(state,solve,prerequisite){
  const worstCase=Math.max(0,num(solve&&solve.wispCost)),dropPending=futureDropPending(state,solve,prerequisite),ordinary=directOrdinaryStats(state,solve),anchored=ordinary.owned>0&&ordinary.owned>=ordinary.missing,explicitWisp=(solve&&solve.direct||[]).filter(item=>String(item&&item.id||'')===String(C.WISP_ID)).reduce((total,item)=>total+num(item&&item.count),0);
  // A random future drop is not an owned resource. The former optimistic
  // charge reduced an unanchored future unit to its explicit-wisp line
  // (normally zero), allowing 173 missing Commons to pass as fully funded.
  // Preserve that optimistic number only as diagnostic information; every
  // confirmation and ranking must fund the complete current shortage.
  const optimisticRequired=dropPending?(anchored?worstCase:Math.min(worstCase,explicitWisp)):worstCase,required=worstCase;
  return{required,guaranteedRequired:required,optimisticRequired,worstCase,dropPending,anchored,explicitWisp,directOrdinaryOwned:ordinary.owned,directOrdinaryMissing:ordinary.missing};
}
function effectiveSolve(solve,prerequisite){
  if(!solve||!prerequisite||!prerequisite.exception)return solve;const required=new Set((prerequisite.missing||[]).map(x=>String(x.id))),hard=solve.missingByTier&&solve.missingByTier.hard||{},exempt=new Set(Object.keys(hard).filter(id=>num(hard[id])>0&&!required.has(String(id))));if(!exempt.size)return solve;
  const out=Object.assign({},solve,{missing:clone(solve.missing),missingByTier:Object.assign({},solve.missingByTier,{hard:clone(hard)}),buildNeeded:Object.assign({},solve.buildNeeded,{hard:clone(solve.buildNeeded&&solve.buildNeeded.hard)}),hardMissing:(solve.hardMissing||[]).filter(x=>!exempt.has(String(x.id))),direct:(solve.direct||[]).filter(x=>!exempt.has(String(x.id)))});for(const id of exempt){delete out.missing[id];delete out.missingByTier.hard[id];delete out.buildNeeded.hard[id];}return out;
}

function commonPressure(solve,stock,policy){
  let penalty=0,substituted=0,used=0;
  for(const [id,value] of Object.entries(solve.commonRequired||{})){
    const required=num(value),available=num(stock[id]),short=Math.max(0,required-available),left=Math.max(0,available-required),special=policy.avoid.has(id),scarce=available<=Math.max(1,policy.median*.35);
    substituted+=short;used+=Math.min(required,available);penalty+=short*(special?22:6)+(special&&scarce?Math.min(required,available)*6:0)+(left===0&&special?9:0);
  }
  return{penalty:round(penalty),substituted,used};
}

function roleVector(u,mode){
  const r=C.roleProfile(u),v=C.roleContribution?C.roleContribution(u,mode):{};
  const triggerWeight=num(C&&C.CONTROL_ENVELOPE&&C.CONTROL_ENVELOPE.triggerSafeWeightOne)||.5;
  // Keep the raw trigger axes.  A fixed `triggerSlow * .5` loses the value of
  // adding a second proc source: Nami(42) + Maxim(30) changes the safe weight
  // for the whole 72 from .5 to .65, so Maxim's real marginal gain is 25.8,
  // not 15.  Search scoring resolves that marginal against each node below.
  return Object.assign({},v,{stun:num(r.stun),staticSlow:num(r.slow),triggerSlow:num(r.triggerSlow),triggerSlowSources:num(r.triggerSlow)>0?1:0,slow:num(r.slow)+num(r.triggerSlow)*triggerWeight,armor:num(r.armor),triggerArmor:num(r.triggerArmor),finish:num(r.single)+num(r.end),toki:isToki(u)?1:0,boss:r.boss?1:0,frenzy:r.frenzy?1:0,main:C.isUpper(u)&&(unitFamily(u)===mode||unitFamily(u)==='neutral')?1:0});
}

function allowedCandidate(u,mode,route,settings,state,counts){
  if(!isFinalUnit(u))return false;if(C.isMystic&&C.isMystic(u)||C.isRandom&&C.isRandom(u)||C.isItem&&C.isItem(u))return false;
  const family=unitFamily(u);if(family!==mode&&family!=='neutral')return false;
  // v17.25: 해적선 재료 실보유 여부는 prerequisiteStatus가 엄격히
  // 검사한다. 라운드 50 하드코드는 현재 패의 0선위 방주맥심까지 막았다.
  if(C.isChanged(u)&&settings.currentRound<50&&!settings.allowChangedEarly&&!settings._deferredFuture)return false;
  if(C.isTranscend(u)&&!settings.superKumaOwned)return false;
  if(C.isUpper(u)&&mode==='magic'&&route==='singleEnd'&&family!=='magic')return false;
  if(state&&!prerequisiteStatus(state,u,counts).allowed)return false;return true;
}

function upperCount(state,counts){const seen=new Set();for(const u of state.db.uppers)if(num(counts[u.id])>0)seen.add(canonicalUpper(u));return seen.size;}
function tierCount(state,counts,pred){let n=0;for(const u of state.db.units)if(pred(u))n+=num(counts[u.id]);return n;}

function ruleBlocked(state,node,u,mode,route,settings,fixed){
  if(num(node.counts[u.id])>0)return'이미 보유';
  const pendingFixed=(fixed||[]).filter(id=>num(node.counts[id])<=0);
  if(pendingFixed.length&&!pendingFixed.includes(u.id))return'확정 상위 먼저 제작';
  const maxUpper=maxUpperCount(mode,route,settings),currentUpper=upperCount(state,node.counts);
  if(C.isUpper(u)){
    if(currentUpper>=maxUpper)return'상위 수 제한';
    if(fixed.length&&currentUpper===0&&!fixed.some(id=>canonicalUpper(state.db.byId.get(id))===canonicalUpper(u)))return'확정 상위 우선';
    if(secondUpperBlocked(settings,u,fixed,state))return'확정 2상위 자리';
  }
  if(C.isSeraph(u)&&settings.seraphUsed+tierCount(state,node.counts,C.isSeraph)>=1)return'세라핌 1회 제한';
  if(C.isTranscend(u)&&settings.transcendUsed+tierCount(state,node.counts,C.isTranscend)>=1)return'초월 1회 제한';
  if(C.isChanged(u)&&settings.changedUsed+tierCount(state,node.counts,C.isChanged)>=2)return'변화됨 2회 제한';
  return'';
}

function triggerSlowWeight(sourceCount){
  const envelope=C&&C.CONTROL_ENVELOPE||{};
  return num(sourceCount)>=2?(num(envelope.triggerSafeWeightMulti)||.65):(num(envelope.triggerSafeWeightOne)||.5);
}
function creditedSlow(staticSlow,triggerSlow,sourceCount){
  return round(Math.max(0,num(staticSlow))+Math.max(0,num(triggerSlow))*triggerSlowWeight(sourceCount),3);
}
function marginalSlow(vector,requirements){
  const control=requirements&&requirements.control;
  if(!control||!vector||!Object.prototype.hasOwnProperty.call(vector,'staticSlow')&&!Object.prototype.hasOwnProperty.call(vector,'triggerSlow'))return Math.max(0,num(vector&&vector.slow));
  const beforeStatic=num(control.staticSlow),beforeTrigger=num(control.triggerSlow),beforeSources=Math.max(beforeTrigger>0?1:0,num(control.triggerSlowSources)),addStatic=num(vector&&vector.staticSlow),addTrigger=num(vector&&vector.triggerSlow),addSources=Math.max(addTrigger>0?1:0,num(vector&&vector.triggerSlowSources));
  return round(Math.max(0,creditedSlow(beforeStatic+addStatic,beforeTrigger+addTrigger,beforeSources+addSources)-creditedSlow(beforeStatic,beforeTrigger,beforeSources)),3);
}
function requirementVectorValue(vector,key,requirements){
  return key==='slow'?marginalSlow(vector,requirements):num(vector&&vector[key]);
}
function staticPotential(vector,requirements){
  // Score only the part of a role that closes a live gap. Once 1.5 stun or the
  // active slow ceiling is satisfied, another copy contributes exactly zero.
  // The slow ceiling is 102 normally and 117 for Nasjuro (the target carried by
  // the requirement row), so an arbitrary raw slow total never earns utility.
  let score=0;for(const row of requirements.rows){if(num(row.gap)<=0)continue;const value=requirementVectorValue(vector,row.key,requirements);if(value>0)score+=row.weight*Math.min(1,value/Math.max(.01,row.gap))*(row.required?1:.65);}return score;
}

function excessStun(spec){return round(Math.max(0,num(spec&&spec.stun)-1.5),6);}
function slowRequirement(requirements){return(requirements&&requirements.rows||[]).find(row=>row.key==='slow')||null;}
function excessSlow(requirements){const row=slowRequirement(requirements);return row?round(Math.max(0,num(row.current)-num(row.target)),3):0;}
function controlCapOverflow(stun,slow){return round(Math.max(0,num(stun))*100+Math.max(0,num(slow)),6);}
// 제어 과잉 페널티를 "가볍게" 매길 자격 — 이 유닛이 제어 말고 다른 것도
// 들고 오는가.  들고 온다면 넘치는 스턴·이감은 부수효과라 싸게 치고,
// 아니라면 그 유닛의 존재 이유가 제어 그 자체라 제값을 받는다.
//
// v19: 'main' 과 'magicSupport' 를 목록에서 뺀다(0730 실전 교정).
//   · main 은 "이 유닛이 상위다"라는 부기일 뿐 화력 기여가 아니다.  이것이
//     남아 있으면 모든 상위가 무조건 면제를 받아, 상위가 제어를 얼마나
//     넘치게 채우든 싼값에 통과한다.
//   · magicSupport(마방깎·마뎀증·폭뎀증)는 증폭이라 증폭할 딜이 없으면
//     화력이 아니다.
// 실측: 790H (C)아오키지 초월 = 스턴 1.24 · 이감 70 · 단일/끝딜/보조딜 0 ·
// magicSupport 10.  기존 목록에서는 main=1·magicSupport=10 때문에 면제를
// 받아 이감 70 의 초과분이 ×0.9 로만 계산됐다.  사용자 지적("스턴이 2.5가
// 엄청 오버")과 이감 과투자 지적이 같은 뿌리다.
const NON_CONTROL_ROLE_KEYS=['armor','boss','frenzy','bossFrenzy','toki','single','end','singleEnd','singleEndUnits','singleEndExpected','armorBreak','attack','speed','regen','mana','deletion','subdamage'];
function hasNonControlRole(vector){return NON_CONTROL_ROLE_KEYS.some(key=>num(vector&&vector[key])>0);}
function incrementalStunPenalty(spec,vector){
  // A discrete 0.4~0.6 stun unit may be the only way to cross 1.5, so the
  // crossing unit receives only a light overshoot cost. Additional stun chosen
  // after the target is already met pays the full opportunity-cost penalty.
  const before=num(spec&&spec.stun),value=Math.max(0,num(vector&&vector.stun)),after=before+value,rate=hasNonControlRole(vector)?SIDE_STUN_PENALTY:STUN_OVERSUPPLY_PENALTY,base=before<1.5?Math.max(0,after-1.5)*(hasNonControlRole(vector)?55:160):value*rate,capCross=Math.max(0,after-2.05)-Math.max(0,before-2.05);return base+capCross*800+(before<=2.05&&after>2.05?180:0);
}
function incrementalSlowPenalty(requirements,vector){
  const row=slowRequirement(requirements),value=marginalSlow(vector,requirements);if(!row||value<=0)return 0;const before=num(row.current),after=before+value,cap=num(row.target)+18,useful=Math.max(0,Math.min(value,num(row.gap))),over=Math.max(0,value-useful),rate=hasNonControlRole(vector)?SIDE_SLOW_PENALTY:SLOW_OVERSUPPLY_PENALTY,capCross=Math.max(0,after-cap)-Math.max(0,before-cap);return over*rate+capCross*8+(before<=cap&&after>cap?120:0);
}

function solveHandFit(state,stock,solve,policy){const pressure=commonPressure(solve,stock,policy),used=consumptionTotals([{solve,commonPressure:pressure}],state);return{pressure,fit:handFitMetrics(state,stock,solve.stockAfter,used),used};}
function compareStaticHandRows(a,b){const tierOrder=compareTierBurn(a&&a.handFit,b&&b.handFit);if(tierOrder)return tierOrder;const aw=num(a&&a.solve&&a.solve.wispCost),bw=num(b&&b.solve&&b.solve.wispCost);if(aw!==bw)return aw-bw;return num(b&&b.score)-num(a&&a.score)||compareAffinity(a&&a.unit,b&&b.unit)||compareText(a&&a.unit&&a.unit.id,b&&b.unit&&b.unit.id);}

function buildStaticRows(state,mode,route,settings,policy,fixed,initialReq){
  const all=state.db.legendish.concat(state.db.uppers).filter(u=>allowedCandidate(u,mode,route,settings,state,state.counts)),rows=[];
  for(const u of all){const prerequisite=prerequisiteStatus(state,u,state.counts),solve=effectiveSolve(C.recipeSolve(state.db,u.id,state.counts),prerequisite),vector=roleVector(u,mode),hand=solveHandFit(state,state.counts,solve,policy),pressure=hand.pressure,mandatory=fixed.includes(u.id)?1000:0,blueprintBonus=preferredCount(settings,u)>0?180:0,secondUpperBonus=C.isUpper(u)&&String(settings&&settings._secondUpperKey||'')&&canonicalUpper(u)===String(settings._secondUpperKey)?900:0,blocked=!prerequisite.allowed||missingNonWisp(solve,prerequisite)||solve.wispCost>num(state.counts[C.WISP_ID]);
    const potential=staticPotential(vector,initialReq),resourceScore=num(hand.fit.metrics.score)-(blocked?120:0),score=mandatory+blueprintBonus+secondUpperBonus+potential+resourceScore+(C.isUpper(u)&&initialReq.rows.find(x=>x.key==='main'&&x.gap>0)?90:0);
    rows.push({unit:u,solve,vector,pressure,handFit:hand.fit,score:round(score),resourceScore:round(resourceScore),mandatory,blueprintBonus,secondUpperBonus,blocked,prerequisite});
  }
  rows.sort((a,b)=>b.score-a.score||a.solve.wispCost-b.solve.wispCost||compareAffinity(a.unit,b.unit)||compareText(nameOf(a.unit),nameOf(b.unit))||compareText(a.unit.id,b.unit.id));
  const chosen=[],seen=new Set(),push=row=>{if(row&&!seen.has(row.unit.id)){seen.add(row.unit.id);chosen.push(row);}};
  for(const id of fixed)push(rows.find(x=>x.unit.id===id));
  // 탐색 폭 때문에 패 소모 최상 후보가 후보군 밖으로 밀리지 않도록
  // 네 등급 사전식 상위권을 먼저 확보합니다.
  for(const row of rows.slice().sort(compareStaticHandRows).slice(0,8))push(row);
  // Preserve several non-upper specialists for every mandatory role before
  // generic score rows fill the fixed candidate cap. Without this, physical
  // hands could keep only high-stun armor options and omit a buildable Caesar-
  // class armor finisher, making a valid lower-cost nine appear impossible.
  for(const req of initialReq.rows.filter(row=>row.required&&num(row.gap)>0&&row.key!=='main')){
    const lean=rows.filter(row=>!C.isUpper(row.unit)&&requirementVectorValue(row.vector,req.key,initialReq)>0).sort((a,b)=>{
      // Warped routes are always eligible, but never mandatory. Keep the
      // bounded lean quota useful by admitting cheaper specialists first;
      // warped rows still compete normally in generic score-ranked quotas.
      const aw=C.requiresWarpedCraft&&C.requiresWarpedCraft(state.db,a.unit,state.counts)?1:0,bw=C.requiresWarpedCraft&&C.requiresWarpedCraft(state.db,b.unit,state.counts)?1:0;if(aw!==bw)return aw-bw;
      const useful=row=>Math.min(num(req.gap),requirementVectorValue(row.vector,req.key,initialReq)),au=useful(a),bu=useful(b);if(au!==bu)return bu-au;
      const ac=num(a.vector.stun)+num(a.vector.slow)/102,bc=num(b.vector.stun)+num(b.vector.slow)/102;if(ac!==bc)return ac-bc;
      return num(b.resourceScore)-num(a.resourceScore)||compareAffinity(a.unit,b.unit)||compareText(a.unit.id,b.unit.id);
    });
    for(const row of lean.slice(0,4))push(row);
  }
  for(const row of rows.slice(0,10))push(row);
  // Guarantee candidates for every clear requirement before generic diversity
  // fills the cap; this is especially important for the 3~4 single/end units.
  const orderedRequirements=initialReq.rows.slice().sort((a,b)=>(a.key==='singleEndExpected'?-1:0)-(b.key==='singleEndExpected'?-1:0));for(const req of orderedRequirements){const ranked=rows.filter(x=>requirementVectorValue(x.vector,req.key,initialReq)>0).sort((a,b)=>requirementVectorValue(b.vector,req.key,initialReq)-requirementVectorValue(a.vector,req.key,initialReq)||b.score-a.score),limit=req.key==='singleEndExpected'?8:3;if(req.key==='singleEndExpected')for(const row of ranked.filter(x=>!C.isUpper(x.unit)).slice(0,8))push(row);for(const row of ranked.slice(0,limit))push(row);}
  // Keep low-stun role alternatives inside the bounded beam. Otherwise an
  // early minimum-stun gap can fill the entire shortlist with stunners, leaving
  // no sensible damage/buffer/armor candidates for slots 6~9 after 1.5 is met.
  // v19.9.8: 최소선 0.7 상향 — targetStun 밴드 앵커도 코어 상수를 따른다.
  const STUN_FLOOR=num(C&&C.STUN_BASE_FLOOR)||.7;
  const lowStun=rows.filter(x=>!C.isUpper(x.unit)&&num(x.vector.stun)<=.05).sort((a,b)=>staticPotential(b.vector,initialReq)-staticPotential(a.vector,initialReq)||num(b.resourceScore)-num(a.resourceScore)||compareAffinity(a.unit,b.unit)||compareText(a.unit.id,b.unit.id));for(const row of lowStun.slice(0,9))push(row);
  const lightStun=rows.filter(x=>!C.isUpper(x.unit)&&num(x.vector.stun)>.05&&num(x.vector.stun)<=.35).sort((a,b)=>staticPotential(b.vector,initialReq)-staticPotential(a.vector,initialReq)||num(b.resourceScore)-num(a.resourceScore)||compareAffinity(a.unit,b.unit)||compareText(a.unit.id,b.unit.id));for(const row of lightStun.slice(0,4))push(row);
  const targetStun=rows.filter(x=>!C.isUpper(x.unit)&&num(x.vector.stun)>.35&&num(x.vector.stun)<=1).sort((a,b)=>staticPotential(b.vector,initialReq)-staticPotential(a.vector,initialReq)||Math.abs(num(a.vector.stun)-STUN_FLOOR)-Math.abs(num(b.vector.stun)-STUN_FLOOR)||compareAffinity(a.unit,b.unit)||compareText(a.unit.id,b.unit.id));for(const row of targetStun.slice(0,5))push(row);
  const combinedRole=rows.filter(x=>!C.isUpper(x.unit)).sort((a,b)=>staticPotential(b.vector,initialReq)-staticPotential(a.vector,initialReq)||num(b.resourceScore)-num(a.resourceScore)||compareAffinity(a.unit,b.unit)||compareText(a.unit.id,b.unit.id));for(const row of combinedRole.slice(0,12))push(row);
  for(const row of rows.filter(x=>!C.isUpper(x.unit)).slice(0,10))push(row);
  for(const row of rows.filter(x=>C.isUpper(x.unit)).slice(0,5))push(row);
  for(const row of rows.slice().sort(compareStaticHandRows).slice(0,7))push(row);
  for(const row of rows.slice().sort((a,b)=>a.solve.wispCost-b.solve.wispCost||b.score-a.score).slice(0,5))push(row);
  return{rows,shortlist:chosen.slice(0,DEFAULTS.candidateCap)};
}

function consumptionTotals(actions,state){
  const out={rare:0,special:0,uncommon:0,common:0,wisp:0,commonPressure:0,byTier:{},consumedById:{},consumedByTier:{rare:{},special:{},uncommon:{},common:{}},commonRequired:{},commonMissing:{}};
  for(const action of actions){out.wisp+=num(action.solve.wispCost);out.commonPressure+=num(action.commonPressure&&action.commonPressure.penalty);for(const [id,value] of Object.entries(action.solve.consumed||{})){const tier=tierOf(state.db.byId.get(id)),v=num(value);out.byTier[tier]=num(out.byTier[tier])+v;out.consumedById[id]=num(out.consumedById[id])+v;if(out.consumedByTier[tier])out.consumedByTier[tier][id]=num(out.consumedByTier[tier][id])+v;if(Object.prototype.hasOwnProperty.call(out,tier))out[tier]+=v;}for(const [id,value] of Object.entries(action.solve.commonRequired||{}))out.commonRequired[id]=num(out.commonRequired[id])+num(value);for(const [id,value] of Object.entries(action.solve.lowestMissing||{}))out.commonMissing[id]=num(out.commonMissing[id])+num(value);}
  return out;
}

// 보조유닛 자원 우선순위는 가중합이 아니라 등급별 사전식 비교입니다.
// 희귀 한 장의 차이는 특별/안흔/흔함 몇 장으로도 뒤집지 않으며, 네
// 등급의 실제 보유 패 소비량이 모두 같을 때만 선택 위습을 비교합니다.
function tierBurnVector(source){
  if(Array.isArray(source))return HAND_TIERS.map((tier,index)=>num(source[index]));
  const value=source||{},metrics=value.metrics||value,tiers=value.tiers||{};
  return HAND_TIERS.map(tier=>{
    const direct=metrics[`${tier}Spent`];if(direct!=null)return num(direct);
    const row=tiers[tier]||{},summary=row.summary||row;
    if(summary.assigned!=null)return num(summary.assigned);
    if(summary.spent!=null||summary.reserved!=null)return num(summary.spent)+num(summary.reserved);
    return num(value[tier]);
  });
}
function compareTierBurn(a,b,includeRare=true){
  const left=tierBurnVector(a),right=tierBurnVector(b),start=includeRare?0:1;
  for(let index=start;index<HAND_TIERS.length;index++)if(left[index]!==right[index])return right[index]-left[index];
  return 0;
}
function solveTierBurn(state,solve){
  const out={rare:0,special:0,uncommon:0,common:0};
  for(const [id,value] of Object.entries(solve&&solve.consumed||{})){const tier=tierOf(state.db.byId.get(id));if(Object.prototype.hasOwnProperty.call(out,tier))out[tier]+=num(value);}
  return out;
}

function handTierUnits(state,tier){if(!state||!state.db)return[];let tiers=HAND_TIER_UNIT_CACHE.get(state.db);if(!tiers){tiers={rare:[],special:[],uncommon:[],common:[]};for(const unit of state.db.units){const key=tierOf(unit);if(tiers[key])tiers[key].push(unit);}HAND_TIER_UNIT_CACHE.set(state.db,tiers);}return tiers[tier]||[];}
function handInventoryBase(state,initial){if(initial&&typeof initial==='object'){const cached=HAND_INVENTORY_CACHE.get(initial);if(cached&&cached.db===state.db)return cached;}const tiers={};for(const tier of HAND_TIERS){let total=0,types=0;for(const unit of handTierUnits(state,tier)){const value=Math.max(0,num(initial&&initial[unit.id]));total+=value;if(value>0)types++;}tiers[tier]={total,types};}const value={db:state.db,tiers};if(initial&&typeof initial==='object')HAND_INVENTORY_CACHE.set(initial,value);return value;}
function handFitMetrics(state,initial,after,used){
  const tiers={},base=handInventoryBase(state,initial),metrics={score:0,lowerScore:0,rareScore:0,spent:0,usedTypes:0,clearedTypes:0,weightedSpent:0,weightedUsedTypes:0,weightedClearedTypes:0,wispSubstitute:num(used&&used.wisp),commonSubstituted:sum(used&&used.commonMissing),commonPressure:num(used&&used.commonPressure)};
  for(const tier of HAND_TIERS){const weights=HAND_FIT_WEIGHTS[tier],consumed=used&&used.consumedByTier&&used.consumedByTier[tier]||{},beforeTotal=num(base.tiers[tier].total),initialTypes=num(base.tiers[tier].types);let spent=0,usedTypes=0,clearedTypes=0;
    for(const [id,value] of Object.entries(consumed)){const before=Math.max(0,num(initial&&initial[id])),use=Math.min(before,Math.max(0,num(value)));if(use<=0)continue;spent+=use;usedTypes++;if(num(after&&after[id])<=0)clearedTypes++;}const remaining=Math.max(0,beforeTotal-spent);
    const utilization=beforeTotal>0?spent/beforeTotal:0,typeCoverage=initialTypes>0?usedTypes/initialTypes:0,clearCoverage=initialTypes>0?clearedTypes/initialTypes:0,tierScore=spent*weights.spent+usedTypes*weights.usedType+clearedTypes*weights.clearedType+utilization*weights.utilization+typeCoverage*weights.utilization*.6+clearCoverage*weights.utilization;
    tiers[tier]={initial:round(beforeTotal,3),used:round(spent,3),spent:round(spent,3),remaining:round(remaining,3),initialTypes,usedTypes,clearedTypes,utilization:round(utilization,4),typeCoverage:round(typeCoverage,4),clearCoverage:round(clearCoverage,4),score:round(tierScore,3)};metrics[`${tier}Spent`]=round(spent,3);metrics.spent+=spent;metrics.usedTypes+=usedTypes;metrics.clearedTypes+=clearedTypes;metrics.weightedSpent+=spent*weights.spent;metrics.weightedUsedTypes+=usedTypes*weights.usedType;metrics.weightedClearedTypes+=clearedTypes*weights.clearedType;if(tier==='rare')metrics.rareScore=tierScore;else metrics.lowerScore+=tierScore;
  }
  // Missing commons and selection wisps are a real cost; large raw Common
  // consumption alone must never overwhelm type coverage or a Rare clear.
  metrics.lowerScore-=metrics.wispSubstitute*2.7+metrics.commonSubstituted*6+metrics.commonPressure;
  metrics.score=metrics.rareScore+metrics.lowerScore;for(const key of Object.keys(metrics))metrics[key]=round(metrics[key],4);return{tiers,metrics};
}

function compareHandFit(a,b,includeRare=true){const left=a||{},right=b||{};
  const tierOrder=compareTierBurn(left,right,includeRare);if(tierOrder)return tierOrder;
  // 네 등급의 실제 소비량이 완전히 같을 때만 선택 위습이 적은 쪽을
  // 고릅니다. 없는 일반 재료와 후속 드랍은 소비량으로 부풀리지 않습니다.
  if(num(left.wispSubstitute)!==num(right.wispSubstitute))return num(left.wispSubstitute)-num(right.wispSubstitute);
  if(includeRare&&num(left.rareScore)!==num(right.rareScore))return num(right.rareScore)-num(left.rareScore);
  if(num(left.lowerScore)!==num(right.lowerScore))return num(right.lowerScore)-num(left.lowerScore);
  if(num(left.weightedClearedTypes)!==num(right.weightedClearedTypes))return num(right.weightedClearedTypes)-num(left.weightedClearedTypes);
  if(num(left.weightedUsedTypes)!==num(right.weightedUsedTypes))return num(right.weightedUsedTypes)-num(left.weightedUsedTypes);
  if(num(left.commonSubstituted)!==num(right.commonSubstituted))return num(left.commonSubstituted)-num(right.commonSubstituted);
  if(num(left.commonPressure)!==num(right.commonPressure))return num(left.commonPressure)-num(right.commonPressure);
  return num(right.weightedSpent)-num(left.weightedSpent);
}

function evaluateNode(state,node,mode,route,settings,fixed,target){
  const lineup=finalEntries(state,node.counts),main=mainUpperFor(state,node.counts,fixed),req=requirementRows(node.spec,lineup,mode,route,settings,main),used=consumptionTotals(node.actions,state),count=lineup.length,countCredit=Math.min(target,count)/target,deficitPenalty=req.deficits.filter(x=>x.required).reduce((s,x)=>s+x.weight*x.gap/Math.max(.01,x.target),0),overshoot=Math.max(0,count-target);
  const stunExcess=excessStun(node.spec),slowExcess=excessSlow(req),requested=settings&&settings._preferredLineupKeys||{},blueprintMatched=multisetMatched(requested,entryKeyCounts(lineup)),overlap=lineupMaterialOverlap(state,lineup),handFit=handFitMetrics(state,state.counts,node.counts,used),rareClearedTypes=handFit.tiers.rare.clearedTypes,rareUsedTypes=handFit.tiers.rare.usedTypes;
  let score=req.readiness*18+countCredit*920+(req.complete?280:0)+(count>=target?260:0)+handFit.metrics.score-deficitPenalty*.7-overshoot*80-stunExcess*STUN_OVERSUPPLY_PENALTY-slowExcess*SLOW_OVERSUPPLY_PENALTY-overlap.penalty+blueprintMatched*120;
  if(fixed.length&&!fixed.some(id=>num(node.counts[id])>0))score-=420;
  // v19: 직전 라운드에 계획했던 상위를 이 파티가 몇 기 유지하는가.  점수에는
  // 넣지 않는다 — nodeCompare 의 후단 타이브레이크로만 쓴다.
  const stickyUpperHeld=lineup.reduce((total,entry)=>total+stickyUpperHold(state,settings,entry),0);
  const prescribedPairHeld=lineup.reduce((total,entry)=>total+prescribedPairHold(state,settings,entry),0);
  node.lineup=lineup;node.mainUpper=main;node.requirements=req;node.projectedCount=count;node.complete=req.complete&&count>=target;node.score=round(score);node.requiredDebt=round(deficitPenalty,6);node.used=used;node.handFit=handFit;node.excessStun=stunExcess;node.excessSlow=slowExcess;node.blueprintMatched=blueprintMatched;node.stickyUpperHeld=stickyUpperHeld;node.prescribedPairHeld=prescribedPairHeld;node.materialOverlap=overlap;node.rareClearedTypes=rareClearedTypes;node.rareUsedTypes=rareUsedTypes;node.memoSupport=curatedLineupEvidence(lineup);return node;
}

function quickRank(state,row,node,fixed,policy){
  // Static rows are built from the opening hand. Shared materials may already
  // have been consumed, so every beam node must reprice the candidate from its
  // current stock instead of reusing an obsolete 0-wisp solve.
  const prerequisite=prerequisiteStatus(state,row.unit,node.counts),solve=effectiveSolve(C.recipeSolve(state.db,row.unit.id,node.counts),prerequisite);if(!prerequisite.allowed||missingNonWisp(solve,prerequisite)||solve.wispCost>node.wisp)return-Infinity;
  const hand=solveHandFit(state,node.counts,solve,policy),gain=staticPotential(row.vector,node.requirements),resource=num(hand.fit.metrics.score)*.16+sum(solve.rareUse)*5-solve.wispCost*8-hand.pressure.penalty,mandatory=(fixed||[]).includes(row.unit.id)?1000:num(row.mandatory),blueprint=num(row.blueprintBonus),memo=num(curatedSupportEvidence(row.unit).affinity);
  return gain+resource+mandatory+blueprint+memo*12-incrementalStunPenalty(node.spec,row.vector)-incrementalSlowPenalty(node.requirements,row.vector)-candidateOverlapPenalty(state,row.unit,node.lineup,node.counts)*OVERLAP_HEURISTIC_WEIGHT;
}
function diverseBranchRows(ranked,requirements,baseLimit){
  const chosen=[],seen=new Set(),push=row=>{if(row&&!seen.has(row.unit.id)){seen.add(row.unit.id);chosen.push(row);}};for(const row of ranked.slice(0,baseLimit))push(row);
  let combined=null,combinedValue=0;for(const row of ranked){const value=staticPotential(row.vector,requirements);if(value>combinedValue){combined=row;combinedValue=value;}}push(combined);
  // Always branch once toward a real non-control role with the smallest extra
  // stun/slow load. This keeps a lean armor/support continuation alive after
  // the displayed requirements round to 100%, instead of filling every beam
  // lane with an expensive control-heavy Warped option.
  let lean=null,leanControl=Infinity;for(const row of ranked){if(!hasNonControlRole(row.vector))continue;const control=num(row.vector.stun)*100+marginalSlow(row.vector,requirements);if(control<leanControl){lean=row;leanControl=control;}}push(lean);
  let lowPressure=null,pressure=Infinity;for(const row of ranked){const value=num(row.pressure&&row.pressure.penalty);if(value<pressure){lowPressure=row;pressure=value;}}push(lowPressure);
  for(const req of requirements&&requirements.rows||[]){if(!req.required||num(req.gap)<=0)continue;let best=null,bestValue=0;for(const row of ranked){const value=Math.min(num(req.gap),Math.max(0,requirementVectorValue(row.vector,req.key,requirements)));if(value>bestValue){best=row;bestValue=value;}}push(best);}
  return chosen.slice(0,Math.max(baseLimit,8));
}

function actionReason(before,after,u){
  const closed=[];for(const row of before.deficits){const next=after.rows.find(x=>x.key===row.key);if(next&&row.gap>0&&next.gap<=0)closed.push(row.label);}
  if(closed.length)return`${closed.join(' · ')} 충족`;
  const improved=before.deficits.map(row=>{const next=after.rows.find(x=>x.key===row.key);return next?{label:row.label,gain:row.gap-next.gap}:null;}).filter(x=>x&&x.gain>0).sort((a,b)=>b.gain-a.gain)[0];
  return improved?`${improved.label} +${round(improved.gain)}`:`최종 ${displayNameOf(u)} 슬롯 및 재료 소진`;
}

function expandNode(state,node,row,mode,route,settings,fixed,target,policy){
  const u=row.unit,block=ruleBlocked(state,node,u,mode,route,settings,fixed);if(block)return null;
  const prerequisite=prerequisiteStatus(state,u,node.counts),solve=effectiveSolve(C.recipeSolve(state.db,u.id,node.counts),prerequisite);if(!prerequisite.allowed||missingNonWisp(solve,prerequisite)||solve.wispCost>node.wisp)return null;
  const pressure=commonPressure(solve,node.counts,policy),after=clone(solve.stockAfter),remaining=Math.max(0,node.wisp-solve.wispCost);after[C.WISP_ID]=remaining;after[u.id]=num(after[u.id])+1;const nextSpec=finalOnlySpec(state,after,mode),nextLineup=finalEntries(state,after);if(nextLineup.length>target||introducesLineageConflict(state,node.lineup,nextLineup))return null;const main=mainUpperFor(state,after,fixed),afterReq=requirementRows(nextSpec,nextLineup,mode,route,settings,main),order=node.actions.length+1;
  const action={order,id:u.id,name:displayNameOf(u),unit:u,solve,spend:clone(solve.consumed),wispCost:solve.wispCost,afterStock:clone(after),remainingWisp:remaining,rareSpend:clone(solve.rareUse),commonRequired:clone(solve.commonRequired),commonSubstituted:clone(solve.lowestMissing),commonPressure:pressure,roles:C.summarizeRoles?C.summarizeRoles({role:C.roleProfile(u)},mode):'',reason:actionReason(node.requirements,afterReq,u)};
  return evaluateNode(state,{counts:after,wisp:remaining,spec:nextSpec,actions:node.actions.concat(action)},mode,route,settings,fixed,target);
}

function nodeSignature(node,state){
  // The same action multiset and wisp remainder can leave different scarce
  // cards when recipes overlap.  Collapsing those states discards a valid
  // later construction order, so the remaining relevant inventory is part of
  // the signature as well.
  const stock=Object.entries(node&&node.counts||{}).filter(([id,value])=>{if(num(value)<=0)return false;if(!state||!state.db)return id===String(C.WISP_ID);const unit=state.db.byId.get(id),tier=tierOf(unit);return id===String(C.WISP_ID)||HAND_TIERS.includes(tier)||tier==='hard'||C.isItem&&C.isItem(unit)||isFinalUnit(unit);}).sort((a,b)=>compareText(a[0],b[0])).map(([id,value])=>`${id}:${round(value,3)}`).join(',');
  return node.actions.map(x=>x.id).sort().join('|')+`@${node.wisp}#${stock}`;
}
function requirementPriorityVector(requirements){
  const rows=requirements&&requirements.rows||[],byKey=new Map(rows.filter(row=>row.required).map(row=>[row.key,row])),route=requirements&&requirements.route||'physical',
  // v19.9.8(최소 스턴 0.7 상향): 스턴풀을 늘 마지막 그룹으로 미루는 이
  // 벡터가 빔 가지치기를 지배하므로, 최소선이 오르자 "낮은 스턴 상위 +
  // 스턴 전설 2기"로만 완성되는 패의 경로가 조기 탈락해 완성 가능한 판을
  // 미완성으로 내놓았다(full_hand_fit 픽스처 실측).  1차 탐색이 미완성일
  // 때만 스턴을 생존 그룹에 합쳐 다시 찾는 구제 모드를 둔다 — 화면의
  // fillLast(마지막에 반드시 채움) 순서는 그대로고, 탐색만 미리 자금을
  // 댄다.  "마지막"은 순서지 포기가 아니다.
  groups=SEARCH_STUN_EARLY?(route==='physical'?[['main'],['armor','stunBase','stunFull'],['slow','bossFrenzy']]:route==='dual'?[['main','stunBase','stunFull'],['slow'],['bossFrenzy','toki']]:[['main'],['bossFrenzy','stunBase','stunFull'],['slow'],['singleEndExpected']]):(route==='physical'?[['main'],['armor','stunBase'],['slow','bossFrenzy'],['stunFull']]:route==='dual'?[['main','stunBase'],['slow'],['bossFrenzy','toki'],['stunFull']]:[['main'],['bossFrenzy','stunBase'],['slow'],['singleEndExpected'],['stunFull']]),vector=[];
  for(const keys of groups){const selected=keys.map(key=>byKey.get(key)).filter(Boolean),missed=selected.filter(row=>num(row.gap)>0).length,debt=selected.reduce((total,row)=>total+num(row.gap)/Math.max(.01,num(row.target)),0);vector.push(missed,round(debt,6));}return vector;
}
function comparePriorityVectors(a,b){const left=a||[],right=b||[],length=Math.max(left.length,right.length);for(let index=0;index<length;index++){const av=num(left[index]),bv=num(right[index]);if(av!==bv)return av-bv;}return 0;}
function nodeCompare(a,b){
  const ac=a.projectedCount>=a.target,bc=b.projectedCount>=b.target;if(a.complete!==b.complete)return b.complete-a.complete;if(a.requirements.complete!==b.requirements.complete)return b.requirements.complete-a.requirements.complete;if(ac!==bc)return Number(bc)-Number(ac);
  // Clear validity and the number of sequentially buildable final units always
  // win. Hand fit is considered only among equally valid continuations.
  const priorityOrder=comparePriorityVectors(requirementPriorityVector(a.requirements),requirementPriorityVector(b.requirements));if(priorityOrder)return priorityOrder;
  if(a.requirements.readiness!==b.requirements.readiness)return b.requirements.readiness-a.requirements.readiness;
  // Readiness is intentionally displayed as an integer, but using that rounded
  // value alone made a 2~4 armor gap tie with a genuinely complete direction.
  // Keep the exact weighted debt as the next clear-validity tie-break so a
  // narrow beam does not discard the only non-warped route that can close it.
  if(num(a.requiredDebt)!==num(b.requiredDebt))return num(a.requiredDebt)-num(b.requiredDebt);
  if(num(a.projectedCount)!==num(b.projectedCount))return num(b.projectedCount)-num(a.projectedCount);
  // Once the survival sheet is equal, spend useful Rares but do not reward a
  // route merely for burning more lower-tier material.  Shared Uncommon/Common
  // bottlenecks and lineage overlap killed otherwise "efficient" blueprints.
  const aControlOverflow=controlCapOverflow(a.excessStun,a.excessSlow),bControlOverflow=controlCapOverflow(b.excessStun,b.excessSlow);if(aControlOverflow!==bControlOverflow)return aControlOverflow-bControlOverflow;
  if(num(a.used&&a.used.rare)!==num(b.used&&b.used.rare))return num(b.used&&b.used.rare)-num(a.used&&a.used.rare);
  if(num(a.materialOverlap&&a.materialOverlap.penalty)!==num(b.materialOverlap&&b.materialOverlap.penalty))return num(a.materialOverlap&&a.materialOverlap.penalty)-num(b.materialOverlap&&b.materialOverlap.penalty);
  if(num(a.used&&a.used.commonPressure)!==num(b.used&&b.used.commonPressure))return num(a.used&&a.used.commonPressure)-num(b.used&&b.used.commonPressure);
  if(num(a.used&&a.used.wisp)!==num(b.used&&b.used.wisp))return num(a.used&&a.used.wisp)-num(b.used&&b.used.wisp);
  if(num(a.rareClearedTypes)!==num(b.rareClearedTypes))return num(b.rareClearedTypes)-num(a.rareClearedTypes);
  if(num(a.rareUsedTypes)!==num(b.rareUsedTypes))return num(b.rareUsedTypes)-num(a.rareUsedTypes);
  const handOrder=compareHandFit(a.handFit&&a.handFit.metrics,b.handFit&&b.handFit.metrics,false);if(handOrder)return handOrder;
  const lowerTierOrder=compareTierBurn(a.used,b.used,false);if(lowerTierOrder)return lowerTierOrder;
  if(num(a.blueprintMatched)!==num(b.blueprintMatched))return num(b.blueprintMatched)-num(a.blueprintMatched);
  // v19: 여기까지 같으면 남은 차이는 타이브레이크뿐이다 — 직전 라운드에
  // 만들던 상위를 유지하는 쪽을 고른다(만들다 바뀌면 재료가 낭비된다).
  if(num(a.stickyUpperHeld)!==num(b.stickyUpperHeld))return num(b.stickyUpperHeld)-num(a.stickyUpperHeld);
  // v19.7.1(외부 감사 ④): 처방 추천 2상위 — 관성 다음 순번의 후단
  // 타이브레이크.  필수 역할·경제성·관성이 전부 같을 때만 처방 페어가 이긴다.
  if(num(a.prescribedPairHeld)!==num(b.prescribedPairHeld))return num(b.prescribedPairHeld)-num(a.prescribedPairHeld);
  if(num(a.excessStun)!==num(b.excessStun))return num(a.excessStun)-num(b.excessStun);
  if(num(a.excessSlow)!==num(b.excessSlow))return num(a.excessSlow)-num(b.excessSlow);
  if(num(a.memoSupport&&a.memoSupport.score)!==num(b.memoSupport&&b.memoSupport.score))return num(b.memoSupport&&b.memoSupport.score)-num(a.memoSupport&&a.memoSupport.score);
  return b.score-a.score||compareText(a.actions.map(x=>x.id).join('|'),b.actions.map(x=>x.id).join('|'));
}

function boundedBeam(nodes,limit){
  const sorted=(nodes||[]).slice().sort(nodeCompare),picked=sorted.slice(0,limit);if(!picked.length)return picked;
  // Keep one path that has accumulated the least scarce-common pressure. A
  // beam chosen only by role/rare ties can otherwise discard every low-Usopp
  // continuation early and later compensate dozens of missing copies by wisp.
  const low=sorted.slice().sort((a,b)=>num(a.used&&a.used.commonPressure)-num(b.used&&b.used.commonPressure)||nodeCompare(a,b))[0];if(low&&!picked.includes(low)){picked[picked.length-1]=low;picked.sort(nodeCompare);}return picked;
}

function searchRoute(state,mode,route,settings,policy,fixed){
  const target=settings.targetSquadCount,liveSpec=C.currentSpec(state,mode,Object.assign({},settings,{_upperUnit:mainUpperFor(state,state.counts,fixed)})),baseSpec=finalOnlySpec(state,state.counts,mode),initial=evaluateNode(state,{counts:clone(state.counts),wisp:num(state.counts[C.WISP_ID]),spec:baseSpec,actions:[]},mode,route,settings,fixed,target);initial.target=target;
  const staticData=buildStaticRows(state,mode,route,settings,policy,fixed,initial.requirements),maxDepth=Math.min(DEFAULTS.maxDepth,Math.max(3,target-initial.projectedCount+4));
  const runBeam=()=>{
    let beam=[initial];const found=[];
    for(let depth=0;depth<maxDepth;depth++){
      const children=[];
      for(const node of beam){if(node.complete)continue;const ranked=staticData.shortlist.filter(row=>!num(node.counts[row.unit.id])&&!ruleBlocked(state,node,row.unit,mode,route,settings,fixed)).map(row=>({row,rank:quickRank(state,row,node,fixed,policy)})).filter(item=>Number.isFinite(item.rank)).sort((a,b)=>b.rank-a.rank||compareAffinity(a.row.unit,b.row.unit)||compareText(a.row.unit.id,b.row.unit.id)).map(item=>item.row),branches=diverseBranchRows(ranked,node.requirements,DEFAULTS.branchWidth);
        for(const row of branches){const next=expandNode(state,node,row,mode,route,settings,fixed,target,policy);if(!next)continue;next.target=target;children.push(next);}
      }
      if(!children.length)break;const dedup=new Map();for(const node of children){const key=nodeSignature(node,state),old=dedup.get(key);if(!old||nodeCompare(node,old)<0)dedup.set(key,node);}beam=boundedBeam([...dedup.values()],DEFAULTS.beamWidth);found.push(...beam);if(beam.every(x=>x.complete))break;
    }
    return found;
  };
  let archive=[initial].concat(runBeam());
  // v19.9.8(스턴 최소선 0.7 상향): 스턴풀은 화면 순서상 마지막(fillLast)이라
  // 가지치기 비교에서도 늘 뒤로 밀리는데, 최소선이 오르자 "낮은 스턴 상위 +
  // 스턴 전설 여러 기"로만 1.5가 닫히는 패의 경로가 빔에서 조기 탈락해
  // 완성 가능한 판을 미완성으로 내놓았다.  1차가 미완성이면 스턴을 생존
  // 그룹에 합친 우선순위로 한 번 더 찾는다 — "마지막에 반드시 채움"의
  // '반드시'를 탐색이 보증한다.  구제안이 완성이면 nodeCompare 의 첫 키
  // (complete)가 알아서 그쪽을 고른다.
  if(!archive.some(node=>node.complete)){
    SEARCH_STUN_EARLY=true;
    try{archive=archive.concat(runBeam());}
    finally{SEARCH_STUN_EARLY=false;}
  }
  archive.sort(nodeCompare);return{best:archive[0],alternates:archive.filter(x=>nodeSignature(x,state)!==nodeSignature(archive[0],state)).slice(0,5),staticData,route,liveSpec};
}

function sameKeyCounts(a,b){const keys=new Set(Object.keys(a||{}).concat(Object.keys(b||{})));for(const key of keys)if(num(a&&a[key])!==num(b&&b[key]))return false;return true;}
function fulfilledKeyCounts(requested,remaining){const out={};for(const [key,value] of Object.entries(requested||{}))out[key]=Math.max(0,num(value)-num(remaining&&remaining[key]));return out;}
function protectsFulfilled(lineup,fulfilled){const actual=entryKeyCounts(lineup);return Object.entries(fulfilled||{}).every(([key,value])=>num(actual[key])>=num(value));}

// A confirmed party is a preference, not a brittle permanent lock. We first
// try every possible construction order using the entire current wisp stock.
// Only when no exact order can keep all nine final units and close the clear
// requirements do we release slots to the normal adaptive search.
function searchExactBlueprint(state,mode,route,settings,policy,fixed,blueprint,sharedStaticData){
  const target=settings.targetSquadCount,requestedIds=(blueprint&&blueprint.lineupIds||[]).slice(0,target),requested=lineupKeyCounts(state,requestedIds),owned=finalEntries(state,state.counts),ownedKeys=entryKeyCounts(owned),matchedOwnedKeys={},liveSpec=C.currentSpec(state,mode,Object.assign({},settings,{_upperUnit:mainUpperFor(state,state.counts,fixed)}));
  if(requestedIds.length!==target)return{success:false,reason:`확정 파티가 ${requestedIds.length}/${target}기라 정확 유지할 수 없습니다.`,allWispFeasible:false};
  for(const [key,value] of Object.entries(ownedKeys))matchedOwnedKeys[key]=Math.min(num(value),num(requested[key]));
  const remainingByKey=clone(requested);for(const [key,value] of Object.entries(matchedOwnedKeys))remainingByKey[key]=Math.max(0,num(remainingByKey[key])-num(value));
  const remaining=[];const preferredOrder=[].concat(blueprint.buildOrderIds||[],requestedIds);for(const id of preferredOrder){const u=state.db.byId.get(id),key=u&&lineupKey(u);if(!u||num(remainingByKey[key])<=0)continue;remaining.push(u);remainingByKey[key]--;}
  for(const id of requestedIds){const u=state.db.byId.get(id),key=u&&lineupKey(u);if(!u||num(remainingByKey[key])<=0)continue;remaining.push(u);remainingByKey[key]--;}
  if(remaining.length+sum(matchedOwnedKeys)!==target)return{success:false,reason:'확정 파티 유닛 ID 또는 활성 상위 형태를 확인할 수 없어 가변 재설계합니다.',allWispFeasible:false};
  const baseSpec=finalOnlySpec(state,state.counts,mode),initial=evaluateNode(state,{counts:clone(state.counts),wisp:num(state.counts[C.WISP_ID]),spec:baseSpec,actions:[]},mode,route,settings,fixed,target);initial.target=target;
  const staticData=sharedStaticData||buildStaticRows(state,mode,route,settings,policy,fixed,initial.requirements),rowById=new Map(staticData.rows.map(row=>[row.unit.id,row])),fullMask=(1<<remaining.length)-1;
  // The confirmed plan stores its verified construction order. Try that path
  // first so normal hand updates stay cheap; a bounded alternate-order search
  // is only needed after the stored path genuinely stops working.
  let orderedNode=initial,orderedMask=0,orderedOk=true;for(let i=0;i<remaining.length;i++){const remCounts={};for(let j=i;j<remaining.length;j++)remCounts[lineupKey(remaining[j])]=num(remCounts[lineupKey(remaining[j])])+1;const fulfilled=fulfilledKeyCounts(requested,remCounts),row=rowById.get(remaining[i].id),next=row&&prerequisiteStatus(state,remaining[i],orderedNode.counts).allowed?expandNode(state,orderedNode,row,mode,route,settings,fixed,target,policy):null;if(!next||!protectsFulfilled(next.lineup,fulfilled)){orderedOk=false;break;}next.target=target;orderedNode=next;orderedMask|=1<<i;}
  if(orderedOk&&orderedMask===fullMask&&orderedNode.projectedCount===target&&orderedNode.requirements.complete&&sameKeyCounts(entryKeyCounts(orderedNode.lineup),requested))return{success:true,allWispFeasible:true,reason:'현재 패와 모든 선택 위습으로 확정 파티 9기를 그대로 완성할 수 있습니다.',searched:{best:orderedNode,alternates:[],staticData,route,liveSpec}};
  let frontier=[{node:initial,mask:0}],archive=[];
  for(let depth=0;depth<remaining.length&&frontier.length;depth++){
    const children=[];
    for(const item of frontier){const remCounts={};for(let i=0;i<remaining.length;i++)if(!(item.mask&(1<<i)))remCounts[lineupKey(remaining[i])]=num(remCounts[lineupKey(remaining[i])])+1;const fulfilled=fulfilledKeyCounts(requested,remCounts),seenIds=new Set();
      for(let i=0;i<remaining.length;i++){if(item.mask&(1<<i))continue;const u=remaining[i];if(seenIds.has(u.id))continue;seenIds.add(u.id);const row=rowById.get(u.id);if(!row||!prerequisiteStatus(state,u,item.node.counts).allowed)continue;const next=expandNode(state,item.node,row,mode,route,settings,fixed,target,policy);if(!next||!protectsFulfilled(next.lineup,fulfilled))continue;next.target=target;children.push({node:next,mask:item.mask|(1<<i)});}
    }
    const dedup=new Map();for(const item of children){const key=`${item.mask}:${nodeSignature(item.node,state)}`,old=dedup.get(key);if(!old||nodeCompare(item.node,old.node)<0)dedup.set(key,item);}frontier=[...dedup.values()].sort((a,b)=>nodeCompare(a.node,b.node)).slice(0,4);archive.push(...frontier.filter(item=>item.mask===fullMask));
  }
  const exact=archive.map(item=>item.node).filter(node=>node.projectedCount===target&&node.requirements.complete&&sameKeyCounts(entryKeyCounts(node.lineup),requested)).sort(nodeCompare)[0];
  if(exact)return{success:true,allWispFeasible:true,reason:'현재 패와 모든 선택 위습으로 확정 파티 9기를 그대로 완성할 수 있습니다.',searched:{best:exact,alternates:[],staticData,route,liveSpec}};
  const firstBlocked=remaining.map(u=>{const prereq=prerequisiteStatus(state,u,state.counts),solve=effectiveSolve(C.recipeSolve(state.db,u.id,state.counts),prereq);if(!prereq.allowed)return`${displayNameOf(u)}: ${prereq.missing.map(x=>x.name).join('·')} 미보유`;if(missingNonWisp(solve,prereq))return`${displayNameOf(u)}: 희귀·특별·특수 재료 부족`;if(solve.wispCost>num(state.counts[C.WISP_ID]))return`${displayNameOf(u)}: 선위 ${solve.wispCost-num(state.counts[C.WISP_ID])}개 부족`;return'';}).find(Boolean);
  return{success:false,allWispFeasible:false,reason:firstBlocked?`모든 선택 위습을 사용해도 ${firstBlocked}`:'재료 중복 때문에 확정 9기를 동시에 보존할 수 없어 최소 자리만 가변 교체합니다.'};
}

function makeLightStaticData(state,mode,route,settings,policy){
  const target=settings.targetSquadCount,baseSpec=finalOnlySpec(state,state.counts,mode),initial=evaluateNode(state,{counts:clone(state.counts),wisp:num(state.counts[C.WISP_ID]),spec:baseSpec,actions:[]},mode,route,settings,[],target);initial.target=target;return buildStaticRows(state,mode,route,settings,policy,[],initial.requirements);
}
function staticCandidatePool(staticData){const out=[],seen=new Set(),push=row=>{if(row&&!seen.has(row.unit.id)){seen.add(row.unit.id);out.push(row);}};for(const row of staticData&&staticData.shortlist||[])push(row);for(const row of staticData&&staticData.rows||[])push(row);return out;}

function ownedBlueprintBase(state,mode,route,settings,fixed,target,virtualFixed=false){
  const counts=clone(state.counts);if(virtualFixed)for(const id of fixed||[]){const unit=state.db.byId.get(id);if(!unit||num(counts[id])>0)continue;for(const ancestor of recipeProfile(state,unit).finalAncestors)counts[ancestor]=0;counts[id]=1;}
  const spec=finalOnlySpec(state,counts,mode),node=evaluateNode(state,{counts,wisp:num(state.counts[C.WISP_ID]),spec,actions:[]},mode,route,settings,fixed,target);node.target=target;return node;
}
function currentSubsetForBlueprint(state,base,finalLineup,staticRows,mode,route,settings,fixed,target,policy){
  const desired=entryKeyCounts((finalLineup||[]).map(row=>row.unit).filter(Boolean)),rowById=new Map((staticRows||[]).map(row=>[row.unit.id,row]));let node=base,guard=0;
  while(guard++<target*2){const actual=entryKeyCounts(node.lineup),pending=(finalLineup||[]).filter(row=>{const unit=row.unit||state.db.byId.get(row.id);return unit&&num(actual[lineupKey(unit)])<num(desired[lineupKey(unit)]);}).sort((a,b)=>{const au=(fixed||[]).includes(a.id)?0:1,bu=(fixed||[]).includes(b.id)?0:1;return au-bu;});let next=null;
    for(const item of pending){const row=rowById.get(item.id);if(!row)continue;const candidate=expandNode(state,node,row,mode,route,settings,fixed,target,policy);if(!candidate)continue;const counts=entryKeyCounts(candidate.lineup),outside=Object.entries(counts).some(([key,value])=>num(value)>num(desired[key]));if(outside)continue;next=candidate;break;}
    if(!next)break;node=next;
  }
  return node;
}
function reconcileBlueprintStatuses(state,initial,finalLineup,current){
  const owned=entryKeyCounts(finalEntries(state,initial)),built=multiset((current.actions||[]).map(action=>lineupKey(action.unit))),usedOwned={},usedBuilt={};
  return(finalLineup||[]).map(row=>{const unit=row.unit||state.db.byId.get(row.id),key=unit&&lineupKey(unit),copy=Object.assign({},row);if(unit&&num(usedOwned[key])<num(owned[key])){usedOwned[key]=num(usedOwned[key])+1;copy.status='owned';}else if(unit&&num(usedBuilt[key])<num(built[key])){usedBuilt[key]=num(usedBuilt[key])+1;copy.status='planned';}else copy.status='future';return copy;});
}
function resolveFinalPlanning(state,best,staticRows,mode,route,settings,fixed,target,policy){
  if(!(fixed||[]).length)return{best,finalLineup:buildDeferred(state,best,staticRows,mode,route,settings,fixed,target,policy)};
  // Once an upper is selected, first choose a role-complete final blueprint
  // from the untouched hand. Only then calculate which members can be built
  // right now. This prevents extra wisps from locking in unrelated filler and
  // making the final recommendation worse as the wisp count increases.
  const blueprintBase=ownedBlueprintBase(state,mode,route,settings,fixed,target,true),actualBase=ownedBlueprintBase(state,mode,route,settings,fixed,target,false),blueprint=buildDeferred(state,blueprintBase,staticRows,mode,route,settings,fixed,target,policy),current=currentSubsetForBlueprint(state,actualBase,blueprint,staticRows,mode,route,settings,fixed,target,policy),finalLineup=reconcileBlueprintStatuses(state,state.counts,blueprint,current);return{best:current,finalLineup};
}

// Upper ranking must not run the 300ms full beam once per candidate. Static
// recipe/role rows are shared per route; each candidate receives only a beam-2
// continuation. The full planner is still used after the user opens a preview.
function searchRouteLight(state,mode,route,settings,policy,fixed,staticData){
  const target=settings.targetSquadCount,liveSpec=C.currentSpec(state,mode,Object.assign({},settings,{_upperUnit:mainUpperFor(state,state.counts,fixed)})),baseSpec=finalOnlySpec(state,state.counts,mode),initial=evaluateNode(state,{counts:clone(state.counts),wisp:num(state.counts[C.WISP_ID]),spec:baseSpec,actions:[]},mode,route,settings,fixed,target);initial.target=target;
  const data=staticData||makeLightStaticData(state,mode,route,settings,policy),rowById=new Map(data.rows.map(row=>[row.unit.id,row])),lightRows=[],lightSeen=new Set(),push=row=>{if(row&&!lightSeen.has(row.unit.id)){lightSeen.add(row.unit.id);lightRows.push(row);}};for(const id of fixed)push(rowById.get(id));for(const row of data.shortlist)push(row);const maxDepth=Math.min(11,Math.max(3,target-initial.projectedCount+2));let beam=[initial],archive=[initial];
  for(let depth=0;depth<maxDepth;depth++){
    const children=[];for(const node of beam){if(node.complete)continue;const ranked=lightRows.filter(row=>!num(node.counts[row.unit.id])&&!ruleBlocked(state,node,row.unit,mode,route,settings,fixed)).map(row=>({row,rank:quickRank(state,row,node,fixed,policy)})).filter(item=>Number.isFinite(item.rank)).sort((a,b)=>b.rank-a.rank||compareAffinity(a.row.unit,b.row.unit)||compareText(a.row.unit.id,b.row.unit.id)).map(item=>item.row),branches=diverseBranchRows(ranked,node.requirements,2).slice(0,5);for(const row of branches){const next=expandNode(state,node,row,mode,route,settings,fixed,target,policy);if(!next)continue;next.target=target;children.push(next);}}
    if(!children.length)break;const dedup=new Map();for(const node of children){const key=nodeSignature(node,state),old=dedup.get(key);if(!old||nodeCompare(node,old)<0)dedup.set(key,node);}beam=boundedBeam([...dedup.values()],2);archive.push(...beam);if(beam.every(x=>x.complete))break;
  }
  archive.sort(nodeCompare);return{best:archive[0],alternates:archive.filter(x=>nodeSignature(x,state)!==nodeSignature(archive[0],state)).slice(0,2),staticData:data,route,liveSpec,light:true};
}

function finishLightPlan(state,settings,policy,route,fixed,searched){
  const target=settings.targetSquadCount,resolved=resolveFinalPlanning(state,searched.best,staticCandidatePool(searched.staticData),settings.mode,route,settings,fixed,target,policy),best=resolved.best,finalLineup=resolved.finalLineup,alloc=rareAllocation(state,state.counts,best,finalLineup),handFit=fullHandAllocation(state,state.counts,best,finalLineup,policy);let plannedSpec=emptyFinalSpec(settings.mode),plannedUnits=finalLineup.map(row=>row.unit).filter(Boolean),plannedMain=plannedUnits.find(C.isUpper)||null;
  for(const unit of plannedUnits){plannedSpec=addUnitRole(plannedSpec,unit,settings.mode);plannedSpec.total=num(plannedSpec.total)+1;}
  const plannedRequirements=requirementRows(plannedSpec,plannedUnits,settings.mode,route,settings,plannedMain),routeEvaluation=routeEvaluationFor(plannedUnits,plannedRequirements,settings.mode,route),wispBudget=wispBudgetSummary(handFit,finalLineup.length,target,plannedRequirements.complete&&routeEvaluation.confirmable),upperConcept=plannedMain&&C.upperStrategy?C.upperStrategy(plannedMain):null,materialOverlap=lineupMaterialOverlap(state,plannedUnits);
  return{version:VERSION,lightweight:true,mode:settings.mode,magicRoute:route,routeLabel:ROUTE_LABELS[route],targetCount:target,projectedCount:best.projectedCount,plannedCount:finalLineup.length,complete:best.complete,finalLineup,actions:best.actions,rareAllocation:alloc.rows,rareSummary:alloc.summary,unusedRare:alloc.unused,handFit,wispBudget,routeEvaluation,bottlenecks:[],finalPatchOptions:[],upperConcept:upperConcept?{key:upperConcept.key,label:upperConcept.label,summary:upperConcept.summary,needs:upperConcept.needs||[]}:null,roleCoverage:{basis:'final-only',readiness:best.requirements.readiness,complete:best.requirements.complete,rows:best.requirements.rows,spec:best.spec,currentStage:{basis:'all-owned-live',spec:searched.liveSpec},planned:{basis:'final-only',readiness:plannedRequirements.readiness,complete:plannedRequirements.complete,rows:plannedRequirements.rows,spec:plannedSpec,excessStun:excessStun(plannedSpec),excessSlow:excessSlow(plannedRequirements)}},deficits:best.requirements.deficits,alternatives:[],score:best.score,materialOverlap,afterStock:clone(best.counts),remainingWisp:best.wisp,resourceUse:best.used,search:{candidateCount:searched.staticData.rows.length,shortlistCount:searched.staticData.shortlist.length,beamWidth:1,maxDepth:11,sharedStatic:true}};
}

function compactCompletedLightPlan(state,settings,route,searched){
  const best=searched.best,target=settings.targetSquadCount,builtIds=new Set(best.actions.map(action=>action.id)),finalLineup=best.lineup.map(u=>({id:u.id,name:displayNameOf(u),groupName:groupOf(u),family:unitFamily(u),unit:u,status:builtIds.has(u.id)?'planned':'owned',role:C.summarizeRoles?C.summarizeRoles({role:C.roleProfile(u)},settings.mode):''})),rareTotal=state.db.rares.reduce((total,u)=>total+num(state.counts[u.id]),0),rareUsed=num(best.used&&best.used.rare),rareSummary={initial:rareTotal,spent:rareUsed,reserved:0,conflict:0,reroll:Math.max(0,rareTotal-rareUsed)},handFit=fullHandAllocation(state,state.counts,best,finalLineup,{reserved:{}}),routeEvaluation=routeEvaluationFor(best.lineup,best.requirements,settings.mode,route),wispBudget=wispBudgetSummary(handFit,finalLineup.length,target,best.requirements.complete&&routeEvaluation.confirmable);
  return{version:VERSION,lightweight:true,mode:settings.mode,magicRoute:route,routeLabel:ROUTE_LABELS[route],targetCount:target,projectedCount:best.projectedCount,plannedCount:finalLineup.length,complete:best.complete,finalLineup,actions:best.actions,rareAllocation:[],rareSummary,unusedRare:[],handFit,wispBudget,routeEvaluation,bottlenecks:[],finalPatchOptions:[],upperConcept:null,roleCoverage:{basis:'final-only',readiness:best.requirements.readiness,complete:best.requirements.complete,rows:best.requirements.rows,spec:best.spec,currentStage:{basis:'all-owned-live',spec:searched.liveSpec},planned:{basis:'final-only',readiness:best.requirements.readiness,complete:best.requirements.complete,rows:best.requirements.rows,spec:best.spec,excessStun:best.excessStun,excessSlow:best.excessSlow}},deficits:best.requirements.deficits,alternatives:[],score:best.score,afterStock:clone(best.counts),remainingWisp:best.wisp,resourceUse:best.used,search:{candidateCount:searched.staticData.rows.length,shortlistCount:searched.staticData.shortlist.length,beamWidth:1,maxDepth:11,sharedStatic:true}};
}

function handClaimValue(state,row,stock){let rareScore=0,lowerScore=0;const tierUse={rare:0,special:0,uncommon:0,common:0};for(const [id,value] of Object.entries(row&&row.solve&&row.solve.consumed||{})){const tier=tierOf(state.db.byId.get(id)),weights=HAND_FIT_WEIGHTS[tier];if(!weights)continue;const claim=Math.min(num(stock&&stock[id]),num(value));if(claim<=0)continue;tierUse[tier]+=claim;const clear=num(stock[id])-claim<=0,valueScore=claim*weights.spent+weights.usedType+(clear?weights.clearedType:0);if(tier==='rare')rareScore+=valueScore;else lowerScore+=valueScore;}lowerScore-=num(row&&row.solve&&row.solve.wispCost)*2.7+num(row&&row.pressure&&row.pressure.penalty);return{rareScore,lowerScore,score:rareScore+lowerScore,tierUse};}

function compareDraftCandidates(a,b){
  // The fast upper draft first preserves the same role-closing shape. Only
  // among equivalent role candidates does it maximize the actual owned hand
  // in Rare > Special > Uncommon > Common order, then minimize current wisps.
  // The curated Upper→support memo is a bounded package prior after those
  // live-hand checks, never a bypass for missing roles or unavailable material.
  // v19: upperHold(관성)는 역할 판정 전부 뒤, 패 소모·위습 비교 앞에 온다.
  // 상위를 만드는 데 걸리는 라운드는 위습 몇 개보다 비싸다 — 더 닫는 후보가
  // 나타나면 바뀌고, "조금 더 싸다"로는 바뀌지 않는다.
  return b.closed-a.closed||b.covered-a.covered||a.controlPenalty-b.controlPenalty||num(b.upperHold)-num(a.upperHold)||compareTierBurn(a.tierUse,b.tierUse)||a.wispCost-b.wispCost||b.roleGain-a.roleGain||num(b.memoAffinity)-num(a.memoAffinity)||b.score-a.score||compareText(a.row.unit.id,b.row.unit.id);
}
function compareDraftRoleCandidates(a,b){const priority=comparePriorityVectors(a.priority,b.priority);if(priority)return priority;return b.closed-a.closed||b.covered-a.covered||b.roleGain-a.roleGain||a.controlPenalty-b.controlPenalty||num(b.upperHold)-num(a.upperHold)||compareTierBurn(a.tierUse,b.tierUse)||a.wispCost-b.wispCost||num(b.memoAffinity)-num(a.memoAffinity)||b.score-a.score||compareText(a.row.unit.id,b.row.unit.id);}

function draftRoleComplete(plan){const planned=plan&&plan.roleCoverage&&plan.roleCoverage.planned,evaluation=plan&&plan.routeEvaluation;return!!(plan&&planned&&planned.complete&&(!evaluation||evaluation.confirmable!==false)&&num(plan.plannedCount)>=num(plan.targetCount));}
function draftPlanFeasible(plan){return!!(plan&&(!plan.handFit||plan.handFit.feasible!==false)&&(!plan.wispBudget||plan.wispBudget.fullPartyFeasible));}
function compareDraftLanes(a,b){
  const af=draftPlanFeasible(a),bf=draftPlanFeasible(b);if(af!==bf)return Number(bf)-Number(af);
  const ac=draftRoleComplete(a),bc=draftRoleComplete(b);if(ac!==bc)return Number(bc)-Number(ac);
  const ap=a&&a.roleCoverage&&a.roleCoverage.planned||{},bp=b&&b.roleCoverage&&b.roleCoverage.planned||{};
  if(ac&&bc){const ao=controlCapOverflow(excessStun(ap.spec),excessSlow({rows:ap.rows})),bo=controlCapOverflow(excessStun(bp.spec),excessSlow({rows:bp.rows}));if(ao!==bo)return ao-bo;const tierOrder=compareTierBurn(a.handFit,b.handFit);if(tierOrder)return tierOrder;const aw=num(a.handFit&&a.handFit.wisp&&a.handFit.wisp.required),bw=num(b.handFit&&b.handFit.wisp&&b.handFit.wisp.required);if(aw!==bw)return aw-bw;}
  // An incomplete lane is never selected for burning more cards. Preserve the
  // route that is closest in the user's hard 1/2/3 clear priority instead.
  const priority=comparePriorityVectors(requirementPriorityVector({rows:ap.rows,route:a&&a.magicRoute}),requirementPriorityVector({rows:bp.rows,route:b&&b.magicRoute}));if(priority)return priority;
  if(num(ap.readiness)!==num(bp.readiness))return num(bp.readiness)-num(ap.readiness);
  if(num(a&&a.plannedCount)!==num(b&&b.plannedCount))return num(b&&b.plannedCount)-num(a&&a.plannedCount);
  const ao=controlCapOverflow(excessStun(ap.spec),excessSlow({rows:ap.rows})),bo=controlCapOverflow(excessStun(bp.spec),excessSlow({rows:bp.rows}));if(ao!==bo)return ao-bo;
  return num(b&&b.score)-num(a&&a.score);
}

// Static-greedy draft used only to rank the upper cards. It shares every
// expensive recipe solve between candidates and tracks each current Rare card
// once. Opening a preview runs planFinalSquad's full sequential verifier.
function draftUpperBlueprintPlan(state,settings,policy,route,upper,staticData,lane){
  const roleLane=lane==='role',candidateCompare=roleLane?compareDraftRoleCandidates:compareDraftCandidates;
  const mode=settings.mode,target=settings.targetSquadCount,allRows=staticCandidatePool(staticData),rowById=new Map(allRows.map(row=>[row.unit.id,row])),upperRow=rowById.get(upper.id);if(!upperRow)return null;
  const initial=clone(state.counts),initialOwned=finalEntries(state,initial);let working=clone(initial),wisp=num(initial[C.WISP_ID]),lineup=initialOwned.slice(),plannedSpec=finalOnlySpec(state,working,mode),main=mainUpperFor(state,working,[upper.id]),requirements=requirementRows(plannedSpec,lineup,mode,route,settings,main),guard=0;const builtIds=new Set(),actions=[];
  const refresh=()=>{lineup=finalEntries(state,working);plannedSpec=finalOnlySpec(state,working,mode);main=mainUpperFor(state,working,[upper.id]);requirements=requirementRows(plannedSpec,lineup,mode,route,settings,main);};
  const add=(row,prepared)=>{const u=row&&row.unit,prerequisite=prepared&&prepared.prerequisite||prerequisiteStatus(state,u,working);if(!u||!prerequisite.allowed)return false;const solve=prepared&&prepared.solve||effectiveSolve(C.recipeSolve(state.db,u.id,working),prerequisite);if(missingNonWisp(solve,prerequisite)||solve.wispCost>wisp)return false;const before=requirements,beforeLineup=lineup.slice(),beforeStock=working,pressure=prepared&&prepared.pressure||commonPressure(solve,beforeStock,policy),after=clone(solve.stockAfter),remaining=Math.max(0,wisp-solve.wispCost);after[C.WISP_ID]=remaining;after[u.id]=num(after[u.id])+1;const afterLineup=finalEntries(state,after);if(introducesLineageConflict(state,beforeLineup,afterLineup))return false;working=after;wisp=remaining;builtIds.add(u.id);refresh();actions.push({order:actions.length+1,id:u.id,name:displayNameOf(u),unit:u,solve,wispCost:solve.wispCost,remainingWisp:wisp,rareSpend:clone(solve.rareUse),commonPressure:pressure,reason:actionReason(before,requirements,u)});return true;};
  const upperPresent=lineup.some(u=>lineupKey(u)===lineupKey(upper)),upperPending=!upperPresent&&!add(upperRow),ownedUpperCount=new Set(lineup.filter(C.isUpper).map(canonicalUpper)).size,reservedUpperSlots=upperPending?Math.max(1,expectedUpperCount(mode,route,settings)-ownedUpperCount):0,immediateTarget=Math.max(0,target-reservedUpperSlots);
  while(lineup.length<immediateTarget&&guard++<target*2){
    const currentIds=new Set(lineup.map(stableId)),currentKeys=new Set(lineup.map(lineupKey)),upperN=upperCount(state,working),changed=tierCount(state,working,C.isChanged),seraph=tierCount(state,working,C.isSeraph),trans=tierCount(state,working,C.isTranscend),maxUpper=maxUpperCount(mode,route,settings),missing=(requirements.rows||[]).filter(req=>req.required&&num(req.gap)>0),preCandidates=[],candidates=[];
    // v19(0730 실전 교정): 손패의 보조가 혼자 닫을 수 있는 제어 줄은 상위
    // 후보의 역할 크레딧에서 빼고 센다.
    //
    // 사용자 상황: 두 번째 상위로 (C)아오키지 초월이 추천됐다.  이 유닛은
    // 스턴 1.24 + 이감 70 으로 제어 두 줄을 혼자 닫아 closed=2 를 받았고,
    // closed 가 최상위 비교항이라 다른 모든 항(제어 과잉·패 소모)을 건너뛰고
    // 이겼다.  그런데 그때 사용자 패에는 라분(0.8스턴)과 헨콕(0.9스턴)이
    // 있었다 — 스턴은 보조로 이미 닫히는 줄이었고, 상위 자리를 그 줄에 쓰는
    // 것은 낭비였다("스턴이 2.5가 엄청 오버").  사용자는 결국 (B)브룩으로
    // 직접 바꿨다.
    //
    // blocked 는 라운드 시작 패 기준이라 이 판정은 근사다.  방향은 안전하다 —
    // 상위의 제어 크레딧만 깎으므로, 근사가 틀리면 보조가 먼저 시도되고
    // 실패하면 다음 후보로 흘러간다.
    const controlRequirementKeys=new Set(['stun','stunBase','stunFull','slow']),supportClosable=new Set();
    for(const row of allRows){const u=row.unit;if(C.isUpper(u)||row.blocked)continue;if(currentIds.has(u.id)||currentKeys.has(lineupKey(u))||builtIds.has(u.id))continue;
      for(const req of missing){if(!controlRequirementKeys.has(req.key)||supportClosable.has(req.key))continue;if(requirementVectorValue(row.vector,req.key,requirements)+1e-9>=num(req.gap))supportClosable.add(req.key);}}
    for(const row of allRows){const u=row.unit;if(currentIds.has(u.id)||currentKeys.has(lineupKey(u))||builtIds.has(u.id))continue;if(upperPending&&C.isUpper(u))continue;if(C.isUpper(u)&&upperN>=maxUpper)continue;if(secondUpperBlocked(settings,u,[upper.id],state))continue;if(C.isSeraph(u)&&settings.seraphUsed+seraph>=1)continue;if(C.isTranscend(u)&&settings.transcendUsed+trans>=1)continue;if(C.isChanged(u)&&settings.changedUsed+changed>=2)continue;const claim=handClaimValue(state,row,working),roleGain=staticPotential(row.vector,requirements),discounted=req=>C.isUpper(u)&&supportClosable.has(req.key),closed=missing.filter(req=>!discounted(req)&&requirementVectorValue(row.vector,req.key,requirements)+1e-9>=num(req.gap)).length,covered=missing.filter(req=>!discounted(req)&&requirementVectorValue(row.vector,req.key,requirements)>0).length,controlPenalty=incrementalStunPenalty(plannedSpec,row.vector)+incrementalSlowPenalty(requirements,row.vector),projectedRows=(requirements.rows||[]).map(item=>{const current=num(item.current)+requirementVectorValue(row.vector,item.key,requirements),targetValue=num(item.target);return Object.assign({},item,{current,gap:Math.max(0,targetValue-current)});}),priority=requirementPriorityVector({rows:projectedRows,route:requirements.route}),memoAffinity=num(curatedSupportEvidence(u).affinity),upperHold=stickyUpperHold(state,settings,u),score=roleGain*12+claim.rareScore*3+claim.lowerScore-controlPenalty+memoAffinity*12;preCandidates.push({row,score,roleGain,closed,covered,controlPenalty,priority,tierUse:claim.tierUse,wispCost:num(row.solve&&row.solve.wispCost),memoAffinity,upperHold});}
    preCandidates.sort(candidateCompare);
    const probe=[],probeIds=new Set(),pushProbe=item=>{if(item&&!probeIds.has(item.row.unit.id)){probeIds.add(item.row.unit.id);probe.push(item);}},tryProbe=item=>{if(!item)return false;const row=item.row,u=row.unit;if(lineup.some(existing=>pairMaterialOverlap(state,existing,u).lineage))return false;const prerequisite=prerequisiteStatus(state,u,working),solve=effectiveSolve(C.recipeSolve(state.db,u.id,working),prerequisite);if(!prerequisite.allowed||missingNonWisp(solve,prerequisite)||solve.wispCost>wisp)return false;const pressure=commonPressure(solve,working,policy),dynamicRow=Object.assign({},row,{solve,pressure}),claim=handClaimValue(state,dynamicRow,working),score=item.roleGain*12+claim.rareScore*3+claim.lowerScore-item.controlPenalty+num(item.memoAffinity)*12-candidateOverlapPenalty(state,u,lineup,working)*OVERLAP_HEURISTIC_WEIGHT;candidates.push(Object.assign({},item,{score,tierUse:claim.tierUse,wispCost:solve.wispCost,prepared:{prerequisite,solve,pressure}}));return true;};
    pushProbe(preCandidates[0]);pushProbe(preCandidates[1]);if(roleLane){pushProbe(preCandidates[2]);pushProbe(preCandidates[3]);for(const req of missing)pushProbe(preCandidates.slice().sort((a,b)=>Math.min(num(req.gap),requirementVectorValue(b.row.vector,req.key,requirements))-Math.min(num(req.gap),requirementVectorValue(a.row.vector,req.key,requirements))||candidateCompare(a,b))[0]);}pushProbe(preCandidates.slice().sort((a,b)=>a.controlPenalty-b.controlPenalty||compareTierBurn(a.tierUse,b.tierUse)||a.wispCost-b.wispCost||b.score-a.score)[0]);pushProbe(preCandidates.slice().sort((a,b)=>compareTierBurn(a.tierUse,b.tierUse)||a.wispCost-b.wispCost||candidateCompare(a,b))[0]);pushProbe(preCandidates.slice().sort((a,b)=>a.wispCost-b.wispCost||compareTierBurn(a.tierUse,b.tierUse)||b.score-a.score)[0]);for(const item of probe)tryProbe(item);
    // Shared materials can make all three static leaders stale. Only in that
    // case, walk the remaining static order until one current-stock solve works.
    if(!candidates.length)for(const item of preCandidates){if(probeIds.has(item.row.unit.id))continue;probeIds.add(item.row.unit.id);if(tryProbe(item))break;}
    candidates.sort(candidateCompare);let added=false;for(const item of candidates){if(add(item.row,item.prepared)){added=true;break;}}if(!added)break;
  }
  const currentSpec=finalOnlySpec(state,initial,mode),currentMain=mainUpperFor(state,initial,[upper.id]),currentReq=requirementRows(currentSpec,initialOwned,mode,route,settings,currentMain),used=consumptionTotals(actions,state),actualFit=handFitMetrics(state,initial,working,used),bestNode={actions,counts:working,wisp,lineup:lineup.slice(),spec:plannedSpec,mainUpper:main,requirements,used,handFit:actualFit},finalLineup=buildDeferred(state,bestNode,allRows,mode,route,settings,[upper.id],target,policy,{light:true}),plannedUnits=finalLineup.map(row=>row.unit||state.db.byId.get(row.id)).filter(Boolean);let finalSpec=emptyFinalSpec(mode);for(const unit of plannedUnits){finalSpec=addUnitRole(finalSpec,unit,mode);finalSpec.total++;}const finalMain=plannedUnits.find(unit=>C.isUpper(unit))||main,finalRequirements=requirementRows(finalSpec,plannedUnits,mode,route,settings,finalMain),routeEvaluation=routeEvaluationFor(plannedUnits,finalRequirements,mode,route),allocation=rareAllocation(state,initial,bestNode,finalLineup),handFit=fullHandAllocation(state,initial,bestNode,finalLineup,policy),wispBudget=wispBudgetSummary(handFit,finalLineup.length,target,finalRequirements.complete&&routeEvaluation.confirmable),rareTotal=num(allocation.summary.initial),rareUsed=num(allocation.summary.spent)+num(allocation.summary.reserved),complete=lineup.length>=target&&requirements.complete,materialOverlap=lineupMaterialOverlap(state,plannedUnits),rareClearedTypes=allocation.rows.filter(row=>row.initial>0&&row.remaining<=0).length,rareUsedTypes=allocation.rows.filter(row=>row.spent>0||row.reserved>0).length,draftClearComplete=finalLineup.length>=target&&finalRequirements.complete&&routeEvaluation.confirmable&&handFit.feasible&&wispBudget.fullPartyFeasible;
  const draft={version:VERSION,lightweight:'sequential-greedy',mode,magicRoute:route,routeLabel:ROUTE_LABELS[route],targetCount:target,projectedCount:lineup.length,plannedCount:finalLineup.length,complete,finalLineup,actions,rareAllocation:allocation.rows,rareSummary:allocation.summary,unusedRare:allocation.unused,routeEvaluation,bottlenecks:[],finalPatchOptions:[],upperConcept:null,roleCoverage:{basis:'final-only',readiness:currentReq.readiness,complete:currentReq.complete,rows:currentReq.rows,spec:currentSpec,currentStage:{basis:'all-owned-live',spec:C.currentSpec(state,mode,Object.assign({},settings,{_upperUnit:currentMain}))},planned:{basis:'final-only',readiness:finalRequirements.readiness,complete:finalRequirements.complete,rows:finalRequirements.rows,spec:finalSpec,excessStun:excessStun(finalSpec),excessSlow:excessSlow(finalRequirements)}},deficits:finalRequirements.deficits,alternatives:[],score:finalRequirements.readiness*100+handFit.metrics.score-materialOverlap.penalty,materialOverlap,rareClearedTypes,rareUsedTypes,handFit,wispBudget,afterStock:clone(working),remainingWisp:wisp,resourceUse:used,search:{candidateCount:allRows.length,shortlistCount:staticData.shortlist.length,beamWidth:0,maxDepth:0,sharedStatic:true,draft:true,sequential:true},draftClearComplete};
  if(!roleLane&&!draftRoleComplete(draft)){
    // Run one second greedy lane whose ordering is strictly the hard 1/2/3
    // requirement vector. It is much cheaper than invoking the full light beam
    // for every incomplete upper, while preventing hand burn from taking the
    // last slot needed by armor/slow/stun.
    const hardRoleLane=draftUpperBlueprintPlan(state,settings,policy,route,upper,staticData,'role');
    if(hardRoleLane){hardRoleLane.lightweight='role-complete-lane';hardRoleLane.draftClearComplete=draftRoleComplete(hardRoleLane)&&draftPlanFeasible(hardRoleLane);if(compareDraftLanes(hardRoleLane,draft)<0)return hardRoleLane;}
  }
  return draft;
}

// The ranking draft is deliberately greedy for latency. If it reaches nine
// with only a narrow role miss, a material consumed late in that one order can
// hide a valid one-slot swap. Enumerate role-safe swaps cheaply, then exact-
// verify only the best few with the already-built static rows.
function repairDraftSingleSwap(state,settings,policy,route,upper,staticData,draft){
  const planned=draft&&draft.roleCoverage&&draft.roleCoverage.planned;if(!draft||draft.plannedCount!==draft.targetCount)return draft;
  const alreadyComplete=!!(planned&&planned.complete),requiredMiss=(planned&&planned.rows||[]).filter(row=>row.required&&num(row.gap)>0),narrow=alreadyComplete||requiredMiss.length===1&&(requiredMiss[0].key==='armor'?num(requiredMiss[0].gap)<=2.5:num(requiredMiss[0].gap)<=Math.max(.15,num(requiredMiss[0].target)*.05)),draftOverflow=controlCapOverflow(excessStun(planned&&planned.spec),excessSlow(planned));if(!narrow||draftOverflow<=0)return draft;
  const base=(draft.finalLineup||[]).map(row=>row.unit||state.db.byId.get(row.id)).filter(Boolean),built=new Set((draft.actions||[]).map(action=>action.id)),currentIds=new Set(base.map(stableId)),fixedKey=lineupKey(upper),options=[];
  const plannedRequirements={rows:planned&&planned.rows||[],control:C.controlState?C.controlState(planned&&planned.spec,settings.mode,Object.assign({},settings,{magicRoute:route,_resolvedMagicRoute:route,_upperUnit:upper})):null,route};
  const specFor=units=>{let spec=emptyFinalSpec(settings.mode);for(const unit of units){spec=addUnitRole(spec,unit,settings.mode);spec.total++;}return spec;};
  for(let index=0;index<base.length;index++){
    const removed=base[index];if(lineupKey(removed)===fixedKey||!built.has(removed.id))continue;const removedVector=roleVector(removed,settings.mode);
    for(const row of staticData.rows){const candidate=row.unit;if(C.isUpper(candidate)||currentIds.has(candidate.id)||!allowedCandidate(candidate,settings.mode,route,settings,state,state.counts))continue;
      if(!alreadyComplete&&requirementVectorValue(row.vector,requiredMiss[0].key,plannedRequirements)-requirementVectorValue(removedVector,requiredMiss[0].key,plannedRequirements)+1e-9<num(requiredMiss[0].gap))continue;
      if(base.some((existing,otherIndex)=>otherIndex!==index&&pairMaterialOverlap(state,existing,candidate).lineage))continue;
      const lineup=base.slice();lineup[index]=candidate;if(new Set(lineup.map(lineupKey)).size!==lineup.length)continue;
      if(lineup.filter(C.isSeraph).length+num(settings.seraphUsed)>1||lineup.filter(C.isTranscend).length+num(settings.transcendUsed)>1||lineup.filter(C.isChanged).length+num(settings.changedUsed)>2)continue;
      const spec=specFor(lineup),requirements=requirementRows(spec,lineup,settings.mode,route,settings,upper);if(!requirements.complete)continue;
      const overflow=controlCapOverflow(excessStun(spec),excessSlow(requirements));if(alreadyComplete&&overflow+1e-9>=draftOverflow)continue;const overlap=lineupMaterialOverlap(state,lineup),memoSupport=curatedLineupEvidence(lineup);options.push({removed,candidate,lineup,spec,requirements,overflow,overlap,memoSupport});
    }
  }
  options.sort((a,b)=>a.overflow-b.overflow||a.overlap.penalty-b.overlap.penalty||excessStun(a.spec)-excessStun(b.spec)||num(b.memoSupport&&b.memoSupport.score)-num(a.memoSupport&&a.memoSupport.score)||compareText(a.candidate.id,b.candidate.id));
  for(const option of options.slice(0,1)){
    const buildOrder=(draft.actions||[]).map(action=>action.id===option.removed.id?option.candidate.id:action.id),blueprint={version:1,upperId:upper.id,lineupIds:option.lineup.map(stableId),buildOrderIds:buildOrder,mode:settings.mode,magicRoute:route},exact=searchExactBlueprint(state,settings.mode,route,settings,policy,[upper.id],blueprint,staticData);if(!exact||!exact.success)continue;
    const repaired=finishLightPlan(state,settings,policy,route,[upper.id],exact.searched);repaired.lightweight='sequential-greedy-repaired';repaired.draftClearComplete=true;return repaired;
  }
  return draft;
}

function deferredReason(state,row,best,settings){
  if(C.isChanged(row.unit)&&settings.currentRound<50)return'50라 이후 변화됨 후보';if(row.solve.hardMissing&&row.solve.hardMissing.length&&!(row.prerequisite&&row.prerequisite.exception))return row.solve.hardMissing.map(x=>`${x.name} ${x.count}`).join(' · ');if(futureDropPending(state,row.solve,row.prerequisite))return'후속 보상·재료가 잡히면 제작';if(row.solve.wispCost>best.wisp)return`선택 위습 ${row.solve.wispCost-best.wisp}개 추가 필요`;return'후속 보상으로 제작';
}

function addUnitRole(spec,u,mode){
  const out=Object.assign({},spec),r=C.roleProfile(u),finish=C.magicFinishProfile?C.magicFinishProfile(u):{directCredit:0,maxCredit:0},add=(key,value)=>{out[key]=round(num(out[key])+num(value),key==='stun'?6:2);};
  if(C.isUpper(u)&&(unitFamily(u)===mode||unitFamily(u)==='neutral'))add('main',1);add('stun',r.stun);add('slow',r.slow);add('triggerSlow',r.triggerSlow);if(num(r.triggerSlow)>0)add('triggerSlowSources',1);add('armor',r.armor);add('triggerArmor',r.triggerArmor);add('singleArmor',r.singleArmor);add('stackArmor',r.stackArmor);add('single',mode==='magic'?r.single:0);add('end',mode==='magic'?r.end:0);if(mode==='magic'&&num(finish.directCredit)>0)add('singleEndUnits',1);if(mode==='magic'){add('singleEndExpected',finish.directCredit);add('singleEndMax',finish.maxCredit);out.singleEndLargest=Math.max(num(out.singleEndLargest),num(finish.directCredit));out.singleEndStable=round(Math.max(0,num(out.singleEndExpected)-num(out.singleEndLargest)));}if(mode==='magic'&&isToki(u))add('toki',1);const bossCredit=C.bossCreditFor?C.bossCreditFor(u,mode):{boss:r.boss,frenzy:r.frenzy};add('boss',bossCredit.boss?1:0);add('frenzy',bossCredit.frenzy?1:0);add('attack',r.attack-num(r.attackPenalty));add('triggerAttack',r.triggerAttack);add('speed',r.speed);add('regen',r.regen);add('mana',r.mana);add('armorBreak',r.armorBreak?1:0);add('utility',r.utility?1:0);add('subdamage',r.supportDamage?1:0);add('magicDef',mode==='magic'?r.magicDef:0);add('magicAmp',mode==='magic'?r.magicAmp:0);add('explosionAmp',mode==='magic'?r.explosionAmp:0);add('deletion',r.deletion?1:0);out.singleEnd=round(num(out.single)+num(out.end));out.bossFrenzy=Math.min(num(out.boss),num(out.frenzy));return out;
}

function deferredFutureFeasibility(state,best,lineup){
  let stock=clone(best&&best.counts),remainingWisp=Math.max(0,num(best&&best.wisp)),futureWispCost=0,futureWorstCase=0,hardFeasible=true,tierUse={rare:num(best&&best.used&&best.used.rare),special:num(best&&best.used&&best.used.special),uncommon:num(best&&best.used&&best.used.uncommon),common:num(best&&best.used&&best.used.common)};
  for(const row of lineup||[]){
    if(!row||row.status!=='future'||!row.unit)continue;const prerequisite=prerequisiteStatus(state,row.unit,stock),solve=effectiveSolve(C.recipeSolve(state.db,row.id,stock),prerequisite),charge=futureWispCharge(state,solve,prerequisite),burn=solveTierBurn(state,solve);if(!prerequisite.allowed)hardFeasible=false;for(const tier of HAND_TIERS)tierUse[tier]+=num(burn[tier]);futureWispCost+=charge.required;futureWorstCase+=charge.worstCase;stock=clone(solve.stockAfter);remainingWisp=Math.max(0,remainingWisp-charge.required);stock[C.WISP_ID]=remainingWisp;
  }
  return{hardFeasible,wispFeasible:futureWispCost<=num(best&&best.wisp),futureWispCost,futureWorstCase,totalWispCost:num(best&&best.used&&best.used.wisp)+futureWispCost,tierUse,remainingWisp,stockAfter:stock};
}
function compareDeferredSwaps(a,b){
  if(a.hardFeasible!==b.hardFeasible)return Number(b.hardFeasible)-Number(a.hardFeasible);if(a.wispFeasible!==b.wispFeasible)return Number(b.wispFeasible)-Number(a.wispFeasible);if(num(a.overflow)!==num(b.overflow))return num(a.overflow)-num(b.overflow);const tierOrder=compareTierBurn(a.tierUse,b.tierUse);if(tierOrder)return tierOrder;if(num(a.totalWispCost)!==num(b.totalWispCost))return num(a.totalWispCost)-num(b.totalWispCost);if(num(a.overlap&&a.overlap.penalty)!==num(b.overlap&&b.overlap.penalty))return num(a.overlap&&a.overlap.penalty)-num(b.overlap&&b.overlap.penalty);if(num(a.memoSupport&&a.memoSupport.score)!==num(b.memoSupport&&b.memoSupport.score))return num(b.memoSupport&&b.memoSupport.score)-num(a.memoSupport&&a.memoSupport.score);return compareText(a.row&&a.row.unit&&a.row.unit.id,b.row&&b.row.unit&&b.row.unit.id);
}

function deferredFixedMissing(state,units,fixed){
  const keys=new Set((units||[]).map(lineupKey));let missing=0;for(const id of fixed||[]){const unit=state.db.byId.get(id);if(unit&&!keys.has(lineupKey(unit)))missing++;}return missing;
}
function deferredHandStats(state,initial,after,actions){
  const used=consumptionTotals(actions||[],state),rareMap=used.consumedByTier&&used.consumedByTier.rare||{},rareIds=Object.keys(rareMap).filter(id=>num(rareMap[id])>0),rareUsed=rareIds.reduce((total,id)=>total+Math.min(num(initial&&initial[id]),num(rareMap[id])),0),rareClearedTypes=rareIds.filter(id=>num(initial&&initial[id])>0&&num(after&&after[id])<=0).length,lowerScore=num(used.special)*HAND_FIT_WEIGHTS.special.spent+num(used.uncommon)*HAND_FIT_WEIGHTS.uncommon.spent+num(used.common)*HAND_FIT_WEIGHTS.common.spent-num(used.commonPressure);return{used,rareUsed,rareClearedTypes,rareUsedTypes:rareIds.length,lowerScore};
}
function deferredNodeCompare(a,b,target){
  const af=a.entries.length>=target&&a.requirements.complete&&a.hardFeasible!==false,bf=b.entries.length>=target&&b.requirements.complete&&b.hardFeasible!==false;if(af!==bf)return Number(bf)-Number(af);
  if(num(a.fixedMissing)!==num(b.fixedMissing))return num(a.fixedMissing)-num(b.fixedMissing);
  if(a.hardFeasible!==b.hardFeasible)return Number(b.hardFeasible)-Number(a.hardFeasible);
  if(num(a.hardMissingCount)!==num(b.hardMissingCount))return num(a.hardMissingCount)-num(b.hardMissingCount);
  if(a.requirements.complete!==b.requirements.complete)return Number(b.requirements.complete)-Number(a.requirements.complete);
  const priority=comparePriorityVectors(requirementPriorityVector(a.requirements),requirementPriorityVector(b.requirements));if(priority)return priority;
  if(a.requirements.readiness!==b.requirements.readiness)return b.requirements.readiness-a.requirements.readiness;
  if(a.entries.length!==b.entries.length)return b.entries.length-a.entries.length;
  // 완성 가능성과 클리어 단계가 같으면 실제 패를 등급별로 먼저 털고,
  // 네 등급 소비가 같을 때만 누적 선택 위습을 비교합니다.
  if(num(a.controlOverflow)!==num(b.controlOverflow))return num(a.controlOverflow)-num(b.controlOverflow);
  const tierOrder=compareTierBurn(a.hand&&a.hand.used,b.hand&&b.hand.used);if(tierOrder)return tierOrder;
  if(num(a.totalWispCost)!==num(b.totalWispCost))return num(a.totalWispCost)-num(b.totalWispCost);
  if(num(a.hand.rareClearedTypes)!==num(b.hand.rareClearedTypes))return num(b.hand.rareClearedTypes)-num(a.hand.rareClearedTypes);
  if(num(a.hand.rareUsedTypes)!==num(b.hand.rareUsedTypes))return num(b.hand.rareUsedTypes)-num(a.hand.rareUsedTypes);
  if(num(a.hand.lowerScore)!==num(b.hand.lowerScore))return num(b.hand.lowerScore)-num(a.hand.lowerScore);
  if(num(a.overlapPenalty)!==num(b.overlapPenalty))return num(a.overlapPenalty)-num(b.overlapPenalty);
  if(num(a.memoSupport&&a.memoSupport.score)!==num(b.memoSupport&&b.memoSupport.score))return num(b.memoSupport&&b.memoSupport.score)-num(a.memoSupport&&a.memoSupport.score);
  return compareText(a.entries.map(row=>row.id).join('|'),b.entries.map(row=>row.id).join('|'));
}
function deferredBranchCandidates(candidates,requirements,limit=6){
  const picked=[],seen=new Set(),push=item=>{if(item&&!seen.has(item.row.unit.id)){seen.add(item.row.unit.id);picked.push(item);}};
  push(candidates.slice().sort((a,b)=>num(b.row.mandatory)-num(a.row.mandatory)||compareText(a.row.unit.id,b.row.unit.id))[0]);
  for(const item of candidates.slice(0,2))push(item);
  // 하드 조건을 닫은 뒤에는 무효 초과 스턴·이감을 먼저 줄이고, 같은
  // 제어 품질에서 희귀→특별→안흔→흔함 소비와 선택 위습을 비교합니다.
  push(candidates.slice().sort((a,b)=>num(a.controlPenalty)-num(b.controlPenalty)||compareTierBurn(a.tierUse,b.tierUse)||num(a.chargedWisp)-num(b.chargedWisp)||b.requiredGain-a.requiredGain||compareText(a.row.unit.id,b.row.unit.id))[0]);
  // 탐색 안전용 저선위 경로 하나도 보존하되 최종 선택 우선순위는
  // deferredNodeCompare의 등급별 소비 규칙을 따릅니다.
  push(candidates.slice().sort((a,b)=>num(a.chargedWisp)-num(b.chargedWisp)||num(a.controlPenalty)-num(b.controlPenalty)||compareTierBurn(a.tierUse,b.tierUse)||b.requiredGain-a.requiredGain||compareText(a.row.unit.id,b.row.unit.id))[0]);
  for(const requirement of requirements&&requirements.rows||[]){if(picked.length>=limit)break;if(!requirement.required||num(requirement.gap)<=0)continue;const best=candidates.slice().sort((a,b)=>Math.min(num(requirement.gap),num(b.row.vector&&b.row.vector[requirement.key]))-Math.min(num(requirement.gap),num(a.row.vector&&a.row.vector[requirement.key]))||num(a.controlPenalty)-num(b.controlPenalty)||compareTierBurn(a.tierUse,b.tierUse)||num(a.chargedWisp)-num(b.chargedWisp))[0];push(best);}
  for(const item of candidates){if(picked.length>=limit)break;push(item);}
  return picked.slice(0,limit);
}
function deferredCandidateRows(state,staticRows,fixed,limit){
  const rows=[],seen=new Set(),push=row=>{if(row&&row.unit&&!seen.has(row.unit.id)){seen.add(row.unit.id);rows.push(row);}};for(const id of fixed||[])push((staticRows||[]).find(row=>row&&row.unit&&row.unit.id===id));for(const row of (staticRows||[]).slice(0,limit))push(row);return rows;
}

function preserveCriticalSlowBudget(candidates,requirements,spec,availableWisp,mode,settings){
  if(mode!=='physical'||num(settings&&settings.currentRound)<40)return candidates;const rows=new Map((requirements&&requirements.rows||[]).map(row=>[row.key,row])),armor=rows.get('armor')||{},stun=rows.get('stunBase')||{},slow=rows.get('slow')||{};if(num(armor.gap)<=0||num(armor.gap)>15||num(stun.gap)>0||num(slow.gap)<=0)return candidates;const slowOptions=(candidates||[]).filter(item=>num(item&&item.row&&item.row.vector&&item.row.vector.slow)>0).sort((a,b)=>num(a.chargedWisp)-num(b.chargedWisp));if(!slowOptions.length)return candidates;const slowCost=num(slowOptions[0].chargedWisp),filtered=(candidates||[]).filter(item=>{const vector=item&&item.row&&item.row.vector||{},armorGain=Math.min(num(armor.gap),Math.max(0,num(vector.armor))),slowGain=Math.min(num(slow.gap),Math.max(0,num(vector.slow)));return!(armorGain>0&&slowGain<=.005&&num(item.chargedWisp)+slowCost>num(availableWisp));});return filtered.length?filtered:candidates;
}

// Upper-card ranking runs once for several candidates while the game is live.
// Its draft only needs a deterministic, cumulative-budget-safe proposal; the
// opened preview and confirmed blueprint still use the full beam below.
function buildDeferredLight(state,best,staticRows,mode,route,settings,fixed,target,policy){
  const builtIds=new Set(best.actions.map(x=>x.id)),entries=best.lineup.map(u=>({id:u.id,name:displayNameOf(u),groupName:groupOf(u),family:unitFamily(u),unit:u,status:builtIds.has(u.id)?'planned':'owned',role:C.summarizeRoles?C.summarizeRoles({role:C.roleProfile(u)},mode):''})),seen=new Set(entries.map(row=>row.id)),ownedBoard=ownedFinalBoardCount(state);let units=best.lineup.slice(),spec=Object.assign({},best.spec),main=best.mainUpper,requirements=best.requirements,stock=clone(best.counts),wisp=num(best.wisp),guard=0;const slotCap=num(settings&&settings.currentRound)>=40&&ownedBoard>=target&&!requirements.complete?entries.length+1:target,futureSettings=Object.assign({},settings,{_deferredFuture:true});
  while((entries.length<target||!requirements.complete)&&entries.length<slotCap&&guard++<slotCap*2){const upperN=new Set(units.filter(C.isUpper).map(canonicalUpper)).size,changed=units.filter(C.isChanged).length,seraph=units.filter(C.isSeraph).length,trans=units.filter(C.isTranscend).length,candidates=[];
    for(const row of deferredCandidateRows(state,staticRows,fixed,24)){const u=row.unit;if(seen.has(u.id)||!allowedCandidate(u,mode,route,futureSettings,state,stock))continue;if(units.some(existing=>pairMaterialOverlap(state,existing,u).lineage))continue;if(C.isUpper(u)&&upperN>=maxUpperCount(mode,route,settings))continue;if(secondUpperBlocked(settings,u,fixed,state))continue;if(C.isSeraph(u)&&settings.seraphUsed+seraph>=1)continue;if(C.isTranscend(u)&&settings.transcendUsed+trans>=1)continue;if(C.isChanged(u)&&settings.changedUsed+changed>=2)continue;const prerequisite=prerequisiteStatus(state,u,stock);if(!prerequisite.allowed)continue;const solve=effectiveSolve(C.recipeSolve(state.db,u.id,stock),prerequisite),charge=futureWispCharge(state,solve,prerequisite),chargedWisp=charge.required;if(chargedWisp>wisp)continue;const requiredGain=staticPotential(row.vector,requirements),projectedRows=(requirements.rows||[]).map(item=>{const current=num(item.current)+requirementVectorValue(row.vector,item.key,requirements),targetValue=num(item.target);return Object.assign({},item,{current,gap:Math.max(0,targetValue-current)});}),priority=requirementPriorityVector({rows:projectedRows,route:requirements.route}),controlPenalty=incrementalStunPenalty(spec,row.vector)+incrementalSlowPenalty(requirements,row.vector),tierUse=solveTierBurn(state,solve),memoAffinity=num(curatedSupportEvidence(u).affinity);candidates.push({row,prerequisite,solve,chargedWisp,requiredGain,priority,controlPenalty,tierUse,memoAffinity,hardBlocked:charge.dropPending,futureWispWorstCase:charge.worstCase});}
    const guarded=preserveCriticalSlowBudget(candidates,requirements,spec,wisp,mode,settings);guarded.sort((a,b)=>Number((fixed||[]).includes(b.row.unit.id))-Number((fixed||[]).includes(a.row.unit.id))||num(b.row.mandatory)-num(a.row.mandatory)||comparePriorityVectors(a.priority,b.priority)||Number(a.hardBlocked)-Number(b.hardBlocked)||a.controlPenalty-b.controlPenalty||compareTierBurn(a.tierUse,b.tierUse)||num(a.chargedWisp)-num(b.chargedWisp)||b.requiredGain-a.requiredGain||num(b.memoAffinity)-num(a.memoAffinity)||compareText(a.row.unit.id,b.row.unit.id));const pick=guarded[0];if(!pick)break;const u=pick.row.unit,beforeWisp=wisp;wisp-=num(pick.chargedWisp);stock=clone(pick.solve.stockAfter);stock[C.WISP_ID]=wisp;units=units.concat(u);spec=addUnitRole(spec,u,mode);if(!main&&C.isUpper(u))main=u;requirements=requirementRows(spec,units,mode,route,settings,main);seen.add(u.id);entries.push({id:u.id,name:displayNameOf(u),groupName:groupOf(u),family:unitFamily(u),unit:u,status:'future',role:C.summarizeRoles?C.summarizeRoles({role:C.roleProfile(u)},mode):'',reason:deferredReason(state,Object.assign({},pick.row,{solve:pick.solve,prerequisite:pick.prerequisite}),{wisp:beforeWisp},settings),prerequisite:pick.prerequisite,futureDropPending:pick.hardBlocked,futureWispEstimate:num(pick.futureWispWorstCase),futureWispRequired:num(pick.chargedWisp)});
  }
  return entries;
}

function buildDeferred(state,best,staticRows,mode,route,settings,fixed,target,policy,options){
  if(options&&options.light)return buildDeferredLight(state,best,staticRows,mode,route,settings,fixed,target,policy);
  const builtIds=new Set(best.actions.map(x=>x.id)),exact=best.lineup.map(u=>({id:u.id,name:displayNameOf(u),groupName:groupOf(u),family:unitFamily(u),unit:u,status:builtIds.has(u.id)?'planned':'owned',role:C.summarizeRoles?C.summarizeRoles({role:C.roleProfile(u)},mode):''})),ownedBoard=ownedFinalBoardCount(state);if(exact.length>=target&&best.requirements.complete)return exact;const slotCap=num(settings&&settings.currentRound)>=40&&ownedBoard>=target&&!best.requirements.complete?exact.length+1:target,futureSettings=Object.assign({},settings,{_deferredFuture:true});
  const beamLimit=4,branchLimit=6,rowLimit=DEFAULTS.candidateCap,initialHand=clone(best.counts),initialFutureActions=[],initialHandStats=deferredHandStats(state,initialHand,initialHand,initialFutureActions),initialUnits=best.lineup.slice(),initial={state,fixed,entries:exact,units:initialUnits,seen:new Set(exact.map(x=>x.id)),spec:Object.assign({},best.spec),main:best.mainUpper,requirements:best.requirements,stock:clone(best.counts),wisp:num(best.wisp),futureActions:initialFutureActions,totalWispCost:num(best.used&&best.used.wisp),hand:initialHandStats,fixedMissing:deferredFixedMissing(state,initialUnits,fixed),controlOverflow:controlCapOverflow(excessStun(best.spec),excessSlow(best.requirements)),overlapPenalty:num(lineupMaterialOverlap(state,initialUnits).penalty),memoSupport:curatedLineupEvidence(initialUnits),hardFeasible:true,hardMissingCount:0};let beam=[initial],archive=[initial],guard=0;
  while(beam.length&&guard++<slotCap*2){const children=[];for(const node of beam){if(node.entries.length>=slotCap||node.entries.length>=target&&node.requirements.complete)continue;const upperN=new Set(node.units.filter(C.isUpper).map(canonicalUpper)).size,changed=node.units.filter(C.isChanged).length,seraph=node.units.filter(C.isSeraph).length,trans=node.units.filter(C.isTranscend).length,candidates=[];
      for(const row of deferredCandidateRows(state,staticRows,fixed,rowLimit)){const u=row.unit;if(node.seen.has(u.id)||!allowedCandidate(u,mode,route,futureSettings,state,node.stock))continue;if(node.units.some(existing=>pairMaterialOverlap(state,existing,u).lineage))continue;if(C.isUpper(u)&&upperN>=maxUpperCount(mode,route,settings))continue;if(secondUpperBlocked(settings,u,fixed,state))continue;if(C.isSeraph(u)&&settings.seraphUsed+seraph>=1)continue;if(C.isTranscend(u)&&settings.transcendUsed+trans>=1)continue;if(C.isChanged(u)&&settings.changedUsed+changed>=2)continue;const prerequisite=prerequisiteStatus(state,u,node.stock);if(!prerequisite.allowed)continue;const solve=effectiveSolve(C.recipeSolve(state.db,u.id,node.stock),prerequisite);
        // A future reward may fill a missing non-wisp material, but selection
        // wisps are a finite shared inventory. Never create a slot that spends
        // more than the pool left by every earlier slot.
        const charge=futureWispCharge(state,solve,prerequisite),chargedWisp=charge.required;if(chargedWisp>num(node.wisp))continue;const requiredGain=staticPotential(row.vector,node.requirements),projectedRows=(node.requirements.rows||[]).map(item=>{const current=num(item.current)+requirementVectorValue(row.vector,item.key,node.requirements),targetValue=num(item.target);return Object.assign({},item,{current,gap:Math.max(0,targetValue-current)});}),requirementPriority=requirementPriorityVector({rows:projectedRows,route:node.requirements.route}),controlPenalty=incrementalStunPenalty(node.spec,row.vector)+incrementalSlowPenalty(node.requirements,row.vector),memoAffinity=num(curatedSupportEvidence(u).affinity),roleScore=num(row.mandatory)+((fixed||[]).includes(u.id)?1000:0)+num(row.blueprintBonus)+requiredGain-controlPenalty-candidateOverlapPenalty(state,u,node.units,node.stock)*OVERLAP_HEURISTIC_WEIGHT+memoAffinity*12,tierUse=solveTierBurn(state,solve);candidates.push({row,prerequisite,solve,chargedWisp,requiredGain,requirementPriority,controlPenalty,roleScore,tierUse,memoAffinity,hardBlocked:charge.dropPending,futureWispWorstCase:charge.worstCase});
      }
      const guarded=preserveCriticalSlowBudget(candidates,node.requirements,node.spec,node.wisp,mode,settings);guarded.sort((a,b)=>Number((fixed||[]).includes(b.row.unit.id))-Number((fixed||[]).includes(a.row.unit.id))||num(b.row.mandatory)-num(a.row.mandatory)||comparePriorityVectors(a.requirementPriority,b.requirementPriority)||Number(a.hardBlocked)-Number(b.hardBlocked)||num(a.controlPenalty)-num(b.controlPenalty)||compareTierBurn(a.tierUse,b.tierUse)||num(a.chargedWisp)-num(b.chargedWisp)||b.requiredGain-a.requiredGain||b.roleScore-a.roleScore||num(b.memoAffinity)-num(a.memoAffinity)||compareText(a.row.unit.id,b.row.unit.id));
      for(const pick of deferredBranchCandidates(guarded,node.requirements,branchLimit)){const row=pick.row,u=row.unit,beforeWisp=node.wisp,remaining=beforeWisp-num(pick.chargedWisp),after=clone(pick.solve.stockAfter);after[C.WISP_ID]=remaining;const nextSpec=addUnitRole(node.spec,u,mode),nextUnits=node.units.concat(u),nextMain=node.main||C.isUpper(u)&&u||null,nextRequirements=requirementRows(nextSpec,nextUnits,mode,route,settings,nextMain),pressure=commonPressure(pick.solve,node.stock,policy),action={order:node.futureActions.length+1,id:u.id,name:displayNameOf(u),unit:u,solve:pick.solve,wispCost:pick.chargedWisp,futureWispEstimate:num(pick.futureWispWorstCase),futureDropPending:pick.hardBlocked,remainingWisp:remaining,rareSpend:clone(pick.solve.rareUse),commonPressure:pressure},futureActions=node.futureActions.concat(action),hand=deferredHandStats(state,initialHand,after,futureActions),entry={id:u.id,name:displayNameOf(u),groupName:groupOf(u),family:unitFamily(u),unit:u,status:'future',role:C.summarizeRoles?C.summarizeRoles({role:C.roleProfile(u)},mode):'',reason:deferredReason(state,Object.assign({},row,{solve:pick.solve,prerequisite:pick.prerequisite}),{wisp:beforeWisp},settings),prerequisite:pick.prerequisite,futureDropPending:pick.hardBlocked,futureWispEstimate:num(pick.futureWispWorstCase),futureWispRequired:num(pick.chargedWisp)},hardMissingCount=num(node.hardMissingCount);children.push({state,fixed,entries:node.entries.concat(entry),units:nextUnits,seen:new Set([...node.seen,u.id]),spec:nextSpec,main:nextMain,requirements:nextRequirements,stock:after,wisp:remaining,futureActions,totalWispCost:num(best.used&&best.used.wisp)+num(best.wisp)-remaining,hand,fixedMissing:deferredFixedMissing(state,nextUnits,fixed),controlOverflow:controlCapOverflow(excessStun(nextSpec),excessSlow(nextRequirements)),overlapPenalty:num(lineupMaterialOverlap(state,nextUnits).penalty),memoSupport:curatedLineupEvidence(nextUnits),hardFeasible:node.hardFeasible,hardMissingCount});}
    }
    if(!children.length)break;children.sort((a,b)=>deferredNodeCompare(a,b,target));beam=children.slice(0,beamLimit);archive.push(...beam);if(beam.every(node=>node.entries.length>=slotCap||node.entries.length>=target&&node.requirements.complete))break;
  }
  archive.sort((a,b)=>deferredNodeCompare(a,b,target));const chosen=archive[0],plannedSpec=chosen.spec,plannedUnits=chosen.units,req=chosen.requirements,seen=chosen.seen;let finalEntries=chosen.entries;
  if(finalEntries.length>=target){const options=[],needsRoleRepair=!req.complete,baselineOverflow=controlCapOverflow(excessStun(plannedSpec),excessSlow(req)),specFor=units=>{let spec=emptyFinalSpec(mode);for(const unit of units){spec=addUnitRole(spec,unit,mode);spec.total++;}return spec;};
    for(let index=0;index<finalEntries.length;index++){if(finalEntries[index].status!=='future'||(fixed||[]).includes(finalEntries[index].id))continue;for(const candidateRow of staticRows){const candidate=candidateRow.unit;if(seen.has(candidate.id)||C.isUpper(candidate)||!allowedCandidate(candidate,mode,route,settings,state,best.counts))continue;if(plannedUnits.some((existing,i)=>i!==index&&pairMaterialOverlap(state,existing,candidate).lineage))continue;const units=plannedUnits.slice();units[index]=candidate;if(new Set(units.map(lineupKey)).size!==units.length)continue;if(units.filter(C.isSeraph).length+num(settings.seraphUsed)>1||units.filter(C.isTranscend).length+num(settings.transcendUsed)>1||units.filter(C.isChanged).length+num(settings.changedUsed)>2)continue;const spec=specFor(units),requirements=requirementRows(spec,units,mode,route,settings,mainUpperFor(state,Object.fromEntries(units.map(unit=>[unit.id,1])),fixed));if(!requirements.complete)continue;const overlap=lineupMaterialOverlap(state,units),candidateEntry={id:candidate.id,name:displayNameOf(candidate),unit:candidate,status:'future'},swapLineup=finalEntries.map((entry,entryIndex)=>entryIndex===index?candidateEntry:entry),feasibility=deferredFutureFeasibility(state,best,swapLineup),memoSupport=curatedLineupEvidence(units);options.push(Object.assign({index,row:candidateRow,units,spec,requirements,overlap,memoSupport,overflow:controlCapOverflow(excessStun(spec),excessSlow(requirements))},feasibility));}}
    // A role-fixing swap is not a valid fix if its whole future build order
    // exceeds the original shared wisp stock.
    options.sort(compareDeferredSwaps);const replacement=options.find(option=>option.hardFeasible&&option.wispFeasible&&(needsRoleRepair||num(option.overflow)+1e-9<num(baselineOverflow)));if(replacement){const u=replacement.row.unit;finalEntries[replacement.index]={id:u.id,name:displayNameOf(u),groupName:groupOf(u),family:unitFamily(u),unit:u,status:'future',role:C.summarizeRoles?C.summarizeRoles({role:C.roleProfile(u)},mode):'',reason:needsRoleRepair?'최종 클리어 스펙을 맞추는 가변 교체':'필수 스펙을 유지하며 초과 스턴·이감을 줄이는 가변 교체',prerequisite:prerequisiteStatus(state,u,best.counts)};}
  }
  return finalEntries;
}

function rareAllocation(state,initial,best,finalLineup){
  const usedBy={},spent={},reserved={},conflict={},free={};let futureStock=clone(best.counts);
  const push=(rareId,destination)=>{(usedBy[rareId]||(usedBy[rareId]=[])).push(destination);};
  for(const u of state.db.rares)free[u.id]=num(best.counts[u.id]);
  for(const action of best.actions)for(const [id,value] of Object.entries(action.solve.rareUse||{})){
    const count=num(value);spent[id]=num(spent[id])+count;push(id,{order:action.order,id:action.id,name:action.name,count,status:'spent',label:'제작 사용'});
  }
  // Future slots must be repriced in lineup order. Re-solving every slot from
  // `best.counts` made the same owned Rare appear reserved several times even
  // though the first slot had already consumed it. A later slot may still be a
  // future/reward candidate, but it cannot claim that original hand card again.
  for(const [index,row] of (finalLineup||[]).entries()){
    if(row.status!=='future'||!row.unit)continue;const prerequisite=prerequisiteStatus(state,row.unit,futureStock),solve=effectiveSolve(C.recipeSolve(state.db,row.id,futureStock),prerequisite),sources=[];
    for(const [id,value] of Object.entries(solve.rareUse||{})){
      const demand=num(value),claim=Math.min(num(free[id]),demand),short=Math.max(0,demand-claim);free[id]=Math.max(0,num(free[id])-claim);
      if(claim>0){reserved[id]=num(reserved[id])+claim;push(id,{order:index+1,id:row.id,name:row.name,count:claim,status:'reserved',label:'후속 예약'});sources.push({id,name:displayNameOf(state.db.byId.get(id)),count:claim,status:'reserved'});}
      if(short>0){conflict[id]=num(conflict[id])+short;push(id,{order:index+1,id:row.id,name:row.name,count:short,status:'conflict',label:'중복 충돌'});sources.push({id,name:displayNameOf(state.db.byId.get(id)),count:short,status:'conflict'});}
    }
    futureStock=clone(solve.stockAfter);row.rareSources=sources;
  }
  const rows=[];for(const u of state.db.rares){const before=num(initial[u.id]),used=num(spent[u.id]),held=num(reserved[u.id]),over=num(conflict[u.id]),remaining=num(free[u.id]);if(before<=0&&used<=0&&held<=0&&over<=0&&remaining<=0)continue;const rerollSuggested=remaining>0,kind=over>0?'conflict':rerollSuggested?'reroll':held>0?'reserved':used>0?'spent':'free';rows.push({id:u.id,name:displayNameOf(u),initial:before,spent:used,reserved:held,conflict:over,remaining,usedBy:usedBy[u.id]||[],rerollSuggested,kind});}
  const rank={conflict:0,reserved:1,spent:2,reroll:3,free:4};rows.sort((a,b)=>rank[a.kind]-rank[b.kind]||b.spent+b.reserved-a.spent-a.reserved||compareText(a.name,b.name));
  const summary=rows.reduce((out,row)=>{out.initial+=row.initial;out.spent+=row.spent;out.reserved+=row.reserved;out.conflict+=row.conflict;out.reroll+=row.rerollSuggested?row.remaining:0;return out;},{initial:0,spent:0,reserved:0,conflict:0,reroll:0});
  return{rows,summary,unused:rows.filter(x=>x.remaining>0).map(x=>({id:x.id,name:x.name,count:x.remaining,rerollSuggested:x.rerollSuggested}))};
}

// Full-hand allocation uses the same sequential stock as the planner. Actual
// action consumption is immutable; future slots then reserve what is still in
// that stock one by one, so a Rare/Special/Uncommon/Common card can never be
// promised to two different units. Protected Commons are shown as owned but
// remain outside the reservable pool.
function fullHandAllocation(state,initial,best,finalLineup,policy){
  const actualUsed=best.used&&best.used.consumedByTier?best.used:consumptionTotals(best.actions||[],state),spent=clone(actualUsed.consumedById),reserved={},conflict={},usedBy={},futureStock=clone(best.counts),actualWisp=num(actualUsed.wisp),initialWisp=num(initial&&initial[C.WISP_ID]),futureCommonMissing=clone(actualUsed.commonMissing),hardConflicts=[],futurePending=[];let futureWisp=Math.max(0,num(best.wisp)),futureCommonPressure=num(actualUsed.commonPressure);
  const addMap=(target,source)=>{for(const [id,value] of Object.entries(source||{}))target[id]=num(target[id])+num(value);};
  const push=(id,destination)=>{(usedBy[id]||(usedBy[id]=[])).push(destination);};
  for(const action of best.actions||[]){const materials=[];for(const [id,value] of Object.entries(action.solve&&action.solve.consumed||{})){const material=state.db.byId.get(id),tier=tierOf(material);if(!HAND_TIERS.includes(tier)||num(value)<=0)continue;const item={id,name:displayNameOf(material),tier,count:num(value),status:'spent'};materials.push(item);push(id,{order:action.order,id:action.id,name:action.name,count:num(value),status:'spent',label:'즉시 소비',materials});}}
  let reservedWisp=0,wispConflict=0,futureWorstCase=0;for(const [index,row] of (finalLineup||[]).entries()){
    if(row.status!=='future'||!row.unit)continue;const prerequisite=prerequisiteStatus(state,row.unit,futureStock),solve=effectiveSolve(C.recipeSolve(state.db,row.id,futureStock),prerequisite),materials=[],pressure=commonPressure(solve,futureStock,policy);futureCommonPressure+=num(pressure.penalty);addMap(futureCommonMissing,solve.lowestMissing);
    for(const [id,value] of Object.entries(solve.consumed||{})){const material=state.db.byId.get(id),tier=tierOf(material),claim=num(value);if(!HAND_TIERS.includes(tier)||claim<=0)continue;reserved[id]=num(reserved[id])+claim;const item={id,name:displayNameOf(material),tier,count:claim,status:'reserved'};materials.push(item);}
    for(const tier of ['rare','special','uncommon','common'])for(const [id,value] of Object.entries(solve.missingByTier&&solve.missingByTier[tier]||{})){if(num(value)<=0)continue;futurePending.push({id,name:C.materialName(state.db,id),tier,count:num(value),unitId:row.id,unitName:row.name});}
    for(const [id,value] of Object.entries(solve.lowestMissing||{}))if(num(value)>0)futurePending.push({id,name:C.materialName(state.db,id),tier:tierOf(state.db.byId.get(id)),count:num(value),unitId:row.id,unitName:row.name});
    if(!prerequisite.allowed)for(const item of prerequisite.missing||[])hardConflicts.push({id:item.id||'',name:item.name||'특수 선행 재료',tier:'prerequisite',count:num(item.count)||1,unitId:row.id,unitName:row.name});
    for(const tier of ['hard','other'])for(const [id,value] of Object.entries(solve.missingByTier&&solve.missingByTier[tier]||{}))if(num(value)>0)hardConflicts.push({id,name:C.materialName(state.db,id),tier,count:num(value),unitId:row.id,unitName:row.name});
    for(const item of materials)push(item.id,{order:index+1,id:row.id,name:row.name,count:item.count,status:'reserved',label:'후속 예약',materials});
    // Missing Commons always cost selection wisps in the guaranteed scenario.
    // A future random Rare/Special/Uncommon drop is diagnostic information,
    // never a credit that makes those missing Commons free.
    const charge=futureWispCharge(state,solve,prerequisite),wanted=charge.required,wispClaim=Math.min(futureWisp,wanted);futureWorstCase+=charge.worstCase;reservedWisp+=wispClaim;wispConflict+=Math.max(0,wanted-wispClaim);futureWisp=Math.max(0,futureWisp-wispClaim);futureStock[C.WISP_ID]=futureWisp;for(const [id,value] of Object.entries(solve.stockAfter||{}))futureStock[id]=value;futureStock[C.WISP_ID]=futureWisp;row.handSources=materials;row.futureDropPending=charge.dropPending;row.futureWispEstimate=charge.worstCase;row.futureWispRequired=wanted;row.reservedWisp=wispClaim;row.wispConflict=Math.max(0,wanted-wispClaim);
  }
  const tiers={};for(const tier of HAND_TIERS){const rows=[];for(const unit of handTierUnits(state,tier)){const protectedCount=tier==='common'?num(policy&&policy.reserved&&policy.reserved[unit.id]):0,before=num(initial&&initial[unit.id])+protectedCount,used=num(spent[unit.id]),held=num(reserved[unit.id]),over=num(conflict[unit.id]),remaining=num(futureStock[unit.id])+protectedCount;if(before<=0&&used<=0&&held<=0&&over<=0&&remaining<=0)continue;rows.push({id:unit.id,name:displayNameOf(unit),initial:before,spent:used,reserved:held,conflict:over,protected:protectedCount,remaining,usedBy:usedBy[unit.id]||[]});}
    rows.sort((a,b)=>b.conflict-a.conflict||b.spent+b.reserved-a.spent-a.reserved||compareText(a.name,b.name));const summary=rows.reduce((out,row)=>{const assigned=row.spent+row.reserved,available=Math.max(0,row.initial-row.protected),availableLeft=Math.max(0,row.remaining-row.protected);out.initial+=row.initial;out.spent+=row.spent;out.reserved+=row.reserved;out.conflict+=row.conflict;out.protected+=row.protected;out.remaining+=row.remaining;if(row.spent>0)out.usedTypes++;if(assigned>0)out.assignedTypes++;if(available>0&&availableLeft<=0)out.clearedTypes++;return out;},{initial:0,spent:0,reserved:0,conflict:0,protected:0,remaining:0,usedTypes:0,assignedTypes:0,clearedTypes:0});summary.used=summary.spent;summary.assigned=summary.spent+summary.reserved;summary.wispSubstitute=0;const destinations=[];for(const row of rows)for(const destination of row.usedBy)if(!destinations.some(item=>item.id===destination.id&&item.status===destination.status))destinations.push(destination);tiers[tier]=Object.assign({rows,summary,usedBy:destinations},summary);
  }
  const requiredWisp=actualWisp+reservedWisp+wispConflict;if(tiers.common){tiers.common.summary.wispSubstitute=requiredWisp;tiers.common.wispSubstitute=requiredWisp;}
  const actual=best.handFit||handFitMetrics(state,initial,best.counts,actualUsed),allocationUsed={wisp:requiredWisp,commonMissing:futureCommonMissing,commonPressure:futureCommonPressure,consumedByTier:{rare:{},special:{},uncommon:{},common:{}}};for(const tier of HAND_TIERS)for(const row of tiers[tier].rows){const assigned=row.spent+row.reserved;if(assigned>0)allocationUsed.consumedByTier[tier][row.id]=assigned;}
  const allocation=handFitMetrics(state,initial,futureStock,allocationUsed),hardConflictTotal=hardConflicts.reduce((total,item)=>total+num(item.count),0);return{basis:'spent-and-reserved-final-lineup',metrics:allocation.metrics,actualMetrics:actual.metrics,allocationTiers:allocation.tiers,tiers,wisp:{initial:initialWisp,used:actualWisp,spent:actualWisp,reserved:reservedWisp,conflict:wispConflict,required:requiredWisp,remaining:futureWisp,futureWorstCase},hardConflicts,hardConflictTotal,futurePending,feasible:hardConflictTotal<=0&&wispConflict<=0,futureReservations:true};
}

function wispBudgetSummary(handFit,plannedCount,targetCount,roleComplete){
  const source=handFit&&handFit.wisp||{},available=num(source.initial),required=num(source.required),futureWorstCase=num(source.futureWorstCase),worstCaseRequired=num(source.used)+futureWorstCase,shortage=Math.max(0,num(source.conflict),required-available),remaining=Math.max(0,available-required),withinBudget=shortage<=0&&required<=available,rolesVerified=roleComplete!==false,enoughSlots=num(plannedCount)>=num(targetCount),fullPartyFeasible=withinBudget&&enoughSlots&&rolesVerified,evidence=fullPartyFeasible?'current-stock-funded-and-role-complete':withinBudget&&enoughSlots&&!rolesVerified?'role-incomplete':'future-random-drops-not-funded';return{available,required,guaranteedRequired:required,used:num(source.used),reserved:num(source.reserved),futureWorstCase,worstCaseRequired,remaining,shortage,unfundedDebt:shortage,withinBudget,roleComplete:rolesVerified,fullPartyFeasible,evidence};
}

function bottleneckRows(state,initial,best,policy,alternates){
  const req=best.used.commonRequired,missing=best.used.commonMissing,rows=[];
  for(const u of state.db.commons){const id=u.id,name=nameOf(u),initialFree=num(initial[id]),reserved=num(policy.reserved[id]),required=num(req[id]),substituted=num(missing[id]),remaining=num(best.counts[id])+reserved,scarce=initialFree<=Math.max(1,policy.median*.35),isUsopp=id===policy.usopp;
    if(required<=0&&!isUsopp&&!policy.avoid.has(id))continue;if(required<=0&&isUsopp&&!scarce)continue;
    let severity=substituted>0?'high':remaining<=reserved||scarce&&required>0?'watch':'ok';const better=(alternates||[]).map(n=>({node:n,need:num(n.used&&n.used.commonRequired&&n.used.commonRequired[id])})).filter(x=>x.need<required).sort((a,b)=>a.need-b.need||b.node.score-a.node.score)[0];
    const why=isUsopp&&scarce?(better?'필수 스펙을 유지하는 저우솝 대안을 함께 비교합니다.':substituted?`필수 스펙을 우선하고 부족 우솝 ${substituted}개는 선택 위습으로 대체합니다.`:'필수 스펙 우선으로 병렬 탐색했으나 더 낮은 우솝 경로가 없습니다.'):substituted?`부족 ${substituted}개를 선택 위습으로 보충합니다.`:'현재 재고 안에서 소모합니다.';rows.push({id,name,initial:initialFree+reserved,reserved,required,substituted,remaining,severity,why,alternative:better?better.node.actions.map(x=>x.name).slice(0,3):[]});
  }
  const rank={high:0,watch:1,ok:2};return rows.sort((a,b)=>rank[a.severity]-rank[b.severity]||(a.name==='우솝'?-1:0)-(b.name==='우솝'?-1:0)||b.required-a.required||compareText(a.name,b.name));
}

function finalPatchOptions(state,best,staticRows,mode,settings){
  const protectedStock=clone(best.counts),ownedIds=new Set(best.lineup.map(u=>u.id));
  for(const u of best.lineup)protectedStock[u.id]=0;
  const deficitLabels=best.requirements.deficits.filter(x=>x.required).slice(0,3).map(x=>x.label),familyOk=u=>{const family=unitFamily(u);return family===mode||family==='neutral';},lineageOk=u=>!best.lineup.some(existing=>pairMaterialOverlap(state,existing,u).lineage);
  const option=(kind,label,candidates,availableRound=1)=>{
    const ranked=(candidates||[]).filter(u=>u&&!ownedIds.has(u.id)&&familyOk(u)&&lineageOk(u)&&prerequisiteStatus(state,u,protectedStock).allowed).map(u=>{const vector=roleVector(u,mode),gain=staticPotential(vector,best.requirements)-incrementalStunPenalty(best.spec,vector)-candidateOverlapPenalty(state,u,best.lineup,protectedStock)*OVERLAP_HEURISTIC_WEIGHT,prerequisite=prerequisiteStatus(state,u,protectedStock),solve=effectiveSolve(C.recipeSolve(state.db,u.id,protectedStock),prerequisite),feasible=!missingNonWisp(solve,prerequisite)&&solve.wispCost<=best.wisp;return{u,vector,gain,solve,feasible};}).sort((a,b)=>Number(b.feasible)-Number(a.feasible)||b.gain-a.gain||a.solve.wispCost-b.solve.wispCost||compareText(nameOf(a.u),nameOf(b.u))),pick=ranked[0];
    if(!pick)return{kind,label,availableRound,status:'none',reason:'현재 데이터에서 역할이 맞는 후보를 찾지 못했습니다.'};
    const locked=num(settings.currentRound)<availableRound;return{kind,label,availableRound,status:locked?'locked':pick.feasible?'ready':'future',id:pick.u.id,name:displayNameOf(pick.u),unit:pick.u,wispCost:pick.solve.wispCost,roles:C.summarizeRoles?C.summarizeRoles({role:C.roleProfile(pick.u)},mode):'',reason:`${deficitLabels.join(' · ')||'남은 자리'} 보강 후보${locked?` · ${availableRound}라 이후 사용`:pick.feasible?' · 현재 잔여 재료로 제작 가능':' · 후속 보상·재료 필요'}`};
  };
  const legend=state.db.legendish.filter(u=>!C.isUpper(u)&&!(C.isShip&&C.isShip(u))&&!(C.isChanged&&C.isChanged(u))),ships=state.db.legendish.filter(u=>C.isShip&&C.isShip(u)),changed=state.db.legendish.filter(u=>C.isChanged&&C.isChanged(u));
  const rares=state.db.rares.filter(familyOk),pairs=[];for(let i=0;i<rares.length;i++)for(let j=i;j<rares.length;j++){const a=rares[i],b=rares[j],va=roleVector(a,mode),vb=roleVector(b,mode),vector={};for(const key of new Set(Object.keys(va).concat(Object.keys(vb))))vector[key]=num(va[key])+num(vb[key]);pairs.push({a,b,gain:staticPotential(vector,best.requirements),vector});}
  pairs.sort((a,b)=>b.gain-a.gain||compareText(`${nameOf(a.a)}|${nameOf(a.b)}`,`${nameOf(b.a)}|${nameOf(b.b)}`));const pair=pairs[0],rarePair=pair?{kind:'rarePair',label:'희귀 2기 보강',availableRound:50,status:num(settings.currentRound)<50?'locked':'future',ids:[pair.a.id,pair.b.id],names:[displayNameOf(pair.a),displayNameOf(pair.b)],units:[pair.a,pair.b],roles:[pair.a,pair.b].map(u=>C.summarizeRoles?C.summarizeRoles({role:C.roleProfile(u)},mode):''),reason:`${deficitLabels.join(' · ')||'남은 자리'}에 가장 가까운 희귀 2기 조합 · 새 보상에서 확보 시 사용`}:{kind:'rarePair',label:'희귀 2기 보강',availableRound:50,status:'none',reason:'희귀 역할 후보가 없습니다.'};
  return[option('legendHidden','전설·히든 1기',legend),option('ship','해적선 1기',ships,25),rarePair,option('changed','변화됨 1기',changed,50)];
}

function alternativeSummary(node,route){return{route,routeLabel:ROUTE_LABELS[route],score:node.score,projectedCount:node.projectedCount,readiness:node.requirements.readiness,wispCost:node.used.wisp,materialOverlap:node.materialOverlap,lineup:node.lineup.map(u=>({id:u.id,name:displayNameOf(u)})),actions:node.actions.map(x=>({id:x.id,name:x.name,wispCost:x.wispCost}))};}

function routeSnapshot(result,selected){
  const current=result.roleCoverage||{},planned=current.planned||{},missing=(planned.rows||[]).filter(x=>x.required&&x.gap>0).map(x=>`${x.label} +${x.gap}`);
  return{route:result.magicRoute,label:result.routeLabel,selected:!!selected,currentComplete:!!current.complete,plannedComplete:!!planned.complete,readiness:num(current.readiness),plannedReadiness:num(planned.readiness),projectedCount:num(result.projectedCount),plannedCount:num(result.plannedCount),stun:num(planned.spec&&planned.spec.stun),missing};
}

function compareRoutePlans(a,b){
  const ax=a&&a.safePrefix||{},bx=b&&b.safePrefix||{},prefixOrder=comparePriorityVectors(ax.rankVector,bx.rankVector);if(prefixOrder)return prefixOrder<0?a:b;
  if((ax.actions||[]).length!==(bx.actions||[]).length)return(ax.actions||[]).length>(bx.actions||[]).length?a:b;
  const ap=a.roleCoverage.planned,bp=b.roleCoverage.planned;
  const awf=!!(a.wispBudget&&a.wispBudget.fullPartyFeasible),bwf=!!(b.wispBudget&&b.wispBudget.fullPartyFeasible);if(awf!==bwf)return awf?a:b;
  const af=!a.handFit||a.handFit.feasible!==false,bf=!b.handFit||b.handFit.feasible!==false;if(af!==bf)return af?a:b;
  if(ap.complete!==bp.complete)return ap.complete?a:b;if(a.complete!==b.complete)return a.complete?a:b;
  if(ap.readiness!==bp.readiness)return ap.readiness>bp.readiness?a:b;if(a.roleCoverage.readiness!==b.roleCoverage.readiness)return a.roleCoverage.readiness>b.roleCoverage.readiness?a:b;
  if(a.projectedCount!==b.projectedCount)return a.projectedCount>b.projectedCount?a:b;
  if(num(a.materialOverlap&&a.materialOverlap.lineagePairs)!==num(b.materialOverlap&&b.materialOverlap.lineagePairs))return num(a.materialOverlap&&a.materialOverlap.lineagePairs)<num(b.materialOverlap&&b.materialOverlap.lineagePairs)?a:b;
  const ao=controlCapOverflow(excessStun(ap.spec),excessSlow({rows:ap.rows})),bo=controlCapOverflow(excessStun(bp.spec),excessSlow({rows:bp.rows}));if(ao!==bo)return ao<bo?a:b;
  const tierOrder=compareTierBurn(a.handFit,b.handFit);if(tierOrder)return tierOrder<0?a:b;
  const aw=num(a.handFit&&a.handFit.wisp&&a.handFit.wisp.required),bw=num(b.handFit&&b.handFit.wisp&&b.handFit.wisp.required);if(aw!==bw)return aw<bw?a:b;
  const handOrder=compareHandFit(a.handFit&&a.handFit.metrics,b.handFit&&b.handFit.metrics);if(handOrder)return handOrder<0?a:b;
  if(num(a.materialOverlap&&a.materialOverlap.penalty)!==num(b.materialOverlap&&b.materialOverlap.penalty))return num(a.materialOverlap&&a.materialOverlap.penalty)<num(b.materialOverlap&&b.materialOverlap.penalty)?a:b;
  const ae=excessStun(ap.spec),be=excessStun(bp.spec);if(ae!==be)return ae<be?a:b;const asp=num(ax.storyProxy),bsp=num(bx.storyProxy);if(asp!==bsp)return asp>bsp?a:b;return a.score>=b.score?a:b;
}

function finishPlanOne(input,state,settings,policy,route,fixed,searched,blueprintAttempt){
  const target=settings.targetSquadCount,resolved=resolveFinalPlanning(state,searched.best,staticCandidatePool(searched.staticData),settings.mode,route,settings,fixed,target,policy),best=resolved.best,finalLineup=resolved.finalLineup,alloc=rareAllocation(state,state.counts,best,finalLineup),handFit=fullHandAllocation(state,state.counts,best,finalLineup,policy),bottlenecks=bottleneckRows(state,state.counts,best,policy,searched.alternates),coreDeficits=C.deficits?C.deficits(best.spec,settings.mode,Object.assign({},settings,{magicRoute:route,_upperUnit:best.mainUpper})):null;
  let plannedSpec=emptyFinalSpec(settings.mode),plannedUnits=finalLineup.map(row=>row.unit).filter(Boolean),plannedMain=plannedUnits.find(C.isUpper)||null;for(const unit of plannedUnits){plannedSpec=addUnitRole(plannedSpec,unit,settings.mode);plannedSpec.total=num(plannedSpec.total)+1;}const plannedRequirements=requirementRows(plannedSpec,plannedUnits,settings.mode,route,settings,plannedMain),routeEvaluation=routeEvaluationFor(plannedUnits,plannedRequirements,settings.mode,route),wispBudget=wispBudgetSummary(handFit,finalLineup.length,target,plannedRequirements.complete&&routeEvaluation.confirmable),materialOverlap=lineupMaterialOverlap(state,plannedUnits);
  const deficits=best.requirements.deficits,explanation=[`${ROUTE_LABELS[route]} 기준 ${target}칸을 전역 탐색했습니다.`,`${best.projectedCount}칸은 현재 재료로 순서대로 제작 가능하며 선택 위습 ${best.used.wisp}개를 사용합니다.`,deficits.length?`남은 핵심 결손: ${deficits.filter(x=>x.required).map(x=>`${x.label} ${x.gap}`).join(' · ')||'없음'}`:'필수 클리어 스펙을 충족합니다.'];
  const upperConcept=plannedMain&&C.upperStrategy?C.upperStrategy(plannedMain):null;
  return{version:VERSION,mode:settings.mode,magicRoute:route,routeLabel:ROUTE_LABELS[route],targetCount:target,projectedCount:best.projectedCount,plannedCount:finalLineup.length,complete:best.complete,finalLineup,actions:best.actions,rareAllocation:alloc.rows,rareSummary:alloc.summary,unusedRare:alloc.unused,handFit,wispBudget,routeEvaluation,bottlenecks,finalPatchOptions:finalPatchOptions(state,best,searched.staticData.rows,settings.mode,settings),upperConcept:upperConcept?{key:upperConcept.key,label:upperConcept.label,summary:upperConcept.summary,needs:upperConcept.needs||[]}:null,roleCoverage:{basis:'final-only',readiness:best.requirements.readiness,complete:best.requirements.complete,rows:best.requirements.rows,spec:best.spec,currentStage:{basis:'all-owned-live',spec:searched.liveSpec},core:coreDeficits,planned:{basis:'final-only',readiness:plannedRequirements.readiness,complete:plannedRequirements.complete,rows:plannedRequirements.rows,spec:plannedSpec,excessStun:excessStun(plannedSpec),excessSlow:excessSlow(plannedRequirements)}},deficits,alternatives:searched.alternates.slice(0,3).map(x=>alternativeSummary(x,route)),score:best.score,materialOverlap,explanation,afterStock:clone(best.counts),remainingWisp:best.wisp,resourceUse:best.used,search:{candidateCount:searched.staticData.rows.length,shortlistCount:searched.staticData.shortlist.length,beamWidth:DEFAULTS.beamWidth,maxDepth:DEFAULTS.maxDepth},_search:searched,_blueprintAttempt:blueprintAttempt};
}

function planOne(input,state,settings,policy,route,fixed,blueprint){
  const routeSettings=settingsForRoute(settings,route),blueprintAttempt=blueprint&&blueprint.fullPartyVerified!==false?searchExactBlueprint(state,routeSettings.mode,route,routeSettings,policy,fixed,blueprint):null,searched=blueprintAttempt&&blueprintAttempt.success?blueprintAttempt.searched:searchRoute(state,routeSettings.mode,route,routeSettings,policy,fixed),result=decorateLegendEquivalent(finishPlanOne(input,state,routeSettings,policy,route,fixed,searched,blueprintAttempt),settings);result.decision=squadDecisionSummary(state,result);result.safePrefix=exactPrefixPlan(state,routeSettings.mode,route,routeSettings,policy,fixed);result.timelineReadiness=timelineReadiness(state,result,routeSettings,fixed);return result;
}

function choosePreparedPlan(input,state,settings,policy,fixed,blueprint){let result;
  if(settings.mode==='magic'&&settings.magicRoute==='auto'){
    const dual=planOne(input,state,settings,policy,'dual',fixed,blueprint),single=planOne(input,state,settings,policy,'singleEnd',fixed,blueprint);result=compareRoutePlans(dual,single);const other=result===dual?single:dual;result.alternatives.unshift({route:other.magicRoute,routeLabel:other.routeLabel,score:other.score,projectedCount:other.projectedCount,readiness:other.roleCoverage.readiness,wispCost:other.resourceUse.wisp,lineup:other.finalLineup.map(x=>({id:x.id,name:x.name,status:x.status})),actions:other.actions.map(x=>({id:x.id,name:x.name,wispCost:x.wispCost}))});result.requestedMagicRoute='auto';result.routeComparison={selected:result.magicRoute,reason:result.roleCoverage.planned.complete&&!other.roleCoverage.planned.complete?'최종 9기에서 클리어 조건을 충족하는 경로를 선택했습니다.':result.roleCoverage.planned.readiness!==other.roleCoverage.planned.readiness?'최종 9기의 필수 스펙 충족도가 더 높은 경로를 선택했습니다.':excessStun(result.roleCoverage.planned.spec)<excessStun(other.roleCoverage.planned.spec)?'필수 조건이 같아 불필요한 초과 스턴이 적은 경로를 선택했습니다.':'현재 패로 더 많이 완성 가능한 경로를 선택했습니다.',routes:[routeSnapshot(dual,result===dual),routeSnapshot(single,result===single)]};
  }else result=planOne(input,state,settings,policy,routeFor(settings.mode,settings.magicRoute),fixed,blueprint);
  return result;
}

function blueprintMetadata(state,blueprint,result){
  if(!blueprint)return{active:false,status:'none',requestedIds:[],matchedIds:[],replacedIds:[],replacements:[],reason:'확정 파티 없음',allWispFeasible:false};
  if(blueprint.fullPartyVerified===false)return{active:true,status:'draft',commitment:'upper-route',adaptiveSupports:true,fullPartyVerified:false,upperId:blueprint.upperId,revision:blueprint.revision,requestedIds:blueprint.lineupIds.slice(),matchedIds:[],replacedIds:[],replacements:[],reason:'상위·딜 계통만 잠갔습니다. 보조 조합은 현재 패가 바뀔 때마다 다시 계산합니다.',allWispFeasible:false};
  const requestedCounts=lineupKeyCounts(state,blueprint.lineupIds),remaining=clone(requestedCounts),matchedIds=[],replacements=[];
  for(const row of result.finalLineup||[]){const u=row.unit||state.db.byId.get(row.id),key=u&&lineupKey(u);if(u&&num(remaining[key])>0){matchedIds.push(u.id);remaining[key]--;}else if(u)replacements.push({id:u.id,name:displayNameOf(u)});}
  const replacedIds=[];for(const id of blueprint.lineupIds){const u=state.db.byId.get(id),key=u&&lineupKey(u);if(u&&num(remaining[key])>0){replacedIds.push(id);remaining[key]--;}}
  const attempt=result._blueprintAttempt,kept=!!(attempt&&attempt.success&&replacedIds.length===0&&replacements.length===0),usable=result.plannedCount===result.targetCount&&result.roleCoverage&&result.roleCoverage.planned&&result.roleCoverage.planned.complete&&(!result.wispBudget||result.wispBudget.fullPartyFeasible)&&(!result.handFit||result.handFit.feasible!==false),status=kept?'kept':usable?'adapted':'invalid';
  return{active:true,status,commitment:'full-party',adaptiveSupports:blueprint.adaptiveSupports!==false,fullPartyVerified:true,upperId:blueprint.upperId,revision:blueprint.revision,requestedIds:blueprint.lineupIds.slice(),matchedIds,replacedIds,replacements,reason:kept?attempt.reason:attempt&&attempt.reason||'확정 파티의 가능한 자리는 유지하고 부족 역할만 가변 교체했습니다.',allWispFeasible:kept};
}

// A resource-constrained draft may correctly omit an unbuilt upper.  The old
// ranking then compared identical support-only role sheets for every upper.
// Keep the material plan untouched and calculate a separate, explicitly
// hypothetical sheet that includes the candidate's combat roles.
function projectUpperCandidate(state,plan,upper,settings){
  const mode=plan&&plan.mode||settings&&settings.mode||'physical',route=plan&&plan.magicRoute||routeFor(mode,settings&&settings.magicRoute),rows=(plan&&plan.finalLineup||[]).map(row=>Object.assign({},row,{unit:row.unit||state.db.byId.get(row.id)})).filter(row=>row.unit),targetBoard=num(plan&&plan.targetBoardCount||plan&&plan.targetCount||routeBoardTarget(settings||{},mode,route)),key=canonicalUpper(upper);let includedIndex=rows.findIndex(row=>C.isUpper(row.unit)&&canonicalUpper(row.unit)===key),replacedFutureId='',appended=false;
  if(includedIndex>=0)rows[includedIndex]=Object.assign({},rows[includedIndex],{id:upper.id,unit:upper});
  else{
    if(rows.length>=targetBoard)for(let index=rows.length-1;index>=0;index--){const row=rows[index];if(row.status==='future'&&!C.isUpper(row.unit)){includedIndex=index;replacedFutureId=row.id;break;}}
    const candidate={id:upper.id,name:displayNameOf(upper),unit:upper,status:'hypothetical-upper'};
    if(includedIndex>=0)rows[includedIndex]=candidate;else{rows.push(candidate);includedIndex=rows.length-1;appended=true;}
  }
  const units=rows.map(row=>row.unit),spec=units.reduce((value,unit)=>{const next=addUnitRole(value,unit,mode);next.total=num(next.total)+1;return next;},emptyFinalSpec(mode)),requirements=requirementRows(spec,units,mode,route,settings||{},upper),evaluation=routeEvaluationFor(units,requirements,mode,route),owned=num(state.counts&&state.counts[upper.id])>0;
  return{hypothetical:!owned,resourceVerified:owned,includedUpperId:upper.id,replacedFutureId,appended,overTarget:rows.length>targetBoard,boardCount:rows.length,legendEquivalent:legendEquivalentCount(units),spec,rows:requirements.rows,readiness:requirements.readiness,roleSheetComplete:requirements.complete,requirementPriority:requirementPriorityVector({rows:requirements.rows,route}),routeEvaluation:evaluation};
}

function upperPreparationFor(state,upper){
  const prerequisite=prerequisiteStatus(state,upper,state.counts),solve=effectiveSolve(C.recipeSolve(state.db,upper.id,state.counts),prerequisite),direct=directOrdinaryStats(state,solve);
  // `solve.direct[].owned` only describes already-completed direct ingredients.
  // A missing direct Legend/Rare can still be built exactly from the current
  // lower hand and selection wisps; adding `direct.missing` here labelled those
  // fully quoted paths as future material debt.  R30 Kaido/Shiki/Sanji were in
  // safePrefix and craftable now, yet all became "미래각".  The recursive
  // solver's unresolved leaf ledger is the authority for material readiness.
  const ordinaryMissing=['rare','special','uncommon','other'].reduce((total,tier)=>total+sum(solve.missingByTier&&solve.missingByTier[tier]),0),materialReady=prerequisite.allowed&&!missingNonWisp(solve,prerequisite)&&ordinaryMissing<=0,wispCost=num(solve.wispCost),wispGap=materialReady?Math.max(0,wispCost-num(state.wisp)):0,used=consumptionTotals([{solve}],state),fit=handFitMetrics(state,state.counts,solve.stockAfter,used),rare=fit.tiers&&fit.tiers.rare||{},special=fit.tiers&&fit.tiers.special||{};
  return{recipeVerified:true,prerequisiteOwned:prerequisite.allowed,materialReady,immediate:materialReady&&wispGap<=0,ordinaryMissing,ordinaryOwned:num(direct.owned),wispCost,wispGap,rareInitial:num(rare.initial),rareUsed:num(rare.spent),rareUsedTypes:num(rare.usedTypes),rareClearedTypes:num(rare.clearedTypes),rareUtilization:num(rare.utilization),specialInitial:num(special.initial),specialUsed:num(special.spent),specialUsedTypes:num(special.usedTypes),specialClearedTypes:num(special.clearedTypes),specialUtilization:num(special.utilization),tierUse:solveTierBurn(state,solve)};
}

function curatedPackageEvidence(upper,lineup,supportMemo){
  const empty={source:'none',score:0,hitCount:0,coreHits:0,hits:[]};
  if(!upper||!supportMemo||!C||typeof C.upperMemoFor!=='function')return empty;
  const entry=C.upperMemoFor(upper,supportMemo);if(!entry)return empty;
  const byId=new Map();
  for(const support of entry.supports||[])for(const id of support.unitIds||[]){const rank=Math.max(1,num(support.rank)||999),prior=byId.get(String(id));if(!prior||rank<prior.rank)byId.set(String(id),{id:String(id),name:String(support.name||''),rank,reason:String(support.reason||support.reinforce||'')});}
  const hits=[];
  for(const item of lineup||[]){const unit=item&&item.unit||item,id=String(unit&&unit.id||item&&item.id||''),match=byId.get(id);if(match&&unit&&!C.isUpper(unit))hits.push(Object.assign({affinity:supportRankAffinity(match.rank)},match));}
  hits.sort((a,b)=>a.rank-b.rank||compareText(a.id,b.id));const core=hits.slice(0,3),score=core.reduce((total,row)=>total+num(row.affinity),0);
  return{source:'ord-synergy-memo',score:round(score,3),hitCount:hits.length,coreHits:core.filter(row=>row.rank<=3).length,hits:core};
}
function upperSafetyBand(row){
  if(row&&row.guaranteed&&row.clearComplete)return 3;
  if(row&&row.safePrefix&&row.safePrefix.checkpointPass)return 2;
  if(num(row&&row.prefixActionCount)>0)return 1;
  return 0;
}
// v17.21: `prefixActionCount>=2`는 "지금 순차로 만들 게 2개 이상 남아
// 있어야 각"이라는 뜻이라 뒤집혀 있었다 — 이미 목표 환산을 채워 더
// 만들 게 없는 보드가 오히려 미래각(0)으로 떨어진다.  남은 행동 수가
// 아니라 "경로가 있거나 이미 도착했는가"를 본다.
//
// (조사 기록) 로그 4판을 재생하면 좋은각·완벽각이 여전히 0건인데, 그건
// 이 조건 때문이 아니라 safePrefix.checkpointPass가 전부 false이기
// 때문이다.  0724(필수 결손이 처음으로 전부 닫힌 판)의 50라조차
// readiness 93~98에 checkpointPass false다 — 이감·방깎 결손이 열려
// 있으면 체크포인트를 못 지나기 때문이며, 각 판정은 그걸 정직하게
// 보고하고 있다.  임계값을 낮춰 각이 아닌 판을 각이라 부르지 않는다.
function angleHasPath(row){
  const target=num(row&&row.plan&&row.plan.targetCount)||9;
  return num(row&&row.prefixActionCount)>=2||num(row&&row.projectedCount)>=target;
}
function upperStartsPrefix(row){
  const key=canonicalUpper({id:String(row&&row.upperId||'')});
  return!!key&&(row&&row.safePrefix&&row.safePrefix.actions||[]).some(action=>canonicalUpper({id:String(action&&action.id||'')})===key);
}
function upperAngleBand(row){
  if(!row||num(row.rareConflict)>0||num(row.lineagePairs)>0||num(row.controlCapOverflow)>0)return 0;
  const prep=row.upperPreparation||{},prefix=row.safePrefix||{};
  // 선택위습 24개 이상은 현재 패의 좋은 각이 아니다. 역할표가 좋아도
  // 게임 내 후보 상한(23)을 넘긴 허상 경로를 티어 승격시키지 않는다.
  if(num(prep.wispCost)>num(C.MAX_WISP_COST||23))return 0;
  // "패만 봐도 각"의 실제 신호: 현재 보유 Rare를 직접 비우는 상위가
  // 지금 선위로 제작되고, 그 상위가 검증 prefix 안에 있어야 한다.
  // 미래에 만들 Rare나 랜덤 드랍은 여기서 세지 않는다.
  const handAngle=prep.immediate&&num(prep.rareUsed)>0&&num(prep.rareClearedTypes)>0&&num(prep.wispCost)<=num(C.PREFERRED_WISP_COST||10)&&upperStartsPrefix(row);
  if(row.guaranteed&&row.clearComplete&&prep.immediate)return 3;
  if(handAngle&&num(prep.rareClearedTypes)>=2&&row.roleComplete&&num(row.readiness)>=85&&num(row.wispShortage)<=0)return 3;
  if(handAngle&&num(row.readiness)>=70&&num(row.hardConflictTotal)<=0&&num(row.wispConflict)<=0)return 2;
  if(prefix.checkpointPass&&row.roleComplete&&num(row.readiness)>=85&&angleHasPath(row)&&num(row.wispShortage)<=0&&num(row.futureDependencyCount)<=0)return 2;
  if(prep.materialReady&&upperStartsPrefix(row)&&(num(prep.rareUsed)>0||num(prep.specialUsed)>0)&&num(row.readiness)>=60)return 1;
  if(prefix.checkpointPass&&num(row.projectedCount)>=6&&num(row.readiness)>=70&&angleHasPath(row))return 1;
  return 0;
}
function decorateUpperStrategy(row,state,upper){
  const powerTier=C&&typeof C.upperPowerTier==='function'?C.upperPowerTier(upper,state&&state.db):{known:false,letter:'',rank:-1,source:'unknown',sourceId:''},safetyBand=upperSafetyBand(row),angleBand=upperAngleBand(row),tierPromotion=angleBand>=3?2:angleBand>=2?1:0,effectiveTierRank=powerTier.known?Math.min(5,num(powerTier.rank)+tierPromotion):-1,angleLabel=angleBand===3?'완벽각':angleBand===2?'좋은각':angleBand===1?'준비각':'미래각';
  return Object.assign(row,{powerTier,safetyBand,angleBand,angleLabel,tierPromotion,effectiveTierRank});
}

function upperBlueprintCompare(a,b){
  const ag=!!a.guaranteed,bg=!!b.guaranteed;if(ag!==bg)return Number(bg)-Number(ag);
  // v17.21: "각이 아주 잘 나오지 않는 이상 좋은 상위를 간다"를 순서로
  // 옮긴다.  티어보다 앞설 수 있는 각은 완성 보장(guaranteed)과 angleBand
  // 승격(effectiveTierRank)뿐이다.  자원 가용성(handFeasible/wispFeasible)과
  // safetyBand는 "각"이 아니라 근접성이라 티어 뒤로 보낸다 — 이전 순서에서는
  // 그 근접성만으로 D티어가 B티어 위로 올라왔고, 그게 사용자가 지적한
  // "가반이 좋지도 않은데 계속 올라온다"와 같은 현상이다.
  const at=a.powerTier||{},bt=b.powerTier||{},ae=a.effectiveTierRank!=null&&num(a.effectiveTierRank)>=0?num(a.effectiveTierRank):at.known?num(at.rank):null,be=b.effectiveTierRank!=null&&num(b.effectiveTierRank)>=0?num(b.effectiveTierRank):bt.known?num(bt.rank):null;
  if(at.known&&bt.known&&ae!==be)return be-ae;
  // 보유 희귀 소모는 실제 후보 상한(선위 23) 안에서만 현재 패 각으로
  // 쓴다. 52위습 허상 상위가 희귀 1장을 태운다는 이유로 5위습 후보를
  // 밀어내면, 아래의 wispGap 비교까지 도달하지 못한다.
  const rareAngleUse=row=>num(row&&row.upperPreparation&&row.upperPreparation.wispCost)>num(C.MAX_WISP_COST||23)?0:num(row&&row.upperPreparation&&row.upperPreparation.rareUsed);
  const aOwnedRare=rareAngleUse(a),bOwnedRare=rareAngleUse(b);if(aOwnedRare!==bOwnedRare)return bOwnedRare-aOwnedRare;
  if(!!a.handFeasible!==!!b.handFeasible)return Number(!!b.handFeasible)-Number(!!a.handFeasible);
  if(!!a.wispFeasible!==!!b.wispFeasible)return Number(!!b.wispFeasible)-Number(!!a.wispFeasible);
  const as=num(a.safetyBand!=null?a.safetyBand:upperSafetyBand(a)),bs=num(b.safetyBand!=null?b.safetyBand:upperSafetyBand(b));if(as!==bs)return bs-as;
  const aa=num(a.angleBand!=null?a.angleBand:upperAngleBand(a)),ba=num(b.angleBand!=null?b.angleBand:upperAngleBand(b));if(aa!==ba)return ba-aa;
  if(at.known&&bt.known&&num(at.rank)!==num(bt.rank))return num(bt.rank)-num(at.rank);
  // Put candidates in the same resource-feasibility band before comparing the
  // final party.  This keeps a 40-wisp fantasy from displacing a near-ready
  // route, without letting standalone completion or DPS decide the result.
  if(!ag&&!bg&&num(a.wispShortage)!==num(b.wispShortage))return num(a.wispShortage)-num(b.wispShortage);
  if(!ag&&!bg&&num(a.futureDependencyCount)!==num(b.futureDependencyCount))return num(a.futureDependencyCount)-num(b.futureDependencyCount);
  const ap=a.upperPreparation||{},bp=b.upperPreparation||{};if(!!ap.materialReady!==!!bp.materialReady)return Number(!!bp.materialReady)-Number(!!ap.materialReady);if(num(ap.ordinaryMissing)!==num(bp.ordinaryMissing))return num(ap.ordinaryMissing)-num(bp.ordinaryMissing);if(num(ap.wispGap)!==num(bp.wispGap))return num(ap.wispGap)-num(bp.wispGap);if(num(ap.wispCost)!==num(bp.wispCost))return num(ap.wispCost)-num(bp.wispCost);
  if(!!a.roleComplete!==!!b.roleComplete)return Number(!!b.roleComplete)-Number(!!a.roleComplete);
  const priorityOrder=comparePriorityVectors(a.requirementPriority,b.requirementPriority);if(priorityOrder)return priorityOrder;
  if(a.clearComplete!==b.clearComplete)return Number(b.clearComplete)-Number(a.clearComplete);
  if(!!a.fullyBuildable!==!!b.fullyBuildable)return Number(!!b.fullyBuildable)-Number(!!a.fullyBuildable);
  if(a.projectedCount!==b.projectedCount)return b.projectedCount-a.projectedCount;
  if(a.readiness!==b.readiness)return b.readiness-a.readiness;
  if(a.lineagePairs!==b.lineagePairs)return a.lineagePairs-b.lineagePairs;
  if(num(a.controlCapOverflow)!==num(b.controlCapOverflow))return num(a.controlCapOverflow)-num(b.controlCapOverflow);
  if(a.materialOverlapPenalty!==b.materialOverlapPenalty)return a.materialOverlapPenalty-b.materialOverlapPenalty;
  if(a.rareConflict!==b.rareConflict)return a.rareConflict-b.rareConflict;
  if(a.rareClearedTypes!==b.rareClearedTypes)return b.rareClearedTypes-a.rareClearedTypes;
  if(a.rareUsedTypes!==b.rareUsedTypes)return b.rareUsedTypes-a.rareUsedTypes;
  if(a.rareUsed!==b.rareUsed)return b.rareUsed-a.rareUsed;
  if(a.wispCost!==b.wispCost)return a.wispCost-b.wispCost;
  const handOrder=compareHandFit(a.handFitMetrics,b.handFitMetrics);if(handOrder)return handOrder;
  if(a.controlExcessScore!==b.controlExcessScore)return a.controlExcessScore-b.controlExcessScore;
  if(a.excessStun!==b.excessStun)return a.excessStun-b.excessStun;
  if(a.excessSlow!==b.excessSlow)return a.excessSlow-b.excessSlow;
  const am=a.memoPackage||{},bm=b.memoPackage||{};if(num(am.coreHits)!==num(bm.coreHits))return num(bm.coreHits)-num(am.coreHits);if(num(am.score)!==num(bm.score))return num(bm.score)-num(am.score);
  // The exact current prefix is an execution lane, not the strategic Upper
  // score.  Use it only after the complete party is structurally tied.
  const prefixOrder=comparePriorityVectors(a.prefixVector,b.prefixVector);if(prefixOrder)return prefixOrder;
  if(num(a.prefixActionCount)!==num(b.prefixActionCount))return num(b.prefixActionCount)-num(a.prefixActionCount);
  const prefixRoleOrder=comparePriorityVectors(a.prefixRequirementPriority,b.prefixRequirementPriority);if(prefixRoleOrder)return prefixRoleOrder;
  if(num(a.prefixRareRemaining)!==num(b.prefixRareRemaining))return num(a.prefixRareRemaining)-num(b.prefixRareRemaining);
  if(num(a.prefixWispUsed)!==num(b.prefixWispUsed))return num(a.prefixWispUsed)-num(b.prefixWispUsed);
  if(num(a.prefixCommonPressure)!==num(b.prefixCommonPressure))return num(a.prefixCommonPressure)-num(b.prefixCommonPressure);
  const aTierUse=a.tierUse||Object.assign({rare:a.rareUsed},a.handFitMetrics||{}),bTierUse=b.tierUse||Object.assign({rare:b.rareUsed},b.handFitMetrics||{}),lowerTierOrder=compareTierBurn(aTierUse,bTierUse,false);if(lowerTierOrder)return lowerTierOrder;
  if(num(a.prefixStoryProxy)!==num(b.prefixStoryProxy))return num(b.prefixStoryProxy)-num(a.prefixStoryProxy);
  // TMO completion is intentionally last: it must not override a squad that
  // fits the user's complete lower-tier hand more efficiently.
  if(a.completion!==b.completion)return b.completion-a.completion;
  return compareText(a.upperName,b.upperName)||compareText(a.upperId,b.upperId);
}

function rankUpperBlueprints(input,options){
  input=input||{};options=options||{};const started=Date.now(),baseSettings=normalizeSettings(input),base=makeState(input,baseSettings),policy=normalizeCommonPolicy(input,base),state=makePlanningState(base,policy),supportMemo=resolveSupportMemo(input),requested=[...new Set([].concat(options.candidateIds||[]).map(String))],cacheKey=upperRankFingerprint(state,baseSettings,policy,requested,supportMemo);let cache=UPPER_RANK_RESULT_CACHE.get(state.db);if(!cache){cache=new Map();UPPER_RANK_RESULT_CACHE.set(state.db,cache);}if(cache.has(cacheKey))return cache.get(cacheKey);const candidates=requested.map(id=>state.db.byId.get(id)).filter(u=>u&&C.isUpper(u)&&prerequisiteStatus(state,u,state.counts).allowed),staticByRoute=new Map(),rankings=[];
  const getStatic=(mode,route,settings)=>{const key=`${mode}:${route}`,cached=staticByRoute.get(key);if(cached)return cached;const built=makeLightStaticData(state,mode,route,settingsForRoute(settings,route),policy);staticByRoute.set(key,built);return built;};
  for(const upper of candidates){setAffinityContext([upper],supportMemo);const family=unitFamily(upper),mode=family==='magic'?'magic':family==='physical'?'physical':baseSettings.mode,candidateSettings=withUpperCommitments(settingsWithBlueprint(Object.assign({},baseSettings,{mode,upperPreviewId:upper.id}),state,null),state,[upper.id]),fixed=[upper.id],routes=mode==='magic'&&candidateSettings.magicRoute==='auto'?['dual','singleEnd']:[routeFor(mode,candidateSettings.magicRoute)],plans=[];
    for(const route of routes){const routeSettings=settingsForRoute(candidateSettings,route),staticData=getStatic(mode,route,routeSettings);let draft=draftUpperBlueprintPlan(state,routeSettings,policy,route,upper,staticData);if(draft)draft=repairDraftSingleSwap(state,routeSettings,policy,route,upper,staticData,draft);if(draft){draft=decorateLegendEquivalent(draft,candidateSettings);draft.decision=squadDecisionSummary(state,draft);draft.timelineReadiness=timelineReadiness(state,draft,routeSettings,[upper.id]);draft.safePrefix=exactPrefixPlan(state,mode,route,routeSettings,policy,[upper.id]);plans.push(draft);}}
    if(!plans.length)continue;let plan=plans[0];if(plans.length>1)plan=compareRoutePlans(plans[0],plans[1]);const candidateProjection=projectUpperCandidate(state,plan,upper,candidateSettings),upperPreparation=upperPreparationFor(state,upper),summary=plan.rareSummary||{},rareUsed=num(summary.spent)+num(summary.reserved),rareTotal=num(summary.initial),rareConflict=num(summary.conflict),containsUpper=(plan.finalLineup||[]).some(row=>{const u=row.unit||state.db.byId.get(row.id);return u&&canonicalUpper(u)===canonicalUpper(upper);}),planned=plan.roleCoverage&&plan.roleCoverage.planned||{},routeConfirmable=!plan.routeEvaluation||plan.routeEvaluation.confirmable!==false,wispFeasible=!!(plan.wispBudget&&plan.wispBudget.fullPartyFeasible),handFeasible=(!plan.handFit||plan.handFit.feasible!==false)&&wispFeasible,clearComplete=plan.plannedCount===plan.targetCount&&!!planned.complete&&routeConfirmable&&rareConflict===0&&handFeasible&&containsUpper,fullyBuildable=plan.plannedCount===plan.targetCount&&handFeasible&&containsUpper,rareClearedTypes=(plan.rareAllocation||[]).filter(row=>row.initial>0&&row.remaining<=0).length,blueprint={version:1,revision:0,upperId:upper.id,lineupIds:(plan.finalLineup||[]).map(row=>row.id),buildOrderIds:(plan.finalLineup||[]).filter(row=>row.status!=='owned').map(row=>row.id),mode:plan.mode,magicRoute:plan.magicRoute};
    const projectionSpec=candidateProjection.spec||planned.spec||emptyFinalSpec(plan.mode),projectionRows=candidateProjection.rows||planned.rows||[],plannedExcessStun=excessStun(projectionSpec),plannedExcessSlow=excessSlow({rows:projectionRows}),controlExcessScore=round(plannedExcessStun*100+plannedExcessSlow,3),controlOverflow=controlCapOverflow(plannedExcessStun,plannedExcessSlow),materialOverlap=plan.materialOverlap||{penalty:0,lineagePairs:0},rareUsedTypes=num(plan.rareUsedTypes)||(plan.rareAllocation||[]).filter(row=>row.spent>0||row.reserved>0).length,handFitMetrics=plan.handFit&&plan.handFit.metrics||{},tierUse=tierBurnVector(plan.handFit),requirementPriority=candidateProjection.requirementPriority,roleComplete=plan.plannedCount===plan.targetCount&&!!planned.complete&&routeConfirmable&&containsUpper,wispShortage=num(plan.wispBudget&&plan.wispBudget.shortage),futureDependencyCount=Array.isArray(plan.handFit&&plan.handFit.futurePending)?plan.handFit.futurePending.length:0,guaranteed=fullyBuildable&&clearComplete&&containsUpper,safePrefix=plan.safePrefix||{},prefixVector=[].concat(safePrefix.rankVector||[]),prefixActionCount=(safePrefix.actions||[]).length,prefixRequirementPriority=[].concat(safePrefix.requirementPriority||[]),prefixRareRemaining=num(safePrefix.rareRemaining),prefixWispUsed=num(safePrefix.wispUsed),prefixTierUse=clone(safePrefix.tierUse||{}),prefixCommonPressure=num(safePrefix.commonPressure),prefixStoryProxy=num(safePrefix.storyProxy),memoPackage=curatedPackageEvidence(upper,plan.finalLineup,supportMemo);plan.blueprintProposal=blueprint;const ranking=decorateUpperStrategy({rank:0,upperId:upper.id,upperCanonicalId:canonicalUpper(upper),upperName:displayNameOf(upper),mode:plan.mode,completion:round(C.completionPercent(state,upper),2),containsUpper,rareUsed,rareTotal,rareRemaining:Math.max(0,rareTotal-rareUsed),rareConflict,rareClearedTypes,rareUsedTypes,tierUse,handFitMetrics,lowerHandFitScore:num(handFitMetrics.lowerScore),handFeasible,wispFeasible,wispShortage,futureDependencyCount,guaranteed,safePrefix,prefixVector,prefixActionCount,prefixRequirementPriority,prefixRareRemaining,prefixWispUsed,prefixTierUse,prefixCommonPressure,prefixStoryProxy,hardConflictTotal:num(plan.handFit&&plan.handFit.hardConflictTotal),wispConflict:num(plan.handFit&&plan.handFit.wisp&&plan.handFit.wisp.conflict),materialOverlapPenalty:num(materialOverlap.penalty),lineagePairs:num(materialOverlap.lineagePairs),roleComplete,clearComplete,fullyBuildable,readiness:num(candidateProjection.readiness),requirementPriority,projectedCount:num(plan.projectedCount),wispCost:num(plan.handFit&&plan.handFit.wisp&&plan.handFit.wisp.required),excessStun:plannedExcessStun,excessSlow:plannedExcessSlow,controlExcessScore,controlCapOverflow:controlOverflow,routeEvaluation:plan.routeEvaluation,candidateProjection,upperPreparation,memoPackage,blueprint,plan},state,upper);rankings.push(ranking);
  }
  setAffinityContext([],supportMemo);rankings.sort(upperBlueprintCompare).forEach((row,index)=>{row.rank=index+1;});Object.defineProperty(rankings,'elapsedMs',{value:Date.now()-started,enumerable:false});cache.set(cacheKey,rankings);while(cache.size>12)cache.delete(cache.keys().next().value);return rankings;
}

function directionRow(state,key,row){
  const plan=row&&row.plan||{},planned=plan.roleCoverage&&plan.roleCoverage.planned||{},futureDependencyCount=Array.isArray(plan.handFit&&plan.handFit.futurePending)?plan.handFit.futurePending.length:0,upperUnits=(plan.finalLineup||[]).map(item=>item.unit||state.db.byId.get(item.id)).filter(unit=>unit&&C.isUpper(unit)),upperIds=[...new Set(upperUnits.map(unit=>canonicalUpper(unit)))],upperNames=upperUnits.filter((unit,index)=>upperIds.indexOf(canonicalUpper(unit))===index).map(displayNameOf),evaluation=plan.routeEvaluation||{},projectedComplete=!!row.roleComplete&&!!row.handFeasible&&!!row.wispFeasible,guaranteedComplete=projectedComplete,unusedRare=(plan.rareAllocation||[]).filter(item=>num(item.initial)>0&&num(item.remaining)>0).map(item=>({id:item.id,name:item.name||displayNameOf(state.db.byId.get(item.id)),count:num(item.remaining)})),safePrefix=plan.safePrefix||row.safePrefix||{},prefixActions=safePrefix.actions||[];
  const candidateCanonical=String(row.upperCanonicalId||canonicalUpper(state.db.byId.get(row.upperId))),candidateUpperIds=[...new Set(upperIds.concat(candidateCanonical).filter(Boolean))];
  const upper=state.db.byId.get(row.upperId),computedPreparation=upper?upperPreparationFor(state,upper):{immediate:false,ordinaryMissing:0,wispGap:0,wispCost:0},preparation=Object.assign({},computedPreparation,row.upperPreparation||{}),upperPreparation=Object.assign(preparation,{label:preparation.immediate?'상위 즉시 제작 가능':`상위 준비 · 일반 패 ${num(preparation.ordinaryMissing)}장${num(preparation.wispGap)>0?` · 선위 ${num(preparation.wispGap)}개 부족`:''}`}),provisionalSelectable=upperPreparation.immediate&&prefixActions.some(action=>canonicalUpper(action.id)===canonicalUpper(row.upperId));
  const status=!projectedComplete?(prefixActions.length?'prefix':'hold'):key==='singleEnd'&&evaluation.status==='control'?'control':key==='singleEnd'&&evaluation.status==='stable'?'stable':guaranteedComplete?'ready':'projected',label=status==='ready'?'현재 패 전체 제작 검증':status==='projected'?'미래 의존 청사진 · 확정 금지':status==='stable'?'단끝 역할표 안정 후보':status==='control'?'단끝 컨트롤 의존':status==='prefix'?`현재 패 확정 ${prefixActions.length}기 · 9기 미확정`:'현재 패로 확정 행동 없음';
  return Object.assign({},row,{directionKey:key,upperIds,upperNames,candidateUpperIds,status,statusLabel:label,projectedComplete,guaranteedComplete,provisionalSelectable,futureDependencyCount,unusedRare,routeEvaluation:evaluation,upperPreparation,safePrefix,prefixActions,missing:((row.candidateProjection&&row.candidateProjection.rows)||planned.rows||[]).filter(item=>item.required&&num(item.gap)>0).map(item=>`${item.label} +${round(item.gap)}`)});
}
function uniqueDirectionRows(state,key,rows,limit){
  const out=[],seen=new Set();for(const row of rows||[]){const decorated=directionRow(state,key,row),identity=key==='dual'?decorated.candidateUpperIds.slice().sort().join('|'):String(row.upperCanonicalId||row.upperId||'');if(!identity||seen.has(identity))continue;seen.add(identity);decorated.laneRank=out.length+1;out.push(decorated);if(out.length>=limit)break;}return out;
}
function exactDirectionRow(input,state,key,row){
  if(!row)return null;const mode=key==='physical'?'physical':'magic',route=key==='physical'?'physical':key,settings=Object.assign({},input.settings||{},{mode,magicRoute:route,currentRound:num(input.settings&&input.settings.currentRound)||25,targetSquadCount:9,targetLegendEquivalent:9,upperPreviewId:row.upperId}),exact=planFinalSquad(Object.assign({},input,{settings,locks:[],upperBlueprint:row.blueprint})),upper=state.db.byId.get(row.upperId),candidateProjection=projectUpperCandidate(state,exact,upper,settings),upperPreparation=upperPreparationFor(state,upper),summary=exact.rareSummary||{},planned=exact.roleCoverage&&exact.roleCoverage.planned||{},routeConfirmable=!exact.routeEvaluation||exact.routeEvaluation.confirmable!==false,wispFeasible=!!(exact.wispBudget&&exact.wispBudget.fullPartyFeasible),handFeasible=(!exact.handFit||exact.handFit.feasible!==false)&&wispFeasible,containsUpper=(exact.finalLineup||[]).some(item=>{const unit=item.unit||state.db.byId.get(item.id);return unit&&canonicalUpper(unit)===String(row.upperCanonicalId||canonicalUpper(upper));}),roleComplete=num(exact.plannedCount)>=num(exact.targetCount)&&!!planned.complete&&routeConfirmable&&containsUpper,rareUsed=num(summary.spent)+num(summary.reserved),rareTotal=num(summary.initial),tierUse=tierBurnVector(exact.handFit),blueprint={version:1,revision:0,upperId:row.upperId,lineupIds:(exact.finalLineup||[]).map(item=>item.id),buildOrderIds:(exact.finalLineup||[]).filter(item=>item.status!=='owned').map(item=>item.id),mode,magicRoute:route},plannedExcessStun=excessStun(candidateProjection.spec),plannedExcessSlow=excessSlow({rows:candidateProjection.rows}),materialOverlap=exact.materialOverlap||{},handFitMetrics=exact.handFit&&exact.handFit.metrics||{},memoPackage=curatedPackageEvidence(upper,exact.finalLineup,resolveSupportMemo(input));
  const futureDependencyCount=Array.isArray(exact.handFit&&exact.handFit.futurePending)?exact.handFit.futurePending.length:0,wispShortage=num(exact.wispBudget&&exact.wispBudget.shortage),fullyBuildable=num(exact.plannedCount)>=num(exact.targetCount)&&handFeasible&&containsUpper,guaranteed=fullyBuildable&&roleComplete&&num(summary.conflict)===0,safePrefix=exact.safePrefix||row.safePrefix||{},prefixVector=[].concat(safePrefix.rankVector||[]),prefixActionCount=(safePrefix.actions||[]).length,prefixRequirementPriority=[].concat(safePrefix.requirementPriority||[]),prefixRareRemaining=num(safePrefix.rareRemaining),prefixWispUsed=num(safePrefix.wispUsed),prefixTierUse=clone(safePrefix.tierUse||{}),prefixCommonPressure=num(safePrefix.commonPressure),prefixStoryProxy=num(safePrefix.storyProxy);
  const exactRow=Object.assign({},row,{plan:exact,containsUpper,candidateProjection,upperPreparation,safePrefix,prefixVector,prefixActionCount,prefixRequirementPriority,prefixRareRemaining,prefixWispUsed,prefixTierUse,prefixCommonPressure,prefixStoryProxy,blueprint,routeEvaluation:exact.routeEvaluation,rareUsed,rareTotal,rareRemaining:Math.max(0,rareTotal-rareUsed),rareConflict:num(summary.conflict),rareClearedTypes:(exact.rareAllocation||[]).filter(item=>num(item.initial)>0&&num(item.remaining)<=0).length,rareUsedTypes:(exact.rareAllocation||[]).filter(item=>num(item.spent)+num(item.reserved)>0).length,tierUse,handFitMetrics,lowerHandFitScore:num(handFitMetrics.lowerScore),handFeasible,wispFeasible,wispShortage,futureDependencyCount,guaranteed,hardConflictTotal:num(exact.handFit&&exact.handFit.hardConflictTotal),wispConflict:num(exact.handFit&&exact.handFit.wisp&&exact.handFit.wisp.conflict),materialOverlapPenalty:num(materialOverlap.penalty),lineagePairs:num(materialOverlap.lineagePairs),roleComplete,clearComplete:roleComplete&&handFeasible&&num(summary.conflict)===0,fullyBuildable,readiness:num(candidateProjection.readiness),requirementPriority:candidateProjection.requirementPriority,projectedCount:num(exact.projectedCount),wispCost:num(exact.handFit&&exact.handFit.wisp&&exact.handFit.wisp.required),excessStun:plannedExcessStun,excessSlow:plannedExcessSlow,controlExcessScore:round(plannedExcessStun*100+plannedExcessSlow,3),controlCapOverflow:controlCapOverflow(plannedExcessStun,plannedExcessSlow),memoPackage,exactVerified:true});
  return decorateUpperStrategy(exactRow,state,upper);
}
function directionUpperShortlist(state,family,limit=8,context){
  const canonical=new Map();for(const unit of state.db.uppers.filter(unit=>[family,'neutral'].includes(unitFamily(unit)))){const key=canonicalUpper(unit),previous=canonical.get(key),owned=num(state.counts&&state.counts[unit.id])>0,previousOwned=previous&&num(state.counts&&state.counts[previous.id])>0;if(!previous||owned&&!previousOwned||owned===previousOwned&&unit.id===key&&previous.id!==key)canonical.set(key,unit);}
  const rows=[...canonical.values()].map(unit=>{const prerequisite=prerequisiteStatus(state,unit,state.counts);if(!prerequisite.allowed)return null;const solve=effectiveSolve(C.recipeSolve(state.db,unit.id,state.counts),prerequisite),tierUse=solveTierBurn(state,solve),ordinaryMissing=directOrdinaryMissing(state,solve)+['rare','special','uncommon','other'].reduce((total,tier)=>total+sum(solve.missingByTier&&solve.missingByTier[tier]),0),wispGap=ordinaryMissing<=0?Math.max(0,num(solve.wispCost)-num(state.wisp)):0,immediate=ordinaryMissing<=0&&wispGap<=0,powerTier=C&&typeof C.upperPowerTier==='function'?C.upperPowerTier(unit,state.db):{known:false,letter:'',rank:-1};return{unit,solve,tierUse,ordinaryMissing,wispGap,immediate,powerTier,completion:round(C.completionPercent(state,unit),2)};}).filter(Boolean),progress=rows.slice().sort((a,b)=>b.completion-a.completion||Number(b.immediate)-Number(a.immediate)||a.ordinaryMissing-b.ordinaryMissing||a.wispGap-b.wispGap||compareText(a.unit.id,b.unit.id)),hand=rows.slice().sort((a,b)=>compareTierBurn(a.tierUse,b.tierUse)||a.wispGap-b.wispGap||a.ordinaryMissing-b.ordinaryMissing||b.completion-a.completion||compareText(a.unit.id,b.unit.id)),ready=rows.slice().sort((a,b)=>Number(b.immediate)-Number(a.immediate)||a.ordinaryMissing-b.ordinaryMissing||a.wispGap-b.wispGap||b.completion-a.completion||compareText(a.unit.id,b.unit.id)),picked=[],seen=new Set(),cap=Math.max(1,Math.min(12,num(limit)||8)),deficitBest=[],tierAnchors=[];
  const push=row=>{if(row&&!seen.has(row.unit.id)&&picked.length<cap){seen.add(row.unit.id);picked.push(row);}};
  // Reserve one candidate that gives the largest direct reduction for each
  // currently missing physical clear role.  This prevents completion/hand-fit
  // interleaving from dropping every armor or slow upper out of a small list.
  if(family==='physical'&&context&&context.settings){
    const settings=Object.assign({},context.settings,{mode:'physical',magicRoute:'physical'}),lineup=finalEntries(state,state.counts),baseSpec=finalOnlySpec(state,state.counts,'physical'),main=mainUpperFor(state,state.counts,[]),requirements=context.requirements||requirementRows(baseSpec,lineup,'physical','physical',settings,main),priority={main:0,armor:1,stunBase:2,slow:3,bossFrenzy:4,stunFull:5},order=key=>Object.prototype.hasOwnProperty.call(priority,key)?priority[key]:99,active=(requirements.rows||[]).filter(row=>row.required&&num(row.gap)>0).sort((a,b)=>order(a.key)-order(b.key)||num(b.weight)-num(a.weight));
    for(const required of active){
      const ranked=rows.map(row=>{if(lineup.some(unit=>C.isUpper(unit)&&canonicalUpper(unit)===canonicalUpper(row.unit)))return null;const spec=addUnitRole(baseSpec,row.unit,'physical');spec.total=num(spec.total)+1;const next=requirementRows(spec,lineup.concat(row.unit),'physical','physical',settings,row.unit),after=(next.rows||[]).find(item=>item.key===required.key),gain=round(num(required.gap)-num(after&&after.gap),6);return gain>0?{row,gain}:null;}).filter(Boolean).sort((a,b)=>b.gain-a.gain||Number(b.row.immediate)-Number(a.row.immediate)||a.row.ordinaryMissing-b.row.ordinaryMissing||a.row.wispGap-b.row.wispGap||b.row.completion-a.row.completion||compareText(a.row.unit.id,b.row.unit.id));
      if(ranked.length){deficitBest.push({key:required.key,id:ranked[0].row.unit.id,gain:ranked[0].gain});push(ranked[0].row);}
    }
  }
  for(let index=0;picked.length<cap&&index<rows.length;index++)for(const pool of [progress,hand,ready])push(pool[index]);
  // 기존 진행도·패소모·즉시제작 숏리스트를 먼저 완성해야 같은 S티어의
  // 현재 체크포인트 경로가 살아남는다. 그 뒤 S/A/B가 통째로 빠진 경우에만
  // 낮은 티어의 비보호 꼬리 후보를 교체해 전략 prior를 보존한다.
  const protectedIds=new Set(deficitBest.map(item=>item.id));
  for(const letter of ['S','A','B']){
    let chosen=picked.find(row=>row.powerTier&&row.powerTier.letter===letter),anchor=ready.find(row=>row.powerTier&&row.powerTier.letter===letter);
    if(!chosen&&anchor&&!seen.has(anchor.unit.id)){
      const targetRank=num(anchor.powerTier&&anchor.powerTier.rank);let replace=-1;
      for(let index=picked.length-1;index>=0;index--){const current=picked[index],rank=current.powerTier&&current.powerTier.known?num(current.powerTier.rank):-1;if(!protectedIds.has(current.unit.id)&&rank<targetRank){replace=index;break;}}
      if(replace>=0){seen.delete(picked[replace].unit.id);picked[replace]=anchor;seen.add(anchor.unit.id);chosen=anchor;}else if(picked.length<cap){push(anchor);chosen=anchor;}
    }
    if(chosen)tierAnchors.push({letter,id:chosen.unit.id});
  }
  return{rows:picked,total:rows.length,ids:picked.map(row=>row.unit.id),deficitBest,tierAnchors};
}
function directionLaneCompare(a,b){
  // The direction board is also a survival-deadline board.  A currently
  // replayable prefix that closes the active checkpoint must stay visible
  // ahead of a stronger long-horizon blueprint; strategic ranking resumes
  // immediately once both candidates are in the same checkpoint band.
  const checkpoint=Number(!!(b&&b.safePrefix&&b.safePrefix.checkpointPass))-Number(!!(a&&a.safePrefix&&a.safePrefix.checkpointPass));
  return checkpoint||upperBlueprintCompare(a,b);
}
function rankDeckDirections(input,options){
  input=input||{};options=options||{};const started=Date.now(),settings=Object.assign({},input.settings||{}),baseSettings=normalizeSettings(input),state=makeState(input,baseSettings),candidateCap=Math.max(3,Math.min(12,num(options.candidateCap)||(options.exact===true?12:8))),physicalPool=directionUpperShortlist(state,'physical',candidateCap,{settings:Object.assign({},baseSettings,{mode:'physical',magicRoute:'physical'})}),magicPool=directionUpperShortlist(state,'magic',candidateCap),physicalIds=physicalPool.ids,magicIds=magicPool.ids,limit=Math.max(1,Math.min(2,num(options.perLane)||2)),run=(mode,route,ids)=>rankUpperBlueprints(Object.assign({},input,{settings:Object.assign({},settings,{mode,magicRoute:route,targetSquadCount:9,targetLegendEquivalent:9})}),{candidateIds:ids}),physicalRanked=run('physical','physical',physicalIds),dualRanked=run('magic','dual',magicIds),singleRanked=run('magic','singleEnd',magicIds),buildLane=(key,rows,anchors)=>{const seeded=[],seen=new Set(),push=row=>{if(row&&!seen.has(row.upperId)){seen.add(row.upperId);seeded.push(row);}};push((rows||[]).find(row=>row&&row.safePrefix&&row.safePrefix.checkpointPass));push(rows&&rows[0]);for(const id of anchors||[])push((rows||[]).find(row=>row.upperId===id));for(const row of rows||[])push(row);if(options.exact===true){const verifyCap=Math.max(1,Math.min(4,num(options.exactVerifyCap)||2)),verified=seeded.slice(0,verifyCap).map(row=>exactDirectionRow(input,state,key,row)).filter(Boolean).sort(directionLaneCompare),rest=seeded.slice(verifyCap);return uniqueDirectionRows(state,key,verified.concat(rest),limit);}return uniqueDirectionRows(state,key,seeded,limit);},physical=buildLane('physical',physicalRanked,[physicalIds[0]]),singleAnchor=singleRanked[0]&&singleRanked[0].upperId,dual=buildLane('dual',dualRanked,[singleAnchor,magicIds[0]]),singleEnd=buildLane('singleEnd',singleRanked,[magicIds[0]]),lanes=[{key:'physical',mode:'physical',route:'physical',label:'물딜 1상위',priority:'상위 → 상시 방깎 180 = 최소 0.7스턴 → 이감 = 광보잡 → 1.5스턴',rows:physical},{key:'dual',mode:'magic',route:'dual',label:'마딜 2상위·토키',priority:'상위 2기 = 최소 0.7스턴 → 이감 → 광보잡·토키 → 1.5스턴(마지막 필수)',rows:dual},{key:'singleEnd',mode:'magic',route:'singleEnd',label:'마딜 1상위·단끝',priority:'광보잡 = 최소 0.7스턴 → 이감 → 검증된 보조 단·끝 → 1.5스턴(마지막 필수)',rows:singleEnd}],viable=lanes.flatMap(lane=>(lane.rows||[]).filter(row=>row&&row.projectedComplete)),leading=lanes.map(lane=>lane.rows[0]).filter(row=>row&&row.projectedComplete),dominant=leading.length===1?leading[0].directionKey:'',checkpointLeaders=lanes.map(lane=>({lane,row:lane.rows&&lane.rows[0]})).filter(item=>item.row&&item.row.safePrefix&&item.row.safePrefix.checkpointPass),checkpointUpperKeys=[...new Set(checkpointLeaders.map(item=>String(item.row.upperCanonicalId||canonicalUpper(state.db.byId.get(item.row.upperId)))))],provisionalDirection=checkpointUpperKeys.length===1&&checkpointLeaders.length?{upperId:checkpointLeaders[0].row.upperId,upperCanonicalId:checkpointUpperKeys[0],upperName:checkpointLeaders[0].row.upperName,routeKeys:[...new Set(checkpointLeaders.map(item=>item.lane.key))],checkpoint:checkpointLeaders[0].row.safePrefix.checkpoint,actions:(checkpointLeaders[0].row.safePrefix.actions||[]).map(action=>({id:action.id,name:action.name,wispCost:action.wispCost}))}:null;let safeReroll=[];
  if(viable.length){const maps=viable.map(row=>new Map(row.unusedRare.map(item=>[item.id,item]))),ids=[...maps[0].keys()].filter(id=>maps.every(map=>map.has(id)));safeReroll=ids.map(id=>Object.assign({},maps[0].get(id),{count:Math.min(...maps.map(map=>num(map.get(id)&&map.get(id).count)))})).filter(item=>item.count>0);}
  return{version:VERSION,lanes,dominant,provisionalDirection,decision:dominant?'single-dominant':provisionalDirection?'provisional-upper':'hold',reason:dominant?'현재 패에서 정적 역할표까지 닫힌 방향이 하나뿐입니다. 보스 화력은 별도 미검증입니다.':provisionalDirection?`${provisionalDirection.upperName} 경로만 현재 패로 다음 체크포인트를 닫습니다. 세부 마딜 경로가 겹치면 이후 패에서 다시 나눕니다.`:'서로 다른 운영 경로를 전역 1위로 억지 정렬하지 않습니다. 각 방향의 현재 확정 행동과 위험을 비교하세요.',safeReroll,evaluatedCandidates:{physical:physicalIds.length,magic:magicIds.length},candidateCoverage:{physicalDeficits:physicalPool.deficitBest||[]},availableCandidates:{physical:physicalPool.total,magic:magicPool.total},elapsedMs:Date.now()-started};
}

function planFinalSquad(input){
  input=input||{};const started=Date.now(),baseSettings=normalizeSettings(input),base=makeState(input,baseSettings),policy=normalizeCommonPolicy(input,base),state=makePlanningState(base,policy),blueprint=normalizeBlueprint(input,baseSettings,state),blueprintSettings=settingsWithBlueprint(baseSettings,state,blueprint),fixed=fixedUpperIds(state,input.locks||[],blueprintSettings,blueprint),settings=withUpperCommitments(blueprintSettings,state,fixed),supportMemo=resolveSupportMemo(input);setAffinityContext([settings.upperPreviewId&&state.db.byId.get(settings.upperPreviewId)].concat((fixed||[]).map(id=>state.db.byId.get(id))).filter(Boolean),supportMemo);const result=choosePreparedPlan(input,state,settings,policy,fixed,blueprint);
  result.blueprint=blueprintMetadata(state,blueprint,result);delete result._search;delete result._blueprintAttempt;result.reservedCommons=Object.entries(policy.reserved).map(([id,count])=>({id,name:displayNameOf(state.db.byId.get(id)),count}));result.elapsedMs=Date.now()-started;setAffinityContext([],supportMemo);return result;
}

function adaptivePlanReady(plan,target){
  const planned=plan&&plan.roleCoverage&&plan.roleCoverage.planned||{},routeReady=!plan||!plan.routeEvaluation||plan.routeEvaluation.confirmable!==false,handReady=!plan||!plan.handFit||plan.handFit.feasible!==false,wispReady=!!(plan&&plan.wispBudget&&plan.wispBudget.fullPartyFeasible),rareReady=num(plan&&plan.rareSummary&&plan.rareSummary.conflict)===0;
  return!!plan&&num(plan.plannedCount)>=num(target)&&!!planned.complete&&routeReady&&handReady&&wispReady&&rareReady;
}
function planAdaptiveFinalSquad(input,options){
  input=input||{};options=options||{};const minTarget=clamp(Math.round(num(options.minTarget)||9),9,11),maxTarget=clamp(Math.round(num(options.maxTarget)||11),minTarget,11),baseSettings=Object.assign({},input.settings||{}),attempts=[];let core=null,selected=null,preferred=input.upperBlueprint||null;
  for(let target=minTarget;target<=maxTarget;target++){
    const settings=Object.assign({},baseSettings,{targetSquadCount:target,targetLegendEquivalent:target}),nextInput=Object.assign({},input,{settings,upperBlueprint:preferred}),plan=planFinalSquad(nextInput),accepted=adaptivePlanReady(plan,target);
    attempts.push({target,accepted,plannedEquivalent:num(plan.plannedCount),plannedBoard:num(plan.plannedBoardCount),roleComplete:!!(plan.roleCoverage&&plan.roleCoverage.planned&&plan.roleCoverage.planned.complete),handFeasible:!plan.handFit||plan.handFit.feasible!==false,wispFeasible:!!(plan.wispBudget&&plan.wispBudget.fullPartyFeasible),rareConflict:num(plan.rareSummary&&plan.rareSummary.conflict)});
    if(!core)core=plan;
    if(!accepted)break;
    selected=plan;preferred={version:1,revision:target-minTarget+1,upperId:settings.upperPreviewId||plan.blueprint&&plan.blueprint.upperId||'',lineupIds:(plan.finalLineup||[]).map(row=>row.id),buildOrderIds:(plan.finalLineup||[]).filter(row=>row.status!=='owned').map(row=>row.id),mode:plan.mode,magicRoute:plan.magicRoute};
  }
  const result=selected||core;result.adaptiveTargets={minimum:minTarget,maximum:maxTarget,selected:num(result&&result.targetCount)||minTarget,attempts,basis:'full-reoptimization-per-legend-equivalent'};return result;
}

return{VERSION,planFinalSquad,planAdaptiveFinalSquad,rankUpperBlueprints,rankDeckDirections,_test:{clearAffinity,compareAffinity,metaGamesOf,setAffinityContext,pairGamesOf,resolveSupportMemo,supportRankAffinity,curatedSupportEvidence,curatedLineupEvidence,curatedPackageEvidence,compareCuratedSupport,normalizeSettings,normalizeCommonPolicy,normalizeBlueprint,requirementRows,routeEvaluationFor,commonPressure,finalEntries,finalOnlySpec,buildStaticRows,makeLightStaticData,routeFor,routeBoardTarget,settingsForRoute,finalWeight,legendEquivalentCount,decorateLegendEquivalent,squadDecisionSummary,finalStageSnapshot,strategyGateRows,stageGateSnapshot,rareDeadlineAssessment,timelineReadiness,exactPrefixStage,exactPrefixCheckpoint,exactPrefixMetrics,compareExactPrefixMetrics,exactPrefixPlan,finalPatchOptions,allowedCandidate,prerequisiteStatus,maxUpperCount,expectedUpperCount,secondUpperKeyOf,secondUpperBlocked,stickyUpperHold,stickyUpperKeySet,withUpperCommitments,triggerSlowWeight,creditedSlow,marginalSlow,requirementVectorValue,staticPotential,excessStun,excessSlow,hasNonControlRole,incrementalStunPenalty,incrementalSlowPenalty,recipeProfile,pairMaterialOverlap,lineupMaterialOverlap,introducesLineageConflict,candidateOverlapPenalty,consumptionTotals,tierBurnVector,compareTierBurn,handFitMetrics,compareHandFit,fullHandAllocation,wispBudgetSummary,futureWispCharge,deferredFutureFeasibility,compareDeferredSwaps,buildDeferred,requirementPriorityVector,comparePriorityVectors,nodeCompare,compareRoutePlans,searchExactBlueprint,searchRouteLight,draftUpperBlueprintPlan,repairDraftSingleSwap,blueprintMetadata,projectUpperCandidate,upperPreparationFor,upperSafetyBand,upperAngleBand,decorateUpperStrategy,upperBlueprintCompare,directionRow,uniqueDirectionRows,directionUpperShortlist,adaptivePlanReady}};
});
