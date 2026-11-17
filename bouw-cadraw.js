#!/usr/bin/env node
/**
 * bouw-cadraw.js (2026-11-17) — maakt van CaSuite één geheel met CaDraw erin.
 *
 * 1. Zet cadraw-bron.html (de CaDraw-app, eendraadschema + situatieplan) als base64 in index.html,
 *    tussen <!--CADRAW-BEGIN--> en <!--CADRAW-END--> (in #cadraw-bron). index.html start CaDraw daaruit
 *    in een iframe op het tabblad "Schema & plan" (zie refreshCadrawTab() in index.html).
 * 2. Zet de losse apps opnieuw gelijk met index.html: werf/planning/cados/cacalc.html houden hun eigen
 *    <head>-begin (titel, icoon, manifest, APP_MODE) en krijgen de rest (vanaf de jsPDF-script-tag) uit
 *    index.html. cabon.html wordt bewust NIET aangeraakt (komt uit een andere bron, zie LEESMIJ).
 * 3. Maakt cadraw.html: de losse CaDraw-app (APP_MODE 'cadraw', CaDos-icoon, eigen manifest).
 *
 * Gebruik: node bouw-cadraw.js   (na elke wijziging aan cadraw-bron.html of index.html)
 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const lees = f => fs.readFileSync(path.join(DIR, f), 'utf-8');
const schrijf = (f, s) => { fs.writeFileSync(path.join(DIR, f), s, 'utf-8'); console.log(f + ' geschreven.'); };

let index = lees('index.html');
const b64 = Buffer.from(lees('cadraw-bron.html'), 'utf-8').toString('base64');
const re = /<!--CADRAW-BEGIN-->[\s\S]*?<!--CADRAW-END-->/;
if (!re.test(index)) { console.error('Markering <!--CADRAW-BEGIN--> niet gevonden in index.html'); process.exit(1); }
index = index.replace(re, () => '<!--CADRAW-BEGIN-->' + b64 + '<!--CADRAW-END-->');
schrijf('index.html', index);

const JSPDF = '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/';
const staart = index.slice(index.indexOf(JSPDF));
function kop(html, naam) {
  const i = html.indexOf(JSPDF);
  if (i < 0) throw new Error('jsPDF-tag niet gevonden in ' + naam);
  return html.slice(0, i);
}
for (const v of ['werf', 'planning', 'cados', 'cacalc']) {
  const f = v + '.html';
  if (!fs.existsSync(path.join(DIR, f))) continue;
  schrijf(f, kop(lees(f), f) + staart);
}

let k = kop(lees('cados.html'), 'cados.html');
k = k.replace(/<title>[^<]*<\/title>/, '<title>CaDraw – Eendraadschema &amp; situatieplan</title>')
  .replace('./manifest-cados.json', './manifest-cadraw.json')
  .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*">/, '<meta name="apple-mobile-web-app-title" content="CaDraw">')
  .replace("window.CASNAP_APP_MODE = 'cados';", "window.CASNAP_APP_MODE = 'cadraw';");
schrijf('cadraw.html', k + staart);
