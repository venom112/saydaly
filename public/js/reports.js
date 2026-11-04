/* ---------- reports ---------- */
const mStart=()=>{const d=new Date();return lnow(new Date(d.getFullYear(),d.getMonth(),1)).slice(0,10)};
let rep={from:"",to:""},repKey="",repSet=null;
V["rep-sales"]=()=>{
  if(!rep.from){rep.from=mStart();rep.to=today()}
  const key=[rep.from,rep.to,S.sales.length,S.sreturns.length,S.writeoffs.length,S.expenses.length].join("|");
  if(repKey!==key||!repSet){
    $("#view").innerHTML=`<div class="card empty">جارٍ تحميل التقرير…</div>`;
    loadSet(rep.from,rep.to).then(d=>{repSet=d;repKey=key;if(curTab()==="rep-sales")V["rep-sales"]()});return;
  }
  const inR=d=>d>=rep.from&&d<=rep.to;
  const sales=repSet.sales.filter(s=>inR(dayOf(s))),rets=repSet.rets.filter(r=>inR(dayOf(r))),wos=repSet.wos.filter(w=>inR(dayOf(w))),exps=repSet.exps.filter(x=>inR(dayOf(x)));
  const expT=exps.reduce((a,x)=>a+num(x.amount),0);
  const gross=sales.reduce((a,s)=>a+num(s.total),0),retT=rets.reduce((a,r)=>a+num(r.total),0);
  const vat=sales.reduce((a,s)=>a+num(s.vat),0)-rets.reduce((a,r)=>a+num(r.vat),0);
  const net=gross-retT,netEx=net-vat;
  const cost=sales.reduce((a,s)=>a+cogs(s.items),0)-rets.reduce((a,r)=>a+cogs(r.items),0);
  const gp=netEx-cost,loss=wos.reduce((a,w)=>a+num(w.total),0),np=gp-loss-expT;
  const byDay={};
  sales.forEach(s=>{const d=byDay[s.date]=byDay[s.date]||{n:0,g:0,r:0,p:0};d.n++;d.g+=num(s.total);d.p+=saleProfit(s)});
  rets.forEach(r=>{const d=byDay[r.date]=byDay[r.date]||{n:0,g:0,r:0,p:0};d.r+=num(r.total);d.p-=num(r.total)-num(r.vat)-cogs(r.items)});
  const days=Object.keys(byDay).sort().reverse();
  const meth={};sales.forEach(s=>{const m=s.method||"نقدي";meth[m]=meth[m]||{n:0,t:0};meth[m].n++;meth[m].t+=num(s.total)});
  const top={};sales.forEach(s=>s.items.forEach(i=>{const t=top[i.pid]=top[i.pid]||{name:i.name,q:0,rev:0,pr:0};t.q+=num(i.qty);t.rev+=num(i.qty)*num(i.price);t.pr+=num(i.qty)*(num(i.price)-num(i.cost))}));
  const tl=Object.values(top).sort((a,b)=>b.rev-a.rev).slice(0,10);
  $("#view").innerHTML=`<div class="tbar"><label class="fs" style="min-width:150px">من<input id="rf" type="date" value="${rep.from}"></label>
   <label class="fs" style="min-width:150px">إلى<input id="rt" type="date" value="${rep.to}"></label>
   <div class="chips"><button class="chip" data-r="d" type="button">اليوم</button><button class="chip" data-r="w" type="button">آخر 7 أيام</button><button class="chip" data-r="m" type="button">هذا الشهر</button><button class="chip" data-r="y" type="button">هذه السنة</button></div>
   <button id="rCsv" type="button" ${downloads&&days.length?"":"disabled"}>تصدير CSV</button></div>
  <div class="kpis"><div class="kpi"><span>صافي المبيعات</span><b>${money(net)}</b><small>${sales.length} فاتورة · مرتجعات ${money(retT)}</small></div>
   <div class="kpi"><span>ضريبة القيمة المضافة</span><b>${money(vat)}</b><small>${num(S.settings.vatRate)}% شاملة في الأسعار</small></div>
   <div class="kpi"><span>تكلفة البضاعة المباعة</span><b>${money(cost)}</b></div>
   <div class="kpi good"><span>مجمل الربح</span><b>${money(gp)}</b><small>${netEx>0?(gp/netEx*100).toFixed(1)+"% من المبيعات":""}</small></div>
   <div class="kpi ${loss>0?"bad":""}"><span>خسائر الإعدام</span><b>${money(loss)}</b><small>منتهي أو تالف</small></div>
   <div class="kpi ${expT>0?"warn":""}"><span>المصروفات</span><b>${money(expT)}</b></div>
   <div class="kpi ${np>=0?"good":"bad"}"><span>صافي الربح</span><b>${money(np)}</b><small>${CUR}</small></div></div>
  <div class="two sec"><div><h3>حسب اليوم</h3>${days.length?`<div class="tw" style="max-height:380px;overflow:auto"><table><tr><th>التاريخ</th><th class="n">فواتير</th><th class="n">مبيعات</th><th class="n">مرتجع</th><th class="n">الربح</th></tr>
    ${days.map(k=>{const d=byDay[k];return`<tr><td>${k}</td><td class="n">${d.n}</td><td class="n">${money(d.g)}</td><td class="n">${money(d.r)}</td><td class="n">${money(d.p)}</td></tr>`}).join("")}</table></div>`:`<div class="card empty">لا توجد حركة في هذه الفترة</div>`}</div>
   <div><h3>طرق الدفع</h3>${Object.keys(meth).length?`<div class="tw"><table><tr><th>الطريقة</th><th class="n">فواتير</th><th class="n">الإجمالي</th></tr>
    ${Object.entries(meth).map(([m,v])=>`<tr><td>${esc(m)}</td><td class="n">${v.n}</td><td class="n">${money(v.t)}</td></tr>`).join("")}</table></div>`:`<div class="card empty">-</div>`}
    <h3 style="margin-top:16px">أعلى 10 أصناف مبيعا</h3>${tl.length?`<div class="tw"><table><tr><th>الصنف</th><th class="n">الكمية</th><th class="n">المبيعات</th><th class="n">الربح</th></tr>
    ${tl.map(t=>`<tr><td>${esc(t.name)}</td><td class="n">${t.q}</td><td class="n">${money(t.rev)}</td><td class="n">${money(t.pr)}</td></tr>`).join("")}</table></div>`:`<div class="card empty">-</div>`}</div></div>`;
  const set=(f,t)=>{rep.from=f;rep.to=t;V["rep-sales"]()};
  $("#rf").onchange=e=>set(e.target.value||rep.from,rep.to);$("#rt").onchange=e=>set(rep.from,e.target.value||rep.to);
  $$("[data-r]").forEach(b=>b.onclick=()=>{const t=today(),k=b.dataset.r;
    if(k==="d")set(t,t);else if(k==="w"){const d=new Date();d.setDate(d.getDate()-6);set(lnow(d).slice(0,10),t)}
    else if(k==="m")set(mStart(),t);else set(t.slice(0,4)+"-01-01",t)});
  $("#rCsv").onclick=()=>saveFile(`sales-${rep.from}_${rep.to}.csv`,csvOf([["التاريخ","عدد الفواتير","المبيعات","المرتجعات","الربح"],...days.reverse().map(k=>{const d=byDay[k];return[k,d.n,d.g.toFixed(2),d.r.toFixed(2),d.p.toFixed(2)]})]));
};

let rsF="all";
V["rep-stock"]=()=>{
  let l=[...S.products].sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
  if(rsF==="low")l=l.filter(p=>qtyOf(p)>0&&qtyOf(p)<=num(p.minQty));else if(rsF==="out")l=l.filter(p=>qtyOf(p)===0);
  const cv=l.reduce((a,p)=>a+qtyOf(p)*num(p.cost),0),sv=l.reduce((a,p)=>a+qtyOf(p)*num(p.price),0);
  const chip=(k,t)=>`<button type="button" class="chip ${rsF===k?"on":""}" data-f="${k}">${t}</button>`;
  $("#view").innerHTML=`<div class="kpis"><div class="kpi"><span>عدد الأصناف</span><b>${l.length}</b></div>
   <div class="kpi"><span>قيمة المخزون بسعر الشراء</span><b>${money(cv)}</b><small>${CUR}</small></div>
   <div class="kpi"><span>قيمة المخزون بسعر البيع</span><b>${money(sv)}</b><small>${CUR}</small></div>
   <div class="kpi good"><span>الربح المتوقع</span><b>${money(sv-cv)}</b><small>${sv>0?((sv-cv)/sv*100).toFixed(1)+"%":""}</small></div></div>
  <div class="tbar sec"><div class="chips">${chip("all","كل الأصناف")}${chip("low","وصلت لحد الطلب")}${chip("out","نفدت")}</div>
   <button id="sCsv" type="button" ${downloads&&l.length?"":"disabled"}>تصدير CSV</button></div>
  ${l.length?`<div class="tw"><table><tr><th>الصنف</th><th class="n">الكمية</th><th class="n">سعر الشراء</th><th class="n">قيمة التكلفة</th><th class="n">سعر البيع</th><th class="n">قيمة البيع</th><th class="n">الهامش</th></tr>
   ${l.map(p=>{const q=qtyOf(p),m=num(p.price)>0?(num(p.price)-num(p.cost))/num(p.price)*100:0;return`<tr><td>${esc(p.name)}</td><td class="n"><span class="pill ${q===0?"p-bad":q<=num(p.minQty)?"p-warn":"p-ok"}">${fq(p,q)}</span></td><td class="n">${money(p.cost)}</td><td class="n">${money(q*num(p.cost))}</td><td class="n">${money(p.price)}</td><td class="n">${money(q*num(p.price))}</td><td class="n">${m.toFixed(1)}%</td></tr>`}).join("")}</table></div>`:`<div class="card empty">لا توجد أصناف</div>`}`;
  $$("[data-f]").forEach(b=>b.onclick=()=>{rsF=b.dataset.f;V["rep-stock"]()});
  $("#sCsv").onclick=()=>saveFile("stock-"+today()+".csv",csvOf([["الصنف","الباركود","الكمية","سعر الشراء","قيمة التكلفة","سعر البيع","قيمة البيع"],...l.map(p=>{const q=qtyOf(p);return[p.name,p.barcode,q,num(p.cost).toFixed(2),(q*num(p.cost)).toFixed(2),num(p.price).toFixed(2),(q*num(p.price)).toFixed(2)]})]));
};
