import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
async function run(vp, naam){
const p=await b.newPage({viewport:vp, isMobile: vp.width<720, hasTouch: vp.width<720});const errs=[];
p.on('pageerror',e=>errs.push('PAGEERR '+e.message));p.on('dialog',d=>d.accept());
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(500);
await p.evaluate(()=>{const s=document.getElementById('global-project-select');const o=[...s.options].find(o=>/Leeg project/.test(o.textContent));s.value=o.value;s.dispatchEvent(new Event('change'));});
await p.waitForTimeout(1200);
if(await p.isVisible('#cados-aanmaken-btn')){ await p.click('#cados-aanmaken-btn'); await p.waitForTimeout(1500); }
const groepen=await p.$$eval('#tabgroups button',bs=>bs.map(b=>b.dataset.grp+(b.classList.contains('active')?'*':'')));
console.log(naam,'groepen:',groepen.join(' | '));
const tabs=async()=>p.$$eval('#tabbar button',bs=>bs.map(b=>b.textContent+(b.classList.contains('active')?'*':'')).join(', '));
if(vp.width>=720){
  console.log(naam,'Elektro tabs:',await tabs());

  await p.click('#tabbar button[data-id="driverkast"]'); await p.waitForTimeout(300);
  await p.click('#tabgroups button[data-grp="Domotica"]'); await p.waitForTimeout(300);
  console.log(naam,'Domotica tabs:',await tabs());
  await p.click('#tabbar button[data-id="ets-voorbereiding"]'); await p.waitForTimeout(300);
  await p.click('#tabgroups button[data-grp="Elektro"]'); await p.waitForTimeout(300);
  console.log(naam,'terug Elektro (verwacht Driverkast), actief:',await p.$eval('#tabbar button.active',b=>b.textContent));
  await p.click('#tabgroups button[data-grp="Domotica"]'); await p.waitForTimeout(300);
  console.log(naam,'terug Domotica, actief:',await p.$eval('#tabbar button.active',b=>b.textContent));
  await p.screenshot({path:'/tmp/b2-pc.png',clip:{x:0,y:0,width:1300,height:330}});
}else{
  console.log(naam,'A9 onderbalk apps:', await p.$$eval('#main-nav button',bs=>bs.filter(b=>b.offsetParent).map(b=>b.textContent.trim()).join(' | ')));
  console.log(naam,'tabbar zichtbaar:',await p.isVisible('#tabbar'),'| chip:',await p.$eval('#tabhuidig',b=>b.innerText));
  await p.tap('#tabgroups button[data-grp="Beveiliging"]'); await p.waitForTimeout(300);
  console.log(naam,'lijst open:',await p.isVisible('#tabbar'),'|',await tabs());
  await p.screenshot({path:'/tmp/b2-gsm-lijst.png'});
  await p.tap('#tabbar button[data-id="alarm"]'); await p.waitForTimeout(400);
  console.log(naam,'na keuze: lijst',await p.isVisible('#tabbar'),'| chip:',await p.$eval('#tabhuidig',b=>b.innerText));
  await p.screenshot({path:'/tmp/b2-gsm.png'});
}
console.log(naam, errs.join('\n')||'no errors'); await p.close();}
await run({width:1300,height:900},'PC'); await run({width:390,height:844},'GSM'); await b.close();
