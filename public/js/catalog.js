/* ---------- drug catalog: import a public CSV/JSON once, then search and add items ---------- */
const nrm=s=>String(s||"").toLowerCase().replace(/[ً-ٰٟـ]/g,"").replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه");
let CAT=null,catMeta=null,catLoading=false,catQ="",catShow=60,catUpdate=false,catPending=null;
const CAT_SRC="https://github.com/karem505/egyptian-drug-database";
const ALIAS={en:["commercial_name_en","name","trade_name","tradename","name_en"],ar:["commercial_name_ar","arabic","name_ar"],
  sci:["scientific_name","active","generic","composition"],mfr:["manufacturer","company"],cls:["drug_class","class","category"],route:["route"],price:["price_egp","price"]};

function parseCSV(t){
  if(t.charCodeAt(0)===0xFEFF)t=t.slice(1);
  const rows=[];let r=[],f="",q=false;
  for(let i=0;i<t.length;i++){const c=t[i];
    if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;
    else if(c===","){r.push(f);f=""}
    else if(c==="\n"||c==="\r"){if(c==="\r"&&t[i+1]==="\n")i++;r.push(f);f="";if(r.length>1||r[0]!=="")rows.push(r);r=[]}
    else f+=c}
  if(f!==""||r.length){r.push(f);rows.push(r)}
  return rows;
}
/* returns [en, ar, scientific, manufacturer, class, route, price] rows, or null if the columns are not recognised */
function parseCatalog(text,fname){
  let recs;
  if(/\.json$/i.test(fname)||text.trim()[0]==="["){
    const a=JSON.parse(text);if(!Array.isArray(a))return null;
    recs=a.map(o=>{const x={};for(const k in o)x[k.toLowerCase().trim()]=o[k];return x});
  }else{
    const rows=parseCSV(text);if(rows.length<2)return null;
    const h=rows[0].map(x=>x.toLowerCase().trim());
    recs=rows.slice(1).map(r=>{const x={};h.forEach((k,i)=>x[k]=r[i]);return x});
  }
  const first=recs[0]||{};const col={};
  for(const k in ALIAS)col[k]=ALIAS[k].find(a=>a in first);
  if(!col.en)return null;
  const out=[];
  for(const o of recs){
    const g=k=>col[k]?String(o[col[k]]??"").trim():"";
    const en=g("en");if(!en)continue;
    out.push([en,g("ar"),g("sci"),g("mfr"),g("cls"),g("route"),Math.round(num(g("price").replace(/[^\d.]/g,""))*100)/100]);
  }
  return out;
}
async function loadCat(){
  if(CAT||catLoading)return;catLoading=true;
  try{
    const docs=[];
    for(let i=0;i<2000;i+=8){
      const ids=[...Array(8)].map((_,k)=>"c"+String(i+k).padStart(3,"0"));
      const got=await Promise.all(ids.map(id=>store.getDoc("catalog",id)));let stop=false;
      got.forEach((d,k)=>{if(d)docs.push({id:ids[k],data:d});else stop=true});
      if(stop)break;
    }
    const rows=[];catMeta=null;
    docs.forEach(d=>{(d.data.rows||[]).forEach(r=>rows.push(r));if(d.id==="c000")catMeta={count:d.data.count,at:d.data.at,source:d.data.source}});
    CAT=rows.map(r=>[...r,nrm(r[0]+" "+r[1]+" "+r[2]+" "+r[3])]);
  }catch(e){CAT=[]}
  catLoading=false;if(curTab()==="catalog")render();
}
V.catalog=()=>{
  if(!CAT){$("#view").innerHTML=`<div class="card empty">جاري تحميل الدليل…</div>`;loadCat();return}
  if(!CAT.length){$("#view").innerHTML=`<div class="card empty">ملفات الدليل الدوائي غير موجودة في الموقع (public/catalog).</div>`;return}
  const at=catMeta&&catMeta.at?new Date(catMeta.at).toLocaleDateString("en-GB"):"-";
  $("#view").innerHTML=`<div class="kpis"><div class="kpi"><span>عدد الأدوية في الدليل</span><b>${CAT.length.toLocaleString("en-US")}</b></div>
   <div class="kpi"><span>تاريخ الاستيراد</span><b style="font-size:20px">${at}</b><small>${esc(catMeta?.source||"")}</small></div></div>
  <div class="tbar sec"><label class="f2" style="max-width:520px">بحث بالاسم التجاري أو المادة الفعالة أو الشركة (عربي أو إنجليزي)<input id="cq" value="${esc(catQ)}" autocomplete="off" placeholder="مثال: panadol أو باراسيتامول"></label>
   </div>
  <div id="cRes"></div>
  <p class="note">البيانات من قاعدة مفتوحة تجمّعها المجتمع من سجلات الأدوية المصرية، وليست نسخة رسمية من هيئة الدواء. الأسماء العربية قد تكون نقلا صوتيا، والأسعار تتغير باستمرار. راجع <a href="https://www.edaegypt.gov.eg" target="_blank" rel="noopener" style="color:var(--accent)">هيئة الدواء المصرية</a> وسعّر أصنافك من فواتير الشراء الفعلية.</p>`;
  const draw=()=>{
    const w=nrm(catQ).split(/\s+/).filter(Boolean);
    if(!w.length){$("#cRes").innerHTML=`<div class="card empty">اكتب جزءا من اسم الدواء للبحث في ${CAT.length.toLocaleString("en-US")} دواء</div>`;return}
    const res=CAT.filter(r=>w.every(x=>r[7].includes(x)));const have=new Set(S.products.map(p=>nrm(p.name)));
    $("#cRes").innerHTML=res.length?`<div class="note" style="margin-bottom:6px">${res.length.toLocaleString("en-US")} نتيجة</div><div class="tw"><table><tr><th>الدواء</th><th>المادة الفعالة</th><th>الشركة</th><th>الفئة</th><th class="n">السعر العام</th><th></th></tr>
     ${res.slice(0,catShow).map(r=>{const i=CAT.indexOf(r);return`<tr><td class="wrap"><b>${esc(r[0])}</b>${r[1]?`<div class="note">${esc(r[1])}</div>`:""}</td><td class="wrap">${esc(r[2]||"-")}</td><td>${esc(r[3]||"-")}</td><td class="wrap">${esc(r[4]||"-")}</td><td class="n">${money(r[6])}</td>
      <td>${have.has(nrm(r[0]))?`<span class="pill p-ok">في مخزونك</span>`:`<button class="sm pri" data-a="${i}" ${canDo("editItems")?"":"hidden"} type="button">إضافة للأصناف</button>`}</td></tr>`}).join("")}</table></div>
     ${res.length>catShow?`<p><button id="cMore" type="button">عرض المزيد</button></p>`:""}`:`<div class="card empty">لا توجد نتائج</div>`;
    $$("[data-a]").forEach(b=>b.onclick=()=>{const r=CAT[+b.dataset.a];
      itemForm({name:r[0],ar:r[1],generic:r[2],mfr:r[3],cls:r[4],price:r[6]||"",cost:"",minQty:5})});
    const m=$("#cMore");if(m)m.onclick=()=>{catShow+=60;draw()};
  };
  let t;$("#cq").oninput=e=>{catQ=e.target.value;catShow=60;clearTimeout(t);t=setTimeout(draw,120)};
  draw();
};
