/* ---------- parties (customers / suppliers), ledger, VAT and profit helpers ---------- */
const vatOf=(total,rate)=>num(rate)>0?num(total)-num(total)/(1+num(rate)/100):0;
const cogs=items=>(items||[]).reduce((a,i)=>a+num(i.cost)*num(i.qty),0);
const saleProfit=s=>num(s.total)-num(s.vat)-cogs(s.items);
const KIND={sale:"فاتورة بيع",pay:"دفعة",sret:"مرتجع بيع",buy:"فاتورة شراء",pret:"مرتجع شراء",open:"رصيد افتتاحي"};
const findParty=(name,type)=>{name=(name||"").trim();return S.parties.find(p=>p.type===type&&p.name===name)||null};
async function ensureParty(name,type){
  name=(name||"").trim();if(!name)return null;
  const f=findParty(name,type);if(f)return f.id;
  const id=uid();const o={name,phone:"",type,bal:0,createdAt:Date.now()};
  await store.save("parties",id,o);if(!S.parties.some(p=>p.id===id))S.parties.push({...o,id});
  return id;
}
async function ledgerAdd(pid,kind,amount,note,ref){
  amount=Math.round(num(amount)*100)/100;if(!pid||!amount)return;
  const p=S.parties.find(x=>x.id===pid);if(!p)return;
  const bal=Math.round((num(p.bal)+amount)*100)/100;
  const{id,...o}=p;await store.save("parties",pid,{...o,bal});p.bal=bal;
  await store.save("ledger",uid(),{ts:Date.now(),pid,kind,amount,bal,note:note||"",ref:String(ref||"")});
}
const partyOptions=type=>S.parties.filter(p=>p.type===type).map(p=>`<option value="${esc(p.name)}"></option>`).join("");
const csvOf=rows=>"﻿"+rows.map(r=>r.map(c=>`"${String(c??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
const V={};

/* ---------- draft invoices: several invoices open at once, no cap on lines ---------- */
let draftArmed=-1;
function draftBarHtml(list,idx,sizeOf){
  return `<div class="drafts">${list.map((d,i)=>`<span class="dtab ${i===idx?"on":""}"><button type="button" data-ds="${i}">فاتورة ${i+1}${sizeOf(d)?" · "+sizeOf(d):""}</button>${list.length>1?`<button type="button" class="dx ${draftArmed===i?"arm":""}" data-dx="${i}" aria-label="حذف المسودة">${draftArmed===i?"تأكيد الحذف":"×"}</button>`:""}</span>`).join("")}<button type="button" class="dnew" id="dNew">+ فاتورة جديدة</button></div>`;
}
function wireDrafts(o){
  $$("[data-ds]").forEach(b=>b.onclick=()=>{draftArmed=-1;o.open(+b.dataset.ds);o.again()});
  $("#dNew").onclick=()=>{draftArmed=-1;o.add();o.again()};
  $$("[data-dx]").forEach(b=>b.onclick=()=>{const i=+b.dataset.dx;if(o.size(o.list()[i])&&draftArmed!==i){draftArmed=i;o.again();return}draftArmed=-1;o.del(i);o.again()});
}
