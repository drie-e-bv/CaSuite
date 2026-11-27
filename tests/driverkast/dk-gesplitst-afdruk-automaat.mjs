// Vereist een testkopie van index.html met 'window.__cdEval = (c)=> eval(c);' vóór 'function vlAantal(item){', geserveerd op poort 8790, en stub3.js in de cwd.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1400,height:1000}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
const E=(c)=> p.evaluate((c)=> window.__cdEval(c), c);
const ok=(c,m)=>console.log((c?'OK  ':'FOUT')+' '+m);
await p.goto('http://localhost:8790/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(600);
await p.evaluate(()=>{ window.print = ()=>{}; });
const r = JSON.parse(await E(`(()=>{
  state.modules.driverkast = true;
  const zk = state.zekeringen.kasten[0]; if(!zk.rijen.length) zk.rijen.push({id:cryptoId(), items:[]});
  const aut = {id:'autX', categorie:'Automaat', naam:'VERLICHTING DALI', A:16, polen:'2P', breedte:2};
  zk.rijen[0].items.push(aut);
  const dk = state.driverkast.kasten[0]; dk.items = [];
  for(let i=0;i<6;i++){ const d = newDriverItem(); d.naam='TCI maxi jolly US dali 500'; d.armaturen=[{id:cryptoId(), naam:'Prado', aantal:2, ruimte:'Master'}]; dk.items.push(d); }
  const autIds = alleZekeringAutomaten().map(a=>a.id);
  dkPlan(dk).voedingZek = autIds.includes('autX') ? 'autX' : autIds[0];
  save();
  const v = dkFysiekeKasten()[0];
  const d5 = dk.items[5]; dkNaarKast(v, d5, null);
  const n = dkFysiekeKasten().length;
  const k5 = azKeten(d5);
  // ook als de deel-plan geen automaat heeft (oude dossiers): terugval op ontwerpkast
  const deel = dk.planDelen[0]; const oud = deel.plan.voedingZek; delete deel.plan.voedingZek;
  const k5b = azKeten(d5); deel.plan.voedingZek = oud;
  // splitsen in aparte kasten
  for(let i=0;i<6;i++){ const d = newDriverItem(); d.naam='TCI mini jolly dali 500'; d.armaturen=[{id:cryptoId(), naam:'Acrobat', aantal:1, ruimte:'TV Room'}]; dk.items.push(d); }
  const nv = dkVerdeelKast(dk, 8);
  const tweede = state.driverkast.kasten[1];
  const kv = tweede ? azKeten(tweede.items[0]) : null;
  exportDriverkastVoorWerf(true);
  const pe = document.getElementById('printExport');
  const koppen = [...pe.querySelectorAll('.cr-plan .cr-titel')].map(x=>x.textContent + ' | ' + x.parentNode.querySelector('.cr-feiten').textContent);
  const kastKol = [...pe.querySelectorAll('.cr-lijst h2')].map(t=>t.textContent);
  return JSON.stringify({n, k5: !!k5, k5b: !!k5b, nv, kv: !!kv, koppen, kastKol, voed: autIds.length});
})()`));
console.log(JSON.stringify(r));
ok(r.n===2, 'verplaatsen naar nieuwe kast maakt 2 fysieke kasten');
ok(r.k5, 'verplaatste driver houdt de automaat van de kast');
ok(r.k5b, 'deel zonder eigen automaat valt terug op de ontwerpkast');
ok(r.nv>=1 && r.kv, 'dkVerdeelKast: nieuwe kast erft de voedende automaat');
ok(r.koppen.length>=3, 'afdruk toont elke fysieke kast: '+r.koppen.join(' | '));
ok(r.kastKol.length>=3, 'lijst in afdruk heeft per fysieke kast een nummer: '+r.kastKol.join(','));
ok(errs.length===0, 'geen JS-fouten '+errs.join(' | '));
await b.close();
