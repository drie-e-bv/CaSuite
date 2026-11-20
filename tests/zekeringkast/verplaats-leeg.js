function uvZekVrij(kast, rij, zonderId){ return (kast.maat || 24) - rij.items.filter(x=> x.id !== zonderId && x.categorie !== "Leeg").reduce((t, x)=> t + (typeof moduleBreedte === "function" ? moduleBreedte(x) : (Number(x.breedte)||0)), 0); }
function uvZekMaakPlaats(kast, rij, m, index){
  const maat = kast.maat || 24, bw = x=> (typeof moduleBreedte === "function" ? moduleBreedte(x) : (Number(x.breedte)||0));
  let teVeel = rij.items.reduce((t, x)=> t + bw(x), 0) - maat;
  if(teVeel <= 0) return;
  // eerst de lege plaatsen het dichtst bij de nieuwe positie inkrimpen
  const pos = rij.items.indexOf(m);
  const leeg = rij.items.map((x, i)=> ({x, i})).filter(o=> o.x.categorie==="Leeg").sort((a, b)=> Math.abs(a.i - pos) - Math.abs(b.i - pos));
  for(const o of leeg){
    if(teVeel <= 0) break;
    const w = bw(o.x), af = Math.min(w, teVeel);
    if(af >= w) rij.items.splice(rij.items.indexOf(o.x), 1); else o.x.breedte = w - af;
    teVeel -= af;
  }
}

function moduleBreedte(x){return Number(x.breedte)||0}
const kast={maat:36,rijen:[{items:[{id:'a',categorie:'Automaat',breedte:4}]},{items:[{id:'l',categorie:'Leeg',breedte:30},{id:'d',categorie:'DALI',breedte:6}]}]};
const r2=kast.rijen[1], m=kast.rijen[0].items[0];
console.log('vrij',uvZekVrij(kast,r2,'a'));
kast.rijen[0].items.splice(0,1); r2.items.splice(1,0,m); uvZekMaakPlaats(kast,r2,m,1);
console.log(r2.items.map(x=>x.id+':'+x.breedte).join(','));
