/* Galería: sube las fotos a Cloudinary desde el navegador y muestra las que ya hay.
   La configuración (cloud, preset, etiqueta) viene del servidor en /api/galeria, desde tu .env. */
(function(){
  var reduce=false;
  try{reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){}
  function rnd(i){var x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);}
  function $(id){return document.getElementById(id);}

  /* ---------- Cielo estrellado (igual que la página principal) ---------- */
  var sky=$('sky'),sctx=sky.getContext('2d');
  var stars=[],sparks=[];
  for(var i=0;i<150;i++){stars.push({x:rnd(i+1),y:rnd(i+400),r:.4+rnd(i+900)*1.3,p:rnd(i+1500)*6.28,v:.6+rnd(i+2000)*1.6});}
  for(var k=0;k<7;k++){sparks.push({x:.08+rnd(k+3000)*.84,y:.05+rnd(k+3100)*.9,s:7+rnd(k+3200)*9,p:rnd(k+3300)*6.28});}
  var W=0,H=0,dpr=1;
  function sizeSky(){
    dpr=Math.min(window.devicePixelRatio||1,2);
    W=window.innerWidth;H=window.innerHeight;
    sky.width=W*dpr;sky.height=H*dpr;sctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function spark(x,y,s,a){
    sctx.globalAlpha=a;sctx.fillStyle='#fff';sctx.beginPath();
    sctx.moveTo(x,y-s);sctx.quadraticCurveTo(x,y,x+s,y);sctx.quadraticCurveTo(x,y,x,y+s);
    sctx.quadraticCurveTo(x,y,x-s,y);sctx.quadraticCurveTo(x,y,x,y-s);sctx.fill();
  }
  function drawSky(t){
    sctx.clearRect(0,0,W,H);
    stars.forEach(function(s){
      var a=reduce?.7:.45+.45*Math.sin(t*s.v+s.p);
      sctx.globalAlpha=Math.max(.08,a);sctx.fillStyle='#fff';
      sctx.beginPath();sctx.arc(s.x*W,s.y*H,s.r,0,6.283);sctx.fill();
    });
    sparks.forEach(function(s){
      var a=reduce?.8:.35+.6*Math.abs(Math.sin(t*.7+s.p));
      spark(s.x*W,s.y*H,s.s,a);
    });
    sctx.globalAlpha=1;
  }
  sizeSky();drawSky(0);
  window.addEventListener('resize',function(){sizeSky();drawSky(performance.now()/1000);});
  if(!reduce){(function loop(ts){drawSky(ts/1000);requestAnimationFrame(loop);})(0);}

  /* ---------- Bordes rasgados ---------- */
  function tornPolygon(el,seed){
    var w=el.offsetWidth,h=el.offsetHeight,step=13,pts=[],i=0;
    if(!w||!h)return;
    function j(){i++;return 2+rnd(seed*57+i)*8;}
    function pt(x,y){pts.push(x.toFixed(1)+'px '+y.toFixed(1)+'px');}
    var n,k;
    n=Math.max(4,Math.round(w/step));
    for(k=0;k<=n;k++)pt(w*k/n,j());
    n=Math.max(2,Math.round(h/step));
    for(k=1;k<=n;k++)pt(w-j(),h*k/n);
    n=Math.max(4,Math.round(w/step));
    for(k=1;k<=n;k++)pt(w-w*k/n,h-j());
    n=Math.max(2,Math.round(h/step));
    for(k=1;k<n;k++)pt(j(),h-h*k/n);
    el.style.clipPath='polygon('+pts.join(',')+')';
  }
  document.querySelectorAll('.torn').forEach(function(el,ix){
    var run=function(){tornPolygon(el,ix+1);};
    run();
    if(window.ResizeObserver){new ResizeObserver(run).observe(el);}
    else{window.addEventListener('resize',run);}
  });

  /* ---------- Ajustes ---------- */
  var MAX_ARCHIVOS=10;   // fotos por vez
  var MAX_MB=10;         // peso máximo de cada foto ya achicada (el plan gratis de Cloudinary acepta hasta 10 MB)
  var LADO=1800;         // las fotos se achican a 1800 px de lado largo antes de subirlas
  var POR_PAGINA=24;     // cuántas fotos se muestran antes de "Ver más"

  var cfg=null;          // {cloud, preset, tag} llega desde el servidor
  var fotos=[];          // fotos que ya están en Cloudinary
  var recientes=[];      // fotos que se subieron en esta visita (se muestran enseguida)
  var visibles=POR_PAGINA;
  var cola=[];           // fotos elegidas para subir
  var subiendo=false;

  var form=$('subir-form'),input=$('archivos'),zona=$('zona'),lista=$('subidas'),
      btn=$('subir-btn'),msg=$('subir-msg'),
      grilla=$('grilla'),cuenta=$('cuenta'),vacio=$('vacio'),gmsg=$('galeria-msg'),mas=$('mas');

  /* ---------- Direcciones de Cloudinary ---------- */
  function conTransformacion(url,t){
    return url.indexOf('/upload/')>-1?url.replace('/upload/','/upload/'+t+'/'):url;
  }
  function miniatura(url){return conTransformacion(url,'c_limit,w_520,q_auto,f_auto');}
  function grande(url){return conTransformacion(url,'c_limit,w_1800,q_auto,f_auto');}
  function descarga(url){return conTransformacion(url,'fl_attachment');}

  /* ---------- Lista de fotos ---------- */
  function todas(){
    var ids={};
    recientes.forEach(function(f){ids[f.id]=true;});
    return recientes.concat(fotos.filter(function(f){return !ids[f.id];}));
  }
  function dibujar(){
    var l=todas();
    grilla.textContent='';
    l.slice(0,visibles).forEach(function(f,i){
      var b=document.createElement('button');
      b.type='button';b.className='foto';b.setAttribute('aria-label','Ver foto '+(i+1));
      var img=document.createElement('img');
      img.alt='';img.loading='lazy';img.decoding='async';
      if(f.ancho&&f.alto){img.width=f.ancho;img.height=f.alto;}
      var listo=function(){img.classList.add('listo');};
      img.addEventListener('load',listo);img.addEventListener('error',listo);
      img.src=miniatura(f.url);
      if(img.complete)listo();
      b.appendChild(img);
      b.addEventListener('click',function(){abrir(i);});
      grilla.appendChild(b);
    });
    cuenta.textContent=l.length?(l.length+(l.length===1?' foto':' fotos')):'';
    vacio.hidden=l.length>0||!cfg;
    mas.hidden=visibles>=l.length;
  }
  mas.addEventListener('click',function(){visibles+=POR_PAGINA;dibujar();});

  function cargar(){
    return fetch('/api/galeria').then(function(r){
      if(!r.ok)throw new Error('lectura');
      return r.json();
    }).then(function(d){
      cfg={cloud:d.cloud,preset:d.preset,tag:d.tag};
      fotos=d.fotos||[];
      gmsg.textContent='';
      dibujar();
      actualizarBoton();
    }).catch(function(){
      gmsg.textContent='No se pudo cargar la galería. Probá recargar la página.';
      msg.textContent='Por ahora no se pueden subir fotos. Probá recargar la página.';
    });
  }

  /* ---------- Elegir fotos ---------- */
  function actualizarBoton(){
    var pendientes=cola.filter(function(c){return c.estado==='espera'||c.estado==='error';}).length;
    btn.disabled=subiendo||!cfg||pendientes===0;
  }
  function agregar(archivos){
    msg.textContent='';
    var nuevos=Array.prototype.slice.call(archivos).filter(function(f){return /^image\//.test(f.type);});
    if(!nuevos.length){if(archivos.length)msg.textContent='Elegí archivos de imagen (JPG, PNG, WebP).';return;}
    var libres=MAX_ARCHIVOS-cola.length;
    if(nuevos.length>libres){
      msg.textContent='Podés subir hasta '+MAX_ARCHIVOS+' fotos por vez.';
      nuevos=nuevos.slice(0,Math.max(0,libres));
    }
    nuevos.forEach(function(file){
      var li=document.createElement('li');li.className='espera';
      var img=document.createElement('img');img.alt='';
      var url=URL.createObjectURL(file);
      img.src=url;img.addEventListener('load',function(){URL.revokeObjectURL(url);});
      var info=document.createElement('div');info.className='info';
      var nom=document.createElement('div');nom.className='nom';nom.textContent=file.name;
      var est=document.createElement('div');est.className='est';est.textContent='Lista para subir';
      var barra=document.createElement('div');barra.className='barra';
      var rel=document.createElement('i');barra.appendChild(rel);
      info.appendChild(nom);info.appendChild(est);info.appendChild(barra);
      var quitar=document.createElement('button');
      quitar.type='button';quitar.className='quitar';quitar.textContent='✕';quitar.setAttribute('aria-label','Quitar '+file.name);
      li.appendChild(img);li.appendChild(info);li.appendChild(quitar);
      lista.appendChild(li);
      var item={file:file,li:li,est:est,rel:rel,estado:'espera'};
      cola.push(item);
      quitar.addEventListener('click',function(){
        if(subiendo&&item.estado==='subiendo')return;
        cola.splice(cola.indexOf(item),1);li.remove();actualizarBoton();
      });
    });
    actualizarBoton();
  }
  input.addEventListener('change',function(){agregar(input.files);input.value='';});

  ['dragenter','dragover'].forEach(function(n){
    zona.addEventListener(n,function(e){e.preventDefault();zona.classList.add('encima');});
  });
  ['dragleave','drop'].forEach(function(n){
    zona.addEventListener(n,function(e){e.preventDefault();zona.classList.remove('encima');});
  });
  zona.addEventListener('drop',function(e){
    if(e.dataTransfer&&e.dataTransfer.files)agregar(e.dataTransfer.files);
  });

  /* ---------- Preparar y subir ---------- */
  /* Achica la foto (y le aplica la orientación correcta) para que suba rápido, incluso con datos móviles */
  function preparar(file){
    return new Promise(function(ok){
      function original(){ok(file);}
      if(!window.createImageBitmap)return original();
      createImageBitmap(file,{imageOrientation:'from-image'}).then(function(bmp){
        var k=Math.min(1,LADO/Math.max(bmp.width,bmp.height));
        var w=Math.max(1,Math.round(bmp.width*k)),h=Math.max(1,Math.round(bmp.height*k));
        var c=document.createElement('canvas');c.width=w;c.height=h;
        var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(bmp,0,0,w,h);
        if(bmp.close)bmp.close();
        c.toBlob(function(b){ok(b||file);},'image/jpeg',.86);
      },original);
    });
  }
  function enviar(blob,item){
    return new Promise(function(ok,fail){
      var fd=new FormData();
      fd.append('file',blob,'foto.jpg');
      fd.append('upload_preset',cfg.preset);
      fd.append('tags',cfg.tag);
      var xhr=new XMLHttpRequest();
      xhr.open('POST','https://api.cloudinary.com/v1_1/'+encodeURIComponent(cfg.cloud)+'/image/upload');
      xhr.upload.onprogress=function(e){
        if(e.lengthComputable){item.rel.style.width=Math.round(e.loaded/e.total*100)+'%';}
      };
      xhr.onload=function(){
        var r=null;
        try{r=JSON.parse(xhr.responseText);}catch(e){}
        if(xhr.status>=200&&xhr.status<300&&r&&r.secure_url)return ok(r);
        fail(new Error('Cloudinary respondió '+xhr.status+' '+(r&&r.error?r.error.message:xhr.responseText.slice(0,200))));
      };
      xhr.onerror=function(){fail(new Error('Sin conexión con Cloudinary'));};
      xhr.send(fd);
    });
  }
  function marcar(item,estado,texto){
    item.estado=estado;item.li.className=estado;item.est.textContent=texto;
  }
  function subirUna(item){
    marcar(item,'subiendo','Preparando…');item.rel.style.width='0';
    return preparar(item.file).then(function(blob){
      if(blob.size>MAX_MB*1024*1024)throw new Error('pesa demasiado');
      marcar(item,'subiendo','Subiendo…');
      return enviar(blob,item);
    }).then(function(r){
      item.rel.style.width='100%';
      marcar(item,'ok','Lista ✓');
      recientes.unshift({id:r.public_id,url:r.secure_url,ancho:r.width,alto:r.height});
      dibujar();
      return true;
    }).catch(function(e){
      console.error('Galería:',e.message||e);
      marcar(item,'error',e.message==='pesa demasiado'?'La foto pesa demasiado':'No se pudo subir. Probá de nuevo.');
      return false;
    });
  }
  form.addEventListener('submit',function(e){
    e.preventDefault();
    if(subiendo||!cfg)return;
    var pendientes=cola.filter(function(c){return c.estado==='espera'||c.estado==='error';});
    if(!pendientes.length)return;
    subiendo=true;actualizarBoton();msg.textContent='';
    var subidas=0,seguir=Promise.resolve();
    pendientes.forEach(function(item){
      seguir=seguir.then(function(){return subirUna(item);}).then(function(ok){if(ok)subidas++;});
    });
    seguir.then(function(){
      subiendo=false;
      var fallaron=pendientes.length-subidas;
      if(!fallaron)msg.textContent=subidas===1?'¡Listo! Tu foto ya está en la galería.':'¡Listo! Tus '+subidas+' fotos ya están en la galería.';
      else if(subidas)msg.textContent='Se subieron '+subidas+'. '+fallaron+(fallaron===1?' no se pudo subir.':' no se pudieron subir.');
      else msg.textContent='No se pudo subir. Revisá tu conexión y probá de nuevo.';
      setTimeout(function(){
        cola=cola.filter(function(c){
          if(c.estado==='ok'){c.li.remove();return false;}
          return true;
        });
        actualizarBoton();
      },2500);
      actualizarBoton();
    });
  });

  /* ---------- Visor ---------- */
  var visor=$('visor'),marco=$('visor-marco'),vFoto=$('visor-foto'),vImg=$('v-img'),
      vNum=$('v-num'),vDesc=$('v-desc'),vPrev=$('v-prev'),vNext=$('v-next');
  var actual=0;
  function mostrar(){
    var l=todas(),f=l[actual];
    if(!f)return;
    vImg.src=grande(f.url);
    vImg.alt='Foto '+(actual+1)+' de '+l.length;
    vNum.textContent=(actual+1)+' / '+l.length;
    vDesc.href=descarga(f.url);
    vPrev.hidden=vNext.hidden=l.length<2;
  }
  function abrir(i){
    actual=i;mostrar();
    if(!visor.open){
      if(visor.showModal)visor.showModal();else visor.setAttribute('open','');
    }
  }
  function mover(d){
    var n=todas().length;
    if(!n)return;
    actual=(actual+d+n)%n;mostrar();
  }
  function cerrar(){
    if(visor.close)visor.close();else visor.removeAttribute('open');
    vImg.removeAttribute('src');
  }
  vPrev.addEventListener('click',function(){mover(-1);});
  vNext.addEventListener('click',function(){mover(1);});
  $('v-cerrar').addEventListener('click',cerrar);
  visor.addEventListener('click',function(e){
    if(e.target===visor||e.target===marco||e.target===vFoto)cerrar();
  });
  visor.addEventListener('keydown',function(e){
    if(e.key==='ArrowLeft')mover(-1);
    else if(e.key==='ArrowRight')mover(1);
  });
  visor.addEventListener('close',function(){vImg.removeAttribute('src');});
  var toqueX=null;
  vFoto.addEventListener('touchstart',function(e){toqueX=e.touches[0].clientX;},{passive:true});
  vFoto.addEventListener('touchend',function(e){
    if(toqueX===null)return;
    var dx=e.changedTouches[0].clientX-toqueX;toqueX=null;
    if(Math.abs(dx)>50)mover(dx<0?1:-1);
  },{passive:true});

  cargar();
})();