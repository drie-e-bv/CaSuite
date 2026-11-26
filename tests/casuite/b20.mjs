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
await p.waitForSelector('#kv-modal'); await p.evaluate(()=>document.querySelector('#kv-modal .kv-annul')?.click()); await p.waitForTimeout(800);
// 1. volgorde stappenbalk + geen ⇄/↻
const st = await p.evaluate(()=> [...document.querySelectorAll('.dv-stap, [data-stap]')].map(x=>x.dataset.stap||x.textContent.trim().slice(0,20)));
// J7
ok(await E("azLijstMetStroom().filter(x=> x.soort==='Kring').every(x=> !alleDrivers().some(d=> d.kringId===x.obj.id) && !state.verlichting.items.some(v=> v.kringId===x.obj.id))"), 'J7: geen kringen die enkel drivers/lichtpunten groeperen');
// C
await E("selectTab('driverkast')"); await p.waitForTimeout(1200);
const nk = await p.$$eval('#dkKeuze button[data-k]', bs=> bs.length);
const nCards = await p.$$eval('#dkKastenwrap .kast-card', cs=> cs.length);
ok(nk>=2 && nCards===1, `C: 1 kast zichtbaar (${nCards} kaart, ${nk} keuzes)`);
await p.click('#dkKeuze button[data-k="__alle"]'); await p.waitForTimeout(800);
ok((await p.$$eval('#dkKastenwrap .kast-card', cs=> cs.length))>1, 'C: Alle kasten');
// D
await p.click('#dkKeuze button[data-w="tabel"]'); await p.waitForTimeout(800);
const kop = await p.$$eval('.dk-tabel th', t=> t.map(x=>x.textContent.replace(/[▲▼]/g,'').trim()).join('|'));
ok(kop==='Driverkast|Kabelnummer|Kamer|Driver|Armatuur 1|Armatuur extra' && (await p.$$('.dk-tabel tbody tr')).length>10, 'D: tabel '+kop);
await p.click('.dk-tabel th[data-s="kamer"]'); await p.waitForTimeout(400);
ok(/Kamer ▲/.test(await p.$eval('.dk-tabel th[data-s="kamer"]', t=>t.textContent)), 'D: sorteren');
await p.click('#dkKeuze button[data-w="blok"]'); await p.waitForTimeout(600);
// B
const k0 = await p.$eval('#dkKeuze button[data-k]:not([data-k="__alle"])', b=> b.dataset.k);
await p.click(`#dkKeuze button[data-k="${k0}"]`); await p.waitForTimeout(800);
const did = await p.$eval('#dkKastenwrap .rackitem.cat-driver', b=> b.dataset.id);
const doel = await p.$eval(`.rackitem[data-id="${did}"] .rb-kast`, s=> [...s.options].map(o=>o.value).find(v=> v!==s.value));
await p.selectOption(`.rackitem[data-id="${did}"] .rb-kast`, doel); await p.waitForTimeout(800);
ok(await E("dkVirtVan(alleDrivers().find(d=>d.id===A[0])).id===A[1]", [did, doel]), 'B: driver naar andere kast');
// A: splitsen + samenvoegen
const sa = await E(`(()=>{ const dk = dkFysiekeKasten()[0]; dkVulIndeling(dk, true); const n0 = dkFysiekeKasten().length; const nw = dkSplits(dk); const n1 = dkFysiekeKasten().length; const lijstId = nw && nw.id; dkSamenvoegen(dkFysiekeKasten().find(v=>v.id===lijstId)); const n2 = dkFysiekeKasten().length; return [n0,n1,n2, dkDrivers(dkFysiekeKasten()[0]).length]; })()`);
ok(sa[1]===sa[0]+1 && sa[2]===sa[0], 'A: splitsen en terug samenvoegen '+JSON.stringify(sa));
// A in Lijst: gesplitst deel = aparte keuze
const sl = await E(`(()=>{ const dk = dkFysiekeKasten()[0]; dkVulIndeling(dk, true); const nw = dkSplits(dk); selectTab('driverkast'); return nw.id; })()`); await p.waitForTimeout(1000);
ok(!!(await p.$(`#dkKeuze button[data-k="${sl}"]`)), 'A: gesplitst deel als aparte kast in Lijst');
await p.click(`#dkKeuze button[data-k="${sl}"]`); await p.waitForTimeout(800);
const zicht = await p.$$eval('#dkKastenwrap .rackitem.cat-driver', bs=> bs.filter(b=> b.offsetParent).map(b=>b.dataset.id));
ok(await E("A.every(id=> dkFysiekeKasten().find(v=>v.id===B).items.some(d=>d.id===id)) && A.length===dkDrivers(dkFysiekeKasten().find(v=>v.id===B)).length".replace(/A\b/g,'A[0]').replace(/B\b/g,'A[1]'), [zicht, sl]), 'A: enkel drivers van het deel zichtbaar ('+zicht.length+')');
await E("selectTab('driverplan')"); await p.waitForTimeout(2500);
ok(!!(await p.$('.dk-samen')), 'A: knop Terug samenvoegen in Plan');
await p.screenshot({path:'/tmp/b20-plan.png'});
const fres = await E(`(()=>{ const dk = dkFysiekeKasten()[0]; dkVulIndeling(dk, true); const p = dkPlan(dk);
  const L0 = dkPlanKast(dk)._layout; const kv = L0.kokers.filter(k=> k.soort!=='h'); if(!kv.length) return 'geen vkoker';
  const id = kv[0].id; const x0 = kv[0].x0 !== undefined ? kv[0].x0 : kv[0].x;
  p.kokerSpatie = {}; p.kokerSpatie[id] = {l: 20, r: 20};
  const L1 = dkPlanKast(dk)._layout; const nodig1 = L1.breedteNodig;
  delete p.kokerSpatie[id];
  const nodig0 = dkPlanKast(dk)._layout.breedteNodig;
  return {id, nodig0, nodig1};
})()`);
console.log('F', JSON.stringify(fres));
ok(fres.nodig1 - fres.nodig0 === 32, 'F: eigen spatie per koker (+16 links/+16 rechts)');
console.log('errors', errs.length ? errs.join(' | ') : 'geen');
await b.close();
