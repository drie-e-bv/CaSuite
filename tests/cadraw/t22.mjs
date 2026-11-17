import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p = await b.newPage();const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
await p.route('**/jspdf.umd.min.js',r=>r.fulfill({path:'/home/claude/edstest/node_modules/jspdf/dist/jspdf.umd.min.js',contentType:'text/javascript'}));
await p.route('**/supabase.js',r=>r.fulfill({path:'/home/claude/edstest/stub/supabase.js',contentType:'text/javascript'}));
await p.goto('http://localhost:8765/cadraw-bron.html');await p.waitForTimeout(500);await p.click('.pl[data-pid=p1]');await p.waitForTimeout(500);
const it=id=>p.evaluate(id=>{for(const r of __DB.project_elektro_dossiers[0].data.zekeringen.kasten[0].rijen)for(const i of r.items)if(i.id===id)return i.naam+' '+i.A;},id);
// iemand wijzigt in CaDos: Oven 20A -> 32A, terwijl CaDraw open staat
await p.evaluate(()=>{const d=__DB.project_elektro_dossiers[0];d.data.zekeringen.kasten[0].rijen[0].items[1].A='32A';d.updated_at='2026-11-17T12:00:00+00:00'});
// in CaDraw: Kookplaat hernoemen + bewaren
await p.evaluate(async()=>{const k=S.borden[0].groepen[0].kringen.find(k=>k.naam==='Kookplaat');k.naam='Inductie';await cloud.save()});
console.log('Oven in CaDos (moet 32A blijven):',await it('a1'),'| Kookplaat:',await it('a2'));
// daarna in CaDraw Oven-A wijzigen -> moet wel doorgaan
await p.evaluate(async()=>{S.borden[0].groepen[0].kringen.find(k=>k.naam==='Oven').A=16;await cloud.save()});
console.log('na wijziging in CaDraw:',await it('a1'));
console.log(errs.join('\n')||'no errors');await b.close();
