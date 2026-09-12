/*
 * PLAS WMS v5.11.2 — Receiving / Written label workflow
 * Receiving and Written can print. Printing only records sticker evidence and never changes work status.
 */
(function(root){
  'use strict';
  var app=root&&root.app;
  if(!app||app.__labelPrintWorkflowInstalled)return;
  app.__labelPrintWorkflowInstalled=true;

  var SESSIONS_KEY='plas_label_print_sessions_v3';
  var AUDIT_KEY='plas_label_print_audit_v3';
  var MAX_SESSIONS=150;
  var MAX_AUDIT=800;
  var original={
    executeNiimbotLabels:app.executeNiimbotLabels&&app.executeNiimbotLabels.bind(app),
    executePrintLabels:app.executePrintLabels&&app.executePrintLabels.bind(app),
    logPrintHistory:app._logPrintHistory&&app._logPrintHistory.bind(app)
  };

  function clean(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function js(v){return "'"+String(v==null?'':v).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/</g,'\\x3C')+"'";}
  function who(){return clean(app.state&&app.state.ui&&app.state.ui.currentUser).replace(/^(Admin|User|Supervisor):\s*/i,'')||'-';}
  function read(key,fallback){try{var value=JSON.parse(localStorage.getItem(key)||'null');return value==null?fallback:value;}catch(e){return fallback;}}
  function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch(e){}}
  function dateTime(ts){
    if(!ts)return '-';
    var d=new Date(ts);
    return d.toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'2-digit'})+' '+d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
  }
  function hashText(value){
    var h=2166136261,s=String(value||'');
    for(var n=0;n<s.length;n++){h^=s.charCodeAt(n);h=Math.imul(h,16777619);}
    return (h>>>0).toString(36).toUpperCase().padStart(7,'0');
  }
  function pairCode(item){
    if(!item)return '';
    if(clean(item.labelPairCode))return clean(item.labelPairCode).toUpperCase();
    var raw=clean(item.id||item.uuid||item.barcode||item.code),code;
    if(/^\d+$/.test(raw))code='PL-'+raw.padStart(8,'0');
    else{
      var safe=raw.toUpperCase().replace(/[^A-Z0-9]/g,'');
      code=safe&&safe.length<=12?'PL-'+safe:'PL-'+hashText(raw);
    }
    item.labelPairCode=code;
    return code;
  }
  function isWritten(item){return !!item&&item.status==='Written';}
  function isReceived(item){return !!item&&item.status==='Done';}
  function canPrint(item){return !!item&&!isReceived(item)&&item.status!=='Rejected'&&item.status!=='Deleted';}
  function activeItems(){
    return ((app.state&&app.state.data&&app.state.data.items)||[]).filter(function(i){
      return i.status!=='Deleted'&&!((!i.qty||Number(i.qty)<=0)&&(i.splitGroupId||i.status==='Split'));
    });
  }
  function itemById(id){return activeItems().find(function(i){return String(i.id)===String(id);});}
  function ensure(item){
    if(!item)return item;
    pairCode(item);
    var old=clean(item.labelPrintStatus).toLowerCase();
    var hasPrint=Number(item.labelPrintCount)>0||!!item.labelLastPrintedAt||['printed','printed_pending','confirmed','reprinted','applied'].indexOf(old)>=0;
    item.labelPrintStatus=hasPrint?'printed':'unprinted';
    item.labelAwaitingConfirm=false;
    if(!Number.isFinite(Number(item.labelPrintCount)))item.labelPrintCount=0;
    return item;
  }
  function statusInfo(item){
    ensure(item);
    if(item.labelPrintStatus==='printed')return{label:'พิมพ์สติกเกอร์แล้ว',cls:'printed',icon:'printer'};
    if(isWritten(item))return{label:'เขียนแล้ว · ยังไม่พิมพ์',cls:'written',icon:'check-circle'};
    return{label:'ยังไม่พิมพ์สติกเกอร์',cls:'unprinted',icon:'circle'};
  }
  function sessions(){return read(SESSIONS_KEY,[]);}
  function saveSessions(list){write(SESSIONS_KEY,(list||[]).slice(0,MAX_SESSIONS));updateHubBadge();}
  function audit(action,detail){
    var list=read(AUDIT_KEY,[]);
    list.unshift({id:'AUD-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),ts:Date.now(),action:action,user:who(),detail:detail||{}});
    write(AUDIT_KEY,list.slice(0,MAX_AUDIT));
  }
  function persist(items){
    try{app.saveData&&app.saveData();}catch(e){}
    (items||[]).forEach(function(item){try{app.saveToFirebase&&app.saveToFirebase('items',item);}catch(e){}});
    updateHubBadge();
    try{app._decorateReceivingCards&&app._decorateReceivingCards();}catch(e){}
    try{app._updateReceivingWorkflowUi&&app._updateReceivingWorkflowUi();}catch(e){}
  }
  function selectedItems(){
    var selected=app._printSelected||{};
    return activeItems().filter(function(i){return selected[String(i.id)]&&canPrint(i);});
  }
  function sameIds(a,b){
    a=(a||[]).map(String).sort();b=(b||[]).map(String).sort();
    return a.length===b.length&&a.every(function(value,index){return value===b[index];});
  }
  function makeSessionId(){
    var d=new Date(),pad=function(n){return String(n).padStart(2,'0');};
    var day=d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate());
    var max=sessions().filter(function(s){return String(s.id||'').indexOf('LB-'+day+'-')===0;}).reduce(function(value,s){return Math.max(value,parseInt(String(s.id).split('-').pop(),10)||0);},0);
    return 'LB-'+day+'-'+String(max+1).padStart(3,'0');
  }
  function updateHubBadge(){
    var count=activeItems().map(ensure).filter(function(i){return canPrint(i)&&i.labelPrintStatus==='unprinted';}).length;
    var el=document.getElementById('hub-label-pending-count');
    if(el){el.textContent=count;el.classList.toggle('hidden',count===0);}
  }

  app._labelEnsure=ensure;
  app._labelPairCode=pairCode;
  app._labelSessions=sessions;
  app._labelAudit=audit;
  app._labelIsWritten=isWritten;
  app._labelCanPrint=canPrint;

  app._labelRegisterPrint=function(items,method){
    items=(items||[]).filter(function(i){return i&&!i._topupStickerImport&&canPrint(i);}).map(ensure);
    if(!items.length)return null;
    var ids=items.map(function(i){return String(i.id);});
    var list=sessions(),reason=clean(this._labelReprintReason),active=list.find(function(s){return s.id===app._labelActiveSessionId;});
    if(active&&!reason&&sameIds(active.itemIds,ids)&&Date.now()-active.createdAt<20*60*1000){
      if(String(active.method||'').indexOf(method)<0)active.method=active.method?active.method+' / '+method:method;
      active.updatedAt=Date.now();
      var activeIndex=list.findIndex(function(s){return s.id===active.id;});if(activeIndex>=0)list[activeIndex]=active;
      saveSessions(list);return active;
    }
    var reprint=items.some(function(i){return i.labelPrintStatus==='printed'||Number(i.labelPrintCount)>0;});
    var id=makeSessionId(),stamp=Date.now(),operator=who(),previous={};
    items.forEach(function(i){previous[i.id]={status:i.labelPrintStatus,count:Number(i.labelPrintCount)||0,lastPrintedAt:i.labelLastPrintedAt||null,printedBy:i.labelPrintedBy||''};});
    var session={
      id:id,createdAt:stamp,updatedAt:stamp,status:'printed',method:method||'PRINT',user:operator,reprint:reprint,
      reason:reason||(reprint?'พิมพ์ซ้ำจากทางลัด':''),itemIds:ids,previous:previous,autoConfirmed:false,
      items:items.map(function(i){return{id:i.id,pairCode:pairCode(i),code:i.code,loc:i.newLoc||i.oldLoc||'',qty:i.qty,po:i.po||'',desc:i.desc||''};})
    };
    items.forEach(function(i){
      i.labelPrintStatus='printed';i.labelAwaitingConfirm=false;i.labelLastSessionId=id;i.labelLastPrintedAt=stamp;i.labelPrintedBy=operator;
      i.labelPrintCount=(Number(i.labelPrintCount)||0)+1;i.labelReprintReason=reprint?session.reason:'';
    });
    list.unshift(session);saveSessions(list);persist(items);
    audit(reprint?'LABEL_REPRINTED':'LABEL_PRINTED',{sessionId:id,method:method,count:items.length,reason:session.reason,itemIds:ids,pairCodes:items.map(pairCode)});
    this._labelActiveSessionId=id;this._labelReprintReason='';
    this.toast&&this.toast('บันทึกสถานะพิมพ์สติกเกอร์แล้ว '+items.length+' รายการ','success');
    return session;
  };
  app._logPrintHistory=function(items,printer){
    try{original.logPrintHistory&&original.logPrintHistory(items,printer);}catch(e){}
    if((items||[]).some(function(i){return i&&i._topupStickerImport;}))return null;
    return this._labelRegisterPrint(items,printer);
  };
  app._labelNeedsReprintReason=function(items){return(items||[]).some(function(i){ensure(i);return i.labelPrintStatus==='printed'||Number(i.labelPrintCount)>0;});};
  app._labelValidatePrint=function(items){
    if((items||[]).some(isReceived)){this.showError&&this.showError('รายการรับแล้วไม่อยู่ในขั้นตอนพิมพ์ป้าย');return false;}
    var missing=(items||[]).filter(function(i){return !clean(i.newLoc||i.oldLoc);});
    if(missing.length){this.showError&&this.showError('มี '+missing.length+' รายการยังไม่มี Location');return false;}
    return true;
  };

  app._openLabelReasonModal=function(items,action){
    var old=document.getElementById('modal-label-reprint-reason');if(old)old.remove();this._labelPendingPrintAction=action;
    var choices=['ป้ายเสีย','ป้ายหาย','พิมพ์ไม่ครบ','ข้อมูลผิด','เครื่องพิมพ์มีปัญหา','อื่นๆ'];
    var html='<div id="modal-label-reprint-reason" class="lpw-modal"><div class="lpw-dialog lpw-dialog-sm"><header class="lpw-dialog-head"><div><span class="lpw-eyebrow">REPRINT</span><h3><i class="ph ph-arrow-counter-clockwise"></i> ระบุเหตุผลพิมพ์ซ้ำ</h3><p>รายการนี้มีสถานะพิมพ์สติกเกอร์แล้ว ระบบจะเก็บเหตุผลไว้ในประวัติ</p></div><button onclick="window.app.closeLabelReasonModal()" aria-label="ปิด"><i class="ph ph-x"></i></button></header><div class="lpw-dialog-body"><div class="lpw-reason-grid">'+choices.map(function(x){return'<button type="button" onclick="window.app.pickLabelReason('+js(x)+')">'+esc(x)+'</button>';}).join('')+'</div><label class="lpw-field"><span>เหตุผล</span><textarea id="label-reprint-reason" rows="3" placeholder="เลือกด้านบนหรือพิมพ์รายละเอียด"></textarea></label></div><footer class="lpw-dialog-foot"><button class="secondary" onclick="window.app.closeLabelReasonModal()">ยกเลิก</button><button class="primary" onclick="window.app.confirmLabelReprintReason()"><i class="ph ph-check"></i> บันทึกและพิมพ์ซ้ำ</button></footer></div></div>';
    document.body.insertAdjacentHTML('beforeend',html);
  };
  app.pickLabelReason=function(value){var el=document.getElementById('label-reprint-reason');if(el)el.value=value;};
  app.closeLabelReasonModal=function(){var modal=document.getElementById('modal-label-reprint-reason');if(modal)modal.remove();this._labelPendingPrintAction=null;};
  app.confirmLabelReprintReason=function(){
    var reason=clean((document.getElementById('label-reprint-reason')||{}).value);if(!reason){this.showError&&this.showError('กรุณาระบุเหตุผลพิมพ์ซ้ำ');return;}
    this._labelReprintReason=reason;var action=this._labelPendingPrintAction,modal=document.getElementById('modal-label-reprint-reason');if(modal)modal.remove();this._labelPendingPrintAction=null;
    if(action==='niimbot')this.executeNiimbotLabels(true);else if(action==='a4')this.executePrintLabels(true);else{this.renderPrintSelectList();this.toast&&this.toast('บันทึกเหตุผลแล้ว เลือกเครื่องพิมพ์ได้เลย','success');}
  };
  app.executeNiimbotLabels=function(skipReason){
    var items=selectedItems();if(!items.length){this.showError&&this.showError('ยังไม่ได้เลือกรายการ');return;}
    if(!this._labelValidatePrint(items))return;
    if(!skipReason&&this._labelNeedsReprintReason(items)&&!clean(this._labelReprintReason)){this._openLabelReasonModal(items,'niimbot');return;}
    // v5.14.0: ใช้งานเครื่อง TSC เพียงแบบเดียว เปิดหน้าตั้งค่า TSC โดยตรง
    this._niimbotBatch=items.slice();
    this._tscFreebieMode=false;
    this.state.current.item=items[0];
    this.closePrintSelect();
    this.niimbotPrintPDF();
  };
  app.executePrintLabels=function(skipReason){
    var items=selectedItems();if(!items.length){this.showError&&this.showError('ยังไม่ได้เลือกรายการ');return;}
    if(!this._labelValidatePrint(items))return;
    if(!skipReason&&this._labelNeedsReprintReason(items)&&!clean(this._labelReprintReason)){this._openLabelReasonModal(items,'a4');return;}
    original.executePrintLabels&&original.executePrintLabels();
  };

  app._printablePool=function(){
    var tab=this._printWorkTab||'receiving';
    return activeItems().map(ensure).filter(function(i){return tab==='written'?isWritten(i):(!isWritten(i)&&!isReceived(i));});
  };
  app._printFilterCounts=function(){
    var all=activeItems().map(ensure).filter(canPrint),receiving=all.filter(function(i){return !isWritten(i);}),written=all.filter(isWritten);
    return{
      receiving:receiving.length,
      written:written.length,
      printed:all.filter(function(i){return i.labelPrintStatus==='printed';}).length,
      unprinted:all.filter(function(i){return i.labelPrintStatus==='unprinted';}).length
    };
  };
  app.showPrintWorkTab=function(tab){
    this._printWorkTab=tab==='written'?'written':'receiving';this._printSelected={};this._printExpanded=null;
    var shell=document.querySelector('#modal-print-select .lpw-shell');if(shell)shell.classList.toggle('is-written-tab',this._printWorkTab==='written');
    this.renderPrintSelectList();
  };
  app.setPrintFilter=function(filter){this.showPrintWorkTab(filter==='written'?'written':'receiving');};
  app._labelUpdateSummary=function(){
    var counts=this._printFilterCounts();
    Object.keys(counts).forEach(function(key){var el=document.getElementById('lpw-count-'+key);if(el)el.textContent=counts[key];});
    var receivingSummary=document.getElementById('lpw-count-receiving-summary');if(receivingSummary)receivingSummary.textContent=counts.receiving;
    document.querySelectorAll('[data-print-work-tab]').forEach(function(btn){btn.classList.toggle('is-active',btn.getAttribute('data-print-work-tab')===(app._printWorkTab||'receiving'));});
    updateHubBadge();
  };
  app.renderPrintSelectList=function(){
    var container=document.getElementById('print-select-list');if(!container)return;if(!this._printSelected)this._printSelected={};
    var query=clean((document.getElementById('print-search')||{}).value).toUpperCase(),pool=this._printablePool(),self=this;
    if(query)pool=pool.filter(function(i){return[i.code,i.comp,i.desc,i.po,i.newLoc,i.oldLoc,pairCode(i),i.labelLastSessionId].some(function(v){return String(v||'').toUpperCase().indexOf(query)>=0;});});
    if(!pool.length){container.innerHTML='<div class="lpw-empty"><i class="ph ph-package"></i><b>ไม่พบรายการในแท็บนี้</b><span>ลองเปลี่ยนคำค้นหาหรือกลับไปอีกแท็บ</span></div>';this._updatePrintCount();this._labelUpdateSummary();return;}
    container.innerHTML=pool.map(function(i){
      var locked=!canPrint(i),checked=!locked&&!!self._printSelected[String(i.id)],st=statusInfo(i),loc=i.newLoc||i.oldLoc||'';
      return'<article class="lpw-row '+(checked?'is-selected ':'')+(locked?'is-locked ':'')+'state-'+st.cls+'">'+
        (locked?'<div class="lpw-lock"><i class="ph ph-lock-key"></i></div>':'<button class="lpw-check '+(checked?'is-on':'')+'" onclick="window.app.togglePrintItem('+js(i.id)+')" aria-label="เลือก '+esc(i.code||'-')+'"><i class="ph ph-check"></i></button>')+
        '<div class="lpw-item" '+(locked?'':'onclick="window.app.togglePrintItem('+js(i.id)+')"')+'><div class="lpw-item-top"><strong>'+esc(i.code||'-')+'</strong>'+(i.comp?'<small>('+esc(i.comp)+')</small>':'')+'<span class="lpw-status '+st.cls+'"><i class="ph ph-'+st.icon+'"></i>'+st.label+'</span></div><p>'+esc(i.desc||'ไม่ระบุชื่อสินค้า')+'</p><div class="lpw-chips"><b><i class="ph ph-package"></i> '+esc(i.qty||'-')+'</b><b class="'+(!loc?'is-missing':'')+'"><i class="ph ph-map-pin"></i> '+esc(loc||'ยังไม่มี LOC')+'</b><span>PO '+esc(i.po||'-')+'</span><span class="lpw-pair-mini">'+esc(pairCode(i))+'</span></div></div>'+
        '<div class="lpw-print-meta"><b>'+esc(i.labelLastSessionId||'ยังไม่มีรอบพิมพ์')+'</b><span>'+dateTime(i.labelLastPrintedAt)+'</span><span>'+esc(i.labelPrintedBy||'-')+' · '+(Number(i.labelPrintCount)||0)+' ครั้ง</span>'+(i.labelReprintReason?'<em>'+esc(i.labelReprintReason)+'</em>':'')+'</div>'+
        '<div class="lpw-row-actions">'+(locked?'<span class="lpw-no-print"><i class="ph ph-prohibit"></i> ปิดการพิมพ์</span>':i.labelPrintStatus==='printed'?'<button onclick="event.stopPropagation();window.app.requestLabelReprint('+js(i.id)+')"><i class="ph ph-arrow-counter-clockwise"></i><span>พิมพ์ซ้ำ</span></button>':'')+'</div></article>';
    }).join('');
    this._updatePrintCount();this._labelUpdateSummary();
  };
  app.hubGoPrintLabels=function(){
    this._closeQuickHub&&this._closeQuickHub();this._printSelected={};this._printWorkTab='receiving';this._printExpanded=null;this._tscFreebieMode=false;this._labelActiveSessionId=null;this._labelReprintReason='';
    var search=document.getElementById('print-search');if(search)search.value='';this.toggleBackdrop&&this.toggleBackdrop(true);
    var modal=document.getElementById('modal-print-select');if(modal)modal.classList.remove('hidden');document.body.classList.add('label-print-open');this.showPrintWorkTab('receiving');
  };
  app.closePrintSelect=function(){var modal=document.getElementById('modal-print-select');if(modal)modal.classList.add('hidden');document.body.classList.remove('label-print-open');this.toggleBackdrop&&this.toggleBackdrop(false);};
  app._updatePrintCount=function(){
    var count=selectedItems().length;['print-select-count','print-select-count-top'].forEach(function(id){var el=document.getElementById(id);if(el)el.textContent=count;});
    ['btn-niimbot-execute','btn-control-sheet','btn-label-and-sheet'].forEach(function(id){var el=document.getElementById(id);if(el)el.disabled=count===0;});
    var selectAll=document.getElementById('btn-label-select-filtered');if(selectAll)selectAll.disabled=false;
  };
  app.printReceivingControlSheet=function(withLabels){
    var items=selectedItems().filter(canPrint);
    if(!items.length){this.toast&&this.toast('เลือกรายการก่อนพิมพ์','info');return;}
    var popup=window.open('','_blank');
    if(!popup){this.showError&&this.showError('กรุณาอนุญาตหน้าต่างพิมพ์แล้วลองอีกครั้ง');return;}
    var rows=items.map(function(i,n){return '<tr><td>'+String(n+1)+'</td><td>'+esc(pairCode(i))+'</td><td><b>'+esc(i.code||'-')+'</b><br><small>'+esc(i.comp||'-')+'</small></td><td>'+esc(i.desc||'-')+'</td><td>'+esc(i.qty==null?'':i.qty)+'</td><td>'+esc(i.newLoc||i.oldLoc||'-')+'</td><td>'+esc(i.po||'-')+'</td><td>□</td></tr>';}).join('');
    popup.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบคุมรับเข้า PLAS WMS</title><style>@page{size:A4 portrait;margin:12mm}body{font:12px Tahoma,sans-serif;color:#24364b}h1{font-size:21px;margin-bottom:5px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:7px 5px;border:1px solid #b9c7d3;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}th{background:#edf2f7}tr{break-inside:avoid}small{color:#655979}button{padding:12px 20px;margin:12px 0}@media print{button{display:none}}</style></head><body><h1>ใบคุมรายการรับเข้า</h1><p>'+esc(new Date().toLocaleString('th-TH'))+' · '+items.length+' รายการ · '+esc(who())+'</p><button onclick="window.print()">พิมพ์ / บันทึก PDF</button><table><colgroup><col style="width:5%"><col style="width:14%"><col style="width:19%"><col style="width:23%"><col style="width:8%"><col style="width:13%"><col style="width:13%"><col style="width:5%"></colgroup><thead><tr><th>#</th><th>รหัสจับคู่</th><th>SAP / COMP</th><th>สินค้า</th><th>จำนวน</th><th>Location</th><th>PO</th><th>✓</th></tr></thead><tbody>'+rows+'</tbody></table></body></html>');
    popup.document.close();popup.opener=null;
    // Control sheets never mark labels as printed. The established label workflow owns that state.
    if(withLabels)this.executeNiimbotLabels();
  };
  app.togglePrintItem=function(id){
    var item=itemById(id);if(!item||!canPrint(item)){this.showError&&this.showError('รายการนี้ไม่อยู่ในขั้นตอนพิมพ์ป้าย');return;}
    if(!this._printSelected)this._printSelected={};var key=String(item.id);if(this._printSelected[key])delete this._printSelected[key];else this._printSelected[key]=true;this.renderPrintSelectList();
  };
  app.togglePrintSelectAll=function(){
    var pool=this._printablePool(),query=clean((document.getElementById('print-search')||{}).value).toUpperCase(),self=this;
    if(query)pool=pool.filter(function(i){return[i.code,i.comp,i.desc,i.po,i.newLoc,i.oldLoc,pairCode(i)].some(function(v){return String(v||'').toUpperCase().indexOf(query)>=0;});});
    var all=pool.length&&pool.every(function(i){return self._printSelected[String(i.id)];});pool.forEach(function(i){if(all)delete self._printSelected[String(i.id)];else self._printSelected[String(i.id)]=true;});this.renderPrintSelectList();
  };
  app.clearPrintSelection=function(){this._printSelected={};this.renderPrintSelectList();};
  app.requestLabelReprint=function(id){var item=itemById(id);if(!item||!canPrint(item)){this.showError&&this.showError('รายการนี้ไม่อยู่ในขั้นตอนพิมพ์ป้าย');return;}this._printSelected={};this._printSelected[String(item.id)]=true;this._printWorkTab=isWritten(item)?'written':'receiving';this._openLabelReasonModal([item],'select');};
  app.showLastPrintSession=function(){var s=sessions()[0];if(!s){this.showError&&this.showError('ยังไม่มีรอบพิมพ์');return;}var items=(s.itemIds||[]).map(itemById).filter(canPrint);this._printWorkTab=items.length&&items.every(isWritten)?'written':'receiving';this._printSelected={};var self=this;items.filter(function(item){return self._printWorkTab==='written'?isWritten(item):!isWritten(item);}).forEach(function(item){self._printSelected[String(item.id)]=true;});this.renderPrintSelectList();};
  app.cancelLastLabelSession=function(){
    var s=sessions().find(function(x){return x.status==='printed';});if(!s){this.showError&&this.showError('ไม่มีรอบพิมพ์ที่ยกเลิกได้');return;}if(!root.confirm('ยกเลิกสถานะพิมพ์ของรอบ '+s.id+'?'))return;
    var changed=[];(s.itemIds||[]).forEach(function(id){var item=itemById(id),before=s.previous&&s.previous[id];if(item&&item.labelLastSessionId===s.id&&before){item.labelPrintStatus=before.status||'unprinted';item.labelPrintCount=Number(before.count)||0;item.labelLastPrintedAt=before.lastPrintedAt||null;item.labelPrintedBy=before.printedBy||'';changed.push(item);}});
    s.status='cancelled';s.cancelledAt=Date.now();s.cancelledBy=who();var list=sessions(),index=list.findIndex(function(x){return x.id===s.id;});if(index>=0)list[index]=s;saveSessions(list);persist(changed);audit('PRINT_SESSION_CANCELLED',{sessionId:s.id,count:changed.length});this.renderPrintSelectList();this.showSuccess&&this.showSuccess('ยกเลิกรอบ '+s.id+' แล้ว');
  };
  app.openPrintHistory=function(){
    var old=document.getElementById('modal-print-history');if(old)old.remove();var list=sessions();
    var body=list.length?list.map(function(s){return'<article class="lpw-history '+esc(s.status)+'"><div><b>'+esc(s.id)+'</b><span>'+dateTime(s.createdAt)+' · '+esc(s.user)+' · '+esc(s.method)+'</span><small>'+((s.itemIds||[]).length)+' รายการ'+(s.reason?' · '+esc(s.reason):'')+'</small></div><strong>'+(s.status==='cancelled'?'ยกเลิกแล้ว':'พิมพ์แล้ว')+'</strong><button onclick="window.app.reprintLabelSession('+js(s.id)+')"><i class="ph ph-arrow-counter-clockwise"></i> เลือกพิมพ์ซ้ำ</button></article>';}).join(''):'<div class="lpw-empty"><i class="ph ph-clock-counter-clockwise"></i><b>ยังไม่มีประวัติรอบพิมพ์</b></div>';
    var html='<div id="modal-print-history" class="lpw-modal"><div class="lpw-dialog"><header class="lpw-dialog-head"><div><span class="lpw-eyebrow">PRINT HISTORY</span><h3><i class="ph ph-clock-counter-clockwise"></i> ประวัติการพิมพ์สติกเกอร์</h3><p>ดูผู้พิมพ์ เวลา จำนวน และเหตุผลพิมพ์ซ้ำ</p></div><button onclick="window.app.closePrintHistory()" aria-label="ปิด"><i class="ph ph-x"></i></button></header><div class="lpw-dialog-tools"><button onclick="window.app.exportLabelAuditCsv()"><i class="ph ph-file-csv"></i> Export CSV</button></div><div class="lpw-history-list">'+body+'</div></div></div>';
    document.body.insertAdjacentHTML('beforeend',html);
  };
  app.closePrintHistory=function(){var modal=document.getElementById('modal-print-history');if(modal)modal.remove();};
  app.reprintLabelSession=function(id){
    var s=sessions().find(function(x){return x.id===id;});if(!s)return;var items=(s.itemIds||[]).map(itemById).filter(canPrint);this.closePrintHistory();if(!items.length){this.showError&&this.showError('ไม่พบรายการที่ยังอยู่ในขั้นตอนพิมพ์ป้าย');return;}this._printWorkTab=items.every(isWritten)?'written':'receiving';var self=this;items=items.filter(function(item){return self._printWorkTab==='written'?isWritten(item):!isWritten(item);});this._printSelected={};items.forEach(function(item){self._printSelected[String(item.id)]=true;});this.renderPrintSelectList();this._openLabelReasonModal(items,'select');
  };
  app.exportLabelAuditCsv=function(){
    var rows=[['เวลา','ผู้ใช้','การทำงาน','รอบพิมพ์','วิธี','จำนวน','เหตุผล','ITEM IDs','เลขจับคู่']];read(AUDIT_KEY,[]).forEach(function(a){var d=a.detail||{};rows.push([new Date(a.ts).toLocaleString('th-TH'),a.user,a.action,d.sessionId||'',d.method||'',d.count||'',d.reason||'',(d.itemIds||[]).join('|'),(d.pairCodes||[]).join('|')]);});
    var csv='\uFEFF'+rows.map(function(row){return row.map(function(v){return'"'+String(v==null?'':v).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');var blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='PLAS_Label_Audit_'+new Date().toISOString().slice(0,10)+'.csv';link.click();setTimeout(function(){URL.revokeObjectURL(url);},500);
  };

  activeItems().forEach(ensure);updateHubBadge();
})(typeof window!=='undefined'?window:this);
