(() => {
'use strict';
const $=id=>document.getElementById(id), db=()=>window.appSupabase, user=()=>window.appCurrentUser?.();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let screens=[],comments=[],activeScreen=null,activeComment=null,editor=false,imageUrl='',imageElement=null,drawStart=null,draft=null,zoom=1;
function msg(t,err){const e=$('scadaMsg');if(e){e.textContent=t;e.className='scada-msg '+(err?'error':'');}}
function signed(path){return db().storage.from('aula-scada').createSignedUrl(path,3600).then(r=>{if(r.error)throw r.error;return r.data.signedUrl;});}
async function loadRole(){
 const u=user();if(!u)return;
 const r=await db().from('aula_scada_members').select('role').eq('user_id',u.id).maybeSingle();
 editor=!r.error&&['editor','admin'].includes(r.data?.role);
 $('scadaRole').textContent=editor?'Editor autorizado':'Solo consulta';
 document.querySelectorAll('[data-scada-editor]').forEach(e=>e.hidden=!editor);
}
async function refreshScreens(){
 const r=await db().from('aula_scada_screens').select('*').order('created_at',{ascending:false});
 if(r.error)throw r.error;screens=r.data||[];renderScreens();
}
function renderScreens(){
 const h=$('scadaScreenList');
 if(!screens.length){h.innerHTML='<div class="scada-empty">Todavía no hay pantallas. Un editor puede cargar la primera.</div>';return;}
 h.innerHTML=screens.map(s=>'<button class="scada-screen-card" data-id="'+s.id+'"><span class="scada-screen-icon">▦</span><span><b>'+esc(s.title)+'</b><small>'+esc(s.area||'Área no especificada')+'</small></span><span class="scada-chevron">›</span></button>').join('');
 h.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openScreen(b.dataset.id));
}
async function openScreen(id){
 try{
  activeScreen=screens.find(s=>s.id===id);if(!activeScreen)return;
  const a=await Promise.all([signed(activeScreen.image_path),db().from('aula_scada_comments').select('*').eq('screen_id',id).order('created_at')]);
  if(a[1].error)throw a[1].error;imageUrl=a[0];comments=a[1].data||[];
  $('scadaWorkspace').hidden=false;$('scadaScreenTitle').textContent=activeScreen.title;$('scadaScreenDescription').textContent=activeScreen.description||activeScreen.area||'';
  $('scadaCommentForm').hidden=true;$('scadaDetail').hidden=true;renderImage();renderComments();
 }catch(e){msg('No se pudo abrir la pantalla: '+e.message,true);}
}
function renderImage(){
 $('scadaImageStage').innerHTML='<div class="scada-image-wrap" id="scadaImageWrap" style="width:'+Math.round(zoom*100)+'%"><img id="scadaMainImage" crossorigin="anonymous" src="'+imageUrl+'" alt=""><div class="scada-overlay" id="scadaOverlay"></div></div>';
 imageElement=$('scadaMainImage');imageElement.onload=drawMarkers;
 $('scadaZoom').value=zoom;$('scadaZoomValue').textContent=Math.round(zoom*100)+'%';
 $('scadaDrawHelp').textContent=editor?'Activa “Marcar zona” y arrastra sobre la imagen para crear una ficha.':'Selecciona un marcador para estudiar su explicación.';
}
function drawMarkers(){
 const o=$('scadaOverlay');if(!o)return;
 o.innerHTML=comments.map((c,i)=>'<button class="scada-marker" style="left:'+((c.x+c.w/2)*100)+'%;top:'+((c.y+c.h/2)*100)+'%" data-id="'+c.id+'">'+(i+1)+'</button>').join('');
 o.querySelectorAll('[data-id]').forEach(b=>b.onclick=e=>{e.stopPropagation();showComment(b.dataset.id);});
 o.onpointerdown=e=>{
  if(!editor||!$('scadaDrawMode').classList.contains('active')||e.target.closest('.scada-marker'))return;
  const r=o.getBoundingClientRect();drawStart={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};
  draft=document.createElement('div');draft.className='scada-draft';o.appendChild(draft);o.setPointerCapture(e.pointerId);
 };
 o.onpointermove=e=>{
  if(!drawStart||!draft)return;const r=o.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
  const l=Math.min(drawStart.x,x),t=Math.min(drawStart.y,y),w=Math.abs(x-drawStart.x),h=Math.abs(y-drawStart.y);
  Object.assign(draft.style,{left:l*100+'%',top:t*100+'%',width:w*100+'%',height:h*100+'%'});
 };
 o.onpointerup=e=>{
  if(!drawStart)return;const r=o.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
  const q={x:Math.max(0,Math.min(drawStart.x,x)),y:Math.max(0,Math.min(drawStart.y,y)),w:Math.abs(x-drawStart.x),h:Math.abs(y-drawStart.y)};
  drawStart=null;draft?.remove();draft=null;if(q.w<.008||q.h<.008){msg('Selecciona un área un poco mayor.',true);return;}
  $('scadaRect').value=JSON.stringify(q);openCommentForm(null,q);
 };
}
function renderComments(){
 const h=$('scadaCommentList');
 if(!comments.length){h.innerHTML='<div class="scada-empty">Esta pantalla aún no tiene explicaciones.</div>';return;}
 h.innerHTML=comments.map((c,i)=>'<article class="scada-comment-row"><button class="scada-comment-open" data-id="'+c.id+'"><span class="scada-number">'+(i+1)+'</span><span><b>'+esc(c.title)+'</b><small>'+esc((c.content||'').slice(0,110))+'</small></span></button></article>').join('');
 h.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>showComment(b.dataset.id));
}
async function showComment(id){
 activeComment=comments.find(c=>c.id===id);if(!activeComment)return;
 let u='';if(activeComment.crop_path)try{u=await signed(activeComment.crop_path);}catch(e){}
 $('scadaDetailTitle').textContent=activeComment.title;$('scadaDetailBody').textContent=activeComment.content;
 $('scadaDetailCrop').innerHTML=u?'<img src="'+u+'" alt="Recorte de referencia">':'';
 $('scadaDetail').hidden=false;$('scadaCommentForm').hidden=true;
 $('scadaEditComment').hidden=!editor;$('scadaDeleteComment').hidden=!editor;$('scadaDownloadCrop').hidden=!u;
}
function openCommentForm(c,q){
 activeComment=c||null;$('scadaCommentForm').hidden=false;$('scadaDetail').hidden=true;
 $('scadaCommentFormTitle').textContent=c?'Editar explicación':'Nueva explicación de capacitación';
 $('scadaCommentTitle').value=c?.title||'';$('scadaCommentContent').value=c?.content||'';
 $('scadaRect').value=JSON.stringify(q||{x:c.x,y:c.y,w:c.w,h:c.h});$('scadaCommentTitle').focus();
}
async function makeCrop(q){
 if(!imageElement?.naturalWidth)throw new Error('La imagen no está lista.');
 const x=Math.max(0,Math.floor(q.x*imageElement.naturalWidth)),y=Math.max(0,Math.floor(q.y*imageElement.naturalHeight));
 const w=Math.max(1,Math.min(imageElement.naturalWidth-x,Math.ceil(q.w*imageElement.naturalWidth))),h=Math.max(1,Math.min(imageElement.naturalHeight-y,Math.ceil(q.h*imageElement.naturalHeight)));
 const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(imageElement,x,y,w,h,0,0,w,h);
 return new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.9));
}
async function saveComment(){
 if(!editor)return;const title=$('scadaCommentTitle').value.trim(),content=$('scadaCommentContent').value.trim();
 if(!title||!content){msg('Completa el título y la explicación.',true);return;}
 const q=JSON.parse($('scadaRect').value),id=activeComment?.id||crypto.randomUUID(),btn=$('scadaSaveComment');btn.disabled=true;
 try{
  const blob=await makeCrop(q),path=user().id+'/recortes/'+id+'.jpg';
  const up=await db().storage.from('aula-scada').upload(path,blob,{contentType:'image/jpeg',upsert:true});if(up.error)throw up.error;
  const data={screen_id:activeScreen.id,title,content,x:q.x,y:q.y,w:q.w,h:q.h,crop_path:path,updated_at:new Date().toISOString()};
  const r=activeComment?await db().from('aula_scada_comments').update(data).eq('id',id):await db().from('aula_scada_comments').insert({...data,id,created_by:user().id});
  if(r.error)throw r.error;$('scadaCommentForm').hidden=true;msg('Explicación guardada.');await openScreen(activeScreen.id);
 }catch(e){msg('No se pudo guardar: '+e.message,true);}finally{btn.disabled=false;}
}
async function deleteComment(){
 if(!editor||!activeComment||!confirm('¿Eliminar esta explicación?'))return;const c=activeComment;
 const r=await db().from('aula_scada_comments').delete().eq('id',c.id);if(r.error){msg(r.error.message,true);return;}
 if(c.crop_path)await db().storage.from('aula-scada').remove([c.crop_path]);$('scadaDetail').hidden=true;await openScreen(activeScreen.id);
}
async function uploadScreen(){
 if(!editor)return;const f=$('scadaUploadFile').files[0],title=$('scadaUploadTitle').value.trim();if(!f||!title){msg('Selecciona imagen y escribe el nombre.',true);return;}
 if(!f.type.startsWith('image/')){msg('El archivo debe ser una imagen.',true);return;}
 const id=crypto.randomUUID(),path=user().id+'/pantallas/'+id+'.'+(f.name.split('.').pop()||'jpg'),b=$('scadaUploadBtn');b.disabled=true;
 try{
  const up=await db().storage.from('aula-scada').upload(path,f,{contentType:f.type});if(up.error)throw up.error;
  const r=await db().from('aula_scada_screens').insert({id,title,area:$('scadaUploadArea').value.trim(),description:$('scadaUploadDescription').value.trim(),image_path:path,created_by:user().id});
  if(r.error)throw r.error;$('scadaUploadFile').value='';$('scadaUploadTitle').value='';$('scadaUploadArea').value='';$('scadaUploadDescription').value='';
  await refreshScreens();msg('Pantalla agregada a la biblioteca.');
 }catch(e){msg('No se pudo cargar: '+e.message,true);}finally{b.disabled=false;}
}
function downloadBlob(url,name){fetch(url).then(r=>r.blob()).then(blob=>{const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);}).catch(e=>msg(e.message,true));}
async function downloadCrop(){if(activeComment?.crop_path)downloadBlob(await signed(activeComment.crop_path),(activeComment.title||'recorte')+'.jpg');}
async function exportPdf(){
 if(!activeScreen)return;const w=window.open('','_blank');if(!w){msg('Permite ventanas emergentes para generar el PDF.',true);return;}
 const main=await signed(activeScreen.image_path),rows=[];
 for(let i=0;i<comments.length;i++){const c=comments[i];let crop='';if(c.crop_path)try{crop=await signed(c.crop_path);}catch(e){}
 rows.push('<section><h2>'+(i+1)+'. '+esc(c.title)+'</h2>'+(crop?'<img class="crop" src="'+crop+'">':'')+'<p>'+esc(c.content).replace(/\n/g,'<br>')+'</p></section>');}
 w.document.write('<!doctype html><html lang="es"><meta charset="utf-8"><title>Aula SCADA</title><style>body{font:14px Arial;color:#172338;margin:28px}h1{color:#1646a0}h2{font-size:17px;color:#1646a0}img.main{width:100%;max-height:65vh;object-fit:contain}img.crop{display:block;max-width:100%;max-height:230px}section{border-top:1px solid #ddd;padding:15px 0;page-break-inside:avoid}p{line-height:1.55;white-space:pre-wrap}@media print{body{margin:15mm}}</style><h1>Aula SCADA</h1><h2>'+esc(activeScreen.title)+'</h2><p>'+esc(activeScreen.area||'')+' · Material de capacitación</p><img class="main" src="'+main+'"><h2>Explicaciones</h2>'+rows.join('')+'<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></html>');w.document.close();
}
function zipCrc32(bytes){
 let crc=0xffffffff;
 for(const byte of bytes){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 return (crc^0xffffffff)>>>0;
}
function zip16(view,offset,value){view.setUint16(offset,value,true);}
function zip32(view,offset,value){view.setUint32(offset,value>>>0,true);}
function buildZip(files){
 const encoder=new TextEncoder(),localParts=[],centralParts=[];let offset=0;
 const now=new Date(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|Math.floor(now.getSeconds()/2);
 const date=((Math.max(1980,now.getFullYear())-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
 for(const file of files){
  const name=encoder.encode(file.name),data=file.bytes,crc=zipCrc32(data);
  const local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);
  zip32(lv,0,0x04034b50);zip16(lv,4,20);zip16(lv,6,0x0800);zip16(lv,8,0);
  zip16(lv,10,time);zip16(lv,12,date);zip32(lv,14,crc);zip32(lv,18,data.length);zip32(lv,22,data.length);
  zip16(lv,26,name.length);zip16(lv,28,0);local.set(name,30);
  localParts.push(local,data);
  const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);
  zip32(cv,0,0x02014b50);zip16(cv,4,20);zip16(cv,6,20);zip16(cv,8,0x0800);zip16(cv,10,0);
  zip16(cv,12,time);zip16(cv,14,date);zip32(cv,16,crc);zip32(cv,20,data.length);zip32(cv,24,data.length);
  zip16(cv,28,name.length);zip16(cv,30,0);zip16(cv,32,0);zip16(cv,34,0);zip16(cv,36,0);zip32(cv,38,0);zip32(cv,42,offset);
  central.set(name,46);centralParts.push(central);offset+=local.length+data.length;
 }
 const centralSize=centralParts.reduce((sum,p)=>sum+p.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
 zip32(ev,0,0x06054b50);zip16(ev,4,0);zip16(ev,6,0);zip16(ev,8,files.length);zip16(ev,10,files.length);
 zip32(ev,12,centralSize);zip32(ev,16,offset);zip16(ev,20,0);
 return new Blob([...localParts,...centralParts,end],{type:'application/zip'});
}
async function downloadAll(){
 const items=comments.filter(c=>c.crop_path);
 if(!items.length){msg('Esta pantalla todavía no tiene recortes para descargar.',true);return;}
 const button=$('scadaDownloadAll');button.disabled=true;msg('Preparando '+items.length+' recorte(s)…');
 try{
  const files=[],used=new Set();
  for(const c of items){
   const response=await fetch(await signed(c.crop_path));
   if(!response.ok)throw new Error('No se pudo descargar el recorte: '+c.title);
   const base=(c.title||'recorte').replace(/[\\/:*?"<>|]+/g,'-').trim()||'recorte';
   let name=base+'.jpg',n=2;while(used.has(name.toLowerCase()))name=base+' ('+(n++)+').jpg';
   used.add(name.toLowerCase());files.push({name,bytes:new Uint8Array(await response.arrayBuffer())});
  }
  const blob=buildZip(files),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='Aula-SCADA-recortes.zip';document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);msg('ZIP preparado con '+files.length+' recorte(s).');
 }catch(e){msg('No se pudieron preparar los recortes: '+e.message,true);}
 finally{button.disabled=false;}
}
function init(){
 $('scadaUploadBtn').onclick=uploadScreen;
 $('scadaDrawMode').onclick=()=>{$('scadaDrawMode').classList.toggle('active');msg($('scadaDrawMode').classList.contains('active')?'Arrastra para marcar una zona.':'Selección desactivada.');};
 $('scadaCancelComment').onclick=()=>$('scadaCommentForm').hidden=true;$('scadaSaveComment').onclick=saveComment;
 $('scadaCloseDetail').onclick=()=>$('scadaDetail').hidden=true;$('scadaEditComment').onclick=()=>activeComment&&openCommentForm(activeComment);
 $('scadaDeleteComment').onclick=deleteComment;$('scadaDownloadCrop').onclick=downloadCrop;$('scadaExportPdf').onclick=exportPdf;$('scadaDownloadAll').onclick=downloadAll;
 $('scadaZoom').oninput=e=>{zoom=Number(e.target.value);$('scadaZoomValue').textContent=Math.round(zoom*100)+'%';if($('scadaImageWrap'))$('scadaImageWrap').style.width=Math.round(zoom*100)+'%';};
 $('scadaBackToLibrary').onclick=()=>{$('scadaWorkspace').hidden=true;activeScreen=null;};
}
async function open(){if(!db()||!user())return;$('scadaWorkspace').hidden=true;try{await loadRole();await refreshScreens();}catch(e){msg('Aula SCADA: '+e.message,true);}}
window.AulaScada={open};document.addEventListener('DOMContentLoaded',init);
})();