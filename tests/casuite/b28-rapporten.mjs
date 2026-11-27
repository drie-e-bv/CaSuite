// Vereist een testkopie van index.html met 'window.__cdEval = (c)=> eval(c);' vóór 'function vlAantal(item){', geserveerd op poort 8790, en stub3.js in de cwd. Schrijft /tmp/rapport.pdf (titelblad + kasten, Casentis-kader) om na te kijken.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1400,height:900}});
const errs=[]; p.on('console', m=>{ if(m.text().startsWith('PARENTS')) console.log(m.text()); }); p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
const E=(c)=> p.evaluate((c)=> window.__cdEval(c), c);
const ok=(c,m)=>console.log((c?'OK  ':'FOUT')+' '+m);
await p.goto('http://localhost:8790/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(600);
const r = await E(`(()=>{
  window.casuiteBedrijf = ()=> ({naam:'BV CASENTIS', adres:'Léon Bekaertlaan 3/K - 9880 AALTER', email:'info@casentis.be', website:'www.casentis.be'});
  window.casuiteProject = ()=> ({naam:'De Jaegher', projectnummer:'2600124', projectleider_naam:'Peter Bral', contactpersonen:[{rol:'Architect', naam:'Jan Peeters', bedrijf:'Atelier P'}]}); state.instellingen.klant = 'Fam. De Jaegher'; state.instellingen.dossierAfdrukNr = 3;
  state.instellingen.project = 'De Jaegher'; state.instellingen.adres = 'Ponteputstraat 7 - 9870 Olsene'; state.instellingen.spanning = '400V 3N~';
  state.modules.driverkast = true; state.modules.data = true;
  const zk = state.zekeringen.kasten[0]; zk.naam = 'Zekeringkast 1'; zk.kamer = 'Berging'; zk.maat = 36; zk.rijen = [];
  const mk = (cat, o)=> Object.assign({id: cryptoId(), categorie: cat, breedte: (MODULE_CATEGORIEEN[cat]||{}).breedte||1, polen:'', A:'', mA:'', naam:'', type:''}, o);
  const hoofd = mk('Differentieel', {isHoofd:true, polen:'4P', A:'63A', mA:'300mA', type:'Type A', naam:'HOOFDDIFFERENTIEEL', breedte:4});
  const r1 = newRij(); r1.items.push(hoofd); zk.rijen.push(r1);
  for(let d=0; d<5; d++){
    const r = newRij(); const diff = mk('Differentieel', {polen:'2P', A:'40A', mA:'30mA', type:'Type A', naam:'DIFF'+(d+1), breedte:2}); r.items.push(diff);
    for(let a=0; a<9; a++) r.items.push(mk('Automaat', {polen:'2P', A: a%3 ? '20A':'16A', curve:'C', type:'Resi9 C 3kA', naam:['STOPCONTACTEN KEUKEN','VERLICHTING DALI 230V GELIJKVLOERS','DROOGKAST','RESERVE','OVEN'][a%5]+' '+(d+1), kabelType: a%3 ? '3G2,5':'3G1,5', linkedDiffId: diff.id, breedte:2}));
    zk.rijen.push(r);
  }
  const rr = newRij(); rr.items.push(mk('Relais', {naam:'MOTOR RELAIS', breedte:4, uitgangen:[{id:cryptoId(), type:'kring', targetId:''}]})); zk.rijen.push(rr);
  // driverkast
  const dk = newDriverKast(); dk.kamer = 'Living';
  for(let i=0;i<12;i++){ const d = newDriverItem(); d.naam='TCI maxi jolly US dali 500'; d.type='Spots 350mA 15W'; d.armaturen=[{id:cryptoId(), naam:'Prado trimless spot long', aantal:2, ruimte:['Living','Keuken','Master'][i%3]}]; dk.items.push(d); }
  state.driverkast.kasten = [dk];
  dkPlan(dk).voedingZek = zk.rijen[1].items[1].id;
  // patchkast
  const pk = state.patchkast.kasten[0] || (state.patchkast.kasten.push(newKast(18)), state.patchkast.kasten[0]); pk.maxU = 18; pk.items = [newPatchItem('Patchpaneel'), newPatchItem('Kabelgoot'), newPatchItem('Switch'), newPatchItem('Recorder'), newPatchItem('UPS')];
  pk.items[0].naam = 'Data'; pk.items[2].naam = 'Core'; pk.items[2].type = 'Ubiquiti USW-24-PoE'; pk.items[3].ipAdres = '192.168.1.20';
  save();
  const c = document.getElementById('printExport'); c.innerHTML = '';
  exportZekeringVoorWerf(false); exportDriverkastVoorWerf(false); exportPatchkastVoorWerf(false); exportKringenVoorWerf(false);
  document.body.classList.add('print-patchkast');
  crKader(c); crStijl(c);
  return JSON.stringify({bladen: c.querySelectorAll('.cr-blad').length, paginas: [...c.querySelectorAll('.cr-blad')].map(b=> (b.style.page||'-') + ':' + (b.querySelector('[data-soort]')||{dataset:{}}).dataset.soort)});
})()`);
console.log(r);
await p.evaluate(()=>{ const h=document.getElementById('cados-project-hint-card'); if(h) h.style.display='none'; document.getElementById('cados-app-wrap').style.display=''; console.log('PARENTS', (()=>{let e=document.getElementById('printExport'), out=[]; while(e){ out.push(e.id||e.tagName); e=e.parentElement;} return out.join('<');})()); }); await p.emulateMedia({media:'print'});
await p.pdf({path:'/tmp/rapport.pdf', preferCSSPageSize:true, printBackground:true});
// Uitvoering-afdruk (A3) en printcentrum-selectie via de echte window.print-omhulling
const u = await E(`(()=>{ const pr = []; const org = window.print; 
  document.body.classList.remove('print-patchkast'); printOpruimen();
  uvAfdrukken(UV_CTX_ZEK, {fmt:'A3', richting:'landscape', alle:false, metLijst:true, kastenLijst: UV_CTX_ZEK.kasten()});
  const c = document.getElementById('printExport');
  return JSON.stringify({bladen: c.querySelectorAll('.cr-blad').length, kop: !!c.querySelector('.cr-kop'), pagina: [...c.querySelectorAll('.cr-blad')].map(b=>b.style.page), stijl: (document.getElementById('crStijl')||{}).textContent ? document.getElementById('crStijl').textContent.includes('cr_A3_l') : false});
})()`);
console.log('uitvoering', u); const U = JSON.parse(u);
ok(U.bladen===3 && U.kop && U.stijl, 'Uitvoering-afdruk: titelblad + plan op A3 liggend + lijst, met Casentis-kop');
await p.waitForTimeout(600);
const s2 = await E(`(()=>{ const sel = {}; EXPORT_SECTIES.forEach(x=> sel[x.key] = {schema:true, lijst:true}); exportMetSelectie(sel); const c = document.getElementById('printExport');
  return JSON.stringify({bladen: c.querySelectorAll('.cr-blad').length, soorten: [...new Set([...c.querySelectorAll('.cr-kop-type')].map(x=>x.textContent))]}); })()`);
console.log('printcentrum', s2); ok(JSON.parse(s2).bladen >= 8, 'Printcentrum: alles in het kader');
ok(errs.length===0, 'geen JS-fouten '+errs.join(' | '));
await b.close();
