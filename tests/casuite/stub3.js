(function(){
 const DB=window.__DB={projecten:[{id:'p1',naam:'Testvilla',projectnummer:'25-001',klant:'Fam. Test',locatie:'Knokke',actief:true},{id:'p2',naam:'Leeg project',actief:true}],
  project_cadraw_data:[],elektro_catalogus_armaturen:[{id:1,naam:'Jullight Jules',wattage:6.2,info:'350mA'},{id:2,naam:'Jullight Star',wattage:12.5,info:'350mA'},{id:3,naam:'Jullight Star mini',wattage:6.2,info:'350mA'},{id:4,naam:'LEDSTRIP 9w',wattage:9,info:'24vdc'}],elektro_catalogus_drivers:[{id:1,naam:'Meanwel PWM-60-12DA',min:0,max:60,info:'12VDC',sturing:'DALI'},{id:2,naam:'TCI mini jolly dali 500',min:1,max:15,info:'500mA',sturing:'DALI'},{id:3,naam:'TCI mini jolly 350',min:1,max:15,info:'350mA',sturing:'PUSH'}],elektro_cados_instellingen:[],project_plannen:[],dossier_backups:[],project_cacalc_data:[{id:1,project_id:'p1',data:{boards:[{naam:'Zekeringkast 1',differentielen:[],eindgroepen:[{naam:'Oven',In:32,curve:'C-curve',polen:'2P',icu:6,mantel:'XGB',sectie:6,lengte:18}]}]}}],
  project_elektro_dossiers:[{id:7,project_id:'p1',updated_at:'2026-11-01T10:00:00+00:00',data:{instellingen:{project:'Testvilla',spanning:'Mono'},kamers:['Keuken'],verdiepingen:[{code:'G',label:'Gelijkvloers'}],
   driverkast:{kasten:[{items:[{id:'dr1',naam:'Driver keuken',zekeringModuleId:'a1'}]}]},laadpalen:{items:[{id:'lp1',zekeringModuleId:'a2'}]},
   zekeringen:{kasten:[{id:'kA',naam:'Zekeringkast 1',maat:24,kamgeleiders:[{id:'kam1',rijId:'r1',moduleIds:['d1','a1','a2'],auto:true}],bedrading:[{id:'w1',a:{m:'a1',k:'t0'},b:{m:'x',k:'k'}},{id:'w2',a:{m:'a2',k:'t0'},b:{m:'x',k:'k'}}],rijen:[{id:'r1',items:[
    {id:'d1',categorie:'Differentieel',isHoofd:true,mA:'300mA',A:'63A',polen:'2P',breedte:2},
    {id:'a1',categorie:'Automaat',naam:'Oven',A:'20A',polen:'2P',breedte:2,kabelType:'',kabelOpKlemmen:false},
    {id:'a2',categorie:'Automaat',naam:'Kookplaat',A:'25A',polen:'2P',breedte:2,kabelType:'',kabelOpKlemmen:false},
    {id:'v1',categorie:'Voeding',naam:'KNX',breedte:3},
    {id:'a3',categorie:'Automaat',naam:'Losse automaat',A:'16A',polen:'2P',breedte:2,kabelType:''}]},
    {id:'r2',items:[{id:'d2',categorie:'Differentieel',isHoofd:false,mA:'30mA',A:'40A',polen:'2P',breedte:2},
    {id:'a4',categorie:'Automaat',naam:'Vaatwas',A:'20A',polen:'2P',breedte:2,kabelType:'3g2.5',kabelOpKlemmen:true},
    {id:'a5',categorie:'Automaat',naam:'Gelinkt aan hoofd',A:'20A',polen:'2P',breedte:2,kabelType:'',linkedDiffId:'d1'}]}]}]}}}]};
 function Q(t){this.t=t;this.f=[];this.op='select'}
 Q.prototype={in(){return this},neq(){return this},gte(){return this},lte(){return this},is(){return this},not(){return this},or(){return this},ilike(){return this},limit(){return this},range(){return this},single(){this._one=true;return this},delete(){this.op='delete';return this},select(){this.sel=true;return this},eq(k,v){this.f.push([k,v]);return this},order(){return this},
  maybeSingle(){this._one=true;return this},insert(r){this.op='insert';this.row=r;return this},update(r){this.op='update';this.row=r;return this},
  upsert(r,o){this.op='upsert';this.row=r;this.oc=o&&o.onConflict;return this},
  then(ok,no){const T=DB[this.t]||(DB[this.t]=[]);if(this.op==='delete'){return Promise.resolve({data:[],error:null}).then(ok,no)}let res;const m=r=>this.f.every(([k,v])=>r[k]===v);
   if(this.op==='select'){const rows=T.filter(m);res={data:this._one?(rows[0]||null):rows,error:null}}
   else if(this.op==='insert'){const r=Object.assign({id:String(T.length+100)},JSON.parse(JSON.stringify(this.row)));T.push(r);res={data:this._one?r:[r],error:null}}
   else if(this.op==='update'){const rows=T.filter(m);rows.forEach(r=>Object.assign(r,JSON.parse(JSON.stringify(this.row))));res={data:rows,error:null}}
   else{let r=T.find(x=>x[this.oc]===this.row[this.oc]);if(r)Object.assign(r,JSON.parse(JSON.stringify(this.row)));else{r=Object.assign({id:T.length+1},JSON.parse(JSON.stringify(this.row)));T.push(r)}res={data:[r],error:null}}
   return Promise.resolve(res).then(ok,no)}};
 const ch=()=>{const c={on(){return c},subscribe(){return c},unsubscribe(){}};return c};window.supabase={createClient(){return{auth:{getSession:async()=>({data:{session:{user:{id:'u1',email:'peter@casentis.be',user_metadata:{full_name:'Peter Test'}}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getUser:async()=>({data:{user:{id:'u1',email:'peter@casentis.be'}}})},from:t=>new Q(t),channel:ch,removeChannel(){},rpc:async()=>({data:null,error:null}),functions:{invoke:async()=>({data:null,error:null})},storage:{from:()=>({upload:async(p,f)=>{(window.__UPL=window.__UPL||{})[p]=f;return{data:{path:p},error:null}},getPublicUrl:(p)=>({data:{publicUrl:(window.__UPL&&window.__UPL[p])?URL.createObjectURL(window.__UPL[p]):''}}),createSignedUrl:async()=>({data:{signedUrl:''},error:null})})}}}};
})();
