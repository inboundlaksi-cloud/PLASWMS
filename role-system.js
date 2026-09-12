/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  PLAS-WMS Role System v1                                              ║
 * ║  • ธีมตามบทบาท (staff/intern/supervisor/admin)                       ║
 * ║  • เปลี่ยนไอคอน + QuickHub ตาม role                                  ║
 * ║  • ฟีเจอร์เด็กฝึกงาน: ปฏิทิน / ผลงาน / สมุดโน้ต                       ║
 * ║  Load LAST (after script.js, features-v3, features-v4, intern-system) ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
(function () {
    'use strict';

    function getRoleSafe() {
        var app = window.app;
        if (!app || !app.state) return 'user';
        var u = (app.state.ui && app.state.ui.currentUser) || '';
        if (app.state.ui && app.state.ui.currentScreen === 'master-admin') return 'admin';
        if (u === 'Supervisor' || u.toLowerCase().indexOf('supervisor') === 0) return 'supervisor';
        if (u === 'Admin' || u.indexOf('Admin:') === 0) return 'admin';
        var interns = (app.state.features && app.state.features.interns) || [];
        if (interns.some(function (i) { return (i.nickname || i.name) === u; })) return 'intern';
        return 'user';
    }

    var THEME_KEY = { user: 'staff', intern: 'intern', supervisor: 'supervisor', admin: 'admin' };
    var BANNER = {
        staff:      { txt: '🎒 ทีมพนักงาน',        primary: '#1d4ed8' },
        intern:     { txt: '🎈 โหมดน้องฝึกงาน',     primary: '#f59e0b' },
        supervisor: { txt: '👩‍🏫 ห้องพักครู (Supervisor)', primary: '#7c3aed' },
        admin:      { txt: '🎖️ ผู้ดูแลระบบ (Admin)', primary: '#b45309' }
    };
    var DECO = {
        staff:      ['ti-backpack', 'ti-books', 'ti-pencil', 'ti-school'],
        intern:     ['ti-star', 'ti-balloon', 'ti-rainbow', 'ti-ice-cream'],
        supervisor: ['ti-coffee', 'ti-books', 'ti-chalkboard', 'ti-bulb'],
        admin:      ['ti-award', 'ti-flag', 'ti-crown', 'ti-trophy']
    };

    /* ════════ ANIMAL AVATAR (สุ่มคงที่ตามชื่อ) ════════ */
    var ANIMALS = ['🐻', '🐰', '🦊', '🐱', '🐶', '🐼', '🐯', '🦁', '🐨', '🐮', '🐷', '🐸', '🐵', '🦉', '🐧', '🦄', '🐹', '🐭', '🦝', '🐗'];
    function hashStr(s) {
        var h = 0; s = String(s || '');
        for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
        return Math.abs(h);
    }
    function animalFor(name) { return ANIMALS[hashStr(name) % ANIMALS.length]; }
    // เปิดให้ส่วนอื่นเรียกใช้
    window.app && (window.app.getRoleAnimal = animalFor);

    function ensureEl(id, tag) {
        var el = document.getElementById(id);
        if (!el) { el = document.createElement(tag || 'div'); el.id = id; document.body.appendChild(el); }
        return el;
    }

    function applyRoleTheme() {
        var role = getRoleSafe();
        var key = THEME_KEY[role] || 'staff';
        var html = document.documentElement;

        // ถ้าอยู่หน้า login (ยังไม่ได้เข้า role) → ไม่ตั้งธีม role
        var onAuth = document.getElementById('screen-auth') &&
                     !document.getElementById('screen-auth').classList.contains('hidden');
        if (onAuth) {
            html.removeAttribute('data-role-theme');
            var b0 = document.getElementById('role-theme-banner'); if (b0) b0.style.display = 'none';
            var d0 = document.getElementById('role-theme-deco'); if (d0) d0.style.display = 'none';
            return;
        }

        html.setAttribute('data-role-theme', key);

        // banner
        var banner = ensureEl('role-theme-banner');
        banner.className = 'no-print';
        banner.style.display = '';
        banner.textContent = (BANNER[key] || BANNER.staff).txt;

        // deco watermark icons
        var deco = ensureEl('role-theme-deco');
        deco.className = 'no-print';
        deco.style.display = '';
        var icons = DECO[key] || DECO.staff;
        deco.innerHTML =
            '<i class="ti ' + icons[0] + '" style="top:80px;right:24px;"></i>' +
            '<i class="ti ' + icons[1] + '" style="bottom:120px;left:18px;font-size:64px;"></i>' +
            '<i class="ti ' + icons[2] + '" style="bottom:40px;right:60px;font-size:54px;"></i>';

        // ปรับไอคอนโลโก้หัวแอปตาม role
        styleHeaderIcon(key);

        // QuickHub เมนูตาม role
        rebuildQuickHub(role);

        // Supervisor: เพิ่มปุ่มแดชบอร์ดน้องฝึกงาน
        if (role === 'supervisor') {
            try { injectSupDashBtn(); } catch (e) {}
        }
    }

    function styleHeaderIcon(key) {
        var logoIcons = {
            staff: 'ph-backpack', intern: 'ph-student',
            supervisor: 'ph-chalkboard-teacher', admin: 'ph-crown'
        };
        var want = logoIcons[key] || 'ph-cube';
        // ไอคอนหลัก (user screen) มี id ชัดเจน
        var main = document.getElementById('role-logo-icon');
        if (main) {
            main.className = main.className.replace(/ph-[a-z0-9-]+/g, '').trim();
            main.classList.add('ph', want, 'text-2xl');
        }
        // supervisor / admin headers — จับ icon แรกในกล่องโลโก้
        ['screen-supervisor', 'screen-admin'].forEach(function (sid) {
            var sc = document.getElementById(sid);
            if (!sc) return;
            var header = sc.querySelector('header');
            if (!header) return;
            var iconBox = header.querySelector('.rounded-2xl, .rounded-xl, [class*="bg-gradient"]');
            if (!iconBox) return;
            var icon = iconBox.querySelector('i[class*="ph-"]');
            if (!icon) return;
            icon.className = icon.className.replace(/ph-[a-z0-9-]+/g, '').trim();
            icon.classList.add('ph', want);
        });
    }

    /* ════════ QuickHub ตาม role ════════ */
    function rebuildQuickHub(role) {
        var menu = document.getElementById('quick-hub-menu');
        if (!menu) return;
        // ใส่ flag ว่า role system จัดการแล้ว
        if (menu.getAttribute('data-rt-role') === role) return;
        menu.setAttribute('data-rt-role', role);

        // หัวเมนู
        var headers = {
            user:       { icon: 'ph-backpack',           label: 'เมนูลัด' },
            intern:     { icon: 'ph-student',            label: 'เมนูของหนู' },
            supervisor: { icon: 'ph-chalkboard-teacher', label: 'เครื่องมือครู' },
            admin:      { icon: 'ph-crown',              label: 'ศูนย์ควบคุม' }
        };
        var h = headers[role] || headers.user;

        // สร้างเมนูเฉพาะ intern (หน้าใหม่) — role อื่นใช้เมนูเดิมของแอป
        if (role === 'intern') {
            menu.innerHTML =
                '<div class="hub-header" style="padding:10px 14px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px;">' +
                    '<i class="ph ' + h.icon + '"></i> ' + h.label +
                '</div>' +
                internHubItem('ph-calendar-heart', 'ปฏิทินหนู', 'ดูว่าหนูมาฝึกกี่วันแล้ว', 'window.app.internShowCalendar()') +
                internHubItem('ph-trophy', 'ผลงานหนู', 'รับสินค้าไปเท่าไร เขียนกี่อัน', 'window.app.internShowSummary()') +
                internHubItem('ph-notebook', 'สมุดโน้ต', 'จดบันทึกของหนูเอง', 'window.app.internShowNotes()');
        }
    }

    function internHubItem(icon, title, desc, onclick) {
        return '<button onclick="' + onclick + ';window.app.toggleQuickHub();" ' +
            'class="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-50 transition-colors text-left border-t border-slate-100">' +
            '<div class="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg shadow" style="background:#fbbf24;">' +
                '<i class="ph ' + icon + '"></i></div>' +
            '<div class="flex-1"><div class="font-bold text-slate-800 text-sm">' + title + '</div>' +
            '<div class="text-[11px] text-slate-400">' + desc + '</div></div></button>';
    }

    /* ════════ WELCOME BACK — ฉากตาม role ════════ */
    var ROLE_SCENE = {
        admin: {
            label: '👑 ADMIN', primary: '#b45309', soft1: '#fef3c7', soft2: '#fde68a',
            floor: '#d97706', deco: ['🏆', '🚩'], greet: 'ยินดีต้อนรับ ผู้ดูแลระบบ'
        },
        supervisor: {
            label: '🎓 SUPERVISOR', primary: '#7c3aed', soft1: '#ede9fe', soft2: '#f5f3ff',
            floor: '#c4b5fd', deco: ['☕', '📖'], greet: 'ยินดีต้อนรับ หัวหน้างาน'
        },
        staff: {
            label: '🎒 พนักงาน', primary: '#1d4ed8', soft1: '#dbeafe', soft2: '#eef2ff',
            floor: '#93c5fd', deco: ['📚', '✏️'], greet: 'ยินดีต้อนรับ พนักงาน'
        },
        intern: {
            label: '🎈 เด็กฝึกงาน', primary: '#f59e0b', soft1: '#fef9c3', soft2: '#fff7ed',
            floor: '#86efac', deco: ['🧸', '🎨'], greet: 'หวัดดีจ้า น้องฝึกงาน'
        }
    };

    function roleOfRememberedUser(name, lastRole) {
        // map remembered role → scene key
        if (lastRole === 'admin') return 'admin';
        if (lastRole === 'supervisor') return 'supervisor';
        var app2 = window.app;
        var interns = (app2.state.features && app2.state.features.interns) || [];
        if (interns.some(function (i) { return (i.nickname || i.name) === name; })) return 'intern';
        return 'staff';
    }

    function installWelcomeScene(app) {
        if (app.__welcomeSceneInstalled) return;
        app.__welcomeSceneInstalled = true;
        var orig = app.renderWelcomeBack ? app.renderWelcomeBack.bind(app) : null;

        // คืนพื้นหลังโรงเรียนเมื่อกลับไปหน้าเลือกชื่อ
        var origShowAll = app.showAllUsers ? app.showAllUsers.bind(app) : null;
        app.showAllUsers = function () {
            var bg = document.getElementById('auth-school-bg');
            if (bg) {
                bg.style.background = 'linear-gradient(180deg,#bae6fd 0%,#e0f2fe 45%,#dcfce7 100%)';
                Array.prototype.forEach.call(bg.children, function (c) { c.style.opacity = ''; });
            }
            if (origShowAll) return origShowAll();
        };

        app.renderWelcomeBack = function (rem) {
            var container = document.getElementById('auth-user-list');
            if (!container) { if (orig) return orig(rem); return; }
            container.style.display = 'block';

            var name = rem.user;
            var profile = (this.getUserProfile ? this.getUserProfile(name) : {}) || {};
            var roles = this.getUserRoles ? this.getUserRoles(name) : ['writer'];
            var lastRoleValid = rem.role && roles.indexOf(rem.role) !== -1;
            var sceneKey = roleOfRememberedUser(name, lastRoleValid ? rem.role : null);
            var sc = ROLE_SCENE[sceneKey] || ROLE_SCENE.staff;

            // ✅ ปรับพื้นหลังหน้า login ให้กลมกลืนกับสีของ role (ไม่ตัดกัน)
            var bg = document.getElementById('auth-school-bg');
            if (bg) {
                bg.style.background = 'linear-gradient(180deg,' + sc.soft2 + ' 0%,' + sc.soft1 + ' 100%)';
                // ซ่อนฉากโรงเรียน (ตึก/เมฆ) ตอนโชว์ welcome เพื่อไม่ให้รก
                Array.prototype.forEach.call(bg.children, function (c) { c.style.opacity = '0.25'; });
            }

            var esc = String(name).replace(/'/g, "\\'");
            var enterAction = lastRoleValid
                ? "window.app.chooseRoleAuth('" + esc + "','" + rem.role + "')"
                : "window.app.handleUserLogin('" + esc + "')";
            var hasPIN = profile.pinEnabled && profile.pin;

            var avatar = profile.photo
                ? '<img src="' + profile.photo + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
                : '<span style="font-size:38px;">' + animalFor(name) + '</span>';

            var multiLink = (roles.length > 1)
                ? '<button onclick="window.app.handleUserLogin(\'' + esc + '\')" style="background:none;border:none;color:' + sc.primary + ';font-size:13px;font-weight:600;cursor:pointer;margin-top:8px;"><i class="ph ph-swap" style="vertical-align:-2px"></i> เลือกบทบาทอื่น</button>'
                : '';

            container.innerHTML =
                '<div style="max-width:360px;margin:20px auto 0;width:100%;">' +
                    // ===== ฉากการ์ด — โทนเดียวนุ่มนวล ไม่มีพื้นสีตัด =====
                    '<div style="position:relative;border-radius:24px;overflow:hidden;background:#fff;box-shadow:0 12px 36px rgba(15,23,42,.10);border:1px solid ' + sc.soft1 + ';">' +
                        // แถบหัวสีอ่อนของ role
                        '<div style="height:130px;background:linear-gradient(180deg,' + sc.soft1 + ',#fff);position:relative;">' +
                            '<div style="position:absolute;top:14px;left:50%;transform:translateX(-50%);background:' + sc.primary + ';color:#fff;font-size:12px;font-weight:800;padding:6px 22px;border-radius:20px;box-shadow:0 3px 10px rgba(0,0,0,0.18);letter-spacing:0.5px;white-space:nowrap;">' + sc.label + '</div>' +
                            '<div style="position:absolute;top:20px;left:16px;font-size:22px;opacity:0.6;">' + sc.deco[0] + '</div>' +
                            '<div style="position:absolute;top:20px;right:16px;font-size:22px;opacity:0.6;">' + sc.deco[1] + '</div>' +
                            '<div style="position:absolute;bottom:-42px;left:50%;transform:translateX(-50%);width:88px;height:88px;border-radius:50%;background:#fff;border:4px solid ' + sc.primary + ';display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.15);">' + avatar + '</div>' +
                        '</div>' +
                        // ส่วนล่าง
                        '<div style="padding:52px 22px 22px;text-align:center;">' +
                            '<div style="font-size:13px;color:' + sc.primary + ';font-weight:600;">' + sc.greet + '</div>' +
                            '<div style="font-size:23px;font-weight:800;color:#1e293b;margin-bottom:18px;">' + escHtml(name) + '</div>' +
                            '<button onclick="' + enterAction + '" style="width:100%;padding:15px;border-radius:14px;background:' + sc.primary + ';color:#fff;border:none;font-size:16px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">' +
                                (hasPIN ? '<i class="ph ph-lock-key"></i> ใส่ PIN เข้าสู่ระบบ' : '<i class="ph ph-sign-in"></i> เข้าสู่ระบบ') +
                            '</button>' +
                            multiLink +
                            '<button onclick="window.app.showAllUsers()" style="width:100%;background:none;border:none;color:#94a3b8;font-size:14px;font-weight:700;cursor:pointer;margin-top:12px;padding:6px;"><i class="ph ph-users" style="vertical-align:-2px"></i> ไม่ใช่ฉัน? เปลี่ยนผู้ใช้</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        };
    }

    function modal(id, innerHtml, accent) {
        var old = document.getElementById(id); if (old) old.remove();
        var bg = document.createElement('div');
        bg.id = id;
        bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:flex-end;justify-content:center;padding:0;';
        bg.onclick = function (e) { if (e.target === bg) bg.remove(); };
        bg.innerHTML =
            '<div onclick="event.stopPropagation()" style="background:#fff7ed;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;border-radius:24px 24px 0 0;box-shadow:0 -8px 40px rgba(0,0,0,0.25);">' +
                '<div style="background:' + (accent || '#fbbf24') + ';color:#fff;padding:18px 22px;border-radius:24px 24px 0 0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;">' +
                    innerHtml.header +
                    '<button onclick="document.getElementById(\'' + id + '\').remove()" style="background:rgba(255,255,255,0.25);border:none;border-radius:50%;width:34px;height:34px;color:#fff;font-size:16px;cursor:pointer;">✕</button>' +
                '</div>' +
                '<div style="padding:18px 20px 30px;">' + innerHtml.body + '</div>' +
            '</div>';
        document.body.appendChild(bg);
    }

    function getInternRecord() {
        var app = window.app;
        var u = (app.state.ui && app.state.ui.currentUser) || '';
        var list = (app.state.features && app.state.features.interns) || [];
        return list.filter(function (i) { return (i.nickname || i.name) === u; })[0] || null;
    }

    // สถิติของน้อง: นับจาก history ที่ user = ชื่อน้อง
    function internStats() {
        var app = window.app;
        var u = (app.state.ui && app.state.ui.currentUser) || '';
        var hist = (app.state.data && app.state.data.history) || [];
        var today = todayISO();
        var mine = hist.filter(function (h) { return h.user === u; });
        function isToday(ts) { try { return new Date(ts).toLocaleDateString('en-CA') === today; } catch (e) { return false; } }

        var todayWrites = mine.filter(function (h) { return isToday(h.timestamp) && (h.action === 'write' || h.action === 'done'); }).length;
        var totalWrites = mine.filter(function (h) { return h.action === 'write' || h.action === 'done'; }).length;
        // วันที่มาทำงาน (distinct days)
        var days = {};
        mine.forEach(function (h) { try { days[new Date(h.timestamp).toLocaleDateString('en-CA')] = true; } catch (e) {} });
        var daysCount = Object.keys(days).length;
        // streak: นับวันต่อเนื่องล่าสุด
        var sorted = Object.keys(days).sort().reverse();
        var streak = 0; var cur = new Date();
        for (var s = 0; s < sorted.length; s++) {
            var dStr = cur.toLocaleDateString('en-CA');
            if (days[dStr]) { streak++; cur.setDate(cur.getDate() - 1); }
            else if (s === 0) { cur.setDate(cur.getDate() - 1); if (days[cur.toLocaleDateString('en-CA')]) { /* เมื่อวาน */ } else break; }
            else break;
        }
        return { todayWrites: todayWrites, totalWrites: totalWrites, daysCount: daysCount, streak: streak, daysMap: days };
    }

    var app = window.app || (window.app = {});

    app.internShowCalendar = function () {
        var rec = getInternRecord();
        var st = internStats();
        var now = new Date();
        var year = now.getFullYear(), month = now.getMonth();
        var first = new Date(year, month, 1).getDay(); // 0=Sun
        first = (first === 0) ? 6 : first - 1; // ให้จันทร์เป็นต้นสัปดาห์
        var daysInMonth = new Date(year, month + 1, 0).getDate();
        var todayStr = todayISO();

        var cells = '';
        for (var b = 0; b < first; b++) cells += '<div></div>';
        for (var d = 1; d <= daysInMonth; d++) {
            var ds = new Date(year, month, d).toLocaleDateString('en-CA');
            var came = st.daysMap[ds];
            var isToday = (ds === todayStr);
            var bg = isToday ? '#fcd34d' : (came ? '#86efac' : '#f1f5f9');
            var col = isToday ? '#92400e' : (came ? '#166534' : '#cbd5e1');
            cells += '<div style="text-align:center;font-size:12px;padding:7px 0;border-radius:8px;background:' + bg + ';color:' + col + ';font-weight:' + (isToday ? '700' : '400') + ';">' + d + '</div>';
        }
        var monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

        modal('intern-cal-modal', {
            header: '<div><div style="font-size:18px;font-weight:800;">📅 ปฏิทินของหนู</div><div style="font-size:12px;opacity:0.9;">' + monthNames[month] + ' ' + (year + 543) + '</div></div>',
            body:
                '<div style="background:#fff;border-radius:18px;padding:16px;border:2px solid #fed7aa;">' +
                    '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:6px;">' +
                        ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map(function (w) { return '<div style="text-align:center;font-size:10px;color:#c2734f;font-weight:700;">' + w + '</div>'; }).join('') +
                    '</div>' +
                    '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">' + cells + '</div>' +
                    '<div style="margin-top:14px;font-size:11px;color:#78716c;display:flex;gap:12px;flex-wrap:wrap;">' +
                        '<span><span style="display:inline-block;width:11px;height:11px;background:#86efac;border-radius:50%;vertical-align:-1px;"></span> มาฝึก</span>' +
                        '<span><span style="display:inline-block;width:11px;height:11px;background:#fcd34d;border-radius:50%;vertical-align:-1px;"></span> วันนี้</span>' +
                    '</div>' +
                '</div>' +
                '<div style="text-align:center;margin-top:16px;font-size:14px;color:#9a3412;font-weight:700;">' +
                    '🎉 หนูมาฝึกแล้ว ' + st.daysCount + ' วัน · ต่อเนื่อง ' + st.streak + ' วัน เก่งมาก!' +
                '</div>' +
                (rec ? '<div style="text-align:center;margin-top:6px;font-size:11px;color:#c2734f;">ช่วงฝึกงาน: ' + (rec.startDate || '–') + ' ถึง ' + (rec.endDate || 'ยังไม่กำหนด') + '</div>' : '')
        }, '#fb923c');
    };

    app.internShowSummary = function () {
        var st = internStats();
        var rec = getInternRecord();
        // ความคืบหน้า % ของช่วงฝึก
        var progress = 0;
        if (rec && rec.startDate && rec.endDate) {
            var s = new Date(rec.startDate), e = new Date(rec.endDate), n = new Date();
            var total = e - s, done = n - s;
            progress = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
        }
        function stat(emoji, num, label, bg, col) {
            return '<div style="background:' + bg + ';border-radius:14px;padding:14px;display:flex;align-items:center;gap:12px;">' +
                '<div style="font-size:28px;">' + emoji + '</div>' +
                '<div><div style="font-size:24px;font-weight:800;color:' + col + ';">' + num + '</div>' +
                '<div style="font-size:11px;color:' + col + ';">' + label + '</div></div></div>';
        }
        modal('intern-sum-modal', {
            header: '<div><div style="font-size:18px;font-weight:800;">🏆 ผลงานของหนู</div><div style="font-size:12px;opacity:0.9;">สรุปงานที่หนูทำ</div></div>',
            body:
                '<div style="display:flex;flex-direction:column;gap:10px;">' +
                    stat('✍️', st.todayWrites, 'เขียน Location วันนี้', '#fef9c3', '#a16207') +
                    stat('📦', st.totalWrites, 'ทำงานทั้งหมด (สะสม)', '#dcfce7', '#15803d') +
                    stat('⭐', st.streak + ' วัน', 'มาต่อเนื่อง', '#e0f2fe', '#0369a1') +
                    stat('📅', st.daysCount + ' วัน', 'มาฝึกทั้งหมด', '#fce7f3', '#9d174d') +
                '</div>' +
                (rec && rec.endDate ?
                    '<div style="margin-top:16px;background:#fff;border-radius:14px;padding:14px;border:2px solid #bae6fd;">' +
                        '<div style="font-size:12px;color:#0c4a6e;font-weight:700;margin-bottom:8px;">ความคืบหน้าการฝึกงาน</div>' +
                        '<div style="height:14px;background:#e0f2fe;border-radius:7px;overflow:hidden;"><div style="width:' + progress + '%;height:100%;background:#0ea5e9;"></div></div>' +
                        '<div style="font-size:11px;color:#0369a1;margin-top:6px;text-align:right;">' + progress + '%</div>' +
                    '</div>' : '')
        }, '#0ea5e9');
    };

    app.internShowNotes = function () {
        var app2 = window.app;
        var u = (app2.state.ui && app2.state.ui.currentUser) || '';
        var key = 'intern_notes_' + u;
        var notes = [];
        try { notes = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { notes = []; }

        var colors = ['#fef9c3', '#dbeafe', '#dcfce7', '#fce7f3', '#fed7aa'];
        var notesHtml = notes.length ? notes.map(function (n, i) {
            return '<div style="background:' + colors[i % colors.length] + ';border-radius:12px;padding:12px;transform:rotate(' + (i % 2 ? 1 : -1) + 'deg);position:relative;">' +
                '<div style="font-size:13px;color:#44403c;line-height:1.5;white-space:pre-wrap;">' + escHtml(n.text) + '</div>' +
                '<div style="font-size:9px;color:#a8a29e;margin-top:8px;display:flex;justify-content:space-between;">' +
                    '<span>' + (n.date || '') + '</span>' +
                    '<span onclick="window.app.internDeleteNote(' + i + ')" style="cursor:pointer;color:#dc2626;">ลบ</span>' +
                '</div></div>';
        }).join('') : '<div style="text-align:center;color:#c2734f;padding:20px;font-size:13px;">ยังไม่มีโน้ต เขียนอันแรกกันเลย!</div>';

        modal('intern-notes-modal', {
            header: '<div><div style="font-size:18px;font-weight:800;">📔 สมุดจดของหนู</div><div style="font-size:12px;opacity:0.9;">บันทึกสิ่งที่เรียนรู้</div></div>',
            body:
                '<div style="background:#fff;border-radius:14px;padding:12px;margin-bottom:14px;border:2px solid #f9a8d4;">' +
                    '<textarea id="intern-note-input" placeholder="วันนี้หนูเรียนรู้อะไรบ้าง..." style="width:100%;min-height:70px;border:none;outline:none;resize:none;font-size:14px;font-family:inherit;background:transparent;"></textarea>' +
                    '<button onclick="window.app.internAddNote()" style="margin-top:8px;width:100%;padding:10px;border:none;border-radius:12px;background:#ec4899;color:#fff;font-weight:700;font-size:13px;cursor:pointer;">✏️ จดโน้ต</button>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:10px;">' + notesHtml + '</div>'
        }, '#ec4899');
    };

    app.internAddNote = function () {
        var inp = document.getElementById('intern-note-input');
        if (!inp || !inp.value.trim()) return;
        var u = (this.state.ui && this.state.ui.currentUser) || '';
        var key = 'intern_notes_' + u;
        var notes = [];
        try { notes = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { notes = []; }
        notes.unshift({ text: inp.value.trim(), date: new Date().toLocaleDateString('th-TH') });
        localStorage.setItem(key, JSON.stringify(notes));
        // sync firebase (เผื่อดูข้ามเครื่อง)
        try { if (window.db) window.db.collection('intern_notes').doc(u).set({ list: notes }); } catch (e) {}
        this.internShowNotes();
    };

    app.internDeleteNote = function (idx) {
        var u = (this.state.ui && this.state.ui.currentUser) || '';
        var key = 'intern_notes_' + u;
        var notes = [];
        try { notes = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { notes = []; }
        notes.splice(idx, 1);
        localStorage.setItem(key, JSON.stringify(notes));
        try { if (window.db) window.db.collection('intern_notes').doc(u).set({ list: notes }); } catch (e) {}
        this.internShowNotes();
    };

    function escHtml(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ════════ SUPERVISOR — INTERN DASHBOARD + รุ่น ════════ */
    function cohortOf(intern) {
        // จัดรุ่นจากวันเริ่มฝึก เป็นไตรมาส เช่น "1/2569"
        if (!intern.startDate) return 'ไม่ระบุรุ่น';
        var d = new Date(intern.startDate);
        var q = Math.floor(d.getMonth() / 3) + 1;
        return q + '/' + (d.getFullYear() + 543);
    }

    function statsForIntern(nick) {
        var app2 = window.app;
        var hist = (app2.state.data && app2.state.data.history) || [];
        var mine = hist.filter(function (h) { return h.user === nick; });
        var works = mine.filter(function (h) { return h.action === 'write' || h.action === 'done'; }).length;
        var days = {};
        mine.forEach(function (h) { try { days[new Date(h.timestamp).toLocaleDateString('en-CA')] = true; } catch (e) {} });
        var daysCount = Object.keys(days).length;
        var avgPerDay = daysCount ? (works / daysCount).toFixed(1) : '0';
        return { works: works, daysCount: daysCount, avgPerDay: avgPerDay };
    }

    app.supShowInternDashboard = function () {
        var interns = (this.state.features && this.state.features.interns) || [];
        // group by cohort
        var groups = {};
        interns.forEach(function (i) {
            var c = cohortOf(i);
            (groups[c] = groups[c] || []).push(i);
        });
        var cohortNames = Object.keys(groups).sort().reverse();

        var body = '';
        if (!interns.length) {
            body = '<div style="text-align:center;color:#94a3b8;padding:30px;">ยังไม่มีข้อมูลน้องฝึกงาน</div>';
        } else {
            cohortNames.forEach(function (cn) {
                body += '<div style="margin-bottom:18px;">';
                body += '<div style="font-size:13px;font-weight:700;color:#5b21b6;margin-bottom:8px;display:flex;align-items:center;gap:6px;"><i class="ph ph-users-three"></i> รุ่น ' + escHtml(cn) + ' <span style="font-size:11px;color:#a78bfa;font-weight:400;">(' + groups[cn].length + ' คน)</span></div>';
                groups[cn].forEach(function (intern) {
                    var nick = intern.nickname || intern.name;
                    var st = statsForIntern(nick);
                    body += '<div style="background:#fff;border:1px solid #e9d5ff;border-radius:12px;padding:12px;margin-bottom:8px;">' +
                        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
                            '<div style="width:34px;height:34px;border-radius:50%;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:16px;">🎓</div>' +
                            '<div><div style="font-size:13px;font-weight:700;color:#1e293b;">' + escHtml(nick) + '</div>' +
                            '<div style="font-size:10px;color:#94a3b8;">' + escHtml(intern.startDate || '–') + ' → ' + escHtml(intern.endDate || 'ยังฝึกอยู่') + '</div></div>' +
                        '</div>' +
                        '<div style="display:flex;gap:6px;">' +
                            '<div style="flex:1;background:#fef9c3;border-radius:8px;padding:7px;text-align:center;"><div style="font-size:16px;font-weight:700;color:#a16207;">' + st.works + '</div><div style="font-size:9px;color:#a16207;">ทำงานสะสม</div></div>' +
                            '<div style="flex:1;background:#dcfce7;border-radius:8px;padding:7px;text-align:center;"><div style="font-size:16px;font-weight:700;color:#15803d;">' + st.daysCount + '</div><div style="font-size:9px;color:#15803d;">วันที่มาฝึก</div></div>' +
                            '<div style="flex:1;background:#e0f2fe;border-radius:8px;padding:7px;text-align:center;"><div style="font-size:16px;font-weight:700;color:#0369a1;">' + st.avgPerDay + '</div><div style="font-size:9px;color:#0369a1;">เฉลี่ย/วัน</div></div>' +
                        '</div>' +
                    '</div>';
                });
                body += '</div>';
            });
        }

        var bg = document.getElementById('sup-intern-dash');
        if (bg) bg.remove();
        bg = document.createElement('div');
        bg.id = 'sup-intern-dash';
        bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:14px;';
        bg.onclick = function (e) { if (e.target === bg) bg.remove(); };
        bg.innerHTML =
            '<div onclick="event.stopPropagation()" style="background:#f5f3ff;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
                '<div style="background:#7c3aed;color:#fff;padding:18px 22px;border-radius:20px 20px 0 0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;">' +
                    '<div><div style="font-size:18px;font-weight:800;">📊 แดชบอร์ดน้องฝึกงาน</div><div style="font-size:12px;opacity:0.9;">สถิติรายคน แบ่งตามรุ่น</div></div>' +
                    '<button onclick="document.getElementById(\'sup-intern-dash\').remove()" style="background:rgba(255,255,255,0.25);border:none;border-radius:50%;width:34px;height:34px;color:#fff;font-size:16px;cursor:pointer;">✕</button>' +
                '</div>' +
                '<div style="padding:18px 20px 28px;">' + body + '</div>' +
            '</div>';
        document.body.appendChild(bg);
    };

    /* เพิ่มปุ่มเข้า Supervisor sidebar (หลัง Audit Log) */
    function injectSupDashBtn() {
        var auditBtn = document.querySelector('#screen-supervisor [onclick*="showAuditLog"]');
        if (!auditBtn || auditBtn.dataset.dashAdded) return;
        auditBtn.dataset.dashAdded = '1';
        var btn = document.createElement('button');
        btn.className = 'sidebar-link w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 hover:text-white transition-all font-medium';
        btn.setAttribute('onclick', 'window.app.supShowInternDashboard()');
        btn.innerHTML = '<i class="ph ph-chart-bar text-xl" style="color:#c4b5fd;"></i> แดชบอร์ดน้องฝึกงาน';
        auditBtn.insertAdjacentElement('beforebegin', btn);
    }

    /* ════════ BOOT — ตามการเปลี่ยนหน้าจอ ════════ */
    function boot() {
        if (!window.app) { setTimeout(boot, 80); return; }
        window.app.getRoleAnimal = animalFor;
        try { installWelcomeScene(window.app); } catch (e) {}
        // ตรวจ role + ธีมทุก 600ms (เบา) เพื่อจับการเปลี่ยน screen/login/logout
        var lastKey = '';
        setInterval(function () {
            try {
                var role = getRoleSafe();
                var onAuth = document.getElementById('screen-auth') &&
                             !document.getElementById('screen-auth').classList.contains('hidden');
                var key = onAuth ? 'auth' : role;
                if (key !== lastKey) { lastKey = key; applyRoleTheme(); }
            } catch (e) {}
        }, 600);
        applyRoleTheme();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
