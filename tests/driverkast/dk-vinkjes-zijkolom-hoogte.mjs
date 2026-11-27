// Vereist een testkopie van index.html met 'window.__cdEval = (c)=> eval(c); window.__uvSel = ()=> uvSelMod;' vóór 'function vlAantal(item){', geserveerd op poort 8790, en stub3.js in de cwd.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1880,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
const E=(c)=> p.evaluate((c)=> window.__cdEval(c), c);
const ok=(c,m)=>console.log((c?'OK  ':'FOUT')+' '+m);
await p.goto('http://localhost:8790/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(600);
await E(`(()=>{
  document.getElementById('cados-project-hint-card').style.display='none'; document.getElementById('cados-app-wrap').style.display='';
  state.modules.driverkast = true;
  const mk = (n, kamer)=>{ const k = newDriverKast(); k.sturing='DALI'; k.kamer=kamer; for(let i=0;i<n;i++){ const d = newDriverItem(); d.naam='TCI maxi jolly US dali 500'; d.armaturen=[{id:cryptoId(), naam:'Prado', aantal:2, ruimte:kamer}]; k.items.push(d);} return k; };
  state.driverkast.kasten = [mk(8,'Living'), mk(8,'Master')];
  save(); return 1; })()`);
// splits ontwerpkast 1: 3 drivers naar een nieuwe kast
await E(`(()=>{ const v = dkFysiekeKasten()[0]; const ds = v.items.slice(5); let doel=null; ds.forEach(d=>{ const r = dkNaarKast(dkFysiekeKasten()[0], d, doel); doel = doel || (dkFysiekeKasten()[1]||{}).id; }); dkHuidigId = dkFysiekeKasten()[0].id; dkOverzicht=false; save(); selectTab('driverplan'); return dkFysiekeKasten().map(k=>k.items.length).join(','); })()`).then(x=>console.log('kasten', x));
await p.waitForTimeout(1500);
const vinks = async ()=> p.evaluate(()=> [...document.querySelectorAll('#panel-driverplan .uv-kastvink input')].map(i=>i.checked));
console.log('vinks', JSON.stringify(await vinks()));
const zicht = async ()=> E(`(()=> JSON.stringify({ov: dkOverzicht, sel: dkAlleSel ? [...dkAlleSel].length : null, titels: [...document.querySelectorAll('#panel-driverplan .dk-kasttitel')].map(t=>t.textContent)}))()`);
for(const i of [1,2,3]){
  const inp = (await p.$$('#panel-driverplan .uv-kastvink button'))[i]; if(!inp) break;
  await inp.click(); await p.waitForTimeout(1200);
  console.log('na klik', i, JSON.stringify(await vinks()), await zicht());
}
await p.screenshot({path:'/tmp/dk_vink.png'});
// in overzicht een driver aantikken
const tik = async (lbl)=>{ const did = await E(`dkDrivers(dkFysiekeKasten()[0])[0].id`); const m = await p.$('#panel-driverplan .uv-mod[data-mod="'+did+'"]'); if(!m){ console.log(lbl,'geen mod'); return; } const bb = await m.boundingBox(); await p.mouse.click(bb.x+bb.width/2, bb.y+bb.height/2); await p.waitForTimeout(800);
  console.log(lbl, JSON.stringify(await p.evaluate(()=>({sel: window.__uvSel(), det: (document.querySelector('#uvDetail')||{}).textContent.slice(0,80), dicht: document.querySelector('.uv-werk').classList.contains('zij-dicht')})))); };
await tik('overzicht');
await E(`(()=>{ dkOverzicht=false; dkAlleSel=null; selectTab('driverplan'); return 1; })()`); await p.waitForTimeout(1200);
await tik('enkel');
const det = await p.evaluate(()=> document.querySelector('#uvDetail').textContent.includes('Onderaan') || document.querySelector('#uvDetail').textContent.includes('Terug'));
ok(det, 'driver aangetikt: instellingen in de zijkolom');
await p.click('#panel-driverplan .uv-zoom-breedte'); await p.waitForTimeout(800);
const hh = await p.evaluate(()=>({box: document.querySelector('#panel-driverplan .uv-canvas-box').offsetHeight, svg: +document.querySelector('#panel-driverplan .uv-canvas-wrap svg').getAttribute('height'), sc: document.querySelector('#panel-driverplan .uv-canvas-wrap').scrollHeight - document.querySelector('#panel-driverplan .uv-canvas-wrap').clientHeight}));
console.log('hoogte', JSON.stringify(hh)); ok(hh.box > 900 && hh.sc <= 2, 'Breedte: werkvlak zo lang als de tekening, geen eigen scrollbalk');
await p.click('#panel-driverplan .uv-zoom-kast'); await p.waitForTimeout(800);
const hk = await p.evaluate(()=> document.querySelector('#panel-driverplan .uv-canvas-box').offsetHeight); ok(hk < 900, 'Kast: past in het scherm ('+hk+')');
await p.screenshot({path:'/tmp/dk_breed.png'});
// lijst: gesplitste delen apart
await E(`(()=>{ dkOverzicht=true; dkAlleSel=null; selectTab('driverkast'); return 1; })()`); await p.waitForTimeout(1200);
const kaarten = await p.evaluate(()=> [...document.querySelectorAll('#panel-driverkast .rij-title')].map(t=>t.textContent.trim().slice(0,40)));
ok(kaarten.length===3, 'Lijst: 3 kaarten '+JSON.stringify(kaarten));
ok(errs.length===0, 'geen JS-fouten '+errs.join(' | '));
await b.close();
