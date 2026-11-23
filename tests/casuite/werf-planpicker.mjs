// Regressietest (audit 14): Werfverslag › Schets op plan -- kiest enkel plannen uit Dossier › Plannen,
// geen eigen upload meer, knop "Plannen beheren →" opent Dossier › Plannen.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1400,height:950}});const errs=[];let ok=true;
const check=(naam,voorwaarde,info='')=>{ console.log((voorwaarde?'OK  ':'FOUT')+' '+naam+(info?' — '+info:'')); if(!voorwaarde) ok=false; };
p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
p.on('dialog',d=>d.accept());
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 if(/pdf\.worker/.test(u))return r.fulfill({path:'pdf.worker.min.js',contentType:'text/javascript'});
 if(/pdf\.min\.js/.test(u))return r.fulfill({path:'pdf.min.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(2500);
// project + dossier via "＋ Uit offerte", plan opladen in Dossier › Plannen
await p.click('#main-nav-btn-cados');await p.waitForTimeout(600);
const [fc]=await Promise.all([p.waitForEvent('filechooser'), p.selectOption('#global-project-select','__uit_offerte__')]);
await fc.setFiles('a508e6fe-Offerte_2600124_v7_0006.pdf');
await p.waitForSelector('#of-modal summary input',{timeout:30000});
await p.click('#of-modal #of-ok');await p.waitForTimeout(800);
if(await p.$('.dq-ok')) await p.click('.dq-ok');
await p.waitForSelector('#of-modal #of-undo',{timeout:20000});
await p.evaluate(()=>document.getElementById('of-modal').remove()); await p.waitForTimeout(500);
await p.click('.dv-stap[data-stap="plannen"] .dv-ga'); await p.waitForSelector('.plan-add-kaart');
await p.fill('.plan-nieuwe-naam','Gelijkvloers'); await p.selectOption('.plan-nieuwe-vd','G');
await p.setInputFiles('.plan-add-kaart input[type=file]','deja-plan.pdf');
await p.waitForSelector('.plan-pdf-pagina-kaart[data-pagina="1"]',{timeout:60000}); await p.click('.plan-pdf-pagina-kaart[data-pagina="1"]');
await p.waitForSelector('.plan-kaart',{timeout:30000}); await p.waitForTimeout(2000);
// Werfverslag: nieuw verslag, punt toevoegen, Schets op plan
await p.click('[data-tab="verslag"].nav-group-btn'); await p.waitForTimeout(1200);
await p.locator('text=Nieuw gekoppeld verslag').first().click(); await p.waitForTimeout(1500);
// eventueel project bevestigen in een keuzevenster
await p.locator('text=DEJA - BV CONFIBOUW >> visible=true').last().click(); await p.waitForTimeout(1500);
check('verslagformulier open', await p.isVisible('#add-item'));
await p.click('#add-item'); await p.waitForTimeout(600);
const schets = p.locator('button:visible', {hasText:'Schets op plan'}).first();
check('knop "Schets op plan" aanwezig (project gekoppeld)', await schets.count()>0);
await schets.click(); await p.waitForSelector('#schets-kies-plan-modal .schets-plan-kaart, #schets-kies-plan-modal #schets-plannen-beheren',{timeout:15000});
const kaarten = await p.$$eval('#schets-kies-plan-modal .schets-plan-kaart',x=>x.length);
check('plan uit Dossier › Plannen staat in de kiezer', kaarten===1, kaarten+' plan(nen)');
check('geen eigen upload meer', !(await p.$('#schets-kies-plan-modal #schets-nieuw-plan-btn')) && !(await p.$('#schets-kies-plan-modal input[type=file]')));
check('knop "Plannen beheren →"', (await p.textContent('#schets-plannen-beheren')).includes('Plannen beheren'));
await p.click('#schets-plannen-beheren'); await p.waitForTimeout(2500);
check('kiezer gesloten', !(await p.isVisible('#schets-kies-plan-modal')));
const app = await p.evaluate(()=>document.body.dataset.tab), tab = await p.$eval('#tabbar button.active',b=>b.textContent).catch(()=>'');
check('Dossier › Plannen geopend', app==='cados' && tab==='Plannen', app+' / '+tab);
check('geen JS-fouten', !errs.length, errs.join(' | '));
console.log(ok ? 'RESULTAAT: GESLAAGD' : 'RESULTAAT: MISLUKT');
await b.close(); process.exit(ok?0:1);
