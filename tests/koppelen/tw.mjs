import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const PDF='85b92a3f-Offerte_2600130_v1_0002.pdf';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1300,height:950}});const errs=[];
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
// vertaalregels: kring per lichtpunt + eigen regel miro -> overslaan
await p.click('#of-regels');await p.waitForSelector('.of-r-kring');await p.screenshot({path:'regels.png'});
const kr1=await p.evaluate(()=>0);
await p.selectOption('.of-r-kring','lichtpunt');await p.selectOption('.of-r-motor','Screen');
await p.click('.of-nh').catch(()=>console.log('geen nh-knop'));
await p.click('#of-bewaar');await p.waitForSelector('#of-modal #of-ok');await p.waitForTimeout(300);
console.log('na regels: kringen',await p.evaluate(()=>[...document.querySelectorAll('#of-modal details')].find(d=>/Kringen/.test(d.innerText)).querySelector('.of-n').textContent),
 '| niet herkend nog:',await p.evaluate(()=>!!/niet kent/.test(document.querySelector('#of-modal').innerText)));
console.log('regels in DB:',await p.evaluate(()=>JSON.stringify((__DB.elektro_cados_instellingen.find(r=>r.sleutel==='offerte_vertaalregels')||{}).waarde)));
await p.click('#of-modal #of-ok');await p.locator('#dkvraag-modal .dq-ok').click({timeout:4000}).catch(()=>{});await p.waitForSelector('#of-modal #of-undo');
console.log('resultaat:',await p.evaluate(()=>document.querySelector('#of-modal .modal-body').innerText.replace(/\n+/g,' | ')));
let d=await D();
const knopGek=d.knoppen.items.filter(k=>k.gangen.some(g=>g.kringId)).length;
const uit=d.zekeringen.kasten[0].rijen.flatMap(r=>r.items).filter(m=>m.uitgangen);
console.log('knoppen gekoppeld',knopGek,'/',d.knoppen.items.length,'| uitgangen bezet',uit.flatMap(m=>m.uitgangen).filter(u=>u.targetId).length,'/',uit.flatMap(m=>m.uitgangen).length,
 '| muziek kanalen',d.patchkast.kasten.flatMap(k=>k.items).flatMap(i=>i.eenheden||[]).filter(e=>e.zoneId).length,'| motoren soort',d.motoren.items[0].soort);
await p.click('#of-toewijs');await p.waitForSelector('#az-modal tr[data-id]');await p.waitForTimeout(300);
const nRij=await p.evaluate(()=>document.querySelectorAll('#az-modal tr[data-id]').length);
// kamer Keuken aanvinken -> nieuwe automaat
await p.evaluate(()=>{const cb=[...document.querySelectorAll('#az-modal .az-kamer-cb')].find(c=>c.dataset.kamer==='Keuken');cb.checked=true;cb.dispatchEvent(new Event('change'));});
await p.screenshot({path:'toewijs.png'});
await p.click('#az-modal .az-nieuw');await p.waitForTimeout(400);
const nRij2=await p.evaluate(()=>document.querySelectorAll('#az-modal tr[data-id]').length);
console.log('toewijslijst rijen',nRij,'-> na keuken',nRij2);
await p.click('#az-modal .az-sluit');await p.waitForTimeout(1200);
d=await D();
const keukenAut=d.zekeringen.kasten[0].rijen.flatMap(r=>r.items).find(m=>m.naam==='Keuken'&&m.categorie==='Automaat');
console.log('automaat Keuken',!!keukenAut,'| kringen keuken met automaat',d.kringen.items.filter(k=>k.kamer==='Keuken'&&k.zekeringModuleId===keukenAut?.id).length);
// kringen samenvoegen
await p.evaluate(()=>document.querySelector('#tabbar button[data-id="kringen"]').click());await p.waitForTimeout(400);
const voorK=(await D()).kringen.items.length;
await p.click('#krSamenvoegen');await p.waitForSelector('#ks-modal .ks-cb');
await p.evaluate(()=>{const cbs=[...document.querySelectorAll('#ks-modal .ks-cb')].slice(0,3);cbs.forEach(c=>{c.checked=true;c.dispatchEvent(new Event('change'))});});
await p.click('#ks-modal .ks-ok');await p.waitForTimeout(1200);
d=await D();
console.log('kringen',voorK,'->',d.kringen.items.length);
const ids=new Set();JSON.stringify(d,(k,v)=>{if(k==='id')ids.add(v);return v});
const kapot=[];JSON.stringify(d,(k,v)=>{if((/Id$/.test(k)||k==='targetId')&&typeof v==='string'&&v&&!ids.has(v))kapot.push(k);return v});
console.log('kapotte verwijzingen',kapot.length,kapot.slice(0,4));
// koppelvoorstel-knop + zekering-tab
await p.evaluate(()=>document.querySelector('#tabbar button[data-id="zekeringen"]').click());await p.waitForTimeout(400);
await p.click('#zkKoppelvoorstel');await p.waitForSelector('#kv-modal');console.log('koppelvoorstel:',await p.evaluate(()=>document.querySelector('#kv-modal .modal-body').innerText.slice(0,120).replace(/\n/g,' | ')));
await p.evaluate(()=>document.querySelector('#kv-modal').remove());
for(const t of ['kringen','verlichting','zekeringen','driverkast','knoppen','motoren','verwarming']){await p.evaluate(t=>{const b=document.querySelector(`#tabbar button[data-id="${t}"]`);if(b)b.click();},t);await p.waitForTimeout(250);}
console.log(errs.join('\n')||'no errors');await b.close();
