
/* =========================================================================
   DRIVERKAST — PLAN (2026-10-29, op vraag van Peter: "voor de driverkast ook zo'n design ... eerst
   aangeven hoe groot de beschikbare kast is ... de exacte maten van de drivers ... een rij rijgklemmen
   zoals bij de zekeringkast, maar volgens het aantal spots/strips").
   - Montage gemengd: drivers op schaal op de montageplaat (in rijen, verschuifbaar), rijgklemmen op
     een DIN-rail onderaan (kastzijde boven, kabel/Preflex onder).
   - Rijgklemmen per spot/strip, standaard 2 per spot (+/−), per driver instelbaar (of 1 kabel per driver).
   - Draden: voeding L/N, DALI-bus (of push per kring) en de uitgangen worden automatisch voorgesteld
     (stroomsturing = in serie over de spots, spanning 12/24V = parallel) en zijn daarna vrij aan te passen
     met hetzelfde tekengereedschap als het uitvoeringsplan van de zekeringkast.
   ========================================================================= */
const DK_PXMM = UV.MW / 18;                // zelfde schaal als de zekeringkast (1 module = 18 mm)
const DK_KLEM_MM = 6.2, DK_KLEM_H_MM = 52, DK_TUSSEN_MM = 8;
// Maten (L x B x H in mm) van de drivers die Casentis gebruikt, opgezocht op 29/10/2026.
// Aanpasbaar per type in het zijpaneel (gedeeld met iedereen via elektro_cados_instellingen).
const DK_DRIVER_MATEN = [
  {re: /maxi\s*jol+[iy]/i, l: 124, b: 79, h: 22, aansl: "eind", bron: "TCI DC MAXI JOLLY US DALI (122413) — verlichting.be"},
  {re: /mini\s*jol+[iy]/i, l: 110, b: 52, h: 22, aansl: "eind", bron: "TCI DC MINI JOLLY DALI (122403) — Onninen"},
  {re: /jol+[iy]/i,        l: 103, b: 67, h: 21, aansl: "eind", bron: "TCI DC JOLLY DALI (122424) — TCI-datasheet via Rexel"},
  {re: /pwm-?\s*120/i,     l: 191, b: 63, h: 37.5, aansl: "twee", bron: "Mean Well PWM-120 — datasheet"},
  {re: /pwm-?\s*90/i,      l: 171, b: 63, h: 37.5, aansl: "twee", bron: "Mean Well PWM-90 — datasheet"},
  {re: /pwm-?\s*60/i,      l: 150, b: 53, h: 35, aansl: "twee", bron: "Mean Well PWM-60 — datasheet"},
];
function dkMaatSleutel(naam){ return "driver_maat:" + String(naam||"").trim().toLowerCase(); }
function dkDriverMaat(d){
  const naam = d.naam || d.type || "";
  const eigen = cadosInst[dkMaatSleutel(naam)];
  const std = DK_DRIVER_MATEN.find(x=> x.re.test(naam));
  if(eigen && eigen.l && eigen.b) return Object.assign({aansl: (std && std.aansl) || "eind"}, eigen, {eigen: true, bron: "eigen maat (gedeeld)"});
  if(std) return {l: std.l, b: std.b, h: std.h, aansl: std.aansl, bron: std.bron};
  return {l: 120, b: 60, h: 30, aansl: "eind", onbekend: true, bron: "maat onbekend — vul ze in"};
}
// stroomsturing (350/500/700 mA, in serie) of spanning (12/24 V, parallel)?
function dkIsSpanning(d){
  const naam = d.naam || d.type || "";
  const cat = (state.driver || []).find(x=> String(x.naam||"").trim().toLowerCase()===naam.trim().toLowerCase());
  const info = (cat && cat.info) || "";
  if(/v\s*dc|\d\s*v\b/i.test(info)) return true;
  if(/ma\b/i.test(info)) return false;
  return /pwm|\b(12|24)\s*v/i.test(naam);
}
function dkSpots(d){
  let n = 0;
  (d.armaturen||[]).forEach(a=>{ n += Math.max(0, parseInt(a.aantal) || (a.naam ? 1 : 0)); });
  return n;
}
function dkDrivers(dk){ return (dk.items||[]).filter(d=> !d.leeg && (d.categorie||"Driver")==="Driver"); }
function dkPlan(dk){
  if(!dk.plan || typeof dk.plan !== "object") dk.plan = {};
  const p = dk.plan;
  if(!p.id) p.id = "dkp_" + dk.id;
  if(!(p.breedte > 0)) p.breedte = 600;
  if(!(p.hoogte > 0)) p.hoogte = 800;
  if(!Array.isArray(p.indeling)) p.indeling = [];
  if(!p.klemPerSpot || typeof p.klemPerSpot !== "object") p.klemPerSpot = {};
  if(!Array.isArray(p.bedrading)) p.bedrading = [];
  if(!Array.isArray(p.kamgeleiders)) p.kamgeleiders = [];
  if(p.rkPositie !== "boven") p.rkPositie = "onder";
  return p;
}
// drivers die nog nergens staan: achteraan bijzetten, nieuwe rij als de kast te smal wordt
function dkVulIndeling(dk, opnieuw){
  const p = dkPlan(dk);
  const drivers = dkDrivers(dk);
  const ids = new Set(drivers.map(d=> d.id));
  if(opnieuw) p.indeling = [];
  p.indeling = p.indeling.map(r=> r.filter(id=> ids.has(id))).filter(r=> r.length);
  const geplaatst = new Set(p.indeling.flat());
  const breedteVan = (id)=>{ const d = drivers.find(x=> x.id===id); return d ? dkDriverMaat(d).b : 0; };
  const rijBreedte = (r)=> r.reduce((t, id, i)=> t + breedteVan(id) + (i ? DK_TUSSEN_MM : 0), 0);
  drivers.forEach(d=>{
    if(geplaatst.has(d.id)) return;
    const b = dkDriverMaat(d).b;
    let rij = p.indeling[p.indeling.length-1];
    if(!rij || rijBreedte(rij) + DK_TUSSEN_MM + b > p.breedte - 20) { rij = []; p.indeling.push(rij); }
    rij.push(d.id);
  });
  return p;
}
function dkKringCodes(){ try{ return computeKringCodes(); }catch(_e){ return {}; } }
function dkDriverKlemmen(d, sturing, naarBoven){
  const m = dkDriverMaat(d);
  const push = sturing === "PUSH";
  const inn = [["L","L","L"], ["N","N","N"]].concat(push ? [["P","push","PUSH"]] : [["DA1","DA+","DA"], ["DA2","DA-","DA"]]);
  const uit = [["O+","+","+"], ["O-","-","−"]];
  const k = [];
  const mk = (lijst, zijde, y, x0, x1)=> lijst.forEach(([id, f, lab], i)=>{
    const x = lijst.length===1 ? (x0+x1)/2 : x0 + (x1-x0)*i/(lijst.length-1);
    k.push({id, label: lab, functie: f, zijde, x: Math.round(x*1000)/1000, y, tip: lab==="DA" ? "DALI-bus" : (f==="push" ? "drukknop (push)" : (f==="+"||f==="-" ? "uitgang LED " + f : ""))});
  });
  // Mean Well-drivers hebben aan elk uiteinde kabels: we hangen ze met de ingang (L/N/DALI) onderaan,
  // zodat voeding en bus in dezelfde goot doorlussen als bij de TCI-drivers; de uitgang zit dan boven.
  // De aansluitingen wijzen naar de rijgklemmen: rijgklemmen onderaan -> klemmen van de driver onder,
  // rijgklemmen bovenaan -> de driver hangt omgekeerd, klemmen boven.
  const kant = naarBoven ? "boven" : "onder", ander = naarBoven ? "onder" : "boven";
  const yk = naarBoven ? 0.05 : 0.95, ya = naarBoven ? 0.96 : 0.04;
  if(m.aansl==="twee"){ mk(inn, kant, yk, 0.16, 0.84); mk(uit, ander, ya, 0.3, 0.7); }
  else mk(inn.concat(uit), kant, yk, 0.1, 0.9);
  return k;
}
// rijgklemmen voor één driver: per spot (n klemmen) of 1 kabel per driver
function dkKlemZijden(p){
  // rijgklemmen onderaan: kastzijde boven, kabel (Preflex) onder; bovenaan omgekeerd
  return p.rkPositie==="boven" ? {kast: "onder", yk: 0.9, kabel: "boven", yp: 0.1} : {kast: "boven", yk: 0.1, kabel: "onder", yp: 0.9};
}
function dkKlemmenVoorDriver(d, p, codes){
  const perSpot = p.klemPerSpot[d.id] === undefined ? 2 : p.klemPerSpot[d.id];
  const spots = dkSpots(d);
  const lijst = [];   // {id, label, f, tip}
  const code = codes[d.id] || "D";
  if(perSpot===0 || !spots){
    lijst.push({sp: 0, pol: "+"}, {sp: 0, pol: "-"});
  } else {
    let i = 0;
    (d.armaturen||[]).forEach(a=>{
      const n = Math.max(0, parseInt(a.aantal) || (a.naam ? 1 : 0));
      for(let j=0; j<n; j++){
        i++;
        lijst.push({sp: i, pol: "+", arm: a}, {sp: i, pol: "-", arm: a});
        if(perSpot===3) lijst.push({sp: i, pol: "s", arm: a});
      }
    });
  }
  const n = lijst.length;
  const klemmen = [];
  lijst.forEach((e, i)=>{
    const x = (i + 0.5)/n;
    const lab = (e.sp ? e.sp : "") + (e.pol==="+" ? "+" : (e.pol==="-" ? "−" : "s"));
    const f = e.pol==="s" ? "contact" : e.pol;
    const tip = [code, e.arm ? (e.arm.naam || "") + " " + e.sp : "kabel", e.arm && e.arm.ruimte, e.pol==="+" ? "plus" : (e.pol==="-" ? "min" : "stuur")].filter(Boolean).join(" · ");
    const z = dkKlemZijden(p);
    klemmen.push({id: `k${i}`, label: lab, functie: f, zijde: z.kast, x, y: z.yk, rijgSoort: "kast", tip: tip + " · kastzijde", _sp: e.sp, _pol: e.pol});
    klemmen.push({id: `p${i}`, label: lab, functie: f, zijde: z.kabel, x, y: z.yp, rijgSoort: "preflex", tip: tip + " · kabel", _sp: e.sp, _pol: e.pol});
  });
  return {klemmen, n, perSpot, spots};
}
function dkVoedingKlemmen(dk, drivers, p){
  const lijst = [["L","L"], ["N","N"], ["PE","PE"]];
  if(dk.sturing==="PUSH"){
    const kc = dkKringCodes();
    const kringen = [...new Set(drivers.map(d=> d.kringId).filter(Boolean))];
    if(!kringen.length) lijst.push(["P","push"]);
    kringen.forEach((kid, i)=> lijst.push(["P" + (kc[kid] || (i+1)), "push", kid]));
  } else lijst.push(["DA+","DA+"], ["DA−","DA-"]);
  const n = lijst.length, klemmen = [];
  lijst.forEach(([lab, f, kring], i)=>{
    const x = (i + 0.5)/n;
    const z = dkKlemZijden(p);
    klemmen.push({id: "k" + i, label: lab, functie: f, zijde: z.kast, x, y: z.yk, rijgSoort: "kast", tip: "voeding " + lab + " · kastzijde", _kring: kring || ""});
    klemmen.push({id: "p" + i, label: lab, functie: f, zijde: z.kabel, x, y: z.yp, rijgSoort: "preflex", tip: "voeding " + lab + " · kabel", _kring: kring || ""});
  });
  return {klemmen, n};
}
const dkEigen = (obj, props)=> Object.entries(props).forEach(([k, v])=> Object.defineProperty(obj, k, {value: v, writable: true, configurable: true, enumerable: false}));
// Bouwt van de driverkast een "kast" die het uitvoeringsplan kan tekenen. De afgeleide velden (rijen,
// codes, ...) zijn niet-opsombaar, zodat enkel indeling/bedrading/instellingen bewaard worden.
function dkPlanKast(dk){
  const p = dkVulIndeling(dk);
  const drivers = dkDrivers(dk);
  const codes = Object.assign({}, computeDriverCodes());
  const byId = Object.fromEntries(drivers.map(d=> [d.id, d]));
  const boven = p.rkPositie==="boven";
  const driverRijen = p.indeling.map((r, ri)=>({
    id: "dkr" + ri, _uitlijn: boven ? "boven" : "onder",
    items: r.map((id, i)=>{
      const d = byId[id];
      const maat = dkDriverMaat(d);
      return {id: d.id, categorie: "Driver", naam: d.naam, breedte: 1, _dk: {soort: "driver", driver: d, maat, spanning: dkIsSpanning(d), klemBoven: boven},
        _wPx: maat.b*DK_PXMM, _hPx: maat.l*DK_PXMM, _gapPx: i ? DK_TUSSEN_MM*DK_PXMM : 0, klemmenEigen: dkDriverKlemmen(d, dk.sturing, boven)};
    })
  }));
  // Alle rijgklemmen samen onderaan (of bovenaan) de kast, op één of meer DIN-rails: eerst de voeding,
  // dan per driver een blok in de volgorde van de drivers.
  const v = dkVoedingKlemmen(dk, drivers, p);
  codes["dkv_" + dk.id] = "V";
  const blokken = [{id: "dkv_" + dk.id, categorie: "Driverklemmen", naam: "Voeding", breedte: 1, _dk: {soort: "voeding"},
    _wPx: v.n*DK_KLEM_MM*DK_PXMM, _hPx: DK_KLEM_H_MM*DK_PXMM, klemmenEigen: v.klemmen}];
  p.indeling.flat().forEach(id=>{
    const d = byId[id];
    const kb = dkKlemmenVoorDriver(d, p, codes);
    codes["dkk_" + d.id] = codes[d.id];
    blokken.push({id: "dkk_" + d.id, categorie: "Driverklemmen", naam: d.naam, breedte: 1, _dk: {soort: "klemmen", driver: d, perSpot: kb.perSpot, spots: kb.spots},
      _wPx: kb.n*DK_KLEM_MM*DK_PXMM, _hPx: DK_KLEM_H_MM*DK_PXMM, klemmenEigen: kb.klemmen});
  });
  const railMax = p.breedte*DK_PXMM - 20;
  const rails = [];
  let rail = null, bx = 0;
  blokken.forEach(b=>{
    const gap = 3*DK_PXMM;
    b._gapPx = 0;
    if(!rail || bx + gap + b._wPx > railMax){ rail = {id: "dkrail" + rails.length, items: [], _rail: true}; rails.push(rail); bx = 0; }
    else { b._gapPx = gap; bx += gap; }
    rail.items.push(b);
    bx += b._wPx;
  });
  const rijen = boven ? [...rails, ...driverRijen] : [...driverRijen, ...rails];
  const idx = state.driverkast.kasten.indexOf(dk);
  dkEigen(p, {
    rijen, maat: Math.ceil(p.breedte/18), naam: "Driverkast " + (idx+1), _dk: dk, _codes: codes,
    _breedtePx: p.breedte*DK_PXMM, _dkAchtergrond: (geo)=> dkAchtergrondSvg(p, geo)
  });
  return p;
}
function dkAchtergrondSvg(p, geo){
  const hNodig = geo.height / DK_PXMM;
  const x = geo.padL - 4, w = p.breedte*DK_PXMM + 8, h = p.hoogte*DK_PXMM;
  const te = hNodig > p.hoogte;
  let s = `<rect x="${x}" y="0" width="${w}" height="${Math.max(h, geo.height)}" class="dk-plaat"/>`;
  s += `<rect x="${x}" y="0" width="${w}" height="${h}" class="dk-kast${te ? " te-klein" : ""}"/>`;
  const kastTekst = p.kast ? `Rittal ${p.kast.naam} ${p.kast.b}×${p.kast.h}×${p.kast.d} — montageplaat ${p.breedte} × ${p.hoogte} mm` : `montageplaat ${p.breedte} × ${p.hoogte} mm`;
  s += `<text x="${x + w - 4}" y="${Math.min(h, geo.height) - 5}" class="dk-kastmaat">${escapeHtml(kastTekst)}${te ? " — te klein (nodig ±" + Math.ceil(hNodig/10)*10 + " mm)" : ""}</text>`;
  return s;
}
function dkModuleSvg(md){
  const {m, x, y, w, h, code} = md;
  const info = m._dk;
  const sel = uvSelMod===m.id ? " sel" : "";
  if(info.soort==="driver"){
    const d = info.driver, maat = info.maat;
    const arm = (d.armaturen||[]).filter(a=> a.naam).map(a=> (parseInt(a.aantal)||1) + "× " + a.naam).join(", ");
    const ruimte = [...new Set((d.armaturen||[]).map(a=> a.ruimte).filter(Boolean))].join(", ");
    const tip = [code + " — " + (d.naam || "driver"), `${maat.l} × ${maat.b} × ${maat.h} mm${maat.onbekend ? " (maat onbekend)" : ""}`, info.spanning ? "spanningsgestuurd (parallel)" : "stroomgestuurd (in serie)", arm, ruimte].filter(Boolean).join("\n");
    let s = `<g class="uv-mod dk-driver${sel}${maat.onbekend ? " onbekend" : ""}" data-mod="${m.id}" data-tip="${escapeHtml(tip)}">`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" class="dk-body"/>`;
    const eind = maat.aansl==="twee";
    const stripBoven = `<rect x="${x+2}" y="${y+2}" width="${w-4}" height="${Math.min(24, h*0.16)}" rx="2" class="dk-klemstrook"/>`;
    const stripOnder = `<rect x="${x+2}" y="${y + h - Math.min(24, h*0.16) - 2}" width="${w-4}" height="${Math.min(24, h*0.16)}" rx="2" class="dk-klemstrook"/>`;
    s += eind ? stripBoven + stripOnder : (info.klemBoven ? stripBoven : stripOnder);
    const cx = x + w/2;
    s += `<rect x="${cx-17}" y="${y + h*(info.klemBoven ? 0.24 : 0.2)}" width="34" height="17" rx="4" class="uv-code-bg"/><text x="${cx}" y="${y + h*(info.klemBoven ? 0.24 : 0.2) + 12.5}" class="uv-code">${escapeHtml(code)}</text>`;
    const regels = String(d.naam || "driver").replace(/^tci\s+/i, "TCI ").replace(/meanwel+\b/i, "Mean Well").split(/\s+/);
    // naam in max. 3 regels, verticaal gecentreerd
    const lijnen = []; let huidig = "";
    regels.forEach(wd=>{ if((huidig + " " + wd).trim().length * 5.6 > w - 6 && huidig){ lijnen.push(huidig); huidig = wd; } else huidig = (huidig + " " + wd).trim(); });
    if(huidig) lijnen.push(huidig);
    lijnen.slice(0, 3).forEach((l, i)=>{ s += `<text x="${cx}" y="${y + h*0.42 + i*11}" class="dk-naam">${escapeHtml(l)}</text>`; });
    s += `<text x="${cx}" y="${y + h*0.42 + Math.min(3, lijnen.length)*11 + 4}" class="dk-maat">${maat.l}×${maat.b} mm</text>`;
    if(arm) s += `<text x="${cx}" y="${y + h*0.42 + Math.min(3, lijnen.length)*11 + 16}" class="dk-arm">${escapeHtml(dkSpots(d) + " × " + ((d.armaturen||[])[0]||{}).naam).slice(0, Math.floor(w/4.6))}</text>`;
    s += `</g>`;
    return s;
  }
  // rijgklemblok (voeding of driver)
  const isV = info.soort==="voeding";
  const d = info.driver;
  const tip = isV ? "Voeding & sturing" : [code + " — " + (d.naam||""), info.perSpot===0 ? "1 kabel per driver" : `${info.spots} spot(s) × ${info.perSpot} klemmen`, [...new Set((d.armaturen||[]).map(a=> a.ruimte).filter(Boolean))].join(", ")].filter(Boolean).join("\n");
  let s = `<g class="uv-mod dk-blok${sel}${isV ? " voeding" : ""}" data-mod="${m.id}" data-tip="${escapeHtml(tip)}">`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" class="dk-blok-body"/>`;
  const n = (m.klemmenEigen||[]).length/2;
  for(let i=1; i<n; i++){ const xs = x + w*i/n; s += `<line x1="${xs}" y1="${y+3}" x2="${xs}" y2="${y+h-3}" class="dk-klemlijn${(m.klemmenEigen[i*2]||{})._sp !== (m.klemmenEigen[i*2-2]||{})._sp ? " spot" : ""}"/>`; }
  const lab = isV ? "VOEDING" : code;
  if(w > 30) s += `<text x="${x + w/2}" y="${y + h/2 + 3}" class="dk-blok-lab">${escapeHtml(lab)}</text>`;
  else s += `<text transform="translate(${x + w/2 + 3} ${y + h/2}) rotate(-90)" class="dk-blok-lab">${escapeHtml(lab)}</text>`;
  s += `</g>`;
  return s;
}

// Automatisch voorstel voor de draden
function dkOmzet(p){
  const dk = p._dk;
  p.bedrading = p.bedrading.filter(w=> !w.auto);
  const drivers = p.indeling.flat().map(id=> dkDrivers(dk).find(d=> d.id===id)).filter(Boolean);
  const vId = "dkv_" + dk.id;
  const v = p.rijen.flatMap(r=> r.items).find(m=> m.id===vId);
  const vk = (lab)=>{ const k = (v.klemmenEigen||[]).find(k=> k.rijgSoort==="kast" && k.label===lab); return k ? {m: vId, k: k.id} : null; };
  const nieuw = [];
  const draad = (a, b, sectie)=>{ if(a && b) nieuw.push({id: cryptoId(), a, b, kleur: "Bruin", kleurAuto: true, sectie: sectie || "1.5", label: "", auto: true}); };
  const keten = (start, klemId, lijst)=>{ let vorige = start; lijst.forEach(d=>{ const cur = {m: d.id, k: klemId}; draad(vorige, cur); vorige = cur; }); };
  keten(vk("L"), "L", drivers);
  keten(vk("N"), "N", drivers);
  if(dk.sturing==="PUSH"){
    const kc = dkKringCodes();
    const perKring = {};
    drivers.forEach(d=>{ (perKring[d.kringId||""] = perKring[d.kringId||""] || []).push(d); });
    Object.entries(perKring).forEach(([kid, lijst])=>{
      const k = (v.klemmenEigen||[]).find(k=> k.rijgSoort==="kast" && k.functie==="push" && (k._kring===kid || !kid));
      keten(k ? {m: vId, k: k.id} : null, "P", lijst);
    });
    void kc;
  } else {
    keten(vk("DA+"), "DA1", drivers);
    keten(vk("DA−"), "DA2", drivers);
  }
  // uitgangen naar de rijgklemmen
  drivers.forEach(d=>{
    const blok = p.rijen.flatMap(r=> r.items).find(m=> m.id==="dkk_" + d.id);
    if(!blok) return;
    const kast = (blok.klemmenEigen||[]).filter(k=> k.rijgSoort==="kast");
    const plus = kast.filter(k=> k._pol==="+"), min = kast.filter(k=> k._pol==="-");
    const B = (k)=> ({m: blok.id, k: k.id});
    const D = (id)=> ({m: d.id, k: id});
    if(!plus.length) return;
    if(dkIsSpanning(d) || plus.length===1){
      // parallel: + naar alle plussen, − naar alle minnen (doorverbonden van klem naar klem)
      let a = D("O+"); plus.forEach(k=>{ draad(a, B(k)); a = B(k); });
      a = D("O-"); min.forEach(k=>{ draad(a, B(k)); a = B(k); });
    } else {
      // in serie: + -> spot1+, spot1− -> spot2+, ..., laatste − -> driver −
      draad(D("O+"), B(plus[0]));
      for(let i=0; i<plus.length-1; i++) draad(B(min[i]), B(plus[i+1]));
      draad(B(min[min.length-1]), D("O-"));
    }
  });
  p.bedrading.push(...nieuw);
  return `Voorstel: ${nieuw.length} draden (voeding, ${dk.sturing==="PUSH" ? "push" : "DALI-bus"} en uitgangen naar de rijgklemmen).`;
}


/* Rittal AX compactkasten, plaatstaal (2026-10-29, Peter: "driverkast keuze volgens deze modellen
   [Rittal AX] ... aan elkaar gelinkt om de afmetingen te bepalen, dan weten we direct welke kast te
   bestellen"). Kastmaat B x H x D en de bruikbare montageplaat B x H, uit Rittal "Compact enclosures AX —
   Technical details" (via TME, AX 1031.000-datasheet). De drivers worden op de montageplaat geplaatst. */
const RITTAL_AX = [
  ["1033000",300,300,210,250,275],["1034000",300,400,210,250,375],["1031000",380,300,210,330,275],["1380000",380,380,210,330,355],
  ["1038000",380,600,210,330,575],["1338000",380,600,350,330,575],["1045000",400,500,210,350,475],["1037000",400,800,300,345,775],
  ["1050000",500,500,210,450,475],["1350000",500,500,300,450,475],["1057000",500,700,250,450,675],["1039000",600,380,210,550,355],
  ["1339000",600,380,350,550,355],["1060000",600,600,210,550,575],["1054000",600,600,250,550,575],["1360000",600,600,350,550,575],
  ["1076000",600,760,210,550,735],["1376000",600,760,350,550,735],["1058000",600,800,250,545,775],["1059000",600,800,400,545,775],
  ["1090000",600,1000,250,545,975],["1091000",600,1000,400,545,975],["1260000",600,1200,300,545,1175],["1261000",600,1200,400,545,1175],
  ["1077000",760,760,210,705,735],["1073000",760,760,300,705,735],["1055000",800,600,300,750,575],["1180000",800,1000,300,745,975],
  ["1181000",800,1000,400,745,975],["1280000",800,1200,300,745,1175],["1281000",800,1200,400,745,1175],["1100000",1000,760,210,945,735],
  ["1130000",1000,760,300,945,735],["1110000",1000,1000,300,945,975],["1213000",1000,1200,300,945,1175],["1214000",1000,1200,400,945,1175],
  ["1114000",1000,1400,300,945,1375],["1115000",1000,1400,400,945,1375],["1116000",1200,1200,400,1145,1175]
].map(([art, b, h, d, pb, ph])=> ({art, b, h, d, pb, ph, naam: "AX " + art.slice(0,4) + "." + art.slice(4), deuren: b >= 1000 ? 2 : 1}));
function rittalUrl(art){ return "https://www.rittal.com/nl-nl/products/PG20231215SCH101/PG20231512SCH301/PRO70743?variantId=" + art; }
function rittalLabel(k){ return `${k.naam} — ${k.b}×${k.h}×${k.d} mm (plaat ${k.pb}×${k.ph})`; }
// Benodigde hoogte voor een gegeven montageplaatbreedte: de indeling tijdelijk herschikken en meten.
const dkAdviesCache = new Map();
function dkNodigeHoogte(dk, plaatB){
  const p = dkPlan(dk);
  const bak = JSON.stringify(p);
  try{
    p.breedte = plaatB;
    dkVulIndeling(dk, true);
    dkPlanKast(dk);
    return uvGeometrie(p).height / DK_PXMM;
  } finally {
    Object.keys(p).forEach(k=>{ delete p[k]; });
    Object.assign(p, JSON.parse(bak));
    dkPlanKast(dk);
  }
}
function dkKastAdvies(dk){
  const p = dkPlan(dk);
  const sig = JSON.stringify([dkDrivers(dk).map(d=> [d.naam, d.armaturen && d.armaturen.map(a=> a.aantal)]), p.klemPerSpot, p.rkPositie, p.bedrading.length, dk.sturing,
    Object.keys(cadosInst).filter(k=> k.startsWith("driver_maat:")).map(k=> JSON.stringify(cadosInst[k]))]);
  if(dkAdviesCache.has(sig)) return dkAdviesCache.get(sig);
  const maxB = Math.max(0, ...dkDrivers(dk).map(d=> dkDriverMaat(d).b));
  const perBreedte = {};
  const lijst = RITTAL_AX.map(k=>{
    if(perBreedte[k.pb] === undefined) perBreedte[k.pb] = maxB + 20 > k.pb ? Infinity : dkNodigeHoogte(dk, k.pb);
    const nodig = perBreedte[k.pb];
    return Object.assign({}, k, {nodig, past: nodig <= k.ph});
  });
  const passend = lijst.filter(k=> k.past).sort((a, b)=> (a.b*a.h - b.b*b.h) || (a.d - b.d));
  const res = {lijst, beste: passend[0] || null};
  dkAdviesCache.set(sig, res);
  return res;
}

let dkHuidigId = null;
function dkHuidig(){
  if(!state.driverkast || !Array.isArray(state.driverkast.kasten)) return null;
  let dk = state.driverkast.kasten.find(k=> k.id===dkHuidigId) || state.driverkast.kasten[0] || null;
  if(dk) dkHuidigId = dk.id;
  return dk;
}
function dkExport(){
  const container = document.getElementById("printExport");
  container.innerHTML = "";
  const projectNaam = state.instellingen.project || "Naamloos project";
  state.driverkast.kasten.forEach((dk, i)=>{
    if(!dkDrivers(dk).length) return;
    const p = dkPlanKast(dk);
    uvSyncEnOpruimen(p);
    const res = bouwBedradingSvg(p, false);
    const page = el(`<div class="pe-page" data-content="schema"><div class="pe-title">${escapeHtml(projectNaam)}</div>
      <div class="pe-sub">Driverkast ${i+1}${dk.kamer ? " · " + escapeHtml(dk.kamer) : ""} — plan · kast ${p.breedte} × ${p.hoogte} mm · ${escapeHtml(dk.sturing||"")} · ${new Date().toLocaleDateString("nl-BE")}</div>
      <div class="uv-export-svg">${res.svg}</div></div>`);
    container.appendChild(page);
  });
  if(!container.children.length){ alert("Er staan nog geen drivers in een driverkast."); return; }
  document.body.classList.add("print-patchkast");
  window.print();
  const cleanup = ()=>{ document.body.classList.remove("print-patchkast"); window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 5000);
}
function dkVerplaats(p, id, richting){
  const ri = p.indeling.findIndex(r=> r.includes(id));
  if(ri < 0) return;
  const r = p.indeling[ri], i = r.indexOf(id);
  if(richting==="links" && i > 0){ r.splice(i, 1); r.splice(i-1, 0, id); }
  else if(richting==="rechts" && i < r.length-1){ r.splice(i, 1); r.splice(i+1, 0, id); }
  else if(richting==="op" && ri > 0){ r.splice(i, 1); p.indeling[ri-1].push(id); }
  else if(richting==="neer"){ r.splice(i, 1); if(!p.indeling[ri+1]) p.indeling.push([]); p.indeling[ri+1].unshift(id); }
  p.indeling = p.indeling.filter(x=> x.length);
}
const UV_CTX_DK = {
  tab: "driverplan", panelId: "panel-driverplan", titel: "Driverkast plan", zekering: false, eendraad: false, kam: false,
  kast: ()=>{ const dk = dkHuidig(); return dk ? dkPlanKast(dk) : null; },
  huidigId: ()=> dkHuidigId,
  kasten: ()=> state.driverkast.kasten.map((k, i)=> ({id: k.id, naam: "Driverkast " + (i+1) + (k.kamer ? " · " + k.kamer : "")})),
  kiesKast: (id)=>{ dkHuidigId = id; },
  layoutTab: "driverkast", layoutTitel: "drivers en armaturen aanpassen op het tabblad Driverkast",
  omzetLabel: "Draden voorstellen", omzetTitel: "voeding L/N, DALI-bus (of push) en de uitgangen naar de rijgklemmen automatisch tekenen",
  omzet: (p)=> dkOmzet(p),
  voorTeken: (p)=>{ if(p._dk) dkPlanKast(p._dk); },
  export: ()=> dkExport(),
  hulpTekst: "Welke drivers en armaturen er in de kast zitten, pas je aan op het tabblad Driverkast. Hier bepaal je de kastmaat, de plaats van de drivers en de rijgklemmen.",
  extraKaart: (zone, h)=>{
    const p = h.kast, dk = p._dk;
    const adv = dkKastAdvies(dk);
    const huidig = p.kast && RITTAL_AX.find(k=> k.art===p.kast.art);
    const nodigNu = uvGeometrie(p).height / DK_PXMM;
    const box = el(`<div class="card"><div class="card-body uv-sidebody">
      <strong>Kast</strong>
      <label class="uv-veld">Rittal AX (plaatstaal)<select class="dk-kast">
        <option value="">Eigen maat (montageplaat)</option>
        ${adv.lijst.map(k=> `<option value="${k.art}" ${huidig && huidig.art===k.art ? "selected" : ""}>${k.past ? "✓" : "✗"} ${escapeHtml(rittalLabel(k))}</option>`).join("")}
      </select></label>
      ${adv.beste ? `<div class="dk-advies">Kleinste kast die past: <strong>${escapeHtml(adv.beste.naam)}</strong> ${adv.beste.b}×${adv.beste.h}×${adv.beste.d} mm
        ${huidig && huidig.art===adv.beste.art ? "" : `<button class="btn small primary dk-kies">Kiezen</button>`}</div>` : `<div class="uv-fout">Geen enkele AX-kast is groot genoeg — verdeel over meer kasten of kies een eigen maat.</div>`}
      ${huidig ? `<div class="hint">${escapeHtml(huidig.deuren)} deur(en) · montageplaat ${huidig.pb}×${huidig.ph} mm · nodig ±${Math.ceil(nodigNu/5)*5} mm hoog${nodigNu > huidig.ph ? ' <span class="uv-fout-tel">past niet</span>' : ""} · <a href="${rittalUrl(huidig.art)}" target="_blank" rel="noopener">bekijk bij Rittal ↗</a></div>` : `
      <div class="uv-rij2">
        <label class="uv-veld">Breedte (mm)<input type="number" min="200" step="50" class="dk-b" value="${p.breedte}"></label>
        <label class="uv-veld">Hoogte (mm)<input type="number" min="200" step="50" class="dk-h" value="${p.hoogte}"></label>
      </div>`}
      <label class="uv-veld">Rijgklemmen<select class="dk-rkpos">
        <option value="onder" ${p.rkPositie!=="boven"?"selected":""}>Onderaan — kastzijde boven, kabel onder</option>
        <option value="boven" ${p.rkPositie==="boven"?"selected":""}>Bovenaan — kabel boven, kastzijde onder</option></select></label>
      <div class="hint">Sturing ${escapeHtml(dk.sturing||"DALI")} · ${dkDrivers(dk).length} drivers · ${dkDrivers(dk).reduce((t, d)=> t + dkSpots(d), 0)} spots/strips</div>
      <button class="btn small ghost dk-herschik" title="alle drivers opnieuw in rijen zetten volgens de breedte van de montageplaat">↻ Drivers herschikken</button>
    </div></div>`);
    const kiesKast = (art)=>{
      const k = RITTAL_AX.find(x=> x.art===art);
      if(k){ p.kast = {art: k.art, naam: k.naam, b: k.b, h: k.h, d: k.d}; p.breedte = k.pb; p.hoogte = k.ph; }
      else delete p.kast;
      dkVulIndeling(dk, true);
      save(); h.rerender();
    };
    box.querySelector(".dk-kast").addEventListener("change", e=> kiesKast(e.target.value));
    const kb = box.querySelector(".dk-kies");
    if(kb) kb.addEventListener("click", ()=> kiesKast(adv.beste.art));
    const zet = ()=>{ p.breedte = Math.max(200, parseInt(box.querySelector(".dk-b").value)||600); p.hoogte = Math.max(200, parseInt(box.querySelector(".dk-h").value)||800); save(); h.rerender(); };
    const ib = box.querySelector(".dk-b");
    if(ib){ ib.addEventListener("change", zet); box.querySelector(".dk-h").addEventListener("change", zet); }
    box.querySelector(".dk-rkpos").addEventListener("change", e=>{
      p.rkPositie = e.target.value;
      save(); h.rerender();
    });
    box.querySelector(".dk-herschik").addEventListener("click", ()=>{ dkVulIndeling(dk, true); save(); h.rerender(); });
    zone.appendChild(box);
  },
  moduleDetail: (md, zone, h)=>{
    const p = h.kast, dk = p._dk, info = md._dk;   // md = de (pseudo)module zelf
    const d = info.driver;
    const codes = p._codes;
    if(info.soort==="voeding"){
      zone.appendChild(el(`<div class="card uv-detail"><div class="card-body uv-sidebody"><strong>Voeding &amp; sturing</strong>
        <div class="hint">Rijgklemmen voor de voedingskabel (L, N, PE) en ${dk.sturing==="PUSH" ? "de drukknoppen per kring" : "de DALI-bus"}. Kastzijde boven, kabel onder.</div></div></div>`));
      return;
    }
    const maat = dkDriverMaat(d);
    const perSpot = p.klemPerSpot[d.id] === undefined ? 2 : p.klemPerSpot[d.id];
    const box = el(`<div class="card uv-detail"><div class="card-body uv-sidebody">
      <div class="uv-detail-kop"><strong>${escapeHtml(codes[d.id]||"")} ${escapeHtml(d.naam||"driver")}</strong></div>
      <div class="hint">${escapeHtml((d.armaturen||[]).filter(a=> a.naam).map(a=> (parseInt(a.aantal)||1) + "× " + a.naam + (a.ruimte ? " (" + a.ruimte + ")" : "")).join(", ") || "geen armaturen")}<br>${dkIsSpanning(d) ? "spanningsgestuurd — spots/strips parallel" : "stroomgestuurd — spots in serie"}</div>
      <label class="uv-veld">Rijgklemmen<select class="dk-ps">
        <option value="2" ${perSpot===2?"selected":""}>2 per spot/strip (+ en −)</option>
        <option value="3" ${perSpot===3?"selected":""}>3 per spot (+, − en stuurdraad)</option>
        <option value="0" ${perSpot===0?"selected":""}>1 kabel per driver (2 klemmen)</option></select></label>
      ${info.soort==="driver" ? `<div class="uv-veld">Maat (L × B × H mm)${maat.onbekend ? ' <span class="uv-fout-tel">onbekend</span>' : ""}
        <div class="dk-maatrij"><input type="number" class="dk-ml" value="${maat.l}"><input type="number" class="dk-mb" value="${maat.b}"><input type="number" class="dk-mh" value="${maat.h}"></div>
        <div class="hint">${escapeHtml(maat.bron)} — geldt voor alle "${escapeHtml(d.naam||"")}"</div></div>
      <div class="uv-veld">Plaats<div class="uv-knoprij">
        <button class="btn small ghost dk-mv" data-r="links" title="naar links">←</button><button class="btn small ghost dk-mv" data-r="rechts" title="naar rechts">→</button>
        <button class="btn small ghost dk-mv" data-r="op" title="naar de rij erboven">↑ rij</button><button class="btn small ghost dk-mv" data-r="neer" title="naar de rij eronder">↓ rij</button></div></div>` : ""}
      <div class="uv-knoprij"><button class="btn small ghost dk-layout">Op tabblad Driverkast</button></div>
    </div></div>`);
    box.querySelector(".dk-ps").addEventListener("change", e=>{ p.klemPerSpot[d.id] = parseInt(e.target.value); save(); h.rerender(); });
    box.querySelectorAll(".dk-mv").forEach(b=> b.addEventListener("click", ()=>{ dkVerplaats(p, d.id, b.dataset.r); save(); h.rerender(); }));
    const ml = box.querySelector(".dk-ml");
    if(ml){
      const zetMaat = async ()=>{
        const l = parseFloat(box.querySelector(".dk-ml").value), b = parseFloat(box.querySelector(".dk-mb").value), hh = parseFloat(box.querySelector(".dk-mh").value);
        if(!(l > 0 && b > 0)) return;
        try{ await bewaarCadosInst(dkMaatSleutel(d.naam||d.type), {l, b, h: hh || 0}); toast(`Maat van "${d.naam}" bewaard (${l} × ${b} mm) — geldt voor alle projecten`); }
        catch(err){ alert("Bewaren mislukt: " + (err.message||err)); }
        h.rerender();
      };
      ["dk-ml","dk-mb","dk-mh"].forEach(c=> box.querySelector("." + c).addEventListener("change", zetMaat));
    }
    box.querySelector(".dk-layout").addEventListener("click", ()=> selectTab("driverkast"));
    zone.appendChild(box);
  },
};
function renderDriverplan(){
  const dk = dkHuidig();
  if(!dk || !dkDrivers(dk).length){
    return el(`<div class="panel" id="panel-driverplan"><div class="card"><div class="card-body">
      <strong>Driverkast plan</strong><p class="hint">Er staan nog geen drivers in een driverkast. Voeg ze eerst toe op het tabblad <a href="#" onclick="return false;">Driverkast</a>.</p></div></div></div>`);
  }
  if(!cadosInstGeladen) laadAllesVoorUitvoering().then(()=>{ if(document.getElementById("panel-driverplan")) selectTab("driverplan"); });
  return renderUitvoeringsplan(UV_CTX_DK);
}
