import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p = await b.newPage({viewport:{width:1400,height:950}});
const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
await p.route('**/jspdf.umd.min.js',r=>r.fulfill({path:'/home/claude/edstest/node_modules/jspdf/dist/jspdf.umd.min.js',contentType:'text/javascript'}));
await p.goto('file:///home/claude/casuite/cadraw-bron.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(400);
await p.click('[data-tab=plan]');await p.waitForTimeout(150);
console.log('letters',await p.$$eval('.plk',e=>e.length),'| eerste',await p.$$eval('.plk',e=>e.slice(0,4).map(x=>x.textContent)));
const ca=await p.evaluate(()=>{const c=codes(S);return S.borden[0].groepen.flatMap(g=>g.kringen).find(k=>c.k[k.id]==='CA').id});
await p.click(`.plk[data-kid="${ca}"]`);await p.waitForTimeout(80);
console.log('componenten CA',await p.$$eval('.pc',e=>e.map(x=>x.innerText.replace(/\s+/g,' ').trim())));
const box=await (await p.$('#plan')).boundingBox();
for(let i=0;i<3;i++){await p.mouse.click(box.x+250+i*90,box.y+200);await p.waitForTimeout(80)}
console.log('na 3 klikken',await p.$$eval('.pc',e=>e.map(x=>(x.classList.contains('gepl')?'✓':x.classList.contains('on')?'>':'·')).join('')),'| geplaatst items',await p.evaluate(()=>S.plannen[0].items.length));
console.log('snap op grid',await p.evaluate(()=>S.plannen[0].items.slice(-3).map(i=>i.x+','+i.y).join(' ')));
// tekst
await p.click('[data-a=pwat][data-w=tekst]');const b2=await (await p.$('#plan')).boundingBox();await p.mouse.click(b2.x+600,b2.y+500);await p.waitForTimeout(80);await p.fill('#askv','Keuken');await p.click('#asko');await p.waitForTimeout(80);
console.log('teksten',await p.evaluate(()=>JSON.stringify(S.plannen[0].teksten)));
// geplaatst component aantikken -> selecteren
await p.click('.pc.gepl >> nth=0');await p.waitForTimeout(80);console.log('modus',await p.evaluate(()=>P.mode),'sel',!!(await p.$('[data-a=rot]')));
await p.click('[data-a=pck][data-k=grid]');console.log('grid uit',await p.evaluate(()=>P.grid));
await p.click('[data-a=pck][data-k=grid]');
await p.click('[data-a=pmode][data-m=teken]');await p.screenshot({path:'/home/claude/edstest/plan2.png'});
const n=await p.evaluate(()=>allPages(S,{plan:true}).length);console.log('pdf planpagina\'s',n);
await p.setViewportSize({width:400,height:820});await p.waitForTimeout(100);console.log('scrollW',await p.evaluate(()=>document.documentElement.scrollWidth));await p.screenshot({path:'/home/claude/edstest/plan-mob.png'});
console.log(errs.join('\n')||'no errors');await b.close();
