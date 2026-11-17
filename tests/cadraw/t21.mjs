import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const errs=[];
for(const f of ['index.html','cadraw.html','cados.html']){
const p = await b.newPage({viewport:{width:1300,height:900}});
p.on('pageerror',e=>errs.push(f+' PAGEERR '+e.message));
await p.route(/^https?:\/\/(?!localhost)/,r=>{const u=r.request().url();
 if(/supabase/.test(u))return r.fulfill({contentType:'text/javascript',body:`window.supabase={createClient(){const q=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?(ok)=>ok({data:[],error:null}):q,apply:()=>q()});return{auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getUser:async()=>({data:{user:null}})},from:()=>q(),channel:()=>q(),storage:{from:()=>q()},rpc:()=>q(),removeChannel(){}}}}`});
 return r.fulfill({body:'',contentType:'text/javascript'})});
await p.goto('http://localhost:8766/'+f);await p.waitForTimeout(2000);
console.log(f,'title',await p.title(),'| CaSuiteCadraw',await p.evaluate(()=>!!window.CaSuiteCadraw),'| nav btn',await p.evaluate(()=>!!document.getElementById('main-nav-btn-cadraw')));
await p.close()}
console.log(errs.join('\n')||'no errors');await b.close();
