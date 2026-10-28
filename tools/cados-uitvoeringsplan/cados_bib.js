/* =========================================================================
   MODULEBIBLIOTHEEK + UITVOERINGSPLAN (2026-10-28, op vraag van Peter)
   "Bij ontwerp van zekeringkast moet er wel onderscheid zijn tussen layout
   (zoals nu, graag te behouden) en uitvoeringsplan: nieuw toe te voegen."
   - Layout = het bestaande tabblad "Zekeringen" (plaatsing + nummering) --
     daar is niets aan veranderd, enkel extra velden in de module-editor
     (curve, kA, type differentieel, bibliotheekmodule).
   - Uitvoeringsplan = nieuw tabblad: dezelfde kast, maar getekend met de
     echte technische tekening per module, de aansluitklemmen als snappunten
     en bedradingslijnen ertussen; plus een automatisch afgeleid
     eendraadschema.
   - Modulebibliotheek = gedeeld over alle projecten (Supabase-tabel
     elektro_catalogus_modules + bucket module-tekeningen). De AI (Edge
     Function "module-analyse") leest een foto / technische tekening / PDF,
     vult de specs in en duidt de aansluitklemmen aan; wat ze niet zeker weet
     wordt als vraag getoond.
   DB/AI-toegang loopt via window.dbListModules/dbSaveModule/dbDeleteModule/
   dbUploadModuleTekening/aiModuleAnalyse (buitenste script, zelfde reden als
   dbGetCadosDossier: dit IIFE heeft geen toegang tot `sb`).
   ========================================================================= */
let moduleBib = [];
let moduleBibGeladen = false;
let moduleBibPromise = null;
function laadModuleBib(force){
  if(force) moduleBibPromise = null;
  if(!moduleBibPromise){
    moduleBibPromise = (async()=>{
      try{
        if(window.dbListModules){ moduleBib = await window.dbListModules(); moduleBibGeladen = true; }
      }catch(e){
        console.error("Modulebibliotheek laden mislukt", e);
        moduleBibPromise = null;
        throw e;
      }
      return moduleBib;
    })();
  }
  return moduleBibPromise;
}
const CURVE_OPTIES = ["","B","C","D","K","Z"];
const KA_OPTIES = ["","3","4.5","6","10","15","25","36","50"];
const DIFF_TYPE_OPTIES = ["","AC","A","A-SI","F","B"];
const DRAAD_KLEUREN = {
  "Bruin":"#8a4b1f", "Blauw":"#1f63c6", "Zwart":"#1d1d1f", "Grijs":"#8b8f96", "Geel/groen":"#2e9d3a",
  "Rood":"#d0302b", "Oranje":"#ee7d11", "Wit":"#f4f4f4", "Violet":"#7b3fb8", "Roze":"#e58fb4", "Geel":"#f2d600"
};
// Aderkleur zoals in het tabblad Rijgklemmen ingevuld (bv. "Bruin", "Rood/Zwart", "Geel/groen")
// -> draadkleur uit DRAAD_KLEUREN (bij tweekleurige aders de eerste kleur, behalve geel/groen).
function aderKleurNaarDraad(naam){
  const t = String(naam||"").trim().toLowerCase();
  if(!t) return null;
  if(t.includes("geel") && t.includes("groen")) return "Geel/groen";
  const eerste = t.split(/[\/\s-]+/)[0];
  return Object.keys(DRAAD_KLEUREN).find(k=> k.toLowerCase()===eerste) || null;
}
const DRAAD_SECTIES = ["0.8","1.5","2.5","4","6","10","16","25"];
function draadBreedte(sectie){ const s = parseFloat(sectie)||1.5; return Math.max(1.6, Math.min(5, 1.1+Math.sqrt(s)*0.9)); }
function normFunctie(f){
  const s = String(f||"").trim().toUpperCase();
  if(["L","L1","L2","L3","N","PE","+","-"].includes(s)) return s;
  return s;
}
function standaardKleurVoorFunctie(f){
  const t = klemFunctieKleur(f);
  if(t && DRAAD_KLEUREN[t]) return t;
  const s = normFunctie(f);
  if(s==="N" || s==="-") return "Blauw";
  if(s==="PE") return "Geel/groen";
  if(s==="L2") return "Zwart";
  if(s==="L3") return "Grijs";
  if(s==="+") return "Rood";
  return "Bruin";
}
function zijdeVanKlem(k){ return k.zijde==="onder" || k.zijde==="boven" ? k.zijde : ((parseFloat(k.y)||0) >= 0.5 ? "onder" : "boven"); }

/* ---------- Aansluitklemmen ---------- */
function poolLabels(polen){
  const n = parseInt(polen)||1;
  if(n===1) return ["L"];
  if(n===2) return ["L","N"];
  if(n===3) return ["L1","L2","L3"];
  return ["L1","L2","L3","N"];
}
// Standaardklemmen voor een module zonder bibliotheektekening: per pool een
// klem boven (voeding) en onder (vertrek), domotica krijgt voeding boven en
// uitgangen/bus onder.
function standaardKlemmen(m){
  const cat = m.categorie || "Overig";
  const out = [];
  const add = (id, label, functie, zijde, x)=> out.push({id, label, functie, zijde, x, y: zijde==="boven" ? 0.06 : 0.94});
  if(cat==="Leeg") return out;
  if(cat==="Automaat" || cat==="Differentieel" || cat==="Overig"){
    const L = poolLabels(m.polen || (cat==="Differentieel" ? "2P" : "1P"));
    L.forEach((l, i)=>{ const x = (i+0.5)/L.length; add("t"+i, l, l, "boven", x); add("b"+i, l, l, "onder", x); });
    return out;
  }
  if(cat==="Rijgklemmenmodule" && (m.rijgklemKlemIds||[]).length){
    // De echte rijgklemmen (tabblad Rijgklemmen). Per geleider een KASTZIJDE (bedrading in de kast)
    // en een PREFLEX-ZIJDE (de kabel die toekomt). Rijgklemmen bovenaan in de kast: kastzijde onder,
    // Preflex boven; onderaan in de kast omgekeerd (instelbaar per module). De aderkleur uit de
    // ontwerpfase bepaalt kleur van het snappunt en van de draad die je eraan trekt.
    // Enkel = 1 geleider per klem (gegevens "onder"); Dubbel = 2 niveaus (onder + boven).
    const items = (state.interlex && state.interlex.items) || [];
    const dubbel = state.interlex && state.interlex.type==="dubbel";
    const positie = rijgklemPositie(m);
    const kastZ = positie==="boven" ? "onder" : "boven", prefZ = positie==="boven" ? "boven" : "onder";
    const yVan = (zijde, niveau)=> zijde==="boven" ? (niveau ? 0.18 : 0.06) : (niveau ? 0.82 : 0.94);
    const ids = m.rijgklemKlemIds;
    ids.forEach((kid, i)=>{
      const idx = items.findIndex(k=> k.id===kid);
      const klem = items[idx] || {};
      const nr = idx >= 0 ? String(idx+1) : "?";
      const niveaus = dubbel ? [klem.onder||{}, klem.boven||{}] : [klem.onder||{}];
      niveaus.forEach((ader, nv)=>{
        const x = (i+0.5)/ids.length + (dubbel ? (nv ? 0.17 : -0.17)/ids.length : 0);
        const label = dubbel ? nr+"."+(nv+1) : nr;
        const functie = functieVoorAderkleur(ader.kleur) || "contact";
        const basis = "Rijgklem "+label + (ader.kleur ? " · "+ader.kleur : "");
        const suffix = nv ? "2_" : "_";
        out.push({id: "rk"+suffix+kid, label, functie, zijde: kastZ, x, y: yVan(kastZ, nv), kleur: ader.kleur||"", rijgSoort: "kast",
          tip: [basis, "kastzijde", ader.watwaar].filter(Boolean).join(" · ")});
        out.push({id: "rp"+suffix+kid, label, functie, zijde: prefZ, x, y: yVan(prefZ, nv), kleur: ader.kleur||"", rijgSoort: "preflex",
          tip: [basis, "Preflex", ader.watwaar, ader.aansluiting, klem.kamer, klem.info].filter(Boolean).join(" · ")});
      });
    });
    return out;
  }
  if(cat==="Rijgklemmenmodule"){
    const n = Math.max(2, Math.min(14, (m.rijgklemKlemIds||[]).length || Math.round((parseInt(m.breedte)||2)*3.5)));
    for(let i=0;i<n;i++){ const x = (i+0.5)/n; add("t"+i, String(i+1), "contact", "boven", x); add("b"+i, String(i+1), "contact", "onder", x); }
    return out;
  }
  add("tL", "L", "L", "boven", 0.3);
  add("tN", "N", "N", "boven", 0.7);
  if(cat==="HVAC" || cat==="Relais"){
    const n = Math.max(1, (m.uitgangen||[]).length || 1);
    for(let i=0;i<n;i++) add("q"+i, "Q"+(i+1), "uit", "onder", (i+0.5)/n);
  } else if(cat==="Voeding"){
    add("bP", "+", "+", "onder", 0.3); add("bM", "-", "-", "onder", 0.7);
  } else if(cat==="DALI"){
    add("bA", "DA+", "DA+", "onder", 0.3); add("bB", "DA-", "DA-", "onder", 0.7);
  } else {
    add("bA", "bus+", "bus+", "onder", 0.3); add("bB", "bus-", "bus-", "onder", 0.7);
  }
  return out;
}
// Waar zit de rijgklemmenmodule in de kast? Manueel (m.rijgklemPositie) of automatisch uit de rij:
// bovenste helft van de kast = "boven", onderste helft = "onder".
function rijgklemPositie(m){
  if(m.rijgklemPositie==="boven" || m.rijgklemPositie==="onder") return m.rijgklemPositie;
  const kast = state.zekeringen.kasten.find(k=> k.rijen.some(r=> r.items.some(it=> it.id===m.id)));
  if(!kast) return "boven";
  const ri = kast.rijen.findIndex(r=> r.items.some(it=> it.id===m.id));
  return ri <= (kast.rijen.length-1)/2 ? "boven" : "onder";
}
function functieVoorAderkleur(kleur){
  const k = String(kleur||"").toLowerCase();
  if(!k) return null;
  if(k.includes("geel") || k.includes("groen")) return "PE";
  if(k.includes("blauw")) return "N";
  if(k.includes("bruin") || k.includes("zwart") || k.includes("grijs")) return "L";
  return null;
}
// Volgorde: eigen aanpassing van deze module > bibliotheekmodule > aangepaste standaard
// (Standaardmodules) > ingebouwde standaard. Een rijgklemmenmodule volgt altijd de echte
// rijgklemmen (tenzij er een eigen aanpassing is).
function klemmenVoorModule(m){
  if(Array.isArray(m.klemmenEigen) && m.klemmenEigen.length) return m.klemmenEigen;
  if(m.categorie==="Rijgklemmenmodule") return standaardKlemmen(m);
  if(m.bib && Array.isArray(m.bib.klemmen) && m.bib.klemmen.length) return m.bib.klemmen;
  const sj = sjabloonVoor(m);
  if(sj && Array.isArray(sj.klemmen) && sj.klemmen.length) return sj.klemmen;
  return standaardKlemmen(m);
}

/* ---------- Bibliotheek <-> module ---------- */
function normA(v){ const n = parseFloat(String(v||"").replace(",", ".")); return n ? (String(n)+"A") : ""; }
function normMA(v){ const n = parseFloat(String(v||"").replace(",", ".")); return n ? (String(n)+"mA") : ""; }
function normPolen(v){
  const s = String(v||"").toUpperCase().replace(/\s/g, "");
  if(!s) return "";
  if(s==="1P+N") return "2P";
  if(s==="3P+N") return "4P";
  const n = parseInt(s);
  return (n>=1 && n<=4) ? n+"P" : "";
}
function bibSnapshot(row){
  return { id: row.id, naam: row.naam||"", tekening_url: row.tekening_url||"", klemmen: Array.isArray(row.klemmen) ? row.klemmen : [], breedte: Number(row.breedte)||0, weergave: (row.specs && row.specs.weergave) || null };
}
function bibSpecTekst(row){
  const cat = row.categorie || "";
  const bits = [];
  if(row.polen) bits.push(row.polen);
  if(row.stroom) bits.push((row.curve||"") + String(row.stroom).replace(/A$/i, "") + "A");
  else if(row.curve) bits.push("curve "+row.curve);
  if(row.kortsluit) bits.push(row.kortsluit+" kA");
  if(row.gevoeligheid) bits.push(String(row.gevoeligheid).replace(/mA$/i, "")+" mA");
  if(row.diff_type) bits.push("type "+row.diff_type);
  if(Number(row.breedte)) bits.push(row.breedte+" mod.");
  return [MODULE_CATEGORIEEN[cat] ? MODULE_CATEGORIEEN[cat].label : cat, bits.join(" · ")].filter(Boolean).join(" — ");
}
// opts.behoudLayout (automatische omzetting): de layout is leidend -- enkel koppelen en lege
// velden (curve/kA/type) aanvullen, niets aan soort/polen/A/breedte veranderen.
function applyBibOpModule(m, row, opts){
  if(opts && opts.behoudLayout){
    if(!m.curve && row.curve) m.curve = row.curve;
    if(!m.kA && row.kortsluit) m.kA = String(row.kortsluit);
    if(!m.diffType && row.diff_type) m.diffType = row.diff_type;
    if(!m.type) m.type = [row.merk, row.artikelnr].filter(Boolean).join(" ") || row.naam || "";
    m.bibId = row.id;
    m.bib = bibSnapshot(row);
    return;
  }
  if(row.categorie && MODULE_CATEGORIEEN[row.categorie] && m.categorie !== row.categorie){
    m.categorie = row.categorie;
    if(row.categorie==="Differentieel" && m.isHoofd===undefined) m.isHoofd = false;
    if(row.categorie==="Automaat" && m.isRem===undefined) m.isRem = false;
    if((row.categorie==="HVAC" || row.categorie==="Relais") && !Array.isArray(m.uitgangen)) m.uitgangen = [newUitgang()];
    if(row.categorie==="Rijgklemmenmodule" && !Array.isArray(m.rijgklemKlemIds)){ m.rijgklemKlemIds = []; m.capaciteit = m.capaciteit||""; }
  }
  const p = normPolen(row.polen); if(p) m.polen = p;
  const a = normA(row.stroom); if(a) m.A = a;
  if(row.curve) m.curve = row.curve;
  if(row.kortsluit) m.kA = String(row.kortsluit);
  const ma = normMA(row.gevoeligheid); if(ma) m.mA = ma;
  if(row.diff_type) m.diffType = row.diff_type;
  m.type = [row.merk, row.artikelnr].filter(Boolean).join(" ") || row.naam || m.type;
  const b = Number(row.breedte);
  if(b > 0 && m.categorie !== "Rijgklemmenmodule") m.breedte = b;
  else if(AUTO_BREEDTE_CATS.includes(m.categorie) && m.categorie !== "Rijgklemmenmodule") m.breedte = polenToBreedte(m.polen);
  m.bibId = row.id;
  m.bib = bibSnapshot(row);
}
function moduleNaarBibPreset(m){
  return {
    categorie: m.categorie && m.categorie!=="Leeg" ? m.categorie : "Automaat",
    polen: m.polen||"", stroom: m.A ? String(parseFloat(m.A)||"") : "", curve: m.curve||"",
    kortsluit: m.kA||"", gevoeligheid: m.mA ? String(parseFloat(m.mA)||"") : "", diff_type: m.diffType||"",
    breedte: moduleBreedte(m)||""
  };
}
function bibMatchScore(row, m){
  let s = 0;
  if(row.categorie === m.categorie) s += 10;
  if(normPolen(row.polen) && normPolen(row.polen) === m.polen) s += 3;
  if(normA(row.stroom) && normA(row.stroom) === m.A) s += 3;
  if(row.curve && row.curve === m.curve) s += 2;
  if(row.kortsluit && String(row.kortsluit) === String(m.kA||"")) s += 1;
  if(normMA(row.gevoeligheid) && normMA(row.gevoeligheid) === m.mA) s += 2;
  return s;
}
// Vult een <select> met de bibliotheekmodules van dezelfde soort, best
// passende eerst (polen/A/curve/kA zoals op de module ingesteld).
function fillBibSelect(sel, m){
  const vul = ()=>{
    const rows = moduleBib.filter(r=> r.categorie === m.categorie)
      .sort((a,b)=> bibMatchScore(b, m) - bibMatchScore(a, m) || String(a.naam).localeCompare(String(b.naam)));
    sel.innerHTML = `<option value="">— standaardtekening (geen bibliotheekmodule) —</option>` +
      rows.map(r=>`<option value="${r.id}" ${String(m.bibId||"")===String(r.id)?"selected":""}>${escapeHtml(r.naam)}${bibMatchScore(r,m)>=16?" ✓":""} — ${escapeHtml(bibSpecTekst(r).split(" — ")[1]||"")}</option>`).join("");
    if(m.bibId && !rows.some(r=> String(r.id)===String(m.bibId))){
      sel.insertAdjacentHTML("beforeend", `<option value="${m.bibId}" selected>${escapeHtml((m.bib&&m.bib.naam)||"(gekoppelde module)")}</option>`);
    }
  };
  if(moduleBibGeladen){ vul(); return; }
  sel.innerHTML = `<option value="">bibliotheek laden…</option>`;
  laadModuleBib().then(vul).catch(()=>{ sel.innerHTML = `<option value="">— bibliotheek niet bereikbaar —</option>`; });
}
// Extra velden in de module-editor van de Layout (zie renderModuleEditor).
function bibEditorVeldenHtml(m, cat){
  if(cat==="Leeg") return "";
  let h = "";
  if(cat==="Automaat" || cat==="Overig"){
    h += `<div class="field"><label>Curve</label><select class="me-curve">${CURVE_OPTIES.map(v=>`<option value="${v}" ${(m.curve||"")===v?"selected":""}>${v||"—"}</option>`).join("")}</select></div>`;
  }
  if(cat==="Automaat" || cat==="Differentieel" || cat==="Overig"){
    h += `<div class="field"><label>Kortsluitvermogen</label><select class="me-ka">${KA_OPTIES.map(v=>`<option value="${v}" ${String(m.kA||"")===v?"selected":""}>${v ? v+" kA" : "—"}</option>`).join("")}</select></div>`;
  }
  if(cat==="Differentieel"){
    h += `<div class="field"><label>Type differentieel</label><select class="me-difftype">${DIFF_TYPE_OPTIES.map(v=>`<option value="${v}" ${(m.diffType||"")===v?"selected":""}>${v||"—"}</option>`).join("")}</select></div>`;
  }
  h += `<div class="field wide"><label>Bibliotheekmodule (tekening + aansluitklemmen)</label>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      <select class="me-bib" style="flex:1 1 220px;min-width:0;"></select>
      <button type="button" class="btn small ghost me-bib-open">🔌 Bibliotheek</button>
      <button type="button" class="btn small ghost me-ontwerp" title="tekening en aansluitklemmen van deze module aanpassen (Uitvoeringsplan)">✏️ Tekening &amp; klemmen</button>
    </div>
    <div class="hint" style="margin-top:4px;">Kies het exacte toestel: het Uitvoeringsplan gebruikt dan zijn technische tekening en klemmen. Niet gevonden? Voeg het toe via 🔌 Bibliotheek (de AI leest de tekening voor je).</div>
  </div>`;
  return h;
}
function wireBibEditorVelden(box, m, rebuildAll){
  const c = box.querySelector(".me-curve"); if(c) c.addEventListener("change", e=>{ m.curve = e.target.value; save(); });
  const k = box.querySelector(".me-ka"); if(k) k.addEventListener("change", e=>{ m.kA = e.target.value; save(); });
  const d = box.querySelector(".me-difftype"); if(d) d.addEventListener("change", e=>{ m.diffType = e.target.value; save(); });
  const sel = box.querySelector(".me-bib");
  if(sel){
    fillBibSelect(sel, m);
    sel.addEventListener("change", e=>{
      const id = e.target.value;
      if(!id){ delete m.bibId; delete m.bib; save(); rebuildAll(); return; }
      const row = moduleBib.find(r=> String(r.id)===id);
      if(row){ applyBibOpModule(m, row); save(); rebuildAll(); toast("Gekoppeld aan "+row.naam); }
    });
  }
  const ow = box.querySelector(".me-ontwerp");
  if(ow) ow.addEventListener("click", ()=> openModuleOntwerperVoorModule(m, ()=> rebuildAll()));
  const ob = box.querySelector(".me-bib-open");
  if(ob) ob.addEventListener("click", ()=> openModuleBibliotheek({
    preset: moduleNaarBibPreset(m),
    kies: (row)=>{ applyBibOpModule(m, row); save(); rebuildAll(); toast("Gekoppeld aan "+row.naam); }
  }));
}
// "Uit bibliotheek…" bij een net aangemaakte module (staging) in de Layout.
function bibStagingHtml(){
  return `<span class="sq-bib-wrap"><select class="sq-bib" title="Kies een module uit de bibliotheek — vult soort, polen, A, curve en kA in"><option value="">🔌 Uit bibliotheek…</option></select></span>`;
}
function wireBibStaging(box, item, rebuildAll){
  const sel = box.querySelector(".sq-bib");
  if(!sel) return;
  const vul = ()=>{
    const perCat = {};
    moduleBib.forEach(r=>{ (perCat[r.categorie] = perCat[r.categorie] || []).push(r); });
    sel.innerHTML = `<option value="">🔌 Uit bibliotheek…</option>` + Object.keys(perCat).map(cat=>
      `<optgroup label="${escapeHtml(MODULE_CATEGORIEEN[cat] ? MODULE_CATEGORIEEN[cat].label : cat)}">${
        perCat[cat].sort((a,b)=> bibMatchScore(b,item)-bibMatchScore(a,item)).map(r=>`<option value="${r.id}">${escapeHtml(r.naam)}</option>`).join("")
      }</optgroup>`).join("") + `<option value="__nieuw">＋ Nieuwe module in bibliotheek…</option>`;
  };
  if(moduleBibGeladen) vul(); else laadModuleBib().then(vul).catch(()=>{});
  sel.addEventListener("change", e=>{
    const id = e.target.value;
    if(!id) return;
    if(id==="__nieuw"){
      sel.value = "";
      openModuleBibliotheek({ preset: moduleNaarBibPreset(item), nieuw: true, kies: (row)=>{ applyBibOpModule(item, row); save(); rebuildAll(); } });
      return;
    }
    const row = moduleBib.find(r=> String(r.id)===id);
    if(row){ applyBibOpModule(item, row); save(); rebuildAll(); }
  });
}

/* =========================================================================
   TAB: Uitvoeringsplan
   ========================================================================= */
const UV = { MW: 38, MH: 150, G: 96, PADX: 64 };
let uvView = "bedrading";         // "bedrading" | "eendraad"
let uvZoom = 1;
let uvKleur = "Bruin", uvSectie = "2.5", uvKleurAuto = true;
let uvPending = null;             // {m, k}: startklem van een nieuwe draad
let uvSelWire = null, uvSelMod = null, uvSelKam = null;
let uvKamType = "1P+N", uvKamModus = false;
let uvLaatsteOmzet = null;        // rapport van de laatste automatische omzetting (per kast-id)

function uvChannelY(c){ return c*(UV.MH+UV.G) + UV.G/2; }
function uvKlemKey(mid, kid){ return mid+"|"+kid; }
function uvAlleModules(kast){ const f = []; kast.rijen.forEach(r=> r.items.forEach(m=> f.push(m))); return f; }

// Houdt de kopie van de bibliotheekgegevens (tekening/klemmen) in het project
// gelijk met de bibliotheek zelf, en ruimt draden op die naar een niet meer
// bestaande module of klem verwijzen (bv. na verwijderen of polen wijzigen).
function uvSyncEnOpruimen(kast){
  if(!Array.isArray(kast.bedrading)) kast.bedrading = [];
  let gewijzigd = false;
  const mods = uvAlleModules(kast);
  if(moduleBibGeladen){
    mods.forEach(m=>{
      if(!m.bibId) return;
      const row = moduleBib.find(r=> String(r.id)===String(m.bibId));
      if(!row) return;
      const snap = bibSnapshot(row);
      if(JSON.stringify(snap) !== JSON.stringify(m.bib||null)){ m.bib = snap; gewijzigd = true; }
    });
  }
  // Draden naar verdwenen klemmen pas opruimen als de (aangepaste) standaardmodules geladen zijn,
  // anders zouden draden naar klemmen die enkel in een standaardmodule bestaan onterecht verdwijnen.
  if(cadosInstGeladen){
    const bestaand = new Set();
    mods.forEach(m=> klemmenVoorModule(m).forEach(k=> bestaand.add(uvKlemKey(m.id, k.id))));
    const voor = kast.bedrading.length;
    kast.bedrading = kast.bedrading.filter(w=> w && w.a && w.b && bestaand.has(uvKlemKey(w.a.m, w.a.k)) && bestaand.has(uvKlemKey(w.b.m, w.b.k)));
    if(kast.bedrading.length !== voor) gewijzigd = true;
  }
  // Kamgeleiders: enkel modules die nog in dezelfde rij staan blijven erop; een lege kam verdwijnt.
  if(!Array.isArray(kast.kamgeleiders)) kast.kamgeleiders = [];
  const rijVan = {};
  kast.rijen.forEach(r=> r.items.forEach(m=>{ rijVan[m.id] = r.id; }));
  kast.kamgeleiders.forEach(k=>{
    const n = (k.moduleIds||[]).length;
    k.moduleIds = (k.moduleIds||[]).filter(id=> rijVan[id]===k.rijId);
    if(k.moduleIds.length !== n) gewijzigd = true;
  });
  const nk = kast.kamgeleiders.length;
  kast.kamgeleiders = kast.kamgeleiders.filter(k=> k.moduleIds.length > 0);
  if(kast.kamgeleiders.length !== nk) gewijzigd = true;
  if(gewijzigd) save();
}

function uvGeometrie(kast){
  const codes = computeZekeringCodes();
  const mods = [];
  const klemPos = {};
  kast.rijen.forEach((rij, ri)=>{
    const y = UV.G + ri*(UV.MH+UV.G);
    let slot = 0;
    rij.items.forEach(m=>{
      const b = moduleBreedte(m);
      const x = UV.PADX + slot*UV.MW;
      slot += b;
      if(b===0) return;
      mods.push({m, x, y, w: b*UV.MW, h: UV.MH, ri, rijId: rij.id, slot: slot - b, code: codes[m.id]||""});
      if(m.categorie==="Leeg") return;
      klemmenVoorModule(m).forEach(k=>{
        klemPos[uvKlemKey(m.id, k.id)] = {
          x: x + (parseFloat(k.x)||0)*b*UV.MW, y: y + (parseFloat(k.y)||0)*UV.MH,
          zijde: zijdeVanKlem(k), ri, k, m, code: codes[m.id]||""
        };
      });
    });
  });
  const width = UV.PADX*2 + kast.maat*UV.MW;
  const height = UV.G + kast.rijen.length*(UV.MH+UV.G);
  return {mods, klemPos, width, height, codes};
}

// Orthogonale routering: uit de klem naar de bedradingsgoot boven/onder de
// rij, horizontaal, en zo naar de andere klem. Liggen de twee klemmen aan
// een verschillende goot, dan via de zijgoot links of rechts van de kast.
// Elke draad krijgt een eigen "baan" in de goot zodat ze niet samenvallen.
function uvRoutes(kast, geo){
  const baan = {};
  const zij = {L:0, R:0};
  // Banen iets onder het midden van de goot, zodat ze vrij blijven van de kamgeleiders vlak onder de modules.
  const neemBaan = (c)=>{ baan[c] = (baan[c]||0) + 1; const n = baan[c]-1; return ((n % 6) - 2) * 7 + 6; };
  return kast.bedrading.map(w=>{
    const A = geo.klemPos[uvKlemKey(w.a.m, w.a.k)], B = geo.klemPos[uvKlemKey(w.b.m, w.b.k)];
    if(!A || !B) return null;
    const ca = A.zijde==="boven" ? A.ri : A.ri+1;
    const cb = B.zijde==="boven" ? B.ri : B.ri+1;
    if(ca===cb){
      const yc = uvChannelY(ca) + neemBaan(ca);
      return {w, A, B, d:`M${A.x} ${A.y} V${yc} H${B.x} V${B.y}`};
    }
    const ya = uvChannelY(ca) + neemBaan(ca), yb = uvChannelY(cb) + neemBaan(cb);
    const links = (A.x + B.x)/2 < geo.width/2;
    const n = links ? zij.L++ : zij.R++;
    const xs = links ? (UV.PADX - 16 - (n % 5)*8) : (geo.width - UV.PADX + 16 + (n % 5)*8);
    return {w, A, B, d:`M${A.x} ${A.y} V${ya} H${xs} V${yb} H${B.x} V${B.y}`};
  }).filter(Boolean);
}

function chipTitel(m, code){
  const cat = m.categorie || "Overig";
  if(cat==="Leeg") return "";
  const label = MODULE_CATEGORIEEN[cat] ? MODULE_CATEGORIEEN[cat].label : cat;
  const kop = [code, m.naam].filter(Boolean).join(" — ") || label;
  const spec = [chipSpecText(m), m.curve ? "curve "+m.curve : "", m.kA ? m.kA+" kA" : "", m.diffType ? "type "+m.diffType : ""].filter(Boolean).join(" · ");
  return [kop, [label, spec].filter(Boolean).join(": "), m.type, m.kabelType ? "kabel "+m.kabelType : ""].filter(Boolean).join("\n");
}
function uvModuleSvg(md){
  const {m, x, y, w, h, code} = md;
  const cat = m.categorie || "Overig";
  if(cat==="Leeg") return `<rect x="${x+2}" y="${y+2}" width="${w-4}" height="${h-4}" rx="3" class="uv-leeg"/>`;
  const sel = uvSelMod===m.id ? " sel" : "";
  const wg = weergaveVoorModule(m);
  let s = `<g class="uv-mod${sel}" data-mod="${m.id}" data-tip="${escapeHtml(chipTitel(m, code))}">`;
  const url = m.bib && m.bib.tekening_url;
  if(url && wg.foto !== false){
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>`;
    s += `<image href="${escapeHtml(url)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="uv-mod-rand"/>`;
  } else {
    s += `<g transform="translate(${x} ${y})">${moduleVectorSvg(m, w, h, wg)}</g>`;
  }
  if(cat==="Rijgklemmenmodule" && (m.rijgklemKlemIds||[]).length){
    const pos = rijgklemPositie(m);
    const yP = pos==="boven" ? y+34 : y+h-28, yK = pos==="boven" ? y+h-28 : y+34;
    s += `<text x="${x+w/2}" y="${yP}" class="uv-rk-zijde preflex">Preflex ${pos==="boven" ? "↑" : "↓"}</text>`;
    s += `<text x="${x+w/2}" y="${yK}" class="uv-rk-zijde">kast ${pos==="boven" ? "↓" : "↑"}</text>`;
  }
  s += `<rect x="${x+w/2-16}" y="${y+h/2-10}" width="32" height="18" rx="4" class="uv-code-bg"/>`;
  s += `<text x="${x+w/2}" y="${y+h/2+3.5}" class="uv-code">${escapeHtml(code || CAT_ABBR[cat] || "")}</text>`;
  s += `</g>`;
  return s;
}

function uvWireSvg(r, interactief){
  const w = r.w;
  const kleur = DRAAD_KLEUREN[w.kleur] || DRAAD_KLEUREN.Bruin;
  const bw = draadBreedte(w.sectie);
  const sel = interactief && uvSelWire===w.id;
  const tip = r.A && r.B ? `${r.A.code||""} · ${r.A.k.label||""} → ${r.B.code||""} · ${r.B.k.label||""}\n${w.kleur||""} ${w.sectie||""} mm²${w.label?" · "+w.label:""}` : "";
  let s = `<g class="uv-draad${sel?" sel":""}" data-w="${w.id}" data-tip="${escapeHtml(tip)}">`;
  if(interactief) s += `<path d="${r.d}" class="uv-draad-hit"/>`;
  s += `<path d="${r.d}" class="uv-draad-rand" style="stroke-width:${bw+1.6}"/>`;
  s += `<path d="${r.d}" style="stroke:${kleur};stroke-width:${bw}" class="uv-draad-kern"/>`;
  if(w.kleur==="Geel/groen") s += `<path d="${r.d}" style="stroke:#f2d600;stroke-width:${bw};stroke-dasharray:7 7" class="uv-draad-kern"/>`;
  s += `</g>`;
  return s;
}

function bouwBedradingSvg(kast, interactief){
  const geo = uvGeometrie(kast);
  const routes = uvRoutes(kast, geo);
  const kammen = uvKamLayout(kast, geo);
  const verbonden = new Set();
  const opKam = new Set();
  kast.bedrading.forEach(w=>{ verbonden.add(uvKlemKey(w.a.m, w.a.k)); verbonden.add(uvKlemKey(w.b.m, w.b.k)); });
  kammen.forEach(kl=> kl.tanden.forEach(t=>{ verbonden.add(t.key); opKam.add(t.key); }));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" class="uv-svg${interactief && uvKamModus ? " kammodus" : ""}" viewBox="0 0 ${geo.width} ${geo.height}" width="${Math.round(geo.width*(interactief?uvZoom:1))}" height="${Math.round(geo.height*(interactief?uvZoom:1))}">`;
  s += `<rect x="0" y="0" width="${geo.width}" height="${geo.height}" class="uv-achtergrond"/>`;
  // bedradingsgoten
  for(let c=0; c<=kast.rijen.length; c++){
    s += `<rect x="${UV.PADX-6}" y="${uvChannelY(c)-UV.G/2+14}" width="${geo.width-2*UV.PADX+12}" height="${UV.G-28}" rx="6" class="uv-goot"/>`;
  }
  // DIN-rails + rijnummer
  kast.rijen.forEach((rij, ri)=>{
    const y = UV.G + ri*(UV.MH+UV.G);
    s += `<rect x="${UV.PADX-10}" y="${y+UV.MH/2-12}" width="${kast.maat*UV.MW+20}" height="24" class="uv-rail"/>`;
    s += `<text x="${UV.PADX-24}" y="${y+UV.MH/2+4}" class="uv-rijnr">${ri+1}</text>`;
  });
  geo.mods.forEach(md=>{ s += uvModuleSvg(md); });
  kammen.forEach(kl=>{ s += uvKamSvg(kl, interactief); });
  routes.forEach(r=>{ s += uvWireSvg(r, interactief); });
  // klemmen bovenop
  Object.entries(geo.klemPos).forEach(([key, p])=>{
    const pend = uvPending && uvKlemKey(uvPending.m, uvPending.k)===key;
    const cls = ["uv-klem", verbonden.has(key)?"bezet":"", pend?"pending":""].filter(Boolean).join(" ");
    const ly = p.zijde==="boven" ? p.y-9 : p.y+15;
    const ktip = [`${p.code || p.m.naam || p.m.categorie} · klem ${p.k.label||p.k.id} (${p.k.functie||"—"}, ${p.zijde})`, p.k.tip || "", p.m.naam || ""].filter(Boolean).join("\n");
    const kc = (aderKleurNaarDraad(p.k.kleur) && DRAAD_KLEUREN[aderKleurNaarDraad(p.k.kleur)]) || kleurHexVoorFunctie(p.k.functie || p.k.label);
    s += `<g class="${cls}" data-m="${p.m.id}" data-k="${escapeHtml(p.k.id)}" data-tip="${escapeHtml(ktip)}">`;
    if(interactief) s += `<circle cx="${p.x}" cy="${p.y}" r="11" class="uv-klem-hit"/>`;
    s += `<circle cx="${p.x}" cy="${p.y}" r="5" class="uv-klem-dot"${kc ? ` style="stroke:${kc}"` : ""}/>`;
    if(!opKam.has(key)) s += `<text x="${p.x}" y="${ly}" class="uv-klem-label">${escapeHtml(String(p.k.label||"").slice(0,6))}</text>`;
    s += `</g>`;
  });
  if(interactief) s += `<rect class="uv-kam-preview" x="0" y="0" width="0" height="0" style="display:none"/>`;
  s += `</svg>`;
  return {svg: s, geo, routes};
}

function uvKlemOmschrijving(kast, eind){
  const geo = uvGeometrie(kast);
  const p = geo.klemPos[uvKlemKey(eind.m, eind.k)];
  if(!p) return "?";
  const zijde = p.k.rijgSoort ? (p.k.rijgSoort==="kast" ? "kastzijde" : "Preflex") : p.zijde;
  return `${p.code || (p.m.naam || p.m.categorie)} · ${p.k.label||p.k.id} (${zijde})`;
}

/* ---------- Kamgeleiders ----------
   Een kamgeleider ligt ONDERAAN tegen de modules van één rij en verbindt hun
   onderste klemmen per geleider (L / N / L1-L2-L3). Je kiest het type en
   sleept over de modules: welke modules erop zitten wordt automatisch herkend
   uit de layout. Bij een 3-fasige kam krijgt een 1-polige automaat de fase van
   zijn pin-positie (L1, L2, L3, L1, ...), zoals bij een echte kam. */
const KAM_TYPES = {
  "1P":   { label: "1-polig (L)", g: ["L"] },
  "1P+N": { label: "2-polig (L+N)", g: ["L","N"] },
  "3P":   { label: "3-polig (L1-L2-L3)", g: ["L1","L2","L3"] },
  "3P+N": { label: "4-polig (L1-L2-L3-N)", g: ["L1","L2","L3","N"] },
};
function kamTypeVoorModule(m){
  const n = parseInt(m.polen)||2;
  return n>=4 ? "3P+N" : n===3 ? "3P" : n===1 ? "1P" : "1P+N";
}
function uvKamLayout(kast, geo){
  return (kast.kamgeleiders||[]).map(kam=>{
    const mds = geo.mods.filter(md=> md.rijId===kam.rijId && (kam.moduleIds||[]).includes(md.m.id) && md.m.categorie!=="Leeg");
    if(!mds.length) return null;
    const ri = mds[0].ri;
    const x0 = Math.min(...mds.map(d=> d.x)) + 3, x1 = Math.max(...mds.map(d=> d.x + d.w)) - 3;
    const yRij = UV.G + ri*(UV.MH+UV.G);
    const geleiders = (KAM_TYPES[kam.type] || KAM_TYPES["1P+N"]).g;
    const gy = {};
    geleiders.forEach((f, i)=>{ gy[f] = yRij + UV.MH + 11 + i*6; });
    const startSlot = Math.min(...mds.map(d=> d.slot));
    const tanden = [];
    mds.forEach(md=>{
      klemmenVoorModule(md.m).filter(k=> zijdeVanKlem(k)==="onder").forEach(k=>{
        const key = uvKlemKey(md.m.id, k.id);
        const p = geo.klemPos[key];
        if(!p) return;
        let f = normFunctie(k.functie || k.label);
        if(!geleiders.includes(f)){
          if((f==="L" || f==="L1") && geleiders.includes("L1")){
            const pin = Math.floor(md.slot + (parseFloat(k.x)||0)*moduleBreedte(md.m)) - startSlot;
            f = ["L1","L2","L3"][((pin % 3) + 3) % 3];
          } else if(f==="L1" && geleiders.includes("L")) f = "L";
          else return;
        }
        tanden.push({key, x: p.x, y: p.y, f, yg: gy[f], m: md.m, k});
      });
    });
    return {kam, ri, mds, x0, x1, gy, geleiders, tanden, yTop: yRij + UV.MH + 6, yBot: yRij + UV.MH + 11 + (geleiders.length-1)*6 + 5};
  }).filter(Boolean);
}
function uvKamSvg(kl, interactief){
  const sel = interactief && uvSelKam===kl.kam.id;
  let s = `<g class="uv-kam${sel ? " sel" : ""}" data-kam="${kl.kam.id}">`;
  s += `<rect x="${kl.x0-4}" y="${kl.yTop}" width="${kl.x1-kl.x0+8}" height="${kl.yBot-kl.yTop}" rx="3" class="uv-kam-bg"/>`;
  kl.tanden.forEach(t=>{ s += `<line x1="${t.x}" y1="${t.y}" x2="${t.x}" y2="${t.yg}" class="uv-kam-tand"/>`; });
  kl.geleiders.forEach(f=>{
    s += `<line x1="${kl.x0}" y1="${kl.gy[f]}" x2="${kl.x1}" y2="${kl.gy[f]}" class="uv-kam-geleider" style="stroke:${DRAAD_KLEUREN[standaardKleurVoorFunctie(f)]}"/>`;
  });
  kl.tanden.forEach(t=>{ s += `<circle cx="${t.x}" cy="${t.yg}" r="2.3" class="uv-kam-knoop"/>`; });
  s += `<text x="${kl.x0}" y="${kl.yBot+9}" class="uv-kam-label">kam ${escapeHtml(kl.kam.type)}</text>`;
  s += `</g>`;
  return s;
}
function uvKamOmschrijving(kast, kam){
  const codes = computeZekeringCodes();
  const mods = uvAlleModules(kast).filter(m=> (kam.moduleIds||[]).includes(m.id));
  const rijNr = kast.rijen.findIndex(r=> r.id===kam.rijId) + 1;
  return { type: (KAM_TYPES[kam.type]||{label:kam.type}).label, rij: rijNr, modules: mods.map(m=> codes[m.id] || CAT_ABBR[m.categorie] || m.categorie).join(", ") };
}

/* ---------- Automatische omzetting layout -> uitvoering ----------
   1. Elke module zonder bibliotheekmodule krijgt de best passende uit de
      bibliotheek (zelfde soort, polen, A, breedte; curve/kA/mA/type als die
      ingevuld zijn). De layout blijft leidend: er wordt niets verschoven.
   2. Elk differentieel krijgt een kamgeleider onderaan over zichzelf en de
      aansluitende automaten van zijn groep in dezelfde rij.
   3. Automaten van de groep die er niet aansluitend naast staan: voedingsdraad
      vanaf het differentieel (doorgelust, onderkant), of naar hun eigen kam.
   4. Hoofddifferentieel -> andere differentielen (bovenkant) en remautomaat ->
      hoofddifferentieel: voedingsdraden.
   Enkel eerdere AUTOMATISCHE voorstellen worden vervangen; wat je zelf
   tekende of aanpaste blijft staan. Alles blijft daarna gewoon aanpasbaar. */
function uvZoekBibMatch(m){
  if(!moduleBibGeladen || !moduleBib.length || !m || m.categorie==="Leeg") return null;
  const elek = ["Automaat","Differentieel","Overig"].includes(m.categorie);
  const t = String(m.type||"").toLowerCase();
  const typeHit = (r)=> !!t && [r.artikelnr, r.naam].some(v=> v && t.includes(String(v).toLowerCase()));
  const kand = moduleBib.filter(r=>{
    if(r.categorie !== m.categorie) return false;
    const rb = Number(r.breedte)||0;
    if(rb && rb !== moduleBreedte(m)) return false;
    if(elek){
      if(m.categorie !== "Overig"){
        if(!m.polen || normPolen(r.polen) !== m.polen) return false;
        if(!m.A || normA(r.stroom) !== m.A) return false;
      }
      if(m.curve && r.curve && r.curve !== m.curve) return false;
      if(m.kA && r.kortsluit && String(r.kortsluit) !== String(m.kA)) return false;
      if(m.categorie==="Differentieel"){
        if(m.mA && normMA(r.gevoeligheid) !== m.mA) return false;
        if(m.diffType && r.diff_type && r.diff_type !== m.diffType) return false;
      }
      if(m.categorie==="Overig") return typeHit(r);
      return true;
    }
    return typeHit(r);
  });
  if(!kand.length) return null;
  const score = (r)=> bibMatchScore(r, m) + (typeHit(r) ? 6 : 0);
  kand.sort((a,b)=> score(b) - score(a));
  return kand[0];
}
function uvAutoOmzet(kast){
  zekeringHuidigeKastId = kast.id;
  if(!Array.isArray(kast.bedrading)) kast.bedrading = [];
  if(!Array.isArray(kast.kamgeleiders)) kast.kamgeleiders = [];
  const codes = computeZekeringCodes();
  const flat = uvAlleModules(kast);
  const rapport = { kastId: kast.id, gekoppeld: [], alGekoppeld: 0, zonderMatch: [], kammen: 0, draden: 0 };
  // 1. bibliotheek
  flat.forEach(m=>{
    if(m.categorie==="Leeg") return;
    if(m.bibId){ rapport.alGekoppeld++; return; }
    const row = uvZoekBibMatch(m);
    if(row){ applyBibOpModule(m, row, {behoudLayout: true}); rapport.gekoppeld.push(codes[m.id] || m.naam || m.categorie); }
    else rapport.zonderMatch.push({ id: m.id, code: codes[m.id] || CAT_ABBR[m.categorie] || m.categorie });
  });
  // 2. vorige automatische voorstellen weg
  kast.bedrading = kast.bedrading.filter(w=> !w.auto);
  kast.kamgeleiders = kast.kamgeleiders.filter(k=> !k.auto);
  const kamVan = {};
  kast.kamgeleiders.forEach(k=> k.moduleIds.forEach(id=>{ kamVan[id] = k; }));
  const groupOf = determineAutomaatGroups(flat);
  const rijVan = {}, idxVan = {};
  kast.rijen.forEach(r=> r.items.forEach((m, i)=>{ rijVan[m.id] = r; idxVan[m.id] = i; }));
  const bestaat = (a, b)=> kast.bedrading.some(w=>
    (w.a.m===a.m && w.a.k===a.k && w.b.m===b.m && w.b.k===b.k) || (w.a.m===b.m && w.a.k===b.k && w.b.m===a.m && w.b.k===a.k));
  const zoekKlem = (klemmen, f)=>{
    let k = klemmen.find(x=> normFunctie(x.functie || x.label)===f);
    if(!k && f==="L") k = klemmen.find(x=> normFunctie(x.functie || x.label)==="L1");
    if(!k && f==="L1") k = klemmen.find(x=> normFunctie(x.functie || x.label)==="L");
    return k;
  };
  // per functie (L/N/L1..) van bron.zijdeA naar doel.zijdeB
  const verbind = (bron, zijdeA, doel, zijdeB, sectie, label)=>{
    klemmenVoorModule(bron).filter(k=> zijdeVanKlem(k)===zijdeA).forEach(b=>{
      const f = normFunctie(b.functie || b.label);
      if(!["L","L1","L2","L3","N"].includes(f)) return;
      const d = zoekKlem(klemmenVoorModule(doel).filter(k=> zijdeVanKlem(k)===zijdeB), f);
      if(!d) return;
      const a = {m: bron.id, k: b.id}, z = {m: doel.id, k: d.id};
      if(bestaat(a, z)) return;
      kast.bedrading.push({id: cryptoId(), a, b: z, kleur: standaardKleurVoorFunctie(f), sectie, label, auto: true});
      rapport.draden++;
    });
  };
  const hoofd = flat.find(m=> m.categorie==="Differentieel" && m.isHoofd) || null;
  flat.filter(d=> d.categorie==="Differentieel").forEach(d=>{
    const leden = flat.filter(a=> a.categorie==="Automaat" && !a.isRem && groupOf[a.id]===d);
    if(!leden.length) return;
    const lidSet = new Set(leden.map(a=> a.id));
    const rij = rijVan[d.id], items = rij.items;
    // aaneengesloten blok rond het differentieel (scheidingstekens van 0 breed mogen ertussen)
    const hoort = (m)=> lidSet.has(m.id) || (m.categorie==="Leeg" && moduleBreedte(m)===0);
    let i0 = idxVan[d.id], i1 = idxVan[d.id];
    while(i1+1 < items.length && hoort(items[i1+1])) i1++;
    while(i0-1 >= 0 && hoort(items[i0-1])) i0--;
    const blok = items.slice(i0, i1+1).filter(m=> m.categorie!=="Leeg" && !kamVan[m.id]);
    let opKam = [];
    if(!kamVan[d.id] && blok.length >= 2 && blok.includes(d)){
      const kam = {id: cryptoId(), rijId: rij.id, type: kamTypeVoorModule(d), moduleIds: blok.map(m=> m.id), auto: true};
      kast.kamgeleiders.push(kam);
      blok.forEach(m=>{ kamVan[m.id] = kam; });
      opKam = blok;
      rapport.kammen++;
    }
    const gevoed = new Set();
    let vorige = d;
    leden.forEach(a=>{
      if(opKam.includes(a)) return;
      const k = kamVan[a.id];
      if(k){
        // staat op een (zelf getekende) kam zonder dit differentieel: 1x de kam voeden
        if(kamVan[d.id]===k || gevoed.has(k.id)) return;
        gevoed.add(k.id);
        const eerste = flat.find(m=> m.id===k.moduleIds[0]);
        if(eerste) verbind(d, "onder", eerste, "onder", "10", "voeding kam");
        return;
      }
      verbind(vorige, "onder", a, "onder", "10", vorige===d ? "voeding" : "doorlus");
      vorige = a;
    });
  });
  if(hoofd){
    flat.forEach(m=>{ if(m.categorie==="Differentieel" && m!==hoofd) verbind(hoofd, "onder", m, "boven", "10", "voeding diff."); });
    const rems = flat.filter(m=> m.categorie==="Automaat" && m.isRem);
    if(rems.length) verbind(rems[rems.length-1], "onder", hoofd, "boven", "16", "hoofdvoeding");
  }
  uvLaatsteOmzet = rapport;
  return rapport;
}

/* ---------- Eendraadschema (afgeleid uit de layout) ---------- */
function eendraadStructuur(kast){
  zekeringHuidigeKastId = kast.id;
  const flat = uvAlleModules(kast);
  const groupOf = determineAutomaatGroups(flat);
  const hoofd = flat.find(m=> m.categorie==="Differentieel" && m.isHoofd) || null;
  const rems = flat.filter(m=> m.categorie==="Automaat" && m.isRem);
  const autos = flat.filter(m=> m.categorie==="Automaat" && !m.isRem);
  const kinderen = [];
  flat.forEach(m=>{
    if(m.categorie==="Differentieel" && m!==hoofd) kinderen.push({type:"diff", m, autos: autos.filter(a=> groupOf[a.id]===m)});
    else if(m.categorie==="Automaat" && !m.isRem && (!groupOf[m.id] || groupOf[m.id]===hoofd)) kinderen.push({type:"auto", m});
  });
  return {hoofd, rems, kinderen};
}
function edSpec(m){
  const a = (m.A||"").replace(/A$/i, "");
  return [ (m.curve||"") + (a ? a+"A" : ""), m.polen||"", m.kA ? m.kA+"kA" : "" ].filter(Boolean).join(" ");
}
function edPoolstreepjes(x, y, polen){
  const n = Math.max(1, parseInt(polen)||1);
  let s = "";
  for(let i=0;i<n;i++){ const yy = y + i*5; s += `<line x1="${x-5}" y1="${yy+3}" x2="${x+5}" y2="${yy-3}" class="ed-lijn"/>`; }
  return s;
}
function edAutomaatSymbool(x, y){ // 46 hoog
  return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y+12}" class="ed-lijn"/>
    <path d="M${x-4} ${y+8} l8 8 M${x+4} ${y+8} l-8 8" class="ed-lijn"/>
    <line x1="${x}" y1="${y+40}" x2="${x+12}" y2="${y+14}" class="ed-lijn"/>
    <line x1="${x}" y1="${y+40}" x2="${x}" y2="${y+46}" class="ed-lijn"/>`;
}
function edDiffSymbool(x, y){ // 46 hoog
  return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y+12}" class="ed-lijn"/>
    <line x1="${x}" y1="${y+40}" x2="${x+12}" y2="${y+14}" class="ed-lijn"/>
    <line x1="${x}" y1="${y+40}" x2="${x}" y2="${y+46}" class="ed-lijn"/>
    <rect x="${x-9}" y="${y+18}" width="18" height="16" rx="2" class="ed-diffbox"/>
    <text x="${x}" y="${y+30}" class="ed-delta">ΔI</text>`;
}
function bouwEendraadSvg(kast){
  const codes = computeZekeringCodes();
  const {hoofd, rems, kinderen} = eendraadStructuur(kast);
  const CW = 58, X0 = 190, NETX = 70;
  let cols = 0;
  const plaats = kinderen.map(k=>{
    const span = k.type==="diff" ? Math.max(1, k.autos.length) : 1;
    const start = cols; cols += span;
    return Object.assign({start, span}, k);
  });
  cols = Math.max(cols, 1);
  const BUSY = 70 + rems.length*70 + (hoofd ? 80 : 0) + 30;
  const DIFFY = BUSY + 26, SUBY = DIFFY + 70, AUTOY = SUBY + 26, TEKSTY = AUTOY + 92;
  const width = Math.max(X0 + cols*CW + 60, 520);
  const height = TEKSTY + 210;
  const colX = (c)=> X0 + c*CW + CW/2;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" class="ed-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;
  s += `<rect x="0" y="0" width="${width}" height="${height}" class="uv-achtergrond"/>`;
  // net + kWh
  s += `<text x="${NETX}" y="22" class="ed-tekst b" text-anchor="middle">Net</text>`;
  s += `<line x1="${NETX}" y1="28" x2="${NETX}" y2="40" class="ed-lijn"/>`;
  s += `<rect x="${NETX-17}" y="40" width="34" height="22" rx="3" class="ed-diffbox"/><text x="${NETX}" y="55" class="ed-delta">kWh</text>`;
  let y = 62;
  rems.forEach(r=>{
    s += `<line x1="${NETX}" y1="${y}" x2="${NETX}" y2="${y+12}" class="ed-lijn"/>`;
    s += edAutomaatSymbool(NETX, y+12);
    s += `<text x="${NETX+18}" y="${y+34}" class="ed-tekst b">${escapeHtml(codes[r.id]||"R")}</text><text x="${NETX+18}" y="${y+46}" class="ed-tekst">${escapeHtml(edSpec(r))}</text>`;
    s += `<line x1="${NETX}" y1="${y+58}" x2="${NETX}" y2="${y+70}" class="ed-lijn"/>`;
    y += 70;
  });
  if(hoofd){
    s += `<line x1="${NETX}" y1="${y}" x2="${NETX}" y2="${y+14}" class="ed-lijn"/>`;
    s += edDiffSymbool(NETX, y+14);
    s += `<line x1="${NETX}" y1="${y+60}" x2="${NETX}" y2="${y+80}" class="ed-lijn"/>`;
    s += `<text x="${NETX+18}" y="${y+34}" class="ed-tekst b">${escapeHtml(codes[hoofd.id]||"A")} hoofddiff.</text><text x="${NETX+18}" y="${y+46}" class="ed-tekst">${escapeHtml([hoofd.A, hoofd.polen, hoofd.mA, hoofd.diffType?("type "+hoofd.diffType):""].filter(Boolean).join(" "))}</text>`;
    y += 80;
  }
  s += `<line x1="${NETX}" y1="${y}" x2="${NETX}" y2="${BUSY}" class="ed-lijn"/>`;
  // hoofdrail
  s += `<line x1="${NETX}" y1="${BUSY}" x2="${X0 + cols*CW}" y2="${BUSY}" class="ed-lijn dik"/>`;
  const autoTak = (m, x, vanY)=>{
    let t = `<line x1="${x}" y1="${vanY}" x2="${x}" y2="${AUTOY}" class="ed-lijn"/>`;
    t += edAutomaatSymbool(x, AUTOY);
    t += `<text x="${x+14}" y="${AUTOY+30}" class="ed-tekst b">${escapeHtml(codes[m.id]||"")}</text>`;
    t += `<line x1="${x}" y1="${AUTOY+46}" x2="${x}" y2="${TEKSTY-6}" class="ed-lijn"/>`;
    t += edPoolstreepjes(x, AUTOY+60, m.polen);
    t += `<circle cx="${x}" cy="${TEKSTY-3}" r="3" class="ed-eind"/>`;
    const tekst = [edSpec(m), m.kabelType||"", m.naam||""].filter(Boolean).join("  ·  ");
    t += `<text transform="translate(${x-4} ${TEKSTY+4}) rotate(90)" class="ed-tekst">${escapeHtml(tekst.slice(0, 48))}</text>`;
    return t;
  };
  plaats.forEach(k=>{
    if(k.type==="auto"){
      s += autoTak(k.m, colX(k.start), BUSY);
    } else {
      const xd = X0 + (k.start + k.span/2)*CW;
      s += `<line x1="${xd}" y1="${BUSY}" x2="${xd}" y2="${DIFFY}" class="ed-lijn"/>`;
      s += edDiffSymbool(xd, DIFFY);
      s += `<text x="${xd+14}" y="${DIFFY+22}" class="ed-tekst b">${escapeHtml(codes[k.m.id]||"")}</text><text x="${xd+14}" y="${DIFFY+34}" class="ed-tekst">${escapeHtml([k.m.A, k.m.mA, k.m.diffType?("type "+k.m.diffType):""].filter(Boolean).join(" "))}</text>`;
      s += `<line x1="${xd}" y1="${DIFFY+46}" x2="${xd}" y2="${SUBY}" class="ed-lijn"/>`;
      if(k.autos.length){
        s += `<line x1="${colX(k.start)}" y1="${SUBY}" x2="${colX(k.start+k.span-1)}" y2="${SUBY}" class="ed-lijn dik"/>`;
        k.autos.forEach((a, i)=>{ s += autoTak(a, colX(k.start+i), SUBY); });
      } else {
        s += `<text x="${xd}" y="${SUBY+16}" class="ed-tekst dim" text-anchor="middle">(geen automaten)</text>`;
      }
    }
  });
  if(!kinderen.length) s += `<text x="${X0}" y="${BUSY+30}" class="ed-tekst dim">Nog geen differentielen of automaten in de layout van deze kast.</text>`;
  const proj = (state.instellingen && state.instellingen.project) || "";
  s += `<text x="${width-12}" y="${height-26}" class="ed-tekst b" text-anchor="end">${escapeHtml(proj)} — ${escapeHtml(kast.naam)}</text>`;
  s += `<text x="${width-12}" y="${height-12}" class="ed-tekst dim" text-anchor="end">Eendraadschema afgeleid uit de layout · ${new Date().toLocaleDateString("nl-BE")} · nakijken vóór keuring</text>`;
  s += `</svg>`;
  return s;
}

function renderUitvoeringsplan(){
  const kast = huidigeZekeringKast();
  uvSyncEnOpruimen(kast);
  const wrap = el(`<div class="panel" id="panel-uitvoering">
    ${panelHeadHtml(
      "Zekeringkast — uitvoeringsplan",
      "De bedrading van de kast: echte tekening per module, klemmen als snappunten en draden ertussen — plus het eendraadschema.",
      `De opbouw (welke module waar) komt uit de Layout op het tabblad "Zekeringen" — die pas je daar aan; hier teken je de uitvoering.
      Draad trekken: tik een aansluitklem aan, daarna een tweede klem. Kleur en doorsnede kies je in de balk (of laat de kleur automatisch volgen uit de klem: L bruin, N blauw, PE geel/groen…).
      Tik een draad aan om hem aan te passen of te verwijderen; tik een module aan om er een bibliotheekmodule (echte tekening + klemmen) aan te koppelen.
      Kamgeleider: kies het type (2-polig, 4-polig…), tik "Kamgeleider trekken" en sleep onderaan over de modules die verbonden moeten worden — welke modules erop zitten wordt automatisch herkend.
      "Automatisch omzetten" maakt in één keer een voorstel vanuit de layout: bibliotheekmodules koppelen, een kamgeleider per differentieel met zijn automaten en de voedingsdraden. Alles blijft aanpasbaar; opnieuw omzetten vervangt enkel de automatische voorstellen, niet wat je zelf tekende.
      Het eendraadschema wordt volledig afgeleid uit de layout (groepen, hoofddifferentieel, remautomaat, specs, kabeltype en benoeming).`
    )}
    <div class="toolbar-card" style="margin-bottom:12px;"><div class="toolbar-row" id="uvKastbar" style="flex-wrap:wrap;"></div></div>
    <div class="toolbar-card uv-toolbar" style="margin-bottom:12px;">
      <div class="uv-seg">
        <button class="btn small ${uvView==="bedrading"?"primary":"ghost"}" data-view="bedrading">Bedrading</button>
        <button class="btn small ${uvView==="eendraad"?"primary":"ghost"}" data-view="eendraad">Eendraadschema</button>
      </div>
      <div class="uv-tools" style="${uvView==="bedrading"?"":"display:none;"}">
        <button class="btn small primary uv-omzet" title="voorstel maken vanuit de layout: bibliotheek, kamgeleiders en voedingsdraden">⚡ Automatisch omzetten</button>
      </div>
      <div class="uv-tools" style="${uvView==="bedrading"?"":"display:none;"}">
        <select class="uv-kamtype" title="type kamgeleider">${Object.entries(KAM_TYPES).map(([k,v])=>`<option value="${k}" ${k===uvKamType?"selected":""}>Kam ${v.label}</option>`).join("")}</select>
        <button class="btn small ${uvKamModus?"primary":"ghost"} uv-kammodus" title="sleep daarna onderaan over de modules die verbonden moeten worden">${uvKamModus ? "✓ Sleep over de modules…" : "▭ Kamgeleider trekken"}</button>
      </div>
      <div class="uv-tools" style="${uvView==="bedrading"?"":"display:none;"}">
        <label class="uv-chk"><input type="checkbox" class="uv-kleurauto" ${uvKleurAuto?"checked":""}> kleur volgens klem</label>
        <select class="uv-kleur" ${uvKleurAuto?"disabled":""} title="draadkleur">${Object.keys(DRAAD_KLEUREN).map(k=>`<option ${k===uvKleur?"selected":""}>${k}</option>`).join("")}</select>
        <select class="uv-sectie" title="doorsnede">${DRAAD_SECTIES.map(v=>`<option value="${v}" ${v===uvSectie?"selected":""}>${v} mm²</option>`).join("")}</select>
        <button class="btn small ghost uv-wis" title="alle draden en kamgeleiders van deze kast wissen">Alles wissen</button>
      </div>
      <div class="uv-tools">
        <button class="btn small ghost uv-zoom-uit" title="uitzoomen">−</button>
        <span class="uv-zoomval">${Math.round(uvZoom*100)}%</span>
        <button class="btn small ghost uv-zoom-in" title="inzoomen">+</button>
        <button class="btn small ghost uv-bib">🔌 Modulebibliotheek</button>
        <button class="btn small uv-export">Exporteer (PDF)</button>
      </div>
    </div>
    <div id="uvBanner"></div>
    <div class="uv-layout">
      <div class="uv-canvas-wrap" id="uvCanvas"></div>
      <div class="uv-side" id="uvSide"></div>
    </div>
    <div id="uvLijst"></div>
  </div>`);
  wireHintToggle(wrap);

  const kastbar = wrap.querySelector("#uvKastbar");
  state.zekeringen.kasten.forEach(k=>{
    const btn = el(`<button class="btn small ${k.id===kast.id?'primary':'ghost'}">${escapeHtml(k.naam)}</button>`);
    btn.addEventListener("click", ()=>{ zekeringHuidigeKastId = k.id; uvPending = null; uvSelWire = null; uvSelMod = null; selectTab("uitvoering"); });
    kastbar.appendChild(btn);
  });
  kastbar.appendChild(el(`<span class="hint" style="margin-left:6px;">Layout aanpassen? → tabblad <a href="#" class="uv-naar-layout">Zekeringen</a></span>`));
  kastbar.querySelector(".uv-naar-layout").addEventListener("click", e=>{ e.preventDefault(); selectTab("zekeringen"); });

  const canvas = wrap.querySelector("#uvCanvas");
  const side = wrap.querySelector("#uvSide");
  const banner = wrap.querySelector("#uvBanner");
  const lijst = wrap.querySelector("#uvLijst");
  const heeftModules = uvAlleModules(kast).some(m=> m.categorie!=="Leeg");

  function teken(){
    if(!heeftModules){
      canvas.innerHTML = `<div class="uv-leeg-melding">Deze kast heeft nog geen modules. Bouw eerst de layout op het tabblad <strong>Zekeringen</strong>.</div>`;
      side.innerHTML = ""; lijst.innerHTML = ""; banner.innerHTML = "";
      return;
    }
    const scrollL = canvas.scrollLeft, scrollT = canvas.scrollTop;
    if(uvView==="eendraad"){
      canvas.innerHTML = bouwEendraadSvg(kast);
      const svg = canvas.querySelector("svg");
      if(svg){ svg.setAttribute("width", Math.round(svg.viewBox.baseVal.width*uvZoom)); svg.setAttribute("height", Math.round(svg.viewBox.baseVal.height*uvZoom)); }
      side.innerHTML = `<div class="card"><div class="card-body uv-sidebody"><strong>Eendraadschema</strong>
        <p class="hint">Automatisch afgeleid uit de layout van deze kast: net → remautomaat → hoofddifferentieel → differentielen met hun groep automaten.
        Per kring: code, curve/A/polen/kA, kabeltype (indien ingevuld bij "Voedingskabel komt op klemmen") en benoeming.</p>
        <p class="hint">Iets niet juist? Pas het aan in de <a href="#" class="uv-naar-layout2">Layout</a> (benoeming, specs, groep) — het schema volgt vanzelf.</p></div></div>`;
      side.querySelector(".uv-naar-layout2").addEventListener("click", e=>{ e.preventDefault(); selectTab("zekeringen"); });
      banner.innerHTML = ""; lijst.innerHTML = "";
      return;
    }
    const res = bouwBedradingSvg(kast, true);
    canvas.innerHTML = res.svg;
    canvas.scrollLeft = scrollL; canvas.scrollTop = scrollT;
    tekenBanner(); tekenSide(); tekenLijst();
  }
  function tekenBanner(){
    banner.innerHTML = "";
    if(uvKamModus){
      const b = el(`<div class="move-banner">▭ Kamgeleider <strong>${escapeHtml((KAM_TYPES[uvKamType]||{}).label||uvKamType)}</strong>: sleep onderaan over de modules die verbonden moeten worden. <button class="btn small ghost">Annuleren</button></div>`);
      b.querySelector("button").addEventListener("click", ()=>{ uvKamModus = false; selectTab("uitvoering"); });
      banner.appendChild(b);
      return;
    }
    if(!uvPending && !kast.bedrading.length && !(kast.kamgeleiders||[]).length){
      const b = el(`<div class="move-banner uv-omzet-banner">Nog geen uitvoering voor deze kast. Maak in één keer een voorstel vanuit de layout — daarna pas je alles vrij aan.
        <button class="btn small primary">⚡ Automatisch omzetten</button></div>`);
      b.querySelector("button").addEventListener("click", doeOmzet);
      banner.appendChild(b);
      return;
    }
    if(uvPending){
      const b = el(`<div class="move-banner">🔌 Startklem: <strong>${escapeHtml(uvKlemOmschrijving(kast, uvPending))}</strong> — tik nu de eindklem aan. <button class="btn small ghost">Annuleren</button></div>`);
      b.querySelector("button").addEventListener("click", ()=>{ uvPending = null; teken(); });
      banner.appendChild(b);
    }
  }
  function tekenSide(){
    side.innerHTML = "";
    const w = uvSelWire && kast.bedrading.find(x=> x.id===uvSelWire);
    const md = uvSelMod && uvAlleModules(kast).find(x=> x.id===uvSelMod);
    const kam = uvSelKam && (kast.kamgeleiders||[]).find(x=> x.id===uvSelKam);
    if(kam){
      const om = uvKamOmschrijving(kast, kam);
      const codes = computeZekeringCodes();
      const box = el(`<div class="card"><div class="card-body uv-sidebody">
        <strong>Kamgeleider</strong>
        <div class="hint">Rij ${om.rij}${kam.auto ? " · <em>automatisch voorstel</em>" : ""}</div>
        <div class="field"><label>Type</label><select class="sk-type">${Object.entries(KAM_TYPES).map(([k,v])=>`<option value="${k}" ${k===kam.type?"selected":""}>${v.label}</option>`).join("")}</select></div>
        <div class="field"><label>Verbonden modules</label><div class="uv-kam-chips"></div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn small ghost sk-opnieuw">Opnieuw trekken</button>
          <button class="btn small ghost sk-del">Kam verwijderen</button>
          <button class="btn small ghost sk-sluit">Sluiten</button>
        </div>
      </div></div>`);
      const chips = box.querySelector(".uv-kam-chips");
      uvAlleModules(kast).filter(m=> kam.moduleIds.includes(m.id)).forEach(m=>{
        const c = el(`<span class="uv-chip">${escapeHtml(codes[m.id] || CAT_ABBR[m.categorie] || m.categorie)} <button title="van de kam halen">✕</button></span>`);
        c.querySelector("button").addEventListener("click", ()=>{ kam.moduleIds = kam.moduleIds.filter(id=> id!==m.id); kam.auto = false; if(!kam.moduleIds.length){ kast.kamgeleiders = kast.kamgeleiders.filter(x=> x!==kam); uvSelKam = null; } save(); teken(); });
        chips.appendChild(c);
      });
      box.querySelector(".sk-type").addEventListener("change", e=>{ kam.type = e.target.value; kam.auto = false; save(); teken(); });
      box.querySelector(".sk-opnieuw").addEventListener("click", ()=>{ uvKamType = kam.type; kast.kamgeleiders = kast.kamgeleiders.filter(x=> x!==kam); uvSelKam = null; uvKamModus = true; save(); selectTab("uitvoering"); });
      box.querySelector(".sk-del").addEventListener("click", ()=>{ kast.kamgeleiders = kast.kamgeleiders.filter(x=> x!==kam); uvSelKam = null; save(); teken(); });
      box.querySelector(".sk-sluit").addEventListener("click", ()=>{ uvSelKam = null; teken(); });
      side.appendChild(box);
      return;
    }
    if(w){
      const box = el(`<div class="card"><div class="card-body uv-sidebody">
        <strong>Draad</strong>
        <div class="hint">${escapeHtml(uvKlemOmschrijving(kast, w.a))}<br>→ ${escapeHtml(uvKlemOmschrijving(kast, w.b))}${w.auto?"<br><em>(automatisch voorstel)</em>":""}</div>
        <div class="field"><label>Kleur</label><select class="sw-kleur">${Object.keys(DRAAD_KLEUREN).map(k=>`<option ${k===w.kleur?"selected":""}>${k}</option>`).join("")}</select></div>
        <div class="field"><label>Doorsnede</label><select class="sw-sectie">${DRAAD_SECTIES.map(v=>`<option value="${v}" ${v===String(w.sectie)?"selected":""}>${v} mm²</option>`).join("")}</select></div>
        <div class="field"><label>Label (optioneel)</label><input class="sw-label" value="${escapeHtml(w.label||"")}" placeholder="bv. kambalk, naar klem 12"></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn small ghost sw-del">Draad verwijderen</button><button class="btn small ghost sw-sluit">Sluiten</button></div>
      </div></div>`);
      box.querySelector(".sw-kleur").addEventListener("change", e=>{ w.kleur = e.target.value; w.auto = false; save(); teken(); });
      box.querySelector(".sw-sectie").addEventListener("change", e=>{ w.sectie = e.target.value; w.auto = false; save(); teken(); });
      box.querySelector(".sw-label").addEventListener("input", e=>{ w.label = e.target.value; save(); });
      box.querySelector(".sw-del").addEventListener("click", ()=>{ kast.bedrading = kast.bedrading.filter(x=> x.id!==w.id); uvSelWire = null; save(); teken(); });
      box.querySelector(".sw-sluit").addEventListener("click", ()=>{ uvSelWire = null; teken(); });
      side.appendChild(box);
      return;
    }
    if(md){
      const codes = computeZekeringCodes();
      const klemmen = klemmenVoorModule(md);
      const box = el(`<div class="card"><div class="card-body uv-sidebody">
        <strong>${escapeHtml(codes[md.id]||"")} ${escapeHtml(MODULE_CATEGORIEEN[md.categorie] ? MODULE_CATEGORIEEN[md.categorie].label : md.categorie)}</strong>
        <div class="hint">${escapeHtml([chipSpecText(md), md.curve?("curve "+md.curve):"", md.kA?(md.kA+" kA"):"", md.type, md.naam].filter(Boolean).join(" · ")||"—")}</div>
        ${md.categorie==="Rijgklemmenmodule" ? `<div class="field"><label>Plaats in de kast</label><select class="sm-rkpos">
          <option value="" ${!md.rijgklemPositie?"selected":""}>Automatisch (nu: ${rijgklemPositie(Object.assign({}, md, {rijgklemPositie: ""}))==="boven" ? "bovenaan" : "onderaan"})</option>
          <option value="boven" ${md.rijgklemPositie==="boven"?"selected":""}>Bovenaan — Preflex boven, kast onder</option>
          <option value="onder" ${md.rijgklemPositie==="onder"?"selected":""}>Onderaan — kast boven, Preflex onder</option></select></div>` : ""}
        <div class="field"><label>Bibliotheekmodule</label><select class="sm-bib"></select></div>
        <div class="hint">${klemmen.length} klemmen — ${Array.isArray(md.klemmenEigen) && md.klemmenEigen.length ? "eigen aanpassing" : (md.categorie==="Rijgklemmenmodule" ? "uit het tabblad Rijgklemmen" : (md.bib && md.bib.klemmen && md.bib.klemmen.length ? "uit de bibliotheek" : (sjabloonVoor(md) ? "aangepaste standaard" : "standaard")))}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
          <button class="btn small primary sm-ontwerp">✏️ Tekening &amp; klemmen</button>
          <button class="btn small ghost sm-open">🔌 Bibliotheek…</button>
          <button class="btn small ghost sm-layout">In layout openen</button>
          <button class="btn small ghost sm-sluit">Sluiten</button>
        </div>
      </div></div>`);
      const rkp = box.querySelector(".sm-rkpos");
      if(rkp) rkp.addEventListener("change", e=>{ if(e.target.value) md.rijgklemPositie = e.target.value; else delete md.rijgklemPositie; save(); teken(); });
      const sel = box.querySelector(".sm-bib");
      fillBibSelect(sel, md);
      sel.addEventListener("change", e=>{
        const id = e.target.value;
        if(!id){ delete md.bibId; delete md.bib; }
        else { const row = moduleBib.find(r=> String(r.id)===id); if(row) applyBibOpModule(md, row); }
        save(); uvSyncEnOpruimen(kast); teken();
      });
      box.querySelector(".sm-open").addEventListener("click", ()=> openModuleBibliotheek({
        preset: moduleNaarBibPreset(md),
        kies: (row)=>{ applyBibOpModule(md, row); save(); uvSyncEnOpruimen(kast); teken(); },
        naSluiten: ()=>{ uvSyncEnOpruimen(kast); teken(); }
      }));
      box.querySelector(".sm-ontwerp").addEventListener("click", ()=> openModuleOntwerperVoorModule(md, ()=>{ uvSyncEnOpruimen(kast); teken(); }));
      box.querySelector(".sm-layout").addEventListener("click", ()=> selectTab("zekeringen"));
      box.querySelector(".sm-sluit").addEventListener("click", ()=>{ uvSelMod = null; teken(); });
      side.appendChild(box);
      return;
    }
    const rap = uvLaatsteOmzet && uvLaatsteOmzet.kastId===kast.id ? uvLaatsteOmzet : null;
    if(rap){
      const box = el(`<div class="card" style="margin-bottom:12px;"><div class="card-body uv-sidebody">
        <strong>⚡ Automatisch omgezet</strong>
        <ul class="uv-uitleg" style="list-style:disc;">
          <li>${rap.gekoppeld.length} module(s) gekoppeld aan de bibliotheek${rap.alGekoppeld ? ` (${rap.alGekoppeld} waren al gekoppeld)` : ""}</li>
          <li>${rap.kammen} kamgeleider(s), ${rap.draden} voedingsdraad/draden</li>
          ${rap.zonderMatch.length ? `<li>${rap.zonderMatch.length} zonder passende bibliotheekmodule (standaardtekening):</li>` : ""}
        </ul>
        <div class="uv-kam-chips uv-ontbrekend"></div>
        <div class="hint">Alles blijft aanpasbaar. Opnieuw omzetten vervangt enkel de automatische voorstellen.</div>
        <button class="btn small ghost uv-rap-sluit">Sluiten</button>
      </div></div>`);
      const zone = box.querySelector(".uv-ontbrekend");
      rap.zonderMatch.forEach(z=>{
        const m = uvAlleModules(kast).find(x=> x.id===z.id);
        if(!m || m.bibId) return;
        const c = el(`<span class="uv-chip">${escapeHtml(z.code)} <button title="toevoegen aan de bibliotheek">＋</button></span>`);
        c.querySelector("button").addEventListener("click", ()=> openModuleBibliotheek({
          preset: moduleNaarBibPreset(m), nieuw: true,
          kies: (row)=>{ applyBibOpModule(m, row, {behoudLayout: true}); save(); uvSyncEnOpruimen(kast); teken(); }
        }));
        zone.appendChild(c);
      });
      box.querySelector(".uv-rap-sluit").addEventListener("click", ()=>{ uvLaatsteOmzet = null; teken(); });
      side.appendChild(box);
    }
    const losseKlemmen = rijgklemmenZonderModule();
    if(losseKlemmen.length){
      const box = el(`<div class="card" style="margin-bottom:12px;"><div class="card-body uv-sidebody">
        <strong>Rijgklemmen</strong>
        <div class="hint">${losseKlemmen.length} rijgklem(men) van het tabblad Rijgklemmen staan nog op geen enkele rijgklemmenmodule in een kast.</div>
        <button class="btn small primary uv-rk-plaats">＋ In deze kast plaatsen</button>
      </div></div>`);
      box.querySelector(".uv-rk-plaats").addEventListener("click", ()=>{
        const n = plaatsRijgklemmenInKast(kast, losseKlemmen.map(k=> k.id));
        save(); toast(`${losseKlemmen.length} rijgklem(men) geplaatst op ${n} rijgklemmenmodule(s) — ook zichtbaar in de layout.`);
        selectTab("uitvoering");
      });
      side.appendChild(box);
    }
    const zonderBib = uvAlleModules(kast).filter(m=> m.categorie!=="Leeg" && !m.bibId).length;
    side.appendChild(el(`<div class="card"><div class="card-body uv-sidebody">
      <strong>Zo werkt het</strong>
      <ol class="uv-uitleg">
        <li><strong>⚡ Automatisch omzetten</strong> maakt een voorstel vanuit de layout.</li>
        <li>Draad: tik een <span class="uv-legende-dot"></span> aansluitklem aan, daarna de klem waar hij naartoe moet.</li>
        <li>Kamgeleider: kies het type, tik "Kamgeleider trekken" en sleep onderaan over de modules.</li>
        <li>Tik een draad, kam of module aan om hem aan te passen of te verwijderen.</li>
      </ol>
      <div class="hint">${kast.bedrading.length} draad/draden en ${(kast.kamgeleiders||[]).length} kamgeleider(s) in deze kast.${zonderBib ? ` ${zonderBib} module(s) gebruiken nog de standaardtekening.` : ""}</div>
    </div></div>`));
  }
  function tekenLijst(){
    lijst.innerHTML = "";
    const codes = computeZekeringCodes();
    const card = el(`<div class="card" style="margin-top:16px;">
      <div class="card-head"><h3>Draadlijst</h3><span class="hint">${kast.bedrading.length} draad/draden</span></div>
      <div class="card-body" style="padding:0;overflow-x:auto;"><table class="grid">
        <thead><tr><th>#</th><th>Van</th><th>Naar</th><th>Kleur</th><th>Doorsnede</th><th>Label</th><th></th></tr></thead><tbody></tbody>
      </table></div></div>`);
    const tbody = card.querySelector("tbody");
    if(!kast.bedrading.length) tbody.appendChild(el(`<tr class="emptyrow"><td colspan="7">Nog geen draden getrokken.</td></tr>`));
    kast.bedrading.forEach((w, i)=>{
      const tr = el(`<tr class="${uvSelWire===w.id?"uv-rij-sel":""}">
        <td class="codecell">${i+1}</td><td>${escapeHtml(uvKlemOmschrijving(kast, w.a))}</td><td>${escapeHtml(uvKlemOmschrijving(kast, w.b))}</td>
        <td><span class="uv-kleurstaal" style="background:${DRAAD_KLEUREN[w.kleur]||"#999"}"></span> ${escapeHtml(w.kleur||"")}</td>
        <td>${escapeHtml(String(w.sectie||""))} mm²</td><td>${escapeHtml(w.label||"")}</td>
        <td><button class="btn small ghost dl-del" title="verwijderen">✕</button></td></tr>`);
      tr.addEventListener("click", e=>{ if(e.target.closest(".dl-del")) return; uvSelWire = w.id; uvSelMod = null; uvPending = null; teken(); });
      tr.querySelector(".dl-del").addEventListener("click", ()=>{ kast.bedrading = kast.bedrading.filter(x=> x.id!==w.id); if(uvSelWire===w.id) uvSelWire = null; save(); teken(); });
      tbody.appendChild(tr);
    });
    lijst.appendChild(card);
    void codes;
    const kammen = kast.kamgeleiders || [];
    const kcard = el(`<div class="card" style="margin-top:16px;">
      <div class="card-head"><h3>Kamgeleiders</h3><span class="hint">${kammen.length} stuk(s)</span></div>
      <div class="card-body" style="padding:0;overflow-x:auto;"><table class="grid">
        <thead><tr><th>#</th><th>Type</th><th>Rij</th><th>Modules</th><th></th></tr></thead><tbody></tbody>
      </table></div></div>`);
    const ktb = kcard.querySelector("tbody");
    if(!kammen.length) ktb.appendChild(el(`<tr class="emptyrow"><td colspan="5">Nog geen kamgeleiders.</td></tr>`));
    kammen.forEach((k, i)=>{
      const om = uvKamOmschrijving(kast, k);
      const tr = el(`<tr class="${uvSelKam===k.id?"uv-rij-sel":""}"><td class="codecell">K${i+1}</td><td>${escapeHtml(om.type)}${k.auto?' <span class="hint">(auto)</span>':""}</td><td>${om.rij}</td><td>${escapeHtml(om.modules)}</td>
        <td><button class="btn small ghost kl-del" title="verwijderen">✕</button></td></tr>`);
      tr.addEventListener("click", e=>{ if(e.target.closest(".kl-del")) return; uvSelKam = k.id; uvSelWire = null; uvSelMod = null; teken(); });
      tr.querySelector(".kl-del").addEventListener("click", ()=>{ kast.kamgeleiders = kast.kamgeleiders.filter(x=> x!==k); if(uvSelKam===k.id) uvSelKam = null; save(); teken(); });
      ktb.appendChild(tr);
    });
    lijst.appendChild(kcard);
  }

  async function doeOmzet(){
    const heeftAuto = kast.bedrading.some(w=> w.auto) || (kast.kamgeleiders||[]).some(k=> k.auto);
    if(heeftAuto && !confirm("Opnieuw automatisch omzetten? De vorige automatische voorstellen worden vervangen; wat je zelf tekende of aanpaste blijft staan.")) return;
    const res = await laadAllesVoorUitvoering();
    if(res[0].status==="rejected") toast("Bibliotheek niet bereikbaar — omzetting zonder bibliotheekmodules.");
    const r = uvAutoOmzet(kast);
    uvPending = null; uvSelWire = null; uvSelMod = null; uvSelKam = null; uvKamModus = false;
    uvSyncEnOpruimen(kast);
    save(); teken();
    toast(`Omgezet: ${r.gekoppeld.length} bibliotheekkoppeling(en), ${r.kammen} kamgeleider(s), ${r.draden} draad/draden.`);
  }

  // Kamgeleider trekken: slepen over een rij (muis of vinger)
  let kamSleep = null;
  const svgPunt = (svg, ev)=>{ const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  canvas.addEventListener("pointerdown", ev=>{
    if(!uvKamModus || uvView!=="bedrading") return;
    const svg = canvas.querySelector("svg.uv-svg");
    if(!svg) return;
    const p = svgPunt(svg, ev);
    const ri = Math.floor((p.y - UV.G/2) / (UV.MH + UV.G));
    if(ri < 0 || ri >= kast.rijen.length) return;
    ev.preventDefault();
    kamSleep = { svg, ri, x0: p.x, x1: p.x };
    try{ canvas.setPointerCapture(ev.pointerId); }catch(_e){}
    toonKamPreview();
  });
  canvas.addEventListener("pointermove", ev=>{
    if(!kamSleep) return;
    kamSleep.x1 = svgPunt(kamSleep.svg, ev).x;
    toonKamPreview();
  });
  function kamModulesOnder(){
    const geo = uvGeometrie(kast);
    const lo = Math.min(kamSleep.x0, kamSleep.x1), hi = Math.max(kamSleep.x0, kamSleep.x1);
    const inRij = geo.mods.filter(md=> md.ri===kamSleep.ri && md.m.categorie!=="Leeg");
    if(hi - lo < 4) return inRij.filter(md=> lo >= md.x && lo <= md.x + md.w);
    return inRij.filter(md=> md.x + md.w > lo + 4 && md.x < hi - 4);
  }
  function toonKamPreview(){
    const r = kamSleep.svg.querySelector(".uv-kam-preview");
    if(!r) return;
    const mds = kamModulesOnder();
    const yRij = UV.G + kamSleep.ri*(UV.MH+UV.G);
    const lo = mds.length ? Math.min(...mds.map(d=> d.x)) : Math.min(kamSleep.x0, kamSleep.x1);
    const hi = mds.length ? Math.max(...mds.map(d=> d.x+d.w)) : Math.max(kamSleep.x0, kamSleep.x1);
    r.setAttribute("x", lo); r.setAttribute("width", Math.max(2, hi-lo));
    r.setAttribute("y", yRij + UV.MH - 22); r.setAttribute("height", 52);
    r.style.display = "";
  }
  let negeerKlik = false;
  const kamEinde = ()=>{
    if(!kamSleep) return;
    const mds = kamModulesOnder();
    const rij = kast.rijen[kamSleep.ri];
    kamSleep = null;
    negeerKlik = true; setTimeout(()=>{ negeerKlik = false; }, 50);
    if(mds.length < 2){ toast("Sleep over minstens 2 modules."); teken(); return; }
    const ids = mds.map(d=> d.m.id);
    // modules die al op een andere kam zaten, gaan naar deze nieuwe kam
    kast.kamgeleiders = (kast.kamgeleiders||[]).map(k=> Object.assign(k, {moduleIds: k.moduleIds.filter(id=> !ids.includes(id))})).filter(k=> k.moduleIds.length);
    const kam = {id: cryptoId(), rijId: rij.id, type: uvKamType, moduleIds: ids, auto: false};
    kast.kamgeleiders.push(kam);
    uvKamModus = false; uvSelKam = kam.id; uvSelWire = null; uvSelMod = null;
    save();
    selectTab("uitvoering");
  };
  canvas.addEventListener("pointerup", kamEinde);
  canvas.addEventListener("pointercancel", ()=>{ kamSleep = null; teken(); });

  canvas.addEventListener("click", e=>{
    if(uvView!=="bedrading" || uvKamModus || negeerKlik) return;
    const klem = e.target.closest(".uv-klem");
    if(klem){
      const eind = {m: klem.getAttribute("data-m"), k: klem.getAttribute("data-k")};
      uvSelWire = null; uvSelMod = null; uvSelKam = null;
      if(!uvPending){ uvPending = eind; teken(); return; }
      if(uvPending.m===eind.m && uvPending.k===eind.k){ uvPending = null; teken(); return; }
      const a = uvPending;
      const dubbel = kast.bedrading.some(w=> (w.a.m===a.m && w.a.k===a.k && w.b.m===eind.m && w.b.k===eind.k) || (w.a.m===eind.m && w.a.k===eind.k && w.b.m===a.m && w.b.k===a.k));
      if(dubbel){ toast("Die twee klemmen zijn al verbonden."); uvPending = null; teken(); return; }
      const geo = uvGeometrie(kast);
      const pa = geo.klemPos[uvKlemKey(a.m, a.k)];
      const pb = geo.klemPos[uvKlemKey(eind.m, eind.k)];
      const ader = (pa && aderKleurNaarDraad(pa.k.kleur)) || (pb && aderKleurNaarDraad(pb.k.kleur));
      const kleur = uvKleurAuto ? (ader || (pa ? standaardKleurVoorFunctie(pa.k.functie || pa.k.label) : uvKleur)) : uvKleur;
      const nw = {id: cryptoId(), a, b: eind, kleur, sectie: uvSectie, label: ""};
      kast.bedrading.push(nw);
      uvPending = null;
      save(); teken();
      return;
    }
    const draad = e.target.closest(".uv-draad");
    if(draad){ uvSelWire = draad.getAttribute("data-w"); uvSelMod = null; uvSelKam = null; uvPending = null; teken(); return; }
    const kamEl = e.target.closest(".uv-kam");
    if(kamEl){ uvSelKam = kamEl.getAttribute("data-kam"); uvSelWire = null; uvSelMod = null; uvPending = null; teken(); return; }
    const mod = e.target.closest(".uv-mod");
    if(mod){ uvSelMod = mod.getAttribute("data-mod"); uvSelWire = null; uvSelKam = null; teken(); return; }
    if(uvSelWire || uvSelMod || uvSelKam){ uvSelWire = null; uvSelMod = null; uvSelKam = null; teken(); }
  });

  wrap.querySelectorAll(".uv-seg button").forEach(b=> b.addEventListener("click", ()=>{ uvView = b.dataset.view; uvPending = null; selectTab("uitvoering"); }));
  wrap.querySelector(".uv-kleurauto").addEventListener("change", e=>{ uvKleurAuto = e.target.checked; wrap.querySelector(".uv-kleur").disabled = uvKleurAuto; });
  wrap.querySelector(".uv-kleur").addEventListener("change", e=>{ uvKleur = e.target.value; });
  wrap.querySelector(".uv-sectie").addEventListener("change", e=>{ uvSectie = e.target.value; });
  wrap.querySelector(".uv-omzet").addEventListener("click", doeOmzet);
  wrap.querySelector(".uv-kamtype").addEventListener("change", e=>{ uvKamType = e.target.value; });
  wrap.querySelector(".uv-kammodus").addEventListener("click", ()=>{ uvKamModus = !uvKamModus; uvPending = null; uvSelKam = null; selectTab("uitvoering"); });
  wrap.querySelector(".uv-wis").addEventListener("click", ()=>{
    const nk = (kast.kamgeleiders||[]).length;
    if(!kast.bedrading.length && !nk) return;
    if(!confirm(`Alle ${kast.bedrading.length} draden en ${nk} kamgeleider(s) van ${kast.naam} wissen?`)) return;
    kast.bedrading = []; kast.kamgeleiders = []; uvSelWire = null; uvSelKam = null; uvPending = null; uvLaatsteOmzet = null; save(); teken();
  });
  const zoom = (f)=>{ uvZoom = Math.max(0.4, Math.min(2.5, Math.round(uvZoom*f*10)/10)); wrap.querySelector(".uv-zoomval").textContent = Math.round(uvZoom*100)+"%"; teken(); };
  wrap.querySelector(".uv-zoom-in").addEventListener("click", ()=> zoom(1.2));
  wrap.querySelector(".uv-zoom-uit").addEventListener("click", ()=> zoom(1/1.2));
  wrap.querySelector(".uv-bib").addEventListener("click", ()=> openModuleBibliotheek({ naSluiten: ()=>{ uvSyncEnOpruimen(kast); teken(); } }));
  wrap.querySelector(".uv-export").addEventListener("click", ()=> exportUitvoeringVoorWerf(true));

  teken();
  // Bibliotheek op de achtergrond laden zodat gekoppelde modules hun meest
  // recente tekening/klemmen tonen.
  if(!moduleBibGeladen || !cadosInstGeladen) laadAllesVoorUitvoering().then(()=>{ uvSyncEnOpruimen(kast); if(document.body.contains(wrap)) teken(); });
  // Zwevende uitleg bij hoveren: benaming + specs van de module, klem, draad.
  const tipEl = el(`<div class="uv-tip" style="display:none;"></div>`);
  canvas.parentElement.style.position = "relative";
  canvas.parentElement.appendChild(tipEl);
  canvas.addEventListener("pointermove", ev=>{
    if(ev.pointerType==="touch" || kamSleep){ tipEl.style.display = "none"; return; }
    const t = ev.target.closest && ev.target.closest("[data-tip]");
    const tekst = t && t.getAttribute("data-tip");
    if(!tekst){ tipEl.style.display = "none"; return; }
    tipEl.textContent = tekst;
    const rc = canvas.parentElement.getBoundingClientRect();
    tipEl.style.display = "block";
    let lx = ev.clientX - rc.left + 14, ly = ev.clientY - rc.top + 16;
    if(lx + tipEl.offsetWidth > rc.width - 4) lx = Math.max(4, ev.clientX - rc.left - tipEl.offsetWidth - 10);
    tipEl.style.left = lx + "px"; tipEl.style.top = ly + "px";
  });
  canvas.addEventListener("pointerleave", ()=>{ tipEl.style.display = "none"; });
  return wrap;
}

function exportUitvoeringVoorWerf(standalone=true){
  const kasten = state.zekeringen.kasten.filter(k=> k.rijen.some(r=> r.items.some(m=> m.categorie!=="Leeg")));
  if(!kasten.length){ if(standalone) alert("Er staan nog geen modules in de zekeringkast om te exporteren."); return; }
  const container = document.getElementById("printExport");
  if(standalone) container.innerHTML = "";
  const projectNaam = state.instellingen.project || "Naamloos project";
  const adres = state.instellingen.adres || "";
  const vorigeKast = zekeringHuidigeKastId;
  kasten.forEach(kast=>{
    uvSyncEnOpruimen(kast);
    const titel = escapeHtml(kast.naam) + (kast.kamer ? " — "+escapeHtml(kast.kamer) : "");
    const p1 = el(`<div class="pe-page uv-print" data-content="schema">
      <div class="pe-title">${escapeHtml(projectNaam)}</div>
      <div class="pe-sub">Uitvoeringsplan bedrading — ${titel}${adres ? " · "+escapeHtml(adres) : ""} · ${new Date().toLocaleDateString("nl-BE")}</div>
      <div class="uv-print-svg">${bouwBedradingSvg(kast, false).svg}</div>
    </div>`);
    container.appendChild(p1);
    const p2 = el(`<div class="pe-page uv-print" data-content="schema">
      <div class="pe-title">${escapeHtml(projectNaam)}</div>
      <div class="pe-sub">Eendraadschema — ${titel}${adres ? " · "+escapeHtml(adres) : ""}</div>
      <div class="uv-print-svg">${bouwEendraadSvg(kast)}</div>
    </div>`);
    container.appendChild(p2);
    const p3 = el(`<div class="pe-panel-page" data-content="lijst">
      <div class="pe-panel-head"><h2>Draadlijst — ${titel}</h2><div class="pe-meta">${escapeHtml(projectNaam)}</div></div>
      <table class="pe-porttable"><thead><tr><th>#</th><th>Van</th><th>Naar</th><th>Kleur</th><th>Doorsnede</th><th>Label</th></tr></thead><tbody></tbody></table>
    </div>`);
    const tb = p3.querySelector("tbody");
    if(!kast.bedrading.length) tb.appendChild(el(`<tr><td colspan="6">Nog geen draden getrokken.</td></tr>`));
    kast.bedrading.forEach((w, i)=> tb.appendChild(el(`<tr><td>${i+1}</td><td>${escapeHtml(uvKlemOmschrijving(kast, w.a))}</td><td>${escapeHtml(uvKlemOmschrijving(kast, w.b))}</td><td>${escapeHtml(w.kleur||"")}</td><td>${escapeHtml(String(w.sectie||""))} mm²</td><td>${escapeHtml(w.label||"")}</td></tr>`)));
    if((kast.kamgeleiders||[]).length){
      const kt = el(`<div><h3 style="margin:14px 0 6px;font-size:13px;">Kamgeleiders</h3><table class="pe-porttable"><thead><tr><th>#</th><th>Type</th><th>Rij</th><th>Modules</th></tr></thead><tbody></tbody></table></div>`);
      kast.kamgeleiders.forEach((k, i)=>{ const om = uvKamOmschrijving(kast, k); kt.querySelector("tbody").appendChild(el(`<tr><td>K${i+1}</td><td>${escapeHtml(om.type)}</td><td>${om.rij}</td><td>${escapeHtml(om.modules)}</td></tr>`)); });
      p3.appendChild(kt);
    }
    container.appendChild(p3);
  });
  zekeringHuidigeKastId = vorigeKast;
  // svg's schalen naar de paginabreedte
  container.querySelectorAll(".uv-print-svg svg").forEach(svg=>{ svg.removeAttribute("width"); svg.removeAttribute("height"); svg.style.width = "100%"; svg.style.height = "auto"; svg.style.maxHeight = "175mm"; });
  if(standalone){
    [...container.children].forEach((p, i)=>{ if(i>0) p.style.pageBreakBefore = "always"; });
    document.body.classList.add("print-patchkast");
    window.print();
    const cleanup = ()=>{ document.body.classList.remove("print-patchkast"); window.removeEventListener("afterprint", cleanup); };
    window.addEventListener("afterprint", cleanup);
    setTimeout(cleanup, 5000);
  }
}

/* =========================================================================
   MODULEBIBLIOTHEEK — beheer-venster (ook bereikbaar vanuit de Catalogus
   van de hele suite via window.openModuleBibliotheek)
   ========================================================================= */
const BIB_VELDEN = [
  {key:"categorie", label:"Soort module", type:"select", opties:()=> Object.keys(MODULE_CATEGORIEEN).filter(k=>k!=="Leeg"), optLabel:(k)=> MODULE_CATEGORIEEN[k].label},
  {key:"merk", label:"Merk", type:"text", ph:"bv. Hager"},
  {key:"artikelnr", label:"Artikelnummer / type", type:"text", ph:"bv. MCN116"},
  {key:"polen", label:"Aantal polen", type:"select", opties:()=>["","1P","1P+N","2P","3P","3P+N","4P"], cats:["Automaat","Differentieel","Overig"]},
  {key:"stroom", label:"Nominale stroom (A)", type:"select", opties:()=>["","2","4","6","10","13","16","20","25","32","40","50","63","80","100","125"], optLabel:(v)=> v? v+" A" : "—", cats:["Automaat","Differentieel","Overig"]},
  {key:"curve", label:"Curve", type:"select", opties:()=> CURVE_OPTIES, cats:["Automaat","Overig"]},
  {key:"kortsluit", label:"Kortsluitvermogen (kA)", type:"select", opties:()=> KA_OPTIES, optLabel:(v)=> v? v+" kA" : "—", cats:["Automaat","Differentieel","Overig"]},
  {key:"gevoeligheid", label:"Gevoeligheid (mA)", type:"select", opties:()=>["","10","30","100","300","500"], optLabel:(v)=> v? v+" mA" : "—", cats:["Differentieel"]},
  {key:"diff_type", label:"Type differentieel", type:"select", opties:()=> DIFF_TYPE_OPTIES, cats:["Differentieel"]},
  {key:"breedte", label:"Breedte (modules van 17,5 mm)", type:"number"},
  {key:"info", label:"Info / opmerking", type:"text", ph:"bv. met hulpcontact, bus-aansluiting…", optioneel:true},
  {key:"naam", label:"Naam in de bibliotheek", type:"text", ph:"automatisch: merk + artikelnummer", optioneel:true},
];
function bibVeldRelevant(v, cat){ return !v.cats || v.cats.includes(cat); }
function bibAutoNaam(r){
  const merkArt = [r.merk, r.artikelnr].filter(Boolean).join(" ");
  if(merkArt) return merkArt;
  const cat = MODULE_CATEGORIEEN[r.categorie] ? MODULE_CATEGORIEEN[r.categorie].label : (r.categorie||"Module");
  return [cat, (r.curve||"")+(r.stroom? r.stroom+"A" : ""), r.polen, r.kortsluit? r.kortsluit+"kA" : "", r.gevoeligheid? r.gevoeligheid+"mA" : "", r.diff_type? "type "+r.diff_type : ""].filter(Boolean).join(" ");
}
function bibBreedteVoorPolen(p){ return ({"1P":1,"1P+N":2,"2P":2,"3P":3,"3P+N":4,"4P":4})[p] || ""; }
function bibThumbSvg(r){
  const b = Math.max(1, Math.min(6, Number(r.breedte)||1));
  return `<svg viewBox="0 0 ${b*38} 150" class="mbib-thumb-svg"><rect x="1" y="1" width="${b*38-2}" height="148" rx="4" fill="#fff" stroke="#8a8f98"/>
    <rect x="4" y="4" width="${b*38-8}" height="18" fill="#e6e8eb"/><rect x="4" y="128" width="${b*38-8}" height="18" fill="#e6e8eb"/>
    <rect x="${b*19-6}" y="85" width="12" height="26" rx="2" fill="#3a3f45"/></svg>`;
}
function dataUrlNaarBlob(dataUrl){
  const [kop, data] = dataUrl.split(",");
  const mime = (kop.match(/data:([^;]+)/)||[])[1] || "image/png";
  const bin = atob(data);
  const arr = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], {type: mime});
}
function laadAfbeelding(src){
  return new Promise((res, rej)=>{
    const img = new Image();
    if(!/^data:/.test(src)) img.crossOrigin = "anonymous";
    img.onload = ()=> res(img);
    img.onerror = ()=> rej(new Error("Afbeelding kon niet geladen worden"));
    img.src = src;
  });
}
async function verkleinDataUrl(src, maxZijde, mime, kwaliteit){
  const img = await laadAfbeelding(src);
  const s = Math.min(1, maxZijde / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth*s)); c.height = Math.max(1, Math.round(img.naturalHeight*s));
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(mime||"image/jpeg", kwaliteit||0.9);
}
async function pdfPaginaNaarDataUrl(file, pagina){
  if(!window.pdfjsLib) throw new Error("PDF-lezer niet geladen (geen internet?)");
  if(!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.5.141/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({data: buf}).promise;
  const p = Math.max(1, Math.min(doc.numPages, pagina||1));
  const page = await doc.getPage(p);
  const vp1 = page.getViewport({scale: 1});
  const scale = Math.min(3, 2000 / Math.max(vp1.width, vp1.height));
  const vp = page.getViewport({scale});
  const c = document.createElement("canvas");
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  await page.render({canvasContext: g, viewport: vp}).promise;
  return {dataUrl: c.toDataURL("image/png"), aantal: doc.numPages, pagina: p};
}
function bestandNaarDataUrl(file){
  return new Promise((res, rej)=>{ const r = new FileReader(); r.onload = ()=> res(r.result); r.onerror = ()=> rej(r.error); r.readAsDataURL(file); });
}

function openModuleBibliotheek(opts){
  opts = opts || {};
  const oud = document.getElementById("mbib-overlay");
  if(oud) oud.remove();
  const overlay = document.createElement("div");
  overlay.id = "mbib-overlay";
  overlay.className = "mbib-overlay";
  overlay.innerHTML = `<div class="mbib-box" role="dialog" aria-modal="true" aria-label="Modulebibliotheek">
    <div class="mbib-head"><h2>🔌 Modulebibliotheek — zekeringkast</h2><button type="button" class="mbib-btn ghost mbib-close">Sluiten</button></div>
    <div class="mbib-body"></div></div>`;
  document.body.appendChild(overlay);
  const ctx = { opts, body: overlay.querySelector(".mbib-body"), filter: { q: "", cat: (opts.preset && opts.preset.categorie) || "" } };
  const onKey = (e)=>{ if(e.key==="Escape" && !ctx.bezig) ctx.sluit(); };
  ctx.sluit = ()=>{
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    if(typeof opts.naSluiten === "function") opts.naSluiten();
  };
  document.addEventListener("keydown", onKey);
  overlay.querySelector(".mbib-close").addEventListener("click", ()=> ctx.sluit());
  overlay.addEventListener("click", e=>{ if(e.target===overlay && !ctx.bezig) ctx.sluit(); });
  if(opts.nieuw) toonBibEditor(ctx, null); else toonBibLijst(ctx);
}
window.openModuleBibliotheek = openModuleBibliotheek;

async function toonBibLijst(ctx){
  laadCadosInst().catch(()=>{});
  const cats = Object.keys(MODULE_CATEGORIEEN).filter(k=> k!=="Leeg");
  ctx.tab = "modules";
  ctx.body.innerHTML = bibTabsHtml(ctx) + `
    <p class="mbib-hint">Gedeeld over alle projecten. Elke module heeft zijn (zelf getekende) tekening en aansluitklemmen — die gebruikt het Uitvoeringsplan om de bedrading te tekenen.${ctx.opts.kies ? " <strong>Tik op \"Kiezen\" om de module aan je zekering te koppelen.</strong>" : ""}</p>
    <div class="mbib-filter">
      <input type="search" class="mbib-q" placeholder="Zoek op merk, type, artikelnummer…" value="${escapeHtml(ctx.filter.q)}">
      <select class="mbib-cat"><option value="">Alle soorten</option>${cats.map(c=>`<option value="${c}" ${ctx.filter.cat===c?"selected":""}>${escapeHtml(MODULE_CATEGORIEEN[c].label)}</option>`).join("")}</select>
      <button type="button" class="mbib-btn primary mbib-nieuw">+ Nieuwe module</button>
    </div>
    <div class="mbib-grid"><div class="mbib-leeg">Bibliotheek laden…</div></div>`;
  wireBibTabs(ctx);
  const grid = ctx.body.querySelector(".mbib-grid");
  ctx.body.querySelector(".mbib-q").addEventListener("input", e=>{ ctx.filter.q = e.target.value; renderGrid(); });
  ctx.body.querySelector(".mbib-cat").addEventListener("change", e=>{ ctx.filter.cat = e.target.value; renderGrid(); });
  ctx.body.querySelector(".mbib-nieuw").addEventListener("click", ()=> toonBibEditor(ctx, null));
  try{ await laadModuleBib(true); }
  catch(e){ grid.innerHTML = `<div class="mbib-leeg mbib-fout">Kon de bibliotheek niet laden: ${escapeHtml(e.message||String(e))}</div>`; return; }
  renderGrid();
  function renderGrid(){
    const q = ctx.filter.q.trim().toLowerCase();
    const preset = ctx.opts.preset;
    let rows = moduleBib.filter(r=> (!ctx.filter.cat || r.categorie===ctx.filter.cat) &&
      (!q || [r.naam, r.merk, r.artikelnr, r.info, bibSpecTekst(r)].join(" ").toLowerCase().includes(q)));
    if(preset){
      const pm = {categorie: preset.categorie, polen: normPolen(preset.polen), A: normA(preset.stroom), curve: preset.curve, kA: preset.kortsluit, mA: normMA(preset.gevoeligheid)};
      rows = rows.slice().sort((a,b)=> bibMatchScore(b, pm) - bibMatchScore(a, pm));
    }
    grid.innerHTML = "";
    if(!rows.length){
      grid.innerHTML = `<div class="mbib-leeg">${moduleBib.length ? "Geen modules gevonden met deze filter." : "De bibliotheek is nog leeg. Voeg je eerste module toe met <strong>+ Nieuwe module</strong> — laad een foto of technische tekening en laat de AI de klemmen aanduiden."}</div>`;
      return;
    }
    rows.forEach(r=>{
      const card = document.createElement("div");
      card.className = "mbib-card";
      const vm = {id: "v", categorie: r.categorie, polen: normPolen(r.polen), A: normA(r.stroom), curve: r.curve, mA: normMA(r.gevoeligheid), naam: r.naam, type: [r.merk, r.artikelnr].filter(Boolean).join(" "), breedte: Number(r.breedte)||1, uitgangen: []};
      const vwg = Object.assign(standaardWeergave(vm), (r.specs && r.specs.weergave) || {});
      card.innerHTML = `<div class="mbib-thumb">${r.tekening_url && vwg.foto !== false ? `<img src="${escapeHtml(r.tekening_url)}" alt="">` : miniModuleSvg(vm, r.klemmen||[], vwg)}</div>
        <div class="mbib-card-body"><div class="mbib-card-naam">${escapeHtml(r.naam)}</div>
        <div class="mbib-card-spec">${escapeHtml(bibSpecTekst(r))}</div>
        <div class="mbib-card-spec dim">${(r.klemmen||[]).length} klemmen${r.tekening_url ? " · met foto" : " · zelf getekend"}</div>
        <div class="mbib-card-acties">${ctx.opts.kies ? `<button type="button" class="mbib-btn primary mbib-kies">Kiezen</button>` : ""}
          <button type="button" class="mbib-btn ghost mbib-edit">Bewerken</button>
          <button type="button" class="mbib-btn ghost mbib-del" title="verwijderen">🗑</button></div></div>`;
      const kb = card.querySelector(".mbib-kies");
      if(kb) kb.addEventListener("click", ()=>{ ctx.opts.kies(r); ctx.sluit(); });
      card.querySelector(".mbib-edit").addEventListener("click", ()=> toonBibEditor(ctx, r));
      card.querySelector(".mbib-del").addEventListener("click", async ()=>{
        if(!confirm(`"${r.naam}" uit de bibliotheek verwijderen? Projecten die hem gebruiken houden hun kopie van de tekening.`)) return;
        try{ await window.dbDeleteModule(r.id); await laadModuleBib(true); renderGrid(); }
        catch(e){ alert("Verwijderen mislukt: "+(e.message||e)); }
      });
      grid.appendChild(card);
    });
  }
}

function toonBibEditor(ctx, bestaand){
  const preset = ctx.opts.preset || {};
  const r = bestaand ? JSON.parse(JSON.stringify(bestaand)) : {
    id: null, naam: "", merk: "", artikelnr: "", categorie: preset.categorie || "Automaat",
    polen: preset.polen || "", stroom: preset.stroom || "", curve: preset.curve || "", kortsluit: preset.kortsluit || "",
    gevoeligheid: preset.gevoeligheid || "", diff_type: preset.diff_type || "", breedte: preset.breedte || "",
    info: "", klemmen: [], tekening_url: null, specs: {}
  };
  ["merk","artikelnr","polen","stroom","curve","kortsluit","gevoeligheid","diff_type","info","naam"].forEach(k=>{ if(r[k]==null) r[k] = ""; });
  const e = {
    r, bron: null, bronBestand: null, pdfAantal: 0, pdfPagina: 1,
    crop: {x0:0, y0:0, x1:1, y1:1}, klemmenBron: null,
    tekening: r.tekening_url || null, klemmen: Array.isArray(r.klemmen) ? r.klemmen.map(k=>({...k})) : [],
    selKlem: null, klemModus: false, aiVragen: [], aiStatus: "", aiVelden: new Set(), cropModus: false
  };
  ctx.body.innerHTML = `
    <div class="mbib-terug"><button type="button" class="mbib-btn ghost mbib-terugbtn">← Terug naar de lijst</button></div>
    <div class="mbib-edit">
      <div class="mbib-col">
        <div class="mbib-stap"><span class="mbib-nr">1</span> <strong>Module tekenen &amp; aansluitklemmen</strong> <span class="mbib-sub">— de snappunten voor de draden</span></div>
        <div class="mbib-klem-editor"></div>
        <details class="mbib-foto" ${r.tekening_url ? "open" : ""}><summary>📷 Optioneel: foto, technische tekening of PDF laden — de AI leest specs en klemmen</summary>
        <div class="mbib-rij">
          <label class="mbib-btn">📁 Bestand kiezen<input type="file" class="mbib-file" accept="image/*,application/pdf" hidden></label>
          <label class="mbib-btn">📷 Foto nemen<input type="file" class="mbib-cam" accept="image/*" capture="environment" hidden></label>
          <span class="mbib-pdfnav" hidden>PDF-pagina <input type="number" class="mbib-pdfpag" min="1" value="1" style="width:56px;"> / <span class="mbib-pdfaantal"></span></span>
        </div>
        <div class="mbib-bron-wrap" hidden>
          <div class="mbib-bron"><img class="mbib-bron-img" alt=""><div class="mbib-crop"></div></div>
          <div class="mbib-rij">
            <button type="button" class="mbib-btn primary mbib-ai">🤖 AI: herken specs &amp; klemmen</button>
            <button type="button" class="mbib-btn ghost mbib-cropmodus">✂️ Uitsnede aanduiden</button>
            <button type="button" class="mbib-btn ghost mbib-cropok">Uitsnede gebruiken</button>
          </div>
          <div class="mbib-ai-status"></div>
        </div>
        </details>

      </div>
      <div class="mbib-col mbib-form-col">
        <div class="mbib-stap"><span class="mbib-nr">2</span> <strong>Gegevens</strong></div>
        <div class="mbib-vragen"></div>
        <div class="mbib-form"></div>
        <div class="mbib-acties">
          <button type="button" class="mbib-btn ghost mbib-annuleer">Annuleren</button>
          <button type="button" class="mbib-btn primary mbib-bewaar">${ctx.opts.kies ? "Bewaren en kiezen" : "Bewaren in bibliotheek"}</button>
        </div>
      </div>
    </div>`;
  const B = (s)=> ctx.body.querySelector(s);
  const terug = ()=>{ if(ctx.bezig) return; toonBibLijst(ctx); };
  B(".mbib-terugbtn").addEventListener("click", terug);
  B(".mbib-annuleer").addEventListener("click", ()=>{ if(ctx.opts.nieuw && !bestaand) ctx.sluit(); else terug(); });

  /* ---- stap 1: bron + uitsnede ---- */
  const bronWrap = B(".mbib-bron-wrap"), bronImg = B(".mbib-bron-img"), cropEl = B(".mbib-crop"), bronBox = B(".mbib-bron");
  function toonCrop(){
    const c = e.crop;
    Object.assign(cropEl.style, { left: (c.x0*100)+"%", top: (c.y0*100)+"%", width: ((c.x1-c.x0)*100)+"%", height: ((c.y1-c.y0)*100)+"%" });
    bronBox.classList.toggle("cropmodus", e.cropModus);
    B(".mbib-cropmodus").classList.toggle("actief", e.cropModus);
  }
  async function zetBron(dataUrl){
    e.bron = dataUrl;
    bronImg.src = dataUrl;
    bronWrap.hidden = false;
    e.crop = {x0:0, y0:0, x1:1, y1:1};
    e.klemmenBron = null;
    toonCrop();
    // Zonder uitsnede is de volledige afbeelding de tekening, tot de AI of
    // de gebruiker een uitsnede aanduidt.
    await pasUitsnedeToe(false);
  }
  async function laadBestand(file){
    if(!file) return;
    e.bronBestand = file;
    try{
      if(file.type==="application/pdf" || /\.pdf$/i.test(file.name)){
        const res = await pdfPaginaNaarDataUrl(file, e.pdfPagina);
        e.pdfAantal = res.aantal; e.pdfPagina = res.pagina;
        B(".mbib-pdfnav").hidden = res.aantal <= 1;
        B(".mbib-pdfaantal").textContent = res.aantal;
        B(".mbib-pdfpag").value = res.pagina;
        await zetBron(res.dataUrl);
      } else {
        B(".mbib-pdfnav").hidden = true;
        const raw = await bestandNaarDataUrl(file);
        await zetBron(await verkleinDataUrl(raw, 2200, /png/i.test(file.type) ? "image/png" : "image/jpeg", 0.92));
      }
    }catch(err){ alert("Bestand inlezen mislukt: "+(err.message||err)); }
  }
  B(".mbib-file").addEventListener("change", ev=>{ e.pdfPagina = 1; laadBestand(ev.target.files[0]); ev.target.value = ""; });
  B(".mbib-cam").addEventListener("change", ev=>{ e.pdfPagina = 1; laadBestand(ev.target.files[0]); ev.target.value = ""; });
  B(".mbib-pdfpag").addEventListener("change", ev=>{ e.pdfPagina = parseInt(ev.target.value)||1; if(e.bronBestand) laadBestand(e.bronBestand); });
  // plakken (Ctrl+V) van een schermafdruk uit een datasheet
  ctx.body.addEventListener("paste", ev=>{
    const item = [...(ev.clipboardData ? ev.clipboardData.items : [])].find(i=> i.type && i.type.startsWith("image/"));
    if(item){ ev.preventDefault(); laadBestand(item.getAsFile()); }
  });
  B(".mbib-cropmodus").addEventListener("click", ()=>{ e.cropModus = !e.cropModus; toonCrop(); });
  B(".mbib-cropok").addEventListener("click", ()=> pasUitsnedeToe(true));
  let cropStart = null;
  bronBox.addEventListener("pointerdown", ev=>{
    if(!e.cropModus) return;
    ev.preventDefault();
    const rc = bronImg.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (ev.clientX-rc.left)/rc.width)), py = Math.min(1, Math.max(0, (ev.clientY-rc.top)/rc.height));
    cropStart = {px, py};
    e.crop = {x0:px, y0:py, x1:px, y1:py};
    bronBox.setPointerCapture(ev.pointerId);
    toonCrop();
  });
  bronBox.addEventListener("pointermove", ev=>{
    if(!cropStart) return;
    const rc = bronImg.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (ev.clientX-rc.left)/rc.width)), py = Math.min(1, Math.max(0, (ev.clientY-rc.top)/rc.height));
    e.crop = {x0: Math.min(cropStart.px, px), y0: Math.min(cropStart.py, py), x1: Math.max(cropStart.px, px), y1: Math.max(cropStart.py, py)};
    toonCrop();
  });
  const cropEinde = ()=>{
    if(!cropStart) return;
    cropStart = null;
    if(e.crop.x1-e.crop.x0 < 0.02 || e.crop.y1-e.crop.y0 < 0.02) e.crop = {x0:0, y0:0, x1:1, y1:1};
    toonCrop();
  };
  bronBox.addEventListener("pointerup", cropEinde);
  bronBox.addEventListener("pointercancel", cropEinde);

  async function pasUitsnedeToe(meldKlemmen){
    if(!e.bron) return;
    const c = e.crop;
    if(meldKlemmen && e.klemmen.length && !e.klemmenBron && !confirm("De uitsnede wijzigen? De klemmen die je op de huidige tekening plaatste blijven op dezelfde relatieve plaats staan — controleer ze nadien.")) return;
    const img = await laadAfbeelding(e.bron);
    const sx = Math.round(c.x0*img.naturalWidth), sy = Math.round(c.y0*img.naturalHeight);
    const sw = Math.max(1, Math.round((c.x1-c.x0)*img.naturalWidth)), sh = Math.max(1, Math.round((c.y1-c.y0)*img.naturalHeight));
    const s = Math.min(1, 1100 / Math.max(sw, sh));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(sw*s)); cv.height = Math.max(1, Math.round(sh*s));
    const g = cv.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    e.tekening = (cv.width*cv.height < 700000) ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", 0.9);
    if(e.klemmenBron){
      e.klemmen = e.klemmenBron
        .map(k=>({ id: k.id, label: k.label, functie: k.functie, zijde: k.zijde,
          x: (k.xb - c.x0)/(c.x1 - c.x0), y: (k.yb - c.y0)/(c.y1 - c.y0) }))
        .filter(k=> k.x >= -0.05 && k.x <= 1.05 && k.y >= -0.05 && k.y <= 1.05)
        .map(k=>({ ...k, x: Math.min(1, Math.max(0, k.x)), y: Math.min(1, Math.max(0, k.y)), zijde: k.zijde || (k.y>=0.5?"onder":"boven") }));
    }
    e.cropModus = false; toonCrop();
    tekenTekening(); tekenKlemlijst();
  }

  /* ---- AI ---- */
  const aiStatus = B(".mbib-ai-status");
  B(".mbib-ai").addEventListener("click", async ()=>{
    if(!e.bron){ alert("Laad eerst een foto of tekening."); return; }
    if(!window.aiModuleAnalyse){ alert("De AI-koppeling is niet beschikbaar."); return; }
    const knop = B(".mbib-ai");
    knop.disabled = true; ctx.bezig = true;
    aiStatus.className = "mbib-ai-status bezig";
    aiStatus.textContent = "🤖 De AI bekijkt de tekening… (10-40 seconden)";
    try{
      const img = await verkleinDataUrl(e.bron, 1600, "image/jpeg", 0.9);
      leesForm();
      const res = await window.aiModuleAnalyse(img, { categorie: r.categorie, merk: r.merk, artikelnr: r.artikelnr, polen: r.polen, stroom: r.stroom });
      e.aiVelden = new Set();
      const zet = (k, v)=>{ if(v===undefined || v===null || v==="") return; if(r[k]==="" || r[k]==null || (k==="categorie")){ r[k] = String(v); e.aiVelden.add(k); } };
      if(res.categorie && MODULE_CATEGORIEEN[res.categorie]) zet("categorie", res.categorie);
      ["merk","artikelnr","polen","stroom","curve","kortsluit","gevoeligheid","diff_type"].forEach(k=> zet(k, res[k]));
      if(res.breedte && !Number(r.breedte)){ r.breedte = res.breedte; e.aiVelden.add("breedte"); }
      if(res.omschrijving && !r.info){ r.info = String(res.omschrijving).slice(0, 200); e.aiVelden.add("info"); }
      const box = Array.isArray(res.module_box) && res.module_box.length===4 ? res.module_box.map(Number) : null;
      if(box && box.every(n=> isFinite(n)) && box[2] > box[0] && box[3] > box[1]){
        const pad = 0.012;
        e.crop = { y0: Math.max(0, box[0]/1000 - pad), x0: Math.max(0, box[1]/1000 - pad), y1: Math.min(1, box[2]/1000 + pad), x1: Math.min(1, box[3]/1000 + pad) };
      }
      e.klemmenBron = (Array.isArray(res.klemmen) ? res.klemmen : []).map((k, i)=>({
        id: "k"+(i+1), label: String(k.label||(i+1)).slice(0, 8), functie: String(k.functie||""), zijde: k.zijde==="onder" ? "onder" : (k.zijde==="boven" ? "boven" : ""),
        xb: (Number(k.x)||0)/1000, yb: (Number(k.y)||0)/1000
      }));
      e.aiVragen = Array.isArray(res.vragen) ? res.vragen.filter(Boolean).slice(0, 8) : [];
      await pasUitsnedeToe(false);
      tekenForm();
      aiStatus.className = "mbib-ai-status ok";
      aiStatus.textContent = `✅ Herkend${res.model ? " ("+res.model+")" : ""}: ${e.aiVelden.size} gegeven(s), ${e.klemmen.length} klem(men). Controleer de uitsnede, klemmen en vragen.`;
    }catch(err){
      aiStatus.className = "mbib-ai-status fout";
      aiStatus.textContent = "⚠️ AI-herkenning mislukt: "+(err.message||err)+" — je kan alles ook zelf invullen.";
    }finally{
      knop.disabled = false; ctx.bezig = false;
    }
  });

  /* ---- klemmen + zelf getekende module (gedeelde klem-editor) ---- */
  e.weergave = Object.assign({}, (r.specs && r.specs.weergave) || {});
  const bibModule = ()=>({ id: "bib", categorie: r.categorie, polen: normPolen(r.polen) || (r.categorie==="Differentieel" ? "2P" : "1P"),
    A: normA(r.stroom), curve: r.curve, mA: normMA(r.gevoeligheid), naam: (r.naam||"").trim() || [r.merk, r.artikelnr].filter(Boolean).join(" "),
    type: [r.merk, r.artikelnr].filter(Boolean).join(" "), breedte: Number(r.breedte) || bibBreedteVoorPolen(r.polen) || 1, uitgangen: [] });
  const ke = klemEditor(B(".mbib-klem-editor"), {
    getKlemmen: ()=> e.klemmen, setKlemmen: (v)=>{ e.klemmen = v; },
    module: bibModule, weergave: ()=> e.weergave,
    tekening: ()=> (e.tekening && e.weergave.foto !== false) ? e.tekening : null,
    fotoBeschikbaar: ()=> !!e.tekening,
    standaard: ()=> standaardKlemmen(bibModule()),
    onChange: ()=> tekenVragen()
  });
  function tekenTekening(){ ke.teken(); }
  function tekenKlemlijst(){ /* zit in de klem-editor */ }

  /* ---- stap 3: gegevens + vragen ---- */
  const form = B(".mbib-form");
  function leesForm(){
    form.querySelectorAll("[data-veld]").forEach(inp=>{ r[inp.dataset.veld] = inp.value; });
  }
  function tekenForm(){
    form.innerHTML = "";
    BIB_VELDEN.forEach(v=>{
      if(!bibVeldRelevant(v, r.categorie)) return;
      const waarde = r[v.key]==null ? "" : String(r[v.key]);
      const vraag = !v.optioneel && waarde==="" ;
      const wrapV = document.createElement("div");
      wrapV.className = "mbib-veld" + (vraag ? " vraag" : "") + (e.aiVelden.has(v.key) ? " ai" : "");
      let inp;
      if(v.type==="select"){
        const opts = v.opties();
        const lijst = opts.includes(waarde) ? opts : [waarde, ...opts];
        inp = `<select data-veld="${v.key}">${lijst.map(o=>`<option value="${escapeHtml(o)}" ${o===waarde?"selected":""}>${escapeHtml(v.optLabel ? v.optLabel(o) : (o||"—"))}</option>`).join("")}</select>`;
      } else if(v.type==="number"){
        inp = `<input type="number" min="0.5" step="0.5" data-veld="${v.key}" value="${escapeHtml(waarde)}">`;
      } else {
        inp = `<input type="text" data-veld="${v.key}" value="${escapeHtml(waarde)}" placeholder="${escapeHtml(v.ph||"")}">`;
      }
      wrapV.innerHTML = `<label>${vraag ? "❓ " : ""}${escapeHtml(v.label)}${e.aiVelden.has(v.key) ? ` <span class="mbib-aitag">AI</span>` : ""}</label>${inp}`;
      form.appendChild(wrapV);
    });
    form.querySelectorAll("[data-veld]").forEach(inp=>{
      inp.addEventListener("change", ()=>{
        const k = inp.dataset.veld;
        const oudPolen = r.polen;
        r[k] = inp.value;
        e.aiVelden.delete(k);
        if(k==="polen" && (!Number(r.breedte) || Number(r.breedte)===bibBreedteVoorPolen(oudPolen))) r.breedte = bibBreedteVoorPolen(r.polen) || r.breedte;
        if(k==="categorie" || k==="polen" || k==="breedte"){ tekenForm(); tekenTekening(); }
        else { inp.closest(".mbib-veld").classList.toggle("vraag", inp.value==="" && !BIB_VELDEN.find(v=>v.key===k).optioneel); inp.closest(".mbib-veld").classList.remove("ai"); tekenVragen(); }
      });
    });
    tekenVragen();
  }
  function tekenVragen(){
    const z = B(".mbib-vragen");
    const open = BIB_VELDEN.filter(v=> bibVeldRelevant(v, r.categorie) && !v.optioneel && (r[v.key]==null || String(r[v.key])===""));
    const items = [];
    if(open.length) items.push(`<div class="mbib-vraagkop">${open.length} vraag/vragen open: ${open.map(v=> escapeHtml(v.label.replace(/ \(.*\)$/, "").toLowerCase())).join(", ")}</div>`);
    e.aiVragen.forEach(q=> items.push(`<div class="mbib-vraag-ai">🤖 ${escapeHtml(q)}</div>`));
    if(!e.klemmen.length) items.push(`<div class="mbib-vraag-ai">Nog geen aansluitklemmen aangeduid.</div>`);
    z.innerHTML = items.length ? items.join("") : `<div class="mbib-vraag-ok">✅ Alle gegevens ingevuld.</div>`;
  }

  B(".mbib-bewaar").addEventListener("click", async ()=>{
    leesForm();
    if(!r.categorie){ alert("Kies eerst de soort module."); return; }
    const naam = (r.naam||"").trim() || bibAutoNaam(r);
    if(!naam){ alert("Geef de module een naam (of vul merk/artikelnummer in)."); return; }
    const knop = B(".mbib-bewaar");
    knop.disabled = true; ctx.bezig = true; knop.textContent = "Bewaren…";
    try{
      let url = r.tekening_url || null;
      if(e.tekening && /^data:/.test(e.tekening)){
        const blob = dataUrlNaarBlob(e.tekening);
        const ext = blob.type==="image/png" ? "png" : "jpg";
        const bestandsnaam = naam.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 60) + "." + ext;
        url = await window.dbUploadModuleTekening(new File([blob], bestandsnaam, {type: blob.type}));
      } else if(!e.tekening){
        url = null;
      }
      const row = {
        id: r.id || undefined, naam, merk: (r.merk||"").trim(), artikelnr: (r.artikelnr||"").trim(), categorie: r.categorie,
        polen: r.polen||"", stroom: r.stroom||"", curve: r.curve||"", kortsluit: r.kortsluit||"", gevoeligheid: r.gevoeligheid||"",
        diff_type: r.diff_type||"", breedte: Number(r.breedte) || bibBreedteVoorPolen(r.polen) || 1, info: r.info||"",
        klemmen: klemmenOpslaanVorm(e.klemmen),
        tekening_url: url, specs: Object.assign({}, r.specs||{}, {weergave: weergaveOpslaanVorm(e.weergave)}, e.aiVelden.size ? {ai_velden: [...e.aiVelden]} : {})
      };
      const opgeslagen = await window.dbSaveModule(row);
      await laadModuleBib(true);
      ctx.bezig = false;
      toast("Module bewaard in de bibliotheek");
      if(ctx.opts.kies){ ctx.opts.kies(opgeslagen); ctx.sluit(); }
      else toonBibLijst(ctx);
    }catch(err){
      const msg = String(err && err.message || err);
      alert(/duplicate|unique/i.test(msg) ? `Er bestaat al een module met de naam "${naam}". Kies een andere naam.` : "Bewaren mislukt: "+msg);
      knop.disabled = false; knop.textContent = ctx.opts.kies ? "Bewaren en kiezen" : "Bewaren in bibliotheek";
    }finally{ ctx.bezig = false; }
  });

  tekenForm(); tekenTekening(); tekenKlemlijst();
  if(!bestaand && !e.klemmen.length){
    // Nieuwe module: alvast de (aangepaste) standaardklemmen van die soort als vertrekpunt.
    const vm = bibModule();
    const sj = sjabloonVoor(vm);
    e.klemmen = ((sj && sj.klemmen && sj.klemmen.length) ? sj.klemmen : standaardKlemmen(vm)).map(k=>({...k}));
    if(sj && sj.weergave) Object.assign(e.weergave, sj.weergave);
    tekenTekening(); tekenVragen();
  }
}

/* ---------- rijgklemmen in het ontwerp ---------- */
function rijgklemmenZonderModule(){
  const items = (state.interlex && state.interlex.items) || [];
  const geplaatst = new Set();
  state.zekeringen.kasten.forEach(k=> k.rijen.forEach(r=> r.items.forEach(m=>{
    if(m.categorie==="Rijgklemmenmodule") (m.rijgklemKlemIds||[]).forEach(id=> geplaatst.add(id));
  })));
  return items.filter(k=> !geplaatst.has(k.id));
}
// Zet de gegeven rijgklemmen op rijgklemmenmodule(s) in de kast (laatste rij als er plaats is,
// anders een nieuwe rij) -- zo staan ze ook in de layout, met de gewone breedteregel (7 per 2 modules).
function plaatsRijgklemmenInKast(kast, ids){
  const perModule = Math.max(1, Math.floor(kast.maat*7/2));
  let n = 0;
  for(let i=0; i<ids.length; i+=perModule){
    const deel = ids.slice(i, i+perModule);
    const breedte = berekenRijgklemBreedte(deel.length);
    const mod = {id: cryptoId(), categorie: "Rijgklemmenmodule", type: "", polen: "", mA: "", A: "", breedte, naam: "Rijgklemmen",
      capaciteit: "", rijgklemKlemIds: deel, isRem: false, kabelOpKlemmen: false, kabelType: "", kabelAantal: 1};
    let rij = kast.rijen[kast.rijen.length-1];
    const gebruikt = rij ? rij.items.reduce((s2, it)=> s2 + moduleBreedte(it), 0) : kast.maat;
    if(!rij || gebruikt + breedte > kast.maat){ rij = newRij(); kast.rijen.push(rij); }
    rij.items.push(mod);
    n++;
  }
  return n;
}

/* =========================================================================
   MODULE-ONTWERPER (2026-10-28, op vraag van Peter: "ipv met tekeningen
   inladen beter de module van zelf tekenen uitbreiden, zodat alle modules
   die er nu inzitten kunnen uitgebreid en aangepast worden" -- klemmen
   verplaatsen, bijzetten, KNX-bus (bus+ / bus-) toevoegen, en de
   selecteerbare opties zelf uitbreidbaar).
   - Elke module wordt zelf getekend (vector): titel, ondertitel, kleur,
     hendel, LED -- instelbaar.
   - Klemmen: slepen (met raster), bijplaatsen, gelijk verdelen, KNX-bus /
     DALI-bus met één knop, label/functie/zijde per klem.
   - Bewaren: enkel deze module (dit project), als standaard voor alle
     modules van dat type (alle projecten), of in de bibliotheek.
   - Klemfuncties (L, N, PE, bus+, bus-, DA+, ...) zijn een uitbreidbare
     lijst met eigen draadkleur, gedeeld over alle projecten.
   Gedeelde instellingen: tabel elektro_cados_instellingen (sleutel ->
   waarde): 'klemfuncties' en 'sjabloon:<soort>[|polen]'.
   ========================================================================= */
let cadosInst = {};
let cadosInstGeladen = false;
let cadosInstPromise = null;
function laadCadosInst(force){
  if(force) cadosInstPromise = null;
  if(!cadosInstPromise){
    cadosInstPromise = (async()=>{
      try{
        if(window.dbListCadosInstellingen){
          const rows = await window.dbListCadosInstellingen();
          const m = {};
          (rows||[]).forEach(r=>{ m[r.sleutel] = r.waarde; });
          cadosInst = m;
          cadosInstGeladen = true;
        }
      }catch(e){
        console.error("CaDos-instellingen laden mislukt", e);
        cadosInstPromise = null;
        throw e;
      }
      return cadosInst;
    })();
  }
  return cadosInstPromise;
}
function laadAllesVoorUitvoering(){ return Promise.allSettled([laadModuleBib(), laadCadosInst()]); }
async function bewaarCadosInst(sleutel, waarde){
  await window.dbSaveCadosInstelling(sleutel, waarde);
  cadosInst[sleutel] = waarde;
}
async function wisCadosInst(sleutel){
  await window.dbDeleteCadosInstelling(sleutel);
  delete cadosInst[sleutel];
}

const KLEMFUNCTIES_STANDAARD = [
  {naam:"L", kleur:"Bruin"}, {naam:"L1", kleur:"Bruin"}, {naam:"L2", kleur:"Zwart"}, {naam:"L3", kleur:"Grijs"},
  {naam:"N", kleur:"Blauw"}, {naam:"PE", kleur:"Geel/groen"},
  {naam:"bus+", kleur:"Rood"}, {naam:"bus-", kleur:"Zwart"}, {naam:"DA+", kleur:"Oranje"}, {naam:"DA-", kleur:"Violet"},
  {naam:"24V+", kleur:"Rood"}, {naam:"0V", kleur:"Blauw"}, {naam:"+", kleur:"Rood"}, {naam:"-", kleur:"Blauw"},
  {naam:"in", kleur:"Bruin"}, {naam:"uit", kleur:"Bruin"}, {naam:"COM", kleur:"Grijs"}, {naam:"NO", kleur:"Grijs"}, {naam:"NC", kleur:"Grijs"},
  {naam:"contact", kleur:"Grijs"}, {naam:"andere", kleur:"Zwart"}
];
function klemFuncties(){
  const l = cadosInst.klemfuncties && Array.isArray(cadosInst.klemfuncties.lijst) ? cadosInst.klemfuncties.lijst : null;
  return (l && l.length) ? l : KLEMFUNCTIES_STANDAARD;
}
function klemFunctieKleur(f){
  const s = String(f||"").trim().toUpperCase();
  if(!s) return null;
  const x = klemFuncties().find(k=> String(k.naam).trim().toUpperCase()===s);
  return x ? x.kleur : null;
}
async function voegKlemFunctieToe(naam, kleur){
  naam = String(naam||"").trim();
  if(!naam) return null;
  const lijst = klemFuncties().slice();
  if(lijst.some(k=> k.naam.toUpperCase()===naam.toUpperCase())) return naam;
  lijst.push({naam, kleur: kleur || "Zwart"});
  try{ await bewaarCadosInst("klemfuncties", {lijst}); toast(`Klemfunctie "${naam}" toegevoegd`); }
  catch(e){ alert("Klemfunctie bewaren mislukt: "+(e.message||e)); }
  return naam;
}

/* ---------- standaardmodules (sjablonen) ---------- */
const SJABLOON_SOORTEN = ["Automaat|1P","Automaat|2P","Automaat|3P","Automaat|4P","Differentieel|2P","Differentieel|4P",
  "Centrale","Voeding","DALI","HVAC","Relais","Overig|1P"];
function sjabloonSleutel(m){
  const cat = m.categorie || "Overig";
  if(["Automaat","Differentieel","Overig"].includes(cat)) return cat + "|" + (m.polen || (cat==="Differentieel" ? "2P" : "1P"));
  return cat;
}
function sjabloonVoor(m){
  if(!m || m.categorie==="Leeg") return null;
  return cadosInst["sjabloon:" + sjabloonSleutel(m)] || null;
}
function sjabloonLabel(sl){
  const [cat, p] = sl.split("|");
  return (MODULE_CATEGORIEEN[cat] ? MODULE_CATEGORIEEN[cat].label : cat) + (p ? " " + p : "");
}
function sjabloonVoorbeeldModule(sl){
  const [cat, p] = sl.split("|");
  const preset = MODULE_CATEGORIEEN[cat] || {};
  const polen = p || "";
  const breedte = AUTO_BREEDTE_CATS.includes(cat) && cat!=="Rijgklemmenmodule" ? polenToBreedte(polen) : (preset.breedte || 1);
  return {id: "voorbeeld", categorie: cat, polen, A: "", mA: "", naam: "", type: "", breedte, uitgangen: cat==="Relais"||cat==="HVAC" ? [{},{}] : [], rijgklemKlemIds: []};
}

/* ---------- weergave (zelf getekend) ---------- */
const MODULE_KLEUREN = { wit:"#ffffff", beige:"#FBEEE0", blauw:"#EAF3F7", grijs:"#EEF0F2", groen:"#E9F4EC", geel:"#FFF7DC", antraciet:"#4a5058" };
const DOMOTICA_CATS_UV = ["Centrale","Voeding","DALI","HVAC","Relais"];
function standaardWeergave(m){
  const cat = m.categorie || "Overig";
  const elek = ["Automaat","Differentieel","Overig"].includes(cat);
  return { titel: "", ondertitel: "", kleur: cat==="Differentieel" ? "beige" : (DOMOTICA_CATS_UV.includes(cat) ? "blauw" : "wit"),
    hendel: elek, led: DOMOTICA_CATS_UV.includes(cat), foto: true };
}
function weergaveVoorModule(m){
  return Object.assign(standaardWeergave(m), (sjabloonVoor(m)||{}).weergave || {}, (m.bib && m.bib.weergave) || {}, m.weergave || {});
}
function autoTitel(m){
  const cat = m.categorie || "Overig";
  if(["Automaat","Differentieel","Overig"].includes(cat)){
    const lines = chipCompactLines(m);
    return [ (m.curve||"") + (lines.a||"").replace(/^[RH]·/, "").replace(/^—$/, ""), cat==="Differentieel" ? (m.mA||"") : "" ].filter(Boolean).join(" ");
  }
  return CAT_ABBR[cat] || "";
}
function autoOndertitel(m){
  const cat = m.categorie || "Overig";
  if(["Automaat","Differentieel","Overig"].includes(cat)) return m.polen || "";
  return m.naam || m.type || (MODULE_CATEGORIEEN[cat] ? MODULE_CATEGORIEEN[cat].label : cat);
}
// Tekent de module zelf (vector), met de linkerbovenhoek op 0,0.
function moduleVectorSvg(m, w, h, wg){
  wg = wg || weergaveVoorModule(m);
  const cat = m.categorie || "Overig";
  const elek = ["Automaat","Differentieel","Overig"].includes(cat);
  const fill = MODULE_KLEUREN[wg.kleur] || wg.kleur || "#fff";
  const donker = wg.kleur==="antraciet";
  const tekst = donker ? "#fff" : "#1d1f22", dim = donker ? "#d6d9dd" : "#6a7079";
  const maxT = Math.max(3, Math.floor(w/5.6));
  let s = `<rect x="1" y="0" width="${w-2}" height="${h}" rx="4" fill="${fill}" class="uv-mod-rand"/>`;
  s += `<rect x="3" y="2" width="${w-6}" height="20" rx="2" class="uv-klemstrook"/>`;
  s += `<rect x="3" y="${h-22}" width="${w-6}" height="20" rx="2" class="uv-klemstrook"/>`;
  if(wg.hendel) s += `<rect x="${w/2-6}" y="${h/2+12}" width="12" height="26" rx="2" class="uv-hendel"/>`;
  if(wg.led) s += `<circle cx="${w-9}" cy="31" r="3" fill="#3cb45a" stroke="#1f6e34" stroke-width="0.8"/>`;
  const titel = (wg.titel || autoTitel(m) || "").slice(0, maxT);
  const onder = (wg.ondertitel || autoOndertitel(m) || "").slice(0, maxT);
  if(titel) s += `<text x="${w/2}" y="${elek ? 40 : 64}" class="uv-spec" style="fill:${tekst}">${escapeHtml(titel)}</text>`;
  if(onder) s += `<text x="${w/2}" y="${elek ? 52 : h-34}" class="uv-spec dim" style="fill:${dim}">${escapeHtml(onder)}</text>`;
  return s;
}
function kleurHexVoorFunctie(f){
  const k = klemFunctieKleur(f);
  if(!k || k==="Wit") return null;
  return DRAAD_KLEUREN[k] || null;
}
// Kleine voorbeeldtekening (bibliotheekkaart / standaardmodules)
function miniModuleSvg(m, klemmen, wg){
  const b = Math.max(1, Math.min(8, moduleBreedte(m)||1));
  const w = b*38, h = 150;
  let s = `<svg viewBox="-2 -2 ${w+4} ${h+4}" class="mbib-thumb-svg uv-svg" style="width:${Math.min(160, w*0.62)}px">${moduleVectorSvg(m, w, h, wg)}`;
  (klemmen||[]).forEach(k=>{
    const c = kleurHexVoorFunctie(k.functie||k.label) || "#14181d";
    s += `<circle cx="${(parseFloat(k.x)||0)*w}" cy="${(parseFloat(k.y)||0)*h}" r="4.5" fill="#fff" stroke="${c}" stroke-width="2"/>`;
  });
  return s + `</svg>`;
}

/* ---------- herbruikbare klem-editor ----------
   o = { getKlemmen(), setKlemmen(v), module() -> module (voor tekening + breedte),
         weergave() -> weergave-object (wordt ter plaatse aangepast),
         tekening() -> foto-url of null, standaard() -> standaardklemmen, onChange() } */
function klemEditor(container, o){
  let sel = null, plaatsModus = false, raster = true, sleep = null;
  container.innerHTML = `
    <div class="mbib-rij ke-toolbar">
      <button type="button" class="mbib-btn ghost ke-plaats">＋ Klem plaatsen</button>
      <button type="button" class="mbib-btn ghost ke-knx" title="KNX-busaansluiting: bus+ en bus-">＋ KNX-bus</button>
      <button type="button" class="mbib-btn ghost ke-dali" title="DALI-bus: DA+ en DA-">＋ DALI-bus</button>
      <button type="button" class="mbib-btn ghost ke-vb" title="klemmen bovenaan gelijk verdelen over de breedte">⇔ Verdeel boven</button>
      <button type="button" class="mbib-btn ghost ke-vo" title="klemmen onderaan gelijk verdelen over de breedte">⇔ Verdeel onder</button>
      <button type="button" class="mbib-btn ghost ke-std">Standaardklemmen</button>
      <button type="button" class="mbib-btn ghost ke-wis">Alles wissen</button>
      <label class="ke-raster"><input type="checkbox" checked> raster</label>
    </div>
    <div class="mbib-tek-wrap"><div class="mbib-tek ke-stage"></div></div>
    <div class="ke-hint">Sleep een klem om hem te verplaatsen · tik op een klem om hem te kiezen · bovenste en onderste rij klikken vast.</div>
    <div class="ke-weergave"></div>
    <div class="ke-lijst"></div>`;
  const Q = (s)=> container.querySelector(s);
  const stage = Q(".ke-stage");
  const klemmen = ()=> o.getKlemmen();
  const breedte = ()=> Math.max(1, moduleBreedte(o.module()) || 1);
  const changed = ()=>{ if(o.onChange) o.onChange(); };
  function nieuwId(){ let n = klemmen().length + 1; while(klemmen().some(k=> k.id==="k"+n)) n++; return "k"+n; }
  function snap(k){
    k.x = Math.min(1, Math.max(0, k.x)); k.y = Math.min(1, Math.max(0, k.y));
    if(!raster) return;
    const stap = 1/(breedte()*4);
    k.x = Math.min(1 - stap/2, Math.max(stap/2, Math.round((k.x - stap/2)/stap)*stap + stap/2));
    if(k.y < 0.16) k.y = 0.06; else if(k.y > 0.84) k.y = 0.94; else k.y = Math.round(k.y/0.02)*0.02;
  }
  function vrijePlek(y, aantal){
    const stap = 1/(breedte()*4);
    const bezet = klemmen().filter(k=> Math.abs((parseFloat(k.y)||0) - y) < 0.1).map(k=> parseFloat(k.x)||0);
    const vrij = [];
    for(let x = 1 - stap/2; x > 0; x -= stap){ if(bezet.every(b=> Math.abs(b - x) > stap*0.9)) vrij.unshift(x); }
    return vrij.slice(-aantal);
  }
  function voegPaarToe(a, b, y){
    if(klemmen().some(k=> String(k.functie).toUpperCase()===a.toUpperCase())){ toast(`Er is al een ${a}-klem.`); return; }
    let plek = y > 0.16 && y < 0.84 ? (breedte() >= 2 ? [0.375, 0.625] : [0.3, 0.7]) : vrijePlek(y, 2);
    if(plek.length < 2) plek = [0.35, 0.65];
    const zijde = y < 0.5 ? "boven" : "onder";
    const ka = {id: nieuwId(), label: a, functie: a, zijde, x: plek[0], y};
    klemmen().push(ka);
    klemmen().push({id: nieuwId(), label: b, functie: b, zijde, x: plek[1], y});
    sel = ka.id; teken(); tekenLijst(); changed();
  }
  function verdeel(zijde){
    const rij = klemmen().filter(k=> zijdeVanKlem(k)===zijde).sort((a,b)=> a.x - b.x);
    rij.forEach((k, i)=>{ k.x = (i + 0.5)/rij.length; k.y = zijde==="boven" ? 0.06 : 0.94; });
    teken(); changed();
  }
  function teken(){
    const m = o.module();
    const w = breedte()*38, h = 150;
    const foto = o.tekening && o.tekening();
    stage.style.aspectRatio = foto ? "" : `${w}/${h}`;
    stage.innerHTML = foto
      ? `<img class="mbib-tek-img" src="${escapeHtml(foto)}" alt="" draggable="false">`
      : `<svg class="ke-svg uv-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${moduleVectorSvg(m, w, h, Object.assign(standaardWeergave(m), o.weergave()))}</svg>`;
    stage.classList.toggle("klemmodus", plaatsModus);
    const pb = Q(".ke-plaats");
    pb.classList.toggle("actief", plaatsModus);
    pb.textContent = plaatsModus ? "✓ Tik op de module om klemmen te plaatsen" : "＋ Klem plaatsen";
    klemmen().forEach(k=>{
      const d = document.createElement("div");
      d.className = "mbib-dot" + (sel===k.id ? " sel" : "") + (zijdeVanKlem(k)==="onder" ? " onder" : "");
      d.style.left = (k.x*100)+"%"; d.style.top = (k.y*100)+"%";
      const c = kleurHexVoorFunctie(k.functie || k.label);
      if(c) d.style.borderColor = c;
      d.dataset.id = k.id;
      d.innerHTML = `<span>${escapeHtml(String(k.label||"").slice(0,6))}</span>`;
      stage.appendChild(d);
    });
  }
  function tekenWeergave(){
    const z = Q(".ke-weergave");
    const wg = o.weergave();
    const m = o.module();
    const sw = standaardWeergave(m);
    const v = (k)=> wg[k]!==undefined ? wg[k] : sw[k];
    const heeftFoto = !!(o.fotoBeschikbaar && o.fotoBeschikbaar());
    z.innerHTML = `<div class="ke-weergave-grid">
      <div class="mbib-veld"><label>Titel op de module</label><input class="kw-titel" value="${escapeHtml(wg.titel||"")}" placeholder="${escapeHtml(autoTitel(m)||"automatisch")}"></div>
      <div class="mbib-veld"><label>Ondertitel</label><input class="kw-onder" value="${escapeHtml(wg.ondertitel||"")}" placeholder="${escapeHtml(autoOndertitel(m)||"automatisch")}"></div>
      <div class="mbib-veld"><label>Kleur</label><select class="kw-kleur">${Object.keys(MODULE_KLEUREN).map(k=>`<option value="${k}" ${v("kleur")===k?"selected":""}>${k}</option>`).join("")}</select></div>
      <div class="mbib-veld ke-vinkjes">
        <label><input type="checkbox" class="kw-hendel" ${v("hendel")?"checked":""}> hendel</label>
        <label><input type="checkbox" class="kw-led" ${v("led")?"checked":""}> LED</label>
        ${heeftFoto ? `<label><input type="checkbox" class="kw-foto" ${v("foto")!==false?"checked":""}> foto tonen</label>` : ""}
      </div></div>`;
    const upd = ()=>{ teken(); changed(); };
    z.querySelector(".kw-titel").addEventListener("input", e=>{ wg.titel = e.target.value; upd(); });
    z.querySelector(".kw-onder").addEventListener("input", e=>{ wg.ondertitel = e.target.value; upd(); });
    z.querySelector(".kw-kleur").addEventListener("change", e=>{ wg.kleur = e.target.value; upd(); });
    z.querySelector(".kw-hendel").addEventListener("change", e=>{ wg.hendel = e.target.checked; upd(); });
    z.querySelector(".kw-led").addEventListener("change", e=>{ wg.led = e.target.checked; upd(); });
    const f = z.querySelector(".kw-foto"); if(f) f.addEventListener("change", e=>{ wg.foto = e.target.checked; upd(); });
  }
  function tekenLijst(){
    const z = Q(".ke-lijst");
    z.innerHTML = "";
    if(!klemmen().length){ z.innerHTML = `<div class="mbib-hint">Nog geen klemmen. Tik "＋ Klem plaatsen" en daarna op de module, of gebruik "Standaardklemmen".</div>`; return; }
    const namen = klemFuncties().map(k=> k.naam);
    const tbl = document.createElement("table");
    tbl.className = "mbib-klemtabel";
    tbl.innerHTML = `<thead><tr><th>Label</th><th>Functie</th><th>Zijde</th><th></th></tr></thead><tbody></tbody>`;
    const tb = tbl.querySelector("tbody");
    klemmen().slice().sort((a,b)=> (zijdeVanKlem(a)===zijdeVanKlem(b) ? a.x-b.x : (zijdeVanKlem(a)==="boven" ? -1 : 1))).forEach(k=>{
      const tr = document.createElement("tr");
      if(sel===k.id) tr.className = "sel";
      const lijst = (!k.functie || namen.includes(k.functie)) ? namen : [k.functie, ...namen];
      tr.innerHTML = `<td><input class="kl-label" value="${escapeHtml(k.label||"")}" maxlength="8"></td>
        <td><select class="kl-functie">${lijst.map(f=>`<option ${f===k.functie?"selected":""}>${escapeHtml(f)}</option>`).join("")}<option value="__nieuw">＋ nieuwe functie…</option></select></td>
        <td><select class="kl-zijde"><option value="boven" ${zijdeVanKlem(k)==="boven"?"selected":""}>boven</option><option value="onder" ${zijdeVanKlem(k)==="onder"?"selected":""}>onder</option></select></td>
        <td><button type="button" class="mbib-btn ghost kl-del" title="klem verwijderen">✕</button></td>`;
      tr.addEventListener("focusin", ()=>{ if(sel!==k.id){ sel = k.id; teken(); tb.querySelectorAll("tr").forEach(x=> x.classList.toggle("sel", x===tr)); } });
      tr.querySelector(".kl-label").addEventListener("input", ev=>{ k.label = ev.target.value; const d = stage.querySelector(`.mbib-dot[data-id="${CSS.escape(k.id)}"] span`); if(d) d.textContent = k.label; changed(); });
      tr.querySelector(".kl-functie").addEventListener("change", async ev=>{
        if(ev.target.value==="__nieuw"){
          const naam = prompt("Naam van de nieuwe klemfunctie (bv. KNX+, 12V, S1):");
          if(naam){ k.functie = await voegKlemFunctieToe(naam, "Zwart") || k.functie; }
          tekenLijst(); teken(); changed(); return;
        }
        k.functie = ev.target.value; teken(); changed();
      });
      tr.querySelector(".kl-zijde").addEventListener("change", ev=>{ k.zijde = ev.target.value; k.y = ev.target.value==="boven" ? Math.min(k.y, 0.49) : Math.max(k.y, 0.51); if(raster){ k.y = ev.target.value==="boven" ? 0.06 : 0.94; } teken(); changed(); });
      tr.querySelector(".kl-del").addEventListener("click", ()=>{ o.setKlemmen(klemmen().filter(x=> x!==k)); if(sel===k.id) sel = null; teken(); tekenLijst(); changed(); });
      tb.appendChild(tr);
    });
    z.appendChild(tbl);
  }
  stage.addEventListener("pointerdown", ev=>{
    const dot = ev.target.closest(".mbib-dot");
    const rc = stage.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (ev.clientX-rc.left)/rc.width)), py = Math.min(1, Math.max(0, (ev.clientY-rc.top)/rc.height));
    if(dot){
      ev.preventDefault();
      sel = dot.dataset.id;
      sleep = {id: dot.dataset.id, moved: false};
      try{ stage.setPointerCapture(ev.pointerId); }catch(_e){}
      teken(); tekenLijst();
      return;
    }
    if(plaatsModus){
      ev.preventDefault();
      const zijde = py >= 0.5 ? "onder" : "boven";
      const k = {id: nieuwId(), label: String(klemmen().length+1), functie: "L", zijde, x: px, y: py};
      snap(k);
      klemmen().push(k);
      sel = k.id;
      teken(); tekenLijst(); changed();
    }
  });
  stage.addEventListener("pointermove", ev=>{
    if(!sleep) return;
    const k = klemmen().find(x=> x.id===sleep.id);
    if(!k) return;
    const rc = stage.getBoundingClientRect();
    k.x = (ev.clientX-rc.left)/rc.width; k.y = (ev.clientY-rc.top)/rc.height;
    snap(k);
    sleep.moved = true;
    const d = stage.querySelector(`.mbib-dot[data-id="${CSS.escape(k.id)}"]`);
    if(d){ d.style.left = (k.x*100)+"%"; d.style.top = (k.y*100)+"%"; }
  });
  const einde = ()=>{
    if(!sleep) return;
    const k = klemmen().find(x=> x.id===sleep.id);
    if(k && sleep.moved){ k.zijde = k.y >= 0.5 ? "onder" : "boven"; teken(); tekenLijst(); changed(); }
    sleep = null;
  };
  stage.addEventListener("pointerup", einde);
  stage.addEventListener("pointercancel", einde);
  Q(".ke-plaats").addEventListener("click", ()=>{ plaatsModus = !plaatsModus; teken(); });
  Q(".ke-knx").addEventListener("click", ()=> voegPaarToe("bus+", "bus-", 0.22));
  Q(".ke-dali").addEventListener("click", ()=> voegPaarToe("DA+", "DA-", 0.94));
  Q(".ke-vb").addEventListener("click", ()=> verdeel("boven"));
  Q(".ke-vo").addEventListener("click", ()=> verdeel("onder"));
  Q(".ke-std").addEventListener("click", ()=>{
    if(klemmen().length && !confirm("De huidige klemmen vervangen door de standaardklemmen?")) return;
    o.setKlemmen(o.standaard().map(k=>({...k})));
    sel = null; teken(); tekenLijst(); changed();
  });
  Q(".ke-wis").addEventListener("click", ()=>{
    if(!klemmen().length || !confirm("Alle klemmen wissen?")) return;
    o.setKlemmen([]); sel = null; teken(); tekenLijst(); changed();
  });
  Q(".ke-raster input").addEventListener("change", e=>{ raster = e.target.checked; });
  const api = { teken: ()=>{ teken(); tekenWeergave(); tekenLijst(); } };
  api.teken();
  return api;
}
function klemmenOpslaanVorm(klemmen){
  return klemmen.map(k=>({ id: String(k.id), label: String(k.label||""), functie: String(k.functie||""), zijde: zijdeVanKlem(k),
    x: Math.round((Number(k.x)||0)*10000)/10000, y: Math.round((Number(k.y)||0)*10000)/10000 }));
}
function weergaveOpslaanVorm(wg){
  const out = {};
  ["titel","ondertitel"].forEach(k=>{ if(wg[k]) out[k] = String(wg[k]); });
  ["kleur","hendel","led","foto"].forEach(k=>{ if(wg[k]!==undefined) out[k] = wg[k]; });
  return out;
}

/* ---------- ontwerper-venster ---------- */
function openModuleOntwerper(opts){
  const oud = document.getElementById("mod-ontwerper");
  if(oud) oud.remove();
  const ov = document.createElement("div");
  ov.id = "mod-ontwerper";
  ov.className = "mbib-overlay mod-ontwerper";
  let klemmen = (opts.klemmen||[]).map(k=>({...k}));
  const weergave = Object.assign({}, opts.weergave||{});
  let doel = opts.doel || (opts.doelen && opts.doelen[0] && opts.doelen[0].key);
  ov.innerHTML = `<div class="mbib-box" role="dialog" aria-modal="true" aria-label="Module tekenen">
    <div class="mbib-head"><h2>✏️ ${escapeHtml(opts.titel || "Module tekenen")}</h2><button type="button" class="mbib-btn ghost mo-sluit">Sluiten</button></div>
    <div class="mbib-body"><div class="mbib-edit">
      <div class="mbib-col mo-editor"></div>
      <div class="mbib-col">
        ${opts.uitleg ? `<p class="mbib-hint">${opts.uitleg}</p>` : ""}
        <div class="mbib-stap"><strong>Waar bewaren?</strong></div>
        <div class="mo-doelen">${(opts.doelen||[]).map(d=>`<label class="mo-doel"><input type="radio" name="mo-doel" value="${d.key}" ${d.key===doel?"checked":""}> <span>${escapeHtml(d.label)}${d.uitleg?`<small>${escapeHtml(d.uitleg)}</small>`:""}</span></label>${d.naam?`<input class="mo-naam" data-voor="${d.key}" placeholder="Naam bibliotheekmodule, bv. MDT AKS-0816.03" style="${d.key===doel?"":"display:none;"}">`:""}`).join("")}</div>
        <div class="mbib-acties">
          ${opts.herstel ? `<button type="button" class="mbib-btn ghost mo-herstel">${escapeHtml(opts.herstel.label)}</button>` : ""}
          <button type="button" class="mbib-btn ghost mo-annuleer">Annuleren</button>
          <button type="button" class="mbib-btn primary mo-bewaar">Bewaren</button>
        </div>
      </div>
    </div></div></div>`;
  document.body.appendChild(ov);
  const sluit = ()=>{ ov.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e)=>{ if(e.key==="Escape") sluit(); };
  document.addEventListener("keydown", onKey);
  ov.querySelector(".mo-sluit").addEventListener("click", sluit);
  ov.querySelector(".mo-annuleer").addEventListener("click", sluit);
  ov.querySelectorAll('input[name="mo-doel"]').forEach(r=> r.addEventListener("change", ()=>{
    doel = r.value;
    ov.querySelectorAll(".mo-naam").forEach(n=> n.style.display = n.dataset.voor===doel ? "" : "none");
  }));
  klemEditor(ov.querySelector(".mo-editor"), {
    getKlemmen: ()=> klemmen, setKlemmen: (v)=>{ klemmen = v; },
    module: opts.module, weergave: ()=> weergave,
    tekening: ()=> (opts.tekening && weergave.foto !== false) ? opts.tekening : null,
    fotoBeschikbaar: ()=> !!opts.tekening,
    standaard: opts.standaard || (()=> standaardKlemmen(opts.module()))
  });
  if(opts.herstel) ov.querySelector(".mo-herstel").addEventListener("click", async ()=>{
    if(!confirm(opts.herstel.vraag || "Terug naar de standaard?")) return;
    try{ await opts.herstel.fn(); sluit(); }catch(e){ alert("Mislukt: "+(e.message||e)); }
  });
  ov.querySelector(".mo-bewaar").addEventListener("click", async ()=>{
    const knop = ov.querySelector(".mo-bewaar");
    const naamInp = ov.querySelector(`.mo-naam[data-voor="${doel}"]`);
    const extra = { naam: naamInp ? naamInp.value.trim() : "" };
    if(naamInp && !extra.naam){ alert("Geef de bibliotheekmodule een naam."); naamInp.focus(); return; }
    knop.disabled = true; knop.textContent = "Bewaren…";
    try{
      await opts.onOpslaan(klemmenOpslaanVorm(klemmen), weergaveOpslaanVorm(weergave), doel, extra);
      sluit();
      toast("Module bewaard");
    }catch(e){
      const msg = String(e && e.message || e);
      alert(/duplicate|unique/i.test(msg) ? `Er bestaat al een bibliotheekmodule met de naam "${extra.naam}".` : "Bewaren mislukt: "+msg);
      knop.disabled = false; knop.textContent = "Bewaren";
    }
  });
}

// Ontwerper voor één module uit een kast (Uitvoeringsplan of Layout).
async function openModuleOntwerperVoorModule(m, naOpslaan){
  await laadAllesVoorUitvoering();
  const codes = computeZekeringCodes();
  const sl = sjabloonSleutel(m);
  const label = MODULE_CATEGORIEEN[m.categorie] ? MODULE_CATEGORIEEN[m.categorie].label : m.categorie;
  const doelen = [
    {key: "eigen", label: "Enkel deze module (dit project)"},
    {key: "sjabloon", label: `Standaard voor alle "${sjabloonLabel(sl)}"-modules`, uitleg: "geldt voor alle projecten, voor modules zonder eigen aanpassing of bibliotheekmodule"},
  ];
  if(m.bibId && m.bib) doelen.push({key: "bib", label: `Bibliotheekmodule "${m.bib.naam}" bijwerken`, uitleg: "geldt voor elke module die eraan gekoppeld is"});
  doelen.push({key: "nieuwbib", label: "Als nieuwe bibliotheekmodule bewaren", naam: true, uitleg: "en deze module eraan koppelen"});
  const eigen = Array.isArray(m.klemmenEigen) || !!m.weergave;
  openModuleOntwerper({
    titel: `${codes[m.id] ? codes[m.id]+" · " : ""}${label} — tekening & klemmen`,
    uitleg: "Pas de tekening en de aansluitklemmen aan. De breedte volgt uit de layout. Draden naar klemmen die je verwijdert, verdwijnen mee.",
    module: ()=> m,
    klemmen: klemmenVoorModule(m),
    weergave: Object.assign({}, (sjabloonVoor(m)||{}).weergave || {}, (m.bib && m.bib.weergave) || {}, m.weergave || {}),
    tekening: (m.bib && m.bib.tekening_url) || null,
    standaard: ()=> standaardKlemmen(m),
    doelen, doel: "eigen",
    herstel: eigen ? {label: "Eigen aanpassing wissen", vraag: "De eigen aanpassing van deze module wissen? Ze volgt dan weer de bibliotheek / standaard.", fn: async ()=>{ delete m.klemmenEigen; delete m.weergave; save(); if(naOpslaan) naOpslaan(); }} : null,
    onOpslaan: async (klemmen, weergave, doel, extra)=>{
      if(doel==="eigen"){ m.klemmenEigen = klemmen; m.weergave = weergave; }
      else if(doel==="sjabloon"){ await bewaarCadosInst("sjabloon:"+sl, {klemmen, weergave}); delete m.klemmenEigen; delete m.weergave; }
      else if(doel==="bib"){
        await laadModuleBib(true);
        const row = moduleBib.find(r=> String(r.id)===String(m.bibId));
        if(!row) throw new Error("Bibliotheekmodule niet meer gevonden");
        const upd = await window.dbSaveModule(Object.assign({}, row, {klemmen, specs: Object.assign({}, row.specs||{}, {weergave})}));
        await laadModuleBib(true);
        m.bib = bibSnapshot(upd || Object.assign({}, row, {klemmen, specs: Object.assign({}, row.specs||{}, {weergave})}));
        delete m.klemmenEigen; delete m.weergave;
      } else if(doel==="nieuwbib"){
        const row = await window.dbSaveModule({
          naam: extra.naam, merk: "", artikelnr: "", categorie: m.categorie, polen: m.polen||"",
          stroom: m.A ? String(parseFloat(m.A)||"") : "", curve: m.curve||"", kortsluit: m.kA||"",
          gevoeligheid: m.mA ? String(parseFloat(m.mA)||"") : "", diff_type: m.diffType||"",
          breedte: moduleBreedte(m)||1, info: "", klemmen, tekening_url: null, specs: {weergave}
        });
        await laadModuleBib(true);
        applyBibOpModule(m, row, {behoudLayout: true});
        delete m.klemmenEigen; delete m.weergave;
      }
      save();
      if(naOpslaan) naOpslaan();
    }
  });
}

/* ---------- tabbladen in de modulebibliotheek ---------- */
function bibTabsHtml(ctx){
  const t = ctx.tab || "modules";
  return `<div class="mbib-tabs">
    <button type="button" class="mbib-tab ${t==="modules"?"actief":""}" data-tab="modules">Bibliotheek</button>
    <button type="button" class="mbib-tab ${t==="sjablonen"?"actief":""}" data-tab="sjablonen">Standaardmodules</button>
    <button type="button" class="mbib-tab ${t==="functies"?"actief":""}" data-tab="functies">Klemfuncties</button>
  </div>`;
}
function wireBibTabs(ctx){
  ctx.body.querySelectorAll(".mbib-tab").forEach(b=> b.addEventListener("click", ()=>{
    ctx.tab = b.dataset.tab;
    if(ctx.tab==="sjablonen") toonSjablonen(ctx);
    else if(ctx.tab==="functies") toonKlemfuncties(ctx);
    else toonBibLijst(ctx);
  }));
}
async function toonSjablonen(ctx){
  ctx.tab = "sjablonen";
  ctx.body.innerHTML = bibTabsHtml(ctx) + `<p class="mbib-hint">Zo worden de modules getekend die (nog) niet aan een bibliotheekmodule gekoppeld zijn — in alle projecten. Pas klemmen en tekening aan per soort; een module kan daarnaast nog zijn eigen aanpassing krijgen in het Uitvoeringsplan.</p><div class="mbib-grid"><div class="mbib-leeg">Laden…</div></div>`;
  wireBibTabs(ctx);
  try{ await laadCadosInst(true); }catch(e){ ctx.body.querySelector(".mbib-grid").innerHTML = `<div class="mbib-leeg mbib-fout">Kon de instellingen niet laden: ${escapeHtml(e.message||String(e))}</div>`; return; }
  const grid = ctx.body.querySelector(".mbib-grid");
  grid.innerHTML = "";
  SJABLOON_SOORTEN.forEach(sl=>{
    const m = sjabloonVoorbeeldModule(sl);
    const sj = cadosInst["sjabloon:"+sl];
    const klemmen = sj && Array.isArray(sj.klemmen) && sj.klemmen.length ? sj.klemmen : standaardKlemmen(m);
    const wg = Object.assign(standaardWeergave(m), (sj && sj.weergave) || {});
    const card = document.createElement("div");
    card.className = "mbib-card";
    card.innerHTML = `<div class="mbib-thumb">${miniModuleSvg(m, klemmen, wg)}</div>
      <div class="mbib-card-body"><div class="mbib-card-naam">${escapeHtml(sjabloonLabel(sl))}</div>
      <div class="mbib-card-spec">${klemmen.length} klemmen${sj ? ' · <strong class="mbib-aangepast">aangepast</strong>' : " · standaard"}</div>
      <div class="mbib-card-acties"><button type="button" class="mbib-btn primary sj-edit">Aanpassen</button>
      ${sj ? `<button type="button" class="mbib-btn ghost sj-reset">Standaard herstellen</button>` : ""}</div></div>`;
    card.querySelector(".sj-edit").addEventListener("click", ()=> openModuleOntwerper({
      titel: `Standaardmodule — ${sjabloonLabel(sl)}`,
      uitleg: "Dit wordt de tekening en klemindeling voor elke module van deze soort zonder bibliotheekmodule of eigen aanpassing, in alle projecten.",
      module: ()=> m, klemmen, weergave: Object.assign({}, (sj && sj.weergave) || {}),
      standaard: ()=> standaardKlemmen(m),
      doelen: [{key: "sjabloon", label: `Standaard voor alle "${sjabloonLabel(sl)}"-modules (alle projecten)`}], doel: "sjabloon",
      onOpslaan: async (kl, wg2)=>{ await bewaarCadosInst("sjabloon:"+sl, {klemmen: kl, weergave: wg2}); toonSjablonen(ctx); }
    }));
    const rs = card.querySelector(".sj-reset");
    if(rs) rs.addEventListener("click", async ()=>{
      if(!confirm(`De aanpassing van "${sjabloonLabel(sl)}" wissen en terug naar de ingebouwde standaard?`)) return;
      try{ await wisCadosInst("sjabloon:"+sl); toonSjablonen(ctx); }catch(e){ alert("Mislukt: "+(e.message||e)); }
    });
    grid.appendChild(card);
  });
}
async function toonKlemfuncties(ctx){
  ctx.tab = "functies";
  ctx.body.innerHTML = bibTabsHtml(ctx) + `<p class="mbib-hint">De functies die je aan een aansluitklem kan geven (gedeeld over alle projecten). De kleur is de standaard draadkleur als je een draad vanaf zo'n klem trekt.</p><div class="kf-zone">Laden…</div>`;
  wireBibTabs(ctx);
  try{ await laadCadosInst(true); }catch(e){ ctx.body.querySelector(".kf-zone").innerHTML = `<div class="mbib-leeg mbib-fout">Kon de instellingen niet laden: ${escapeHtml(e.message||String(e))}</div>`; return; }
  let lijst = klemFuncties().map(k=>({...k}));
  const zone = ctx.body.querySelector(".kf-zone");
  function teken(){
    zone.innerHTML = `<table class="mbib-klemtabel kf-tabel"><thead><tr><th>Functie</th><th>Draadkleur</th><th></th></tr></thead><tbody></tbody></table>
      <div class="mbib-acties" style="justify-content:space-between;">
        <span><button type="button" class="mbib-btn ghost kf-add">＋ Functie toevoegen</button>
        <button type="button" class="mbib-btn ghost kf-std">Standaardlijst herstellen</button></span>
        <button type="button" class="mbib-btn primary kf-bewaar">Bewaren</button>
      </div>`;
    const tb = zone.querySelector("tbody");
    lijst.forEach((k, i)=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><input class="kf-naam" value="${escapeHtml(k.naam)}" maxlength="12"></td>
        <td><span class="kf-staal" style="background:${DRAAD_KLEUREN[k.kleur]||"#999"}"></span><select class="kf-kleur">${Object.keys(DRAAD_KLEUREN).map(c=>`<option ${c===k.kleur?"selected":""}>${c}</option>`).join("")}</select></td>
        <td style="white-space:nowrap;"><button type="button" class="mbib-btn ghost kf-op" title="omhoog" ${i===0?"disabled":""}>▲</button><button type="button" class="mbib-btn ghost kf-neer" title="omlaag" ${i===lijst.length-1?"disabled":""}>▼</button><button type="button" class="mbib-btn ghost kf-del" title="verwijderen">✕</button></td>`;
      tr.querySelector(".kf-naam").addEventListener("input", e=>{ k.naam = e.target.value; });
      tr.querySelector(".kf-kleur").addEventListener("change", e=>{ k.kleur = e.target.value; tr.querySelector(".kf-staal").style.background = DRAAD_KLEUREN[k.kleur]; });
      tr.querySelector(".kf-op").addEventListener("click", ()=>{ lijst.splice(i-1, 0, lijst.splice(i, 1)[0]); teken(); });
      tr.querySelector(".kf-neer").addEventListener("click", ()=>{ lijst.splice(i+1, 0, lijst.splice(i, 1)[0]); teken(); });
      tr.querySelector(".kf-del").addEventListener("click", ()=>{ lijst.splice(i, 1); teken(); });
      tb.appendChild(tr);
    });
    zone.querySelector(".kf-add").addEventListener("click", ()=>{ lijst.push({naam: "", kleur: "Zwart"}); teken(); const ins = zone.querySelectorAll(".kf-naam"); ins[ins.length-1].focus(); });
    zone.querySelector(".kf-std").addEventListener("click", ()=>{ if(confirm("De lijst terugzetten naar de standaardlijst? (pas na Bewaren definitief)")){ lijst = KLEMFUNCTIES_STANDAARD.map(k=>({...k})); teken(); } });
    zone.querySelector(".kf-bewaar").addEventListener("click", async ()=>{
      const schoon = [];
      lijst.forEach(k=>{ const n = String(k.naam||"").trim(); if(n && !schoon.some(x=> x.naam.toUpperCase()===n.toUpperCase())) schoon.push({naam: n, kleur: k.kleur||"Zwart"}); });
      try{ await bewaarCadosInst("klemfuncties", {lijst: schoon}); lijst = schoon.map(k=>({...k})); teken(); toast("Klemfuncties bewaard"); }
      catch(e){ alert("Bewaren mislukt: "+(e.message||e)); }
    });
  }
  teken();
}
