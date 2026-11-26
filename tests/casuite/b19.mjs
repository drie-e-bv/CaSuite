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
// H. inline tabel
await E("selectTab('zekeringen')"); await p.waitForTimeout(1200);
const rid = await p.$eval('.ov-tabel tr[data-id] .ov-klem', b=> b.closest('tr').dataset.id);
await p.click(`.ov-tabel tr[data-id="${rid}"] .ov-naam`); await p.keyboard.press('Control+A'); await p.keyboard.type('TESTNAAM'); await p.press(`.ov-tabel tr[data-id="${rid}"] .ov-naam`, 'Enter'); await p.waitForTimeout(800);
ok(await E("huidigeZekeringKast().rijen.flatMap(r=>r.items).find(m=>m.id===A).naam", rid)==='TESTNAAM', 'H: benoeming inline + Enter');
const fokus = await p.evaluate(()=> document.activeElement && document.activeElement.classList.contains('ov-naam') && document.activeElement.closest('tr').dataset.id);
ok(fokus && fokus!==rid, 'H: Enter → volgende rij zelfde kolom');
await p.selectOption(`.ov-tabel tr[data-id="${rid}"] .ov-a`, '25A'); await p.waitForTimeout(800);
ok(await E("huidigeZekeringKast().rijen.flatMap(r=>r.items).find(m=>m.id===A).A", rid)==='25A', 'H: ampère inline');
const klem0 = await E("huidigeZekeringKast().rijen.flatMap(r=>r.items).find(m=>m.id===A).kabelOpKlemmen", rid);
await p.click(`.ov-tabel tr[data-id="${rid}"] .ov-klem`); await p.waitForTimeout(800);
const m1 = await E("(m=>({k:m.kabelOpKlemmen,t:m.kabelType}))(huidigeZekeringKast().rijen.flatMap(r=>r.items).find(m=>m.id===A))", rid);
ok(m1.k===!klem0 && (!m1.k || m1.t), 'H: op klemmen wisselt '+JSON.stringify(m1));
if(m1.k){ await p.fill(`.ov-tabel tr[data-id="${rid}"] .ov-kabel`, '5G2,5'); await p.press(`.ov-tabel tr[data-id="${rid}"] .ov-kabel`, 'Tab'); await p.waitForTimeout(800);
  ok(await E("huidigeZekeringKast().rijen.flatMap(r=>r.items).find(m=>m.id===A).kabelType", rid)==='5G2,5', 'H: kabeltype inline'); }
// J10 klemlabels volgen naam
const naamOk = await E(`(()=>{ const m = huidigeZekeringKast().rijen.flatMap(r=>r.items).find(m=>m.id===A); m.kabelOpKlemmen = true; m.kabelType = m.kabelType || '3G2,5'; zkKlemmenOpnieuw(m); m.naam = 'NIEUWENAAM'; autoZekeringKlemmen(); return state.interlex.items.filter(k=> k.bronId && String(k.bronId).startsWith(m.id)).every(k=> k.info==='NIEUWENAAM' || /NIEUWENAAM/.test(k.info||'')); })()`, rid);
ok(naamOk, 'J10: rijgklemlabels volgen de automaatnaam');
// I. kamtype
const kamRes = await E(`(()=>{ const k = huidigeZekeringKast(); k.kamgeleiders = []; uvAutoOmzet(k); return k.kamgeleiders.map(x=> x.type + '@' + k.rijen.findIndex(r=> r.id===x.rijId)); })()`);
console.log('kammen', JSON.stringify(kamRes));
ok(kamRes.some(t=> t.startsWith('3F+N/1P+N')), 'I: L1N-L2N-L3N-kam aangemaakt');
ok(await E("Object.keys(KAM_TYPES).includes('3F+N/1P+N')"), 'I: kamtype in keuzelijst');
const fasen = await E(`(()=>{ const k = huidigeZekeringKast(); const kam = k.kamgeleiders.find(x=> x.type==='3F+N/1P+N'); const ms = k.rijen.flatMap(r=>r.items).filter(m=> kam.moduleIds.includes(m.id) && m.categorie==='Automaat'); return ms.slice(0,4).map(m=>m.fase).join(','); })()`);
ok(fasen.startsWith('L1,L2,L3'), 'I: fasen volgen kampositie '+fasen);
// E. rail
const rail = await E(`(()=>{ const dk = dkFysiekeKasten()[0]; const p = dkPlan(dk); const n = dkDrivers(dk).length; const a = dkRailBreedte(dk, p); p.eindplaatPerDriver = true; const b = dkRailBreedte(dk, p); delete p.eindplaatPerDriver; return {n, a, b}; })()`);
ok(rail.b - rail.a > rail.n*0.5 && rail.b - rail.a < rail.n*1.5, 'E: geen tussenruimte tussen drivers (eindplaat-optie +1 mm/driver) '+JSON.stringify(rail));
ok(await E("DK_KLEM_MM")===5, 'E: klem 5,0 mm');
// J4 motoren
const mot = await E(`(()=>{ state.motoren = state.motoren || {items:[]}; const m = newMotorItem(); return m.kabel; })()`);
ok(mot==='5G1.5', 'J4: motorkabel standaard 5G1.5');
// J9 label
await E("selectTab('zekeringen')"); await p.waitForTimeout(800);
await p.click('#addModuleGlobal'); await p.waitForTimeout(600);
ok(/Tik nu op een leeg vakje/.test(await p.evaluate(()=> document.querySelector('.staging-label').innerText)), 'J9: duidelijke plaatsingsinstructie');
console.log('errors', errs.length ? errs.join(' | ') : 'geen');
await b.close();
