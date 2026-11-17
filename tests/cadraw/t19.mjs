import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p = await b.newPage({viewport:{width:1400,height:950}});
const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
await p.route('**/jspdf.umd.min.js',r=>r.fulfill({path:'/home/claude/edstest/node_modules/jspdf/dist/jspdf.umd.min.js',contentType:'text/javascript'}));
await p.goto('file:///home/claude/casuite/cadraw-bron.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(400);
await p.click('[data-tab=plan]');await p.waitForTimeout(100);
for(const l of ['muziek','alarm','netwerk']){
 await p.click(`[data-a=plaag][data-l=${l}]`);await p.waitForTimeout(80);
 console.log(l,'letters',await p.$$eval('.plk',e=>e.map(x=>x.childNodes[0].textContent).join(' ')),'| comps',await p.$$eval('.pc',e=>e.map(x=>x.innerText.replace(/\s+/g,' ').trim()).join(' / ')),'| klaar',await p.evaluate(()=>P.punt));
 const box=await (await p.$('#plan')).boundingBox();
 for(let i=0;i<3;i++){await p.mouse.move(box.x+200+i*80,box.y+150+ (l==='alarm'?100:l==='netwerk'?200:0));await p.mouse.click(box.x+200+i*80,box.y+150+(l==='alarm'?100:l==='netwerk'?200:0));await p.waitForTimeout(60)}
 console.log('   na 3 klikken -> items',await p.evaluate(l=>S.plannen[0].items.filter(i=>i.laag===l).map(i=>pindex(S)[i.pid].code).join(','),l),'| klaar',await p.evaluate(()=>P.punt));
}
await p.screenshot({path:'/home/claude/edstest/lagen.png'});
await p.click('[data-a=plaag][data-l=elektro]');await p.waitForTimeout(60);await p.screenshot({path:'/home/claude/edstest/lagen-elektro.png'});
// afdrukken: A3 + alle lagen
await p.click('[data-tab=print]');await p.waitForTimeout(100);
for(const k of ['planMuziek','planAlarm','planNetwerk'])await p.click(`input[data-c="print.${k}"]`);
await p.selectOption('select[data-b="print.formaat"]','A3');await p.waitForTimeout(150);
console.log('bladen',await p.evaluate(()=>allPages(S,S.print).map(x=>x.soort).join(' | ')),'| formaat',await p.evaluate(()=>PW+'x'+PH));
const uri=await p.evaluate(()=>buildPdf(S,S.print).output('datauristring'));fs.writeFileSync('/home/claude/edstest/out-a3.pdf',Buffer.from(uri.split(',')[1],'base64'));
console.log(errs.join('\n')||'no errors');await b.close();
