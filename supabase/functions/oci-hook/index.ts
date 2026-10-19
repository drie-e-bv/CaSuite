// oci-hook — ontvangt het winkelmandje van een groothandel-webshop via OCI-punchout
// (Rexel, Cebeo, DistriCompany, ...) en zet de artikels in de CaSuite-materialendatabase.
//
// Verloop:
//  1. materialen.html maakt een rij in `oci_sessies` met een eenmalig geheim token en opent de
//     webshop met HOOK_URL = <deze functie>?t=<token>.
//  2. Na "Overnemen / Terug naar systeem" in de webshop stuurt de browser het mandje als
//     formulier (POST of GET) naar deze functie.
//  3. Deze functie controleert het token (bestaat, nog niet gebruikt, < 4 uur oud), leest de
//     OCI-velden, zet ze via materialen_verwerk() in de databank en stuurt de browser terug naar
//     materialen.html?oci=<sessie-id>, waar het resultaat getoond wordt.
//
// Geen JWT-controle (verify_jwt = false): de webshop kan geen Supabase-login meesturen. De poort
// is het eenmalige token. Draait met de service-role-sleutel (automatisch beschikbaar).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MAX_LEEFTIJD_MS = 4 * 60 * 60 * 1000;

function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// Eigen parser voor application/x-www-form-urlencoded: webshops sturen soms ISO-8859-1
// (é als %E9), wat URLSearchParams kapot zou maken.
function parseUrlencoded(raw: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const deel of raw.split("&")) {
    if (!deel) continue;
    const i = deel.indexOf("=");
    const k = i < 0 ? deel : deel.slice(0, i);
    const v = i < 0 ? "" : deel.slice(i + 1);
    out.push([pctDecode(k), pctDecode(v)]);
  }
  return out;
}
function pctDecode(s: string): string {
  s = s.replace(/\+/g, " ");
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "%" && i + 2 < s.length && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (c.charCodeAt(0) < 256) {
      bytes.push(c.charCodeAt(0)); // body is als latin1 ingelezen: 1 teken = 1 ruwe byte
    } else {
      new TextEncoder().encode(c).forEach((b) => bytes.push(b));
    }
  }
  return decodeBytes(new Uint8Array(bytes));
}

function getal(v: string | undefined): number | null {
  if (v == null) return null;
  let s = String(v).trim().replace(/\s/g, "");
  if (!s) return null;
  // 1.234,56 -> 1234.56 ; 1234,56 -> 1234.56 ; 1,234.56 -> 1234.56
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

type Regel = Record<string, unknown>;

// Zet de platte OCI-velden (NEW_ITEM-DESCRIPTION[1], ...) om naar een lijst regels.
export function ociNaarRegels(velden: Array<[string, string]>): Regel[] {
  const per: Record<string, Record<string, string>> = {};
  const lang: Record<string, string[]> = {};
  for (const [kRaw, v] of velden) {
    const k = kRaw.trim().toUpperCase();
    let m = k.match(/^NEW_ITEM-([A-Z0-9_]+)\[(\d+)\]$/);
    if (m) {
      const veld = m[1], idx = m[2];
      if (veld.startsWith("LONGTEXT")) {
        (lang[idx] ||= []).push(v);
        continue;
      }
      (per[idx] ||= {})[veld] = v;
      continue;
    }
    // Lange tekst: NEW_ITEM-LONGTEXT_1:132[]
    m = k.match(/^NEW_ITEM-LONGTEXT_(\d+):\d+\[\]$/);
    if (m) (lang[m[1]] ||= []).push(v);
  }
  const idxs = Object.keys(per).sort((a, b) => Number(a) - Number(b));
  return idxs.map((idx) => {
    const f = per[idx];
    const prijs = getal(f["PRICE"]);
    const prijsEenheid = getal(f["PRICEUNIT"]) || 1;
    const ext = (f["EXT_PRODUCT_ID"] || "").trim();
    const ean = /^\d{8,14}$/.test(ext) ? ext : "";
    return {
      artikelnr: (f["VENDORMAT"] || f["MATNR"] || ext || "").trim(),
      omschrijving: (f["DESCRIPTION"] || "").trim(),
      lange_omschrijving: (lang[idx] || []).join("").trim(),
      aantal: getal(f["QUANTITY"]),
      eenheid: (f["UNIT"] || "").trim(),
      prijs: prijs == null ? null : Math.round((prijs / prijsEenheid) * 10000) / 10000,
      valuta: (f["CURRENCY"] || "").trim(),
      ean,
      fabrikant: (f["MANUFACTCODE"] || "").trim(),
      fabrikant_artnr: (f["MANUFACTMAT"] || "").trim(),
      categorie: (f["MATGROUP"] || "").trim(),
      levertijd: (f["LEADTIME"] || "").trim(),
    };
  }).filter((r) => r.artikelnr || r.omschrijving);
}

function htmlPagina(titel: string, tekst: string, status = 400) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titel)}</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;color:#15241c"><h1 style="font-size:20px">${esc(titel)}</h1><p>${esc(tekst)}</p></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// Na ontvangst: staat de webshop in het aparte tabblad van CaSuite (window.name 'casuite_webshop'),
// dan tonen we "mandje overgenomen" en sluiten we het tabblad indien de browser dat toelaat; het
// CaSuite-tabblad pikt het mandje zelf op. Anders (zelfde venster) gewoon terug naar CaSuite.
function klaarPagina(terug: string, titel: string, tekst: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titel)}</title>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px;color:#15241c;text-align:center">
<div style="font-size:44px">🛒</div><h1 style="font-size:22px;margin:8px 0">${esc(titel)}</h1><p style="color:#5b6b62">${esc(tekst)}</p>
<p><a href="${esc(terug)}" style="display:inline-block;background:#1b6b3e;color:#fff;padding:10px 16px;border-radius:9px;text-decoration:none;font-weight:600">Naar CaSuite</a></p>
<p style="color:#8a988f;font-size:13px">Je mag dit tabblad sluiten.</p>
<script>if(window.name!=='casuite_webshop'){location.replace(${JSON.stringify(terug).replace(/</g, "\\u003c")});}else{setTimeout(function(){try{window.close();}catch(e){}},1200);}</script></body>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  // Velden verzamelen: querystring + body (urlencoded of multipart)
  const velden: Array<[string, string]> = [];
  const qs = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  if (qs) velden.push(...parseUrlencoded(qs));
  if (req.method === "POST") {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) velden.push([k, typeof v === "string" ? v : ""]);
    } else {
      const bytes = new Uint8Array(await req.arrayBuffer());
      velden.push(...parseUrlencoded(new TextDecoder("latin1").decode(bytes)));
    }
  }

  const token = (velden.find(([k]) => k === "t") || [])[1] || "";
  if (!token || token.length < 20) return htmlPagina("Ongeldige link", "Deze terugkeer-link van de webshop is niet geldig. Start het ophalen opnieuw vanuit CaSuite → Materialen.");

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: sessie, error } = await sb.from("oci_sessies").select("*").eq("token", token).maybeSingle();
  if (error || !sessie) return htmlPagina("Sessie niet gevonden", "Start het ophalen opnieuw vanuit CaSuite → Materialen.");
  if (!/^https:\/\//i.test(sessie.terug_url || "")) return htmlPagina("Ongeldig terugkeeradres", "Start het ophalen opnieuw vanuit CaSuite → Materialen.");
  const terug = new URL(sessie.terug_url);
  terug.searchParams.set("oci", sessie.id);
  if (sessie.ontvangen_op) return klaarPagina(terug.toString(), "Mandje al overgenomen", "Dit mandje staat al in CaSuite."); // dubbel verstuurd
  if (Date.now() - new Date(sessie.created_at).getTime() > MAX_LEEFTIJD_MS) {
    await sb.from("oci_sessies").update({ fout: "verlopen", ontvangen_op: new Date().toISOString() }).eq("id", sessie.id);
    return klaarPagina(terug.toString(), "Sessie verlopen", "Deze sessie was ouder dan 4 uur. Start het ophalen opnieuw vanuit CaSuite.");
  }

  const ruw: Record<string, string> = {};
  for (const [k, v] of velden) if (k !== "t" && !/PASSWORD/i.test(k)) ruw[k] = v;
  const regels = ociNaarRegels(velden);

  let resultaat: unknown = null;
  let fout: string | null = null;
  if (regels.length) {
    const r = await sb.rpc("materialen_verwerk", { p_leverancier_id: sessie.leverancier_id, p_regels: regels, p_bron: "oci", p_besteld: true });
    if (r.error) fout = r.error.message;
    else resultaat = r.data;
  } else {
    fout = "leeg";
  }
  await sb.from("oci_sessies").update({ ontvangen_op: new Date().toISOString(), ruwe_data: ruw, regels, resultaat, fout }).eq("id", sessie.id);
  const n = regels.length;
  return fout && !resultaat
    ? klaarPagina(terug.toString(), fout === "leeg" ? "Leeg mandje ontvangen" : "Mandje niet verwerkt", fout === "leeg" ? "De webshop stuurde geen artikels mee." : "Er liep iets mis. Bekijk de details in CaSuite.")
    : klaarPagina(terug.toString(), "Mandje overgenomen", `${n} artikel${n === 1 ? "" : "s"} staan nu in CaSuite.`);
});
