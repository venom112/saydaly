/* ---------- alternatives, shortages, expenses, shifts, profit report, audit view ---------- */
const mOf=ts=>ym(new Date(ts));
async function loadSet(from,to){
  const a=from.slice(0,7),b=to.slice(0,7),L=c=>store.loadRange(c,a,b);
  const[sales,rets,wos,exps]=await Promise.all([L("sales"),L("sreturns"),L("writeoffs"),L("expenses")]);
  return{sales:sales.filter(s=>!s.void),rets,wos,exps:exps.filter(x=>!x.void)};
}
const dayOf=r=>r.date||lnow(new Date(r.ts||0)).slice(0,10);
function summarize(set){ // numbers for one slice of data
  const gross=set.sales.reduce((a,s)=>a+num(s.total),0),retT=set.rets.reduce((a,r)=>a+num(r.total),0);
  const vat=set.sales.reduce((a,s)=>a+num(s.vat),0)-set.rets.reduce((a,r)=>a+num(r.vat),0);
  const net=gross-retT,netEx=net-vat;
  const cost=set.sales.reduce((a,s)=>a+cogs(s.items),0)-set.rets.reduce((a,r)=>a+cogs(r.items),0);
  const gp=netEx-cost,loss=set.wos.reduce((a,w)=>a+num(w.total),0),exp=set.exps.reduce((a,x)=>a+num(x.amount),0);
  return{n:set.sales.length,net,vat,netEx,cost,gp,loss,exp,np:gp-loss-exp};
}

/* ----- drug alternatives ----- */
let altSel=null,genMap=null;
const ingSet=s=>new Set(String(s||"").toLowerCase().split(/[+,\/&;]|\band\b/).map(x=>x.replace(/\d+(\.\d+)?\s*(mg|gm|g|mcg|iu|ml|%)/g,"").replace(/[^a-z؀-ۿ ]/g," ").replace(/\s+/g," ").trim()).filter(Boolean));
function genOf(p){
  if(p.generic)return p.generic;
  if(!genMap&&CAT){genMap=new Map();CAT.forEach(r=>genMap.set(nrm(r[0]),r[2]))}
  return genMap?genMap.get(nrm(p.name))||"":"";
}
function altFind(q){
  q=nrm(q).trim();if(!q)return[];const out=[];
  for(const p of S.products){if(nrm(p.name+" "+(p.generic||"")).includes(q)){out.push({name:p.name,gen:genOf(p),price:p.price,p});if(out.length>=8)return out}}
  if(CAT)for(const r of CAT){if(r[7].includes(q)){out.push({name:r[0],gen:r[2],price:r[6]});if(out.length>=8)break}}
  return out;
}
V.alt=()=>{
  if(!CAT)loadCat();
  $("#view").innerHTML=`<div class="card"><label>اسم الدواء أو المادة الفعالة<input id="aq" autocomplete="off" placeholder="مثال: augmentin أو amoxicillin"></label><div id="aRes" style="margin-top:8px"></div></div><div id="aOut" class="sec"></div>`;
  const out=()=>{
    if(!altSel){$("#aOut").innerHTML=`<div class="card empty">اختر دواءً لعرض بدائله المتوفرة في صيدليتك.</div>`;return}
    const g=altSel.gen,base=ingSet(g);
    if(!base.size){$("#aOut").innerHTML=`<div class="card empty">لا توجد مادة فعالة مسجلة لهذا الصنف. أضفها في بيانات الصنف.</div>`;return}
    const rel=(set)=>{if(!set.size)return 0;const inter=[...set].filter(x=>base.has(x)).length;if(inter===set.size&&inter===base.size)return 2;if(inter>0&&(inter===set.size||inter===base.size))return 1;return 0};
    const mine=S.products.filter(p=>!(altSel.p&&altSel.p.id===p.id)).map(p=>({p,r:rel(ingSet(genOf(p)))})).filter(x=>x.r>0).sort((a,b)=>b.r-a.r||(sellable(b.p)>0)-(sellable(a.p)>0)||num(a.p.price)-num(b.p.price));
    const inS=new Set(S.products.map(p=>nrm(p.name)));
    const cat=CAT?CAT.filter(r=>!inS.has(nrm(r[0]))&&rel(ingSet(r[2]))===2).sort((a,b)=>num(a[6])-num(b[6])).slice(0,40):[];
    const pr=num(altSel.price);
    $("#aOut").innerHTML=`<h3>${esc(altSel.name)} <span class="note">· ${esc(g)}</span></h3>
     ${mine.length?`<div class="tw"><table><tr><th>البديل</th><th>التطابق</th><th class="n">المتاح</th><th class="n">السعر</th><th class="n">الفرق</th><th>انتهاء</th></tr>
     ${mine.map(({p,r})=>{const d=num(p.price)-pr;return`<tr><td class="wrap">${esc(p.name)}<div class="note">${esc(genOf(p))}</div></td><td>${r===2?`<span class="pill p-ok">نفس المادة</span>`:`<span class="pill p-warn">تركيبة قريبة</span>`}</td>
      <td class="n"><span class="pill ${sellable(p)>0?"p-ok":"p-bad"}">${fq(p,sellable(p))}</span></td><td class="n">${money(p.price)}</td><td class="n" style="color:${d<0?"var(--good)":d>0?"var(--bad)":"inherit"}">${pr?(d>0?"+":"")+money(d):"-"}</td><td>${esc(nearestExp(p)||"-")}</td></tr>`}).join("")}</table></div>`
      :`<div class="card empty">لا توجد بدائل مسجلة في مخزونك.</div>`}
     ${cat.length?`<h3 class="sec">بدائل غير مسجلة لديك (من الدليل الدوائي)</h3><div class="tw" style="max-height:340px;overflow:auto"><table><tr><th>الصنف</th><th>الشركة</th><th class="n">السعر</th></tr>
      ${cat.map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[3])}</td><td class="n">${money(r[6])}</td></tr>`).join("")}</table></div>`:""}
     <p class="note">التطابق يعتمد على المادة الفعالة المسجلة. راجع التركيز والشكل الدوائي قبل صرف البديل.</p>`;
  };
  $("#aq").oninput=()=>{const l=altFind($("#aq").value);
    $("#aRes").innerHTML=l.map((x,i)=>`<button class="sm" style="display:block;width:100%;text-align:right;margin-top:4px" data-a="${i}" type="button">${esc(x.name)} <span class="note">· ${esc(x.gen||"بلا مادة فعالة")}${x.p?" · في مخزونك":""}</span></button>`).join("");
    $$("[data-a]").forEach(b=>b.onclick=()=>{altSel=l[+b.dataset.a];$("#aRes").innerHTML="";$("#aq").value=altSel.name;out()})};
  out();
};

/* ----- automatic shortages ----- */
V.short=()=>{
  const since=Date.now()-30*864e5,sold={};
  S.sales.forEach(s=>{if(s.ts>=since)s.items.forEach(i=>{sold[i.pid]=(sold[i.pid]||0)+num(i.qty)*(num(i.r)||1)})});
  const lastSup={};[...S.purchases].sort((a,b)=>a.ts-b.ts).forEach(x=>(x.items||[]).forEach(l=>{lastSup[l.pid]=x.supplier||""}));
  const rows=S.products.map(p=>{const q=qtyOf(p),s30=sold[p.id]||0,min=num(p.minQty);
    const need=Math.max(min*2-q,s30/30*21-q);const low=q<=min||(s30>0&&q<s30/30*7);
    return{p,q,s30,sug:Math.max(1,Math.ceil(need-1e-9)),low,out:q<=0,sup:lastSup[p.id]||""}}).filter(x=>x.low).sort((a,b)=>(b.out-a.out)||b.s30-a.s30);
  $("#view").innerHTML=`<div class="kpis"><div class="kpi bad"><span>نفدت كميته</span><b>${rows.filter(x=>x.out).length}</b></div><div class="kpi warn"><span>أقل من حد الطلب</span><b>${rows.filter(x=>!x.out).length}</b></div></div>
   <div class="tbar sec"><button id="shCsv" type="button" ${downloads&&rows.length?"":"disabled"}>تصدير CSV</button><button class="pri" id="shPrint" type="button" ${downloads&&rows.length?"":"disabled"}>ملف طلبية للطباعة (حسب المورد)</button></div>
   ${rows.length?`<div class="tw"><table><tr><th>الصنف</th><th class="n">الحالي</th><th class="n">حد الطلب</th><th class="n">مبيع 30 يوم</th><th>آخر مورد</th><th>المطلوب</th></tr>
   ${rows.map((x,i)=>`<tr><td class="wrap">${esc(x.p.name)}</td><td class="n"><span class="pill ${x.out?"p-bad":"p-warn"}">${fq(x.p,x.q)}</span></td><td class="n">${num(x.p.minQty)}</td><td class="n">${hasPk(x.p)?fq(x.p,x.s30):+x.s30.toFixed(1)}</td><td>${esc(x.sup||"-")}</td>
    <td><input data-sq="${i}" type="number" min="0" value="${x.sug}" style="width:80px"></td></tr>`).join("")}</table></div>`:`<div class="card empty">لا توجد نواقص حاليا.</div>`}
   <p class="note">المقترح = الأكبر بين (ضعف حد الطلب) و(احتياج 3 أسابيع حسب مبيعات آخر 30 يوما) مطروحا منه المتاح. عدّل الكمية كما تريد قبل التصدير.</p>`;
  const get=()=>rows.map((x,i)=>({...x,ord:Math.max(0,Math.floor(num($(`[data-sq="${i}"]`).value)))})).filter(x=>x.ord>0);
  const csv=$("#shCsv");if(csv)csv.onclick=()=>saveFile("shortages-"+today()+".csv",csvOf([["الصنف","الباركود","الحالي","حد الطلب","مبيع 30 يوم","آخر مورد","المطلوب"],...get().map(x=>[x.p.name,x.p.barcode,fq(x.p,x.q),x.p.minQty||0,+x.s30.toFixed(1),x.sup,x.ord])]));
  const pr=$("#shPrint");if(pr)pr.onclick=()=>{
    const g={};get().forEach(x=>{(g[x.sup||"بدون مورد محدد"]=g[x.sup||"بدون مورد محدد"]||[]).push(x)});
    const body=`<h4>طلبية نواقص — ${today()}</h4>`+Object.keys(g).map(k=>`<h3 style="margin:14px 0 2px">${esc(k)}</h3><table><tr><th>الصنف</th><th class="n">الحالي</th><th class="n">المطلوب</th></tr>${g[k].map(x=>`<tr><td>${esc(x.p.name)}</td><td class="n">${fq(x.p,x.q)}</td><td class="n">${x.ord}</td></tr>`).join("")}</table>`).join("");
    saveFile("order-"+today()+".html",printDoc("طلبية نواقص",invCss("a4"),body));
  };
};

/* ----- expenses ----- */
const EXP_CATS=["إيجار","كهرباء ومياه","رواتب","نقل","صيانة","مستلزمات","اتصالات وإنترنت","ضرائب ورسوم","أخرى"];
let expR={from:"",to:""},expData=null;
V.expenses=async()=>{
  if(!expR.from){expR.from=mStart();expR.to=today()}
  $("#view").innerHTML=`<div class="card"><h3>تسجيل مصروف</h3><form id="fExp" class="row"><label class="f1">التاريخ<input id="xDate" type="date" value="${today()}" required></label>
    <label class="f1">البند<select id="xCat">${EXP_CATS.map(c=>`<option>${c}</option>`).join("")}</select></label>
    <label class="f1">المبلغ (${CUR})<input id="xAmt" type="number" min="0.01" step="0.01" required></label>
    <label class="f2">ملاحظة<input id="xNote"></label>
    <label class="f1" style="flex-direction:row;align-items:center;gap:8px;flex:0 0 auto"><input id="xDraw" type="checkbox" checked style="width:auto"> من درج الكاشير</label>
    <button class="pri" type="submit">حفظ</button></form></div>
   <div class="tbar sec"><label class="fs" style="min-width:150px">من<input id="xf" type="date" value="${expR.from}"></label><label class="fs" style="min-width:150px">إلى<input id="xt" type="date" value="${expR.to}"></label></div>
   <div id="xList"><div class="card empty">جارٍ التحميل…</div></div>`;
  $("#fExp").onsubmit=async e=>{e.preventDefault();
    const d=$("#xDate").value,amt=Math.round(num($("#xAmt").value)*100)/100;if(!d||amt<=0)return;
    const ts=d===today()?Date.now():new Date(d+"T12:00:00").getTime();
    await store.save("expenses",uid(),{ts,date:d,cat:$("#xCat").value,amount:amt,note:$("#xNote").value.trim(),drawer:$("#xDraw").checked,by:me?me.name:""});
    audit("إضافة مصروف",$("#xCat").value+" · "+money(amt)+" "+CUR+" · "+d);toast("تم حفظ المصروف");$("#xAmt").value="";$("#xNote").value="";load()};
  const load=async()=>{
    expR.from=$("#xf").value||expR.from;expR.to=$("#xt").value||expR.to;
    const rows=(await store.loadRange("expenses",expR.from.slice(0,7),expR.to.slice(0,7))).filter(x=>!x.void&&dayOf(x)>=expR.from&&dayOf(x)<=expR.to).sort((a,b)=>b.ts-a.ts);
    const by={};rows.forEach(x=>{by[x.cat]=(by[x.cat]||0)+num(x.amount)});const tot=rows.reduce((a,x)=>a+num(x.amount),0);
    $("#xList").innerHTML=rows.length?`<div class="kpis"><div class="kpi"><span>إجمالي المصروفات</span><b>${money(tot)}</b><small>${rows.length} بند</small></div>${Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>`<div class="kpi"><span>${esc(k)}</span><b>${money(v)}</b></div>`).join("")}</div>
     <div class="tw sec"><table><tr><th>التاريخ</th><th>البند</th><th>ملاحظة</th><th>المصدر</th><th>بواسطة</th><th class="n">المبلغ</th><th></th></tr>${rows.map(x=>`<tr><td>${esc(dayOf(x))}</td><td>${esc(x.cat)}</td><td class="wrap">${esc(x.note||"-")}</td><td>${x.drawer?"الدرج":"خارج الدرج"}</td><td>${esc(x.by||"-")}</td><td class="n">${money(x.amount)}</td>
      <td>${canDo("voidInv")?`<button class="sm dng" data-xd="${x.id}" type="button">حذف</button>`:""}</td></tr>`).join("")}</table></div>`:`<div class="card empty">لا توجد مصروفات في هذه الفترة</div>`;
    $$("[data-xd]").forEach(b=>b.onclick=()=>{const x=rows.find(r=>r.id===b.dataset.xd);
      askModal("حذف مصروف","سيُحذف مصروف "+esc(x.cat)+" بقيمة "+money(x.amount)+" من التقارير (يبقى أثره في سجل العمليات).","حذف",async()=>{const{id,...o}=x;await store.save("expenses",x.id,{...o,void:true});audit("حذف مصروف",x.cat+" · "+money(x.amount));closeModal();toast("تم الحذف")})});
  };
  $("#xf").onchange=$("#xt").onchange=load;load();
};

/* ----- shifts and cash drawer ----- */
const openShift=()=>S.shifts.filter(x=>!x.closeTs).sort((a,b)=>b.openTs-a.openTs)[0]||null;
function shiftNumbers(sh){
  const t0=sh.openTs,t1=sh.closeTs||Date.now();const inT=r=>r.ts>=t0&&r.ts<=t1;
  const sales=S.sales.filter(inT);let cash=0,card=0,credit=0;
  sales.forEach(s=>{if(s.method==="نقدي")cash+=num(s.total);else if(s.method==="بطاقة")card+=num(s.total);else{cash+=num(s.paid);credit+=num(s.total)-num(s.paid)}});
  const ret=S.sreturns.filter(r=>inT(r)&&r.method==="cash").reduce((a,r)=>a+num(r.total),0);
  const pt=id=>(S.parties.find(p=>p.id===id)||{}).type;
  let cin=0,cout=0;S.ledger.filter(l=>inT(l)&&l.kind==="pay").forEach(l=>{if(pt(l.pid)==="s")cout+=-num(l.amount);else cin+=-num(l.amount)});
  const exp=S.expenses.filter(x=>!x.void&&inT(x)&&x.drawer).reduce((a,x)=>a+num(x.amount),0);
  const expected=num(sh.openCash)+cash-ret+cin-cout-exp;
  return{count:sales.length,cash,card,credit,ret,cin,cout,exp,expected:Math.round(expected*100)/100};
}
const DENOMS=[200,100,50,20,10,5,1,.5,.25];
V.shift=()=>{
  const sh=openShift();
  const hist=S.shifts.filter(x=>x.closeTs).sort((a,b)=>b.closeTs-a.closeTs).slice(0,15);
  const histHtml=`<h3 class="sec">آخر الورديات المقفلة</h3>${hist.length?`<div class="tw"><table><tr><th>الفتح</th><th>الإقفال</th><th>الكاشير</th><th class="n">المتوقع</th><th class="n">الفعلي</th><th class="n">الفرق</th></tr>
    ${hist.map(x=>`<tr><td>${fmtDate(x.openTs)}</td><td>${fmtDate(x.closeTs)}</td><td>${esc(x.openBy||"-")}</td><td class="n">${money(x.expected)}</td><td class="n">${money(x.counted)}</td>
     <td class="n"><span class="pill ${Math.abs(num(x.diff))<0.005?"p-ok":num(x.diff)<0?"p-bad":"p-warn"}">${num(x.diff)>0?"+":""}${money(x.diff)}</span></td></tr>`).join("")}</table></div>`:`<div class="card empty">لا توجد ورديات مقفلة</div>`}`;
  if(!sh){
    $("#view").innerHTML=`<div class="card" style="max-width:520px"><h3>لا توجد وردية مفتوحة</h3><p class="note">افتح الوردية بتسجيل المبلغ الموجود في الدرج.</p>
     <form id="fOpen" class="row"><label class="f1">رصيد الدرج عند الفتح (${CUR})<input id="shOpen" type="number" min="0" step="0.01" value="0" required></label><button class="pri" type="submit">فتح وردية</button></form></div>${histHtml}`;
    $("#fOpen").onsubmit=async e=>{e.preventDefault();const o=num($("#shOpen").value);
      await store.save("shifts",uid(),{ts:Date.now(),openTs:Date.now(),openBy:me?me.name:"",openCash:o});audit("فتح وردية","رصيد افتتاحي "+money(o));toast("تم فتح الوردية");V.shift()};
    return;
  }
  const n=shiftNumbers(sh);
  $("#view").innerHTML=`<div class="card"><h3>وردية مفتوحة منذ ${fmtDate(sh.openTs)} <span class="note">· ${esc(sh.openBy||"")}</span></h3>
   <div class="kpis"><div class="kpi"><span>فواتير الوردية</span><b>${n.count}</b></div><div class="kpi"><span>مبيعات نقدية</span><b>${money(n.cash)}</b></div><div class="kpi"><span>مبيعات بطاقة</span><b>${money(n.card)}</b></div><div class="kpi"><span>بيع آجل (غير محصل)</span><b>${money(n.credit)}</b></div></div>
   <div class="tw sec"><table>
    <tr><td>رصيد الفتح</td><td class="n">${money(sh.openCash)}</td></tr><tr><td>+ مبيعات نقدية (وما دُفع من الآجل)</td><td class="n">${money(n.cash)}</td></tr>
    <tr><td>+ تحصيل من العملاء</td><td class="n">${money(n.cin)}</td></tr><tr><td>− مرتجعات مردودة نقدا</td><td class="n">${money(n.ret)}</td></tr>
    <tr><td>− دفعات للموردين</td><td class="n">${money(n.cout)}</td></tr><tr><td>− مصروفات من الدرج</td><td class="n">${money(n.exp)}</td></tr>
    <tr><th>المتوقع في الدرج</th><th class="n">${money(n.expected)}</th></tr></table></div></div>
   <div class="card sec"><h3>جرد الصندوق وإقفال الوردية</h3><div class="row" style="gap:8px">${DENOMS.map(d=>`<label style="width:92px">${d} ${CUR}<input data-dn="${d}" type="number" min="0" step="1" placeholder="0"></label>`).join("")}</div>
    <div class="row" style="margin-top:10px"><label class="f1">المبلغ الفعلي (يُحسب من الفئات أو اكتبه)<input id="shCnt" type="number" min="0" step="0.01"></label><label class="f2">ملاحظة<input id="shNote"></label></div>
    <p id="shDiff" class="note" style="margin:8px 0"></p><button class="pri" id="shClose" type="button">إقفال الوردية</button></div>${histHtml}`;
  const upd=()=>{const c=$("#shCnt").value;const d=Math.round((num(c)-n.expected)*100)/100;
    $("#shDiff").innerHTML=c===""?"":`الفرق: <b style="color:${Math.abs(d)<.005?"var(--good)":d<0?"var(--bad)":"var(--warn)"}">${d>0?"+":""}${money(d)} ${CUR}</b> ${Math.abs(d)<.005?"(مطابق)":d<0?"(عجز)":"(زيادة)"}`};
  $$("[data-dn]").forEach(i=>i.oninput=()=>{$("#shCnt").value=+$$("[data-dn]").reduce((a,x)=>a+num(x.value)*num(x.dataset.dn),0).toFixed(2);upd()});
  $("#shCnt").oninput=upd;
  $("#shClose").onclick=async()=>{
    if($("#shCnt").value===""){toast("اكتب المبلغ الفعلي أو عدد الفئات");return}
    const counted=num($("#shCnt").value),diff=Math.round((counted-n.expected)*100)/100;
    const{id,...o}=sh;const done={...o,closeTs:Date.now(),closeBy:me?me.name:"",counted,expected:n.expected,diff,note:$("#shNote").value.trim(),totals:n};
    await store.save("shifts",sh.id,done);audit("إقفال وردية","متوقع "+money(n.expected)+" · فعلي "+money(counted)+" · فرق "+money(diff));
    toast("تم إقفال الوردية");
    if(downloads){const body=`<h4>تقرير وردية</h4><p>${fmtDate(done.openTs)} → ${fmtDate(done.closeTs)}</p><p>${esc(done.openBy||"")}</p><table>
     <tr><td>رصيد الفتح</td><td class="n">${money(done.openCash)}</td></tr><tr><td>مبيعات نقدية</td><td class="n">${money(n.cash)}</td></tr><tr><td>مبيعات بطاقة</td><td class="n">${money(n.card)}</td></tr><tr><td>آجل</td><td class="n">${money(n.credit)}</td></tr>
     <tr><td>تحصيل عملاء</td><td class="n">${money(n.cin)}</td></tr><tr><td>مرتجعات نقدية</td><td class="n">${money(n.ret)}</td></tr><tr><td>دفعات موردين</td><td class="n">${money(n.cout)}</td></tr><tr><td>مصروفات</td><td class="n">${money(n.exp)}</td></tr>
     <tr><th>المتوقع</th><th class="n">${money(n.expected)}</th></tr><tr><th>الفعلي</th><th class="n">${money(counted)}</th></tr><tr><th>الفرق</th><th class="n">${money(diff)}</th></tr></table>${done.note?`<p>${esc(done.note)}</p>`:""}`;
      saveFile("shift-"+today()+".html",printDoc("تقرير وردية",invCss("a5"),body))}
    V.shift();
  };
};

/* ----- monthly / yearly profit ----- */
let prof={mode:"m",year:new Date().getFullYear()},profBusy=false;
V["rep-profit"]=async()=>{
  const yNow=new Date().getFullYear();
  $("#view").innerHTML=`<div class="tbar"><div class="chips"><button class="chip ${prof.mode==="m"?"on":""}" data-pm="m" type="button">شهري</button><button class="chip ${prof.mode==="y"?"on":""}" data-pm="y" type="button">سنوي</button></div>
   ${prof.mode==="m"?`<label class="fs" style="min-width:120px">السنة<select id="pYear">${Array.from({length:yNow-2022},(_,i)=>yNow-i).map(y=>`<option ${y===prof.year?"selected":""}>${y}</option>`).join("")}</select></label>`:""}
   <button id="pCsv" type="button" disabled>تصدير CSV</button></div><div id="pOut"><div class="card empty">جارٍ حساب الأرباح…</div></div>`;
  $$("[data-pm]").forEach(b=>b.onclick=()=>{prof.mode=b.dataset.pm;V["rep-profit"]()});
  const sy=$("#pYear");if(sy)sy.onchange=()=>{prof.year=+sy.value;V["rep-profit"]()};
  const y0=prof.mode==="m"?prof.year:Math.max(2023,yNow-4),y1=prof.mode==="m"?prof.year:yNow;
  const set=await loadSet(y0+"-01",y1+"-12");
  if(!$("#pOut"))return;
  const keyOf=ts=>prof.mode==="m"?mOf(ts):String(new Date(ts).getFullYear());
  const keys=[];if(prof.mode==="m")for(let m=1;m<=12;m++)keys.push(y0+"-"+String(m).padStart(2,"0"));else for(let y=y0;y<=y1;y++)keys.push(String(y));
  const cut=k=>({sales:set.sales.filter(r=>keyOf(r.ts)===k),rets:set.rets.filter(r=>keyOf(r.ts)===k),wos:set.wos.filter(r=>keyOf(r.ts)===k),exps:set.exps.filter(r=>keyOf(r.ts)===k)});
  const rows=keys.map(k=>({k,...summarize(cut(k))}));const tot=summarize(set);
  const mx=Math.max(1,...rows.map(r=>Math.abs(r.np)));
  const MN=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const lab=k=>prof.mode==="m"?MN[+k.slice(5)-1]:k;
  $("#pOut").innerHTML=`<div class="kpis"><div class="kpi"><span>صافي المبيعات (بدون ضريبة)</span><b>${money(tot.netEx)}</b><small>${tot.n} فاتورة</small></div><div class="kpi"><span>مجمل الربح</span><b>${money(tot.gp)}</b></div>
    <div class="kpi"><span>خسائر الإعدام + مصروفات</span><b>${money(tot.loss+tot.exp)}</b></div><div class="kpi ${tot.np>=0?"good":"bad"}"><span>صافي الربح</span><b>${money(tot.np)}</b></div></div>
   <div class="card sec"><h3>صافي الربح ${prof.mode==="m"?"لكل شهر":"لكل سنة"}</h3><div class="bars">${rows.map(r=>`<div class="bcol"><b>${r.np?Math.round(r.np):""}</b><i style="height:${Math.max(2,Math.abs(r.np)/mx*120)}px;${r.np<0?"background:var(--bad)":""}"></i><em>${lab(r.k)}</em></div>`).join("")}</div></div>
   <div class="tw sec"><table><tr><th>${prof.mode==="m"?"الشهر":"السنة"}</th><th class="n">فواتير</th><th class="n">صافي المبيعات</th><th class="n">التكلفة</th><th class="n">مجمل الربح</th><th class="n">إعدام</th><th class="n">مصروفات</th><th class="n">صافي الربح</th></tr>
   ${rows.map(r=>`<tr><td>${lab(r.k)}</td><td class="n">${r.n}</td><td class="n">${money(r.netEx)}</td><td class="n">${money(r.cost)}</td><td class="n">${money(r.gp)}</td><td class="n">${money(r.loss)}</td><td class="n">${money(r.exp)}</td><td class="n"><b style="color:${r.np<0?"var(--bad)":"inherit"}">${money(r.np)}</b></td></tr>`).join("")}
   <tr><th>الإجمالي</th><th class="n">${tot.n}</th><th class="n">${money(tot.netEx)}</th><th class="n">${money(tot.cost)}</th><th class="n">${money(tot.gp)}</th><th class="n">${money(tot.loss)}</th><th class="n">${money(tot.exp)}</th><th class="n">${money(tot.np)}</th></tr></table></div>
   <p class="note">صافي الربح = مجمل الربح − خسائر الإعدام − المصروفات. التكلفة محسوبة بسعر شراء الدفعة وقت البيع.</p>`;
  const cb=$("#pCsv");if(cb&&downloads){cb.disabled=false;cb.onclick=()=>saveFile("profit-"+(prof.mode==="m"?prof.year:"years")+".csv",csvOf([["الفترة","فواتير","صافي المبيعات","التكلفة","مجمل الربح","إعدام","مصروفات","صافي الربح"],...rows.map(r=>[lab(r.k),r.n,r.netEx.toFixed(2),r.cost.toFixed(2),r.gp.toFixed(2),r.loss.toFixed(2),r.exp.toFixed(2),r.np.toFixed(2)])]))}
};

/* ----- audit log view ----- */
let auditQ={q:"",from:"",to:""};
V.audit=async()=>{
  if(!auditQ.from){auditQ.from=mStart();auditQ.to=today()}
  $("#view").innerHTML=`<div class="tbar"><label class="f2">بحث (المستخدم أو الإجراء أو التفاصيل)<input id="aqQ" value="${esc(auditQ.q)}"></label><label class="fs" style="min-width:150px">من<input id="aqF" type="date" value="${auditQ.from}"></label><label class="fs" style="min-width:150px">إلى<input id="aqT" type="date" value="${auditQ.to}"></label></div><div id="auL"><div class="card empty">جارٍ التحميل…</div></div>`;
  const load=async()=>{
    auditQ={q:$("#aqQ").value.trim().toLowerCase(),from:$("#aqF").value||auditQ.from,to:$("#aqT").value||auditQ.to};
    const rows=(await store.loadRange("audit",auditQ.from.slice(0,7),auditQ.to.slice(0,7))).filter(r=>dayOf(r)>=auditQ.from&&dayOf(r)<=auditQ.to&&(!auditQ.q||[r.by,r.act,r.detail].join(" ").toLowerCase().includes(auditQ.q))).sort((a,b)=>b.ts-a.ts).slice(0,500);
    if(!$("#auL"))return;
    $("#auL").innerHTML=rows.length?`<div class="tw"><table><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>التفاصيل</th></tr>${rows.map(r=>`<tr><td>${fmtDate(r.ts)}</td><td>${esc(r.by||"-")}</td><td><b>${esc(r.act)}</b></td><td class="wrap">${esc(r.detail||"")}</td></tr>`).join("")}</table></div><p class="note">يعرض آخر 500 سجل في الفترة. السجل لا يمكن حذفه من داخل النظام.</p>`:`<div class="card empty">لا توجد سجلات</div>`;
  };
  ["#aqQ","#aqF","#aqT"].forEach(s=>$(s).addEventListener("input",load));load();
};
