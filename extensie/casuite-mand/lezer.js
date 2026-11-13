// lezer.js — leest het winkelmandje van de geopende webshop uit. ENKEL LEZEN: dit bestand klikt
// nergens op, wijzigt geen aantallen en plaatst nooit iets in een mandje.
//
// Opbouw: per webshop een kleine "adapter" (welke domeinen, hoe een mandregel eruitziet) en een
// algemene lezer voor alle andere webshops. Alle adapters geven hetzelfde regelformaat terug:
//   { artikelnr, omschrijving, merk, fabrikant_artnr, ean, type_model, eenheid, aantal,
//     bruto, korting_pct, netto, prijs_incl, btw_pct, url, ruw }
// Prijzen zijn per eenheid. Webshops voor particulieren tonen prijzen incl. btw: dan staat
// prijzenInclBtw op true en zet CaSuite ze om naar netto excl. btw.
(function(){
  if(window.__casuiteLezer) return;

  const PRIJS_RE = /(?:€|EUR)\s*-?\d[\d.\s]*(?:,\d{1,4})?|-?\d[\d.\s]*,\d{2,4}\s*(?:€|EUR)|-?\d{1,6}\.\d{2}\s*(?:€|EUR)/gi;
  const PRIJS_TEST = new RegExp(PRIJS_RE.source, 'i');
  // Tabs (tabelcellen in innerText) worden regeleinden, zodat "Merk: X" niet in de volgende cel doorloopt.
  const tekstVan = el => (el ? (el.innerText || el.textContent || '') : '').replace(/\u00a0/g, ' ').replace(/\t+/g, '\n').replace(/ +/g, ' ').replace(/ *\n */g, '\n').trim();
  function getal(s){
    if(s == null) return null;
    let t = String(s).replace(/€|EUR|\s| /gi, '');
    if(!t) return null;
    if(t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if(t.includes(',')) t = t.replace(',', '.');
    t = t.replace(/[^0-9.\-]/g, '');
    const n = Number(t); return t && isFinite(n) ? n : null;
  }
  const zichtbaar = el => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
  const doorstreept = el => { for(let e = el; e && e !== document.body; e = e.parentElement){ const t = e.tagName; if(t === 'S' || t === 'DEL' || t === 'STRIKE') return true; const td = getComputedStyle(e).textDecorationLine || ''; if(td.includes('line-through')) return true; if(/(old|was|strike|origin|catalog|list|bruto|from)-?price|price-?(old|was|strike|before)|doorgestreept/i.test(e.className || '')) return true; } return false; };

  // Prijzen in een element: [{ waarde, doorstreept, el }]
  function prijzenIn(root){
    const uit = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; const gezien = new Set();
    while((n = walker.nextNode())){
      const t = n.nodeValue.replace(/ /g, ' ');
      if(!/\d/.test(t)) continue;
      const el = n.parentElement; if(!el || gezien.has(el)) continue;
      // Prijzen staan soms verdeeld over meerdere elementen (€ <span>12</span>,<sup>50</sup>): neem
      // de tekst van het kleinste element dat een volledige prijs bevat.
      let doel = el;
      for(let i = 0; i < 3 && doel && !PRIJS_TEST.test(tekstVan(doel)); i++) doel = doel.parentElement;
      if(!doel || gezien.has(doel) || !root.contains(doel)) continue;
      const m = tekstVan(doel).match(PRIJS_RE);
      if(!m || m.length > 1 && tekstVan(doel).length > 60) continue;
      gezien.add(doel);
      m.forEach(p => { const w = getal(p); if(w != null) uit.push({ waarde: w, doorstreept: doorstreept(doel), el: doel }); });
    }
    return uit;
  }

  function aantalIn(rij){
    const inp = rij.querySelector('input[type=number], input[name*=qty i], input[name*=quant i], input[name*=aantal i], input[aria-label*=aantal i], input[aria-label*=quant i], input[id*=qty i], input[id*=quant i], input[class*=qty i], input[class*=quant i]');
    if(inp && getal(inp.value) != null) return getal(inp.value);
    const sel = rij.querySelector('select[name*=qty i], select[name*=quant i], select[name*=aantal i], select[aria-label*=aantal i], select[id*=quant i], select[class*=quant i]');
    if(sel && sel.selectedOptions[0] && getal(sel.selectedOptions[0].textContent) != null) return getal(sel.selectedOptions[0].textContent);
    const m = tekstVan(rij).match(/(?:aantal|qty|hoeveelheid|quantity)\s*[:x]?\s*(\d+(?:[.,]\d+)?)/i) || tekstVan(rij).match(/\b(\d+)\s*x\b/i);
    return m ? getal(m[1]) : null;
  }
  const aantalVeld = '[type=number], input[name*=qty i], input[name*=quant i], input[name*=aantal i], input[aria-label*=aantal i], input[aria-label*=quant i], input[id*=qty i], input[id*=quant i], input[class*=qty i], input[class*=quant i], select[name*=qty i], select[name*=quant i], select[name*=aantal i], select[aria-label*=aantal i], select[id*=quant i], select[class*=quant i]';

  function veldUit(tekst, re){ const m = tekst.match(re); return m ? m[m.length - 1].trim() : ''; }
  const GEEN_PRODUCT = /verwijder|remove|delete|\bwis\b|bewaar|favoriet|wishlist|verlanglijst|promo|kortingscode|coupon|voucher|cadeaubon|voeg .* toe|wijzig|bewerk|opmerking|leverdatum|meer info/i;
  function productLinks(rij){
    return Array.from(rij.querySelectorAll('a[href]')).filter(a => zichtbaar(a) && tekstVan(a).length > 1 && !GEEN_PRODUCT.test(tekstVan(a) + ' ' + (a.getAttribute('aria-label') || '') + ' ' + (a.getAttribute('title') || '')));
  }
  // Een "code" = één woord met cijfers, geen gewone tekst (bv. NIK17000000, 1234567, 221-413).
  const IS_CODE = t => /^[A-Z0-9][A-Z0-9\-\.\/]{3,30}$/i.test(t) && /\d/.test(t);
  function regelUit(rij){
    const tekst = tekstVan(rij);
    const links = productLinks(rij);
    const kop = rij.querySelector('h1,h2,h3,h4,h5,[class*=title i],[class*=name i],[class*=omschr i],[class*=descr i],[data-test*=title i]');
    let oms = '';
    const kandidaten = [kop, ...links].filter(Boolean).map(e => tekstVan(e)).filter(t => t.length > 3 && !PRIJS_TEST.test(t));
    if(kandidaten.length) oms = kandidaten.sort((a, b) => b.length - a.length)[0];
    if(!oms){ const img = rij.querySelector('img[alt]'); if(img && img.alt.length > 3) oms = img.alt.trim(); }
    if(!oms) oms = tekst.split('\n').map(s => s.trim()).filter(s => s.length > 3 && !/\d+[.,]\d{2}/.test(s)).sort((a, b) => b.length - a.length)[0] || '';
    oms = oms.split('\n')[0].slice(0, 300);
    let codeUitLink = '';
    if(IS_CODE(oms)){
      codeUitLink = oms;
      const regels = tekst.split('\n').map(x => x.trim()).filter(x => x.length > 3 && x !== codeUitLink && !PRIJS_TEST.test(x) && !/^\d+([.,]\d+)?$/.test(x)
        && !/^(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|vandaag|morgen|in voorraad|op voorraad|niet op voorraad|levering|leverdatum)\b/i.test(x));
      oms = regels.sort((a, b) => b.length - a.length)[0] || codeUitLink;
    }
    const url = (links.find(a => tekstVan(a) && oms.startsWith(tekstVan(a).slice(0, 20))) || links[0] || {}).href || null;
    const aantal = aantalIn(rij);
    const prijzen = prijzenIn(rij).filter(p => p.waarde > 0);
    const echt = prijzen.filter(p => !p.doorstreept).map(p => p.waarde);
    const oud = prijzen.filter(p => p.doorstreept).map(p => p.waarde);
    let netto = null, bruto = null;
    if(echt.length){
      if(aantal && aantal > 1){
        // eenheidsprijs x aantal = lijntotaal: zoek dat paar
        const paar = echt.find(a => echt.some(b => Math.abs(a * aantal - b) < 0.011 && b !== a));
        netto = paar != null ? paar : Math.min(...echt);
      } else netto = Math.min(...echt);
    }
    if(oud.length){ bruto = aantal && aantal > 1 ? Math.min(...oud) : Math.max(...oud); if(bruto <= (netto || 0)) bruto = null; }
    let art = veldUit(tekst, /(?:^|[\s(])(?:art(?:ikel)?\.?\s*(?:nr|nummer|code)|artikelnummer|referentie|ref\.|bestelnummer|bestelcode|product\s*code|productnummer|sku|item\s*(?:no|nr))\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-\/\.]{2,30})/i);
    if(!art && codeUitLink) art = codeUitLink;
    let ean = veldUit(tekst, /(?:ean|gtin|barcode)\s*(?:code)?\s*[:#]?\s*(\d{8,14})/i);
    if(!ean){ const m = tekst.match(/\b(\d{13})\b/); if(m) ean = m[1]; }
    const merk = veldUit(tekst, /(?:merk|brand|fabrikant|manufacturer)\s*[:]\s*([^\n|•·]{2,40})/i);
    const fab = veldUit(tekst, /(?:fabrikant\s*(?:nr|nummer|code|ref)|fabr\.?\s*(?:nr|code)|manufacturer\s*(?:no|nr|code|part)|type\s*(?:nr|nummer))\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-\/\. ]{1,30})/i);
    const eenh = veldUit(tekst, /per\s+(stuk|st\.?|meter|m|rol|doos|set|pak|100\s*m)\b/i);
    const korting = veldUit(tekst, /(-?\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:korting|discount|rabat)?/i);
    return { artikelnr: art, omschrijving: oms, merk, fabrikant_artnr: fab, ean, eenheid: eenh, aantal,
      bruto, korting_pct: korting ? Math.abs(getal(korting)) : null, netto, url, ruw: { tekst: tekst.slice(0, 600) } };
  }

  // In een tabel met kolomkoppen: de kop bepaalt wat een cel is (bruto/netto/korting/aantal/...).
  const KOP = [
    ['bruto', /bruto|catalogus|lijstprijs|adviesprijs|list ?price/i], ['korting_pct', /korting|discount|rabat|remise/i],
    ['totaal', /totaal|total|bedrag|subtot/i], ['netto', /netto|uw prijs|eenheidsprijs|stukprijs|prijs|price|prix/i],
    ['aantal', /aantal|qty|hoeveelheid|quant/i], ['ean', /ean|gtin|barcode/i], ['merk', /^merk$|brand|fabrikant$/i],
    ['fabrikant_artnr', /fabrikant.*(nr|code|ref)|typenr|manufact/i], ['eenheid', /eenheid|unit|^ve$/i],
    ['artikelnr', /art|referentie|^ref|code|sku|item/i], ['omschrijving', /omschr|beschrijving|product|description|naam/i]
  ];
  function tabelVelden(tr){
    const tabel = tr.closest('table'); if(!tabel) return null;
    const kopRij = tabel.querySelector('thead tr') || Array.from(tabel.querySelectorAll('tr')).find(r => r.querySelector('th'));
    if(!kopRij || kopRij === tr) return null;
    const koppen = []; Array.from(kopRij.children).forEach(c => { for(let i = 0; i < (c.colSpan || 1); i++) koppen.push(tekstVan(c)); });
    const uit = {}; let kol = 0;
    Array.from(tr.children).forEach(td => {
      const kop = koppen[kol] || ''; kol += td.colSpan || 1;
      const k = (KOP.find(([, re]) => re.test(kop)) || [])[0]; if(!k || k in uit) return;
      const inp = td.querySelector('input, select');
      const waarde = inp ? (inp.tagName === 'SELECT' ? (inp.selectedOptions[0] || {}).textContent : inp.value) : tekstVan(td);
      uit[k] = (waarde || '').trim();
    });
    return uit;
  }
  function metTabel(rij, r){
    const tv = rij.tagName === 'TR' ? tabelVelden(rij) : null;
    if(!tv) return r;
    ['bruto', 'netto', 'aantal', 'korting_pct'].forEach(k => { if(tv[k] != null && getal(tv[k]) != null) r[k] = Math.abs(getal(tv[k])); });
    ['ean', 'merk', 'fabrikant_artnr', 'eenheid'].forEach(k => { if(tv[k]) r[k] = tv[k].split('\n')[0].slice(0, 60); });
    if(tv.artikelnr && !r.artikelnr){ const m = tv.artikelnr.match(/([A-Z0-9][A-Z0-9\-\/\.]{2,30})\s*$/i); if(m) r.artikelnr = m[1]; }
    if(r.netto == null && tv.totaal && r.aantal) r.netto = Math.round(getal(tv.totaal) / r.aantal * 10000) / 10000;
    if(r.bruto != null && r.netto != null && r.bruto <= r.netto) r.bruto = null;
    return r;
  }

  // Algemene lezer: een mandregel = het grootste blok rond één aantal-veld dat een prijs bevat.
  function algemeen(){
    const velden = Array.from(document.querySelectorAll(aantalVeld)).filter(zichtbaar)
      .filter(v => !v.closest('header, nav, footer, [role=dialog][aria-hidden=true]'));
    let rijen = [];
    velden.forEach(v => {
      // Kleinste blok rond het aantal-veld met een prijs en een productlink of -afbeelding: dat is
      // de mandregel. (Groter zoeken pakt anders ook promocode, totalen en ecotaks mee.)
      let el = v.parentElement, beste = null;
      while(el && el !== document.body){
        if(el.querySelectorAll(aantalVeld).length > 1) break;
        if(prijzenIn(el).length && (el.querySelector('img') || productLinks(el).length)){ beste = el; break; }
        el = el.parentElement;
      }
      if(beste && beste.closest('tr') && beste.closest('tr').querySelectorAll(aantalVeld).length === 1) beste = beste.closest('tr');
      if(beste && !rijen.includes(beste)) rijen.push(beste);
    });
    // Zonder aantal-velden: tabelrijen met een prijs (klassieke B2B-mandjes)
    if(!rijen.length){
      rijen = Array.from(document.querySelectorAll('table tr')).filter(tr => zichtbaar(tr) && tr.querySelector('td') && prijzenIn(tr).length && tekstVan(tr).length > 10);
    }
    rijen = rijen.filter(r => !rijen.some(o => o !== r && o.contains(r)));
    return rijen.map(r => metTabel(r, regelUit(r))).filter(r => r.omschrijving || r.artikelnr);
  }

  // Webshop-specifieke adapters. Rexel/Cebeo: B2B, prijzen excl. btw. Selectors worden verfijnd
  // zodra een echt mandje bekeken is; tot dan valt elke adapter terug op de algemene lezer.
  const ADAPTERS = [
    { naam: 'rexel', domeinen: ['rexel.be'], inclBtw: false, lees: algemeen },
    { naam: 'cebeo', domeinen: ['cebeo.be'], inclBtw: false, lees: algemeen },
    { naam: 'bol', domeinen: ['bol.com'], inclBtw: true, lees: algemeen },
    { naam: 'facq', domeinen: ['facq.be'], inclBtw: null, lees: algemeen },
    { naam: 'desco', domeinen: ['desco.be'], inclBtw: false, lees: algemeen },
    { naam: 'districompany', domeinen: ['districompany.com', 'districompany.be'], inclBtw: false, lees: algemeen }
  ];

  function leesMand(){
    const host = location.hostname.replace(/^www\./, '');
    const ad = ADAPTERS.find(a => a.domeinen.some(d => host === d || host.endsWith('.' + d))) || { naam: 'algemeen', inclBtw: null, lees: algemeen };
    let regels = [];
    try{ regels = ad.lees(); }catch(e){ regels = []; }
    if(!regels.length && ad.lees !== algemeen){ try{ regels = algemeen(); }catch(e){} }
    let inclBtw = ad.inclBtw;
    if(inclBtw == null){
      const t = tekstVan(document.body).toLowerCase();
      const incl = (t.match(/incl\.?\s*(btw|tva|vat)/g) || []).length, excl = (t.match(/excl\.?\s*(btw|tva|vat)/g) || []).length;
      inclBtw = incl > excl;
    }
    return { bron: { url: location.href, host, titel: document.title, adapter: ad.naam, prijzenInclBtw: !!inclBtw }, regels };
  }


  // ---------- Verrijken met de productpagina (enkel lezen: een gewone GET zoals bij het openen van
  // de pagina, met de eigen aanmelding van de gebruiker). Vult enkel velden aan die nog leeg zijn.
  const LABELS = [
    ['ean', /^(ean|ean-?code|gtin|gtin-?13|barcode|streepjescode)\b/i],
    ['fabrikant_artnr', /^((ref(erentie)?|art(ikel)?\.?\s*(nr|nummer|code)?|nr|nummer|code)\.?\s*(van\s*de\s*)?(fabrikant|leverancier|producent)|fabrikant(en)?\s*(ref(erentie)?|art(ikel)?(nr|nummer)?|nr|nummer|code|referentie)|fabr\.?\s*(nr|ref|code)|mpn|manufacturer\s*(part|ref|no|number|code)|typenummer|type-?nr|bestelnummer fabrikant)/i],
    ['merk', /^(merk|brand|fabrikant|producent|manufacturer|marque)\s*:?$/i],
    ['bruto', /^(bruto(prijs)?|catalogus(prijs)?|lijstprijs|adviesprijs|publieke prijs|prix (brut|public)|list ?price)/i],
    ['korting_pct', /^(korting|uw korting|discount|remise)/i],
    ['type_model', /^(type|model|reeks|serie)\s*:?$/i],
    ['categorie', /^(categorie|productgroep|productfamilie|familie|groep)\b/i],
    ['verpakkingseenheid', /^(verpakking(seenheid)?|per verpakking|verkoopeenheid|colli|aantal per verpakking|inhoud)\b/i],
    ['minimumafname', /^(minimum(\s*(afname|bestel\w*))?|min\.?\s*(afname|bestel\w*))/i],
    ['eenheid', /^(eenheid|unit)\s*:?$/i]
  ];
  function labelVeld(l){ l = (l || '').replace(/[:*]+\s*$/, '').trim(); if(!l || l.length > 45) return null; const m = LABELS.find(([, re]) => re.test(l)); return m ? m[0] : null; }
  function detailsUit(doc){
    const uit = {};
    const zet = (k, v) => { v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); if(v && v.length < 120 && uit[k] == null) uit[k] = v; };
    // 1. Gestructureerde data (JSON-LD / microdata)
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(sc => {
      try{
        const stapel = [JSON.parse(sc.textContent)];
        while(stapel.length){
          const o = stapel.pop(); if(!o || typeof o !== 'object') continue;
          if(Array.isArray(o)){ stapel.push(...o); continue; }
          if(o['@graph']) stapel.push(o['@graph']);
          const t = [].concat(o['@type'] || []).join(' ');
          if(/Product/i.test(t)){
            zet('ean', o.gtin13 || o.gtin || o.gtin14 || o.gtin12 || o.gtin8);
            zet('merk', o.brand && (o.brand.name || (typeof o.brand === 'string' ? o.brand : '')));
            zet('fabrikant_artnr', o.mpn); zet('categorie', typeof o.category === 'string' ? o.category : '');
            zet('lange_omschrijving', o.description);
          }
        }
      }catch(e){}
    });
    [['gtin13', 'ean'], ['gtin', 'ean'], ['mpn', 'fabrikant_artnr'], ['brand', 'merk']].forEach(([ip, k]) => {
      const e = doc.querySelector(`[itemprop="${ip}"]`); if(e) zet(k, e.getAttribute('content') || e.textContent);
    });
    // 2. Label/waarde-paren: tabellen, definitielijsten, "Label: waarde" en label-element + volgend element
    doc.querySelectorAll('tr').forEach(tr => { const c = tr.querySelectorAll('th,td'); if(c.length >= 2){ const k = labelVeld(c[0].textContent); if(k) zet(k, c[1].textContent); } });
    doc.querySelectorAll('dt').forEach(dt => { const dd = dt.nextElementSibling; const k = labelVeld(dt.textContent); if(k && dd) zet(k, dd.textContent); });
    doc.querySelectorAll('body *').forEach(el => {
      if(el.children.length > 3) return;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim(); if(!t || t.length > 120) return;
      const m = t.match(/^([^:]{2,45}):\s*(.+)$/);
      if(m){ const k = labelVeld(m[1]); if(k) zet(k, m[2]); return; }
      if(el.children.length === 0 && t.length <= 45){
        const k = labelVeld(t); const nx = el.nextElementSibling;
        if(k && nx && (nx.textContent || '').trim().length < 120) zet(k, nx.textContent);
      }
    });
    if(uit.ean){ const m = uit.ean.match(/\d{8,14}/); uit.ean = m ? m[0] : null; }
    ['bruto', 'korting_pct', 'verpakkingseenheid', 'minimumafname'].forEach(k => { if(uit[k] != null) uit[k] = getal((String(uit[k]).match(/-?\d[\d.,\s]*/) || [''])[0]); if(uit[k] != null) uit[k] = Math.abs(uit[k]); });
    if(!uit.categorie){
      const kruim = Array.from(doc.querySelectorAll('[class*=breadcrumb i] a, nav[aria-label*=breadcrumb i] a, [itemtype*=BreadcrumbList] [itemprop=name]')).map(a => (a.textContent || '').trim()).filter(t => t && !/^(home|start|producten|catalogus)$/i.test(t));
      if(kruim.length) uit.categorie = kruim[kruim.length - 1].slice(0, 80);
    }
    if(uit.lange_omschrijving) uit.lange_omschrijving = uit.lange_omschrijving.slice(0, 500);
    return uit;
  }
  async function verrijk(regels, voortgang){
    const doel = regels.map((r, i) => [r, i]).filter(([r]) => {
      if(!r.url) return false;
      try{ const u = new URL(r.url, location.href); return u.origin === location.origin && !/^javascript:/i.test(r.url); }catch(e){ return false; }
    }).slice(0, 60);
    let klaar = 0;
    const werk = async ([r]) => {
      try{
        const ant = await fetch(new URL(r.url, location.href).href, { credentials: 'include' });
        if(ant.ok && /html/i.test(ant.headers.get('content-type') || 'text/html')){
          const doc = new DOMParser().parseFromString(await ant.text(), 'text/html');
          const d = detailsUit(doc);
          Object.keys(d).forEach(k => { if(d[k] != null && d[k] !== '' && (r[k] == null || r[k] === '')) r[k] = d[k]; });
          r.ruw = Object.assign({}, r.ruw, { detail: (doc.body ? doc.body.innerText || doc.body.textContent : '').replace(/\s+\n/g, '\n').slice(0, 2500), gevonden: Object.keys(d) });
          if(r.bruto != null && r.netto != null && r.korting_pct == null && r.bruto > r.netto) r.korting_pct = Math.round((1 - r.netto / r.bruto) * 100000) / 1000;
        }
      }catch(e){ r.ruw = Object.assign({}, r.ruw, { detailFout: String(e && e.message || e) }); }
      klaar++; if(voortgang) voortgang(klaar, doel.length);
    };
    for(let i = 0; i < doel.length; i += 4) await Promise.all(doel.slice(i, i + 4).map(werk));
    return regels;
  }

  window.__casuiteLezer = { leesMand, algemeen, regelUit, getal, verrijk, detailsUit };
})();
