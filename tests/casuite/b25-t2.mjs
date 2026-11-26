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
await E(`(()=>{ state.modules.verlichting=true; state.verlichting.items=[]; for(let i=0;i<3;i++){ const it=newVerlichtingItem(); it.naam='Kastverlichting'; it.kamer='Garage'; it.typeKabel='XVB 5G1,5'; state.verlichting.items.push(it);} save(); selectTab('verlichting'); return 1; })()`);
await p.waitForTimeout(800);
ok((await p.$$('.vl-tabel .ov-automaat')).length===3, 'kolom Automaat');
const nAut = await p.evaluate(()=>document.querySelectorAll('.vl-tabel tbody tr:nth-child(1) .ov-automaat option').length);
console.log('automaat-opties:', nAut);
const kl0 = await E(`state.interlex.items.length`);
await p.evaluate(()=>{ const s=document.querySelector('.vl-tabel tbody tr:nth-child(1) .ov-aansl'); s.value='klemmen'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(300);
const kl1 = await E(`state.interlex.items.filter(k=>k.autoVl).map(k=>k.onder.watwaar).join(' | ')`);
console.log('klemmen:', kl1, await E(`state.interlex.items.filter(k=>k.autoVl).map(k=>k.boven.watwaar).join(' | ')`), 'rijgklemmenmodule:', await E(`state.zekeringen.kasten.flatMap(k=>k.rijen.flatMap(r=>r.items)).filter(m=>m.categorie==='Rijgklemmenmodule').map(m=>(m.rijgklemKlemIds||[]).length).join(',')`));
ok((await E(`state.interlex.items.filter(k=>k.autoVl).reduce((n,k)=>n+(k.onder.aderNr?1:0)+(k.boven.aderNr?1:0),0)`))===4, '5G1,5 -> 4 aders (PE naar aardingsbar) op klemmen (type '+(await E(`state.interlex.type`))+')');
// kabel wijzigen -> klemmen volgen
await p.evaluate(()=>{ const s=document.querySelector('.vl-tabel tbody tr:nth-child(1) .ov-typekabel'); s.value='XVB 3G1,5'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(300);
ok((await E(`state.interlex.items.filter(k=>k.autoVl).reduce((n,k)=>n+(k.onder.aderNr?1:0)+(k.boven.aderNr?1:0),0)`))===2, 'kabel 3G1,5 -> 2 aders');
// automaat kiezen
if(nAut>1){ await p.evaluate(()=>{ const s=document.querySelector('.vl-tabel tbody tr:nth-child(1) .ov-automaat'); s.selectedIndex=1; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(200);
 ok(await E(`!!state.verlichting.items[0].zekeringModuleId`), 'automaat bewaard'); }
// niet meer op klemmen -> weg
await p.evaluate(()=>{ const s=document.querySelector('.vl-tabel tbody tr:nth-child(1) .ov-aansl'); s.value='schakelcontact'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(300);
ok((await E(`state.interlex.items.filter(k=>k.autoVl).length`))===0, 'andere aansluiting -> klemmen weg');
// opnieuw op klemmen + verwijderen -> klemmen weg
await p.evaluate(()=>{ const s=document.querySelector('.vl-tabel tbody tr:nth-child(2) .ov-aansl'); s.value='klemmen'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(300);
ok((await E(`state.interlex.items.filter(k=>k.autoVl).reduce((n,k)=>n+(k.onder.aderNr?1:0)+(k.boven.aderNr?1:0),0)`))===4, 'rij 2 op klemmen -> 4 aders');
await p.evaluate(()=>document.querySelector('.vl-tabel tbody tr:nth-child(2) .vl-weg').click()); await p.waitForTimeout(400);
ok((await E(`state.interlex.items.filter(k=>k.autoVl).length`))===0, 'lichtpunt weg -> klemmen weg');
// Rijgklemmen-tab opent zonder fouten
await E(`selectTab('interlex')`); await p.waitForTimeout(600);
ok(errs.length===0, 'geen JS-fouten '+errs.join(' | '));
await b.close();
