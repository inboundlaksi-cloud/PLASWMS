/* PLAS 5.20 — layout only; retain original controls, identity and write handlers. */
(function(){
 'use strict';const app=window.app;if(!app||app.__pastelWorkspace)return;app.__pastelWorkspace=true;
 document.documentElement.classList.add('plas-pastel');
 const el=(tag,cls,txt)=>{const n=document.createElement(tag);n.className=cls;if(txt)n.textContent=txt;return n;};
 const wrap=(name,after)=>{const old=app[name];if(typeof old==='function')app[name]=function(...args){const result=old.apply(this,args);after.apply(this,args);return result;};};
 const auth=document.getElementById('screen-auth');
 if(auth){
  auth.querySelector(':scope>.warehouse-scene')?.remove();
  const scene=el('div','pastel-login-scene');scene.setAttribute('aria-hidden','true');auth.prepend(scene);
  const intro=el('div','pastel-login-intro');intro.innerHTML='<div class="pastel-brand"><i class="ph ph-leaf" aria-hidden="true"></i> PLAS <span>WMS</span></div>';auth.append(intro);
  const content=auth.querySelector(':scope>.custom-scroll');if(content){content.classList.add('pastel-login-panel');const heading=content.querySelector('h1');if(heading){heading.parentElement.classList.add('pastel-login-heading');heading.nextElementSibling.textContent='เลือกโปรไฟล์เพื่อเริ่มงาน';}content.firstElementChild.classList.add('pastel-login-tools');}
 }
 const screen=document.getElementById('screen-user'),nav=screen?.querySelector('.workflow-tabs');
 const labels={pending:'รับเข้า',written:'เขียนแล้ว',done:'รับแล้ว',topup:'เติมสินค้า',move:'ย้ายสินค้า',issues:'ปัญหา',history:'ประวัติ',rejected:'ยกเลิก'};
 if(screen&&nav){
  const sidebar=el('aside','pastel-sidebar');sidebar.setAttribute('aria-label','เมนูหลัก');
  const brand=el('div','pastel-brand');brand.innerHTML='<i class="ph ph-leaf" aria-hidden="true"></i><span>PLAS<br>WMS</span>';sidebar.append(brand,nav);screen.prepend(sidebar);
  nav.querySelectorAll('button[id^="tab-"]').forEach(b=>{const key=b.id.slice(4);b.setAttribute('aria-label',labels[key]);[...b.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.textContent='');const label=el('span','pastel-nav-label',labels[key]);b.querySelector('i')?.after(label);});
  const more=el('button','pastel-more');more.type='button';more.innerHTML='<i class="ph ph-dots-three"></i><span>เพิ่มเติม</span>';more.setAttribute('aria-expanded','false');more.addEventListener('click',()=>{const open=sidebar.classList.toggle('is-expanded');more.setAttribute('aria-expanded',String(open));});nav.querySelector('div').append(more);
  nav.addEventListener('keydown',e=>{if(e.key==='Escape'){sidebar.classList.remove('is-expanded');more.setAttribute('aria-expanded','false');more.focus();}});
  nav.addEventListener('click',e=>{if(e.target.closest('[id^="tab-"]')){sidebar.classList.remove('is-expanded');more.setAttribute('aria-expanded','false');}});
  const heading=screen.querySelector('header h1');if(heading){heading.id='pastel-page-title';heading.textContent='รายการรับเข้า';}
  const summary=el('section','pastel-summary');summary.setAttribute('aria-label','สรุปงานรับเข้า');
  [['pending','รอเขียน','clipboard-text'],['written','เขียนแล้ว','check-square'],['issues','รอตรวจสอบ','warning-circle']].forEach(([tab,label,icon])=>{const b=el('button','pastel-stat pastel-stat-'+tab);b.type='button';b.innerHTML='<i class="ph ph-'+icon+'" aria-hidden="true"></i><span>'+label+'<strong data-pastel-count="'+tab+'">0</strong></span>';b.addEventListener('click',()=>app.switchTab(tab));summary.append(b);});
  screen.querySelector('#search-container').before(summary);
 }
 function sync(){
  let active=Object.keys(labels).find(k=>{const view=document.getElementById('view-'+k);return view&&!view.classList.contains('hidden');})||'pending';
  Object.keys(labels).forEach(k=>document.getElementById('tab-'+k)?.setAttribute('aria-current',active===k?'page':'false'));
  const title=document.getElementById('pastel-page-title');if(title)title.textContent=active==='pending'?'รายการรับเข้า':labels[active];
  document.querySelector('.pastel-summary')?.classList.toggle('hidden',!['pending','written'].includes(active));
  const counts={pending:app.getPendingItems?.().length||0,written:app.getWrittenItems?.().length||0,issues:app.getIssueItems?.().length||0};
  document.querySelectorAll('[data-pastel-count]').forEach(n=>n.textContent=counts[n.dataset.pastelCount]);
 }
 ['switchTab','updateBadges','renderPending','renderWritten','renderIssues'].forEach(name=>wrap(name,sync));
 const main=document.getElementById('user-workspace-main');if(main)new MutationObserver(sync).observe(main,{childList:true});
 const detailHeader=document.getElementById('m-item-code')?.parentElement?.parentElement;if(detailHeader)detailHeader.classList.add('pastel-detail-header');
 sync();
})();
