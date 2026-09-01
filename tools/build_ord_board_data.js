'use strict';
// ═══════════════════════════════════════════════════════════════════════
// ORD 악몽 보드 — 데이터 증류기 (v32.0.0 전면 신작의 1단계)
//
// 사용자 지시(0830): "지금까지 만든거 프로그램 아예 사용하지 말고 다시
// 제대로 정리해서 만들어봐 처음 만드는 것 처럼"
//
// 신작의 원칙: 런타임 프로그램(ord_board/)은 옛 코드를 한 줄도 싣지
// 않는다.  다만 다섯 달의 검증 자산(2.314 정본 카탈로그·패치 레이어·
// 역할 교정표·유효 스턴 연구표·클리어 실측 코퍼스·수신 코드맵)은
// '지식'이므로 버리지 않는다 — 이 증류기가 빌드 타임에 옛 모듈을 vm
// 오라클로 읽어 순수 데이터 한 파일(ord_board/data.js)로 굳힌다.
// 굳힌 뒤에는 신작 어디에서도 옛 파일을 로드하지 않는다.
//
// 실행: node tools/build_ord_board_data.js
// ═══════════════════════════════════════════════════════════════════════
const fs=require('fs'),path=require('path'),vm=require('vm');
const REPO=path.join(__dirname,'..');
const OLD=path.join(REPO,'archive','legacy_program');
const OUT=path.join(REPO,'ord_board','data.js');

// ── 옛 모듈을 오라클로 로드(빌드 타임 전용) ────────────────────────────
const ctx={console};ctx.window=ctx;vm.createContext(ctx);
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_clear_stats.js','ord_core.js','ord_local_code_map.js']){
  vm.runInContext(fs.readFileSync(path.join(OLD,file),'utf8'),ctx,{filename:file});
}
const C=ctx.ORDCore,LM=ctx.ORD_LOCAL_MAP,units=ctx.ORD_TMO_UNITS;
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const round3=v=>Math.round(num(v)*1000)/1000;

// ── 이름 분해(v27.1 규칙 승계): 마지막 '숫자 스펙' 괄호만 떼어낸다 ──────
const SPEC_NOTE_RE=/[0-9]|딜러|라인딜|범퍼|보잡|광폭|암브|스턴|이감|깍|공속|공증|마젠|체젠|끝딜|단일|폭뎀|마방|삭제|탐색|버프|유틸|보조/;
function splitName(name){
  const full=String(name||'');const at=full.lastIndexOf(' (');
  if(at<0)return{short:full,note:''};
  const inner=full.slice(at+2).replace(/\)\s*$/,'');
  if(!SPEC_NOTE_RE.test(inner))return{short:full,note:''};
  return{short:full.slice(0,at),note:inner};
}

// ── 유닛 증류: 역할·티어·계통·스토리 등급을 굳힌다 ──────────────────────
const db=C.buildDb(units);
const baked=[];
for(const u of units){
  const role=C.roleProfile(u);
  const display=C.displayNameOf(u);
  const parts=splitName(display);
  const finish=C.magicFinishProfile(u);
  let story=null;
  try{
    const grade=C.storyLeagueGrade(u,C.storyGrade(u));
    if(grade&&grade.tier&&grade.tier!=='—')story={tier:String(grade.tier),rank:num(grade.rank||grade.storyRank)||0};
  }catch(_){story=null;}
  baked.push({
    id:String(u.id),
    name:display,
    short:parts.short,
    note:parts.note,
    color:C.tierKey(u)==='common'?(C.COMMON_COLORS[parts.short]||C.COMMON_COLORS[display]||''):'',
    image:String(u.image||''),
    group:String(u.groupName||''),
    tier:C.tierKey(u),                 // common|uncommon|special|rare|upper|legend|hard|other
    family:C.familyOf(u),              // physical|magic|neutral
    canon:String(C.canonicalUpperId(u.id)),
    upper:C.isUpper(u),
    legendish:C.isLegendish(u),
    changed:C.isChanged(u),
    seraph:C.isSeraph(u),
    warped:C.isWarped(u),
    ship:C.isShip(u),
    transcend:C.isTranscend(u),
    stuffs:(u.stuffs||[]).map(s=>({id:String(s.id),count:num(s.count)})),
    roles:{
      stun:round3(role.stun),slow:num(role.slow),triggerSlow:num(role.triggerSlow),singleSlow:num(role.singleSlow),
      armor:num(role.armor),triggerArmor:num(role.triggerArmor),singleArmor:num(role.singleArmor),stackArmor:num(role.stackArmor),
      magicDef:num(role.magicDef),magicAmp:num(role.magicAmp),explosionAmp:num(role.explosionAmp),
      single:num(role.single),end:num(role.end),boss:!!role.boss,frenzy:!!role.frenzy,
      armorBreak:!!role.armorBreak,armorBreakWeight:num(role.armorBreakWeight),
      attack:num(role.attack),attackPenalty:num(role.attackPenalty),triggerAttack:num(role.triggerAttack),
      speed:num(role.speed),regen:num(role.regen),mana:num(role.mana),
      utility:!!role.utility,supportDamage:!!role.supportDamage,deletion:!!role.deletion,
      finishCredit:round3(finish.directCredit)
    },
    story
  });
}

// ── 조합 명령어 증류: 게임 채팅에 치는 제작 커맨드(검증된 것만) ─────────
// 상속표는 옛 앱의 확정 지식(변형 상위 → 원형 최초 제작 명령)에서 추출.
const appSrc=fs.readFileSync(path.join(OLD,'ord_app.js'),'utf8');
const inheritMatch=appSrc.match(/COMMAND_INHERITANCE=\{([\s\S]*?)\};/);
const COMMAND_INHERITANCE={};
if(inheritMatch)for(const m of inheritMatch[1].matchAll(/'([^']+)':'([^']+)'/g))COMMAND_INHERITANCE[m[1]]=m[2];
const rawById=new Map(units.map(u=>[String(u.id),u]));
for(const row of baked){
  const raw=rawById.get(row.id);
  let cmds=Array.isArray(raw&&raw.commands)?raw.commands.filter(Boolean):[];
  let inherited=false;
  if(!cmds.length&&COMMAND_INHERITANCE[row.id]){
    const src=rawById.get(COMMAND_INHERITANCE[row.id]);
    cmds=Array.isArray(src&&src.commands)?src.commands.filter(Boolean):[];
    inherited=cmds.length>0;
  }
  const korean=cmds.filter(c=>/[가-힣]/.test(String(c))).join(' / ');
  const english=cmds.filter(c=>!/[가-힣]/.test(String(c))&&String(c).trim()).join(' / ');
  if(korean||english)row.command={korean,english,inherited};
}

// ── 클리어 실측 증류: 상위 정본(canon)당 실측·동반·페어 ─────────────────
const clear={};
for(const u of units){
  if(!C.isUpper(u))continue;
  const canon=String(C.canonicalUpperId(u.id));
  if(clear[canon])continue;
  const st=C.clearStatsFor(u.id);
  const pairs=[];
  for(const other of units){
    if(!C.isUpper(other))continue;
    const otherCanon=String(C.canonicalUpperId(other.id));
    if(otherCanon===canon||pairs.some(p=>p.id===otherCanon))continue;
    const games=num(C.pairClearGames(u.id,other.id));
    if(games>0)pairs.push({id:otherCanon,games});
  }
  pairs.sort((a,b)=>b.games-a.games);
  clear[canon]={
    games:num(st&&st.games),
    dualGames:num(st&&st.dualGames),
    partners:(st&&st.partners||[]).map(p=>({id:String(p.id),name:String(p.name||''),share:num(p.share)})),
    pairs
  };
}

// ── 수신 코드맵 증류(로컬 직결 번역 지식) ───────────────────────────────
const codeIndex=LM.buildCodeIndex(units,C.canonicalUpperId);
const codeMap=Object.assign({},codeIndex.map,LM.CODE_MAP);

// ── TMO 페이지 능력치 정합(v31, 사용자 0831h) ───────────────────────────
// 사용자가 직접 붙여넣은 티모지지 조합도우미 페이지(2026-08-31)의 유닛 DB
// 수치를 표시 정본으로 채택 — 구 증류치와의 드리프트(밸런스 변경, 유효치
// 표기)를 현행 사이트 표기로 맞춘다.  파일에 적힌 키만 덮어쓴다: TMO 가
// 툴팁 필드로 안 싣는 부가 지식(발동 확률 환산 스턴, 코비의 폭뎀 패널티
// 등)은 기존 증류 값이 그대로 산다.
const TMO_PAGE=JSON.parse(fs.readFileSync(path.join(REPO,'tools','tmo_page_abilities_20260831.json'),'utf8'));
{
  const bakedById=new Map(baked.map(r=>[r.id,r]));
  let touched=0,changed=0;
  for(const[key,entry]of Object.entries(TMO_PAGE)){
    if(key.startsWith('_'))continue;
    const id=bakedById.has(key)?key:String(codeMap[key]||'');
    const row=id?bakedById.get(id):null;
    if(!row){console.warn('TMO 오버레이 미해결 키:',key,entry.name);continue;}
    touched+=1;
    for(const[k,v]of Object.entries(entry.roles||{})){
      const value=num(v);
      if(!(k in row.roles)||typeof row.roles[k]==='boolean')continue;
      if(num(row.roles[k])!==value){row.roles[k]=value;changed+=1;}
    }
  }
  console.log(`TMO 페이지 정합: ${touched}유닛 대조 · ${changed}필드 교정`);
}

// ── 스펙 목표(정본: 2.312R 맵 원문 + 오로성 문서 — 원랜디_2314_재검증) ──
const targets={
  slow:{base:102,nasjuro:117},
  armor:{soft:180,full:211,warcurySoft:195,warcuryFull:226},
  stun:{floor:0.7,safe:1.5},
  bossFrenzy:{physical:1.5,magic:1},
  finishMagic:3,
  gorosei:{
    none:{label:'미확인',note:''},
    nasjuro:{label:'나스쥬로',note:'적 이속 +15% · 아군 공속 -15% · 라인몬 체력 +1,500만 — 이감 목표 117'},
    warcury:{label:'워큐리',note:'적 방어·마방 +15 · 보스 체력 +1,500만 — 방깎 목표 195/226'},
    saturn:{label:'새턴',note:'아군 공격력 -30% · 폭뎀 증폭 -10% — 화력 저주(스펙표 밖), 여유 확보'}
  }
};

const data={
  version:'32.0.0',
  gameVersion:'2.314',
  builtAt:new Date().toISOString(),
  wispId:String(C.WISP_ID),
  superKumaId:String(C.SUPER_KUMA_ID),
  maxWispCost:15,   // v30(사용자 0831d): "선위 15개까지는 괜찮은 것 같아"
  conflictCap:20,
  specialIds:Object.assign({},C.SPECIAL_IDS),
  ignoreCodes:LM.IGNORE_CODES.slice(),
  playableSpecialIds:LM.SPECIAL_IDS.slice(),
  codeMap,
  units:baked,
  clear,
  targets
};

const header=`// ORD 악몽 보드 — 증류 데이터 (생성물 · 수동 편집 금지)
// 생성: node tools/build_ord_board_data.js
// 원천: 2.314 정본 카탈로그(41824+patch2310/2312/2314) · 역할 교정표 ·
//        유효 스턴 연구표 · 클리어 실측 ${num(ctx.ORD_CLEAR_STATS&&ctx.ORD_CLEAR_STATS.records)}판 · 로컬 직결 코드맵.
`;
fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,header+'window.ORD_BOARD_DATA='+JSON.stringify(data)+';\n');
const kb=Math.round(fs.statSync(OUT).size/1024);
console.log(`ord_board/data.js 생성: 유닛 ${baked.length} · 상위 정본 ${Object.keys(clear).length} · 코드맵 ${Object.keys(codeMap).length} · ${kb}KB`);
