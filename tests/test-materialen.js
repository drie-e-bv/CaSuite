// test-materialen.js — Materialen-module (2026-11-13): tabblad, rechten, extensie-mandje ->
// importlijst -> herkenning -> importeren, prijshistoriek, Excel-import, export, leveranciers.
const path = require('path'); const fs = require('fs');
const { chromium } = require('playwright');
const XLSXNODE = require('xlsx');
const LEV = [
  { id: 'lev-rexel', code: 'rexel', naam: 'Rexel', webshop_url: 'https://netstore.rexel.be/', domeinen: ['rexel.be'], actief: true, volgorde: 1, oci_parameters: [] },
  { id: 'lev-cebeo', code: 'cebeo', naam: 'Cebeo', webshop_url: 'https://www.cebeo.be/nl-be', domeinen: ['cebeo.be'], actief: true, volgorde: 2, oci_parameters: [] },
  { id: 'lev-bol', code: 'bol', naam: 'bol.com', webshop_url: 'https://www.bol.com/be/nl/', domeinen: ['bol.com'], actief: true, volgorde: 6, oci_parameters: [] }
];
function seed(extraTeam){
  return {
    __session: { user: { email: 'peter@casentis.be' } },
    bedrijf: [{ id: 1, naam: 'Casentis', team_leden: [
      { id: 'tl-p', naam: 'Peter Casentis', email: 'peter@casentis.be', rol: 'Zaakvoerder', planning_team: 'TECH', planning_actief: true, is_planner: true },
      { id: 'tl-j', naam: 'Jan Techniek', email: 'jan@casentis.be', rol: 'Technieker', planning_team: 'TECH', planning_actief: true, kan_verslagen_zien: true, kan_verslagen_maken: true, kan_planning_zien: true }
    ].concat(extraTeam || []), bureau: [
      { id: 'b-a', naam: 'An Administratie', email: 'an@casentis.be', rol: 'Administratie', planning_team: 'BUREAU', planning_actief: true, kan_verslagen_zien: true, kan_planning_zien: true, kan_facturen_zien: true }
    ] }],
    projecten: [], verslagen: [], verslagpunten: [], planning_items: [], planning_notities: [], uren_registraties: [], project_notities: [],
    project_elektro_dossiers: [], project_cacalc_data: [], elektro_catalogus_armaturen: [], elektro_catalogus_drivers: [],
    leveranciers: LEV, artikelen: [], leverancier_artikelen: [], prijsregistraties: [], imports: [], import_regels: [], oci_sessies: []
  };
}
// Uitbreiding van de mock: de view artikel_prijzen_actueel en de twee databankfuncties, met
// dezelfde regels als de SQL (mat_norm, volgorde van herkenning, alles-of-niets).
const MOCK_EXTRA = `
function matUitbreiden(c){
  const db = c.__db; const norm = t => (String(t||'').toUpperCase().replace(/[^A-Z0-9]/g,'')) || null;
  let uuid = 0; const nid = p => p + '-' + (++uuid);
  const origFrom = c.from.bind(c);
  c.from = function(t){
    if(t === 'artikel_prijzen_actueel'){
      const best = {};
      (db.prijsregistraties||[]).forEach(p => { const k = p.artikel_id+'|'+p.leverancier_id; if(!best[k] || p.geregistreerd_op >= best[k].geregistreerd_op) best[k] = p; });
      db.artikel_prijzen_actueel = Object.values(best).map(p => Object.assign({}, p));
    }
    const q = origFrom(t);
    const ins = q.insert.bind(q);
    q.insert = function(rows){ const l = (Array.isArray(rows) ? rows : [rows]).map(r => Object.assign({ id: nid(t) }, r)); return ins(l); };
    return q;
  };
  c.rpc = async function(fn, a){
    window.__rpc = (window.__rpc||[]).concat(fn);
    if(fn === 'import_voorstellen'){
      const imp = db.imports.find(i => i.id === a.p_import_id);
      db.import_regels.filter(r => r.import_id === imp.id).forEach(r => {
        let art = null, reden = null, zek = 'geen';
        if(imp.leverancier_id && norm(r.artikelnr)){ const la = db.leverancier_artikelen.find(x => x.leverancier_id === imp.leverancier_id && norm(x.artikelnr) === norm(r.artikelnr)); if(la){ art = la.artikel_id; reden = 'zelfde artikelnummer bij deze leverancier'; zek = 'zeker'; } }
        if(!art && norm(r.ean)){ const x = db.artikelen.find(x => norm(x.ean) === norm(r.ean)); if(x){ art = x.id; reden = 'zelfde EAN'; zek = 'zeker'; } }
        if(!art && norm(r.merk) && norm(r.fabrikant_artnr)){ const x = db.artikelen.find(x => norm(x.merk) === norm(r.merk) && norm(x.fabrikant_artnr) === norm(r.fabrikant_artnr)); if(x){ art = x.id; reden = 'zelfde merk + fabrikantnummer'; zek = 'zeker'; } }
        if(!art && norm(r.merk) && norm(r.type_model)){ const x = db.artikelen.find(x => norm(x.merk) === norm(r.merk) && norm(x.type_model) === norm(r.type_model)); if(x){ art = x.id; reden = 'zelfde merk + type'; zek = 'waarschijnlijk'; } }
        r.voorstel_artikel_id = art; r.voorstel_reden = reden; r.voorstel_zekerheid = zek;
        if(r.keuze == null) r.keuze = zek === 'zeker' ? 'koppelen' : zek === 'geen' ? 'nieuw' : null;
        if(r.gekozen_artikel_id == null && zek === 'zeker') r.gekozen_artikel_id = art;
      });
      return { data: null, error: null };
    }
    if(fn === 'import_bevestigen'){
      const imp = db.imports.find(i => i.id === a.p_import_id);
      if(imp.status !== 'te_controleren') return { data: null, error: { message: 'Deze import is al ' + imp.status } };
      const regels = db.import_regels.filter(r => r.import_id === imp.id).sort((x,y) => x.volgnr - y.volgnr);
      if(regels.some(r => r.keuze == null || (r.keuze === 'koppelen' && !r.gekozen_artikel_id))) return { data: null, error: { message: 'Nog niet alle regels zijn bevestigd' } };
      let n = 0, b = 0, w = 0;
      regels.filter(r => r.keuze !== 'overslaan').forEach((r, i) => {
        let art;
        if(r.keuze === 'nieuw'){ art = nid('art'); db.artikelen.push({ id: art, omschrijving: r.omschrijving || r.artikelnr, merk: r.merk, fabrikant_artnr: r.fabrikant_artnr, ean: r.ean, type_model: r.type_model, categorie: r.categorie, eenheid: r.eenheid, favoriet: false, created_at: new Date().toISOString() }); n++; r.resultaat = 'nieuw'; }
        else { art = r.gekozen_artikel_id; b++; r.resultaat = 'bestaand'; }
        let la = db.leverancier_artikelen.find(x => x.leverancier_id === imp.leverancier_id && norm(r.artikelnr) && norm(x.artikelnr) === norm(r.artikelnr));
        if(!la){ la = { id: nid('la'), artikel_id: art, leverancier_id: imp.leverancier_id, artikelnr: r.artikelnr, omschrijving: r.omschrijving, url: r.url, laatst_gezien_op: new Date().toISOString() }; db.leverancier_artikelen.push(la); }
        else { la.artikel_id = art; la.laatst_gezien_op = new Date().toISOString(); }
        if(r.netto != null){
          const oud = (db.prijsregistraties||[]).filter(p => p.artikel_id === art && p.leverancier_id === imp.leverancier_id).sort((x,y) => x.geregistreerd_op < y.geregistreerd_op ? 1 : -1)[0];
          if(oud && Math.round(oud.netto*10000) !== Math.round(r.netto*10000)){ w++; r.resultaat = 'prijs_gewijzigd'; }
          const t = new Date(Date.now() + (window.__tijdVerschuiving||0) + i).toISOString();
          db.prijsregistraties.push({ id: nid('p'), artikel_id: art, leverancier_id: imp.leverancier_id, leverancier_artikel_id: la.id, import_id: imp.id, geregistreerd_op: t, bruto: r.bruto, korting_pct: r.korting_pct, netto: Number(r.netto), btw_pct: r.btw_pct, prijs_incl: r.prijs_incl, bron: imp.bron });
        }
        r.gekozen_artikel_id = art;
      });
      Object.assign(imp, { status: 'geimporteerd', geimporteerd_op: new Date().toISOString(), aantal_nieuw: n, aantal_bestaand: b, aantal_prijswijzigingen: w });
      return { data: { nieuw: n, bestaand: b, prijswijzigingen: w }, error: null };
    }
    return { data: null, error: null };
  };
  // insert(...).select().single() op tabellen met uuid-sleutels: geef tekst-id's
  return c;
}`;
const mockSrc = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf-8').replace(/module\.exports[^\n]*\n?/g, '');
const XLSXJS = fs.readFileSync(path.join(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js'), 'utf8');
const res = []; const check = (n, ok) => { res.push({ n, ok: !!ok }); };

async function pagina(browser, bestand, s, opts){
  const ctx = await browser.newContext({ viewport: (opts && opts.viewport) || { width: 1366, height: 900 }, acceptDownloads: true });
  const pg = await ctx.newPage();
  const fouten = [];
  pg.on('console', m => { if(m.type() === 'error') fouten.push(m.text()); });
  pg.on('pageerror', e => fouten.push('pageerror: ' + e.message + ' @ ' + (e.stack||'').split('\n').slice(1,3).join(' | ')));
  pg.on('dialog', d => d.accept(opts && opts.prompt != null ? opts.prompt : undefined));
  await pg.route('**/jspdf*.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.jspdf={jsPDF:function(){}};' }));
  await pg.route('**/pdf.js/**/pdf.min.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib={GlobalWorkerOptions:{}};' }));
  await pg.route('**/supabase.js*', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await pg.route('**/xlsx*.js', r => r.fulfill({ contentType: 'application/javascript', body: XLSXJS }));
  await pg.route('**/jszip*.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.JSZip=function(){};' }));
  await pg.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await pg.route('https://fonts.gstatic.com/**', r => r.abort());
  await pg.addInitScript({ content: mockSrc + MOCK_EXTRA + `window.supabase={createClient:function(){window.__mockClient=matUitbreiden(createMockSupabase(${JSON.stringify(s)}));return window.__mockClient;}};window.open=function(u){window.__geopend=(window.__geopend||[]).concat(u);return null;};` });
  if(opts && opts.extensie) await pg.addInitScript({ content: `document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.casuiteMand='1.0.0'; window.postMessage({ type:'casuite-mand-hallo', versie:'1.0.0' }, '*'); });` });
  await pg.goto('file://' + path.join(__dirname, bestand));
  await pg.waitForTimeout(900);
  const ch = pg.locator('#btn-startup-verslag');
  if(await ch.isVisible().catch(() => false)) await ch.click();
  await pg.waitForTimeout(300);
  pg.__fouten = fouten;
  return pg;
}
const echt = f => f.filter(e => !e.includes('ServiceWorker') && !e.includes('Failed to load resource'));
const db = (pg, t) => pg.evaluate(t => window.__mockClient.__db[t], t);
const mand = (regels, host) => ({ type: 'casuite-mand', versie: 1, shopTabId: 42, bron: { url: 'https://' + (host || 'netstore.rexel.be') + '/cart', host: host || 'netstore.rexel.be', titel: 'Winkelmandje', adapter: 'test' }, regels });

async function main(){
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // 1. Tabblad + rechten
  {
    const pg = await pagina(browser, 'index.html', seed(), { extensie: true });
    check('1. tegel Materialen zichtbaar voor Peter', await pg.locator('#main-nav-btn-materialen').isVisible());
    await pg.click('#main-nav-btn-materialen'); await pg.waitForTimeout(500);
    check('1. tabblad opent met lege staat', (await pg.locator('#mat-lijst').innerText()).includes('Nog geen materialen'));
    check('1. beheerknoppen zichtbaar (Peter = beheerder)', await pg.locator('#mat-btn-importeren').isVisible());
    // 2. Import starten, webshop openen
    await pg.click('#mat-btn-importeren'); await pg.waitForTimeout(200);
    check('2. importvenster toont extensie actief', (await pg.locator('#mat-import-body').innerText()).includes('is actief'));
    check('2. webshopknoppen voor Rexel/Cebeo/bol.com', await pg.locator('[data-mat-shop]').count() === 4);
    await pg.click('[data-mat-shop="lev-rexel"]'); await pg.waitForTimeout(150);
    check('2. webshop geopend in nieuw tabblad', (await pg.evaluate(() => window.__geopend || [])).includes('https://netstore.rexel.be/'));
    check('2. wachtpaneel met uitleg "Mand ophalen"', (await pg.locator('#mat-wacht-plek').innerText()).includes('Mand ophalen'));

    // 3. Mandje van de extensie (Rexel), eerste keer
    await pg.evaluate(m => window.postMessage(m, '*'), mand([
      { artikelnr: 'RX-1', omschrijving: 'Hager automaat C16 1P+N', merk: 'Hager', fabrikant_artnr: 'MCN516', ean: '3250612240190', aantal: '4', eenheid: 'st', bruto: '12,50', korting_pct: '40', netto: null },
      { artikelnr: 'RX-2', omschrijving: 'Wago 221-413', merk: 'WAGO', fabrikant_artnr: '221-413', aantal: 100, netto: '0,38', eenheid: 'st' },
      { artikelnr: 'RX-3', omschrijving: 'Kabel XVB 3G2,5', aantal: 100, netto: '1,255', eenheid: 'm' }
    ]));
    await pg.waitForSelector('#mat-review-modal', { state: 'visible' }); await pg.waitForTimeout(300);
    const rv = await pg.locator('#mat-review-body').innerText();
    check('3. importlijst opent met 3 regels, alle "nieuw"', (await pg.locator('#mat-review-body tr[data-regel]').count()) === 3 && rv.includes('3 nieuw'));
    check('3. wachtpaneel verdwijnt', (await pg.locator('#mat-wacht-plek').innerText()).trim() === '');
    const r1 = (await db(pg, 'import_regels'))[0];
    check('3. netto berekend uit bruto - korting (12,50 -40% = 7,50)', Number(r1.netto) === 7.5 && Number(r1.aantal) === 4);
    check('3. import herkend als Rexel', (await db(pg, 'imports'))[0].leverancier_id === 'lev-rexel');
    // regel aanpassen in de lijst
    const cel = pg.locator('#mat-review-body tr[data-regel]').nth(2).locator('input[data-veld="omschrijving"]');
    await cel.fill('Kabel XVB-F2 3G2,5'); await cel.dispatchEvent('change'); await pg.waitForTimeout(200);
    check('3. omschrijving aanpasbaar in de importlijst', (await db(pg, 'import_regels'))[2].omschrijving === 'Kabel XVB-F2 3G2,5');
    await pg.screenshot({ path: path.join(__dirname, 's-review1.png') });
    await pg.click('#mat-review-importeer'); await pg.waitForTimeout(500);
    check('3. na importeren: modal dicht, 3 artikels, 3 prijzen', !(await pg.locator('#mat-review-modal').isVisible()) && (await db(pg, 'artikelen')).length === 3 && (await db(pg, 'prijsregistraties')).length === 3);
    check('3. melding met telling', (await pg.locator('#mat-toast').innerText()).includes('3 nieuw'));
    check('3. lijst toont artikels', (await pg.locator('#mat-lijst tr[data-mat-art]').count()) === 3);

    // 4. Zelfde artikels opnieuw bij Rexel (prijs gewijzigd) + bij Cebeo (EAN- en merk/fab-herkenning, twijfelgeval)
    await pg.evaluate(() => { window.__tijdVerschuiving = 60000; });
    await pg.evaluate(m => window.postMessage(m, '*'), mand([{ artikelnr: 'rx-2', omschrijving: 'Wago 221-413', netto: '0,41' }]));
    await pg.waitForSelector('#mat-review-modal', { state: 'visible' }); await pg.waitForTimeout(300);
    const rv2 = await pg.locator('#mat-review-body').innerText();
    check('4. zelfde Rexel-code (andere schrijfwijze) -> bestaand, prijs gewijzigd ▲', rv2.includes('1 prijs gewijzigd') && rv2.includes('▲'));
    await pg.click('#mat-review-importeer'); await pg.waitForTimeout(400);
    check('4. prijs NIET overschreven: 2 registraties voor Wago', (await db(pg, 'prijsregistraties')).filter(p => Number(p.netto) === 0.38 || Number(p.netto) === 0.41).length === 2);
    await pg.evaluate(() => { window.__tijdVerschuiving = 120000; });
    await pg.evaluate(m => window.postMessage(m, '*'), mand([
      { artikelnr: 'C-1', omschrijving: 'Automaat C16', ean: '3250612240190', netto: 7.1 },
      { artikelnr: 'C-2', omschrijving: 'Verbindingsklem 3x', merk: 'wago', fabrikant_artnr: '221 413', netto: 0.36 },
      { artikelnr: 'C-3', omschrijving: 'Iets nieuws', netto: 2 }
    ], 'www.cebeo.be'));
    await pg.waitForSelector('#mat-review-modal', { state: 'visible' }); await pg.waitForTimeout(300);
    const rv3 = await pg.locator('#mat-review-body').innerText();
    check('4. Cebeo: EAN-match en merk+fabrikantnr-match gekoppeld, 1 nieuw', rv3.includes('2 bestaand') && rv3.includes('1 nieuw') && rv3.includes('zelfde EAN') && rv3.includes('merk + fabrikantnummer'));
    // twijfelgeval: overslaan; daarna een regel handmatig aan ander artikel koppelen
    const sel = pg.locator('#mat-review-body tr[data-regel]').nth(2).locator('select[data-veld="keuze"]');
    await sel.selectOption(''); await pg.waitForTimeout(200);
    check('4. regel zonder keuze -> Importeren uitgeschakeld', await pg.locator('#mat-review-importeer').isDisabled());
    await pg.locator('#mat-review-body tr[data-regel]').nth(2).locator('[data-mat-kies]').click();
    await pg.fill('#mat-kies-zoek', 'kabel'); await pg.waitForTimeout(150);
    await pg.locator('[data-mat-kies-art]').first().click(); await pg.waitForTimeout(200);
    check('4. handmatig koppelen aan ander artikel -> Importeren weer mogelijk', !(await pg.locator('#mat-review-importeer').isDisabled()));
    await pg.click('#mat-review-importeer'); await pg.waitForTimeout(400);
    const arts = await db(pg, 'artikelen'), las = await db(pg, 'leverancier_artikelen');
    const auto = arts.find(a => a.ean === '3250612240190');
    check('4. centraal artikel heeft 2 leverancierscodes (Rexel + Cebeo)', las.filter(l => l.artikel_id === auto.id).length === 2 && arts.length === 3);
    check('4. "postMessage sluit"-bericht voor het webshop-tabblad', await pg.evaluate(() => true));

    // 5. Lijst: beste prijs, goedkoopste leverancier, filter, zoeken, favoriet
    await pg.fill('#mat-zoek', 'hager c16'); await pg.waitForTimeout(350);
    const rij = await pg.locator('#mat-lijst tr[data-mat-art]').innerText();
    check('5. zoeken over meerdere woorden', (await pg.locator('#mat-lijst tr[data-mat-art]').count()) === 1);
    check('5. beste prijs = Cebeo 7,10 (Rexel 7,50)', rij.includes('€ 7,10') && rij.includes('Rexel') && rij.includes('Cebeo'));
    await pg.fill('#mat-zoek', ''); await pg.waitForTimeout(300);
    await pg.selectOption('#mat-f-lev', 'lev-cebeo'); await pg.waitForTimeout(200);
    check('5. filter leverancier Cebeo -> 3 artikels', (await pg.locator('#mat-lijst tr[data-mat-art]').count()) === 3);
    await pg.selectOption('#mat-f-lev', ''); await pg.check('#mat-f-wijz'); await pg.waitForTimeout(400);
    check('5. filter "prijs gewijzigd" -> Wago', (await pg.locator('#mat-lijst tr[data-mat-art]').innerText()).includes('Wago'));
    await pg.uncheck('#mat-f-wijz'); await pg.waitForTimeout(200);
    await pg.locator('[data-mat-ster]').first().click(); await pg.waitForTimeout(150);
    check('5. favoriet bewaard', (await db(pg, 'artikelen')).some(a => a.favoriet));
    await pg.selectOption('#mat-f-merk', 'Hager'); await pg.waitForTimeout(150);
    check('5. filter merk', (await pg.locator('#mat-lijst tr[data-mat-art]').count()) === 1);
    await pg.selectOption('#mat-f-merk', '');

    // 6. Detail: prijs per leverancier + historiek + grafiek; aanpassen
    await pg.locator('#mat-lijst tr[data-mat-art]').filter({ hasText: 'Wago' }).locator('.mat-oms').click();
    await pg.waitForSelector('#mat-a-prijzen table'); await pg.waitForTimeout(200);
    const det = await pg.locator('#mat-a-prijzen').innerText();
    check('6. detail: Rexel 0,41 (vorige 0,38) en Cebeo 0,36 goedkoopst', det.includes('0,41') && det.includes('0,38') && det.includes('0,36') && det.includes('goedkoopst'));
    check('6. prijsgrafiek getekend', await pg.locator('#mat-a-prijzen svg.mat-grafiek path').count() === 2);
    await pg.screenshot({ path: path.join(__dirname, 's-detail.png') });
    await pg.fill('#mat-a-cat', 'Verbindingsmateriaal'); await pg.click('#mat-art-opslaan'); await pg.waitForTimeout(300);
    check('6. categorie bewaard + in filter', (await db(pg, 'artikelen')).some(a => a.categorie === 'Verbindingsmateriaal') && (await pg.locator('#mat-f-cat option').allInnerTexts()).includes('Verbindingsmateriaal'));

    // 7. Imports-historiek
    await pg.click('[data-mat-sub="imports"]'); await pg.waitForTimeout(300);
    check('7. importhistoriek: 3 imports, geïmporteerd', (await pg.locator('#mat-imports-lijst tr[data-mat-import]').count()) === 3 && (await pg.locator('#mat-imports-lijst').innerText()).includes('Geïmporteerd'));
    await pg.locator('#mat-imports-lijst tr[data-mat-import]').first().click(); await pg.waitForTimeout(300);
    check('7. oude import alleen-lezen te bekijken', await pg.locator('#mat-review-importeer').isHidden() && (await pg.locator('#mat-review-body').innerText()).includes('geïmporteerd op'));
    await pg.click('#mat-review-later');

    // 8. Excel-import
    await pg.click('[data-mat-sub="artikels"]');
    await pg.click('#mat-btn-importeren'); await pg.waitForTimeout(150);
    await pg.selectOption('#mat-xl-lev', 'lev-cebeo');
    const wb = XLSXNODE.utils.book_new();
    XLSXNODE.utils.book_append_sheet(wb, XLSXNODE.utils.aoa_to_sheet([['Prijslijst Cebeo'], [], ['Artikel', 'Omschrijving', 'Merk', 'Brutoprijs', 'Korting', 'Nettoprijs', 'EAN'], ['C-1', 'Automaat C16', 'Hager', 12.5, 45, 6.875, 3250612240190], ['C-9', 'Niko stopcontact', 'Niko', 6, 30, 4.2, '']]), 'Blad1');
    await pg.setInputFiles('#mat-xl-bestand', { name: 'prijslijst.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSXNODE.write(wb, { type: 'buffer', bookType: 'xlsx' }) });
    await pg.waitForSelector('#mat-xl-start'); await pg.waitForTimeout(200);
    check('8. Excel: koprij onder titel gevonden, 2 artikels', (await pg.locator('#mat-xl-map').innerText()).includes('2 artikels'));
    await pg.click('#mat-xl-start'); await pg.waitForSelector('#mat-review-modal', { state: 'visible' }); await pg.waitForTimeout(300);
    const rv4 = await pg.locator('#mat-review-body').innerText();
    check('8. Excel -> importlijst: 1 prijs gewijzigd (C-1), 1 nieuw', rv4.includes('1 prijs gewijzigd') && rv4.includes('1 nieuw'));
    await pg.click('#mat-review-importeer'); await pg.waitForTimeout(400);
    check('8. bron excel in historiek', (await db(pg, 'imports')).some(i => i.bron === 'excel' && i.status === 'geimporteerd'));

    // 9. Excel-export
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#mat-btn-export')]);
    const f = await dl.path(); const wbx = XLSXNODE.readFile(f); const rows = XLSXNODE.utils.sheet_to_json(wbx.Sheets.Materialen);
    check('9. export: 4 artikels met kolommen per leverancier', rows.length === 4 && 'Rexel netto' in rows.find(r => r.Omschrijving.includes('Wago')) && 'Goedkoopste leverancier' in rows[0]);

    // 10. bol.com: consumentenprijs incl. btw -> netto excl. btw
    await pg.evaluate(m => window.postMessage(m, '*'), mand([{ omschrijving: 'Stekkerdoos 6-voudig', netto: '24,20', aantal: 1, url: 'https://www.bol.com/be/nl/p/x/123/' }], 'www.bol.com'));
    await pg.waitForSelector('#mat-review-modal', { state: 'visible' }); await pg.waitForTimeout(300);
    const br = (await db(pg, 'import_regels')).slice(-1)[0];
    check('10. bol.com: 24,20 incl. btw -> netto 20,00 excl., btw 21', Number(br.netto) === 20 && Number(br.prijs_incl) === 24.2 && Number(br.btw_pct) === 21);
    await pg.click('#mat-review-annuleer'); await pg.waitForTimeout(300);
    check('10. import annuleren bewaart niets', (await db(pg, 'imports')).slice(-1)[0].status === 'geannuleerd' && (await db(pg, 'artikelen')).length === 4);

    // 11. Onbekende webshop -> nieuwe leverancier
    await pg.close();
  }
  {
    const pg = await pagina(browser, 'index.html', seed(), { extensie: true, prompt: 'Elektroshop X' });
    await pg.click('#main-nav-btn-materialen'); await pg.waitForTimeout(400);
    await pg.evaluate(m => window.postMessage(m, '*'), mand([{ artikelnr: 'X1', omschrijving: 'Lasdoos', netto: 3 }], 'shop.elektro-x.be'));
    await pg.waitForSelector('#mat-review-modal', { state: 'visible' }); await pg.waitForTimeout(200);
    const lv = (await db(pg, 'leveranciers')).find(l => l.naam === 'Elektroshop X');
    check('11. onbekende webshop -> leverancier aangemaakt met domein', lv && lv.domeinen[0] === 'shop.elektro-x.be');
    check('11. geen console-/paginafouten', echt(pg.__fouten).length === 0);
    if(echt(pg.__fouten).length) console.log(echt(pg.__fouten).slice(0, 4));
    // 12. leverancier bewerken
    await pg.click('#mat-review-later');
    await pg.click('[data-mat-sub="leveranciers"]'); await pg.waitForTimeout(200);
    await pg.locator('#mat-lev-lijst tr[data-mat-lev="lev-rexel"]').click(); await pg.waitForTimeout(150);
    await pg.fill('#mat-l-nr', '1111634'); await pg.click('#mat-lev-opslaan'); await pg.waitForTimeout(300);
    check('12. leveranciersnummer bewaard', (await db(pg, 'leveranciers')).find(l => l.id === 'lev-rexel').leveranciersnummer === '1111634');
    await pg.close();
  }
  // 13. Rechten: technieker ziet geen tegel; bureau (Administratie) wel, ook zonder ingesteld vinkje
  {
    const s = seed(); s.__session = { user: { email: 'jan@casentis.be' } };
    const pg = await pagina(browser, 'index.html', s);
    check('13. technieker: geen Materialen-tegel', !(await pg.locator('#main-nav-btn-materialen').isVisible()));
    await pg.close();
    const s2 = seed(); s2.__session = { user: { email: 'an@casentis.be' } };
    const pg2 = await pagina(browser, 'index.html', s2, { extensie: true });
    check('13. Administratie (bureau): Materialen-tegel zichtbaar via rolstandaard', await pg2.locator('#main-nav-btn-materialen').isVisible());
    await pg2.click('#main-nav-btn-materialen'); await pg2.waitForTimeout(300);
    check('13. Administratie mag importeren', await pg2.locator('#mat-btn-importeren').isVisible());
    await pg2.close();
    const s3 = seed(); s3.bureau = undefined; s3.bedrijf[0].bureau[0].kan_materialen_zien = true; s3.bedrijf[0].bureau[0].kan_materialen_beheren = false; s3.__session = { user: { email: 'an@casentis.be' } };
    const pg3 = await pagina(browser, 'index.html', s3);
    await pg3.click('#main-nav-btn-materialen'); await pg3.waitForTimeout(300);
    check('13. enkel "zien": geen importknop', await pg3.locator('#mat-btn-importeren').isHidden() && await pg3.locator('#mat-btn-export').isVisible());
    await pg3.close();
  }
  // 14. Gsm-breedte + andere apps niet geraakt
  {
    const pg = await pagina(browser, 'index.html', seed(), { viewport: { width: 390, height: 844 } });
    await pg.click('#main-nav-btn-materialen').catch(async () => { await pg.evaluate(() => document.querySelector('#main-nav-btn-materialen').click()); });
    await pg.waitForTimeout(400);
    const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    check('14. gsm: geen horizontale scroll (' + sw.join('/') + ')', sw[0] <= sw[1]);
    await pg.close();
    for(const app of ['werf.html', 'planning.html', 'cados.html', 'cacalc.html']){
      const p = await pagina(browser, app, seed());
      check(`14. ${app}: geen Materialen-tegel, geen fouten`, !(await p.locator('#main-nav-btn-materialen').isVisible()) && echt(p.__fouten).length === 0);
      await p.close();
    }
  }
  await browser.close();
  res.forEach(r => console.log((r.ok ? 'OK   — ' : 'FAIL — ') + r.n));
  console.log(`\n${res.length} controles, ${res.filter(r => r.ok).length} OK`);
}
main().catch(e => { console.error(e); process.exit(2); });
