/* ---------- sales: POS, invoices, sale returns ---------- */
const newCart=()=>({lines:[],discount:0,customer:"",method:"نقدي",paid:""});
let carts=[newCart()],cIdx=0,cart=carts[0];
const cartOpen=i=>{cIdx=i;cart=carts[i]};
const cartAdd=()=>{carts.push(newCart());cartOpen(carts.length-1)};
const cartDel=i=>{carts.splice(i,1);if(!carts.length)carts.push(newCart());cartOpen(Math.min(cIdx>i?cIdx-1:cIdx,carts.length-1))};
const cartSub=()=>cart.lines.reduce((a,l)=>a+l.qty*l.price,0);

V.sale=()=>{
  const sub=cartSub(),disc=Math.min(num(cart.discount),sub),tot=sub-disc,rate=num(S.settings.vatRate);
  const credit=cart.method==="آجل";
  $("#view").innerHTML=draftBarHtml(carts,cIdx,c=>c.lines.length||"")+`<div class="pos">
   <div class="card"><label>الصنف (باركود أو اسم)<input id="sItem" autocomplete="off" placeholder="امسح الباركود ثم Enter"></label>
    ${canDo("editItems")?`<div style="margin-top:8px"><button class="sm" id="sNew" type="button">+ صنف غير مسجل</button></div>`:""}
    <div style="margin-top:12px">${cart.lines.length?`<div class="tw"><table><tr><th>الصنف</th><th class="n">السعر</th><th>الكمية</th><th class="n">الإجمالي</th><th></th></tr>
     ${cart.lines.map((l,i)=>`<tr><td class="wrap">${esc(l.name)}${l.pk?` <select data-u="${i}" class="sm">${unitsOf(S.products.find(x=>x.id===l.pid)).map((u,k)=>`<option value="${k}" ${k===(l.ui||0)?"selected":""}>${esc(u.n)}</option>`).join("")}</select>`:""}</td><td class="n">${money(l.price)}</td>
      <td><span class="qty"><button class="sm" data-m="${i}" type="button">−</button><input data-q="${i}" type="number" min="1" value="${l.qty}"><button class="sm" data-p="${i}" type="button">+</button></span></td>
      <td class="n">${money(l.qty*l.price)}</td><td><button class="sm dng" data-r="${i}" type="button">حذف</button></td></tr>`).join("")}</table></div>`
     :`<div class="empty">السلة فارغة. امسح الباركود أو ابحث بالاسم لإضافة صنف.</div>`}</div></div>
   <div class="card"><h3>الفاتورة</h3>
    <label>العميل ${credit?"(مطلوب للبيع الآجل)":"(اختياري)"}<input id="sCust" list="dlCust" value="${esc(cart.customer)}"></label>
    <datalist id="dlCust">${partyOptions("c")}</datalist>
    <div class="row" style="margin-top:10px"><label class="f1" ${canDo("discount")?"":"hidden"}>خصم (${CUR})<input id="sDisc" type="number" min="0" step="0.01" value="${cart.discount||""}"></label>
     <label class="f1">طريقة الدفع<select id="sMeth"><option>نقدي</option><option>بطاقة</option><option>آجل</option></select></label></div>
    ${credit?`<label style="margin-top:10px">المدفوع الآن (${CUR})<input id="sPaid" type="number" min="0" step="0.01" value="${cart.paid}" placeholder="0"></label>`:""}
    <div style="margin-top:12px"><div class="tot"><span>المجموع</span><span>${money(sub)}</span></div>
     <div class="tot"><span>الخصم</span><span>${money(disc)}</span></div>
     ${rate>0?`<div class="tot note"><span>شامل ضريبة ${rate}%</span><span>${money(vatOf(tot,rate))}</span></div>`:""}
     ${credit?`<div class="tot note"><span>يُسجّل على حساب العميل</span><span>${money(Math.max(0,tot-num(cart.paid)))}</span></div>`:""}
     <div class="tot big"><span>الصافي</span><span>${money(tot)} ${CUR}</span></div></div>
    <div class="row" style="margin-top:14px"><button class="pri f1" id="sDone" type="button" ${cart.lines.length?"":"disabled"}>إتمام البيع وإصدار الفاتورة</button>
     <button id="sClr" type="button" ${cart.lines.length?"":"disabled"}>مسح السلة</button></div></div>
  </div>`;
  $("#sMeth").value=cart.method;
  wireDrafts({list:()=>carts,open:cartOpen,add:cartAdd,del:cartDel,size:c=>c.lines.length,again:()=>V.sale()});
  const keep=()=>{cart.customer=$("#sCust").value;cart.discount=canDo("discount")?num($("#sDisc").value):0;cart.method=$("#sMeth").value;const pd=$("#sPaid");if(pd)cart.paid=pd.value};
  $("#sCust").oninput=keep;$("#sMeth").onchange=()=>{keep();V.sale()};
  $("#sDisc").onchange=()=>{keep();V.sale()};const pd=$("#sPaid");if(pd)pd.onchange=()=>{keep();V.sale()};
  const pick=p=>{
    keep();const have=sellable(p),ex=cart.lines.find(l=>l.pid===p.id&&!(l.ui||0)),inCart=cart.lines.filter(l=>l.pid===p.id).reduce((a,l)=>a+l.qty*(l.r||1),0);
    if(have-inCart<1/f0(p)-1e-9){toast(have===0?"لا توجد كمية صالحة للبيع من هذا الصنف":"الكمية المتاحة موجودة في السلة");return}
    if(have-inCart<1-1e-9&&!hasPk(p)){toast("الكمية المتاحة موجودة في السلة");return}
    if(ex)ex.qty++;else cart.lines.push({pid:p.id,name:p.name,price:num(p.price),qty:1,cost:num(p.cost),ui:0,u:unitsOf(p)[0].n,r:1,pk:hasPk(p)?1:0});
    V.sale();$("#sItem").focus();
  };
  suggest($("#sItem"),pick,null,{create:true});
  const sn=$("#sNew");if(sn)sn.onclick=()=>{keep();itemForm({},pick)};
  const chg=(i,q)=>{keep();const l=cart.lines[i],p=S.products.find(x=>x.id===l.pid);q=Math.floor(q);
    if(q<1)q=1;const others=cart.lines.filter((x,k)=>k!==i&&x.pid===l.pid).reduce((a,x)=>a+x.qty*(x.r||1),0);
    const have=p?Math.floor((sellable(p)-others)/(l.r||1)+1e-9):0;if(q>have){toast("المتاح للبيع "+have+" "+(l.pk?l.u:"")+" فقط");q=Math.max(have,1)}l.qty=q;V.sale()};
  $$("[data-u]").forEach(s=>s.onchange=()=>{keep();const l=cart.lines[+s.dataset.u],p=S.products.find(x=>x.id===l.pid);if(!p)return;
    const k=+s.value;l.ui=k;l.u=unitsOf(p)[k].n;l.r=unitR(p,k);l.price=Math.round(num(p.price)*l.r*100)/100;l.cost=num(p.cost)*l.r;chg(+s.dataset.u,l.qty)});
  $$("[data-m]").forEach(b=>b.onclick=()=>chg(+b.dataset.m,cart.lines[+b.dataset.m].qty-1));
  $$("[data-p]").forEach(b=>b.onclick=()=>chg(+b.dataset.p,cart.lines[+b.dataset.p].qty+1));
  $$("[data-q]").forEach(i=>i.onchange=()=>chg(+i.dataset.q,num(i.value)));
  $$("[data-r]").forEach(b=>b.onclick=()=>{keep();cart.lines.splice(+b.dataset.r,1);V.sale()});
  $("#sClr").onclick=()=>{carts[cIdx]=newCart();cart=carts[cIdx];V.sale()};
  $("#sDone").onclick=async()=>{
    keep();const cust=cart.customer.trim();const keepNo=cart.keepNo||0;
    if(credit&&!cust){toast("اكتب اسم العميل للبيع الآجل");return}
    $("#sDone").disabled=true;
    const items=cart.lines.map(l=>({...l})),newB={};
    for(const l of items){
      const p=S.products.find(x=>x.id===l.pid);const r=p?deduct(newB[l.pid]||p.batches,rnd(p,l.qty*(l.r||1))):{short:1};
      if(!p||r.short>0){toast("الكمية غير كافية: "+l.name);$("#sDone").disabled=false;return}
      newB[l.pid]=r.batches;l.bt=btOf(r.taken);
    }
    for(const pid in newB){const p=S.products.find(x=>x.id===pid);const{id,...o}=p;await store.save("products",id,{...o,batches:newB[pid]})}
    const no=keepNo||await store.nextNo("sales",1000);
    const sub2=cartSub(),d2=Math.min(num(cart.discount),sub2),total=sub2-d2;
    const paid=credit?Math.min(total,num(cart.paid)):total;
    const pid=cust?await ensureParty(cust,"c"):null;
    const sale={no,ts:Date.now(),date:today(),by:me?me.name:"",customer:cust,partyId:pid||"",method:cart.method,paid,vatRate:num(S.settings.vatRate),vat:vatOf(total,S.settings.vatRate),
      items:items.map(({pid,name,price,qty,cost,u,r,pk,bt})=>({pid,name,price,qty,cost,u:u||"",r:r||1,pk:pk||0,bt:bt||[]})),subtotal:sub2,discount:d2,total};
    const sid=uid();await store.save("sales",sid,sale);
    if(credit&&pid)await ledgerAdd(pid,"sale",total-paid,"فاتورة بيع رقم "+no,no);
    cartDel(cIdx);
    V.sale();showInvoice({...sale,id:sid});
  };
};

/* ---- invoice rendering ---- */
function invoiceBody(s){
  const st=S.settings;const rem=num(s.total)-num(s.paid??s.total);
  return `<h4>${esc(st.name||"صيدلية")}</h4>
  ${st.address?`<p>${esc(st.address)}</p>`:""}${st.phone?`<p>هاتف: <span dir="ltr">${esc(st.phone)}</span></p>`:""}${st.tax?`<p>الرقم الضريبي: ${esc(st.tax)}</p>`:""}
  <p style="margin-top:8px"><b>فاتورة بيع رقم ${s.no}</b></p>
  <p>${fmtDate(s.ts)}${s.customer?" · العميل: "+esc(s.customer):""} · ${esc(s.method||"")}${s.by?" · الكاشير: "+esc(s.by):""}</p>
  <table><tr><th>الصنف</th><th class="n">السعر</th><th class="n">الكمية</th><th class="n">الإجمالي</th></tr>
  ${s.items.map(i=>`<tr><td style="white-space:normal">${esc(i.name)}</td><td class="n">${money(i.price)}</td><td class="n">${i.qty}${i.pk?" "+esc(i.u):""}</td><td class="n">${money(i.price*i.qty)}</td></tr>`).join("")}</table>
  <div style="margin-top:10px">
   <div class="tot"><span>المجموع</span><span>${money(s.subtotal)}</span></div>
   ${num(s.discount)?`<div class="tot"><span>الخصم</span><span>${money(s.discount)}</span></div>`:""}
   ${num(s.vat)?`<div class="tot"><span>شامل ضريبة القيمة المضافة ${num(s.vatRate)}%</span><span>${money(s.vat)}</span></div>`:""}
   <div class="tot big"><span>الصافي</span><span>${money(s.total)} ${CUR}</span></div>
   ${rem>0?`<div class="tot"><span>المدفوع</span><span>${money(s.paid)}</span></div><div class="tot"><span>المتبقي على العميل</span><span>${money(rem)}</span></div>`:""}</div>
  <p style="margin-top:12px">شكرا لزيارتكم · نتمنى لكم دوام الصحة</p>`;
}
/* paper: "auto" adapts to whatever page the selected printer gives us (58/80 mm rolls, A5, A4...) using print media queries on the real page width */
const paperPref=()=>{try{return localStorage.getItem("ph-paper")||"auto"}catch(e){return"auto"}};
const invCss=p=>{
  const r80=p==="r80",au=p==="auto",page=p==="a4"?"A4":p==="a5"?"A5":r80?"80mm auto":"auto";
  return `@page{size:${page};margin:${au?"0":r80?"3mm":"10mm"}}
body{font-family:Tahoma,Arial,sans-serif;color:#000;font-size:${r80?"11px":"13px"};margin:0;${au?"padding:8mm;":""}}
h4{margin:0;text-align:center;font-size:${r80?"16px":"20px"}}p{margin:2px 0;text-align:center}
table{border-collapse:collapse;width:100%;margin-top:8px}th,td{padding:4px 5px;text-align:right;border-bottom:1px solid #bbb}th{background:#eee}.n{text-align:left}
.tot{display:flex;justify-content:space-between;gap:8px;padding:2px 0}.big{font-size:15px;font-weight:bold;border-top:1px solid #000;margin-top:4px;padding-top:6px}
${r80?".c-x{display:none}":""}
${au?`@media screen{body{max-width:210mm;margin:0 auto}}
@media print and (max-width:110mm){body{padding:2.5mm;font-size:11px}h4{font-size:16px}th,td{padding:2px 3px}.c-x{display:none}.big{font-size:13px}}
@media print and (min-width:111mm) and (max-width:160mm){body{padding:7mm;font-size:12px}}`:""}`;
};
function showInvoice(s){
  openModal(`<div class="bar" style="margin:0"><h2>فاتورة رقم ${s.no}</h2><button type="button" id="mX">إغلاق</button></div>
  <div class="inv">${invoiceBody(s)}</div>
  <div class="row"><label class="f1">حجم الورق<select id="paper"><option value="auto">تلقائي (حسب الطابعة)</option><option value="a5">A5</option><option value="a4">A4</option><option value="r80">إيصال حراري 80 مم</option></select></label>
   <button class="pri" id="mDl" type="button" ${downloads?"":"disabled"}>طباعة</button>
   ${s.id&&!s.void?`<button id="mRet" type="button">عمل مرتجع</button>`:""}
   ${s.id&&!s.void&&canDo("voidInv")?`<button id="mEdit" type="button">تعديل</button><button class="dng" id="mVoid" type="button">إلغاء الفاتورة</button>`:""}</div>
  ${s.void?`<div class="warnbox">فاتورة ملغاة بواسطة ${esc(s.voidBy||"-")} ${s.voidTs?fmtDate(s.voidTs):""}${s.voidWhy?" — "+esc(s.voidWhy):""}</div>`:""}
  <p class="note">«تلقائي» يضبط المقاس على الورق المختار في نافذة الطباعة (رول حراري أو A5 أو A4). تفتح نافذة الطباعة في تبويب جديد.</p>`);
  $("#mX").onclick=closeModal;
  $("#paper").value=paperPref();$("#paper").onchange=()=>{try{localStorage.setItem("ph-paper",$("#paper").value)}catch(e){}};
  $("#mDl").onclick=()=>saveFile("invoice-"+s.no+".html",printDoc("فاتورة "+s.no,invCss($("#paper").value),invoiceBody(s)));
  const r=$("#mRet");if(r)r.onclick=()=>{retNo=String(s.no);closeModal();location.hash="#sreturn"};
  const me2=$("#mEdit");if(me2){me2.onclick=()=>editSale(s);$("#mVoid").onclick=()=>voidSaleDialog(s)}
}

V.invoices=()=>{
  $("#view").innerHTML=`<div class="row" style="margin-bottom:12px"><label class="f2">بحث برقم الفاتورة أو اسم العميل<input id="vq"></label>
   <label class="f1">من تاريخ<input id="vf" type="date"></label><label class="f1">إلى تاريخ<input id="vt" type="date"></label></div>
  <div id="vSum" class="note" style="margin-bottom:8px"></div><div id="vTable"></div>`;
  const draw=()=>{
    const q=$("#vq").value.trim().toLowerCase(),f=$("#vf").value,t=$("#vt").value;
    const l=(arch||S.salesAll||S.sales).filter(s=>(!q||String(s.no).includes(q)||(s.customer||"").toLowerCase().includes(q))&&(!f||s.date>=f)&&(!t||s.date<=t)).sort((a,b)=>b.ts-a.ts).slice(0,1000);
    $("#vSum").textContent=l.length?`${l.filter(s=>!s.void).length} فاتورة · الإجمالي ${money(l.filter(s=>!s.void).reduce((a,s)=>a+num(s.total),0))} ${CUR}${l.some(s=>s.void)?" · "+l.filter(s=>s.void).length+" ملغاة":""}`:"";
    $("#vTable").innerHTML=l.length?`<div class="tw"><table><tr><th>رقم</th><th>التاريخ</th><th>العميل</th><th>الدفع</th><th class="n">الأصناف</th><th class="n">الصافي</th><th></th></tr>
     ${l.map(s=>`<tr><td class="mono">${s.no}</td><td>${fmtDate(s.ts)}</td><td>${esc(s.customer||"-")}</td><td>${esc(s.method||"")}</td><td class="n">${s.items.length}</td><td class="n">${s.void?`<span class="pill p-bad">ملغاة</span>`:money(s.total)}</td><td><button class="sm" data-o="${s.id}" type="button">عرض</button></td></tr>`).join("")}</table></div>`
     :`<div class="card empty">لا توجد فواتير</div>`;
    $$("[data-o]").forEach(b=>b.onclick=()=>showInvoice(l.find(s=>s.id===b.dataset.o)));
  };
  let arch=null;
  const reload=async()=>{const f=$("#vf").value,t=$("#vt").value;
    if(f&&f.slice(0,7)<ym(new Date(Date.now()-75*864e5))){$("#vSum").textContent="جارٍ تحميل الأرشيف…";arch=await store.loadRange("sales",f.slice(0,7),(t||today()).slice(0,7))}else arch=null;draw()};
  ["#vq"].forEach(s=>$(s).addEventListener("input",draw));["#vf","#vt"].forEach(s=>$(s).addEventListener("input",reload));draw();
};

/* ---- sale returns (by box / strip / piece; stock goes back to the original batch and expiry) ---- */
let retNo="";
const retBoxOf=(no,pid)=>S.sreturns.filter(r=>String(r.saleNo)===String(no)).reduce((a,r)=>a+r.items.filter(i=>i.pid===pid).reduce((b,i)=>b+num(i.qty)*(num(i.r)||1),0),0);
function retGroups(sale){
  const gs=[];
  sale.items.forEach(i=>{let g=gs.find(x=>x.pid===i.pid);if(!g){g={pid:i.pid,name:i.name,items:[],box:0,rev:0,cost:0};gs.push(g)}
    const r=num(i.r)||1;g.items.push(i);g.box+=num(i.qty)*r;g.rev+=num(i.qty)*num(i.price);g.cost+=num(i.qty)*num(i.cost)});
  gs.forEach(g=>{g.ret=retBoxOf(sale.no,g.pid);g.p=S.products.find(x=>x.id===g.pid)||null;g.left=Math.max(0,g.box-g.ret)});
  return gs;
}
const fqG=(p,q)=>p?fq(p,q):String(+(+q).toFixed(2));
V.sreturn=()=>{
  const sale=retNo?S.sales.find(s=>String(s.no)===String(retNo)):null;
  const gs=sale?retGroups(sale):[];
  $("#view").innerHTML=`<div class="card"><div class="row"><label class="f1">رقم فاتورة البيع<input id="rNo" type="number" value="${esc(retNo)}" placeholder="مثال: 1001"></label>
    <button class="pri" id="rFind" type="button">بحث</button></div>
   ${retNo&&!sale?`<p class="note" style="color:var(--bad)">لم يتم العثور على فاتورة بهذا الرقم.</p>`:""}</div>
  ${sale?`<div class="card sec"><h3>فاتورة ${sale.no} · ${fmtDate(sale.ts)}${sale.customer?" · "+esc(sale.customer):""}</h3>
   <div class="tw"><table><tr><th>الصنف</th><th class="n">المباع</th><th class="n">سبق إرجاعه</th><th>الوحدة</th><th>كمية المرتجع</th></tr>
   ${gs.map((g,k)=>`<tr><td>${esc(g.name)}</td><td class="n">${fqG(g.p,g.box)}</td><td class="n">${fqG(g.p,g.ret)}</td>
    <td>${g.p&&hasPk(g.p)?`<select data-ru="${k}">${unitsOf(g.p).map((u,x)=>`<option value="${x}">${esc(u.n)}</option>`).join("")}</select>`:`<span class="note">${esc((g.items[0].u&&g.items[0].pk)?g.items[0].u:"وحدة")}</span>`}</td>
    <td>${g.left>1e-6?`<input data-rq="${k}" type="number" min="0" value="0" style="width:80px">`:`<span class="note">تم إرجاعه</span>`}</td></tr>`).join("")}</table></div>
   <p class="note">يعود الصنف لنفس التشغيلة وتاريخ الانتهاء التي خرج منها في هذه الفاتورة.</p>
   <div class="row" style="margin-top:12px"><label class="f1">رد المبلغ<select id="rMeth"><option value="cash">نقدا</option>${sale.partyId?`<option value="acc">خصم من حساب العميل</option>`:""}</select></label>
    <label class="f2">السبب<input id="rWhy" placeholder="مثال: خطأ في الصنف"></label>
    <label class="f1" style="flex-direction:row;align-items:center;gap:8px;flex:0 0 auto"><input id="rBack" type="checkbox" checked style="width:auto"> إعادة الكمية للمخزون</label></div>
   <div class="bar" style="margin:14px 0 0"><b id="rTot">إجمالي المرتجع: 0.00 ${CUR}</b><button class="pri" id="rSave" type="button">تسجيل المرتجع</button></div></div>`:""}
  <h3 class="sec">آخر مرتجعات البيع</h3>
  ${S.sreturns.length?`<div class="tw"><table><tr><th>التاريخ</th><th>فاتورة</th><th>السبب</th><th class="n">الأصناف</th><th class="n">المبلغ</th></tr>
   ${S.sreturns.slice(0,12).map(r=>`<tr><td>${fmtDate(r.ts)}</td><td class="mono">${r.saleNo}</td><td>${esc(r.reason||"-")}</td><td class="n">${r.items.length}</td><td class="n">${money(r.total)}</td></tr>`).join("")}</table></div>`:`<div class="card empty">لا توجد مرتجعات</div>`}`;
  $("#rFind").onclick=()=>{retNo=$("#rNo").value.trim();V.sreturn()};
  $("#rNo").onkeydown=e=>{if(e.key==="Enter")$("#rFind").click()};
  if(!sale)return;
  const uSel=k=>{const s=$(`[data-ru="${k}"]`);const g=gs[k];return s&&g.p?+s.value:0};
  const rOf=k=>{const g=gs[k];return g.p?unitR(g.p,uSel(k)):1};
  const unitPrice=k=>gs[k].rev/gs[k].box*rOf(k),unitCost=k=>gs[k].cost/gs[k].box*rOf(k);
  const maxOf=k=>Math.floor(gs[k].left/rOf(k)+1e-9);
  const calc=()=>{const t=$$("[data-rq]").reduce((a,i)=>a+num(i.value)*unitPrice(+i.dataset.rq),0);const d=num(sale.subtotal)?1-num(sale.discount)/num(sale.subtotal):1;
    $("#rTot").textContent="إجمالي المرتجع: "+money(t*d)+" "+CUR;return t*d};
  $$("[data-rq]").forEach(i=>{i.oninput=calc;i.max=maxOf(+i.dataset.rq)});
  $$("[data-ru]").forEach(s=>s.onchange=()=>{const i=$(`[data-rq="${s.dataset.ru}"]`);if(i){i.max=maxOf(+s.dataset.ru);if(num(i.value)>i.max)i.value=i.max}calc()});
  $("#rSave").onclick=async()=>{
    const lines=$$("[data-rq]").map(i=>({k:+i.dataset.rq,q:Math.floor(num(i.value))})).filter(x=>x.q>0);
    if(!lines.length){toast("اكتب كمية مرتجع لصنف واحد على الأقل");return}
    for(const x of lines){if(x.q>maxOf(x.k)){toast("كمية المرتجع أكبر من المتاح لـ "+gs[x.k].name);return}}
    $("#rSave").disabled=true;const total=Math.round(calc()*100)/100,back=$("#rBack").checked,meth=$("#rMeth").value;
    const items=[];
    for(const x of lines){
      const g=gs[x.k],r=rOf(x.k),p=g.p,ui=uSel(x.k),boxQ=p?rnd(p,x.q*r):x.q*r;
      const item={pid:g.pid,name:g.name,price:Math.round(unitPrice(x.k)*100)/100,qty:x.q,cost:unitCost(x.k),u:p?unitsOf(p)[ui].n:"",r,pk:p&&hasPk(p)?1:0};
      items.push(item);
      if(back&&p){const a=allocBt(g.items,g.ret,boxQ);await putBack(g.pid,a.list,a.rest,"مرتجع")}
      else await store.save("writeoffs",uid(),{ts:Date.now(),date:today(),pid:g.pid,name:g.name,no:"مرتجع",exp:"",qty:x.q,cost:item.cost,total:x.q*item.cost,reason:"return"});
    }
    const no=await store.nextNo("sreturns",0);
    await store.save("sreturns",uid(),{no,ts:Date.now(),date:today(),saleNo:sale.no,partyId:sale.partyId||"",items,total,vat:vatOf(total,sale.vatRate),method:meth,reason:$("#rWhy").value.trim(),by:me?me.name:""});
    if(meth==="acc"&&sale.partyId)await ledgerAdd(sale.partyId,"sret",-total,"مرتجع من فاتورة "+sale.no,sale.no);
    audit("مرتجع بيع","فاتورة "+sale.no+" · "+money(total)+" "+CUR);
    retNo="";toast("تم تسجيل المرتجع"+(meth==="cash"?" · رد "+money(total)+" "+CUR:""));V.sreturn();
  };
};
