import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const PDF=process.argv[2]||'85b92a3f-Offerte_2600130_v1_0002.pdf';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844}});const errs=[];
p.on('pageerror',e=>errs.push('PAGEERR '+e.message+' @ '+(e.stack||'').split('\n').slice(1,3).join(' ')));
p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 if(/pdf\.worker/.test(u))return r.fulfill({path:'pdf.worker.min.js',contentType:'text/javascript'});
 if(/pdf\.min\.js/.test(u))return r.fulfill({path:'pdf.min.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(500);
await p.locator('#cados-proj-list >> text=Leeg project').first().click();await p.waitForTimeout(800);
const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('#cados-aanmaken-offerte-btn')]);
await fc.setFiles(PDF);
await p.waitForSelector('#of-modal summary input',{timeout:20000});
await p.click('#of-modal #of-ok');
// drivers-venster
await p.waitForTimeout(800);
if(await p.$('.dq-ok')) await p.click('.dq-ok');
await p.waitForSelector('#of-modal #of-zk',{timeout:20000});
await p.click('#of-modal #of-zk');
await p.waitForSelector('#zkw-modal .zkw-stap');
const tag=PDF.slice(0,4);
for(let i=0;i<6;i++){
  await p.waitForTimeout(300);
  await p.screenshot({path:`m_${tag}_${i}.png`,fullPage:false});
  const body=await p.$('#zkw-modal .modal-body');
  await p.evaluate(()=>{const b=document.querySelector('#zkw-modal .modal-body');b.scrollTop=b.scrollHeight});
  await p.screenshot({path:`m_${tag}_${i}b.png`});
  if(i<5) await p.click('#zkw-verder');
}
const info=await p.evaluate(()=>{const O=CaDosApp.state?null:null;return document.querySelector('#zkw-modal .modal-body').innerText.slice(0,1500)});
console.log(info);
const dis=await p.$eval('#zkw-verder',b=>b.disabled);
if(dis){ await p.check('#zkw-negeer'); }
await p.click('#zkw-verder');
await p.waitForTimeout(1500);
await p.screenshot({path:`m_${tag}_klaar.png`});
await p.click('#zkw-sluit');await p.waitForTimeout(600);
await p.screenshot({path:`m_${tag}_tab.png`,fullPage:true});
const r=await p.evaluate(()=>{const row=__DB.project_elektro_dossiers.find(r=>r.project_id==='p2');const d=row.data;
 const k=d.zekeringen.kasten; return {kasten:k.map(x=>({naam:x.naam,maat:x.maat,rijen:x.rijen.length,mods:x.rijen.reduce((t,r)=>t+r.items.length,0)})),
 stopkringen:d.kringen.items.filter(x=>x.zkStop).length, gekoppeld:d.kringen.items.filter(x=>x.zekeringModuleId).length, kringen:d.kringen.items.length,
 laadp:d.laadpalen.items.map(l=>!!l.zekeringModuleId), alarm:d.alarmCentrale.zekeringModuleId?1:0, klemmen:(d.interlex.items||[]).length,
 drivers:d.driverkast.kasten.map(k=>k.items.filter(x=>x.zekeringModuleId).length+'/'+k.items.length)}});
console.log(JSON.stringify(r));
console.log(errs.join('\n')||'no errors');await b.close();
