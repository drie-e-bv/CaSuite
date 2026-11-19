import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const PDF='85b92a3f-Offerte_2600130_v1_0002.pdf';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];
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
await p.click('#cados-aanmaken-btn');await p.waitForTimeout(1200);
await p.evaluate(()=>document.querySelector('#tabbar button[data-id="driverkast"]').click());await p.waitForTimeout(400);
await p.fill('#dkMax','30');await p.press('#dkMax','Tab');await p.waitForTimeout(800);
// handmatig 1 kast met 35 lege drivers -> geen melding (vrij aanpassen)
await p.evaluate(()=>{for(let i=0;i<35;i++)document.querySelector('.driverAdd').click();});await p.waitForTimeout(500);
let d=await D();console.log('handmatig: kast1',d.driverkast.kasten[0].items.length,'| melding max?',await p.evaluate(()=>/maximum is/.test(document.querySelector('#panel-driverkast').innerText)));
// import
let [fc]=await Promise.all([p.waitForEvent('filechooser'),p.evaluate(()=>document.getElementById('btnOfferte').click())]);
await fc.setFiles(PDF);await p.waitForSelector('#of-modal summary input',{timeout:15000});
await p.click('#of-modal #of-ok');await p.waitForSelector('#of-modal #of-undo');
console.log('resultaat:',await p.evaluate(()=>[...document.querySelectorAll('#of-modal li')].map(l=>l.textContent).filter(t=>/driver/.test(t)).join(' / ')));
await p.click('#of-modal #of-ok');await p.waitForTimeout(800);
d=await D();console.log('kasten:',d.driverkast.kasten.map(k=>k.items.length).join(','));
// handmatig: 2 Café-drivers naar kast 2 -> oranje + melding
await p.evaluate(()=>document.querySelector('#tabbar button[data-id="driverkast"]').click());await p.waitForTimeout(400);
await p.click('#dkVerdeel');await p.waitForSelector('#dv-modal .dv-g');
await p.evaluate(()=>{const det=[...document.querySelectorAll('#dv-modal .dv-g')].find(x=>x.dataset.kamer==='Café');det.open=true;const cbs=det.querySelectorAll('.dv-d-cb');[0,1].forEach(i=>{cbs[i].checked=true;cbs[i].dispatchEvent(new Event('change'))});const s=document.querySelector('#dv-modal .dv-doel');s.value='1';});
await p.click('#dv-modal .dv-ok');await p.waitForTimeout(500);await p.click('#dv-modal .dv-annul');await p.waitForTimeout(800);
console.log('melding kamers:',await p.evaluate(()=>{const c=[...document.querySelectorAll('#panel-driverkast .conflict-head')].map(x=>x.textContent);return c.join(' / ')}));
console.log('oranje drivers:',await p.evaluate(()=>document.querySelectorAll('#dkKastenwrap .rackitem.kamer-elders').length));
await p.evaluate(()=>{const k=[...document.querySelectorAll('#dkKastenwrap .kast-card')][2];k.scrollIntoView();window.scrollBy(0,-80)});await p.waitForTimeout(300);
await p.screenshot({path:'kl1.png'});
// melding klik -> verdeelvenster op Café
await p.evaluate(()=>window.scrollTo(0,0));
await p.locator('#panel-driverkast .conflict-item:has-text("Café")').first().click();await p.waitForTimeout(400);
console.log('venster gefilterd op:',await p.evaluate(()=>document.querySelector('#dv-modal .dv-zoek').value));
await p.screenshot({path:'kl2.png'});
await p.evaluate(()=>document.querySelector('#dv-modal .dv-annul').click());await p.waitForTimeout(500);
for(const t of ['driverplan','driverkast']){await p.evaluate(t=>document.querySelector(`#tabbar button[data-id="${t}"]`).click(),t);await p.waitForTimeout(1200);}
console.log(errs.join('\n')||'no errors');await b.close();
