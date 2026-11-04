/* ---------- purchases: invoice entry, history, returns to supplier ---------- */
const newPur=()=>({lines:[],supplier:"",invNo:"",date:today(),paid:""});
let purs=[newPur()],pIdx=0,pur=purs[0],purPicked=null;
const purOpen=i=>{pIdx=i;pur=purs[i]};
const purAdd=()=>{purs.push(newPur());purOpen(purs.length-1)};
const purDel=i=>{purs.splice(i,1);if(!purs.length)purs.push(newPur());purOpen(Math.min(pIdx>i?pIdx-1:pIdx,purs.length-1))};
V.purchase=()=>{
  if(!pur.date)pur.date=today();
  const total=pur.lines.reduce((a,l)=>a+l.qty*l.cost,0);
  const paid=pur.paid===""?total:Math.min(total,num(pur.paid));
  $("#view").innerHTML=draftBarHtml(purs,pIdx,p=>p.lines.length||"")+`
  <div class="card"><div class="row">
    <label class="f2">المورد<input id="pSup" list="dlSup" value="${esc(pur.supplier)}"></label>
    <datalist id="dlSup">${partyOptions("s")}</datalist>
    <label class="f1">رقم فاتورة المورد<input id="pNo" value="${esc(pur.invNo)}"></label>
    <label class="f1">التاريخ<input id="pDate" type="date" value="${pur.date}"></label></div></div>
  <div class="card sec"><h3>إضافة صنف للفاتورة</h3>
    <div class="row"><label class="f2">الصنف (اسم أو باركود)<input id="pItem" autocomplete="off" placeholder="ابحث أو امسح الباركود"></label>
      <label class="fs">الكمية<input id="pQty" type="number" min="1" value="1"></label>
      <label class="fs" id="pUnitW" hidden>الوحدة<select id="pUnit"></select></label>
      <label class="fs">سعر الشراء<input id="pCost" type="number" step="0.01" min="0"></label>
      <label class="fs">سعر البيع<input id="pPrice" type="number" step="0.01" min="0"></label>
      <label class="fs">رقم التشغيلة<input id="pBatch"></label>
      <label class="fs">الانتهاء<input id="pExp" type="month"></label>
      <button class="pri" id="pAdd" type="button">إضافة</button>${canDo("editItems")?`<button id="pNew" type="button">+ صنف جديد</button>`:""}</div>
    <p class="note" id="pPicked" style="margin:8px 0 0">اختر صنفا من القائمة أولا. الصنف غير موجود؟ أضفه من «المخزون ← الأصناف».</p></div>
  <div class="sec">${pur.lines.length?`<div class="tw"><table><tr><th>الصنف</th><th class="n">الكمية</th><th class="n">سعر الشراء</th><th>تشغيلة</th><th>الانتهاء</th><th class="n">الإجمالي</th><th></th></tr>
    ${pur.lines.map((l,i)=>`<tr><td>${esc(l.name)}</td><td class="n">${l.qty}${l.pk?" "+esc(l.u):""}</td><td class="n">${money(l.cost)}</td><td class="mono">${esc(l.batch||"-")}</td><td>${esc(l.exp||"-")}</td><td class="n">${money(l.qty*l.cost)}</td><td><button class="sm" data-bl="${i}" type="button" ${downloads?"":"disabled"}>باركود</button> <button class="sm dng" data-x="${i}" type="button">حذف</button></td></tr>`).join("")}
    </table></div>`:`<div class="card empty">لا توجد أصناف في الفاتورة بعد</div>`}</div>
  <div class="card sec"><div class="row"><label class="f1">المدفوع للمورد (${CUR})<input id="pPaid" type="number" min="0" step="0.01" value="${pur.paid}" placeholder="${money(total)}"></label>
    <div class="f1"><div class="tot"><span>إجمالي الفاتورة</span><b>${money(total)} ${CUR}</b></div>
     <div class="tot"><span>المتبقي للمورد</span><b style="color:${total-paid>0?"var(--warn)":"inherit"}">${money(total-paid)} ${CUR}</b></div></div>
    <button class="pri" id="pSave" type="button" ${pur.lines.length?"":"disabled"}>حفظ الفاتورة وإدخال المخزون</button></div>
    <div class="row" style="margin-top:10px;gap:18px"><label style="flex-direction:row;align-items:center;gap:8px;flex:0 0 auto"><input id="pPrInv" type="checkbox" style="width:auto" ${lsGet("ph-print-inv")?"checked":""}> طباعة الفاتورة فور الحفظ</label>
     <label style="flex-direction:row;align-items:center;gap:8px;flex:0 0 auto"><input id="pPrBc" type="checkbox" style="width:auto" ${lsGet("ph-print-bc")?"checked":""}> طباعة ملصقات الباركود فور الحفظ</label>
     <span class="note">${downloads?"يُنزَّل ملف جاهز للطباعة ويُفتح لتظهر نافذة الطباعة.":"الطباعة غير متاحة في هذا العرض."}</span></div>
    <p class="note" style="margin:8px 0 0">اترك «المدفوع» فارغا إذا تم دفع كامل الفاتورة. أي مبلغ متبقي يُسجَّل على حساب المورد.</p></div>`;
  wireDrafts({list:()=>purs,open:purOpen,add:purAdd,del:purDel,size:p=>p.lines.length,again:()=>V.purchase()});
  const keep=()=>{pur.supplier=$("#pSup").value;pur.invNo=$("#pNo").value;pur.date=$("#pDate").value;pur.paid=$("#pPaid").value};
  ["#pSup","#pNo","#pDate"].forEach(s=>$(s).addEventListener("input",keep));
  $("#pPaid").onchange=()=>{keep();V.purchase()};
  const applyPick=(q,quiet)=>{purPicked=q;
    $("#pPicked").innerHTML=`الصنف المحدد: <b>${esc(q.name)}</b> · المتاح الآن ${qtyOf(q)} <button class="sm" id="pBc" type="button">تعديل الباركود</button>`;
    $("#pCost").value=q.cost||"";$("#pPrice").value=q.price||"";
    $("#pUnitW").hidden=!hasPk(q);$("#pUnit").innerHTML=unitsOf(q).map((u,k)=>`<option value="${k}">${esc(u.n)}</option>`).join("");
    $("#pUnit").onchange=()=>{const r=unitR(q,+$("#pUnit").value);$("#pCost").value=+(num(q.cost)*r).toFixed(2)||"";$("#pPrice").value=+(num(q.price)*r).toFixed(2)||""};
    $("#pBc").onclick=()=>barcodeForm(q,np=>{purPicked=np;V.purchase()});if(!quiet)$("#pQty").focus()};
  suggest($("#pItem"),q=>applyPick(q),null,{create:true});
  const sn=$("#pNew");if(sn)sn.onclick=()=>{keep();itemForm({},q=>applyPick(q))};
  if(purPicked)applyPick(purPicked,true);
  $("#pAdd").onclick=()=>{
    if(!purPicked){toast("اختر الصنف أولا");return}
    const qty=Math.floor(num($("#pQty").value));if(qty<1){toast("الكمية غير صحيحة");return}
    keep();const ui=hasPk(purPicked)?+$("#pUnit").value:0;
    pur.lines.push({pid:purPicked.id,name:purPicked.name,qty,cost:num($("#pCost").value),price:num($("#pPrice").value),batch:$("#pBatch").value.trim(),exp:$("#pExp").value,ui,u:unitsOf(purPicked)[ui].n,r:unitR(purPicked,ui),pk:hasPk(purPicked)?1:0});
    purPicked=null;V.purchase();$("#pItem").focus();
  };
  $$("[data-x]").forEach(b=>b.onclick=()=>{keep();pur.lines.splice(+b.dataset.x,1);V.purchase()});
  $$("[data-bl]").forEach(b=>b.onclick=()=>{const l=pur.lines[+b.dataset.bl],p=S.products.find(x=>x.id===l.pid);if(!p||!p.barcode){toast("الصنف بلا باركود");return}
    labelsFile([{p,n:Math.max(1,Math.ceil(num(l.qty)*(num(l.r)||1)-1e-9))}],"barcode-"+p.barcode+".html")});
  $("#pSave").onclick=async()=>{
    keep();const keepNo=pur.keepNo||0;const rem=Math.round((total-paid)*100)/100;
    if(rem>0&&!pur.supplier.trim()){toast("اكتب اسم المورد لتسجيل المبلغ المتبقي عليه");return}
    $("#pSave").disabled=true;
    const byId={};
    for(const l of pur.lines){
      const p=byId[l.pid]||S.products.find(x=>x.id===l.pid);if(!p)continue;
      const batches=(p.batches||[]).map(b=>({...b}));
      const hit=batches.find(b=>(b.no||"")===(l.batch||"")&&(b.exp||"")===(l.exp||""));
      const rr=l.r||1,bq=Math.round(l.qty*rr*f0(p))/f0(p),bc=l.cost/rr;
      if(hit){hit.qty=+(num(hit.qty)+bq).toFixed(6);hit.cost=bc}else batches.push({no:l.batch,exp:l.exp,qty:bq,cost:bc});
      byId[l.pid]={...p,batches,cost:bc||p.cost,price:(l.price/rr)||p.price};
    }
    for(const id in byId){const{id:_,...o}=byId[id];await store.save("products",id,o)}
    const pid=pur.supplier.trim()?await ensureParty(pur.supplier,"s"):null;
    const no=keepNo||await store.nextNo("purchases",0);
    const doc={no,ts:Date.now(),date:pur.date,supplier:pur.supplier.trim(),partyId:pid||"",invNo:pur.invNo,items:pur.lines.map(l=>({...l})),total,paid,by:me?me.name:""};
    await store.save("purchases",uid(),doc);
    try{localStorage.setItem("ph-print-inv",$("#pPrInv").checked?"1":"0");localStorage.setItem("ph-print-bc",$("#pPrBc").checked?"1":"0")}catch(e){}
    const wantInv=$("#pPrInv").checked,wantBc=$("#pPrBc").checked;
    if(rem>0&&pid)await ledgerAdd(pid,"buy",rem,"فاتورة شراء "+(pur.invNo||("رقم "+no)),no);
    purDel(pIdx);toast("تم حفظ الفاتورة وتحديث المخزون");V.purchase();
    if(downloads){if(wantInv)await printPurchase(doc);if(wantBc){const e=labelEntries(doc);if(e.length)await labelsFile(e,"barcodes-purchase-"+no+".html")}}
  };
};

V.plist=()=>{
  $("#view").innerHTML=`<div class="row" style="margin-bottom:12px"><label class="f2">بحث بالمورد أو رقم الفاتورة<input id="lq"></label>
   <label class="f1">من تاريخ<input id="lf" type="date"></label><label class="f1">إلى تاريخ<input id="lt" type="date"></label></div>
   <div id="lSum" class="note" style="margin-bottom:8px"></div><div id="lTable"></div>`;
  const draw=()=>{
    const q=$("#lq").value.trim().toLowerCase(),f=$("#lf").value,t=$("#lt").value;
    const l=(S.purchasesAll||S.purchases).filter(p=>(!q||(p.supplier||"").toLowerCase().includes(q)||(p.invNo||"").toLowerCase().includes(q))&&(!f||p.date>=f)&&(!t||p.date<=t));
    $("#lSum").textContent=l.length?`${l.filter(p=>!p.void).length} فاتورة · الإجمالي ${money(l.filter(p=>!p.void).reduce((a,p)=>a+num(p.total),0))} ${CUR}`:"";
    $("#lTable").innerHTML=l.length?`<div class="tw"><table><tr><th>التاريخ</th><th>المورد</th><th>رقم الفاتورة</th><th class="n">الأصناف</th><th class="n">الإجمالي</th><th class="n">المتبقي</th><th></th></tr>
     ${l.map(p=>{const rem=num(p.total)-num(p.paid??p.total);return`<tr><td>${esc(p.date)}</td><td>${esc(p.supplier||"-")}</td><td class="mono">${esc(p.invNo||"-")}</td><td class="n">${(p.items||[]).length}</td><td class="n">${money(p.total)}</td>
      <td class="n">${p.void?`<span class="pill p-bad">ملغاة</span>`:rem>0?`<span class="pill p-warn">${money(rem)}</span>`:`<span class="pill p-ok">مسددة</span>`}</td><td><button class="sm" data-v="${p.id}" type="button">عرض</button></td></tr>`}).join("")}</table></div>`
     :`<div class="card empty">لا توجد فواتير شراء</div>`;
    $$("[data-v]").forEach(b=>b.onclick=()=>showPurchase(l.find(x=>x.id===b.dataset.v)));
  };
  ["#lq","#lf","#lt"].forEach(s=>$(s).addEventListener("input",draw));draw();
};

/* ---- purchase returns ---- */
let prt={supplier:"",lines:[],method:"cash",why:""};
V.preturn=()=>{
  const total=prt.lines.reduce((a,l)=>a+l.qty*l.cost,0);
  $("#view").innerHTML=`<div class="card"><div class="row"><label class="f2">المورد<input id="rSup" list="dlSup2" value="${esc(prt.supplier)}"></label>
    <datalist id="dlSup2">${partyOptions("s")}</datalist>
    <label class="f1">رد قيمة المرتجع<select id="rMeth"><option value="cash">نقدا من المورد</option><option value="acc">خصم من حسابي عند المورد</option></select></label>
    <label class="f2">السبب<input id="rWhy" value="${esc(prt.why)}" placeholder="مثال: منتهي الصلاحية"></label></div></div>
   <div class="card sec"><div class="row"><label class="f2">الصنف (اسم أو باركود)<input id="rItem" autocomplete="off"></label>
    <label class="fs">الكمية<input id="rQty" type="number" min="1" value="1"></label>
    <label class="fs" id="rUnitW" hidden>الوحدة<select id="rUnit"></select></label>
    <label class="fs">سعر الشراء<input id="rCost" type="number" min="0" step="0.01"></label>
    <button class="pri" id="rAdd" type="button">إضافة</button></div>
    <p class="note" id="rPicked" style="margin:8px 0 0">يُخصم المرتجع من المخزون بدءا بالتشغيلة الأقرب انتهاء.</p></div>
   <div class="sec">${prt.lines.length?`<div class="tw"><table><tr><th>الصنف</th><th class="n">الكمية</th><th class="n">السعر</th><th class="n">الإجمالي</th><th></th></tr>
    ${prt.lines.map((l,i)=>`<tr><td>${esc(l.name)}</td><td class="n">${l.qty}${l.pk?" "+esc(l.u):""}</td><td class="n">${money(l.cost)}</td><td class="n">${money(l.qty*l.cost)}</td><td><button class="sm dng" data-x="${i}" type="button">حذف</button></td></tr>`).join("")}</table></div>`
    :`<div class="card empty">لا توجد أصناف في المرتجع</div>`}</div>
   <div class="bar sec"><b style="font-size:18px">إجمالي المرتجع: ${money(total)} ${CUR}</b><button class="pri" id="rSave" type="button" ${prt.lines.length?"":"disabled"}>تسجيل المرتجع وخصمه من المخزون</button></div>
   <h3 class="sec">آخر مرتجعات الشراء</h3>
   ${S.preturns.length?`<div class="tw"><table><tr><th>التاريخ</th><th>المورد</th><th>السبب</th><th class="n">الأصناف</th><th class="n">المبلغ</th></tr>
    ${S.preturns.slice(0,12).map(r=>`<tr><td>${fmtDate(r.ts)}</td><td>${esc(r.supplier||"-")}</td><td>${esc(r.why||"-")}</td><td class="n">${r.items.length}</td><td class="n">${money(r.total)}</td></tr>`).join("")}</table></div>`:`<div class="card empty">لا توجد مرتجعات شراء</div>`}`;
  $("#rMeth").value=prt.method;
  const keep=()=>{prt.supplier=$("#rSup").value;prt.method=$("#rMeth").value;prt.why=$("#rWhy").value};
  ["#rSup","#rMeth","#rWhy"].forEach(s=>$(s).addEventListener("input",keep));
  let picked=null;
  suggest($("#rItem"),p=>{picked=p;$("#rPicked").innerHTML=`الصنف المحدد: <b>${esc(p.name)}</b> · المتاح ${fq(p,qtyOf(p))}`;$("#rCost").value=p.cost||"";
    $("#rUnitW").hidden=!hasPk(p);$("#rUnit").innerHTML=unitsOf(p).map((u,k)=>`<option value="${k}">${esc(u.n)}</option>`).join("");
    $("#rUnit").onchange=()=>{$("#rCost").value=+(num(p.cost)*unitR(p,+$("#rUnit").value)).toFixed(2)||""};$("#rQty").focus()});
  $("#rAdd").onclick=()=>{
    if(!picked){toast("اختر الصنف أولا");return}
    const qty=Math.floor(num($("#rQty").value));const ui=hasPk(picked)?+$("#rUnit").value:0,r=unitR(picked,ui);
    const used=prt.lines.filter(l=>l.pid===picked.id).reduce((a,l)=>a+l.qty*(l.r||1),0);
    if(qty<1||used+qty*r>qtyOf(picked)+1e-9){toast("الكمية غير صحيحة أو أكبر من المتاح");return}
    keep();const ex=prt.lines.find(l=>l.pid===picked.id&&(l.ui||0)===ui);
    if(ex)ex.qty+=qty;else prt.lines.push({pid:picked.id,name:picked.name,qty,cost:num($("#rCost").value),ui,u:unitsOf(picked)[ui].n,r,pk:hasPk(picked)?1:0});
    V.preturn();$("#rItem").focus();
  };
  $$("[data-x]").forEach(b=>b.onclick=()=>{keep();prt.lines.splice(+b.dataset.x,1);V.preturn()});
  $("#rSave").onclick=async()=>{
    keep();const sup=prt.supplier.trim();
    if(prt.method==="acc"&&!sup){toast("اكتب اسم المورد للخصم من حسابه");return}
    $("#rSave").disabled=true;
    const cur={};
    for(const l of prt.lines){const p=S.products.find(x=>x.id===l.pid);if(!p)continue;cur[l.pid]=deductAny(cur[l.pid]||p.batches,rnd(p,l.qty*(l.r||1)))}
    for(const pid in cur){const p=S.products.find(x=>x.id===pid);const{id,...o}=p;await store.save("products",id,{...o,batches:cur[pid]})}
    const pid=sup?await ensureParty(sup,"s"):null;
    const no=await store.nextNo("preturns",0);
    await store.save("preturns",uid(),{no,ts:Date.now(),date:today(),supplier:sup,partyId:pid||"",items:prt.lines,total,method:prt.method,why:prt.why.trim()});
    if(prt.method==="acc"&&pid)await ledgerAdd(pid,"pret",-total,"مرتجع شراء رقم "+no,no);
    prt={supplier:"",lines:[],method:"cash",why:""};toast("تم تسجيل مرتجع الشراء");V.preturn();
  };
};
