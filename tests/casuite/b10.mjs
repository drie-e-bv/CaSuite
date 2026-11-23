import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1400,height:950}});const errs=[];
p.on('pageerror',e=>errs.push('PAGEERR '+e.message+' @ '+(e.stack||'').split('\n').slice(1,3).join(' ')));
p.on('dialog',d=>d.accept());
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 if(/pdf\.worker/.test(u))return r.fulfill({path:'pdf.worker.min.js',contentType:'text/javascript'});
 if(/pdf\.min\.js/.test(u))return r.fulfill({path:'pdf.min.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(600);
const [fc]=await Promise.all([p.waitForEvent('filechooser'), p.selectOption('#global-project-select','__uit_offerte__')]);
await fc.setFiles('a508e6fe-Offerte_2600124_v7_0006.pdf');
await p.waitForSelector('#of-modal summary input',{timeout:30000});
await p.click('#of-modal #of-ok');await p.waitForTimeout(800);
if(await p.$('.dq-ok')) await p.click('.dq-ok');
await p.waitForSelector('#of-modal #of-undo',{timeout:20000});
await p.evaluate(()=>document.getElementById('of-modal').remove()); await p.waitForTimeout(500);
console.log('A2 kopbalk:', await p.$$eval('#topbar > button',bs=>bs.filter(b=>b.offsetParent).map(b=>b.textContent.trim()||'⋯').join(' | ')));
await p.click('.dv-stap[data-stap="plannen"] .dv-ga'); await p.waitForTimeout(800);
console.log('A8 geen plannen → tab:', await p.$eval('#tabbar button.active',b=>b.textContent), '| venster:', !!(await p.$('#plw-modal')));
await p.fill('.plan-nieuwe-naam','Gelijkvloers'); await p.selectOption('.plan-nieuwe-vd','G');
await p.setInputFiles('.plan-add-kaart input[type=file]','deja-plan.pdf');
await p.waitForSelector('.plan-pdf-pagina-kaart[data-pagina="1"]',{timeout:60000}); await p.click('.plan-pdf-pagina-kaart[data-pagina="1"]');
await p.waitForSelector('.plan-kaart',{timeout:30000}); await p.waitForTimeout(2500);
await p.click('.dv-stap[data-stap="plannen"] .dv-ga'); await p.waitForTimeout(1500);
console.log('A8 met plan → venster:', !!(await p.$('#plw-modal')));
await p.evaluate(()=>document.querySelectorAll('#plw-modal').forEach(m=>m.remove()));
// CaDraw: verdieping zonder plan -> Plan opladen
await p.click('#main-nav-btn-cadraw'); await p.waitForTimeout(3000);
const fr=p.frames().find(f=>f!==p.mainFrame());
for(let i=0;i<20;i++){ if(await fr.evaluate(()=>!!(cloud&&cloud.pid)).catch(()=>false)) break; await p.waitForTimeout(1000); }
await fr.evaluate(()=>{ [...document.querySelectorAll('#tabs button, #tabs [data-t]')].find(b=>/plan/i.test(b.textContent)).click(); }).catch(e=>console.log('tab',e.message));
await p.waitForTimeout(500);
await fr.evaluate(()=>{ P.pi = S.plannen.findIndex(pl=>pl.naam==='Kelder'); render(); }).catch(e=>console.log('pi',e.message));
await p.waitForTimeout(500);
const knop=await fr.$('[data-a="naarPlannen"]'); console.log('A7 CaDraw Kelder:', knop ? await knop.textContent() : 'geen knop');
if(knop){ await knop.click(); await p.waitForTimeout(2500); console.log('A7 → app', await p.evaluate(()=>document.body.dataset.tab), '| tab', await p.$eval('#tabbar button.active',b=>b.textContent)); }
// Werfverslag schets-plankiezer
await p.click('[data-tab="verslag"].nav-group-btn'); await p.waitForTimeout(1000);
await p.evaluate(()=>{ const m=document.getElementById('schets-kies-plan-modal'); m.style.display='flex'; });
const ok = await p.evaluate(async()=>{ /* kiezer zelf vullen via de echte render */ return !!document.getElementById('schets-kies-plan-modal'); });
await p.evaluate(()=>{ document.getElementById('schets-kies-plan-modal').style.display='none'; });
await p.evaluate(()=>window.CaSuiteNaarDossierTab('plannen')); await p.waitForTimeout(2000);
console.log('A6 vanuit Werfverslag → app', await p.evaluate(()=>document.body.dataset.tab), '| tab', await p.$eval('#tabbar button.active',b=>b.textContent));
console.log(errs.join('\n')||'no errors');await b.close();
