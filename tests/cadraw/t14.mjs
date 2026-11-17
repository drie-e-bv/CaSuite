import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p = await b.newPage({viewport:{width:1400,height:950}});
const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
await p.route('**/jspdf.umd.min.js',r=>r.fulfill({path:'/home/claude/edstest/node_modules/jspdf/dist/jspdf.umd.min.js',contentType:'text/javascript'}));
// lokaal
await p.goto('file:///home/claude/casuite/cadraw-bron.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(400);
await p.click('[data-a=mode][data-m=sel]');
const kid=await p.evaluate(()=>S.borden[0].groepen.flatMap(g=>g.kringen).find(k=>k.naam==='Verlichting leefruimte').id);
await p.click(`.hit[data-h="k:${kid}"]`);await p.click('#side [data-a=saveAsPre]');await p.fill('#askv','Verlichting living');await p.click('#asko');await p.waitForTimeout(150);
console.log('toast',await p.textContent('#tmsg'));console.log('preset',await p.evaluate(()=>JSON.stringify(CFG.presets[CFG.presets.length-1]).slice(0,230)));
console.log('lib sel',await p.evaluate(()=>E.sym),'| zichtbaar',await p.$$eval('.sy.on span',e=>e.map(x=>x.textContent)));
await p.screenshot({path:'/home/claude/edstest/pre1.png'});
// plaatsen in groep C (7 automaten, plaats genoeg)
const cid=await p.evaluate(()=>{const c=codes(S);return S.borden[0].groepen.flatMap(g=>g.kringen).find(k=>c.k[k.id]==='CC').id});
await p.click(`.addm[data-add="i:${cid}"]`);await p.waitForTimeout(150);
console.log('geplaatst',await p.evaluate(()=>{const L=locate(E.sel);return codes(S).k[L.k.id]+' '+L.k.naam+' '+L.k.punten.length+' punten, bron '+!!L.k.bron}));
// opnieuw bewaren zelfde naam -> vervangen
await p.click('#side [data-a=saveAsPre]');await p.fill('#askv','verlichting LIVING');await p.click('#asko');await p.waitForTimeout(100);console.log('dialoog',await p.$eval('#ovl',e=>e.innerText.slice(0,80).replace(/\s+/g,' ')));await p.click('#bvja');
console.log('aantal presets',await p.evaluate(()=>CFG.presets.length));
await p.click('[data-tab=extra]');await p.waitForTimeout(100);await p.screenshot({path:'/home/claude/edstest/pre2.png'});
await p.selectOption('select[data-cfgadd="0"]','sc_a');console.log('symbool toegevoegd',await p.evaluate(()=>CFG.presets[0].punten.map(x=>x.type).join(',')));
await p.click('[data-a=preDelSym][data-i="0"][data-j="0"]');console.log('na wissen',await p.evaluate(()=>CFG.presets[0].punten.map(x=>x.type).join(',')));
// cloud: gedeeld
await p.route('**/supabase.js',r=>r.fulfill({path:'/home/claude/edstest/stub/supabase.js',contentType:'text/javascript'}));
await p.goto('http://localhost:8765/cadraw-bron.html');await p.waitForTimeout(700);
console.log('cloud eerste keer -> gedeeld',await p.evaluate(()=>{const r=__DB.elektro_cados_instellingen[0];return r?r.sleutel+' '+r.waarde.presets.length:'(nog niet)'}));
await p.waitForTimeout(1000);console.log('na 1s',await p.evaluate(()=>{const r=__DB.elektro_cados_instellingen[0];return r?r.sleutel+' '+r.waarde.presets.length:'(nog niet)'}));
console.log(errs.join('\n')||'no errors');await b.close();
