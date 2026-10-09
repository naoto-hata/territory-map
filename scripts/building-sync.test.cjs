'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {readData,buildUpdate}=require('./building-data.cjs');
const {maySend}=require('./sync-buildings.cjs');
const html=fs.readFileSync('index.html','utf8');
function titles(name){return Object.entries(readData(html,name).data).flatMap(([a,bs])=>bs.map(b=>`${b.name} [#${Number(a)}-${b.section}]`));}
const lists={autolock:titles('autolockBuildingsByArea'),oneRoom:titles('oneRoomBuildingsByArea')};
test('New building is added; existing names and map code are preserved',()=>{
  const result=buildUpdate(html,{...lists,autolock:[...lists.autolock,'追加確認建物 [#22-B]']},'2026/10/10');
  assert.equal(result.added,1);
  assert.equal(readData(result.html,'autolockBuildingsByArea').data['022'].at(-1).name,'追加確認建物');
  const strip=s=>s.replace(/const (autolockBuildingsByArea|oneRoomBuildingsByArea)=\{[^\n]*\};/g,'DATA').replace(/名称一覧の確認日：\d{4}\/\d{2}\/\d{2}/g,'DATE').replace('自動同期ではありません。','SYNC').replace('週1回の読み取りで新規建物を追加します。既存の名称は自動削除しません。','SYNC');
  assert.equal(strip(result.html),strip(html));
  assert.equal(buildUpdate(result.html,{...lists,autolock:[...lists.autolock,'追加確認建物 [#22-B]']},'2026/10/10').added,0);
});
test('Missing buildings are not deleted',()=>{
  const result=buildUpdate(html,{...lists,autolock:lists.autolock.slice(1)},'2026/10/10');
  assert.deepEqual(readData(result.html,'autolockBuildingsByArea').data,readData(html,'autolockBuildingsByArea').data);
});
test('Empty, malformed, excessive, partial lists and HTML injection abort',()=>{
  for(const bad of [[],['broken'],lists.autolock.slice(0,10),[...lists.autolock,'<script>x</script> [#1-]'],[...lists.autolock,'invalid [#273-]'],Array(6000).fill(lists.autolock[0])]){
    assert.throws(()=>buildUpdate(html,{...lists,autolock:bad},'2026/10/10'));
  }
});
test('All mutation methods denied except a single verified authentication route',()=>{
  const origin='https://berry0.net/42374/field/';
  for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(maySend(method,origin+'records/buildings','',false),false);
  assert.equal(maySend('POST',origin+'login-endpoint','/42374/field/login-endpoint',true),true);
  assert.equal(maySend('POST',origin+'login-endpoint','/42374/field/login-endpoint',false),false);
  assert.equal(maySend('POST','https://example.com/42374/field/login-endpoint','/42374/field/login-endpoint',true),false);
  assert.equal(maySend('GET',origin+'delete?id=1','',false),false);
  assert.equal(maySend('GET',origin+'index.html','',false),true);
  assert.equal(maySend('GET','http://berry0.net/42374/field/index.html','',false),false);
});
