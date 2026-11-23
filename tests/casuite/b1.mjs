import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1300,height:950}});const errs=[];
p.on('pageerror',e=>errs.push('PAGEERR '+e.message+' @ '+(e.stack||'').split('\n').slice(1,3).join(' ')));
p.on('dialog',d=>{console.log('DIALOG',d.message());d.accept()});
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 if(/pdf\.worker/.test(u))return r.fulfill({path:'pdf.worker.min.js',contentType:'text/javascript'});
 if(/pdf\.min\.js/.test(u))return r.fulfill({path:'pdf.min.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(600);
// 5: losse ingangen weg, kiezer heeft de opties
console.log('P5 lijst zichtbaar:', await p.isVisible('#cados-proj-list'), '| vrije invoer zichtbaar:', await p.isVisible('#cados-vrije-invoer-cta'), '| projecten-knop zichtbaar:', await p.isVisible('#btn-header-projecten'));
console.log('P5 opties:', await p.$$eval('#global-project-select option', os=>os.map(o=>o.textContent).filter(t=>/＋|⚙/.test(t)).join(' | ')));
// + Uit offerte zonder project
const nProj0=await p.evaluate(()=>__DB.projecten.length);
const [fc]=await Promise.all([p.waitForEvent('filechooser'), p.selectOption('#global-project-select','__uit_offerte__')]);
await fc.setFiles('a508e6fe-Offerte_2600124_v7_0006.pdf');


await p.waitForSelector('#of-modal summary input',{timeout:30000});
console.log('P5 uit offerte: nieuw project', await p.evaluate(()=>__DB.projecten.length)-nProj0, '| naam', await p.evaluate(()=>{const r=__DB.projecten[__DB.projecten.length-1];return r.naam+' concept='+r.is_concept}), '| dossier', await p.evaluate(()=>__DB.project_elektro_dossiers.length));
await p.click('#of-modal #of-ok');await p.waitForTimeout(800);
if(await p.$('.dq-ok')) await p.click('.dq-ok');
await p.waitForSelector('#of-modal #of-verder',{timeout:20000});
await p.click('#of-modal #of-verder');await p.click('#of-modal #of-plan-over');await p.waitForSelector('#zkw-modal .zkw-stap');
await p.click('#zkw-verder'); await p.waitForTimeout(500);
console.log('P13 select in stap2:', await p.$$eval('.zkw-s-vd', x=>x.length), '| knop aanpassen:', !!(await p.$('#zkw-naar-kamers')), '| eerste rij:', await p.$eval('.zkw-tabel tbody tr', tr=>tr.children[1].innerText));
// Toepassen
for(let i=0;i<4;i++){ await p.click('#zkw-verder'); await p.waitForTimeout(300); }
if(await p.$eval('#zkw-verder',x=>x.disabled)) await p.check('#zkw-negeer');
await p.click('#zkw-verder'); await p.waitForTimeout(1500); await p.click('#zkw-sluit'); await p.waitForSelector('#kv-modal',{timeout:8000}); console.log('KETTING: koppelvoorstel open'); await p.click('#kv-modal .kv-annul'); await p.waitForTimeout(500);
const kv=()=>p.evaluate(()=>{const d=__DB.project_elektro_dossiers[__DB.project_elektro_dossiers.length-1].data;return d.kamerVerdieping||{}});
await p.waitForTimeout(1500);
const k1=await kv(); console.log('P13 na toepassen in bron:', Object.keys(k1).length, 'kamers, bv', Object.entries(k1).slice(0,3).map(e=>e.join('=')).join(', '));
// Kamers-tab: verdieping wijzigen
await p.evaluate(()=>{ [...document.querySelectorAll('#tabbar button')].find(x=>x.dataset.id==='kamers').click(); });
await p.waitForTimeout(600);
const eerste=await p.$eval('#kamersRows .km-naam', i=>i.value);
await p.selectOption('#kamersRows .km-vd >> nth=0', 'K'); await p.waitForTimeout(1500);
console.log('P13 Kamers-tab:', eerste, '→', (await kv())[eerste]);
// wizard opnieuw: verdieping volgt de bron
await p.evaluate(()=>{ [...document.querySelectorAll('#tabbar button')].find(x=>x.dataset.id==='zekeringen').click(); });
await p.waitForTimeout(600); await (async()=>{ await p.evaluate(()=>[...document.querySelectorAll('#tabbar button')].find(x=>x.dataset.id==='zekeringen').click()); await p.waitForTimeout(600); const z=await p.$('.dv-stap[data-stap="zekeringkast"] .dv-actie'); if(z){ await z.click(); } else { await p.click('#zkHerschik'); await p.click('.zkg-snel'); } })(); await p.waitForSelector('#zkw-modal .zkw-stap'); await p.click('.zkw-stap[data-stap="1"]'); await p.waitForTimeout(400);
console.log('P13 wizard toont:', await p.evaluate((k)=>{const tr=[...document.querySelectorAll('.zkw-tabel tbody tr')].find(t=>t.querySelector('.zkw-s-kamer').value===k);return tr?tr.children[1].innerText:'(kamer niet in stopcontacten)'},eerste));
await p.click('#zkw-annul');
// CaCalc
await p.click('#main-nav-btn-cacalc'); await p.waitForTimeout(1500);
console.log('P5 cacalc knop:', await p.$eval('#cc-btn-new',b=>b.textContent), '| modkiezer zichtbaar:', await p.isVisible('#cacalc-modkiezer'));
console.log(errs.join('\n')||'no errors');await b.close();
