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
await E(`selectTab('kamers')`); await p.waitForTimeout(600);
// nieuwe hoofdruimte
await p.click('#kamerAddBtn'); await p.waitForTimeout(200);
const lege = (await p.$$('#kamersRows .km-naam')).length; const inp = (await p.$$('#kamersRows .km-naam'))[lege-1];
await inp.fill('Master'); await inp.dispatchEvent('change'); await p.waitForTimeout(300);
ok(await E(`state.kamers.includes('Master')`), 'hoofdruimte Master');
// subkamers
for(const n of ['badkamer','dressing','toilet']){
  await p.evaluate(()=>{ const r=[...document.querySelectorAll('#kamersRows .km-rij')].find(r=>r.querySelector('.km-naam').value==='Master'); r.querySelector('.km-subadd').click(); });
  await p.waitForTimeout(200); await p.keyboard.type(n); await p.keyboard.press('Tab'); await p.waitForTimeout(200);
}
ok(await E(`kamerSubs('Master').join('|')==='Master badkamer|Master dressing|Master toilet'`), 'subkamers: '+await E(`kamerSubs('Master').join('|')`));
ok((await p.$$('#kamersRows .km-sub')).length>=3, 'subkamers ingesprongen getoond');
// nieuwe verdieping meteen in de lijst
await p.click('#verdiepingAddBtn'); await p.waitForTimeout(200);
const codes = await p.$$('#verdiepingenRows .vd-code'); const c = codes[codes.length-1];
await c.fill('V3'); await c.dispatchEvent('change'); await p.waitForTimeout(300);
ok(await p.evaluate(()=>{ const r=[...document.querySelectorAll('#kamersRows .km-rij')].find(r=>r.querySelector('.km-naam').value==='Master'); return [...r.querySelectorAll('.km-vd option')].some(o=>o.value==='V3'); }), 'nieuwe verdieping V3 meteen kiesbaar');
await p.evaluate(()=>{ const r=[...document.querySelectorAll('#kamersRows .km-rij')].find(r=>r.querySelector('.km-naam').value==='Master'); const s=r.querySelector('.km-vd'); s.value='V3'; s.dispatchEvent(new Event('change')); });
await p.waitForTimeout(300);
ok(await E(`kamerVerdieping('Master')==='V3' && kamerVerdieping('Master badkamer')==='V3'`), 'subkamer erft verdieping V3');
await c.fill('V3b'); await p.waitForTimeout(100);
ok(await E(`kamerVerdieping('Master')==='V3b'`), 'codewijziging volgt mee');
await c.fill('V3'); await c.dispatchEvent('change'); await p.waitForTimeout(200);
// driverkast aan subkamer
await E(`(()=>{ const k=state.driverkast.kasten[0]; k.kamer='Master badkamer'; save(); })()`);
await E(`selectTab('driverkast')`); await p.waitForTimeout(700);
ok(await p.evaluate(()=>[...document.querySelectorAll('datalist option')].some(o=>o.value==='Master badkamer' && /Master ›/.test(o.label))), 'subkamer in keuzelijsten met hoofdruimte');
// opslaan + opnieuw openen: zelfde weg als laden (JSON -> migrate)
ok(await E(`(()=>{ const kopie = JSON.parse(JSON.stringify(state)); const m = (typeof migrate==="function" ? migrate(kopie) : kopie) || kopie; const oud = state; state = m;
  const r = kamerHoofd('Master dressing')==='Master' && kamerVerdieping('Master toilet')==='V3' && state.driverkast.kasten[0].kamer==='Master badkamer' && state.verdiepingen.some(v=>v.code==='V3'); state = oud; return r; })()`), 'na opslaan/openen alles bewaard');
for(const t of ['zekeringen','driverkast','verlichting','kringen','knoppen','export','kamers']){ const fout = await E(`(()=>{ try{ selectTab('${t}'); return ''; }catch(e){ return e.message; } })()`); ok(!fout, 'tab '+t+' '+fout); }
await E(`selectTab('kamers')`); await p.waitForTimeout(400); await p.screenshot({path:'/tmp/b27.png', clip:{x:0,y:180,width:1400,height:560}});
await b.close(); console.log('klaar');
