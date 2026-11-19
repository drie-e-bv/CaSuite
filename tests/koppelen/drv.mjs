import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1300,height:950}});const errs=[];
p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(400);
await p.locator('#cados-proj-list >> text=Leeg project').first().click();await p.waitForTimeout(600);
await p.click('#cados-aanmaken-btn');await p.waitForTimeout(1200);
// oude situatie nabootsen: Jules 2x op DALI-driver met foute naam
await p.evaluate(()=>{const d=__DB.project_elektro_dossiers.find(r=>r.project_id==='p2');});
const r=await p.evaluate(async()=>{
  const st=window.__cadosTest;return 1});
await p.evaluate(()=>document.querySelector('#tabbar button[data-id="driverkast"]').click());await p.waitForTimeout(300);
// via JSON-import een dossier zetten met een foute driver
await p.evaluate(()=>{const data={driverkast:{kasten:[{id:'k1',sturing:'DALI',kamer:'',verdieping:'',items:[{id:'d1',categorie:'Driver',naam:'Meanwel PWM-60-12DA',type:'',armaturen:[{id:'a1',naam:'Jullight Jules',ruimte:'Wasplaats',aantal:2}],manueelNummer:'',kringId:'',zekeringModuleId:'',leeg:false}]}]}};
 const f=new File([JSON.stringify(data)],'x.json',{type:'application/json'});const dt=new DataTransfer();dt.items.add(f);const inp=document.getElementById('fileImport');inp.files=dt.files;inp.dispatchEvent(new Event('change'));});
await p.waitForTimeout(800);
await p.evaluate(()=>document.querySelector('#tabbar button[data-id="driverkast"]').click());await p.waitForTimeout(500);
console.log('banner:',await p.evaluate(()=>(document.querySelector('#dkHerkies')||{}).innerText||'GEEN'));
await p.screenshot({path:'drv1.png'});
await p.click('#dkHerkies .conflict-item');await p.waitForTimeout(800);
console.log('chip na herkiezen:',await p.evaluate(()=>document.querySelector('#dkKastenwrap').innerText.slice(0,160).replace(/\n/g,' | ')));
await p.screenshot({path:'drv2.png'});
console.log(errs.join('\n')||'no errors');await b.close();
