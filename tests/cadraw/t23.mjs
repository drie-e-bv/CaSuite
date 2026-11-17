import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p = await b.newPage();const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
await p.route('**/jspdf.umd.min.js',r=>r.fulfill({path:'/home/claude/edstest/node_modules/jspdf/dist/jspdf.umd.min.js',contentType:'text/javascript'}));
await p.route('**/supabase.js',r=>r.fulfill({path:'/home/claude/edstest/stub/supabase.js',contentType:'text/javascript'}));
await p.goto('http://localhost:8765/cadraw-bron.html');await p.waitForTimeout(500);await p.click('.pl[data-pid=p1]');await p.waitForTimeout(500);
await p.evaluate(async()=>{S.project.naam='Eerste';cloud.dirty=true;await cloud.save()});
console.log('1e bewaring', await p.evaluate(()=>__DB.project_cadraw_data.length+' rij, ver '+!!cloud.ver+' | '+document.querySelector('#cst').textContent));
await p.evaluate(async()=>{S.project.naam='Tweede';cloud.dirty=true;await cloud.save()});
console.log('2e bewaring', await p.evaluate(()=>__DB.project_cadraw_data[0].data.project.naam));
// collega bewaart intussen
await p.evaluate(()=>{const r=__DB.project_cadraw_data[0];r.updated_at='2099-01-01T00:00:00.000Z';r.bijgewerkt_door='Jan (CaDraw)';r.data=JSON.parse(JSON.stringify(r.data));r.data.project.naam='Van Jan'});
await p.evaluate(async()=>{S.project.naam='Mijn wijziging';cloud.dirty=true;await cloud.save()});await p.waitForTimeout(300);
console.log('na conflict: DB',await p.evaluate(()=>__DB.project_cadraw_data[0].data.project.naam),'| scherm',await p.evaluate(()=>S.project.naam),'| melding',await p.evaluate(()=>(document.querySelector('#ovl').innerText||'').slice(0,80).replace(/\n/g,' ')));
console.log(errs.join('\n')||'no errors');await b.close();
