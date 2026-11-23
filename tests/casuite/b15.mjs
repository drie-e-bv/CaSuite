import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1400,height:950}});const errs=[];
p.on('pageerror',e=>errs.push('PAGEERR '+e.message+' @ '+(e.stack||'').split('\n').slice(1,3).join(' ')));
p.on('dialog',d=>d.accept());
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 if(/pdf\.worker/.test(u))return r.fulfill({path:'pdf.worker.min.js',contentType:'text/javascript'});
 if(/pdf\.min\.js/.test(u))return r.fulfill({path:'pdf.min.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
const D=()=>p.evaluate(()=>__DB.project_elektro_dossiers.slice(-1)[0].data);
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(600);
const [fc]=await Promise.all([p.waitForEvent('filechooser'), p.selectOption('#global-project-select','__uit_offerte__')]);
await fc.setFiles('a508e6fe-Offerte_2600124_v7_0006.pdf');
await p.waitForSelector('#of-modal summary input',{timeout:30000});
await p.click('#of-modal #of-ok');await p.waitForTimeout(800);
if(await p.$('.dq-ok')) await p.click('.dq-ok');
await p.waitForSelector('#of-modal #of-undo',{timeout:20000});
await p.evaluate(()=>document.getElementById('of-modal').remove()); await p.waitForTimeout(500);
// ---- Zekeringkast: vergrendelen op 1 lege rij, dan verdelen -> melding, niets gewijzigd
await p.click('#tabbar button[data-id="zekeringen"]'); await p.waitForTimeout(600);
const rows0 = (await D()).zekeringen.kasten[0].rijen.length;
await p.check('.kast-vast'); await p.waitForTimeout(800);
console.log('ZK vergrendeld:', await p.$eval('.zk-vast',l=>l.textContent.trim()), '| maat-keuze uit:', await p.$eval('.kast-maat',s=>s.disabled), '| + Rij uit:', await p.$eval('#addRij',b=>b.disabled), '| + Rij hierna weg:', !(await p.$('.rij-invoegen')));
await p.click('.dv-stap[data-stap="zekeringkast"] .dv-actie'); await p.waitForSelector('#zkw-modal .zkw-stap');
for(let i=0;i<5;i++){ await p.click('#zkw-verder'); await p.waitForTimeout(300); }
console.log('ZK overzicht melding:', await p.$eval('#zkw-modal',m=>[...m.querySelectorAll('.zkw-fout')].map(x=>x.textContent).find(t=>/vergrendeld/.test(t))||'-').then(t=>t.slice(0,120)));
if(await p.$eval('#zkw-verder',x=>x.disabled)) await p.check('#zkw-negeer');
await p.click('#zkw-verder'); await p.waitForTimeout(1200);
console.log('ZK toepassen → melding:', !!(await p.$('#zkfmt-modal')), '|', await p.$eval('#zkfmt-modal p',x=>x.textContent.slice(0,110)).catch(()=>'-'));
await p.click('#zkfmt-modal .zkf-ok').catch(()=>{}); await p.evaluate(()=>document.querySelectorAll('#zkw-modal').forEach(m=>m.remove())); await p.waitForTimeout(1500);
const d1=await D(); console.log('ZK kast ongewijzigd: rijen', d1.zekeringen.kasten[0].rijen.length, '(was '+rows0+') modules', d1.zekeringen.kasten[0].rijen.reduce((t,r)=>t+r.items.length,0));
// ontgrendelen, normaal verdelen, opnieuw vergrendelen, netjes ordenen
await p.evaluate(()=>{ [...document.querySelectorAll('#tabbar button')].find(x=>x.dataset.id==='zekeringen').click(); }); await p.waitForTimeout(500);
await p.uncheck('.kast-vast'); await p.waitForTimeout(500);
await p.click('.dv-stap[data-stap="zekeringkast"] .dv-actie'); await p.waitForSelector('#zkw-modal .zkw-stap');
for(let i=0;i<5;i++){ await p.click('#zkw-verder'); await p.waitForTimeout(300); }
if(await p.$eval('#zkw-verder',x=>x.disabled)) await p.check('#zkw-negeer');
await p.click('#zkw-verder'); await p.waitForTimeout(1500); await p.click('#zkw-sluit'); await p.waitForTimeout(800);
await p.evaluate(()=>document.querySelectorAll('.modal-overlay').forEach(m=>m.remove()));
await p.check('.kast-vast'); await p.waitForTimeout(1200);
const voor=await D(); const k0=voor.zekeringen.kasten[0];
const sig=(k)=>JSON.stringify(k.rijen.flatMap(r=>r.items).filter(m=>m.categorie==='Automaat').map(m=>[m.id,m.linkedDiffId]).sort());
// rommel maken: een automaat met de hand naar het einde van de laatste rij met plaats
await p.click('#zkHerschik'); await p.waitForSelector('#zkg-modal .zkg-netjes');
await p.click('#zkg-modal .zkg-netjes'); await p.waitForTimeout(1500);
const na=await D(); const k1=na.zekeringen.kasten[0];
console.log('ZK netjes ordenen: rijen', k0.rijen.length,'→',k1.rijen.length, '| maat', k0.maat,'→',k1.maat, '| koppelingen gelijk', sig(k0)===sig(k1), '| aantal modules', k0.rijen.flatMap(r=>r.items).length,'→',k1.rijen.flatMap(r=>r.items).length);
const grpOk = k1.rijen.flatMap(r=>r.items).reduce((st,m)=>{ if(m.categorie==='Differentieel') st.cur=m.id; else if(m.categorie==='Automaat'&&m.linkedDiffId&&m.linkedDiffId!==st.cur) st.bad++; return st;},{cur:null,bad:0}).bad;
console.log('ZK elke automaat direct na zijn differentieel:', grpOk===0, '('+grpOk+' afwijkend)');
await p.click('#zkg-ok'); await p.waitForTimeout(500);
// ---- Driverkast
await p.click('#tabbar button[data-id="driverkast"]'); await p.waitForTimeout(600);
const nDrv = (await D()).driverkast.kasten.reduce((t,k)=>t+k.items.filter(x=>!x.leeg).length,0);
console.log('DK drivers:', nDrv, 'in', (await D()).driverkast.kasten.length, 'kast(en)');
await p.click('.zk-weergaven button[data-w="driverplan"]'); await p.waitForTimeout(2500);
const kolInfo=async()=>{ const d=await D(); const kast=d.driverkast.kasten[0]; const byId=Object.fromEntries(kast.items.map(x=>[x.id,x])); const kam=(x)=>((x.armaturen||[]).map(a=>a.ruimte).filter(Boolean)[0]||'~'); return {n:kast.plan.kolommen.length, txt: kast.plan.kolommen.map(c=>c.map(id=>kam(byId[id])).join(',')).join(' || '), plan:kast.plan}; };
await p.click('.dk-herschik'); await p.waitForSelector('#dkh-modal');
await p.check('#dkh-modal input[name="dkh-g"][value="kamer"]'); await p.check('#dkh-modal input[name="dkh-v"][value="kolom"]');
await p.click('#dkh-modal .dkh-ok'); await p.waitForTimeout(1500);
let ki=await kolInfo(); console.log('DK kamers samen, per kolom:', ki.n, 'kolommen |', ki.txt.slice(0,300));
await p.click('.dk-herschik'); await p.waitForSelector('#dkh-modal');
await p.check('#dkh-modal input[name="dkh-g"][value="model"]'); await p.check('#dkh-modal input[name="dkh-v"][value="slang"]');
await p.click('#dkh-modal .dkh-ok'); await p.waitForTimeout(1500);
ki=await kolInfo(); console.log('DK types samen, slang:', ki.n, 'kolommen');
// vergrendelen en dan per kolom op kamer: aantal kolommen moet gelijk blijven
await p.check('.dk-vast'); await p.waitForTimeout(1200);
const nVast=(await kolInfo()).n; console.log('DK vergrendeld:', await p.$eval('.dk-vast-l',l=>l.textContent.trim()), '| kast-keuze uit:', await p.$eval('.dk-kast',s=>s.disabled));
await p.click('.dk-herschik'); await p.waitForSelector('#dkh-modal');
await p.check('#dkh-modal input[name="dkh-g"][value="kamer"]'); await p.check('#dkh-modal input[name="dkh-v"][value="kolom"]');
await p.click('#dkh-modal .dkh-ok'); await p.waitForTimeout(1500);
ki=await kolInfo(); console.log('DK vergrendeld + kamers per kolom: kolommen', nVast,'→',ki.n, '| plaat', ki.plan.breedte+'x'+ki.plan.hoogte, '| melding:', await p.$eval('.uv-fout',x=>x.textContent.slice(0,90)).catch(()=>'(past)'));
console.log(errs.join('\n')||'no errors');await b.close();
