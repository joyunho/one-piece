(function(global){
'use strict';
const C=global.ORDCore;
const VERSION=C.VERSION;
const STORE='ord-nightmare-squad-architect-v13';
const LEGACY_STORE='ord-nightmare-coach-v10-playable';
const OLDER_STORE='ord-nightmare-coach-v9-core-rebuild';
const UPPER_ROUTE_FAMILIES=[
  ['F90H','unit_1767356628978_5789'],
  ['190H','unit_1747756917990_920'],
  ['M70h','unit_1767886180546_6011'],
  ['H90H','unit_1767886116631_3690'],
  ['E40h','unit_1767886057577_8465'],
  ['KB0H','KB0H_']
];
// 자체 채팅 명령 없이 원형 제작 뒤 형태가 바뀌는 행만 명시적으로 상속합니다.
// 일반 재료에 명령이 있다는 이유만으로 상속하면 제한됨 유닛에 엉뚱한 재료 명령이 표시됩니다.
const COMMAND_INHERITANCE={
  'unit_1767356628978_5789':'F90H','unit_1747756917990_920':'190H','unit_1767886180546_6011':'M70h','unit_1767886116631_3690':'H90H','unit_1767886057577_8465':'E40h',
  'unit_1779054378124_5918':'unit_1779015720197_7602','unit_1779054466128_8565':'unit_1779015720197_7602','unit_1779054533261_4748':'unit_1779015720197_7602'
};
// 상위 등급 공업 데이터 상한(ORD_2305C_upper_combat_raw maxLevel).
const UPPER_RESEARCH_MAX=21;
const DEFAULTS={
  tab:'coach',mode:'',magicRoute:'auto',settingsRevision:178,modeExplicit:false,targetSquadCount:9,purpose:'',gorosei:'none',superKumaOwned:true,story10Reward:'',virtualSpecialId:'',virtualSpecialBaselineId:'',virtualSpecialBaselineCount:0,wispOverride:'',upperPreviewId:'',upperBlueprint:null,secondUpperId:'',snipeSearch:'',
  directionStatus:'open',directionKey:'',directionUpperId:'',directionHoldFingerprint:'',releasedUpperHint:null,
  postLegendRoute:'',postLegendObservedCount:0,postLegendBaseline:{},
  currentRound:1,roundStartedAt:0,roundPrepSeconds:10,roundNormalSeconds:35,roundBossSeconds:60,roundAutoGeneration:0,roundAutoSourceEpoch:0,manualCounts:{},pendingCounts:{},pendingAt:{},pendingTransaction:null,connectionDiagnostic:null,detailId:'',message:'',
  locks:[],upperDetection:{candidateId:'',streak:0,lastSnapshotKey:'',lastSeenAt:0},watchStability:{context:'',stableIds:[],pendingIds:[],pendingStreak:0,lastObservationKey:''},rerollsUsed:0,pendingReroll:null,awaitingNewGameFingerprint:'',navFamily:'none',navPerk:'',
  transcendUsed:0,seraphUsed:0,changedUsed:0,
  // v22.1(0809 "스토리가 35라 전에 13까지 밀려야하는데 안밀려서 죽었어"):
  // TMO 데이터에 스토리 단계가 없어 수동 스텝퍼로 받는다.
  storyStage:0,
  // v22.2(사용자: "아닌 것 같은건 넘어가기"): 이번 판에서 사용자가 거부한
  // 추천 유닛 — 후보 우주에서 제외된다.  새 게임에 리셋.
  vetoIds:[],
  // v22.5(사용자: "스토리 빨리 밀기 포기 버튼"): 켜면 스토리 랭킹 무시,
  // 최저 선위 전설·희귀만 추천.  새 게임에 리셋.
  storyRushAbandoned:false,
  // v17.12: 유닛 강화는 항상 풀로 되어 있다고 가정한다(사용자 지시).
  // 연구소 4종(공업+12% 이감+10 체젠+0.45 마젠+0.8) 전부 구매,
  // 상위 공업 연구는 데이터 상한 Lv21. 실제와 다르면 데이터 탭에서 조정.
  labResearch:{attack:true,slow:true,hpRegen:true,mpRegen:true,round:null},
  upperResearchLevel:21,
  unitSearch:'',storyQuery:'',storyTier:'',storyBasis:'',storyLeague:'rare',newGameArmedAt:0
};

const REACHABLE_TABS=new Set(['coach','runlog','deck','data','story']);
const REMOVED_SETTING_KEYS=['firstRareRewardClaimed','moneyRareReward','storyRareRewards','highGambleDone','highGambleRares','stunConditions','allowWarped','recommendWarped'];
const RUN_LOG_ACTIONS=new Set(['post-legend-route','purpose','super-kuma','mark-made','reroll-confirmed','cancel-reroll','unit-adjust','clear-unit-override','preview-direction','choose-direction','hold-direction','select-upper','confirm-upper','party-preview','lock-legend','lock-rare','remove-lock','reset-route','round-reset','round-step','round-pause','round-start','reroll-step','new-game','dismiss-transaction','accept-snapshot','counter-step','clear-overrides','confirm-second-upper','release-second-upper','confirm-party','release-party','restore-released-upper','snipe-upper','story-stage-step','veto-action','unveto-action','story-rush-toggle']);
const RUN_LOG_SETTING_KEYS=new Set(['mode','magicRoute','gorosei','story10Reward','currentRound','roundPrepSeconds','roundNormalSeconds','roundBossSeconds','wispOverride','virtualSpecialId','transcendUsed','seraphUsed','changedUsed']);
const RUN_RESULT_DEFAULTS=Object.freeze({kind:'r50_failed',failureReason:'unknown',followedProgram:'unknown',round:'',bossHpPercent:'',attackUpgrade:'',slowUpgrade:'',hpRegenUpgrade:'',mpRegenUpgrade:'',helperUsed:false,note:''});
const RUN_FAILURE_KINDS=new Set(['r50_failed','r51_65_failed']);

function readJson(key){try{return JSON.parse(localStorage.getItem(key)||'{}')||{};}catch(e){return{};}}
function readStore(){const current=readJson(STORE);if(Object.keys(current).length)return current;const legacy=readJson(LEGACY_STORE);return Object.keys(legacy).length?legacy:readJson(OLDER_STORE);}
function writeStore(v){try{localStorage.setItem(STORE,JSON.stringify(v));}catch(e){}}
function normalizeInitialState(stored){
  const source=stored&&typeof stored==='object'?stored:{},state=Object.assign({},DEFAULTS,source,{snapshot:null,liveAt:0,connectionDiagnostic:null,message:'',unitSearch:''});
  // v13.4 keeps manual phase/size/reward/stun controls removed. Old hidden values must
  // not keep influencing recommendations after an upgrade.
  state.targetSquadCount=9;
  state.purpose='';
  state.tab=REACHABLE_TABS.has(state.tab)?state.tab:'coach';
  for(const key of REMOVED_SETTING_KEYS)delete state[key];
  state.mode=['','physical','magic'].includes(state.mode)?state.mode:'';
  const pre177=C.num(source.settingsRevision)<177,committedMode=source.modeExplicit===true||['physical','dual','singleEnd'].includes(source.directionKey)||!!normalizeUpperBlueprint(source.upperBlueprint)||(Array.isArray(source.locks)&&source.locks.some(lock=>lock&&lock.stage==='upper'));
  if(pre177&&state.mode==='physical'&&!committedMode)state.mode='';
  state.modeExplicit=source.modeExplicit===true;
  // v17.12(rev178): 유닛 강화 풀 가정으로 1회 전환 — 이전 저장분의 미체크
  // 연구소·Lv1 공업을 풀 값으로 올린다. 178 이후에는 사용자가 데이터 탭에서
  // 낮춘 값을 그대로 존중한다.
  const pre178=C.num(source.settingsRevision)<178;
  state.settingsRevision=178;
  const storedLab=source.labResearch&&typeof source.labResearch==='object'?source.labResearch:{};
  state.labResearch=pre178?{attack:true,slow:true,hpRegen:true,mpRegen:true,round:storedLab.round==null?null:C.num(storedLab.round)}:{attack:!!storedLab.attack,slow:!!storedLab.slow,hpRegen:!!storedLab.hpRegen,mpRegen:!!storedLab.mpRegen,round:storedLab.round==null?null:C.num(storedLab.round)};
  state.upperResearchLevel=pre178?UPPER_RESEARCH_MAX:Math.max(1,Math.min(UPPER_RESEARCH_MAX,C.num(source.upperResearchLevel)||UPPER_RESEARCH_MAX));
  delete state.manualUpgrades;
  state.magicRoute=['auto','dual','singleEnd'].includes(state.magicRoute)?state.magicRoute:'auto';
  state.gorosei=Object.prototype.hasOwnProperty.call(C.GOROSEI,state.gorosei)?state.gorosei:'none';
  state.story10Reward=['','rayleigh','kuma','chest'].includes(state.story10Reward)?state.story10Reward:'';
  state.virtualSpecialId=String(state.virtualSpecialId||'');
  const virtualBaselineId=String(source.virtualSpecialBaselineId||'');
  state.virtualSpecialBaselineId=state.virtualSpecialId&&virtualBaselineId===state.virtualSpecialId?virtualBaselineId:'';
  state.virtualSpecialBaselineCount=state.virtualSpecialBaselineId?Math.max(0,Math.floor(C.num(source.virtualSpecialBaselineCount))):0;
  state.upperBlueprint=normalizeUpperBlueprint(state.upperBlueprint);
  // v19: 두 번째 상위 확정.  존재 검사는 렌더·플래너 쪽에서 하고, 여기서는
  // 문자열만 정리한다(카탈로그는 이 시점에 아직 없다).
  state.secondUpperId=String(state.secondUpperId||'');
  state.releasedUpperHint=normalizeReleasedUpperHint(state.releasedUpperHint);
  state.postLegendRoute=['legend','upper'].includes(state.postLegendRoute)?state.postLegendRoute:'';
  state.postLegendObservedCount=Math.max(0,C.num(state.postLegendObservedCount));
  state.postLegendBaseline=state.postLegendBaseline&&typeof state.postLegendBaseline==='object'?Object.fromEntries(Object.entries(state.postLegendBaseline).map(([id,count])=>[String(id),Math.max(0,C.num(count))])):{};
  state.superKumaOwned=state.superKumaOwned!==false;state.vetoIds=Array.isArray(state.vetoIds)?state.vetoIds.map(String).slice(0,20):[];
  state.transcendUsed=Math.max(0,Math.min(1,C.num(state.transcendUsed)));
  state.seraphUsed=Math.max(0,Math.min(1,C.num(state.seraphUsed)));
  state.changedUsed=Math.max(0,Math.min(2,C.num(state.changedUsed)));
  state.storyLeague=['rare','upper','legend'].includes(state.storyLeague)?state.storyLeague:'rare';
  state.directionStatus=['open','preview','selected','hold'].includes(state.directionStatus)?state.directionStatus:'open';
  state.directionKey=['physical','dual','singleEnd'].includes(state.directionKey)?state.directionKey:'';
  state.directionUpperId=String(state.directionUpperId||'');state.directionHoldFingerprint=String(state.directionHoldFingerprint||'');
  state.pendingReroll=state.pendingReroll&&typeof state.pendingReroll==='object'?{
    id:String(state.pendingReroll.id||''),name:String(state.pendingReroll.name||''),baseFingerprint:String(state.pendingReroll.baseFingerprint||''),beforeCount:state.pendingReroll.beforeCount==null?null:Math.max(0,C.num(state.pendingReroll.beforeCount)),baseSeq:Math.max(0,C.num(state.pendingReroll.baseSeq)),at:C.num(state.pendingReroll.at)||0,baseRound:Math.max(0,C.num(state.pendingReroll.baseRound))
  }:null;
  return state;
}
function fmt(v){const n=Math.round(C.num(v)*100)/100;return Number.isInteger(n)?String(n):String(n).replace(/0+$/,'').replace(/\.$/,'');}
function fmtStun(v){return C.num(v).toFixed(3);}
function stunCaptureRate(stun){return Math.max(0,Math.min(100,(1-Math.pow(.2,Math.max(0,C.num(stun))))*100));}
function pct(v){return `${Math.floor(C.num(v))}%`;}
function modeLabel(m){return m==='magic'?'마딜':m==='physical'?'물딜':'자동';}
function directionBoardForMode(board,mode){
  if(!board||board.loading||board.error)return board||{};
  const allowed=mode==='physical'?new Set(['physical']):mode==='magic'?new Set(['dual','singleEnd']):null,lanes=(board.lanes||[]).filter(lane=>!allowed||allowed.has(lane.key)),tops=lanes.map(lane=>({lane,row:lane.rows&&lane.rows[0]})).filter(item=>item.row),leaders=tops.filter(item=>item.row.safePrefix&&item.row.safePrefix.checkpointPass),canonical=row=>String(row&&row.upperCanonicalId||C.canonicalUpperId(row&&row.upperId)||''),keys=[...new Set(leaders.map(item=>canonical(item.row)).filter(Boolean))],provisional=keys.length===1&&leaders.length?{upperId:leaders[0].row.upperId,upperCanonicalId:keys[0],upperName:leaders[0].row.upperName,routeKeys:[...new Set(leaders.map(item=>item.lane.key))],checkpoint:leaders[0].row.safePrefix.checkpoint,actions:(leaders[0].row.safePrefix.actions||[]).map(action=>({id:action.id,name:action.name,wispCost:action.wispCost}))}:null,complete=tops.filter(item=>item.row.projectedComplete),dominant=complete.length===1?complete[0].lane.key:'';
  return Object.assign({},board,{lanes,provisionalDirection:provisional,dominant,modeFilter:mode==='physical'||mode==='magic'?mode:'auto'});
}
function purposeLabel(p){return p==='rare'?'첫 희귀':p==='story'?'전설·히든':p==='upper'?'상위 준비':p==='spec'?'클리어 보강':'자동';}
function statusTone(key){return key==='ready'?'good':key==='blocked'?'bad':'warn';}
function tierLabel(u){return C.groupName(u).replace(/\s*물딜은.*$/,'').replace(/🚁/g,'').trim();}
function displayNameOf(u){return(C.displayNameOf||C.nameOf)(u);}
// v19.9.2(사용자 요청): 조합식에는 능력치 주석을 쓰지 않는다 — "슈가 (마젠0.6)"
// → "슈가".  공백 뒤 여는 괄호부터 끝까지만 지우므로 "(D)드래곤"처럼 괄호로
// 시작하는 본명은 건드리지 않는다.
function recipeNameOf(name){return String(name||'').replace(/\s+\(.*\)\s*$/,'');}
function routeCandidateReady(row){
  const evaluation=row&&row.blueprintEvaluation;
  return!!(row&&(row.keepUpper===true||evaluation&&evaluation.basis==='upper-plus-support-full-squad'&&C.num(evaluation.rank)>0));
}
function stageLabel(stage){return stage==='upper'?'상위':stage==='legend'?'전설·히든':stage==='rare'?'희귀':'경로';}
// v19.5(사용자 요청): 상위 전수 메모 플레이북 — "특징 간단 요약 · 뭘 같이
// 쓰면 좋은지 · 어떻게 활용해야 하는지"를 상위가 보이는 자리마다 붙인다.
// 표시 전용 데이터라 엔진 판단(게이트·점수)에는 절대 쓰지 않는다.
function upperPlaybookOf(unit){
  const book=global.ORD_UPPER_PLAYBOOK;
  if(!unit||!book||!book.byId)return null;
  return book.byId[String(unit.id)]||book.byId[String(C.canonicalUpperId(unit.id)||'')]||null;
}
function playbookHtml(unit,options){
  const entry=upperPlaybookOf(unit);if(!entry)return'';
  const opts=options||{},pairs=(entry.pairs||[]).slice(0,opts.maxPairs==null?4:opts.maxPairs);
  const use=!opts.compact&&entry.use?`<small>활용 · ${C.esc(entry.use)}</small>`:'';
  const pairHtml=pairs.length?`<span class="pairs"><b>같이</b>${pairs.map(name=>`<i>${C.esc(name)}</i>`).join('')}</span>`:'';
  return`<div class="v155-playbook${opts.compact?' compact':''}"><p>${C.esc(entry.summary||'')}</p>${use}${pairHtml}</div>`;
}
// v19.7(사용자 요청 ③): 상위(다상위 포함) 방향을 확정하면 그 상위의 중심
// 내용 — 빌드 축 · 파티가 채워야 할 부족 핵심 · 운영 한 줄 — 이 화면에
// 바로 나온다.  전수 메모 v2(63키트 처방) 기반, 표시 전용.
function playbookDirectionHtml(unit){
  const entry=upperPlaybookOf(unit);if(!entry)return playbookHtml(unit);
  const axis=(entry.axis||[]).slice(0,3).map(item=>`<i>${C.esc(item)}</i>`).join('');
  const missing=(entry.missingCore||[]).slice(0,3).map(item=>`<i>${C.esc(item)}</i>`).join('');
  const pairs=(entry.pairs||[]).slice(0,4).map(name=>`<i>${C.esc(name)}</i>`).join('');
  const avoid=(entry.avoid||[]).slice(0,1).map(item=>`<small class="warn">주의 · ${C.esc(item)}</small>`).join('');
  if(!axis&&!missing&&!entry.op)return playbookHtml(unit);
  return`<div class="v155-playbook v157-direction"><p>${C.esc(entry.summary||'')}</p>${axis?`<span class="row"><b>축</b>${axis}</span>`:''}${missing?`<span class="row miss"><b>파티가 채울 것</b>${missing}</span>`:''}${entry.op?`<small>운영 · ${C.esc(entry.op)}</small>`:''}${avoid}${pairs?`<span class="pairs"><b>같이</b>${pairs}</span>`:''}</div>`;
}
function storyBadge(unit,grade,extra=''){const source=grade||C.storyGrade(unit),g=source&&source.league?source:(C.storyLeagueGrade&&C.storyLeagueGrade(unit,source)||source),basis=g.basisLabel||({measured:'실측',research:'자료',estimated:'추정',na:'해당 없음'}[g.basis]||'추정'),tier=g.tier==='—'?'na':String(g.tier||'D').toLowerCase();return`<span class="story-badge tier-${tier} ${C.esc(g.basis||'estimated')} ${extra}" title="${C.esc(g.note||'')}">${C.esc(g.label||`스토리 ${g.tier||'—'}`)} · ${C.esc(basis)}</span>`;}
function emptyUpperDetection(){return{candidateId:'',streak:0,lastSnapshotKey:'',lastSeenAt:0};}
function normalizeUpperDetection(value){const v=value&&typeof value==='object'?value:{};return{candidateId:String(v.candidateId||''),streak:Math.max(0,Math.min(1,C.num(v.streak))),lastSnapshotKey:String(v.lastSnapshotKey||''),lastSeenAt:C.num(v.lastSeenAt)||0};}
function normalizeWatchStability(value){const v=value&&typeof value==='object'?value:{};return{context:String(v.context||''),stableIds:Array.isArray(v.stableIds)?v.stableIds.map(String).slice(0,6):[],pendingIds:Array.isArray(v.pendingIds)?v.pendingIds.map(String).slice(0,6):[],pendingStreak:Math.max(0,Math.min(3,C.num(v.pendingStreak))),lastObservationKey:String(v.lastObservationKey||'')};}
function normalizeUpperBlueprint(value){
  const v=value&&typeof value==='object'?value:null;if(!v||!v.upperId)return null;
  const ids=list=>(Array.isArray(list)?list:[]).map(String).filter(Boolean).slice(0,11);
  const lineupIds=ids(v.lineupIds),buildOrderIds=ids(v.buildOrderIds||v.actionIds);
  const fullPartyVerified=v.fullPartyVerified===true||v.fullPartyVerified==null&&lineupIds.length>1,commitment=fullPartyVerified?'full-party':'upper-route';
  return{upperId:String(v.upperId),lineupIds:lineupIds.length?lineupIds:[String(v.upperId)],buildOrderIds,mode:v.mode==='magic'?'magic':'physical',magicRoute:['dual','singleEnd','physical'].includes(v.magicRoute)?v.magicRoute:'physical',revision:Math.max(1,C.num(v.revision)||1),capturedFingerprint:String(v.capturedFingerprint||''),capturedAt:C.num(v.capturedAt)||0,fullPartyVerified,commitment,adaptiveSupports:v.adaptiveSupports!==false};
}
// v19.2(사용자 요청): "물딜 가려다가 마딜로 바꿔서" — 계통 전환이 확정
// 상위를 해제한다(의도된 동작).  문제는 원래 계통으로 되돌아왔을 때 그
// 해제를 아무도 알려 주지 않아, 사용자가 다시 확정을 누르지 않으면 그
// 라운드부터 게임이 끝날 때까지 추천이 완전히 멈춘다는 것이다(0730 판:
// 24라운드 무응답).  해제 시점을 기억해 뒀다가 같은 계통으로 돌아오면
// 원클릭 복구를 보여준다.  너무 오래된 힌트는 쓸모가 없어 라운드 창을
// 둔다 — 40라에 해제된 걸 90라에 "복구"하자고 뜨면 그게 더 헷갈린다.
const RELEASED_UPPER_HINT_ROUND_WINDOW=15;
function normalizeReleasedUpperHint(value){
  const v=value&&typeof value==='object'?value:null;if(!v||!v.id)return null;
  const mode=v.mode==='magic'?'magic':'physical';
  return{id:String(v.id),mode,routeKey:['dual','singleEnd','physical'].includes(v.routeKey)?v.routeKey:(mode==='magic'?'dual':'physical'),releasedAt:C.num(v.releasedAt)||0,releasedRound:Math.max(0,C.num(v.releasedRound))};
}
function upperRouteFamily(id){return UPPER_ROUTE_FAMILIES.find(family=>family.includes(String(id||'')))||null;}
function activeUpperVariant(family,counts){if(!family)return'';for(let i=family.length-1;i>=0;i--)if(C.num(counts&&counts[family[i]])>0)return family[i];return'';}
function clearVariantPending(lock){const next=Object.assign({},lock);for(const key of ['variantCandidateId','variantStreak','variantLastSnapshotKey','variantLastSeenAt'])delete next[key];return next;}
function collapseUpperVariants(units,counts){const selected=new Set();for(const family of UPPER_ROUTE_FAMILIES){const active=activeUpperVariant(family,counts);if(active)selected.add(active);}return(units||[]).filter(u=>{const family=upperRouteFamily(u.id);return family?selected.has(u.id):C.num(counts&&counts[u.id])>0;});}
function legendHiddenCount(state){return state&&state.db&&state.db.legendish?state.db.legendish.filter(u=>/^전설|^히든/.test(C.groupName(u))).reduce((sum,u)=>sum+C.num(state.counts&&state.counts[u.id]),0):0;}
function legendHiddenCounts(state){const out={};if(state&&state.db&&state.db.legendish)for(const u of state.db.legendish)if(/^전설|^히든/.test(C.groupName(u))&&C.num(state.counts&&state.counts[u.id])>0)out[u.id]=C.num(state.counts[u.id]);return out;}
function legendIncreasedSince(state,baseline){const before=baseline&&typeof baseline==='object'?baseline:{};return Object.entries(legendHiddenCounts(state)).some(([id,count])=>count>C.num(before[id]));}
function ownedUpperCount(state){return state&&state.db&&state.db.uppers?state.db.uppers.reduce((sum,u)=>sum+C.num(state.counts&&state.counts[u.id]),0):0;}
function uniqueText(values){return[...new Set((values||[]).map(x=>String(x||'').trim()).filter(Boolean))];}
function parseCommands(values){
  const korean=[],english=[];
  for(const raw of uniqueText(values))for(const part of raw.split(/\s*\/\s*/).map(x=>x.trim()).filter(Boolean)){
    const mixed=part.match(/^(.*[가-힣!?])\s+([A-Za-z][A-Za-z0-9'-]*(?:\s+[A-Za-z][A-Za-z0-9'-]*)*)$/);
    if(mixed){korean.push(mixed[1].trim());english.push(mixed[2].trim());continue;}
    if(/[가-힣]/.test(part))korean.push(part);else if(/[A-Za-z]/.test(part))english.push(part);
  }
  return{korean:uniqueText(korean),english:uniqueText(english)};
}
function phaseForPurpose(plan,round){
  if(plan.purpose==='rare')return{key:'rare',label:'7라 전 첫 희귀',note:'7라운드 보상 선택위습을 놓치지 않도록 가장 가까운 희귀 경로를 잡습니다.'};
  if(plan.postLegendDecision&&plan.postLegendDecision.route==='legend')return{key:'story',label:'추가 전설·히든 한 기',note:'현재 패에서 부족 재료가 가장 적은 전설·히든 한 기를 더 만든 뒤 진행 방향을 다시 선택합니다.'};
  if(plan.purpose==='story')return{key:'story',label:'20라 전 첫 전설·히든',note:'현재 희귀·특별·안흔함 패와 선택위습을 함께 보고 가장 가까운 첫 라인 유닛을 만듭니다.'};
  if(plan.purpose==='upper')return{key:'upper',label:'25라 최종 스쿼드 설계',note:'상위는 전설 3기분으로 환산하고, 전설 환산 9기 안에서 전체 패와 클리어 조건을 함께 맞춥니다.'};
  if(plan.purpose==='spec')return{key:round<=30?'line':round<=50?'spec':'finish',label:round<=30?'30라 상위·라인 완성':round<=50?'50라 전 8전설 보강':'50라 이후 마지막 보강',note:round<=50?'전설 환산 9기 설계에서 부족 스펙을 채우는 전설·히든을 순서대로 만듭니다.':'전설·히든, 해적선, 희귀 2기, 변화됨 중 가장 싼 마지막 수단을 고릅니다.'};
  return C.phaseForRound(round);
}
function fingerprint(snapshot){
  if(!snapshot)return'';if(snapshot.dataHash)return String(snapshot.dataHash);const counts=Object.entries(snapshot.counts||{}).sort().map(x=>x.join(':')).join('|'),abilities=Object.entries(snapshot.currentAbilities||{}).sort().map(x=>x.join(':')).join('|'),progress=(snapshot.units||[]).map(x=>`${x.id}:${x.tmoPercent}`).sort().join('|');return `${counts}#${abilities}#${progress}`;
}
function rawSnapshotCount(snapshot,id){
  const key=String(id||''),source=snapshot||{},counts=source.counts||{};
  if(!key)return 0;
  if(Object.prototype.hasOwnProperty.call(counts,key))return Math.max(0,Math.floor(C.num(counts[key])));
  const row=(source.units||[]).find(unit=>String(unit&&unit.id||'')===key),data=row&&row.data||row;
  return Math.max(0,Math.floor(C.num(row&&row.count!=null?row.count:data&&data.count)));
}
const HAND_TIER_META=[
  {key:'rare',label:'희귀함',aliases:['rare','희귀','희귀함']},
  {key:'special',label:'특별함',aliases:['special','특별','특별함']},
  {key:'uncommon',label:'안흔함',aliases:['uncommon','안흔','안흔함']},
  {key:'common',label:'흔함',aliases:['common','흔함']}
];
// Common cards still participate in recipe, overlap, and selection-wisp
// calculations. They are intentionally omitted from the coaching UI because
// their raw spent/remaining totals do not help the user choose a route.
const VISIBLE_HAND_TIER_META=HAND_TIER_META.filter(meta=>meta.key!=='common');
function handTierKey(value,state){
  if(value&&typeof value==='object'&&value.id&&state&&state.db){const unit=state.db.byId.get(String(value.id));if(unit)return handTierKey(C.tierKey(unit),state);}
  const key=String(value==null?'':value).trim().toLowerCase();for(const meta of HAND_TIER_META)if(meta.aliases.includes(key))return meta.key;return'';
}
function finiteField(source,names){for(const name of names)if(source&&source[name]!=null&&Number.isFinite(Number(source[name])))return Math.max(0,C.num(source[name]));return null;}
function safeHandName(state,id,given,fallback){
  const key=String(id||''),unit=key&&state&&state.db&&state.db.byId.get(key);if(unit)return displayNameOf(unit);if(C.SPECIAL_IDS&&C.SPECIAL_IDS[key])return C.SPECIAL_IDS[key];const text=String(given||'').trim();return text&&text!==key?text:(fallback||'재료');
}
function emptyHandLedger(state){
  const tiers={};for(const meta of HAND_TIER_META){const initial=(state.db.units||[]).filter(unit=>handTierKey(C.tierKey(unit),state)===meta.key).reduce((sum,unit)=>sum+C.num(state.counts[unit.id]),0);tiers[meta.key]={key:meta.key,label:meta.label,initial,spent:0,reserved:0,conflict:0,remaining:initial,wispSubstitute:0,rows:[]};}
  const initialWisp=C.num(state.wisp!=null?state.wisp:state.counts&&state.counts[C.WISP_ID]);return{source:'fallback',tiers,wisp:{initial:initialWisp,used:0,spent:0,reserved:0,conflict:0,remaining:initialWisp},byUnit:new Map()};
}
function addHandDestination(ledger,state,tierKey,target,material,count,status,wisp){
  const targetId=String(target&&target.id||target&&target.unitId||target&&target.targetId||target&&target.unit&&target.unit.id||''),targetName=safeHandName(state,targetId,target&&target.name||target&&target.unitName,'최종 유닛'),mapKey=targetId||`name:${targetName}`,entry=ledger.byUnit.get(mapKey)||{id:targetId,name:targetName,tiers:{},materials:{},wispSubstitute:0,conflict:0};
  if(count>0){entry.tiers[tierKey]=C.num(entry.tiers[tierKey])+count;(entry.materials[tierKey]||(entry.materials[tierKey]=[])).push({id:String(material&&material.id||''),name:safeHandName(state,material&&material.id,material&&material.name,'재료'),count,status:status||'spent'});if(status==='conflict')entry.conflict+=count;}
  if(wisp>0)entry.wispSubstitute+=wisp;ledger.byUnit.set(mapKey,entry);
}
function fallbackHandLedger(state,squad,lineup){
  const ledger=emptyHandLedger(state),rowMaps={};for(const meta of HAND_TIER_META)rowMaps[meta.key]=new Map();let working=Object.assign({},state.counts||{}),wisp=ledger.wisp.initial;
  const addSolve=(target,solve,status)=>{if(!target||!solve)return;const consumed=solve.consumed||solve.spend||{};
    for(const [id,rawCount] of Object.entries(consumed)){const unit=state.db.byId.get(id),tier=unit&&handTierKey(C.tierKey(unit),state),count=C.num(rawCount);if(!tier||count<=0)continue;const rows=rowMaps[tier],row=rows.get(id)||{id,name:safeHandName(state,id,'','재료'),initial:C.num(state.counts[id]),spent:0,reserved:0,conflict:0,remaining:C.num(state.counts[id]),wispSubstitute:0,usedBy:[]},bucket=status==='reserved'?'reserved':'spent';row[bucket]+=count;row.remaining=Math.max(0,row.initial-row.spent-row.reserved);row.usedBy.push({id:target.id,name:displayNameOf(target),count,status:bucket,label:bucket==='reserved'?'후속 예약':'즉시 사용'});rows.set(id,row);addHandDestination(ledger,state,tier,{id:target.id,name:displayNameOf(target)},{id,name:row.name},count,bucket,0);}
    const requested=C.num(solve.wispCost),used=Math.min(wisp,requested),wispBucket=status==='reserved'?'reserved':'spent';if(used>0){ledger.tiers.common.wispSubstitute+=used;ledger.wisp[wispBucket]+=used;ledger.wisp.used+=used;wisp-=used;addHandDestination(ledger,state,'common',{id:target.id,name:displayNameOf(target)},{name:'선택위습 대체'},0,status,used);}if(requested>used)ledger.wisp.conflict+=requested-used;
  };
  for(const action of squad.actions||[]){const target=action.unit||(action.id&&state.db.byId.get(action.id));if(!target)continue;const solve=action.solve||C.recipeSolve(state.db,target.id,working);addSolve(target,solve,'spent');working=Object.assign({},action.afterStock||solve.stockAfter||working);working[C.WISP_ID]=wisp;working[target.id]=Math.max(C.num(working[target.id]),1);}
  for(const item of lineup||[]){if(!item.unit||item.item&&item.item.status!=='future')continue;const solve=C.recipeSolve(state.db,item.unit.id,working);addSolve(item.unit,solve,'reserved');working=Object.assign({},solve.stockAfter||working);working[C.WISP_ID]=wisp;working[item.unit.id]=Math.max(C.num(working[item.unit.id]),1);}
  for(const meta of HAND_TIER_META){const tier=ledger.tiers[meta.key],rows=[...rowMaps[meta.key].values()];tier.rows=rows;tier.spent=rows.reduce((sum,row)=>sum+C.num(row.spent),0);tier.reserved=rows.reduce((sum,row)=>sum+C.num(row.reserved),0);tier.conflict=rows.reduce((sum,row)=>sum+C.num(row.conflict),0);tier.remaining=Math.max(0,tier.initial-tier.spent-tier.reserved);}
  ledger.wisp.remaining=Math.max(0,ledger.wisp.initial-ledger.wisp.used);return ledger;
}
function plannerTierContainer(squad){const hand=squad&&squad.handFit,raw=hand&&hand.tiers||hand&&hand.tierAllocation||squad&&squad.tierAllocation||null;return raw&&typeof raw==='object'?raw:null;}
function plannerTierSource(container,key,state){
  if(!container)return null;if(Array.isArray(container)){const matches=container.filter(row=>handTierKey(row&&((row.tier||row.key||row.grade)),state)===key);if(!matches.length)return null;const wrapped=matches.length===1&&matches[0]&&Array.isArray(matches[0].rows)?matches[0]:{rows:matches};return wrapped;}
  for(const [candidate,value] of Object.entries(container)){if(handTierKey(candidate,state)===key)return value;}
  return null;
}
function applyPlannerHandLedger(state,squad,ledger){
  const container=plannerTierContainer(squad);if(!container)return ledger;const fallbackByUnit=ledger.byUnit;let recognized=0;
  for(const meta of HAND_TIER_META){const source=plannerTierSource(container,meta.key,state);if(!source)continue;const sourceRows=Array.isArray(source)?source:Array.isArray(source.rows)?source.rows:[],summary=source.summary||source.totals||source,rows=[];
    for(const raw of sourceRows){if(!raw||typeof raw!=='object')continue;const id=String(raw.id||raw.materialId||''),name=safeHandName(state,id,raw.name||raw.materialName,'재료'),initial=finiteField(raw,['initial','start','starting','have','owned'])||0,spent=finiteField(raw,['spent','immediate','usedNow','used'])||0,reserved=finiteField(raw,['reserved','future','planned'])||0,conflict=finiteField(raw,['conflict','shortage','overclaim'])||0,remainingValue=finiteField(raw,['remaining','remain','after','left']),wispValue=finiteField(raw,['wispSubstitute','wispUsed','substitutedByWisp'])||0,usedBy=[];
      for(const destination of [].concat(raw.usedBy||raw.destinations||raw.allocations||[])){if(!destination)continue;const status=String(destination.status||destination.kind||'spent'),normalizedStatus=/conflict|short|부족/.test(status)?'conflict':/reserv|future|후속/.test(status)?'reserved':'spent',count=finiteField(destination,['count','used','spent','amount','value'])||0,targetId=String(destination.id||destination.targetId||destination.unitId||destination.unit&&destination.unit.id||''),targetName=safeHandName(state,targetId,destination.name||destination.targetName||destination.unitName,'최종 유닛'),destinationWisp=finiteField(destination,['wispSubstitute','wispUsed','substitutedByWisp'])||0;usedBy.push({id:targetId,name:targetName,count,status:normalizedStatus,label:destination.label||({spent:'즉시 사용',reserved:'후속 예약',conflict:'중복 충돌'}[normalizedStatus]),wispSubstitute:destinationWisp});}
      rows.push({id,name,initial,spent,reserved,conflict,remaining:remainingValue==null?Math.max(0,initial-spent-reserved):remainingValue,wispSubstitute:wispValue,usedBy});
    }
    const sum=name=>rows.reduce((total,row)=>total+C.num(row[name]),0),tier=ledger.tiers[meta.key];tier.rows=rows;tier.initial=finiteField(summary,['initial','start','starting','have','owned']);if(tier.initial==null)tier.initial=sum('initial');tier.spent=finiteField(summary,['spent','immediate','usedNow']);if(tier.spent==null)tier.spent=sum('spent');tier.reserved=finiteField(summary,['reserved','future','planned']);if(tier.reserved==null)tier.reserved=sum('reserved');tier.conflict=finiteField(summary,['conflict','shortage','overclaim']);if(tier.conflict==null)tier.conflict=sum('conflict');tier.remaining=finiteField(summary,['remaining','remain','after','left']);if(tier.remaining==null)tier.remaining=Math.max(0,tier.initial-tier.spent-tier.reserved);tier.wispSubstitute=finiteField(summary,['wispSubstitute','wispUsed','substitutedByWisp']);if(tier.wispSubstitute==null)tier.wispSubstitute=sum('wispSubstitute');recognized++;
  }
  if(!recognized)return ledger;ledger.source='planner';ledger.byUnit=new Map();for(const meta of HAND_TIER_META)for(const row of ledger.tiers[meta.key].rows||[])for(const destination of row.usedBy||[])addHandDestination(ledger,state,meta.key,{id:destination.id,name:destination.name},{id:row.id,name:row.name},C.num(destination.count),destination.status,C.num(destination.wispSubstitute));
  // A legacy planner may publish tier rows but omit per-target wisp data. Keep
  // only that harmless target annotation from the sequential fallback; card
  // usage counts themselves always come from the planner rows above.
  for(const [key,entry] of fallbackByUnit)if(C.num(entry.wispSubstitute)>0){const current=ledger.byUnit.get(key)||{id:entry.id,name:entry.name,tiers:{},materials:{},wispSubstitute:0,conflict:0};if(!C.num(current.wispSubstitute))current.wispSubstitute=C.num(entry.wispSubstitute);ledger.byUnit.set(key,current);}
  const hand=squad.handFit||{},wispSource=hand.wisp||squad.wispAllocation||{},spent=finiteField(wispSource,['spent','used','immediate']),reserved=finiteField(wispSource,['reserved','future','planned']),conflict=finiteField(wispSource,['conflict','shortage']);ledger.wisp.initial=finiteField(wispSource,['initial','start','have']);if(ledger.wisp.initial==null)ledger.wisp.initial=C.num(state.wisp);ledger.wisp.spent=spent==null?C.num(ledger.wisp.spent):spent;ledger.wisp.reserved=reserved==null?C.num(ledger.wisp.reserved):reserved;ledger.wisp.conflict=conflict==null?C.num(ledger.wisp.conflict):conflict;ledger.wisp.futureWorstCase=finiteField(wispSource,['futureWorstCase','worstCase','maximum']);ledger.wisp.used=ledger.wisp.spent+ledger.wisp.reserved;const tierWisp=HAND_TIER_META.reduce((sum,meta)=>sum+C.num(ledger.tiers[meta.key].wispSubstitute),0);if(tierWisp<=0&&ledger.wisp.used>0)ledger.tiers.common.wispSubstitute=ledger.wisp.used;ledger.wisp.remaining=finiteField(wispSource,['remaining','remain','after']);if(ledger.wisp.remaining==null)ledger.wisp.remaining=Math.max(0,ledger.wisp.initial-ledger.wisp.used);return ledger;
}
function resolveHandLedger(state,squad,lineup){return applyPlannerHandLedger(state,squad,fallbackHandLedger(state,squad,lineup));}
function handFitSummaryText(handFit,includeRare=true){const tiers=handFit&&handFit.tiers||{},labels={rare:'희귀',special:'특별',uncommon:'안흔'};return VISIBLE_HAND_TIER_META.filter(meta=>includeRare||meta.key!=='rare').map(meta=>{const row=tiers[meta.key]||{},used=finiteField(row,['assigned']);const assigned=used==null?C.num(row.spent!=null?row.spent:row.used)+C.num(row.reserved):used,initial=C.num(row.initial);return`${labels[meta.key]} ${assigned}/${initial}`;}).join(' · ');}
function observationKey(snapshot){
  const s=snapshot||{};return[String(s.sessionId||''),C.num(s.seq),String(s.dataHash||fingerprint(s)),C.num(s.dataChangedAt)].join(':');
}
function transactionSource(snapshot){const s=snapshot||{};return{sourceEpoch:C.num(s.sourceEpoch),sourceTabId:C.num(s.sourceTabId),sessionId:String(s.sessionId||'')};}
function normalizeRollback(value){
  const v=value&&typeof value==='object'?value:null;if(!v)return null;
  const virtualSpecialId=String(v.virtualSpecialId||''),baselineId=String(v.virtualSpecialBaselineId||'');
  return{manualCounts:Object.assign({},v.manualCounts||{}),pendingCounts:Object.assign({},v.pendingCounts||{}),pendingAt:Object.assign({},v.pendingAt||{}),wispOverride:String(v.wispOverride==null?'':v.wispOverride),virtualSpecialId,virtualSpecialBaselineId:virtualSpecialId&&baselineId===virtualSpecialId?baselineId:'',virtualSpecialBaselineCount:virtualSpecialId&&baselineId===virtualSpecialId?Math.max(0,Math.floor(C.num(v.virtualSpecialBaselineCount))):0,locks:Array.isArray(v.locks)?v.locks.map(x=>Object.assign({},x)):[],purpose:String(v.purpose||''),postLegendRoute:['legend','upper'].includes(v.postLegendRoute)?v.postLegendRoute:'',postLegendObservedCount:Math.max(0,C.num(v.postLegendObservedCount)),postLegendBaseline:v.postLegendBaseline&&typeof v.postLegendBaseline==='object'?Object.assign({},v.postLegendBaseline):{},upperBlueprint:normalizeUpperBlueprint(v.upperBlueprint),secondUpperId:String(v.secondUpperId||''),watchStability:normalizeWatchStability(v.watchStability),changedUsed:C.num(v.changedUsed),transcendUsed:C.num(v.transcendUsed),seraphUsed:C.num(v.seraphUsed)};
}
function normalizeTransaction(value){
  const v=value&&typeof value==='object'?value:null;if(!v||!v.expected||!Array.isArray(v.steps)||!v.steps.length)return null;
  const expected={};for(const [id,count] of Object.entries(v.expected||{}))expected[id]=Math.max(0,C.num(count));
  const source=v.source&&typeof v.source==='object'?{sourceEpoch:C.num(v.source.sourceEpoch),sourceTabId:C.num(v.source.sourceTabId),sessionId:String(v.source.sessionId||'')}:{sourceEpoch:0,sourceTabId:0,sessionId:''};
  return{at:C.num(v.at)||Date.now(),lastAt:C.num(v.lastAt)||C.num(v.at)||Date.now(),baseFingerprint:String(v.baseFingerprint||''),baseDataChangedAt:C.num(v.baseDataChangedAt),source,rollback:normalizeRollback(v.rollback),expected,status:v.status==='review'?'review':'pending',steps:v.steps.slice(-12)};
}
function transactionMatches(snapshot,transaction){
  const tx=normalizeTransaction(transaction);if(!tx)return false;const raw=snapshot&&snapshot.counts||{};
  return Object.entries(tx.expected).every(([id,target])=>Object.prototype.hasOwnProperty.call(raw,id)&&C.num(raw[id])===C.num(target));
}
function transactionSourceMatches(snapshot,transaction){const tx=normalizeTransaction(transaction);if(!tx)return false;const expected=tx.source||{},hasSource=expected.sourceEpoch>0||expected.sourceTabId>0||!!expected.sessionId;if(!hasSource)return true;const actual=transactionSource(snapshot);return actual.sourceEpoch===expected.sourceEpoch&&actual.sourceTabId===expected.sourceTabId&&actual.sessionId===expected.sessionId;}

class App{
  constructor(root,catalog,config){
    this.root=root;this.catalog=catalog||[];this.config=config||{};const stored=readStore();this.state=normalizeInitialState(stored);
    this.state.manualCounts=Object.assign({},stored.manualCounts||{});this.state.pendingCounts={};this.state.pendingAt={};this.state.pendingTransaction=normalizeTransaction(stored.pendingTransaction);this.state.locks=Array.isArray(stored.locks)?stored.locks:[];this.state.upperBlueprint=normalizeUpperBlueprint(stored.upperBlueprint);this.state.secondUpperId=String(stored.secondUpperId||'');this.state.upperDetection=normalizeUpperDetection(stored.upperDetection);this.state.recentMainUppers=Array.isArray(stored.recentMainUppers)?stored.recentMainUppers.map(String).slice(0,5):[];this.state.watchStability=normalizeWatchStability(stored.watchStability);this.onConnectionTest=null;this.onOpenTmo=null;this._renderedRound=1;this._squadCacheKey='';this._squadCache=null;this._v15CacheKey='';this._v15Cache=null;this._terminalCandidate=null;this._terminalWipeAt=0;this._lastVerdictReport=null;this._verdictCache=null;this._verdictCacheKey='';this._upperRankCacheKey='';this._upperRankCache=[];this._directionRankCacheKey='';this._directionRankCache=null;this._blueprintRankings=null;this._blueprintRankingsKey='';this._blueprintDesiredKey='';this._blueprintRankSeq=0;this._blueprintWorkerDisabled=false;this._directionDesiredKey='';this._directionRankSeq=0;this._directionRankTimer=0;this._directionWorker=null;this._directionInFlight=null;this._directionWorkerDisabled=false;this.runLog=null;this._runLogReady=false;this._runLogBaseline=null;this._runLogLastDecisionDigest='';this._runLogHistory=[];this._runLogSelectedRun=null;this._runLogSelectedId='';this._runLogFilter='all';this._runLogDeleteArmedAt=0;this._runResultOpen=false;this._runResultSaving=false;this._runResultDraft=Object.assign({},RUN_RESULT_DEFAULTS);this._clockTimer=setInterval(()=>this.updateClockOnly(),1000);this._onDocumentKeydown=e=>{if(e.key==='Escape'&&this._snipeOpen){this._snipeOpen=false;this.render();}else if(e.key==='Escape'&&this.state.detailId){this.state.detailId='';this.render();}else if(e.key==='Escape'&&this._runResultOpen&&!this._runResultSaving){this._runResultOpen=false;this.render();}};document.addEventListener('keydown',this._onDocumentKeydown);this.bind();this.persist();this.render();this._runLogReadyPromise=this.initRunLog();
  }
  destroy(){clearInterval(this._clockTimer);clearTimeout(this._toastTimer);clearTimeout(this._directionRankTimer);this._directionRankSeq++;if(this._directionWorker)this._directionWorker.terminate();this._directionWorker=null;if(this.runLog)this.runLog.destroy().catch(()=>{});document.removeEventListener('keydown',this._onDocumentKeydown);}
  persist(){const copy=Object.assign({},this.state);for(const k of ['snapshot','liveAt','connectionDiagnostic','message','detailId','unitSearch','newGameArmedAt','v1912DesktopLink'])delete copy[k];writeStore(copy);}
  async initRunLog(){
    const Log=global.ORDRunLog,Compactor=global.ORDRunLogCompactor;if(!Log||!Compactor||typeof Log.createRecorder!=='function')return;
    try{
      this.runLog=Log.createRecorder({app:{name:'ORD 2.310 악몽 실전 판단 코치',version:VERSION,source:this.config.source||'app'},game:{version:'2.310',difficulty:'nightmare'},limits:{maxRuns:12,maxEventsPerRun:1500,maxBytes:3500000},persistence:{keyPrefix:'ordRunLogV1',flushDelayMs:750,chunkEvents:40,limits:{maxRuns:12,maxEventsPerRun:1500,maxBytes:3500000}}});
      await this.runLog.ready();if(!this.runLog.summary().hasRun)this.runLog.startRun({app:{build:'decision-audit-v1'}});this._runLogReady=true;await this.refreshRunLogHistory(false);
      if(this.state.snapshot){this.recordAcceptedSnapshot(this.state.snapshot,null,true);const health=this.health();if(health.ready)this.captureRunDecision(this.plan(),true);}
      if(this.state.tab==='runlog')this.render();else this.updateRunLogCountOnly();
    }catch(error){this._runLogReady=false;this.runLog=null;}
  }
  runLogActive(){return!!(this._runLogReady&&this.runLog&&this.runLog.summary().status==='active');}
  latestRunSnapshotId(){const events=this.runLog&&this.runLog.currentRun&&this.runLog.currentRun.events||[];for(let index=events.length-1;index>=0;index--)if(events[index].type==='snapshot')return events[index].eventId;return'';}
  runLogContext(extra){return Object.assign({round:this.actualRound(),snapshotId:this.latestRunSnapshotId(),source:this.config.source||'app'},extra||{});}
  compactOverrideMap(source){const out={};for(const [key,value] of Object.entries(source||{})){const amount=C.num(value);if(amount>0)out[String(key)]=amount;}return out;}
  recordAuditAction(payload,context){if(!this.runLogActive())return null;try{const actor=String(payload&&payload.actor||''),source=actor==='user'?'user':actor==='tmo'?'tmo':actor==='program'?'system':'app',result=this.runLog.record('user-action',payload||{},this.runLogContext(Object.assign({source},context||{})));this.updateRunLogCountOnly();return result;}catch(error){return null;}}
  recordAcceptedSnapshot(snapshot,previous,force){
    if(!this.runLogActive()||!snapshot||!global.ORDRunLogCompactor)return null;try{
      // v16: force a fresh full keyframe periodically.  A run whose only full
      // record is the first snapshot becomes unreadable as soon as any event
      // pruning drops that record.
      this._runLogSnapshotsSinceFull=C.num(this._runLogSnapshotsSinceFull);
      if(this._runLogSnapshotsSinceFull>=40){this._runLogBaseline=null;this._runLogSnapshotsSinceFull=0;}
      const compact=global.ORDRunLogCompactor.compactSnapshot(snapshot,this._runLogBaseline);this._runLogBaseline=compact.baseline;this._runLogSnapshotsSinceFull=compact.record&&compact.record.kind==='full'?0:this._runLogSnapshotsSinceFull+1;if(compact.duplicate&&!force)return null;const tx=normalizeTransaction(this.state.pendingTransaction),payload=Object.assign({},compact.record,{effectiveInput:{manualCounts:this.compactOverrideMap(this.state.manualCounts),wispOverride:this.state.wispOverride===''?null:C.num(this.state.wispOverride),virtualSpecialId:String(this.state.virtualSpecialId||''),virtualSpecialBaselineId:String(this.state.virtualSpecialBaselineId||''),virtualSpecialBaselineCount:C.num(this.state.virtualSpecialBaselineCount),pendingTransaction:tx?{status:tx.status,expected:this.compactOverrideMap(tx.expected),steps:tx.steps.map(step=>({id:String(step.id||''),name:String(step.name||''),wispCost:C.num(step.wispCost)})).slice(-12)}:null},localDirect:snapshot.localDirect?{unknownCodes:(snapshot.localDirect.unknownCodes||[]).slice(0,24),unknownCounts:Object.assign({},snapshot.localDirect.unknownCounts||{}),midJoin:snapshot.localDirect.midJoin===true}:null}),result=this.runLog.record('snapshot',payload,this.runLogContext({source:'tmo',at:C.num(snapshot.at)||Date.now()}));this._runLogLastDecisionDigest='';this.updateRunLogCountOnly();return result;
    }catch(error){return null;}
  }
  captureRunDecision(pack,force){
    if(!this.runLogActive()||!pack||!this.state.snapshot||!this._runLogBaseline||!global.ORDRunLogCompactor)return null;try{
      const compact=global.ORDRunLogCompactor.compactDecision(pack),state=pack.state||{},locks=(this.state.locks||[]).map(lock=>{const unit=state.db&&state.db.byId&&state.db.byId.get(lock.id);return{stage:String(lock.stage||''),id:String(lock.id||''),name:unit?displayNameOf(unit):'',source:String(lock.source||'')}}),tx=normalizeTransaction(this.state.pendingTransaction);compact.input={snapshotStateDigest:this._runLogBaseline&&this._runLogBaseline.digest||'',directionStatus:this.state.directionStatus,directionKey:this.state.directionKey,directionUpperId:this.state.directionUpperId,postLegendRoute:this.state.postLegendRoute,locks,selectionWisp:C.num(state.wisp),manualOverrideCount:Object.keys(this.state.manualCounts||{}).length,temporaryTransaction:tx?{status:tx.status,stepIds:tx.steps.map(step=>String(step.id||'')),expected:this.compactOverrideMap(tx.expected)}:null};compact.digest=global.ORDRunLogCompactor.stableDigest(compact);if(!force&&compact.digest===this._runLogLastDecisionDigest)return null;this._runLogLastDecisionDigest=compact.digest;const result=this.runLog.record('decision',compact,this.runLogContext({source:'system'}));this.updateRunLogCountOnly();return result;
    }catch(error){return null;}
  }
  updateRunLogCountOnly(){if(!this.root||!this.runLog)return;const count=this.runLog.summary().eventCount;this.root.querySelectorAll('[data-run-log-count]').forEach(node=>node.textContent=String(count));}
  async refreshRunLogHistory(shouldRender){if(!this.runLog)return[];try{await this.runLog.flush();this._runLogHistory=await this.runLog.repository.listRuns();if(shouldRender&&this.state.tab==='runlog')this.render();return this._runLogHistory;}catch(error){return this._runLogHistory;}}
  async selectRunLog(runId){if(!this.runLog)return;await this.runLog.ready();const current=this.runLog.currentRun;if(current&&current.runId===runId)this._runLogSelectedRun=current;else this._runLogSelectedRun=await this.runLog.repository.getRun(runId);this._runLogSelectedId=String(runId||'');if(this.state.tab==='runlog')this.render();}
  viewedRunLog(){const current=this.runLog&&this.runLog.currentRun;if(this._runLogSelectedId&&current&&this._runLogSelectedId===current.runId)return current;return this._runLogSelectedRun||current||null;}
  async downloadRunLog(runId){
    if(!this.runLog||!global.ORDRunLog){this.toast('진행 기록 모듈을 시작하지 못했습니다. 확장 프로그램을 다시 로드해 주세요.');return false;}try{
      await this.runLog.ready();await this.runLog.flush();const current=this.runLog.currentRun;let run=current&&(!runId||current.runId===runId)?this.runLog.exportObject():await this.runLog.repository.getRun(runId);if(!run)throw new Error('저장할 게임 기록이 없습니다.');const json=global.ORDRunLog.exportRun(run),lastOutcome=(run.events||[]).slice().reverse().find(event=>event.type==='outcome'),kind=lastOutcome&&lastOutcome.payload&&lastOutcome.payload.kind||run.status||'playing',stamp=new Date(run.startedAt||Date.now()).toISOString().replace(/[-:]/g,'').replace('T','_').slice(0,15),filename=`ORD_2310_${stamp}_${kind}.ordlog.json`,blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),doc=this.root.ownerDocument||document,anchor=doc.createElement('a');anchor.href=url;anchor.download=filename;anchor.style.display='none';doc.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);return true;
    }catch(error){this.toast(`진행 기록 저장 실패: ${String(error&&error.message||error)}`);return false;}
  }
  outcomeDetails(){
    const draft=this._runResultDraft||RUN_RESULT_DEFAULTS,optional=value=>value===''||value==null?null:C.num(value),percent01=value=>{const parsed=optional(value);return parsed==null||parsed<0||parsed>100?null:parsed;},health=this.health(),tx=normalizeTransaction(this.state.pendingTransaction);return{round:optional(draft.round)||this.actualRound(),failureReason:String(draft.failureReason||'unknown'),followedProgram:String(draft.followedProgram||'unknown'),bossHpPercent:percent01(draft.bossHpPercent),upgrades:{attack:optional(draft.attackUpgrade),slow:optional(draft.slowUpgrade),hpRegen:optional(draft.hpRegenUpgrade),mpRegen:optional(draft.mpRegenUpgrade)},helperUsed:draft.helperUsed===true,note:String(draft.note||'').slice(0,500),snapshotFresh:health.ready===true&&C.num(health.ageSec)<=8,snapshotHealth:{key:health.key,ageSec:C.num(health.ageSec),ready:health.ready===true},pendingTransaction:tx?{status:tx.status,steps:tx.steps.map(step=>({id:String(step.id||''),name:String(step.name||'')}))}:null,lastDecisionDigest:this._runLogLastDecisionDigest||null};
  }
  async saveRunOutcome(){
    if(this._runResultSaving)return;if(!this.runLogActive()){this._runResultOpen=false;this.toast('이미 종료된 기록입니다. 새 게임을 시작한 뒤 결과를 입력해 주세요.');return;}this._runResultSaving=true;this._runResultOpen=false;this.render();try{await this.runLog.ready();const kind=String(this._runResultDraft.kind||'r50_failed');this.recordVerdictReport(kind==='r50_killed'?'r50-checkpoint':'run-result');if(kind==='r50_killed')this._lastVerdictReport=null;const terminal=kind!=='r50_killed',failed=RUN_FAILURE_KINDS.has(kind),details=this.outcomeDetails();this.runLog.recordOutcome(kind,details,this.runLogContext({round:details.round,terminal,status:failed?'failed':kind==='r65_cleared'?'completed':undefined,source:'user'}));this._runResultDraft=Object.assign({},RUN_RESULT_DEFAULTS);await this.runLog.flush();await this.refreshRunLogHistory(false);const downloaded=!terminal||await this.downloadRunLog(this.runLog.currentRun&&this.runLog.currentRun.runId);this.toast(kind==='r50_killed'?'50라 보스 처치를 기록했습니다. 이 게임 기록은 65라까지 계속됩니다.':downloaded?'게임 결과를 기록하고 JSON 파일로 저장했습니다.':'게임 결과는 기록했지만 파일 저장은 실패했습니다. 진행 기록에서 JSON 저장을 다시 눌러 주세요.');}catch(error){this.toast(`게임 결과 기록 실패: ${String(error&&error.message||error)}`);}finally{this._runResultSaving=false;}
  }
  beginNewRunLog(){if(!this.runLog||!this._runLogReady)return;const summary=this.runLog.summary();if(summary.status==='active')this.runLog.endRun('abandoned',{kind:'abandoned',reason:'new-game-reset'},this.runLogContext({source:'user-reset'}));this.runLog.startRun({force:true,app:{build:'decision-audit-v1'}});this._runLogBaseline=null;this._runLogLastDecisionDigest='';this._runLogSelectedId='';this._runLogSelectedRun=null;this.refreshRunLogHistory(false);}
  async clearRunLogs(){if(!this.runLog)return;await this.runLog.clearAll();this.runLog.startRun({force:true,app:{build:'decision-audit-v1'}});this._runLogBaseline=null;this._runLogLastDecisionDigest='';this._runLogSelectedId='';this._runLogSelectedRun=null;await this.refreshRunLogHistory(false);this.render();this.toast('저장된 진행 기록을 모두 삭제하고 새 기록을 시작했습니다.');}
  setMessage(msg){this.state.message=msg;clearTimeout(this._toastTimer);this._toastTimer=setTimeout(()=>{this.state.message='';const n=this.root.querySelector('.ord-toast');if(n)n.remove();},3200);}
  toast(msg){this.setMessage(msg);if(this.shouldDeferExternalRender())this._deferredExternalRender=true;else this.render();}
  effectiveManualCounts(snapshot){const out=Object.assign({},this.state.manualCounts||{}),tx=normalizeTransaction(this.state.pendingTransaction);if(tx)for(const [id,target] of Object.entries(tx.expected))out[id]=C.num(target);return out;}
  transactionRollbackSnapshot(){return{manualCounts:Object.assign({},this.state.manualCounts||{}),pendingCounts:Object.assign({},this.state.pendingCounts||{}),pendingAt:Object.assign({},this.state.pendingAt||{}),wispOverride:this.state.wispOverride,virtualSpecialId:this.state.virtualSpecialId,virtualSpecialBaselineId:this.state.virtualSpecialBaselineId,virtualSpecialBaselineCount:C.num(this.state.virtualSpecialBaselineCount),locks:(this.state.locks||[]).map(x=>Object.assign({},x)),purpose:this.state.purpose,postLegendRoute:this.state.postLegendRoute,postLegendObservedCount:C.num(this.state.postLegendObservedCount),postLegendBaseline:Object.assign({},this.state.postLegendBaseline||{}),upperBlueprint:normalizeUpperBlueprint(this.state.upperBlueprint),secondUpperId:String(this.state.secondUpperId||''),directionStatus:this.state.directionStatus,directionKey:this.state.directionKey,directionUpperId:this.state.directionUpperId,directionHoldFingerprint:this.state.directionHoldFingerprint,watchStability:normalizeWatchStability(this.state.watchStability),changedUsed:C.num(this.state.changedUsed),transcendUsed:C.num(this.state.transcendUsed),seraphUsed:C.num(this.state.seraphUsed)};}
  restoreTransaction(tx){const normalized=normalizeTransaction(tx),rollback=normalized&&normalized.rollback;if(!rollback)return;this.state.manualCounts=Object.assign({},rollback.manualCounts);this.state.pendingCounts=Object.assign({},rollback.pendingCounts);this.state.pendingAt=Object.assign({},rollback.pendingAt);this.state.wispOverride=rollback.wispOverride;this.state.virtualSpecialId=rollback.virtualSpecialId;this.state.virtualSpecialBaselineId=rollback.virtualSpecialBaselineId;this.state.virtualSpecialBaselineCount=rollback.virtualSpecialBaselineCount;this.state.locks=rollback.locks.map(x=>Object.assign({},x));this.state.purpose=rollback.purpose;this.state.postLegendRoute=rollback.postLegendRoute;this.state.postLegendObservedCount=rollback.postLegendObservedCount;this.state.postLegendBaseline=Object.assign({},rollback.postLegendBaseline||{});this.state.upperBlueprint=normalizeUpperBlueprint(rollback.upperBlueprint);this.state.secondUpperId=String(rollback.secondUpperId||'');this.state.directionStatus=rollback.directionStatus||'open';this.state.directionKey=rollback.directionKey||'';this.state.directionUpperId=rollback.directionUpperId||'';this.state.directionHoldFingerprint=rollback.directionHoldFingerprint||'';this.state.watchStability=normalizeWatchStability(rollback.watchStability);this.state.changedUsed=rollback.changedUsed;this.state.transcendUsed=rollback.transcendUsed;this.state.seraphUsed=rollback.seraphUsed;}
  commitTransaction(tx){const normalized=normalizeTransaction(tx);if(!normalized)return;for(const id of Object.keys(normalized.expected)){delete this.state.manualCounts[id];delete this.state.pendingCounts[id];delete this.state.pendingAt[id];}if(Object.prototype.hasOwnProperty.call(normalized.expected,C.WISP_ID))this.state.wispOverride='';this.state.pendingTransaction=null;this._squadCacheKey='';this.recordAuditAction({actor:'tmo',action:'build-confirmed',steps:normalized.steps.map(step=>({id:String(step.id||''),name:String(step.name||''),wispCost:C.num(step.wispCost)})),expected:this.compactOverrideMap(normalized.expected)});}
  rollbackTransaction(tx){const normalized=normalizeTransaction(tx||this.state.pendingTransaction);this.restoreTransaction(normalized);this.state.pendingTransaction=null;this._squadCacheKey='';if(normalized)this.recordAuditAction({actor:'program',action:'build-rolled-back',status:normalized.status,steps:normalized.steps.map(step=>({id:String(step.id||''),name:String(step.name||'')}))});}
  prunePending(snapshot,now){const tx=normalizeTransaction(this.state.pendingTransaction);if(!tx)return false;if(!transactionSourceMatches(snapshot,tx)){this.rollbackTransaction(tx);this.setMessage('TMO 원본 세션이 바뀌어 확인 전 제작 거래를 되돌렸습니다.');return true;}const changedData=fingerprint(snapshot)!==tx.baseFingerprint||C.num(snapshot&&snapshot.dataChangedAt)>tx.baseDataChangedAt;if(changedData&&transactionMatches(snapshot,tx)){this.commitTransaction(tx);return true;}const time=now||Date.now();if(time-tx.lastAt>20000&&tx.status!=='review'){tx.status='review';this.state.pendingTransaction=tx;this.recordAuditAction({actor:'program',action:'build-confirmation-delayed',steps:tx.steps.map(step=>({id:String(step.id||''),name:String(step.name||'')}))});return true;}return false;}
  // v23.0(맵 원본): 희귀 리롤 상한은 항법 의존 — 기본 2, 도박광 +1(연속
  // 베팅 제외), 카지노 +1, 리스크헷지 +2·목재0.  C.navProfile 이 정본.
  rerollLimit(){return C.navProfile(this.state.navFamily,this.state.navPerk).rerollMax;}
  settings(){const tx=normalizeTransaction(this.state.pendingTransaction),transactionWisp=tx&&Object.prototype.hasOwnProperty.call(tx.expected,C.WISP_ID)?String(tx.expected[C.WISP_ID]):null,blueprint=normalizeUpperBlueprint(this.state.upperBlueprint),postLegendRoute=['legend','upper'].includes(this.state.postLegendRoute)?this.state.postLegendRoute:'';return{settingsRevision:178,mode:this.state.mode,modeExplicit:this.state.modeExplicit===true,magicRoute:this.state.magicRoute,targetSquadCount:9,purpose:this.state.upperPreviewId?'upper':'',postLegendRoute,gorosei:this.state.gorosei,superKumaOwned:this.state.superKumaOwned,story10Reward:this.state.story10Reward,storyRushAbandoned:this.state.storyRushAbandoned===true,virtualSpecialId:this.state.virtualSpecialId,virtualSpecialBaselineId:this.state.virtualSpecialBaselineId,virtualSpecialBaselineCount:C.num(this.state.virtualSpecialBaselineCount),wispOverride:transactionWisp!=null?transactionWisp:this.state.wispOverride,upperPreviewId:this.state.upperPreviewId,secondUpperId:String(this.state.secondUpperId||''),preferredLineupIds:blueprint?blueprint.lineupIds:[],currentRound:C.num(this.state.currentRound)||1,roundStartedAt:this.state.roundStartedAt,roundPrepSeconds:this.state.roundPrepSeconds,roundNormalSeconds:this.state.roundNormalSeconds,roundBossSeconds:this.state.roundBossSeconds,manualCounts:this.effectiveManualCounts(this.state.snapshot),labResearch:Object.assign({},this.state.labResearch),upperResearchLevel:C.num(this.state.upperResearchLevel)||1,allowWarped:true,recommendWarped:true,stunConditions:{},navFamily:this.state.navFamily,navPerk:this.state.navPerk,rerollLimit:this.rerollLimit(),rerollsUsed:C.num(this.state.rerollsUsed),transcendUsed:C.num(this.state.transcendUsed),seraphUsed:C.num(this.state.seraphUsed),changedUsed:C.num(this.state.changedUsed),prescribedSecondUpperIds:this.v197PrescribedSecondIds(),recentMainUppers:this.v1914RecentMains()};}
  // v19.14: 최근 판 메인 목록 — 이번 판에서 이미 확정한 메인(목록 맨 앞에
  // 올라와 있음)은 빼고 지난 판들만 넘긴다.  확정 상위 자신이 감점되면
  // 유지·재확정 UI가 흔들린다.
  v1914RecentMains(){
    const recent=Array.isArray(this.state.recentMainUppers)?this.state.recentMainUppers.map(key=>String(key||'')).filter(Boolean):[];
    const lock=this.upperLock(),currentKey=lock?String(C.canonicalUpperId(lock.id)):'';
    return recent.filter(key=>key!==currentKey).slice(0,3);
  }
  // v19.7.1(외부 감사 ④): 처방(전수 메모 v2)의 추천 2상위를 플래너에
  // "후단 타이브레이크 전용" id 목록으로 넘긴다.  플래너는 플레이북 전역을
  // 모른다(경계 유지) — 여기서 계열 필터를 거친 순수 id 만 건넨다.
  v197PrescribedSecondIds(){
    // v23.1: 패왕의길(1기)·계엄령(0기)에서는 2상위 처방을 만들지 않는다.
    const navCap=C.navProfile(this.state.navFamily,this.state.navPerk).upperCap;
    if(navCap!=null&&navCap<=1)return[];
    const locked=this.upperLock();if(!locked)return[];
    const db=this.catalogDb(),unit=db.byId.get(String(locked.id));if(!unit)return[];
    const entry=upperPlaybookOf(unit);if(!entry||!Array.isArray(entry.second))return[];
    const routeMode=this.state.mode||C.familyOf(unit)||'physical';
    return entry.second.map(rec=>String(rec.id||'')).filter(id=>{
      const candidate=db.byId.get(id);if(!candidate)return false;
      const family=C.familyOf(candidate);
      return family==='neutral'||family===routeMode;
    }).slice(0,3).sort();
  }
  catalogDb(){return this._catalogDb||(this._catalogDb=C.buildDb(this.catalog));}
  // v16.1: normalizeState clones and re-indexes the full 307-unit catalog.
  // During early-round kill churn TMO emits a snapshot every second or two,
  // and every render re-ran this from scratch — measurable game-machine load.
  normalized(){
    const settings=this.settings(),key=`${fingerprint(this.state.snapshot)}|${JSON.stringify([settings.manualCounts,settings.virtualSpecialId,settings.virtualSpecialBaselineId,settings.virtualSpecialBaselineCount,settings.superKumaOwned,settings.wispOverride])}`;
    if(key!==this._normalizedCacheKey||!this._normalizedCache){this._normalizedCache=C.normalizeState(this.catalog,this.state.snapshot||{},settings);this._normalizedCacheKey=key;}
    return this._normalizedCache;
  }
  postLegendDecision(state){
    const legendCount=legendHiddenCount(state),upperFinalized=!!(this.upperLock()||ownedUpperCount(state)),active=legendCount>0&&!upperFinalized;
    return{active,awaiting:active&&!this.state.postLegendRoute,route:active?this.state.postLegendRoute:'',legendCount,upperDecided:upperFinalized,previewing:active&&!!this.state.upperPreviewId};
  }
  actualRound(){const clk=C.roundClock({currentRound:C.num(this.state.currentRound)||1,roundStartedAt:this.state.roundStartedAt,roundPrepSeconds:this.state.roundPrepSeconds,roundNormalSeconds:this.state.roundNormalSeconds,roundBossSeconds:this.state.roundBossSeconds},Date.now());return clk.running&&clk.round>0?clk.round:C.num(this.state.currentRound)||1;}
  stabilizeWatch(plan,state,settings){
    const raw=(plan.watch||[]).slice(0,6),rawIds=raw.map(x=>x.unit.id),upper=plan.upper?C.canonicalUpperId(plan.upper.id):'',lockSignature=(this.state.locks||[]).map(lock=>`${lock.stage}:${lock.id}`).sort().join(','),blueprint=normalizeUpperBlueprint(this.state.upperBlueprint),blueprintSignature=blueprint?`${blueprint.revision}:${blueprint.lineupIds.slice().sort().join(',')}`:'',context=[plan.mode,plan.purpose,upper,lockSignature,blueprintSignature,settings.currentRound<=7?'1-7':settings.currentRound<=20?'8-20':settings.currentRound<=30?'21-30':settings.currentRound<=50?'31-50':'51+'].join('|'),manual=Object.entries(settings.manualCounts||{}).sort().map(x=>x.join(':')).join(','),observation=[observationKey(this.state.snapshot),manual,state.wisp].join('|'),same=(a,b)=>a.length===b.length&&a.every((id,i)=>id===b[i]);let s=normalizeWatchStability(this.state.watchStability);plan.watch=raw;
    if(s.context!==context||!s.stableIds.length){s={context,stableIds:rawIds,pendingIds:[],pendingStreak:0,lastObservationKey:observation};this.state.watchStability=s;return plan;}
    if(same(rawIds,s.stableIds)){s.pendingIds=[];s.pendingStreak=0;s.lastObservationKey=observation;this.state.watchStability=s;return plan;}
    if(s.lastObservationKey!==observation){const continuing=same(rawIds,s.pendingIds);s.pendingIds=rawIds;s.pendingStreak=continuing?s.pendingStreak+1:1;s.lastObservationKey=observation;if(s.pendingStreak>=3){s.stableIds=rawIds;s.pendingIds=[];s.pendingStreak=0;this.state.watchStability=s;return plan;}}
    this.state.watchStability=s;const actions=new Set((plan.actions||[]).map(x=>x.unit.id)),rawById=new Map(raw.map(x=>[x.unit.id,x])),stable=s.stableIds.filter(id=>!actions.has(id)&&!C.num(state.counts[id])).map(id=>rawById.get(id)).filter(Boolean).slice(0,6);if(stable.length)plan.watch=stable;plan.watchStabilizing={pendingStreak:s.pendingStreak,required:3,pendingIds:s.pendingIds.slice()};return plan;
  }
  // v18.1: TMO가 최종 등급 유닛 하나를 읽기에서 빠뜨리는 일이 있다.
  // 실측(20260728_170254): 고정한 상위 (S)료쿠규가 20번 사라졌다 돌아왔고
  // 그때마다 역할표가 무너져 "지금 할 일"이 갈아엎였다.  소실 구간은 전부
  // 읽기 1~3회였으므로 몇 번은 직전 값을 유지하고, 그래도 안 돌아오면
  // 진짜 없어진 것으로 받아들인다.  제작으로 소비된 것은 예외다.
  stabilizeSnapshot(snapshot){
    if(!C.stabilizeFinalUnits||!snapshot||!snapshot.counts)return snapshot;
    const db=this.catalogDb&&this.catalogDb();
    if(!db||!db.byId)return snapshot;
    const pending=this.state.pendingTransaction;
    const consumed=pending&&pending.consumed?Object.keys(pending.consumed):[];
    const result=C.stabilizeFinalUnits(this._finalUnitGuard,snapshot.counts,db,{consumed});
    this._finalUnitGuard={counts:Object.assign({},result.counts),misses:result.misses};
    this._finalUnitHeld=result.held;
    if(result.released.length)for(const row of result.released)
      this.toast(`${row.name}이(가) TMO 패에서 계속 보이지 않아 없는 것으로 처리합니다.`);
    if(!result.held.length)return snapshot;
    // 유지한 값으로 판단하되, 무엇을 유지 중인지는 화면에 남긴다.
    return Object.assign({},snapshot,{counts:result.counts,heldFinalUnits:result.held});
  }
  compactDirectionSnapshot(){const snapshot=this.state.snapshot||{},units=(snapshot.units||[]).map(unit=>({id:String(unit&&unit.id||''),name:unit&&unit.name,groupName:unit&&unit.groupName,count:C.num(unit&&unit.count),percent:C.num(unit&&unit.percent),tmoPercent:C.num(unit&&unit.tmoPercent),abilities:unit&&unit.abilities||{}})).filter(unit=>unit.id);return{counts:Object.assign({},snapshot.counts||{}),currentAbilities:Object.assign({},snapshot.currentAbilities||{}),units};}
  stopDirectionWorker(){if(this._directionWorker)this._directionWorker.terminate();this._directionWorker=null;this._directionInFlight=null;}
  ensureDirectionWorker(){
    if(this._directionWorkerDisabled||!this.config.directionWorkerUrl||typeof Worker!=='function')return null;if(this._directionWorker)return this._directionWorker;try{const worker=new Worker(this.config.directionWorkerUrl);worker.onmessage=event=>{const message=event&&event.data||{};if(message.type==='rank-upper-blueprints-result'){this.applyBlueprintRankings(message);return;}if(message.type==='rank-upper-blueprints-error'){this.failBlueprintRank(message);return;}if(message.type==='rank-directions-error')this.failDirectionRank(message.error||'방향 계산 Worker 오류',{requestId:message.requestId,key:message.key});else this.acceptDirectionRank(message);};worker.onerror=event=>this.failDirectionRank(String(event&&event.message||'방향 계산 Worker 오류'));this._directionWorker=worker;return worker;}catch(error){this._directionWorkerDisabled=true;return null;}
  }
  queueDirectionRank(key,settings){
    if(!key||this._directionRankCacheKey===key||this._directionDesiredKey===key&&(this._directionRankTimer||this._directionInFlight))return;this._directionDesiredKey=key;clearTimeout(this._directionRankTimer);if(this._directionInFlight&&this._directionInFlight.key!==key)this.stopDirectionWorker();const requestId=++this._directionRankSeq,job={requestId,key,payload:{snapshot:this.compactDirectionSnapshot(),settings:Object.assign({},settings,{upperPreviewId:'',preferredLineupIds:[]}),options:{perLane:2,candidateCap:8}}};this._directionRankTimer=setTimeout(()=>{this._directionRankTimer=0;if(requestId!==this._directionRankSeq||key!==this._directionDesiredKey)return;const worker=this.ensureDirectionWorker();if(worker){this._directionInFlight={requestId,key};worker.postMessage(Object.assign({type:'rank-directions'},job));return;}this.runDirectionFallback(job);},180);
  }
  runDirectionFallback(job){
    if(this.config.source==='extension'){this.failDirectionRank('별도 방향 계산기를 시작하지 못했습니다. 확장 프로그램을 다시 로드해 주세요.',job);return;}this._directionInFlight={requestId:job.requestId,key:job.key};const run=()=>{if(job.requestId!==this._directionRankSeq||job.key!==this._directionDesiredKey)return;try{const board=global.ORDSquadPlanner.rankDeckDirections({catalog:this.catalog,snapshot:job.payload.snapshot,settings:job.payload.settings,locks:[]},job.payload.options);this.acceptDirectionRank({type:'rank-directions-result',requestId:job.requestId,key:job.key,board});}catch(error){this.failDirectionRank(String(error&&error.message||error),job);}};if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:500});else setTimeout(run,0);
  }
  acceptDirectionRank(message){
    if(message.type!=='rank-directions-result'||message.requestId!==this._directionRankSeq||message.key!==this._directionDesiredKey)return;this._directionInFlight=null;this._directionRankCache=message.board||{lanes:[],safeReroll:[]};this._directionRankCacheKey=message.key;if(this.shouldDeferExternalRender()){this._deferredExternalRender=true;return;}this.render();
  }
  queueBlueprintRank(key,settings,decision){
    // v21.0: 엔진이 방향을 스스로 채택하므로 ROUTE_CHOICE 상태는 더는
    // 나오지 않는다.  전체 파티 계획은 "상위가 아직 없고 확정도 안 된"
    // 구간(= 엔진이 routeAuto 를 실은 판단)에서 계속 필요하다 — 방향판이
    // 이 평가로 후보를 채운다.
    if(!decision||!(decision.state==='ROUTE_CHOICE'||decision.routeAuto))return;
    const candidates=decision.routeCandidates||[];if(!candidates.length)return;
    const worker=this.ensureDirectionWorker();if(!worker)return;
    const supplied=Array.isArray(decision.routeCandidateLanes)?decision.routeCandidateLanes:[],byLane=new Map();
    for(const lane of supplied){
      const laneKey=String(lane&&lane.key||lane&&lane.route||lane&&lane.mode||'physical');
      byLane.set(laneKey,{key:laneKey,mode:lane&&lane.mode||(laneKey==='physical'?'physical':'magic'),route:lane&&lane.route||laneKey,candidateIds:[...new Set((lane&&lane.candidateIds||[]).map(String).filter(Boolean))]});
    }
    if(!byLane.size)for(const row of candidates){
      const laneKey=String(row.routeKey||row.mode||'physical');
      if(!byLane.has(laneKey))byLane.set(laneKey,{key:laneKey,mode:row.mode||'physical',route:row.routeKey||laneKey,candidateIds:[]});
      byLane.get(laneKey).candidateIds.push(String(row.id));
    }
    const requestId=++this._blueprintRankSeq;
    this._blueprintDesiredKey=key;
    worker.postMessage({type:'rank-upper-blueprints',requestId,key,payload:{snapshot:this.compactDirectionSnapshot(),settings:Object.assign({},settings,{upperPreviewId:'',preferredLineupIds:[]}),lanes:[...byLane.values()]}});
  }
  applyBlueprintRankings(message){
    if(!message||message.requestId!==this._blueprintRankSeq||message.key!==this._blueprintDesiredKey)return;
    this._blueprintRankings=message.rankings||null;
    this._blueprintRankingsKey=message.key;
    // 같은 패로 다시 계산해 주입된 랭킹이 반영되게 한다.
    this._v15CacheKey='';
    if(this.shouldDeferExternalRender()){this._deferredExternalRender=true;return;}
    this.render();
  }
  failBlueprintRank(message){
    if(!message||message.requestId!==this._blueprintRankSeq||message.key!==this._blueprintDesiredKey)return;
    this._blueprintWorkerDisabled=true;
    this._blueprintRankings=null;
    this._blueprintRankingsKey='';
    // Re-run the same hand synchronously.  Leaving the old provisional cache
    // alive made every card stay "미평가" after a Worker exception.
    this._v15CacheKey='';
    if(this.shouldDeferExternalRender()){this._deferredExternalRender=true;return;}
    this.render();
  }
  failDirectionRank(error,job){
    const active=job||this._directionInFlight;if(active&&(active.requestId!==this._directionRankSeq||active.key!==this._directionDesiredKey))return;this.stopDirectionWorker();this._directionWorkerDisabled=true;this._blueprintWorkerDisabled=true;this._v15CacheKey='';this._directionRankCache={error:String(error||'방향 계산 오류'),lanes:[],safeReroll:[]};this._directionRankCacheKey=this._directionDesiredKey;if(this.shouldDeferExternalRender())this._deferredExternalRender=true;else this.render();
  }
  // v20.2(0806 로그 r48 · 사용자 재보고): 제작 진행 중 잠금의 수명 관리.
  //
  // 엔진은 "이 대상을 잡아라"는 선언(_craftLockId)만 받는다.  언제
  // 잠그고 언제 푸는지는 앱이 안다 — 선택 위습이 줄고 있다(= 지금
  // 그 대상을 향해 재료를 찍는 중)는 신호는 스냅샷 시계열이라 앱에만
  // 있기 때문이다.
  //
  // 잠금 시작: 판단이 어떤 대상을 제시하면 그 시점의 선위를 기준선으로 기록.
  // 잠금 유지: 대상 미보유 + 선위가 기준선 이하(소비 중) + 2라운드 이내.
  // 잠금 해제: 보유 완료 · 선위가 기준선을 넘어 회복(다른 데 안 쓰는 중) ·
  //           2라운드 경과 · 사용자가 다른 것을 수동 제작(markBuild).
  // 현재 선택 위습 — 스냅샷 원본(wispCount)이 진실이고, 없으면 counts.
  v202Wisp(){
    const snap=this.state.snapshot||{};
    if(snap.wispCountFound&&snap.wispCount!=null)return C.num(snap.wispCount);
    return C.num((snap.counts||{})[C.WISP_ID]);
  }
  v202CraftLockId(settings){
    const lock=this._v202CraftLock;if(!lock||!lock.id)return'';
    const counts=(this.state.snapshot&&this.state.snapshot.counts)||{};
    if(C.num(counts[lock.id])>0){this._v202CraftLock=null;return'';}
    const round=C.num(settings&&settings.currentRound);
    if(round&&lock.round&&round-lock.round>=2){this._v202CraftLock=null;return'';}
    const wisp=this.v202Wisp();
    // 선위가 기준선을 넘어섰다 = 그 대상에 쓰는 중이 아니다(라운드 수입만
    // 쌓이는 대기 상태) — 이때는 엔진 판단을 그대로 보여 준다.
    if(wisp>C.num(lock.wisp)){this._v202CraftLock=null;return'';}
    return String(lock.id);
  }
  v202NoteCraftLock(proposed,settings){
    if(!proposed||!proposed.id)return;
    const id=String(proposed.id),wisp=this.v202Wisp(),round=C.num(settings&&settings.currentRound);
    const lock=this._v202CraftLock;
    if(!lock||lock.id!==id){this._v202CraftLock={id,name:String(proposed.name||''),wisp,round};return;}
    // 같은 대상이 유지되는 동안 기준선은 최댓값으로 둔다 — 라운드 수입이
    // 들어와도 "소비 중" 판정이 유지되도록.
    if(wisp>C.num(lock.wisp))lock.wisp=wisp;
    lock.round=round||lock.round;
  }
  v202ReleaseCraftLock(){this._v202CraftLock=null;}
  authoritativeDecision(settings){
    const engine=global.ORDV15Engine;if(!engine||typeof engine.decide!=='function')return null;
    const strategic={
      round:C.num(settings.currentRound),mode:settings.mode||'',magicRoute:settings.magicRoute||'',postLegendRoute:settings.postLegendRoute||'',gorosei:settings.gorosei||'none',story10Reward:settings.story10Reward||'',storyRushAbandoned:settings.storyRushAbandoned===true,vetoIds:(this.state.vetoIds||[]).join(','),
      upperPreviewId:settings.upperPreviewId||'',virtualSpecialId:settings.virtualSpecialId||'',virtualSpecialBaselineId:settings.virtualSpecialBaselineId||'',virtualSpecialBaselineCount:C.num(settings.virtualSpecialBaselineCount),wispOverride:settings.wispOverride,superKumaOwned:settings.superKumaOwned!==false,
      changedUsed:C.num(settings.changedUsed),seraphUsed:C.num(settings.seraphUsed),transcendUsed:C.num(settings.transcendUsed),rerollsUsed:C.num(settings.rerollsUsed),
      manual:Object.entries(settings.manualCounts||{}).sort(),locks:(this.state.locks||[]).map(lock=>[lock.stage,lock.id]).sort(),pendingTransaction:!!this.state.pendingTransaction,
      pendingReroll:this.state.pendingReroll&&[this.state.pendingReroll.id,this.state.pendingReroll.baseFingerprint,this.state.pendingReroll.beforeCount]
    },key=[fingerprint(this.state.snapshot),JSON.stringify(strategic)].join('|');
    if(key!==this._v15CacheKey){
      // v17.22: 전체 파티 계획은 워커가 돌린다.  워커를 못 쓰는 환경
      // (Worker 미지원·오류)에서는 인라인 계획으로 되돌아간다.
      const workerReady=!this._blueprintWorkerDisabled&&!!this.ensureDirectionWorker();
      const decideSettings=Object.assign({},settings,{_blueprintRankings:this._blueprintRankingsKey===key?this._blueprintRankings:null,_blueprintPlanSync:!workerReady,_stickyActionId:this._stickyActionId||'',_craftLockId:this.v202CraftLockId(settings),_vetoIds:(this.state.vetoIds||[]).map(String)});
      try{this._v15Cache=engine.decide({catalog:this.catalog,snapshot:this.state.snapshot||{},settings:decideSettings,locks:this.state.locks||[]});}
      catch(error){this._v15Cache={version:VERSION,authority:true,state:'SYNC_BLOCKED',label:'판단 엔진 점검 필요',reason:String(error&&error.message||error),action:null,alternatives:[],unknowns:['판단 엔진 오류']};}
      this._v15CacheKey=key;
      // v18.2: 이번에 승인·제시한 대상을 기억해 다음 라운드에 넘긴다.
      // 엔진은 이것이 여전히 최선과 결정적으로 동점일 때만 유지하므로,
      // 더 나은 후보가 나타나면 그대로 바뀐다.
      const proposed=this._v15Cache&&(this._v15Cache.action||this._v15Cache.blockedAction);
      if(proposed&&proposed.id)this._stickyActionId=String(proposed.id);
      if(workerReady&&this._blueprintRankingsKey!==key)this.queueBlueprintRank(key,settings,this._v15Cache);
    }
    const base=this._v15Cache;if(!base)return null;
    if(this.state.pendingTransaction)return Object.assign({},base,{state:'SYNC_BLOCKED',label:'제작 결과 확인 대기',reason:'직전 제작의 유닛·소모 재료·선택 위습이 TMO에서 확인될 때까지 다음 자원 행동을 잠급니다.',action:null,blockedAction:base.action||base.blockedAction||null,pendingKind:'build'});
    const pending=this.state.pendingReroll;if(pending)return Object.assign({},base,{state:'SYNC_BLOCKED',label:'리롤 결과 확인 대기',reason:`${pending.name||'희귀'} 1장 리롤 뒤 해당 희귀 수량이 감소한 TMO 패를 기다립니다. 어떤 희귀든 수량이 줄면 그 리롤로 인정해 해제하며, 2라운드가 지나면 자동 해제됩니다.`,action:null,blockedAction:null,pendingKind:'reroll'});
    return base;
  }
  plan(){
    const state=this.normalized(),settings=this.settings(),postLegend=this.postLegendDecision(state);settings.currentRound=this.actualRound();if(postLegend.active)settings.purpose=postLegend.route==='legend'?'story':'upper';
    // The live cockpit, audit log and diagnostics use only the v15 authority.
    // The legacy recommendation planner is intentionally left for the
    // deck/manual-inspection tab, where its broad catalog rows are useful and
    // cannot stall the game during every TMO snapshot.
    if(global.ORDV15Engine&&this.state.tab!=='deck'){
      const rawV15=this.authoritativeDecision(settings),assessment=rawV15&&rawV15.assessment||{},route=assessment.route||null,mode=route&&route.mode||settings.mode||'physical',upper=C.mainUpper(state,this.state.locks,settings),spec=assessment.role&&assessment.role.spec||C.currentSpec(state,mode,Object.assign({},settings,upper?{_upperUnit:upper}:{})),deficits=assessment.role&&assessment.role.deficits||C.deficits(spec,mode,Object.assign({},settings,upper?{_upperUnit:upper}:{})),label=String(rawV15&&rawV15.label||''),purpose=settings.purpose||(/첫 희귀/.test(label)?'rare':/전설/.test(label)?'story':rawV15&&(rawV15.state==='ROUTE_CHOICE'||rawV15.routeAuto)?'upper':'spec');
      const livePlan={mode,purpose,round:settings.currentRound,settings,upper,spec,deficits,actions:[],watch:[],prep:[],rows:[],availableWisp:state.wisp,postLegendDecision:postLegend,v15Decision:rawV15,selectionMode:'v15-single-authority',actionCap:1,completionForced:/첫 희귀|첫 전설|추가 전설/.test(label)};
      // Strategy and execution now share one party plan.  The squad planner
      // chooses the 9→11-equivalent composition; v15 remains the only module
      // allowed to approve a real craft from the current exact ledger.
      const upperLock=this.upperLock(),partyUpperId=upperLock&&upperLock.id||upper&&C.num(state.counts[upper.id])>0&&upper.id||'';
      if(partyUpperId){
        const squad=this.v151ComputeParty(state,livePlan,partyUpperId);
        if(squad&&!squad.error){
          livePlan.squadPlan=squad;
          const reconciled=global.ORDV15Engine&&typeof global.ORDV15Engine.reconcileSquadExecution==='function'
            ?global.ORDV15Engine.reconcileSquadExecution(rawV15,squad,this.state.locks||[])
            :rawV15;
          livePlan.v15Decision=this.v151ProtectRareDecision(reconciled,squad,state);
        }
      }
      const v15=livePlan.v15Decision||rawV15,actions=v15&&v15.state==='ACT_NOW'&&v15.action&&v15.action.row?[v15.action.row]:[];livePlan.actions=actions;livePlan.rows=actions.slice();
      // v20.2: 제작 진행 중 잠금은 **화면에 실제로 뜬 카드**를 기억해야
      // 한다.  원시 v15 판단(_v15Cache)은 reconcileSquadExecution 이
      // 덮어쓰기 전 값이라 사용자가 본 적 없는 대상일 수 있다 —
      // 0806 r48 재생에서 원시 1순위는 봉쿠레, 화면은 킬러였다.
      this.v202NoteCraftLock(v15&&(v15.action||v15.blockedAction),settings);
      return{state,settings,plan:livePlan};
    }
    const plan=C.recommendationPlan(state,this.state.locks,settings,global.ORD_UPPER_MEMO,global.ORD_SYNERGY_MEMO);plan.postLegendDecision=postLegend;
    if(postLegend.route==='legend'){
      const ranked=(plan.rows||[]).slice().sort((a,b)=>C.num(b.progress)-C.num(a.progress)||C.num(a.solve&&a.solve.wispCost)-C.num(b.solve&&b.solve.wispCost)||displayNameOf(a.unit).localeCompare(displayNameOf(b.unit),'ko'));ranked.forEach((row,index)=>{row.completionRank=index+1;row.why=Object.assign({},row.why||{},{headline:`추가 전설·히든 ${index+1}순위 · 한 기 완성 후 경로 재선택`});});plan.rows=ranked;plan.actions=ranked.slice(0,3);const actionIds=new Set(plan.actions.map(row=>row.unit.id));plan.watch=ranked.filter(row=>!actionIds.has(row.unit.id)).slice(0,6);plan.prep=[];plan.selectionMode='alternatives';plan.completionForced=true;plan.extraLegendChoice=true;
    }
    const planner=global.ORDSquadPlanner,confirmedBlueprint=normalizeUpperBlueprint(this.state.upperBlueprint),upperLocked=this.upperLock();
    if(!global.ORDV15Engine&&planner&&typeof planner.rankDeckDirections==='function'&&plan.purpose==='upper'&&!upperLocked&&!postLegend.awaiting){
      const manual=Object.entries(settings.manualCounts||{}).sort().map(pair=>pair.join(':')).join(','),rankInputs={manual,virtualSpecialId:settings.virtualSpecialId,virtualSpecialBaselineId:settings.virtualSpecialBaselineId,virtualSpecialBaselineCount:settings.virtualSpecialBaselineCount,wispOverride:settings.wispOverride,gorosei:settings.gorosei,superKumaOwned:settings.superKumaOwned,changedUsed:settings.changedUsed,seraphUsed:settings.seraphUsed,transcendUsed:settings.transcendUsed,secondUpperId:String(this.state.secondUpperId||''),roundBand:settings.currentRound<50?'pre50':'50plus'},rankKey=[fingerprint(this.state.snapshot),JSON.stringify(rankInputs)].join('|');
      if(rankKey!==this._directionRankCacheKey)this.queueDirectionRank(rankKey,settings);const rawBoard=rankKey===this._directionRankCacheKey&&this._directionRankCache?this._directionRankCache:{loading:true,lanes:[],safeReroll:[],reason:'전체 패 방향을 별도 계산기에서 분석 중입니다.'},board=directionBoardForMode(rawBoard,settings.mode);plan.directionBoard=board;plan.directionStatus=this.state.directionStatus;plan.directionKey=this.state.directionKey;const flattened=(board.lanes||[]).flatMap(lane=>(lane.rows||[]).map(row=>Object.assign({},row,{directionKey:lane.key,directionLabel:lane.label,directionPriority:lane.priority})));plan.upperRankings=flattened;this._upperRankCache=flattened;plan.upperBlueprintRanked=true;plan.selectionMode='directions';
    }
    if(!global.ORDV15Engine&&planner&&typeof planner.rankUpperBlueprints==='function'&&plan.purpose==='upper'&&!upperLocked&&!postLegend.awaiting&&!plan.directionBoard){
      const candidates=(plan.rows||[]).filter(row=>C.isUpper(row.unit)&&row.progress>=60).slice(0,6),candidateIds=[...new Set(candidates.map(row=>row.unit.id))],rankSettings=Object.assign({},settings,{mode:plan.mode,upperPreviewId:'',preferredLineupIds:[]}),rankInputs={candidateIds,manualCounts:settings.manualCounts||{},mode:plan.mode,magicRoute:rankSettings.magicRoute,gorosei:rankSettings.gorosei,superKumaOwned:rankSettings.superKumaOwned,virtualSpecialId:rankSettings.virtualSpecialId,virtualSpecialBaselineId:rankSettings.virtualSpecialBaselineId,virtualSpecialBaselineCount:rankSettings.virtualSpecialBaselineCount,wispOverride:rankSettings.wispOverride,changedUsed:rankSettings.changedUsed,seraphUsed:rankSettings.seraphUsed,transcendUsed:rankSettings.transcendUsed,roundBand:settings.currentRound<50?'pre50':'50plus'},rankKey=[fingerprint(this.state.snapshot),JSON.stringify(rankInputs)].join('|');
      if(candidateIds.length&&rankKey!==this._upperRankCacheKey){try{this._upperRankCache=planner.rankUpperBlueprints({catalog:this.catalog,state,settings:rankSettings,locks:[],corePlan:plan,upperMemo:global.ORD_UPPER_MEMO,synergyMemo:global.ORD_SYNERGY_MEMO},{candidateIds})||[];}catch(error){this._upperRankCache=[];}this._upperRankCacheKey=rankKey;}
      const rowById=new Map((plan.rows||[]).map(row=>[row.unit.id,row])),used=new Set(),ranked=[];for(const item of this._upperRankCache||[]){const row=rowById.get(item.upperId)||candidates.find(x=>C.canonicalUpperId(x.unit.id)===item.upperCanonicalId);if(!row||used.has(row.unit.id))continue;used.add(row.unit.id);const blueprintHandSummary=handFitSummaryText(item.plan&&item.plan.handFit||item.handFit,false),roleComplete=!!(item.roleComplete||item.clearComplete);ranked.push(Object.assign({},row,{upperBlueprint:item,blueprintRareUsed:C.num(item.rareUsed),blueprintRareTotal:C.num(item.rareTotal),blueprintRareRemaining:C.num(item.rareRemaining),blueprintRareConflict:C.num(item.rareConflict),blueprintHandSummary,blueprintClearComplete:roleComplete,blueprintReadiness:C.num(item.readiness),watchKind:'blueprint',watchReason:`예상 최종안 희귀 ${C.num(item.rareUsed)}/${C.num(item.rareTotal)}장 · ${blueprintHandSummary||'하위 패 순차 계산'} · ${roleComplete?'미래 구조 역할 합계 충족':`미래 역할 ${C.num(item.readiness)}%`}`}));}
      if(ranked.length){const rest=(plan.rows||[]).filter(row=>!used.has(row.unit.id));plan.rows=ranked.concat(rest);plan.actions=ranked.filter(row=>row.valueStatus!=='hold').slice(0,3);const actionIds=new Set(plan.actions.map(row=>row.unit.id));plan.watch=ranked.filter(row=>!actionIds.has(row.unit.id)).slice(0,6);plan.upperRankings=this._upperRankCache.slice();plan.upperBlueprintRanked=true;plan.selectionMode='alternatives';plan.actionCap=3;}
    }
    const previewRanking=!confirmedBlueprint&&settings.upperPreviewId&&(this._upperRankCache||[]).find(item=>(item.upperId===settings.upperPreviewId||item.upperCanonicalId===C.canonicalUpperId(settings.upperPreviewId))&&(!this.state.directionKey||!item.directionKey||item.directionKey===this.state.directionKey)),previewBlueprint=previewRanking&&previewRanking.exactVerified?normalizeUpperBlueprint(previewRanking.blueprint):null,blueprint=confirmedBlueprint||previewBlueprint,upperChosen=!!(settings.upperPreviewId||upperLocked);
    if(!global.ORDV15Engine&&planner&&typeof planner.planFinalSquad==='function'&&upperChosen&&(settings.currentRound>=18||['upper','spec'].includes(plan.purpose))){
      const plannerSettings=Object.assign({},settings,{mode:plan.mode,preferredLineupIds:blueprint?blueprint.lineupIds:[],stickyUpperIds:(this._stickyUpperIds||[]).slice()}),plannerInputs={manualCounts:settings.manualCounts||{},mode:plan.mode,magicRoute:settings.magicRoute,targetSquadCount:9,currentRound:settings.currentRound,gorosei:settings.gorosei,superKumaOwned:settings.superKumaOwned,allowWarped:true,recommendWarped:true,virtualSpecialId:settings.virtualSpecialId,virtualSpecialBaselineId:settings.virtualSpecialBaselineId,virtualSpecialBaselineCount:settings.virtualSpecialBaselineCount,wispOverride:settings.wispOverride,stunConditions:{},changedUsed:settings.changedUsed,seraphUsed:settings.seraphUsed,transcendUsed:settings.transcendUsed,upperPreviewId:settings.upperPreviewId,secondUpperId:String(this.state.secondUpperId||''),stickyUpperIds:(this._stickyUpperIds||[]).slice().sort(),locks:(this.state.locks||[]).map(x=>[x.stage,x.id]),upperBlueprint:blueprint?{upperId:blueprint.upperId,lineupIds:blueprint.lineupIds,buildOrderIds:blueprint.buildOrderIds,revision:blueprint.revision}:null},key=[fingerprint(this.state.snapshot),JSON.stringify(plannerInputs)].join('|');
      if(key!==this._squadCacheKey){try{this._squadCache=planner.planFinalSquad({catalog:this.catalog,state,settings:plannerSettings,locks:this.state.locks,upperBlueprint:blueprint,corePlan:plan,upperMemo:global.ORD_UPPER_MEMO,synergyMemo:global.ORD_SYNERGY_MEMO});}catch(error){this._squadCache={error:String(error&&error.message||error),finalLineup:[],actions:[],bottlenecks:[]};}this._squadCacheKey=key;}
      plan.squadPlan=this._squadCache;
      // v19(사용자 요청 ①): 이번에 계획된 상위를 기억해 다음 계산에 넘긴다.
      // 상위는 만드는 데 여러 라운드가 걸려서, 만들다가 바뀌면 그때까지 태운
      // 재료가 낭비된다.  플래너는 이것을 필수 역할 판정 뒤 타이브레이크로만
      // 쓰므로, 더 닫는 후보가 나타나면 그대로 바뀐다.
      this.rememberPlannedUppers(state,this._squadCache);
      const squad=this._squadCache||{},unitOf=item=>item&&item.unit?(typeof item.unit==='string'?state.db.byId.get(item.unit):item.unit):item&&item.id?state.db.byId.get(item.id):null;
      if(!squad.error&&plan.mode==='magic'&&settings.magicRoute==='auto'&&['dual','singleEnd'].includes(squad.magicRoute)){
        plan.resolvedMagicRoute=squad.magicRoute;
        plan.deficits=C.deficits(plan.spec,plan.mode,Object.assign({},settings,{magicRoute:squad.magicRoute,_resolvedMagicRoute:squad.magicRoute,_upperUnit:plan.upper||null}));
      }
      const exactQueue=squad&&squad.safePrefix&&Array.isArray(squad.safePrefix.actions)?squad.safePrefix.actions:[],prefixAudit=squad&&squad.safePrefix&&squad.safePrefix.audit||{},prefixSafe=!['stop','hold'].includes(prefixAudit.level);
      if(!squad.error&&plan.purpose==='spec'&&exactQueue.length&&prefixSafe){
        plan.actions=exactQueue.slice(0,2).map(action=>{
          const unit=unitOf(action),base=(plan.rows||[]).find(row=>unit&&row.unit.id===unit.id)||{},availableWisp=C.num(action.remainingWisp)+C.num(action.wispCost),currentSolve=unit?C.recipeSolve(state.db,unit.id,state.counts):action.solve;
          return Object.assign({},base,action,{unit,solve:action.solve,currentSolve,availableWisp,wispBreakdown:{current:C.num(currentSolve&&currentSolve.wispCost),planned:C.num(action.solve&&action.solve.wispCost),available:availableWisp,gap:Math.max(0,C.num(action.solve&&action.solve.wispCost)-availableWisp),basis:'sequential'},role:C.roleProfile(unit),progress:C.completionPercent(state,unit),story:C.storyGrade(unit),blocked:[],feasible:true,wispGap:0,commonTop:C.commonTop(state.db,action.solve&&action.solve.lowestMissing||{},3),rareUse:Object.values(action.solve&&action.solve.rareUse||{}).reduce((sum,value)=>sum+C.num(value),0),rareSpend:{total:Object.values(action.solve&&action.solve.rareUse||{}).reduce((sum,value)=>sum+C.num(value),0),clears:0},why:Object.assign({},base.why||{},{headline:`현재 TMO 패 검증 순서 ${action.order||''}: ${action.reason||'재료 중복 없이 제작'}`})});
        }).filter(x=>x.unit&&x.solve);plan.selectionMode='queue';plan.actionCap=2;plan.globalSquadQueue=true;
        const watchStock=Object.assign({},squad.safePrefix.afterStock||state.counts),watchWisp=C.num(watchStock[C.WISP_ID]),watchSpec=squad.safePrefix.stage&&squad.safePrefix.stage.spec||plan.spec;
        plan.watch=(plan.watch||[]).slice(0,6).map(original=>{
          const unit=original&&original.unit;if(!unit)return null;
          const repriced=C.candidateRow(state,unit,{mode:plan.mode,purpose:'watch',round:settings.currentRound,upper:plan.upper,spec:watchSpec,deficits:plan.deficits||{},stock:watchStock,ruleCounts:watchStock,availableWisp:watchWisp,rareInventory:plan.rareInventory,rarePressure:plan.rarePressure,completionOnly:false,costBasis:'sequential'});
          const blocked=(repriced.blocked||[])[0],watchKind=blocked?'material':repriced.wispGap>0?'wisp':'alternative',watchReason=original.upperBlueprint?original.watchReason:blocked?blocked:repriced.wispGap>0?`선위 ${repriced.wispGap}개 더 필요`:'앞 제작 뒤 즉시 후보';
          return Object.assign({},original,repriced,{watchKind,watchReason,why:original.why});
        }).filter(Boolean);
        const byId={};for(const action of plan.actions)for(const [id,value] of Object.entries(action.solve.rareUse||{}))byId[id]=C.num(byId[id])+C.num(value);const plannedSpend=Object.values(byId).reduce((sum,value)=>sum+C.num(value),0),clears=Object.entries(byId).filter(([id,value])=>C.num(state.counts[id])<=C.num(value)).length;plan.rareSpend={plannedSpend,after:Math.max(0,C.num(plan.rareInventory&&plan.rareInventory.total)-plannedSpend),clears,byId:Object.entries(byId).map(([id,use])=>({id,use}))};
      }
    }
    if(!plan.upperBlueprintRanked)this.stabilizeWatch(plan,state,settings);
    if(plan.flow&&plan.flow.phase==='upper-build'&&plan.projectedUpper){const target=C.canonicalUpperId(plan.projectedUpper.id),owned=state.db.uppers.some(unit=>C.canonicalUpperId(unit.id)===target&&C.num(state.counts[unit.id])>0);if(!owned){const candidate=plan.upperBuildRow||(plan.actions||[]).find(row=>row&&row.unit&&C.canonicalUpperId(row.unit.id)===target)||(plan.rows||[]).find(row=>row&&row.unit&&C.canonicalUpperId(row.unit.id)===target);plan.actions=candidate&&candidate.feasible===true?[candidate]:[];plan.watch=candidate?[candidate].concat((plan.watch||[]).filter(row=>row&&row.unit&&C.canonicalUpperId(row.unit.id)!==target)).slice(0,6):(plan.watch||[]).slice(0,6);plan.upperBuildBlocked=!plan.actions.length;}}
    const v15=this.authoritativeDecision(settings);plan.v15Decision=v15;
    if(v15&&v15.authority){plan.actions=v15.state==='ACT_NOW'&&v15.action&&v15.action.row?[v15.action.row]:[];plan.watch=[];plan.selectionMode='v15-single-authority';plan.actionCap=1;plan.completionForced=/첫 희귀|첫 전설|추가 전설/.test(String(v15.label||''));}
    return{state,settings,plan};
  }
  health(){const base=C.snapshotHealth(this.state.snapshot,Date.now()),waiting=this.state.awaitingNewGameFingerprint;if(waiting&&fingerprint(this.state.snapshot)===waiting)return Object.assign({},base,{key:'waiting',label:'새 게임 패 확인 중',ready:false,note:'이전 게임 패로 추천하지 않도록 잠갔습니다. TMO에서 새 게임 패로 초기화한 뒤 지금 동기화를 누르세요.'});
    // v19.12: 데스크톱 셸의 '미수신'은 두 상태를 구분한다 — 프로그램 연결
    // 여부는 프로브로 판별되고, 조합도우미 페이지는 셸과 무관하므로 열라고
    // 하지 않는다 (0804: 사용자가 tmo.gg 페이지를 열고 기다렸다).
    if(typeof window!=='undefined'&&window.ORD_DESKTOP&&base.key==='missing'){
      this.v1912KickDesktopProbe();
      const link=this.state.v1912DesktopLink;
      if(link&&link.ok)return Object.assign({},base,{label:'게임 시작 대기 중 · TMO 프로그램 연결됨',note:'TMO.GG 데스크톱 프로그램이 응답하고 있습니다. 게임에서 유닛이 잡히는 순간 자동으로 시작합니다 — 브라우저·조합도우미 페이지는 필요 없습니다.'});
      if(link)return Object.assign({},base,{label:'TMO 프로그램 미연결',note:'TMO.GG 데스크톱 프로그램(설치형 앱)이 응답하지 않습니다. 프로그램을 실행하면 자동으로 연결됩니다 — tmo.gg 웹사이트를 여는 것으로는 연결되지 않습니다.'});
      return Object.assign({},base,{label:'TMO 프로그램 연결 확인 중',note:'TMO.GG 데스크톱 프로그램의 로컬 서버 응답을 확인하고 있습니다.'});
    }
    return base;}
  // v19.12: 완성도%는 TMO 도우미 화면의 계산값 — 로컬 직결만 있고 보강이
  // 없으면(데스크톱 셸 상시) 전부 0으로 온다.  0%를 사실처럼 표기하지
  // 않도록, 보강 여부를 한 곳에서 판정한다.
  v1912TmoEnriched(){const s=this.state.snapshot;if(!s)return true;if(s.source!=='local-direct')return true;return C.num(s.abilityCount)>=3;}
  v1912KickDesktopProbe(){
    if(typeof window==='undefined'||!window.ORD_DESKTOP||typeof window.ORD_DESKTOP.probe!=='function')return;
    const now=Date.now();
    if(this._v1912ProbeAt&&now-this._v1912ProbeAt<5000)return;
    this._v1912ProbeAt=now;
    Promise.resolve(window.ORD_DESKTOP.probe()).then(result=>{
      const ok=!!(result&&(result.ok===true||C.num(result.status)===200));
      const prev=this.state.v1912DesktopLink;
      this.state.v1912DesktopLink={ok,at:Date.now()};
      if(!prev||prev.ok!==ok)this.render();
    }).catch(()=>{
      const prev=this.state.v1912DesktopLink;
      this.state.v1912DesktopLink={ok:false,at:Date.now()};
      if(!prev||prev.ok!==false)this.render();
    });
  }
  upperLock(){return(this.state.locks||[]).find(x=>x&&x.stage==='upper')||null;}
  // v19.2: 지금 계통으로 돌아왔고, 창 안이고, 유닛이 여전히 존재할 때만
  // 복구 힌트를 유효로 본다.  조건 밖이면 화면에 아무것도 안 뜨는 게
  // 맞다 — 오래되거나 계통이 다른 힌트를 들이밀면 더 헷갈린다.
  activeReleasedUpperHint(){
    const hint=this.state.releasedUpperHint;if(!hint||!hint.id)return null;
    if(hint.mode!==this.state.mode)return null;
    if(this.actualRound()-C.num(hint.releasedRound)>RELEASED_UPPER_HINT_ROUND_WINDOW)return null;
    const unit=this.normalized().db.byId.get(hint.id);if(!unit||!C.isUpper(unit)||C.familyOf(unit)!==hint.mode)return null;
    return{hint,unit};
  }
  applyMagicRouteSelection(value,upperId=''){
    const route=['dual','singleEnd'].includes(value)?value:'auto',locked=this.upperLock(),blueprint=normalizeUpperBlueprint(this.state.upperBlueprint),committedId=String(upperId||locked&&locked.id||blueprint&&blueprint.upperId||''),sameUpper=blueprint&&committedId&&C.canonicalUpperId(blueprint.upperId)===C.canonicalUpperId(committedId);let changed=false;
    if(this.state.magicRoute!==route){this.state.magicRoute=route;changed=true;}
    if(this.state.mode!=='magic')return changed;
    if(route==='auto'){
      const hadMagicDirection=['dual','singleEnd'].includes(this.state.directionKey);
      if(hadMagicDirection){this.state.directionKey='';changed=true;}
      if(hadMagicDirection&&this.state.directionUpperId){this.state.directionUpperId='';changed=true;}
      if(hadMagicDirection&&['preview','selected'].includes(this.state.directionStatus)){this.state.directionStatus='open';changed=true;}
      if(hadMagicDirection&&this.state.directionHoldFingerprint){this.state.directionHoldFingerprint='';changed=true;}
      if(hadMagicDirection&&this.state.upperPreviewId){this.state.upperPreviewId='';changed=true;}
      if(blueprint&&blueprint.mode==='magic'){this.state.upperBlueprint=null;changed=true;}
    }else{
      if(this.state.directionKey!==route){this.state.directionKey=route;changed=true;}
      if(committedId){
        if(this.state.directionUpperId!==committedId){this.state.directionUpperId=committedId;changed=true;}
        if(this.state.directionStatus!=='selected'){this.state.directionStatus='selected';changed=true;}
        if(this.state.directionHoldFingerprint){this.state.directionHoldFingerprint='';changed=true;}
        if(!blueprint||!sameUpper||blueprint.mode!=='magic'||blueprint.magicRoute!==route){this.state.upperBlueprint=this.captureUpperCommitment(committedId,'magic',route);changed=true;}
      }
    }
    if(changed){this._squadCacheKey='';this._upperRankCacheKey='';this._upperRankCache=[];this._directionRankCacheKey='';this._directionDesiredKey='';this._blueprintRankings=null;this._blueprintRankingsKey='';this._blueprintDesiredKey='';this._v15CacheKey='';this._v15Cache=null;}
    return changed;
  }
  syncUpperMode(id,db){
    const unit=(db||this.catalogDb()).byId.get(String(id||'')),family=unit&&C.familyOf(unit);if(!['physical','magic'].includes(family))return false;let changed=false;
    // v21.3(사용자: "자동으로 바꿀려 했는데 강제로 물딜로 고정됐었어"):
    // TMO 감지로 상위가 잠기면 이 함수가 매 스냅샷마다 mode 를 상위 계통으로
    // 되돌려 썼다.  사용자가 '자동'(mode='')을 명시적으로 고른 뒤에는 그
    // 선택이 이긴다 — 자동은 "엔진이 추론"이지 "빈 값이니 채워라"가 아니다.
    // 잠긴 상위 자체는 그대로라 추론 결과는 대개 같은 계통이지만, 화면
    // 선택과 이후 추론의 자유는 사용자 것이다.
    if(this.state.modeExplicit===true&&!this.state.mode)return false;
    if(this.state.mode!==family){this.state.mode=family;changed=true;}
    if(family==='physical'){if(this.state.magicRoute!=='auto'){this.state.magicRoute='auto';changed=true;}}
    else{
      const blueprint=normalizeUpperBlueprint(this.state.upperBlueprint),route=['dual','singleEnd'].includes(this.state.magicRoute)?this.state.magicRoute:['dual','singleEnd'].includes(this.state.directionKey)?this.state.directionKey:blueprint&&['dual','singleEnd'].includes(blueprint.magicRoute)?blueprint.magicRoute:'auto';
      if(this.applyMagicRouteSelection(route,id))changed=true;
    }
    if(changed){this._squadCacheKey='';this._upperRankCacheKey='';this._upperRankCache=[];this._directionRankCacheKey='';this._directionDesiredKey='';this._blueprintRankings=null;this._blueprintRankingsKey='';this._blueprintDesiredKey='';this._v15CacheKey='';this._v15Cache=null;}
    return changed;
  }
  releaseDirectionHold(){
    if(this.state.directionStatus!=='hold')return false;this.state.directionStatus='open';this.state.directionKey='';this.state.directionUpperId='';this.state.directionHoldFingerprint='';this._directionRankCacheKey='';return true;
  }
  // v19.1: 두 확정 버튼(자동·수동)이 같은 청사진 모양을 만든다 — 차이는
  // "지금 패로 정확히 완성되는가"를 요구하느냐뿐이다.  자동(상위 확정 시
  // guaranteedComplete)은 그 요구를 지키고, 수동(파티 확정 버튼)은 지금
  // 보이는 구성을 그대로 목표로 찍는다 — 완성되지 않은 자리는
  // searchExactBlueprint 가 스스로 가변 자리로 풀어 준다("preference,
  // not brittle lock" — 위 searchExactBlueprint 주석).
  buildPartyBlueprint(id,squad,options){
    options=options||{};if(!squad||squad.error)return null;
    const unitId=item=>String(item&&item.unit&&item.unit.id||item&&item.unit||item&&item.id||item||''),lineupIds=(squad.finalLineup||squad.lineup||[]).map(unitId).filter(Boolean).slice(0,11),buildOrderIds=(squad.actions||[]).map(unitId).filter(Boolean).slice(0,11),containsUpper=lineupIds.some(unitId=>C.canonicalUpperId(unitId)===C.canonicalUpperId(id));
    if(lineupIds.length<2||!containsUpper)return null;
    if(options.requireFeasible){
      const planned=squad.roleCoverage&&squad.roleCoverage.planned||squad.roleCoverage||{},targetBoard=Math.max(1,C.num(squad.targetBoardCount)||lineupIds.length),targetEquivalent=Math.max(9,C.num(squad.targetCount)||9),plannedEquivalent=C.num(squad.plannedCount)||lineupIds.reduce((sum,unitId)=>sum+(C.isUpper(this.normalized().db.byId.get(unitId))?3:1),0),routeConfirmable=!squad.routeEvaluation||squad.routeEvaluation.confirmable!==false,handFeasible=!squad.handFit||squad.handFit.feasible!==false,wispFeasible=!!squad.wispBudget&&squad.wispBudget.fullPartyFeasible===true;
      if(lineupIds.length<targetBoard||plannedEquivalent<targetEquivalent||!planned.complete||!routeConfirmable||!handFeasible||!wispFeasible)return null;
    }
    const previous=normalizeUpperBlueprint(this.state.upperBlueprint);return normalizeUpperBlueprint({upperId:id,lineupIds,buildOrderIds,mode:squad.mode||this.state.mode,magicRoute:squad.magicRoute||'physical',revision:(previous?previous.revision:0)+1,capturedFingerprint:fingerprint(this.state.snapshot),capturedAt:Date.now(),fullPartyVerified:true,commitment:'full-party',adaptiveSupports:true});
  }
  captureUpperBlueprint(id,squad){return this.buildPartyBlueprint(id,squad,{requireFeasible:true});}
  // v19.1(사용자 요청): "내 파티에 확정 이런거 있으면 좋을듯? 내가 버튼
  // 누르면 자꾸 사라지니까 짜증나네."
  //
  // 자동 확정(captureUpperBlueprint)은 지금 패로 9환산 전부가 정확히
  // 완성될 때만 성공한다 — 그 조건은 중반 이후 거의 항상 거짓이라, 상위만
  // 확정되고 화면에 보이던 나머지 자리는 계속 가변 재계산돼 사용자가 보던
  // 구성이 다음 라운드에 바뀌어 보인다("사라진다").  수동 확정은 그 요구를
  // 빼고 "지금 보이는 구성"을 그대로 목표로 찍는다.
  captureCurrentParty(id,squad){return this.buildPartyBlueprint(id,squad,{requireFeasible:false});}
  captureUpperCommitment(id,mode,magicRoute){
    const previous=normalizeUpperBlueprint(this.state.upperBlueprint);return normalizeUpperBlueprint({upperId:id,lineupIds:[id],buildOrderIds:[id],mode:mode==='magic'?'magic':'physical',magicRoute:mode==='magic'&&['dual','singleEnd'].includes(magicRoute)?magicRoute:'physical',revision:(previous?previous.revision:0)+1,capturedFingerprint:fingerprint(this.state.snapshot),capturedAt:Date.now(),fullPartyVerified:false,commitment:'upper-route',adaptiveSupports:true});
  }
  observeUpper(previous,next){
    const db=this.catalogDb(),prevCounts=previous&&previous.counts||{},nextCounts=next&&next.counts||{},locked=this.upperLock(),modeChanged=locked?this.syncUpperMode(locked.id,db):false;let pending=normalizeUpperDetection(this.state.upperDetection);const now=Date.now(),snapshotKey=observationKey(next);if(pending.lastSeenAt&&now-pending.lastSeenAt>8000){this.state.upperDetection=emptyUpperDetection();pending=emptyUpperDetection();}
    if(locked){
      this.state.postLegendRoute='upper';
      const family=upperRouteFamily(locked.id),activeId=activeUpperVariant(family,nextCounts),currentIndex=family?family.indexOf(locked.id):-1,activeIndex=family?family.indexOf(activeId):-1;this.state.upperDetection=emptyUpperDetection();
      if(!family||!activeId||activeId===locked.id||activeIndex<currentIndex){const hadVariant=!!locked.variantCandidateId||C.num(locked.variantStreak)>0;if(hadVariant)this.state.locks=this.state.locks.map(lock=>lock===locked?clearVariantPending(lock):lock);return{changed:hadVariant||modeChanged};}
      const variantFresh=C.num(locked.variantLastSeenAt)&&now-C.num(locked.variantLastSeenAt)<=8000,sameCandidate=variantFresh&&locked.variantCandidateId===activeId;if(sameCandidate&&locked.variantLastSnapshotKey===snapshotKey)return{changed:modeChanged};const streak=sameCandidate?C.num(locked.variantStreak)+1:1,active=db.byId.get(activeId);
      if(streak<2){this.state.locks=this.state.locks.map(lock=>lock===locked?Object.assign(clearVariantPending(lock),{variantCandidateId:activeId,variantStreak:1,variantLastSnapshotKey:snapshotKey,variantLastSeenAt:C.num(next&&next.at)||now}):lock);return{changed:true,message:`${displayNameOf(active)} 활성 형태 1차 확인 · 한 번 더 잡히면 스펙을 갱신합니다.`};}
      this.state.locks=this.state.locks.map(lock=>lock===locked?Object.assign(clearVariantPending(lock),{id:activeId,routeRootId:family[0],activeVariantId:activeId,variantChangedAt:now,variantConfirmations:2}):lock);const blueprint=normalizeUpperBlueprint(this.state.upperBlueprint);if(blueprint){blueprint.upperId=activeId;blueprint.lineupIds=blueprint.lineupIds.map(id=>family.includes(id)?activeId:id);blueprint.buildOrderIds=blueprint.buildOrderIds.map(id=>family.includes(id)?activeId:id);blueprint.revision++;this.state.upperBlueprint=blueprint;}this.state.upperPreviewId='';this.state.purpose='spec';this._squadCacheKey='';return{changed:true,message:`메인 상위 경로는 유지하고 ${displayNameOf(active)} 활성 형태를 2회 확인해 스펙을 갱신했습니다.`};
    }
    const present=collapseUpperVariants(db.uppers,nextCounts),presentIds=new Set(present.map(u=>u.id)),newOnes=present.filter(u=>C.num(prevCounts[u.id])<=0);if(present.length)this.state.postLegendRoute='upper';let candidate='';
    if(pending.candidateId&&presentIds.has(pending.candidateId))candidate=pending.candidateId;else if(newOnes.length===1)candidate=newOnes[0].id;else if(present.length===1)candidate=present[0].id;
    if(!candidate){const hadPending=!!pending.candidateId||pending.streak>0;this.state.upperDetection=emptyUpperDetection();return{changed:hadPending};}
    if(pending.candidateId===candidate&&pending.lastSnapshotKey===snapshotKey)return{changed:false};
    const streak=pending.candidateId===candidate?pending.streak+1:1,unit=db.byId.get(candidate);this.state.upperDetection={candidateId:candidate,streak:Math.min(2,streak),lastSnapshotKey:snapshotKey,lastSeenAt:C.num(next&&next.at)||Date.now()};
    if(streak<2)return{changed:true,message:`상위 ${displayNameOf(unit)} 1차 감지 · 다음 동기화에서도 확인되면 메인 상위로 고정합니다.`};
    if(this.upperLock())return{changed:true};
    const routeFamily=upperRouteFamily(candidate);this.state.locks=[{stage:'upper',id:candidate,source:'tmo',sticky:true,confirmedAt:Date.now(),confirmations:2,routeRootId:routeFamily?routeFamily[0]:candidate,activeVariantId:candidate}];this.syncUpperMode(candidate,db);this.state.upperDetection=emptyUpperDetection();this.state.upperPreviewId='';this.state.postLegendRoute='upper';this.state.purpose='spec';return{changed:true,message:`상위 ${displayNameOf(unit)}를 2회 연속 확인해 ${C.familyOf(unit)==='magic'?'마딜':'물딜'} 메인 상위로 고정했습니다. TMO에서 잠깐 사라져도 새 게임·경로 초기화 전까지 유지됩니다.`};
  }
  finalBoardCountFor(snapshot){
    if(!snapshot)return 0;const normalized=C.normalizeState(this.catalog,snapshot,this.settings()),seen=new Set();let total=0;for(const unit of normalized.db.units){const count=Math.max(0,C.num(normalized.counts[unit.id]));if(!count||!C.isLegendish(unit)&&!C.isUpper(unit))continue;if(C.isUpper(unit)){const key=C.canonicalUpperId(unit.id);if(seen.has(key))continue;seen.add(key);total++;}else total+=count;}return total;
  }
  // 리롤 대기 해제 판정(20260725 교착 수정). 'target'=대상 감소,
  // 'other'=다른 유닛 감소를 리롤로 인정, 'timeout'=2라운드/120초 경과.
  pendingRerollRelease(pending,ctx){
    if(!pending)return'';
    if(C.num(ctx.nextPendingCount)<C.num(ctx.pendingBefore))return'target';
    if(ctx.observedDrop&&ctx.observedDrop!==pending.id)return'other';
    if((C.num(pending.baseRound)&&C.num(ctx.roundNow)>=C.num(pending.baseRound)+2)||(C.num(pending.at)&&C.num(ctx.now)-C.num(pending.at)>120000))return'timeout';
    return'';
  }
  updateSnapshot(snapshot){
    if(!snapshot)return;if(this.state.snapshot&&C.num(snapshot.at)<C.num(this.state.snapshot.at)-1000)return;const previous=this.state.snapshot,oldFp=fingerprint(previous),newFp=fingerprint(snapshot),incomingAuto=snapshot.autoRound&&snapshot.autoRound.active,sourceReset=incomingAuto&&C.num(snapshot.autoRound.generation)>C.num(this.state.roundAutoGeneration),completeZero=previous&&this.actualRound()>=50&&!sourceReset&&C.num(snapshot.nonzero)===0&&snapshot.collection&&snapshot.collection.found&&C.num(snapshot.collection.confidence)>=.9&&snapshot.countDiscovery&&snapshot.countDiscovery.found&&this.finalBoardCountFor(previous)>=5&&this.finalBoardCountFor(snapshot)===0;
    if(completeZero){const same=this._terminalCandidate&&this._terminalCandidate.fingerprint===newFp&&Date.now()-this._terminalCandidate.at<10000,count=same?this._terminalCandidate.count+1:1;this._terminalCandidate={fingerprint:newFp,count,at:Date.now()};if(count>=2){this._runResultOpen=true;this._terminalWipeAt=Date.now();this._runResultDraft=Object.assign({},RUN_RESULT_DEFAULTS,{kind:this.actualRound()>50?'r51_65_failed':'r50_failed',round:String(this.actualRound()),failureReason:'unknown',note:'TMO에서 전설급 보드 전멸을 2회 연속 감지함'});this.recordAuditAction({actor:'program',action:'suspected-terminal-wipe',round:this.actualRound(),lastLiveBoard:this.finalBoardCountFor(previous),confirmations:count});this.recordVerdictReport('terminal-wipe');this.setMessage('전설급 보드 전멸을 2회 확인했습니다. 마지막 생존 패를 보존하고 게임 결과 입력을 열었습니다.');this.render();}else this.updateLiveStatusOnly();return;}this._terminalCandidate=null;
    const oldHealth=this.health(),pending=this.state.pendingReroll,priorCounts=previous&&previous.counts||{},priorSeq=C.num(previous&&previous.seq),pendingBefore=pending?(pending.beforeCount==null?C.num(priorCounts[pending.id]):C.num(pending.beforeCount)):0,nextPendingCount=pending?C.num(snapshot.counts&&snapshot.counts[pending.id]):0;snapshot=this.stabilizeSnapshot(snapshot);this.state.snapshot=snapshot;this.state.liveAt=C.num(snapshot.at)||Date.now();if(this.state.awaitingNewGameFingerprint&&newFp!==this.state.awaitingNewGameFingerprint)this.state.awaitingNewGameFingerprint='';const nextCounts=snapshot.counts||{};let observedDrop='';if(!this.state.pendingTransaction){for(const key of Object.keys(priorCounts)){if(C.num(nextCounts[key])<C.num(priorCounts[key])){observedDrop=key;break;}}}if(observedDrop)this._recentCountDrop={id:observedDrop,at:Date.now()};if(pending){const releasedBy=this.pendingRerollRelease(pending,{pendingBefore,nextPendingCount,observedDrop,roundNow:this.actualRound(),now:Date.now()});if(releasedBy){this.state.pendingReroll=null;this._v15CacheKey='';if(releasedBy==='other')this.toast('다른 희귀 감소를 리롤 결과로 인정하고 대기를 해제했습니다.');else if(releasedBy==='timeout')this.toast('리롤 대기를 자동 해제했습니다 (2라운드/120초 경과). 현재 패 기준으로 다시 판단합니다.');}else if(pending.beforeCount==null){pending.beforeCount=pendingBefore;pending.baseSeq=priorSeq;}}if(oldFp&&oldFp!==newFp){this._directionRankCacheKey='';this._v15CacheKey='';}if(newFp&&this.state.directionStatus==='hold'&&this.state.directionHoldFingerprint!==newFp){this.state.directionStatus='open';this.state.directionKey='';this.state.directionUpperId='';this.state.directionHoldFingerprint='';this._directionRankCacheKey='';}const newHealth=this.health();let changed=oldFp!==newFp||oldHealth.key!==newHealth.key||oldHealth.ready!==newHealth.ready;
    const auto=snapshot.autoRound&&typeof snapshot.autoRound==='object'?snapshot.autoRound:null,autoSource=C.num(auto&&auto.sourceEpoch),autoGeneration=C.num(auto&&auto.generation),newAutoGeneration=!!(auto&&auto.active&&autoGeneration>0&&(autoSource!==C.num(this.state.roundAutoSourceEpoch)||autoGeneration>C.num(this.state.roundAutoGeneration)));if(newAutoGeneration){if(this._runLogReady&&this.runLog&&this.runLog.summary().status!=='active'){this.runLog.startRun({force:true,app:{build:'decision-audit-v1'}});this._runLogBaseline=null;this._runLogLastDecisionDigest='';}this.clearVerdictCache();const detectedAt=Math.max(1,C.num(auto.startedAt)||C.num(snapshot.dataChangedAt)||Date.now()),prepMs=(C.num(this.state.roundPrepSeconds)||10)*1000;this.state.roundAutoSourceEpoch=autoSource;this.state.roundAutoGeneration=autoGeneration;this.state.currentRound=1;this.state.roundStartedAt=Math.max(1,detectedAt-prepMs);this.state.roundClockPausedByUser=false;
    // v19.9(개선 ⑤): 연구소 가산은 사용자 체크 입력만이 근거다 — 새 게임이
    // 감지됐는데 지난 판 체크가 켜진 채면 스펙이 허수로 시작한다(0731 판
    // 이감 142.5 중 10이 연구소 가산).  새 게임마다 실보유 확인을 유도한다.
    {const LAB_LABEL={attack:'공업',slow:'이감업',hpRegen:'체젠',mpRegen:'마젠'};const labOn=Object.keys(LAB_LABEL).filter(key=>this.state.labResearch&&this.state.labResearch[key]===true);
    this.setMessage(`TMO에서 첫 실제 유닛을 감지해 1라운드 타이머를 자동 시작했습니다.${labOn.length?` 연구소 ${labOn.map(key=>LAB_LABEL[key]).join('·')} 체크가 켜져 있습니다 — 이번 판에 실제로 샀는지 설정에서 확인하세요(스펙에 그대로 가산됩니다).`:''}`);
    if(labOn.length)this.recordAuditAction({actor:'program',action:'lab-research-recheck-prompt',keys:labOn});}changed=true;}else if(auto&&autoSource!==C.num(this.state.roundAutoSourceEpoch)&&autoGeneration===0){this.state.roundAutoSourceEpoch=autoSource;this.state.roundAutoGeneration=0;
      // v19.13(0804b 동결): 콜드 스타트 채택(중간 합류)은 세대 전환이 없어
      // 시계가 영영 안 켜졌다 — 라운드가 1(또는 수동값)에 얼어 50라+ 화력
      // 승인·마감 운영이 전부 잠긴다.  판이 활성인데 시계가 꺼져 있고
      // 사용자가 명시적으로 멈춘 게 아니면 현재 라운드부터 시계를 켠다.
      if(auto.active===true&&!this.state.roundStartedAt&&this.state.roundClockPausedByUser!==true){this.state.roundStartedAt=Date.now()-this.elapsedToRoundStart(Math.max(1,C.num(this.state.currentRound)||1))*1000;this.setMessage('게임 진행 중 데이터에 합류해 라운드 타이머를 자동 시작했습니다. 상단 −1/+1로 실제 라운드를 맞추면 그대로 이어집니다.');}
      changed=true;}
    if(this.prunePending(snapshot,Date.now()))changed=true;
    let upperObservation={changed:false};if(newHealth.ready)upperObservation=this.observeUpper(previous,snapshot);else if(!this.upperLock()&&(this.state.upperDetection.candidateId||this.state.upperDetection.streak)){this.state.upperDetection=emptyUpperDetection();upperObservation={changed:true};}if(upperObservation.changed)changed=true;if(upperObservation.message)this.setMessage(upperObservation.message);
    const ns=C.normalizeState(this.catalog,snapshot,this.settings()),legendCount=legendHiddenCount(ns),upperCount=ownedUpperCount(ns);
    // v17.8(로그 20260723_215148): 62라 전멸 뒤 새 게임을 시작했는데
    // 라운드가 67에 남아 있어 사용자가 -1 버튼을 33번 눌렀다. 전멸 확인
    // 후 30분 안에 희귀·전설·상위가 전부 0인 새 패가 들어오면 라운드를
    // 1로 자동 재정렬한다(한 번만 · 어긋나면 +/-로 조정 가능).
    if(this._terminalWipeAt&&Date.now()-this._terminalWipeAt<18e5&&C.num(this.state.currentRound)>10&&legendCount===0&&upperCount===0){
      const rareTotal=ns.db.rares.reduce((sum,unit)=>sum+C.num(ns.counts[unit.id]),0);
      if(rareTotal===0){
        this._terminalWipeAt=0;this.state.currentRound=1;this.state.roundStartedAt=Date.now();
        this.recordAuditAction({actor:'program',action:'round-realigned-after-wipe',round:1});
        this.setMessage('전멸 후 새 게임 패를 감지해 라운드를 1로 재정렬했습니다. 실제 라운드와 다르면 +/-로 조정하세요.');
        changed=true;
      }
    }
    // v19.9(개선 ②): 비추천 수동 제작 즉시 경고.  0731 판 이감 오버슈트의
    // 주범(책임 65%)은 추천에 없던 모비딕호 수동 제작이었다 — 이미 찬
    // 역할(이감)만 보태는 전설급이 새로 잡히면 그 자리에서 알린다.
    // "제작함" 버튼 경유(markBuild)·추천 카드/큐/회복 목표에 올랐던 유닛은
    // 추천 이행이므로 제외한다.  경고는 표시 전용 — 제작을 막지 않는다.
    if(newHealth.ready&&previous&&oldFp!==newFp){
      try{
        const markedIds=this._v199MarkedIds||new Map(),recommendedIds=this._v199RecommendedIds||new Map(),nowMs=Date.now();
        for(const unit of ns.db.units){
          if(!C.isLegendish(unit)||C.isUpper(unit))continue;
          const id=String(unit.id);
          if(C.num(nextCounts[id])<=C.num(priorCounts[id]))continue;
          if(C.num(priorCounts[id])>0)continue;
          if(nowMs-C.num(markedIds.get(id))<300000)continue;
          if(nowMs-C.num(recommendedIds.get(id))<600000)continue;
          const mode=this.state.mode||C.familyOf(unit)||'physical',settings=this.settings();
          const spec=C.currentSpec(ns,mode,settings),def=C.deficits(spec,mode,settings);
          const openRows=(def.clearRows||[]).filter(row=>C.num(row.gap)>0);
          const contribution=C.roleContribution?C.roleContribution(unit,mode):{};
          const closesOpen=openRows.some(row=>C.num(contribution[row.key])>0);
          if(closesOpen)continue;
          const openLabels=openRows.slice(0,3).map(row=>row.label).join(' · ');
          this.setMessage(`수동 제작 감지: ${displayNameOf(unit)} — 지금 열린 필수 결손${openLabels?`(${openLabels})`:''}에는 기여하지 않습니다. 이미 찬 역할만 보태는 제작은 이감 초과처럼 판을 무겁게 합니다.`);
          this.recordAuditAction({actor:'program',action:'unrecommended-manual-craft',targetId:id,targetName:displayNameOf(unit),openDeficits:openRows.slice(0,5).map(row=>row.key)});
          changed=true;
          break;
        }
      }catch(_){}
    }
    if(upperCount>0&&this.state.postLegendRoute!=='upper'){this.state.postLegendRoute='upper';changed=true;}else if(this.state.postLegendRoute==='legend'){const baseline=this.state.postLegendBaseline||{};if(Object.keys(baseline).length&&legendIncreasedSince(ns,baseline)){this.state.postLegendRoute='';this.state.postLegendObservedCount=legendCount;this.state.postLegendBaseline=legendHiddenCounts(ns);this.state.locks=this.state.locks.filter(lock=>lock.stage!=='legend');this.setMessage('추가 전설·히든 완성을 확인했습니다. 다음에도 더 만들지 상위를 준비할지 다시 선택하세요.');changed=true;}else if(!Object.keys(baseline).length&&legendCount>0){this.state.postLegendObservedCount=legendCount;this.state.postLegendBaseline=legendHiddenCounts(ns);changed=true;}}if(ns.virtualResolved&&this.state.virtualSpecialId){this.state.virtualSpecialId='';this.state.virtualSpecialBaselineId='';this.state.virtualSpecialBaselineCount=0;this.setMessage('152킬 특별함 실제 카운트를 감지해 가상 보유를 해제했습니다.');changed=true;}if(oldFp!==newFp||!oldFp||newAutoGeneration&&!this._runLogBaseline)this.recordAcceptedSnapshot(snapshot,previous,!oldFp||!this._runLogBaseline);
    this.persist();if(changed){if(this.shouldDeferExternalRender()){this._deferredExternalRender=true;this.updateLiveStatusOnly();}else this.render();}else this.updateLiveStatusOnly();
  }
  updateLiveStatusOnly(){const h=this.health();this.root.querySelectorAll('[data-sync-age]').forEach(n=>{n.textContent=h.ageSec<999?`${h.label} · ${h.ageSec}초 전`:h.label;n.className=`sync-pill ${h.key}`;});
    // v23.2(0816): 스테일 칩 나이도 초단위로 흐르게 — 전체 재렌더 없이
    // 잎 노드만 패치(data-* 잎 노드 계약).  ready 전이는 health.key 변화로
    // 어차피 full render 를 탄다.
    this.root.querySelectorAll('[data-pill-age]').forEach(n=>{n.textContent=`${C.num(h.ageSec)}초 전`;const pill=n.closest('.v153-pill');if(pill)pill.classList.toggle('stale',h.ready===false);});}
  // v16: protect every form field the live app can render — including the
  // game-result modal (a sibling of .v151-screen) and textareas, which the old
  // selector missed exactly when the user was typing an outcome note.
  shouldDeferExternalRender(){const active=typeof document!=='undefined'&&document.activeElement;return!!(active&&this.root.contains(active)&&active.closest&&active.closest('.ord-app select,.ord-app input,.ord-app textarea'));}
  flushDeferredExternalRender(){if(!this._deferredExternalRender||this.shouldDeferExternalRender())return;this._deferredExternalRender=false;this.render();}
  bind(){
    this.root.addEventListener('click',e=>{if(e.target.closest('.v23-ghost-card'))return;const b=e.target.closest('[data-act]');if(!b)return;if(b.classList.contains('modal-back')&&e.target!==b)return;const action=b.dataset.act;if(RUN_LOG_ACTIONS.has(action))this.recordAuditAction({actor:'user',action,targetId:String(b.dataset.id||''),value:String(b.dataset.value||''),key:String(b.dataset.key||''),delta:C.num(b.dataset.delta),stage:String(b.dataset.stage||'')});this.act(action,b);});
    this.root.addEventListener('change',e=>{const el=e.target;if(el.dataset.opt!==undefined)this.setOpt(el.dataset.opt,el.type==='checkbox'?el.checked:el.value);if(el.dataset.upg!==undefined){const key=el.dataset.upg;if(key==='upperLevel'){const before=this.state.upperResearchLevel,after=Math.max(1,Math.min(UPPER_RESEARCH_MAX,C.num(el.value)||1));this.state.upperResearchLevel=after;this.recordAuditAction({actor:'user',action:'manual-upgrade',key,before:C.num(before),after});}else{const before=!!(this.state.labResearch&&this.state.labResearch[key]),after=el.type==='checkbox'?!!el.checked:!!C.num(el.value);this.state.labResearch=Object.assign({},this.state.labResearch,{[key]:after,round:this.actualRound()});this.recordAuditAction({actor:'user',action:'lab-research',key,before,after});}this._squadCacheKey='';this._v15CacheKey='';this.persist();this.render();return;}if(el.dataset.count){if(this.state.pendingTransaction)this.rollbackTransaction();const before=C.num(this.normalized().counts[el.dataset.count]),after=Math.max(0,C.num(el.value));this.state.manualCounts[el.dataset.count]=after;delete this.state.pendingCounts[el.dataset.count];delete this.state.pendingAt[el.dataset.count];this.releaseDirectionHold();this._squadCacheKey='';this.recordAuditAction({actor:'user',action:'manual-count',targetId:String(el.dataset.count),before,after});this.persist();this.render();}});
    this.root.addEventListener('input',e=>{const el=e.target;if(el.dataset.liveOpt!==undefined)this.state[el.dataset.liveOpt]=el.value;if(el.dataset.runField!==undefined)this._runResultDraft[el.dataset.runField]=el.type==='checkbox'?el.checked:el.value;});
    this.root.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.target.matches('[data-live-opt="unitSearch"]')||e.target.matches('[data-live-opt="snipeSearch"]'))){e.preventDefault();this.render();}});
    this.root.addEventListener('focusout',()=>setTimeout(()=>this.flushDeferredExternalRender(),0));
  }
  selectDamageMode(value){
    const mode=['physical','magic'].includes(value)?value:'',before=this.state.mode,wasExplicit=this.state.modeExplicit===true,locked=this.upperLock(),lockedUnit=locked&&this.normalized().db.byId.get(locked.id),lockedFamily=lockedUnit&&C.familyOf(lockedUnit),conflict=locked&&mode&&['physical','magic'].includes(lockedFamily)&&lockedFamily!==mode;
    this.state.modeExplicit=true;
    if(before===mode&&!conflict){if(!wasExplicit)this.persist();return false;}
    if(conflict){
      // v19.2(사용자 요청): "물딜 가려다가 마딜로 바꿔서" — 계통을 되돌아왔을
      // 때 원클릭으로 복구할 수 있도록 해제 시점의 상위를 기억해 둔다.
      this.state.releasedUpperHint={id:locked.id,mode:lockedFamily,routeKey:lockedFamily==='magic'?(['dual','singleEnd'].includes(this.state.magicRoute)?this.state.magicRoute:'dual'):'physical',releasedAt:Date.now(),releasedRound:this.actualRound()};
      this.state.locks=this.state.locks.filter(lock=>lock.stage!=='upper');this.state.upperBlueprint=null;this.state.postLegendRoute='upper';
    }
    this.state.mode=mode;if(mode==='physical')this.state.magicRoute='auto';this.state.directionStatus='open';this.state.directionKey='';this.state.directionUpperId='';this.state.directionHoldFingerprint='';this.state.upperPreviewId='';this.state.purpose='';this.state.watchStability=normalizeWatchStability(null);this._squadCacheKey='';this._upperRankCacheKey='';this._upperRankCache=[];this._directionRankCacheKey='';this._directionDesiredKey='';this._deferredExternalRender=false;
    this.recordAuditAction({actor:'user',action:'setting-change',key:'mode',before:before===''?null:before,after:mode===''?null:mode,conflictingUpperReleased:!!conflict});if(conflict)this.setMessage(`${modeLabel(mode)} 선택을 적용하기 위해 ${displayNameOf(lockedUnit)} 확정을 해제했습니다. ${modeLabel(lockedFamily)}로 돌아오면 원클릭으로 다시 확정할 수 있습니다.`);this.persist();this.render();return true;
  }
  setOpt(key,val){const before=this.state[key];if(key==='mode'){this.selectDamageMode(val);return;}if(['currentRound','roundPrepSeconds','roundNormalSeconds','roundBossSeconds','transcendUsed','seraphUsed','changedUsed'].includes(key))val=Math.max(0,C.num(val));if(key==='wispOverride'&&this.state.pendingTransaction)this.rollbackTransaction();if(key==='virtualSpecialId'){val=String(val||'');if(val!==String(before||'')){this.state.virtualSpecialBaselineId=val;this.state.virtualSpecialBaselineCount=val?rawSnapshotCount(this.state.snapshot,val):0;}else if(!val){this.state.virtualSpecialBaselineId='';this.state.virtualSpecialBaselineCount=0;}}if(key==='magicRoute'){val=['dual','singleEnd'].includes(val)?val:'auto';this.applyMagicRouteSelection(val);}else this.state[key]=val;if(key==='story10Reward'){const forfeited=['rayleigh','chest'].includes(String(val||''));if(forfeited&&this.state.superKumaOwned){this.state.superKumaOwned=false;this.toast('스토리 10 선택 반영 — 초월 쿠마 포기, 초월 경로를 닫습니다.');}else if(String(val)==='kuma'&&!this.state.superKumaOwned){this.state.superKumaOwned=true;}this._v15CacheKey='';}if(['wispOverride','virtualSpecialId'].includes(key))this.releaseDirectionHold();if(key==='virtualSpecialId'){this._upperRankCacheKey='';this._upperRankCache=[];}this._squadCacheKey='';this._deferredExternalRender=false;if(RUN_LOG_SETTING_KEYS.has(key))this.recordAuditAction({actor:'user',action:'setting-change',key:String(key),before:before===''?null:before,after:val===''?null:val});this.persist();this.render();}
  commandInfo(unit){
    const codes=uniqueText(unit&&unit.codes),records=[unit],own=Array.isArray(unit&&unit.commands)?unit.commands.filter(Boolean):[];let inheritedFrom=null;
    if(!own.length&&unit&&COMMAND_INHERITANCE[unit.id]){const byId=new Map((this.catalog||[]).map(candidate=>[candidate.id,candidate]));inheritedFrom=byId.get(COMMAND_INHERITANCE[unit.id])||null;if(inheritedFrom)records.push(inheritedFrom);}
    const parsed=parseCommands(records.flatMap(candidate=>Array.isArray(candidate&&candidate.commands)?candidate.commands:[]));
    const korean=parsed.korean.join(' / '),english=parsed.english.join(' / '),hasVerified=!!(korean||english),koreanDisplay=korean||(english?'한글 명령 미확인 · 아래 영문 명령 사용':'TMO 2.305에 별도 채팅 명령 자료 없음'),englishDisplay=english||(korean?'English command unverified — use the Korean command above':'No separate chat command in TMO 2.305 data');
    return{korean,english,koreanDisplay,englishDisplay,codes:codes.join(', '),hasVerified,inherited:!!inheritedFrom,sourceUnitId:inheritedFrom&&inheritedFrom.id||'',sourceName:inheritedFrom?displayNameOf(inheritedFrom):''};
  }
  renderCommandLine(unit){
    const command=this.commandInfo(unit);
    return`<div class="command-line" aria-label="조합 명령어"><span class="${command.korean?'verified':'unverified'}"><i>한글</i><b>${C.esc(command.koreanDisplay)}</b></span><span class="${command.english?'verified':'unverified'}"><i>English</i><b>${C.esc(command.englishDisplay)}</b></span>${command.inherited?`<em class="command-note">원형 ${C.esc(command.sourceName)} 최초 제작 명령</em>`:''}</div>`;
  }
  markBuild(row,pack){
    if(!row||!row.unit||!row.solve){this.toast('제작 행을 다시 계산할 수 없습니다. 지금 동기화 후 다시 눌러주세요.');return;}
    // v20.2: 무엇을 만들었든 그 순간 제작 진행 중 잠금은 끝난다 — 잠근
    // 대상을 완성했으면 목적 달성이고, 다른 것을 만들었으면 사용자가
    // 방향을 바꾼 것이다.  둘 다 잠금을 놓아야 한다.
    this.v202ReleaseCraftLock();
    const counts=pack.state.counts||{},now=Date.now(),touched=new Set(Object.keys(row.solve.consumed||{}));touched.add(row.unit.id);touched.add(C.WISP_ID);
    const expected={},before={};for(const id of touched){before[id]=C.num(counts[id]);const consumed=C.num(row.solve.consumed&&row.solve.consumed[id]);expected[id]=id===C.WISP_ID?Math.max(0,before[id]-C.num(row.solve.wispCost)):Math.max(0,before[id]-consumed+(id===row.unit.id?1:0));}
    const old=normalizeTransaction(this.state.pendingTransaction),merged=Object.assign({},old&&old.expected||{},expected),rollback=old&&old.rollback||this.transactionRollbackSnapshot(),source=old&&old.source||transactionSource(this.state.snapshot),step={id:row.unit.id,name:displayNameOf(row.unit),at:now,before,after:expected,wispCost:C.num(row.solve.wispCost),consumed:Object.assign({},row.solve.consumed||{})};
    // v19.9(개선 ②): "제작함" 버튼 경유 제작은 수동 제작 경고에서 제외한다.
    (this._v199MarkedIds||(this._v199MarkedIds=new Map())).set(String(row.unit.id),now);
    if(this.state.virtualSpecialId&&C.num(row.solve.consumed&&row.solve.consumed[this.state.virtualSpecialId])>0){this.state.virtualSpecialId='';this.state.virtualSpecialBaselineId='';this.state.virtualSpecialBaselineCount=0;}
    if(C.isChanged&&C.isChanged(row.unit))this.state.changedUsed=C.num(this.state.changedUsed)+1;if(C.isTranscend&&C.isTranscend(row.unit))this.state.transcendUsed=C.num(this.state.transcendUsed)+1;if(C.isSeraph&&C.isSeraph(row.unit))this.state.seraphUsed=C.num(this.state.seraphUsed)+1;
    if(C.isRare(row.unit))this.state.locks=this.state.locks.filter(x=>x.stage!=='rare');
    if(C.isLegendish(row.unit)&&!C.isUpper(row.unit)){this.state.locks=this.state.locks.filter(x=>x.stage!=='legend');this.state.postLegendRoute='';this.state.postLegendObservedCount=legendHiddenCount(pack.state)+1;this.state.postLegendBaseline=legendHiddenCounts(pack.state);this.state.postLegendBaseline[row.unit.id]=C.num(this.state.postLegendBaseline[row.unit.id])+1;}
    this.state.purpose='';this.state.watchStability=normalizeWatchStability(null);this._squadCacheKey='';
    this.recordAuditAction({actor:'program',action:'build-marked',targetId:row.unit.id,targetName:displayNameOf(row.unit),recommendationReason:String(row.why&&row.why.headline||''),before,after:expected,wispCost:C.num(row.solve.wispCost),consumed:Object.fromEntries(Object.entries(row.solve.consumed||{}).filter(([,value])=>C.num(value)>0).slice(0,96))});
    if(this.config.source==='standalone-manual'){
      for(const [id,target] of Object.entries(expected))if(id!==C.WISP_ID)this.state.manualCounts[id]=target;this.state.wispOverride=String(expected[C.WISP_ID]);this.state.pendingTransaction=null;this.persist();this.toast('제작 결과·소모 재료·선위를 수동 패에 함께 반영했습니다.');return;
    }
    this.state.pendingTransaction={at:old?old.at:now,lastAt:now,baseFingerprint:old?old.baseFingerprint:fingerprint(this.state.snapshot),baseDataChangedAt:old?old.baseDataChangedAt:C.num(this.state.snapshot&&this.state.snapshot.dataChangedAt),source,rollback,expected:merged,status:'pending',steps:(old?old.steps:[]).concat(step).slice(-12)};
    this.persist();this.toast('제작 결과와 모든 소모 재료를 즉시 반영했습니다. TMO 실제 패가 일치할 때까지 이 거래를 유지합니다.');
  }
  act(a,b){
    const id=b.dataset.id||'';
    if(a==='run-log-open'){this._focusAfterRender='.v151-aux-bar [data-act="tab"][data-tab="coach"]';this.state.tab='runlog';this._runLogSelectedId=this.runLog&&this.runLog.currentRun&&this.runLog.currentRun.runId||'';this._runLogSelectedRun=this.runLog&&this.runLog.currentRun||null;this.refreshRunLogHistory(false);this.persist();this.render();return;}
    if(a==='run-log-export'){this.downloadRunLog(b.dataset.runId||this._runLogSelectedId||'');return;}
    if(a==='run-log-filter'){this._runLogFilter=b.dataset.value||'all';this.render();return;}
    if(a==='run-log-select'){this.selectRunLog(b.dataset.runId||'');return;}
    if(a==='run-result-open'){const current=this.runLog&&this.runLog.currentRun,viewed=this.viewedRunLog();if(!this.runLogActive()||this.state.tab==='runlog'&&viewed&&current&&viewed.runId!==current.runId){this.toast('진행 중인 현재 게임 기록에서만 결과를 입력할 수 있습니다.');return;}const round=this.actualRound();this._runResultOpen=true;this._runResultDraft=Object.assign({},RUN_RESULT_DEFAULTS,{kind:round>50?'r51_65_failed':'r50_failed',round:String(round)});if(this.onConnectionTest)this.onConnectionTest();this.render();return;}
    if(a==='run-result-close'){if(this._runResultSaving)return;this._runResultOpen=false;this.render();return;}
    if(a==='run-result-kind'){this._runResultDraft.kind=b.dataset.value||'r50_failed';this.render();return;}
    if(a==='run-result-field'){const field=String(b.dataset.field||'');if(field&&Object.prototype.hasOwnProperty.call(RUN_RESULT_DEFAULTS,field)){this._runResultDraft[field]=String(b.dataset.value||'');this.render();}return;}
    if(a==='run-result-save'){this.saveRunOutcome();return;}
    if(a==='run-log-clear'){const now=Date.now();if(now-C.num(this._runLogDeleteArmedAt)>3500){this._runLogDeleteArmedAt=now;this.toast('진행 기록 전체 삭제를 한 번 더 누르면 되돌릴 수 없습니다.');return;}this._runLogDeleteArmedAt=0;this.clearRunLogs();return;}
    if(a==='post-legend-route'&&this.state.pendingTransaction){this.toast('TMO 제작 반영 확인 후 다음 경로를 선택할 수 있습니다.');return;}
    if(this.state.pendingTransaction&&['purpose','select-upper','preview-direction','choose-direction','hold-direction','confirm-upper','restore-released-upper','snipe-upper','lock-legend','lock-rare','remove-lock','reset-route','counter-step'].includes(a))this.rollbackTransaction();
    // v21.1: 참고 패널(최종 파티·희귀→전설·남는 희귀) 탭 — 상시 5패널이
    // "정보 중구난방"의 원인이라 한 자리에서 갈아 끼운다.
    if(a==='v211-tab'){const tab=String(b.dataset.tab||'');if(['craft','party','rare'].includes(tab)){this._v211Tab=tab;this._v22DrawerOpen=true;this.render();}return;}
    if(a==='v22-drawer-close'){this._v22DrawerOpen=false;this.render();return;}
    if(a==='story-stage-step'){this.state.storyStage=Math.max(0,Math.min(15,C.num(this.state.storyStage)+C.num(b.dataset.delta)));this.persist();this.render();return;}
    if(a==='veto-action'){const id=String(b.dataset.id||'');if(!id)return;if(!(this.state.vetoIds||[]).includes(id))this.state.vetoIds=[...(this.state.vetoIds||[]),id].slice(-20);this._stickyActionId='';this.v202ReleaseCraftLock();this._v15CacheKey='';this._squadCacheKey='';this.persist();this.toast('이번 판에서 이 추천을 넘어갑니다 — 카드 아래 목록에서 되돌릴 수 있습니다.');this.render();return;}
    if(a==='story-rush-toggle'){this.state.storyRushAbandoned=this.state.storyRushAbandoned!==true;this._v15CacheKey='';this._squadCacheKey='';this.persist();this.toast(this.state.storyRushAbandoned?'스토리 밀기 포기 — 스토리 랭킹을 무시하고 최저 선위만 추천합니다.':'스토리 가속 복원 — S급 프리미엄(희귀 2·전설 5 상한)을 다시 적용합니다.');this.render();return;}
    if(a==='unveto-action'){const id=String(b.dataset.id||'');this.state.vetoIds=(this.state.vetoIds||[]).filter(x=>x!==id);this._v15CacheKey='';this._squadCacheKey='';this.persist();this.render();return;}
    if(a==='tab'){const tab=String(b.dataset.tab||'');if(!REACHABLE_TABS.has(tab))return;const previousTab=this.state.tab;this._focusAfterRender=tab==='coach'?(previousTab==='runlog'?'[data-act="run-log-open"]':`[data-act="tab"][data-tab="${previousTab}"]`):'.v151-aux-bar [data-act="tab"][data-tab="coach"]';this.state.tab=tab;if(tab==='runlog'){this._runLogSelectedId=this._runLogSelectedId||this.runLog&&this.runLog.currentRun&&this.runLog.currentRun.runId||'';this._runLogSelectedRun=this._runLogSelectedRun||this.runLog&&this.runLog.currentRun||null;this.refreshRunLogHistory(false);}this.persist();this.render();return;}
    if(a==='purpose'){this.state.purpose=b.dataset.value||'';this.persist();this.render();return;}
    if(a==='post-legend-route'){
      const route=['legend','upper'].includes(b.dataset.value)?b.dataset.value:'';if(!route)return;
      const current=this.normalized();this.state.postLegendRoute=route;this.state.postLegendObservedCount=legendHiddenCount(current);this.state.postLegendBaseline=legendHiddenCounts(current);this.state.purpose=route==='legend'?'story':'upper';
      if(route==='legend'){this.state.upperPreviewId='';}else this.state.locks=this.state.locks.filter(lock=>lock.stage!=='legend');
      this.state.watchStability=normalizeWatchStability(null);this._squadCacheKey='';this._upperRankCacheKey='';this.persist();this.render();return;
    }
    if(a==='mode'){this.selectDamageMode(b.dataset.value||'');return;}
    if(a==='super-kuma'){this.state.superKumaOwned=b.dataset.value==='owned';if(!this.state.superKumaOwned&&this.state.upperPreviewId){const u=this.normalized().db.byId.get(this.state.upperPreviewId);if(u&&C.isTranscend(u))this.state.upperPreviewId='';}this._squadCacheKey='';this.persist();this.render();return;}
    if(a==='detail'){this.state.detailId=id;this.render();return;}
    if(a==='close-detail'){this.state.detailId='';this.render();return;}
    if(a==='cancel-reroll'){if(this.state.pendingReroll){this.state.pendingReroll=null;this._v15CacheKey='';this.recordAuditAction({actor:'user',action:'cancel-reroll'});this.persist();this.toast('리롤 대기를 해제했습니다. 현재 패 기준으로 다시 판단합니다.');this.render();}return;}
    if(a==='party-preview'){this._partyPreviewId=id;this.render();return;}
    if(a==='party-close'){this._partyPreviewId='';this.render();return;}
    if(a==='ship-plan'){this._shipModalOpen=true;this.render();return;}
    if(a==='ship-close'){this._shipModalOpen=false;this.render();return;}
    if(a==='mark-made'){const pack=this.plan(),decision=pack.plan.v15Decision,index=Math.max(0,C.num(b.dataset.step)),row=decision&&decision.authority?decision.state==='ACT_NOW'&&decision.action&&decision.action.id===id?decision.action.row:null:pack.plan.actions[index]&&pack.plan.actions[index].unit.id===id?pack.plan.actions[index]:pack.plan.actions.find(x=>x.unit.id===id);if(decision&&decision.authority&&decision.state!=='ACT_NOW'){this.toast('현재 권위 판단은 제작이 아닙니다. TMO 패를 다시 읽어 주세요.');return;}if(!row||row.feasible!==true){this.toast('현재 패의 정확한 원장으로 제작 가능함이 확인되지 않았습니다.');return;}this.markBuild(row,pack);return;}
    if(a==='reroll-confirmed'){
      // v17.6(감사 P0-1): 게임당 리롤 상한 — 엔진이 이미 차단하지만
      // UI에서도 이중으로 막는다(엔진 캐시 지연 대비).  v23.0: 상한이
      // 고정 2회가 아니라 항법 의존(rerollLimit)이 됐다 — 맵 원본 확정.
      if(C.num(this.state.rerollsUsed)>=this.rerollLimit()){this.toast(`희귀 리롤은 게임당 ${this.rerollLimit()}회입니다 — 이미 모두 사용했습니다.`);return;}
      const pack=this.plan(),decision=pack.plan.v15Decision,rare=decision&&decision.rare&&decision.rare.safeReroll;if(!decision||decision.state!=='REROLL_ONE'||!rare||rare.id!==id){this.toast('현재 패에서 단독 리롤이 증명된 희귀가 아닙니다.');return;}
      this.state.rerollsUsed=Math.min(this.rerollLimit(),C.num(this.state.rerollsUsed)+1);
      // 20260725 로그 교착: 추천(쵸파)→패 변경→추천 재계산(마르코)→확정 클릭이
      // 새 대상에 걸려 영구 대기. 확정 직전 60초 내 이미 희귀 감소가 관측됐다면
      // 그 감소가 실행된 리롤이므로 대기를 아예 걸지 않는다.
      const recentDrop=this._recentCountDrop;
      if(recentDrop&&Date.now()-C.num(recentDrop.at)<60000){
        this._recentCountDrop=null;this._v15CacheKey='';
        this.recordAuditAction({actor:'user',action:'rare-reroll-confirmed',targetId:rare.id,targetName:rare.name,count:1,proof:rare.proof||null,observedDecreaseId:recentDrop.id});
        this.persist();if(this.onConnectionTest)this.onConnectionTest();
        this.toast(`직전 패에서 이미 희귀 감소가 관측되어 ${rare.name} 리롤을 대기 없이 인정합니다.`);this.render();return;
      }
      this.state.pendingReroll={id:rare.id,name:rare.name,baseFingerprint:fingerprint(this.state.snapshot),beforeCount:C.num(this.state.snapshot&&this.state.snapshot.counts&&this.state.snapshot.counts[rare.id]),baseSeq:C.num(this.state.snapshot&&this.state.snapshot.seq),at:Date.now(),baseRound:this.actualRound()};this._v15CacheKey='';this.recordAuditAction({actor:'user',action:'rare-reroll-confirmed',targetId:rare.id,targetName:rare.name,count:1,proof:rare.proof||null});this.persist();if(this.onConnectionTest)this.onConnectionTest();this.toast(`${rare.name} 1장 리롤 결과를 기다립니다. 어떤 희귀든 수량이 줄면 해제되며, 2라운드 후 자동 해제됩니다.`);return;
    }
    if(a==='unit-adjust'){if(this.state.pendingTransaction)this.rollbackTransaction();const current=C.num(this.normalized().counts[id]),next=Math.max(0,current+C.num(b.dataset.delta));this.state.manualCounts[id]=next;delete this.state.pendingCounts[id];delete this.state.pendingAt[id];this.releaseDirectionHold();this._squadCacheKey='';this.persist();this.render();return;}
    if(a==='clear-unit-override'){if(this.state.pendingTransaction)this.rollbackTransaction();delete this.state.manualCounts[id];delete this.state.pendingCounts[id];delete this.state.pendingAt[id];this.releaseDirectionHold();this._squadCacheKey='';this.persist();this.render();return;}
    if(a==='search-units'){this.render();return;}
    if(a==='story-league'){const league=b.dataset.league;if(!['rare','upper','legend'].includes(league))return;this.state.storyLeague=league;this.state.storyTier='';this.persist();this.render();return;}
    if(a==='story-search'){this.render();return;}
    if(a==='choose-direction'){
      const current=this.plan(),decision=current.plan&&current.plan.v15Decision,candidate=(decision&&decision.routeCandidates||[]).find(row=>row.id===id&&row.routeKey===b.dataset.key);
      if(candidate){
        // v22.1(사용자: "25라전에 확정안되는거 풀어" · 0809 포렌식): 25라 게이트 해제 — 확정은 언제든, 이르면 이를수록 재료가 보호된다.
        if(!routeCandidateReady(candidate)){this.toast('상위와 보조 전설급 파티 평가가 끝난 후보만 확정할 수 있습니다. 잠시 뒤 다시 확인해 주세요.');return;}
        const key=candidate.routeKey,mode=key==='physical'?'physical':'magic',existing=this.upperLock();
        if(candidate.keepUpper){
          if(!existing||C.canonicalUpperId(existing.id)!==C.canonicalUpperId(candidate.id)){this.toast('TMO에서 고정 상위가 바뀌었습니다. 다시 동기화해 주세요.');return;}
          this.state.upperBlueprint=this.captureUpperCommitment(existing.id,'magic',key);
        }else{
          const unit=current.state&&current.state.db.byId.get(candidate.id);if(!unit||!C.isUpper(unit)){this.toast('현재 패에서 이 상위를 다시 찾지 못했습니다. TMO를 동기화해 주세요.');return;}
          const routeFamily=upperRouteFamily(candidate.id);this.state.locks=this.state.locks.filter(lock=>lock.stage!=='upper'&&lock.stage!=='legend');this.state.locks.push({stage:'upper',id:candidate.id,source:'v15-exact-route',sticky:true,confirmedAt:Date.now(),confirmations:1,routeRootId:routeFamily?routeFamily[0]:candidate.id,activeVariantId:candidate.id});this.state.upperBlueprint=this.captureUpperCommitment(candidate.id,mode,key);
        }
        this.state.directionStatus='selected';this.state.directionKey=key;this.state.directionUpperId=candidate.id;this.state.directionHoldFingerprint='';this.state.releasedUpperHint=null;this.state.mode=mode;this.state.magicRoute=mode==='magic'?key:'auto';this.state.upperPreviewId='';this.state.postLegendRoute='upper';this.state.purpose='spec';this._squadCacheKey='';this._directionRankCacheKey='';this._v15CacheKey='';this._v15Cache=null;this.persist();this.render();this.toast(candidate.keepUpper?`메인 상위는 유지하고 ${candidate.routeLabel} 경로만 확정했습니다.`:`${candidate.name} 상위 방향을 확정했습니다. 현재 조합 완성 여부와 관계없이 다음 행동을 다시 계산합니다.`);return;
      }
    }
    if(a==='preview-direction'||a==='choose-direction'){
      const key=b.dataset.key,valid=['physical','dual','singleEnd'].includes(key),row=(this._upperRankCache||[]).find(item=>item.upperId===id&&item.directionKey===key);if(!valid||!row){this.toast('현재 패가 바뀌어 이 방향을 다시 계산해야 합니다.');return;}
      if(a==='choose-direction'){
                const mode=key==='physical'?'physical':'magic',fullBlueprint=row.guaranteedComplete?this.captureUpperBlueprint(id,row.plan):null,blueprint=fullBlueprint||this.captureUpperCommitment(id,mode,key),routeFamily=upperRouteFamily(id);this.state.upperBlueprint=blueprint;this.state.locks=this.state.locks.filter(lock=>lock.stage!=='upper'&&lock.stage!=='legend');this.state.locks.push({stage:'upper',id,source:fullBlueprint?'manual-blueprint':'manual-route',sticky:true,confirmedAt:Date.now(),confirmations:1,routeRootId:routeFamily?routeFamily[0]:id,activeVariantId:id});this.state.directionStatus='selected';this.state.directionKey=key;this.state.directionUpperId=id;this.state.directionHoldFingerprint='';this.state.releasedUpperHint=null;this.state.mode=mode;this.state.magicRoute=key==='physical'?'auto':key;this.state.upperPreviewId='';this.state.postLegendRoute='upper';this.state.purpose='spec';this._squadCacheKey='';this._directionRankCacheKey='';this.persist();this.toast(fullBlueprint?'상위와 현재 보조 청사진을 잠갔습니다. 패가 바뀌면 보조 조합만 가변 재계산합니다.':'상위 방향을 잠갔습니다. 30라 전후에는 이 상위를 먼저 올리고, 보조 조합은 남은 패로 가변 재계산합니다.');return;
      }
      this.state.directionStatus='preview';this.state.directionKey=key;this.state.directionUpperId=id;this.state.directionHoldFingerprint='';this.state.mode=key==='physical'?'physical':'magic';this.state.magicRoute=key==='physical'?'auto':key;this.state.upperPreviewId=id;this.state.postLegendRoute='upper';this.state.purpose='upper';this._squadCacheKey='';this.persist();this.render();return;
    }
    if(a==='hold-direction'){this.state.directionStatus='hold';this.state.directionKey='';this.state.directionUpperId='';this.state.directionHoldFingerprint=fingerprint(this.state.snapshot);this.state.upperPreviewId='';this.state.upperBlueprint=null;this.state.releasedUpperHint=null;this.state.purpose='upper';this._squadCacheKey='';this.persist();this.render();return;}
    // v19.3(사용자 요청): "특정 상위를 저격해서 갈 수 있게 해줘. 브록 초월을
    // 가고 싶으면 브록 초월 선택했을 때 강제로 갈 수 있도록."
    //
    // 저격은 기존 확정(confirm-upper)과 두 가지가 다르다.
    //   · 25라 게이트를 우회한다 — "강제로"가 요점이다.  일찍 정하는 위험은
    //     사용자가 지는 대신, 코치는 그 상위의 재료·선위를 처음부터 지킨다.
    //   · 순위 목록에 없어도 된다 — 카탈로그의 어떤 상위든 검색해 고른다.
    // 확정 뒤 동작은 기존 기계 그대로다: locks 의 upper 잠금이 fixedUpperIds
    // 로 흘러 플래너가 그 상위를 최우선으로 만들고(ruleBlocked '확정 상위
    // 우선'), 엔진은 upperReserve 로 그 트리 재료를 잠근다.
    if(a==='snipe-open'){this._snipeOpen=true;this.render();return;}
    if(a==='snipe-close'){this._snipeOpen=false;this.render();return;}
    if(a==='snipe-search'){this.render();return;}
    if(a==='snipe-upper'){
      const db=this.normalized().db,unit=db.byId.get(id);
      if(!unit||!C.isUpper(unit)){this.toast('상위 유닛이 아닙니다.');return;}
      const family=C.familyOf(unit),mode=family==='magic'?'magic':'physical';
      const route=mode==='physical'?'physical':['dual','singleEnd'].includes(this.state.magicRoute)?this.state.magicRoute:C.MAGIC_SINGLE_END_SUSPENDED?'dual':'singleEnd';
      const routeFamily=upperRouteFamily(id);
      this.state.locks=this.state.locks.filter(lock=>lock.stage!=='upper'&&lock.stage!=='legend');
      this.state.locks.push({stage:'upper',id,source:'sniped',sticky:true,confirmedAt:Date.now(),confirmations:1,routeRootId:routeFamily?routeFamily[0]:id,activeVariantId:id});
      this.state.upperBlueprint=this.captureUpperCommitment(id,mode,route);
      this.state.mode=mode;this.state.modeExplicit=true;this.state.magicRoute=mode==='magic'?route:'auto';
      this.state.directionStatus='selected';this.state.directionKey=mode==='physical'?'physical':route;this.state.directionUpperId=id;this.state.directionHoldFingerprint='';
      this.state.releasedUpperHint=null;this.state.upperDetection=emptyUpperDetection();this.state.upperPreviewId='';this.state.postLegendRoute='upper';this.state.purpose='spec';
      if(String(this.state.secondUpperId||'')&&C.canonicalUpperId(this.state.secondUpperId)===C.canonicalUpperId(id))this.state.secondUpperId='';
      this._snipeOpen=false;
      this._squadCacheKey='';this._v15CacheKey='';this._directionRankCacheKey='';this._blueprintRankingsKey='';this._upperRankCacheKey='';this._upperRankCache=[];
      this.persist();
      this.toast(`${displayNameOf(unit)} 저격 확정 — 이 상위를 최우선으로 준비합니다. 지금 재료가 부족해도 경로를 유지하고 트리 재료를 보호합니다.`);
      return;
    }
    // v19.2(사용자 요청): 방금 계통 전환으로 해제된 상위를 원클릭 복구.
    if(a==='restore-released-upper'){
      const active=this.activeReleasedUpperHint();
      if(!active){this.toast('복구할 확정이 없습니다 — 계통이 다르거나 너무 오래됐습니다.');return;}
      const {hint,unit}=active,routeFamily=upperRouteFamily(unit.id);
      this.state.locks=this.state.locks.filter(lock=>lock.stage!=='upper'&&lock.stage!=='legend');
      this.state.locks.push({stage:'upper',id:unit.id,source:'restored-release',sticky:true,confirmedAt:Date.now(),confirmations:1,routeRootId:routeFamily?routeFamily[0]:unit.id,activeVariantId:unit.id});
      this.state.upperBlueprint=this.captureUpperCommitment(unit.id,hint.mode,hint.routeKey);
      this.state.directionStatus='selected';this.state.directionKey=hint.mode==='physical'?'physical':hint.routeKey;this.state.directionUpperId=unit.id;this.state.directionHoldFingerprint='';
      if(hint.mode==='magic'&&['dual','singleEnd'].includes(hint.routeKey))this.state.magicRoute=hint.routeKey;
      this.state.upperPreviewId='';this.state.postLegendRoute='upper';this.state.purpose='spec';this.state.releasedUpperHint=null;
      this._squadCacheKey='';this._directionRankCacheKey='';this.persist();
      this.toast(`${displayNameOf(unit)} 확정을 복구했습니다. 패가 바뀌면 보조 조합만 가변 재계산합니다.`);
      return;
    }
    // v19(사용자 요청): 두 번째 상위 확정/해제.  메인 상위와 같은 계열은
    // 거부한다 — 같은 상위를 두 번 세는 확정은 없다.
    if(a==='confirm-second-upper'){
      const db=this.normalized().db,unit=db.byId.get(id);
      if(!unit||!C.isUpper(unit)){this.toast('상위 유닛이 아닙니다.');return;}
      const main=this.upperLock()&&db.byId.get(this.upperLock().id)||null;
      if(main&&C.canonicalUpperId(main.id)===C.canonicalUpperId(unit.id)){this.toast(`${displayNameOf(unit)}는 이미 메인 상위입니다.`);return;}
      this.state.secondUpperId=String(id);this._squadCacheKey='';this._v15CacheKey='';this._directionRankCacheKey='';this._blueprintRankingsKey='';this.persist();
      this.toast(`두 번째 상위를 ${displayNameOf(unit)}로 확정했습니다. 이 자리는 다른 상위로 바뀌지 않고, 보드 목표는 5기로 줄어 9환산을 유지합니다.`);
      return;
    }
    if(a==='release-second-upper'){
      this.state.secondUpperId='';this._squadCacheKey='';this._v15CacheKey='';this._directionRankCacheKey='';this._blueprintRankingsKey='';this.persist();
      this.toast('두 번째 상위 확정을 해제했습니다. 다시 남은 패로 가변 재계산합니다.');
      return;
    }
    // v19.1(사용자 요청): 파티 전체 확정 — 지금 계산된 최종 파티 구성을
    // 그대로 목표로 찍는다.  못 만드는 자리만 자동으로 가변 교체된다.
    if(a==='confirm-party'){
      const locked=this.upperLock();if(!locked){this.toast('메인 상위를 먼저 확정해야 파티를 확정할 수 있습니다.');return;}
      const pack=this.plan(),squad=pack.plan&&pack.plan.squadPlan;
      if(!squad||squad.error||!(squad.finalLineup||[]).length){this.toast('지금 계산된 파티가 없어 확정할 수 없습니다. 잠시 뒤 다시 시도하세요.');return;}
      // v23.2(0816): 스턴 0.56·단끝 0 파티가 그대로 확정돼 65라 전멸 —
      // 필수 역할 미완이면 run-log-clear·new-game 과 같은 2단 확인을 거친다.
      {
        const decision=pack.plan&&pack.plan.v15Decision||{};
        const openReq=(decision.assessment&&decision.assessment.requirements||[]).filter(row=>row.required!==false&&!row.waived&&C.num(row.gap)>0);
        const now=Date.now();
        if(openReq.length&&now-C.num(this._partyConfirmArmedAt)>3500){
          this._partyConfirmArmedAt=now;
          this.toast(`필수 역할 미완 ${openReq.length}건 (${openReq.slice(0,3).map(row=>row.label||row.key).join(' · ')}) — 이 구성은 아직 클리어 스펙이 아닙니다. 그래도 확정하려면 3.5초 안에 한 번 더 누르세요.`);
          return;
        }
      }
      const blueprint=this.captureCurrentParty(locked.id,squad);
      if(!blueprint){this.toast('확정할 구성이 아직 없습니다 — 보조 전설급이 하나도 계획되지 않았습니다.');return;}
      this.state.upperBlueprint=blueprint;this._squadCacheKey='';this.persist();
      this.toast('지금 파티 구성을 확정했습니다. 만들 수 없는 자리만 자동으로 바뀝니다.');
      return;
    }
    if(a==='release-party'){
      const locked=this.upperLock();if(!locked){this.toast('확정된 파티가 없습니다.');return;}
      this.state.upperBlueprint=this.captureUpperCommitment(locked.id,this.state.mode,this.state.magicRoute);
      this._squadCacheKey='';this.persist();
      this.toast('파티 확정을 해제했습니다. 상위만 유지하고 나머지는 다시 가변 계산합니다.');
      return;
    }
    if(a==='select-upper'){const row=(this._upperRankCache||[]).find(item=>item.upperId===id);if(row&&row.directionKey){this.state.directionStatus='preview';this.state.directionKey=row.directionKey;this.state.directionUpperId=id;this.state.mode=row.directionKey==='physical'?'physical':'magic';this.state.magicRoute=row.directionKey==='physical'?'auto':row.directionKey;}this.state.upperPreviewId=id;this.state.postLegendRoute='upper';this.state.purpose='upper';this._squadCacheKey='';this.persist();this.render();return;}
    if(a==='confirm-upper'){
      // v23.1(사용자 승인 — 항법 상위 상한 강제): 계엄령은 최상위 조합
      // 불가, 패왕의길은 최상위 1기만 — 확정 버튼에서 막는다(맵 확정 규칙).
      const navCap=C.navProfile(this.state.navFamily,this.state.navPerk).upperCap;
      if(navCap===0){this.toast('계엄령 항법 — 최상위 조합이 불가합니다. 상위 없는 빌드로 진행하세요.');return;}
      const locked=this.upperLock();
      if(navCap===1&&locked&&C.canonicalUpperId(locked.id)!==C.canonicalUpperId(id)){this.toast('패왕의길 항법 — 최상위는 1기만 조합할 수 있습니다.');return;}
      if(locked&&C.canonicalUpperId(locked.id)!==C.canonicalUpperId(id)){const current=this.normalized().db.byId.get(locked.id);this.toast(`메인 상위 ${displayNameOf(current)}가 이미 고정돼 있습니다. 바꾸려면 경로만 초기화하세요.`);return;}
            const reusePreview=this.state.upperPreviewId===id&&!!this._squadCacheKey&&!!this._squadCache;this.state.upperPreviewId=id;this.state.purpose='upper';if(!reusePreview)this._squadCacheKey='';const preview=this.plan(),ranked=(preview.plan.upperRankings||[]).find(item=>item.upperId===id),squad=preview.plan.squadPlan||ranked&&ranked.plan,blueprint=this.captureUpperBlueprint(id,squad),unit=preview.state&&preview.state.db.byId.get(id);if(!unit||!C.isUpper(unit)){this.toast('현재 패에서 이 상위를 다시 찾지 못했습니다. TMO를 동기화해 주세요.');return;}
      const suggestedMode=squad&&squad.mode||ranked&&ranked.mode,mode=['physical','magic'].includes(suggestedMode)?suggestedMode:C.familyOf(unit)==='magic'?'magic':'physical',routeHint=ranked&&ranked.directionKey||squad&&squad.magicRoute||this.state.directionKey||this.state.magicRoute,route=mode==='physical'?'physical':['dual','singleEnd'].includes(routeHint)?routeHint:'singleEnd',fullBlueprint=blueprint,commitment=fullBlueprint||this.captureUpperCommitment(id,mode,route);this.state.upperBlueprint=commitment;this.state.mode=mode;if(mode==='magic'&&['dual','singleEnd'].includes(route))this.state.magicRoute=route;this.state.directionStatus='selected';this.state.directionKey=mode==='physical'?'physical':route;this.state.directionUpperId=id;this.state.directionHoldFingerprint='';this.state.releasedUpperHint=null;if(!locked){const routeFamily=upperRouteFamily(id);this.state.locks=[{stage:'upper',id,source:fullBlueprint?'manual-blueprint':'manual-route',sticky:true,confirmedAt:Date.now(),confirmations:1,routeRootId:routeFamily?routeFamily[0]:id,activeVariantId:id}];}this.state.upperDetection=emptyUpperDetection();this.state.upperPreviewId='';this.state.postLegendRoute='upper';this.state.purpose='spec';this._squadCacheKey='';this.persist();this.toast(fullBlueprint?'상위와 현재 보조 청사진을 잠갔습니다. 패가 막히면 보조 자리만 가변 재계산합니다.':'상위 방향을 잠갔습니다. 30라 전후에는 이 상위를 먼저 올리고, 보조 조합은 남은 패로 가변 재계산합니다.');return;
    }
    if(a==='lock-legend'){this.state.locks=this.state.locks.filter(x=>x.stage!=='legend');this.state.locks.push({stage:'legend',id});this.persist();this.toast('전설·히든 경로 재료와 선위를 예약했습니다.');return;}
    if(a==='lock-rare'){this.state.locks=this.state.locks.filter(x=>x.stage!=='rare');this.state.locks.push({stage:'rare',id});this.persist();this.toast('첫 희귀 경로 재료와 선위를 예약했습니다.');return;}
    if(a==='remove-lock'){if(b.dataset.stage==='upper'){this.toast('메인 상위는 순간 누락으로 풀리지 않도록 고정됩니다. 바꾸려면 경로만 초기화하세요.');return;}this.state.locks=this.state.locks.filter(x=>!(x.stage===b.dataset.stage&&x.id===id));this.persist();this.render();return;}
    if(a==='reset-route'){this.state.locks=[];this.state.upperBlueprint=null;this.state.upperDetection=emptyUpperDetection();this.state.upperPreviewId='';this.state.directionStatus='open';this.state.directionKey='';this.state.directionUpperId='';this.state.directionHoldFingerprint='';this.state.releasedUpperHint=null;this.state.postLegendRoute='';const current=this.normalized();this.state.postLegendObservedCount=legendHiddenCount(current);this.state.postLegendBaseline=legendHiddenCounts(current);this.state.purpose='';this._squadCacheKey='';this._directionRankCacheKey='';this.persist();this.toast('확정 상위와 예상 파티를 초기화했습니다. 새 방향부터 다시 비교합니다.');return;}
    if(a==='connection'){if(this.onConnectionTest)this.onConnectionTest();return;}
    if(a==='local-probe'){this.v199LocalProbe();return;}
    if(a==='open-tmo'){if(this.onOpenTmo)this.onOpenTmo();return;}
    if(a==='round-reset'){this.state.roundStartedAt=0;this.state.currentRound=1;this.persist();this.render();return;}
    // v19.13(0804b 동결): 중간 합류 채택은 세대 전환이 없어 시계가 영영
    // 안 켜졌다 — 25라에 22분 멈춘 채 50라+ 화력 승인·마감 운영이 전부
    // 잠겼다.  꺼진 시계에서의 라운드 보정은 (명시적 멈춤이 아닌 한)
    // 그 라운드부터 시계를 켠다.
    if(a==='round-step'){const delta=C.num(b.dataset.delta),cur=this.actualRound();this.state.currentRound=Math.min(C.MAX_ROUND||65,Math.max(1,cur+delta));this.state.v1912MidJoinAck=true;if(this.state.roundStartedAt)this.state.roundStartedAt=Date.now()-this.elapsedToRoundStart(this.state.currentRound)*1000;else if(this.state.roundClockPausedByUser!==true)this.state.roundStartedAt=Date.now()-this.elapsedToRoundStart(this.state.currentRound)*1000;this.persist();this.render();return;}
    if(a==='round-pause'){this.state.currentRound=this.actualRound();this.state.roundStartedAt=0;this.state.roundClockPausedByUser=true;this.persist();this.render();return;}
    if(a==='round-start'){this.state.roundStartedAt=Date.now()-this.elapsedToRoundStart(Math.max(1,C.num(this.state.currentRound)||1))*1000;this.state.roundClockPausedByUser=false;this.persist();this.render();return;}
    if(a==='reroll-step'){this.state.rerollsUsed=Math.max(0,Math.min(this.rerollLimit(),C.num(this.state.rerollsUsed)+C.num(b.dataset.delta)));this.persist();this.render();return;}
    if(a==='new-game'){const now=Date.now();if(now-C.num(this.state.newGameArmedAt)>3500){this.state.newGameArmedAt=now;this.toast('새 게임 초기화를 한 번 더 누르면 경로·수동 보정·타이머를 지웁니다.');return;}this.resetGame();return;}
    if(a==='dismiss-transaction'){this.rollbackTransaction();this.persist();this.toast('확인 전 제작 거래와 부수 상태를 되돌리고 현재 TMO 수량으로 돌아갔습니다.');return;}
    if(a==='accept-snapshot'){this.state.awaitingNewGameFingerprint='';this.persist();this.render();return;}
    if(a==='counter-step'){const key=b.dataset.key;if(['transcendUsed','seraphUsed','changedUsed'].includes(key)){const max=key==='changedUsed'?2:1;this.state[key]=Math.max(0,Math.min(max,C.num(this.state[key])+C.num(b.dataset.delta)));this._squadCacheKey='';this.persist();this.render();}return;}
    if(a==='clear-overrides'){if(this.state.pendingTransaction)this.rollbackTransaction();this.state.manualCounts={};this.state.pendingCounts={};this.state.pendingAt={};this.state.pendingTransaction=null;this.state.wispOverride='';this.releaseDirectionHold();this._squadCacheKey='';this.persist();this.render();return;}
    if(a==='clear-data'){localStorage.removeItem(STORE);localStorage.removeItem(LEGACY_STORE);localStorage.removeItem(OLDER_STORE);Object.assign(this.state,DEFAULTS,{snapshot:this.state.snapshot,liveAt:this.state.liveAt,manualCounts:{},pendingCounts:{},pendingAt:{},pendingTransaction:null,locks:[],upperDetection:emptyUpperDetection(),watchStability:normalizeWatchStability(null)});this._squadCacheKey='';this.render();return;}
  }
  resetGame(){this.beginNewRunLog();const keep={tab:'coach',gorosei:this.state.gorosei,superKumaOwned:this.state.superKumaOwned,roundPrepSeconds:this.state.roundPrepSeconds,roundNormalSeconds:this.state.roundNormalSeconds,roundBossSeconds:this.state.roundBossSeconds,roundAutoGeneration:this.state.roundAutoGeneration,roundAutoSourceEpoch:this.state.roundAutoSourceEpoch,snapshot:this.state.snapshot,liveAt:this.state.liveAt,awaitingNewGameFingerprint:fingerprint(this.state.snapshot)};Object.assign(this.state,DEFAULTS,keep,{manualCounts:{},pendingCounts:{},pendingAt:{},pendingTransaction:null,pendingReroll:null,locks:[],vetoIds:[],storyRushAbandoned:false,upperDetection:emptyUpperDetection(),watchStability:normalizeWatchStability(null)});this._squadCacheKey='';this._v15CacheKey='';this._terminalCandidate=null;this.clearVerdictCache();this.persist();this.toast('이전 게임 진행 기록을 보관하고 새 게임을 준비합니다. TMO 패가 실제로 바뀌면 추천과 새 기록을 시작합니다.');}
  elapsedToRoundStart(round){let s=C.num(this.state.roundPrepSeconds)||10;for(let r=1;r<round;r++)s+=([10,20,30,40,50,55,60,65,70,75].includes(r)?C.num(this.state.roundBossSeconds)||60:C.num(this.state.roundNormalSeconds)||35);return s;}
  // v19.7.1(외부 감사 ②): 상위 제작 후 패가 더 안 바뀌면 스냅샷이 오지 않아
  // (같은 패 = 하트비트만) 2차 확인이 영원히 안 왔고, 8초 뒤 1차 감지가
  // 리셋돼 1차만 반복하는 교착이었다.  후보가 현재 패에 계속 있고 연결이
  // 살아 있는 채 4초가 지나면 "지속" 자체를 2차 확인으로 승격한다.
  v197ConfirmStableUpper(){
    const pending=normalizeUpperDetection(this.state.upperDetection);
    if(!pending.candidateId||pending.streak<1||this.upperLock())return false;
    const snapshot=this.state.snapshot;if(!snapshot)return false;
    if(C.num((snapshot.counts||{})[pending.candidateId])<=0)return false;
    const now=Date.now(),liveAt=C.num(this.state.liveAt||snapshot.bridgeAt||snapshot.at);
    if(!liveAt||now-liveAt>12000)return false;
    if(now-pending.lastSeenAt<4000)return false;
    const db=this.catalogDb(),unit=db.byId.get(pending.candidateId);
    if(!unit)return false;
    const routeFamily=upperRouteFamily(pending.candidateId);
    this.state.locks=[{stage:'upper',id:pending.candidateId,source:'tmo',sticky:true,confirmedAt:now,confirmations:2,routeRootId:routeFamily?routeFamily[0]:pending.candidateId,activeVariantId:pending.candidateId}];
    this.syncUpperMode(pending.candidateId,db);
    this.state.upperDetection=emptyUpperDetection();
    this.state.upperPreviewId='';this.state.postLegendRoute='upper';this.state.purpose='spec';
    this.setMessage(`상위 ${displayNameOf(unit)}가 같은 패에서 4초 이상 유지돼 메인 상위로 고정했습니다.`);
    return true;
  }
  updateClockOnly(){const now=Date.now(),current=this.actualRound(),health=this.health();if(health.ready&&this.v197ConfirmStableUpper()){this.persist();if(this.shouldDeferExternalRender())this._deferredExternalRender=true;else this.render();return;}
    // v19.8(사용자 요청 ⑤): 확정 메인 상위를 최근 5판 목록으로 기억한다 —
    // 다음 판 후보 카드의 "최근에 안 간 각" 배지 재료(표시 전용).
    {const mainLock=this.upperLock();if(mainLock){const mainKey=String(C.canonicalUpperId(mainLock.id)),recent=Array.isArray(this.state.recentMainUppers)?this.state.recentMainUppers:[];if(recent[0]!==mainKey){this.state.recentMainUppers=[mainKey,...recent.filter(key=>key!==mainKey)].slice(0,5);this.persist();}}}if(this.prunePending(this.state.snapshot,now)){this.persist();if(this.shouldDeferExternalRender())this._deferredExternalRender=true;else this.render();return;}if(this.state.roundStartedAt&&current!==this._renderedRound||health.key!==this._renderedHealthKey){if(this.shouldDeferExternalRender()){this._deferredExternalRender=true;}else{this.render();return;}}
    // v19.9(개선 ⑧): 판 종료 침묵 배너는 시간 경과로만 상태가 바뀐다 —
    // 경계(3분) 통과 순간에 한 번 다시 그린다.
    {const freeze=this.v199GameEndFreezeSec()>0;if(freeze!==!!this._v199FreezeBanner){this._v199FreezeBanner=freeze;if(this.shouldDeferExternalRender())this._deferredExternalRender=true;else{this.render();return;}}}const c=C.roundClock(this.settings(),now);this.root.querySelectorAll('[data-clock]').forEach(n=>n.textContent=c.running?`${c.label} · ${c.remaining}초`:c.label);this.updateLiveStatusOnly();}

  render(){
    // v17: a rendering exception must never leave the screen dead or blank
    // mid-game.  Show the failure and keep the previous DOM alive instead.
    try{this.renderUnsafe();}catch(error){
      try{
        const note=this.root.querySelector('.v151-render-error')||this.root.ownerDocument.createElement('div');
        note.className='v151-render-error';
        note.textContent=`화면 갱신 오류 — 데이터는 계속 수집 중입니다: ${String(error&&error.message||error).slice(0,140)}`;
        if(!note.parentNode)this.root.prepend(note);
        if(this.runLogActive())this.recordAuditAction({actor:'program',action:'render-error',key:String(error&&error.message||error).slice(0,180)});
      }catch(_){}
    }
  }
  renderUnsafe(){
    // The seven-panel coach remains the default live screen. Focused auxiliary
    // pages are reachable from panel 7 without reviving the legacy tab bar.
    if(!REACHABLE_TABS.has(this.state.tab))this.state.tab='coach';
    const pack=this.plan(),state=pack.state,plan=pack.plan,settings=pack.settings,phase=phaseForPurpose(plan,settings.currentRound),clock=C.roundClock(settings,Date.now()),health=this.health();this._renderedRound=settings.currentRound;this._renderedHealthKey=health.key;this._deferredExternalRender=false;this.captureRunDecision(pack);
    const savedScroll=this.captureScrollPositions(),savedFolds=this.captureOpenFolds();
    const body=this.state.tab==='coach'?this.renderCoach(state,plan,phase,clock,health):this.renderAuxiliaryPage(this.state.tab,state,plan,health);
    this.root.innerHTML=`<div class="ord-app v151-shell" data-view="${C.esc(this.state.tab)}">${body}${this.renderDetail(state,plan)}${this.renderV151PartyModal(state,plan)}${this.renderV151ShipModal(state)}${this.renderSnipeModal(state)}${this.renderRunResultModal(health)}${this.state.message?`<div class="ord-toast" role="status">${C.esc(this.state.message)}</div>`:''}</div>`;
    this.restoreScrollPositions(savedScroll);
    this.restoreOpenFolds(savedFolds);
    this.root.querySelectorAll('[data-act="confirm-upper"]').forEach(button=>{button.disabled=false;button.removeAttribute('aria-disabled');button.title='상위 방향을 먼저 잠급니다. 보조 조합은 패가 바뀔 때마다 가변 재계산합니다.';});
    const focusSelector=this._focusAfterRender;this._focusAfterRender='';if(focusSelector&&this.root.querySelector){const target=this.root.querySelector(focusSelector);if(target&&typeof target.focus==='function'){try{target.focus({preventScroll:true});}catch(_){target.focus();}}}
  }
  renderAuxiliaryPage(tab,state,plan,health){
    const pages={
      runlog:{className:'v151-runlog-page',title:'판단 기록',note:'저장은 녹화 JSON 버튼을 사용하세요.',content:()=>this.renderRunLog(state,plan,health)},
      deck:{className:'v151-deck-page',title:'수동 패 보정',note:'TMO가 놓친 유닛만 추가하거나 삭제하세요.',content:()=>this.renderDeck(state,plan)},
      data:{className:'v151-data-page',title:'연결 진단',note:'수집 상태와 최신 스캔 거부 사유를 확인합니다.',content:()=>this.renderData(state,plan,health)},
      story:{className:'v151-story-page',title:'스토리',note:'등급·근거별 유닛 정보를 확인합니다.',content:()=>this.renderStoryCatalog(state)}
    },page=pages[tab]||pages.deck;
    return`<div class="v151-screen v151-aux-page ${page.className}"><div class="ord-panel v151-aux-bar"><button class="primary" type="button" data-act="tab" data-tab="coach">← 코치로 돌아가기</button><span><b>${C.esc(page.title)}</b><small>${C.esc(page.note)}</small></span></div>${page.content()}</div>`;
  }
  // A live TMO snapshot rebuilds the whole screen; without this, every
  // rebuild snapped the page and each scrolled panel back to the top —
  // the reported up-and-down jumping while the clock/hand refreshed.
  scrollableSelector(){return'.v151-scroll,.v151-action,.v151-prep-list,.v151-build-list,.v151-spec-grid,.v151-spec-body,.v151-forecast-list,.v151-upper-candidates,.v151-gorosei,.v151-gorosei-values,.v151-runlog-page,.detail-modal';}
  captureScrollPositions(){
    try{
      const doc=typeof document!=='undefined'&&(document.scrollingElement||document.documentElement);
      const panels=this.root&&this.root.querySelectorAll?Array.from(this.root.querySelectorAll(this.scrollableSelector())).map(node=>node.scrollTop||0):[];
      const shell=this.root&&this.root.querySelector?this.root.querySelector('.ord-app[data-view]'):null;
      return{view:String(shell&&shell.dataset&&shell.dataset.view||''),doc:doc&&doc.scrollTop||0,panels};
    }catch(_){return null;}
  }
  restoreScrollPositions(saved){
    if(!saved)return;
    try{
      const doc=typeof document!=='undefined'&&(document.scrollingElement||document.documentElement);
      if(saved.view&&saved.view!==this.state.tab){if(doc)doc.scrollTop=0;return;}
      if(doc&&saved.doc)doc.scrollTop=saved.doc;
      if(this.root&&this.root.querySelectorAll){
        const nodes=this.root.querySelectorAll(this.scrollableSelector()),tops=Array.isArray(saved.panels)?saved.panels:[];
        for(let index=0;index<nodes.length&&index<tops.length;index++)if(tops[index])nodes[index].scrollTop=tops[index];
      }
    }catch(_){}
  }
  // v22.8(사용자: "오로성 선택하는거랑 특별 선택하는거 하나 선택하면
  // 접히던데 선택할 때는 안접히고 내가 원할 때 접히게"): 전체 innerHTML
  // 재렌더가 <details> 열림을 매번 초기화했다 — 설정 팝업(v153-tools)의
  // 오로성·152킬 특별함·스토리 10 셀렉트는 setOpt 끝의 render()로 선택
  // 즉시 팝업을 접었고, 연구소(v153-lab)·전체 스펙 표(v22-spec-fold)·
  // 2상위 접기 등 살아있는 접힘 전부가 같은 증상이었다.  스크롤 보존과
  // 같은 방식으로 렌더 전 열림 목록을 떠서 렌더 후 DOM에만 복원한다 —
  // 마크업은 불변(태그 리터럴 계약 유지)이고, 닫기는 사용자가 summary를
  // 누를 때 브라우저가 라이브 DOM에서 처리하므로 다음 캡처가 그대로
  // 존중한다.  키는 클래스명 + 같은 클래스 내 등장 순서(스크롤 보존의
  // 인덱스 관례).  복원은 열기만 한다 — 강제로 닫지 않는다.
  captureOpenFolds(){
    const open=[];
    try{
      if(!this.root||!this.root.querySelectorAll)return open;
      const seen=new Map();
      for(const el of this.root.querySelectorAll('details')){
        const cls=String(el.className||''),n=C.num(seen.get(cls));
        seen.set(cls,n+1);
        if(el.open)open.push(`${cls}#${n}`);
      }
    }catch(_){}
    return open;
  }
  restoreOpenFolds(open){
    try{
      if(!this.root||!this.root.querySelectorAll||!Array.isArray(open)||!open.length)return;
      const want=new Set(open),seen=new Map();
      for(const el of this.root.querySelectorAll('details')){
        const cls=String(el.className||''),n=C.num(seen.get(cls));
        seen.set(cls,n+1);
        if(want.has(`${cls}#${n}`))el.open=true;
      }
    }catch(_){}
  }
  renderSidebar(state,plan,phase,clock){
    const locks=this.state.locks.map(x=>{const u=state.db.byId.get(x.id);if(!u)return'';return x.stage==='upper'?`<span title="TMO 순간 누락에도 유지됩니다">상위 고정 · ${C.esc(displayNameOf(u))}<small>${x.source==='tmo'?'2회 확인':'수동 확정'}</small></span>`:`<span>${stageLabel(x.stage)} · ${C.esc(displayNameOf(u))}<button aria-label="경로 해제" data-act="remove-lock" data-stage="${x.stage}" data-id="${C.esc(x.id)}">×</button></span>`;}).join(''),pending=normalizeUpperDetection(this.state.upperDetection),pendingUnit=pending.candidateId&&state.db.byId.get(pending.candidateId),pendingLabel=pendingUnit&&!this.upperLock()?`<span title="같은 상위를 한 번 더 감지하면 고정합니다">상위 확인 중 · ${C.esc(displayNameOf(pendingUnit))}<small>${pending.streak}/2</small></span>`:'',tx=normalizeTransaction(this.state.pendingTransaction),overrideCount=Object.keys(this.state.manualCounts||{}).length+(this.state.wispOverride!==''?1:0)+(tx?Object.keys(tx.expected).length:0);
    const logSummary=this.runLog?this.runLog.summary():{ready:false,status:'idle',eventCount:0,persistence:'none'},recording=logSummary.status==='active';
    return`<aside class="ord-side"><section class="side-card game-card"><div class="side-title"><b>현재 게임</b><span>${C.esc(phase.label)}</span></div><div class="round-box"><strong data-clock>${C.esc(clock.label)}${clock.running?` · ${clock.remaining}초`:''}</strong><div><button data-act="round-step" data-delta="-1">−1</button>${clock.running?`<button data-act="round-pause">멈춤</button>`:`<button data-act="round-start">타이머</button>`}<button data-act="round-step" data-delta="1">+1</button></div></div><div class="run-log-quick"><div><span class="record-dot ${recording?'on':''}"></span><b>${recording?'판단 자동 기록 중':logSummary.status==='idle'?'기록 준비 중':'게임 기록 종료'}</b><small>사건 <i data-run-log-count>${C.num(logSummary.eventCount)}</i>개 · ${logSummary.persistence==='indexeddb'?'비동기 저장':logSummary.persistence==='localstorage'?'청크 저장':'메모리 저장'}</small></div><div><button data-act="run-log-open">기록 보기</button><button data-act="run-log-export">JSON 저장</button><button class="result" data-act="run-result-open">게임 결과</button></div></div><details><summary>라운드 시간 설정</summary><div class="form-grid"><label>현재 라운드<input data-opt="currentRound" type="number" min="1" max="65" value="${this.actualRound()}"></label><label>준비<input data-opt="roundPrepSeconds" type="number" value="${this.state.roundPrepSeconds}"></label><label>일반<input data-opt="roundNormalSeconds" type="number" value="${this.state.roundNormalSeconds}"></label><label>보스<input data-opt="roundBossSeconds" type="number" value="${this.state.roundBossSeconds}"></label></div><button class="ghost" data-act="round-reset">1라운드 수동 상태</button></details></section>
      <section class="side-card"><b>최종 스쿼드 기준</b><label>딜 계통<select data-opt="mode"><option value="" ${!this.state.mode?'selected':''}>상위에서 자동</option><option value="physical" ${this.state.mode==='physical'?'selected':''}>물딜</option><option value="magic" ${this.state.mode==='magic'?'selected':''}>마딜</option></select></label>${this.state.mode==='magic'?`<label>마딜 경로<select data-opt="magicRoute"><option value="auto" ${this.state.magicRoute==='auto'?'selected':''}>패에 가까운 경로 자동</option><option value="dual" ${this.state.magicRoute==='dual'?'selected':''}>상위 2 + 토키</option><option value="singleEnd" ${this.state.magicRoute==='singleEnd'?'selected':''}>상위 1 + 단·끝 3~4</option></select></label>`:''}<label>오로성<select data-opt="gorosei">${Object.values(C.GOROSEI).map(g=>`<option value="${g.key}" ${this.state.gorosei===g.key?'selected':''}>${g.name}</option>`).join('')}</select></label><div class="two-button"><button class="${this.state.superKumaOwned?'on':''}" data-act="super-kuma" data-value="owned">초월 가능</button><button class="${this.state.superKumaOwned?'':'on danger'}" data-act="super-kuma" data-value="missing">초월 소진</button></div><small class="always-on-note always-on">왜곡 경로 항상 허용 · 비싼 선위와 재료 중복은 계속 감점</small><div class="usage-ledger"><span>초월 ${C.num(this.state.transcendUsed)}/1</span><span>세라핌 ${C.num(this.state.seraphUsed)}/1</span><span>변화됨 ${C.num(this.state.changedUsed)}/2</span></div></section>
      <section class="side-card"><div class="stat-row"><span>선택위습</span><b>${state.wisp}</b></div><label>선위 수동 보정<input data-opt="wispOverride" type="number" min="0" placeholder="TMO ${C.num(state.rawCounts[C.WISP_ID])}" value="${C.esc(this.state.wispOverride)}"></label><div class="lock-list">${locks||pendingLabel||'<small>확정 경로 없음</small>'}${locks&&pendingLabel?pendingLabel:''}</div>${locks?'<button class="ghost" data-act="reset-route">경로만 초기화</button>':''}${tx?`<div class="transaction-side ${tx.status}"><b>${tx.steps.length}건 제작 임시 반영</b><small>${tx.status==='review'?'TMO 수량이 아직 맞지 않습니다. 실제 패를 확인하세요.':'결과·재료·선위를 함께 잠금 중'}</small><button class="ghost" data-act="dismiss-transaction">TMO 현재값 사용</button></div>`:''}${overrideCount?`<div class="override-alert">보정·거래 ${overrideCount}개 적용 중</div><button class="ghost" data-act="clear-overrides">보정과 임시 거래 모두 해제</button>`:''}</section></aside>`;
  }
  trustCopy(html){
    const replacements=[['현재 패 전체 제작 검증','현재 패 재료·선위 검증'],['현재 패 전체 검증 · 확정','재료·선위 검증 · 경로 확정'],['전체 검증 경로 선택','재료 검증 경로 선택'],['9기는 미확정 · 상위 경로만 선택','상위·조합 방향 확정'],['파티 확정이 금지됩니다','상위 방향 확정 뒤 보조 조합을 가변 재계산합니다'],['현재 패로 상위도 제작 불가','상위 방향 확정 · 제작 재료 부족'],['확정 파티 재검증','상위 방향 잠금 · 보조안 재계산'],['확정 파티를 현재 재고로 매번 재검증합니다.','상위 방향은 유지하고 보조 조합은 현재 패로 가변 재계산합니다.'],['지금 권장','현재 패 임시 우세'],['유일한 상위 경로','계산한 후보 중 체크포인트 우세 경로'],['클리어 필수 보완','상위 완성 가정 보완'],['필수 클리어 역할','구조 필수 역할'],['클리어 역할 완성','구조 역할 합계 충족'],['클리어안','미래 역할안'],['클리어 조건','구조 조건'],['클리어 필수','구조 필수']];let out=String(html||'');for(const [before,after] of replacements)out=out.split(before).join(after);return out;
  }
  renderV15Livebar(state,plan,clock,health){
    const decision=plan.v15Decision||{},assessment=decision.assessment||{},route=assessment.route,lock=this.upperLock(),upper=lock&&state.db.byId.get(lock.id),routeName=upper?`${this.state.mode==='magic'?'마딜':'물딜'} · ${displayNameOf(upper)}`:route&&route.label||`${modeLabel(this.state.mode)} · 메인 상위 미확정`,syncTone=health.ready?'observed':health.key==='partial'||health.key==='lag'?'warn':'stop';
    return`<header class="v15-livebar"><div class="v15-round"><b>${this.actualRound()}라</b>${clock.running?`<span>${clock.remaining}초</span>`:''}</div><div class="v15-sync ${syncTone}" data-sync-age>${C.esc(health.label)}${health.ageSec<999?` · ${health.ageSec}초 전`:''}</div><div class="v15-wisp"><span>선위</span><b>${C.num(state.wisp)}</b></div><div class="v15-route"><span>${C.esc(routeName)}</span><div class="damage-mode-switch" role="group" aria-label="딜 계통 선택"><button class="${this.state.mode==='physical'?'on':''}" data-act="mode" data-value="physical">물딜</button><button class="${this.state.mode==='magic'?'on':''}" data-act="mode" data-value="magic">마딜</button></div>${this.state.mode==='magic'?`<select data-opt="magicRoute" aria-label="마딜 경로"><option value="auto" ${this.state.magicRoute==='auto'?'selected':''}>경로 선택</option><option value="dual" ${this.state.magicRoute==='dual'?'selected':''}>2상위·토키</option><option value="singleEnd" ${this.state.magicRoute==='singleEnd'?'selected':''}>1상위·단끝</option></select>`:''}</div><div class="v15-live-actions"><button data-act="connection">동기화</button><button data-act="run-log-open">판단 기록</button><button data-act="run-result-open">게임 결과</button></div></header>`;
  }
  renderV15PostLegend(branch){
    return`<section class="v15-route-board"><header><div><small>첫 전설·히든 완성 확인</small><h2>다음 한 갈래만 선택하세요</h2><p>지금 선택은 최종 9기를 고정하지 않습니다. 한 번 제작하거나 상위를 올리면 현재 패로 다시 판단합니다.</p></div></header><div class="v15-route-cards"><article class="v15-route-card"><h3>전설·히든 한 기 더</h3><p>모든 전설·히든 중 부족 재료가 가장 적은 한 기만 추천합니다.</p><div class="v15-route-actions"><button class="primary" data-act="post-legend-route" data-value="legend">이 경로 선택</button></div></article><article class="v15-route-card recommended"><h3>메인 상위 준비</h3><p>25라 전후 희귀·특별·안흔 패와 선위를 보고 상위 후보를 비교합니다.</p><div class="v15-route-actions"><button class="primary" data-act="post-legend-route" data-value="upper">이 경로 선택</button></div></article></div></section>`;
  }
  renderV15RouteChoice(state,plan){
    const decision=plan.v15Decision||{},candidates=(decision.routeCandidates||[]).slice(0,6),detailChoice=decision.routeChoiceKind==='locked-magic-detail',roundReady=true,cards=candidates.map((row,index)=>{const selected=this.state.directionKey===row.routeKey&&C.canonicalUpperId(this.state.directionUpperId)===C.canonicalUpperId(row.id),evaluated=routeCandidateReady(row),canConfirm=roundReady&&evaluated,tiers=row.tiers||{},availability=row.tierAvailable||{},exact=!!(row.projectedSupport&&row.projectedSupport.exactPrefix),tierLabel=exact?'소비':'상위 필요',cv=row.clearValue||{},overdue=cv.overdue===true,etaText=row.feasible?'':C.num(cv.eta)>0?` · 빨라야 ${C.num(cv.eta)}라${overdue?` (마감 ${C.num(cv.deadline)}라 초과)`:''}`:'',status=row.locked?'고정 상위 유지':!evaluated?'상위+보조 파티 평가 중':row.feasible?'현재 패 제작 가능':`선위 ${C.num(row.wispGap)} 부족${etaText}`,wisp=row.locked?'소모 없음':`${C.num(row.wispCost)}${row.feasible&&row.wispAfter!=null?` · 후 ${C.num(row.wispAfter)}`:''}`,steps=row.projectedSupport&&row.projectedSupport.steps||[],path=steps.map(step=>`${step.order}. ${step.name} (선위 ${C.num(step.wispCost)})`).join(' → '),buttonText=!evaluated?'파티 평가 중':selected?'선택 유지':row.locked?'세부 경로 확정':'상위 방향 확정';return`<article class="v15-route-card ${index===0?'recommended':''} ${selected?'selected':''} ${overdue?'overdue':''}"><header><small>${index+1}순위 · ${C.esc(row.routeLabel||'')}</small><h3>${C.esc(row.name||'상위 후보')}</h3><em>${C.esc(status)}</em></header><p>${C.esc(row.reason||'현재 패의 정확 원장으로 비교했습니다.')}</p>${path?`<div class="v15-route-prefix"><small>상위 + 확정 보조 경로</small><b>${C.esc(path)}</b><span>미래 드랍·최종 9기 가정 없음</span></div>`:''}<dl><dt>누적 선택위습</dt><dd>${C.esc(wisp)}</dd>${row.feasible||!C.num(cv.eta)?'':`<dt>예상 완성</dt><dd class="${overdue?'overdue':''}">${C.num(cv.eta)}~${C.num(cv.etaSlow)}라${overdue?` · ${C.num(cv.deadline)}라 마감 초과`:''}<small>부족분이 전부 흔함이면 ${cv.optimisticRate}/라, 안흔함 이상이면 ${cv.pessimisticRate}/라로 해소</small></dd>`}${C.num(row.clearValue&&row.clearValue.metaGames)>0?`<dt>전체 실측</dt><dd>${C.num(row.clearValue.metaGames)}판 (${row.clearValue.metaShare}%)</dd>`:''}${(()=>{const cs=C.clearStatsFor&&C.clearStatsFor(row.id);if(!cs)return'';const roles=cs.roles;const short=name=>String(name||'').split(/[\s(]/)[0];return`<dt>클리어 조합 실측</dt><dd class="v1916-clear">이감 ${roles.slow.p50} · 스턴 ${roles.stun.p50} · 체젠 ${roles.regen.p50} <small>(${C.num(cs.games)}판 중앙값)</small><br><small>실측 파트너 · ${C.esc(cs.partners.slice(0,3).map(item=>`${short(item.name)} ${item.share}%`).join(' · '))}</small></dd>`;})()}${row.locked?'':`<dt>희귀 ${tierLabel}</dt><dd>${C.num(tiers.rare)}/${C.num(availability.rare)}</dd><dt>특별·안흔 ${tierLabel}</dt><dd>${C.num(tiers.special)}/${C.num(availability.special)} · ${C.num(tiers.uncommon)}/${C.num(availability.uncommon)}</dd>`}</dl>${row.warped&&row.warped.required?'<span class="v15-route-warped">왜곡 제작 비용이 위 선위에 포함됨</span>':''}${row.recentUse?`<span class="v15-route-warped v1914-recent">최근 ${C.num(row.recentUse.gamesAgo)}판 전 메인 — 다양성 위해 순위 뒤로</span>`:''}${row.challengeAngle?'<span class="v15-route-warped v1915-challenge">도전 각 — 비주류지만 이 패로 성립</span>':''}<div class="v15-route-actions"><button data-act="detail" data-id="${C.esc(row.id)}">상위 재료</button><button class="primary" data-act="choose-direction" data-key="${C.esc(row.routeKey)}" data-id="${C.esc(row.id)}" ${canConfirm?'':'disabled aria-disabled="true"'}>${buttonText}</button></div></article>`;}).join('');
    return`<section class="v15-route-board"><header><div><small>${detailChoice?'자동 감지 상위 보호':'v15 단일 판단 엔진 · 최대 6개'}</small><h2>${detailChoice?'메인 상위는 그대로, 마딜 경로만 선택':'현재 패에서 이어갈 상위'}</h2><p>${C.esc(decision.reason||'상위는 전설 3기분으로 계산하며 보조 조합은 매 패 다시 계산합니다.')}</p></div><div class="damage-mode-switch"><button class="${this.state.mode==='physical'?'on':''}" data-act="mode" data-value="physical" ${detailChoice?'disabled':''}>물딜</button><button class="${this.state.mode==='magic'?'on':''}" data-act="mode" data-value="magic">마딜</button></div></header><div class="v15-route-cards">${cards||'<article class="v15-route-card"><h3>현재 검증 가능한 후보 없음</h3><p>특수 선행재료와 실제 TMO 패를 다시 확인하세요. 희귀는 리롤하지 않고 보류합니다.</p></article>'}</div></section>`;
  }
  renderV15Decision(plan){
    const d=plan.v15Decision||{},state=d.state||'SYNC_BLOCKED',action=d.action||null,shown=action||d.blockedAction||null,unit=shown&&shown.unit,rare=d.rare||{},reroll=rare.safeReroll,displayTarget=state==='REROLL_ONE'&&reroll?`${reroll.name} 1장 리롤`:shown?shown.name:d.label||'현재 패 소비 보류',image=unit&&unit.image||reroll&&reroll.unit&&reroll.unit.image||'',wispCost=shown?C.num(shown.wispCost):0,wispAfter=shown&&shown.wispAfter!=null?C.num(shown.wispAfter):C.num(d.model&&d.model.effective&&d.model.effective.wisp),deltas=(shown&&shown.deltas||[]).filter(row=>Math.abs(C.num(row.delta))>.001||row.closed),after=deltas.slice(0,4).map(row=>`<span>${C.esc(row.label)} ${fmt(row.before)} → ${fmt(row.after)} / ${fmt(row.target)}</span>`).join('')||`<span>${C.esc(state==='PREPARE'?'이 1순위의 재료를 보호하되 아직 제작하지 않습니다.':state==='SYNC_BLOCKED'?'TMO 확인 전에는 다음 판단을 만들지 않습니다.':state==='REROLL_ONE'?'한 장만 리롤한 뒤 즉시 다시 계산합니다.':'현재 패에서 확정된 수치 변화 없음')}</span>`,stop=shown&&shown.stopCondition?shown.stopCondition:state==='PREPARE'?'필요 재료·선위가 모두 확인되기 전에는 제작 버튼을 열지 않습니다.':state==='REROLL_ONE'?'리롤 대상·수량이 다르면 실행하지 말고 먼저 동기화하세요.':'패가 바뀌면 실행하지 말고 먼저 동기화하세요.',unknowns=(d.unknowns||[]).slice(0,3).join(' · ')||'보스 DPS와 컨트롤은 자동 측정하지 않음',button=state==='ACT_NOW'&&action?`<button class="primary" data-act="mark-made" data-step="0" data-id="${C.esc(action.id)}">제작함 · TMO 확인</button>`:state==='REROLL_ONE'&&reroll?`<button class="primary" data-act="reroll-confirmed" data-id="${C.esc(reroll.id)}">1장 리롤함 · 다시 읽기</button>`:state==='SYNC_BLOCKED'?`<button data-act="connection">TMO 다시 읽기</button>${this.state.pendingReroll?'<button data-act="cancel-reroll">리롤 대기 해제</button>':''}`:state==='PREPARE'?'<button disabled>재료 준비 중 · 제작 잠금</button>':'<button disabled>지금은 소비하지 않음</button>',detail=shown?`<button data-act="detail" data-id="${C.esc(shown.id)}">이유·재료</button>`:'';
    return`<section class="v15-next-decision" data-state="${C.esc(state)}"><div class="v15-action-head"><small>${C.esc({ACT_NOW:'지금 할 일',PREPARE:'재료 보호',HOLD:'소비 보류',REROLL_ONE:'안전 리롤',SYNC_BLOCKED:'확인 대기'}[state]||'다음 판단')}</small><span class="v15-proof">현재 패 순차 원장</span></div><div class="v15-action-target">${image?`<img src="${C.esc(image)}" alt="">`:'<i class="v15-action-placeholder">!</i>'}<div><h2>${C.esc(displayTarget)}</h2><p>${C.esc(d.label||'')}</p></div>${shown?`<div class="v15-action-cost"><small>선택위습</small><b>${wispCost}</b><span>${state==='PREPARE'?'확보 전 잠금':`제작 후 ${wispAfter}`}</span></div>`:''}</div><div class="v15-action-facts"><div class="v15-action-why"><small>이유</small><b>${C.esc(d.reason||'현재 패를 소비하지 않고 다음 확인을 기다립니다.')}</b></div><div class="v15-action-after"><small>이 행동 뒤</small>${after}</div></div><div class="v15-guard-row"><div class="v15-stop-condition"><small>멈춤 조건</small>${C.esc(stop)}</div><div class="v15-uncertainty"><small>프로그램이 모르는 것</small>${C.esc(unknowns)}</div></div><div class="v15-action-controls">${detail}${button}</div></section>`;
  }
  renderV15Gaps(plan){
    const d=plan.v15Decision||{},a=d.assessment||{},seen=new Set(),rows=[];for(const row of a.requirements||[]){if(seen.has(row.key))continue;seen.add(row.key);rows.push(row);}const activeRows=rows.filter(row=>row.active),source=(activeRows.length?activeRows:rows).slice(0,7),firstGap=source.findIndex(row=>C.num(row.gap)>0),cards=source.map((row,index)=>`<div class="v15-gap-row ${C.num(row.gap)<=0?'ok':index===firstGap?'next':''}"><small>${C.esc(row.label)}</small><b>${fmt(row.current)} / ${fmt(row.target)}</b><span>${C.num(row.gap)<=0?'확보':`부족 ${fmt(row.gap)}`}${row.key==='slow'?` · 적용상한 ${fmt(row.target)}`:''}</span></div>`).join(''),checkpoint=a.checkpoint||{};
    return`<section class="v15-gap-board"><header><h2>현재 생존 결손</h2><span>${C.esc(checkpoint.label||'경로 구조')} · ${C.num(checkpoint.dueRound)||'—'}라 마감 · 화력은 별도 미검증</span></header>${cards?`<div class="v15-gap-list">${cards}</div>`:`<div class="v15-hard-gate recoverable"><i>!</i><div><b>${C.esc(d.label||'초기 제작 마감')}</b><span>${C.esc(d.reason||'첫 제작을 완료한 뒤 역할 결손을 표시합니다.')}</span></div></div>`}</section>`;
  }
  renderV15RareBoard(state,plan){
    const d=plan.v15Decision||{},rare=d.rare||{},rows=rare.rows||[],db=state&&state.db||d.model&&d.model.knowledge&&d.model.knowledge.db||null,virtualId=String(this.state.virtualSpecialId||''),virtual=virtualId&&db&&db.byId&&db.byId.get(virtualId),options=(C.eligible152Specials?C.eligible152Specials(db):db&&db.specials||[]).map(unit=>`<option value="${C.esc(unit.id)}" ${virtualId===unit.id?'selected':''}>${C.esc(displayNameOf(unit))}</option>`).join(''),categories={use:[],hold:[],reroll:[]};for(const row of rows)for(const key of Object.keys(categories)){const count=C.num(row[key]);if(count>0)categories[key].push(Object.assign({},row,{count}));}const total=rows.reduce((sum,row)=>sum+C.num(row.initial),0),card=row=>`<div class="v15-rare-card">${row.unit&&row.unit.image?`<img src="${C.esc(row.unit.image)}" alt="">`:''}<span><b>${C.esc(row.name)}</b><small>${C.esc(row.reason||'')}</small></span><strong>×${row.count}</strong></div>`,group=(key,label)=>`<section class="v15-rare-group ${key}"><header><b>${label}</b><span>${categories[key].reduce((sum,row)=>sum+row.count,0)}장</span></header>${categories[key].map(card).join('')||'<small class="rare-empty">없음</small>'}${key==='reroll'&&rare.safeReroll?`<button class="v15-reroll-action" data-act="reroll-confirmed" data-id="${C.esc(rare.safeReroll.id)}">${C.esc(rare.safeReroll.name)} 1장 리롤함</button>`:''}</section>`;
    return`<aside class="v15-rare-board"><header><h2>희귀 패</h2><span>${total}장 · 단일 분류</span></header><div class="v15-reward-special"><b>152킬 특별함 · 희귀 계산에 합산</b><select data-opt="virtualSpecialId"><option value="">보상 특별함 선택</option>${options}</select>${virtual?`<span>${C.esc(displayNameOf(virtual))}(특별함) 1기 반영 중</span>`:''}</div><div class="v15-rare-scroll">${group('use','사용')}${group('hold','보류')}${group('reroll','리롤')}</div></aside>`;
  }

  v151StoryTag(unit){
    if(!unit||!C.storyLeagueGrade)return'';
    const grade=C.storyLeagueGrade(unit);
    if(!grade||!C.num(grade.leagueRank))return'';
    return`<span class="v151-story tier-${C.esc(String(grade.leagueTier||'f').toLowerCase())}" title="${C.esc(grade.note||'')}">${C.esc(grade.leagueLabel||'')} ${C.esc(grade.leagueTier||'')} · ${C.num(grade.leagueRank)}위</span>`;
  }
  v216BargesTag(unit){
    // v21.6(구상 ④ · 30~40라 바제스 특별 미션): 티모지지의 "자제스" 표식은
    // 카탈로그 abilities['바제스'] 키로 이미 들어와 있다(상위·전설급 72유닛).
    // 미션 구간과 그 직전(26~40라)에만 배지를 달아 준비를 유도한다.
    if(!unit||!unit.abilities||!unit.abilities['바제스'])return'';
    const roundNow=this.actualRound();
    if(roundNow<26||roundNow>40)return'';
    return'<span class="v216-barges" title="바제스 특별 미션(30~40라) 가능 유닛 — 이 유닛이 있으면 미션 보상을 노릴 수 있습니다">바제스</span>';
  }
  v224Completion(state,unit){
    // v22.4(사용자: "모든 캐릭터를 만들기 전에 환산으로 완성 %가 나왔으면
    // 좋겠어 헷갈려"): v20.2 에 만들어 두고 화면에 배선하지 않았던
    // ledgerCompletion(코치 정확 원장 완성도 — 빈 패 대비 흔함 재료 확보
    // 비율)을 모든 제작 대상 표기에 단다.  스냅샷+수동보정 단위로 캐시.
    if(!unit||!unit.id||!state||!state.db)return null;
    const key=`${fingerprint(this.state.snapshot)}|${JSON.stringify(this.state.manualCounts||{})}`;
    if(!this._v224PctCache||this._v224PctCache.key!==key)this._v224PctCache={key,map:new Map()};
    const map=this._v224PctCache.map;
    if(map.has(unit.id))return map.get(unit.id);
    let row=null;try{row=C.ledgerCompletion(state.db,unit.id,state.counts||{});}catch(_){row=null;}
    map.set(unit.id,row);
    return row;
  }
  v224PctChip(state,unit){
    const row=this.v224Completion(state,unit);
    if(!row)return'';
    return`<span class="v224-pct ${row.owned||row.percent>=100?'done':row.percent>=70?'near':''}" title="코치 계산 완성도 — 빈 패 대비 흔함 재료 확보 비율(정확 원장 · TMO %와 별개)">${row.owned?'보유':`${row.percent}%`}</span>`;
  }
  v225StoryRushButton(){
    // v22.5(사용자: "스토리 빨리 밀기 포기 버튼 누르면 스토리 랭킹 상관없이
    // 선택위습 가장 적게 사용하는 전설급 유닛 추천하게 해줘").
    const on=this.state.storyRushAbandoned===true;
    return`<button class="v225-story-rush ${on?'on':''}" data-act="story-rush-toggle">${on?'스토리 포기 중 — 최저 선위 전용 · 되돌리기':'스토리 빨리 밀기 포기 (최저 선위만)'}</button>`;
  }
  v22Phase(plan){
    // v22.0(사용자: "내가 준 명세서에 맞게 필요한 정보만 간추려서") —
    // 전략_구상.md 의 여섯 국면이 화면 구조다.  매 국면 질문은 하나고
    // 화면도 그 답만 보여준다.  ①②는 마일스톤이 라운드보다 우선한다:
    // 첫 희귀·첫 전설이 늦었으면 라운드가 지나도 그 국면에 머문다.
    const roundNow=this.actualRound();
    const milestone=plan&&plan.v15Decision&&plan.v15Decision.evidence&&plan.v15Decision.evidence.completionMilestone||'';
    if(roundNow<=7||milestone==='firstRare'&&roundNow<=19)return{key:'p1',num:'①',label:'첫 희귀',question:'어떤 희귀를 만들까',due:{round:7,label:'7라 미션 마감'}};
    if(roundNow<=19||milestone==='firstFinal'&&roundNow<=29)return{key:'p2',num:'②',label:'첫 전설',question:'어떤 전설을 만들까',due:{round:20,label:'20라 보스'}};
    if(roundNow<=29)return{key:'p3',num:'③',label:'덱 방향',question:'보유 희귀를 전부 쓰는 방향은',due:{round:30,label:'30라 방향 확정'}};
    if(roundNow<=39)return{key:'p4',num:'④',label:'상위+전설',question:'상위 1 + 전설 1, 바제스 미션',due:{round:40,label:'40라 구간 마감'}};
    if(roundNow<=50)return{key:'p5',num:'⑤',label:'덱 완성',question:'클리어 스펙에서 뭐가 비었나',due:{round:50,label:'50라 클리어 스펙'}};
    return{key:'p6',num:'⑥',label:'신세계',question:'모은 흔함을 뭘로 바꿀까',due:null};
  }
  v215PlanBlock(state,plan){
    // v21.5(사용자: "상위를 정하면 어떤 희귀 2개로 이걸 만들고를 알려주고,
    // 활용 못할 희귀는 리롤로 추천"): 원장 행(use/hold/reroll + 목적지가
    // 담긴 reason)을 희귀별 사용 계획 목록으로 승격한다 — 전량 활용이
    // 목표고, 사용처가 없는 희귀만 리롤 추천으로 표시된다.
    // v22.0: 국면 ③ 패널과 남는 희귀 서랍이 같이 쓰도록 추출.
    const decision=plan.v15Decision||{},ledger=decision.rare||{},rows=Array.isArray(ledger.rows)?ledger.rows:[],upperChosen=!!this.upperLock();
    const planRows=upperChosen?rows.filter(row=>C.num(row.initial)>0).map(row=>{
      const isReroll=C.num(row.reroll)>0&&C.num(row.use)<=0,kind=isReroll?'reroll':C.num(row.use)>0?'use':'hold';
      return`<div class="v215-plan-row ${kind}"><b>${C.esc(row.name)}${C.num(row.initial)>1?` ×${C.num(row.initial)}`:''}</b><i>${isReroll?'리롤 추천':kind==='use'?'사용':'보류'}</i><span>${C.esc(String(row.reason||''))}</span></div>`;
    }).join(''):'';
    return planRows?`<div class="v215-rare-plan"><small>희귀 사용 계획 — 전량 활용, 남는 것만 리롤</small>${planRows}</div>`:'';
  }
  v221UpperMaterials(state){
    // v22.1(사용자: "상위를 정했을 때 그 상위에 들어가는 희귀함은 따로
    // 알려줘야할 것 같아"): 확정 상위 레시피의 희귀·특별 재료를 보유(소모
    // 예정)/제작 필요로 나눠 항상 보이게 한다.  0809 판은 코치 추천이
    // 료쿠규의 유일 희귀 재료 킨에몬을 소모하는 제작이었다 — 재료가
    // 이름으로 보이면 사용자도 코치도 그 실수를 잡을 수 있다.
    const lock=this.upperLock();if(!lock||!state||!state.db)return null;
    const unit=state.db.byId.get(lock.id);if(!unit)return null;
    let solve=null;try{solve=C.recipeSolve(state.db,lock.id,state.counts||{});}catch(_){return null;}
    if(!solve)return null;
    const name=id=>C.materialName(state.db,id);
    const use=Object.entries(solve.rareUse||{}).filter(([,count])=>C.num(count)>0).map(([id,count])=>({id,name:name(id),count:C.num(count)}));
    const specialUse=Object.entries(solve.specialUse||{}).filter(([,count])=>C.num(count)>0).map(([id,count])=>({id,name:name(id),count:C.num(count)}));
    const build=Object.entries((solve.buildNeeded||{}).rare||{}).map(([id,count])=>({id,name:name(id),count:C.num(count)}));
    const hard=(solve.hardMissing||[]).map(entry=>({id:String(entry.id||''),name:String(entry.name||entry.id||''),count:C.num(entry.count)||1}));
    return{upperName:displayNameOf(unit),upperId:unit.id,use,specialUse,build,hard,wispCost:C.num(solve.wispCost),wispHave:C.num(state.wisp)};
  }
  v221UpperMaterialsBlock(state){
    const mats=this.v221UpperMaterials(state);if(!mats)return'';
    const chip=(item,kind)=>`<em class="${kind}">${C.esc(item.name)}${item.count>1?` ×${item.count}`:''}</em>`;
    const wispShort=Math.max(0,mats.wispCost-mats.wispHave);
    return`<div class="v221-upper-mats"><small>확정 상위 <b>${C.esc(mats.upperName)}</b>에 들어가는 재료 — 아래 희귀·특별은 다른 데 쓰면 상위가 멀어집니다</small><div>${mats.use.map(item=>chip(item,'use')).join('')}${mats.specialUse.map(item=>chip(item,'use')).join('')}${mats.build.map(item=>chip(item,'build')).join('')}${mats.hard.map(item=>chip(item,'hard')).join('')}${!mats.use.length&&!mats.specialUse.length&&!mats.build.length&&!mats.hard.length?'<em class="none">희귀 소모 없음 — 흔함·위습만으로 완성</em>':''}</div><span class="v221-upper-wisp ${wispShort>0?'short':'ok'}">${wispShort>0?`선택위습 ${wispShort}개 부족 (보유 ${mats.wispHave}/필요 ${mats.wispCost}) — 모으면 됩니다`:`선택위습 충분 (보유 ${mats.wispHave}/필요 ${mats.wispCost}) — 지금 올릴 수 있는지 카드를 확인하세요`}</span></div>`;
  }
  v221StoryBlock(){
    // v22.1(사용자: "스토리가 35라 전에 13까지 밀려야하는데 안밀려서
    // 죽었어" · 0809): TMO 데이터에 스토리 단계가 없어 수동 스텝퍼로
    // 받는다.  마감선 — 30라 스토리 10(보상 시점) · 35라 스토리 13(사용자
    // 실측).  상위가 스토리 담당이므로 뒤처지면 상위 완성부터 다그친다.
    const roundNow=this.actualRound(),stage=Math.max(0,C.num(this.state.storyStage));
    if(roundNow<8||roundNow>50)return'';
    const marks=[{round:30,stage:10,label:'30라 · 스토리 10 (보상)'},{round:35,stage:13,label:'35라 · 스토리 13 (실측 최소선)'}];
    const next=marks.find(mark=>roundNow<=mark.round)||marks[marks.length-1];
    const behind=stage<next.stage&&roundNow>=next.round-3;
    const late=stage<next.stage&&roundNow>=next.round;
    const upperMissing=!this.upperLock();
    return`<div class="v221-story ${late?'late':behind?'behind':''}"><small>스토리 진행 — 상위가 담당 · ${C.esc(next.label)}</small><div class="v221-story-row"><button data-act="story-stage-step" data-delta="-1" aria-label="스토리 단계 내리기">−</button><b>${stage}단계</b><button data-act="story-stage-step" data-delta="1" aria-label="스토리 단계 올리기">＋</button><span>${late?`마감선 지남 — ${next.stage}단계까지 ${next.stage-stage} 남음${upperMissing?' · 스토리 담당(상위)이 아직 없습니다':''}`:behind?`${next.round}라까지 ${next.stage}단계 — ${next.stage-stage} 남음, 서둘러야 합니다`:stage>=next.stage?'페이스 정상':`${next.round}라까지 ${next.stage}단계 목표`}</span></div></div>`;
  }
  renderV22PhasePanel(state,plan){
    // v22.0 국면 패널 — 명세서의 그 국면 목표만.  전체 스펙 표는 어느
    // 국면에서든 접힌 폴드로 접근 가능(정보를 지우는 게 아니라 미룬다).
    const ph=this.v22Phase(plan),decision=plan.v15Decision||{},roundNow=this.actualRound();
    const milestone=decision.evidence&&decision.evidence.completionMilestone||'';
    const fullSpec=`<details class="v22-spec-fold"><summary>전체 스펙 표 펼치기</summary>${this.renderV153Spec(state,plan)}</details>`;
    const goal=(done,text)=>`<div class="v22-goal ${done?'done':'open'}"><i>${done?'✓':'!'}</i><span>${text}</span></div>`;
    const gauges=()=>{
      const rows=((this.observedDeficits(plan)||{}).clearRows||[]).filter(row=>row.required!==false&&!row.waived);
      if(!rows.length)return'<p class="v22-note">스펙 판독 대기 — TMO 동기화를 확인하세요.</p>';
      const bar=row=>{
        const target=Math.max(C.num(row.target),0.0001),current=Math.max(0,C.num(row.current)),pct=Math.max(4,Math.min(100,Math.round(current/target*100))),miss=C.num(row.gap)>0;
        return`<div class="v22-gauge${miss?'':' done'}"><label><span>${C.esc(row.key==='control'?'제어력':row.label)}</span><b class="${miss?'miss':''}">${fmt(current)} / ${fmt(row.target)}</b></label><div class="v22-bar"><i class="${miss?(pct>=70?'warn':'bad'):'ok'}" style="width:${pct}%"></i></div></div>`;
      };
      const open=rows.filter(row=>C.num(row.gap)>0),closed=rows.filter(row=>C.num(row.gap)<=0);
      return`<div class="v22-gauges">${open.map(bar).join('')}${closed.map(bar).join('')}</div>`;
    };
    if(ph.key==='p1')return`${goal(milestone!=='firstRare','7라 전 희귀 1 → 흔한 선택위습 보상')}${goal(false,this.state.storyRushAbandoned?'스토리 포기됨 — 최저 선위 전용':'스토리 S급이면 최대 2선위까지 투자, 아니면 최저 선위')}${this.v225StoryRushButton()}<p class="v22-note">다음 국면(첫 전설)은 희귀 완성 즉시 자동 전환됩니다.</p>${fullSpec}`;
    if(ph.key==='p2')return`${goal(milestone!=='firstRare'&&milestone!=='firstFinal','20라 보스 전 전설급 1')}${milestone==='firstRare'?goal(false,'첫 희귀가 아직입니다 — 이것부터'):''}${goal(false,this.state.storyRushAbandoned?'스토리 포기됨 — 최저 선위 전용':'S급이 최대 5선위 안이면 투자, 아니면 최저 선위')}${this.v225StoryRushButton()}${this.v221UpperMaterialsBlock(state)}${this.v221StoryBlock()}${fullSpec}`;
    if(ph.key==='p3'){
      const auto=decision.routeAuto&&decision.routeAuto.adopted?`<p class="v22-note">방향 자동 채택: <b>${C.esc(decision.routeAuto.label||'')}</b> — 상위 확정·저격으로 언제든 바꿀 수 있습니다.</p>`:'<p class="v22-note">방향은 클리어 실측 순으로 자동 채택됩니다 — 8라 스토리·고급 도박 희귀 유입 후가 정확합니다.</p>';
      return`${this.v221UpperMaterialsBlock(state)}${this.v215PlanBlock(state,plan)||'<p class="v22-note">상위가 정해지면 보유 희귀별 사용 계획(전량 소비·잉여 리롤)이 여기 뜹니다.</p>'}${auto}${this.v221StoryBlock()}${fullSpec}`;
    }
    if(ph.key==='p4'){
      const upperChosen=!!(plan.upper||this.upperLock());
      const db=state&&state.db,legendOwned=!!(db&&Object.entries(state.counts||{}).some(([id,count])=>C.num(count)>0&&(unit=>unit&&C.isLegendish(unit))(db.byId.get(id))));
      return`${goal(upperChosen,'상위 1 확보 — 스토리 담당')}${goal(legendOwned,'전설급 1 확보 — 라인 방어')}${goal(false,'바제스 미션(30~40라) — 보라 배지 유닛 확인')}${this.v221UpperMaterialsBlock(state)}${this.v221StoryBlock()}${gauges()}${fullSpec}`;
    }
    if(ph.key==='p5')return`${this.v221UpperMaterialsBlock(state)}${this.v221StoryBlock()}${gauges()}${fullSpec}`;
    const singleEnd=String(this.state.magicRoute||'')==='singleEnd';
    return`${goal(false,singleEnd?'단끝 덱 — 유닛 추가 제작 자제, 컨트롤이 클리어를 좌우':'흔함 위습을 끌어모아 전설급 또는 스펙 희귀로 환원')}<p class="v22-note">명세 ⑥ — 55·60·65라 보스만 통과하면 종결입니다.</p>${gauges()}${fullSpec}`;
  }
  // v17.8(사용자 요청 2): 1번 패널의 빈 공간을 판단에 쓰이는 실측
  // 데이터로 채운다 — 다음 마감 체크포인트, 다음 보스 카운트다운,
  // 리롤 잔여(로그 A에서 리롤 0/2 미사용으로 13라운드 HOLD), 선위 보유.
  v151ActionFacts(state,decision){
    const chips=[];
    // v18: 국면·마감·보스·위습 칩이 여기 살았다.  v22.0(사용자: "필요한
    // 정보만 간추려서"): 그 넷은 상단 스트립(국면 칩 + 최근접 마감)과
    // 상태줄 선위 필로 흡수됐다 — 카드에는 카드에서만 알 수 있는 것만
    // 남긴다: 리롤 잔여(안전 리롤 권장 대상 포함)와 진행 중이던 것.
    const rerollLeft=Math.max(0,this.rerollLimit()-C.num(this.state.rerollsUsed));
    const safeReroll=decision.rare&&decision.rare.safeReroll;
    chips.push(`<span class="${rerollLeft>0&&safeReroll?'warn':''}"><small>리롤 잔여</small><b>${rerollLeft}/${this.rerollLimit()}</b><em>${safeReroll?`${C.esc(safeReroll.name)} 권장`:rerollLeft?'소비 가능 자원':'소진'}</em></span>`);
    // v18.2: 순위가 바뀌어도 직전에 만들던 것이 여전히 유효하면 그렇게
    // 말해 준다.  사용자가 겪는 문제는 순위 변동 자체가 아니라 "만들던
    // 걸 버려야 하나"를 모르는 것이다.
    const cont=decision.continueOption;
    const contHtml=cont?`<div class="v151-continue"><small>진행 중이던 것</small><b>${C.esc(cont.name)}</b><i>선위 ${C.num(cont.wispCost)}</i><span>지금 순위 1위는 아니지만 ${cont.closes.map(row=>C.esc(row.label)).join('·')}을(를) 여전히 닫습니다 — 만들던 것을 그대로 끝내도 손해가 아닙니다.</span></div>`:'';
    return`${contHtml}<div class="v151-action-facts">${chips.join('')}</div>`;
  }
  renderV151NextAction(state,plan,health){
    const decision=plan.v15Decision||{},branch=plan.postLegendDecision||{},status=decision.state||'SYNC_BLOCKED';
    if(!health.ready){
      // v19.8(사용자 요청 ①): 판단 잠금 상태가 화면 절반을 빈 공간으로
      // 남겼다 — 마지막 유효 패 기준 남은 결손과 회복 목표를 채워, 스캔이
      // 끊겨도 "무엇이 모자랐는지"는 계속 보인다.
      const lastRows=((this.observedDeficits?this.observedDeficits(plan):plan&&plan.deficits)||{}).clearRows||[];
      const lastChips=lastRows.filter(row=>C.num(row.gap)>0).slice(0,5).map(row=>`<span><b>${C.esc(row.key==='control'?'제어력':row.label)}</b><em>부족 ${fmt(row.gap)}</em></span>`).join('');
      const recoveryHtml=this.renderV151Recovery(decision,'HOLD',state);
      // v23.2(0816): 신세계 한복판에서 수신이 끊기자 카드가 통째로 배너로
      // 바뀌어 실행할 것이 사라졌다.  마지막 유효 추천을 회색 고스트로
      // 유지한다 — 승인은 잠긴 채(포인터 차단 + 위임 핸들러 가드), 무엇을
      // 하려던 중이었는지는 계속 보이게.
      const ghost=this._lastReadyActionCard;
      const ghostHtml=ghost?`<div class="v23-ghost-card" aria-disabled="true"><small>마지막 유효 추천 · ${Math.max(0,Math.floor((Date.now()-C.num(ghost.at))/1000))}초 전 패 기준 — 수신 재개 전 승인 잠김</small>${ghost.html}</div>`:'';
      return`<div class="v151-action blocked"><span class="v151-state">판단 잠금</span><div class="v151-action-copy"><i>!</i><div><b>${C.esc(health.label)}</b><p>${C.esc(health.note||'TMO 현재 패를 다시 읽어 주세요.')}</p></div></div><div class="v151-inline-actions"><button class="primary" data-act="connection">TMO 다시 읽기</button>${health.key==='waiting'?'<button data-act="accept-snapshot">현재 보이는 패로 계속</button>':''}</div>${lastChips?`<div class="v158-blocked-spec"><small>마지막 유효 패 기준 · 남은 필수 결손</small><div>${lastChips}</div></div>`:''}${ghostHtml}${recoveryHtml}</div>`;
    }
    if(branch.awaiting)return`<div class="v151-action choice"><span class="v151-state">사용자 선택 필요</span><b class="v151-action-title">첫 전설 뒤 진행 방향</b><p>한 기를 더 만들지, 메인 상위를 준비할지 선택하면 즉시 다시 계산합니다.</p><div class="v151-inline-actions"><button data-act="post-legend-route" data-value="legend">전설·히든 하나 더</button><button class="primary" data-act="post-legend-route" data-value="upper">상위 준비</button></div></div>`;
    if(status==='ROUTE_CHOICE'){
      // v17.8: 두 실전 로그 모두 방향 선택을 10라운드 이상 미뤘다 —
      // 대기 중에는 제작·리롤이 잠긴다는 비용을 명시하고, 상위 2개
      // 후보를 바로 이 자리에서 확정할 수 있게 한다.
      const quick=(decision.routeCandidates||[]).slice(0,2),canConfirm=true;
      // v19.2(사용자 요청): "물딜 가려다가 마딜로 바꿔서" — 계통 전환으로
      // 해제된 확정 상위가 있고 지금 그 계통으로 돌아와 있으면, 후보를 다시
      // 훑을 필요 없이 원클릭으로 되돌릴 수 있게 최상단에 보여준다.
      const releasedActive=this.activeReleasedUpperHint(),restoreHtml=releasedActive?`<div class="v151-route-restore"><b>${C.esc(displayNameOf(releasedActive.unit))} 확정이 계통 전환으로 방금 해제됐습니다</b><small>${C.esc(modeLabel(this.state.mode))}로 돌아왔습니다 — 처음부터 다시 고르지 않아도 됩니다.</small><button class="primary" data-act="restore-released-upper">다시 확정</button></div>`:'';
      // v18: 방향 확정은 25라부터라는 규칙(v17.12)은 그대로 두되, 그
      // 전까지 화면을 비워 두지 않는다.  첫 클리어 로그에서 이 카드는
      // r16~r32 열일곱 라운드 동안 "상위 선택 필요"만 띄웠다 — 확정
      // 버튼은 25라 전이라 잠겨 있거나 워커 평가가 안 끝나 눌리지 않았고,
      // 그동안 무엇을 모아야 하는지는 아무 데도 없었다.  엔진은 이미
      // 알고 있다(coachAction).  기다리는 시간에도 할 일을 준다.
      const waitCoach=decision.confidence&&decision.coachAction?`<div class="v151-route-wait"><em class="v151-confidence lv-${C.esc(decision.confidence.key)}">${C.esc(decision.confidence.level)}</em><b>${C.esc(decision.coachAction.name||'')}</b>${C.num(decision.coachAction.wispCost)?`<i>선위 ${C.num(decision.coachAction.wispCost)}</i>`:''}<small>${C.esc(decision.confidence.note||'')}</small></div>`:'';
      const quickHtml=quick.length?`<div class="v151-route-quick">${quick.map((row,index)=>{const ready=routeCandidateReady(row),enabled=canConfirm&&ready;return`<div><span><b>${index+1}. ${C.esc(row.name)}</b><small>${C.esc(row.routeLabel||'')} · 선위 ${C.num(row.wispCost)}${C.num(row.wispGap)>0?` (부족 ${C.num(row.wispGap)})`:''}</small></span><button class="primary" data-act="choose-direction" data-key="${C.esc(row.routeKey)}" data-id="${C.esc(row.id)}" ${enabled?'':'disabled aria-disabled="true"'}>${ready?'확정':'파티 평가 중'}</button></div>`;}).join('')}</div>`:'';
      // v17.12: 최근 3판 모두 방향 선택을 25라+ 미뤘다(마지막 판 25라 대기)
      // — 확정 가능 라운드부터는 대기 비용을 긴급 톤으로 명시한다.
      return`<div class="v151-action choice${canConfirm?' urgent':''}"><span class="v151-state">상위 선택 필요${canConfirm?' · 지금 확정 가능':''}</span><b class="v151-action-title">${C.esc(decision.label||'메인 상위 방향 선택')}</b><p>${C.esc(decision.reason||'아래 상위 정보에서 현재 패 후보를 비교하세요.')} 선택 전에는 제작·리롤이 잠깁니다.${canConfirm?' 이미 확정 가능한 라운드입니다 — 미룰수록 잠금 비용만 쌓입니다.':''}</p>${restoreHtml}${waitCoach}${quickHtml}<span class="v151-jump-note">④ 상위·파티 특징에서 전체 후보를 비교할 수 있습니다.</span>${this.v151ActionFacts(state,decision)}</div>`;
    }
    // v18: 승인(action)이 없어도 카드는 비지 않는다.  엔진이 coachAction을
    // 항상 채우고 확신 등급을 같이 준다 — 확정/유력/차선/운영.  버튼은
    // 아래에서 여전히 decision.action 에만 열리므로 승인 권한은 그대로다.
    const coach=decision.confidence||null,coachStep=decision.coachAction||null;
    const shown=decision.action||decision.blockedAction||coachStep||null,reroll=decision.rare&&decision.rare.safeReroll,unit=shown&&shown.unit||reroll&&reroll.unit||null;
    // v19.9(개선 ②): 추천 카드에 오른 유닛은 수동 제작 경고 대상에서 제외한다.
    if(shown&&shown.id)(this._v199RecommendedIds||(this._v199RecommendedIds=new Map())).set(String(shown.id),Date.now());
    const target=status==='REROLL_ONE'&&reroll?`${reroll.name} 1장 리롤`:shown&&shown.name||decision.label||'현재 패 소비 보류',waivedKeys=new Set(((decision.assessment||{}).requirements||[]).filter(row=>row.waived).map(row=>row.key)),deltas=(shown&&shown.deltas||[]).filter(row=>!waivedKeys.has(row.key)&&(Math.abs(C.num(row.delta))>.001||row.closed)).slice(0,3),cost=shown?C.num(shown.wispCost):0,after=shown&&shown.wispAfter!=null?C.num(shown.wispAfter):C.num(state.wisp),button=status==='ACT_NOW'&&decision.action?`<button class="primary" data-act="mark-made" data-step="0" data-id="${C.esc(decision.action.id)}">제작함 · TMO 확인</button>`:status==='REROLL_ONE'&&reroll?`<button class="primary danger" data-act="reroll-confirmed" data-id="${C.esc(reroll.id)}">1장 리롤함</button>`:status==='SYNC_BLOCKED'?`<button data-act="connection">TMO 다시 읽기</button>${this.state.pendingTransaction?'<button data-act="dismiss-transaction">거래 취소 · TMO 현재값 사용</button>':''}${this.state.pendingReroll?'<button data-act="cancel-reroll">리롤 대기 해제</button>':''}`:'<button disabled>지금은 재료 보존</button>',stop=shown&&shown.stopCondition?shown.stopCondition:status==='PREPARE'?'재료나 선위가 달라지면 실행하지 않습니다.':'패가 바뀌면 먼저 다시 읽습니다.';
    // v21.6(0808 포렌식): 두 판 연속 43라 사망 — 마감 유닛이 8~13라운드
    // "제작 가능" 상태로 방치됐고, 죽는 순간 위습 14·19개가 남아 있었다.
    // 기존 스킵 추적(v19.9)은 상태가 잠깐 튀기만 해도 초기화돼 절박함이
    // 누적되지 못했다.  제작 가능 목격 원장은 이제 다른 카드가 끼어들어도
    // 유지되고(같은 유닛이 비실행 상태로 목격될 때만 리셋), 방치가 길어지면
    // 카드 전체를 격상한다.  덤으로 40라+ 위습 사재기와 사망 후 관전 동결
    // (1판 43~65라, 22라운드 헛돈 추천)도 여기서 감지한다.
    const v216=(()=>{
      const roundNow=this.actualRound();
      const ledger=this._v216FeasibleSince||(this._v216FeasibleSince=new Map());
      if(roundNow<C.num(this._v216MaxRound)-2){ledger.clear();this._v216FreezeSig='';this._v216FreezeRound=0;this._v216FreezeCount=0;this._v216MaxRound=0;}
      this._v216MaxRound=Math.max(C.num(this._v216MaxRound),roundNow);
      const actId=status==='ACT_NOW'&&decision.action?String(decision.action.id||''):'';
      if(actId){if(!ledger.has(actId))ledger.set(actId,roundNow);}
      else if(shown&&shown.id&&ledger.has(String(shown.id)))ledger.delete(String(shown.id));
      const idle=actId?roundNow-C.num(ledger.get(actId))+1:0;
      const gaps=((decision.assessment||{}).requirements||[]).filter(row=>row.required!==false&&!row.waived&&C.num(row.gap)>0);
      const sig=`${C.num(state.wisp)}|${Object.values(state.counts||{}).reduce((sum,n)=>sum+C.num(n),0)}|${gaps.map(row=>`${row.key}:${fmt(row.gap)}`).join(',')}`;
      if(roundNow!==C.num(this._v216FreezeRound)){this._v216FreezeCount=sig===this._v216FreezeSig?C.num(this._v216FreezeCount)+1:0;this._v216FreezeSig=sig;this._v216FreezeRound=roundNow;}
      const frozen=roundNow>40&&C.num(this._v216FreezeCount)>=3?C.num(this._v216FreezeCount):0;
      const hoard=roundNow>=40&&gaps.length&&status==='ACT_NOW'&&shown&&C.num(state.wisp)>=C.num(shown.wispCost)?{have:C.num(state.wisp),cost:C.num(shown.wispCost)}:null;
      return{roundNow,idle,critical:idle>=5||roundNow>=38&&idle>=2,frozen,hoard};
    })();
    return`<div class="v151-action ${C.esc(status.toLowerCase())}${v216.critical?' v216-urgent':''}" data-state="${C.esc(status)}">${status==='HOLD'?'<div class="v1915-hold-banner">이 카드는 지금 만들라는 추천이 아닙니다 — 필수 역할을 지키기 위해 <b>보류</b>된 후보입니다. 사유와 회복 목표를 먼저 확인하세요.</div>':''}${(()=>{
      // v20.2: 제작 진행 중 잠금이 걸려 있으면 그 사실을 카드에 명시한다 —
      // "왜 안 바뀌지"도 "왜 바뀌지"만큼 혼란스럽다.  엔진의 이번 1순위가
      // 다르면 그것도 같이 말해 사용자가 스스로 바꿀 수 있게 한다.
      const lock=decision&&decision.craftLock;if(!lock||!lock.held)return'';
      return`<div class="v202-craft-lock"><b>제작 진행 중 — 지금 할 일을 고정했습니다</b><small>${C.esc(lock.name||'')}${C.num(lock.wispShort)>0?` · 선택 위습 ${C.num(lock.wispShort)}개 더 필요`:''} — 완성하거나 다른 것을 만들면 자동으로 풀립니다.${lock.alternative?` (엔진 1순위는 ${C.esc(lock.alternative)})`:''}</small>${lock.guard?`<small class="v202-lock-guard">${C.esc(lock.guard)}</small>`:''}</div>`;
    })()}${(()=>{
      // v20.3: 회귀가 있는데도 우선순위상 승인한 경우, 무엇이 얼마나
      // 나빠지는지를 반드시 함께 보여 준다.  통과시킨 것과 "괜찮다"고 하는
      // 것은 다르다 — 열리는 역할을 열린다고 말한 뒤 승인하는 것이다.
      const action=decision&&(decision.action||decision.blockedAction),reg=action&&action.regression;
      if(!reg||!(reg.rows||[]).length)return'';
      return`<div class="v203-regress-warn"><b>${C.esc(reg.headline||'')}</b><small>${C.esc(reg.detail||'')}</small></div>`;
    })()}<div class="v151-action-main">${unit&&unit.image?`<img src="${C.esc(unit.image)}" alt="">`:'<i>→</i>'}<div><span class="v151-state">${coach?`<em class="v151-confidence lv-${C.esc(coach.key)}">${C.esc(coach.level)}</em>`:''}${coachStep&&coachStep.affordable===false&&C.num(coachStep.wispShort)>0?`<em class="v151-confidence lv-short">선위 ${C.num(coachStep.wispShort)} 부족</em>`:''}${decision.continueOption?`<em class="v151-confidence lv-continue">진행 중이던 것도 유효</em>`:''}${decision.routeAuto&&decision.routeAuto.adopted?`<em class="v151-confidence lv-continue" title="엔진이 클리어 실측 순 1위 방향을 자동 채택했습니다. 방향판·상위 확정으로 언제든 바꿀 수 있습니다.">방향 자동 · ${C.esc(decision.routeAuto.label||'')}</em>`:''}${C.esc({ACT_NOW:'지금 실행',PREPARE:'재료 보호',HOLD:'소비 보류',REROLL_ONE:'안전 리롤',SYNC_BLOCKED:'확인 대기',ROUTE_CHOICE:'상위 방향 확정 필요'}[status]||'다음 판단')}</span><b class="v151-action-title">${C.esc(target)}${this.v224PctChip(state,unit)}${this.v151StoryTag(unit)}${this.v216BargesTag(unit)}</b><p>${C.esc(decision.reason||'현재 패에서 안전한 다음 행동을 기다립니다.')}</p></div>${shown?`<div class="v151-cost"><small>선위</small><b>${cost}</b><span>${status==='PREPARE'?'필요':`후 ${after}`}</span></div>`:''}</div>${deltas.length?`<div class="v151-deltas">${deltas.map(row=>{
      // v18.4(목업): 인라인 알약 대신 "무엇이 얼마나 오르는가" 타일.
      const ic=/스턴/.test(row.label)?'blade':/이감|둔화/.test(row.label)?'target':/방깎|방어/.test(row.label)?'snow':/보잡|보스/.test(row.label)?'skull':'gear';
      return`<span>${this.v153Icon(ic)}<small>${C.esc(row.label)}</small><b>${fmt(row.before)}<i>→</i>${fmt(row.after)}</b></span>`;
    }).join('')}${shown?`<span class="wisp">${this.v153Icon('spiral')}<small>선위</small><b>${cost}</b></span>`:''}</div>`:''}${decision.upperReserve?`<div class="v151-upper-guard"><i>🔒</i>확정 상위 <b>${C.esc(decision.upperReserve.name)}</b> 트리 재료 ${C.num(decision.upperReserve.reservedUnits)}개 잠금 · 선위 ${C.num(decision.upperReserve.wispCost)} 필요(부족 ${C.num(decision.upperReserve.wispShort)}) — 잠긴 재료를 빼고 추천 중${decision.upperReserve.storyRewardNeeded?' · 스토리 10 보상에서 레일리+해적선을 선택해야 열립니다':''}</div>`:''}${(()=>{
      // v19.9(개선 ①): 0731 판은 승인된 레베카·쵸파 카드를 여러 라운드
      // 건너뛰어 방깎 -29로 끝났다.  같은 승인 카드가 다음 라운드에도 실행되지
      // 않고 남아 있으면 마감 역산과 함께 경고한다(표시 전용 · 승인은 그대로).
      // v21.6(0808 포렌식): 방치 라운드는 위의 목격 원장(v216)이 센다 —
      // 다른 카드가 잠깐 끼어들어도 초기화되지 않는다.
      if(v216.frozen)return`<div class="v216-freeze-note">${this.v153Icon('warn')}<span><b>${v216.frozen+1}라운드째 패·위습·결손이 그대로입니다</b> — 라운드만 흐르고 있습니다. 전멸 후 관전 중이라면 <button data-act="run-result-open">게임 결과</button>를 기록하세요. 0808 1판은 사망 뒤 22라운드 동안 추천이 헛돌았습니다.</span></div>`;
      if(v216.idle<2)return'';
      const checkpoint=(decision.assessment||{}).checkpoint||null,due=checkpoint?C.num(checkpoint.dueRound):0,left=due>v216.roundNow?due-v216.roundNow:0;
      return`<div class="v159-skip-warn${v216.critical?' v216-critical':''}">${this.v153Icon('warn')}<span><b>이 승인 카드가 ${v216.idle}라운드째 실행되지 않았습니다</b> — ${checkpoint?`${C.esc(checkpoint.label)} 마감 ${due}라${left?`까지 ${left}라`:' 초과'}`:'마감 역산 대기'} · ${v216.critical?'0808 두 판 모두 이 지연(마감 유닛 8·13라운드 방치)이 사인이었습니다':'승인 스킵은 0731 판 방깎 -29의 원인이었습니다'}.</span></div>`;
    })()}${v216.hoard&&!v216.frozen?`<div class="v216-hoard-warn">${this.v153Icon('spiral')}<span>선택위습 <b>${v216.hoard.have}</b> 보유 — 이 마감 비용 <b>${v216.hoard.cost}</b>. 40라 이후 필수 결손을 열어둔 채 아끼는 위습은 0808 두 판(14·19개 미사용 사망)의 사인입니다.</span></div>`:''}${(()=>{
      // v17.4: 55라 도플라밍고 2연속 사망 — 생존 조각은 닫히는데 보스
      // 화력 역할(단일·끝딜·1.5스턴·토키)이 열린 채 보스전에 들어가는
      // 것을 라운드 중에 경고한다.  46라부터 다음 보스와 열린 화력
      // 결손을 빨간 띠로 상시 표시.
      const roundNow=this.actualRound();
      if(roundNow<46)return'';
      const bossKeys=new Set(['single','end','singleEndExpected','attack','toki','stunFull']);
      const openBoss=((decision.assessment||{}).requirements||[]).filter(row=>row.required!==false&&!row.waived&&bossKeys.has(row.key)&&C.num(row.gap)>0);
      if(!openBoss.length)return'';
      const nextBoss=[50,55,60,65].find(r=>r>=roundNow);
      if(!nextBoss)return'';
      const preview=C.bossPreview?C.bossPreview(nextBoss,this.state.gorosei):null;
      const gaps=openBoss.slice(0,3).map(row=>`${row.label} ${fmt(row.gap)} 부족`).join(' · ');
      return`<div class="v151-boss-warn"><i>⚠</i><b>${nextBoss}라 ${C.esc(preview&&preview.boss||'보스')}까지 ${nextBoss-roundNow}라</b> — ${C.esc(gaps)} · 보스 화력 역할을 생존 조각보다 먼저 닫으세요</div>`;
    })()}${(()=>{
      // v17.3(사용자 요청): 재료 팝업을 열지 않아도 "부족 최하위 재료 =
      // 선택위습 N"과 "바로 필요한 조합 재료"가 카드에 바로 보인다.
      // 대안 목록은 이 패널에서 제거(2번 패널이 대신 담당).
      // v19.7(사용자 요청): "지금 할 일에서 어떤 어떤 흔함이 부족한지 나오게
      // 해줘" — quote 가 없는 상태(대기·보류)에서도 흔함 부족을 직접 계산해
      // 색점 칩으로 전부 보여준다(상위 4개 절단 제거, 최대 8종).
      let solve=shown&&shown.quote&&shown.quote.solve||null;
      if(!solve&&shown&&shown.id&&state&&state.db){try{solve=C.recipeSolve(state.db,shown.id,state.counts||{});}catch(_){solve=null;}}
      // v19.9.2(사용자 요청 "조합이 지금 할 일에도 떴으면"): 엔진 견적의
      // solve 에는 direct(직접 조합식)가 없는 경우가 있어 조합 줄이 통째로
      // 빠졌다 — 없으면 레시피를 직접 풀어 채운다.
      if(solve&&!(solve.direct||[]).length&&shown&&shown.id&&state&&state.db){try{const fresh=C.recipeSolve(state.db,shown.id,state.counts||{});if((fresh.direct||[]).length)solve=Object.assign({},solve,{direct:fresh.direct});}catch(_){}}
      if(!solve)return'';
      // v19.9.2(사용자 요청): 제작 카드와 같은 "조합 · A + B" 형식 — 능력치
      // 주석 없이 이름만, 보유 충족 여부는 색으로.
      const direct=(solve.direct||[]).slice(0,6).map(item=>{const need=Math.max(1,C.num(item.count));return`<em class="${C.num(item.owned)>=need?'ok':'gap'}">${C.esc(recipeNameOf(C.materialName(state.db,item.id)))}${need>1?`×${need}`:''}</em>`;}).join('<i class="v159-plus">+</i>');
      const lowestEntries=Object.entries(solve.lowestMissing||{}).map(([mid,count])=>({id:mid,name:C.materialName(state.db,mid),count:C.num(count)})).filter(item=>item.count>0).sort((a,b)=>b.count-a.count);
      const lowest=lowestEntries.slice(0,8).map(item=>`<em class="common-chip"><i style="background:${C.COMMON_COLORS[item.name]||'#64748b'}"></i>${C.esc(item.name)} ×${item.count}</em>`).join('');
      const wispCost=shown&&shown.quote&&shown.quote.wisp?C.num(shown.quote.wisp.cost):C.num(solve.wispCost);
      if(!direct&&!lowest)return'';
      return`<div class="v151-mats">${direct?`<div class="v159-action-recipe"><small>조합</small>${direct}</div>`:''}${lowest?`<div class="commons"><small>부족 흔함 ${lowestEntries.length}종 = 선택위습 ${wispCost}</small>${lowest}${lowestEntries.length>8?`<em>외 ${lowestEntries.length-8}종</em>`:''}</div>`:`<div class="commons"><small>부족 흔함</small><em class="ok">${wispCost>0?`흔함 전량 보유 — 선택위습 ${wispCost}만 필요`:'흔함 전량 보유 — 선택위습도 필요 없음'}</em></div>`}</div>`;
    })()}${(()=>{
      // v19.8(포렌식 ④): 0731 판 r19 — 센고쿠 승인이 유일한 광보잡 희귀
      // (아카이누)를 재료로 소진했고 경고가 없어서 광보잡 2가 영영 안
      // 닫혔다.  승인 제작이 "열린 생존 결손을 직접 가진 희귀"를 소모하면
      // 카드에서 바로 경고한다(표시 전용 — 승인 자체는 막지 않는다).
      const solve=shown&&shown.quote&&shown.quote.solve;
      if(!solve||!state||!state.db)return'';
      const openRows=((this.observedDeficits(plan)||{}).clearRows||[]).filter(row=>C.num(row.gap)>0);
      if(!openRows.length)return'';
      const openKeys=new Set(openRows.map(row=>row.key));
      const warns=[];
      for(const [mid,useCount] of Object.entries(solve.rareUse||{})){
        if(C.num(useCount)<=0)continue;
        const material=state.db.byId.get(mid);if(!material)continue;
        const role=C.roleProfile(material),hits=[];
        if(openKeys.has('bossFrenzy')&&(role.boss||role.frenzy))hits.push('광보잡');
        if((openKeys.has('stunFull')||openKeys.has('stunBase'))&&C.num(role.stun)>=0.4)hits.push('스턴');
        if(openKeys.has('armor')&&C.num(role.armor)+C.num(role.triggerArmor)>=15)hits.push('방깎');
        if(openKeys.has('slow')&&C.num(role.slow)>=20)hits.push('이감');
        if(hits.length)warns.push(`${C.materialName(state.db,mid)}(${hits.join('·')})`);
      }
      if(!warns.length)return'';
      return`<div class="v158-consume-warn">${this.v153Icon('warn')}<span>이 제작은 열린 결손을 닫을 수 있는 희귀를 소모합니다 — <b>${C.esc(warns.slice(0,3).join(' · '))}</b>. 그 결손의 다른 마감 수단이 있는지 먼저 확인하세요.</span></div>`;
    })()}${unit&&this.commandInfo(unit).hasVerified?this.renderCommandLine(unit):''}${this.renderV151Recovery(decision,status,state)}${this.v157SecondUpperCallout(state,decision)}${this.v157LongshotHint(state,status)}${this.v151ActionFacts(state,decision)}<div class="v151-action-foot"><small>${C.esc(stop)}</small><div>${shown?`<button data-act="detail" data-id="${C.esc(shown.id)}">재료</button>`:''}${shown&&shown.id&&!(decision.evidence&&decision.evidence.upperFirst)?`<button class="v222-veto" data-act="veto-action" data-id="${C.esc(shown.id)}" title="이번 판에서 이 유닛 추천을 제외합니다 — 새 게임에 초기화">아닌 것 같음 · 넘어가기</button>`:''}${button}</div></div>${(()=>{
      // v22.2(사용자: "아닌 것 같은건 넘어가기"): 넘어간 추천은 항상 보이고
      // 한 번에 되돌릴 수 있다 — 조용한 제외는 "왜 그 유닛이 안 나오지"의
      // 다음 혼란을 만든다.
      const vetoed=(this.state.vetoIds||[]);
      if(!vetoed.length)return'';
      return`<div class="v222-vetoed"><small>넘어간 추천 (이번 판 제외)</small>${vetoed.map(id=>{const vUnit=state.db&&state.db.byId&&state.db.byId.get(id);return`<button data-act="unveto-action" data-id="${C.esc(id)}" title="다시 후보에 포함">${C.esc(vUnit?displayNameOf(vUnit):id)} ×</button>`;}).join('')}</div>`;
    })()}</div>`;
  }

  renderV151Recovery(decision,status,state){
    // The empty action board was the root failure of every recorded loss.
    // Whenever the engine cannot prove a craft, it must still say what to
    // hunt for: the nearest units that close each open required role.
    const recovery=decision&&decision.recovery,targets=recovery&&recovery.targets||[];
    // v19.12(0804 패배): ACT_NOW에서도 회복 목표를 숨기지 않는다 — 단끝
    // 조각이 승인되는 15라운드 내내 이감 노리기 안내가 0이었다.  승인된
    // 행동과 겹치는 목표만 빼고 그대로 보인다.
    if(!targets.length||status==='SYNC_BLOCKED')return'';
    // v19.9.2(사용자 요청 "지금 할 일에도 조합식"): 소비 보류(HOLD) 상태의
    // 지금 할 일은 회복 목표만 보인다 — 목표마다 직접 조합식을 함께 단다
    // (부족: 은 모아야 할 재료, 조합·은 최종 공식).  능력치 주석은 뺀다.
    const recipeFor=row=>{
      if(!state||!state.db||!row||!row.id)return'';
      let solve=null;try{solve=C.recipeSolve(state.db,row.id,state.counts||{});}catch(_){return'';}
      const direct=(solve.direct||[]).slice(0,6);
      if(!direct.length)return'';
      return`<small class="v159-recovery-recipe">조합 · ${direct.map(item=>{const need=Math.max(1,C.num(item.count));return`<b class="${C.num(item.owned)>=need?'owned':'missing'}">${C.esc(recipeNameOf(C.materialName(state.db,item.id)))}${need>1?`×${need}`:''}</b>`;}).join(' <i>+</i> ')}</small>`;
    };
    // v19.9(개선 ②): 회복 목표에 오른 유닛도 추천 이행으로 본다.
    const recommendedIds=this._v199RecommendedIds||(this._v199RecommendedIds=new Map()),nowMs=Date.now();
    for(const row of targets)if(row&&row.id)recommendedIds.set(String(row.id),nowMs);
    // v19.9(개선 ③): 열린 필수 역할의 마감 수단이 하나뿐인데 선위가 크게
    // 부족하면(>8) 조기 적립을 경고한다 — 0731 판 광보잡의 유일 대안
    // 레드포스호(위습 26)가 경고 없이 방치돼 영영 못 닫힌 케이스.
    const byRole=new Map();
    for(const row of targets){const key=String(row&&(row.roleKey||row.roleLabel)||'');if(!key)continue;if(!byRole.has(key))byRole.set(key,[]);byRole.get(key).push(row);}
    const single=[...byRole.values()].filter(list=>list.length===1&&C.num(list[0].wispGap)>8).map(list=>list[0]).slice(0,2);
    const singleHtml=single.map(row=>`<div class="v159-single-closer">${this.v153Icon('warn')}<span><b>${C.esc(row.roleLabel||'역할')}</b>을(를) 닫을 남은 수단이 <b>${C.esc(row.name)}</b> 하나뿐입니다 — 선위 ${C.num(row.wispCost)} 필요(지금 ${C.num(row.wispGap)} 부족). 리롤·판매 선위를 지금부터 여기에 모으세요.</span></div>`).join('');
    const approvedId=String(decision&&decision.action&&decision.action.id||'');
    const shownTargets=targets.filter(row=>String(row&&row.id||'')!==approvedId).slice(0,4);
    const mode=(this.state&&this.state.mode)||'';
    // 계열 주석: 물딜 판에 마딜 계열 유닛이(또는 그 반대) 목표로 오르면
    // 왜 유효한지 한 줄로 답한다.  네코(마딜 전설)가 물딜 판 광보잡
    // 목표로 오른 실사례 — 광보잡·이감은 계열과 무관하게 계산된다.
    const crossNote=row=>{
      // 주석은 부가 정보다 — 정규화 상태를 새로 만들지 않는다(렌더러가
      // 앱 상태에 의존하면 부분 하네스에서 화면 전체가 죽는다).
      const db=state&&state.db,unit=db&&db.byId&&db.byId.get(String(row&&row.id||''));
      if(!unit||!mode)return'';
      const family=C.familyOf(unit);
      if(family==='neutral'||family===mode||C.isUpper(unit))return'';
      return `<small class="v202-cross">${C.esc(family==='magic'?'마딜':'물딜')} 계열이지만 ${C.esc(row.roleLabel||'이 역할')}은 계열과 무관하게 계산됩니다 — ${C.esc(mode==='physical'?'물딜':'마딜')} 판에서도 유효</small>`;
    };
    const rows=shownTargets.map(row=>{const missing=(row.missing||[]).slice(0,3).map(item=>`${item.name}${C.num(item.count)>1?`×${C.num(item.count)}`:''}`).join(' · ');return`<button type="button" class="v151-recovery-row" data-act="detail" data-id="${C.esc(row.id)}" aria-label="${C.esc(row.name)} — ${C.esc(row.roleLabel||'역할')} 목표, 재료 상세 보기"><i>${C.esc(row.roleLabel||'역할')}</i><span><b>${C.esc(row.name)}</b><small>${missing?`부족: ${C.esc(missing)}`:'재료 충족 · 선위 대기'}</small>${crossNote(row)}${recipeFor(row)}</span><em>선위 ${C.num(row.wispCost)}${C.num(row.wispGap)>0?` (부족 ${C.num(row.wispGap)})`:''}</em></button>`;}).join('');
    if(!shownTargets.length&&!single.length)return'';
    // v20.2(0806 · "왜 갑자기 네코마무시를 추천한거야 물딜 조합인데"):
    // 회복 목표는 "지금 만들라"가 아니라 "이 역할을 닫을 후보"다.  그
    // 구분이 화면에 없어서 목표가 추천으로 읽혔다(센고쿠 HOLD 카드
    // 사건과 같은 계열 — v19.15.1 배너의 회복 목표 판).  머리말에 못을
    // 박고, 각 행에 역할 뱃지와 계열 주석을 단다.
    return`<div class="v151-recovery"><div class="v202-recovery-head"><b>앞으로 닫을 목표 — 지금 만들라는 뜻이 아닙니다</b><small>${C.esc(recovery.note||'남은 필수 역할을 닫는 최근접 후보')} · 지금 만들 것은 위의 큰 카드 하나뿐입니다.</small></div>${singleHtml}${rows}</div>`;
  }

  // v19.7(사용자 요청 ⑤): 0731 로그 — 2상위(나미)를 r31에 확정했는데 판
  // 전체 306개 판단 중 "지금 할 일"에 한 번도 오르지 않았고, 사용자가 r40에
  // 직접 만들었다(그 사이 라인은 계속 밀렸다).  확정 2상위가 미보유면 메인
  // 카드 바로 아래 전용 줄로 상시 노출한다 — 부족 재료·선위까지 함께.
  v157SecondUpperCallout(state,decision){
    const secondId=String(this.state.secondUpperId||'');
    if(!secondId||!state||!state.db)return'';
    const unit=state.db.byId.get(secondId);
    if(!unit||C.num(state.counts[secondId])>0)return'';
    if(String(decision&&decision.action&&decision.action.id||'')===secondId)return'';
    let solve=null;try{solve=C.recipeSolve(state.db,secondId,state.counts||{});}catch(_){return'';}
    const rares=Object.entries(solve.buildNeeded&&solve.buildNeeded.rare||{}).map(([id,count])=>`${C.materialName(state.db,id)}${C.num(count)>1?`×${C.num(count)}`:''}`).slice(0,4);
    const commonsShort=Object.values(solve.lowestMissing||{}).reduce((sum,value)=>sum+C.num(value),0);
    const wispGap=Math.max(0,C.num(solve.wispCost)-C.num(state.wisp));
    const feasible=!(solve.hardMissing||[]).length&&!rares.length&&wispGap<=0;
    const parts=[];
    if(rares.length)parts.push(`부족 희귀 ${rares.join('·')}`);
    if(commonsShort)parts.push(`흔함 ${commonsShort}장`);
    if(wispGap)parts.push(`선위 ${wispGap} 부족`);
    const note=feasible?'지금 제작 가능 — 이 상위가 라인을 나눠 받습니다':parts.join(' · ')||'재료 계산 중';
    return`<div class="v157-second-callout ${feasible?'ready':''}">${this.v153Icon('lock')}<span><small>확정 2상위 · 메인 다음 우선 제작</small><b>${C.esc(displayNameOf(unit))}</b><em>${C.esc(note)}</em></span><span class="v157-side"><button data-act="detail" data-id="${C.esc(secondId)}">재료</button><em>선위 ${C.num(solve.wispCost)}</em></span></div>`;
  }

  // v19.7(사용자 요청 ⑥): 0731 로그 — 도플 변이(S50h)가 흔함 3장(버기2·
  // 상디1)까지 좁혀졌는데 엔진은 r53~58 내내 HOLD 였고 손 정지 29초 전에야
  // 추천했다.  후반 대기 상태에서 "흔함만 부족한" 변화·왜곡 마무리를 랜덤
  // 흔함(라운드당 2장) 노리기 카드로 승격한다.  표시 전용 — 게이트 없음.
  v157LongshotHint(state,status){
    if(!state||!state.db)return'';
    if(this.actualRound()<46)return'';
    if(!['HOLD','PREPARE','SYNC_BLOCKED'].includes(String(status||'')))return'';
    const counts=state.counts||{},targets=[];
    for(const unit of state.db.units){
      if(!(C.isChanged(unit)||C.isWarped(unit))||C.num(counts[unit.id])>0)continue;
      let solve=null;try{solve=C.recipeSolve(state.db,unit.id,counts);}catch(_){continue;}
      // buildNeeded 는 "만들어야 할 중간 단계"지 차단이 아니다 — 희귀 조상을
      // 흔함부터 쌓아 올리는 경로가 바로 이 각이다.  진짜 차단(특수 선행·
      // 미해석 재료)만 거른다.
      if((solve.hardMissing||[]).length)continue;
      const byTier=solve.missingByTier||{};
      if(Object.keys(byTier.hard||{}).length||Object.keys(byTier.other||{}).length)continue;
      const commons=Object.entries(solve.lowestMissing||{}).map(([id,count])=>({id,name:C.materialName(state.db,id),count:C.num(count)})).filter(item=>item.count>0);
      const totalShort=commons.reduce((sum,item)=>sum+item.count,0);
      if(!totalShort||totalShort>6)continue;
      if(C.num(solve.wispCost)>C.num(state.wisp)+2)continue;
      targets.push({unit,solve,commons,totalShort});
    }
    if(!targets.length)return'';
    targets.sort((a,b)=>a.totalShort-b.totalShort||C.num(a.solve.wispCost)-C.num(b.solve.wispCost));
    const top=targets[0];
    const chips=top.commons.slice(0,4).map(item=>`<em><i style="background:${C.COMMON_COLORS[item.name]||'#64748b'}"></i>${C.esc(item.name)}×${item.count}</em>`).join('');
    return`<div class="v157-longshot">${this.v153Icon('gem')}<span><small>막판 랜덤 흔함 노리기 · 라운드마다 랜덤 흔함 ${C.num(C.RANDOM_WISP_PER_ROUND)||2}장</small><b>${C.esc(displayNameOf(top.unit))}</b><span class="chips">${chips}</span><em>이것만 나오면 완성 — 당장 각이 없어도 공짜 확률입니다</em></span><button data-act="detail" data-id="${C.esc(top.unit.id)}">재료</button></div>`;
  }

  // v17.5(사용자 요청): 해적선은 특수재료라 리롤로 못 얻는다 — 보유한
  // 배를 어느 완성체(방주맥심·모비딕호·레드포스호)로 쓸지, 부족 희귀가
  // 무엇인지(리롤·드랍 목표)를 상시 보여준다.  실전 로그에서 배 4척을
  // 들고도 방주맥심 재료 리롤 목표가 화면 어디에도 없었다.
  v151ShipPlan(state){
    const db=state.db;if(!db||!C.PIRATE_SHIP_ID)return null;
    // Keep this pure helper usable by diagnostics/tests that supply only a DB
    // and counts, while live calls still pass the fully normalized state.
    state=Object.assign({rawCounts:state.counts||{},currentAbilities:{},percent:{},wisp:C.num(state.counts&&state.counts[C.WISP_ID])},state,{rawCounts:state.rawCounts||state.counts||{},currentAbilities:state.currentAbilities||{},percent:state.percent||{}});
    const shipCount=C.num(state.counts[C.PIRATE_SHIP_ID]);
    if(shipCount<=0)return null;
    const products=db.units.filter(u=>(u.stuffs||[]).some(s=>s.id===C.PIRATE_SHIP_ID));
    if(!products.length)return null;
    const mode=(this.state&&this.state.mode)||this.v151FamilyIntent(state)||'',round=typeof this.actualRound==='function'&&this.state?this.actualRound():C.num(this.state&&this.state.currentRound)||1,settings=Object.assign({},typeof this.settings==='function'&&this.state?this.settings():{},{currentRound:round,mode:mode||'magic'}),lock=typeof this.upperLock==='function'&&this.state?this.upperLock():null,upperId=lock&&lock.id||this.state&&this.state.directionUpperId||'',upper=upperId&&db.byId.get(upperId)||null,memo=upper&&C.upperMemoFor?C.upperMemoFor(upper,global.ORD_SYNERGY_MEMO||global.ORD_UPPER_MEMO):null,memoRanks=new Map();
    for(const support of memo&&memo.supports||[])for(const id of support.unitIds||[])if(!memoRanks.has(String(id)))memoRanks.set(String(id),{rank:C.num(support.rank)||999,reason:String(support.reason||support.reinforce||'')});
    const commonLeaves=unit=>{const out={},walk=(id,mult,path)=>{const item=db.byId.get(id);if(!item||path.has(id))return;if(C.isCommon(item)){out[id]=C.num(out[id])+mult;return;}const next=new Set(path);next.add(id);for(const stuff of item.stuffs||[])walk(stuff.id,mult*C.num(stuff.count),next);};walk(unit.id,1,new Set());return Object.entries(out).map(([id,need])=>{const item=db.byId.get(id);return{id,name:item?C.nameOf(item):id,need:C.num(need),have:C.num(state.counts[id]),ratio:C.num(state.counts[id])/Math.max(1,C.num(need))};}).filter(item=>item.have>0).sort((a,b)=>b.ratio-a.ratio||b.have-a.have||a.name.localeCompare(b.name,'ko'));};
    const rows=products.map(unit=>{
      const missing=[];
      for(const s of unit.stuffs||[]){
        const owned=C.num(state.counts[s.id]);
        if(owned>=C.num(s.count))continue;
        const mat=db.byId.get(s.id);
        missing.push({id:s.id,name:mat?C.nameOf(mat):String(s.id),need:C.num(s.count)-owned,rare:!!(mat&&C.isRare(mat))});
      }
      const family=C.familyOf(unit);
      // v17.9(사용자 요청 1): 전설급 완성체(방주맥심 등)와 상위(제한됨,
      // 에넬 등)는 쓰임이 다르다 — 구분하고 현재 계통 적합도로 추천한다.
      const kind=C.isUpper(unit)?'upper':'legend';
      const familyFit=!mode||family===mode||family==='neutral';
      const candidate=C.candidateRow(state,unit,{mode:mode||family||'magic',purpose:'spec',round,settings,stock:state.counts,ruleCounts:state.counts,availableWisp:state.wisp,deficits:{rows:[]},spec:null,upper}),memoRow=memoRanks.get(String(unit.id))||{rank:999,reason:''},role=C.roleProfile(unit),magicUtility=C.num(role.magicDef)+C.num(role.magicAmp)+C.num(role.explosionAmp)+C.num(role.triggerSlow)*.65,slack=commonLeaves(unit);
      return{unit,kind,family,familyFit,feasible:!!candidate.feasible,missing,missingRares:missing.filter(m=>m.rare),candidate,solve:candidate.solve,rareUse:candidate.solve&&candidate.solve.rareUse||{},rareSpend:candidate.rareSpend,wispCost:C.num(candidate.solve&&candidate.solve.wispCost),memoRank:memoRow.rank,memoReason:memoRow.reason,magicUtility,commonSlack:slack.slice(0,3)};
    });
    const order=(a,b)=>Number(b.familyFit)-Number(a.familyFit)||Number(b.feasible)-Number(a.feasible)||a.missing.length-b.missing.length||a.memoRank-b.memoRank||b.magicUtility-a.magicUtility||C.num(b.rareSpend&&b.rareSpend.total)-C.num(a.rareSpend&&a.rareSpend.total)||a.wispCost-b.wispCost||C.nameOf(a.unit).localeCompare(C.nameOf(b.unit),'ko');
    const legendRows=rows.filter(row=>row.kind==='legend').sort(order);
    const upperRows=rows.filter(row=>row.kind==='upper').sort(order);
    const upperCommitted=!!(this.state&&((this.upperLock&&this.upperLock())||this.state.directionUpperId));
    const pool=upperCommitted&&legendRows.length?legendRows:[...legendRows,...upperRows];
    const recommended=pool.slice().sort(order)[0]||null;
    return{shipCount,legendRows,upperRows,recommendedId:recommended?recommended.unit.id:''};
  }

  renderV151Preparation(state,plan){
    const decision=plan.v15Decision||{},branch=plan.postLegendDecision||{},action=decision.action||decision.blockedAction||null,items=[];
    if(branch.awaiting)return`<div class="v151-empty"><b>진행 방향 선택 전</b><span>재료를 소비하지 말고 첫 전설 뒤 경로부터 선택하세요.</span></div>`;
    if(decision.state==='ROUTE_CHOICE'){
      const candidate=(decision.routeCandidates||[])[0],steps=candidate&&candidate.projectedSupport&&candidate.projectedSupport.steps||[];
      for(const step of steps.slice(0,3))items.push({id:step.id,name:step.name,wispCost:step.wispCost,note:step.order===1?'상위 먼저':'상위 제작 뒤 재계산'});
    }else if(action&&Array.isArray(action.path)){
      for(const step of action.path.slice(1,3))items.push({id:step.id,name:step.name,wispCost:step.wispCost,note:'현재 행동 뒤 후보'});
    }
    for(const row of decision.alternatives||[]){if(items.some(item=>item.id===row.id))continue;items.push({id:row.id,name:row.name,wispCost:row.wispCost,note:row.reason||'대체 경로'});if(items.length>=3)break;}
    if(!items.length&&decision.blockedAction){const blocked=decision.blockedAction,missing=(blocked.quote&&blocked.quote.blocked||blocked.row&&blocked.row.blocked||[]).slice(0,2).join(' · ');items.push({id:blocked.id,name:blocked.name,wispCost:blocked.wispCost,note:missing||'부족 재료를 보존'});}
    for(const target of decision.recovery&&decision.recovery.targets||[]){if(items.length>=5)break;if(items.some(item=>item.id===target.id))continue;items.push({id:target.id,name:target.name,wispCost:target.wispCost,note:`${target.roleLabel} 회복 목표${target.feasible?' · 지금 가능':''}`});}
    // v17.15(사용자 요청 1): 리롤 블록은 3번 "희귀 활용 방안"으로 이동 —
    // 이 목록은 "확정 행동 뒤 이어질 후보"만 우선순위대로 담는다(최대 4,
    // 위의 권위 카드와 합쳐 다음 행동 리스트 최대 5).
    // v17.12(사용자 요청 2): 해적선은 추천 1개 한 줄 + 전체 모달.
    const shipPlan=this.v151ShipPlan(state);
    const shipReco=shipPlan?[...shipPlan.legendRows,...shipPlan.upperRows].find(row=>row.unit.id===shipPlan.recommendedId)||null:null;
    const shipHint=shipPlan&&shipReco?`<div class="v151-ship-line"><small>해적선 ${shipPlan.shipCount}척</small><button data-act="detail" data-id="${C.esc(shipReco.unit.id)}"><b>추천 ${C.esc(displayNameOf(shipReco.unit))}</b><span>${shipReco.kind==='upper'?'상위(제한됨) · 메인 상위 자리 소모':'전설급 완성체'} · ${shipReco.feasible?'지금 제작 가능':`부족: ${shipReco.missing.slice(0,2).map(m=>`${C.esc(m.name)}${m.need>1?`×${m.need}`:''}`).join('·')}${shipReco.missing.length>2?` 외 ${shipReco.missing.length-2}`:''}`}</span></button><button class="v151-ship-all" data-act="ship-plan">전체 ${shipPlan.legendRows.length+shipPlan.upperRows.length}개</button></div>`:'';
    return items.length||shipHint?`<div class="v151-prep-list"><small class="v152-prep-title">이어질 행동 후보 · 우선순위순</small>${items.slice(0,4).map((item,index)=>{const unit=state.db&&state.db.byId.get(item.id);return`<button data-act="detail" data-id="${C.esc(item.id)}">${unit&&unit.image?`<img src="${C.esc(unit.image)}" alt="">`:`<i>${index+2}</i>`}<span class="v151-prep-copy"><span class="v151-prep-name"><b>${index+2}. ${C.esc(item.name)}</b>${this.v224PctChip(state,unit)}${this.v151StoryTag(unit)}${this.v216BargesTag(unit)}</span><small>${C.esc(item.note)}</small></span><em>선위 ${C.num(item.wispCost)}</em></button>`;}).join('')}${shipHint}<p>1번(위 카드)만 확정 행동이며, 이후 순번은 TMO 패 변화 뒤 다시 계산합니다.</p></div>`:`<div class="v151-empty"><b>현재 행동만 확정</b><span>다음 행동은 지금 미리 고정하지 않고 TMO 변화 뒤 계산합니다.</span></div>`;
  }

  // v17.15(사용자 요청 3): 희귀 활용 방안 — ①대상 상위 기준 9~11환산 파티
  // 미리보기(내 패 + 50라 위습 수입 전제) ②추천 이유(어떤 희귀를 어디에
  // 쓰는지) ③돌리면 좋은 희귀(목표·확률) ④지금 희귀로 만들 수 있는 전설급.
  // 파티 구성 자체는 원장·역할표가 결정하며 이 패널은 그 결과를 설명한다.
  renderV152RarePlan(state,plan){
    const decision=plan.v15Decision||{};
    // 대상 상위: 확정 락 > 선택 방향 > 1순위 후보 > 감지된 메인 상위.
    const lock=this.upperLock();
    const candidates=decision.routeCandidates||[];
    // v17.15.1(감사): 잔존 락(구버전 카탈로그 id)이 체인을 멈추지 않게,
    // db에 실존하는 id만 폴백에 참여시킨다.
    const inDb=id=>id&&state.db&&state.db.byId&&state.db.byId.get(id)?id:'';
    const targetId=inDb(lock&&lock.id)||inDb(this.state.directionUpperId)||inDb(candidates[0]&&candidates[0].id)||inDb(plan.upper&&plan.upper.id)||'';
    const unit=targetId?state.db.byId.get(targetId):null;
    let partyHtml='';
    if(unit&&C.isUpper(unit)){
      const squad=this.v151ComputeParty(state,plan,unit.id);
      if(squad&&!squad.error)plan.squadPlan=squad;
      const party=squad?this.v151ClearParty(state,plan,squad,unit.id):null;
      // 추천 이유: 후보 단계면 원장 근거 문장(v151ClearWhy), 확정 이후면
      // 파티 계산의 희귀 배분(rareAllocation)으로 사용처·리롤 후보를 설명.
      const candidateRow=candidates.find(row=>C.canonicalUpperId(row.id)===C.canonicalUpperId(unit.id));
      let why=candidateRow?this.v151ClearWhy(state,plan,candidateRow):'';
      if(!why&&squad&&Array.isArray(squad.rareAllocation)&&squad.rareAllocation.length){
        const spent=squad.rareAllocation.filter(row=>row.spent>0).slice(0,4).map(row=>`${row.name}${row.spent>1?`×${row.spent}`:''} → ${[...new Set((row.usedBy||[]).filter(use=>use.status==='spent').map(use=>use.name))].slice(0,2).join('·')||'제작'}`);
        const reserved=squad.rareAllocation.filter(row=>row.reserved>0).slice(0,3).map(row=>`${row.name} → ${[...new Set((row.usedBy||[]).filter(use=>use.status==='reserved').map(use=>use.name))].slice(0,2).join('·')||'후속'}`);
        const spare=squad.rareAllocation.filter(row=>row.rerollSuggested).slice(0,3).map(row=>row.name);
        const parts=[];
        if(spent.length)parts.push(`보유 희귀 사용: ${spent.join(' · ')}`);
        if(reserved.length)parts.push(`후속 예약: ${reserved.join(' · ')}`);
        if(spare.length)parts.push(`남는 희귀(리롤 후보): ${spare.join('·')}`);
        if(parts.length)why=`<small class="v151-clear-why">${C.esc(parts.join('. '))}.</small>`;
      }
      const pairs=this.renderV151MetaPairs(state,unit);
      const body=party?this.renderV151ClearParty(party):`<div class="v151-empty"><b>파티 계산 대기</b><span>${C.esc(squad&&squad.error||'현재 패로는 이 상위 기준 파티를 아직 구성하지 못했습니다.')}</span></div>`;
      // v17.17(사용자 의도 7단계): 50라부터는 못 쓰는 유닛을 팔아 마지막
      // 전설급을 만드는 구간 — 최종 파티에 안 쓰이는 희귀를 판매 후보로
      // 표시한다(판매 자체는 게임에서, 여기는 안내만).
      const sellRows=this.actualRound()>=50&&squad&&Array.isArray(squad.unusedRare)?squad.unusedRare.slice(0,6):[];
      const sellHtml=sellRows.length?`<div class="v152-sell-hint"><small>판매·정리 후보 (최종 파티 미사용 희귀)</small><span>${sellRows.map(row=>`${C.esc(row.name)}${C.num(row.count)>1?`×${C.num(row.count)}`:''}`).join(' · ')}</span><em>50라+: 못 쓰는 재료를 팔아 마지막 전설급 제작 자원으로 — 특별·안흔·흔함도 최종 파티 미사용분은 정리 대상</em></div>`:'';
      partyHtml=`<div class="v152-rare-party"><div class="v152-rare-party-head"><small>기준 상위</small><b>${C.esc(displayNameOf(unit))}</b>${lock?'<em>확정</em>':candidateRow?'<em>1순위 후보</em>':''}<button data-act="party-preview" data-id="${C.esc(unit.id)}">크게 보기</button></div>${why}${pairs}${body}${sellHtml}</div>`;
    }else{
      partyHtml='<div class="v151-empty"><b>기준 상위 없음</b><span>4번 패널에서 상위 후보를 비교·확정하면 희귀 활용 파티가 여기 표시됩니다.</span></div>';
    }
    // 리롤 블록(2번 패널에서 이동 · v16.7/v17.11 규칙 유지).
    const rerollRows=decision.rare&&!decision.rare.conflict?(decision.rare.reroll||[]).filter(row=>C.num(row.reroll)>0).slice(0,2):[];
    const rerollHint=rerollRows.length&&decision.state!=='REROLL_ONE'?`<div class="v151-reroll-hint"><small>리롤 권장</small>${rerollRows.map(row=>`<button data-act="detail" data-id="${C.esc(row.id)}"><b>${C.esc(row.name)}${C.num(row.reroll)>1?` ×${C.num(row.reroll)}`:''}</b><span>확정 상위·보조 경로에 사용처 없음 · 1장씩 리롤 후 다시 동기화 · 원하는 1종 확률 1/41(2.4%)/회</span></button>`).join('')}</div>`:'';
    const rerollTargets=this.v151RerollTargets(state,plan,decision);
    const targetsHtml=rerollTargets?`<div class="v151-reroll-targets"><small>리롤 목표 ${rerollTargets.kinds}종 · 남은 리롤 ${rerollTargets.rerollLeft}/${this.rerollLimit()}</small><div class="v151-reroll-target-chips">${rerollTargets.list.map(row=>`<button data-act="detail" data-id="${C.esc(row.id)}"><b>${C.esc(row.name)}${row.need>1?`×${row.need}`:''}</b><span>${row.sources.map(source=>C.esc(source)).join('·')}</span></button>`).join('')}</div><em>1회당 목표 적중 ${rerollTargets.kinds}/41 = ${rerollTargets.perRollPercent}%${rerollTargets.rerollLeft?` · 남은 ${rerollTargets.rerollLeft}회 안에 1개 이상 ${rerollTargets.anyHitPercent}%`:' · 리롤 소진'}</em>${rerollTargets.rollAway.length?`<span class="v151-reroll-fuel">돌릴 후보(사용처 없음): ${rerollTargets.rollAway.map(row=>C.esc(row.name)).join(' · ')}</span>`:'<span class="v151-reroll-fuel">지금 돌릴 무용 희귀 없음 — 무용 희귀가 잡히면 위 목표를 노리세요</span>'}</div>`:'';
    const buildable=`<div class="v152-rare-buildable"><small>지금 내 패로 만들 수 있는 전설급 · <i class="v151-pick-badge">추천</i>은 전체 파티 계획이 고른 것</small>${this.renderV151BuildableLegends(state,plan)}</div>`;
    // v17.27(사용자 요청): 재료를 모으는 구간에는 다음 행동이 PREPARE로
    // 잠겨 화면에 할 일이 안 보인다.  그때도 "내 희귀함으로 지금 뭘 만들
    // 수 있는지"는 항상 보이게 독립 칸으로 둔다 — 추천이 아니라 사실이다.
    const rareCraftable=this.renderV152RareCraftable(state,plan);
    return`${partyHtml}${rerollHint}${targetsHtml}${buildable}${rareCraftable}`;
  }

  renderV151CurrentSpec(state,plan){
    // v17.8(사용자 요청 1): 큰 카드 격자는 결손의 심각도가 안 보였다 —
    // 62라 전멸 로그에서 방깎 부족 107이 스턴 부족 0.04와 같은 크기로
    // 나열됐다. 한 줄 밀집 행 + 심각도(가중치×결손율) 정렬로 바꾼다.
    const decision=plan.v15Decision||{},assessment=decision.assessment||{},source=assessment.requirements||plan.deficits&&plan.deficits.requirements||[],seen=new Set(),rows=[];for(const row of source){if(!row||seen.has(row.key))continue;seen.add(row.key);rows.push(row);}const magic=this.state.mode==='magic',route=magic?this.state.magicRoute:'physical';
    const severity=row=>{const target=Math.max(.0001,Math.abs(C.num(row.target)));return C.num(row.weight||1)*Math.min(1,Math.max(0,C.num(row.gap))/target);};
    const open=rows.filter(row=>!row.waived&&C.num(row.gap)>0).sort((a,b)=>severity(b)-severity(a));
    const closed=rows.filter(row=>!row.waived&&C.num(row.gap)<=0);
    const waived=rows.filter(row=>row.waived);
    const preview=C.bossPreview?C.bossPreview(this.actualRound(),this.state.gorosei):null;
    const armorSource=rows.find(row=>row.key==='armor');
    const abModel=armorSource&&C.armorBreakModel?C.armorBreakModel(plan.spec||{},{bossArmor:preview&&preview.bossArmor!=null?preview.bossArmor:null,armorReduce:C.num(armorSource.current)}):null;
    // v17.9(사용자 요청 3): 결손만 큰 타일로, 확보·면제는 한 줄 칩으로 —
    // 스크롤 없이 전체가 들어오고 시선은 결손 타일에만 간다.
    const tile=(row,rank)=>{const pct=Math.max(0,Math.min(100,C.num(row.target)>0?100*C.num(row.current)/C.num(row.target):0));
      const abNote=row.key==='armor'&&abModel&&abModel.stacks>0?`<small class="v151-ab-note">+ 암브 ${C.num(abModel.units)}기 환산 ${C.num(abModel.stacks)}(정착 추정) = 유효 ${fmt(C.num(row.current)+abModel.stacks)}${abModel.gainPercent?` · 피해 +${fmt(abModel.gainPercent)}%`:''} — 제작 목표는 정적 기준 유지</small>`:'';
      return`<div class="v151-spec-tile${rank===0?' lead':''}"><small><i>${rank+1}</i>${C.esc(row.label)}</small><b>${fmt(row.current)}<i> / ${fmt(row.target)}</i></b><em>부족 ${fmt(row.gap)}</em><span class="v151-spec-bar"><i style="--pct:${Math.round(pct)}%"></i></span>${abNote}</div>`;};
    const chips=closed.map(row=>{
      const abChip=row.key==='armor'&&abModel&&abModel.stacks>0?` (+암브 ${C.num(abModel.stacks)})`:'';
      return`<span class="v151-spec-chip ok" title="목표 ${fmt(row.target)}">✓ ${C.esc(row.label)} ${fmt(row.current)}${abChip}</span>`;
    }).concat(waived.map(row=>`<span class="v151-spec-chip waived" title="이 상위는 요구하지 않음">${C.esc(row.label)} 면제</span>`)).join('');
    const armorInOpen=open.some(row=>row.key==='armor');
    const tiles=open.map((row,index)=>tile(row,index)).join('');
    // v17.12(사용자 요청 6): 자동 모드에서 방향 확정 전에는 특정 계통
    // 기준(기본 물딜)을 보여주지 않는다 — 방향을 정하면 물딜/마딜(1상위)/
    // 마딜(2상위) 기준으로 자동 전환되고 그 사실을 칩으로 명시한다.
    const auto=!this.state.mode;
    const resolvedRouteKey=this.state.mode==='physical'?'physical':magic?(['dual','singleEnd'].includes(this.state.directionKey)?this.state.directionKey:['dual','singleEnd'].includes(route)?route:decision.assessment&&decision.assessment.route&&decision.assessment.route.key||''):'';
    const resolvedChip=!auto?`<em class="v151-mode-resolved">${resolvedRouteKey==='physical'?'물딜 기준':resolvedRouteKey==='singleEnd'?'마딜 1상위(단끝) 기준':resolvedRouteKey==='dual'?'마딜 2상위(토키) 기준':'마딜 기준'}</em>`:'';
    const summary=auto?'':open.length?`<div class="v151-spec-summary gap"><b>필수 결손 ${open.length}개</b><span>최우선: ${C.esc(open[0].label)} 부족 ${fmt(open[0].gap)}</span></div>`:rows.length?`<div class="v151-spec-summary ok"><b>필수 역할 전부 확보</b><span>보스 화력은 별도 미검증</span></div>`:'';
    const body=auto?'<div class="v151-empty"><b>방향 확정 전 — 기준 없음</b><span>물딜/마딜 방향을 정하면(④ 상위 확정 또는 위 버튼) 그 기준의 필수 결손이 여기 표시됩니다.</span></div>':rows.length?`${tiles?`<div class="v151-spec-tiles${armorInOpen?'':' compact'}">${tiles}</div>`:''}${chips?`<div class="v151-spec-chips">${chips}</div>`:''}`:'<div class="v151-empty"><b>스펙 계산 대기</b><span>첫 제작 뒤 역할 수치를 표시합니다.</span></div>';
    // v17.15(사용자 요청 2): 스펙이 한눈에 — 큰 숫자 히어로 타일.
    // 전설급 환산은 모델과 같은 규칙(상위×3 + 비상위 전설급)으로 센다.
    const hero=(()=>{
      // v17.15.1(감사): db.legendish에는 상위가 없어 상위×3이 죽은 분기였다 —
      // 모델·코어와 같은 progressionCounts(상위 계보×3 + 비상위 전설급)를 쓴다.
      const counts=state.db&&C.progressionCounts?C.progressionCounts(state):null;
      const equivalent=counts?C.num(counts.squad):0;
      const lead=open[0]||null;
      const tiles=[
        `<span class="v152-hero"><small>전설급 환산</small><b>${equivalent}</b><i>목표 9~11 · 상위권 중앙값 11</i></span>`,
        `<span class="v152-hero"><small>선택 위습</small><b>${C.num(state.wisp)}</b><i>제작 통화 · 실측 0.5/라 수입</i></span>`,
        lead?`<span class="v152-hero gap"><small>최우선 결손</small><b>${C.esc(lead.label)}</b><i>부족 ${fmt(lead.gap)} (${fmt(lead.current)}/${fmt(lead.target)})</i></span>`:auto?`<span class="v152-hero"><small>필수 결손</small><b>—</b><i>방향 확정 전</i></span>`:`<span class="v152-hero ok"><small>필수 결손</small><b>0</b><i>전부 확보 · 보스 화력은 별도</i></span>`
      ];
      return`<div class="v152-hero-row">${tiles.join('')}</div>`;
    })();
    // v17.16(사용자 피드백): 스펙 패널의 빈 공간을 "지금 내 파티"로 채운다 —
    // 한눈에 내 스펙이 보이려면 수치만이 아니라 보드에 뭐가 있는지가 보여야
    // 한다. 보유 상위·전설급 칩(클릭=상세) + 재료 패 요약 한 줄.
    const partyNow=(()=>{
      if(!state.db||!state.db.byId)return'';
      const chips=[];
      const push=(unit,owned,cls)=>chips.push(`<button class="${cls}" data-act="detail" data-id="${C.esc(unit.id)}"><b>${C.esc(displayNameOf(unit))}</b>${owned>1?`<i>×${owned}</i>`:''}</button>`);
      for(const unit of state.db.uppers||[]){const owned=C.num(state.counts[unit.id]);if(owned>0)push(unit,owned,'upper');}
      for(const unit of state.db.legendish||[]){const owned=C.num(state.counts[unit.id]);if(owned>0)push(unit,owned,'legend');}
      let rareN=0,specialN=0,uncommonN=0,commonN=0;
      for(const unit of state.db.byId.values()){
        const owned=C.num(state.counts[unit.id]);
        if(owned<=0)continue;
        if(C.isRare(unit))rareN+=owned;else if(C.isSpecialTier(unit))specialN+=owned;else if(C.isUncommon(unit))uncommonN+=owned;else if(C.isCommon(unit))commonN+=owned;
      }
      const handSummary=`재료 패: 희귀 <b>${rareN}</b> · 특별 <b>${specialN}</b> · 안흔 <b>${uncommonN}</b> · 흔함 <b>${commonN}</b>`;
      return`<div class="v152-party-now"><small>지금 내 파티 (상위·전설급 보드)</small>${chips.length?`<div class="v152-party-chips">${chips.join('')}</div>`:'<span class="v152-party-empty">아직 전설급 보드가 비어 있습니다 — 첫 전설·히든이 여기 표시됩니다.</span>'}<em class="v152-hand-sum">${handSummary}</em></div>`;
    })();
    return`<div class="v151-spec-head"><div class="damage-mode-switch" role="group" aria-label="딜 계통 선택"><button class="${!this.state.mode?'on':''}" data-act="mode" data-value="">자동</button><button class="${this.state.mode==='physical'?'on':''}" data-act="mode" data-value="physical">물딜</button><button class="${magic?'on':''}" data-act="mode" data-value="magic">마딜</button></div>${magic?`<select data-opt="magicRoute" aria-label="마딜 경로"><option value="auto" ${route==='auto'?'selected':''}>자동 경로</option><option value="dual" ${route==='dual'?'selected':''}>2상위·토키</option><option value="singleEnd" ${route==='singleEnd'?'selected':''}>1상위·단끝</option></select>`:''}${resolvedChip}</div>${hero}${partyNow}${summary}<div class="v151-spec-body">${body}</div>`;
  }

  // v16.7: 자동 모드에서는 첫 전설(보유 비상위 전설·히든)의 계열이 이후
  // 전설급 추천 방향을 정한다.  명시 선택(물딜/마딜)이 있으면 그것이 우선.
  v151FamilyIntent(state){
    const mode=this.state&&this.state.mode;
    if(mode==='physical'||mode==='magic')return mode;
    if(!state||!state.db||!Array.isArray(state.db.legendish))return'';
    let physical=0,magic=0;
    for(const unit of state.db.legendish){
      if(C.isUpper(unit)||C.isShip(unit)||!/전설|히든/.test(C.groupName(unit)))continue;
      if(C.num(state.counts[unit.id])<=0)continue;
      const family=C.familyOf(unit);
      if(family==='physical')physical+=1;else if(family==='magic')magic+=1;
    }
    if(physical>0&&magic<=0)return'physical';
    if(magic>0&&physical<=0)return'magic';
    return'';
  }
  // v19: 계획된 상위(메인 + 두 번째)를 다음 계산의 관성 힌트로 기억한다.
  rememberPlannedUppers(state,squad){
    if(!state||!state.db||!squad||squad.error)return;
    const ids=[];
    for(const item of squad.finalLineup||[]){const unit=item&&(item.unit||state.db.byId.get(String(item.id||'')));if(unit&&C.isUpper(unit))ids.push(String(unit.id));}
    const next=[...new Set(ids)].sort().join(',');
    if(next!==(this._stickyUpperIds||[]).slice().sort().join(','))this._stickyUpperIds=[...new Set(ids)];
  }
  // 두 번째 상위 후보 — 메인 상위와 다른 계열의 상위를, 지금 패로 얼마나
  // 가까운지 순으로 보여 준다.  등급(powerTier)이 같으면 선위가 싼 쪽 먼저.
  v19SecondUpperCandidates(state,plan,mainUpper){
    if(!state||!state.db||!Array.isArray(state.db.uppers))return[];
    const mainKey=mainUpper?String(C.canonicalUpperId(mainUpper.id)):'';
    const mode=plan&&plan.mode||this.state.mode||(mainUpper?C.familyOf(mainUpper):'')||'physical';
    const settings=Object.assign({},plan&&plan.settings||{},{currentRound:this.actualRound(),allowWarped:true,recommendWarped:true});
    const ctx={mode,purpose:'upper',round:this.actualRound(),settings,stock:state.counts,ruleCounts:state.counts,availableWisp:state.wisp,deficits:plan&&plan.deficits||{rows:[]},spec:plan&&plan.spec||null,upper:mainUpper||null};
    const rows=[];
    for(const unit of state.db.uppers){
      if(mainKey&&String(C.canonicalUpperId(unit.id))===mainKey)continue;
      if(C.familyOf(unit)!=='neutral'&&C.familyOf(unit)!==mode)continue;
      let row=null;try{row=C.candidateRow(state,unit,ctx);}catch(_){row=null;}
      if(!row||!row.solve)continue;
      const tier=C.upperPowerTier?C.upperPowerTier(unit,state.db):{known:false,letter:'',rank:-1};
      rows.push({unit,solve:row.solve,feasible:!!row.feasible,progress:C.num(row.progress),wispCost:C.num(row.solve.wispCost),tier});
    }
    // v19.7.1(외부 감사 ④): 처방 추천 페어는 제작 가능·티어가 같을 때만
    // 앞선다 — 제한 가중치(후단 타이브레이크) 원칙은 플래너와 동일.
    const prescribedKeys=new Set(this.v197PrescribedSecondIds().map(id=>String(C.canonicalUpperId(id))));
    const prescRank=row=>prescribedKeys.has(String(C.canonicalUpperId(row.unit.id)))?1:0;
    rows.sort((a,b)=>Number(b.feasible)-Number(a.feasible)||C.num(b.tier.rank)-C.num(a.tier.rank)||prescRank(b)-prescRank(a)||a.wispCost-b.wispCost||C.num(b.progress)-C.num(a.progress)||displayNameOf(a.unit).localeCompare(displayNameOf(b.unit),'ko'));
    return rows.slice(0,6);
  }
  v151BuildableLegendRows(state,plan){
    const BUILDABLE_LEGEND_LIMIT=12;
    if(!state||!state.db||!Array.isArray(state.db.legendish))return[];
    const familyMode=this.v151FamilyIntent(state),lock=this.upperLock(),targetId=lock&&lock.id||this.state.directionUpperId||plan.upper&&plan.upper.id||'',squad=plan.squadPlan||this.v151CachedPartySquad(targetId),squadIds=(squad&&squad.finalLineup||[]).map(row=>row.id).join(','),adaptive=squad&&squad.adaptiveTargets&&squad.adaptiveTargets.selected||9;
    const cacheKey=`${this._normalizedCacheKey||''}|${plan.mode||this.state.mode||''}|${familyMode}|${this.actualRound()}|${targetId}|${adaptive}|${squadIds}`;
    if(cacheKey===this._buildableCacheKey&&this._buildableCache)return this._buildableCache;
    // v16.5: 초월쿠마 is assumed available until spent (model rule), so this
    // panel quotes the same stock the engine sees.
    const stock=state.counts;
    const settings=Object.assign({},plan.settings||{},{currentRound:this.actualRound(),allowWarped:true,recommendWarped:true}),upper=targetId&&state.db.byId.get(targetId)||plan.upper||null,ctx={mode:plan.mode||this.state.mode||C.familyOf(upper)||'physical',purpose:'spec',round:this.actualRound(),settings,stock,ruleCounts:stock,availableWisp:state.wisp,deficits:plan.deficits||{rows:[]},spec:plan.spec||null,upper};
    // v16.7: 계열 방향이 정해졌으면(선택 또는 첫 전설 추론) 반대 계열
    // 전설급은 이 패널에서 제외하고, 동순위는 스토리 등급이 빠른 쪽 먼저.
    const familyOk=unit=>familyMode!=='physical'&&familyMode!=='magic'||C.familyOf(unit)!==(familyMode==='physical'?'magic':'physical'),plannedOrder=new Map(),plannedMeta=new Map(),lineupIds=new Set((squad&&squad.finalLineup||[]).map(item=>String(item&&item.id||'')).filter(Boolean)),ordered=[].concat(squad&&squad.safePrefix&&squad.safePrefix.actions||[],squad&&squad.actions||[],squad&&squad.finalLineup||[]);
    for(const item of ordered){const id=String(item&&item.id||''),unit=id&&state.db.byId.get(id);if(!id||!lineupIds.has(id)||!unit||C.isUpper(unit)||plannedOrder.has(id))continue;plannedOrder.set(id,plannedOrder.size+1);plannedMeta.set(id,item);}
    const reservedByRare=new Map();for(const allocation of squad&&squad.rareAllocation||[])if(C.num(allocation.spent)+C.num(allocation.reserved)>0)reservedByRare.set(allocation.id,C.num(allocation.spent)+C.num(allocation.reserved));
    const allRows=state.db.legendish.filter(unit=>C.num(state.counts[unit.id])<=0&&!C.isUpper(unit)&&!(C.isMystic&&C.isMystic(unit))&&!(C.isRandom&&C.isRandom(unit))&&!(C.isItem&&C.isItem(unit))&&familyOk(unit)).map(unit=>{const row=C.candidateRow(state,unit,ctx),order=plannedOrder.get(unit.id)||0,meta=plannedMeta.get(unit.id)||{},rareCollision=Object.entries(row.solve&&row.solve.rareUse||{}).reduce((sum,[id,value])=>sum+Math.min(C.num(value),C.num(reservedByRare.get(id))),0),roleText=C.summarizeRoles({role:row.role},ctx.mode);return Object.assign(row,{squadSupport:order>0,squadSupportRank:order,squadSupportReason:meta.reason||meta.role||roleText,rareReservationCollision:order?0:rareCollision});});
    // v17.26(사용자 요청): 이 패널은 "지금 내 패로 만들 수 있는 전설급"을
    // 보는 곳이다.  플래너가 고른 3개만 남기면 사용자가 자기 선택지를 볼 수
    // 없고, 추천이 이상할 때 대조할 기준도 사라진다.  실제로 제작 가능한
    // 것은 전부 싣고, 플래너 추천분만 표시로 구분한다.  필수 결손을 되
    // 여는 제작(regressed)만 제외한다 — 그건 만들면 손해다.
    const viable=allRows.filter(row=>row.squadSupport||row.feasible&&!(row.impact&&row.impact.regressed||[]).some(item=>item.required)),compare=(a,b)=>Number(b.squadSupport)-Number(a.squadSupport)||(a.squadSupport&&b.squadSupport?a.squadSupportRank-b.squadSupportRank:0)||Number(b.feasible)-Number(a.feasible)||C.num(a.rareReservationCollision)-C.num(b.rareReservationCollision)||C.num(b.coverage)-C.num(a.coverage)||C.num(a.solve.wispCost)-C.num(b.solve.wispCost)||C.num(b.rareSpend&&b.rareSpend.total)-C.num(a.rareSpend&&a.rareSpend.total)||C.num(b.progress)-C.num(a.progress)||displayNameOf(a.unit).localeCompare(displayNameOf(b.unit),'ko'),rows=viable.sort(compare).slice(0,BUILDABLE_LEGEND_LIMIT);
    // When nothing is craftable, keep the panel useful: the nearest targets
    // with their exact missing materials, instead of a bare empty state.
    this._buildableNearest=rows.length?[]:allRows.filter(row=>!row.feasible&&row.solve&&!(row.blocked||[]).length).sort((a,b)=>C.num(b.coverage)-C.num(a.coverage)||C.num(a.solve.wispCost)-C.num(b.solve.wispCost)||C.num(b.progress)-C.num(a.progress)).slice(0,3).map(row=>({unit:row.unit,progress:row.progress,wispCost:C.num(row.solve.wispCost),missing:(row.commonTop||C.commonTop(state.db,row.solve.lowestMissing||{},3)||[]).slice(0,3)}));
    this._buildableCache=rows;this._buildableCacheKey=cacheKey;
    return rows;
  }

  // v17.28(사용자 지적): 이 칸의 제목은 "내 희귀함으로 만들 수 있는
  // 전설급"인데 v151BuildableLegendRows는 희귀 소모를 요구하지 않아
  // "희귀 직접 소모 없음" 항목이 그대로 실렸다.  보유 희귀를 실제로
  // 쓰는 조합만 싣는 코어 계산으로 교체한다.
  v153RareCraftRows(state,plan){
    if(!C.rareCraftableLegends)return[];
    const mode=plan&&plan.mode||this.state.mode||'physical';
    const family=this.v151FamilyIntent?this.v151FamilyIntent(state):'';
    const groups=C.rareCraftableLegends(state,{mode,family,maxPerRare:8});
    const decision=plan&&plan.v15Decision||{},recommendedOrder=new Map();
    const remember=id=>{id=String(id||'');if(id&&!recommendedOrder.has(id))recommendedOrder.set(id,recommendedOrder.size+1);};
    remember(decision.action&&decision.action.id);
    for(const row of plan&&plan.actions||[])remember(row&&row.id||row&&row.unit&&row.unit.id);
    for(const row of plan&&plan.squadPlan&&plan.squadPlan.actions||[])remember(row&&row.id||row&&row.unit&&row.unit.id);
    const seen=new Set(),out=[],db=state&&state.db,counts=state&&state.counts||{};
    // v22.9(사용자: "후반에 희귀->전설 페이지에서 선택위습 숫자가 잘못 표기되는
    // 것 같아 7개라고 적혀있는데 그것보다 많이 필요할때가 많아"): 표기 선위가
    // 생 counts 로 풀려서, 파티 계획이 즉시 사용·미래 참고로 예약한 재료를
    // 이 카드도 공짜로 쓰는 걸로 가정했다 — 실전에서 그 재료는 이미 임자가
    // 있으니 실비용이 더 크다.  카드마다 계획 차감 재고(planStock)로 다시
    // 풀어 실비용을 표기하고, 차이가 나면 '예약 겹침 +N' 칩으로 밝힌다.
    // 자기 카드로 향하는 예약분은 되돌린다(이중과금 방지).  정렬·후보 수집
    // (rareCraftableLegends)은 생 counts 유지 — 표기만 정직해진다.
    const planClaims=(()=>{
      const fit=plan&&plan.squadPlan&&plan.squadPlan.handFit,tiers=fit&&fit.tiers||null,claims=new Map();
      if(!tiers)return claims;
      for(const tierKey of ['rare','special','uncommon','common'])for(const item of (tiers[tierKey]&&tiers[tierKey].rows)||[]){
        const claimed=C.num(item.spent)+C.num(item.reserved);
        if(claimed>0)claims.set(String(item.id),{claimed,usedBy:(item.usedBy||[]).map(dest=>({id:String(dest.id||''),count:C.num(dest.count)}))});
      }
      return claims;
    })();
    const upper=plan&&plan.upper||null,settings=Object.assign({},plan&&plan.settings||{},{currentRound:this.actualRound(),allowWarped:true,recommendWarped:true});
    const context={mode,purpose:'spec',round:this.actualRound(),settings,stock:counts,ruleCounts:counts,availableWisp:C.num(state&&state.wisp),deficits:plan&&plan.deficits||{rows:[]},spec:plan&&plan.spec||null,upper};
    for(const group of groups)for(const row of group.rows){
      if(seen.has(row.id))continue;
      seen.add(row.id);
      let solve=null;
      try{solve=C.recipeSolve(db,row.id,counts);}catch(_){solve=null;}
      if(!solve)continue;
      let candidate=null;
      try{candidate=C.candidateRow(state,row.unit,context);}catch(_){candidate=null;}
      const used=solve.rareUse||{},missing=solve.buildNeeded&&solve.buildNeeded.rare||{};
      const ids=[...new Set(Object.keys(used).concat(Object.keys(missing)))];
      const ingredients=ids.map(id=>{
        const owned=C.num(used[id]),short=C.num(missing[id]);
        return{id,name:C.materialName(db,id),owned,short,total:owned+short};
      }).filter(item=>item.total>0);
      const owned=ingredients.reduce((sum,item)=>sum+item.owned,0);
      const short=ingredients.reduce((sum,item)=>sum+item.short,0);
      const total=owned+short;
      if(owned<=0||total<=0)continue;
      const blocked=candidate&&Array.isArray(candidate.blocked)?candidate.blocked:[];
      const feasible=candidate?!!candidate.feasible:!Object.keys(solve.hardMissing||{}).length&&C.num(solve.wispCost)<=C.num(state&&state.wisp);
      // 계획 차감 재고로 실비용 재계산 — 이 카드로 향하는 예약분은 반환.
      let planWispCost=null,planExtra=0;
      if(planClaims.size){
        const planCounts=Object.assign({},counts);
        for(const [materialId,claim] of planClaims){
          const back=(claim.usedBy||[]).filter(dest=>dest.id===String(row.id)).reduce((sum,dest)=>sum+C.num(dest.count),0);
          const take=Math.max(0,C.num(claim.claimed)-back);
          if(take>0)planCounts[materialId]=Math.max(0,C.num(planCounts[materialId])-take);
        }
        try{const planSolve=C.recipeSolve(db,row.id,planCounts);planWispCost=C.num(planSolve&&planSolve.wispCost);planExtra=Math.max(0,planWispCost-C.num(solve.wispCost));}catch(_){planWispCost=null;planExtra=0;}
      }
      out.push({
        planWispCost,planExtra,
        unit:row.unit,
        solve,
        roles:row.roles||'역할 보조',
        // v19.7(사용자 요청 ②): 카드 빈 공간을 "이걸 만들면 무엇이 닫히나"로
        // 채운다 — 후보 계산이 이미 아는 covers 를 실어 보낸다.
        covers:candidate&&candidate.covers||[],
        rareSpend:{total:owned,byId:ingredients.filter(item=>item.owned>0).map(item=>({id:item.id,name:item.name,use:item.owned}))},
        rareProgress:{owned,short,total,ratio:total?owned/total:0,ingredients},
        feasible,
        blocked,
        wispGap:candidate?C.num(candidate.wispGap):Math.max(0,C.num(solve.wispCost)-C.num(state&&state.wisp)),
        recommendationRank:recommendedOrder.get(String(row.id))||0
      });
    }
    const ranked=out.sort((a,b)=>{
      const ar=C.num(a.recommendationRank),br=C.num(b.recommendationRank);
      if(!!ar!==!!br)return Number(!!br)-Number(!!ar);
      if(ar&&br&&ar!==br)return ar-br;
      if(!!a.feasible!==!!b.feasible)return Number(!!b.feasible)-Number(!!a.feasible);
      if(C.num(b.rareProgress&&b.rareProgress.ratio)!==C.num(a.rareProgress&&a.rareProgress.ratio))return C.num(b.rareProgress&&b.rareProgress.ratio)-C.num(a.rareProgress&&a.rareProgress.ratio);
      if(C.num(b.rareProgress&&b.rareProgress.owned)!==C.num(a.rareProgress&&a.rareProgress.owned))return C.num(b.rareProgress&&b.rareProgress.owned)-C.num(a.rareProgress&&a.rareProgress.owned);
      if(C.num(a.solve&&a.solve.wispCost)!==C.num(b.solve&&b.solve.wispCost))return C.num(a.solve&&a.solve.wispCost)-C.num(b.solve&&b.solve.wispCost);
      return displayNameOf(a.unit).localeCompare(displayNameOf(b.unit),'ko');
    }).slice(0,8);
    // v19.8(사용자 요청 ③): "빈칸이 너무 많음, 6개 정도 보이게" — 지금 희귀로
    // 진행 중인 조합이 6개 미만이면, 아직 희귀가 없는 최근접 전설을
    // "노리기" 카드로 채운다(부족 희귀가 적은 순).  패가 바뀔 때만 재계산.
    if(ranked.length<6&&db&&Array.isArray(db.legendish)){
      const upcomingKey=`${this._normalizedCacheKey||''}|${mode}|upcoming`;
      if(upcomingKey!==this._upcomingCraftKey){
        const familyOk=unit=>{const f=C.familyOf(unit);return f==='neutral'||!mode||f===mode;};
        const pool=[];
        for(const unit of db.legendish){
          if(C.num(counts[unit.id])>0||C.isUpper(unit)||!familyOk(unit))continue;
          let solve=null;try{solve=C.recipeSolve(db,unit.id,counts);}catch(_){continue;}
          if((solve.hardMissing||[]).length)continue;
          const missing=solve.buildNeeded&&solve.buildNeeded.rare||{};
          const missingIds=Object.keys(missing);
          const shortTotal=missingIds.reduce((sum,id)=>sum+C.num(missing[id]),0);
          if(!shortTotal||shortTotal>4)continue;
          pool.push({unit,solve,roles:C.summarizeRoles({role:C.roleProfile(unit)},mode),covers:[],
            rareSpend:{total:0,byId:[]},
            rareProgress:{owned:0,short:shortTotal,total:shortTotal,ratio:0,ingredients:missingIds.map(id=>({id,name:C.materialName(db,id),owned:0,short:C.num(missing[id]),total:C.num(missing[id])}))},
            feasible:false,blocked:[],wispGap:Math.max(0,C.num(solve.wispCost)-C.num(state&&state.wisp)),recommendationRank:0,upcoming:true});
        }
        pool.sort((a,b)=>a.rareProgress.short-b.rareProgress.short||C.num(a.solve.wispCost)-C.num(b.solve.wispCost)||displayNameOf(a.unit).localeCompare(displayNameOf(b.unit),'ko'));
        this._upcomingCraftCache=pool.slice(0,6);this._upcomingCraftKey=upcomingKey;
      }
      for(const row of this._upcomingCraftCache||[]){
        if(ranked.length>=6)break;
        if(seen.has(String(row.unit.id)))continue;
        ranked.push(row);
      }
    }
    return ranked;
  }
  renderV152RareCraftable(state,plan){
    if(!C.rareCraftableLegends)return'';
    const mode=plan&&plan.mode||this.state.mode||'physical';
    const family=this.v151FamilyIntent?this.v151FamilyIntent(state):'';
    const groups=C.rareCraftableLegends(state,{mode,family,maxPerRare:6});
    const head='<small>지금 가진 희귀함으로 만들 수 있는 전설급 · 추천과 무관한 현재 패 사실</small>';
    if(!groups.length)
      return`<div class="v152-rare-craftable">${head}<div class="v151-empty"><b>희귀함으로 지금 만들 수 있는 전설급 없음</b><span>희귀함을 아직 안 들었거나, 들고 있는 희귀함을 쓰는 전설급이 특수 선행재료로 막혀 있습니다.</span></div></div>`;
    const readyTotal=groups.reduce((sum,group)=>sum+C.num(group.readyCount),0);
    const cards=groups.map(group=>{
      const rows=group.rows.map(row=>{
        const state=row.ready?'ready':row.blocked?'blocked':'wait';
        const cost=row.ready?`선위 ${C.num(row.wispCost)}`:row.blocked?'선행재료 부족':`선위 ${C.num(row.wispGap)} 부족`;
        const missing=!row.ready&&!row.blocked&&(row.missing||[]).length?` · ${(row.missing||[]).map(item=>C.esc(item.name)).join(' · ')}`:'';
        return`<button class="${state}" data-act="detail" data-id="${C.esc(row.id)}"><span><b>${C.esc(displayNameOf(row.unit))}</b><small>${C.esc(row.roles||'역할 보조')}</small></span><em>${C.esc(cost)}${missing}</em></button>`;
      }).join('');
      const more=group.total>group.rows.length?`<i class="v152-more">외 ${group.total-group.rows.length}종</i>`:'';
      return`<div class="v152-rare-group"><div class="v152-rare-head"><b>${C.esc(displayNameOf(group.unit))}</b><span>×${C.num(group.owned)} · 바로 제작 ${C.num(group.readyCount)}/${C.num(group.total)}</span>${more}</div>${rows}</div>`;
    }).join('');
    return`<div class="v152-rare-craftable">${head}<div class="v152-rare-summary">보유 희귀 ${groups.length}종 · 지금 바로 만들 수 있는 전설급 <b>${readyTotal}</b>개</div>${cards}</div>`;
  }
  renderV151BuildableLegends(state,plan){
    const rows=this.v151BuildableLegendRows(state,plan);
    if(!rows.length){
      const nearest=this._buildableNearest||[];
      if(!nearest.length)return`<div class="v151-empty"><b>지금 확정 제작 가능한 전설급 없음</b><span>특수 선행재료와 선택위습까지 실제 보유분만 계산했습니다.</span></div>`;
      return`<div class="v151-nearest"><small>지금은 못 만들지만 가장 가까운 목표</small>${nearest.map(item=>{const missing=(item.missing||[]).map(entry=>`${entry.name}${C.num(entry.count!=null?entry.count:entry.need)>1?`×${C.num(entry.count!=null?entry.count:entry.need)}`:''}`).join(' · ');return`<button data-act="detail" data-id="${C.esc(item.unit.id)}">${item.unit.image?`<img src="${C.esc(item.unit.image)}" alt="">`:''}<span><b>${C.esc(displayNameOf(item.unit))}${this.v151StoryTag(item.unit)}</b><small>${missing?`부족: ${C.esc(missing)}`:'재료 충족 · 선위 대기'}</small></span><em>선위 ${C.num(item.wispCost)}</em></button>`;}).join('')}</div>`;
    }
    return`<div class="v151-build-list">${rows.map((row,index)=>{const rare=(row.rareSpend&&row.rareSpend.byId||[]).slice(0,2).map(item=>`${item.name}×${C.num(item.use)}`).join(' · '),blocked=(row.blocked||[])[0],status=row.feasible?'현재 패 제작 가능':blocked||C.num(row.wispGap)>0?blocked||`선위 ${C.num(row.wispGap)} 부족`:'후속 재료 대기',reason=row.squadSupport?`최종 파티 ${row.squadSupportRank}순위 · ${row.squadSupportReason}`:(row.covers||[]).slice(0,2).join(' · ')||C.summarizeRoles({role:row.role},plan.mode);return`<button data-act="detail" data-id="${C.esc(row.unit.id)}"><span class="v151-rank">${index+1}</span>${row.unit.image?`<img src="${C.esc(row.unit.image)}" alt="">`:''}<span><b>${row.squadSupport?'<i class="v151-pick-badge">추천</i>':''}${C.esc(displayNameOf(row.unit))} <i>(${C.esc(tierLabel(row.unit))})</i></b><small>${C.esc(reason)} · ${C.esc(status)}</small><em>${C.esc(rare||'희귀 직접소모 없음')} · 선위 ${C.num(row.solve.wispCost)}</em></span></button>`;}).join('')}</div>`;
  }

  v151VirtualSpecialForecast(state,plan){
    const id=String(this.state.virtualSpecialId||''),special=id&&state.db&&state.db.byId.get(id);if(!special)return{special:null,rows:[]};const model=plan&&plan.v15Decision&&plan.v15Decision.model,details=model&&model.effective&&model.effective.completionById||{},alreadyOwned=state.virtualApplied!==true,specialProgress=C.completionPercent(state,special),rows=[];
    // v20.5: 행 자체는 그대로 완성도 반사실로 고르되, 화면에 내보낼 사실은
    // 선택위습 환산으로 바꾼다("티모 %이제 필요없잖아 없애줘").  모델 경로는
    // recipe 에 before/after/saved 를 이미 실어 보내므로 그대로 들고 가고,
    // 모델이 없는 대체 경로는 레시피에 박힌 필요 장수만 말한다 — 없는 값을
    // 지어내지 않는다.
    for(const unit of state.db.rares||[]){const detail=details[unit.id];if(detail&&String(detail.virtualSpecialId||id)===id){if(!detail.isProjected&&!(unit.stuffs||[]).some(item=>item&&item.id===id))continue;const recipe=detail.recipe||null;rows.push({unit,current:C.num(detail.originalTmoPercent),predicted:C.num(detail.predictedTmoPercent),delta:C.num(detail.delta),isProjected:!!detail.isProjected,reason:detail.reason||'',wispBefore:recipe?C.num(recipe.beforeWispEquivalent):null,wispAfter:recipe?C.num(recipe.afterWispEquivalent):null,wispSaved:recipe?C.num(recipe.savedWispEquivalent):null,required:(unit.stuffs||[]).filter(item=>item&&item.id===id).reduce((sum,item)=>sum+C.num(item.count),0)});continue;}const direct=(unit.stuffs||[]).filter(item=>item&&item.id===id),required=direct.reduce((sum,item)=>sum+C.num(item.count),0);if(!required)continue;const total=(unit.stuffs||[]).reduce((sum,item)=>sum+C.num(item.count),0)||1,share=100*required/total,delta=alreadyOwned?0:share*Math.max(0,1-specialProgress/100),current=C.completionPercent(state,unit),predicted=Math.min(100,current+delta);rows.push({unit,current,predicted,delta,isProjected:delta>0,reason:'ui-fallback-direct-recipe',wispBefore:null,wispAfter:null,wispSaved:null,required});}
    rows.sort((a,b)=>Number(b.isProjected)-Number(a.isProjected)||C.num(b.wispSaved)-C.num(a.wispSaved)||b.delta-a.delta||displayNameOf(a.unit).localeCompare(displayNameOf(b.unit),'ko'));return{special,alreadyOwned,specialProgress,rows:rows.slice(0,5),source:model?'v15-completion-model':'direct-recipe-fallback'};
  }

  renderV151RewardForecast(state,plan){
    const id=String(this.state.virtualSpecialId||''),options=(C.eligible152Specials?C.eligible152Specials(state.db):state.db&&state.db.specials||[]).map(unit=>`<option value="${C.esc(unit.id)}" ${id===unit.id?'selected':''}>${C.esc(displayNameOf(unit))}</option>`).join(''),forecast=this.v151VirtualSpecialForecast(state,plan);
    return`<label class="v151-reward-select"><span>152킬 특별함</span><select data-opt="virtualSpecialId"><option value="">받은 유닛 선택</option>${options}</select></label>${forecast.special?`<div class="v151-forecast-head">${forecast.special.image?`<img src="${C.esc(forecast.special.image)}" alt="">`:''}<span><b>${C.esc(displayNameOf(forecast.special))}</b><small>이 보상이 대신해 주는 재료를 희귀별로 표시</small></span></div><div class="v151-forecast-list">${forecast.rows.map(row=>`<div class="${row.isProjected?'projected':'observed'}"><b>${C.esc(displayNameOf(row.unit))}</b><span>${row.wispSaved>0?`선택위습 ${fmt(row.wispBefore)} → <strong>${fmt(row.wispAfter)}</strong>`:row.isProjected?`재료 <strong>×${C.num(row.required)}</strong> 충당`:'이미 패에 반영됨'}</span><em>${row.wispSaved>0?`선위 ${fmt(row.wispSaved)} 절약`:row.isProjected?'가까워짐':'변화 없음'}</em></div>`).join('')||'<small>이 특별함을 쓰는 희귀 조합이 없습니다.</small>'}</div>`:`<small class="v151-reward-idle">보상은 시작 시 1종 고정 추첨(각 1/32 · 압살롬 제외) — 확인하면 위에서 선택해 잠그세요.</small>`}<small class="v151-estimate-note">레시피 반사실 계산입니다 — 실제 패를 바꾸지 않고, 이 보상을 받았다고 가정했을 때 줄어드는 재료만 보여 줍니다.</small>`;
  }

  renderV151Gorosei(state,plan){
    const selected=C.GOROSEI[this.state.gorosei]||C.GOROSEI.none,mode=this.state.mode==='magic'?'Magic':'Physical',slow=C.num(selected[`slow${mode}`]);
    const preview=C.bossPreview?C.bossPreview(this.actualRound(),this.state.gorosei):null;
    const koNum=value=>{value=C.num(value);if(value>=1e8)return`${(Math.round(value/1e6)/100).toFixed(2).replace(/\.?0+$/,'')}억`;if(value>=1e4)return`${Math.round(value/1e4)}만`;return String(Math.round(value));};
    // v17.8(사용자 요청 4): 보스 HP·필요 DPS 원수치만으로는 행동으로
    // 이어지지 않았다(62라 전멸 판에서 방깎 107 부족이 이 카드에 반영
    // 안 됨). "필요 vs 내 추정 보유" 대조와 유효 방깎(정적+암브 환산),
    // 방깎 목표 도달 시 피해 이득을 함께 계산한다. 킬 판정은 하지 않는다.
    const bossHtml=preview?(()=>{
      const armorRow=(plan&&plan.deficits&&plan.deficits.rows||[]).find(row=>row.key==='armor'),staticReduce=armorRow?C.num(armorRow.current):0;
      const ab=C.armorBreakModel?C.armorBreakModel(plan&&plan.spec||{},{bossArmor:preview.bossArmor,armorReduce:staticReduce}):null;
      const effReduce=staticReduce+(ab?C.num(ab.stacks):0);
      const rows=[`<div><small>다음 보스</small><b>${preview.round}라 ${C.esc(preview.boss)}</b><span>HP ${koNum(preview.hp)}${preview.regen?` · 재생 ${koNum(preview.regen)}/초`:''} · ${preview.time}초 · 라인 35마리 별도</span></div>`];
      // 필요 vs 보유: 확정 상위 평타+스킬유발 하한으로 커버율 계산.
      const lock=this.upperLock(),upper=lock&&state&&state.db?state.db.byId.get(lock.id):null;
      const duel=(()=>{
        if(!upper||preview.bossArmor==null||!C.upperBossDps)return null;
        const level=C.num(this.state.upperResearchLevel)||1;
        const speedRow=(plan.deficits&&plan.deficits.rows||[]).find(row=>row.key==='speed'),speedBuff=speedRow?C.num(speedRow.current):0;
        const base=C.upperBossDps(upper,level,{bossArmor:preview.bossArmor,armorReduce:effReduce,speedBuffPct:speedBuff});
        if(!base)return null;
        const proc=C.upperSkillProcDps?C.upperSkillProcDps(upper,level,{bossArmor:preview.bossArmor,armorReduce:effReduce,speedBuffPct:speedBuff}):null;
        // v17.21: 미검증 스킬 프로필은 신뢰도만큼 감산한 값을 쓴다.
        const combined=base.effective+(proc?C.num(proc.trustedDps!=null?proc.trustedDps:proc.dps):0);
        return{combined,coverage:Math.round(100*combined/Math.max(1,C.num(preview.dpsNeed))),dpsTrust:proc?C.num(proc.trust):1,dpsVerified:!proc||proc.verified!==false};
      })();
      if(duel)rows.push(`<div class="${duel.coverage>=100?'ok':'gap'}"><small>필요 ${koNum(preview.dpsNeed)}/초 vs 내 상위 추정 하한</small><b>${koNum(duel.combined)}/초 · 커버 ${duel.coverage}%</b><span>평타+스킬유발 하한 · 수동스킬·보조딜 미집계 — 충족 표시도 킬 보장 아님</span></div>`);
      else rows.push(`<div><small>보스 단독 필요 DPS</small><b>${koNum(preview.dpsNeed)}/초</b><span>상위 확정 후 내 추정 하한과 대조합니다</span></div>`);
      if(preview.bossArmor!=null){
        const multNow=C.armorMultiplier(C.num(preview.bossArmor)-effReduce);
        const targetReduce=C.num(selected.armorSoft)||190;
        const multTarget=C.armorMultiplier(C.num(preview.bossArmor)-targetReduce);
        const gain=multNow>0?Math.round((multTarget/multNow-1)*100):0;
        rows.push(`<div class="${effReduce>=targetReduce?'ok':'gap'}"><small>유효 방깎 = 정적 ${Math.round(staticReduce)}${ab&&ab.stacks>0?` + 암브 환산 ${C.num(ab.stacks)}(${C.num(ab.units)}기·정착 추정)`:''}</small><b>${Math.round(effReduce)} → 피해 배율 ${multNow.toFixed(3)}</b><span>${effReduce>=targetReduce?`실전 목표 ${targetReduce} 도달`:`실전 목표 ${targetReduce}까지 정적 ${Math.max(0,Math.round(targetReduce-effReduce))} 남음 — 도달 시 피해 +${gain}%`}</span></div>`);
      }
      if(preview.line)rows.push(`<div><small>${preview.line.withBoss?'동시 라인':'직전 라인'}</small><b>${preview.line.round}라 ${C.esc(preview.line.name)} ×${preview.line.count}</b><span>HP ${koNum(preview.line.hp)} · 방어 ${C.num(preview.line.armor)}</span></div>`);
      return`<div class="v151-boss-preview">${rows.join('')}</div>`;
    })():'';
    const story10=this.state.story10Reward,story10Options=[['','미정 (레일리 경로 후보 유지)'],['rayleigh','레일리+해적선 선택'],['kuma','초월 쿠마 선택'],['chest','유니크·상자 선택']];
    // v17.12(사용자 요청 1): 스크롤 없이 다 보이게 — 선택 2개는 한 줄,
    // 목표 수치 3개도 한 줄, 보스 대조는 2열 격자로 압축한다(CSS).
    return`<div class="v151-gorosei-selects"><label class="v151-gorosei-select"><span>이번 판 오로성</span><select data-opt="gorosei">${Object.values(C.GOROSEI).map(item=>`<option value="${item.key}" ${selected.key===item.key?'selected':''}>${C.esc(item.name)}</option>`).join('')}</select></label><label class="v151-gorosei-select v151-story10-select"><span>스토리 10 보상</span><select data-opt="story10Reward">${story10Options.map(([value,label])=>`<option value="${value}" ${story10===value?'selected':''}>${C.esc(label)}</option>`).join('')}</select></label></div><div class="v151-gorosei-values"><span><small>이감 목표·상한</small><b>${slow}</b></span><span><small>물딜 방깎 실전·풀</small><b>${C.num(selected.armorSoft)}·${C.num(selected.armorSafe)}</b></span><span><small>스턴 운용·안정</small><b>1.0·${fmtStun(selected.stun)}</b></span></div>${(()=>{const lab=this.state.labResearch||{},box=(key,label)=>`<label><input type="checkbox" data-upg="${key}" ${lab[key]?'checked':''}><span>${label}</span></label>`;return`<div class="v151-upg-row"><small>연구소 <i>풀 강화 가정 · 다르면 해제</i></small>${box('attack','공업+12%')}${box('slow','이감+10')}${box('hpRegen','체젠+0.45')}${box('mpRegen','마젠+0.8')}<label class="v151-upg-level"><span>등급 공업 Lv</span><input type="number" min="1" max="21" data-upg="upperLevel" value="${C.num(this.state.upperResearchLevel)||1}"></label></div>`;})()}${bossHtml}<div class="v151-reward-inline">${this.renderV151RewardForecast(state,plan)}</div>`;
  }

  // v17.12(사용자 요청 3): "스토리가 빨라서" 같은 일반 문장 대신, 현재
  // 희귀 패를 근거로 쓴다 — 이 상위가 소비하는 희귀, 만들고 남는 희귀로
  // 이어지는 전설급, 그 전설이 닫는 결손(광보잡·방깎 등)을 실제 레시피
  // 계산(quote.after 재고)으로 뽑아 문장으로 조립한다.
  v151ClearWhy(state,plan,row){
    const unit=row.unit||state.db&&state.db.byId.get(row.id);
    if(!unit||!state||!state.db)return'';
    const cacheRoot=`${this._normalizedCacheKey||''}|${this.actualRound()}|${this.state.mode||''}|${this.state.magicRoute||''}|${this.state.gorosei||''}`;
    if(this._whyCacheRoot!==cacheRoot){this._whyCache=new Map();this._whyCacheRoot=cacheRoot;}
    const cacheKey=`${row.id}|${row.routeKey||''}|${C.num(row.blueprintEvaluation&&row.blueprintEvaluation.rank)}|${C.num(row.angleBand)}`;
    if(this._whyCache.has(cacheKey))return this._whyCache.get(cacheKey);
    const bundle=row.blueprintEvaluation;
    if(bundle&&bundle.basis==='upper-plus-support-full-squad'){
      const tier=bundle.powerTier||row.powerTier||{},effectiveLetters={0:'F',1:'D',2:'C',3:'B',4:'A',5:'S'},effective=tier.known?effectiveLetters[Math.max(0,Math.min(5,C.num(bundle.effectiveTierRank)))]||tier.letter:'',promotion=C.num(bundle.tierPromotion),tierText=tier.known?`기본 ${tier.letter}티어 · ${bundle.angleLabel||row.angleLabel||'미래각'}${promotion>0?`(+${promotion} → 실효 ${effective})`:''}`:'티어 미확인',supports=(bundle.supports||[]).map(item=>`${item.name}${item.memoMatched&&C.num(item.memoRank)>0?`(상위별 ${C.num(item.memoRank)}위)`:''}`).slice(0,3),parts=[tierText,`상위 단독 점수가 아니라 ${C.num(bundle.plannedEquivalent)}/${C.num(bundle.targetEquivalent)||9}환산 전체 조합 ${C.num(bundle.rank)}위`];
      if(supports.length)parts.push(`보조안 ${supports.join(' · ')}`);
      parts.push(bundle.roleComplete?'필수 역할 합계 충족':`현재 패 참고안 역할 준비도 ${C.num(bundle.readiness)}%`);
      if(C.num(bundle.materialOverlapPenalty)>0)parts.push(`재료 중복압력 ${fmt(bundle.materialOverlapPenalty)}`);
      if(C.num(bundle.controlOverflow)>0)parts.push(`제어 과잉 ${fmt(bundle.controlOverflow)}`);
      const html=`<small class="v151-clear-why">${C.esc(parts.join('. '))}.</small>`;this._whyCache.set(cacheKey,html);return html;
    }
    const db=state.db,quote=row.quote||null,value=row.clearValue||{};
    const nameOfId=id=>{const material=db.byId.get(id);return material?displayNameOf(material):String(id);};
    // 1) 이 상위가 지금 패에서 소비하는 희귀.
    const rareUse=Object.entries(quote&&quote.rareUse||{}).filter(([,count])=>C.num(count)>0).map(([id,count])=>`${nameOfId(id)}${C.num(count)>1?`×${C.num(count)}`:''}`);
    // 2) 상위 완성 후에도 열려 있는 필수 결손(투영 평가 우선).
    const assessment=row.projectedAssessment||plan&&plan.v15Decision&&plan.v15Decision.assessment||{};
    const open=(assessment.requirements||[]).filter(item=>item.required!==false&&!item.waived&&C.num(item.gap)>0);
    // 3) 상위를 만들고 남는 패(quote.after)로 그 결손을 닫는 전설급 2개.
    const after=quote&&quote.after?quote.after:state.counts;
    const mode=row.mode||(C.familyOf(unit)==='magic'?'magic':'physical');
    const closers=[];
    if(open.length&&C.roleContribution){
      const settings=Object.assign({},plan&&plan.settings||{},{currentRound:this.actualRound()});
      for(const legend of db.legendish){
        if(closers.length>=2)break;
        if(C.isUpper(legend)||C.num(after[legend.id])>0)continue;
        if(C.familyOf(legend)===(mode==='physical'?'magic':'physical'))continue;
        const contribution=C.roleContribution(legend,mode);
        const hits=open.filter(item=>C.num(contribution[item.key])>0);
        if(!hits.length)continue;
        const candidate=C.candidateRow(state,legend,{mode,purpose:'spec',round:this.actualRound(),settings,stock:after,ruleCounts:after,availableWisp:C.num(after[C.WISP_ID]),deficits:{rows:[]}});
        if(!candidate||!candidate.solve)continue;
        const hardBlocked=(candidate.blocked||[]).filter(text=>!/선택 위습/.test(String(text)));
        if(hardBlocked.length)continue;
        const legendRares=Object.entries(candidate.solve.rareUse||{}).filter(([,count])=>C.num(count)>0).map(([id])=>nameOfId(id));
        closers.push({name:displayNameOf(legend),hits:hits.slice(0,2).map(item=>item.label),rares:legendRares});
      }
    }
    const strategy=C.upperStrategy?C.upperStrategy(unit):{};
    const parts=[];
    parts.push(rareUse.length?`보유 희귀 ${rareUse.join('·')}를 소비해 ${row.name} 완성`:`${row.name}는 지금 희귀 소비 없이 완성 가능`);
    if(closers.length){
      const closerRares=[...new Set(closers.flatMap(item=>item.rares))].slice(0,4);
      const closerText=closers.map(item=>`${item.name}(${item.hits.join('·')})`).join('과 ');
      const solvedLabels=[...new Set(closers.flatMap(item=>item.hits))].join('·');
      parts.push(`${closerRares.length?`남는 희귀 ${closerRares.join('·')}로 `:'남는 패로 '}${closerText}를 만들어 ${solvedLabels} 결손을 닫을 수 있습니다`);
    }else if(open.length){
      parts.push(`남는 패로는 ${open.slice(0,2).map(item=>item.label).join('·')} 결손이 아직 닫히지 않습니다 — 리롤·드랍 목표로 연결하세요`);
    }else{
      parts.push('이 상위 기준 필수 역할은 전부 충족됩니다');
    }
    const dpsPct=Math.round(C.num(value.dpsCover)*100);
    const meta=[];
    if(dpsPct>0)meta.push(`보스 화력 하한 ${dpsPct}%`);
    // v17.13: 실측 근거 칩 — 표시 전용, 순위는 원장 판단이 결정.
    // v18.1: 표본이 상위권 55인에서 전수(4,863명)로 바뀌어 라벨도 "전체 실측".
    if(C.num(value.metaGames)>0)meta.push(`전체 실측 ${C.num(value.metaGames)}판 (${value.metaShare}%)`);
    if(strategy.lineSelf==='support')meta.push('라인딜 부족 — 보조딜 필수(파티에 자동 반영)');
    if(row.storyReward)meta.push('스토리 10 보상(레일리+해적선) 선택 전제');
    if(row.specialGate)meta.push(`${row.specialGate.items.map(item=>item.name).join('·')} 확보 전제`);
    const html=`<small class="v151-clear-why">${C.esc(parts.join('. '))}.${meta.length?` <em>${C.esc(meta.join(' · '))}</em>`:''}</small>`;
    this._whyCache.set(cacheKey,html);
    return html;
  }

  // v17.12(사용자 요청 4): 라이브 코치는 v15 권위 판단만 쓰므로 legacy
  // 게이트(!ORDV15Engine) 뒤의 squadPlan은 항상 죽어 있었다 — 파티는
  // 여기서 플래너를 직접 호출해 계산한다.  비용이 커서 렌더마다 돌리지
  // 않고 "미리 파티" 버튼을 눌렀을 때만 계산하며, 패 지문+상위로 캐시한다.
  v151ComputeParty(state,plan,upperId){
    const planner=global.ORDSquadPlanner;
    if(!planner||typeof planner.planFinalSquad!=='function'||!upperId||!state||!state.db)return null;
    const unit=state.db.byId.get(upperId);
    if(!unit||!C.isUpper(unit))return null;
    const mode=C.familyOf(unit)==='magic'?'magic':'physical';
    const baseSettings=plan&&plan.settings||{};
    // v19.1(버그 수정): 이 함수는 확정 상위의 진짜 파티(panel 5의
    // squadPlan)와 결정 엔진의 livePlan.squadPlan을 모두 만드는 유일한
    // 자리인데, 여기서 upperBlueprint·preferredLineupIds를 항상 비워
    // 넘기고 있었다.  그래서 상위 확정 시 자동으로 잡히는 전체 파티
    // 청사진(captureUpperBlueprint)도, 방금 추가한 수동 "파티 확정"
    // 버튼(captureCurrentParty)도 실제로는 아무 효과가 없었다 — 확정은
    // 상태에 저장되고 화면에 "확정됨"으로 뜨지만, 이 함수가 매번 새로
    // 계산하는 파티에는 반영되지 않았다.  지금 미리보는 상위와 확정된
    // 상위가 같을 때만 청사진을 넘긴다 — 다른 상위를 미리보는 중에 남의
    // 청사진이 섞이면 안 된다.
    const confirmed=normalizeUpperBlueprint(this.state.upperBlueprint),blueprintForPreview=confirmed&&C.canonicalUpperId(confirmed.upperId)===C.canonicalUpperId(upperId)?confirmed:null;
    const plannerSettings=Object.assign({},baseSettings,{mode,upperPreviewId:upperId,preferredLineupIds:blueprintForPreview?blueprintForPreview.lineupIds:[],targetSquadCount:9});
    // 다른 상위 잠금은 프리뷰 계산에서만 제외한다(상태는 건드리지 않음).
    const locks=(this.state.locks||[]).filter(lock=>!(lock&&lock.stage==='upper'&&C.canonicalUpperId(lock.id)!==C.canonicalUpperId(upperId)));
    const key=[fingerprint(this.state.snapshot),upperId,mode,String(plannerSettings.magicRoute||''),this.actualRound(),JSON.stringify(this.state.manualCounts||{}),locks.map(lock=>`${lock.stage}:${lock.id}`).join(','),String(this.state.gorosei||''),String(this.state.virtualSpecialId||''),blueprintForPreview?`${blueprintForPreview.revision}:${blueprintForPreview.commitment}`:''].join('|');
    // v17.15.1(감사): 단일 슬롯 캐시는 3번 패널 인라인 파티와 미리 파티
    // 모달이 서로 다른 상위일 때 렌더마다 서로를 축출해 플래너가 2회씩
    // 돌았다(렌더당 ~350ms) — LRU 4 Map으로 두 소비자가 공존한다.
    // 플래너는 이제 (스냅샷·설정·상위) 조합이 바뀔 때만 1회 실행된다.
    if(!this._partyCacheMap)this._partyCacheMap=new Map();
    if(this._partyCacheMap.has(key)){const hit=this._partyCacheMap.get(key);this._partyCacheMap.delete(key);this._partyCacheMap.set(key,hit);return hit;}
    let squad;
    try{const run=typeof planner.planAdaptiveFinalSquad==='function'?planner.planAdaptiveFinalSquad:planner.planFinalSquad;squad=run({catalog:this.catalog,state,settings:plannerSettings,locks,upperBlueprint:blueprintForPreview,corePlan:plan,upperMemo:global.ORD_UPPER_MEMO,synergyMemo:global.ORD_SYNERGY_MEMO},{minTarget:9,maxTarget:11});}
    catch(error){squad={error:String(error&&error.message||error),finalLineup:[],actions:[]};}
    this._partyCacheMap.set(key,squad);
    while(this._partyCacheMap.size>4)this._partyCacheMap.delete(this._partyCacheMap.keys().next().value);
    return squad;
  }
  v151ProtectRareDecision(decision,squad,state){
    if(!decision||!squad||!state||!state.db)return decision;
    const allocation=new Map((squad.rareAllocation||[]).map(row=>[String(row.id),row]));
    const deadlineRows=new Map((squad.timelineReadiness&&squad.timelineReadiness.rare&&squad.timelineReadiness.rare.rows||[]).map(row=>[String(row.id),row]));
    const originalRows=new Map((decision.rare&&decision.rare.rows||[]).map(row=>[String(row.id),row]));
    const quoteUse=decision.action&&decision.action.quote&&decision.action.quote.rareUse||decision.action&&decision.action.row&&decision.action.row.solve&&decision.action.row.solve.rareUse||{};
    // v17.25: the global nine-unit draft may omit a current-hand ship angle
    // even when the selected Upper's curated package ranks it first. Preserve
    // the exact-feasible recommended ship's Rares so Wiper/Usopp are not
    // offered as rerolls while Maxim is sitting at 0 wisp.
    const shipPlan=this.v151ShipPlan(state),shipTarget=shipPlan&&shipPlan.legendRows.find(row=>String(row.unit&&row.unit.id)===String(shipPlan.recommendedId)&&row.familyFit&&row.feasible)||null,shipRareUse=shipTarget&&shipTarget.rareUse||{};
    // v19.10(외부 점검 P0-2 — 희귀 기회 원장): 목적지를 이름 두 개로 뭉개지
    // 않고 {unitId,unitName,count,source} 그대로 보존한다.  '희귀→전설'
    // 카드가 즉시 제작 가능이라고 보여주는 희귀도 목적지다 — 같은 화면이
    // 한쪽에서 "이걸로 A를 만들 수 있음", 다른쪽에서 "사용처 없음 · 리롤"
    // 이라 말하는 모순(제작 후보 ∩ 리롤 = ∅ 계약)을 원장에서 막는다.
    // v19.10(검증 수리): 패널(v153RareCraftRows)과 '같은 스코프'로 계산해야
    // 교집합 계약이 양방향으로 성립한다 — family 필터 없이 돌리면 화면에
    // 없는 반대 계열 전설을 근거로 리롤을 막는다.  결과는 수량 지문으로
    // 캐시한다(렌더마다 recipeSolve 전량 재계산 방지 — 실측 24~68ms).
    let craftableByRare=new Map();
    try{
      const family=this.v151FamilyIntent?this.v151FamilyIntent(state):'';
      const craftKey=`${state.snapshot&&state.snapshot.dataHash||''}|${JSON.stringify(this.state.manualCounts||{})}|${this.state.mode||''}|${family}`;
      if(this._v1910CraftableKey===craftKey&&this._v1910CraftableMap)craftableByRare=this._v1910CraftableMap;
      else{
        for(const group of C.rareCraftableLegends(state,{mode:['physical','magic'].includes(this.state.mode)?this.state.mode:'physical',family,maxPerRare:8})||[]){
          const readyRows=(group.rows||[]).filter(row=>row.ready&&!row.blocked);
          if(readyRows.length)craftableByRare.set(String(group.id),readyRows.slice(0,3));
        }
        this._v1910CraftableKey=craftKey;this._v1910CraftableMap=craftableByRare;
      }
    }catch(_){}
    const rows=[];
    for(const unit of state.db.rares||[]){
      const id=String(unit.id),initial=Math.max(0,C.num(state.counts[id]));
      if(initial<=0)continue;
      const original=originalRows.get(id)||{},deadline=deadlineRows.get(id),planned=allocation.get(id);
      const use=Math.min(initial,Math.max(0,C.num(quoteUse[id])));
      let protectedTotal=0,destinations=[];
      if(deadline){
        protectedTotal=Math.max(0,C.num(deadline.spent)+C.num(deadline.hold));
        destinations=(deadline.destinations||[]).filter(item=>item&&item.disposition==='hold').map(item=>({unitId:String(item.id||''),unitName:String(item.name||item.id||''),count:Math.max(1,C.num(item.count)),source:'timeline'}));
      }else if(planned){
        protectedTotal=Math.max(0,C.num(planned.spent)+C.num(planned.reserved));
        destinations=(planned.usedBy||[]).filter(item=>item&&['spent','reserved'].includes(item.status)).map(item=>({unitId:String(item.id||''),unitName:String(item.name||item.id||''),count:Math.max(1,C.num(item.count)),source:'party'}));
      }else if(original.proof&&Array.isArray(original.proof.liveCombat)&&original.proof.liveCombat.length){
        protectedTotal=Math.max(0,C.num(original.hold));
        destinations=original.proof.liveCombat.map(label=>({unitId:'',unitName:String(label),count:1,source:'combat-role'}));
      }
      const shipNeed=Math.min(Math.max(0,initial-use),Math.max(0,C.num(shipRareUse[id])));
      if(shipNeed>0){
        protectedTotal=Math.max(protectedTotal,use+shipNeed);
        destinations=destinations.concat({unitId:String(shipTarget.unit&&shipTarget.unit.id||''),unitName:displayNameOf(shipTarget.unit),count:shipNeed,source:'ship'});
      }
      if(use>0)destinations.unshift({unitId:String(decision.action&&decision.action.id||''),unitName:String(decision.action&&decision.action.name||'지금 제작'),count:use,source:'action'});
      const craftReady=craftableByRare.get(id)||null;
      if(craftReady)for(const target of craftReady)destinations.push({unitId:String(target.id||target.unit&&target.unit.id||''),unitName:String(target.name||(target.unit?displayNameOf(target.unit):'')),count:1,source:'craftable'});
      const hold=Math.min(Math.max(0,initial-use),Math.max(0,protectedTotal-use));
      const disposable=Math.max(0,initial-use-hold);
      const deadlineRound=deadline?Math.max(0,C.num(deadline.deadlineRound)):0;
      const destinationNames=[...new Set(destinations.map(item=>item.unitName).filter(Boolean))].slice(0,2);
      rows.push({
        id,name:displayNameOf(unit),unit,initial,use,hold,reroll:0,disposable,destinations,deadlineRound,
        reason:use?`${decision.action&&decision.action.name||'지금 제작'} 즉시 재료`:hold?`${shipNeed>0?'0선위 해적선 각 보호':'현재 검증 경로 보호'}${destinationNames.length?` · ${destinationNames.join('·')} 대기`:''}${deadlineRound?` · ${deadlineRound}라 마감`:''}`:craftReady?`희귀→전설 즉시 제작 가능 (${destinationNames.join('·')}) — 리롤 제외`:'현재 확정 제작·필수 보강에 사용처 없음',
        proof:{squadProtected:hold,destinations:destinationNames,disposable,exclusive:false}
      });
    }
    // A game has only two Rare rerolls.  Allocate that finite budget to
    // genuinely disposable cards; cards beyond the budget stay visible as
    // "새 사용처 필요" instead of pretending they can all be rerolled.
    // v19.10(P0-2): 목적지가 하나라도 있는 희귀 종은 리롤 후보에서 뺀다 —
    // 여분 장수가 있어도 카드·파티·함선·전투역할 어딘가에 쓰이는 종을
    // "리롤"이라 부르지 않는다(수동 리롤은 여전히 사용자 자유).
    let rerollCapacity=this.actualRound()>=25?Math.max(0,this.rerollLimit()-C.num(this.state.rerollsUsed)):0;
    const disposableRows=rows.filter(row=>row.disposable>0&&!row.destinations.length).sort((left,right)=>{
      const ld=deadlineRows.get(left.id),rd=deadlineRows.get(right.id);
      return Number(C.num(rd&&rd.reroll)>0)-Number(C.num(ld&&ld.reroll)>0)||right.disposable-left.disposable||left.name.localeCompare(right.name,'ko');
    });
    for(const row of disposableRows){
      const reroll=Math.min(row.disposable,rerollCapacity);
      row.reroll=reroll;row.hold+=row.disposable-reroll;rerollCapacity-=reroll;delete row.disposable;
      if(row.reroll>0)row.reason='현재 확정 제작·필수 보강에 사용처 없음';
      else row.reason=this.actualRound()<25?'25라 전 리롤 잠금 · 사용처 재계산':C.num(this.state.rerollsUsed)>=this.rerollLimit()?`리롤 ${this.rerollLimit()}회 소진 · 새 제작 사용처 필요`:'남은 리롤 횟수 부족 · 새 제작 사용처 필요';
    }
    for(const row of rows){
      if(row.disposable>0&&row.destinations.length){row.hold+=row.disposable;}
      delete row.disposable;
      row.proof.exclusive=row.use+row.hold+row.reroll===row.initial;
    }
    const conflict=rows.some(row=>row.proof.exclusive!==true);
    const safeReroll=!conflict&&decision.state!=='ACT_NOW'&&decision.state!=='SYNC_BLOCKED'?rows.find(row=>row.reroll>0)||null:null;
    const rare={basis:'single-squad-prefix-v15-quote',rows,use:rows.filter(row=>row.use>0),hold:rows.filter(row=>row.hold>0),reroll:rows.filter(row=>row.reroll>0),safeReroll,conflict};
    const evidence=Object.assign({},decision.evidence||{},{globalSquadRareGuard:true,unifiedRareLedger:true,targetLegendEquivalent:C.num(squad.targetCount)||9});
    if(safeReroll)return Object.assign({},decision,{state:'REROLL_ONE',label:'미사용 희귀 1장 리롤',reason:`${safeReroll.name} 1장만 리롤하고 즉시 다시 읽으세요. 현재 파티의 검증된 제작과 필수 역할에 사용되지 않습니다.`,action:null,blockedAction:null,rare,evidence});
    if(decision.state==='REROLL_ONE')return Object.assign({},decision,{state:'HOLD',label:'희귀 사용처 재계산',reason:'남은 리롤 횟수 안에서 단독 폐기가 증명된 희귀가 없습니다.',action:null,blockedAction:null,rare,evidence});
    return Object.assign({},decision,{rare,evidence});
  }
  // 리롤 목표 등이 렌더 중 눈치껏 쓸 수 있는, 이미 계산된 파티만 반환.
  v151CachedPartySquad(upperId){
    if(!upperId||!this._partyCacheMap)return null;
    const currentPrefix=`${fingerprint(this.state.snapshot)}|${upperId}|`;
    for(const [key,squad] of this._partyCacheMap)if(key.startsWith(currentPrefix))return squad;
    return null;
  }
  // v17.11(사용자 요청): 선택한 상위 기준, 내 패 + 50라까지 위습 수입을
  // 전제한 클리어 파티(9환산, 여유 시 11환산 확장)를 시간표로 보여준다.
  //  · 선택 위습(제작 통화): 실측 0.5/라 수입으로 각 제작의 충당 라운드 계산
  //  · 랜덤 위습(유닛): 2/라(맵 사실) — 부족 흔함의 기대 도착 라운드 계산
  //  · 희귀 부족은 수입으로 못 채우므로 리롤 목표로 연결
  // 파티 확정 게이트(현재 패 순차 장부)는 그대로 — 이 화면은 참고 계획이다.
  v151ClearParty(state,plan,squad,upperId){
    if(!squad||squad.error||!Array.isArray(squad.finalLineup)||!squad.finalLineup.length)return null;
    if(!upperId)return null;
    const roundNow=this.actualRound(),income=C.wispIncomeProjection(roundNow,50);
    const available=C.num(state.wisp);
    // 유닛별 부족 재료(현재 패 기준): futurePending을 유닛으로 묶는다.
    const pendingByUnit=new Map();
    for(const item of squad.handFit&&squad.handFit.futurePending||[]){
      const key=String(item.unitId||'');
      if(!pendingByUnit.has(key))pendingByUnit.set(key,[]);
      pendingByUnit.get(key).push(item);
    }
    // 제작 순서 시간표: 누적 선위 필요량이 (보유 + 0.5/라 수입)으로 충당되는 라운드.
    let cumulative=0;const arrivalByUnit=new Map();
    for(const action of squad.actions||[]){
      cumulative+=C.num(action.wispCost);
      const short=Math.max(0,cumulative-available);
      arrivalByUnit.set(String(action.id),short<=0?roundNow:roundNow+Math.ceil(short/Math.max(.1,income.selectionPerRound)));
    }
    const rows=squad.finalLineup.map(item=>{
      const id=String(item.id||item.unit&&item.unit.id||''),unit=state.db.byId.get(id);
      const owned=C.num(state.counts[id])>0;
      const pending=pendingByUnit.get(id)||[];
      const rareGaps=pending.filter(gap=>gap.tier==='rare');
      const commonGaps=pending.filter(gap=>gap.tier==='common');
      const otherGaps=pending.filter(gap=>!['rare','common'].includes(gap.tier));
      let badge,tone;
      if(owned){badge='보유';tone='own';}
      else if(rareGaps.length){badge=`희귀 필요: ${rareGaps.map(gap=>`${gap.name}${gap.count>1?`×${gap.count}`:''}`).join('·')}`;tone='rare';}
      else if(otherGaps.length){badge=`재료 준비: ${otherGaps.slice(0,2).map(gap=>gap.name).join('·')}`;tone='mat';}
      else if(commonGaps.length){
        // 특정 흔함 k개 기대 도착: 랜덤 위습 2/라 × (1/9종) — 균등 가정.
        // 표시용 반올림 값(0.22) 대신 정확식 k×9/2로 계산한다.
        const worst=Math.max(...commonGaps.map(gap=>C.num(gap.count)));
        const waitRounds=Math.ceil(worst*C.COMMON_KIND_COUNT/Math.max(.01,income.randomPerRound));
        badge=`~${roundNow+waitRounds}라 (랜덤 위습 기대)`;tone='wait';
      }else{
        const arrival=arrivalByUnit.get(id);
        if(arrival==null||arrival<=roundNow){badge='지금 제작 가능';tone='now';}
        else{badge=`~${Math.min(65,arrival)}라 (선위 수입 대기)`;tone='wait';}
      }
      return{id,unit,name:item.name||(unit?displayNameOf(unit):id),isUpper:unit?C.isUpper(unit):false,badge,tone};
    });
    // 요약: 총 필요 선위 vs 보유 + 50라까지 수입.
    const totalNeed=cumulative,projected=available+income.selectionTotal;
    const funded=projected>=totalNeed;
    // 11환산 확장: 파티 밖 제작 가능 전설급 상위 2개(스토리 등급 우선).
    const lineupIds=new Set(rows.map(row=>row.id));
    // v17.18(사용자 교정): 확장 후보도 스토리가 아니라 기준 상위와의 실측
    // 동반 순 — 동반 실측이 없으면 전체 실측 픽, 그다음 이름순.
    const stretchPairs=(()=>{
      const engine=global.ORDV15Engine,upperUnit=state.db.byId.get(upperId);
      const evidence=engine&&engine.metaPairs&&upperUnit?engine.metaPairs(upperUnit):null;
      const map=new Map();
      for(const pair of evidence&&evidence.pairs||[])map.set(String(pair.code).toLowerCase(),C.num(pair.games));
      return unit=>{let best=0;for(const code of unit&&unit.codes||[]){const games=C.num(map.get(String(code).toLowerCase()));if(games>best)best=games;}return best;};
    })();
    const stretch=(plan.rows||[]).filter(row=>row.unit&&C.isLegendish(row.unit)&&!lineupIds.has(row.unit.id)&&row.solve&&row.solve.wispCost!=null).slice(0,8)
      .sort((a,b)=>stretchPairs(b.unit)-stretchPairs(a.unit)||C.num(C.storyGrade(b.unit).score)-C.num(C.storyGrade(a.unit).score)).slice(0,2)
      .map(row=>({id:row.unit.id,name:displayNameOf(row.unit),wispCost:C.num(row.solve.wispCost)}));
    // v23.1.1(사용자 리포트): "사보 히든은 물딜인데 파티에 왜 넣는거냐" —
    // 플래너가 계통 게이트로 뺀 보유 유닛을 여기서 명시해 준다.
    const familyExcluded=(squad.familyExcluded||[]).map(row=>({id:row.id,name:row.name,family:row.family==='physical'?'물딜':row.family==='magic'?'마딜':row.family}));
    return{upperId,rows,totalNeed,available,income,projected:Math.floor(projected),funded,plannedCount:C.num(squad.plannedCount),targetCount:C.num(squad.targetCount),stretch,mode:squad.mode,familyExcluded};
  }
  renderV151ClearParty(party){
    if(!party)return'';
    const rows=party.rows.map((row,index)=>`<button data-act="detail" data-id="${C.esc(row.id)}" class="v151-party-row ${C.esc(row.tone)}">${row.unit&&row.unit.image?`<img src="${C.esc(row.unit.image)}" alt="">`:`<i>${index+1}</i>`}<span><b>${C.esc(row.name)}${row.isUpper?' <em>(상위 · 3환산)</em>':''}</b><small>${C.esc(row.badge)}</small></span></button>`).join('');
    const stretchHtml=party.stretch.length?`<div class="v151-party-stretch"><small>여유 확장(11환산 후보)</small>${party.stretch.map(row=>`<button data-act="detail" data-id="${C.esc(row.id)}"><b>${C.esc(row.name)}</b><span>선위 ${C.num(row.wispCost)}</span></button>`).join('')}</div>`:'';
    const modeLabel=party.mode==='magic'?'마딜':'물딜';
    const excludedHtml=(party.familyExcluded||[]).length?`<small class="v151-party-excluded">계통 제외: ${party.familyExcluded.map(row=>`${C.esc(row.name)}(${C.esc(row.family)})`).join(' · ')} — 보유 중이지만 ${modeLabel} 파티에는 계산하지 않습니다.</small>`:'';
    return`<div class="v151-clear-party"><header><b>클리어 파티 참고안 · ${C.num(party.plannedCount)}/${C.num(party.targetCount)}환산</b><em class="${party.funded?'ok':'gap'}">필요 선위 ${C.num(party.totalNeed)} vs 보유 ${C.num(party.available)}+50라까지 수입 ~${C.num(Math.floor(party.income.selectionTotal))} = ${C.num(party.projected)} ${party.funded?'충당 가능':'부족'}</em></header><div class="v151-party-rows">${rows}</div>${excludedHtml}${stretchHtml}<small class="v151-party-note">수입 근거: 선택 위습 ${party.income.selectionPerRound}/라(로그 실측) · 랜덤 위습 ${C.num(party.income.randomPerRound)}/라 흔함만(확인됨 · 9종 균등 기대). 참고 계획이며 파티 확정은 현재 패 검증만 사용합니다.</small></div>`;
  }
  // v17.12(사용자 요청 4): 파티는 상위 후보의 "미리 파티" 버튼으로 여는
  // 모달에서만 계산·표시한다.
  renderV151PartyModal(state,plan){
    const id=String(this._partyPreviewId||'');
    if(!id)return'';
    const unit=state.db&&state.db.byId.get(id);
    if(!unit)return'';
    const squad=this.v151ComputeParty(state,plan,id);
    const party=squad?this.v151ClearParty(state,plan,squad,id):null;
    const body=party?this.renderV151ClearParty(party):`<div class="v151-empty"><b>파티 계산 불가</b><span>${C.esc(squad&&squad.error||'현재 패로는 이 상위 기준 파티를 아직 구성하지 못했습니다. 패가 늘면 다시 열어 보세요.')}</span></div>`;
    // v17.14: 실측에서 이 상위와 함께 쓰인 전설급 — 표시 전용 근거.
    // 파티 구성 계산에는 쓰지 않는다(원장·역할표가 결정).
    const pairsHtml=this.renderV151MetaPairs(state,unit);
    return`<div class="modal-back" data-act="party-close"><article class="detail-modal party-modal" role="dialog" aria-modal="true" aria-label="${C.esc(displayNameOf(unit))} 클리어 파티 미리보기"><button class="modal-x" data-act="party-close" aria-label="닫기">×</button><header>${unit.image?`<img src="${C.esc(unit.image)}" alt="">`:''}<div><h2>${C.esc(displayNameOf(unit))} 기준 클리어 파티</h2><p>내 패 + 50라까지 위습 수입 전제 · 참고 계획(확정 게이트는 현재 패 검증만)</p></div></header>${pairsHtml}${body}</article></div>`;
  }
  // v17.14: 실측(전수)에서 이 상위와 함께 쓰인 전설급 상위 5개.
  // 내 패에 이미 있는 유닛은 '보유' 표시.  표시 전용 — 순위·게이트·파티
  // 구성에는 관여하지 않는다.
  renderV151MetaPairs(state,unit){
    const engine=global.ORDV15Engine;
    const evidence=engine&&engine.metaPairs?engine.metaPairs(unit):null;
    if(!evidence||!evidence.pairs||!evidence.pairs.length)return'';
    if(!state||!state.db||!state.db.byId)return'';
    if(!this._metaCodeIndex){
      this._metaCodeIndex=new Map();
      for(const row of state.db.byId.values())for(const code of row.codes||[])this._metaCodeIndex.set(String(code).toLowerCase(),row.id);
    }
    const chips=evidence.pairs.slice(0,5).map(pair=>{
      const ownedId=this._metaCodeIndex.get(String(pair.code).toLowerCase());
      const owned=ownedId&&C.num(state.counts[ownedId])>0;
      // v18.1: 조건부 확률 + 신뢰구간. 상위 표본이 얇으면 ±폭이 커져 바로 보인다.
      const rate=pair.conditional!=null?`${pair.conditional}%${pair.ci?` ±${pair.ci}p`:''}`:`${C.num(pair.games)}판`;
      return`<span class="${owned?'owned':''}"><b>${C.esc(pair.name)}</b><i>${C.esc(rate)}${owned?' · 보유':''}</i></span>`;
    }).join('');
    // v18.1: 다이제스트가 낡으면 그 사실을 근거 옆에 같이 적는다 — 조용히
    // 낡은 수치가 근거 행세를 하지 않게.
    const stale=engine&&engine.metaStaleness?engine.metaStaleness():null;
    const staleNote=stale&&stale.stale?` · 수집 ${stale.months}개월 전 — 재수집 권고(픽률이 그동안 평균 ${stale.expectedShift}%p 움직였을 것)`:'';
    return`<div class="v151-meta-pairs${staleNote?' stale':''}"><small>전체 실측 ${C.num(evidence.games)}판 중 함께 쓴 비율(±는 95% 신뢰구간) — 표시 전용, 파티 계산은 원장 기준${C.esc(staleNote)}</small><div>${chips}</div></div>`;
  }
  // v17.12(사용자 요청 2): 해적선 사용처 전체 비교 모달 — 2번 패널에는
  // 추천 한 줄만 남는다.
  renderV151ShipModal(state){
    if(!this._shipModalOpen)return'';
    const shipPlan=this.v151ShipPlan(state);
    if(!shipPlan){this._shipModalOpen=false;return'';}
    const shipRow=row=>{const recommended=shipPlan.recommendedId===row.unit.id;return`<button data-act="detail" data-id="${C.esc(row.unit.id)}" class="${recommended?'recommended':''}"><b>${recommended?'<i class="v151-ship-reco">추천</i>':''}${C.esc(displayNameOf(row.unit))}${row.familyFit?'':'<i class="v151-ship-off">타계통</i>'}</b><span>${row.feasible?'지금 제작 가능 — 배 사용처로 최우선 검토':`부족: ${row.missing.map(m=>`${C.esc(m.name)}${m.need>1?`×${m.need}`:''}`).join(' · ')}${row.missingRares.length?' — 부족 희귀는 리롤·152킬 목표로':''}`}</span></button>`;};
    return`<div class="modal-back" data-act="ship-close"><article class="detail-modal ship-modal" role="dialog" aria-modal="true" aria-label="해적선 활용 비교"><button class="modal-x" data-act="ship-close" aria-label="닫기">×</button><header><div><h2>해적선 활용 · ${shipPlan.shipCount}척 보유</h2><p>해적선은 특수재료라 리롤로 못 얻습니다 — 계통 적합·재료 근접 순 추천입니다.</p></div></header><div class="v151-ship-plan">${shipPlan.legendRows.length?`<em class="v151-ship-group">전설급 완성체</em>${shipPlan.legendRows.map(shipRow).join('')}`:''}${shipPlan.upperRows.length?`<em class="v151-ship-group">상위 (제한됨) — 메인 상위 자리 소모</em>${shipPlan.upperRows.map(shipRow).join('')}`:''}</div></article></div>`;
  }
  // v17.11(사용자 요청): 리롤로 노릴 희귀 목표를 확률과 함께 안내한다.
  v151RerollTargets(state,plan,decision){
    const targets=new Map();
    const add=(id,name,need,source)=>{
      if(!id)return;
      const entry=targets.get(id)||{id,name,need:0,sources:new Set()};
      entry.need=Math.max(entry.need,C.num(need)||1);entry.sources.add(source);
      targets.set(id,entry);
    };
    const lock=this.upperLock(),upperId=lock&&lock.id||this.state.upperPreviewId||this.state.directionUpperId;
    if(upperId)for(const row of this.v151MissingRares(state,upperId))add(row.id,row.name,row.short,'상위');
    // v17.12: 파티는 "미리 파티" 버튼으로 계산된 캐시가 있을 때만 반영
    // (렌더마다 플래너를 돌리지 않는다 — legacy squadPlan은 라이브에서 죽은 값).
    const partySquad=plan.squadPlan||this.v151CachedPartySquad(upperId);
    for(const item of partySquad&&partySquad.handFit&&partySquad.handFit.futurePending||[])if(item.tier==='rare')add(item.id,item.name,item.count,'파티');
    const shipPlan=this.v151ShipPlan(state);
    if(shipPlan)for(const row of[...shipPlan.legendRows,...shipPlan.upperRows])for(const missing of row.missingRares)add(missing.id,missing.name,missing.need,'해적선');
    if(!targets.size)return null;
    const list=[...targets.values()].map(entry=>Object.assign(entry,{sources:[...entry.sources]})).sort((a,b)=>b.sources.length-a.sources.length||b.need-a.need).slice(0,6);
    const kinds=targets.size,rerollLeft=Math.max(0,this.rerollLimit()-C.num(this.state.rerollsUsed));
    const perRoll=kinds/41,anyHit=rerollLeft>0?1-Math.pow(1-perRoll,rerollLeft):0;
    const rollAway=(decision&&decision.rare&&!decision.rare.conflict?decision.rare.reroll||[]:[]).filter(row=>C.num(row.reroll)>0);
    return{list,kinds,rerollLeft,perRollPercent:Math.round(perRoll*1000)/10,anyHitPercent:Math.round(anyHit*1000)/10,rollAway};
  }
  // v17.8(사용자 요청 5): 상위까지 남은 희귀를 이름으로 보여준다.
  v151MissingRares(state,targetId){
    if(!C.rareNeedsForTarget)return[];
    const needs=C.rareNeedsForTarget(state.db,targetId),out=[];
    for(const [rareId,need] of Object.entries(needs)){
      const short=C.num(need)-C.num(state.counts[rareId]);
      if(short<=0)continue;
      const unit=state.db.byId.get(rareId);
      out.push({id:rareId,name:unit?displayNameOf(unit):String(rareId),short});
    }
    return out.sort((a,b)=>b.short-a.short||a.name.localeCompare(b.name,'ko'));
  }
  renderV151UpperInfo(state,plan){
    const decision=plan.v15Decision||{},lock=this.upperLock(),upper=lock&&state.db.byId.get(lock.id)||plan.upper||null,candidates=(decision.routeCandidates||[]).slice(0,6),canConfirm=true;
    const upperStrategyInfo=upper&&C.upperStrategy?C.upperStrategy(upper):null,lineBadge=upperStrategyInfo&&upperStrategyInfo.lineSelf==='self'?'<i class="v151-line-badge self">라인 자립</i>':upperStrategyInfo&&upperStrategyInfo.lineSelf==='support'?'<i class="v151-line-badge support">보조딜 필요</i>':'';
    // v17: 평타 실효 DPS(스킬 제외) vs 다음 보스 필요 DPS.  방깎은 현재
    // 스펙 값, 등급 공업 레벨은 3번 패널 입력값을 쓴다.
    const dpsLine=(()=>{
      if(!upper||!C.upperBossDps)return'';
      const preview=C.bossPreview(this.actualRound(),this.state.gorosei);
      if(!preview||preview.bossArmor==null)return'';
      const armorRow=(plan.deficits&&plan.deficits.rows||[]).find(row=>row.key==='armor'),armorReduce=armorRow?C.num(armorRow.current):0;
      const speedRow=(plan.deficits&&plan.deficits.rows||[]).find(row=>row.key==='speed'),speedBuff=speedRow?C.num(speedRow.current):0;
      const level=C.num(this.state.upperResearchLevel)||1;
      const result=C.upperBossDps(upper,level,{bossArmor:preview.bossArmor,armorReduce,speedBuffPct:speedBuff});
      if(!result)return'';
      const koNum=value=>{value=C.num(value);if(value>=1e8)return`${(Math.round(value/1e6)/100).toFixed(2).replace(/\.?0+$/,'')}억`;if(value>=1e4)return`${Math.round(value/1e4)}만`;return String(Math.round(value));};
      // v17.2: 액션 AST 정적 하한(자동공격 유발 스킬)을 평타에 합산해
      // 보여준다.  FSM 트레인·수동 시전 미포함이므로 여전히 하한이며
      // 킬 판정은 내리지 않는다.
      const skillProc=C.upperSkillProcDps?C.upperSkillProcDps(upper,level,{bossArmor:preview.bossArmor,armorReduce,speedBuffPct:speedBuff}):null;
      // v17.21: 순위와 같은 값을 보여준다 — 파서가 못 읽은 조건이 많은
      // 프로필은 신뢰도로 감산하고, 원값과 감산값을 함께 표기한다.
      const procRaw=skillProc?C.num(skillProc.dps):0,procTrusted=skillProc?C.num(skillProc.trustedDps!=null?skillProc.trustedDps:skillProc.dps):0;
      const combined=result.effective+procTrusted;
      const enough=combined>=preview.dpsNeed;
      const skillProfile=C.upperSkillProfile?C.upperSkillProfile(upper):null;
      const discounted=procRaw>0&&procTrusted<procRaw-1;
      const trustNote=discounted?` · 스킬 발동 ${koNum(procRaw)} → 신뢰 ${Math.round(C.num(skillProc.trust)*100)}% 반영 ${koNum(procTrusted)}`:'';
      const trustBadge=discounted?'<i class="v151-dps-unverified">미검증 감산</i>':'';
      return`<div class="v151-upper-dps ${enough?'ok':'gap'}"><small>평타${procTrusted>0?'+스킬유발(AST 하한)':''} 실효 DPS · 연구 Lv${level} · 방깎 ${Math.round(armorReduce)}${trustBadge}</small><b>${koNum(combined)}/초</b><span>${preview.round}라 ${C.esc(preview.boss)} 필요 ${koNum(preview.dpsNeed)}/초 ${enough?'충족(하한 기준)':'· 트레인·수동스킬·보조딜은 별도'}${trustNote}${skillProfile&&skillProfile.skills.length?` · 스킬 ${skillProfile.skills.length}종 프로필(상세)`:''}</span></div>`;
    })();
    const mainPowerTier=upper&&C.upperPowerTier?C.upperPowerTier(upper,state.db):null,mainTierBadge=mainPowerTier&&mainPowerTier.known?`<i class="v151-power-tier tier-${mainPowerTier.letter.toLowerCase()}">${mainPowerTier.letter}티어</i>`:'',main=upper?`<div class="v151-upper-main">${upper.image?`<img src="${C.esc(upper.image)}" alt="">`:''}<span><small>메인 상위 · ${C.num(state.counts[upper.id])>0?'TMO 보유':'제작 준비'}</small><b>${C.esc(displayNameOf(upper))} <i>(${C.esc(tierLabel(upper))})</i>${mainTierBadge}${lineBadge}</b><em>${modeLabel(C.familyOf(upper))} ·${C.esc(C.summarizeRoles({role:C.roleProfile(upper)},C.familyOf(upper)))}</em></span><span class="v151-card-actions"><button data-act="party-preview" data-id="${C.esc(upper.id)}">파티 보기</button><button data-act="detail" data-id="${C.esc(upper.id)}">상세</button></span></div>`:`<div class="v151-upper-main empty"><i>?</i><span><small>메인 상위 미확정</small><b>현재 패 후보를 비교하세요</b><em>상위는 전설 3기분으로 계산합니다.</em></span></div>`;
    // v17.8(사용자 요청 3): 잠금 상위 화면의 빈 공간에 완성까지 남은
    // 경로(선위·부족 희귀)와 이후 최우선 보강 순서를 채운다.
    const lockedPath=(()=>{
      if(!upper)return'';
      const owned=C.num(state.counts[upper.id])>0;
      const parts=[];
      if(!owned){
        const reserve=decision.upperReserve;
        const missingRares=this.v151MissingRares(state,upper.id).slice(0,4);
        parts.push(`<span><small>완성까지 선위</small><b>${reserve?`${C.num(reserve.wispCost)}${C.num(reserve.wispShort)>0?` (부족 ${C.num(reserve.wispShort)})`:''}`:'계산 중'}</b></span>`);
        parts.push(`<span><small>부족 희귀</small><b>${missingRares.length?missingRares.map(row=>`${C.esc(row.name)}${row.short>1?`×${row.short}`:''}`).join(' · '):'없음 — 재료 충족'}</b></span>`);
      }else{
        const openRows=((decision.assessment||{}).requirements||[]).filter(row=>row.required!==false&&!row.waived&&C.num(row.gap)>0).slice(0,3);
        parts.push(`<span><small>상위 완성 후 최우선 보강</small><b>${openRows.length?openRows.map(row=>`${C.esc(row.label)} ${fmt(row.gap)}`).join(' · '):'필수 역할 전부 확보'}</b></span>`);
        const rerollLeft=Math.max(0,this.rerollLimit()-C.num(this.state.rerollsUsed));
        parts.push(`<span><small>남은 자원</small><b>선위 ${C.num(state.wisp)} · 리롤 ${rerollLeft}/${this.rerollLimit()}</b></span>`);
      }
      return`<div class="v151-upper-path">${parts.join('')}</div>`;
    })();
    const cards=candidates.map((row,index)=>{const selected=this.state.directionKey===row.routeKey&&C.canonicalUpperId(this.state.directionUpperId)===C.canonicalUpperId(row.id);
      const nearestBadge=row.nearestBuild?'<i class="v151-nearest-badge">최단 완성</i>':'',familyBadge=row.familySwitch?`<i class="v232-pivot">계통 전환 · ${row.familySwitch==='physical'?'물딜':'마딜'} 각</i>`:'';
      const storyBadge=row.storyReward?'<i class="v151-story10-badge">스토리10 보상 필요</i>':'';
      const powerTier=row.powerTier||{},tierBadge=powerTier.known?`<i class="v151-power-tier tier-${String(powerTier.letter).toLowerCase()}">${C.esc(powerTier.letter)}티어</i>`:'',angleBadge=row.angleLabel?`<i class="v151-angle-badge angle-${C.num(row.angleBand)}">${C.esc(row.angleLabel)}</i>`:'';
      // v17.12(사용자 요청 5): 특수재료 게이트 상위(베가펑크)는 숨기지 않고
      // 배지로 전제를 표시한다.
      const gateBadge=row.specialGate?`<i class="v151-gate-badge">${C.esc(row.specialGate.items.map(item=>item.name).join('·'))} 필요</i>`:'';
      // v17.12(사용자 요청 3): 카드는 추천 이유 + 필요 선위만 남긴다.
      const whyLine=this.v151ClearWhy(state,plan,row);
      const missingRares=row.locked?[]:this.v151MissingRares(state,row.id).slice(0,3);
      const costLine=row.locked?'':`<small class="v151-cost-line">필요 선위 <b>${C.num(row.wispCost)}</b>${C.num(row.wispGap)>0?` · 현재 부족 <b>${C.num(row.wispGap)}</b>`:' · 지금 충당 가능'}${missingRares.length?` · 부족 희귀: ${missingRares.map(item=>`${C.esc(item.name)}${item.short>1?`×${item.short}`:''}`).join(' · ')}`:''}</small>`;
      // v17.12(사용자 요청 4): 파티는 카드의 "미리 파티" 버튼으로만 연다.
      const evaluated=routeCandidateReady(row),enabled=canConfirm&&evaluated,buttonText=!evaluated?'파티 평가 중':selected?'유지':'확정';
      return`<article class="${index===0?'best':''} ${selected?'selected':''}"><span><b>${index+1}. ${C.esc(row.name)}${tierBadge}${angleBadge}${familyBadge}${nearestBadge}${storyBadge}${gateBadge}</b>${costLine}${whyLine}</span><span class="v151-card-actions"><button data-act="detail" data-id="${C.esc(row.id)}">재료</button><button data-act="party-preview" data-id="${C.esc(row.id)}">미리 파티</button><button class="primary" data-act="choose-direction" data-key="${C.esc(row.routeKey)}" data-id="${C.esc(row.id)}" ${enabled?'':'disabled aria-disabled="true"'}>${buttonText}</button></span></article>`;}).join('');
    const gatedUppers=(decision.routeCandidates||{}).gatedUppers||[];
    const gatedHtml=gatedUppers.length?`<div class="v151-gated-uppers"><small>특수재료 확보 시 열리는 상위</small>${gatedUppers.map(item=>`<button data-act="detail" data-id="${C.esc(item.id)}"><b>${C.esc(item.name)}</b><span>← ${item.items.map(mat=>C.esc(mat.name)).join('·')} · 선위 ${C.num(item.wispCost)}</span></button>`).join('')}</div>`:'';
    const strategicKeys=new Set(['single','end','toki','singleEndExpected','magicSupport','attack']),strategic=(decision.assessment&&decision.assessment.requirements||[]).filter(row=>strategicKeys.has(row.key)),needs=upper&&strategic.length?`<div class="v151-upper-needs"><small>이 상위의 조합 필수 역할</small>${strategic.map(row=>`<span class="${C.num(row.gap)<=0?'ok':'gap'}"><b>${C.esc(row.label)}</b><i>${fmt(row.current)}/${fmt(row.target)}</i>${C.num(row.gap)>0?`<em>부족 ${fmt(row.gap)}</em>`:'<em>확보</em>'}</span>`).join('')}</div>`:'';
    // v17.15(사용자 요청 4): 상위 운영 가이드 — "이 상위는 무엇을 쌓을수록
    // 좋은가"를 공략 근거(upperStrategy)와 메모(feature)에서 문장으로 제시.
    const guide=(()=>{
      if(!upper||!C.upperStrategy)return'';
      const strategy=C.upperStrategy(upper);
      const memoEntry=C.upperMemoFor?C.upperMemoFor(upper,global.ORD_UPPER_MEMO):null;
      const lines=[];
      if(strategy.summary)lines.push(`<b>${C.esc(strategy.label||'운영')}</b> — ${C.esc(strategy.summary)}`);
      for(const need of (strategy.needs||[]).slice(0,3))lines.push(`필수 <b>${C.esc(need.label)}</b>${C.num(need.target)>1?` ${C.num(need.target)}`:''} · ${C.esc(need.reason||'')}`);
      for(const condition of (strategy.conditions||[]).slice(0,2))lines.push(C.esc(condition));
      if(strategy.lineNote)lines.push(C.esc(strategy.lineNote));
      if(memoEntry&&memoEntry.feature)lines.push(`공략 메모: ${C.esc(String(memoEntry.feature).slice(0,140))}`);
      if(!lines.length)return'';
      return`<div class="v152-upper-guide"><small>이 상위·파티의 특징</small><ul>${lines.map(line=>`<li>${line}</li>`).join('')}</ul>${this.renderV151MetaPairs(state,upper)}</div>`;
    })();
    return`${main}${guide}${lockedPath}${dpsLine}${needs}${cards?`<div class="v151-upper-candidates">${cards}</div>`:`<div class="v151-upper-note">${upper?'확정 상위 중심으로 다음 행동을 계속 계산합니다. 패가 바뀔 때마다 아래 필수 역할 충족을 다시 검사합니다.':'상위 선택 단계가 되면 최대 6개 후보가 여기에 표시됩니다.'}</div>`}${gatedHtml}`;
  }

  renderV151RunHeader(state,clock,health){
    const summary=this.runLog?this.runLog.summary():{status:'idle',eventCount:0,persistence:'none'},recording=summary.status==='active',syncTone=health.ready?'ok':health.key==='partial'||health.key==='lag'?'warn':'stop';
    return`<div class="v151-round"><strong>${this.actualRound()}라</strong><span data-clock>${C.esc(clock.label)}${clock.running?` · ${clock.remaining}초`:''}</span><div><button data-act="round-step" data-delta="-1">−</button>${clock.running?'<button data-act="round-pause">정지</button>':'<button data-act="round-start">시작</button>'}<button data-act="round-step" data-delta="1">＋</button></div></div><div class="v151-record ${recording?'on':''}"><i></i><span><b>${recording?'판단 녹화 중':'녹화 준비 중'}</b><small>사건 <em data-run-log-count>${C.num(summary.eventCount)}</em>개 · ${summary.persistence==='indexeddb'?'자동 저장':'로컬 저장'}</small></span></div><div class="v151-sync ${syncTone}" data-sync-age><b>${C.esc(health.label)}</b><span>${health.ageSec<999?`${health.ageSec}초 전`:'수신 없음'}</span></div><div class="v151-run-actions"><button data-act="connection">동기화</button><button data-act="run-log-open">기록</button><button data-act="run-log-export">녹화 JSON</button><button data-act="run-result-open">게임 결과</button><button class="new-game" data-act="new-game">새 게임</button></div><nav class="v151-aux-actions" aria-label="보조 화면"><button type="button" data-act="tab" data-tab="deck">수동 패 보정</button><button type="button" data-act="tab" data-tab="data">연결 진단</button><button type="button" data-act="tab" data-tab="story">스토리</button></nav>`;
  }

  // v17.24: 전투 화면은 "무엇을 할지"만 남긴다. 기록·진단·설정은
  // 기능을 없애지 않고 기본 접힘 도구함으로 이동한다.
  renderV153Settings(state){
    const db=state&&state.db,selected=C.GOROSEI[this.state.gorosei]||C.GOROSEI.none;
    const specials=(C.eligible152Specials&&db?C.eligible152Specials(db):db&&db.specials||[]);
    const specialId=String(this.state.virtualSpecialId||''),story10=this.state.story10Reward||'',lab=this.state.labResearch||{};
    const story10Options=[['','스토리 10 보상 미정'],['rayleigh','레일리+해적선'],['kuma','초월 쿠마'],['chest','유니크·상자']];
    const box=(key,label)=>`<label><input type="checkbox" data-upg="${key}" ${lab[key]?'checked':''}><span>${label}</span></label>`;
    // v22.12(웹 정본): 선택한 오로성의 악몽 저주 원문을 셀렉트 밑에 밝힌다
    // — "2.312 기준으로 오로성 대입" 요청의 답이 화면에 산다.  새턴은 화력
    // 저주(스펙표 밖)라 경고 톤.
    const curse=selected.curse?`<small class="v2212-curse${selected.key==='saturn'?' warn':''}">${C.esc(selected.curse)}<br>${C.esc(C.GOROSEI_COMMON_CURSE||'')}</small>`:'';
    // v23.0(맵 원본): 항법 선택 — 리롤 상한(도박광 계열)과 상위 상한
    // (패왕의길·계엄령)이 여기서 정해진다.  맵데이터_분석_20260811.txt ③.
    const nav=C.navProfile(this.state.navFamily,this.state.navPerk),navFam=C.NAVIGATION[nav.family]||C.NAVIGATION.none;
    const navNote=nav.family!=='none'?`<small class="v230-nav${nav.upperCap!=null?' warn':''}">희귀 리롤 ${nav.rerollMax}회 · 목재 ${nav.rerollWood}${nav.notes.filter(note=>!/희귀 리롤|목재/.test(note)).map(note=>` · ${C.esc(note)}`).join('')}</small>`:'';
    return`<div class="v153-setting-row"><label><span>오로성</span><select data-opt="gorosei">${Object.values(C.GOROSEI).map(item=>`<option value="${item.key}" ${selected.key===item.key?'selected':''}>${C.esc(item.name)}</option>`).join('')}</select></label>${curse}<label><span>항법</span><select data-opt="navFamily">${Object.values(C.NAVIGATION).map(item=>`<option value="${item.key}" ${nav.family===item.key?'selected':''}>${C.esc(item.name)}</option>`).join('')}</select></label>${nav.family!=='none'?`<label><span>항법 세부</span><select data-opt="navPerk"><option value="">기본 효과만</option>${(navFam.perks||[]).map(([key,label])=>`<option value="${key}" ${nav.perk===key?'selected':''}>${C.esc(label)}</option>`).join('')}</select></label>`:''}${navNote}<label><span>152킬 특별함</span><select data-opt="virtualSpecialId"><option value="">받은 유닛 선택</option>${specials.map(unit=>`<option value="${C.esc(unit.id)}" ${specialId===String(unit.id)?'selected':''}>${C.esc(displayNameOf(unit))}</option>`).join('')}</select></label><label><span>스토리 10</span><select data-opt="story10Reward">${story10Options.map(([value,label])=>`<option value="${value}" ${story10===value?'selected':''}>${C.esc(label)}</option>`).join('')}</select></label></div><details class="v153-lab"><summary>연구소 설정</summary><div>${box('attack','공업 +12%')}${box('slow','이감 +10')}${box('hpRegen','체젠 +0.45')}${box('mpRegen','마젠 +0.8')}<label><span>등급 공업 Lv</span><input type="number" min="1" max="21" data-upg="upperLevel" value="${C.num(this.state.upperResearchLevel)||1}"></label></div></details>`;
  }

  // v19.9(개선 ⑧): 판 종료 자동 감지.  전멸(보드 0)은 이미 잡지만, 클리어
  // 후 방치·나가기는 "패가 안 바뀌는 침묵"으로만 남는다 — 50라 이후 실제
  // 패 변화가 3라운드분(180초) 넘게 없으면 결과 입력을 유도한다(표시 전용).
  v199GameEndFreezeSec(){
    if(this.actualRound()<50||this._runResultOpen||!this.runLogActive())return 0;
    const snapshot=this.state.snapshot,changedAt=C.num(snapshot&&snapshot.dataChangedAt);
    if(!changedAt)return 0;
    const age=Math.floor((Date.now()-changedAt)/1000);
    return age>=180?age:0;
  }
  // v19.12(0804): 코치가 게임 시작(패 0→1 전이)을 못 본 채 데이터가 시작
  // 되면 라운드가 1라부터 어긋난다 — 보스 예고·25라 게이트·마감 계산이
  // 전부 라운드에 걸려 있으므로, 수동 보정 전까지 최상단에 경고한다.
  v1912MidJoinBanner(){
    const snapshot=this.state.snapshot,local=snapshot&&snapshot.localDirect;
    if(!local||local.midJoin!==true)return'';
    if(this.state.v1912MidJoinAck)return'';
    if(this.actualRound()>3)return'';
    return`<div class="v159-endgame v1912-midjoin">${this.v153Icon('warn')}<span><b>중간 합류 감지</b> — 게임 시작(패 0→1)을 보지 못해 1라부터 세는 중일 수 있습니다. 상단 −1/+1로 <b>실제 라운드</b>를 맞춰주세요. 보스 예고·마감 계산이 라운드에 걸려 있습니다(상위 확정은 언제든 가능).</span></div>`;
  }
  renderV153Status(state,clock,health){
    // v19.3(사용자 요청): ORD COACH 전술판 목업의 탑바로 개편.
    // 브랜드 · 라운드 조절 · 계통 스위치 · 위습/리롤 HUD · 동기화 · 도구.
    // data-clock / data-sync-age 는 updateClockOnly 가 텍스트만 갈아끼우는
    // 훅이라 잎 노드(span)여야 한다 — data-sync-age 는 패처가 클래스도
    // `sync-pill ${key}` 로 덮으므로 처음부터 그 클래스로 시작한다.
    health=health||{};clock=clock||{};
    const rerollLeft=Math.max(0,this.rerollLimit()-C.num(this.state.rerollsUsed)),age=C.num(health.ageSec)<999?`${C.num(health.ageSec)}초 전`:'수신 없음';
    // v23.2(0816): 수신이 끊기면 선위·리롤 칩이 옛 값을 그대로 보여줘
    // "선위 개수가 맞지 않는다"로 읽혔다 — 칩에 스테일 톤 + 나이를 단다.
    const pillStale=health.ready===false&&C.num(health.ageSec)<9999;
    const modeButtons=[['','자동'],['physical','물딜'],['magic','마딜']].map(([value,label])=>`<button class="${this.state.mode===value?'on':''}" data-act="mode" data-value="${value}">${label}</button>`).join('');
    return`<section class="v153-status" data-region="game-status"><div class="v153-brand"><i class="v153-brand-mark">✦</i><div><b>ORD COACH</b><small>악몽 실전 코치 · 2.310</small></div></div><div class="v153-hud"><div class="v153-round"><button data-act="round-step" data-delta="-1" aria-label="라운드 내리기">−</button><strong>${this.actualRound()}라</strong><button data-act="round-step" data-delta="1" aria-label="라운드 올리기">＋</button><span data-clock>${C.esc(clock.label||'라운드 수동')}</span></div>${(()=>{
      // v22.0: 국면과 가장 가까운 마감이 상단 스트립 한 줄에 산다 —
      // 카드 밑 칩 5개(국면/마감/보스/리롤/위습)를 이 줄이 대체한다.
      const ph=this._v22PhaseNow||this.v22Phase({});
      const roundNow=this.actualRound(),boss=C.bossPreview?C.bossPreview(roundNow,this.state.gorosei):null;
      const dues=[ph.due?{round:C.num(ph.due.round),label:ph.due.label}:null,boss?{round:C.num(boss.round),label:`${C.num(boss.round)}라 ${boss.boss}`}:null].filter(due=>due&&due.round>=roundNow).sort((a,b)=>a.round-b.round);
      const due=dues[0]||null,left=due?due.round-roundNow:0;
      return`<span class="v22-phase" title="${C.esc(ph.question)}">${C.esc(ph.num)} ${C.esc(ph.label)}</span>${due?`<span class="v22-due ${left<=2?'hot':''}">${C.esc(due.label)}${left>0?`까지 ${left}라`:' — 지금'}</span>`:''}`;
    })()}<div class="v153-mode" role="group" aria-label="빌드 방향">${modeButtons}</div><span class="v153-pill violet${pillStale?' stale':''}">${this.v153Icon('spiral')}<small>선위</small><b>${C.num(state&&state.wisp)}</b>${pillStale?`<em class="pill-age" data-pill-age>${C.num(health.ageSec)}초 전</em>`:''}</span><span class="v153-pill coral${pillStale?' stale':''}">${this.v153Icon('reroll')}<small>희귀 리롤</small><b>${rerollLeft}/${this.rerollLimit()}</b></span></div><div class="v153-main-tools"><button class="v153-sync ${health.ready?'ok':'warn'}" data-act="connection" title="TMO 동기화 · 다시 읽기"><i class="v153-sync-dot"></i><span class="sync-pill ${C.esc(health.key||'ok')}" data-sync-age>${C.esc(health.label||'연결 대기')} · ${C.esc(age)}</span></button><button class="v153-iconbtn new-game" data-act="new-game" title="새 게임">${this.v153Icon('reroll')}</button><details class="v153-tools"><summary title="설정·도구">${this.v153Icon('gear')}</summary><div class="v153-tools-pop">${this.renderV153Settings(state)}<div class="v153-tool-actions"><button data-act="run-log-open">기록 보기</button><button data-act="run-log-export">JSON 저장</button><button data-act="run-result-open">게임 결과</button><button type="button" data-act="tab" data-tab="deck">수동 패 보정</button><button type="button" data-act="tab" data-tab="data">연결 진단</button><button type="button" data-act="tab" data-tab="story">스토리 자료</button></div></div></details></div></section>${(()=>{
      const midJoin=this.v1912MidJoinBanner();
      if(midJoin)return midJoin;
      const freeze=this.v199GameEndFreezeSec();
      if(!freeze)return'';
      return`<div class="v159-endgame">${this.v153Icon('warn')}<span>실제 패 변화가 <b>${Math.floor(freeze/60)}분</b>째 없습니다 — 판이 끝났다면 결과를 입력해야 이번 판 기록이 다음 판 교정에 쓰입니다.</span><button data-act="run-result-open">게임 결과 입력</button></div>`;
    })()}`;
  }

  // v18.4: 후속 후보 수집을 렌더러에서 분리한다 — 1번 카드(옛 배치)와 2번
  // 미리보기 패널이 같은 목록을 봐야 "다음에 뭘 하지"가 두 곳에서 어긋나지 않는다.
  v153NextCandidateRows(plan){
    const decision=plan.v15Decision||{},picked=[],seen=new Set(),push=row=>{const id=String(row&&row.id||'');if(!id||seen.has(id)||picked.length>=2)return;seen.add(id);picked.push(row);};
    const current=decision.action||decision.blockedAction;
    for(const step of current&&current.path||[])if(String(step.id)!==String(current.id))push({id:step.id,name:step.name,wispCost:step.wispCost,reason:'현재 행동 확인 뒤 다시 계산'});
    for(const row of decision.alternatives||[])push(row);
    for(const row of decision.recovery&&decision.recovery.targets||[])push(row);
    return picked;
  }

  renderV153NextCandidate(state,plan){
    const picked=this.v153NextCandidateRows(plan);
    if(!picked.length)return'';
    return`<div class="v153-next-candidates"><small>그다음 후보 · 지금 고정하지 않음</small>${picked.map(row=>`<button data-act="detail" data-id="${C.esc(row.id)}"><b>${C.esc(row.name||'후속 후보')}</b><span>${C.esc(row.reason||row.roleLabel||'패 변화 뒤 재평가')}</span><em>선위 ${C.num(row.wispCost)}</em></button>`).join('')}</div>`;
  }

  // v19.9(개선 ④): 이감이 목표를 넘긴 이유를 보이는 곳에서 분해한다.
  // 0731 판 142.5/102 는 "엔진이 이감을 쫓는다"는 오해를 낳았지만 실제로는
  // 모비딕호 40(수동)+블마 40+센고쿠 20+비비 20+연구소 10+발동 12.5 였다.
  // 초과가 뜨면 어느 유닛·연구소·발동이 몇을 보태는지 한 줄로 밝힌다.
  v199SlowSplit(state){
    try{
      const items=[],seenUpper=new Set();let trigger=0;
      for(const unit of state.db.units){
        const count=Math.floor(C.num(state.counts[unit.id]));if(count<=0)continue;
        if(C.isUpper(unit)){const key=C.canonicalUpperId(unit.id);if(seenUpper.has(key))continue;seenUpper.add(key);}
        const role=C.roleProfile(unit),mult=C.isUpper(unit)?1:count;
        trigger+=C.num(role.triggerSlow)*mult;
        const slow=C.num(role.slow)*mult;if(slow<=0)continue;
        // v19.12(0804): 빅맘류 "이감70->40*특강시" — 집계는 보수값(특강 후)
        // 이라고 명시한다.  사용자가 70으로 세는 줄 오해했던 지점.
        const dual=/이감\s*(\d+(?:\.\d+)?)\s*->\s*(\d+(?:\.\d+)?)\s*\*?\s*특강/.exec(String(unit.name||''));
        items.push({name:`${displayNameOf(unit)}${dual?`(특강 기준 ${C.num(role.slow)} 집계)`:''}`,value:slow});
      }
      items.sort((a,b)=>b.value-a.value);
      const parts=items.slice(0,4).map(item=>`${item.name} ${fmt(item.value)}`);
      if(items.length>4)parts.push(`외 ${items.length-4}종`);
      if(this.state.labResearch&&this.state.labResearch.slow)parts.push('연구소 10');
      if(trigger>0)parts.push(`발동 ${fmt(trigger)}(가중 전)`);
      return parts.length?`이감 구성 · ${parts.join(' · ')}`:'';
    }catch(_){return'';}
  }

  // v18.7(사용자 지적: "스펙 표기가 중구난방"): 같은 정보를 다섯 가지 형식으로
  // 보여 주던 것을 한 가지 행 형식으로 통일한다.
  //
  // 전(前): 축 카드 3개("1개 미달" + "88% · 이감 102% 35/102") · 이감 전용 핀
  // ("현재 35 / 목표 102" + 부족 배지) · 요약 3칸(맨숫자 8/9, 3, 5) · 결손
  // 카드("0 / 2" + "부족 2").  이감은 축 카드와 핀에 두 번 나왔고, 축 단위
  // ("2개 미달")와 항목 단위("단일딜 환산 2")가 한 화면에 섞여 있었다.
  //
  // 후(後): [아이콘] 역할명 ... 현재/목표 ... 부족 N — 모든 행이 같은 형식.
  // 축은 행 형식을 바꾸는 대신 묶음 제목으로만 남긴다.  v18 이 축을 나눈 이유
  // (생존은 뚫리면 그 라운드에 죽고, 화력은 밀릴 뿐)는 그대로 지킨다.
  renderV153Spec(state,plan){
    const decision=plan.v15Decision||{},assessment=decision.assessment||{};
    const source=assessment.requirements||plan.deficits&&plan.deficits.requirements||[];
    const seen=new Set(),rows=[];
    for(const row of source){if(!row||seen.has(row.key)||row.waived)continue;seen.add(row.key);rows.push(row);}
    const magic=this.state.mode==='magic',route=magic?this.state.magicRoute:'physical';
    const routeControl=magic?`<label class="v154-magic-route"><span>마딜 경로</span><select data-opt="magicRoute" aria-label="마딜 경로"><option value="auto" ${route==='auto'?'selected':''}>자동</option><option value="dual" ${route==='dual'?'selected':''}>2상위·토키</option><option value="singleEnd" ${route==='singleEnd'?'selected':''}>1상위·단끝</option></select></label>`:'';
    if(!this.state.mode)return`<div class="v153-spec-wait"><b>딜 계통을 선택하세요</b><span>상단의 물딜·마딜 버튼을 누르면 필요한 역할만 표시합니다.</span></div>`;

    const ICON={main:'shield',toki:'shield',armor:'snow',magicSupport:'snow',
      stunBase:'stun',stunFull:'stun',slow:'target',bossFrenzy:'skull',
      single:'single',singleEndStable:'single',singleEndExpected:'single',singleEndMax:'single',end:'end'};
    // 이감 목표의 근거(풀이감/나스쥬로)는 행 옆 주석으로 남긴다 — 전용 핀을
    // 없앴다고 근거까지 사라지면 안 된다.
    const gorosei=C.GOROSEI&&C.GOROSEI[this.state.gorosei]||{};
    const noteFor=row=>row.key==='slow'?(gorosei.key==='nasjuro'?'나스쥬로 목표':'풀이감 목표'):'';
    const severity=row=>{const t=Math.max(.0001,Math.abs(C.num(row.target)));return C.num(row.weight||1)*Math.min(1,Math.max(0,C.num(row.gap))/t);};
    const openRows=rows.filter(r=>C.num(r.gap)>0).sort((a,b)=>severity(b)-severity(a));
    const leadKey=openRows.length?openRows[0].key:'';

    // v17.25 계약 유지: 이감은 충족이든 계산 대기든 항상 한 줄로 보인다.
    // (v17.24 는 gap>0 인 카드만 그려 116.8/102 가 화면에서 사라졌었다.)
    const line=row=>{
      const waiting=row.waiting===true,gap=C.num(row.gap),ok=!waiting&&gap<=0,note=noteFor(row),ratio=waiting?0:Math.max(0,Math.min(100,C.num(row.current)/Math.max(.0001,C.num(row.target))*100));
      const tone=waiting?'wait':ok?'ok':row.status==='warn'?'warn':'bad';
      // v19.8(포렌식 ④): 0731 판에서 이감 142.5/102 를 화면이 그냥 "충족"
      // 으로만 보여 "엔진이 이감을 쫓는다"는 오해를 낳았다 — 초과분을 명시
      // 한다(초과는 번들 부수 효과·수동 제작이지 엔진 가점이 아니다).
      // v19.9.7(0802 패배 포렌식): 1.5스턴 해제 라벨 제거 — 마딜도 이감이
      // 차면 해제되는 게 아니라 물딜처럼 "마지막에 반드시 채움"이 됐다.
      // 0802 판은 46라 이감 충족과 함께 스턴 결손이 화면에서 사라진 채
      // 0.51로 단끝에 들어가 죽었다.
      const overshoot=ok&&C.num(row.current)>C.num(row.target)+5?` · +${fmt(C.num(row.current)-C.num(row.target))} 초과`:'';
      const fillLast=row.meta&&row.meta.fillLast&&gap>0?' · 앞 순위를 채운 뒤 마지막에 반드시 채움(v19.9 교정)':''
        ,slowSplit=row.key==='slow'&&overshoot?this.v199SlowSplit(state):''
        // v19.9.2(0801 패배 포렌식 "보잡이 부족했"): 광보잡·토키 같은 기 수
        // 역할이 정확히 목표치면 화면은 내내 "충족"만 보였다 — 여유 0(한 기
        // 의존)임을 명시한다.  기록: 광보잡 1 마딜은 1승 1패, 2는 1승 0패.
        ,snug=ok&&['bossFrenzy','toki'].includes(row.key)&&C.num(row.current)<C.num(row.target)+1?' · 여유 0 — 한 기 잃으면 열립니다':'';
      return`<div class="v153-role ${tone} ${row.key===leadKey?'lead':''}" data-role="${C.esc(row.key)}" style="--metric:${ratio.toFixed(1)}%">${this.v153Icon(ICON[row.key]||'gear')}<b>${C.esc(row.label)}${row.key===leadKey?'<i>최우선</i>':''}${note?`<small>${C.esc(note)}</small>`:''}${fillLast?`<small class="relaxed">${C.esc(fillLast.slice(3))}</small>`:''}${slowSplit?`<small class="v159-slow-split">${C.esc(slowSplit)}</small>`:''}${snug?`<small class="v159-snug">${C.esc(snug.slice(3))}</small>`:''}</b><strong>${waiting?'현재 계산 대기':fmt(row.current)}<em>/ 목표 ${fmt(row.target)}</em></strong><span><strong>${waiting?'계산 대기':ok?`충족${overshoot}`:`부족 ${fmt(gap)}`}</strong></span></div>`;
    };

    if(!rows.some(r=>r.key==='slow')){
      const target=C.num(magic?gorosei.slowMagic:gorosei.slowPhysical)||102;
      rows.unshift({key:'slow',label:'이감',axis:'survival',current:0,target,gap:0,weight:1,status:'warn',waiting:true});
    }
    const axes=assessment.axes||{},pace=assessment.survivalPace||null;
    const group=(key,label,hint)=>{
      const list=rows.filter(r=>(r.axis||C.roleAxis&&C.roleAxis(r.key)||'firepower')===key);
      if(!list.length)return'';
      const axis=axes[key]||null,open=list.filter(r=>C.num(r.gap)>0).length;
      // 묶음 제목은 "몇 개 미달인가"만 말한다. 수치 비교는 아래 행이 전부 같은
      // 형식으로 한다 — 제목이 또 다른 형식으로 숫자를 말하면 그게 중구난방이다.
      const state=open?`${open}개 미달`:'충족';
      const sorted=list.slice().sort((a,b)=>(C.num(b.gap)>0)-(C.num(a.gap)>0)||severity(b)-severity(a));
      return`<section class="v153-role-group ${open?(key==='survival'?'bad':'warn'):'ok'}"><header><b>${C.esc(label)}</b><em>${C.esc(state)}</em>${axis&&axis.readiness!=null?`<span>${axis.readiness}%</span>`:''}</header><p>${C.esc(hint)}</p>${sorted.map(line).join('')}</section>`;
    };

    const counts=state&&state.db&&C.progressionCounts?C.progressionCounts(state):null;
    const equivalent=counts?C.num(counts.squad):0;
    const paceLine=pace?`<div class="v153-pace ${C.esc(pace.state)}">${this.v153Icon('deadline')}<b>${C.esc({'on-time':'마감 전 확보','held':'유지 중','overdue':'마감 초과','open':'진행 중'}[pace.state]||pace.state)}</b><span>${C.esc(pace.note)}</span></div>`:'';
    const head=`<div class="v153-spec-head"><span><small>전설급 환산</small><b>${equivalent}<i>/ 9</i></b></span><span><small>남은 필수 결손</small><b class="${openRows.length?'gap':'ok'}">${openRows.length}</b></span></div>`;
    const roleGroups=`<div class="v155-role-grid">${group('survival','생존 구조','뚫리면 그 라운드에 죽습니다')}${group('firepower','화력','부족하면 밀립니다 — 즉사는 아닙니다')}</div>`;
    return`${routeControl}${head}${paceLine}${roleGroups}`;
  }

  renderV153RareLedger(state,plan){
    const decision=plan.v15Decision||{},ledger=decision.rare||{},rows=Array.isArray(ledger.rows)?ledger.rows:[],groups=[
      {key:'use',label:'사용',tone:'use',empty:'지금 소비할 희귀 없음'},
      {key:'hold',label:'보류',tone:'hold',empty:'보호할 희귀 없음'},
      {key:'reroll',label:'리롤',tone:'reroll',empty:'리롤할 희귀 없음'}
    ];
    const card=(row,key)=>{const count=C.num(row[key]),unit=row.unit||state&&state.db&&state.db.byId&&state.db.byId.get(String(row.id)),name=row.name||(unit?displayNameOf(unit):String(row.id||'희귀'));return`<button data-act="detail" data-id="${C.esc(row.id)}">${unit&&unit.image?`<img src="${C.esc(unit.image)}" alt="">`:'<i>R</i>'}<span><b>${C.esc(name)}${count>1?` ×${count}`:''}</b><small>${C.esc(row.reason||'현재 파티 원장 기준')}</small></span></button>`;};
    const columns=groups.map(group=>{const list=rows.filter(row=>C.num(row[group.key])>0),total=list.reduce((sum,row)=>sum+C.num(row[group.key]),0);return`<section class="${group.tone}"><header><b>${group.label}</b><strong>${total}장</strong></header><div>${list.map(row=>card(row,group.key)).join('')||`<p>${group.empty}</p>`}</div></section>`;}).join('');
    const rerollRows=rows.filter(row=>C.num(row.reroll)>0),upperChosen=!!this.upperLock(),rerollLeft=Math.max(0,this.rerollLimit()-C.num(this.state.rerollsUsed));
    const rerollBanner=rerollRows.length?`<div class="v153-reroll-now"><span><small>${upperChosen?'안전 리롤':'상위 올리기 전 안전 리롤'}</small><b>${rerollRows.map(row=>C.esc(row.name)).join(' · ')}</b></span><em>남은 ${rerollLeft}/${this.rerollLimit()} · 한 장씩</em></div>`:`<div class="v153-reroll-safe"><b>${upperChosen?'현재 리롤할 희귀 없음':'상위 후보 재료는 전부 보류'}</b><span>${upperChosen?'확정 파티에서 사용처 없는 희귀가 생기면 표시합니다.':'후보 중 하나라도 사용하는 희귀는 돌리지 않습니다.'}</span></div>`;
    const craftRows=this.v153RareCraftRows(state,plan);
    // v17.28: 만들 수 있는 게 없어도 칸(제목)은 남긴다 — 재료를 모으는
    // 구간에 칸이 통째로 사라지면 사용자가 상태를 확인할 수 없다.
    // v17.28(사용자 지적): 만들 수 있는 게 없어도 칸(제목)은 남긴다 —
    // 재료를 모으는 구간에 칸이 통째로 사라지면 사용자가 상태를 확인할
    // 수 없다.  목록은 보유 희귀를 실제로 쓰는 조합만 싣는다.
    const craftBody=craftRows.length?`<div>${craftRows.map(row=>{const rare=(row.rareSpend&&row.rareSpend.byId||[]).filter(item=>C.num(item.use)>0).slice(0,3).map(item=>`${item.name}${C.num(item.use)>1?`×${C.num(item.use)}`:''}`).join(' · ');return`<button data-act="detail" data-id="${C.esc(row.unit.id)}">${row.unit.image?`<img src="${C.esc(row.unit.image)}" alt="">`:''}<span><b>${C.esc(displayNameOf(row.unit))}</b><small>${C.esc(rare)}</small></span><em>선위 ${C.num(row.solve&&row.solve.wispCost)}</em></button>`;}).join('')}</div>`:`<div class="v153-no-crafts"><b>지금 보유 희귀로 바로 만들 전설급 없음</b><span>희귀를 쓰는 조합이 선택 위습이나 특수 선행재료로 막혀 있습니다. 재료가 들어오면 여기부터 다시 채워집니다.</span></div>`;
    const crafts=`<div class="v153-rare-crafts"><header><b>내 희귀함으로 만들 수 있는 전설급</b><span>보유 희귀를 실제로 쓰는 조합만 · 최대 8개</span></header>${craftBody}</div>`;
    return`${ledger.conflict?'<div class="v153-ledger-warning">희귀 분류 충돌 — 제작·리롤을 멈추고 TMO를 다시 읽으세요.</div>':''}${rerollBanner}<div class="v153-rare-columns">${columns}</div>${crafts}`;
  }

  v153ShipOpportunity(state,plan){
    const shipPlan=this.v151ShipPlan(state);if(!shipPlan)return null;
    const source=shipPlan.legendRows.find(row=>String(row.unit&&row.unit.id)===String(shipPlan.recommendedId));
    if(!source||!source.familyFit||!source.feasible||C.num(state.counts[source.unit.id])>0)return null;
    const lock=this.upperLock(),upper=lock&&state.db.byId.get(lock.id)||plan.upper||null,mode=plan.mode||this.state.mode||C.familyOf(upper)||source.family||'magic',settings=Object.assign({},plan.settings||{},{currentRound:this.actualRound(),mode,allowWarped:true,recommendWarped:true}),row=C.candidateRow(state,source.unit,{mode,purpose:'spec',round:this.actualRound(),settings,stock:state.counts,ruleCounts:state.counts,availableWisp:state.wisp,deficits:plan.deficits||{rows:[]},spec:plan.spec||null,upper});
    if(!row.feasible)return null;
    // An already-closed mandatory gate may never be reopened for a ship angle.
    // A small loss inside an already-open gap (the R40 Rare Usopp stun trade)
    // stays visible as a trade-off, because the authoritative action can close
    // that gap first (Aokiji -> Maxim).
    const fatal=(row.impact&&row.impact.rows||[]).filter(item=>item.required&&C.num(item.gapBefore)<=.005&&C.num(item.gapAfter)>.005);
    if(fatal.length)return null;
    const tradeoffs=(row.impact&&row.impact.rows||[]).filter(item=>item.required&&C.num(item.gapAfter)>C.num(item.gapBefore)+.005).map(item=>item.label).slice(0,2),rare=(row.rareSpend&&row.rareSpend.byId||[]).filter(item=>C.num(item.use)>0).map(item=>item.name),slack=(source.commonSlack||[]).find(item=>item.have>=item.need&&/우솝/.test(item.name))||(source.commonSlack||[]).find(item=>item.have>=item.need)||null,memo=source.memoRank<999?`${upper?displayNameOf(upper):'현재 상위'} 규격 ${source.memoRank}위`:'해적선 패각',role=C.summarizeRoles({role:row.role},mode);
    return Object.assign({},row,{shipPlan,shipSource:source,memoLabel:memo,roleLabel:role,rareLabel:rare.join(' · ')||'희귀 직접소모 없음',slackLabel:slack?`${slack.name} ${slack.have}장 여유`:'' ,tradeoffs});
  }

  // v18.4 UI 개편: 목업 2번 패널 — 지금 할 일 다음에 무엇이 오는지.
  // 데이터는 새로 만들지 않는다. 엔진이 이미 내는 후속 후보와 활성 마감을
  // 흐름으로 배열만 바꿔 보여 준다("계획"이 아니라 "패가 바뀌면 재계산").
  // v18.5 UI: 아이콘 팩(ord_icons.js, 투명 PNG 64px)을 먼저 쓴다.  팩은
  // base64 로 구워져 있어 확장·수동판 양쪽에서 네트워크 요청이 0 이다.
  // 팩에 없는 이름은 아래 인라인 SVG 로 물러난다 — 팩 파일이 빠져도 화면이
  // 비지 않게 하기 위한 안전망이다.
  v153Icon(name){
    const pack=(typeof window!=='undefined'&&window.ORD_ICONS)||null;
    const packName=this.v153IconName(name);
    if(pack&&packName&&pack[packName])return`<img class="v153-ic v153-ic-img" src="${pack[packName]}" alt="" aria-hidden="true">`;
    return this.v153IconSvg(name);
  }

  // 화면에서 쓰는 역할 이름 → 팩 파일명.  팩 이름을 코드 곳곳에 흩지 않고
  // 여기 한 곳에서만 갈아끼우게 둔다.
  v153IconName(name){
    const MAP={
      clock:'ui-round-clock',shield:'ui-phase-shield',blade:'ui-damage-swords',
      spiral:'ui-wisp-spiral',sync:'ui-sync-check',target:'spec-slow',
      skull:'spec-boss',single:'spec-single',end:'spec-end-damage',
      snow:'spec-magic-defense-break',stun:'spec-stun',check:'ui-check-circle',
      warn:'ui-warning',reroll:'ui-reroll',branch:'ui-branch',chevron:'ui-chevron-right',
      party:'ui-party-group',gem:'ui-rare-gem',cube:'ui-material-cube',
      recipe:'ui-recipe-book',lock:'ui-protected-material',deadline:'ui-deadline-stopwatch',
      gear:'ui-settings-gear',anchor:'rare-koby',flag:'ui-branch',placeholder:'ui-unit-placeholder'
    };
    return MAP[name]||'';
  }

  v153IconSvg(name){
    const P={
      clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      shield:'<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
      blade:'<path d="M4 20l7-7"/><path d="M14 4l6 6-8 2-1-1z"/>',
      spiral:'<path d="M12 12a3 3 0 1 1-3-3 5 5 0 1 1 5 5 7 7 0 1 1-7-7"/>',
      target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
      skull:'<path d="M12 3a7 7 0 0 0-7 7v3l2 2v3h10v-3l2-2v-3a7 7 0 0 0-7-7z"/><circle cx="9.5" cy="11" r="1.4"/><circle cx="14.5" cy="11" r="1.4"/>',
      gear:'<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
      snow:'<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/>',
      anchor:'<circle cx="12" cy="5" r="2.2"/><path d="M12 7.2V21M5 13a7 7 0 0 0 14 0"/>',
      warn:'<path d="M12 4l9 16H3z"/><path d="M12 10v5M12 17.6v.6"/>',
      check:'<path d="M4 12.5l5 5L20 6.5"/>',
      flag:'<path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/>'
    };
    const body=P[name]||P.gear;
    return`<svg class="v153-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  renderV153Preview(state,plan){
    const decision=plan.v15Decision||{},assessment=decision.assessment||{};
    const stateKey=String(decision.state||'HOLD'),current=decision.action||decision.blockedAction||{};
    const path=[].concat(current.path||decision.bestPath&&decision.bestPath.steps||[]);
    const currentId=String(current.id||''),at=path.findIndex(step=>String(step&&step.id||'')===currentId);
    const next=at>=0?path.slice(at+1).find(step=>step&&String(step.id||'')!==currentId):null;
    // v19.8(사용자 요청 ②): "다음 판단 의미 없음 — 다음에 만들 유닛 3개가
    // 나을듯" — 완료 후/다시 계산 3분할을 접고, 검증 경로·파티 순서에서
    // 다음 제작을 초상화와 함께 큐로 보여준다.  먼 미래 고정 금지
    // 원칙은 문구로 지킨다(1번 카드만 확정 · 이후는 패 변화 시 재계산).
    // v19.9(사용자 요청): 큐를 3→5개로 늘리고 보존 섹션은 뺀다 — 보존
    // 근거는 남는 희귀 패널의 사용·보류 접이에 그대로 남아 있다.
    const db=state&&state.db;
    const queue=[];const queued=new Set([currentId]);
    const pushStep=(item,source)=>{
      const id=String(item&&item.id||'');
      if(!id||queued.has(id)||queue.length>=5)return;
      const unit=db&&db.byId.get(id);
      if(unit&&C.num((state.counts||{})[id])>0)return;
      queued.add(id);
      // v19.9(개선 ②): 다음 제작 큐에 오른 유닛은 수동 제작 경고 대상이 아니다.
      (this._v199RecommendedIds||(this._v199RecommendedIds=new Map())).set(id,Date.now());
      // v20.2(0806 "왜 갑자기 네코마무시를 추천한거야"): 회복 목표가 이
      // 큐에 섞여 들어오는데 부제가 roleLabel('광보잡 2')로 덮여 출처가
      // 통째로 사라졌다 — 패널 제목은 "다음 제작"이라, 화면이 실제로
      // "다음에 네코를 만들라"고 말한 셈이다(실측 118건 중 104건).
      // 목표 계열 출처는 부제 앞에 반드시 남긴다.
      const goal=source==='회복 목표'||source==='후보',
        detail=String(item.reason||item.note||item.roleLabel||''),
        note=goal?`${source}${detail?` · ${detail}`:''}`:(detail||source);
      queue.push({id,unit,name:item.name||(unit?displayNameOf(unit):id),wispCost:C.num(item.wispCost),note,source,goal});
    };
    // 소스 사슬(0731 로그 329판정 실측): 엔진 경로는 구조상 미래 최대 1기 —
    // 3개는 파티 순서(87/137)·대안(109회)·회복 목표(93회)가 채운다.
    for(const step of path)pushStep(step,'검증 경로');
    for(const step of [].concat(decision.bestPath&&decision.bestPath.steps||[]))pushStep(step,'검증 경로');
    if(stateKey==='ROUTE_CHOICE')for(const candidate of (decision.routeCandidates||[]).slice(0,3))for(const step of [].concat(candidate.projectedSupport&&candidate.projectedSupport.steps||[]))pushStep(step,'상위 후보 경로');
    for(const action of [].concat(plan.squadPlan&&plan.squadPlan.actions||[]))pushStep(action,'파티 순서 · 가변');
    for(const alt of [].concat(decision.alternatives||[]))pushStep(alt,'차선');
    for(const target of [].concat(decision.recovery&&decision.recovery.targets||[]))pushStep(target,'회복 목표');
    for(const row of this.v153NextCandidateRows(plan))pushStep(row,'후보');
    // v19.10(외부 점검 8-4): 큐 번호(1~5)가 확정 순서처럼 읽혔다 — 확정은
    // 왼쪽 큰 카드 하나뿐이므로, 큐 항목은 번호 대신 '가변' 표기로 그린다.
    const queueHtml=queue.length?queue.map((item,index)=>`<button class="v158-queue-row${item.goal?' v202-goal-row':''}" data-act="detail" data-id="${C.esc(item.id)}"><i class="v1910-flex" title="${item.goal?'앞으로 닫을 목표 · 지금 만들라는 뜻이 아님':'순서 없는 가변 후보'}">${item.goal?'목표':'—'}</i>${item.unit&&item.unit.image?`<img src="${C.esc(item.unit.image)}" alt="">`:this.v153Icon('placeholder')}<span><b>${C.esc(item.name)}</b><small>${C.esc(item.note)}</small></span><em>${this.v153Icon('spiral')}${C.num(item.wispCost)}</em></button>`).join('')
      :`<div class="v158-queue-empty"><b>${stateKey==='SYNC_BLOCKED'?'TMO 확인 대기':stateKey==='ROUTE_CHOICE'?'상위 확정 대기':'다음 제작 계산 중'}</b><span>${stateKey==='SYNC_BLOCKED'?'새 스캔이 들어오면 다음 순서를 다시 계산합니다.':stateKey==='ROUTE_CHOICE'?'메인 상위를 확정하면 제작 순서가 여기 나옵니다.':'현재 패에서 증명되는 다음 제작이 잡히면 나옵니다.'}</span></div>`;
    return`<div class="v158-queue" data-state="${C.esc(stateKey)}">${queueHtml}</div>`;
  }

  // v18.4 UI 개편: 목업 3번 패널 — 기존 희귀 장부에서 "만들 수 있는 전설급"만
  // 떼어냈다. 첫 줄에는 추천 표시를 단다(엔진 순위 1위).
  renderV153CraftableLegends(state,plan){
    const rows=this.v153RareCraftRows(state,plan);
    if(!rows.length)return`<div class="v153-no-crafts"><b>겹치는 전설 없음</b><span>보유 희귀와 맞는 전설 조합이 생기면 여기에 표시됩니다.</span></div>`;
    const db=state&&state.db;
    // v19.8(사용자 요청 ③): 3개 → 6개, 각 카드에 "내 패의 어떤 희귀를
    // 쓰는지"를 보유/부족으로 나눠 명시한다.  모자란 칸은 "노리기" 카드
    // (아직 희귀가 없는 최근접 전설)로 채운다.
    // v19.10(외부 점검 8-1): 보유 희귀를 실제로 쓰는 카드와 '노리기'
    // (보유 희귀 0장) 카드를 같은 격자에 섞지 않는다 — 지금 만들 수 있는
    // 후보로 오해되던 혼합을 구역으로 나눈다.  막대도 TMO% 가 아니라
    // 문구('희귀 n/m')와 같은 보유 비율을 그린다(8-2).
    // v20.5: 완성도 %는 화면에서 철거됐다 — 남은 흔함 장수로 말한다.
    const nowRows=rows.filter(row=>!row.upcoming),upcomingRows=rows.filter(row=>row.upcoming);
    const renderCard=(row,index)=>{
      const progress=row.rareProgress||{},owned=C.num(progress.owned),total=C.num(progress.total);
      // v19.9(사용자 요청): 카드의 큰 %는 희귀 수 비율이 아니라 TMO 조합도우미가
      // 보고하는 완성도(state.percent)를 그대로 쓴다 — "희귀 전설은 티모지지
      // %를 가져오게".  진행 막대도 같은 수치로 통일한다.
      // v20.5(사용자 요청 "티모 %이제 필요없잖아 없애줘"): 완성도% 전면 철거.
      // 1라 빈 패에서는 모든 칸이 0%라 정보가 아니라 소음이었다.  실제로
      // 행동을 바꾸는 사실(희귀 n/m · 남은 흔함 장수 · 선위)만 남긴다.
      const ingredients=(progress.ingredients||[]).slice(0,4).map(item=>{
        const unit=db&&db.byId.get(String(item.id)),img=unit&&unit.image?`<img src="${C.esc(unit.image)}" alt="" loading="lazy">`:'';
        return`<span class="${C.num(item.short)>0?'missing':'owned'}">${img}${C.esc(item.name)} <b>${C.num(item.owned)}/${C.num(item.total)}</b></span>`;
      }).join('');
      // v22.9: 상태·선위는 계획 차감 실비용(planWispCost) 기준 — 예약 겹침이
      // 있으면 '제작 가능'처럼 보이던 카드가 실은 선위 부족일 수 있다.
      const shownCost=row.planWispCost!=null?C.num(row.planWispCost):C.num(row.solve&&row.solve.wispCost);
      const shownGap=Math.max(0,shownCost-C.num(state&&state.wisp));
      const status=row.upcoming?`노리기 · 희귀 ${C.num(progress.short)}장 필요`:row.feasible&&shownGap<=0?'제작 가능':row.blocked&&row.blocked.length?row.blocked[0]:shownGap>0?`선위 ${shownGap} 부족`:'재료 대기';
      const recommended=C.num(row.recommendationRank)>0;
      const covers=(row.covers||[]).slice(0,3);
      const coversHtml=covers.length?`<div class="v156-covers">${this.v153Icon('check')}<span>${covers.map(label=>`<b>${C.esc(label)}</b>`).join('')}</span></div>`:`<div class="v156-covers muted">${this.v153Icon('gear')}<span><b>${C.esc(row.roles||'역할 보조')}</b></span></div>`;
      const usedNames=(progress.ingredients||[]).filter(item=>C.num(item.owned)>0).map(item=>item.name);
      const usedLine=usedNames.length?`<div class="v158-uses">${this.v153Icon('gem')}<span>내 희귀 사용 · <b>${C.esc(usedNames.slice(0,3).join(' · '))}${usedNames.length>3?` 외 ${usedNames.length-3}`:''}</b></span></div>`:row.upcoming?`<div class="v158-uses muted">${this.v153Icon('gem')}<span>보유 희귀 없이 시작 — 부족분만 모으면 열립니다</span></div>`:'';
      // v19.9(사용자 요청): "뭐랑 뭐랑 뭐랑 조합해야 하는지" — TMO 레시피의
      // 직접 조합식(direct stuffs)을 그대로 보인다.  보유분이 재료 수를 채우면
      // owned, 아니면 missing 으로 칠한다.
      // v19.9.2(사용자 요청): 능력치 주석은 빼고(recipeNameOf) 잘리지 않게
      // 두 줄까지 감싼다(CSS line-clamp).  절단 상한도 4→6 재료.
      const direct=(row.solve&&row.solve.direct||[]).slice(0,6);
      const recipeLine=direct.length?`<div class="v159-recipe">${this.v153Icon('gear')}<span>조합 · ${direct.map(item=>{const need=Math.max(1,C.num(item.count));const label=`${C.esc(recipeNameOf(C.materialName(db,item.id)))}${need>1?`×${need}`:''}`;return`<b class="${C.num(item.owned)>=need?'owned':'missing'}">${label}</b>`;}).join('<i>+</i>')}</span></div>`:'';
      // v19.9(사용자 요청): 노리기 카드의 우상단 %를 숨긴다 — 배지와 겹쳐
      // "0%"가 읽히지도 않았고, 희귀 0장 카드의 0%는 정보가 아니다.
      const ratioHtml='';
      return`<button class="${recommended?'recommended':''} ${row.upcoming?'upcoming':row.feasible?'ready':'waiting'}" data-act="detail" data-id="${C.esc(row.unit.id)}">${recommended?'<i class="v153-pick">추천</i>':row.upcoming?'<i class="v153-pick dim">노리기</i>':''}<header>${row.unit.image?`<img src="${C.esc(row.unit.image)}" alt="">`:this.v153Icon('placeholder')}<span><b>${C.esc(displayNameOf(row.unit))}</b><small>${C.esc(row.roles||'역할 보조')}</small></span>${ratioHtml}</header><div class="v154-rare-progress"><strong>희귀 ${owned}/${total}</strong><em>${C.esc(status)}</em></div><i class="v154-rare-bar${row.feasible?' full':''}"><span style="width:${total>0?Math.round(owned/total*100):0}%"></span></i>${recipeLine}${usedLine}${coversHtml}<div class="v154-rare-mats">${ingredients}</div><footer>${this.v153Icon('spiral')}<b>선위 ${shownCost}</b>${C.num(row.planExtra)>0?`<em class="v229-claim" title="파티 계획이 즉시 사용·미래 참고로 예약한 재료를 빼고 다시 계산한 실비용입니다 — 예약 재료를 여기 쓰면 계획이 그만큼 비싸집니다">예약 겹침 +${C.num(row.planExtra)}</em>`:''}<span>부족 흔함 ${shownCost}장 = 선위</span></footer></button>`;
    };
    const cards=nowRows.slice(0,6).map(renderCard).join('');
    const upcomingCards=upcomingRows.slice(0,Math.max(2,6-Math.min(6,nowRows.length))).map(renderCard).join('');
    const upcomingBlock=upcomingCards?`<div class="v1910-upcoming-head">앞으로 노리기 — 보유 희귀를 아직 쓰지 않는 후보</div><div class="v153-craft-cards v158-six upcoming-zone">${upcomingCards}</div>`:'';
    return`${cards?`<div class="v153-craft-cards v158-six">${cards}</div>`:`<div class="v153-no-crafts"><b>지금 보유 희귀를 쓰는 조합 없음</b><span>희귀가 생기면 여기에 표시됩니다.</span></div>`}${upcomingBlock}${rows.length>6?`<button class="v153-craft-more" data-act="tab" data-tab="deck">전체 제작각 ${rows.length}개</button>`:''}`;
  }

  // v18.4 UI 개편: 목업 6번 패널 — 최종 파티·상위 재료 어디에도 안 쓰이는 희귀.
  // 사용·보류 장부는 버리지 않고 접어 둔다(목업에는 없지만 판단 근거라 유지).
  renderV153UnusedRare(state,plan){
    const decision=plan.v15Decision||{},ledger=decision.rare||{},rows=Array.isArray(ledger.rows)?ledger.rows:[];
    const rerollRows=rows.filter(row=>C.num(row.reroll)>0),rerollLeft=Math.max(0,this.rerollLimit()-C.num(this.state.rerollsUsed)),upperChosen=!!this.upperLock();
    const chip=row=>{const unit=row.unit||state&&state.db&&state.db.byId&&state.db.byId.get(String(row.id));return`<button data-act="detail" data-id="${C.esc(row.id)}">${unit&&unit.image?`<img src="${C.esc(unit.image)}" alt="">`:this.v153Icon('gem')}<b>${C.esc(row.name||'희귀')}${C.num(row.reroll)>1?` ×${C.num(row.reroll)}`:''}</b></button>`;};
    const rerollTotal=rerollRows.reduce((sum,row)=>sum+C.num(row.reroll),0);
    const body=rerollRows.length
      ?`<div class="v153-reroll-now"><span><small>${upperChosen?'리롤 가능':'상위 전 안전 리롤'}</small><b>${rerollTotal}장 · 파티 재료와 겹침 없음</b></span><em>남은 ${rerollLeft}/${this.rerollLimit()}</em></div><div class="v153-unused-chips">${rerollRows.map(chip).join('')}</div><button class="v153-reroll-btn" data-act="tab" data-tab="deck">${this.v153Icon('reroll')}한 장씩 리롤</button>`
      :`<div class="v153-reroll-safe"><b>${upperChosen?'현재 리롤할 희귀 없음':'상위 후보 재료는 전부 보류'}</b><span>${upperChosen?'확정 파티에서 사용처 없는 희귀가 생기면 표시합니다.':'후보 중 하나라도 사용하는 희귀는 돌리지 않습니다.'}</span></div>`;
    // v21.5 희귀 사용 계획은 v22.0 부터 국면 ③ 패널과 공유한다 —
    // 추출된 v215PlanBlock 이 같은 목록을 두 자리에 공급한다.
    const planBlock=this.v215PlanBlock(state,plan);
    const groups=[{key:'use',label:'사용'},{key:'hold',label:'보류'}];
    // v19.10(P0-2): 근거 접기에서 이름 나열 대신 목적지·마감을 같이 적는다.
    const ledgerRows=groups.map(group=>{const list=rows.filter(row=>C.num(row[group.key])>0);return`<div class="${group.key}"><b>${group.label} ${list.reduce((sum,row)=>sum+C.num(row[group.key]),0)}장</b><span>${list.map(row=>{const dest=[...new Set((row.destinations||[]).map(item=>item.unitName).filter(Boolean))].slice(0,2);return C.esc(`${row.name||row.id}${dest.length?`→${dest.join('·')}`:''}${row.deadlineRound?`(${row.deadlineRound}라)`:''}`);}).join(' · ')||'없음'}</span></div>`;}).join('');
    return`${ledger.conflict?'<div class="v153-ledger-warning">희귀 분류 충돌 — 제작·리롤을 멈추고 TMO를 다시 읽으세요.</div>':''}${planBlock}${body}<details class="v153-rare-ledger-fold"><summary>사용·보류 근거</summary><div class="v153-rare-fold-body">${ledgerRows}</div></details>`;
  }

  renderV153UpperParty(state,plan){
    // v23.2(0816 리포트: "코비는 마딜인데 물딜인 크로커다일을 추천하고"):
    // 방향 확정 전 상위 후보는 물딜·마딜 차선을 합쳐 클리어 가치순으로만
    // 정렬돼, 패가 마딜로 기울어 화면이 '마딜'을 표시하는 중에도 물딜
    // 상위(크로커다일 제한됨)가 2순위로 노출됐다(r22~24 실측).  화면이
    // 보여주는 성향과 같은 계통 차선을 먼저 세우고, 반대 계통은 '계통
    // 전환' 배지를 달아 뒤로 보낸다 — 후보에서 빼지는 않는다(전향은
    // 정당한 선택지, 그러나 기본 권장이 아님을 명시).
    const decision=plan.v15Decision||{},lock=this.upperLock(),db=state&&state.db;
    const leanMode=plan.mode==='magic'||plan.mode==='physical'?plan.mode:'';
    const rowLane=row=>row&&row.routeKey==='physical'?'physical':row&&row.routeKey?'magic':'';
    const allRouteCandidates=(decision.routeCandidates||[]).filter(Boolean);
    const sameLane=row=>!leanMode||!rowLane(row)||rowLane(row)===leanMode;
    const orderedCandidates=allRouteCandidates.filter(sameLane).concat(allRouteCandidates.filter(row=>!sameLane(row)).map(row=>Object.assign({},row,{familyPivot:rowLane(row)})));
    const upper=lock&&db&&db.byId.get(lock.id)||plan.upper||null,candidates=orderedCandidates.slice(0,3);
    if(!upper){
      if(!candidates.length){
        const ghostSlots=Array.from({length:9},(_,index)=>`<i><span>${index+1}</span></i>`).join('');
        return`<div class="v155-party-idle"><div class="v153-upper-empty"><b>상위 후보 계산 대기</b><span>25라 전후 현재 희귀·특별 패에서 상위 3개만 비교합니다.</span></div><div class="v155-party-ghost" aria-label="9환산 파티 빈 자리">${ghostSlots}</div></div><button class="v153-snipe-open" data-act="snipe-open">원하는 상위 직접 저격…</button>`;
      }
      const canConfirm=true; // v22.1: 25라 게이트 해제
      // v19.8(사용자 요청 ⑤): "너무 같은 것만 나오니까 재미가 없다" — 최근
      // 5판에서 안 간 상위에 배지를 붙인다.  순위는 그대로다(표시 전용) —
      // 강제로 가고 싶으면 저격이 공식 경로.
      const recentMains=new Set((this.state.recentMainUppers||[]).map(String));
      // v19.10(외부 점검 4-3): 같은 상위가 반복 추천될 때 "왜 1위인가"를
      // 2위와의 실제 차이로 밝힌다 — 억지 다양성 감점 대신 근거 표시.
      const runnerNote=(top,second)=>{
        if(!top||!second)return'';
        const tr=top.powerTier&&top.powerTier.known?C.num(top.powerTier.rank):-1,sr=second.powerTier&&second.powerTier.known?C.num(second.powerTier.rank):-1;
        const edge=tr!==sr?(tr>sr?`티어 우위(${top.powerTier.letter}>${second.powerTier&&second.powerTier.letter||'?'})`:`티어는 낮지만 각 우위`):String(top.angleLabel||'')!==String(second.angleLabel||'')?`각 우위(${top.angleLabel||'미평가'} vs ${second.angleLabel||'미평가'})`:C.num(top.wispCost)!==C.num(second.wispCost)?`선위 우위(${C.num(top.wispCost)} vs ${C.num(second.wispCost)})`:'준비도 우위';
        return`<small class="v1910-runner">2위 ${C.esc(second.name)} 대비: ${C.esc(edge)}</small>`;
      };
      return`<div class="v153-upper-list">${candidates.map((row,index)=>{const tier=row.powerTier&&row.powerTier.known?`${row.powerTier.letter}티어`:'티어 확인 중',ready=routeCandidateReady(row),enabled=canConfirm&&ready,freshPick=recentMains.size>0&&!recentMains.has(String(C.canonicalUpperId(row.id)));return`<article class="${index===0?'best':''}"><header><span>${index+1}</span><div><b>${C.esc(row.name)}</b>${(row.familyPivot||row.familySwitch)?`<i class="v232-pivot">계통 전환 · ${(row.familyPivot||row.familySwitch)==='physical'?'물딜':'마딜'} 각</i>`:''}${freshPick?'<i class="v158-fresh">최근 5판에 안 간 각</i>':''}<small>${C.esc(tier)} · ${C.esc(row.angleLabel||'미평가')} · ${C.esc(row.routeLabel||'')}</small></div></header><div><strong>선위 ${C.num(row.wispCost)}</strong><span>${C.num(row.wispGap)>0?`현재 ${C.num(row.wispGap)}개 부족`:'현재 충당 가능'}</span></div><p>${C.esc(row.reason||'상위와 보조 전설급을 같은 파티로 평가합니다.')}</p>${playbookHtml(db&&db.byId.get(String(row.id)),{compact:true})}${index===0?runnerNote(row,candidates[1]):''}<footer><button data-act="party-preview" data-id="${C.esc(row.id)}">파티 보기</button><button class="primary" data-act="choose-direction" data-key="${C.esc(row.routeKey)}" data-id="${C.esc(row.id)}" ${enabled?'':'disabled aria-disabled="true"'}>${ready?'상위 확정':'파티 평가 중'}</button></footer></article>`;}).join('')}</div><button class="v153-snipe-open" data-act="snipe-open">목록에 없는 상위 저격…</button>`;
    }
    const squad=plan.squadPlan||this.v151ComputeParty(state,plan,upper.id);if(squad&&!squad.error)plan.squadPlan=squad;
    const power=C.upperPowerTier?C.upperPowerTier(upper,db):null,openRequirements=(decision.assessment&&decision.assessment.requirements||[]).filter(row=>row.required!==false&&!row.waived&&C.num(row.gap)>0),requirements=openRequirements.slice(0,3),ship=this.v153ShipOpportunity(state,plan),baseSupports=this.v151BuildableLegendRows(state,plan).filter(row=>!ship||String(row.unit.id)!==String(ship.unit.id)),supports=ship?[baseSupports[0],ship,baseSupports[1]].filter(Boolean).slice(0,3):baseSupports.slice(0,3);
    const supportHtml=supports.map((row,index)=>{const shipRow=ship&&String(row.unit.id)===String(ship.unit.id),reason=shipRow?`${row.memoLabel} · ${row.roleLabel}`:row.squadSupportReason||(row.covers||[]).slice(0,2).join(' · ')||'필수 역할 보강',materials=shipRow?`${row.rareLabel}${row.slackLabel?` · ${row.slackLabel}`:''}${row.tradeoffs&&row.tradeoffs.length?` · 먼저 ${row.tradeoffs.join('·')} 보강`:''}`:'';return`<button class="${shipRow?'ship-opportunity':''}" data-source="${shipRow?'ship-opportunity':'squad-support'}" data-act="detail" data-id="${C.esc(row.unit.id)}"><i>${shipRow?'배':index+1}</i>${row.unit.image?`<img src="${C.esc(row.unit.image)}" alt="">`:''}<span><b>${C.esc(displayNameOf(row.unit))}</b><small>${C.esc(reason)}</small>${C.num(row.metaPartnerShare)>0?`<small class="v1917-partner">클리어 실측 파트너 ${C.num(row.metaPartnerShare)}%</small>`:''}${materials?`<small class="materials">${C.esc(materials)}</small>`:''}</span><em>선위 ${C.num(row.solve&&row.solve.wispCost)}</em></button>`;}).join('');
    // v18.4(목업): 최종 파티를 "몇 기 확보했나 / 각 자리가 어느 단계인가"로
    // 보여 준다. 상태는 새로 계산하지 않는다 — 보유(실제 카운트) · 지금(이번
    // 행동) · 다음(후속 후보) · 예정(파티 계획) 순으로 이미 있는 값을 읽는다.
    const counts=state&&state.counts||{},squadLineup=(squad&&!squad.error&&squad.finalLineup||[]).slice(0,9);
    const actionId=String(decision.action&&decision.action.id||'');
    const actionPath=[].concat(decision.action&&decision.action.path||[]),actionAt=actionPath.findIndex(row=>String(row&&row.id||'')===actionId);
    const nextIds=new Set((actionAt>=0?actionPath.slice(actionAt+1,actionAt+2):[]).map(row=>String(row&&row.id||'')));
    const progress=C.progressionCounts?C.progressionCounts(state):null,secured=progress?C.num(progress.squad):0;
    const chipFor=item=>{
      const unit=item&&(item.unit||item),id=String(unit&&unit.id||'');
      if(!unit||!id)return'';
      const owned=C.num(counts[id])>0;
      const stage=owned?'보유':id===actionId?'지금':nextIds.has(id)?'다음':'예정';
      return`<button class="stage-${stage==='보유'?'own':stage==='지금'?'now':stage==='다음'?'next':'plan'}" data-act="detail" data-id="${C.esc(id)}">${unit.image?`<img src="${C.esc(unit.image)}" alt="">`:this.v153Icon('placeholder')}<b>${C.esc(displayNameOf(unit))}</b><em>${stage}</em></button>`;
    };
    const displayLineup=squadLineup.slice(0,4),chips=displayLineup.map(chipFor).join('');
    const emptySlots=Math.max(0,9-squadLineup.length);
    const placeholders=emptySlots&&displayLineup.length<4?Array.from({length:Math.min(4-displayLineup.length,emptySlots)},()=>`<span class="v153-party-slot">${this.v153Icon('placeholder')}<b>미정</b><em>후보 대기</em></span>`).join(''):'';
    // v19.1(사용자 요청): "내 파티에 확정 이런거 있으면 좋을듯? 내가 버튼
    // 누르면 자꾸 사라지니까 짜증나네." — 상위만 확정해서는 나머지 자리가
    // 계속 가변 재계산되어 화면에 보이던 구성이 바뀐다.  여기서 지금 보이는
    // 구성 전체를 그대로 목표로 찍을 수 있게 한다.  못 만드는 자리는
    // searchExactBlueprint 가 스스로 가변 자리로 풀어 준다.
    const blueprintInfo=squad&&squad.blueprint||null,partyLockActive=!!(blueprintInfo&&blueprintInfo.active&&blueprintInfo.commitment==='full-party'),partyLockTone=partyLockActive?({kept:'ok',adapted:'warn',invalid:'bad'}[blueprintInfo.status]||'ok'):'off',partyLockLabel=partyLockActive?({kept:'그대로 유지',adapted:'일부만 가변 교체',invalid:'유지 불가 · 갱신 필요'}[blueprintInfo.status]||'확정됨'):'파티 미확정',partyLockHtml=`<div class="v153-party-lock ${partyLockTone}">${this.v153Icon('lock')}<b>파티 확정 · ${C.esc(partyLockLabel)}</b><div>${partyLockActive?`<button data-act="confirm-party">다시 확정</button><button data-act="release-party">해제</button>`:`<button class="primary${openRequirements.length?' warn':''}" data-act="confirm-party">${openRequirements.length?`역할 미완 ${openRequirements.length}건 — 그래도 확정`:'지금 구성 확정'}</button>`}</div></div>`;
    // v23.2(0816 포렌식): '9/9 확보'가 스턴 0.56·단끝 0 상태에서도 완료처럼
    // 읽혔다(65라 전멸 판).  환산 수는 슬롯 이야기일 뿐이므로, 필수 역할이
    // 비어 있으면 헤더와 본문에서 그 사실이 환산 수보다 먼저 읽히게 한다.
    const rolesOpenHtml=requirements.length?`<small class="v232-party-roles-open">환산과 별개로 필수 역할 미완: ${requirements.map(row=>`${C.esc(row.label||row.key)} 부족 ${C.num(row.gap)}`).join(' · ')} — 아직 클리어 스펙이 아닙니다.</small>`:'';
    const partyBoard=`<div class="v153-party"><header>${this.v153Icon('party')}<b>9환산 계획</b><strong class="${openRequirements.length?'gap':''}">${secured} / 9 확보${openRequirements.length?` · 역할 미완 ${openRequirements.length}건`:''}</strong></header>${partyLockHtml}<div class="v153-party-chips">${chips}${placeholders}</div>${rolesOpenHtml}<small>${emptySlots?`남은 자리 ${emptySlots}`:'9자리 계획 완료'}${squadLineup.length>displayLineup.length?` · 외 ${squadLineup.length-displayLineup.length}기는 전체 보기`:''}</small></div>`;
    // v19(사용자 요청): 두 번째 상위 확정.
    //
    // "상위는 만드는데 시간이 걸려서 만들다가 바뀌면 곤란해지는경우가 있어."
    // 확정하면 그 자리는 다른 상위에게 넘어가지 않는다.  물딜에서도 확정하면
    // 2상위 경로가 열리고, 보드 목표가 5기로 함께 줄어든다(9환산 유지).
    const mainKey=String(C.canonicalUpperId(upper.id)),confirmedSecondId=String(this.state.secondUpperId||'');
    const confirmedSecond=confirmedSecondId&&db?db.byId.get(confirmedSecondId):null;
    const plannedSecond=squadLineup.map(item=>item&&(item.unit||db&&db.byId.get(String(item.id||'')))).find(unit=>unit&&C.isUpper(unit)&&String(C.canonicalUpperId(unit.id))!==mainKey)||null;
    const secondTier=unit=>{const tier=C.upperPowerTier?C.upperPowerTier(unit,db):null;return tier&&tier.known?`${tier.letter}티어`:'티어 확인 중';};
    let secondBlock='';
    if(confirmedSecond){
      secondBlock=`<div class="v153-second confirmed"><header>${this.v153Icon('lock')}<b>확정 두 번째 상위</b></header><div><strong>${C.esc(displayNameOf(confirmedSecond))}</strong><small>${C.esc(secondTier(confirmedSecond))} · 이 자리는 다른 상위로 바뀌지 않습니다</small>${playbookHtml(confirmedSecond,{compact:true})}</div><footer><button data-act="detail" data-id="${C.esc(confirmedSecond.id)}">상세</button><button data-act="release-second-upper">확정 해제</button></footer></div>`;
    }else{
      const options=this.v19SecondUpperCandidates(state,plan,upper),plannedId=plannedSecond?String(plannedSecond.id):'';
      // v19.7(사용자 요청 ⑤): 처방(전수 메모 v2)의 추천 2상위를 후보에 합치고,
      // 메인 상위와 희귀 트리가 겹치는지 실측으로 표시한다 — "서로 희귀함
      // 안 겹치고 시너지 나는 방향".  0731 로그의 나미는 겹침 1종(마젤란)
      // 뿐이었는데 그 사실이 화면 어디에도 없었다.
      const treeRares=id=>{try{const solve=C.recipeSolve(db,id,state.counts||{});return new Set([...Object.keys(solve.rareUse||{}),...Object.keys(solve.buildNeeded&&solve.buildNeeded.rare||{})]);}catch(_){return new Set();}};
      const mainRares=treeRares(upper.id);
      const prescribed=(upperPlaybookOf(upper)||{}).second||[];
      const rows=[];
      if(plannedSecond)rows.push({unit:plannedSecond,label:'현재 계획',wispCost:C.num((squad&&(squad.actions||[]).find(action=>String(action.id)===plannedId)||{}).wispCost)});
      for(const option of options){if(rows.length>=3)break;if(String(option.unit.id)===plannedId)continue;rows.push({unit:option.unit,label:option.feasible?'지금 제작 가능':`선위 ${option.wispCost}`,wispCost:option.wispCost});}
      // v19.7.1(외부 감사 ③): 처방 추천이 정식 후보의 안전 필터를 우회했다
      // (계열 교차 45건 · 선행조건 막힘 40건 실측).  계열이 다르면 싣지 않고,
      // 선행조건(레일리·해적선·아이템 등)이 막힌 후보는 확정 버튼을 잠근다.
      const routeMode=plan&&plan.mode||this.state.mode||(upper?C.familyOf(upper):'')||'physical';
      for(const rec of prescribed){
        if(rows.length>=4)break;
        const unit=db&&db.byId.get(String(rec.id||''));
        if(!unit||String(C.canonicalUpperId(unit.id))===mainKey)continue;
        const family=C.familyOf(unit);
        if(family!=='neutral'&&family!==routeMode)continue;
        const existing=rows.find(row=>String(C.canonicalUpperId(row.unit.id))===String(C.canonicalUpperId(unit.id)));
        if(existing){existing.presc=rec;continue;}
        let wispCost=0;try{wispCost=C.num(C.recipeSolve(db,unit.id,state.counts||{}).wispCost);}catch(_){wispCost=0;}
        rows.push({unit,label:'처방 추천',wispCost,presc:rec});
      }
      for(const row of rows){
        const shared=[...treeRares(row.unit.id)].filter(id=>mainRares.has(id));
        row.sharedRares=shared.map(id=>C.materialName(db,id));
        try{row.hardBlocked=(C.recipeSolve(db,row.unit.id,state.counts||{}).hardMissing||[]).map(item=>item.name).slice(0,2);}catch(_){row.hardBlocked=[];}
      }
      secondBlock=rows.length?`<details class="v153-second"><summary>두 번째 상위 확정 · ${plannedSecond?`현재 계획 ${C.esc(displayNameOf(plannedSecond))}`:'계획에 두 번째 상위 없음'}</summary><div class="v153-second-list">${rows.map(row=>`<article><span><b>${C.esc(displayNameOf(row.unit))}</b><small>${C.esc(secondTier(row.unit))} · ${C.esc(row.label)}</small>${row.presc?`<small class="presc">처방 · ${C.esc(row.presc.why||'시너지 추천')}</small>`:''}<small class="${row.sharedRares&&row.sharedRares.length?'clash':'okv'}">${row.sharedRares&&row.sharedRares.length?`메인과 희귀 겹침 ${C.esc(row.sharedRares.slice(0,2).join('·'))}${row.sharedRares.length>2?` 외 ${row.sharedRares.length-2}`:''}`:'메인과 희귀 겹침 없음'}</small>${row.hardBlocked&&row.hardBlocked.length?`<small class="clash">선행 막힘 · ${C.esc(row.hardBlocked.join('·'))}</small>`:''}${playbookHtml(row.unit,{compact:true,maxPairs:3})}</span><span><button data-act="detail" data-id="${C.esc(row.unit.id)}">상세</button><button class="primary" data-act="confirm-second-upper" data-id="${C.esc(row.unit.id)}" ${row.hardBlocked&&row.hardBlocked.length?`disabled aria-disabled="true" title="선행조건 필요: ${C.esc(row.hardBlocked.join('·'))}"`:''}>2상위 확정</button></span></article>`).join('')}</div><small>확정하면 그 자리를 다른 상위에게 넘기지 않습니다. 물딜도 확정하면 2상위로 갑니다(보드 5기 + 상위 2기 = 9환산).</small></details>`:'';
    }
    return`<div class="v153-upper-main">${upper.image?`<img src="${C.esc(upper.image)}" alt="">`:''}<span><small>확정 메인 상위${power&&power.known?` · ${C.esc(power.letter)}티어`:''}</small><b>${C.esc(displayNameOf(upper))}</b><em>${C.esc(C.summarizeRoles({role:C.roleProfile(upper)},C.familyOf(upper)))}</em></span><button data-act="party-preview" data-id="${C.esc(upper.id)}">전체 파티 보기</button><button data-act="snipe-open" title="다른 상위로 강제 변경">저격</button></div>${playbookDirectionHtml(upper)}${partyBoard}${secondBlock}<div class="v153-upper-gaps"><small>이 파티에서 먼저 닫을 결손</small>${requirements.length?requirements.map(row=>`<span>${C.esc(row.label)} <b>부족 ${fmt(row.gap)}</b></span>`).join(''):'<span class="ok">필수 역할 합계 충족</span>'}</div>${(()=>{
      // v19.16: 이 상위의 클리어 조합 실측(91,833판 채굴) 대비 하위 25%
      // 미만인 역할을 경고한다 — 0805 키드 판(체젠 0.45, 실측 p25 0)의
      // 후속.  표시 전용: 게이트·목표 교체 없음.
      const cs=C.clearStatsFor&&C.clearStatsFor(upper.id);if(!cs)return'';
      const rows=new Map(((plan.deficits||{}).rows||[]).map(row=>[row.key,row]));
      const MAP=[['slow','slow','이감'],['stunFull','stun','스턴'],['regen','regen','체젠'],['single','single','단일'],['end','end','끝딜']];
      const warns=[];
      for(const [rowKey,statKey,label] of MAP){
        const row=rows.get(rowKey);const p25=C.num(cs.roles&&cs.roles[statKey]&&cs.roles[statKey].p25);
        if(!row||p25<=0)continue;
        if(C.num(row.current)+1e-9<p25)warns.push(`${label} ${fmt(row.current)} <b>(실측 하위25% 선 ${p25})</b>`);
      }
      const partners=cs.partners.slice(0,3).map(item=>`${C.esc(String(item.name).split(/[\s(]/)[0])} ${item.share}%`).join(' · ');
      if(!warns.length&&!partners)return'';
      return`<div class="v1916-clear-audit"><small>클리어 조합 실측 · ${C.num(cs.games)}판</small>${warns.length?`<p class="warn">${warns.join(' · ')} — 클리어 조합 대부분보다 낮습니다</p>`:'<p class="ok">주요 역할이 실측 분포 안에 있습니다</p>'}${partners?`<p>실측 파트너 · ${partners}</p>`:''}</div>`;
    })()}<details class="v153-support-fold"><summary>다음 보조 전설급 ${supports.length}개 · 같은 최종 파티 기준</summary><div class="v153-support-list">${supportHtml||'<p>현재 패에서 확정할 보조 전설급을 계산 중입니다.</p>'}</div></details>`;
  }

  renderCoach(state,plan,phase,clock,health){
    // v17.24: 상시 노출은 행동·결손·희귀 장부·상위 파티 네 가지뿐이다.
    // v22.0(사용자 승인 목업): 명세서 국면 구동 — 상단 스트립이 국면·마감을
    // 들고, 스펙 자리는 국면 패널이 되고, 참고 탭은 접힌 서랍이 된다.
    const v22ph=this.v22Phase(plan);this._v22PhaseNow=v22ph;
    // v23.2(0816): 판단 잠금 고스트용 — 수신이 살아 있을 때의 카드를 캡처.
    const actionCardHtml=this.renderV151NextAction(state,plan,health);
    if(health&&health.ready)this._lastReadyActionCard={html:actionCardHtml,at:Date.now(),round:this.actualRound()};
    return`<div class="v153-screen">${this.renderV153Status(state,clock,health)}<main class="v155-dashboard"><section class="v153-panel v153-next v155-action-zone" data-region="next-action"><header><small>${this.v153Icon('blade')}</small><div><h2>지금 할 일</h2><p>지금 실행할 한 가지</p></div></header><div class="v155-action-layout"><div class="v155-action-core">${actionCardHtml}</div><aside class="v155-decision-rail" data-region="next-preview"><header class="v155-subhead"><small>${this.v153Icon('branch')}</small><div><h3>다음 제작</h3><p>${v22ph.key==='p4'||v22ph.key==='p5'?'가변 후보 · 확정은 큰 카드 1개':v22ph.key==='p6'?'신세계 국면 — 후보 고정 없음(지금 할 일에 집중)':'마감 국면(40라~)에 열립니다'}</p></div></header>${v22ph.key==='p4'||v22ph.key==='p5'?this.renderV153Preview(state,plan):`<div class="v22-rail-rest">${C.esc(v22ph.num)} ${C.esc(v22ph.label)} 국면은 후보를 미리 고정하지 않습니다 — 지금 할 일 하나에 집중하세요. 필요하면 아래 서랍(희귀 → 전설)을 여세요.</div>`}</aside></div></section><section class="v153-panel v153-spec" data-region="clear-gaps"><header><small>${this.v153Icon('shield')}</small><div><h2>국면 ${C.esc(v22ph.num)} ${C.esc(v22ph.label)}</h2><p>${C.esc(v22ph.question)}</p></div></header>${this.renderV22PhasePanel(state,plan)}</section><section class="v153-panel v211-refer${this._v22DrawerOpen?'':' v22-closed'}" data-region="reference">${(()=>{const hasUpper=!!(plan.upper||this.upperLock());const tab=this._v211Tab||(hasUpper?"party":"craft");const tabs=[["craft","희귀 → 전설"],["party","최종 파티"],["rare","남는 희귀"]];return`<nav class="v211-tabs" role="tablist">${tabs.map(([key,label])=>`<button type="button" role="tab" aria-selected="${this._v22DrawerOpen&&tab===key}" class="${this._v22DrawerOpen&&tab===key?"on":""}" data-act="v211-tab" data-tab="${key}">▸ ${label}</button>`).join("")}${this._v22DrawerOpen?'<button type="button" class="v22-drawer-close" data-act="v22-drawer-close">접기 ×</button>':''}</nav><div class="v211-pane ${tab==="craft"?"on":""}"><section class="v153-panel v153-craft" data-region="craftable-legends"><header><small>${this.v153Icon('recipe')}</small><div><h2>희귀 → 전설</h2><p>보유 희귀 진행도</p></div></header>${this.renderV153CraftableLegends(state,plan)}</section></div><div class="v211-pane ${tab==="party"?"on":""}"><section class="v153-panel v153-upper" data-region="upper-party"><header><small>${this.v153Icon('party')}</small><div><h2>최종 파티</h2><p>9환산 계획</p></div></header>${this.renderV153UpperParty(state,plan)}</section></div><div class="v211-pane ${tab==="rare"?"on":""}"><section class="v153-panel v153-unused v155-rare-strip" data-region="unused-rare"><header><small>${this.v153Icon('reroll')}</small><div><h2>남는 희귀</h2><p>리롤 후보</p></div></header><div class="v155-rare-body">${this.renderV153UnusedRare(state,plan)}</div></section></div>`;})()}</section></main></div>`;
  }
  renderCoachDetails(state,plan,open=false){
    const squad=plan.squadPlan,extraActions=(plan.actions||[]).slice(2),watch=(plan.watch||[]).slice(0,6);if(!squad&&!extraActions.length&&!watch.length)return'';
    const extraHtml=extraActions.length?`<section class="coach-detail-block"><div class="watch-head"><div><b>후속 제작 순서</b><small>위의 바로 제작 1~2기를 TMO에서 확인한 뒤 활성화됩니다.</small></div><span>${extraActions.length}개</span></div><div class="action-list secondary">${extraActions.map((row,index)=>this.renderActionRow(state,plan,row,index+2)).join('')}</div></section>`:'',watchHtml=watch.length?`<section class="coach-detail-block"><div class="watch-head"><div><b>미리 대비할 후보</b><small>현재 행동 뒤 패가 바뀌면 다시 계산되는 참고 후보입니다.</small></div><span>${watch.length}개</span></div><div class="watch-list">${watch.map((row,index)=>this.renderWatchRow(state,plan,row,index)).join('')}</div></section>`:'';
    return`<details class="ord-panel coach-details" ${open?'open':''}><summary><span><b>목표 조합·상세 보기</b><small>미래 스쿼드 · 재료 장부 · 대비 후보</small></span><em>${open?'미리보기 펼침':'기본 접힘'}</em></summary><div class="coach-details-body">${squad?this.renderSquadPlan(state,plan):''}${extraHtml}${watchHtml}</div></details>`;
  }
  renderDirectionBoard(state,plan){
    const board=plan.directionBoard||{};if(board.loading)return`<section class="ord-panel direction-board loading"><div class="panel-head"><div><small>25라 전체 패 방향 분석</small><h2>게임과 분리해 후보 6개를 계산 중입니다</h2><p>현재 패로 실제 제작 가능한 다음 행동과 미래 역할 참고안을 분리해서 계산합니다.</p></div><span class="count-pill">잠시만 기다려 주세요</span></div></section>`;if(board.error)return`<section class="ord-panel direction-board error"><div class="panel-head"><div><small>방향 계산기</small><h2>후보 계산을 시작하지 못했습니다</h2><p>${C.esc(board.error)}</p></div><button data-act="connection">다시 동기화</button></div></section>`;const lanes=board.lanes||[],status=this.state.directionStatus||'open',hold=status==='hold',provisional=board.provisionalDirection||null,provisionalCanonical=provisional&&String(provisional.upperCanonicalId||C.canonicalUpperId(provisional.upperId)||''),tierKeys=['rare','special','uncommon'],tierLabels={rare:'희귀',special:'특별',uncommon:'안흔'},tierUse=row=>{const raw=row.safePrefix&&row.safePrefix.tierUse||{};return Object.fromEntries(tierKeys.map(key=>[key,C.num(raw[key])]));},tierInitial=row=>Object.fromEntries(tierKeys.map(key=>[key,C.num(row.plan&&row.plan.handFit&&row.plan.handFit.tiers&&row.plan.handFit.tiers[key]&&row.plan.handFit.tiers[key].initial)])),rowCard=(lane,row,index)=>{const use=tierUse(row),initial=tierInitial(row),selected=this.state.directionKey===lane.key&&this.state.directionUpperId===row.upperId,evaluation=row.routeEvaluation||{},finish=evaluation.finish||{},tone=row.status||'hold',upperNames=(row.upperNames||[row.upperName]).filter(Boolean).join(' + '),missing=(row.missing||[]).slice(0,3).join(' · '),finishLine=lane.key==='singleEnd'?`안정 하한 ${fmt(finish.stable)} · 일반 ${fmt(finish.expected)} · 이론 ${fmt(finish.maximum)}`:'',prep=row.upperPreparation||{},prefixData=row.safePrefix||{},prefixWisp=C.num(prefixData.wispUsed),shortage=C.num(row.wispShortage),dependency=shortage>0?`미래 참고안 선위 ${shortage}개 부족 · 9기 확정 금지`:row.handFeasible===false?'현재 패 재료 보존 불가':row.guaranteedComplete?'현재 패 전체 제작 검증':`미래 역할 참고 ${C.num(row.futureDependencyCount)}건`,prefix=(row.prefixActions||[]).map((action,step)=>`${step+1}. ${action.name} (선위 ${C.num(action.wispCost)})`).join(' → '),recommended=!!provisionalCanonical&&String(row.upperCanonicalId||C.canonicalUpperId(row.upperId))===provisionalCanonical,checkpointMiss=!!provisional&&!prefixData.checkpointPass,canChoose=(row.guaranteedComplete===true||row.provisionalSelectable===true)&&!checkpointMiss,chooseText=checkpointMiss?'체크포인트 미달':row.guaranteedComplete?'전체 검증 경로 선택':prefixData.checkpointPass?'30라 체크 경로 선택':'상위 방향만 선택',powerTier=row.powerTier||{},strategyLabel=powerTier.known?`${powerTier.letter}티어 · ${row.angleLabel||'미래각'}`:'';return`<article class="direction-candidate ${tone} ${recommended?'recommended':''} ${selected?'selected':''}"><header><span>${index+1}안</span><div><b>${C.esc(upperNames||'현재 제작 가능한 상위 없음')}</b><small>미래 역할표 ${C.num(row.plan&&row.plan.plannedBoardCount)}/${C.num(row.plan&&row.plan.targetBoardCount)}칸 · 환산 ${C.num(row.plan&&row.plan.plannedCount)}/9</small></div><em>${C.esc(strategyLabel?`${strategyLabel} · ${row.statusLabel||'판정 보류'}`:row.statusLabel||'판정 보류')}</em></header><div class="direction-hand">${tierKeys.map(key=>`<span class="${key}"><i>${tierLabels[key]} 즉시소모</i><b>${use[key]}/${initial[key]}</b></span>`).join('')}<span class="wisp"><i>현재 순서 선위</i><b>${prefixWisp}${shortage?` · 미래안 부족 ${shortage}`:''}</b></span></div><p>${C.esc(prefix?`현재 패 확정 순서: ${prefix}`:evaluation.note||missing||'현재 패로 확정 가능한 제작이 없습니다.')}</p>${finishLine?`<div class="finish-band">${C.esc(finishLine)}<small>메인 상위는 보조 3~4기 계산에서 제외</small></div>`:''}<div class="direction-meta"><span>${C.esc(prep.label||'상위 준비 계산 중')}</span><span>${C.esc(missing||'미래 역할 합계 충족')}</span><span>${C.esc(dependency)}</span><span>확정 행동 후 희귀 잔여 ${C.num(prefixData.rareRemaining)}</span></div><footer><button data-act="preview-direction" data-key="${lane.key}" data-id="${C.esc(row.upperId)}">참고안 보기</button><button class="primary" data-act="choose-direction" data-key="${lane.key}" data-id="${C.esc(row.upperId)}" ${canChoose?'':'disabled aria-disabled="true"'}>${selected&&status==='selected'&&!checkpointMiss?'선택 유지 중':chooseText}</button></footer></article>`;},laneHtml=lanes.map(lane=>`<section class="direction-lane ${lane.key}"><div class="direction-lane-head"><div><small>독립 경로 · 전역 순위 없음</small><h3>${C.esc(lane.label)}</h3></div><p>${C.esc(lane.priority)}</p></div><div class="direction-candidates">${(lane.rows||[]).length?(lane.rows||[]).map((row,index)=>rowCard(lane,row,index)).join(''):'<div class="direction-empty"><b>현재 패에서 검토할 상위가 없습니다</b><span>레일리·해적선·아이템 같은 선행 특수 재료가 잡히면 다시 열립니다.</span></div>'}</div></section>`).join(''),selectedRow=lanes.flatMap(lane=>(lane.rows||[]).map(row=>({lane,row}))).find(item=>item.lane.key===this.state.directionKey&&item.row.upperId===this.state.directionUpperId),safeRows=status==='selected'&&selectedRow&&selectedRow.row.projectedComplete?selectedRow.row.unusedRare||[]:[],safe=safeRows.map(item=>`${item.name}${item.count>1?`×${item.count}`:''}`).join(' · '),provisionalLabel=provisional?`${provisional.upperName} · ${provisional.routeKeys&&provisional.routeKeys.length>1?'세부 마딜 경로는 다음 패에서 결정':'현재 체크포인트 우세'}`:'',heroRoutes=provisional?(provisional.routeKeys||[]).map(key=>(lanes.find(lane=>lane.key===key)||{}).label||key).join(' · '):'',heroActions=provisional?(provisional.actions||[]).slice(0,2):[],hero=provisional?`<section class="direction-recommendation" aria-label="지금 권장"><div class="recommendation-copy"><small>지금 권장</small><h3>${C.esc(provisional.upperName||'현재 체크포인트 상위')}</h3><p>${C.num(provisional.checkpoint&&provisional.checkpoint.dueRound)||30}라 체크포인트를 현재 패로 닫는 유일한 상위 경로 · ${C.esc(heroRoutes||'세부 경로 재계산')}</p></div><div class="recommendation-actions">${heroActions.map((action,index)=>`<span><i>${index+1}</i><b>${C.esc(action.name)}</b><em>선위 ${C.num(action.wispCost)}</em></span>`).join('')}<small>이 1~2기만 현재 확정입니다. 제작 뒤 TMO 패를 다시 읽습니다.</small></div></section>`:'';
    const filter=board.modeFilter||(!this.state.mode?'auto':this.state.mode),filterText=filter==='physical'?'물딜 후보만 표시':filter==='magic'?'마딜 후보만 표시':'물딜·마딜 모두 비교';
    return`<section class="ord-panel direction-board ${hold?'hold':''}"><div class="panel-head direction-board-head"><div><small>25라 현재 패 기반 · ${C.esc(filterText)}</small><h2>${hold?'현재 패에서는 방향 보류':'지금 증명되는 다음 제작 경로'}</h2><p>미래 랜덤 드랍은 보유 자원으로 계산하지 않습니다. 현재 패로 순서가 증명되는 1~2기만 확정하고, 나머지는 역할 참고안으로만 표시합니다.</p></div><div class="direction-board-actions"><div class="damage-mode-switch" role="group" aria-label="딜 계통 선택"><button class="${filter==='auto'?'on':''}" data-act="mode" data-value="">자동 비교</button><button class="${filter==='physical'?'on':''}" data-act="mode" data-value="physical">물딜</button><button class="${filter==='magic'?'on':''}" data-act="mode" data-value="magic">마딜</button></div><span>${board.dominant?`단독 우세 · ${C.esc((lanes.find(lane=>lane.key===board.dominant)||{}).label||board.dominant)}`:provisional?`현재 패 우세 · ${C.esc(provisionalLabel)}`:'고정 9기 확정 없음'}</span><button data-act="hold-direction">${hold?'현재 패 변경까지 보류 중':'아직 방향 보류'}</button></div></div>${hero}<div class="direction-lanes">${laneHtml}</div><div class="direction-reroll ${status==='selected'?'selected':''}"><b>${status==='selected'?'현재 확정 행동 뒤 리롤':'방향 확정 전 리롤 잠금'}</b><span>${status==='selected'&&safe?safe:'패가 실제로 소비된 뒤 TMO를 다시 읽고 희귀 사용처를 재계산합니다.'}</span></div></section>`;
  }
  renderSupportRanking(profile,context='overview'){
    const rows=(profile&&profile.now||[]).slice(0,3);if(!rows.length)return'';
    const labels={rare:'희귀',special:'특별',uncommon:'안흔'},reason=row=>row.supportStageLabel||row.supportStage&&row.supportStage.label||row.pairSynergy&&row.pairSynergy.reason||row.why&&row.why.headline||'현재 필수 조건과 같은 단계의 패 효율 후보',cards=rows.map((row,index)=>{const unit=row.unit,use=row.tierUse||{},rank=C.num(row.supportRank)||index+1,tierHtml=['rare','special','uncommon'].map(key=>`<span class="${key}"><i>${labels[key]}</i><b>${C.num(use[key])}</b></span>`).join('');return`<button class="support-rank-card rank-${rank}" data-act="detail" data-id="${C.esc(unit.id)}"><div class="support-rank-title"><strong>${rank}위</strong><span><b>${C.esc(displayNameOf(unit))}</b><small>${C.esc(tierLabel(unit))}</small></span><em>선위 ${C.num(row.solve&&row.solve.wispCost)}</em></div><div class="support-tier-vector">${tierHtml}</div><p>${C.esc(reason(row))}</p></button>`;}).join('');
    return`<section class="support-ranking ${C.esc(context)}"><header><div><b>보조유닛 후보 1·2·3위</b><span>필수 구조 단계를 먼저 지킵니다. 카드에는 희귀 → 특별 → 안흔함 소비와 선택위습만 간단히 표시합니다.</span></div><em>${rows.length}개 비교</em></header><div class="support-rank-list">${cards}</div></section>`;
  }
  observedDeficits(plan){
    const timeline=plan&&plan.squadPlan&&plan.squadPlan.timelineReadiness,actual=timeline&&timeline.actual&&timeline.actual.requirements;if(!actual||!Array.isArray(actual.rows))return plan&&plan.deficits||{};const requirements=actual.rows,missing=requirements.filter(row=>C.num(row.gap)>0),clearRows=missing.filter(row=>row.required!==false),buildRows=missing.filter(row=>row.required!==false||row.meta&&row.meta.recommended);return Object.assign({},plan.deficits||{},{requirements,rows:missing,clearRows,buildRows,readiness:C.num(actual.readiness),control:actual.control||plan.deficits&&plan.deficits.control||{},route:actual.route||plan.deficits&&plan.deficits.route,source:'TMO 실제 완성 유닛'});
  }
  renderMainOverview(state,plan){
    const profile=C.upperProfileData(state,plan.upper,plan,global.ORD_UPPER_MEMO,global.ORD_SYNERGY_MEMO),upper=profile&&profile.upper,verdict=this.clearVerdict(plan),def=this.observedDeficits(plan),ctl=def.control||{},readout=this.controlReadout(ctl),upperLock=this.upperLock(),owned=!!(upper&&C.num(state.counts[upper.id])>0),locked=!!(upper&&upperLock&&(C.canonicalUpperId(upperLock.id)===C.canonicalUpperId(upper.id))),upperStatus=owned&&locked?'TMO 보유 · 고정':owned?'TMO 보유':locked?'확정 · 제작 전':upper?'미리보기':'선택 전',strategy=profile&&profile.strategy||{},facts=profile&&profile.facts||{always:[],trigger:[],mechanics:[]},factValue=fact=>fact&&fact.value!=null?` ${fact.key==='stun'?fmtStun(fact.value):fmt(fact.value)}`:'',factChips=[...(facts.always||[]).slice(0,3).map(fact=>`<span class="always"><i>상시</i>${C.esc(fact.label+factValue(fact))}</span>`),...(facts.trigger||[]).slice(0,2).map(fact=>`<span class="trigger"><i>발동</i>${C.esc(fact.label+factValue(fact))}</span>`),...(facts.mechanics||[]).slice(0,1).map(fact=>`<span class="mechanic">${C.esc(fact.label)}</span>`)].join(''),requirements=(def.requirements||[]).filter(row=>row.required&&!['control','stun','slow'].includes(row.key)&&C.num(row.gap)>0),metric=row=>`<div class="clear-metric ${row.status||'bad'}"><small>${C.esc(row.label)}</small><b>${fmt(row.current)} <i>/ ${fmt(row.target)}</i></b><span>부족 ${fmt(row.gap)}</span></div>`,controlMetric=`<div class="clear-metric control ${ctl.status||'danger'}"><small>스턴 · 이감</small><b>${fmtStun(ctl.stun)} <i>/ ${fmtStun(ctl.stableStun||1.5)}</i> · ${fmt(readout.stable)} <i>/ ${fmt(ctl.targetSlow||102)}</i></b><span>${C.esc(ctl.label||'보강 필요')}</span></div>`,controlMissing=C.num(ctl.stun)+.0001<C.num(ctl.stableStun||1.5)||C.num(readout.stable)+.0001<C.num(ctl.targetSlow||102),priority=[];for(const row of def.buildRows||def.rows||[]){const label=row.key==='control'?'제어력':row.label;if(label&&!priority.includes(label))priority.push(label);}const routeNote=plan.mode==='physical'?'상시 방깎 180과 최소 0.7스턴을 먼저 고정하고, 50라 구조 기준에서는 1.5스턴까지 확인합니다.':(verdict.resolvedRoute==='dual'?'상위 2기·토키·광보잡 경로':'상위 1기·안정 단/끝 3 이상·광보잡 경로'),slowNote=this.state.gorosei==='nasjuro'?'나스쥬로 적용 상한 117':'이감 적용 목표 102',metricsHtml=`${controlMissing?controlMetric:''}${requirements.map(metric).join('')}`;
    const upperHero=upper?`<div class="main-upper-unit"><img src="${C.esc(upper.image||'')}" alt=""><div><small>메인 상위 · ${C.esc(upperStatus)}</small><h2>${C.esc(displayNameOf(upper))}${storyBadge(upper,C.storyGrade(upper))}</h2><p><b>${C.esc(strategy.label||'상위 중심 설계')}</b> · ${C.esc(strategy.summary||'현재 패에서 필수 스펙과 재료 중복을 함께 계산합니다.')}</p><div class="main-upper-facts">${factChips||'<span>상위를 중심으로 최종 역할을 계산 중입니다.</span>'}</div></div><span class="mode-pill ${profile.mode}">${modeLabel(profile.mode)}</span></div>`:`<div class="main-upper-unit empty"><div class="upper-placeholder">?</div><div><small>메인 상위 · ${C.esc(upperStatus)}</small><h2>아직 미확정</h2><p>25라운드 후보에서 상위·조합 방향을 먼저 확정하세요.</p></div><span class="mode-pill ${plan.mode}">${modeLabel(plan.mode)}</span></div>`;
    return`<section class="ord-panel main-overview ${verdict.status}"><div class="main-overview-head">${upperHero}<div class="clear-verdict"><small>현재 실보유 역할표 · 클리어 확률 아님</small><strong>${C.esc(verdict.label)}</strong><b>${C.num(def.readiness)}%</b><i><em style="width:${Math.max(0,Math.min(100,C.num(def.readiness)))}%"></em></i><span>구조 역할 진행도 · 보스 화력 별도</span></div></div><div class="clear-overview compact"><div class="clear-overview-title"><div><small>${C.esc(def.source||'TMO 실제 완성 유닛')}</small><h3>현재 스펙 결손</h3><p>${C.esc(routeNote)} · ${C.esc(slowNote)}</p></div><span class="control-badge ${verdict.status}">${C.esc(verdict.specReady?'구조 역할 충족 · DPS 미검증':'실보유 보강 중')}</span></div><div class="clear-metrics">${metricsHtml||'<div class="clear-metric all-clear"><small>현재 구조 결손</small><b>없음</b><span>보스 화력은 별도 미검증</span></div>'}</div><div class="overview-priority"><b>현재 우선순위</b>${priority.length?priority.slice(0,6).map((label,index)=>`<span>${index+1}. ${C.esc(label)}</span>`).join(''):'<span class="ok">구조 역할 합계만 충족 · 보스 화력 미검증</span>'}</div></div></section>`;
  }
  renderPostLegendChoice(branch){
    if(!branch||!branch.active)return'';const route=branch.route||'',awaiting=!route,pending=!!normalizeTransaction(this.state.pendingTransaction),title=pending?'추가 전설·히든 제작을 TMO와 대조 중':awaiting?'첫 전설·히든 완성 · 다음 진행을 선택하세요':route==='legend'?'전설·히든 한 기 추가 제작 중':'상위와 전설 환산 9기 준비 중',note=pending?'TMO 제작 반영 확인 후 다음 경로 선택이 가능합니다.':awaiting?'선택하기 전에는 다음 유닛을 추천하지 않습니다. 현재 패 운영 방향을 직접 정하세요.':route==='legend'?'후보 한 기가 완성되면 이 선택창이 다시 열립니다. 그전에도 바로 상위 준비로 전환할 수 있습니다.':'상위를 확정하기 전까지 언제든 전설·히든 한 기 추가 제작으로 전환할 수 있습니다.',disabled=pending?' disabled aria-disabled="true"':'';
    return`<section class="ord-panel post-legend-choice ${pending?'pending':awaiting?'awaiting':route}"><div class="panel-head"><div><small>첫 전설·히든 이후 사용자 선택</small><h2>${C.esc(title)}</h2><p>${C.esc(note)}</p></div>${route?`<span class="count-pill">현재 선택 · ${route==='legend'?'추가 제작':'상위 준비'}</span>`:''}</div><div class="post-legend-options"><button class="${route==='legend'?'selected':''}" data-act="post-legend-route" data-value="legend"${disabled}><b>전설·히든 하나 더</b><span>부족 재료가 적은 순 · 완성 후 다시 선택</span></button><button class="${route==='upper'?'selected':''}" data-act="post-legend-route" data-value="upper"${disabled}><b>상위 준비</b><span>상위 3기분을 반영한 전설 환산 9기 미리보기</span></button></div></section>`;
  }
  renderConnectionGuard(health){
    // v19.12: 데스크톱 셸은 조합도우미 페이지와 무관 — 확장판용 절차를
    // 보여주면 사용자가 tmo.gg 페이지를 열고 기다리게 된다(0804 실측).
    const desktop=typeof window!=='undefined'&&!!window.ORD_DESKTOP;
    const steps=desktop?'<ol><li>TMO.GG <b>데스크톱 프로그램</b>(설치형 앱)을 실행합니다 — tmo.gg 웹사이트가 아닙니다.</li><li>게임을 시작하면 자동으로 연결됩니다. 브라우저·조합도우미 페이지는 필요 없습니다.</li><li>아래 버튼으로 연결 상태를 다시 확인합니다.</li></ol>':'<ol><li>TMO 32172 조합도우미를 엽니다. 기존 34366도 호환됩니다.</li><li>TMO 페이지를 한 번 새로고침합니다.</li><li>아래 버튼으로 현재 패를 다시 읽습니다.</li></ol>';
    const actions=`<div class="guard-actions"><button class="primary" data-act="connection">${desktop?'연결 다시 확인':'TMO 지금 읽기'}</button>${desktop?'':'<button data-act="open-tmo">TMO 32172 열기</button>'}${health.key==='waiting'?'<button data-act="accept-snapshot">현재 보이는 패로 계속</button>':''}</div>`;
    return`<section class="ord-panel connection-guard"><div class="guard-icon">!</div><div><small>오래되거나 불완전한 데이터로는 추천하지 않습니다</small><h2>${C.esc(health.label)}</h2><p>${C.esc(health.note)}</p>${steps}${actions}</div></section>`;}
  renderTransactionBanner(){const tx=normalizeTransaction(this.state.pendingTransaction);if(!tx)return'';const names=tx.steps.map(x=>x.name).filter(Boolean).slice(-3).join(' → ');return`<div class="transaction-banner ${tx.status}"><div><b>${tx.status==='review'?'제작 거래 확인 필요':'제작 거래 원자적 반영 중'}</b><span>${C.esc(names)} · 결과와 소모 재료 ${Object.keys(tx.expected).length}종을 함께 적용</span></div><button data-act="connection">TMO 대조</button><button data-act="dismiss-transaction">TMO 현재값 사용</button></div>`;}
  renderSquadPlan(state,plan){
    const squad=plan.squadPlan,upperLock=this.upperLock(),previewId=this.state.upperPreviewId;if(!squad){if(!previewId&&!upperLock)return'';return this.actualRound()>=18?`<section class="ord-panel squad-panel"><div class="empty">선택한 상위의 예상 파티를 계산 중입니다. 현재 패를 다시 동기화하세요.</div></section>`:'';}
    if(squad.error)return`<section class="ord-panel squad-panel error"><div class="panel-head"><div><small>전설 환산 9기 전역 탐색</small><h2>스쿼드 계산을 완료하지 못했습니다</h2><p>${C.esc(squad.error)}</p></div></div></section>`;
    const targetEquivalent=Math.max(9,C.num(squad.targetCount)||9),raw=Array.isArray(squad.finalLineup)?squad.finalLineup:Array.isArray(squad.lineup)?squad.lineup:[],unitOf=item=>{if(!item)return null;if(item.unit)return typeof item.unit==='string'?state.db.byId.get(item.unit):item.unit;if(item.id)return state.db.byId.get(item.id)||item;return typeof item==='string'?state.db.byId.get(item):item;};
    const lineup=raw.map((item,index)=>({item,unit:unitOf(item),index})).filter(x=>x.unit),targetBoard=Math.max(1,C.num(squad.targetBoardCount)||targetEquivalent-2*(plan.mode==='magic'&&squad.magicRoute==='dual'?2:1)),plannedBoard=lineup.length,plannedEquivalent=C.num(squad.plannedCount)||lineup.reduce((sum,x)=>sum+(C.isUpper(x.unit)?3:1),0),buildableEquivalent=C.num(squad.projectedCount),buildableBoard=C.num(squad.projectedBoardCount),route=squad.routeLabel||squad.magicRouteLabel||squad.strategy||(`${modeLabel(plan.mode)} ${plan.mode==='magic'?(this.state.magicRoute==='dual'?'상위 2+토키':this.state.magicRoute==='singleEnd'?'상위 1+단·끝':'자동 경로'):'상위 1+풀방깎'}`),coverage=squad.roleCoverage&&squad.roleCoverage.planned||squad.roleCoverage||{},coverageRows=Array.isArray(coverage.rows)?coverage.rows:[],plannedReady=!!coverage.complete,routeConfirmable=!squad.routeEvaluation||squad.routeEvaluation.confirmable!==false,handFeasible=!!squad.handFit&&squad.handFit.feasible!==false,wispFeasible=!!squad.wispBudget&&squad.wispBudget.fullPartyFeasible===true,containsPreviewUpper=!previewId||lineup.some(item=>C.canonicalUpperId(item.unit.id)===C.canonicalUpperId(previewId)),complete=plannedBoard>=targetBoard&&plannedEquivalent>=targetEquivalent&&plannedReady,exactConfirmable=complete&&routeConfirmable&&handFeasible&&wispFeasible&&containsPreviewUpper,handLedger=resolveHandLedger(state,squad,lineup),tierShort={rare:'희귀',special:'특별',uncommon:'안흔'};
    const card=x=>{const u=x.unit,status=String(x.item&&x.item.status||''),owned=C.num(state.counts[u.id])>0||status==='owned'||x.item&&x.item.owned,exact=status==='planned',roles=x.item&&((x.item.roles||x.item.roleLabel||x.item.reason)),roleText=Array.isArray(roles)?roles.join(' · '):roles||C.summarizeRoles({role:C.roleProfile(u)},plan.mode),weight=C.isUpper(u)?3:1,badge=owned?'보유':exact?'현재 제작':'미래 참고',usage=handLedger.byUnit.get(String(u.id)),usageParts=VISIBLE_HAND_TIER_META.map(meta=>C.num(usage&&usage.tiers[meta.key])>0?`${tierShort[meta.key]} ${C.num(usage.tiers[meta.key])}`:'').filter(Boolean);if(C.num(usage&&usage.wispSubstitute)>0)usageParts.push(`선위 ${C.num(usage.wispSubstitute)}`);const handLine=usageParts.length?`<small class="hand-source ${C.num(usage&&usage.conflict)>0?'conflict':''}">${exact||owned?'패 사용':'참고 배정'} · ${C.esc(usageParts.join(' · '))}${C.num(usage&&usage.conflict)>0?` · 부족 ${C.num(usage.conflict)}`:''}</small>`:'';return`<button class="squad-unit ${owned?'owned':exact?'planned':'future'}" data-act="detail" data-id="${C.esc(u.id)}"><i>${x.index+1}</i><img src="${C.esc(u.image||'')}" alt=""><span><b>${C.esc(displayNameOf(u))}</b><small>${C.esc(roleText||tierLabel(u))}</small>${handLine}</span><em>${badge} · 자원환산 ${weight}</em></button>`;},placeholders=Array.from({length:Math.max(0,targetBoard-lineup.length)},(_,i)=>`<div class="squad-unit placeholder"><i>${lineup.length+i+1}</i><span><b>보강 자리</b><small>현재 패·보상 결과로 결정</small></span><em>자원환산 1</em></div>`).join('');
    const criteriaRows=coverageRows.filter(row=>row.required||row.meta&&row.meta.recommended),criteriaHtml=criteriaRows.map(row=>{const current=C.num(row.current),target=C.num(row.target),capped=['slow','stunBase','stunFull'].includes(row.key),effective=capped?Math.min(current,target):current,ratio=Math.max(0,Math.min(100,effective/Math.max(.01,target)*100)),optional=!row.required,armorMeta=row.key==='armor'&&row.meta?`상시 ${fmt(row.meta.static)} · 발동 ${fmt(row.meta.trigger)} (기대 ${fmt(row.meta.expected)}, 최대 ${fmt(row.meta.maximum)}) · 필수 ${fmt(row.target)}${row.meta.ideal&&row.meta.ideal>row.target?` · 완성 보강 ${fmt(row.meta.ideal)}`:''}${row.meta.conditionalOnly?' · 발동 의존은 미충족':''}`:'',baseMeta=armorMeta||`${optional?'후순위 보강 · ':''}목표 ${fmt(row.target)}`,meta=capped&&current>target?`${baseMeta} · 원시 ${fmt(current)} (초과 미적용)`:baseMeta;return`<div class="criteria-row ${optional?'optional ':''}${row.gap<=0?'ok':'bad'}"><div><b>${C.esc(row.label)}</b><small>${C.esc(meta)}</small></div><span>${capped?'유효 ':''}${fmt(effective)} / ${fmt(target)}</span><i><em style="width:${ratio}%"></em></i></div>`;}).join(''),plannedSpec=coverage.spec||{},excessStun=Math.max(0,C.num(coverage.excessStun!=null?coverage.excessStun:C.num(plannedSpec.stun)-1.5)),slowCap=this.state.gorosei==='nasjuro'?117:102,slowRow=coverageRows.find(row=>row.key==='slow'),effectiveSlow=slowRow?C.num(slowRow.current):C.num(plannedSpec.slow)+C.num(plannedSpec.triggerSlow)*.5,excessSlow=Math.max(0,effectiveSlow-slowCap),priority=plan.mode==='physical'?`상시 풀방깎 = 최소 0.7스턴 → 안전 이감 ${slowCap} = 광보잡 → 추가 스턴 1.5`:squad.magicRoute==='dual'?`상위 2 = 최소 0.7스턴 → 이감 ${slowCap} 상한 → 광보잡 + 토키 → 스턴 1.5(마지막 필수)`:`광보잡 = 최소 0.7스턴 → 이감 ${slowCap} 상한 → 단일·끝딜 3~4기 → 스턴 1.5(마지막 필수)`;
    const decision=squad.decision||{},gates=decision.gates||{},decisionSpec=decision.spec||{},routeEvaluation=squad.routeEvaluation||{},finishEvaluation=routeEvaluation.finish||{},magicSteps=squad.magicRoute==='dual'?[`상위 ${fmt(decisionSpec.main)}/${fmt(gates.mainTarget||2)} = 최소 스턴 ${fmt(decisionSpec.stun)}/${fmt(gates.stunBaseTarget||.7)}`,`이감 ${fmt(decisionSpec.creditedSlow)}/${fmt(gates.slowTarget||slowCap)}`,`광보잡 ${fmt(decisionSpec.bossFrenzy)}/${fmt(gates.bossFrenzyTarget||1)} · 토키 ${fmt(decisionSpec.toki)}/${fmt(gates.tokiTarget||1)}`,`스턴 ${fmt(decisionSpec.stun)}/${fmt(gates.comfortStunTarget||1.5)} (마지막 필수)`]:[`광보잡 ${fmt(decisionSpec.bossFrenzy)}/${fmt(gates.bossFrenzyTarget||1)} = 최소 스턴 ${fmt(decisionSpec.stun)}/${fmt(gates.stunBaseTarget||.7)}`,`이감 ${fmt(decisionSpec.creditedSlow)}/${fmt(gates.slowTarget||slowCap)}`,`단끝 안정 ${fmt(finishEvaluation.stable)} · 일반 ${fmt(finishEvaluation.expected)} · 이론 ${fmt(finishEvaluation.maximum)}`,`스턴 ${fmt(decisionSpec.stun)}/${fmt(gates.comfortStunTarget||1.5)} (마지막 필수)`],decisionHtml=plan.mode==='physical'?`<div class="squad-decision"><header><b>프로그램 판단 순서</b><span>${C.esc(decision.reason||'클리어 하드 조건을 먼저 지키고 추가 스턴은 마지막에 비교합니다.')}</span></header><div><article class="${gates.primaryReady?'ok':'bad'}"><i>1순위</i><b>최소 스턴 ${fmt(decisionSpec.stun)} / ${fmt(gates.stunBaseTarget||.7)}</b><em>=</em><b>상시 방깎 ${fmt(decisionSpec.armor)} / ${fmt(gates.armorTarget||180)}</b></article><article class="${gates.secondaryReady?'ok':'bad'}"><i>2순위</i><b>안전 이감 ${fmt(decisionSpec.creditedSlow)} / ${fmt(gates.slowTarget||slowCap)}</b><em>=</em><b>광보잡 ${fmt(decisionSpec.bossFrenzy)} / ${fmt(gates.bossFrenzyTarget||1)}</b></article><article class="comfort ${C.num(gates.comfortStunGap)<=0?'ok':'hold'}"><i>3순위</i><b>충분한 스턴 ${fmt(decisionSpec.stun)} / ${fmt(gates.comfortStunTarget||1.5)}</b><span>${C.num(gates.comfortStunGap)>0?'상위 조건을 깨면서 억지로 채우지 않음':'안정선까지 충족'}</span></article></div></div>`:`<div class="squad-decision magic ${C.esc(routeEvaluation.status||'insufficient')}"><header><b>${C.esc(routeEvaluation.label||'마딜 경로 판정')}</b><span>${C.esc(routeEvaluation.note||decision.reason||'각 마딜 경로의 순서를 별도로 판정합니다.')}</span></header><div>${magicSteps.map((text,index)=>`<article class="${index===0?gates.primaryReady:index===1?gates.secondaryReady:index===2?C.num(gates.comfortStunGap)<=0:routeEvaluation.confirmable?'ok':'bad'}"><i>${index+1}순위</i><b>${C.esc(text)}</b></article>`).join('')}</div></div>`;
    const comparison=squad.routeComparison,comparisonHtml=comparison&&Array.isArray(comparison.routes)?`<div class="route-comparison"><div><b>마딜 두 경로 실제 비교</b><span>${C.esc(comparison.reason||'전설 환산 9기 충족도를 비교합니다.')}</span></div>${comparison.routes.map(item=>`<article class="${item.selected?'selected':''}"><small>${item.selected?'선택':'비교안'}</small><b>${C.esc(item.label)}</b><span>최종 충족도 ${fmt(item.plannedReadiness)}% · 환산 ${item.projectedCount}/${targetEquivalent}</span><em>${item.missing&&item.missing.length?C.esc(item.missing.join(' · ')):'필수 스펙 충족'}</em></article>`).join('')}</div>`:'';
    const concept=squad.upperConcept,conceptHtml=plan.mode==='physical'&&concept?`<div class="upper-concept"><div><small>상위 컨셉</small><b>${C.esc(concept.label||'물딜 상위')}</b></div><p>${C.esc(concept.summary||'풀방깎 이후 상위 컨셉 시너지를 보강합니다.')}</p>${(concept.needs||[]).map(need=>`<span>${C.esc(need.label)} ${fmt(need.target)}</span>`).join('')}</div>`:'';
    const overlap=squad.materialOverlap||{},tierSummaryHtml=VISIBLE_HAND_TIER_META.map(meta=>{const tier=handLedger.tiers[meta.key],used=C.num(tier.spent)+C.num(tier.reserved),tone=C.num(tier.conflict)>0?'conflict':tier.initial>0&&tier.remaining===0?'cleared':'safe',left=(tier.rows||[]).filter(row=>C.num(row.remaining)>0).map(row=>`${safeHandName(state,row.id,row.name,'재료')}${C.num(row.remaining)>1?`×${C.num(row.remaining)}`:''}`).join(' · ')||'없음';return`<article class="hand-tier-summary ${meta.key} ${tone}"><div><b>${meta.label}</b><em>${used}/${C.num(tier.initial)}장 즉시+참고</em></div><dl><div><dt>시작</dt><dd>${C.num(tier.initial)}</dd></div><div><dt>즉시 사용</dt><dd>−${C.num(tier.spent)}</dd></div><div><dt>미래 참고</dt><dd>−${C.num(tier.reserved)}</dd></div><div><dt>가상 잔여</dt><dd>${C.num(tier.remaining)}</dd></div></dl><small>참고안 잔여 ${C.esc(left)}${C.num(tier.conflict)>0?` · 패 충돌 ${C.num(tier.conflict)}`:''}</small></article>`;}).join('');
    const tierDetailHtml=VISIBLE_HAND_TIER_META.map(meta=>{const tier=handLedger.tiers[meta.key],rows=(tier.rows||[]).filter(row=>C.num(row.initial)+C.num(row.spent)+C.num(row.reserved)+C.num(row.conflict)+C.num(row.remaining)>0);const materialRows=rows.map(row=>{const destinations=(row.usedBy||[]).map(dest=>{const status=dest.status==='conflict'?'conflict':dest.status==='reserved'?'reserved':'spent',label=status==='conflict'?'부족':status==='reserved'?'참고':'즉시';return`<span class="${status}"><i>${label}</i>${C.esc(safeHandName(state,dest.id,dest.name,'최종 유닛'))}${C.num(dest.count)>1?` ×${C.num(dest.count)}`:''}</span>`;}).join(''),status=[C.num(row.spent)>0?`즉시 ${C.num(row.spent)}`:'',C.num(row.reserved)>0?`참고 ${C.num(row.reserved)}`:'',C.num(row.conflict)>0?`충돌 ${C.num(row.conflict)}`:'',`가상 잔여 ${C.num(row.remaining)}`].filter(Boolean).join(' · ');return`<div class="hand-material-row ${C.num(row.conflict)>0?'conflict':''}"><div><b>${C.esc(safeHandName(state,row.id,row.name,'재료'))} ×${C.num(row.initial)}</b><em>${C.esc(status)}</em></div><p>${destinations||`<span>${C.num(row.remaining)>0?'참고안에서 미사용 · 실제 제작 후 리롤 재판정':'사용처 계산 중'}</span>`}</p></div>`;}).join('');return`<article class="hand-tier-detail ${meta.key}"><header><b>${meta.label} 즉시·참고 사용처</b><span>시작 ${C.num(tier.initial)} → 참고안 잔여 ${C.num(tier.remaining)}</span></header><div>${materialRows||'<small>현재 보유 패 없음</small>'}</div></article>`;}).join('');
    const unitUsageHtml=[...handLedger.byUnit.values()].filter(entry=>VISIBLE_HAND_TIER_META.some(meta=>C.num(entry.tiers[meta.key])>0)||C.num(entry.wispSubstitute)>0).map(entry=>{const known=entry.id&&state.db.byId.get(entry.id),tierLines=VISIBLE_HAND_TIER_META.map(meta=>{const count=C.num(entry.tiers[meta.key]);if(!count)return'';const merged=new Map();for(const material of entry.materials[meta.key]||[]){const name=safeHandName(state,material.id,material.name,'재료'),key=`${name}|${material.status||'spent'}`,previous=merged.get(key)||{name,status:material.status||'spent',count:0};previous.count+=C.num(material.count);merged.set(key,previous);}const detail=[...merged.values()].map(material=>`${material.name}${material.count>1?`×${material.count}`:''}${material.status==='reserved'?'(미래 참고)':material.status==='conflict'?'(부족)':''}`).join(' · ');return`<span class="${meta.key}"><i>${meta.label} ${count}</i>${C.esc(detail||'배정')}</span>`;}).filter(Boolean).join(''),inner=`<b>${C.esc(safeHandName(state,entry.id,entry.name,'최종 유닛'))}</b><div>${tierLines}${C.num(entry.wispSubstitute)>0?`<span class="wisp"><i>선택위습 ${C.num(entry.wispSubstitute)}</i>최하위 재료 대체</span>`:''}</div>`;return known?`<button data-act="detail" data-id="${C.esc(entry.id)}">${inner}</button>`:`<article>${inner}</article>`;}).join('');
    const futureWorstCase=C.num(handLedger.wisp.futureWorstCase),worstCaseRequired=C.num(handLedger.wisp.spent)+futureWorstCase,handMapHtml=`<div class="hand-map"><div class="hand-map-head"><div><b>핵심 패 소비</b><span>희귀·특별·안흔함만 표시합니다. 즉시 사용과 미래 참고를 구분합니다.</span></div><em>재료 계통 충돌 ${C.num(overlap.lineagePairs)}</em></div><div class="hand-tier-summaries">${tierSummaryHtml}</div><div class="hand-unit-map"><header><b>유닛별 패 사용처</b><span>실전에서 확인할 핵심 등급만 표시</span></header><div>${unitUsageHtml||'<small>현재 패에서 바로 배정할 유닛이 없습니다.</small>'}</div></div>${tierDetailHtml?`<details class="hand-tier-ledger"><summary>등급별 상세 사용처</summary><div class="hand-tier-details">${tierDetailHtml}</div></details>`:''}<div class="hand-wisp ${C.num(handLedger.wisp.conflict)>0?'conflict':''}"><b>선택위습 · 현재 확정/미래 부족 분리</b><span>시작 ${C.num(handLedger.wisp.initial)}</span><i>→</i><span>지금 제작 −${C.num(handLedger.wisp.spent)}</span><i>→</i><strong>실제 잔여 ${Math.max(0,C.num(handLedger.wisp.initial)-C.num(handLedger.wisp.spent))}</strong><i>·</i><span>미래 참고 요구 ${futureWorstCase}</span>${worstCaseRequired>C.num(handLedger.wisp.initial)?`<em>전체 참고안은 총 ${worstCaseRequired}개 필요 · ${Math.max(0,worstCaseRequired-C.num(handLedger.wisp.initial))}개 부족</em>`:''}${C.num(handLedger.wisp.conflict)>0?`<em>현재 자원으로 9기 제작 불가</em>`:''}</div></div>`;
    const bottlenecks=Array.isArray(squad.bottlenecks)?squad.bottlenecks:Object.entries(squad.bottlenecks||{}).map(([name,value])=>({name,value})),bottleneckHtml=bottlenecks.slice(0,8).map(item=>{const u=unitOf(item),name=item.name||item.materialName||(u?displayNameOf(u):item.id)||'',gap=C.num(item.gap||item.missing||item.substituted||item.need),alt=Array.isArray(item.alternative)&&item.alternative.length?` · 대안 ${item.alternative.join('→')}`:'',reason=`${item.why||item.reason||item.note||item.value||'같은 재료를 덜 쓰는 대안을 우선 탐색합니다.'}${alt}`;return`<div class="${/우솝/.test(name)?'usopp':''}"><b>${C.esc(name||'재료 병목')}${gap?` ${gap}개 부족`:''}</b><span>${C.esc(String(reason))}</span></div>`;}).join(''),deficits=coverageRows.filter(row=>row.required&&row.gap>0),deficitHtml=deficits.slice(0,8).map(x=>`<span>${C.esc(x.label||x.key||'보강')} +${fmt(x.gap)}</span>`).join(''),plannedActions=Array.isArray(squad.actions)?squad.actions:[],actionHtml=plannedActions.slice(0,9).map((item,i)=>{const u=unitOf(item);return u?`<button data-act="detail" data-id="${C.esc(u.id)}"><i>${i+1}</i>${C.esc(displayNameOf(u))}<small>${C.esc(item.reason||item.explanation||'앞 순서 재료 차감 후 제작')}</small></button>`:'';}).join('');
    const patchOptions=Array.isArray(squad.finalPatchOptions)?squad.finalPatchOptions:[],patchHtml=this.actualRound()>50&&patchOptions.length?`<div class="final-patch"><b>50라 이후 마지막 수단 비교</b><div>${patchOptions.map(item=>{const names=(item.names||[item.name]).filter(Boolean).join(' + ')||'후보 없음',tone=item.status==='ready'?'ready':item.status==='none'?'none':'future',label=item.status==='ready'?'현재 가능':item.status==='locked'?`${item.availableRound}라 이후`:'후속 재료';return`<article class="${tone}"><small>${C.esc(item.label||item.kind)}</small><b>${C.esc(names)}</b><span>${C.esc(item.reason||'남은 결손을 비교합니다.')}</span><em>${C.esc(label)}${item.wispCost!=null?` · 선위 ${C.num(item.wispCost)}`:''}</em>${item.id?`<button data-act="detail" data-id="${C.esc(item.id)}">재료 보기</button>`:''}</article>`;}).join('')}</div></div>`:'';
    const wispBudget=squad.wispBudget||{},futurePendingCount=Array.isArray(squad.handFit&&squad.handFit.futurePending)?squad.handFit.futurePending.length:0,confirmationReason=plannedBoard<targetBoard||plannedEquivalent<targetEquivalent?'환산 자리 부족':!plannedReady?'필수 역할 부족':!routeConfirmable?(squad.routeEvaluation&&squad.routeEvaluation.label||'마딜 경로 판정 부족'):!handFeasible?'현재 패로 자원 보존 불가':!wispFeasible?`보장 선택위습 부족 (${C.num(wispBudget.required)}/${C.num(wispBudget.available)})`:futurePendingCount>0?'미래 랜덤 재료 의존 · 확정 금지':'현재 패 전체 제작 검증',blueprintState=squad.blueprint||{},blueprintTone=previewId?'preview':blueprintState.status==='adapted'?'adapted':blueprintState.status==='invalid'?'invalid':'kept',blueprintText=previewId?(exactConfirmable?`현재 TMO 패만으로 전체 제작 순서와 누적 선택위습을 검증했습니다. 역할표 충족은 보스 화력 보장이 아닙니다.`:`이 9기 목록은 미래 역할 참고안입니다. 현재 부족 재료 ${futurePendingCount}건과 선택위습 ${C.num(wispBudget.shortage)}개를 미래 드랍이 메운다고 가정하지 않으므로 파티 확정이 금지됩니다.`):blueprintState.status==='adapted'?`확정 파티 일부가 현재 패로 불가능해 실제 제작 가능한 다음 행동만 다시 계산합니다.`:blueprintState.status==='invalid'?`확정 파티를 현재 패로 증명할 수 없습니다. ${blueprintState.reason||''}`:blueprintState.active?'확정 파티를 현재 재고로 매번 재검증합니다.':'현재 패로 증명되는 다음 행동만 사용합니다.',safePrefix=squad.safePrefix||{},prefixActions=safePrefix.actions||[],prefixHasUpper=previewId&&prefixActions.some(action=>C.canonicalUpperId(action.id)===C.canonicalUpperId(previewId)),previewDirectionKey=this.state.directionKey||(plan.mode==='physical'?'physical':squad.magicRoute||'singleEnd'),previewButton=previewId?exactConfirmable?`<button class="primary" data-act="confirm-upper" data-id="${C.esc(previewId)}">현재 패 전체 검증 · 확정</button>`:prefixHasUpper?`<button class="primary" data-act="choose-direction" data-key="${C.esc(previewDirectionKey)}" data-id="${C.esc(previewId)}">9기는 미확정 · 상위 경로만 선택</button>`:`<button class="primary" disabled aria-disabled="true" title="${C.esc(confirmationReason)}">현재 패로 상위도 제작 불가</button>`:'',blueprintHtml=`<div class="blueprint-banner ${blueprintTone}"><div><b>${previewId?'미래 역할 참고안':'확정 파티 재검증'}</b><span>${C.esc(blueprintText)}</span></div>${previewButton}</div>`,controlCaps=[excessStun>.005?`스턴 +${fmt(excessStun)} 초과 · 추가 스턴 가점 0`:'스턴 1.5는 후순위 보강',excessSlow>.005?`이감 +${fmt(excessSlow)} 초과분 가점 0`:`이감은 ${slowCap}까지만 반영`].join(' · '),prefixHtml=`<div class="safe-prefix ${prefixActions.length?'ready':'blocked'} ${safePrefix.checkpointPass?'checkpoint-pass':'checkpoint-miss'}"><header><div><small>현재 TMO 패만 사용</small><b>${prefixActions.length?'지금 확정 가능한 제작 순서':'지금 확정 가능한 제작 없음'}</b></div><em>${C.esc((safePrefix.checkpoint&&safePrefix.checkpoint.dueRound||30)+'라까지 매 패 변경 후 재계산')}</em></header><div>${prefixActions.map((action,index)=>`<button data-act="detail" data-id="${C.esc(action.id)}"><i>${index+1}</i><b>${C.esc(action.name)}</b><span>선위 ${C.num(action.wispCost)} · 후 ${C.num(action.remainingWisp)}</span><small>${C.esc(action.reason||'현재 재고 순차 검증')}</small></button>`).join('')||`<p>${C.esc((safePrefix.blockers||[]).join(' · ')||safePrefix.note||'패가 바뀌면 다시 계산합니다.')}</p>`}</div><footer>${safePrefix.checkpointPass?'현재 체크포인트까지 이 순서를 제작할 수 있습니다.':'제작 자체는 가능하지만 다음 체크포인트를 아직 못 닫습니다.'} 아래 9기 목록은 보스 화력과 미래 재료가 검증되지 않은 참고안입니다.</footer></div>`;
    return`<section class="ord-panel squad-panel ${exactConfirmable?'complete':'building'}"><div class="panel-head"><div><small>${previewId?'선택 상위 검토':'확정 상위 기반'} · 현재 제작과 미래 참고 분리</small><h2>현재 확정 ${prefixActions.length}기 · 미래 역할 참고 ${plannedEquivalent}/${targetEquivalent}환산</h2><p>${C.esc(route)} · 현재 TMO 패로 증명된 행동만 위에 표시합니다. 상위 3기분은 재료 환산이며 화력 3배가 아닙니다.</p></div><span class="count-pill">${C.esc(confirmationReason)}</span></div>${prefixHtml}${blueprintHtml}${comparisonHtml}${conceptHtml}${decisionHtml}<div class="squad-criteria"><div class="criteria-head"><div><b>미래 참고안의 역할표</b><span>${C.esc(priority)}</span></div><em class="${excessStun>.005||excessSlow>.005?'':'ok'}">${C.esc(controlCaps)}</em></div><div>${criteriaHtml||'<small>역할표 계산 중</small>'}</div></div><div class="squad-grid">${lineup.map(card).join('')}${placeholders}</div>${handMapHtml}${actionHtml?`<div class="squad-order"><b>현재 패에서 이미 증명된 제작 순서</b>${actionHtml}</div>`:''}${patchHtml}<div class="squad-analysis compact"><div><h3>재료 병목·대체안</h3><div class="bottleneck-list">${bottleneckHtml||'<small>현재 확정 행동의 치명적 병목 없음</small>'}</div></div><div><h3>미래 역할표 결손</h3><div class="deficit-chips">${deficitHtml||'<span class="ok">역할 합계만 충족 · 보스 화력 미검증</span>'}</div></div></div></section>`;
  }
  clearVerdict(plan){
    const def=plan.deficits||{},ctl=def.control||{},resolved=plan.resolvedMagicRoute||plan.squadPlan&&plan.squadPlan.magicRoute||def.route||this.state.magicRoute,timeline=plan.squadPlan&&plan.squadPlan.timelineReadiness;
    if(timeline){const round=C.num(timeline.round),checkpoint=timeline.currentCheckpoint||{},boss=timeline.boss50||{},labels=[...(checkpoint.blockers||[])],rareReady=!!(timeline.rare&&timeline.rare.pass),actual=timeline.actual||{},craftable=timeline.craftableNow||{},pending=!!normalizeTransaction(this.state.pendingTransaction);let status='danger',label,note,specReady=false;
      if(pending){label='TMO 제작 반영 확인 중';note='임시 제작값은 현재 전력으로 통과시키지 않습니다. TMO에서 완성 유닛이 확인되면 다시 판정합니다.';labels.unshift('TMO 실제 완성 확인');}
      else if(round>=50&&boss.status==='unverified'){status='edge';label='50라 보수적 구조 기준 충족 · 보스 화력 미검증';note='실제 완성 전력으로 9환산·경로 핵심·1.5스턴·이감·잔여 희귀 0을 맞췄습니다. 다만 50라 보스 DPS 실측표가 없어 클리어 확정으로 표시하지 않습니다.';specReady=true;}
      else if(round>=50&&boss.status==='recoverable'){label='지금 제작 안 하면 50라 위험';note=`현재 ${C.num(actual.legendEquivalent)}환산입니다. 위 제작 순서를 끝내면 ${C.num(craftable.legendEquivalent)}환산이지만, 제작 전 상태는 보스 판정을 통과하지 않습니다.`;}
      else if(round>=50){label='50라 보스 진입 조건 미달';note=`현재 완성 ${C.num(actual.legendEquivalent)}환산만 계산했습니다. ${labels.join(' · ')||'보스 핵심 역할'}을 즉시 보강해야 합니다.`;}
      else if(checkpoint.pass){status='edge';label=`${C.num(checkpoint.dueRound)}라 구조 기준 충족`;note=`TMO 실보유 ${C.num(actual.legendEquivalent)}환산 기준입니다. 클리어 확률이나 보스 화력 통과를 뜻하지 않으므로 다음 체크포인트까지 제작을 계속하세요.`;specReady=true;}
      else if(checkpoint.craftablePass){label=`${C.num(checkpoint.dueRound)}라 체크 · 즉시 제작 필요`;note=`청사진이 아니라 위 제작 ${C.num(craftable.addedBoard)}기를 실제로 완성해야 통과합니다. 현재 ${C.num(actual.legendEquivalent)} → 제작 후 ${C.num(craftable.legendEquivalent)}환산입니다.`;}
      else{label=`${C.num(checkpoint.dueRound)}라 체크 위험`;note=`현재 완성 ${C.num(actual.legendEquivalent)}환산입니다. ${labels.join(' · ')||checkpoint.extra||'실제 전력'}을 먼저 채우세요.`;}
      return{status,label,note,labels,specReady,rareReady,resolvedRoute:resolved,timeline:true,bossVerified:!!boss.verified};
    }
    const clearRows=def.clearRows||def.rows||[],labels=[];for(const row of clearRows){const label=row.key==='control'?'제어력':row.label;if(label&&!labels.includes(label))labels.push(label);}const pressure=plan.rarePressure||{},specReady=labels.length===0,rareReady=!pressure.shouldSpend,status=specReady?'edge':'danger',label=specReady?'청사진 역할 충족 · 현재 전력 미검증':`역할표 ${labels.length}개 부족`,route=plan.mode==='physical'?'상위 1·상시 방깎 180·최소 스턴 0.7·안전 이감 102·광보잡':resolved==='dual'?'상위 2·토키·광보잡·스턴 1.5·이감 102':'상위 1·단/끝 3~4기·광보잡·스턴 1.5·이감 102',note=specReady?`${route} 청사진 역할은 맞지만 실제 완성 전력과 50라 보스 화력은 별도 확인이 필요합니다.`:`${labels.join(' · ')}을 우선순위대로 보강해야 합니다.`;return{status,label,note,labels,specReady,rareReady,resolvedRoute:resolved};
  }

  renderTimelineReadiness(plan){
    const timeline=plan.squadPlan&&plan.squadPlan.timelineReadiness;if(!timeline)return'';const actual=timeline.actual||{},boss=timeline.boss50||{},current=timeline.currentCheckpoint||{},due=C.num(current.dueRound)||50,required=C.num(current.requiredEquivalent),tone=boss.status==='unverified'?'unverified':current.pass?'passed':current.craftablePass?'recoverable':'blocked',statusText=boss.status==='unverified'?'보수적 구조 기준 충족 · DPS 미검증':current.pass?'현재 마감 충족':current.craftablePass?'바로 제작하면 마감 회복 가능':'현재 마감 미달',checkpointCards=(timeline.checkpoints||[]).map(row=>`<div class="${C.esc(row.status)}"><b>${row.dueRound}라</b><span>${row.pass?'충족':row.craftablePass?'제작 후 충족':row.status==='pending'?'예정':'미달'}</span><small>${C.esc(row.extra||'')}</small></div>`).join(''),blockerRows=(boss.status==='unverified'?[boss.evidence]:(current.blockers||[])).slice(0,5),blockers=blockerRows.map(text=>`<span>${C.esc(text)}</span>`).join(''),instruction=boss.status==='unverified'?'구조 기준일 뿐 보스 화력은 별도 확인해야 합니다.':current.pass?'다음 마감까지 바로 제작 순서를 계속하세요.':current.craftablePass?'아래 1~2기를 실제 제작하고 TMO 확인을 누르세요.':'미래 목표 조합보다 아래 결손과 바로 제작을 먼저 처리하세요.';
    return`<section class="ord-panel survival-timeline compact ${tone}" data-coach-core="deadline"><div class="panel-head"><div><small>현재 활성 마감 · TMO 실보유만 판정</small><h2>${due}라 · ${C.esc(statusText)}</h2><p>${C.esc(current.extra||'현재 완성 전력 확인')}</p></div><span class="count-pill">${due}라 활성 마감</span></div><div class="timeline-now"><div class="timeline-actual"><small>현재 실보유</small><b>${C.num(actual.legendEquivalent)}${required?` / ${required}`:''}환산</b><span>보드 ${C.num(actual.boardCount)}기</span></div><div class="timeline-blockers"><b>${boss.status==='unverified'?'남은 불확실성':'지금 막는 항목'}</b>${blockers||'<span class="ok">표시할 결손 없음</span>'}</div></div><div class="timeline-instruction ${tone}">${C.esc(instruction)}</div><details class="checkpoint-details"><summary>전체 라운드 마감 보기</summary><div class="checkpoint-strip">${checkpointCards}</div></details></section>`;
  }
  controlReadout(ctl){
    ctl=ctl||{};const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback,stable=number(ctl.stableSlow,number(ctl.slow,0)),staticSlow=number(ctl.staticSlow,stable),triggerSlow=number(ctl.triggerSlow,0),expected=number(ctl.expectedSlow,number(ctl.conditionalSlow,stable)),max=number(ctl.maxSlow,staticSlow+triggerSlow),capture=number(ctl.captureRate,stunCaptureRate(ctl.stun));return{stable,staticSlow,triggerSlow,expected,max,capture};
  }
  controlCriteria(ctl){
    ctl=ctl||{};const finite=value=>Number.isFinite(Number(value)),mode=ctl.profileMode==='magic'?'마딜':ctl.profileMode==='physical'?'물딜':'현재 계통';if(!finite(ctl.targetSlow))return`${mode} 제어 기준을 계산 중입니다.`;if(ctl.profileMode==='physical')return`물딜 기준: 이감 ${fmt(ctl.targetSlow)} + 최소 유효 스턴 0.7(그 밑은 스턴이 안 잡히는 실측 최소선). 상시 풀방깎·광보잡과 함께 먼저 고정하고, 스턴 1.5는 마지막 안정 보강입니다.`;return`${mode} 기준: 이감 ${fmt(ctl.targetSlow)} + 유효 스턴 ${fmtStun(ctl.stableStun||1.5)}. 최소 0.7스턴과 풀이감을 먼저 확보한 뒤 충분한 스턴을 맞춥니다.`;
  }
  controlChoice(ctl){
    ctl=ctl||{};if(ctl.status==='safe'||ctl.status==='edge')return ctl.note||ctl.label;const choices=(ctl.alternatives||[]).map(x=>`${x.key==='slow'?'이감':'유효 스턴'} +${x.key==='stun'?fmtStun(x.gap):fmt(x.gap)} (총 ${x.key==='stun'?fmtStun(x.target):fmt(x.target)})`);return choices.length?`위험권 · ${choices.join(' → ')}`:ctl.note||'위험권 · 이감과 필수 딜 역할을 먼저 보강하세요.';
  }
  quickSpec(plan){
    return(plan.deficits.requirements||[]).filter(x=>x.required&&!['control','stun','slow'].includes(x.key)).map(x=>`<span class="${x.gap<=0?'ok':x.status||'bad'}">${C.esc(x.label)} ${fmt(x.current)}/${fmt(x.target)}</span>`).join('');
  }
  renderDecision(plan,phase){
    const next=plan.actions[0],prepare=(plan.watch||[])[0],pressure=plan.rarePressure||{},inventory=plan.rareInventory||{},spend=plan.rareSpend||{},nextRare=next&&next.rareSpend?next.rareSpend.total:next&&next.rareUse||0,verdict=this.clearVerdict(plan),title=plan.completionForced&&next?`1순위 → ${displayNameOf(next.unit)} ${next.feasible?'제작':'재료 준비'}`:plan.upperBlueprintRanked&&next?`선위 최소 · 희귀 ${next.blueprintRareUsed}/${next.blueprintRareTotal}장 → ${displayNameOf(next.unit)} 미리보기`:pressure.shouldSpend&&next&&nextRare?`희귀 ${nextRare}장 소진 → ${displayNameOf(next.unit)} 제작`:next?`${displayNameOf(next.unit)} ${next.solve.wispCost?`제작 · 선위 ${next.solve.wispCost}`:'즉시 조합'}`:verdict.specReady?'클리어 역할 완성 · 운영과 강화에 집중':prepare?`${displayNameOf(prepare.unit)} 재료를 보호하세요`:'현재 패를 더 모으세요',rareAfter=Number.isFinite(Number(spend.after))?spend.after:inventory.total||0,phaseNote=plan.completionForced?'전략 점수보다 TMO 사이트 완성도를 먼저 적용합니다. 동률일 때 필요한 선택위습이 적은 순서로 정렬합니다.':plan.upperBlueprintRanked?'각 상위의 전설 환산 9기 클리어안을 먼저 만든 뒤 선택위습 총량과 전체 패 소진을 비교했습니다.':pressure.shouldSpend?'확정 경로 재료는 보호하고 남는 희귀를 안전하게 소모하는 수를 골랐습니다.':phase.note,nextWisp=next&&next.solve?C.num(next.solve.wispCost):0;
    return`<section class="decision-strip"><div><small>${this.actualRound()}라 · ${C.esc(phase.label)}</small><h2>${C.esc(title)}</h2><p>${C.esc(phaseNote)}</p></div><div class="decision-strip-stats"><span><small>계통</small><b>${plan.compareBoth?'물/마 비교':modeLabel(plan.mode)}</b></span><span><small>희귀 패</small><b>${inventory.total||0} → ${rareAfter}장</b></span><span><small>다음 선위</small><b>${next?nextWisp:'—'}</b></span></div></section>`;
  }
  actionTitle(plan){return plan.purpose==='rare'?'부족 재료가 가장 적은 첫 희귀':plan.purpose==='story'?(plan.postLegendDecision&&plan.postLegendDecision.route==='legend'?'부족 재료가 적은 순 · 추가 전설·히든':'부족 재료가 적은 순 · 첫 전설·히든'):plan.purpose==='upper'?'전체 패 적합도 기준 상위 후보':plan.rarePressure&&plan.rarePressure.shouldSpend?'희귀 패를 줄이며 부족 역할을 채우는 순서':'재료가 겹치지 않는 제작 순서';}
  wispDisplay(state,row){
    const planned=C.num(row&&row.solve&&row.solve.wispCost),current=row&&row.currentSolve?C.num(row.currentSolve.wispCost):row&&row.unit?C.num(C.recipeSolve(state.db,row.unit.id,state.counts).wispCost):planned,available=Number.isFinite(Number(row&&row.availableWisp))?C.num(row.availableWisp):C.num(state.wisp),basis=row&&row.wispBreakdown&&row.wispBreakdown.basis||'current',basisLabel=basis==='sequential'?'앞 제작 차감 후':basis==='protected'?'확정 경로 보호 후':'현재 패 기준';return{planned,current,available,after:Math.max(0,available-planned),gap:Math.max(0,planned-available),basis,basisLabel,different:planned!==current};
  }
  renderActions(state,plan){
    const actions=plan.actions||[],immediate=actions.slice(0,2),pressure=plan.rarePressure||{},spend=plan.rareSpend||{},extraLegend=plan.postLegendDecision&&plan.postLegendDecision.route==='legend',sub=extraLegend?'현재 부족 재료가 적은 순서입니다. 한 기를 완성하면 추가 제작과 상위 준비 중 다시 선택합니다.':plan.completionForced?'현재 TMO 패의 완성도 내림차순입니다. 100%가 아니면 1순위 유닛의 부족 재료를 먼저 준비하세요.':plan.upperBlueprintRanked?'현재 패로 먼저 증명된 1~2기만 표시합니다. 미래 목표 조합은 아래 상세 보기에서 확인하세요.':pressure.shouldSpend?'확정 경로 희귀는 보호하고, 역할을 잃지 않으면서 남는 희귀를 많이 소모하는 조합부터 순차 계산했습니다.':plan.selectionMode==='queue'?'위에서부터 실제 제작하고 TMO 확인을 누르세요. 확인 뒤 다음 1~2기를 다시 계산합니다.':'지금 실제로 결정할 1~2기만 표시합니다. 후속 제작과 대비 후보는 상세 보기에 있습니다.',empty=!plan.deficits.rows.length&&!pressure.shouldSpend?'핵심 클리어 스펙을 충족했습니다. 불필요한 추가 조합보다 운영·강화에 집중하세요.':pressure.shouldSpend?'희귀를 안전하게 소진할 즉시 조합이 없습니다. 상세 보기의 후보 재료를 준비하고 패 칸을 확보하세요.':plan.purpose==='upper'?'현재 전체 패로 전설 환산 9기를 설계할 상위 후보가 없습니다. TMO 패와 특수재료를 다시 확인하세요.':plan.reserved.reservedWispCost?'확정 경로에 재료와 선위를 예약해 즉시 가능한 후보가 없습니다.':'현재 조건에서 즉시 만들 수 있는 후보가 없습니다.',rareBadge=spend.plannedSpend?` · 희귀 -${spend.plannedSpend}`:'',actionLabel=plan.completionForced||extraLegend?'완성도 순위':plan.upperBlueprintRanked?'현재 패 순위':'바로 제작';
    return`<section class="ord-panel action-panel" data-coach-core="actions"><div class="panel-head"><div><small>바로 제작 · 최대 2기</small><h2>${this.actionTitle(plan)}</h2><p>${sub}</p></div><span class="count-pill">${actionLabel} ${immediate.length}${rareBadge}</span></div>${immediate.length?`<div class="action-list">${immediate.map((x,i)=>this.renderActionRow(state,plan,x,i)).join('')}</div>`:`<div class="empty">${C.esc(empty)}</div>`}</section>`;
  }
  renderActionRow(state,plan,row,index){
    const u=row.unit,status=C.statusForRow(row),roles=C.summarizeRoles(row,plan.compareBoth&&row.family!=='neutral'?row.family:plan.mode),rare=row.rareSpend||{total:row.rareUse||0,clears:0},why=row.why||{},changes=(row.impact&&row.impact.improved||[]).slice(0,4),tradeoffs=(row.impact&&row.impact.regressed||[]).slice(0,2),changeLine=changes.map(x=>`${x.label} ${fmt(x.before)}→${fmt(x.after)}`).join(' · '),tradeLine=tradeoffs.map(x=>`${x.label} ${fmt(x.before)}→${fmt(x.after)}`).join(' · '),alternative=why.alternative?`더 싼 대안 ${displayNameOf(why.alternative.unit)} · 선위 ${why.alternative.wispCost}`:'';
    const wisp=this.wispDisplay(state,row),audit=plan.globalSquadQueue&&plan.squadPlan&&plan.squadPlan.safePrefix&&plan.squadPlan.safePrefix.audit||{},strategicBlocked=['stop','hold'].includes(audit.level),proofLabel=plan.globalSquadQueue?(audit.checkpointPassAfter?'체크포인트 회복 순서':'재료 가능 · 체크 미달'):'재료 가능',made=row.feasible!==true?'<button disabled title="현재 TMO 패로는 아직 완성할 수 없습니다">재료 준비 중</button>':strategicBlocked?'<button disabled title="재료는 가능하지만 활성 체크포인트를 개선하지 못합니다">전략 안전성 미달</button>':plan.selectionMode==='queue'&&index>0?'<button disabled title="위 행동부터 완료하면 자동으로 다음 순서가 됩니다">위 순서 후</button>':`<button class="primary" data-act="mark-made" data-step="${index}" data-id="${u.id}">제작함 · TMO 확인</button>`,upperLocked=this.upperLock()&&(C.canonicalUpperId(this.upperLock().id)===C.canonicalUpperId(u.id));
    const rareChip=rare.total?`<strong class="rare-spend">희귀 -${rare.total}${rare.clears?` · ${rare.clears}종 비움`:''}${Number.isFinite(Number(row.rareAfter))?` · 후 ${row.rareAfter}장`:''}</strong>`:plan.rarePressure&&plan.rarePressure.shouldSpend?'<strong class="rare-spend zero">역할 우선 · 희귀 소진 0</strong>':'',upperPlanChip=row.upperBlueprint?`<strong class="upper-plan-chip ${row.blueprintClearComplete?'complete':'building'}">전체 패 ${C.esc(row.blueprintHandSummary||`희귀 ${row.blueprintRareUsed}/${row.blueprintRareTotal}`)} · 역할 ${row.blueprintReadiness}%${row.blueprintRareConflict?` · 충돌 ${row.blueprintRareConflict}`:''}</strong>`:'',virtualSpecialId=String(this.state.virtualSpecialId||''),virtualSpecial=virtualSpecialId&&state.db.byId.get(virtualSpecialId),usesVirtual=virtualSpecial&&C.num(row.solve&&row.solve.consumed&&row.solve.consumed[virtualSpecialId])>0,virtualSpecialChip=usesVirtual?`<strong class="virtual-special-chip">152킬 ${C.esc(displayNameOf(virtualSpecial))} 사용</strong>`:'';
    return`<article class="action-row ${index===0?'featured':''}"><div class="rank">${index+1}</div><img src="${C.esc(u.image||'')}" alt="${C.esc(displayNameOf(u))}"><div class="action-main"><div class="unit-title"><b>${C.esc(displayNameOf(u))}</b><span>${C.esc(tierLabel(u))}</span>${storyBadge(u,row.story)}<em class="proof-chip">${C.esc(proofLabel)}</em></div><div class="role-tags"><span>${C.esc(roles)}</span>${upperPlanChip}${rareChip}${virtualSpecialChip}${row.pairSynergy?`<strong class="pair-chip">${C.esc(row.pairSynergy.label)}</strong>`:''}${(row.commonTop||[]).map(x=>`<i title="부족 ${C.esc(x.name)} ${x.count}" style="--pc:${x.color}">${C.esc(x.name)} ${x.count}</i>`).join('')}</div><p class="why-head ${why.highCost?'high-cost':''}">${C.esc(row.upperBlueprint?row.watchReason:why.headline||'현재 패의 순증 스펙을 기준으로 추천합니다.')}</p>${changeLine?`<div class="impact-line"><b>제작 순증</b><span>${C.esc(changeLine)}</span></div>`:''}${tradeLine||alternative?`<div class="trade-line">${tradeLine?`<span>손실 ${C.esc(tradeLine)}</span>`:''}${alternative?`<span>${C.esc(alternative)}</span>`:''}</div>`:''}${this.renderCommandLine(u)}</div><div class="action-cost"><b>${wisp.planned}</b><small>${C.esc(wisp.basisLabel)} · 후 ${wisp.after}</small>${wisp.different?`<em>현재 패 단독 ${wisp.current}</em>`:''}<span class="${statusTone(status.key)}">${C.esc(status.label)}</span></div><div class="action-buttons"><button data-act="detail" data-id="${u.id}">이유·재료</button>${C.isUpper(u)?upperLocked?made:`<button data-act="select-upper" data-id="${u.id}">미리보기</button><button class="primary" data-act="confirm-upper" data-id="${u.id}">상위 확정</button>`:`${plan.purpose==='rare'?`<button data-act="lock-rare" data-id="${u.id}">희귀 예약</button>`:''}${plan.purpose==='story'?`<button data-act="lock-legend" data-id="${u.id}">경로 예약</button>`:''}${made}`}</div></article>`;
  }
  renderWatchRow(state,plan,row,index){
    const u=row.unit,roles=C.summarizeRoles(row,plan.compareBoth&&row.family!=='neutral'?row.family:plan.mode),commons=(row.commonTop||[]).slice(0,3),specials=(row.solve.hardMissing||[]).slice(0,2),materials=commons.map(x=>`<span style="--pc:${x.color}">${C.esc(x.name)} ×${x.count}</span>`).concat(specials.map(x=>`<span class="special">${C.esc(x.name)} ×${x.count}</span>`)),direct=(row.solve.direct||[]).filter(x=>x.owned<x.count).slice(0,5),catalogById=new Map((this.catalog||[]).map(x=>[x.id,x])),why=row.why&&row.why.headline;
    const directHtml=direct.length?`<div class="watch-direct"><b>직접 재료</b>${direct.map(x=>{const material=catalogById.get(x.id),name=C.SPECIAL_IDS[x.id]||(material?displayNameOf(material):'특수재료');return`<span>${C.esc(name)} <i>${x.owned}/${x.count}</i></span>`;}).join('')}</div>`:'';
    const upperPlanChip=row.upperBlueprint?`<strong class="upper-plan-chip ${row.blueprintClearComplete?'complete':'building'}">전체 패 ${C.esc(row.blueprintHandSummary||`희귀 ${row.blueprintRareUsed}/${row.blueprintRareTotal}`)} · 역할 ${row.blueprintReadiness}%${row.blueprintRareConflict?` · 충돌 ${row.blueprintRareConflict}`:''}</strong>`:'',wisp=this.wispDisplay(state,row);
    return`<article class="watch-row"><img src="${C.esc(u.image||'')}" alt="${C.esc(displayNameOf(u))}"><div class="watch-main"><div class="unit-title"><b><i>대비 ${index+1}</i>${C.esc(displayNameOf(u))}</b><span>${C.esc(tierLabel(u))}</span>${storyBadge(u,row.story)}${upperPlanChip}</div><p class="watch-reason ${C.esc(row.watchKind||'alternative')}">${C.esc(row.watchReason||'다음 순위 후보')}</p>${why&&why!==row.watchReason?`<p class="watch-why">${C.esc(why)}</p>`:''}<div class="watch-materials"><span class="role">${C.esc(roles)}</span>${materials.join('')||'<span class="ready">최하위·특수재료 충족</span>'}</div>${directHtml}${this.renderCommandLine(u)}</div><div class="watch-actions"><div class="watch-cost"><b>${wisp.planned}</b><small>${C.esc(wisp.basisLabel)}</small>${wisp.different?`<em>단독 ${wisp.current}</em>`:''}</div><button data-act="detail" data-id="${u.id}">전체 재료</button>${C.isUpper(u)?`<button data-act="select-upper" data-id="${u.id}">미리보기</button><button class="primary" data-act="confirm-upper" data-id="${u.id}">상위 확정</button>`:''}</div></article>`;
  }
  renderRouteStatus(plan){return`<section class="ord-panel upper-focus empty-upper"><small>메인 상위</small><h2>아직 미확정</h2><p>25라운드 패 전체에서 상위 1기를 3기분으로 계산해 실제 보드와 전설 환산 9기를 함께 비교합니다. 첫 전설을 상위가 먹지 않으면 그 유닛의 계통도 물딜·마딜 결정 근거가 됩니다.</p></section>`;}
  renderUpperProfile(state,plan,p){
    const u=p.upper,r=p.role,facts=p.facts||{always:[],trigger:[],research:[],researchVariants:[],penalties:[],mechanics:[]},strategy=p.strategy||{},owned=C.num(state.counts[u.id])>0,upperLock=this.upperLock(),locked=upperLock&&(upperLock.id===u.id||upperLock.activeVariantId===u.id),status=owned&&locked?'TMO 보유 · 고정':owned?'TMO 보유':locked&&upperLock.source==='tmo'?'TMO 일시 누락 · 고정 유지':locked?'확정 · 제작 전':'미리보기',fact=(x,trigger)=>`<span class="${trigger?'trigger':'always'}"><i>${trigger?'발동':'상시'}</i>${C.esc(x.label)} <b>${x.key==='stun'?fmtStun(x.value):fmt(x.value)}</b></span>`,research=x=>`<span class="research"><i>표</i>${C.esc(x.label)} <b>${fmtStun(x.value)} · ${fmt(x.capture)}%</b></span>`,penalty=x=>`<span class="penalty"><i>페널티</i>${C.esc(x.label)} <b>${fmt(x.value)}</b></span>`,mechanic=x=>`<span class="mechanic">${C.esc(x.label)}</span>`,partners=this.renderSupportRanking(p,'profile'),later=p.later.slice(0,4).map(x=>`<button class="later" data-act="detail" data-id="${x.unit.id}"><b>${C.esc(displayNameOf(x.unit))}</b>${storyBadge(x.unit,x.story)}<small>${C.esc(x.why&&x.why.headline||x.blocked&&x.blocked[0]||'대비 후보')}</small><em>선위 ${x.solve.wispCost}</em></button>`).join(''),conditions=(strategy.conditions||[]).map(x=>`<span>${C.esc(x)}</span>`).join(''),researchVariants=(facts.researchVariants||[]).map(x=>`<span class="research condition ${x.active?'active':''}"><i>${x.active?'적용':'조건'}</i>${C.esc(x.label)} <b>${fmtStun(x.value)} · ${fmt(x.capture)}%</b></span>`).join('');
    return`<section class="ord-panel upper-focus"><div class="panel-head"><div><small>메인 상위 · ${status} · 실제 스킬 기준</small><h2>${C.esc(displayNameOf(u))} ${storyBadge(u,C.storyGrade(u))}</h2><p><b>${C.esc(strategy.label||'복합 상위')}</b> · ${C.esc(strategy.summary||'현재 패의 순증으로 파트너를 계산합니다.')}</p></div><span class="mode-pill ${p.mode}">${modeLabel(p.mode)}</span></div><div class="upper-skill-facts"><div><small>상시·확정 스킬</small><div>${facts.always.map(x=>fact(x,false)).join('')||'<span>수치 역할 없음</span>'}</div></div><div><small>발동 스킬 · 안정환산 별도</small><div>${facts.trigger.map(x=>fact(x,true)).join('')||'<span>발동 수치 없음</span>'}</div></div><div><small>연구표 유효 환산</small><div>${(facts.research||[]).map(research).join('')}${researchVariants||''}${!(facts.research||[]).length?'<span>실측 보정 없음</span>':''}</div></div><div><small>페널티·딜 메커니즘</small><div>${(facts.penalties||[]).map(penalty).join('')}${facts.mechanics.map(mechanic).join('')||(!facts.penalties||!facts.penalties.length?'<span>주딜러</span>':'')}</div></div></div>${conditions?`<div class="upper-conditions"><small>스킬 설명에서 읽은 운영 조건</small><div>${conditions}</div></div>`:''}<div class="profile-grid"><div><small>클리어 필수 보완</small><b>${C.esc((plan.deficits.clearRows||[]).slice(0,3).map(x=>x.label).join(' · ')||'필수 조건 충족')}</b></div><div><small>상위 시너지 보완</small><b>${C.esc((plan.deficits.buildRows||[]).filter(x=>x.recommended).slice(0,3).map(x=>x.label).join(' · ')||'추가 시너지 선택')}</b></div></div>${partners}${later?`<details class="upper-later"><summary>보류·대비 파트너 ${p.later.length}개</summary><div class="synergy-cards">${later}</div></details>`:''}<small class="fact-source">수치 출처: ${C.esc(facts.source||'2.305 abilities')} · 발동 이감/방깎과 연구표 유효 스턴은 상시 스킬과 분리해 표시합니다.</small></section>`;
  }
  renderSpec(plan){
    const def=this.observedDeficits(plan),ctl=def.control||{},readout=this.controlReadout(ctl),req=(def.requirements||[]).filter(x=>x.required&&x.key!=='control'),recommended=(def.requirements||[]).filter(x=>x.recommended),verdict=this.clearVerdict(plan),priority=[];for(const row of def.buildRows||def.rows||[]){const label=row.key==='control'?'제어력':row.label;if(label&&!priority.includes(label))priority.push(label);}if(plan.rarePressure&&plan.rarePressure.shouldSpend)priority.push('희귀 패 정리');const bench=ctl.captureBenchmarks||{},card=x=>`<div class="${x.status}"><small>${C.esc(x.label)}${x.recommended?' · 시너지':''}</small><b>${fmt(x.current)} <i>/ ${fmt(x.target)}</i></b><span>${x.status==='ok'?'충족':`부족 ${fmt(x.gap)}`}</span></div>`;
    return`<section class="ord-panel spec-focus"><div class="panel-head"><div><small>현재 실보유 역할표 · 클리어 확률 아님 · ${C.esc(def.source||'TMO 실제 완성 유닛')}</small><h2>${C.esc(verdict.label)}</h2><p>${C.esc(verdict.note)}</p></div><span class="control-badge ${verdict.status}">${def.readiness}%</span></div><div class="evidence-legend"><span class="observed">관측 사실 · TMO 실보유</span><span class="calculated">재료 계산 · 아직 제작 전</span><span class="hypothesis">미래 가설 · 판정 제외</span><span class="unverified">보스 DPS · 미검증</span></div><div class="control-combo ${ctl.status||'danger'}"><div class="control-combo-head"><div><small>실보유 제어력 구조 · ${C.esc(ctl.profileMode==='magic'?'마딜':ctl.profileMode==='physical'?'물딜':'자동')}</small><b>${C.esc(ctl.label||'계산 중')}</b></div><span>${C.esc(this.controlChoice(ctl))}</span></div><div class="control-pair"><div><small>현재 유효 스턴 · 평균 포획률</small><b>${fmtStun(ctl.stun)} (${fmt(readout.capture)}%)</b></div><i>+</i><div><small>안정환산 이감</small><b>${fmt(readout.stable)} / ${fmt(ctl.targetSlow)}</b></div></div><div class="control-options"><b>${C.esc(ctl.note||this.controlChoice(ctl))}</b><span>이감 계산: 상시 ${fmt(readout.staticSlow)} + 발동 ${fmt(readout.triggerSlow)} → 안정환산 ${fmt(readout.stable)} · 기대 ${fmt(readout.expected)} · 최대 ${fmt(readout.max)}</span><span>${C.esc(this.controlCriteria(ctl))}</span><span class="stun-efficiency">${ctl.profileMode==='physical'?`0.7스턴은 중간 하드 최소선입니다(그 밑은 스턴이 안 잡히는 실측치). 50라 보수적 구조 기준은 1.5스턴이며, 그 이후 초과 스턴은 가점이 없습니다.`:`연구표: 0.5스턴 포획률 ${fmt(bench.half)}% · 1→1.5는 +${fmt(bench.gainOneToStable)}%p · 1.5→2는 +${fmt(bench.gainStableToTwo)}%p이며 포획률은 클리어 확률이 아닙니다.`}</span></div></div><h3 class="spec-subhead">실보유 구조 필수 조건</h3><div class="requirement-grid">${req.map(card).join('')}</div>${recommended.length?`<h3 class="spec-subhead">메인 상위 시너지 · 구조 판정과 분리</h3><div class="requirement-grid recommended">${recommended.map(card).join('')}</div>`:''}<div class="deficit-line"><b>현재 제작 우선순위</b>${priority.length?priority.map((x,i)=>`<span>${i+1}. ${C.esc(x)}</span>`).join(''):'<span class="ok">구조 역할 합계만 충족 · 보스 화력 미검증</span>'}</div></section>`;
  }
  renderRareResolution(state,plan){
    const squad=plan.squadPlan||{},timeline=squad.timelineReadiness||{},deadline=timeline.rare||{},directionReady=!plan.directionBoard||this.state.directionStatus==='selected'||!!this.upperLock(),classified=directionReady&&Array.isArray(deadline.rows)&&deadline.rows.length>0,holdReason=!directionReady?'파티 미리보기 단계입니다. 방향을 유지하거나 상위를 확정해야 안전한 사용처를 고정할 수 있습니다.':!classified?'현재 파티의 희귀 사용처를 다시 계산하고 있습니다.':'최종 9기 완성 여부와 무관하게 지금 제작에 쓰이지 않는 희귀를 라운드 마감 기준으로 분리합니다.';
    const virtualSpecialId=String(this.state.virtualSpecialId||''),virtualSpecial=virtualSpecialId&&state.db.byId.get(virtualSpecialId),virtualOptions=(C.eligible152Specials?C.eligible152Specials(state.db):state.db.specials).map(unit=>`<option value="${C.esc(unit.id)}" ${virtualSpecialId===unit.id?'selected':''}>${C.esc(displayNameOf(unit))}</option>`).join(''),virtualConsumers=virtualSpecial?state.db.rares.filter(unit=>(unit.stuffs||[]).some(item=>item&&item.id===virtualSpecialId)).map(unit=>({unit,progress:C.completionPercent(state,unit)})).sort((a,b)=>b.progress-a.progress||displayNameOf(a.unit).localeCompare(displayNameOf(b.unit),'ko')):[],consumerText=virtualConsumers.slice(0,6).map(row=>displayNameOf(row.unit)).join(' · '),virtualSpecialHtml=`<div class="virtual-special-inline ${virtualSpecial?'active':''}"><div class="virtual-special-summary">${virtualSpecial?`<img src="${C.esc(virtualSpecial.image||'')}" alt="">`:'<i class="reward-mark">152</i>'}<span><small>152킬 특별함 · 희귀 패 계산에 합산</small><b>${C.esc(virtualSpecial?`${displayNameOf(virtualSpecial)}(특별함) 1기 반영`:'받은 특별함을 여기서 선택')}</b><em>${C.esc(virtualSpecial?virtualConsumers.length?`사용 가능 희귀: ${consumerText}${virtualConsumers.length>6?` 외 ${virtualConsumers.length-6}종`:''}`:'이 특별함을 쓰는 희귀 조합식 없음':'선택 즉시 희귀 완성도·선위·리롤을 함께 재계산') }</em></span></div><label><span>보상 특별함</span><select data-opt="virtualSpecialId"><option value="">선택 안 함</option>${virtualOptions}</select></label></div>`;
    const source=classified?deadline.rows.map(row=>({id:row.id,use:C.num(row.spent),hold:C.num(row.hold),reroll:C.num(row.reroll),reason:row.reason,deadlineRound:row.deadlineRound,destinations:row.destinations||[]})):state.db.rares.map(unit=>({id:unit.id,use:0,hold:C.num(state.counts[unit.id]),reroll:0,reason:'방향 확정 전 안전 보류'})).filter(row=>row.hold>0),categories={use:[],hold:[],reroll:[]};
    for(const row of source){const unit=state.db.byId.get(row.id);if(!unit)continue;for(const key of Object.keys(categories)){const count=C.num(row[key]);if(count>0)categories[key].push({unit,count,reason:row.reason,deadlineRound:row.deadlineRound,destinations:row.destinations});}}
    for(const rows of Object.values(categories))rows.sort((a,b)=>b.count-a.count||displayNameOf(a.unit).localeCompare(displayNameOf(b.unit),'ko'));
    const totals=Object.fromEntries(Object.entries(categories).map(([key,rows])=>[key,rows.reduce((sum,row)=>sum+row.count,0)])),total=totals.use+totals.hold+totals.reroll,types=new Set(source.filter(row=>C.num(row.use)+C.num(row.hold)+C.num(row.reroll)>0).map(row=>row.id)).size,list=(rows,empty)=>`<div class="rare-stack">${rows.length?rows.map(row=>{const destinations=(row.destinations||[]).filter(item=>item.disposition===(row.reason&&/사용처 없음|마감/.test(row.reason)?'reroll':'hold')).map(item=>item.name).filter(Boolean).slice(0,2),why=destinations.length?destinations.join(' · '):row.reason||'';return`<div class="rare-card"><img src="${C.esc(row.unit.image||'')}" alt=""><span><b>${C.esc(displayNameOf(row.unit))}</b>${storyBadge(row.unit,C.storyGrade(row.unit))}<small>${C.esc(why)}${row.deadlineRound?` · ${C.num(row.deadlineRound)}라 마감`:''}</small></span><strong>${row.count}장</strong></div>`;}).join(''):`<small class="rare-empty">${C.esc(empty)}</small>`}</div>`;
    return`<section class="ord-panel rare-panel ${classified?'ready':'locked'}"><div class="panel-head"><div><small>${classified?'라운드 마감 적용 · 미래 드랍 예약은 40~45라에 만료':'방향 확정 전 안전 잠금'}</small><h2>희귀함 리롤</h2><p>${C.esc(holdReason)}</p></div><span class="count-pill">희귀 ${total}장 · ${types}종${virtualSpecial?' · 152킬 +1':''}</span></div>${virtualSpecialHtml}<div class="rare-columns"><div class="use"><h3>사용 <small>${totals.use}장</small></h3>${list(categories.use,'지금 사용할 희귀함 없음')}</div><div class="hold"><h3>보류 <small>${totals.hold}장</small></h3>${list(categories.hold,'검증된 보류 희귀함 없음')}</div><div class="reroll"><h3>리롤 <small>${totals.reroll}장</small></h3>${list(categories.reroll,classified?'리롤할 희귀함 없음':'방향 확정 전에는 리롤하지 않음')}</div></div><small>${C.esc(classified?'사용=현재 제작 순서, 보류=라운드 안에 검증된 사용처, 리롤=현재 유효 사용처가 없거나 예약 마감이 지난 희귀입니다. 한 장 리롤할 때마다 TMO 패를 다시 읽고 재계산하세요.':`리롤 보류 이유: ${holdReason}`)}</small></section>`;
  }
  renderOwnedSummary(state){
    const units=(C.ownedDisplayUnits||C.ownedUnits)(state,u=>C.isUpper(u)||C.isLegendish(u));if(!units.length)return'';const grouped=new Map();for(const u of units){if(!grouped.has(u.id))grouped.set(u.id,{u,count:0});grouped.get(u.id).count++;}return`<section class="ord-panel owned-panel"><div class="panel-head"><div><h2>현재 완성 유닛</h2><p>스펙 판정에 들어간 전설급·상위입니다. 변신·특강 형태는 한 기로 표시합니다.</p></div><span class="count-pill">${units.length}기</span></div><div class="owned-chips">${[...grouped.values()].map(x=>`<button data-act="detail" data-id="${x.u.id}"><img src="${C.esc(x.u.image||'')}" alt=""><span>${C.esc(displayNameOf(x.u))}${storyBadge(x.u,C.storyGrade(x.u))}</span>${x.count>1?`<b>×${x.count}</b>`:''}</button>`).join('')}</div></section>`;
  }
  renderDeck(state,plan){
    const abilities=Object.entries(state.currentAbilities),owned=(C.ownedDisplayUnits||C.ownedUnits)(state,u=>C.isUpper(u)||C.isLegendish(u)),rare=state.db.rares.filter(u=>C.num(state.counts[u.id])>0),query=C.cleanName(this.state.unitSearch).toLowerCase(),tx=normalizeTransaction(this.state.pendingTransaction),overrideIds=Object.assign({},this.state.manualCounts,this.state.pendingCounts,tx&&tx.expected||{}),results=query?state.db.units.filter(u=>!C.isCommon(u)&&displayNameOf(u).toLowerCase().includes(query)).slice(0,24):Object.keys(overrideIds).map(id=>state.db.byId.get(id)).filter(Boolean);
    return`<div class="deck-page"><section class="ord-panel manual-manager"><div class="panel-head"><div><h2>유닛 수동 추가·삭제</h2><p>TMO가 놓친 유닛만 보정하세요. 제작 거래 중에는 결과와 모든 소모 재료가 함께 표시됩니다.</p></div><button class="ghost" data-act="clear-overrides">전체 보정 해제</button></div><div class="unit-search"><input data-live-opt="unitSearch" value="${C.esc(this.state.unitSearch)}" placeholder="유닛 이름 검색"><button class="primary" data-act="search-units">검색</button></div><div class="manual-results">${results.length?results.map(u=>{const count=C.num(state.counts[u.id]),transactional=!!(tx&&Object.prototype.hasOwnProperty.call(tx.expected,u.id)),override=transactional||Object.prototype.hasOwnProperty.call(this.state.manualCounts,u.id)||Object.prototype.hasOwnProperty.call(this.state.pendingCounts,u.id);return`<article><img src="${C.esc(u.image||'')}" alt=""><span><b>${C.esc(displayNameOf(u))}</b>${storyBadge(u,C.storyGrade(u))}<small>${C.esc(tierLabel(u))}${transactional?' · 제작 거래 반영 중':override?' · 수동 적용 중':''}</small></span><button data-act="unit-adjust" data-delta="-1" data-id="${u.id}">−</button><strong>${count}</strong><button data-act="unit-adjust" data-delta="1" data-id="${u.id}">+</button>${override?`<button class="reset" data-act="clear-unit-override" data-id="${u.id}">TMO값</button>`:''}</article>`;}).join(''):'<div class="empty">이름을 입력해 검색하세요.</div>'}</div></section><section class="ord-panel"><div class="panel-head"><div><h2>TMO 현재 능력치</h2><p>받은 항목은 원문, 빠진 항목은 보유 유닛 값으로 보완합니다.</p></div><span class="count-pill">${abilities.length}개</span></div><div class="raw-ability-grid">${abilities.length?abilities.map(([k,v])=>`<div><span>${C.esc(k)}</span><b>${k==='스턴'?`${fmtStun(v)} (${fmt(stunCaptureRate(v))}%)`:fmt(v)}</b></div>`).join(''):'<div class="empty">현재 능력치를 아직 받지 못했습니다.</div>'}</div></section><section class="ord-panel"><div class="panel-head"><div><h2>보유 유닛</h2><p>전설급·상위·희귀함을 한곳에서 확인합니다.</p></div></div><h3>전설급·상위 ${owned.length}기</h3><div class="owned-grid">${owned.map(u=>`<button data-act="detail" data-id="${u.id}"><img src="${C.esc(u.image||'')}" alt=""><span>${C.esc(displayNameOf(u))}${storyBadge(u,C.storyGrade(u))}</span><small>${C.esc(tierLabel(u))}</small></button>`).join('')||'<div class="empty">없음</div>'}</div><h3>희귀함</h3><div class="owned-grid small">${rare.map(u=>`<button data-act="detail" data-id="${u.id}"><img src="${C.esc(u.image||'')}" alt=""><span>${C.esc(displayNameOf(u))}${storyBadge(u,C.storyGrade(u))}</span><b>×${C.num(state.counts[u.id])}</b></button>`).join('')||'<div class="empty">없음</div>'}</div></section></div>`;
  }
  renderStoryCatalog(state){
    const query=C.cleanName(this.state.storyQuery).toLowerCase(),tier=this.state.storyTier||'',basis=this.state.storyBasis||'',league=['rare','upper','legend'].includes(this.state.storyLeague)?this.state.storyLeague:'rare',meta=C.STORY_LEAGUES[league],catalog=C.storyLeagueRows(state.db.units),order=['rare','upper','legend'],totals=Object.fromEntries(order.map(key=>{const items=catalog.filter(row=>row.league===key);return[key,{all:items.length,ranked:items.filter(row=>row.grade.leagueRanked).length}];})),all=catalog.filter(row=>row.league===league),rows=all.filter(x=>(!query||displayNameOf(x.unit).toLowerCase().includes(query)||tierLabel(x.unit).toLowerCase().includes(query))&&(!tier||x.grade.leagueTier===tier)&&(!basis||x.grade.basis===basis)),counts=all.reduce((out,x)=>{out[x.grade.basis]=(out[x.grade.basis]||0)+1;return out;},{}),leagueTiers=all.filter(x=>x.grade.leagueRanked).reduce((out,x)=>{out[x.grade.leagueTier]=(out[x.grade.leagueTier]||0)+1;return out;},{}),tabs=order.map(key=>{const item=C.STORY_LEAGUES[key],total=totals[key];return`<button class="${league===key?'on':''} league-${key}" data-act="story-league" data-league="${key}" role="tab" aria-selected="${league===key}"><span>${C.esc(item.label)}</span><b>${total.all}기</b><small>실측 순위 ${total.ranked}</small></button>`;}).join('');
    return`<div class="story-page"><section class="ord-panel story-guide league-${league}"><div class="story-leagues" role="tablist" aria-label="스토리 등급 리그">${tabs}</div><div class="panel-head"><div><small>${C.esc(meta.label)} 리그 · 독립 재등급</small><h2>${C.esc(meta.label)} 스토리 등급</h2><p>${C.esc(meta.description)} 실측 순위를 아홉 구간으로 나눠 상위부터 SSS~F를 부여하며, 원본 순위와 측정값은 그대로 보존합니다.</p></div><span class="count-pill">표시 ${rows.length} / ${all.length}</span></div><div class="story-summary"><span>실측 순위 ${all.filter(x=>x.grade.leagueRanked).length}</span><span>순위 외 추정 ${counts.estimated||0}</span>${(C.STORY_GRADE_TIERS||['SSS','SS','S','A','B','C','D','E','F']).map(key=>`<span class="tier-${key.toLowerCase()}">실측 ${key} ${leagueTiers[key]||0}</span>`).join('')}</div><div class="story-filters"><input data-live-opt="storyQuery" value="${C.esc(this.state.storyQuery)}" placeholder="${C.esc(meta.label)} 유닛 이름 검색"><select data-opt="storyTier"><option value="">등급 전체</option>${(C.STORY_GRADE_TIERS||['SSS','SS','S','A','B','C','D','E','F']).map(x=>`<option value="${x}" ${tier===x?'selected':''}>${C.esc(meta.label)} 스토리 ${x}</option>`).join('')}</select><select data-opt="storyBasis"><option value="">근거 전체</option><option value="measured" ${basis==='measured'?'selected':''}>실측</option><option value="research" ${basis==='research'?'selected':''}>자료</option><option value="estimated" ${basis==='estimated'?'selected':''}>추정</option></select><button class="primary" data-act="story-search">검색</button></div></section><section class="story-catalog" data-story-league="${league}">${rows.map(x=>{const g=x.grade,source=g.leagueRanked?(g.sourceTableTier?`원본 표 ${g.sourceTableTier}티어`:'희귀 실험값 기준'):'실측표 밖 · 스킬 역할 추정';return`<article class="story-card ${C.esc(g.basis)} league-${league}"><img src="${C.esc(x.unit.image||'')}" alt=""><div><div class="story-card-title"><b>${C.esc(displayNameOf(x.unit))}</b><span class="${g.leagueRanked?'ranked':'estimated'}">${g.leagueRanked?`${g.leagueRank}위`:'순위 외'}</span></div><small>${C.esc(tierLabel(x.unit))} · ${C.esc(source)}</small>${storyBadge(x.unit,g)}</div><p>${C.esc(g.note)}</p><button data-act="detail" data-id="${C.esc(x.unit.id)}">상세·재료</button></article>`;}).join('')||'<div class="ord-panel empty">조건에 맞는 유닛이 없습니다.</div>'}</section></div>`;
  }
  runLogEventInfo(event,state){
    const payload=event&&event.payload||{},actionNames={'post-legend-route':'첫 전설 뒤 경로 선택','story-stage-step':'스토리 단계 변경','veto-action':'추천 넘어가기','unveto-action':'넘어가기 복원','story-rush-toggle':'스토리 밀기 포기 전환',purpose:'추천 단계 선택',mode:'딜 계통 변경','super-kuma':'초월 가능 상태 변경','mark-made':'추천 유닛 만듦 클릭','unit-adjust':'유닛 수동 보정','clear-unit-override':'유닛 보정 해제','preview-direction':'상위 방향 미리보기','choose-direction':'상위 방향 선택','hold-direction':'방향 보류','select-upper':'상위 미리보기','confirm-upper':'상위 확정','lock-legend':'전설 경로 예약','lock-rare':'희귀 경로 예약','remove-lock':'경로 예약 해제','reset-route':'상위·경로 초기화','round-step':'라운드 수동 변경','round-start':'라운드 타이머 시작','round-pause':'라운드 타이머 멈춤','reroll-step':'희귀 리롤 횟수 변경','new-game':'새 게임 버튼','dismiss-transaction':'제작 임시 반영 취소','counter-step':'특수 제작 횟수 변경','clear-overrides':'수동 보정 해제','manual-count':'재료 수량 수동 보정','setting-change':'판단 설정 변경','build-marked':'제작 결과 임시 반영','build-confirmed':'TMO에서 제작 확인','build-rolled-back':'제작 임시 반영 취소','build-confirmation-delayed':'TMO 제작 확인 지연'},unitName=id=>{const key=String(id||'');if(!key)return'';const unit=state&&state.db&&state.db.byId.get(key);return unit?displayNameOf(unit):C.SPECIAL_IDS&&C.SPECIAL_IDS[key]||'특수재료';};
    if(event.type==='snapshot'){const changes=Object.entries(payload.counts||{}).slice(0,8).map(([id,value])=>`${unitName(id)} ${value==null?'0':value}`);return{label:'TMO 패 변화',tone:'snapshot',headline:payload.kind==='full'?'현재 패 전체 기준점 저장':'실제 수량·완성도 변화 감지',detail:changes.join(' · ')||'능력치 또는 완성도 변화',chips:[payload.observed&&payload.observed.confidence!=null?`수집 신뢰 ${Math.round(C.num(payload.observed.confidence)*100)}%`:'',payload.effectiveInput&&payload.effectiveInput.pendingTransaction?'제작 확인 대기':''].filter(Boolean)};}
    if(event.type==='decision'){const v15=payload.v15||{},actions=(payload.actions||[]).map(row=>row.name||unitName(row.id)).filter(Boolean),v15Missing=(v15.assessment&&v15.assessment.requirements||[]).filter(row=>C.num(row.gap)>0).map(row=>row.label).slice(0,5),missing=v15Missing.length?v15Missing:(payload.deficits&&payload.deficits.rows||[]).filter(row=>row.required&&C.num(row.gap)>0).map(row=>row.label).slice(0,5),boss=payload.squad&&payload.squad.timeline&&payload.squad.timeline.boss50||{},headline=v15.authority?`${v15.label||'판단'}${v15.action&&v15.action.name?` · ${v15.action.name}`:''}`:actions.length?`다음 추천 · ${actions.join(' → ')}`:'현재 패에서 확정 제작 대기';return{label:'프로그램 판단',tone:'decision',headline,detail:v15.authority?v15.reason||missing.length&&`부족 조건: ${missing.join(' · ')}`||'현재 패 소비 보류':missing.length?`부족 조건: ${missing.join(' · ')}`:boss.note||payload.routeEvaluation&&payload.routeEvaluation.note||'필수 조건 계산 완료',chips:[v15.state||'',payload.mode?modeLabel(payload.mode):'',payload.route||'',payload.upper&&payload.upper.name?`메인 ${payload.upper.name}`:''].filter(Boolean)};}
    if(event.type==='outcome'){const labels={r50_failed:'50라 보스 실패',r50_killed:'50라 보스 처치 · 계속 진행',r51_65_failed:'51~65라 실패',r65_cleared:'65라 클리어',abandoned:'게임 중단'},kind=payload.kind||'unknown',hp=payload.bossHpPercent==null?'':` · 보스 잔여 ${payload.bossHpPercent}%`;return{label:'게임 결과',tone:RUN_FAILURE_KINDS.has(kind)?'outcome fail':'outcome',headline:(labels[kind]||kind)+hp,detail:payload.note||({timeout:'시간 초과',line:'라인사',control:'컨트롤 실패',unknown:'원인 미상'}[payload.failureReason]||''),chips:[payload.snapshotFresh===false?'스냅샷 오래됨':'',payload.helperUsed?'도움소 사용':''].filter(Boolean)};}
    const action=String(payload.action||'사용자 선택'),target=payload.targetName||unitName(payload.targetId),headline=actionNames[action]||action,details=[];if(target)details.push(target);if(payload.key)details.push(`${payload.key}: ${payload.before==null?'—':payload.before} → ${payload.after==null?payload.value:payload.after}`);if(payload.wispCost!=null)details.push(`선위 ${payload.wispCost}`);return{label:payload.actor==='tmo'?'TMO 제작 확인':payload.actor==='program'?'프로그램 반영':'사용자 선택',tone:/build/.test(action)?'build':'action',headline,detail:details.join(' · '),chips:[]};
  }
  renderRunLog(state,plan,health){
    const current=this.runLog&&this.runLog.currentRun||null,run=this.viewedRunLog(),history=(this._runLogHistory||[]).slice(),currentMeta=current&&!history.some(item=>item.runId===current.runId)?[current]:[],metas=currentMeta.concat(history),filter=this._runLogFilter||'all',matches=event=>filter==='all'||filter==='decision'&&event.type==='decision'||filter==='snapshot'&&event.type==='snapshot'||filter==='action'&&event.type==='user-action'&&!/^build/.test(String(event.payload&&event.payload.action||''))||filter==='build'&&event.type==='user-action'&&/^build/.test(String(event.payload&&event.payload.action||''))||filter==='outcome'&&event.type==='outcome',events=(run&&run.events||[]).filter(matches).slice(-200).reverse(),counts=(run&&run.events||[]).reduce((out,event)=>(out[event.type]=(out[event.type]||0)+1,out),{}),statusLabel={active:'기록 중',completed:'클리어 종료',failed:'실패 종료',abandoned:'중단'}[run&&run.status]||'기록 없음',formatDate=value=>value?new Date(value).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—',selectedId=run&&run.runId||'',historyHtml=metas.map(meta=>`<button class="${selectedId===meta.runId?'on':''}" data-act="run-log-select" data-run-id="${C.esc(meta.runId)}"><b>${C.esc(formatDate(meta.startedAt))}</b><span>${C.esc({active:'진행 중',completed:'65라 클리어',failed:'실패',abandoned:'중단'}[meta.status]||meta.status)}</span><small>${C.esc(meta.runId.slice(-8))}</small></button>`).join(''),eventHtml=events.map(event=>{const info=this.runLogEventInfo(event,state),time=new Date(event.at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});return`<article class="run-event ${C.esc(info.tone)}"><div class="run-event-rail"><i></i><span>#${event.seq}</span></div><div class="run-event-main"><header><span>${C.esc(info.label)}</span><time>${event.round!=null?`${event.round}라 · `:''}${C.esc(time)}</time></header><h3>${C.esc(info.headline)}</h3>${info.detail?`<p>${C.esc(info.detail)}</p>`:''}${info.chips.length?`<div>${info.chips.map(chip=>`<em>${C.esc(chip)}</em>`).join('')}</div>`:''}</div></article>`;}).join('');
    if(!run)return`<div class="run-log-page"><section class="ord-panel empty"><h2>진행 기록 준비 중</h2><p>첫 TMO 패가 들어오면 판단 기록이 자동으로 시작됩니다.</p></section></div>`;
    return`<div class="run-log-page"><section class="ord-panel run-log-head"><div class="panel-head"><div><small>로컬 자동 감사 로그 · 외부 전송 없음</small><h2>이번 게임 판단 기록</h2><p>프로그램 추천, 사용자가 누른 선택, TMO에서 확인된 실제 변화, 게임 결과를 서로 분리해 저장합니다.</p></div><span class="run-status ${C.esc(run.status)}">${C.esc(statusLabel)}</span></div><div class="run-log-summary"><div><small>게임 시작</small><b>${C.esc(formatDate(run.startedAt))}</b></div><div><small>전체 사건</small><b>${C.num((run.events||[]).length)}</b></div><div><small>판단 변경</small><b>${C.num(counts.decision)}</b></div><div><small>TMO 패 변화</small><b>${C.num(counts.snapshot)}</b></div><div><small>현재 스냅샷</small><b>${health.ready?'정상':'주의'}</b></div></div><div class="run-log-actions"><button class="primary" data-act="run-log-export" data-run-id="${C.esc(run.runId)}">이 게임 JSON 저장</button><button data-act="run-result-open">게임 결과 입력</button><span>파일을 이 대화에 첨부하면 당시 판단을 그대로 재검토할 수 있습니다.</span></div></section><div class="run-log-grid"><aside class="ord-panel run-history"><div><b>저장된 게임</b><small>최근 ${metas.length}판</small></div>${historyHtml||'<p>현재 게임만 있습니다.</p>'}<button class="danger-text" data-act="run-log-clear">기록 모두 삭제</button></aside><main class="run-timeline"><div class="run-filter">${[['all','전체'],['decision','판단'],['action','선택'],['snapshot','패 변화'],['build','제작 확인'],['outcome','결과']].map(([key,label])=>`<button class="${filter===key?'on':''}" data-act="run-log-filter" data-value="${key}">${label}</button>`).join('')}<span>최근 ${events.length}건 표시</span></div>${eventHtml||'<section class="ord-panel empty">이 조건의 기록이 없습니다.</section>'}</main></div><section class="ord-panel run-log-notice"><b>이 기록이 증명하는 것</b><p>당시 입력과 추천 과정을 재생하기 위한 파일입니다. 실제 게임 컨트롤이나 보스 DPS를 자동 측정한 클리어 보증서는 아닙니다. 결과 입력의 보스 체력·업그레이드·도움소·메모가 다음 개선에 특히 중요합니다.</p></section></div>`;
  }
  // v17.10(1단계): 판정-결과 자동 대조 리포트. 이번 판 이벤트 스트림에서
  // 미실행 ACT_NOW 구간·필수 결손 개방·대기 비용·리롤 활용을 집계한다.
  // 실행 여부는 제작 확인 이벤트 + TMO 스냅샷 수량 증가로 판정하므로
  // 앱에서 확인을 누르지 않은 게임 내 제작도 실행으로 인정된다.
  buildVerdictReport(){
    try{
      const run=this.runLog&&this.runLog.currentRun;
      if(!run||!Array.isArray(run.events)||!run.events.length)return null;
      if(!global.ORDRunLogCompactor||!global.ORDRunLogCompactor.verdictReport)return null;
      return global.ORDRunLogCompactor.verdictReport(run.events);
    }catch(_){return null;}
  }
  // 표시용 캐시: (runId, 이벤트 수) 키 — 이벤트가 늘면 자동 재계산되어
  // 50킬 이후 계속 진행·전멸 오탐 케이스에서도 낡은 리포트가 남지 않고,
  // 같은 이벤트 상태의 반복 렌더(kind 클릭 등)는 재계산하지 않는다.
  verdictReportForDisplay(){
    const run=this.runLog&&this.runLog.currentRun;
    const key=run?`${run.runId}:${(run.events||[]).length}`:'';
    if(key&&this._verdictCacheKey===key)return this._verdictCache;
    const report=this.buildVerdictReport();
    this._verdictCacheKey=key;this._verdictCache=report;
    return report;
  }
  clearVerdictCache(){this._lastVerdictReport=null;this._verdictCache=null;this._verdictCacheKey='';}
  recordVerdictReport(trigger){
    const report=this.buildVerdictReport();
    if(!report)return null;
    this._lastVerdictReport=report;
    this.recordAuditAction({actor:'program',action:'verdict-report',trigger:String(trigger||''),report});
    return report;
  }
  renderVerdictReport(report){
    if(!report)return'';
    const advice=(report.advice||[]).map(text=>`<li>${C.esc(text)}</li>`).join('');
    const unexecuted=(report.unexecuted||[]).slice(0,3).map(row=>`<span>${C.esc(row.name)} <b>${C.num(row.fromRound)}~${C.num(row.toRound)}라 (${C.num(row.rounds)}라)</b></span>`).join('');
    const deficits=(report.deficits||[]).slice(0,3).map(row=>`<span>${C.esc(row.label)} <b>${C.num(row.openRounds)}라${row.openAtEnd?' · 끝까지':''}</b></span>`).join('');
    const finals=(report.finalDeficits||[]).slice(0,4).map(row=>`${C.esc(row.label)} ${fmt(row.gap)}`).join(' · ');
    return`<div class="verdict-report"><small>판정-결과 자동 대조 · 이번 판 기록에서 계산 (성공·실패 추정 아님)</small><ul>${advice}</ul><div class="verdict-grid">${unexecuted?`<div><i>미실행 추천 (3라+)</i>${unexecuted}</div>`:''}${deficits?`<div><i>결손 개방 라운드</i>${deficits}</div>`:''}<div><i>대기 비용</i><span>방향 선택 <b>${C.num(report.waitCost&&report.waitCost.routeChoice)}라</b> · 보류 <b>${C.num(report.waitCost&&report.waitCost.hold)}라</b> · 리롤 제안 <b>${C.num(report.reroll&&report.reroll.suggestedRounds)}라</b>/사용 <b>${C.num(report.reroll&&report.reroll.used)}회</b></span></div>${finals?`<div><i>종료 시점 결손</i><span>${finals}</span></div>`:''}</div></div>`;
  }
  renderRunResultModal(health){
    if(!this._runResultOpen)return'';const d=this._runResultDraft||RUN_RESULT_DEFAULTS,kind=d.kind||'r50_failed',tx=normalizeTransaction(this.state.pendingTransaction),button=(value,label,note)=>`<button class="${kind===value?'on':''}" data-act="run-result-kind" data-value="${value}"><b>${label}</b><small>${note}</small></button>`,
    // v22.6(사용자: "게임 결과 적는 칸 글씨가 너무 작고 쉽게 적을 수 있게"):
    // 셀렉트 대신 큰 세그먼트 버튼 — 한 손·한 클릭으로 적는다.
    seg=(field,options,current)=>options.map(([value,label])=>`<button type="button" class="${String(current)===value?'on':''}" data-act="run-result-field" data-field="${field}" data-value="${value}">${label}</button>`).join('');
    return`<div class="modal-back run-result-back" data-act="run-result-close"><article class="run-result-modal v226" role="dialog" aria-modal="true" aria-label="게임 결과 기록"><button class="modal-x" data-act="run-result-close" aria-label="닫기">×</button><header><small>이번 게임 결과 · 사용자 확인값</small><h2>어디에서 어떻게 끝났나요?</h2><p>프로그램은 성공·실패를 추정하지 않습니다. 아래 결과와 당시 상태를 함께 저장합니다.</p></header><div class="result-kinds">${button('r50_failed','50라 실패','게임 종료 · JSON 자동 저장')}${button('r50_killed','50라 보스 처치','계속 기록 · 65라까지 진행')}${button('r51_65_failed','51~65라 실패','게임 종료 · JSON 자동 저장')}${button('r65_cleared','65라 클리어','게임 종료 · JSON 자동 저장')}</div><div class="result-health ${health.ready?'ok':'warn'}"><b>${C.esc(health.label)}</b><span>${health.ageSec<999?`${C.num(health.ageSec)}초 전 TMO 패`:'TMO 패 없음'} · ${health.ready?'현재 상태를 결과에 연결합니다.':'오래된 상태임을 표시하고 저장합니다.'}</span>${tx?'<em>TMO 제작 확인 대기 중 · 확정 패와 임시 패를 분리 기록</em>':''}</div>${this.renderVerdictReport(this.verdictReportForDisplay())}<div class="result-form"><label>결과 라운드<input data-run-field="round" type="number" min="1" max="65" value="${C.esc(d.round)}"></label><label>보스 남은 체력 %<input data-run-field="bossHpPercent" type="number" min="0" max="100" placeholder="모르면 비움" value="${C.esc(d.bossHpPercent)}"></label><label class="v226-field">프로그램 판단을 따랐나요?<div class="v226-seg">${seg('followedProgram',[['followed','그대로 따름'],['changed','내 판단으로 변경'],['unknown','모름']],d.followedProgram)}</div></label>${RUN_FAILURE_KINDS.has(kind)?`<label class="v226-field">실패 상황<div class="v226-seg">${seg('failureReason',[['timeout','시간 초과·보스 미처치'],['line','라인사'],['control','컨트롤 실패'],['unknown','모름']],d.failureReason)}</div></label>`:''}<label>공격력 업<input data-run-field="attackUpgrade" type="number" min="0" placeholder="모르면 비움" value="${C.esc(d.attackUpgrade)}"></label><label>이감 업<input data-run-field="slowUpgrade" type="number" min="0" placeholder="모르면 비움" value="${C.esc(d.slowUpgrade)}"></label><label>체젠 업<input data-run-field="hpRegenUpgrade" type="number" min="0" placeholder="모르면 비움" value="${C.esc(d.hpRegenUpgrade)}"></label><label>마젠 업<input data-run-field="mpRegenUpgrade" type="number" min="0" placeholder="모르면 비움" value="${C.esc(d.mpRegenUpgrade)}"></label><label class="result-check"><input data-run-field="helperUsed" type="checkbox" ${d.helperUsed?'checked':''}><span>도움소 사용</span></label><label class="result-note">컨트롤·보스 상황 메모<textarea data-run-field="note" maxlength="500" placeholder="예: 보스 체력 18% 남음, 라인은 안정적, 단일 컨트롤 놓침">${C.esc(d.note)}</textarea></label></div><footer><button data-act="run-result-close">취소</button><button class="primary" data-act="run-result-save">${kind==='r50_killed'?'처치 기록 후 계속':'결과 기록 + JSON 저장'}</button></footer></article></div>`;
  }
  // v19.9.3(사용자 확인 요청): 로컬 서버 직접 읽기 시험 — TMO 탭 없이 데이터를
  // 받는 A안(127.0.0.1:25625 직접 읽기)의 가능 여부를 그 자리에서 판정한다.
  // 응답이 읽히고 우리 카탈로그 코드('300h' 루피 등)가 그 안에 보이면 유력.
  async v199LocalProbe(){
    this._localProbe={state:'running'};
    this.render();
    const url='http://127.0.0.1:25625/datas';
    const finish=result=>{this._localProbe=result;this.render();};
    // v19.9.4(A안 실측): 네트워크 탭이 기록한 "페이지가 실제로 보낸 로컬
    // 요청"도 함께 불러온다 — /datas 가 비어 나와도 페이지의 진짜 호출
    // 형태(경로·메서드·바디·응답)가 여기 있으면 판정이 끝난다.
    try{
      if(typeof chrome!=='undefined'&&chrome.storage&&chrome.storage.local){
        const stored=await new Promise(resolve=>chrome.storage.local.get(['ordLocalTapLog','ordLocalMapSamples'],value=>resolve(value||{})));
        this._localTapLog=Array.isArray(stored.ordLocalTapLog)?stored.ordLocalTapLog:[];
        // v19.9.5(A안 3단계): 게임 중 자동 수집된 DOM↔로컬 매핑 표본.
        this._localMapSamples=Array.isArray(stored.ordLocalMapSamples)?stored.ordLocalMapSamples:[];
      }
    }catch(_){this._localTapLog=[];this._localMapSamples=[];}
    try{
      let result=null;
      // v19.11(데스크톱 셸): Electron 렌더러는 fetch 를 하지 않는다 —
      // 메인 프로세스 프로브(화이트리스트 API)를 우선 쓴다.
      if(typeof window!=='undefined'&&window.ORD_DESKTOP&&window.ORD_DESKTOP.probe){
        const desktop=await window.ORD_DESKTOP.probe();
        const text=desktop&&desktop.ok?JSON.stringify(desktop.payload||{}):'';
        result=desktop&&desktop.ok?{ok:true,status:C.num(desktop.status)||200,contentType:'application/json',size:text.length,text}:{ok:false,error:String(desktop&&desktop.error||'로컬 서버 응답 없음')};
      }else if(typeof chrome!=='undefined'&&chrome.runtime&&chrome.runtime.sendMessage&&this.config.source!=='standalone-manual'){
        result=await new Promise(resolve=>chrome.runtime.sendMessage({type:'ORD_LOCAL_PROBE',url},response=>{
          const error=chrome.runtime.lastError;
          resolve(error?{ok:false,error:error.message}:response||{ok:false,error:'백그라운드 응답 없음'});
        }));
      }else{
        // 수동 HTML 폴백: 직접 fetch — CORS 로 막히면 그 실패 자체가 판정 자료다.
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),4000);
        try{
          const response=await fetch(url,{signal:controller.signal,cache:'no-store'});
          const text=await response.text();clearTimeout(timer);
          result={ok:true,status:response.status,contentType:String(response.headers.get('content-type')||''),size:text.length,text:text.slice(0,200000)};
        }catch(error){clearTimeout(timer);result={ok:false,error:String(error&&error.message||error)};}
      }
      if(!result||!result.ok){finish({state:'error',error:String(result&&result.error||'알 수 없는 실패')});return;}
      const text=String(result.text||'');
      // 카탈로그 코드 일치 스캔 — 응답이 우리가 이미 아는 유닛 코드 체계로
      // 말하는지 본다.  20종 이상이면 A안(직접 읽기) 유력.
      let idHits=0;const codeSamples=[];
      try{
        const db=this.catalogDb();
        for(const unit of db.units){
          const id=String(unit.id||'');
          const codes=[].concat(unit.codes||[],id?[id]:[]);
          if(codes.some(code=>code&&text.includes(`"${code}"`))){
            idHits++;if(codeSamples.length<8)codeSamples.push(id);
            if(idHits>=60)break;
          }
        }
      }catch(_){}
      let json=false,parsed=null;try{parsed=JSON.parse(text);json=true;}catch(_){}
      // v19.9.5(A안 3단계): {units:{코드:수량}} 형태면 코드별 해석 여부를
      // 직접 나눠 보여준다 — "어떤 코드가 안 풀리는지"가 매핑 작업의 목록이다.
      let matchedCodes=[],unmatchedCodes=[],liveMatched=null,liveIgnored=null;
      try{
        const live=parsed&&typeof parsed.units==='object'&&parsed.units?parsed.units:null;
        if(live){
          const db=this.catalogDb(),RESOURCE=new Set(['GOLD','LUMBER','FOOD']);
          const LM=typeof window!=='undefined'&&window.ORD_LOCAL_MAP||null;
          if(LM&&typeof LM.translate==='function'){
            // v19.12.2(0805 실측): 원시 비교는 무시 목록·codes 역색인을 안
            // 거쳐 "미해석 13종" 같은 과장을 낳았다 — 실전 경로(translate)
            // 그대로 판정한다.  실제 미해석(수량 누락)은 unknownCounts 뿐.
            const ids=new Set(db.units.map(unit=>String(unit.id)));
            const index=LM.buildCodeIndex(db.units,C.canonicalUpperId);
            const out=LM.translate(live,ids,index);
            liveMatched=C.num(out.matched);liveIgnored=C.num(out.ignored);
            unmatchedCodes=Object.keys(out.unknownCounts||{});
            matchedCodes=Object.keys(live).filter(code=>!RESOURCE.has(code)&&!unmatchedCodes.includes(code));
          }else{
            const known=new Set();
            for(const unit of db.units){known.add(String(unit.id));for(const code of unit.codes||[])known.add(String(code));}
            for(const code of Object.keys(live)){
              if(RESOURCE.has(code))continue;
              (known.has(code)?matchedCodes:unmatchedCodes).push(code);
            }
          }
        }
      }catch(_){}
      finish({state:'done',status:C.num(result.status),contentType:String(result.contentType||''),size:C.num(result.size),json,idHits,codeSamples,matchedCodes,unmatchedCodes,liveMatched,liveIgnored,snippet:text.slice(0,1600),full:text});
    }catch(error){finish({state:'error',error:String(error&&error.message||error)});}
  }
  renderV199LocalProbe(){
    const probe=this._localProbe||null;
    // v19.9.4: 200 + 빈 응답(`{}`) 실측 대응 — 전송로는 뚫렸으니, 비어 나오면
    // 그 사실을 해석해 주고 페이지의 실측 요청 기록으로 안내한다.
    const emptyNote=probe&&probe.state==='done'&&C.num(probe.size)<=4?'<p class="probe-note"><b>전송로는 뚫렸는데 응답이 비어 있습니다.</b> 게임(워크래프트)이 실제로 돌아가는 중에 다시 눌러 보세요 — 그래도 비면, 아래 "페이지 실측 요청"이 페이지의 진짜 호출 형태를 보여줍니다(TMO 탭을 잠깐 열어 두면 자동으로 채워집니다).</p>':'';
    const body=!probe?'<p class="probe-note">아직 시험 전입니다. TMO 데스크톱 프로그램(코치 로그의 Horse 서버)이 켜져 있는 상태에서 눌러 주세요.</p>'
      :probe.state==='running'?'<p class="probe-note">127.0.0.1:25625/datas 응답 대기 중…</p>'
      :probe.state==='error'?`<div class="probe-fail"><b>읽기 실패</b><span>${C.esc(probe.error||'')}</span><small>TMO 프로그램이 꺼져 있으면 정상적인 실패입니다. 켜져 있는데도 이 메시지가 나오면, 이 문구 그대로가 판정 자료입니다 — 복사해서 알려 주세요.</small></div>`
      :`<div class="probe-ok"><div class="diag-grid"><div><small>HTTP</small><b>${C.num(probe.status)}</b></div><div><small>크기</small><b>${C.num(probe.size)}자</b></div><div><small>JSON 해석</small><b>${probe.json?'성공':'실패/부분'}</b></div><div><small>카탈로그 코드 일치</small><b>${C.num(probe.idHits)}종${C.num(probe.idHits)>=20?' — 직접 읽기 유력':''}</b></div></div>${emptyNote}${probe.codeSamples&&probe.codeSamples.length?`<p class="probe-note">발견 코드 예: ${C.esc(probe.codeSamples.join(', '))}</p>`:''}<pre>${C.esc(String(probe.snippet||''))}</pre><details><summary>전체 응답 보기·복사 (${C.num(probe.size)>200000?'앞 200,000자':'전체'} — 이걸 붙여넣어 주세요)</summary><textarea readonly rows="10">${C.esc(String(probe.full||''))}</textarea></details></div>`;
    // v19.9.4(A안 실측): 페이지가 실제로 보낸 로컬 요청 — 경로·메서드·바디·
    // 응답 조각.  /datas 가 비어도 여기 다른 형태의 호출이 잡히면 그게 정답이다.
    const tap=Array.isArray(this._localTapLog)?this._localTapLog:[];
    const tapRows=tap.map(row=>`<div class="tap-row"><b>${C.esc(String(row.method||'GET'))} ${C.esc(String(row.url||''))}</b>${row.body?`<small>바디: ${C.esc(String(row.body))}</small>`:''}<small>HTTP ${C.num(row.status)} · ${C.num(row.size)}자 · ${row.at?new Date(C.num(row.at)).toLocaleTimeString():''}</small><pre>${C.esc(String(row.snippet||'').slice(0,400))}</pre></div>`).join('');
    const tapHtml=`<div class="v199-tap"><b>페이지 실측 요청 · 최근 ${tap.length}건</b>${tap.length?tapRows:'<p class="probe-note">아직 기록 없음 — TMO 탭을 한 번 열어 두면(게임 중이면 더 좋습니다) 페이지가 로컬 서버로 보내는 요청이 여기 자동으로 잡힙니다. 그 뒤 이 버튼을 다시 누르세요.</p>'}</div>`;
    // v19.9.5(A안 3단계): 코드별 해석 결과 + 매핑 표본 수집 현황.
    const codeHtml=probe&&probe.state==='done'&&(probe.matchedCodes||probe.unmatchedCodes)?(probe.liveMatched!=null?`<p class="probe-note">실전 경로 판정 — 해석 <b>${C.num(probe.liveMatched)}종</b> · 무시 ${C.num(probe.liveIgnored)}종(자원·상수·임시) · <b>미해석 ${C.num((probe.unmatchedCodes||[]).length)}종${(probe.unmatchedCodes||[]).length?` (${C.esc((probe.unmatchedCodes||[]).slice(0,14).join(', '))}${(probe.unmatchedCodes||[]).length>14?' 외':''})`:''}</b> — 미해석 코드만 실제 수량에서 빠집니다.</p>`:`<p class="probe-note">해석 가능 ${C.num((probe.matchedCodes||[]).length)}종${(probe.matchedCodes||[]).length?` (${C.esc((probe.matchedCodes||[]).slice(0,10).join(', '))}${(probe.matchedCodes||[]).length>10?' 외':''})`:''} · <b>미해석 ${C.num((probe.unmatchedCodes||[]).length)}종${(probe.unmatchedCodes||[]).length?` (${C.esc((probe.unmatchedCodes||[]).slice(0,14).join(', '))}${(probe.unmatchedCodes||[]).length>14?' 외':''})`:''}</b> — 미해석 코드는 아래 매핑 표본이 쌓이면 수량 대조로 풀립니다.</p>`):'';
    const samples=Array.isArray(this._localMapSamples)?this._localMapSamples:[];
    const samplesHtml=`<div class="v199-tap"><b>매핑 표본 · ${samples.length}쌍 수집됨 (게임 중 자동 · TMO 탭과 게임이 같이 살아 있을 때 15초마다)</b>${samples.length?`<p class="probe-note">패가 바뀔 때마다 "같은 순간의 DOM 패 ↔ 로컬 코드" 쌍이 저장됩니다. 한 판 분량(20쌍+)이 모이면 아래 전체를 복사해 붙여넣어 주세요 — 수량 변화 대조로 미해석 코드의 매핑 표를 만듭니다.</p><details><summary>매핑 표본 전체 복사 (${samples.length}쌍)</summary><textarea readonly rows="8">${C.esc(JSON.stringify(samples))}</textarea></details>`:'<p class="probe-note">아직 표본 없음 — 게임을 돌리면서 TMO 탭을 살려 두면 자동으로 쌓입니다.</p>'}</div>`;
    return`<section class="ord-panel v199-local-probe"><div class="panel-head"><div><h2>로컬 서버 직접 읽기 시험</h2><p>tmo.gg 페이지가 읽는 로컬 데이터(127.0.0.1:25625/datas)를 코치가 직접 읽을 수 있는지 확인합니다 — 되면 TMO 탭 없이 동작하는 구조(A안)로 갈 수 있습니다.</p></div><button class="primary" data-act="local-probe" ${probe&&probe.state==='running'?'disabled':''}>${probe&&probe.state==='running'?'읽는 중…':'지금 시험'}</button></div>${body}${codeHtml}${samplesHtml}${tapHtml}</section>`;
  }
  renderData(state,plan,health){
    const s=state.snapshot||{},collection=s.collection||{},discovery=s.countDiscovery||{},diagnostic=this.state.connectionDiagnostic||{},errors=[].concat(collection.errors||[],discovery.errors||[]),rejected=diagnostic.reason==='invalid-snapshot'&&C.num(diagnostic.bridgeAt)>=C.num(s.bridgeAt),age=value=>C.num(value)<999?`${C.num(value)}초 전`:'없음',specials=Object.entries(C.SPECIAL_IDS).map(([id,name])=>`<label><span>${C.esc(name)}</span><input data-count="${id}" type="number" min="0" value="${C.num(state.counts[id])}"></label>`).join('');
    const detail={helperId:s.helperId,adapterId:s.adapterId,sourceUrl:s.url,sessionId:s.sessionId,seq:s.seq,dataHash:s.dataHash,observationKey:s.observationKey,collection:{found:collection.found,confidence:collection.confidence,errors},countDiscovery:{found:discovery.found,parsed:discovery.parsed,total:s.unitCount,coverage:C.num(s.unitCount)?Math.round(C.num(discovery.parsed)/C.num(s.unitCount)*100):0,missing:discovery.missing,ambiguous:discovery.ambiguous},wispCountFound:s.wispCountFound,currentAbilitySource:s.currentAbilitySource,latestRejected:rejected?diagnostic:null,progressSample:(s.progressSample||[]).slice(0,8),missingSpecialIds:s.missingSpecialIds||[],localDirect:s.localDirect?Object.assign({},s.localDirect,{enrichAgeSec:C.num(s.localDirect.enrichedFromDomAt)?Math.max(0,Math.floor((Date.now()-C.num(s.localDirect.enrichedFromDomAt))/1000)):null}):null},rejectedHtml=rejected?`<div class="connection-rejected"><b>최신 스캔은 추천에 반영하지 않았습니다</b><span>유닛 ${C.num(diagnostic.unitCount)}개 · 수량 ${C.num(diagnostic.countParsed)}개 · 신뢰 ${Math.round(C.num(diagnostic.confidence)*100)}%</span><small>${C.esc([].concat(diagnostic.errors||[]).slice(0,6).join(' · ')||'수량 누락 또는 모호한 입력을 발견했습니다.')}</small></div>`:'';
    return`<div class="data-page"><section class="ord-panel"><div class="panel-head"><div><h2>연결 진단</h2><p>${C.esc(health.note)}</p></div><button class="primary" data-act="connection">TMO 지금 읽기</button></div>${rejectedHtml}<div class="diag-grid"><div><small>상태</small><b>${C.esc(health.label)}</b></div><div><small>브리지 수신</small><b>${age(health.bridgeAgeSec!=null?health.bridgeAgeSec:health.ageSec)}</b></div><div><small>DOM 스캔</small><b>${age(health.scanAgeSec)}</b></div><div><small>실제 패 변화</small><b>${age(health.dataAgeSec)}</b></div><div><small>도우미</small><b>${C.esc(s.helperId||'대기')} · ${C.esc(s.adapterId||'')}</b></div><div><small>수량 신뢰도</small><b>${Math.round(C.num(collection.confidence)*100)}%</b></div><div><small>유닛 수량</small><b>${C.num(discovery.parsed)}/${C.num(s.unitCount)}개</b></div><div><small>진행도</small><b>${C.num(s.percentCount)}개</b></div><div><small>현재 능력치</small><b>${C.num(s.abilityCount)}개</b></div><div><small>보유</small><b>${C.num(s.nonzero)}개</b></div><div><small>선택 위습</small><b>${s.wispCountFound===true?C.num(s.wispCount):'미확인'}</b></div><div><small>수집 경고</small><b>${errors.length}개</b></div></div><pre>${C.esc(JSON.stringify(detail,null,2))}</pre></section>${this.renderV199LocalProbe()}<section class="ord-panel"><div class="panel-head"><div><h2>특수재료 수동 보정</h2><p>자동 수집이 틀릴 때만 값을 고정하세요.</p></div></div><div class="manual-grid">${specials}</div><button class="ghost" data-act="clear-overrides">수동 보정 모두 해제</button><button class="ghost danger-text" data-act="clear-data">앱 설정만 초기화 · 진행 기록 보존</button></section></div>`;
  }
  // v17.8(사용자 요청 6): 이 유닛을 레시피 트리에 소비하는 상위 목록.
  // 완성도 높은 순 — "이걸 만들면 어느 상위로 이어지나"를 바로 보여준다.
  v151UpperPathsFor(state,unit){
    if(!unit||C.isUpper(unit))return[];
    const db=state.db,out=[];
    const usesIn=targetId=>{
      let uses=0;
      const walk=(id,mul,path)=>{
        if(id===unit.id){uses+=mul;return;}
        const node=db.byId.get(id);
        if(!node||path.has(id))return;
        const next=new Set(path);next.add(id);
        for(const s of node.stuffs||[])walk(s.id,mul*Math.max(1,C.num(s.count)),next);
      };
      walk(targetId,1,new Set());
      return uses;
    };
    for(const upperUnit of db.uppers){
      const uses=usesIn(upperUnit.id);
      if(uses<=0)continue;
      const missingRares=this.v151MissingRares(state,upperUnit.id);
      out.push({unit:upperUnit,uses,completion:C.num(C.completionPercent(state,upperUnit)),missingShort:missingRares.reduce((sum,row)=>sum+row.short,0),missingRares:missingRares.slice(0,3)});
    }
    return out.sort((a,b)=>b.completion-a.completion||a.missingShort-b.missingShort||C.nameOf(a.unit).localeCompare(C.nameOf(b.unit),'ko')).slice(0,8);
  }
  // v19.3(사용자 요청): 상위 저격 모달 — 카탈로그의 모든 상위를 검색해
  // 순위와 무관하게 강제 확정한다.  현재 계통 우선으로 묶어 보여주되
  // 반대 계통도 숨기지 않는다(저격하면 계통이 따라 바뀐다).
  renderSnipeModal(state){
    if(!this._snipeOpen||!state||!state.db)return'';
    const search=String(this.state.snipeSearch||'').trim().toLowerCase();
    const locked=this.upperLock(),lockedKey=locked?C.canonicalUpperId(locked.id):'';
    // v22.4(사용자: "상위 저격에도 %가 있어서 당장 뭐가 저격하기 좋은지도
    // 알고 싶어"): 데스크톱에서 항상 0인 TMO %(completionPercent) 대신
    // 코치 정확 원장 완성도(ledgerCompletion)로 % 를 계산·표시한다.
    const rows=(state.db.uppers||[])
      .filter(unit=>!search||displayNameOf(unit).toLowerCase().includes(search)||String(unit.name||'').toLowerCase().includes(search))
      .map(unit=>{const lc=this.v224Completion(state,unit);return{unit,family:C.familyOf(unit),tier:C.upperPowerTier?C.upperPowerTier(unit,state.db):{known:false,rank:-1,letter:''},pct:lc?C.num(lc.percent):0,owned:!!(lc&&lc.owned)};})
      .sort((a,b)=>C.num(b.tier.rank)-C.num(a.tier.rank)||C.num(b.pct)-C.num(a.pct)||displayNameOf(a.unit).localeCompare(displayNameOf(b.unit),'ko'));
    // "당장 뭐가 좋은지" 한눈에 — 미보유 상위 중 완성도 상위 3 (티어 무관).
    const top3=rows.filter(row=>!row.owned&&!(lockedKey&&C.canonicalUpperId(row.unit.id)===lockedKey)).slice().sort((a,b)=>b.pct-a.pct||C.num(b.tier.rank)-C.num(a.tier.rank)).slice(0,3);
    const topStrip=top3.length?`<div class="v224-snipe-top"><small>지금 가까운 저격 TOP ${top3.length} · 코치 계산 완성도</small>${top3.map(row=>`<button data-act="snipe-upper" data-id="${C.esc(row.unit.id)}"><img src="${C.esc(row.unit.image||'')}" alt="" loading="lazy"><b>${C.esc(displayNameOf(row.unit))}</b><i>${row.pct}%${row.tier.known?` · ${C.esc(row.tier.letter)}티어`:''}</i></button>`).join('')}</div>`:'';
    const groups=[['physical','물딜 상위'],['magic','마딜 상위'],['neutral','중립']].map(([key,label])=>{
      const members=rows.filter(row=>row.family===key);
      if(!members.length)return'';
      return`<em class="snipe-group">${label} · ${members.length}</em>${members.map(row=>{
        const current=lockedKey&&C.canonicalUpperId(row.unit.id)===lockedKey;
        return`<article class="${current?'current':''}"><img src="${C.esc(row.unit.image||'')}" alt="" loading="lazy"><span><b>${C.esc(displayNameOf(row.unit))}<em class="v224-pct ${row.owned||row.pct>=100?'done':row.pct>=70?'near':''}">${row.owned?'보유':`${row.pct}%`}</em></b><small>${row.tier.known?`${C.esc(row.tier.letter)}티어`:'티어 미상'}</small>${playbookHtml(row.unit,{compact:true,maxPairs:0})}</span><span>${current?'<i class="snipe-now">현재 확정</i>':`<button data-act="detail" data-id="${C.esc(row.unit.id)}">상세</button><button class="primary" data-act="snipe-upper" data-id="${C.esc(row.unit.id)}">저격 확정</button>`}</span></article>`;
      }).join('')}`;
    }).join('');
    return`<div class="modal-back" data-act="snipe-close"><article class="detail-modal snipe-modal" role="dialog" aria-modal="true" aria-label="상위 저격"><button class="modal-x" data-act="snipe-close" aria-label="닫기">×</button><header><div><h2>상위 저격</h2><p>순위와 무관하게 원하는 상위로 강제 확정합니다. 25라 전에도 가능하며, 확정 즉시 그 상위의 트리 재료를 보호하고 최우선으로 준비합니다.</p></div></header><div class="snipe-search"><input data-live-opt="snipeSearch" value="${C.esc(this.state.snipeSearch||'')}" placeholder="상위 이름 검색 (예: 브룩)"><button class="primary" data-act="snipe-search">검색</button></div>${topStrip}<div class="snipe-list">${groups||'<div class="empty">검색 결과 없음</div>'}</div></article></div>`;
  }
  renderDetail(state,plan){
    const id=this.state.detailId;if(!id)return'';const u=state.db.byId.get(id);if(!u)return'';const linked=plan.actions.concat(plan.watch||[],plan.prep||[],plan.rows||[]).find(x=>x.unit.id===id),inspected=linked||C.candidateRow(state,u,{mode:plan.mode,spec:plan.spec,deficits:plan.deficits,settings:plan.settings||{},round:plan.round||1,purpose:plan.purpose,upper:plan.upper,stock:plan.reserved&&plan.reserved.stock||state.counts,ruleCounts:plan.reserved&&plan.reserved.stock||state.counts,availableWisp:plan.availableWisp,synergyMemo:global.ORD_SYNERGY_MEMO,costBasis:plan.reserved&&plan.reserved.reservedWispCost?'protected':'current'}),solve=inspected.solve,available=inspected.availableWisp,wisp=this.wispDisplay(state,inspected),role=C.roleProfile(u),sourceStory=inspected.story||C.storyGrade(u),story=C.storyLeagueGrade&&C.storyLeagueGrade(u,sourceStory)||sourceStory,facts=C.skillFacts?C.skillFacts(u):{always:[],trigger:[],research:[],researchVariants:[],penalties:[],mechanics:[]},status=inspected.blocked&&inspected.blocked.length?inspected.blocked.join(' · '):(solve.wispCost<=available?'지금 제작 가능':`선위 ${solve.wispCost-available}개 부족`),direct=solve.direct.map(x=>`<div><span>${C.esc(C.materialName(state.db,x.id))}</span><b>${x.owned}/${x.count}</b></div>`).join('')||'<small>직접 재료 없음</small>',command=this.commandInfo(u),impact=(inspected.impact&&inspected.impact.rows||[]).filter(x=>Math.abs(C.num(x.delta))>.005||x.closed||x.regressed),impactHtml=impact.map(x=>`<div class="${x.regressed?'bad':x.closed?'good':'warn'}"><span>${C.esc(x.label)}</span><b>${fmt(x.before)} → ${fmt(x.after)}</b><small>${x.closed?'조건 충족':x.regressed?'재료 소모로 감소':`목표 ${fmt(x.target)}`}</small></div>`).join(''),why=inspected.why||{},factHtml=(facts.always||[]).map(x=>`<span class="always">${C.esc(x.label)} <b>${x.key==='stun'?fmtStun(x.value):fmt(x.value)}</b></span>`).concat((facts.trigger||[]).map(x=>`<span class="trigger">${C.esc(x.label)} <b>${fmt(x.value)}</b></span>`),(facts.research||[]).map(x=>`<span class="research">${C.esc(x.label)} <b>${fmtStun(x.value)} · ${fmt(x.capture)}%</b></span>`),(facts.researchVariants||[]).map(x=>`<span class="research condition ${x.active?'active':''}">${C.esc(x.label)} <b>${fmtStun(x.value)} · ${fmt(x.capture)}%${x.active?' · 적용 중':''}</b></span>`),(facts.penalties||[]).map(x=>`<span class="penalty">${C.esc(x.label)} <b>${fmt(x.value)}</b></span>`),(facts.mechanics||[]).map(x=>`<span class="mechanic">${C.esc(x.label)}</span>`)).join('');
    return`<div class="modal-back" data-act="close-detail"><article class="detail-modal" role="dialog" aria-modal="true" aria-label="${C.esc(displayNameOf(u))} 상세"><button class="modal-x" data-act="close-detail" aria-label="닫기">×</button><header><img src="${C.esc(u.image||'')}" alt=""><div><h2>${C.esc(displayNameOf(u))}${this.v216BargesTag(u)}</h2><p>${C.esc(tierLabel(u))}</p>${storyBadge(u,story)}</div></header><div class="detail-hero"><div><small>${C.esc(wisp.basisLabel)} 필요 선택위습</small><b>${wisp.planned}</b><span>가용 ${wisp.available} · 제작 후 ${wisp.after}${wisp.different?` · 현재 패 단독 ${wisp.current}`:''}</span></div><div><small>판정</small><b>${C.esc(status)}</b><span>${C.esc(C.summarizeRoles({role},plan.mode))}</span></div>${(()=>{const lc=this.v224Completion(state,u);if(!lc)return'';return`<div><small>코치 계산 완성도</small><b>${lc.owned?'보유':`${lc.percent}%`}</b><span>${lc.owned?'이미 보유한 유닛':`흔함 환산 ${lc.needTotal-lc.needRemain}/${lc.needTotal} 확보${C.num(lc.wispCost)>0?` · 남은 선위 ${C.num(lc.wispCost)}`:''}`}</span></div>`;})()}<div class="story-detail"><small>스토리 등급 · ${C.esc(story.basisLabel)}</small><b>${C.esc(story.label)}</b><span>${C.esc(story.note)}</span></div><div class="detail-command"><small>조합 명령어</small><span><i>한글</i><b>${C.esc(command.koreanDisplay)}</b></span><span><i>English</i><b>${C.esc(command.englishDisplay)}</b></span>${command.inherited?`<em>원형 ${C.esc(command.sourceName)} 최초 제작 명령</em>`:''}</div></div><section class="why-detail"><h3>왜 이 유닛을 만드나</h3><p>${C.esc(why.headline||'제작 후 순증 스펙과 재료 효율을 확인하세요.')}</p>${impactHtml?`<div class="impact-grid">${impactHtml}</div>`:'<small>현재 클리어 조건의 직접 순증이 없습니다.</small>'}${why.alternative?`<div class="cheaper-alt">더 싼 대안: <b>${C.esc(displayNameOf(why.alternative.unit))}</b> · 선위 ${why.alternative.wispCost}</div>`:''}${why.tradeoffs&&why.tradeoffs.length?`<div class="trade-warning">소모 재료 영향: ${C.esc(why.tradeoffs.join(' · '))}</div>`:''}</section>${(()=>{
      const entry=upperPlaybookOf(u);if(!entry)return'';
      return`<section class="playbook-detail"><h3>전수 메모 플레이북 <small>표시 전용 · 엔진 점수에는 미반영</small></h3><p>${C.esc(entry.summary||'')}</p>${entry.use?`<p class="use">활용 · ${C.esc(entry.use)}</p>`:''}${entry.pairs&&entry.pairs.length?`<div class="pairs"><b>같이 쓰면 좋은 유닛</b>${entry.pairs.map(name=>`<span>${C.esc(name)}</span>`).join('')}</div>`:''}</section>`;
    })()}<section><h3>실제 스킬 · 상시/발동 분리</h3><div class="detail-facts">${factHtml||'<span>표시할 수치 역할 없음</span>'}</div></section>${(()=>{
      // v17.1: 맵 파싱 정규화 스킬 프로필 (킬 판정 금지 — 표시 전용).
      const profile=C.upperSkillProfile?C.upperSkillProfile(u):null;
      if(!profile||!profile.skills||!profile.skills.length)return'';
      const trigLabel=s=>{const map={attack_proc:s.p!=null?`공격 시 ${Math.round(s.p*1000)/10}%`:'공격 시 확률',passive_each_attack:'매 타격',on_nth_attack:`매 ${C.num(s.n1)||'N'}타`,periodic:`${C.num(s.iv)||'?'}초마다`,manual_cast:'수동 시전',resource_threshold:'자원 조건',on_parent_skill:'연계 발동',on_nth_parent_skill:`연계 ${C.num(s.n1)||'N'}회마다`,chance_proc_unknown_event:'확률 발동',attack_after_interval:'간격 후 공격',on_kill:'처치 시',on_skill_cast:'스킬 시전 시',on_damaged:'피격 시',unresolved_trigger:'트리거 미해석'};return map[s.t]||s.t;};
      const fxLabel={stun:'스턴',slow:'이감',resource_change:'자원',transform:'변신',attack_speed_modifier:'공속',attack_power_modifier:'공증',summon:'소환',cooldown:'쿨다운',stack_change:'스택',armor_break:'암브',armor_reduction:'방깎',teleport:'이동',aura:'오라',damage_amplification:'증폭'};
      const koNum=value=>{value=C.num(value);if(value>=1e8)return`${(Math.round(value/1e6)/100).toFixed(2).replace(/\.?0+$/,'')}억`;if(value>=1e4)return`${Math.round(value/1e4)}만`;return String(Math.round(value));};
      const rows=profile.skills.map(s=>`<div><b>${C.esc(s.n)}</b><span>${C.esc(trigLabel(s))}${s.d?` · ${koNum(s.d)} ${s.dc==='magic'?'마법':s.dc==='physical'?'물리':''} 데미지`:''}${s.fx&&s.fx.length?` · ${s.fx.map(key=>fxLabel[key]||key).join('·')}`:''}</span></div>`).join('');
      return`<section><h3>정규화 스킬 프로필 <small>맵 파싱 ${profile.skills.length}종 · 킬 판정은 AST 정규화 후 활성화</small></h3><div class="detail-skill-profile">${rows}</div></section>`;
    })()}<section><h3>${C.esc(wisp.basisLabel)} 부족 최하위 재료 = 선택위습 ${wisp.planned}</h3><div class="lowest-grid">${Object.keys(solve.lowestMissing||{}).length?Object.entries(solve.lowestMissing).map(([mid,count])=>`<div><i style="background:${C.COMMON_COLORS[C.materialName(state.db,mid)]||'#64748b'}"></i><span>${C.esc(C.materialName(state.db,mid))}</span><b>×${count}</b></div>`).join(''):'<div class="empty">부족한 최하위 재료 없음</div>'}</div></section><section><h3>바로 필요한 조합 재료</h3><div class="direct-grid">${direct}</div></section>${(()=>{
      // v17.8(사용자 요청 6): 중간 재료 나열·계산 검증 대신, 이 유닛이
      // 실제로 이어지는 상위 경로를 보여준다.
      const paths=this.v151UpperPathsFor(state,u);
      if(!paths.length)return C.isUpper(u)?'':'<section><h3>이 유닛으로 갈 수 있는 상위</h3><div class="upper-path-grid"><small>이 유닛을 레시피에 쓰는 상위가 없습니다 — 역할·유틸 목적 유닛입니다.</small></div></section>';
      return`<section><h3>이 유닛으로 갈 수 있는 상위 <small>완성도순 · 최대 8</small></h3><div class="upper-path-grid">${paths.map(row=>`<button data-act="detail" data-id="${C.esc(row.unit.id)}">${row.unit.image?`<img src="${C.esc(row.unit.image)}" alt="">`:''}<span><b>${C.esc(displayNameOf(row.unit))}</b><small>이 유닛 ×${C.num(row.uses)} 사용 · ${row.missingShort?`부족 희귀 ${row.missingShort}장${row.missingRares.length?` (${row.missingRares.map(item=>`${C.esc(item.name)}${item.short>1?`×${item.short}`:''}`).join(' · ')})`:''}`:'희귀 재료 충족'}</small></span></button>`).join('')}</div></section>`;
    })()}<button class="primary close" data-act="close-detail">확인</button></article></div>`;
  }
}

function create(root,catalog,config){return new App(root,catalog,config);}
global.ORDApp={create,App,_test:{readStore,normalizeInitialState,fingerprint,observationKey,transactionSource,directionBoardForMode,routeCandidateReady,normalizeRollback,normalizeTransaction,transactionMatches,transactionSourceMatches,normalizeWatchStability,normalizeUpperDetection,normalizeUpperBlueprint,handTierKey,resolveHandLedger}};
})(window);
