/* ---------- audit log, void/edit invoices, purchase printing, protection ---------- */
KIND.void="إلغاء فاتورة";
function audit(act,detail,ref){
  try{store.save("audit",uid(),{ts:Date.now(),by:me?me.name:"",act,detail:detail||"",ref:String(ref||"")}).catch(()=>{})}catch(e){}
}
const nextNo=(rows,min)=>rows.reduce((m,x)=>Math.max(m,num(x.no)),min)+1;

/* small confirm dialog with optional reason */
function askModal(title,msg,okText,onOk,withReason){
  openModal(`<h2>${esc(title)}</h2><p>${msg}</p>${withReason?`<label>السبب (اختياري)<input id="aqWhy"></label>`:""}
   <p id="aqErr" class="lgerr"></p><div class="row" style="margin-top:8px"><button class="pri dng" id="aqOk" type="button">${esc(okText)}</button><button id="aqNo" type="button">تراجع</button></div>`);
  $("#aqNo").onclick=closeModal;
  $("#aqOk").onclick=async()=>{$("#aqOk").disabled=true;try{await onOk(withReason?$("#aqWhy").value.trim():"")}catch(e){$("#aqErr").textContent=e.message||"تعذر التنفيذ";$("#aqOk").disabled=false}};
}
async function addBack(pid,qBox,tag){
  const p=S.products.find(x=>x.id===pid);if(!p)return;
  const{id,...o}=p;const b=(p.batches||[]).map(z=>({...z}));const q=rnd(p,qBox);
  const h=b.find(z=>z.no===tag&&!z.exp);if(h)h.qty=+(num(h.qty)+q).toFixed(6);else b.push({no:tag,exp:"",qty:q,cost:num(p.cost)});
  await store.save("products",pid,{...o,batches:b});
}
async function voidSale(s,why){
  if(s.void)throw new Error("الفاتورة ملغاة بالفعل");
  if(S.sreturns.some(r=>String(r.saleNo)===String(s.no)))throw new Error("لا يمكن إلغاء فاتورة لها مرتجعات");
  const need={};s.items.forEach(i=>{need[i.pid]=(need[i.pid]||0)+num(i.qty)*(num(i.r)||1)});
  for(const pid in need){const a=allocBt(s.items.filter(i=>i.pid===pid),0,need[pid]);await putBack(pid,a.list,a.rest,"إلغاء فاتورة")}
  const rem=num(s.total)-num(s.paid??s.total);
  if(s.partyId&&rem>0)await ledgerAdd(s.partyId,"void",-rem,"إلغاء فاتورة بيع "+s.no,s.no);
  const{id,...row}=s;
  await store.save("sales",s.id,{...row,void:true,voidTs:Date.now(),voidBy:me?me.name:"",voidWhy:why||""});
  audit("إلغاء فاتورة بيع","فاتورة "+s.no+" بقيمة "+money(s.total)+(why?" — "+why:""),s.no);
}
function editSale(s){
  askModal("تعديل فاتورة بيع "+s.no,"سيتم إلغاء الفاتورة الأصلية وإرجاع كمياتها للمخزون، ثم تُفتح بنفس رقمها في نقطة البيع لتعدّلها وتحفظها من جديد.","إلغاء الأصل وفتح للتعديل",async why=>{
    await voidSale(s,why||"تعديل");
    const c={...newCart(),keepNo:s.no,customer:s.customer||"",method:s.method||"نقدي",discount:num(s.discount),paid:s.method==="آجل"?String(num(s.paid)):"",
      lines:s.items.map(i=>{const p=S.products.find(x=>x.id===i.pid);const ui=p?Math.max(0,unitsOf(p).findIndex(u=>u.n===i.u)):0;
        return{pid:i.pid,name:i.name,price:num(i.price),qty:num(i.qty),cost:num(i.cost),ui,u:i.u||"",r:num(i.r)||1,pk:i.pk||0}})};
    carts.push(c);cartOpen(carts.length-1);closeModal();location.hash="#sale";toast("افتحت الفاتورة للتعديل");
  },true);
}
function voidSaleDialog(s){
  askModal("إلغاء فاتورة بيع "+s.no,`سيتم إرجاع الكميات للمخزون${s.method==="آجل"?" وعكس المبلغ المسجل على العميل":""}. تبقى الفاتورة في السجل بعلامة «ملغاة».`,"تأكيد الإلغاء",async why=>{
    await voidSale(s,why);closeModal();toast("تم إلغاء الفاتورة")},true);
}
async function voidPurchase(x,why){
  if(x.void)throw new Error("الفاتورة ملغاة بالفعل");
  const short=[];
  const byP={};(x.items||[]).forEach(l=>{(byP[l.pid]=byP[l.pid]||[]).push(l)});
  for(const pid in byP){
    const p=S.products.find(q=>q.id===pid);if(!p)continue;
    let batches=(p.batches||[]).map(z=>({...z})),left=0;
    for(const l of byP[pid]){
      let q=rnd(p,num(l.qty)*(num(l.r)||1));
      const h=batches.find(b=>(b.no||"")===(l.batch||"")&&(b.exp||"")===(l.exp||""));
      if(h){const t=Math.min(num(h.qty),q);h.qty=+(num(h.qty)-t).toFixed(6);q-=t}
      left+=q;
    }
    if(left>1e-6){const have=batches.reduce((a,b)=>a+num(b.qty),0);if(have<left-1e-6)short.push(p.name);batches=deductAny(batches,Math.min(left,have))}
    batches=batches.filter(b=>num(b.qty)>1e-6);
    const{id,...o}=p;await store.save("products",pid,{...o,batches});
  }
  const rem=num(x.total)-num(x.paid??x.total);
  if(x.partyId&&rem>0)await ledgerAdd(x.partyId,"void",-rem,"إلغاء فاتورة شراء "+(x.invNo||x.no),x.no);
  const{id,...row}=x;
  await store.save("purchases",x.id,{...row,void:true,voidTs:Date.now(),voidBy:me?me.name:"",voidWhy:why||""});
  audit("إلغاء فاتورة شراء","فاتورة شراء "+x.no+" بقيمة "+money(x.total)+(why?" — "+why:"")+(short.length?" · نقص مخزون: "+short.join("، "):""),x.no);
  return short;
}
function voidPurchaseDialog(x,edit){
  askModal((edit?"تعديل":"إلغاء")+" فاتورة شراء "+x.no,"سيُخصم ما أُدخل من هذه الفاتورة من المخزون"+(x.partyId?" ويُعكس المتبقي على المورد":"")+". إن كان بعض الكمية قد بيع فسيُخصم المتاح فقط."+(edit?" ثم تُفتح الفاتورة للتعديل بنفس رقمها.":""),edit?"إلغاء الأصل وفتح للتعديل":"تأكيد الإلغاء",async why=>{
    const short=await voidPurchase(x,why||(edit?"تعديل":""));
    if(edit){
      purs.push({...newPur(),keepNo:x.no,supplier:x.supplier||"",invNo:x.invNo||"",date:x.date||today(),paid:String(num(x.paid??x.total)),lines:(x.items||[]).map(l=>({...l}))});
      purOpen(purs.length-1);closeModal();location.hash="#purchase";
    }else closeModal();
    toast(short.length?"تم الإلغاء، ولكن الكمية المتاحة أقل من المُدخلة في: "+short.join("، "):"تم تنفيذ الإجراء");
  },true);
}

/* ---------- purchase invoice: view, print, labels ---------- */
function purchaseBody(x){
  const st=S.settings,rem=num(x.total)-num(x.paid??x.total);
  return `<h4>${esc(st.name||"صيدلية")}</h4><p><b>فاتورة شراء رقم ${x.no}</b>${x.invNo?" · فاتورة المورد: "+esc(x.invNo):""}</p>
  <p>${esc(x.date||"")} · المورد: ${esc(x.supplier||"-")}</p>
  <table><tr><th>الصنف</th><th class="n">الكمية</th><th class="n">السعر</th><th class="c-x">تشغيلة</th><th class="c-x">الانتهاء</th><th class="n">الإجمالي</th></tr>
  ${(x.items||[]).map(i=>`<tr><td style="white-space:normal">${esc(i.name)}</td><td class="n">${i.qty}${i.pk?" "+esc(i.u):""}</td><td class="n">${money(i.cost)}</td><td class="c-x">${esc(i.batch||"-")}</td><td class="c-x">${esc(i.exp||"-")}</td><td class="n">${money(i.qty*i.cost)}</td></tr>`).join("")}</table>
  <div style="margin-top:10px"><div class="tot big"><span>الإجمالي</span><span>${money(x.total)} ${CUR}</span></div>
  <div class="tot"><span>المدفوع</span><span>${money(x.paid??x.total)}</span></div>${rem>0?`<div class="tot"><span>المتبقي للمورد</span><span>${money(rem)}</span></div>`:""}</div>`;
}
const printPurchase=(x,paper)=>saveFile("purchase-"+x.no+".html",printDoc("فاتورة-شراء-"+x.no,invCss(paper||paperPref()),purchaseBody(x)));
const labelsFile=(entries,name)=>saveFile(name||("barcodes-"+today()+".html"),labelsDoc(entries));
const labelEntries=x=>{const m={};(x.items||[]).forEach(l=>{const p=S.products.find(q=>q.id===l.pid);if(!p||!p.barcode)return;m[l.pid]=m[l.pid]||{p,n:0};m[l.pid].n+=Math.max(1,Math.ceil(num(l.qty)*(num(l.r)||1)-1e-9))});return Object.values(m)};
const paperSel=()=>`<label class="f1">ورق الفاتورة<select id="pvPaper"><option value="auto">تلقائي (حسب الطابعة)</option><option value="a4">A4</option><option value="a5">A5</option><option value="r80">إيصال حراري 80 مم</option></select></label>`;
const wirePaper=()=>{const e=$("#pvPaper");if(!e)return;e.value=paperPref();e.onchange=()=>{try{localStorage.setItem("ph-paper",e.value)}catch(x){}}};
/* the labels to print for a purchase: one per purchased pack by default, the counts can be edited before printing */
function purchaseLabelsDialog(x,back){
  const rows=labelEntries(x),noBc=(x.items||[]).filter(l=>{const p=S.products.find(q=>q.id===l.pid);return !p||!p.barcode});
  openModal(`<div class="bar" style="margin:0"><h2>طباعة باركود فاتورة الشراء ${x.no}</h2><button type="button" id="lbX">${back?"رجوع":"إغلاق"}</button></div>
   ${rows.length?`<div class="tw"><table><tr><th>الصنف</th><th>الباركود</th><th class="n">عدد الملصقات</th></tr>
   ${rows.map((r,i)=>`<tr><td>${esc(r.p.name)}</td><td class="mono">${esc(r.p.barcode)}</td><td class="n"><input data-ln="${i}" type="number" min="0" max="500" value="${r.n}" style="width:80px"></td></tr>`).join("")}</table></div>`
   :`<div class="card empty">لا توجد أصناف لها باركود في هذه الفاتورة.</div>`}
   ${noBc.length?`<p class="note">أصناف بدون باركود (لن تُطبع لها ملصقات): ${noBc.map(l=>esc(l.name)).join("، ")}. أضف لها باركودا من «المخزون ← الأصناف».</p>`:""}
   <div class="row" style="margin-top:12px"><label class="f1">طريقة الطباعة<select id="lbMode"><option value="auto">تلقائي حسب الطابعة (موصى به)</option><option value="roll">رول ملصقات بالمقاس المختار</option><option value="a4">ورقة A4 (شبكة ملصقات)</option></select></label>
    <label class="f1">مقاس الملصق (مم)<select id="lbSize">${["50x30","38x25","60x40","40x20","70x40"].map(z=>`<option value="${z}">${z.replace("x"," × ")}</option>`).join("")}</select></label>
    <label style="flex-direction:row;align-items:center;gap:8px;flex:0 0 auto"><input id="lbPrice" type="checkbox" style="width:auto"> إظهار السعر</label></div>
   <div class="row" style="margin-top:12px"><button class="pri" id="lbGo" type="button" ${rows.length&&downloads?"":"disabled"}>طباعة الملصقات</button></div>
   <p class="note">في الوضع التلقائي تُطبع كل ملصقة بمقاس الورق المختار في نافذة الطباعة. تأكد أن مقاس الورق في إعدادات طابعة الباركود هو مقاس الملصق.</p>`);
  $("#lbMode").value=bcOpt.mode;$("#lbSize").value=bcOpt.size;$("#lbPrice").checked=bcOpt.price;
  $("#lbX").onclick=()=>back?back():closeModal();
  $("#lbGo").onclick=()=>{
    bcOpt={mode:$("#lbMode").value,size:$("#lbSize").value,price:$("#lbPrice").checked};
    const e=rows.map((r,i)=>({p:r.p,n:Math.min(500,Math.max(0,Math.floor(num($(`[data-ln="${i}"]`).value))))})).filter(r=>r.n>0);
    if(!e.length){toast("حدد عدد الملصقات");return}
    labelsFile(e,"barcodes-purchase-"+x.no+".html");
  };
}
/* shown right after a purchase invoice is saved */
function purchaseDone(x){
  const nBc=labelEntries(x).reduce((a,r)=>a+r.n,0);
  const show=()=>{
    openModal(`<h2 style="margin-top:0">تم حفظ فاتورة الشراء رقم ${x.no}</h2>
     <p class="note" style="margin-top:0">تم تحديث المخزون. اختر ما تريد:</p>
     <div class="row">${paperSel()}</div>
     <div class="row" style="margin-top:12px"><button class="pri" id="pdPrint" type="button" ${downloads?"":"disabled"}>طباعة الفاتورة</button>
      <button id="pdPdf" type="button" ${downloads?"":"disabled"}>حفظ كملف PDF</button>
      <button id="pdLab" type="button" ${downloads&&nBc?"":"disabled"}>طباعة الباركود (${nBc} ملصق)</button>
      <button id="pdX" type="button">إغلاق</button></div>
     <p class="note">تفتح الفاتورة في تبويب جديد مع نافذة الطباعة. لحفظها PDF اختر «حفظ كـ PDF» (Save as PDF) كطابعة في تلك النافذة.</p>`);
    wirePaper();
    $("#pdPrint").onclick=()=>printPurchase(x,$("#pvPaper").value);
    $("#pdPdf").onclick=()=>{toast("اختر «حفظ كـ PDF» من قائمة الطابعات");printPurchase(x,$("#pvPaper").value)};
    $("#pdLab").onclick=()=>purchaseLabelsDialog(x,show);
    $("#pdX").onclick=closeModal;
  };
  show();
}
function showPurchase(x){
  const can2=canDo("voidInv")&&!x.void;
  openModal(`<div class="bar" style="margin:0"><h2>فاتورة شراء ${x.no}${x.void?" · ملغاة":""}</h2><button type="button" id="mX">إغلاق</button></div>
   ${x.void?`<div class="warnbox">ملغاة بواسطة ${esc(x.voidBy||"-")} ${x.voidTs?fmtDate(x.voidTs):""}${x.voidWhy?" — "+esc(x.voidWhy):""}</div>`:""}
   <div class="inv">${purchaseBody(x)}</div>
   <div class="row" style="margin-top:10px">${paperSel()}</div>
   <div class="row" style="margin-top:10px"><button class="pri" id="pvPrint" type="button" ${downloads?"":"disabled"}>طباعة الفاتورة</button>
    <button id="pvPdf" type="button" ${downloads?"":"disabled"}>حفظ كملف PDF</button>
    <button id="pvLab" type="button" ${downloads?"":"disabled"}>طباعة باركود الأصناف</button>
    ${can2?`<button id="pvEdit" type="button">تعديل</button><button class="dng" id="pvVoid" type="button">إلغاء الفاتورة</button>`:""}</div>
   <p class="note">تفتح الفاتورة في تبويب جديد مع نافذة الطباعة. لحفظها PDF اختر «حفظ كـ PDF» كطابعة.</p>`,true);
  wirePaper();
  $("#mX").onclick=closeModal;$("#pvPrint").onclick=()=>printPurchase(x,$("#pvPaper").value);
  $("#pvPdf").onclick=()=>{toast("اختر «حفظ كـ PDF» من قائمة الطابعات");printPurchase(x,$("#pvPaper").value)};
  $("#pvLab").onclick=()=>purchaseLabelsDialog(x,()=>showPurchase(x));
  if(can2){$("#pvEdit").onclick=()=>voidPurchaseDialog(x,true);$("#pvVoid").onclick=()=>voidPurchaseDialog(x,false)}
}

/* ---------- protection: auto-lock, encrypted backup, backup reminder ---------- */
let lastAct=Date.now();
["mousemove","keydown","click","touchstart","scroll"].forEach(ev=>document.addEventListener(ev,()=>{lastAct=Date.now()},{passive:true}));
setInterval(()=>{
  const m=num(S.settings.lockMin);if(!me||!m)return;
  if(Date.now()-lastAct>m*60000){audit("قفل تلقائي","انتهت مدة عدم النشاط");logout();toast("تم قفل النظام لعدم النشاط")}
},15000);
const b64=u=>{let s="";u.forEach(c=>s+=String.fromCharCode(c));return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function aesKey(pw,salt){
  const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:150000,hash:"SHA-256"},k,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function encJson(text,pw){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},await aesKey(pw,salt),new TextEncoder().encode(text)));
  return JSON.stringify({app:"pharmacy-enc",v:1,at:new Date().toISOString(),salt:b64(salt),iv:b64(iv),ct:b64(ct)});
}
async function decJson(o,pw){
  const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(o.iv)},await aesKey(pw,unb64(o.salt)),unb64(o.ct));
  return new TextDecoder().decode(pt);
}
let bkData=null,bkEnc=null;
V.backup=()=>{
  const cnt=bkData?Object.values(bkData.data).reduce((a,l)=>a+l.length,0):0;
  const lb=S.settings.lastBackup;
  $("#view").innerHTML=`<div class="two"><div class="card"><h3>تصدير نسخة احتياطية</h3>
    <p class="note">ملف واحد يحتوي الأصناف والمخزون وكل الفواتير والمرتجعات والمصروفات والورديات وسجل العمليات وحسابات العملاء والموردين والإعدادات (بدون المستخدمين). ${lb?"آخر نسخة: "+esc(String(lb).slice(0,10)):"لم تُؤخذ نسخة بعد."}</p>
    <label>كلمة سر لتشفير الملف (اختياري، ويُنصح بها)<input id="bkPw" type="password" autocomplete="new-password"></label>
    <p class="note" style="margin:4px 0 8px">إن نسيت كلمة السر لا يمكن فتح الملف نهائيا.</p>
    <button class="pri" id="bkOut" type="button" ${downloads?"":"disabled"}>تنزيل النسخة الاحتياطية</button><span id="bkMsg" class="note"></span></div>
   <div class="card"><h3>استعادة من نسخة</h3>
    <p class="note">تُضاف بيانات الملف وتستبدل المستندات المطابقة لها. لا يُحذف شيء من البيانات الحالية.</p>
    <label>ملف النسخة (.json)<input id="bkFile" type="file" accept=".json,application/json"></label>
    ${bkEnc?`<div class="row" style="margin-top:8px"><label class="f1">كلمة سر الملف<input id="bkPw2" type="password"></label><button class="pri" id="bkDec" type="button">فك التشفير</button></div><p id="bkErr" class="lgerr"></p>`:""}
    ${bkData?`<p style="margin:10px 0 0">الملف يحتوي <b>${cnt}</b> مستند بتاريخ ${esc((bkData.at||"").slice(0,10))}.</p>
      <div class="row" style="margin-top:8px"><button class="pri" id="bkGo" type="button">استعادة الآن</button><button id="bkNo" type="button">إلغاء</button></div><p id="bkProg" class="note"></p>`:""}</div></div>`;
  $("#bkOut").onclick=async()=>{
    $("#bkOut").disabled=true;$("#bkMsg").textContent=" جاري التجميع…";
    try{const data={};for(const c of COLLS)data[c]=await store.all(c);
      let txt=JSON.stringify({app:"pharmacy",v:1,at:new Date().toISOString(),data});const pw=$("#bkPw").value;
      if(pw)txt=await encJson(txt,pw);
      const r=await downloads.save({filename:"pharmacy-backup-"+today()+(pw?"-enc":"")+".json",data:txt});
      if(r.status==="saved"){await store.save("meta","settings",{...S.settings,lastBackup:new Date().toISOString()});audit("نسخة احتياطية",pw?"مشفرة":"غير مشفرة");toast("تم حفظ النسخة")}
    }catch(e){if(!(e&&e.code==="declined"))toast("تعذر إنشاء النسخة")}
    $("#bkOut").disabled=false;$("#bkMsg").textContent="";
  };
  const accept=o=>{if(o.app!=="pharmacy"||!o.data)throw 0;
    const d={};COLLS.forEach(c=>{if(Array.isArray(o.data[c]))d[c]=o.data[c].filter(x=>x&&x.id&&x.data&&typeof x.data==="object")});bkData={at:o.at,data:d};bkEnc=null};
  $("#bkFile").onchange=e=>{
    const f=e.target.files[0];if(!f)return;const r=new FileReader();
    r.onload=()=>{try{const o=JSON.parse(r.result);
      if(o.app==="pharmacy-enc"){bkEnc=o;bkData=null;V.backup();return}
      accept(o);V.backup()}catch(x){bkData=null;bkEnc=null;toast("الملف ليس نسخة صالحة من هذا النظام");V.backup()}};
    r.readAsText(f);
  };
  const dec=$("#bkDec");if(dec)dec.onclick=async()=>{
    try{accept(JSON.parse(await decJson(bkEnc,$("#bkPw2").value)));V.backup()}catch(e){$("#bkErr").textContent="كلمة السر غير صحيحة أو الملف تالف"}};
  const no=$("#bkNo");if(no)no.onclick=()=>{bkData=null;V.backup()};
  const go=$("#bkGo");if(go)go.onclick=async()=>{
    go.disabled=true;let n=0;const tot=cnt;
    for(const c of COLLS)for(let i=0;i<(bkData.data[c]||[]).length;i+=100){const part=bkData.data[c].slice(i,i+100);await store.bulk(c,part);n+=part.length;$("#bkProg").textContent=`تمت استعادة ${n} من ${tot}`}
    audit("استعادة نسخة احتياطية",n+" مستند");bkData=null;toast("تمت استعادة "+n+" مستند");V.backup();
  };
};
function backupNudge(){
  if(!me||me.role!=="admin")return;const lb=S.settings.lastBackup;
  const days=lb?(Date.now()-new Date(lb).getTime())/864e5:999;
  if(days>7)toast(lb?"مرّ أكثر من أسبوع على آخر نسخة احتياطية. خذ نسخة من «الإعدادات ← النسخ الاحتياطي»":"لم تأخذ نسخة احتياطية بعد. يُنصح بأخذ واحدة من «الإعدادات»");
}
{const _e=enterApp;enterApp=function(){_e.apply(this,arguments);lastAct=Date.now();setTimeout(backupNudge,2500)}}
