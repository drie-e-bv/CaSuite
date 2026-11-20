import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const PDF=process.argv[2]||'85b92a3f-Offerte_2600130_v1_0002.pdf';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1300,height:950}});const errs=[];
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
  await p.screenshot({path:`zk_${tag}_${i}.png`,fullPage:false});
  const body=await p.$('#zkw-modal .modal-body');
  await p.evaluate(()=>{const b=document.querySelector('#zkw-modal .modal-body');b.scrollTop=b.scrollHeight});
  await p.screenshot({path:`zk_${tag}_${i}b.png`});
  if(i<5) await p.click('#zkw-verder');
}
const info=await p.evaluate(()=>{const O=CaDosApp.state?null:null;return document.querySelector('#zkw-modal .modal-body').innerText.slice(0,1500)});
console.log(info);
const dis=await p.$eval('#zkw-verder',b=>b.disabled);
if(dis){ await p.check('#zkw-negeer'); }
await p.click('#zkw-verder');
await p.waitForTimeout(1500);
await p.screenshot({path:`zk_${tag}_klaar.png`});
await p.click('#zkw-sluit');await p.waitForTimeout(600);
await p.screenshot({path:`zk_${tag}_tab.png`,fullPage:true});

const kl=()=>p.evaluate(()=>{const d=__DB.project_elektro_dossiers.find(r=>r.project_id==='p2').data;return d.interlex.items.length});
await p.waitForTimeout(1500);
const voor=await kl();
const naamA=await p.evaluate(()=>{const c=[...document.querySelectorAll('.ov-kabelklemmen')].find(x=>x.checked);return c.closest('tr').querySelector('.ov-naam').value});console.log('RIJ',naamA);
const rij=p.locator('tr', {has: p.locator(`input.ov-naam[value="${naamA}"]`)}).first();
await rij.locator('.ov-kabelklemmen').uncheck(); await p.waitForTimeout(1500);
const na1=await kl();
const rij2=p.locator('tr', {has: p.locator(`input.ov-naam[value="${naamA}"]`)}).first();
await rij2.locator('.ov-kabelklemmen').check(); await p.waitForTimeout(1500);
const na2=await kl();
const rij3=p.locator('tr', {has: p.locator(`input.ov-naam[value="${naamA}"]`)}).first();
await rij3.locator('.ov-kabeltype').fill('7G2,5'); await rij3.locator('.ov-kabeltype').press('Tab'); await p.waitForTimeout(1500);
const na3=await kl();
console.log('KLEMMEN voor',voor,'uit',na1,'aan',na2,'5G2,5',na3);
console.log('GESCH', await p.evaluate(()=>{const O=CaDosApp.zekeringkast.nieuwOntwerp({stop:[{kamer:'Living',muur:3,vloer:0,media:0,geschakeld:2},{kamer:'Eetplaats',muur:2,vloer:0,media:0,geschakeld:3},{kamer:'Bureau',muur:2,vloer:0,media:0,geschakeld:2},{kamer:'Terras',muur:1,vloer:0,media:0,geschakeld:1}],voedingen:[],tebepalen:[],aansluitingA:'63A',reservePct:0});Object.keys(O.verdiepingen).forEach(k=>O.verdiepingen[k]='G');const R=CaDosApp.zekeringkast.verdeel(O);return R.kringen.filter(k=>k.soort==='geschakeld').map(k=>k.naam).join(' | ')}));

await p.evaluate(()=>window.scrollTo(0,0)); await p.screenshot({path:'z8_zek.png'});
await p.click('#addModuleGlobal'); await p.waitForTimeout(800); await p.screenshot({path:'z8_add.png'});
await p.evaluate(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Uitvoeringsplan'); b&&b.click(); }); await p.waitForTimeout(2500);
await p.screenshot({path:'z8_uv.png'});
await p.evaluate(()=>window.scrollTo(0,400)); await p.waitForTimeout(300);
console.log('SCROLL', await p.evaluate(async()=>{const y0=scrollY; const w=document.querySelector('.uv-canvas-wrap'); w.scrollTop=150; const t0=w.scrollTop; [...document.querySelectorAll('#tabbar button')].find(x=>x.dataset.id==='uitvoering').click(); await new Promise(r=>setTimeout(r,600)); return [y0, scrollY, t0, document.querySelector('.uv-canvas-wrap').scrollTop].join(' ');}));
const cd=await p.$('.uv-naar-cadraw'); console.log('CADRAW-KNOP', !!cd);
if(cd){ await cd.click(); await p.waitForTimeout(1500); console.log('ACTIEF', await p.evaluate(()=>document.querySelector('#tab-cadraw').classList.contains('active')||getComputedStyle(document.querySelector('#tab-cadraw')).display)); }
const r=await p.evaluate(()=>{const row=__DB.project_elektro_dossiers.find(r=>r.project_id==='p2');const d=row.data;
 const k=d.zekeringen.kasten; return {kasten:k.map(x=>({naam:x.naam,maat:x.maat,rijen:x.rijen.length,mods:x.rijen.reduce((t,r)=>t+r.items.length,0)})),
 stopkringen:d.kringen.items.filter(x=>x.zkStop).length, gekoppeld:d.kringen.items.filter(x=>x.zekeringModuleId).length, kringen:d.kringen.items.length,
 laadp:d.laadpalen.items.map(l=>!!l.zekeringModuleId), alarm:d.alarmCentrale.zekeringModuleId?1:0, klemmen:(d.interlex.items||[]).length,
 drivers:d.driverkast.kasten.map(k=>k.items.filter(x=>x.zekeringModuleId).length+'/'+k.items.length)}});
console.log(JSON.stringify(r));
console.log(errs.join('\n')||'no errors');await b.close();
