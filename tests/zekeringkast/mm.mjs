import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 if(/pdf\.worker/.test(u))return r.fulfill({path:'pdf.worker.min.js',contentType:'text/javascript'});
 if(/pdf\.min\.js/.test(u))return r.fulfill({path:'pdf.min.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(500);
for(const f of ['85b92a3f-Offerte_2600130_v1_0002.pdf','a508e6fe-Offerte_2600124_v7_0006.pdf','eac07842-Offerte_2600139_v1_0002.pdf']){
 const b64=fs.readFileSync(f).toString('base64');
 console.log(f.slice(0,8), await p.evaluate(async b64=>{ if(!window.pdfjsLib){await new Promise(r=>{const s=document.createElement('script');s.src='https://x/pdf.min.js';s.onload=r;document.head.appendChild(s);});}
   const off=await CaDosApp.offerte.lees(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer); const V=CaDosApp.offerte.voorstel(off);
   return V.zk.stop.filter(s=>s.media).map(s=>s.kamer+':'+s.muur+'+'+s.vloer+'+mm'+s.media).join(', ')},b64));
}
console.log(errs.join('\n')||'no errors');await b.close();
