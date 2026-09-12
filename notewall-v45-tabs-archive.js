/* NOTEWALL V4.5 TAB + ARCHIVE PATCH
   Purpose: force Note Wall to show the two main tabs in the active renderer,
   even if an older cached script.js renderer is still present. */
(function(){
  const PATCH_VERSION = '4.5.0-tabs-archive';
  function ready(fn){
    if (window.app && window.app.state) return fn();
    let tries = 0;
    const t = setInterval(function(){
      tries++;
      if (window.app && window.app.state) { clearInterval(t); fn(); }
      if (tries > 200) clearInterval(t);
    }, 50);
  }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function now(){ return Date.now(); }
  function todayStr(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function fmtDateTime(v){
    if (!v) return '-';
    try { const d = new Date(v); if (isNaN(d.getTime())) return String(v); return d.toLocaleString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); } catch(e){ return String(v); }
  }
  function getUser(app){
    try { return (app._nwCurrentUser && app._nwCurrentUser()) || app.state?.ui?.currentUser || app.state?.currentUser || 'ไม่ทราบ'; } catch(e){ return 'ไม่ทราบ'; }
  }
  function getRole(app){
    const u = getUser(app);
    const users = app.state?.data?.users || [];
    const found = users.find(x => (typeof x === 'string' ? x : (x.name||x.username||x.displayName||'')) === u);
    return (found && (found.role || found.type || found.position)) || app.state?.ui?.currentRole || app.state?.currentRole || '';
  }
  function isAdmin(app){
    const user = String(getUser(app)).toLowerCase();
    const role = String(getRole(app)).toLowerCase();
    return ['admin','superadmin','master','master admin','supervisor','manager','หัวหน้า','ผู้ดูแลระบบ'].some(k => user.includes(k) || role.includes(k));
  }
  function typeOf(n){
    const t = String(n.type || n.noteType || 'topup').toLowerCase();
    if (t === 'task') return 'topup';
    if (t === 'info') return 'announce';
    if (t === 'issue') return 'urgent';
    if (t === 'request') return 'request';
    if (t === 'announcement') return 'announce';
    return t;
  }
  const TYPES = {
    topup:{label:'งาน TOPUP', icon:'📦', color:'#f59e0b', bg:'#ffd1dc'},
    urgent:{label:'งานด่วน', icon:'⚠️', color:'#dc2626', bg:'#fde68a'},
    announce:{label:'ประกาศ', icon:'📢', color:'#2563eb', bg:'#bae6fd'},
    request:{label:'ฝากงาน', icon:'🙏', color:'#7c3aed', bg:'#e9d5ff'},
    default:{label:'โน้ต', icon:'📝', color:'#64748b', bg:'#fef3c7'}
  };
  function cfg(n){ return TYPES[typeOf(n)] || TYPES.default; }
  function textOf(n){ return n.text || n.title || n.message || n.note || '-'; }
  function createdBy(n){ return n.createdBy || n.owner || n.author || '-'; }
  function ts(n){ return n.createdAt || n.createdTime || n.time || n.timestamp || n.id || now(); }
  function exp(n){ return n.expiresAt || n.dueAt || n.expireAt || n.deadline || null; }
  function isExpired(n){ const e=exp(n); return !!e && Number(e) < now(); }
  function isDeleted(n){ return !!(n.deleted || n.isDeleted || n.status === 'deleted'); }
  function isDone(n){ return ['done','closed','complete','completed'].includes(String(n.status||'').toLowerCase()); }
  function archiveStatus(n){ if (isDeleted(n)) return 'deleted'; if (isDone(n)) return 'done'; if (isExpired(n)) return 'expired'; return 'active'; }
  function isArchived(n){ return isDeleted(n) || isDone(n) || isExpired(n) || !!n.closedAt || !!n.deletedAt; }
  function statusLabel(n){ const s=archiveStatus(n); return s==='done'?'ปิดงานแล้ว':s==='expired'?'หมดอายุแล้ว':s==='deleted'?'ลบแล้ว':'เปิดอยู่'; }
  function statusColor(n){ const s=archiveStatus(n); return s==='done'?'#16a34a':s==='expired'?'#dc2626':s==='deleted'?'#475569':'#f59e0b'; }
  function expiresLabel(n){
    const e=exp(n); if(!e) return 'ไม่มีวันหมดอายุ';
    const d=new Date(Number(e)); if (isNaN(d.getTime())) return String(e);
    if (Number(e) < now()) return 'เลยกำหนดแล้ว';
    if (d.toDateString() === new Date().toDateString()) return 'วันนี้ '+d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
    return d.toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function noteId(n, i){ return n.id != null ? n.id : (n.docId != null ? n.docId : i); }
  function currentNotes(app){
    if (!app.state.noteWall) app.state.noteWall = {notes:[], mode:'board', viewDate:todayStr(), filterStatus:'all', filterType:'all'};
    return app.state.noteWall.notes || [];
  }
  function canSee(app,n){
    const user = getUser(app);
    const type = typeOf(n);
    const targets = n.targetUsers || n.assignees || n.targetUser || [];
    const arr = Array.isArray(targets) ? targets : (targets ? [targets] : []);
    if (type === 'request' && arr.length) return arr.includes(user) || createdBy(n) === user || isAdmin(app) || n.claimedBy === user;
    return true;
  }
  function canDelete(app,n){ return isAdmin(app) || createdBy(n) === getUser(app); }
  function canClose(app,n){ return isAdmin(app) || createdBy(n) === getUser(app) || n.claimedBy === getUser(app); }
  function actionBtn(label, onclick, bg, color, border){ return `<button onclick="event.stopPropagation();${onclick}" style="padding:7px 11px;border-radius:9px;border:${border||'none'};background:${bg};color:${color||'#fff'};font-size:12px;font-weight:900;cursor:pointer;white-space:nowrap;">${label}</button>`; }
  function cardHtml(app, n, cid, i, compact){
    const c = cfg(n), id = noteId(n,i);
    const rot = compact ? 0 : ((i*2.3-4)%7);
    const target = typeOf(n)==='request' ? ((n.targetUsers&&n.targetUsers.length)?('เห็นเฉพาะ: '+n.targetUsers.join(', ')):(n.claimedBy?'รับโดย: '+n.claimedBy:'สำหรับทุกคน')) : 'สำหรับทุกคน';
    let html = `<div class="sticky-note" style="position:relative;transform:rotate(${rot}deg);min-height:${compact?'178':'205'}px;">`;
    html += `<div class="sticky-tape" style="left:42%;width:68px;background:rgba(200,190,140,0.55);transform:rotate(-4deg);"></div>`;
    html += `<div style="background:${c.bg};border-radius:4px;padding:19px 15px 13px;box-shadow:4px 8px 18px rgba(0,0,0,.18);border-bottom:5px solid ${c.color}55;min-height:${compact?'178':'205'}px;position:relative;overflow:hidden;">`;
    html += `<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:10px;"><span style="background:${c.color};color:#fff;padding:3px 9px;border-radius:7px;font-size:11px;font-weight:900;">${c.icon} ${c.label}</span><span style="background:rgba(255,255,255,.75);color:#334155;padding:3px 8px;border-radius:7px;font-size:10px;font-weight:900;">${esc(target)}</span></div>`;
    html += `<p style="font-size:${compact?'15':'17'}px;font-weight:900;line-height:1.45;color:#172033;margin:0 0 10px;">${esc(textOf(n))}</p>`;
    if (n.detail) html += `<p style="font-size:12px;color:#475569;line-height:1.45;margin:-2px 0 8px;">${esc(String(n.detail).slice(0,90))}</p>`;
    html += `<div style="font-size:12px;color:#334155;display:grid;gap:4px;">`;
    html += `<div>👤 สร้างโดย: <b>${esc(createdBy(n))}</b></div><div>🕘 สร้างเมื่อ: ${fmtDateTime(ts(n))}</div>`;
    html += `<div style="color:${isExpired(n)?'#dc2626':'#b45309'};font-weight:900;">⌛ หมดอายุ: ${esc(expiresLabel(n))}</div>`;
    if (n.claimedBy) html += `<div>🤚 เจ้าของงานหลัก: <b>${esc(n.claimedBy)}</b></div>`;
    html += `</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:13px;align-items:center;">`;
    html += actionBtn('✅ รับทราบ', `window.app._nwAckNote(${JSON.stringify(id)},'${cid}')`, '#fff', '#2563eb');
    if (typeOf(n)==='request' && !n.claimedBy) html += actionBtn('🤚 รับงาน', `window.app._nwAction(${JSON.stringify(id)},'claimed','${cid}')`, '#2563eb');
    if (canClose(app,n)) html += actionBtn('✅ ปิดงาน', `window.app._nwAction(${JSON.stringify(id)},'done','${cid}')`, '#fff', '#dc2626', '1.5px solid #ef4444');
    if (canDelete(app,n)) html += actionBtn('🗑️ ลบ', `window.app._nwDeleteNote(${JSON.stringify(id)},'${cid}')`, '#ef4444');
    html += actionBtn('📜', `window.app._nwShowHistory(${JSON.stringify(id)},'${cid}')`, 'rgba(255,255,255,.55)', '#475569', '1px solid #cbd5e1');
    html += `</div></div></div>`;
    return html;
  }
  function boardHtml(app,cid){
    const nw=app.state.noteWall;
    const notes=currentNotes(app).filter((n,i)=>!isArchived(n) && canSee(app,n));
    if (nw.filterType && nw.filterType !== 'all') notes.splice(0, notes.length, ...notes.filter(n=>typeOf(n)===nw.filterType));
    if (nw.filterStatus && nw.filterStatus !== 'all') notes.splice(0, notes.length, ...notes.filter(n=>String(n.status||'open')===nw.filterStatus));
    notes.sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0) || Number(ts(b))-Number(ts(a)));
    const isMobile=window.innerWidth<=760, isTablet=window.innerWidth>760&&window.innerWidth<=1080;
    const layoutCols=isMobile?'1fr':'minmax(0,70fr) minmax(250px,30fr)';
    const noteCols=isMobile?'1fr':(isTablet?'repeat(2,minmax(220px,1fr))':'repeat(3,minmax(230px,1fr))');
    const counts = {total:notes.length, open:notes.filter(n=>!n.claimedBy).length, claimed:notes.filter(n=>!!n.claimedBy).length, overdue:notes.filter(isExpired).length, done:currentNotes(app).filter(isDone).length};
    let html='';
    html += `<div style="padding:${isMobile?'8px 10px':'9px 16px'};display:flex;align-items:center;gap:7px;overflow-x:auto;flex-shrink:0;">`;
    [ ['all','ทั้งหมด '+counts.total,'#94a3b8'], ['open','เปิด '+counts.open,'#f59e0b'], ['claimed','รับ '+counts.claimed,'#3b82f6'], ['overdue','ค้าง '+counts.overdue,'#ef4444'], ['done','เสร็จ '+counts.done,'#22c55e'] ].forEach(p=>{ const on=nw.filterStatus===p[0]; html += `<button onclick="window.app._nwSetFilter('status','${p[0]}','${cid}')" style="padding:5px 11px;border-radius:10px;font-size:12px;font-weight:${on?900:600};background:${on?p[2]:'rgba(255,255,255,.09)'};color:#fff;border:none;cursor:pointer;white-space:nowrap;">${p[1]}</button>`; });
    html += `<div style="width:1px;height:22px;background:rgba(255,255,255,0.16);flex-shrink:0;margin:0 4px;"></div>`;
    Object.keys(TYPES).filter(k=>k!=='default').forEach(k=>{ const t=TYPES[k]; const on=nw.filterType===k; html += `<button onclick="window.app._nwSetFilter('type','${k}','${cid}')" style="padding:5px 11px;border-radius:10px;font-size:12px;font-weight:${on?900:600};background:${on?t.color:'rgba(255,255,255,.09)'};color:#fff;border:none;cursor:pointer;white-space:nowrap;">${t.icon} ${t.label}</button>`; });
    html += `</div><div style="flex:1;overflow:auto;padding:14px 16px 58px;"><div style="display:grid;grid-template-columns:${layoutCols};gap:${isMobile?'12px':'18px'};align-items:start;"><div style="display:grid;grid-template-columns:${noteCols};gap:${isMobile?'14px':'24px'};align-items:start;">`;
    if (!notes.length) html += `<div style="grid-column:1/-1;text-align:center;padding:54px;color:rgba(255,255,255,.55);"><div style="font-size:46px;">📭</div><p style="font-size:15px;font-weight:800;">ยังไม่มีโน้ตบนกระดาน</p><p style="font-size:12px;">กด “+ แปะโน้ต” เพื่อสร้างโน้ตใหม่</p></div>`;
    notes.slice(0,6).forEach((n,i)=> html += cardHtml(app,n,cid,i,false));
    html += `</div><div style="min-height:360px;">`;
    const rest=notes.slice(6);
    html += `<div style="position:sticky;top:12px;"><div style="background:rgba(255,255,255,.92);border-radius:20px;padding:14px 14px 18px;box-shadow:0 12px 34px rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.45);"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><b style="color:#334155;">🗂️ กองรอแสดง</b><span style="background:#ef4444;color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:900;">${rest.length}</span></div>`;
    if (!rest.length) html += `<div style="text-align:center;color:#94a3b8;padding:40px 8px;"><div style="font-size:42px;">✨</div><b>ไม่มีโน้ตเกิน 6 ใบ</b><p style="font-size:12px;">เมื่อมีโน้ตมากกว่า 6 ใบ จะมาซ้อนรอที่นี่</p></div>`;
    else html += `<div style="position:relative;height:220px;margin:8px 2px 16px;">` + rest.slice(0,6).map((n,i)=>{const c=cfg(n);return `<div onclick="window.app._nwAckNote(${JSON.stringify(noteId(n,i+6))},'${cid}')" title="คลิกเพื่อรับทราบใบนี้" style="position:absolute;left:${i*8}px;right:${i*3}px;top:${i*18}px;height:128px;background:${c.bg};border-bottom:4px solid ${c.color}55;border-radius:4px;box-shadow:0 8px 18px rgba(0,0,0,.18);transform:rotate(${i%2?2:-2}deg);padding:14px;cursor:pointer;overflow:hidden;"><span style="background:${c.color};color:white;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:900;">${c.icon} ${c.label}</span><p style="font-size:14px;font-weight:900;line-height:1.35;color:#1e293b;margin:10px 0 0;">${esc(textOf(n)).slice(0,60)}</p></div>`}).join('') + `</div><p style="font-size:12px;line-height:1.5;color:#64748b;margin:0;">ใบที่ 7 เป็นต้นไปจะรอที่นี่ และจะขยับขึ้นมาแทนเมื่อ 6 ใบแรกถูก รับทราบ / รับงาน / ปิดงาน</p>`;
    html += `</div></div></div></div></div>`;
    return html;
  }
  function archiveCard(n,i,selected,cid){ const c=cfg(n), id=noteId(n,i); return `<div onclick="window.app._nwSelectArchive(${JSON.stringify(id)},'${cid}')" style="cursor:pointer;background:${selected?'#fff8dc':'#fffaf0'};border:2px solid ${selected?c.color+'99':'#ead7b5'};border-radius:14px;padding:13px 14px;box-shadow:0 4px 12px rgba(0,0,0,.08);"><div style="display:flex;align-items:center;gap:8px;justify-content:space-between;"><span style="background:${c.color};color:#fff;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:900;">${c.icon} ${c.label}</span><span style="color:${statusColor(n)};font-size:11px;font-weight:900;">${statusLabel(n)}</span></div><div style="font-size:15px;font-weight:900;color:#2f1b0c;line-height:1.35;margin:10px 0 6px;">${esc(textOf(n)).slice(0,78)}</div><div style="font-size:11px;color:#6b4e2e;display:grid;gap:3px;"><span>สร้างโดย: <b>${esc(createdBy(n))}</b></span><span>สร้างเมื่อ: ${fmtDateTime(ts(n))}</span>${n.claimedBy?`<span>ผู้รับงาน: <b>${esc(n.claimedBy)}</b></span>`:''}</div></div>`; }
  function timelineHtml(n){
    const h = Array.isArray(n.history) ? n.history : [];
    if (!h.length) return `<div style="color:#94a3b8;font-size:12px;">ยังไม่มี timeline</div>`;
    return h.map(x=>`<div style="display:grid;grid-template-columns:70px 1fr;gap:8px;margin:8px 0;font-size:12px;"><span style="color:#64748b;">${esc(x.time || fmtDateTime(x.at || x.createdAt || ''))}</span><span><b>${esc(x.by||x.user||'ระบบ')}</b> ${esc(x.note || x.action || '')}${x.to?' → '+esc(x.to):''}</span></div>`).join('');
  }
  function archiveDetail(app,n,cid){
    if (!n) return `<div style="background:#fff8dc;border-radius:16px;padding:32px;text-align:center;color:#8a5a11;font-weight:900;">เลือกโน้ตเก่าเพื่อดูรายละเอียด</div>`;
    const c=cfg(n), id=noteId(n,0);
    let html=`<div style="background:#fffaf0;border-radius:18px;padding:18px;box-shadow:0 10px 26px rgba(0,0,0,.13);border:1px solid #ead7b5;position:sticky;top:12px;">`;
    html+=`<div style="background:${c.bg};border-radius:6px;padding:18px;position:relative;box-shadow:2px 5px 15px rgba(0,0,0,.12);"><div style="position:absolute;top:-8px;right:30px;width:72px;height:22px;background:rgba(200,190,140,.55);transform:rotate(8deg);"></div><div style="display:flex;align-items:center;gap:8px;justify-content:space-between;"><span style="background:${c.color};color:#fff;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:900;">${c.icon} ${c.label}</span><span style="color:${statusColor(n)};font-weight:900;font-size:12px;">${statusLabel(n)}</span></div><h2 style="font-size:22px;line-height:1.3;color:#2f1b0c;margin:14px 0 12px;">${esc(textOf(n))}</h2><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;font-size:12px;color:#4b3420;"><div>👤 สร้างโดย <b>${esc(createdBy(n))}</b></div><div>🤚 ผู้รับงาน <b>${esc(n.claimedBy||'-')}</b></div><div>🕘 สร้างเมื่อ ${fmtDateTime(ts(n))}</div><div>⌛ หมดอายุ ${esc(expiresLabel(n))}</div></div></div>`;
    if (n.detail) html+=`<div style="margin-top:14px;"><b style="color:#3b2716;">รายละเอียดโน้ต</b><p style="font-size:13px;line-height:1.65;color:#4b3420;white-space:pre-wrap;">${esc(n.detail)}</p></div>`;
    html+=`<div style="margin-top:14px;"><b style="color:#3b2716;">ประวัติ / Timeline</b><div style="border-left:3px solid #d6b980;margin-top:8px;padding-left:12px;">${timelineHtml(n)}</div></div>`;
    html+=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">`;
    html+=actionBtn('↩️ เปิดงานอีกครั้ง', `window.app._nwReopenNote(${JSON.stringify(id)},'${cid}')`, '#2563eb');
    if (canDelete(app,n)) html+=actionBtn('🗑️ ลบถาวร', `window.app._nwDeleteNote(${JSON.stringify(id)},'${cid}')`, '#ef4444');
    html+=`</div></div>`;
    return html;
  }
  function archiveHtml(app,cid){
    const nw=app.state.noteWall;
    const term=String(nw.archiveSearch||'').toLowerCase();
    let arr=currentNotes(app).filter((n)=>isArchived(n) && canSee(app,n));
    if (nw.archiveType && nw.archiveType!=='all') arr=arr.filter(n=>typeOf(n)===nw.archiveType);
    if (nw.archiveStatus && nw.archiveStatus!=='all') {
      if (nw.archiveStatus==='mine') arr=arr.filter(n=>createdBy(n)===getUser(app) || n.claimedBy===getUser(app)); else arr=arr.filter(n=>archiveStatus(n)===nw.archiveStatus);
    }
    if (term) arr=arr.filter(n=>JSON.stringify(n).toLowerCase().includes(term));
    arr.sort((a,b)=>Number(b.updatedAt||b.closedAt||b.deletedAt||ts(b))-Number(a.updatedAt||a.closedAt||a.deletedAt||ts(a)));
    if (!nw.archiveSelectedId && arr.length) nw.archiveSelectedId=noteId(arr[0],0);
    const selected=arr.find((n,i)=>String(noteId(n,i))===String(nw.archiveSelectedId)) || arr[0];
    const isMobile=window.innerWidth<=760;
    let html=`<div style="flex:1;overflow:auto;padding:${isMobile?'12px 10px 84px':'18px 18px 64px'};">`;
    html+=`<div style="background:rgba(255,248,220,.90);border:1px solid rgba(120,80,40,.18);border-radius:18px;padding:${isMobile?'12px':'18px'};box-shadow:0 12px 36px rgba(0,0,0,.12);margin-bottom:14px;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;"><div><h1 style="margin:0;font-size:${isMobile?'24px':'34px'};font-weight:900;color:#3b2716;">🗂️ ที่เสียบโน้ต</h1><p style="margin:2px 0 0;color:#6b4e2e;font-size:13px;">ค้นหาและย้อนดูโน้ตเก่า งานที่สั่งไว้ และประวัติการติดตาม</p></div><div style="background:#fffaf0;border-radius:14px;padding:10px 12px;color:#6b4e2e;font-size:12px;max-width:360px;">💡 โน้ตที่ปิดงาน หมดอายุ หรือลบแล้ว จะมาเก็บไว้ที่นี่</div></div>`;
    html+=`<div style="display:grid;grid-template-columns:${isMobile?'1fr':'1.6fr .8fr .8fr auto'};gap:10px;margin-top:14px;"><input value="${esc(nw.archiveSearch||'')}" oninput="window.app._nwArchiveSearch(this.value,'${cid}')" placeholder="ค้นหาข้อความ, คนสร้าง, ผู้รับงาน, TFOR, เลขรถ..." style="padding:13px 14px;border-radius:12px;border:1px solid #d7c5a4;background:#fff;font-weight:700;color:#334155;"><select onchange="window.app._nwArchiveType(this.value,'${cid}')" style="padding:12px;border-radius:12px;border:1px solid #d7c5a4;background:#fff;font-weight:800;"><option value="all">ประเภททั้งหมด</option><option value="topup">TOPUP</option><option value="urgent">งานด่วน</option><option value="announce">ประกาศ</option><option value="request">ฝากงาน</option></select><select onchange="window.app._nwArchiveStatus(this.value,'${cid}')" style="padding:12px;border-radius:12px;border:1px solid #d7c5a4;background:#fff;font-weight:800;"><option value="all">สถานะทั้งหมด</option><option value="mine">ของฉัน</option><option value="done">ปิดงานแล้ว</option><option value="expired">หมดอายุ</option><option value="deleted">ลบแล้ว</option></select><button onclick="window.app._nwArchiveClear('${cid}')" style="padding:12px 14px;border-radius:12px;border:1px solid #d7c5a4;background:#fff;font-weight:900;cursor:pointer;">ล้างตัวกรอง</button></div>`;
    const folders=[['all','ทั้งหมด',arr.length,'#2563eb'],['mine','ของฉัน',currentNotes(app).filter(n=>isArchived(n)&&(createdBy(n)===getUser(app)||n.claimedBy===getUser(app))).length,'#64748b'],['done','ปิดงานแล้ว',currentNotes(app).filter(isDone).length,'#16a34a'],['expired','หมดอายุ',currentNotes(app).filter(n=>isExpired(n)&&!isDone(n)).length,'#dc2626'],['request','ฝากงาน',currentNotes(app).filter(n=>isArchived(n)&&typeOf(n)==='request').length,'#7c3aed'],['topup','TOPUP',currentNotes(app).filter(n=>isArchived(n)&&typeOf(n)==='topup').length,'#f59e0b']];
    html+=`<div style="display:flex;gap:10px;overflow-x:auto;margin-top:14px;padding-bottom:4px;">`+folders.map(f=>`<button onclick="window.app._nwArchiveFolder('${f[0]}','${cid}')" style="min-width:128px;background:#fffaf0;border:1px solid #d7c5a4;border-radius:14px;padding:10px 12px;cursor:pointer;text-align:center;box-shadow:0 4px 10px rgba(0,0,0,.06);"><div style="color:${f[3]};font-weight:900;">${f[1]}</div><div style="font-weight:900;font-size:18px;color:#3b2716;">${f[2]}</div></button>`).join('')+`</div></div>`;
    html+=`<div style="display:grid;grid-template-columns:${isMobile?'1fr':'minmax(420px,1fr) minmax(360px,430px)'};gap:16px;align-items:start;"><div><div style="display:grid;grid-template-columns:${isMobile?'1fr':'repeat(2,minmax(220px,1fr))'};gap:16px;">`;
    if (!arr.length) html += `<div style="grid-column:1/-1;background:#fff8dc;border-radius:14px;padding:40px;text-align:center;color:#8a5a11;font-weight:900;">📭 ไม่พบโน้ตเก่า</div>`;
    arr.slice(0,12).forEach((n,i)=>{ html += archiveCard(n,i,String(noteId(n,i))===String(selected&&noteId(selected,0)),cid); });
    html+=`</div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;color:#fff8dc;font-size:12px;"><span>แสดง 1 - ${Math.min(12,arr.length)} จาก ${arr.length} รายการ</span><span style="background:rgba(255,255,255,.18);border-radius:8px;padding:5px 9px;">12 / หน้า</span></div></div>`;
    html+=archiveDetail(app,selected,cid)+`</div></div>`;
    return html;
  }
  function headerHtml(app,cid,mode,isOverlay){
    const isMobile=window.innerWidth<=760;
    let html=`<div class="nw-topbar" style="background:rgba(0,0,0,0.30);backdrop-filter:blur(10px);padding:${isMobile?'10px':'12px 16px'};display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;flex-shrink:0;">`;
    html+=`<div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">${isOverlay?`<button onclick="window.app.closeNoteWall()" style="background:rgba(255,255,255,0.14);border:none;border-radius:10px;width:40px;height:40px;color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>`:''}<div style="min-width:0;"><h2 style="margin:0;font-size:${isMobile?'18px':'21px'};font-weight:900;color:#f8fafc;font-family:Kanit,Sarabun,sans-serif;white-space:nowrap;">📋 Note Wall</h2><p style="margin:0;font-size:${isMobile?'10px':'11px'};color:#d7dce6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">กระดานโน้ต · ที่เสียบโน้ต · ประวัติงานทีม</p></div></div>`;
    html+=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;"><button onclick="window.app._nwToggleLegend('${cid}')" style="padding:6px 11px;border-radius:10px;background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.16);color:#fff;font-size:12px;cursor:pointer;font-weight:800;">💡 วิธีใช้</button><button onclick="window.app._nwShowNewNote('${cid}')" style="padding:8px 15px;border-radius:10px;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;color:#fff;font-size:13px;font-weight:900;cursor:pointer;box-shadow:0 8px 18px rgba(245,158,11,.28);">+ แปะโน้ต</button></div></div>`;
    html+=`<div class="nw-mode-tabs-v45" style="flex-shrink:0;background:rgba(255,255,255,0.96);border-bottom:1px solid rgba(120,80,40,.20);padding:${isMobile?'8px 10px':'10px 16px'};display:flex;gap:8px;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.08);position:relative;z-index:5;">`;
    [['board','📝',isMobile?'กระดาน':'กระดานโน้ต','#2563eb'],['archive','🗂️',isMobile?'ที่เสียบ':'ที่เสียบโน้ต','#b45309']].forEach(t=>{const on=mode===t[0];html+=`<button onclick="window.app._nwSetMode('${t[0]}','${cid}')" style="min-width:${isMobile?'0':'180px'};flex:${isMobile?'1':'0 0 auto'};padding:${isMobile?'10px':'12px 22px'};border-radius:14px;border:2px solid ${on?t[3]:'#e7d7bf'};cursor:pointer;font-weight:900;font-size:${isMobile?'13px':'15px'};color:${on?'#fff':'#334155'};background:${on?`linear-gradient(135deg,${t[3]},#1e3a8a)`:'#fffaf0'};box-shadow:${on?'0 8px 20px rgba(0,0,0,.18)':'0 3px 8px rgba(0,0,0,.05)'};">${t[1]} ${t[2]}</button>`;});
    html+=`</div>`;
    const legendDisplay=app.state.noteWall?.legendVisible?'':'none';
    html+=`<div id="nw-legend-${cid}" style="display:${legendDisplay};margin:10px 16px 0;background:rgba(255,251,235,0.96);border:1px solid rgba(245,158,11,.35);box-shadow:0 10px 30px rgba(0,0,0,.16);border-radius:16px;padding:14px 18px;flex-shrink:0;color:#334155;"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;font-size:12px;"><div><b>ปุ่มใช้งาน</b><div>✅ รับทราบ = ซ่อนเฉพาะฉัน</div><div>🤚 รับงาน = รับผิดชอบงานนี้</div><div>✅ ปิดงาน = ปิดสำหรับทุกคน</div><div>🗑️ Admin ลบโน้ตได้ทุกใบ</div></div><div><b>ที่เสียบโน้ต</b><div>อยู่ในหน้า Note Wall เท่านั้น</div><div>PC = รายการซ้าย รายละเอียดขวา</div><div>มือถือ = การ์ดเรียงลง กดดูรายละเอียด</div></div></div></div>`;
    return html;
  }
  function install(){
    const app=window.app; if(!app || app._nwV45Patched) return; app._nwV45Patched=true;
    if(!app.state.noteWall) app.state.noteWall={notes:[], mode:'board', viewDate:todayStr(), filterStatus:'all', filterType:'all'};
    app._nwSetMode=function(mode,cid){ this.state.noteWall.mode=mode||'board'; this.renderNoteWallContent(cid||'notewall-container'); };
    app.renderNoteWallContent=function(cid){
      const container=document.getElementById(cid); if(!container) return;
      if(!this.state.noteWall) this.state.noteWall={notes:[], mode:'board', viewDate:todayStr(), filterStatus:'all', filterType:'all'};
      const mode=this.state.noteWall.mode==='archive'?'archive':'board';
      const isOverlay=cid==='notewall-container';
      const wrapperClass='notewall-cork';
      container.innerHTML = `<div class="${wrapperClass} min-h-full" style="${isOverlay?'height:100vh;display:flex;flex-direction:column;':'border-radius:16px;overflow:hidden;min-height:70vh;'}">` + headerHtml(this,cid,mode,isOverlay) + (mode==='archive'?archiveHtml(this,cid):boardHtml(this,cid)) + `</div>`;
    };
    app.openNoteWall=function(mode){
      const overlay=document.getElementById('notewall-overlay'); if(!overlay) return;
      if(!this.state.noteWall) this.state.noteWall={notes:[], mode:'board'};
      this.state.noteWall.mode=mode || this.state.noteWall.mode || 'board';
      overlay.classList.remove('hidden');
      this.renderNoteWallContent('notewall-container');
      try{ this._nwRenderFloatingNotes && this._nwRenderFloatingNotes(); }catch(e){}
      document.body.style.overflow='hidden';
    };
    app.hubGoNoteWall=function(){ this._closeQuickHub && this._closeQuickHub(); this.openNoteWall('board'); };
    app.hubGoNoteArchive=function(){ this._closeQuickHub && this._closeQuickHub(); this.openNoteWall('archive'); };
    app._nwArchiveSearch=function(v,cid){ this.state.noteWall.archiveSearch=v; clearTimeout(this._nwArchiveSearchTimer); this._nwArchiveSearchTimer=setTimeout(()=>this.renderNoteWallContent(cid),120); };
    app._nwArchiveType=function(v,cid){ this.state.noteWall.archiveType=v; this.renderNoteWallContent(cid); };
    app._nwArchiveStatus=function(v,cid){ this.state.noteWall.archiveStatus=v; this.renderNoteWallContent(cid); };
    app._nwArchiveClear=function(cid){ this.state.noteWall.archiveSearch=''; this.state.noteWall.archiveType='all'; this.state.noteWall.archiveStatus='all'; this.renderNoteWallContent(cid); };
    app._nwSelectArchive=function(id,cid){ this.state.noteWall.archiveSelectedId=id; this.renderNoteWallContent(cid); };
    app._nwArchiveFolder=function(k,cid){ if(k==='all'){this.state.noteWall.archiveType='all';this.state.noteWall.archiveStatus='all';} if(k==='mine'){this.state.noteWall.archiveStatus='mine';} if(k==='done'){this.state.noteWall.archiveStatus='done';} if(k==='expired'){this.state.noteWall.archiveStatus='expired';} if(k==='request'){this.state.noteWall.archiveType='request';this.state.noteWall.archiveStatus='all';} if(k==='topup'){this.state.noteWall.archiveType='topup';this.state.noteWall.archiveStatus='all';} this.renderNoteWallContent(cid); };
    const oldSetFilter=app._nwSetFilter;
    app._nwSetFilter=function(kind,val,cid){ const nw=this.state.noteWall; if(kind==='status') nw.filterStatus=(nw.filterStatus===val?'all':val); else nw.filterType=(nw.filterType===val?'all':val); this.renderNoteWallContent(cid); };
    const oldAction=app._nwAction;
    app._nwAction=function(id,action,cid){
      let n=currentNotes(this).find((x,i)=>String(noteId(x,i))===String(id));
      if(!n){ if(oldAction) return oldAction.call(this,id,action,cid); return; }
      const user=getUser(this), t=new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
      if(!Array.isArray(n.history)) n.history=[];
      if(action==='claimed'){ n.claimedBy=user; n.status='claimed'; n.history.push({action:'claimed',by:user,time:t,note:'รับงาน'}); }
      if(action==='done'){ n.status='done'; n.closedAt=now(); n.closedBy=user; n.history.push({action:'done',by:user,time:t,note:'ปิดงาน'}); }
      n.updatedAt=now();
      try { if(window.db && n.id!=null) db.collection('noteWall').doc(String(n.id)).set(n).catch(console.error); } catch(e){}
      this.renderNoteWallContent(cid); try{this._nwRenderFloatingNotes&&this._nwRenderFloatingNotes();}catch(e){}
    };
    app._nwAckNote=function(id,cid){
      const user=getUser(this); let n=currentNotes(this).find((x,i)=>String(noteId(x,i))===String(id)); if(!n) return;
      if(!Array.isArray(n.acknowledgedBy)) n.acknowledgedBy=[]; if(!n.acknowledgedBy.includes(user)) n.acknowledgedBy.push(user);
      n.updatedAt=now(); try{ if(window.db && n.id!=null) db.collection('noteWall').doc(String(n.id)).set(n).catch(console.error); }catch(e){}
      this.renderNoteWallContent(cid); try{this._nwRenderFloatingNotes&&this._nwRenderFloatingNotes();}catch(e){}
    };
    app._nwReopenNote=function(id,cid){
      let n=currentNotes(this).find((x,i)=>String(noteId(x,i))===String(id)); if(!n) return;
      n.status='open'; n.deleted=false; n.closedAt=null; n.deletedAt=null; n.updatedAt=now(); if(!Array.isArray(n.history)) n.history=[]; n.history.push({action:'reopen',by:getUser(this),time:new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}),note:'เปิดงานอีกครั้ง'});
      try{ if(window.db && n.id!=null) db.collection('noteWall').doc(String(n.id)).set(n).catch(console.error); }catch(e){}
      this.state.noteWall.mode='board'; this.renderNoteWallContent(cid); try{this._nwRenderFloatingNotes&&this._nwRenderFloatingNotes();}catch(e){}
    };
    app._nwDeleteNote=function(id,cid){
      let n=currentNotes(this).find((x,i)=>String(noteId(x,i))===String(id)); if(!n) return;
      if(!canDelete(this,n)){ alert('คุณไม่มีสิทธิ์ลบโน้ตนี้'); return; }
      if(!confirm('ลบโน้ตนี้ถาวรหรือไม่?\n\n"'+textOf(n).slice(0,80)+'"\n\nAdmin สามารถลบโน้ตได้ทุกใบ และโน้ตจะหายจากทุกคน')) return;
      this.state.noteWall.notes=currentNotes(this).filter((x,i)=>String(noteId(x,i))!==String(id));
      try{ if(window.db && n.id!=null) db.collection('noteWall').doc(String(n.id)).delete().catch(console.error); }catch(e){}
      this.renderNoteWallContent(cid); try{this._nwRenderFloatingNotes&&this._nwRenderFloatingNotes();}catch(e){}
    };
    console.log('✅ NOTEWALL_V45_TABS_ARCHIVE_PATCH_ACTIVE');
  }
  ready(install);
})();
