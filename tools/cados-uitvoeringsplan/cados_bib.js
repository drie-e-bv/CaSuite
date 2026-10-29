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
    const indeling = rijgklemIndeling(m);
    ids.forEach((kid, i)=>{
      const idx = items.findIndex(k=> k.id===kid);
      const klem = items[idx] || {};
      const nr = idx >= 0 ? String(idx+1) : "?";
      const niveaus = dubbel ? [klem.onder||{}, klem.boven||{}] : [klem.onder||{}];
      niveaus.forEach((ader, nv)=>{
        const x = indeling.xs[i] + (dubbel ? (nv ? 0.17 : -0.17)/indeling.eenheden : 0);
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
  if(!cadosInstGeladen) laadCadosInst().catch(()=>{});
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
  if(!cadosInstGeladen) laadCadosInst().catch(()=>{});
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
let uvSelExtra = null;            // bv. "koker:V1" in de driverkast
let uvKamType = "1P+N", uvKamModus = false;
let uvLaatsteOmzet = null;        // rapport van de laatste automatische omzetting (per kast-id)

function uvKlemKey(mid, kid){ return mid+"|"+kid; }
function uvAlleModules(kast){ const f = []; kast.rijen.forEach(r=> r.items.forEach(m=> f.push(m))); return f; }

// Houdt de kopie van de bibliotheekgegevens (tekening/klemmen) in het project
// gelijk met de bibliotheek zelf, en ruimt draden op die naar een niet meer
// bestaande module of klem verwijzen (bv. na verwijderen of polen wijzigen).
function uvSyncEnOpruimen(kast){
  if(!Array.isArray(kast.bedrading)) kast.bedrading = [];
  let gewijzigd = false;
  if(!kast._dk && autoZekeringKlemmen()) gewijzigd = true;
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
    // draden met "kleur volgt klem" volgen de (eventueel gewijzigde) klemkleur
    const klemVan = {};
    mods.forEach(m=> klemmenVoorModule(m).forEach(k=>{ klemVan[uvKlemKey(m.id, k.id)] = k; }));
    const modVan = {};
    mods.forEach(m=>{ modVan[m.id] = m; });
    kast.bedrading.forEach(w=>{
      if(!w.sectieAuto) return;
      const ns = uvSectieVoorKlemmen(modVan[w.a.m], klemVan[uvKlemKey(w.a.m, w.a.k)], modVan[w.b.m], klemVan[uvKlemKey(w.b.m, w.b.k)]);
      if(ns && ns !== String(w.sectie)){ w.sectie = ns; gewijzigd = true; }
    });
    kast.bedrading.forEach(w=>{
      if(!w.kleurAuto) return;
      const nk = draadKleurVoorKlemmen(klemVan[uvKlemKey(w.a.m, w.a.k)], klemVan[uvKlemKey(w.b.m, w.b.k)]);
      if(nk && nk !== w.kleur){ w.kleur = nk; gewijzigd = true; }
    });
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

// Geometrie met goten OP MAAT: elke goot (boven/tussen/onder de rijen) is zo hoog als nodig voor
// de kamgeleider en het aantal draden dat erin loopt; een lege goot blijft smal.
const UV_BAAN = 7, UV_MAX_BANEN = 20, UV_ZIJBAAN = 7;
/* Zijgoot-weergave (2026-10-29, Peter: "functie om de zijdraden compact te maken, bij grote kasten kan
   dit anders nogal breed worden — voor weergave of afdruk"): uitgespreid (elke draad een eigen baan
   van 7), compact (dicht tegen elkaar) of gebundeld (alle draden samen in één bundel, met het aantal).
   Geldt voor het scherm én de PDF-export; per gebruiker onthouden. */
const UV_ZIJ_MODI = {uit: {label: "uitgespreid", stap: UV_ZIJBAAN}, compact: {label: "compact", stap: 2.6}, bundel: {label: "gebundeld", stap: 0}};
let uvZijModus = (()=>{ try{ const v = localStorage.getItem("cados_uv_zijgoot"); return UV_ZIJ_MODI[v] ? v : "uit"; }catch(_e){ return "uit"; } })();
function uvZetZijModus(v){ uvZijModus = UV_ZIJ_MODI[v] ? v : "uit"; try{ localStorage.setItem("cados_uv_zijgoot", uvZijModus); }catch(_e){} }
function uvZijStap(){ return (UV_ZIJ_MODI[uvZijModus] || UV_ZIJ_MODI.uit).stap; }
// Breedte/hoogte van een module in px: zekeringkast = modulebreedte x UV.MW / UV.MH; de driverkast
// geeft eigen maten mee (_wPx/_hPx, op schaal in mm) en een tussenruimte ervoor (_gapPx).
function uvModW(m){ return m._wPx !== undefined ? m._wPx : moduleBreedte(m)*UV.MW; }
function uvModH(m){ return m._hPx !== undefined ? m._hPx : UV.MH; }
function uvKastBreedtePx(kast){ return kast._breedtePx !== undefined ? kast._breedtePx : kast.maat*UV.MW; }
function uvGeometrie(kast){
  if(kast._geometrie) return kast._geometrie(kast);   // bv. de driverkast: eigen indeling met kokers
  const codes = kast._codes || computeZekeringCodes();
  const nC = kast.rijen.length + 1;
  const breedtePx = uvKastBreedtePx(kast);
  // per rij: x van elke module (px vanaf de linkerrand van de kast) en de rijhoogte
  const rijH = kast.rijen.map(rij=> Math.max(kast._dk ? 40 : UV.MH, ...rij.items.map(m=> uvModW(m) > 0 ? uvModH(m) : 0)));
  const xRel = {};
  kast.rijen.forEach(rij=>{
    let x = 0, slot = 0;
    rij.items.forEach(m=>{
      x += m._gapPx || 0;
      xRel[m.id] = {x, slot};
      x += uvModW(m);
      slot += moduleBreedte(m);
    });
  });
  // pass 1: in welke goot komt elke draad toe (zijde van de klem + rij van de module)
  const zijdeVan = {}, rijVanMod = {}, xVan = {};
  kast.rijen.forEach((rij, ri)=>{
    rij.items.forEach(m=>{
      rijVanMod[m.id] = ri;
      const w = uvModW(m);
      const x0 = UV.PADX + xRel[m.id].x;
      if(m.categorie!=="Leeg" && w > 0) klemmenVoorModule(m).forEach(k=>{
        const key = uvKlemKey(m.id, k.id);
        zijdeVan[key] = zijdeVanKlem(k);
        xVan[key] = x0 + (parseFloat(k.x)||0)*w;
      });
    });
  });
  const gootVan = (e)=>{ const z = zijdeVan[uvKlemKey(e.m, e.k)], ri = rijVanMod[e.m]; return (z===undefined || ri===undefined) ? null : (z==="boven" ? ri : ri+1); };
  const plan = uvBaanPlan(kast, gootVan, (e)=> xVan[uvKlemKey(e.m, e.k)], (e)=> zijdeVan[uvKlemKey(e.m, e.k)], nC, UV.PADX*2 + breedtePx);
  const banen = plan.banen;
  // zijgoten links/rechts zo breed als nodig: elke draad tussen de rijen een eigen baan van UV_ZIJBAAN
  const zs = uvZijStap();
  const padL = Math.max(UV.PADX, 40 + plan.zijN.L*zs), padR = Math.max(UV.PADX, 40 + plan.zijN.R*zs);
  const width = padL + breedtePx + padR;
  const kamBand = new Array(nC).fill(0);
  (kast.kamgeleiders||[]).forEach(k=>{
    const ri = kast.rijen.findIndex(r=> r.id===k.rijId);
    if(ri < 0) return;
    const g = (KAM_TYPES[k.type] || KAM_TYPES["1P+N"]).g.length;
    kamBand[ri+1] = Math.max(kamBand[ri+1], 22 + g*6);
  });
  const hoogte = banen.map((n, c)=> Math.max(c===0 || c===nC-1 ? 20 : 26, kamBand[c] + (n ? 12 + Math.min(n, UV_MAX_BANEN)*UV_BAAN + 4 : 14)));
  const gootTop = [], rijY = [];
  let yy = 0;
  for(let c=0; c<nC; c++){ gootTop[c] = yy; yy += hoogte[c]; if(c < kast.rijen.length){ rijY[c] = yy; yy += rijH[c]; } }
  const mods = [];
  const klemPos = {};
  kast.rijen.forEach((rij, ri)=>{
    rij.items.forEach(m=>{
      const w = uvModW(m), h = uvModH(m);
      if(w <= 0) return;
      const x = padL + xRel[m.id].x;
      // modules onderaan uitgelijnd in hun rij (drivers van verschillende lengte: klemmen bij de goot)
      const y = rij._uitlijn==="boven" ? rijY[ri] : rijY[ri] + rijH[ri] - h;
      mods.push({m, x, y, w, h, ri, rijId: rij.id, slot: xRel[m.id].slot, code: codes[m.id]||""});
      if(m.categorie==="Leeg") return;
      klemmenVoorModule(m).forEach(k=>{
        klemPos[uvKlemKey(m.id, k.id)] = {
          x: x + (parseFloat(k.x)||0)*w, y: y + (parseFloat(k.y)||0)*h,
          zijde: zijdeVanKlem(k), ri, k, m, code: codes[m.id]||""
        };
      });
    });
  });
  return {mods, klemPos, width, height: yy, codes, gootTop, hoogte, kamBand, rijY, rijH, plan, padL, padR, kastR: padL + breedtePx};
}

// Orthogonale routering: uit de klem naar de bedradingsgoot boven/onder de rij, horizontaal, en zo
// naar de andere klem. Liggen de twee klemmen aan een verschillende goot, dan via de zijgoot links of
// rechts van de kast. Elke draad krijgt een eigen baan in de goot (onder de kamgeleider).
// Knikpunten van een draad worden bewaard t.o.v. de goot of rij waarin ze liggen (goot + fractie,
// of rij + afstand), zodat ze mee verschuiven als de goten groter/kleiner worden.
function uvEncodeerPunt(p, geo){
  if(geo._absoluut) return {ax: Math.round(p.x*10)/10, ay: Math.round(p.y*10)/10};
  const x = Math.round((p.x - (geo.padL || UV.PADX))*10)/10;
  for(let c=0; c<geo.hoogte.length; c++){
    const t = geo.gootTop[c], h = geo.hoogte[c];
    if(p.y >= t - 0.01 && p.y <= t + h + 0.01) return {xr: x, g: c, f: Math.round((p.y - t)/h*1000)/1000};
  }
  for(let r=0; r<geo.rijY.length; r++){
    const t = geo.rijY[r];
    if(p.y >= t && p.y <= t + (geo.rijH ? geo.rijH[r] : UV.MH)) return {xr: x, r, dy: Math.round((p.y - t)*10)/10};
  }
  return {xr: x, g: geo.hoogte.length-1, f: 1};
}
function uvDecodeerPunt(q, geo){
  if(q.ax !== undefined) return {x: q.ax, y: q.ay};
  const x = q.xr !== undefined ? (geo.padL || UV.PADX) + q.xr : q.x - UV.PADX + (geo.padL || UV.PADX);
  if(q.g !== undefined && geo.gootTop[q.g] !== undefined) return {x, y: geo.gootTop[q.g] + q.f*geo.hoogte[q.g]};
  if(q.r !== undefined && geo.rijY[q.r] !== undefined) return {x, y: geo.rijY[q.r] + q.dy};
  return {x, y: q.y || 0};
}
function uvVereenvoudig(v){
  const out = [];
  v.forEach(p=>{
    const l = out[out.length-1];
    if(l && Math.abs(l.x - p.x) < 0.01 && Math.abs(l.y - p.y) < 0.01) return;
    out.push({x: p.x, y: p.y});
  });
  for(let i=out.length-2; i>=1; i--){
    const a = out[i-1], b = out[i], c = out[i+1];
    if((Math.abs(a.x-b.x) < 0.01 && Math.abs(b.x-c.x) < 0.01) || (Math.abs(a.y-b.y) < 0.01 && Math.abs(b.y-c.y) < 0.01)) out.splice(i, 1);
  }
  return out;
}
// Haakse lijn door de knikpunten: uit de beginklem eerst verticaal, in de eindklem verticaal binnen.
function uvVertsVoor(A, B, punten){
  const pts = [{x: A.x, y: A.y}, ...punten, {x: B.x, y: B.y}];
  const v = [pts[0]];
  for(let i=1; i<pts.length; i++){
    const P = v[v.length-1], Q = pts[i];
    if(Math.abs(P.x - Q.x) < 0.01 || Math.abs(P.y - Q.y) < 0.01){ v.push(Q); continue; }
    if(i===1 && pts.length > 2) v.push({x: P.x, y: Q.y});
    else v.push({x: Q.x, y: P.y});
    v.push(Q);
  }
  return uvVereenvoudig(v);
}
function uvPad(v){ return "M" + v.map(p=> `${Math.round(p.x*10)/10} ${Math.round(p.y*10)/10}`).join(" L"); }
// Orthogonale routering: zonder knikpunten automatisch (uit de klem naar de goot boven/onder de rij,
// horizontaal, en zo naar de andere klem; via de zijgoot als het een andere goot is), met knikpunten
// haaks door die punten. Elke automatische draad krijgt een eigen baan in de goot.
/* Banenplan (2026-10-29, op vraag van Peter: "manier om duidelijk de verschillende lijnen uit te volgen
   ... helft links en helft rechts van de kast? vanaf midden draait het om?").
   - Draden tussen twee goten (= tussen de rijen) gaan via de zijgoot aan de kant van de kast waar ze
     zitten: linkerhelft links, rechterhelft rechts.
   - In de zijgoot liggen ze genest: de draad die het dichtst bij de rand vertrekt, ligt het dichtst
     tegen de kast; zo kruisen ze elkaar zo weinig mogelijk.
   - In een goot delen draden die elkaar niet overlappen dezelfde baan (minder banen, kortere
     aftakkingen); korte verbindingen liggen het dichtst bij de modules. */
function uvBaanPlan(kast, gootVan, xVan, zijdeVanE, nC, width){
  const midden = width/2;
  const perDraad = {};
  const items = Array.from({length: nC}, ()=> []);   // per goot: {id, lo, hi, prio, eind}
  const zij = {L: [], R: []};
  (kast.bedrading||[]).forEach(w=>{
    if(Array.isArray(w.punten) && w.punten.length) return;
    const ca = gootVan(w.a), cb = gootVan(w.b);
    const xa = xVan(w.a), xb = xVan(w.b);
    if(ca===null || cb===null || xa===undefined || xb===undefined) return;
    if(ca===cb){
      items[ca].push({id: w.id, e: "ab", lo: Math.min(xa, xb), hi: Math.max(xa, xb), prio: 0, lengte: Math.abs(xa - xb)});
      return;
    }
    const kant = (xa + xb)/2 < midden ? "L" : "R";
    const afstand = kant==="L" ? (xa + xb)/2 : width - (xa + xb)/2;
    zij[kant].push({id: w.id, afstand});
    perDraad[w.id] = {kant};
    [["a", ca, xa, w.a], ["b", cb, xb, w.b]].forEach(([e, c, x, eind])=>{
      // klem in de rij ONDER de goot (zijde boven) -> dichter bij de rand = dichter bij de rij (onderaan)
      const vanOnder = zijdeVanE(eind)==="boven";
      items[c].push({id: w.id, e, lo: kant==="L" ? 0 : x, hi: kant==="L" ? x : width, prio: 1, afstand, vanOnder});
    });
  });
  // zijbanen genest: dichtst bij de rand = binnenste baan
  ["L","R"].forEach(k=> zij[k].sort((p, q)=> p.afstand - q.afstand).forEach((z, i)=>{ perDraad[z.id].zi = i; }));
  const banen = new Array(nC).fill(0);
  items.forEach((lijst, c)=>{
    // korte verbindingen in de goot eerst (bovenste banen); daarna de zijgoot-draden, genest
    const intra = lijst.filter(it=> it.prio===0).sort((p, q)=> p.lengte - q.lengte);
    const boven = lijst.filter(it=> it.prio===1 && !it.vanOnder).sort((p, q)=> p.afstand - q.afstand);
    const onder = lijst.filter(it=> it.prio===1 && it.vanOnder).sort((p, q)=> q.afstand - p.afstand);
    const rijen = [];   // per baan: bezette intervallen
    const plaats = (it)=>{
      let i = 0;
      for(; i<rijen.length; i++) if(!rijen[i].some(([lo, hi])=> it.lo < hi + 8 && it.hi > lo - 8)) break;
      if(i===rijen.length) rijen.push([]);
      rijen[i].push([it.lo, it.hi]);
      return i;
    };
    // zijgoot-draden onderling altijd in volgorde (ze overlappen elkaar aan de rand), dus nesting blijft
    [...intra, ...boven, ...onder].forEach(it=>{
      const i = plaats(it);
      perDraad[it.id] = perDraad[it.id] || {};
      perDraad[it.id]["baan_" + it.e] = i;
    });
    banen[c] = rijen.length;
  });
  return {perDraad, banen, zijN: {L: zij.L.length, R: zij.R.length}};
}
// Orthogonale routering: zonder knikpunten volgens het banenplan, met knikpunten haaks door die punten.
function uvRoutes(kast, geo){
  if(geo._router) return geo._router(kast, geo);
  const plan = geo.plan || {perDraad: {}, zijN: {L: 0, R: 0}};
  const baanY = (c, i)=> geo.gootTop[c] + geo.kamBand[c] + 12 + (i % UV_MAX_BANEN)*UV_BAAN;
  return kast.bedrading.map(w=>{
    const A = geo.klemPos[uvKlemKey(w.a.m, w.a.k)], B = geo.klemPos[uvKlemKey(w.b.m, w.b.k)];
    if(!A || !B) return null;
    const ca = A.zijde==="boven" ? A.ri : A.ri+1;
    const cb = B.zijde==="boven" ? B.ri : B.ri+1;
    const pd = plan.perDraad[w.id] || {};
    let verts, tussen = ca!==cb;
    if(Array.isArray(w.punten) && w.punten.length){
      verts = uvVertsVoor(A, B, w.punten.map(q=> uvDecodeerPunt(q, geo)));
    } else if(!tussen){
      const yc = baanY(ca, pd.baan_ab || 0);
      verts = uvVereenvoudig([{x:A.x,y:A.y},{x:A.x,y:yc},{x:B.x,y:yc},{x:B.x,y:B.y}]);
    } else {
      const ya = baanY(ca, pd.baan_a || 0), yb = baanY(cb, pd.baan_b || 0);
      const links = pd.kant ? pd.kant==="L" : (A.x + B.x)/2 < geo.width/2;
      const n = pd.zi || 0;
      const zs = uvZijStap();
      const xs = links ? (geo.padL - 16 - n*zs) : (geo.kastR + 16 + n*zs);
      verts = uvVereenvoudig([{x:A.x,y:A.y},{x:A.x,y:ya},{x:xs,y:ya},{x:xs,y:yb},{x:B.x,y:yb},{x:B.x,y:B.y}]);
    }
    return {w, A, B, verts, d: uvPad(verts), handmatig: !!(w.punten && w.punten.length), tussen};
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
    const wgT = (cat==="Rijgklemmenmodule" && (m.rijgklemKlemIds||[]).length) ? Object.assign({}, wg, {titel: wg.titel || " ", ondertitel: wg.ondertitel || " "}) : wg;
    s += `<g transform="translate(${x} ${y})">${moduleVectorSvg(m, w, h, wgT)}</g>`;
  }
  if(cat==="Rijgklemmenmodule" && (m.rijgklemKlemIds||[]).length){
    s += rijgklemGroepenSvg(m, x, y, w, h);
    const pos = rijgklemPositie(m);
    const yP = pos==="boven" ? y+34 : y+h-28, yK = pos==="boven" ? y+h-28 : y+34;
    s += `<text x="${x+w/2}" y="${yP}" class="uv-rk-zijde preflex">Preflex ${pos==="boven" ? "↑" : "↓"}</text>`;
    s += `<text x="${x+w/2}" y="${yK}" class="uv-rk-zijde">kast ${pos==="boven" ? "↓" : "↑"}</text>`;
  }
  const codeTekst = code || CAT_ABBR[cat] || "";
  if(codeTekst){
    s += `<rect x="${x+w/2-16}" y="${y+h/2-10}" width="32" height="18" rx="4" class="uv-code-bg"/>`;
    s += `<text x="${x+w/2}" y="${y+h/2+3.5}" class="uv-code">${escapeHtml(codeTekst)}</text>`;
  }
  s += `</g>`;
  return s;
}

function uvWireSvg(r, interactief, nummer, toonNummer){
  const w = r.w;
  const kleur = DRAAD_KLEUREN[w.kleur] || DRAAD_KLEUREN.Bruin;
  const bw = draadBreedte(w.sectie);
  const sel = interactief && uvSelWire===w.id;
  const tip = r.A && r.B ? `#${nummer} · ${r.A.code||""} · ${r.A.k.label||""} → ${r.B.code||""} · ${r.B.k.label||""}\n${w.kleur||""} ${w.sectie||""} mm²${w.label?" · "+w.label:""}${r.handmatig?" · eigen route":""}` : "";
  let s = `<g class="uv-draad${sel?" sel":""}${r.tussen?" tussen":""}" data-w="${w.id}" data-ka="${escapeHtml(uvKlemKey(w.a.m, w.a.k))}" data-kb="${escapeHtml(uvKlemKey(w.b.m, w.b.k))}" data-tip="${escapeHtml(tip)}">`;
  if(interactief) s += `<path d="${r.d}" class="uv-draad-hit"/>`;
  s += `<path d="${r.d}" class="uv-draad-rand" style="stroke-width:${bw+1.6}"/>`;
  s += `<path d="${r.d}" style="stroke:${kleur};stroke-width:${bw}" class="uv-draad-kern"/>`;
  if(w.kleur==="Geel/groen") s += `<path d="${r.d}" style="stroke:#f2d600;stroke-width:${bw};stroke-dasharray:7 7" class="uv-draad-kern"/>`;
  if(toonNummer){
    // draadnummer aan BEIDE uiteinden (zoals een draadmerker), vlak naast de klem op het eerste stuk
    const t = String(nummer);
    const merk = (p, q)=>{
      const l = Math.abs(q.x-p.x) + Math.abs(q.y-p.y);
      if(l < 4) return "";
      const f = Math.min(16, l*0.5)/l;
      const x = p.x + (q.x-p.x)*f, y = p.y + (q.y-p.y)*f;
      return `<rect x="${x - 3 - t.length*2.6}" y="${y-5.5}" width="${6 + t.length*5.2}" height="11" rx="3" class="uv-draadnr-bg" style="stroke:${kleur}"/><text x="${x}" y="${y+3}" class="uv-draadnr">${t}</text>`;
    };
    const v = r.verts;
    if(v.length > 1){ s += merk(v[0], v[1]) + merk(v[v.length-1], v[v.length-2]); }
  }
  s += `</g>`;
  if(sel){
    // handgrepen: draadstukken verslepen, knikpunten verslepen (dubbelklik = weg), begin/einde naar een andere klem slepen
    let h = `<g class="uv-greep">`;
    for(let i=0; i<r.verts.length-1; i++){
      const a = r.verts[i], b = r.verts[i+1];
      const binnen = i >= 1 && i+1 <= r.verts.length-2;
      h += `<path d="M${a.x} ${a.y} L${b.x} ${b.y}" class="uv-dseg${binnen?" sleepbaar":""}" data-i="${i}" data-as="${Math.abs(a.y-b.y) < 0.01 ? "h" : "v"}"/>`;
    }
    r.verts.slice(1, -1).forEach((p, i)=>{ h += `<circle cx="${p.x}" cy="${p.y}" r="4" class="uv-vtx" data-i="${i}"/>`; });
    h += `<rect x="${r.A.x-6}" y="${r.A.y-6}" width="12" height="12" rx="2" class="uv-eind" data-e="a"><title>begin naar een andere klem slepen</title></rect>`;
    h += `<rect x="${r.B.x-6}" y="${r.B.y-6}" width="12" height="12" rx="2" class="uv-eind" data-e="b"><title>einde naar een andere klem slepen</title></rect>`;
    s += h + `</g>`;
  }
  return s;
}

let uvLagen = { draden: true, tussen: true, kammen: true, labels: true, nummers: false };
function bouwBedradingSvg(kast, interactief, opts){
  const lagen = Object.assign({}, interactief ? uvLagen : { draden: true, tussen: true, kammen: true, labels: true, nummers: true }, (opts && opts.lagen) || {});
  const zichtbaar = (r)=> r.tussen ? lagen.tussen !== false : lagen.draden;
  const geo = uvGeometrie(kast);
  const routes = uvRoutes(kast, geo);
  const kammen = uvKamLayout(kast, geo);
  const verbonden = new Set();
  const opKam = new Set();
  kast.bedrading.forEach(w=>{ verbonden.add(uvKlemKey(w.a.m, w.a.k)); verbonden.add(uvKlemKey(w.b.m, w.b.k)); });
  kammen.forEach(kl=> kl.tanden.forEach(t=>{ verbonden.add(t.key); opKam.add(t.key); }));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" class="uv-svg${interactief && uvKamModus ? " kammodus" : ""}${interactief && uvSelWire ? " heeft-sel" : ""}" viewBox="0 0 ${geo.width} ${geo.height}" width="${Math.round(geo.width*(interactief?uvZoom:1))}" height="${Math.round(geo.height*(interactief?uvZoom:1))}">`;
  s += `<rect x="0" y="0" width="${geo.width}" height="${geo.height}" class="uv-achtergrond"/>`;
  // bedradingsgoten
  for(let c=0; c<=kast.rijen.length; c++){
    if(geo.hoogte[c] > 30) s += `<rect x="${geo.padL-6}" y="${geo.gootTop[c]+geo.kamBand[c]+4}" width="${geo.kastR-geo.padL+12}" height="${Math.max(6, geo.hoogte[c]-geo.kamBand[c]-10)}" rx="6" class="uv-goot"/>`;
  }
  // zijgoten links/rechts (bij compact/gebundeld duidelijk als één goot met het aantal draden)
  if(geo.plan && geo.rijY.length){
    const zs = uvZijStap();
    const y0 = geo.gootTop[0] + 4, y1 = geo.height - 4;
    [["L", geo.plan.zijN.L], ["R", geo.plan.zijN.R]].forEach(([k, n])=>{
      if(!n) return;
      const binnen = k==="L" ? geo.padL - 16 : geo.kastR + 16;
      const buiten = k==="L" ? binnen - (n-1)*zs : binnen + (n-1)*zs;
      const x = Math.min(binnen, buiten) - 6, w = Math.abs(buiten - binnen) + 12;
      s += `<rect x="${x}" y="${y0}" width="${w}" height="${y1-y0}" rx="5" class="uv-zijgoot${uvZijModus!=="uit" ? " vol" : ""}"/>`;
      if(uvZijModus!=="uit"){
        const tx = k==="L" ? x - 5 : x + w + 5, ty = (y0 + y1)/2;
        s += `<text x="${tx}" y="${ty}" class="uv-zijgoot-tel" transform="rotate(-90 ${tx} ${ty})">${n} draad${n>1?"en":""}</text>`;
      }
    });
  }
  // DIN-rails + rijnummer
  if(!geo._eigen) kast.rijen.forEach((rij, ri)=>{
    const y = geo.rijY[ri];
    const rh = geo.rijH ? geo.rijH[ri] : UV.MH;
    if(!kast._dk || rij._rail) s += `<rect x="${geo.padL-10}" y="${y+rh/2-12}" width="${uvKastBreedtePx(kast)+20}" height="24" class="uv-rail"/>`;
    s += `<text x="${geo.padL-24}" y="${y+rh/2+4}" class="uv-rijnr">${ri+1}</text>`;
  });
  if(kast._dk && kast._dkAchtergrond) s += kast._dkAchtergrond(geo);
  geo.mods.forEach(md=>{ s += md.m._dk ? dkModuleSvg(md) : uvModuleSvg(md); });
  if(lagen.kammen) kammen.forEach(kl=>{ s += uvKamSvg(kl, interactief); });
  const nrVan = {};
  kast.bedrading.forEach((w, i)=>{ nrVan[w.id] = i+1; });
  routes.filter(r=> zichtbaar(r) && !(interactief && uvSelWire===r.w.id)).forEach(r=>{ s += uvWireSvg(r, interactief, nrVan[r.w.id], lagen.nummers); });
  // klemmen bovenop
  Object.entries(geo.klemPos).forEach(([key, p])=>{
    const pend = uvPending && uvKlemKey(uvPending.m, uvPending.k)===key;
    const cls = ["uv-klem", verbonden.has(key)?"bezet":"", pend?"pending":""].filter(Boolean).join(" ");
    const ly = p.zijde==="boven" ? p.y-9 : p.y+15;
    const ktip = [`${p.code || p.m.naam || p.m.categorie} · ${p.k.uitgang ? "uitgang "+p.k.uitgang+" · " : ""}klem ${p.k.label||p.k.id} (${p.k.functie||"—"}, ${p.zijde})`, p.k.tip || "", p.m.naam || ""].filter(Boolean).join("\n");
    const kk = klemKleur(p.k);
    const kc = kk && kk!=="Wit" ? DRAAD_KLEUREN[kk] : null;
    s += `<g class="${cls}" data-m="${p.m.id}" data-k="${escapeHtml(p.k.id)}" data-tip="${escapeHtml(ktip)}">`;
    if(interactief) s += `<circle cx="${p.x}" cy="${p.y}" r="11" class="uv-klem-hit"/>`;
    s += `<circle cx="${p.x}" cy="${p.y}" r="5" class="uv-klem-dot"${kc ? ` style="stroke:${kc}"` : ""}/>`;
    if(lagen.labels && !opKam.has(key) && !p.k.geenLabel) s += `<text x="${p.x}" y="${ly}" class="uv-klem-label">${escapeHtml(String(p.k.label||"").slice(0,6))}</text>`;
    s += `</g>`;
  });
  // uitgangsnummers (bv. C1) één keer tussen de klemmen die erbij horen
  geo.mods.forEach(md=>{
    if(md.m.categorie==="Leeg" || !lagen.labels) return;
    uitgangGroepen(klemmenVoorModule(md.m)).forEach(g=>{
      const gx = md.x + (g.enkel ? g.xMax*md.w + 9 : g.x*md.w), gy = md.y + g.y*md.h + 3;
      s += `<text x="${gx}" y="${gy}" class="uv-uitgang${g.enkel?" enkel":""}">${escapeHtml(g.uitgang)}</text>`;
    });
  });
  // de geselecteerde draad bovenaan, met zijn handgrepen
  if(interactief && uvSelWire){ const r = routes.find(x=> x.w.id===uvSelWire); if(r && zichtbaar(r)) s += uvWireSvg(r, true, nrVan[r.w.id], lagen.nummers); }
  if(interactief) s += `<rect class="uv-kam-preview" x="0" y="0" width="0" height="0" style="display:none"/><rect class="uv-zoom-preview" x="0" y="0" width="0" height="0" style="display:none"/><path class="uv-draad-preview" d="" style="display:none"/>`;
  s += `</svg>`;
  return {svg: s, geo, routes};
}

function uvKlemOmschrijving(kast, eind){
  const geo = uvGeometrie(kast);
  const p = geo.klemPos[uvKlemKey(eind.m, eind.k)];
  if(!p) return "?";
  const zijde = p.k.rijgSoort ? (p.k.rijgSoort==="kast" ? "kastzijde" : "Preflex") : p.zijde;
  return `${p.code || (p.m.naam || p.m.categorie)} · ${p.k.uitgang ? p.k.uitgang+" · " : ""}${p.k.label||p.k.id} (${zijde})`;
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
    const yRij = geo.rijY[ri];
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
      kast.bedrading.push({id: cryptoId(), a, b: z, kleur: draadKleurVoorKlemmen(b, d) || standaardKleurVoorFunctie(f), kleurAuto: true, sectie, label, auto: true});
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

/* Schermindeling (2026-10-28, op vraag van Peter: "het scherm waarin we effectief werken neemt maar
   een te klein deel in ... alle modules mogen kleiner, zoom + en - (ook volledige kast cfr pdf
   reader), het bovenste deel moet weg, de knoppen naar de zijkant") + AutoCAD-achtige functies:
   draden met knikpunten (haaks), draadstukken/knikpunten/eindpunten verslepen, ongedaan maken /
   opnieuw, zoomvenster, pannen, sneltoetsen en lagen. */
let uvOrtho = true;
let uvZoomModus = "kast";     // "kast" (volledige kast) | "breedte" | "vrij"
let uvSchaal = 1;
let uvZoomVenster = false;
let uvVerplaats = null;       // {w: draad-id, e: "a"|"b"}: volgende tik op een klem = nieuw begin/einde
let uvHulpOpen = false;
const uvHistorie = {};        // kast-id -> {undo: [], redo: [], laatste: ""}
function uvKastJson(kast){ return JSON.stringify(kast); }
function uvHist(kast){ return uvHistorie[kast.id] || (uvHistorie[kast.id] = {undo: [], redo: [], laatste: uvKastJson(kast)}); }

let uvLijstOpen = false;
let uvToetsHandler = null, uvResizeHandler = null;
/* Controle bij het aansluiten (op vraag van Peter: "blauwe kabel (neuter) op een andere kleur aansluiten
   moet een foutmelding geven, maar je moet wel kunnen kiezen om toch verder te gaan").
   Soort geleider van een klem: L (L, L1-L3), N of PE, uit de klemfunctie of de aderkleur. */
function uvGeleider(k){
  if(!k) return null;
  const f = normFunctie(k.functie || k.label);
  if(f==="N") return "N";
  if(f==="PE") return "PE";
  if(/^L[123]?$/.test(f)) return "L";
  const kl = klemKleurExpliciet(k);
  if(kl==="Blauw") return "N";
  if(kl==="Geel/groen") return "PE";
  if(kl==="Bruin" || kl==="Zwart" || kl==="Grijs") return f ? null : "L";
  return null;
}
const UV_GELEIDER_NAAM = {L: "fase (L)", N: "neuter (N)", PE: "aarding (PE)"};
function uvAansluitFouten(kleur, ka, kb){
  const ga = uvGeleider(ka), gb = uvGeleider(kb);
  const uit = [];
  if(ga && gb && ga!==gb && (ga!=="L" || gb!=="L")) uit.push(`${UV_GELEIDER_NAAM[ga]} verbonden met ${UV_GELEIDER_NAAM[gb]}`);
  [ga, gb].forEach(g=>{
    if(!g) return;
    let m = null;
    if(kleur==="Blauw" && g!=="N") m = `blauwe draad (neuter) op een ${UV_GELEIDER_NAAM[g]}-klem`;
    else if(kleur==="Geel/groen" && g!=="PE") m = `geel/groene draad (aarding) op een ${UV_GELEIDER_NAAM[g]}-klem`;
    else if(g==="N" && kleur && kleur!=="Blauw") m = `${kleur.toLowerCase()} draad op een neuter (N)-klem`;
    else if(g==="PE" && kleur && kleur!=="Geel/groen") m = `${kleur.toLowerCase()} draad op een aarding (PE)-klem`;
    if(m && !uit.includes(m)) uit.push(m);
  });
  return uit;
}
function bevestigAansluiting(fouten){
  if(!fouten || !fouten.length) return true;
  return confirm("⚠ Let op — mogelijk verkeerde aansluiting:\n\n• " + fouten.join("\n• ") + "\n\nToch zo aansluiten?");
}

/* Het uitvoeringsplan is generiek: de zekeringkast (standaard) en de driverkast (UV_CTX_DK) gebruiken
   hetzelfde tekenwerk, elk met hun eigen "context" (welke kast, welke tab, eigen zijpaneel/omzetting). */
const UV_CTX_ZEK = {
  tab: "uitvoering", panelId: "panel-uitvoering", titel: "Uitvoeringsplan", zekering: true, eendraad: true, kam: true,
  kast: ()=> huidigeZekeringKast(),
  kasten: ()=> state.zekeringen.kasten.map(k=> ({id: k.id, naam: k.naam})),
  kiesKast: (id)=>{ zekeringHuidigeKastId = id; },
  layoutTab: "zekeringen", layoutTitel: "layout aanpassen op het tabblad Zekeringen",
  export: ()=> exportUitvoeringVoorWerf(true),
};
function renderUitvoeringsplan(ctxArg){
  const ctx = (ctxArg && ctxArg.tab) ? ctxArg : UV_CTX_ZEK;
  const kast = ctx.kast();
  uvSyncEnOpruimen(kast);
  const hist = uvHist(kast);
  const view = ctx.eendraad ? uvView : "bedrading";
  const bed = view==="bedrading";
  const wrap = el(`<div class="panel uv-panel" id="${ctx.panelId}">
    <div class="uv-kop">
      <strong class="uv-titel">${escapeHtml(ctx.titel)}</strong>
      <div class="uv-kasten" id="uvKastbar"></div>
      ${ctx.eendraad ? `<div class="uv-seg">
        <button class="btn small ${bed?"primary":"ghost"}" data-view="bedrading">Bedrading</button>
        <button class="btn small ${!bed?"primary":"ghost"}" data-view="eendraad">Eendraadschema</button>
      </div>` : ""}
      <span class="uv-spacer"></span>
      <div class="uv-zoom">
        ${bed ? `<button class="btn small ghost uv-undo" title="ongedaan maken (Ctrl+Z)" ${hist.undo.length?"":"disabled"}>↶</button>
        <button class="btn small ghost uv-redo" title="opnieuw (Ctrl+Y)" ${hist.redo.length?"":"disabled"}>↷</button><span class="uv-sep"></span>` : ""}
        <button class="btn small ghost uv-zoom-uit" title="uitzoomen (−)">−</button>
        <span class="uv-zoomval" title="zoom"></span>
        <button class="btn small ghost uv-zoom-in" title="inzoomen (+)">+</button>
        <button class="btn small ghost uv-zoom-kast ${uvZoomModus==="kast"?"actief":""}" title="volledige kast in beeld (F)">⤢ Kast</button>
        <button class="btn small ghost uv-zoom-breedte ${uvZoomModus==="breedte"?"actief":""}" title="passend op de breedte (W)">↔ Breedte</button>
        <button class="btn small ghost uv-zoom-venster ${uvZoomVenster?"actief":""}" title="zoomvenster: sleep een rechthoek (Z)">⬚</button>
      </div>
      <button class="btn small ghost uv-help ${uvHulpOpen?"actief":""}" title="uitleg en sneltoetsen">ⓘ</button>
    </div>
    <div class="uv-werk">
      <div class="uv-canvas-box">
        <div class="uv-canvas-wrap" id="uvCanvas"></div>
        <div id="uvBanner" class="uv-banner"></div>
        <div class="uv-status" id="uvStatus"></div>
      </div>
      <aside class="uv-side" id="uvSide">
        <div id="uvHulp" ${uvHulpOpen?"":"hidden"}></div>
        <div id="uvDetail"></div>
        <div id="uvExtra"></div>
        <div id="uvGereedschap"></div>
      </aside>
    </div>
    <div id="uvLijst"></div>
  </div>`);

  const kastbar = wrap.querySelector("#uvKastbar");
  const huidigId = ctx.huidigId ? ctx.huidigId() : kast.id;
  ctx.kasten().forEach(k=>{
    const btn = el(`<button class="btn small ${k.id===huidigId?'primary':'ghost'}">${escapeHtml(k.naam)}</button>`);
    btn.addEventListener("click", ()=>{ ctx.kiesKast(k.id); uvPending = null; uvSelWire = null; uvSelMod = null; uvSelKam = null; uvVerplaats = null; selectTab(ctx.tab); });
    kastbar.appendChild(btn);
  });
  const naarLayout = el(`<a href="#" class="uv-naar-layout" title="${escapeHtml(ctx.layoutTitel)}">layout ✎</a>`);
  naarLayout.addEventListener("click", e=>{ e.preventDefault(); selectTab(ctx.layoutTab); });
  kastbar.appendChild(naarLayout);

  const canvas = wrap.querySelector("#uvCanvas");
  const canvasBox = wrap.querySelector(".uv-canvas-box");
  const side = wrap.querySelector("#uvSide");
  const detail = wrap.querySelector("#uvDetail");
  const gereedschap = wrap.querySelector("#uvGereedschap");
  const banner = wrap.querySelector("#uvBanner");
  const status = wrap.querySelector("#uvStatus");
  const lijst = wrap.querySelector("#uvLijst");
  const hulp = wrap.querySelector("#uvHulp");
  const heeftModules = uvAlleModules(kast).some(m=> m.categorie!=="Leeg");
  let geoNu = null, routesNu = [];
  let extraHerberekenen = null;
  let huidigeSchaal = 1;

  hulp.innerHTML = `<div class="card"><div class="card-body uv-sidebody">
    <strong>Zo werkt het</strong>
    <ol class="uv-uitleg">
      <li><strong>⚡ Automatisch omzetten</strong> maakt een voorstel vanuit de layout (bibliotheek, kamgeleiders, voedingsdraden).</li>
      <li><strong>Draad</strong>: tik een klem, klik eventueel tussenpunten (haaks), tik de eindklem.</li>
      <li><strong>Draad aanpassen</strong>: tik hem aan, sleep een draadstuk of knikpunt; sleep het ▪ begin/einde naar een andere klem. Dubbelklik op een knikpunt = weg.</li>
      <li><strong>Kamgeleider</strong>: kies het type, druk K en sleep onderaan over de modules.</li>
      <li><strong>Verschuiven</strong>: sleep op een lege plek (of middelste muisknop). <strong>Zoomen</strong>: Ctrl + muiswiel, −/+, ⤢ Kast, ⬚ zoomvenster.</li>
    </ol>
    <div class="uv-sneltoetsen">
      <span><kbd>D</kbd> draad</span><span><kbd>K</kbd> kamgeleider</span><span><kbd>Esc</kbd> stoppen</span><span><kbd>Del</kbd> verwijderen</span>
      <span><kbd>⌫</kbd> laatste knikpunt</span><span><kbd>O</kbd> haaks aan/uit</span><span><kbd>F</kbd> volledige kast</span><span><kbd>W</kbd> breedte</span>
      <span><kbd>Z</kbd> zoomvenster</span><span><kbd>+</kbd>/<kbd>−</kbd> zoom</span><span><kbd>Ctrl</kbd>+<kbd>Z</kbd> ongedaan</span><span><kbd>Ctrl</kbd>+<kbd>Y</kbd> opnieuw</span>
    </div>
    <div class="hint">${escapeHtml(ctx.hulpTekst || "De layout (welke module waar) pas je aan op het tabblad Zekeringen. Het eendraadschema volgt volledig uit de layout.")}</div>
  </div></div>`;

  if(ctx.kam === false) uvKamModus = false;
  gereedschap.innerHTML = bed ? `
    <div class="card"><div class="card-body uv-sidebody uv-tools-kaart">
      <div class="uv-sec">
        <div class="uv-sec-titel">Gereedschap</div>
        <div class="uv-toolknoppen">
          <button class="uv-tool ${!uvKamModus?"actief":""}" data-tool="draad" title="draad trekken (D)">╱ Draad <kbd>D</kbd></button>
          ${ctx.kam ? `<button class="uv-tool ${uvKamModus?"actief":""}" data-tool="kam" title="kamgeleider trekken (K)">▭ Kam <kbd>K</kbd></button>` : ""}
        </div>
        ${ctx.kam ? `<label class="uv-veld">Type kamgeleider<select class="uv-kamtype">${Object.entries(KAM_TYPES).map(([k,v])=>`<option value="${k}" ${k===uvKamType?"selected":""}>${v.label}</option>`).join("")}</select></label>` : ""}
      </div>
      <div class="uv-sec">
        <div class="uv-sec-titel">Nieuwe draad</div>
        <label class="uv-chk"><input type="checkbox" class="uv-kleurauto" ${uvKleurAuto?"checked":""}> kleur volgens klem</label>
        <div class="uv-rij2">
          <select class="uv-kleur" ${uvKleurAuto?"disabled":""} title="draadkleur">${Object.keys(DRAAD_KLEUREN).map(k=>`<option ${k===uvKleur?"selected":""}>${k}</option>`).join("")}</select>
          <select class="uv-sectie" title="doorsnede">${DRAAD_SECTIES.map(v=>`<option value="${v}" ${v===uvSectie?"selected":""}>${v} mm²</option>`).join("")}</select>
        </div>
        <label class="uv-chk"><input type="checkbox" class="uv-ortho" ${uvOrtho?"checked":""}> haaks tekenen <kbd>O</kbd></label>
      </div>
      <div class="uv-sec">
        <button class="btn small primary uv-omzet" title="${escapeHtml(ctx.omzetTitel || "voorstel maken vanuit de layout: bibliotheek, kamgeleiders en voedingsdraden")}">⚡ ${escapeHtml(ctx.omzetLabel || "Automatisch omzetten")}</button>
      </div>
      <div class="uv-sec">
        <div class="uv-sec-titel">Lagen</div>
        <div class="uv-lagen">
          <label class="uv-chk" title="draden die in dezelfde goot blijven"><input type="checkbox" data-laag="draden" ${uvLagen.draden?"checked":""}> draden in de goot</label>
          <label class="uv-chk" title="verbindingen tussen de rijen (via de zijgoot links/rechts)"><input type="checkbox" data-laag="tussen" ${uvLagen.tussen?"checked":""}> tussen de rijen</label>
          <label class="uv-chk"><input type="checkbox" data-laag="kammen" ${uvLagen.kammen?"checked":""}> kamgeleiders</label>
          <label class="uv-chk"><input type="checkbox" data-laag="labels" ${uvLagen.labels?"checked":""}> klemlabels</label>
          <label class="uv-chk"><input type="checkbox" data-laag="nummers" ${uvLagen.nummers?"checked":""}> draadnummers</label>
        </div>
        <label class="uv-veld" title="hoe breed de zijgoten links/rechts getekend worden — op het scherm én in de PDF">Zijgoot (links/rechts)
          <select class="uv-zijmodus">${Object.entries(UV_ZIJ_MODI).map(([k,v])=>`<option value="${k}" ${k===uvZijModus?"selected":""}>${v.label}</option>`).join("")}</select></label>
      </div>
      <div class="uv-sec uv-sec-meer">
        <button class="btn small ghost uv-bib">🔌 Modulebibliotheek</button>
        <button class="btn small ghost uv-export">⎙ Exporteer (PDF)</button>
        <button class="btn small ghost uv-dxf" title="tekening als DXF voor AutoCAD — in mm, schaal 1:1, met lagen">⬇ DXF (AutoCAD)</button>
        <button class="btn small ghost uv-wis" title="alle draden en kamgeleiders van deze kast wissen">🗑 Alles wissen</button>
      </div>
    </div></div>` : `
    <div class="card"><div class="card-body uv-sidebody">
      <strong>Eendraadschema</strong>
      <p class="hint">Automatisch afgeleid uit de layout van deze kast: net → remautomaat → hoofddifferentieel → differentielen met hun groep automaten.
      Per kring: code, curve/A/polen/kA, kabeltype en benoeming.</p>
      <p class="hint">Iets niet juist? Pas het aan in de <a href="#" class="uv-naar-layout2">layout</a> — het schema volgt vanzelf.</p>
      <button class="btn small ghost uv-export">⎙ Exporteer (PDF)</button>
    </div></div>`;

  // werkvlak zo hoog als het scherm toelaat
  function pasHoogteAan(){
    if(!document.body.contains(wrap)) return;
    const top = canvasBox.getBoundingClientRect().top;
    const lint = document.querySelector(".casuite-testlint");
    const h = Math.max(420, Math.round(window.innerHeight - Math.max(0, top) - 14 - (lint ? lint.offsetHeight : 0)));
    canvasBox.style.height = h + "px";
    side.style.maxHeight = h + "px";
  }
  function effSchaal(vb){
    const bw = Math.max(200, canvas.clientWidth - 12), bh = Math.max(200, canvas.clientHeight - 12);
    let sc = uvZoomModus==="kast" ? Math.min(bw/vb.width, bh/vb.height) : (uvZoomModus==="breedte" ? bw/vb.width : uvSchaal);
    return Math.max(0.12, Math.min(5, sc));
  }
  function pasSchaalAan(){
    const svg = canvas.querySelector("svg");
    if(!svg || !svg.viewBox || !svg.viewBox.baseVal) return;
    const vb = svg.viewBox.baseVal;
    huidigeSchaal = effSchaal(vb);
    svg.setAttribute("width", Math.round(vb.width*huidigeSchaal));
    svg.setAttribute("height", Math.round(vb.height*huidigeSchaal));
    const lbl = wrap.querySelector(".uv-zoomval");
    if(lbl) lbl.textContent = Math.round(huidigeSchaal*100) + "%";
    wrap.querySelector(".uv-zoom-kast").classList.toggle("actief", uvZoomModus==="kast");
    wrap.querySelector(".uv-zoom-breedte").classList.toggle("actief", uvZoomModus==="breedte");
  }
  // zoom rond een punt op het scherm (cursor of midden van het werkvlak)
  function zoomRond(factor, cx, cy){
    const svg = canvas.querySelector("svg");
    if(!svg) return;
    const r1 = svg.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    if(cx===undefined){ cx = cr.left + cr.width/2; cy = cr.top + cr.height/2; }
    const fx = (cx - r1.left)/r1.width, fy = (cy - r1.top)/r1.height;
    uvSchaal = Math.max(0.12, Math.min(5, huidigeSchaal*factor));
    uvZoomModus = "vrij";
    pasSchaalAan();
    const r2 = svg.getBoundingClientRect();
    canvas.scrollLeft += (r2.left + fx*r2.width) - cx;
    canvas.scrollTop += (r2.top + fy*r2.height) - cy;
  }
  function zetZoomModus(mod){ uvZoomModus = mod; pasSchaalAan(); canvas.scrollLeft = 0; canvas.scrollTop = 0; }
  const svgPuntVan = (ev)=>{ const svg = canvas.querySelector("svg.uv-svg"); if(!svg) return null; const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };

  // ongedaan maken: elke wijziging aan deze kast wordt automatisch vastgelegd bij het hertekenen
  function legHistorieVast(){
    if(sleep) return;
    const nu = uvKastJson(kast);
    if(nu !== hist.laatste){
      hist.undo.push(hist.laatste);
      if(hist.undo.length > 60) hist.undo.shift();
      hist.redo = [];
      hist.laatste = nu;
    }
    const u = wrap.querySelector(".uv-undo"), r = wrap.querySelector(".uv-redo");
    if(u) u.disabled = !hist.undo.length;
    if(r) r.disabled = !hist.redo.length;
  }
  function herstelKast(json){
    const data = JSON.parse(json);
    Object.keys(kast).forEach(k=>{ delete kast[k]; });
    Object.assign(kast, data);
    hist.laatste = json;
    uvPending = null; uvVerplaats = null;
    if(uvSelWire && !kast.bedrading.some(w=> w.id===uvSelWire)) uvSelWire = null;
    if(uvSelKam && !(kast.kamgeleiders||[]).some(k=> k.id===uvSelKam)) uvSelKam = null;
    save(); teken();
  }
  function ongedaan(){ if(!hist.undo.length) return; hist.redo.push(uvKastJson(kast)); herstelKast(hist.undo.pop()); toast("Ongedaan gemaakt"); }
  function opnieuw(){ if(!hist.redo.length) return; hist.undo.push(uvKastJson(kast)); herstelKast(hist.redo.pop()); toast("Opnieuw"); }

  function teken(){
    if(ctx.voorTeken) ctx.voorTeken(kast);
    if(!heeftModules){
      canvas.innerHTML = `<div class="uv-leeg-melding">Deze kast heeft nog geen modules. Bouw eerst de layout op het tabblad <strong>Zekeringen</strong>.</div>`;
      detail.innerHTML = ""; lijst.innerHTML = ""; banner.innerHTML = ""; status.textContent = "";
      return;
    }
    const scrollL = canvas.scrollLeft, scrollT = canvas.scrollTop;
    if(view==="eendraad"){
      canvas.innerHTML = bouwEendraadSvg(kast);
      pasSchaalAan();
      canvas.scrollLeft = scrollL; canvas.scrollTop = scrollT;
      detail.innerHTML = ""; banner.innerHTML = ""; lijst.innerHTML = "";
      status.textContent = "Eendraadschema — sleep om te verschuiven · Ctrl + muiswiel om te zoomen";
      return;
    }
    const res = bouwBedradingSvg(kast, true);
    geoNu = res.geo; routesNu = res.routes;
    canvas.innerHTML = res.svg;
    pasSchaalAan();
    canvas.scrollLeft = scrollL; canvas.scrollTop = scrollT;
    legHistorieVast();
    if(extraHerberekenen) extraHerberekenen();
    if(uvPending){ const pts = uvPending.punten||[]; if(pts.length) toonDraadPreview(pts[pts.length-1]); }
    tekenBanner(); tekenSide(); tekenLijst(); tekenStatus();
  }
  function tekenStatus(){
    let t;
    if(uvVerplaats) t = `Tik de nieuwe klem voor het ${uvVerplaats.e==="a" ? "begin" : "einde"} van de draad · Esc = stoppen`;
    else if(uvPending) t = `Klik tussenpunten (haaks: ${uvOrtho ? "aan" : "uit"} — O) · tik de eindklem · ⌫ = laatste punt weg · Esc = stoppen`;
    else if(uvKamModus) t = `Kamgeleider ${(KAM_TYPES[uvKamType]||{}).label||uvKamType}: sleep onderaan over de modules · Esc = stoppen`;
    else if(uvZoomVenster) t = "Zoomvenster: sleep een rechthoek rond wat je wil zien · Esc = stoppen";
    else if(uvSelWire) t = "Draad gekozen: sleep een draadstuk of knikpunt · sleep ▪ begin/einde naar een andere klem · Del = verwijderen";
    else t = "Tik een klem om een draad te starten · sleep op een lege plek om te verschuiven · Ctrl + muiswiel = zoomen";
    status.textContent = t;
  }
  function tekenBanner(){
    banner.innerHTML = "";
    if(uvKamModus){
      const b = el(`<div class="move-banner">▭ Kamgeleider <strong>${escapeHtml((KAM_TYPES[uvKamType]||{}).label||uvKamType)}</strong>: sleep onderaan over de modules. <button class="btn small ghost">Annuleren</button></div>`);
      b.querySelector("button").addEventListener("click", ()=>{ uvKamModus = false; selectTab(ctx.tab); });
      banner.appendChild(b);
      return;
    }
    if(uvVerplaats){
      const b = el(`<div class="move-banner">⇄ Tik de nieuwe klem voor het <strong>${uvVerplaats.e==="a"?"begin":"einde"}</strong> van de draad. <button class="btn small ghost">Annuleren</button></div>`);
      b.querySelector("button").addEventListener("click", ()=>{ uvVerplaats = null; teken(); });
      banner.appendChild(b);
      return;
    }
    if(!uvPending && !kast.bedrading.length && !(kast.kamgeleiders||[]).length){
      const b = el(`<div class="move-banner uv-omzet-banner">Nog geen draden in deze kast — ${ctx.zekering ? "maak een voorstel vanuit de layout" : "laat ze automatisch voorstellen"}. <button class="btn small primary">⚡ ${escapeHtml(ctx.omzetLabel || "Automatisch omzetten")}</button></div>`);
      b.querySelector("button").addEventListener("click", doeOmzet);
      banner.appendChild(b);
      return;
    }
    if(uvPending){
      const n = (uvPending.punten||[]).length;
      const b = el(`<div class="move-banner">🔌 Van <strong>${escapeHtml(uvKlemOmschrijving(kast, uvPending))}</strong>${n ? ` · ${n} knikpunt(en)` : ""} — tik de eindklem. <button class="btn small ghost">Annuleren</button></div>`);
      b.querySelector("button").addEventListener("click", ()=>{ uvPending = null; teken(); });
      banner.appendChild(b);
    }
  }
  function tekenSide(){
    detail.innerHTML = "";
    const w = uvSelWire && kast.bedrading.find(x=> x.id===uvSelWire);
    const md = uvSelMod && uvAlleModules(kast).find(x=> x.id===uvSelMod);
    if(uvSelExtra && !w && !md && ctx.extraDetail && ctx.extraDetail(uvSelExtra, detail, {teken, kast, rerender: ()=> selectTab(ctx.tab)})) return;
    const kam = uvSelKam && (kast.kamgeleiders||[]).find(x=> x.id===uvSelKam);
    if(kam){
      const om = uvKamOmschrijving(kast, kam);
      const codes = computeZekeringCodes();
      const box = el(`<div class="card uv-detail"><div class="card-body uv-sidebody">
        <div class="uv-detail-kop"><strong>Kamgeleider</strong><button class="uv-x sk-sluit" title="sluiten (Esc)">✕</button></div>
        <div class="hint">Rij ${om.rij}${kam.auto ? " · <em>automatisch voorstel</em>" : ""}</div>
        <label class="uv-veld">Type<select class="sk-type">${Object.entries(KAM_TYPES).map(([k,v])=>`<option value="${k}" ${k===kam.type?"selected":""}>${v.label}</option>`).join("")}</select></label>
        <div class="uv-veld">Verbonden modules<div class="uv-kam-chips"></div></div>
        <div class="uv-knoprij">
          <button class="btn small ghost sk-opnieuw">Opnieuw trekken</button>
          <button class="btn small ghost sk-del">🗑 Verwijderen</button>
        </div>
      </div></div>`);
      const chips = box.querySelector(".uv-kam-chips");
      uvAlleModules(kast).filter(m=> kam.moduleIds.includes(m.id)).forEach(m=>{
        const c = el(`<span class="uv-chip">${escapeHtml(codes[m.id] || CAT_ABBR[m.categorie] || m.categorie)} <button title="van de kam halen">✕</button></span>`);
        c.querySelector("button").addEventListener("click", ()=>{ kam.moduleIds = kam.moduleIds.filter(id=> id!==m.id); kam.auto = false; if(!kam.moduleIds.length){ kast.kamgeleiders = kast.kamgeleiders.filter(x=> x!==kam); uvSelKam = null; } save(); teken(); });
        chips.appendChild(c);
      });
      box.querySelector(".sk-type").addEventListener("change", e=>{ kam.type = e.target.value; kam.auto = false; save(); teken(); });
      box.querySelector(".sk-opnieuw").addEventListener("click", ()=>{ uvKamType = kam.type; kast.kamgeleiders = kast.kamgeleiders.filter(x=> x!==kam); uvSelKam = null; save(); zetTool("kam"); });
      box.querySelector(".sk-del").addEventListener("click", ()=>{ kast.kamgeleiders = kast.kamgeleiders.filter(x=> x!==kam); uvSelKam = null; save(); teken(); });
      box.querySelector(".sk-sluit").addEventListener("click", ()=>{ uvSelKam = null; teken(); });
      detail.appendChild(box);
      return;
    }
    if(w){
      const r = routesNu.find(x=> x.w.id===w.id);
      const fout = r ? uvAansluitFouten(w.kleur, r.A.k, r.B.k) : [];
      const nr = kast.bedrading.indexOf(w) + 1;
      const box = el(`<div class="card uv-detail"><div class="card-body uv-sidebody">
        <div class="uv-detail-kop"><strong>Draad #${nr}</strong><button class="uv-x sw-sluit" title="sluiten (Esc)">✕</button></div>
        <div class="uv-van-naar">
          <div><span class="uv-vn">van</span> ${escapeHtml(uvKlemOmschrijving(kast, w.a))} <button class="btn small ghost sw-va" title="begin naar een andere klem verplaatsen (of sleep het ▪ in de tekening)">⇄</button></div>
          <div><span class="uv-vn">naar</span> ${escapeHtml(uvKlemOmschrijving(kast, w.b))} <button class="btn small ghost sw-vb" title="einde naar een andere klem verplaatsen (of sleep het ▪ in de tekening)">⇄</button></div>
        </div>
        ${fout.length ? `<div class="uv-fout">⚠ ${fout.map(escapeHtml).join("<br>⚠ ")}${w.bewustAfwijkend ? `<div class="hint">bewust zo aangesloten</div>` : ""}</div>` : ""}
        ${w.auto ? `<div class="hint"><em>automatisch voorstel</em></div>` : ""}
        <div class="uv-rij2">
          <label class="uv-veld">Kleur<select class="sw-kleur">${Object.keys(DRAAD_KLEUREN).map(k=>`<option ${k===w.kleur?"selected":""}>${k}</option>`).join("")}</select></label>
          <label class="uv-veld">Doorsnede<select class="sw-sectie">${DRAAD_SECTIES.map(v=>`<option value="${v}" ${v===String(w.sectie)?"selected":""}>${v} mm²</option>`).join("")}</select></label>
        </div>
        <label class="uv-chk"><input type="checkbox" class="sw-kleurauto" ${w.kleurAuto?"checked":""}> kleur volgt klem</label>
        <label class="uv-veld">Label<input class="sw-label" value="${escapeHtml(w.label||"")}" placeholder="bv. naar klem 12"></label>
        <div class="hint">Route: ${w.punten && w.punten.length ? `eigen route (${w.punten.length} knikpunt${w.punten.length>1?"en":""})` : "automatisch"} — sleep een draadstuk of knikpunt in de tekening.</div>
        <div class="uv-knoprij">
          ${w.punten && w.punten.length ? `<button class="btn small ghost sw-auto">↺ Route automatisch</button>` : ""}
          <button class="btn small ghost sw-del">🗑 Verwijderen <kbd>Del</kbd></button>
        </div>
      </div></div>`);
      box.querySelector(".sw-kleur").addEventListener("change", e=>{
        const nieuw = e.target.value;
        if(r && !bevestigAansluiting(uvAansluitFouten(nieuw, r.A.k, r.B.k))){ e.target.value = w.kleur; return; }
        w.kleur = nieuw; w.kleurAuto = false; w.auto = false;
        w.bewustAfwijkend = r ? uvAansluitFouten(nieuw, r.A.k, r.B.k).length > 0 : false;
        save(); teken();
      });
      box.querySelector(".sw-kleurauto").addEventListener("change", e=>{ w.kleurAuto = e.target.checked; if(w.kleurAuto) uvSyncEnOpruimen(kast); save(); teken(); });
      box.querySelector(".sw-sectie").addEventListener("change", e=>{ w.sectie = e.target.value; w.sectieAuto = false; w.auto = false; save(); teken(); });
      box.querySelector(".sw-label").addEventListener("change", e=>{ w.label = e.target.value; save(); teken(); });
      box.querySelector(".sw-va").addEventListener("click", ()=>{ uvVerplaats = {w: w.id, e: "a"}; uvPending = null; teken(); });
      box.querySelector(".sw-vb").addEventListener("click", ()=>{ uvVerplaats = {w: w.id, e: "b"}; uvPending = null; teken(); });
      const ra = box.querySelector(".sw-auto");
      if(ra) ra.addEventListener("click", ()=>{ delete w.punten; save(); teken(); });
      box.querySelector(".sw-del").addEventListener("click", ()=> verwijderSelectie());
      box.querySelector(".sw-sluit").addEventListener("click", ()=>{ uvSelWire = null; uvVerplaats = null; teken(); });
      detail.appendChild(box);
      return;
    }
    if(md && ctx.moduleDetail){ ctx.moduleDetail(md, detail, {teken, kast, rerender: ()=> selectTab(ctx.tab)}); return; }
    if(md){
      const codes = computeZekeringCodes();
      const klemmen = klemmenVoorModule(md);
      const box = el(`<div class="card uv-detail"><div class="card-body uv-sidebody">
        <div class="uv-detail-kop"><strong>${escapeHtml(codes[md.id]||"")} ${escapeHtml(MODULE_CATEGORIEEN[md.categorie] ? MODULE_CATEGORIEEN[md.categorie].label : md.categorie)}</strong><button class="uv-x sm-sluit" title="sluiten (Esc)">✕</button></div>
        <div class="hint">${escapeHtml([chipSpecText(md), md.curve?("curve "+md.curve):"", md.kA?(md.kA+" kA"):"", md.type, md.naam].filter(Boolean).join(" · ")||"—")}</div>
        ${md.categorie==="Rijgklemmenmodule" ? `<label class="uv-veld">Plaats in de kast<select class="sm-rkpos">
          <option value="" ${!md.rijgklemPositie?"selected":""}>Automatisch (nu: ${rijgklemPositie(Object.assign({}, md, {rijgklemPositie: ""}))==="boven" ? "bovenaan" : "onderaan"})</option>
          <option value="boven" ${md.rijgklemPositie==="boven"?"selected":""}>Bovenaan — Preflex boven, kast onder</option>
          <option value="onder" ${md.rijgklemPositie==="onder"?"selected":""}>Onderaan — kast boven, Preflex onder</option></select></label>` : ""}
        ${md.categorie==="Rijgklemmenmodule" && (md.rijgklemKlemIds||[]).length ? `<div class="uv-veld">Kabels op deze module<div class="uv-rk-kabels"></div></div>` : ""}
        <label class="uv-veld">Bibliotheekmodule<select class="sm-bib"></select></label>
        <div class="hint">${klemmen.length} klemmen — ${Array.isArray(md.klemmenEigen) && md.klemmenEigen.length ? "eigen aanpassing" : (md.categorie==="Rijgklemmenmodule" ? "uit het tabblad Rijgklemmen" : (md.bib && md.bib.klemmen && md.bib.klemmen.length ? "uit de bibliotheek" : (sjabloonVoor(md) ? "aangepaste standaard" : "standaard")))}</div>
        <div class="uv-knoprij">
          <button class="btn small primary sm-ontwerp">✏️ Tekening &amp; klemmen</button>
          <button class="btn small ghost sm-open">🔌 Bibliotheek…</button>
          <button class="btn small ghost sm-layout">In layout openen</button>
        </div>
      </div></div>`);
      const rkZone = box.querySelector(".uv-rk-kabels");
      if(rkZone){
        const alleKl = (state.interlex && state.interlex.items) || [];
        rijgklemIndeling(md).groepen.filter(g=> g.toon).forEach(g=>{
          const r = el(`<div class="uv-rk-kabelrij"><span title="${escapeHtml([g.naam, g.locatie].filter(Boolean).join(" · "))}">${escapeHtml(g.naam || g.locatie)} <small>${g.leden.length}×</small></span><input value="${escapeHtml(g.kabelBekend ? g.kabel : "")}" placeholder="${escapeHtml(g.kabelBekend ? "" : "bv. 4G1.5")}" list="dl-uv-kabels"></div>`);
          r.querySelector("input").addEventListener("change", e=>{
            const v = e.target.value.trim();
            g.klemIds.forEach(id=>{ const k = alleKl.find(x=> x.id===id); if(k){ if(v) k.kabeltype = v; else delete k.kabeltype; } });
            uvSyncEnOpruimen(kast); save(); teken();
          });
          rkZone.appendChild(r);
        });
        rkZone.appendChild(el(`<datalist id="dl-uv-kabels">${["3G1.5","3G2.5","4G1.5","5G1.5","5G2.5","2x1.5","EIB-Y(St)Y 2x2x0.8","SVV 4x0.8"].map(k=>`<option value="${k}">`).join("")}</datalist>`));
      }
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
      box.querySelector(".sm-layout").addEventListener("click", ()=> selectTab(ctx.layoutTab));
      box.querySelector(".sm-sluit").addEventListener("click", ()=>{ uvSelMod = null; teken(); });
      detail.appendChild(box);
      return;
    }
    const rap = uvLaatsteOmzet && uvLaatsteOmzet.kastId===kast.id ? uvLaatsteOmzet : null;
    if(rap){
      const box = el(`<div class="card uv-detail"><div class="card-body uv-sidebody">
        <div class="uv-detail-kop"><strong>⚡ Automatisch omgezet</strong><button class="uv-x uv-rap-sluit" title="sluiten">✕</button></div>
        <ul class="uv-uitleg" style="list-style:disc;">
          <li>${rap.gekoppeld.length} module(s) gekoppeld aan de bibliotheek${rap.alGekoppeld ? ` (${rap.alGekoppeld} waren al gekoppeld)` : ""}</li>
          <li>${rap.kammen} kamgeleider(s), ${rap.draden} voedingsdraad/draden</li>
          ${rap.zonderMatch.length ? `<li>${rap.zonderMatch.length} zonder passende bibliotheekmodule (standaardtekening):</li>` : ""}
        </ul>
        <div class="uv-kam-chips uv-ontbrekend"></div>
        <div class="hint">Alles blijft aanpasbaar. Opnieuw omzetten vervangt enkel de automatische voorstellen.</div>
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
      detail.appendChild(box);
    }
    const losseKlemmen = ctx.zekering ? rijgklemmenZonderModule() : [];
    if(losseKlemmen.length){
      const box = el(`<div class="card uv-detail"><div class="card-body uv-sidebody">
        <strong>Rijgklemmen</strong>
        <div class="hint">${losseKlemmen.length} rijgklem(men) van het tabblad Rijgklemmen staan nog op geen enkele rijgklemmenmodule in een kast.</div>
        <button class="btn small primary uv-rk-plaats">＋ In deze kast plaatsen</button>
      </div></div>`);
      box.querySelector(".uv-rk-plaats").addEventListener("click", ()=>{
        const n = plaatsRijgklemmenInKast(kast, losseKlemmen.map(k=> k.id));
        save(); toast(`${losseKlemmen.length} rijgklem(men) geplaatst op ${n} rijgklemmenmodule(s) — ook zichtbaar in de layout.`);
        selectTab(ctx.tab);
      });
      detail.appendChild(box);
    }
    const zonderBib = uvAlleModules(kast).filter(m=> m.categorie!=="Leeg" && !m.bibId).length;
    const nFout = routesNu.filter(r=> uvAansluitFouten(r.w.kleur, r.A.k, r.B.k).length).length;
    detail.appendChild(el(`<div class="uv-telling">${kast.bedrading.length} draden${ctx.zekering ? ` · ${(kast.kamgeleiders||[]).length} kamgeleiders` : ""}${zonderBib && ctx.zekering ? ` · ${zonderBib} module(s) met standaardtekening` : ""}${nFout ? ` · <span class="uv-fout-tel">⚠ ${nFout} afwijkende aansluiting(en)</span>` : ""}</div>`));
  }
  function tekenLijst(){
    lijst.innerHTML = "";
    const kammen = kast.kamgeleiders || [];
    const det = el(`<details class="uv-lijsten" ${uvLijstOpen?"open":""}><summary>Draadlijst (${kast.bedrading.length}) &amp; kamgeleiders (${kammen.length})</summary><div class="uv-lijsten-in"></div></details>`);
    det.addEventListener("toggle", ()=>{ uvLijstOpen = det.open; });
    const binnen = det.querySelector(".uv-lijsten-in");
    const card = el(`<div class="card">
      <div class="card-head"><h3>Draadlijst</h3><span class="hint">${kast.bedrading.length} draad/draden</span></div>
      <div class="card-body" style="padding:0;overflow-x:auto;"><table class="grid">
        <thead><tr><th>#</th><th>Van</th><th>Naar</th><th>Kleur</th><th>Doorsnede</th><th>Label</th><th></th></tr></thead><tbody></tbody>
      </table></div></div>`);
    const tbody = card.querySelector("tbody");
    if(!kast.bedrading.length) tbody.appendChild(el(`<tr class="emptyrow"><td colspan="7">Nog geen draden getrokken.</td></tr>`));
    kast.bedrading.forEach((w, i)=>{
      const r = routesNu.find(x=> x.w.id===w.id);
      const fout = r && uvAansluitFouten(w.kleur, r.A.k, r.B.k).length;
      const tr = el(`<tr class="${uvSelWire===w.id?"uv-rij-sel":""}">
        <td class="codecell">${i+1}${fout?' <span class="uv-fout-tel" title="afwijkende aansluiting">⚠</span>':""}</td><td>${escapeHtml(uvKlemOmschrijving(kast, w.a))}</td><td>${escapeHtml(uvKlemOmschrijving(kast, w.b))}</td>
        <td><span class="uv-kleurstaal" style="background:${DRAAD_KLEUREN[w.kleur]||"#999"}"></span> ${escapeHtml(w.kleur||"")}</td>
        <td>${escapeHtml(String(w.sectie||""))} mm²</td><td>${escapeHtml(w.label||"")}</td>
        <td><button class="btn small ghost dl-del" title="verwijderen">✕</button></td></tr>`);
      tr.addEventListener("click", e=>{ if(e.target.closest(".dl-del")) return; uvSelWire = w.id; uvSelMod = null; uvSelKam = null; uvPending = null; teken(); });
      tr.querySelector(".dl-del").addEventListener("click", ()=>{ kast.bedrading = kast.bedrading.filter(x=> x.id!==w.id); if(uvSelWire===w.id) uvSelWire = null; save(); teken(); });
      tbody.appendChild(tr);
    });
    binnen.appendChild(card);
    const kcard = el(`<div class="card" style="margin-top:12px;">
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
    binnen.appendChild(kcard);
    lijst.appendChild(det);
  }

  async function doeOmzet(){
    const heeftAuto = kast.bedrading.some(w=> w.auto) || (kast.kamgeleiders||[]).some(k=> k.auto);
    if(heeftAuto && !confirm("Opnieuw automatisch omzetten? De vorige automatische voorstellen worden vervangen; wat je zelf tekende of aanpaste blijft staan.")) return;
    if(ctx.omzet){
      const melding = ctx.omzet(kast);
      uvPending = null; uvSelWire = null; uvSelMod = null; uvSelKam = null; uvKamModus = false;
      uvSyncEnOpruimen(kast); save(); teken(); tekenTools();
      if(melding) toast(melding);
      return;
    }
    const res = await laadAllesVoorUitvoering();
    if(res[0].status==="rejected") toast("Bibliotheek niet bereikbaar — omzetting zonder bibliotheekmodules.");
    const r = uvAutoOmzet(kast);
    uvPending = null; uvSelWire = null; uvSelMod = null; uvSelKam = null; uvKamModus = false;
    uvSyncEnOpruimen(kast);
    save(); teken(); tekenTools();
    toast(`Omgezet: ${r.gekoppeld.length} bibliotheekkoppeling(en), ${r.kammen} kamgeleider(s), ${r.draden} draad/draden.`);
  }
  function verwijderSelectie(){
    if(uvSelWire){ kast.bedrading = kast.bedrading.filter(x=> x.id!==uvSelWire); uvSelWire = null; uvVerplaats = null; save(); teken(); return true; }
    if(uvSelKam){ kast.kamgeleiders = (kast.kamgeleiders||[]).filter(x=> x.id!==uvSelKam); uvSelKam = null; save(); teken(); return true; }
    return false;
  }
  function tekenTools(){
    gereedschap.querySelectorAll(".uv-tool").forEach(b=> b.classList.toggle("actief", (b.dataset.tool==="kam")===!!uvKamModus));
    const zv = wrap.querySelector(".uv-zoom-venster");
    if(zv) zv.classList.toggle("actief", uvZoomVenster);
    const o = gereedschap.querySelector(".uv-ortho");
    if(o) o.checked = uvOrtho;
  }
  function zetTool(t){
    uvKamModus = t==="kam"; uvPending = null; uvVerplaats = null; uvZoomVenster = false;
    if(uvKamModus){ uvSelWire = null; uvSelKam = null; }
    tekenTools(); teken();
  }

  /* ---------- tekenhulp: raster + objectsnap + haaks ---------- */
  function snapPunt(p, vorige){
    let x = Math.round(p.x/2)*2, y = Math.round(p.y/2)*2;
    if(geoNu){
      let bx = 6, by = 6;
      Object.values(geoNu.klemPos).forEach(k=>{
        if(Math.abs(k.x - p.x) < bx){ bx = Math.abs(k.x - p.x); x = k.x; }
        if(Math.abs(k.y - p.y) < by){ by = Math.abs(k.y - p.y); y = k.y; }
      });
    }
    if(uvOrtho && vorige){
      if(Math.abs(x - vorige.x) >= Math.abs(y - vorige.y)) y = vorige.y; else x = vorige.x;
    }
    return {x, y};
  }
  function startPuntPending(){ return uvPending && geoNu ? geoNu.klemPos[uvKlemKey(uvPending.m, uvPending.k)] : null; }
  function pendingVorige(){ const pts = uvPending.punten || []; return pts.length ? pts[pts.length-1] : startPuntPending(); }
  function toonDraadPreview(cur){
    const svg = canvas.querySelector("svg.uv-svg");
    const pv = svg && svg.querySelector(".uv-draad-preview");
    if(!pv) return;
    if(!cur){ pv.style.display = "none"; return; }
    const A = startPuntPending();
    if(!A){ pv.style.display = "none"; return; }
    pv.setAttribute("d", uvPad(uvVertsVoor(A, cur, uvPending.punten || [])));
    pv.style.display = "";
  }

  /* ---------- draden aansluiten (met controle N / PE) ---------- */
  function sluitAan(a, b){
    const dubbel = kast.bedrading.some(w=> (w.a.m===a.m && w.a.k===a.k && w.b.m===b.m && w.b.k===b.k) || (w.a.m===b.m && w.a.k===b.k && w.b.m===a.m && w.b.k===a.k));
    if(dubbel){ toast("Die twee klemmen zijn al verbonden."); uvPending = null; teken(); return; }
    const pa = geoNu.klemPos[uvKlemKey(a.m, a.k)];
    const pb = geoNu.klemPos[uvKlemKey(b.m, b.k)];
    const kleur = uvKleurAuto ? (draadKleurVoorKlemmen(pa && pa.k, pb && pb.k) || uvKleur) : uvKleur;
    const fouten = uvAansluitFouten(kleur, pa && pa.k, pb && pb.k);
    if(!bevestigAansluiting(fouten)){ teken(); return; }
    const sectieKabel = uvSectieVoorKlemmen(pa && pa.m, pa && pa.k, pb && pb.m, pb && pb.k);
    const nw = {id: cryptoId(), a: {m: a.m, k: a.k}, b, kleur, kleurAuto: uvKleurAuto, sectie: sectieKabel || uvSectie, label: ""};
    if(sectieKabel){ nw.sectieAuto = true; if(sectieKabel !== uvSectie) toast(`Doorsnede ${sectieKabel} mm² volgens de kabel op de rijgklem`); }
    if(fouten.length) nw.bewustAfwijkend = true;
    const pts = (uvPending && uvPending.punten) || [];
    if(pts.length) nw.punten = pts.map(p=> uvEncodeerPunt(p, geoNu));
    kast.bedrading.push(nw);
    uvPending = null;
    save(); teken();
  }
  function verplaatsEinde(wid, e, naar){
    const w = kast.bedrading.find(x=> x.id===wid);
    if(!w) return false;
    const ander = e==="a" ? w.b : w.a;
    if(ander.m===naar.m && ander.k===naar.k){ toast("Begin en einde kunnen niet op dezelfde klem."); return false; }
    if(w[e].m===naar.m && w[e].k===naar.k) return false;
    const pa = geoNu.klemPos[uvKlemKey(naar.m, naar.k)], po = geoNu.klemPos[uvKlemKey(ander.m, ander.k)];
    const kleurNa = w.kleurAuto ? (draadKleurVoorKlemmen(e==="a" ? pa.k : po.k, e==="a" ? po.k : pa.k) || w.kleur) : w.kleur;
    const fouten = uvAansluitFouten(kleurNa, pa && pa.k, po && po.k);
    if(!bevestigAansluiting(fouten)) return false;
    w[e] = {m: naar.m, k: naar.k};
    w.kleur = kleurNa;
    if(w.sectieAuto !== false){ const ns = uvSectieVoorKlemmen(pa && pa.m, pa && pa.k, po && po.m, po && po.k); if(ns){ w.sectie = ns; w.sectieAuto = true; } }
    w.bewustAfwijkend = fouten.length > 0;
    w.auto = false;
    delete w.punten;
    uvSyncEnOpruimen(kast);
    save();
    toast(`${e==="a" ? "Begin" : "Einde"} van draad #${kast.bedrading.indexOf(w)+1} verplaatst naar ${uvKlemOmschrijving(kast, w[e])}`);
    return true;
  }

  /* ---------- slepen: pannen, zoomvenster, kamgeleider, draadstukken, knikpunten, eindpunten ---------- */
  let sleep = null;          // {soort, ...}
  let negeerKlik = false;
  let rafBezig = false;
  const negeerVolgendeKlik = ()=>{ negeerKlik = true; setTimeout(()=>{ negeerKlik = false; }, 60); };
  function kamModulesOnder(ks){
    const lo = Math.min(ks.x0, ks.x1), hi = Math.max(ks.x0, ks.x1);
    const inRij = geoNu.mods.filter(md=> md.ri===ks.ri && md.m.categorie!=="Leeg");
    if(hi - lo < 4) return inRij.filter(md=> lo >= md.x && lo <= md.x + md.w);
    return inRij.filter(md=> md.x + md.w > lo + 4 && md.x < hi - 4);
  }
  function toonKamPreview(ks){
    const r = canvas.querySelector(".uv-kam-preview");
    if(!r) return;
    const mds = kamModulesOnder(ks);
    const yRij = geoNu.rijY[ks.ri];
    const lo = mds.length ? Math.min(...mds.map(d=> d.x)) : Math.min(ks.x0, ks.x1);
    const hi = mds.length ? Math.max(...mds.map(d=> d.x+d.w)) : Math.max(ks.x0, ks.x1);
    r.setAttribute("x", lo); r.setAttribute("width", Math.max(2, hi-lo));
    r.setAttribute("y", yRij + UV.MH - 22); r.setAttribute("height", 52);
    r.style.display = "";
  }
  // draad tijdelijk hertekenen met andere knikpunten (zonder historie/bewaren)
  function tekenDraadLive(w, verts){
    const d = uvPad(verts);
    canvas.querySelectorAll(`.uv-draad[data-w="${w.id}"] path`).forEach(p=> p.setAttribute("d", d));
    const g = canvas.querySelector(".uv-greep");
    if(g) g.style.display = "none";
  }

  canvas.addEventListener("pointerdown", ev=>{
    if(ev.button===2) return;
    const svg = canvas.querySelector("svg");
    if(!svg) return;
    const p = svgPuntVan(ev);
    const midden = ev.button===1;
    if(midden || view!=="bedrading"){
      if(ev.pointerType==="touch") return;
      ev.preventDefault();
      sleep = {soort: "pan", cx: ev.clientX, cy: ev.clientY, sl: canvas.scrollLeft, st: canvas.scrollTop, bewogen: false};
      try{ canvas.setPointerCapture(ev.pointerId); }catch(_e){}
      return;
    }
    if(uvZoomVenster && p){
      ev.preventDefault();
      sleep = {soort: "zoomvenster", x0: p.x, y0: p.y, x1: p.x, y1: p.y};
      try{ canvas.setPointerCapture(ev.pointerId); }catch(_e){}
      return;
    }
    if(uvKamModus && p){
      let ri = -1, best = Infinity;
      geoNu.rijY.forEach((y, i)=>{ const d = Math.abs(p.y - (y + UV.MH*0.75)); if(d < best){ best = d; ri = i; } });
      if(ri < 0 || best > UV.MH) return;
      ev.preventDefault();
      sleep = {soort: "kam", ri, x0: p.x, x1: p.x};
      try{ canvas.setPointerCapture(ev.pointerId); }catch(_e){}
      toonKamPreview(sleep);
      return;
    }
    const eind = ev.target.closest && ev.target.closest(".uv-eind");
    const vtx = ev.target.closest && ev.target.closest(".uv-vtx");
    const seg = ev.target.closest && ev.target.closest(".uv-dseg.sleepbaar");
    const r = uvSelWire && routesNu.find(x=> x.w.id===uvSelWire);
    if(r && (eind || vtx || seg)){
      ev.preventDefault(); ev.stopPropagation();
      const basis = r.verts.map(v=> ({x: v.x, y: v.y}));
      if(eind) sleep = {soort: "eind", e: eind.getAttribute("data-e"), r, bewogen: false};
      else if(vtx) sleep = {soort: "vtx", i: +vtx.getAttribute("data-i") + 1, r, basis, p0: p, bewogen: false};
      else sleep = {soort: "seg", i: +seg.getAttribute("data-i"), as: seg.getAttribute("data-as"), r, basis, p0: p, bewogen: false};
      svg.classList.add("sleept");
      try{ canvas.setPointerCapture(ev.pointerId); }catch(_e){}
      return;
    }
    if(ev.target.closest && ev.target.closest(".uv-klem")) return;
    // modules verslepen (bv. drivers in de driverkast), als de context dat toelaat
    const modEl = ctx.moduleSleep && ev.target.closest && ev.target.closest(".uv-mod[data-mod]");
    if(modEl && p && ctx.moduleSleep.mag(modEl.getAttribute("data-mod"))){
      ev.preventDefault();
      sleep = {soort: "mod", id: modEl.getAttribute("data-mod"), el: modEl, p0: p, p, bewogen: false};
      try{ canvas.setPointerCapture(ev.pointerId); }catch(_e){}
      return;
    }
    if(ev.pointerType==="touch") return;    // vinger: gewoon scrollen
    sleep = {soort: "pan", cx: ev.clientX, cy: ev.clientY, sl: canvas.scrollLeft, st: canvas.scrollTop, bewogen: false};
  });
  canvas.addEventListener("pointermove", ev=>{
    if(!sleep){
      if(uvPending && view==="bedrading" && !uvKamModus){
        const p = svgPuntVan(ev);
        if(p && !(ev.target.closest && ev.target.closest(".uv-klem"))) toonDraadPreview(snapPunt(p, pendingVorige()));
        else if(p){ const kg = ev.target.closest(".uv-klem"); const kp = geoNu && geoNu.klemPos[uvKlemKey(kg.getAttribute("data-m"), kg.getAttribute("data-k"))]; toonDraadPreview(kp ? {x: kp.x, y: kp.y} : null); }
      }
      return;
    }
    if(sleep.soort==="pan"){
      const dx = ev.clientX - sleep.cx, dy = ev.clientY - sleep.cy;
      if(!sleep.bewogen && Math.abs(dx) + Math.abs(dy) < 5) return;
      if(!sleep.bewogen){ sleep.bewogen = true; canvas.classList.add("pannen"); try{ canvas.setPointerCapture(ev.pointerId); }catch(_e){} }
      canvas.scrollLeft = sleep.sl - dx; canvas.scrollTop = sleep.st - dy;
      return;
    }
    const p = svgPuntVan(ev);
    if(!p) return;
    if(sleep.soort==="zoomvenster"){
      sleep.x1 = p.x; sleep.y1 = p.y;
      const r = canvas.querySelector(".uv-zoom-preview");
      if(r){ r.setAttribute("x", Math.min(sleep.x0, p.x)); r.setAttribute("y", Math.min(sleep.y0, p.y)); r.setAttribute("width", Math.abs(p.x - sleep.x0)); r.setAttribute("height", Math.abs(p.y - sleep.y0)); r.style.display = ""; }
      return;
    }
    if(sleep.soort==="kam"){ sleep.x1 = p.x; toonKamPreview(sleep); return; }
    if(sleep.soort==="mod"){
      const dx = p.x - sleep.p0.x, dy = p.y - sleep.p0.y;
      if(!sleep.bewogen && Math.abs(dx) + Math.abs(dy) < 4) return;
      sleep.bewogen = true; sleep.p = p;
      sleep.el.setAttribute("transform", `translate(${dx} ${dy})`);
      sleep.el.classList.add("versleept");
      canvas.querySelector("svg").classList.add("sleept-mod");
      if(ctx.moduleSleep.voorbeeld) ctx.moduleSleep.voorbeeld(kast, sleep.id, p, canvas.querySelector("svg"));
      return;
    }
    sleep.bewogen = true;
    if(sleep.soort==="eind"){
      const ander = sleep.e==="a" ? sleep.r.B : sleep.r.A;
      const kg = document.elementFromPoint(ev.clientX, ev.clientY);
      const klem = kg && kg.closest && kg.closest(".uv-klem");
      canvas.querySelectorAll(".uv-klem.doel").forEach(x=> x.classList.remove("doel"));
      if(klem) klem.classList.add("doel");
      const verts = sleep.e==="a" ? uvVertsVoor(p, ander, []) : uvVertsVoor(ander, p, []);
      tekenDraadLive(sleep.r.w, verts);
      return;
    }
    if(rafBezig) return;
    rafBezig = true;
    requestAnimationFrame(()=>{
      rafBezig = false;
      if(!sleep || (sleep.soort!=="vtx" && sleep.soort!=="seg")) return;
      const v = sleep.basis.map(q=> ({x: q.x, y: q.y}));
      if(sleep.soort==="vtx"){
        const n = snapPunt(p, null);
        v[sleep.i] = n;
      } else {
        const n = snapPunt(p, null);
        if(sleep.as==="h"){ v[sleep.i].y = n.y; v[sleep.i+1].y = n.y; }
        else { v[sleep.i].x = n.x; v[sleep.i+1].x = n.x; }
      }
      sleep.verts = uvVertsVoor(v[0], v[v.length-1], v.slice(1, -1));
      tekenDraadLive(sleep.r.w, sleep.verts);
    });
  });
  function sleepEinde(ev){
    if(!sleep) return;
    const s = sleep; sleep = null;
    // klem onder de cursor bepalen zolang de gesleepte draad nog "doorzichtig" is voor de muis
    const onder = s.soort==="eind" && ev && ev.clientX!==undefined ? document.elementFromPoint(ev.clientX, ev.clientY) : null;
    canvas.classList.remove("pannen");
    const svg = canvas.querySelector("svg");
    if(svg) svg.classList.remove("sleept");
    if(s.soort==="pan"){ if(s.bewogen) negeerVolgendeKlik(); return; }
    if(s.soort==="mod"){
      const svgM = canvas.querySelector("svg"); if(svgM) svgM.classList.remove("sleept-mod");
      if(!s.bewogen) return;   // gewone klik: selecteren
      negeerVolgendeKlik();
      if(ctx.moduleSleep.drop(kast, s.id, s.p, s.p0)){ save(); selectTab(ctx.tab); } else teken();
      return;
    }
    negeerVolgendeKlik();
    if(s.soort==="zoomvenster"){
      const rx = Math.min(s.x0, s.x1), ry = Math.min(s.y0, s.y1), rw = Math.abs(s.x1 - s.x0), rh = Math.abs(s.y1 - s.y0);
      uvZoomVenster = false; tekenTools();
      const pr = canvas.querySelector(".uv-zoom-preview"); if(pr) pr.style.display = "none";
      if(rw < 12 || rh < 12){ teken(); return; }
      zoomOpRechthoek(rx, ry, rw, rh);
      tekenStatus();
      return;
    }
    if(s.soort==="kam"){
      const mds = kamModulesOnder(s);
      const rij = kast.rijen[s.ri];
      if(mds.length < 2){ toast("Sleep over minstens 2 modules."); teken(); return; }
      const ids = mds.map(d=> d.m.id);
      kast.kamgeleiders = (kast.kamgeleiders||[]).map(k=> Object.assign(k, {moduleIds: k.moduleIds.filter(id=> !ids.includes(id))})).filter(k=> k.moduleIds.length);
      const kam = {id: cryptoId(), rijId: rij.id, type: uvKamType, moduleIds: ids, auto: false};
      kast.kamgeleiders.push(kam);
      uvKamModus = false; uvSelKam = kam.id; uvSelWire = null; uvSelMod = null;
      save(); tekenTools(); teken();
      return;
    }
    if(s.soort==="eind"){
      canvas.querySelectorAll(".uv-klem.doel").forEach(x=> x.classList.remove("doel"));
      const klem = onder && onder.closest && onder.closest(".uv-klem");
      if(klem && s.bewogen) verplaatsEinde(s.r.w.id, s.e, {m: klem.getAttribute("data-m"), k: klem.getAttribute("data-k")});
      else if(s.bewogen) toast("Laat het eindpunt los op een klem om de draad te verplaatsen.");
      teken();
      return;
    }
    if((s.soort==="vtx" || s.soort==="seg") && s.bewogen && s.verts){
      const w = s.r.w;
      const binnen = s.verts.slice(1, -1);
      w.punten = binnen.map(q=> uvEncodeerPunt(q, geoNu));
      w.auto = false;
      save();
    }
    teken();
  }
  canvas.addEventListener("pointerup", sleepEinde);
  canvas.addEventListener("pointercancel", ()=>{ sleep = null; canvas.classList.remove("pannen"); teken(); });
  canvas.addEventListener("auxclick", e=>{ if(e.button===1) e.preventDefault(); });
  canvas.addEventListener("dblclick", e=>{
    const vtx = e.target.closest && e.target.closest(".uv-vtx");
    const r = uvSelWire && routesNu.find(x=> x.w.id===uvSelWire);
    if(!vtx || !r) return;
    const i = +vtx.getAttribute("data-i") + 1;
    const v = r.verts.slice(); v.splice(i, 1);
    const binnen = uvVereenvoudig(uvVertsVoor(v[0], v[v.length-1], v.slice(1, -1))).slice(1, -1);
    if(binnen.length) r.w.punten = binnen.map(q=> uvEncodeerPunt(q, geoNu)); else delete r.w.punten;
    save(); teken();
  });
  function zoomOpRechthoek(rx, ry, rw, rh){
    const bw = Math.max(200, canvas.clientWidth - 12), bh = Math.max(200, canvas.clientHeight - 12);
    uvSchaal = Math.max(0.12, Math.min(5, Math.min(bw/rw, bh/rh)));
    uvZoomModus = "vrij";
    pasSchaalAan();
    const svg = canvas.querySelector("svg");
    const sr = svg.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    const doelX = cr.left + (canvas.clientWidth - rw*huidigeSchaal)/2, doelY = cr.top + (canvas.clientHeight - rh*huidigeSchaal)/2;
    canvas.scrollLeft += (sr.left + rx*huidigeSchaal) - doelX;
    canvas.scrollTop += (sr.top + ry*huidigeSchaal) - doelY;
  }

  canvas.addEventListener("click", e=>{
    if(view!=="bedrading" || uvKamModus || uvZoomVenster || negeerKlik) return;
    if(e.target.closest(".uv-greep")) return;
    const klem = e.target.closest(".uv-klem");
    if(klem){
      const eind = {m: klem.getAttribute("data-m"), k: klem.getAttribute("data-k")};
      if(uvVerplaats){ const v = uvVerplaats; uvVerplaats = null; verplaatsEinde(v.w, v.e, eind); teken(); return; }
      uvSelWire = null; uvSelMod = null; uvSelKam = null;
      if(!uvPending){ uvPending = Object.assign({}, eind, {punten: []}); teken(); return; }
      if(uvPending.m===eind.m && uvPending.k===eind.k){ uvPending = null; teken(); return; }
      sluitAan(uvPending, eind);
      return;
    }
    if(uvPending){
      // tussenpunt (knikpunt) toevoegen
      const p = svgPuntVan(e);
      if(!p) return;
      uvPending.punten = uvPending.punten || [];
      uvPending.punten.push(snapPunt(p, pendingVorige()));
      teken();
      return;
    }
    if(uvVerplaats) return;
    const draad = e.target.closest(".uv-draad");
    if(draad){ uvSelWire = draad.getAttribute("data-w"); uvSelMod = null; uvSelKam = null; teken(); return; }
    const kamEl = e.target.closest(".uv-kam");
    if(kamEl){ uvSelKam = kamEl.getAttribute("data-kam"); uvSelWire = null; uvSelMod = null; teken(); return; }
    const mod = e.target.closest(".uv-mod");
    if(mod){ uvSelMod = mod.getAttribute("data-mod"); uvSelWire = null; uvSelKam = null; teken(); return; }
    const extra = ctx.extraDetail && e.target.closest("[data-koker]");
    if(extra){ uvSelExtra = "koker:" + extra.getAttribute("data-koker"); uvSelWire = null; uvSelMod = null; uvSelKam = null; teken(); return; }
    if(uvSelWire || uvSelMod || uvSelKam || uvSelExtra){ uvSelWire = null; uvSelMod = null; uvSelKam = null; uvSelExtra = null; teken(); }
  });
  canvas.addEventListener("wheel", e=>{
    if(!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomRond(e.deltaY < 0 ? 1.15 : 1/1.15, e.clientX, e.clientY);
  }, {passive: false});

  /* ---------- knoppen ---------- */
  wrap.querySelectorAll(".uv-seg button").forEach(b=> b.addEventListener("click", ()=>{ uvView = b.dataset.view; uvPending = null; uvKamModus = false; uvZoomVenster = false; selectTab(ctx.tab); }));
  const q = (s)=> wrap.querySelector(s);
  const aan = (s, ev, fn)=>{ const x = q(s); if(x) x.addEventListener(ev, fn); };
  aan(".uv-undo", "click", ongedaan);
  aan(".uv-redo", "click", opnieuw);
  aan(".uv-zoom-in", "click", ()=> zoomRond(1.25));
  aan(".uv-zoom-uit", "click", ()=> zoomRond(1/1.25));
  aan(".uv-zoomval", "click", ()=> zetZoomModus("kast"));
  aan(".uv-zoom-kast", "click", ()=> zetZoomModus("kast"));
  aan(".uv-zoom-breedte", "click", ()=> zetZoomModus("breedte"));
  aan(".uv-zoom-venster", "click", ()=>{ uvZoomVenster = !uvZoomVenster; uvPending = null; tekenTools(); tekenStatus(); });
  aan(".uv-help", "click", ()=>{ uvHulpOpen = !uvHulpOpen; hulp.hidden = !uvHulpOpen; q(".uv-help").classList.toggle("actief", uvHulpOpen); });
  wrap.querySelectorAll(".uv-naar-layout2").forEach(a=> a.addEventListener("click", e=>{ e.preventDefault(); selectTab(ctx.layoutTab); }));
  wrap.querySelectorAll(".uv-tool").forEach(b=> b.addEventListener("click", ()=> zetTool(b.dataset.tool)));
  aan(".uv-kleurauto", "change", e=>{ uvKleurAuto = e.target.checked; q(".uv-kleur").disabled = uvKleurAuto; });
  aan(".uv-kleur", "change", e=>{ uvKleur = e.target.value; });
  aan(".uv-sectie", "change", e=>{ uvSectie = e.target.value; });
  aan(".uv-ortho", "change", e=>{ uvOrtho = e.target.checked; tekenStatus(); });
  aan(".uv-omzet", "click", doeOmzet);
  aan(".uv-kamtype", "change", e=>{ uvKamType = e.target.value; if(uvKamModus) teken(); });
  wrap.querySelectorAll("[data-laag]").forEach(c=> c.addEventListener("change", ()=>{ uvLagen[c.dataset.laag] = c.checked; teken(); }));
  aan(".uv-zijmodus", "change", e=>{ uvZetZijModus(e.target.value); teken(); if(uvZoomModus!=="vrij") pasSchaalAan(); });
  aan(".uv-wis", "click", ()=>{
    const nk = (kast.kamgeleiders||[]).length;
    if(!kast.bedrading.length && !nk) return;
    if(!confirm(`Alle ${kast.bedrading.length} draden en ${nk} kamgeleider(s) van ${kast.naam} wissen? (Ctrl+Z maakt dit ongedaan)`)) return;
    kast.bedrading = []; kast.kamgeleiders = []; uvSelWire = null; uvSelKam = null; uvPending = null; uvLaatsteOmzet = null; save(); teken();
  });
  aan(".uv-bib", "click", ()=> openModuleBibliotheek({ naSluiten: ()=>{ uvSyncEnOpruimen(kast); teken(); } }));
  wrap.querySelectorAll(".uv-export").forEach(b=> b.addEventListener("click", ()=> ctx.export()));
  aan(".uv-dxf", "click", ()=> downloadDxf(kast, kast.naam || ctx.titel));
  const extraZone = wrap.querySelector("#uvExtra");
  const tekenExtra = ()=>{ if(!ctx.extraKaart || !bed) return; extraZone.innerHTML = ""; ctx.extraKaart(extraZone, {teken, kast, rerender: ()=> selectTab(ctx.tab)}); };
  tekenExtra();
  // zijkaart (bv. kastkeuze driverkast) bijwerken als de tekening verandert, even na de laatste wijziging
  let extraTimer = null, extraSig = uvKastJson(kast);
  extraHerberekenen = ()=>{
    if(!ctx.extraKaart) return;
    clearTimeout(extraTimer);
    extraTimer = setTimeout(()=>{ if(!document.body.contains(wrap) || sleep) return; const sg = uvKastJson(kast); if(sg===extraSig) return; extraSig = sg; tekenExtra(); }, 700);
  };

  /* ---------- sneltoetsen ---------- */
  if(uvToetsHandler) document.removeEventListener("keydown", uvToetsHandler);
  uvToetsHandler = (e)=>{
    if(!document.body.contains(wrap)){ document.removeEventListener("keydown", uvToetsHandler); uvToetsHandler = null; return; }
    const t = e.target;
    if(t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
    if(document.getElementById("mbib-overlay") || document.getElementById("mod-ontwerper")) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if(ctrl && (k==="z" || k==="Z") && !e.shiftKey){ if(view==="bedrading"){ e.preventDefault(); ongedaan(); } return; }
    if(ctrl && (k==="y" || k==="Y" || ((k==="z" || k==="Z") && e.shiftKey))){ if(view==="bedrading"){ e.preventDefault(); opnieuw(); } return; }
    if(ctrl || e.altKey) return;
    if(k==="Escape"){
      if(uvPending || uvKamModus || uvZoomVenster || uvVerplaats){ uvPending = null; uvKamModus = false; uvZoomVenster = false; uvVerplaats = null; tekenTools(); teken(); }
      else if(uvSelWire || uvSelKam || uvSelMod || uvSelExtra){ uvSelWire = null; uvSelKam = null; uvSelMod = null; uvSelExtra = null; teken(); }
      return;
    }
    if(k==="f" || k==="F"){ e.preventDefault(); zetZoomModus("kast"); return; }
    if(k==="w" || k==="W"){ e.preventDefault(); zetZoomModus("breedte"); return; }
    if(k==="+" || k==="="){ e.preventDefault(); zoomRond(1.25); return; }
    if(k==="-" || k==="_"){ e.preventDefault(); zoomRond(1/1.25); return; }
    if(view!=="bedrading") return;
    if(k==="z" || k==="Z"){ e.preventDefault(); uvZoomVenster = !uvZoomVenster; uvPending = null; tekenTools(); tekenStatus(); return; }
    if(k==="d" || k==="D"){ e.preventDefault(); zetTool("draad"); return; }
    if((k==="k" || k==="K") && ctx.kam){ e.preventDefault(); zetTool("kam"); return; }
    if(k==="o" || k==="O"){ e.preventDefault(); uvOrtho = !uvOrtho; tekenTools(); tekenStatus(); toast(`Haaks tekenen ${uvOrtho ? "aan" : "uit"}`); return; }
    if(k==="Backspace" && uvPending){ e.preventDefault(); if((uvPending.punten||[]).length){ uvPending.punten.pop(); teken(); } else { uvPending = null; teken(); } return; }
    if(k==="Delete" || k==="Backspace"){ if(verwijderSelectie()) e.preventDefault(); return; }
  };
  document.addEventListener("keydown", uvToetsHandler);

  /* ---------- schermgrootte ---------- */
  if(uvResizeHandler) window.removeEventListener("resize", uvResizeHandler);
  uvResizeHandler = ()=>{ if(!document.body.contains(wrap)){ window.removeEventListener("resize", uvResizeHandler); uvResizeHandler = null; return; } pasHoogteAan(); if(uvZoomModus!=="vrij") pasSchaalAan(); };
  window.addEventListener("resize", uvResizeHandler);
  if(window.ResizeObserver){
    let laatst = "";
    new ResizeObserver(()=>{
      const m = Math.round(canvas.clientWidth/6) + "x" + Math.round(canvas.clientHeight/6);
      if(m===laatst) return;
      laatst = m;
      if(uvZoomModus!=="vrij") pasSchaalAan();
    }).observe(canvas);
  }
  requestAnimationFrame(()=>{ pasHoogteAan(); pasSchaalAan(); });

  teken();
  if(!moduleBibGeladen || !cadosInstGeladen) laadAllesVoorUitvoering().then(()=>{ uvSyncEnOpruimen(kast); if(document.body.contains(wrap)){ hist.laatste = uvKastJson(kast); teken(); } });
  // Lijnen volgen: hover over een draad = enkel die draad duidelijk, de rest vervaagt; hover over een
  // klem = alle draden op die klem.
  let focusSleutel = "";
  canvas.addEventListener("pointermove", ev=>{
    if(sleep || ev.pointerType==="touch") return;
    const svg = canvas.querySelector("svg.uv-svg");
    if(!svg) return;
    const d = ev.target.closest && (ev.target.closest(".uv-draad") || (ev.target.closest(".uv-greep") && uvSelWire && svg.querySelector(`.uv-draad[data-w="${uvSelWire}"]`)));
    const k = !d && ev.target.closest && ev.target.closest(".uv-klem");
    const sl = d ? "w:" + d.getAttribute("data-w") : (k ? "k:" + k.getAttribute("data-m") + "|" + k.getAttribute("data-k") : "");
    if(sl===focusSleutel) return;
    focusSleutel = sl;
    svg.querySelectorAll(".uv-draad.focus").forEach(x=> x.classList.remove("focus"));
    let n = 0;
    if(d){ svg.querySelectorAll(`.uv-draad[data-w="${d.getAttribute("data-w")}"]`).forEach(x=>{ x.classList.add("focus"); n++; }); }
    else if(k){
      const key = uvKlemKey(k.getAttribute("data-m"), k.getAttribute("data-k"));
      svg.querySelectorAll(".uv-draad").forEach(x=>{ if(x.getAttribute("data-ka")===key || x.getAttribute("data-kb")===key){ x.classList.add("focus"); n++; } });
    }
    svg.classList.toggle("focusmodus", n > 0);
  });
  canvas.addEventListener("pointerleave", ()=>{ focusSleutel = ""; const svg = canvas.querySelector("svg.uv-svg"); if(svg){ svg.classList.remove("focusmodus"); svg.querySelectorAll(".uv-draad.focus").forEach(x=> x.classList.remove("focus")); } });
  // Zwevende uitleg bij hoveren: benaming + specs van de module, klem, draad.
  const tipEl = el(`<div class="uv-tip" style="display:none;"></div>`);
  canvasBox.appendChild(tipEl);
  canvas.addEventListener("pointermove", ev=>{
    if(ev.pointerType==="touch" || sleep){ tipEl.style.display = "none"; return; }
    const t = ev.target.closest && ev.target.closest("[data-tip]");
    const tekst = t && t.getAttribute("data-tip");
    if(!tekst){ tipEl.style.display = "none"; return; }
    tipEl.textContent = tekst;
    const rc = canvasBox.getBoundingClientRect();
    tipEl.style.display = "block";
    let lx = ev.clientX - rc.left + 14, ly = ev.clientY - rc.top + 16;
    if(lx + tipEl.offsetWidth > rc.width - 4) lx = Math.max(4, ev.clientX - rc.left - tipEl.offsetWidth - 10);
    if(ly + tipEl.offsetHeight > rc.height - 30) ly = Math.max(4, ev.clientY - rc.top - tipEl.offsetHeight - 10);
    tipEl.style.left = lx + "px"; tipEl.style.top = ly + "px";
  });
  canvas.addEventListener("pointerleave", ()=>{ tipEl.style.display = "none"; toonDraadPreview(null); });
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

/* ---------- niet-bewaarde concepten ----------
   Werk in de bibliotheek-editor of de module-ontwerper gaat nooit meer verloren: klikken naast het
   venster sluit niets, sluiten met wijzigingen vraagt bevestiging, en zolang er niet bewaard is houdt
   CaDos een concept bij (ook na herladen, op dit toestel) om later verder te werken. */
const CONCEPT_KEY = "cados_concepten_v1";
let conceptenGeheugen = (()=>{ try{ return JSON.parse(localStorage.getItem(CONCEPT_KEY)||"{}") || {}; }catch(e){ return {}; } })();
function schrijfConcepten(){
  try{ localStorage.setItem(CONCEPT_KEY, JSON.stringify(conceptenGeheugen)); }
  catch(e){
    // te groot (bv. foto) -> zonder foto bewaren; in het geheugen blijft de foto wel bij
    try{ const kopie = JSON.parse(JSON.stringify(conceptenGeheugen)); Object.values(kopie).forEach(c=>{ if(c && typeof c.t==="string" && /^data:/.test(c.t)) delete c.t; }); localStorage.setItem(CONCEPT_KEY, JSON.stringify(kopie)); }catch(_e){}
  }
}
function bewaarConcept(sleutel, data){ conceptenGeheugen[sleutel] = Object.assign({}, data, {tijd: Date.now()}); schrijfConcepten(); }
function wisConcept(sleutel){ if(conceptenGeheugen[sleutel]){ delete conceptenGeheugen[sleutel]; schrijfConcepten(); } }
function conceptTijd(c){ try{ return new Date(c.tijd).toLocaleString("nl-BE", {day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"}); }catch(e){ return ""; } }
const NIET_BEWAARD_VRAAG = "Je wijzigingen zijn nog niet bewaard.\n\nOK = sluiten (je werk blijft als concept bewaard, je kan later verder)\nAnnuleren = verder werken";

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
  // Mag de editor verlaten worden? Bij niet-bewaarde wijzigingen: concept bewaren + bevestiging vragen.
  ctx.magWeg = ()=>{
    if(ctx.bezig) return false;
    if(ctx.wijzigingen && ctx.wijzigingen()){ ctx.concept(); return confirm(NIET_BEWAARD_VRAAG); }
    return true;
  };
  const onKey = (e)=>{ if(e.key==="Escape" && !document.getElementById("mod-ontwerper") && ctx.magWeg()) ctx.sluit(); };
  ctx.sluit = ()=>{
    if(ctx.conceptTimer) clearInterval(ctx.conceptTimer);
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    if(typeof opts.naSluiten === "function") opts.naSluiten();
  };
  document.addEventListener("keydown", onKey);
  overlay.querySelector(".mbib-close").addEventListener("click", ()=>{ if(ctx.magWeg()) ctx.sluit(); });
  // bewust GEEN sluiten bij klikken naast het venster: dan ging onbewaard werk verloren
  if(opts.nieuw) toonBibEditor(ctx, null); else toonBibLijst(ctx);
}
window.openModuleBibliotheek = openModuleBibliotheek;

function verlaatEditor(ctx){ ctx.wijzigingen = null; if(ctx.conceptTimer){ clearInterval(ctx.conceptTimer); ctx.conceptTimer = null; } }
async function toonBibLijst(ctx){
  verlaatEditor(ctx);
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
    <div class="mbib-concepten"></div>
    <div class="mbib-grid"><div class="mbib-leeg">Bibliotheek laden…</div></div>`;
  wireBibTabs(ctx);
  const cz = ctx.body.querySelector(".mbib-concepten");
  Object.entries(conceptenGeheugen).filter(([k])=> k.startsWith("bib:")).forEach(([k, c])=>{
    const naam = (c.r && ((c.r.naam||"").trim() || bibAutoNaam(c.r))) || "nieuwe module";
    const rij = el(`<div class="mbib-concept">📝 Niet-bewaard concept: <strong>${escapeHtml(naam)}</strong> <span class="mbib-sub">(${escapeHtml(conceptTijd(c))})</span>
      <button type="button" class="mbib-btn primary">Verder bewerken</button><button type="button" class="mbib-btn ghost">Weggooien</button></div>`);
    const [verder, weg] = rij.querySelectorAll("button");
    verder.addEventListener("click", async ()=>{
      const id = c.r && c.r.id;
      let bestaand = null;
      if(id){ try{ await laadModuleBib(); }catch(_e){} bestaand = moduleBib.find(x=> String(x.id)===String(id)) || null; }
      toonBibEditor(ctx, bestaand, c);
    });
    weg.addEventListener("click", ()=>{ if(confirm(`Het concept "${naam}" weggooien?`)){ wisConcept(k); rij.remove(); } });
    cz.appendChild(rij);
  });
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

function toonBibEditor(ctx, bestaand, concept){
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
  const terug = ()=>{ if(!ctx.magWeg()) return; toonBibLijst(ctx); };
  B(".mbib-terugbtn").addEventListener("click", terug);
  B(".mbib-annuleer").addEventListener("click", ()=>{ if(ctx.opts.nieuw && !bestaand){ if(ctx.magWeg()) ctx.sluit(); } else terug(); });

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
      wisConcept(conceptSleutel);
      verlaatEditor(ctx);
      toast("Module bewaard in de bibliotheek");
      if(ctx.opts.kies){ ctx.opts.kies(opgeslagen); ctx.sluit(); }
      else toonBibLijst(ctx);
    }catch(err){
      const msg = String(err && err.message || err);
      alert(/duplicate|unique/i.test(msg) ? `Er bestaat al een module met de naam "${naam}". Kies een andere naam.` : "Bewaren mislukt: "+msg);
      knop.disabled = false; knop.textContent = ctx.opts.kies ? "Bewaren en kiezen" : "Bewaren in bibliotheek";
    }finally{ ctx.bezig = false; }
  });

  const conceptSleutel = "bib:" + (r.id || "nieuw");
  if(concept){
    Object.assign(r, concept.r || {});
    if(Array.isArray(concept.k)) e.klemmen = concept.k.map(k=>({...k}));
    if(concept.w) e.weergave = Object.assign({}, concept.w);
    if(concept.t !== undefined) e.tekening = concept.t;
  }
  tekenForm(); tekenTekening(); tekenKlemlijst();
  if(!concept && !bestaand && !e.klemmen.length){
    // Nieuwe module: alvast de (aangepaste) standaardklemmen van die soort als vertrekpunt.
    const vm = bibModule();
    const sj = sjabloonVoor(vm);
    e.klemmen = ((sj && sj.klemmen && sj.klemmen.length) ? sj.klemmen : standaardKlemmen(vm)).map(k=>({...k}));
    if(sj && sj.weergave) Object.assign(e.weergave, sj.weergave);
    tekenTekening(); tekenVragen();
  }
  const snap = ()=> JSON.stringify({r, k: e.klemmen, w: e.weergave, t: e.tekening});
  const begin = concept ? "" : snap();     // een concept geldt meteen als niet-bewaard
  ctx.wijzigingen = ()=>{ leesForm(); return snap() !== begin; };
  ctx.concept = ()=>{ leesForm(); bewaarConcept(conceptSleutel, JSON.parse(snap())); };
  if(ctx.conceptTimer) clearInterval(ctx.conceptTimer);
  ctx.conceptTimer = setInterval(()=>{ if(!document.body.contains(ctx.body)){ clearInterval(ctx.conceptTimer); return; } if(ctx.wijzigingen && ctx.wijzigingen()) ctx.concept(); }, 4000);
  if(concept) toast("Verder met het niet-bewaarde concept");
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
  let s = `<rect x="1" y="0" width="${w-2}" height="${h}" rx="4" style="fill:${fill}" class="uv-mod-rand"/>`;
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
    const kk = klemKleur(k);
    const c = (kk && kk!=="Wit" && DRAAD_KLEUREN[kk]) || "#14181d";
    s += `<circle cx="${(parseFloat(k.x)||0)*w}" cy="${(parseFloat(k.y)||0)*h}" r="4.5" fill="#fff" stroke="${c}" stroke-width="2"/>`;
  });
  return s + `</svg>`;
}

/* ---------- herbruikbare klem-editor ----------
   o = { getKlemmen(), setKlemmen(v), module() -> module (voor tekening + breedte),
         weergave() -> weergave-object (wordt ter plaatse aangepast),
         tekening() -> foto-url of null, standaard() -> standaardklemmen, onChange() } */
const KLEM_RIJ = { boven: [0.06, 0.17], onder: [0.94, 0.83] };
const KLEM_RIJ_Y = [...KLEM_RIJ.boven, ...KLEM_RIJ.onder];
// Groepeert klemmen met hetzelfde uitgangsnummer op dezelfde rij -> één label tussen de klemmen.
function uitgangGroepen(klemmen){
  const g = {};
  klemmen.forEach(k=>{
    const u = String(k.uitgang||"").trim();
    if(!u) return;
    const key = u + "|" + zijdeVanKlem(k) + "|" + Math.round((parseFloat(k.y)||0)*50);
    (g[key] = g[key] || {uitgang: u, klemmen: []}).klemmen.push(k);
  });
  return Object.values(g).map(gr=>{
    const xs = gr.klemmen.map(k=> parseFloat(k.x)||0);
    return {uitgang: gr.uitgang, x: xs.reduce((a,b)=> a+b, 0)/xs.length, y: parseFloat(gr.klemmen[0].y)||0, enkel: gr.klemmen.length===1, xMax: Math.max(...xs)};
  });
}
function klemEditor(container, o){
  let sel = null, plaatsModus = false, raster = true, sleep = null;
  container.innerHTML = `
    <div class="mbib-rij ke-toolbar">
      <button type="button" class="mbib-btn ghost ke-plaats">＋ Klem plaatsen</button>
      <button type="button" class="mbib-btn ghost ke-knx" title="KNX-busaansluiting: bus+ en bus-">＋ KNX-bus</button>
      <button type="button" class="mbib-btn ghost ke-dali" title="DALI-bus: DA+ en DA-">＋ DALI-bus</button>
      <button type="button" class="mbib-btn ghost ke-uit" title="meerdere uitgangen met hun klemmen in één keer toevoegen">＋ Uitgangen…</button>
      <button type="button" class="mbib-btn ghost ke-vb" title="klemmen bovenaan gelijk verdelen over de breedte">⇔ Verdeel boven</button>
      <button type="button" class="mbib-btn ghost ke-vo" title="klemmen onderaan gelijk verdelen over de breedte">⇔ Verdeel onder</button>
      <button type="button" class="mbib-btn ghost ke-std">Standaardklemmen</button>
      <button type="button" class="mbib-btn ghost ke-wis">Alles wissen</button>
      <label class="ke-raster"><input type="checkbox" checked> raster</label>
    </div>
    <div class="ke-uit-paneel" hidden>
      <div class="ke-uit-grid">
        <label>Aantal uitgangen<input type="number" class="ku-n" min="1" max="32" value="4"></label>
        <label>Klemmen per uitgang<input type="number" class="ku-kpu" min="1" max="4" value="2"></label>
        <label>Voorvoegsel<input class="ku-pre" value="C" maxlength="4"></label>
        <label>Eerste uitgang<input type="number" class="ku-start" min="0" value="1"></label>
        <label>Eerste klemnummer<input type="number" class="ku-klem" min="0" placeholder="leeg = geen"></label>
        <label>Zijde<select class="ku-zijde"><option value="boven">boven</option><option value="onder">onder</option></select></label>
        <label>Rij<select class="ku-rij"><option value="0">rij 1 (buiten)</option><option value="1">rij 2 (binnen)</option></select></label>
        <label>Functie<select class="ku-functie"></select></label>
      </div>
      <label class="ke-raster"><input type="checkbox" class="ku-vervang" checked> bestaande klemmen op die rij vervangen</label>
      <div class="mbib-rij"><button type="button" class="mbib-btn primary ku-ok">Toevoegen</button><button type="button" class="mbib-btn ghost ku-annuleer">Annuleren</button>
      <span class="ke-hint">De uitgangen worden gelijk over de breedte verdeeld — versleep of hernummer nadien gerust.</span></div>
    </div>
    <div class="mbib-tek-wrap"><div class="mbib-tek ke-stage"></div></div>
    <div class="ke-hint">Sleep een klem om hem te verplaatsen · tik op een klem om hem te kiezen · per zijde klikken 2 rijen vast (buiten en binnen).</div>
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
    // twee klemrijen per zijde (rij 1 buiten, rij 2 binnen), daartussen een fijn raster
    const niveau = KLEM_RIJ_Y.find(v=> Math.abs(k.y - v) < 0.055);
    k.y = niveau !== undefined ? niveau : Math.round(k.y/0.02)*0.02;
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
      const kk = klemKleur(k);
      const c = kk && kk!=="Wit" ? DRAAD_KLEUREN[kk] : null;
      if(c) d.style.borderColor = c;
      d.dataset.id = k.id;
      d.innerHTML = `<span>${escapeHtml(String(k.label||"").slice(0,6))}</span>`;
      if(k.uitgang) d.title = "uitgang " + k.uitgang;
      stage.appendChild(d);
    });
    uitgangGroepen(klemmen()).forEach(g=>{
      const t = document.createElement("div");
      t.className = "ke-uitgang";
      t.style.left = ((g.enkel ? g.xMax + 0.06/breedte() : g.x)*100) + "%";
      t.style.top = (g.y*100) + "%";
      t.textContent = g.uitgang;
      stage.appendChild(t);
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
    tbl.innerHTML = `<thead><tr><th>Label</th><th>Uitgang</th><th>Functie</th><th>Kleur</th><th>Zijde</th><th></th></tr></thead><tbody></tbody>`;
    const tb = tbl.querySelector("tbody");
    klemmen().slice().sort((a,b)=> (zijdeVanKlem(a)===zijdeVanKlem(b) ? a.x-b.x : (zijdeVanKlem(a)==="boven" ? -1 : 1))).forEach(k=>{
      const tr = document.createElement("tr");
      if(sel===k.id) tr.className = "sel";
      const lijst = (!k.functie || namen.includes(k.functie)) ? namen : [k.functie, ...namen];
      tr.innerHTML = `<td><input class="kl-label" value="${escapeHtml(k.label||"")}" maxlength="8"></td>
        <td><input class="kl-uitgang" value="${escapeHtml(k.uitgang||"")}" maxlength="8" placeholder="bv. C1"></td>
        <td><select class="kl-functie">${lijst.map(f=>`<option ${f===k.functie?"selected":""}>${escapeHtml(f)}</option>`).join("")}<option value="__nieuw">＋ nieuwe functie…</option></select></td>
        <td><select class="kl-kleur" title="kleur van de klem — een draad neemt die automatisch over"><option value="">volgens functie${klemKleurFunctie(k) ? " ("+klemKleurFunctie(k)+")" : ""}</option>${Object.keys(DRAAD_KLEUREN).map(c=>`<option ${klemKleurExpliciet(k)===c?"selected":""}>${c}</option>`).join("")}</select></td>
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
        k.functie = ev.target.value; teken(); tekenLijst(); changed();
      });
      tr.querySelector(".kl-uitgang").addEventListener("input", ev=>{ const v = ev.target.value.trim(); if(v) k.uitgang = v; else delete k.uitgang; teken(); changed(); });
      tr.querySelector(".kl-kleur").addEventListener("change", ev=>{ if(ev.target.value) k.kleur = ev.target.value; else delete k.kleur; teken(); changed(); });
      tr.querySelector(".kl-zijde").addEventListener("change", ev=>{ k.zijde = ev.target.value; k.y = ev.target.value==="boven" ? Math.min(k.y, 0.49) : Math.max(k.y, 0.51); if(raster){ k.y = KLEM_RIJ[ev.target.value][0]; } teken(); changed(); });
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
  const uitP = Q(".ke-uit-paneel");
  Q(".ke-uit").addEventListener("click", ()=>{
    uitP.hidden = !uitP.hidden;
    const fs = Q(".ku-functie");
    if(!fs.options.length) fs.innerHTML = klemFuncties().map(f=>`<option ${f.naam==="contact"?"selected":""}>${escapeHtml(f.naam)}</option>`).join("");
    // volgende uitgang voorstellen na de hoogste die al bestaat
    const pre = Q(".ku-pre").value || "C";
    const hoogste = klemmen().map(k=> String(k.uitgang||"")).filter(u=> u.startsWith(pre)).map(u=> parseInt(u.slice(pre.length))||0).reduce((a,b)=> Math.max(a,b), 0);
    if(hoogste) Q(".ku-start").value = hoogste + 1;
  });
  Q(".ku-annuleer").addEventListener("click", ()=>{ uitP.hidden = true; });
  Q(".ku-ok").addEventListener("click", ()=>{
    const n = Math.max(1, Math.min(32, parseInt(Q(".ku-n").value)||1));
    const kpu = Math.max(1, Math.min(4, parseInt(Q(".ku-kpu").value)||1));
    const pre = Q(".ku-pre").value.trim();
    const start = parseInt(Q(".ku-start").value); const st = Number.isNaN(start) ? 1 : start;
    const klemStart = parseInt(Q(".ku-klem").value);
    const zijde = Q(".ku-zijde").value, rij = parseInt(Q(".ku-rij").value)||0;
    const functie = Q(".ku-functie").value || "contact";
    const y = KLEM_RIJ[zijde][rij];
    if(Q(".ku-vervang").checked) o.setKlemmen(klemmen().filter(k=> !(zijdeVanKlem(k)===zijde && Math.abs((parseFloat(k.y)||0) - y) < 0.03)));
    const totaal = n*kpu;
    const sp = 1/(totaal + n);          // klemafstand, met een halve plaats tussen de uitgangen
    let nr = klemStart, x = sp;
    for(let u=0; u<n; u++){
      for(let j=0; j<kpu; j++){
        klemmen().push({id: nieuwId(), label: Number.isNaN(nr) ? (pre + (st+u) + (kpu>1 ? "."+(j+1) : "")) : String(nr++),
          uitgang: pre + (st+u), functie, zijde, x: Math.min(0.98, x), y});
        x += sp;
      }
      x += sp;
    }
    uitP.hidden = true;
    teken(); tekenLijst(); changed();
  });
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
  return klemmen.map(k=> Object.assign({ id: String(k.id), label: String(k.label||""), functie: String(k.functie||""), zijde: zijdeVanKlem(k),
    x: Math.round((Number(k.x)||0)*10000)/10000, y: Math.round((Number(k.y)||0)*10000)/10000 }, k.kleur ? {kleur: String(k.kleur)} : {}, k.uitgang ? {uitgang: String(k.uitgang)} : {}));
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
  let breedte = Math.max(1, parseInt(opts.breedte || moduleBreedte(opts.module()) || 1));
  const breedteStart = breedte;
  const modMetBreedte = ()=> Object.assign({}, opts.module(), {breedte});
  let doel = opts.doel || (opts.doelen && opts.doelen[0] && opts.doelen[0].key);
  ov.innerHTML = `<div class="mbib-box" role="dialog" aria-modal="true" aria-label="Module tekenen">
    <div class="mbib-head"><h2>✏️ ${escapeHtml(opts.titel || "Module tekenen")}</h2><button type="button" class="mbib-btn ghost mo-sluit">Sluiten</button></div>
    <div class="mbib-body"><div class="mbib-edit">
      <div class="mbib-col mo-editor"></div>
      <div class="mbib-col">
        ${opts.uitleg ? `<p class="mbib-hint">${opts.uitleg}</p>` : ""}
        <div class="mbib-veld mo-breedte-veld"><label>Breedte (modules van 17,5 mm)</label>
          <div class="mo-breedte-rij"><button type="button" class="mbib-btn ghost mo-bmin" ${opts.breedteVast?"disabled":""}>−</button>
          <input type="number" class="mo-breedte" min="1" max="${opts.maxBreedte||24}" step="1" value="${breedte}" ${opts.breedteVast?"disabled":""}>
          <button type="button" class="mbib-btn ghost mo-bplus" ${opts.breedteVast?"disabled":""}>+</button></div>
          ${opts.breedteVast ? `<small>${escapeHtml(opts.breedteVast)}</small>` : (opts.breedteHint ? `<small>${escapeHtml(opts.breedteHint)}</small>` : "")}</div>
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
  const cSleutel = opts.conceptSleutel ? "ontwerp:" + opts.conceptSleutel : null;
  const snap = ()=> JSON.stringify({klemmen, weergave, breedte});
  let begin = snap();
  const bestaandConcept = cSleutel && conceptenGeheugen[cSleutel];
  if(bestaandConcept){
    if(confirm(`Er is een niet-bewaard concept van deze tekening (${conceptTijd(bestaandConcept)}). Verder met dat concept?\n\nOK = verder met het concept · Annuleren = weggooien`)){
      if(Array.isArray(bestaandConcept.klemmen)) klemmen = bestaandConcept.klemmen.map(k=>({...k}));
      if(bestaandConcept.weergave){ Object.keys(weergave).forEach(k=> delete weergave[k]); Object.assign(weergave, bestaandConcept.weergave); }
      if(bestaandConcept.breedte) breedte = bestaandConcept.breedte;
      begin = "";
    } else wisConcept(cSleutel);
  }
  const gewijzigd = ()=> snap() !== begin;
  const timer = setInterval(()=>{ if(!document.body.contains(ov)){ clearInterval(timer); return; } if(cSleutel && gewijzigd()) bewaarConcept(cSleutel, JSON.parse(snap())); }, 4000);
  const sluit = ()=>{ clearInterval(timer); ov.remove(); document.removeEventListener("keydown", onKey); };
  const probeerSluit = ()=>{
    if(gewijzigd()){
      if(cSleutel) bewaarConcept(cSleutel, JSON.parse(snap()));
      if(!confirm(cSleutel ? NIET_BEWAARD_VRAAG : "Je wijzigingen zijn nog niet bewaard. Toch sluiten?")) return;
    }
    sluit();
  };
  const onKey = (e)=>{ if(e.key==="Escape") probeerSluit(); };
  document.addEventListener("keydown", onKey);
  ov.querySelector(".mo-sluit").addEventListener("click", probeerSluit);
  ov.querySelector(".mo-annuleer").addEventListener("click", probeerSluit);
  // bewust GEEN sluiten bij klikken naast het venster
  ov.querySelectorAll('input[name="mo-doel"]').forEach(r=> r.addEventListener("change", ()=>{
    doel = r.value;
    ov.querySelectorAll(".mo-naam").forEach(n=> n.style.display = n.dataset.voor===doel ? "" : "none");
  }));
  const ke = klemEditor(ov.querySelector(".mo-editor"), {
    getKlemmen: ()=> klemmen, setKlemmen: (v)=>{ klemmen = v; },
    module: modMetBreedte, weergave: ()=> weergave,
    tekening: ()=> (opts.tekening && weergave.foto !== false) ? opts.tekening : null,
    fotoBeschikbaar: ()=> !!opts.tekening,
    standaard: opts.standaard ? ()=> opts.standaard(breedte) : (()=> standaardKlemmen(modMetBreedte()))
  });
  const bInp = ov.querySelector(".mo-breedte");
  const zetBreedte = (b)=>{ breedte = Math.max(1, Math.min(opts.maxBreedte||24, parseInt(b)||1)); bInp.value = breedte; ke.teken(); };
  bInp.addEventListener("change", e=> zetBreedte(e.target.value));
  ov.querySelector(".mo-bmin").addEventListener("click", ()=> zetBreedte(breedte-1));
  ov.querySelector(".mo-bplus").addEventListener("click", ()=> zetBreedte(breedte+1));
  if(opts.herstel) ov.querySelector(".mo-herstel").addEventListener("click", async ()=>{
    if(!confirm(opts.herstel.vraag || "Terug naar de standaard?")) return;
    try{ await opts.herstel.fn(); if(cSleutel) wisConcept(cSleutel); sluit(); }catch(e){ alert("Mislukt: "+(e.message||e)); }
  });
  ov.querySelector(".mo-bewaar").addEventListener("click", async ()=>{
    const knop = ov.querySelector(".mo-bewaar");
    const naamInp = ov.querySelector(`.mo-naam[data-voor="${doel}"]`);
    const extra = { naam: naamInp ? naamInp.value.trim() : "", breedte, breedteGewijzigd: breedte!==breedteStart };
    if(extra.breedteGewijzigd && opts.controleerBreedte){ const msg = opts.controleerBreedte(breedte); if(msg && !confirm(msg)) return; }
    if(naamInp && !extra.naam){ alert("Geef de bibliotheekmodule een naam."); naamInp.focus(); return; }
    knop.disabled = true; knop.textContent = "Bewaren…";
    try{
      await opts.onOpslaan(klemmenOpslaanVorm(klemmen), weergaveOpslaanVorm(weergave), doel, extra);
      if(cSleutel) wisConcept(cSleutel);
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
    conceptSleutel: "module:" + m.id,
    uitleg: "Pas de tekening en de aansluitklemmen aan. De breedte volgt uit de layout. Draden naar klemmen die je verwijdert, verdwijnen mee.",
    module: ()=> m,
    breedte: moduleBreedte(m),
    maxBreedte: (kastVanModule(m.id)||{}).maat || 24,
    breedteVast: m.categorie==="Rijgklemmenmodule" ? "Automatisch: 7 rijgklemmen per 2 modules." : "",
    breedteHint: AUTO_BREEDTE_CATS.includes(m.categorie) ? "Standaard 1 module per pool — pas aan voor compacte of brede toestellen. Ook zichtbaar in de layout." : "Ook zichtbaar in de layout.",
    controleerBreedte: (b)=>{
      const kast = kastVanModule(m.id);
      const rij = kast && kast.rijen.find(r=> r.items.includes(m));
      if(!rij) return "";
      const gebruikt = rij.items.reduce((t, it)=> t + (it===m ? b : moduleBreedte(it)), 0);
      return gebruikt > kast.maat ? `Met ${b} modules is deze rij ${gebruikt}/${kast.maat} — ${gebruikt-kast.maat} te veel. Toch bewaren? (verplaats nadien een module in de layout)` : "";
    },
    klemmen: klemmenVoorModule(m),
    weergave: Object.assign({}, (sjabloonVoor(m)||{}).weergave || {}, (m.bib && m.bib.weergave) || {}, m.weergave || {}),
    tekening: (m.bib && m.bib.tekening_url) || null,
    standaard: (b)=> standaardKlemmen(Object.assign({}, m, {breedte: b})),
    doelen, doel: "eigen",
    herstel: eigen ? {label: "Eigen aanpassing wissen", vraag: "De eigen aanpassing van deze module wissen? Ze volgt dan weer de bibliotheek / standaard.", fn: async ()=>{ delete m.klemmenEigen; delete m.weergave; save(); if(naOpslaan) naOpslaan(); }} : null,
    onOpslaan: async (klemmen, weergave, doel, extra)=>{
      // De breedte is fysiek: ze geldt altijd voor deze module in de layout, welk doel je ook kiest.
      if(extra.breedteGewijzigd && m.categorie!=="Rijgklemmenmodule") m.breedte = extra.breedte;
      if(doel==="eigen"){ m.klemmenEigen = klemmen; m.weergave = weergave; }
      else if(doel==="sjabloon"){ await bewaarCadosInst("sjabloon:"+sl, {klemmen, weergave, breedte: extra.breedte}); delete m.klemmenEigen; delete m.weergave; }
      else if(doel==="bib"){
        await laadModuleBib(true);
        const row = moduleBib.find(r=> String(r.id)===String(m.bibId));
        if(!row) throw new Error("Bibliotheekmodule niet meer gevonden");
        const upd = await window.dbSaveModule(Object.assign({}, row, {klemmen, breedte: extra.breedte, specs: Object.assign({}, row.specs||{}, {weergave})}));
        await laadModuleBib(true);
        m.bib = bibSnapshot(upd || Object.assign({}, row, {klemmen, specs: Object.assign({}, row.specs||{}, {weergave})}));
        delete m.klemmenEigen; delete m.weergave;
      } else if(doel==="nieuwbib"){
        const row = await window.dbSaveModule({
          naam: extra.naam, merk: "", artikelnr: "", categorie: m.categorie, polen: m.polen||"",
          stroom: m.A ? String(parseFloat(m.A)||"") : "", curve: m.curve||"", kortsluit: m.kA||"",
          gevoeligheid: m.mA ? String(parseFloat(m.mA)||"") : "", diff_type: m.diffType||"",
          breedte: extra.breedte || moduleBreedte(m) || 1, info: "", klemmen, tekening_url: null, specs: {weergave}
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
  verlaatEditor(ctx);
  ctx.tab = "sjablonen";
  ctx.body.innerHTML = bibTabsHtml(ctx) + `<p class="mbib-hint">Zo worden de modules getekend die (nog) niet aan een bibliotheekmodule gekoppeld zijn — in alle projecten. Pas klemmen en tekening aan per soort; een module kan daarnaast nog zijn eigen aanpassing krijgen in het Uitvoeringsplan.</p><div class="mbib-grid"><div class="mbib-leeg">Laden…</div></div>`;
  wireBibTabs(ctx);
  try{ await laadCadosInst(true); }catch(e){ ctx.body.querySelector(".mbib-grid").innerHTML = `<div class="mbib-leeg mbib-fout">Kon de instellingen niet laden: ${escapeHtml(e.message||String(e))}</div>`; return; }
  const grid = ctx.body.querySelector(".mbib-grid");
  grid.innerHTML = "";
  SJABLOON_SOORTEN.forEach(sl=>{
    const m = sjabloonVoorbeeldModule(sl);
    const sj = cadosInst["sjabloon:"+sl];
    if(sj && Number(sj.breedte) > 0) m.breedte = Number(sj.breedte);
    const klemmen = sj && Array.isArray(sj.klemmen) && sj.klemmen.length ? sj.klemmen : standaardKlemmen(m);
    const wg = Object.assign(standaardWeergave(m), (sj && sj.weergave) || {});
    const card = document.createElement("div");
    card.className = "mbib-card";
    card.innerHTML = `<div class="mbib-thumb">${miniModuleSvg(m, klemmen, wg)}</div>
      <div class="mbib-card-body"><div class="mbib-card-naam">${escapeHtml(sjabloonLabel(sl))}</div>
      <div class="mbib-card-spec">${m.breedte} mod. · ${klemmen.length} klemmen${sj ? ' · <strong class="mbib-aangepast">aangepast</strong>' : " · standaard"}</div>
      <div class="mbib-card-acties"><button type="button" class="mbib-btn primary sj-edit">Aanpassen</button>
      ${sj ? `<button type="button" class="mbib-btn ghost sj-reset">Standaard herstellen</button>` : ""}</div></div>`;
    card.querySelector(".sj-edit").addEventListener("click", ()=> openModuleOntwerper({
      titel: `Standaardmodule — ${sjabloonLabel(sl)}`,
      conceptSleutel: "sjabloon:" + sl,
      uitleg: "Dit wordt de tekening en klemindeling voor elke module van deze soort zonder bibliotheekmodule of eigen aanpassing, in alle projecten.",
      module: ()=> m, klemmen, weergave: Object.assign({}, (sj && sj.weergave) || {}),
      breedte: m.breedte, breedteHint: "Standaardbreedte voor nieuwe modules van deze soort in de layout. Bestaande modules behouden hun breedte.",
      standaard: (b)=> standaardKlemmen(Object.assign({}, m, {breedte: b})),
      doelen: [{key: "sjabloon", label: `Standaard voor alle "${sjabloonLabel(sl)}"-modules (alle projecten)`}], doel: "sjabloon",
      onOpslaan: async (kl, wg2, _d, extra)=>{ await bewaarCadosInst("sjabloon:"+sl, {klemmen: kl, weergave: wg2, breedte: extra.breedte}); toonSjablonen(ctx); }
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
  verlaatEditor(ctx);
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

// Standaardbreedte van een soort (aangepaste standaardmodule), gebruikt bij het kiezen van de
// soort in de layout. Geeft null als er geen aangepaste breedte is (dan geldt de gewone regel).
function sjabloonBreedte(cat, polen){
  if(!cat || cat==="Leeg" || cat==="Rijgklemmenmodule") return null;
  const sj = cadosInst["sjabloon:" + sjabloonSleutel({categorie: cat, polen})];
  const b = sj ? parseInt(sj.breedte) : 0;
  return b > 0 ? b : null;
}

/* ---------- kleur per klem -> draad ----------
   Elke klem heeft een kleur: een expliciet gekozen kleur (of de aderkleur van een rijgklem), anders
   de kleur van zijn klemfunctie (bus+ rood, bus- zwart, L bruin, N blauw, PE geel/groen, ...).
   Draden met "kleur volgt klem" (standaard) nemen die kleur automatisch over, ook achteraf. */
function klemKleurExpliciet(k){ return (k && aderKleurNaarDraad(k.kleur)) || null; }
function klemKleurFunctie(k){
  if(!k) return null;
  const f = klemFunctieKleur(k.functie || k.label);
  return f && DRAAD_KLEUREN[f] ? f : null;
}
function klemKleur(k){ return klemKleurExpliciet(k) || klemKleurFunctie(k); }
function draadKleurVoorKlemmen(ka, kb){
  return klemKleurExpliciet(ka) || klemKleurExpliciet(kb) || klemKleurFunctie(ka) || klemKleurFunctie(kb) || null;
}

/* ---------- rijgklemmen gegroepeerd per kabel ----------
   Klemmen die bij dezelfde kabel horen (zelfde bron via Snelmodus, of zelfde info + kamer) vormen een
   groep: tussen twee kabels komt een tussenruimte met scheidingslijn, en gecentreerd boven de groep
   staan de naam van de kabel, het kabeltype en de locatie. */
const RK_TUSSENRUIMTE = 0.8;   // in klembreedtes
function rijgklemKabelNaam(k){
  const ww = (k.onder && k.onder.watwaar) || (k.boven && k.boven.watwaar) || "";
  // enkel als de tekst het patroon van de Snelmodus heeft ("<kabel> - ader N"); vrije tekst zoals
  // "Keuken spots L" / "Keuken spots N" hoort bij dezelfde kabel en valt terug op info + kamer
  const m = ww.match(/^(.*?)\s*[-–]\s*ader\s*\d+\s*$/i);
  return m ? m[1].trim() : "";
}
function rijgklemAderNr(k){ return parseInt((k.onder && k.onder.aderNr) || (k.boven && k.boven.aderNr)) || 0; }
// kabeltype van een groep: op de klem zelf bewaard (Snelmodus / zijpaneel), anders van de bron
// (bv. verlichting "101 — TBP" -> typeKabel), anders het aantal aders
function rijgklemKabelInfo(k, naam){
  if(k.kabeltype) return {kabel: k.kabeltype};
  if(typeof snelmodusBronnen !== "function") return {kabel: ""};
  const types = k.bronType ? [k.bronType] : ["verlichting","verwarming","laadpalen","motoren","zekeringen"];
  for(const t of types){
    try{
      const lijst = snelmodusBronnen(t) || [];
      const b = k.bronId ? lijst.find(x=> x.id===k.bronId) : (naam ? lijst.find(x=> String(x.label||"").trim()===naam) : null);
      if(b) return {kabel: b.kabeltype || "", naam: b.label || ""};
    }catch(_e){}
  }
  return {kabel: ""};
}
/* Groepering per kabel (2026-10-29, Peter: "waarom lopen 102, 103 en 104 hier door elkaar"): eerst
   de bron, anders de kabelnaam uit "wat/waar" (bv. "103 — TBP" uit "103 — TBP - ader 2"), anders
   info + kamer. Begint de adernummering opnieuw bij 1, dan is het ook een nieuwe kabel. */
function rijgklemIndeling(m){
  const items = (state.interlex && state.interlex.items) || [];
  const ids = m.rijgklemKlemIds || [];
  const groepen = [];
  ids.forEach((kid, i)=>{
    const k = items.find(x=> x.id===kid) || {};
    const kn = rijgklemKabelNaam(k);
    const sleutel = k.bronId ? "b:"+k.bronType+"|"+k.bronId : (kn ? "w:"+kn+"|"+(k.kamer||"") : ((k.info || k.kamer) ? "i:"+(k.info||"")+"|"+(k.kamer||"") : "x:"+kid));
    const nr = rijgklemAderNr(k);
    const vorige = groepen[groepen.length-1];
    const nieuweKabel = vorige && nr && vorige.laatsteNr && nr <= vorige.laatsteNr;
    if(vorige && vorige.sleutel===sleutel && !sleutel.startsWith("x:") && !nieuweKabel){ vorige.leden.push(i); vorige.laatsteNr = nr; }
    else groepen.push({sleutel, leden: [i], klem: k, klemIds: [], laatsteNr: nr});
    groepen[groepen.length-1].klemIds.push(kid);
  });
  groepen.forEach(g=>{
    const k = g.klem;
    let naam = rijgklemKabelNaam(k);
    const info = rijgklemKabelInfo(k, naam);
    if(!naam) naam = info.naam || k.info || "";
    g.naam = naam;
    g.kabel = info.kabel || (g.leden.length > 1 ? g.leden.length + " aders" : "");
    g.kabelBekend = !!info.kabel;
    g.locatie = k.kamer || "";
    g.toon = !g.sleutel.startsWith("x:") && !!(g.naam || g.locatie);
  });
  // posities: een tussenruimte tussen twee groepen als minstens één van beide een kabelgroep is
  let pos = 0;
  const posVan = [];
  groepen.forEach((g, gi)=>{
    if(gi > 0 && (g.toon || groepen[gi-1].toon)) pos += RK_TUSSENRUIMTE;
    g.start = pos;
    g.leden.forEach(i=>{ posVan[i] = pos; pos += 1; });
    g.eind = pos;
  });
  const eenheden = Math.max(1, pos);
  return { eenheden, groepen, xs: ids.map((_, i)=> (posVan[i] + 0.5)/eenheden) };
}
/* Doorsnede volgens de kabel (2026-10-29, Peter: "als er bv. een 5G1,5 op de klemmen zit, mag de
   verbinding ook met 1,5 uitgevoerd worden"). Een draad naar een rijgklem neemt de doorsnede van de
   kabel op die klem over (5G1,5 -> 1.5 mm², 3G2.5 -> 2.5 mm²); zolang je hem niet zelf wijzigt, volgt
   hij ook later een gewijzigd kabeltype. */
function sectieUitKabel(kabel){
  const t = String(kabel||"").replace(/,/g, ".");
  const alle = [...t.matchAll(/(?<=\d)\s*[gGxX×]\s*(\d+(?:\.\d+)?)/g)];
  const m = alle.length ? alle[alle.length-1] : t.match(/(\d+(?:\.\d+)?)\s*mm/);
  if(!m) return null;
  const v = parseFloat(m[1]);
  if(!(v > 0)) return null;
  let best = null, d = Infinity;
  DRAAD_SECTIES.forEach(x=>{ const dd = Math.abs(parseFloat(x) - v); if(dd < d){ d = dd; best = x; } });
  return d < 0.11 ? best : null;
}
function uvKabelVanKlem(m, k){
  if(!m || !k || m.categorie!=="Rijgklemmenmodule" || !k.rijgSoort) return "";
  const kid = String(k.id).replace(/^r[kp]2?_/, "");
  const g = rijgklemIndeling(m).groepen.find(g=> g.klemIds.includes(kid));
  return g && g.kabelBekend ? g.kabel : "";
}
function uvSectieVoorKlemmen(ma, ka, mb, kb){
  return sectieUitKabel(uvKabelVanKlem(ma, ka)) || sectieUitKabel(uvKabelVanKlem(mb, kb)) || null;
}
function rijgklemGroepenSvg(m, x, y, w, h){
  const ind = rijgklemIndeling(m);
  let s = "";
  ind.groepen.forEach((g, gi)=>{
    const x0 = x + g.start/ind.eenheden*w, x1 = x + g.eind/ind.eenheden*w;
    if(gi > 0 && (g.toon || ind.groepen[gi-1].toon)){
      const xs = x + (g.start - RK_TUSSENRUIMTE/2)/ind.eenheden*w;
      s += `<line x1="${xs}" y1="${y+4}" x2="${xs}" y2="${y+h-4}" class="uv-rk-scheiding"/>`;
    }
    if(!g.toon) return;
    const r1 = g.naam || g.locatie, r2 = [g.kabel, g.naam ? g.locatie : ""].filter(Boolean).join(" · ");
    const tipTekst = [g.naam, g.kabel ? "kabel " + g.kabel : "", g.locatie, g.leden.length + " klem(men)"].filter(Boolean).join(" · ");
    const breed = x1 - x0, cx = (x0 + x1)/2, cy = y + h/2;
    const lang = Math.max(r1.length, r2.length) * 5.4;
    if(breed >= lang + 6){
      s += `<text x="${cx}" y="${cy - (r2 ? 2 : -3)}" class="uv-rk-kabel">${escapeHtml(r1)}</text>`;
      if(r2) s += `<text x="${cx}" y="${cy + 10}" class="uv-rk-kabel sub">${escapeHtml(r2)}</text>`;
    } else {
      const max = Math.floor((h - 70)/5.4);
      s += `<text transform="translate(${cx - (r2 ? 4 : -3)} ${cy}) rotate(-90)" class="uv-rk-kabel">${escapeHtml(r1.slice(0, max))}</text>`;
      const max2 = Math.floor((h - 56)/4.3);
      const r2k = r2.length > max2 ? (g.kabel || r2).slice(0, max2) : r2;
      if(r2 && breed >= 18) s += `<text transform="translate(${cx + 7} ${cy}) rotate(-90)" class="uv-rk-kabel sub">${escapeHtml(r2k)}</text>`;
    }
    s += `<rect x="${x0+1}" y="${y+24}" width="${Math.max(2, x1-x0-2)}" height="${h-48}" rx="3" class="uv-rk-groep" data-tip="${escapeHtml(tipTekst)}"></rect>`;
  });
  return s;
}

/* Rijgklemmen opnieuw koppelen aan hun bron (2026-10-29, Peter: "ik heb de armaturen aangepast in
   Verlichting 230V — hoe komt die info ook in de klemmenlijst?"). Klemmen die via de Snelmodus
   gemaakt zijn, volgen hun bron automatisch (naam, kamer, info). Klemmen die die koppeling kwijt zijn
   (bv. oudere klemmen), worden hier opnieuw gekoppeld op basis van de code in "wat/waar"
   ("101 — TBP - ader 1" -> verlichting 101), daarna volgt alles weer vanzelf. */
const RK_BRON_TYPES = ["verlichting","verwarming","laadpalen","motoren","zekeringen"];
function herkoppelKlemBronnen(){
  const items = (state.interlex && state.interlex.items) || [];
  const gebruikt = (state.interlex && state.interlex.gebruikteBronnen) || [];
  const isGebruikt = (t, id)=> gebruikt.some(g=> g.bronType===t && g.bronId===id);
  const alle = [];
  RK_BRON_TYPES.forEach(t=>{ try{ (snelmodusBronnen(t) || []).forEach(b=> alle.push(Object.assign({type: t}, b))); }catch(_e){} });
  const codeVan = (label)=> String(label||"").split(" — ")[0].trim();
  const restVan = (label)=> String(label||"").split(" — ").slice(2).join(" — ").trim();   // bv. "kabel 2"
  const kabelNaam = (k)=>{
    for(const z of [k.onder, k.boven]){
      const m = z && String(z.watwaar||"").match(/^(.*?)\s*[-–]\s*ader\s*\d+\s*$/i);
      if(m) return m[1].trim();
    }
    return "";
  };
  let gekoppeld = 0;
  const kabels = new Map();   // bron-sleutel -> {bron, n}
  items.forEach(k=>{
    if(k.bronType && k.bronId) return;
    const naam = kabelNaam(k);
    if(!naam) return;
    let kand = alle.filter(b=> String(b.label||"").trim()===naam);
    if(!kand.length){
      const code = codeVan(naam), rest = restVan(naam);
      if(!code) return;
      kand = alle.filter(b=> codeVan(b.label)===code && restVan(b.label)===rest);
    }
    if(kand.length > 1){ const g = kand.filter(b=> isGebruikt(b.type, b.id)); if(g.length) kand = g; }
    if(kand.length > 1 && k.kamer){ const g = kand.filter(b=> (b.kamer||"")===k.kamer); if(g.length) kand = g; }
    if(kand.length !== 1) return;
    const b = kand[0];
    k.bronType = b.type; k.bronId = b.id;
    if(!isGebruikt(b.type, b.id)) gebruikt.push({bronType: b.type, bronId: b.id});
    gekoppeld++;
  });
  // controle: past het aantal klemmen bij het kabeltype van de bron?
  items.forEach(k=>{
    if(!k.bronType || !k.bronId) return;
    const sl = k.bronType + "|" + k.bronId;
    if(!kabels.has(sl)){ const b = alle.find(x=> x.type===k.bronType && x.id===k.bronId); kabels.set(sl, {bron: b, n: 0}); }
    const e = kabels.get(sl);
    e.n += [k.onder, k.boven].filter(z=> z && z.aderNr).length || 1;
  });
  const afwijkend = [];
  kabels.forEach(({bron, n})=>{
    if(!bron || !bron.kabeltype) return;
    const aders = typeof parseAderAantalUitKabel === "function" ? parseAderAantalUitKabel(bron.kabeltype) : 0;
    if(aders && aders !== n) afwijkend.push(`${bron.label}: ${bron.kabeltype} = ${aders} aders, ${n} op de klemmen`);
  });
  return {gekoppeld, afwijkend};
}

/* Zekeringkast: "voedingskabel komt op klemmen" aangevinkt -> automatisch rijgklemmen (2026-10-29, Peter:
   "In ontwerp van zekeringkast kun je aanvinken of deze dient gekableerd te worden op klemmen. Dan komt
   er automatisch een klem bij"). Per kabel (kabelAantal) zoveel klemmen als het kabeltype aders heeft
   (zonder de aarding, zoals de Snelmodus), gekoppeld aan de zekering zodat naam/kamer meevolgen, en
   meteen op de rijgklemmenmodule van dezelfde kast als die er is. Vink je het af, dan verdwijnen enkel
   de automatisch aangemaakte klemmen weer. */
function autoZekeringKlemmen(){
  if(!state.interlex || !Array.isArray(state.interlex.items) || typeof snelmodusBronnen !== "function") return false;
  const il = state.interlex;
  if(!Array.isArray(il.gebruikteBronnen)) il.gebruikteBronnen = [];
  let gewijzigd = false;
  const bronnen = snelmodusBronnen("zekeringen");
  const gewenst = new Set(bronnen.map(b=> b.id));
  // 1. automatisch aangemaakte klemmen waarvan de kabel niet meer op klemmen komt: weg
  const weg = il.items.filter(k=> k.autoZek && !gewenst.has(k.bronId));
  if(weg.length){
    const ids = new Set(weg.map(k=> k.id));
    il.items = il.items.filter(k=> !ids.has(k.id));
    il.gebruikteBronnen = il.gebruikteBronnen.filter(g=> !(g.bronType==="zekeringen" && weg.some(k=> k.bronId===g.bronId)));
    state.zekeringen.kasten.forEach(kast=> kast.rijen.forEach(r=> r.items.forEach(m=>{
      if(m.categorie==="Rijgklemmenmodule" && Array.isArray(m.rijgklemKlemIds) && m.rijgklemKlemIds.some(id=> ids.has(id))){
        m.rijgklemKlemIds = m.rijgklemKlemIds.filter(id=> !ids.has(id));
        if(typeof berekenRijgklemBreedte==="function") m.breedte = berekenRijgklemBreedte(m.rijgklemKlemIds.length);
      }
    })));
    gewijzigd = true;
  }
  // 2. nieuwe kabels op klemmen: klemmen aanmaken
  const dubbel = il.type === "dubbel";
  bronnen.forEach(b=>{
    const bestaat = il.items.some(k=> k.bronType==="zekeringen" && k.bronId===b.id) ||
      il.gebruikteBronnen.some(g=> g.bronType==="zekeringen" && g.bronId===b.id) ||
      il.items.some(k=> k.onder && String(k.onder.watwaar||"").startsWith(b.label + " - ader"));
    if(bestaat) return;
    const n = (typeof parseAderAantalUitKabel==="function" && parseAderAantalUitKabel(b.kabeltype)) || 2;
    const nieuw = [];
    let klem = null;
    for(let i=1; i<=n; i++){
      const zijde = (dubbel && i%2===0) ? "boven" : "onder";
      if(zijde==="onder"){
        klem = typeof newKlem==="function" ? newKlem() : {id: cryptoId(), kamer: "", info: "", onder: {kleur: "", watwaar: "", aansluiting: "", aderNr: 0}, boven: {kleur: "", watwaar: "", aansluiting: "", aderNr: 0}};
        klem.kamer = b.kamer || ""; klem.info = b.info || "";
        klem.bronType = "zekeringen"; klem.bronId = b.id; klem.autoZek = true;
        if(b.kabeltype) klem.kabeltype = b.kabeltype;
        nieuw.push(klem);
      }
      klem[zijde].watwaar = [b.label, "ader " + i].filter(Boolean).join(" - ");
      klem[zijde].kleur = (il.standaardKleuren || [])[i-1] || "";
      klem[zijde].aderNr = i;
    }
    il.items.push(...nieuw);
    il.gebruikteBronnen.push({bronType: "zekeringen", bronId: b.id});
    // op de rijgklemmenmodule van de kast waar de zekering in zit
    const modId = String(b.id).split("::")[0];
    const kast = state.zekeringen.kasten.find(k=> k.rijen.some(r=> r.items.some(m=> m.id===modId)));
    const rk = kast && kast.rijen.flatMap(r=> r.items).find(m=> m.categorie==="Rijgklemmenmodule");
    if(rk){
      rk.rijgklemKlemIds = (rk.rijgklemKlemIds || []).concat(nieuw.map(k=> k.id));
      if(typeof berekenRijgklemBreedte==="function") rk.breedte = berekenRijgklemBreedte(rk.rijgklemKlemIds.length);
    }
    gewijzigd = true;
  });
  return gewijzigd;
}
