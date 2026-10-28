#!/usr/bin/env python3
"""Past de CaDos-uitbreiding (Modulebibliotheek + Uitvoeringsplan) toe op een CaSuite-HTML-bestand.

Gebruik: patch.py <bron.html> <doel.html> [--test]
Elk ankerpunt moet precies 1x voorkomen, anders stopt het script zonder iets te schrijven.
"""
import sys, re, pathlib

HIER = pathlib.Path(__file__).resolve().parent
bron, doel = sys.argv[1], sys.argv[2]
test = "--test" in sys.argv
html = pathlib.Path(bron).read_text(encoding="utf-8")
if "MODULEBIBLIOTHEEK + UITVOERINGSPLAN" in html:
    sys.exit(f"{bron}: is al gepatcht")

JS = (HIER / "cados_bib.js").read_text(encoding="utf-8") + "\n" + (HIER / "cados_motoren.js").read_text(encoding="utf-8")
CSS = (HIER / "cados_bib.css").read_text(encoding="utf-8")

OUTER = r"""
  // ===== Modulebibliotheek zekeringkast (2026-10-28) =====
  // Gedeelde bibliotheek van DIN-railmodules (tabel elektro_catalogus_modules, bucket
  // module-tekeningen) met technische tekening + aansluitklemmen, gebruikt door het nieuwe
  // Uitvoeringsplan in CaDos. Op window gezet om dezelfde reden als dbListCatalogArmaturen.
  window.dbListModules = async function(){
    const { data, error } = await sb.from('elektro_catalogus_modules').select('*').order('categorie', { ascending: true }).order('naam', { ascending: true });
    if(error) throw error;
    return data || [];
  };
  window.dbSaveModule = async function(row){
    const r = Object.assign({}, row);
    const id = r.id;
    delete r.id; delete r.created_at; delete r.updated_at;
    if(id){
      const { data, error } = await sb.from('elektro_catalogus_modules').update(r).eq('id', id).select().single();
      if(error) throw error;
      return data;
    }
    const { data, error } = await sb.from('elektro_catalogus_modules').insert(r).select().single();
    if(error) throw error;
    return data;
  };
  window.dbDeleteModule = async function(id){
    const { error } = await sb.from('elektro_catalogus_modules').delete().eq('id', id);
    if(error) throw error;
  };
  window.dbUploadModuleTekening = (file) => dbUploadFile('module-tekeningen', file);
  // Gedeelde CaDos-instellingen (klemfuncties + aangepaste standaardmodules), tabel elektro_cados_instellingen.
  window.dbListCadosInstellingen = async function(){
    const { data, error } = await sb.from('elektro_cados_instellingen').select('*');
    if(error) throw error;
    return data || [];
  };
  window.dbSaveCadosInstelling = async function(sleutel, waarde){
    const { error } = await sb.from('elektro_cados_instellingen').upsert({ sleutel, waarde, updated_at: new Date().toISOString() }, { onConflict: 'sleutel' });
    if(error) throw error;
  };
  window.dbDeleteCadosInstelling = async function(sleutel){
    const { error } = await sb.from('elektro_cados_instellingen').delete().eq('sleutel', sleutel);
    if(error) throw error;
  };
  // AI: herkent specs + aansluitklemmen op een foto/tekening (Edge Function "module-analyse",
  // apart van ai-assist). Stuurt hetzelfde "AI-model (handschrift)" mee als de kladversie.
  window.aiModuleAnalyse = async function(image, hint){
    const model = (state.company && state.company.gemini_model_klad && String(state.company.gemini_model_klad).trim()) || DEFAULT_GEMINI_MODEL_KLAD;
    const { data, error } = await sb.functions.invoke('module-analyse', { body: { image, hint: hint || {}, model } });
    if(error){
      let msg = error.message || String(error);
      try{ const j = error.context && await error.context.json(); if(j && j.error) msg = j.error; }catch(_e){}
      throw new Error(msg);
    }
    if(!data || data.error) throw new Error((data && data.error) || 'Geen antwoord van de AI ontvangen.');
    return data;
  };
"""

def vervang(oud, nieuw, label):
    global html
    n = html.count(oud)
    if n != 1:
        sys.exit(f"{bron}: anker '{label}' komt {n}x voor (verwacht 1) -- niets geschreven")
    html = html.replace(oud, nieuw, 1)

# 1. CSS
vervang("\n</head>\n", "\n<style id=\"cados-uitvoering-css\">\n" + CSS + "\n</style>\n</head>\n", "</head>")
# 2. extra stroomwaarden (layout-dropdowns tonen zo ook bv. 13A/50A uit de bibliotheek)
vervang('const A_OPTIES = ["","6A","10A","16A","20A","25A","32A","40A","63A"];',
        'const A_OPTIES = ["","2A","4A","6A","10A","13A","16A","20A","25A","32A","40A","50A","63A","80A","100A","125A"];', "A_OPTIES")
# 3. nieuw tabblad direct na Zekeringen (= de layout)
vervang('  {grp:"Elektro", id:"zekeringen", label:"Zekeringen"},',
        '  {grp:"Elektro", id:"zekeringen", label:"Zekeringen"},\n'
        '  // 2026-10-28: Uitvoeringsplan (bedrading + eendraadschema) -- de "Zekeringen"-tab blijft de layout.\n'
        '  {grp:"Elektro", id:"uitvoering", label:"Uitvoeringsplan"},', "TABS")
vervang("  zekeringen: renderZekeringen,", "  zekeringen: renderZekeringen,\n  uitvoering: renderUitvoeringsplan,", "RENDERERS-entry")
# 4. alle nieuwe code vóór de RENDERERS-tabel (binnen het CaDos-IIFE)
vervang("const RENDERERS = {", JS + "\nconst RENDERERS = {", "RENDERERS")
# 5. module-editor (layout): curve, kA, type diff + bibliotheekmodule
anker_type = '      ${cat!=="Leeg" ? `<div class="field wide"><label>Merk / type</label><input class="me-type" list="typeSuggesties"'
vervang(anker_type, "      ${bibEditorVeldenHtml(m, cat)}\n" + anker_type, "module-editor velden")
vervang('  const breedteInp = box.querySelector(".me-breedte");',
        '  wireBibEditorVelden(box, m, rebuildAll);\n  const breedteInp = box.querySelector(".me-breedte");', "module-editor listeners")
# 6. nieuwe module (staging): "Uit bibliotheek…"
anker_rem = '      <input type="checkbox" class="sq-rem" ${item.isRem?"checked":""}> Remautomaat</label></span>'
vervang(anker_rem, anker_rem + "\n    ${bibStagingHtml()}", "staging html")
vervang('  const remChk = box.querySelector(".sq-rem");',
        '  wireBibStaging(box, item, rebuildAll);\n  const remChk = box.querySelector(".sq-rem");', "staging listeners")
# 6b. layout: benaming + specs leesbaar bij hoveren over een module (enkel een tooltip, verder ongewijzigd)
vervang("title=\"${isDivider?'Scheidingsteken (0 modules) — onderbreekt de automaat-nummering zonder plaats in te nemen':''}\">",
        "title=\"${isDivider?'Scheidingsteken (0 modules) — onderbreekt de automaat-nummering zonder plaats in te nemen':escapeHtml(chipTitel(m, code))}\">",
        "chip-tooltip")
# 6c. layout: breedte van automaat/differentieel aanpasbaar (standaard 1 per pool); aangepaste
#     standaardmodule bepaalt de standaardbreedte bij het kiezen van een soort
vervang("""        ? `<div class="field"><label>Breedte</label><div class="breedte-auto">${m.breedte} module${m.breedte>1?'s':''} <span class="hint">${cat==="Rijgklemmenmodule"?"(automatisch — 7 klemmen per 2 modules)":"(1 per pool)"}</span></div></div>`""",
        """        ? (cat==="Rijgklemmenmodule"
            ? `<div class="field"><label>Breedte</label><div class="breedte-auto">${m.breedte} module${m.breedte>1?'s':''} <span class="hint">(automatisch — 7 klemmen per 2 modules)</span></div></div>`
            : `<div class="field"><label>Breedte (modules)</label><input type="number" min="1" max="${kastVoorEditor.maat}" class="me-breedte" value="${m.breedte}"><div class="hint" style="margin-top:3px;">standaard 1 per pool — aanpasbaar</div></div>`)""",
        "breedte aanpasbaar")
vervang("""    item.breedte = nieuweCat==="Rijgklemmenmodule" ? berekenRijgklemBreedte((item.rijgklemKlemIds||[]).length) : (AUTO_BREEDTE_CATS.includes(nieuweCat) ? polenToBreedte(preset.polen) : preset.breedte);""",
        """    item.breedte = nieuweCat==="Rijgklemmenmodule" ? berekenRijgklemBreedte((item.rijgklemKlemIds||[]).length) : (sjabloonBreedte(nieuweCat, preset.polen) || (AUTO_BREEDTE_CATS.includes(nieuweCat) ? polenToBreedte(preset.polen) : preset.breedte));""",
        "staging standaardbreedte")
vervang("""    m.breedte = newCat==="Rijgklemmenmodule" ? berekenRijgklemBreedte((m.rijgklemKlemIds||[]).length) : (AUTO_BREEDTE_CATS.includes(newCat) ? polenToBreedte(p.polen) : p.breedte);""",
        """    m.breedte = newCat==="Rijgklemmenmodule" ? berekenRijgklemBreedte((m.rijgklemKlemIds||[]).length) : (sjabloonBreedte(newCat, p.polen) || (AUTO_BREEDTE_CATS.includes(newCat) ? polenToBreedte(p.polen) : p.breedte));""",
        "editor standaardbreedte")
# 7. export-checklist / volledig dossier
anker_exp = '  {key:"interlex", label:"Rijgklemmen", fn:()=>exportRijgklemmenVoorWerf'
vervang(anker_exp,
        '  {key:"uitvoering", label:"Uitvoeringsplan & eendraadschema", fn:()=>exportUitvoeringVoorWerf, schema:true, lijst:true, heeftData:()=> state.zekeringen.kasten.some(k=>k.rijen.some(r=>r.items.some(m=>m.categorie!=="Leeg")))},\n' + anker_exp,
        "EXPORT_SECTIES")
# 8. DB/AI-wrappers in het buitenste script
vervang("  window.dbListCatalogDrivers = dbListCatalogDrivers;", "  window.dbListCatalogDrivers = dbListCatalogDrivers;" + OUTER, "db-wrappers")
# 9. knop in de Catalogus van de suite
anker_resync = '      <button class="btn btn-ghost btn-sm" id="catalogus-resync" type="button">'
vervang(anker_resync,
        '      <button class="btn btn-ghost btn-sm" id="catalogus-modules" type="button" title="Gedeelde bibliotheek van zekeringkastmodules met tekening en aansluitklemmen">🔌 Zekeringkastmodules</button>\n' + anker_resync,
        "catalogus-knop")
anker_close = "    el('catalogus-close').addEventListener('click', () => { el('catalogus-modal').style.display = 'none'; });"
vervang(anker_close, anker_close +
        "\n    el('catalogus-modules').addEventListener('click', () => { el('catalogus-modal').style.display = 'none'; if(window.openModuleBibliotheek) window.openModuleBibliotheek({}); });",
        "catalogus-knop listener")

# 10. Motoren (screens, gordijnen, rolluiken) als nieuw onderdeel / tabblad
vervang('  {key:"zonnepanelen", label:"Zonnepanelen"},',
        '  {key:"zonnepanelen", label:"Zonnepanelen"},\n  {key:"motoren", label:"Motoren (screens, gordijnen, rolluiken)"},', "MODULE_TOGGLES motoren")
vervang('  {grp:"Data & sturing", id:"verwarming", label:"Verwarmingsturing", toggle:"verwarming"},',
        '  {grp:"Data & sturing", id:"verwarming", label:"Verwarmingsturing", toggle:"verwarming"},\n'
        '  // 2026-10-28: motoren (screens, gordijnen, rolluiken) -- zie renderMotoren()\n'
        '  {grp:"Data & sturing", id:"motoren", label:"Motoren", toggle:"motoren"},', "TABS motoren")
vervang('    zonnepanelen: { items: [] },', '    zonnepanelen: { items: [] },\n    motoren: { items: [] },', "blankState motoren")
vervang('  if(!s.zonnepanelen || !Array.isArray(s.zonnepanelen.items)){\n    s.zonnepanelen = { items: [] };\n  }',
        '  if(!s.zonnepanelen || !Array.isArray(s.zonnepanelen.items)){\n    s.zonnepanelen = { items: [] };\n  }\n'
        '  if(!s.motoren || !Array.isArray(s.motoren.items)){\n    s.motoren = { items: [] };\n  }', "migrate motoren")
vervang('  zonnepanelen: renderZonnepanelen,', '  zonnepanelen: renderZonnepanelen,\n  motoren: renderMotoren,', "RENDERERS motoren")
vervang('const isVerw = u.type==="verwarming";', 'const isVerw = u.type==="verwarming", isMotor = u.type==="motor";', "uitgang isMotor")
vervang('const opties = isVerw', 'const opties = isMotor ? motorUitgangOpties(u) : isVerw', "uitgang opties motor")
vervang('<option value="verwarming" ${isVerw?"selected":""}>Verwarmingskring</option>',
        '<option value="verwarming" ${isVerw?"selected":""}>Verwarmingskring</option>\n                <option value="motor" ${isMotor?"selected":""}>Motor (screen/rolluik)</option>', "uitgang type motor")
vervang('blok.querySelector(".ug-target").addEventListener("change", e2=>{ u.targetId = e2.target.value;',
        'blok.querySelector(".ug-target").addEventListener("change", e2=>{ u.targetId = e2.target.value; delete u.rol;', "uitgang target rol")
vervang('  if(u.type==="verwarming"){\n    const zone = state.verwarming.items.find(z=>z.id===u.targetId);',
        '  if(u.type==="motor") return motorTargetLabel(u);\n  if(u.type==="verwarming"){\n    const zone = state.verwarming.items.find(z=>z.id===u.targetId);', "uitgangTargetLabel motor")
vervang('if(u.type==="verwarming") return vCodes[u.targetId];', 'if(u.type==="verwarming") return vCodes[u.targetId];\n        if(u.type==="motor") return motorCodeVoorUitgang(u);', "chip motor")
vervang('              <option value="laadpalen">Laadpalen</option>', '              <option value="laadpalen">Laadpalen</option>\n              <option value="motoren">Motoren</option>', "snelmodus optie")
vervang('laadpalen:"Laadpalen", zekeringen:"Zekeringkast"};', 'laadpalen:"Laadpalen", motoren:"Motoren", zekeringen:"Zekeringkast"};', "snelmodus labelMap")
vervang('  if(bronType==="zekeringen"){',
        '  if(bronType==="motoren"){ const mc = computeMotorCodes(); return ((state.motoren && state.motoren.items) || []).map(m=>({id:m.id, label:[mc[m.id], m.soort, m.naam||m.kamer||""].filter(Boolean).join(" — "), kabeltype:m.kabel, kamer:m.kamer, info:[m.soort, m.naam].filter(Boolean).join(" ")})); }\n  if(bronType==="zekeringen"){', "snelmodus bron")
vervang('  {key:"laadpalen", label:"Laadpalen", fn:()=>exportLaadpalenVoorWerf',
        '  {key:"motoren", label:"Motoren", fn:()=>exportMotorenVoorWerf, schema:false, lijst:true, heeftData:()=> !!(state.motoren && state.motoren.items.length)},\n  {key:"laadpalen", label:"Laadpalen", fn:()=>exportLaadpalenVoorWerf', "EXPORT motoren")

if test:
    html = re.sub(r"<title>([^<]*)</title>", lambda m: f"<title>TEST · {m.group(1)}</title>", html, count=1)
    m = re.search(r"<body[^>]*>", html)
    if not m:
        sys.exit("geen <body>")
    html = html[:m.end()] + '\n<div class="casuite-testlint">TESTVERSIE — Uitvoeringsplan &amp; Modulebibliotheek · Motoren · werkt op de echte gegevens</div>' + html[m.end():]

pathlib.Path(doel).write_text(html, encoding="utf-8")
print(f"{doel}: OK ({'test' if test else 'definitief'})")
