import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p = await b.newPage({viewport:{width:1400,height:950}});
await p.route('**/jspdf.umd.min.js',r=>r.fulfill({path:'/home/claude/edstest/node_modules/jspdf/dist/jspdf.umd.min.js',contentType:'text/javascript'}));
await p.goto('file:///home/claude/casuite/cadraw-bron.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(300);await p.click('[data-tab=plan]');
console.log(await p.$$eval('.plh',e=>e.map(x=>[x.textContent,x.getBoundingClientRect().height,getComputedStyle(x).color].join('|'))));
await b.close();
