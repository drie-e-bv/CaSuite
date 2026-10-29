
/* =========================================================================
   DRIVERKAST — PLAN (2026-10-29, op vraag van Peter). Opbouw zoals Casentis de driverkast tekent:
   - bovenaan (of onderaan) een DIN-rail met de werkschakelaar (voeding uitschakelen), Phoenix-
     verdeelblokjes (L, N en de DALI-bus doorverbinden) en de rijgklemmen per spot/strip;
   - daaronder een horizontale bedradingskoker over de volle breedte;
   - de drivers LIGGEND in kolommen, met verticale bedradingskokers (30/40/50/60 mm) aan de kant van
     de aansluitingen. Stroomgestuurde drivers (TCI) hebben alle aansluitingen aan één kant (draaibaar),
     24V-drivers (Mean Well) links én rechts.
   Draden lopen van de klem de koker in, door de koker en de horizontale koker naar de andere klem.
   Alles op schaal in mm (zelfde schaal als de zekeringkast) en exporteerbaar naar DXF.
   ========================================================================= */
const DK_PXMM = UV.MW / 18;
const DK_KLEM_MM = 5.2, DK_RAIL_H_MM = 48, DK_RAND_MM = 10, DK_TUSSEN_MM = 10, DK_SCHAK_MM = 36;
// Phoenix 3273112 (opgave Peter, 29/10): verdeelblok met verticale uitlijning en geïntegreerde voeding,
// push-in, 19 aansluitingen (1 voeding + 18), 0,14-4 mm², 28,6 mm breed, 28,7 mm hoog. Casentis gebruikt
// bruin (L) en blauw (N) voor 230V en 2x grijs voor DALI. Meer dan 18 drivers = een tweede blok.
const DK_PTFIX_UIT = 18, DK_PTFIX_MM = 28.6, DK_PTFIX_ART = "3273112";
function dkPhoenixBlokken(uitgangen){ return Math.max(1, Math.ceil(uitgangen / DK_PTFIX_UIT)); }
function dkPhoenixBreedte(punten){ const b = dkPhoenixBlokken(Math.max(0, punten - 1)); return b*DK_PTFIX_MM + (b-1)*2; }
const DK_PTFIX_KLEUR = {L: "bruin", N: "blauw", "DA+": "grijs", "DA-": "grijs", push: "grijs"};
// rijgklemmen: enkel (1 niveau) of dubbel (2 niveaus: + boven, − eronder op dezelfde klem)
function dkRijgBreedte(lijst, p){ return (p.rkDubbel ? Math.ceil(lijst.length/2) : lijst.length) * DK_KLEM_MM; }
const DK_KOKERS = [30, 40, 50, 60];
const DK_TOP_PX = 18;
// Maten (L x B x H in mm) van de drivers die Casentis gebruikt, opgezocht op 29/10/2026.
// Aanpasbaar per type in het zijpaneel (gedeeld via elektro_cados_instellingen).
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
// aansluitingen aan beide kanten (24V Mean Well) of aan één kant (TCI)?
function dkTweeKanten(d){ return dkDriverMaat(d).aansl === "twee"; }
function dkSpots(d){
  let n = 0;
  (d.armaturen||[]).forEach(a=>{ n += Math.max(0, parseInt(a.aantal) || (a.naam ? 1 : 0)); });
  return n;
}
function dkDrivers(dk){ return (dk.items||[]).filter(d=> !d.leeg && (d.categorie||"Driver")==="Driver"); }
function dkKringCodes(){ try{ return computeKringCodes(); }catch(_e){ return {}; } }
function dkPlan(dk){
  if(!dk.plan || typeof dk.plan !== "object") dk.plan = {};
  const p = dk.plan;
  if(!p.id) p.id = "dkp_" + dk.id;
  if(!(p.breedte > 0)) p.breedte = 545;
  if(!(p.hoogte > 0)) p.hoogte = 775;
  if(!Array.isArray(p.kolommen)) p.kolommen = [];
  if(!p.draai || typeof p.draai !== "object") p.draai = {};
  if(!p.klemPerSpot || typeof p.klemPerSpot !== "object") p.klemPerSpot = {};
  if(!Array.isArray(p.bedrading)) p.bedrading = [];
  if(!Array.isArray(p.kamgeleiders)) p.kamgeleiders = [];
  if(!DK_KOKERS.includes(p.kokerV)) p.kokerV = 40;
  if(!DK_KOKERS.includes(p.kokerH)) p.kokerH = 40;
  if(p.rkPositie !== "onder") p.rkPositie = "boven";
  if(p.rkDubbel === undefined) p.rkDubbel = true;   // Casentis gebruikt dubbele rijgklemmen in de driverkast
  delete p.indeling;   // oude rij-indeling (eerste testversie)
  return p;
}

/* ---------- klemlijsten ---------- */
function dkPushKringen(dk){ return [...new Set(dkDrivers(dk).map(d=> d.kringId).filter(Boolean))]; }
// rijgklemmen van één driver: per spot (2 of 3) of 1 kabel per driver
function dkKlemLijst(d, p){
  const perSpot = p.klemPerSpot[d.id] === undefined ? 2 : p.klemPerSpot[d.id];
  const spots = dkSpots(d);
  const lijst = [];
  if(perSpot===0 || !spots){ lijst.push({sp: 0, pol: "+"}, {sp: 0, pol: "-"}); return lijst; }
  let i = 0;
  (d.armaturen||[]).forEach(a=>{
    const n = Math.max(0, parseInt(a.aantal) || (a.naam ? 1 : 0));
    for(let j=0; j<n; j++){
      i++;
      lijst.push({sp: i, pol: "+", arm: a}, {sp: i, pol: "-", arm: a});
      if(perSpot===3) lijst.push({sp: i, pol: "s", arm: a});
    }
  });
  return lijst;
}
function dkRailBreedte(dk, p){
  const drivers = dkDrivers(dk);
  const n = drivers.length;
  const phx = 2 + (dk.sturing !== "PUSH" ? 2 : dkPushKringen(dk).length);
  let mm = DK_SCHAK_MM + 3 + phx * (dkPhoenixBreedte(n + 1) + 3);
  drivers.forEach(d=>{ mm += dkRijgBreedte(dkKlemLijst(d, p), p) + 3; });
  return mm - 3;
}
// klemmen op de driver zelf: aan de kant(en) van de aansluitingen, verdeeld over de breedte (B)
function dkDriverKlemmen(d, sturing, kant){
  const push = sturing === "PUSH";
  const inn = [["L","L","L"], ["N","N","N"]].concat(push ? [["P","push","P"]] : [["DA1","DA+","DA"], ["DA2","DA-","DA"]]);
  const uit = [["O+","+","+"], ["O-","-","−"]];
  const k = [];
  const mk = (lijst, zijde)=> lijst.forEach(([id, f, lab], i)=>{
    const y = lijst.length===1 ? 0.5 : 0.14 + 0.72*i/(lijst.length-1);
    k.push({id, label: lab, functie: f, zijde: zijde==="L" ? "links" : "rechts", x: zijde==="L" ? 0 : 1, y: Math.round(y*1000)/1000, geenLabel: true,
      tip: lab==="DA" ? "DALI-bus" : (f==="push" ? "drukknop (push)" : (f==="+"||f==="-" ? "uitgang LED " + f : f))});
  });
  if(kant === "beide"){ mk(inn, "L"); mk(uit, "R"); }
  else mk(inn.concat(uit), kant);
  return k;
}

/* ---------- indeling in kolommen ---------- */
// Aan welke kant zitten de aansluitingen? (standaard naar de koker tussen de kolommen; draaibaar)
function dkKant(p, d, ci, k){
  if(dkTweeKanten(d)) return "beide";
  if(p.draai[d.id] === "L" || p.draai[d.id] === "R") return p.draai[d.id];
  if(k === 1) return "R";
  return ci === 0 ? "R" : "L";
}
// Welke verticale kokers zijn nodig: koker i ligt links van kolom i (i = k: rechts van de laatste)
function dkKokerPosities(p, cols){
  const k = cols.length;
  const nodig = new Set();
  cols.forEach((c, ci)=> c.forEach(d=>{
    const kant = dkKant(p, d, ci, k);
    if(kant === "beide"){ nodig.add(ci); nodig.add(ci+1); }
    else nodig.add(kant === "L" ? ci : ci+1);
  }));
  if(!nodig.size) nodig.add(k);
  return [...nodig].sort((a, b)=> a - b);
}
// Verdeelt de drivers over k kolommen: 24V-drivers (aansluitingen links en rechts) in de middelste
// kolom, de stroomgestuurde in de minst gevulde andere kolom; telkens van boven naar onder.
function dkVerdeel(drivers, k){
  const cols = Array.from({length: k}, ()=> []);
  const midden = Math.floor((k-1)/2);
  const hoogteVan = (c)=> c.reduce((t, d)=> t + dkDriverMaat(d).b + DK_TUSSEN_MM, 0);
  const laagste = (kand)=> kand.slice().sort((a, b)=> hoogteVan(cols[a]) - hoogteVan(cols[b]) || a - b)[0];
  const alle = cols.map((_, i)=> i);
  const cv = drivers.filter(d=> dkTweeKanten(d)), cc = drivers.filter(d=> !dkTweeKanten(d));
  cv.forEach(d=> cols[k >= 3 ? midden : laagste(alle)].push(d));
  cc.forEach(d=>{
    const kand = (k >= 3 && cv.length) ? alle.filter(i=> i !== midden) : alle;
    cols[laagste(kand)].push(d);
  });
  return cols;
}
// Maten (mm) van een kolomindeling
function dkMeetIndeling(dk, p, cols){
  const zone = DK_RAND_MM + DK_RAIL_H_MM + 6 + p.kokerH + 8;
  const kolB = cols.map(c=> Math.max(0, ...c.map(d=> dkDriverMaat(d).l)));
  const kolH = cols.map(c=> c.reduce((t, d, i)=> t + dkDriverMaat(d).b + (i ? DK_TUSSEN_MM : 0), 0));
  const nKoker = dkKokerPosities(p, cols).length;
  return {
    breedte: DK_RAND_MM*2 + kolB.reduce((t, b)=> t + b, 0) + nKoker*(p.kokerV + 8),
    hoogte: zone + Math.max(0, ...kolH) + DK_RAND_MM,
    rail: dkRailBreedte(dk, p) + DK_RAND_MM*2
  };
}
function dkAutoKolommen(dk, p){
  const drivers = dkDrivers(dk);
  if(!drivers.length) return [];
  const gemengd = drivers.some(d=> dkTweeKanten(d)) && drivers.some(d=> !dkTweeKanten(d));
  // alle aantallen kolommen proberen: eerst wat past, dan (bij gemengd) de 24V in een middenkolom,
  // dan zo weinig mogelijk kolommen; past niets, dan de laagste indeling die nog in de breedte past
  const opties = [];
  for(let k=1; k<=drivers.length; k++){
    const cols = dkVerdeel(drivers, k);
    const m = dkMeetIndeling(dk, p, cols);
    opties.push({cols, m, k, past: m.breedte <= p.breedte && m.hoogte <= p.hoogte, inBreedte: m.breedte <= p.breedte});
  }
  const score = (o)=> [o.past ? 0 : 1, gemengd && o.k < 3 ? 1 : 0, o.past ? o.k : 0, o.inBreedte ? 0 : 1, o.m.hoogte];
  opties.sort((a, b)=>{ const sa = score(a), sb = score(b); for(let i=0; i<sa.length; i++) if(sa[i] !== sb[i]) return sa[i] - sb[i]; return 0; });
  return opties[0].cols.map(c=> c.map(d=> d.id));
}
function dkVulIndeling(dk, opnieuw){
  const p = dkPlan(dk);
  const drivers = dkDrivers(dk);
  const byId = Object.fromEntries(drivers.map(x=> [x.id, x]));
  if(opnieuw || !p.kolommen.length){ p.kolommen = dkAutoKolommen(dk, p); return p; }
  p.kolommen = p.kolommen.map(c=> c.filter(id=> byId[id]));
  const geplaatst = new Set(p.kolommen.flat());
  const h = (c)=> c.reduce((t, id)=> t + (byId[id] ? dkDriverMaat(byId[id]).b + DK_TUSSEN_MM : 0), 0);
  drivers.forEach(d=>{
    if(geplaatst.has(d.id)) return;
    if(!p.kolommen.length) p.kolommen.push([]);
    const ci = p.kolommen.map((c, i)=> i).sort((a, b)=> h(p.kolommen[a]) - h(p.kolommen[b]))[0];
    p.kolommen[ci].push(d.id);
  });
  while(p.kolommen.length > 1 && !p.kolommen[p.kolommen.length-1].length) p.kolommen.pop();
  return p;
}

const dkEigen = (obj, props)=> Object.entries(props).forEach(([k, v])=> Object.defineProperty(obj, k, {value: v, writable: true, configurable: true, enumerable: false}));
/* Bouwt van de driverkast een "kast" voor het uitvoeringsplan, met een EIGEN geometrie (kolommen en
   kokers) en een eigen router (draden door de kokers). Afgeleide velden zijn niet-opsombaar, zodat
   enkel kolommen/draaiing/kokers/draden bewaard worden. */
function dkPlanKast(dk){
  const p = dkVulIndeling(dk);
  const drivers = dkDrivers(dk);
  const byId = Object.fromEntries(drivers.map(d=> [d.id, d]));
  const codes = Object.assign({}, computeDriverCodes());
  const cols = p.kolommen.map(c=> c.map(id=> byId[id]).filter(Boolean));
  const k = cols.length;
  const PX = DK_PXMM, X0 = UV.PADX, Y0 = DK_TOP_PX;
  const boven = p.rkPositie !== "onder";
  const H = p.hoogte;
  const yMM = (mm)=> boven ? mm : H - mm;
  const mods = [], kokers = [];
  // --- DIN-rail: werkschakelaar, verdeelblokken, rijgklemmen ---
  const railY0 = DK_RAND_MM, railY1 = DK_RAND_MM + DK_RAIL_H_MM;
  let rx = DK_RAND_MM;
  const zijKast = boven ? "onder" : "boven", zijKabel = boven ? "boven" : "onder";
  const yKast = boven ? 0.92 : 0.08, yKabel = boven ? 0.08 : 0.92;
  const railModule = (id, naam, breedteMm, soort, klemmen, extra)=>{
    const m = {id, categorie: "Driverklemmen", naam, breedte: 1, _dk: Object.assign({soort}, extra || {}), klemmenEigen: klemmen};
    const y0 = Math.min(yMM(railY0), yMM(railY1));
    mods.push({m, x: X0 + rx*PX, y: Y0 + y0*PX, w: breedteMm*PX, h: DK_RAIL_H_MM*PX, code: codes[id] || ""});
    rx += breedteMm + 3;
  };
  codes["dks_" + dk.id] = "Q";
  railModule("dks_" + dk.id, "Werkschakelaar", DK_SCHAK_MM, "schakelaar", [
    {id: "iL", label: "L", functie: "L", zijde: zijKabel, x: 0.3, y: yKabel, rijgSoort: "preflex", tip: "voedingskabel L"},
    {id: "iN", label: "N", functie: "N", zijde: zijKabel, x: 0.7, y: yKabel, rijgSoort: "preflex", tip: "voedingskabel N"},
    {id: "oL", label: "L", functie: "L", zijde: zijKast, x: 0.3, y: yKast, rijgSoort: "kast", tip: "uit naar verdeelblok L"},
    {id: "oN", label: "N", functie: "N", zijde: zijKast, x: 0.7, y: yKast, rijgSoort: "kast", tip: "uit naar verdeelblok N"}]);
  const n = drivers.length;
  const phx = [["L","L","L"], ["N","N","N"]];
  if(dk.sturing === "PUSH"){ const kc = dkKringCodes(); dkPushKringen(dk).forEach(kid=> phx.push(["P" + kid, "push", "P " + (kc[kid]||"")])); }
  else phx.push(["DA+","DA+","DA+"], ["DA-","DA-","DA−"]);
  phx.forEach(([sl, f, lab])=>{
    const klemmen = [];
    const tot = n + 1;
    // punten in een raster per blok (4 breed): de voeding bovenaan (aan de kabelkant), de 18 uitgangen eronder
    const nBlok = dkPhoenixBlokken(n), bw = 1/nBlok;
    for(let i=0; i<tot; i++){
      if(!i){ klemmen.push({id: "i", label: "in", functie: f, zijde: zijKabel, x: bw/2, y: yKabel, rijgSoort: "preflex", tip: `verdeelblok ${lab} · voeding (ingang)`}); continue; }
      const blokNr = Math.floor((i-1)/DK_PTFIX_UIT), j = (i-1) % DK_PTFIX_UIT;
      const kol = j % 4, rij = Math.floor(j / 4);
      const xr = blokNr*bw + bw*(0.14 + kol*0.24);
      const yr = boven ? 0.36 + rij*0.14 : 0.64 - rij*0.14;
      klemmen.push({id: "p" + i, label: String(i), functie: f, zijde: zijKast, x: Math.round(xr*1000)/1000, y: Math.round(yr*1000)/1000, rijgSoort: "kast", geenLabel: true, tip: `verdeelblok ${lab} · punt ${i}`});
    }
    const id = "dkp_" + sl + "_" + dk.id;
    codes[id] = lab;
    railModule(id, "Verdeelblok " + lab, dkPhoenixBreedte(tot), "phoenix", klemmen, {lab, f, kleur: DK_PTFIX_KLEUR[f] || "grijs", blokken: dkPhoenixBlokken(n)});
  });
  cols.flat().forEach(d=>{
    const lijst = dkKlemLijst(d, p);
    const klemmen = [];
    const dub = !!p.rkDubbel;
    const nPos = dub ? Math.ceil(lijst.length/2) : lijst.length;
    lijst.forEach((e, i)=>{
      // dubbel: klem i/2, niveau i%2 (het tweede niveau iets dieper)
      const x = ((dub ? Math.floor(i/2) : i) + 0.5)/nPos;
      const niveau = dub ? i % 2 : 0;
      const yK = yKast + (boven ? -1 : 1)*niveau*0.13, yP = yKabel + (boven ? 1 : -1)*niveau*0.13;
      const lab = (e.sp ? e.sp : "") + (e.pol==="+" ? "+" : (e.pol==="-" ? "−" : "s"));
      const f = e.pol==="s" ? "contact" : e.pol;
      const tip = [codes[d.id], e.arm ? (e.arm.naam || "") + " " + e.sp : "kabel", e.arm && e.arm.ruimte, e.pol==="+" ? "plus" : (e.pol==="-" ? "min" : "stuur")].filter(Boolean).join(" · ");
      klemmen.push({id: `k${i}`, label: lab, functie: f, zijde: zijKast, x, y: yK, rijgSoort: "kast", tip: tip + " · kastzijde", _sp: e.sp, _pol: e.pol, geenLabel: dub && niveau===1});
      klemmen.push({id: `p${i}`, label: lab, functie: f, zijde: zijKabel, x, y: yP, rijgSoort: "preflex", tip: tip + " · kabel", _sp: e.sp, _pol: e.pol, geenLabel: dub && niveau===1});
    });
    codes["dkk_" + d.id] = codes[d.id];
    railModule("dkk_" + d.id, d.naam, dkRijgBreedte(lijst, p), "klemmen", klemmen, {driver: d, perSpot: p.klemPerSpot[d.id] === undefined ? 2 : p.klemPerSpot[d.id], spots: dkSpots(d)});
  });
  const railLengte = rx - 3 + DK_RAND_MM;
  // --- horizontale koker naast de rail ---
  const hk0 = railY1 + 6, hk1 = hk0 + p.kokerH;
  // --- kolommen en verticale kokers, van links naar rechts ---
  const kolPos = dkKokerPosities(p, cols);
  let x = DK_RAND_MM;
  const kolX = [], vKoker = {};
  for(let ci=0; ci<=k; ci++){
    if(kolPos.includes(ci)){ x += 4; vKoker[ci] = {x0: x, x1: x + p.kokerV}; x += p.kokerV + 4; }
    if(ci < k){
      const bk = Math.max(0, ...cols[ci].map(d=> dkDriverMaat(d).l));
      kolX[ci] = {x0: x, x1: x + bk};
      x += bk;
    }
  }
  const breedteNodig = x + DK_RAND_MM;
  const ondY0 = hk1 + 8;
  let hoogteNodig = ondY0 + DK_RAND_MM;
  cols.forEach((c, ci)=>{
    let y = ondY0;
    c.forEach(d=>{
      const maat = dkDriverMaat(d);
      const kant = dkKant(p, d, ci, k);
      // tegen de koker aan de aansluitkant schuiven
      const kx = kant === "L" ? kolX[ci].x0 : (kant === "R" ? kolX[ci].x1 - maat.l : (kolX[ci].x0 + kolX[ci].x1 - maat.l)/2);
      const yTop = boven ? y : H - y - maat.b;
      const m = {id: d.id, categorie: "Driver", naam: d.naam, breedte: 1, _dk: {soort: "driver", driver: d, maat, spanning: dkIsSpanning(d), kant, kolom: ci},
        klemmenEigen: dkDriverKlemmen(d, dk.sturing, kant)};
      mods.push({m, x: X0 + kx*PX, y: Y0 + yTop*PX, w: maat.l*PX, h: maat.b*PX, code: codes[d.id] || ""});
      y += maat.b + DK_TUSSEN_MM;
    });
    hoogteNodig = Math.max(hoogteNodig, y - DK_TUSSEN_MM + DK_RAND_MM);
  });
  const totB = Math.max(p.breedte, breedteNodig, railLengte), totH = Math.max(H, hoogteNodig);
  const hkY0 = Math.min(yMM(hk0), yMM(hk1)), hkY1 = Math.max(yMM(hk0), yMM(hk1));
  kokers.push({id: "H", soort: "h", x0: X0 + DK_RAND_MM*PX, x1: X0 + (totB - DK_RAND_MM)*PX, y0: Y0 + hkY0*PX, y1: Y0 + hkY1*PX, mm: p.kokerH});
  const vA = boven ? hk1 : (totH - (H - DK_RAND_MM)), vB = boven ? totH - DK_RAND_MM : H - hk1;
  Object.entries(vKoker).forEach(([ci, v])=> kokers.push({id: "V" + ci, soort: "v", kol: +ci, x0: X0 + v.x0*PX, x1: X0 + v.x1*PX, y0: Y0 + Math.min(vA, vB)*PX, y1: Y0 + Math.max(vA, vB)*PX, mm: p.kokerV}));
  const idx = state.driverkast.kasten.indexOf(dk);
  dkEigen(p, {
    rijen: [{id: "dk-alle", items: mods.map(md=> md.m)}],
    maat: Math.ceil(p.breedte/18), naam: "Driverkast " + (idx+1), _dk: dk, _codes: codes, _breedtePx: p.breedte*PX,
    _layout: {mods, kokers, breedteNodig, hoogteNodig, railLengte, boven},
    _geometrie: dkGeometrie, _dkAchtergrond: (geo)=> dkAchtergrondSvg(p, geo), _dxfExtra: (d, geo)=> dkDxfExtra(p, d, geo)
  });
  return p;
}
// Geometrie in dezelfde vorm als uvGeometrie(), maar met absolute posities en een eigen router.
function dkGeometrie(p){
  const L = p._layout;
  const klemPos = {};
  L.mods.forEach(md=>{
    (md.m.klemmenEigen||[]).forEach(k=>{
      klemPos[uvKlemKey(md.m.id, k.id)] = {x: md.x + (parseFloat(k.x)||0)*md.w, y: md.y + (parseFloat(k.y)||0)*md.h, zijde: k.zijde, ri: 0, k, m: md.m, code: md.code};
    });
  });
  const PX = DK_PXMM;
  const width = UV.PADX*2 + Math.max(p.breedte, L.breedteNodig, L.railLengte)*PX;
  const height = DK_TOP_PX + Math.max(p.hoogte, L.hoogteNodig)*PX + 20;
  return {mods: L.mods, klemPos, width, height, codes: p._codes, gootTop: [], hoogte: [], kamBand: [], rijY: [], rijH: [],
    plan: {perDraad: {}, banen: [], zijN: {L: 0, R: 0}}, padL: UV.PADX, padR: UV.PADX, kastR: UV.PADX + p.breedte*PX,
    _eigen: true, _absoluut: true, _router: dkRoutes, kokers: L.kokers};
}
// In welke koker komt een klem uit?
function dkKokerVoorKlem(geo, pos){
  const ks = geo.kokers;
  const H = ks.find(k=> k.soort==="h");
  const info = pos.m._dk || {};
  if(info.soort === "driver"){
    const kant = pos.k.zijde === "links" ? info.kolom : info.kolom + 1;
    const v = ks.filter(k=> k.soort==="v");
    return v.find(k=> k.kol===kant) || v.slice().sort((a, b)=> Math.abs(a.kol - kant) - Math.abs(b.kol - kant))[0] || H;
  }
  return H;
}
function dkRoutes(kast, geo){
  const tel = {};
  const baan = (koker)=>{
    tel[koker.id] = (tel[koker.id]||0) + 1;
    const n = tel[koker.id];
    const breed = koker.soort==="h" ? koker.y1 - koker.y0 : koker.x1 - koker.x0;
    const stap = 3.2;
    const max = Math.max(1, Math.floor((breed - 6)/stap));
    return 3 + ((n - 1) % max)*stap + (Math.floor((n-1)/max) % 2)*stap/2;
  };
  const H = geo.kokers.find(k=> k.soort==="h");
  return kast.bedrading.map(w=>{
    const A = geo.klemPos[uvKlemKey(w.a.m, w.a.k)], B = geo.klemPos[uvKlemKey(w.b.m, w.b.k)];
    if(!A || !B) return null;
    let verts;
    if(Array.isArray(w.punten) && w.punten.length){
      verts = uvVertsVoor(A, B, w.punten.map(q=> uvDecodeerPunt(q, geo)));
    } else {
      const ka = dkKokerVoorKlem(geo, A), kb = dkKokerVoorKlem(geo, B);
      const hy = H.y0 + baan(H);
      if(ka===kb && ka.soort==="v"){
        const lx = ka.x0 + baan(ka);
        verts = [{x: A.x, y: A.y}, {x: lx, y: A.y}, {x: lx, y: B.y}, {x: B.x, y: B.y}];
      } else if(ka.soort==="h" && kb.soort==="h"){
        verts = [{x: A.x, y: A.y}, {x: A.x, y: hy}, {x: B.x, y: hy}, {x: B.x, y: B.y}];
      } else if(ka.soort==="v" && kb.soort==="h"){
        const lx = ka.x0 + baan(ka);
        verts = [{x: A.x, y: A.y}, {x: lx, y: A.y}, {x: lx, y: hy}, {x: B.x, y: hy}, {x: B.x, y: B.y}];
      } else if(ka.soort==="h" && kb.soort==="v"){
        const lx = kb.x0 + baan(kb);
        verts = [{x: A.x, y: A.y}, {x: A.x, y: hy}, {x: lx, y: hy}, {x: lx, y: B.y}, {x: B.x, y: B.y}];
      } else {
        const la = ka.x0 + baan(ka), lb = kb.x0 + baan(kb);
        verts = [{x: A.x, y: A.y}, {x: la, y: A.y}, {x: la, y: hy}, {x: lb, y: hy}, {x: lb, y: B.y}, {x: B.x, y: B.y}];
      }
      verts = uvVereenvoudig(verts);
    }
    return {w, A, B, verts, d: uvPad(verts), handmatig: !!(w.punten && w.punten.length), tussen: false};
  }).filter(Boolean);
}
function dkAchtergrondSvg(p, geo){
  const L = p._layout, PX = DK_PXMM;
  const x = UV.PADX, w = p.breedte*PX, h = p.hoogte*PX, y = DK_TOP_PX;
  const nodigB = Math.max(L.breedteNodig, L.railLengte);
  const teH = L.hoogteNodig > p.hoogte + 0.5, teB = nodigB > p.breedte + 0.5;
  let s = `<rect x="${x}" y="${y}" width="${Math.max(w, nodigB*PX)}" height="${Math.max(h, L.hoogteNodig*PX)}" class="dk-plaat"/>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="dk-kast${teH || teB ? " te-klein" : ""}"/>`;
  const ry = y + (L.boven ? DK_RAND_MM + DK_RAIL_H_MM/2 - 17.5 : p.hoogte - DK_RAND_MM - DK_RAIL_H_MM/2 - 17.5)*PX;
  s += `<rect x="${x + 4}" y="${ry}" width="${(Math.max(p.breedte, L.railLengte) - 8)*PX}" height="${35*PX}" class="uv-rail"/>`;
  L.kokers.forEach(k=>{
    s += `<rect x="${k.x0}" y="${k.y0}" width="${k.x1-k.x0}" height="${k.y1-k.y0}" class="dk-koker"/>`;
    if(k.soort==="h") s += `<text x="${k.x1 - 6}" y="${k.y1 - 3}" class="dk-koker-lab" text-anchor="end">koker ${k.mm}</text>`;
    else s += `<text transform="translate(${(k.x0+k.x1)/2 + 3} ${k.y1 - 6}) rotate(-90)" class="dk-koker-lab">koker ${k.mm}</text>`;
  });
  const kastTekst = p.kast ? `Rittal ${p.kast.naam} ${p.kast.b}×${p.kast.h}×${p.kast.d} — montageplaat ${p.breedte} × ${p.hoogte} mm` : `montageplaat ${p.breedte} × ${p.hoogte} mm`;
  const probleem = [teH ? `te laag (nodig ±${Math.ceil(L.hoogteNodig/5)*5} mm)` : "", teB ? `te smal (nodig ±${Math.ceil(nodigB/5)*5} mm${L.railLengte > p.breedte ? " voor de rail" : ""})` : ""].filter(Boolean).join(", ");
  s += `<text x="${x + w - 4}" y="${y - 5}" class="dk-kastmaat">${escapeHtml(kastTekst)}${probleem ? " — " + escapeHtml(probleem) : ""}</text>`;
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
    const kantTekst = info.kant==="beide" ? "aansluitingen links (ingang) en rechts (uitgang)" : "aansluitingen " + (info.kant==="L" ? "links" : "rechts");
    const tip = [code + " — " + (d.naam || "driver"), `${maat.l} × ${maat.b} × ${maat.h} mm${maat.onbekend ? " (maat onbekend)" : ""}`, info.spanning ? "spanningsgestuurd (parallel)" : "stroomgestuurd (in serie)", kantTekst, arm, ruimte].filter(Boolean).join("\n");
    let s = `<g class="uv-mod dk-driver${sel}${maat.onbekend ? " onbekend" : ""}" data-mod="${m.id}" data-tip="${escapeHtml(tip)}">`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" class="dk-body"/>`;
    const sw = Math.min(24, w*0.17);
    if(info.kant==="L" || info.kant==="beide") s += `<rect x="${x+2}" y="${y+2}" width="${sw}" height="${h-4}" rx="2" class="dk-klemstrook"/>`;
    if(info.kant==="R" || info.kant==="beide") s += `<rect x="${x+w-sw-2}" y="${y+2}" width="${sw}" height="${h-4}" rx="2" class="dk-klemstrook"/>`;
    (m.klemmenEigen||[]).forEach(k=>{
      const kx = k.x < 0.5 ? x + 2 + sw/2 + 3 : x + w - 2 - sw/2 - 3;
      s += `<text x="${kx}" y="${y + k.y*h + 2.5}" class="dk-kl">${escapeHtml(k.label)}</text>`;
    });
    const cx = x + w/2;
    s += `<rect x="${cx-16}" y="${y + 5}" width="32" height="16" rx="4" class="uv-code-bg"/><text x="${cx}" y="${y + 16.5}" class="uv-code">${escapeHtml(code)}</text>`;
    const naam = String(d.naam || "driver").replace(/^tci\s+/i, "TCI ").replace(/meanwel+\b/i, "Mean Well");
    const maxC = Math.max(6, Math.floor((w - 2*sw - 10)/5.2));
    s += `<text x="${cx}" y="${y + h*0.58}" class="dk-naam">${escapeHtml(naam.slice(0, maxC))}</text>`;
    s += `<text x="${cx}" y="${y + h*0.58 + 10}" class="dk-maat">${escapeHtml((maat.l + "×" + maat.b + " mm" + (arm ? " · " + dkSpots(d) + "× " + ((d.armaturen||[])[0]||{}).naam : "")).slice(0, maxC + 4))}</text>`;
    s += `</g>`;
    return s;
  }
  const soort = info.soort;
  const d = info.driver;
  const tip = soort==="schakelaar" ? "Werkschakelaar — voeding van de driverkast uitschakelen" :
    soort==="phoenix" ? `Phoenix ${DK_PTFIX_ART} (${info.kleur}) — verdeelblok ${info.lab}, ${info.blokken} blok(ken) van 1 voeding + 18 aansluitingen` :
    [code + " — " + (d.naam||""), info.perSpot===0 ? "1 kabel per driver" : `${info.spots} spot(s) × ${info.perSpot} klemmen`, [...new Set((d.armaturen||[]).map(a=> a.ruimte).filter(Boolean))].join(", ")].filter(Boolean).join("\n");
  let s = `<g class="uv-mod dk-blok${sel} ${soort}" data-mod="${m.id}" data-tip="${escapeHtml(tip)}">`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" class="dk-blok-body"/>`;
  if(soort==="klemmen"){
    const kz = (m.klemmenEigen||[]).filter(k=> k.rijgSoort==="kast");
    const xs = [...new Set(kz.map(k=> k.x))];
    for(let i=1; i<xs.length; i++){
      const xl = x + w*(xs[i-1] + xs[i])/2;
      const a = kz.find(k=> k.x===xs[i-1]), b = kz.find(k=> k.x===xs[i]);
      s += `<line x1="${xl}" y1="${y+3}" x2="${xl}" y2="${y+h-3}" class="dk-klemlijn${a && b && a._sp !== b._sp ? " spot" : ""}"/>`;
    }
  }
  if(soort==="schakelaar") s += `<rect x="${x + w/2 - 5}" y="${y + h/2 - 12}" width="10" height="18" rx="2" class="dk-hendel"/>`;
  if(soort==="phoenix"){
    const bw = (w - (info.blokken-1)*2*DK_PXMM)/info.blokken;
    for(let b=0; b<info.blokken; b++) s += `<rect x="${x + b*(bw + 2*DK_PXMM)}" y="${y + h*0.22}" width="${bw}" height="${h*0.62}" rx="3" class="dk-ptfix ${info.kleur}"/>`;
  }
  const lab = soort==="schakelaar" ? "Q" : (soort==="phoenix" ? info.lab : code);
  if(w > 30) s += `<text x="${x + w/2}" y="${y + (soort==="phoenix" ? h*0.16 : h/2) + (soort==="schakelaar" ? 18 : 3)}" class="dk-blok-lab">${escapeHtml(lab)}</text>`;
  else s += `<text transform="translate(${x + w/2 + 3} ${y + h/2}) rotate(-90)" class="dk-blok-lab">${escapeHtml(lab)}</text>`;
  s += `</g>`;
  return s;
}
function dkDxfExtra(p, d, geo){
  const L = p._layout, PX = DK_PXMM;
  d.rect(UV.PADX, DK_TOP_PX, p.breedte*PX, p.hoogte*PX, "KAST");
  const ry = DK_TOP_PX + (L.boven ? DK_RAND_MM + DK_RAIL_H_MM/2 - 17.5 : p.hoogte - DK_RAND_MM - DK_RAIL_H_MM/2 - 17.5)*PX;
  d.rect(UV.PADX + 4, ry, (Math.max(p.breedte, L.railLengte) - 8)*PX, 35*PX, "RAILS");
  L.kokers.forEach(k=>{ d.rect(k.x0, k.y0, k.x1-k.x0, k.y1-k.y0, "GOTEN"); });
}

/* ---------- automatisch voorstel voor de draden ---------- */
function dkOmzet(p){
  const dk = p._dk;
  p.bedrading = p.bedrading.filter(w=> !w.auto);
  const byId = Object.fromEntries(dkDrivers(dk).map(d=> [d.id, d]));
  const drivers = p.kolommen.flat().map(id=> byId[id]).filter(Boolean);
  const nieuw = [];
  const draad = (a, b, sectie)=>{ if(a && b) nieuw.push({id: cryptoId(), a, b, kleur: "Bruin", kleurAuto: true, sectie: sectie || "1.5", label: "", auto: true}); };
  const blok = (sl)=> "dkp_" + sl + "_" + dk.id;
  // werkschakelaar -> verdeelblokken L en N
  draad({m: "dks_" + dk.id, k: "oL"}, {m: blok("L"), k: "i"});
  draad({m: "dks_" + dk.id, k: "oN"}, {m: blok("N"), k: "i"});
  // elke driver op zijn eigen punt van de verdeelblokken
  drivers.forEach((d, i)=>{
    const pt = "p" + (i+1);
    draad({m: blok("L"), k: pt}, {m: d.id, k: "L"});
    draad({m: blok("N"), k: pt}, {m: d.id, k: "N"});
    if(dk.sturing === "PUSH"){ if(d.kringId) draad({m: blok("P" + d.kringId), k: pt}, {m: d.id, k: "P"}); }
    else { draad({m: blok("DA+"), k: pt}, {m: d.id, k: "DA1"}); draad({m: blok("DA-"), k: pt}, {m: d.id, k: "DA2"}); }
  });
  // uitgangen naar de rijgklemmen: stroomsturing in serie, spanning parallel
  drivers.forEach(d=>{
    const lijst = dkKlemLijst(d, p);
    const B = (i)=> ({m: "dkk_" + d.id, k: "k" + i});
    const D = (id)=> ({m: d.id, k: id});
    const plus = [], min = [];
    lijst.forEach((e, i)=>{ if(e.pol==="+") plus.push(i); if(e.pol==="-") min.push(i); });
    if(!plus.length) return;
    if(dkIsSpanning(d) || plus.length===1){
      let a = D("O+"); plus.forEach(i=>{ draad(a, B(i)); a = B(i); });
      a = D("O-"); min.forEach(i=>{ draad(a, B(i)); a = B(i); });
    } else {
      draad(D("O+"), B(plus[0]));
      for(let i=0; i<plus.length-1; i++) draad(B(min[i]), B(plus[i+1]));
      draad(B(min[min.length-1]), D("O-"));
    }
  });
  p.bedrading.push(...nieuw);
  return `Voorstel: ${nieuw.length} draden (werkschakelaar, verdeelblokken ${dk.sturing==="PUSH" ? "L/N/push" : "L/N/DALI"} en uitgangen naar de rijgklemmen).`;
}

/* ---------- kastkeuze (Rittal AX) ----------
   Rittal AX compactkasten, plaatstaal: kastmaat B x H x D en bruikbare montageplaat B x H, uit Rittal
   "Compact enclosures AX — Technical details" (via TME, AX 1031.000-datasheet). */
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
const dkAdviesCache = new Map();
function dkPastOp(dk, plaatB, plaatH){
  const p = dkPlan(dk);
  const kopie = Object.assign({}, p, {breedte: plaatB, hoogte: plaatH});
  const byId = Object.fromEntries(dkDrivers(dk).map(d=> [d.id, d]));
  const cols = dkAutoKolommen(dk, kopie).map(c=> c.map(id=> byId[id]));
  const m = dkMeetIndeling(dk, kopie, cols);
  return {past: m.breedte <= plaatB && m.hoogte <= plaatH && m.rail <= plaatB, maat: m};
}
function dkKastAdvies(dk){
  const p = dkPlan(dk);
  const sig = JSON.stringify([dkDrivers(dk).map(d=> [d.naam, d.armaturen && d.armaturen.map(a=> a.aantal)]), p.klemPerSpot, p.draai, p.kokerV, p.kokerH, p.rkDubbel, dk.sturing,
    Object.keys(cadosInst).filter(k=> k.startsWith("driver_maat:")).map(k=> JSON.stringify(cadosInst[k]))]);
  if(dkAdviesCache.has(sig)) return dkAdviesCache.get(sig);
  const lijst = RITTAL_AX.map(k=> Object.assign({}, k, dkPastOp(dk, k.pb, k.ph)));
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
    const kastTekst = p.kast ? `Rittal ${p.kast.naam} (${p.kast.b} × ${p.kast.h} × ${p.kast.d} mm)` : `montageplaat ${p.breedte} × ${p.hoogte} mm`;
    const page = el(`<div class="pe-page" data-content="schema"><div class="pe-title">${escapeHtml(projectNaam)}</div>
      <div class="pe-sub">Driverkast ${i+1}${dk.kamer ? " · " + escapeHtml(dk.kamer) : ""} — plan · ${escapeHtml(kastTekst)} · ${escapeHtml(dk.sturing||"")} · ${new Date().toLocaleDateString("nl-BE")}</div>
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
  const ci = p.kolommen.findIndex(c=> c.includes(id));
  if(ci < 0) return;
  const c = p.kolommen[ci], i = c.indexOf(id);
  if(richting==="op" && i > 0){ c.splice(i, 1); c.splice(i-1, 0, id); }
  else if(richting==="neer" && i < c.length-1){ c.splice(i, 1); c.splice(i+1, 0, id); }
  else if(richting==="links" && ci > 0){ c.splice(i, 1); p.kolommen[ci-1].push(id); delete p.draai[id]; }
  else if(richting==="rechts"){ c.splice(i, 1); if(!p.kolommen[ci+1]) p.kolommen.push([]); p.kolommen[ci+1].push(id); delete p.draai[id]; }
  p.kolommen = p.kolommen.filter(x=> x.length);
  if(!p.kolommen.length) p.kolommen = [[]];
}
const UV_CTX_DK = {
  tab: "driverplan", panelId: "panel-driverplan", titel: "Driverkast plan", zekering: false, eendraad: false, kam: false,
  kast: ()=>{ const dk = dkHuidig(); return dk ? dkPlanKast(dk) : null; },
  huidigId: ()=> dkHuidigId,
  kasten: ()=> state.driverkast.kasten.map((k, i)=> ({id: k.id, naam: "Driverkast " + (i+1) + (k.kamer ? " · " + k.kamer : "")})),
  kiesKast: (id)=>{ dkHuidigId = id; },
  layoutTab: "driverkast", layoutTitel: "drivers en armaturen aanpassen op het tabblad Driverkast",
  omzetLabel: "Draden voorstellen", omzetTitel: "werkschakelaar, verdeelblokken (L/N/DALI of push) en de uitgangen naar de rijgklemmen automatisch tekenen",
  omzet: (p)=> dkOmzet(p),
  voorTeken: (p)=>{ if(p._dk) dkPlanKast(p._dk); },
  export: ()=> dkExport(),
  hulpTekst: "Welke drivers en armaturen er in de kast zitten, pas je aan op het tabblad Driverkast. Hier kies je de kast, de kokers en de plaats en draaiing van de drivers.",
  extraKaart: (zone, h)=>{
    const p = h.kast, dk = p._dk, L = p._layout;
    const adv = dkKastAdvies(dk);
    const huidig = p.kast && RITTAL_AX.find(k=> k.art===p.kast.art);
    const box = el(`<div class="card"><div class="card-body uv-sidebody">
      <strong>Kast</strong>
      <label class="uv-veld">Rittal AX (plaatstaal)<select class="dk-kast">
        <option value="">Eigen maat (montageplaat)</option>
        ${adv.lijst.map(k=> `<option value="${k.art}" ${huidig && huidig.art===k.art ? "selected" : ""}>${k.past ? "✓" : "✗"} ${escapeHtml(rittalLabel(k))}</option>`).join("")}
      </select></label>
      ${adv.beste ? `<div class="dk-advies">Kleinste kast die past: <strong>${escapeHtml(adv.beste.naam)}</strong> ${adv.beste.b}×${adv.beste.h}×${adv.beste.d} mm
        ${huidig && huidig.art===adv.beste.art ? "" : `<button class="btn small primary dk-kies">Kiezen</button>`}</div>` : `<div class="uv-fout">Geen enkele AX-kast is groot genoeg — verdeel over meer kasten of kies een eigen maat.</div>`}
      ${huidig ? `<div class="hint">${huidig.deuren} deur(en) · montageplaat ${huidig.pb}×${huidig.ph} mm · nodig ±${Math.ceil(Math.max(L.breedteNodig, L.railLengte)/5)*5}×${Math.ceil(L.hoogteNodig/5)*5} mm · <a href="${rittalUrl(huidig.art)}" target="_blank" rel="noopener">bekijk bij Rittal ↗</a></div>` : `
      <div class="uv-rij2">
        <label class="uv-veld">Breedte (mm)<input type="number" min="200" step="5" class="dk-b" value="${p.breedte}"></label>
        <label class="uv-veld">Hoogte (mm)<input type="number" min="200" step="5" class="dk-h" value="${p.hoogte}"></label>
      </div>`}
      <div class="uv-rij2">
        <label class="uv-veld">Koker verticaal<select class="dk-kv">${DK_KOKERS.map(v=> `<option value="${v}" ${v===p.kokerV?"selected":""}>${v} mm</option>`).join("")}</select></label>
        <label class="uv-veld">Koker bij rail<select class="dk-kh">${DK_KOKERS.map(v=> `<option value="${v}" ${v===p.kokerH?"selected":""}>${v} mm</option>`).join("")}</select></label>
      </div>
      <label class="uv-veld">DIN-rail (schakelaar, verdeelblokken, rijgklemmen)<select class="dk-rkpos">
        <option value="boven" ${p.rkPositie!=="onder"?"selected":""}>Bovenaan</option>
        <option value="onder" ${p.rkPositie==="onder"?"selected":""}>Onderaan</option></select></label>
      <label class="uv-veld">Rijgklemmen<select class="dk-dub">
        <option value="0" ${!p.rkDubbel?"selected":""}>Enkel (1 niveau, 5,2 mm per klem)</option>
        <option value="1" ${p.rkDubbel?"selected":""}>Dubbel (2 niveaus: + en − op 1 klem)</option></select></label>
      ${L.railLengte > p.breedte ? `<div class="uv-fout">De DIN-rail is ±${Math.ceil(L.railLengte/5)*5} mm lang en past niet op de montageplaat van ${p.breedte} mm${p.rkDubbel ? "" : " — met dubbele rijgklemmen wordt hij korter"}.</div>` : ""}
      <div class="hint">Sturing ${escapeHtml(dk.sturing||"DALI")} · ${dkDrivers(dk).length} drivers in ${p.kolommen.length} kolom(men) · ${dkDrivers(dk).reduce((t, d)=> t + dkSpots(d), 0)} spots/strips</div>
      <button class="btn small ghost dk-herschik" title="alle drivers opnieuw verdelen over kolommen volgens de montageplaat">↻ Drivers herschikken</button>
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
    const zet = ()=>{ p.breedte = Math.max(200, parseInt(box.querySelector(".dk-b").value)||545); p.hoogte = Math.max(200, parseInt(box.querySelector(".dk-h").value)||775); save(); h.rerender(); };
    const ib = box.querySelector(".dk-b");
    if(ib){ ib.addEventListener("change", zet); box.querySelector(".dk-h").addEventListener("change", zet); }
    box.querySelector(".dk-kv").addEventListener("change", e=>{ p.kokerV = parseInt(e.target.value); save(); h.rerender(); });
    box.querySelector(".dk-kh").addEventListener("change", e=>{ p.kokerH = parseInt(e.target.value); save(); h.rerender(); });
    box.querySelector(".dk-rkpos").addEventListener("change", e=>{ p.rkPositie = e.target.value; save(); h.rerender(); });
    box.querySelector(".dk-dub").addEventListener("change", e=>{ p.rkDubbel = e.target.value==="1"; save(); h.rerender(); });
    box.querySelector(".dk-herschik").addEventListener("click", ()=>{ dkVulIndeling(dk, true); save(); h.rerender(); });
    zone.appendChild(box);
  },
  moduleDetail: (md, zone, h)=>{
    const p = h.kast, dk = p._dk, info = md._dk;   // md = de (pseudo)module zelf
    const codes = p._codes;
    if(info.soort==="schakelaar" || info.soort==="phoenix"){
      zone.appendChild(el(`<div class="card uv-detail"><div class="card-body uv-sidebody"><strong>${info.soort==="schakelaar" ? "Werkschakelaar" : "Phoenix-verdeelblok " + escapeHtml(info.lab)}</strong>
        <div class="hint">${info.soort==="schakelaar" ? "De voedingskabel (L/N) komt toe op de werkschakelaar; daarna naar de verdeelblokken L en N." : `Phoenix ${DK_PTFIX_ART}, ${info.kleur}: ${info.blokken} blok(ken) met geïntegreerde voeding en 18 push-in-aansluitingen (0,14–4 mm², 28,6 × 28,7 mm) — elke driver op zijn eigen punt (${dkDrivers(dk).length} nodig).`}</div></div></div>`));
      return;
    }
    const d = info.driver;
    const maat = dkDriverMaat(d);
    const perSpot = p.klemPerSpot[d.id] === undefined ? 2 : p.klemPerSpot[d.id];
    const isDriver = info.soort==="driver";
    const twee = dkTweeKanten(d);
    const box = el(`<div class="card uv-detail"><div class="card-body uv-sidebody">
      <div class="uv-detail-kop"><strong>${escapeHtml(codes[d.id]||"")} ${escapeHtml(d.naam||"driver")}</strong></div>
      <div class="hint">${escapeHtml((d.armaturen||[]).filter(a=> a.naam).map(a=> (parseInt(a.aantal)||1) + "× " + a.naam + (a.ruimte ? " (" + a.ruimte + ")" : "")).join(", ") || "geen armaturen")}<br>${dkIsSpanning(d) ? "spanningsgestuurd — spots/strips parallel" : "stroomgestuurd — spots in serie"}</div>
      <label class="uv-veld">Rijgklemmen<select class="dk-ps">
        <option value="2" ${perSpot===2?"selected":""}>2 per spot/strip (+ en −)</option>
        <option value="3" ${perSpot===3?"selected":""}>3 per spot (+, − en stuurdraad)</option>
        <option value="0" ${perSpot===0?"selected":""}>1 kabel per driver (2 klemmen)</option></select></label>
      ${isDriver ? `${twee ? `<div class="hint">Aansluitingen links (ingang) én rechts (uitgang) — kokers aan beide kanten.</div>` : `<div class="uv-veld">Aansluitingen<div class="uv-knoprij">
          <button class="btn small ${info.kant==="L"?"primary":"ghost"} dk-kant" data-k="L">◧ links</button><button class="btn small ${info.kant==="R"?"primary":"ghost"} dk-kant" data-k="R">rechts ◨</button></div></div>`}
      <div class="uv-veld">Maat (L × B × H mm)${maat.onbekend ? ' <span class="uv-fout-tel">onbekend</span>' : ""}
        <div class="dk-maatrij"><input type="number" class="dk-ml" value="${maat.l}"><input type="number" class="dk-mb" value="${maat.b}"><input type="number" class="dk-mh" value="${maat.h}"></div>
        <div class="hint">${escapeHtml(maat.bron)} — geldt voor alle "${escapeHtml(d.naam||"")}"</div></div>
      <div class="uv-veld">Plaats (kolom ${info.kolom + 1} van ${p.kolommen.length})<div class="uv-knoprij">
        <button class="btn small ghost dk-mv" data-r="op" title="hoger in de kolom">↑</button><button class="btn small ghost dk-mv" data-r="neer" title="lager in de kolom">↓</button>
        <button class="btn small ghost dk-mv" data-r="links" title="naar de kolom links">← kolom</button><button class="btn small ghost dk-mv" data-r="rechts" title="naar de kolom rechts (of een nieuwe)">kolom →</button></div></div>` : ""}
      <div class="uv-knoprij"><button class="btn small ghost dk-layout">Op tabblad Driverkast</button></div>
    </div></div>`);
    box.querySelector(".dk-ps").addEventListener("change", e=>{ p.klemPerSpot[d.id] = parseInt(e.target.value); save(); h.rerender(); });
    box.querySelectorAll(".dk-mv").forEach(b=> b.addEventListener("click", ()=>{ dkVerplaats(p, d.id, b.dataset.r); save(); h.rerender(); }));
    box.querySelectorAll(".dk-kant").forEach(b=> b.addEventListener("click", ()=>{ p.draai[d.id] = b.dataset.k; save(); h.rerender(); }));
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
      <strong>Driverkast plan</strong><p class="hint">Er staan nog geen drivers in een driverkast. Voeg ze eerst toe op het tabblad Driverkast.</p></div></div></div>`);
  }
  if(!cadosInstGeladen) laadAllesVoorUitvoering().then(()=>{ if(document.getElementById("panel-driverplan")) selectTab("driverplan"); });
  return renderUitvoeringsplan(UV_CTX_DK);
}
