#!/usr/bin/env node
/**
 * build-apps.js — genereert index.html / werf.html / planning.html / cados.html
 * uit één bronbestand (src2.html, functioneel identiek aan index.html).
 *
 * Herbouwd op 2026-09-20 na een reset van de werkomgeving (zie
 * casentis-todo-en-ai-voorstellen.md / project-doc-v4.md voor de volledige
 * geschiedenis). Reproduceert exact het gedrag zoals eerder gedocumenteerd
 * in het project-doc: enkel een handvol <head>-regels wijzigen + een
 * geïnjecteerd <script>window.CASNAP_APP_MODE=...</script> vóór de eerste
 * CDN-<script>-tag (jsPDF).
 *
 * Gebruik: node build-apps.js
 * Verwacht src2.html in dezelfde map; schrijft index.html/werf.html/planning.html/cados.html
 * ook in dezelfde map.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SRC = path.join(DIR, 'src2.html');

if (!fs.existsSync(SRC)) {
  console.error('src2.html niet gevonden in ' + DIR + ' — kopieer eerst de laatste index.html naar src2.html.');
  process.exit(1);
}

const source = fs.readFileSync(SRC, 'utf-8');

// Favicon voor de Planning-app (oranje/bruin CaPla-icoon), apart bestand
// omdat het een grote base64-blob is.
const FAVICON_PLANNING_PATH = path.join(DIR, '..', 'casentis-deliver', 'favicon-planning-base64.txt');
// Favicon voor de CaDos-app (groen CaDos-icoon), zelfde reden (2026-09-23, op vraag van Peter:
// "Is er geen html voor cados?").
const FAVICON_CADOS_PATH = path.join(DIR, '..', 'casentis-deliver', 'favicon-cados-base64.txt');
// Favicon voor de CaCalc-app (blauw CaCalc-icoon), zelfde reden -- CaCalc toegevoegd als eigen,
// losstaand tabblad (op vraag van Peter: "Kun je extra app toevoegen aan de Suite? CaCalc App
// voor de kabelberekeningen te maken... Is losstaand."). Optioneel: valt terug op het gewone
// CaSuite-icoon zolang dit bestand nog niet aangeleverd is (zie buildCacalc() hieronder).
const FAVICON_CACALC_PATH = path.join(DIR, '..', 'casentis-deliver', 'favicon-cacalc-base64.txt');

function replaceOnce(str, pattern, replacement, label) {
  if (!pattern.test(str)) {
    console.warn(`WAARSCHUWING: patroon voor "${label}" niet gevonden — niets aangepast.`);
    return str;
  }
  return str.replace(pattern, replacement);
}

function buildIndex() {
  // index.html = ongewijzigde kopie van de bron (APP_MODE valt terug op 'full')
  fs.writeFileSync(path.join(DIR, 'index.html'), source, 'utf-8');
  console.log('index.html geschreven.');
}

function buildWerf() {
  let html = source;
  html = replaceOnce(html, /<title>[^<]*<\/title>/, '<title>CaSnap Werf – werfverslagen</title>', 'title (werf)');
  html = replaceOnce(html, /<link rel="manifest" href="\.\/manifest\.json">/, '<link rel="manifest" href="./manifest-werf.json">', 'manifest (werf)');
  html = replaceOnce(html, /<meta name="apple-mobile-web-app-title" content="[^"]*">/, '<meta name="apple-mobile-web-app-title" content="CaSnap Werf">', 'apple-mobile-web-app-title (werf)');
  // Bugfix (2026-09-23, op vraag van Peter -- "kun je de icoonbestanden correct linken"): er
  // stond hier vroeger een regel die apple-touch-icon naar een "icons-werf/"-map liet wijzen die
  // nooit bestaan heeft of bezorgd is (dode link op de website). De Werf-app hergebruikt gewoon
  // het CaSuite-logo (zelfde als index.html, geen eigen Werf-icoon) -- dus bewust GEEN
  // apple-touch-icon-vervanging hier: die regel blijft "./icons/icon192.png" zoals in de bron.
  // theme-color blijft hetzelfde blauw (#1465f5) voor de Werf-app — geen wijziging nodig.
  // CASNAP_APP_MODE injecteren vóór de eerste CDN-<script> (jsPDF)
  html = replaceOnce(
    html,
    /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//,
    `<script>window.CASNAP_APP_MODE = 'werf';</script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/`,
    'CASNAP_APP_MODE injectie (werf)'
  );
  fs.writeFileSync(path.join(DIR, 'werf.html'), html, 'utf-8');
  console.log('werf.html geschreven.');
}

function buildPlanning() {
  let html = source;
  html = replaceOnce(html, /<title>[^<]*<\/title>/, '<title>CaPla – Personeelsplanning</title>', 'title (planning)');
  html = replaceOnce(html, /<link rel="manifest" href="\.\/manifest\.json">/, '<link rel="manifest" href="./manifest-planning.json">', 'manifest (planning)');
  html = replaceOnce(html, /<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="#f58a14">', 'theme-color (planning)');
  html = replaceOnce(html, /<meta name="apple-mobile-web-app-title" content="[^"]*">/, '<meta name="apple-mobile-web-app-title" content="CaPla">', 'apple-mobile-web-app-title (planning)');
  html = replaceOnce(html, /<link rel="apple-touch-icon" href="\.\/icons\/icon192\.png">/, '<link rel="apple-touch-icon" href="./icons-planning/icon192.png">', 'apple-touch-icon (planning)');
  // eigen favicon (oranje/bruin CaPla-icoon) i.p.v. het blauwe CaSnap-icoon
  if (fs.existsSync(FAVICON_PLANNING_PATH)) {
    const faviconData = fs.readFileSync(FAVICON_PLANNING_PATH, 'utf-8').trim();
    html = replaceOnce(
      html,
      /<link rel="icon" type="image\/png" href="data:image\/png;base64,[^"]+">/,
      `<link rel="icon" type="image/png" href="${faviconData}">`,
      'favicon (planning)'
    );
  } else {
    console.warn('WAARSCHUWING: favicon-planning-base64.txt niet gevonden — CaPla-favicon niet aangepast.');
  }
  html = replaceOnce(
    html,
    /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//,
    `<script>window.CASNAP_APP_MODE = 'planning';</script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/`,
    'CASNAP_APP_MODE injectie (planning)'
  );
  fs.writeFileSync(path.join(DIR, 'planning.html'), html, 'utf-8');
  console.log('planning.html geschreven.');
}

function buildCados() {
  // Eigen installeerbare "CaDos"-app (2026-09-23, op vraag van Peter: "Is er geen html voor
  // cados?") -- zelfde opzet als werf.html/planning.html: een dunne kopie met eigen naam/icoon/
  // favicon/theme-color en een geïnjecteerde CASNAP_APP_MODE='cados', die er in index.html voor
  // zorgt dat enkel het CaDos-tabblad toegankelijk is (zie CADOS_TABS/tabsForAppMode()) en de
  // opstart-keuze automatisch overgeslagen wordt (er is toch maar 1 optie).
  let html = source;
  html = replaceOnce(html, /<title>[^<]*<\/title>/, '<title>CaDos – Elektro &amp; Domotica</title>', 'title (cados)');
  html = replaceOnce(html, /<link rel="manifest" href="\.\/manifest\.json">/, '<link rel="manifest" href="./manifest-cados.json">', 'manifest (cados)');
  // Zelfde gedempt groen als de CaDos-huisstijl zelf (--copper in de #cados-app-CSS-variabelen).
  html = replaceOnce(html, /<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="#2F7A4D">', 'theme-color (cados)');
  html = replaceOnce(html, /<meta name="apple-mobile-web-app-title" content="[^"]*">/, '<meta name="apple-mobile-web-app-title" content="CaDos">', 'apple-mobile-web-app-title (cados)');
  html = replaceOnce(html, /<link rel="apple-touch-icon" href="\.\/icons\/icon192\.png">/, '<link rel="apple-touch-icon" href="./icons-cados/icon192.png">', 'apple-touch-icon (cados)');
  // eigen favicon (groen CaDos-icoon) i.p.v. het blauwe CaSuite-icoon
  if (fs.existsSync(FAVICON_CADOS_PATH)) {
    const faviconData = fs.readFileSync(FAVICON_CADOS_PATH, 'utf-8').trim();
    html = replaceOnce(
      html,
      /<link rel="icon" type="image\/png" href="data:image\/png;base64,[^"]+">/,
      `<link rel="icon" type="image/png" href="${faviconData}">`,
      'favicon (cados)'
    );
  } else {
    console.warn('WAARSCHUWING: favicon-cados-base64.txt niet gevonden — CaDos-favicon niet aangepast.');
  }
  html = replaceOnce(
    html,
    /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//,
    `<script>window.CASNAP_APP_MODE = 'cados';</script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/`,
    'CASNAP_APP_MODE injectie (cados)'
  );
  fs.writeFileSync(path.join(DIR, 'cados.html'), html, 'utf-8');
  console.log('cados.html geschreven.');
}

function buildCacalc() {
  // Eigen installeerbare "CaCalc"-app (kabelberekening AREI/RGIE, toegevoegd als eigen, losstaand
  // tabblad -- op vraag van Peter: "Kun je extra app toevoegen aan de Suite? CaCalc App voor de
  // kabelberekeningen te maken. Mag te linken zijn aan een project, maar hoeft niet in CaDos te
  // zitten. Is losstaand.") -- exact zelfde opzet als buildCados() hierboven: een dunne kopie met
  // eigen naam/icoon/favicon/theme-color en een geïnjecteerde CASNAP_APP_MODE='cacalc', die er in
  // index.html voor zorgt dat enkel het CaCalc-tabblad (+ Projecten/Bedrijfsgegevens) toegankelijk
  // is (zie CACALC_TABS/tabsForAppMode()) en de opstart-keuze automatisch overgeslagen wordt (er
  // is toch maar 1 optie).
  let html = source;
  html = replaceOnce(html, /<title>[^<]*<\/title>/, '<title>CaCalc – Kabelberekening AREI</title>', 'title (cacalc)');
  html = replaceOnce(html, /<link rel="manifest" href="\.\/manifest\.json">/, '<link rel="manifest" href="./manifest-cacalc.json">', 'manifest (cacalc)');
  // CaCalc's stijl is herleid naar CaSuite's eigen blauw (zie #cacalc-app-CSS-variabelen in
  // src2.html) -- zelfde theme-color als de rest van CaSuite, geen eigen kleuridentiteit meer.
  html = replaceOnce(html, /<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="#1465f5">', 'theme-color (cacalc)');
  html = replaceOnce(html, /<meta name="apple-mobile-web-app-title" content="[^"]*">/, '<meta name="apple-mobile-web-app-title" content="CaCalc">', 'apple-mobile-web-app-title (cacalc)');
  // Peter heeft de CaCalc-iconen (2026-09-25) rechtstreeks in de bestaande, gedeelde `icons/`-map
  // op zijn website gezet -- niet in een eigen `icons-cacalc/`-map zoals bij CaDos/CaPla -- met de
  // bezorgde bestandsnamen (`cacalc-icon-192.png`/`cacalc-icon-512.png`/`cacalc-icon-180.png`)
  // ongewijzigd behouden i.p.v. ze te hernoemen naar icon192.png/icon512.png. Dit pad hieronder is
  // daarop aangepast; zie ook manifest-cacalc.json (moet dezelfde bestandsnamen/map gebruiken).
  html = replaceOnce(html, /<link rel="apple-touch-icon" href="\.\/icons\/icon192\.png">/, '<link rel="apple-touch-icon" href="./icons/cacalc-icon-192.png">', 'apple-touch-icon (cacalc)');
  // eigen favicon (blauw CaCalc-icoon) i.p.v. het gewone CaSuite-icoon -- optioneel, zie
  // FAVICON_CACALC_PATH hierboven; zolang dat bestand niet aangeleverd is, blijft gewoon het
  // bestaande CaSuite-favicon staan (geen harde fout, enkel een waarschuwing).
  if (fs.existsSync(FAVICON_CACALC_PATH)) {
    const faviconData = fs.readFileSync(FAVICON_CACALC_PATH, 'utf-8').trim();
    html = replaceOnce(
      html,
      /<link rel="icon" type="image\/png" href="data:image\/png;base64,[^"]+">/,
      `<link rel="icon" type="image/png" href="${faviconData}">`,
      'favicon (cacalc)'
    );
  } else {
    console.warn('WAARSCHUWING: favicon-cacalc-base64.txt niet gevonden — CaCalc-favicon niet aangepast (valt terug op het gewone CaSuite-icoon).');
  }
  html = replaceOnce(
    html,
    /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//,
    `<script>window.CASNAP_APP_MODE = 'cacalc';</script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/`,
    'CASNAP_APP_MODE injectie (cacalc)'
  );
  fs.writeFileSync(path.join(DIR, 'cacalc.html'), html, 'utf-8');
  console.log('cacalc.html geschreven.');
}

buildIndex();
buildWerf();
buildPlanning();
buildCados();
buildCacalc();
console.log('Klaar.');
