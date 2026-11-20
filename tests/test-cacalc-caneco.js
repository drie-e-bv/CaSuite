// test-cacalc-caneco.js — CaCalc tegen het Caneco BT 5.13-rapport "Familie Valcke - Wevelgem"
// (Deckx, 26/02/2025). Toleranties: Ik max ±2 %, Ik min ±3 % (IEC 60909 cmax 1,10, transfo op 410 V),
// spanningsval ±0,25 %-punt. Plus: bordpaneel toont Ik2 en de HS-netvelden.
const path = require('path'); const fs = require('fs');
const { chromium } = require('playwright');
const res = [];
const check = (n, ok, x) => res.push({ n, ok: !!ok, x });
const binnen = (a, b, pct) => Math.abs(a - b) / b <= pct / 100;
const mockSrc = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf-8').replace(/module\.exports[^\n]*\n?/g, '');
const SEED = { __session: { user: { email: 'peter@casentis.be' } },
  bedrijf: [{ id: 1, naam: 'Casentis', team_leden: [{ id: 'tl-p', naam: 'Peter Casentis', email: 'peter@casentis.be', rol: 'Zaakvoerder' }], bureau: [] }],
  projecten: [{ id: 'p-1', naam: 'Testproject Caneco', locatie: 'Wevelgem', projectnummer: '2026-100', actief: true, contactpersonen: [] }],
  verslagen: [], verslagpunten: [], planning_items: [], planning_notities: [], uren_registraties: [], project_notities: [],
  project_elektro_dossiers: [], project_cacalc_data: [], elektro_catalogus_armaturen: [], elektro_catalogus_drivers: [] };

(async () => {
  const browser = await chromium.launch();
  const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const fouten = [];
  pg.on('pageerror', e => fouten.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') fouten.push(m.text()); });
  for (const [pat, body, ct] of [['**/jspdf*.js', 'window.jspdf={jsPDF:function(){}};'], ['**/pdf.js/**/pdf.min.js', 'window.pdfjsLib={GlobalWorkerOptions:{}};'],
    ['**/supabase.js*', ''], ['**/xlsx*.js', 'window.XLSX={};'], ['**/jszip*.js', 'window.JSZip=function(){};'], ['https://fonts.googleapis.com/**', '', 'text/css']])
    await pg.route(pat, r => r.fulfill({ contentType: ct || 'application/javascript', body }));
  await pg.route('https://fonts.gstatic.com/**', r => r.abort());
  await pg.addInitScript({ content: mockSrc + `window.supabase={createClient:function(){window.__mockClient=createMockSupabase(${JSON.stringify(SEED)});return window.__mockClient;}};` });
  await pg.goto('file://' + path.join(__dirname, 'cacalc.html'));
  await pg.waitForTimeout(1200);

  const r = await pg.evaluate(() => {
    const project = { Un: 400, netstelsel: 'TN-S', voedingstype: 'transfo', SnKVA: 250, uccFabrikant: 4, spanningsvalLimit: 8 };
    const alsb = { id: 'ALSB', voedend: null, materiaal: 'Koper', mantel: 'XGB', kabeltype: 'Mono', omgeving: 'Binnen', constructie: 'Geperforeerde kabelgoot / ladeprofiel',
      bundel: 'Vrijstaand', sectie: 120, aantal: 1, lengte: 6, hoofdautomaatIn: 400, curve: 'Handmatig', imHandmatig: 892.8, icu: 36, t_kortsl: 0.02, skqMax: 433, skqMin: 125 };
    const won = { id: 'WON', voedend: 'ALSB', materiaal: 'Aluminium', mantel: 'RZ1', kabeltype: 'Multi', omgeving: 'Onder de grond', constructie: 'Direct in de grond (in volle aarde)',
      bundel: 'Gebundeld - 2 kabels/buizen direct naast elkaar', sectie: 185, aantal: 2, lengte: 278, In: 288.68, curve: 'Handmatig', imHandmatig: 892.8, icu: 36, t_kortsl: 0.02 };
    const pv = { id: 'PV', voedend: 'WON', materiaal: 'Koper', mantel: 'XGB', kabeltype: 'Mono', monoLegging: 'klaverblad', omgeving: 'Onder de grond',
      constructie: 'In een ondergrondse (wacht)buis', bundel: 'Alleen', sectie: 150, aantal: 1, lengte: 140, In: 115.47, curve: 'C-curve', icu: 25, t_kortsl: 0.02 };
    const t = CalcEngine.calcTree(REF, project, [alsb, won, pv]).results;
    const zonder = CalcEngine.calcTree(REF, project, [Object.assign({}, alsb, { skqMax: '', skqMin: '' }), won, pv]).results;
    return { t, zonderIk3: zonder.ALSB.Ik3max, rho: REF.datatabel.resistivity, rho20: REF.datatabel.resistivity20 };
  });
  const C = { // Caneco
    ALSB: { Ik3max: 9049, Ik2max: 7837, Ik1max: 8847, Ik2min: 6517, Ik1min: 7380, dUcum: 0.19 },
    WON: { Ik3max: 5169, Ik2max: 4476.8, Ik1max: 3458, Ik2min: 3502, Ik1min: 2614, dUcum: 3.86 },
    PV: { Ik3max: 3675, Ik2max: 3183.1, Ik1max: 2222, Ik2min: 2430, Ik1min: 1648, dUcum: 5.08 } };
  for (const b of ['ALSB', 'WON', 'PV']) {
    const x = r.t[b], c = C[b];
    for (const k of ['Ik3max', 'Ik2max', 'Ik1max']) check(`${b} ${k} binnen 2 % van Caneco (${c[k]} A)`, binnen(x[k], c[k], 2), Math.round(x[k]));
    for (const k of ['Ik2min', 'Ik1min']) check(`${b} ${k} binnen 3 % van Caneco (${c[k]} A)`, binnen(x[k], c[k], 3), Math.round(x[k]));
    check(`${b} cumulatieve spanningsval binnen 0,25 %-punt van Caneco (${c.dUcum} %)`, Math.abs(x.spanningsvalCum * 100 - c.dUcum) <= 0.25, (x.spanningsvalCum * 100).toFixed(2));
  }
  check('Ik2max = √3/2 × Ik3max', Math.abs(r.t.WON.Ik2max - r.t.WON.Ik3max * Math.sqrt(3) / 2) < 0.01);
  check('Ik max gebruikt ρ20 (Cu 1/54, Al 1/34), Ik min de warme 1,25·ρ20', Math.abs(r.rho20.Koper - 1 / 54) < 1e-9 && Math.abs(r.rho.Aluminium - 1.25 / 34) < 1e-9);
  check('HS-net verlaagt Ik3max op ALSB (zonder ' + Math.round(r.zonderIk3) + ' A)', r.zonderIk3 > r.t.ALSB.Ik3max);
  check('Icu-toets vertrek WONING tegen Ik3max ALSB', r.t.WON.icuRefIk3max === r.t.ALSB.Ik3max && r.t.WON.icuOk === true);

  // bordpaneel
  try {
    if (!(await pg.locator('#cc-add-board-btn').isVisible().catch(() => false))) {
      const kies = pg.locator('#cc-project-select, select[id*="project"]').first();
      if (await kies.isVisible().catch(() => false)) { await kies.selectOption({ index: 1 }).catch(() => {}); await pg.waitForTimeout(600); }
    }
    await pg.locator('#cc-add-board-btn').click({ timeout: 6000 });
    await pg.waitForTimeout(500);
    const tekst = await pg.locator('#cc-board-detail').innerText();
    check('Paneel: Ik2 max en Ik2 min getoond', tekst.includes('Ik2 max') && tekst.includes('Ik2 min'));
    check('Paneel: velden kortsluitvermogen HS-net op het hoofdbord', await pg.locator('#cc-board-detail input[data-f="skqMax"]').count() === 1 && await pg.locator('#cc-board-detail input[data-f="skqMin"]').count() === 1);
    const voor = await pg.locator('#cc-board-detail').innerText();
    await pg.fill('#cc-board-detail input[data-f="skqMax"]', '433'); await pg.locator('#cc-board-detail input[data-f="skqMax"]').dispatchEvent('change');
    await pg.waitForTimeout(400);
    check('Paneel: HS-net 433 MVA komt in de hint', (await pg.locator('#cc-board-detail').innerText()).includes('433 MVA'));
  } catch (e) { check('Paneel bereikbaar', false, e.message.split('\n')[0]); }
  const echt = fouten.filter(e => !e.includes('ServiceWorker') && !e.includes('Failed to load resource'));
  check('Geen console-fouten', echt.length === 0, echt.slice(0, 2).join(' | '));
  await browser.close();
  let ok = 0; res.forEach(x => { if (x.ok) ok++; console.log((x.ok ? 'OK   ' : 'FOUT ') + x.n + (x.x != null ? '  -> ' + x.x : '')); });
  console.log(`\n${ok}/${res.length} OK`); process.exit(ok === res.length ? 0 : 1);
})();
