/* ---------- dashboard + expiry ---------- */
/* home screen: only the system logo/name, the pharmacy name and the developer's details */
V.welcome=()=>{
  const st=S.settings,waNo="2"+DEV.phone;
  const hello=`<section class="welcome">
    <button type="button" class="sm w-fs" id="wFs">ملء الشاشة</button>
    <div class="w-logo">${logoHtml(st.logo,240)}</div>
    <h2 class="w-app">${APP_NAME}</h2>
    <div class="w-sub">نظام إدارة الصيدليات</div>
    <div class="w-shop">${esc(st.name||"صيدلية")}</div>
    <div class="hero-dev"><b>المبرمج: ${esc(DEV.name)}</b>
      <span>هاتف وواتساب: <a href="tel:+2${DEV.phone}" dir="ltr">${DEV.phone}</a></span>
      <span>البريد: <a href="mailto:${DEV.email}" dir="ltr">${DEV.email}</a></span>
      <a class="wa" href="https://wa.me/${waNo}" target="_blank" rel="noopener">مراسلة على واتساب</a></div>
  </section>`;
  $("#view").innerHTML=hello;
  const fb=$("#wFs");
  if(!document.documentElement.requestFullscreen)fb.hidden=true;
  else fb.onclick=()=>{ if(document.fullscreenElement)document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(()=>toast("المتصفح منع ملء الشاشة")) };
};

V.dashboard=()=>{
  const ps=S.products,t0=today();
  const ts=S.sales.filter(s=>s.date===t0),rs=S.sreturns.filter(r=>r.date===t0);
  const sold=ts.reduce((a,s)=>a+num(s.total),0)-rs.reduce((a,r)=>a+num(r.total),0);
  const prof=ts.reduce((a,s)=>a+saleProfit(s),0)-rs.reduce((a,r)=>a+(num(r.total)-num(r.vat)-cogs(r.items)),0);
  const value=ps.reduce((a,p)=>a+qtyOf(p)*num(p.cost),0);
  const recv=S.parties.filter(p=>p.type==="c"&&num(p.bal)>0).reduce((a,p)=>a+num(p.bal),0);
  const pay=S.parties.filter(p=>p.type==="s"&&num(p.bal)>0).reduce((a,p)=>a+num(p.bal),0);
  const low=ps.filter(p=>qtyOf(p)<=num(p.minQty));
  const exp=[];ps.forEach(p=>(p.batches||[]).forEach(b=>{if(num(b.qty)>0&&b.exp&&expStatus(b.exp)!=="ok")exp.push({p,b,st:expStatus(b.exp)})}));
  exp.sort((a,b)=>a.b.exp.localeCompare(b.b.exp));
  const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const k=lnow(d).slice(0,10);
    const v=S.sales.filter(s=>s.date===k).reduce((a,s)=>a+num(s.total),0)-S.sreturns.filter(r=>r.date===k).reduce((a,r)=>a+num(r.total),0);
    days.push({k,v,l:d.toLocaleDateString("ar-EG",{weekday:"short"})})}
  const mx=Math.max(1,...days.map(d=>d.v));
  $("#view").innerHTML=`
  ${ps.length?"":`<div class="card" style="margin-bottom:14px"><b>ابدأ من هنا:</b> أضف أصنافك من «المخزون ← الأصناف» أو استورد «الدليل الدوائي» وأضف منه، ثم سجّل فاتورة شراء لإدخال الكميات، وبعدها ابدأ البيع.</div>`}
  <div class="kpis">
    <div class="kpi"><span>صافي مبيعات اليوم</span><b>${money(sold)}</b><small>${ts.length} فاتورة · ${CUR}</small></div>
    <div class="kpi good"><span>ربح اليوم</span><b>${money(prof)}</b><small>بعد التكلفة والضريبة · ${CUR}</small></div>
    <div class="kpi"><span>قيمة المخزون بسعر الشراء</span><b>${money(value)}</b><small>${ps.length} صنف · ${CUR}</small></div>
    <div class="kpi ${recv>0?"warn":""}"><span>مستحق على العملاء</span><b>${money(recv)}</b><small>${CUR}</small></div>
    <div class="kpi ${pay>0?"warn":""}"><span>مستحق للموردين</span><b>${money(pay)}</b><small>${CUR}</small></div>
    <div class="kpi ${low.length?"warn":""}"><span>أصناف وصلت لحد الطلب</span><b>${low.length}</b><small>تحتاج إعادة شراء</small></div>
    <div class="kpi ${exp.length?"bad":""}"><span>منتهية أو قريبة الانتهاء</span><b>${exp.length}</b><small>تشغيلة خلال ${num(S.settings.expMonths)||3} شهور</small></div>
  </div>
  <div class="two sec">
    <div class="card"><h3>المبيعات آخر 7 أيام (${CUR})</h3>
      <div class="bars">${days.map((d,i)=>`<div class="bcol"><b>${d.v?Math.round(d.v).toLocaleString("en-US"):""}</b><i class="${i===6?"today":""}" style="height:${Math.round(d.v/mx*110)}px"></i><em>${d.l}</em></div>`).join("")}</div></div>
    <div><h3>آخر الفواتير</h3>${S.sales.length?`<div class="tw"><table><tr><th>رقم</th><th>الوقت</th><th>العميل</th><th class="n">الصافي</th></tr>
      ${S.sales.slice(0,6).map(s=>`<tr><td class="mono">${s.no}</td><td>${fmtDate(s.ts)}</td><td>${esc(s.customer||"-")}</td><td class="n">${money(s.total)}</td></tr>`).join("")}</table></div>`:`<div class="card empty">لا توجد فواتير بيع بعد</div>`}</div>
  </div>
  <div class="two sec">
    <div><h3>أصناف تحتاج شراء</h3>${low.length?`<div class="tw"><table><tr><th>الصنف</th><th class="n">المتاح</th><th class="n">حد الطلب</th></tr>
      ${low.slice(0,8).map(p=>`<tr><td>${esc(p.name)}</td><td class="n"><span class="pill ${qtyOf(p)===0?"p-bad":"p-warn"}">${fq(p,qtyOf(p))}</span></td><td class="n">${num(p.minQty)}</td></tr>`).join("")}</table></div>`:`<div class="card empty">لا توجد أصناف ناقصة</div>`}</div>
    <div><h3>تواريخ الصلاحية</h3>${exp.length?`<div class="tw"><table><tr><th>الصنف</th><th>الانتهاء</th><th class="n">الكمية</th></tr>
      ${exp.slice(0,8).map(x=>`<tr><td>${esc(x.p.name)}</td><td><span class="pill ${x.st==="expired"?"p-bad":"p-warn"}">${esc(x.b.exp)}</span></td><td class="n">${num(x.b.qty)}</td></tr>`).join("")}</table></div>
      <p class="note"><a href="#expiry" style="color:var(--accent)">فتح قائمة الصلاحيات كاملة</a></p>`:`<div class="card empty">لا توجد تشغيلات قريبة الانتهاء</div>`}</div>
  </div>`;
};

/* ---- expiry ---- */
let expF="3",expConfirm=false;
V.expiry=()=>{
  const now=ym(new Date());const lim=n=>{const d=new Date();d.setMonth(d.getMonth()+n);return ym(d)};
  const all=[];S.products.forEach(p=>(p.batches||[]).forEach((b,i)=>{if(num(b.qty)>0&&b.exp)all.push({p,b,i})}));
  const rows=all.filter(x=>expF==="all"||(expF==="x"?x.b.exp<now:x.b.exp<=lim(+expF))).sort((a,b)=>a.b.exp.localeCompare(b.b.exp));
  const ex=all.filter(x=>x.b.exp<now);const exv=ex.reduce((a,x)=>a+num(x.b.qty)*num(x.b.cost||x.p.cost),0);
  const wo=S.writeoffs.reduce((a,w)=>a+num(w.total),0);
  const chip=(k,t)=>`<button type="button" class="chip ${expF===k?"on":""}" data-f="${k}">${t}</button>`;
  $("#view").innerHTML=`<div class="kpis"><div class="kpi ${ex.length?"bad":""}"><span>تشغيلات منتهية</span><b>${ex.length}</b><small>${ex.reduce((a,x)=>a+num(x.b.qty),0)} وحدة</small></div>
   <div class="kpi ${exv?"bad":""}"><span>قيمة المنتهي بسعر الشراء</span><b>${money(exv)}</b><small>${CUR}</small></div>
   <div class="kpi"><span>إجمالي ما تم إعدامه</span><b>${money(wo)}</b><small>${S.writeoffs.length} عملية · ${CUR}</small></div></div>
  <div class="tbar sec"><div class="chips">${chip("x","المنتهي فقط")}${chip("1","خلال شهر")}${chip("3","خلال 3 شهور")}${chip("6","خلال 6 شهور")}${chip("all","كل التشغيلات")}</div>
   ${ex.length?(expConfirm?`<span class="row"><span class="note">سيتم حذف ${ex.length} تشغيلة من المخزون وتسجيلها كخسارة.</span><button class="dng" id="eGo" type="button">تأكيد الإعدام</button><button id="eNo" type="button">إلغاء</button></span>`
     :`<button class="dng" id="eAll" ${canDo("writeoff")?"":"hidden"} type="button">إعدام كل المنتهي</button>`):""}</div>
  ${rows.length?`<div class="tw"><table><tr><th>الصنف</th><th>التشغيلة</th><th>الانتهاء</th><th class="n">الكمية</th><th class="n">القيمة</th></tr>
   ${rows.map(x=>{const st=expStatus(x.b.exp);return`<tr><td>${esc(x.p.name)}</td><td class="mono">${esc(x.b.no||"-")}</td>
    <td><span class="pill ${st==="expired"?"p-bad":st==="soon"?"p-warn":"p-ok"}">${esc(x.b.exp)}</span></td><td class="n">${num(x.b.qty)}</td><td class="n">${money(num(x.b.qty)*num(x.b.cost||x.p.cost))}</td></tr>`}).join("")}</table></div>`
   :`<div class="card empty">لا توجد تشغيلات في هذه الفترة</div>`}
  <p class="note">التشغيلات المنتهية لا تُباع من شاشة البيع. لإرجاعها للمورد استخدم «المشتريات ← مرتجع شراء».</p>`;
  $$("[data-f]").forEach(b=>b.onclick=()=>{expF=b.dataset.f;V.expiry()});
  const a=$("#eAll");if(a)a.onclick=()=>{expConfirm=true;V.expiry()};
  const n=$("#eNo");if(n)n.onclick=()=>{expConfirm=false;V.expiry()};
  const g=$("#eGo");if(g)g.onclick=async()=>{
    g.disabled=true;const nowM=ym(new Date());
    for(const p of S.products.slice()){
      const gone=(p.batches||[]).filter(b=>num(b.qty)>0&&b.exp&&b.exp<nowM);if(!gone.length)continue;
      const{id,...o}=p;await store.save("products",id,{...o,batches:(p.batches||[]).filter(b=>!gone.includes(b))});
      for(const b of gone){const c=num(b.cost||p.cost);await store.save("writeoffs",uid(),{ts:Date.now(),date:today(),pid:id,name:p.name,no:b.no||"",exp:b.exp,qty:num(b.qty),cost:c,total:num(b.qty)*c,reason:"expired"})}
    }
    audit("إعدام منتهي الصلاحية","تسجيل كخسارة");expConfirm=false;toast("تم إعدام المنتهي وتسجيله كخسارة");V.expiry();
  };
};
