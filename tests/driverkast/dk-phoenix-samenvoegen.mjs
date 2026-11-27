// Vereist een testkopie van index.html met 'window.__cdEval = (c)=> eval(c);' vóór 'function vlAantal(item){', geserveerd op poort 8790, en stub3.js in de cwd. Phoenix-verdeelblokken samenvoegen (dubbele adereindhuls) als de DIN-rail niet past.
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
const zet = (n, breed)=> J(`JSON.stringify((()=>{ document.getElementById('cados-project-hint-card').style.display='none'; document.getElementById('cados-app-wrap').style.display='';
  state.modules.driverkast = true; const k = newDriverKast(); k.sturing='DALI';
  for(let i=0;i<${n};i++){ const d = newDriverItem(); d.naam='TCI'; d.armaturen=[{id:cryptoId(), naam:'Prado', aantal:1, ruimte:'Living'}]; k.items.push(d);}
  state.driverkast.kasten = [k]; const v = dkFysiekeKasten()[0]; const p0 = dkPlan(v); p0.breedte = ${breed}; p0.formaatVast = true;
  const p = dkPlanKast(v); dkOmzet(p); dkPlanKast(v);
  const L = p._layout; const ph = L.mods.find(m=> m.m.id.startsWith('dkp_L_')).m;
  const pts = p.bedrading.filter(w=> w.a.m.startsWith('dkp_L_') && w.a.k!=='i').map(w=> w.a.k);
  const tel = {}; pts.forEach(x=> tel[x]=(tel[x]||0)+1);
  return {blokken: ph._dk.blokken, dubbel: ph._dk.dubbel||0, rail: Math.round(L.railLengte), breed: p.breedte, maxPt: Math.max(...pts.map(x=> +x.slice(1))), dubbelePunten: Object.values(tel).filter(c=> c===2).length, draden: pts.length};
})())`);
let r = await zet(40, 1000); console.log(JSON.stringify(r)); ok(r.blokken===3 && !r.dubbel && r.maxPt===40, 'rail past: 3 blokken, elke driver een eigen punt');
r = await zet(40, 545); console.log(JSON.stringify(r)); ok(r.blokken===2 && r.dubbel===4 && r.maxPt===36 && r.dubbelePunten===4 && r.draden===40, 'rail past niet: samengevoegd tot 2 blokken, 4 punten met 2 drivers');
r = await zet(20, 300); console.log(JSON.stringify(r)); ok(r.blokken===1 && r.dubbel===2, '20 drivers op smalle plaat: 1 blok, 2 dubbele punten');
r = await zet(10, 300); ok(r.blokken===1 && !r.dubbel, '10 drivers: niets samengevoegd');
ok(errs.length===0, 'geen JS-fouten '+errs.join(' | '));
await b.close();
