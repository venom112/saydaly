/* ---------- core: helpers, storage, stock logic ---------- */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=v=>{const n=parseFloat(String(v).replace(/,/g,""));return isFinite(n)?n:0};
const money=v=>num(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const CUR="ج.م";
const lnow=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString();
const today=()=>lnow(new Date()).slice(0,10);
const ym=d=>lnow(d).slice(0,7);
const lsGet=k=>{try{return localStorage.getItem(k)==="1"}catch(e){return false}};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const fmtDate=ts=>{const d=new Date(ts);return d.toLocaleDateString("en-GB")+" "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})};

const DEF_SET={name:"صيدلية",address:"",phone:"",tax:"",vatRate:0,expMonths:3};
const S={products:[],sales:[],purchases:[],counts:[],parties:[],ledger:[],users:[],sreturns:[],preturns:[],writeoffs:[],expenses:[],shifts:[],audit:[],settings:{...DEF_SET},ready:false};
const COLLS=["products","sales","purchases","counts","parties","ledger","sreturns","preturns","writeoffs","expenses","shifts","audit","meta"];
let downloads=null,store=null;

function toast(msg){const t=$("#toastMsg");t.textContent=msg;t.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("on"),2200)}
function openModal(html,wide){const m=$("#modal");$("#sheet").className="sheet"+(wide?" wide":"");$("#sheet").innerHTML=html;m.hidden=false}
function closeModal(){$("#modal").hidden=true;$("#sheet").innerHTML="";if(S.ready&&me)setTimeout(render,0)}
$("#modal").addEventListener("mousedown",e=>{if(e.target.id==="modal")closeModal()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#modal").hidden)closeModal()});


/* ---------- stock logic ---------- */
const qtyOf=p=>(p.batches||[]).reduce((a,b)=>a+num(b.qty),0);
const expiredBatch=b=>b.exp&&b.exp<ym(new Date());
const sellable=p=>(p.batches||[]).filter(b=>num(b.qty)>0&&!expiredBatch(b)).reduce((a,b)=>a+num(b.qty),0);
/* pack units: stock is kept in the top unit (box) as a decimal; a strip/piece is a fraction of a box */
const f0=p=>{const u=p&&p.units;return u&&u.length>1?Math.max(...u.map(x=>num(x.f)||1)):1};
const unitsOf=p=>p&&p.units&&p.units.length>1?p.units:[{n:"علبة",f:1}];
const unitR=(p,i)=>{const u=unitsOf(p)[i]||unitsOf(p)[0];return(num(u.f)||1)/f0(p)};
const rnd=(p,q)=>{const F=f0(p);return Math.round(q*F)/F};
const hasPk=p=>f0(p)>1;
function fq(p,q){
  if(!hasPk(p))return String(+(+q).toFixed(2));
  let t=Math.round(q*f0(p)),parts=[];
  for(const u of unitsOf(p)){const f=num(u.f)||1,k=Math.floor(t/f);t-=k*f;if(k)parts.push(k+" "+u.n)}
  return parts.join(" و ")||"0";
}
function makeUnits(S,P,small){
  S=Math.floor(num(S));P=Math.floor(num(P));small=small||"قرص";
  if(S>=2&&P>=2)return[{n:"علبة",f:S*P},{n:"شريط",f:P},{n:small,f:1}];
  if(S>=2)return[{n:"علبة",f:S},{n:"شريط",f:1}];
  if(P>=2)return[{n:"علبة",f:P},{n:small,f:1}];
  return null;
}
/* batches a sale line took from (bt) so returns/voids go back to the same batch and expiry */
const btOf=takes=>(takes||[]).map(t=>({no:t.no,exp:t.exp,q:+(+t.qty).toFixed(6),c:num(t.cost)}));
function allocBt(lines,skip,need){ // lines: sale items of one product; skip/need in box units
  const out=[];let sk=skip,nd=need;
  for(const l of lines)for(const t of(l.bt||[])){
    let q=num(t.q);if(sk>1e-9){const d=Math.min(sk,q);sk-=d;q-=d}
    if(q<=1e-9||nd<=1e-9)continue;const u=Math.min(q,nd);nd-=u;out.push({no:t.no,exp:t.exp,q:u,c:t.c});
  }
  return{list:out,rest:nd>1e-6?nd:0};
}
async function putBack(pid,list,rest,tag){
  const p=S.products.find(x=>x.id===pid);if(!p)return;
  const{id,...o}=p;const b=(p.batches||[]).map(z=>({...z}));
  for(const t of list){const h=b.find(z=>(z.no||"")===(t.no||"")&&(z.exp||"")===(t.exp||""));
    if(h)h.qty=+(num(h.qty)+t.q).toFixed(6);else b.push({no:t.no,exp:t.exp,qty:+t.q.toFixed(6),cost:t.c||num(p.cost)})}
  if(rest>1e-6){const h=b.find(z=>z.no===tag&&!z.exp);if(h)h.qty=+(num(h.qty)+rest).toFixed(6);else b.push({no:tag,exp:"",qty:+rest.toFixed(6),cost:num(p.cost)})}
  await store.save("products",pid,{...o,batches:b});
}
function nearestExp(p){const l=(p.batches||[]).filter(b=>num(b.qty)>0&&b.exp).map(b=>b.exp).sort();return l[0]||""}
function expStatus(e){
  if(!e)return null;const now=ym(new Date());if(e<now)return"expired";
  const d=new Date();d.setMonth(d.getMonth()+(num(S.settings.expMonths)||3));return e<=ym(d)?"soon":"ok";
}
/* take qty from batches, earliest expiry first, skipping expired ones */
function deduct(batches,qty){
  const bs=(batches||[]).map(b=>({...b}));
  const order=bs.filter(b=>num(b.qty)>0&&!expiredBatch(b)).sort((a,b)=>(a.exp||"9999").localeCompare(b.exp||"9999"));
  let left=qty;const taken=[];
  for(const b of order){if(left<=1e-9)break;const t=Math.min(num(b.qty),left);b.qty=+(num(b.qty)-t).toFixed(6);left-=t;taken.push({no:b.no||"",exp:b.exp||"",qty:t,cost:num(b.cost)})}
  return{batches:bs.filter(b=>num(b.qty)>1e-6),short:left>1e-6?left:0,taken};
}
function deductAny(batches,qty){ // used by stocktake: expired batches count too
  const bs=(batches||[]).map(b=>({...b})).sort((a,b)=>(a.exp||"9999").localeCompare(b.exp||"9999"));
  let left=qty;for(const b of bs){if(left<=1e-9)break;const t=Math.min(num(b.qty),left);b.qty=+(num(b.qty)-t).toFixed(6);left-=t}
  return bs.filter(b=>num(b.qty)>1e-6);
}
function newBarcode(){
  let c;do{c="2"+Date.now().toString().slice(-8)+Math.floor(Math.random()*90+10)}while(S.products.some(p=>p.barcode===c));return c;
}
const findProd=t=>{t=String(t||"").trim();if(!t)return null;const z=s=>/^\d+$/.test(s)?s.replace(/^0+/,""):s;return S.products.find(p=>p.barcode===t)||S.products.find(p=>z(p.barcode)===z(t))||null};
function searchProds(t,max=8){
  t=String(t||"").trim().toLowerCase();if(!t)return[];
  return S.products.filter(p=>p.barcode===t||(p.name||"").toLowerCase().includes(t)||(p.generic||"").toLowerCase().includes(t)||(p.barcode||"").includes(t)).slice(0,max);
}
function suggest(input,onPick,pool,ex){
  const wrap=input.parentElement;wrap.classList.add("sugg");let ul=document.createElement("ul");ul.hidden=true;wrap.appendChild(ul);let idx=-1,list=[];
  const canNew=()=>!!(ex&&ex.create&&canDo("editItems"));
  const draw=()=>{ul.innerHTML=list.map((p,i)=>p._cat
    ?`<li data-i="${i}" class="${i===idx?"on":""}"><span>${esc(p._cat[0])}</span><span class="note">من الدليل · غير مسجل</span></li>`
    :`<li data-i="${i}" class="${i===idx?"on":""}"><span>${esc(p.name)}</span><span class="note mono">${esc(p.barcode)} · ${qtyOf(p)}</span></li>`).join("");ul.hidden=!list.length};
  const choose=p=>{input.value="";list=[];draw();if(p._cat)fromCatalog(p._cat,onPick);else onPick(p)};
  const missing=t=>{t=String(t||"").trim();if(!t)return;if(canNew())missingModal(t,onPick);else toast("لم يتم العثور على الصنف")};
  input.addEventListener("input",()=>{
    list=pool?pool(input.value):searchProds(input.value);
    if(canNew()){if(!CAT)loadCat();list=list.concat(catalogSearch(input.value,Math.max(0,8-list.length)).map(r=>({_cat:r})))}
    idx=-1;draw()});
  input.addEventListener("keydown",e=>{
    if(e.key==="ArrowDown"){idx=Math.min(idx+1,list.length-1);draw();e.preventDefault()}
    else if(e.key==="ArrowUp"){idx=Math.max(idx-1,0);draw();e.preventDefault()}
    else if(e.key==="Enter"){e.preventDefault();const exact=findProd(input.value);
      const p=exact||(idx>=0?list[idx]:list.length===1?list[0]:null);if(p)choose(p);else missing(input.value)}
    else if(e.key==="Escape"){ul.hidden=true}
  });
  ul.addEventListener("mousedown",e=>{const li=e.target.closest("li");if(!li)return;choose(list[+li.dataset.i])});
  input.addEventListener("blur",()=>setTimeout(()=>{ul.hidden=true},150));
  attachScan(input,code=>{const p=findProd(code);if(p)choose(p);else{input.value="";list=[];draw();if(canNew())missingModal(code,onPick);else toast("الباركود "+code+" غير مسجل في الأصناف")}});
}
/* ---------- file output: CSV/JSON download, printable HTML opens in a new tab and prints ---------- */
function browserDownloads(){
  return{save:async({filename,data})=>{
    const html=/\.html?$/i.test(filename);
    const blob=new Blob([data],{type:html?"text/html;charset=utf-8":"application/octet-stream"}),url=URL.createObjectURL(blob);
    if(html){
      const w=window.open(url,"_blank");
      if(w){w.addEventListener("load",()=>setTimeout(()=>{try{w.focus();w.print()}catch(e){}},500));setTimeout(()=>URL.revokeObjectURL(url),120000);return{status:"saved"}}
    }
    const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    return{status:"saved"};
  }};
}
downloads=browserDownloads();
async function saveFile(filename,data){
  if(!downloads){toast("حفظ الملفات غير متاح في هذا العرض");return}
  try{const r=await downloads.save({filename,data});if(r.status==="saved")toast("تم حفظ الملف")}
  catch(e){if(e&&e.code!=="declined")toast("تعذر حفظ الملف")}
}
function printDoc(title,css,body){
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
}
