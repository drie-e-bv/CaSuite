// brug.js — draait op de CaSuite-pagina zelf. Laat CaSuite weten dat de extensie er is en geeft
// mandjes van de webshop door (extensie -> pagina), en het verzoek om het webshop-tabblad te
// sluiten na een geslaagde import (pagina -> extensie). Geen toegang tot iets anders.
(function(){
  const VERSIE = chrome.runtime.getManifest().version;
  const zeg = () => {
    try{ document.documentElement.dataset.casuiteMand = VERSIE; }catch(e){}
    window.postMessage({ type: 'casuite-mand-hallo', versie: VERSIE }, location.origin);
  };
  if(document.documentElement) zeg();
  document.addEventListener('DOMContentLoaded', () => {
    zeg();
    chrome.runtime.sendMessage({ type: 'brug-klaar' }).catch(() => {});
  });
  chrome.runtime.onMessage.addListener((bericht, afzender, antwoord) => {
    if(bericht && bericht.type === 'casuite-mand'){
      window.postMessage(bericht, location.origin);
      antwoord({ ok: true });
    }
  });
  window.addEventListener('message', ev => {
    if(ev.source !== window || !ev.data || ev.data.type !== 'casuite-mand-sluit') return;
    chrome.runtime.sendMessage({ type: 'sluit-webshop', shopTabId: ev.data.shopTabId }).catch(() => {});
  });
})();
