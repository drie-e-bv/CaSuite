// Vereist een testkopie van index.html met 'window.__cdEval = (c)=> eval(c);' vóór 'function vlAantal(item){', geserveerd op poort 8790, en stub3.js in de cwd. Patchpaneel-poorten: kamer/functie/toestel/switch-poort.
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
  state.modules.data = true; state.kamers = ['Living','Slaapkamer 1','Slaapkamer 2','Master','Master badkamer']; state.kamerOuder = {'Master badkamer':'Master'};
  const pk = state.patchkast.kasten[0]; pk.items = [];
  const pp = newPatchItem('Patchpaneel'); pp.naam='Data'; pp.poorten[0].omschrijving='Slaapkamer 1 - Wifi'; pp.poorten[1].omschrijving='Slaapkamer 1 -Airco'; pp.poorten[2].omschrijving='Living — multimedia 2'; pp.poorten[3].omschrijving='Iets anders';
  const sw = newPatchItem('Switch'); sw.naam='Core'; pk.items.push(pp, sw); save(); selectTab('data'); window.__pp = pp; return 1; })()`);
await p.waitForTimeout(800);
await p.click(`#panel-data .rackitem[data-id="${await E('__pp.id')}"] .rackitem-main`); await p.waitForTimeout(600);
let r = await J(`JSON.stringify(__pp.poorten.slice(0,4).map(x=> [x.kamer, x.functie]))`);
console.log(JSON.stringify(r));
ok(r[0][0]==='Slaapkamer 1' && r[0][1]==='Wifi' && r[1][1]==='Airco' && r[2][0]==='Living' && r[2][1]==='multimedia 2' && r[3][0]==='' && r[3][1]==='Iets anders', 'bestaande omschrijvingen netjes opgesplitst in kamer + functie');
const rij = (n)=> p.$(`#panel-data .poorten-body tr[data-i="${n}"]`);
ok((await p.$$('#panel-data .poorten-body tr')).length===24 && !!(await p.$('#panel-data table.ov-tabel.pp-tabel')), 'tabel in de opmaak van het componentenoverzicht (24 poorten)');
const opts = await (await rij(4)).$$eval('.pp-kamer option', os=> os.map(o=> o.textContent));
ok(opts.includes('Master › Master badkamer'), 'kamerkeuze met subkamers ("Master › Master badkamer")');
await (await rij(4)).$eval('.pp-kamer', s=>{ s.value='Master badkamer'; s.dispatchEvent(new Event('change',{bubbles:true})); });
await (await (await rij(4)).$('.pp-functie')).fill('Wifi');
await (await (await rij(4)).$('.pp-toestel')).fill('Wifi antenne');
await (await rij(4)).$eval('.pp-switch', s=>{ s.value = s.options[6].value; s.dispatchEvent(new Event('change',{bubbles:true})); });
await p.waitForTimeout(500);
r = await J(`JSON.stringify((()=>{ const x = __pp.poorten[4]; const sw = state.patchkast.kasten[0].items[1]; const sp = sw.poorten[5]; return {oms: x.omschrijving, swKop: sp.patchpaneelPoortId===x.id, swToestel: sp.toestelNaam, type: sp.koppelType}; })())`);
console.log(JSON.stringify(r));
ok(r.oms==='Master badkamer — Wifi · Wifi antenne', 'omschrijving automatisch: Kamer — Functie · Toestel');
ok(r.swKop && r.type==='patchpaneel' && r.swToestel==='Wifi antenne', 'beide zijden: switch poort 6 gekoppeld aan de patchpoort met hetzelfde toestel');
// andere switch-poort kiezen: oude wordt vrijgegeven
await (await rij(4)).$eval('.pp-switch', s=>{ s.value = s.options[2].value; s.dispatchEvent(new Event('change',{bubbles:true})); });
await p.waitForTimeout(400);
r = await J(`JSON.stringify(state.patchkast.kasten[0].items[1].poorten.filter(x=> x.patchpaneelPoortId===__pp.poorten[4].id).length)`);
ok(r===1, 'switch-poort wijzigen: de vorige wordt vrijgegeven (geen dubbele koppeling)');
// Enter springt naar dezelfde kolom volgende poort
await (await (await rij(5)).$('.pp-functie')).focus(); await p.keyboard.press('Enter');
ok(await p.evaluate(()=> document.activeElement.closest('tr').dataset.i)==='6', 'Enter = volgende poort, zelfde kolom');
// afdruk
r = await J(`JSON.stringify((()=>{ const c = document.getElementById('printExport'); c.innerHTML=''; exportPatchkastVoorWerf(false); const t = c.textContent; c.innerHTML=''; return {k: t.includes('Master › Master badkamer'), sw: t.includes('Core · poort 2'), t: t.includes('Wifi antenne')}; })())`);
ok(r.k && r.sw && r.t, 'afdruk patchpaneel: kamer, functie, toestel en switch-poort');
// 27/11/2026: kolom Notitie (benaming van de werf)
ok(await p.evaluate(()=> [...document.querySelectorAll('#panel-data .pp-tabel thead th')].map(t=>t.textContent).includes('Notitie')), 'kolom Notitie naast Switch-poort');
await (await (await rij(4)).$('.pp-notitie')).fill('op de werf: bureau 2'); await p.waitForTimeout(300);
r = await J(`JSON.stringify((()=>{ const x = __pp.poorten[4]; const c = document.getElementById('printExport'); c.innerHTML=''; exportPatchkastVoorWerf(false); const t = c.textContent; c.innerHTML=''; return {n: x.notitie, oms: x.omschrijving, druk: t.includes('op de werf: bureau 2')}; })())`);
ok(r.n==='op de werf: bureau 2' && r.oms==='Master badkamer — Wifi · Wifi antenne' && r.druk, 'notitie bewaard, verandert de omschrijving niet en staat in de afdruk');
await p.screenshot({path:'/tmp/pp.png'});
ok(errs.length===0, 'geen JS-fouten '+errs.join(' | '));
await b.close();
