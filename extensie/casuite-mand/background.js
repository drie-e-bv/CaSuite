// background.js — tussenstation tussen de webshop (knop.js) en CaSuite (brug.js).
const CASUITE = 'https://drie-e-bv.github.io/CaSuite/';
const CASUITE_MATCH = 'https://drie-e-bv.github.io/CaSuite/*';

async function casuiteTab(){
  const tabs = await chrome.tabs.query({ url: CASUITE_MATCH });
  if(!tabs.length) return null;
  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}

async function bezorg(bericht){
  let tab = await casuiteTab();
  if(!tab){
    // Geen CaSuite open: openen en het mandje bewaren tot de brug klaar is.
    await chrome.storage.session.set({ wachtend: bericht });
    tab = await chrome.tabs.create({ url: CASUITE + 'index.html' });
    return { ok: true, geopend: true };
  }
  try{
    await chrome.tabs.sendMessage(tab.id, bericht);
  }catch(e){
    // Brug nog niet geladen (bv. CaSuite-tab van vóór de installatie): herladen en later bezorgen.
    await chrome.storage.session.set({ wachtend: bericht });
    await chrome.tabs.reload(tab.id);
  }
  await chrome.tabs.update(tab.id, { active: true });
  if(tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  return { ok: true };
}

chrome.runtime.onMessage.addListener((bericht, afzender, antwoord) => {
  (async () => {
    if(bericht.type === 'mand' && afzender.tab){
      const uit = Object.assign({}, bericht.mand, { type: 'casuite-mand', versie: 1, shopTabId: afzender.tab.id });
      antwoord(await bezorg(uit));
    } else if(bericht.type === 'brug-klaar' && afzender.tab){
      const { wachtend } = await chrome.storage.session.get('wachtend');
      if(wachtend){
        await chrome.storage.session.remove('wachtend');
        // CaSuite moet eerst aangemeld en geladen zijn
        setTimeout(() => chrome.tabs.sendMessage(afzender.tab.id, wachtend).catch(() => {}), 2500);
      }
      antwoord({ ok: true });
    } else if(bericht.type === 'sluit-webshop' && bericht.shopTabId != null){
      // Enkel een tabblad sluiten dat geen CaSuite is.
      try{
        const t = await chrome.tabs.get(bericht.shopTabId);
        if(t && t.url && !t.url.startsWith(CASUITE)) await chrome.tabs.remove(bericht.shopTabId);
      }catch(e){}
      antwoord({ ok: true });
    } else antwoord({ ok: false });
  })();
  return true;
});

// Klik op het extensie-icoon: op elke andere webshop de knop "Mand ophalen" tonen.
chrome.action.onClicked.addListener(async tab => {
  if(!tab.id || !tab.url || tab.url.startsWith(CASUITE) || !/^https?:/.test(tab.url)) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lezer.js', 'knop.js'] });
});
