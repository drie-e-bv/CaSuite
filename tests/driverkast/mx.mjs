import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const PDF='85b92a3f-Offerte_2600130_v1_0002.pdf';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];
p.on('pageerror',e=>errs.push('PAGEERR '+e.message+' @ '+(e.stack||'').split('\n').slice(1,3).join(' ')));
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 if(/pdf\.worker/.test(u))return r.fulfill({path:'pdf.worker.min.js',contentType:'text/javascript'});
 if(/pdf\.min\.js/.test(u))return r.fulfill({path:'pdf.min.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
const D=()=>p.evaluate(()=>__DB.project_elektro_dossiers.find(r=>r.project_id==='p2').data);
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(400);
await p.locator('#cados-proj-list >> text=Leeg project').first().click();await p.waitForTimeout(700);
// 1) zonder maximum importeren -> 1 kast, dan max 30 instellen -> melding -> verdelen
let [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('#cados-aanmaken-offerte-btn')]);
await fc.setFiles(PDF);await p.waitForSelector('#of-modal summary input',{timeout:15000});
await p.click('#of-modal #of-ok');await p.waitForSelector('#of-modal #of-undo');await p.click('#of-modal #of-ok');await p.waitForTimeout(800);
await p.evaluate(()=>document.querySelector('#tabbar button[data-id="driverkast"]').click());await p.waitForTimeout(400);
await p.fill('#dkMax','30');await p.press('#dkMax','Tab');await p.waitForTimeout(800);
console.log('instelling DB',await p.evaluate(()=>JSON.stringify((__DB.elektro_cados_instellingen.find(r=>r.sleutel==='driverkast_max_drivers')||{}).waarde)));
console.log('melding:',await p.evaluate(()=>{const x=[...document.querySelectorAll('#panel-driverkast .conflict-head')].map(e=>e.textContent);return x.join(' / ')}));
await p.screenshot({path:'mx1.png'});
await p.locator('#panel-driverkast .conflict-item:has-text("Automatisch verdelen")').click();await p.waitForTimeout(1000);
let d=await D();
console.log('na verdelen:',d.driverkast.kasten.map(k=>k.items.length+' ['+k.kamer+']').join(' | '));
// controleer: kamer niet over 2 kasten (tenzij > 30)
const kamerKasten={};d.driverkast.kasten.forEach((k,i)=>k.items.forEach(dr=>{const km=(dr.armaturen[0]||{}).ruimte||'';(kamerKasten[km]=kamerKasten[km]||new Set()).add(i)}));
console.log('kamers over meerdere kasten:',Object.entries(kamerKasten).filter(([k,s])=>s.size>1).map(([k])=>k).join(', ')||'geen');
await p.click('#dkmax-modal .dkm-ok');
// 2) tweede import met max actief -> meteen verdeeld
[fc]=await Promise.all([p.waitForEvent('filechooser'),p.evaluate(()=>document.getElementById('btnOfferte').click())]);
await fc.setFiles(PDF);await p.waitForSelector('#of-modal summary input',{timeout:15000});
await p.click('#of-modal #of-ok');await p.waitForSelector('#of-modal #of-undo');
console.log('resultaat 2e import:',await p.evaluate(()=>[...document.querySelectorAll('#of-modal li')].map(l=>l.textContent).filter(t=>/driver/.test(t)).join(' / ')));
await p.click('#of-modal #of-ok');await p.waitForTimeout(800);
d=await D();console.log('kasten na 2e import:',d.driverkast.kasten.map(k=>k.items.length).join(','),'max',Math.max(...d.driverkast.kasten.map(k=>k.items.length)));
await p.evaluate(()=>document.querySelector('#tabbar button[data-id="driverplan"]').click());await p.waitForTimeout(1500);
console.log(errs.join('\n')||'no errors');await b.close();
