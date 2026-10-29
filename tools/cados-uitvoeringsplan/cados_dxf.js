
/* =========================================================================
   DXF-EXPORT (2026-10-29, Peter: "van beide kastontwerpen een DXF export voorzien, zodat we dit in
   AutoCAD op schaal kunnen afdrukken"). Schrijft een ASCII-DXF (R12 / AC1009, door elke AutoCAD-versie
   te openen) in millimeter, schaal 1:1: 1 DIN-module = 18 mm breed, drivers op hun echte maat.
   De hoogte van een zekeringmodule is schematisch (zoals op het scherm); breedtes en de driverkast
   zijn op maat. Lagen: KAST, GOTEN, RAILS, MODULES, KLEMMEN, KLEMLABELS, DRADEN, DRAADNUMMERS,
   KAMGELEIDERS, TEKST — elk apart aan/uit te zetten in AutoCAD.
   ========================================================================= */
const DXF_PXMM = UV.MW / 18;
const DXF_KLEUR = {"Bruin": 34, "Blauw": 5, "Zwart": 7, "Grijs": 8, "Geel/groen": 3, "Rood": 1, "Oranje": 30, "Wit": 9, "Violet": 200, "Roze": 221, "Geel": 2};
const DXF_LAGEN = [["KAST", 8], ["GOTEN", 9], ["RAILS", 8], ["MODULES", 7], ["KLEMMEN", 7], ["KLEMLABELS", 8], ["DRADEN", 7], ["DRAADNUMMERS", 7], ["KAMGELEIDERS", 30], ["BOORGATEN", 1], ["TEKST", 7]];
function dxfTekst(t){
  return String(t == null ? "" : t)
    .replace(/[—–]/g, "-").replace(/×/g, "x").replace(/²/g, "2").replace(/[↑▲]/g, "^").replace(/[↓▼]/g, "v").replace(/−/g, "-").replace(/·/g, "-")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "").trim();
}
function dxfMaker(){
  const e = [];
  const n = (v)=> (Math.round(v*1000)/1000).toString();
  const X = (px)=> px / DXF_PXMM, Y = (px)=> -px / DXF_PXMM;   // DXF: y naar boven
  const api = {
    lijn(x1, y1, x2, y2, laag, kleur){ e.push("0","LINE","8",laag, ...(kleur ? ["62", String(kleur)] : []), "10",n(X(x1)),"20",n(Y(y1)),"30","0","11",n(X(x2)),"21",n(Y(y2)),"31","0"); },
    poly(pts, laag, kleur, dicht){
      if(pts.length < 2) return;
      e.push("0","POLYLINE","8",laag, ...(kleur ? ["62", String(kleur)] : []), "66","1","10","0","20","0","30","0","70", dicht ? "1" : "0");
      pts.forEach(p=> e.push("0","VERTEX","8",laag,"10",n(X(p.x)),"20",n(Y(p.y)),"30","0"));
      e.push("0","SEQEND","8",laag);
    },
    rect(x, y, w, h, laag, kleur){ api.poly([{x, y}, {x: x+w, y}, {x: x+w, y: y+h}, {x, y: y+h}], laag, kleur, true); },
    cirkel(x, y, rPx, laag, kleur){ e.push("0","CIRCLE","8",laag, ...(kleur ? ["62", String(kleur)] : []), "10",n(X(x)),"20",n(Y(y)),"30","0","40",n(rPx / DXF_PXMM)); },
    // tekst gecentreerd op (x,y); hoogte in mm
    tekst(x, y, t, hMm, laag, opts){
      const s = dxfTekst(t);
      if(!s) return;
      const o = opts || {};
      e.push("0","TEXT","8",laag, ...(o.kleur ? ["62", String(o.kleur)] : []), "10",n(X(x)),"20",n(Y(y)),"30","0","40",n(hMm),"1",s,
        ...(o.rot ? ["50", String(o.rot)] : []), "72", String(o.h === undefined ? 1 : o.h), "11",n(X(x)),"21",n(Y(y)),"31","0","73", String(o.v === undefined ? 2 : o.v));
    },
    bestand(){
      const lagen = ["0","SECTION","2","TABLES","0","TABLE","2","LTYPE","70","1","0","LTYPE","2","CONTINUOUS","70","0","3","Solid line","72","65","73","0","40","0.0","0","ENDTAB",
        "0","TABLE","2","LAYER","70", String(DXF_LAGEN.length)];
      DXF_LAGEN.forEach(([naam, kleur])=> lagen.push("0","LAYER","2",naam,"70","0","62",String(kleur),"6","CONTINUOUS"));
      lagen.push("0","ENDTAB","0","ENDSEC");
      const kop = ["0","SECTION","2","HEADER","9","$ACADVER","1","AC1009","9","$INSUNITS","70","4","9","$MEASUREMENT","70","1","0","ENDSEC"];
      return [...kop, ...lagen, "0","SECTION","2","ENTITIES", ...e, "0","ENDSEC","0","EOF"].join("\r\n") + "\r\n";
    }
  };
  return api;
}
function bouwDxf(kast, titel){
  if(kast._dk) dkPlanKast(kast._dk);
  const geo = uvGeometrie(kast);
  const routes = uvRoutes(kast, geo);
  const kammen = uvKamLayout(kast, geo);
  const d = dxfMaker();
  const kastB = uvKastBreedtePx(kast);
  // kast / montageplaat
  if(kast._dxfExtra){
    kast._dxfExtra(d, geo);
    const kt = kast.kast ? `Rittal ${kast.kast.naam} ${kast.kast.b}x${kast.kast.h}x${kast.kast.d} - montageplaat ${kast.breedte} x ${kast.hoogte} mm` : `montageplaat ${kast.breedte} x ${kast.hoogte} mm`;
    d.tekst(geo.padL + kastB/2, 4, `${titel} - ${kt} - schaal 1:1 (mm)`, 5, "TEKST");
  } else {
    d.rect(geo.padL - 14, 0, kastB + 28, geo.height, "KAST");
    d.tekst(geo.padL + kastB/2, -10, `${titel} - ${kast.maat} modules (${kast.maat*18} mm) - schaal 1:1 (mm), modulehoogte schematisch`, 5, "TEKST");
    for(let c=0; c<=kast.rijen.length; c++){
      if(geo.hoogte[c] > 30) d.rect(geo.padL - 6, geo.gootTop[c] + geo.kamBand[c] + 4, geo.kastR - geo.padL + 12, Math.max(6, geo.hoogte[c] - geo.kamBand[c] - 10), "GOTEN");
    }
    kast.rijen.forEach((rij, ri)=>{
      const rh = geo.rijH ? geo.rijH[ri] : UV.MH;
      d.rect(geo.padL - 10, geo.rijY[ri] + rh/2 - 12, kastB + 20, 24, "RAILS");
    });
  }
  // modules
  geo.mods.forEach(md=>{
    const m = md.m;
    if(m.categorie==="Leeg") return;
    d.rect(md.x, md.y, md.w, md.h, "MODULES");
    const cx = md.x + md.w/2;
    if(md.code) d.tekst(cx, md.y + md.h*(m._dk && m._dk.soort==="driver" ? 0.14 : 0.3), md.code, 3.5, "TEKST");
    let regels = [];
    if(m._dk && m._dk.soort==="driver"){
      const mt = m._dk.maat; regels = [m.naam, `${mt.l}x${mt.b} mm`];
      if(mt.gat && mt.gat.hoh > 0){
        const gy = md.y + md.h/2;
        [-1, 1].forEach(z=>{ const gx = cx + z*mt.gat.hoh/2*DXF_PXMM; d.cirkel(gx, gy, mt.gat.d/2*DXF_PXMM, "BOORGATEN"); d.lijn(gx - 4*DXF_PXMM, gy, gx + 4*DXF_PXMM, gy, "BOORGATEN"); d.lijn(gx, gy - 4*DXF_PXMM, gx, gy + 4*DXF_PXMM, "BOORGATEN"); });
      }
      const ac = computeDriverCodes();
      (m._dk.driver.armaturen||[]).filter(a=> a.naam).forEach(a=> regels.push(`${ac[a.id]||""} ${parseInt(a.aantal)||1}x ${a.naam}${a.ruimte ? " - " + a.ruimte : ""}`));
    }
    else if(m._dk) regels = [m._dk.soort==="schakelaar" ? "Q werkschakelaar" : (m._dk.soort==="phoenix" ? m._dk.lab : "")];
    else regels = [typeof chipSpecText === "function" ? chipSpecText(m) : "", m.naam || ""];
    regels.filter(Boolean).forEach((r, i)=>{
      const hMm = Math.min(2.5, (md.w / DXF_PXMM) / Math.max(4, r.length) * 1.6);
      const drv = m._dk && m._dk.soort==="driver";
      d.tekst(cx, drv ? md.y + md.h*0.3 + i*4*DXF_PXMM : md.y + md.h*0.45 + i*5*DXF_PXMM, r, hMm, "TEKST");
    });
  });
  // kamgeleiders
  kammen.forEach(kl=>{
    kl.geleiders.forEach(f=>{
      const kk = DXF_KLEUR[standaardKleurVoorFunctie ? standaardKleurVoorFunctie(f) : "Zwart"] || 30;
      d.lijn(kl.x0, kl.gy[f], kl.x1, kl.gy[f], "KAMGELEIDERS", kk);
    });
    kl.tanden.forEach(t=> d.lijn(t.x, t.y, t.x, t.yg, "KAMGELEIDERS"));
    d.tekst(kl.x0 + 14, kl.yBot + 6, "kam " + (KAM_TYPES[kl.kam.type] || {}).label, 2, "KAMGELEIDERS", {h: 0});
  });
  // draden
  const nr = {};
  kast.bedrading.forEach((w, i)=>{ nr[w.id] = i+1; });
  routes.forEach(r=>{
    const kleur = DXF_KLEUR[r.w.kleur] || 7;
    d.poly(r.verts, "DRADEN", kleur, false);
    const v = r.verts;
    if(v.length > 1){
      [[v[0], v[1]], [v[v.length-1], v[v.length-2]]].forEach(([p, q])=>{
        const l = Math.abs(q.x-p.x) + Math.abs(q.y-p.y);
        if(l < 4) return;
        const f = Math.min(16, l*0.5)/l;
        const verticaal = Math.abs(q.x - p.x) < 0.01;
        d.tekst(p.x + (q.x-p.x)*f + (verticaal ? 4 : 0), p.y + (q.y-p.y)*f - (verticaal ? 0 : 4), String(nr[r.w.id]), 1.8, "DRAADNUMMERS", {kleur, h: verticaal ? 0 : 1});
      });
    }
  });
  // klemmen
  Object.values(geo.klemPos).forEach(p=>{
    d.cirkel(p.x, p.y, p.k.geenLabel ? 3.5 : 5, "KLEMMEN");
    if(p.k.geenLabel){ d.tekst(p.x + (p.k.x < 0.5 ? 9 : -9), p.y, String(p.k.label||""), 1.4, "KLEMLABELS"); return; }
    const ly = p.zijde==="boven" ? p.y - 9 : p.y + 13;
    d.tekst(p.x, ly, String(p.k.label||"").slice(0, 6), 1.5, "KLEMLABELS");
  });
  return d.bestand();
}
function downloadDxf(kast, titel){
  try{
    const inhoud = bouwDxf(kast, titel);
    const naam = dxfTekst((state.instellingen.project || "project") + " - " + titel).replace(/[^A-Za-z0-9 _.-]+/g, "_").replace(/\s+/g, "_") + ".dxf";
    const blob = new Blob([inhoud], {type: "application/dxf"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = naam;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast(`DXF gedownload: ${naam} (mm, schaal 1:1)`);
    return inhoud;
  }catch(e){ alert("DXF maken mislukt: " + (e.message || e)); }
}
