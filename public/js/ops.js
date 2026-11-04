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
  <table><tr><th>الصنف</th><th class="n">الكمية</th><th class="n">السعر</th><th>تشغيلة</th><th>الانتهاء</th><th class="n">الإجمالي</th></tr>
  ${(x.items||[]).map(i=>`<tr><td style="white-space:normal">${esc(i.name)}</td><td class="n">${i.qty}${i.pk?" "+esc(i.u):""}</td><td class="n">${money(i.cost)}</td><td>${esc(i.batch||"-")}</td><td>${esc(i.exp||"-")}</td><td class="n">${money(i.qty*i.cost)}</td></tr>`).join("")}</table>
  <div style="margin-top:10px"><div class="tot big"><span>الإجمالي</span><span>${money(x.total)} ${CUR}</span></div>
  <div class="tot"><span>المدفوع</span><span>${money(x.paid??x.total)}</span></div>${rem>0?`<div class="tot"><span>المتبقي للمورد</span><span>${money(rem)}</span></div>`:""}</div>`;
}
const printPurchase=x=>saveFile("purchase-"+x.no+".html",printDoc("فاتورة شراء "+x.no,invCss("a4"),purchaseBody(x)));
function labelsFile(entries,name){ // entries: [{p,n}]
  const [w,h]=bcOpt.size.split("x").map(Number),items=[];
  entries.forEach(({p,n})=>{for(let k=0;k<Math.min(500,Math.max(1,n));k++)items.push(labelHtml(p,w,h,bcOpt.price))});
  const roll=bcOpt.mode==="roll";
  const css=`@page{size:${roll?w+"mm "+h+"mm":"A4"};margin:${roll?"0":"8mm"}}body{margin:0;font-family:Tahoma,Arial,sans-serif}
.lab{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;padding:1mm;${roll?"page-break-after:always;break-after:page;":"border:.2mm dashed #bbb;margin:0 2mm 2mm 0;"}}
.lab svg{max-width:100%;height:auto}.ln{font-size:9px;font-weight:bold;line-height:1.1;max-height:2.2em;overflow:hidden}.lp{font-size:9px}
${roll?"":".wrap{display:flex;flex-wrap:wrap}"}`;
  return saveFile(name||("barcodes-"+today()+".html"),printDoc("ملصقات الباركود",css,roll?items.join(""):`<div class="wrap">${items.join("")}</div>`));
}
const labelEntries=x=>{const m={};(x.items||[]).forEach(l=>{const p=S.products.find(q=>q.id===l.pid);if(!p||!p.barcode)return;m[l.pid]=m[l.pid]||{p,n:0};m[l.pid].n+=Math.max(1,Math.ceil(num(l.qty)*(num(l.r)||1)-1e-9))});return Object.values(m)};
function showPurchase(x){
  const can2=canDo("voidInv")&&!x.void;
  openModal(`<div class="bar" style="margin:0"><h2>فاتورة شراء ${x.no}${x.void?" · ملغاة":""}</h2><button type="button" id="mX">إغلاق</button></div>
   ${x.void?`<div class="warnbox">ملغاة بواسطة ${esc(x.voidBy||"-")} ${x.voidTs?fmtDate(x.voidTs):""}${x.voidWhy?" — "+esc(x.voidWhy):""}</div>`:""}
   <div class="inv">${purchaseBody(x)}</div>
   <div class="row" style="margin-top:10px"><button class="pri" id="pvPrint" type="button" ${downloads?"":"disabled"}>طباعة الفاتورة</button>
    <button id="pvLab" type="button" ${downloads?"":"disabled"}>طباعة باركود الأصناف</button>
    ${can2?`<button id="pvEdit" type="button">تعديل</button><button class="dng" id="pvVoid" type="button">إلغاء الفاتورة</button>`:""}</div>
   <p class="note">الطباعة تنزّل ملفا جاهزا؛ افتحه فتظهر نافذة الطباعة تلقائيا.</p>`,true);
  $("#mX").onclick=closeModal;$("#pvPrint").onclick=()=>printPurchase(x);
  $("#pvLab").onclick=()=>{const e=labelEntries(x);if(!e.length){toast("لا توجد أصناف بباركود");return}labelsFile(e,"barcodes-purchase-"+x.no+".html")};
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
