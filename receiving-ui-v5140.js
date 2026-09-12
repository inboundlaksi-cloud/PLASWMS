/* PLAS WMS v5.14.0 — Receiving UI, AX COMP copy and Location autocomplete */
(function(root){
  'use strict';
  var app=root&&root.app;
  if(!app||app.__receivingUi5140Installed)return;
  app.__receivingUi5140Installed=true;

  function clean(value){return String(value==null?'':value).trim();}
  function upper(value){return clean(value).toUpperCase();}
  function escapeHtml(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function activeItems(){return ((app.state&&app.state.data&&app.state.data.items)||[]).filter(function(item){return item&&item.status!=='Deleted'&&item.status!=='Rejected'&&!((!item.qty||Number(item.qty)<=0)&&(item.splitGroupId||item.status==='Split'));});}

  app.copyReceivingAxComps=function(){
    var visible=Array.prototype.slice.call(document.querySelectorAll('#view-pending .item-enter[data-plas-comp]')).filter(function(node){return node.offsetParent!==null;});
    var comps=visible.map(function(node){return upper(node.getAttribute('data-plas-comp'));}).filter(function(value){return value&&value!=='-';});
    if(!comps.length){
      comps=activeItems().filter(function(item){return item.status!=='Done'&&item.status!=='Written';}).map(function(item){return upper(item.comp);}).filter(function(value){return value&&value!=='-';});
    }
    comps=Array.from(new Set(comps));
    if(!comps.length){this.toast&&this.toast('ไม่พบเลข COMP สำหรับค้นหา AX','info');return;}
    this.copyText(comps.join(','),'COMP สำหรับ AX');
    var count=document.getElementById('recv-ax-copy-count');if(count)count.textContent=comps.length;
  };

  app.openTscCurrentLabel=function(){
    var item=this.state&&this.state.current&&this.state.current.item;
    if(!item){this.showError&&this.showError('ไม่พบรายการที่ต้องการพิมพ์');return;}
    if(item.status==='Done'){this.showError&&this.showError('รายการรับแล้วไม่อยู่ในขั้นตอนพิมพ์ป้าย');return;}
    this._niimbotBatch=[item];
    this._tscFreebieMode=false;
    this.niimbotPrintPDF();
  };

  app._receivingLocationChoices=function(query){
    var current=this.state&&this.state.current&&this.state.current.item||{};
    var map=new Map();
    function add(value,source,priority,meta){
      var loc=upper(typeof value==='object'?(value.code||value.location||value.loc||value.name):value);
      if(!loc)return;
      var found=map.get(loc)||{loc:loc,priority:99,sources:[],uses:0,available:null,warehouse:''};
      found.priority=Math.min(found.priority,priority);
      if(source&&found.sources.indexOf(source)<0)found.sources.push(source);
      if(meta&&meta.used)found.uses+=1;
      if(meta&&meta.available!=null&&meta.available!=='')found.available=Number(meta.available)||0;
      if(meta&&meta.warehouse)found.warehouse=clean(meta.warehouse);
      map.set(loc,found);
    }
    try{JSON.parse(localStorage.getItem('plas-location-history')||'[]').slice(0,50).forEach(function(loc){add(loc,'เคยเลือกบนเครื่องนี้',2,{used:true});});}catch(e){}
    if(current.oldLoc)add(current.oldLoc,'LOCATION เดิม',0,{used:true});
    if(current.newLoc)add(current.newLoc,'รายการนี้',0,{used:true});
    activeItems().forEach(function(item){
      var same=upper(item.comp)===upper(current.comp);
      [item.newLoc,item.oldLoc,item.location,item.axLocation].forEach(function(loc){if(loc)add(loc,same?'COMP เดียวกัน':'เคยใช้ในงาน',same?1:4,{used:true,available:item.qtyHand,warehouse:item.warehouse||item.axWarehouse});});
    });
    var master=(this.state&&this.state.config&&this.state.config.masterLocations)||[];
    master.forEach(function(loc){add(loc,'รายการ LOCATION',3,{warehouse:loc&&typeof loc==='object'?(loc.warehouse||loc.wh):''});});
    var needle=upper(query);
    return Array.from(map.values()).filter(function(row){return !needle||row.loc.indexOf(needle)>=0;}).sort(function(a,b){
      var aStarts=needle&&a.loc.indexOf(needle)===0?0:1,bStarts=needle&&b.loc.indexOf(needle)===0?0:1;
      return aStarts-bStarts||a.priority-b.priority||b.uses-a.uses||a.loc.localeCompare(b.loc);
    }).slice(0,8);
  };

  app._renderReceivingLocationAutocomplete=function(){
    var input=document.getElementById('inp-new-loc');
    var list=document.getElementById('recv514-location-list');
    if(!input||!list)return;
    var query=upper(input.value);
    if(input.disabled){list.classList.remove('is-open');list.innerHTML='';return;}
    var rows=this._receivingLocationChoices(query);
    var current=this.state&&this.state.current&&this.state.current.item||{};
    var assigned={};
    activeItems().forEach(function(item){var loc=upper(item.newLoc);if(loc&&String(item.id)!==String(current.id)){assigned[loc]=(assigned[loc]||0)+1;}});
    if(!rows.length){list.innerHTML='<div class="recv514-autocomplete-empty">ไม่พบ LOCATION ที่ตรงกัน — สามารถพิมพ์ค่าใหม่ต่อได้</div>';list.classList.add('is-open');return;}
    list.innerHTML='<div class="recv514-autocomplete-head">แนะนำ '+rows.length+' LOCATION · แตะเพื่อเลือก</div>'+rows.map(function(row){
      var note=row.sources.slice(0,2).join(' · ')+(row.warehouse?' · Warehouse '+row.warehouse:'');
      var side=row.available!=null?'On Hand '+row.available:(assigned[row.loc]?'ถูกใช้ '+assigned[row.loc]+' งาน':'เลือก');
      return '<button type="button" class="recv514-autocomplete-option" role="option" data-location="'+escapeHtml(row.loc)+'"><span><b>'+escapeHtml(row.loc)+'</b><small>'+escapeHtml(note||'LOCATION ที่เคยใช้')+'</small></span><em>'+escapeHtml(side)+'</em></button>';
    }).join('');
    list.classList.add('is-open');
    Array.prototype.forEach.call(list.querySelectorAll('[data-location]'),function(button){button.addEventListener('mousedown',function(event){event.preventDefault();});button.addEventListener('click',function(){input.value=button.getAttribute('data-location');input.dispatchEvent(new Event('input',{bubbles:true}));list.classList.remove('is-open');input.focus();});});
  };

  app._prepareReceivingAutocomplete=function(){
    var container=document.getElementById('inp-new-loc-container');
    var input=document.getElementById('inp-new-loc');
    if(!container||!input)return;
    container.classList.add('recv514-loc-wrap');
    if(!document.getElementById('recv514-loc-icon')){
      var icon=document.createElement('i');icon.id='recv514-loc-icon';icon.className='ph ph-caret-down recv514-loc-icon';icon.setAttribute('aria-hidden','true');container.appendChild(icon);
    }
    var list=document.getElementById('recv514-location-list');
    if(!list){list=document.createElement('div');list.id='recv514-location-list';list.className='recv514-autocomplete';list.setAttribute('role','listbox');list.setAttribute('aria-label','คำแนะนำ LOCATION');container.appendChild(list);}
    input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls','recv514-location-list');input.setAttribute('spellcheck','false');
    if(!input.dataset.recv514Bound){
      input.dataset.recv514Bound='1';
      input.addEventListener('input',function(){app._renderReceivingLocationAutocomplete();});
      input.addEventListener('focus',function(){app._renderReceivingLocationAutocomplete();});
      input.addEventListener('blur',function(){setTimeout(function(){var node=document.getElementById('recv514-location-list');if(node)node.classList.remove('is-open');},160);});
      input.addEventListener('keydown',function(event){if(event.key==='Escape'){list.classList.remove('is-open');}});
    }
    this._renderReceivingLocationAutocomplete();
  };

  app._refreshReceivingDetailDesign=function(){
    var item=this.state&&this.state.current&&this.state.current.item;
    if(!item)return;
    var code=document.getElementById('m-item-code');
    if(code){
      code.innerHTML='<div class="recv514-head"><span class="recv514-head-label">COMP · เลขหลัก</span><div class="recv514-head-row"><span class="recv514-head-value">'+escapeHtml(item.comp||'-')+'</span><button type="button" class="recv514-head-copy" data-copy-value="'+escapeHtml(item.comp||'')+'" data-copy-label="COMP" onclick="return window.app.copyFromButton(event,this)"><i class="ph ph-copy"></i> COPY</button></div><div class="recv514-sap"><span>SAP '+escapeHtml(item.code||'-')+'</span><button type="button" data-copy-value="'+escapeHtml(item.code||'')+'" data-copy-label="เลข SAP" onclick="return window.app.copyFromButton(event,this)" aria-label="คัดลอกเลข SAP"><i class="ph ph-copy"></i></button></div></div>';
    }
    var qty=document.getElementById('m-item-qty'),old=document.getElementById('m-old-loc'),po=document.getElementById('m-item-po');
    if(qty&&old&&po){
      var facts=qty.closest('.grid,.recv514-facts');
      if(facts){facts.className='recv514-facts';facts.innerHTML='<div class="recv514-fact qty"><span>จำนวน (QTY)</span><strong id="m-item-qty">'+escapeHtml(item.qty||0)+'</strong></div><div class="recv514-fact"><span>LOCATION เดิม</span><strong id="m-old-loc">'+escapeHtml(item.oldLoc||'ไม่มี LOC')+'</strong></div><div class="recv514-fact recv514-extra"><span>PO / ITEM NUMBER</span><b id="m-item-po">'+escapeHtml(item.po||'-')+(item.batch?' · Batch '+escapeHtml(item.batch):'')+(item.importSource==='AX_COPY'||item.axQtyOnhand!=null||Number(item.qtyHand)!==0?' · On Hand '+escapeHtml(Number(item.qtyHand)||0):'')+'</b><button type="button" class="copy-mini-btn" data-copy-value="'+escapeHtml(item.po||'')+'" data-copy-label="PO / ITEM NUMBER" onclick="return window.app.copyFromButton(event,this)" aria-label="คัดลอก PO"><i class="ph ph-copy"></i></button><span id="m-item-comp" class="hidden"></span></div>';}
    }
    var print=document.getElementById('btn-niimbot-label');
    if(print){print.setAttribute('onclick','window.app.openTscCurrentLabel()');print.innerHTML='<i class="ph ph-printer text-2xl"></i><span>พิมพ์สติกเกอร์ TSC</span>';}
    var shared=document.getElementById('shared-input-area');
    if(shared&&!shared.querySelector('.recv514-source-note')){var note=document.createElement('p');note.className='recv514-source-note';note.innerHTML='<i class="ph ph-magic-wand"></i> เลือกตำแหน่งที่เคยใช้ หรือพิมพ์เพื่อค้นหา LOCATION';shared.appendChild(note);}
    this._prepareReceivingAutocomplete();
  };

  var originalOpenModal=app.openModal&&app.openModal.bind(app);
  if(originalOpenModal){app.openModal=function(id){originalOpenModal(id);this._refreshReceivingDetailDesign();};}

  function installToolbar(){
    var actions=document.querySelector('#receiving-workflow-toolbar .recv-toolbar-actions');
    if(actions&&!document.getElementById('btn-copy-ax-comps')){
      var button=document.createElement('button');button.id='btn-copy-ax-comps';button.type='button';button.className='recv-ax-copy-btn';button.innerHTML='<i class="ph ph-copy"></i><span>COPY COMP ทั้งหมด</span><b id="recv-ax-copy-count">0</b>';button.addEventListener('click',function(){app.copyReceivingAxComps();});actions.insertBefore(button,actions.firstChild);
    }
    updateAxCount();
  }
  function updateAxCount(){
    var count=document.getElementById('recv-ax-copy-count');if(!count)return;
    var comps=Array.prototype.slice.call(document.querySelectorAll('#view-pending .item-enter[data-plas-comp]')).map(function(node){return upper(node.getAttribute('data-plas-comp'));}).filter(function(value){return value&&value!=='-';});
    count.textContent=Array.from(new Set(comps)).length;
  }
  installToolbar();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installToolbar);
  setTimeout(installToolbar,600);
  setTimeout(function(){var list=document.getElementById('view-pending');if(list&&root.MutationObserver){new MutationObserver(updateAxCount).observe(list,{childList:true,subtree:true});updateAxCount();}},800);
})(window);
