#!/usr/bin/env node
'use strict';

// v17.2 — 액션 AST(ord-all-upper-skill-profile/2.0-action-ast)에서 상위별
// "자동공격 유발 스킬 기대 데미지/공격"을 정적으로 도출한다.
//
// 정책(감사 보고서 준수):
//  - 피해량·확률은 actionAst의 JASS 식만 사용한다(tooltip numericMentions 배제).
//  - expectedExpression(랜덤 기대값 전개)을 우선 사용한다.
//  - 수동 시전 정책·대상 수·소환체 타게팅이 미해결이므로 결과는
//    "자동공격 유발 근사 기대치"이며 allowKillVerdict=false를 유지한다.
//
// 도출 범위:
//  - 공격 시작(sc) 진입 함수에서 시작하는 문장 단위 탐색.
//  - zL/zM 확률 게이트(if zL(1,N)<=K 형태)는 확률로 반영, 미해석 조건은
//    통과(근사)로 두고 개수를 기록한다.
//  - 직접 호출·정적 TriggerExecute 콜백을 따라간다(깊이 14, 경로 순환 금지).
//  - UnitAddAbility(더미, 'A0XX')가 프로필의 주문 진입점과 일치하면 해당
//    핸들러를 같은 확률로 연결한다(더미 시전 경로 v1).
//  - 데미지 대상 수는 1(보스 단일 기준)로 계산한다.
//  - DAMAGE_TYPE_UNIVERSAL은 수치 방어 무시 버킷, 그 외는 방어 적용 버킷.

const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const AST_PATH=process.argv[2]||path.join(ROOT,'data/ORD_2305C_all_upper_skill_profiles_action_ast.json');
const DIGEST_PATH=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild/ord_upper_skill_digest.js');
const OUT_PATH=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild/ord_upper_skill_dps.js');

const doc=JSON.parse(fs.readFileSync(AST_PATH,'utf8'));
const fns=doc.actionAst.functions;
const actionsByFnLine=new Map();
for(const action of doc.actionAst.actions){
  const key=action.function;
  if(!actionsByFnLine.has(key))actionsByFnLine.set(key,new Map());
  const lines=actionsByFnLine.get(key);
  if(!lines.has(action.line))lines.set(action.line,[]);
  lines.get(action.line).push(action);
}

function evalConst(expr){
  if(!expr||typeof expr!=='object')return null;
  switch(expr.node){
    case 'literal':return typeof expr.value==='number'?expr.value:null;
    case 'group':return evalConst(expr.expression||expr.inner||expr.value);
    case 'unary':{const v=evalConst(expr.operand||expr.expression);if(v==null)return null;return expr.operator==='-'?-v:expr.operator==='not'?null:v;}
    case 'binary':{
      const l=evalConst(expr.left),r=evalConst(expr.right);
      if(l==null||r==null)return null;
      switch(expr.operator){case '+':return l+r;case '-':return l-r;case '*':return l*r;case '/':return r?l/r:null;default:return null;}
    }
    case 'call':{
      if(expr.function==='zL'||expr.function==='zM'){
        const a=evalConst(expr.arguments&&expr.arguments[0]),b=evalConst(expr.arguments&&expr.arguments[1]);
        return a==null||b==null?null:(a+b)/2;
      }
      if((expr.function==='I2R'||expr.function==='R2I')&&expr.arguments&&expr.arguments.length===1)return evalConst(expr.arguments[0]);
      return null;
    }
    default:return null;
  }
}

// if 조건에서 정적 확률을 추출한다.  zL(1,N)<=K, K>=zL(1,N), zM 변형 지원.
function probOf(cond){
  if(!cond||cond.node!=='binary')return null;
  const roll=side=>side&&side.node==='call'&&(side.function==='zL'||side.function==='zM')?{low:evalConst(side.arguments&&side.arguments[0]),high:evalConst(side.arguments&&side.arguments[1]),integer:side.function==='zL'}:null;
  let r=roll(cond.left),k=evalConst(cond.right),op=cond.operator,flip=false;
  if(!r){r=roll(cond.right);k=evalConst(cond.left);flip=true;}
  if(!r||r.low==null||r.high==null||k==null)return null;
  if(flip)op=op==='<='?'>=':op==='<'?'>':op==='>='?'<=':op==='>'?'<':op;
  const span=r.integer?r.high-r.low+1:r.high-r.low;
  if(span<=0)return null;
  const clamp=v=>Math.max(0,Math.min(1,v));
  if(r.integer){
    if(op==='<=')return clamp((Math.floor(k)-r.low+1)/span);
    if(op==='<')return clamp((Math.ceil(k)-r.low)/span);
    if(op==='>=')return clamp((r.high-Math.ceil(k)+1)/span);
    if(op==='>')return clamp((r.high-Math.floor(k))/span);
  }else{
    if(op==='<='||op==='<')return clamp((k-r.low)/span);
    if(op==='>='||op==='>')return clamp((r.high-k)/span);
  }
  return null;
}

const fourccFromLiteral=arg=>arg&&arg.node==='literal'&&arg.fourcc?arg.fourcc:null;
const isUniversal=action=>/DAMAGE_TYPE_UNIVERSAL/.test(String(action.source||''));

function deriveProfile(profile){
  const spellByRaw={};
  for(const entry of profile.actionProgram.entryPoints||[])
    if(entry.kind==='spell_effect'&&entry.abilityRawcode)spellByRaw[entry.abilityRawcode]=entry.function;
  // abilityRawcode 필드명이 다른 경우 대비
  for(const entry of profile.actionProgram.entryPoints||[]){
    if(entry.kind!=='spell_effect')continue;
    const raw=entry.abilityRawcode||entry.rawcode||entry.raw;
    if(raw&&entry.function)spellByRaw[raw]=entry.function;
  }
  const stats={damageSeen:0,damageEvaluated:0,damageSkippedNonConst:0,unknownConditions:0,aliveGuards:0,spellLinks:0,depthLimited:0};
  // 같은 데미지 액션이 여러 경로(다이아몬드·디스패치)로 도달하면 확률이
  // 합산-중복되므로, 액션별로 도달 확률의 최대값 하나만 인정한다.
  const damageHits=new Map();// actionId → {pStrict:max, pApprox:max, amount, universal, source}
  const followedSpells=new Set();
  const profileDamageIds=new Set(profile.actionProgram.damageActionRefs||[]);
  // 대상 생존/적군 판별류 가드는 보스 상대 상시 참으로 간주한다.
  const aliveGuard=cond=>/LIFE|Life|DEAD|Alive|Enemy|IsUnit|GetWidgetLife/.test(String(cond&&cond.source||''));

  function processLineActions(fname,line,pStrict,pApprox,pathSet,depth){
    const lines=actionsByFnLine.get(fname);
    if(!lines||!lines.has(line))return;
    for(const action of lines.get(line)){
      if(action.kind==='damage'){
        if(!profileDamageIds.has(action.actionId))continue;// 교차 프로필 누수 차단
        const amount=evalConst(action.amount&&(action.amount.expectedExpression||action.amount.expression));
        const prior=damageHits.get(action.actionId);
        if(!prior)damageHits.set(action.actionId,{pStrict,pApprox,amount,universal:isUniversal(action),source:String(action.source||'').slice(0,110)});
        else{prior.pStrict=Math.max(prior.pStrict,pStrict);prior.pApprox=Math.max(prior.pApprox,pApprox);}
      }else if(action.kind==='ability_mutation'&&action.operation==='UnitAddAbility'){
        const raw=fourccFromLiteral(action.arguments&&action.arguments[1]);
        if(raw&&spellByRaw[raw]&&!followedSpells.has(`${raw}@${fname}:${line}`)){
          followedSpells.add(`${raw}@${fname}:${line}`);
          stats.spellLinks+=1;
          walkFn(spellByRaw[raw],pStrict,pApprox,depth+1,pathSet);
        }
      }
    }
  }

  function walkStatements(stmts,fname,pStrict,pApprox,depth,pathSet){
    for(const s of stmts||[]){
      if(s.line!=null)processLineActions(fname,s.line,pStrict,pApprox,pathSet,depth);
      if(s.node==='if'){
        let remainStrict=1,remainApprox=1;
        for(const branch of s.branches||[]){
          if(branch.line!=null)processLineActions(fname,branch.line,pStrict,pApprox,pathSet,depth);
          const q=probOf(branch.condition);
          if(q!=null){
            walkStatements(branch.body,fname,pStrict*remainStrict*q,pApprox*remainApprox*q,depth,pathSet);
            remainStrict*=1-q;remainApprox*=1-q;
          }else if(aliveGuard(branch.condition)){
            stats.aliveGuards+=1;
            walkStatements(branch.body,fname,pStrict*remainStrict,pApprox*remainApprox,depth,pathSet);
          }else{
            stats.unknownConditions+=1;
            // 엄격 하한: 미해석 조건 분기는 0, 근사 상한: 통과.
            walkStatements(branch.body,fname,0,pApprox*remainApprox,depth,pathSet);
          }
        }
        walkStatements(s.elseBody,fname,pStrict*remainStrict,pApprox*remainApprox,depth,pathSet);
      }else if(s.node==='loop'){
        walkStatements(s.body,fname,pStrict,pApprox,depth,pathSet);
      }else if(s.node==='call_statement'&&s.expression&&s.expression.node==='call'){
        const callee=s.expression.function;
        if(fns[callee])walkFn(callee,pStrict,pApprox,depth+1,pathSet);
      }else if((s.node==='local_declaration'||s.node==='assignment')&&s.initializer&&s.initializer.node==='call'&&fns[s.initializer.function]){
        walkFn(s.initializer.function,pStrict,pApprox,depth+1,pathSet);
      }
    }
  }

  function walkFn(fname,pStrict,pApprox,depth,pathSet){
    if(pApprox<1e-6)return;
    if(depth>14){stats.depthLimited+=1;return;}
    if(pathSet.has(fname))return;
    const fn=fns[fname];
    if(!fn)return;
    const nextPath=new Set(pathSet);nextPath.add(fname);
    walkStatements(fn.body,fname,pStrict,pApprox,depth,nextPath);
    // 정적으로 해석된 TriggerExecute 콜백은 같은 확률로 1회 따른다.
    for(const edge of fn.callEdges||[])
      if(edge&&edge.edgeType==='resolved_trigger_dispatch'&&fns[edge.target])walkFn(edge.target,pStrict,pApprox,depth+1,nextPath);
  }

  for(const entry of profile.actionProgram.entryPoints||[])
    if(entry.kind==='attack_started')walkFn(entry.function,1,1,0,new Set());

  const buckets={strict:{affected:0,universal:0},approx:{affected:0,universal:0}};
  const top=[];
  for(const hit of damageHits.values()){
    stats.damageSeen+=1;
    if(hit.amount==null){stats.damageSkippedNonConst+=1;continue;}
    stats.damageEvaluated+=1;
    const key=hit.universal?'universal':'affected';
    buckets.strict[key]+=hit.pStrict*Math.max(0,hit.amount);
    buckets.approx[key]+=hit.pApprox*Math.max(0,hit.amount);
    top.push({p:hit.pApprox,amount:hit.amount,universal:hit.universal,source:hit.source});
  }
  top.sort((a,b)=>b.p*b.amount-a.p*a.amount);
  const round2v=v=>Math.round(v*100)/100;
  const totalDamageRefs=(profile.actionProgram.damageActionRefs||[]).length;
  return{
    perAttack:{
      strict:{affected:round2v(buckets.strict.affected),universal:round2v(buckets.strict.universal)},
      approx:{affected:round2v(buckets.approx.affected),universal:round2v(buckets.approx.universal)}
    },
    topContributors:top.slice(0,3).map(t=>({expected:Math.round(t.p*t.amount),p:Math.round(t.p*1000)/1000,amount:t.amount,universal:t.universal,source:t.source})),
    coverage:Object.assign({},stats,{profileDamageActions:totalDamageRefs})
  };
}

const byProfile={};
for(const profile of doc.profiles)byProfile[profile.profileId]=deriveProfile(profile);

// profileId → TMO 코드 매핑은 다이제스트에서 가져온다.
global.window=global;
const digest=require(DIGEST_PATH);
const byTmo={};
for(const [tmo,entry] of Object.entries(digest.byTmo))if(byProfile[entry.id])byTmo[tmo]=entry.id;

const payload={
  version:'2305C-action-ast-3',
  schema:doc.schemaVersion,
  allowSkillDpsDerivation:true,
  allowKillVerdict:false,
  basis:'auto-attack-triggered skills only · single target · unresolved conditions pass through (approximation) · manual casts excluded',
  byProfile,
  byTmo
};
const js='(function(global){\n'+
"'use strict';\n"+
'// 액션 AST 정적 도출 — 자동공격 유발 스킬 기대 데미지/공격 (v17.2).\n'+
'// tools/derive_skill_dps.js 가 data/ORD_2305C_..._action_ast.json 에서 생성.\n'+
'// 수동 시전·다중 대상 제외 근사이며 킬 판정 근거로 쓰지 않는다.\n'+
'const ORD_UPPER_SKILL_DPS='+JSON.stringify(payload)+';\n'+
'global.ORD_UPPER_SKILL_DPS=ORD_UPPER_SKILL_DPS;\n'+
"if(typeof module==='object'&&module.exports)module.exports=ORD_UPPER_SKILL_DPS;\n"+
'})(typeof window!=="undefined"?window:globalThis);\n';
fs.writeFileSync(OUT_PATH,js);

const rows=Object.entries(byProfile).map(([id,r])=>({id,strict:r.perAttack.strict.affected+r.perAttack.strict.universal,approx:r.perAttack.approx.affected+r.perAttack.approx.universal,eval:r.coverage.damageEvaluated,seen:r.coverage.damageSeen,refs:r.coverage.profileDamageActions,unknown:r.coverage.unknownConditions,alive:r.coverage.aliveGuards,top:r.topContributors}))
  .sort((a,b)=>b.approx-a.approx);
console.log('profile'.padEnd(28),'strict/atk','approx/atk','eval/seen/refs','unknown','alive');
for(const r of rows.slice(0,16))console.log(r.id.padEnd(28),String(Math.round(r.strict)).padStart(10),String(Math.round(r.approx)).padStart(10),`${r.eval}/${r.seen}/${r.refs}`.padStart(13),String(r.unknown).padStart(7),String(r.alive).padStart(5));
for(const id of ['transcend.sanji','immortal.roger','limited.crocodile']){
  const r=rows.find(x=>x.id===id);
  if(r)console.log(`-- ${id} top:`,JSON.stringify(r.top));
}
const covered=rows.filter(r=>r.eval>0).length;
console.log(`profiles with derived skill damage: ${covered}/${rows.length} · output ${OUT_PATH} (${js.length} bytes)`);
