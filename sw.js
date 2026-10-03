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
// ronde 64: 4 wijzigingen, allemaal in Personeelsplanning/CaCalc -- (1) CaCalc-bordinstellingen
// (Peter, met screenshot: "Bovenaan zou alles van de 'inkomende zaken' gegroepeerd moeten staan en
// dan onderaan de vertrekkende [...] Schakelaar erbij maakt alles grijs niet aanpasbaar") --
// renderBoardDetail() is herschikt: alles inkomend (Kabel + Neutraal/PE apart + Hoofdautomaat/
// Vertrek-automaat/Hoofdschakelaar + Bijkomende gegevens) staat nu bovenaan, "Vertrekkende kabels
// (eindgroepen)" helemaal onderaan, met 1 nieuwe schakelaar ("Zelfde omgevingsinstellingen als
// voedingskabel") i.p.v. 4 losse dropdowns; (2) Peter: "Flexi krijgen geen app-/planningtoegang.
// ook aanpassen aub" -- de rol "Flexi" krijgt nu exact dezelfde (vaste, niet per persoon
// aanpasbare) toegangsblokkade als "Onderaannemer" al had; (3) Peter: "Keurin in de planning te
// koppelen aan project, of vrije ingave van project" -- de Keuring-status in het rooster-dagpaneel
// heeft nu een optioneel projectveld (kies uit de lijst of typ vrije tekst), hergebruikt de
// bestaande project_id/omschrijving-kolommen; (4) Peter, met screenshot: "Ik kan niet op de filter
// schollen op gsm" -- de rol-filterrij boven het rooster was op gsm geen echte flex-krimp-/
// stretch-breedte-beperking toegepast (flex-item in een flex-direction:column-ouder), waardoor ze
// gewoon tot haar volle inhoudsbreedte groeide i.p.v. binnen het scherm te passen en te scrollen --
// wat niet paste werd zonder enige scroll-mogelijkheid afgesneden. Nu met een expliciete breedte
// (width:100%/min-width:0) effectief swipebaar. Geen SQL-wijziging voor (2)/(4); (1)/(3)
// hergebruiken bestaande kolommen.
// ronde 63: Peter: "Ik heb indruk dat de laatste ingestelde filter, wat je zichtbaar wou in de
// planning, niet opgeslagen wordt bij nieuwe opstart" -- klopte: de rol-/onderaannemers-filter
// boven het Personeelsplanning-rooster stond nooit in localStorage, enkel in het geheugen, dus
// elke herlaad/herstart viel terug op "alle rollen aan". Wordt nu per gebruiker bewaard (zelfde
// localStorage-conventie als de "Mijn week"-voorkeur), en blijft veilig als een bewaarde rol later
// niet meer bestaat (bv. de ronde 62b-opsplitsing van "Bureau"). Geen SQL-wijziging.
// ronde 62b: Peter, meteen na ronde 62 hieronder: "Bureau dan mss nog meer opsplitsen als management,
// projectleiders en administratie" -- de ene generieke rol "Bureau" is vervangen door deze 3
// specifiekere rollen (IP_ROLES in src2.html). Geen SQL-wijziging; bestaande personen met de oude
// waarde "Bureau" blijven gewoon werken (vrije tekst), enkel niet meer kiesbaar in de rol-keuzelijst.
// ronde 62: Peter: "Scherm op gsm is voor meer dan 50% ingenomen [...] Kunnen we daar aanpassingen/
// zaken verplaatsen/groeperen om beter zichtbaar te maken?", daarna "Zouden we bureau/techniekers
// niet aanpassen en bureau bij de flexi/onderaannemers/... stoppen. Zo winnen we ook veel scherm" --
// (1) op gsm staan de rol-filters + legende boven het Personeelsplanning-rooster voortaan standaard
// dicht achter 1 knop "Filters & legende" (badge = aantal actieve rollen), op tablet/desktop blijft
// alles gewoon altijd zichtbaar; (2) de Tech/Bureau-schakelaar (eigen rij) is volledig verdwenen --
// Rooster/Capaciteit/Vaardigheden tonen voortaan altijd alle actieve mensen samen in 1 tabel, Bureau
// is nu gewoon een rol-filterchip naast Technieker/Flexi/Onderaannemers (Inschatting blijft bewust
// Tech-only). Geen SQL-wijziging.
// ronde 61: Peter meldde dat een CaDos-dossier soms stilzwijgend ontstond ("In settings van project
// als cados dossier opmaken uitstaat en je doet opslaan komt er toch een dossier") -- bron was het
// CaDos-instellingenblokje op de Projecten-pagina, dat bij elk uitklappen/bewaren van een project
// onvoorwaardelijk synchroniseerde en bewaarde; dat gebeurt nu enkel nog als er al écht een dossier
// bestond. Daarnaast, ook op vraag van Peter: de hoofdnav-knoppen "Dossier"/"Kabelberekening" tonen
// zich voortaan enkel nog zodra bovenaan een project gekozen is (zonder gekozen project enkel
// Werfverslag/Planning), en als "+ ... aanmaken" zolang dat project nog geen eigen dossier/
// berekening heeft -- 1 klik maakt het dan aan en navigeert er meteen naartoe. Geen SQL-wijziging.
// ronde 60b: de notitie (zie ronde 60 hieronder) toonde voorheen enkel een klein rood bolletje als
// indicator -- op vraag van Peter ("Die notitie zou ook in het rooster zichtbaar mogen worden
// wanneer er tekst in staat") toont de rooster-cel nu ook de notitietekst zelf, als eigen chipje
// onderaan de cel (naast het bolletje, dat blijft ook staan). Geen SQL, geen nieuwe tabel.
// ronde 60: (1) 2 nieuwe statussen in het rooster-dagpaneel -- "Keuring" (met een optioneel uur,
// bv. "Keuring 14:30") en "Recup"; de 5 bestaande tegels (Verlof/ADV/Ziek/Afwezig/Magazijn) zijn
// bewust gedimd/zachter gemaakt zodat Keuring als enige nog echt opvallend rood oogt; (2) vrije
// notitie per dag/persoon (bv. "Start later", "Vroeger naar huis") -- altijd aan te maken via het
// dagpaneel (ook op een dag zonder enige afspraak), een klein rood bolletje op de rooster-cel zelf
// toont of er iets in staat (nieuwe tabel planning_notities, migratie al rechtstreeks in Supabase
// uitgevoerd, geen actie van Peter nodig); (3) bugfix: een "Vrije taak" (zonder gekoppeld project)
// toonde in het zijpaneel altijd "(verwijderd project)" i.p.v. de eigen ingetypte tekst -- nu
// correct, en meteen ook rechtstreeks bewerkbaar via een ✏️-knopje (geen verwijderen+herbeginnen
// meer nodig).
// ronde 59: (1) de 5 manifest-*.json-bestanden deelden allemaal "scope":"./", waardoor Android/
// Chrome elke apart te installeren app (bv. CaPla) als "al geïnstalleerd" beschouwde zodra CaSuite
// zelf al op het beginscherm stond -- elk manifest kreeg nu zijn eigen, nauwe scope + id
// (BELANGRIJK: een al eerder geïnstalleerde app moet 1x verwijderd en opnieuw geïnstalleerd worden
// vóór dit effect heeft, een gewone update van deze bestanden volstaat niet voor een reeds
// bestaande installatie); (2) de hardware-/gebaar-terugknop sloot op een geïnstalleerde
// (homescherm-)app meestal meteen de hele app af i.p.v. 1 stap terug te doen -- een tabwissel of
// het openen/sluiten van het dagpaneel legt nu zelf een stap vast in de browsergeschiedenis, zodat
// de terugknop die eerst ongedaan maakt (voorlopig enkel tabwissels + het dagpaneel, niet de
// andere modals); (3) elk teamlid/Bureau-lid kreeg 2 nieuwe, optionele datumvelden "In dienst
// vanaf"/"Uit dienst vanaf" (Bedrijfsgegevens) -- buiten die periode toont het rooster een grijze,
// niet-klikbare "zone" i.p.v. een gewone cel, zodat niemand per ongeluk buiten zijn dienstperiode
// ingepland kan worden.
const CACHE_VERSION = 'casnap-v2026-10-03-r64';
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
