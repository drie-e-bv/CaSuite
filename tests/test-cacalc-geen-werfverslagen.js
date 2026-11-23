const { chromium } = require('playwright'); const path=require('path'); const fs=require('fs');
const D=process.argv[2]; const stub=fs.readFileSync(path.join(D,'tests/koppelen/stub-supabase.js'),'utf8');
(async()=>{ const b=await chromium.launch(); let ok=true;
 for (const app of ['cacalc','index']) for (const w of [1440,390]) {
  const pg=await b.newPage({viewport:{width:w,height:900}}); const f=[]; pg.on('pageerror',e=>f.push(e.message));
  await pg.route('**/supabase.js*', r=>r.fulfill({contentType:'application/javascript',body:stub}));
  for (const p of ['**/jspdf*.js','**/pdf.min.js','**/xlsx*.js','**/jszip*.js']) await pg.route(p,r=>r.fulfill({contentType:'application/javascript',body:''}));
  await pg.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''})); await pg.route('https://fonts.gstatic.com/**',r=>r.abort());
  await pg.goto('file://'+path.join(D,app+'.html')); await pg.waitForTimeout(1500);
  const n = await pg.evaluate(()=>{ const nav=document.querySelector('#cacalc-app nav.tabs'); return nav ? [...nav.querySelectorAll('button')].map(b=>b.textContent.trim()) : null; });
  const geen = n && !n.some(t=>/Werfverslag|Verslagen/.test(t)) && n.length===2;
  console.log(app,w, JSON.stringify(n), geen?'OK':'FOUT', f.length?'pageerror '+f[0]:''); if(!geen||f.length) ok=false; await pg.close(); }
 await b.close(); process.exit(ok?0:1); })();
