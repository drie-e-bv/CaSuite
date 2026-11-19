// Test "Offerte inlezen" (CaDos, 19/11/2026).
// Vereist: Playwright in /opt/npm-tools/node_modules/playwright, Chrome in /usr/bin/google-chrome,
// pdfjs-dist@3.5.141 (pdf.min.js + pdf.worker.min.js) in PDFJS_DIR, en een server op poort 8771 in de map met de
// te testen index.html (python3 -m http.server 8771). De offerte-PDF's staan NIET in de repo (klantgegevens):
// geef de map mee als OFFERTES_DIR. Gebruik: OFFERTES_DIR=... PDFJS_DIR=... node test-offerte.mjs
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const HIER = path.dirname(fileURLToPath(import.meta.url));
const OFF = process.env.OFFERTES_DIR || '.', PDFJS = process.env.PDFJS_DIR || '.';
const VERWACHT = { // aantallen per onderdeel, gecontroleerd op 19/11/2026
  '2600124': {posten:338, kamers:21, kringen:47, driverkast:96, verlichting:22, knoppen:47, muziek:5, verwarming:1, motoren:18, alarm:73, laadpalen:1, zonnepanelen:1, data:7, zekeringen:40, nietHerkend:0},
  '2600130': {posten:558, kamers:32, kringen:77, driverkast:176, verlichting:54, knoppen:77, muziek:12, verwarming:19, motoren:49, alarm:78, laadpalen:3, zonnepanelen:0, data:14, zekeringen:80, nietHerkend:1},
  '2600139': {posten:385, kamers:24, kringen:56, driverkast:141, verlichting:24, knoppen:48, muziek:0, verwarming:21, motoren:2, alarm:40, laadpalen:1, zonnepanelen:0, data:4, zekeringen:37, nietHerkend:0},
};
let fout = 0; const ok = (c, m)=>{ console.log((c?'  ok   ':'  FOUT ')+m); if(!c) fout++; };
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome', args:['--no-sandbox']});
const p = await b.newPage({viewport:{width:1300, height:950}}); const errs = [];
p.on('pageerror', e=> errs.push(e.message));
await p.route(/^https?:\/\/(?!localhost)/, r=>{ const u = r.request().url();
  if(/supabase/.test(u)) return r.fulfill({path:path.join(HIER,'stub-supabase.js'), contentType:'text/javascript'});
  if(/pdf\.worker/.test(u)) return r.fulfill({path:path.join(PDFJS,'pdf.worker.min.js'), contentType:'text/javascript'});
  if(/pdf\.min\.js/.test(u)) return r.fulfill({path:path.join(PDFJS,'pdf.min.js'), contentType:'text/javascript'});
  return r.fulfill({body:'', contentType:'text/javascript'}); });
await p.goto('http://localhost:8771/index.html'); await p.waitForTimeout(2500);
const pdfs = fs.readdirSync(OFF).filter(f=>/Offerte_\d+.*\.pdf$/i.test(f));
console.log('1. Lezen + vertalen ('+pdfs.length+' offertes)');
for(const f of pdfs){
  const nr = f.match(/Offerte_(\d+)/)[1]; const v = VERWACHT[nr];
  const r = await p.evaluate(async b64=>{ const buf = Uint8Array.from(atob(b64), c=>c.charCodeAt(0)).buffer;
    const off = await CaDosApp.offerte.lees(buf); const V = CaDosApp.offerte.voorstel(off);
    const o = Object.fromEntries(Object.entries(V.onderdelen).map(([k,x])=>[k,x.aantal]));
    return Object.assign(o, {posten:off.posten.length, nietHerkend:V.nietHerkend.length, nummer:off.kop.nummer, kamersLijst:V.kamers}); }, fs.readFileSync(path.join(OFF,f)).toString('base64'));
  ok(r.nummer===nr, f+': offertenummer '+r.nummer);
  ok(!r.kamersLijst.some(k=>/È/.test(k)), f+': geen "È" in kamernamen');
  if(v) Object.entries(v).forEach(([k,n])=> ok(r[k]===n, f+': '+k+' = '+r[k]+(r[k]===n?'':' (verwacht '+n+')')));
}
console.log('2. Venster: dossier aanmaken uit offerte, deelimport, waarschuwing, ongedaan maken');
const PDF = pdfs.find(f=>/2600124/.test(f)) || pdfs[0];
await p.click('#main-nav-btn-cados'); await p.waitForTimeout(500);
await p.locator('#cados-proj-list >> text=Leeg project').first().click(); await p.waitForTimeout(800);
let [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#cados-aanmaken-offerte-btn')]);
await fc.setFiles(path.join(OFF, PDF));
await p.waitForSelector('#of-modal summary input', {timeout:15000});
await p.evaluate(()=> document.querySelectorAll('#of-modal summary input').forEach(cb=>{ cb.checked = ['kamers','driverkast','verlichting','laadpalen'].includes(cb.dataset.key); }));
await p.click('#of-modal #of-ok'); await p.waitForSelector('#of-modal #of-undo'); await p.click('#of-modal #of-ok'); await p.waitForTimeout(1200);
let d = await p.evaluate(()=> __DB.project_elektro_dossiers.find(r=>r.project_id==='p2').data);
ok(d.kringen.items.length===0, 'deelimport: geen kringen');
ok(d.driverkast.kasten[0].items.length>0 && d.driverkast.kasten[0].items.every(x=>!x.kringId), 'deelimport: drivers zonder verwijzing naar niet-overgenomen kring');
ok(d.laadpalen.items.every(l=>!l.zekeringModuleId && !l.patchpaneelPoortId), 'deelimport: laadpaal zonder verwijzing naar niet-overgenomen automaat/poort');
ok((d.offerteImports||[]).length===1, 'import wordt bijgehouden in offerteImports');
[fc] = await Promise.all([p.waitForEvent("filechooser"), p.click("#btnOfferte", {force:true})]);
await fc.setFiles(path.join(OFF, PDF)); await p.waitForSelector('#of-modal summary input', {timeout:15000});
ok(await p.evaluate(()=> !!document.querySelector('#of-modal .of-waarsch')), 'tweede keer dezelfde offerte: waarschuwing');
const voor = JSON.stringify(d);
await p.click('#of-modal #of-ok'); await p.waitForSelector('#of-modal #of-undo'); await p.waitForTimeout(900);
const na = await p.evaluate(()=> __DB.project_elektro_dossiers.find(r=>r.project_id==='p2').data.kringen.items.length);
ok(na>0, 'volledige import: '+na+' kringen');
ok(await p.evaluate(()=> __DB.dossier_backups.length)===2, 'back-up in dossier_backups vóór elke import (2)');
await p.click('#of-modal #of-undo'); await p.waitForTimeout(1500);
d = await p.evaluate(()=> __DB.project_elektro_dossiers.find(r=>r.project_id==='p2').data);
ok(JSON.stringify(d)===voor, 'ongedaan maken zet het dossier exact terug');
const ids = new Set(); JSON.stringify(d, (k,v)=>{ if(k==='id') ids.add(v); return v; });
const kapot = []; JSON.stringify(d, (k,v)=>{ if(/Id$/.test(k) && typeof v==='string' && v && !ids.has(v)) kapot.push(k); return v; });
ok(kapot.length===0, 'geen kapotte verwijzingen');
ok(errs.length===0, 'geen paginafouten'+(errs.length?': '+errs.join(' | '):''));
await b.close();
console.log(fout ? fout+' FOUT(EN)' : 'ALLES OK'); process.exit(fout?1:0);
