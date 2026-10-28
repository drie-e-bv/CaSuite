// Supabase Edge Function: module-analyse
//
// CaDos Modulebibliotheek (2026-10-28): leest een foto, technische tekening of datasheet-pagina
// van een DIN-railmodule (automaat, differentieel, domotica-module, ...) en geeft terug:
//  - de specs (merk, artikelnr, soort, polen, A, curve, kA, mA, type differentieel, breedte)
//  - de uitsnede van de module zelf in de afbeelding (module_box)
//  - de aansluitklemmen met hun positie (x/y) -> snappunten voor de bedrading
//  - wat de AI niet zeker kon bepalen, als vragen voor de gebruiker
//
// Bewust een APARTE functie naast ai-assist, zodat deze nieuwe functionaliteit de bestaande
// AI-taken (werfverslagen, handschrift, vergaderingen) niet kan beïnvloeden. Gebruikt dezelfde
// GEMINI_API_KEY-secret (secrets gelden voor het hele Supabase-project) en dezelfde gratis
// Flash-modellen met terugval als ai-assist.
//
// Aanvraag:  { image: "data:image/jpeg;base64,...", hint?: {categorie, merk, artikelnr, polen, stroom}, model? }
// Antwoord:  { merk, artikelnr, categorie, polen, stroom, curve, kortsluit, gevoeligheid, diff_type,
//              breedte, omschrijving, module_box:[ymin,xmin,ymax,xmax], klemmen:[{label,functie,zijde,x,y}],
//              onzeker:[...], vragen:[...], model }
// Coördinaten: genormaliseerd 0-1000 t.o.v. de volledige meegestuurde afbeelding.
// Authenticatie: verify_jwt = true -- enkel ingelogde Casentis-gebruikers.

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const TERUGVAL = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'];
const ONGESCHIKT = /(tts|image|embedding|audio|live|native|robotics|computer-use|aqa|learnlm)/i;
const CATEGORIEEN = ['Automaat', 'Differentieel', 'Centrale', 'Voeding', 'DALI', 'HVAC', 'Relais', 'Rijgklemmenmodule', 'Overig'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
function extractText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const t = parts.map((p: any) => (p && !p.thought && typeof p.text === 'string') ? p.text : '').join('').trim();
    if (t) return t;
  }
  return '';
}
async function genereer(keten: string[], parts: any[], schema: any): Promise<{ data: any; model: string; fout: string }> {
  let fout = '';
  for (const kandidaat of keten) {
    const doe = (extra: Record<string, unknown>) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(kandidaat)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY as string },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: schema, ...extra }
      })
    });
    let resp = await doe({ mediaResolution: 'MEDIA_RESOLUTION_HIGH' });
    if (!resp.ok && resp.status === 400) resp = await doe({});
    if (resp.ok) return { data: await resp.json(), model: kandidaat, fout: '' };
    const errText = await resp.text();
    console.error('Gemini-fout:', kandidaat, resp.status, errText.slice(0, 500));
    fout = `${resp.status} bij "${kandidaat}"`;
    if (![400, 403, 404, 429, 500, 503].includes(resp.status)) break;
  }
  return { data: null, model: '', fout };
}
const str = (v: unknown, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : (typeof v === 'number' && isFinite(v) ? String(v) : ''));
const clamp1000 = (v: unknown) => { const n = Number(v); return isFinite(n) ? Math.max(0, Math.min(1000, Math.round(n))) : null; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    if (!GEMINI_API_KEY) return jsonResponse({ error: 'GEMINI_API_KEY-secret ontbreekt op de server.' }, 500);
    const body = await req.json();
    const raw = typeof body.image === 'string' ? body.image : '';
    const m = raw.match(/^data:(image\/[a-z+.-]+);base64,(.*)$/i);
    const mime = m ? m[1] : 'image/jpeg';
    const data = m ? m[2] : raw;
    if (data.length < 200) return jsonResponse({ error: 'Geen (bruikbare) afbeelding meegegeven.' }, 400);
    if (data.length > 14 * 1024 * 1024) return jsonResponse({ error: 'Afbeelding te groot.' }, 413);
    const hint = (body.hint && typeof body.hint === 'object') ? body.hint : {};
    const hintTekst = Object.entries(hint).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => `${k}: ${v}`).join('; ');

    const prompt =
      `You are an expert in low-voltage electrical distribution boards (Belgium, AREI/RGIE). You get ONE image: a photo, a ` +
      `manufacturer technical drawing, or a datasheet page showing a DIN-rail modular device (circuit breaker / "automaat", RCD / ` +
      `"differentieel", RCBO, home-automation module, power supply, relay, DALI interface, terminal block module...).\n\n` +
      `Return JSON with:\n` +
      `- "categorie": exactly one of ${CATEGORIEEN.join(', ')}. MCB -> Automaat. RCD/RCCB and RCBO -> Differentieel. ` +
      `Home-automation controller -> Centrale. Power supply -> Voeding. DALI gateway -> DALI. Heating/valve actuator -> HVAC. ` +
      `Switch/relay actuator or contactor -> Relais. Terminal block module -> Rijgklemmenmodule. Anything else -> Overig.\n` +
      `- "merk" (brand, e.g. Hager, ABB, Schneider, Legrand, Siemens, Eaton, Niko) and "artikelnr" (order code / type reference) if readable.\n` +
      `- "polen": one of 1P, 1P+N, 2P, 3P, 3P+N, 4P (empty if unknown).\n` +
      `- "stroom": rated current in A as a plain number string (e.g. "16"). "curve": B, C, D, K or Z (from e.g. "C16"). ` +
      `"kortsluit": breaking capacity in kA as a number string (e.g. "6" from "6000" in a box or "6kA"; "4.5" from "4500"). ` +
      `"gevoeligheid": residual current in mA as a number string (e.g. "30"). "diff_type": AC, A, A-SI, F or B (RCD type). ` +
      `"breedte": width in standard 17.5/18 mm modules (number). Leave a field empty when it is not visible or not applicable - never guess values.\n` +
      `- "omschrijving": a short Dutch description (max 12 words).\n` +
      `- "module_box": [ymin, xmin, ymax, xmax] of the FRONT VIEW of the device itself in the image, normalized 0-1000. ` +
      `If the image shows several views (front, side, dimensions), use the front view only. If there are several different ` +
      `devices, use the most prominent one.\n` +
      `- "klemmen": every connection terminal (screw/clamp/push-in terminal, bus connector) of that front view, each with ` +
      `"x","y" = the centre point of the terminal, normalized 0-1000 in the FULL image (same frame as module_box); ` +
      `"zijde": "boven" (top, usually the supply side) or "onder" (bottom); "label": the marking printed at the terminal ` +
      `(e.g. 1, 2, 3, 4, N, L, 11, 12, A1, A2, +, -) or a short logical name if none is printed; "functie": one of ` +
      `L, L1, L2, L3, N, PE, +, -, in, uit, bus, contact, andere (for a breaker: odd numbers 1/3/5 are line in at the top, even ` +
      `numbers 2/4/6 line out at the bottom; N is neutral). Order them left to right, top row first.\n` +
      `- "onzeker": names of fields you could not determine reliably.\n` +
      `- "vragen": up to 5 short questions IN DUTCH (Flemish) for the installer about what is missing or ambiguous ` +
      `(e.g. "Welk kortsluitvermogen staat op het toestel (in kA)?"). Empty list if everything is clear.\n` +
      (hintTekst ? `\nThe installer already filled in: ${hintTekst}. Use this as a hint but trust what is visible in the image.\n` : '');

    const schema = {
      type: 'OBJECT',
      properties: {
        categorie: { type: 'STRING' }, merk: { type: 'STRING' }, artikelnr: { type: 'STRING' }, polen: { type: 'STRING' },
        stroom: { type: 'STRING' }, curve: { type: 'STRING' }, kortsluit: { type: 'STRING' }, gevoeligheid: { type: 'STRING' },
        diff_type: { type: 'STRING' }, breedte: { type: 'NUMBER' }, omschrijving: { type: 'STRING' },
        module_box: { type: 'ARRAY', items: { type: 'INTEGER' } },
        klemmen: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { label: { type: 'STRING' }, functie: { type: 'STRING' }, zijde: { type: 'STRING' }, x: { type: 'INTEGER' }, y: { type: 'INTEGER' } },
            required: ['label', 'zijde', 'x', 'y'],
            propertyOrdering: ['label', 'functie', 'zijde', 'x', 'y']
          }
        },
        onzeker: { type: 'ARRAY', items: { type: 'STRING' } },
        vragen: { type: 'ARRAY', items: { type: 'STRING' } }
      },
      required: ['categorie', 'module_box', 'klemmen'],
      propertyOrdering: ['categorie', 'merk', 'artikelnr', 'polen', 'stroom', 'curve', 'kortsluit', 'gevoeligheid', 'diff_type', 'breedte', 'omschrijving', 'module_box', 'klemmen', 'onzeker', 'vragen']
    };
    const gevraagd = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : '';
    const keten = Array.from(new Set([gevraagd, ...TERUGVAL].filter((x) => x && !ONGESCHIKT.test(x))));
    const res = await genereer(keten, [{ text: prompt }, { inline_data: { mime_type: mime, data } }], schema);
    if (!res.data) return jsonResponse({ error: `AI-herkenning mislukt (${res.fout}). Mogelijk is de gratis limiet bij Google even bereikt -- probeer binnen een minuut opnieuw.` }, 502);
    const tekst = extractText(res.data);
    let p: any = null;
    try { p = JSON.parse(tekst); } catch (_e) { const mm = tekst.match(/\{[\s\S]*\}/); if (mm) { try { p = JSON.parse(mm[0]); } catch (_e2) { /* niets */ } } }
    if (!p) { console.error('Onleesbaar antwoord:', tekst.slice(0, 1500)); return jsonResponse({ error: 'De AI gaf geen bruikbaar antwoord terug. Probeer opnieuw.' }, 502); }

    const polen = str(p.polen, 6).toUpperCase().replace(/\s/g, '');
    const box = Array.isArray(p.module_box) && p.module_box.length === 4 ? p.module_box.map(clamp1000) : null;
    const klemmen = (Array.isArray(p.klemmen) ? p.klemmen : []).slice(0, 48).map((k: any) => ({
      label: str(k?.label, 8), functie: str(k?.functie, 10), zijde: k?.zijde === 'onder' ? 'onder' : 'boven',
      x: clamp1000(k?.x), y: clamp1000(k?.y)
    })).filter((k: any) => k.x !== null && k.y !== null);
    return jsonResponse({
      categorie: CATEGORIEEN.includes(p.categorie) ? p.categorie : '',
      merk: str(p.merk), artikelnr: str(p.artikelnr),
      polen: ['1P', '1P+N', '2P', '3P', '3P+N', '4P'].includes(polen) ? polen : '',
      stroom: str(p.stroom, 6).replace(/[^0-9.,]/g, '').replace(',', '.'),
      curve: ['B', 'C', 'D', 'K', 'Z'].includes(str(p.curve, 2).toUpperCase()) ? str(p.curve, 2).toUpperCase() : '',
      kortsluit: str(p.kortsluit, 6).replace(/[^0-9.,]/g, '').replace(',', '.'),
      gevoeligheid: str(p.gevoeligheid, 6).replace(/[^0-9.,]/g, '').replace(',', '.'),
      diff_type: ['AC', 'A', 'A-SI', 'F', 'B'].includes(str(p.diff_type, 5).toUpperCase()) ? str(p.diff_type, 5).toUpperCase() : '',
      breedte: (Number(p.breedte) > 0 && Number(p.breedte) <= 24) ? Number(p.breedte) : null,
      omschrijving: str(p.omschrijving, 160),
      module_box: box && box.every((n: number | null) => n !== null) ? box : null,
      klemmen,
      onzeker: (Array.isArray(p.onzeker) ? p.onzeker : []).map((s: unknown) => str(s, 40)).filter(Boolean).slice(0, 12),
      vragen: (Array.isArray(p.vragen) ? p.vragen : []).map((s: unknown) => str(s, 200)).filter(Boolean).slice(0, 5),
      model: res.model
    });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: 'Onverwachte fout: ' + (err instanceof Error ? err.message : String(err)) }, 500);
  }
});
