import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const PDF='85b92a3f-Offerte_2600130_v1_0002.pdf';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1400,height:950}});const errs=[];
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
let [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('#cados-aanmaken-offerte-btn')]);
await fc.setFiles(PDF);await p.waitForSelector('#of-modal summary input',{timeout:15000});
await p.click('#of-modal #of-ok');await p.waitForSelector('#of-modal #of-undo');await p.click('#of-modal #of-ok');await p.waitForTimeout(800);
await p.evaluate(()=>document.querySelector('#tabbar button[data-id="driverkast"]').click());await p.waitForTimeout(400);
let d=await D(); const v0=d.verlichting.items.length, dr0=d.driverkast.kasten[0].items.length;
// 230V: Modular Lotis volledig
await p.click('#dk230');await p.waitForSelector('#dk230-modal .dk-g');
await p.evaluate(()=>{const det=[...document.querySelectorAll('#dk230-modal .dk-g')].find(x=>/Modular Lotis/.test(x.textContent));const cb=det.querySelector('.dk-g-cb');cb.checked=true;cb.dispatchEvent(new Event('change'));});
await p.screenshot({path:'dk230.png'});
await p.click('#dk230-modal .dk-ok');await p.waitForTimeout(900);await p.click('#dk230-modal .dk-annul');await p.waitForTimeout(500);
d=await D();
console.log('verlichting',v0,'->',d.verlichting.items.length,'| drivers',dr0,'->',d.driverkast.kasten[0].items.length,'| Lotis in drivers',d.driverkast.kasten[0].items.some(x=>x.armaturen.some(a=>/Lotis/.test(a.naam))),
 '| onthouden',await p.evaluate(()=>JSON.stringify((__DB.elektro_cados_instellingen.find(r=>r.sleutel==='offerte_armaturen_230v')||{}).waarde)));
// verdelen: Café + Bar naar nieuwe kast
await p.click('#dkVerdeel');await p.waitForSelector('#dv-modal .dv-g');
await p.evaluate(()=>{['Café','Bar'].forEach(k=>{const det=[...document.querySelectorAll('#dv-modal .dv-g')].find(x=>x.dataset.kamer===k);const cb=det.querySelector('.dv-g-cb');cb.checked=true;cb.dispatchEvent(new Event('change'));});
 const s=document.querySelector('#dv-modal .dv-doel');s.value='nieuw';s.dispatchEvent(new Event('change'));document.querySelector('#dv-modal .dv-n-kamer').value='Kelder café';});
await p.screenshot({path:'dkverdeel.png'});
await p.click('#dv-modal .dv-ok');await p.waitForTimeout(600);await p.click('#dv-modal .dv-annul');await p.waitForTimeout(800);
d=await D();
console.log('kasten',d.driverkast.kasten.map(k=>(k.kamer||'-')+':'+k.items.length).join(' | '));
// los: armatuur-editor knop
await p.locator('#dkKastenwrap .rackitem.cat-armatuur, #dkKastenwrap [data-id]').first();
// 2e import: Lotis meteen 230V
[fc]=await Promise.all([p.waitForEvent('filechooser'),p.evaluate(()=>document.getElementById('btnOfferte').click())]);
await fc.setFiles(PDF);await p.waitForSelector('#of-modal summary input',{timeout:15000});
console.log('2e import verlichting-regels met Lotis:',await p.evaluate(()=>[...document.querySelectorAll('#of-modal details')].find(x=>/Verlichting 230V/.test(x.textContent)).textContent.includes('Lotis')));
await p.click('#of-modal #of-annul');
const ids=new Set();JSON.stringify(d,(k,v)=>{if(k==='id')ids.add(v);return v});
const kapot=[];JSON.stringify(d,(k,v)=>{if((/Id$/.test(k)||k==='targetId')&&typeof v==='string'&&v&&!ids.has(v))kapot.push(k);return v});
console.log('kapotte verwijzingen',kapot.length);
console.log(errs.join('\n')||'no errors');await b.close();
