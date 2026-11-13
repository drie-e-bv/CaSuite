// knop.js — vaste knop "Mand ophalen" rechtsonder op de webshop. Een klik leest het mandje uit
// (lezer.js) en stuurt het naar CaSuite. Er wordt niets aangeklikt of gewijzigd op de webshop.
(function(){
  if(window.__casuiteKnop) { window.__casuiteKnop.toon(); return; }
  const host = document.createElement('div');
  host.id = 'casuite-mand-knop';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;';
  const sh = host.attachShadow({ mode: 'closed' });
  sh.innerHTML = `<style>
    :host{all:initial}
    .w{font:600 14px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
    button{all:unset;cursor:pointer;background:#8b5a2b;color:#fff;padding:11px 16px;border-radius:24px;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;gap:8px;align-items:center}
    button:hover{background:#7a4c22}
    button[disabled]{opacity:.6;cursor:wait}
    .x{all:unset;cursor:pointer;color:#fff;background:rgba(0,0,0,.25);border-radius:50%;width:18px;height:18px;font-size:12px;display:flex;align-items:center;justify-content:center;margin-left:4px}
    .m{background:#15241c;color:#fff;font-weight:500;padding:9px 12px;border-radius:10px;max-width:290px;box-shadow:0 4px 14px rgba(0,0,0,.25)}
    .m.f{background:#c0392b}
  </style>
  <div class="w"><div class="m" hidden></div><button type="button" title="Leest je winkelmandje uit en stuurt het naar CaSuite. Er wordt niets besteld."><span>🛒</span><span class="t">Mand ophalen</span><span class="x" title="Verbergen">✕</span></button></div>`;
  const knop = sh.querySelector('button'), melding = sh.querySelector('.m'), tekst = sh.querySelector('.t');
  function meld(t, fout){ melding.textContent = t; melding.className = 'm' + (fout ? ' f' : ''); melding.hidden = false; clearTimeout(meld._t); meld._t = setTimeout(() => { melding.hidden = true; }, fout ? 8000 : 5000); }
  sh.querySelector('.x').addEventListener('click', e => { e.stopPropagation(); host.remove(); });
  knop.addEventListener('click', async () => {
    knop.disabled = true; tekst.textContent = 'Bezig…';
    try{
      const mand = window.__casuiteLezer.leesMand();
      if(!mand.regels.length){ meld('Geen artikels gevonden op deze pagina. Open eerst je winkelmandje en klik dan opnieuw.', true); return; }
      const antwoord = await chrome.runtime.sendMessage({ type: 'mand', mand });
      meld(antwoord && antwoord.ok ? `${mand.regels.length} artikel${mand.regels.length === 1 ? '' : 's'} naar CaSuite gestuurd. Controleer ze daar en klik op Importeren.` : 'Doorsturen naar CaSuite mislukt.', !(antwoord && antwoord.ok));
    }catch(e){ meld('Uitlezen mislukt: ' + (e.message || e), true); }
    finally{ knop.disabled = false; tekst.textContent = 'Mand ophalen'; }
  });
  (document.body || document.documentElement).appendChild(host);
  window.__casuiteKnop = { toon(){ if(!host.isConnected) (document.body || document.documentElement).appendChild(host); } };
})();
