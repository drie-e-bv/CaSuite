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
await p.waitForSelector('#of-modal #of-verder',{timeout:20000});
await p.click('#of-modal #of-verder'); await p.click('#of-modal #of-plan-over');
await p.waitForSelector('#zkw-modal .zkw-stap');
for(let i=0;i<5;i++){ await p.click('#zkw-verder'); await p.waitForTimeout(300); }
if(await p.$eval('#zkw-verder',x=>x.disabled)) await p.check('#zkw-negeer');
await p.click('#zkw-verder'); await p.waitForTimeout(1500); await p.click('#zkw-sluit');
await p.waitForSelector('#kv-modal'); await p.click('#kv-modal .kv-annul'); await p.waitForTimeout(800);
// plan G opladen
await p.click('#tabgroups button[data-grp="Project"]'); await p.waitForTimeout(300);
await p.click('#tabbar button[data-id="plannen"]'); await p.waitForSelector('.plan-add-kaart');
await p.fill('.plan-nieuwe-naam','Gelijkvloers'); await p.selectOption('.plan-nieuwe-vd','G');
await p.setInputFiles('.plan-add-kaart input[type=file]','deja-plan.pdf');
await p.waitForSelector('.plan-pdf-pagina-kaart[data-pagina="1"]',{timeout:60000}); await p.click('.plan-pdf-pagina-kaart[data-pagina="1"]');
await p.waitForSelector('.plan-kaart',{timeout:30000}); await p.waitForTimeout(2500);
// CaCalc
await p.click('#main-nav-btn-cacalc'); await p.waitForTimeout(2500);
console.log('A5 Excel vóór overnemen zichtbaar:', await p.isVisible('#cc-excel-panel'));
console.log('P8 tabs:', await p.$$eval('#cacalc-app nav.tabs button',bs=>bs.filter(b=>b.offsetParent).map(b=>b.textContent.trim()).join(' | ')));
console.log('P8 banner:', await p.$eval('#cc-cados-sync',x=>x.innerText.replace(/\s+/g,' ').slice(0,120)));
console.log('DBG', await p.evaluate(async()=>{ const r = window.dbLeesCadosDossier ? await window.dbLeesCadosDossier(String(document.getElementById('global-project-select').value)) : 'geen fn'; return typeof r==='string'?r: (r? 'rij, kasten='+((r.data&&r.data.zekeringen&&r.data.zekeringen.kasten)||[]).length : 'null'); }));
await p.click('#cc-sync-nu'); await p.waitForTimeout(1500);
await p.screenshot({path:'/tmp/b7-cc.png'});console.log('DBGE', await p.evaluate(()=>[...new Set([...document.querySelectorAll('#cc-board-detail [data-eg-f]')].map(x=>x.dataset.egF))].join(',')+' sel='+document.querySelector('#cc-board-detail h2, #cc-board-detail h3')?.textContent));
console.log('P8 na overnemen:', await p.evaluate(()=>{const ths=document.querySelectorAll('#cc-board-detail [data-eg-f="naam"]');return ths.length+' eindgroepen in bord, naam-veld disabled='+(ths[0]&&ths[0].disabled)+', lengte-veld disabled='+(document.querySelector('[data-eg-f="lengte"]')||{}).disabled}));
console.log('P8 + automaat-knop zichtbaar:', await p.isVisible('#cc-add-eindgroep-btn').catch(()=>false), '| banner:', await p.$eval('#cc-cados-sync',x=>x.innerText.replace(/\s+/g,' ').slice(0,80)));
await p.waitForTimeout(1500);
console.log('A5 Excel na overnemen zichtbaar:', await p.isVisible('#cc-excel-panel'));
console.log('P8 bewaard:', await p.evaluate(()=>{const r=(__DB.project_cacalc_data||[]).slice(-1)[0];return r?r.data.boards.map(b=>b.naam+':'+b.eindgroepen.length+' eg/'+b.differentielen.length+' diff, kast='+!!b.cadosKastId).join('; '):'niets'}));
// CaDraw
await p.click('#main-nav-btn-cadraw'); await p.waitForTimeout(3000);
const fr=p.frames().find(f=>f!==p.mainFrame());
for(let i=0;i<20;i++){ if(await fr.evaluate(()=>!!(cloud&&cloud.pid)).catch(()=>false)) break; await p.waitForTimeout(1000); }
console.log('DBGC', await fr.evaluate(()=>({pid:cloud.pid, plannen:cloud.plannen.length, meta:Object.keys(cloud.planMeta||{}).length, vds:(cloud.vds||[]).map(v=>v.code+'='+v.label).join(','), S:S.plannen.map(p=>p.naam).join(',')})).catch(e=>e.message));
await p.waitForTimeout(3000);
console.log('P12 CaDraw plan auto:', await fr.evaluate(()=>S.plannen.map(pl=>pl.naam+':'+(pl.bg?'bg':'-')+(pl.bgPlanId?'#':'')).join(', ')).catch(e=>'ERR '+e.message));
await fr.evaluate(()=>{ [...document.querySelectorAll('#tabs [data-t], #tabs button')].find(b=>/Afdrukken|Dossier|PDF/i.test(b.textContent))?.click(); }).catch(()=>{}); await p.waitForTimeout(500);
console.log('A10 Dossier samenstellen:', await fr.evaluate(()=>{const c=[...document.querySelectorAll('.card')].find(x=>/Dossier samenstellen/.test(x.textContent));return c?[...c.querySelectorAll('label')].map(l=>l.textContent.trim()).filter(Boolean).join(', '):'(kaart niet gevonden)'}));
await fr.evaluate(()=>{ [...document.querySelectorAll('#tabs [data-t], #tabs button')].find(b=>/Materiaal/.test(b.textContent)).click(); }).catch(e=>console.log('tabklik',e.message)); await p.waitForTimeout(500);
console.log('P16 CaDraw materiaal:', await fr.evaluate(()=>document.querySelector('#v').innerText.replace(/\s+/g,' ').slice(0,160)));
await fr.click('[data-a="naarCaMat"]'); await p.waitForTimeout(4000);
console.log('P16 na Naar CaMat: tab', await p.evaluate(()=>document.body.dataset.tab), '| sub project zichtbaar', await p.isVisible('[data-mat-paneel="project"]'), '| rijen', await p.$$eval('#mat-project-zone #materialenBody tr',x=>x.length));
console.log('P16 eerste rij:', await p.$eval('#mat-project-zone .mat-omschrijving',x=>x.value).catch(()=>'?'));
// CaDos materiaal-tab
await p.click('#main-nav-btn-cados'); await p.waitForTimeout(800);
await p.click('#tabgroups button[data-grp="Project"]'); await p.waitForTimeout(300);
await p.click('#tabbar button[data-id="materialen"]'); await p.waitForTimeout(500);
console.log('P16 CaDos Materiaal:', await p.$eval('#cados-app #panel-materialen .card-body',x=>x.innerText.replace(/\s+/g,' ')), '| tabel weg', !(await p.$('#cados-app #panel-materialen #materialenBody')));
console.log(errs.join('\n')||'no errors');await b.close();
