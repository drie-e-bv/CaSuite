// Vereist een testkopie van index.html met 'window.__cdEval = (c)=> eval(c);' vóór 'function vlAantal(item){', geserveerd op poort 8790, en stub3.js in de cwd. (Verwachting garage-lichtpunten is te streng: k57->k20 samenvoegen is correct gedrag.)
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
const r = await E(`(()=>{
  state.kamerVerdieping = {"Slaapkamer 1":"V1","Garage":"G","Tuin":"B"};
  const kast = state.zekeringen.kasten[0]; const rij = kast.rijen[0];
  const A = (id,naam)=>({id, categorie:'Automaat', naam, A:'16A', polen:'2P', breedte:1});
  rij.items.push(A('aDV','VERLICHTING DALI 230V VERDIEP'), A('aDG','VERLICHTING DALI 230V GELIJKVLOERS'), A('aSV','SCHAKELACTOR VERLICHTING'),
    A('aKV','KASTVERLICHTING VERDIEP'), A('aKG','KASTVERLICHTING GELIJKVLOERS'), A('aST','STOPCONTACTEN TUIN'), A('aDK','DRIVERKAST 1'));
  const K = (id,kamer,info)=>({id, kamer, info, leeg:false, manueelNummer:'', zekeringModuleId:''});
  state.kringen.items = [K('k28','Slaapkamer 1','Spots 350mA 15W (6 drivers)'), K('k66','Slaapkamer 1','Spots 350mA 15W (6 drivers)'),
    K('k30','Slaapkamer 1','Stopcontact geschakeld (2×)'), K('k69','Slaapkamer 1','Stopcontact geschakeld (2×)'),
    K('k68','Slaapkamer 1','Kastverlichting'), K('k20','Garage','Lichtpunt 230V (3×)'), K('k57','Garage','Lichtpunt 230V (3×)'),
    K('kT','Tuin','Stopcontacten Tuin (2)')];
  state.knoppen.items = [{id:'kn1', kamer:'Slaapkamer 1', type:'Drukknop', leeg:false, gangen:[{kringId:'k28'},{kringId:'k66'},{kringId:'k30'}]},
                         {id:'kn2', kamer:'Garage', type:'Drukknop', leeg:false, gangen:[{kringId:'k20'},{kringId:'k57'}]}];
  const dk = state.driverkast.kasten[0] || (state.driverkast.kasten.push({id:'dk1', items:[], plan:{}}), state.driverkast.kasten[0]);
  dk.plan = dk.plan || {}; dk.plan.voedingZek = 'aDK';
  dk.items = [1,2,3,4,5].map(i=>({...newDriverItem(), type:'Spots 350mA 15W', kringId:'k28'}));
  state.modules.verlichting = true;
  state.verlichting.items = [{...newVerlichtingItem(), naam:'Armatuur', kamer:'Garage', kringId:'k20', aansluiting:'dali'},
                             {...newVerlichtingItem(), naam:'Armatuur', kamer:'Garage', kringId:'', aansluiting:'schakelcontact'}];
  const hv = dkKringHerstelVoorstel();
  const kv = kvBereken().filter(x=> x.soort.startsWith('Kringen'));
  return JSON.stringify({dubbel: hv.dubbel.map(x=> x.weg.id+'->'+x.naar.id), leeg: hv.leeg.map(k=>k.id), kv: kv.map(x=>x.tekst)});
})()`);
console.log(r);
const j = JSON.parse(r);
ok(j.dubbel.includes('k66->k28'), 'dubbele spotskring aan knop -> naar kring met drivers');
ok(j.dubbel.includes('k69->k30'), 'ongebruikte kopie stopcontact geschakeld weg');
ok(!j.dubbel.some(x=>x.startsWith('k20')||x.startsWith('k57')), 'garage-lichtpunten (beide aan knop, geen drivers): niet raken'); 
ok(j.kv.some(t=>/k68|Kastverlichting.*KASTVERLICHTING VERDIEP/.test(t)), 'kastverlichting slpk1 -> KASTVERLICHTING VERDIEP');
ok(j.kv.some(t=>/Stopcontacten Tuin.*STOPCONTACTEN TUIN/.test(t)), 'Stopcontacten Tuin -> STOPCONTACTEN TUIN');
ok(j.kv.some(t=>/Garage Lichtpunt 230V.*VERLICHTING DALI 230V GELIJKVLOERS/.test(t)), 'lichtpunt-kring met DALI -> DALI 230V GELIJKVLOERS');
ok(j.kv.some(t=>/lichtpunt .*Garage.*SCHAKELACTOR VERLICHTING/.test(t)), 'los lichtpunt schakelcontact -> SCHAKELACTOR VERLICHTING');
ok(!j.kv.some(t=>/geschakeld/i.test(t)), 'geschakeld zonder passende automaat: geen gok');
// toepassen
const n = await E(`(()=>{ dkKringHerstel(); kvBereken().filter(x=> x.soort.startsWith('Kringen')).forEach(x=>x.doe());
  return JSON.stringify({kringen: state.kringen.items.map(k=>k.id).join(','), kn1: state.knoppen.items[0].gangen.map(g=>g.kringId).join(','),
   open: azLijstMetStroom().filter(x=> !azKetenRond(x.obj)).map(x=> x.code+' '+x.naam+' '+(x.obj.kamer||'')) }); })()`);
console.log(n);
const m = JSON.parse(n);
ok(!m.kringen.includes('k66') && !m.kringen.includes('k69'), 'kopieën weg');
ok(m.kn1==='k28,k28,k30', 'knop wijst nu naar k28');
await E(`selectTab('koppelen')`); await p.waitForTimeout(600);
ok(errs.length===0, 'geen JS-fouten '+errs.join(' | '));
await b.close();
