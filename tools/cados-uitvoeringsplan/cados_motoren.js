
/* =========================================================================
   MOTOREN — screens, gordijnen, rolluiken, ... (2026-10-28, op vraag van Peter: "Ook motoren
   (screens/gordijnen/rolluiken) moeten hierin een optie worden.")
   Een eigen onderdeel (aan/uit te vinken bij "Onderdelen van dit project") met per motor: soort,
   benaming, kamer, sturing, de relaisuitgangen voor OP en NEER (gekoppeld aan de uitgangen van een
   Relais/HVAC-module in de zekeringkast — van beide kanten in te stellen), voedende automaat, kabel,
   vermogen, eindeloop ingesteld en opmerking. Motoren zijn ook een bron in de Snelmodus van de
   Rijgklemmen en hebben een eigen werf-export.
   ========================================================================= */
const MOTOR_SOORTEN = ["Rolluik","Screen","Gordijn","Zonnetent","Dakraam / Velux","Lamellendak","Poort / garagepoort","Andere"];
const MOTOR_STURINGEN = [
  {key:"relais", label:"230V relais (op/neer)", kabel:"4G1.5", uitgangen:true},
  {key:"knx", label:"KNX-motoractor", kabel:"4G1.5", uitgangen:true},
  {key:"rts", label:"Radio (Somfy RTS)", kabel:"3G1.5", uitgangen:false},
  {key:"io", label:"Radio (Somfy io)", kabel:"3G1.5", uitgangen:false},
  {key:"dc", label:"24V DC", kabel:"2x1.5", uitgangen:true},
  {key:"lokaal", label:"Lokale schakelaar", kabel:"4G1.5", uitgangen:false},
  {key:"andere", label:"Andere", kabel:"", uitgangen:true},
];
function motorSturing(key){ return MOTOR_STURINGEN.find(s=> s.key===key) || MOTOR_STURINGEN[0]; }
function newMotorItem(vorige){
  const v = vorige || {};
  const st = v.sturing || "relais";
  return {id: cryptoId(), soort: v.soort || "Rolluik", naam: "", kamer: v.kamer || "", sturing: st,
    zekeringModuleId: v.zekeringModuleId || "", kabel: motorSturing(st).kabel, vermogen: "", eindeloop: false, info: ""};
}
function computeMotorCodes(){
  const out = {};
  ((state.motoren && state.motoren.items) || []).forEach((m, i)=>{ out[m.id] = "M" + (i+1); });
  return out;
}
// uitgangen (Relais/HVAC) die aan deze motor gekoppeld zijn, als {op, neer}
function motorUitgangen(motor){
  const lijst = alleZekeringUitgangen().filter(e=> e.uitgang.type==="motor" && e.uitgang.targetId===motor.id);
  let op = lijst.find(e=> e.uitgang.rol==="op") || null;
  let neer = lijst.find(e=> e.uitgang.rol==="neer") || null;
  lijst.filter(e=> !e.uitgang.rol).forEach(e=>{ if(!op) op = e; else if(!neer && e!==op) neer = e; });
  return {op, neer, alle: lijst};
}
function motorUitgangLabel(entry, codes){
  if(!entry) return "";
  const c = (codes || computeZekeringCodes())[entry.module.id];
  const mod = [c, entry.module.naam || (MODULE_CATEGORIEEN[entry.module.categorie] ? MODULE_CATEGORIEEN[entry.module.categorie].label : entry.module.categorie)].filter(Boolean).join(" ");
  return `${mod} · U${entry.index+1}`;
}
function zetMotorUitgang(motor, rol, uitgangId){
  const huidig = motorUitgangen(motor)[rol];
  if(huidig && huidig.uitgang.id===uitgangId) return true;
  let doel = null;
  if(uitgangId){
    doel = alleZekeringUitgangen().find(e=> e.uitgang.id===uitgangId);
    if(!doel) return false;
    const u = doel.uitgang;
    if(u.targetId && !(u.type==="motor" && u.targetId===motor.id)){
      if(!confirm(`Uitgang ${motorUitgangLabel(doel)} is al gekoppeld aan ${uitgangTargetLabel(u)}.\nOntkoppelen en aan deze motor hangen?`)) return false;
    }
  }
  if(huidig){ huidig.uitgang.type = "kring"; huidig.uitgang.targetId = ""; delete huidig.uitgang.rol; }
  if(doel){ doel.uitgang.type = "motor"; doel.uitgang.targetId = motor.id; doel.uitgang.rol = rol; }
  return true;
}
function ontkoppelMotor(motor){
  motorUitgangen(motor).alle.forEach(e=>{ e.uitgang.type = "kring"; e.uitgang.targetId = ""; delete e.uitgang.rol; });
}
// voor de module-editor (Relais/HVAC): keuzelijst met motoren
function motorUitgangOpties(u){
  const codes = computeMotorCodes();
  return ((state.motoren && state.motoren.items) || []).map(m=> `<option value="${m.id}" ${u.targetId===m.id?"selected":""}>${escapeHtml(motorOmschrijving(m, codes[m.id]))}</option>`).join("");
}
function motorOmschrijving(m, code){
  return [code, m.soort, m.kamer, m.naam].filter(Boolean).join(" - ");
}
function motorCodeVoorUitgang(u){
  const m = ((state.motoren && state.motoren.items) || []).find(x=> x.id===u.targetId);
  if(!m) return null;
  return computeMotorCodes()[m.id] + (u.rol==="op" ? "▲" : (u.rol==="neer" ? "▼" : ""));
}
function motorTargetLabel(u){
  const m = ((state.motoren && state.motoren.items) || []).find(x=> x.id===u.targetId);
  if(!m) return "— niet gekoppeld —";
  return "Motor: " + motorOmschrijving(m, computeMotorCodes()[m.id]) + (u.rol==="op" ? " (op)" : (u.rol==="neer" ? " (neer)" : ""));
}
function motorSpecText(m){
  return [m.kamer, motorSturing(m.sturing).label, m.kabel, m.vermogen ? m.vermogen+" W" : ""].filter(Boolean).join(" · ");
}

function exportMotorenVoorWerf(standalone=true){
  const items = (state.motoren && state.motoren.items) || [];
  if(items.length===0){ if(standalone) alert("Er staan nog geen motoren in de lijst om te exporteren."); return; }
  const codes = computeMotorCodes();
  const container = document.getElementById("printExport");
  if(standalone) container.innerHTML = "";
  const projectNaam = state.instellingen.project || "Naamloos project";
  const adres = state.instellingen.adres || "";
  const automaten = alleZekeringAutomaten();
  const page = el(`<div class="pe-page" data-content="lijst">
    <div class="pe-title">${escapeHtml(projectNaam)}</div>
    <div class="pe-sub">Motoren (screens, gordijnen, rolluiken) — overzicht${adres?" · "+escapeHtml(adres):""} · geëxporteerd op ${new Date().toLocaleDateString("nl-BE")}</div>
    <table class="pe-porttable">
      <thead><tr><th>Nr.</th><th>Soort</th><th>Benaming</th><th>Kamer</th><th>Sturing</th><th>Uitgang ▲ op</th><th>Uitgang ▼ neer</th><th>Automaat</th><th>Kabel</th><th>W</th><th>Eindeloop</th><th>Opmerking</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>`);
  const tbody = page.querySelector("tbody");
  items.forEach(m=>{
    const ug = motorUitgangen(m);
    const automaat = automaten.find(a=> a.id===m.zekeringModuleId);
    tbody.appendChild(el(`<tr>
      <td>${escapeHtml(codes[m.id])}</td><td>${escapeHtml(m.soort)}</td><td>${escapeHtml(m.naam)}</td><td>${escapeHtml(m.kamer)}</td>
      <td>${escapeHtml(motorSturing(m.sturing).label)}</td><td>${escapeHtml(motorUitgangLabel(ug.op))}</td><td>${escapeHtml(motorUitgangLabel(ug.neer))}</td>
      <td>${automaat ? escapeHtml(automaat.code)+(automaat.naam?" — "+escapeHtml(automaat.naam):"") : ""}</td>
      <td>${escapeHtml(m.kabel)}</td><td>${escapeHtml(m.vermogen)}</td><td>${m.eindeloop ? "✓" : "☐"}</td><td>${escapeHtml(m.info)}</td>
    </tr>`));
  });
  container.appendChild(page);
  if(standalone){
    document.body.classList.add("print-patchkast");
    window.print();
    const cleanup = ()=>{ document.body.classList.remove("print-patchkast"); window.removeEventListener("afterprint", cleanup); };
    window.addEventListener("afterprint", cleanup);
    setTimeout(cleanup, 5000);
  }
}

function renderMotoren(){
  if(!state.motoren || !Array.isArray(state.motoren.items)) state.motoren = {items: []};
  const lijst = state.motoren.items;
  const wrap = el(`<div class="panel" id="panel-motoren">
    ${panelHeadHtml(
      "Motoren",
      "Screens, gordijnen, rolluiken, zonnetenten, dakramen ... — per motor de sturing, relaisuitgangen voor op en neer, automaat en kabel.",
      `Tik "+ Motor toevoegen" (of ⧉ om een rij te dupliceren — handig voor een reeks rolluiken). Alles wordt meteen bewaard.
      Bij een sturing via relais of KNX kies je per motor de uitgang voor OP en voor NEER uit de Relais/HVAC-modules van de zekeringkast; dat kan ook van de andere kant, in de module-editor van het relais (type "Motor").
      Motoren verschijnen ook als bron in de Snelmodus van het tabblad Rijgklemmen.`
    )}
    <div class="sticky-controls"><div class="toolbar-card"><div class="toolbar-row" style="flex-wrap:wrap;">
      <button class="addbtn" id="moAdd">+ Motor toevoegen</button>
      <label class="mot-inline">soort <select id="moSoort">${MOTOR_SOORTEN.map(s=>`<option>${s}</option>`).join("")}</select></label>
      <button class="btn" id="moExport">Exporteer voor werf (PDF)</button>
      <span class="hint" id="moTelling"></span>
    </div></div></div>
    <div class="card"><div class="card-body" style="padding:0;overflow-x:auto;">
      <table class="grid mot-tabel">
        <thead><tr><th>Nr.</th><th>Soort</th><th>Benaming</th><th>Kamer</th><th>Sturing</th><th>Uitgang ▲ op</th><th>Uitgang ▼ neer</th><th>Automaat</th><th>Kabel</th><th>W</th><th title="eindeloop ingesteld">Eindeloop</th><th>Opmerking</th><th></th></tr></thead>
        <tbody id="moBody"></tbody>
      </table>
    </div></div>
    <div id="moWaarschuwing"></div>
    <datalist id="dl-motor-kamers">${state.kamers.filter(Boolean).map(k=>`<option value="${escapeHtml(k)}">`).join("")}</datalist>
    <datalist id="dl-motor-kabels">${["4G1.5","5G1.5","3G1.5","2x1.5","4G2.5"].map(k=>`<option value="${k}">`).join("")}</datalist>
  </div>`);
  wireHintToggle(wrap);
  const tbody = wrap.querySelector("#moBody");
  const telling = wrap.querySelector("#moTelling");
  const waarsch = wrap.querySelector("#moWaarschuwing");

  function teken(){
    const codes = computeMotorCodes();
    const zekCodes = computeZekeringCodes();
    const uitgangen = alleZekeringUitgangen();
    const automaten = alleZekeringAutomaten();
    tbody.innerHTML = "";
    if(!lijst.length) tbody.appendChild(el(`<tr class="emptyrow"><td colspan="13">Nog geen motoren toegevoegd.</td></tr>`));
    const zonderUitgang = [];
    lijst.forEach((m, i)=>{
      const st = motorSturing(m.sturing);
      const ug = motorUitgangen(m);
      if(st.uitgangen && (!ug.op || !ug.neer)) zonderUitgang.push(codes[m.id]);
      const ugOpties = (rol)=>{
        const huidig = ug[rol];
        return `<option value="">— geen —</option>` + uitgangen.map(e=>{
          const bezet = e.uitgang.targetId && !(e.uitgang.type==="motor" && e.uitgang.targetId===m.id);
          const label = motorUitgangLabel(e, zekCodes) + (bezet ? "  (→ " + (e.uitgang.type==="motor" ? (motorCodeVoorUitgang(e.uitgang)||"?") : "bezet") + ")" : "");
          return `<option value="${e.uitgang.id}" ${huidig && huidig.uitgang.id===e.uitgang.id ? "selected" : ""}>${escapeHtml(label)}</option>`;
        }).join("");
      };
      const tr = el(`<tr data-id="${m.id}">
        <td class="codecell">${escapeHtml(codes[m.id])}</td>
        <td><select class="mo-soort">${MOTOR_SOORTEN.map(s=>`<option ${s===m.soort?"selected":""}>${s}</option>`).join("")}</select></td>
        <td><input class="mo-naam" value="${escapeHtml(m.naam)}" placeholder="bv. raam links" style="min-width:120px;"></td>
        <td><input class="mo-kamer" list="dl-motor-kamers" value="${escapeHtml(m.kamer)}" style="min-width:100px;"></td>
        <td><select class="mo-sturing">${MOTOR_STURINGEN.map(s=>`<option value="${s.key}" ${s.key===m.sturing?"selected":""}>${s.label}</option>`).join("")}</select></td>
        <td>${st.uitgangen ? `<select class="mo-op">${ugOpties("op")}</select>` : `<span class="hint">n.v.t.</span>`}</td>
        <td>${st.uitgangen ? `<select class="mo-neer">${ugOpties("neer")}</select>` : `<span class="hint">n.v.t.</span>`}</td>
        <td><select class="mo-automaat"><option value="">— geen —</option>${automaten.map(a=>`<option value="${a.id}" ${m.zekeringModuleId===a.id?"selected":""}>${escapeHtml(a.code)}${a.naam?" — "+escapeHtml(a.naam):""}</option>`).join("")}</select></td>
        <td><input class="mo-kabel" list="dl-motor-kabels" value="${escapeHtml(m.kabel)}" style="width:70px;"></td>
        <td><input class="mo-vermogen" value="${escapeHtml(m.vermogen)}" style="width:54px;" placeholder="W"></td>
        <td style="text-align:center;"><input type="checkbox" class="mo-eindeloop" ${m.eindeloop?"checked":""} style="width:auto;"></td>
        <td><input class="mo-info" value="${escapeHtml(m.info)}" style="min-width:120px;"></td>
        <td style="white-space:nowrap;">
          <button class="btn small ghost mo-up" title="omhoog" ${i===0?"disabled":""}>↑</button>
          <button class="btn small ghost mo-down" title="omlaag" ${i===lijst.length-1?"disabled":""}>↓</button>
          <button class="btn small ghost mo-dup" title="dupliceren">⧉</button>
          <button class="btn small ghost mo-del" title="verwijderen">✕</button>
        </td>
      </tr>`);
      const q = (s)=> tr.querySelector(s);
      q(".mo-soort").addEventListener("change", e=>{ m.soort = e.target.value; save(); tekenTelling(); });
      q(".mo-naam").addEventListener("input", e=>{ m.naam = e.target.value; save(); });
      q(".mo-kamer").addEventListener("input", e=>{ m.kamer = e.target.value; save(); tekenTelling(); });
      q(".mo-sturing").addEventListener("change", e=>{
        const oud = motorSturing(m.sturing);
        m.sturing = e.target.value;
        const nieuw = motorSturing(m.sturing);
        if(!m.kabel || m.kabel===oud.kabel) m.kabel = nieuw.kabel;
        if(!nieuw.uitgangen && motorUitgangen(m).alle.length && confirm("Deze sturing gebruikt geen relaisuitgangen. De gekoppelde uitgangen vrijmaken?")) ontkoppelMotor(m);
        save(); teken();
      });
      ["op","neer"].forEach(rol=>{
        const sel = q(".mo-" + rol);
        if(sel) sel.addEventListener("change", e=>{ zetMotorUitgang(m, rol, e.target.value); save(); teken(); });
      });
      q(".mo-automaat").addEventListener("change", e=>{ m.zekeringModuleId = e.target.value; save(); });
      q(".mo-kabel").addEventListener("input", e=>{ m.kabel = e.target.value; save(); });
      q(".mo-vermogen").addEventListener("input", e=>{ m.vermogen = e.target.value; save(); });
      q(".mo-eindeloop").addEventListener("change", e=>{ m.eindeloop = e.target.checked; save(); tekenTelling(); });
      q(".mo-info").addEventListener("input", e=>{ m.info = e.target.value; save(); });
      q(".mo-up").addEventListener("click", ()=>{ lijst.splice(i, 1); lijst.splice(i-1, 0, m); save(); teken(); });
      q(".mo-down").addEventListener("click", ()=>{ lijst.splice(i, 1); lijst.splice(i+1, 0, m); save(); teken(); });
      q(".mo-dup").addEventListener("click", ()=>{
        const kopie = Object.assign(newMotorItem(m), {naam: m.naam, kabel: m.kabel, vermogen: m.vermogen, info: ""});
        lijst.splice(i+1, 0, kopie); save(); teken();
        const nr = tbody.querySelector(`tr[data-id="${kopie.id}"] .mo-naam`); if(nr) nr.focus();
      });
      q(".mo-del").addEventListener("click", ()=>{
        if((m.naam || motorUitgangen(m).alle.length) && !confirm(`Motor ${codes[m.id]}${m.naam?" ("+m.naam+")":""} verwijderen?`)) return;
        ontkoppelMotor(m);
        lijst.splice(lijst.indexOf(m), 1); save(); teken();
      });
      tbody.appendChild(tr);
    });
    waarsch.innerHTML = zonderUitgang.length
      ? `<div class="hint mot-waarschuwing">⚠ ${zonderUitgang.length} motor(en) met relais-/KNX-sturing hebben nog geen uitgang voor op én neer: ${escapeHtml(zonderUitgang.join(", "))}.${uitgangen.length ? "" : " Er staan nog geen Relais/HVAC-modules met uitgangen in de zekeringkast."}</div>`
      : "";
    tekenTelling();
  }
  function tekenTelling(){
    const perSoort = {};
    lijst.forEach(m=>{ perSoort[m.soort] = (perSoort[m.soort]||0) + 1; });
    const nEind = lijst.filter(m=> m.eindeloop).length;
    telling.textContent = lijst.length ? `${lijst.length} motor(en): ${Object.entries(perSoort).map(([s,n])=> n+"× "+s.toLowerCase()).join(", ")} · eindeloop ${nEind}/${lijst.length} ingesteld` : "";
  }
  wrap.querySelector("#moAdd").addEventListener("click", ()=>{
    const vorige = lijst[lijst.length-1];
    const nw = newMotorItem(vorige);
    nw.soort = wrap.querySelector("#moSoort").value;
    lijst.push(nw); save(); teken();
    const nr = tbody.querySelector(`tr[data-id="${nw.id}"] .mo-naam`); if(nr) nr.focus();
  });
  wrap.querySelector("#moExport").addEventListener("click", ()=> exportMotorenVoorWerf(true));
  teken();
  return wrap;
}
