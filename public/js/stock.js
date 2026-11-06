let cnt={};
V.stocktake=()=>{
  const l=[...S.products].sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
  $("#view").innerHTML=`<div class="bar"><div><h2>الجرد</h2><p class="lead" style="margin:0">اكتب الكمية الفعلية على الرف. الأصناف المتروكة فارغة لا تتغير.</p></div>
   <div class="row"><button id="cFill" type="button">تعبئة بالكميات الحالية</button><button id="cCsv" type="button" ${downloads?"":"disabled"}>تصدير CSV</button>
   <button class="pri" id="cSave" type="button">حفظ الجرد وتسوية المخزون</button></div></div>
   <div class="row" style="margin-bottom:12px"><label class="f2">بحث<input id="cq" placeholder="اسم أو باركود"></label>
    <label class="f1" style="flex-direction:row;align-items:center;gap:8px;flex:0 0 auto"><input id="cDiff" type="checkbox" style="width:auto"> الفروق فقط</label></div>
   <div id="cTable"></div><h3 style="margin-top:22px">سجل الجرد</h3>
   ${S.counts.length?`<div class="tw"><table><tr><th>التاريخ</th><th class="n">أصناف تم جردها</th><th class="n">أصناف بها فروق</th></tr>
    ${S.counts.slice(0,10).map(c=>`<tr><td>${fmtDate(c.ts)}</td><td class="n">${c.lines.length}</td><td class="n">${c.lines.filter(x=>x.diff!==0).length}</td></tr>`).join("")}</table></div>`:`<div class="card empty">لم يتم إجراء جرد بعد</div>`}`;
  const sysU=p=>Math.round(qtyOf(p)*f0(p));
  const diffOf=p=>{const v=cnt[p.id];return v===undefined||v===""?null:Math.floor(num(v))-sysU(p)};
  const draw=()=>{
    const q=$("#cq").value.trim().toLowerCase(),only=$("#cDiff").checked;
    const rows=l.filter(p=>(!q||[p.name,p.barcode].join(" ").toLowerCase().includes(q))&&(!only||(diffOf(p)||0)!==0));
    $("#cTable").innerHTML=rows.length?`<div class="tw"><table><tr><th>الصنف</th><th>الباركود</th><th class="n">بالنظام</th><th>الفعلي</th><th class="n">الفرق</th></tr>
     ${rows.map(p=>`<tr><td>${esc(p.name)}</td><td class="mono">${esc(p.barcode)}</td><td class="n">${sysU(p)}${hasPk(p)?" "+esc(unitsOf(p).slice(-1)[0].n):""}</td>
      <td><input data-c="${p.id}" type="number" min="0" style="width:90px" value="${cnt[p.id]??""}"></td><td class="n" id="d-${p.id}">${dTxt(diffOf(p))}</td></tr>`).join("")}</table></div>`
     :`<div class="card empty">${l.length?"لا توجد نتائج":"لا توجد أصناف للجرد"}</div>`;
    $$("[data-c]").forEach(i=>i.oninput=()=>{cnt[i.dataset.c]=i.value;const p=S.products.find(x=>x.id===i.dataset.c);$("#d-"+p.id).innerHTML=dTxt(diffOf(p))});
  };
  const dTxt=d=>d===null?"-":d===0?`<span class="pill p-ok">0</span>`:`<span class="pill ${d<0?"p-bad":"p-warn"}">${d>0?"+":""}${d}</span>`;
  $("#cq").oninput=draw;$("#cDiff").onchange=draw;
  attachScan($("#cq"),c=>{$("#cq").value=c;draw()});
  $("#cFill").onclick=()=>{S.products.forEach(p=>{if(cnt[p.id]===undefined||cnt[p.id]==="")cnt[p.id]=String(sysU(p))});draw()};
  $("#cCsv").onclick=()=>{
    const rows=[["الصنف","الباركود","بالنظام","الفعلي","الفرق"],...l.map(p=>{const d=diffOf(p);return[p.name,p.barcode,sysU(p),cnt[p.id]??"",d===null?"":d]})];
    saveFile("stocktake-"+today()+".csv","﻿"+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n"));
  };
  $("#cSave").onclick=async()=>{
    const lines=l.filter(p=>diffOf(p)!==null).map(p=>({pid:p.id,name:p.name,system:sysU(p),counted:Math.floor(num(cnt[p.id])),diff:diffOf(p)}));
    if(!lines.length){toast("اكتب كمية فعلية لصنف واحد على الأقل");return}
    $("#cSave").disabled=true;
    for(const ln of lines){
      if(ln.diff===0)continue;
      const p=S.products.find(x=>x.id===ln.pid);const{id,...o}=p;let b;
      if(ln.diff<0)b=deductAny(p.batches,-ln.diff/f0(p));
      else{b=(p.batches||[]).map(x=>({...x}));const h=b.find(x=>x.no==="جرد"&&!x.exp);const dq=+(ln.diff/f0(p)).toFixed(6);if(h)h.qty=+(num(h.qty)+dq).toFixed(6);else b.push({no:"جرد",exp:"",qty:dq,cost:num(p.cost)})}
      await store.save("products",id,{...o,batches:b});
    }
    await store.save("counts",uid(),{ts:Date.now(),lines,by:me?me.name:""});audit("جرد مخزون",lines.length+" صنف · "+lines.filter(x=>x.diff!==0).length+" بها فروق"+(lines.filter(x=>x.diff!==0).slice(0,5).map(x=>" | "+x.name+": "+(x.diff>0?"+":"")+x.diff).join("")));
    cnt={};toast("تم حفظ الجرد وتسوية الكميات");V.stocktake();
  };
  draw();
};

/* ---- barcode labels ---- */
let bcPick={},bcOpt={size:"50x30",price:true,mode:"auto"};
const C128="212222,222122,222221,121223,121322,131222,122213,122312,132212,221213,221312,231212,112232,122132,122231,113222,123122,123221,223211,221132,221231,213212,223112,312131,311222,321122,321221,312212,322112,322211,212123,212321,232121,111323,131123,131321,112313,132113,132311,211313,231113,231311,112133,112331,132131,113123,113321,133121,313121,211331,231131,213113,213311,213131,311123,311321,331121,312113,312311,332111,314111,221411,431111,111224,111422,121124,121421,141122,141221,112214,112412,122114,122411,142112,142211,241211,221114,413111,241112,134111,111242,121142,121241,114212,124112,124211,411212,421112,421211,212141,214121,412121,111143,111341,131141,114113,114311,411113,411311,113141,114131,311141,411131,211412,211214,211232,2331112".split(",");
function c128vals(s){
  const v=[];
  if(/^\d{4,}$/.test(s)&&s.length%2===0){v.push(105);for(let i=0;i<s.length;i+=2)v.push(+s.slice(i,i+2))}
  else if(/^\d{5,}$/.test(s)){v.push(104,s.charCodeAt(0)-32,99);for(let i=1;i<s.length;i+=2)v.push(+s.slice(i,i+2))}
  else{v.push(104);for(const ch of s)v.push(Math.min(95,Math.max(0,ch.charCodeAt(0)-32)))}
  let sum=v[0];for(let k=1;k<v.length;k++)sum+=v[k]*k;v.push(sum%103,106);return v;
}
function barSvg(code,h){
  code=String(code);const v=c128vals(code);let x=10,rects="";
  v.forEach(val=>{const p=C128[val];for(let k=0;k<p.length;k++){const w=+p[k];if(k%2===0)rects+=`<rect x="${x}" y="0" width="${w}" height="${h}"/>`;x+=w}});
  const W=x+10;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h+13}" width="${(W*1.6).toFixed(0)}" height="${((h+13)*1.6).toFixed(0)}"><g fill="#000">${rects}</g><text x="${W/2}" y="${h+10.5}" font-family="monospace" font-size="10" text-anchor="middle">${esc(code)}</text></svg>`;
}
function labelHtml(p,w,h,showPrice){
  let svg="";try{svg=barSvg(p.barcode,Math.max(18,h*3.78*0.38))}catch(e){svg=`<span class="mono">${esc(p.barcode)}</span>`}
  return `<div class="lab" style="width:${w}mm;height:${h}mm"><div class="ln">${esc(p.name)}</div>${svg}${showPrice?`<div class="lp">${money(p.price)} ${CUR}</div>`:""}</div>`;
}
/* label sheet. mode "auto": on a narrow page (label roll / thermal printer) every label fills one page of whatever size the printer
   is set to; on a wide page (A4...) labels are laid out in a grid at the chosen size. "roll"/"a4" force a fixed page. */
function labelsDoc(entries,title){
  const [w,h]=bcOpt.size.split("x").map(Number),items=[];
  entries.forEach(({p,n})=>{for(let k=0;k<Math.min(500,Math.max(1,n));k++)items.push(labelHtml(p,w,h,bcOpt.price))});
  const m=bcOpt.mode,roll=m==="roll",au=m==="auto";
  const css=`@page{size:${au?"auto":roll?w+"mm "+h+"mm":"A4"};margin:${roll||au?"0":"8mm"}}body{margin:0;font-family:Tahoma,Arial,sans-serif}
.lab{box-sizing:border-box;container-type:size;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;padding:1mm;gap:.5mm;background:#fff;color:#000}
.lab svg{width:92%;height:auto;max-height:54%}.ln{font-size:max(6px,9cqh);font-weight:bold;line-height:1.1;max-height:2.3em;overflow:hidden;width:100%}.lp{font-size:max(6px,8.5cqh)}
${roll?".lab{page-break-after:always;break-after:page}":au?`@media print and (max-width:120mm){.lab{width:100vw!important;height:100vh!important;page-break-after:always;break-after:page}}
@media print and (min-width:121mm){.wrap{display:flex;flex-wrap:wrap;padding:8mm}.lab{border:.2mm dashed #bbb;margin:0 2mm 2mm 0}}
@media screen{.wrap{display:flex;flex-wrap:wrap;gap:6px;padding:10px}.lab{border:1px dashed #999}}`
 :".lab{border:.2mm dashed #bbb;margin:0 2mm 2mm 0}.wrap{display:flex;flex-wrap:wrap}"}`;
  return printDoc(title||"ملصقات الباركود",css,roll?items.join(""):`<div class="wrap">${items.join("")}</div>`);
}
V.barcode=()=>{
  const ids=Object.keys(bcPick).filter(id=>S.products.some(p=>p.id===id));
  const [w,h]=bcOpt.size.split("x").map(Number);
  const hasLib=true;
  const total=ids.reduce((a,id)=>a+bcPick[id],0);
  $("#view").innerHTML=`<h2>طباعة الباركود</h2><p class="lead">اختر الأصناف وعدد الملصقات، ثم نزّل ملف الطباعة.</p>
  ${hasLib?"":`<div class="warnbox">تعذر تحميل مكتبة الباركود. تأكد من الاتصال بالإنترنت ثم أعد فتح الصفحة.</div>`}
  <div class="card"><div class="row"><label class="f2">إضافة صنف<input id="bItem" autocomplete="off" placeholder="اسم أو باركود"></label>
    <button id="bAll" type="button">إضافة كل الأصناف</button><button id="bClr" type="button">مسح الاختيار</button></div>
   <div class="row" style="margin-top:12px"><label class="f1">مقاس الملصق (مم)<select id="bSize"><option value="50x30">50 × 30</option><option value="38x25">38 × 25</option><option value="60x40">60 × 40</option><option value="40x20">40 × 20</option></select></label>
    <label class="f1">نوع الطباعة<select id="bMode"><option value="auto">تلقائي حسب الطابعة (موصى به)</option><option value="roll">رول ملصقات بالمقاس المختار (ملصق في كل صفحة)</option><option value="a4">ورقة A4 (عدة ملصقات)</option></select></label>
    <label class="f1" style="flex-direction:row;align-items:center;gap:8px;flex:0 0 auto"><input id="bPrice" type="checkbox" style="width:auto"> إظهار السعر</label></div></div>
  <div style="margin-top:14px">${ids.length?`<div class="tw"><table><tr><th>الصنف</th><th>الباركود</th><th>عدد الملصقات</th><th></th></tr>
   ${ids.map(id=>{const p=S.products.find(x=>x.id===id);return`<tr><td>${esc(p.name)}</td><td class="mono">${esc(p.barcode)}</td><td><input data-n="${id}" type="number" min="1" max="500" style="width:80px" value="${bcPick[id]}"></td><td><button class="sm dng" data-d="${id}" type="button">إزالة</button></td></tr>`}).join("")}</table></div>`
   :`<div class="card empty">لم يتم اختيار أصناف بعد</div>`}</div>
  ${ids.length&&hasLib?`<div class="bar" style="margin-top:14px"><h3 style="margin:0">معاينة (${total} ملصق)</h3>
   <button class="pri" id="bDl" type="button" ${downloads?"":"disabled"}>طباعة الملصقات</button></div>
   <div class="labels" id="bPrev">${ids.slice(0,12).map(id=>labelHtml(S.products.find(p=>p.id===id),w,h,bcOpt.price)).join("")}</div>
   ${ids.length>12?`<p class="note">المعاينة تعرض أول 12 صنفا فقط. الملف يحتوي كل الملصقات.</p>`:""}
   <p class="note">في الوضع التلقائي تُطبع كل ملصقة بمقاس الورق المختار في نافذة الطباعة (اختر طابعة الباركود ومقاس الملصق في إعدادات الطابعة). على ورق A4 تُرتّب الملصقات في شبكة بالمقاس المختار.</p>`:""}`;
  $("#bSize").value=bcOpt.size;$("#bMode").value=bcOpt.mode;$("#bPrice").checked=bcOpt.price;
  const opt=()=>{bcOpt={size:$("#bSize").value,mode:$("#bMode").value,price:$("#bPrice").checked};V.barcode()};
  ["#bSize","#bMode","#bPrice"].forEach(s=>$(s).onchange=opt);
  suggest($("#bItem"),p=>{bcPick[p.id]=(bcPick[p.id]||0)+1;V.barcode();$("#bItem").focus()});
  $("#bAll").onclick=()=>{S.products.forEach(p=>{bcPick[p.id]=bcPick[p.id]||Math.max(1,qtyOf(p))});V.barcode()};
  $("#bClr").onclick=()=>{bcPick={};V.barcode()};
  $$("[data-n]").forEach(i=>i.onchange=()=>{bcPick[i.dataset.n]=Math.min(500,Math.max(1,Math.floor(num(i.value))));V.barcode()});
  $$("[data-d]").forEach(b=>b.onclick=()=>{delete bcPick[b.dataset.d];V.barcode()});
  const dl=$("#bDl");if(dl)dl.onclick=()=>saveFile("barcodes-"+today()+".html",labelsDoc(ids.map(id=>({p:S.products.find(x=>x.id===id),n:bcPick[id]}))));
};

