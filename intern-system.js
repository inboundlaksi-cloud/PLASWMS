/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  PLAS-WMS Intern System v3.0  (rebuilt clean)                        ║
 * ║  ──────────────────────────────────────────────────────────────────  ║
 * ║  • โหมดฝึกงานทำงานตามโดเมน (internborneo.netlify.app)               ║
 * ║  • ล็อก Admin / Supervisor / Master Admin ออกจากหน้า login         ║
 * ║  • หน้า login เห็นแค่รายชื่อน้องฝึกงาน                              ║
 * ║  • เช็ควันเริ่ม/วันหมด — เลยวันหมดแล้ว login ไม่ได้                 ║
 * ║  • ไม่มี QR check-in / Buddy / Attendance / ปฏิทิน (ลบทิ้งแล้ว)    ║
 * ║  Load AFTER features-v3.js, features-v4.js, script.js               ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
(function () {
    'use strict';

    var IS_INTERN = !!window.PLAS_INTERN_MODE;

    function todayLocal() {
        return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    }

    /** สถานะช่วงเวลาฝึกงาน: not_started | active | expired */
    function dateStatus(startDate, endDate) {
        var t = todayLocal();
        if (startDate && t < startDate) return 'not_started';
        if (endDate && t > endDate) return 'expired';
        return 'active';
    }

    function internList() {
        var app = window.app;
        return (app && app.state && app.state.features && app.state.features.interns) || [];
    }

    /** หา intern record จากชื่อ/ชื่อเล่น */
    function findIntern(username) {
        return internList().filter(function (i) {
            return i.nickname === username || i.name === username;
        })[0] || null;
    }

    /** รายชื่อน้องที่ "ฝึกได้ตอนนี้" (active เท่านั้น) สำหรับโชว์ใน login */
    function activeInternNicknames() {
        return internList()
            .filter(function (i) { return dateStatus(i.startDate, i.endDate) === 'active'; })
            .map(function (i) { return i.nickname || i.name; });
    }

    /* ═══════════════════════════════════════════
       INTERN MODE — override login behaviour
    ═══════════════════════════════════════════ */
    function installInternMode(app) {
        if (app.__internV3Installed) return;
        app.__internV3Installed = true;

        // ── banner ──
        if (!document.getElementById('intern-mode-banner')) {
            var b = document.createElement('div');
            b.id = 'intern-mode-banner';
            b.textContent = '🎓 โหมดฝึกงาน — Intern Mode';
            document.body.appendChild(b);
        }

        // ── ล็อกฟังก์ชันเข้าสู่ Admin / Supervisor / Master Admin ──
        function blocked() {
            if (app.toast) app.toast('โหมดฝึกงานเข้าส่วนนี้ไม่ได้', 'error');
        }
        app.showAdminSelection = blocked;
        app.showMasterAdmin = blocked;
        app.chooseRoleAuth = blocked;
        var _origLogin = app.login ? app.login.bind(app) : null;
        app.login = function (user) {
            // กันเข้าเป็น Admin / Supervisor แม้จะเรียกตรงๆ
            if (typeof user === 'string' &&
                (user === 'Supervisor' || user.indexOf('Admin') === 0)) {
                blocked();
                return;
            }
            // กันน้องที่ไม่ active (หมดอายุ/ยังไม่เริ่ม) เข้าระบบ
            var intern = findIntern(user);
            if (intern) {
                var st = dateStatus(intern.startDate, intern.endDate);
                if (st === 'expired') {
                    if (app.toast) app.toast('หมดช่วงฝึกงานแล้ว เข้าระบบไม่ได้', 'error');
                    return;
                }
                if (st === 'not_started') {
                    if (app.toast) app.toast('ยังไม่ถึงวันเริ่มฝึกงาน (' + intern.startDate + ')', 'error');
                    return;
                }
            }
            if (_origLogin) return _origLogin(user);
        };

        // ── renderLogin: โชว์เฉพาะน้องฝึกงานที่ active ──
        var _origRender = app.renderLogin ? app.renderLogin.bind(app) : null;
        app.renderLogin = function () {
            var container = document.getElementById('auth-user-list');
            if (!container) return;

            // ซ่อนปุ่ม/ลิสต์ของ admin & supervisor (CSS ทำแล้ว แต่กันเหนียว)
            var bottom = document.getElementById('auth-bottom-actions');
            if (bottom) bottom.style.display = 'none';
            var adminList = document.getElementById('auth-admin-list');
            if (adminList) { adminList.classList.add('hidden'); adminList.innerHTML = ''; }

            // ไม่ใช้การ์ด "ยินดีต้อนรับกลับ" ในโหมดฝึกงาน — แสดง grid เสมอ
            container.style.display = '';

            var nicks = activeInternNicknames();
            if (!nicks.length) {
                container.innerHTML =
                    '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:40px 20px;">' +
                    '<div style="font-size:42px;margin-bottom:12px;">🎓</div>' +
                    '<div style="font-size:16px;font-weight:700;color:#475569;">ยังไม่มีน้องฝึกงานที่กำลังฝึก</div>' +
                    '<div style="font-size:13px;margin-top:6px;">กรุณาติดต่อแอดมินเพื่อเพิ่มรายชื่อ</div>' +
                    '</div>';
                return;
            }

            container.innerHTML = nicks.map(function (u, i) {
                var profile = (app.getUserProfile ? app.getUserProfile(u) : {}) || {};
                var hasPhoto = !!profile.photo;
                var hasPIN = profile.pinEnabled && profile.pin;
                return '' +
                '<button onclick="window.app.handleUserLogin(\'' + String(u).replace(/'/g, "\\'") + '\')" ' +
                'class="btn-press bg-sky-50 border-sky-200 hover:bg-sky-100 hover:border-sky-400 border-2 text-slate-700 rounded-2xl p-4 transition-all shadow-sm relative group" ' +
                'style="animation-delay:' + (i * 50) + 'ms;animation:slide-up-fade 0.4s forwards;">' +
                    (hasPIN ? '<div class="absolute top-2 right-2 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center shadow-md"><i class="ph ph-lock text-xs text-white"></i></div>' : '') +
                    '<div class="absolute top-2 left-2 text-[10px] bg-sky-500 text-white px-1.5 py-0.5 rounded font-bold">ฝึกงาน</div>' +
                    '<div class="flex flex-col items-center gap-2">' +
                        (hasPhoto
                            ? '<img src="' + profile.photo + '" class="w-16 h-16 rounded-full object-cover border-2 border-sky-500 shadow-md">'
                            : '<div class="w-16 h-16 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-3xl border-2 border-sky-300 shadow-sm">' + (window.app.getRoleAnimal ? window.app.getRoleAnimal(u) : '🐻') + '</div>') +
                        '<div class="text-base font-bold text-center leading-tight">' + u + '</div>' +
                    '</div>' +
                '</button>';
            }).join('');
        };

        // re-render login ทันที (เผื่อ render รอบแรกใช้ของเดิมไปแล้ว)
        if (document.getElementById('screen-auth') &&
            !document.getElementById('screen-auth').classList.contains('hidden')) {
            try { app.renderLogin(); } catch (e) {}
        }
    }

    /* ═══════════════════════════════════════════
       BOOT
    ═══════════════════════════════════════════ */
    function boot() {
        var app = window.app;
        if (!app) { setTimeout(boot, 60); return; }

        if (IS_INTERN) {
            // รอจน renderLogin ของ app พร้อม แล้วค่อยครอบ
            var tries = 0;
            (function waitReady() {
                if (typeof app.renderLogin === 'function') {
                    installInternMode(app);
                } else if (tries++ < 200) {
                    setTimeout(waitReady, 30);
                }
            })();

            // เผื่อ interns โหลดจาก Firebase มาทีหลัง → re-render login
            var lastCount = -1;
            setInterval(function () {
                if (!IS_INTERN || !window.app) return;
                var c = activeInternNicknames().length;
                if (c !== lastCount) {
                    lastCount = c;
                    var authScreen = document.getElementById('screen-auth');
                    if (authScreen && !authScreen.classList.contains('hidden') &&
                        typeof window.app.renderLogin === 'function') {
                        try { window.app.renderLogin(); } catch (e) {}
                    }
                }
            }, 800);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
