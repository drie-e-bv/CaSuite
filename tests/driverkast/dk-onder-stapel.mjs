// Vereist een testkopie van index.html met 'window.__cdEval = (c)=> eval(c);' vóór 'function vlAantal(item){', geserveerd op poort 8790, en stub3.js in de cwd.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1500,height:1800}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({path:'stub3.js',contentType:'text/javascript'});
 return r.fulfill({body:'',contentType:'text/javascript'})});
const E=(c)=> p.evaluate((c)=> window.__cdEval(c), c);
const ok=(c,m)=>console.log((c?'OK  ':'FOUT')+' '+m);
await p.goto('http://localhost:8790/index.html');await p.waitForTimeout(2500);
await p.click('#main-nav-btn-cados');await p.waitForTimeout(600);
const r = await E(`(()=>{
  state.modules.driverkast = true;
  const dk = state.driverkast.kasten[0] || (state.driverkast.kasten.push({id:'dk1', items:[]}), state.driverkast.kasten[0]);
  dk.items = [];
  for(let i=0;i<10;i++){ const d = newDriverItem(); d.naam='TCI mini jolly dali 500'; d.type='Spots 350mA 15W'; d.armaturen=[{id:cryptoId(), naam:'Prado', aantal:3, ruimte:'Slaapkamer '+(i%3+1)}]; dk.items.push(d); }
  for(let i=0;i<2;i++){ const d = newDriverItem(); d.naam='Mean Well PWM-60-24DA'; d.type='Ledstrip 24Vdc'; d.armaturen=[{id:cryptoId(), naam:'LEDSTRIP 10m', aantal:1, ruimte:'Garage'}]; dk.items.push(d); }
  save(); selectTab('driverplan'); return dk.items.length; })()`);
await p.waitForTimeout(1200);
const info = await E(`(()=>{ const v = dkFysiekeKasten()[0]; const p = dkVulIndeling(v); const ids = v.items.slice(-2).map(d=>d.id); p.onderaan = ids; p.onderStapel = false; p.kolommen = p.kolommen.map(c=> c.filter(id=> !ids.includes(id))); save(); selectTab('driverplan'); return JSON.stringify({kol: p.kolommen.map(c=>c.length), H: p.hoogte, B: p.breedte}); })()`);
console.log('indeling', info);
await p.waitForTimeout(1000);
// automatisch omzetten
console.log('omzet', await E(`(()=>{ try{ currentProjectId = currentProjectId || 'test'; }catch(e){} const v = dkFysiekeKasten()[0]; const r = dkOmzet(v.plan); save(); selectTab('driverplan'); return JSON.stringify({n:(v.plan.bedrading||[]).length, r: typeof r, vis: !!document.querySelector('#panel-driverplan') && document.querySelector('#panel-driverplan').offsetParent!==null}); })()`)); await p.waitForTimeout(1500);
const teken = async (f)=>{ const svg = await E(`(()=>{ const v = dkFysiekeKasten()[0]; const kast = dkPlanKast(v); const g = uvGeometrie(kast);
  const rs = (g._router||uvRoutes)(kast, g).filter(Boolean);
  let o = '<svg xmlns="http://www.w3.org/2000/svg" width="'+(g.W||1200)+'" height="'+(g.H||1800)+'" style="background:#fff">';
  g.kokers.forEach(k=> o += '<rect x="'+k.x0+'" y="'+k.y0+'" width="'+(k.x1-k.x0)+'" height="'+(k.y1-k.y0)+'" fill="#ddd" stroke="#999"/>');
  g.mods.forEach(m=> o += '<rect x="'+m.x+'" y="'+m.y+'" width="'+m.w+'" height="'+m.h+'" fill="'+(m.m._dk&&m.m._dk.onderaan?'#fde':'#eef')+'" stroke="#336"/>');
  rs.forEach(r=> o += '<path d="'+r.d+'" fill="none" stroke="'+(r.A.m._dk&&r.A.m._dk.onderaan||r.B.m._dk&&r.B.m._dk.onderaan?'red':'#3a3')+'" stroke-width="1"/>');
  return o + '</svg>'; })()`);
  const p2 = await b.newPage({viewport:{width:1200,height:1700}}); await p2.setContent(svg); await p2.screenshot({path:f, fullPage:true}); await p2.close(); };
const geo = async ()=> E(`(()=>{ const v = dkFysiekeKasten()[0]; const kast = dkPlanKast(v); const g = kast._layout;
  const on = g.mods.filter(m=>m.m._dk && m.m._dk.onderaan).map(m=>({x:Math.round(m.x),y:Math.round(m.y),w:Math.round(m.w),h:Math.round(m.h)}));
  return JSON.stringify({hoogteNodig: Math.round(g.hoogteNodig), breedte: Math.round(g.breedteNodig), onder: on, kokers: g.kokers.filter(k=>k.soort==='v').map(k=>k.id+':'+Math.round(k.y0)+'-'+Math.round(k.y1)+(k.ingekort?'*':'')), draden: (v.plan.bedrading||[]).length}); })()`);
console.log('naast', await geo());
const el = await p.$('#panel-driverplan svg, .uv-svg, svg.uv'); 
await teken('/tmp/dk_naast.png');
await E(`(()=>{ const v = dkFysiekeKasten()[0]; v.plan.onderStapel = true; save(); selectTab('driverplan'); return 1; })()`); await p.waitForTimeout(1200);
console.log('stapel', await geo());
await teken('/tmp/dk_stapel.png');
ok(errs.length===0, 'geen JS-fouten '+errs.join(' | '));
await b.close();
