import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p = await b.newPage({viewport:{width:1400,height:950}});
const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
await p.route('**/jspdf.umd.min.js',r=>r.fulfill({path:'/home/claude/edstest/node_modules/jspdf/dist/jspdf.umd.min.js',contentType:'text/javascript'}));
await p.route('**/dxf-parser.js',r=>r.fulfill({path:'/home/claude/edstest/node_modules/dxf-parser/dist/dxf-parser.js',contentType:'text/javascript'}));
await p.goto('file:///home/claude/casuite/cadraw-bron.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(400);
await p.click('[data-tab=plan]');await p.click('[data-a=addPlan]');await p.fill('#askv','Test CAD');await p.click('#asko');await p.waitForTimeout(100);
await p.setInputFiles('#bgFile','/home/claude/edstest/dxf/test-woning.dxf');await p.waitForTimeout(800);
console.log('dialoog lagen',await p.$$eval('#ovl tr td:first-child',e=>e.map(x=>x.innerText.replace(/\s+/g,' '))));
console.log('vinkjes',await p.$$eval('#ovl [data-cl]',e=>e.map(x=>x.dataset.f+'='+x.checked).join(' ')));
await p.screenshot({path:'/home/claude/edstest/cad-dlg.png'});
// uitsnede: linkerhelft (gelijkvloers)
const sv=await (await p.$('#cadpv')).boundingBox();
await p.mouse.move(sv.x+5,sv.y+5);await p.mouse.down();await p.mouse.move(sv.x+sv.width*0.47,sv.y+sv.height-3,{steps:5});await p.mouse.up();
await p.click('#cadok');await p.waitForTimeout(300);
console.log('toast',await p.textContent('#tmsg'));
console.log('plan',await p.evaluate(()=>{const pl=S.plannen[P.pi];return JSON.stringify({h:pl.h,lagen:pl.cad.lagen.map(l=>l.n+(l.snap?'*':'')+':'+l.d.length),tekst:pl.cad.tekst.map(t=>t.t+'@'+Math.round(t.x)+','+Math.round(t.y)+' z'+t.z)})}));
// symbool plaatsen: kleeft aan CAD-muur?
const box=await (await p.$('#plan')).boundingBox();
await p.mouse.click(box.x+150,box.y+40);await p.waitForTimeout(100);
console.log('geplaatst op',await p.evaluate(()=>{const it=S.plannen[P.pi].items.at(-1);return it.x+','+it.y}),'| CAD-snapsegmenten',await p.evaluate(()=>cadSegs(S.plannen[P.pi]).length));
await p.screenshot({path:'/home/claude/edstest/cad-plan.png'});
await p.click('[data-a=cadLagen]');await p.click('#ovl [data-cl2="0"][data-f=aan]');await p.waitForTimeout(100);await p.click('#ovl [data-a=closeOvl]');
console.log('laag uit -> paden',await p.$$eval('#plan path',e=>e.length));
const uri=await p.evaluate(()=>buildPdf(S,{plan:true}).output('datauristring'));fs.writeFileSync('/home/claude/edstest/out-cad.pdf',Buffer.from(uri.split(',')[1],'base64'));
// dwg melding
fs.writeFileSync('/tmp/x.dwg','AC1032');await p.setInputFiles('#bgFile','/tmp/x.dwg');await p.waitForTimeout(200);console.log('dwg:',(await p.$eval('#ovl',e=>e.innerText)).slice(0,80).replace(/\s+/g,' '));
console.log(errs.join('\n')||'no errors');await b.close();
