/* ---------- manual item entry: missing-item flow, catalog picks, quick barcode edit ---------- */
function catalogSearch(t,max){
  if(!CAT||!CAT.length)return[];
  const w=nrm(t).split(/\s+/).filter(Boolean);if(!w.length)return[];
  const have=new Set(S.products.map(p=>nrm(p.name)));const out=[];
  for(const r of CAT){if(w.every(x=>r[7].includes(x))&&!have.has(nrm(r[0]))){out.push(r);if(out.length>=max)break}}
  return out;
}
function fromCatalog(r,onPick){
  itemForm({name:r[0],ar:r[1],generic:r[2],mfr:r[3],cls:r[4],price:r[6]||"",cost:"",minQty:5},onPick);
}
/* shown when a typed name or scanned barcode matches nothing */
function missingModal(text,onPick){
  if(!canDo("editItems")){toast("الصنف غير موجود. اطلب من المدير إضافته.");return}
  const isCode=/^[0-9]{6,}$/.test(text);
  openModal(`<h2>الصنف غير موجود</h2>
   <p>${isCode?"الباركود":"الاسم"} <b class="mono">${esc(text)}</b> غير مسجل في أصنافك.</p>
   <div class="grid"><button class="pri" id="mmNew" type="button">إنشاء صنف جديد ${isCode?"بهذا الباركود":"بهذا الاسم"}</button>
    ${isCode?`<button id="mmLink" type="button">ربطه بصنف موجود (تعديل باركوده)</button>`:""}</div>
   <div id="mmCat" style="margin-top:14px"></div>
   <div class="row" style="margin-top:12px"><button type="button" id="mmX">إلغاء</button></div>`);
  $("#mmX").onclick=closeModal;
  $("#mmNew").onclick=()=>itemForm(isCode?{barcode:text}:{name:text},onPick);
  if(isCode)$("#mmLink").onclick=()=>linkBarcode(text,onPick);
  else{
    const hits=catalogSearch(text,6);
    if(hits.length){
      $("#mmCat").innerHTML=`<div class="note">من الدليل الدوائي:</div>`+hits.map((r,i)=>`<button class="sm" style="display:block;width:100%;text-align:right;margin-top:4px" data-c="${i}" type="button">${esc(r[0])} · ${money(r[6])} ${CUR}</button>`).join("");
      $$("[data-c]").forEach(b=>b.onclick=()=>fromCatalog(hits[+b.dataset.c],onPick));
    }
  }
}
function linkBarcode(code,onPick){
  openModal(`<h2>ربط الباركود بصنف موجود</h2><p>الباركود <b class="mono">${esc(code)}</b> سيُسجَّل للصنف الذي تختاره، ويحل محل باركوده الحالي.</p>
   <label>ابحث عن الصنف<input id="lkQ" autocomplete="off"></label><div id="lkRes" style="margin-top:10px"></div>
   <div class="row" style="margin-top:12px"><button type="button" id="lkX">إلغاء</button></div>`);
  const draw=()=>{const q=$("#lkQ").value,r=searchProds(q,8);
    $("#lkRes").innerHTML=r.length?r.map(p=>`<div class="row" style="justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding:6px 0"><span>${esc(p.name)}<div class="note mono">${esc(p.barcode)}</div></span><button class="sm pri" data-l="${p.id}" type="button">ربط</button></div>`).join(""):(q?`<div class="note">لا توجد نتائج</div>`:"")};
  $("#lkQ").oninput=draw;$("#lkX").onclick=closeModal;$("#lkQ").focus();
  $("#lkRes").onclick=async e=>{
    const b=e.target.closest("[data-l]");if(!b)return;const p=S.products.find(x=>x.id===b.dataset.l);if(!p)return;
    const{id,...o}=p;await store.save("products",id,{...o,barcode:code});closeModal();toast("تم ربط الباركود بـ "+p.name);if(onPick)onPick({...p,barcode:code});
  };
}
/* quick barcode change for an existing item: type, scan with the camera, or generate an internal one */
function barcodeForm(p,after){
  openModal(`<h2>تعديل الباركود</h2><p>${esc(p.name)}</p>
   <form id="fBc" class="grid"><label>الباركود<input id="bcVal" class="mono" required value="${esc(p.barcode)}"></label>
    <div class="row"><button type="button" id="bcGen">توليد باركود داخلي</button></div>
    <p id="bcErr" class="lgerr"></p>
    <div class="row"><button class="pri" type="submit">حفظ</button><button type="button" id="bcX">إلغاء</button></div></form>`);
  attachScan($("#bcVal"),c=>{$("#bcVal").value=c});
  $("#bcGen").onclick=()=>{$("#bcVal").value=newBarcode()};$("#bcX").onclick=closeModal;
  $("#bcVal").focus();$("#bcVal").select();
  $("#fBc").onsubmit=async e=>{
    e.preventDefault();const v=$("#bcVal").value.trim();if(!v)return;
    const dup=S.products.find(x=>x.id!==p.id&&x.barcode===v);
    if(dup){$("#bcErr").textContent="هذا الباركود مستخدم للصنف: "+dup.name;return}
    const cur=S.products.find(x=>x.id===p.id)||p;const{id,...o}=cur;
    audit("تعديل باركود",p.name+": "+(cur.barcode||"-")+" ← "+v);await store.save("products",p.id,{...o,barcode:v});closeModal();toast("تم تحديث الباركود");
    if(after)after({...cur,barcode:v,id:p.id});
  };
}
