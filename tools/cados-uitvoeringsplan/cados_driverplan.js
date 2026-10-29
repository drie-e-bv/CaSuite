
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
const DK_PLAN_VERSIE = 4;
function dkKokerMM(p, id){ const v = p.kokerBreedte && p.kokerBreedte[id]; return DK_KOKERS.includes(v) ? v : (id==="H" ? p.kokerH : p.kokerV); }   // ophogen als het automatische draadvoorstel wijzigt
const DK_TOP_PX = 18;
// Maten (L x B x H in mm) van de drivers die Casentis gebruikt, opgezocht op 29/10/2026.
// Aanpasbaar per type in het zijpaneel (gedeeld via elektro_cados_instellingen).
/* Boorgaten (Peter, 29/10: "volgens de technische fiche overgezet, zodat het blad op ware grootte kan
   afgedrukt en op de plaat gelegd worden"). Per model in mm vanaf de linkerbovenhoek van de omtrek, zoals
   op de maattekening van de fabrikant, met de aansluitingen aan de kant "fiche". Wordt de driver met de
   aansluitingen aan de andere kant getekend, dan draait het patroon 180°.
   - TCI MAXI JOLLY US DALI (fiche p.2): 2 schroefsleuven diagonaal, hart-op-hart 111 × 67 (124 × 79).
     De ronde schroef aan de klemmenkant is de schroef van het klemmendeksel, geen bevestiging.
   - TCI JOLLY DALI 122424 (fiche): 2 sleuven diagonaal, L1 93,5 × B1 57,5 (103 × 67); de schroef in het
     midden van de klemmenkant is weer het klemmendeksel.
   - TCI MINI JOLLY (fiche Mini Jolly, zelfde behuizing): 3 punten — sleuf in het lipje aan de ene kant,
     108 mm verder 2 gaten 27,5 uit elkaar (gestippeld = onderzijde). Omtrek incl. lipje ±119 × 52.
   - Mean Well PWM-60 (NPF-60A) en PWM-120: 2 gaten Ø4,5 diagonaal, 5 mm uit de hoeken (150 × 53 en
     191 × 63). PWM-90: zelfde behuizingsreeks, zelfde 5 mm-patroon (171 × 63). */
const DK_DRIVER_MATEN = [
  {re: /maxi\s*jol+[iy]/i, l: 124, b: 79, h: 22, aansl: "eind", fiche: "R", gaten: [{x: 117.5, y: 6, d: 4.5, sleuf: true}, {x: 6.5, y: 73, d: 4.5, sleuf: true}],
    gatBron: "TCI-fiche MAXI JOLLY US DALI: sleuven hart-op-hart 111 × 67", bron: "TCI DC MAXI JOLLY US DALI (122413) — TCI-fiche"},
  {re: /mini\s*jol+[iy]/i, l: 119, b: 52, h: 22, aansl: "eind", fiche: "R", gaten: [{x: 4.1, y: 26, d: 4.5, sleuf: true}, {x: 112.1, y: 12.25, d: 4}, {x: 112.1, y: 39.75, d: 4}],
    gatBron: "TCI-fiche MINI JOLLY: sleuf + 2 gaten op 108 mm, onderling 27,5", bron: "TCI DC MINI JOLLY DALI (122403) — 110,4 × 52 + lipje (TCI-fiche)"},
  {re: /jol+[iy]/i,        l: 103, b: 67, h: 21, aansl: "eind", fiche: "L", gaten: [{x: 98.25, y: 4.75, d: 4.5, sleuf: true}, {x: 4.75, y: 62.25, d: 4.5, sleuf: true}],
    gatBron: "TCI-fiche JOLLY DALI: L1 93,5 × B1 57,5", bron: "TCI DC JOLLY DALI (122424) — TCI-datasheet via Rexel"},
  {re: /pwm-?\s*120/i,     l: 191, b: 63, h: 37.5, aansl: "twee", fiche: "R", gaten: [{x: 186, y: 5, d: 4.5}, {x: 5, y: 58, d: 4.5}],
    gatBron: "Mean Well-fiche PWM-120: 2 × Ø4,5, 5 mm uit de hoeken", bron: "Mean Well PWM-120 — datasheet"},
  {re: /pwm-?\s*90/i,      l: 171, b: 63, h: 37.5, aansl: "twee", fiche: "R", gaten: [{x: 166, y: 5, d: 4.5}, {x: 5, y: 58, d: 4.5}],
    gatBron: "Mean Well PWM-90: zelfde patroon als PWM-60/120 (5 mm uit de hoeken)", gatTeControleren: true, bron: "Mean Well PWM-90 — datasheet"},
  {re: /pwm-?\s*60/i,      l: 150, b: 53, h: 35, aansl: "twee", fiche: "R", gaten: [{x: 145, y: 5, d: 4.5}, {x: 5, y: 48, d: 4.5}],
    gatBron: "Mean Well-fiche PWM-60 (NPF-60A): 2 × Ø4,5, 5 mm uit de hoeken", bron: "Mean Well PWM-60 — datasheet"},
];
// ruimte tussen de DIN-rail (zone van 48 mm) en de horizontale koker, instelbaar (Peter, 29/10)
function dkRailKoker(p){ const v = parseFloat(p.railKoker); return v >= 0 && v <= 200 ? v : 6; }
// boorgaten van een getekende driver in px (draait 180° als de aansluitingen aan de andere kant zitten)
function dkGatenPx(md){
  const info = md.m._dk || {}, maat = info.maat;
  if(!maat || !Array.isArray(maat.gaten)) return [];
  const draai = info.kant && info.kant !== "beide" && maat.fiche && info.kant !== maat.fiche;
  const sx = md.w / maat.l, sy = md.h / maat.b;
  return maat.gaten.map(g=> ({x: md.x + (draai ? maat.l - g.x : g.x)*sx, y: md.y + (draai ? maat.b - g.y : g.y)*sy, r: (g.d||4.5)/2*sx, sleuf: !!g.sleuf, g}));
}
function dkGatenTekst(gaten){ return (gaten||[]).map(g=> `${g.x},${g.y},${g.d||4.5}${g.sleuf ? "s" : ""}`).join("; "); }
function dkGatenLees(t){
  return String(t||"").split(/[;\n]+/).map(x=> x.trim()).filter(Boolean).map(x=>{
    const m = /^(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*([\d.]+))?\s*(s)?$/i.exec(x.replace(/\s+/g, " "));
    return m ? {x: parseFloat(m[1]), y: parseFloat(m[2]), d: m[3] ? parseFloat(m[3]) : 4.5, ...(m[4] ? {sleuf: true} : {})} : null;
  }).filter(Boolean);
}
function dkMaatSleutel(naam){ return "driver_maat:" + String(naam||"").trim().toLowerCase(); }
function dkDriverMaat(d){
  const naam = d.naam || d.type || "";
  const eigen = cadosInst[dkMaatSleutel(naam)];
  const std = DK_DRIVER_MATEN.find(x=> x.re.test(naam));
  // boorgaten: eigen lijst (gedeeld) gaat voor die van de fiche
  const gatInfo = (eg)=> Array.isArray(eg) && eg.length ? {gaten: eg, fiche: (eigen && eigen.fiche) || (std && std.fiche) || "R", gatBron: "eigen boorgaten (gedeeld)", gatEigen: true}
    : (std ? {gaten: std.gaten, fiche: std.fiche, gatBron: std.gatBron, gatTeControleren: !!std.gatTeControleren} : {gaten: [], fiche: "R", gatBron: "geen boorgaten gekend — vul ze in", gatTeControleren: true});
  if(eigen && eigen.l && eigen.b) return Object.assign({aansl: (std && std.aansl) || "eind"}, eigen, {eigen: true, bron: "eigen maat (gedeeld)"}, gatInfo(eigen.gaten));
  if(std) return Object.assign({l: std.l, b: std.b, h: std.h, aansl: std.aansl, bron: std.bron}, gatInfo(null));
  return Object.assign({l: 120, b: 60, h: 30, aansl: "eind", onbekend: true, bron: "maat onbekend — vul ze in"}, gatInfo(null));
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
/* Kamers verspreid over meer driverkasten (Peter, 29/10): per kamer is de "hoofdkast" de kast met de
   meeste drivers van die kamer; drivers van die kamer in een andere kast worden oranje gemarkeerd. */
function dkDriverKamers(d){ return [...new Set((d.armaturen||[]).map(a=> String(a.ruimte||"").trim()).filter(Boolean))]; }
function dkKamerElders(){
  const kasten = (state.driverkast && state.driverkast.kasten) || [];
  const tel = {};   // kamer -> [aantal per kastindex]
  kasten.forEach((k, ki)=> dkDrivers(k).forEach(d=> dkDriverKamers(d).forEach(r=>{ (tel[r] || (tel[r] = []))[ki] = ((tel[r]||[])[ki]||0) + 1; })));
  const hoofd = {};
  Object.entries(tel).forEach(([r, a])=>{ let best = -1; a.forEach((n, i)=>{ if(n && (best < 0 || n > a[best])) best = i; }); hoofd[r] = best; });
  const uit = {};
  kasten.forEach((k, ki)=> dkDrivers(k).forEach(d=>{
    const elders = dkDriverKamers(d).filter(r=> hoofd[r] !== ki);
    if(elders.length) uit[d.id] = elders.map(r=> ({kamer: r, kast: hoofd[r] + 1}));
  }));
  return uit;
}
function dkEldersTekst(e){ return e.map(x=> `${x.kamer}: de meeste drivers staan in Driverkast ${x.kast}`).join("; "); }
function dkDrivers(dk){ return (dk.items||[]).filter(d=> !d.leeg && (d.categorie||"Driver")==="Driver"); }
// Volgorde op de rail en de verdeelblokken: op drivernummer (D1, D2, ... D30), niet op plaats in de kast
function dkOpNummer(drivers){
  const codes = computeDriverCodes();
  const nr = (d)=>{ const m = /D(\d+)/.exec(codes[d.id] || ""); return m ? parseInt(m[1]) : 1e9; };
  return drivers.slice().sort((a, b)=> nr(a) - nr(b));
}
function dkKringCodes(){ try{ return computeKringCodes(); }catch(_e){ return {}; } }
function dkPlan(dk){
  if(!dk.plan || typeof dk.plan !== "object") dk.plan = {};
  const p = dk.plan;
  if(!p.id) p.id = "dkp_" + dk.id;
  if(!(p.breedte > 0)) p.breedte = 545;
  if(!(p.hoogte > 0)) p.hoogte = 775;
  if(!Array.isArray(p.kolommen)) p.kolommen = [];
  if(!p.draai || typeof p.draai !== "object") p.draai = {};
  if(!p.klemExtra || typeof p.klemExtra !== "object") p.klemExtra = {};
  delete p.klemPerSpot;   // vroeger: klemmen per spot
  if(!Array.isArray(p.bedrading)) p.bedrading = [];
  if(!Array.isArray(p.kamgeleiders)) p.kamgeleiders = [];
  if(!DK_KOKERS.includes(p.kokerV)) p.kokerV = 40;
  if(!DK_KOKERS.includes(p.kokerH)) p.kokerH = 40;
  if(!p.kokerBreedte || typeof p.kokerBreedte !== "object") p.kokerBreedte = {};   // per koker: {H: 60, V1: 50, ...}
  if(p.rkPositie !== "onder") p.rkPositie = "boven";
  if(p.rkDubbel === undefined) p.rkDubbel = true;   // Casentis gebruikt dubbele rijgklemmen in de driverkast
  delete p.indeling;   // oude rij-indeling (eerste testversie)
  return p;
}

/* ---------- klemlijsten ---------- */
// Op welke zekering(en) hangt de driverkast? Eigen keuze bij de werkschakelaar, anders de automaten
// die bij de drivers ingevuld zijn ("Gevoed door automaat").
function dkVoeding(dk, p){
  let lijst = [];
  try{ lijst = alleZekeringAutomaten(); }catch(_e){}
  const van = (id)=> lijst.find(a=> a.id===id);
  if(p && p.voedingZek && van(p.voedingZek)) { const a = van(p.voedingZek); return {codes: [a.code], tekst: a.code + (a.naam ? " — " + a.naam : ""), eigen: true}; }
  const ids = [...new Set(dkDrivers(dk).map(d=> d.zekeringModuleId).filter(Boolean))].filter(id=> van(id));
  const as = ids.map(van);
  return {codes: as.map(a=> a.code), tekst: as.map(a=> a.code + (a.naam ? " — " + a.naam : "")).join(", "), eigen: false};
}
function dkPushKringen(dk){ return [...new Set(dkDrivers(dk).map(d=> d.kringId).filter(Boolean))]; }
// Rijgklemmen van één driver (Peter, 29/10): altijd 1 kabel per driver (+ en −) — de serie- of
// parallelschakeling gebeurt in de strip/spot zelf. Optie: 1 extra klem erbij.
function dkKlemExtra(p, d){ return !!(p.klemExtra && p.klemExtra[d.id]); }
function dkKlemLijst(d, p){
  const lijst = [{sp: 0, pol: "+"}, {sp: 0, pol: "-"}];
  if(dkKlemExtra(p, d)) lijst.push({sp: 0, pol: "s"});
  return lijst;
}
function dkRailBreedte(dk, p){
  const drivers = dkDrivers(dk);
  const n = drivers.length;
  const phx = 2 + (dk.sturing !== "PUSH" ? 2 : dkPushKringen(dk).length);
  let mm = DK_SCHAK_MM + 3 + (dk.sturing !== "PUSH" ? 2*DK_KLEM_MM + 3 : 0) + phx * (dkPhoenixBreedte(n + 1) + 3);
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
    // kleuren (Peter, 29/10): DALI oranje (DA+) en paars (DA−) via de klemfunctie, uitgangen rood (+) en zwart (−)
    const kleur = f==="+" ? "Rood" : (f==="-" ? "Zwart" : "");
    k.push({id, label: lab, functie: f, kleur, zijde: zijde==="L" ? "links" : "rechts", x: zijde==="L" ? 0 : 1, y: Math.round(y*1000)/1000, geenLabel: true,
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
function dkModelSleutel(d){ const m = dkDriverMaat(d); return String(d.naam||d.type||"").trim().toLowerCase() + "|" + m.l + "x" + m.b; }
// "Sorteer op model" (Peter, 29/10): drivers per model/maat bij elkaar, binnen een model op nummer;
// de kolommen worden na elkaar gevuld zodat een model zoveel mogelijk in één blok staat.
function dkPerModel(drivers){
  const opNr = dkOpNummer(drivers);
  const eerste = {};
  opNr.forEach((d, i)=>{ const s = dkModelSleutel(d); if(!(s in eerste)) eerste[s] = i; });
  return opNr.slice().sort((a, b)=> eerste[dkModelSleutel(a)] - eerste[dkModelSleutel(b)] || opNr.indexOf(a) - opNr.indexOf(b));
}
function dkVerdeel(drivers, k, p){
  if(p && p.sorteer === "model"){
    const lijst = dkPerModel(drivers);
    const cols = Array.from({length: k}, ()=> []);
    const hd = (d)=> dkDriverMaat(d).b + DK_TUSSEN_MM;
    const totaal = lijst.reduce((t, d)=> t + hd(d), 0);
    let ci = 0, h = 0;
    lijst.forEach((d, i)=>{
      const rest = lijst.length - i;
      if(ci < k-1 && cols[ci].length && (h + hd(d)/2 > totaal/k || rest <= k-1-ci)){ ci++; h = 0; }
      cols[ci].push(d); h += hd(d);
    });
    return cols;
  }
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
  const zone = DK_RAND_MM + DK_RAIL_H_MM + dkRailKoker(p) + dkKokerMM(p, "H") + 8;
  const kolB = cols.map(c=> Math.max(0, ...c.map(d=> dkDriverMaat(d).l)));
  const kolH = cols.map(c=> c.reduce((t, d, i)=> t + dkDriverMaat(d).b + (i ? DK_TUSSEN_MM : 0), 0));
  const kokerSom = dkKokerPosities(p, cols).reduce((t, ci)=> t + dkKokerMM(p, "V" + ci) + 8, 0);
  return {
    breedte: DK_RAND_MM*2 + kolB.reduce((t, b)=> t + b, 0) + kokerSom,
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
    const cols = dkVerdeel(drivers, k, p);
    const m = dkMeetIndeling(dk, p, cols);
    opties.push({cols, m, k, past: m.breedte <= p.breedte && m.hoogte <= p.hoogte, inBreedte: m.breedte <= p.breedte});
  }
  const score = (o)=> [o.past ? 0 : 1, gemengd && o.k < 3 && p.sorteer !== "model" ? 1 : 0, o.past ? o.k : 0, o.inBreedte ? 0 : 1, o.m.hoogte];
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
  const voeding = dkVoeding(dk, p);
  railModule("dks_" + dk.id, "Werkschakelaar", DK_SCHAK_MM, "schakelaar", [
    {id: "iL", label: "L", functie: "L", zijde: zijKabel, x: 0.3, y: yKabel, rijgSoort: "preflex", tip: "voedingskabel L"},
    {id: "iN", label: "N", functie: "N", zijde: zijKabel, x: 0.7, y: yKabel, rijgSoort: "preflex", tip: "voedingskabel N"},
    {id: "oL", label: "L", functie: "L", zijde: zijKast, x: 0.3, y: yKast, rijgSoort: "kast", tip: "uit naar verdeelblok L"},
    {id: "oN", label: "N", functie: "N", zijde: zijKast, x: 0.7, y: yKast, rijgSoort: "kast", tip: "uit naar verdeelblok N"}], {voeding});
  // DALI-ingang (Peter, 29/10): 2 rijgklemmen naast de werkschakelaar waar de DALI-kabel toekomt
  // (DA+ zwart, DA− grijs), van daar doorverbonden naar de grijze Phoenix-blokken.
  if(dk.sturing !== "PUSH"){
    codes["dkd_" + dk.id] = "DALI";
    railModule("dkd_" + dk.id, "DALI-ingang", 2*DK_KLEM_MM, "dali", [
      {id: "k0", label: "DA+", functie: "DA+", zijde: zijKast, x: 0.25, y: yKast, rijgSoort: "kast", tip: "DALI DA+ · kastzijde (naar verdeelblok DA+)"},
      {id: "k1", label: "DA−", functie: "DA-", zijde: zijKast, x: 0.75, y: yKast, rijgSoort: "kast", tip: "DALI DA− · kastzijde (naar verdeelblok DA−)"},
      {id: "p0", label: "DA+", functie: "DA+", kleur: "Zwart", zijde: zijKabel, x: 0.25, y: yKabel, rijgSoort: "preflex", tip: "DALI-kabel DA+ (zwarte ader)"},
      {id: "p1", label: "DA−", functie: "DA-", kleur: "Grijs", zijde: zijKabel, x: 0.75, y: yKabel, rijgSoort: "preflex", tip: "DALI-kabel DA− (grijze ader)"}]);
  }
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
      // de voeding van het blok komt binnen in de kast (van de werkschakelaar of de DALI-ingang)
      if(!i){ klemmen.push({id: "i", label: "in", functie: f, zijde: zijKast, x: bw*0.5, y: boven ? 0.2 : 0.8, rijgSoort: "kast", tip: `verdeelblok ${lab} · voeding (ingang)`}); continue; }
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
  dkOpNummer(cols.flat()).forEach(d=>{
    const lijst = dkKlemLijst(d, p);
    const klemmen = [];
    const dub = !!p.rkDubbel;
    const nPos = dub ? Math.ceil(lijst.length/2) : lijst.length;
    lijst.forEach((e, i)=>{
      // dubbel: klem i/2, niveau i%2 (het tweede niveau iets dieper)
      const x = ((dub ? Math.floor(i/2) : i) + 0.5)/nPos;
      const niveau = dub ? i % 2 : 0;
      const yK = yKast + (boven ? -1 : 1)*niveau*0.13, yP = yKabel + (boven ? 1 : -1)*niveau*0.13;
      const lab = e.pol==="+" ? "+" : (e.pol==="-" ? "−" : "x");
      const f = e.pol==="s" ? "contact" : e.pol;
      const tip = [codes[d.id], "kabel " + [...new Set((d.armaturen||[]).map(a=> a.ruimte).filter(Boolean))].join(", "), e.pol==="+" ? "plus" : (e.pol==="-" ? "min" : "extra klem")].filter(Boolean).join(" · ");
      const kl = e.pol==="+" ? "Rood" : (e.pol==="-" ? "Zwart" : "");
      klemmen.push({id: `k${i}`, label: lab, functie: f, kleur: kl, zijde: zijKast, x, y: yK, rijgSoort: "kast", tip: tip + " · kastzijde", _sp: e.sp, _pol: e.pol, geenLabel: dub && niveau===1});
      klemmen.push({id: `p${i}`, label: lab, functie: f, kleur: kl, zijde: zijKabel, x, y: yP, rijgSoort: "preflex", tip: tip + " · kabel", _sp: e.sp, _pol: e.pol, geenLabel: dub && niveau===1});
    });
    codes["dkk_" + d.id] = codes[d.id];
    railModule("dkk_" + d.id, d.naam, dkRijgBreedte(lijst, p), "klemmen", klemmen, {driver: d, extra: dkKlemExtra(p, d), spots: dkSpots(d)});
  });
  const railLengte = rx - 3 + DK_RAND_MM;
  // --- horizontale koker naast de rail ---
  const hk0 = railY1 + dkRailKoker(p), hk1 = hk0 + dkKokerMM(p, "H");
  // --- kolommen en verticale kokers, van links naar rechts ---
  const kolPos = dkKokerPosities(p, cols);
  let x = DK_RAND_MM;
  const kolX = [], vKoker = {};
  for(let ci=0; ci<=k; ci++){
    if(kolPos.includes(ci)){ const kb = dkKokerMM(p, "V" + ci); x += 4; vKoker[ci] = {x0: x, x1: x + kb, mm: kb}; x += kb + 4; }
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
      // uitlijning (Peter, 29/10): kolom links van een koker → links uitlijnen, rechts van een koker →
      // rechts, koker aan beide kanten (of geen) → gecentreerd
      const kL = kolPos.includes(ci), kR = kolPos.includes(ci+1);
      const kx = (kR && !kL) ? kolX[ci].x0 : ((kL && !kR) ? kolX[ci].x1 - maat.l : (kolX[ci].x0 + kolX[ci].x1 - maat.l)/2);
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
  kokers.push({id: "H", soort: "h", x0: X0 + DK_RAND_MM*PX, x1: X0 + (totB - DK_RAND_MM)*PX, y0: Y0 + hkY0*PX, y1: Y0 + hkY1*PX, mm: dkKokerMM(p, "H")});
  const vA = boven ? hk1 : (totH - (H - DK_RAND_MM)), vB = boven ? totH - DK_RAND_MM : H - hk1;
  Object.entries(vKoker).forEach(([ci, v])=> kokers.push({id: "V" + ci, soort: "v", kol: +ci, x0: X0 + v.x0*PX, x1: X0 + v.x1*PX, y0: Y0 + Math.min(vA, vB)*PX, y1: Y0 + Math.max(vA, vB)*PX, mm: v.mm}));
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
    s += `<rect x="${k.x0}" y="${k.y0}" width="${k.x1-k.x0}" height="${k.y1-k.y0}" class="dk-koker${uvSelExtra==="koker:" + k.id ? " sel" : ""}" data-koker="${k.id}" data-tip="${escapeHtml((k.soort==="h" ? "Horizontale koker" : "Verticale koker") + " " + k.mm + " mm — klik om de breedte aan te passen")}"/>`;
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
    const elders = dkKamerElders()[d.id];
    let s = `<g class="uv-mod dk-driver${sel}${maat.onbekend ? " onbekend" : ""}${elders ? " kamer-elders" : ""}" data-mod="${m.id}" data-tip="${escapeHtml(tip + (elders ? "\n⚠ andere kast dan de rest van de kamer — " + dkEldersTekst(elders) : ""))}">`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" class="dk-body"/>`;
    const sw = Math.min(24, w*0.17);
    if(info.kant==="L" || info.kant==="beide") s += `<rect x="${x+2}" y="${y+2}" width="${sw}" height="${h-4}" rx="2" class="dk-klemstrook"/>`;
    if(info.kant==="R" || info.kant==="beide") s += `<rect x="${x+w-sw-2}" y="${y+2}" width="${sw}" height="${h-4}" rx="2" class="dk-klemstrook"/>`;
    (m.klemmenEigen||[]).forEach(k=>{
      const kx = k.x < 0.5 ? x + 2 + sw/2 + 3 : x + w - 2 - sw/2 - 3;
      s += `<text x="${kx}" y="${y + k.y*h + 2.5}" class="dk-kl">${escapeHtml(k.label)}</text>`;
    });
    const cx = x + w/2;
    // boorgaten
    dkGatenPx(md).forEach(g=>{
      s += `<circle cx="${g.x}" cy="${g.y}" r="${g.r}" class="dk-gat${g.sleuf ? " sleuf" : ""}"/><path d="M${g.x-g.r-3} ${g.y}H${g.x+g.r+3}M${g.x} ${g.y-g.r-3}V${g.y+g.r+3}" class="dk-gat-kruis"/>`;
    });
    s += `<rect x="${cx-18}" y="${y + 4}" width="36" height="15" rx="4" class="uv-code-bg"/><text x="${cx}" y="${y + 15}" class="uv-code">${escapeHtml(code)}</text>`;
    const naam = String(d.naam || "driver").replace(/^tci\s+/i, "TCI ").replace(/meanwel+\b/i, "Mean Well");
    // omschrijving (Peter, 29/10): per armatuur het draadnummer (armatuurcode), aantal × armatuur en de ruimte
    const binnen = w - 2*sw - 2*Math.max(6, 4.5*DK_PXMM) - 8;
    const maxC = Math.max(8, Math.floor(binnen/5));
    const kort = (t)=> t.length > maxC ? t.slice(0, maxC - 1) + "…" : t;
    const ac = computeDriverCodes();
    const regels = (d.armaturen||[]).filter(a=> a.naam).map(a=> ({nr: ac[a.id] || "", t: `${parseInt(a.aantal)||1}× ${a.naam}`, r: a.ruimte || ""}));
    const lh = 10;
    const plaats = Math.max(1, Math.floor((h - 26 - 12) / lh));   // regels onder code en naam, boven de maat
    let ty = y + 28;
    s += `<text x="${cx}" y="${ty}" class="dk-naam">${escapeHtml(kort(naam))}</text>`;
    ty += lh + 1;
    const toon = [];
    regels.forEach(r=>{ toon.push({nr: r.nr, t: r.t}); if(r.r) toon.push({t: r.r, ruimte: true}); });
    if(toon.length > plaats - 1){
      // te weinig plaats: draadnummer + aantal × armatuur + ruimte op één regel
      toon.length = 0; regels.forEach(r=> toon.push({nr: r.nr, t: r.t + (r.r ? " · " + r.r : "")}));
    }
    toon.slice(0, Math.max(1, plaats - 1)).forEach((r, i, a)=>{
      const meer = i === a.length - 1 && toon.length > a.length ? ` (+${toon.length - a.length})` : "";
      s += r.nr ? `<text x="${cx}" y="${ty}" class="dk-arm"><tspan class="dk-draadnr">${escapeHtml(r.nr)}</tspan> ${escapeHtml(kort(r.t + meer).slice(0, Math.max(4, maxC - r.nr.length - 1)))}</text>`
                : `<text x="${cx}" y="${ty}" class="dk-ruimte">${escapeHtml(kort(r.t + meer))}</text>`;
      ty += lh;
    });
    s += `<text x="${cx}" y="${y + h - 5}" class="dk-maat">${escapeHtml(kort(maat.l + "×" + maat.b + " mm"))}</text>`;
    s += `</g>`;
    return s;
  }
  const soort = info.soort;
  const d = info.driver;
  const tip = soort==="schakelaar" ? "Werkschakelaar — voeding van de driverkast uitschakelen" + (info.voeding && info.voeding.codes.length ? "\nGevoed door zekering " + info.voeding.tekst : "\nZekering nog niet gekend — klik om ze te kiezen") :
    soort==="dali" ? "DALI-ingang — 2 rijgklemmen: DALI-kabel DA+ (zwart) en DA− (grijs), doorverbonden naar de verdeelblokken" :
    soort==="phoenix" ? `Phoenix ${DK_PTFIX_ART} (${info.kleur}) — verdeelblok ${info.lab}, ${info.blokken} blok(ken) van 1 voeding + 18 aansluitingen` :
    [code + " — " + (d.naam||""), info.extra ? "1 kabel (+ en −) + 1 extra klem" : "1 kabel (+ en −)", `${info.spots} spot(s)/strip(s) — serie of parallel in de armatuur`, [...new Set((d.armaturen||[]).map(a=> a.ruimte).filter(Boolean))].join(", ")].filter(Boolean).join("\n");
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
  if(soort==="schakelaar"){
    s += `<rect x="${x + w/2 - 5}" y="${y + h/2 - 12}" width="10" height="18" rx="2" class="dk-hendel"/>`;
    const zk = info.voeding && info.voeding.codes.length ? info.voeding.codes.join("+") : "zek. ?";
    s += `<text x="${x + w/2}" y="${y + h/2 - 16}" class="dk-voeding${info.voeding && info.voeding.codes.length ? "" : " leeg"}">${escapeHtml(zk)}</text>`;
  }
  if(soort==="phoenix"){
    const bw = (w - (info.blokken-1)*2*DK_PXMM)/info.blokken;
    for(let b=0; b<info.blokken; b++) s += `<rect x="${x + b*(bw + 2*DK_PXMM)}" y="${y + h*0.22}" width="${bw}" height="${h*0.62}" rx="3" class="dk-ptfix ${info.kleur}"/>`;
  }
  const lab = soort==="schakelaar" ? "Q" : (soort==="phoenix" ? info.lab : (soort==="dali" ? "DALI" : code));
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
  const drivers = dkOpNummer(p.kolommen.flat().map(id=> byId[id]).filter(Boolean));
  const nieuw = [];
  const draad = (a, b, sectie)=>{ if(a && b) nieuw.push({id: cryptoId(), a, b, kleur: "Bruin", kleurAuto: true, sectie: sectie || "1.5", label: "", auto: true}); };
  const blok = (sl)=> "dkp_" + sl + "_" + dk.id;
  // werkschakelaar -> verdeelblokken L en N; DALI-ingang -> verdeelblokken DA+ en DA−
  draad({m: "dks_" + dk.id, k: "oL"}, {m: blok("L"), k: "i"});
  draad({m: "dks_" + dk.id, k: "oN"}, {m: blok("N"), k: "i"});
  if(dk.sturing !== "PUSH"){
    draad({m: "dkd_" + dk.id, k: "k0"}, {m: blok("DA+"), k: "i"});
    draad({m: "dkd_" + dk.id, k: "k1"}, {m: blok("DA-"), k: "i"});
  }
  // elke driver op zijn eigen punt van de verdeelblokken
  drivers.forEach((d, i)=>{
    const pt = "p" + (i+1);
    draad({m: blok("L"), k: pt}, {m: d.id, k: "L"});
    draad({m: blok("N"), k: pt}, {m: d.id, k: "N"});
    if(dk.sturing === "PUSH"){ if(d.kringId) draad({m: blok("P" + d.kringId), k: pt}, {m: d.id, k: "P"}); }
    else { draad({m: blok("DA+"), k: pt}, {m: d.id, k: "DA1"}); draad({m: blok("DA-"), k: pt}, {m: d.id, k: "DA2"}); }
  });
  // uitgangen naar de rijgklemmen: 1 kabel per driver (+ rood, − zwart); de extra klem blijft vrij
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
  p.versie = DK_PLAN_VERSIE;
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
  const sig = JSON.stringify([dkDrivers(dk).map(d=> [d.naam, d.armaturen && d.armaturen.map(a=> a.aantal)]), p.klemExtra, p.draai, p.kokerV, p.kokerH, p.kokerBreedte, p.rkDubbel, dk.sturing,
    Object.keys(cadosInst).filter(k=> k.startsWith("driver_maat:")).map(k=> JSON.stringify(cadosInst[k]))]);
  if(dkAdviesCache.has(sig)) return dkAdviesCache.get(sig);
  const lijst = RITTAL_AX.map(k=> Object.assign({}, k, dkPastOp(dk, k.pb, k.ph)));
  const passend = lijst.filter(k=> k.past).sort((a, b)=> (a.b*a.h - b.b*b.h) || (a.d - b.d));
  const res = {lijst, beste: passend[0] || null};
  dkAdviesCache.set(sig, res);
  return res;
}

/* ---------- slepen, verplaatsen naar een andere kast, splitsen ---------- */
// kolommen (x-bereik in px) uit de getekende drivers
function dkKolomBereiken(p){
  const b = [];
  p._layout.mods.forEach(md=>{
    const i = md.m._dk && md.m._dk.soort==="driver" ? md.m._dk.kolom : -1;
    if(i < 0) return;
    const r = b[i] || (b[i] = {x0: Infinity, x1: -Infinity, mods: []});
    r.x0 = Math.min(r.x0, md.x); r.x1 = Math.max(r.x1, md.x + md.w); r.mods.push(md);
  });
  return b;
}
// waar komt een gesleepte driver terecht? {kol, index} of {kol: nieuw}
function dkDropDoel(p, id, pt){
  const b = dkKolomBereiken(p);
  let kol = -1, best = Infinity;
  b.forEach((r, i)=>{ if(!r) return; const c = (r.x0 + r.x1)/2; const d = Math.abs(pt.x - c); if(d < best){ best = d; kol = i; } });
  const laatste = b[b.length-1];
  if(laatste && pt.x > laatste.x1 + 40) return {kol: b.length, index: 0, nieuw: true};
  if(b[0] && pt.x < b[0].x0 - 40) return {kol: 0, index: 0, nieuwLinks: true};
  const leden = (b[kol] ? b[kol].mods : []).filter(md=> md.m.id !== id).sort((a, c)=> a.y - c.y);
  const boven = p.rkPositie !== "onder";
  let index = leden.filter(md=> (md.y + md.h/2) < pt.y).length;
  if(!boven) index = leden.length - index;   // rail onderaan: kolom loopt van onder naar boven
  return {kol, index};
}
function dkDrop(p, id, pt){
  const doel = dkDropDoel(p, id, pt);
  const van = p.kolommen.findIndex(c=> c.includes(id));
  if(van < 0) return false;
  const oud = JSON.stringify(p.kolommen);
  p.kolommen[van] = p.kolommen[van].filter(x=> x !== id);
  if(doel.nieuw) p.kolommen.push([id]);
  else if(doel.nieuwLinks) p.kolommen.unshift([id]);
  else (p.kolommen[doel.kol] || (p.kolommen[doel.kol] = [])).splice(doel.index, 0, id);
  if(doel.nieuw || doel.nieuwLinks || doel.kol !== van) delete p.draai[id];
  p.kolommen = p.kolommen.filter(c=> c.length);
  return JSON.stringify(p.kolommen) !== oud;
}
function dkDropVoorbeeld(p, id, pt, svg){
  let r = svg.querySelector(".dk-drop");
  if(!r){ r = document.createElementNS("http://www.w3.org/2000/svg", "rect"); r.setAttribute("class", "dk-drop"); svg.appendChild(r); }
  const doel = dkDropDoel(p, id, pt);
  const b = dkKolomBereiken(p);
  if(doel.nieuw || doel.nieuwLinks){
    const x = doel.nieuw ? b[b.length-1].x1 + 20 : b[0].x0 - 40;
    r.setAttribute("x", x); r.setAttribute("y", pt.y - 40); r.setAttribute("width", 20); r.setAttribute("height", 80);
    return;
  }
  const kol = b[doel.kol];
  if(!kol) return;
  const leden = kol.mods.filter(md=> md.m.id !== id).sort((a, c)=> a.y - c.y);
  const boven = p.rkPositie !== "onder";
  const i = boven ? doel.index : leden.length - doel.index;
  const y = i < leden.length ? leden[i].y - 6 : (leden.length ? leden[leden.length-1].y + leden[leden.length-1].h + 4 : pt.y);
  r.setAttribute("x", kol.x0 - 4); r.setAttribute("y", y - 2); r.setAttribute("width", kol.x1 - kol.x0 + 8); r.setAttribute("height", 4);
}
// driver naar een andere driverkast (of een nieuwe) verplaatsen
/* Drivernummers = kabelnummers op de werf (Peter, 29/10: "kloppen de nummers van de klemmen nog volgens
   de nummers van de kabels?"). De nummering telt door over de kasten heen, dus een driver naar een andere
   kast verplaatsen zou alle volgende nummers doen verschuiven. Daarom houden we bij een verplaatsing de
   oude nummers vast (handmatig nummer), enkel het kastvoorvoegsel (1. / 2.) volgt de kast. */
function dkNummerVan(code){ const m = /D(\d+)/.exec(code || ""); return m ? parseInt(m[1]) : null; }
function dkHoudNummers(fn){
  const voor = {}, c0 = computeDriverCodes();
  state.driverkast.kasten.forEach(k=> k.items.forEach(d=>{ voor[d.id] = dkNummerVan(c0[d.id]); }));
  const r = fn();
  for(let ronde=0; ronde<500; ronde++){
    const c = computeDriverCodes();
    let fout = null;
    state.driverkast.kasten.some(k=> k.items.some(d=>{ if(voor[d.id] != null && dkNummerVan(c[d.id]) !== voor[d.id]){ fout = d; return true; } return false; }));
    if(!fout) break;
    fout.manueelNummer = String(voor[fout.id]);
  }
  return r;
}
function dkNaarKast(dk, d, doelId){ return dkHoudNummers(()=> dkNaarKastRuw(dk, d, doelId)); }
function dkNaarKastRuw(dk, d, doelId){
  let doel = state.driverkast.kasten.find(k=> k.id===doelId);
  if(!doel){
    doel = newDriverKast();
    doel.sturing = dk.sturing; doel.kamer = dk.kamer || ""; doel.verdieping = dk.verdieping || "";
    const i = state.driverkast.kasten.indexOf(dk);
    state.driverkast.kasten.splice(i + 1, 0, doel);
  }
  dk.items = dk.items.filter(x=> x !== d);
  doel.items.push(d);
  if(dk.plan){
    dk.plan.bedrading = (dk.plan.bedrading||[]).filter(w=> w.a.m !== d.id && w.b.m !== d.id && w.a.m !== "dkk_" + d.id && w.b.m !== "dkk_" + d.id);
    delete dk.plan.draai[d.id];
  }
  return doel;
}
// kast splitsen: de rechtse kolommen (ongeveer de helft van de drivers) naar een nieuwe kast
function dkSplits(dk){
  const p = dkPlan(dk);
  const byId = Object.fromEntries(dkDrivers(dk).map(d=> [d.id, d]));
  const totaal = p.kolommen.flat().length;
  if(totaal < 2) return null;
  let teller = 0;
  const weg = [];
  p.kolommen.forEach(c=>{ c.forEach(id=>{ teller++; if(teller > Math.ceil(totaal/2)) weg.push(id); }); });
  let nieuw = null;
  weg.forEach(id=>{ const d = byId[id]; if(!d) return; nieuw = dkNaarKast(dk, d, nieuw ? nieuw.id : null); });
  dkVulIndeling(dk, true);
  if(dk.plan) dk.plan.bedrading = dk.plan.bedrading.filter(w=> !w.auto);
  return nieuw;
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

/* ---------- overzicht van alle driverkasten naast elkaar (Peter, 29/10) ----------
   Een samengestelde "kast": elke driverkast met zijn eigen geometrie, horizontaal verschoven. Enkel
   om drivers tussen kasten te verslepen; draden tekenen gebeurt in de kast zelf. */
let dkOverzicht = false;
const DK_ALLE_GAP = 90, DK_ALLE_TOP = 26;
function dkAlleKast(){
  const delen = [];
  let ox = 0, width = 0, height = 0;
  const mods = [], klemPos = {}, routes = [], codes = {};
  let achter = "";
  state.driverkast.kasten.forEach((dk, i)=>{
    if(!dkDrivers(dk).length) return;
    const p = dkPlanKast(dk);
    uvSyncEnOpruimen(p);
    const g = dkGeometrie(p);
    const oy = DK_ALLE_TOP;
    const sx = (pt)=> ({x: pt.x + ox, y: pt.y + oy});
    g.mods.forEach(md=> mods.push(Object.assign({}, md, {x: md.x + ox, y: md.y + oy})));
    Object.entries(g.klemPos).forEach(([k, v])=> klemPos[k] = Object.assign({}, v, sx(v)));
    dkRoutes(p, g).forEach(r=>{ const verts = r.verts.map(sx); routes.push(Object.assign({}, r, {verts, d: uvPad(verts), A: klemPos[uvKlemKey(r.w.a.m, r.w.a.k)], B: klemPos[uvKlemKey(r.w.b.m, r.w.b.k)]})); });
    Object.assign(codes, p._codes);
    const naam = "Driverkast " + (i+1) + (dk.kamer ? " · " + dk.kamer : "");
    achter += `<g transform="translate(${ox} ${oy})">${dkAchtergrondSvg(p, g).replace(/ data-koker="[^"]*"/g, "")}</g>`;
    achter += `<text x="${ox + UV.PADX}" y="${oy + DK_TOP_PX - 22}" class="dk-kasttitel">${escapeHtml(naam)} — ${dkDrivers(dk).length} drivers</text>`;
    delen.push({dk, p, ox, oy, x0: ox, x1: ox + g.width, nr: i+1, naam});
    width = ox + g.width; height = Math.max(height, g.height + oy);
    ox += g.width + DK_ALLE_GAP;
  });
  const c = {id: "__alle_driverkasten", bedrading: routes.map(r=> r.w)};
  const geo = {mods, klemPos, width: width + 40, height, codes, gootTop: [], hoogte: [], kamBand: [], rijY: [], rijH: [],
    plan: {perDraad: {}, banen: [], zijN: {L: 0, R: 0}}, padL: UV.PADX, padR: UV.PADX, kastR: width - UV.PADX,
    _eigen: true, _absoluut: true, _router: ()=> routes, kokers: []};
  dkEigen(c, {rijen: [{id: "dk-alle", items: mods.map(md=> md.m)}], maat: 1, naam: "Alle driverkasten", _dk: {alle: true}, _alle: true, _delen: delen, _codes: codes,
    _breedtePx: width - 2*UV.PADX, _geometrie: ()=> geo, _dkAchtergrond: ()=> achter, kolommen: [], klemExtra: {}, draai: {}});
  return c;
}
function dkDeelVoorX(c, x){
  const d = c._delen;
  if(!d.length) return null;
  return d.find(q=> x >= q.x0 - DK_ALLE_GAP/2 && x <= q.x1 + DK_ALLE_GAP/2) || (x < d[0].x0 ? d[0] : d[d.length-1]);
}
function dkDeelVanDriver(c, id){ return c._delen.find(q=> dkDrivers(q.dk).some(d=> d.id===id)); }
function dkAlleVoorbeeld(c, id, pt, svg){
  const laatste = c._delen[c._delen.length-1];
  let r = svg.querySelector(".dk-drop");
  if(laatste && pt.x > laatste.x1 + DK_ALLE_GAP/2){
    if(!r){ r = document.createElementNS("http://www.w3.org/2000/svg", "rect"); r.setAttribute("class", "dk-drop"); svg.appendChild(r); }
    r.setAttribute("x", laatste.x1 + 20); r.setAttribute("y", DK_ALLE_TOP + DK_TOP_PX); r.setAttribute("width", 30); r.setAttribute("height", 160);
    return;
  }
  const q = dkDeelVoorX(c, pt.x);
  if(!q) return;
  dkDropVoorbeeld(q.p, id, {x: pt.x - q.ox, y: pt.y - q.oy}, svg);
  r = svg.querySelector(".dk-drop");
  if(r){ r.setAttribute("x", parseFloat(r.getAttribute("x")) + q.ox); r.setAttribute("y", parseFloat(r.getAttribute("y")) + q.oy); }
}
function dkAlleDrop(c, id, pt){
  const van = dkDeelVanDriver(c, id);
  if(!van) return false;
  const laatste = c._delen[c._delen.length-1];
  const d = dkDrivers(van.dk).find(x=> x.id===id);
  if(pt.x > laatste.x1 + DK_ALLE_GAP/2){
    const doel = dkNaarKast(van.dk, d, null);
    dkVulIndeling(van.dk);
    dkOmzet(dkPlanKast(van.dk)); dkOmzet(dkPlanKast(doel));
    toast(`${computeDriverCodes()[id] || "Driver"} naar een nieuwe Driverkast ${state.driverkast.kasten.indexOf(doel)+1}.`);
    return true;
  }
  const naar = dkDeelVoorX(c, pt.x);
  const lokaal = {x: pt.x - naar.ox, y: pt.y - naar.oy};
  if(naar.dk === van.dk) return dkDrop(van.p, id, lokaal);
  const doel = dkDropDoel(naar.p, id, lokaal);
  dkNaarKast(van.dk, d, naar.dk.id);
  const p = dkPlan(naar.dk);
  if(doel.nieuw) p.kolommen.push([id]);
  else if(doel.nieuwLinks) p.kolommen.unshift([id]);
  else (p.kolommen[doel.kol] || (p.kolommen[doel.kol] = [])).splice(doel.index, 0, id);
  van.dk.plan.kolommen = van.dk.plan.kolommen.map(k=> k.filter(x=> x !== id)).filter(k=> k.length);
  // automatische draden van beide kasten opnieuw voorstellen (zelf getekende blijven)
  dkOmzet(dkPlanKast(van.dk)); dkOmzet(dkPlanKast(naar.dk));
  toast(`${computeDriverCodes()[id] || "Driver"} verplaatst naar Driverkast ${naar.nr} — draden van beide kasten opnieuw voorgesteld.`);
  return true;
}

/* ---------- lijst van de drivers links van de kast ---------- */
function dkLijstPaneel(zone, h){
  const kast = h.kast;
  const delen = kast._alle ? kast._delen.map(q=> ({dk: q.dk, p: q.p, naam: q.naam})) : [{dk: kast._dk, p: kast, naam: kast.naam}];
  const codes = computeDriverCodes();
  const eldersAlle = dkKamerElders();
  zone.appendChild(el(`<div class="dk-lijst-kop"><span>Drivers</span><span>${delen.reduce((t, q)=> t + dkDrivers(q.dk).length, 0)}</span></div>`));
  delen.forEach(q=>{
    const drivers = q.p.sorteer === "model" ? dkPerModel(dkDrivers(q.dk)) : dkOpNummer(dkDrivers(q.dk));
    const watt = drivers.reduce((t, d)=> t + (parseFloat(d.vermogen)||0), 0);
    if(kast._alle) zone.appendChild(el(`<div class="dk-lijst-kop"><span>${escapeHtml(q.naam)}</span><span>${drivers.length}</span></div>`));
    let vorigModel = null;
    drivers.forEach(d=>{
      const maat = dkDriverMaat(d);
      const kol = q.p.kolommen.findIndex(c=> c.includes(d.id));
      const arm = (d.armaturen||[]).filter(a=> a.naam).map(a=> (parseInt(a.aantal)||1) + "× " + a.naam).join(", ");
      const ruimte = [...new Set((d.armaturen||[]).map(a=> a.ruimte).filter(Boolean))].join(", ");
      const model = dkModelSleutel(d);
      const nieuwModel = q.p.sorteer === "model" && model !== vorigModel;
      vorigModel = model;
      const elders = eldersAlle[d.id];
      const rij = el(`<div class="dk-lijst-rij${uvSelMod===d.id ? " sel" : ""}${nieuwModel ? " modelstart" : ""}${elders ? " kamer-elders" : ""}" data-id="${d.id}" title="${elders ? escapeHtml("Andere kast dan de rest van de kamer — " + dkEldersTekst(elders)) : "klik om te selecteren"}">
        <span class="c">${escapeHtml(codes[d.id] || "")}</span>
        <span class="n">${escapeHtml(d.naam || "driver")}</span>
        <span class="s">${maat.l}×${maat.b} mm · ${dkIsSpanning(d) ? "spanning" : "stroom"} · ${dkSpots(d)} spot(s)${kol >= 0 ? " · kolom " + (kol+1) : ""}</span>
        <span class="s">${escapeHtml(arm || "geen armaturen")}${ruimte ? " · " + escapeHtml(ruimte) : ""}</span>
      </div>`);
      rij.addEventListener("click", ()=> h.selecteer(d.id));
      zone.appendChild(rij);
    });
    void watt;
  });
}

/* Ontwerp (tabblad Driverkast): een driver een nummer in een andere kast geven (Peter, 29/10) */
function dkKastVanDriver(driver){ return state.driverkast.kasten.find(k=> k.items.includes(driver)); }
function dkKastVeld(driver){
  const huidig = dkKastVanDriver(driver);
  return `<div class="field"><label>Driverkast (nummer volgt de kast)</label><select class="di-dkkast">
    ${state.driverkast.kasten.map((k, i)=> `<option value="${k.id}" ${k===huidig?"selected":""}>Driverkast ${i+1}${k.kamer ? " · " + escapeHtml(k.kamer) : ""}</option>`).join("")}
    <option value="__nieuw">＋ Nieuwe driverkast</option></select></div>`;
}
function dkVerhuisDriver(driver, doelId){
  const van = dkKastVanDriver(driver);
  if(!van || van.id === doelId) return null;
  const doel = dkNaarKast(van, driver, doelId === "__nieuw" ? null : doelId);
  if(van.plan) van.plan.kolommen = (van.plan.kolommen||[]).map(c=> c.filter(x=> x !== driver.id)).filter(c=> c.length);
  try{
    [van, doel].forEach(k=>{ if(k.plan && dkDrivers(k).length) dkOmzet(dkPlanKast(k)); });
  }catch(_e){}
  toast(`${computeDriverCodes()[driver.id] || "Driver"} staat nu in Driverkast ${state.driverkast.kasten.indexOf(doel)+1}.`);
  return doel;
}
const UV_CTX_DK = {
  tab: "driverplan", panelId: "panel-driverplan", titel: "Driverkast plan", zekering: false, eendraad: false, kam: false,
  kast: ()=>{
    if(dkOverzicht && state.driverkast.kasten.filter(k=> dkDrivers(k).length).length > 1) return dkAlleKast();
    dkOverzicht = false;
    const dk = dkHuidig();
    if(!dk) return null;
    const p = dkPlanKast(dk);
    // Draden die nog volgens een vorige testversie automatisch voorgesteld werden (doorlussen van driver
    // naar driver, klemmen per spot, ...) eenmalig vervangen door het huidige voorstel; zelf getekende
    // draden blijven staan.
    if(p.versie !== DK_PLAN_VERSIE){
      const oud = p.bedrading.filter(w=> w.auto).length;
      if(oud){ dkOmzet(p); toast(`Driverkast: ${oud} automatische draden van een vorige testversie vervangen door het nieuwe voorstel.`); }
      p.versie = DK_PLAN_VERSIE;
      save();
    }
    return p;
  },
  huidigId: ()=> dkOverzicht ? "__alle" : dkHuidigId,
  kasten: ()=>{
    const l = state.driverkast.kasten.map((k, i)=> ({id: k.id, naam: "Driverkast " + (i+1) + (k.kamer ? " · " + k.kamer : "")}));
    if(state.driverkast.kasten.filter(k=> dkDrivers(k).length).length > 1) l.push({id: "__alle", naam: "▦ Alle kasten"});
    return l;
  },
  kiesKast: (id)=>{ if(id === "__alle"){ dkOverzicht = true; return; } dkOverzicht = false; dkHuidigId = id; },
  alleenSlepen: (kast)=> !!kast._alle,
  linksPaneel: (zone, h)=> dkLijstPaneel(zone, h),
  layoutTab: "driverkast", layoutTitel: "drivers en armaturen aanpassen op het tabblad Driverkast",
  omzetLabel: "Draden voorstellen", omzetTitel: "werkschakelaar, verdeelblokken (L/N/DALI of push) en de uitgangen naar de rijgklemmen automatisch tekenen",
  omzet: (p)=>{
    if(!p._alle) return dkOmzet(p);
    p._delen.forEach(q=> dkOmzet(dkPlanKast(q.dk)));
    return `Draden voorgesteld in ${p._delen.length} driverkasten.`;
  },
  voorTeken: (p)=>{ if(p._dk && !p._alle) dkPlanKast(p._dk); },
  moduleSleep: {
    mag: (id)=>{
      if(dkOverzicht) return state.driverkast.kasten.some(k=> dkDrivers(k).some(d=> d.id===id));
      const dk = dkHuidig(); return !!(dk && dkDrivers(dk).some(d=> d.id===id));
    },
    voorbeeld: (p, id, pt, svg)=> p._alle ? dkAlleVoorbeeld(p, id, pt, svg) : dkDropVoorbeeld(p, id, pt, svg),
    drop: (p, id, pt)=> p._alle ? dkAlleDrop(p, id, pt) : dkDrop(p, id, pt),
  },
  export: ()=> dkExport(),
  hulpTekst: "Welke drivers en armaturen er in de kast zitten, pas je aan op het tabblad Driverkast. Hier kies je de kast, de kokers en de plaats en draaiing van de drivers.",
  extraKaart: (zone, h)=>{
    if(h.kast._alle){
      const c = h.kast;
      const box = el(`<div class="card"><div class="card-body uv-sidebody">
        <strong>Alle driverkasten</strong>
        ${c._delen.map(q=> `<div class="hint"><strong>${escapeHtml(q.naam)}</strong> — ${dkDrivers(q.dk).length} drivers · ${q.p.kast ? escapeHtml(q.p.kast.naam) + " " + q.p.kast.b + "×" + q.p.kast.h : "plaat " + q.p.breedte + "×" + q.p.hoogte} mm</div>`).join("")}
        <div class="hint">Sleep een driver naar een andere kast (of rechts naast de laatste kast voor een nieuwe kast). De automatische draden van beide kasten worden daarna opnieuw voorgesteld. Draden tekenen doe je in de kast zelf.</div>
      </div></div>`);
      zone.appendChild(box);
      return;
    }
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
        <label class="uv-veld" title="standaard voor alle verticale kokers; klik op een koker in de tekening om hem apart in te stellen">Koker verticaal<select class="dk-kv">${DK_KOKERS.map(v=> `<option value="${v}" ${v===p.kokerV?"selected":""}>${v} mm</option>`).join("")}</select></label>
        <label class="uv-veld">Koker bij rail<select class="dk-kh">${DK_KOKERS.map(v=> `<option value="${v}" ${v===p.kokerH?"selected":""}>${v} mm</option>`).join("")}</select></label>
      </div>
      <label class="uv-veld" title="vrije ruimte tussen de zone van de DIN-rail (48 mm) en de horizontale koker">Ruimte DIN-rail ↔ koker (mm)<input type="number" min="0" max="200" step="1" class="dk-rk" value="${dkRailKoker(p)}"></label>
      <label class="uv-veld">DIN-rail (schakelaar, verdeelblokken, rijgklemmen)<select class="dk-rkpos">
        <option value="boven" ${p.rkPositie!=="onder"?"selected":""}>Bovenaan</option>
        <option value="onder" ${p.rkPositie==="onder"?"selected":""}>Onderaan</option></select></label>
      <label class="uv-veld">Rijgklemmen<select class="dk-dub">
        <option value="0" ${!p.rkDubbel?"selected":""}>Enkel (1 niveau, 5,2 mm per klem)</option>
        <option value="1" ${p.rkDubbel?"selected":""}>Dubbel (2 niveaus: + en − op 1 klem)</option></select></label>
      <label class="uv-veld">Volgorde bij herschikken<select class="dk-sort">
        <option value="nummer" ${p.sorteer!=="model"?"selected":""}>Op nummer (24V-drivers in het midden)</option>
        <option value="model" ${p.sorteer==="model"?"selected":""}>Per model/maat (zelfde drivers samen)</option></select></label>
      ${L.railLengte > p.breedte ? `<div class="uv-fout">De DIN-rail is ±${Math.ceil(L.railLengte/5)*5} mm lang en past niet op de montageplaat van ${p.breedte} mm${p.rkDubbel ? "" : " — met dubbele rijgklemmen wordt hij korter"}.</div>` : ""}
      <div class="hint">Sturing ${escapeHtml(dk.sturing||"DALI")} · ${dkDrivers(dk).length} drivers in ${p.kolommen.length} kolom(men) · ${dkDrivers(dk).reduce((t, d)=> t + dkSpots(d), 0)} spots/strips</div>
      <div class="uv-knoprij">
        <button class="btn small ghost dk-herschik" title="alle drivers opnieuw verdelen over kolommen volgens de montageplaat">↻ Drivers herschikken</button>
        <button class="btn small ghost dk-splits" title="de helft van de drivers (de rechtse kolommen) naar een nieuwe driverkast">✂ Splitsen in 2 kasten</button>
      </div>
      <div class="hint">Sleep een driver om hem te verplaatsen (naar een andere kolom, of naast de laatste kolom voor een nieuwe kolom).</div>
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
    box.querySelector(".dk-rk").addEventListener("change", e=>{ const v = parseFloat(e.target.value); p.railKoker = v >= 0 ? Math.min(200, v) : 6; save(); h.rerender(); });
    box.querySelector(".dk-rkpos").addEventListener("change", e=>{ p.rkPositie = e.target.value; save(); h.rerender(); });
    box.querySelector(".dk-dub").addEventListener("change", e=>{ p.rkDubbel = e.target.value==="1"; save(); h.rerender(); });
    box.querySelector(".dk-sort").addEventListener("change", e=>{ p.sorteer = e.target.value; dkVulIndeling(dk, true); save(); h.rerender(); });
    box.querySelector(".dk-herschik").addEventListener("click", ()=>{ dkVulIndeling(dk, true); save(); h.rerender(); });
    box.querySelector(".dk-splits").addEventListener("click", ()=>{
      const n = dkDrivers(dk).length;
      if(!confirm(`Driverkast splitsen? Ongeveer de helft van de ${n} drivers (de rechtse kolommen) gaat naar een nieuwe driverkast. De automatische draden worden opnieuw voorgesteld; dat kan ook op het tabblad Driverkast.`)) return;
      const nieuw = dkSplits(dk);
      if(!nieuw) return;
      dkOmzet(dkPlanKast(dk));
      dkOmzet(dkPlanKast(nieuw));
      save();
      toast(`Gesplitst: ${dkDrivers(dk).length} drivers in deze kast, ${dkDrivers(nieuw).length} in de nieuwe kast.`);
      h.rerender();
    });
    zone.appendChild(box);
  },
  extraDetail: (sel, zone, h)=>{
    if(h.kast._alle || !String(sel).startsWith("koker:")) return false;
    const p = h.kast, id = sel.slice(6);
    const k = p._layout.kokers.find(x=> x.id===id);
    if(!k) return false;
    const huidig = dkKokerMM(p, id);
    const eigen = DK_KOKERS.includes(p.kokerBreedte[id]);
    const box = el(`<div class="card uv-detail"><div class="card-body uv-sidebody">
      <div class="uv-detail-kop"><strong>${k.soort==="h" ? "Horizontale koker (bij de rail)" : "Verticale koker"}</strong><button class="uv-x dk-ksluit" title="sluiten (Esc)">✕</button></div>
      <div class="uv-veld">Breedte<div class="uv-knoprij">${DK_KOKERS.map(v=> `<button class="btn small ${v===huidig ? "primary" : "ghost"} dk-kb" data-v="${v}">${v} mm</button>`).join("")}</div></div>
      <div class="hint">${eigen ? "Eigen breedte voor deze koker." : "Volgt de standaard voor " + (k.soort==="h" ? "de koker bij de rail" : "verticale kokers") + "."} ${(()=>{ const n = p.bedrading.length; return ""; })()}</div>
      ${eigen ? `<button class="btn small ghost dk-kstd">Standaardbreedte gebruiken</button>` : ""}
    </div></div>`);
    box.querySelectorAll(".dk-kb").forEach(b=> b.addEventListener("click", ()=>{ p.kokerBreedte[id] = parseInt(b.dataset.v); save(); h.rerender(); }));
    const st = box.querySelector(".dk-kstd");
    if(st) st.addEventListener("click", ()=>{ delete p.kokerBreedte[id]; save(); h.rerender(); });
    box.querySelector(".dk-ksluit").addEventListener("click", ()=>{ uvSelExtra = null; h.teken(); });
    zone.appendChild(box);
    return true;
  },
  moduleDetail: (md, zone, h)=>{
    if(h.kast._alle){
      const q = h.kast._delen.find(x=> x.p._layout.mods.some(m=> m.m.id===md.id));
      if(!q) return;
      const m2 = q.p._layout.mods.find(m=> m.m.id===md.id).m;
      return UV_CTX_DK.moduleDetail(m2, zone, Object.assign({}, h, {kast: q.p}));
    }
    const p = h.kast, dk = p._dk, info = md._dk;   // md = de (pseudo)module zelf
    const codes = p._codes;
    if(info.soort==="dali"){
      zone.appendChild(el(`<div class="card uv-detail"><div class="card-body uv-sidebody"><strong>DALI-ingang</strong>
        <div class="hint">2 rijgklemmen naast de werkschakelaar: de DALI-kabel komt toe op DA+ (zwarte ader) en DA− (grijze ader) en wordt doorverbonden naar de grijze verdeelblokken.</div></div></div>`));
      return;
    }
    if(info.soort==="schakelaar"){
      let autos = [];
      try{ autos = alleZekeringAutomaten(); }catch(_e){}
      const v = dkVoeding(dk, p);
      const box = el(`<div class="card uv-detail"><div class="card-body uv-sidebody"><strong>Werkschakelaar</strong>
        <div class="hint">De voedingskabel (L/N) komt toe op de werkschakelaar; daarna naar de verdeelblokken L en N.</div>
        <label class="uv-veld">Gevoed door zekering<select class="dk-voed">
          <option value="">${v.eigen || !v.codes.length ? "— volgens de drivers —" : "volgens de drivers: " + escapeHtml(v.codes.join(", "))}</option>
          ${autos.map(a=> `<option value="${a.id}" ${p.voedingZek===a.id ? "selected" : ""}>${escapeHtml(a.code)}${a.naam ? " — " + escapeHtml(a.naam) : ""}</option>`).join("")}
        </select></label>
        <div class="hint">${v.codes.length ? "Op de tekening: " + escapeHtml(v.tekst) : "Nog geen zekering: kies ze hier, of vul bij de drivers \"Gevoed door automaat\" in."}</div></div></div>`);
      box.querySelector(".dk-voed").addEventListener("change", e=>{ if(e.target.value) p.voedingZek = e.target.value; else delete p.voedingZek; save(); h.rerender(); });
      zone.appendChild(box);
      return;
    }
    if(info.soort==="phoenix"){
      zone.appendChild(el(`<div class="card uv-detail"><div class="card-body uv-sidebody"><strong>${info.soort==="schakelaar" ? "Werkschakelaar" : "Phoenix-verdeelblok " + escapeHtml(info.lab)}</strong>
        <div class="hint">${info.soort==="schakelaar" ? "De voedingskabel (L/N) komt toe op de werkschakelaar; daarna naar de verdeelblokken L en N." : `Phoenix ${DK_PTFIX_ART}, ${info.kleur}: ${info.blokken} blok(ken) met geïntegreerde voeding en 18 push-in-aansluitingen (0,14–4 mm², 28,6 × 28,7 mm) — elke driver op zijn eigen punt (${dkDrivers(dk).length} nodig).`}</div></div></div>`));
      return;
    }
    const d = info.driver;
    const maat = dkDriverMaat(d);
    const extra = dkKlemExtra(p, d);
    const isDriver = info.soort==="driver";
    const twee = dkTweeKanten(d);
    const box = el(`<div class="card uv-detail"><div class="card-body uv-sidebody">
      <div class="uv-detail-kop"><strong>${escapeHtml(codes[d.id]||"")} ${escapeHtml(d.naam||"driver")}</strong></div>
      <div class="hint">${escapeHtml((d.armaturen||[]).filter(a=> a.naam).map(a=> (parseInt(a.aantal)||1) + "× " + a.naam + (a.ruimte ? " (" + a.ruimte + ")" : "")).join(", ") || "geen armaturen")}<br>${dkIsSpanning(d) ? "spanningsgestuurd — spots/strips parallel" : "stroomgestuurd — spots in serie"}</div>
      <label class="uv-veld">Rijgklemmen<select class="dk-ps">
        <option value="0" ${!extra?"selected":""}>1 kabel: + en − (2 klemmen)</option>
        <option value="1" ${extra?"selected":""}>1 kabel + 1 extra klem (3 klemmen)</option></select></label>
      <div class="hint">Serie- of parallelschakeling gebeurt in de strip of spot zelf.</div>
      ${isDriver ? `${twee ? `<div class="hint">Aansluitingen links (ingang) én rechts (uitgang) — kokers aan beide kanten.</div>` : `<div class="uv-veld">Aansluitingen<div class="uv-knoprij">
          <button class="btn small ${info.kant==="L"?"primary":"ghost"} dk-kant" data-k="L">◧ links</button><button class="btn small ${info.kant==="R"?"primary":"ghost"} dk-kant" data-k="R">rechts ◨</button></div></div>`}
      <div class="uv-veld">Maat (L × B × H mm)${maat.onbekend ? ' <span class="uv-fout-tel">onbekend</span>' : ""}
        <div class="dk-maatrij"><input type="number" class="dk-ml" value="${maat.l}"><input type="number" class="dk-mb" value="${maat.b}"><input type="number" class="dk-mh" value="${maat.h}"></div>
        <div class="hint">${escapeHtml(maat.bron)} — geldt voor alle "${escapeHtml(d.naam||"")}"</div></div>
      <label class="uv-veld">Boorgaten (x,y,Ø mm; …)${maat.gatTeControleren ? ' <span class="uv-fout-tel" title="niet rechtstreeks op de fiche gemaat — meet na">te controleren</span>' : ""}
        <input class="dk-gaten" value="${escapeHtml(dkGatenTekst(maat.gaten))}"></label>
      <div class="hint">${escapeHtml(maat.gatBron || "")} · gemeten vanaf de linkerbovenhoek met de aansluitingen ${maat.fiche==="L" ? "links" : "rechts"} (zoals op de fiche); "s" = sleuf. Staan de aansluitingen aan de andere kant, dan draait het patroon mee. Ook in de DXF (laag BOORGATEN).</div>
      <div class="uv-veld">Plaats (kolom ${info.kolom + 1} van ${p.kolommen.length})<div class="uv-knoprij">
        <button class="btn small ghost dk-mv" data-r="op" title="hoger in de kolom">↑</button><button class="btn small ghost dk-mv" data-r="neer" title="lager in de kolom">↓</button>
        <button class="btn small ghost dk-mv" data-r="links" title="naar de kolom links">← kolom</button><button class="btn small ghost dk-mv" data-r="rechts" title="naar de kolom rechts (of een nieuwe)">kolom →</button></div></div>` : ""}
      ${isDriver ? `<label class="uv-veld">Kast<select class="dk-naarkast">
        ${state.driverkast.kasten.map((k, i)=> `<option value="${k.id}" ${k===dk?"selected":""}>Driverkast ${i+1}${k.kamer ? " · " + escapeHtml(k.kamer) : ""}</option>`).join("")}
        <option value="__nieuw">＋ Nieuwe driverkast</option></select></label>` : ""}
      <div class="uv-knoprij"><button class="btn small ghost dk-layout">Op tabblad Driverkast</button></div>
    </div></div>`);
    box.querySelector(".dk-ps").addEventListener("change", e=>{ if(e.target.value==="1") p.klemExtra[d.id] = true; else delete p.klemExtra[d.id]; save(); h.rerender(); });
    box.querySelectorAll(".dk-mv").forEach(b=> b.addEventListener("click", ()=>{ dkVerplaats(p, d.id, b.dataset.r); save(); h.rerender(); }));
    box.querySelectorAll(".dk-kant").forEach(b=> b.addEventListener("click", ()=>{ p.draai[d.id] = b.dataset.k; save(); h.rerender(); }));
    const ml = box.querySelector(".dk-ml");
    if(ml){
      const zetMaat = async ()=>{
        const l = parseFloat(box.querySelector(".dk-ml").value), b = parseFloat(box.querySelector(".dk-mb").value), hh = parseFloat(box.querySelector(".dk-mh").value);
        if(!(l > 0 && b > 0)) return;
        const waarde = {l, b, h: hh || 0};
        const gt = box.querySelector(".dk-gaten").value;
        if(gt.trim() && gt.trim() !== dkGatenTekst(maat.gaten).trim()) waarde.gaten = dkGatenLees(gt);
        else if(maat.gatEigen) waarde.gaten = maat.gaten;
        try{ await bewaarCadosInst(dkMaatSleutel(d.naam||d.type), waarde); toast(`Maat van "${d.naam}" bewaard (${l} × ${b} mm) — geldt voor alle projecten`); }
        catch(err){ alert("Bewaren mislukt: " + (err.message||err)); }
        h.rerender();
      };
      ["dk-ml","dk-mb","dk-mh","dk-gaten"].forEach(c=> box.querySelector("." + c).addEventListener("change", zetMaat));
    }
    box.querySelector(".dk-layout").addEventListener("click", ()=> selectTab("driverkast"));
    const nk = box.querySelector(".dk-naarkast");
    if(nk) nk.addEventListener("change", e=>{
      const doel = dkNaarKast(dk, d, e.target.value==="__nieuw" ? null : e.target.value);
      uvSelMod = null;
      save();
      toast(`${codes[d.id]||"Driver"} verplaatst naar Driverkast ${state.driverkast.kasten.indexOf(doel)+1}.`);
      h.rerender();
    });
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
