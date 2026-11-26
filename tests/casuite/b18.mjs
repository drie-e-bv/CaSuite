import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1400,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 if(/pdf\.worker/.test(u))return r.fulfill({path:'pdf.worker.min.js',contentType:'text/javascript'});
 if(/pdf\.min\.js/.test(u))return r.fulfill({path:'pdf.min.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
const E=(code,arg)=> p.evaluate(([c,a])=> window.__cdEval('(function(A){ return ('+c+'); })')(a), [code, arg===undefined?null:arg]);
const ok=(c,m)=>console.log((c?'OK  ':'FOUT')+' '+m);
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
await p.waitForSelector('#kv-modal'); await p.evaluate(()=>document.querySelector('#kv-modal .kv-annul')?.click()); await p.waitForTimeout(800);
// 1. volgorde stappenbalk + geen ⇄/↻
const st = await p.evaluate(()=> [...document.querySelectorAll('.dv-stap, [data-stap]')].map(x=>x.dataset.stap||x.textContent.trim().slice(0,20)));
// 1. afdrukpagina blijft niet staan
await E("selectTab('zktekening')"); await p.waitForTimeout(1500);
await p.click('.uv-afdruk'); await p.waitForSelector('#uv-afdruk-modal'); await p.click('.uva-ok'); await p.waitForTimeout(1500);
ok(await p.evaluate(()=> !document.body.classList.contains('print-patchkast') && document.getElementById('printExport').children.length===0), 'na afdrukken: afdrukpagina weg');
await p.evaluate(()=>{ document.body.classList.add('print-patchkast'); document.getElementById('printExport').innerHTML='<div>oud</div>'; });
await E("selectTab('motoren')"); await p.waitForTimeout(800);
ok(await p.evaluate(()=> !document.body.classList.contains('print-patchkast') && !document.getElementById('printExport').innerHTML), 'tab wissel ruimt achtergebleven afdruk op');
// 2. rij hierboven
await E("selectTab('zekeringen')"); await p.waitForTimeout(1000);
const n0 = await E("huidigeZekeringKast().rijen.length"); const id0 = await E("huidigeZekeringKast().rijen[0].id");
await p.click('.rij-invoegen-boven >> nth=0'); await p.waitForTimeout(700);
ok(await E("huidigeZekeringKast().rijen.length")===n0+1 && await E("huidigeZekeringKast().rijen[1].id")===id0, '+ Rij hierboven boven rij 1');
// 3. editor
await p.click('.rail-grid .modchip >> nth=1').catch(()=>{}); await p.waitForTimeout(600);
const ed = await p.evaluate(()=>{ const b=document.querySelector('.mod-editor'); if(!b) return null; return {headClose: !!b.querySelector('.me-head .me-close'), footClose: !!b.querySelector('.me-acties .me-close'), prim: !!b.querySelector('.me-acties .primary')}; });
ok(ed && !ed.headClose && ed.footClose && !ed.prim, 'editor: Sluiten onderaan, zelfde stijl '+JSON.stringify(ed));
await p.screenshot({path:'/tmp/b18-editor.png'});
// 4. wording
ok(!(await p.evaluate(()=> /uit bibliotheek/i.test(document.getElementById('cados-app').innerText))), 'geen "uit bibliotheek" meer');
// 5. kringen/230V
await E("selectTab('kringen')"); await p.waitForTimeout(800);
ok(!(await p.$('#exportKringen')) && !(await p.$('#krKoppelen')), 'Kringen: geen Printcentrum/Koppelen-knop');
await E("selectTab('verlichting')"); await p.waitForTimeout(800);
ok(!(await p.$('#exportVerlichting')), '230V: geen Printcentrum-knop');
ok(await p.evaluate(()=>{ const b=document.querySelector('.rb-naardk'); return !b || b.getBoundingClientRect().height < 36; }), '↪ DK op één regel');
await E("koppelOpen('voorstel')"); await p.waitForTimeout(800);
ok(await p.evaluate(()=> [...document.querySelectorAll('#kpSlot button')].filter(b=> b.offsetParent && /Sluiten|Klaar/.test(b.textContent)).length===0), 'Koppelen: geen Sluiten/Klaar');
console.log('errors', errs.length ? errs.join(' | ') : 'geen');
await b.close();
