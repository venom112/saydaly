/* ---------- accounts: customers and suppliers ledger ---------- */
let partyQ="";
const balTxt=(p)=>{const b=num(p.bal);const c=p.type==="c";
  if(Math.abs(b)<0.005)return`<span class="pill p-ok">مسدد</span>`;
  return b>0?`<span class="pill p-warn">${money(b)} ${c?"عليه":"له"}</span>`:`<span class="pill p-ok">${money(-b)} ${c?"له":"علينا"}</span>`};
function partiesView(type){
  const c=type==="c",W=c?"العملاء":"الموردون",O=c?"عميل":"مورد";
  const all=S.parties.filter(p=>p.type===type);
  const due=all.filter(p=>num(p.bal)>0).reduce((a,p)=>a+num(p.bal),0);
  $("#view").innerHTML=`<div class="kpis"><div class="kpi"><span>عدد ${W}</span><b>${all.length}</b></div>
   <div class="kpi ${due>0?"warn":""}"><span>${c?"إجمالي المستحق على العملاء":"إجمالي المستحق للموردين"}</span><b>${money(due)}</b><small>${CUR}</small></div>
   <div class="kpi"><span>${c?"عملاء عليهم أرصدة":"موردون لهم أرصدة"}</span><b>${all.filter(p=>num(p.bal)>0).length}</b></div></div>
  <div class="tbar sec"><label class="f2" style="max-width:380px">بحث بالاسم أو الهاتف<input id="aq" value="${esc(partyQ)}"></label>
   <button class="pri" id="aNew" type="button">+ ${O} جديد</button></div><div id="aTable"></div>
  <p class="note">${c?"يُنشأ العميل تلقائيا عند كتابة اسمه في شاشة البيع. البيع الآجل يزيد رصيده، والدفعات والمرتجعات على الحساب تنقصه.":"يُنشأ المورد تلقائيا عند كتابة اسمه في فاتورة الشراء. المبلغ غير المدفوع يزيد رصيده، والدفعات والمرتجعات على الحساب تنقصه."}</p>`;
  const draw=()=>{
    const q=partyQ.trim().toLowerCase();
    const l=all.filter(p=>!q||[p.name,p.phone].join(" ").toLowerCase().includes(q)).sort((a,b)=>num(b.bal)-num(a.bal));
    $("#aTable").innerHTML=l.length?`<div class="tw"><table><tr><th>الاسم</th><th>الهاتف</th><th>الرصيد</th><th></th></tr>
     ${l.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td class="mono">${esc(p.phone||"-")}</td><td>${balTxt(p)}</td><td><button class="sm" data-s="${p.id}" type="button">كشف حساب</button></td></tr>`).join("")}</table></div>`
     :`<div class="card empty">${all.length?"لا توجد نتائج":"لا يوجد "+W+" بعد"}</div>`;
    $$("[data-s]").forEach(b=>b.onclick=()=>statement(b.dataset.s));
  };
  $("#aq").oninput=e=>{partyQ=e.target.value;draw()};
  $("#aNew").onclick=()=>partyForm(type);
  draw();
}
V.customers=()=>partiesView("c");
V.suppliers=()=>partiesView("s");

function partyForm(type,p){
  const isNew=!p;const O=type==="c"?"عميل":"مورد";
  openModal(`<h2>${isNew?O+" جديد":"تعديل بيانات "+O}</h2>
  <form id="fParty" class="grid" style="margin-top:10px"><label>الاسم<input id="paName" required value="${esc(p?.name)}"></label>
   <label>الهاتف<input id="paPhone" value="${esc(p?.phone)}"></label>
   ${isNew?`<label>رصيد افتتاحي (${CUR}) — مبلغ مستحق قبل استخدام النظام<input id="paOpen" type="number" step="0.01" value="0"></label>`:""}
   <div class="row"><button class="pri" type="submit">حفظ</button><button type="button" id="paX">إلغاء</button></div></form>`);
  $("#paX").onclick=()=>p?statement(p.id):closeModal();
  $("#fParty").onsubmit=async e=>{
    e.preventDefault();const name=$("#paName").value.trim();
    if(S.parties.some(x=>x.type===type&&x.name===name&&x.id!==p?.id)){toast("الاسم موجود بالفعل");return}
    if(isNew){
      const id=uid(),open=num($("#paOpen").value);
      await store.save("parties",id,{name,phone:$("#paPhone").value.trim(),type,bal:open,createdAt:Date.now()});
      if(open)await store.save("ledger",uid(),{ts:Date.now(),pid:id,kind:"open",amount:open,bal:open,note:"رصيد افتتاحي",ref:""});
      closeModal();toast("تمت الإضافة");
    }else{const{id,...o}=p;await store.save("parties",id,{...o,name,phone:$("#paPhone").value.trim()});p.name=name;p.phone=$("#paPhone").value.trim();toast("تم الحفظ");statement(p.id)}
  };
}

function statement(pid){
  const p=S.parties.find(x=>x.id===pid);if(!p)return closeModal();
  const c=p.type==="c";
  const rows=S.ledger.filter(x=>x.pid===pid).sort((a,b)=>b.ts-a.ts);
  const tbl=`<table><tr><th>التاريخ</th><th>البيان</th><th class="n">مدين</th><th class="n">دائن</th><th class="n">الرصيد</th></tr>
   ${rows.map(r=>`<tr><td>${fmtDate(r.ts)}</td><td style="white-space:normal">${esc(KIND[r.kind]||r.kind)}${r.note&&r.note!==KIND[r.kind]?" · "+esc(r.note):""}</td>
    <td class="n">${num(r.amount)>0?money(r.amount):""}</td><td class="n">${num(r.amount)<0?money(-r.amount):""}</td><td class="n">${money(r.bal)}</td></tr>`).join("")}</table>`;
  openModal(`<div class="bar" style="margin:0"><h2>${esc(p.name)}</h2><button type="button" id="stX">إغلاق</button></div>
   <p class="note">${p.phone?"هاتف: <span class='mono'>"+esc(p.phone)+"</span> · ":""}${c?"عميل":"مورد"}</p>
   <div class="kpis"><div class="kpi"><span>الرصيد الحالي</span><b>${money(p.bal)}</b><small>${num(p.bal)>0?(c?"مستحق على العميل":"مستحق للمورد"):num(p.bal)<0?(c?"رصيد للعميل":"رصيد لنا عند المورد"):"مسدد"} · ${CUR}</small></div></div>
   <form id="fPay" class="row" style="margin:14px 0" ${canDo("pay")?"":"hidden"}><label class="f1">${c?"تحصيل دفعة":"سداد دفعة"} (${CUR})<input id="pyAmt" type="number" min="0.01" step="0.01" required></label>
    <label class="f2">ملاحظة<input id="pyNote"></label><button class="pri" type="submit">${c?"تسجيل التحصيل":"تسجيل السداد"}</button></form>
   <h3>كشف الحساب</h3>${rows.length?`<div class="tw" style="max-height:340px;overflow:auto">${tbl}</div>`:`<div class="card empty">لا توجد حركات</div>`}
   <div class="row" style="margin-top:12px"><button type="button" id="stEdit">تعديل البيانات</button>
    <button type="button" id="stDl" ${downloads&&rows.length?"":"disabled"}>تنزيل كشف الحساب</button></div>`,true);
  $("#stX").onclick=closeModal;$("#stEdit").onclick=()=>partyForm(p.type,p);
  $("#fPay").onsubmit=async e=>{
    e.preventDefault();const a=num($("#pyAmt").value);if(a<=0)return;
    await ledgerAdd(pid,"pay",-a,$("#pyNote").value.trim()||(c?"تحصيل":"سداد"));toast("تم تسجيل الدفعة");statement(pid);
  };
  const dl=$("#stDl");if(dl)dl.onclick=()=>{
    const st=S.settings;
    saveFile("statement-"+p.name.replace(/\s+/g,"_")+".html",printDoc("كشف حساب "+p.name,
      `@page{size:A4;margin:12mm}body{font-family:Tahoma,Arial,sans-serif;font-size:13px}h2,p{text-align:center;margin:3px 0}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{padding:5px 7px;text-align:right;border-bottom:1px solid #bbb}th{background:#eee}.n{text-align:left}`,
      `<h2>${esc(st.name)}</h2><p>كشف حساب ${c?"العميل":"المورد"}: <b>${esc(p.name)}</b></p><p>بتاريخ ${new Date().toLocaleDateString("en-GB")} · الرصيد الحالي ${money(p.bal)} ${CUR}</p>${tbl}`));
  };
}
