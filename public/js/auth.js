/* ---------- login, users and permissions ---------- */
let me=null,usersReady=false;
const PERM_TABS=[
  ["الرئيسية",[["dashboard","ملخص اليوم"]]],
  ["المبيعات",[["sale","نقطة البيع"],["invoices","فواتير البيع"],["sreturn","مرتجع بيع"],["shift","الوردية والصندوق"]]],
  ["المشتريات",[["purchase","فاتورة شراء"],["plist","سجل المشتريات"],["preturn","مرتجع شراء"]]],
  ["المخزون",[["items","الأصناف"],["catalog","الدليل الدوائي"],["stocktake","الجرد"],["expiry","الصلاحيات"],["barcode","الباركود"],["alt","بدائل الدواء"],["short","النواقص"]]],
  ["الحسابات",[["customers","العملاء"],["suppliers","الموردون"],["expenses","المصروفات"]]],
  ["التقارير",[["rep-sales","المبيعات والأرباح"],["rep-stock","تقرير المخزون"],["rep-profit","الأرباح الشهرية والسنوية"]]]
];
const PERM_ACTS=[["discount","منح خصم في البيع"],["editItems","إضافة الأصناف وتعديلها وحذفها"],["writeoff","إعدام المنتهي"],["pay","تسجيل دفعات العملاء والموردين"],["voidInv","إلغاء وتعديل الفواتير والمصروفات"]];
const PRESETS={
  cashier:{label:"كاشير",tabs:["sale","invoices","sreturn","items","shift","alt"],acts:[]},
  stock:{label:"أمين مخزن",tabs:["purchase","plist","preturn","items","catalog","stocktake","expiry","barcode","alt","short"],acts:["editItems","writeoff"]},
  acct:{label:"محاسب",tabs:["dashboard","invoices","plist","customers","suppliers","rep-sales","rep-stock","rep-profit","expenses","short"],acts:["pay"]}
};
const ADMIN_ONLY=["settings","users","backup","audit"];
const isAdmin=()=>!!me&&me.role==="admin";
const can=t=>!!me&&(t==="welcome"||me.role==="admin"||(!ADMIN_ONLY.includes(t)&&!!(me.perms&&me.perms.tabs&&me.perms.tabs[t])));
const canDo=a=>!!me&&(me.role==="admin"||!!(me.perms&&me.perms.acts&&me.perms.acts[a]));

/* ---- session ---- */
function onSessionLost(){
  if(!me)return;
  me=null;closeModal();toast("انتهت الجلسة. سجّل الدخول من جديد");render();
}
async function doLogin(un,pw){
  try{const r=await apiCall("POST","/api/login",{username:un,password:pw});me=r.user;return null}
  catch(e){return e.message}
}

/* ---- login screen ---- */
function showLogin(){
  document.body.classList.add("locked");$("#login").hidden=false;
  $("#lgBtn").disabled=!usersReady;$("#lgBtn").textContent=usersReady?"دخول":"جاري التحميل…";
  if(usersReady&&document.activeElement===document.body)$("#lgUser").focus();
}
$("#fLogin").onsubmit=async e=>{
  e.preventDefault();const b=$("#lgBtn");b.disabled=true;
  const err=await doLogin($("#lgUser").value,$("#lgPass").value);
  b.disabled=false;
  if(err){$("#lgErr").textContent=err;$("#lgPass").value="";$("#lgPass").focus();return}
  $("#lgErr").textContent="";$("#lgPass").value="";
  await startData();location.hash="#welcome";enterApp();
};
function enterApp(){
  document.body.classList.remove("locked");$("#login").hidden=true;
  const h=(location.hash||"").slice(1);
  if(!TABS[h]||!can(h)){const f=firstAllowed();if(f&&location.hash!=="#"+f){location.hash="#"+f;return}}
  render();
}
async function logout(){
  try{await apiCall("POST","/api/logout",{})}catch(e){}
  me=null;S.ready=false;store.reset();closeModal();render();
}
$("#btnOut").onclick=logout;
$("#btnAcct").onclick=()=>pwForm(me.id,true);

/* ---- change own password ---- */
function pwForm(uid2,self){
  openModal(`<h2>حسابي</h2>
  <p class="note">المستخدم: <span class="mono">${esc(me.username)}</span></p>
  <form id="fPw" class="grid" style="margin-top:10px">
   <label>كلمة المرور الحالية<input id="pwOld" type="password" autocomplete="current-password" required></label>
   <label>كلمة المرور الجديدة (4 أحرف على الأقل)<input id="pwNew" type="password" autocomplete="new-password" minlength="4" required></label>
   <label>تأكيد كلمة المرور<input id="pwNew2" type="password" autocomplete="new-password" minlength="4" required></label>
   <p id="pwErr" class="lgerr"></p>
   <div class="row"><button class="pri" type="submit">حفظ</button><button type="button" id="pwX">إلغاء</button></div></form>`);
  $("#pwX").onclick=closeModal;
  $("#fPw").onsubmit=async e=>{
    e.preventDefault();const n1=$("#pwNew").value;
    if(n1!==$("#pwNew2").value){$("#pwErr").textContent="كلمتا المرور غير متطابقتين";return}
    try{await apiCall("POST","/api/password",{oldPassword:$("#pwOld").value,newPassword:n1})}catch(err){$("#pwErr").textContent=err.message;return}
    me.mustChange=false;closeModal();toast("تم تغيير كلمة المرور");
  };
}

/* ---- users management (admin only) ---- */
async function loadUsers(){S.users=(await apiCall("GET","/api/users")).users}
V.users=async()=>{
  if(!S.usersLoaded){$("#view").innerHTML=`<div class="card empty">جارٍ التحميل…</div>`;try{await loadUsers();S.usersLoaded=true}catch(e){toast(e.message);return}if(curTab()!=="users")return}
  const l=[...S.users].sort((a,b)=>(a.role==="admin"?-1:1)-(b.role==="admin"?-1:1)||(a.name||"").localeCompare(b.name||"","ar"));
  const cnt=u=>u.role==="admin"?"كل الصلاحيات":Object.values(u.perms?.tabs||{}).filter(Boolean).length+" قسم";
  $("#view").innerHTML=`<div class="tbar"><button class="pri" id="uNew" type="button">+ مستخدم جديد</button></div>
  <div class="tw"><table><tr><th>الاسم</th><th>اسم المستخدم</th><th>الدور</th><th>الصلاحيات</th><th>الحالة</th><th></th></tr>
  ${l.map(u=>`<tr><td><b>${esc(u.name)}</b></td><td class="mono">${esc(u.username)}</td><td>${u.role==="admin"?"مدير":"مستخدم"}</td><td>${cnt(u)}</td>
   <td><span class="pill ${u.active===false?"p-bad":"p-ok"}">${u.active===false?"موقوف":"نشط"}</span></td>
   <td><button class="sm" data-u="${u.id}" type="button">تعديل</button></td></tr>`).join("")}</table></div>
  <p class="note">المدير وحده يرى هذه الصفحة وينشئ الحسابات ويحدد صلاحياتها. كل مستخدم يرى في القائمة الأقسام المسموحة له فقط.</p>`;
  $("#uNew").onclick=()=>userForm();
  $$("[data-u]").forEach(b=>b.onclick=()=>userForm(S.users.find(x=>x.id===b.dataset.u)));
};
function userForm(u){
  const isNew=!u,adm=u&&u.role==="admin";const P=u?.perms||{tabs:{},acts:{}};
  openModal(`<h2>${isNew?"مستخدم جديد":"تعديل المستخدم"}</h2>
  <form id="fUser" class="grid" style="margin-top:10px">
   <div class="row"><label class="f1">الاسم<input id="uName" required value="${esc(u?.name)}"></label>
    <label class="f1">اسم المستخدم (إنجليزي)<input id="uUser" class="mono" required pattern="[a-zA-Z0-9._\\-]{3,30}" ${isNew?"":"readonly"} value="${esc(u?.username)}"></label></div>
   <label>${isNew?"كلمة المرور (4 أحرف على الأقل)":"كلمة مرور جديدة (اتركها فارغة بدون تغيير)"}<input id="uPass" type="password" autocomplete="new-password" minlength="4" ${isNew?"required":""}></label>
   ${adm?`<p class="note">حساب المدير له كل الصلاحيات ولا يمكن إيقافه أو حذفه.</p>`:`
   <label style="flex-direction:row;align-items:center;gap:8px"><input id="uAct" type="checkbox" style="width:auto" ${u&&u.active===false?"":"checked"}> الحساب نشط</label>
   <div><div class="note" style="margin-bottom:6px">قوالب جاهزة</div><div class="chips">${Object.entries(PRESETS).map(([k,p])=>`<button class="chip" type="button" data-pre="${k}">${p.label}</button>`).join("")}<button class="chip" type="button" data-pre="none">إلغاء الكل</button></div></div>
   <div><h3>الأقسام المسموحة</h3>${PERM_TABS.map(([g,ts])=>`<div style="margin-bottom:8px"><b style="font-size:13px">${g}</b><div class="row" style="gap:6px 18px;margin-top:4px">
     ${ts.map(([id,l])=>`<label style="flex-direction:row;align-items:center;gap:6px;color:var(--ink)"><input type="checkbox" style="width:auto" data-pt="${id}" ${P.tabs&&P.tabs[id]?"checked":""}> ${l}</label>`).join("")}</div></div>`).join("")}</div>
   <div><h3>إجراءات خاصة</h3><div class="row" style="gap:6px 18px">${PERM_ACTS.map(([id,l])=>`<label style="flex-direction:row;align-items:center;gap:6px;color:var(--ink)"><input type="checkbox" style="width:auto" data-pa="${id}" ${P.acts&&P.acts[id]?"checked":""}> ${l}</label>`).join("")}</div></div>`}
   <p id="uErr" class="lgerr"></p>
   <div class="row" style="justify-content:space-between"><div class="row"><button class="pri" type="submit">حفظ</button><button type="button" id="uX">إلغاء</button></div>
    ${isNew||adm?"":`<button type="button" class="dng" id="uDel">حذف المستخدم</button>`}</div>
  </form>`,true);
  $("#uX").onclick=closeModal;
  $$("[data-pre]").forEach(b=>b.onclick=()=>{
    const p=PRESETS[b.dataset.pre]||{tabs:[],acts:[]};
    $$("[data-pt]").forEach(c=>c.checked=p.tabs.includes(c.dataset.pt));$$("[data-pa]").forEach(c=>c.checked=p.acts.includes(c.dataset.pa));
  });
  const d=$("#uDel");if(d)d.onclick=()=>{
    d.outerHTML=`<span class="row"><span class="note">سيتم حذف الحساب نهائيا.</span><button type="button" class="dng" id="uDel2">تأكيد الحذف</button></span>`;
    $("#uDel2").onclick=async()=>{try{await apiCall("DELETE","/api/users/"+u.id);await loadUsers();closeModal();toast("تم حذف المستخدم")}catch(e){toast(e.message)}};
  };
  $("#fUser").onsubmit=async e=>{
    e.preventDefault();const err=$("#uErr");err.textContent="";
    const un=$("#uUser").value.trim().toLowerCase(),pw=$("#uPass").value;
    if(isNew&&S.users.some(x=>x.username===un)){err.textContent="اسم المستخدم مستخدم بالفعل";return}
    const perms={tabs:{},acts:{}};
    $$("[data-pt]").forEach(c=>{if(c.checked)perms.tabs[c.dataset.pt]=true});$$("[data-pa]").forEach(c=>{if(c.checked)perms.acts[c.dataset.pa]=true});
    const body={name:$("#uName").value.trim(),perms,active:adm?true:$("#uAct").checked};
    if(isNew)body.username=un;else body.id=u.id;
    if(pw)body.password=pw;
    try{await apiCall("POST","/api/users",body);await loadUsers()}catch(ex){err.textContent=ex.message;return}
    closeModal();toast(isNew?"تم إنشاء المستخدم":"تم حفظ التعديلات");
  };
}
