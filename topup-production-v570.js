/*
 * PLAS WMS v5.7.1 — TOPUP print dialog hotfix
 * Portrait control sheet, x สินค้า, ink-saving matched labels, audit and clone-last.
 */
(function(root){
  'use strict';
  var app=root&&root.app;
  if(!app||app.__topupProductionV570Installed)return;
  app.__topupProductionV570Installed=true;
  var AUDIT_KEY='plas_topup_audit_v570', SNAP_KEY='plas_topup_last_snapshot_v570';
  var original={
    hub:app.hubGoTopupStickers&&app.hubGoTopupStickers.bind(app),
    updateMeta:app.topupStickerUpdateMeta&&app.topupStickerUpdateMeta.bind(app),
    updateField:app.topupStickerUpdateField&&app.topupStickerUpdateField.bind(app),
    verify:app.verifyTopupStickerData&&app.verifyTopupStickerData.bind(app),
    tscDo:app._topupTscDoPrint&&app._topupTscDoPrint.bind(app)
  };
  function clean(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function num(v){var n=parseFloat(String(v||'').replace(/,/g,''));return Number.isFinite(n)?n:0;}
  function read(k,f){try{var x=JSON.parse(localStorage.getItem(k)||'null');return x==null?f:x;}catch(e){return f;}}
  function write(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
  function currentUser(){return clean(app.state&&app.state.ui&&app.state.ui.currentUser).replace(/^Admin:\s*/i,'')||'-';}
  function audit(action,detail){var a=read(AUDIT_KEY,[]);a.unshift({ts:Date.now(),user:currentUser(),action:action,detail:detail||{}});write(AUDIT_KEY,a.slice(0,300));}
  function migrate(){
    var d=app._topupStickerData;if(!d)return;
    d.meta=d.meta||{};if(!d.meta.handler)d.meta.handler=currentUser();if(!d.statusFilter)d.statusFilter='all';
    (d.items||[]).forEach(function(i){
      if(typeof i.actualQty==='undefined')i.actualQty='';
      i.assignedTo='';i.assignedQty='';
      if(typeof i.selected==='undefined')i.selected=true;
    });
  }
  function selected(){migrate();return app._topupStickerOrderedItems(true);}
  function allOrdered(){migrate();return app._topupStickerOrderedItems(false);}
  function valid(i){var aq=clean(i.actualQty);var actualOk=!aq||(!isNaN(num(aq))&&num(aq)>=0&&num(aq)<=num(i.qty));return clean(i.item)&&clean(i.name)&&clean(i.toLocation)&&clean(i.qty)&&!isNaN(num(i.qty))&&actualOk;}
  function warnings(i){var w=[];if(!clean(i.secondary))w.push('ไม่มีเลขรอง');if(!clean(i.batch))w.push('ไม่มี BATCH');if(clean(i.actualQty)&&num(i.actualQty)>num(i.qty))w.push('x สินค้าเกิน QTY');return w;}
  function totalQty(items){return(items||[]).reduce(function(s,i){return s+num(i.qty);},0);}
  function groupCount(items){var m={};(items||[]).forEach(function(i){m[String(i.item||'')+'|'+String(i.secondary||'')]=1;});return Object.keys(m).length;}
  function saveSnapshot(kind,items){
    var d=app._topupStickerData||{};write(SNAP_KEY,{ts:Date.now(),kind:kind,fileName:d.fileName,meta:JSON.parse(JSON.stringify(d.meta||{})),items:JSON.parse(JSON.stringify(items||d.items||[]))});
  }
  function fmtDate(v){if(!v)return'-';var d=new Date(v);return isNaN(d)?v:d.toLocaleDateString('th-TH');}

  app.hubGoTopupStickers=function(){migrate();original.hub&&original.hub();this.renderTopupStickerDashboard();};
  app.topupStickerUpdateMeta=function(field,value){
    if(field==='handler'){migrate();this._topupStickerData.meta.handler=clean(value);this._topupStickerData.verifiedAt=null;audit('EDIT_META',{field:field,value:clean(value)});this.renderTopupStickerDashboard();return;}
    original.updateMeta&&original.updateMeta(field,value);audit('EDIT_META',{field:field,value:clean(value)});
  };
  app.topupStickerUpdateField=function(id,field,value){
    migrate();
    if(field==='actualQty'){
      var i=this._topupStickerData.items.find(function(x){return String(x.id)===String(id);});if(!i)return;i.actualQty=clean(value);this._topupStickerData.previewId=i.id;this._topupStickerData.verifiedAt=null;audit('EDIT_ITEM',{id:id,field:field,value:i.actualQty});this.renderTopupStickerDashboard();return;
    }
    original.updateField&&original.updateField(id,field,value);audit('EDIT_ITEM',{id:id,field:field,value:clean(value)});
  };
  app.topupSetStatusFilter=function(f){migrate();this._topupStickerData.statusFilter=f||'all';this.renderTopupStickerDashboard();};
  app._topupStickerFilteredItems=function(){
    migrate();var d=this._topupStickerData,q=clean(d.search).toUpperCase(),f=d.statusFilter||'all';
    return allOrdered().filter(function(i){var ok=valid(i),warn=warnings(i).length>0;if(f==='ready'&&!ok)return false;if(f==='issue'&&ok&&!warn)return false;if(f==='selected'&&!i.selected)return false;if(!q)return true;return[i.controlCode,i.item,i.secondary,i.name,i.toLocation,i.batch,i.qty,i.actualQty].some(function(v){return String(v||'').toUpperCase().indexOf(q)>=0;});});
  };
  app.renderTopupStickerDashboard=function(){
    migrate();var d=this._topupStickerData;
    var fn=document.getElementById('topup-sticker-filename');if(fn)fn.textContent=d.fileName||'ยังไม่ได้เลือกไฟล์';
    var sr=document.getElementById('topup-sticker-search');if(sr&&sr.value!==d.search)sr.value=d.search||'';
    this.renderTopupStickerMeta();this.renderTopupStickerSummary();this.renderTopupStickerList();this.renderTopupStickerPreview();this.renderTopupControlPreview();
    if(d.fileName&&d._lastAuditFile!==d.fileName){d._lastAuditFile=d.fileName;audit('IMPORT',{fileName:d.fileName,count:d.items.length,tfor:d.meta&&d.meta.tfor});saveSnapshot('IMPORT',d.items);}
  };
  app.renderTopupStickerMeta=function(){
    migrate();var m=this._topupStickerData.meta||{};
    var map={'topup-meta-tfor':m.tfor||'','topup-meta-from':m.fromWarehouse||'','topup-meta-to':m.toWarehouse||'','topup-meta-receiver':m.receiver||'','topup-meta-checker':m.checker||'','topup-meta-handler':m.handler||currentUser(),'topup-meta-date':m.date||'','topup-meta-note':m.note||''};
    Object.keys(map).forEach(function(id){var e=document.getElementById(id);if(e&&document.activeElement!==e)e.value=map[id];});
    var route=document.getElementById('topup-sticker-route');if(route)route.textContent=(m.fromWarehouse||'--')+' → '+(m.toWarehouse||'--');
    var type=document.getElementById('topup-sticker-filetype');if(type)type.textContent=m.fileType||'-';
    var doc=document.getElementById('topup-doc-status');if(doc){var ok=clean(m.tfor)&&clean(m.fromWarehouse)&&clean(m.toWarehouse);doc.className='topup-doc-status '+(ok?'is-ok':'is-error');doc.innerHTML=ok?'<i class="ph ph-check-circle"></i> ข้อมูลเอกสารพร้อม':'<i class="ph ph-warning-circle"></i> ข้อมูลเอกสารไม่ครบ';}
  };
  app.renderTopupStickerSummary=function(){
    migrate();var items=allOrdered(),ready=items.filter(valid),issues=items.length-ready.length,sel=items.filter(function(i){return i.selected;}),groups=groupCount(items);
    var vals={'topup-count-total':items.length,'topup-count-valid':ready.length,'topup-count-issue':issues,'topup-count-selected':sel.length,'topup-count-groups':groups,'topup-count-qty':totalQty(sel).toLocaleString(undefined,{maximumFractionDigits:2})};
    Object.keys(vals).forEach(function(id){var e=document.getElementById(id);if(e)e.textContent=vals[id];});
    var foot=document.getElementById('topup-footer-selected');if(foot)foot.textContent=sel.length+' รายการ · '+totalQty(sel).toLocaleString(undefined,{maximumFractionDigits:2})+' ชิ้น';
    var print=document.getElementById('btn-topup-sticker-print');if(print)print.disabled=!sel.length;
    document.querySelectorAll('[data-topup-filter]').forEach(function(b){b.classList.toggle('is-active',b.getAttribute('data-topup-filter')===(app._topupStickerData.statusFilter||'all'));});
  };
  app.renderTopupStickerList=function(){
    var box=document.getElementById('topup-sticker-list');if(!box)return;var items=this._topupStickerFilteredItems(),self=this;
    if(!items.length){box.innerHTML='<div class="topup-min-empty"><i class="ph ph-package"></i><b>ไม่พบรายการ</b><span>ลองเปลี่ยนคำค้นหาหรือตัวกรอง</span></div>';return;}
    var lastGroup='';
    box.innerHTML=items.map(function(i){var g=String(i.groupLabel||'A')+'|'+String(i.item||''),head='';if(g!==lastGroup){lastGroup=g;head='<div class="topup-group-row"><b>GROUP '+esc(i.groupLabel||'A')+'</b><span>'+esc(i.item||'-')+(i.secondary?' · '+esc(i.secondary):'')+'</span><em>'+esc(i.name||'')+'</em></div>';}
      var ok=valid(i),warn=warnings(i),preview=String(self._topupStickerData.previewId)===String(i.id);
      return head+'<article class="topup-min-row '+(i.selected?'is-selected ':'')+(preview?'is-preview ':'')+(!ok?'has-error':'')+'">'+
        '<button class="topup-min-check '+(i.selected?'is-on':'')+'" onclick="window.app.topupStickerToggleItem('+JSON.stringify(i.id)+')"><i class="ph ph-check"></i></button>'+
        '<button class="topup-min-seq" onclick="window.app.topupStickerSelectPreview('+JSON.stringify(i.id)+')"><b>'+esc(i.controlCode||'--')+'</b><span>รหัสคุม</span></button>'+
        '<div class="topup-min-item" onclick="window.app.topupStickerSelectPreview('+JSON.stringify(i.id)+')"><strong>'+esc(i.item||'-')+'</strong><small>'+(i.secondary?'('+esc(i.secondary)+')':'ไม่มีเลขรอง')+'</small><p>'+esc(i.name||'—')+'</p></div>'+
        '<label class="topup-inline-field"><span>LOC</span><input value="'+esc(i.toLocation||'')+'" onchange="window.app.topupStickerUpdateField('+JSON.stringify(i.id)+',\'toLocation\',this.value)"></label>'+
        '<label class="topup-inline-field qty"><span>QTY</span><input inputmode="decimal" value="'+esc(i.qty||'')+'" onchange="window.app.topupStickerUpdateField('+JSON.stringify(i.id)+',\'qty\',this.value)"></label>'+
        '<label class="topup-inline-field actual"><span>x สินค้า</span><input inputmode="decimal" placeholder="รับจริง" value="'+esc(i.actualQty||'')+'" onchange="window.app.topupStickerUpdateField('+JSON.stringify(i.id)+',\'actualQty\',this.value)"></label>'+
        '<div class="topup-min-batch"><span>BATCH</span><b>'+esc(i.batch||'—')+'</b></div>'+
        '<div class="topup-min-status '+(ok?'ok':'error')+'"><i class="ph ph-'+(ok?'check-circle':'warning')+'"></i><b>'+(ok?'พร้อมพิมพ์':'ต้องแก้ไข')+'</b>'+(warn.length?'<small>'+esc(warn.join(' · '))+'</small>':'')+'</div>'+
        '<details class="topup-min-more"><summary><i class="ph ph-dots-three-vertical"></i></summary><div>'+self._topupEditInput(i,'item','ITEM',true)+self._topupEditInput(i,'secondary','เลขรอง',false)+self._topupEditInput(i,'batch','BATCH',false)+'<label><span>ชื่อสินค้า</span><textarea onchange="window.app.topupStickerUpdateField('+JSON.stringify(i.id)+',\'name\',this.value)">'+esc(i.name||'')+'</textarea></label></div></details>'+
      '</article>';}).join('');
  };
  app.renderTopupStickerPreview=function(){
    var canvas=document.getElementById('topup-sticker-preview-canvas'),empty=document.getElementById('topup-sticker-preview-empty');if(!canvas)return;var d=this._topupStickerData,i=d.items.find(function(x){return String(x.id)===String(d.previewId);})||allOrdered()[0];
    if(!i){canvas.classList.add('hidden');if(empty)empty.classList.remove('hidden');return;}canvas.classList.remove('hidden');if(empty)empty.classList.add('hidden');canvas.width=700;canvas.height=350;
    var m=d.meta||{};this._tscDrawTopupImportLabel(canvas.getContext('2d'),{code:i.item,comp:i.secondary,desc:i.name,qty:i.qty,batch:i.batch,newLoc:i.toLocation,tfor:m.tfor,sourceWarehouse:m.fromWarehouse,destinationWarehouse:m.toWarehouse,controlCode:i.controlCode},700,350);
    var title=document.getElementById('topup-preview-item');if(title)title.textContent=(i.controlCode||'--')+' · '+(i.item||'-');
  };
  app.renderTopupControlPreview=function(){
    var box=document.getElementById('topup-control-preview');if(!box)return;var d=this._topupStickerData,m=d.meta||{},items=selected().slice(0,4);
    box.innerHTML='<div class="topup-mini-doc-head"><b>'+esc(m.tfor||'TFOR -')+'</b><strong>'+esc((m.fromWarehouse||'--')+' → '+(m.toWarehouse||'--'))+'</strong></div><div class="topup-mini-doc-meta"><span>ผู้พิมพ์ '+esc(m.handler||currentUser())+'</span><span>ผู้รับ '+esc(m.receiver||'—')+'</span></div>'+items.map(function(i){return '<div class="topup-mini-doc-row"><b>'+esc(i.controlCode)+'</b><span>'+esc(i.item)+'</span><strong>'+esc(i.toLocation)+'</strong><em>'+esc(i.qty)+'</em></div>';}).join('')+(selected().length>4?'<small>และอีก '+(selected().length-4)+' รายการ</small>':'');
  };

  app.openTopupBulkEdit=function(){var old=document.getElementById('modal-topup-bulk');if(old)old.remove();var n=selected().length;if(!n){this.showError('ยังไม่ได้เลือกรายการ');return;}var html='<div id="modal-topup-bulk" class="topup-popover"><div class="topup-pop-dialog"><header><div><h3>แก้ไขหลายรายการ</h3><p>ใช้กับ '+n+' รายการที่เลือก</p></div><button onclick="window.app.closeTopupBulkEdit()"><i class="ph ph-x"></i></button></header><main><label><span>ตั้ง LOC เหมือนกัน</span><input id="topup-bulk-loc" placeholder="เว้นว่าง = ไม่เปลี่ยน"></label><label><span>ตั้ง QTY เหมือนกัน</span><input id="topup-bulk-qty" inputmode="decimal" placeholder="เว้นว่าง = ไม่เปลี่ยน"></label><label><span>ตั้ง x สินค้าเหมือนกัน</span><input id="topup-bulk-actual" inputmode="decimal" placeholder="เว้นว่าง = ไม่เปลี่ยน"></label></main><footer><button onclick="window.app.closeTopupBulkEdit()">ยกเลิก</button><button class="primary" onclick="window.app.applyTopupBulkEdit()">บันทึกการแก้ไข</button></footer></div></div>';document.body.insertAdjacentHTML('beforeend',html);};
  app.closeTopupBulkEdit=function(){var m=document.getElementById('modal-topup-bulk');if(m)m.remove();};
  app.applyTopupBulkEdit=function(){var loc=clean((document.getElementById('topup-bulk-loc')||{}).value).toUpperCase(),qty=clean((document.getElementById('topup-bulk-qty')||{}).value),actual=clean((document.getElementById('topup-bulk-actual')||{}).value),items=selected();if(!loc&&!qty&&!actual){this.showError('ยังไม่ได้กรอกข้อมูลที่จะเปลี่ยน');return;}items.forEach(function(i){if(loc)i.toLocation=loc;if(qty)i.qty=qty;if(actual)i.actualQty=actual;});this._topupStickerData.verifiedAt=null;audit('BULK_EDIT',{count:items.length,loc:loc,qty:qty,actualQty:actual});this.closeTopupBulkEdit();this.renderTopupStickerDashboard();this.showSuccess('แก้ไข '+items.length+' รายการแล้ว');};

  app.verifyTopupStickerData=function(){migrate();original.verify&&original.verify();audit('VERIFY',{count:this._topupStickerData.items.length,selected:selected().length});};
  app.cloneTopupLastSession=function(){var snap=read(SNAP_KEY,null);if(!snap){this.showError('ยังไม่มีรอบก่อนหน้า');return;}if(!confirm('โหลดข้อมูลรอบล่าสุด '+(snap.meta&&snap.meta.tfor||'')+' กลับมาใช้งาน?'))return;this._topupStickerData={fileName:snap.fileName||'Clone รอบล่าสุด',meta:JSON.parse(JSON.stringify(snap.meta||{})),items:JSON.parse(JSON.stringify(snap.items||[])),search:'',statusFilter:'all',previewId:snap.items&&snap.items[0]&&snap.items[0].id,verifiedAt:null};migrate();audit('CLONE_LAST',{tfor:this._topupStickerData.meta.tfor,count:this._topupStickerData.items.length});this.renderTopupStickerDashboard();this.showSuccess('โหลดรอบล่าสุดแล้ว');};
  app.openTopupAudit=function(){var old=document.getElementById('modal-topup-audit');if(old)old.remove();var rows=read(AUDIT_KEY,[]).slice(0,100).map(function(a){return '<div class="topup-audit-row"><b>'+esc(a.action)+'</b><span>'+new Date(a.ts).toLocaleString('th-TH')+' · '+esc(a.user)+'</span><small>'+esc(JSON.stringify(a.detail||{}))+'</small></div>';}).join('')||'<div class="topup-min-empty"><b>ยังไม่มีประวัติ</b></div>';document.body.insertAdjacentHTML('beforeend','<div id="modal-topup-audit" class="topup-popover"><div class="topup-pop-dialog audit"><header><div><h3>ประวัติ TOPUP</h3><p>Import · แก้ไข · ตรวจสอบ · พิมพ์</p></div><button onclick="document.getElementById(\'modal-topup-audit\').remove()"><i class="ph ph-x"></i></button></header><main>'+rows+'</main></div></div>');};

  app.printTopupControlSheet=function(){
    migrate();var items=selected();if(!items.length){this.showError('ยังไม่ได้เลือกรายการ');return;}var m=this._topupStickerData.meta||{},rows=[],last='';items.forEach(function(i){var key=(i.item||'')+'|'+(i.secondary||'');if(key!==last){last=key;rows.push('<tr class="group"><td colspan="8"><b>GROUP '+esc(i.groupLabel||'A')+'</b><strong>'+esc(i.item||'-')+(i.secondary?' · '+esc(i.secondary):'')+'</strong><span>'+esc(i.name||'')+'</span></td></tr>');}rows.push('<tr><td class="seq">'+esc(i.controlCode||'--')+'</td><td class="product"><b>'+esc(i.item||'-')+'</b><small>'+(i.secondary?'('+esc(i.secondary)+')':'')+'</small><p>'+esc(i.name||'')+'</p></td><td class="qty">'+esc(i.qty||'-')+'</td><td class="loc">'+esc(i.toLocation||'-')+'</td><td class="write">________________</td><td class="actual">'+(i.actualQty?esc(i.actualQty):'________')+'</td><td class="batch">'+esc(i.batch||'—')+'</td><td class="check"><span></span></td></tr>');});
    var win=window.open('','_blank','width=900,height=1000');if(!win){this.showError('เบราว์เซอร์บล็อก Pop-up');return;}var route=(m.fromWarehouse||'--')+' → '+(m.toWarehouse||'--'),handler=m.handler||currentUser();
    var css='@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{font-family:Sarabun,Arial,sans-serif;margin:0;color:#172033;font-size:10px}.head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}.head h1{margin:0;font-size:23px;color:#142a4b}.head p{margin:3px 0 0;color:#718096;font-size:9px}.brand{font-size:15px;font-weight:900;color:#142a4b}.meta{display:grid;grid-template-columns:1.55fr .55fr .55fr .85fr;border:1.2px solid #9aa8ba;border-radius:10px;overflow:hidden}.meta>div{padding:8px 10px;border-right:1px solid #cbd5e1;min-height:62px}.meta>div:last-child{border:0}.k{display:block;color:#66758a;font-size:9px;font-weight:800}.v{display:block;margin-top:5px;font-size:25px;font-weight:900;color:#101f38;line-height:1}.meta .route .v{font-size:28px}.people{display:grid;grid-template-columns:1fr 1fr 1fr;margin:7px 0;border:1px solid #cbd5e1;border-radius:9px;overflow:hidden}.people>div{padding:7px 9px;border-right:1px solid #d8e0e9;min-height:47px}.people>div:last-child{border:0}.people b{display:block;margin-top:5px;font-size:12px}.notice{padding:7px 9px;border:1px solid #d8e0e9;border-radius:8px;background:#fafbfc;margin-bottom:7px;font-weight:700;color:#475569}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{background:#edf1f5;color:#26374f;border:1px solid #aebbc9;padding:6px 3px;font-size:8.5px}td{border:1px solid #c4ced9;padding:5px 4px;vertical-align:middle;height:48px;word-break:break-word}tr{break-inside:avoid}.group td{height:auto;background:#f7f9fb;padding:5px 7px;border-top:1.6px solid #8796a8}.group b{border:1px solid #9aa8ba;border-radius:5px;padding:2px 5px;margin-right:7px}.group strong{margin-right:7px}.group span{color:#67768a;font-size:8px}.seq{text-align:center;font-size:21px;font-weight:900;color:#334155}.product b{display:block;font-size:10px}.product small{font-size:8px;color:#64748b}.product p{margin:3px 0 0;font-size:8px;line-height:1.25}.qty{text-align:center;font-size:14px;font-weight:900}.loc{text-align:center;font-size:12px;font-weight:900}.write{text-align:center;color:#718096}.actual{text-align:center;font-size:12px;font-weight:800}.batch{font-size:10px;font-weight:800}.check{text-align:center}.check span{display:inline-block;width:18px;height:18px;border:1.5px solid #475569;border-radius:4px}.foot{display:grid;grid-template-columns:1.2fr 1fr;gap:7px;margin-top:8px}.foot>div{border:1px solid #cbd5e1;border-radius:8px;padding:8px;min-height:70px}.foot h3{margin:0 0 5px;font-size:10px}.foot p{margin:3px 0;color:#526176;font-size:8.5px}.page{text-align:center;margin-top:7px;color:#64748b}.no-print{position:fixed;right:14px;top:14px;border:0;border-radius:10px;background:#334155;color:#fff;padding:10px 15px;font-weight:800;cursor:pointer}@media print{.no-print{display:none}}';
    win.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบคุม TOPUP '+esc(m.tfor||'')+'</title><style>'+css+'</style></head><body><button class="no-print" onclick="window.print()">พิมพ์ / บันทึก PDF</button><header class="head"><div><h1>ใบคุม TOPUP / TOPUP Control Sheet</h1><p>รหัสคุมบนสติกเกอร์ต้องตรงกับลำดับในใบคุม</p></div><div class="brand">PLAS WMS</div></header><section class="meta"><div><span class="k">TFOR</span><span class="v">'+esc(m.tfor||'-')+'</span></div><div><span class="k">FROM</span><span class="v">'+esc(m.fromWarehouse||'-')+'</span></div><div><span class="k">TO</span><span class="v">'+esc(m.toWarehouse||'-')+'</span></div><div class="route"><span class="k">ROUTE</span><span class="v">'+esc(route)+'</span></div></section><section class="people"><div><span class="k">ผู้พิมพ์ / Handler</span><b>'+esc(handler)+'</b></div><div><span class="k">ผู้รับสินค้า / Receiver</span><b>'+esc(m.receiver||'________________')+'</b></div><div><span class="k">วันที่ / ผู้ตรวจ</span><b>'+esc(fmtDate(m.date))+' · '+esc(m.checker||'________________')+'</b></div></section><div class="notice">ITEM เดียวกันจัดให้อยู่ติดกัน · กรอกจำนวนรับจริงในช่อง “x สินค้า” · หาก LOC เปลี่ยนให้เขียนในช่อง LOC แก้ไข</div><table><colgroup><col style="width:7%"><col style="width:31%"><col style="width:8%"><col style="width:11%"><col style="width:11%"><col style="width:10%"><col style="width:17%"><col style="width:5%"></colgroup><thead><tr><th>รหัสคุม</th><th>ITEM / เลขรอง / ชื่อสินค้า</th><th>QTY</th><th>LOC ปลายทาง</th><th>LOC แก้ไข</th><th>x สินค้า</th><th>BATCH</th><th>รับแล้ว</th></tr></thead><tbody>'+rows.join('')+'</tbody></table><section class="foot"><div><h3>หมายเหตุ</h3><p>1. ตรวจ ITEM, QTY, LOC และ BATCH ก่อนรับสินค้า</p><p>2. กรอก x สินค้า และทำเครื่องหมายเมื่อรับครบ</p><p>'+esc(m.note||'—')+'</p></div><div><h3>ลงชื่อยืนยัน</h3><p>ผู้รับ __________________________</p><p>ผู้ตรวจ _________________________</p><p>วันที่ ______ / ______ / ______</p></div></section><div class="page">หน้า 1 / 1 · '+items.length+' รายการ · '+groupCount(items)+' กลุ่ม</div></body></html>');win.document.close();saveSnapshot('CONTROL_SHEET',items);audit('PRINT_CONTROL',{tfor:m.tfor,count:items.length,groups:groupCount(items)});setTimeout(function(){try{win.focus();win.print();}catch(e){}},350);
  };

  app.printTopupStickerData=function(){
    migrate();var items=selected();if(!items.length){this.showError('ยังไม่ได้เลือกรายการพิมพ์');return;}var invalid=items.filter(function(i){return !valid(i);});if(invalid.length&&!this._topupSkipInvalid){this._topupStickerData.statusFilter='issue';this.renderTopupStickerDashboard();this.showError('พบข้อมูลไม่ครบ '+invalid.length+' รายการ — แก้ไขหรือเลือก “ข้ามรายการไม่พร้อม”');return;}if(this._topupSkipInvalid)items=items.filter(valid);if(!items.length){this.showError('ไม่มีรายการพร้อมพิมพ์');return;}var m=this._topupStickerData.meta||{},sid='TP-'+Date.now();this._niimbotBatch=items.map(function(i){i.topupPrintSessionId=sid;i.topupPrintedAt=Date.now();return{id:i.id,code:i.item,comp:i.secondary,desc:i.name,qty:i.qty,batch:i.batch,oldLoc:i.fromLocation,newLoc:i.toLocation,tfor:m.tfor,sourceWarehouse:m.fromWarehouse,destinationWarehouse:m.toWarehouse,controlSeq:i.controlSeq,controlCode:i.controlCode,groupLabel:i.groupLabel,_topupStickerImport:true};});this._tscTopupStickerMode=true;this._tscFreebieMode=false;saveSnapshot('STICKER',items);audit('PRINT_STICKER',{sessionId:sid,tfor:m.tfor,count:items.length,groups:groupCount(items)});this.niimbotPrintPDF();
  };
  app._openTopupTscOptions=function(){var old=document.getElementById('modal-tsc');if(old)old.remove();var n=(this._niimbotBatch||[]).length,groups=groupCount(this._niimbotBatch||[]),saved=read('plas_topup_tsc_opts',{}),layout=saved.layout==='single'?'single':'pair_diff',rot=!!saved.rot;var html='<div id="modal-tsc" class="topup-print-overlay"><div class="topup-print-dialog minimal"><header><div><h3>พิมพ์สติกเกอร์ TOPUP</h3><p>'+n+' ดวง · '+groups+' กลุ่ม · เรียงตรงกับใบคุม</p></div><button onclick="window.app._closeTopupTscModal()"><i class="ph ph-x"></i></button></header><main><div class="topup-print-stats"><div><b>50×25</b><span>มม. / ดวง</span></div><div><b>2 mm</b><span>ช่องกลาง</span></div><div><b>102×25</b><span>พิมพ์คู่</span></div></div><div class="topup-layout-choice"><label class="'+(layout==='pair_diff'?'is-selected':'')+'"><input type="radio" name="tsc-layout" value="pair_diff" '+(layout==='pair_diff'?'checked':'')+'><i class="ph ph-columns"></i><span><b>พิมพ์คู่</b><small>ซ้าย → ขวา ตามรหัสคุม</small></span></label><label class="'+(layout==='single'?'is-selected':'')+'"><input type="radio" name="tsc-layout" value="single" '+(layout==='single'?'checked':'')+'><i class="ph ph-square"></i><span><b>ดวงเดียว</b><small>50×25 mm</small></span></label></div><input type="hidden" id="tsc-w" value="50"><input type="hidden" id="tsc-h" value="25"><input type="hidden" id="tsc-gap" value="2"><label class="topup-rotate-option"><input type="checkbox" id="tsc-rot" '+(rot?'checked':'')+'><i class="ph ph-arrow-clockwise"></i><span><b>หมุน 90°</b><small>เมื่อเครื่องออกมาตะแคง</small></span></label><div class="topup-print-tip"><i class="ph ph-info"></i><span>ตั้ง Scale 100% และปิด Header/Footer</span></div></main><footer><button class="secondary" onclick="window.app._closeTopupTscModal()">ยกเลิก</button><button class="primary" onclick="window.app._topupTscDoPrint()"><i class="ph ph-printer"></i> พิมพ์สติกเกอร์</button></footer></div></div>';document.body.classList.add('topup-sticker-print-open');document.body.insertAdjacentHTML('beforeend',html);};
  app._topupTscDoPrint=function(){var layout=(document.querySelector('input[name="tsc-layout"]:checked')||{}).value||'pair_diff',rot=!!((document.getElementById('tsc-rot')||{}).checked);write('plas_topup_tsc_opts',{layout:layout,rot:rot});audit('OPEN_PRINT_DIALOG',{layout:layout,rotate:rot,count:(this._niimbotBatch||[]).length});original.tscDo&&original.tscDo();};

  app._tscDrawTopupImportLabel=function(ctx,item,W,H){
    item=item||{};var S=Math.min(W/700,H/350),sc=function(n){return Math.max(1,Math.round(n*S));},pad=sc(8),family='Sarabun,Arial,sans-serif';
    ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.textBaseline='top';ctx.textAlign='left';ctx.strokeStyle='#6b7280';ctx.lineWidth=sc(1.5);ctx.strokeRect(.5,.5,W-1,H-1);
    function fit(text,start,min,maxW,weight){text=clean(text);var f=sc(start),mn=sc(min);ctx.font=(weight||'700')+' '+f+'px '+family;while(f>mn&&ctx.measureText(text).width>maxW){f--;ctx.font=(weight||'700')+' '+f+'px '+family;}return f;}
    // Safe-left correction for TSC printers that clip the left edge.
    // This renderer is the final production override loaded after topup-sticker-printer.js.
    var control=clean(item.controlCode)||'--',safeLeft=sc(28),badgeX=pad+safeLeft,badgeW=sc(72),badgeH=sc(68);
    ctx.fillStyle='#111827';ctx.fillRect(badgeX,pad,badgeW,badgeH);
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='800 '+sc(11)+'px '+family;ctx.fillText('รหัสคุม',badgeX+badgeW/2,pad+sc(5));
    ctx.font='900 '+sc(42)+'px '+family;ctx.fillText(control,badgeX+badgeW/2,pad+sc(20));ctx.textAlign='left';
    var x=badgeX+badgeW+sc(12),right=W-pad-sc(5),content=right-x,tfor=clean(item.tfor)||'TFOR -',route=(clean(item.sourceWarehouse)||'--')+' → '+(clean(item.destinationWarehouse)||'--');
    ctx.fillStyle='#374151';var tf=fit(tfor,19,13,content*.62,'800');ctx.font='800 '+tf+'px '+family;ctx.fillText(tfor,x,pad+sc(2));ctx.textAlign='right';var rf=fit(route,23,15,content*.34,'900');ctx.font='900 '+rf+'px '+family;ctx.fillText(route,right,pad);ctx.textAlign='left';ctx.strokeStyle='#d1d5db';ctx.beginPath();ctx.moveTo(x,sc(36));ctx.lineTo(right,sc(36));ctx.stroke();
    var code=clean(item.code)||'-',comp=clean(item.comp),codeF=fit(code,42,27,content,'900');ctx.fillStyle='#111827';ctx.font='900 '+codeF+'px '+family;ctx.fillText(code,x,sc(42));var y=sc(42)+codeF+sc(1);if(comp){var cf=fit('('+comp+')',20,14,content,'700');ctx.font='700 '+cf+'px '+family;ctx.fillStyle='#4b5563';ctx.fillText('('+comp+')',x,y);y+=cf+sc(2);}var desc=clean(item.desc),df=fit(desc,14,10,content,500);ctx.font='500 '+df+'px '+family;ctx.fillStyle='#6b7280';var descText=desc;while(descText.length>1&&ctx.measureText(descText+'…').width>content)descText=descText.slice(0,-1);ctx.fillText(descText+(descText!==desc?'…':''),x,y);
    var boxY=sc(156),footY=H-sc(39),gap=sc(6),locW=Math.round(content*.57),qtyW=content-locW-gap;ctx.strokeStyle='#9ca3af';ctx.strokeRect(x,boxY,locW,footY-boxY);ctx.strokeRect(x+locW+gap,boxY,qtyW,footY-boxY);ctx.fillStyle='#374151';ctx.font='800 '+sc(16)+'px '+family;ctx.fillText('LOC',x+sc(8),boxY+sc(7));var loc=clean(item.newLoc||item.oldLoc)||'-',lf=fit(loc,38,25,locW-sc(16),'900');ctx.fillStyle='#111827';ctx.font='900 '+lf+'px '+family;ctx.fillText(loc,x+sc(8),boxY+sc(29));var qx=x+locW+gap;ctx.fillStyle='#374151';ctx.font='800 '+sc(16)+'px '+family;ctx.fillText('QTY',qx+sc(8),boxY+sc(7));var qty=clean(item.qty)||'-',qf=fit(qty,47,28,qtyW-sc(16),'900');ctx.fillStyle='#111827';ctx.font='900 '+qf+'px '+family;ctx.textAlign='center';ctx.fillText(qty,qx+qtyW/2,boxY+sc(27));ctx.textAlign='left';ctx.strokeStyle='#d1d5db';ctx.beginPath();ctx.moveTo(x,footY+sc(5));ctx.lineTo(right,footY+sc(5));ctx.stroke();var batch='BATCH '+(clean(item.batch)||'—'),bf=fit(batch,19,13,content,'800');ctx.fillStyle='#374151';ctx.font='800 '+bf+'px '+family;ctx.fillText(batch,x,footY+sc(10));
  };

  migrate();
})(typeof window!=='undefined'?window:this);
