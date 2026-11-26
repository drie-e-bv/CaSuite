// 26/11/2026 release-chat: 230V-lichtpunten (aantal, verwijderen, klemmen, automaat). Draaien op een testkopie van index.html met
// 'window.__cdEval = (c)=> eval(c);' vlak voor 'function vlAantal(item){', geserveerd op poort 8790, met stub3.js in de werkmap.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1400,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
const E=(c)=> p.evaluate((c)=> window.__cdEval(c), c);
const ok=(c,m)=>console.log((c?'OK  ':'FOUT')+' '+m);
await p.goto('http://localhost:8790/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(600);
await E(`(()=>{ state.modules.verlichting=true; state.verlichting.items=[]; for(let i=0;i<5;i++){ const it=newVerlichtingItem(); it.naam='Armatuur te bepalen'; it.kamer=i<3?'Garage':'Berging'; state.verlichting.items.push(it);} save(); selectTab('verlichting'); return 1; })()`);
await p.waitForTimeout(800);
const codes=()=>E(`(()=>{ const c=computeVerlichtingCodes(); return state.verlichting.items.map(i=>c[i.id]+':'+i.kamer+':'+vlAantal(i)).join(' '); })()`);
console.log('start', await codes());
ok((await p.$$('.vl-tabel .ov-aantal')).length===5, 'kolom Aantal');
await p.evaluate(()=>{ const i=document.querySelector('.vl-tabel tbody tr:nth-child(1) .ov-aantal'); i.value='3'; i.dispatchEvent(new Event('change')); }); await p.waitForTimeout(300);
ok(await E(`vlAantal(state.verlichting.items[0])===3`), 'aantal 3 bewaard');
ok(await p.evaluate(()=>document.querySelector('#vlRack').textContent.includes('3 armaturen op 1 kabel')), 'blokje toont 3 armaturen');
// behoud: rij 2 weg -> nummers 100,102,103,104
await p.evaluate(()=>document.querySelector('.vl-tabel tbody tr:nth-child(2) .vl-weg-behoud').click()); await p.waitForTimeout(400);
console.log('na behoud', await codes());
ok((await codes()).startsWith('100:Garage:3 102:Garage'), 'met behoud: 101 weg, rest houdt nummer');
// gewoon: eerste Berging weg -> volgende schuift op
const n1 = await E(`state.verlichting.items.length`);
await p.evaluate(()=>document.querySelector('.vl-tabel tbody tr:nth-child(3) .vl-weg').click()); await p.waitForTimeout(400);
console.log('na gewoon', await codes());
ok((await E(`state.verlichting.items.length`))===n1-1, 'gewoon verwijderd met één klik');
ok(!(await p.evaluate(()=>document.body.textContent.includes('Zeker?'))), 'geen Zeker?');
ok(errs.length===0, 'geen JS-fouten '+errs.join(' | '));
await b.close();
