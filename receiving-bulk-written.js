/*
 * PLAS WMS v5.13.8 — Receiving status filters + verified bulk Written confirmation
 * - Status filters directly in Receiving
 * - Select one/many rows and mark Written from the same page
 * - Floating review dialog before committing
 */
(function(root){
  'use strict';
  var app=root&&root.app;
  if(!app||app.__receivingBulkWrittenInstalled)return;
  app.__receivingBulkWrittenInstalled=true;

  var originalCardTemplate=app.cardTemplate&&app.cardTemplate.bind(app);
  var originalSwitchTab=app.switchTab&&app.switchTab.bind(app);
  var STATUS={PENDING:'Pending',WRITTEN:'Written',DONE:'Done',ISSUE:'Issue',REJECTED:'Rejected',DELETED:'Deleted',WAITING_ADMIN:'Waiting Admin',ADMIN_ASSIGNED:'Admin Assigned',SPLIT:'Split'};

  function clean(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function js(v){return JSON.stringify(v==null?'':v);}
  function currentUser(){return clean(app.state&&app.state.ui&&app.state.ui.currentUser)||'-';}
  function usableLoc(i){return clean(i&&i.newLoc)||clean(i&&i.oldLoc);}
  function isWritten(i){return i&&i.status===STATUS.WRITTEN;}
  function ensureLabel(i){
    if(!i)return i;
    if(typeof app._labelEnsure==='function'){try{return app._labelEnsure(i)||i;}catch(e){}}
    var old=clean(i.labelPrintStatus).toLowerCase();
    var hasPrint=Number(i.labelPrintCount)>0||!!i.labelLastPrintedAt||['printed','printed_pending','confirmed','reprinted','applied'].indexOf(old)>=0;
    i.labelPrintStatus=hasPrint?'printed':'unprinted';
    return i;
  }
  function isLabelPrinted(i){return !!ensureLabel(i)&&i.labelPrintStatus==='printed';}
  function labelStatusInfo(i){
    if(isLabelPrinted(i))return {label:'พิมพ์สติกเกอร์แล้ว',icon:'printer',cls:'printed'};
    return {label:'ยังไม่พิมพ์สติกเกอร์',icon:'tag',cls:'unprinted'};
  }
  function isExcluded(i){
    if(!i)return true;
    if(i.sourceMoveId!=null)return true;
    if([STATUS.DONE,STATUS.ISSUE,STATUS.ISSUE+' Cancelled',STATUS.REJECTED,STATUS.DELETED].indexOf(i.status)>=0)return true;
    if((!i.qty||Number(i.qty)<=0)&&(i.status===STATUS.SPLIT||i.splitGroupId))return true;
    return false;
  }
  function baseItems(){return (app.state&&app.state.data&&app.state.data.items||[]).filter(function(i){return !isExcluded(i);});}
  function searched(items){
    var q=app.state&&app.state.filters&&app.state.filters.search;
    if(q&&app.applyAdvancedSearch){try{return app.applyAdvancedSearch(items,q);}catch(e){}}
    return items;
  }
  function statusKey(i){
    if(isWritten(i))return 'written';
    if(i.status===STATUS.WAITING_ADMIN)return 'waiting';
    if(i.status===STATUS.ADMIN_ASSIGNED)return 'ready';
    return usableLoc(i)?'ready':'noloc';
  }
  function statusInfo(i){
    var key=statusKey(i);
    if(key==='written')return {key:key,label:'เขียนแล้ว',icon:'check-circle',cls:'written'};
    if(key==='waiting')return {key:key,label:'รอ Admin',icon:'hourglass-medium',cls:'waiting'};
    if(key==='ready')return {key:key,label:i.status===STATUS.ADMIN_ASSIGNED?'มี LOC จาก Admin':'พร้อมเขียนแล้ว',icon:'map-pin',cls:'ready'};
    return {key:key,label:'ยังไม่มี LOC',icon:'warning-circle',cls:'noloc'};
  }
  function filteredItems(){
    var list=searched(baseItems().slice());
    var f=app._receivingFilter||'unwritten';
    if(f==='unwritten')list=list.filter(function(i){return !isWritten(i);});
    else if(f==='ready')list=list.filter(function(i){return !isWritten(i)&&!!usableLoc(i)&&i.status!==STATUS.WAITING_ADMIN;});
    else if(f==='noloc')list=list.filter(function(i){return !isWritten(i)&&!usableLoc(i);});
    else if(f==='waiting')list=list.filter(function(i){return !isWritten(i)&&i.status===STATUS.WAITING_ADMIN;});
    else if(f==='written')list=list.filter(isWritten);
    return list;
  }
  function selectedItems(){
    var selected=app._receivingSelected||{};
    return baseItems().filter(function(i){return selected[String(i.id)]&&!isWritten(i);});
  }
  function countMap(){
    var list=searched(baseItems().slice());
    return {
      all:list.length,
      unwritten:list.filter(function(i){return !isWritten(i);}).length,
      ready:list.filter(function(i){return !isWritten(i)&&!!usableLoc(i)&&i.status!==STATUS.WAITING_ADMIN;}).length,
      noloc:list.filter(function(i){return !isWritten(i)&&!usableLoc(i);}).length,
      waiting:list.filter(function(i){return !isWritten(i)&&i.status===STATUS.WAITING_ADMIN;}).length,
      written:list.filter(isWritten).length,
      printedReady:filteredItems().filter(function(i){return !isWritten(i)&&!!usableLoc(i)&&i.status!==STATUS.WAITING_ADMIN&&isLabelPrinted(i);}).length
    };
  }
  function pendingCount(){return baseItems().filter(function(i){return !isWritten(i);}).length;}
  function isPendingView(){var v=document.getElementById('view-pending');return !!(v&&!v.classList.contains('hidden'));}

  app._receivingFilter=app._receivingFilter||'unwritten';
  app._receivingSelected=app._receivingSelected||{};

  if(originalCardTemplate){
    app.cardTemplate=function(item,index,options){
      var html=originalCardTemplate(item,index,options);
      if(String(html).indexOf('data-recv-id=')<0){
        html=String(html).replace('<div onclick=', '<div data-recv-id="'+esc(item&&item.id)+'" onclick=');
      }
      return html;
    };
  }

  app._receivingItems=filteredItems;
  app.setReceivingFilter=function(filter){
    this._receivingFilter=filter||'unwritten';
    this._receivingSelected={};
    this.renderPending();
  };
  app.toggleReceivingSelection=function(id){
    var item=(this.state.data.items||[]).find(function(i){return String(i.id)===String(id);});
    if(!item||isWritten(item))return;
    var key=String(item.id);
    if(this._receivingSelected[key])delete this._receivingSelected[key];else this._receivingSelected[key]=true;
    this._decorateReceivingCards();
    this._updateReceivingWorkflowUi();
  };
  app.clearReceivingSelection=function(){this._receivingSelected={};this._decorateReceivingCards();this._updateReceivingWorkflowUi();};
  app.selectReceivingFiltered=function(){
    var list=filteredItems().filter(function(i){return !isWritten(i);});
    var self=this,all=list.length&&list.every(function(i){return !!self._receivingSelected[String(i.id)];});
    list.forEach(function(i){var k=String(i.id);if(all)delete self._receivingSelected[k];else self._receivingSelected[k]=true;});
    this._decorateReceivingCards();this._updateReceivingWorkflowUi();
  };
  app.selectPrintedReceiving=function(){
    var list=filteredItems().filter(function(i){return !isWritten(i)&&!!usableLoc(i)&&i.status!==STATUS.WAITING_ADMIN&&isLabelPrinted(i);});
    this._receivingSelected={};
    list.forEach(function(i){app._receivingSelected[String(i.id)]=true;});
    this._decorateReceivingCards();this._updateReceivingWorkflowUi();
    if(!list.length){
      if(this.toast)this.toast('ไม่พบรายการที่พิมพ์สติกเกอร์แล้วและพร้อมเขียนในผลลัพธ์นี้','info');
      else if(this.showError)this.showError('ไม่พบรายการที่พิมพ์สติกเกอร์แล้วและพร้อมเขียน');
      return;
    }
    if(this.toast)this.toast('เลือกเฉพาะรายการที่พิมพ์สติกเกอร์แล้ว '+list.length+' รายการ','success');
  };
  app.quickReceivingWritten=function(id){
    this._receivingSelected={};this._receivingSelected[String(id)]=true;this.openReceivingWrittenReview();
  };

  app._updateReceivingWorkflowUi=function(){
    var counts=countMap();
    Object.keys(counts).forEach(function(k){var e=document.getElementById('recv-count-'+k);if(e)e.textContent=counts[k];});
    document.querySelectorAll('[data-recv-filter]').forEach(function(btn){btn.classList.toggle('is-active',btn.getAttribute('data-recv-filter')===(app._receivingFilter||'unwritten'));});
    var selected=selectedItems(),missing=selected.filter(function(i){return !usableLoc(i);}).length;
    var unprinted=selected.filter(function(i){return !isLabelPrinted(i);}).length;
    var n=document.getElementById('receiving-selected-count');if(n)n.textContent=selected.length;
    var m=document.getElementById('receiving-selected-missing');if(m)m.textContent=missing;
    var mw=document.getElementById('receiving-selected-missing-wrap');if(mw)mw.classList.toggle('hidden',missing===0);
    var up=document.getElementById('receiving-selected-unprinted');if(up)up.textContent=unprinted;
    var uw=document.getElementById('receiving-selected-unprinted-wrap');if(uw)uw.classList.toggle('hidden',unprinted===0);
    var visible=isPendingView()&&selected.length>0;
    var bar=document.getElementById('receiving-bulk-bar');if(bar)bar.classList.toggle('hidden',!visible);
    if(document.body&&document.body.classList)document.body.classList.toggle('recv-bulk-active',visible);
    var btn=document.getElementById('btn-receiving-mark-written');if(btn){btn.disabled=selected.length===0;btn.innerHTML='<i class="ph ph-checks"></i> ตรวจสอบและกดเขียนแล้ว ('+selected.length+')';}
    var printedBtn=document.getElementById('btn-select-printed-receiving');if(printedBtn){printedBtn.disabled=counts.printedReady===0;printedBtn.innerHTML='<i class="ph ph-printer"></i> เลือกที่พิมพ์แล้ว <b>'+counts.printedReady+'</b>';}
    var toolbar=document.getElementById('receiving-workflow-toolbar');if(toolbar)toolbar.classList.toggle('hidden',!isPendingView());
    var badge=document.getElementById('badge-pending');if(badge){var pc=pendingCount();badge.textContent=pc;badge.classList.toggle('hidden',pc===0);}
  };

  app._decorateReceivingCards=function(){
    var view=document.getElementById('view-pending');if(!view)return;
    var selected=this._receivingSelected||{};
    Array.from(view.querySelectorAll('[data-recv-id]')).forEach(function(card){
      var id=card.getAttribute('data-recv-id');
      var item=(app.state.data.items||[]).find(function(i){return String(i.id)===String(id);});
      if(!item)return;
      card.classList.add('recv-card');
      card.classList.toggle('recv-selected',!!selected[String(id)]);
      var old=card.querySelector('.recv-card-tools');if(old)old.remove();
      var info=statusInfo(item),labelInfo=labelStatusInfo(item),canSelect=!isWritten(item);
      var tools=document.createElement('div');tools.className='recv-card-tools';
      tools.innerHTML=(canSelect?'<button type="button" class="recv-card-check '+(selected[String(id)]?'is-on':'')+'" onclick="event.stopPropagation();window.app.toggleReceivingSelection('+js(item.id)+')" aria-label="เลือก"><i class="ph ph-check"></i></button>':'<span class="recv-card-check is-done"><i class="ph ph-check"></i></span>')+
        '<div class="recv-card-badges"><span class="recv-card-status '+info.cls+'"><i class="ph ph-'+info.icon+'"></i>'+esc(info.label)+'</span>'+
        '<span class="recv-label-status '+labelInfo.cls+'"><i class="ph ph-'+labelInfo.icon+'"></i>'+esc(labelInfo.label)+'</span></div>'+
        (canSelect&&usableLoc(item)&&item.status!==STATUS.WAITING_ADMIN?'<button type="button" class="recv-quick-write" onclick="event.stopPropagation();window.app.quickReceivingWritten('+js(item.id)+')"><i class="ph ph-pencil-simple"></i> เขียนแล้ว</button>':'');
      card.insertAdjacentElement('afterbegin',tools);
    });
  };

  app.renderPending=function(){
    var list=filteredItems();
    this.renderSmartList('view-pending',list,{receivingWorkflow:true});
    this._decorateReceivingCards();
    this._updateReceivingWorkflowUi();
  };

  app.openReceivingWrittenReview=function(){
    var items=selectedItems();
    if(!items.length){this.showError&&this.showError('ยังไม่ได้เลือกรายการ');return;}
    var old=document.getElementById('modal-receiving-written-review');if(old)old.remove();
    var missing=items.filter(function(i){return !usableLoc(i);});
    var rows=items.map(function(i){var loc=usableLoc(i),source=clean(i.newLoc)?'LOC ใหม่':'ใช้ LOC เดิม';return '<article class="recv-review-row '+(!loc?'has-error':'')+'"><div class="recv-review-main"><b>'+esc(i.code||'-')+'</b>'+(i.comp?'<small>('+esc(i.comp)+')</small>':'')+'<p>'+esc(i.desc||'—')+'</p></div><div class="recv-review-qty"><span>QTY</span><b>'+esc(i.qty||'-')+'</b></div><div class="recv-review-loc"><span>'+esc(loc?source:'ไม่พบ LOC')+'</span><b>'+esc(loc||'—')+'</b></div><button type="button" onclick="window.app.removeReceivingReviewItem('+js(i.id)+')" title="เอาออก"><i class="ph ph-x"></i></button></article>';}).join('');
    var html='<div id="modal-receiving-written-review" class="recv-review-modal"><div class="recv-review-dialog"><header><div><span>ตรวจสอบครั้งสุดท้าย</span><h3><i class="ph ph-checks"></i> เปลี่ยนเป็น “เขียนแล้ว”</h3><p>'+items.length+' รายการ · ผู้เขียน '+esc(currentUser())+'</p></div><button onclick="window.app.closeReceivingWrittenReview()"><i class="ph ph-x"></i></button></header>'+
      (missing.length?'<div class="recv-review-warning"><i class="ph ph-warning-circle"></i><div><b>มี '+missing.length+' รายการไม่มี Location</b><span>นำรายการออกจากชุด หรือกลับไปใส่ LOC ก่อนยืนยัน</span></div></div>':'<div class="recv-review-ok"><i class="ph ph-shield-check"></i> ITEM, QTY และ LOC พร้อมบันทึก</div>')+
      '<main>'+rows+'</main><footer><button class="secondary" onclick="window.app.closeReceivingWrittenReview()">กลับไปตรวจสอบ</button><button class="primary" onclick="window.app.confirmReceivingWritten()" '+(missing.length?'disabled':'')+'><i class="ph ph-check-circle"></i> ยืนยันเขียนแล้ว '+items.length+' รายการ</button></footer></div></div>';
    document.body.insertAdjacentHTML('beforeend',html);
  };
  app.removeReceivingReviewItem=function(id){
    delete this._receivingSelected[String(id)];
    var items=selectedItems();
    if(!items.length){this.closeReceivingWrittenReview();this._decorateReceivingCards();this._updateReceivingWorkflowUi();return;}
    this.openReceivingWrittenReview();this._decorateReceivingCards();this._updateReceivingWorkflowUi();
  };
  app.closeReceivingWrittenReview=function(){var m=document.getElementById('modal-receiving-written-review');if(m)m.remove();};
  app.confirmReceivingWritten=async function(){
    if(this._receivingCommitPending)return false;
    var items=selectedItems();
    if(!items.length){this.showError&&this.showError('ไม่พบรายการที่เลือก');return false;}
    var missing=items.filter(function(i){return !usableLoc(i);});
    if(missing.length){this.showError&&this.showError('ยังมี '+missing.length+' รายการไม่มี Location');return false;}
    this._receivingCommitPending=true;
    var who=currentUser(),time=new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}),stamp=Date.now(),self=this;
    var snapshots=items.map(function(item){return JSON.parse(JSON.stringify(item));});
    items.forEach(function(item){
      var loc=usableLoc(item);
      item.newLoc=loc;
      item.status=STATUS.WRITTEN;
      item.isNew=false;
      item.locWrittenBy=who;
      item.locWrittenTime=time;
      item.lastModified=stamp;
    });
    try{
      var saved;
      if(typeof this.saveManyToFirebase==='function')saved=await this.saveManyToFirebase('items',items);
      else saved=(await Promise.all(items.map(function(item){return self.saveToFirebase&&self.saveToFirebase('items',item);}))).every(function(ok){return ok!==false;});
      if(!saved)throw new Error('Firestore did not confirm the Written batch');
      items.forEach(function(item){try{self.logHistory&&self.logHistory(item,usableLoc(item),'write');}catch(e){}});
      try{this.saveData&&this.saveData();}catch(e){}
      try{this.auditLog&&this.auditLog('BULK_WRITTEN_FROM_RECEIVING',items.length+' รายการ โดย '+who);}catch(e){}
      this.closeReceivingWrittenReview();
      this._receivingSelected={};
      this.playSound&&this.playSound('success');
      this.showSuccess&&this.showSuccess('เปลี่ยนเป็นเขียนแล้ว '+items.length+' รายการ');
      this.renderPending();
      try{this.renderWritten&&this.renderWritten();}catch(e){}
      return true;
    }catch(error){
      items.forEach(function(item,index){Object.keys(item).forEach(function(key){delete item[key];});Object.assign(item,snapshots[index]);});
      try{this.saveData&&this.saveData();}catch(e){}
      console.error('Receiving Written confirmation failed',error);
      this.showError&&this.showError('บันทึกเขียนแล้วไม่สำเร็จ ข้อมูลยังไม่ถูกเปลี่ยน กรุณาลองใหม่');
      this.renderPending();
      return false;
    }finally{
      this._receivingCommitPending=false;
    }
  };

  if(originalSwitchTab){
    app.switchTab=function(tab){
      var result=originalSwitchTab(tab);
      setTimeout(function(){
        var pending=tab==='pending';
        var toolbar=document.getElementById('receiving-workflow-toolbar');if(toolbar)toolbar.classList.toggle('hidden',!pending);
        var bar=document.getElementById('receiving-bulk-bar');if(bar)bar.classList.toggle('hidden',!pending||selectedItems().length===0);
        if(pending)app.renderPending();
      },0);
      return result;
    };
  }

  setTimeout(function(){if(isPendingView())app.renderPending();else app._updateReceivingWorkflowUi();},0);
})(typeof window!=='undefined'?window:this);
