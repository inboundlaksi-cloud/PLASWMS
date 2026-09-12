/**
 * PLAS-WMS Features v4.0
 * ─────────────────────────────────────────────────────────────────────────────
 * F-01  My Stats Card          — User: สถิติส่วนตัว 14 วัน
 * F-02  Template Messages      — Admin: ข้อความ preset สำหรับ Location
 * F-03  Access Matrix          — Master Admin: ตาราง user × permission
 * F-04  Live Ops Board         — Supervisor: ดู real-time ทุกคน
 * F-05  Daily Target           — Supervisor: ตั้งเป้าและ track ทีม
 * F-06  Guided Task Mode       — Intern: step-by-step + toggle เปิด/ปิด
 * F-07  Intern Leaderboard     — Supervisor: ranking น้อง
 * F-08  Daily Diary Viewer     — Supervisor: อ่าน diary น้อง
 * F-09  NoteWall v2            — Role-based permissions ทุก role
 * ─────────────────────────────────────────────────────────────────────────────
 * Load AFTER script.js, features-v3.js, intern-system.js
 */
(function () {
'use strict';

var _iv = setInterval(function () {
    if (!window.app || !window.app.state) return;
    clearInterval(_iv);
    initV4();
}, 150);

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════════════ */
function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escQ(s) { return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

/* ─── Role detection ──────────────────────────────────────────────────── */
function getRole() {
    var app = window.app;
    var u = (app.state.ui && app.state.ui.currentUser) || '';
    if (app.state.ui && app.state.ui.currentScreen === 'master-admin') return 'master';
    if (u === 'Supervisor' || u.toLowerCase().startsWith('supervisor')) return 'supervisor';
    if (u === 'Admin' || u.startsWith('Admin:')) return 'admin';
    var interns = (app.state.features && app.state.features.interns) || [];
    if (interns.some(function(i){ return (i.nickname||i.name) === u; })) return 'intern';
    return 'user';
}
function currentUser() { return (window.app.state.ui && window.app.state.ui.currentUser) || ''; }
function isAdmin()      { var r=getRole(); return r==='admin'||r==='master'; }
function isMaster()     { return getRole()==='master'; }
function isSupervisor() { return getRole()==='supervisor'; }
function isIntern()     { return getRole()==='intern'; }

/* ─── Firebase shorthand ─────────────────────────────────────────────── */
function fbSet(path, data) {
    try { if(window.db) return window.db.collection(path.split('/')[0]).doc(path.split('/').slice(1).join('/')).set(data,{merge:true}); } catch(e) {}
}
function fbGet(path, cb) {
    try { if(window.db) window.db.collection(path.split('/')[0]).doc(path.split('/').slice(1).join('/')).get().then(function(s){ cb(s.exists?s.data():null); }).catch(function(){cb(null);}); } catch(e){cb(null);}
}

/* ─── Simple modal ───────────────────────────────────────────────────── */
function removeEl(id) { var e=document.getElementById(id); if(e) e.remove(); }
function mkOverlay(id, content, minH) {
    removeEl(id);
    var d = document.createElement('div');
    d.id = id;
    d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);z-index:10200;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto;';
    d.onclick = function(e){ if(e.target===d) d.remove(); };
    var inner = document.createElement('div');
    inner.style.cssText = 'background:#fff;border-radius:20px;padding:24px;max-width:680px;width:100%;margin-top:12px;min-height:'+(minH||0)+'px;';
    inner.innerHTML = content;
    d.appendChild(inner);
    document.body.appendChild(d);
    return inner;
}

/* ═══════════════════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════════════════ */
function initV4() {
    var app = window.app;

    /* ── v4 state ── */
    if (!app.state.v4) app.state.v4 = {
        templateMsgs: [],
        dailyTarget: {},
        guidedTaskEnabled: false,
        nwTypePerms: { user:['task','issue','info','request'], intern:['task','request'] },
        liveOpsInterval: null,
        accessMatrixSaved: {}
    };

    /* ── Patch login() to inject stats bar for user ── */
    var _origLogin = app.login.bind(app);
    app.login = function(user) {
        _origLogin(user);
        var role = getRole();
        // 🎓 ลบปุ่มม่วง Guided Task ที่อาจค้างจาก session ก่อน (ทุก role)
        try { removeEl('v4-guided-btn'); } catch(e) {}
        if (role === 'user') setTimeout(function(){ v4_injectStatsBar(user); }, 300);
    };

    /* ── Patch renderAdminActions to inject template FAB ── */
    var _origRenderActions = app.renderAdminActions.bind(app);
    app.renderAdminActions = function() {
        _origRenderActions();
        setTimeout(v4_injectTemplateFAB, 200);
    };

    /* ── Patch renderSupervisorDashboard to inject Live Ops + Target + Diary + Leaderboard ── */
    var _origSupDash = app.renderSupervisorDashboard.bind(app);
    app.renderSupervisorDashboard = function() {
        _origSupDash();
        setTimeout(function(){
            v4_injectDailyTarget();
            v4_injectLiveOpsBoard();
            v4_injectDiaryLeaderboardButtons();
        }, 200);
    };

    /* ── Patch renderMasterAdminContent to inject Access Matrix section ── */
    var _origMasterRender = app.renderMasterAdminContent.bind(app);
    app.renderMasterAdminContent = function() {
        _origMasterRender();
        setTimeout(v4_injectAccessMatrix, 200);
    };

    /* ── Patch renderNoteWallContent with v2 role logic + NoteWall v4.7 tabs/archive ── */
    app.renderNoteWallContent = v4_renderNoteWall;
    app._nwSetMode = function(mode, cid){ if(!this.state.noteWall) this.state.noteWall={notes:[]}; this.state.noteWall.mode = (mode==='archive'?'archive':'board'); this.renderNoteWallContent(cid || 'notewall-container'); };
    app._nwArchiveSearch = function(v, cid){ if(!this.state.noteWall) this.state.noteWall={notes:[]}; this.state.noteWall.archiveSearch = v || ''; this.renderNoteWallContent(cid || 'notewall-container'); };
    app._nwArchiveClear = function(cid){ if(!this.state.noteWall) this.state.noteWall={notes:[]}; this.state.noteWall.archiveSearch=''; this.state.noteWall.archiveType='all'; this.state.noteWall.archiveStatus='all'; this.renderNoteWallContent(cid || 'notewall-container'); };
    app._nwSelectArchive = function(id, cid){ if(!this.state.noteWall) this.state.noteWall={notes:[]}; this.state.noteWall.archiveSelectedId = id; this.renderNoteWallContent(cid || 'notewall-container'); };
    app._nwArchiveFolder = function(k, cid){ if(!this.state.noteWall) this.state.noteWall={notes:[]}; if(k==='all'){this.state.noteWall.archiveType='all';this.state.noteWall.archiveStatus='all';} else if(k==='done'){this.state.noteWall.archiveType='all';this.state.noteWall.archiveStatus='done';} else if(k==='expired'){this.state.noteWall.archiveType='all';this.state.noteWall.archiveStatus='expired';} else {this.state.noteWall.archiveType=k;this.state.noteWall.archiveStatus='all';} this.renderNoteWallContent(cid || 'notewall-container'); };
    app._nwReopenNote = app._nwReopenNote || function(id,cid){ var notes=(this.state.noteWall&&this.state.noteWall.notes)||[]; var n=notes.find(function(x){return String(x.id)===String(id);}); if(!n) return; n.status='open'; n.deleted=false; n.closedAt=null; n.deletedAt=null; n.updatedAt=Date.now(); if(!Array.isArray(n.history)) n.history=[]; n.history.push({action:'reopen',by:currentUser(),time:new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}),note:'เปิดงานอีกครั้ง'}); try{ if(window.db) window.db.collection('noteWall').doc(String(id)).set(n).catch(function(){}); }catch(e){} this.state.noteWall.mode='board'; this.renderNoteWallContent(cid || 'notewall-container'); };
    console.log('✅ NOTEWALL_V47_FEATURES_RENDERER_READY');

    /* ── Patch _nwShowNewNote with role restrictions ── */
    app._nwShowNewNote = v4_nwShowNewNote;

    /* ── Patch _nwDeleteNote with role-based delete ── */
    app._nwDeleteNote = v4_nwDeleteNote;

    /* ── Load template messages from Firebase ── */
    fbGet('v4_settings/templateMsgs', function(d){
        if (d && d.list) app.state.v4.templateMsgs = d.list;
    });

    /* ── Load daily target from Firebase ── */
    fbGet('v4_settings/dailyTarget', function(d){
        if (d) app.state.v4.dailyTarget = d;
    });

    /* ── Load guidedTask toggle from Firebase ── */
    fbGet('v4_settings/guidedTask', function(d){
        if (d) app.state.v4.guidedTaskEnabled = !!d.enabled;
    });

    /* ── Load nw type permissions ── */
    fbGet('v4_settings/nwTypePerms', function(d){
        if (d) app.state.v4.nwTypePerms = d;
    });

}

/* ═══════════════════════════════════════════════════════════════════════════
   F-01  MY STATS CARD (User)
═══════════════════════════════════════════════════════════════════════════ */
function v4_injectStatsBar(username) {
    var app = window.app;
    removeEl('v4-stats-bar');
    var header = document.querySelector('#screen-user header .flex.items-center.gap-4');
    if (!header) return;

    /* count user's jobs from history */
    var history = app.state.data.history || app.state.data.items || [];
    var today = todayStr();
    var todayDone = (history.filter(function(i){ return i.writtenBy===username && i.date===today; })||[]).length;
    var weekStart = new Date(); weekStart.setDate(weekStart.getDate()-6);
    var weekDone = (history.filter(function(i){
        if (!i.writtenBy || i.writtenBy!==username) return false;
        return i.date && i.date >= weekStart.toISOString().slice(0,10);
    })||[]).length;

    /* inject bar below header row */
    var bar = document.createElement('div');
    bar.id = 'v4-stats-bar';
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;';
    bar.innerHTML =
        '<span style="font-size:11px;font-weight:700;color:#475569;">สถิติฉัน:</span>'+
        '<span style="background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;">วันนี้ '+todayDone+'</span>'+
        '<span style="background:#dcfce7;color:#15803d;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;">7 วัน '+weekDone+'</span>'+
        '<button onclick="window.v4_showStatsModal(\''+escQ(username)+'\')" style="font-size:11px;font-weight:700;color:#7c3aed;background:#ede9fe;border:none;padding:2px 8px;border-radius:99px;cursor:pointer;">📊 ดูกราฟ</button>';

    var target = header.closest('header') || header.parentElement;
    var flex = target.querySelector('.flex.justify-between');
    if (flex) flex.insertAdjacentElement('afterend', bar);
}

window.v4_showStatsModal = function(username) {
    var app = window.app;
    var history = app.state.data.history || app.state.data.items || [];
    var days = [];
    for (var i=13; i>=0; i--) {
        var d = new Date(); d.setDate(d.getDate()-i);
        var ds = d.toISOString().slice(0,10);
        var count = history.filter(function(h){ return h.writtenBy===username && h.date===ds; }).length;
        days.push({ label: (d.getMonth()+1)+'/'+d.getDate(), count: count });
    }
    var maxCount = Math.max.apply(null, days.map(function(d){return d.count;}))||1;
    var bars = days.map(function(d){
        var pct = Math.round(d.count/maxCount*100);
        var color = d.count===0 ? '#e2e8f0' : (pct>70 ? '#4f46e5' : pct>30 ? '#818cf8' : '#c7d2fe');
        return '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">' +
            '<span style="font-size:11px;font-weight:700;color:#1e293b;">'+(d.count||'')+' </span>'+
            '<div style="width:100%;background:#f1f5f9;border-radius:4px;height:80px;display:flex;align-items:flex-end;">' +
            '<div style="width:100%;background:'+color+';border-radius:4px 4px 0 0;height:'+pct+'%;min-height:'+(d.count?4:0)+'px;"></div></div>'+
            '<span style="font-size:9px;color:#94a3b8;">'+d.label+'</span></div>';
    }).join('');

    var total = days.reduce(function(s,d){return s+d.count;},0);
    var avg = (total/14).toFixed(1);
    var best = Math.max.apply(null,days.map(function(d){return d.count;}));

    mkOverlay('v4-stats-modal',
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h2 style="margin:0;font-size:18px;font-weight:800;">📊 สถิติของ '+esc(username)+'</h2>' +
        '<button onclick="document.getElementById(\'v4-stats-modal\').remove()" style="background:#f1f5f9;border:none;border-radius:8px;width:32px;height:32px;font-size:16px;cursor:pointer;">✕</button></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px;">' +
        '<div style="background:#f0fdf4;border-radius:12px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:900;color:#15803d;">'+total+'</div><div style="font-size:11px;color:#64748b;">14 วัน</div></div>' +
        '<div style="background:#eff6ff;border-radius:12px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:900;color:#1d4ed8;">'+avg+'</div><div style="font-size:11px;color:#64748b;">เฉลี่ย/วัน</div></div>' +
        '<div style="background:#fdf4ff;border-radius:12px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:900;color:#7c3aed;">'+best+'</div><div style="font-size:11px;color:#64748b;">สูงสุด/วัน</div></div>' +
        '</div>' +
        '<div style="display:flex;gap:4px;align-items:flex-end;height:130px;">'+bars+'</div>' +
        '<p style="margin:12px 0 0;font-size:11px;color:#94a3b8;text-align:center;">14 วันย้อนหลัง · คำนวณจาก history</p>'
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   F-02  TEMPLATE MESSAGES (Admin)
═══════════════════════════════════════════════════════════════════════════ */
function v4_injectTemplateFAB() {
    removeEl('v4-template-fab');
    var container = document.getElementById('inp-new-loc-container');
    if (!container) return;

    var btn = document.createElement('button');
    btn.id = 'v4-template-fab';
    btn.onclick = v4_showTemplateModal;
    btn.style.cssText = 'margin-top:8px;width:100%;padding:8px 12px;background:#eff6ff;border:1.5px dashed #93c5fd;border-radius:10px;color:#1d4ed8;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;';
    btn.innerHTML = '💬 ข้อความ Preset';
    container.insertAdjacentElement('afterend', btn);
}

function v4_showTemplateModal() {
    var app = window.app;
    var tmpl = app.state.v4.templateMsgs;
    var defaults = ['TOPUP ด่วน','ปัญหาสินค้าเสียหาย','ฝากงานให้ทีม','รอ Supervisor ยืนยัน','ดำเนินการแล้ว'];

    var listHtml = '';
    var all = tmpl.length ? tmpl : defaults;
    all.forEach(function(msg, i){
        listHtml +=
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            '<button onclick="window.v4_applyTemplate(\''+escQ(msg)+'\')" style="flex:1;text-align:left;padding:10px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;color:#1e293b;" onmouseover="this.style.background=\'#eff6ff\'" onmouseout="this.style.background=\'#f8fafc\'">'+esc(msg)+'</button>'+
            '<button onclick="window.v4_deleteTemplate('+i+')" style="background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;padding:4px;">🗑</button>'+
            '</div>';
    });

    mkOverlay('v4-template-modal',
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h2 style="margin:0;font-size:17px;font-weight:800;">💬 ข้อความ Preset</h2>' +
        '<button onclick="document.getElementById(\'v4-template-modal\').remove()" style="background:#f1f5f9;border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;">✕</button></div>' +
        '<div id="v4-tmpl-list">'+listHtml+'</div>'+
        '<div style="border-top:1px solid #f1f5f9;margin-top:14px;padding-top:14px;">' +
        '<div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:8px;">+ เพิ่มข้อความใหม่</div>' +
        '<div style="display:flex;gap:8px;">' +
        '<input id="v4-tmpl-new" placeholder="พิมพ์ข้อความ..." style="flex:1;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;" onkeydown="if(event.key===\'Enter\')window.v4_addTemplate()">' +
        '<button onclick="window.v4_addTemplate()" style="padding:10px 18px;background:#1d4ed8;border:none;border-radius:10px;color:#fff;font-weight:700;cursor:pointer;">เพิ่ม</button>' +
        '</div></div>'
    );
}

window.v4_applyTemplate = function(msg) {
    var inp = document.getElementById('inp-new-loc');
    if (inp) { inp.value = msg; inp.focus(); }
    removeEl('v4-template-modal');
    if (window.app.toast) window.app.toast('💬 ใส่ข้อความแล้ว', 'success');
};
window.v4_addTemplate = function() {
    var app = window.app;
    var inp = document.getElementById('v4-tmpl-new');
    var val = inp && inp.value.trim();
    if (!val) return;
    if (!app.state.v4.templateMsgs.length) app.state.v4.templateMsgs = ['TOPUP ด่วน','ปัญหาสินค้าเสียหาย','ฝากงานให้ทีม','รอ Supervisor ยืนยัน','ดำเนินการแล้ว'];
    app.state.v4.templateMsgs.push(val);
    fbSet('v4_settings/templateMsgs', { list: app.state.v4.templateMsgs });
    removeEl('v4-template-modal');
    v4_showTemplateModal();
};
window.v4_deleteTemplate = function(idx) {
    var app = window.app;
    if (!app.state.v4.templateMsgs.length) app.state.v4.templateMsgs = ['TOPUP ด่วน','ปัญหาสินค้าเสียหาย','ฝากงานให้ทีม','รอ Supervisor ยืนยัน','ดำเนินการแล้ว'];
    app.state.v4.templateMsgs.splice(idx, 1);
    fbSet('v4_settings/templateMsgs', { list: app.state.v4.templateMsgs });
    removeEl('v4-template-modal');
    v4_showTemplateModal();
};

/* ═══════════════════════════════════════════════════════════════════════════
   F-03  ACCESS MATRIX (Master Admin)
═══════════════════════════════════════════════════════════════════════════ */
function v4_injectAccessMatrix() {
    var app = window.app;
    var container = document.getElementById('master-admin-content');
    if (!container) return;
    removeEl('v4-access-matrix-section');

    // แสดงเฉพาะแท็บ "พนักงาน" (สอดคล้องกับ Master Admin ใหม่)
    if (app._masterTab && app._masterTab !== 'users') return;

    var section = document.createElement('div');
    section.id = 'v4-access-matrix-section';
    section.style.cssText = 'background:#fff;border:0.5px solid #e2e8f0;border-radius:14px;margin-top:14px;overflow:hidden;';

    var users = app.state.data.users || [];
    var admins = app.state.data.admins || [];
    var supervisors = app.state.data.supervisors || [];
    var interns = (app.state.features && app.state.features.interns) || [];

    var features = [
        { key:'notewall',    label:'NoteWall',        icon:'📋', roles:['user','admin','supervisor'] },
        { key:'topup',       label:'เติมสินค้า',       icon:'📦', roles:['user'] },
        { key:'pending',     label:'รับเข้า',          icon:'📥', roles:['user'] },
        { key:'history',     label:'ประวัติ',          icon:'📋', roles:['user'] },
        { key:'move',        label:'ย้ายตำแหน่ง',      icon:'🚚', roles:['user'] },
        { key:'issues',      label:'แจ้งปัญหา',        icon:'⚠️', roles:['user'] },
        { key:'my_stats',    label:'My Stats',         icon:'📊', roles:['user','intern'] },
        { key:'monitor',     label:'Monitor',          icon:'📡', roles:['admin'] },
        { key:'reports',     label:'Reports',          icon:'📊', roles:['admin'] },
        { key:'template_msg',label:'Template Msgs',    icon:'💬', roles:['admin'] },
        { key:'live_ops',    label:'Live Ops Board',   icon:'🖥', roles:['supervisor'] },
        { key:'daily_target',label:'Daily Target',     icon:'🎯', roles:['supervisor'] },
        { key:'intern_diary',label:'Diary Viewer',     icon:'📒', roles:['supervisor'] },
        { key:'leaderboard', label:'Leaderboard',      icon:'🏆', roles:['supervisor'] },
        { key:'guided_task', label:'Guided Task',      icon:'🎓', roles:['intern'] }
    ];

    // รวมรายชื่อ + role
    var members = [];
    users.forEach(function(n){ members.push({ name:n, role:'user', color:'#3b82f6', bg:'#dbeafe' }); });
    admins.forEach(function(n){ if(!members.find(function(m){return m.name===n;})) members.push({ name:n, role:'admin', color:'#059669', bg:'#d1fae5' }); });
    supervisors.forEach(function(n){ if(!members.find(function(m){return m.name===n;})) members.push({ name:n, role:'supervisor', color:'#d97706', bg:'#fef3c7' }); });
    interns.forEach(function(n){ if(!members.find(function(m){return m.name===n;})) members.push({ name:n, role:'intern', color:'#7c3aed', bg:'#ede9fe' }); });

    if (members.length === 0) {
        section.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8;font-size:13px;">ยังไม่มีสมาชิก</div>';
        container.appendChild(section);
        return;
    }

    var saved = app.state.v4.accessMatrixSaved || {};
    var sel = app._matrixSelected || members[0].name;
    app._matrixSelected = sel;

    var roleLabel = { user:'พนักงาน', admin:'แอดมิน', supervisor:'หัวหน้า', intern:'น้องฝึกงาน' };
    var roleGroups = [
        { role:'user', label:'พนักงาน' }, { role:'admin', label:'แอดมิน' },
        { role:'supervisor', label:'หัวหน้า' }, { role:'intern', label:'น้องฝึกงาน' }
    ];

    // ===== LEFT: people list =====
    var leftHtml = '';
    roleGroups.forEach(function(g){
        var grp = members.filter(function(m){ return m.role === g.role; });
        if (grp.length === 0) return;
        leftHtml += '<div style="font-size:10px;color:#94a3b8;padding:8px 8px 4px;font-weight:700;">' + g.label + '</div>';
        grp.forEach(function(m){
            var active = m.name === sel;
            var initials = String(m.name||'').substring(0,2);
            leftHtml += '<div onclick="window.v4_selectMatrixPerson(\'' + escQ(m.name) + '\')" style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;cursor:pointer;margin-bottom:2px;' + (active?'background:#dbeafe;':'') + '">' +
                '<div style="width:26px;height:26px;border-radius:50%;background:' + m.bg + ';color:' + m.color + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;">' + esc(initials) + '</div>' +
                '<span style="font-size:12px;font-weight:' + (active?'700':'400') + ';color:' + (active?'#1d4ed8':'#64748b') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(m.name) + '</span></div>';
        });
    });

    // ===== RIGHT: toggles for selected person =====
    var selMember = members.find(function(m){ return m.name === sel; }) || members[0];
    var relevantFeatures = features.filter(function(f){ return f.roles.indexOf(selMember.role) >= 0; });
    var initials = String(selMember.name||'').substring(0,2);
    var rightHtml = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">' +
        '<div style="width:34px;height:34px;border-radius:50%;background:' + selMember.bg + ';color:' + selMember.color + ';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">' + esc(initials) + '</div>' +
        '<div style="flex:1;"><div style="font-size:14px;font-weight:700;color:#1e293b;">' + esc(selMember.name) + '</div><div style="font-size:11px;color:#94a3b8;">' + (roleLabel[selMember.role]||'') + ' · ฟีเจอร์ที่ใช้ได้</div></div>' +
        '<button onclick="window.v4_matrixAll(true)" style="background:#dbeafe;color:#1d4ed8;border:none;border-radius:7px;padding:5px 11px;font-size:11px;font-weight:700;cursor:pointer;">เปิดหมด</button>' +
        '<button onclick="window.v4_matrixAll(false)" style="background:#f1f5f9;color:#64748b;border:none;border-radius:7px;padding:5px 11px;font-size:11px;font-weight:700;cursor:pointer;">ปิดหมด</button>' +
        '</div>';
    rightHtml += '<div id="v4-matrix-toggles" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;">';
    relevantFeatures.forEach(function(f){
        var key = sel + '__' + f.key;
        var def = saved[key];
        var on = def === undefined ? true : def;
        rightHtml += '<div style="display:flex;align-items:center;gap:9px;padding:10px 12px;background:#f8fafc;border-radius:10px;">' +
            '<span style="font-size:16px;">' + f.icon + '</span><span style="flex:1;font-size:12px;font-weight:500;color:#1e293b;">' + esc(f.label) + '</span>' +
            '<button onclick="window.v4_matrixToggle(this,\'' + escQ(f.key) + '\')" data-key="' + esc(f.key) + '" data-on="' + (on?'1':'0') + '" class="v4-mtoggle" style="width:36px;height:21px;border-radius:11px;border:none;cursor:pointer;position:relative;flex-shrink:0;transition:background .15s;background:' + (on?'#1d4ed8':'#cbd5e1') + ';">' +
            '<span style="position:absolute;top:2px;' + (on?'right:2px':'left:2px') + ';width:17px;height:17px;border-radius:50%;background:#fff;transition:all .15s;"></span></button>' +
            '</div>';
    });
    rightHtml += '</div>';

    section.innerHTML =
        '<div style="padding:14px 16px;border-bottom:0.5px solid #e2e8f0;display:flex;align-items:center;gap:8px;">' +
            '<i class="ph ph-shield-checkered" style="color:#534AB7;"></i>' +
            '<div style="flex:1;"><div style="font-size:14px;font-weight:700;color:#1e293b;">สิทธิ์ฟีเจอร์ (Access)</div><div style="font-size:11px;color:#94a3b8;">เลือกคน แล้วเปิด/ปิดฟีเจอร์ที่ใช้ได้</div></div>' +
            '<button onclick="window.v4_saveMatrix()" style="background:#059669;color:#fff;border:none;border-radius:9px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;">บันทึก</button>' +
        '</div>' +
        '<div style="display:flex;min-height:300px;">' +
            '<div style="width:160px;background:#f8fafc;border-right:0.5px solid #e2e8f0;padding:8px;flex-shrink:0;overflow-y:auto;max-height:420px;">' + leftHtml + '</div>' +
            '<div style="flex:1;padding:16px;overflow-y:auto;max-height:420px;">' + rightHtml + '</div>' +
        '</div>';

    container.appendChild(section);
}

window.v4_selectMatrixPerson = function(name) {
    window.app._matrixSelected = name;
    v4_injectAccessMatrix();
};
window.v4_matrixToggle = function(btn, fkey) {
    var on = btn.getAttribute('data-on') === '1';
    on = !on;
    btn.setAttribute('data-on', on ? '1' : '0');
    btn.style.background = on ? '#1d4ed8' : '#cbd5e1';
    var knob = btn.querySelector('span');
    if (knob) { knob.style.left = on ? 'auto' : '2px'; knob.style.right = on ? '2px' : 'auto'; }
    var app = window.app;
    if (!app.state.v4.accessMatrixSaved) app.state.v4.accessMatrixSaved = {};
    app.state.v4.accessMatrixSaved[app._matrixSelected + '__' + fkey] = on;
};
window.v4_matrixAll = function(val) {
    var app = window.app;
    if (!app.state.v4.accessMatrixSaved) app.state.v4.accessMatrixSaved = {};
    document.querySelectorAll('#v4-matrix-toggles .v4-mtoggle').forEach(function(btn){
        btn.setAttribute('data-on', val ? '1' : '0');
        btn.style.background = val ? '#1d4ed8' : '#cbd5e1';
        var knob = btn.querySelector('span');
        if (knob) { knob.style.left = val ? 'auto' : '2px'; knob.style.right = val ? '2px' : 'auto'; }
        app.state.v4.accessMatrixSaved[app._matrixSelected + '__' + btn.getAttribute('data-key')] = val;
    });
};

window.v4_toggleMatrix = function(name, feature, val) {
    var app = window.app;
    if (!app.state.v4.accessMatrixSaved) app.state.v4.accessMatrixSaved = {};
    app.state.v4.accessMatrixSaved[name+'__'+feature] = val;
};
window.v4_saveMatrix = function() {
    var app = window.app;
    fbSet('v4_settings/accessMatrix', { data: app.state.v4.accessMatrixSaved, savedAt: Date.now() });
    if (app.toast) app.toast('บันทึกสิทธิ์ฟีเจอร์แล้ว', 'success');
};

/* ═══════════════════════════════════════════════════════════════════════════
   F-04  LIVE OPS BOARD (Supervisor)
═══════════════════════════════════════════════════════════════════════════ */
function v4_injectLiveOpsBoard() {
    removeEl('v4-live-ops-section');
    var dash = document.getElementById('sup-view-dashboard');
    if (!dash) return;

    var section = document.createElement('div');
    section.id = 'v4-live-ops-section';
    section.style.cssText = 'background:#0f172a;border-radius:16px;padding:20px;margin-top:20px;';

    var header =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
        '<div><h3 style="margin:0;font-size:16px;font-weight:800;color:#f1f5f9;">📡 Live Ops Board</h3>' +
        '<p style="margin:2px 0 0;font-size:11px;color:#475569;" id="v4-lops-updated">อัปเดตอัตโนมัติ</p></div>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;animation:v4pulse 1.5s infinite;"></span>' +
        '<span style="font-size:11px;color:#22c55e;font-weight:700;">LIVE</span>' +
        '<button onclick="window.v4_refreshLiveOps()" style="padding:4px 10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#94a3b8;font-size:11px;cursor:pointer;">↻ refresh</button>' +
        '</div></div>';

    section.innerHTML = header + '<div id="v4-lops-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;"></div>';
    dash.appendChild(section);

    /* add pulse keyframe once */
    if (!document.getElementById('v4-pulse-style')) {
        var st = document.createElement('style');
        st.id = 'v4-pulse-style';
        st.textContent = '@keyframes v4pulse{0%,100%{opacity:1}50%{opacity:0.3}}';
        document.head.appendChild(st);
    }

    v4_refreshLiveOps();

    /* auto-refresh every 30s */
    if (window.app.state.v4.liveOpsInterval) clearInterval(window.app.state.v4.liveOpsInterval);
    window.app.state.v4.liveOpsInterval = setInterval(function(){
        var lops = document.getElementById('v4-lops-grid');
        if (!lops) { clearInterval(window.app.state.v4.liveOpsInterval); return; }
        v4_refreshLiveOps();
    }, 30000);
}

window.v4_refreshLiveOps = function() {
    var app = window.app;
    var grid = document.getElementById('v4-lops-grid');
    if (!grid) return;

    var users = app.state.data.users || [];
    var items = app.state.data.items || [];
    var jobs  = app.state.data.replenishmentJobs || [];
    var STATUS = { OPEN:'Open', WAITING_ADMIN:'Waiting Admin', WRITTEN:'Written', DONE:'Done', IN_PROGRESS:'In Progress' };

    var now = Date.now();
    var cards = '';

    users.forEach(function(u){
        /* find current job (last modified by this user in last 4 hours) */
        var myItems = items.filter(function(i){ return i.writtenBy===u || i.assignedTo===u; })
            .sort(function(a,b){ return (b.lastModified||0)-(a.lastModified||0); });
        var active = myItems.find(function(i){ return i.status===STATUS.OPEN||i.status===STATUS.WAITING_ADMIN; });
        var pending = myItems.filter(function(i){ return i.status===STATUS.OPEN||i.status===STATUS.WAITING_ADMIN; }).length;
        var done    = myItems.filter(function(i){ return i.status===STATUS.DONE||i.status===STATUS.WRITTEN; }).length;

        var stateColor = active ? '#f59e0b' : (done>0 ? '#22c55e' : '#475569');
        var stateLabel = active ? '🟡 มีงานค้าง' : (done>0 ? '🟢 ทำงานอยู่' : '⚫ ว่าง');
        var jobText = active ? esc(active.code||active.name||'Job').substring(0,12) : '—';

        cards +=
            '<div style="background:#1e293b;border-radius:12px;padding:12px;border:1px solid rgba(255,255,255,0.06);">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
            '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#4f46e5,#7c3aed);display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;font-size:14px;">' +
            esc(u.charAt(0).toUpperCase())+'</div>' +
            '<div><div style="font-size:13px;font-weight:700;color:#f1f5f9;">'+esc(u)+'</div>' +
            '<div style="font-size:10px;color:'+stateColor+';font-weight:700;">'+stateLabel+'</div></div></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:10px;">' +
            '<div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:5px;text-align:center;"><div style="font-size:14px;font-weight:900;color:#fbbf24;">'+pending+'</div><div style="color:#64748b;">ค้าง</div></div>' +
            '<div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:5px;text-align:center;"><div style="font-size:14px;font-weight:900;color:#34d399;">'+done+'</div><div style="color:#64748b;">เสร็จ</div></div>' +
            '</div>' +
            (active ? '<div style="margin-top:8px;background:rgba(245,158,11,0.1);border-radius:6px;padding:5px 8px;font-size:10px;color:#fbbf24;font-weight:700;">⚙️ '+jobText+'</div>' : '') +
            '</div>';
    });

    if (!cards) cards = '<div style="color:#475569;font-size:13px;padding:12px;">ยังไม่มีพนักงานในระบบ</div>';
    grid.innerHTML = cards;

    var upd = document.getElementById('v4-lops-updated');
    if (upd) upd.textContent = 'อัปเดต: '+new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
};

/* ═══════════════════════════════════════════════════════════════════════════
   F-05  DAILY TARGET (Supervisor)
═══════════════════════════════════════════════════════════════════════════ */
function v4_injectDailyTarget() {
    removeEl('v4-daily-target-section');
    var dash = document.getElementById('sup-view-dashboard');
    if (!dash) return;

    var app = window.app;
    var today = todayStr();
    var saved = app.state.v4.dailyTarget || {};
    var target = saved[today] || 0;

    var items  = app.state.data.items || [];
    var done   = items.filter(function(i){ return (i.status==='Done'||i.status==='Written') && i.date===today; }).length;
    var pct    = target > 0 ? Math.min(100, Math.round(done/target*100)) : 0;
    var barCol = pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';

    var section = document.createElement('div');
    section.id = 'v4-daily-target-section';
    section.style.cssText = 'background:#fff;border-radius:16px;padding:18px 20px;margin-top:16px;border:2px solid #e0e7ff;';

    section.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div><h3 style="margin:0;font-size:15px;font-weight:800;color:#1e293b;">🎯 Daily Target</h3>' +
        '<p style="margin:2px 0 0;font-size:11px;color:#64748b;">'+esc(today)+'</p></div>' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
        '<input id="v4-target-input" type="number" min="1" max="999" value="'+(target||'')+'" placeholder="เป้า" style="width:64px;padding:6px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:700;text-align:center;">' +
        '<button onclick="window.v4_saveTarget()" style="padding:6px 14px;background:#4f46e5;border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">ตั้ง</button>' +
        '</div></div>' +
        '<div style="background:#f8fafc;border-radius:10px;overflow:hidden;height:24px;position:relative;margin-bottom:8px;">' +
        '<div style="height:100%;background:'+barCol+';width:'+pct+'%;transition:width 0.5s;border-radius:10px;"></div>' +
        '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#1e293b;">'+done+' / '+(target||'—')+' ('+pct+'%)</div>' +
        '</div>' +
        (target>0 && done>=target ? '<div style="text-align:center;font-size:13px;font-weight:700;color:#15803d;background:#dcfce7;padding:6px;border-radius:8px;">🏆 ถึงเป้าวันนี้แล้ว! ยอดเยี่ยม!</div>' : '') +
        (target>0 && done<target ? '<div style="text-align:center;font-size:12px;color:#64748b;">เหลืออีก <strong style="color:#ef4444;">'+(target-done)+'</strong> งานจะถึงเป้า</div>' : '');

    /* insert before live ops */
    var lops = document.getElementById('v4-live-ops-section');
    if (lops) dash.insertBefore(section, lops);
    else dash.appendChild(section);
}

window.v4_saveTarget = function() {
    var app = window.app;
    var inp = document.getElementById('v4-target-input');
    var val = inp && parseInt(inp.value);
    if (!val || val < 1) { if(app.toast) app.toast('กรุณาใส่ตัวเลขเป้าหมาย','error'); return; }
    var today = todayStr();
    if (!app.state.v4.dailyTarget) app.state.v4.dailyTarget = {};
    app.state.v4.dailyTarget[today] = val;
    fbSet('v4_settings/dailyTarget', app.state.v4.dailyTarget);
    if(app.toast) app.toast('🎯 ตั้งเป้า '+val+' งานแล้ว','success');
    v4_injectDailyTarget();
};

/* ═══════════════════════════════════════════════════════════════════════════
   F-06  GUIDED TASK MODE (Intern)
═══════════════════════════════════════════════════════════════════════════ */
var GUIDED_STEPS = [
    { icon:'📋', title:'รับงาน', desc:'รับงานจาก tab "รับเข้า" กดปุ่มรับและตรวจสอบข้อมูลให้ครบ' },
    { icon:'📍', title:'ตรวจสอบ Location', desc:'ตรวจสอบ Location ที่ระบุ ถ้าไม่มีให้แจ้ง Admin ทันที' },
    { icon:'📦', title:'จัดสินค้า', desc:'นำสินค้าไปวางตาม Location ที่กำหนด ระวังอย่าวางผิดที่' },
    { icon:'✅', title:'ยืนยันเสร็จสิ้น', desc:'กดยืนยันเมื่อวางสินค้าครบแล้ว เพื่ออัปเดตสถานะ' },
    { icon:'📝', title:'บันทึกไดอารี่', desc:'เขียนบันทึกประจำวันสิ่งที่เรียนรู้วันนี้ใน Dashboard น้อง' }
];

function v4_injectGuidedTaskBtn(username) {
    // 🎓 ปุ่ม Guided Task Mode (ม่วง) — ซากระบบฝึกงานเก่า ลบทิ้งแล้ว
    //    กันปุ่มม่วงลอยทับ QuickHub
    removeEl('v4-guided-btn');
    return;
}

window.v4_showGuidedTask = function(username) {
    var stepHtml = GUIDED_STEPS.map(function(s, i){
        return '<div style="display:flex;gap:14px;padding:12px 0;border-bottom:1px solid #f1f5f9;">' +
            '<div style="width:40px;height:40px;background:#ede9fe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">'+s.icon+'</div>' +
            '<div><div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:2px;">'+esc((i+1)+'. '+s.title)+'</div>' +
            '<div style="font-size:12px;color:#64748b;line-height:1.5;">'+esc(s.desc)+'</div></div></div>';
    }).join('');

    mkOverlay('v4-guided-modal',
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<h2 style="margin:0;font-size:17px;font-weight:800;color:#4f46e5;">🎓 Guided Task Mode</h2>' +
        '<button onclick="document.getElementById(\'v4-guided-modal\').remove()" style="background:#f1f5f9;border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;">✕</button></div>' +
        '<p style="margin:0 0 14px;font-size:12px;color:#64748b;">สวัสดี <strong>'+esc(username)+'</strong>! ทำตามขั้นตอนด้านล่าง</p>' +
        '<div>'+stepHtml+'</div>' +
        '<button onclick="document.getElementById(\'v4-guided-modal\').remove()" style="margin-top:16px;width:100%;padding:12px;background:#4f46e5;border:none;border-radius:12px;color:#fff;font-weight:700;cursor:pointer;">เข้าใจแล้ว เริ่มทำงาน! 💪</button>'
    );
};

/* Supervisor toggle for Guided Task Mode */
window.v4_toggleGuidedTask = function() {
    var app = window.app;
    app.state.v4.guidedTaskEnabled = !app.state.v4.guidedTaskEnabled;
    fbSet('v4_settings/guidedTask', { enabled: app.state.v4.guidedTaskEnabled });
    if(app.toast) app.toast('🎓 Guided Task Mode: '+(app.state.v4.guidedTaskEnabled?'เปิด':'ปิด'), 'info');
    v4_injectDiaryLeaderboardButtons();
};

/* ═══════════════════════════════════════════════════════════════════════════
   F-07  INTERN LEADERBOARD + F-08  DAILY DIARY VIEWER + Guided toggle button
═══════════════════════════════════════════════════════════════════════════ */
function v4_injectDiaryLeaderboardButtons() {
    removeEl('v4-sup-toolbar');
    var dash = document.getElementById('sup-view-dashboard');
    if (!dash) return;

    var app = window.app;
    var guidedOn = app.state.v4.guidedTaskEnabled;

    var toolbar = document.createElement('div');
    toolbar.id = 'v4-sup-toolbar';
    toolbar.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;';
    toolbar.innerHTML =
        '<button onclick="window.v4_showInternLeaderboard()" style="padding:9px 16px;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;border-radius:12px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(245,158,11,0.35);">🏆 Intern Leaderboard</button>' +
        '<button onclick="window.v4_showDiaryViewer()" style="padding:9px 16px;background:linear-gradient(135deg,#4f46e5,#7c3aed);border:none;border-radius:12px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(79,70,229,0.35);">📒 Diary น้อง</button>' +
        '<button onclick="window.v4_toggleGuidedTask()" style="padding:9px 16px;background:'+(guidedOn?'#dcfce7':'#f8fafc')+';border:1.5px solid '+(guidedOn?'#22c55e':'#e2e8f0')+';border-radius:12px;color:'+(guidedOn?'#15803d':'#64748b')+';font-size:13px;font-weight:700;cursor:pointer;">🎓 Guided Task: '+(guidedOn?'เปิด':'ปิด')+'</button>';

    var lops = document.getElementById('v4-live-ops-section');
    if (lops) dash.insertBefore(toolbar, lops);
    else dash.appendChild(toolbar);
}

/* ── Intern Leaderboard ─────────────────────────────────────────────────── */
window.v4_showInternLeaderboard = function() {
    var app = window.app;
    var interns = (app.state.features && app.state.features.interns) || [];
    if (!interns.length) { if(app.toast) app.toast('ยังไม่มีน้องฝึกงาน','error'); return; }

    /* try to access attendance data via intern-system exposed method */
    var att = {};
    try { att = window._internGetAttendance ? window._internGetAttendance() : {}; } catch(e) {}

    var ranked = interns.map(function(intern){
        var nick = intern.nickname || intern.name;
        var days = Object.keys(att[nick] || {}).length;
        var totalActs = Object.values(att[nick]||{}).reduce(function(a,d){return a+(d.actionsCount||0);},0);
        var rating = intern.rating || 0;
        var score = days*10 + totalActs*2 + rating*5;
        return { nick: nick, days: days, acts: totalActs, rating: rating, score: score,
                 startDate: intern.startDate, endDate: intern.endDate };
    }).sort(function(a,b){ return b.score-a.score; });

    var medals = ['🥇','🥈','🥉'];
    var rows = ranked.map(function(r, i){
        var stars = '';
        for(var s=1;s<=5;s++) stars += s<=r.rating?'⭐':'☆';
        var isTop3 = i<3;
        return '<tr style="border-bottom:1px solid #f1f5f9;background:'+(isTop3?'#fefce8':'#fff')+'">' +
            '<td style="padding:10px 8px;font-size:16px;text-align:center;">'+(medals[i]||'#'+(i+1))+'</td>' +
            '<td style="padding:10px 8px;font-weight:700;color:#1e293b;">'+esc(r.nick)+'</td>' +
            '<td style="padding:10px 8px;text-align:center;color:#3b82f6;font-weight:700;">'+r.days+'</td>' +
            '<td style="padding:10px 8px;text-align:center;color:#7c3aed;font-weight:700;">'+r.acts+'</td>' +
            '<td style="padding:10px 8px;font-size:11px;">'+stars+'</td>' +
            '<td style="padding:10px 8px;text-align:center;font-weight:900;color:#f59e0b;">'+r.score+'</td>' +
            '</tr>';
    }).join('');

    mkOverlay('v4-leaderboard-modal',
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h2 style="margin:0;font-size:18px;font-weight:800;">🏆 Intern Leaderboard</h2>' +
        '<button onclick="document.getElementById(\'v4-leaderboard-modal\').remove()" style="background:#f1f5f9;border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;">✕</button></div>' +
        '<table style="width:100%;border-collapse:collapse;">' +
        '<thead><tr style="background:#f8fafc;"><th style="padding:8px;font-size:11px;color:#64748b;">อันดับ</th><th style="padding:8px;font-size:11px;color:#64748b;text-align:left;">ชื่อ</th><th style="padding:8px;font-size:11px;color:#64748b;">วันมา</th><th style="padding:8px;font-size:11px;color:#64748b;">งาน</th><th style="padding:8px;font-size:11px;color:#64748b;">ดาว</th><th style="padding:8px;font-size:11px;color:#64748b;">คะแนน</th></tr></thead>' +
        '<tbody>'+rows+'</tbody></table>' +
        '<p style="margin:12px 0 0;font-size:11px;color:#94a3b8;text-align:center;">คะแนน = วันมา×10 + งาน×2 + ดาว×5</p>'
    );
};

/* ── Daily Diary Viewer ─────────────────────────────────────────────────── */
window.v4_showDiaryViewer = function() {
    var app = window.app;
    var interns = (app.state.features && app.state.features.interns) || [];
    if (!interns.length) { if(app.toast) app.toast('ยังไม่มีน้องฝึกงาน','error'); return; }

    var listHtml = interns.map(function(i){
        var nick = i.nickname||i.name;
        return '<button onclick="window.v4_showDiaryOf(\''+escQ(nick)+'\')" style="width:100%;text-align:left;padding:10px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;margin-bottom:6px;cursor:pointer;font-size:13px;font-weight:700;color:#1e293b;" onmouseover="this.style.background=\'#eff6ff\'" onmouseout="this.style.background=\'#f8fafc\'">📒 '+esc(nick)+'</button>';
    }).join('');

    mkOverlay('v4-diary-modal',
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h2 style="margin:0;font-size:17px;font-weight:800;">📒 Diary น้องฝึกงาน</h2>' +
        '<button onclick="document.getElementById(\'v4-diary-modal\').remove()" style="background:#f1f5f9;border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;">✕</button></div>' +
        '<p style="margin:0 0 12px;font-size:12px;color:#64748b;">เลือกน้องที่ต้องการดู diary</p>'+listHtml
    );
};

window.v4_showDiaryOf = function(nickname) {
    /* read from Firebase daily_logs */
    removeEl('v4-diary-detail-modal');
    var app = window.app;

    var render = function(logs){
        var entries = logs[nickname] || {};
        var dates = Object.keys(entries).sort().reverse().slice(0,14);
        if (!dates.length) {
            mkOverlay('v4-diary-detail-modal',
                '<h2 style="margin:0 0 12px;font-size:17px;font-weight:800;">📒 '+esc(nickname)+'</h2>' +
                '<div style="text-align:center;padding:32px;color:#94a3b8;font-size:14px;">ยังไม่มีบันทึก</div>' +
                '<button onclick="document.getElementById(\'v4-diary-detail-modal\').remove()" style="width:100%;padding:10px;background:#f1f5f9;border:none;border-radius:10px;cursor:pointer;">ปิด</button>');
            return;
        }
        var entriesHtml = dates.map(function(d){
            var entry = entries[d] || {};
            var note = entry.note || '';
            var tasks = entry.tasks || [];
            return '<div style="margin-bottom:16px;">' +
                '<div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:6px;">📅 '+esc(d)+'</div>' +
                (note ? '<div style="background:#fefce8;border-left:3px solid #f59e0b;padding:10px 12px;border-radius:6px;font-size:13px;color:#1e293b;line-height:1.6;margin-bottom:8px;">'+esc(note)+'</div>' : '') +
                (tasks.length ? '<div style="font-size:11px;color:#64748b;font-weight:700;margin-bottom:4px;">งานวันนั้น:</div>'+
                    tasks.map(function(t){ return '<div style="font-size:12px;padding:4px 8px;background:#f8fafc;border-radius:6px;margin-bottom:2px;color:#475569;">• '+esc(t.text||t)+'</div>'; }).join('') : '') +
                '</div>';
        }).join('');

        mkOverlay('v4-diary-detail-modal',
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
            '<h2 style="margin:0;font-size:17px;font-weight:800;">📒 Diary: '+esc(nickname)+'</h2>' +
            '<button onclick="document.getElementById(\'v4-diary-detail-modal\').remove()" style="background:#f1f5f9;border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;">✕</button></div>' +
            '<div style="max-height:60vh;overflow-y:auto;padding-right:4px;">'+entriesHtml+'</div>'
        );
    };

    /* Try Firebase first */
    try {
        if (window.db) {
            window.db.collection('intern_data').doc('daily_logs').get().then(function(snap){
                var data = snap.exists ? (snap.data().data || {}) : {};
                render(data);
            }).catch(function(){ render({}); });
        } else render({});
    } catch(e){ render({}); }
};

/* ═══════════════════════════════════════════════════════════════════════════
   F-09  NOTEWALL v2 — Role-based permissions
═══════════════════════════════════════════════════════════════════════════ */

/* ── NEW NOTE FORM with role restrictions ──────────────────────────────── */
function v4_nwShowNewNote(cid) {
    var app = window.app;
    var self = app;
    var role = getRole();
    var cu = currentUser();

    var allTypes = {
        task:    { label:'งาน TOPUP',      color:'#f59e0b', icon:'📦' },
        issue:   { label:'แจ้งปัญหา',       color:'#ef4444', icon:'🚨' },
        info:    { label:'แจ้งให้ทราบ',     color:'#3b82f6', icon:'📢' },
        request: { label:'ขอความช่วยเหลือ', color:'#8b5cf6', icon:'🙏' },
        broadcast:{ label:'ประกาศ Shift',   color:'#0ea5e9', icon:'📣' },
        mustread: { label:'บังคับอ่าน',     color:'#dc2626', icon:'🚨' }
    };

    /* Allowed types per role */
    var perms = app.state.v4.nwTypePerms || {};
    var allowedKeys;
    if (role === 'master' || role === 'admin') {
        allowedKeys = ['task','issue','info','request'];
    } else if (role === 'supervisor') {
        allowedKeys = ['task','issue','info','request','broadcast','mustread'];
    } else if (role === 'intern') {
        allowedKeys = perms.intern || ['task','request'];
    } else {
        allowedKeys = perms.user || ['task','issue','info','request'];
    }

    var typeConfig = {};
    allowedKeys.forEach(function(k){ if(allTypes[k]) typeConfig[k]=allTypes[k]; });

    /* Build user list for @mention */
    var userList = (app.state.data.users||[]).map(function(u){ return typeof u==='string'?u:(u.name||''); }).filter(Boolean);
    var adminList = (app.state.data.admins||[]).map(function(a){ return typeof a==='string'?a:(a.name||''); }).filter(Boolean);
    var allUsers = userList.concat(adminList).filter(function(u,i,a){ return a.indexOf(u)===i; });

    /* intern must mention — supervisor too */
    var mentionRequired = role === 'intern' || role === 'supervisor';

    /* Quick templates (user+admin) */
    var quickTemplates = role==='user'||role==='admin' ? ['TOPUP ด่วน','ปัญหาสินค้า','ฝากงาน'] : [];

    removeEl('nw-new-note-modal');
    var html = '<div id="nw-new-note-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fffde7;border-radius:4px;padding:24px;max-width:440px;width:100%;box-shadow:8px 12px 40px rgba(0,0,0,0.4);position:relative;max-height:90vh;overflow-y:auto;">';

    /* tape */
    html += '<div style="position:absolute;top:-8px;left:42%;width:60px;height:20px;background:rgba(200,190,140,0.55);border-radius:2px;transform:rotate(-4deg);"></div>';

    /* intern badge */
    if (role === 'intern') html += '<div style="display:inline-block;background:#312e81;color:#a5b4fc;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;margin-bottom:8px;">🎓 ฝึกงาน</div>';

    html += '<h3 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#1e293b;">📝 แปะโน้ตใหม่</h3>';
    html += '<p style="margin:0 0 12px;font-size:12px;color:#64748b;">✏️ โดย <strong>'+app._escHtml(cu)+'</strong></p>';

    /* type selector */
    html += '<div style="display:flex;gap:5px;margin-bottom:12px;flex-wrap:wrap;" id="nw-type-selector">';
    var firstKey = Object.keys(typeConfig)[0];
    Object.keys(typeConfig).forEach(function(k,i){
        var t = typeConfig[k];
        var sel = i===0;
        html += '<button onclick="window.app._nwSelectType(this,\''+k+'\')" data-type="'+k+'" style="padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;background:'+(sel?t.color:'#f1f5f9')+';color:'+(sel?'#fff':'#475569')+';border:1.5px solid '+(sel?t.color:'#e2e8f0')+';cursor:pointer;">'+t.icon+' '+t.label+'</button>';
    });
    html += '</div>';

    /* quick templates for user/admin */
    if (quickTemplates.length) {
        html += '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">';
        quickTemplates.forEach(function(t){
            html += '<button onclick="document.getElementById(\'nw-new-text\').value=\''+escQ(t)+'\'" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;background:#e0f2fe;color:#0369a1;border:none;cursor:pointer;">'+esc(t)+'</button>';
        });
        html += '</div>';
    }

    /* textarea */
    html += '<textarea id="nw-new-text" placeholder="เขียนอะไรก็ได้..." style="width:100%;padding:12px;border-radius:8px;border:2px solid #e2e8f0;font-size:15px;min-height:80px;font-family:Caveat,cursive;box-sizing:border-box;resize:vertical;line-height:1.5;"></textarea>';

    /* @mention */
    html += '<label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-top:10px;margin-bottom:4px;">'+
        (mentionRequired ? '🎯 ถึง (ผู้รับ) — <span style="color:#ef4444;">บังคับ</span>' : '🎯 ถึง (ผู้รับ) — ไม่บังคับ')+
        '</label>';
    html += '<select id="nw-target-user" style="width:100%;padding:8px 12px;border-radius:8px;border:2px solid '+(mentionRequired?'#fca5a5':'#e2e8f0')+';font-size:14px;box-sizing:border-box;background:#fff;color:#334155;">';
    if (!mentionRequired) html += '<option value="">— ทุกคน (ไม่ระบุ) —</option>';
    else html += '<option value="">— เลือกผู้รับ —</option>';
    allUsers.forEach(function(u){ html += '<option value="'+app._escHtml(u)+'">'+app._escHtml(u)+'</option>'; });
    html += '</select>';

    /* supervisor extras: escalate after / must-read confirm */
    if (role === 'supervisor') {
        html += '<label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-top:10px;margin-bottom:4px;">⏰ Escalate ถ้าค้างเกิน (ชั่วโมง)</label>';
        html += '<input id="nw-escalate-hr" type="number" min="1" max="48" placeholder="เช่น 2" style="width:100%;padding:8px 12px;border-radius:8px;border:2px solid #e2e8f0;font-size:14px;box-sizing:border-box;">';
    }

    /* admin: due time */
    if (role === 'admin' || role === 'master') {
        html += '<label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-top:10px;margin-bottom:4px;">⏳ Due Time (ไม่บังคับ)</label>';
        html += '<input id="nw-due-time" type="datetime-local" style="width:100%;padding:8px 12px;border-radius:8px;border:2px solid #e2e8f0;font-size:14px;box-sizing:border-box;">';
    }

    /* intern: 2-min notice */
    if (role === 'intern') {
        html += '<p style="margin:10px 0 0;font-size:11px;color:#64748b;background:#f0f9ff;padding:8px;border-radius:8px;">ℹ️ น้องฝึกงานลบได้ภายใน 2 นาที · Supervisor จะได้รับแจ้งเตือนอัตโนมัติ</p>';
    }

    /* buttons */
    html += '<div style="display:flex;gap:8px;margin-top:14px;">';
    html += '<button onclick="document.getElementById(\'nw-new-note-modal\').remove()" style="flex:1;padding:12px;border-radius:10px;border:2px solid #e2e8f0;background:#fff;font-size:14px;font-weight:700;cursor:pointer;color:#64748b;">ยกเลิก</button>';
    html += '<button onclick="window.v4_nwAddNote(\''+escQ(cid)+'\',\''+escQ(role)+'\')" style="flex:1;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">📌 แปะเลย!</button>';
    html += '</div></div></div>';

    document.body.insertAdjacentHTML('beforeend', html);
    setTimeout(function(){ var ta=document.getElementById('nw-new-text'); if(ta) ta.focus(); }, 100);

    /* set default type */
    app._nwSelectedType = firstKey || 'task';
}

window.v4_nwAddNote = function(cid, role) {
    var app = window.app;
    var text = (document.getElementById('nw-new-text')||{}).value;
    if (!text || !text.trim()) { app.toast && app.toast('กรุณาเขียนเนื้อหาโน้ต','error'); return; }

    var mentionRequired = role==='intern'||role==='supervisor';
    var targetUserEl = document.getElementById('nw-target-user');
    var targetUser = targetUserEl ? (targetUserEl.value||null) : null;
    if (mentionRequired && !targetUser) { app.toast && app.toast('กรุณาระบุผู้รับ (@mention)','error'); return; }

    var escalateEl = document.getElementById('nw-escalate-hr');
    var escalateHr = escalateEl ? (parseInt(escalateEl.value)||0) : 0;

    var dueEl = document.getElementById('nw-due-time');
    var dueTime = dueEl ? (dueEl.value||null) : null;

    var nwType = app._nwSelectedType || 'task';
    var isBroadcast = nwType === 'broadcast';
    var isMustRead  = nwType === 'mustread';
    var allUsers = (app.state.data.users||[]).map(function(u){ return typeof u==='string'?u:(u.name||''); }).filter(Boolean);

    var nw = app.state.noteWall;
    if (!nw) { app.state.noteWall = {notes:[],viewDate:app._todayStr(),filterType:'all',filterStatus:'all'}; nw=app.state.noteWall; }
    var maxId = 0;
    (nw.notes||[]).forEach(function(n){ if(n.id>maxId) maxId=n.id; });

    var newNote = {
        id: maxId+1,
        type: (isBroadcast||isMustRead) ? (isMustRead?'info':'info') : nwType,
        subType: nwType,
        text: text.trim(),
        status: 'open',
        createdBy: currentUser(),
        createdByRole: role,
        targetUser: isBroadcast ? null : targetUser,
        createdAt: Date.now(),
        claimedBy: null,
        date: app._todayStr(),
        pinned: isBroadcast || isMustRead,
        ci: (maxId+1)%8,
        rot: (Math.random()-0.5)*8,
        ti: (maxId+1)%5,
        isBroadcast: isBroadcast,
        isMustRead: isMustRead,
        mustReadConfirmed: {},
        mustReadUsers: isMustRead ? allUsers : [],
        escalateAfter: escalateHr>0 ? escalateHr : null,
        dueTime: dueTime,
        reactions: { thumbsUp:[], warning:[] },
        isInternNote: role==='intern',
        history: [{ action:'created', by: currentUser(), time: new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}) }]
    };

    try {
        if (window.db) window.db.collection('noteWall').doc(String(newNote.id)).set(newNote).catch(function(){});
    } catch(e){}

    removeEl('nw-new-note-modal');
    app._nwSelectedType = 'task';

    var msg = isBroadcast ? '📣 Broadcast แปะแล้ว ทุกคนเห็น!' :
              isMustRead  ? '🚨 บังคับอ่าน — ทุกคนต้องกดรับทราบ' :
              targetUser  ? ('📌 แปะถึง '+targetUser+' เรียบร้อย!') : '📌 แปะโน้ตสำเร็จ!';
    if (app.toast) app.toast(msg,'success');

    /* escalate checker */
    if (escalateHr > 0) {
        setTimeout(function(){
            var note = (app.state.noteWall && app.state.noteWall.notes||[]).find(function(n){return n.id===newNote.id;});
            if (note && note.status !== 'done') {
                if(app.toast) app.toast('🔴 ESCALATE: โน้ต #'+newNote.id+' ค้างเกิน '+escalateHr+' ชม.','error');
            }
        }, escalateHr*3600*1000);
    }
};

/* ── DELETE with role rules ─────────────────────────────────────────────── */
function v4_nwDeleteNote(id, cid) {
    var app = window.app;
    var note = (app.state.noteWall && app.state.noteWall.notes||[]).find(function(n){ return n.id===id; });
    if (!note) return;
    var role = getRole();
    var cu   = currentUser();
    var now  = Date.now();

    /* permission check */
    var gracePeriod = role==='intern' ? 2*60*1000 : 5*60*1000;
    var isOwner     = note.createdBy === cu;
    var withinGrace = note.createdAt && (now - note.createdAt) < gracePeriod;
    var canDelete   = isAdmin() || isMaster() || (isOwner && withinGrace);

    if (!canDelete) {
        if (app.toast) app.toast('⛔ ลบไม่ได้ — '+(isOwner?'เกิน '+(role==='intern'?2:5)+' นาทีแล้ว':'ไม่ใช่เจ้าของ'),'error');
        return;
    }

    /* intern must confirm */
    if (role === 'intern') {
        if (!confirm('ยืนยันลบโน้ตของคุณ?')) return;
        _doDeleteNote(note, cid, cu, '');
        return;
    }

    /* admin: reason required */
    if (isAdmin() || isMaster()) {
        var reason = prompt('ระบุเหตุผลการลบ (admin log):') || '';
        _doDeleteNote(note, cid, cu, reason);
        return;
    }

    /* regular owner delete */
    _doDeleteNote(note, cid, cu, '');
}

function _doDeleteNote(note, cid, deleter, reason) {
    var app = window.app;
    note.deleted = true;
    note.deletedBy = deleter;
    note.deletedAt = Date.now();
    note.deleteReason = reason;

    try {
        if(window.db) window.db.collection('noteWall').doc(String(note.id))
            .update({ deleted:true, deletedBy:deleter, deletedAt:note.deletedAt, deleteReason:reason })
            .catch(function(){});
    } catch(e){}

    /* audit log */
    try {
        var logs = (app.state.features && app.state.features.auditLog) || [];
        logs.push({ action:'NW_DELETE', user:deleter, detail:'id:'+note.id+' text:'+note.text.substring(0,30)+(reason?' reason:'+reason:''), time: new Date().toISOString() });
        if (app.state.features) app.state.features.auditLog = logs;
    } catch(e){}

    app._nwExpandedId = null;
    app.renderNoteWallContent(cid);

    /* undo toast */
    var toastId = 'nw-undo-toast-'+note.id;
    removeEl(toastId);
    var el = document.createElement('div');
    el.id = toastId;
    el.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:12px 20px;border-radius:14px;font-size:14px;font-weight:700;z-index:99999;display:flex;align-items:center;gap:12px;box-shadow:0 8px 30px rgba(0,0,0,0.5);white-space:nowrap;';
    el.innerHTML = '🗑️ ลบโน้ตแล้ว &nbsp;<button onclick="window.app._nwUndoDelete('+note.id+',\''+escQ(cid)+'\',document.getElementById(\''+escQ(toastId)+'\'))" style="padding:5px 14px;border-radius:8px;border:none;background:#f59e0b;color:#fff;font-weight:800;cursor:pointer;font-size:13px;">↩️ Undo</button>';
    var bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;bottom:0;left:0;height:3px;background:#f59e0b;border-radius:0 0 14px 14px;width:100%;transition:width 10s linear;';
    el.appendChild(bar);
    document.body.appendChild(el);
    setTimeout(function(){ bar.style.width='0%'; },50);
    setTimeout(function(){ if(el.parentNode) el.remove(); },10000);
}

/* ── RENDER NOTEWALL v2 ─────────────────────────────────────────────────── */
function v4_renderNoteWall(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var app = window.app;
    var self = app;
    var isOverlay = containerId === 'notewall-container';
    var cu = currentUser();
    var role = getRole();
    var adminView = isAdmin() || isMaster() || isSupervisor();

    if (!app.state.noteWall) app.state.noteWall = { notes:[], viewDate:app._todayStr(), filterType:'all', filterStatus:'all' };
    var nw = app.state.noteWall;
    if (!nw.viewDate) nw.viewDate = app._todayStr();
    if (!nw.mode) nw.mode = 'board';
    var nwMode = (nw.mode === 'archive') ? 'archive' : 'board';

    var notes    = nw.notes || [];
    var todayStr = app._todayStr();

    var visible = notes.filter(function(n){
        if (n.deleted) return false;
        /* intern sees own notes + notes targeted at them */
        if (role==='intern') {
            if (!adminView) {
                return (n.createdBy===cu || n.targetUser===cu || n.isBroadcast || n.isMustRead) &&
                       (n.date===todayStr || n.status!=='done');
            }
        }
        if (nw.viewDate===todayStr) return n.date===todayStr || (n.date!==todayStr && n.status!=='done');
        return n.date===nw.viewDate;
    });
    if (nw.filterType && nw.filterType!=='all') visible = visible.filter(function(n){ return n.type===nw.filterType; });
    if (nw.filterStatus && nw.filterStatus!=='all') visible = visible.filter(function(n){ return n.status===nw.filterStatus; });
    visible.sort(function(a,b){ return ((b.pinned||b.isBroadcast||b.isMustRead)?1:0)-((a.pinned||a.isBroadcast||a.isMustRead)?1:0); });

    var stats = {
        total: notes.filter(function(n){ return !n.deleted && (n.date===todayStr||n.status!=='done'); }).length,
        open: notes.filter(function(n){ return !n.deleted && n.status==='open'; }).length,
        claimed: notes.filter(function(n){ return !n.deleted && n.status==='claimed'; }).length,
        inprogress: notes.filter(function(n){ return !n.deleted && n.status==='inprogress'; }).length,
        done: notes.filter(function(n){ return !n.deleted && n.status==='done' && n.date===todayStr; }).length
    };

    var dateSet = {};
    notes.forEach(function(n){ dateSet[n.date]=true; });
    if(!dateSet[todayStr]) dateSet[todayStr]=true;
    var availDates = Object.keys(dateSet).sort().reverse();

    var fmtDate = function(d){
        if(d===todayStr) return 'วันนี้';
        var diff = (new Date(todayStr)-new Date(d))/86400000;
        if(diff===1) return 'เมื่อวาน';
        return new Date(d).toLocaleDateString('th-TH',{day:'numeric',month:'short'});
    };

    var noteColors = ['#fff9c4','#ffe0b2','#c8e6c9','#bbdefb','#f8bbd0','#e1bee7','#b2dfdb','#ffccbc'];
    var noteEdges  = ['#e6df7a','#e6c08a','#8fbd91','#82b4db','#d68ba5','#b88dbe','#7fbfba','#d9a08a'];
    var tapeData   = [{w:58,rot:-7,x:32},{w:50,rot:5,x:48},{w:66,rot:-3,x:28},{w:52,rot:10,x:52},{w:62,rot:-5,x:38}];
    var typeConfig = { task:{label:'งาน TOPUP',color:'#f59e0b',icon:'📦'}, issue:{label:'แจ้งปัญหา',color:'#ef4444',icon:'🚨'}, info:{label:'แจ้งให้ทราบ',color:'#3b82f6',icon:'📢'}, request:{label:'ขอความช่วยเหลือ',color:'#8b5cf6',icon:'🙏'} };
    var statusConfig = { open:{label:'เปิดอยู่',color:'#f59e0b'}, claimed:{label:'รับแล้ว',color:'#3b82f6'}, inprogress:{label:'กำลังทำ',color:'#06b6d4'}, done:{label:'เสร็จแล้ว',color:'#22c55e'} };

    var corkClass = (role==='intern') ? 'notewall-cork-intern' : 'notewall-cork';

    var html = '';
    html += '<div class="'+corkClass+' min-h-full" style="'+(isOverlay?'height:100vh;display:flex;flex-direction:column;':'border-radius:16px;overflow:hidden;min-height:70vh;')+'">';

    /* ── Header ── */
    html += '<div style="background:rgba(0,0,0,0.3);backdrop-filter:blur(10px);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;flex-shrink:0;">';
    html += '<div style="display:flex;align-items:center;gap:10px;">';
    if (isOverlay) html += '<button onclick="window.app.closeNoteWall()" style="background:rgba(255,255,255,0.1);border:none;border-radius:8px;width:36px;height:36px;color:#fff;font-size:18px;cursor:pointer;">✕</button>';
    html += '<div><h2 style="margin:0;font-size:18px;font-weight:800;color:#f8fafc;">📋 Note Wall</h2>';
    html += '<p style="margin:0;font-size:11px;color:#cbd5e1;">แปะ · รับ · ติดตาม — ทุกคนใช้ร่วมกัน</p></div></div>';
    html += '<div style="display:flex;align-items:center;gap:8px;">';

    /* supervisor extra buttons */
    if (isSupervisor()) {
        html += '<button onclick="window.v4_nwShowNewNote(\''+containerId+'\');window.app._nwSelectedType=\'broadcast\'" style="padding:6px 12px;border-radius:8px;background:rgba(14,165,233,0.2);border:1px solid #0ea5e9;color:#7dd3fc;font-size:12px;font-weight:700;cursor:pointer;">📣 Broadcast</button>';
    }
    /* admin: dashboard mini button */
    if (isAdmin()||isMaster()) {
        html += '<button onclick="window.v4_nwAdminDash(\''+containerId+'\')" style="padding:5px 10px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:12px;cursor:pointer;font-weight:600;">📊</button>';
    }
    html += '<button onclick="window.app._nwToggleLegend(\''+containerId+'\')" style="padding:5px 10px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:12px;cursor:pointer;font-weight:600;">🎨 สี</button>';
    html += '<button onclick="window.v4_nwShowNewNote(\''+containerId+'\')" style="padding:6px 14px;border-radius:8px;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;color:#fff;font-size:13px;font-weight:800;cursor:pointer;">+ แปะโน้ต</button>';
    html += '</div></div>';

    /* ── NOTEWALL v4.7 MAIN TABS: ต้องอยู่ในหน้ากระดานจริงเสมอ ── */
    var tabBtnBase = 'min-width:150px;padding:11px 20px;border-radius:14px;border:2px solid;cursor:pointer;font-weight:900;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.10);';
    html += '<div id="nw-main-tabs-'+containerId+'" style="flex-shrink:0;background:rgba(255,255,255,0.94);border-bottom:1px solid rgba(120,80,40,.22);padding:10px 16px;display:flex;gap:10px;align-items:center;justify-content:center;box-shadow:0 5px 18px rgba(0,0,0,.08);position:relative;z-index:6;">';
    html += '<button onclick="window.app._nwSetMode(\'board\',\''+containerId+'\')" style="'+tabBtnBase+'background:'+(nwMode==='board'?'linear-gradient(135deg,#2563eb,#1d4ed8)':'#fffaf0')+';color:'+(nwMode==='board'?'#fff':'#334155')+';border-color:'+(nwMode==='board'?'#2563eb':'#e7d7bf')+';">📝 กระดานโน้ต</button>';
    html += '<button onclick="window.app._nwSetMode(\'archive\',\''+containerId+'\')" style="'+tabBtnBase+'background:'+(nwMode==='archive'?'linear-gradient(135deg,#d97706,#92400e)':'#fffaf0')+';color:'+(nwMode==='archive'?'#fff':'#334155')+';border-color:'+(nwMode==='archive'?'#b45309':'#e7d7bf')+';">🗂️ ที่เสียบโน้ต</button>';
    html += '</div>';

    if (nwMode === 'archive') {
        var q = (nw.archiveSearch || '').toString().toLowerCase();
        var aType = nw.archiveType || 'all';
        var aStatus = nw.archiveStatus || 'all';
        var isOldNote = function(n) {
            if (n.deleted || n.status === 'deleted') return true;
            if (n.status === 'done' || n.status === 'closed' || n.status === 'complete' || n.closedAt) return true;
            if (n.dueTime && new Date(n.dueTime) < new Date()) return true;
            if (n.expiresAt && Number(n.expiresAt) < Date.now()) return true;
            return false;
        };
        var noteTypeOf = function(n){
            var t = (n.type || 'task').toString();
            if (t === 'task') return 'topup';
            if (t === 'info') return 'announce';
            if (t === 'issue') return 'urgent';
            if (t === 'request') return 'request';
            return t;
        };
        var archiveStatusOf = function(n){
            if (n.deleted || n.status === 'deleted') return 'deleted';
            if (n.status === 'done' || n.status === 'closed' || n.status === 'complete' || n.closedAt) return 'done';
            if ((n.dueTime && new Date(n.dueTime) < new Date()) || (n.expiresAt && Number(n.expiresAt) < Date.now())) return 'expired';
            return 'active';
        };
        var statusText = function(n){ var st=archiveStatusOf(n); return st==='done'?'ปิดงานแล้ว':st==='expired'?'หมดอายุแล้ว':st==='deleted'?'ลบแล้ว':'เปิดอยู่'; };
        var statusColor = function(n){ var st=archiveStatusOf(n); return st==='done'?'#16a34a':st==='expired'?'#dc2626':st==='deleted'?'#475569':'#f59e0b'; };
        var fmt = function(v){ if(!v) return '-'; try{ var d=new Date(v); if(isNaN(d.getTime())) return String(v); return d.toLocaleString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(e){ return String(v); } };
        var typeLabel = function(n){ var t=noteTypeOf(n); if(t==='topup') return '📦 TOPUP'; if(t==='request') return '🙏 ฝากงาน'; if(t==='announce') return '📢 ประกาศ'; if(t==='urgent') return '⚠️ งานด่วน'; return '📝 โน้ต'; };
        var typeColor = function(n){ var t=noteTypeOf(n); if(t==='topup') return '#f59e0b'; if(t==='request') return '#7c3aed'; if(t==='announce') return '#2563eb'; if(t==='urgent') return '#dc2626'; return '#64748b'; };
        var archived = notes.filter(function(n){ return !n._tmp && isOldNote(n); });
        if (aType !== 'all') archived = archived.filter(function(n){ return noteTypeOf(n) === aType; });
        if (aStatus !== 'all') archived = archived.filter(function(n){ return archiveStatusOf(n) === aStatus; });
        if (q) archived = archived.filter(function(n){
            var hay = [n.text,n.detail,n.createdBy,n.claimedBy,n.targetUser,n.owner,n.date,n.id,n.location,n.tfor].join(' ').toLowerCase();
            return hay.indexOf(q) >= 0;
        });
        archived.sort(function(a,b){ return (b.closedAt||b.deletedAt||b.createdAt||b.id||0) - (a.closedAt||a.deletedAt||a.createdAt||a.id||0); });
        var selectedId = nw.archiveSelectedId;
        var selected = archived.find(function(n){ return String(n.id) === String(selectedId); }) || archived[0] || null;
        if (selected) nw.archiveSelectedId = selected.id;
        html += '<div style="flex:1;overflow:auto;padding:14px 16px 70px;background:rgba(255,248,235,.30);">';
        html += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">';
        html += '<input id="nw-archive-search-'+containerId+'" value="'+app._escHtml(nw.archiveSearch||'')+'" placeholder="ค้นหาโน้ตเก่า, คนสร้าง, ผู้รับงาน, TFOR, เลขรถ..." style="flex:1;min-width:260px;padding:12px 14px;border-radius:14px;border:1px solid #d6b98c;background:#fff;color:#334155;font-weight:700;">';
        html += '<button onclick="window.app._nwArchiveSearch(document.getElementById(\'nw-archive-search-'+containerId+'\').value,\''+containerId+'\')" style="padding:12px 18px;border-radius:14px;border:none;background:#2563eb;color:#fff;font-weight:900;cursor:pointer;">ค้นหา</button>';
        html += '<button onclick="window.app._nwArchiveClear(\''+containerId+'\')" style="padding:12px 14px;border-radius:14px;border:1px solid #d6b98c;background:#fffaf0;color:#7c2d12;font-weight:900;cursor:pointer;">ล้าง</button>';
        html += '</div>';
        html += '<div style="display:flex;gap:8px;overflow-x:auto;margin-bottom:14px;padding-bottom:3px;">';
        [ ['all','ทั้งหมด','all'], ['done','ปิดงานแล้ว','done'], ['expired','หมดอายุ','expired'], ['topup','TOPUP','type'], ['request','ฝากงาน','type'], ['announce','ประกาศ','type'] ].forEach(function(x){
            var active = (x[2]==='type' ? aType===x[0] : aStatus===x[2] && aType==='all');
            html += '<button onclick="window.app._nwArchiveFolder(\''+x[0]+'\',\''+containerId+'\')" style="white-space:nowrap;padding:8px 13px;border-radius:12px;border:1px solid '+(active?'#b45309':'#ead7ba')+';background:'+(active?'#b45309':'#fffaf0')+';color:'+(active?'#fff':'#7c2d12')+';font-size:12px;font-weight:900;cursor:pointer;">'+x[1]+'</button>';
        });
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:minmax(280px,420px) minmax(0,1fr);gap:16px;align-items:start;">';
        html += '<div style="background:rgba(255,255,255,.82);border:1px solid rgba(120,80,40,.18);border-radius:18px;padding:12px;box-shadow:0 14px 34px rgba(0,0,0,.12);max-height:calc(100vh - 250px);overflow:auto;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><b style="color:#3f2a16;">รายการโน้ตเก่า</b><span style="font-size:11px;color:#7c2d12;font-weight:900;">'+archived.length+' รายการ</span></div>';
        if (!archived.length) html += '<div style="text-align:center;color:#8b6f4b;padding:34px 10px;"><div style="font-size:40px;">🗂️</div><b>ยังไม่มีโน้ตในที่เสียบ</b><p style="font-size:12px;">โน้ตที่ปิดงานหรือหมดอายุแล้วจะมาอยู่ที่นี่</p></div>';
        archived.forEach(function(n){
            var on = selected && String(selected.id)===String(n.id);
            html += '<div onclick="window.app._nwSelectArchive('+JSON.stringify(n.id)+',\''+containerId+'\')" style="margin-bottom:9px;padding:12px;border-radius:14px;cursor:pointer;border:1.5px solid '+(on?'#b45309':'#ead7ba')+';background:'+(on?'#fff3d7':'#fffaf0')+';box-shadow:'+(on?'0 8px 18px rgba(180,83,9,.16)':'none')+';">';
            html += '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;"><span style="background:'+typeColor(n)+';color:#fff;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:900;">'+typeLabel(n)+'</span><span style="background:'+statusColor(n)+';color:#fff;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:900;">'+statusText(n)+'</span></div>';
            html += '<div style="font-weight:900;color:#1e293b;margin-top:8px;line-height:1.35;">'+app._escHtml((n.text||'').slice(0,72))+'</div>';
            html += '<div style="font-size:11px;color:#64748b;margin-top:6px;">สร้างโดย '+app._escHtml(n.createdBy||'-')+' · '+fmt(n.createdAt||n.id)+'</div>';
            html += '</div>';
        });
        html += '</div>';
        html += '<div style="background:rgba(255,251,235,.92);border:1px solid rgba(120,80,40,.18);border-radius:20px;padding:18px;box-shadow:0 14px 34px rgba(0,0,0,.13);min-height:360px;">';
        if (!selected) html += '<div style="text-align:center;color:#8b6f4b;padding:56px 10px;"><div style="font-size:48px;">📁</div><b>เลือกโน้ตเก่าจากรายการ</b></div>';
        else {
            html += '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">';
            html += '<div><span style="background:'+typeColor(selected)+';color:#fff;padding:4px 10px;border-radius:9px;font-size:11px;font-weight:900;">'+typeLabel(selected)+'</span><h2 style="margin:12px 0 6px;color:#1e293b;font-weight:900;font-size:22px;line-height:1.35;">'+app._escHtml(selected.text||'-')+'</h2></div>';
            html += '<span style="background:'+statusColor(selected)+';color:#fff;padding:5px 10px;border-radius:10px;font-size:12px;font-weight:900;white-space:nowrap;">'+statusText(selected)+'</span></div>';
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:12px 0;padding:14px;border-radius:16px;background:rgba(255,255,255,.65);font-size:12px;color:#334155;">';
            html += '<div>👤 สร้างโดย<br><b>'+app._escHtml(selected.createdBy||'-')+'</b></div><div>🤚 ผู้รับงาน<br><b>'+app._escHtml(selected.claimedBy||selected.targetUser||'-')+'</b></div><div>🕘 สร้างเมื่อ<br><b>'+fmt(selected.createdAt||selected.id)+'</b></div><div>✅ ปิดโดย<br><b>'+app._escHtml(selected.closedBy||'-')+'</b></div></div>';
            if (selected.detail) html += '<h3 style="font-size:14px;font-weight:900;color:#3f2a16;margin:16px 0 6px;">รายละเอียด</h3><p style="white-space:pre-wrap;line-height:1.6;color:#334155;background:rgba(255,255,255,.55);border-radius:14px;padding:12px;">'+app._escHtml(selected.detail)+'</p>';
            var hist = selected.history || [];
            html += '<h3 style="font-size:14px;font-weight:900;color:#3f2a16;margin:18px 0 8px;">ไทม์ไลน์</h3>';
            if (!hist.length) html += '<div style="font-size:12px;color:#64748b;">ยังไม่มีประวัติละเอียด</div>';
            else hist.forEach(function(h){ html += '<div style="display:flex;gap:10px;align-items:flex-start;margin:8px 0;font-size:12px;color:#334155;"><span style="width:9px;height:9px;background:#2563eb;border-radius:50%;margin-top:5px;flex-shrink:0;"></span><div><b>'+app._escHtml(h.time||fmt(h.at)||'-')+'</b> '+app._escHtml(h.by||'ระบบ')+' · '+app._escHtml(h.note||h.action||'อัปเดต')+'</div></div>'; });
            html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px;">';
            html += '<button onclick="window.app._nwReopenNote('+JSON.stringify(selected.id)+',\''+containerId+'\')" style="padding:10px 14px;border-radius:12px;border:none;background:#2563eb;color:#fff;font-weight:900;cursor:pointer;">↩️ เปิดงานอีกครั้ง</button>';
            if (isAdmin()||isMaster()) html += '<button onclick="window.app._nwDeleteNote('+JSON.stringify(selected.id)+',\''+containerId+'\')" style="padding:10px 14px;border-radius:12px;border:none;background:#ef4444;color:#fff;font-weight:900;cursor:pointer;">🗑️ ลบโน้ต</button>';
            html += '</div>';
        }
        html += '</div></div></div>';
        html += '<style>@media(max-width:760px){#notewall-container [style*="grid-template-columns:minmax(280px,420px)"]{grid-template-columns:1fr!important;}#nw-main-tabs-'+containerId+' button{min-width:0!important;flex:1!important;}}</style>';
        html += '</div></div>';
        container.innerHTML = html;
        return;
    }

    /* ── Filter row ── */
    html += '<div style="padding:8px 16px;display:flex;align-items:center;gap:6px;overflow-x:auto;flex-shrink:0;flex-wrap:nowrap;">';
    availDates.forEach(function(d){
        var active = nw.viewDate===d;
        html += '<button onclick="window.app._nwSetDate(\''+d+'\',\''+containerId+'\')" style="padding:4px 10px;border-radius:8px;font-size:11px;font-weight:'+(active?800:500)+';background:'+(active?'rgba(255,255,255,0.2)':'rgba(255,255,255,0.06)')+';color:#fff;border:none;cursor:pointer;white-space:nowrap;">📅 '+fmtDate(d)+'</button>';
    });
    html += '<div style="width:1px;height:20px;background:rgba(255,255,255,0.15);flex-shrink:0;margin:0 2px;"></div>';
    [
        {k:'all',label:'ทั้งหมด '+stats.total,c:'#94a3b8'},
        {k:'open',label:'เปิด '+stats.open,c:'#f59e0b'},
        {k:'claimed',label:'รับ '+stats.claimed,c:'#3b82f6'},
        {k:'inprogress',label:'ทำ '+stats.inprogress,c:'#06b6d4'},
        {k:'done',label:'เสร็จ '+stats.done,c:'#22c55e'}
    ].forEach(function(s){
        var active = nw.filterStatus===s.k;
        html += '<button onclick="window.app._nwSetFilter(\'status\',\''+s.k+'\',\''+containerId+'\')" style="padding:4px 10px;border-radius:8px;font-size:11px;font-weight:'+(active?700:400)+';background:'+(active?s.c:'rgba(255,255,255,0.06)')+';color:#fff;border:none;cursor:pointer;white-space:nowrap;">'+s.label+'</button>';
    });
    html += '</div>';

    /* legend placeholder */
    html += '<div id="nw-legend-'+containerId+'" style="display:none;"></div>';

    /* ── Note Grid ── */
    html += '<div style="flex:1;overflow-y:auto;padding:12px 16px 60px;">';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:24px;align-items:start;">';

    if (!visible.length) {
        html += '<div style="grid-column:1/-1;text-align:center;padding:48px;color:rgba(255,255,255,0.4);">' +
                '<div style="font-size:40px;">📭</div>' +
                '<p style="font-size:14px;margin-top:8px;">ไม่มีโน้ต — กด "+ แปะโน้ต" เพื่อเริ่ม</p></div>';
    }

    visible.forEach(function(note, idx){
        var type  = typeConfig[note.type] || typeConfig.task;
        var stCfg = statusConfig[note.status] || statusConfig.open;
        var ci    = (note.ci||idx)%8;
        var ti    = (note.ti||idx)%5;
        var rot   = note.rot || ((idx*2.3-5)%9);
        var tape  = tapeData[ti];
        var carryOver = note.date!==todayStr && note.status!=='done';

        /* special badges */
        var isBcast    = note.isBroadcast;
        var isMust     = note.isMustRead;
        var isEscalate = note.escalateAfter && (Date.now()-note.createdAt) > note.escalateAfter*3600000 && note.status!=='done';
        var hasDue     = note.dueTime;
        var dueExpired = hasDue && new Date(note.dueTime)<new Date();
        var reactions  = note.reactions || {thumbsUp:[],warning:[]};
        var myThumb    = reactions.thumbsUp.indexOf(cu)>=0;
        var myWarn     = reactions.warning.indexOf(cu)>=0;
        var isMyNote   = note.createdBy===cu;
        var withinEdit = isMyNote && note.createdAt && (Date.now()-note.createdAt)<5*60*1000;

        var borderLeft = isBcast ? '4px solid #0ea5e9' : isMust ? '4px solid #dc2626' : isEscalate ? '4px solid #ef4444' : 'none';

        html += '<div class="sticky-note" onclick="window.app._nwExpandNote('+note.id+',\''+containerId+'\')" ';
        html += 'style="position:relative;cursor:pointer;margin-top:12px;transform:rotate('+rot+'deg);z-index:'+(note.pinned?5:1)+';border-left:'+borderLeft+';" id="sn-'+note.id+'-'+containerId+'">';

        /* tape */
        html += '<div class="sticky-tape" style="left:'+tape.x+'%;width:'+tape.w+'px;background:rgba(200,190,140,0.5);transform:rotate('+tape.rot+'deg);"></div>';
        if (note.pinned||isBcast||isMust) html += '<div style="position:absolute;top:-14px;right:16px;font-size:20px;z-index:4;">'+(isMust?'🚨':isBcast?'📣':'📌')+'</div>';

        /* badges row */
        if (carryOver) html += '<div style="position:absolute;top:-10px;right:8px;background:#7c3aed;color:#fff;font-size:9px;font-weight:800;padding:1px 7px;border-radius:5px;z-index:4;">📎 ค้าง</div>';
        if (isEscalate) html += '<div style="position:absolute;top:-10px;left:8px;background:#ef4444;color:#fff;font-size:9px;font-weight:800;padding:1px 7px;border-radius:5px;z-index:4;animation:v4pulse 0.8s infinite;">🔴 ESCALATE</div>';
        if (dueExpired) html += '<div style="position:absolute;top:-10px;left:8px;background:#b45309;color:#fff;font-size:9px;font-weight:800;padding:1px 7px;border-radius:5px;z-index:4;">⏰ เกิน Due</div>';
        if (note.isInternNote) html += '<div style="position:absolute;top:-10px;left:8px;background:#312e81;color:#a5b4fc;font-size:9px;font-weight:800;padding:1px 7px;border-radius:5px;z-index:4;">🎓 ฝึกงาน</div>';

        /* card body */
        html += '<div style="background:'+noteColors[ci]+';border-radius:2px;padding:20px 16px 14px;box-shadow:3px 5px 12px rgba(0,0,0,0.12);border-bottom:4px solid '+type.color+'25;min-height:120px;position:relative;">';
        html += '<div style="position:absolute;top:0;right:0;width:0;height:0;border-style:solid;border-width:0 20px 20px 0;border-color:transparent '+noteEdges[ci]+' transparent transparent;opacity:0.5;"></div>';

        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        html += '<span style="background:'+type.color+';color:#fff;padding:1px 7px;border-radius:4px;font-size:9px;font-weight:700;">'+type.icon+' '+type.label+'</span>';
        html += '<span style="background:'+stCfg.color+';color:#fff;padding:1px 7px;border-radius:4px;font-size:9px;font-weight:700;">'+stCfg.label+'</span>';
        html += '</div>';

        html += '<p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#1e293b;line-height:1.5;font-family:Caveat,cursive;">'+app._escHtml(note.text)+'</p>';

        /* chips */
        html += '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;">';
        html += '<span style="background:#f59e0b;color:#fff;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:800;">✏️ '+app._escHtml(note.createdBy)+'</span>';
        if (note.targetUser) html += '<span style="background:#0ea5e9;color:#fff;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:800;">🎯 '+app._escHtml(note.targetUser)+'</span>';
        if (note.claimedBy)  html += '<span style="background:#3b82f6;color:#fff;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:800;">🤚 '+app._escHtml(note.claimedBy)+'</span>';
        html += '</div>';

        /* reactions */
        html += '<div style="display:flex;gap:6px;margin-top:8px;">';
        html += '<button onclick="event.stopPropagation();window.v4_nwReact('+note.id+',\'thumbsUp\',\''+containerId+'\')" style="padding:3px 8px;border-radius:6px;border:1.5px solid #e2e8f0;background:'+(myThumb?'#dbeafe':'#fff')+';font-size:12px;cursor:pointer;">👍 '+reactions.thumbsUp.length+'</button>';
        html += '<button onclick="event.stopPropagation();window.v4_nwReact('+note.id+',\'warning\',\''+containerId+'\')" style="padding:3px 8px;border-radius:6px;border:1.5px solid #e2e8f0;background:'+(myWarn?'#fef3c7':'#fff')+';font-size:12px;cursor:pointer;">⚠️ '+reactions.warning.length+'</button>';
        if (hasDue) html += '<span style="font-size:10px;color:'+(dueExpired?'#ef4444':'#64748b')+';padding:3px 6px;background:rgba(0,0,0,0.06);border-radius:6px;">⏰ '+new Date(note.dueTime).toLocaleDateString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+'</span>';
        html += '</div>';

        /* must-read progress */
        if (isMust && note.mustReadUsers && note.mustReadUsers.length) {
            var confirmed = Object.keys(note.mustReadConfirmed||{}).length;
            var total = note.mustReadUsers.length;
            var myConfirmed = !!(note.mustReadConfirmed||{})[cu];
            html += '<div style="margin-top:8px;">';
            html += '<div style="background:#e2e8f0;border-radius:4px;height:6px;"><div style="background:#22c55e;height:6px;border-radius:4px;width:'+Math.round(confirmed/total*100)+'%;"></div></div>';
            html += '<div style="font-size:10px;color:#64748b;margin-top:3px;">รับทราบ '+confirmed+'/'+total+' คน</div>';
            if (!myConfirmed) html += '<button onclick="event.stopPropagation();window.v4_nwMustReadConfirm('+note.id+',\''+containerId+'\')" style="margin-top:5px;padding:4px 10px;background:#dc2626;border:none;border-radius:6px;color:#fff;font-size:10px;font-weight:700;cursor:pointer;">✅ กดรับทราบ</button>';
            html += '</div>';
        }

        /* action buttons area */
        html += '<div id="sn-actions-'+note.id+'-'+containerId+'" style="display:none;margin-top:12px;border-top:1px dashed rgba(0,0,0,0.1);padding-top:10px;">';
        html += '<div style="display:flex;gap:5px;flex-wrap:wrap;">';
        if (note.status==='open') html += '<button onclick="event.stopPropagation();window.app._nwAction('+note.id+',\'claimed\',\''+containerId+'\')" style="padding:8px 12px;border-radius:8px;border:none;background:#3b82f6;color:#fff;font-weight:700;font-size:12px;cursor:pointer;">🤚 รับงาน</button>';
        if (note.status==='claimed'&&note.claimedBy===cu) html += '<button onclick="event.stopPropagation();window.app._nwAction('+note.id+',\'inprogress\',\''+containerId+'\')" style="padding:8px 12px;border-radius:8px;border:none;background:#06b6d4;color:#fff;font-weight:700;font-size:12px;cursor:pointer;">⚙️ เริ่มทำ</button>';
        if (note.status==='inprogress'&&note.claimedBy===cu) html += '<button onclick="event.stopPropagation();window.app._nwAction('+note.id+',\'done\',\''+containerId+'\')" style="padding:8px 12px;border-radius:8px;border:none;background:#22c55e;color:#fff;font-weight:700;font-size:12px;cursor:pointer;">✅ เสร็จ!</button>';

        /* pin / history (not intern) */
        if (role !== 'intern') {
            html += '<button onclick="event.stopPropagation();window.app._nwTogglePin('+note.id+',\''+containerId+'\')" style="padding:8px 12px;border-radius:8px;border:1.5px solid #64748b;background:transparent;color:#334155;font-weight:700;font-size:12px;cursor:pointer;">'+(note.pinned?'📌 เลิกปัก':'📌 ปักหมุด')+'</button>';
            html += '<button onclick="event.stopPropagation();window.app._nwShowHistory('+note.id+',\''+containerId+'\')" style="padding:8px 12px;border-radius:8px;border:1.5px solid #8b5cf6;background:rgba(139,92,246,0.08);color:#6d28d9;font-weight:700;font-size:12px;cursor:pointer;">📜 ประวัติ</button>';
        }

        /* edit (owner within 5 min, not intern) */
        if (withinEdit && role!=='intern') {
            html += '<button onclick="event.stopPropagation();window.v4_nwEditNote('+note.id+',\''+containerId+'\')" style="padding:8px 12px;border-radius:8px;border:1.5px solid #f59e0b;background:rgba(245,158,11,0.08);color:#b45309;font-weight:700;font-size:12px;cursor:pointer;">✏️ แก้ไข</button>';
        }

        /* admin: re-assign, lock */
        if (isAdmin()||isMaster()) {
            html += '<button onclick="event.stopPropagation();window.v4_nwReassign('+note.id+',\''+containerId+'\')" style="padding:8px 12px;border-radius:8px;border:1.5px solid #0ea5e9;background:rgba(14,165,233,0.08);color:#0369a1;font-weight:700;font-size:12px;cursor:pointer;">🔄 Re-assign</button>';
            html += '<button onclick="event.stopPropagation();window.v4_nwToggleLock('+note.id+',\''+containerId+'\')" style="padding:8px 12px;border-radius:8px;border:1.5px solid #64748b;background:rgba(100,116,139,0.08);color:#334155;font-weight:700;font-size:12px;cursor:pointer;">'+(note.locked?'🔓 ปลดล็อก':'🔒 ล็อกโน้ต')+'</button>';
        }

        /* supervisor: nudge */
        if (isSupervisor() && note.targetUser) {
            html += '<button onclick="event.stopPropagation();window.v4_nwNudge('+note.id+')" style="padding:8px 12px;border-radius:8px;border:none;background:#f59e0b;color:#fff;font-weight:700;font-size:12px;cursor:pointer;">🔔 Nudge</button>';
        }

        /* delete */
        var nowMs = Date.now();
        var grace = role==='intern' ? 2*60*1000 : 5*60*1000;
        var canDel = (isAdmin()||isMaster()) ||
                     (!note.locked && note.createdBy===cu && note.createdAt && (nowMs-note.createdAt)<grace);
        if (canDel) html += '<button onclick="event.stopPropagation();window.app._nwDeleteNote('+note.id+',\''+containerId+'\')" style="padding:8px 12px;border-radius:8px;border:none;background:#ef4444;color:#fff;font-weight:700;font-size:12px;cursor:pointer;margin-left:auto;">🗑️ ลบ</button>';

        html += '</div></div>';
        html += '</div></div>';
    });

    html += '</div></div>';
    html += '</div>';
    container.innerHTML = html;
}

/* ── NoteWall Color Legend Toggle ────────────────────────────────────────── */
app._nwToggleLegend = function(containerId) {
    var legendEl = document.getElementById('nw-legend-' + containerId);
    if (!legendEl) return;

    if (legendEl.style.display !== 'none' && legendEl.style.display !== '') {
        legendEl.style.display = 'none';
        return;
    }

    var typeConfig = {
        task:    { label: 'งาน TOPUP',         color: '#f59e0b', icon: '📦' },
        issue:   { label: 'แจ้งปัญหา',          color: '#ef4444', icon: '🚨' },
        info:    { label: 'แจ้งให้ทราบ',         color: '#3b82f6', icon: '📢' },
        request: { label: 'ขอความช่วยเหลือ',    color: '#8b5cf6', icon: '🙏' }
    };
    var statusConfig = {
        open:       { label: 'เปิดอยู่',   color: '#f59e0b' },
        claimed:    { label: 'รับแล้ว',    color: '#3b82f6' },
        inprogress: { label: 'กำลังทำ',    color: '#06b6d4' },
        done:       { label: 'เสร็จแล้ว',  color: '#22c55e' }
    };
    var noteColorNames = ['เหลืองอ่อน','ส้มอ่อน','เขียวอ่อน','ฟ้าอ่อน','ชมพูอ่อน','ม่วงอ่อน','มิ้นต์','พีช'];
    var noteColors = ['#fff9c4','#ffe0b2','#c8e6c9','#bbdefb','#f8bbd0','#e1bee7','#b2dfdb','#ffccbc'];

    var html = '<div style="background:rgba(15,23,42,0.92);border-radius:12px;padding:16px 20px;margin:0 16px 12px;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.1);">';
    html += '<div style="display:flex;gap:24px;flex-wrap:wrap;">';

    html += '<div>';
    html += '<div style="font-size:10px;font-weight:800;color:rgba(255,255,255,0.5);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">ประเภทโน้ต</div>';
    html += '<div style="display:flex;flex-direction:column;gap:5px;">';
    Object.keys(typeConfig).forEach(function(k) {
        var t = typeConfig[k];
        html += '<div style="display:flex;align-items:center;gap:7px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + t.color + ';flex-shrink:0;"></span><span style="font-size:12px;color:rgba(255,255,255,0.85);">' + t.icon + ' ' + t.label + '</span></div>';
    });
    html += '</div></div>';

    html += '<div>';
    html += '<div style="font-size:10px;font-weight:800;color:rgba(255,255,255,0.5);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">สถานะ</div>';
    html += '<div style="display:flex;flex-direction:column;gap:5px;">';
    Object.keys(statusConfig).forEach(function(k) {
        var s = statusConfig[k];
        html += '<div style="display:flex;align-items:center;gap:7px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + s.color + ';flex-shrink:0;"></span><span style="font-size:12px;color:rgba(255,255,255,0.85);">' + s.label + '</span></div>';
    });
    html += '</div></div>';

    html += '<div>';
    html += '<div style="font-size:10px;font-weight:800;color:rgba(255,255,255,0.5);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">สีกระดาษโน้ต</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    noteColors.forEach(function(c, i) {
        html += '<div style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:18px;height:18px;border-radius:3px;background:' + c + ';border:1px solid rgba(0,0,0,0.12);flex-shrink:0;"></span><span style="font-size:11px;color:rgba(255,255,255,0.7);">' + noteColorNames[i] + '</span></div>';
    });
    html += '</div></div>';

    html += '</div></div>';

    legendEl.innerHTML = html;
    legendEl.style.display = 'block';
};

/* ── NoteWall extra actions ─────────────────────────────────────────────── */
window.v4_nwReact = function(id, type, cid) {
    var app = window.app;
    var note = (app.state.noteWall&&app.state.noteWall.notes||[]).find(function(n){return n.id===id;});
    if (!note) return;
    if (!note.reactions) note.reactions = {thumbsUp:[],warning:[]};
    var cu = currentUser();
    var arr = note.reactions[type];
    var idx = arr.indexOf(cu);
    if (idx>=0) arr.splice(idx,1); else arr.push(cu);
    try { if(window.db) window.db.collection('noteWall').doc(String(id)).update({reactions:note.reactions}).catch(function(){}); } catch(e){}
    app.renderNoteWallContent(cid);
};

window.v4_nwMustReadConfirm = function(id, cid) {
    var app = window.app;
    var note = (app.state.noteWall&&app.state.noteWall.notes||[]).find(function(n){return n.id===id;});
    if (!note) return;
    if (!note.mustReadConfirmed) note.mustReadConfirmed = {};
    note.mustReadConfirmed[currentUser()] = Date.now();
    try { if(window.db) window.db.collection('noteWall').doc(String(id)).update({mustReadConfirmed:note.mustReadConfirmed}).catch(function(){}); } catch(e){}
    app.renderNoteWallContent(cid);
    if(app.toast) app.toast('✅ รับทราบแล้ว','success');
};

window.v4_nwEditNote = function(id, cid) {
    var app = window.app;
    var note = (app.state.noteWall&&app.state.noteWall.notes||[]).find(function(n){return n.id===id;});
    if (!note) return;
    var newText = prompt('แก้ไขเนื้อหา:', note.text);
    if (!newText || !newText.trim() || newText.trim()===note.text) return;
    note.text = newText.trim();
    note.editedAt = Date.now();
    note.editedBy = currentUser();
    if (!note.history) note.history = [];
    note.history.push({action:'edited',by:currentUser(),time:new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})});
    try { if(window.db) window.db.collection('noteWall').doc(String(id)).update({text:note.text,editedAt:note.editedAt,editedBy:note.editedBy,history:note.history}).catch(function(){}); } catch(e){}
    app.renderNoteWallContent(cid);
    if(app.toast) app.toast('✏️ แก้ไขโน้ตแล้ว','success');
};

window.v4_nwReassign = function(id, cid) {
    var app = window.app;
    var note = (app.state.noteWall&&app.state.noteWall.notes||[]).find(function(n){return n.id===id;});
    if (!note) return;
    var users = (app.state.data.users||[]).map(function(u){return typeof u==='string'?u:(u.name||'');}).filter(Boolean);
    var newTarget = prompt('Re-assign ให้ใคร?\n'+users.join(', '));
    if (!newTarget || !users.includes(newTarget)) { if(app.toast) app.toast('ไม่พบชื่อนี้ในระบบ','error'); return; }
    note.targetUser = newTarget;
    note.claimedBy = null;
    note.status = 'open';
    note.reassignedBy = currentUser();
    note.reassignedAt = Date.now();
    if (!note.history) note.history = [];
    note.history.push({action:'reassigned',by:currentUser(),to:newTarget,time:new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})});
    try { if(window.db) window.db.collection('noteWall').doc(String(id)).update({targetUser:note.targetUser,claimedBy:null,status:'open',reassignedBy:note.reassignedBy,reassignedAt:note.reassignedAt,history:note.history}).catch(function(){}); } catch(e){}
    app.renderNoteWallContent(cid);
    if(app.toast) app.toast('🔄 Re-assign ให้ '+newTarget+' แล้ว','success');
};

window.v4_nwToggleLock = function(id, cid) {
    var app = window.app;
    var note = (app.state.noteWall&&app.state.noteWall.notes||[]).find(function(n){return n.id===id;});
    if (!note) return;
    note.locked = !note.locked;
    try { if(window.db) window.db.collection('noteWall').doc(String(id)).update({locked:note.locked}).catch(function(){}); } catch(e){}
    app.renderNoteWallContent(cid);
    if(app.toast) app.toast(note.locked?'🔒 ล็อกโน้ตแล้ว':'🔓 ปลดล็อกแล้ว','info');
};

window.v4_nwNudge = function(id) {
    var app = window.app;
    var note = (app.state.noteWall&&app.state.noteWall.notes||[]).find(function(n){return n.id===id;});
    if (!note || !note.targetUser) return;
    if(app.toast) app.toast('🔔 Nudge ส่งถึง '+note.targetUser+' แล้ว','info');
};

/* Admin NoteWall Dashboard mini-modal */
window.v4_nwAdminDash = function(cid) {
    var app = window.app;
    var notes = (app.state.noteWall&&app.state.noteWall.notes||[]).filter(function(n){return !n.deleted;});
    var today = app._todayStr();

    /* per-user count */
    var byUser = {};
    notes.forEach(function(n){
        if (!byUser[n.createdBy]) byUser[n.createdBy]={posted:0,claimed:0,done:0};
        byUser[n.createdBy].posted++;
        if(n.claimedBy) {
            if (!byUser[n.claimedBy]) byUser[n.claimedBy]={posted:0,claimed:0,done:0};
            byUser[n.claimedBy].claimed++;
        }
        if(n.status==='done') { if(!byUser[n.createdBy]) byUser[n.createdBy]={posted:0,claimed:0,done:0}; byUser[n.createdBy].done++; }
    });

    var rows = Object.keys(byUser).sort().map(function(u){
        var s = byUser[u];
        return '<tr style="border-bottom:1px solid #f1f5f9;">' +
            '<td style="padding:8px;font-size:13px;font-weight:700;">'+esc(u)+'</td>' +
            '<td style="padding:8px;text-align:center;color:#f59e0b;font-weight:700;">'+s.posted+'</td>' +
            '<td style="padding:8px;text-align:center;color:#3b82f6;font-weight:700;">'+s.claimed+'</td>' +
            '<td style="padding:8px;text-align:center;color:#22c55e;font-weight:700;">'+s.done+'</td>' +
            '</tr>';
    }).join('') || '<tr><td colspan="4" style="text-align:center;padding:16px;color:#94a3b8;">ยังไม่มีข้อมูล</td></tr>';

    var locked = notes.filter(function(n){return n.locked;}).length;
    var deleted = (app.state.noteWall&&app.state.noteWall.notes||[]).filter(function(n){return n.deleted;}).length;

    mkOverlay('v4-nw-admin-dash',
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h2 style="margin:0;font-size:17px;font-weight:800;">📊 NoteWall Admin Dashboard</h2>' +
        '<button onclick="document.getElementById(\'v4-nw-admin-dash\').remove()" style="background:#f1f5f9;border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;">✕</button></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;">' +
        '<div style="background:#fef3c7;border-radius:10px;padding:12px;text-align:center;"><div style="font-size:20px;font-weight:900;color:#b45309;">'+notes.length+'</div><div style="font-size:11px;color:#64748b;">โน้ตทั้งหมด</div></div>' +
        '<div style="background:#fee2e2;border-radius:10px;padding:12px;text-align:center;"><div style="font-size:20px;font-weight:900;color:#dc2626;">'+locked+'</div><div style="font-size:11px;color:#64748b;">ล็อกอยู่</div></div>' +
        '<div style="background:#f1f5f9;border-radius:10px;padding:12px;text-align:center;"><div style="font-size:20px;font-weight:900;color:#64748b;">'+deleted+'</div><div style="font-size:11px;color:#64748b;">ลบแล้ว</div></div>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;">' +
        '<thead><tr style="background:#f8fafc;"><th style="padding:8px;text-align:left;font-size:11px;color:#64748b;">ผู้ใช้</th><th style="padding:8px;font-size:11px;color:#64748b;">แปะ</th><th style="padding:8px;font-size:11px;color:#64748b;">รับ</th><th style="padding:8px;font-size:11px;color:#64748b;">เสร็จ</th></tr></thead>' +
        '<tbody>'+rows+'</tbody></table>'
    );
};

/* ─── Expose v4_nwShowNewNote on app so internal calls work ─── */
if (!window.app) { console.error('⚠️ window.app not ready — features-v4.js loaded before script.js'); window.app = {}; }
window.app.v4_nwShowNewNote = v4_nwShowNewNote;
window.v4_nwShowNewNote = v4_nwShowNewNote; // Expose directly to window for onclick handlers

})(); /* end IIFE */


/* NOTEWALL v4.7 support: tabs/archive helpers */
(function(){
    function ensureNW(){ var app=window.app; if(!app) return null; if(!app.state.noteWall) app.state.noteWall={notes:[],mode:'board'}; return app; }
    window.addEventListener('load', function(){ setTimeout(function(){ var app=ensureNW(); if(app) console.log('✅ NOTEWALL_V47_DIRECT_FEATURES_ACTIVE'); }, 500); });
    var oldInit = window.v4InitFeatures;
    // direct global helpers are attached lazily because app is created before/after this file depending cache
    setTimeout(function(){
        var app = ensureNW(); if(!app) return;
        app._nwSetMode = function(mode, cid){ if(!this.state.noteWall) this.state.noteWall={notes:[]}; this.state.noteWall.mode = (mode==='archive'?'archive':'board'); this.renderNoteWallContent(cid || 'notewall-container'); };
        app._nwArchiveSearch = function(v,cid){ if(!this.state.noteWall) this.state.noteWall={notes:[]}; this.state.noteWall.archiveSearch = v || ''; this.renderNoteWallContent(cid || 'notewall-container'); };
        app._nwArchiveClear = function(cid){ if(!this.state.noteWall) this.state.noteWall={notes:[]}; this.state.noteWall.archiveSearch=''; this.state.noteWall.archiveType='all'; this.state.noteWall.archiveStatus='all'; this.renderNoteWallContent(cid || 'notewall-container'); };
        app._nwSelectArchive = function(id,cid){ if(!this.state.noteWall) this.state.noteWall={notes:[]}; this.state.noteWall.archiveSelectedId=id; this.renderNoteWallContent(cid || 'notewall-container'); };
        app._nwArchiveFolder = function(k,cid){ if(!this.state.noteWall) this.state.noteWall={notes:[]}; if(k==='all'){this.state.noteWall.archiveType='all';this.state.noteWall.archiveStatus='all';} else if(k==='done'){this.state.noteWall.archiveType='all';this.state.noteWall.archiveStatus='done';} else if(k==='expired'){this.state.noteWall.archiveType='all';this.state.noteWall.archiveStatus='expired';} else {this.state.noteWall.archiveType=k;this.state.noteWall.archiveStatus='all';} this.renderNoteWallContent(cid || 'notewall-container'); };
        app._nwReopenNote = app._nwReopenNote || function(id,cid){ var notes=(this.state.noteWall&&this.state.noteWall.notes)||[]; var n=notes.find(function(x){return String(x.id)===String(id);}); if(!n) return; n.status='open'; n.deleted=false; n.closedAt=null; n.deletedAt=null; n.updatedAt=Date.now(); if(!Array.isArray(n.history)) n.history=[]; n.history.push({action:'reopen',by:(this._nwCurrentUser&&this._nwCurrentUser())||'user',time:new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}),note:'เปิดงานอีกครั้ง'}); try{ if(window.db) db.collection('noteWall').doc(String(id)).set(n).catch(console.error); }catch(e){} this.state.noteWall.mode='board'; this.renderNoteWallContent(cid || 'notewall-container'); };
    }, 800);
})();
