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

const els = Object.fromEntries(['dropZone','emptyState','canvasStage','fileInput','selectButton','outputCanvas','originalCanvas','pixelSize','sizeOutput','paletteGrid','ditherToggle','downloadButton','resetButton','status','compareControl','compareRange','compareLine'].map(id => [id, document.getElementById(id)]));
const outCtx = els.outputCanvas.getContext('2d', { willReadFrequently: true });
const originalCtx = els.originalCanvas.getContext('2d');
let sourceImage = null;
let sourceName = 'dot-pop';
let selectedPalette = 'natural';
let renderTimer;

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

function render() {
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
  els.originalCanvas.width=fullW;els.originalCanvas.height=fullH;originalCtx.clearRect(0,0,fullW,fullH);originalCtx.drawImage(sourceImage,0,0,fullW,fullH);
  updateCompare(); els.status.textContent=`${smallW} × ${smallH} ドットで変換しました`;
}

function scheduleRender(){ clearTimeout(renderTimer); els.status.textContent='変換中…'; renderTimer=setTimeout(render,60); }
function updateCompare(){ const value=Number(els.compareRange.value);els.originalCanvas.style.clipPath=`inset(0 ${100-value}% 0 0)`;els.compareLine.style.left=`${value}%`;els.compareLine.style.display=value>0&&value<100?'block':'none'; }

function loadFile(file) {
  if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { els.status.textContent='JPG・PNG・WebP画像を選んでください'; return; }
  if (file.size > 15*1024*1024) { els.status.textContent='画像は15MB以下にしてください'; return; }
  const reader=new FileReader(); els.status.textContent='画像を読み込んでいます…';
  reader.onload=()=>{ const img=new Image();img.onload=()=>{sourceImage=img;sourceName=file.name.replace(/\.[^.]+$/,'');els.emptyState.hidden=true;els.canvasStage.hidden=false;els.compareControl.hidden=false;els.downloadButton.disabled=false;els.resetButton.disabled=false;els.dropZone.removeAttribute('role');els.dropZone.tabIndex=-1;render();};img.onerror=()=>els.status.textContent='画像を読み込めませんでした';img.src=reader.result;};reader.readAsDataURL(file);
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
els.ditherToggle.addEventListener('change',scheduleRender);els.compareRange.addEventListener('input',updateCompare);
els.resetButton.addEventListener('click',()=>{sourceImage=null;els.fileInput.value='';els.emptyState.hidden=false;els.canvasStage.hidden=true;els.compareControl.hidden=true;els.downloadButton.disabled=true;els.resetButton.disabled=true;els.dropZone.setAttribute('role','button');els.dropZone.tabIndex=0;els.status.textContent='画像を選ぶと変換が始まります';});
els.downloadButton.addEventListener('click',()=>{if(!sourceImage)return;els.outputCanvas.toBlob(blob=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${sourceName}-dot-pop.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);els.status.textContent='PNGを保存しました';},'image/png');});
makePaletteButtons();
