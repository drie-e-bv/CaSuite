// test-extensie.js — de echte Chrome-extensie (uitgepakt geladen) op nagebootste webshops,
// doorgestuurd naar CaSuite (index.html met in-memory Supabase op het echte CaSuite-adres).
const path = require('path'); const fs = require('fs'); const os = require('os');
const { chromium } = require('playwright');
const EXT = '/home/claude/casuite/extensie/casuite-mand';
const t = fs.readFileSync(path.join(__dirname, 'test-materialen.js'), 'utf8');
const MOCK_EXTRA = eval(t.match(/const MOCK_EXTRA = (`[\s\S]*?`);/)[1]);
const mockSrc = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf-8').replace(/module\.exports[^\n]*\n?/g, '');
const XLSXJS = fs.readFileSync(path.join(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const LEV = [
  { id: 'lev-rexel', code: 'rexel', naam: 'Rexel', webshop_url: 'https://netstore.rexel.be/', domeinen: ['rexel.be'], actief: true, volgorde: 1, oci_parameters: [] },
  { id: 'lev-bol', code: 'bol', naam: 'bol.com', webshop_url: 'https://www.bol.com/be/nl/', domeinen: ['bol.com'], actief: true, volgorde: 6, oci_parameters: [] }
];
const SEED = { __session: { user: { email: 'peter@casentis.be' } }, bedrijf: [{ id: 1, naam: 'Casentis', team_leden: [{ id: 'tl-p', naam: 'Peter', email: 'peter@casentis.be', rol: 'Zaakvoerder', planning_actief: true }], bureau: [] }],
  projecten: [], verslagen: [], verslagpunten: [], planning_items: [], planning_notities: [], uren_registraties: [], project_notities: [], project_elektro_dossiers: [], project_cacalc_data: [],
  elektro_catalogus_armaturen: [], elektro_catalogus_drivers: [], leveranciers: LEV, artikelen: [], leverancier_artikelen: [], prijsregistraties: [], imports: [], import_regels: [], oci_sessies: [] };

const BOL = `<!doctype html><html><head><title>Winkelwagentje | bol</title></head><body>
<header><input type="search" placeholder="Zoeken"><select name="qty-header"><option>1</option></select></header>
<main><h1>Winkelwagentje</h1>
 <div class="basket-item"><img alt="Brennenstuhl stekkerdoos 6-voudig"><div><a href="/be/nl/p/brennenstuhl-stekkerdoos/9300000012345/" class="title">Brennenstuhl Eco-Line stekkerdoos 6-voudig 1,5m wit</a>
   <div>Verkoop door bol</div><div>EAN: 4007123620005</div></div>
   <select name="quantity" aria-label="Aantal"><option>1</option><option selected>2</option></select>
   <div class="price"><s>€ 15,99</s> <span>€ 12,49</span></div><div class="total">€ 24,98</div><a href="#">Verwijderen</a></div>
 <div class="basket-item"><a href="/be/nl/p/wago-221/9200000099/" class="title">WAGO 221-413 lasklemmen 50 stuks</a>
   <select name="quantity" aria-label="Aantal"><option selected>1</option></select>
   <div class="price">€ 18,95</div></div>
 <section class="aanraders"><h2>Misschien ook iets voor jou</h2><div><a href="/p/x">Kabelbinders</a> € 4,99</div><div><a href="/p/y">Isolatietape</a> € 2,49</div></section>
 <p>Totaal (incl. btw) € 43,93</p></main></body></html>`;
const REXEL = `<!doctype html><html><head><title>Netstore - Winkelmand</title></head><body>
<h1>Winkelmand</h1><p>Prijzen excl. btw</p>
<table class="cart"><thead><tr><th>Artikel</th><th>Omschrijving</th><th>Aantal</th><th>Brutoprijs</th><th>Korting</th><th>Nettoprijs</th><th>Totaal</th></tr></thead><tbody>
<tr><td>Art.nr: 1234567</td><td><a href="/p/1234567">HAGER MCN516 Automaat C16 1P+N 6kA</a><br>Merk: Hager<br>EAN 3250612240190</td><td><input name="qty_1" value="4"></td><td>€ 12,50</td><td>40 %</td><td>€ 7,50</td><td>€ 30,00</td></tr>
<tr><td>Art.nr: 7654321</td><td><a href="/p/7654321">WAGO 221-413 verbindingsklem</a><br>Merk: WAGO</td><td><input name="qty_2" value="100"></td><td>€ 0,52</td><td>27 %</td><td>€ 0,38</td><td>€ 38,00</td></tr>
</tbody></table><p>Totaal excl. btw: € 68,00</p></body></html>`;
const LEEG = `<!doctype html><html><body><h1>Welkom bij Rexel</h1><p>Uw mandje is leeg.</p></body></html>`;

const res = []; const check = (n, ok) => res.push({ n, ok: !!ok });
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-'));
  const ctx = await chromium.launchPersistentContext(dir, {
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1300, height: 860 }
  });
  const fouten = [];
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if(u.startsWith('https://drie-e-bv.github.io/CaSuite/index.html')) return r.fulfill({ body: INDEX, contentType: 'text/html; charset=utf-8' });
    if(u.startsWith('https://drie-e-bv.github.io/CaSuite/sw.js')) return r.fulfill({ status: 404, body: '' });
    if(u.includes('supabase.js')) return r.fulfill({ contentType: 'application/javascript', body: '' });
    if(u.includes('xlsx')) return r.fulfill({ contentType: 'application/javascript', body: XLSXJS });
    if(u.includes('jspdf')) return r.fulfill({ contentType: 'application/javascript', body: 'window.jspdf={jsPDF:function(){}};' });
    if(u.includes('pdf.min.js')) return r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib={GlobalWorkerOptions:{}};' });
    if(u.includes('jszip')) return r.fulfill({ contentType: 'application/javascript', body: 'window.JSZip=function(){};' });
    if(u.startsWith('https://www.bol.com/be/nl/basket')) return r.fulfill({ body: BOL, contentType: 'text/html; charset=utf-8' });
    if(u.startsWith('https://netstore.rexel.be/cart')) return r.fulfill({ body: REXEL, contentType: 'text/html; charset=utf-8' });
    if(u.startsWith('https://netstore.rexel.be/')) return r.fulfill({ body: LEEG, contentType: 'text/html; charset=utf-8' });
    return r.fulfill({ status: 404, body: '' });
  });
  await ctx.addInitScript({ content: `if(location.host === 'drie-e-bv.github.io'){ ${mockSrc} ${MOCK_EXTRA} window.supabase={createClient:function(){window.__mockClient=matUitbreiden(createMockSupabase(${JSON.stringify(SEED)}));return window.__mockClient;}}; }` });
  let [sw] = ctx.serviceWorkers(); if(!sw) sw = await ctx.waitForEvent('serviceworker');
  check('0. extensie geladen (service worker actief)', sw.url().includes('background.js'));

  const cs = await ctx.newPage(); cs.on('pageerror', e => fouten.push(e.message)); cs.on('dialog', d => d.accept());
  await cs.goto('https://drie-e-bv.github.io/CaSuite/index.html'); await cs.waitForTimeout(1200);
  const ch = cs.locator('#btn-startup-verslag'); if(await ch.isVisible().catch(() => false)) await ch.click();
  await cs.click('#main-nav-btn-materialen'); await cs.waitForTimeout(500);
  await cs.click('#mat-btn-importeren'); await cs.waitForTimeout(200);
  check('1. CaSuite ziet de extensie', (await cs.locator('#mat-import-body').innerText()).includes('is actief'));
  await cs.click('#mat-import-sluit');

  // 2. Rexel: lege pagina -> melding, geen import
  const rx = await ctx.newPage();
  await rx.goto('https://netstore.rexel.be/'); await rx.waitForTimeout(500);
  const knopRx = rx.locator('#casuite-mand-knop');
  check('2. knop "Mand ophalen" op Rexel', await knopRx.count() === 1);
  await knopRx.click({ position: { x: 40, y: 20 } }); await rx.waitForTimeout(500);
  check('2. lege pagina: geen import naar CaSuite', (await cs.evaluate(() => window.__mockClient.__db.imports.length)) === 0);
  // 3. Rexel-mandje (tabel) -> CaSuite
  await rx.goto('https://netstore.rexel.be/cart'); await rx.waitForTimeout(500);
  await rx.locator('#casuite-mand-knop').click({ position: { x: 40, y: 20 } }); await cs.waitForTimeout(1500);
  await rx.screenshot({ path: path.join(__dirname, 's-rx.png') }); console.log('IMPORTS', JSON.stringify(await cs.evaluate(() => window.__mockClient.__db.imports)));
  const regels = await cs.evaluate(() => window.__mockClient.__db.import_regels);
  const h = regels.find(r => r.artikelnr === '1234567') || {};
  check('3. Rexel: 2 regels in de importlijst', regels.length === 2);
  check('3. Rexel: artikelnr, merk, EAN, aantal 4, netto 7,50, bruto 12,50, korting 40', h.merk === 'Hager' && h.ean === '3250612240190' && Number(h.aantal) === 4 && Number(h.netto) === 7.5 && Number(h.bruto) === 12.5 && Number(h.korting_pct) === 40);
  check('3. Rexel: omschrijving uit de productlink', (h.omschrijving || '').startsWith('HAGER MCN516'));
  check('3. CaSuite toont de importlijst', await cs.locator('#mat-review-modal').isVisible());
  console.log('REXEL', JSON.stringify(regels.map(r => [r.artikelnr, r.omschrijving, r.merk, r.ean, r.aantal, r.bruto, r.korting_pct, r.netto])));
  await cs.click('#mat-review-importeer'); await cs.waitForTimeout(800);
  check('3. na Importeren: Rexel-tabblad gesloten', rx.isClosed());
  check('3. 2 artikels in de databank', (await cs.evaluate(() => window.__mockClient.__db.artikelen.length)) === 2);

  // 4. bol.com: div-mandje met select, doorstreepte prijs en aanbevelingen
  const bol = await ctx.newPage();
  await bol.goto('https://www.bol.com/be/nl/basket/'); await bol.waitForTimeout(500);
  await bol.locator('#casuite-mand-knop').click({ position: { x: 40, y: 20 } }); await cs.waitForTimeout(1500);
  const br = (await cs.evaluate(() => window.__mockClient.__db.import_regels)).slice(2);
  console.log('BOL', JSON.stringify(br.map(r => [r.omschrijving, r.ean, r.aantal, r.bruto, r.netto, r.prijs_incl, r.btw_pct, r.url])));
  const st = br.find(r => (r.omschrijving || '').includes('Brennenstuhl')) || {};
  check('4. bol.com: 2 regels (aanbevelingen genegeerd)', br.length === 2);
  check('4. bol.com: aantal 2, eenheidsprijs 12,49 incl. -> netto excl. 10,32', Number(st.aantal) === 2 && Number(st.prijs_incl) === 12.49 && Math.abs(Number(st.netto) - 10.3223) < 0.001 && Number(st.btw_pct) === 21);
  check('4. bol.com: EAN en productlink', st.ean === '4007123620005' && (st.url || '').includes('9300000012345'));
  check('4. bol.com: WAGO-regel 18,95 incl.', br.some(r => (r.omschrijving || '').startsWith('WAGO') && Number(r.prijs_incl) === 18.95));
  check('5. geen paginafouten in CaSuite', fouten.length === 0);
  if(fouten.length) console.log(fouten);
  await cs.screenshot({ path: path.join(__dirname, 's-ext-bol.png') });
  await ctx.close();
  res.forEach(r => console.log((r.ok ? 'OK   — ' : 'FAIL — ') + r.n));
  console.log(`\n${res.length} controles, ${res.filter(r => r.ok).length} OK`);
})().catch(e => { res.forEach(r => console.log((r.ok ? 'OK   — ' : 'FAIL — ') + r.n)); console.error(e.message.slice(0,200)); process.exit(2); });
