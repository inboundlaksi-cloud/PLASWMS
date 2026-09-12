(function(){
'use strict';

const VERSION='1.5.2-passive-fzone-guard';
const ISSUE_SYNC_VERSION='5.3.1';
const cache=new Map();
const pending=new Map();
let selectedIds=new Set();
let activeJobId='';
let finishMode='';
let mobileView='open';
let installing=false;
let originals=null;
let observer=null;
let printGuardUntil=0;
const scheduledMatches=new Set();

function esc(value){
  return String(value==null?'':value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
// Inline handlers live inside a double-quoted HTML attribute. Encode the JSON
// quotes as entities so string IDs/locations cannot terminate the attribute.
function idArg(value){return esc(JSON.stringify(value==null?'':value));}
function number(value){const n=Number(value);return Number.isFinite(n)?n:0}
function formatQty(value){return number(value).toLocaleString('th-TH',{maximumFractionDigits:3})}
function formatTime(value){
  const n=number(value);
  return n?new Date(n).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'}):'-';
}
function app(){return window.app}
function jobs(){return app()&&app().state&&app().state.data&&app().state.data.replenishmentJobs||[]}
function findJob(id){return jobs().find(job=>String(job.id)===String(id))}
function currentUser(){return String(app()&&app().state&&app().state.ui&&app().state.ui.currentUser||'')}
function normalizeUser(value){return String(value||'').replace(/^Admin:\s*/i,'').trim().toLowerCase()}
function isMine(job){return normalizeUser(job&&job.assignedTo)===normalizeUser(currentUser())}
function isAdmin(){
  const a=app(),role=String(a&&a.state&&a.state.ui&&a.state.ui.currentRole||'').toLowerCase();
  return /^admin(?::|$)/i.test(currentUser())||role==='admin'||role==='supervisor';
}
function issueOpen(job){return !!(job&&job.topupIssue&&job.topupIssue.status==='open')}
function audit(job,action,detail){
  job.topupAudit=Array.isArray(job.topupAudit)?job.topupAudit:[];
  job.topupAudit.push({at:Date.now(),by:currentUser()||'unknown',action:action,detail:detail||''});
  if(job.topupAudit.length>80)job.topupAudit=job.topupAudit.slice(-80);
}
async function persist(job){
  const a=app();
  let addedSyncMark=false;
  if(job){
    job.lastModified=Date.now();
    if(issueOpen(job)&&job.topupIssue.syncVersion!==ISSUE_SYNC_VERSION){
      job.topupIssue.syncVersion=ISSUE_SYNC_VERSION;
      addedSyncMark=true;
    }
  }
  if(a&&typeof a.saveData==='function')a.saveData();
  try{
    if(job&&a&&typeof a.saveToFirebase==='function'){
      await a.saveToFirebase('replenishmentJobs',job);
    }
  }catch(error){
    if(addedSyncMark&&job&&job.topupIssue){
      delete job.topupIssue.syncVersion;
      if(a&&typeof a.saveData==='function')a.saveData();
    }
    throw error;
  }
  if(a&&typeof a.updateAllBadges==='function')a.updateAllBadges();
}

function readLocalTopUpJobs(){
  try{
    const rows=JSON.parse(localStorage.getItem('plas_data_topup')||'[]');
    return Array.isArray(rows)?rows:[];
  }catch(error){return []}
}

async function syncPendingLocalIssues(){
  const a=app();
  if(!a||typeof a.saveToFirebase!=='function')return;
  const localById=new Map(readLocalTopUpJobs().map(job=>[String(job&&job.id),job]));
  const queue=[];
  jobs().forEach(job=>{
    const local=localById.get(String(job&&job.id));
    if(local&&issueOpen(local)&&!job.topupIssue){
      job.topupIssue=Object.assign({},local.topupIssue);
      job.issuePausedAt=local.issuePausedAt||local.topupIssue.reportedAt||Date.now();
      if(Array.isArray(local.topupAudit))job.topupAudit=local.topupAudit.slice(-80);
    }
    if(issueOpen(job)&&job.topupIssue.syncVersion!==ISSUE_SYNC_VERSION)queue.push(job);
  });
  for(const job of queue){
    try{await persist(job)}catch(error){console.warn('TOPUP issue sync retry failed',job&&job.id,error)}
  }
  if(queue.length&&typeof a.refreshCurrentView==='function')a.refreshCurrentView();
}
function jobQty(job){return Math.abs(number(job&&job.qty))}
function productName(job){
  return String(job&&(
    job.itemName||job.name||job.description||job.desc||job.remark
  )||'').trim();
}
function jobNote(job,name){
  const note=String(job&&job.remark||'').trim();
  return note&&normalizeUser(note)!==normalizeUser(name)?note:'';
}
function notify(message,type){
  const a=app();
  if(a&&typeof a.toast==='function')a.toast(message,type||'info');
  else if(a&&type==='error'&&typeof a.showError==='function')a.showError(message);
}

async function request(action,jobId,extra,options){
  if(!window.PlasFZoneBridge||typeof window.PlasFZoneBridge.request!=='function'){
    throw new Error('ระบบเชื่อม F-Zone ยังไม่พร้อม กรุณาโหลดหน้าใหม่');
  }
  return window.PlasFZoneBridge.request('fzone-topup',Object.assign({action,jobId:String(jobId)},extra||{}),options);
}

async function loadMatch(jobId,force,interactive){
  const key=String(jobId),saved=cache.get(key);
  if(!force&&saved&&Date.now()-saved.loadedAt<60000)return saved;
  if(pending.has(key)){
    if(interactive===false)return pending.get(key);
    try{return await pending.get(key)}catch(_error){pending.delete(key)}
  }
  const task=request('match',key,null,{interactive:interactive!==false}).then(result=>{
    const data=Object.assign({},result,{loadedAt:Date.now()});
    cache.set(key,data);
    pending.delete(key);
    updateMatchBadge(key,data);
    return data;
  }).catch(error=>{
    pending.delete(key);
    updateMatchBadge(key,null,error);
    throw error;
  });
  pending.set(key,task);
  return task;
}

function selectedPalletIds(job,data){
  const fromMatch=data&&Array.isArray(data.selectedPalletIds)?data.selectedPalletIds:[];
  const fromJob=job&&Array.isArray(job.fzoneTopPalletIds)?job.fzoneTopPalletIds:[];
  return [...new Set(fromMatch.concat(fromJob).map(String).filter(Boolean))];
}
function palletTotal(data,ids){
  const wanted=new Set((ids||[]).map(String));
  return (data&&data.candidates||[])
    .filter(row=>wanted.has(String(row.palletId)))
    .reduce((sum,row)=>sum+number(row.qty),0);
}

function matchBadgeMarkup(job,interactive){
  const data=cache.get(String(job.id));
  const selected=selectedPalletIds(job,data);
  const canOpen=interactive!==false;
  if(selected.length){
    const total=data?palletTotal(data,selected):number(job.fzoneTopQty);
    const content='<i class="ph ph-lock-key"></i><span><small>เลือกจาก F‑Zone แล้ว</small><b>'+selected.length+' พาเลท'+(total?' · '+formatQty(total)+' ชิ้น':'')+'</b></span>'+(canOpen?'<i class="ph ph-caret-right"></i>':'');
    return canOpen
      ?'<button type="button" class="fzt-match-badge fzt-source has-reservation" data-fzt-match="'+esc(job.id)+'" onclick="PlasFZoneTopUp.open('+idArg(job.id)+')">'+content+'</button>'
      :'<span class="fzt-match-badge fzt-source has-reservation" data-fzt-match="'+esc(job.id)+'">'+content+'</span>';
  }
  if(!data){
    return '<span class="fzt-match-badge fzt-source is-loading" data-fzt-match="'+esc(job.id)+'" aria-live="polite"><i class="ph ph-spinner-gap fzt-spin"></i><span><small>แหล่งหยิบ</small><b>กำลังตรวจ F‑Zone…</b></span></span>';
  }
  if(!data.candidateCount){
    return '<span class="fzt-match-badge fzt-source plas-default" data-fzt-match="'+esc(job.id)+'"><i class="ph ph-map-pin"></i><span><small>ใช้ Location ตามงาน PLAS</small><b>'+esc(job.fromLoc||'ยังไม่ระบุจุดหยิบ')+'</b></span><i class="ph ph-check-circle"></i></span>';
  }
  const content='<i class="ph ph-warehouse"></i><span><small>มีสินค้าใน F‑Zone (ทางเลือก)</small><b>พบ '+data.candidateCount+' พาเลท · '+formatQty(data.totalQty)+' ชิ้น</b></span>'+(canOpen?'<i class="ph ph-caret-right"></i>':'');
  return canOpen
    ?'<button type="button" class="fzt-match-badge fzt-source has-stock" data-fzt-match="'+esc(job.id)+'" onclick="PlasFZoneTopUp.open('+idArg(job.id)+')">'+content+'</button>'
    :'<span class="fzt-match-badge fzt-source has-stock" data-fzt-match="'+esc(job.id)+'">'+content+'</span>';
}

function updateMatchBadge(jobId,data,error){
  document.querySelectorAll('[data-fzt-match]').forEach(node=>{
    if(node.getAttribute('data-fzt-match')!==String(jobId))return;
    if(error){
      if(String(error.code||'')==='FZONE_SESSION_REQUIRED'){
        node.outerHTML='<button type="button" class="fzt-match-badge fzt-source is-deferred" data-fzt-match="'+esc(jobId)+'" onclick="PlasFZoneTopUp.open('+idArg(jobId)+')"><i class="ph ph-warehouse"></i><span><small>F‑Zone เป็นทางเลือก</small><b>แตะเมื่อต้องการตรวจพาเลท</b></span><i class="ph ph-caret-right"></i></button>';
        return;
      }
      node.outerHTML='<button type="button" class="fzt-match-badge fzt-source is-error" data-fzt-match="'+esc(jobId)+'" onclick="PlasFZoneTopUp.retry('+idArg(jobId)+')"><i class="ph ph-warning-circle"></i><span><small>F‑Zone ไม่พร้อม</small><b>แตะเพื่อลองตรวจอีกครั้ง</b></span><i class="ph ph-arrows-clockwise"></i></button>';
      return;
    }
    const job=findJob(jobId);
    if(job)node.outerHTML=matchBadgeMarkup(job,!node.closest||!node.closest('.is-locked'));
  });
}

function emptyState(icon,title,detail){
  return '<div class="fzt-empty"><span><i class="ph '+icon+'"></i></span><b>'+esc(title)+'</b><p>'+esc(detail)+'</p></div>';
}

function jobCard(job,kind){
  const mine=isMine(job),active=kind==='active',locked=active&&!mine,hasIssue=issueOpen(job);
  const duration=active&&typeof app().getDuration==='function'?app().getDuration(job.startTime):'';
  const name=productName(job),note=jobNote(job,name);
  const fzone=matchBadgeMarkup(job,!locked);
  const primaryAction=hasIssue
    ?'<button type="button" class="fzt-button waiting" disabled><i class="ph ph-hourglass-high"></i><span>รอแอดมินแก้ปัญหา</span></button>'
    :active&&mine
      ?'<button type="button" class="fzt-button primary" onclick="window.app.finishJob('+idArg(job.id)+')"><i class="ph ph-check-circle"></i><span>ตรวจสอบและจบงาน</span></button>'
      :!active
        ?'<button type="button" class="fzt-button primary" onclick="PlasFZoneTopUp.accept('+idArg(job.id)+')"><i class="ph ph-hand-grabbing"></i><span>รับงานนี้</span></button>'
        :'';
  const user=locked
    ?'<div class="fzt-assignee"><span>'+esc(String(job.assignedTo||'?').charAt(0))+'</span><div><small>กำลังดำเนินการโดย</small><b>'+esc(job.assignedTo||'-')+'</b></div></div>'
    :'';
  const cancelAction=active&&mine
    ?'<button type="button" class="fzt-button cancel" onclick="PlasFZoneTopUp.cancelAccepted('+idArg(job.id)+')"><i class="ph ph-arrow-counter-clockwise"></i><span>ยกเลิกการรับงาน</span></button>'
    :'';
  return '<article class="fzt-job-card '+(active?'is-active ':'')+(hasIssue?'has-issue ':'')+(mine?'is-mine ':'')+(locked?'is-locked ':'')+'" data-fzt-job="'+esc(job.id)+'" data-fzt-kind="'+esc(kind)+'">'+
    '<header><div><span class="fzt-doc"><i class="ph ph-file-text"></i>'+esc(job.docNo||'ไม่มีเลขเอกสาร')+'</span><small>'+esc(job.date||'')+'</small></div>'+
    (hasIssue?'<span class="fzt-state issue"><i class="ph ph-warning-circle"></i>รอแก้ปัญหา</span>':active?'<span class="fzt-state '+(mine?'working':'locked')+'"><i class="ph '+(mine?'ph-clock-countdown':'ph-lock-key')+'"></i>'+esc(mine?duration:'ไม่ว่าง')+'</span>':'<span class="fzt-state ready"><i class="ph ph-broadcast"></i>ยังไม่รับ</span>')+'</header>'+
    '<div class="fzt-job-main"><div class="fzt-item"><small>ITEM</small><h4>'+esc(job.item||'-')+'</h4>'+(name?'<p>'+esc(name)+'</p>':'')+'</div>'+
    (note?'<p class="fzt-note"><i class="ph ph-note"></i>'+esc(note)+'</p>':'')+
    '<div class="fzt-route"><div><small>หยิบจาก</small><b>'+esc(job.fromLoc||'-')+'</b></div><i class="ph ph-arrow-right"></i><div><small>เติมไปที่</small><b>'+esc(job.toLoc||'-')+'</b></div></div>'+
    '<div class="fzt-qty"><span>ยอดที่ต้องเติม</span><strong>'+formatQty(jobQty(job))+'</strong><em>ชิ้น</em></div>'+
    (hasIssue?'<div class="fzt-issue-summary"><i class="ph ph-warning-circle"></i><div><b>'+esc(job.topupIssue.reasonLabel||job.topupIssue.reason||'พบปัญหา')+'</b><small>'+esc(job.topupIssue.note||'รอแอดมินตรวจสอบ')+'</small></div></div>':'')+
    (job.needsDimensionCheck?'<div class="fzt-alert"><i class="ph ph-warning"></i>ยอดเป็นทศนิยม กรุณาตรวจ Dimension ก่อนทำงาน</div>':'')+
    '</div><footer>'+fzone+user+'<div class="fzt-actions">'+
    primaryAction+cancelAction+'<button type="button" class="fzt-button issue" onclick="PlasFZoneTopUp.reportIssue('+idArg(job.id)+')"><i class="ph ph-warning-circle"></i><span>แจ้งปัญหา</span></button></div></footer></article>';
}

function setText(id,value){
  const node=document.getElementById(id);
  if(node)node.textContent=String(value);
}

function historyCard(job){
  const name=productName(job);
  const usedFzone=job.fzoneTopStatus==='completed'||selectedPalletIds(job,cache.get(String(job.id))).length>0;
  const finished=job.finishTime||job.lastModified;
  return '<article class="fzt-history-card"><header><div><small>ITEM</small><b>'+esc(job.item||'-')+'</b></div><strong>'+formatQty(jobQty(job))+' <small>ชิ้น</small></strong></header>'+
    (name?'<p>'+esc(name)+'</p>':'')+
    '<div class="fzt-history-route"><span><small>จาก</small><b>'+esc(job.fromLoc||'-')+'</b></span><i class="ph ph-arrow-right"></i><span><small>ไป</small><b>'+esc(job.toLoc||'-')+'</b></span></div>'+
    '<footer><span><i class="ph ph-user"></i>'+esc(job.assignedTo||'-')+'</span><span><i class="ph ph-clock"></i>'+esc(formatTime(finished))+'</span><em class="'+(usedFzone?'fzone':'plas')+'">'+(usedFzone?'F‑Zone':'PLAS')+'</em></footer></article>';
}

function renderHistory(done){
  const mine=document.getElementById('topup-history-mine');
  const team=document.getElementById('topup-history-team');
  if(!mine||!team)return;
  const myJobs=done.filter(isMine);
  const teamJobs=done.filter(job=>!isMine(job));
  mine.innerHTML=myJobs.length?myJobs.map(historyCard).join(''):emptyState('ph-user-circle','ยังไม่มีงานของฉัน','งานที่จบวันนี้จะแสดงที่นี่');
  team.innerHTML=teamJobs.length?teamJobs.map(historyCard).join(''):emptyState('ph-users-three','ยังไม่มีงานของทีม','งานของพนักงานคนอื่นจะแสดงแยกจากงานของคุณ');
  setText('topup-history-mine-count',myJobs.length);
  setText('topup-history-team-count',teamJobs.length);
}

function setView(view,focus){
  mobileView=['open','active','done'].includes(view)?view:'open';
  document.querySelectorAll('[data-fzt-view]').forEach(button=>{
    const active=button.getAttribute('data-fzt-view')===mobileView;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-selected',String(active));
  });
  document.querySelectorAll('[data-fzt-panel]').forEach(panel=>{
    panel.classList.toggle('is-mobile-current',panel.getAttribute('data-fzt-panel')===mobileView);
  });
  // Do not call scrollIntoView here. On mobile, swapping panels while the page
  // is moving caused a second forced scroll and made the screen feel stuck.
}

function adminIssueCard(job){
  const issue=job.topupIssue||{};
  return '<article class="fzt-issue-admin-card"><div><small>'+esc(job.docNo||'ไม่มีเลขเอกสาร')+' · '+esc(job.item||'-')+'</small><h4>'+esc(issue.reasonLabel||issue.reason||'แจ้งปัญหา TOPUP')+'</h4><p>'+esc(issue.note||'ไม่มีรายละเอียดเพิ่มเติม')+'</p><small>แจ้งโดย '+esc(issue.reportedBy||'-')+' · '+esc(formatTime(issue.reportedAt))+' | '+esc(job.fromLoc||'-')+' → '+esc(job.toLoc||'-')+'</small></div><div class="fzt-issue-admin-actions"><button class="fzt-button secondary" onclick="PlasFZoneTopUp.adminRelocate('+idArg(job.id)+')"><i class="ph ph-map-pin"></i>หาโลเคชั่นใหม่</button><button class="fzt-button issue" onclick="PlasFZoneTopUp.adminCancel('+idArg(job.id)+')"><i class="ph ph-x-circle"></i>ยกเลิกงาน</button></div></article>';
}
function renderAdminIssues(all,targetHost){
  let box=document.getElementById('fzt-admin-issues');
  const host=targetHost||document.getElementById('admin-topup-container')||document.getElementById('view-topup');
  if(!host)return;
  if(!isAdmin()){if(box)box.remove();return;}
  if(!box){box=document.createElement('section');box.id='fzt-admin-issues';box.className='fzt-admin-issues';}
  if(box.parentNode!==host)host.insertBefore(box,host.firstChild);
  const list=(all||[]).filter(issueOpen).sort((a,b)=>number(b.topupIssue&&b.topupIssue.reportedAt)-number(a.topupIssue&&a.topupIssue.reportedAt));
  box.innerHTML='<header><div><h3><i class="ph ph-warning-diamond"></i> แจ้งปัญหา TOPUP</h3><p>ตรวจสอบ ยกเลิก หรือกำหนด Location ใหม่ พร้อมเก็บประวัติทุกการดำเนินการ</p></div><b>'+list.length+' รายการ</b></header>'+(list.length?list.map(adminIssueCard).join(''):emptyState('ph-check-circle','ไม่มีปัญหาค้าง','รายการที่พนักงานแจ้งจะปรากฏตรงนี้'));
}

function renderTopUpJobs(){
  const open=document.getElementById('topup-list-open');
  const active=document.getElementById('topup-list-active');
  if(!open||!active)return;
  const all=jobs();
  renderAdminIssues(all);
  const openJobs=all.filter(job=>job.status==='Open')
    .sort((a,b)=>number(b.lastModified||b.id)-number(a.lastModified||a.id));
  const activeJobs=all.filter(job=>job.status==='In Progress')
    .sort((a,b)=>(Number(isMine(b))-Number(isMine(a)))||number(b.startTime||b.lastModified)-number(a.startTime||a.lastModified));
  open.innerHTML=openJobs.length?openJobs.map(job=>jobCard(job,'open')).join(''):emptyState('ph-check-circle','ไม่มีงานใหม่','งาน TopUp ใหม่จะแสดงที่นี่ทันที');
  active.innerHTML=activeJobs.length?activeJobs.map(job=>jobCard(job,'active')).join(''):emptyState('ph-activity','ยังไม่มีงานที่กำลังทำ','รับงานจากรายการด้านบนเพื่อเริ่มดำเนินการ');
  const today=new Date().toDateString();
  const done=all.filter(job=>{
    if(job.status!=='Done')return false;
    const d=job.finishTime?new Date(job.finishTime):job.lastModified?new Date(job.lastModified):null;
    return d&&d.toDateString()===today;
  }).sort((a,b)=>number(b.finishTime||b.lastModified)-number(a.finishTime||a.lastModified));
  renderHistory(done);
  const mineCount=activeJobs.filter(isMine).length;
  setText('topup-count-open',openJobs.length);
  setText('topup-count-mine',mineCount);
  setText('topup-count-done',done.length);
  setText('topup-tab-open',openJobs.length);
  setText('topup-tab-active',activeJobs.length);
  setText('topup-tab-done',done.length);
  setText('topup-board-open',openJobs.length+' งาน');
  setText('topup-board-active',activeJobs.length+' งาน');
  setView(mobileView,false);
  observeCards();
}

function observeCards(){
  if(observer)observer.disconnect();
  const nodes=Array.from(document.querySelectorAll('[data-fzt-job]'));
  if(!('IntersectionObserver'in window)){
    nodes.forEach(node=>scheduleMatch(node.dataset.fztJob));
    return;
  }
  observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      observer.unobserve(entry.target);
      scheduleMatch(entry.target.dataset.fztJob);
    });
  },{rootMargin:'80px'});
  nodes.forEach(node=>observer.observe(node));
}

function scheduleMatch(jobId){
  const key=String(jobId||'');
  if(!key||scheduledMatches.has(key))return;
  scheduledMatches.add(key);
  const run=()=>{
    scheduledMatches.delete(key);
    if(!findJob(key))return;
    loadMatch(key,false,false).catch(()=>{});
  };
  if(typeof window.requestIdleCallback==='function')window.requestIdleCallback(run,{timeout:1200});
  else window.setTimeout(run,180);
}

function ensureModal(){
  if(document.getElementById('fzt-modal'))return;
  const modal=document.createElement('div');
  modal.id='fzt-modal';
  modal.className='fzt-modal hidden';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  modal.setAttribute('aria-labelledby','fzt-modal-title');
  modal.innerHTML='<div class="fzt-modal-backdrop" onclick="PlasFZoneTopUp.close()"></div><section class="fzt-modal-panel"><header class="fzt-modal-head"><div class="fzt-modal-icon"><i class="ph ph-warehouse"></i></div><div><span>PLAS × BORNEO F‑ZONE</span><h2 id="fzt-modal-title">เลือกพาเลทสำหรับ TopUp</h2><p id="fzt-modal-subtitle"></p></div><button type="button" class="fzt-icon-button" onclick="PlasFZoneTopUp.close()" aria-label="ปิด"><i class="ph ph-x"></i></button></header><div id="fzt-modal-body" class="fzt-modal-body"></div><footer id="fzt-modal-foot" class="fzt-modal-foot"></footer></section>';
  document.body.appendChild(modal);
}

function setModalBusy(message){
  ensureModal();
  document.getElementById('fzt-modal-body').innerHTML='<div class="fzt-loading"><span><i class="ph ph-arrows-clockwise"></i></span><b>'+esc(message||'กำลังตรวจข้อมูล…')+'</b><p>กรุณารอสักครู่ ระบบกำลังทำงาน</p></div>';
  document.getElementById('fzt-modal-foot').innerHTML='';
}

function selectedRows(data){
  return (data.candidates||[]).filter(row=>selectedIds.has(String(row.palletId)));
}
function selectedTotal(data){return selectedRows(data).reduce((sum,row)=>sum+number(row.qty),0)}

function candidateCard(row){
  const id=String(row.palletId),checked=selectedIds.has(id);
  const selectable=!row.lockedByOther&&number(row.confidence)>=80;
  const itemSummary=(row.items||[]).slice(0,3).map(item=>'<li><b>'+esc(item.item||'-')+'</b><span>'+esc(item.description||'ไม่ระบุชื่อ')+'</span><strong>'+formatQty(item.qty)+' '+esc(item.unit||'')+'</strong></li>').join('');
  const matchLabel={PRIMARY_EXACT:'ITEM หลักตรงกัน',SECONDARY_EXACT:'ITEM รองตรงกัน',NAME_EXACT:'ชื่อตรงกัน',NAME_SUGGESTION:'ชื่อใกล้เคียง'}[row.matchMethod]||'พบข้อมูลที่เกี่ยวข้อง';
  return '<article class="fzt-pallet '+(checked?'is-selected ':'')+(!selectable?'is-disabled ':'')+'" data-fzt-pallet="'+esc(id)+'">'+
    '<label><input type="checkbox" '+(checked?'checked ':'')+(selectable?'':'disabled ')+'onchange="PlasFZoneTopUp.toggle('+idArg(id)+',this.checked)"><span class="fzt-check"><i class="ph ph-check"></i></span></label>'+
    '<div class="fzt-pallet-content"><header><div><small>'+esc(row.parentId||'-')+' · '+esc(row.location||'-')+'</small><h3><i class="ph ph-map-pin"></i>'+esc(row.point||'ยังไม่ระบุจุด')+'</h3></div><strong>'+formatQty(row.qty)+' <small>'+esc(row.unit||'PCS')+'</small></strong></header>'+
    '<div class="fzt-pallet-meta"><code>'+esc(id)+'</code><span class="'+(row.confidence>=80?'':'suggestion')+'">'+esc(matchLabel)+'</span>'+(row.itemCount>1?'<em><i class="ph ph-warning"></i>พาเลทรวม '+row.itemCount+' ITEM</em>':'')+'</div>'+
    '<ul>'+itemSummary+'</ul>'+
    '<footer><span><i class="ph ph-clock"></i>อัปเดต '+esc(formatTime(row.updatedAt))+'</span><button type="button" class="fzt-map-button" aria-label="เปิด '+esc(row.point||row.location||'ตำแหน่งนี้')+' บนแผนผัง F-Zone" onclick="event.preventDefault();event.stopPropagation();PlasFZoneTopUp.openMap('+idArg(row.parentId)+','+idArg(row.location)+','+idArg(row.point)+',this)"><i class="ph ph-map-trifold"></i><span>เปิดจุดบนแผนผัง</span></button></footer>'+
    (row.lockedByOther?'<div class="fzt-pallet-lock"><i class="ph ph-lock-key"></i>ถูกเลือกโดย '+esc(row.lockOwner||'ผู้ใช้อื่น')+'</div>':'')+
    (number(row.confidence)<80?'<div class="fzt-pallet-lock suggestion"><i class="ph ph-info"></i>ใช้เป็นคำแนะนำเท่านั้น เพราะจับคู่จากชื่อใกล้เคียง</div>':'')+
    '</div></article>';
}

function renderSelector(data){
  const job=findJob(activeJobId);
  if(!job)return close();
  const body=document.getElementById('fzt-modal-body'),foot=document.getElementById('fzt-modal-foot');
  document.getElementById('fzt-modal-subtitle').textContent=(job.docNo||'ไม่มีเลขเอกสาร')+' · '+(job.item||'-');
  const total=selectedTotal(data),required=jobQty(job),diff=required-total;
  const exact=Math.abs(diff)<0.0001;
  const groups={};
  (data.candidates||[]).forEach(row=>{
    const key=(row.parentId||'-')+' · '+(row.point||row.location||'-');
    if(!groups[key])groups[key]=[];
    groups[key].push(row);
  });
  const candidates=Object.entries(groups).map(([key,rows])=>
    '<section class="fzt-location-group"><header><div><i class="ph ph-map-pin-area"></i><span><b>'+esc(key)+'</b><small>'+rows.length+' พาเลท · '+formatQty(rows.reduce((sum,row)=>sum+number(row.qty),0))+' ชิ้น</small></span></div></header><div class="fzt-pallet-list">'+rows.map(candidateCard).join('')+'</div></section>'
  ).join('');
  body.innerHTML='<div class="fzt-selection-summary"><div><span>ยอดงาน PLAS</span><b>'+formatQty(required)+'</b><small>ชิ้น</small></div><i class="ph ph-equals"></i><div class="'+(exact?'is-complete':total>required?'is-over':'')+'"><span>เลือกจาก F‑Zone</span><b>'+formatQty(total)+'</b><small>ชิ้น</small></div></div>'+
    '<div class="fzt-selection-status '+(exact?'success':total>required?'error':'')+'"><i class="ph '+(exact?'ph-check-circle':total>required?'ph-warning':'ph-info')+'"></i><span>'+(exact?'จำนวนตรงกับงาน พร้อมยืนยันการเลือก':total>required?'เลือกเกิน '+formatQty(Math.abs(diff))+' ชิ้น กรุณานำบางพาเลทออก':'ยังขาดอีก '+formatQty(diff)+' ชิ้น เลือกพาเลทเพิ่มได้จากรายการด้านล่าง')+'</span></div>'+
    (candidates||emptyState('ph-package','ไม่พบพาเลทที่ตรงกัน','ตรวจ ITEM หลัก ITEM รอง หรือชื่อสินค้าใน F‑Zone'))+
    '<div class="fzt-safety"><i class="ph ph-shield-check"></i><div><b>ระบบจะนำออกทั้ง Pallet ID</b><p>ตรวจทุก ITEM ในพาเลท โดยเฉพาะพาเลทรวม ก่อนกดยืนยัน</p></div></div>';
  const reserved=(data.selectedPalletIds||[]).length>0;
  foot.innerHTML='<div><span>เลือกแล้ว <b>'+selectedIds.size+'</b> พาเลท</span><small>'+(reserved?'ระบบล็อกพาเลทชุดนี้ไว้แล้ว':'เมื่อยืนยัน ระบบจะล็อกไว้ตลอดกะงาน (สูงสุด 8 ชั่วโมง)')+'</small></div><div><button type="button" class="fzt-button secondary" onclick="PlasFZoneTopUp.close()">ปิด</button>'+(reserved?'<button type="button" class="fzt-button danger" onclick="PlasFZoneTopUp.release()"><i class="ph ph-lock-open"></i>ยกเลิกการเลือก</button>':'')+'<button type="button" class="fzt-button primary" '+(exact?'':'disabled')+' onclick="PlasFZoneTopUp.reserve()"><i class="ph ph-lock-key"></i>'+(reserved?'อัปเดตพาเลทที่เลือก':'ยืนยันพาเลทที่เลือก')+'</button></div>';
}

async function open(jobId){
  ensureModal();
  activeJobId=String(jobId);
  finishMode='';
  selectedIds=new Set();
  document.getElementById('fzt-modal').classList.remove('hidden');
  document.body.classList.add('fzt-modal-open');
  document.getElementById('fzt-modal-title').textContent='เลือกพาเลทสำหรับ TopUp';
  setModalBusy('กำลังค้นหาพาเลทใน F‑Zone');
  try{
    const data=await loadMatch(activeJobId,true,true);
    selectedIds=new Set((data.selectedPalletIds||[]).map(String));
    renderSelector(data);
  }catch(error){
    renderError(error);
  }
}

function renderError(error){
  const body=document.getElementById('fzt-modal-body'),foot=document.getElementById('fzt-modal-foot');
  body.innerHTML='<div class="fzt-error-state"><span><i class="ph ph-warning-circle"></i></span><b>โหลดข้อมูล F‑Zone ไม่สำเร็จ</b><p>'+esc(error&&error.message||error)+'</p></div>';
  foot.innerHTML='<div></div><div><button type="button" class="fzt-button secondary" onclick="PlasFZoneTopUp.close()">ปิด</button><button type="button" class="fzt-button primary" onclick="PlasFZoneTopUp.open('+idArg(activeJobId)+')"><i class="ph ph-arrows-clockwise"></i>ลองใหม่</button></div>';
}

function toggle(palletId,checked){
  if(checked)selectedIds.add(String(palletId));
  else selectedIds.delete(String(palletId));
  const data=cache.get(String(activeJobId));
  if(data)renderSelector(data);
}

async function reserve(){
  const data=cache.get(String(activeJobId));
  if(!data)return;
  const total=selectedTotal(data),required=Math.abs(number(data.requiredQty));
  if(Math.abs(total-required)>0.0001)return notify('จำนวนพาเลทที่เลือกต้องเท่ากับยอดงาน','error');
  setModalBusy('กำลังล็อกพาเลทที่เลือก');
  try{
    const result=await request('reserve',activeJobId,{palletIds:Array.from(selectedIds)});
    const refreshed=await loadMatch(activeJobId,true);
    selectedIds=new Set(result.palletIds||[]);
    renderSelector(refreshed);
    renderTopUpJobs();
    notify('เลือกและล็อก '+result.palletIds.length+' พาเลทแล้ว','success');
  }catch(error){
    renderError(error);
  }
}

async function release(){
  setModalBusy('กำลังยกเลิกการเลือกพาเลท');
  try{
    await request('release',activeJobId);
    const data=await loadMatch(activeJobId,true);
    selectedIds=new Set();
    renderSelector(data);
    renderTopUpJobs();
    notify('ยกเลิกการเลือกพาเลทแล้ว','success');
  }catch(error){
    renderError(error);
  }
}

function close(){
  const modal=document.getElementById('fzt-modal');
  if(modal)modal.classList.add('hidden');
  document.body.classList.remove('fzt-modal-open');
  if(finishMode==='plas'&&app()&&app().state&&app().state.current){
    app().state.current.pendingFinishId=null;
  }
  activeJobId='';
  finishMode='';
  selectedIds=new Set();
}

function cancelAccepted(jobId){
  const job=findJob(jobId);
  if(!job||job.status!=='In Progress')return notify('งานนี้ไม่ได้อยู่ระหว่างดำเนินการแล้ว','error');
  if(!isMine(job))return notify('ยกเลิกได้เฉพาะงานที่คุณรับไว้','error');
  activeJobId=String(jobId);
  finishMode='cancel';
  ensureModal();
  document.getElementById('fzt-modal').classList.remove('hidden');
  document.body.classList.add('fzt-modal-open');
  document.getElementById('fzt-modal-title').textContent='ยกเลิกการรับงาน';
  document.getElementById('fzt-modal-subtitle').textContent=(job.docNo||'ไม่มีเลขเอกสาร')+' · '+(job.item||'-');
  const reserved=selectedPalletIds(job,cache.get(String(job.id)));
  document.getElementById('fzt-modal-body').innerHTML='<div class="fzt-cancel-confirm"><span><i class="ph ph-arrow-counter-clockwise"></i></span><div><b>คืนงานนี้กลับไปที่ “งานใหม่”?</b><p>ใช้เมื่อกดรับงานผิดเท่านั้น งานจะไม่ถูกลบและพนักงานคนอื่นสามารถรับต่อได้</p></div></div>'+
    '<div class="fzt-finish-item"><span><small>ITEM</small><b>'+esc(job.item||'-')+'</b>'+(productName(job)?'<p>'+esc(productName(job))+'</p>':'')+'</span><strong>'+formatQty(jobQty(job))+' <small>ชิ้น</small></strong></div>'+
    '<div class="fzt-confirm-flow plas"><div><i class="ph ph-map-pin"></i><span><small>จาก</small><b>'+esc(job.fromLoc||'-')+'</b></span></div><i class="ph ph-arrow-right"></i><div><i class="ph ph-map-pin-line"></i><span><small>ไป</small><b>'+esc(job.toLoc||'-')+'</b></span></div></div>'+
    (reserved.length?'<div class="fzt-safety cancel"><i class="ph ph-lock-open"></i><div><b>ระบบจะปลดล็อก F‑Zone</b><p>'+reserved.length+' พาเลทที่เลือกไว้จะถูกคืนให้ใช้งานได้</p></div></div>':'')+
    '<div class="fzt-cancel-note"><i class="ph ph-clock-counter-clockwise"></i><span>ระบบจะเก็บผู้ยกเลิก เวลา และจำนวนครั้งไว้ในประวัติงาน</span></div>';
  document.getElementById('fzt-modal-foot').innerHTML='<div><span>ตรวจ ITEM และจำนวนอีกครั้ง</span><small>หากยังทำงานนี้อยู่ ให้เลือก “ทำงานต่อ”</small></div><div><button type="button" class="fzt-button secondary" onclick="PlasFZoneTopUp.close()">ทำงานต่อ</button><button id="fzt-cancel-accept-button" type="button" class="fzt-button cancel-confirm" onclick="PlasFZoneTopUp.confirmCancelAccepted()"><i class="ph ph-arrow-counter-clockwise"></i>คืนงานเข้าคิว</button></div>';
}

async function confirmCancelAccepted(){
  const jobId=String(activeJobId||'');
  if(!jobId)return;
  const button=document.getElementById('fzt-cancel-accept-button');
  if(button){button.disabled=true;button.innerHTML='<i class="ph ph-hourglass"></i>กำลังคืนงาน…';}
  try{
    const result=await request('cancel',jobId);
    const local=findJob(jobId);
    if(local&&result.job)Object.assign(local,result.job);
    if(typeof app().saveData==='function')app().saveData();
    cache.delete(jobId);
    mobileView='open';
    close();
    renderTopUpJobs();
    notify('คืนงานไปที่ “งานใหม่” แล้ว','success');
  }catch(error){
    if(button){button.disabled=false;button.innerHTML='<i class="ph ph-arrow-counter-clockwise"></i>ลองคืนงานอีกครั้ง';}
    notify(error.message||String(error),'error');
  }
}

async function finishJob(jobId){
  const job=findJob(jobId);
  if(!job)return;
  if(issueOpen(job))return notify('งานนี้อยู่ระหว่างรอแอดมินแก้ปัญหา','error');
  if(!isMine(job))return notify('งานนี้อยู่กับผู้ใช้อื่น','error');
  const saved=cache.get(String(jobId));
  const reserved=selectedPalletIds(job,saved);
  if(!reserved.length){
    try{
      if(window.FZone&&typeof window.FZone.locationConfig==='function'&&window.FZone.locationConfig(job.toLoc)){
        return originals.finishJob.call(app(),job.id);
      }
    }catch(_error){}
    activeJobId=String(jobId);
    finishMode='plas';
    if(app().state&&app().state.current)app().state.current.pendingFinishId=job.id;
    return showPlasFinishConfirmation(job);
  }
  let data=saved;
  try{
    if(!data||!selectedPalletIds(job,data).length){
      notify('กำลังตรวจพาเลทที่ล็อกใน F‑Zone…','info');
      data=await loadMatch(jobId,true);
    }
  }catch(error){
    return notify('ตรวจพาเลทที่ล็อกไว้ไม่สำเร็จ: '+(error.message||String(error)),'error');
  }
  activeJobId=String(jobId);
  finishMode='fzone';
  selectedIds=new Set(selectedPalletIds(job,data));
  showFinishConfirmation(job,data);
}

function accept(jobId){
  const job=findJob(jobId);
  if(!job)return;
  if(issueOpen(job))return notify('งานนี้อยู่ระหว่างรอแอดมินแก้ปัญหา','error');
  mobileView='active';
  return app().acceptJob(job.id);
}

function showPlasFinishConfirmation(job){
  ensureModal();
  document.getElementById('fzt-modal').classList.remove('hidden');
  document.body.classList.add('fzt-modal-open');
  document.getElementById('fzt-modal-title').textContent='ตรวจสอบและจบงาน';
  document.getElementById('fzt-modal-subtitle').textContent=(job.docNo||'ไม่มีเลขเอกสาร')+' · '+(job.item||'-');
  const name=productName(job);
  document.getElementById('fzt-modal-body').innerHTML='<div class="fzt-confirm-hero plas"><span><i class="ph ph-check-circle"></i></span><div><b>จบงานด้วย Location ตาม PLAS</b><p>งานนี้ไม่ได้เลือกพาเลทจาก F‑Zone จึงไม่ตัดยอด F‑Zone</p></div></div>'+
    '<div class="fzt-finish-item"><span><small>ITEM</small><b>'+esc(job.item||'-')+'</b>'+(name?'<p>'+esc(name)+'</p>':'')+'</span><strong>'+formatQty(jobQty(job))+' <small>ชิ้น</small></strong></div>'+
    '<div class="fzt-confirm-flow plas"><div><i class="ph ph-package"></i><span><small>หยิบจาก</small><b>'+esc(job.fromLoc||'-')+'</b></span></div><i class="ph ph-arrow-right"></i><div><i class="ph ph-map-pin"></i><span><small>เติมไปที่</small><b>'+esc(job.toLoc||'-')+'</b></span></div></div>'+
    '<div class="fzt-safety plas"><i class="ph ph-info"></i><div><b>F‑Zone เป็นทางเลือก</b><p>หากหยิบจาก Location ด้านบน สามารถยืนยันจบงานได้ทันที</p></div></div>';
  document.getElementById('fzt-modal-foot').innerHTML='<div><span>ตรวจ Item, จำนวน และ Location</span><small>ระบบจะบันทึกเฉพาะงาน PLAS</small></div><div><button type="button" class="fzt-button secondary" onclick="PlasFZoneTopUp.close()">กลับไปตรวจ</button><button id="fzt-complete-button" type="button" class="fzt-button primary" onclick="window.app.confirmFinishJob()"><i class="ph ph-check-circle"></i>ยืนยันจบงาน</button></div>';
}

function showFinishConfirmation(job,data){
  ensureModal();
  finishMode='fzone';
  document.getElementById('fzt-modal').classList.remove('hidden');
  document.body.classList.add('fzt-modal-open');
  document.getElementById('fzt-modal-title').textContent='ตรวจสอบและจบงาน';
  document.getElementById('fzt-modal-subtitle').textContent=(job.docNo||'')+' · '+(job.item||'-');
  const rows=selectedRows(data);
  document.getElementById('fzt-modal-body').innerHTML='<div class="fzt-confirm-hero"><span><i class="ph ph-check-circle"></i></span><div><b>ยืนยันจบงานและ TOP ออกจาก F‑Zone</b><p>ระบบจะทำสองรายการให้สำเร็จเป็นขั้นตอนเดียว</p></div></div>'+
    '<div class="fzt-confirm-flow"><div><i class="ph ph-warehouse"></i><span><small>นำออกจาก F‑Zone</small><b>'+rows.length+' พาเลท · '+formatQty(selectedTotal(data))+' ชิ้น</b></span></div><i class="ph ph-arrow-right"></i><div><i class="ph ph-map-pin"></i><span><small>Location ปลายทาง PLAS</small><b>'+esc(job.toLoc||'-')+'</b></span></div></div>'+
    '<div class="fzt-confirm-list">'+rows.map(row=>'<div><span><b>'+esc(row.palletId)+'</b><small>'+esc(row.parentId)+' · '+esc(row.point||row.location)+'</small></span><strong>'+formatQty(row.qty)+' '+esc(row.unit||'PCS')+'</strong></div>').join('')+'</div>'+
    '<div class="fzt-safety"><i class="ph ph-shield-check"></i><div><b>ป้องกันการตัดซ้ำแล้ว</b><p>หากอินเทอร์เน็ตสะดุด สามารถกดยืนยันซ้ำได้โดยยอดจะถูกตัดเพียงครั้งเดียว</p></div></div>';
  document.getElementById('fzt-modal-foot').innerHTML='<div><span>ตรวจสอบ Pallet ID และจำนวนอีกครั้ง</span><small>หลังสำเร็จ งาน PLAS จะเปลี่ยนเป็นเสร็จแล้ว</small></div><div><button type="button" class="fzt-button secondary" onclick="PlasFZoneTopUp.close()">ยังไม่จบ</button><button id="fzt-complete-button" type="button" class="fzt-button primary" onclick="window.app.confirmFinishJob()"><i class="ph ph-check-circle"></i>ยืนยันจบงาน</button></div>';
}

async function confirmFinishJob(){
  if(!activeJobId){
    const pendingId=app()&&app().state&&app().state.current&&app().state.current.pendingFinishId;
    if(!pendingId)return originals.confirmFinishJob.call(app());
    const completedId=String(pendingId);
    mobileView=nextWorkView(completedId);
    armCompletionGuard();
    const result=await Promise.resolve(originals.confirmFinishJob.call(app()));
    if(result!==true)return false;
    cache.delete(completedId);
    closePrintSurfaces();
    setView(mobileView,false);
    notify('จบงานแล้ว · อยู่หน้าเติมสินค้าต่อ','success');
    return result;
  }
  const button=document.getElementById('fzt-complete-button');
  if(button){
    button.disabled=true;
    button.innerHTML='<i class="ph ph-hourglass"></i>กำลังบันทึก…';
  }
  if(finishMode==='plas'){
    const completedId=String(activeJobId);
    try{
      mobileView=nextWorkView(completedId);
      armCompletionGuard();
      const result=await Promise.resolve(originals.confirmFinishJob.call(app()));
      if(result!==true){if(button){button.disabled=false;button.innerHTML='<i class="ph ph-check-circle"></i>ลองยืนยันอีกครั้ง';}return false;}
      cache.delete(completedId);
      close();
      closePrintSurfaces();
      setView(mobileView,false);
      notify('จบงานแล้ว · อยู่หน้าเติมสินค้าต่อ','success');
      return result;
    }catch(error){
      if(button){
        button.disabled=false;
        button.innerHTML='<i class="ph ph-check-circle"></i>ลองยืนยันอีกครั้ง';
      }
      return notify(error.message||String(error),'error');
    }
  }
  try{
    const result=await request('complete',activeJobId);
    const local=findJob(activeJobId);
    if(local&&result.job)Object.assign(local,result.job);
    if(app().state&&app().state.current)app().state.current.pendingFinishId=null;
    if(typeof app().saveData==='function')app().saveData();
    cache.delete(String(activeJobId));
    mobileView=nextWorkView(String(activeJobId));
    armCompletionGuard();
    close();
    renderTopUpJobs();
    closePrintSurfaces();
    notify('จบงานและ TOP ออกจาก F‑Zone แล้ว · อยู่หน้าเติมสินค้าต่อ','success');
  }catch(error){
    const failedJobId=String(activeJobId||'');
    if(button){
      button.disabled=false;
      button.innerHTML='<i class="ph ph-check-circle"></i>ลองยืนยันอีกครั้ง';
    }
    const code=String(error&&error.code||'');
    const status=Number(error&&error.status||0);
    const recoverable=status===409||[
      'TOPUP_NOT_RESERVED','TOPUP_RESERVATION_EXPIRED','TOPUP_QTY_MISMATCH',
      'PALLET_ITEM_MISMATCH','PALLET_NOT_ACTIVE','PALLET_TOPUP_RESERVED'
    ].includes(code);
    if(recoverable&&failedJobId){
      cache.delete(failedJobId);
      try{
        const fresh=await loadMatch(failedJobId,true);
        const stillSelected=Array.isArray(fresh.selectedPalletIds)&&fresh.selectedPalletIds.length>0;
        if(stillSelected){
          selectedIds=new Set(fresh.selectedPalletIds.map(String));
          showFinishConfirmation(findJob(failedJobId),fresh);
          notify((error.message||'ข้อมูลพาเลทเปลี่ยนแล้ว')+' — ระบบตรวจข้อมูลล่าสุดให้แล้ว กรุณาตรวจและยืนยันอีกครั้ง','error');
        }else{
          finishMode='';
          await open(failedJobId);
          notify((error.message||'รายการพาเลทเดิมใช้ต่อไม่ได้')+' — กรุณาเลือกพาเลทใหม่','error');
        }
        return;
      }catch(refreshError){
        notify((error.message||String(error))+' · ตรวจข้อมูลล่าสุดไม่สำเร็จ: '+(refreshError.message||String(refreshError)),'error');
        return;
      }
    }
    notify(error.message||String(error),'error');
  }
}

function nextWorkView(completedId){
  const remaining=jobs().filter(job=>String(job.id)!==String(completedId));
  return remaining.some(job=>job.status==='In Progress'&&isMine(job))?'active':'open';
}

function closePrintSurfaces(){
  ['modal-topup-sticker','modal-print-select','modal-tsc'].forEach(id=>{
    const node=document.getElementById(id);
    if(node)node.classList.add('hidden');
  });
  document.body.classList.remove('topup-sticker-open','topup-sticker-print-open','label-print-open');
  const a=app();
  if(a&&typeof a._closeQuickHub==='function')a._closeQuickHub();
  if(a&&typeof a.toggleBackdrop==='function')a.toggleBackdrop(false);
}

function armCompletionGuard(){
  // Mobile browsers can dispatch a delayed synthetic click after the finish
  // confirmation disappears. Keep every Quick Hub destination inert long
  // enough for that click to expire, especially the product-label screen.
  printGuardUntil=Date.now()+2200;
  closePrintSurfaces();
}

function guardQuickHubOpen(original,context,args){
  if(Date.now()<printGuardUntil){
    closePrintSurfaces();
    return false;
  }
  return original.apply(context,args);
}

function installCompletionTapGuard(){
  if(typeof document.addEventListener!=='function'||document.__fztCompletionTapGuard)return;
  document.__fztCompletionTapGuard=true;
  document.addEventListener('click',event=>{
    if(Date.now()>=printGuardUntil)return;
    const target=event&&event.target;
    const hub=target&&typeof target.closest==='function'?target.closest('#quick-hub'):null;
    if(!hub)return;
    if(typeof event.preventDefault==='function')event.preventDefault();
    if(typeof event.stopPropagation==='function')event.stopPropagation();
    if(typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
    closePrintSurfaces();
  },true);
}

async function openMap(parentId,locationCode,point,button){
  if(!window.PlasFZoneBridge||typeof window.PlasFZoneBridge.open!=='function'){
    return notify('ระบบเชื่อม F‑Zone ยังไม่พร้อม กรุณาโหลดหน้าใหม่','error');
  }
  const oldHtml=button&&button.innerHTML;
  if(button){
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    button.innerHTML='<i class="ph ph-spinner-gap fzt-spin"></i><span>กำลังเปิด…</span>';
  }
  try{
    return await window.PlasFZoneBridge.open({
      tab:'map',
      focusParent:parentId,
      focusLocation:locationCode,
      focusPoint:point
    });
  }finally{
    if(button){
      button.disabled=false;
      button.removeAttribute('aria-busy');
      button.innerHTML=oldHtml;
    }
  }
}

function reportIssue(jobId){
  const job=findJob(jobId);if(!job)return;
  ensureModal();activeJobId=String(jobId);
  document.getElementById('fzt-modal').classList.remove('hidden');document.body.classList.add('fzt-modal-open');
  document.getElementById('fzt-modal-title').textContent='แจ้งปัญหางาน TOPUP';
  document.getElementById('fzt-modal-subtitle').textContent=(job.docNo||'ไม่มีเลขเอกสาร')+' · '+(job.item||'-');
  document.getElementById('fzt-modal-body').innerHTML='<div class="fzt-form-grid"><label>สาเหตุ<select id="fzt-issue-reason"><option value="blocked">มีสินค้าวางขวางหน้าพื้นที่</option><option value="cannot_pick">ไม่สามารถเข้าไปตักสินค้าได้</option><option value="qty_mismatch">จำนวนงานกับพาเลทไม่ตรงกัน</option><option value="wrong_location">Location ไม่ถูกต้องหรือหาไม่พบ</option><option value="damaged">สินค้าหรือพาเลทเสียหาย</option><option value="other">อื่น ๆ</option></select></label><label>รายละเอียด<textarea id="fzt-issue-note" placeholder="ระบุสิ่งที่พบ ตำแหน่ง และจำนวนจริง เพื่อให้แอดมินแก้ไขได้เร็ว"></textarea><span class="fzt-help">ข้อมูลนี้จะถูกส่งไปหน้า “แจ้งปัญหา TOPUP” ของแอดมิน</span></label></div>';
  document.getElementById('fzt-modal-foot').innerHTML='<div><span>รายการจะยังไม่ถูกยกเลิกอัตโนมัติ</span><small>แอดมินเป็นผู้ตัดสินใจยกเลิกหรือหา Location ใหม่</small></div><div><button class="fzt-button secondary" onclick="PlasFZoneTopUp.close()">กลับ</button><button class="fzt-button issue" onclick="PlasFZoneTopUp.submitIssue()"><i class="ph ph-paper-plane-tilt"></i>ส่งปัญหา</button></div>';
}
async function submitIssue(){
  const job=findJob(activeJobId);if(!job)return;
  const select=document.getElementById('fzt-issue-reason'),note=document.getElementById('fzt-issue-note');
  const labels={blocked:'มีสินค้าวางขวางหน้าพื้นที่',cannot_pick:'ไม่สามารถเข้าไปตักสินค้าได้',qty_mismatch:'จำนวนงานกับพาเลทไม่ตรงกัน',wrong_location:'Location ไม่ถูกต้องหรือหาไม่พบ',damaged:'สินค้าหรือพาเลทเสียหาย',other:'ปัญหาอื่น ๆ'};
  const reason=select&&select.value||'other';
  const now=Date.now();
  job.topupIssue={status:'open',reason:reason,reasonLabel:labels[reason],note:String(note&&note.value||'').trim(),reportedBy:currentUser(),reportedAt:now};
  job.issuePausedAt=now;
  audit(job,'ISSUE_REPORTED',labels[reason]+(job.topupIssue.note?' — '+job.topupIssue.note:''));
  await persist(job);
  close();renderTopUpJobs();
  if(app()&&typeof app().refreshCurrentView==='function')app().refreshCurrentView();
  notify('ส่งปัญหาให้แอดมินแล้ว','success');
}
async function adminRelocate(jobId){
  const job=findJob(jobId);if(!job||!isAdmin())return notify('เฉพาะแอดมินเท่านั้น','error');
  const next=window.prompt('ระบุ Location ใหม่สำหรับ TOPUP',job.fromLoc||'');if(next===null)return;
  const location=String(next).trim();if(!location)return notify('กรุณาระบุ Location ใหม่','error');
  const old=job.fromLoc||'-';job.fromLoc=location;job.status='Open';job.assignedTo='';job.startTime=null;job.issuePausedAt=null;
  job.topupIssue.status='resolved';job.topupIssue.resolution='relocated';job.topupIssue.resolvedBy=currentUser();job.topupIssue.resolvedAt=Date.now();
  audit(job,'LOCATION_CHANGED',old+' → '+location);
  await persist(job);
  renderTopUpJobs();renderAdminTopUpDashboard();
  if(app()&&typeof app().renderAdminDashboard==='function')app().renderAdminDashboard();
  notify('กำหนด Location ใหม่และส่งงานกลับคิวแล้ว','success');
}
async function adminCancel(jobId){
  const job=findJob(jobId);if(!job||!isAdmin())return notify('เฉพาะแอดมินเท่านั้น','error');
  const reason=window.prompt('เหตุผลที่ยกเลิกงาน TOPUP','ยกเลิกตามการตรวจสอบปัญหา');if(reason===null)return;
  job.status='Cancelled';job.cancelReason=String(reason||'ยกเลิกโดยแอดมิน');job.cancelledBy=currentUser();job.cancelledAt=Date.now();job.issuePausedAt=null;
  if(job.topupIssue){job.topupIssue.status='resolved';job.topupIssue.resolution='cancelled';job.topupIssue.resolvedBy=currentUser();job.topupIssue.resolvedAt=Date.now();}
  audit(job,'JOB_CANCELLED',job.cancelReason);
  await persist(job);
  renderTopUpJobs();renderAdminTopUpDashboard();
  if(app()&&typeof app().renderAdminDashboard==='function')app().renderAdminDashboard();
  notify('ยกเลิกงานและบันทึกรายงานแล้ว','success');
}

async function retry(jobId){
  cache.delete(String(jobId));
  try{await loadMatch(jobId,true,true)}catch(error){notify(error.message||String(error),'error')}
}

function renderAdminTopUpDashboard(){
  if(!originals||typeof originals.renderTopUpDashboard!=='function')return;
  const result=originals.renderTopUpDashboard.apply(app(),arguments);
  renderAdminIssues(jobs(),document.getElementById('admin-topup-container'));
  return result;
}

function install(){
  if(installing||!app()||typeof app().renderTopUpJobs!=='function')return false;
  installing=true;
  originals={
    renderTopUpJobs:app().renderTopUpJobs,
    renderTopUpDashboard:app().renderTopUpDashboard,
    finishJob:app().finishJob,
    confirmFinishJob:app().confirmFinishJob,
    hubGoTopupStickers:app().hubGoTopupStickers,
    hubGoPrintLabels:app().hubGoPrintLabels
  };
  app().renderTopUpJobs=renderTopUpJobs;
  if(typeof app().renderTopUpDashboard==='function')app().renderTopUpDashboard=renderAdminTopUpDashboard;
  app().finishJob=finishJob;
  app().confirmFinishJob=async function(){if(this._fztFinishPending)return false;this._fztFinishPending=true;try{return await confirmFinishJob();}finally{this._fztFinishPending=false;}};
  if(typeof originals.hubGoTopupStickers==='function'){
    app().hubGoTopupStickers=function(){
      return guardQuickHubOpen(originals.hubGoTopupStickers,this,arguments);
    };
  }
  if(typeof originals.hubGoPrintLabels==='function'){
    app().hubGoPrintLabels=function(){
      return guardQuickHubOpen(originals.hubGoPrintLabels,this,arguments);
    };
  }
  installCompletionTapGuard();
  ensureModal();
  setTimeout(syncPendingLocalIssues,250);
  setTimeout(syncPendingLocalIssues,2500);
  installing=false;
  console.log('✅ PLAS_FZONE_TOPUP_INTEGRATION_'+VERSION+'_ACTIVE');
  return true;
}

window.PlasFZoneTopUp={install,accept,open,close,cancelAccepted,confirmCancelAccepted,toggle,reserve,release,retry,openMap,loadMatch,renderTopUpJobs,renderAdminTopUpDashboard,renderAdminIssues,setView,reportIssue,submitIssue,adminRelocate,adminCancel,syncPendingLocalIssues};

if(!install()){
  let attempts=0;
  const timer=setInterval(()=>{
    attempts++;
    if(install()||attempts>160)clearInterval(timer);
  },50);
}
})();
