// Vereist een testkopie van index.html met 'window.__cdEval = (c)=> eval(c);' vóór 'function vlAantal(item){', geserveerd op poort 8790, en stub3.js in de cwd. Test Gegevenscontrole + patchkast eigen voeding (Peters testlijst 1-10).
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1500,height:1000}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
const E=(c)=> p.evaluate((c)=> window.__cdEval(c), c);
const J=async(c)=> JSON.parse(await E(c));
const ok=(c,m)=>console.log((c?'OK  ':'FOUT')+' '+m);
await p.goto('http://localhost:8790/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(600);
// dossier met de fouten uit dossier 450 + patchkast
await E(`(()=>{ document.getElementById('cados-project-hint-card').style.display='none'; document.getElementById('cados-app-wrap').style.display='';
  state.modules.driverkast = true; state.modules.data = true; state.modules.kringen = true; state.modules.knoppen = true;
  state.kamers = ['Living','Master','Nachthal','']; state.verdiepingen = [{code:'G',label:'Gelijkvloers'},{code:'V',label:'Verdieping'}];
  state.kamerVerdieping = {Living:'G', Master:'V1', Nachthal:'V1', Badkamer:'V1', Oud:'G'};
  const zk = state.zekeringen.kasten[0]; zk.rijen = [newRij()];
  const mk = (naam)=>({id: cryptoId(), categorie:'Automaat', breedte:2, polen:'2P', A:'16A', naam});
  const aPatch = mk('PATCHKAST'), aVersterker = mk('VERSTERKER'), aDk = mk('DRIVERKAST 1'), aRes = mk('RESERVE'), aLos = mk('STOPCONTACTEN LIVING');
  zk.rijen[0].items.push(aPatch, aVersterker, aDk, aRes, aLos);
  const kSpots = newKringItem(); kSpots.kamer='Badkamer'; kSpots.info='Spots 350mA 15W (4 drivers)';
  const kMaster = newKringItem(); kMaster.kamer='Master'; kMaster.info='Spots 350mA 15W (2 drivers)';
  const kDub = newKringItem(); kDub.kamer='Master'; kDub.info='Spots 350mA 15W (2 drivers)';
  const kStop = newKringItem(); kStop.kamer='Living'; kStop.info='Stopcontacten Living'; kStop.zekeringModuleId = aLos.id;
  state.kringen.items = [kSpots, kMaster, kDub, kStop];
  const dk = newDriverKast(); dk.kamer='Master'; for(let i=0;i<2;i++){ const d = newDriverItem(); d.naam='TCI'; d.kringId = kMaster.id; d.armaturen=[{id:cryptoId(), naam:'Prado', aantal:2, ruimte:'Master'}]; dk.items.push(d); }
  const dLos = newDriverItem(); dLos.naam='TCI'; dLos.kringId = 'bestaatniet'; dLos.armaturen=[{id:cryptoId(), naam:'Prado', aantal:1, ruimte:'Master'}]; dk.items.push(dLos);
  state.driverkast.kasten = [dk]; dkPlan(dk).voedingZek = aDk.id;
  const kn = state.knoppen.items[0] || (state.knoppen.items.push({id:cryptoId(), gangen:[]}), state.knoppen.items[0]);
  kn.gangen = [{id:cryptoId(), kringId: kSpots.id}];
  // patchkast: oude manier (elk toestel zijn automaat), versterker afwijkend
  const pk = state.patchkast.kasten[0]; pk.items = []; delete pk.zekeringModuleId;
  const t = (cat, naam, aut)=>{ const it = newPatchItem(cat); it.naam = naam; it.zekeringModuleId = aut || ''; pk.items.push(it); return it; };
  t('Patchpaneel','Data'); t('Switch','Switch 1', aPatch.id); t('Switch','Switch 2', aPatch.id); t('Overig','Router', aPatch.id); t('Overig','NAS', ''); t('Muziek','Versterker', aVersterker.id); t('Overig','Crestron', aPatch.id);
  pkVoedingMigratie(state); save(); window.__ids = {aPatch: aPatch.id, aVersterker: aVersterker.id, kSpots: kSpots.id};
  return 1; })()`);
// 6. patchkast: standaard één algemene zekering
let r = await J(`JSON.stringify((()=>{ const k = state.patchkast.kasten[0]; return {alg: k.zekeringModuleId===__ids.aPatch, items: k.items.map(it=> ({n: it.naam, e: !!it.eigenVoeding, z: it.zekeringModuleId===__ids.aPatch ? 'P' : it.zekeringModuleId===__ids.aVersterker ? 'V' : it.zekeringModuleId ? '?' : ''}))}; })())`);
console.log(JSON.stringify(r));
ok(r.alg && r.items.filter(x=> x.z==='P' && !x.e).length===5, '6. migratie: algemene zekering voedt 5 toestellen (ook de NAS zonder eigen keuze)');
ok(r.items.find(x=> x.n==='Versterker').e && r.items.find(x=> x.n==='Versterker').z==='V', '7. versterker krijgt eigen voeding (afwijkende automaat)');
ok(r.items.find(x=> x.n==='Data').z==='' , 'patchpaneel (passief) krijgt geen voeding');
// Koppelen: 1 rij voor de kast + 1 voor de versterker, geen rij per switch
r = await J(`JSON.stringify(azLijstMetStroom().filter(x=> x.soort==='Patchkast').map(x=> x.naam))`);
console.log(JSON.stringify(r)); ok(r.length===2, '9. Koppelen: één regel algemene voeding + één regel eigen voeding (geen dubbele aansluitingen)');
// algemene voeding wisselen -> alle niet-eigen toestellen volgen, versterker niet
r = await J(`JSON.stringify((()=>{ const k = state.patchkast.kasten[0]; const nieuw = alleZekeringAutomaten().find(a=> a.naam==='STOPCONTACTEN LIVING').id; k.zekeringModuleId = nieuw; save(); return {volg: k.items.filter(it=> pkHeeftStroom(it) && !it.eigenVoeding).every(it=> it.zekeringModuleId===nieuw), vers: k.items.find(it=> it.naam==='Versterker').zekeringModuleId===__ids.aVersterker}; })())`);
ok(r.volg && r.vers, '8. algemene voeding wijzigen: overige toestellen volgen, versterker houdt zijn eigen automaat');
// UI: eigen voeding uit en weer aan
await E(`selectTab('data')`); await p.waitForTimeout(800);
const vid = await E(`state.patchkast.kasten[0].items.find(it=> it.naam==='Versterker').id`);
await p.click(`#panel-data .rackitem[data-id="${vid}"] .rackitem-main`); await p.waitForTimeout(500);
const cb = await p.$('#panel-data .pe-eigen'); ok(!!cb && await cb.isChecked(), 'editor toont checkbox "Eigen voeding" (aangevinkt bij de versterker)');
await cb.click(); await p.waitForTimeout(600);
r = await J(`JSON.stringify((()=>{ const k = state.patchkast.kasten[0]; const v = k.items.find(it=> it.naam==='Versterker'); return {e: !!v.eigenVoeding, z: v.zekeringModuleId===k.zekeringModuleId, rijen: azLijstMetStroom().filter(x=> x.soort==='Patchkast').length}; })())`);
ok(!r.e && r.z && r.rijen===1, '2.5 uitvinken: versterker terug op de algemene voeding, eigen koppeling vrijgegeven, geen dubbele rij');
if(!(await p.$('#panel-data .pe-eigen'))){ await p.click(`#panel-data .rackitem[data-id="${vid}"] .rackitem-main`); await p.waitForTimeout(400); }
console.log('dubbel', await E(`JSON.stringify((()=>{ try{ const h = dkKringHerstelVoorstel(); return {d: (h.dubbel||[]).length, k: (h.koppel||[]).length}; }catch(e){ return 'ERR '+e.message; } })())`));
const cb2 = await p.$('#panel-data .pe-eigen'); if(cb2 && !(await cb2.isChecked())) { await cb2.click(); await p.waitForTimeout(600); }
r = await J(`JSON.stringify((()=>{ const v = state.patchkast.kasten[0].items.find(it=> it.naam==='Versterker'); return {e: !!v.eigenVoeding, z: v.zekeringModuleId}; })())`);
ok(r.e && r.z==='', '2.5 aanvinken: eigen voeding start leeg (te kiezen), niet stil dubbel op de algemene');
// Gegevenscontrole
await E(`selectTab('controle')`); await p.waitForTimeout(800);
const gc = await J(`JSON.stringify(gcControles().map(r=> r.cat + ' | ' + r.titel))`);
gc.forEach(x=> console.log('   ', x));
ok(gc.some(x=> /verweesd.*Kamer "Badkamer" bestaat niet/.test(x)), '4. verwijderde kamer die nog gebruikt wordt: gedetecteerd als verweesd');
ok(gc.some(x=> /verweesd.*verdieping "V1"/.test(x)), 'kamers op een verdieping die niet bestaat: gedetecteerd');
ok(gc.some(x=> /onvolledig.*geen drivers \(4 verwacht\)/.test(x)), 'drivers-kring zonder drivers: gedetecteerd');
ok(gc.some(x=> /verweesd.*kringId/.test(x)), 'driver met kring die niet meer bestaat: gedetecteerd');
ok(gc.some(x=> /verouderd.*dubbele kring/.test(x)), '3. dubbele kringen: gedetecteerd');
ok(gc.some(x=> /bewust.*reserve/.test(x)), 'reserve-automaat = bewust niet gekoppeld (geen fout)');
ok(gc.some(x=> /verouderd.*lege kamernaam/.test(x)), 'lege kamernaam: gedetecteerd');
ok(gc.some(x=> /eigen voeding.*nog geen automaat/i.test(x)), 'eigen voeding zonder automaat: onvolledig');
// 1. drivers-kring zonder drivers niet meer in de Koppelen-lijst; 2. geldige maar nog niet gekoppelde stopcontactkring wél
r = await J(`JSON.stringify(azLijstMetStroom().filter(x=> x.soort==='Kring').map(x=> x.kamer + ':' + x.naam))`);
ok(!r.some(x=> /Badkamer/.test(x)), '1. kring zonder drivers verschijnt niet meer als te koppelen verbruiker');
ok(r.some(x=> /Stopcontacten Living/.test(x)), '2. geldige kring (nog niet / wel gekoppeld) blijft beschikbaar');
// herstel: verdieping V1 -> V via de pagina (knop), kamer Badkamer vervangen door Master
const zoek = async (re)=> (await p.$$('#panel-controle .gc-rij')).find(async ()=>true);
await E(`(()=>{ gcHerstel('test', ()=>{}); return 1; })()`); await p.waitForTimeout(400);
let rijen = await p.$$('#panel-controle .gc-rij');
for(const rij of rijen){ const t = await rij.innerText(); if(/verdieping "V1"/.test(t)){ const btn = await rij.$('button.primary'); await btn.click(); break; } }
await p.waitForTimeout(800);
r = await J(`JSON.stringify(state.kamerVerdieping)`); ok(r.Master==='V' && r.Nachthal==='V', 'herstel: kamers V1 → V (voorstel) met één knop');
rijen = await p.$$('#panel-controle .gc-rij');
for(const rij of rijen){ const t = await rij.innerText(); if(/Badkamer" bestaat niet/.test(t)){ await rij.$eval('select', s=>{ s.value='Master'; }); const btns = await rij.$$('button.primary'); await btns[1].click(); break; } }
await p.waitForTimeout(800);
r = await J(`JSON.stringify({k: state.kringen.items.map(k=>k.kamer), kv: state.kamerVerdieping.Badkamer||null})`);
ok(!r.k.includes('Badkamer') && r.kv===null, 'herstel: alles van "Badkamer" naar "Master" verplaatst (kring + verdieping)');
// kring zonder drivers verwijderen ontkoppelt de knop
rijen = await p.$$('#panel-controle .gc-rij');
for(const rij of rijen){ const t = await rij.innerText(); if(/geen drivers \(4 verwacht\)/.test(t)){ await (await rij.$('button.gc-gevaar')).click(); break; } }
await p.waitForTimeout(600);
const dlg = await p.$('.vl-bevestig button.primary, .modal button.btn-primary, .vlb-ok'); if(dlg){ await dlg.click(); await p.waitForTimeout(600); }
r = await J(`JSON.stringify({kring: state.kringen.items.some(k=> k.id===__ids.kSpots), knop: state.knoppen.items[0].gangen[0].kringId})`);
ok(!r.kring && r.knop==='', 'kring verwijderen: kring weg en knop-gang netjes losgekoppeld (geen dode verwijzing)');
// kamer hernoemen: koppelingen volgen
await E(`selectTab('kamers')`); await p.waitForTimeout(600);
const inp = (await p.$$('#panel-kamers .km-naam')).find(Boolean);
const inps = await p.$$('#cados-app .km-naam'); let mi = null; for(const x of inps){ if(await x.inputValue()==='Master'){ mi = x; break; } }
if(mi){ await mi.focus(); await mi.fill('Master bedroom'); await mi.evaluate(e=> e.dispatchEvent(new Event('change', {bubbles:true}))); await p.waitForTimeout(500); }
r = await J(`JSON.stringify({dk: state.driverkast.kasten[0].kamer, arm: state.driverkast.kasten[0].items[0].armaturen[0].ruimte, kr: state.kringen.items.filter(k=> k.kamer==='Master bedroom').length})`);
ok(r.dk==='Master bedroom' && r.arm==='Master bedroom' && r.kr>=1, 'kamer hernoemen: driverkast, armaturen en kringen volgen de nieuwe naam');
// 5. bestaande gegevens behouden
r = await J(`JSON.stringify({dr: alleDrivers().length, pk: state.patchkast.kasten[0].items.length, aut: alleZekeringAutomaten().length})`);
ok(r.dr===3 && r.pk===7 && r.aut===5, '5. bestaande gegevens behouden (drivers, toestellen, automaten)');
// 10. afdruk patchkast toont algemeen / eigen
r = await J(`JSON.stringify((()=>{ const c = document.getElementById('printExport'); c.innerHTML=''; exportPatchkastVoorWerf(false); const t = c.textContent; c.innerHTML=''; return {alg: t.includes('algemeen ('), eigen: /eigen: /.test(t) || /eigen voeding/.test(t)}; })())`);
ok(r.alg && r.eigen, '10. afdruk patchkast: algemene en eigen voeding zichtbaar');
ok(errs.length===0, 'geen JS-fouten '+errs.join(' | '));
await p.screenshot({path:'/tmp/gc.png'});
await E(`selectTab('controle')`); await p.waitForTimeout(600); await p.screenshot({path:'/tmp/gc2.png'});
await b.close();
