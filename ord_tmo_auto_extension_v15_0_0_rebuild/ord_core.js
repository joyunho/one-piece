(function(global){
'use strict';

const VERSION='24.3.1';
const WISP_ID='810e';
const SUPER_KUMA_ID='unit_1767884940750_9880';
// v17.5: 스토리 10라운드 확정 보상 — 레일리(히든)+해적선 묶음을 다른
// 선택지(초월 쿠마·유니크 아이템·목재/골드 상자)와 맞바꾼다.
const PIRATE_SHIP_ID='unit_1767884925665_1037';
const STORY10_FORFEITS='초월 쿠마 · 유니크 아이템 · 목재/골드 상자';
const MAX_WISP_COST=23;
const PREFERRED_WISP_COST=10;
const WATCH_CANDIDATE_CAP=6;
const POST_LEGEND_ROUTES={CHOICE:'',LEGEND:'legend',UPPER:'upper'};
const SPECIAL_IDS={
  [WISP_ID]:'선택위습',
  'unit_1767884906256_4990':'레일리(히든)',
  'unit_1767884925665_1037':'해적선',
  [SUPER_KUMA_ID]:'초월쿠마',
  'unit_1779016778159_2512':'그린블러드',
  'unit_1767884840242_5227':'랜덤유닛',
  'unit_1767884871133_6843':'토큰',
  'unit_1767884970331_9084':'고대의 배',
  'unit_1761061085749_3333':'메구밍 (전퍼스킬)',
  'unit_1761061295036_310':'옌',
  'unit_1761061550524_6203':'카미조 토우마 (단일스턴·코비 용기의 외침)',
  'unit_1761061102389_3':'센토 이스즈 (바제스)',
  'unit_1767884889420_456':'좀비'
};
const RAYLEIGH_HIDDEN_ID='unit_1767884906256_4990';
const PIRATE_SHIP_MATERIAL_ID='unit_1767884925665_1037';
const COMMON_NAMES=['루피','조로','나미','우솝','상디','쵸파','버기','해군 총병','해군 칼병'];
const COMMON_COLORS={
  '루피':'#ef4444','조로':'#22c55e','나미':'#f97316','우솝':'#eab308','상디':'#3b82f6',
  '쵸파':'#ec4899','버기':'#a855f7','해군 총병':'#64748b','해군 칼병':'#94a3b8'
};
const DISPLAY_NAME_OVERRIDES={
  'L30h':'써니호 (광폭화)',
  'unit_1779017164417_3162':'S-베어 (유틸·끝딜·짤스턴 0.25·마뎀증 4·마방깎 1)',
  'E30h':'코비 (단일·발동 체젠·공증)',
  'X30h':'방주맥심 (발동이감 30·마방깎 10·폭뎀증 10)',
  'unit_1779015610844_6407':'바제스 왜곡 (마딜 단일 1)',
  'unit_1767884840242_5227':'랜덤유닛',
  'unit_1767884871133_6843':'토큰',
  'unit_1767884970331_9084':'고대의 배'
};
// TMO's flag number is an internal shorthand, not a unit tier. Keep the
// calculation name above intact and use these labels only when drawing UI.
// This separation is important: adding "(왜곡)" to nameOf() would change
// role-regex matches and could silently add combat roles.
const UI_NAME_OVERRIDES={
  'G30h':'징베(전설)','S30h':'울티(전설)','F30h':'카르가라(전설)','HA0h':'킹(전설)','MC0h':'히바리(전설)',
  'Q20h':'라분(전설)','U20h':'검은수염(전설)','Z90h':'네코(전설)','R20h':'로브 루치(전설)','Y20h':'루나메(전설)',
  'X20h':'블랙마리아(전설)','430h':'상디(전설)','730h':'슈가(전설)','S20h':'조로(전설)','I30h':'제파(전설)',
  'N30h':'료쿠규(히든)','M30h':'사보(히든)','740h':'피셔타이거(히든)','J30h':'시류(히든)','Z30h':'아카이누(히든)',
  // v19.8.1(사용자 규칙): 블마 왜곡은 W 폼 3형태(스턴/이감40/데미지) 배타 —
  // 코칭은 이감폼 기준(스턴 0).  라벨로 폼 전제를 밝힌다.
  'J70h':'캐럿(변화)','unit_1752903381904_1445':'블랙마리아(왜곡·이감폼 기준)','V30h':'코알라(왜곡)','IC0h':'퀸(왜곡)',
  '840h':'페로나(왜곡)','unit_1779015610844_6407':'바제스(왜곡)','U30h':'레드포스호(해적선)',
  // Same-name high-tier pairs without a flag number are qualified as well.
  '720h':'슈가(희귀)','O20h':'에이스(전설)','unit_1779015467592_9245':'에이스(왜곡)','L70h':'캐럿(히든)'
};
const FAMILY_OVERRIDES={
  'S50h':'magic','W50h':'physical','KC0h':'magic','unit_1752903381904_1445':'physical',
  'V30h':'neutral','IC0h':'physical','840h':'magic','unit_1779015467592_9245':'physical','R30h':'magic'
};
const BOSS_ROUNDS=new Set([10,20,30,40,50,55,60,65,70,75]);

const ABILITY_ALIASES={
  '이동 속도 감소':'이동속도 감소','발동 이동속도 감소':'발동이동속도 감소','발동이속도 감소':'발동이동속도 감소',
  '단일 이동속도 감소':'단일이동속도 감소','단일이속도 감소':'단일이동속도 감소',
  '방어력감소':'방어력 감소','발동방어력감소':'발동방어력 감소','단일방어력감소':'단일방어력 감소','중첩방어력감소':'중첩방어력 감소',
  '보스잡기':'보스 잡기','마법방어력 감소':'마법 방어력 감소','마법데미지 증가':'마법 대미지 증가',
  '폭발형 데미지 증폭':'폭발형 대미지 증폭','범위끝딜':'범위 끝딜','모든대미지증가':'모든피해증가',
  // v23.0(카탈로그 2312 어휘 이행): tmo 카탈로그가 '대미지'→'데미지'로
  // 표기를 바꾸고 마뎀증 키를 '마법데미지 증폭'으로 개명했다.  라이브 TMO
  // 페이로드도 같은 어휘를 실어올 수 있으므로 별칭으로 흡수한다.
  '마법데미지 증폭':'마법 대미지 증가','단일마법 데미지 증가':'단일마법 대미지 증가',
  '범위 잃은 체력 퍼센트 데미지':'범위 잃은 체력 퍼센트 대미지',
  '범위 전체 체력 퍼센트 데미지':'범위 전체 체력 퍼센트 대미지',
  '범위 현재 체력 퍼센트 데미지':'범위 현재 체력 퍼센트 대미지'
};

// v16.9: 2.305 [C] 맵 파싱 검증값 반영 —
//  이감 102 = 풀이감 기준, 117 = 나스쥬로(적 이속 +15%) 상쇄 조건부 목표.
//  방깎 180 = 실전선, 211 = 공개 공략 풀방깎 목표(워큐리는 몹 방어 +10).
//  스턴 0.7 = 하드 최소, 1.0 = 운용선, 1.5 = 안정선, 2.0+ = 과투자 주의.
// v20.0(2.310 패치노트 tmo.gg/ko/posts/39095 판독): 악몽 워큐리 몹 방어
//  10→15 · 마법방어 10%→15% — 워큐리 방깎 목표 190/221→195/226.
//  (마법방어 15%는 별도 모델 없음 — 마방깎은 유닛 능력 파싱만.)
//  나스쥬로 이속 15%는 유지라 이감 117 목표 불변.
// v22.12(웹 정본 확보 — 공식 누적 패치노트 dcinside ordc1 no=189308 +
// 2.312 카탈로그 api.tmo.gg/posts/41824), v24.3.1(맵 원본 war3map.j
// 9345-9438 IS==6 분기로 재검증 — 맵데이터_분석_20260811.txt):
// 오로성 악몽 저주 수치 원문.
//  · 나스쥬로: 적 이속 +15% · 아군 공속 -15% · 라인몬스터 체력 +1,500만
//    → 손튜닝이던 이감 117 이 정확히 102×1.15 로 정본 검증됐다.
//  · 워큐리: 방어력 +15(고정) · 마법방어력 +15%(퍼센트) · 보스 체력
//    +1,500만 — 맵 원문으로 마방이 고정치가 아니라 % 임이 확정됐다
//    (tmo 카탈로그 표기가 고정치처럼 보였던 것).  물리 방깎 +15
//    (armorSoft 195/armorSafe 226) 보정은 그대로, 마딜은 마방깎(%)
//    가치가 그만큼 오른다(목표 축은 없어 표시로 안내).
//  · 새턴: 아군 공격력 -30% · 폭발형 데미지 -10% · 적 체력재생 +30만/초
//    → 스펙표 밖 저주(화력 -30%).  2.310 방무뎀→폭발형 일괄 전환과 겹쳐
//    폭뎀증 의존 조합은 이중으로 불리하다.  실측 클리어 스펙 분포는
//    불변(v22.11 분석)이라 목표 수치는 유지하고 저주를 화면에 밝힌다.
//  · 공통(악몽): 적 체력 +1,000만 · 체력재생 +50만/초(2.310에서 30→50만
//    상향 — "전체 난이도 상승" 체감의 근원).
const GOROSEI_COMMON_CURSE='공통(악몽): 적 체력 +1,000만 · 체력재생 +50만/초';
const GOROSEI={
  none:{key:'none',name:'아직 모름',slowPhysical:102,slowMagic:102,armorSoft:180,armorSafe:211,stun:1.5,curse:''},
  nasjuro:{key:'nasjuro',name:'나스쥬로',slowPhysical:117,slowMagic:117,armorSoft:180,armorSafe:211,stun:1.5,curse:'적 이속 +15% · 아군 공속 -15% · 라인몬 체력 +1,500만 — 이감 117(=102×1.15)로 보정 중'},
  warcury:{key:'warcury',name:'워큐리',slowPhysical:102,slowMagic:102,armorSoft:195,armorSafe:226,stun:1.5,curse:'방어력 +15 · 마법방어력 +15% · 보스 체력 +1,500만 — 방깎 +15(195/226)로 보정 중, 마딜은 마방깎(%) 가치 상승'},
  saturn:{key:'saturn',name:'새턴',slowPhysical:102,slowMagic:102,armorSoft:180,armorSafe:211,stun:1.5,curse:'아군 공격력 -30% · 폭발형 데미지 -10% · 적 체젠 +30만/초 — 화력 저주: 보스 화력 판정에 산입(DPS 요구 +43%). 폭뎀증 의존 조합은 이중 불리, 라인딜·지속딜을 여유 있게'}
};
// v23.0(맵 원본 확정 — war3map.j 48457-48466·41700-41743·32723-32758·
// 64775-64781·64743-64749·62804, 맵데이터_분석_20260811.txt ③):
// 희귀 리롤은 고정 2회가 아니라 항법 의존이다.
//   기본 2회 · 1회당 목재 2.  도박광 기본효과 +1(단, 연속베팅을 고르면
//   기본효과 비활성), 카지노 +1, 리스크헷지 +2(그리고 리롤 목재 0).
//   패왕의길은 최상위 1기만 조합 가능, 계엄령은 최상위 조합 불가 —
//   상위 상한은 전역 규칙이 아니라 항법에서만 온다(트리플·콰트로 퀘스트
//   코드 실존).  코치의 '상위 2기' 계획은 코치 정책이지 게임 규칙이 아님.
// v23.3(사용자 지시 0817): "당분간은 마딜 1상위 단끝딜 추천하지 말아봐" —
// 0816(타시기)·0817(아카이누) 두 판 연속 단끝 경로 전멸(검증 단끝이 끝까지
// 안 닫힘).  true 인 동안 자동 판정·후보 차선·플래너 기본이 단끝을 뽑지
// 않는다.  명시 선택(magicRoute==='singleEnd')과 패왕의길·계엄령(2상위
// 불가) 강제는 그대로 존중.  해제 = 이 값만 false 로.
const MAGIC_SINGLE_END_SUSPENDED=true;
const NAVIGATION={
  none:{key:'none',name:'항법 미선택',perks:[]},
  union:{key:'union',name:'연합세력',perks:[['ilseok','일석이조'],['recall','긴급소집'],['trait','특성공학']]},
  conqueror:{key:'conqueror',name:'패왕의길',perks:[['martial','계엄령'],['bounty','바운티헌터'],['royal','로얄로더']]},
  gambler:{key:'gambler',name:'도박광',perks:[['casino','카지노'],['hedge','리스크헷지'],['betting','연속베팅']]},
  help:{key:'help',name:'최고의도움',perks:[['maxout','최대출력'],['alchemy','연금술'],['reverse','역발상']]}
};
function navProfile(family,perk){
  const fam=NAVIGATION[family]?String(family):'none';
  const perkKey=(NAVIGATION[fam].perks||[]).some(([k])=>k===perk)?String(perk):'';
  let rerollMax=2,rerollWood=2,upperCap=null;
  if(fam==='gambler'){
    if(perkKey!=='betting')rerollMax+=1;
    if(perkKey==='casino')rerollMax+=1;
    if(perkKey==='hedge'){rerollMax+=2;rerollWood=0;}
  }
  if(fam==='conqueror')upperCap=perkKey==='martial'?0:1;
  // v23.5(사용자 규칙 0818): 특강(특별 강화)은 판당 상위 1기만 받는다 —
  // 연합세력·특성공학만 2기 특강을 연다.
  const specialTrainingSlots=fam==='union'&&perkKey==='trait'?2:1;
  // v23.6(사용자 지시 0818 "리스크헷지 기준으로 리롤 추천 더 적극적으로"):
  // 리롤이 싸고 많은 항법(리스크헷지 목재 0 · 카지노 4회)은 적극 리롤
  // 모드 — 원장 개방 라운드를 당기고 막판 미소진을 독촉한다.
  const aggressiveReroll=rerollWood===0||rerollMax>=4;
  const notes=[];
  if(rerollMax!==2)notes.push(`희귀 리롤 ${rerollMax}회`);
  if(rerollWood===0)notes.push('리롤 목재 0');
  if(upperCap===1)notes.push('최상위 1기만 조합 가능(패왕의길)');
  if(upperCap===0)notes.push('최상위 조합 불가(계엄령) — 상위 계획 재검토');
  if(specialTrainingSlots>=2)notes.push('특강 2기 가능(특성공학)');
  if(aggressiveReroll)notes.push('적극 리롤 권장 모드');
  return{family:fam,perk:perkKey,rerollMax,rerollWood,upperCap,specialTrainingSlots,aggressiveReroll,notes};
}

// v23.8(사용자 실측 0819): "상위 중에 스택이 있어서 빨리 올려야 하는
// 상위가 있어.  라운드 몹을 잡으면서 스택을 쌓으면 더 강해지거든 —
// 시라호시 초월, 료쿠규 초월, 빅맘 등."  스택형 상위는 제작이 늦을수록
// 쌓을 라운드가 줄어 손해다.  목록은 사용자 지정(정본 desc 에 스택
// 표기가 없어 코드가 유일 원천) — 추가 발견 시 canonical ID 만 더한다.
// v23.9 추가(사용자 0819): 류마 상위(영원 [마딜]) — 정본 desc '성장형
// 딜러라서 빨리 뽑아야 좋음'과 합치.  "더 있긴 한데 기억이 안 나네" —
// 이름이 확인되는 대로 여기에 더한다.
const STACK_RAMP_UPPER_IDS=new Set(['U80H','LB0H','Q40h','JC0h']);
function isStackRampUpper(u){return !!(u&&STACK_RAMP_UPPER_IDS.has(String(canonicalUpperId(u.id))));}

// v23.5(사용자 규칙 0818): "상위를 2개 이상 가면 특강을 한 명밖에 못 해주
// 거든? 근데 상위 중에서 특강이 중요한 게 있고 별 차이 없는 게 있어서
// 특성공학이라는 항법을 먹으면 둘 다 올릴 수 있긴 한데, 별 차이 없는
// 상위가 있으면 다른 항법 먹어서 기대값 올리는 게 더 나으니까."
//
// 특강 의존도는 카탈로그 desc 의 정본 표기에서 구조화한다: '▷/▶ 특강(필수)'
// = required, '(애매)' = marginal, 그 외 특강 정의줄 = listed, 정의줄 없음 =
// none (파트너 언급 속 '특강x' 는 정의줄이 아니므로 none — 카이도 케이스).
// '※ … 특강 안 함/특강X' 류 조건부 단서는 note 로 원문 그대로 실어,
// 시키(물딜만 필수)·로우(폭뎀 조합이면 X) 같은 뉘앙스를 화면이 전한다.
// 조언 전용 — 게이트·목표·항법 자동 변경 없음(항법은 사용자가 설정).
function specialTrainingProfile(u){
  const desc=String(u&&u.desc||'');
  const lines=desc.split('\n').map(line=>line.trim()).filter(line=>line.includes('특강'));
  const defLine=lines.find(line=>/[▷▶]\s*특강/.test(line))||'';
  if(!defLine)return{grade:'none',label:'특강 정보 없음',note:''};
  const grade=/특강\s*\(필수\)/.test(defLine)?'required':/특강\s*\(애매\)/.test(defLine)?'marginal':'listed';
  const conds=lines.filter(line=>line!==defLine&&/특강\s*(안|않|[Xx×])|특강[Xx×]/.test(line));
  const note=[defLine].concat(conds.slice(0,2)).map(line=>line.replace(/^[▷▶※]\s*/,'')).join(' / ').slice(0,160);
  return{grade,label:grade==='required'?'특강 필수':grade==='marginal'?'특강 애매':'특강 있음',note};
}
function specialTrainingAdvice(main,second,settings){
  if(!main||!second)return null;
  const nav=navProfile(settings&&settings.navFamily,settings&&settings.navPerk);
  const slots=nav.specialTrainingSlots;
  const shortName=u=>String(nameOf(u)).replace(/\s*\(.*$/,'').trim();
  const a={unit:main,p:specialTrainingProfile(main)},b={unit:second,p:specialTrainingProfile(second)};
  const heavy=[a,b].filter(item=>item.p.grade==='required');
  const rank={required:3,listed:2,marginal:1,none:0};
  const target=rank[a.p.grade]>=rank[b.p.grade]?a:b;
  let kind,text;
  if(heavy.length>=2){
    kind='dual-required';
    text=slots>=2
      ?'두 상위 모두 특강 의존이 큽니다 — 특성공학이 켜져 있으니 둘 다 특강하세요.'
      :'두 상위 모두 특강 의존이 큽니다. 특강은 판당 1기뿐 — 연합세력·특성공학 항법이면 둘 다 특강할 수 있습니다.';
  }else if(heavy.length===1){
    kind='single-required';
    const other=heavy[0]===a?b:a;
    text=slots>=2
      ?`특강 의존은 ${shortName(heavy[0].unit)} 쪽만 큽니다 — ${shortName(other.unit)}는 특강 영향이 작아, 특성공학 대신 다른 항법으로 기대값을 올리는 선택과 비교해 보세요.`
      :`특강은 ${shortName(heavy[0].unit)}에게 주세요(필수). ${shortName(other.unit)}는 특강 영향이 작습니다 — 특성공학 없이 다른 항법으로 기대값을 올리는 편이 낫습니다.`;
  }else{
    kind='none-required';
    text=slots>=2
      ?'두 상위 모두 특강 필수는 아닙니다 — 특성공학 대신 다른 항법 기대값이 나을 수 있습니다.'
      :`특강 필수 상위가 없습니다 — 특강은 효과가 더 큰 ${shortName(target.unit)} 한 기에만 주고, 항법은 특성공학 없이 기대값을 올리세요.`;
  }
  return{kind,slots,targetId:String(target.unit.id),targetName:shortName(target.unit),main:{id:String(main.id),grade:a.p.grade,label:a.p.label,note:a.p.note},second:{id:String(second.id),grade:b.p.grade,label:b.p.label,note:b.p.note},text};
}

// v19.9.8(사용자 실측): "아오키지 원스턴은 불가능한듯, 적어도 0.7은 잡혀야
// 스턴이 잡히는 느낌 — 이것도 최소라 새긴 하는데."  0802 판이 스턴
// 0.51~0.61 로 단끝에서 새서 죽은 데 이어, 하드 최소선 자체를 0.5→0.7 로
// 올린다.  0.7 도 '조금은 새는' 실측 최소선이고 완성 목표는 그대로 1.5 다.
const STUN_BASE_FLOOR=.7;
// v23.1(#60 — 사용자 구상 3, v22.11 실측 지지): 광보잡은 정수 기수가
// 아니라 소수 인분이다.  대표 물딜 광보잡: 킬러 1인분(기본) · 히바리
// 0.5인분(보스 특화 + 광폭 반인분) · 레드포스호 1인분 · 초월 우솝 2인분.
// 표에 없는 광보잡(보스·광폭 둘 다 가능)은 1인분.  히바리처럼 표에 있는
// 유닛은 한쪽 판정만 있어도 표 가중치로 광보잡 인분을 받는다.
const BOSS_FRENZY_WEIGHTS=Object.freeze({'MC0h':.5,'B90H':2});
function bossFrenzyCredit(u,bossCredit){
  const w=BOSS_FRENZY_WEIGHTS[u&&u.id];
  if(w!=null)return bossCredit.boss||bossCredit.frenzy?w:0;
  return bossCredit.boss&&bossCredit.frenzy?1:0;
}
const CONTROL_ENVELOPE={
  stableStun:1.5,
  slowFloorRatio:.88,
  physicalOperationalStun:1,
  // 물딜은 사용자가 정한 실전 우선순위대로 최소 스턴(STUN_BASE_FLOOR)을
  // 하드 최소선으로 인정합니다. 1.0이 운용선, 1.5는 편안한 안정선입니다.
  physicalExpertStun:STUN_BASE_FLOOR,
  magicOperationalStun:1,
  efficientStunCap:1.5,
  triggerSafeWeightOne:.5,
  triggerSafeWeightMulti:.65,
  triggerExpectedWeightOne:.75,
  triggerExpectedWeightMulti:.85
};
const CONTROL_PROFILES={
  physical:{
    operational:{slow:1,stun:1,expertStun:STUN_BASE_FLOOR},
    stable:{slow:1,stun:1.5},
    conditional:{slow:.88,stun:1.5}
  },
  magic:{
    operational:{slow:1,stun:1},
    stable:{slow:1,stun:1.5},
    conditional:{slow:.88,stun:1.5}
  }
};
// v16.9: 2.305 [C] 맵 스크립트 파싱 확정값 (사용자 검증 제공).
//  보스 HP 오로성 보정과 재생은 신세계(51라 이후) 보스에만 적용.
//  광폭몹은 51라 이후 비보스 라운드 시작 7.5초에 플레이어당 1마리.
const BOSS_META={
  bossRounds:[10,20,30,40,50,55,60,65],
  rounds:{
    10:{boss:'아론',hp:137750},
    20:{boss:'크로커다일',hp:807500},
    30:{boss:'에넬',hp:7125000},
    40:{boss:'루치',hp:27550000},
    50:{boss:'센고쿠',hp:197600000},
    55:{boss:'도플라밍고',hp:116821500},
    60:{boss:'빅 맘',hp:121125000},
    65:{boss:'카이도',hp:129152500}
  },
  // 보스 방어 (2.305 [C] 파싱 확정, 50라 이후만 확보).
  bossArmor:{50:350,55:360,60:372,65:395},
  // v20.0(2.310): 오로성 체력 증가 대상이 서로 교체됐다 — 나스쥬로
  // 보스 1500만→라인몹 1500만, 워큐리 라인몹 1000만→보스 1500만.
  // 값은 (개별 + 악몽 공통 1000만) 합산 구조 그대로다(2.305 코드값이
  // 패치노트 공통·개별 합과 정확히 일치함을 재검증).  체젠은 공통
  // 30만→50만·새턴 개별 37.5만→30만 — 모든 판에서 체젠 압박 증가:
  // 워큐리·나스쥬로 5만+50만=55만, 새턴 5만+50만+30만=85만.
  goroseiBossHpBonusNewWorld:{warcury:25000000,saturn:10000000,nasjuro:10000000},
  goroseiBossRegenNewWorld:{base:50000,warcury:550000,nasjuro:550000,saturn:850000},
  goroseiMobHpBonusNewWorld:{saturn:10000000,nasjuro:25000000,warcury:10000000},
  goroseiMobArmorBonus:{warcury:15},
  goroseiMobSpeedPct:{nasjuro:15},
  timers:{normal:35,boss:60,prepAfter50:70,newWorld:32},
  mobs:{perRound:35,spawnIntervalSec:.5,frenzyFromRound:51,frenzyAtSec:7.5,countLimitBase:70,countLimitFrom41:50},
  lineCurve:{
    29:{name:'슈라',hp:114560,armor:40,speed:387},
    39:{name:'스팬담 특수몹',hp:1,armor:39,speed:387},
    49:{name:'아카이누',hp:34650000,armor:138,speed:387},
    55:{name:'트레볼',hp:86726200,armor:183,speed:387,newWorld:true},
    60:{name:'제우스',hp:124251000,armor:180,speed:387,newWorld:true},
    65:{name:'오로치',hp:161775800,armor:191,speed:387,newWorld:true}
  }
};
// 다음 보스 라운드의 오로성 반영 HP·재생·제한시간과 "보스 단독 최소 실효
// DPS", 동반(또는 직전) 라인 웨이브를 계산합니다.  실제 전투는 일반몹
// 최대 35마리가 겹치므로 이 DPS는 하한선이지 클리어 보장선이 아닙니다.
function bossPreview(roundNow,goroseiKey){
  const r=Math.max(1,Math.round(num(roundNow)||1)),next=BOSS_META.bossRounds.find(x=>x>=r);
  if(next==null)return null;
  const base=BOSS_META.rounds[next],newWorld=next>50,g=String(goroseiKey||'');
  const hpBonus=newWorld?num(BOSS_META.goroseiBossHpBonusNewWorld[g]||0):0;
  const regen=newWorld?num(BOSS_META.goroseiBossRegenNewWorld[g]!=null?BOSS_META.goroseiBossRegenNewWorld[g]:BOSS_META.goroseiBossRegenNewWorld.base):0;
  const time=newWorld?BOSS_META.timers.newWorld:BOSS_META.timers.boss;
  // v23.1(사용자 승인 — 새턴 화력 저주 산입): 새턴 악몽은 아군 공격력
  // -30%(war3map.j 9400) — 같은 보스를 같은 시간에 잡으려면 원시 DPS
  // 요구가 1/0.7 로 오른다.  준비도 96~98%에서 라인 사망하던 새턴 판의
  // 원인을 이제 보스 화력 판정이 직접 반영한다.  (폭뎀 -10% 는 폭발형
  // 컴포넌트 한정이라 일괄 배수에 넣지 않고 저주 표시가 안내한다.)
  const firepowerRetained=g==='saturn'?.7:1;
  const hp=num(base.hp)+hpBonus,dpsNeed=Math.round((hp+regen*time)/time/firepowerRetained);
  const lineRound=newWorld?next:next-1,lineBase=BOSS_META.lineCurve[lineRound]||null;
  let line=null;
  if(lineBase){
    const mobBonus=lineBase.newWorld?num(BOSS_META.goroseiMobHpBonusNewWorld[g]||0):0;
    line={round:lineRound,name:lineBase.name,hp:num(lineBase.hp)+mobBonus,armor:num(lineBase.armor)+num(BOSS_META.goroseiMobArmorBonus[g]||0),count:BOSS_META.mobs.perRound,withBoss:!!lineBase.newWorld};
  }
  return{round:next,boss:base.boss,hp,hpBonus,regen,time,dpsNeed,firepowerRetained,newWorld,bossArmor:BOSS_META.bossArmor[next]!=null?num(BOSS_META.bossArmor[next]):null,line};
}
// v17: 2.305는 워크3 기본 방어계수 0.06을 0.02로 바꿨다(맵 상수 확정).
// 방깎으로 방어가 음수까지 내려가며 실제로 피해가 증폭된다 —
// 방깎을 211 등으로 clamp하면 안 된다.
const DEFENSE_ARMOR=0.02;
function armorMultiplier(effectiveArmor){
  const armor=num(effectiveArmor);
  return armor>=0?1/(1+DEFENSE_ARMOR*armor):2-Math.pow(1-DEFENSE_ARMOR,-armor);
}
// 보스 상성: 관통 1.25 · 일반 1 · 공성 0.75 · 패기(hero) 1.05.
// DAMAGE_TYPE_UNIVERSAL 스킬은 수치 방어를 무시하므로 이 표는 평타 전용.
const ATTACK_TYPE_VS_BOSS={pierce:1.25,normal:1,siege:.75,hero:1.05};
// v17.8: 아머브레이크(암브) — 맵 확정 메커니즘. 스킬·평타가 적에게
// "N의 아머브레이크"를 부여하고 대상당 최대 75까지 중첩되며, 중첩 1은
// 방어력 1 감소와 같다(내가중수 툴팁: "아머브레이크로 깎인 방어력
// 감소량 만큼 … 1%씩"). 스택 도달 속도는 공격 빈도에 달려 있어 측정
// 하지 않는다 — 대신 소스 가중치 합 w의 보스전 정착 추정
// 75×(1−0.5^w)를 쓰는 보수 모델을 명시한다(가중 1≈38, 2≈56, 3≈66).
// 이 환산은 표시·필요 DPS 참고 계산에만 쓰고, 제작 하드 게이트의
// 정적 방깎 목표는 낮추지 않는다(암브 유닛이 묶이거나 죽으면 사라지는
// 조건부 자원이기 때문).
// v17.11: 위습 수입 예측 — 두 스트림을 구분한다.
//  · 선택 위습(제작 통화): 실전 로그 3판 스냅샷 재구성 실측 0.56/0.59/0.45
//    → 평균 ~0.5/라 (양의 증가분 합/라운드 — 소비에 가려진 수입이 있어
//    하한에 가깝다).
//  · 랜덤 위습(유닛 수입): 라운드마다 2개, 흔함만 준다(둘 다 사용자
//    확인 맵 사실). 특정 흔함 1종 기대 도착은 9종 균등 가정 2/9개/라.
//    안흔함 이상은 랜덤 위습으로 직접 오지 않으므로 조합으로만 채운다. 이 예측은 참고 계획 전용이며 확정 게이트(현재
//    패 순차 장부)는 그대로 유지한다.
const SELECTION_WISP_INCOME_PER_ROUND=.5;
const RANDOM_WISP_PER_ROUND=2;
const COMMON_KIND_COUNT=9;
function wispIncomeProjection(currentRound,targetRound){
  const from=Math.max(1,Math.round(num(currentRound)||1)),to=Math.max(from,Math.round(num(targetRound)||50)),rounds=Math.max(0,to-from);
  return{fromRound:from,toRound:to,rounds,selectionPerRound:SELECTION_WISP_INCOME_PER_ROUND,selectionTotal:round2(rounds*SELECTION_WISP_INCOME_PER_ROUND),randomPerRound:RANDOM_WISP_PER_ROUND,randomTotal:rounds*RANDOM_WISP_PER_ROUND,commonKindPerRound:round2(RANDOM_WISP_PER_ROUND/COMMON_KIND_COUNT),basis:'selection-measured-logs-3games·random-2-commons-only-user-confirmed',measured:{selection:true,random:false}};
}
const ARMOR_BREAK_CAP=75;
function armorBreakStacks(weight){const w=Math.max(0,num(weight));return w<=0?0:Math.round(ARMOR_BREAK_CAP*(1-Math.pow(.5,w)));}
function armorBreakModel(spec,options){
  options=options||{};
  const weight=Math.max(0,num(spec&&spec.armorBreak)),units=Math.max(0,num(spec&&spec.armorBreakUnits));
  const stacks=armorBreakStacks(weight),staticReduce=num(options.armorReduce);
  const out={weight:round2(weight),units,stacks,cap:ARMOR_BREAK_CAP,addedReduce:stacks,basis:'map-cap75-steadystate-estimate',measured:false};
  if(options.bossArmor!=null){
    const bossArmor=num(options.bossArmor);
    const before=armorMultiplier(bossArmor-staticReduce),after=armorMultiplier(bossArmor-staticReduce-stacks),nextOne=armorMultiplier(bossArmor-staticReduce-stacks-1);
    out.multiplierWithout=round3(before);
    out.multiplierWith=round3(after);
    out.gainPercent=round2(before>0?(after/before-1)*100:0);
    out.perStackGainPercent=round3(after>0?(nextOne/after-1)*100:0);
  }
  return out;
}
function upperCombatFor(unit){
  const table=(typeof window!=='undefined'?window:globalThis).ORD_UPPER_COMBAT;
  if(!table||!table.rows||!unit)return null;
  if(table.rows[unit.id])return table.rows[unit.id];
  for(const code of unit.codes||[])if(table.rows[code])return table.rows[code];
  return null;
}
// 평타 raw DPS (스킬 제외).  level은 해당 등급 공업 실제 연구 레벨(시작 1).
function upperRawDps(unit,level,speedBuffPct){
  const row=upperCombatFor(unit);if(!row)return null;
  const n=Math.max(1,Math.round(num(level)||1));
  const hit=num(row.avg)+num(row.r1dmg)+num(row.rndmg)*(n-1);
  const speed=Math.min(1+(num(row.r1spd)+num(row.rnspd)*(n-1))/100+num(speedBuffPct)/100,5);
  return{raw:hit*speed/Math.max(.01,num(row.bat)),hit,speedMultiplier:speed,atkType:row.atkType,row};
}
// 보스 평타 실효 DPS와, 특정 방깎에서 필요한 raw DPS.
function upperBossDps(unit,level,options){
  options=options||{};const rawInfo=upperRawDps(unit,level,options.speedBuffPct);
  if(!rawInfo)return null;
  const bossArmor=num(options.bossArmor),armorReduce=num(options.armorReduce);
  const multiplier=armorMultiplier(bossArmor-armorReduce)*num(ATTACK_TYPE_VS_BOSS[rawInfo.atkType]!=null?ATTACK_TYPE_VS_BOSS[rawInfo.atkType]:1);
  return Object.assign({},rawInfo,{effective:rawInfo.raw*multiplier,multiplier});
}
function bossRawDpsNeed(preview,armorReduce,atkType){
  if(!preview||preview.bossArmor==null)return null;
  const typeMod=num(ATTACK_TYPE_VS_BOSS[atkType]!=null?ATTACK_TYPE_VS_BOSS[atkType]:1);
  return Math.round(num(preview.dpsNeed)/(armorMultiplier(num(preview.bossArmor)-num(armorReduce))*typeMod));
}
// v17.1: 정규화 스킬 프로필 다이제스트 접근자 (사용자 제공 63 프로필).
// allowKillVerdict=false — 액션 AST 정규화 전에는 표시·참고용으로만 쓴다.
function upperSkillProfile(unit){
  const table=(typeof window!=='undefined'?window:globalThis).ORD_UPPER_SKILLS;
  if(!table||!table.byTmo||!unit)return null;
  if(table.byTmo[unit.id])return table.byTmo[unit.id];
  for(const code of unit.codes||[])if(table.byTmo[code])return table.byTmo[code];
  return null;
}
// v17.21: 스킬 프로필 신뢰도.  AST 파서가 스스로 남긴 coverage 통계만
// 근거로 쓴다 — 읽어낸 데미지 액션 비율(damageEvaluated/damageSeen)과
// 데미지 액션당 미해석 조건 밀도(unknownConditions/profileDamageActions).
// 2.305 프로필 60종 중 unknownConditions=0은 0종이라 이분 게이트는
// 전부를 0으로 만든다 — 그래서 차단이 아니라 감산으로 쓴다.
//   조건밀도 0 → 1.0 · 1 → 0.5 · 3 → 0.25 (1/(1+밀도))
// 하한 0.1: 프로필이 있다는 사실 자체는 정보이므로 완전 삭제하지 않는다.
// 카벤딧슈 사례: 발동 4,973,450/초(평타 105,671의 47배)가 status=pending ·
// unknownConditions 15인 프로필에서 나왔다.
const SKILL_PROC_TRUST_FLOOR=.1;
function skillProcTrust(coverage,status){
  if(!coverage)return{trust:SKILL_PROC_TRUST_FLOOR,verified:false,evalRatio:0,conditionDensity:null};
  const seen=num(coverage.damageSeen),evaluated=num(coverage.damageEvaluated),actions=num(coverage.profileDamageActions),unknown=num(coverage.unknownConditions);
  const evalRatio=seen>0?clamp(evaluated/seen,0,1):0;
  const density=actions>0?Math.max(0,unknown/actions):null;
  const conditionTrust=density==null?.5:1/(1+density);
  const verified=String(status||'').indexOf('pending')<0&&unknown===0&&seen>0&&evaluated===seen;
  return{trust:verified?1:clamp(evalRatio*conditionTrust,SKILL_PROC_TRUST_FLOOR,1),verified,evalRatio:round2(evalRatio),conditionDensity:density==null?null:round2(density)};
}
// v17.2: 액션 AST 정적 도출 — 자동공격 유발 스킬의 기대 데미지 하한.
// strict(미해석 조건 분기=0, 명시 확률 게이트만 통과)만 수치로 쓰고,
// approx(조건 통과 상한)는 진단용이다.  수동 시전·FSM 트레인 미포함,
// allowKillVerdict=false 유지.
function upperSkillProcDps(unit,level,options){
  options=options||{};
  const table=(typeof window!=='undefined'?window:globalThis).ORD_UPPER_SKILL_DPS;
  const rawInfo=upperRawDps(unit,level,options.speedBuffPct);
  if(!table||!table.byProfile||!rawInfo)return null;
  let profileId=null;
  if(table.byTmo[unit.id])profileId=table.byTmo[unit.id];
  else for(const code of unit.codes||[])if(table.byTmo[code]){profileId=table.byTmo[code];break;}
  if(!profileId||!table.byProfile[profileId])return null;
  const derived=table.byProfile[profileId],strict=derived.perAttack&&derived.perAttack.strict||{affected:0,universal:0};
  const attacksPerSec=rawInfo.speedMultiplier/Math.max(.01,num(rawInfo.row.bat));
  const armorMult=options.bossArmor!=null?armorMultiplier(num(options.bossArmor)-num(options.armorReduce)):1;
  let dps=num(strict.universal)*attacksPerSec+num(strict.affected)*attacksPerSec*armorMult;
  // v17.3: RNG 게이트 공격유발 FSM 트레인 하한.  BD1 재진입 의미론에
  // 따라 발동률은 1/활성 지속시간을 넘지 않는다.
  let trainDps=0;
  const trainSlot=table.trainsByProfile&&table.trainsByProfile[profileId];
  for(const train of trainSlot&&trainSlot.trains||[]){
    const rate=Math.min(attacksPerSec*num(train.p),num(train.dur)>0?1/num(train.dur):attacksPerSec*num(train.p));
    trainDps+=(num(train.e&&train.e.universal)+num(train.e&&train.e.affected)*armorMult)*rate;
  }
  dps+=trainDps;
  // v17.21: dps는 기존 의미(파서 하한) 그대로 두고, 순위·화면이 쓰는
  // trustedDps를 따로 낸다 — 미검증 프로필의 발동 DPS가 상위 평가를
  // 독주하지 않게.
  const profile=upperSkillProfile(unit),confidence=skillProcTrust(derived.coverage,profile&&profile.status);
  return{profileId,perAttackStrict:num(strict.affected)+num(strict.universal),dps,trustedDps:dps*confidence.trust,trust:confidence.trust,verified:confidence.verified,evidence:confidence,trainDps,attacksPerSec,basis:'static-lower-bound-attack-proc-and-rng-trains',coverage:derived.coverage||null};
}
// 평타 한정 보스 타임라인 참고치.  options.skillDps에 upperSkillProcDps의
// 하한을 넣을 수 있다 — 그래도 킬 판정은 내리지 않는다.
function simulateBossFlat(unit,level,options){
  options=options||{};
  const preview=bossPreview(options.round||50,options.gorosei);
  if(!preview||preview.bossArmor==null)return null;
  const combat=upperBossDps(unit,level,{bossArmor:preview.bossArmor,armorReduce:options.armorReduce,speedBuffPct:options.speedBuffPct});
  if(!combat)return null;
  const netDps=combat.effective+num(options.skillDps)-num(preview.regen),dealt=Math.max(0,netDps)*preview.time,remaining=Math.max(0,num(preview.hp)-dealt);
  return{basis:'flat-attack-only',verdictAllowed:false,round:preview.round,boss:preview.boss,windowSec:preview.time,hp:num(preview.hp),regen:num(preview.regen),effectiveDps:combat.effective,netDps,dealt:Math.min(dealt,num(preview.hp)),remaining,remainingRatio:num(preview.hp)?round2(100*remaining/num(preview.hp)):0};
}

// 조합 후 ID가 바뀌는 상위는 한 경로로 취급합니다. 뒤쪽 ID일수록 실제 활성 형태입니다.
const UPPER_VARIANT_FAMILIES=[
  ['F90H','unit_1767356628978_5789'],
  ['190H','unit_1747756917990_920'],
  ['M70h','unit_1767886180546_6011'],
  ['H90H','unit_1767886116631_3690'],
  ['E40h','unit_1767886057577_8465'],
  ['KB0H','KB0H_']
];
const UPPER_VARIANT_CANONICAL={};
const UPPER_VARIANT_PRIORITY={};
for(const family of UPPER_VARIANT_FAMILIES)family.forEach((id,index)=>{UPPER_VARIANT_CANONICAL[id]=family[0];UPPER_VARIANT_PRIORITY[id]=index;});

// 34366 작성자가 상위 이름 앞에 기록한 실전 티어. 스토리 등급과는
// 완전히 다른 값이며, 좋은 상위를 기본으로 두는 전략 prior로만 쓴다.
// 신규 상위의 표기가 없을 때 F로 몰아넣지 않도록 unknown(-1)은 비교에서
// 제외한다. 변형의 직접 표기가 부모보다 우선하고, 무표기 변형만 정확히
// 하나의 상위 재료 또는 canonical 원형에서 티어를 상속한다.
const UPPER_POWER_TIER_RANK=Object.freeze({F:0,D:1,C:2,B:3,A:4,S:5});
const UPPER_POWER_TIER_LETTERS=Object.freeze(['S','A','B','C','D','F']);
const UPPER_POWER_TIER_CACHE=new WeakMap();
// v23.0(카탈로그 2312 이행): 2.305 카탈로그는 상위 이름에 (S)~(F) 티어
// 접두사를 달았지만 2312 카탈로그는 접두사를 빼고 이모지(💖💙🤍)만 남겼다
// — 이모지는 구 6단계 티어와 무상관(교차표 확인)이라 대체 불가.  구 덤프
// (git b2e1a45)에서 추출한 73개 전량을 id 승계표로 보존한다.  이름 접두사가
// 있으면(라이브 TMO 페이로드 등) 그쪽이 이긴다.
const UPPER_POWER_TIER_CARRYOVER=Object.freeze({
  "E90H":"B","890H":"A","LB0H":"S","990H":"F","490H":"C","XB0H":"F",
  "290H":"B","DB0H":"C","B90H":"A","F90H":"A","unit_1767356628978_5789":"S","A90H":"S",
  "190H":"A","unit_1747756917990_920":"A","X80H":"A","unit_1779054071704_519":"B","unit_1779015720197_7602":"B","unit_1779054276300_5909":"B",
  "unit_1779054200606_9136":"B","C40h":"D","940h":"F","J40h":"A","unit_1761060002112_2027":"C","F40h":"D",
  "M70h":"A","unit_1767886180546_6011":"A","A40h":"B","KB0H":"B","KB0H_":"B","A50h":"D",
  "B50h":"A","I50h":"D","unit_1745689336668_9114":"D","Q80h":"B","I70h":"A","F50h":"A",
  "IA0h":"D","090H":"F","V80H":"S","690H":"B","W80H":"B","2B0H":"A",
  "I90H":"B","H90H":"A","unit_1767886116631_3690":"A","Z80H":"B","U80H":"B","790H":"C",
  "590H":"A","OC0H":"A","4B0H":"A","5B0H":"S","N50H":"S","Y80H":"B",
  "D40h":"D","Q40h":"S","E40h":"A","unit_1767886057577_8465":"A","B40h":"A","G40h":"C",
  "JC0h":"D","850h":"B","750h":"C","950h":"A","R80h":"A","760h":"B",
  "C50h":"S","unit_1767356778906_9384":"C","G50h":"D","O80h":"C","480h":"C","040h":"F",
  "E50h":"A"
});
function directUpperPowerTier(u){
  if(!u||!isUpper(u))return'';
  const match=String(u.name||'').match(/^\s*\(\s*(S|A|B|C|D|F)\s*\)/);
  if(match)return match[1];
  return UPPER_POWER_TIER_CARRYOVER[u.id]||'';
}
function upperPowerTier(u,db,trail){
  if(!u||!isUpper(u))return{known:false,letter:'',rank:-1,source:'not-upper',sourceId:''};
  let cache=null;
  if(db&&typeof db==='object'){
    cache=UPPER_POWER_TIER_CACHE.get(db);
    if(!cache){cache=new Map();UPPER_POWER_TIER_CACHE.set(db,cache);}
    if(!trail&&cache.has(u.id))return cache.get(u.id);
  }
  const seen=trail||new Set();
  if(seen.has(u.id))return{known:false,letter:'',rank:-1,source:'cycle',sourceId:u.id};
  const next=new Set(seen);next.add(u.id);
  const direct=directUpperPowerTier(u);
  let result;
  if(direct)result={known:true,letter:direct,rank:UPPER_POWER_TIER_RANK[direct],source:'direct',sourceId:u.id};
  else{
    const canonicalId=canonicalUpperId(u.id),canonical=db&&canonicalId!==u.id&&db.byId&&db.byId.get(canonicalId);
    if(canonical&&isUpper(canonical)){
      const inherited=upperPowerTier(canonical,db,next);
      if(inherited.known)result={known:true,letter:inherited.letter,rank:inherited.rank,source:'canonical',sourceId:canonical.id};
    }
    if(!result&&db&&db.byId){
      const parents=(u.stuffs||[]).map(stuff=>db.byId.get(stuff.id)).filter(parent=>parent&&isUpper(parent));
      if(parents.length===1){
        const inherited=upperPowerTier(parents[0],db,next);
        if(inherited.known)result={known:true,letter:inherited.letter,rank:inherited.rank,source:'recipe-parent',sourceId:parents[0].id};
      }
    }
    if(!result)result={known:false,letter:'',rank:-1,source:'unknown',sourceId:u.id};
  }
  if(cache&&!trail)cache.set(u.id,result);
  return result;
}

// 유닛 설명에 명시된 상위+상위 조합. 숫자 스펙은 abilities/스턴표로 다시 계산하고,
// 이 표는 '왜 같이 쓰는가'라는 전략 조건에만 사용합니다.
const UPPER_PAIR_SYNERGIES=[
  {a:'890H',b:'I70h',label:'로빈+카타쿠리',reason:'로빈의 보조딜 공백을 카타쿠리의 방깎·체젠·광보잡이 메웁니다.'},
  {a:'890H',b:'unit_1745689336668_9114',label:'로빈+마르코',reason:'로빈의 스턴·방깎 축에 마르코의 상시 이감60·체젠을 더합니다.'},
  {a:'unit_1745689336668_9114',b:'I70h',label:'마르코+카타쿠리',reason:'이감·체젠과 방깎·광보잡을 서로 나눠 맡습니다.'},
  {a:'M70h',b:'190H',label:'카이도+쵸파',reason:'카이도의 공격력 패널티와 느린 공속을 쵸파의 공증·공속으로 직접 보완합니다.'},
  {a:'M70h',b:'A50h',label:'카이도+버기',reason:'버기의 공증·공속이 카이도의 패널티를 상쇄하지만 고비용 조합입니다.'},
  {a:'Q80h',b:'A90H',label:'알비다+징베',reason:'알비다가 공급하는 암브가 징베의 암브 비례 스킬을 강화합니다.'},
  {a:'Q80h',b:'IA0h',label:'알비다+킹',reason:'알비다가 킹의 핵심 조건인 암브를 공급합니다.'},
  {a:'Q80h',b:'J40h',label:'알비다+로져',reason:'알비다의 암브·보조축에 로져의 방깎·이감·공증·광폭 처리를 더합니다.'},
  {a:'Q80h',b:'E90H',label:'알비다+도플라밍고',reason:'암브와 발동 이감·발동 방깎을 함께 구성합니다.'},
  {a:'290H',b:'A50h',label:'사보+버기',reason:'버기의 다중 버프가 버프 수에 비례하는 사보 운용과 맞습니다.'},
  {a:'F90H',b:'J40h',label:'조로+로져',reason:'조로의 스킬딜 축에 로져의 방깎·이감·공증을 보강합니다.'},
  {a:'Z80H',b:'950h',label:'샹크스+에이스',reason:'샹크스의 내장 고스턴에 에이스의 상시 이감45·끝딜을 더합니다.'},
  {a:'Z80H',b:'Q40h',label:'샹크스+빅맘',reason:'내장 고스턴과 높은 이감을 결합하되 빅맘 특강 상태를 확인해야 합니다.'},
  {a:'Z80H',b:'E50h',label:'샹크스+에넬',reason:'샹크스의 제어에 에넬의 마방깎·마젠·발동 이감을 더합니다.'},
  {a:'D40h',b:'W80H',label:'드래곤+루치',reason:'드래곤의 폭뎀증·스턴과 루치의 단일2·광폭 처리를 연결합니다.'},
  {a:'E40h',b:'H90H',label:'센고쿠+상디',reason:'센고쿠의 현퍼·공증 축에 상디의 단일·발동 이감을 보강합니다.'},
  {a:'E50h',b:'Y80H',label:'에넬+프랑키',reason:'마나 스킬형 에넬에 프랑키의 마젠5를 더합니다.'},
  {a:'O80h',b:'4B0H',label:'마르코+키드',reason:'마르코의 체젠이 체젠 비례 키드 스턴을 강화합니다.'}
];

const UPPER_STRATEGY_OVERRIDES={
  'I70h':{key:'attack',label:'공증·체젠형 물딜',summary:'저렴한 메인 상위로 빠르게 스토리 보상을 회수하고 방깎·보잡을 이어 붙이는 경로입니다.',needs:[['attack','공증 버프',30],['regen','체젠',1]]},
  '890H':{key:'subdamage',label:'보조딜 필수 스킬딜형',summary:'자체 스턴·방깎·공증은 있지만 보조딜러가 없으면 라인딜이 빈니다.',needs:[['subdamage','보조·폭발딜',1]]},
  'F50h':{key:'subdamage',label:'유틸 만능형 물딜 · 보조딜 필수',summary:'이감·스턴·방깎을 두루 채우지만 자체 스킬딜이 약해(약한 스킬딜러) 보조·폭발딜러가 없으면 라인이 밀립니다. 50라 보스 전에 보조딜을 먼저 확보하세요.',needs:[['subdamage','보조·폭발딜',1]]},
  'Q80h':{key:'armorBreak',label:'암브·넉백 무스턴 물딜',summary:'스턴을 짜지 않고 이감을 상한까지 채워 넉백으로 라인을 관리하는 경로입니다. 스턴 대신 암브·스펙으로 마감합니다.',needs:[['armorBreak','암브 연계',1]],waives:['stunBase','stunFull']},
  'IA0h':{key:'armorBreak',label:'암브형 물딜',summary:'암브가 있어야 제 성능을 내므로 암브 공급 유닛을 먼저 확인합니다.',needs:[['armorBreak','암브 연계',1]]},
  'A90H':{key:'armorBreak',label:'암브 비례 스킬형',summary:'암브 수에 따라 스킬이 강해지며 발동 이감은 상시 이감과 분리해 봐야 합니다.',needs:[['armorBreak','추가 암브',2]]},
  'F90H':{key:'skill',label:'스킬딜형 물딜',summary:'스킬 수치가 고정된 축이라 공속과 방깎을 우선 보강합니다.',needs:[['speed','공속 버프',20]]},
  'DB0H':{key:'slowPenalty',label:'고이감 비례 물딜',summary:'이감이 높을수록 강해지지만 자체 이감 -10 페널티가 있어 다른 이감 유닛을 먼저 확보해야 합니다.',needs:[]},
  'M70h':{key:'penalty',label:'공증 패널티 단독딜러',summary:'아군 공격력 -75 패널티가 있어 여러 딜러보다 공증·공속 보조에 자원을 집중합니다.',needs:[['attack','공증 패널티 상쇄',60],['speed','공속 보강',20]]},
  'C40h':{key:'armorPenalty',label:'버프 비례·고스턴 물딜',summary:'실측 1.117스턴과 보잡은 있지만 방깎 -15 페널티와 버프 수 비례 딜 조건 때문에 다상위를 억지로 늘리지 않습니다.',needs:[['attack','공증·버프 보강',30]]},
  '4B0H':{key:'regen',label:'체젠 비례 제어형',summary:'체젠이 높을수록 스턴이 강해지므로 체젠 파트너가 실제 성능 조건입니다.',needs:[['regen','체젠 버프',2]]},
  'D40h':{key:'singleEnd',label:'폭뎀 단끝형 마딜',summary:'라인딜이 약해 단일·끝딜 유닛으로 한 마리씩 처치해야 하는 고난도 경로입니다.',needs:[['single','단일',2],['end','끝딜',1]]},
  'E50h':{key:'mana',label:'마젠·마방깎형 마딜',summary:'마나 스킬 가동과 마방깎을 살리도록 마젠·광보잡 파트너를 붙입니다.',needs:[['mana','마젠',4]]},
  'Z80H':{key:'builtInStun',label:'내장 고스턴 마딜',summary:'스턴은 이미 충분하므로 두 번째 스턴을 만들지 말고 이감·단끝·광보잡을 채웁니다.',needs:[]}
};
// v16.9: 2.305 공개 공략 근거의 상위 라인 자립도.  목록에 없는 상위는
// unknown으로 남긴다 — 근거 없이 '약'으로 확정하지 않는다(검증 지침).
//  self    = 라인 자립도가 높음(보조딜 강제 없음)
//  support = 보강 필요·조건부(다른 라인 보강 요구가 없으면 보조·폭발딜 1 요구)
const UPPER_LINE_PROFILE={
  '490H':{line:'self'},'5B0H':{line:'self'},'V80H':{line:'self'},'Q40h':{line:'self'},
  'H90H':{line:'self'},'unit_1767886116631_3690':{line:'self'},'590H':{line:'self'},
  '760h':{line:'self'},'N50H':{line:'self'},
  'D40h':{line:'support',covered:'single-end'},
  '480h':{line:'support'},'Z80H':{line:'support'},'G40h':{line:'support'},
  '090H':{line:'support'},'G50h':{line:'support',note:'41라 이전 조합 조건'},
  'JC0h':{line:'support'},'040h':{line:'support'},
  '890H':{line:'support'},'F50h':{line:'support'}
};

// 2.300~2.305 연구표. displayStun은 표기값, capture는 표의 발동 포획률입니다.
// 내부 합산은 capture에서 복원한 비반올림 유효 스턴을 사용합니다.
const STUN_RESEARCH={
  'V10h':{displayStun:.159,capture:22.53},'B20h':{displayStun:.151,capture:21.63},'A20h':{displayStun:.152,capture:21.76},'C20h':{displayStun:.172,capture:24.22},'E20h':{displayStun:.138,capture:19.98},
  'W20h':{displayStun:.935,capture:77.78},'Q20h':{displayStun:.878,capture:75.66},'Z20h':{displayStun:1.001,capture:80.03},'530h':{displayStun:.953,capture:78.42},'930h':{displayStun:1.034,capture:81.06},'030h':{displayStun:.525,capture:57.02},'130h':{displayStun:.748,capture:70},
  // 써니호는 광폭 처리 전용입니다. 과거 연구표의 포획률은 실제 스턴 역할로
  // 합산하지 않습니다.
  'O30h':{displayStun:.501,capture:55.34},'L30h':{displayStun:0,capture:0},'140h':{displayStun:.506,capture:55.74},'Y30h':{displayStun:.5,capture:55.26},'740h':{displayStun:.961,capture:78.71},
  '890H':{displayStun:1.263,capture:86.89},'990H':{displayStun:.476,capture:53.51},'XB0H':{displayStun:.636,capture:64.05},'290H':{displayStun:.139,capture:20},'U80H':{displayStun:1.264,capture:86.91},'Z80H':{displayStun:2.015,capture:96.09},'790H':{displayStun:1.242,capture:86.44},
  'B90H':{displayStun:0,capture:0},'unit_1779054378124_5918':{displayStun:1.152,capture:84.34},'F90H':{displayStun:.397,capture:47.19},'unit_1767356628978_5789':{displayStun:.397,capture:47.19},'4B0H':{displayStun:.186,capture:25.84},'5B0H':{displayStun:.999,capture:79.98},'X80H':{displayStun:1.068,capture:82.09},
  'C40h':{displayStun:1.117,capture:83.34},'D40h':{displayStun:1.448,capture:90.28},'E40h':{displayStun:1.145,capture:84.17},'unit_1767886057577_8465':{displayStun:1.858,capture:94.97},'B40h':{displayStun:1.87,capture:95.07},'A40h':{displayStun:.576,capture:60.44},
  'KB0H':{displayStun:1.092,capture:82.75},'KB0H_':{displayStun:1.092,capture:82.75},'760h':{displayStun:.64,capture:64.29},'B50h':{displayStun:.999,capture:79.97},'C50h':{displayStun:.863,capture:75.05},'unit_1767356778906_9384':{displayStun:1.312,capture:87.89},
  'F50h':{displayStun:.548,capture:58.58},'unit_1761060487951_749':{displayStun:.421,capture:49.2},'unit_1761062338921_7460':{displayStun:.633,capture:63.87},
  'unit_1761061031358_4977':{displayStun:.736,capture:69.39},'unit_1761062663657_987':{displayStun:2.168,capture:96.95},'unit_1761126198374_11':{displayStun:.908,capture:76.81},
  // v19.8.1(사용자 규칙): 블랙마리아 왜곡은 W 폼 3형태(스턴/이감40/데미지)가
  // 상호 배타다 — 이감폼을 쓰는 덱 기준으로 계산하므로 스턴은 0.  0731 판의
  // 스턴 1.25는 이 0.748 이중 계산이 부풀린 값이었다.
  'unit_1752903381904_1445':{displayStun:0,capture:0},'IC0h':{displayStun:.427,capture:49.73},'unit_1779016778159_2512':{displayStun:.317,capture:40},
  // v23.0(사용자 요청 "방주맥심 스턴도 같이 넣어줘" + 2.312R 맵 원본 판독):
  // 뇌영(A0BG)은 마나 재생형이 아니라 **공격 카운터형** — 공격 1회당 마나
  // +1, 150타마다 자동 발동해 600범위 1.2초 스턴(보스급 0.24초).  공속
  // 0.64초 기준 주기 96.6초(마젠 연구소 '식량 보급' +0.8/초 시 ≈64초),
  // 스턴 가동률 1.24%~1.88%.  코치 앵커 3종(아오키지·시키·미나토) 역산
  // 스케일(유효 인분 ≈ 초당 기대 스턴초 ×2.6)로 마젠 연구 기준 0.05 인분
  // — 사실상 스턴 전력이 아니라 광역 딜·마방깎 유닛이다.
  'X30h':{displayStun:.05,capture:7.73}
};

// 희귀 42종 전체 스토리 파괴 실측 (갤러리 250029 데미지% ×100).
// 이전 16종 부분 표를 전면 대체한다 — 값 체계는 같은 스케일이지만 측정이
// 새로 이루어져 일부 순위가 다르다(예: 샹크스 2260→1457).
const STORY_RARE_BENCHMARKS={
  Q10h:3173,Y10h:2860,E20h:2798,X90h:2797,I20h:2530,K20h:2449,X10h:2152,R10h:2016,
  Z10h:2013,'620h':2005,V10h:1890,'020h':1812,L50h:1708,F20h:1682,'320h':1619,'220h':1580,
  M10h:1574,M20h:1563,H40h:1542,L20h:1521,H20h:1489,P10h:1471,'520h':1470,'920h':1457,
  G20h:1447,L10h:1380,J20h:1359,K50h:1147,S10h:1090,'120h':1081,T10h:1071,U10h:971,
  W10h:925,D20h:919,A20h:904,'820h':899,B20h:874,'720h':851,N10h:829,C20h:803,
  O10h:733,'420h':729
};
const STORY_RARE_VALUES=Object.values(STORY_RARE_BENCHMARKS).map(num);
const STORY_RARE_MIN=Math.min(...STORY_RARE_VALUES),STORY_RARE_MAX=Math.max(...STORY_RARE_VALUES);
const STORY_RARE_RANKS=Object.freeze(Object.fromEntries(Object.entries(STORY_RARE_BENCHMARKS)
  .sort((a,b)=>num(b[1])-num(a[1])||String(a[0]).localeCompare(String(b[0])))
  .map(([id],index)=>[id,index+1])));
const STORY_RESEARCHED={
  'G50h':{score:98,tier:'S',note:'상위 스토리 파괴 최상위권'},'D40h':{score:81,tier:'A',note:'불멸 스토리 파괴 상위권'},'JC0h':{score:73,tier:'A',note:'영원 강화 스토리 상위권'},'W80H':{score:58,tier:'B',note:'상위 스토리 중상위권'},'090H':{score:34,tier:'D',note:'상위 스토리 파괴 기준 낮음'},'F40h':{score:20,tier:'D',note:'상위 스토리 파괴 기준 낮음'},
  '740h':{score:94,tier:'S',note:'스토리 파괴 최상위권'},'Y20h':{score:94,tier:'S',note:'피셔타이거급 스토리'},'Z30h':{score:88,tier:'S',note:'편차는 있으나 평균·고점이 높음'},'S20h':{score:84,tier:'A',note:'고점이 매우 높은 스토리'},'F30h':{score:80,tier:'A',note:'저점과 안정성이 좋음'},'unit_1779015610844_6407':{score:72,tier:'A',note:'왜곡됨 스토리 성능 우수'},'J70h':{score:66,tier:'B',note:'변화됨 스토리 성능 양호'},'V30h':{score:61,tier:'B',note:'스토리 보조 성능 중상'},'B30h':{score:38,tier:'D',note:'방깎 없이 스토리 효율이 낮음'},'030h':{score:35,tier:'D',note:'스토리 파괴만 보면 낮음'},'Q30h':{score:5,tier:'D',note:'스토리 파괴 최하위권'}
};

// The two measured tables use different units for their first rows (seconds)
// and remaining rows (percent). Never compare those raw values. The source
// rank is the only ordering input; score is merely a rank-normalized UI value.
const STORY_MEASURED_SOURCES=[
  {key:'nonupper',label:'비상위',data:global.ORD_STORY_NONUPPER_V2305},
  {key:'upper',label:'상위',data:global.ORD_STORY_UPPER_V2305}
].filter(source=>source.data&&typeof source.data==='object').map(source=>{
  const ranks=Object.values(source.data).map(row=>num(row&&row.rank)).filter(rank=>rank>0);
  return Object.assign(source,{maxRank:ranks.length?Math.max(...ranks):1});
});
const STORY_LEAGUES=Object.freeze({
  rare:Object.freeze({key:'rare',label:'희귀',size:Object.keys(STORY_RARE_BENCHMARKS).length,description:'희귀 실험값이 큰 순서로 독립 순위를 매깁니다.'}),
  upper:Object.freeze({key:'upper',label:'상위',size:(STORY_MEASURED_SOURCES.find(source=>source.key==='upper')||{}).maxRank||80,description:'상위 원본 1~80위 안에서만 독립 등급을 매깁니다.'}),
  legend:Object.freeze({key:'legend',label:'전설급',size:(STORY_MEASURED_SOURCES.find(source=>source.key==='nonupper')||{}).maxRank||76,description:'왜곡·전설·히든·변화·특수 원본 1~76위 안에서만 독립 등급을 매깁니다.'})
});
// Each measured league is divided independently by its original source rank.
// Keep this order in one exported constant so data, UI filters and tests cannot
// silently disagree about the story grade ladder.
// v23.4(사용자 지시 "s-f까지 다시 설정해줘 sss이런거 없애고"): 구 아홉
// 단계(v17.7 개편)를 일곱 단계 S~F 균등 분위로 재설정한다.  리그
// (상위 / 전설급 / 희귀)별 독립 재등급과 원본 순위·측정값 보존은 그대로.
const STORY_GRADE_TIERS=Object.freeze(['S','A','B','C','D','E','F']);

function storyMeasuredLookup(id){
  for(const source of STORY_MEASURED_SOURCES){
    const row=source.data[id];
    if(row&&num(row.rank)>0)return{source,row};
  }
  return null;
}
function storyMeasuredTier(tableTier){
  const tier=Math.max(1,num(tableTier));
  return tier===1?'S':tier===2?'A':tier===3?'B':tier===4?'C':'D';
}
function storyMeasuredScore(rank,maxRank){
  const r=Math.max(1,num(rank)),max=Math.max(r,num(maxRank));
  return max<=1?100:clamp(Math.round(100*(max-r)/(max-1)),0,100);
}
function storyMeasuredMetric(row){
  const prefix=row.approximate?'약 ':'';
  if(row.metricType==='seconds')return`${prefix}${num(row.value)}초 파괴`;
  if(row.metricType==='percent')return`${prefix}${num(row.value)}%`;
  return'';
}

const MAGIC_SINGLE=[
 [/로브\s*루치/,1],[/^상디|상디\s*\(/,1],[/코비/,1],[/스튜시/,1],[/캐럿/,0.6],[/레이쥬/,0.5],[/류마/,0.5],[/도플라밍고.*변화/,0.5],[/바제스.*왜곡/,1]
];
const MAGIC_END=[
 [/S-스네이크|S 스네이크/,1],[/S-베어|S 베어/,1],[/시류/,1],[/^조로|조로\s*\(/,1],[/시노부/,1],[/보아\s*핸콕/,1],[/카쿠.*변화/,0.5],[/브룩.*초월/,1],[/테조로/,1],[/우타/,0.5],[/류마/,1]
];
// 단일·끝딜 하드 게이트는 이름 추정값이 아니라 TMO abilities에 직접
// 들어온 수치만 사용합니다. 아래 값은 화면의 "이론 상한"에만 쓰며
// 클리어 확정이나 희귀 리롤을 열지 않습니다.
const UNVERIFIED_FINISH_MAX={
  'unit_1779017164417_3162':1 // S-베어: 기존 패치 표기만 있고 원 abilities 근거 없음
};
const MAGIC_BG_FULL=[/네코마무시/,/루나메/,/제파/,/아카이누/,/키쿠/,/베이비\s*5/,/뱀초/,/제트/];
const MAGIC_FRENZY=[/검은수염/,/로우/,/아인/,/비비.*영원/,/오뎅/,/보아\s*핸콕.*영원/];
const MAGIC_BOSS=[/레드필드/,/타시기.*초월/,/키자루.*초월/,/드래곤.*불멸/,/에이스.*영원/];
const PHYSICAL_BG_FULL=[/킬러/,/피셔타이거/,/S-호크|S 호크/,/레드포스호/,/카타쿠리/,/릴리스/,/우솝.*초월/,/스코퍼\s*가반/];
const PHYSICAL_BOSS=[/히바리/,/사보.*초월/];
const PHYSICAL_FRENZY=[/센고쿠.*전설/,/블랙마리아.*왜곡/,/보니.*초월/,/로저.*불멸/];
const UTILITY_MAGIC=[/슈가/,/페로나.*왜곡/,/방주맥심/,/나미.*전설/,/캐럿.*히든/,/코알라.*왜곡/,/코비/,/로우/,/모리아/,/검은수염/,/브룩.*초월/,/아오키지/,/우타/,/오뎅/,/미호크.*영원/];
const UTILITY_PHYSICAL=[/징베/,/모비딕호/,/퀸.*왜곡/,/센고쿠.*전설/,/마르코.*전설/,/레일리/,/스모커/,/울티/,/샬롯\s*크래커/,/히바리/,/흰수염/,/드래곤.*전설/,/라분/,/시키.*전설/,/베르고/,/피셔타이거/,/이완코브/,/알비다/,/S-샤크|S 샤크/,/베가펑크/,/아틀라스/,/후지토라.*초월/,/쵸파.*초월/,/불릿/,/버기.*영원/,/니카/];

function num(v){
  if(v===true)return 1;if(v===false||v==null)return 0;if(typeof v==='number')return Number.isFinite(v)?v:0;
  const m=String(v).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):0;
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function round2(v){return Math.round(num(v)*100)/100;}
function round3(v){return Math.round(num(v)*1000)/1000;}
function round6(v){return Math.round(num(v)*1000000)/1000000;}
function stunFromCaptureRate(rate){rate=clamp(num(rate),0,99.999999);return rate<=0?0:Math.log(1-rate/100)/Math.log(.2);}
function stunResearch(u){
  const base=u&&STUN_RESEARCH[u.id];if(!base)return null;
  return{displayStun:num(base.displayStun),capture:round2(base.capture),exactStun:stunFromCaptureRate(base.capture),active:false,condition:'',base:{displayStun:num(base.displayStun),capture:round2(base.capture)},variant:null};
}
function stunTableValue(u){const row=stunResearch(u);return row?row.exactStun:null;}
function stunCaptureRate(stun){return round2((1-Math.pow(.2,Math.max(0,num(stun))))*100);}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cleanName(s){return String(s||'').replace(/[💙💖🚩🚁▶◆♥🔻🔺🤍]/g,' ').replace(/\s+/g,' ').trim();}
function canonicalAbility(k){const x=String(k||'').replace(/\s+/g,' ').trim();return ABILITY_ALIASES[x]||x;}
function groupName(u){return String(u&&u.groupName||'');}
function nameOf(u){return u&&DISPLAY_NAME_OVERRIDES[u.id]||cleanName(u&&u.name||'');}
function displayNameOf(u){return u&&UI_NAME_OVERRIDES[u.id]||nameOf(u);}
function isRare(u){return groupName(u).includes('희귀함');}
// v23.0: 2312 카탈로그가 위습(810e)을 '특수재료'→'흔함' 그룹으로 옮겼다 —
// 위습은 자원이지 흔함 유닛이 아니므로 흔함 계산(종류 수·필러·픽스처)에서
// 제외한다.
function isCommon(u){return groupName(u)==='흔함'&&!(u&&u.id===WISP_ID);}
function isUncommon(u){return groupName(u)==='안흔함';}
function isSpecialTier(u){return groupName(u)==='특별함';}
function isUpper(u){return /제한됨|초월|불멸|영원/.test(groupName(u));}
function isLegendish(u){return /전설|히든|왜곡됨|변화된|세라핌|해적선/.test(groupName(u))&&!isUpper(u);}
function isChanged(u){return groupName(u).includes('변화된');}
function isWarped(u){return groupName(u).includes('왜곡됨');}
function isShip(u){return groupName(u).includes('해적선');}
function isSeraph(u){return groupName(u).includes('세라핌');}
function isMystic(u){return groupName(u).includes('신비함');}
function isRandom(u){return groupName(u).includes('랜덤유닛');}
function isItem(u){return /아이템|기타/.test(groupName(u));}
function isTranscend(u){return groupName(u).includes('초월');}
// Returns true only when this build would have to create a warped unit that is
// not already in the current hand. Warped wood remains universally available;
// this is a recommendation-cost gate, including upper recipes that consume a
// warped unit somewhere below the target.
function requiresWarpedCraft(db,target,counts){
  if(!db||!target)return false;const stock=cloneCounts(counts),visiting=new Set();
  function need(id,amount){amount=Math.max(0,num(amount));if(amount<=0)return false;const have=Math.min(amount,num(stock[id]));stock[id]=Math.max(0,num(stock[id])-have);amount-=have;if(amount<=0)return false;const unit=db.byId.get(id);if(!unit)return false;if(isWarped(unit))return true;if(visiting.has(id))return false;visiting.add(id);for(const stuff of unit.stuffs||[]){if(need(stuff.id,amount*num(stuff.count))){visiting.delete(id);return true;}}visiting.delete(id);return false;}
  return need(target.id,1);
}
function isAbsalom(u){return /^압살롬(?:\s|\(|$)/.test(nameOf(u));}
// v17.6(감사 P0-2): 152킬 보상 특별함은 33종 중 압살롬 제외 32종 균등
// 추첨 — UI 목록과 모델 검증이 이 단일 권위 함수를 함께 쓴다.
function eligible152Specials(db){return(db&&db.specials||[]).filter(u=>!isAbsalom(u));}
function eligible152SpecialId(db,id){if(!id)return false;const u=db&&db.byId&&db.byId.get(id);return!!u&&isSpecialTier(u)&&!isAbsalom(u);}
function canonicalUpperId(id){return UPPER_VARIANT_CANONICAL[id]||id||'';}
function upperVariantPriority(id){return num(UPPER_VARIANT_PRIORITY[id]);}
function activeUpperVariant(state,u){
  if(!u)return null;const canonical=canonicalUpperId(u.id),family=UPPER_VARIANT_FAMILIES.find(ids=>ids[0]===canonical);if(!family)return u;
  const owned=family.map(id=>state.db.byId.get(id)).filter(Boolean).filter(x=>num(state.counts[x.id])>0).sort((a,b)=>upperVariantPriority(b.id)-upperVariantPriority(a.id));return owned[0]||u;
}
function upperPairSynergy(a,b){
  if(!a||!b)return null;const ca=canonicalUpperId(a.id),cb=canonicalUpperId(b.id);return UPPER_PAIR_SYNERGIES.find(x=>(canonicalUpperId(x.a)===ca&&canonicalUpperId(x.b)===cb)||(canonicalUpperId(x.a)===cb&&canonicalUpperId(x.b)===ca))||null;
}
function tierKey(u){
  if(isCommon(u))return'common';if(isUncommon(u))return'uncommon';if(isSpecialTier(u))return'special';if(isRare(u))return'rare';
  if(isUpper(u))return'upper';if(isLegendish(u))return'legend';if(groupName(u)==='특수재료'||SPECIAL_IDS[u&&u.id])return'hard';return'other';
}
function familyOf(u){
  if(u&&FAMILY_OVERRIDES[u.id])return FAMILY_OVERRIDES[u.id];
  const g=groupName(u);if(g.includes('[물딜]'))return'physical';if(g.includes('[마딜]'))return'magic';if(g.includes('[스턴]'))return'neutral';
  const n=nameOf(u);
  if(isWarped(u)&&/바제스/.test(n))return'magic';
  if(MAGIC_SINGLE.some(([r])=>r.test(n))||MAGIC_END.some(([r])=>r.test(n))||MAGIC_BG_FULL.some(r=>r.test(n))||MAGIC_FRENZY.some(r=>r.test(n))||MAGIC_BOSS.some(r=>r.test(n))||UTILITY_MAGIC.some(r=>r.test(n)))return'magic';
  if(PHYSICAL_BG_FULL.some(r=>r.test(n))||PHYSICAL_BOSS.some(r=>r.test(n))||PHYSICAL_FRENZY.some(r=>r.test(n))||UTILITY_PHYSICAL.some(r=>r.test(n)))return'physical';
  return'neutral';
}
function abilityValue(u,key){
  const a=u&&u.abilities||{},target=canonicalAbility(key);for(const [k,v] of Object.entries(a)){if(canonicalAbility(k)===target)return num(v);}return 0;
}
function abilityBool(u,key){
  const a=u&&u.abilities||{},target=canonicalAbility(key);for(const [k,v] of Object.entries(a)){if(canonicalAbility(k)!==target)continue;if(v===false||String(v).toLowerCase()==='false'||v==null||v==='')return false;return true;}return false;
}
function firstMatchValue(name,list){for(const [re,v] of list){if(re.test(name))return v;}return 0;}
function anyMatch(name,list){return list.some(re=>re.test(name));}
function numberInName(name,re){const m=String(name||'').match(re);return m?num(m[1]):0;}

function magicFinishProfile(u){
  if(!u)return{directSingle:0,directEnd:0,directCredit:0,maxCredit:0,verified:false,theoretical:false,tags:[]};
  const directSingle=Math.max(0,abilityValue(u,'단일')),directEnd=Math.max(0,abilityValue(u,'끝딜'),abilityValue(u,'범위 끝딜')),directCredit=isUpper(u)?0:Math.min(1,Math.max(directSingle,directEnd)),unverified=isUpper(u)?0:num(UNVERIFIED_FINISH_MAX[u.id]),maxCredit=Math.max(directCredit,Math.min(1,unverified)),abilities=u.abilities||{},tags=[];
  if(Object.keys(abilities).some(key=>/순간이동|블링크/.test(key)))tags.push('위치 조작');
  if(Object.keys(abilities).some(key=>/발동|마나/.test(key)))tags.push('발동 관리');
  if(/시류|스튜시|카쿠|시노부/.test(nameOf(u)))tags.push('수동 컨트롤');
  return{directSingle:round2(directSingle),directEnd:round2(directEnd),directCredit:round2(directCredit),maxCredit:round2(maxCredit),verified:directCredit>0,theoretical:maxCredit>directCredit,tags:[...new Set(tags)]};
}
function evaluateMagicSingleEnd(lineup){
  const rows=[];for(const item of lineup||[]){const unit=item&&item.unit||item;if(!unit||isUpper(unit))continue;const profile=magicFinishProfile(unit);if(profile.maxCredit<=0)continue;rows.push({id:unit.id,name:displayNameOf(unit),unit,directCredit:profile.directCredit,maxCredit:profile.maxCredit,verified:profile.verified,theoretical:profile.theoretical,tags:profile.tags});}
  const expected=round2(rows.reduce((sum,row)=>sum+row.directCredit,0)),largest=round2(rows.reduce((max,row)=>Math.max(max,row.directCredit),0)),stable=round2(Math.max(0,expected-largest)),maximum=round2(rows.reduce((sum,row)=>sum+row.maxCredit,0)),verifiedUnits=rows.filter(row=>row.directCredit>0).length,maxUnits=rows.filter(row=>row.maxCredit>0).length;
  let status='insufficient',label='단끝 스펙 부족',note=`검증된 보조 단·끝 운용값이 ${expected}/3입니다.`;
  if(stable>=3){status='stable';label='스펙상 안정 후보';note=`보조 한 기를 놓쳐도 ${stable}/3이 남는 정적 스펙입니다. 실제 클리어는 운영에 따라 달라집니다.`;}
  else if(expected>=3&&verifiedUnits>=3){status='control';label='컨트롤 의존';note=`일반 운용 ${expected}/3이지만 한 기를 놓치면 ${stable}/3입니다. 단일·끝딜 컨트롤이 필요합니다.`;}
  else if(maximum>=3&&maxUnits>=3){status='theoretical';label='자료 확인 필요 · 확정 금지';note=`직접 확인값은 ${expected}/3이고 보정 포함 이론 상한만 ${maximum}/3입니다.`;}
  return{status,label,note,stable,expected,maximum,largest,verifiedUnits,maxUnits,rows,riskTags:[...new Set(rows.flatMap(row=>row.tags||[]))]};
}

const ROLE_PROFILE_CACHE=new WeakMap();
function roleProfile(u){
  if(u&&typeof u==='object'&&ROLE_PROFILE_CACHE.has(u))return ROLE_PROFILE_CACHE.get(u);
  const n=nameOf(u),g=groupName(u),family=familyOf(u);
  const measuredStun=stunTableValue(u);
  let stun=measuredStun==null?abilityValue(u,'스턴'):measuredStun;
  if(/료쿠규/.test(n)||(isShip(u)&&/^(?:레드포스호|써니호)/.test(n)))stun=0;
  // 실제 단·끝 수치는 abilities만 신뢰합니다. 이름 정규식은 family 추정에만
  // 남겨 두며 조로 상위·우타 헤드셋·캐럿 변화·류마 히든에 역할을 덧붙이지 않습니다.
  let single=abilityValue(u,'단일');
  let end=Math.max(abilityValue(u,'끝딜'),abilityValue(u,'범위 끝딜'));
  let boss=abilityBool(u,'보스 잡기'),frenzy=abilityBool(u,'광폭화');
  if(anyMatch(n,MAGIC_BG_FULL)||anyMatch(n,PHYSICAL_BG_FULL)){boss=true;frenzy=true;}
  if(anyMatch(n,MAGIC_BOSS)||anyMatch(n,PHYSICAL_BOSS))boss=true;
  if(anyMatch(n,MAGIC_FRENZY)||anyMatch(n,PHYSICAL_FRENZY))frenzy=true;
  if(u&&u.id==='240h'){boss=true;frenzy=false;}
  if(isShip(u)&&/^써니호/.test(n)){boss=false;frenzy=true;}
  // v19.7.1(외부 감사·데이터팩 교차검증): S-베어는 사용자 고정 규칙상
  // 광보잡으로 세지 않고(레이저 보스5%/광폭30%는 있으나 코칭 규칙이 짤스턴
  // 0.2~0.3과 마딜 끝딜로만 계산) — boss/frenzy false 유지, 끝딜 1 추가.
  if(/S-베어|S 베어/.test(n)){stun=.25;boss=false;frenzy=false;end=Math.max(end,1);}
  // Koala (warped) is shared physical/magic utility, not a boss/frenzy handler.
  // ID correction wins even when a live TMO payload still contains both flags.
  if(u&&u.id==='V30h'){boss=false;frenzy=false;}
  // v22.10(사용자 실측 2.312: "베이비 5 이제 광보잡 유닛이 아니라 암브
  // 유닛으로 봐야할듯"): (변화)베이비5 — 2.310 리뉴얼로 암브 기반 유틸이
  // 됐는데 카탈로그 잔존 플래그(보스 잡기·광폭화)가 광보잡 인분으로
  // 계속 세었다.  V30h(코알라)와 같은 ID 교정 — 라이브 TMO 페이로드가
  // 옛 플래그를 실어도 이긴다.  암브 가중치는 patch2310 이 넣는다.
  if(u&&u.id==='N70h'){boss=false;frenzy=false;}
  if(/바제스/.test(n)&&isWarped(u))single=1;
  let armor=abilityValue(u,'방어력 감소'),triggerArmor=abilityValue(u,'발동방어력 감소'),singleArmor=abilityValue(u,'단일방어력 감소'),stackArmor=abilityValue(u,'중첩방어력 감소');
  if(/바제스/.test(n)&&isWarped(u)){armor=0;triggerArmor=0;}
  if(/퀸/.test(n)&&isWarped(u)){armor=0;triggerArmor=20;}
  if(/센고쿠/.test(n)&&/전설 \[물딜\]/.test(g)){armor=0;triggerArmor=18;}
  if(/징베/.test(n)&&/전설 \[물딜\]/.test(g)){armor=0;singleArmor=25;}
  if(/코알라/.test(n)&&isWarped(u)){armor=0;triggerArmor=0;}
  let slow=abilityValue(u,'이동속도 감소'),triggerSlow=abilityValue(u,'발동이동속도 감소');
  let singleSlow=abilityValue(u,'단일이동속도 감소')||numberInName(n,/단일이감\s*(\d+(?:\.\d+)?)/);
  let magicDef=abilityValue(u,'마법 방어력 감소');
  let magicAmp=Math.max(abilityValue(u,'마법 대미지 증가'),abilityValue(u,'단일마법 대미지 증가'),abilityValue(u,'모든피해증가'));
  let explosionAmp=abilityValue(u,'폭발형 대미지 증폭');
  if(/방주맥심/.test(n)){magicDef=10;explosionAmp=10;triggerSlow=30;}
  // v19.7.1(외부 감사): 2.305 실측은 레이저 마법데미지 증폭 4% — 8은 구값.
  if(/S-베어|S 베어/.test(n)){magicDef=1;magicAmp=4;}
  // v17.8: 암브는 불리언이 아니라 소스 가중치다(카탈로그 값 0.1~2,
  // true=1). 명시적 0은 패치로 무효화된 유닛이므로 false로 취급한다
  // (기존 abilityBool은 0을 true로 읽는 버그가 있었다).
  const armorBreakRaw=(()=>{const a=u&&u.abilities||{};for(const [k,v] of Object.entries(a))if(canonicalAbility(k)==='아머브레이크')return v;return undefined;})();
  const armorBreakWeight=armorBreakRaw==null||armorBreakRaw===''?0:Number.isFinite(Number(armorBreakRaw))?Math.max(0,num(armorBreakRaw)):(String(armorBreakRaw).toLowerCase()==='false'?0:1);
  const armorBreak=armorBreakWeight>0;
  const percent=abilityBool(u,'범위 전체 체력 퍼센트 대미지')||abilityBool(u,'범위 현재 체력 퍼센트 대미지')||abilityBool(u,'범위 잃은 체력 퍼센트 대미지');
  let supportDamage=abilityBool(u,'보조딜')||abilityBool(u,'방어력 무시 대미지')||percent;
  let utility=(family==='magic'?UTILITY_MAGIC:UTILITY_PHYSICAL).some(re=>re.test(n));
  if(abilityBool(u,'유닛삭제')||armorBreak||magicDef>0||magicAmp>0||explosionAmp>0||supportDamage)utility=true;
  if(u&&u.id==='R30h'){utility=true;supportDamage=true;}
  // Koala and Baratie are explicit shared physical/magic utility. S-Bear's
  // magic amplification and magic-defense reduction are utility as well.
  const sharedUtility=!!(u&&(u.id==='V30h'||u.id==='P30h'));
  if(sharedUtility||u&&u.id==='unit_1779017164417_3162')utility=true;
  // v23.0(맵 확인): '처형'(조로 전설 — 라인몹 체력 15% 이하 확정 즉사,
  // 카벤딧슈 — 암브 75중첩 즉사)은 엔진 프리미티브가 유닛삭제와 동일
  // (최대체력 ×2 카오스 킬) — 같은 라인 정리 축으로 합산한다.
  const mana=abilityValue(u,'마나 재생'),attackRaw=abilityValue(u,'공격력 증가'),triggerAttack=abilityValue(u,'발동공격력 증가'),speed=abilityValue(u,'공격속도 증가'),regen=abilityValue(u,'체력 재생'),deletion=abilityBool(u,'유닛삭제')||abilityBool(u,'처형');
  const profile={family,stun:round6(stun),slow,triggerSlow,singleSlow,armor,triggerArmor,singleArmor,stackArmor,boss,frenzy,single,end,magicDef,magicAmp,explosionAmp,mana,attack:Math.max(0,attackRaw),attackPenalty:Math.max(0,-attackRaw),triggerAttack,speed,regen,armorBreak,armorBreakWeight:round2(armorBreakWeight),utility,sharedUtility,supportDamage,percent,deletion};if(u&&typeof u==='object')ROLE_PROFILE_CACHE.set(u,profile);return profile;
}

function partnerNameTokens(u){
  const raw=nameOf(u).replace(/^\([A-Z]\)\s*/i,'').replace(/\([^)]*\)/g,' ').replace(/\b(?:초월|전설|히든|영원|불멸|제한됨)\b/g,' ').replace(/[^0-9A-Za-z가-힣\s-]/g,' '),words=raw.split(/\s+/).filter(Boolean),tokens=[];if(words.length>=2)tokens.push(`${words[0]} ${words[1]}`);if(words[0])tokens.push(words[0]);if(words.length>1)tokens.push(words[words.length-1]);return[...new Set(tokens.filter(x=>x.length>=2))];
}
function descriptionPartnerSynergy(upper,candidate){
  if(!upper||!candidate||upper.id===candidate.id)return null;const desc=cleanName(upper.desc||'');if(!desc)return null;for(const token of partnerNameTokens(candidate)){let at=desc.indexOf(token);while(at>=0){const window=desc.slice(Math.max(0,at-35),Math.min(desc.length,at+token.length+35));if(/추천|조합|필수|달아|같이|세트|시너지/.test(window))return{label:`설명 직접 연계 · ${token}`,reason:`${nameOf(upper)} 스킬 설명이 ${token}을(를) 추천하거나 필수 연계로 지정합니다.`,source:'unit-desc'};at=desc.indexOf(token,at+token.length);}}return null;
}
function strategyConditions(u,role){
  const desc=cleanName(u&&u.desc||''),out=[],add=value=>{value=String(value||'').replace(/\s+/g,' ').trim();if(value&&!out.includes(value))out.push(value.length>105?`${value.slice(0,102)}…`:value);};if(role.slow<0)add(`자체 이감 ${round2(role.slow)} 페널티`);if(role.armor<0)add(`자체 방깎 ${round2(role.armor)} 페널티`);if(role.attackPenalty)add(`아군 공격력 -${round2(role.attackPenalty)} 페널티`);for(const part of desc.split(/[.\n\[\]]+/)){if(/필수|비례|페널티|특강|성장형|빨리|뉴비|추천 조합|이감이 높|다상위|단일.*끝딜|보조딜러/.test(part))add(part);}return out.slice(0,5);
}

function upperStrategy(u){
  if(!u)return{key:'none',label:'상위 미확정',summary:'메인 상위를 먼저 확정하세요.',needs:[],waives:[],partners:[],conditions:[]};
  const canonical=canonicalUpperId(u.id),role=roleProfile(u),desc=cleanName(u.desc||''),override=UPPER_STRATEGY_OVERRIDES[canonical]||{},needs=(override.needs||[]).map(([key,label,target])=>({key,label,target,reason:`${override.label||'상위'} 핵심 시너지`})),waives=(override.waives||[]).slice();let label=override.label,summary=override.summary;const addNeed=(key,needLabel,target,reason)=>{if(!needs.some(x=>x.key===key))needs.push({key,label:needLabel,target,reason});};
  if(/보조딜러\s*필수/.test(desc))addNeed('subdamage','보조·폭발딜',1,'상위 스킬 설명의 보조딜러 필수 조건');
  // v16.9: 공략 근거 라인 자립도 표.  support인데 별도 라인 보강 요구
  // (예: 드래곤 단일·끝딜)가 없으면 보조·폭발딜 1을 요구하고, self는
  // 설명 추정 규칙보다 우선해 자립으로 확정한다.
  const lineProfile=UPPER_LINE_PROFILE[canonical]||UPPER_LINE_PROFILE[u.id]||null;
  if(lineProfile&&lineProfile.line==='support'&&lineProfile.covered!=='single-end')addNeed('subdamage','보조·폭발딜(라인 보강)',1,'공략 근거: 상위 자체 라인딜 보강 필요');
  // v16.8: 상위 자체 라인딜이 약하다고 명시된 경우(예: 크로커다일 '약한
  // 스킬딜러') 보조·폭발딜을 필수 역할로 요구한다 — 50라 보스 라인 붕괴의
  // 재발 방지 규칙.  공략 근거 self로 확정된 상위에는 적용하지 않는다.
  if((!lineProfile||lineProfile.line!=='self')&&/약한\s*스킬\s*딜러|약한\s*스킬딜|라인딜?이?\s*(?:약|부족|빈)/.test(desc))addNeed('subdamage','보조·폭발딜(라인 보강)',1,'상위 스킬 설명의 약한 라인딜 조건');if(/암브.*필수|필수.*암브/.test(desc))addNeed('armorBreak','암브 연계',1,'상위 스킬 설명의 암브 필수 조건');if(/공속.*(?:필수|챙)/.test(desc))addNeed('speed','공속 보강',20,'상위 스킬 설명의 공속 조건');if(/체젠.*필수/.test(desc))addNeed('regen','체젠 버프',2,'체젠 비례 스킬 조건');if(/공증이 있어야|공증.*필수/.test(desc))addNeed('attack','공증 버프',30,'공증 조건부 스킬');if(/보잡.*필수|보스.*필요/.test(desc))addNeed('boss','보잡',1,'상위 설명의 보잡 필수 조건');
  if(!label&&role.family==='physical'&&role.armorBreak){label='암브 연계형 물딜';summary='암브 수와 방깎을 함께 올릴 때 효율이 커집니다.';addNeed('armorBreak','암브 연계',1,'암브 계열 상위 조건');}
  if(!label&&role.family==='physical'&&(role.attack||role.speed)){label='버프·범위딜형 물딜';summary=`풀방깎을 먼저 맞추고 ${role.attack?`공증 ${round2(role.attack)}`:''}${role.attack&&role.speed?' · ':''}${role.speed?`공속 ${round2(role.speed)}`:''} 버프를 스플·스킬딜러에 연결합니다.`;}
  if(!label&&role.family==='physical'){label=role.supportDamage?'보조·폭발딜형 물딜':'물리 스킬·범위딜형';summary='풀방깎을 먼저 맞추고 부족한 공속·보잡·이감을 실제 보유 스킬에서 보강합니다.';}
  if(!label&&role.family==='magic'&&(role.single||role.end)){label='단일·끝딜형 마딜';summary='풀이감과 광보잡을 확보한 뒤 단일·끝딜 배치로 라인을 처리합니다.';}
  if(!label&&role.family==='magic'&&(role.magicDef||role.magicAmp||role.explosionAmp)){label='마방깎·증폭 연계형 마딜';summary='마방깎·마뎀증·폭뎀증 종류를 구분해 해당 데미지 유닛과 연결합니다.';}
  if(!label&&role.family==='magic'){label='라인딜·폭발딜형 마딜';summary='두 번째 상위, 마방깎·증폭, 광보잡을 실제 스킬에 맞춰 보강합니다.';}
  if(!label){label='복합 상위';summary='실제 상시·발동 스킬과 현재 결손의 순증으로 파트너를 고릅니다.';}
  const partners=UPPER_PAIR_SYNERGIES.filter(x=>canonicalUpperId(x.a)===canonical||canonicalUpperId(x.b)===canonical).map(x=>({unitId:canonicalUpperId(x.a)===canonical?x.b:x.a,label:x.label,reason:x.reason})),conditions=strategyConditions(u,role);
  return{key:override.key||'generic',label,summary,needs,waives,partners,conditions,description:desc,attackPenalty:role.attackPenalty,lineSelf:lineProfile?lineProfile.line:needs.some(x=>x.key==='subdamage')?'support':'unknown',lineNote:lineProfile&&lineProfile.note||''};
}

function skillFacts(u){
  const r=roleProfile(u),always=[],trigger=[],research=[],researchVariants=[],penalties=[],mechanics=[],stunMeta=stunResearch(u),measuredStun=!!stunMeta,push=(list,key,label,value)=>{if(value===true||num(value)>0)list.push({key,label,value:value===true?1:round3(value)});},penalty=(key,label,value)=>{if(num(value)<0)penalties.push({key,label,value:round3(value)});};
  if(stunMeta)research.push({key:'stun',label:stunMeta.active?'조건부 연구표 유효 스턴':'연구표 유효 스턴',value:stunMeta.displayStun,capture:stunMeta.capture,activeCondition:stunMeta.active?stunMeta.condition:''});else push(always,'stun','유효 스턴',r.stun);if(stunMeta&&stunMeta.variant)researchVariants.push({key:'stun',label:stunMeta.variant.label,value:stunMeta.variant.displayStun,capture:stunMeta.variant.capture,active:stunMeta.active});push(always,'slow','상시 이감',r.slow);penalty('slow','이감 페널티',r.slow);push(trigger,'triggerSlow','발동 이감',r.triggerSlow);penalty('triggerSlow','발동 이감 페널티',r.triggerSlow);push(always,'singleSlow','단일 이감',r.singleSlow);push(always,'armor','상시 방깎',r.armor);penalty('armor','방깎 페널티',r.armor);push(trigger,'triggerArmor','발동 방깎',r.triggerArmor);penalty('triggerArmor','발동 방깎 페널티',r.triggerArmor);push(always,'singleArmor','단일 방깎',r.singleArmor);push(always,'stackArmor','중첩 방깎',r.stackArmor);push(always,'magicDef','마방깎',r.magicDef);push(always,'magicAmp','마뎀증',r.magicAmp);push(always,'explosionAmp','폭뎀증',r.explosionAmp);push(always,'attack','공증',r.attack);if(r.attackPenalty)penalties.push({key:'attackPenalty',label:'아군 공증 페널티',value:-round2(r.attackPenalty)});push(trigger,'triggerAttack','발동 공증',r.triggerAttack);push(always,'speed','공속',r.speed);push(always,'regen','체젠',r.regen);push(always,'mana','마젠',r.mana);push(always,'single','단일',r.single);push(always,'end','끝딜',r.end);
  if(r.armorBreak)mechanics.push({key:'armorBreak',label:'아머브레이크'});if(r.boss&&r.frenzy)mechanics.push({key:'bossFrenzy',label:'광보잡'});else if(r.boss)mechanics.push({key:'boss',label:'보잡'});else if(r.frenzy)mechanics.push({key:'frenzy',label:'광폭 처리'});if(r.percent)mechanics.push({key:'percent',label:'범위 퍼센트 딜'});if(r.supportDamage)mechanics.push({key:'supportDamage',label:'보조·폭발딜'});if(r.deletion)mechanics.push({key:'deletion',label:'유닛 삭제'});
  return{always,trigger,research,researchVariants,penalties,mechanics,measuredStun,source:'2.305 abilities + 유효 스턴 연구표'};
}

function storyGrade(u){
  if(!u)return{score:0,tier:'—',label:'스토리 —',note:'유닛 정보 없음',basis:'na',basisLabel:'해당 없음',measured:false};const measured=storyMeasuredLookup(u.id);if(measured){const row=measured.row,rank=num(row.rank),tier=storyMeasuredTier(row.tableTier),score=storyMeasuredScore(rank,measured.source.maxRank),metric=storyMeasuredMetric(row),variants=Array.isArray(row.variants)?row.variants.slice():[row],note=[`${measured.source.label} 실측 ${rank}위`,metric,row.note].filter(Boolean).join(' · ');return{score,tier,label:`스토리 ${tier} · ${rank}위`,note,basis:'measured',basisLabel:'실측',measured:true,rank,storyRank:rank,tableTier:num(row.tableTier),metricType:row.metricType,value:num(row.value),approximate:!!row.approximate,stateKey:row.stateKey||'',scope:measured.source.key,aliasOf:row.aliasOf||'',rankBasis:'measured-rank',measurement:row,variants,variantCount:variants.length};}const raw=STORY_RARE_BENCHMARKS[u.id];if(raw){const score=Math.round(20+80*(raw-STORY_RARE_MIN)/Math.max(1,STORY_RARE_MAX-STORY_RARE_MIN)),tier=score>=85?'S':score>=70?'A':score>=52?'B':score>=35?'C':'D';return{score,tier,label:`스토리 ${tier}`,note:`희귀 스토리 데미지 ${(raw/100).toFixed(2)}%`,basis:'measured',basisLabel:'실측',measured:true};}
  const known=STORY_RESEARCHED[u.id];if(known)return{score:known.score,tier:known.tier,label:`스토리 ${known.tier}`,note:known.note,basis:'research',basisLabel:'자료',measured:false};
  if(isItem(u)||['unit_1746119237460_7641','RANDOM'].includes(u.id))return{score:0,tier:'—',label:'스토리 —',note:'아이템·기준 안내 행으로 스토리 전투 등급 없음',basis:'na',basisLabel:'해당 없음',measured:false};
  const r=roleProfile(u);let score=24+(r.supportDamage?16:0)+(r.percent?10:0)+(r.boss?8:0)+(r.frenzy?8:0)+Math.min(15,Math.max(0,r.armor+r.triggerArmor)*.25)+Math.min(12,(r.single+r.end)*6);score=clamp(Math.round(score),15,78);const tier=score>=70?'A':score>=52?'B':score>=35?'C':'D',materialTier=isCommon(u)||isUncommon(u)||isSpecialTier(u);return{score,tier,label:`스토리 ${tier}`,note:materialTier?'재료 단계 유닛 · 스킬 역할 기반 추정, DPS 실측 아님':'스킬 역할 기반 추정 · 스토리 DPS 실측 아님',basis:'estimated',basisLabel:'추정',measured:false};
}

// Story combat data comes from three incomparable sources.  Keep the raw
// source grade above intact for recommendation compatibility, and derive the
// user-facing league grade separately.  The source rank is never inferred for
// an unmeasured unit.
function storyLeagueKey(u,grade){
  if(!u)return'';const g=grade||storyGrade(u);
  if(isRare(u))return'rare';
  if(g.scope==='upper'||isUpper(u))return'upper';
  if(g.scope==='nonupper'||isLegendish(u))return'legend';
  return'';
}
function storyLeagueTier(rank,size){
  const r=Math.max(0,num(rank)),n=Math.max(0,num(size));if(!r||!n||r>n)return'—';
  // Preserve the equal-quantile policy with the requested nine bands. Using
  // cumulative ceil boundaries assigns every source rank exactly once while
  // keeping the best rank in S and the last rank in F for every league size.
  const index=STORY_GRADE_TIERS.findIndex((tier,offset)=>r<=Math.ceil(n*(offset+1)/STORY_GRADE_TIERS.length));
  return STORY_GRADE_TIERS[index<0?STORY_GRADE_TIERS.length-1:index];
}
function storyLeagueGrade(u,sourceGrade){
  if(!u)return null;const source=sourceGrade||storyGrade(u),league=storyLeagueKey(u,source),meta=STORY_LEAGUES[league];if(!meta)return null;
  let leagueRank=0;
  if(league==='rare'&&STORY_RARE_RANKS[u.id])leagueRank=STORY_RARE_RANKS[u.id];
  else if(league==='upper'&&source.scope==='upper'&&num(source.storyRank)>0)leagueRank=num(source.storyRank);
  else if(league==='legend'&&source.scope==='nonupper'&&num(source.storyRank)>0)leagueRank=num(source.storyRank);
  const ranked=leagueRank>0,leagueScore=ranked?storyMeasuredScore(leagueRank,meta.size):null,leagueTier=ranked?storyLeagueTier(leagueRank,meta.size):source.tier;
  const rankText=ranked?`${leagueRank}/${meta.size}위`:'순위 외';
  return Object.assign({},source,{
    sourceTier:source.tier,sourceScore:source.score,sourceLabel:source.label,sourceNote:source.note,sourceRank:num(source.storyRank)||0,sourceTableTier:num(source.tableTier)||0,
    storyGroup:league,storyGroupLabel:meta.label,league,leagueLabel:meta.label,leagueRank:ranked?leagueRank:null,leagueSize:meta.size,leagueScore,leagueTier,
    tier:leagueTier,score:ranked?leagueScore:source.score,label:`${meta.label} 스토리 ${leagueTier} · ${rankText}`,note:`${meta.label} 리그 ${rankText} · ${source.note}`,
    leagueRanked:ranked,leagueBasis:ranked?'measured-rank':'unranked-estimate'
  });
}
function storyLeagueRows(units,league){
  const requested=STORY_LEAGUES[league]?league:'';
  return(units||[]).map(unit=>{const sourceGrade=storyGrade(unit),grade=storyLeagueGrade(unit,sourceGrade);return grade?{unit,grade,sourceGrade,league:grade.league}:null;}).filter(row=>row&&(!requested||row.league===requested)).sort((a,b)=>{
    const ar=a.grade.leagueRanked,br=b.grade.leagueRanked;if(ar!==br)return ar?-1:1;
    if(ar&&br&&a.grade.leagueRank!==b.grade.leagueRank)return a.grade.leagueRank-b.grade.leagueRank;
    const basisRank={measured:0,research:1,estimated:2,na:3},ab=basisRank[a.sourceGrade.basis]??4,bb=basisRank[b.sourceGrade.basis]??4;
    return ab-bb||num(b.sourceGrade.score)-num(a.sourceGrade.score)||displayNameOf(a.unit).localeCompare(displayNameOf(b.unit),'ko');
  });
}

function buildDb(units){
  const list=(units||[]).map(u=>Object.assign({},u,{name:cleanName(u.name)})),byId=new Map(list.map(u=>[u.id,u])),byGroup=new Map();
  for(const u of list){const g=groupName(u);if(!byGroup.has(g))byGroup.set(g,[]);byGroup.get(g).push(u);}
  return{units:list,byId,byGroup,commons:list.filter(u=>isCommon(u)&&COMMON_NAMES.includes(nameOf(u))),uncommons:list.filter(isUncommon),specials:list.filter(isSpecialTier),rares:list.filter(isRare),legendish:list.filter(isLegendish),uppers:list.filter(isUpper)};
}
// v19.7(호환 ①): 유닛 이름 정규화 — 도우미 문서마다 공백·괄호 표기가
// 흔들려도 같은 유닛으로 붙게 한다.
function normalizeLiveName(value){return String(value||'').replace(/\s+/g,'').replace(/[()\[\]{}·.,'"!?~\-]/g,'').toLowerCase();}
function liveIdMatchRate(catalog,snapshot){
  const ids=new Set((catalog||[]).map(u=>u.id));const rows=snapshot&&snapshot.units||[];
  if(!rows.length)return 1;let hit=0;for(const row of rows)if(ids.has(String(row.id)))hit++;
  return hit/rows.length;
}
function mergeLiveCatalog(catalog,snapshot){
  const liveMap=new Map();for(const row of snapshot&&snapshot.units||[]){const d=row.data||row;liveMap.set(row.id,Object.assign({},d,row));}
  // v19.7(호환 ①): 다른 도우미 문서는 같은 유닛이라도 id가 문서 생성 시각
  // 기반이라 전부 다르다 — id 일치율이 절반 미만이면 이름 정규화로 2차
  // 매핑한다.  이름이 카탈로그 안에서 유일할 때만 붙여 오매핑을 막고,
  // 32172/34366(일치율 ~1)에서는 아무것도 바뀌지 않는다.
  const catalogIds=new Set((catalog||[]).map(u=>u.id));
  let idHits=0;for(const id of liveMap.keys())if(catalogIds.has(String(id)))idHits++;
  if(liveMap.size&&idHits/liveMap.size<0.5){
    const nameIndex=new Map();
    for(const u of catalog||[]){const key=normalizeLiveName(u.name);if(!key)continue;nameIndex.set(key,nameIndex.has(key)?null:u);}
    for(const [id,live] of Array.from(liveMap)){
      if(catalogIds.has(String(id)))continue;
      const target=nameIndex.get(normalizeLiveName(live.name));
      if(target&&target.id!==id&&!liveMap.has(target.id)){liveMap.delete(id);liveMap.set(target.id,Object.assign({},live,{id:target.id,remappedFrom:String(id)}));}
    }
  }
  const out=[];for(const base of catalog||[]){const live=liveMap.get(base.id)||{},hasLiveAbilities=Object.prototype.hasOwnProperty.call(live,'abilities'),merged=Object.assign({},base,live,{abilities:hasLiveAbilities?Object.assign({},live.abilities||{}):Object.assign({},base.abilities||{})});merged.tmoPercent=live.tmoPercent!=null?num(live.tmoPercent):live.percent!=null?num(live.percent):num(base.percent);merged.count=live.count!=null?num(live.count):0;out.push(merged);}
  for(const [id,live] of liveMap){if(!out.some(u=>u.id===id))out.push(Object.assign({},live));}return out;
}
// v18.1 — TMO 읽기 누락 보정.
//
// 실전 로그 20260728_170254에서 사용자가 고정한 상위 (S)료쿠규가 스냅샷에서
// **스무 번** 사라졌다 되돌아왔다.  같은 스냅샷에서 다른 유닛은 하나도
// 바뀌지 않았고 관측 신뢰도는 0.998이었다 — 제작으로 소비된 것이 아니라
// 그 유닛 하나만 목록에서 빠진 것이다.
//
// 소실 구간 길이는 스무 번 모두 읽기 1~3회였고 영구 소실은 0건이었다.
// 그런데 한 번 빠질 때마다 역할표가 통째로 무너졌다: 상위 1→0, 방깎 92→57,
// 이감 42.5→30.  판정은 그때마다 완전히 다른 판을 보고 다시 계산했고,
// 그래서 화면의 "지금 할 일"이 만드는 도중에 바뀌었다.  같은 라운드 안에서
// readiness가 76↔50을 네 번 오간 라운드도 있다(r45).
//
// 그래서 최종 등급 유닛(상위·전설급)은 근거 없이 사라지면 직전 값을
// 잠시 유지한다.  실제로 소비된 경우는 그 소비를 설명하는 제작이 있고,
// 진짜로 없어졌다면 몇 번 더 읽어도 돌아오지 않으므로 그때 받아들인다.
// 흔함·안흔함·희귀는 제외한다 — 재료로 정상 소비되는 등급이라 유지하면
// 오히려 장부가 틀어진다.
const FINAL_UNIT_HOLD_READS=4;
function stabilizeFinalUnits(previous,counts,db,options){
  const prior=previous&&previous.counts||{},misses=Object.assign({},previous&&previous.misses||{});
  const next=Object.assign({},counts||{}),held=[],released=[];
  const explained=new Set((options&&options.consumed||[]).map(String));
  const limit=Math.max(1,num(options&&options.maxHold)||FINAL_UNIT_HOLD_READS);
  const ids=new Set([...Object.keys(prior),...Object.keys(next)]);
  for(const id of ids){
    const unit=db&&db.byId&&db.byId.get(id);
    if(!unit||!(isUpper(unit)||isLegendish(unit)))continue;
    const before=num(prior[id]),now=num(next[id]);
    if(now>=before){delete misses[id];continue;}
    // 제작이 이 유닛을 재료로 먹었다면 줄어드는 게 정상이다.
    if(explained.has(id)){delete misses[id];continue;}
    const seen=num(misses[id])+1;
    if(seen>=limit){delete misses[id];released.push({id,name:displayNameOf(unit),from:before,to:now});continue;}
    misses[id]=seen;
    next[id]=before;
    held.push({id,name:displayNameOf(unit),qty:before,observed:now,reads:seen,limit});
  }
  return{counts:next,misses,held,released};
}
// v19.5(점검 결함): 판단 1회마다 mergeLiveCatalog+buildDb 로 300+ 유닛
// 카탈로그를 통째로 재구축했고(한 판 결정 400회+), db/유닛 객체를 키로 쓰는
// 캐시 3종(recipeProfile·roleProfile·상위 순위 LRU)이 매번 함께 무효화됐다.
// dataHash 는 id:count:tmoPercent+현재능력치를 전부 커버하므로(content-tmo
// hashSnapshot), 같은 catalog 참조 + 같은 dataHash 면 merged/db 는 결정적으로
// 동일하다 — 그 경우 재사용한다.  dataHash 가 없는 스냅샷(합성·재생 일부)은
// 예전처럼 매번 새로 만든다.
const MERGED_DB_MEMO=new WeakMap();
function mergedDbFor(catalog,snapshot){
  const key=String(snapshot&&snapshot.dataHash||'');
  if(key&&Array.isArray(catalog)){
    const hit=MERGED_DB_MEMO.get(catalog);
    if(hit&&hit.key===key)return hit;
    const units=mergeLiveCatalog(catalog,snapshot||{}),entry={key,units,db:buildDb(units)};
    MERGED_DB_MEMO.set(catalog,entry);
    return entry;
  }
  const units=mergeLiveCatalog(catalog,snapshot||{});
  return{key:'',units,db:buildDb(units)};
}
function normalizeState(catalog,snapshot,settings){
  const shared=mergedDbFor(catalog,snapshot),merged=shared.units,db=shared.db,rawCounts=Object.assign({},snapshot&&snapshot.counts||{});
  for(const u of merged){if(u.count!=null&&!Object.prototype.hasOwnProperty.call(rawCounts,u.id))rawCounts[u.id]=num(u.count);}const counts=Object.assign({},rawCounts),manual=settings&&settings.manualCounts||{};
  for(const [id,v] of Object.entries(manual)){if(v!==''&&v!=null)counts[id]=Math.max(0,num(v));}
  // v17.6(감사 P0-2): 자격 없는 ID(압살롬·비특별·미존재)는 무시한다 —
  // 규칙상 불가능한 가상 재료가 추천 계산에 섞이지 않게.
  let virtualResolved=false,virtualApplied=false;const requestedVirtualId=settings&&settings.virtualSpecialId||'',virtualId=eligible152SpecialId(db,requestedVirtualId)?requestedVirtualId:'',baselineId=String(settings&&settings.virtualSpecialBaselineId||''),baselineCaptured=!!virtualId&&baselineId===virtualId&&Object.prototype.hasOwnProperty.call(settings||{},'virtualSpecialBaselineCount'),virtualBaselineCount=baselineCaptured?Math.max(0,Math.floor(num(settings.virtualSpecialBaselineCount))):0,rawVirtualCount=num(rawCounts[virtualId]);
  if(virtualId){
    virtualResolved=baselineCaptured?rawVirtualCount>virtualBaselineCount:rawVirtualCount>0;
    if(!virtualResolved){counts[virtualId]=Math.max(0,num(counts[virtualId]))+1;virtualApplied=true;}
  }
  if(settings&&(settings.superKumaOwned===false||['rayleigh','chest'].includes(String(settings.story10Reward||''))))counts[SUPER_KUMA_ID]=0;else counts[SUPER_KUMA_ID]=Math.max(1,num(counts[SUPER_KUMA_ID])); // v22.2: 스토리 10 몰수 배선
  const wispOverride=settings&&settings.wispOverride;if(wispOverride!==''&&wispOverride!=null)counts[WISP_ID]=Math.max(0,num(wispOverride));
  const currentAbilities={};for(const [k,v] of Object.entries(snapshot&&snapshot.currentAbilities||{}))currentAbilities[canonicalAbility(k)]=num(v);
  const percent={};for(const u of merged)percent[u.id]=clamp(num(u.tmoPercent),0,100);
  return{db,units:merged,rawCounts,counts,currentAbilities,percent,wisp:num(counts[WISP_ID]),virtualId,virtualResolved,virtualApplied,virtualSpecialBaselineId:baselineCaptured?baselineId:'',virtualSpecialBaselineCount:virtualBaselineCount,stunConditions:{},snapshot:snapshot||{}};
}

function cloneCounts(c){return Object.assign({},c||{});}
function addTo(map,id,v){if(num(v)>0)map[id]=(map[id]||0)+num(v);}
function recipeSolve(db,targetId,initialCounts){
  const stock=cloneCounts(initialCounts),missing={},direct=[],commonRequired={},commonUsed={},lowestMissing={},rareUse={},specialUse={},consumed={},cycles=[],buildNeeded={common:{},uncommon:{},special:{},rare:{},upper:{},legend:{},hard:{},other:{}};let wispCost=0;
  const target=db.byId.get(targetId);
  function acquire(id,qty,stack){
    qty=num(qty);if(qty<=0)return;if(id===WISP_ID){wispCost+=qty;return;}
    const u=db.byId.get(id),tier=u?tierKey(u):(SPECIAL_IDS[id]?'hard':'other');if(tier==='common')addTo(commonRequired,id,qty);
    const have=Math.min(num(stock[id]),qty);if(have>0){stock[id]-=have;addTo(consumed,id,have);if(tier==='common')addTo(commonUsed,id,have);if(tier==='rare')addTo(rareUse,id,have);if(tier==='special')addTo(specialUse,id,have);qty-=have;}
    if(qty<=0)return;addTo(buildNeeded[tier]||(buildNeeded[tier]={}),id,qty);if(tier==='common')addTo(lowestMissing,id,qty);
    if(stack.has(id)){addTo(missing,id,qty);cycles.push(id);return;}
    if(!u||!Array.isArray(u.stuffs)||!u.stuffs.length||tier==='hard'||isItem(u)||isRandom(u)||isMystic(u)){addTo(missing,id,qty);return;}
    const next=new Set(stack);next.add(id);for(const s of u.stuffs||[])acquire(s.id,num(s.count)*qty,next);
  }
  if(target){for(const s of target.stuffs||[])direct.push({id:s.id,count:num(s.count),owned:num(stock[s.id])});}
  acquire(targetId,1,new Set());
  const missingByTier={common:{},uncommon:{},special:{},rare:{},hard:{},other:{}};for(const [id,c] of Object.entries(missing)){const u=db.byId.get(id),t=u?tierKey(u):(SPECIAL_IDS[id]?'hard':'other');if(!missingByTier[t])missingByTier[t]={};missingByTier[t][id]=c;}
  const hardMissing=Object.entries(missingByTier.hard||{}).map(([id,count])=>({id,count,name:SPECIAL_IDS[id]||nameOf(db.byId.get(id))||id}));
  return{target,targetId,wispCost,stockAfter:stock,missing,missingByTier,buildNeeded,hardMissing,direct,commonSpend:commonRequired,commonRequired,commonUsed,lowestMissing,rareUse,specialUse,consumed,cycles};
}
// Predict the *change* that one scenario-only material would cause to TMO's
// displayed completion.  The live TMO value remains the anchor: we only add
// the counterfactual fraction of the recipe that becomes satisfied.  This is
// deliberately not presented as a second observed TMO value.
//
// A Rare recipe ultimately expands to selection-wisp/common equivalents.  By
// solving the exact same hand before and after the added material, the freed
// lower materials are naturally re-used by the remaining branches.  Dividing
// that marginal saving by the empty-hand recipe cost gives a stable estimate
// without inventing a per-tier weight table.
function predictCompletionWithAddedMaterial(db,targetId,beforeCounts,afterCounts,observedPercent,materialId){
  const observed=clamp(num(observedPercent),0,100),base={
    observed,expected:observed,display:Math.floor(observed),delta:0,
    projected:false,estimated:false,materialId:String(materialId||''),
    method:'observed-tmo',reason:'no-counterfactual-material',
    recipe:{totalWispEquivalent:0,beforeWispEquivalent:0,afterWispEquivalent:0,savedWispEquivalent:0,materialConsumed:0}
  };
  if(!db||!db.byId||!db.byId.has(targetId)||!materialId)return base;
  const before=recipeSolve(db,targetId,beforeCounts||{}),after=recipeSolve(db,targetId,afterCounts||{}),empty=recipeSolve(db,targetId,{}),beforeUse=num(before.consumed&&before.consumed[materialId]),afterUse=num(after.consumed&&after.consumed[materialId]),materialConsumed=Math.max(0,afterUse-beforeUse),total=Math.max(0,num(empty.wispCost)),saved=Math.max(0,num(before.wispCost)-num(after.wispCost));
  const recipe={totalWispEquivalent:total,beforeWispEquivalent:num(before.wispCost),afterWispEquivalent:num(after.wispCost),savedWispEquivalent:saved,materialConsumed,cyclesBefore:(before.cycles||[]).slice(),cyclesAfter:(after.cycles||[]).slice()};
  if(materialConsumed<=0)return Object.assign({},base,{reason:'selected-material-not-used',recipe});
  if(total<=0)return Object.assign({},base,{reason:'recipe-has-no-wisp-equivalent-basis',recipe});
  if((before.cycles||[]).length||(after.cycles||[]).length)return Object.assign({},base,{reason:'recipe-cycle-prevents-estimate',recipe});
  if(saved<=0)return Object.assign({},base,{reason:'selected-material-does-not-reduce-recipe-distance',recipe});
  const delta=round2(100*saved/total),expected=round2(clamp(observed+delta,0,100));
  return{observed,expected,display:Math.floor(expected),delta:round2(expected-observed),projected:true,estimated:true,materialId:String(materialId),method:'observed-tmo-plus-recipe-counterfactual',reason:'selected-material-reduces-exact-recipe-distance',recipe};
}
function reserveTargets(db,counts,targetIds){
  const unique=[...new Set((targetIds||[]).filter(Boolean))];
  function contains(parentId,childId,path){if(parentId===childId)return true;if(path.has(parentId))return false;const u=db.byId.get(parentId);if(!u)return false;const next=new Set(path);next.add(parentId);return(u.stuffs||[]).some(s=>contains(s.id,childId,next));}
  const roots=unique.filter(id=>!unique.some(other=>other!==id&&contains(other,id,new Set())));
  let stock=cloneCounts(counts),remainingWisp=num(counts&&counts[WISP_ID]),reservedWispCost=0;const reservations=[];
  for(const id of roots){const r=recipeSolve(db,id,stock);stock=r.stockAfter;remainingWisp=Math.max(0,remainingWisp-r.wispCost);stock[WISP_ID]=remainingWisp;reservedWispCost+=r.wispCost;reservations.push(r);}
  return{stock,reservations,remainingWisp,reservedWispCost};
}
function materialName(db,id){return SPECIAL_IDS[id]||nameOf(db.byId.get(id))||id;}
function mapText(db,map,limit=8){return Object.entries(map||{}).sort((a,b)=>num(b[1])-num(a[1])).slice(0,limit).map(([id,c])=>`${materialName(db,id)} ${c}`).join(' · ')||'없음';}
function commonTop(db,map,limit=3){return Object.entries(map||{}).sort((a,b)=>num(b[1])-num(a[1])).slice(0,limit).map(([id,count])=>({id,name:materialName(db,id),count,color:COMMON_COLORS[materialName(db,id)]||'#64748b'}));}

// TMO 레시피에는 일반 조합으로 만들 수 없는 선행 재료/유닛도 stuffs로 함께 들어옵니다.
// 이들은 완성도와 별개로 실제 패에 잡힌 뒤에만 추천 후보가 될 수 있습니다.
function specialPrerequisiteMeta(db,id){
  if(!id||id===WISP_ID)return null;const u=db&&db.byId&&db.byId.get(id);
  if(id===RAYLEIGH_HIDDEN_ID)return{kind:'rayleigh',name:materialName(db,id)};
  if(id===PIRATE_SHIP_MATERIAL_ID||isShip(u))return{kind:'ship',name:materialName(db,id)};
  // v23.0: 2312 카탈로그가 '특수재료' 그룹을 해체하고 그린블러드·토큰·
  // 고대의 배 등을 '기타'로 옮겼다 — isItem(/아이템|기타/)이 먼저 잡으면
  // kind 가 item 으로 바뀌어 베가펑크 계열 게이트가 풀린다.  경성 특수
  // 판정(hard/랜덤유닛)을 item 보다 먼저 둔다.
  if(isRandom(u)||u&&u.hardSpecial===true||u&&tierKey(u)==='hard')return{kind:'special',name:materialName(db,id)};
  if(isItem(u))return{kind:'item',name:materialName(db,id)};
  return null;
}
function specialPrerequisiteStatus(db,unit,counts){
  const stock=cloneCounts(counts),missingById=new Map(),path=new Set();let exception=false;
  const addMissing=(id,count,meta)=>{const previous=missingById.get(id);if(previous)previous.count+=count;else missingById.set(id,{id,name:meta.name||materialName(db,id),count,kind:meta.kind});};
  function acquire(id,quantity,underAbsalom){
    let qty=Math.max(0,num(quantity));if(qty<=0||id===WISP_ID)return;
    const have=Math.min(Math.max(0,num(stock[id])),qty);if(have>0){stock[id]-=have;qty-=have;}if(qty<=0)return;
    const u=db&&db.byId&&db.byId.get(id),meta=specialPrerequisiteMeta(db,id);
    if(meta){if(underAbsalom){exception=true;return;}addMissing(id,qty,meta);return;}
    if(!u||!Array.isArray(u.stuffs)||!u.stuffs.length||path.has(id))return;
    path.add(id);const childUnderAbsalom=underAbsalom||isAbsalom(u);for(const stuff of u.stuffs)acquire(stuff.id,num(stuff.count)*qty,childUnderAbsalom);path.delete(id);
  }
  if(unit&&Array.isArray(unit.stuffs)){const underAbsalom=isAbsalom(unit);for(const stuff of unit.stuffs)acquire(stuff.id,num(stuff.count),underAbsalom);}
  const missing=[...missingById.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko')||String(a.id).localeCompare(String(b.id))),allowed=missing.length===0;
  return{allowed,blocked:!allowed,missing,exception};
}

function completionPercent(state,u){return clamp(num(state.percent[u.id]),0,100);}
// v20.2(사용자 요청 "완성도 %가 안보이니까 불편한데"): 데스크톱 셸에는
// TMO 도우미 화면이 없어 percent 가 전부 0이다(그 값은 TMO 페이지가
// 계산해 DOM 에 싣는 것이라 /datas 에는 없다).  그래서 같은 자리에
// **코치가 정확 원장으로 직접 계산한 재료 진행도**를 낸다.
//
// 정의: 이 유닛을 지금부터 만들 때 필요한 최하위(흔함) 재료 총량 대비,
// 이미 갖고 있어서 더 안 모아도 되는 비율.  빈 패 기준 총량을 분모로,
// 현재 패 기준 남은 부족분을 분자로 쓴다 — 둘 다 recipeSolve 의 정확
// 원장이라 추정이 아니다.
//
// TMO 의 % 와 같은 수치라고 주장하지 않는다(대조할 실측 로그가 없다).
// 화면에서도 "코치 계산"이라고 이름을 달아 출처를 섞지 않는다.
function ledgerCompletion(db,targetId,counts){
  const id=String(targetId||''),unit=db&&db.byId&&db.byId.get(id);
  if(!unit)return null;
  if(num((counts||{})[id])>0)return{percent:100,owned:true,needTotal:0,needRemain:0,basis:'owned'};
  const sum=obj=>Object.values(obj||{}).reduce((total,value)=>total+num(value),0);
  let base=null,now=null;
  try{base=recipeSolve(db,id,{});now=recipeSolve(db,id,counts||{});}catch(_){return null;}
  const needTotal=sum(base.lowestMissing),needRemain=sum(now.lowestMissing);
  if(needTotal<=0)return{percent:needRemain<=0?100:0,owned:false,needTotal,needRemain,basis:'exact-ledger'};
  const percent=Math.max(0,Math.min(100,Math.round((1-needRemain/needTotal)*100)));
  return{percent,owned:false,needTotal,needRemain,wispCost:num(now.wispCost),basis:'exact-ledger'};
}
function ownedUnits(state,pred){const out=[];for(const u of state.db.units){const c=num(state.counts[u.id]);if(c<=0||pred&&!pred(u))continue;for(let i=0;i<c;i++)out.push(u);}return out;}
function hasRawAbility(state,key){return Object.prototype.hasOwnProperty.call(state.currentAbilities,canonicalAbility(key));}
function rawAbility(state,key){return num(state.currentAbilities[canonicalAbility(key)]);}
function isMeasuredControlUnit(u){return stunTableValue(u)!=null;}
function isRoleBearingUnit(u){return!!u&&!isCommon(u)&&!isUncommon(u)&&(isUpper(u)||isLegendish(u)||isRare(u)||isMeasuredControlUnit(u)||Object.keys(u.abilities||{}).some(key=>['스턴','이동속도 감소','발동이동속도 감소','단일이동속도 감소','방어력 감소','발동방어력 감소','단일방어력 감소','중첩방어력 감소','아머브레이크','보스 잡기','광폭화','단일','끝딜','마나 재생','공격력 증가','발동공격력 증가','공격속도 증가','체력 재생','마법 방어력 감소','마법 대미지 증가','폭발형 대미지 증폭','유닛삭제','처형'].includes(canonicalAbility(key))));}
function ownedRoleUnits(state){
  const raw=ownedUnits(state,isRoleBearingUnit),out=[],variants=new Map();for(const u of raw){if(isUpper(u)&&UPPER_VARIANT_CANONICAL[u.id]){const key=canonicalUpperId(u.id),previous=variants.get(key);if(!previous||upperVariantPriority(u.id)>upperVariantPriority(previous.id))variants.set(key,u);}else out.push(u);}return out.concat([...variants.values()]);
}
function ownedDisplayUnits(state,pred){const raw=ownedUnits(state,pred),out=[],variants=new Map();for(const u of raw){if(isUpper(u)&&UPPER_VARIANT_CANONICAL[u.id]){const key=canonicalUpperId(u.id),previous=variants.get(key);if(!previous||upperVariantPriority(u.id)>upperVariantPriority(previous.id))variants.set(key,u);}else out.push(u);}return out.concat([...variants.values()]);}
function ownedRoleEntries(state){
  const out=[],variants=new Map();for(const u of state.db.units){const count=num(state.counts[u.id]);if(count<=0||!isRoleBearingUnit(u))continue;if(isUpper(u)&&UPPER_VARIANT_CANONICAL[u.id]){const key=canonicalUpperId(u.id),previous=variants.get(key);if(!previous||upperVariantPriority(u.id)>upperVariantPriority(previous.unit.id))variants.set(key,{unit:u,count:1});}else out.push({unit:u,count});}return out.concat([...variants.values()]);
}
// v19.9.2(사용자 교정 + 데이터팩 교차검증): 네코마무시(전설 Z90h)의 보스·
// 광폭 잡기는 물딜 전용 크레딧이다.  사용자 데이터팩(legendary_support_index,
// confidence high)이 네코의 마딜 역할을 빈 배열로 명시하고("보스·광폭
// 체력비례 고정데미지"는 물딜 역할 분류), 0801 단끝 패배가 네코 단독 광보잡
// 의존으로 실전에서 뚫렸다(사용자: "네코마무시는 보잡 성능이 별로").
// 마딜 역할표·기여도·플래너에서만 제외하고 물딜 크레딧은 그대로 둔다.
const MAGIC_BOSS_CREDIT_EXCLUDED=Object.freeze(new Set(['Z90h']));
function bossCreditFor(u,mode){
  if(mode==='magic'&&u&&MAGIC_BOSS_CREDIT_EXCLUDED.has(String(u.id)))return{boss:false,frenzy:false};
  const r=roleProfile(u);return{boss:!!r.boss,frenzy:!!r.frenzy};
}
function ownedRoleCounts(state,mode){
  const entries=ownedRoleEntries(state);let main=0,stun=0,slow=0,triggerSlow=0,triggerSlowSources=0,armor=0,triggerArmor=0,singleArmor=0,stackArmor=0,armorBreak=0,armorBreakUnits=0,single=0,end=0,singleEndUnits=0,singleEndExpected=0,singleEndMax=0,singleEndLargest=0,toki=0,boss=0,frenzy=0,bossFrenzyCreditSum=0,bossOnly=0,frenzyOnly=0,utility=0,subdamage=0,magicDef=0,magicAmp=0,explosionAmp=0,attack=0,triggerAttack=0,speed=0,regen=0,mana=0,deletion=0,total=0;let vegaSeen=false;
  for(const entry of entries){const u=entry.unit,count=isUpper(u)&&/베가펑크/.test(nameOf(u))?(vegaSeen?0:1):entry.count;if(isUpper(u)&&/베가펑크/.test(nameOf(u)))vegaSeen=true;if(count<=0)continue;const r=roleProfile(u),finish=magicFinishProfile(u),n=nameOf(u);total+=count;if(isUpper(u)&&(r.family===mode||r.family==='neutral'))main+=count;stun+=r.stun*count;slow+=r.slow*count;triggerSlow+=r.triggerSlow*count;if(r.triggerSlow>0)triggerSlowSources+=count;armor+=r.armor*count;triggerArmor+=r.triggerArmor*count;singleArmor+=r.singleArmor*count;stackArmor+=r.stackArmor*count;armorBreak+=num(r.armorBreakWeight)*count;if(r.armorBreak)armorBreakUnits+=count;single+=r.single*count;end+=r.end*count;if(finish.directCredit>0)singleEndUnits+=count;singleEndExpected+=finish.directCredit*count;singleEndMax+=finish.maxCredit*count;singleEndLargest=Math.max(singleEndLargest,finish.directCredit);if(/^토키(?:\s|\()/.test(n))toki+=count;const bossCredit=bossCreditFor(u,mode);if(bossCredit.boss)boss+=count;if(bossCredit.frenzy)frenzy+=count;const bfCredit=bossFrenzyCredit(u,bossCredit);if(bfCredit>0)bossFrenzyCreditSum+=bfCredit*count;else if(bossCredit.boss)bossOnly+=count;else if(bossCredit.frenzy)frenzyOnly+=count;if(r.utility)utility+=count;if(r.supportDamage)subdamage+=count;magicDef+=r.magicDef*count;magicAmp+=r.magicAmp*count;explosionAmp+=r.explosionAmp*count;attack+=(r.attack-r.attackPenalty)*count;triggerAttack+=r.triggerAttack*count;speed+=r.speed*count;regen+=r.regen*count;mana+=r.mana*count;if(r.deletion)deletion+=count;}
  return{main,stun:round6(stun),slow:round2(slow),triggerSlow:round2(triggerSlow),triggerSlowSources,armor:round2(armor),triggerArmor:round2(triggerArmor),singleArmor:round2(singleArmor),stackArmor:round2(stackArmor),armorBreak:round2(armorBreak),armorBreakUnits,single:round2(single),end:round2(end),singleEnd:round2(single+end),singleEndUnits:round2(singleEndUnits),singleEndExpected:round2(singleEndExpected),singleEndMax:round2(singleEndMax),singleEndLargest:round2(singleEndLargest),singleEndStable:round2(Math.max(0,singleEndExpected-singleEndLargest)),toki:round2(toki),boss,frenzy,bossFrenzy:round2(bossFrenzyCreditSum+Math.min(bossOnly,frenzyOnly)),utility,subdamage,magicDef:round2(magicDef),magicAmp:round2(magicAmp),explosionAmp:round2(explosionAmp),attack:round2(attack),triggerAttack:round2(triggerAttack),speed:round2(speed),regen:round2(regen),mana:round2(mana),deletion,total};
}
function ownedRawRoleCounts(state){
  const entries=ownedRoleEntries(state);let stun=0,slow=0,triggerSlow=0,armor=0,triggerArmor=0,singleArmor=0,stackArmor=0,armorBreak=0,magicDef=0,magicAmp=0,explosionAmp=0,attack=0,triggerAttack=0,speed=0,regen=0,mana=0;let vegaSeen=false;for(const entry of entries){const u=entry.unit,count=isUpper(u)&&/베가펑크/.test(nameOf(u))?(vegaSeen?0:1):entry.count;if(isUpper(u)&&/베가펑크/.test(nameOf(u)))vegaSeen=true;if(count<=0)continue;stun+=abilityValue(u,'스턴')*count;slow+=abilityValue(u,'이동속도 감소')*count;triggerSlow+=abilityValue(u,'발동이동속도 감소')*count;armor+=abilityValue(u,'방어력 감소')*count;triggerArmor+=abilityValue(u,'발동방어력 감소')*count;singleArmor+=abilityValue(u,'단일방어력 감소')*count;stackArmor+=abilityValue(u,'중첩방어력 감소')*count;armorBreak+=num(roleProfile(u).armorBreakWeight)*count;magicDef+=abilityValue(u,'마법 방어력 감소')*count;magicAmp+=Math.max(abilityValue(u,'마법 대미지 증가'),abilityValue(u,'단일마법 대미지 증가'),abilityValue(u,'모든피해증가'))*count;explosionAmp+=abilityValue(u,'폭발형 대미지 증폭')*count;attack+=abilityValue(u,'공격력 증가')*count;triggerAttack+=abilityValue(u,'발동공격력 증가')*count;speed+=abilityValue(u,'공격속도 증가')*count;regen+=abilityValue(u,'체력 재생')*count;mana+=abilityValue(u,'마나 재생')*count;}return{stun:round6(stun),slow:round2(slow),triggerSlow:round2(triggerSlow),armor:round2(armor),triggerArmor:round2(triggerArmor),singleArmor:round2(singleArmor),stackArmor:round2(stackArmor),armorBreak:round2(armorBreak),magicDef:round2(magicDef),magicAmp:round2(magicAmp),explosionAmp:round2(explosionAmp),attack:round2(attack),triggerAttack:round2(triggerAttack),speed:round2(speed),regen:round2(regen),mana:round2(mana)};
}
function transitionSpec(spec,state,beforeCounts,afterCounts,mode,sourceSuffix){
  const before=ownedRoleCounts(Object.assign({},state,{counts:beforeCounts}),mode),after=ownedRoleCounts(Object.assign({},state,{counts:afterCounts}),mode),out=Object.assign({},spec),signed=new Set(['slow','triggerSlow','armor','triggerArmor','attack','triggerAttack']);for(const key of ['main','stun','slow','triggerSlow','triggerSlowSources','armor','triggerArmor','singleArmor','stackArmor','armorBreak','armorBreakUnits','single','end','singleEndUnits','singleEndExpected','singleEndMax','toki','boss','frenzy','bossFrenzy','utility','subdamage','magicDef','magicAmp','explosionAmp','attack','triggerAttack','speed','regen','mana','deletion']){const value=num(out[key])+num(after[key])-num(before[key]);out[key]=(key==='stun'?round6:round2)(signed.has(key)?value:Math.max(0,value));}out.singleEnd=round2(out.single+out.end);out.singleEndLargest=round2(after.singleEndLargest);out.singleEndStable=round2(Math.max(0,num(out.singleEndExpected)-num(out.singleEndLargest)));if(sourceSuffix)out.source=`${out.source}${sourceSuffix}`;return out;
}
function applyBuildStep(state,spec,stock,unit,mode,availableWisp){
  const before=cloneCounts(stock),solve=recipeSolve(state.db,unit.id,before),after=cloneCounts(solve.stockAfter),remainingWisp=Math.max(0,num(availableWisp)-solve.wispCost);after[WISP_ID]=remainingWisp;after[unit.id]=num(after[unit.id])+1;return{solve,stock:after,remainingWisp,spec:transitionSpec(spec,state,before,after,mode,'')};
}
function projectedCountsForTarget(state,u,baseCounts){
  const before=cloneCounts(baseCounts||state.counts);if(!u||num(before[u.id])>0)return before;const solve=recipeSolve(state.db,u.id,before),after=solve.stockAfter;after[u.id]=num(after[u.id])+1;after[WISP_ID]=Math.max(0,num(before[WISP_ID])-solve.wispCost);return after;
}
function currentSpec(state,mode,settings,projectedUpper){
  const rc=ownedRoleCounts(state,mode),rawRc=ownedRawRoleCounts(state),raw=Object.keys(state.currentAbilities).length>0,corrected=(key,fallback,rawBase,precision=2,signed=false)=>hasRawAbility(state,key)?(precision===6?round6:precision===3?round3:round2)(signed?rawAbility(state,key)+num(fallback)-num(rawBase):Math.max(0,rawAbility(state,key)+num(fallback)-num(rawBase))):fallback;
  const rawMagicKeys=['마법 대미지 증가','단일마법 대미지 증가','모든피해증가'].filter(k=>hasRawAbility(state,k)),magicAmp=rawMagicKeys.length?round2(Math.max(0,Math.max(...rawMagicKeys.map(k=>rawAbility(state,k)))+rc.magicAmp-rawRc.magicAmp)):rc.magicAmp;
  let spec={source:raw?'TMO 원문 + 역할 교정':'보유 유닛 추정',mode,main:rc.main,stun:corrected('스턴',rc.stun,rawRc.stun,6),slow:corrected('이동속도 감소',rc.slow,rawRc.slow,2,true),triggerSlow:corrected('발동이동속도 감소',rc.triggerSlow,rawRc.triggerSlow,2,true),triggerSlowSources:rc.triggerSlowSources,armor:corrected('방어력 감소',rc.armor,rawRc.armor,2,true),triggerArmor:corrected('발동방어력 감소',rc.triggerArmor,rawRc.triggerArmor,2,true),singleArmor:corrected('단일방어력 감소',rc.singleArmor,rawRc.singleArmor),stackArmor:corrected('중첩방어력 감소',rc.stackArmor,rawRc.stackArmor),armorBreak:corrected('아머브레이크',rc.armorBreak,rawRc.armorBreak),armorBreakUnits:rc.armorBreakUnits,single:rc.single,end:rc.end,singleEnd:rc.singleEnd,singleEndUnits:rc.singleEndUnits,singleEndExpected:rc.singleEndExpected,singleEndMax:rc.singleEndMax,singleEndLargest:rc.singleEndLargest,singleEndStable:rc.singleEndStable,toki:rc.toki,boss:rc.boss,frenzy:rc.frenzy,bossFrenzy:rc.bossFrenzy,utility:rc.utility,subdamage:rc.subdamage,magicDef:corrected('마법 방어력 감소',rc.magicDef,rawRc.magicDef),magicAmp,explosionAmp:corrected('폭발형 대미지 증폭',rc.explosionAmp,rawRc.explosionAmp),attack:corrected('공격력 증가',rc.attack,rawRc.attack,2,true),triggerAttack:corrected('발동공격력 증가',rc.triggerAttack,rawRc.triggerAttack,2,true),speed:corrected('공격속도 증가',rc.speed,rawRc.speed),regen:corrected('체력 재생',rc.regen,rawRc.regen),mana:corrected('마나 재생',rc.mana,rawRc.mana),deletion:rc.deletion};
  // v17: 연구소 4종은 다단계가 아니라 1회 구매 체크박스로 확정됐다
  // (2.305 [C]/[R] 동일): 공업 +12% · 이감업 +10%p · 체젠 +0.45/s ·
  // 마젠 +0.8/s.  TMO 애드온은 연구 상태를 전송하지 않으므로 사용자
  // 체크 입력만이 근거이고, 미체크는 0 가산이다.
  const lab=settings&&settings.labResearch||null;
  if(lab&&(lab.attack||lab.slow||lab.hpRegen||lab.mpRegen)){
    if(lab.attack)spec.attack=round2(num(spec.attack)+12);
    if(lab.slow)spec.slow=round2(num(spec.slow)+10);
    if(lab.hpRegen)spec.regen=round2(num(spec.regen)+.45);
    if(lab.mpRegen)spec.mana=round2(num(spec.mana)+.8);
    spec.labResearch=Object.assign({},lab);
    spec.source=`${spec.source} + 연구소`;
  }
  if(projectedUpper&&num(state.counts[projectedUpper.id])<=0){const after=projectedCountsForTarget(state,projectedUpper,state.counts);spec=transitionSpec(spec,state,state.counts,after,mode,' + 확정 상위 예상');}return spec;
}
function finalGradeSpec(state,mode,settings,projectedUpper){
  const live=currentSpec(state,mode,settings,projectedUpper),finalCounts=cloneCounts(state.counts);for(const unit of state.db.units)if(!isLegendish(unit)&&!isUpper(unit))finalCounts[unit.id]=0;
  return transitionSpec(live,state,state.counts,finalCounts,mode,' · 판매 후 최종 전설급만');
}
function controlEnvelope(slow,stun,targetSlow,targetStun,mode,meta){
  const r=CONTROL_ENVELOPE,profileMode=mode==='magic'?'magic':'physical',m=meta||{};slow=round2(Math.max(0,num(slow)));stun=round6(Math.max(0,num(stun)));targetSlow=Math.max(.01,num(targetSlow));targetStun=Math.max(.01,num(targetStun));
  const staticSlow=round2(m.staticSlow!=null?Math.max(0,num(m.staticSlow)):slow),triggerSlow=round2(Math.max(0,num(m.triggerSlow))),conditionalSlow=round2(m.conditionalSlow!=null?Math.max(slow,num(m.conditionalSlow)):slow),maxSlow=round2(m.maxSlow!=null?Math.max(conditionalSlow,num(m.maxSlow)):Math.max(conditionalSlow,staticSlow+triggerSlow)),slowRatio=slow/targetSlow,slowFloor=round2(targetSlow*r.slowFloorRatio),fullSlow=slow+1e-9>=targetSlow,floorSlow=slow+1e-9>=slowFloor;
  const damageReady=!!m.damageReady,finishReady=!!m.finishReady,operationalStun=round3(profileMode==='physical'?r.physicalOperationalStun:finishReady?1:r.magicOperationalStun),expertStun=profileMode==='physical'?r.physicalExpertStun:operationalStun,stableStun=r.stableStun;
  const stable=fullSlow&&stun+1e-9>=stableStun,operational=fullSlow&&stun+1e-9>=operationalStun,expertPhysical=!stable&&!operational&&profileMode==='physical'&&damageReady&&fullSlow&&stun+1e-9>=expertStun,conditional=!stable&&!operational&&!expertPhysical&&floorSlow&&stun+1e-9>=stableStun,edge=operational||expertPhysical||conditional;
  const requiredSlow=round2(targetSlow),slowGap=round2(Math.max(0,requiredSlow-slow)),requiredStun=round3(fullSlow&&profileMode==='physical'&&damageReady?expertStun:fullSlow?operationalStun:floorSlow?stableStun:operationalStun),rawStunGap=round3(Math.max(0,requiredStun-stun)),recommendStun=fullSlow&&rawStunGap>0&&requiredStun<=r.efficientStunCap+1e-9,stunGap=recommendStun?rawStunGap:0;
  const slowProgress=clamp(slow/targetSlow,0,1),stunProgress=clamp(stun/Math.max(.01,operationalStun),0,1),controlCompletion=stable?1:edge?.9:clamp(.55*slowProgress+.3*stunProgress,0,.85),alternatives=[];
  if(slowGap>0)alternatives.push({key:'slow',label:'이감 우선 보강',current:slow,target:requiredSlow,gap:slowGap,primary:true});if(recommendStun)alternatives.push({key:'stun',label:'유효 스턴 보강',current:stun,target:requiredStun,gap:stunGap,primary:slowGap<=0});
  const route=stable?'comfortable':operational?'operational':expertPhysical?'expert-physical':conditional?'conditional-slow':'danger';let note;
  if(stable)note=`풀이감 + 유효 스턴 ${stableStun}의 편안한 제어 안정선입니다. 추가 스턴은 추천하지 않습니다.`;
  else if(operational)note=`역할표 운영 진입선입니다. ${profileMode==='physical'?'방깎·보잡·실제 보스 화력':'단끝·광보잡·두 번째 상위'}이 남았다면 스턴보다 그 역할을 먼저 채우세요. 보스 처치 보장은 별도입니다.`;
  else if(expertPhysical)note=`물딜 0.7스턴 하드 최소선입니다(0.7도 조금은 새는 실측 최소선). 상시 방깎·광보잡·풀이감은 갖췄지만 보스 DPS 실측이 없으면 클리어 판정으로 쓰지 않습니다. 1.5스턴은 마지막 안정 보강입니다.`;
  else if(conditional)note=`이감 ${round2(slow)}은 조건부 운영권입니다. 스턴을 2까지 올리지 말고 이감 ${requiredSlow}을 먼저 맞추세요.`;
  else if(!floorSlow)note=`이감 ${round2(slow)}은 위험권입니다. 유효 스턴 ${stun}이 높아도 안정권으로 올리지 않으며 이감 +${slowGap}을 먼저 권합니다.`;
  else if(!fullSlow)note=`이감이 ${requiredSlow}에 못 미칩니다. 두 번째 스턴보다 이감 +${slowGap}을 먼저 채우세요.`;
  else note=`풀이감은 갖췄습니다. 운영 가능선까지 유효 스턴 +${rawStunGap}이 필요합니다.`;
  const captureRate=stunCaptureRate(stun),captureAtHalf=stunCaptureRate(.5),captureAtExpert=stunCaptureRate(expertStun),captureAtOperational=stunCaptureRate(operationalStun),captureAtOne=stunCaptureRate(1),captureAtStable=stunCaptureRate(stableStun),captureAtTwo=stunCaptureRate(2);
  return{status:stable?'safe':edge?'edge':'danger',label:stable?'편안한 제어 안정선':operational?'역할표 운영 진입선':expertPhysical?'물딜 0.7 최소선 · 화력 미검증':conditional?'조건부 운영권':'위험권',route,profileMode,slow,stableSlow:slow,stun,staticSlow,triggerSlow,conditionalSlow,expectedSlow:conditionalSlow,maxSlow,triggerSlowSources:num(m.triggerSlowSources),triggerSafeWeight:num(m.triggerSafeWeight),triggerExpectedWeight:num(m.triggerExpectedWeight),captureRate,targetSlow:round2(targetSlow),targetStun:round2(targetStun),safeFullStun:stableStun,edgeFullStun:operationalStun,operationalStun,expertStun,expertPhysical,stableStun,safeLowSlow:slowFloor,safeLowStun:stableStun,dangerExampleSlow:Math.round(targetSlow*.49),dangerExampleStun:2,mixedMinSlow:slowFloor,mixedMinStun:operationalStun,slowOverrideTarget:targetSlow,stunOverrideTarget:null,requiredSlow,requiredStun,edgeRequiredStun:operationalStun,slowGap,stunGap,rawStunGap,recommendStun,controlCompletion:round2(controlCompletion),clearCompletion:stable?1:edge?0.9:round2(controlCompletion),slowRatio:round2(slowRatio),conditionalSlowRatio:round2(conditionalSlow/targetSlow),stunRatio:round2(stun/targetStun),slowCredit:round2(slowProgress),stunCredit:round2(clamp(stun/stableStun,0,1)),envelopeScore:round2(controlCompletion),mixedFloorPassed:floorSlow,mixedSafe:stable,slowOverride:false,stunOverride:false,efficientStunCap:r.efficientStunCap,overEfficientStun:stun>r.efficientStunCap+.0005,damageReady,finishReady,alternatives,captureBenchmarks:{half:captureAtHalf,expert:captureAtExpert,operational:captureAtOperational,one:captureAtOne,stable:captureAtStable,two:captureAtTwo,gainOneToStable:round2(captureAtStable-captureAtOne),gainStableToTwo:round2(captureAtTwo-captureAtStable)},note};
}
function controlState(spec,mode,settings){
  const g=GOROSEI[settings&&settings.gorosei]||GOROSEI.none,targetSlow=mode==='magic'?g.slowMagic:g.slowPhysical,staticSlow=Math.max(0,num(spec.slow)),triggerSlow=Math.max(0,num(spec.triggerSlow)),triggerSlowSources=Math.max(triggerSlow>0?1:0,num(spec.triggerSlowSources)),multi=triggerSlowSources>=2,safeWeight=triggerSlow?multi?CONTROL_ENVELOPE.triggerSafeWeightMulti:CONTROL_ENVELOPE.triggerSafeWeightOne:1,expectedWeight=triggerSlow?multi?CONTROL_ENVELOPE.triggerExpectedWeightMulti:CONTROL_ENVELOPE.triggerExpectedWeightOne:1,stableSlow=staticSlow+triggerSlow*safeWeight,conditionalSlow=staticSlow+triggerSlow*expectedWeight;
  // 발동 방깎은 끊길 수 있으므로 최소 스턴 예외를 여는 풀방깎 판정에도
  // 넣지 않습니다. 상시 방깎만 하드 게이트를 닫고 발동 수치는 참고값입니다.
  // 물딜은 상시 방깎 180~210 구간의 진입선(워큐리 190)을 먼저
  // 확보합니다. 210을 하드 게이트로 두면 1.5스턴을 채우려다 방깎과
  // 이감·광보잡을 잃는 조합이 선택되므로, 210은 이후 보강 목표입니다.
  const upper=settings&&settings._upperUnit||null,exceptionActive=physicalArmorException(upper)&&enoughPhysicalBuffs(spec,settings),armorTarget=exceptionActive?120:g.armorSoft,staticArmor=num(spec.armor),triggerArmor=Math.max(0,num(spec.triggerArmor)),damageReady=mode==='physical'&&staticArmor>=armorTarget&&num(spec.boss)>=1&&num(spec.frenzy)>=1,finishReady=mode==='magic'&&num(spec.main)>=2&&num(spec.boss)>=1&&num(spec.frenzy)>=1&&num(spec.single)>=2&&num(spec.end)>=1;
  return controlEnvelope(stableSlow,spec.stun,targetSlow,g.stun,mode,{staticSlow,triggerSlow,conditionalSlow,maxSlow:staticSlow+triggerSlow,triggerSlowSources,triggerSafeWeight:safeWeight,triggerExpectedWeight:expectedWeight,damageReady,finishReady});
}
function normalizeMagicRoute(value){
  value=String(value||'auto').toLowerCase();if(['dual','double','twoupper','two-upper','2upper','상위2'].includes(value))return'dual';if(['singleend','single-end','oneupper','one-upper','1upper','단끝'].includes(value))return'singleEnd';return'auto';
}
function physicalArmorException(upper){
  if(!upper)return false;const n=nameOf(upper),g=groupName(upper);return(/니카/.test(n)&&g.includes('영원'))||(/거프/.test(n)&&g.includes('불멸'));
}
function enoughPhysicalBuffs(spec,settings){
  if(settings&&settings.armorExceptionBuffReady===true)return true;if(settings&&settings.armorExceptionBuffReady===false)return false;const attack=num(spec.attack)+num(spec.triggerAttack)*.65,speed=num(spec.speed);return attack>=60||(attack>=30&&speed>=20);
}
function routeDistance(requirements){
  return round2((requirements||[]).filter(r=>r.required!==false).reduce((sum,r)=>sum+num(r.weight)*clamp((num(r.target)-num(r.current))/Math.max(.01,num(r.target)),0,1),0));
}
function clearProfileDetails(spec,mode,settings){
  spec=spec||{};settings=settings||{};mode=mode==='magic'?'magic':'physical';const g=GOROSEI[settings.gorosei]||GOROSEI.none,ctl=controlState(spec,mode,settings),slowTarget=mode==='magic'?g.slowMagic:g.slowPhysical,stun=num(spec.stun),stunBase=Math.min(STUN_BASE_FLOOR,Math.max(0,stun)),stunFull=Math.max(0,stun),bossFrenzy=spec.bossFrenzy!=null?num(spec.bossFrenzy):Math.min(num(spec.boss),num(spec.frenzy));
  if(mode==='physical'){
    const upper=settings._upperUnit||null,exceptionEligible=physicalArmorException(upper),buffReady=enoughPhysicalBuffs(spec,settings),exceptionActive=exceptionEligible&&buffReady,armorFloor=exceptionActive?120:g.armorSoft,armorIdeal=exceptionActive?120:g.armorSafe,armorTarget=armorFloor,
    // v21.5(전략 구상 ③ · 사용자: "암브는 최대 75까지 쌓이는데 시간이
    // 걸리므로 75로 계산하면 안 되고, 유닛이 많을수록 중복되어 빨리
    // 쌓인다"): 암브 스택 기여를 요구 판정에 넣되 75 전액이 아니라
    // 기존 포화 모델 armorBreakStacks(w)=75×(1−0.5^w) 로 넣는다 —
    // 유닛 1기 37.5 · 2기 56 · 3기 66 · 4기 70, 상한 75에는 영원히
    // 못 미친다.  이 모델은 v19 부터 보스 미리보기 표시용으로만 있었고
    // 정작 방깎 180 판정에는 0으로 계산되고 있었다(표시-판정 불일치).
    armorBreakCredit=armorBreakStacks(num(spec.armorBreak)),armorStaticOnly=num(spec.armor),armorCurrent=armorStaticOnly+armorBreakCredit,triggerArmor=Math.max(0,num(spec.triggerArmor)),armorExpected=armorCurrent+triggerArmor*.65,armorMaximum=armorStaticOnly+armorBreakCredit+triggerArmor;
    const secondUpperCommitted=!!String(settings.secondUpperId||'');
    const requirements=[
      // v19(사용자 요청): "물딜도 2상위 각이 보이면 갈 수 있게".
      //
      // 물딜 2상위는 사용자가 두 번째 상위를 확정했을 때만 열린다.  상한만
      // 열어 두면 아무 일도 일어나지 않는다 — main 목표가 1로 충족돼 있으면
      // 탐색이 상위 한 기(전설 환산 3)를 더 넣을 이유가 없다.  그래서 확정이
      // 있을 때 이 줄이 2를 요구하고, 보드 목표는 5기로 함께 줄어 9환산을
      // 유지한다(ord_squad_planner: expectedUpperCount / routeBoardTarget).
      {key:'main',label:secondUpperCommitted?'상위 딜러 2':'상위 딜러',current:num(spec.main),target:secondUpperCommitted?2:1,weight:120},
      {key:'armor',label:exceptionActive?'버프 예외 상시 방깎':'상시 풀방깎',current:armorCurrent,target:armorTarget,weight:110,meta:{floor:armorFloor,safe:armorIdeal,ideal:armorIdeal,range:exceptionActive?'120+':`${armorFloor}~${armorIdeal}`,static:round2(armorCurrent),trigger:round2(triggerArmor),expected:round2(armorExpected),maximum:round2(armorMaximum),conditionalOnly:armorCurrent<armorTarget&&armorExpected>=armorTarget}},
      {key:'stunBase',label:'최소 0.7 스턴',current:stunBase,target:STUN_BASE_FLOOR,weight:110},
      {key:'slow',label:`이감 ${slowTarget}%`,current:ctl.slow,target:slowTarget,weight:95},
      // v18.8(사용자 교정): 물딜은 광보잡이 2기 필요하다.
      //
      // 근거는 사용자 플레이 판단이다 — 로그만으로는 증명되지 않는다.  보유
      // 로그 8건에서 물딜은 4판 전부 패했고 물딜 클리어 표본이 아예 없으며,
      // 보잡 2였던 2판(0724 60라·0725 56라)도 졌다.  유일한 클리어(0728)는
      // 마딜에 광보잡 1이었다.  그래서 마딜 목표는 1로 남긴다.
      //
      // bossFrenzy = min(boss, frenzy) 라 2를 요구하면 보잡 2기와 광폭 2기를
      // 함께 요구한다.  0729 물딜 판(74라)이 정확히 여기 걸린다 — 보잡 1
      // (S-호크) · 광폭 2(센고쿠+S-호크) 라 min=1 로 "충족"이 떴다.
      {key:'bossFrenzy',label:'광보잡 1.5',current:bossFrenzy,target:1.5,weight:95},
      // v19.9(사용자 교정): 물딜의 1.5스턴은 항상 필수지만 반드시 마지막에 채운다.
      //
      // 사용자 판단: "물딜은 방깎이 우선시 되어야 한다.  최소 스턴 잡고
      // 풀이감을 잡은 뒤에 스턴 1.5를 채우는 거지, 먼저 채우는 건 별로 좋지
      // 않다 — 방깎이 모자라질 가능성이 높다.  방깎이 높으면 몹이 조금
      // 새더라도 딜로 찍어누를 수 있는데, 방깎이 낮고 몹을 잡고 있으면 못
      // 녹여서 결국 죽는다."
      //
      // 그래서 v18.9 의 '이감 충족 시 필수 해제'는 물딜에서 폐기한다(마딜은
      // v19.9.7 에서 폐기) — 1.5는 버리는 게 아니라 방깎→최소 스턴→이감→광보잡이 닫힌 뒤
      // 마지막으로 채우는 필수 게이트다.  순서 고정은 ord_v15_policy 의 물딜
      // 그룹 정렬(fillLast)이 맡고, 여기서는 필수 여부만 선언한다.
      {key:'stunFull',label:'충분한 1.5 스턴',current:stunFull,target:1.5,weight:35,required:true,meta:{lastPriority:true,fillLast:true}}
    ];
    const navCapPhysical=navProfile(settings.navFamily,settings.navPerk).upperCap;
  if(navCapPhysical===0)for(const row of requirements)if(row.key==='main'){row.waived=true;row.note='계엄령 — 최상위 조합 불가(항법)';}
  return{mode,key:'physical',label:'물딜 상위 1 + 상시 풀방깎',navUpperCap:navCapPhysical,requirements,distance:routeDistance(requirements),armorFloor,armorTarget,armorIdeal,armorCurrent:round2(armorCurrent),armorStatic:round2(armorStaticOnly),armorBreakCredit:round2(armorBreakCredit),armorTrigger:round2(triggerArmor),armorExpected:round2(armorExpected),armorMaximum:round2(armorMaximum),armorConditionalOnly:armorCurrent<armorTarget&&armorExpected>=armorTarget,armorExceptionEligible:exceptionEligible,armorExceptionBuffReady:buffReady,armorExceptionActive:exceptionActive,slowTarget,stunTarget:1.5,priority:['armor','stunBase','slow','bossFrenzy','stunFull'],note:exceptionActive?'니카 영원함/거프 불멸 + 충분한 버프 예외도 상시 방깎 120부터 계산합니다.':'표준 물딜은 최소 0.7스턴(그 밑은 스턴이 안 잡히는 실측 최소선)과 상시 방깎 180을 먼저 고정하고, 이감·광보잡 1.5인분 뒤에 남는 자리로 1.5스턴을 보강합니다. 210은 완성 보강 목표입니다.'};
  }
  // v19.9.7(0802 패배 포렌식 "스턴이 새서 죽었어"): v18.9 는 이감 충족 시
  // 1.5스턴 필수를 해제했다("그 자리는 딜러가 낫다").  0802 실전에서 46라에
  // 이감이 목표를 채우는 순간 이 규칙이 stunFull 을 체크리스트에서 지웠고,
  // 스턴 0.51~0.61 인 채 단끝에 들어가 60라에 전멸했다(0801c 클리어는 이감
  // 90/117 미충족이라 이 규칙이 발동한 적 자체가 없다).  물딜 v19.9.0 과
  // 같은 사상으로 교정한다: 순서는 딜·이감 뒤 마지막이되, 해제는 없다.
  const singleEndExpected=spec.singleEndExpected!=null?num(spec.singleEndExpected):0,singleEndStable=spec.singleEndStable!=null?num(spec.singleEndStable):Math.max(0,singleEndExpected-num(spec.singleEndLargest)),singleEndMaximum=spec.singleEndMax!=null?num(spec.singleEndMax):singleEndExpected,dual=[
    {key:'main',label:'상위 딜러 2',current:num(spec.main),target:2,weight:110},
    {key:'stunBase',label:'최소 0.7 스턴',current:stunBase,target:STUN_BASE_FLOOR,weight:110},
    {key:'slow',label:`이감 ${slowTarget}%`,current:ctl.slow,target:slowTarget,weight:95},
    {key:'stunFull',label:'충분한 1.5 스턴',current:stunFull,target:1.5,weight:85,required:true,meta:{lastPriority:true,fillLast:true}},
    {key:'bossFrenzy',label:'광보잡',current:bossFrenzy,target:1,weight:70},
    {key:'toki',label:'토키',current:num(spec.toki),target:1,weight:70}
  ],singleEnd=[
    {key:'main',label:'상위 딜러 1',current:num(spec.main),target:1,weight:120},
    {key:'bossFrenzy',label:'광보잡',current:bossFrenzy,target:1,weight:110},
    {key:'stunBase',label:'최소 0.7 스턴',current:stunBase,target:STUN_BASE_FLOOR,weight:110},
    {key:'slow',label:`이감 ${slowTarget}%`,current:ctl.slow,target:slowTarget,weight:95},
    {key:'stunFull',label:'충분한 1.5 스턴',current:stunFull,target:1.5,weight:85,required:true,meta:{lastPriority:true,fillLast:true}},
    {key:'singleEndExpected',label:'검증된 보조 단일·끝딜',current:singleEndExpected,target:3,weight:70,meta:{stable:round2(singleEndStable),maximum:round2(singleEndMaximum),verifiedUnits:num(spec.singleEndUnits)}},
    // v17.6(감사 P0-3): 합산 환산만 검사하면 단일 전용 3기(끝딜 0)나
    // 끝딜 전용 3기도 통과한다.  사용자 기준 악몽 스펙(단일 2~3 ·
    // 끝딜 1~2)대로 두 축을 독립 필수로 하드 컷한다.
    {key:'single',label:'단일딜 환산 2',current:num(spec.single),target:2,weight:68},
    {key:'end',label:'끝딜 환산 1',current:num(spec.end),target:1,weight:66}
  ],dualDistance=routeDistance(dual),singleEndDistance=routeDistance(singleEnd),requested=normalizeMagicRoute(settings._resolvedMagicRoute||settings.magicRoute);
  // v23.1(사용자 승인 — 항법 상위 상한 강제): 패왕의길은 최상위 1기만
  // 조합 가능(맵 확정) — 2상위(dual) 경로를 닫는다.  계엄령은 최상위
  // 조합 불가 — 상위 요구를 면제 표시하고 항법 경고를 남긴다.
  const navCap=navProfile(settings.navFamily,settings.navPerk).upperCap;
  let selected=requested==='auto'?(dualDistance<=singleEndDistance?'dual':'singleEnd'):requested;
  let navNote='';
  // v23.3(사용자 지시 "당분간은 마딜 1상위 단끝딜 추천하지 말아봐"):
  // 자동 판정에서 단끝 경로를 뽑지 않는다 — 0816·0817 두 판 연속 단끝
  // 경로 전멸(검증 단끝이 끝까지 안 닫힘).  명시 선택(requested==='singleEnd')
  // 은 존중하고, 패왕의길·계엄령(navCap<=1)은 2상위가 불가능하므로 단끝
  // 강제가 그대로 이긴다.  해제하려면 MAGIC_SINGLE_END_SUSPENDED=false.
  if(MAGIC_SINGLE_END_SUSPENDED&&requested==='auto'&&selected==='singleEnd'&&!(navCap!=null&&navCap<=1)){selected='dual';navNote=' 단끝 경로 일시 중단(사용자 지시) — 자동 판정은 2상위 경로만 권합니다.';}
  if(navCap!=null&&navCap<=1&&selected==='dual'){selected='singleEnd';navNote=' 패왕의길 항법 — 최상위 1기 제한으로 2상위 경로를 닫았습니다.';}
  if(navCap===0){navNote=' 계엄령 항법 — 최상위 조합 불가: 상위 요구는 면제하되 상위 없는 클리어는 코치 경로 모델 밖입니다.';for(const row of singleEnd.concat(dual))if(row.key==='main'){row.waived=true;row.note='계엄령 — 최상위 조합 불가(항법)';}}
  const requirements=selected==='dual'?dual:singleEnd;
  return{mode,key:selected,label:selected==='dual'?'마딜 2상위 + 토키':'마딜 1상위 + 단일·끝딜',requested,requirements,distance:selected==='dual'?dualDistance:singleEndDistance,slowTarget,stunTarget:1.5,singleEndFloor:3,singleEndStable:3,priority:selected==='dual'?['main','stunBase','slow','bossFrenzy','toki','stunFull']:['bossFrenzy','stunBase','slow','singleEndExpected','stunFull'],routes:{dual:{key:'dual',label:'2상위 + 토키',distance:dualDistance,requirements:dual},singleEnd:{key:'singleEnd',label:'1상위 + 단·끝 3~4',distance:singleEndDistance,requirements:singleEnd}},note:(selected==='dual'?'두 번째 상위와 최소 0.7스턴을 최우선으로 보고, 토키·광보잡을 마감한 뒤 1.5스턴을 마지막에 반드시 채웁니다.':'광보잡과 최소 0.7스턴을 먼저 지키고, 단·끝은 메인 상위를 제외한 직접 abilities 기여만 합산합니다. 1.5스턴은 마지막에 반드시 채웁니다.')+navNote,navUpperCap:navCap};
}
// v18: 역할 요구치를 축으로 나눈다.
//
// 실전 로그 6판을 통째로 재생해서 나온 결론이다.  지금까지는 모든
// 요구치가 한 줄에 섞여 있었고, 하나라도 열려 있으면 똑같이 "필수 역할
// 미달"이라는 한 문장으로 요약됐다.  그런데 6판을 놓고 보면 두 종류가
// 전혀 다르게 행동한다.
//
//   생존 축(이감·스턴·방깎·광보잡·상위) — 뚫리면 죽는다.
//     진 판 5개 중 4개가 이 축을 끝까지 한 번도 닫지 못했고,
//     0725는 이감 10/102, 0723a는 이감 92.5 + 광보잡 0으로 끝났다.
//   화력 축(단일·끝딜·검증단끝·공증·체젠) — 부족하면 밀리지만 즉사는 아니다.
//     첫 클리어(0728c)는 단일 0.5/2, 검증단끝 2/3으로 미달인 채 이겼다.
//     오히려 진 판 0723a가 단일 1로 클리어보다 화력이 높았다.
//
// 그래서 축은 요구치를 낮추는 장치가 아니다.  target은 그대로 두고
// 분류만 붙인다.  화면과 판정이 "죽는 문제"와 "미는 문제"를 다른 말로
// 하게 만드는 것이 목적이다.  0724가 두 축을 다 닫고도 졌으므로,
// 두 축을 다 닫았다고 해서 클리어를 보장한다고 말하지는 않는다.
const ROLE_AXIS=Object.freeze({
  main:'survival',armor:'survival',stunBase:'survival',stunFull:'survival',
  slow:'survival',bossFrenzy:'survival',toki:'survival',
  single:'firepower',end:'firepower',singleEndExpected:'firepower',
  singleEndStable:'firepower',singleEndMax:'firepower',magicSupport:'firepower',
  attack:'firepower',regen:'firepower',speed:'firepower',armorBreak:'firepower',
  subdamage:'firepower',deletion:'firepower',mana:'firepower'
});
// 모르는 키는 생존으로 올리지 않는다.  상위 전략이 새로 들여오는
// 요구(공증·체젠 등)는 대부분 화력 보조이고, 잘못 생존으로 분류하면
// "죽는다"는 경고가 헐거워진다.
function roleAxis(key){return ROLE_AXIS[key]||'firepower';}
function deficits(spec,mode,settings){
  const ctl=controlState(spec,mode,settings),profile=clearProfileDetails(spec,mode,settings),req=[],upper=settings&&settings._upperUnit,strategy=upperStrategy(upper);
  const add=(key,label,current,target,weight,required=true,meta={})=>req.push(Object.assign({key,label,axis:roleAxis(key),current:round2(current),target:round2(target),gap:round2(Math.max(0,target-current)),weight,required,recommended:!required,status:current>=target?'ok':current>=target*.7?'warn':'bad'},meta));
  // v23.1: 프로필 행의 면제 표식(waived — 계엄령 상위 면제 등)을 상위
  // 요구 원장까지 관철한다 — 면제 행은 게이트·점수에서 빠지되 화면에 남는다.
  for(const r of profile.requirements)add(r.key,r.label,r.current,r.target,r.weight,r.required!==false&&r.waived!==true,Object.assign({},r.meta||{},r.waived?{waived:true,recommended:false,status:'waived',note:r.note||''}:{}));
  // v18.8: 물딜 폴백도 프로필과 같은 목표(2기)를 쓴다 — 한쪽만 1이면 경로에
  // 따라 요구가 달라져 화면이 어긋난다.
  if(mode==='physical'&&!profile.requirements.some(r=>r.key==='bossFrenzy')){add('bossFrenzy','보스·광폭 보조 1.5',spec.bossFrenzy!=null?num(spec.bossFrenzy):Math.min(num(spec.boss),num(spec.frenzy)),1.5,95,true);}
  if(mode==='magic'){if(profile.key==='singleEnd')add('singleEndStable','한 기 누락 후 단일·끝딜 하한',num(spec.singleEndStable),3,34,false,{recommended:true,maximum:num(spec.singleEndMax)});add('magicSupport','마딜 증폭·마방깎',num(spec.magicDef)+num(spec.magicAmp)+num(spec.explosionAmp),1,32,false,{recommended:true});}
  for(const need of strategy.needs||[]){const current=num(spec[need.key]),existing=req.find(x=>x.key===need.key);
    // v17.6: 기본 경로 행이 이미 있으면 건너뛰지 말고 더 높은 목표로
    // 승격한다 — 상위 전략 요구가 기본 하드 컷보다 셀 수 있다.
    if(existing){if(num(need.target)>num(existing.target)){existing.target=round2(need.target);existing.gap=round2(Math.max(0,num(existing.target)-num(existing.current)));existing.label=need.label;existing.status=existing.current>=existing.target?'ok':existing.current>=existing.target*.7?'warn':'bad';existing.mechanic=true;existing.reason=need.reason;}continue;}
    add(need.key,need.label,current,need.target,60,true,{mechanic:true,reason:need.reason});}
  // v16.3: some uppers legitimately play without a role the generic route
  // demands (e.g. Alvida's stunless knockback line).  A waived row stays
  // visible but no longer gates, scores, or attracts recovery targets.
  const waivedKeys=new Set(strategy.waives||[]);
  if(waivedKeys.size)for(const row of req)if(waivedKeys.has(row.key)){row.required=false;row.recommended=false;row.waived=true;if(row.gap>0)row.status='waived';row.label=`${row.label} · 면제(스펙 대체)`;}
  const clearRows=req.filter(x=>x.required&&x.gap>0).sort((a,b)=>b.weight-a.weight),buildRows=req.filter(x=>(x.required||x.recommended)&&x.gap>0).sort((a,b)=>b.weight-a.weight),required=req.filter(x=>x.required),denominator=required.reduce((s,x)=>s+x.weight,0)||1,readiness=Math.round(required.reduce((s,x)=>s+x.weight*clamp(x.current/Math.max(.01,x.target),0,1),0)/denominator*100);
  return{rows:buildRows,buildRows,clearRows,requirements:req,control:ctl,readiness,axes:axisSummary(req),strategy,profile,route:profile.key};
}
// 축별 요약.  필수(required)이고 면제되지 않은 행만 센다 — 권장 행이
// "죽는다" 판정에 끼어들면 경고가 무뎌진다.  readiness도 축별로 따로
// 내서 화면이 "생존 92% · 화력 40%"처럼 말할 수 있게 한다.
function axisSummary(rows){
  const out={};
  for(const axis of ['survival','firepower']){
    const scoped=(rows||[]).filter(row=>row&&row.axis===axis&&row.required&&!row.waived);
    const open=scoped.filter(row=>num(row.gap)>0);
    const weight=scoped.reduce((total,row)=>total+num(row.weight),0)||1;
    // 물딜 경로에는 화력 축 행이 아예 없다.  행이 없는 축을 "통과"라고
    // 부르면 화면이 "화력 100%"라는 근거 없는 초록불을 켠다.  해당 없음을
    // 별도로 표시하고 readiness는 null로 둔다.
    out[axis]={
      applicable:scoped.length>0,
      pass:scoped.length>0&&open.length===0,
      evaluated:scoped.length,
      openCount:open.length,
      open:open.map(row=>({key:row.key,label:row.label,current:row.current,target:row.target,gap:row.gap})),
      readiness:scoped.length?Math.round(scoped.reduce((total,row)=>total+num(row.weight)*clamp(num(row.current)/Math.max(.01,num(row.target)),0,1),0)/weight*100):null
    };
  }
  return out;
}
function roleContribution(u,mode){
  const r=roleProfile(u),magic=mode==='magic',finish=magicFinishProfile(u),bossCredit=bossCreditFor(u,mode);return{main:isUpper(u)&&(r.family===mode||r.family==='neutral')?1:0,stun:r.stun,stunBase:Math.min(STUN_BASE_FLOOR,r.stun),stunFull:r.stun,slow:r.slow+r.triggerSlow,armor:r.armor,triggerArmor:r.triggerArmor,boss:bossCredit.boss?1:0,frenzy:bossCredit.frenzy?1:0,bossFrenzy:bossFrenzyCredit(u,bossCredit),toki:magic&&/^토키(?:\s|\()/.test(nameOf(u))?1:0,single:magic?r.single:0,end:magic?r.end:0,singleEnd:magic?r.single+r.end:0,singleEndUnits:magic&&finish.directCredit>0?1:0,singleEndExpected:magic?finish.directCredit:0,singleEndMax:magic?finish.maxCredit:0,magicSupport:r.magicDef+r.magicAmp+r.explosionAmp,armorBreak:r.armorBreak?1:0,attack:r.attack-r.attackPenalty+r.triggerAttack*.65,speed:r.speed,regen:r.regen,mana:r.mana,deletion:r.deletion?1:0,utility:r.utility?1:0,subdamage:r.supportDamage?1:0};
}
function coverageScore(contrib,def){let score=0;const covers=[];for(const d of def.rows){const v=num(contrib[d.key]);if(v>0){score+=d.weight*Math.min(1,v/Math.max(.01,d.gap));covers.push(d.label);}}return{score:round2(score),covers};}
function netCoverageScore(beforeDef,afterDef){
  const afterByKey=new Map((afterDef&&afterDef.requirements||[]).map(x=>[x.key,x])),covers=[],byKey={},rank={danger:0,edge:1,safe:2},beforeCtl=beforeDef&&beforeDef.control||{},afterCtl=afterDef&&afterDef.control||{};let score=0;
  for(const before of beforeDef&&beforeDef.requirements||[]){if(!before.required&&!before.recommended)continue;const after=afterByKey.get(before.key)||before,improvement=num(before.gap)-num(after.gap),weight=before.required?before.weight:before.weight*.65;let value=0;if(improvement>0){value=weight*Math.min(1,improvement/Math.max(.01,num(before.gap)));covers.push(before.label);}else if(improvement<0){const base=before.key==='control'?Math.max(.01,num(before.target)):num(before.gap)>0?num(before.gap):Math.max(.01,num(before.target));value=-weight*Math.min(1,-improvement/base);}else if(before.key==='control'&&num(rank[afterCtl.status])<num(rank[beforeCtl.status]))value=-weight*.5*(num(rank[beforeCtl.status])-num(rank[afterCtl.status]));byKey[before.key]=round2(value);score+=value;}
  return{score:round2(score),covers,byKey};
}

function requirementImpact(beforeDef,afterDef){
  const afterByKey=new Map((afterDef&&afterDef.requirements||[]).map(x=>[x.key,x])),beforeCtl=beforeDef&&beforeDef.control||{},afterCtl=afterDef&&afterDef.control||{},rank={danger:0,edge:1,safe:2},controlRegressed=num(rank[afterCtl.status])<num(rank[beforeCtl.status]),rows=[];for(const before of beforeDef&&beforeDef.requirements||[]){const after=afterByKey.get(before.key)||before,delta=round2(num(after.current)-num(before.current)),gapBefore=num(before.gap),gapAfter=num(after.gap),statusRegression=before.key==='control'&&controlRegressed;rows.push({key:before.key,label:statusRegression?'제어 안정도':before.label,before:num(before.current),after:num(after.current),target:num(before.target),delta,gapBefore,gapAfter,closed:gapBefore>0&&gapAfter<=0,regressed:gapAfter>gapBefore+.005||statusRegression,statusRegression,required:!!before.required,recommended:!!before.recommended,mechanic:!!before.mechanic});}
  const improved=rows.filter(x=>x.gapAfter+1e-9<x.gapBefore),regressed=rows.filter(x=>x.regressed),closedClear=rows.filter(x=>x.closed&&x.required),closedRecommended=rows.filter(x=>x.closed&&x.recommended);return{rows,improved,regressed,closedClear,closedRecommended,readinessGain:round2(num(afterDef&&afterDef.readiness)-num(beforeDef&&beforeDef.readiness)),control:{beforeStatus:beforeCtl.status||'danger',afterStatus:afterCtl.status||'danger',improved:num(rank[afterCtl.status])-num(rank[beforeCtl.status])>0,regressed:controlRegressed,before:beforeCtl,after:afterCtl}};
}

function annotateCandidateValue(rows){
  const list=rows||[],rank={danger:0,edge:1,safe:2};for(const row of list){const impact=row.impact||{rows:[],improved:[],closedClear:[],closedRecommended:[],control:{},regressed:[]},gateKeys=impact.closedClear.map(x=>x.key),keys=gateKeys.length?gateKeys:impact.control.improved?['control']:impact.improved.map(x=>x.key),oursByKey=new Map((impact.rows||[]).map(x=>[x.key,x])),equivalent=other=>{const oi=other.impact||{},otherByKey=new Map((oi.rows||[]).map(x=>[x.key,x]));if((oi.regressed||[]).some(x=>x.required)&&!(impact.regressed||[]).some(x=>x.required))return false;return keys.length>0&&keys.every(key=>{const ours=oursByKey.get(key),alt=otherByKey.get(key);if(!ours||!alt)return false;if(ours.closed)return!!alt.closed;if(key==='control'&&impact.control.improved)return num(rank[oi.control&&oi.control.afterStatus])>=num(rank[impact.control.afterStatus]);const oursGain=num(ours.gapBefore)-num(ours.gapAfter),altGain=num(alt.gapBefore)-num(alt.gapAfter);return altGain+1e-9>=oursGain*.8;});},cheaper=list.filter(x=>x!==row&&x.feasible&&x.solve.wispCost<row.solve.wispCost&&equivalent(x)).sort((a,b)=>a.solve.wispCost-b.solve.wispCost||b.coverage-a.coverage)[0]||null;row.cheaperAlternative=cheaper?{unit:cheaper.unit,wispCost:cheaper.solve.wispCost,covers:(cheaper.impact.improved||[]).filter(x=>keys.includes(x.key)).map(x=>x.label)}:null;
    const high=row.solve.wispCost>PREFERRED_WISP_COST,gate=impact.closedClear.length>0,controlGate=!!impact.control.improved,essential=gate||controlGate,mechanic=impact.closedRecommended.some(x=>x.mechanic)||!!row.pairSynergy,noCheaper=!row.cheaperAlternative,signals=[essential,mechanic].filter(Boolean).length,controlBlocked=!!row.controlWaste,criticalRegression=impact.regressed.some(x=>x.required),approved=!controlBlocked&&!criticalRegression&&(!high||essential&&noCheaper);row.valueStatus=approved?(high?'worth':'efficient'):'hold';
    const gains=(impact.closedClear.length?impact.closedClear:impact.improved).slice(0,3).map(x=>x.closed?`${x.label} 충족`:`${x.label} ${round2(x.before)}→${round2(x.after)}`);if(row.pairSynergy)gains.push(row.pairSynergy.label);if(!gains.length&&row.rareSpend&&row.rareSpend.total)gains.push(`희귀 ${row.rareSpend.total}장 소진`);if(!gains.length)gains.push('현재 패 재료 효율');
    let headline;if(controlBlocked)headline=`보류: 이감이 위험권인 상태에서 순수 스턴을 더 짜도 클리어선이 되지 않습니다. 풀이감을 먼저 맞추세요.`;else if(criticalRegression)headline=`보류: 재료를 소모하면 ${impact.regressed.filter(x=>x.required).map(x=>`${x.label} ${round2(x.before)}→${round2(x.after)}`).join(' · ')}로 필수 클리어 스펙이 후퇴합니다.`;else if(high&&approved)headline=`선위 ${row.solve.wispCost} 투자 가치: ${gains.join(' · ')} · 필수 게이트 해결 · 더 싼 동등 대안 없음`;else if(high)headline=`보류: 선위 ${row.solve.wispCost} 대비 ${!essential?'필수 클리어 게이트를 닫지 못합니다':'동등한 저비용 대안이 있습니다'}${row.cheaperAlternative?` · ${nameOf(row.cheaperAlternative.unit)}(${row.cheaperAlternative.wispCost})`:''}`;else headline=`지금 만드는 이유: ${gains.join(' · ')}`;row.why={headline,gains,highCost:high,approved,signals,controlBlocked,criticalRegression,tradeoffs:impact.regressed.map(x=>`${x.label} ${round2(x.before)}→${round2(x.after)}`),alternative:row.cheaperAlternative};
  }return list;
}

// 변신/특강으로 ID가 바뀌는 상위는 한 경로로 보이고, 현재 패에서 가장 실행 가능한 형태만 남깁니다.
function dedupeCandidateRows(rows){
  const out=[],upperByFamily=new Map();for(const row of rows||[]){if(!row||!row.unit||!isUpper(row.unit)){out.push(row);continue;}const key=canonicalUpperId(row.unit.id),previous=upperByFamily.get(key);if(!previous||compareRows(row,previous)<0)upperByFamily.set(key,row);}return out.concat([...upperByFamily.values()]);
}

function upperMemoFor(u,memo){if(!u||!memo||!memo.byUnitId)return null;let ix=memo.byUnitId[u.id];if(typeof ix!=='number')ix=memo.byUnitId[canonicalUpperId(u.id)];return typeof ix==='number'?memo.entries[ix]:null;}
function synergyRankFor(upper,u,synergyMemo){const e=upperMemoFor(upper,synergyMemo);if(!e)return 999;for(const s of e.supports||[]){if((s.unitIds||[]).includes(u.id))return num(s.rank)||999;}return 999;}
function mainUpper(state,locks,settings){
  const selected=(locks||[]).find(x=>x.stage==='upper');if(selected&&state.db.byId.has(selected.id))return state.db.byId.get(selected.id);const preview=settings&&settings.upperPreviewId;if(preview&&state.db.byId.has(preview))return activeUpperVariant(state,state.db.byId.get(preview));
  const owned=state.db.uppers.filter(u=>num(state.counts[u.id])>0).sort((a,b)=>upperVariantPriority(b.id)-upperVariantPriority(a.id)||completionPercent(state,b)-completionPercent(state,a)),seen=new Set();for(const u of owned){const key=canonicalUpperId(u.id);if(seen.has(key))continue;seen.add(key);return u;}return null;
}
function inferMode(state,locks,settings){
  if(settings&&(settings.mode==='physical'||settings.mode==='magic'))return settings.mode;const upper=mainUpper(state,locks,settings);if(upper){const f=familyOf(upper);if(f!=='neutral')return f;}const legend=(locks||[]).find(x=>x.stage==='legend');if(legend){const u=state.db.byId.get(legend.id),f=familyOf(u);if(f!=='neutral')return f;}const owned=ownedUnits(state,u=>isLegendish(u)||isUpper(u));let p=0,m=0;for(const u of owned){const f=familyOf(u);if(f==='physical')p++;if(f==='magic')m++;}return m>p?'magic':'physical';
}
function hardBlocked(state,u,solve,settings,round,ruleCounts){
  const counts=ruleCounts||state.counts;if(!u)return['유닛 없음'];const reasons=[],sameFamilyOwned=state.db.uppers.some(x=>canonicalUpperId(x.id)===canonicalUpperId(u.id)&&num(counts[x.id])>0);if(sameFamilyOwned)reasons.push('이미 보유');if(isChanged(u)&&round<50)reasons.push('변화됨은 50라부터');if(isTranscend(u)&&settings&&settings.superKumaOwned===false)reasons.push('이번 판 초월 사용 불가');if(isTranscend(u)&&settings&&['rayleigh','chest'].includes(String(settings.story10Reward||'')))reasons.push('스토리 10 보상에서 초월 쿠마 포기');
  const inventorySeraph=state.db.units.some(x=>isSeraph(x)&&num(counts[x.id])>0),inventoryTrans=state.db.units.some(x=>isTranscend(x)&&num(counts[x.id])>0),inventoryChanged=state.db.units.reduce((n,x)=>n+(isChanged(x)?num(counts[x.id]):0),0),ownedSeraph=inventorySeraph||num(settings&&settings.seraphUsed)>0,ownedTrans=inventoryTrans||num(settings&&settings.transcendUsed)>0,ownedChanged=Math.max(inventoryChanged,num(settings&&settings.changedUsed)),upperFamilies=new Set(state.db.uppers.filter(x=>num(counts[x.id])>0).map(x=>canonicalUpperId(x.id))),upperCount=upperFamilies.size;
  if(isSeraph(u)&&(ownedSeraph||settings&&settings._plannedSeraph))reasons.push('세라핌은 게임당 1회');if(isTranscend(u)&&(ownedTrans||settings&&settings._plannedTranscend))reasons.push('초월은 게임당 1회');if(isChanged(u)&&ownedChanged+(ruleCounts?0:num(settings&&settings._plannedChanged))>=2)reasons.push('변화됨은 게임당 2회');if(isUpper(u)&&upperCount>=2)reasons.push('상위 2개 보유로 추가 상위 제외');
  const prerequisite=specialPrerequisiteStatus(state.db,u,counts);for(const x of prerequisite.missing)reasons.push(`${x.name} 필요`);
  for(const x of solve.hardMissing)if(!specialPrerequisiteMeta(state.db,x.id))reasons.push(`${x.name} 필요`);for(const [mid] of Object.entries(solve.missingByTier.other||{}))if(!specialPrerequisiteMeta(state.db,mid))reasons.push(`${materialName(state.db,mid)} 필요`);if(solve.wispCost>MAX_WISP_COST)reasons.push(`선위 ${MAX_WISP_COST+1}개 이상 후보 제외`);return [...new Set(reasons)];
}
function rareUseCount(solve){return Object.values(solve.rareUse||{}).reduce((a,b)=>a+num(b),0);}
function rareTargetsForRound(round){
  round=Math.max(1,num(round)||1);if(round<=7)return{total:8,types:6};if(round<=20)return{total:7,types:5};if(round<=30)return{total:6,types:4};if(round<=34)return{total:5,types:4};if(round<=39)return{total:3,types:3};if(round<=44)return{total:1,types:1};return{total:0,types:0};
}
function rareInventoryFor(state,spendableCounts,protectedById){
  const stock=spendableCounts||state.counts,provided=protectedById||{},byId=[],protectedMap={};let total=0,types=0,duplicates=0,protectedCount=0,protectedTypes=0,expendable=0,expendableTypes=0;
  for(const u of state.db.rares){const free=Math.max(0,num(stock[u.id])),locked=Math.max(0,num(provided[u.id])),have=free+locked;if(have<=0)continue;total+=have;types++;duplicates+=Math.max(0,have-1);protectedCount+=locked;expendable+=free;if(locked>0){protectedTypes++;protectedMap[u.id]=locked;}if(free>0)expendableTypes++;byId.push({id:u.id,name:nameOf(u),have,protected:locked,expendable:free,duplicates:Math.max(0,have-1)});}
  byId.sort((a,b)=>b.expendable-a.expendable||b.have-a.have||a.name.localeCompare(b.name,'ko'));return{total,types,duplicates,protected:protectedCount,protectedTypes,expendable,expendableTypes,byId,protectedById:protectedMap};
}
function protectedRareMap(state,reservedStock){
  const out={};for(const u of state.db.rares){const used=Math.max(0,num(state.counts[u.id])-num(reservedStock&&reservedStock[u.id]));if(used>0)out[u.id]=used;}return out;
}
function rarePressureForInventory(inventory,round){
  const inv=inventory||{total:0,types:0,duplicates:0,protected:0,protectedTypes:0,expendable:0},baseTarget=rareTargetsForRound(round),targetTotal=Math.max(baseTarget.total,num(inv.protected)),targetTypes=Math.max(baseTarget.types,num(inv.protectedTypes)),excessTotal=Math.max(0,num(inv.total)-targetTotal),excessTypes=Math.max(0,num(inv.types)-targetTypes),spendableExcess=Math.min(num(inv.expendable),Math.max(excessTotal,excessTypes)),score=excessTotal||excessTypes?clamp(Math.round(excessTotal*14+excessTypes*9+Math.max(0,num(inv.duplicates)-1)*3),0,100):0;
  const status=score>=75?'critical':score>=45?'high':score>0?'watch':'safe',label=status==='critical'?'패 압박 매우 높음':status==='high'?'패 압박 높음':status==='watch'?'희귀 정리 권장':'희귀 여유',shouldSpend=spendableExcess>0;
  return{score,status,label,note:`총 ${num(inv.total)}장 · 보호 ${num(inv.protected)}장 · 소진 가능 ${num(inv.expendable)}장 · 목표 ${targetTotal}장`,targetTotal,targetTypes,baseTargetTotal:baseTarget.total,baseTargetTypes:baseTarget.types,total:num(inv.total),types:num(inv.types),protected:num(inv.protected),expendable:num(inv.expendable),excessTotal,excessTypes,spendableExcess,shouldSpend};
}
function rareSpendForSolve(state,solve,stock){
  const rows=[];let total=0,duplicates=0,clears=0,weighted=0;for(const [id,value] of Object.entries(solve&&solve.rareUse||{})){const have=Math.max(0,num(stock&&stock[id])),use=Math.min(have,Math.max(0,num(value)));if(use<=0)continue;const duplicateUse=Math.min(use,Math.max(0,have-1)),clear=have-use<=0?1:0;total+=use;duplicates+=duplicateUse;clears+=clear;weighted+=use+duplicateUse*.45+clear*.35;rows.push({id,name:materialName(state.db,id),have,use,after:Math.max(0,have-use),duplicates:duplicateUse,clears:clear});}
  rows.sort((a,b)=>b.use-a.use||a.name.localeCompare(b.name,'ko'));return{total,types:rows.length,duplicates,clears,weighted:round2(weighted),byId:rows};
}
function aggregateRareSpend(state,actions,inventory,pressure,selectionMode){
  const chosen=selectionMode==='queue'?(actions||[]):(actions||[]).slice(0,1),byMap={};let plannedSpend=0,duplicates=0,clears=0;for(const row of chosen){const spend=row.rareSpend||{total:0,byId:[]};plannedSpend+=num(spend.total);duplicates+=num(spend.duplicates);clears+=num(spend.clears);for(const x of spend.byId||[]){if(!byMap[x.id])byMap[x.id]={id:x.id,name:x.name,use:0};byMap[x.id].use+=num(x.use);}}
  const first=actions&&actions[0]&&actions[0].rareSpend||{total:0},next=num(first.total),afterNext=Math.max(num(inventory.protected),num(inventory.total)-next),after=Math.max(num(inventory.protected),num(inventory.total)-plannedSpend),byId=Object.values(byMap).map(x=>{const inv=(inventory.byId||[]).find(y=>y.id===x.id)||{};return Object.assign(x,{have:num(inv.have),protected:num(inv.protected),after:Math.max(num(inv.protected),num(inv.have)-x.use)});}).sort((a,b)=>b.use-a.use||a.name.localeCompare(b.name,'ko'));
  return{next,plannedSpend,afterNext,after,protected:num(inventory.protected),target:num(pressure.targetTotal),types:byId.length,duplicates,clears,byId};
}
function tierPriority(u){if(/전설|히든/.test(groupName(u)))return 5;if(isWarped(u))return 5;if(isSeraph(u))return 4;if(isShip(u))return 3;if(isChanged(u))return 2;return 1;}
function rowScore(row,purpose){
  const cost=row.solve.wispCost,preferred=cost<=PREFERRED_WISP_COST?14:0,over=Math.max(0,cost-PREFERRED_WISP_COST)*8,synergy=row.synergy<=10?Math.max(1,7-row.synergy*.6):0,pair=row.pairSynergy?12:0,waste=row.controlWaste?90:0;
  const severity=num(row.rarePressure&&row.rarePressure.score)/100,phaseWeight=purpose==='spec'?(num(row.round)>=51?34:num(row.round)>=40?28:22):purpose==='upper'?24:purpose==='story'?18:0,pressureBonus=num(row.rareSpend&&row.rareSpend.weighted)*severity*phaseWeight;
  if(purpose==='rare')return row.story.score+row.progress*.2+row.rareUse*7-cost*6+preferred;
  if(purpose==='story')return row.story.score*1.5+row.coverage*.15+row.rareUse*8+row.progress*.08-cost*5+preferred-over*.4+pressureBonus;
  if(purpose==='upper')return row.progress*2.4+row.rareUse*14-cost*4+preferred-over*.5+pressureBonus;
  return row.coverage*1.35+synergy+pair+tierPriority(row.unit)*8+row.rareUse*6-cost*3+preferred-over+pressureBonus-waste;
}
function candidateRow(state,u,ctx){
  const stock=ctx.stock||state.counts,availableWisp=ctx.availableWisp!=null?num(ctx.availableWisp):state.wisp,solve=recipeSolve(state.db,u.id,stock),currentSolve=recipeSolve(state.db,u.id,state.counts),round=ctx.round||1,blocked=hardBlocked(state,u,solve,ctx.settings||{},round,ctx.ruleCounts||stock),feasible=blocked.length===0&&solve.wispCost<=availableWisp,progress=completionPercent(state,u),role=roleProfile(u),contrib=roleContribution(u,ctx.mode);let cover=coverageScore(contrib,ctx.deficits),projectedSpec=ctx.spec||null,projectedDeficits=ctx.deficits||null,impact={rows:[],improved:[],regressed:[],closedClear:[],closedRecommended:[],control:{}};
  if(ctx.spec){const after=cloneCounts(solve.stockAfter);after[WISP_ID]=Math.max(0,availableWisp-solve.wispCost);after[u.id]=num(after[u.id])+1;projectedSpec=transitionSpec(ctx.spec,state,stock,after,ctx.mode,'');const projectionSettings=Object.assign({},ctx.settings||{},ctx.upper?{_upperUnit:ctx.upper}:isUpper(u)?{_upperUnit:u}:{});projectedDeficits=deficits(projectedSpec,ctx.mode,projectionSettings);cover=netCoverageScore(ctx.deficits,projectedDeficits);impact=requirementImpact(ctx.deficits,projectedDeficits);}
  const beforeCtl=ctx.deficits&&ctx.deficits.control||{},afterCtl=projectedDeficits&&projectedDeficits.control||{},nonControlGain=impact.improved.some(x=>x.key!=='control'),pureStun=role.stun>0&&role.slow+role.triggerSlow<=0,controlWaste=pureStun&&!nonControlGain&&(num(beforeCtl.stun)>=num(beforeCtl.operationalStun)||num(beforeCtl.stun)>=CONTROL_ENVELOPE.efficientStunCap||num(beforeCtl.slowGap)>0&&afterCtl.status==='danger');if(controlWaste&&cover.byKey&&num(cover.byKey.control)>0){cover.score=round2(cover.score-num(cover.byKey.control)*.85);}
  const story=storyGrade(u),rareUse=rareUseCount(solve),rareSpend=rareSpendForSolve(state,solve,stock),rareInventory=ctx.rareInventory||rareInventoryFor(state,stock,ctx.rareProtected),rarePressure=ctx.rarePressure||rarePressureForInventory(rareInventory,round),synergy=ctx.upper?synergyRankFor(ctx.upper,u,ctx.synergyMemo):999,pairSynergy=ctx.upper?(isUpper(u)?upperPairSynergy(ctx.upper,u):null)||descriptionPartnerSynergy(ctx.upper,u):null,wispGap=Math.max(0,solve.wispCost-availableWisp);
  const row={unit:u,solve,currentSolve,wispBreakdown:{current:currentSolve.wispCost,planned:solve.wispCost,available:availableWisp,gap:wispGap,basis:ctx.costBasis||'protected'},blocked,feasible,progress,role,contrib,coverage:cover.score,covers:cover.covers,coverageByKey:cover.byKey||{},projectedSpec,projectedDeficits,impact,controlWaste,pairSynergy,story,rareUse,rareSpend,rareAfter:Math.max(num(rareInventory.protected),num(rareInventory.total)-rareSpend.total),rarePressure,round,synergy,wispGap,commonTop:commonTop(state.db,solve.lowestMissing),family:role.family,availableWisp,tierPriority:tierPriority(u)};row.score=round2(rowScore(row,ctx.purpose));return row;
}
function compareRows(a,b){if(a.feasible!==b.feasible)return b.feasible-a.feasible;if(a.score!==b.score)return b.score-a.score;if(a.solve.wispCost!==b.solve.wispCost)return a.solve.wispCost-b.solve.wispCost;if(a.progress!==b.progress)return b.progress-a.progress;if(a.synergy!==b.synergy)return a.synergy-b.synergy;return nameOf(a.unit).localeCompare(nameOf(b.unit),'ko');}
function compareCompletionRows(a,b){
  if(a.progress!==b.progress)return b.progress-a.progress;
  if(a.solve.wispCost!==b.solve.wispCost)return a.solve.wispCost-b.solve.wispCost;
  const byName=nameOf(a.unit).localeCompare(nameOf(b.unit),'ko');if(byName)return byName;
  const aid=String(a.unit&&a.unit.id||''),bid=String(b.unit&&b.unit.id||'');return aid===bid?0:aid<bid?-1:1;
}
function candidatePool(state,purpose,mode,settings,round){
  const openBoth=!!(settings&&settings._openBoth);if(purpose==='choice')return[];if(purpose==='rare')return state.db.rares;
  if(purpose==='upper')return state.db.uppers.filter(u=>openBoth||familyOf(u)===mode||familyOf(u)==='neutral');
  if(purpose==='story')return state.db.legendish.filter(u=>/^전설|^히든/.test(groupName(u)));
  return state.db.legendish.concat(state.db.uppers).filter(u=>!isMystic(u)&&!isRandom(u)&&!isItem(u)).filter(u=>{const f=familyOf(u);return f===mode||f==='neutral';});
}
function watchBlockIsTerminal(reason){return /이미 보유|베이비\s*5 제외|게임당 [12]회|상위 2개 보유/.test(reason||'');}
function watchKindFor(row,purpose){
  const blocked=row.blocked||[];if(blocked.some(x=>/초월 사용 불가|50라부터|목재 사용 미확인/.test(x)))return'unlock';if(blocked.some(x=>/필요$/.test(x)))return'material';if(row.valueStatus==='hold')return'value';if(row.wispGap>0)return'wisp';if(purpose==='upper'&&row.progress<80)return'progress';return'alternative';
}
function watchReasonFor(row,purpose){
  const blocked=row.blocked||[],gate=blocked.find(x=>/초월 사용 불가|50라부터|목재 사용 미확인/.test(x)),material=blocked.find(x=>/필요$/.test(x));if(gate)return gate;if(material)return material;if(row.valueStatus==='hold'&&row.why)return row.why.headline;if(row.wispGap>0)return`선위 ${row.wispGap}개 더 필요`;if(purpose==='upper'&&row.progress<80)return`완성도 ${row.progress}% · 80%까지 ${Math.max(0,80-row.progress)}%`;if(blocked.length)return blocked[0];return'즉시 후보 다음 순위';
}
function compareWatchRows(a,b,purpose){
  if(purpose==='upper'&&a.progress!==b.progress)return b.progress-a.progress;const at=a.blocked.some(watchBlockIsTerminal),bt=b.blocked.some(watchBlockIsTerminal);if(at!==bt)return at-bt;if(a.feasible!==b.feasible)return b.feasible-a.feasible;if(a.wispGap!==b.wispGap)return a.wispGap-b.wispGap;if(a.progress!==b.progress)return b.progress-a.progress;if(a.score!==b.score)return b.score-a.score;return nameOf(a.unit).localeCompare(nameOf(b.unit),'ko');
}
function watchCandidates(state,rows,actions,purpose,def){
  if(purpose==='spec'&&!(def&&def.rows&&def.rows.length))return[];const actionIds=new Set((actions||[]).map(x=>x.unit.id)),eligible=(rows||[]).filter(row=>!actionIds.has(row.unit.id)&&!num(state.counts[row.unit.id])).filter(row=>!(row.blocked||[]).some(watchBlockIsTerminal)).filter(row=>{
    if(purpose==='upper')return row.progress>=60;if(purpose==='spec')return row.coverage>0||num(row.rareSpend&&row.rareSpend.total)>0;return row.feasible||row.wispGap<=15||row.progress>=25||row.rareUse>0||(row.blocked||[]).some(x=>/50라부터|목재 사용 미확인|필요$/.test(x));
  }).sort((a,b)=>compareWatchRows(a,b,purpose)).slice(0,WATCH_CANDIDATE_CAP);return eligible.map(row=>Object.assign({},row,{watchKind:watchKindFor(row,purpose),watchReason:watchReasonFor(row,purpose)}));
}
function selectCompatibleQueue(state,pool,ctx,limit){
  const selected=[],candidates=pool.slice();let stock=cloneCounts(ctx.stock||state.counts),availableWisp=num(ctx.availableWisp),plannedSeraph=false,plannedTranscend=false,plannedChanged=0,runningSpec=Object.assign({},ctx.spec),runningDeficits=ctx.deficits;
  while(selected.length<limit&&candidates.length){const rareInventory=rareInventoryFor(state,stock,ctx.rareProtected),rarePressure=rarePressureForInventory(rareInventory,ctx.round),needsRoles=!!runningDeficits.rows.length,needsRareSpend=rarePressure.shouldSpend;if(!needsRoles&&!needsRareSpend)break;const settings=Object.assign({},ctx.settings,{_plannedSeraph:plannedSeraph,_plannedTranscend:plannedTranscend,_plannedChanged:plannedChanged}),allRows=annotateCandidateValue(dedupeCandidateRows(candidates.map(u=>candidateRow(state,u,Object.assign({},ctx,{spec:runningSpec,stock,ruleCounts:stock,availableWisp,settings,deficits:runningDeficits,purpose:'spec',rareInventory,rarePressure}))).filter(x=>x.feasible))),approved=allRows.filter(x=>x.valueStatus!=='hold'),roleRows=needsRoles?approved.filter(x=>x.coverage>0):[],spendRows=needsRareSpend?approved.filter(x=>x.coverage>=0&&x.rareSpend.total>0):[],rows=(roleRows.length?roleRows:spendRows).sort(compareRows);if(!rows.length)break;const best=rows[0],built=applyBuildStep(state,runningSpec,stock,best.unit,ctx.mode,availableWisp);selected.push(best);stock=built.stock;availableWisp=built.remainingWisp;runningSpec=built.spec;runningDeficits=deficits(runningSpec,ctx.mode,settings);if(isSeraph(best.unit))plannedSeraph=true;if(isTranscend(best.unit))plannedTranscend=true;if(isChanged(best.unit))plannedChanged++;}
  return{rows:selected,stockAfter:stock,remainingWisp:availableWisp,specAfter:runningSpec,deficitsAfter:runningDeficits};
}
function recommendationPlan(state,locks,settings,upperMemo,synergyMemo){
  settings=settings||{};const flow=gameFlow(state,locks,settings),completionForced=['rare','story'].includes(flow.purpose),upper=mainUpper(state,locks,settings),mode=inferMode(state,locks,settings),round=num(settings.currentRound)||1,lockedUpper=(locks||[]).find(x=>x.stage==='upper'&&state.db.byId.has(x.id)),projectedUpper=lockedUpper?state.db.byId.get(lockedUpper.id):null,purpose=flow.purpose==='choice'?'choice':completionForced?flow.purpose:settings.purpose||flow.purpose,legendLock=(locks||[]).find(x=>x.stage==='legend'&&state.db.byId.has(x.id)),neutralLegend=legendLock&&familyOf(state.db.byId.get(legendLock.id))==='neutral',ownedFamilies=new Set(ownedRoleUnits(state).filter(u=>isLegendish(u)||isUpper(u)).map(familyOf).filter(x=>x!=='neutral')),openBoth=completionForced&&purpose==='story'||!upper&&!settings.mode&&(!!neutralLegend||(!legendLock&&ownedFamilies.size!==1&&['story','upper'].includes(purpose))),localSettings=Object.assign({},settings,{_openBoth:openBoth,_upperUnit:upper||projectedUpper||null});
  const reserveIds=(locks||[]).filter(x=>['rare','legend','upper'].includes(x.stage)).map(x=>x.id),reserved=reserveTargets(state.db,state.counts,reserveIds),rareProtected=protectedRareMap(state,reserved.stock),rareInventory=rareInventoryFor(state,reserved.stock,rareProtected),rarePressure=rarePressureForInventory(rareInventory,round),projectedStock=cloneCounts(reserved.stock);if(projectedUpper&&num(state.counts[projectedUpper.id])<=0)projectedStock[projectedUpper.id]=num(projectedStock[projectedUpper.id])+1;const spec=currentSpec(state,mode,localSettings,projectedUpper);let def=deficits(spec,mode,localSettings);if(mode==='magic'&&normalizeMagicRoute(settings.magicRoute)==='auto'){localSettings._resolvedMagicRoute=def.route;def=deficits(spec,mode,localSettings);}const stock=purpose==='spec'?projectedStock:reserved.stock,availableWisp=reserved.remainingWisp,ctx={mode,spec,deficits:def,settings:localSettings,round,purpose,upper,stock,ruleCounts:stock,availableWisp,synergyMemo,rareProtected,rareInventory,rarePressure,costBasis:reserveIds.length?'protected':'current'};
  const completionInventory=completionForced?rareInventoryFor(state,state.counts,{}):rareInventory,completionPressure=completionForced?rarePressureForInventory(completionInventory,round):rarePressure,completionCtx=completionForced?Object.assign({},ctx,{stock:state.counts,ruleCounts:state.counts,availableWisp:state.wisp,rareProtected:{},rareInventory:completionInventory,rarePressure:completionPressure,costBasis:'current'}):ctx,ruleStock=completionCtx.ruleCounts||completionCtx.stock||state.counts,pool=candidatePool(state,purpose,mode,localSettings,round).filter(u=>!num(state.counts[u.id])).filter(u=>specialPrerequisiteStatus(state.db,u,ruleStock).allowed),rowFor=u=>{const family=openBoth&&familyOf(u)!=='neutral'?familyOf(u):mode,rowCtx=completionCtx;if(family===mode)return candidateRow(state,u,rowCtx);const alternateSettings=Object.assign({},localSettings,{_upperUnit:isUpper(u)?u:null}),alternateSpec=currentSpec(state,family,alternateSettings,projectedUpper),alternateDef=deficits(alternateSpec,family,alternateSettings);return candidateRow(state,u,Object.assign({},rowCtx,{mode:family,spec:alternateSpec,deficits:alternateDef,settings:alternateSettings}));};let rows=annotateCandidateValue(dedupeCandidateRows(pool.map(rowFor))).sort(completionForced?compareCompletionRows:compareRows),actions=[],queueResult=null,actionCap=purpose==='choice'?0:purpose==='spec'?5:3,selectionMode=purpose==='choice'?'decision':purpose==='spec'?'queue':'alternatives';
  if(completionForced){
    // v20.5: 순위 근거는 그대로 완성도지만(내부 계산은 유지) 화면에 숫자를
    // 내밀지는 않는다 — "티모 %이제 필요없잖아 없애줘".  사용자가 이 줄에서
    // 얻어야 하는 건 "왜 이게 1위인가"이지 35 라는 값이 아니다.
    rows.forEach((row,index)=>{row.completionRank=index+1;row.why=Object.assign({},row.why||{},{headline:`남은 재료가 가장 적은 ${index+1}번째 후보 · 전략 점수와 예약보다 먼저 적용`});});
    actions=rows.slice(0,actionCap);
  }
  else if(purpose==='spec'){queueResult=selectCompatibleQueue(state,pool,ctx,actionCap);actions=queueResult.rows;}
  else if(purpose==='upper')actions=rows.filter(x=>x.feasible&&x.progress>=80&&x.valueStatus!=='hold').slice(0,actionCap);
  else actions=rows.filter(x=>x.feasible&&x.valueStatus!=='hold').slice(0,actionCap);
  const prep=[];
  let watchRows=rows,watchDef=def;if(selectionMode==='queue'&&queueResult){const queuedRareInventory=rareInventoryFor(state,queueResult.stockAfter,rareProtected),queuedRarePressure=rarePressureForInventory(queuedRareInventory,round),queuedCtx=Object.assign({},ctx,{stock:queueResult.stockAfter,ruleCounts:queueResult.stockAfter,availableWisp:queueResult.remainingWisp,spec:queueResult.specAfter,deficits:queueResult.deficitsAfter,rareInventory:queuedRareInventory,rarePressure:queuedRarePressure,costBasis:'sequential'}),actionIds=new Set(actions.map(row=>row.unit.id));watchRows=annotateCandidateValue(dedupeCandidateRows(pool.filter(u=>!actionIds.has(u.id)).map(u=>candidateRow(state,u,queuedCtx)))).sort(compareRows);watchDef=queueResult.deficitsAfter;}
  let watch=watchCandidates(state,watchRows,actions,purpose,watchDef),upperBuildRow=null;
  // A confirmed Upper is a route lock, not a promise that the entire final
  // party can already be funded.  Around round 30 the Upper itself is the
  // story-push checkpoint, so price it once against the real TMO hand and put
  // it ahead of every support.  The generic spec queue uses a projected Upper
  // stock and therefore must not be reused here (that would consume the same
  // reserved recipe twice and can make a buildable Upper look impossible).
  if(flow.phase==='upper-build'&&projectedUpper&&num(state.counts[projectedUpper.id])<=0){
    const upperSettings=Object.assign({},localSettings,{_upperUnit:projectedUpper}),actualSpec=currentSpec(state,mode,Object.assign({},upperSettings,{_upperUnit:null}),null),actualDef=deficits(actualSpec,mode,upperSettings),actualInventory=rareInventoryFor(state,state.counts,{}),actualPressure=rarePressureForInventory(actualInventory,round);
    upperBuildRow=candidateRow(state,projectedUpper,{mode,spec:actualSpec,deficits:actualDef,settings:upperSettings,round,purpose:'upper',upper:projectedUpper,stock:state.counts,ruleCounts:state.counts,availableWisp:state.wisp,synergyMemo,rareProtected:{},rareInventory:actualInventory,rarePressure:actualPressure,costBasis:'current'});
    const missingReason=upperBuildRow.blocked&&upperBuildRow.blocked[0]||upperBuildRow.wispGap>0&&`선위 ${upperBuildRow.wispGap}개 부족`||'표시된 재료 부족';upperBuildRow.why=Object.assign({},upperBuildRow.why||{},{headline:upperBuildRow.feasible?'30라 전 스토리 진행을 위해 확정 상위를 먼저 제작합니다. 최종 보조 조합은 제작 뒤 남은 패로 다시 계산합니다.':`상위 방향은 확정되었습니다. ${missingReason}을 채우면 보조 조합보다 먼저 제작합니다.`});
    upperBuildRow.watchKind=upperBuildRow.feasible?'upper-first':upperBuildRow.blocked&&upperBuildRow.blocked.length?'material':'wisp';upperBuildRow.watchReason=upperBuildRow.feasible?'30라 스토리 진행용 상위 최우선':upperBuildRow.why.headline;
    actions=upperBuildRow.feasible?[upperBuildRow]:[];watch=[upperBuildRow].concat(watch.filter(row=>canonicalUpperId(row.unit.id)!==canonicalUpperId(projectedUpper.id))).slice(0,WATCH_CANDIDATE_CAP);selectionMode='upper-first';actionCap=1;
  }
  const rareSpend=aggregateRareSpend(state,actions,completionInventory,completionPressure,selectionMode);
  return{mode,spec,deficits:def,purpose,flow,upper,actions,prep,watch,rows,reserved,rareInventory:completionInventory,rarePressure:completionPressure,rareSpend,round,settings:localSettings,availableWisp:completionForced?state.wisp:availableWisp,actionCap,watchCap:WATCH_CANDIDATE_CAP,selectionMode,projectedUpper,upperBuildRow,compareBoth:openBoth,completionForced};
}
function progressionCounts(state){
  const rare=state.db.rares.reduce((sum,u)=>sum+num(state.counts[u.id]),0),legend=state.db.legendish.reduce((sum,u)=>sum+num(state.counts[u.id]),0),legendHidden=state.db.legendish.filter(u=>/^전설|^히든/.test(groupName(u))).reduce((sum,u)=>sum+num(state.counts[u.id]),0),upperFamilies=new Set();for(const u of state.db.uppers)if(num(state.counts[u.id])>0)upperFamilies.add(canonicalUpperId(u.id));return{rare,legend,legendHidden,upper:upperFamilies.size,squad:legend+upperFamilies.size*3,board:legend+upperFamilies.size};
}
function normalizePostLegendRoute(value){
  value=String(value||'').trim().toLowerCase();
  if(['legend','additional-legend','additionallegend','more-legend','story'].includes(value))return POST_LEGEND_ROUTES.LEGEND;
  if(['upper','prepare-upper','prepareupper','upper-ready'].includes(value))return POST_LEGEND_ROUTES.UPPER;
  return POST_LEGEND_ROUTES.CHOICE;
}
function gameFlow(state,locks,settings){
  settings=settings||{};locks=locks||[];const round=Math.max(1,num(settings.currentRound)||1),counts=progressionCounts(state),validLock=stage=>locks.find(x=>x.stage===stage&&state.db.byId.has(x.id)),upperLock=validLock('upper'),upperPreview=settings.upperPreviewId&&state.db.byId.has(settings.upperPreviewId)?state.db.byId.get(settings.upperPreviewId):null,upperUnit=mainUpper(state,locks,settings),upperDecided=!!(upperLock||upperPreview||upperUnit),upperBuilt=counts.upper>0,legendSecured=counts.legendHidden>0||upperBuilt,rareSecured=counts.rare>0||counts.legend>0||upperBuilt,postLegendRoute=normalizePostLegendRoute(settings.postLegendRoute),postLegendDecisionRequired=legendSecured&&!upperDecided&&!postLegendRoute,target=clamp(Math.round(num(settings.targetSquadCount)||9),9,11),by50Target=Math.min(9,target),mode=inferMode(state,locks,settings),projectedUpper=upperLock&&!upperBuilt?state.db.byId.get(upperLock.id):null,squadReady=counts.squad>=target,localSettings=Object.assign({},settings,{_upperUnit:upperUnit||projectedUpper||null}),spec=upperDecided&&squadReady?finalGradeSpec(state,mode,localSettings,projectedUpper):null,def=spec?deficits(spec,mode,localSettings):null,clearReady=settings._clearReady!=null?!!settings._clearReady:!!(def&&!def.clearRows.length);
  let purpose='spec',phase='reinforce',label='전설급 보강',note='상위의 부족 스펙을 채우면서 최소 9기 조합을 완성합니다.',deadline=null;
  if(!rareSecured){purpose='rare';phase='first-rare';label='첫 희귀 제작';deadline=7;note='7라운드 안에 첫 희귀를 만들어 선택 위습 1개를 확보합니다.';}
  else if(!legendSecured){purpose='story';phase='first-legend';label='첫 전설·히든 제작';deadline=20;note='현재 희귀·특별·안흔·흔함 패에서 가장 가까운 전설 또는 히든을 20라 전에 만듭니다.';}
  else if(!upperDecided&&!postLegendRoute){purpose='choice';phase='post-legend-choice';label='첫 전설 이후 진행 선택';deadline=25;note='추가 전설·히든을 더 만들지, 현재 패로 상위를 준비할지 선택하세요.';}
  else if(!upperDecided&&postLegendRoute===POST_LEGEND_ROUTES.LEGEND){purpose='story';phase='additional-legend';label='추가 전설·히든 제작';note='남은 재료가 적은 순서대로 전설·히든을 더 추천합니다. 상위를 준비할 때 진행 선택을 바꾸세요.';}
  else if(!upperDecided){purpose='upper';phase='upper-choice';label='상위·딜 계통 결정';deadline=25;note='현재 희귀 패를 최대한 소모하는 상위와 물딜·마딜 계통을 비교합니다.';}
  else if(!upperBuilt){phase='upper-build';label='상위 제작 + 라인 전설';deadline=30;note='확정 상위 재료를 보호하고 30라 전후에 상위와 라인 방어용 전설 1기를 마련합니다.';}
  else if(round<=50&&counts.squad<by50Target){phase='reinforce';label='50라 전 9환산 보강';deadline=50;note=`50라 전까지 상위 결손을 메우며 실제 전설 환산 ${by50Target}기를 보수적 구조 최소선으로 맞춥니다.`;}
  else if(round>50&&(!squadReady||!clearReady)){phase='final-patch';label='50라 이후 마지막 보강';note='전설·히든 1기, 해적선 1기, 희귀 2기 또는 변화됨 중 가장 싼 경로로 마지막 결손을 닫습니다.';}
  else if(squadReady&&clearReady){phase='upgrade-control';label='판매·업그레이드·컨트롤';note='최종 유닛을 제외한 재료를 정리하고 이감·공격력·체젠·마젠 업그레이드와 컨트롤에 집중합니다.';}
  const rewards=[],expectedRareIncome=0,milestones=[
    {key:'rare',round:7,done:rareSecured,label:'첫 희귀 + 선택 위습'},
    {key:'legend',round:20,done:legendSecured,label:'첫 전설·히든'},
    {key:'postLegendRoute',round:20,done:upperDecided||!!postLegendRoute,label:'첫 전설 이후 진행 선택'},
    {key:'upperChoice',round:25,done:upperDecided,label:'상위·딜 계통 결정'},
    {key:'lineHold',round:30,done:upperBuilt&&counts.legend>=1,label:'상위 + 라인 전설'},
    {key:'nine',round:50,done:counts.squad>=by50Target,label:`실제 전설 환산 ${by50Target}기`},
    {key:'final',round:65,done:squadReady&&clearReady,label:`최종 ${target}~11기 + 클리어 스펙`}
  ];
  return{round,purpose,phase,label,note,deadline,urgent:deadline!=null&&round>=deadline-2,overdue:deadline!=null&&round>deadline,counts,target,stretchTarget:11,by50Target,mode,rareSecured,legendSecured,postLegendRoute,postLegendDecisionRequired,upperDecided,upperBuilt,squadReady,clearReady,rewards,expectedRareIncome:round2(expectedRareIncome),milestones,deficits:def};
}
// 구버전 호출 호환용입니다. 실제 추천은 보유·락 상태를 보는 gameFlow를 사용합니다.
function milestonePurpose(round,hasUpper,hasLockedUpper){if(hasUpper||hasLockedUpper)return'spec';if(num(round)<=7)return'rare';if(num(round)<=20)return'story';return'upper';}
function phaseForRound(round){round=num(round)||1;if(round<=7)return{key:'rare',label:'첫 희귀 + 선택 위습',note:'7라운드 안에 첫 희귀를 완성합니다.'};if(round<=20)return{key:'story',label:'첫 전설·히든',note:'첫 전설 또는 히든을 늦어도 20라 전에 완성합니다.'};if(round<=25)return{key:'route',label:'상위·딜 계통 결정',note:'스토리 보상 희귀·고급도박 유입이 끝난 전체 패(희귀 8장 전후)로 상위와 물딜·마딜을 결정합니다. 유입 전에는 선택 위습 소비를 아끼세요.'};if(round<=30)return{key:'upper',label:'상위 + 라인 전설',note:'상위 하나와 희귀보다 강한 라인 방어 전설을 마련합니다.'};if(round<=50)return{key:'spec',label:'50라 전 9환산 보강',note:'상위 결손을 채우며 실제 전설 환산 9기를 보수적 구조 최소선으로 맞춥니다. 패 불리기는 흔함·안흔이 나오는 하급도박이 효율적입니다.'};return{key:'finish',label:'최종 9기+ 마감',note:'전설·히든, 해적선, 희귀 2기, 변화됨 중 최저비용 경로로 마지막 스펙을 채웁니다.'};}
function roundDuration(round,settings){return BOSS_ROUNDS.has(round)?num(settings.roundBossSeconds)||60:num(settings.roundNormalSeconds)||35;}
// v19.8.1(사용자 규칙): 라운드는 65가 최대다 — 0731 로그는 타이머가 80라까지
// 걸어가며 죽은 판을 24라운드나 더 판정했다.  시계·수동 모두 65에서 멈춘다.
const MAX_ROUND=65;
function roundClock(settings,now){
  const s=settings||{},started=num(s.roundStartedAt),prep=num(s.roundPrepSeconds)||10,round=Math.min(MAX_ROUND,Math.max(1,num(s.currentRound)||1));if(!started)return{running:false,round,label:`${round}라 · 수동`,remaining:0,prep:false};let elapsed=Math.max(0,Math.floor(((now||Date.now())-started)/1000));if(elapsed<prep)return{running:true,round:0,label:'준비',remaining:prep-elapsed,prep:true};elapsed-=prep;let r=1;while(elapsed>=roundDuration(r,s)&&r<MAX_ROUND){elapsed-=roundDuration(r,s);r++;}const capped=r>=MAX_ROUND;return{running:true,round:Math.min(r,MAX_ROUND),label:`${Math.min(r,MAX_ROUND)}라${capped?' · 최종':BOSS_ROUNDS.has(r)?' · 보스':''}`,remaining:capped?0:Math.max(0,roundDuration(r,s)-elapsed),prep:false};
}

function rareNeedsForTarget(db,targetId){const counts={};function walk(id,mul,path){const u=db.byId.get(id);if(!u||path.has(id))return;if(isRare(u)){counts[id]=(counts[id]||0)+mul;return;}const next=new Set(path);next.add(id);for(const s of u.stuffs||[])walk(s.id,mul*num(s.count),next);}walk(targetId,1,new Set());return counts;}
function rareResolution(state,plan,locks){
  const p=plan||{},nowNeed={},holdNeed={};function add(dst,map){for(const [id,c] of Object.entries(map||{}))dst[id]=(dst[id]||0)+num(c);}function addMax(dst,map){for(const [id,c] of Object.entries(map||{}))dst[id]=Math.max(num(dst[id]),num(c));}function rowUse(row){return row&&row.solve&&row.solve.rareUse||row&&row.unit&&rareNeedsForTarget(state.db,row.unit.id)||{};}
  let protectedMap=p.rareInventory&&p.rareInventory.protectedById;if(!protectedMap){const ids=(locks||[]).filter(x=>['rare','upper','legend'].includes(x.stage)).map(x=>x.id),reserved=reserveTargets(state.db,state.counts,ids);protectedMap=protectedRareMap(state,reserved.stock);}add(nowNeed,protectedMap);if(p.actions&&p.actions[0])add(nowNeed,rowUse(p.actions[0]));
  if(p.selectionMode==='queue'){for(const row of (p.actions||[]).slice(1))add(holdNeed,rowUse(row));}else for(const row of (p.actions||[]).slice(1))addMax(holdNeed,rowUse(row));
  const rows=[];for(const u of state.db.rares){const have=num(state.counts[u.id]);if(have<=0)continue;const use=Math.min(have,num(nowNeed[u.id])),remain=have-use,hold=Math.min(remain,num(holdNeed[u.id])),reroll=Math.max(0,remain-hold);rows.push({unit:u,have,use,hold,reroll,protected:Math.min(have,num(protectedMap[u.id])),excess:reroll});}return rows.sort((a,b)=>(b.use+b.hold)-(a.use+a.hold)||b.reroll-a.reroll);
}
function supportTierUse(state,row){
  const used={rare:0,special:0,uncommon:0,common:0};
  for(const [id,value] of Object.entries(row&&row.solve&&row.solve.consumed||{})){
    const tier=tierKey(state&&state.db&&state.db.byId.get(id));
    if(Object.prototype.hasOwnProperty.call(used,tier))used[tier]+=num(value);
  }
  for(const key of Object.keys(used))used[key]=round2(used[key]);
  return used;
}
// v19.17(A2): 전략 필수(mechanic) — 체젠필수·암브필수·보조딜필수 같은
// 상위 전제 — 는 상위 스킬이 작동하기 위한 선행 조건인데, 정적 경로
// 그룹에 키가 없다는 이유로 늘 꼬리 그룹에 앉았다(0805 키드: 체젠
// 0.45/2인 채 단끝 조각부터 승인).  전제 그룹은 화력만으로 이루어진
// 그룹(단·끝·1.5스턴) 앞에 끼운다 — 생존·제어 뒤, 화력 앞.  생존 키와
// 섞인 그룹(구제 모드의 stunFull 합류)은 화력 그룹으로 치지 않는다.
// 정책 groupRows 의 삽입 규칙과 같아야 한다.
const FIREPOWER_ONLY_KEYS=new Set(['single','end','singleEnd','singleEndExpected','singleEndStable','singleEndMax','stunFull']);
function insertMechanicPriorityGroup(groups,keys){
  const covered=new Set((groups||[]).flat()),fresh=(keys||[]).filter(key=>key&&!covered.has(key));
  if(!fresh.length)return groups;
  const cut=(groups||[]).findIndex(group=>group.length&&group.every(key=>FIREPOWER_ONLY_KEYS.has(key)));
  const next=(groups||[]).slice();next.splice(cut<0?next.length:cut,0,fresh);return next;
}
function mechanicRequirementKeys(rows){
  return[...new Set((rows||[]).filter(row=>row&&row.required!==false&&!row.waived&&(row.mechanic===true||row.meta&&row.meta.mechanic===true)).map(row=>row.key))];
}
function supportClearStage(row,plan){
  const clearRows=plan&&plan.deficits&&plan.deficits.clearRows||[],impact=row&&row.impact||{},impactRows=impact.rows||[],byKey=new Map(impactRows.map(item=>[item.key,item])),regressed=(impact.regressed||[]).filter(item=>item.required);
  if(regressed.length)return{index:clearRows.length+2,level:2,label:`필수 후퇴 · ${regressed.map(item=>item.label).slice(0,2).join(' · ')}`};
  if(!clearRows.length)return{index:0,level:0,label:'필수 조건 동급'};
  // The display must preserve the same equal-priority gates as the party
  // planner. In particular, physical armor and the minimum stun floor are one
  // stage, as are safe slow and boss/frenzy coverage.
  // v19.9.7(0802 교정): 마딜도 물딜과 같이 stunFull 은 마지막 그룹이다 —
  // 순서만 뒤로 갈 뿐 필수 해제는 없다.
  const mode=plan&&plan.mode,route=plan&&plan.resolvedMagicRoute||plan&&plan.deficits&&plan.deficits.route||plan&&plan.settings&&plan.settings._resolvedMagicRoute||'singleEnd',basePriority=mode==='physical'?[['armor','stunBase'],['slow','bossFrenzy'],['stunFull']]:route==='dual'?[['main','stunBase'],['slow'],['bossFrenzy','toki'],['stunFull']]:[['main'],['bossFrenzy','stunBase'],['slow'],['singleEndExpected','single','end'],['stunFull']],priority=insertMechanicPriorityGroup(basePriority,mechanicRequirementKeys(clearRows)),missing=new Set(clearRows.map(item=>item.key)),grouped=new Set(),groups=[];
  for(const keys of priority){const active=keys.filter(key=>missing.has(key));if(active.length){groups.push(active);active.forEach(key=>grouped.add(key));}}
  for(const need of clearRows)if(!grouped.has(need.key))groups.push([need.key]);
  for(let index=0;index<groups.length;index++){
    const changes=groups[index].map(key=>byKey.get(key)).filter(Boolean).filter(change=>num(change.gapBefore)-num(change.gapAfter)>0);if(!changes.length)continue;
    const closed=changes.some(change=>change.closed),labels=changes.map(change=>change.label).filter(Boolean).slice(0,2).join(' · ');
    return{index,level:closed?0:1,label:`${labels||'필수 역할'} ${closed?'충족':'보강'}`};
  }
  return{index:groups.length+1,level:1,label:row&&row.pairSynergy?'상위 시너지 보강':'후순위 패 효율'};
}
function compareSupportRows(a,b){
  const availability=row=>row.feasible&&row.valueStatus!=='hold'?0:row.feasible?1:2,availableOrder=availability(a)-availability(b);if(availableOrder)return availableOrder;
  const as=a.supportStage||{},bs=b.supportStage||{};if(num(as.index)!==num(bs.index))return num(as.index)-num(bs.index);if(num(as.level)!==num(bs.level))return num(as.level)-num(bs.level);
  for(const tier of ['rare','special','uncommon','common'])if(num(a.tierUse&&a.tierUse[tier])!==num(b.tierUse&&b.tierUse[tier]))return num(b.tierUse&&b.tierUse[tier])-num(a.tierUse&&a.tierUse[tier]);
  const aw=num(a.solve&&a.solve.wispCost),bw=num(b.solve&&b.solve.wispCost);if(aw!==bw)return aw-bw;
  if(!!a.pairSynergy!==!!b.pairSynergy)return Number(!!b.pairSynergy)-Number(!!a.pairSynergy);if(num(a.coverage)!==num(b.coverage))return num(b.coverage)-num(a.coverage);
  // v19.17(A1): 클리어 실측 파트너 지분은 마지막 타이브레이크다 — 역할
  // 수학(가용성·필수 단계·티어·선위·시너지·기여)이 전부 같을 때만
  // 실전에서 더 자주 함께 클리어한 쪽을 앞세운다.  게이트·목표 불변.
  if(num(a.metaPartnerShare)!==num(b.metaPartnerShare))return num(b.metaPartnerShare)-num(a.metaPartnerShare);
  return nameOf(a.unit).localeCompare(nameOf(b.unit),'ko');
}
// v17.27(사용자 요청): "지금 가진 희귀함으로 만들 수 있는 전설급 유닛".
// 재료를 모으는 구간에서는 다음 행동이 PREPARE로 잠겨 화면에 할 일이
// 안 보인다.  그때도 "내 희귀함으로 뭘 만들 수 있는지"는 항상 보여야
// 사용자가 스스로 판단할 수 있다.
//
// 판단 엔진의 추천과 독립적이다 — 순위나 권장이 아니라 현재 패 원장으로
// 계산한 사실 목록이다.  희귀를 실제로 소모하는 전설급만 싣고, 그 희귀
// 아래에 묶는다.  이미 보유한 유닛과 상위는 제외한다.
function rareCraftableLegends(state,options){
  options=options||{};
  if(!state||!state.db||!Array.isArray(state.db.rares))return[];
  const db=state.db,counts=state.counts||{},maxPerRare=Math.max(1,num(options.maxPerRare)||6);
  const family=options.family==='physical'||options.family==='magic'?options.family:'';
  const out=[];
  for(const rare of db.rares){
    const owned=Math.max(0,num(counts[rare.id]));
    if(owned<=0)continue;
    const made=[];
    for(const unit of db.legendish){
      if(!unit||isUpper(unit)||num(counts[unit.id])>0)continue;
      if(family&&familyOf(unit)!=='neutral'&&familyOf(unit)!==family)continue;
      let solve=null;
      try{solve=recipeSolve(db,unit.id,counts);}catch(error){continue;}
      if(!solve)continue;
      // 이 희귀를 실제로 쓰는 조합만 이 칸에 싣는다.
      if(num(solve.rareUse&&solve.rareUse[rare.id])<=0)continue;
      const hardBlocked=solve.hardMissing&&Object.keys(solve.hardMissing).length>0;
      const wispCost=num(solve.wispCost),wispHave=num(counts[WISP_ID]);
      made.push({
        id:unit.id,unit,name:nameOf(unit),
        wispCost,wispGap:Math.max(0,wispCost-wispHave),
        ready:!hardBlocked&&wispCost<=wispHave,
        blocked:hardBlocked,
        rareUse:num(solve.rareUse[rare.id]),
        roles:summarizeRoles({role:roleProfile(unit)},options.mode==='magic'?'magic':'physical'),
        missing:commonTop(db,solve.lowestMissing||{},3)
      });
    }
    if(!made.length)continue;
    // 지금 바로 되는 것 → 선위만 모자란 것 → 막힌 것 순.
    made.sort((a,b)=>Number(b.ready)-Number(a.ready)||Number(a.blocked)-Number(b.blocked)||a.wispCost-b.wispCost||nameOf(a.unit).localeCompare(nameOf(b.unit),'ko'));
    out.push({id:rare.id,name:nameOf(rare),unit:rare,owned,readyCount:made.filter(row=>row.ready).length,rows:made.slice(0,maxPerRare),total:made.length});
  }
  out.sort((a,b)=>b.readyCount-a.readyCount||b.total-a.total||nameOf(a.unit).localeCompare(nameOf(b.unit),'ko'));
  return out;
}
function upperProfileData(state,upper,plan,upperMemo,synergyMemo){
  if(!upper)return null;plan=plan||{};const memo=upperMemoFor(upper,upperMemo),role=roleProfile(upper),facts=skillFacts(upper),strategy=upperStrategy(upper),mode=familyOf(upper)==='neutral'?plan.mode:familyOf(upper),supports=(plan.rows||[]).filter(row=>row&&row.unit&&row.unit.id!==upper.id&&canonicalUpperId(row.unit.id)!==canonicalUpperId(upper.id)&&num(state.counts[row.unit.id])<=0).filter(row=>num(row.coverage)>0||row.pairSynergy).map(row=>Object.assign({},row,{tierUse:supportTierUse(state,row),supportStage:supportClearStage(row,plan),metaPartnerShare:partnerShareFor(upper.id,row.unit)})).sort(compareSupportRows);
  supports.forEach((row,index)=>{row.supportRank=index+1;row.supportStageLabel=row.supportStage.label;});
  return{upper,memo,role,facts,strategy,mode,rankedSupports:supports,now:supports.filter(row=>row.feasible&&row.valueStatus!=='hold').slice(0,3),later:supports.filter(row=>!row.feasible||row.valueStatus==='hold').slice(0,5)};
}
function statusForRow(row,state){if(row.feasible)return{key:'ready',label:row.solve.wispCost?`선위 ${row.solve.wispCost} · 제작 가능`:'즉시 제작 가능'};if(row.blocked.length)return{key:'blocked',label:row.blocked[0]};return{key:'wait',label:`선위 ${row.wispGap}개 더 필요`};}
function summarizeRoles(row,mode){
  const r=row.role,parts=[];if(r.stun)parts.push(`스턴 ${round3(r.stun)}`);if(r.slow)parts.push(`상시이감 ${r.slow}`);if(r.triggerSlow)parts.push(`발동이감 ${r.triggerSlow}`);if(r.singleSlow)parts.push(`단일이감 ${r.singleSlow}`);if(mode==='physical'&&r.armor)parts.push(`상시방깎 ${r.armor}`);if(mode==='physical'&&r.triggerArmor)parts.push(`발동방깎 ${r.triggerArmor}`);if(r.armorBreak)parts.push('암브');if(mode==='magic'&&r.single)parts.push(`단일 ${r.single}`);if(mode==='magic'&&r.end)parts.push(`끝딜 ${r.end}`);if(r.boss&&r.frenzy)parts.push('광보잡');else if(r.boss)parts.push('보잡');else if(r.frenzy)parts.push('광폭');if(r.sharedUtility)parts.push('공용 유틸');if(r.supportDamage)parts.push('보조딜');if(r.magicDef||r.magicAmp||r.explosionAmp)parts.push('마딜 유틸');else if(r.utility&&!r.supportDamage&&!r.sharedUtility)parts.push('유틸');if(r.attack)parts.push(`공증 ${r.attack}`);if(r.speed)parts.push(`공속 ${r.speed}`);if(r.regen)parts.push(`체젠 ${r.regen}`);if(r.mana)parts.push(`마젠 ${r.mana}`);return parts.slice(0,6).join(' · ')||'역할 보조';
}
// v19.10(외부 점검 4-4): 상위 슬롯 규칙 단일화 — 플래너와 실행 엔진이
// 서로 다른 조건을 가지면 Worker 오류·캐시 공백 때 물딜 두 번째 상위가
// 한쪽에서만 인정된다.  마딜 dual=2, 물딜은 두 번째 상위 확정 시에만 2.
function upperSlotLimit(routeKey,settings){
  // v23.1(사용자 승인): 상위 상한은 항법에서 온다 — 패왕의길 1 · 계엄령 0.
  const navCap=navProfile(settings&&settings.navFamily,settings&&settings.navPerk).upperCap;
  let base=1;
  if(routeKey==='dual')base=2;
  else if(routeKey==='physical'&&!!String(settings&&settings.secondUpperId||''))base=2;
  return navCap!=null?Math.min(base,navCap):base;
}
function snapshotHealth(snapshot,now){
  const s=snapshot||{},time=now||Date.now(),seconds=value=>value?Math.floor(Math.max(0,time-num(value))/1000):9999;
  const bridgeAt=num(s.bridgeAt||s.at),scanAt=num(s.scanAt||s.at),dataChangedAt=num(s.dataChangedAt||s.at);
  const ageSec=seconds(bridgeAt),scanAgeSec=seconds(scanAt),dataAgeSec=seconds(dataChangedAt);
  const result=(key,label,ready,note)=>({key,label,ready,ageSec,bridgeAgeSec:ageSec,scanAgeSec,dataAgeSec,note});
  if(!bridgeAt)return result('missing','TMO 미수신',false,'TMO.GG 데스크톱 프로그램과 32172 조합도우미를 먼저 연 뒤 다시 읽기를 눌러주세요. 기존 34366도 호환됩니다.');
  if(s.source==='manual'&&num(s.unitCount)>=80)return result('partial','오프라인 수동 모드',true,'자동 진행도·능력치 없이 수동으로 입력한 보유 유닛을 기준으로 계산합니다.');
  // v19.9.6(A안): 로컬 직결 — TMO 데스크톱 /datas 를 확장이 직접 읽는다.
  // 서버가 보유 유닛 전수를 주므로 DOM 파싱용 게이트(300~380종·전량 커버)
  // 대신 신선도·위습 계약만 본다.  %·현재 능력치는 TMO 탭 보강 항목이다.
  if(s.source==='local-direct'){
    if(ageSec>12)return result('stale','로컬 직결 수신 끊김',false,`마지막 /datas 읽기 ${ageSec}초 전입니다. TMO.GG 데스크톱 앱 실행 여부를 확인하세요. 오래된 추천은 숨겼습니다.`);
    if(s.wispCountFound!==true)return result('error','로컬 직결 위습 수량 미확인',false,'위습 수량 없이 제작 가능 여부를 판정하지 않습니다. 다시 읽기를 기다리거나 수동 보정하세요.');
    if(ageSec>7)return result('lag','로컬 직결 수신 지연',true,`마지막 /datas 읽기 ${ageSec}초 전입니다. 12초를 넘으면 추천을 자동으로 숨깁니다.`);
    // v19.9.9(외부 점검 P0-1): 미해석 코드가 남아 있으면 숨기지 않는다 —
    // 아는 코드 수량은 정상이지만, 방금 만든 유닛이 그 미해석일 수 있다.
    {const unknownCount=(s.localDirect&&s.localDirect.unknownCodes||[]).length;
    if(unknownCount>0)return result('partial',`로컬 직결 · 미해석 코드 ${unknownCount}종`,true,'아는 코드의 수량은 정상 수집 중입니다. 방금 만든 유닛이 화면에 없으면 연결 진단의 미해석 코드를 확인하세요 — 표본 대조로 매핑을 추가할 수 있습니다.');}
    // v20.5: 완성도%는 더는 화면에 없다.  그런데도 상태줄이 "%·능력치 보강
    // 대기"라고 말하면, 사용자는 찾을 수 없는 표시를 기다리게 된다.  값은
    // 여전히 순위 계산에 쓰이므로 대기 자체는 사실 — 그 값이 무엇에 쓰이는지로
    // 바꿔 말한다.
    if(num(s.abilityCount)<3)return result('partial','로컬 직결 · 순위 보정·능력치는 TMO 탭 보강 대기',true,'게임 데이터를 /datas 로 직접 읽는 중입니다. 추천 순위를 다듬는 값과 현재 능력치는 TMO 조합도우미 탭이 열려 있으면 자동 보강됩니다.');
    return result('ok','로컬 직결 실시간',true,'TMO 화면 없이 게임 데이터를 직접 읽고 있으며, 추천 순위를 다듬는 값과 현재 능력치는 TMO 탭에서 보강 중입니다.');
  }
  if(s.source!=='tmo')return result('error','알 수 없는 데이터 원본',false,'지원하는 TMO 연동 또는 동봉 수동 실행 파일에서 다시 시작해 주세요.');
  // v19.7.1(외부 감사): 커넥터 전 구간이 숫자 번호를 받는데 최종 상태 판정만
  // 32172/34366 고정이라 다른 번호가 여기서 다시 죽었다 — 같은 규칙으로 통일.
  // "정말 ORD 도우미인가"는 아래 내용 게이트(유닛 수·전량 파싱·신뢰도)가 판정한다.
  const helper=String(s.helperId||''),supportedHelper=/^\d{1,8}$/.test(helper)||helper==='offline';
  if(!supportedHelper||s.parser!=='ord-tmo-parser-v13-adapter')return result('error','지원하지 않는 TMO 도우미',false,'tmo.gg 조합도우미(숫자 번호 자동 인식, 주: 32172)를 사용하세요.');
  if(ageSec>12||scanAgeSec>12)return result('stale','TMO 새 스캔 없음',false,`브리지 ${ageSec}초·DOM 스캔 ${scanAgeSec}초 전입니다. TMO 탭과 확장 프로그램을 확인해 주세요. 오래된 추천은 숨겼습니다.`);
  const collection=s.collection||{},countDiscovery=s.countDiscovery||{},unitCount=num(s.unitCount),parsed=num(countDiscovery.parsed),coverage=unitCount?parsed/unitCount:0,confidence=num(collection.confidence);
  const catalogSize=typeof global!=='undefined'&&global.ORD_TMO_UNITS?global.ORD_TMO_UNITS.length:0,unitMin=catalogSize?Math.max(200,catalogSize-7):300,unitMax=catalogSize?Math.min(380,catalogSize+73):380;if(collection.found!==true||countDiscovery.found!==true||unitCount<unitMin||unitCount>unitMax||coverage!==1||num(countDiscovery.missing)>0||num(countDiscovery.ambiguous)>0||confidence<.72)return result('error','유닛 수량 수집 불완전',false,`유닛 ${unitCount}개·수량 ${parsed}/${unitCount}개·누락 ${num(countDiscovery.missing)}개·모호 ${num(countDiscovery.ambiguous)}개·신뢰도 ${Math.round(confidence*100)}%입니다. 실패한 수량을 0으로 쓰지 않고 이전 정상 패를 보호합니다.`);
  if(s.wispCountFound!==true)return result('error','선택 위습 수량 미확인',false,'선택 위습은 제작 가능 여부를 바꾸므로 수량을 임의로 0 처리하지 않습니다. TMO 탭을 새로고침하거나 수동 보정하세요.');
  if(s.connected===false)return result('partial','패 수집 정상 · 데스크톱 미연동',true,'패 수량은 정상입니다. 자동 게임 연동까지 쓰려면 TMO.GG 데스크톱 프로그램을 실행하세요.');
  if(num(s.abilityCount)<3)return result('partial','패 정상 · 현재 능력치 보정 중',true,'보유 수량은 정상 수신했고 빠진 현재 능력치는 보유 유닛 역할값으로 보완합니다.');
  if(ageSec>7||scanAgeSec>7)return result('lag','TMO 수신 지연',true,`브리지 ${ageSec}초·DOM 스캔 ${scanAgeSec}초 전입니다. 12초를 넘으면 추천을 자동으로 숨깁니다.`);
  return result('ok','TMO 실시간 정상',true,`현재 패·진행도·능력치를 반영합니다. 패 자체 변경은 ${dataAgeSec<9999?`${dataAgeSec}초 전`:'아직 없음'}이며 하트비트는 새 패로 세지 않습니다.`);
}
// v19.16(클리어 실측): 전수 랭킹 데이터의 검증된 클리어 최종 조합
// 91,833판을 역할 원장으로 재해석한 분포(ord_clear_stats.js, 빌드 생성).
// 표시·경고 전용 — 이 수치로 게이트를 만들거나 목표를 자동 교체하지
// 않는다(최종 조합 데이터라 "무엇을"의 근거이지 "언제"의 근거가 아님).
function clearStatsFor(upperId){
  const stats=typeof window!=='undefined'&&window.ORD_CLEAR_STATS||typeof globalThis!=='undefined'&&globalThis.ORD_CLEAR_STATS||null;
  if(!stats||!stats.byUpper)return null;
  return stats.byUpper[String(canonicalUpperId(upperId))]||null;
}
// v19.17(A1): 이 상위의 클리어 실측 파트너 지분(%).  91,833판에서 함께
// 클리어한 빈도로, 보조 후보 정렬의 후순위 타이브레이크와 표시에만
// 쓴다 — 게이트·목표는 바꾸지 않는다(위 purpose 경계 동일).
function partnerShareFor(upperId,unitOrId){
  const stats=clearStatsFor(upperId);if(!stats)return 0;
  const id=String(unitOrId&&unitOrId.id||unitOrId||'');if(!id)return 0;
  const hit=(stats.partners||[]).find(item=>String(item.id)===id);
  return hit?num(hit.share):0;
}
// v24.1(사용자: "제대로 추천을 못하면 의미가 없잖아"): 악몽 상위 2기
// 클리어 62,052판(정본 병합)의 페어 판수.  용도 경계는 클리어 실측
// 전반과 동일 — 표시·경고와 "동급(제작 가능·티어·처방 동일) 안의
// 타이브레이크" 전용, 게이트·목표 자동 교체 금지.
function pairClearGames(aId,bId){
  const stats=typeof window!=='undefined'&&window.ORD_CLEAR_STATS||typeof globalThis!=='undefined'&&globalThis.ORD_CLEAR_STATS||null;
  if(!stats||!stats.pairs)return 0;
  const a=String(canonicalUpperId(aId&&aId.id||aId||'')),b=String(canonicalUpperId(bId&&bId.id||bId||''));
  if(!a||!b)return 0;
  return num(stats.pairs[[a,b].sort().join('|')]);
}
// 페어 실측 버킷: 2=검증(30판 이상, clear-stats minGames 와 같은 선) ·
// 1=기록 있음(30판 미만) · 0=기록 없음.  판수 원값으로 정렬하면 5판
// 차이가 선위 3 싼 후보를 눌러 버리므로 구간으로만 비교한다.
function pairClearBucket(games){const g=num(games);return g>=30?2:g>0?1:0;}
function debugFixture(){return{VERSION,roleProfile,magicFinishProfile,evaluateMagicSingleEnd,skillFacts,upperStrategy,upperPairSynergy,storyGrade,storyLeagueKey,storyLeagueTier,storyLeagueGrade,storyLeagueRows,recipeSolve,predictCompletionWithAddedMaterial,specialPrerequisiteStatus,currentSpec,controlEnvelope,controlState,clearProfileDetails,deficits,recommendationPlan,gameFlow,progressionCounts,normalizePostLegendRoute,selectCompatibleQueue,rareTargetsForRound,rareInventoryFor,rarePressureForInventory,rareSpendForSolve,rowScore,roundClock,snapshotHealth};}

global.ORDCore={VERSION,WISP_ID,ROLE_AXIS,roleAxis,axisSummary,FINAL_UNIT_HOLD_READS,stabilizeFinalUnits,SUPER_KUMA_ID,RAYLEIGH_HIDDEN_ID,PIRATE_SHIP_ID,STORY10_FORFEITS,SPECIAL_IDS,eligible152Specials,eligible152SpecialId,COMMON_COLORS,GOROSEI,GOROSEI_COMMON_CURSE,NAVIGATION,navProfile,specialTrainingProfile,specialTrainingAdvice,STACK_RAMP_UPPER_IDS,isStackRampUpper,MAGIC_SINGLE_END_SUSPENDED,CONTROL_ENVELOPE,CONTROL_PROFILES,BOSS_META,bossPreview,UPPER_LINE_PROFILE,DEFENSE_ARMOR,armorMultiplier,SELECTION_WISP_INCOME_PER_ROUND,RANDOM_WISP_PER_ROUND,COMMON_KIND_COUNT,wispIncomeProjection,ARMOR_BREAK_CAP,armorBreakStacks,armorBreakModel,ATTACK_TYPE_VS_BOSS,upperCombatFor,upperRawDps,upperBossDps,bossRawDpsNeed,upperSkillProfile,upperSkillProcDps,skillProcTrust,simulateBossFlat,STUN_RESEARCH,STUN_BASE_FLOOR,BOSS_FRENZY_WEIGHTS,bossFrenzyCredit,STORY_RARE_BENCHMARKS,STORY_RARE_RANKS,STORY_RESEARCHED,STORY_LEAGUES,STORY_GRADE_TIERS,UPPER_VARIANT_FAMILIES,UPPER_POWER_TIER_RANK,UPPER_POWER_TIER_LETTERS,upperPowerTier,POST_LEGEND_ROUTES,MAX_ROUND,MAX_WISP_COST,PREFERRED_WISP_COST,num,esc,cleanName,canonicalAbility,groupName,nameOf,displayNameOf,mergedDbFor,liveIdMatchRate,tierKey,isRare,isCommon,isUncommon,isSpecialTier,isUpper,isLegendish,isChanged,isWarped,isShip,isSeraph,isTranscend,requiresWarpedCraft,familyOf,canonicalUpperId,activeUpperVariant,upperPairSynergy,descriptionPartnerSynergy,roleProfile,magicFinishProfile,evaluateMagicSingleEnd,skillFacts,upperStrategy,stunResearch,stunCaptureRate,storyGrade,storyLeagueKey,storyLeagueTier,storyLeagueGrade,storyLeagueRows,buildDb,mergeLiveCatalog,normalizeState,recipeSolve,predictCompletionWithAddedMaterial,reserveTargets,specialPrerequisiteStatus,materialName,mapText,commonTop,completionPercent,ledgerCompletion,ownedUnits,ownedDisplayUnits,isRoleBearingUnit,currentSpec,finalGradeSpec,applyBuildStep,controlEnvelope,controlState,clearProfileDetails,deficits,roleContribution,bossCreditFor,upperMemoFor,synergyRankFor,mainUpper,inferMode,candidateRow,recommendationPlan,gameFlow,progressionCounts,normalizePostLegendRoute,milestonePurpose,phaseForRound,roundClock,rareResolution,rareTargetsForRound,rareInventoryFor,rarePressureForInventory,rareSpendForSolve,rareCraftableLegends,upperProfileData,statusForRow,summarizeRoles,upperSlotLimit,snapshotHealth,clearStatsFor,partnerShareFor,pairClearGames,pairClearBucket,insertMechanicPriorityGroup,mechanicRequirementKeys,debugFixture};
})(window);
