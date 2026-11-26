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
await p.setViewportSize({width:1024,height:768});
await E(`selectTab('uitvoering')`); await p.waitForTimeout(1200);
const r = await p.evaluate(()=>{ const g=document.querySelector('#tabgroups').getBoundingClientRect(), t=document.querySelector('#tabbar').getBoundingClientRect();
 return {zelfdeRij: Math.abs(g.top-t.top)<8, slim: document.querySelector('#dossierverloop').classList.contains('dv-slim'),
  wInKop: !!document.querySelector('.uv-kop .zk-weergaven.in-kop'), zijDicht: !!document.querySelector('.uv-werk.zij-dicht'),
  bannerStatic: getComputedStyle(document.querySelector('#uvBanner')).position==='static', label: document.querySelector('.uv-undo').textContent.includes('Ongedaan')}; });
for(const [k,v] of Object.entries(r)) ok(v, k);
await p.click('.uv-zij'); await p.waitForTimeout(300); ok(!await p.$('.uv-werk.zij-dicht'), 'zijkolom open');
await p.click('.uv-zij');
await p.click('#dossierverloop .dv-alles'); await p.waitForTimeout(300); ok(!(await p.evaluate(()=>document.querySelector('#dossierverloop').classList.contains('dv-slim'))), 'alle stappen');
await p.click('#dossierverloop .dv-alles');
await E(`selectTab('zekeringen')`); await p.waitForTimeout(800); ok(await p.$('.panel-head .zk-weergaven.in-kop'), 'weergaven in paneelkop');
await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(500);
ok(await p.evaluate(()=>getComputedStyle(document.querySelector('#main-nav')).display==='none'), 'geen tweede onderbalk');
await p.click('#appbar-more-btn'); await p.waitForTimeout(300); ok((await p.$$('.menu-apps .menu-app')).length>=3, 'apps in menu');
await b.close(); console.log('klaar');
