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
/* ---- live camera scanner: opens the camera and reads barcodes continuously (BarcodeDetector where the browser has it, ZXing otherwise) ---- */
const canLive=()=>!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.isSecureContext!==false);
const LIVE_FORMATS=["ean_13","ean_8","upc_a","upc_e","code_128","code_39","itf","data_matrix","qr_code"];
let scanOpen=false;
async function openScanner(onCode,onFallback){
  if(scanOpen)return;scanOpen=true;
  let stream=null,stopped=false,timer=null,track=null;
  const layer=document.createElement("div");layer.className="scanlayer";layer.style.top=(window.scrollY||0)+"px";
  layer.innerHTML=`<div class="scanbox"><div class="scantop"><b>مسح الباركود</b><button type="button" class="sm" id="scX">إغلاق</button></div>
    <div class="scanview"><video id="scV" playsinline muted autoplay></video><div class="scanguide"></div></div>
    <p class="scanmsg" id="scMsg">جاري فتح الكاميرا…</p>
    <div class="scanbtns"><button type="button" class="sm" id="scTorch" hidden>الفلاش</button><button type="button" class="sm" id="scPhoto">التقاط صورة بدلا من ذلك</button></div></div>`;
  document.body.appendChild(layer);const prevOv=document.body.style.overflow;document.body.style.overflow="hidden";
  const msg=t=>{const m=layer.querySelector("#scMsg");if(m)m.textContent=t};
  const stop=()=>{if(stopped)return;stopped=true;clearTimeout(timer);try{stream&&stream.getTracks().forEach(t=>t.stop())}catch(e){}
    layer.remove();document.body.style.overflow=prevOv;scanOpen=false;document.removeEventListener("keydown",esc)};
  const esc=e=>{if(e.key==="Escape")stop()};document.addEventListener("keydown",esc);
  layer.querySelector("#scX").onclick=stop;
  layer.querySelector("#scPhoto").onclick=()=>{stop();onFallback&&onFallback()};
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}});
  }catch(e){
    stop();toast(e&&e.name==="NotAllowedError"?"اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح ثم أعد المحاولة.":"تعذر فتح الكاميرا.");
    onFallback&&onFallback();return;
  }
  if(stopped){stream.getTracks().forEach(t=>t.stop());return}
  const v=layer.querySelector("#scV");v.srcObject=stream;try{await v.play()}catch(e){}
  track=stream.getVideoTracks()[0];
  try{const cp=track.getCapabilities&&track.getCapabilities();if(cp&&cp.torch){const tb=layer.querySelector("#scTorch");tb.hidden=false;let on=false;
    tb.onclick=async()=>{on=!on;try{await track.applyConstraints({advanced:[{torch:on}]})}catch(e){on=!on}}}}catch(e){}
  let det=null;
  if("BarcodeDetector" in window){try{const sup=await BarcodeDetector.getSupportedFormats(),f=LIVE_FORMATS.filter(x=>sup.includes(x));if(f.length)det=new BarcodeDetector({formats:f})}catch(e){}}
  let zx=null;
  if(!det){
    msg("جاري تحميل قارئ الباركود…");
    if(!(await loadZX())){stop();toast("تعذر تحميل قارئ الباركود. تأكد من الاتصال بالإنترنت.");onFallback&&onFallback();return}
    const Z=window.ZXing,h=new Map(),F=Z.BarcodeFormat;
    h.set(Z.DecodeHintType.TRY_HARDER,true);h.set(Z.DecodeHintType.POSSIBLE_FORMATS,[F.EAN_13,F.EAN_8,F.UPC_A,F.UPC_E,F.CODE_128,F.CODE_39,F.ITF,F.DATA_MATRIX,F.QR_CODE]);
    zx={Z,h,c:document.createElement("canvas")};
  }
  if(stopped)return;
  msg("وجّه الكاميرا نحو الباركود");
  const found=t=>{if(stopped)return;try{navigator.vibrate&&navigator.vibrate(60)}catch(e){}stop();onCode(normCode(t))};
  const tick=async()=>{
    if(stopped)return;
    try{
      if(v.readyState>=2&&v.videoWidth){
        if(det){const r=await det.detect(v);if(r.length&&r[0].rawValue)return found(r[0].rawValue)}
        else{
          const k=Math.min(1,960/v.videoWidth),w=Math.round(v.videoWidth*k),hh=Math.round(v.videoHeight*k);
          zx.c.width=w;zx.c.height=hh;const x=zx.c.getContext("2d",{willReadFrequently:true});x.drawImage(v,0,0,w,hh);
          const px=x.getImageData(0,0,w,hh).data,g=new Uint8ClampedArray(w*hh);
          for(let i=0,j=0;i<g.length;i++,j+=4)g[i]=(px[j]*299+px[j+1]*587+px[j+2]*114)/1000;
          const rd=new zx.Z.MultiFormatReader();rd.setHints(zx.h);
          try{return found(rd.decode(new zx.Z.BinaryBitmap(new zx.Z.HybridBinarizer(new zx.Z.RGBLuminanceSource(g,w,hh)))).getText())}catch(e){}
        }
      }
    }catch(e){}
    timer=setTimeout(tick,det?120:220);
  };
  tick();
}
function attachScan(input,onCode){
  if(!input||!(canScan()||canLive())||input.dataset.scan)return;input.dataset.scan="1";
  const wrap=input.parentElement;wrap.classList.add("hasscan");
  const btn=document.createElement("button");btn.type="button";btn.className="scanbtn";
  btn.title="مسح الباركود بالكاميرا";btn.setAttribute("aria-label","مسح الباركود بالكاميرا");btn.innerHTML=SCAN_SVG;
  const fi=document.createElement("input");fi.type="file";fi.accept="image/*";fi.setAttribute("capture","environment");fi.hidden=true;
  const photo=()=>{fi.value="";fi.click()};
  btn.onclick=()=>{if(canLive())openScanner(onCode,photo);else photo()};
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
