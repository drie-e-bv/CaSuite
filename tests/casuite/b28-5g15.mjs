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
await E(`(state.modules.verlichting=true, state.modules.driverkast=true, save())`);
await E(`(()=>{ const it=newVerlichtingItem(); it.naam='Wandlamp terras'; it.kamer='Living'; it.id='lp5g'; state.verlichting.items.push(it); save(); })()`);
await E(`selectTab('verlichting')`); await p.waitForTimeout(700);
const kastId = await E(`state.driverkast.kasten[0].id`);
const voorDrv = await E(`dkDrivers(state.driverkast.kasten[0]).length`); await E(`(dkFysiekeKasten().filter(v=>v._bron===state.driverkast.kasten[0]||v.id===state.driverkast.kasten[0].id).forEach(v=>dkOmzet(dkPlanKast(v))), save())`);
await p.selectOption('.vl-tabel tr[data-id="lp5g"] .ov-5g', kastId); await p.waitForTimeout(600);
// 1-2: config A, 5 aders
const a = await E(`(()=>{ const r=dk5gItemVan(state.verlichting.items.find(v=>v.id==='lp5g')); const kl=dkDriverKlemmen(r.d,'DALI','L'); return {cfg:r.d.vijfG, aders: kl.map(k=>k.kleur+':'+k.functie).join(','), n: dkDrivers(r.kast).length}; })()`);
ok(a.cfg==='A', '1 nieuwe 5G1,5 in configuratie A');
ok(a.aders==='Bruin:L,Blauw:N,Grijs:DA+,Zwart:DA-,Geel/Groen:PE', '2 vijf aders: '+a.aders);
const draadA = await E(`(()=>{ const r=dk5gItemVan(state.verlichting.items.find(v=>v.id==='lp5g')); const fk=dkFysiekeKasten().find(v=>v.items.includes(r.d)); const p=dkPlanKast(fk); const w=p.bedrading.filter(w=>w.auto && (w.a.m===r.d.id||w.b.m===r.d.id||w.a.m==='dkk_'+r.d.id||w.b.m==='dkk_'+r.d.id)); return {n:w.length, rk: w.filter(x=>x.a.m==='dkk_'+r.d.id||x.b.m==='dkk_'+r.d.id).length, kl: w.map(x=> (x.a.m===r.d.id?x.a.k:x.b.k)).sort().join(',')}; })()`);
ok(draadA.n===4 && draadA.rk===0 && draadA.kl==='DA1,DA2,L,N', 'A: L/N/DA+/DA- op verdeelblokken, rijgklemmen leeg ('+JSON.stringify(draadA)+')');
// 3-6: naar B
await p.selectOption('.vl-tabel tr[data-id="lp5g"] .ov-5gcfg', 'B'); await p.waitForTimeout(600);
const b5 = await E(`(()=>{ const r=dk5gItemVan(state.verlichting.items.find(v=>v.id==='lp5g')); const fk=dkFysiekeKasten().find(v=>v.items.includes(r.d)); const p=dkPlanKast(fk); const w=p.bedrading.filter(w=>w.auto); const rk=w.filter(x=>x.a.m==='dkk_'+r.d.id||x.b.m==='dkk_'+r.d.id); const kl=dkDriverKlemmen(r.d,'DALI','L').map(k=>k.id).join(','); const rail=p._layout.mods.filter(m=>m.m.id==='dkk_'+r.d.id).length; return {cfg:r.d.vijfG, rk: rk.length, kl, rail, naam:r.d.naam}; })()`);
ok(b5.cfg==='B' && b5.kl.includes('O+') , '3/6 configuratie B: gewone driver ('+b5.naam+')');
ok(b5.rk===2 && b5.rail===1, '4/7 + en − op dezelfde 2 bestaande rijgklemmen, geen extra');
ok(await E(`dkDrivers(state.driverkast.kasten[0]).length===${voorDrv}+1`), 'geen dubbele items');
// 8: terug naar A
await p.selectOption('.vl-tabel tr[data-id="lp5g"] .ov-5gcfg', 'A'); await p.waitForTimeout(600);
ok(await E(`(()=>{ const r=dk5gItemVan(state.verlichting.items.find(v=>v.id==='lp5g')); return r.d.vijfG==='A' && r.d.naam===DK_5G_NAAM; })()`), '8 terug naar A');
// 9: nummering 90 graden in de tekening
await E(`selectTab('driverplan')`); await p.waitForTimeout(1200);
ok(await p.evaluate(()=>{ const t=[...document.querySelectorAll('#uvCanvas text.dk-blok-lab')].filter(t=>/^D\d/.test(t.textContent)); return t.length>0 && t.every(x=>/rotate\(-90\)/.test(x.getAttribute('transform')||'')); }), '9/10 rijgklemnummers 90° gedraaid (zelfde SVG in afdruk)');
// standaard terug
await E(`selectTab('verlichting')`); await p.waitForTimeout(500);
await p.selectOption('.vl-tabel tr[data-id="lp5g"] .ov-5g', ''); await p.waitForTimeout(500);
ok(await E(`!dk5gItemVan(state.verlichting.items.find(v=>v.id==='lp5g')) && dkDrivers(state.driverkast.kasten[0]).length===${voorDrv}`), '11 terug standaard: item weg, rest ongewijzigd');
await b.close(); console.log('klaar');
