/**
 * sw.js — service worker voor de CaSnap/CaSuite-appfamilie
 * (de "gewone" website/index.html, en de installeerbare CaSnap Werf / CaPla / CaDos / CaCalc-apps
 * — werf.html / planning.html / cados.html / cacalc.html — die er allemaal naast staan).
 *
 * Twee doelen, allebei even belangrijk (herzien 2026-09-24 op vraag van Peter: "kunnen we
 * niks implementeren dat alles ook offline werkt ... en dat er steeds naar laatste versie
 * gekeken wordt zonder cache"):
 *
 * 1) OFFLINE BLIJVEN WERKEN: als er geen (goed) bereik is, toch meteen laden met de laatst
 *    gekende versie i.p.v. een kapotte/lege pagina.
 * 2) ALTIJD DE NIEUWSTE VERSIE bij een normaal bezoek met internet: het netwerk krijgt
 *    steeds voorrang, de cache is enkel een terugval-optie (bij geen bereik, of een erg
 *    trage verbinding die niet binnen NETWORK_TIMEOUT_MS antwoordt).
 *
 * BELANGRIJK bij elke nieuwe upload/ronde: verhoog CACHE_VERSION hieronder. Dat is wat de
 * browser er zelf toe aanzet om alle oude, gecachete bestanden te laten vallen zodra deze
 * nieuwe sw.js actief wordt (zie activate hieronder) — zonder deze wijziging zou "dezelfde
 * bestandsnaam" niet altijd meteen als "nieuwe versie" herkend worden.
 *
 * FOUT GEVONDEN EN HERSTELD (ronde 45, 2026-09-25): deze versie was bij de CaCalc-integratie
 * per ongeluk NIET mee opgehoogd (en sw.js zelf niet mee bezorgd) -- de bytes van dit bestand
 * bleven dus identiek aan ronde 37/38, waardoor browsers/reeds-geïnstalleerde apps geen enkele
 * aanleiding zagen om iets als "nieuwe versie" te behandelen. De eigenlijke pagina's werden nog
 * wel netwerk-eerst opgehaald (zie networkFirst() hieronder), maar op een trage/wisselvallige
 * verbinding, of in een reeds langer geleden geïnstalleerde PWA die zijn eigen sw.js-registratie
 * niet had ververst, kon dit toch als "hij kijkt nog naar de cache" aanvoelen. Bij twijfel:
 * CACHE_VERSION hieronder verhogen lost dit soort dingen sowieso op, dus voortaan bij ÉLKE
 * ronde die code aanraakt (niet enkel als sw.js zelf inhoudelijk wijzigt).
 */
const CACHE_VERSION = 'casnap-v2026-09-25a';
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', () => {
  // Meteen actief willen worden, niet wachten tot alle open tabbladen gesloten zijn —
  // essentieel om "altijd de nieuwste versie" waar te kunnen maken. De pagina zelf
  // (zie src2.html/index.html) toont een balk "Nieuwe versie beschikbaar" zodra dit
  // gebeurt terwijl er al een oudere versie open stond, i.p.v. stilzwijgend te verversen.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // enkel GET-verzoeken cachen/afvangen

  const url = new URL(req.url);
  // Enkel bestanden van deze app zelf (HTML/manifest/iconen) via deze strategie laten
  // lopen. Externe diensten (Supabase, jsPDF/andere CDN-scripts, lettertypes, ...) laten we
  // gewoon rechtstreeks door de browser afhandelen — die willen we nooit "verouderd" tonen,
  // en sommige (bv. Supabase-auth/data-calls) horen sowieso niet gecached te worden.
  if (url.origin !== self.location.origin) return;

  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
    // cache:'no-store' negeert ook de HTTP-cache van de browser zelf (niet enkel deze
    // service-worker-cache) -- zonder dit zou je soms nog een verouderde versie kunnen
    // krijgen zelfs met een "netwerk-eerst"-opzet, als de server/host zelf een lange
    // cache-levensduur meegeeft aan index.html.
    const fresh = await fetch(req, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timeoutId);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (networkErr) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Geen netwerk én niets gecached (bv. allereerste bezoek zonder bereik) -- alsnog een
    // gewone fetch proberen zonder timeout/no-store, als laatste redmiddel.
    try {
      return await fetch(req);
    } catch (fallbackErr) {
      throw networkErr;
    }
  }
}
