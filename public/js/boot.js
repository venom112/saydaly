/* ---------- settings, backup, router, boot ---------- */
let itemFilter="",itemSort="name";

V.settings=()=>{
  const s=S.settings;
  $("#view").innerHTML=`<form id="fSet" class="card" style="max-width:720px"><h3>بيانات تظهر على الفاتورة</h3>
   <div class="grid"><label>اسم الصيدلية<input id="stName" value="${esc(s.name)}"></label>
   <label>العنوان<input id="stAddr" value="${esc(s.address)}"></label>
   <div class="row"><label class="f1">الهاتف<input id="stPhone" value="${esc(s.phone)}" inputmode="tel"></label><label class="f1">هاتف آخر (اختياري)<input id="stPhone2" value="${esc(s.phone2||"")}" inputmode="tel"></label></div>
   <label>الرقم الضريبي<input id="stTax" value="${esc(s.tax)}"></label>
   <div class="logoset"><div id="stLogoPrev">${logoHtml(s.logo,56)}</div>
    <div><b>شعار الصيدلية</b><p class="note" style="margin:2px 0 8px">صورة PNG أو JPG، تُصغَّر تلقائيا. يظهر في الصفحة الرئيسية والقائمة وشاشة الدخول.</p>
    <div class="row"><button type="button" id="stLogoBtn">اختيار صورة</button><button type="button" id="stLogoDel" ${s.logo?"":"hidden"}>إزالة الشعار</button></div>
    <input id="stLogoFile" type="file" accept="image/png,image/jpeg,image/webp" hidden></div></div></div>
   <h3 style="margin-top:20px">الضريبة والتنبيهات</h3>
   <div class="row"><label class="f1">نسبة ضريبة القيمة المضافة %<input id="stVat" type="number" min="0" max="100" step="0.01" value="${num(s.vatRate)}"></label>
    <label class="f1">التنبيه قبل الانتهاء (شهور)<input id="stExp" type="number" min="1" max="24" value="${num(s.expMonths)||3}"></label></div>
   <label style="margin-top:12px;max-width:340px">قفل تلقائي بعد عدم النشاط (دقائق، 0 = معطّل)<input id="stLock" type="number" min="0" max="240" value="${num(s.lockMin)}"></label>
   <p class="note">أسعار البيع تُعتبر شاملة الضريبة، وتظهر قيمتها على الفاتورة وفي التقارير. اتركها 0 إذا كانت أصنافك معفاة.</p>
   <div class="row" style="margin-top:14px"><button class="pri" type="submit">حفظ الإعدادات</button></div></form>`;
  let logo=s.logo||"";
  const showLogo=()=>{$("#stLogoPrev").innerHTML=logoHtml(logo,56);$("#stLogoDel").hidden=!logo};
  $("#stLogoBtn").onclick=()=>$("#stLogoFile").click();
  $("#stLogoDel").onclick=()=>{logo="";showLogo()};
  $("#stLogoFile").onchange=async e=>{const f=e.target.files[0];e.target.value="";if(!f)return;
    try{logo=await shrinkImage(f,256);showLogo()}catch(x){toast("تعذر قراءة الصورة")}};
  $("#fSet").onsubmit=async e=>{e.preventDefault();
    audit("تعديل الإعدادات","بيانات الصيدلية/الضريبة/القفل التلقائي");
    await store.save("meta","settings",{...S.settings,lockMin:Math.max(0,Math.floor(num($("#stLock").value))),name:$("#stName").value.trim()||"صيدلية",address:$("#stAddr").value.trim(),phone:$("#stPhone").value.trim(),phone2:$("#stPhone2").value.trim(),logo,tax:$("#stTax").value.trim(),
      vatRate:Math.max(0,num($("#stVat").value)),expMonths:Math.max(1,Math.floor(num($("#stExp").value))||3)});
    toast("تم حفظ الإعدادات")};
};

/* ---- navigation ---- */
const ICON={
  home:"M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  cart:"M3 4h2l2.4 11h10.2L20 7H6.2M9 20.5h.01M17 20.5h.01",
  truck:"M2 6h11v9H2zM13 9h4l3 3v3h-7zM6 18h.01M17 18h.01",
  box:"M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  users:"M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1a4 4 0 0 0-3-3.8M16 4.2a3.5 3.5 0 0 1 0 6.6",
  chart:"M4 20V10M10 20V4M16 20v-7M22 20H2",
  gear:"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
};
const GROUPS=[
  {id:"home",label:"الرئيسية",icon:"home",tabs:[["welcome","الرئيسية","أهلا بك في صيدلي."],["dashboard","ملخص اليوم","ملخص المبيعات والمخزون والتنبيهات اليوم."]]},
  {id:"sales",label:"المبيعات",icon:"cart",tabs:[["sale","نقطة البيع","امسح الباركود أو ابحث بالاسم، ثم أتمم البيع لإصدار الفاتورة."],["invoices","فواتير البيع","كل الفواتير الصادرة، ويمكن فتحها وإعادة طباعتها."],["sreturn","مرتجع بيع","إرجاع أصناف من فاتورة سابقة ورد المبلغ."],["shift","الوردية والصندوق","افتح الوردية، وراجع المتوقع في الدرج، وأقفلها بعد جرد الصندوق."]]},
  {id:"buy",label:"المشتريات",icon:"truck",tabs:[["purchase","فاتورة شراء","سجّل البضاعة الواردة من المورد وتتحدث الكميات تلقائيا."],["plist","سجل المشتريات","فواتير الشراء السابقة والمبالغ المتبقية للموردين."],["preturn","مرتجع شراء","إرجاع بضاعة للمورد وخصمها من المخزون."]]},
  {id:"stock",label:"المخزون",icon:"box",tabs:[["items","الأصناف","أضف الأصناف وراجع الكميات وتواريخ الانتهاء."],["catalog","الدليل الدوائي","ابحث في قاعدة الأدوية المصرية وأضف الصنف إلى مخزونك بضغطة."],["stocktake","الجرد","اكتب الكمية الفعلية على الرف وسوِّ الفروق. الأصناف المتروكة فارغة لا تتغير."],["expiry","الصلاحيات","متابعة التشغيلات المنتهية والقريبة من الانتهاء."],["barcode","الباركود","اختر الأصناف وعدد الملصقات ثم نزّل ملف الطباعة."],["alt","بدائل الدواء","ابحث عن بدائل أي دواء بنفس المادة الفعالة."],["short","النواقص","أصناف نفدت أو قاربت على النفاد مع كميات مقترحة للطلب."]]},
  {id:"acc",label:"الحسابات",icon:"users",tabs:[["customers","العملاء","أرصدة العملاء وكشوف الحساب وتحصيل الدفعات."],["suppliers","الموردون","أرصدة الموردين وكشوف الحساب وسداد الدفعات."],["expenses","المصروفات","سجّل المصروفات اليومية وراجعها حسب البند."]]},
  {id:"rep",label:"التقارير",icon:"chart",tabs:[["rep-sales","المبيعات والأرباح","المبيعات والتكلفة والربح خلال فترة."],["rep-stock","تقرير المخزون","قيمة المخزون بسعر الشراء والبيع."],["rep-profit","الأرباح الشهرية والسنوية","صافي الربح لكل شهر وسنة بعد التكلفة والإعدام والمصروفات."]]},
  {id:"set",label:"الإعدادات",icon:"gear",tabs:[["settings","بيانات الصيدلية","بيانات الفاتورة والضريبة وتنبيهات الصلاحية."],["users","المستخدمون والصلاحيات","إنشاء حسابات المستخدمين والتحكم في صلاحياتهم."],["backup","النسخ الاحتياطي","تصدير بياناتك أو استعادتها من ملف."],["audit","سجل العمليات","من عدّل ماذا ومتى: الأصناف والفواتير والمستخدمون والورديات."]]}
];
const TABS={};GROUPS.forEach(g=>g.tabs.forEach(t=>TABS[t[0]]={group:g,label:t[1],desc:t[2]}));
const lastTab={};
function firstAllowed(){for(const g of GROUPS)for(const t of g.tabs)if(can(t[0]))return t[0];return null}
function curTab(){const h=(location.hash||"#welcome").slice(1);return TABS[h]&&can(h)?h:firstAllowed()}
function render(){
  $("#shopName").textContent=S.settings.name||"صيدلية";$("#lgShop").textContent=S.settings.name||"صيدلية";
  document.querySelectorAll(".logo .cross,.logo2 .cross,.logo img.lg-img,.logo2 img.lg-img").forEach(el=>el.remove());
  ["#shopName","#lgShop"].forEach(q=>{const el=$(q);el.parentNode.insertBefore(S.settings.logo?logoEl(S.settings.logo,30):crossEl(),el)});
  if(!me){
    document.body.classList.add("locked");
    if(usersReady)showLogin();else{$("#login").hidden=false;$("#lgBtn").disabled=true;$("#lgBtn").textContent="جاري التحميل…"}
    return;
  }
  document.body.classList.remove("locked");$("#login").hidden=true;
  $("#whoami").textContent=me.name+" · "+(me.role==="admin"?"مدير":"مستخدم");
  const id=curTab();
  if(!id){$("#gnav").innerHTML="";$("#tabs").innerHTML="";$("#gTitle").textContent="لا توجد صلاحيات";$("#gSub").textContent="";
    $("#view").innerHTML=`<div class="card empty">لا توجد أقسام مسموحة لهذا الحساب. تواصل مع المدير.</div>`;return}
  const T=TABS[id],g=T.group;lastTab[g.id]=id;
  const vis=GROUPS.map(x=>({g:x,tabs:x.tabs.filter(t=>can(t[0]))})).filter(x=>x.tabs.length);
  $("#gnav").innerHTML=vis.map(x=>{const lt=lastTab[x.g.id],href=x.tabs.some(t=>t[0]===lt)?lt:x.tabs[0][0];
    return`<a href="#${href}" ${x.g===g?'aria-current="page"':""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[x.g.icon]}"/></svg><span>${x.g.label}</span></a>`}).join("");
  const tabs=g.tabs.filter(t=>can(t[0]));
  $("#gTitle").textContent=tabs.length>1?g.label:T.label;
  $("#gSub").textContent=T.desc;
  $("#tabs").innerHTML=tabs.length>1?tabs.map(t=>`<a href="#${t[0]}" ${t[0]===id?'aria-current="page"':""}>${t[1]}</a>`).join(""):"";
  if(!S.ready){$("#view").innerHTML=`<div class="card empty">جاري تحميل البيانات…</div>`;return}
  Promise.resolve(V[id]()).catch(e=>{if(me&&e&&e.status!==401)toast(e.message||"حدث خطأ")});
  if(isAdmin()&&me.mustChange){
    $("#view").insertAdjacentHTML("afterbegin",`<div class="warnbox row" style="justify-content:space-between;align-items:center"><span>كلمة مرور المدير ما زالت الافتراضية (admin). غيّرها الآن لحماية النظام.</span><button id="btnPwNow" type="button">تغيير كلمة المرور</button></div>`);
    $("#btnPwNow").onclick=()=>pwForm(me.id,true);
  }
}
function refresh(){
  if(!me){render();return}
  const a=document.activeElement;
  if(!$("#modal").hidden)return;
  if(a&&$("#view").contains(a)&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))return;
  render();
}
window.addEventListener("hashchange",()=>{window.scrollTo(0,0);render()});
document.addEventListener("keydown",e=>{const m={F2:"sale",F3:"purchase",F4:"items"}[e.key];if(m){e.preventDefault();location.hash="#"+m}});

/* ---- theme ---- */
function applyTheme(t){document.documentElement.setAttribute("data-theme",t);$("#btnTheme").textContent=t==="dark"?"الوضع النهاري":"الوضع الليلي"}
(function(){let t=null;try{t=localStorage.getItem("ph-theme")}catch(e){}
  if(t==="dark"||t==="light")applyTheme(t);else if(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches)$("#btnTheme").textContent="الوضع النهاري";
  $("#btnTheme").onclick=()=>{const cur=document.documentElement.getAttribute("data-theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
    const n=cur==="dark"?"light":"dark";applyTheme(n);try{localStorage.setItem("ph-theme",n)}catch(e){}};
})();

/* ---- boot ---- */
async function startData(){ // called after a successful login or session resume
  S.ready=false;S.usersLoaded=false;
  store.reset();await store.start();
  const guard=setTimeout(()=>{if(!S.ready){S.ready=true;render()}},20000);
  const first={};
  const mark=k=>{first[k]=1;if(first.products&&first.sales&&first.meta&&!S.ready){S.ready=true;clearTimeout(guard);render()}else if(S.ready)refresh()};
  const w=(c,lim,ord)=>store.watch(c,lim,ord,l=>{if(c==="sales"||c==="purchases"){S[c+"All"]=l;l=l.filter(x=>!x.void)}S[c]=l;mark(c)});
  w("products",0,null);w("sales",3000,"ts");w("purchases",500,"ts");w("counts",30,"ts");w("parties",0,null);
  w("ledger",3000,"ts");w("sreturns",500,"ts");w("preturns",500,"ts");w("writeoffs",500,"ts");w("expenses",1000,"ts");w("shifts",300,"ts");
  if(isAdmin())w("audit",1000,"ts");
  store.watch("meta",0,null,l=>{const s=l.find(x=>x.id==="settings");if(s){const{id,...o}=s;S.settings={...DEF_SET,...o}}mark("meta")});
}
async function boot(){
  store=makeStore();render();
  try{const r=await apiCall("GET","/api/me");me=r.user;usersReady=true;await startData();enterApp()}
  catch(e){me=null;usersReady=true;render()}
}
window.addEventListener("unhandledrejection",e=>{
  e.preventDefault();const err=e.reason;
  if(me&&err&&err.status!==401){toast(err.message||"تعذر تنفيذ العملية");setTimeout(render,0)} // re-enables buttons after a failed save
});
boot();
