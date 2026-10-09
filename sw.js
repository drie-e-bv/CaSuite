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
// ronde 67: Peter: "Kunnen we een 'enkel weergave' scherm/layout webpagina maken van de planning
// vanaf de huidige week? om op een scherm weer te geven" -- bedoeld voor een vast wandscherm op
// kantoor. Nieuw, HELEMAAL LOSSTAAND bestand scherm.html (niet via build-apps.js uit src2.html
// gegenereerd, geen aanmelding): toont, bevestigd via AskUserQuestion, vandaag bovenaan/groot, de
// volgende dagen (instelbaar aantal) daaronder, schakelt om 00u00 automatisch door, en herlaadt de
// gegevens elke 3 minuten. Toegang zonder in te loggen -- Peter koos expliciet voor "geen login
// nodig (vaste link)" en aanvaardde daarbij bewust: "wie de link kent, kan de planning zien... geen
// gevoelige data zoals lonen". De échte beveiliging zit niet in de link zelf (de
// Supabase-anoniem-sleutel staat toch al gewoon in de broncode) maar in een nieuw, geheim
// "scherm_token" op bedrijf, gecontroleerd door de nieuwe scherm_data()-databankfunctie (security
// definer, bypasst RLS bewust zelf en geeft bij een fout/ontbrekend token altijd gewoon null terug).
// Instelbaar op Bedrijfsgegevens -> "Schermweergave (planningsbord)": de link zelf (met
// "Nieuwe link genereren"-knop, maakt de vorige onmiddellijk ongeldig), hoeveel dagen vooruit
// getoond worden, en welke rollen (niets aanvinken = alle rollen) -- exact zoals gevraagd
// ("instelbaar in de bedrijfspagina... hoeveel dagen en welke werknemers"). sw.js zelf is
// inhoudelijk ongewijzigd voor dit onderdeel (scherm.html registreert deze service worker nooit
// zelf), enkel de cacheversie hieronder opgehoogd zoals bij elke ronde die code aanraakt.
// ronde 68: scherm.html herwerkt naar een rooster-matrix (dagen als rijen, personen als kolommen,
// i.p.v. de vroegere verticale dag-kaarten) + een eigen "Toepassen"-knop bij de
// Schermweergave-instellingen (bewaart dagen/rollen onmiddellijk, los van de grote
// "Bedrijfsgegevens opslaan"-knop) + een nieuw "als voorstel toevoegen"-vinkje in het dagpaneel
// (#ip-markeer-voorstel, src2.html) waarmee een planner een nieuwe afspraak zelf, handmatig, als
// voorstel (bevestigd:false) kan markeren i.p.v. de bestaande automatische regel. sw.js zelf is
// voor dit onderdeel inhoudelijk ongewijzigd (scherm.html registreert deze service worker nooit
// zelf), enkel de cacheversie hieronder opgehoogd (geldt voor index.html/werf.html/planning.html/
// cados.html/cacalc.html, die wel via build-apps.js uit het gewijzigde src2.html opnieuw gegenereerd zijn).
// ronde 71: herontwerp van de START van het Werfverslag-tabblad, op vraag van Peter: "Nu is het
// verwarrend, wanneer je nieuw of ander project start [...] Kiezen tussen: Nieuw niet gekoppeld
// verslag, nieuw gekoppeld verslag (gelinkt aan project in het systeem) of verslag bewerken. Een
// knop om naar deze pagina terug te keren zodra je aan een verslag bezig bent." Het tabblad toont
// voortaan ALTIJD eerst een nieuw keuzescherm (#verslag-keuzescherm) bij binnenkomst -- geen
// automatisch heropenen van het laatst-geopende verslag meer, geen stille overname van het
// bovenaan gekozen project meer. 3 keuzes: "+ Nieuw niet-gekoppeld verslag" (meteen een leeg
// formulier, geen project), "+ Nieuw gekoppeld verslag" (eerst een nieuwe projectkiezer, hergebruikt
// het bestaande zoekveld+lijst-patroon, dan het leeg formulier met dat project vast -- niet meer
// wijzigbaar binnen het formulier zelf), "Verslag bewerken" (het bestaande Verslagen-overzicht,
// ongewijzigd). Een vaste "← Terug naar start"-knop (vervangt het vroegere "+ Nieuw verslag"-knopje
// op dezelfde plek) brengt je vanuit elk open verslag terug naar dit keuzescherm -- vraagt een
// bevestiging zolang er onopgeslagen inhoud in een NIEUW verslag staat, maar niet meer bij het
// verlaten van een al opgeslagen verslag. De bovenaan-paginapicker ("Actief project") blijft op
// Dossier/Kabelberekening gewoon normaal bedienbaar, maar is voortaan alleen-lezen zodra je op het
// Werfverslag-tabblad zelf zit (toont enkel nog welk project het open verslag heeft). Carry-over
// van openstaande actiepunten triggert nu pas ná de vaste projectkeuze. Geen SQL-wijziging.
// ronde 69: nieuwe tool "🔍 Snel een gaatje zoeken" in de rooster-toolbar van Personeelsplanning
// (naast "Rooster exporteren"), op vraag van Peter: een klant belt om te vragen of/wanneer een
// technieker vrij is -- deze knop (enkel zichtbaar voor wie "Voorstellen maken" mag, zelfde vlag
// als de Inschatting-subtab) doorzoekt het bestaande rooster op de eerste 5 vrije momenten (hele
// dag, of een halve dag die nog vrij is, telt ook mee), filterbaar op rol en op project (geen
// project gekozen = een vrije taak met eigen omschrijving), en maakt op de gekozen optie meteen een
// NIEUW voorstel aan (bevestigd altijd false -- nooit automatisch bevestigd, ook niet voor een
// planner met doorgaans automatische bevestiging). Bevestigen blijft, zoals altijd, een apart,
// bewuste stap in het rooster zelf. Zie ipQfOpties()/ipQfKies()/#ip-quickfind-modal in src2.html.
// sw.js zelf is voor dit onderdeel inhoudelijk ongewijzigd, enkel de cacheversie hieronder
// opgehoogd (geldt voor index.html/werf.html/planning.html/cados.html/cacalc.html, opnieuw
// gegenereerd via build-apps.js uit het gewijzigde src2.html).
// ronde 66: Peter: "Kun je bij kabelberekening het nieuwe RZ1 kabeltype ook bij mantel toevoegen
// en de gegevens ervan opnemen in de tabellen?" -- "RZ1" (RZ1-K(AS)) is zelf XLPE-geïsoleerd, enkel
// de buitenmantel is halogeenvrij/brandwerend, dus elektrisch dezelfde belastbaarheids-/
// kortsluitklasse als de al bestaande "XLPE / PR"-isolatieklasse (zelfde klasse als "XGB" en
// "Halogeenvrij (Cca/B2ca)"). Toegevoegd als 1 nieuwe regel in DATATABEL.mantelmap ("RZ1":"XLPE /
// PR") -- hergebruikt zo de bestaande, al correcte belastbaarheids-/kfactor-tabellen i.p.v. nieuwe,
// zelf-ingevoerde rijen (veiliger voor een rekentool). Zelf gevonden en meteen verholpen:
// importParseKabel() (compacte Excel-import-notatie zoals "XGB3G2,5") herkende mantelnamen voorheen
// via een vaste "eerst enkel letters, dan cijfers"-regex, die een mantelnaam met een eigen cijfer
// (zoals "RZ1") niet meer kon onderscheiden van het daaropvolgende aantal-aders-cijfer ("RZ13G2,5"
// zou dan foutief als mantel "RZ" + 13 aders gelezen zijn). Matcht nu expliciet tegen de bekende
// mantelcodes, langste eerst. Geen SQL-wijziging.
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
// Ronde 70 (2026-10-08): geschiedenis/logboek + "ongedaan maken" op een planning-afspraak (nieuwe
// tabel planning_items_historiek, 🕘-icoontje/#ip-historiek-modal in de Personeelsplanning) + een
// opmaakbugfix in "+ Nieuw gekoppeld verslag" (projectlijst liep bij genoeg projecten onder de
// afgeronde kaart uit, zie de toelichting bij #verslag-projectkiezer .ip-proj-list in src2.html).
// Ronde "plannen-pdf-schets" (2026-10-08, zelfde dag): PDF-plannen + schets op een plan, op vraag
// van Peter ("1. Bij een project PDF plannen toevoegen. 2. Op die plannen schets te maken (na
// inzoomen indien nodig) en dit opslaan. Dit als onderdeel van de werfverslag app."). CaDos' tab
// "Plannen" accepteert nu ook een PDF bij het uploaden (nieuwe paginakiezer, pdf.js rasteriseert
// de gekozen pagina naar een PNG; 2 nieuwe, nullable kolommen pdf_bron/pdf_pagina op
// project_plannen onthouden de PDF-oorsprong). Nieuw in het Werfverslag: een "🖊️ Schets op
// plan"-knop op elk actiepunt (enkel zichtbaar met een gekoppeld project) die een plan van dat
// project laat kiezen (of meteen een nieuw plan/PDF laat uploaden) en er met zoom/kleur/dikte/
// ongedaan-maken op laat tekenen -- "Opslaan" gebruikt de schets gewoon als foto bij dat
// actiepunt (zelfde opslag-/uploadpad als een normale foto).
// Ronde "ip-meer-knop" (2026-10-08, zelfde dag als ronde "plannen-pdf-schets"): Peter, over het
// mobiele Rooster-scherm van Planning: "exporteren, mijn week en gaatje zoeken pakken veel te
// veel plaats in op het scherm", gevolgd door "Maar klein en discreet" en "Er moet zo veel
// mogelijk zichtbare planning zijn op het scherm". Op gsm (<=640px) zijn "Mijn week tonen/
// verbergen", "Rooster exporteren" en "Snel een gaatje zoeken" voortaan gebundeld achter 1
// nieuwe, kleine "⋯ Meer"-knop naast de periode-navigatie (zelfde patroon als de bestaande
// "Filters & legende"-knop uit ronde 62) -- enkel op gsm, desktop/tablet blijven ongewijzigd.
// Ronde "ip-controls-desktop" (2026-10-09): Peter stuurde een screenshot van de website-/desktop-
// versie van het Rooster-tabblad: "Kun je deze knoppen ook op de websiteversie beter zetten?" --
// verduidelijkt tot "te los/rommelig verdeeld". Oorzaak: .ip-controls was een grid met maar 2
// kolommen terwijl er 4 kinderen in stonden -- "Snel een gaatje zoeken" week daardoor uit naar een
// eigen, volle-breedte rij. Herbouwd tot 3 vaste kolommen (myweek-linkje | periode-navigatie,
// gecentreerd | export+quickfind samen rechts) via grid-template-areas, zodat alles netjes op 1 rij
// blijft staan -- enkel tablet/desktop (>640px); de gsm-indeling (ronde "ip-meer-knop") is
// ongewijzigd.
// Ronde "scherm-max8" (2026-10-09): Peter stuurde een live screenshot van het wandscherm met 15
// personen op 1 onleesbaar smalle rij: "Kun je de planning op het scherm verdelen in max 8
// personen op een rij?" -- scherm.html verdeelt personen nu in groepen van max 8, elke groep met
// zijn eigen, gestapelde rooster-matrix (bij <=8 personen onveranderd, exact zoals voorheen). De
// projectchip toont nu de projectnaam, gemeente en (nieuw) projectleider elk op een eigen regel
// i.p.v. 1 afgekapte regel. 2 nieuwe vinkjes bij Bedrijfsgegevens -> Schermweergave ("Op elke
// projectchip tonen": Gemeente van het project / Projectleider, beide standaard AAN) laten Peter
// zelf kiezen welke van die 2 velden op het scherm komen (src2.html, dus alle 5 gebouwde apps +
// scherm.html wijzigen deze ronde mee).
// Ronde "scherm-max8-herzien" (2026-10-09, zelfde dag): Peter zag de eerste versie live en gaf
// feedback: de datumkolom herhaalde zich per groep van personen ("de 2 rijen van de dag samen"),
// de planningsvakjes/het lettertype mochten groter, en meerdere afspraken in 1 vak moesten onder
// elkaar i.p.v. naast elkaar komen. scherm.html herbouwd naar 1 ENKELE gedeelde grid (geen
// duplicaat-datumrij meer per personen-groep, via CSS grid-row-span), iets grotere
// lettergrootte-/celgrenzen, en .scherm-chiprow op flex-direction:column. Enkel scherm.html
// wijzigt deze ronde, geen src2.html/SQL.
// Ronde "scherm-max8-herzien2" (2026-10-09, zelfde dag): Peter zag die gedeelde-datumrij-versie
// live en stuurde een paint-knip/plak-voorbeeld: "de namen staan nu samen bovenaan en de taken
// staan nu onderaan, dit zou bij elkaar moeten staan" -- de grid-row-span-oplossing zette alle
// koprijen samen bovenaan en alle dagrijen daaronder, waardoor een groep se naam ver van zijn eigen
// taken kwam te staan. scherm.html herbouwd naar GROEP-gewijs geordend (elke groep se koprij
// onmiddellijk gevolgd door zijn eigen dagrijen, naam+taak dus weer recht onder elkaar), met enkel
// de 1e groep die de volledige datumtekst toont (geen herhaalde datum). Enkel scherm.html wijzigt.
const CACHE_VERSION = 'casnap-v2026-10-09-schermweekdagen';
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
