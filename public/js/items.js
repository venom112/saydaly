function itemForm(p,after){
  p=p||{};const isNew=!p.id;
  openModal(`<h2>${isNew?"صنف جديد":"تعديل صنف"}</h2>
  <form id="fItem" class="grid" style="margin-top:10px">
    <label>الاسم التجاري<input id="iName" required value="${esc(p.name)}"></label>
    <div class="row"><label class="f1">المادة الفعالة<input id="iGen" value="${esc(p.generic)}"></label>
      <label class="f1">الشكل / التركيز<input id="iForm" placeholder="أقراص 500 مجم" value="${esc(p.form)}"></label></div>
    <div class="row"><label class="f1">الباركود<input id="iBar" class="mono" value="${esc(p.barcode||newBarcode())}"></label>
      <label class="f1">مكان الرف<input id="iShelf" value="${esc(p.shelf)}"></label></div>
    <div class="row"><label class="f1">سعر البيع (${CUR})<input id="iPrice" type="number" step="0.01" min="0" required value="${p.price??""}"></label>
      <label class="f1">سعر الشراء (${CUR})<input id="iCost" type="number" step="0.01" min="0" value="${p.cost??""}"></label>
      <label class="f1">حد الطلب<input id="iMin" type="number" min="0" value="${p.minQty??5}"></label></div>
    <div class="row"><label class="f1">عدد الأشرطة في العلبة<input id="iPS" type="number" min="0" placeholder="مثال: 3" value="${p.packS||""}"></label>
      <label class="f1">عدد الأقراص/الوحدات في الشريط<input id="iPP" type="number" min="0" placeholder="مثال: 10" value="${p.packP||""}"></label>
      <label class="f1">اسم الوحدة الصغرى<select id="iPN">${["قرص","كبسولة","كيس","أمبولة","حقنة","وحدة"].map(x=>`<option ${x===(p.packN||"قرص")?"selected":""}>${x}</option>`).join("")}</select></label></div>
    <p class="note" style="margin:-4px 0 0">اترك أعداد التعبئة فارغة إن كان الصنف يُباع بالعلبة فقط. الأسعار أعلاه للعلبة، وتُحسب أسعار الشريط والقرص تلقائيا.</p>
    ${isNew?`<div class="row"><label class="f1">الكمية الحالية (بالعلبة) (اختياري)<input id="iQty" type="number" min="0" placeholder="0"></label>
      <label class="f1">رقم التشغيلة<input id="iBatch"></label><label class="f1">تاريخ الانتهاء<input id="iExp" type="month"></label></div>`:""}
    <div class="row" style="justify-content:space-between">
      <div class="row"><button class="pri" type="submit">حفظ</button><button type="button" id="cX">إلغاء</button></div>
      ${isNew?"":`<button type="button" class="dng" id="iDel">حذف الصنف</button>`}</div>
  </form>`);
  $("#cX").onclick=closeModal;
  attachScan($("#iBar"),c=>{$("#iBar").value=c;toast("تمت قراءة الباركود")});
  if(!isNew)$("#iDel").onclick=()=>{
    $("#iDel").outerHTML=`<span class="row"><span class="note">سيتم حذف الصنف وكميته.</span><button type="button" class="dng" id="iDel2">تأكيد الحذف</button></span>`;
    $("#iDel2").onclick=async()=>{await store.remove("products",p.id);audit("حذف صنف",p.name+" (كمية "+qtyOf(p)+")");closeModal();toast("تم حذف الصنف")};
  };
  $("#fItem").onsubmit=async e=>{
    e.preventDefault();const bar=$("#iBar").value.trim();
    if(S.products.some(x=>x.barcode===bar&&x.id!==p.id)){toast("هذا الباركود مستخدم لصنف آخر");return}
    const obj={name:$("#iName").value.trim(),generic:$("#iGen").value.trim(),form:$("#iForm").value.trim(),barcode:bar,shelf:$("#iShelf").value.trim(),
      price:num($("#iPrice").value),cost:num($("#iCost").value),minQty:num($("#iMin").value),mfr:p.mfr||"",ar:p.ar||"",cls:p.cls||"",batches:p.batches||[],createdAt:p.createdAt||Date.now(),
      packS:num($("#iPS").value)||"",packP:num($("#iPP").value)||"",packN:$("#iPN").value};
    const un=makeUnits(obj.packS,obj.packP,obj.packN);if(un)obj.units=un;
    if(isNew){const q=Math.floor(num($("#iQty").value));if(q>0)obj.batches=[{no:$("#iBatch").value.trim(),exp:$("#iExp").value,qty:q,cost:obj.cost}]}
    const pid=p.id||uid();await store.save("products",pid,obj);
    if(isNew)audit("إضافة صنف",obj.name+" · سعر "+money(obj.price));
    else{const ch=[];[["name","الاسم"],["price","سعر البيع"],["cost","سعر الشراء"],["barcode","الباركود"],["minQty","حد الطلب"],["packS","أشرطة/علبة"],["packP","وحدات/شريط"]].forEach(([k,l])=>{if(String(p[k]??"")!==String(obj[k]??""))ch.push(l+": "+(p[k]??"-")+" ← "+(obj[k]??"-"))});if(ch.length)audit("تعديل صنف",obj.name+" | "+ch.join(" · "))}
    closeModal();toast("تم حفظ الصنف");
    if(after)after({...obj,id:pid});
  };
}

V.items=()=>{
  const v=$("#view");
  v.innerHTML=`<div class="bar"><div><h2>الأصناف والمخزون</h2><p class="lead" style="margin:0">أضف الأصناف، وراجع الكميات وتواريخ الانتهاء.</p></div>
    <div class="row" ${canDo("editItems")?"":"hidden"}><button id="addCat" type="button">من الدليل الدوائي</button><button class="pri" id="addItem" type="button">+ صنف جديد</button></div></div>
    <div class="row" style="margin-bottom:12px"><label class="f2">بحث بالاسم أو الباركود<input id="iq" value="${esc(itemFilter)}" placeholder="اكتب أو امسح الباركود"></label>
      <label class="f1">ترتيب<select id="isort"><option value="name">الاسم</option><option value="qty">الأقل كمية</option><option value="exp">الأقرب انتهاء</option></select></label></div>
    <div id="itemTable"></div>`;
  $("#isort").value=itemSort;
  $("#addItem").onclick=()=>itemForm();$("#addCat").onclick=()=>{location.hash="#catalog"};
  const draw=()=>{
    let l=S.products.filter(p=>!itemFilter||[p.name,p.generic,p.barcode,p.form].join(" ").toLowerCase().includes(itemFilter.toLowerCase()));
    if(itemSort==="qty")l.sort((a,b)=>qtyOf(a)-qtyOf(b));else if(itemSort==="exp")l.sort((a,b)=>(nearestExp(a)||"9999").localeCompare(nearestExp(b)||"9999"));
    else l.sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
    $("#itemTable").innerHTML=l.length?`<div class="tw"><table><tr><th>الصنف</th><th>الباركود</th><th class="n">سعر البيع</th><th class="n">الكمية</th><th>أقرب انتهاء</th><th></th></tr>
    ${l.map(p=>{const q=qtyOf(p),e=nearestExp(p),st=expStatus(e);return`<tr><td class="wrap"><b>${esc(p.name)}</b><div class="note">${esc([p.form,p.generic,p.mfr].filter(Boolean).join(" · "))}</div></td>
      <td class="mono">${esc(p.barcode)} <button class="sm" data-bc="${p.id}" ${canDo("editItems")?"":"hidden"} type="button">تعديل</button></td><td class="n">${money(p.price)}</td>
      <td class="n"><span class="pill ${q===0?"p-bad":q<=num(p.minQty)?"p-warn":"p-ok"}">${fq(p,q)}</span></td>
      <td>${e?`<span class="pill ${st==="expired"?"p-bad":st==="soon"?"p-warn":"p-ok"}">${esc(e)}</span>`:"-"}</td>
      <td><button class="sm" data-e="${p.id}" ${canDo("editItems")?"":"hidden"} type="button">تعديل</button> <button class="sm" data-b="${p.id}" type="button">باركود</button></td></tr>`}).join("")}</table></div>`
    :`<div class="card empty">${S.products.length?"لا توجد نتائج":"لا توجد أصناف بعد. اضغط «صنف جديد» للبدء."}</div>`;
    $$("[data-e]").forEach(b=>b.onclick=()=>itemForm(S.products.find(p=>p.id===b.dataset.e)));
    $$("[data-bc]").forEach(b=>b.onclick=()=>barcodeForm(S.products.find(p=>p.id===b.dataset.bc)));
    $$("[data-b]").forEach(b=>b.onclick=()=>{bcPick={[b.dataset.b]:1};location.hash="#barcode"});
  };
  $("#iq").oninput=e=>{itemFilter=e.target.value;draw()};
  attachScan($("#iq"),c=>{$("#iq").value=c;itemFilter=c;draw()});
  $("#isort").onchange=e=>{itemSort=e.target.value;draw()};
  draw();
};

