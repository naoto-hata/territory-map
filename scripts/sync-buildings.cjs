'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {buildUpdate}=require('./building-data.cjs');
const ORIGIN='https://berry0.net', ROOT='/42374/field/';
function maySend(method,url,loginPath,loginOpen){
  const u=new URL(url);
  if(u.protocol!=='https:')return false;
  if(method==='GET'||method==='HEAD'){
    if(u.origin!==ORIGIN)return ['https://unpkg.com','https://cdnjs.cloudflare.com'].includes(u.origin);
    if(!u.pathname.startsWith(ROOT))return false;
    if(/(?:delete|remove|insert|update|register|save|logout)/i.test(u.pathname+u.search))return false;
    return true;
  }
  // Only a verified, exact login endpoint can be opened for one authentication POST.
  return method==='POST'&&loginOpen&&u.origin===ORIGIN&&loginPath&&
    loginPath.startsWith(ROOT)&&u.pathname===loginPath&&!u.search;
}
async function main(){
  const username=process.env.BERRY_USERNAME,password=process.env.BERRY_PASSWORD;
  const loginPath=process.env.BERRY_LOGIN_POST_PATH||'';
  if(!username||!password||!loginPath)throw new Error('Secure login configuration is not complete');
  if(!loginPath.startsWith(ROOT)||/[?#]/.test(loginPath)||/(records|delete|update|insert|save)/i.test(loginPath))throw new Error('Login endpoint has not been verified');
  const html=fs.readFileSync('index.html','utf8');
  const {chromium}=require('playwright');
  const browser=await chromium.launch();
  try{
    const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
    let loginOpen=false,loginPosts=0,blocked=false;
    await context.route('**/*',async route=>{
      const request=route.request(),method=request.method();
      if(!maySend(method,request.url(),loginPath,loginOpen)){
        // Analytics is intentionally blocked without treating it as a site write.
        const u=new URL(request.url());
        if(u.origin===ORIGIN&&method!=='GET'&&method!=='HEAD')blocked=true;
        return route.abort();
      }
      if(method==='POST'){
        if(loginPosts++>0){blocked=true;return route.abort();}
        loginOpen=false;
      }
      return route.continue();
    });
    const page=await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(ORIGIN+ROOT+'index.html',{waitUntil:'domcontentloaded'});
    await page.locator('input[placeholder="Name"]').waitFor({state:'visible'});
    await page.locator('input[placeholder="Name"]').fill(username);
    await page.locator('input[placeholder="Password"]').fill(password);
    loginOpen=true;
    await page.locator('ons-button.button-margin').click();
    await page.getByText('オートロック [全体]',{exact:true}).waitFor({state:'visible'});
    if(blocked)throw new Error('Unexpected write request was blocked');
    loginOpen=false;
    const lists={};
    for(const [kind,label] of [['autolock','オートロック [全体]'],['oneRoom','ワンルーム [全体]']]){
      if(kind==='oneRoom'){
        await page.goto(ORIGIN+ROOT+'index.html',{waitUntil:'domcontentloaded'});
        await page.getByText(label,{exact:true}).waitFor({state:'visible'});
      }
      await page.getByText(label,{exact:true}).click();
      const cards=page.locator('ons-page#flat .card__title');
      await cards.first().waitFor({state:'visible'});
      // Require settled counts across three observations. No building or room is clicked.
      let previous=-1,stable=0;
      for(let attempt=0;attempt<20;attempt++){
        const count=await cards.count();
        stable=count===previous&&count>0?stable+1:0;previous=count;
        if(stable>=2)break;
        await page.waitForTimeout(500);
      }
      if(stable<2)throw new Error('Building list did not finish loading');
      lists[kind]=await cards.allTextContents();
    }
    if(blocked)throw new Error('Unexpected write request was blocked');
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/-/g,'/');
    const result=buildUpdate(html,lists,date);
    const tmp=path.resolve('index.html.building-sync-tmp');
    fs.writeFileSync(tmp,result.html,{mode:0o600});
    fs.renameSync(tmp,'index.html');
    console.log('Building list checked. Added: '+result.added);
  }finally{await browser.close();}
}
if(require.main===module) main().catch(()=>{console.error('Building sync stopped safely. Current list was preserved. Check secure configuration and source format.');process.exitCode=1;});
module.exports={maySend};
