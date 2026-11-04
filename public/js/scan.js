/* ---------- phone camera barcode scan: take a photo with the camera app, then decode it ---------- */
const canScan=()=>navigator.maxTouchPoints>0||(window.matchMedia&&matchMedia("(pointer:coarse)").matches);
const ZX_URL="https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js";
const SCAN_SVG='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/></svg>';
let zxP=null;
function loadZX(){
  if(window.ZXing)return Promise.resolve(true);
  return zxP||(zxP=new Promise(res=>{const s=document.createElement("script");s.src=ZX_URL;
    s.onload=()=>res(!!window.ZXing);s.onerror=()=>{zxP=null;res(false)};document.head.appendChild(s)}));
}
async function toBitmap(file){
  try{return await createImageBitmap(file,{imageOrientation:"from-image"})}catch(e){}
  return await new Promise((ok,no)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=no;im.src=URL.createObjectURL(file)});
}
function grayOf(bmp,rot){
  const sw=bmp.width,sh=bmp.height,k=Math.min(1,1600/Math.max(sw,sh)),w=Math.round(sw*k),h=Math.round(sh*k);
  const c=document.createElement("canvas"),x=c.getContext("2d");
  if(rot){c.width=h;c.height=w;x.translate(h,0);x.rotate(Math.PI/2);x.drawImage(bmp,0,0,w,h)}
  else{c.width=w;c.height=h;x.drawImage(bmp,0,0,w,h)}
  const W=c.width,H=c.height,px=x.getImageData(0,0,W,H).data,g=new Uint8ClampedArray(W*H);
  for(let i=0,j=0;i<g.length;i++,j+=4)g[i]=(px[j]*299+px[j+1]*587+px[j+2]*114)/1000;
  return{g,W,H};
}
/* resolves {text} on success, {err:"lib"} when no decoder could load, {err:"none"} when nothing was found */
async function decodeBarcode(file){
  const bmp=await toBitmap(file);
  if("BarcodeDetector" in window){
    try{const r=await new BarcodeDetector().detect(bmp);if(r.length&&r[0].rawValue)return{text:r[0].rawValue}}catch(e){}
  }
  if(!(await loadZX()))return{err:"lib"};
  const Z=window.ZXing,hints=new Map(),F=Z.BarcodeFormat;
  hints.set(Z.DecodeHintType.TRY_HARDER,true);
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS,[F.EAN_13,F.EAN_8,F.UPC_A,F.UPC_E,F.CODE_128,F.CODE_39,F.ITF,F.DATA_MATRIX,F.QR_CODE]);
  for(const rot of [false,true]){
    const{g,W,H}=grayOf(bmp,rot);const rd=new Z.MultiFormatReader();rd.setHints(hints);
    try{return{text:rd.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(g,W,H)))).getText()}}catch(e){}
  }
  return{err:"none"};
}
/* GS1 2D codes (01 + GTIN-14 ...) become the plain 13-digit barcode the system stores */
function normCode(t){
  t=String(t).replace(/[\u0000-\u001f\u001d]/g,"").trim();
  const m=t.match(/^(?:\]d2)?01(\d{14})/);
  if(m){const g=m[1];return g[0]==="0"?g.slice(1):g}
  return t;
}
function attachScan(input,onCode){
  if(!input||!canScan()||input.dataset.scan)return;input.dataset.scan="1";
  const wrap=input.parentElement;wrap.classList.add("hasscan");
  const btn=document.createElement("button");btn.type="button";btn.className="scanbtn";
  btn.title="مسح الباركود بالكاميرا";btn.setAttribute("aria-label","مسح الباركود بالكاميرا");btn.innerHTML=SCAN_SVG;
  const fi=document.createElement("input");fi.type="file";fi.accept="image/*";fi.setAttribute("capture","environment");fi.hidden=true;
  btn.onclick=()=>{fi.value="";fi.click()};
  fi.onchange=async()=>{
    const f=fi.files[0];if(!f)return;btn.disabled=true;btn.classList.add("busy");
    try{const r=await decodeBarcode(f);
      if(r.text)onCode(normCode(r.text));
      else toast(r.err==="lib"?"تعذر تحميل قارئ الباركود. تأكد من الاتصال بالإنترنت.":"لم أتمكن من قراءة الباركود. قرّب الكاميرا، وتأكد من الإضاءة، وأعد المحاولة.");
    }catch(e){toast("تعذر قراءة الصورة")}
    btn.disabled=false;btn.classList.remove("busy");
  };
  wrap.append(btn,fi);
}
