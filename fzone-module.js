/*
 * PLAS WMS — F-Zone Optional Module
 * Isolated extension. Uses the existing window.app, window.db, Firebase Auth and PLAS roles.
 * Main Receiving/Top Location collections are never written by this module.
 */
(function () {
    'use strict';

    var VERSION = '2.0.5-map-launcher';
    var MOVE_SITE_URL = 'https://borneofzone.netlify.app/';
    var COL = {
        SETTINGS: 'fzone_settings',
        LOCATIONS: 'fzone_locations',
        PALLETS: 'fzone_pallets',
        PLACEMENTS: 'fzone_placements',
        MAPS: 'fzone_maps',
        MOVEMENTS: 'fzone_movements'
    };
    var DEFAULT_SETTINGS = {
        moduleEnabled: true,
        featureMode: 'optional', // off | optional | required
        parents: [],
        updatedAt: 0,
        updatedBy: ''
    };

    // แผนผัง F-AAD เดิมจาก Pallet Location เวอร์ชันที่ผู้ใช้ส่งมา
    // ใช้เป็น built-in fallback จึงแสดงได้ทันที แม้ Firestore ยังไม่มี fzone_maps/F-AAD
    var DEFAULT_F_AAD_MAP = [
        {id:'aisle-top',type:'aisle',code:'ทางเดินหลักด้านบน',name:'',x:1,y:1,w:98,h:7,status:'active'},
        {id:'aad01',type:'storage',code:'AAD-01',name:'ข้าง LDA ด้านบน',x:1,y:9,w:8,h:32,status:'active'},
        {id:'lda-t',type:'rack',code:'LDA',name:'',x:9.3,y:9,w:6,h:32,status:'active'},
        {id:'walk1t',type:'aisle',code:'ทางเดิน',name:'',x:15.6,y:9,w:3.4,h:32,status:'active'},
        {id:'aad03',type:'storage',code:'AAD-03',name:'ระหว่าง LDA-LDB ด้านบน',x:19.2,y:9,w:13,h:32,status:'active'},
        {id:'ldb-t',type:'rack',code:'LDB',name:'',x:32.5,y:9,w:6,h:32,status:'active'},
        {id:'ldc-t',type:'rack',code:'LDC',name:'',x:38.8,y:9,w:6,h:32,status:'active'},
        {id:'aad05',type:'storage',code:'AAD-05',name:'ระหว่าง LDC-LDD ด้านบน',x:45.1,y:9,w:13,h:32,status:'active'},
        {id:'walk2t',type:'aisle',code:'ทางเดิน',name:'',x:58.4,y:9,w:3.4,h:32,status:'active'},
        {id:'aad07',type:'storage',code:'AAD-07',name:'กลางด้านบน ใกล้ LDD',x:62,y:9,w:13,h:32,status:'active'},
        {id:'ldd-t',type:'rack',code:'LDD',name:'',x:75.3,y:9,w:6,h:32,status:'active'},
        {id:'lde-t',type:'rack',code:'LDE',name:'',x:81.6,y:9,w:6,h:32,status:'active'},
        {id:'aad09',type:'storage',code:'AAD-09',name:'ระหว่าง LDE-LDF ด้านบน',x:87.9,y:9,w:8,h:32,status:'active'},
        {id:'ldf-t',type:'rack',code:'LDF',name:'',x:96.1,y:9,w:3,h:32,status:'active'},
        {id:'aisle-mid',type:'aisle',code:'ทางเดินหลักกลาง',name:'',x:1,y:42,w:98,h:8,status:'active'},
        {id:'aad02',type:'storage',code:'AAD-02',name:'ข้าง LDA ด้านล่าง',x:1,y:51,w:8,h:29,status:'active'},
        {id:'lda-b',type:'rack',code:'LDA',name:'',x:9.3,y:51,w:6,h:29,status:'active'},
        {id:'walk1b',type:'aisle',code:'ทางเดิน',name:'',x:15.6,y:51,w:3.4,h:29,status:'active'},
        {id:'aad04',type:'storage',code:'AAD-04',name:'ระหว่าง LDA-LDB ด้านล่าง',x:19.2,y:51,w:13,h:29,status:'active'},
        {id:'ldb-b',type:'rack',code:'LDB',name:'',x:32.5,y:51,w:6,h:29,status:'active'},
        {id:'ldc-b',type:'rack',code:'LDC',name:'',x:38.8,y:51,w:6,h:29,status:'active'},
        {id:'aad06',type:'storage',code:'AAD-06',name:'ระหว่าง LDC-LDD ด้านล่าง',x:45.1,y:51,w:13,h:29,status:'active'},
        {id:'walk2b',type:'aisle',code:'ทางเดิน',name:'',x:58.4,y:51,w:3.4,h:29,status:'active'},
        {id:'aad08',type:'storage',code:'AAD-08',name:'กลางด้านล่าง ใกล้ LDD',x:62,y:51,w:13,h:29,status:'active'},
        {id:'ldd-b',type:'rack',code:'LDD',name:'',x:75.3,y:51,w:6,h:29,status:'active'},
        {id:'lde-b',type:'rack',code:'LDE',name:'',x:81.6,y:51,w:6,h:29,status:'active'},
        {id:'aad10',type:'storage',code:'AAD-10',name:'ระหว่าง LDE-LDF ด้านล่าง',x:87.9,y:51,w:8,h:29,status:'active'},
        {id:'ldf-b',type:'rack',code:'LDF',name:'',x:96.1,y:51,w:3,h:29,status:'active'},
        {id:'aad11',type:'storage',code:'AAD-11',name:'พื้นที่หน้าห้อง จป.',x:1,y:81,w:64,h:12,status:'active'},
        {id:'safety-room',type:'restricted',code:'ห้อง จป.',name:'พื้นที่ห้ามวางสินค้า',x:65.3,y:81,w:33.7,h:12,status:'active'},
        {id:'aisle-bottom',type:'aisle',code:'ทางเดินหลักด้านล่าง',name:'',x:1,y:94,w:98,h:5,status:'active'}
    ];

    function clone(value) { return JSON.parse(JSON.stringify(value == null ? null : value)); }
    function elementId() { return 'map-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function upper(value) { return String(value == null ? '' : value).trim().toUpperCase(); }
    function safeId(value) { return encodeURIComponent(String(value == null ? '' : value).trim()).replace(/%2F/gi, '_'); }
    function nowId(prefix) { return (prefix || 'FZ') + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); }
    function numberValue(value) {
        var n = parseFloat(String(value == null ? '' : value).replace(/,/g, '').trim());
        return isFinite(n) ? n : 0;
    }
    function millisValue(value) {
        if (value == null || value === '') return 0;
        try {
            if (value && typeof value.toMillis === 'function') return Number(value.toMillis()) || 0;
            if (value instanceof Date) return value.getTime() || 0;
            if (typeof value === 'number') return isFinite(value) ? value : 0;
            var n = Number(value);
            if (isFinite(n) && n > 0) return n;
            var parsed = Date.parse(value);
            return isFinite(parsed) ? parsed : 0;
        } catch (e) { return 0; }
    }
    function thaiDateTime(ms) {
        try { return new Date(ms || Date.now()).toLocaleString('th-TH'); } catch (e) { return ''; }
    }
    function currentUser() {
        return (window.app && window.app.state && window.app.state.ui && window.app.state.ui.currentUser) || 'Unknown';
    }
    function isManager() {
        var app = window.app;
        var user = currentUser();
        var cleanUser = String(user || '').replace(/^Admin:\s*/, '').trim();
        var role = String((app && (app._pendingRole || (app.state && app.state.ui && app.state.ui.currentRole))) || '').toLowerCase();
        var allowedRoles = ['master', 'masteradmin', 'superadmin', 'admin', 'supervisor', 'manager', 'full_access'];
        if (user === 'Supervisor' || user === 'Admin' || user === 'Manager' || user === 'หัวหน้า' || /^Admin:/.test(user) || allowedRoles.indexOf(role) !== -1) return true;
        try {
            if (app && typeof app._nwIsAdminUser === 'function' && app._nwIsAdminUser()) return true;
            if (app && typeof app._nwIsSuperAdminUser === 'function' && app._nwIsSuperAdminUser()) return true;
            var roles = app && typeof app.getUserRoles === 'function' ? app.getUserRoles(cleanUser) : [];
            return Array.isArray(roles) && roles.some(function (r) { return allowedRoles.indexOf(String(r || '').toLowerCase()) !== -1; });
        } catch (e) { return false; }
    }
    function toast(message, type) {
        try {
            if (window.app && typeof window.app.toast === 'function') return window.app.toast(message, type || 'info');
            if (window.app && type === 'error' && typeof window.app.showError === 'function') return window.app.showError(message);
            if (window.app && typeof window.app.showSuccess === 'function') return window.app.showSuccess(message);
        } catch (e) {}
        console.log('[F-Zone]', message);
    }
    function qrDataUrl(text, cellSize, margin) {
        try {
            if (typeof qrcode !== 'function') return '';
            var qr = qrcode(0, 'M');
            qr.addData(String(text));
            qr.make();
            return qr.createDataURL(cellSize || 4, margin == null ? 2 : margin);
        } catch (e) {
            console.warn('F-Zone QR error', e);
            return '';
        }
    }

    var FZ = {
        version: VERSION,
        collections: COL,
        state: {
            ready: false,
            available: true,
            error: null,
            settings: Object.assign({}, DEFAULT_SETTINGS),
            locations: [],
            pallets: [],
            placements: [],
            maps: {},
            previewMaps: {},
            selectedReceivingPoint: '',
            selectedTopupPoint: '',
            currentTab: 'map',
            mapParent: 'F-AAD',
            mapSearch: '',
            mapZoom: 1,
            editorParent: 'F-AAD',
            editorDraft: [],
            editorLoadedParent: '',
            editorSelected: '',
            editorTool: 'select',
            editorUndo: [],
            editorRedo: [],
            editorDirty: false,
            editorClipboard: null,
            palletSelectedPoints: [],
            moveDestination: null,
            moveQueue: [],
            pendingPalletId: '',
            deepLinkHandled: '',
            listeners: [],
            initialized: false
        },

        init: async function () {
            if (this.state.initialized) return;
            this.state.initialized = true;
            try {
                await this.waitForCore();
                // Production architecture: PLAS is only a launcher. Never start the
                // legacy F-Zone database/listeners/receiving hooks, even if the bridge
                // script fails to load. This prevents operational F-Zone writes from
                // leaking back into the PLAS Firebase project.
                this.injectQuickHubEntry();
                this.injectTopLocationSearchButtons();
                this.updateEntryVisibility();
                console.log((window.PlasFZoneBridge ? '✅ PLAS_FZONE_STANDALONE_BRIDGE_' : '⚠️ PLAS_FZONE_DIRECT_LOGIN_FALLBACK_') + VERSION + '_ACTIVE');
                return;
            } catch (e) {
                this.state.available = false;
                this.state.error = e;
                console.error('❌ F-Zone init failed; PLAS core remains active:', e);
                this.updateEntryVisibility();
            }
        },

        waitForCore: function () {
            return new Promise(function (resolve, reject) {
                var attempts = 0;
                var timer = setInterval(function () {
                    attempts++;
                    if (window.app && window.db && typeof window.app.openModal === 'function') {
                        clearInterval(timer);
                        var authReady = window._plasAuthReady;
                        if (authReady && typeof authReady.then === 'function') {
                            Promise.race([
                                authReady.catch(function () { return null; }),
                                new Promise(function (done) { setTimeout(function () { done(null); }, 3000); })
                            ]).then(resolve);
                        } else resolve();
                    } else if (attempts > 200) {
                        clearInterval(timer);
                        reject(new Error('PLAS core not found'));
                    }
                }, 50);
            });
        },

        installUi: function () {
            if (!document.getElementById('fzone-overlay')) {
                var overlay = document.createElement('div');
                overlay.id = 'fzone-overlay';
                overlay.className = 'hidden';
                overlay.style.cssText = 'position:fixed;inset:0;z-index:10020;overflow-y:auto;background:#f8fafc;';
                overlay.innerHTML = '<div class="fz-shell"><div id="fzone-render-root"></div></div>';
                document.body.appendChild(overlay);
            }
            this.injectQuickHubEntry();
            this.injectTopLocationSearchButtons();
            this.injectReceivingPlacementBox();
            this.injectTopupPlacementBox();
            this.updateEntryVisibility();
        },

        injectQuickHubEntry: function () {
            var items = document.getElementById('quick-hub-items');
            if (!items || document.getElementById('qh-fzone-entry')) return;
            var btn = document.createElement('button');
            btn.id = 'qh-fzone-entry';
            btn.type = 'button';
            btn.className = 'qh-item';
            btn.setAttribute('data-i', '6');
            btn.setAttribute('aria-label', 'เปิดแผนผัง BORNEO F-Zone');
            btn.onclick = function () { FZ.launchExternal({ tab:'map' }, btn); };
            btn.innerHTML = '<span class="qh-label">F-Zone</span><span class="qh-dot" style="background:#0f766e;position:relative;"><i class="ph ph-map-trifold"></i><span id="hub-fzone-count" class="hidden qh-badge">0</span></span>';
            items.appendChild(btn);
        },

        injectTopLocationSearchButtons: function () {
            var userView = document.getElementById('view-topup');
            if (userView && !document.getElementById('btn-fzone-topup-search')) {
                var bar = document.createElement('div');
                bar.id = 'btn-fzone-topup-search';
                bar.className = 'bg-teal-50 border-2 border-teal-200 rounded-2xl p-3 flex items-center gap-3';
                bar.innerHTML = '<div class="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center"><i class="ph ph-magnifying-glass text-xl"></i></div><div class="flex-1"><div class="font-bold text-teal-800">ค้นหา Item ในพื้นที่ F</div><div class="text-xs text-teal-600">ค้นจาก QR พาเลท, Item, Location หรือจุดวางจริง</div></div><button type="button" onclick="window.FZone.launchExternal({tab:\'search\'},this)" class="px-4 py-2.5 bg-teal-700 text-white rounded-xl font-bold">ค้นหา</button>';
                userView.insertBefore(bar, userView.firstChild);
            }
            var adminView = document.getElementById('admin-view-topup');
            if (adminView && !document.getElementById('btn-fzone-admin-search')) {
                var btn = document.createElement('button');
                btn.id = 'btn-fzone-admin-search';
                btn.className = 'fz-btn fz-btn-secondary';
                btn.style.cssText = 'position:absolute;right:18px;top:18px;z-index:5;';
                btn.innerHTML = '<i class="ph ph-magnifying-glass"></i> ค้นหา Item ใน F';
                btn.onclick = function () { FZ.launchExternal({ tab:'search' }, btn); };
                adminView.style.position = 'relative';
                adminView.appendChild(btn);
            }
        },

        injectReceivingPlacementBox: function () {
            var shared = document.getElementById('shared-input-area');
            if (!shared || document.getElementById('fzone-receiving-placement')) return;
            var box = document.createElement('div');
            box.id = 'fzone-receiving-placement';
            box.className = 'fz-placement-card hidden';
            box.innerHTML = '<div class="fz-placement-title"><i class="ph ph-map-pin-area"></i> เลือกจุดวางจริงใน F-Zone <span id="fz-recv-mode" class="fz-badge">Optional</span></div><div class="fz-placement-help" id="fz-recv-help">แสดงเฉพาะ Location ที่เปิดใช้งานใน F-Zone Config</div><div class="fz-row" style="margin-top:9px"><input id="fz-recv-scan" class="fz-input" style="flex:1" placeholder="สแกน QR Zone หรือเลือกจุดด้านล่าง"><button class="fz-btn fz-btn-secondary" type="button" onclick="window.FZone.applyZoneScan(\'receiving\')"><i class="ph ph-qr-code"></i> ใช้ QR</button></div><div id="fz-recv-points" class="fz-point-grid"></div><button id="fz-recv-pallet-btn" type="button" class="fz-btn fz-btn-dark" style="width:100%;margin-top:10px" onclick="window.FZone.openPalletFromReceiving()"><i class="ph ph-stack"></i> Split ตาม ON PALLET / สร้าง QR พาเลท</button>';
            shared.appendChild(box);
        },

        injectTopupPlacementBox: function () {
            var modal = document.getElementById('modal-confirm-finish');
            if (!modal || document.getElementById('fzone-topup-placement')) return;
            var panel = modal.querySelector('.bg-white');
            var buttons = panel && panel.querySelector('.flex.gap-4');
            if (!panel || !buttons) return;
            var box = document.createElement('div');
            box.id = 'fzone-topup-placement';
            box.className = 'fz-placement-card hidden';
            box.style.textAlign = 'left';
            box.innerHTML = '<div class="fz-placement-title"><i class="ph ph-map-pin-area"></i> จุดวางจริง <span id="fz-topup-mode" class="fz-badge">Optional</span></div><div class="fz-row" style="margin-top:8px"><input id="fz-topup-scan" class="fz-input" style="flex:1" placeholder="สแกน QR Zone"><button type="button" class="fz-btn fz-btn-secondary" onclick="window.FZone.applyZoneScan(\'topup\')"><i class="ph ph-qr-code"></i></button></div><div id="fz-topup-points" class="fz-point-grid"></div>';
            panel.insertBefore(box, buttons);
        },

        startListeners: function () {
            var db = window.db;
            var self = this;
            try {
                this.state.listeners.push(db.collection(COL.SETTINGS).doc('main').onSnapshot(function (snap) {
                    if (snap.exists) {
                        self.state.settings = Object.assign({}, DEFAULT_SETTINGS, snap.data() || {});
                    } else {
                        self.state.settings = Object.assign({}, DEFAULT_SETTINGS);
                        db.collection(COL.SETTINGS).doc('main').set(self.state.settings, { merge: true }).catch(function (e) {
                            console.warn('F-Zone default settings save skipped:', e);
                        });
                    }
                    self.state.ready = true;
                    self.state.available = true;
                    self.updateEntryVisibility();
                    self.refreshContextBoxes();
                    self.renderIfOpen();
                }, this.listenerError.bind(this, 'settings')));

                this.state.listeners.push(db.collection(COL.LOCATIONS).onSnapshot(function (snap) {
                    var list = [];
                    snap.forEach(function (d) { list.push(Object.assign({ _id: d.id }, d.data())); });
                    list.sort(function (a, b) { return (a.parentId + a.code).localeCompare(b.parentId + b.code); });
                    self.state.locations = list;
                    self.state.ready = true;
                    self.updateEntryVisibility();
                    self.refreshContextBoxes();
                    self.renderIfOpen();
                }, this.listenerError.bind(this, 'locations')));

                this.state.listeners.push(db.collection(COL.MAPS).onSnapshot(function (snap) {
                    var maps = {};
                    snap.forEach(function (d) {
                        var data = d.data() || {};
                        var parentId = upper(data.parentId || d.id);
                        if (parentId) maps[parentId] = Object.assign({ _id: d.id }, data, { parentId: parentId });
                    });
                    self.state.maps = maps;
                    self.renderIfOpen();
                }, this.listenerError.bind(this, 'maps')));

                this.state.listeners.push(db.collection(COL.PALLETS).orderBy('createdAt', 'desc').limit(500).onSnapshot(function (snap) {
                    var list = [];
                    snap.forEach(function (d) { list.push(Object.assign({ _id: d.id }, d.data())); });
                    self.state.pallets = list;
                    self.tryPendingPallet();
                    self.updateCounts();
                    self.renderIfOpen();
                }, this.listenerError.bind(this, 'pallets')));

                this.state.listeners.push(db.collection(COL.PLACEMENTS).orderBy('updatedAt', 'desc').limit(500).onSnapshot(function (snap) {
                    var list = [];
                    snap.forEach(function (d) { list.push(Object.assign({ _id: d.id }, d.data())); });
                    self.state.placements = list;
                    self.renderIfOpen();
                }, this.listenerError.bind(this, 'placements')));
            } catch (e) {
                this.listenerError('start', e);
            }
        },

        listenerError: function (part, error) {
            this.state.available = false;
            this.state.error = error;
            console.warn('⚠️ F-Zone ' + part + ' unavailable; core flow continues:', error);
            this.updateEntryVisibility();
            this.refreshContextBoxes();
        },

        enabled: function () {
            return this.state.settings.moduleEnabled !== false && this.state.settings.featureMode !== 'off';
        },

        updateEntryVisibility: function () {
            var show = this.enabled();
            ['qh-fzone-entry', 'btn-fzone-topup-search', 'btn-fzone-admin-search'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.style.display = show ? '' : 'none';
            });
        },

        updateCounts: function () {
            var el = document.getElementById('hub-fzone-count');
            if (!el) return;
            var count = (this.state.pallets || []).filter(function (p) { return p.status !== 'archived'; }).length;
            el.textContent = count;
            el.classList.toggle('hidden', count === 0);
        },

        locationConfig: function (location) {
            var code = upper(location);
            if (!code || !this.enabled()) return null;
            return (this.state.locations || []).find(function (l) { return l.enabled !== false && upper(l.code) === code; }) || null;
        },

        pointsFor: function (location) {
            var cfg = this.locationConfig(location);
            if (!cfg) return [];
            return Array.isArray(cfg.points) ? cfg.points.filter(Boolean).map(upper) : [];
        },

        refreshContextBoxes: function () {
            try {
                var item = window.app && window.app.state && window.app.state.current && window.app.state.current.item;
                var input = document.getElementById('inp-new-loc');
                this.renderPlacementBox('receiving', input ? input.value : (item && (item.newLoc || item.oldLoc)));
                var pendingId = window.app && window.app.state && window.app.state.current && window.app.state.current.pendingFinishId;
                var job = pendingId && window.app.state.data.replenishmentJobs.find(function (j) { return String(j.id) === String(pendingId); });
                this.renderPlacementBox('topup', job && job.toLoc);
            } catch (e) {
                console.warn('F-Zone context refresh skipped', e);
            }
        },

        renderPlacementBox: function (kind, location) {
            var prefix = kind === 'topup' ? 'fz-topup' : 'fz-recv';
            var box = document.getElementById(kind === 'topup' ? 'fzone-topup-placement' : 'fzone-receiving-placement');
            if (!box) return;
            var cfg = this.locationConfig(location);
            var usable = !!cfg && this.state.available;
            box.classList.toggle('hidden', !usable);
            if (!usable) {
                if (kind === 'topup') this.state.selectedTopupPoint = '';
                else this.state.selectedReceivingPoint = '';
                return;
            }
            var mode = this.state.settings.featureMode || 'optional';
            var badge = document.getElementById(prefix + '-mode');
            if (badge) { badge.textContent = mode === 'required' ? 'Required' : 'Optional'; badge.className = 'fz-badge' + (mode === 'required' ? ' warn' : ''); }
            var points = this.pointsFor(location);
            var selected = kind === 'topup' ? this.state.selectedTopupPoint : this.state.selectedReceivingPoint;
            if (selected && points.indexOf(selected) === -1) selected = '';
            var container = document.getElementById(prefix + '-points');
            if (container) {
                if (!points.length) container.innerHTML = '<div class="fz-muted" style="grid-column:1/-1;padding:8px">Location นี้เปิดใช้แล้ว แต่ยังไม่ได้เพิ่มจุดวาง — ยังบันทึกงานหลักได้ตามปกติ</div>';
                else container.innerHTML = points.map(function (p) {
                    return '<button type="button" class="fz-point ' + (p === selected ? 'active' : '') + '" onclick="window.FZone.selectPoint(\'' + kind + '\',\'' + esc(p) + '\')">' + esc(p) + '</button>';
                }).join('');
            }
        },

        selectPoint: function (kind, point) {
            point = upper(point);
            if (kind === 'topup') this.state.selectedTopupPoint = point;
            else this.state.selectedReceivingPoint = point;
            this.refreshContextBoxes();
        },

        parseDeepLink: function (raw) {
            var text = String(raw || '').trim();
            if (!text || typeof URL === 'undefined') return null;
            try {
                var url = new URL(text, window.location && window.location.href ? window.location.href : 'https://plas.invalid/');
                var legacyMove = (url.searchParams.get('fzone') || '').toLowerCase() === 'move';
                var type = (url.searchParams.get('fzType') || url.searchParams.get('type') || '').toLowerCase();
                var pathMatch = String(url.pathname || '').match(/\/p\/([^/?#]+)/i);
                var palletId = upper(pathMatch ? decodeURIComponent(pathMatch[1]) : (url.searchParams.get('pallet') || ''));
                var parentId = upper(url.searchParams.get('parent') || '');
                var location = upper(url.searchParams.get('location') || '');
                var point = upper(url.searchParams.get('point') || '');
                if (palletId) return { type: 'pallet', palletId: palletId };
                if (type === 'zone' || location || point) return { type: 'zone', parentId: parentId, location: location, point: point };
                if (!legacyMove) return null;
            } catch (e) {}
            return null;
        },

        buildMoveUrl: function (data) {
            data = data || {};
            try {
                var url = data.palletId
                    ? new URL('/p/' + encodeURIComponent(upper(data.palletId)), MOVE_SITE_URL)
                    : new URL(MOVE_SITE_URL);
                if (!data.palletId) {
                    url.searchParams.set('type', 'zone');
                    url.searchParams.set('parent', upper(data.parentId));
                    url.searchParams.set('location', upper(data.location));
                    url.searchParams.set('point', upper(data.point));
                }
                return url.toString();
            } catch (e) {
                if (data.palletId) return String(MOVE_SITE_URL).replace(/\/$/, '') + '/p/' + encodeURIComponent(upper(data.palletId));
                return MOVE_SITE_URL + '?type=zone&parent=' + encodeURIComponent(upper(data.parentId)) + '&location=' + encodeURIComponent(upper(data.location)) + '&point=' + encodeURIComponent(upper(data.point));
            }
        },

        launchExternal: async function (params, trigger) {
            try {
                if (window.app && typeof window.app._closeQuickHub === 'function') window.app._closeQuickHub();
                if (trigger) {
                    trigger.setAttribute('aria-busy', 'true');
                    trigger.classList.add('is-launching');
                }
                if (window.PlasFZoneBridge && typeof window.PlasFZoneBridge.open === 'function') {
                    return await window.PlasFZoneBridge.open(params || { tab:'map' });
                }
                var target = MOVE_SITE_URL;
                try {
                    var u = new URL(target);
                    Object.keys(params || {}).forEach(function (key) {
                        var value = params[key];
                        if (value !== undefined && value !== null && String(value) !== '') u.searchParams.set(key, String(value));
                    });
                    target = u.toString();
                } catch (e) {}
                var w = window.open(target, '_blank', 'noopener');
                if (!w) window.location.href = target;
                return true;
            } catch (error) {
                toast('เปิดแผนผัง F-Zone ไม่สำเร็จ: ' + (error.message || error), 'error');
                return false;
            } finally {
                if (trigger) {
                    trigger.removeAttribute('aria-busy');
                    trigger.classList.remove('is-launching');
                }
            }
        },

        openMoveSite: function (params) {
            return this.launchExternal(params || { tab:'move' });
        },

        parseZoneQr: function (raw) {
            var text = String(raw || '').trim();
            if (!text) return null;
            var link = this.parseDeepLink(text);
            if (link && link.type === 'zone') return { parentId: link.parentId || '', location: upper(link.location || ''), point: upper(link.point || '') };
            if (text.indexOf('FZONE|ZONE|') === 0) {
                var parts = text.split('|');
                return { parentId: parts[2] || '', location: upper(parts[3] || ''), point: upper(parts[4] || '') };
            }
            try {
                var obj = JSON.parse(text);
                if (obj && obj.type === 'FZONE_ZONE') return { parentId: obj.parentId || '', location: upper(obj.location), point: upper(obj.point) };
            } catch (e) {}
            return null;
        },

        parsePalletQr: function (raw) {
            var text = String(raw || '').trim();
            if (!text) return '';
            var link = this.parseDeepLink(text);
            if (link && link.type === 'pallet') return upper(link.palletId);
            if (text.indexOf('FZONE|PALLET|') === 0) return upper(text.split('|')[2] || '');
            try {
                var obj = JSON.parse(text);
                if (obj && (obj.type === 'FZONE_PALLET' || obj.palletId)) return upper(obj.palletId || obj.id || '');
            } catch (e) {}
            return upper(text);
        },

        applyZoneScan: function (kind) {
            var input = document.getElementById(kind === 'topup' ? 'fz-topup-scan' : 'fz-recv-scan');
            var parsed = this.parseZoneQr(input && input.value);
            if (!parsed) return toast('QR Zone ไม่ถูกต้อง', 'error');
            var currentLoc = '';
            if (kind === 'topup') {
                var id = window.app.state.current.pendingFinishId;
                var job = window.app.state.data.replenishmentJobs.find(function (j) { return String(j.id) === String(id); });
                currentLoc = upper(job && job.toLoc);
            } else {
                var locInput = document.getElementById('inp-new-loc');
                currentLoc = upper(locInput && locInput.value);
            }
            if (parsed.location !== currentLoc) return toast('QR นี้เป็นของ ' + parsed.location + ' แต่รายการปัจจุบันคือ ' + (currentLoc || '-'), 'error');
            this.selectPoint(kind, parsed.point);
            toast('เลือกจุด ' + parsed.point + ' แล้ว', 'success');
        },

        installReceivingHook: function () {
            var app = window.app;
            if (app.__fzoneReceivingHooked) return;
            app.__fzoneReceivingHooked = true;
            var originalOpen = app.openModal;
            app.openModal = function () {
                var result = originalOpen.apply(this, arguments);
                try { setTimeout(function () { FZ.state.selectedReceivingPoint = ''; FZ.refreshContextBoxes(); }, 0); } catch (e) {}
                return result;
            };
            var originalPerform = app.performSave;
            app.performSave = async function (val, isConfirm) {
                var placement = null;
                try {
                    var item = this.state.current.item;
                    var loc = upper(val);
                    var cfg = FZ.locationConfig(loc);
                    var selected = FZ.state.selectedReceivingPoint;
                    var required = FZ.state.available && cfg && FZ.state.settings.featureMode === 'required' && FZ.pointsFor(loc).length > 0;
                    if (isConfirm && required && !selected) {
                        toast('กรุณาเลือกจุดวางจริงก่อนยืนยัน', 'error');
                        return;
                    }
                    if (isConfirm && cfg && selected) {
                        placement = {
                            sourceType: 'receiving', sourceId: item && item.id, item: item && item.code,
                            description: item && item.desc, qty: item && item.qty, parentId: cfg.parentId,
                            location: loc, point: selected, user: currentUser()
                        };
                    }
                } catch (e) {
                    FZ.listenerError('receiving-hook', e);
                    placement = null;
                }
                // Core Production is always called unless Required validation intentionally blocks it.
                var result = await originalPerform.apply(this, arguments);
                if (placement && result === true) {
                    Promise.resolve(FZ.savePlacement(placement)).catch(function (e) { console.warn('F-Zone placement save failed; receiving already saved', e); toast('Receiving บันทึกแล้ว แต่ F-Zone ซิงค์ไม่สำเร็จ', 'info'); });
                }
                return result;
            };
            var locInput = document.getElementById('inp-new-loc');
            if (locInput && !locInput.__fzoneBound) {
                locInput.__fzoneBound = true;
                locInput.addEventListener('input', function () { FZ.state.selectedReceivingPoint = ''; FZ.renderPlacementBox('receiving', locInput.value); });
            }
        },

        installLoginDeepLinkHook: function () {
            var app = window.app;
            if (!app || app.__fzoneDeepLinkLoginHooked || typeof app.login !== 'function') return;
            app.__fzoneDeepLinkLoginHooked = true;
            var originalLogin = app.login;
            app.login = function () {
                var result = originalLogin.apply(this, arguments);
                setTimeout(function () { FZ.processDeepLink(); }, 250);
                return result;
            };
        },

        hasLoggedInUser: function () {
            return !!(window.app && window.app.state && window.app.state.ui && window.app.state.ui.currentUser);
        },

        processDeepLink: function () {
            if (!this.hasLoggedInUser() || !window.location) return false;
            var link = this.parseDeepLink(window.location.href);
            if (!link) return false;
            var signature = link.type + '|' + (link.palletId || '') + '|' + (link.parentId || '') + '|' + (link.location || '') + '|' + (link.point || '');
            if (this.state.deepLinkHandled === signature) return true;
            this.state.deepLinkHandled = signature;
            if (link.type === 'zone') {
                this.setMoveDestination({ parentId: link.parentId, location: link.location, point: link.point }, false);
                this.open('move');
                toast('เลือกปลายทาง ' + (link.point || link.location) + ' แล้ว — สแกน QR พาเลทต่อได้เลย', 'success');
            } else if (link.type === 'pallet') {
                this.restoreMoveDestination();
                this.state.pendingPalletId = link.palletId;
                this.open('move');
                this.tryPendingPallet();
            }
            try {
                var clean = new URL(window.location.href);
                ['fzone','fzType','parent','location','point','pallet'].forEach(function (key) { clean.searchParams.delete(key); });
                window.history.replaceState({}, document.title, clean.pathname + (clean.search ? clean.search : '') + (clean.hash || ''));
            } catch (e) {}
            return true;
        },

        installTopupHook: function () {
            var app = window.app;
            if (app.__fzoneTopupHooked) return;
            app.__fzoneTopupHooked = true;
            var originalFinish = app.finishJob;
            app.finishJob = function (id) {
                var result = originalFinish.apply(this, arguments);
                try { setTimeout(function () { FZ.state.selectedTopupPoint = ''; FZ.refreshContextBoxes(); }, 0); } catch (e) {}
                return result;
            };
            var originalConfirm = app.confirmFinishJob;
            app.confirmFinishJob = async function () {
                var placement = null;
                try {
                    var id = this.state.current.pendingFinishId;
                    var job = this.state.data.replenishmentJobs.find(function (j) { return String(j.id) === String(id); });
                    var loc = upper(job && job.toLoc);
                    var cfg = FZ.locationConfig(loc);
                    var selected = FZ.state.selectedTopupPoint;
                    var required = FZ.state.available && cfg && FZ.state.settings.featureMode === 'required' && FZ.pointsFor(loc).length > 0;
                    if (required && !selected) {
                        toast('กรุณาเลือกจุดวางจริงก่อนจบงาน', 'error');
                        return;
                    }
                    if (cfg && selected && job) {
                        placement = {
                            sourceType: 'toplocation', sourceId: job.id, item: job.item, description: job.remark,
                            qty: job.qty, parentId: cfg.parentId, location: loc, point: selected, user: currentUser()
                        };
                    }
                } catch (e) {
                    FZ.listenerError('toplocation-hook', e);
                    placement = null;
                }
                // Core Production is always called unless Required validation intentionally blocks it.
                var result = await originalConfirm.apply(this, arguments);
                if (placement && result === true) {
                    Promise.resolve(FZ.savePlacement(placement)).catch(function (e) { console.warn('F-Zone placement save failed; top location already finished', e); toast('Top Location จบงานแล้ว แต่ F-Zone ซิงค์ไม่สำเร็จ', 'info'); });
                }
                return result;
            };
        },

        savePlacement: async function (data) {
            if (!this.state.available || !window.db) throw new Error('F-Zone unavailable');
            var id = data.sourceType + '-' + safeId(data.sourceId || nowId('SRC'));
            var payload = Object.assign({}, data, { id: id, updatedAt: Date.now(), updatedBy: currentUser() });
            await window.db.collection(COL.PLACEMENTS).doc(id).set(payload, { merge: true });
            return payload;
        },

        repairMojibake: function (value) {
            var text = String(value == null ? '' : value)
                .replace(/^\uFEFF/, '').replace(/\u00A0/g, ' ').replace(/[\u200B-\u200D\u2060]/g, '')
                .replace(/\r\n?/g, '\n');
            if (!/[ÃÂà¸à¹]/.test(text) || typeof TextDecoder === 'undefined') return text;
            var cp1252 = {
                0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,
                0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,
                0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,
                0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F
            };
            function decodeCell(cell) {
                if (!/[ÃÂà¸à¹]/.test(cell)) return cell;
                try {
                    var bytes = [];
                    for (var i = 0; i < cell.length; i++) {
                        var code = cell.charCodeAt(i);
                        if (code <= 255) bytes.push(code);
                        else if (cp1252[code] != null) bytes.push(cp1252[code]);
                        else return cell;
                    }
                    var decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
                    return /[\u0E00-\u0E7F]/.test(decoded) ? decoded : cell;
                } catch (e) { return cell; }
            }
            // Excel paste can contain correctly decoded Thai and mojibake in different cells.
            return text.split(/(\t|\n)/).map(function (part) { return part === '\t' || part === '\n' ? part : decodeCell(part); }).join('');
        },

        normalizeImportTextareas: function () {
            ['import-area', 'tp-import-data'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el && el.value) el.value = FZ.repairMojibake(el.value);
            });
        },

        installImportRepair: function () {
            var app = window.app;
            ['previewImport', 'previewTopUpImport', 'showTopUpPreviewTable', 'processTopUpImport'].forEach(function (name) {
                var original = app[name];
                if (typeof original !== 'function' || original.__fzoneWrapped) return;
                var wrapped = function () {
                    try { FZ.normalizeImportTextareas(); }
                    catch (e) { FZ.listenerError('import-repair', e); }
                    return original.apply(this, arguments);
                };
                wrapped.__fzoneWrapped = true;
                app[name] = wrapped;
            });
            ['import-area', 'tp-import-data'].forEach(function (id) {
                var el = document.getElementById(id);
                if (!el || el.__fzonePasteBound) return;
                el.__fzonePasteBound = true;
                el.addEventListener('paste', function () {
                    setTimeout(function () {
                        var fixed = FZ.repairMojibake(el.value);
                        if (fixed !== el.value) {
                            el.value = fixed;
                            toast('แก้ Encoding ภาษาไทยจากข้อมูล Import แล้ว', 'success');
                        }
                    }, 0);
                });
            });
        },

        open: function (tab) {
            if (!this.enabled()) return toast('F-Zone ถูกปิดใน Feature Flag', 'info');
            this.state.currentTab = tab || this.state.currentTab || 'map';
            var overlay = document.getElementById('fzone-overlay');
            if (!overlay) return;
            overlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            if (window.app && typeof window.app._closeQuickHub === 'function') window.app._closeQuickHub();
            this.render();
        },

        close: function () {
            var overlay = document.getElementById('fzone-overlay');
            if (overlay) overlay.classList.add('hidden');
            document.body.style.overflow = '';
        },

        setTab: function (tab) {
            if ((tab === 'config' || tab === 'mapedit') && !isManager()) tab = 'map';
            if (tab === 'mapedit' && this.state.editorLoadedParent !== upper(this.state.editorParent || this.state.mapParent || 'F-AAD')) this.loadEditorDraft(this.state.editorParent || this.state.mapParent || 'F-AAD');
            this.state.currentTab = tab;
            this.render();
        },

        renderIfOpen: function () {
            var overlay = document.getElementById('fzone-overlay');
            if (overlay && !overlay.classList.contains('hidden')) this.render();
        },

        render: function () {
            var root = document.getElementById('fzone-render-root');
            if (!root) return;
            var tab = this.state.currentTab;
            if ((tab === 'config' || tab === 'mapedit') && !isManager()) tab = this.state.currentTab = 'map';
            var mode = this.state.settings.featureMode || 'optional';
            var tabs = [
                ['map', 'map-trifold', 'แผนผังพื้นที่'],
                ['move', 'arrows-left-right', 'ย้าย F'],
                ['search', 'magnifying-glass', 'ค้นหา Item'],
                ['pallets', 'stack', 'QR พาเลท'],
                ['zoneprint', 'printer', 'พิมพ์ QR Zone']
            ];
            if (isManager()) {
                tabs.push(['mapedit', 'pencil-ruler', 'สร้าง/แก้ไขแผนผัง']);
                tabs.push(['config', 'gear-six', 'F-Zone Config']);
            }
            var body = tab === 'map' ? this.renderMap() : tab === 'move' ? this.renderMove() : tab === 'mapedit' ? this.renderMapEditor() : tab === 'pallets' ? this.renderPallets() : tab === 'zoneprint' ? this.renderZonePrint() : tab === 'config' ? this.renderConfig() : this.renderSearch();
            root.innerHTML = '<div class="fz-header"><div class="fz-header-row"><div class="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center"><i class="ph ph-map-trifold text-2xl"></i></div><div><div class="fz-title">F-Zone</div><div class="fz-subtitle">โมดูลเสริม · ใช้ Login / Firebase / Role เดิม · Mode: ' + esc(mode) + '</div></div><button class="fz-close" onclick="window.FZone.close()"><i class="ph ph-x text-2xl"></i></button></div><div class="fz-tabs">' + tabs.map(function (t) { return '<button class="fz-tab ' + (tab === t[0] ? 'active' : '') + '" onclick="window.FZone.setTab(\'' + t[0] + '\')"><i class="ph ph-' + t[1] + '"></i> ' + t[2] + '</button>'; }).join('') + '</div></div><div class="fz-body">' + (this.state.available ? '' : '<div class="fz-card" style="border-color:#fcd34d;background:#fffbeb;margin-bottom:12px"><b>F-Zone เชื่อมต่อไม่ได้ชั่วคราว</b><div class="fz-muted">Receiving และ Top Location เดิมยังใช้งานได้ตามปกติ</div></div>') + body + '</div>';
            this.afterRender(tab);
        },

        afterRender: function (tab) {
            if (tab === 'search') this.runSearch();
            if (tab === 'move') this.afterRenderMove();
            if (tab === 'pallets') setTimeout(function(){ FZ.updatePalletPointSummary(); },0);
            if (tab === 'pallets') this.populatePalletSelectors();
            if (tab === 'config') this.renderLocationAdminList();
            if (tab === 'zoneprint') this.renderZonePrintList();
            if (tab === 'mapedit') this.setupMapEditor();
        },

        mapParents: function () {
            var map = {};
            map['F-AAD'] = { id: 'F-AAD', name: 'พื้นที่ F-AAD' };
            this.parents().forEach(function (p) {
                if (p && p.id) map[upper(p.id)] = { id: upper(p.id), name: p.name || p.id };
            });
            Object.keys(this.state.maps || {}).forEach(function (id) {
                id = upper(id);
                if (id && !map[id]) map[id] = { id: id, name: id };
            });
            (this.state.locations || []).forEach(function (l) {
                var id = upper(l.parentId);
                if (id && !map[id]) map[id] = { id: id, name: l.parentName || id };
            });
            (this.state.pallets || []).forEach(function (p) {
                var id = upper(p.parentId);
                if (id && !map[id]) map[id] = { id: id, name: id };
            });
            (this.state.placements || []).forEach(function (p) {
                var id = upper(p.parentId);
                if (id && !map[id]) map[id] = { id: id, name: id };
            });
            return Object.keys(map).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); }).map(function (k) { return map[k]; });
        },

        getMapElements: function (parentId) {
            var id = upper(parentId || 'F-AAD');
            var preview = this.state.previewMaps[id];
            if (Array.isArray(preview)) return preview;
            var doc = this.state.maps[id];
            if (doc && Array.isArray(doc.elements)) return doc.elements;
            return id === 'F-AAD' ? DEFAULT_F_AAD_MAP : [];
        },

        selectMapParent: function (parentId) {
            this.state.mapParent = upper(parentId || 'F-AAD');
            this.state.mapSearch = '';
            this.render();
        },

        setMapSearch: function (value) {
            this.state.mapSearch = String(value || '').trim();
            this.render();
        },

        setMapZoom: function (delta, absolute) {
            var next = absolute != null ? Number(absolute) : Number(this.state.mapZoom || 1) + Number(delta || 0);
            this.state.mapZoom = Math.max(.6, Math.min(1.5, next));
            this.render();
        },

        mapStats: function (parentId, location, point) {
            var parent = upper(parentId), loc = upper(location), pt = upper(point);
            var matches = function (p) {
                if (p.status === 'archived') return false;
                var sameParent = !parent || upper(p.parentId) === parent;
                var sameLoc = !loc || upper(p.location) === loc || upper(p.point) === loc;
                var samePoint = !pt || upper(p.point) === pt;
                return sameParent && sameLoc && samePoint;
            };
            var pallets = (this.state.pallets || []).filter(matches);
            var placements = (this.state.placements || []).filter(matches);
            return {
                pallets: pallets.length,
                palletQty: pallets.reduce(function (sum, p) { return sum + numberValue(p.qty); }, 0),
                placements: placements.length,
                placementQty: placements.reduce(function (sum, p) { return sum + numberValue(p.qty); }, 0)
            };
        },

        mapHitCodes: function (parentId, query) {
            var q = upper(query);
            var hits = {};
            if (!q) return hits;
            this.getMapElements(parentId).forEach(function (el) {
                if ([el.code, el.name, el.type].join(' ').toUpperCase().indexOf(q) !== -1) hits[upper(el.code)] = true;
            });
            (this.state.pallets || []).concat(this.state.placements || []).forEach(function (p) {
                if (upper(p.parentId) !== upper(parentId)) return;
                var hay = [p.palletId, p.qrValue, p.item, p.description, p.location, p.point, p.sourceId].join(' ').toUpperCase();
                if (hay.indexOf(q) !== -1) {
                    if (p.location) hits[upper(p.location)] = true;
                    if (p.point) hits[upper(p.point)] = true;
                }
            });
            return hits;
        },

        openMapSearch: function (parentId, location, point) {
            this.state.currentTab = 'search';
            this.render();
            var input = document.getElementById('fz-search-input');
            if (input) input.value = [upper(parentId), upper(location), upper(point)].filter(Boolean).join(' ');
            this.runSearch();
        },

        zoneActivity: function (parentId, code) {
            var parent = upper(parentId), zone = upper(code), newest = 0;
            var rows = (this.state.pallets || []).concat(this.state.placements || []);
            rows.forEach(function (p) {
                if (p.status === 'archived' || upper(p.parentId) !== parent) return;
                if (upper(p.location) !== zone && upper(p.point) !== zone) return;
                var raw = p.updatedAt || p.movedAt || p.createdAt;
                var time = 0;
                if (raw && typeof raw.toDate === 'function') time = raw.toDate().getTime();
                else if (raw && raw.seconds) time = Number(raw.seconds) * 1000;
                else if (raw) time = new Date(raw).getTime() || 0;
                newest = Math.max(newest, time);
            });
            return { newest: newest, recent: newest > 0 && (Date.now() - newest) <= 30 * 60 * 1000 };
        },

        renderMapElement: function (el, parentId, hits) {
            var code = upper(el.code);
            var st = el.type === 'storage' ? this.mapStats(parentId, code, '') : { pallets: 0, placements: 0 };
            var hit = !!hits[code];
            var clickable = el.type === 'storage';
            var occupied = clickable && (st.pallets > 0 || st.placements > 0);
            var activity = clickable ? this.zoneActivity(parentId, code) : { recent: false };
            var capacity = Math.max(0, Number(el.capacity || 0));
            var ratio = capacity > 0 ? st.pallets / capacity : 0;
            var level = capacity > 0 && ratio >= 1 ? ' full' : capacity > 0 && ratio >= .7 ? ' near-full' : occupied ? ' occupied' : ' empty';
            var classes = esc(el.type) + (clickable ? level : '') + (activity.recent ? ' recent' : '') + (hit ? ' hit' : '') + (el.status === 'closed' ? ' closed' : '');
            var click = clickable ? ' onclick="window.FZone.openMapSearch(\'' + esc(parentId) + '\',\'' + esc(code) + '\',\'\')"' : '';
            var badge = occupied ? '<span class="fz-zone-badge"><i class="ph ph-stack"></i>' + st.pallets + '</span>' : '';
            var recent = activity.recent ? '<span class="fz-zone-recent">NEW</span>' : '';
            var status = capacity > 0 && ratio >= 1 ? '<span class="fz-zone-status">เต็ม</span>' : capacity > 0 && ratio >= .7 ? '<span class="fz-zone-status">ใกล้เต็ม</span>' : '';
            return '<div class="fz-plan-el ' + classes + '" data-code="' + esc(code) + '" style="left:' + Number(el.x || 0) + '%;top:' + Number(el.y || 0) + '%;width:' + Number(el.w || 1) + '%;height:' + Number(el.h || 1) + '%"' + click + '>' + badge + recent + status + '<div><div class="fz-plan-code">' + esc(el.code || '') + '</div>' + (el.name ? '<div class="fz-plan-desc">' + esc(el.name) + '</div>' : '') + (el.type === 'storage' ? '<div class="fz-plan-count">' + st.pallets + ' พาเลท · ' + st.placements + ' รายการ</div>' : '') + '</div></div>';
        },

        renderMap: function () {
            var parents = this.mapParents();
            var selected = upper(this.state.mapParent || 'F-AAD');
            if (!parents.some(function (p) { return p.id === selected; })) selected = parents[0] ? parents[0].id : 'F-AAD';
            this.state.mapParent = selected;
            var elements = this.getMapElements(selected);
            var options = parents.map(function (p) {
                return '<option value="' + esc(p.id) + '" ' + (p.id === selected ? 'selected' : '') + '>' + esc(p.id + (p.name && p.name !== p.id ? ' — ' + p.name : '')) + '</option>';
            }).join('');
            var allStats = this.mapStats(selected, '', '');
            var storageElements = elements.filter(function (x) { return x.type === 'storage' && x.status !== 'closed'; });
            var storageCount = storageElements.length;
            var occupiedCount = storageElements.filter(function (x) { var st = FZ.mapStats(selected, x.code, ''); return st.pallets > 0 || st.placements > 0; }).length;
            var emptyCount = Math.max(0, storageCount - occupiedCount);
            var recentCount = storageElements.filter(function (x) { return FZ.zoneActivity(selected, x.code).recent; }).length;
            var hits = this.mapHitCodes(selected, this.state.mapSearch);
            var source = this.state.maps[selected] ? 'บันทึกใน Firebase' : selected === 'F-AAD' ? 'ต้นแบบ F-AAD เดิม (พร้อมแก้ไข/บันทึก)' : 'ยังไม่มีแผนผัง';
            var editorButton = isManager() ? '<button class="fz-btn fz-btn-primary" onclick="window.FZone.openMapEditor(\'' + esc(selected) + '\')"><i class="ph ph-pencil-ruler"></i> สร้าง/แก้ไขแผนผัง</button>' : '';
            var board = elements.length ? '<div class="fz-plan-shell fz-span-12"><div class="fz-plan-scroll"><div class="fz-plan-canvas" style="transform:scale(' + this.state.mapZoom + ');transform-origin:top left">' + elements.map(function (el) { return FZ.renderMapElement(el, selected, hits); }).join('') + '</div><div class="fz-plan-spacer" style="width:' + (1100 * this.state.mapZoom) + 'px;height:' + (620 * this.state.mapZoom) + 'px"></div></div><div class="fz-plan-legend"><span><i class="empty"></i>ว่าง</span><span><i class="occupied"></i>มีสินค้า</span><span><i class="recent"></i>เพิ่งอัปเดต</span><span><i class="rack"></i>Rack / AX Location</span><span><i class="restricted"></i>ห้อง/ห้ามวาง</span><span><i class="aisle"></i>ทางเดิน</span><span><i class="hit"></i>ผลค้นหา</span></div></div>' : '<div class="fz-card fz-span-12 fz-empty"><i class="ph ph-map-trifold text-4xl"></i><div style="font-weight:900;color:#475569;margin-top:8px">MAP ' + esc(selected) + ' ยังไม่มีแผนผัง</div><div class="fz-muted" style="margin-top:5px">กด “สร้าง/แก้ไขแผนผัง” เพื่อวาดพื้นที่วางสินค้า Rack ห้อง และทางเดิน</div>' + editorButton + '</div>';
            return '<div class="fz-grid"><div class="fz-card fz-span-12 fz-map-toolbar"><div><div class="fz-map-heading"><i class="ph ph-map-trifold"></i> MAP ' + esc(selected) + '</div><div class="fz-muted">' + esc(source) + ' · รองรับหลาย Parent Location</div></div><div class="fz-map-controls"><label class="fz-label" style="margin:0">Parent Location</label><select class="fz-select" onchange="window.FZone.selectMapParent(this.value)">' + options + '</select></div><div class="fz-map-search"><input class="fz-input" value="' + esc(this.state.mapSearch) + '" placeholder="ค้นหา Item, Pallet, Zone..." onkeydown="if(event.key===\'Enter\')window.FZone.setMapSearch(this.value)"><button class="fz-btn fz-btn-secondary" onclick="window.FZone.setMapSearch(this.previousElementSibling.value)"><i class="ph ph-magnifying-glass"></i></button></div><div class="fz-row"><button class="fz-btn fz-btn-secondary" onclick="window.FZone.setMapZoom(-.1)">−</button><button class="fz-btn fz-btn-secondary" onclick="window.FZone.setMapZoom(0,1)">' + Math.round(this.state.mapZoom * 100) + '%</button><button class="fz-btn fz-btn-secondary" onclick="window.FZone.setMapZoom(.1)">＋</button>' + editorButton + '</div><div class="fz-map-summary"><span class="fz-badge fz-summary-empty"><i class="ph ph-square"></i> ว่าง ' + emptyCount + '</span><span class="fz-badge fz-summary-occupied"><i class="ph ph-stack"></i> มีสินค้า ' + occupiedCount + '</span><span class="fz-badge fz-summary-recent"><i class="ph ph-clock-countdown"></i> เพิ่งอัปเดต ' + recentCount + '</span><span class="fz-badge"><i class="ph ph-stack"></i> ' + allStats.pallets + ' พาเลท</span><span class="fz-badge"><i class="ph ph-package"></i> ' + allStats.placements + ' รายการ</span></div></div>' + board + '</div>';
        },

        openMapEditor: function (parentId) {
            if (!isManager()) return toast('เฉพาะ Admin/Supervisor เท่านั้น', 'error');
            this.state.editorParent = upper(parentId || this.state.mapParent || 'F-AAD');
            this.loadEditorDraft(this.state.editorParent);
            this.state.currentTab = 'mapedit';
            this.render();
        },

        loadEditorDraft: function (parentId) {
            var id = upper(parentId || 'F-AAD');
            this.state.editorParent = id;
            this.state.editorDraft = clone(this.getMapElements(id) || []);
            this.state.editorLoadedParent = id;
            this.state.editorSelected = '';
            this.state.editorTool = 'select';
            this.state.editorUndo = [];
            this.state.editorRedo = [];
            this.state.editorDirty = false;
        },

        selectEditorParent: function (parentId) {
            if (this.state.editorDirty && !confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการเปลี่ยนพื้นที่และทิ้งการแก้ไขหรือไม่?')) return this.render();
            this.loadEditorDraft(parentId);
            this.render();
        },

        renderMapEditor: function () {
            if (!isManager()) return '<div class="fz-card fz-empty">ไม่มีสิทธิ์จัดการแผนผัง</div>';
            var parents = this.mapParents();
            var parentId = upper(this.state.editorParent || this.state.mapParent || 'F-AAD');
            if (this.state.editorLoadedParent !== parentId) this.loadEditorDraft(parentId);
            var selected = this.state.editorDraft.find(function (x) { return x.id === FZ.state.editorSelected; });
            var options = parents.map(function (p) { return '<option value="' + esc(p.id) + '" ' + (p.id === parentId ? 'selected' : '') + '>' + esc(p.id + (p.name && p.name !== p.id ? ' — ' + p.name : '')) + '</option>'; }).join('');
            var tools = [['select','cursor-click','เลือก/ย้าย'],['storage','warehouse','พื้นที่วางสินค้า'],['rack','rows','Rack / Location'],['restricted','prohibit','ห้อง / ห้ามวาง'],['aisle','arrows-left-right','เส้นทางเดิน']];
            var canvas = this.state.editorDraft.map(function (el) {
                return '<div class="fz-edit-el ' + esc(el.type) + (FZ.state.editorSelected === el.id ? ' selected' : '') + '" data-map-id="' + esc(el.id) + '" style="left:' + Number(el.x || 0) + '%;top:' + Number(el.y || 0) + '%;width:' + Number(el.w || 1) + '%;height:' + Number(el.h || 1) + '%"><b>' + esc(el.code || '') + '</b>' + (FZ.state.editorSelected === el.id ? '<i class="fz-editor-resize"></i>' : '') + '</div>';
            }).join('');
            var prop = selected ? '<div class="fz-editor-field"><label>รหัส</label><input id="fz-prop-code" class="fz-input" value="' + esc(selected.code || '') + '"></div><div class="fz-editor-field"><label>คำอธิบาย</label><input id="fz-prop-name" class="fz-input" value="' + esc(selected.name || '') + '"></div><div class="fz-editor-field"><label>ประเภท</label><select id="fz-prop-type" class="fz-select"><option value="storage" ' + (selected.type === 'storage' ? 'selected' : '') + '>พื้นที่วางสินค้า</option><option value="rack" ' + (selected.type === 'rack' ? 'selected' : '') + '>Rack / Location</option><option value="restricted" ' + (selected.type === 'restricted' ? 'selected' : '') + '>ห้อง / ห้ามวาง</option><option value="aisle" ' + (selected.type === 'aisle' ? 'selected' : '') + '>เส้นทางเดิน</option></select></div><div class="fz-editor-field"><label>สถานะ</label><select id="fz-prop-status" class="fz-select"><option value="active" ' + (selected.status !== 'closed' ? 'selected' : '') + '>เปิดใช้งาน</option><option value="closed" ' + (selected.status === 'closed' ? 'selected' : '') + '>ปิดใช้งาน</option></select></div><button class="fz-btn fz-btn-primary" style="width:100%" onclick="window.FZone.applyMapProperty()"><i class="ph ph-floppy-disk"></i> ใช้คุณสมบัติ</button><button class="fz-btn fz-btn-secondary" style="width:100%;margin-top:8px" onclick="window.FZone.printEditorZoneA4()"><i class="ph ph-printer"></i> พิมพ์ QR Zone A4</button><button class="fz-btn fz-btn-danger" style="width:100%;margin-top:8px" onclick="window.FZone.deleteMapElement()"><i class="ph ph-trash"></i> ลบองค์ประกอบ</button>' : '<div class="fz-empty" style="padding:18px 4px">เลือกองค์ประกอบบนแผนผังเพื่อแก้ไข</div>';
            return '<div class="fz-editor-actions"><div class="fz-editor-parent"><label class="fz-label">Parent Location</label><select class="fz-select" onchange="window.FZone.selectEditorParent(this.value)">' + options + '</select></div><button class="fz-btn fz-btn-primary" onclick="window.FZone.saveMapEditor()"><i class="ph ph-floppy-disk"></i> บันทึกแผนผัง</button><button class="fz-btn fz-btn-secondary" onclick="window.FZone.undoMapEditor()">↶ Undo</button><button class="fz-btn fz-btn-secondary" onclick="window.FZone.redoMapEditor()">↷ Redo</button><button class="fz-btn fz-btn-secondary" onclick="window.FZone.copyMapElement()"><i class="ph ph-copy"></i> Copy</button><button class="fz-btn fz-btn-secondary" onclick="window.FZone.pasteMapElement()"><i class="ph ph-clipboard-text"></i> Paste</button><button class="fz-btn fz-btn-secondary" onclick="window.FZone.previewMapEditor()"><i class="ph ph-eye"></i> ดูแบบพนักงาน</button><button class="fz-btn fz-btn-danger" onclick="window.FZone.openBulkZoneDelete()"><i class="ph ph-trash"></i> เลือกลบ Zone</button><button class="fz-btn fz-btn-secondary" onclick="window.FZone.resetMapEditorDefault()"><i class="ph ph-arrow-counter-clockwise"></i> ' + (parentId === 'F-AAD' ? 'เรียกคืนผัง F-AAD เดิม' : 'ล้างเป็นผังเปล่า') + '</button></div><div class="fz-editor-layout"><aside class="fz-editor-toolbox"><h3>องค์ประกอบ</h3>' + tools.map(function (t) { return '<button class="fz-editor-tool ' + (FZ.state.editorTool === t[0] ? 'active' : '') + '" onclick="window.FZone.selectMapTool(\'' + t[0] + '\')"><i class="ph ph-' + t[1] + '"></i> ' + t[2] + '</button>'; }).join('') + '<div class="fz-muted" style="margin-top:10px">เลือกชนิด แล้วลากบนพื้นที่เพื่อสร้างองค์ประกอบใหม่<br><b>Ctrl+C / Ctrl+V</b> ทำซ้ำองค์ประกอบได้</div></aside><div class="fz-editor-map-wrap"><div class="fz-editor-canvas" id="fz-editor-canvas">' + canvas + '</div></div><aside class="fz-editor-properties"><h3>คุณสมบัติ</h3>' + prop + '</aside></div>';
        },

        selectMapTool: function (tool) {
            this.state.editorTool = tool;
            this.render();
        },

        setupMapEditor: function () {
            var canvas = document.getElementById('fz-editor-canvas');
            if (!canvas) return;
            document.onkeydown = function (e) {
                if (FZ.state.tab !== 'mapedit') return;
                var tag = String((e.target && e.target.tagName) || '').toLowerCase();
                if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
                if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'c') { e.preventDefault(); FZ.copyMapElement(); }
                if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'v') { e.preventDefault(); FZ.pasteMapElement(); }
            };
            canvas.onpointerdown = function (e) {
                if (e.target !== canvas) return;
                if (['storage','rack','restricted','aisle'].indexOf(FZ.state.editorTool) === -1) {
                    FZ.state.editorSelected = '';
                    return FZ.render();
                }
                FZ.snapshotMapEditor();
                var r = canvas.getBoundingClientRect();
                var sx = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100));
                var sy = Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100));
                var type = FZ.state.editorTool;
                var obj = { id: elementId(), type: type, code: type === 'storage' ? 'ZONE-NEW' : type === 'rack' ? 'RACK-NEW' : type === 'restricted' ? 'ห้ามวาง' : 'ทางเดิน', name: '', x: sx, y: sy, w: 1, h: 1, status: 'active' };
                FZ.state.editorDraft.push(obj);
                FZ.state.editorSelected = obj.id;
                FZ.state.editorDirty = true;
                var node = document.createElement('div');
                node.className = 'fz-edit-el ' + type + ' selected';
                node.setAttribute('data-map-id', obj.id);
                node.innerHTML = '<b>' + esc(obj.code) + '</b>';
                node.style.left = obj.x + '%'; node.style.top = obj.y + '%'; node.style.width = obj.w + '%'; node.style.height = obj.h + '%';
                canvas.appendChild(node);
                var move = function (ev) {
                    obj.w = Math.max(1, Math.min(100 - obj.x, (ev.clientX - r.left) / r.width * 100 - sx));
                    obj.h = Math.max(1, Math.min(100 - obj.y, (ev.clientY - r.top) / r.height * 100 - sy));
                    node.style.width = obj.w + '%'; node.style.height = obj.h + '%';
                };
                var up = function () {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                    FZ.state.editorTool = 'select';
                    FZ.render();
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
            };
            Array.prototype.forEach.call(canvas.querySelectorAll('.fz-edit-el'), function (el) {
                el.onpointerdown = function (e) {
                    e.stopPropagation();
                    var obj = FZ.state.editorDraft.find(function (x) { return x.id === el.getAttribute('data-map-id'); });
                    if (!obj) return;
                    if (FZ.state.editorSelected !== obj.id) FZ.state.editorSelected = obj.id;
                    if (e.target.classList.contains('fz-editor-resize')) return FZ.startMapResize(e, obj);
                    if (FZ.state.editorTool === 'select') return FZ.startMapDrag(e, obj);
                    FZ.render();
                };
            });
        },

        snapshotMapEditor: function () {
            this.state.editorUndo.push(JSON.stringify(this.state.editorDraft || []));
            if (this.state.editorUndo.length > 40) this.state.editorUndo.shift();
            this.state.editorRedo = [];
        },

        startMapDrag: function (e, obj) {
            this.snapshotMapEditor();
            var canvas = document.getElementById('fz-editor-canvas');
            var r = canvas.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, ox = obj.x, oy = obj.y;
            var move = function (ev) {
                obj.x = Math.max(0, Math.min(100 - obj.w, ox + (ev.clientX - sx) / r.width * 100));
                obj.y = Math.max(0, Math.min(100 - obj.h, oy + (ev.clientY - sy) / r.height * 100));
                var node = canvas.querySelector('[data-map-id="' + obj.id + '"]');
                if (node) { node.style.left = obj.x + '%'; node.style.top = obj.y + '%'; }
                FZ.state.editorDirty = true;
            };
            var up = function () { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); FZ.render(); };
            window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        },

        startMapResize: function (e, obj) {
            e.stopPropagation();
            this.snapshotMapEditor();
            var canvas = document.getElementById('fz-editor-canvas');
            var r = canvas.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, ow = obj.w, oh = obj.h;
            var move = function (ev) {
                obj.w = Math.max(1, Math.min(100 - obj.x, ow + (ev.clientX - sx) / r.width * 100));
                obj.h = Math.max(1, Math.min(100 - obj.y, oh + (ev.clientY - sy) / r.height * 100));
                var node = canvas.querySelector('[data-map-id="' + obj.id + '"]');
                if (node) { node.style.width = obj.w + '%'; node.style.height = obj.h + '%'; }
                FZ.state.editorDirty = true;
            };
            var up = function () { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); FZ.render(); };
            window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        },

        applyMapProperty: function () {
            var obj = this.state.editorDraft.find(function (x) { return x.id === FZ.state.editorSelected; });
            if (!obj) return;
            var code = String((document.getElementById('fz-prop-code') || {}).value || '').trim();
            var name = String((document.getElementById('fz-prop-name') || {}).value || '').trim();
            var type = String((document.getElementById('fz-prop-type') || {}).value || obj.type);
            var status = String((document.getElementById('fz-prop-status') || {}).value || 'active');
            if (!code) return toast('กรุณากรอกรหัส', 'error');
            if (type === 'storage' && this.state.editorDraft.some(function (x) { return x.id !== obj.id && x.type === 'storage' && upper(x.code) === upper(code); })) return toast('รหัสพื้นที่วางสินค้าซ้ำ', 'error');
            this.snapshotMapEditor();
            obj.code = code; obj.name = name; obj.type = type; obj.status = status;
            this.state.editorDirty = true;
            this.render();
        },

        deleteMapElement: function () {
            var obj = this.state.editorDraft.find(function (x) { return x.id === FZ.state.editorSelected; });
            if (!obj) return;
            var used = obj.type === 'storage' && ((this.state.pallets || []).concat(this.state.placements || []).some(function (p) { return upper(p.parentId) === upper(FZ.state.editorParent) && (upper(p.location) === upper(obj.code) || upper(p.point) === upper(obj.code)); }));
            if (used) return toast('ลบไม่ได้ เพราะพื้นที่นี้ยังมีพาเลทหรือรายการสินค้าอยู่', 'error');
            if (!confirm('ยืนยันลบ ' + (obj.code || 'องค์ประกอบนี้') + '?\n\nหลังลบต้องกดบันทึกแผนผังเพื่อยืนยันถาวร')) return;
            this.snapshotMapEditor();
            this.state.editorDraft = this.state.editorDraft.filter(function (x) { return x.id !== obj.id; });
            this.state.editorSelected = '';
            this.state.editorDirty = true;
            this.render();
        },

        openBulkZoneDelete: function () {
            if (!isManager()) return;
            var zones = (this.state.editorDraft || []).filter(function (x) { return x.type === 'storage'; });
            if (!zones.length) return toast('ยังไม่มี Zone ให้ลบ', 'error');
            var list = zones.map(function (z, i) { return (i + 1) + '. ' + (z.code || z.id); }).join('\n');
            var input = window.prompt('เลือก Zone ที่ต้องการลบ\nกรอกเลขลำดับหรือรหัส Zone หลายรายการคั่นด้วย comma\n\n' + list + '\n\nตัวอย่าง: 2,4 หรือ AAD-03,AAD-05');
            if (!input) return;
            var tokens = String(input).split(/[,\n]+/).map(function (v) { return v.trim(); }).filter(Boolean);
            var ids = [];
            tokens.forEach(function (t) {
                var n = Number(t);
                var z = Number.isInteger(n) && n >= 1 && n <= zones.length ? zones[n - 1] : zones.find(function (x) { return upper(x.code) === upper(t); });
                if (z && ids.indexOf(z.id) === -1) ids.push(z.id);
            });
            if (!ids.length) return toast('ไม่พบ Zone ที่เลือก', 'error');
            var blocked = zones.filter(function (z) {
                return ids.indexOf(z.id) !== -1 && ((FZ.state.pallets || []).concat(FZ.state.placements || []).some(function (p) { return upper(p.parentId) === upper(FZ.state.editorParent) && (upper(p.location) === upper(z.code) || upper(p.point) === upper(z.code)); }));
            });
            if (blocked.length) return toast('ลบไม่ได้: ' + blocked.map(function (z) { return z.code; }).join(', ') + ' ยังมีสินค้า/พาเลทอยู่', 'error');
            var names = zones.filter(function (z) { return ids.indexOf(z.id) !== -1; }).map(function (z) { return z.code; });
            if (!confirm('ยืนยันลบ Zone ที่เลือก ' + names.length + ' จุด?\n\n' + names.join(', ') + '\n\nต้องกดบันทึกแผนผังอีกครั้งเพื่อยืนยันถาวร')) return;
            this.snapshotMapEditor();
            this.state.editorDraft = this.state.editorDraft.filter(function (x) { return ids.indexOf(x.id) === -1; });
            this.state.editorSelected = '';
            this.state.editorDirty = true;
            this.render();
        },

        copyMapElement: function () {
            var obj = (this.state.editorDraft || []).find(function (x) { return x.id === FZ.state.editorSelected; });
            if (!obj) return toast('เลือกองค์ประกอบที่ต้องการ Copy ก่อน', 'error');
            this.state.editorClipboard = clone(obj);
            toast('Copy ' + (obj.code || 'องค์ประกอบ') + ' แล้ว กด Paste เพื่อสร้างสำเนา', 'success');
        },

        pasteMapElement: function () {
            var src = this.state.editorClipboard;
            if (!src) return toast('ยังไม่มีองค์ประกอบใน Clipboard', 'error');
            this.snapshotMapEditor();
            var obj = clone(src);
            obj.id = elementId();
            obj.x = Math.max(0, Math.min(100 - Number(obj.w || 1), Number(obj.x || 0) + 2));
            obj.y = Math.max(0, Math.min(100 - Number(obj.h || 1), Number(obj.y || 0) + 2));
            var base = String(obj.code || 'COPY');
            var used = (this.state.editorDraft || []).map(function (x) { return upper(x.code); });
            var n = 2, candidate = base + '-COPY';
            while (used.indexOf(upper(candidate)) !== -1) candidate = base + '-COPY' + (n++);
            obj.code = candidate;
            this.state.editorDraft.push(obj);
            this.state.editorSelected = obj.id;
            this.state.editorDirty = true;
            this.render();
            toast('วางสำเนาแล้ว ลากไปยังตำแหน่งที่ต้องการ', 'success');
        },

        undoMapEditor: function () {
            if (!this.state.editorUndo.length) return;
            this.state.editorRedo.push(JSON.stringify(this.state.editorDraft));
            this.state.editorDraft = JSON.parse(this.state.editorUndo.pop());
            this.state.editorSelected = '';
            this.state.editorDirty = true;
            this.render();
        },

        redoMapEditor: function () {
            if (!this.state.editorRedo.length) return;
            this.state.editorUndo.push(JSON.stringify(this.state.editorDraft));
            this.state.editorDraft = JSON.parse(this.state.editorRedo.pop());
            this.state.editorSelected = '';
            this.state.editorDirty = true;
            this.render();
        },

        resetMapEditorDefault: function () {
            if (!confirm(this.state.editorParent === 'F-AAD' ? 'เรียกคืนแผนผัง F-AAD เดิมทั้งหมด?' : 'ล้างแผนผังนี้เป็นพื้นที่ว่าง?')) return;
            this.snapshotMapEditor();
            this.state.editorDraft = this.state.editorParent === 'F-AAD' ? clone(DEFAULT_F_AAD_MAP) : [];
            this.state.editorSelected = '';
            this.state.editorDirty = true;
            this.render();
        },

        previewMapEditor: function () {
            this.state.previewMaps[this.state.editorParent] = clone(this.state.editorDraft);
            this.state.mapParent = this.state.editorParent;
            this.state.currentTab = 'map';
            this.render();
        },

        saveMapEditor: async function () {
            if (!isManager()) return;
            var parentId = upper(this.state.editorParent || 'F-AAD');
            var elements = clone(this.state.editorDraft || []);
            var payload = { parentId: parentId, elements: elements, canvas: { width: 1100, height: 620 }, version: 1, updatedAt: Date.now(), updatedBy: currentUser() };
            try {
                await window.db.collection(COL.MAPS).doc(safeId(parentId)).set(payload, { merge: true });
                this.state.maps[parentId] = payload;
                delete this.state.previewMaps[parentId];
                await this.syncMapStorageLocations(parentId, elements);
                this.state.editorDirty = false;
                toast('บันทึกแผนผัง ' + parentId + ' แล้ว', 'success');
                this.render();
            } catch (e) {
                console.error('F-Zone map save failed', e);
                toast('บันทึกแผนผังไม่สำเร็จ: ' + (e.message || e), 'error');
            }
        },

        syncMapStorageLocations: async function (parentId, elements) {
            var storage = (elements || []).filter(function (x) { return x.type === 'storage' && x.code && x.status !== 'closed'; });
            if (!window.db) return;
            var points = storage.map(function (x) { return upper(x.code); }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
            var ref = window.db.collection(COL.LOCATIONS).doc(safeId(parentId + '__' + parentId));
            await ref.set({ parentId: parentId, code: parentId, points: points, enabled: true, source: 'map', updatedAt: Date.now(), updatedBy: currentUser() }, { merge: true });
        },

        printEditorZoneA4: function () {
            var obj = this.state.editorDraft.find(function (x) { return x.id === FZ.state.editorSelected; });
            if (!obj) return toast('กรุณาเลือกพื้นที่บนแผนผัง', 'error');
            if (obj.type !== 'storage') return toast('พิมพ์ QR ได้เฉพาะพื้นที่วางสินค้า', 'error');
            this.printMapZonesA4([obj], this.state.editorParent);
        },

        printMapZonesA4: function (zones, parentId) {
            if (!zones || !zones.length) return;
            var cards = zones.map(function (z) {
                var payload = FZ.buildMoveUrl({ parentId: upper(parentId), location: upper(parentId), point: upper(z.code) });
                var qr = qrDataUrl(payload, 8, 2);
                return '<section class="fz-a4-map-zone"><div class="parent">' + esc(upper(parentId)) + '</div><div class="zone">' + esc(z.code) + '</div><div class="desc">' + esc(z.name || 'พื้นที่วางสินค้า') + '</div><img src="' + qr + '"><div class="hint">1. สแกน QR จุดปลายทางก่อน<br>2. จากนั้นสแกน QR บนพาเลท</div><div class="payload">' + esc(payload) + '</div></section>';
            }).join('');
            var html = '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>F-Zone Map QR A4</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif;background:#e5e7eb}.bar{position:sticky;top:0;background:#0f172a;color:#fff;padding:10px;text-align:center}.bar button{padding:10px 18px;border:0;border-radius:10px;font-weight:bold}.fz-a4-map-zone{width:210mm;height:297mm;margin:10mm auto;background:#fff;padding:18mm;text-align:center;page-break-after:always}.fz-a4-map-zone:last-child{page-break-after:auto}.parent{font-size:22pt;font-weight:800;color:#0f766e}.zone{font-size:58pt;font-weight:950;margin-top:5mm}.desc{font-size:22pt;font-weight:800;min-height:18mm}.fz-a4-map-zone img{width:112mm;height:112mm;border:2mm solid #0f172a;padding:5mm;border-radius:5mm}.hint{font-size:18pt;font-weight:800;line-height:1.6;margin-top:7mm}.payload{font-family:monospace;font-size:10pt;margin-top:6mm;color:#64748b}@media print{body{background:#fff}.bar{display:none}.fz-a4-map-zone{margin:0}}</style></head><body><div class="bar"><button onclick="window.print()">พิมพ์ A4</button></div>' + cards + '</body></html>';
            var w = window.open('', '_blank');
            if (!w) return toast('เบราว์เซอร์บล็อกหน้าต่างพิมพ์', 'error');
            w.document.open(); w.document.write(html); w.document.close();
        },

        renderSearch: function () {
            return '<div class="fz-grid"><div class="fz-card fz-span-4"><h3><i class="ph ph-magnifying-glass"></i> ค้นหาในพื้นที่ F</h3><label class="fz-label">Item / ชื่อ / Pallet QR / Location / จุดวาง</label><input id="fz-search-input" class="fz-input" placeholder="เช่น 123456, F-AAD, P01" oninput="window.FZone.runSearch()"><div class="fz-row" style="margin-top:10px"><span class="fz-badge">พาเลท ' + this.state.pallets.length + '</span><span class="fz-badge">บันทึกจุดวาง ' + this.state.placements.length + '</span><span class="fz-badge">Location เปิดใช้ ' + this.state.locations.filter(function(l){return l.enabled!==false;}).length + '</span></div></div><div class="fz-card fz-span-8"><h3><i class="ph ph-package"></i> ผลการค้นหา</h3><div id="fz-search-results" class="fz-list"></div></div></div>';
        },

        runSearch: function () {
            var input = document.getElementById('fz-search-input');
            var q = upper(input && input.value);
            var palletResults = (this.state.pallets || []).filter(function (p) {
                if (!q) return true;
                var hay = [p.palletId, p.qrValue, p.item, p.description, p.parentId, p.location, p.point, p.sourceType, p.sourceId].join(' ').toUpperCase();
                return hay.indexOf(q) !== -1;
            }).map(function (p) { return { kind: 'pallet', data: p, sortAt: p.updatedAt || p.createdAt || 0 }; });
            var placementResults = (this.state.placements || []).filter(function (p) {
                if (!q) return true;
                var hay = [p.item, p.description, p.parentId, p.location, p.point, p.sourceType, p.sourceId, p.user].join(' ').toUpperCase();
                return hay.indexOf(q) !== -1;
            }).map(function (p) { return { kind: 'placement', data: p, sortAt: p.updatedAt || 0 }; });
            var results = palletResults.concat(placementResults).sort(function (a, b) { return b.sortAt - a.sortAt; });
            var target = document.getElementById('fz-search-results');
            if (!target) return;
            if (!results.length) { target.innerHTML = '<div class="fz-empty"><i class="ph ph-package text-4xl"></i><div>ไม่พบ Item ในพื้นที่ F</div></div>'; return; }
            target.innerHTML = results.slice(0, 150).map(function (row) {
                var p = row.data;
                if (row.kind === 'placement') {
                    return '<div class="fz-item"><div class="fz-row"><div style="flex:1;min-width:180px"><div class="fz-item-title">' + esc(p.item || '-') + ' <span class="fz-badge">' + esc(p.sourceType || 'placement') + '</span></div><div class="fz-muted">' + esc(p.description || '') + '</div><div style="margin-top:6px;font-weight:800;color:#0f766e"><i class="ph ph-map-pin"></i> ' + esc(p.parentId || '-') + ' · ' + esc(p.location || '-') + ' · ' + esc(p.point || 'ยังไม่ระบุจุด') + '</div><div class="fz-muted">Qty ' + esc(p.qty || 0) + ' · บันทึกโดย ' + esc(p.user || p.updatedBy || '-') + ' · ' + esc(thaiDateTime(p.updatedAt)) + '</div></div></div></div>';
                }
                return '<div class="fz-item"><div class="fz-row"><div style="flex:1;min-width:180px"><div class="fz-item-title">' + esc(p.item || '-') + ' <span class="fz-badge">' + esc(p.palletNo || '-') + '/' + esc(p.totalPallets || '-') + '</span></div><div class="fz-muted">' + esc(p.description || '') + '</div><div style="margin-top:6px;font-weight:800;color:#0f766e"><i class="ph ph-map-pin"></i> ' + esc(p.parentId || '-') + ' · ' + esc(p.location || '-') + ' · ' + esc(p.point || 'ยังไม่ระบุจุด') + '</div><div class="fz-muted">Qty ' + esc(p.qty || 0) + (Number(p.onPallet || 0) > 0 ? ' · ON PALLET ' + esc(p.onPallet) : '') + ' · ' + esc(p.palletId || '') + '</div></div><button class="fz-btn fz-btn-secondary" onclick="window.FZone.printPalletIds([\'' + esc(p.palletId) + '\'])"><i class="ph ph-printer"></i> พิมพ์</button></div></div>';
            }).join('');
        },

        renderPallets: function () {
            var managerActions = isManager() ? '<button class="fz-btn fz-btn-secondary" onclick="window.FZone.toggleAllPalletChecks(true)"><i class="ph ph-check-square"></i> เลือกทั้งหมด</button><button class="fz-btn fz-btn-secondary" onclick="window.FZone.toggleAllPalletChecks(false)">ล้างเลือก</button><button class="fz-btn fz-btn-danger" onclick="window.FZone.deleteSelectedPallets()"><i class="ph ph-trash"></i> ลบที่เลือก</button>' : '';
            return '<div class="fz-grid"><div class="fz-card fz-span-5"><h3><i class="ph ph-scissors"></i> Split ตาม ON PALLET</h3><div class="fz-grid" style="gap:10px"><div class="fz-span-6"><label class="fz-label">Item</label><input id="fz-pal-item" class="fz-input" placeholder="Item code"></div><div class="fz-span-6"><label class="fz-label">จำนวนรวม</label><input id="fz-pal-total" type="number" inputmode="decimal" class="fz-input" placeholder="0"></div><div class="fz-span-12"><label class="fz-label">ชื่อสินค้า</label><input id="fz-pal-desc" class="fz-input" placeholder="Description"></div><div class="fz-span-6"><label class="fz-label">ON PALLET <span class="fz-muted">(ไม่บังคับ)</span></label><input id="fz-pal-on" type="number" inputmode="decimal" class="fz-input" placeholder="เว้นว่าง = สร้าง 1 พาเลท"><div class="fz-muted" style="margin-top:5px">ใส่เมื่อต้องการ Split อัตโนมัติเท่านั้น</div></div><div class="fz-span-6"><label class="fz-label">Base / Parent Location</label><select id="fz-pal-parent" class="fz-select" onchange="window.FZone.changePalletParent(this.value)"></select></div><div class="fz-span-6"><label class="fz-label">เลือกจุดจากแผนผัง</label><button type="button" class="fz-btn fz-btn-map-pick" style="width:100%" onclick="window.FZone.openPalletMapPicker()"><i class="ph ph-map-trifold"></i> เปิด MAP เพื่อเลือกจุด</button></div><div class="fz-span-12"><div id="fz-pal-point-summary" class="fz-pallet-point-summary">ยังไม่ได้เลือกจุดวาง · สามารถเลือกหลายจุดในครั้งเดียว</div></div><div class="fz-span-12"><button class="fz-btn fz-btn-primary" style="width:100%" onclick="window.FZone.createPalletSplit()"><i class="ph ph-qr-code"></i> สร้าง QR พาเลท + เลือกพิมพ์ TSC / A4</button></div></div></div><div class="fz-card fz-span-7"><div class="fz-row" style="align-items:flex-start"><h3 style="flex:1;min-width:180px"><i class="ph ph-stack"></i> พาเลทล่าสุด <span class="fz-badge">' + (this.state.pallets || []).length + '</span></h3><div class="fz-row" style="justify-content:flex-end"><button class="fz-btn fz-btn-secondary" onclick="window.FZone.printAllVisiblePalletsTsc()"><i class="ph ph-printer"></i> TSC</button><button class="fz-btn fz-btn-secondary" onclick="window.FZone.printAllVisiblePalletsA4()"><i class="ph ph-file-pdf"></i> A4</button>' + managerActions + '</div></div><div class="fz-muted" style="margin:4px 0 10px">ช่องเลือกใช้ได้ทั้งพิมพ์หลายใบและลบข้อมูลเก่า เฉพาะผู้ดูแลเท่านั้นที่ลบได้</div><div id="fz-pallet-list" class="fz-list">' + this.renderPalletList() + '</div></div></div>';
        },

        renderPalletList: function () {
            var list = (this.state.pallets || []).slice(0, 100);
            if (!list.length) return '<div class="fz-empty">ยังไม่มี QR พาเลท</div>';
            var manager = isManager();
            return list.map(function (p) {
                var deleteButton = manager ? '<button class="fz-btn fz-btn-danger" title="ลบข้อมูลพาเลทนี้" onclick="window.FZone.deletePallet(\'' + esc(p.palletId) + '\')"><i class="ph ph-trash"></i></button>' : '';
                return '<div class="fz-item"><div class="fz-row"><input type="checkbox" class="fz-pallet-check" value="' + esc(p.palletId) + '"><div style="flex:1;min-width:0"><div class="fz-item-title">' + esc(p.item || '-') + ' · พาเลท ' + esc(p.palletNo) + '/' + esc(p.totalPallets) + '</div><div class="fz-muted">Qty ' + esc(p.qty) + ' | ' + esc(p.location || '-') + ' / ' + esc(p.point || '-') + '</div><div class="fz-muted">' + esc(p.palletId) + ' · สร้าง ' + esc(thaiDateTime(p.createdAt)) + '</div></div><button class="fz-btn fz-btn-secondary" title="ย้ายเข้า Location คลัง" onclick="window.FZone.movePalletIntoWarehouse(\'' + esc(p.palletId) + '\')"><i class="ph ph-sign-in"></i> เข้า LOCATION</button><button class="fz-btn fz-btn-secondary" onclick="window.FZone.printPalletIds([\'' + esc(p.palletId) + '\'])"><i class="ph ph-printer"></i></button>' + deleteButton + '</div></div>';
            }).join('');
        },

        changePalletParent: function (value) {
            this.state.palletSelectedPoints = [];
            this.populatePalletSelectors();
            this.updatePalletPointSummary();
        },

        updatePalletPointSummary: function () {
            var el = document.getElementById('fz-pal-point-summary');
            if (!el) return;
            var pts = this.state.palletSelectedPoints || [];
            el.innerHTML = pts.length ? '<b>เลือกแล้ว ' + pts.length + ' จุด:</b> ' + pts.map(esc).join(', ') : 'ยังไม่ได้เลือกจุดวาง · สามารถเลือกหลายจุดในครั้งเดียว';
            el.classList.toggle('has-points', pts.length > 0);
        },

        openPalletMapPicker: function () {
            var parentEl = document.getElementById('fz-pal-parent');
            var parentId = upper(parentEl && parentEl.value || this.state.mapParent || 'F-AAD');
            if (!parentId) return toast('กรุณาเลือก Base / Parent ก่อน', 'error');
            var elements = (this.getMapElements(parentId) || []).filter(function (x) { return x.status !== 'closed'; });
            var storages = elements.filter(function (x) { return x.type === 'storage'; });
            if (!storages.length) return toast('Base ' + parentId + ' ยังไม่มีพื้นที่วางสินค้าใน MAP', 'error');
            var selected = this.state.palletSelectedPoints || [];
            var html = '<div class="fz-map-picker-backdrop" id="fz-map-picker" onclick="if(event.target===this)window.FZone.closePalletMapPicker()"><div class="fz-map-picker-modal"><div class="fz-map-picker-head"><div><h3><i class="ph ph-map-trifold"></i> เลือกจุดวางจาก MAP ' + esc(parentId) + '</h3><div class="fz-muted">แตะได้หลายจุด ระบบจะกระจายพาเลทตามลำดับที่เลือก</div></div><button class="fz-btn fz-btn-secondary" onclick="window.FZone.closePalletMapPicker()">✕</button></div><div class="fz-map-picker-scroll"><div class="fz-plan-canvas fz-picker-canvas">' + elements.map(function (el) { var active = selected.indexOf(upper(el.code)) !== -1; var selectable = el.type === 'storage'; return '<button type="button" class="fz-edit-el ' + esc(el.type) + (active ? ' selected-point' : '') + (selectable ? ' selectable' : ' locked') + '" style="left:' + Number(el.x||0) + '%;top:' + Number(el.y||0) + '%;width:' + Number(el.w||1) + '%;height:' + Number(el.h||1) + '%" ' + (selectable ? 'onclick="window.FZone.togglePalletMapPoint(\'' + esc(upper(el.code)) + '\')"' : 'disabled') + '><b>' + esc(el.code||'') + '</b>' + (active ? '<span class="fz-picker-check">✓</span>' : '') + '</button>'; }).join('') + '</div></div><div class="fz-map-picker-foot"><div id="fz-map-picker-count"><b>' + selected.length + '</b> จุดที่เลือก</div><div class="fz-row"><button class="fz-btn fz-btn-secondary" onclick="window.FZone.clearPalletMapPoints()">ล้าง</button><button class="fz-btn fz-btn-primary" onclick="window.FZone.confirmPalletMapPoints()"><i class="ph ph-check-circle"></i> ใช้จุดที่เลือก</button></div></div></div></div>';
            document.body.insertAdjacentHTML('beforeend', html);
        },

        togglePalletMapPoint: function (code) {
            code = upper(code);
            var pts = this.state.palletSelectedPoints || [];
            var i = pts.indexOf(code);
            if (i === -1) pts.push(code); else pts.splice(i, 1);
            this.state.palletSelectedPoints = pts;
            var modal = document.getElementById('fz-map-picker'); if (modal) modal.remove();
            this.openPalletMapPicker();
        },
        clearPalletMapPoints: function () { this.state.palletSelectedPoints = []; var m=document.getElementById('fz-map-picker'); if(m)m.remove(); this.openPalletMapPicker(); },
        closePalletMapPicker: function () { var m=document.getElementById('fz-map-picker'); if(m)m.remove(); },
        confirmPalletMapPoints: function () { this.closePalletMapPicker(); this.updatePalletPointSummary(); toast('เลือกจุดวาง ' + (this.state.palletSelectedPoints||[]).length + ' จุดแล้ว', 'success'); },

        movePalletIntoWarehouse: function (palletId) {
            var p = (this.state.pallets || []).find(function (x) { return upper(x.palletId) === upper(palletId); });
            if (!p) return toast('ไม่พบข้อมูลพาเลท', 'error');
            try { localStorage.setItem('plas_fzone_move_bridge', JSON.stringify({ palletId:p.palletId,item:p.item,description:p.description,qty:p.qty,oldLoc:p.point||p.location||p.parentId||'F',time:Date.now() })); } catch(e) {}
            this.close();
            if (!window.app || typeof window.app.switchTab !== 'function') return toast('ไม่พบหน้า Move ของ PLAS', 'error');
            window.app.switchTab('move');
            setTimeout(function () {
                if (typeof window.app.openCreateMoveModal === 'function') window.app.openCreateMoveModal();
                var vals = {'mv-item': (p.item||'') + (p.description ? ' — '+p.description : ''), 'mv-old-loc': p.point||p.location||p.parentId||'F', 'mv-qty': p.qty||''};
                Object.keys(vals).forEach(function(id){ var el=document.getElementById(id); if(el) el.value=vals[id]; });
                var reason=document.getElementById('mv-reason'); if(reason){ var opt=Array.prototype.find.call(reason.options,function(o){return /Other|อื่น/.test(o.value+' '+o.text)}); if(opt){reason.value=opt.value; if(typeof window.app.toggleMoveOtherReason==='function')window.app.toggleMoveOtherReason(); var other=document.getElementById('mv-reason-other'); if(other)other.value='ย้ายพาเลทจาก F-Zone เข้า Location คลัง ('+p.palletId+')';} }
                var newLoc=document.getElementById('mv-new-loc'); if(newLoc)newLoc.focus();
            }, 180);
        },

        parents: function () {
            var fromSettings = Array.isArray(this.state.settings.parents) ? this.state.settings.parents : [];
            var map = { 'F-AAD': { id: 'F-AAD', name: 'พื้นที่ F-AAD' } };
            fromSettings.forEach(function (p) { if (p && p.id) map[upper(p.id)] = { id: upper(p.id), name: p.name || p.id }; });
            Object.keys(this.state.maps || {}).forEach(function (id) { id = upper(id); if (id && !map[id]) map[id] = { id: id, name: id }; });
            (this.state.locations || []).forEach(function (l) { if (l.parentId && !map[upper(l.parentId)]) map[upper(l.parentId)] = { id: upper(l.parentId), name: l.parentName || l.parentId }; });
            return Object.keys(map).sort().map(function (k) { return map[k]; });
        },

        populatePalletSelectors: function () {
            var parentEl = document.getElementById('fz-pal-parent');
            var locEl = document.getElementById('fz-pal-location');
            if (!parentEl || !locEl) return;
            var currentParent = parentEl.value;
            var parents = this.parents();
            parentEl.innerHTML = '<option value="">เลือก Parent</option>' + parents.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.id + (p.name && p.name !== p.id ? ' — ' + p.name : '')) + '</option>'; }).join('');
            if (parents.some(function (p) { return p.id === currentParent; })) parentEl.value = currentParent;
            var parent = parentEl.value;
            var locations = this.state.locations.filter(function (l) { return l.enabled !== false && (!parent || upper(l.parentId) === upper(parent)); });
            var currentLoc = locEl.value;
            locEl.innerHTML = '<option value="">เลือก Location</option>' + locations.map(function (l) { return '<option value="' + esc(upper(l.code)) + '">' + esc(upper(l.code)) + '</option>'; }).join('');
            if (locations.some(function (l) { return upper(l.code) === currentLoc; })) locEl.value = currentLoc;
            this.populatePalletPoint();
        },

        populatePalletPoint: function () {
            var locEl = document.getElementById('fz-pal-location');
            var pointEl = document.getElementById('fz-pal-point');
            if (!locEl || !pointEl) return;
            var points = this.pointsFor(locEl.value);
            pointEl.innerHTML = '<option value="">ไม่ระบุจุด</option>' + points.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join('');
        },

        openPalletFromReceiving: function () {
            var item = window.app && window.app.state && window.app.state.current && window.app.state.current.item;
            if (!item) return;
            this.open('pallets');
            setTimeout(function () {
                var map = { 'fz-pal-item': item.code || '', 'fz-pal-desc': item.desc || '', 'fz-pal-total': item.qty || '', 'fz-pal-location': upper((document.getElementById('inp-new-loc') || {}).value || item.newLoc || item.oldLoc || '') };
                Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el) el.value = map[id]; });
                FZ.populatePalletSelectors();
                var cfg = FZ.locationConfig(map['fz-pal-location']);
                var parent = document.getElementById('fz-pal-parent');
                var loc = document.getElementById('fz-pal-location');
                if (cfg && parent) parent.value = upper(cfg.parentId);
                FZ.populatePalletSelectors();
                if (loc) loc.value = map['fz-pal-location'];
                FZ.populatePalletPoint();
                var point = document.getElementById('fz-pal-point'); if (point) point.value = FZ.state.selectedReceivingPoint || '';
            }, 0);
        },

        createPalletSplit: async function () {
            if (window.PlasFZoneBridge && typeof window.PlasFZoneBridge.open === 'function') {
                toast('กำลังเปิด BORNEO F-Zone เพื่อสร้าง Pallet ID ถาวร', 'info');
                return window.PlasFZoneBridge.open({ tab: 'putaway' });
            }
            var item = upper((document.getElementById('fz-pal-item') || {}).value);
            var desc = String((document.getElementById('fz-pal-desc') || {}).value || '').trim();
            var total = numberValue((document.getElementById('fz-pal-total') || {}).value);
            var onPallet = numberValue((document.getElementById('fz-pal-on') || {}).value);
            var parentId = upper((document.getElementById('fz-pal-parent') || {}).value);
            var selectedPoints = (this.state.palletSelectedPoints || []).map(upper).filter(Boolean);
            var location = parentId;
            var point = selectedPoints[0] || '';
            if (!item || total <= 0) return toast('กรุณากรอก Item และจำนวนรวม', 'error');
            var hasOnPallet = onPallet > 0;
            var totalPallets = hasOnPallet ? Math.ceil(total / onPallet) : 1;
            if (totalPallets > 500) return toast('จำนวนพาเลทมากเกิน 500 กรุณาตรวจ ON PALLET', 'error');
            var groupId = nowId('FZG');
            var source = window.app && window.app.state && window.app.state.current && window.app.state.current.item;
            var ids = [];
            var createdPallets = [];
            var remaining = total;
            try {
                for (var i = 1; i <= totalPallets; i++) {
                    var qty = hasOnPallet ? Math.min(onPallet, remaining) : total;
                    remaining = Math.max(0, remaining - qty);
                    var palletId = nowId('FZP');
                    var payload = {
                        palletId: palletId, groupId: groupId, palletNo: i, totalPallets: totalPallets,
                        item: item, description: desc, qty: qty, totalQty: total, onPallet: hasOnPallet ? onPallet : null,
                        parentId: parentId, location: location, point: selectedPoints.length ? selectedPoints[(i - 1) % selectedPoints.length] : point,
                        sourceType: source ? 'receiving' : 'manual', sourceId: source && source.id,
                        qrValue: this.buildMoveUrl({ palletId: palletId }), status: 'active',
                        createdAt: Date.now(), createdBy: currentUser(), updatedAt: Date.now()
                    };
                    await window.db.collection(COL.PALLETS).doc(palletId).set(payload);
                    ids.push(palletId);
                    createdPallets.push(payload);
                }
                this.state.pallets = createdPallets.concat(this.state.pallets.filter(function (p) { return ids.indexOf(p.palletId) === -1; }));
                this.state.palletSelectedPoints = [];
                toast((hasOnPallet ? ('Split และสร้าง ' + ids.length + ' QR พาเลท') : 'สร้าง QR พาเลท 1 ใบ') + (selectedPoints.length ? (' · กระจายลง ' + selectedPoints.length + ' จุด') : '') + ' เรียบร้อย', 'success');
                this.printPalletIds(ids, 'tsc');
            } catch (e) {
                console.error('F-Zone create pallets failed', e);
                toast('สร้าง QR พาเลทไม่สำเร็จ: ' + (e.message || e), 'error');
            }
        },

        visiblePalletIds: function () {
            var checked = Array.prototype.slice.call(document.querySelectorAll('.fz-pallet-check:checked')).map(function (e) { return e.value; });
            return checked.length ? checked : (this.state.pallets || []).slice(0, 100).map(function (p) { return p.palletId; });
        },

        printAllVisiblePalletsTsc: function () { this.printPalletIds(this.visiblePalletIds(), 'tsc'); },
        printAllVisiblePalletsA4: function () { this.printPalletIds(this.visiblePalletIds(), 'a4'); },
        printPalletTsc: function (id) { this.printPalletIds([id], 'tsc'); },
        printPalletA4: function (id) { this.printPalletIds([id], 'a4'); },

        toggleAllPalletChecks: function (on) {
            Array.prototype.forEach.call(document.querySelectorAll('.fz-pallet-check'), function (e) { e.checked = !!on; });
        },

        selectedPalletIds: function () {
            return Array.prototype.slice.call(document.querySelectorAll('.fz-pallet-check:checked')).map(function (e) { return upper(e.value); }).filter(Boolean);
        },

        deletePallet: async function (palletId) {
            if (!isManager()) return toast('เฉพาะ Admin/Supervisor เท่านั้นที่ลบข้อมูล F ได้', 'error');
            palletId = upper(palletId);
            if (!palletId) return;
            if (!confirm('ยืนยันลบพาเลท ' + palletId + '?\n\nระบบจะลบ QR พาเลท ตำแหน่งล่าสุด และประวัติการย้ายของพาเลทนี้ออกจาก F-Zone เท่านั้น')) return;
            await this.deletePalletData([palletId]);
        },

        deleteSelectedPallets: async function () {
            if (!isManager()) return toast('เฉพาะ Admin/Supervisor เท่านั้นที่ลบข้อมูล F ได้', 'error');
            var ids = this.selectedPalletIds();
            if (!ids.length) return toast('กรุณาเลือกพาเลทที่ต้องการลบ', 'error');
            if (!confirm('ยืนยันลบข้อมูล F ที่เลือก ' + ids.length + ' พาเลท?\n\nระบบจะลบ QR พาเลท ตำแหน่งล่าสุด และประวัติการย้ายที่เกี่ยวข้อง')) return;
            await this.deletePalletData(ids);
        },

        deleteRefsInChunks: async function (refs) {
            refs = (refs || []).filter(Boolean);
            var unique = [];
            var seen = {};
            refs.forEach(function (ref) {
                var key = ref.path || ((ref.parent && ref.parent.id || '') + '/' + (ref.id || ''));
                if (!key || seen[key]) return;
                seen[key] = true;
                unique.push(ref);
            });
            for (var i = 0; i < unique.length; i += 400) {
                var chunk = unique.slice(i, i + 400);
                if (window.db && typeof window.db.batch === 'function') {
                    var batch = window.db.batch();
                    chunk.forEach(function (ref) { batch.delete(ref); });
                    await batch.commit();
                } else {
                    for (var j = 0; j < chunk.length; j++) await chunk[j].delete();
                }
            }
            return unique.length;
        },

        queryRefs: async function (collectionName, predicate) {
            var snap = await window.db.collection(collectionName).get();
            var refs = [];
            snap.forEach(function (d) {
                var data = d.data() || {};
                if (!predicate || predicate(data, d.id)) refs.push(d.ref || window.db.collection(collectionName).doc(d.id));
            });
            return refs;
        },

        deletePalletData: async function (ids) {
            if (!isManager()) return toast('ไม่มีสิทธิ์ลบข้อมูล F', 'error');
            ids = (ids || []).map(upper).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });
            if (!ids.length) return;
            if (!window.db) return toast('Firebase ไม่พร้อม จึงยังลบข้อมูลไม่ได้', 'error');
            var refs = [];
            var deletedMap = {};
            ids.forEach(function (id) {
                deletedMap[id] = true;
                refs.push(window.db.collection(COL.PALLETS).doc(id));
                refs.push(window.db.collection(COL.PLACEMENTS).doc('pallet-' + safeId(id)));
            });
            try {
                for (var i = 0; i < ids.length; i++) {
                    var movementSnap = await window.db.collection(COL.MOVEMENTS).where('palletId', '==', ids[i]).get();
                    movementSnap.forEach(function (d) { refs.push(d.ref || window.db.collection(COL.MOVEMENTS).doc(d.id)); });
                }
                await this.deleteRefsInChunks(refs);
                this.state.pallets = (this.state.pallets || []).filter(function (p) { return !deletedMap[upper(p.palletId || p._id)]; });
                this.state.placements = (this.state.placements || []).filter(function (p) { return !deletedMap[upper(p.palletId || p.sourceId)] && !deletedMap[upper(String(p._id || '').replace(/^pallet-/, ''))]; });
                this.state.moveQueue = (this.state.moveQueue || []).filter(function (p) { return !deletedMap[upper(p.palletId)]; });
                toast('ลบข้อมูล F จำนวน ' + ids.length + ' พาเลทเรียบร้อย', 'success');
                this.render();
            } catch (e) {
                console.error('F-Zone delete pallet failed', e);
                toast('ลบข้อมูล F ไม่สำเร็จ: ' + (e.message || e), 'error');
            }
        },

        purgeOldFData: async function () {
            if (!isManager()) return toast('เฉพาะ Admin/Supervisor เท่านั้นที่ลบข้อมูล F ได้', 'error');
            var days = Math.floor(numberValue((document.getElementById('fz-purge-days') || {}).value));
            if (days < 1) return toast('กรุณาระบุอายุข้อมูลอย่างน้อย 1 วัน', 'error');
            var code = window.prompt('ลบข้อมูลการใช้งาน F-Zone ที่เก่ากว่า ' + days + ' วัน\n\nจะลบเฉพาะ QR พาเลท จุดวาง และประวัติการย้าย แต่จะเก็บ MAP, Parent, Location และ QR Zone ไว้\n\nพิมพ์ DELETE ' + days + ' เพื่อยืนยัน');
            if (code !== 'DELETE ' + days) return toast('ยกเลิกการลบข้อมูลเก่า', 'info');
            var cutoff = Date.now() - days * 86400000;
            var isOld = function (data, fields) {
                for (var i = 0; i < fields.length; i++) {
                    var t = millisValue(data && data[fields[i]]);
                    if (t) return t < cutoff;
                }
                return false;
            };
            try {
                var refs = [];
                refs = refs.concat(await this.queryRefs(COL.PALLETS, function (d) { return isOld(d, ['updatedAt', 'createdAt']); }));
                refs = refs.concat(await this.queryRefs(COL.PLACEMENTS, function (d) { return isOld(d, ['updatedAt', 'createdAt']); }));
                refs = refs.concat(await this.queryRefs(COL.MOVEMENTS, function (d) { return isOld(d, ['movedAt', 'updatedAt', 'createdAt']); }));
                if (!refs.length) return toast('ไม่พบข้อมูล F ที่เก่ากว่า ' + days + ' วัน', 'info');
                var count = await this.deleteRefsInChunks(refs);
                this.state.pallets = (this.state.pallets || []).filter(function (d) { return !isOld(d, ['updatedAt', 'createdAt']); });
                this.state.placements = (this.state.placements || []).filter(function (d) { return !isOld(d, ['updatedAt', 'createdAt']); });
                this.state.moveQueue = [];
                toast('ลบข้อมูล F เก่า ' + count + ' รายการเรียบร้อย', 'success');
                this.render();
            } catch (e) {
                console.error('F-Zone purge old data failed', e);
                toast('ลบข้อมูลเก่าไม่สำเร็จ: ' + (e.message || e), 'error');
            }
        },

        clearAllOperationalFData: async function () {
            if (!isManager()) return toast('เฉพาะ Admin/Supervisor เท่านั้นที่ลบข้อมูล F ได้', 'error');
            var code = window.prompt('คำเตือน: จะลบข้อมูลการใช้งาน F-Zone ทั้งหมด\n\nลบ: QR พาเลท, จุดวางล่าสุด และประวัติการย้าย\nเก็บไว้: MAP, Parent, Location, Feature Flag และ QR Zone\n\nพิมพ์ DELETE F เพื่อยืนยัน');
            if (code !== 'DELETE F') return toast('ยกเลิกการล้างข้อมูล F', 'info');
            try {
                var refs = [];
                refs = refs.concat(await this.queryRefs(COL.PALLETS));
                refs = refs.concat(await this.queryRefs(COL.PLACEMENTS));
                refs = refs.concat(await this.queryRefs(COL.MOVEMENTS));
                if (!refs.length) return toast('ไม่มีข้อมูลการใช้งาน F ให้ลบ', 'info');
                var count = await this.deleteRefsInChunks(refs);
                this.state.pallets = [];
                this.state.placements = [];
                this.state.moveQueue = [];
                this.state.moveDestination = null;
                this.persistMoveDestination();
                toast('ล้างข้อมูลการใช้งาน F-Zone ' + count + ' รายการเรียบร้อย', 'success');
                this.render();
            } catch (e) {
                console.error('F-Zone clear operational data failed', e);
                toast('ล้างข้อมูล F ไม่สำเร็จ: ' + (e.message || e), 'error');
            }
        },

        printPalletIds: function (ids, format) {
            format = format === 'a4' ? 'a4' : 'tsc';
            var set = {};
            (ids || []).forEach(function (id) { set[id] = true; });
            var items = (this.state.pallets || []).filter(function (p) { return set[p.palletId]; });
            if (!items.length) return toast('ไม่พบข้อมูลพาเลทสำหรับพิมพ์', 'error');
            var w = window.open('', '_blank');
            if (!w) return toast('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตก่อนพิมพ์', 'error');
            var html;
            if (format === 'a4') {
                var cards = items.map(function (p) {
                    var qr = qrDataUrl(FZ.buildMoveUrl({ palletId: p.palletId }), 4, 2);
                    return '<section class="a4-label"><div class="a4-head"><div><div class="a4-item">' + esc(p.item || '-') + '</div><div class="a4-desc">' + esc(p.description || '') + '</div></div><div class="a4-pal">พาเลท ' + esc(p.palletNo) + '/' + esc(p.totalPallets) + '</div></div><div class="a4-body"><div class="a4-data"><div class="a4-qty">QTY <b>' + esc(p.qty) + '</b></div>' + (Number(p.onPallet || 0) > 0 ? '<div>ON PALLET ' + esc(p.onPallet) + '</div>' : '') + '<div class="a4-id">' + esc(p.palletId) + '</div><div class="a4-hint">สแกน QR เพื่อเปิดระบบย้าย F-Zone</div></div><div class="a4-qr"><img src="' + qr + '"></div></div></section>';
                }).join('');
                html = '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>F-Zone Pallet A4</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif;color:#111}.toolbar{position:sticky;top:0;background:#0f766e;color:#fff;padding:10px;text-align:center}.toolbar button{border:0;border-radius:10px;padding:10px 20px;font-weight:800}.a4-label{width:190mm;height:133mm;border:2.2mm solid #111;border-radius:5mm;padding:10mm;page-break-inside:avoid;page-break-after:always;display:flex;flex-direction:column}.a4-label:last-child{page-break-after:auto}.a4-head{display:flex;justify-content:space-between;gap:10mm;border-bottom:1mm solid #111;padding-bottom:5mm}.a4-item{font-size:34pt;font-weight:950;line-height:1}.a4-desc{font-size:20pt;font-weight:800;margin-top:4mm}.a4-pal{font-size:22pt;font-weight:900;white-space:nowrap}.a4-body{flex:1;display:grid;grid-template-columns:1fr 82mm;gap:10mm;align-items:center}.a4-data{font-size:22pt;font-weight:800;line-height:1.55}.a4-qty{font-size:38pt}.a4-id{font-family:monospace;font-size:17pt;margin-top:5mm}.a4-hint{font-size:14pt;margin-top:7mm}.a4-qr img{width:78mm;height:78mm;display:block}@media print{.toolbar{display:none}.a4-label{margin:0}}</style></head><body><div class="toolbar"><button onclick="window.print()">พิมพ์ป้าย A4</button></div>' + cards + '</body></html>';
            } else {
                var labels = items.map(function (p) {
                    var qr = qrDataUrl(FZ.buildMoveUrl({ palletId: p.palletId }), 4, 2);
                    return '<section class="label"><div class="text"><div class="item">' + esc(p.item || '-') + '</div><div class="desc">' + esc(p.description || '') + '</div><div class="qty">QTY ' + esc(p.qty) + ' · ' + esc(p.palletNo) + '/' + esc(p.totalPallets) + '</div><div class="pid">' + esc(p.palletId) + '</div></div><div class="qr"><img src="' + qr + '"></div></section>';
                });
                var rows = [];
                for (var i = 0; i < labels.length; i += 2) rows.push('<div class="sheet">' + labels[i] + (labels[i + 1] || '<section class="label blank"></section>') + '</div>');
                html = '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>F-Zone Pallet TSC</title><style>@page{size:100mm 25mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,sans-serif}.sheet{width:100mm;height:25mm;display:flex;page-break-after:always;overflow:hidden}.label{width:50mm;height:25mm;border-right:.25mm dashed #999;display:grid;grid-template-columns:27mm 20mm;gap:1mm;padding:1.2mm;overflow:hidden}.label:last-child{border-right:0}.text{min-width:0;display:flex;flex-direction:column;justify-content:center}.item{font-size:10.5pt;font-weight:950;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.desc{font-size:6.2pt;font-weight:800;line-height:1.15;height:7.2mm;overflow:hidden;margin-top:.8mm}.qty{font-size:6.8pt;font-weight:900;white-space:nowrap}.pid{font-size:4.3pt;font-family:monospace;white-space:nowrap;overflow:hidden}.qr{display:grid;place-items:center}.qr img{width:19mm;height:19mm;display:block}.blank{border:0}@media print{.sheet:last-child{page-break-after:auto}}</style></head><body>' + rows.join('') + '<script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>';
            }
            w.document.open(); w.document.write(html); w.document.close();
        },

        restoreMoveDestination: function () {
            if (this.state.moveDestination) return this.state.moveDestination;
            try {
                var saved = JSON.parse(localStorage.getItem('plas-fzone-move-destination') || 'null');
                if (saved && saved.expiresAt > Date.now() && saved.location) {
                    this.state.moveDestination = { parentId: upper(saved.parentId), location: upper(saved.location), point: upper(saved.point) };
                } else localStorage.removeItem('plas-fzone-move-destination');
            } catch (e) {}
            return this.state.moveDestination;
        },

        persistMoveDestination: function () {
            try {
                if (!this.state.moveDestination) return localStorage.removeItem('plas-fzone-move-destination');
                localStorage.setItem('plas-fzone-move-destination', JSON.stringify(Object.assign({}, this.state.moveDestination, { expiresAt: Date.now() + 4 * 60 * 60 * 1000 })));
            } catch (e) {}
        },

        setMoveDestination: function (dest, notify) {
            dest = dest || {};
            var location = upper(dest.location);
            var point = upper(dest.point);
            if (!location || !point) {
                if (notify !== false) toast('QR Zone ไม่มี Location หรือจุดวาง', 'error');
                return false;
            }
            this.state.moveDestination = { parentId: upper(dest.parentId || location), location: location, point: point };
            this.persistMoveDestination();
            this.state.moveQueue = [];
            if (notify !== false) toast('เลือกปลายทาง ' + point + ' แล้ว', 'success');
            if (this.state.currentTab === 'move') this.render();
            return true;
        },

        useMoveZoneInput: function () {
            var input = document.getElementById('fz-move-zone-input');
            var parsed = this.parseZoneQr(input && input.value);
            if (!parsed) return toast('QR Zone ไม่ถูกต้อง กรุณาสแกนป้าย Zone ที่พิมพ์จาก F-Zone', 'error');
            this.setMoveDestination(parsed, true);
        },

        useMovePalletInput: function () {
            var input = document.getElementById('fz-move-pallet-input');
            var raw = input && input.value;
            if (this.addMovePallet(raw) && input) input.value = '';
        },

        addMovePallet: function (raw) {
            var palletId = this.parsePalletQr(raw);
            if (!palletId) return false;
            if (!this.restoreMoveDestination()) {
                this.state.pendingPalletId = palletId;
                toast('กรุณาสแกน QR Zone ปลายทางก่อน', 'error');
                return false;
            }
            var pallet = (this.state.pallets || []).find(function (p) { return upper(p.palletId) === palletId && p.status !== 'archived'; });
            if (!pallet) {
                this.state.pendingPalletId = palletId;
                toast('ยังไม่พบพาเลท ' + palletId + ' อาจกำลังโหลดข้อมูล', 'info');
                return false;
            }
            if (this.state.moveQueue.some(function (p) { return upper(p.palletId) === palletId; })) {
                toast('พาเลทนี้อยู่ในรายการแล้ว', 'info');
                return false;
            }
            var d = this.state.moveDestination;
            if (upper(pallet.location) === d.location && upper(pallet.point) === d.point) {
                toast('พาเลทนี้อยู่ที่ ' + d.point + ' แล้ว', 'info');
                return false;
            }
            this.state.pendingPalletId = '';
            this.state.moveQueue.push(pallet);
            toast('เพิ่มพาเลท ' + palletId + ' แล้ว', 'success');
            if (this.state.currentTab === 'move') this.render();
            return true;
        },

        tryPendingPallet: function () {
            var id = upper(this.state.pendingPalletId || '');
            if (!id || !(this.state.pallets || []).length || !this.hasLoggedInUser()) return;
            this.addMovePallet(id);
        },

        removeMovePallet: function (palletId) {
            palletId = upper(palletId);
            this.state.moveQueue = this.state.moveQueue.filter(function (p) { return upper(p.palletId) !== palletId; });
            this.render();
        },

        resetMove: function () {
            this.state.moveDestination = null;
            this.state.moveQueue = [];
            this.state.pendingPalletId = '';
            this.persistMoveDestination();
            this.render();
        },

        renderMove: function () {
            return '<div class="fz-grid"><div class="fz-card fz-span-12" style="max-width:760px;margin:0 auto;text-align:center;padding:28px"><div style="width:72px;height:72px;border-radius:22px;background:#ccfbf1;color:#0f766e;display:grid;place-items:center;margin:0 auto 14px;font-size:34px"><i class="ph ph-arrow-square-out"></i></div><h3 style="font-size:22px;margin-bottom:8px">ระบบย้าย F-Zone แยกเป็นเว็บไซต์ใหม่</h3><div class="fz-muted" style="font-size:15px;line-height:1.7">สแกน QR พาเลทจากป้ายใหม่เพื่อเปิดงานย้ายโดยตรง หรือกดปุ่มด้านล่างเพื่อเปิด BORNEO F-Zone Move</div><button class="fz-btn fz-btn-primary" style="width:100%;max-width:420px;margin-top:20px;min-height:54px;font-size:16px" onclick="window.FZone.openMoveSite()"><i class="ph ph-arrows-left-right"></i> เปิด BORNEO F-Zone Move</button><div class="fz-muted" style="margin-top:14px">URL: https://borneofzone.netlify.app/</div></div></div>';
        },

        afterRenderMove: function () {
            var target = document.getElementById(this.state.moveDestination ? 'fz-move-pallet-input' : 'fz-move-zone-input');
            if (target) setTimeout(function () { try { target.focus(); } catch (e) {} }, 50);
        },

        confirmMove: async function () {
            var dest = this.restoreMoveDestination();
            var queue = (this.state.moveQueue || []).slice();
            if (!dest || !queue.length) return toast('กรุณาสแกนจุดปลายทางและพาเลทก่อน', 'error');
            if (!window.db) return toast('Firebase ไม่พร้อม จึงยังยืนยันการย้ายไม่ได้', 'error');
            var at = Date.now();
            var by = currentUser();
            try {
                if (typeof window.db.batch === 'function') {
                    var batch = window.db.batch();
                    queue.forEach(function (p) {
                        var from = { parentId: p.parentId || '', location: p.location || '', point: p.point || '' };
                        batch.set(window.db.collection(COL.PALLETS).doc(p.palletId), { parentId: dest.parentId, location: dest.location, point: dest.point, updatedAt: at, updatedBy: by, movedAt: at, movedBy: by }, { merge: true });
                        batch.set(window.db.collection(COL.PLACEMENTS).doc('pallet-' + safeId(p.palletId)), { id: 'pallet-' + safeId(p.palletId), sourceType: 'pallet', sourceId: p.palletId, palletId: p.palletId, item: p.item || '', description: p.description || '', qty: p.qty || 0, parentId: dest.parentId, location: dest.location, point: dest.point, user: by, updatedAt: at, updatedBy: by }, { merge: true });
                        batch.set(window.db.collection(COL.MOVEMENTS).doc(nowId('FZM')), { palletId: p.palletId, item: p.item || '', qty: p.qty || 0, fromParentId: from.parentId, fromLocation: from.location, fromPoint: from.point, toParentId: dest.parentId, toLocation: dest.location, toPoint: dest.point, movedAt: at, movedBy: by });
                    });
                    await batch.commit();
                } else {
                    for (var i = 0; i < queue.length; i++) {
                        var p = queue[i];
                        var from = { parentId: p.parentId || '', location: p.location || '', point: p.point || '' };
                        await window.db.collection(COL.PALLETS).doc(p.palletId).set({ parentId: dest.parentId, location: dest.location, point: dest.point, updatedAt: at, updatedBy: by, movedAt: at, movedBy: by }, { merge: true });
                        await window.db.collection(COL.PLACEMENTS).doc('pallet-' + safeId(p.palletId)).set({ id: 'pallet-' + safeId(p.palletId), sourceType: 'pallet', sourceId: p.palletId, palletId: p.palletId, item: p.item || '', description: p.description || '', qty: p.qty || 0, parentId: dest.parentId, location: dest.location, point: dest.point, user: by, updatedAt: at, updatedBy: by }, { merge: true });
                        await window.db.collection(COL.MOVEMENTS).doc(nowId('FZM')).set({ palletId: p.palletId, item: p.item || '', qty: p.qty || 0, fromParentId: from.parentId, fromLocation: from.location, fromPoint: from.point, toParentId: dest.parentId, toLocation: dest.location, toPoint: dest.point, movedAt: at, movedBy: by });
                    }
                }
                var ids = {};
                queue.forEach(function (p) { ids[p.palletId] = true; });
                this.state.pallets = (this.state.pallets || []).map(function (p) { return ids[p.palletId] ? Object.assign({}, p, { parentId: dest.parentId, location: dest.location, point: dest.point, updatedAt: at, updatedBy: by }) : p; });
                toast('ย้าย ' + queue.length + ' พาเลทไป ' + dest.point + ' เรียบร้อย', 'success');
                this.state.moveDestination = null;
                this.state.moveQueue = [];
                this.state.pendingPalletId = '';
                this.persistMoveDestination();
                this.render();
            } catch (e) {
                console.error('F-Zone move failed', e);
                toast('ย้ายไม่สำเร็จ: ' + (e.message || e), 'error');
            }
        },

        renderZonePrint: function () {
            return '<div class="fz-grid"><div class="fz-card fz-span-4"><h3><i class="ph ph-printer"></i> QR Zone ขนาด A4</h3><div class="fz-muted">เลือก Location หรือจุดวาง แล้วพิมพ์ด้วยเครื่องพิมพ์ทั่วไป กระดาษ A4</div><div class="fz-row" style="margin-top:12px"><button class="fz-btn fz-btn-secondary" onclick="window.FZone.toggleAllZoneChecks(true)">เลือกทั้งหมด</button><button class="fz-btn fz-btn-secondary" onclick="window.FZone.toggleAllZoneChecks(false)">ล้าง</button></div><button class="fz-btn fz-btn-primary" style="width:100%;margin-top:12px" onclick="window.FZone.printSelectedZones()"><i class="ph ph-printer"></i> พิมพ์ QR Zone A4</button></div><div class="fz-card fz-span-8"><h3><i class="ph ph-map-pin"></i> Location ที่เปิดใช้งาน</h3><div id="fz-zone-print-list" class="fz-list"></div></div></div>';
        },

        renderZonePrintList: function () {
            var target = document.getElementById('fz-zone-print-list');
            if (!target) return;
            var list = this.state.locations.filter(function (l) { return l.enabled !== false; });
            if (!list.length) { target.innerHTML = '<div class="fz-empty">ยังไม่มี Location ที่เปิดใช้งาน</div>'; return; }
            target.innerHTML = list.map(function (l) {
                var points = Array.isArray(l.points) && l.points.length ? l.points : [''];
                return '<div class="fz-item"><div class="fz-item-title">' + esc(l.parentId || '-') + ' · ' + esc(l.code) + '</div><div class="fz-point-grid">' + points.map(function (p) { var value = [l.parentId || '', upper(l.code), upper(p || '')].join('||'); return '<label class="fz-point" style="display:flex;gap:7px;align-items:center;justify-content:center"><input class="fz-zone-check" type="checkbox" value="' + esc(value) + '">' + esc(p || 'Location หลัก') + '</label>'; }).join('') + '</div></div>';
            }).join('');
        },

        toggleAllZoneChecks: function (on) {
            Array.prototype.forEach.call(document.querySelectorAll('.fz-zone-check'), function (e) { e.checked = !!on; });
        },

        printSelectedZones: function () {
            var selected = Array.prototype.slice.call(document.querySelectorAll('.fz-zone-check:checked')).map(function (e) { return e.value.split('||'); });
            if (!selected.length) return toast('กรุณาเลือก QR Zone ที่ต้องการพิมพ์', 'error');
            var cards = selected.map(function (v) {
                var parentId = v[0], loc = v[1], point = v[2];
                var payload = FZ.buildMoveUrl({ parentId: parentId, location: loc, point: point });
                var qr = qrDataUrl(payload, 6, 2);
                return '<div class="card"><div class="parent">' + esc(parentId || 'F-ZONE') + '</div><div class="location">' + esc(loc) + '</div><img src="' + qr + '"><div class="point">' + esc(point || 'LOCATION หลัก') + '</div><div class="hint">สแกนเมื่อวางสินค้า ณ จุดจริง</div></div>';
            }).join('');
            var html = '<!doctype html><html><head><meta charset="utf-8"><title>F-Zone QR A4</title><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,sans-serif}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8mm}.card{height:125mm;border:1.2mm solid #0f766e;border-radius:5mm;text-align:center;padding:6mm;page-break-inside:avoid}.parent{font-size:15pt;font-weight:800;color:#0f766e}.location{font-size:30pt;font-weight:950;margin:2mm 0}.card img{width:60mm;height:60mm}.point{font-size:24pt;font-weight:950;margin-top:2mm}.hint{font-size:10pt;color:#475569;margin-top:3mm}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="grid">' + cards + '</div><script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>';
            var w = window.open('', '_blank');
            if (!w) return toast('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตก่อนพิมพ์', 'error');
            w.document.open(); w.document.write(html); w.document.close();
        },

        renderConfig: function () {
            var s = this.state.settings;
            var usageCount = (this.state.pallets || []).length + (this.state.placements || []).length;
            return '<div class="fz-grid"><div class="fz-card fz-span-4"><h3><i class="ph ph-toggle-right"></i> Feature Flag</h3><label class="fz-label">โหมดการทำงาน</label><select id="fz-config-mode" class="fz-select"><option value="off" ' + (s.featureMode === 'off' ? 'selected' : '') + '>Off — ปิด F-Zone</option><option value="optional" ' + (s.featureMode === 'optional' ? 'selected' : '') + '>Optional — ค่าเริ่มต้น ไม่บังคับเลือกจุด</option><option value="required" ' + (s.featureMode === 'required' ? 'selected' : '') + '>Required — บังคับเฉพาะ Location ที่ Config และระบบ F-Zone ออนไลน์</option></select><label class="fz-row" style="margin-top:10px"><input id="fz-config-enabled" type="checkbox" ' + (s.moduleEnabled !== false ? 'checked' : '') + '> <b>เปิดโมดูลใน QuickHub</b></label><button class="fz-btn fz-btn-primary" style="width:100%;margin-top:12px" onclick="window.FZone.saveFeatureFlag()"><i class="ph ph-floppy-disk"></i> บันทึก Feature Flag</button><div class="fz-muted" style="margin-top:9px">แม้ตั้ง Required หาก F-Zone เชื่อมต่อผิดพลาด Receiving เดิมจะไม่ถูกบล็อก</div></div><div class="fz-card fz-span-8"><h3><i class="ph ph-tree-structure"></i> Parent Locations</h3><div class="fz-row"><input id="fz-parent-id" class="fz-input" style="flex:1" placeholder="เช่น F-AAD, F-BKK, F-RETURN"><input id="fz-parent-name" class="fz-input" style="flex:1" placeholder="ชื่อพื้นที่"><button class="fz-btn fz-btn-primary" onclick="window.FZone.addParent()"><i class="ph ph-plus"></i> เพิ่ม</button></div><div id="fz-parent-list" class="fz-list" style="margin-top:10px">' + this.renderParentList() + '</div></div><div class="fz-card fz-span-12"><h3><i class="ph ph-map-pin-line"></i> Location และจุดวางจริง</h3><div class="fz-grid" style="gap:10px"><div class="fz-span-4"><label class="fz-label">Parent</label><select id="fz-loc-parent" class="fz-select">' + this.parentOptions() + '</select></div><div class="fz-span-4"><label class="fz-label">Location</label><input id="fz-loc-code" class="fz-input" placeholder="เช่น F-AAD01"></div><div class="fz-span-4"><label class="fz-label">จุดวางจริง คั่นด้วย comma</label><input id="fz-loc-points" class="fz-input" placeholder="P01, P02, P03"></div><div class="fz-span-12"><button class="fz-btn fz-btn-primary" onclick="window.FZone.saveLocationConfig()"><i class="ph ph-floppy-disk"></i> เพิ่ม/อัปเดต Location</button></div></div><div id="fz-location-admin-list" class="fz-table-wrap" style="margin-top:12px"></div></div><div class="fz-card fz-span-12" style="border-color:#fecaca;background:#fffafa"><div class="fz-row"><div style="flex:1;min-width:220px"><h3 style="color:#b91c1c"><i class="ph ph-trash"></i> จัดการข้อมูล F เก่า</h3><div class="fz-muted">ข้อมูลที่เห็นในหน้านี้: QR พาเลท ' + (this.state.pallets || []).length + ' · จุดวาง ' + (this.state.placements || []).length + ' · รวมอย่างน้อย ' + usageCount + ' รายการ</div></div><span class="fz-badge off">Admin / Supervisor</span></div><div class="fz-grid" style="gap:10px;margin-top:12px"><div class="fz-span-4"><label class="fz-label">ลบข้อมูลที่เก่ากว่า</label><div class="fz-row"><input id="fz-purge-days" class="fz-input" type="number" min="1" value="30" style="flex:1"><span><b>วัน</b></span></div></div><div class="fz-span-4" style="display:flex;align-items:flex-end"><button class="fz-btn fz-btn-danger" style="width:100%" onclick="window.FZone.purgeOldFData()"><i class="ph ph-clock-counter-clockwise"></i> ลบข้อมูลเก่าตามวัน</button></div><div class="fz-span-4" style="display:flex;align-items:flex-end"><button class="fz-btn fz-btn-danger" style="width:100%;background:#991b1b;color:white" onclick="window.FZone.clearAllOperationalFData()"><i class="ph ph-warning-octagon"></i> ล้างข้อมูลใช้งาน F ทั้งหมด</button></div></div><div class="fz-muted" style="margin-top:10px"><b>ไม่ลบ:</b> แผนผัง MAP, Parent, Location, จุด QR Zone และ Feature Flag · <b>ไม่แตะ:</b> Collection งาน Receiving และ Top Location หลัก</div></div></div>';
        },

        parentOptions: function () {
            return '<option value="">เลือก Parent</option>' + this.parents().map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.id + (p.name && p.name !== p.id ? ' — ' + p.name : '')) + '</option>'; }).join('');
        },

        renderParentList: function () {
            var list = this.parents();
            if (!list.length) return '<div class="fz-empty">ยังไม่มี Parent Location — เพิ่มได้หลายพื้นที่ ไม่จำกัด F-AAD</div>';
            return list.map(function (p) { return '<div class="fz-item fz-row"><div style="flex:1"><div class="fz-item-title">' + esc(p.id) + '</div><div class="fz-muted">' + esc(p.name || '') + '</div></div><button class="fz-btn fz-btn-danger" onclick="window.FZone.removeParent(\'' + esc(p.id) + '\')"><i class="ph ph-trash"></i></button></div>'; }).join('');
        },

        saveFeatureFlag: async function () {
            if (!isManager()) return;
            var mode = (document.getElementById('fz-config-mode') || {}).value || 'optional';
            var enabled = !!((document.getElementById('fz-config-enabled') || {}).checked);
            try {
                await window.db.collection(COL.SETTINGS).doc('main').set({ featureMode: mode, moduleEnabled: enabled, updatedAt: Date.now(), updatedBy: currentUser() }, { merge: true });
                toast('บันทึก Feature Flag แล้ว', 'success');
            } catch (e) { toast('บันทึก Feature Flag ไม่สำเร็จ', 'error'); }
        },

        addParent: async function () {
            if (!isManager()) return;
            var id = upper((document.getElementById('fz-parent-id') || {}).value);
            var name = String((document.getElementById('fz-parent-name') || {}).value || '').trim();
            if (!id) return toast('กรุณาระบุ Parent Location', 'error');
            var parents = this.parents().filter(function (p) { return p.id !== id; });
            parents.push({ id: id, name: name || id });
            try {
                await window.db.collection(COL.SETTINGS).doc('main').set({ parents: parents, updatedAt: Date.now(), updatedBy: currentUser() }, { merge: true });
                toast('เพิ่ม Parent ' + id + ' แล้ว', 'success');
            } catch (e) { toast('เพิ่ม Parent ไม่สำเร็จ', 'error'); }
        },

        removeParent: async function (id) {
            if (!isManager()) return;
            var used = this.state.locations.some(function (l) { return upper(l.parentId) === upper(id); });
            if (used) return toast('ยังลบไม่ได้ เพราะมี Location อยู่ใต้ Parent นี้', 'error');
            var parents = this.parents().filter(function (p) { return p.id !== upper(id); });
            try { await window.db.collection(COL.SETTINGS).doc('main').set({ parents: parents, updatedAt: Date.now(), updatedBy: currentUser() }, { merge: true }); }
            catch (e) { toast('ลบ Parent ไม่สำเร็จ', 'error'); }
        },

        saveLocationConfig: async function () {
            if (!isManager()) return;
            var parentId = upper((document.getElementById('fz-loc-parent') || {}).value);
            var code = upper((document.getElementById('fz-loc-code') || {}).value);
            var pointsRaw = String((document.getElementById('fz-loc-points') || {}).value || '');
            var points = pointsRaw.split(/[,\n]+/).map(upper).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });
            if (!parentId || !code) return toast('กรุณาเลือก Parent และระบุ Location', 'error');
            var payload = { parentId: parentId, code: code, points: points, enabled: true, updatedAt: Date.now(), updatedBy: currentUser() };
            try {
                await window.db.collection(COL.LOCATIONS).doc(safeId(parentId + '__' + code)).set(payload, { merge: true });
                toast('บันทึก Location ' + code + ' แล้ว', 'success');
                var codeEl = document.getElementById('fz-loc-code'); var pointsEl = document.getElementById('fz-loc-points');
                if (codeEl) codeEl.value = ''; if (pointsEl) pointsEl.value = '';
            } catch (e) { toast('บันทึก Location ไม่สำเร็จ', 'error'); }
        },

        renderLocationAdminList: function () {
            var target = document.getElementById('fz-location-admin-list');
            if (!target) return;
            var rows = this.state.locations.map(function (l) {
                return '<tr><td>' + esc(l.parentId || '-') + '</td><td><b>' + esc(l.code || '-') + '</b></td><td>' + esc((l.points || []).join(', ') || '-') + '</td><td><span class="fz-badge ' + (l.enabled === false ? 'off' : '') + '">' + (l.enabled === false ? 'ปิด' : 'เปิด') + '</span></td><td><button class="fz-btn fz-btn-secondary" onclick="window.FZone.toggleLocation(\'' + esc(l._id) + '\',' + (l.enabled === false ? 'true' : 'false') + ')">' + (l.enabled === false ? 'เปิดใช้' : 'ปิดใช้') + '</button> <button class="fz-btn fz-btn-danger" onclick="window.FZone.deleteLocation(\'' + esc(l._id) + '\')"><i class="ph ph-trash"></i></button></td></tr>';
            }).join('');
            target.innerHTML = '<table class="fz-table"><thead><tr><th>Parent</th><th>Location</th><th>จุดวางจริง</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="fz-empty">ยังไม่มี Location</td></tr>') + '</tbody></table>';
        },

        toggleLocation: async function (docId, enabled) {
            if (!isManager()) return;
            try { await window.db.collection(COL.LOCATIONS).doc(docId).set({ enabled: !!enabled, updatedAt: Date.now(), updatedBy: currentUser() }, { merge: true }); }
            catch (e) { toast('เปลี่ยนสถานะไม่สำเร็จ', 'error'); }
        },

        deleteLocation: async function (docId) {
            if (!isManager()) return;
            if (!confirm('ลบ F-Zone Location นี้? ข้อมูลพาเลท/ประวัติเดิมจะยังคงอยู่')) return;
            try { await window.db.collection(COL.LOCATIONS).doc(docId).delete(); toast('ลบ Location แล้ว', 'success'); }
            catch (e) { toast('ลบ Location ไม่สำเร็จ', 'error'); }
        }
    };

    window.FZone = FZ;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { FZ.init(); });
    else FZ.init();
})();
