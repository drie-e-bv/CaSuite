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
await p.waitForSelector('#kv-modal'); await p.click('#kv-modal .kv-annul'); await p.waitForTimeout(800);
// 1. volgorde stappenbalk + geen ⇄/↻
const st = await p.evaluate(()=> [...document.querySelectorAll('.dv-stap, [data-stap]')].map(x=>x.dataset.stap||x.textContent.trim().slice(0,20)));
console.log('stappen', JSON.stringify(st));
const txt = await p.evaluate(()=> (document.querySelector('.dv-stappen, #dvStappen, .dossierverloop')||document.body).innerText);
ok(txt.indexOf('Zekeringkast') < txt.indexOf('Driverkast'), 'Zekeringkast vóór Driverkast in Dossierverloop');
ok(!(await p.evaluate(()=> [...document.querySelectorAll('button')].some(b=> /^(⇄|↻)$/.test(b.textContent.trim())))), 'geen losse ⇄/↻ knoppen');
// 2. ZK weergaven
await p.click('#tabbar button[data-id="zekeringen"]'); await p.waitForTimeout(1200);
ok((await p.$$eval('.zk-weergaven button',bs=>bs.map(b=>b.textContent.trim().split(/\s/)[0]).join(','))).startsWith('Lijst,Plan,Uitvoering'), 'ZK Lijst→Plan→Uitvoering');
ok(!!(await p.$('.kast-werkbalk .zk-kamer')) && !!(await p.$('.kast-werkbalk .kast-maat')) && !!(await p.$('.kast-werkbalk #zkHerschik')), 'ZK compacte werkbalk bovenaan');
ok(!(await p.$('#zkKoppelen')), 'geen Koppelen in ZK werkbalk');
await p.click('#zkHerschik'); await p.waitForTimeout(500);
ok(!!(await p.$('.zkg-snel')), 'Snel opnieuw verdelen in Herschikken-venster');
await p.evaluate(()=>{ const m=document.getElementById('zkg-modal')||document.querySelector('.modal-overlay'); if(m) m.remove(); });
// geen print op Lijst / Plan
await p.click('.zk-weergaven button[data-w="uitvoering"]'); await p.waitForTimeout(1500);
ok(!(await p.$('#panel-uitvoering .uv-export, #panel-uitvoering .uv-afdruk')), 'ZK Plan: geen afdrukknop');
await p.click('.zk-weergaven button[data-w="zktekening"]'); await p.waitForTimeout(1500);
ok(!!(await p.$('.uv-afdruk')), 'ZK Uitvoering: afdrukknop');
await p.evaluate(()=>{ window.__pr=0; window.print=()=>{ window.__pr++; window.__html=document.getElementById('printExport').innerHTML; window.__css=(document.getElementById('uvAfdrukPagina')||{}).textContent; }; });
await p.click('.uv-afdruk'); await p.waitForSelector('#uv-afdruk-modal');
await p.selectOption('.uva-fmt','A4'); await p.click('.uva-ok'); await p.waitForTimeout(500);
const pr = await p.evaluate(()=>({n:window.__pr, css:window.__css, svg:/<svg/.test(window.__html), lijst:/Componentenlijst/.test(window.__html), rows:(window.__html.match(/<tr>/g)||[]).length}));
ok(pr.n===1 && /A4 landscape/.test(pr.css) && pr.svg && pr.lijst && pr.rows>3, 'ZK afdruk A4 met tekening + componentenlijst '+JSON.stringify(pr).slice(0,120));
// Driverkast
await p.click('#tabbar button[data-id="driverkast"]'); await p.waitForTimeout(1200);
ok((await p.$$eval('.zk-weergaven button',bs=>bs.map(b=>b.textContent.trim()).join(','))).startsWith('Lijst,Plan,Uitvoering'), 'DK Lijst→Plan→Uitvoering');
ok(!(await p.$('#exportDriverkast')), 'DK Lijst: geen export');
ok(!!(await p.$('.dk-kast-aut')) && !!(await p.$('.kast-kamer')) && !!(await p.$('.kast-verdieping')), 'DK per kast Kamer/Verdieping/Automaat');
ok((await p.$$('.rackitem .rb-aut')).length>0, 'DK per driver automaat-keuze');
// keten: kast-automaat zetten → drivers weg uit te koppelen
await E('(state.driverkast.kasten[0].items.forEach(d=>{ d.zekeringModuleId=""; d.kringId=""; }), [state.driverkast.kasten[0]].concat(state.driverkast.kasten[0].planDelen||[]).forEach(h=>{ delete dkPlan(h).voedingZek; }), selectTab("driverkast"))'); await p.waitForTimeout(800);
const voor = await E('azLijstMetStroom().filter(x=>x.soort==="Driver" && !azKetenRond(x.obj)).length');
const autId = await E('alleZekeringAutomaten()[0].id');
await p.selectOption('.dk-kast-aut >> nth=0', autId); await p.waitForTimeout(600);
const na = await E('azLijstMetStroom().filter(x=>x.soort==="Driver" && !azKetenRond(x.obj)).length');
ok(voor>0 && na<voor, `keten driver→kast→automaat: ${voor} → ${na}`);
ok(await E('dkPlan(state.driverkast.kasten[0]).voedingZek===A', autId), 'kast-automaat = plan.voedingZek');
// per driver automaat
const did = await p.$eval('.rackitem.cat-driver', x=>x.dataset.id);
await p.selectOption(`.rackitem[data-id="${did}"] .rb-aut`, autId); await p.waitForTimeout(500);
ok(await E('alleDrivers().find(x=>x.id===A[0]).zekeringModuleId===A[1]', [did,autId]), 'driver automaat opgeslagen');
// DK plan: geen print, uitvoering: wel
await p.click('.zk-weergaven button[data-w="driverplan"]'); await p.waitForTimeout(2500);
ok(!(await p.$('#panel-driverplan .uv-export, #panel-driverplan .uv-afdruk')), 'DK Plan: geen afdrukknop');
await p.click('.zk-weergaven button[data-w="dktekening"]'); await p.waitForTimeout(2500);
ok(!!(await p.$('.uv-afdruk')), 'DK Uitvoering: afdrukknop');
await p.evaluate(()=>{ window.__pr=0; window.print=()=>{ window.__pr++; window.__html=document.getElementById('printExport').innerHTML; window.__css=(document.getElementById('uvAfdrukPagina')||{}).textContent; }; });
await p.click('.uv-afdruk'); await p.waitForSelector('#uv-afdruk-modal'); await p.selectOption('.uva-fmt','A3'); await p.click('.uva-ok'); await p.waitForTimeout(500);
const pr2 = await p.evaluate(()=>({n:window.__pr, css:window.__css, svg:/<svg/.test(window.__html), lijst:/Componentenlijst/.test(window.__html), drv:/Driver/.test(window.__html)}));
ok(pr2.n===1 && /A3 landscape/.test(pr2.css) && pr2.svg && pr2.lijst, 'DK afdruk A3 '+JSON.stringify(pr2).slice(0,100));
await p.screenshot({path:'/tmp/b16-dktek.png'});
// 4. verplaatsen DK -> 230V -> DK
await p.click('.zk-weergaven button[data-w="driverkast"]'); await p.waitForTimeout(1200);
await p.screenshot({path:'/tmp/b16-dk.png'});
const nV0 = await E('state.verlichting.items.length'), nD0 = await E('alleDrivers().length');
await p.click(`.rackitem[data-id="${did}"] .rb-230`); await p.waitForTimeout(800);
const nV1 = await E('state.verlichting.items.length'), nD1 = await E('alleDrivers().length');
ok(nV1>nV0 && nD1===nD0-1, `driver → 230V (${nV0}→${nV1}, drivers ${nD0}→${nD1})`);
ok(await E('state.verlichting.items.slice(-1)[0].zekeringModuleId===A', autId), '230V houdt automaat');
await E("selectTab('verlichting')"); await p.waitForTimeout(1000);
const vid = await E('state.verlichting.items.slice(-1)[0].id');
ok(!!(await p.$(`.rackitem[data-id="${vid}"] .rb-naardk`)), '230V-lichtpunt heeft ↪ DK');
await p.click(`.rackitem[data-id="${vid}"] .rb-naardk`); await p.waitForTimeout(800);
ok(await E('!state.verlichting.items.some(x=>x.id===A[0]) && alleDrivers().some(d=> d.zekeringModuleId===A[1] && d.armaturen.length)', [vid,autId]), '230V → driverkast met automaat');
// 5. Koppelen pagina
await E("koppelOpen('lijst')"); await p.waitForTimeout(800);
ok(await E("currentTab==='koppelen' && !!document.querySelector('#kpSlot #az-modal') && getComputedStyle(document.querySelector('#az-modal')).position==='static'"), 'Koppelen = pagina met Open lijst');
await p.click('.kp-pagina-tabs button[data-t="voorstel"]'); await p.waitForTimeout(800);
ok(!!(await p.$('#kpSlot #kv-modal')), 'Koppelen › Voorstel in pagina');
await p.click('#kpSlot .kv-annul'); await p.waitForTimeout(600);
ok(await E("currentTab==='koppelen' && document.querySelector('#kpSlot').children.length===1"), 'na Annuleren blijft pagina staan');
await p.click('.kp-pagina-tabs button[data-t="lijst"]'); await p.waitForTimeout(800);
// 6. 230V via relais
const r6 = await E(`(function(){
  const v = state.verlichting.items.find(x=> !x.leeg); if(!v) return 'geen';
  let k = azKring(v.kringId); if(!k){ k = newKringItem(); state.kringen.items.push(k); v.kringId = k.id; }
  k.zekeringModuleId = ""; v.zekeringModuleId = "";
  const kast = state.zekeringen.kasten[0];
  const rel = {id:cryptoId(), categorie:"Relais", breedte:1, naam:"Test relais", uitgangen:[{id:cryptoId(), type:"kring", targetId:k.id}]};
  kast.rijen[kast.rijen.length-1].items.push(rel);
  const a1 = azKetenRond(v);
  rel.zekeringModuleId = alleZekeringAutomaten()[1].id;
  const a2 = azKetenRond(v);
  return [a1, a2, azKeten(v).via].join(',');
})()`);
ok(r6==='false,true,relais', 'keten 230V→relais→automaat: '+r6);
await E("selectTab('koppelen')"); await p.waitForTimeout(800);
ok(await E("[...document.querySelectorAll('#kpSlot tr[data-id]')].every(tr=>{ const o = azLijstMetStroom().find(x=>x.obj.id===tr.dataset.id); return o && !azKetenRond(o.obj); })"), 'Open lijst toont enkel onrond');
await p.screenshot({path:'/tmp/b16-kp.png'});
// stap Koppelen gaat naar pagina
await E("selectTab('zekeringen')"); await p.waitForTimeout(800);
console.log('errors', errs.length ? errs.join(' | ') : 'geen');
await b.close();
