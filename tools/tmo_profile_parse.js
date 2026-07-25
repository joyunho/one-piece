#!/usr/bin/env node
'use strict';
// TMO.GG 플레이어 프로필 저장본(HTML) → 구조화 JSON.
// 사용법: node tools/tmo_profile_parse.js <저장한_프로필.html> [출력.json]
// 저장본은 브라우저 Ctrl+S("웹페이지, HTML만" 또는 "전체") 결과를 그대로 받는다.
// 게임 기록(사용 유닛 포함)과 유닛 통계 탭이 모두 서버 렌더링되어 본문에 존재해야 한다.
const fs=require('fs');

const TIERS=['불멸','영원','초월','전설','히든','특별함','세라핌','변화된','왜곡됨','기타','희귀함','흔함','안흔함','해적선'];
const TIER_RE=new RegExp(`^(${TIERS.join('|')})(?:\\s*\\[(마딜|물딜|스턴)\\])?$`);
const DIFFS=new Set(['악몽','신','지옥']);

function decodeEntities(s){
  return s.replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16)))
    .replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d)))
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ');
}

function visibleLines(raw){
  const noScript=raw.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi,'');
  const text=decodeEntities(noScript.replace(/<[^>]+>/g,'\n'));
  return text.split('\n').map(l=>l.trim()).filter(Boolean);
}

function parseProfile(raw){
  const lines=visibleLines(raw);
  const out={player:null,tag:null,summary:{},records:[],unitStats:[]};
  // 제목: "닉네임 - 랜덤 디펜스 랭킹 | TMO.GG"
  const title=lines.find(l=>l.includes('랜덤 디펜스 랭킹'));
  if(title&&title.includes(' - '))out.player=title.split(' - ')[0].trim();
  const tag=lines.find(l=>/^#[A-Z0-9]+$/.test(l));
  if(tag)out.tag=tag;

  // 게임 기록: 난이도 / N개 / +M / … / 사용 유닛 / (이름 / ×q)*
  for(let i=0;i<lines.length;i++){
    if(DIFFS.has(lines[i])&&i+2<lines.length&&/^\d+개$/.test(lines[i+1])){
      const rec={diff:lines[i],unitCount:parseInt(lines[i+1]),clearUnits:/^\+\d+$/.test(lines[i+2])?parseInt(lines[i+2]):null,date:null,units:[]};
      let j=i+3;
      while(j<lines.length&&lines[j]!=='사용 유닛'){
        if(rec.date===null&&lines[j]!=='플레이 날짜'&&(/전$/.test(lines[j])||/\d{4}\.\d{2}\.\d{2}/.test(lines[j])))rec.date=lines[j];
        if(DIFFS.has(lines[j])&&j+1<lines.length&&/^\d+개$/.test(lines[j+1]))break;
        j++;
      }
      if(j<lines.length&&lines[j]==='사용 유닛'){
        j++;
        while(j+1<lines.length&&/^×\d+$/.test(lines[j+1])){
          rec.units.push({name:lines[j],qty:parseInt(lines[j+1].slice(1))});
          j+=2;
        }
      }
      if(rec.units.length)out.records.push(rec);
      i=j-1;
    }
  }

  // 유닛 통계: 이름 / 등급[타입] / N회 / 평균 유닛카운트 / M개 / 최소 유닛카운트 / K개
  for(let i=0;i+6<lines.length;i++){
    const tm=lines[i+1].match(TIER_RE);
    if(tm&&/^[\d,]+회$/.test(lines[i+2])&&lines[i+3]==='평균 유닛카운트'){
      out.unitStats.push({
        name:lines[i],tier:tm[1],type:tm[2]||null,
        uses:parseInt(lines[i+2].replace(/,/g,'')),
        avgCount:/^[\d,]+개$/.test(lines[i+4])?parseInt(lines[i+4].replace(/,/g,'')):null,
        minCount:/^[\d,]+개$/.test(lines[i+6])?parseInt(lines[i+6].replace(/,/g,'')):null
      });
      i+=6;
    }
  }
  return out;
}

if(require.main===module){
  const src=process.argv[2];
  if(!src){console.error('사용법: node tools/tmo_profile_parse.js <프로필.html> [출력.json]');process.exit(1);}
  const parsed=parseProfile(fs.readFileSync(src,'utf8'));
  const dest=process.argv[3];
  const json=JSON.stringify(parsed,null,1);
  if(dest){fs.writeFileSync(dest,json);console.error(`기록 ${parsed.records.length}판 · 유닛 통계 ${parsed.unitStats.length}종 → ${dest}`);}
  else console.log(json);
}
module.exports={parseProfile,visibleLines};
