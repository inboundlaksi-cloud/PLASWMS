(function(){
 'use strict';
 if(window.PLAS_WAREHOUSE_REFRESH_VERSION)return;
 const scene=()=>{const el=document.createElement('div');el.className='warehouse-scene';el.setAttribute('aria-hidden','true');el.innerHTML='<div class="warehouse-belt"></div><div class="warehouse-run-lane"><div class="warehouse-actor warehouse-runner"></div></div><div class="warehouse-station"><div class="warehouse-actor warehouse-scanner"></div><div class="warehouse-flying-box"></div></div><div class="warehouse-sign-station"><div class="warehouse-actor warehouse-signer"></div><div class="warehouse-sign-text">รอสักครู่<small>กำลังโหลด…</small></div></div>';return el;};
 const auth=document.getElementById('screen-auth');if(auth){const background=scene();background.querySelector('.warehouse-sign-station').hidden=true;auth.prepend(background);}
 const overlay=document.getElementById('loading-overlay');if(overlay){const panel=document.createElement('div');panel.className='warehouse-loading';panel.append(scene());const p=document.createElement('p');p.textContent='กำลังเตรียมพื้นที่ทำงาน…';p.setAttribute('role','status');panel.append(p);const bar=document.createElement('div');bar.className='warehouse-progress';panel.append(bar);overlay.replaceChildren(panel);}
 const reduce=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
 const scenes=Array.from(document.querySelectorAll('.warehouse-scene'));let raf=0,start=null,last=0;
 const visible=s=>s.isConnected&&!s.closest('.hidden,[hidden]');
 function frame(el,n){el.style.backgroundPosition=(n%6)*20+'% '+Math.floor(n/6)*100/3+'%';}
 function draw(elapsed){scenes.filter(visible).forEach(s=>{
  const run=s.querySelector('.warehouse-runner'),scan=s.querySelector('.warehouse-scanner'),sign=s.querySelector('.warehouse-signer'),lane=s.querySelector('.warehouse-run-lane');
  frame(run,Math.floor(elapsed/40)%24);frame(scan,Math.floor(elapsed/160)%24);frame(sign,Math.floor(elapsed/120)%24);
  run.style.transform='translate3d('+(reduce.matches?lane.clientWidth*.25:lane.clientWidth-(elapsed%6000)/6000*(lane.clientWidth+(run.clientWidth||130)))+'px,0,0)';
  const phase=(elapsed%3840)/3840,box=s.querySelector('.warehouse-flying-box'),flying=phase>=.75&&phase<.94;box.style.opacity=flying?'1':'0';
  if(flying){const t=(phase-.75)/.19;box.style.transform='translate('+(-100*t)+'px,'+(-90*4*t*(1-t)+35*t)+'px) rotate('+(-240*t)+'deg)';}
 });}
 function animate(now){raf=0;if(document.hidden||reduce.matches||!scenes.some(visible))return;if(start===null)start=now;if(now-last>=1000/24){last=now;draw(now-start);}raf=requestAnimationFrame(animate);}
 function resume(){if(raf){cancelAnimationFrame(raf);raf=0;}if(!document.hidden&&!reduce.matches&&scenes.some(visible))raf=requestAnimationFrame(animate);}
 draw(0);resume();document.addEventListener('visibilitychange',resume);if(reduce.addEventListener)reduce.addEventListener('change',resume);
 const visibilityObserver=new MutationObserver(resume);[auth,overlay].filter(Boolean).forEach(el=>visibilityObserver.observe(el,{attributes:true,attributeFilter:['class','hidden']}));
 const input=document.getElementById('inp-new-loc');if(input){let selected=-1;const reset=()=>{selected=-1;input.removeAttribute('aria-activedescendant');};input.setAttribute('role','combobox');input.setAttribute('aria-expanded','false');input.addEventListener('input',reset);
  input.addEventListener('keydown',e=>{const list=document.getElementById('recv514-location-list');if(!list)return;if(e.key==='Escape'){list.classList.remove('is-open');input.setAttribute('aria-expanded','false');reset();return;}const options=Array.from(list.querySelectorAll('[data-location]'));if(!list.classList.contains('is-open')||!options.length){reset();return;}
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();selected=selected<0?(e.key==='ArrowDown'?0:options.length-1):(selected+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options.forEach((o,i)=>{o.id='warehouse-location-'+i;o.setAttribute('aria-selected',String(i===selected));});input.setAttribute('aria-activedescendant',options[selected].id);options[selected].scrollIntoView({block:'nearest'});}
   if(e.key==='Enter'&&selected>=0&&options[selected]){e.preventDefault();e.stopImmediatePropagation();options[selected].click();reset();}
  },true);
  new MutationObserver(()=>{const list=document.getElementById('recv514-location-list');const open=!!list&&list.classList.contains('is-open');input.setAttribute('aria-expanded',String(open));if(!open)reset();}).observe(input.parentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
 }
 document.addEventListener('click',e=>{const option=e.target.closest('[data-location]');if(!option||!option.closest('#recv514-location-list'))return;try{const value=option.getAttribute('data-location');let prior=JSON.parse(localStorage.getItem('plas-location-history')||'[]');if(!Array.isArray(prior))prior=[];localStorage.setItem('plas-location-history',JSON.stringify([value,...prior.filter(x=>typeof x==='string'&&x!==value)].slice(0,50)));}catch(error){}},true);
 window.PLAS_WAREHOUSE_REFRESH_VERSION='5.16.1';
})();
