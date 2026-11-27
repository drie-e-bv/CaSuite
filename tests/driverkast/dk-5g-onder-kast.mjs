// Vereist een testkopie van index.html met 'window.__cdEval = (c)=> eval(c); window.__uvSel = ()=> uvSelMod;' vóór 'function vlAantal(item){', geserveerd op poort 8790, en stub3.js in de cwd. 5G1,5 optie A onder de kast, 100-nummer, omzetten naar optie B.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1500,height:1100}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
const E=(c)=> p.evaluate((c)=> window.__cdEval(c), c);
const J=async(c)=> JSON.parse(await E(c));
const ok=(c,m)=>console.log((c?'OK  ':'FOUT')+' '+m);
await p.goto('http://localhost:8790/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(600);
await E(`(()=>{ document.getElementById('cados-project-hint-card').style.display='none'; document.getElementById('cados-app-wrap').style.display='';
  state.modules.driverkast = true; state.modules.verlichting = true;
  const k = newDriverKast(); k.kamer='Master';
  for(let i=0;i<5;i++){ const d = newDriverItem(); d.naam='TCI'; d.armaturen=[{id:cryptoId(), naam:'Prado', aantal:2, ruimte:'Master'}]; k.items.push(d);}
  state.driverkast.kasten = [k];
  const mk=(n)=>{ const v = newVerlichtingItem(); v.naam=n; v.kamer='Master Badkamer'; return v; };
  state.verlichting.items = [mk('Wand badkamer'), mk('Spiegel')];
  dk5gZetKast(state.verlichting.items[1], k.id);
  // extra driver erachter: nummering mag niet verspringen
  const d6 = newDriverItem(); d6.naam='TCI'; d6.armaturen=[{id:cryptoId(), naam:'Prado', aantal:1, ruimte:'Master'}]; k.items.push(d6);
  save(); return 1; })()`);
let r = await J(`JSON.stringify((()=>{ const k = state.driverkast.kasten[0]; const c = computeDriverCodes(); const a = k.items.find(d=> d.vijfG); const p = dkPlanKast(dkFysiekeKasten()[0]); dkOmzet(p);
  return {codes: k.items.map(d=> c[d.id]), inKol: p.kolommen.flat().includes(a.id), mod: (p._layout.mods.find(m=> m.m.id===a.id)||{m:{_dk:{}}}).m._dk.soort, rk: p._layout.mods.some(m=> m.m.id==="dkk_"+a.id),
    draden: p.bedrading.filter(w=> w.a.m===a.id || w.b.m===a.id).map(w=> w.a.k+"-"+w.b.k), onder: (p._layout.mods.find(m=> m.m.id===a.id)||{}).y > p._layout.plaatOnderPx, phx: p._layout.mods.find(m=> m.m.id.startsWith('dkp_L_')).m.klemmenEigen.length }; })())`);
console.log(JSON.stringify(r));
ok(r.codes.join()==="D1,D2,D3,D4,D5,101,D6", 'kabel houdt zijn 100-nummer (101), D-nummers lopen door zonder sprong');
ok(!r.inKol && r.mod==="kabel5g" && !r.rk, 'kabel niet in de kast, geen rijgklemmen, als blok getekend');
ok(r.onder, 'blok staat onder de montageplaat');
ok(r.draden.length===4 && r.phx===8, 'kabel op de verdeelblokken L/N/DA+/DA− (punt voorzien op de Phoenix)');
await E(`(()=>{ dkOverzicht=false; dkAlleSel=null; selectTab('driverplan'); return 1; })()`); await p.waitForTimeout(900);
const bv = await p.$('[data-mod]'); 
await p.screenshot({path:'/tmp/vt/k5g-1.png', fullPage:false});
const id = await E(`state.driverkast.kasten[0].items.find(d=> d.vijfG).id`);
const g = await p.$(`#panel-driverplan g.dk-kabel5g[data-mod="${id}"]`); ok(!!g, 'blok zichtbaar in het Plan');
if(g){ await g.scrollIntoViewIfNeeded(); const bb = await g.boundingBox(); await p.mouse.click(bb.x+bb.width/2, bb.y+bb.height*0.6); await p.waitForTimeout(600); }
const knop = await p.$('.dk-5g-b'); ok(!!knop, 'zijkolom met knop "Driver + armatuur maken (optie B)"');
await p.screenshot({path:'/tmp/vt/k5g-2.png'});
if(knop){ await p.fill('.dk-5g-arm', 'Prado'); await knop.click(); await p.waitForTimeout(700); }
r = await J(`JSON.stringify((()=>{ const k = state.driverkast.kasten[0]; const a = k.items.find(d=> d.vijfG); const p = dkPlanKast(dkFysiekeKasten()[0]); const c = computeDriverCodes();
  return {cfg: a.vijfG, inKol: p.kolommen.flat().includes(a.id), rk: p._layout.mods.some(m=> m.m.id==="dkk_"+a.id), code: c[a.id], naam: a.naam, lp: state.verlichting.items[1].naam}; })())`);
console.log(JSON.stringify(r));
ok(r.cfg==="B" && r.inKol && r.rk, 'na de knop: optie B, driver in de kast, rijgklemmen erbij');
await p.screenshot({path:'/tmp/vt/k5g-3.png'});
ok(errs.length===0, 'geen JS-fouten '+errs.join(' | '));
await b.close();
