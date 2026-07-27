'use strict';

// v17.20 — 사용자 확인: 상위 이름 앞 알파벳이 맵이 정한 티어이고
// S > A > B > C > D > F 순이다.  "각이 아주 잘 나오지 않는 이상 좋은
// 상위를 대부분 간다"가 실전 규칙이므로, 1순위 축은 "지금 패 원장으로
// 도달 가능한 최고 티어"이고 아래 티어는 선위가 크게 쌀 때만 올라온다.
//
// 실측 근거(0725 로그 25라 재생): 보유 선위 22에서
//   (S)징베 3선위 · 차단 없음      ← 즉시 제작 가능
//   (A)카벤딧슈 17선위
//   (D)스코퍼가반 22선위 + 특수재료 1종 미보유(차단)
// 인데 화면 후보에는 A와 D만 올라왔다.  티어를 아예 안 보고 있었다.

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_meta_stats.js','ord_core.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js'])require(path.join(EXT,file));

const C=global.ORDCore,M=global.ORDV15Model,E=global.ORDV15Engine,units=global.ORD_TMO_UNITS;
let passed=0;
function test(name,fn){fn();passed+=1;console.log(`PASS ${name}`);}

// ORD_2305_20260725_120442 로그의 25라 실제 보드(스냅샷 재생본).
// 이 시점의 선위 22로 (S)징베가 3선위·차단 없이 제작 가능했는데
// 화면 후보에는 (A)카벤딧슈와 (D)스코퍼가반만 올라왔다.
const R25_COUNTS={'100h':6,'200h':6,'300h':8,'400h':5,'500h':7,'600h':6,'610h':1,'700h':2,'800h':5,'810e':22,'900h':6,'920h':1,E00h:2,H10h:2,H30h:1,K00h:3,K20h:1,L20h:1,S00h:1,T10h:1,W00h:1,X10h:1,unit_1767884591387_9300:1,unit_1767884970331_9084:1,X90h:1,C10h:1,L50h:1,V00h:2,unit_1767884871133_6843:2,Q00h:1,'620h':1,A00h:1,C00h:1,O00h:2,'410h':1,N00h:1};
const R25_ABILITIES={'공격력 증가':30,'공중이동':1,'순간이동':1,'방어력 감소':43,'이동속도 감소':10};

function realHandModel(round){
  const counts=Object.assign({},R25_COUNTS);
  return M.build({
    catalog:units,
    snapshot:{source:'v17-20-fixture',sessionId:'tier',seq:1,at:1,dataChangedAt:1,wispCountFound:true,wispCount:C.num(counts['810e']),counts,currentAbilities:R25_ABILITIES,units:units.map(u=>({id:u.id,count:Math.max(0,C.num(counts[u.id])),tmoPercent:0}))},
    settings:{currentRound:round,mode:'physical',magicRoute:'physical',gorosei:'warcury',postLegendRoute:'upper',manualCounts:{},superKumaOwned:true,wispOverride:'',virtualSpecialId:'',upperResearchLevel:21},
    locks:[]
  });
}

test('티어 문자는 이름에서 읽히고 S>A>B>C>D>F 순서다',()=>{
  assert.deepStrictEqual(C.UPPER_TIER_LETTERS,['S','A','B','C','D','F']);
  const db=C.buildDb(units),rankOf=name=>C.upperTierGrade(db.uppers.find(u=>C.nameOf(u).startsWith(name))).rank;
  assert(rankOf('(S)징베')<rankOf('(A)카벤딧슈'),'S가 A보다 아래로 잡혔다');
  assert(rankOf('(A)카벤딧슈')<rankOf('(B)흰수염'));
  assert(rankOf('(B)흰수염')<rankOf('(D)스코퍼가반'));
  // 접두가 없는 3종(요크·릴리스·아틀라스)은 서열을 모르므로 중립값이다.
  const york=C.upperTierGrade(db.uppers.find(u=>C.nameOf(u).startsWith('요크')));
  assert.strictEqual(york.ranked,false);
  assert(york.rank>rankOf('(A)카벤딧슈')&&york.rank<rankOf('(D)스코퍼가반'),'미표기 상위가 중립값이 아니다');
  // 티어 문자는 등급(초월/불멸/영원/제한됨)과 독립이어야 한다.
  const grades=new Set(db.uppers.filter(u=>C.upperTierGrade(u).letter==='A').map(u=>C.groupName(u).replace(/\s*\[.*/,'')));
  assert(grades.size>=3,`A티어가 단일 등급에 몰려 있다: ${[...grades].join(',')}`);
});

test('실전 패: 도달 가능한 최고 티어가 1순위에 오른다',()=>{
  const rows=E._test.upperRouteCandidates(realHandModel(25),[]);
  assert(rows.length>0,'후보가 비었다');
  const top=C.upperTierGrade(rows[0].unit);
  assert.strictEqual(top.letter,'S',`1순위가 S티어가 아니다: ${rows[0].name}`);
  assert.strictEqual(C.num(rows[0].clearValue.tierDrop),0,'최고 티어인데 낙폭이 잡혔다');
  // 이 패에서 실제로 죽었던 판의 선택(D티어 가반)은 후보에서 밀려야 한다.
  const gaban=rows.findIndex(row=>/가반/.test(row.name));
  assert(gaban<0,`D티어 스코퍼가반이 여전히 후보에 있다(${gaban+1}위)`);
  // 목록은 티어 낙폭 오름차순이다.
  for(let i=1;i<rows.length;i+=1)
    assert(C.num(rows[i].clearValue.tierDrop)>=C.num(rows[i-1].clearValue.tierDrop)-1e-9,`티어 낙폭 정렬 위반 @${i}`);
});

test('선위가 크게 쌀 때만 아래 티어가 올라온다',()=>{
  const drop=(steps,saving)=>{
    const rows=[
      {clearValue:{tierRank:0,deadlineFactor:1},wispCost:100},
      {clearValue:{tierRank:steps,deadlineFactor:1},wispCost:100-saving}
    ];
    E._test.assignTierDrop(rows);
    return rows[1].clearValue.tierDrop;
  };
  // 한 단계 아래인데 몇 선위 아끼는 정도로는 자리를 못 뺏는다.
  assert(drop(1,0)>0,'선위 이득 없이 아래 티어가 동급이 됐다');
  assert(drop(1,5)>0,'5선위 절약으로 티어가 내려갔다');
  // 20선위(≈5라운드치)를 아끼면 한 단계 내려올 수 있다.
  assert.strictEqual(drop(1,20),0,'20선위를 아껴도 아래 티어가 못 올라온다');
  // 두 단계는 그만큼 더 필요하다.
  assert(drop(2,20)>0,'20선위로 두 단계나 내려갔다');
  assert.strictEqual(drop(2,40),0,'40선위를 아껴도 두 단계가 안 열린다');
  // 더 비싼 아래 티어는 낙폭이 더 커진다.
  assert(drop(1,-30)>drop(1,0),'더 비싼 아래 티어의 낙폭이 크지 않다');
});

test('도달 불가한 최고 티어는 기준이 되지 않는다',()=>{
  // deadlineFactor<1 = 50라 준비 창 안에 못 들어오는 후보.
  const rows=[
    {clearValue:{tierRank:0,deadlineFactor:.35},wispCost:200},
    {clearValue:{tierRank:2,deadlineFactor:1},wispCost:10},
    {clearValue:{tierRank:3,deadlineFactor:1},wispCost:12}
  ];
  E._test.assignTierDrop(rows);
  assert.strictEqual(rows[1].clearValue.tierBest,2,'도달 불가한 S가 기준 티어로 잡혔다');
  assert.strictEqual(C.num(rows[1].clearValue.tierDrop),0);
  assert(C.num(rows[2].clearValue.tierDrop)>0);
});

test('화면 배선: 후보 카드와 메인 상위에 티어 배지가 붙는다',()=>{
  const app=require('fs').readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  const css=require('fs').readFileSync(path.join(EXT,'ord_cockpit_v15.css'),'utf8');
  assert(/v151-tier-badge/.test(app),'앱에 티어 배지 마크업이 없다');
  assert((app.match(/v151-tier-badge/g)||[]).length>=2,'후보 카드·메인 상위 두 곳에 배선되지 않았다');
  assert(/v151-tier-drop/.test(app),'티어 낙폭 표시가 없다');
  for(const letter of C.UPPER_TIER_LETTERS)
    assert(css.includes(`.v151-tier-badge.tier-${letter}`),`${letter}티어 스타일 누락`);
});

console.log(`V17_20_UPPER_TIER ${passed}/5 passed`);
