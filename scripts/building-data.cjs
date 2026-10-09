'use strict';
const vm = require('node:vm');
const specs = [['autolock','autolockBuildingsByArea'],['oneRoom','oneRoomBuildingsByArea']];
function readData(html, name) {
  const re = new RegExp('const '+name+'=(\\{[^\\n]*\\});');
  const matches = [...html.matchAll(new RegExp(re.source,'g'))];
  if(matches.length!==1) throw new Error('Building data marker changed');
  return {data:JSON.parse(matches[0][1]),match:matches[0][0]};
}
function parseTitles(titles) {
  if(!Array.isArray(titles)||!titles.length||titles.length>5000) throw new Error('Incomplete building list');
  const rows=[];
  for(const title of titles){
    const m=String(title).trim().match(/^(.*?)\s*\[#(\d+)-([^\]]*)\]$/);
    if(!m) throw new Error('Building title format changed');
    const area=Number(m[2]);
    if(area===0) continue;
    if(!Number.isInteger(area)||area<1||area>272) throw new Error('Invalid area');
    const name=m[1].trim(),section=m[3].trim();
    if(!name||name.length>200||section.length>30||/[\x00-\x1f<>]/.test(name+section)) throw new Error('Invalid building name');
    rows.push({area,name,section});
  }
  return rows;
}
function buildUpdate(html, lists, date) {
  if(!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) throw new Error('Invalid date');
  let updated=html,added=0;
  for(const [kind,name] of specs){
    const current=readData(html,name), rows=parseTitles(lists[kind]);
    const total=Object.values(current.data).reduce((n,a)=>n+a.length,0);
    if(rows.length<Math.floor(total*0.85)||rows.length>total+100) throw new Error('Unexpected building count; no update');
    const merged=JSON.parse(JSON.stringify(current.data));
    const known=new Set(Object.entries(merged).flatMap(([a,bs])=>bs.map(b=>JSON.stringify([Number(a),b.name,b.section]))));
    for(const row of rows){
      const id=JSON.stringify([row.area,row.name,row.section]);
      if(known.has(id))continue;
      const key=String(row.area).padStart(3,'0');
      (merged[key]??=[]).push({name:row.name,section:row.section});
      known.add(id);added++;
    }
    const json=JSON.stringify(merged).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    updated=updated.replace(current.match,'const '+name+'='+json+';');
  }
  updated=updated.replace(/名称一覧の確認日：\d{4}\/\d{2}\/\d{2}/g,'名称一覧の確認日：'+date);
  updated=updated.replace('自動同期ではありません。','週1回の読み取りで新規建物を追加します。既存の名称は自動削除しません。');
  for(const match of updated.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if(match[1].trim()) new vm.Script(match[1]);
  }
  return {html:updated,added};
}
module.exports={readData,parseTitles,buildUpdate};
