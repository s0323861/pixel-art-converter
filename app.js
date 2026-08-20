const palettes = {
  natural: { name: 'ナチュラル', colors: ['#1b1b2f','#53354a','#903749','#e84545','#f5d061','#f8f3d4','#34626c','#839b97','#c6b497','#a26769','#d5b9b2','#ffffff'] },
  gameboy: { name: 'ゲームボーイ', colors: ['#0f380f','#306230','#8bac0f','#9bbc0f'] },
  pico: { name: 'レトロ16', colors: ['#000000','#1d2b53','#7e2553','#008751','#ab5236','#5f574f','#c2c3c7','#fff1e8','#ff004d','#ffa300','#ffec27','#00e436','#29adff','#83769c','#ff77a8','#ffccaa'] },
  pastel: { name: 'パステル', colors: ['#6c5b7b','#c06c84','#f67280','#f8b195','#f6eac2','#a8dadc','#89c2d9','#468faf','#ffffff','#2b2d42'] },
  mono: { name: 'モノクロ', colors: ['#111111','#404040','#777777','#adadad','#dedede','#ffffff'] },
  cyber: { name: 'サイバー', colors: ['#08001f','#240046','#5a189a','#9d4edd','#00f5d4','#00bbf9','#fee440','#f15bb5','#ffffff'] },
  sunset: { name: 'サンセット', colors: ['#2d1e2f','#4f345a','#8b5e83','#d47fa6','#f7a072','#ffcf70','#fff3b0','#5b8e7d'] },
  ocean: { name: 'オーシャン', colors: ['#03045e','#0077b6','#00b4d8','#90e0ef','#caf0f8','#48cae4','#023e8a','#ffffff'] }
};

const els = Object.fromEntries(['dropZone','emptyState','canvasStage','fileInput','selectButton','outputCanvas','originalCanvas','pixelSize','sizeOutput','paletteGrid','ditherToggle','crtToggle','glitchToggle','downloadButton','downloadScale','videoButton','resetButton','status','compareControl','compareRange','compareLine','zoomButton','zoomModal','zoomCloseButton','zoomViewport','zoomCanvasFrame','zoomCanvas','zoomOriginalCanvas','zoomCompareRange','zoomCompareLine','zoomRange','zoomOutput','zoomOutButton','zoomInButton','zoomFitButton'].map(id => [id, document.getElementById(id)]));
const outCtx = els.outputCanvas.getContext('2d', { willReadFrequently: true });
const originalCtx = els.originalCanvas.getContext('2d');
const zoomCtx = els.zoomCanvas.getContext('2d');
const zoomOriginalCtx = els.zoomOriginalCanvas.getContext('2d');
let sourceImage = null;
let sourceName = 'dot-pop';
let selectedPalette = 'natural';
let renderTimer;
let recording = false;
let previewAnimationId = 0;
let lastPreviewFrame = 0;
let panState = null;
const mp4MimeType = typeof MediaRecorder !== 'undefined' && ['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=h264','video/mp4'].find(type => MediaRecorder.isTypeSupported(type));

function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n>>16)&255,(n>>8)&255,n&255]; }
const paletteRgb = Object.fromEntries(Object.entries(palettes).map(([key,p]) => [key,p.colors.map(hexToRgb)]));

function makePaletteButtons() {
  Object.entries(palettes).forEach(([key, palette]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'palette-button'; button.setAttribute('role','radio');
    button.setAttribute('aria-checked', key === selectedPalette); button.dataset.palette = key;
    const colors = palette.colors.slice(0,4).map(color => `<i style="background:${color}"></i>`).join('');
    button.innerHTML = `<span class="swatches" aria-hidden="true">${colors}</span><span>${palette.name}</span>`;
    button.addEventListener('click', () => { selectedPalette = key; document.querySelectorAll('.palette-button').forEach(b => b.setAttribute('aria-checked', b === button)); scheduleRender(); });
    els.paletteGrid.appendChild(button);
  });
}

function nearestColor(r,g,b,palette) {
  let best = palette[0], bestDistance = Infinity;
  for (const color of palette) {
    const dr=r-color[0], dg=g-color[1], db=b-color[2];
    const distance = dr*dr*.30 + dg*dg*.59 + db*db*.11;
    if (distance < bestDistance) { bestDistance=distance; best=color; }
  }
  return best;
}

function applyPalette(imageData, palette, dither) {
  const {data,width,height}=imageData;
  if (!dither) {
    for (let i=0;i<data.length;i+=4) { if(data[i+3]===0) continue; const c=nearestColor(data[i],data[i+1],data[i+2],palette); data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2]; }
    return;
  }
  const values = new Float32Array(data.length);
  for(let i=0;i<data.length;i++) values[i]=data[i];
  const spread=(x,y,er,eg,eb,factor)=>{ if(x<0||x>=width||y<0||y>=height)return; const i=(y*width+x)*4; values[i]+=er*factor;values[i+1]+=eg*factor;values[i+2]+=eb*factor; };
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) { const i=(y*width+x)*4;if(values[i+3]===0)continue;const old=[values[i],values[i+1],values[i+2]];const c=nearestColor(old[0],old[1],old[2],palette);data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];const er=old[0]-c[0],eg=old[1]-c[1],eb=old[2]-c[2];spread(x+1,y,er,eg,eb,7/16);spread(x-1,y+1,er,eg,eb,3/16);spread(x,y+1,er,eg,eb,5/16);spread(x+1,y+1,er,eg,eb,1/16); }
}

function drawEffects(ctx, width, height, frame = 0) {
  if (els.glitchToggle.checked) {
    const copy=document.createElement('canvas');copy.width=width;copy.height=height;copy.getContext('2d').drawImage(ctx.canvas,0,0);
    const amount=Math.max(2,Math.round(width*.008));
    ctx.globalCompositeOperation='screen';ctx.globalAlpha=.45;
    ctx.drawImage(copy,amount,0);ctx.fillStyle='rgba(255,0,80,.18)';ctx.fillRect(amount,0,width,height);
    ctx.drawImage(copy,-amount,0);ctx.fillStyle='rgba(0,220,255,.16)';ctx.fillRect(-amount,0,width,height);
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    const bands=5;for(let i=0;i<bands;i++){const seed=Math.sin((frame+1)*(i+7)*12.9898)*43758.5453;const y=Math.abs(seed%1)*height;const h=Math.max(2,height*(.008+Math.abs(seed%1)*.025));const shift=((seed*97)%1)*width*.06;ctx.drawImage(copy,0,y,width,h,shift,y,width,h);}
  }
  if (els.crtToggle.checked) {
    ctx.save();ctx.globalCompositeOperation='multiply';ctx.fillStyle='rgba(15,10,35,.18)';
    const line=Math.max(2,Math.round(height/300));for(let y=0;y<height;y+=line*2)ctx.fillRect(0,y,width,line);
    const gradient=ctx.createRadialGradient(width/2,height/2,Math.min(width,height)*.2,width/2,height/2,Math.max(width,height)*.7);gradient.addColorStop(0,'rgba(255,255,255,0)');gradient.addColorStop(1,'rgba(0,0,20,.65)');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);ctx.restore();
  }
}

function render(frame = 0, announce = true) {
  if (!sourceImage) return;
  const cell = Number(els.pixelSize.value);
  const maxDimension = 1400;
  const scale = Math.min(1, maxDimension / Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight));
  const fullW = Math.max(1, Math.round(sourceImage.naturalWidth*scale));
  const fullH = Math.max(1, Math.round(sourceImage.naturalHeight*scale));
  const smallW = Math.max(1, Math.round(fullW/cell));
  const smallH = Math.max(1, Math.round(fullH/cell));
  const small = document.createElement('canvas'); small.width=smallW;small.height=smallH;
  const sctx=small.getContext('2d',{willReadFrequently:true});
  sctx.imageSmoothingEnabled=true;sctx.drawImage(sourceImage,0,0,smallW,smallH);
  const pixels=sctx.getImageData(0,0,smallW,smallH);applyPalette(pixels,paletteRgb[selectedPalette],els.ditherToggle.checked);sctx.putImageData(pixels,0,0);
  els.outputCanvas.width=fullW;els.outputCanvas.height=fullH;outCtx.imageSmoothingEnabled=false;outCtx.clearRect(0,0,fullW,fullH);outCtx.drawImage(small,0,0,fullW,fullH);
  drawEffects(outCtx,fullW,fullH,frame);
  if (!els.zoomModal.hidden) updateZoomCanvas();
  els.originalCanvas.width=fullW;els.originalCanvas.height=fullH;originalCtx.clearRect(0,0,fullW,fullH);originalCtx.drawImage(sourceImage,0,0,fullW,fullH);
  updateCompare(); if(announce) els.status.textContent=`${smallW} × ${smallH} ドットで変換しました`;
}

function updateZoomCanvas() {
  els.zoomCanvas.width=els.outputCanvas.width;els.zoomCanvas.height=els.outputCanvas.height;
  zoomCtx.imageSmoothingEnabled=false;zoomCtx.clearRect(0,0,els.zoomCanvas.width,els.zoomCanvas.height);zoomCtx.drawImage(els.outputCanvas,0,0);
  els.zoomOriginalCanvas.width=els.outputCanvas.width;els.zoomOriginalCanvas.height=els.outputCanvas.height;
  zoomOriginalCtx.clearRect(0,0,els.zoomOriginalCanvas.width,els.zoomOriginalCanvas.height);zoomOriginalCtx.drawImage(sourceImage,0,0,els.zoomOriginalCanvas.width,els.zoomOriginalCanvas.height);
  updateZoomCompare();
  updateZoomScale();
}
function updateZoomScale() {
  const oldMaxX=Math.max(0,els.zoomViewport.scrollWidth-els.zoomViewport.clientWidth),oldMaxY=Math.max(0,els.zoomViewport.scrollHeight-els.zoomViewport.clientHeight);
  const centerRatioX=oldMaxX?els.zoomViewport.scrollLeft/oldMaxX:.5,centerRatioY=oldMaxY?els.zoomViewport.scrollTop/oldMaxY:.5;
  const scale=Number(els.zoomRange.value)/100;
  els.zoomCanvas.style.width=`${Math.round(els.zoomCanvas.width*scale)}px`;
  els.zoomCanvas.style.height=`${Math.round(els.zoomCanvas.height*scale)}px`;
  els.zoomOriginalCanvas.style.width=els.zoomCanvas.style.width;
  els.zoomOriginalCanvas.style.height=els.zoomCanvas.style.height;
  els.zoomCanvasFrame.style.width=els.zoomCanvas.style.width;
  els.zoomCanvasFrame.style.height=els.zoomCanvas.style.height;
  els.zoomOutput.value=`${els.zoomRange.value}%`;
  requestAnimationFrame(()=>{const maxX=Math.max(0,els.zoomViewport.scrollWidth-els.zoomViewport.clientWidth),maxY=Math.max(0,els.zoomViewport.scrollHeight-els.zoomViewport.clientHeight);els.zoomViewport.scrollLeft=maxX*centerRatioX;els.zoomViewport.scrollTop=maxY*centerRatioY;updatePanAvailability();});
}
function updateZoomCompare() { const value=Number(els.zoomCompareRange.value);els.zoomOriginalCanvas.style.clipPath=`inset(0 ${100-value}% 0 0)`;els.zoomCompareLine.style.left=`${value}%`;els.zoomCompareLine.style.display=value>0&&value<100?'block':'none'; }
function updatePanAvailability() { const canPan=els.zoomViewport.scrollWidth>els.zoomViewport.clientWidth+1||els.zoomViewport.scrollHeight>els.zoomViewport.clientHeight+1;els.zoomViewport.classList.toggle('can-pan',canPan); }
function centerZoomView() { requestAnimationFrame(()=>{els.zoomViewport.scrollLeft=Math.max(0,(els.zoomViewport.scrollWidth-els.zoomViewport.clientWidth)/2);els.zoomViewport.scrollTop=Math.max(0,(els.zoomViewport.scrollHeight-els.zoomViewport.clientHeight)/2);updatePanAvailability();}); }
function setZoom(value) { els.zoomRange.value=Math.max(25,Math.min(400,value));updateZoomScale(); }
function fitZoom() {
  const availableW=Math.max(1,els.zoomViewport.clientWidth-56),availableH=Math.max(1,els.zoomViewport.clientHeight-56);
  const fit=Math.min(1,availableW/els.zoomCanvas.width,availableH/els.zoomCanvas.height);
  setZoom(Math.max(25,Math.floor(fit*100/25)*25));
  centerZoomView();
}
function openZoom() { if(!sourceImage)return;els.zoomCompareRange.value=els.compareRange.value;els.zoomModal.hidden=false;document.body.classList.add('zoom-open');updateZoomCanvas();fitZoom();els.zoomCloseButton.focus(); }
function closeZoom() { els.zoomModal.hidden=true;document.body.classList.remove('zoom-open');els.zoomButton.focus(); }

function scheduleRender(){ clearTimeout(renderTimer); els.status.textContent='変換中…'; renderTimer=setTimeout(render,60); }
function stopGlitchPreview(){ if(previewAnimationId) cancelAnimationFrame(previewAnimationId);previewAnimationId=0;lastPreviewFrame=0; }
function startGlitchPreview(){
  stopGlitchPreview();
  if(!sourceImage||!els.glitchToggle.checked||recording)return;
  const loop=time=>{
    if(!sourceImage||!els.glitchToggle.checked||recording){stopGlitchPreview();return;}
    if(time-lastPreviewFrame>=80){render(Math.floor(time/80),false);lastPreviewFrame=time;}
    previewAnimationId=requestAnimationFrame(loop);
  };
  previewAnimationId=requestAnimationFrame(loop);
}
function updateCompare(){ const value=Number(els.compareRange.value);els.originalCanvas.style.clipPath=`inset(0 ${100-value}% 0 0)`;els.compareLine.style.left=`${value}%`;els.compareLine.style.display=value>0&&value<100?'block':'none'; }

function loadFile(file) {
  if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { els.status.textContent='JPG・PNG・WebP画像を選んでください'; return; }
  if (file.size > 15*1024*1024) { els.status.textContent='画像は15MB以下にしてください'; return; }
  const reader=new FileReader(); els.status.textContent='画像を読み込んでいます…';
  reader.onload=()=>{ const img=new Image();img.onload=()=>{sourceImage=img;sourceName=file.name.replace(/\.[^.]+$/,'');els.emptyState.hidden=true;els.canvasStage.hidden=false;els.compareControl.hidden=false;els.downloadButton.disabled=false;els.videoButton.disabled=false;els.resetButton.disabled=false;els.dropZone.removeAttribute('role');els.dropZone.tabIndex=-1;render();startGlitchPreview();};img.onerror=()=>els.status.textContent='画像を読み込めませんでした';img.src=reader.result;};reader.readAsDataURL(file);
}

function openPicker(event){ event.stopPropagation(); els.fileInput.click(); }
els.selectButton.addEventListener('click',openPicker);
els.dropZone.addEventListener('click',e=>{if(!sourceImage&&e.target!==els.selectButton)openPicker(e)});
els.dropZone.addEventListener('keydown',e=>{if(!sourceImage&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openPicker(e)}});
els.fileInput.addEventListener('change',()=>loadFile(els.fileInput.files[0]));
['dragenter','dragover'].forEach(type=>els.dropZone.addEventListener(type,e=>{e.preventDefault();els.dropZone.classList.add('dragover')}));
['dragleave','drop'].forEach(type=>els.dropZone.addEventListener(type,e=>{e.preventDefault();els.dropZone.classList.remove('dragover')}));
els.dropZone.addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
els.pixelSize.addEventListener('input',()=>{els.sizeOutput.value=`${els.pixelSize.value} px`;scheduleRender()});
els.ditherToggle.addEventListener('change',scheduleRender);els.crtToggle.addEventListener('change',scheduleRender);els.glitchToggle.addEventListener('change',()=>{scheduleRender();startGlitchPreview()});els.compareRange.addEventListener('input',updateCompare);
els.zoomButton.addEventListener('click',openZoom);els.zoomCloseButton.addEventListener('click',closeZoom);
els.zoomRange.addEventListener('input',updateZoomScale);els.zoomOutButton.addEventListener('click',()=>setZoom(Number(els.zoomRange.value)-25));els.zoomInButton.addEventListener('click',()=>setZoom(Number(els.zoomRange.value)+25));els.zoomFitButton.addEventListener('click',fitZoom);
els.zoomCompareRange.addEventListener('input',updateZoomCompare);
els.zoomViewport.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();setZoom(Number(els.zoomRange.value)+(e.deltaY<0?25:-25));},{passive:false});
els.zoomViewport.addEventListener('pointerdown',e=>{if(e.button!==0||!els.zoomViewport.classList.contains('can-pan'))return;panState={id:e.pointerId,x:e.clientX,y:e.clientY,left:els.zoomViewport.scrollLeft,top:els.zoomViewport.scrollTop};els.zoomViewport.classList.add('dragging');els.zoomViewport.setPointerCapture(e.pointerId);e.preventDefault();});
els.zoomViewport.addEventListener('pointermove',e=>{if(!panState||e.pointerId!==panState.id)return;els.zoomViewport.scrollLeft=panState.left-(e.clientX-panState.x);els.zoomViewport.scrollTop=panState.top-(e.clientY-panState.y);e.preventDefault();});
function stopPan(e){if(!panState||e.pointerId!==panState.id)return;panState=null;els.zoomViewport.classList.remove('dragging');if(els.zoomViewport.hasPointerCapture(e.pointerId))els.zoomViewport.releasePointerCapture(e.pointerId);}
els.zoomViewport.addEventListener('pointerup',stopPan);els.zoomViewport.addEventListener('pointercancel',stopPan);
window.addEventListener('resize',updatePanAvailability);
els.zoomModal.addEventListener('click',e=>{if(e.target===els.zoomModal)closeZoom()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!els.zoomModal.hidden)closeZoom()});
els.resetButton.addEventListener('click',()=>{stopGlitchPreview();sourceImage=null;els.fileInput.value='';els.emptyState.hidden=false;els.canvasStage.hidden=true;els.compareControl.hidden=true;els.downloadButton.disabled=true;els.videoButton.disabled=true;els.resetButton.disabled=true;els.dropZone.setAttribute('role','button');els.dropZone.tabIndex=0;els.status.textContent='画像を選ぶと変換が始まります';});
els.downloadButton.addEventListener('click',()=>{if(!sourceImage)return;const scale=Number(els.downloadScale.value);const exportCanvas=document.createElement('canvas');exportCanvas.width=els.outputCanvas.width*scale;exportCanvas.height=els.outputCanvas.height*scale;const exportCtx=exportCanvas.getContext('2d');exportCtx.imageSmoothingEnabled=false;exportCtx.drawImage(els.outputCanvas,0,0,exportCanvas.width,exportCanvas.height);exportCanvas.toBlob(blob=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${sourceName}-dot${scale>1?`-${scale}x`:''}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);els.status.textContent=`PNGを${scale===1?'原寸':`${scale}倍`}で保存しました`;},'image/png');});

els.videoButton.addEventListener('click', async()=>{
  if(!sourceImage||recording)return;
  if(!mp4MimeType||!els.outputCanvas.captureStream){els.status.textContent='このブラウザはMP4書き出しに未対応です。Safari最新版でお試しください。';return;}
  recording=true;stopGlitchPreview();els.videoButton.disabled=true;els.downloadButton.disabled=true;els.compareRange.value=0;updateCompare();
  try{
    const stream=els.outputCanvas.captureStream(30);const chunks=[];const recorder=new MediaRecorder(stream,{mimeType:mp4MimeType,videoBitsPerSecond:6000000});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    const finished=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject});
    recorder.start(250);const start=performance.now();
    await new Promise(resolve=>{function animate(now){const elapsed=now-start;render(Math.floor(elapsed/33),false);els.status.textContent=`MP4を作成中… ${Math.min(100,Math.round(elapsed/40))}%`;if(elapsed<4000)requestAnimationFrame(animate);else resolve()}requestAnimationFrame(animate)});
    recorder.stop();await finished;stream.getTracks().forEach(track=>track.stop());
    const blob=new Blob(chunks,{type:mp4MimeType});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${sourceName}-dot.mp4`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);els.status.textContent='MP4を保存しました';
  }catch(error){console.error(error);els.status.textContent='MP4を作成できませんでした。別のブラウザでお試しください。';}
  finally{recording=false;els.videoButton.disabled=false;els.downloadButton.disabled=false;render();startGlitchPreview();}
});

document.addEventListener('visibilitychange',()=>{if(document.hidden)stopGlitchPreview();else startGlitchPreview()});
makePaletteButtons();
