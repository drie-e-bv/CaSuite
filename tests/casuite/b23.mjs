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
await p.setViewportSize({width:1400,height:900});
await E(`(()=>{ dkOverzicht=false; const dk=dkFysiekeKasten().find(k=> dkDrivers(k).length>3); dkHuidigId=dk.id; selectTab('driverkast'); })()`);
await E(`zkWeergave && 0`).catch(()=>{});
await E(`(()=>{ const dk=dkFysiekeKasten().find(k=>k.id===dkHuidigId); const p=dkPlan(dk); const d=dkDrivers(dk).slice(-1)[0]; window.__d=d.id; dkVerplaats(p,d.id,'onder'); save(); })()`);
const r1 = await E(`(()=>{ const dk=dkFysiekeKasten().find(k=>k.id===dkHuidigId); const p=dkPlanKast(dk); const md=p._layout.mods.find(m=>m.m.id===window.__d); const andere=p._layout.mods.filter(m=>m.m._dk.soort==='driver' && m.m.id!==window.__d); const maxY=Math.max(...andere.map(m=>m.y+m.h)); const v=p._layout.kokers.filter(k=>k.soort==='v'); return {onder: md.m._dk.onderaan, y: md.y, maxY, kokerEind: Math.max(...v.map(k=>k.y1)), x: md.x, w: md.w}; })()`);
ok(r1.onder && r1.y > r1.maxY, 'driver onder de kolommen');
ok(r1.kokerEind <= r1.y, 'kokers stoppen boven de driver');
await E(`(()=>{ const dk=dkFysiekeKasten().find(k=>k.id===dkHuidigId); const p=dkPlan(dk); p.roteer={[window.__d]:true}; save(); })()`);
const r2 = await E(`(()=>{ const dk=dkFysiekeKasten().find(k=>k.id===dkHuidigId); const p=dkPlanKast(dk); const md=p._layout.mods.find(m=>m.m.id===window.__d); return {w: md.w, h: md.h, zijden:[...new Set(md.m.klemmenEigen.map(k=>k.zijde))]}; })()`);
ok(r2.h > r2.w, 'geroteerd: staand ('+r2.w.toFixed(0)+'x'+r2.h.toFixed(0)+') zijden '+r2.zijden);
await E(`selectTab('driverkast')`); await p.waitForTimeout(300);
// Plan-weergave openen
await p.evaluate(()=>{ const b=[...document.querySelectorAll('.zk-weergaven button')].find(x=>/Plan/.test(x.textContent)); b && b.click(); }); await p.waitForTimeout(1500);
await p.screenshot({path:'/tmp/b23-onder.png'});
const n = (await p.$$('.uv-kastvink input')).length; ok(n>=2, 'vinkjes in kastbalk ('+n+')');
for(let i=0;i<3;i++){ await p.evaluate((i)=>{ const v=document.querySelectorAll('.uv-kastvink input')[i]; if(v && !v.checked){ v.checked=true; v.dispatchEvent(new Event('change')); } }, i); await p.waitForTimeout(900); }
ok(await E(`dkOverzicht===true`), 'meerdere kasten naast elkaar');
const delen = await E(`dkAlleKast()._delen.length`); ok(delen>=2 && delen<=3, 'alleen aangevinkte kasten ('+delen+')');
await p.screenshot({path:'/tmp/b23-naast.png'});
await b.close(); console.log('klaar');
