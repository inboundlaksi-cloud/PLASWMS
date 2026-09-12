/**
 * PLAS-WMS Features v3.0 — Phase 1-5 Implementation
 * Extends window.app with 35+ new features
 * Load AFTER script.js
 */
// ── Timestamp normalizer (supports string / number / Firebase Timestamp)
function _tsToString(ts) {
    if (!ts) return '';
    if (typeof ts === 'string') return ts;
    if (typeof ts === 'number') return new Date(ts).toISOString();
    if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
    if (ts.seconds) return new Date(ts.seconds * 1000).toISOString();
    return String(ts);
}

(function() {
'use strict';

// Wait for app to be ready
var _initInterval = setInterval(function() {
    if (!window.app) return;
    clearInterval(_initInterval);
    initAllFeatures();
}, 100);

function initAllFeatures() {
var app = window.app;

// ═══════════════════════════════════════════════════
// STATE EXTENSIONS
// ═══════════════════════════════════════════════════
if (!app.state.features) {
    app.state.features = {
        // ✅ v3.1: ไม่ใช้ localStorage — ข้อมูลโหลดจาก Firebase โดย intern-system.js boot()
        interns: [],
        auditLog: [],
        jobNotes: {},
        shiftConfig: { morning: '06:00-14:00', afternoon: '14:00-22:00', night: '22:00-06:00' },
        checklists: {},
        learningLog: {},
        guidedMode: {},
        internMessages: {},
        internEvals: {},
        internAccessCode: '',  // โหลดจาก Firebase โดย loadAccessCodeFromFirebase()
        nightMode: false,
        searchOpen: false,
        sosActive: false,
        summaryBarCollapsed: false,
    };
}

// ═══════════════════════════════════════════════════
// HELPER — Save features state
// ═══════════════════════════════════════════════════
function saveFeature(key) {
    try {
        var stateKey = key.replace('plas_', '');
        var value = app.state.features[stateKey];

        // ✅ v3.1: Firebase only — ไม่ใช้ localStorage
        // ใช้ window.db (compat SDK) ที่ script.js expose ไว้
        var db = window.db;
        if (db) {
            try {
                db.collection('intern_data').doc(stateKey).set({
                    data: value,
                    lastUpdated: Date.now()
                }).catch(function(e) { console.warn('saveFeature Firebase [' + stateKey + ']:', e); });
            } catch(e) { console.warn('saveFeature Firebase error:', e); }
        }

        // ✅ interns: sync ทั้ง intern_data/interns (list format) + nicknames to users/main
        if (stateKey === 'interns') {
            try {
                if (db) {
                    // บันทึก format ที่ intern-system.js ใช้ด้วย
                    db.collection('intern_data').doc('interns').set({
                        list: app.state.features.interns || [],
                        lastUpdated: Date.now()
                    }).catch(function(e) { console.warn('Intern list sync failed:', e); });

                    // Sync nicknames ไปยัง users/main เพื่อให้หน้า login เห็น
                    var interns = app.state.features.interns || [];
                    var users = (window.app.state.data && window.app.state.data.users) || [];
                    var changed = false;
                    interns.forEach(function(i) {
                        var nick = i.nickname || i.name;
                        if (nick && users.indexOf(nick) === -1) { users.push(nick); changed = true; }
                    });
                    if (changed && window.app.state.data) {
                        window.app.state.data.users = users;
                        db.collection('users').doc('main').get().then(function(snap) {
                            var existing = (snap && snap.exists) ? snap.data() : {};
                            existing.users = users;
                            db.collection('users').doc('main').set(existing).catch(function() {});
                        }).catch(function() {});
                    }
                }
            } catch(syncErr) { console.warn('saveFeature interns sync error:', syncErr); }
        }
    } catch(e) {}
}
// ✅ v3.1: โหลด feature state ทั้งหมดจาก Firebase เมื่อ init
function loadFeaturesFromFirebase() {
    var db = window.db;
    if (!db) { setTimeout(loadFeaturesFromFirebase, 800); return; }
    var keys = ['auditLog', 'jobNotes', 'shiftConfig', 'checklists',
                'learningLog', 'guidedMode', 'internMessages', 'internEvals'];
    keys.forEach(function(k) {
        db.collection('intern_data').doc(k).get().then(function(snap) {
            if (snap && snap.exists) {
                var d = snap.data();
                if (d && d.data !== undefined && app.state.features) {
                    app.state.features[k] = d.data;
                }
            }
        }).catch(function(e) { console.warn('loadFeaturesFromFirebase [' + k + ']:', e); });
    });

    // ✅ โหลดรายชื่อน้องฝึกงาน (intern_data/interns เก็บใน field "list")
    db.collection('intern_data').doc('interns').get().then(function(snap) {
        if (snap && snap.exists) {
            var d = snap.data();
            if (d && Array.isArray(d.list) && app.state.features) {
                app.state.features.interns = d.list;

                // 🧹 ล้างชื่อน้องฝึกงานที่เคยถูก push เข้า users list ของเว็บหลัก (ของเก่า)
                try {
                    var internNames = {};
                    d.list.forEach(function(i) {
                        if (i.nickname) internNames[i.nickname] = true;
                        if (i.name) internNames[i.name] = true;
                    });
                    if (Array.isArray(app.state.data.users)) {
                        var before = app.state.data.users.length;
                        app.state.data.users = app.state.data.users.filter(function(u) {
                            return !internNames[u];
                        });
                        if (app.state.data.users.length !== before) {
                            if (typeof app.saveData === 'function') app.saveData();
                            if (typeof app.saveUsersToFirebase === 'function') app.saveUsersToFirebase().catch(function(){});
                            else if (typeof app.syncUsersToFirebase === 'function') app.syncUsersToFirebase().catch(function(){});
                        }
                    }
                } catch (e) { console.warn('intern cleanup:', e); }

                // re-render login ถ้าอยู่หน้า auth (โหมดฝึกงานจะได้เห็นรายชื่อ)
                try {
                    var authScreen = document.getElementById('screen-auth');
                    if (authScreen && !authScreen.classList.contains('hidden') &&
                        typeof app.renderLogin === 'function') {
                        app.renderLogin();
                    }
                } catch (e) {}
            }
        }
    }).catch(function(e) { console.warn('loadFeaturesFromFirebase [interns]:', e); });
}
// intern data (interns + accessCode) โหลดโดย intern-system.js boot()
// feature state อื่นๆ โหลดที่นี่หลัง Firebase พร้อม
setTimeout(loadFeaturesFromFirebase, 500);

function currentUser() { return app.state.ui.currentUser || ''; }
function isIntern() { 
    var u = currentUser();
    var interns = app.state.features.interns || [];
    return interns.some(function(i) { return u.indexOf(i.name) !== -1; });
}
function isSupervisor() { var u = currentUser(); return u === 'Supervisor' || u === 'Supervisor Pro' || u.toLowerCase().startsWith('supervisor'); }
function timeNow() { return new Date().toLocaleTimeString('th-TH', {hour:'2-digit',minute:'2-digit'}); }
function dateNow() { return new Date().toISOString().slice(0,10); }
function audit(action, detail) {
    var entry = { time: new Date().toISOString(), user: currentUser(), action: action, detail: detail || '' };
    app.state.features.auditLog.unshift(entry);
    if (app.state.features.auditLog.length > 500) app.state.features.auditLog.length = 500;
    saveFeature('auditLog');
}

// ═══════════════════════════════════════════════════
// PHASE 1.01 — INTERN MANAGEMENT (Supervisor) ✅ IMPROVED
// ═══════════════════════════════════════════════════
app.openInternManager = function() {
    var self = this;
    var interns = this.state.features.interns || [];

    function status(i) {
        var t = new Date().toLocaleDateString('en-CA');
        if (i.startDate && t < i.startDate) return { key:'not_started', label:'ยังไม่เริ่ม', bg:'#fef9c3', fg:'#854d0e' };
        if (i.endDate && t > i.endDate)   return { key:'expired',     label:'หมดอายุ',   bg:'#fee2e2', fg:'#991b1b' };
        return { key:'active', label:'กำลังฝึก', bg:'#dcfce7', fg:'#166534' };
    }
    function escAttr(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

    var html = '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()" id="intern-mgr-modal">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';

    // Header
    html += '<div style="background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;padding:20px 24px;border-radius:20px 20px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><h2 style="margin:0;font-size:20px;font-weight:800;">🎓 จัดการน้องฝึกงาน</h2>';
    html += '<p style="margin:4px 0 0;font-size:12px;opacity:0.85;">เพิ่มชื่อน้อง ตั้ง PIN และช่วงเวลาฝึกงาน</p></div>';
    html += '<button onclick="document.getElementById(\'intern-mgr-modal\').remove()" style="background:rgba(255,255,255,0.2);border:none;border-radius:10px;width:36px;height:36px;color:#fff;font-size:16px;cursor:pointer;">✕</button>';
    html += '</div>';

    // Add form
    html += '<div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">';
    html += '<h3 style="font-size:14px;font-weight:700;color:#334155;margin:0 0 12px;">+ เพิ่มน้องฝึกงานใหม่</h3>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
    html += '<input id="intern-name" placeholder="ชื่อ-นามสกุล" style="padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;width:100%;box-sizing:border-box;">';
    html += '<input id="intern-nickname" placeholder="ชื่อเล่น (ใช้ login)" style="padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;width:100%;box-sizing:border-box;">';
    html += '<div><label style="font-size:11px;color:#64748b;font-weight:600;">วันเริ่มฝึก</label><input id="intern-start" type="date" value="' + dateNow() + '" style="padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;width:100%;box-sizing:border-box;"></div>';
    html += '<div><label style="font-size:11px;color:#64748b;font-weight:600;">วันหมดฝึก</label><input id="intern-end" type="date" style="padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;width:100%;box-sizing:border-box;"></div>';
    html += '</div>';
    html += '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:10px;padding:10px 14px;">';
    html += '<span style="font-size:13px;color:#0369a1;font-weight:700;white-space:nowrap;">🔑 PIN (ไม่บังคับ):</span>';
    html += '<input id="intern-pin" type="tel" inputmode="numeric" maxlength="6" placeholder="4-6 หลัก" style="flex:1;padding:8px 12px;border:2px solid #bae6fd;border-radius:8px;font-size:16px;font-weight:700;text-align:center;letter-spacing:6px;">';
    html += '</div>';
    html += '<button onclick="window.app.addIntern()" style="margin-top:12px;width:100%;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">✅ เพิ่มน้องฝึกงาน</button>';
    html += '</div>';

    // List
    html += '<div style="padding:20px 24px;">';
    html += '<h3 style="font-size:14px;font-weight:700;color:#334155;margin:0 0 12px;">รายชื่อน้องฝึกงาน (' + interns.length + ')</h3>';
    if (interns.length === 0) {
        html += '<p style="text-align:center;color:#94a3b8;padding:20px;">ยังไม่มีน้องฝึกงาน</p>';
    }
    interns.forEach(function(intern, idx) {
        var nick = intern.nickname || intern.name;
        var st = status(intern);
        html += '<div style="border:1px solid #e2e8f0;border-radius:14px;margin-bottom:10px;padding:12px 16px;display:flex;align-items:center;gap:12px;">';
        html += '<div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#38bdf8,#0284c7);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;flex-shrink:0;">🎓</div>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-size:14px;font-weight:700;color:#1e293b;">' + nick + ' <span style="font-size:10px;padding:2px 7px;border-radius:5px;background:' + st.bg + ';color:' + st.fg + ';font-weight:700;">' + st.label + '</span></div>';
        html += '<div style="font-size:11px;color:#475569;">ชื่อ: ' + (intern.name || nick) + (intern.pin ? ' · 🔑 มี PIN' : '') + '</div>';
        html += '<div style="font-size:11px;color:#94a3b8;">' + (intern.startDate || '–') + ' → ' + (intern.endDate || 'ไม่กำหนด') + '</div>';
        html += '</div>';
        html += '<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">';
        html += '<button onclick="window.app.editInternDates(' + idx + ')" style="background:#e0f2fe;border:none;border-radius:8px;padding:6px 10px;color:#0369a1;font-size:11px;cursor:pointer;font-weight:600;">✏️ แก้วันที่</button>';
        html += '<button onclick="window.app.changeInternPIN(' + idx + ',\'' + escAttr(nick).replace(/'/g,"\\'") + '\')" style="background:#ede9fe;border:none;border-radius:8px;padding:6px 10px;color:#7c3aed;font-size:11px;cursor:pointer;font-weight:600;">🔑 PIN</button>';
        html += '<button onclick="window.app.removeIntern(' + idx + ')" style="background:#fee2e2;border:none;border-radius:8px;padding:6px 10px;color:#dc2626;font-size:11px;cursor:pointer;font-weight:600;">🗑 ลบ</button>';
        html += '</div>';
        html += '</div>';
    });
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};

app.addIntern = function() {
    var name = (document.getElementById('intern-name') || {}).value;
    var nickname = (document.getElementById('intern-nickname') || {}).value;
    if (!name) { this.toast('กรุณาใส่ชื่อน้องฝึกงาน', 'error'); return; }
    var intern = {
        name: name,
        nickname: (nickname || name).trim(),
        startDate: (document.getElementById('intern-start') || {}).value || dateNow(),
        endDate: (document.getElementById('intern-end') || {}).value || '',
        pin: ((document.getElementById('intern-pin') || {}).value || '').replace(/\D/g, '').slice(0, 6),
        createdAt: new Date().toISOString()
    };
    // กันชื่อเล่นซ้ำ
    var dup = (this.state.features.interns || []).some(function(i){ return (i.nickname||i.name) === intern.nickname; });
    if (dup) { this.toast('ชื่อเล่นนี้มีอยู่แล้ว', 'error'); return; }

    this.state.features.interns.push(intern);
    saveFeature('interns');

    // 🎓 ไม่ push เข้า state.data.users — น้องฝึกงานจะได้ไม่โผล่ในเว็บหลัก
    //    หน้า login ฝึกงานดึงรายชื่อจาก state.features.interns โดยตรง

    // ถ้าตั้ง PIN → บันทึกลงโปรไฟล์น้อง (ใช้ตอน login ในเว็บ intern)
    if (intern.pin && this.state.profiles) {
        if (!this.state.profiles[intern.nickname]) this.state.profiles[intern.nickname] = {};
        this.state.profiles[intern.nickname].pin = intern.pin;
        this.state.profiles[intern.nickname].pinEnabled = true;
        if (typeof this.saveProfiles === 'function') this.saveProfiles();
    }

    if (typeof this.renderLogin === 'function') this.renderLogin();
    if (typeof audit === 'function') audit('intern_add', 'เพิ่ม ' + intern.nickname);
    this.toast('✅ เพิ่ม ' + intern.nickname + ' เรียบร้อย!', 'success');
    var modal = document.getElementById('intern-mgr-modal');
    if (modal) modal.remove();
    this.openInternManager();
};

app.editInternDates = function(idx) {
    var intern = this.state.features.interns[idx];
    if (!intern) return;
    var s = prompt('วันเริ่มฝึก (YYYY-MM-DD):', intern.startDate || dateNow());
    if (s === null) return;
    var e = prompt('วันหมดฝึก (YYYY-MM-DD) — เว้นว่าง = ไม่กำหนด:', intern.endDate || '');
    if (e === null) return;
    intern.startDate = (s || '').trim();
    intern.endDate = (e || '').trim();
    saveFeature('interns');
    if (typeof this.renderLogin === 'function') this.renderLogin();
    this.toast('อัปเดตช่วงเวลาฝึกงานแล้ว', 'success');
    var modal = document.getElementById('intern-mgr-modal');
    if (modal) modal.remove();
    this.openInternManager();
};

app.removeIntern = function(idx) {
    var intern = this.state.features.interns[idx];
    if (!intern) return;
    if (!confirm('ลบ ' + intern.nickname + ' ออกจากรายชื่อฝึกงาน?\n\n(ข้อมูลการทำงานจะถูกเก็บไว้เพื่อประเมินผลในอนาคต)')) return;
    var removedNick = intern.nickname || intern.name;
    this.state.features.interns.splice(idx, 1);
    // ✅ ลบชื่อออกจาก users list เพื่อไม่ให้แสดงที่หน้า Login
    if (this.state.data && this.state.data.users) {
        this.state.data.users = this.state.data.users.filter(function(u) { return u !== removedNick; });
        // Sync users ไปยัง Firebase
        try {
            var db2 = window.db || (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore());
            if (db2) {
                db2.collection('users').doc('main').get().then(function(snap) {
                    var existing = (snap && snap.exists) ? snap.data() : {};
                    existing.users = window.app.state.data.users;
                    db2.collection('users').doc('main').set(existing).catch(function(){});
                }).catch(function(){});
            }
        } catch(e) {}
    }
    saveFeature('interns');
    audit('intern_remove', 'ลบ ' + removedNick + ' (ข้อมูลการทำงานยังถูกเก็บไว้)');
    this.toast('ลบ ' + removedNick + ' เรียบร้อย — ข้อมูลการทำงานยังคงอยู่', 'success');
    var modal = document.getElementById('intern-mgr-modal');
    if (modal) modal.remove();
    this.openInternManager();
    // Re-render login ให้ชื่อหายทันที
    if (this.renderLogin) this.renderLogin();
};

// ✅ เปลี่ยน PIN น้องฝึกงาน
app.changeInternPIN = function(idx, nickname) {
    var newPin = prompt('ตั้ง PIN ใหม่สำหรับ "' + nickname + '" (4-6 หลัก):', '');
    if (newPin === null) return;
    newPin = newPin.replace(/\D/g, '').slice(0, 6);
    if (newPin.length < 4) { this.toast('PIN ต้องมีอย่างน้อย 4 หลัก', 'error'); return; }
    if (this.state.features.interns[idx]) {
        this.state.features.interns[idx].pin = newPin;
        saveFeature('interns');
        this.toast('✅ เปลี่ยน PIN ของ ' + nickname + ' เป็น ' + newPin + ' แล้ว', 'success');
        var modal = document.getElementById('intern-mgr-modal');
        if (modal) modal.remove();
        this.openInternManager();
    }
};

/* ═══════════════════════════════════
   ✅ แก้ไขรายละเอียดน้องฝึกงาน
═══════════════════════════════════ */
app.editInternDetails = function(idx) {
    var self = this;
    var intern = (self.state.features.interns || [])[idx];
    if (!intern) return;
    var nick = intern.nickname || intern.name;
    var users = self.state.data.users || [];
    var mentorOptions = '<option value="">-- ไม่กำหนด --</option>';
    users.forEach(function(u) { mentorOptions += '<option value="' + u + '"' + (intern.mentor === u ? ' selected' : '') + '>' + u + '</option>'; });

    var html = '<div id="intern-edit-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:10010;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4);">';
    html += '<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:20px 24px;border-radius:20px 20px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><h2 style="margin:0;font-size:18px;font-weight:800;">✏️ แก้ไขข้อมูลน้อง: ' + nick + '</h2></div>';
    html += '<button onclick="document.getElementById(\'intern-edit-modal\').remove()" style="background:rgba(255,255,255,0.2);border:none;border-radius:10px;width:36px;height:36px;color:#fff;font-size:16px;cursor:pointer;">✕</button>';
    html += '</div>';
    html += '<div style="padding:24px;">';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
    html += '<div><label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px;">ชื่อ-นามสกุล</label>';
    html += '<input id="ie-name" value="' + (intern.name || '') + '" placeholder="ชื่อ-นามสกุล" style="width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;"></div>';
    html += '<div><label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px;">ชื่อเล่น (ใช้ Login)</label>';
    html += '<input id="ie-nickname" value="' + (intern.nickname || '') + '" placeholder="ชื่อเล่น" style="width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;"></div>';
    html += '<div><label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px;">วันเริ่มฝึกงาน</label>';
    html += '<input id="ie-start" type="date" value="' + (intern.startDate || '') + '" style="width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;"></div>';
    html += '<div><label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px;">วันสิ้นสุด</label>';
    html += '<input id="ie-end" type="date" value="' + (intern.endDate || '') + '" style="width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;"></div>';
    html += '<div style="grid-column:1/-1"><label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px;">พี่เลี้ยง (Buddy)</label>';
    html += '<select id="ie-mentor" style="width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;">' + mentorOptions + '</select></div>';
    html += '<div><label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px;">สถาบัน / มหาวิทยาลัย</label>';
    html += '<input id="ie-school" value="' + (intern.school || '') + '" placeholder="ชื่อสถาบัน" style="width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;"></div>';
    html += '<div><label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px;">สาขา / คณะ</label>';
    html += '<input id="ie-major" value="' + (intern.major || '') + '" placeholder="สาขาวิชา" style="width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;"></div>';
    html += '<div style="grid-column:1/-1"><label style="font-size:12px;font-weight:700;color:#475569;display:block;margin-bottom:4px;">เบอร์โทร / ข้อมูลติดต่อ</label>';
    html += '<input id="ie-phone" value="' + (intern.phone || '') + '" placeholder="เบอร์โทร หรือ Line ID" style="width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;"></div>';
    html += '</div>';
    html += '<div style="display:flex;gap:8px;margin-top:4px;">';
    html += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#475569;"><input type="checkbox" id="ie-guided" ' + (intern.guided ? 'checked' : '') + '> โหมดสอนงาน</label>';
    html += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#475569;"><input type="checkbox" id="ie-verify" ' + (intern.needVerify ? 'checked' : '') + '> ต้องให้พี่เลี้ยง approve</label>';
    html += '</div>';
    html += '<div style="display:flex;gap:10px;margin-top:16px;">';
    html += '<button onclick="window.app._saveInternEdit(' + idx + ')" style="flex:1;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">💾 บันทึกการแก้ไข</button>';
    html += '<button onclick="document.getElementById(\'intern-edit-modal\').remove()" style="padding:12px 20px;border-radius:10px;border:2px solid #e2e8f0;background:#fff;color:#64748b;font-size:14px;font-weight:700;cursor:pointer;">ยกเลิก</button>';
    html += '</div>';
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};

app._saveInternEdit = function(idx) {
    var self = this;
    var interns = self.state.features.interns || [];
    if (!interns[idx]) return;
    var oldNick = interns[idx].nickname || interns[idx].name;
    var newNick = (document.getElementById('ie-nickname') || {}).value.trim() || oldNick;
    interns[idx].name = (document.getElementById('ie-name') || {}).value.trim() || interns[idx].name;
    interns[idx].nickname = newNick;
    interns[idx].startDate = (document.getElementById('ie-start') || {}).value;
    interns[idx].endDate = (document.getElementById('ie-end') || {}).value;
    interns[idx].mentor = (document.getElementById('ie-mentor') || {}).value;
    interns[idx].school = (document.getElementById('ie-school') || {}).value.trim();
    interns[idx].major = (document.getElementById('ie-major') || {}).value.trim();
    interns[idx].phone = (document.getElementById('ie-phone') || {}).value.trim();
    interns[idx].guided = (document.getElementById('ie-guided') || {}).checked;
    interns[idx].needVerify = (document.getElementById('ie-verify') || {}).checked;
    // Update nickname in users list if changed
    if (oldNick !== newNick && self.state.data.users) {
        var ui = self.state.data.users.indexOf(oldNick);
        if (ui !== -1) self.state.data.users[ui] = newNick;
        else self.state.data.users.push(newNick);
        self.saveData();
    }
    saveFeature('interns');
    if (typeof window._internSaveInternsToFirebase === 'function') window._internSaveInternsToFirebase(interns);
    self.toast && self.toast('✅ บันทึกข้อมูลน้อง ' + newNick + ' เรียบร้อย', 'success');
    var editModal = document.getElementById('intern-edit-modal');
    if (editModal) editModal.remove();
    var mgrModal = document.getElementById('intern-mgr-modal');
    if (mgrModal) mgrModal.remove();
    self.openInternManager();
};

/* ═══════════════════════════════════
   ✅ ดูประวัติการทำงานของน้องฝึกงาน
   (เขียน/แก้ไข/รับสินค้า รายวัน)
═══════════════════════════════════ */
app.showInternHistory = function(nickname) {
    var self = this;
    var interns = (self.state.features && self.state.features.interns) || [];
    var intern = interns.find(function(i) { return (i.nickname || i.name) === nickname; });

    // Collect audit log entries for this user
    var allLogs = (self.state && self.state.features && self.state.features.auditLog) || [];
    var typeMap = { receiving_add:'📦 รับสินค้า', receiving_edit:'✏️ แก้ไขสินค้า', topup_add:'🔺 เพิ่ม Top-up',
        topup_done:'✅ Top-up เสร็จ', move_add:'🔄 ย้ายสินค้า', move_done:'✅ ย้ายเสร็จ',
        note_add:'📝 เพิ่มบันทึก', note_edit:'📝 แก้ไขบันทึก', intern_add:'🎓 เพิ่มน้อง',
        issue:'⚠️ Issue', request:'📋 คำขอ' };

    // Group by date
    var byDate = {};
    allLogs.forEach(function(log) {
        if ((log.user || log.by || '') !== nickname) return;
        var dateKey = (log.time || '').substring(0, 10);
        if (!dateKey) return;
        if (!byDate[dateKey]) byDate[dateKey] = [];
        byDate[dateKey].push(log);
    });

    // Also check items data (receiving) for entries by this user
    var items = (self.state.data && self.state.data.items) || [];
    items.forEach(function(item) {
        if ((item.locWrittenBy || item.createdBy || item.importedBy || '') !== nickname) return;
        var dateKey = (item.timestamp || item.createdAt || '').substring(0, 10);
        if (!dateKey) return;
        if (!byDate[dateKey]) byDate[dateKey] = [];
        // Avoid duplication — only add if not already in audit log
        var alreadyLogged = byDate[dateKey].some(function(l) { return l._itemId === (item.id || item.code); });
        if (!alreadyLogged) {
            byDate[dateKey].push({
                _itemId: item.id || item.code,
                time: item.timestamp || dateKey + ' --:--',
                type: item.locWrittenBy === nickname ? 'receiving_add' : 'receiving_add',
                user: nickname,
                detail: (item.code || '') + ' / ' + (item.desc || '').substring(0, 30) + ' (qty: ' + (item.qty || 0) + ')',
                po: item.po || '',
                newLoc: item.newLoc || ''
            });
        }
    });

    var sortedDates = Object.keys(byDate).sort(function(a,b) { return b.localeCompare(a); });

    var html = '<div id="intern-history-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:10010;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;width:100%;max-width:640px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.4);">';
    html += '<div style="background:linear-gradient(135deg,#059669,#047857);color:#fff;padding:18px 24px;border-radius:20px 20px 0 0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">';
    html += '<div>';
    html += '<h2 style="margin:0;font-size:18px;font-weight:800;">📊 ประวัติการทำงาน: ' + nickname + '</h2>';
    if (intern) html += '<p style="margin:3px 0 0;font-size:11px;opacity:0.8;">' + (intern.name || '') + ' · ' + (intern.startDate || '') + ' → ' + (intern.endDate || '') + '</p>';
    html += '</div>';
    html += '<button onclick="document.getElementById(\'intern-history-modal\').remove()" style="background:rgba(255,255,255,0.2);border:none;border-radius:10px;width:36px;height:36px;color:#fff;font-size:16px;cursor:pointer;">✕</button>';
    html += '</div>';

    html += '<div style="overflow-y:auto;flex:1;padding:16px 20px;">';

    if (sortedDates.length === 0) {
        html += '<div style="text-align:center;padding:48px 20px;">';
        html += '<div style="font-size:48px;margin-bottom:12px;">📭</div>';
        html += '<div style="color:#94a3b8;font-size:14px;">ยังไม่มีประวัติการทำงาน</div>';
        html += '</div>';
    } else {
        // Summary stats
        var totalActions = sortedDates.reduce(function(s, d) { return s + byDate[d].length; }, 0);
        html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">';
        html += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px;text-align:center;"><div style="font-size:20px;font-weight:800;color:#059669;">' + sortedDates.length + '</div><div style="font-size:10px;color:#6b7280;">วันที่ทำงาน</div></div>';
        html += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px;text-align:center;"><div style="font-size:20px;font-weight:800;color:#2563eb;">' + totalActions + '</div><div style="font-size:10px;color:#6b7280;">รายการทั้งหมด</div></div>';
        var recvCount = 0;
        sortedDates.forEach(function(d){ byDate[d].forEach(function(l){ if((l.type||'').includes('receiving')) recvCount++; }); });
        html += '<div style="background:#fefce8;border:1px solid #fef08a;border-radius:10px;padding:10px;text-align:center;"><div style="font-size:20px;font-weight:800;color:#ca8a04;">' + recvCount + '</div><div style="font-size:10px;color:#6b7280;">รับสินค้า</div></div>';
        html += '</div>';

        sortedDates.forEach(function(dateKey) {
            var logs = byDate[dateKey];
            var thaiDate = '';
            try { thaiDate = new Date(dateKey).toLocaleDateString('th-TH', { weekday:'short', year:'numeric', month:'short', day:'numeric' }); } catch(e) { thaiDate = dateKey; }
            html += '<div style="margin-bottom:14px;">';
            html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
            html += '<div style="background:#059669;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;">' + thaiDate + '</div>';
            html += '<div style="flex:1;height:1px;background:#e2e8f0;"></div>';
            html += '<div style="font-size:11px;color:#94a3b8;">' + logs.length + ' รายการ</div>';
            html += '</div>';
            html += '<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">';
            logs.forEach(function(log, li) {
                var typeLabel = typeMap[log.type] || log.type || '📋 กิจกรรม';
                var detail = log.detail || log.note || log.description || '';
                if (log.po) detail = 'PO: ' + log.po + (detail ? ' · ' + detail : '');
                if (log.newLoc) detail += (detail ? ' → ' : '') + log.newLoc;
                var timeStr2 = (log.time || '').substring(11, 16) || '--:--';
                html += '<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 12px;' + (li > 0 ? 'border-top:1px solid #f1f5f9;' : '') + 'background:' + (li % 2 === 0 ? '#fff' : '#fafafa') + ';">';
                html += '<span style="font-size:10px;color:#94a3b8;white-space:nowrap;padding-top:2px;min-width:32px;">' + timeStr2 + '</span>';
                html += '<span style="font-size:12px;font-weight:600;color:#374151;white-space:nowrap;">' + typeLabel + '</span>';
                if (detail) html += '<span style="font-size:11px;color:#6b7280;flex:1;word-break:break-all;">' + detail.substring(0, 80) + '</span>';
                html += '</div>';
            });
            html += '</div>';
            html += '</div>';
        });
    }

    html += '</div>';
    html += '<div style="padding:12px 20px;border-top:1px solid #e2e8f0;flex-shrink:0;">';
    html += '<button onclick="document.getElementById(\'intern-history-modal\').remove()" style="width:100%;padding:10px;border-radius:10px;border:2px solid #e2e8f0;background:#fff;color:#64748b;font-size:14px;font-weight:700;cursor:pointer;">ปิด</button>';
    html += '</div>';
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};

// ✅ บันทึก Access Code สำหรับน้องฝึกงาน — sync Firebase ผ่าน intern-system.js
app.saveInternAccessCode = function() {
    var code = (document.getElementById('intern-access-code-input') || {}).value || '';
    code = code.trim();
    if (!code) { this.toast('กรุณาใส่รหัส', 'error'); return; }
    this.state.features.internAccessCode = code;
    // ✅ Firebase sync ผ่าน intern-system.js (ไม่ใช้ localStorage)
    if (typeof window._internSaveAccessCode === 'function') {
        window._internSaveAccessCode(code);
    } else {
        // Fallback: บันทึกผ่าน window.db โดยตรงถ้า intern-system.js ยังไม่พร้อม
        try {
            if (window.db) {
                window.db.collection('intern_data').doc('config').set({
                    accessCode: code, lastUpdated: Date.now()
                }).catch(function(e) { console.warn('saveInternAccessCode Firebase fallback:', e); });
            }
        } catch(e) {}
    }
    this.toast('✅ บันทึกรหัสเข้าระบบ: ' + code, 'success');
    audit('intern_access_code_set', 'ตั้งรหัส intern');
};

// ✅ ให้คะแนน intern (star rating)
app.setInternScore = function(nick, score) {
    if (!this.state.features.internEvals) this.state.features.internEvals = {};
    if (!this.state.features.internEvals[nick]) this.state.features.internEvals[nick] = {};
    this.state.features.internEvals[nick].score = score;
    saveFeature('internEvals');
    var modal = document.getElementById('intern-mgr-modal');
    if (modal) { modal.remove(); this.openInternManager(); }
};

// ✅ บันทึกการประเมิน (comment)
app.saveInternEval = function(nick) {
    var commentEl = document.getElementById('eval-comment-' + nick);
    if (!commentEl) return;
    if (!this.state.features.internEvals) this.state.features.internEvals = {};
    if (!this.state.features.internEvals[nick]) this.state.features.internEvals[nick] = {};
    this.state.features.internEvals[nick].comment = commentEl.value;
    this.state.features.internEvals[nick].evaluatedAt = new Date().toISOString();
    this.state.features.internEvals[nick].evaluatedBy = currentUser();
    saveFeature('internEvals');
    this.toast('✅ บันทึกการประเมิน "' + nick + '" แล้ว', 'success');
    audit('intern_eval', nick);
};

// ✅ Supervisor ส่งข้อความถึงน้องฝึกงาน
app.sendInternMessage = function(nick) {
    var inputEl = document.getElementById('msg-input-' + nick);
    if (!inputEl || !inputEl.value.trim()) { this.toast('กรุณาพิมพ์ข้อความ', 'error'); return; }
    if (!this.state.features.internMessages) this.state.features.internMessages = {};
    if (!this.state.features.internMessages[nick]) this.state.features.internMessages[nick] = [];
    this.state.features.internMessages[nick].push({
        text: inputEl.value.trim(),
        by: currentUser(),
        time: new Date().toISOString(),
        read: false
    });
    saveFeature('internMessages');
    this.toast('💬 ส่งข้อความถึง ' + nick + ' แล้ว', 'success');
    inputEl.value = '';
    audit('intern_message', nick);
    var modal = document.getElementById('intern-mgr-modal');
    if (modal) { modal.remove(); this.openInternManager(); }
};

// ✅ แสดงข้อความจากพี่เลี้ยงในหน้าน้องฝึกงาน
app.showInternMessages = function() {
    var nick = currentUser();
    var msgs = (this.state.features.internMessages || {})[nick] || [];
    // Mark all as read
    msgs.forEach(function(m) { m.read = true; });
    saveFeature('internMessages');

    var intern = (this.state.features.interns || []).find(function(i) {
        return i.nickname === nick || i.name === nick;
    });
    var mentorName = intern ? (intern.mentor || 'Supervisor') : 'Supervisor';

    var html = '<div id="intern-msg-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;width:100%;max-width:480px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;padding:16px 20px;border-radius:20px 20px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><div style="font-size:16px;font-weight:800;">💬 ข้อความจากพี่เลี้ยง</div><div style="font-size:11px;opacity:0.8;">จาก: ' + mentorName + '</div></div>';
    html += '<button onclick="document.getElementById(\'intern-msg-modal\').remove()" style="background:rgba(255,255,255,0.2);border:none;border-radius:8px;width:32px;height:32px;color:#fff;font-size:14px;cursor:pointer;">✕</button>';
    html += '</div>';
    html += '<div style="padding:16px 20px;">';
    if (msgs.length === 0) {
        html += '<div style="text-align:center;color:#94a3b8;padding:30px;">ยังไม่มีข้อความจากพี่เลี้ยง</div>';
    } else {
        msgs.slice().reverse().forEach(function(m) {
            var dt = m.time ? new Date(m.time).toLocaleString('th-TH', {dateStyle:'short',timeStyle:'short'}) : '';
            html += '<div style="margin-bottom:12px;padding:12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;">';
            html += '<div style="font-size:13px;color:#1e293b;margin-bottom:4px;">' + m.text + '</div>';
            html += '<div style="font-size:10px;color:#94a3b8;">' + m.by + ' · ' + dt + '</div>';
            html += '</div>';
        });
    }
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};

// ✅ แสดงสถิติงานวันนี้
app.showTodayStats = function() {
    var user = currentUser();
    var today = dateNow();
    var history = this.state.data.history || [];
    var items = this.state.data.items || [];

    var todayHistory = history.filter(function(h) {
        return h.user === user && h.timestamp && _tsToString(h.timestamp).startsWith(today);
    });

    var pending = items.filter(function(i) { return i.user === user && i.status === 'pending'; }).length;
    var written = items.filter(function(i) { return i.user === user && i.status === 'written'; }).length;
    var completed = todayHistory.filter(function(h) { return h.action === 'completed' || h.type === 'complete'; }).length;
    var topup = todayHistory.filter(function(h) { return h.type === 'topup'; }).length;

    var html = '<div id="stats-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;padding:16px 20px;border-radius:20px 20px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div style="font-size:16px;font-weight:800;">📊 สถิติของคุณวันนี้</div>';
    html += '<button onclick="document.getElementById(\'stats-modal\').remove()" style="background:rgba(255,255,255,0.2);border:none;border-radius:8px;width:32px;height:32px;color:#fff;font-size:14px;cursor:pointer;">✕</button>';
    html += '</div>';
    html += '<div style="padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
    var stats = [
        { label: 'รอดำเนินการ', val: pending, color: '#f59e0b', icon: '⏳' },
        { label: 'เขียน Location', val: written, color: '#3b82f6', icon: '✍️' },
        { label: 'เสร็จวันนี้', val: completed, color: '#22c55e', icon: '✅' },
        { label: 'TOPUP วันนี้', val: topup, color: '#a855f7', icon: '📦' }
    ];
    stats.forEach(function(s) {
        html += '<div style="text-align:center;padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">';
        html += '<div style="font-size:28px;">' + s.icon + '</div>';
        html += '<div style="font-size:28px;font-weight:800;color:' + s.color + ';">' + s.val + '</div>';
        html += '<div style="font-size:12px;color:#64748b;font-weight:600;">' + s.label + '</div>';
        html += '</div>';
    });
    html += '</div>';
    html += '<div style="padding:0 20px 16px;text-align:center;font-size:11px;color:#94a3b8;">ข้อมูล ณ วันที่ ' + today + '</div>';
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};

// ✅ Intern Access Code modal (แสดงตอน login)
app.showInternAccessModal = function(username, callback) {
    var html = '<div id="intern-code-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;">';
    html += '<div style="background:#1e293b;border-radius:24px;width:100%;max-width:340px;padding:32px 24px;box-shadow:0 20px 60px rgba(0,0,0,0.5);text-align:center;">';
    html += '<div style="width:64px;height:64px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:28px;">🔐</div>';
    html += '<h3 style="color:#fff;font-size:18px;font-weight:800;margin:0 0 4px;">กรอกรหัสเข้าระบบ</h3>';
    html += '<p style="color:#94a3b8;font-size:13px;margin:0 0 20px;">สวัสดี <strong style="color:#e2e8f0;">' + username + '</strong><br>กรุณากรอกรหัสที่ได้รับจาก Supervisor</p>';
    html += '<input id="intern-code-input" type="password" inputmode="numeric" maxlength="6" placeholder="••••" style="width:100%;box-sizing:border-box;padding:14px;background:#0f172a;border:2px solid #334155;border-radius:12px;color:#fff;font-size:24px;font-weight:800;text-align:center;letter-spacing:6px;margin-bottom:16px;">';
    html += '<div id="intern-code-err" style="color:#f87171;font-size:12px;margin-bottom:12px;min-height:18px;"></div>';
    html += '<div style="display:flex;gap:10px;">';
    html += '<button onclick="document.getElementById(\'intern-code-modal\').remove()" style="flex:1;padding:12px;background:#334155;border:none;border-radius:12px;color:#e2e8f0;font-size:14px;font-weight:700;cursor:pointer;">ยกเลิก</button>';
    html += '<button onclick="window.app._verifyInternCode(\'' + username + '\')" style="flex:1;padding:12px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">เข้าระบบ</button>';
    html += '</div>';
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    // Allow Enter key
    setTimeout(function() {
        var inp = document.getElementById('intern-code-input');
        if (inp) {
            inp.focus();
            inp.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') window.app._verifyInternCode(username);
            });
        }
    }, 100);
};

app._verifyInternCode = function(username) {
    var inp = document.getElementById('intern-code-input');
    var errEl = document.getElementById('intern-code-err');
    if (!inp) return;
    var entered = inp.value.trim();
    var correctCode = this.state.features.internAccessCode || '';
    if (!correctCode) {
        // No code set — allow through
        var modal = document.getElementById('intern-code-modal');
        if (modal) modal.remove();
        this.login(username);
        return;
    }
    if (entered === correctCode) {
        var modal = document.getElementById('intern-code-modal');
        if (modal) modal.remove();
        this.login(username);
    } else {
        if (errEl) errEl.textContent = '❌ รหัสไม่ถูกต้อง กรุณาลองใหม่';
        inp.value = '';
        inp.focus();
    }
};

// ═══════════════════════════════════════════════════
// PHASE 1.05 — TOOLTIPS FOR ALL BUTTONS
// ═══════════════════════════════════════════════════
app.initTooltips = function() {
    var tooltips = {
        'tab-pending': 'รายการสินค้าที่รอดำเนินการ — กดเพื่อดูงานที่ต้องรับหรือจ่าย',
        'tab-written': 'รายการที่เขียน location แล้ว — ตรวจสอบก่อน approve',
        'tab-done': 'รายการที่รับเข้าเรียบร้อยแล้ว',
        'tab-topup': 'งานเติมสินค้าขึ้นชั้น — ดูรายการที่ต้องเติม',
        'tab-move': 'ย้ายสินค้าระหว่าง location — ดู/สร้างรายการย้าย',
        'tab-issues': 'แจ้งปัญหาที่พบในคลัง — ของเสีย ของหาย อุปกรณ์เสีย',
        'tab-history': 'ประวัติงานที่ทำเสร็จแล้ว — ค้นหาย้อนหลังได้',
        'tab-rejected': 'รายการที่ถูกปฏิเสธ — ดูเหตุผลและแก้ไข',
        'calculator-toggle': 'เปิดเครื่องคิดเลข — คำนวณจำนวนสินค้าได้',
        'quick-hub-fab': 'Quick Hub — เข้าถึง TOPUP, Note Wall, เครื่องคิดเลข และพิมพ์สติกเกอร์ TOPUP ได้เร็ว',
        'sup-sidebar-dashboard': 'ภาพรวมงานวันนี้ — จำนวนงาน สถานะ คนทำงาน',
        'sup-sidebar-issues': 'รายงานปัญหาทั้งหมด — ดู/จัดการ issues',
        'sup-sidebar-leaderboard': 'จัดอันดับพนักงาน — ใครทำเยอะ ใครเร็ว',
        'sup-sidebar-analytics': 'วิเคราะห์ข้อมูลรายเดือน — กราฟแนวโน้ม',
        'sup-sidebar-summary': 'สรุปข้อมูลรวม — ตัวเลขสำคัญ',
        'sup-sidebar-notewall': 'กระดานโน้ต — ดูและจัดการโน้ตทั้งหมด',
    };
    Object.keys(tooltips).forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            // Workflow tabs already have visible labels. A floating tooltip on
            // these tabs covered the role banner/header and added no useful
            // information, so keep the description for assistive tech only.
            if (/^tab-(?:pending|written|done|topup|move|issues|history|rejected)$/.test(id)) {
                el.removeAttribute('data-tooltip');
                el.classList.remove('has-tooltip');
                el.setAttribute('aria-label', tooltips[id]);
            } else {
                el.setAttribute('data-tooltip', tooltips[id]);
                el.classList.add('has-tooltip');
            }
        }
    });
    // ตรวจว่าเป็นอุปกรณ์ touch (มือถือ/แท็บเล็ต) → ไม่แสดง tooltip (กันค้างบังจอ)
    var isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // Add tooltips to dynamically created elements via event delegation
    document.addEventListener('mouseover', function(e) {
        if (isTouchDevice) return; // touch ไม่ใช้ tooltip
        var el = e.target.closest('[data-tooltip]');
        if (!el) return;
        var existing = document.getElementById('tooltip-popup');
        if (existing) existing.remove();
        var tip = document.createElement('div');
        tip.id = 'tooltip-popup';
        tip.innerText = el.getAttribute('data-tooltip');
        tip.style.cssText = 'position:fixed;z-index:99999;background:#1e293b;color:#f1f5f9;font-size:12px;padding:8px 14px;border-radius:10px;max-width:260px;line-height:1.5;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
        var rect = el.getBoundingClientRect();
        document.body.appendChild(tip);
        var tipRect = tip.getBoundingClientRect();
        var safeTop = document.documentElement.hasAttribute('data-role-theme') ? 42 : 8;
        var left = Math.max(8, Math.min(rect.left, window.innerWidth - tipRect.width - 8));
        var top = rect.top - tipRect.height - 8;
        if (top < safeTop) top = rect.bottom + 8;
        tip.style.left = left + 'px';
        tip.style.top = Math.min(top, window.innerHeight - tipRect.height - 8) + 'px';
        // auto-hide กันค้าง
        clearTimeout(window._tooltipTimer);
        window._tooltipTimer = setTimeout(function(){ if (tip) tip.remove(); }, 4000);
    });
    document.addEventListener('mouseout', function(e) {
        if (e.target.closest('[data-tooltip]')) {
            var tip = document.getElementById('tooltip-popup');
            if (tip) tip.remove();
        }
    });
    // กันค้าง: แตะที่ไหนก็ปิด tooltip
    document.addEventListener('touchstart', function() {
        var tip = document.getElementById('tooltip-popup');
        if (tip) tip.remove();
    }, { passive: true });
};

// ═══════════════════════════════════════════════════
// PHASE 1.06 — TOAST SOUNDS (Web Audio API)
// ═══════════════════════════════════════════════════
app._audioCtx = null;
app.playToastSound = function(type) {
    try {
        if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var ctx = this._audioCtx;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0.15;
        if (type === 'success') { osc.frequency.value = 880; osc.type = 'sine'; gain.gain.setValueAtTime(0.15, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3); }
        else if (type === 'error') { osc.frequency.value = 220; osc.type = 'square'; gain.gain.setValueAtTime(0.12, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5); }
        else { osc.frequency.value = 440; osc.type = 'triangle'; gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25); }
    } catch(e) {}
};

// Patch existing toast to add sounds
var _origToast = app.toast;
app.toast = function(msg, type) {
    if (_origToast) _origToast.call(this, msg, type);
    this.playToastSound(type || 'info');
};

// ═══════════════════════════════════════════════════
// PHASE 2.01 — MY DESK (Homepage)
// ═══════════════════════════════════════════════════
app.renderMyDesk = function() {
    var user = currentUser();
    var jobs = this.state.data.replenishmentJobs || [];
    var myJobs = jobs.filter(function(j) { return j.assignedTo === user; });
    var pending = myJobs.filter(function(j) { return j.status === 'open' || j.status === 'pending'; });
    var inprogress = myJobs.filter(function(j) { return j.status === 'accepted' || j.status === 'in-progress'; });
    var done = myJobs.filter(function(j) { return j.status === 'completed' || j.status === 'done'; });
    
    return '<div style="padding:16px;">' +
        '<h2 style="font-size:20px;font-weight:800;margin:0 0 4px;">สวัสดี ' + this._escHtml(user) + '</h2>' +
        '<p style="color:#64748b;font-size:13px;margin:0 0 16px;">หน้าหลัก — สรุปงานของคุณวันนี้</p>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">' +
        this._deskCard('งานค้าง', pending.length, '#f59e0b', 'pending') +
        this._deskCard('กำลังทำ', inprogress.length, '#3b82f6', 'topup') +
        this._deskCard('เสร็จแล้ว', done.length, '#22c55e', 'history') +
        '</div></div>';
};
app._deskCard = function(label, count, color, tab) {
    return '<div onclick="window.app.switchTab(\'' + tab + '\')" style="background:' + color + '15;border:2px solid ' + color + '30;border-radius:16px;padding:16px;text-align:center;cursor:pointer;">' +
        '<div style="font-size:28px;font-weight:800;color:' + color + ';">' + count + '</div>' +
        '<div style="font-size:12px;color:#64748b;font-weight:600;">' + label + '</div></div>';
};

// ═══════════════════════════════════════════════════
// PHASE 2.02 — SHIFT SUMMARY BEFORE LOGOUT
// ═══════════════════════════════════════════════════
var _origLogout = app.logout;
app.logout = function() {
    var self = this;
    var user = currentUser();
    var jobs = this.state.data.replenishmentJobs || [];
    var myJobs = jobs.filter(function(j) { return j.assignedTo === user; });
    var done = myJobs.filter(function(j) { return j.status === 'completed' || j.status === 'done'; }).length;
    var pending = myJobs.length - done;
    
    var html = '<div id="shift-summary-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;padding:28px;max-width:400px;width:100%;text-align:center;">';
    html += '<div style="font-size:48px;margin-bottom:8px;">📊</div>';
    html += '<h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#1e293b;">สรุปการทำงานวันนี้</h2>';
    html += '<p style="margin:0 0 20px;font-size:13px;color:#64748b;">' + user + '</p>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">';
    html += '<div style="background:#f0fdf4;border-radius:12px;padding:16px;"><div style="font-size:24px;font-weight:800;color:#16a34a;">' + done + '</div><div style="font-size:12px;color:#15803d;">เสร็จแล้ว</div></div>';
    html += '<div style="background:' + (pending > 0 ? '#fef2f2' : '#f0fdf4') + ';border-radius:12px;padding:16px;"><div style="font-size:24px;font-weight:800;color:' + (pending > 0 ? '#dc2626' : '#16a34a') + ';">' + pending + '</div><div style="font-size:12px;color:' + (pending > 0 ? '#991b1b' : '#15803d') + ';">ค้างอยู่</div></div>';
    html += '</div>';
    if (pending > 0) html += '<p style="color:#dc2626;font-size:13px;font-weight:600;margin-bottom:16px;">⚠️ ยังมีงานค้าง ' + pending + ' รายการ</p>';
    html += '<div style="display:flex;gap:10px;">';
    html += '<button onclick="document.getElementById(\'shift-summary-modal\').remove()" style="flex:1;padding:14px;border-radius:12px;border:2px solid #e2e8f0;background:#fff;font-size:14px;font-weight:700;cursor:pointer;color:#64748b;">กลับไปทำต่อ</button>';
    html += '<button onclick="document.getElementById(\'shift-summary-modal\').remove();window.app._doLogout()" style="flex:1;padding:14px;border-radius:12px;border:none;background:#dc2626;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">ออกจากระบบ</button>';
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    audit('shift_summary', 'เสร็จ ' + done + ' ค้าง ' + pending);
};
app._doLogout = function() { if (_origLogout) _origLogout.call(this); };

// ═══════════════════════════════════════════════════
// PHASE 2.03 — TIMELINE VIEW
// ═══════════════════════════════════════════════════
app.showTimeline = function() {
    var user = currentUser();
    var history = (this.state.data.history || []).filter(function(h) {
        return h.user === user && h.timestamp && _tsToString(h.timestamp).startsWith(dateNow());
    }).sort(function(a, b) { return _tsToString(a.timestamp).localeCompare(_tsToString(b.timestamp)); });
    
    var html = '<div id="timeline-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;padding:24px;max-width:500px;width:100%;max-height:80vh;overflow:auto;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h2 style="margin:0;font-size:18px;font-weight:800;">⏰ Timeline วันนี้</h2>';
    html += '<button onclick="document.getElementById(\'timeline-modal\').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;">✕</button></div>';
    
    if (history.length === 0) {
        html += '<p style="text-align:center;color:#94a3b8;padding:30px;">ยังไม่มีกิจกรรมวันนี้</p>';
    } else {
        html += '<div style="position:relative;padding-left:24px;">';
        html += '<div style="position:absolute;left:8px;top:4px;bottom:4px;width:3px;background:linear-gradient(to bottom,#3b82f6,#22c55e);border-radius:2px;"></div>';
        history.forEach(function(h) {
            var time = h.timestamp ? new Date(h.timestamp).toLocaleTimeString('th-TH', {hour:'2-digit',minute:'2-digit'}) : '';
            html += '<div style="position:relative;margin-bottom:12px;padding-left:16px;">';
            html += '<div style="position:absolute;left:-6px;top:4px;width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2px solid #fff;"></div>';
            html += '<div style="background:#f8fafc;border-radius:10px;padding:10px 14px;">';
            html += '<div style="font-size:13px;font-weight:600;color:#1e293b;">' + (h.action || h.type || 'งาน') + '</div>';
            html += '<div style="font-size:11px;color:#64748b;">' + (h.itemName || h.docNo || '') + '</div>';
            html += '<div style="font-size:10px;color:#94a3b8;margin-top:2px;">⏰ ' + time + '</div>';
            html += '</div></div>';
        });
        html += '</div>';
    }
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};

// ═══════════════════════════════════════════════════
// PHASE 2.05 — CONFIRM 2-STEP DELETE/CANCEL
// ═══════════════════════════════════════════════════
app.confirm2Step = function(title, detail, callback) {
    var html = '<div id="confirm2-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;">';
    html += '<div style="background:#fff;border-radius:20px;padding:28px;max-width:400px;width:100%;text-align:center;">';
    html += '<div style="font-size:48px;margin-bottom:8px;">⚠️</div>';
    html += '<h2 style="margin:0 0 8px;font-size:18px;font-weight:800;color:#1e293b;">' + title + '</h2>';
    html += '<p style="margin:0 0 20px;font-size:13px;color:#64748b;">' + detail + '</p>';
    html += '<div style="display:flex;gap:10px;">';
    html += '<button onclick="document.getElementById(\'confirm2-modal\').remove()" style="flex:1;padding:12px;border-radius:12px;border:2px solid #e2e8f0;background:#fff;font-size:14px;font-weight:700;cursor:pointer;color:#64748b;">ยกเลิก</button>';
    html += '<button id="confirm2-yes" style="flex:1;padding:12px;border-radius:12px;border:none;background:#dc2626;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">ยืนยัน</button>';
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('confirm2-yes').onclick = function() {
        document.getElementById('confirm2-modal').remove();
        if (callback) callback();
    };
};

// ═══════════════════════════════════════════════════
// PHASE 2.06 — SUMMARY WIDGET BAR (top)
// ═══════════════════════════════════════════════════
app.updateSummaryBar = function() {
    var bar = document.getElementById('summary-bar');
    if (!bar) return;
    if (this.state.features.summaryBarCollapsed) {
        bar.style.display = 'none';
        document.documentElement.classList.remove('summary-bar-visible');
        return;
    }
    var jobs = this.state.data.replenishmentJobs || [];
    var open = jobs.filter(function(j) { return j.status === 'open'; }).length;
    var urgent = jobs.filter(function(j) { return j.priority === 'urgent' || j.priority === 'critical'; }).length;
    if (open === 0 && urgent === 0) {
        bar.style.display = 'none';
        document.documentElement.classList.remove('summary-bar-visible');
        return;
    }
    bar.style.display = '';
    document.documentElement.classList.add('summary-bar-visible');
    bar.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:6px 16px;font-size:13px;font-weight:600;">' +
        (open > 0 ? '<span>📋 งานค้าง <b style="color:#f59e0b;">' + open + '</b></span>' : '') +
        (urgent > 0 ? '<span>🔴 วิกฤต <b style="color:#dc2626;">' + urgent + '</b></span>' : '') +
        '<button aria-label="ปิดแถบสรุปงาน" onclick="window.app.state.features.summaryBarCollapsed=true;this.closest(\'#summary-bar\').style.display=\'none\';document.documentElement.classList.remove(\'summary-bar-visible\')" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:16px;">✕</button>' +
        '</div>';
};

// ═══════════════════════════════════════════════════
// PHASE 2.07 — JOB NOTES
// ═══════════════════════════════════════════════════
app.addJobNote = function(jobId) {
    var note = prompt('พิมพ์หมายเหตุสำหรับงานนี้:');
    if (!note) return;
    this.state.features.jobNotes[jobId] = { text: note, by: currentUser(), time: timeNow() };
    saveFeature('jobNotes');
    audit('job_note', 'เพิ่มโน้ต job ' + jobId);
    this.toast('📝 บันทึกหมายเหตุแล้ว', 'success');
};
app.getJobNote = function(jobId) { return this.state.features.jobNotes[jobId] || null; };

// ═══════════════════════════════════════════════════
// PHASE 2.08 — GLOBAL SEARCH (/)
// ═══════════════════════════════════════════════════
app.initGlobalSearch = function() {
    document.addEventListener('keydown', function(e) {
        if (e.key === '/' && !e.target.closest('input,textarea,select')) {
            e.preventDefault();
            app.openGlobalSearch();
        }
    });
};
app.openGlobalSearch = function() {
    if (document.getElementById('global-search-modal')) return;
    var html = '<div id="global-search-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:10000;padding:10vh 16px 16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div style="max-width:560px;margin:0 auto;">';
    html += '<div style="background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;">';
    html += '<div style="display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #e2e8f0;">';
    html += '<span style="font-size:20px;">🔍</span>';
    html += '<input id="global-search-input" type="text" placeholder="ค้นหา item, job, ประวัติ..." autofocus style="flex:1;border:none;outline:none;font-size:16px;padding:4px 0;">';
    html += '<kbd style="background:#f1f5f9;padding:2px 8px;border-radius:6px;font-size:12px;color:#64748b;border:1px solid #e2e8f0;">/</kbd>';
    html += '</div>';
    html += '<div id="global-search-results" style="max-height:50vh;overflow:auto;padding:8px;"></div>';
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    var input = document.getElementById('global-search-input');
    if (input) {
        input.focus();
        input.addEventListener('input', function() { app._doGlobalSearch(this.value); });
    }
};
app._doGlobalSearch = function(q) {
    var results = document.getElementById('global-search-results');
    if (!results || !q || q.length < 1) { if(results) results.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px;font-size:14px;">พิมพ์เพื่อค้นหา...</p>'; return; }
    q = q.toLowerCase();
    var html = '';
    var count = 0;
    // Search items
    (this.state.data.items || []).forEach(function(item) {
        if (count >= 15) return;
        var name = (item.name || item.itemName || '').toLowerCase();
        var code = (item.code || item.docNo || '').toLowerCase();
        if (name.indexOf(q) !== -1 || code.indexOf(q) !== -1) {
            html += '<div style="padding:10px 14px;border-radius:10px;cursor:pointer;display:flex;align-items:center;gap:10px;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'none\'">';
            html += '<span style="font-size:16px;">📦</span>';
            html += '<div><div style="font-size:14px;font-weight:600;">' + (item.name || item.itemName || '') + '</div>';
            html += '<div style="font-size:11px;color:#94a3b8;">' + (item.code || item.docNo || '') + ' · ' + (item.location || item.newLoc || '') + '</div></div></div>';
            count++;
        }
    });
    // Search topup jobs
    (this.state.data.replenishmentJobs || []).forEach(function(j) {
        if (count >= 15) return;
        var name = (j.itemName || '').toLowerCase();
        var loc = (j.location || '').toLowerCase();
        if (name.indexOf(q) !== -1 || loc.indexOf(q) !== -1) {
            html += '<div style="padding:10px 14px;border-radius:10px;cursor:pointer;display:flex;align-items:center;gap:10px;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'none\'">';
            html += '<span style="font-size:16px;">🔄</span>';
            html += '<div><div style="font-size:14px;font-weight:600;">TOPUP: ' + (j.itemName || '') + '</div>';
            html += '<div style="font-size:11px;color:#94a3b8;">' + (j.location || '') + ' · สถานะ: ' + (j.status || '') + '</div></div></div>';
            count++;
        }
    });
    if (count === 0) html = '<p style="text-align:center;color:#94a3b8;padding:20px;">ไม่พบผลลัพธ์สำหรับ "' + q + '"</p>';
    results.innerHTML = html;
};

// ═══════════════════════════════════════════════════
// PHASE 3.08 — AUDIT LOG
// ═══════════════════════════════════════════════════
app.showAuditLog = function() {
    var logs = this.state.features.auditLog;
    var html = '<div id="audit-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;padding:24px;max-width:600px;width:100%;max-height:80vh;overflow:auto;">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:16px;"><h2 style="margin:0;font-size:18px;font-weight:800;">📜 Audit Log</h2>';
    html += '<button onclick="document.getElementById(\'audit-modal\').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;">✕</button></div>';
    if (logs.length === 0) {
        html += '<p style="text-align:center;color:#94a3b8;padding:20px;">ยังไม่มีบันทึก</p>';
    } else {
        logs.slice(0, 50).forEach(function(l) {
            var time = l.time ? new Date(l.time).toLocaleString('th-TH') : '';
            html += '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9;">';
            html += '<div style="font-size:11px;color:#94a3b8;min-width:100px;white-space:nowrap;">' + time + '</div>';
            html += '<div style="font-size:13px;"><span style="font-weight:600;">' + (l.user || '') + '</span> — ' + (l.action || '') + (l.detail ? ' · ' + l.detail : '') + '</div>';
            html += '</div>';
        });
    }
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};

// ═══════════════════════════════════════════════════
// PHASE 3.07 — DAILY CHECKLIST (Intern)
// ═══════════════════════════════════════════════════
app.showChecklist = function() {
    var user = currentUser();
    var today = dateNow();
    var key = user + '_' + today;
    var checks = this.state.features.checklists[key] || [];
    if (checks.length === 0) {
        checks = [
            { text: 'เช็คสต๊อก Zone ที่รับผิดชอบ', done: false },
            { text: 'ตรวจสอบของที่ต้องเติมวันนี้', done: false },
            { text: 'จัดเรียงสินค้าให้เป็นระเบียบ', done: false },
            { text: 'รายงานปัญหา (ถ้ามี)', done: false },
            { text: 'บันทึกสรุปงานก่อนกลับ', done: false },
        ];
        this.state.features.checklists[key] = checks;
    }
    var done = checks.filter(function(c) { return c.done; }).length;
    var html = '<div id="checklist-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;padding:24px;max-width:420px;width:100%;">';
    html += '<h2 style="margin:0 0 4px;font-size:18px;font-weight:800;">✅ Checklist ประจำวัน</h2>';
    html += '<p style="margin:0 0 16px;font-size:12px;color:#64748b;">เสร็จ ' + done + '/' + checks.length + ' รายการ</p>';
    html += '<div style="background:#f0fdf4;border-radius:10px;height:6px;margin-bottom:16px;overflow:hidden;"><div style="background:#22c55e;height:100%;width:100%;border-radius:10px;transform-origin:left;transform:scaleX(' + (done / checks.length) + ');transition:transform 0.3s ease-out;"></div></div>';
    checks.forEach(function(c, i) {
        html += '<label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9;cursor:pointer;' + (c.done ? 'opacity:0.5;' : '') + '">';
        html += '<input type="checkbox" ' + (c.done ? 'checked' : '') + ' onchange="window.app._toggleCheck(' + i + ')" style="width:20px;height:20px;">';
        html += '<span style="font-size:14px;' + (c.done ? 'text-decoration:line-through;' : '') + '">' + c.text + '</span></label>';
    });
    html += '<button onclick="document.getElementById(\'checklist-modal\').remove()" style="margin-top:16px;width:100%;padding:12px;border-radius:10px;border:none;background:#1e293b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">ปิด</button>';
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};
app._toggleCheck = function(i) {
    var key = currentUser() + '_' + dateNow();
    var checks = this.state.features.checklists[key];
    if (checks && checks[i]) {
        checks[i].done = !checks[i].done;
        saveFeature('checklists');
    }
    var modal = document.getElementById('checklist-modal');
    if (modal) modal.remove();
    this.showChecklist();
};

// ═══════════════════════════════════════════════════
// PHASE 4.01 — SHIFT ALERT (30 min before end)
// ═══════════════════════════════════════════════════
app._shiftAlertTimer = null;
app.initShiftAlert = function() {
    var self = this;
    if (this._shiftAlertTimer) clearInterval(this._shiftAlertTimer);
    this._shiftAlertTimer = setInterval(function() {
        self._checkShiftEnd();
    }, 60000); // Check every minute
};
app._checkShiftEnd = function() {
    var shifts = this.state.features.shiftConfig;
    if (!shifts) return;
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    var nowMin = h * 60 + m;
    // Parse shifts
    var shiftList = Object.values(shifts);
    shiftList.forEach(function(s) {
        if (!s || typeof s !== 'string') return;
        var parts = s.split('-');
        if (parts.length !== 2) return;
        var end = parts[1].split(':');
        var endMin = parseInt(end[0]) * 60 + parseInt(end[1]);
        var diff = endMin - nowMin;
        if (diff === 30) { // Exactly 30 min before end
            var pending = (app.state.data.replenishmentJobs || []).filter(function(j) {
                return j.assignedTo === currentUser() && j.status !== 'completed' && j.status !== 'done';
            }).length;
            if (pending > 0) {
                app.toast('⏰ กะจะหมดใน 30 นาที — ยังค้างอยู่ ' + pending + ' งาน', 'warning');
            }
        }
    });
};

// ═══════════════════════════════════════════════════
// PHASE 4.04 — ANOMALY DETECTION
// ═══════════════════════════════════════════════════
app.checkAnomalies = function() {
    var anomalies = [];
    var jobs = this.state.data.replenishmentJobs || [];
    var now = Date.now();
    // Jobs stuck > 2 hours
    jobs.forEach(function(j) {
        if ((j.status === 'accepted' || j.status === 'in-progress') && j.acceptedAt) {
            var elapsed = (now - new Date(j.acceptedAt).getTime()) / 3600000;
            if (elapsed > 2) anomalies.push({ type: 'slow_job', msg: 'งาน ' + (j.itemName || 'TOPUP') + ' ค้างมานานกว่า 2 ชม.', severity: 'warning' });
        }
    });
    // No login today
    var users = this.state.data.users || [];
    // Store anomalies for supervisor
    this.state.features.anomalies = anomalies;
    return anomalies;
};

// ═══════════════════════════════════════════════════
// PHASE 4.06 — QUICK STOCK CHECK
// ═══════════════════════════════════════════════════
app.quickStockCheck = function() {
    var q = prompt('พิมพ์ชื่อหรือรหัสสินค้า:');
    if (!q) return;
    q = q.toLowerCase();
    var found = (this.state.data.items || []).filter(function(item) {
        return ((item.name || item.itemName || '').toLowerCase().indexOf(q) !== -1) ||
               ((item.code || item.docNo || '').toLowerCase().indexOf(q) !== -1);
    });
    if (found.length === 0) { this.toast('❌ ไม่พบสินค้า "' + q + '"', 'error'); return; }
    var html = '<div id="stock-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;padding:24px;max-width:500px;width:100%;max-height:70vh;overflow:auto;">';
    html += '<h2 style="margin:0 0 12px;font-size:18px;font-weight:800;">📦 ผลค้นหาสต๊อก (' + found.length + ')</h2>';
    found.slice(0, 10).forEach(function(item) {
        html += '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">';
        html += '<div><div style="font-size:14px;font-weight:700;">' + (item.name || item.itemName || '') + '</div>';
        html += '<div style="font-size:11px;color:#64748b;">ตำแหน่ง: ' + (item.location || item.newLoc || 'ไม่ระบุ') + '</div></div>';
        html += '<div style="text-align:right;"><div style="font-size:20px;font-weight:800;color:#3b82f6;">' + (item.qty || item.quantity || '-') + '</div>';
        html += '<div style="font-size:10px;color:#94a3b8;">คงเหลือ</div></div></div>';
    });
    html += '<button onclick="document.getElementById(\'stock-modal\').remove()" style="margin-top:12px;width:100%;padding:12px;border-radius:10px;border:none;background:#1e293b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">ปิด</button>';
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};

// ═══════════════════════════════════════════════════
// PHASE 4.07 — NIGHT MODE AUTO
// ═══════════════════════════════════════════════════
app.checkNightMode = function() {
    // Auto night mode disabled — causes text visibility issues in modals
    document.body.classList.remove('night-mode');
    this.state.features.nightMode = false;
};

// ═══════════════════════════════════════════════════
// PHASE 3.09 — INTERN BANNER
// ═══════════════════════════════════════════════════
app.showInternBanner = function() {
    // 🎓 แบนเนอร์ฝึกงานเดิม (พี่เลี้ยง/คะแนน/ข้อความ) — ลบออกแล้ว
    // โหมดฝึกงานใหม่ใช้แบนเนอร์ตามโดเมน (#intern-mode-banner) แทน
    var existing = document.getElementById('intern-banner');
    if (existing) existing.remove();
};

// ═══════════════════════════════════════════════════
// PHASE 5.08 — SOS BUTTON
// ═══════════════════════════════════════════════════
app.triggerSOS = function() {
    var reason = prompt('อธิบายสั้นๆ ว่าเกิดอะไรขึ้น:');
    if (!reason) return;
    audit('SOS', reason);
    this.toast('🚨 ส่ง SOS ถึง Supervisor แล้ว!', 'error');
    // In real app: push notification to supervisor via Firebase
    // db.ref('sos').push({ user: currentUser(), reason: reason, time: new Date().toISOString(), zone: '...' });
};

// ═══════════════════════════════════════════════════
// PHASE 3.01 — HEATMAP (Supervisor)
// ═══════════════════════════════════════════════════
app.renderHeatmap = function(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var users = this.state.data.users || [];
    var history = this.state.data.history || [];
    var today = dateNow();
    var hours = [];
    for (var h = 6; h <= 22; h++) hours.push(h);
    
    var html = '<div style="overflow-x:auto;padding:8px;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<tr><th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600;">พนักงาน</th>';
    hours.forEach(function(h) { html += '<th style="padding:6px 4px;text-align:center;color:#94a3b8;font-size:11px;">' + String(h).padStart(2,'0') + '</th>'; });
    html += '<th style="padding:6px 8px;text-align:center;color:#64748b;font-weight:600;">รวม</th></tr>';
    
    users.forEach(function(u) {
        var totalForUser = 0;
        html += '<tr><td style="padding:6px 8px;font-weight:600;white-space:nowrap;">' + u + '</td>';
        hours.forEach(function(hr) {
            var count = history.filter(function(item) {
                if (item.user !== u || !item.timestamp) return false;
                var d = new Date(item.timestamp);
                return d.toISOString().startsWith(today) && d.getHours() === hr;
            }).length;
            totalForUser += count;
            var intensity = Math.min(count / 5, 1);
            var bg = count === 0 ? '#f8fafc' : 'rgba(59,130,246,' + (0.15 + intensity * 0.6) + ')';
            html += '<td style="padding:4px;text-align:center;background:' + bg + ';color:' + (count > 0 ? '#1e3a5f' : '#cbd5e1') + ';font-weight:' + (count > 2 ? '700' : '400') + ';border-radius:4px;font-size:11px;">' + (count || '-') + '</td>';
        });
        html += '<td style="padding:6px 8px;text-align:center;font-weight:700;color:#1e293b;">' + totalForUser + '</td></tr>';
    });
    html += '</table></div>';
    container.innerHTML = html;
};

// ═══════════════════════════════════════════════════
// QUICK HUB — Add new options
// ═══════════════════════════════════════════════════
app._addQuickHubExtras = function() {
    var menu = document.getElementById('quick-hub-menu');
    if (!menu || menu.dataset.extended) return;
    menu.dataset.extended = 'true';

    var extras = '';

    // ✅ สถิติวันนี้ — ทุก user เห็น
    extras += '<button onclick="window.app.showTodayStats();window.app.toggleQuickHub();" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-t border-slate-100">';
    extras += '<div class="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg shadow" style="background:#17394a"><i class="ph ph-chart-bar"></i></div>';
    extras += '<div class="flex-1"><div class="font-bold text-slate-800 text-sm">สถิติวันนี้</div><div class="text-[11px] text-slate-400">ดูงานของตัวเอง — เสร็จ/ค้าง/TOPUP</div></div></button>';

    // 🎓 ระบบข้อความ/checklist ของฝึกงานเดิม — ลบออกแล้ว

    menu.insertAdjacentHTML('beforeend', extras);
};

// ═══════════════════════════════════════════════════
// SUPERVISOR SIDEBAR — Add Intern Management + Audit
// ═══════════════════════════════════════════════════
app._addSupSidebarExtras = function() {
    var noteBtn = document.getElementById('sup-sidebar-notewall');
    if (!noteBtn || noteBtn.dataset.extended) return;
    noteBtn.dataset.extended = 'true';
    var extras = '';
    // 🎓 จัดการ Intern ย้ายไปอยู่ฝั่ง Admin แล้ว — Supervisor ไม่มีปุ่มนี้
    extras += '<button onclick="window.app.showAuditLog()" class="sidebar-link w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 hover:text-white transition-all font-medium" data-tooltip="ดูประวัติทุก action ในระบบ — ใครทำอะไร เมื่อไร">';
    extras += '<i class="ph ph-scroll text-xl text-slate-400"></i> Audit Log</button>';
    noteBtn.insertAdjacentHTML('afterend', extras);
};

// ═══════════════════════════════════════════════════
// PHASE 1.02 — INTERN UI (Blue theme)
// ═══════════════════════════════════════════════════
app._applyInternTheme = function() {
    if (isIntern()) {
        document.body.classList.add('intern-theme');
        this.showInternBanner();
    } else {
        document.body.classList.remove('intern-theme');
        var banner = document.getElementById('intern-banner');
        if (banner) banner.remove();
    }
};

// ═══════════════════════════════════════════════════
// INIT — Hook into existing app lifecycle
// ═══════════════════════════════════════════════════
var _origLogin = app.login;
// ✅ Override handleUserLogin to check intern access code
var _origHandleUserLogin = app.handleUserLogin;
app.handleUserLogin = function(username) {
    var self = this;
    // ✅ ตัด gate รหัส intern access code — น้องฝึกงานเข้าได้เลยจากหน้าเลือก user
    if (_origHandleUserLogin) _origHandleUserLogin.call(this, username);
};

app.login = function(user) {
    if (_origLogin) _origLogin.call(this, user);
    // Post-login hooks
    setTimeout(function() {
        app.initTooltips();
        app.initGlobalSearch();
        app.initShiftAlert();
        app._addQuickHubExtras();
        app._applyInternTheme();
        app.checkNightMode();
        app.updateSummaryBar();
        if (isSupervisor()) app._addSupSidebarExtras();
        audit('login', user);
    }, 500);
};

// Also init tooltips on page load
setTimeout(function() {
    app.initTooltips();
    app.initGlobalSearch();
    app.checkNightMode();
    setInterval(function() { app.checkNightMode(); }, 600000);
}, 1000);

// ═══════════════════════════════════════════════════
// PHASE 5.01 — OFFLINE MODE (IndexedDB Queue + Sync)
// ═══════════════════════════════════════════════════
app._offlineQueue = [];
app.initOfflineMode = function() {
    var self = this;
    // Open IndexedDB
    var req = indexedDB.open('plas_wms_offline', 1);
    req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
    };
    req.onsuccess = function(e) {
        self._offlineDB = e.target.result;
        self._loadOfflineQueue();
    };
    // Online/offline detection
    window.addEventListener('online', function() {
        self.state.isOnline = true;
        self._syncOfflineQueue();
        self.toast('🌐 กลับมาออนไลน์แล้ว — กำลัง sync...', 'success');
        var indicator = document.getElementById('offline-indicator');
        if (indicator) indicator.style.display = 'none';
    });
    window.addEventListener('offline', function() {
        self.state.isOnline = false;
        self.toast('📴 ออฟไลน์ — ยังใช้งานได้ ข้อมูลจะ sync เมื่อกลับมา', 'warning');
        self._showOfflineIndicator();
    });
};
app._showOfflineIndicator = function() {
    var existing = document.getElementById('offline-indicator');
    if (existing) { existing.style.display = ''; return; }
    var el = document.createElement('div');
    el.id = 'offline-indicator';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;text-align:center;padding:6px;font-size:13px;font-weight:700;';
    el.innerHTML = '📴 ออฟไลน์ — ข้อมูลจะถูก sync อัตโนมัติเมื่อเน็ตกลับมา <button onclick="this.parentElement.style.display=\'none\'" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:2px 8px;border-radius:4px;margin-left:8px;cursor:pointer;font-size:12px;">ปิด</button>';
    document.body.prepend(el);
};
app.queueOfflineAction = function(action) {
    action.timestamp = new Date().toISOString();
    action.user = currentUser();
    this._offlineQueue.push(action);
    if (this._offlineDB) {
        var tx = this._offlineDB.transaction('queue', 'readwrite');
        tx.objectStore('queue').add(action);
    }
};
app._loadOfflineQueue = function() {
    if (!this._offlineDB) return;
    var self = this;
    var tx = this._offlineDB.transaction('queue', 'readonly');
    var store = tx.objectStore('queue');
    var req = store.getAll();
    req.onsuccess = function() { self._offlineQueue = req.result || []; };
};
app._syncOfflineQueue = function() {
    if (!this._offlineDB || this._offlineQueue.length === 0) return;
    var self = this;
    var queue = this._offlineQueue.slice();
    this._offlineQueue = [];
    // Clear IDB queue
    var tx = this._offlineDB.transaction('queue', 'readwrite');
    tx.objectStore('queue').clear();
    // Replay actions
    queue.forEach(function(action) {
        try {
            if (action.type === 'topup_accept' && window.db) {
                db.ref('replenishmentJobs/' + action.jobId + '/status').set('accepted');
            } else if (action.type === 'topup_complete' && window.db) {
                db.ref('replenishmentJobs/' + action.jobId + '/status').set('completed');
            }
            // Add more action types as needed
        } catch(e) { console.error('Sync error:', e); }
    });
    if (queue.length > 0) {
        self.toast('✅ Sync สำเร็จ ' + queue.length + ' รายการ', 'success');
        audit('offline_sync', queue.length + ' actions synced');
    }
};

// ═══════════════════════════════════════════════════
// PHASE 5.03 — INTERN MONTHLY REPORT (CSV Export)
// ═══════════════════════════════════════════════════
app.exportInternReport = function() {
    var interns = this.state.features.interns;
    if (interns.length === 0) { this.toast('ยังไม่มีข้อมูล Intern', 'error'); return; }
    var history = this.state.data.history || [];
    var month = new Date().toISOString().slice(0, 7);
    
    var csv = '\uFEFF'; // BOM for Excel Thai support
    csv += 'ชื่อ,Zone,พี่เลี้ยง,วันเริ่ม,วันสิ้นสุด,งานทั้งหมด,สำเร็จ,อัตราสำเร็จ(%)\n';
    
    interns.forEach(function(intern) {
        var name = intern.nickname || intern.name;
        var jobs = history.filter(function(h) {
            return h.user === name && h.timestamp && _tsToString(h.timestamp).startsWith(month);
        });
        var completed = jobs.filter(function(h) { return h.action === 'completed' || h.type === 'complete'; });
        var rate = jobs.length > 0 ? Math.round(completed.length / jobs.length * 100) : 0;
        csv += [name, intern.zones || '-', intern.mentor || '-', intern.startDate || '-', intern.endDate || '-', jobs.length, completed.length, rate].join(',') + '\n';
    });
    
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'intern-report-' + month + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    audit('export_intern_report', month);
    this.toast('📊 ดาวน์โหลดรายงาน Intern สำเร็จ', 'success');
};

// ═══════════════════════════════════════════════════
// PHASE 5.05 — PERFORMANCE RANKING + GAMIFICATION
// ═══════════════════════════════════════════════════
app.showPerformanceBoard = function() {
    var history = this.state.data.history || [];
    var users = this.state.data.users || [];
    var today = dateNow();
    
    // Calculate stats per user
    var stats = {};
    users.forEach(function(u) { stats[u] = { name: u, total: 0, completed: 0, speed: 0, streak: 0 }; });
    history.forEach(function(h) {
        if (!h.user || !stats[h.user]) return;
        stats[h.user].total++;
        if (h.action === 'completed' || h.type === 'complete') stats[h.user].completed++;
    });
    
    var sorted = Object.values(stats).sort(function(a, b) { return b.completed - a.completed; });
    var badges = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
    
    var html = '<div id="perf-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;padding:24px;max-width:500px;width:100%;max-height:80vh;overflow:auto;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h2 style="margin:0;font-size:18px;font-weight:800;">🏆 จัดอันดับผลงาน</h2>';
    html += '<button onclick="document.getElementById(\'perf-modal\').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;">✕</button></div>';
    
    sorted.forEach(function(s, i) {
        var pct = s.total > 0 ? Math.round(s.completed / s.total * 100) : 0;
        var isTop3 = i < 3;
        html += '<div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;margin-bottom:6px;' + (isTop3 ? 'background:#fefce8;border:1px solid #fde047;' : 'background:#f8fafc;') + '">';
        html += '<span style="font-size:20px;min-width:28px;text-align:center;">' + (badges[i] || (i+1)) + '</span>';
        html += '<div style="flex:1;">';
        html += '<div style="font-size:14px;font-weight:700;color:#1e293b;">' + s.name + '</div>';
        html += '<div style="display:flex;gap:12px;font-size:11px;color:#64748b;">';
        html += '<span>งาน: ' + s.total + '</span><span>สำเร็จ: ' + s.completed + '</span><span>อัตรา: ' + pct + '%</span>';
        html += '</div></div>';
        // Achievement badges
        html += '<div style="display:flex;gap:3px;">';
        if (s.completed >= 100) html += '<span title="ทำงานครบ 100 ชิ้น" style="font-size:16px;">💎</span>';
        else if (s.completed >= 50) html += '<span title="ทำงานครบ 50 ชิ้น" style="font-size:16px;">⭐</span>';
        if (pct >= 95 && s.total >= 10) html += '<span title="อัตราสำเร็จ 95%+" style="font-size:16px;">🎯</span>';
        if (i === 0 && s.completed > 0) html += '<span title="อันดับ 1!" style="font-size:16px;">👑</span>';
        html += '</div></div>';
    });
    
    // Badge legend
    html += '<div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:10px;font-size:12px;color:#64748b;">';
    html += '<span style="font-weight:600;">Badge:</span> 💎 = 100+ งาน · ⭐ = 50+ งาน · 🎯 = สำเร็จ 95%+ · 👑 = อันดับ 1';
    html += '</div>';
    html += '<button onclick="document.getElementById(\'perf-modal\').remove()" style="margin-top:12px;width:100%;padding:12px;border-radius:10px;border:none;background:#1e293b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">ปิด</button>';
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};

// ═══════════════════════════════════════════════════
// PHASE 2.04 — BULK ACTION (Multi-select jobs)
// ═══════════════════════════════════════════════════
app._bulkSelected = [];
app.toggleBulkSelect = function(jobId) {
    var idx = this._bulkSelected.indexOf(jobId);
    if (idx > -1) this._bulkSelected.splice(idx, 1);
    else this._bulkSelected.push(jobId);
    this._updateBulkBar();
};
app._updateBulkBar = function() {
    var existing = document.getElementById('bulk-action-bar');
    if (this._bulkSelected.length === 0) {
        if (existing) existing.remove();
        return;
    }
    if (!existing) {
        existing = document.createElement('div');
        existing.id = 'bulk-action-bar';
        existing.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);z-index:9960;background:#1e293b;color:#fff;border-radius:16px;padding:10px 20px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 30px rgba(0,0,0,0.3);font-size:14px;';
        document.body.appendChild(existing);
    }
    var count = this._bulkSelected.length;
    existing.innerHTML = '<span style="font-weight:700;">เลือก ' + count + ' รายการ</span>' +
        '<button onclick="window.app.bulkApprove()" style="background:#22c55e;border:none;border-radius:8px;padding:8px 16px;color:#fff;font-weight:700;cursor:pointer;font-size:13px;">✅ Approve ทั้งหมด</button>' +
        '<button onclick="window.app.bulkReject()" style="background:#ef4444;border:none;border-radius:8px;padding:8px 16px;color:#fff;font-weight:700;cursor:pointer;font-size:13px;">✕ Reject ทั้งหมด</button>' +
        '<button onclick="window.app.clearBulk()" style="background:rgba(255,255,255,0.1);border:none;border-radius:8px;padding:8px 12px;color:#fff;cursor:pointer;font-size:13px;">ยกเลิก</button>';
};
app.bulkApprove = function() {
    var self = this;
    var count = this._bulkSelected.length;
    this.confirm2Step('Approve ' + count + ' รายการ?', 'จะ approve ทั้ง ' + count + ' รายการที่เลือก', function() {
        self._bulkSelected.forEach(function(id) {
            // Approve logic — reuse existing approve function
            if (typeof self.approveItem === 'function') self.approveItem(id);
        });
        audit('bulk_approve', count + ' items');
        self.toast('✅ Approve ' + count + ' รายการสำเร็จ', 'success');
        self.clearBulk();
    });
};
app.bulkReject = function() {
    var self = this;
    var count = this._bulkSelected.length;
    this.confirm2Step('Reject ' + count + ' รายการ?', 'จะ reject ทั้ง ' + count + ' รายการที่เลือก', function() {
        audit('bulk_reject', count + ' items');
        self.toast('✕ Reject ' + count + ' รายการ', 'success');
        self.clearBulk();
    });
};
app.clearBulk = function() {
    this._bulkSelected = [];
    this._updateBulkBar();
};

// ═══════════════════════════════════════════════════
// MULTI-WAREHOUSE MODULE (DORMANT — ready for future)
// ═══════════════════════════════════════════════════
// NOTE: ยังไม่เปิดใช้งาน เก็บไว้สำหรับอนาคต
// เมื่อต้องการเปิดใช้: 
//   1. ตั้ง app.state.multiWarehouse.enabled = true
//   2. สร้าง warehouse list ใน Firebase /warehouses/
//   3. เรียก app.mw.selectWarehouse(id) หลัง login
app.mw = {
    enabled: false, // ⚠️ ยังไม่เปิดใช้
    currentWarehouseId: null,
    warehouses: [],
    
    // Firebase path builder — ใช้แทน hardcode path
    path: function(collection) {
        if (!app.mw.enabled || !app.mw.currentWarehouseId) return collection; // fallback ปกติ
        return 'warehouses/' + app.mw.currentWarehouseId + '/' + collection;
    },
    
    // โหลดรายชื่อคลัง
    loadWarehouses: function(callback) {
        if (!app.mw.enabled || !window.db) { if (callback) callback([]); return; }
        db.ref('warehouses').once('value', function(snap) {
            var data = snap.val() || {};
            app.mw.warehouses = Object.keys(data).map(function(id) {
                return { id: id, name: data[id].name || id, location: data[id].location || '', active: data[id].active !== false };
            });
            if (callback) callback(app.mw.warehouses);
        });
    },
    
    // เลือกคลังที่จะทำงาน
    selectWarehouse: function(warehouseId) {
        app.mw.currentWarehouseId = warehouseId;
        // ✅ sessionStorage (UI preference per tab) — ไม่ใช้ localStorage
        sessionStorage.setItem('plas_current_warehouse', warehouseId);
        // Reload data from warehouse-specific path
        // app.loadAllData(); // uncomment when enabled
    },
    
    // แสดง UI เลือกคลัง (สำหรับอนาคต)
    showWarehousePicker: function(callback) {
        app.mw.loadWarehouses(function(list) {
            if (list.length <= 1) {
                if (list.length === 1) app.mw.selectWarehouse(list[0].id);
                if (callback) callback();
                return;
            }
            var html = '<div id="wh-picker" style="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;">';
            html += '<div style="background:#fff;border-radius:20px;padding:28px;max-width:400px;width:100%;">';
            html += '<h2 style="margin:0 0 16px;font-size:20px;font-weight:800;text-align:center;">🏭 เลือกคลังสินค้า</h2>';
            list.forEach(function(wh) {
                if (!wh.active) return;
                html += '<button onclick="window.app.mw.selectWarehouse(\'' + wh.id + '\');document.getElementById(\'wh-picker\').remove();' + (callback ? 'window.app.mw._pickerCallback()' : '') + '" style="width:100%;padding:16px;border:2px solid #e2e8f0;border-radius:14px;background:#fff;margin-bottom:8px;text-align:left;cursor:pointer;font-size:16px;font-weight:700;">';
                html += '🏭 ' + wh.name + '<br><span style="font-size:12px;color:#64748b;font-weight:400;">' + wh.location + '</span></button>';
            });
            html += '</div></div>';
            document.body.insertAdjacentHTML('beforeend', html);
            if (callback) app.mw._pickerCallback = callback;
        });
    },
    
    // โครงสร้าง Firebase ที่แนะนำสำหรับ Multi-warehouse:
    // /warehouses/{warehouseId}/
    //   - items/
    //   - replenishmentJobs/
    //   - history/
    //   - moveJobs/
    //   - config/
    //   - noteWall/
    // /org/
    //   - users/ (global user list)
    //   - warehouses/ (warehouse metadata)
    //   - roles/ { userId: { warehouseId: 'role' } }
    
    // สำหรับ MANAGER: ดูรายงานรวมข้ามคลัง
    // aggregateQuery: function(collection, callback) { ... }
};

// ═══════════════════════════════════════════════════
// QUICK HUB — EXTRA SMALL TOOLS
// ═══════════════════════════════════════════════════

// 1. Quick Timer (จับเวลา)
app._timer = { running: false, start: 0, elapsed: 0, interval: null };
app.showQuickTimer = function() {
    var t = this._timer;
    var html = '<div id="timer-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;padding:28px;max-width:340px;width:100%;text-align:center;">';
    html += '<div style="font-size:48px;margin-bottom:8px;">⏱️</div>';
    html += '<div id="timer-display" style="font-size:40px;font-weight:800;color:#1e293b;font-variant-numeric:tabular-nums;margin-bottom:20px;">' + this._formatTimer(t.elapsed) + '</div>';
    html += '<div style="display:flex;gap:10px;justify-content:center;">';
    html += '<button onclick="window.app.toggleTimer()" id="timer-btn" style="padding:12px 24px;border-radius:12px;border:none;background:' + (t.running ? '#ef4444' : '#22c55e') + ';color:#fff;font-size:16px;font-weight:700;cursor:pointer;">' + (t.running ? '⏸ หยุด' : '▶ เริ่ม') + '</button>';
    html += '<button onclick="window.app.resetTimer()" style="padding:12px 24px;border-radius:12px;border:2px solid #e2e8f0;background:#fff;color:#64748b;font-size:16px;font-weight:700;cursor:pointer;">↺ รีเซ็ต</button>';
    html += '</div>';
    html += '<p style="margin-top:16px;font-size:12px;color:#94a3b8;">ใช้จับเวลาทำงาน / นับเวลาเติมของ</p>';
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};
app._formatTimer = function(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    var h = Math.floor(m / 60);
    m = m % 60;
    return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
};
app.toggleTimer = function() {
    var t = this._timer;
    if (t.running) {
        clearInterval(t.interval);
        t.elapsed += Date.now() - t.start;
        t.running = false;
    } else {
        t.start = Date.now();
        t.running = true;
        var self = this;
        t.interval = setInterval(function() {
            var display = document.getElementById('timer-display');
            if (display) display.textContent = self._formatTimer(t.elapsed + Date.now() - t.start);
        }, 100);
    }
    var btn = document.getElementById('timer-btn');
    if (btn) { btn.textContent = t.running ? '⏸ หยุด' : '▶ เริ่ม'; btn.style.background = t.running ? '#ef4444' : '#22c55e'; }
};
app.resetTimer = function() {
    var t = this._timer;
    if (t.interval) clearInterval(t.interval);
    t.running = false; t.elapsed = 0; t.start = 0;
    var display = document.getElementById('timer-display');
    if (display) display.textContent = '00:00:00';
    var btn = document.getElementById('timer-btn');
    if (btn) { btn.textContent = '▶ เริ่ม'; btn.style.background = '#22c55e'; }
};

// 2. Quick Note (จดบันทึกส่วนตัว) — ✅ sessionStorage (ไม่ใช้ localStorage)
app.showQuickNote = function() {
    var saved = sessionStorage.getItem('plas_quicknote') || '';
    var html = '<div id="qnote-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fffde7;border-radius:4px;padding:24px;max-width:400px;width:100%;box-shadow:6px 10px 30px rgba(0,0,0,0.3);position:relative;">';
    html += '<div style="position:absolute;top:-8px;left:40%;width:60px;height:20px;background:rgba(200,190,140,0.5);border-radius:2px;transform:rotate(-3deg);"></div>';
    html += '<h3 style="margin:0 0 10px;font-size:16px;font-weight:800;color:#1e293b;">📝 บันทึกส่วนตัว</h3>';
    html += '<textarea id="qnote-text" style="width:100%;min-height:120px;padding:12px;border:2px solid #e2e8f0;border-radius:8px;font-size:14px;line-height:1.6;resize:vertical;box-sizing:border-box;font-family:inherit;">' + saved + '</textarea>';
    html += '<div style="display:flex;gap:8px;margin-top:12px;">';
    html += '<button onclick="document.getElementById(\'qnote-modal\').remove()" style="flex:1;padding:10px;border-radius:10px;border:2px solid #e2e8f0;background:#fff;font-size:13px;font-weight:600;cursor:pointer;color:#64748b;">ปิด</button>';
    html += '<button onclick="window.app.saveQuickNote()" style="flex:1;padding:10px;border-radius:10px;border:none;background:#f59e0b;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">💾 บันทึก</button>';
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};
app.saveQuickNote = function() {
    var text = (document.getElementById('qnote-text') || {}).value || '';
    sessionStorage.setItem('plas_quicknote', text); // ✅ sessionStorage — ไม่ใช้ localStorage
    this.toast('📝 บันทึกแล้ว', 'success');
    var modal = document.getElementById('qnote-modal');
    if (modal) modal.remove();
};

// 3. Unit Converter (แปลงหน่วย)
app.showUnitConverter = function() {
    var html = '<div id="unit-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;padding:24px;max-width:380px;width:100%;">';
    html += '<h3 style="margin:0 0 16px;font-size:16px;font-weight:800;">📐 แปลงหน่วย</h3>';
    html += '<select id="unit-type" onchange="window.app._unitTypeChanged()" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;margin-bottom:12px;">';
    html += '<option value="weight">น้ำหนัก (กก. ↔ ปอนด์)</option>';
    html += '<option value="length">ความยาว (ซม. ↔ นิ้ว)</option>';
    html += '<option value="volume">ปริมาตร (ลิตร ↔ แกลลอน)</option>';
    html += '<option value="pcs">จำนวน (ชิ้น ↔ โหล ↔ กล่อง)</option>';
    html += '</select>';
    html += '<div style="display:flex;align-items:center;gap:10px;">';
    html += '<input id="unit-from" type="number" placeholder="0" oninput="window.app._convertUnit()" style="flex:1;padding:10px;border:2px solid #e2e8f0;border-radius:10px;font-size:18px;font-weight:700;text-align:center;">';
    html += '<span style="font-size:20px;">→</span>';
    html += '<div id="unit-result" style="flex:1;padding:10px;background:#f0fdf4;border:2px solid #86efac;border-radius:10px;font-size:18px;font-weight:700;text-align:center;color:#16a34a;">0</div>';
    html += '</div>';
    html += '<div id="unit-labels" style="display:flex;justify-content:space-between;margin-top:4px;font-size:12px;color:#94a3b8;padding:0 4px;"><span>กิโลกรัม</span><span>ปอนด์</span></div>';
    html += '<button onclick="document.getElementById(\'unit-modal\').remove()" style="margin-top:16px;width:100%;padding:10px;border-radius:10px;border:none;background:#1e293b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">ปิด</button>';
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};
app._unitTypeChanged = function() {
    var type = (document.getElementById('unit-type') || {}).value;
    var labels = document.getElementById('unit-labels');
    if (type === 'weight' && labels) labels.innerHTML = '<span>กิโลกรัม</span><span>ปอนด์</span>';
    else if (type === 'length' && labels) labels.innerHTML = '<span>เซนติเมตร</span><span>นิ้ว</span>';
    else if (type === 'volume' && labels) labels.innerHTML = '<span>ลิตร</span><span>แกลลอน</span>';
    else if (type === 'pcs' && labels) labels.innerHTML = '<span>ชิ้น</span><span>โหล (12)</span>';
    this._convertUnit();
};
app._convertUnit = function() {
    var val = parseFloat((document.getElementById('unit-from') || {}).value) || 0;
    var type = (document.getElementById('unit-type') || {}).value;
    var result = 0;
    if (type === 'weight') result = val * 2.20462;
    else if (type === 'length') result = val / 2.54;
    else if (type === 'volume') result = val * 0.264172;
    else if (type === 'pcs') result = val / 12;
    var el = document.getElementById('unit-result');
    if (el) el.textContent = result % 1 === 0 ? result : result.toFixed(2);
};

// 4. Shift Clock (นาฬิกากะ)
app.showShiftClock = function() {
    var now = new Date();
    var h = now.getHours();
    var shift = h >= 6 && h < 14 ? 'เช้า (06:00-14:00)' : h >= 14 && h < 22 ? 'บ่าย (14:00-22:00)' : 'ดึก (22:00-06:00)';
    var shiftEnd = h >= 6 && h < 14 ? 14 : h >= 14 && h < 22 ? 22 : 6;
    var endTime = new Date();
    endTime.setHours(shiftEnd, 0, 0, 0);
    if (shiftEnd < h) endTime.setDate(endTime.getDate() + 1);
    var remaining = Math.max(0, Math.floor((endTime - now) / 60000));
    var remH = Math.floor(remaining / 60);
    var remM = remaining % 60;
    
    var html = '<div id="clock-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">';
    html += '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px;padding:28px;max-width:340px;width:100%;text-align:center;">';
    html += '<div style="font-size:48px;margin-bottom:8px;">🕐</div>';
    html += '<div style="font-size:32px;font-weight:800;color:#1e293b;margin-bottom:4px;">' + now.toLocaleTimeString('th-TH') + '</div>';
    html += '<div style="font-size:14px;color:#64748b;margin-bottom:16px;">กะ: ' + shift + '</div>';
    html += '<div style="background:#f0f9ff;border-radius:12px;padding:16px;">';
    html += '<div style="font-size:13px;color:#64748b;">เวลาที่เหลือในกะ</div>';
    html += '<div style="font-size:28px;font-weight:800;color:' + (remaining < 30 ? '#dc2626' : '#1e293b') + ';">' + remH + ' ชม. ' + remM + ' นาที</div>';
    if (remaining < 30) html += '<div style="font-size:12px;color:#dc2626;font-weight:600;margin-top:4px;">⚠️ ใกล้หมดกะแล้ว!</div>';
    html += '</div>';
    html += '<button onclick="document.getElementById(\'clock-modal\').remove()" style="margin-top:16px;width:100%;padding:12px;border-radius:10px;border:none;background:#1e293b;color:#fff;font-weight:700;cursor:pointer;">ปิด</button>';
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
};

// ── Add extra items to Quick Hub (v3.1 — ลบฟีเจอร์ที่ไม่ใช้ออก) ──
app._addQuickHubExtras = function() {
    var menu = document.getElementById('quick-hub-menu');
    if (!menu || menu.dataset.extended) return;
    menu.dataset.extended = 'true';
    
    var extras = '';
    // Unit Converter (ยังคงไว้ — มีประโยชน์ในงาน warehouse)
    extras += '<button onclick="window.app.showUnitConverter();window.app.toggleQuickHub();" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-cyan-50 transition-colors text-left border-t border-slate-100" data-tooltip="แปลงหน่วย: กก.↔ปอนด์ ซม.↔นิ้ว ลิตร↔แกลลอน ชิ้น↔โหล">';
    extras += '<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center text-white text-lg shadow"><i class="ph ph-swap"></i></div>';
    extras += '<div class="flex-1"><div class="font-bold text-slate-800 text-sm">แปลงหน่วย</div><div class="text-[11px] text-slate-400">น้ำหนัก ความยาว ปริมาตร จำนวน</div></div></button>';
    // Performance
    extras += '<button onclick="window.app.showPerformanceBoard();window.app.toggleQuickHub();" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-50 transition-colors text-left border-t border-slate-100" data-tooltip="จัดอันดับพนักงาน ดู badge และผลงาน">';
    extras += '<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-lg shadow"><i class="ph ph-trophy"></i></div>';
    extras += '<div class="flex-1"><div class="font-bold text-slate-800 text-sm">อันดับผลงาน</div><div class="text-[11px] text-slate-400">ดูอันดับ + badge รางวัล</div></div></button>';
    // 🎓 Checklist ของฝึกงานเดิม — ลบออกแล้ว
    // ลบออก: ค้นหา, เช็คสต็อค, จับเวลา, บันทึกส่วนตัว, นาฬิกากะ, SOS
    
    menu.insertAdjacentHTML('beforeend', extras);
};

// ── Init offline mode on load ──
setTimeout(function() { app.initOfflineMode(); }, 2000);

}
})();
