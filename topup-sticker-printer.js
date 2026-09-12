/*
 * PLAS WMS — TOPUP Sticker Import & Print
 * v5.6.0
 * - Import Microsoft Dynamics Transfer order TXT / HTM
 * - Verify and edit before printing
 * - Print matched-control TSC labels at 50x25 mm, grouped and sequenced with the control sheet
 */
(function(root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PlasTopupSticker = api;
})(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    function cleanText(v) {
        return String(v == null ? '' : v).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function cleanSecondary(v) {
        var s = cleanText(v);
        s = s.replace(/^\[\s*/, '').replace(/\s*\]$/, '').trim();
        return s;
    }

    function makeId(index, item, batch, loc) {
        var seed = [index, item, batch, loc].join('|');
        var h = 0;
        for (var i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
        return 'topup-import-' + index + '-' + Math.abs(h);
    }

    function normalizeQty(v) {
        var s = cleanText(v);
        return s;
    }

    function isQty(v) {
        var n = parseFloat(String(v || '').replace(/,/g, ''));
        return Number.isFinite(n) && n >= 0;
    }

    function buildItem(raw, index, meta) {
        var item = {
            id: makeId(index, raw.item, raw.batch, raw.toLocation),
            item: cleanText(raw.item),
            secondary: cleanSecondary(raw.secondary),
            name: cleanText(raw.name),
            qty: normalizeQty(raw.qty),
            unit: cleanText(raw.unit),
            batch: cleanText(raw.batch),
            fromLocation: cleanText(raw.fromLocation),
            recommendedLocation: cleanText(raw.recommendedLocation),
            toLocation: cleanText(raw.toLocation),
            sourceWarehouse: cleanText(meta.fromWarehouse),
            destinationWarehouse: cleanText(meta.toWarehouse),
            tfor: cleanText(meta.tfor),
            assignedTo: '',
            assignedQty: '',
            originalQty: normalizeQty(raw.qty),
            selected: true,
            sourceIndex: index
        };
        item.validation = validateItem(item);
        return item;
    }

    function validateItem(item) {
        var errors = [], warnings = [];
        if (!cleanText(item.item)) errors.push('ไม่มี ITEM');
        if (!cleanText(item.name)) errors.push('ไม่มีชื่อสินค้า');
        if (!cleanText(item.toLocation)) errors.push('ไม่มี Location ปลายทาง');
        if (!cleanText(item.qty)) errors.push('ไม่มีจำนวน');
        else if (!isQty(item.qty)) errors.push('จำนวนไม่ถูกต้อง');
        if (!cleanText(item.secondary)) warnings.push('ไม่มีเลขรอง');
        if (!cleanText(item.batch)) warnings.push('ไม่มี BATCH');
        var assignedTo = cleanText(item.assignedTo), assignedQty = cleanText(item.assignedQty);
        if (assignedTo && !assignedQty) warnings.push('ยังไม่ระบุจำนวนให้พนักงาน');
        if (!assignedTo && assignedQty) warnings.push('ยังไม่เลือกพนักงาน');
        if (assignedQty) {
            if (!isQty(assignedQty) || numberValue(assignedQty) <= 0) errors.push('จำนวนให้พนักงานไม่ถูกต้อง');
            else if (cleanText(item.qty) && numberValue(assignedQty) > numberValue(item.qty)) errors.push('จำนวนให้พนักงานเกินจำนวนโอน');
        }
        return { valid: errors.length === 0, errors: errors, warnings: warnings };
    }

    function validateDocument(meta) {
        var errors = [], warnings = [];
        if (!cleanText(meta.tfor)) errors.push('ไม่มีเลข TFOR');
        if (!cleanText(meta.fromWarehouse)) errors.push('ไม่มีสาขาต้นทาง');
        if (!cleanText(meta.toWarehouse)) errors.push('ไม่มีสาขาปลายทาง');
        return { valid: errors.length === 0, errors: errors, warnings: warnings };
    }

    function parseTxt(text) {
        var lines = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
        var meta = { tfor: '', fromWarehouse: '', fromName: '', toWarehouse: '', toName: '', fileType: 'TXT' };
        var items = [];

        for (var i = 0; i < lines.length; i++) {
            var cols = lines[i].split('\t');
            var normalized = cols.map(cleanText);
            if (normalized[0] === 'Transfer number' && i + 1 < lines.length) {
                var val = lines[i + 1].split('\t').map(cleanText);
                meta.tfor = val[0] || meta.tfor;
                meta.fromWarehouse = val[1] || meta.fromWarehouse;
                meta.fromName = val[2] || meta.fromName;
                meta.toWarehouse = val[3] || meta.toWarehouse;
                meta.toName = val[4] || meta.toName;
                break;
            }
        }

        var header = null, headerLine = -1;
        for (var h = 0; h < lines.length; h++) {
            var hc = lines[h].split('\t').map(cleanText);
            if (hc.indexOf('Item number') >= 0 && hc.indexOf('Received quantity') >= 0) {
                header = hc;
                headerLine = h;
                break;
            }
        }
        if (!header) return { meta: meta, items: [], errors: ['ไม่พบหัวตารางสินค้าในไฟล์ TXT'] };

        var idx = {
            item: header.indexOf('Item number'),
            secondary: header.indexOf('Item number') + 1,
            name: header.indexOf('Item name'),
            batch: header.indexOf('Batch number'),
            fromLocation: header.indexOf('Location'),
            recommendedLocation: header.indexOf('Location(แนะนำ)'),
            toLocation: header.indexOf('To location'),
            unit: header.indexOf('Unit'),
            qty: header.indexOf('Received quantity')
        };

        var rowNo = 0;
        for (var r = headerLine + 1; r < lines.length; r++) {
            var c = lines[r].split('\t');
            if (c.length <= idx.item) continue;
            var itemValue = cleanText(c[idx.item]);
            if (!itemValue || itemValue === 'Item number') continue;
            if (/^(Prepared by|บริษัท|Transfer orders|TFOR)/i.test(itemValue)) continue;
            var raw = {
                item: itemValue,
                secondary: c[idx.secondary],
                name: c[idx.name],
                batch: c[idx.batch],
                fromLocation: c[idx.fromLocation],
                recommendedLocation: c[idx.recommendedLocation],
                toLocation: c[idx.toLocation] || c[idx.recommendedLocation],
                unit: c[idx.unit],
                qty: c[idx.qty]
            };
            var itemClean = cleanText(raw.item), nameClean = cleanText(raw.name), qtyClean = cleanText(raw.qty);
            if (!nameClean && !qtyClean) continue;
            if (/^(Prepared by|Approved by|Stock Out|Stock In|Goods Received|Date\.|\.{4,}|\d{2}\/\d{2}\/\d{4}$)/i.test(itemClean)) continue;
            if (/^(Date\.|\.{4,}|Page\s+\d+$)/i.test(nameClean) || /^(Date\.|\.{4,})/i.test(qtyClean)) continue;
            items.push(buildItem(raw, rowNo++, meta));
        }
        return { meta: meta, items: items, errors: items.length ? [] : ['ไม่พบรายการสินค้าในไฟล์ TXT'] };
    }

    function decodeEntities(s) {
        var map = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
        return String(s || '').replace(/&(nbsp|amp|lt|gt|quot|#39);/gi, function(m) { return map[m.toLowerCase()] || m; });
    }

    function htmlCellText(s) {
        return cleanText(decodeEntities(String(s || '')
            .replace(/<br\s*\/?\s*>/gi, ' ')
            .replace(/<[^>]*>/g, ' ')));
    }

    function extractHtmlRows(html) {
        var rows = [];
        var trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
        var tr;
        while ((tr = trRe.exec(String(html || '')))) {
            var cells = [], tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi, td;
            while ((td = tdRe.exec(tr[1]))) cells.push(htmlCellText(td[1]));
            if (cells.length) rows.push(cells);
        }
        return rows;
    }

    function parseHtml(text) {
        var rows = extractHtmlRows(text);
        var meta = { tfor: '', fromWarehouse: '', fromName: '', toWarehouse: '', toName: '', fileType: 'HTM' };
        var items = [], pending = null, rowNo = 0;

        for (var i = 0; i < rows.length; i++) {
            var c = rows[i];
            if (!meta.tfor && /^TFOR/i.test(cleanText(c[0]))) {
                meta.tfor = cleanText(c[0]);
                meta.fromWarehouse = cleanText(c[3]);
                meta.fromName = cleanText(c[4]);
                meta.toWarehouse = cleanText(c[6]);
                meta.toName = cleanText(c[8]);
            }
            if (c.length >= 20 && cleanText(c[2]) && cleanText(c[5]) && cleanText(c[19]) && cleanText(c[2]) !== 'Item number') {
                if (pending) items.push(buildItem(pending, rowNo++, meta));
                pending = {
                    item: c[2],
                    secondary: '',
                    name: c[5],
                    batch: c[9],
                    fromLocation: c[11],
                    recommendedLocation: c[15],
                    toLocation: c[16] || c[15],
                    unit: c[17],
                    qty: c[19]
                };
                continue;
            }
            if (pending) {
                var only = c.filter(function(v) { return cleanText(v); });
                if (only.length === 1 && /^\[.*\]$/.test(only[0])) {
                    pending.secondary = only[0];
                    items.push(buildItem(pending, rowNo++, meta));
                    pending = null;
                }
            }
        }
        if (pending) items.push(buildItem(pending, rowNo++, meta));
        return { meta: meta, items: items, errors: items.length ? [] : ['ไม่พบรายการสินค้าในไฟล์ HTM'] };
    }

    function parseFile(name, text) {
        var ext = String(name || '').toLowerCase().split('.').pop();
        if (ext === 'txt') return parseTxt(text);
        if (ext === 'htm' || ext === 'html') return parseHtml(text);
        return { meta: {}, items: [], errors: ['รองรับเฉพาะไฟล์ .TXT, .HTM และ .HTML'] };
    }

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function todayIso() {
        var d = new Date();
        var off = d.getTimezoneOffset();
        var local = new Date(d.getTime() - off * 60000);
        return local.toISOString().slice(0, 10);
    }

    function numberValue(v) {
        var n = parseFloat(String(v == null ? '' : v).replace(/,/g, ''));
        return Number.isFinite(n) ? n : 0;
    }

    function itemGroupKey(item) {
        return [cleanText(item && item.item).toUpperCase(), cleanText(item && item.secondary).toUpperCase()].join('|');
    }

    function groupLabel(index) {
        var n = Math.max(0, Number(index) || 0), out = '';
        do {
            out = String.fromCharCode(65 + (n % 26)) + out;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return out;
    }

    function formatControlCode(seq, total) {
        var width = Math.max(2, String(Math.max(1, Number(total) || 1)).length);
        return String(Math.max(1, Number(seq) || 1)).padStart(width, '0');
    }

    function resequenceItems(items) {
        items = Array.isArray(items) ? items : [];
        var firstSeen = Object.create(null), groups = [];
        items.forEach(function(item, index) {
            if (typeof item.sourceIndex !== 'number') item.sourceIndex = index;
            var key = itemGroupKey(item);
            if (typeof firstSeen[key] === 'undefined') {
                firstSeen[key] = groups.length;
                groups.push(key);
            }
        });
        items.sort(function(a, b) {
            var ga = firstSeen[itemGroupKey(a)], gb = firstSeen[itemGroupKey(b)];
            if (ga !== gb) return ga - gb;
            return (a.sourceIndex || 0) - (b.sourceIndex || 0);
        });
        var previousKey = null, groupIndex = -1;
        items.forEach(function(item, index) {
            var key = itemGroupKey(item);
            if (key !== previousKey) { groupIndex += 1; previousKey = key; }
            item.controlSeq = index + 1;
            item.controlCode = formatControlCode(item.controlSeq, items.length);
            item.groupIndex = groupIndex;
            item.groupLabel = groupLabel(groupIndex);
            item.groupKey = key;
            item.groupStart = index === 0 || itemGroupKey(items[index - 1]) !== key;
            item.groupEnd = index === items.length - 1 || itemGroupKey(items[index + 1]) !== key;
        });
        return items;
    }

    function normalizeMeta(meta, app) {
        meta = meta || {};
        var current = app && app.state && app.state.ui ? cleanText(app.state.ui.currentUser) : '';
        current = current.replace(/^Admin:\s*/i, '');
        return {
            tfor: cleanText(meta.tfor).toUpperCase(),
            fromWarehouse: cleanText(meta.fromWarehouse).toUpperCase(),
            fromName: cleanText(meta.fromName),
            toWarehouse: cleanText(meta.toWarehouse).toUpperCase(),
            toName: cleanText(meta.toName),
            fileType: cleanText(meta.fileType),
            receiver: cleanText(meta.receiver),
            checker: cleanText(meta.checker || current),
            date: cleanText(meta.date || todayIso()),
            note: cleanText(meta.note)
        };
    }

    function install(app) {
        if (!app || app.__topupStickerInstalled) return;
        app.__topupStickerInstalled = true;
        app._topupStickerData = app._topupStickerData || {
            fileName: '', meta: normalizeMeta({}, app),
            items: [], search: '', issueOnly: false, previewId: null, verifiedAt: null
        };
        app._topupStickerData.meta = normalizeMeta(app._topupStickerData.meta, app);
        (app._topupStickerData.items || []).forEach(function(i) {
            if (typeof i.assignedTo === 'undefined') i.assignedTo = '';
            if (typeof i.assignedQty === 'undefined') i.assignedQty = '';
            if (typeof i.selected === 'undefined') i.selected = true;
            i.validation = validateItem(i);
        });
        resequenceItems(app._topupStickerData.items || []);
        app._tscTopupStickerMode = false;

        app._topupStickerOrderedItems = function(selectedOnly) {
            var items = resequenceItems(this._topupStickerData.items || []).slice();
            return selectedOnly ? items.filter(function(i) { return i.selected; }) : items;
        };

        var originalTscRenderOne = app._tscRenderOne.bind(app);
        var originalNiimbotPrintPDF = app.niimbotPrintPDF.bind(app);
        var originalTscDoPrint = app._tscDoPrint.bind(app);

        app._topupStickerEmployees = function() {
            var users = (this.state && this.state.data && this.state.data.users) || [];
            var names = users.map(function(u) {
                if (typeof u === 'string') return cleanText(u);
                return cleanText(u && (u.name || u.username || u.displayName));
            }).filter(Boolean);
            return names.filter(function(name, index) { return names.indexOf(name) === index; });
        };

        app.hubGoTopupStickers = function() {
            this._closeQuickHub && this._closeQuickHub();
            var modal = document.getElementById('modal-topup-sticker');
            if (!modal) return;
            modal.classList.remove('hidden');
            document.body.classList.add('topup-sticker-open');
            document.body.classList.remove('topup-sticker-print-open');
            this._topupStickerData.meta = normalizeMeta(this._topupStickerData.meta, this);
            this.renderTopupStickerDashboard();
        };

        app.closeTopupStickerDashboard = function() {
            var modal = document.getElementById('modal-topup-sticker');
            if (modal) modal.classList.add('hidden');
            document.body.classList.remove('topup-sticker-open');
            document.body.classList.remove('topup-sticker-print-open');
        };

        app.triggerTopupStickerImport = function() {
            var input = document.getElementById('topup-sticker-file');
            if (input) { input.value = ''; input.click(); }
        };

        app.handleTopupStickerFile = function(input) {
            var file = input && input.files && input.files[0];
            if (!file) return;
            var ext = file.name.toLowerCase().split('.').pop();
            if (['txt', 'htm', 'html'].indexOf(ext) < 0) {
                this.showError('รองรับเฉพาะไฟล์ TXT หรือ HTM');
                return;
            }
            var reader = new FileReader();
            var self = this;
            reader.onload = function() {
                try {
                    var result = parseFile(file.name, reader.result);
                    if (result.errors && result.errors.length) {
                        self.showError(result.errors.join(' · '));
                        return;
                    }
                    result.items.forEach(function(i) {
                        i.assignedTo = '';
                        i.assignedQty = '';
                        i.originalQty = i.qty;
                        i.selected = true;
                        i.validation = validateItem(i);
                    });
                    resequenceItems(result.items);
                    self._topupStickerData = {
                        fileName: file.name,
                        meta: normalizeMeta(result.meta, self),
                        items: result.items,
                        search: '', issueOnly: false,
                        previewId: result.items[0] ? result.items[0].id : null,
                        verifiedAt: null
                    };
                    self.renderTopupStickerDashboard();
                    self.showSuccess('Import สำเร็จ ' + result.items.length + ' รายการ');
                } catch (e) {
                    console.error('TOPUP sticker import error:', e);
                    self.showError('อ่านไฟล์ไม่สำเร็จ: ' + (e.message || e));
                }
            };
            reader.onerror = function() { self.showError('อ่านไฟล์ไม่สำเร็จ'); };
            reader.readAsText(file, 'UTF-8');
        };

        app.topupStickerDrop = function(e) {
            e.preventDefault();
            var zone = document.getElementById('topup-sticker-dropzone');
            if (zone) zone.classList.remove('is-dragging');
            var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!file) return;
            this.handleTopupStickerFile({ files: [file] });
        };

        app.topupStickerDrag = function(e, on) {
            e.preventDefault();
            var zone = document.getElementById('topup-sticker-dropzone');
            if (zone) zone.classList.toggle('is-dragging', !!on);
        };

        app.clearTopupStickerData = function() {
            this._topupStickerData = {
                fileName: '', meta: normalizeMeta({}, this),
                items: [], search: '', issueOnly: false, previewId: null, verifiedAt: null
            };
            this.renderTopupStickerDashboard();
        };

        app.topupStickerSetSearch = function(v) {
            this._topupStickerData.search = String(v || '');
            this.renderTopupStickerList();
        };

        app.topupStickerToggleIssues = function() {
            this._topupStickerData.issueOnly = !this._topupStickerData.issueOnly;
            this.renderTopupStickerDashboard();
        };

        app.topupStickerUpdateMeta = function(field, value) {
            var allowed = ['tfor', 'fromWarehouse', 'toWarehouse', 'receiver', 'checker', 'date', 'note'];
            if (allowed.indexOf(field) < 0) return;
            var val = cleanText(value);
            if (['tfor', 'fromWarehouse', 'toWarehouse'].indexOf(field) >= 0) val = val.toUpperCase();
            this._topupStickerData.meta[field] = val;
            this._topupStickerData.items.forEach(function(it) {
                it.tfor = app._topupStickerData.meta.tfor;
                it.sourceWarehouse = app._topupStickerData.meta.fromWarehouse;
                it.destinationWarehouse = app._topupStickerData.meta.toWarehouse;
            });
            this._topupStickerData.verifiedAt = null;
            this.renderTopupStickerMeta();
            this.renderTopupStickerSummary();
            this.renderTopupStickerPreview();
            this.renderTopupControlPreview();
        };

        app.topupStickerUpdateField = function(id, field, value) {
            var allowed = ['item', 'secondary', 'name', 'qty', 'batch', 'toLocation', 'assignedTo', 'assignedQty'];
            if (allowed.indexOf(field) < 0) return;
            var it = this._topupStickerData.items.find(function(x) { return String(x.id) === String(id); });
            if (!it) return;
            var val = cleanText(value);
            if (['item', 'secondary', 'batch', 'toLocation'].indexOf(field) >= 0) val = val.toUpperCase();
            it[field] = val;
            it.validation = validateItem(it);
            if (field === 'item' || field === 'secondary') resequenceItems(this._topupStickerData.items);
            this._topupStickerData.previewId = it.id;
            this._topupStickerData.verifiedAt = null;
            this.renderTopupStickerDashboard();
        };

        app.topupStickerToggleItem = function(id) {
            var it = this._topupStickerData.items.find(function(x) { return String(x.id) === String(id); });
            if (!it) return;
            it.selected = !it.selected;
            this._topupStickerData.previewId = it.id;
            this.renderTopupStickerDashboard();
        };

        app.topupStickerSelectPreview = function(id) {
            this._topupStickerData.previewId = id;
            this.renderTopupStickerList();
            this.renderTopupStickerPreview();
        };

        app.topupStickerToggleAll = function() {
            var visible = this._topupStickerFilteredItems();
            var allOn = visible.length && visible.every(function(i) { return i.selected; });
            visible.forEach(function(i) { i.selected = !allOn; });
            this.renderTopupStickerDashboard();
        };

        app.topupStickerClearSelection = function() {
            this._topupStickerData.items.forEach(function(i) { i.selected = false; });
            this.renderTopupStickerDashboard();
        };

        app.topupStickerBulkAssign = function() {
            var select = document.getElementById('topup-bulk-employee');
            var employee = select ? cleanText(select.value) : '';
            if (!employee) { this.showError('กรุณาเลือกพนักงาน'); return; }
            var selected = this._topupStickerData.items.filter(function(i) { return i.selected; });
            if (!selected.length) { this.showError('ยังไม่ได้เลือกรายการ'); return; }
            selected.forEach(function(i) {
                i.assignedTo = employee;
                if (!cleanText(i.assignedQty)) i.assignedQty = i.qty;
                i.validation = validateItem(i);
            });
            this._topupStickerData.verifiedAt = null;
            this.renderTopupStickerDashboard();
            this.showSuccess('มอบหมาย ' + selected.length + ' รายการให้ ' + employee);
        };

        app.topupStickerClearAssignments = function() {
            this._topupStickerData.items.filter(function(i) { return i.selected; }).forEach(function(i) {
                i.assignedTo = '';
                i.assignedQty = '';
                i.validation = validateItem(i);
            });
            this._topupStickerData.verifiedAt = null;
            this.renderTopupStickerDashboard();
        };

        app._topupStickerFilteredItems = function() {
            var data = this._topupStickerData;
            resequenceItems(data.items || []);
            var q = cleanText(data.search).toUpperCase();
            return data.items.filter(function(i) {
                i.validation = validateItem(i);
                if (data.issueOnly && i.validation.valid && !i.validation.warnings.length) return false;
                if (!q) return true;
                return [i.item, i.secondary, i.name, i.toLocation, i.batch, i.qty, i.assignedTo, i.assignedQty].some(function(v) {
                    return String(v || '').toUpperCase().indexOf(q) >= 0;
                });
            });
        };

        app.renderTopupStickerDashboard = function() {
            var data = this._topupStickerData;
            var filename = document.getElementById('topup-sticker-filename');
            if (filename) filename.textContent = data.fileName || 'ยังไม่ได้เลือกไฟล์';
            var search = document.getElementById('topup-sticker-search');
            if (search && search.value !== data.search) search.value = data.search || '';
            this.renderTopupStickerMeta();
            this.renderTopupStickerSummary();
            this.renderTopupStickerList();
            this.renderTopupStickerPreview();
            this.renderTopupControlPreview();
            this.renderTopupBulkEmployees();
        };

        app.renderTopupBulkEmployees = function() {
            var select = document.getElementById('topup-bulk-employee');
            if (!select) return;
            var current = select.value;
            var opts = '<option value="">เลือกพนักงาน...</option>' + this._topupStickerEmployees().map(function(n) {
                return '<option value="' + esc(n) + '"' + (n === current ? ' selected' : '') + '>' + esc(n) + '</option>';
            }).join('');
            select.innerHTML = opts;
        };

        app.renderTopupStickerMeta = function() {
            var m = this._topupStickerData.meta || {};
            var values = {
                'topup-meta-tfor': m.tfor || '',
                'topup-meta-from': m.fromWarehouse || '',
                'topup-meta-to': m.toWarehouse || '',
                'topup-meta-receiver': m.receiver || '',
                'topup-meta-checker': m.checker || '',
                'topup-meta-date': m.date || todayIso(),
                'topup-meta-note': m.note || ''
            };
            Object.keys(values).forEach(function(id) {
                var el = document.getElementById(id);
                if (el && document.activeElement !== el) el.value = values[id];
            });
            var route = document.getElementById('topup-sticker-route');
            if (route) route.textContent = (m.fromWarehouse || '--') + ' → ' + (m.toWarehouse || '--');
            var type = document.getElementById('topup-sticker-filetype');
            if (type) type.textContent = m.fileType || '-';
            var miniTfor = document.getElementById('topup-control-mini-tfor');
            var miniRoute = document.getElementById('topup-control-mini-route');
            var miniReceiver = document.getElementById('topup-control-mini-receiver');
            if (miniTfor) miniTfor.textContent = m.tfor || 'TFOR -';
            if (miniRoute) miniRoute.textContent = (m.fromWarehouse || '--') + ' → ' + (m.toWarehouse || '--');
            if (miniReceiver) miniReceiver.textContent = m.receiver || 'ยังไม่ระบุผู้รับสินค้า';
        };

        app.renderTopupStickerSummary = function() {
            var data = this._topupStickerData, metaCheck = validateDocument(data.meta || {});
            var valid = 0, selected = 0, selectedQty = 0, assigned = 0;
            data.items.forEach(function(i) {
                i.validation = validateItem(i);
                if (i.validation.valid) valid++;
                if (i.selected) { selected++; selectedQty += numberValue(i.qty); }
                if (cleanText(i.assignedTo)) assigned++;
            });
            var set = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
            set('topup-count-total', data.items.length);
            set('topup-count-valid', valid);
            set('topup-count-issue', data.items.length - valid);
            set('topup-count-selected', selected);
            set('topup-count-assigned', assigned);
            set('topup-footer-selected', selected + ' รายการ');
            set('topup-footer-total-qty', selectedQty.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
            var issueBtn = document.getElementById('topup-sticker-issues-btn');
            if (issueBtn) issueBtn.classList.toggle('is-active', !!data.issueOnly);
            var docStatus = document.getElementById('topup-doc-status');
            if (docStatus) {
                docStatus.className = 'topup-doc-status ' + (metaCheck.valid ? 'is-ok' : 'is-error');
                docStatus.innerHTML = metaCheck.valid
                    ? '<i class="ph ph-check-circle"></i> ข้อมูลเอกสารพร้อมใช้งาน'
                    : '<i class="ph ph-warning-circle"></i> ' + esc(metaCheck.errors.join(' · '));
            }
            var verify = document.getElementById('topup-sticker-verified');
            if (verify) {
                verify.classList.toggle('hidden', !data.verifiedAt);
                if (data.verifiedAt) verify.textContent = 'ตรวจสอบล่าสุด ' + new Date(data.verifiedAt).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
            }
            var printBtn = document.getElementById('btn-topup-sticker-print');
            if (printBtn) printBtn.disabled = !data.items.length || !selected;
            var controlBtn = document.getElementById('btn-topup-control-print');
            if (controlBtn) controlBtn.disabled = !data.items.length;
        };

        app._topupEmployeeOptions = function(current) {
            return '<option value="">เลือกพนักงาน</option>' + this._topupStickerEmployees().map(function(n) {
                return '<option value="' + esc(n) + '"' + (String(n) === String(current || '') ? ' selected' : '') + '>' + esc(n) + '</option>';
            }).join('');
        };

        app.renderTopupStickerList = function() {
            var box = document.getElementById('topup-sticker-list');
            if (!box) return;
            var data = this._topupStickerData;
            resequenceItems(data.items || []);
            if (!data.items.length) {
                box.innerHTML = '<div class="topup-empty"><i class="ph ph-file-arrow-up"></i><b>นำเข้าไฟล์ Transfer Order ก่อน</b><span>รองรับ TXT และ HTM จาก Microsoft Dynamics</span></div>';
                return;
            }
            var visible = this._topupStickerFilteredItems();
            if (!visible.length) {
                box.innerHTML = '<div class="topup-empty"><i class="ph ph-magnifying-glass"></i><b>ไม่พบรายการตามเงื่อนไข</b></div>';
                return;
            }
            var self = this;
            var head = '<div class="topup-table-head">' +
                '<div>รหัสคุม</div><div>ITEM</div><div>เลขรอง</div><div>ชื่อสินค้า</div><div>LOC</div><div>QTY</div><div>BATCH</div><div>พนักงาน × จำนวน</div><div>สถานะ</div><div></div>' +
                '</div>';
            var chunks = [head], lastGroup = null;
            visible.forEach(function(i) {
                var groupKey = itemGroupKey(i);
                if (groupKey !== lastGroup) {
                    chunks.push('<div class="topup-item-group-header"><span>ITEM GROUP ' + esc(i.groupLabel || groupLabel(i.groupIndex)) + '</span><b>' + esc(i.item || '-') + '</b>' + (i.secondary ? '<small>(' + esc(i.secondary) + ')</small>' : '') + '<em>รายการ ITEM เดียวกันถูกจัดให้อยู่ติดกัน</em></div>');
                    lastGroup = groupKey;
                }
                var v = i.validation || validateItem(i);
                var active = String(data.previewId) === String(i.id);
                var status = !v.valid
                    ? '<span class="topup-row-status error"><i class="ph ph-warning-circle"></i>ต้องแก้ไข</span>'
                    : (v.warnings.length ? '<span class="topup-row-status warn"><i class="ph ph-info"></i>ตรวจสอบ</span>'
                        : '<span class="topup-row-status ok"><i class="ph ph-check-circle"></i>พร้อมพิมพ์</span>');
                var id = JSON.stringify(i.id);
                chunks.push('<div class="topup-table-row ' + (active ? 'is-preview ' : '') + (!v.valid ? 'has-error' : '') + '">' +
                    '<div class="topup-cell-select"><button type="button" class="topup-check ' + (i.selected ? 'is-on' : '') + '" onclick="window.app.topupStickerToggleItem(' + id + ')" aria-label="เลือกพิมพ์"><i class="ph ph-check"></i></button><button type="button" class="topup-control-code" onclick="window.app.topupStickerSelectPreview(' + id + ')" title="รหัสคุมต้องตรงกับสติกเกอร์">' + esc(i.controlCode) + '</button></div>' +
                    '<button type="button" class="topup-item-link" onclick="window.app.topupStickerSelectPreview(' + id + ')"><strong>' + esc(i.item || '-') + '</strong></button>' +
                    '<div class="topup-cell-secondary">' + (i.secondary ? '(' + esc(i.secondary) + ')' : '—') + '</div>' +
                    '<div class="topup-cell-name" title="' + esc(i.name || '') + '">' + esc(i.name || '—') + '</div>' +
                    '<div class="topup-cell-input"><label>LOC</label><input value="' + esc(i.toLocation || '') + '" onchange="window.app.topupStickerUpdateField(' + id + ',\'toLocation\',this.value)"></div>' +
                    '<div class="topup-cell-input"><label>QTY</label><input inputmode="decimal" value="' + esc(i.qty || '') + '" onchange="window.app.topupStickerUpdateField(' + id + ',\'qty\',this.value)"></div>' +
                    '<div class="topup-cell-batch" title="' + esc(i.batch || '') + '">' + esc(i.batch || '—') + '</div>' +
                    '<div class="topup-assignment"><select onchange="window.app.topupStickerUpdateField(' + id + ',\'assignedTo\',this.value)">' + self._topupEmployeeOptions(i.assignedTo) + '</select><span>×</span><input inputmode="decimal" placeholder="จำนวน" value="' + esc(i.assignedQty || '') + '" onchange="window.app.topupStickerUpdateField(' + id + ',\'assignedQty\',this.value)"></div>' +
                    '<div class="topup-cell-status">' + status + (i.assignedTo ? '<small><i class="ph ph-user-check"></i>' + esc(i.assignedTo) + '</small>' : '') + '</div>' +
                    '<details class="topup-row-more"><summary aria-label="แก้รายละเอียด"><i class="ph ph-dots-three-vertical"></i></summary><div class="topup-detail-popover">' +
                        self._topupEditInput(i, 'item', 'ITEM', true) + self._topupEditInput(i, 'secondary', 'เลขรอง', false) + self._topupEditInput(i, 'batch', 'BATCH', false) +
                        '<label class="topup-edit-wide"><span>ชื่อสินค้า</span><textarea onchange="window.app.topupStickerUpdateField(' + id + ',\'name\',this.value)">' + esc(i.name || '') + '</textarea></label>' +
                    '</div></details>' +
                    (v.errors.length || v.warnings.length ? '<div class="topup-row-message"><i class="ph ph-info"></i>' + esc(v.errors.concat(v.warnings).join(' · ')) + '</div>' : '') +
                '</div>');
            });
            box.innerHTML = '<div class="topup-table">' + chunks.join('') + '</div>';
        };

        app._topupEditInput = function(i, field, label, required) {
            return '<label><span>' + esc(label) + (required ? ' *' : '') + '</span><input value="' + esc(i[field] || '') + '" onchange="window.app.topupStickerUpdateField(' + JSON.stringify(i.id) + ',' + JSON.stringify(field) + ',this.value)"></label>';
        };

        app.renderTopupStickerPreview = function() {
            var canvas = document.getElementById('topup-sticker-preview-canvas');
            var empty = document.getElementById('topup-sticker-preview-empty');
            if (!canvas) return;
            var data = this._topupStickerData;
            resequenceItems(data.items || []);
            var item = data.items.find(function(i) { return String(i.id) === String(data.previewId); }) || data.items[0];
            if (!item) {
                canvas.classList.add('hidden');
                if (empty) empty.classList.remove('hidden');
                return;
            }
            canvas.classList.remove('hidden');
            if (empty) empty.classList.add('hidden');
            canvas.width = 800; canvas.height = 400;
            item.tfor = data.meta.tfor || '';
            item.sourceWarehouse = data.meta.fromWarehouse || '';
            item.destinationWarehouse = data.meta.toWarehouse || '';
            this._tscDrawTopupImportLabel(canvas.getContext('2d'), {
                code: item.item, comp: item.secondary, desc: item.name, qty: item.qty,
                batch: item.batch, newLoc: item.toLocation, oldLoc: item.fromLocation,
                tfor: item.tfor, sourceWarehouse: item.sourceWarehouse, destinationWarehouse: item.destinationWarehouse,
                controlSeq: item.controlSeq, controlCode: item.controlCode, groupLabel: item.groupLabel
            }, 800, 400, 16);
            var title = document.getElementById('topup-preview-item');
            if (title) title.textContent = item.item || '-';
        };

        app.renderTopupControlPreview = function() {
            var box = document.getElementById('topup-control-preview-rows');
            if (!box) return;
            var items = this._topupStickerOrderedItems(false).slice(0, 6);
            if (!items.length) {
                box.innerHTML = '<div class="topup-control-empty">ยังไม่มีรายการ</div>';
                return;
            }
            box.innerHTML = items.map(function(i) {
                return '<div><b>' + esc(i.controlCode) + '</b><span>' + esc(i.item || '-') + '</span><span>' + esc(i.toLocation || '-') + '</span><strong>' + esc(i.qty || '-') + '</strong></div>';
            }).join('');
        };

        app.verifyTopupStickerData = function() {
            var data = this._topupStickerData;
            if (!data.items.length) { this.showError('กรุณา Import ข้อมูลก่อน'); return; }
            var metaCheck = validateDocument(data.meta || {});
            var invalid = data.items.filter(function(i) { i.validation = validateItem(i); return !i.validation.valid; });
            data.verifiedAt = Date.now();
            this.renderTopupStickerDashboard();
            if (!metaCheck.valid || invalid.length) {
                this.showError('พบข้อมูลที่ต้องแก้: เอกสาร ' + metaCheck.errors.length + ' จุด · รายการ ' + invalid.length + ' รายการ');
                data.issueOnly = true;
                this.renderTopupStickerDashboard();
                return;
            }
            this.showSuccess('ตรวจสอบแล้ว พร้อมพิมพ์ ' + data.items.length + ' รายการ');
        };

        app.printTopupControlSheet = function() {
            var data = this._topupStickerData;
            if (!data.items.length) { this.showError('กรุณา Import ข้อมูลก่อน'); return; }
            var m = normalizeMeta(data.meta, this);
            var items = this._topupStickerOrderedItems(true);
            if (!items.length) items = this._topupStickerOrderedItems(false);
            var lastGroup = null, rowParts = [];
            items.forEach(function(i) {
                var key = itemGroupKey(i);
                if (key !== lastGroup) {
                    rowParts.push('<tr class="group-row"><td colspan="11"><b>ITEM GROUP ' + esc(i.groupLabel || groupLabel(i.groupIndex)) + '</b><span>ITEM: ' + esc(i.item || '-') + (i.secondary ? ' &nbsp; (' + esc(i.secondary) + ')' : '') + '</span><em>' + esc(i.name || '') + '</em></td></tr>');
                    lastGroup = key;
                }
                var assign = cleanText(i.assignedTo), assignedQty = cleanText(i.assignedQty);
                rowParts.push('<tr>' +
                    '<td class="seq"><b>' + esc(i.controlCode) + '</b><small>STICKER ' + esc(i.controlCode) + '</small></td>' +
                    '<td class="item"><b>' + esc(i.item || '-') + '</b></td>' +
                    '<td class="secondary">' + (i.secondary ? esc(i.secondary) : '—') + '</td>' +
                    '<td class="desc">' + esc(i.name || '-') + '</td>' +
                    '<td class="num">' + esc(i.qty || '-') + '</td>' +
                    '<td class="assign"><b>' + esc(assign || '________________') + '</b><small>× ' + esc(assignedQty || '________') + '</small></td>' +
                    '<td class="loc"><b>' + esc(i.toLocation || '-') + '</b></td>' +
                    '<td class="write-line">________________</td>' +
                    '<td class="batch">' + esc(i.batch || '—') + '</td>' +
                    '<td class="write-line">________________</td>' +
                    '<td class="center"><span class="check"></span></td>' +
                '</tr>');
            });
            var rows = rowParts.join('');
            var win = window.open('', '_blank', 'width=1280,height=860');
            if (!win) { this.showError('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up'); return; }
            var title = 'ใบคุม TOPUP ' + (m.tfor || '');
            var nowTime = new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
            win.document.open();
            win.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
                '@page{size:A4 landscape;margin:7mm}*{box-sizing:border-box}body{font-family:Sarabun,Arial,sans-serif;color:#10233f;margin:0;font-size:9px;background:#fff}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px}.title h1{margin:0;font-size:22px;line-height:1.05;color:#0b2f61}.title p{margin:4px 0 0;color:#52647b;font-size:8.5px}.brand{border:1px solid #bfd0e4;border-radius:9px;padding:7px 11px;color:#0b2f61;font-weight:900;white-space:nowrap}.notice{margin:0 0 7px;padding:6px 9px;border:1px solid #bfd0e4;border-radius:8px;background:#f7faff;color:#183f70;font-weight:800}.meta{display:grid;grid-template-columns:1.45fr .55fr .55fr .72fr .75fr .65fr;border:1px solid #9db2ca;border-radius:9px;overflow:hidden}.meta>div{min-height:48px;padding:6px 9px;border-right:1px solid #cfdae7}.meta>div:last-child{border-right:0}.k{display:block;color:#60738a;font-size:7.5px;font-weight:800}.v{display:block;margin-top:3px;color:#071f42;font-size:18px;line-height:1;font-weight:900}.meta .route .v{font-size:20px}.people{display:grid;grid-template-columns:1fr 1fr 1.55fr;gap:6px;margin:6px 0}.people>div{min-height:35px;border:1px solid #cfdae7;border-radius:8px;padding:6px 8px}.people b{margin-left:7px;font-size:9px}.signline{display:inline-block;width:72%;border-bottom:1px dotted #29415e;height:12px;vertical-align:bottom}table{width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #8098b4}thead{display:table-header-group}th{background:#0b356b;color:#fff;padding:5px 3px;border:1px solid #d7e0ea;font-size:7.5px;line-height:1.25}td{border:1px solid #b8c7d7;padding:4px 4px;vertical-align:middle;word-break:break-word;height:38px}tr{break-inside:avoid}.group-row td{height:auto;padding:4px 7px;background:#edf4fb;color:#0b356b;border-top:2px solid #7393b6}.group-row b{display:inline-block;margin-right:10px}.group-row span{font-weight:800;margin-right:10px}.group-row em{font-style:normal;color:#52647b;font-size:7.5px}.seq{text-align:center;background:#f6f9fd}.seq b{display:block;font-size:17px;color:#0b356b}.seq small{display:block;font-size:6px;color:#71849a}.item b{font-size:8.5px}.secondary{text-align:center;font-weight:700}.desc{font-size:7.5px;line-height:1.3}.num{text-align:center;font-size:12px;font-weight:900}.assign b{display:block;font-size:8px}.assign small{display:block;margin-top:3px;color:#60738a}.loc{text-align:center;font-size:10px}.batch{font-size:7px}.write-line{text-align:center;color:#60738a}.center{text-align:center}.check{display:inline-block;width:14px;height:14px;border:1.4px solid #29415e;border-radius:3px}.footer{display:grid;grid-template-columns:1fr 310px;gap:7px;margin-top:7px}.footer>div{border:1px solid #cfdae7;border-radius:8px;padding:7px 9px;min-height:48px}.footer b{color:#0b356b}.muted{color:#60738a}.no-print{position:fixed;right:12px;top:12px;background:#5b21b6;color:#fff;border:0;border-radius:9px;padding:9px 14px;font:inherit;font-weight:900;box-shadow:0 7px 18px rgba(30,41,59,.18);cursor:pointer}@media print{.no-print{display:none}}' +
                '</style></head><body><button class="no-print" onclick="window.print()">พิมพ์ใบคุม</button>' +
                '<div class="top"><div class="title"><h1>ใบคุม TOPUP / TOPUP Control Sheet</h1><p>เอกสารตรวจรับและจับคู่สติกเกอร์ TOPUP</p></div><div class="brand">PLAS WMS · Warehouse Management System</div></div>' +
                '<div class="notice">รหัสคุมในคอลัมน์แรกต้องตรงกับรหัสบนสติกเกอร์ทุกดวง · ใบคุมนี้แสดง ' + items.length + ' รายการตามลำดับพิมพ์จริง</div>' +
                '<section class="meta"><div><span class="k">TFOR / Transfer Order</span><span class="v">' + esc(m.tfor || '-') + '</span></div><div><span class="k">From Warehouse</span><span class="v">' + esc(m.fromWarehouse || '-') + '</span></div><div><span class="k">To Warehouse</span><span class="v">' + esc(m.toWarehouse || '-') + '</span></div><div class="route"><span class="k">Route</span><span class="v">' + esc((m.fromWarehouse || '--') + ' → ' + (m.toWarehouse || '--')) + '</span></div><div><span class="k">Date / วันที่</span><span class="v" style="font-size:13px">' + esc(m.date || '-') + '</span></div><div><span class="k">Time / เวลา</span><span class="v" style="font-size:13px">' + esc(nowTime) + '</span></div></section>' +
                '<section class="people"><div><span class="k">Receiver / ผู้รับสินค้า</span><b>' + esc(m.receiver || '____________________________') + '</b></div><div><span class="k">Checker / ผู้ตรวจ</span><b>' + esc(m.checker || '____________________________') + '</b></div><div><span class="k">Signature / Confirmation</span><span class="signline"></span></div></section>' +
                '<table><colgroup><col style="width:5%"><col style="width:11%"><col style="width:8%"><col style="width:18%"><col style="width:6%"><col style="width:13%"><col style="width:8%"><col style="width:8%"><col style="width:10%"><col style="width:9%"><col style="width:4%"></colgroup><thead><tr><th>รหัสคุม<br>Seq</th><th>ITEM</th><th>เลขรอง</th><th>ชื่อสินค้า<br>Description</th><th>จำนวนโอน<br>QTY</th><th>พนักงาน × จำนวน<br>Staff × QTY</th><th>LOC ปลายทาง</th><th>LOC แก้ไข<br>(ถ้ามี)</th><th>BATCH</th><th>หมายเหตุ</th><th>รับแล้ว</th></tr></thead><tbody>' + rows + '</tbody></table>' +
                '<section class="footer"><div><b>หมายเหตุเอกสาร:</b> ' + esc(m.note || '—') + '<br><span class="muted">ITEM เดียวกันถูกจัดให้อยู่ติดกัน และลำดับรหัสคุมตรงกับลำดับสติกเกอร์จากซ้ายไปขวา บนลงล่าง</span></div><div><b>ลงชื่อรับสินค้า / ยืนยัน</b><br><br>ลายเซ็น ____________________ เวลา ______ : ______</div></section>' +
                '</body></html>');
            win.document.close();
            setTimeout(function() { try { win.focus(); win.print(); } catch (e) {} }, 350);
        };

        app.printTopupStickerData = function() {
            var data = this._topupStickerData;
            if (!data.items.length) { this.showError('กรุณา Import ข้อมูลก่อน'); return; }
            var metaCheck = validateDocument(data.meta || {});
            if (!metaCheck.valid) { this.showError(metaCheck.errors.join(' · ')); return; }
            var selected = this._topupStickerOrderedItems(true);
            if (!selected.length) { this.showError('ยังไม่ได้เลือกรายการพิมพ์'); return; }
            var invalid = selected.filter(function(i) { i.validation = validateItem(i); return !i.validation.valid; });
            if (invalid.length) {
                data.issueOnly = true;
                this.renderTopupStickerDashboard();
                this.showError('รายการที่เลือกยังมีข้อมูลไม่ครบ ' + invalid.length + ' รายการ');
                return;
            }
            var meta = data.meta;
            this._niimbotBatch = selected.map(function(i) {
                return {
                    id: i.id,
                    code: i.item,
                    comp: i.secondary,
                    desc: i.name,
                    qty: i.qty,
                    unit: i.unit,
                    batch: i.batch,
                    oldLoc: i.fromLocation,
                    newLoc: i.toLocation,
                    tfor: meta.tfor,
                    sourceWarehouse: meta.fromWarehouse,
                    destinationWarehouse: meta.toWarehouse,
                    assignedTo: i.assignedTo,
                    assignedQty: i.assignedQty,
                    controlSeq: i.controlSeq,
                    controlCode: i.controlCode,
                    groupLabel: i.groupLabel,
                    _topupStickerImport: true
                };
            });
            this._tscTopupStickerMode = true;
            this._tscFreebieMode = false;
            this.closeTopupStickerDashboard();
            this.niimbotPrintPDF();
        };

        app.niimbotPrintPDF = function() {
            if (!this._tscTopupStickerMode) return originalNiimbotPrintPDF();
            this._openTopupTscOptions();
        };

        app._openTopupTscOptions = function() {
            var oldModal = document.getElementById('modal-tsc');
            if (oldModal) oldModal.remove();
            var batchN = (this._niimbotBatch || []).length;
            var saved = {};
            try { saved = JSON.parse(localStorage.getItem('plas_topup_tsc_opts') || '{}'); } catch (e) {}
            var layout = saved.layout === 'single' ? 'single' : 'pair_diff';
            var rot = !!saved.rot;
            var html = '<div id="modal-tsc" class="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm px-4">' +
                '<div class="topup-print-dialog">' +
                '<div class="topup-print-dialog-head"><div><span>พร้อมพิมพ์</span><h3><i class="ph ph-printer"></i> สติกเกอร์ TOPUP</h3><p>' + batchN + ' ดวง · ITEM / LOC / QTY ชัดเจน · ไม่มี QR</p></div><button onclick="window.app._closeTopupTscModal()"><i class="ph ph-x"></i></button></div>' +
                '<div class="topup-print-dialog-body"><div class="topup-paper-spec"><div><b>50×25</b><span>มม./ดวง</span></div><div><b>2 mm</b><span>ช่องกลาง</span></div><div><b>102×25</b><span>พิมพ์คู่</span></div></div>' +
                '<div class="topup-layout-choice"><label class="' + (layout === 'pair_diff' ? 'is-selected' : '') + '"><input type="radio" name="tsc-layout" value="pair_diff" ' + (layout === 'pair_diff' ? 'checked' : '') + '><i class="ph ph-columns"></i><div><b>พิมพ์คู่ ซ้าย–ขวา</b><span>2 รายการต่อแถว · กระดาษ 102×25 mm</span></div></label>' +
                '<label class="' + (layout === 'single' ? 'is-selected' : '') + '"><input type="radio" name="tsc-layout" value="single" ' + (layout === 'single' ? 'checked' : '') + '><i class="ph ph-square"></i><div><b>ดวงเดียวต่อแถว</b><span>กระดาษ 50×25 mm</span></div></label></div>' +
                '<input type="hidden" id="tsc-w" value="50"><input type="hidden" id="tsc-h" value="25"><input type="hidden" id="tsc-gap" value="2">' +
                '<label class="topup-rotate-option"><input type="checkbox" id="tsc-rot" ' + (rot ? 'checked' : '') + '><i class="ph ph-arrow-clockwise"></i><span><b>หมุนเนื้อหา 90°</b><small>ใช้เมื่อเครื่องพิมพ์ออกมาตะแคง</small></span></label>' +
                '<div class="topup-print-tip"><i class="ph ph-info"></i><span>ตั้ง Scale = 100% และปิด Header/Footer ในหน้าต่างพิมพ์ของเบราว์เซอร์</span></div></div>' +
                '<div class="topup-print-dialog-foot"><button onclick="window.app._closeTopupTscModal()" class="secondary">ยกเลิก</button><button onclick="window.app._topupTscDoPrint()" class="primary"><i class="ph ph-printer"></i> พิมพ์สติกเกอร์</button></div>' +
                '</div></div>';
            document.body.classList.add('topup-sticker-print-open');
            document.body.insertAdjacentHTML('beforeend', html);
            Array.from(document.querySelectorAll('input[name="tsc-layout"]')).forEach(function(radio) {
                radio.addEventListener('change', function() {
                    document.querySelectorAll('.topup-layout-choice label').forEach(function(l) { l.classList.remove('is-selected'); });
                    radio.closest('label').classList.add('is-selected');
                });
            });
        };

        app._closeTopupTscModal = function() {
            var m = document.getElementById('modal-tsc');
            if (m) m.remove();
            document.body.classList.remove('topup-sticker-print-open');
            this._tscTopupStickerMode = false;
        };

        app._topupTscDoPrint = function() {
            var layout = (document.querySelector('input[name="tsc-layout"]:checked') || {}).value || 'pair_diff';
            var rot = document.getElementById('tsc-rot') ? document.getElementById('tsc-rot').checked : false;
            localStorage.setItem('plas_topup_tsc_opts', JSON.stringify({ layout: layout, rot: rot }));
            document.body.classList.remove('topup-sticker-print-open');
            var previousGeneralOpts = localStorage.getItem('plas_tsc_opts');
            originalTscDoPrint();
            if (previousGeneralOpts == null) localStorage.removeItem('plas_tsc_opts');
            else localStorage.setItem('plas_tsc_opts', previousGeneralOpts);
            this._tscTopupStickerMode = false;
        };

        app._tscRenderOne = function(item, wMM, hMM, rot) {
            if (!this._tscTopupStickerMode && !(item && item._topupStickerImport)) return originalTscRenderOne(item, wMM, hMM, rot);
            var PXMM = 12, W = Math.round(wMM * PXMM), H = Math.round(hMM * PXMM);
            var inner = document.createElement('canvas');
            if (rot) { inner.width = H; inner.height = W; } else { inner.width = W; inner.height = H; }
            this._tscDrawTopupImportLabel(inner.getContext('2d'), item, inner.width, inner.height, PXMM);
            if (!rot) return inner;
            var c = document.createElement('canvas'); c.width = W; c.height = H;
            var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
            ctx.save(); ctx.translate(W, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(inner, 0, 0); ctx.restore();
            return c;
        };

        app._tscDrawTopupImportLabel = function(ctx, item, W, H) {
            item = item || {};
            var S = Math.min(W / 600, H / 300);
            var sc = function(n) { return Math.max(1, Math.round(n * S)); };
            var pad = sc(7), border = Math.max(1, sc(2));
            var family = 'Sarabun, Arial, sans-serif';
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
            ctx.imageSmoothingEnabled = true;
            ctx.textBaseline = 'top'; ctx.textAlign = 'left';
            ctx.strokeStyle = '#0f172a'; ctx.lineWidth = border;
            ctx.strokeRect(border / 2, border / 2, W - border, H - border);

            var fit = function(text, start, min, maxW, weight) {
                text = cleanText(text);
                var f = sc(start), minF = sc(min);
                ctx.font = (weight || '700') + ' ' + f + 'px ' + family;
                while (f > minF && ctx.measureText(text).width > maxW) {
                    f -= 1;
                    ctx.font = (weight || '700') + ' ' + f + 'px ' + family;
                }
                return f;
            };
            var oneLine = function(text, fontPx, maxW, weight) {
                text = cleanText(text);
                ctx.font = (weight || '500') + ' ' + fontPx + 'px ' + family;
                if (ctx.measureText(text).width <= maxW) return text;
                while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
                return text + '…';
            };
            var roundRect = function(x, y, w, h, r) {
                r = Math.min(r, w / 2, h / 2);
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.arcTo(x + w, y, x + w, y + h, r);
                ctx.arcTo(x + w, y + h, x, y + h, r);
                ctx.arcTo(x, y + h, x, y, r);
                ctx.arcTo(x, y, x + w, y, r);
                ctx.closePath();
            };

            var control = cleanText(item.controlCode) || formatControlCode(item.controlSeq || 1, item.controlSeq || 1);
            var safeLeft = sc(14); // ขยับทั้งบล็อกไปทางขวาเล็กน้อย เผื่อหัวพิมพ์บางรุ่นกินซ้าย
            var badgeX = pad + safeLeft, badgeY = pad, badgeW = sc(100), badgeH = H - pad * 2;
            roundRect(badgeX, badgeY, badgeW, badgeH, sc(7));
            ctx.fillStyle = '#0f172a'; ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
            ctx.font = '800 ' + sc(14) + 'px ' + family; ctx.fillText('รหัสคุม', badgeX + badgeW / 2, badgeY + sc(14));
            var controlF = fit(control, 70, 42, badgeW - sc(12), '900');
            ctx.font = '900 ' + controlF + 'px ' + family;
            ctx.fillText(control, badgeX + badgeW / 2, badgeY + sc(54));
            ctx.font = '700 ' + sc(10) + 'px ' + family; ctx.fillText('MATCH', badgeX + badgeW / 2, badgeY + badgeH - sc(25));
            ctx.textAlign = 'left';

            var x = badgeX + badgeW + sc(10), right = W - pad - sc(4), contentW = right - x;
            var tfor = cleanText(item.tfor) || 'TFOR -';
            var route = (cleanText(item.sourceWarehouse) || '--') + ' → ' + (cleanText(item.destinationWarehouse) || '--');
            var metaY = sc(7), metaH = sc(24);
            var tforF = fit(tfor, 14, 10, contentW * 0.61, '800');
            var routeF = fit(route, 15, 10, contentW * 0.31, '800');
            ctx.fillStyle = '#0f172a'; ctx.font = '800 ' + tforF + 'px ' + family; ctx.fillText(tfor, x, metaY);
            ctx.textAlign = 'right'; ctx.font = '800 ' + routeF + 'px ' + family; ctx.fillText(route, right, metaY); ctx.textAlign = 'left';
            ctx.strokeStyle = '#64748b'; ctx.lineWidth = sc(1);
            ctx.beginPath(); ctx.moveTo(x, metaH + sc(1)); ctx.lineTo(right, metaH + sc(1)); ctx.stroke();

            var code = cleanText(item.code), comp = cleanText(item.comp), desc = cleanText(item.desc);
            ctx.fillStyle = '#0f172a'; ctx.font = '800 ' + sc(12) + 'px ' + family; ctx.fillText('ITEM', x, sc(31));
            var codeF = fit(code || '-', 39, 24, contentW, '900');
            ctx.font = '900 ' + codeF + 'px ' + family; ctx.fillText(code || '-', x, sc(44));
            var y = sc(44) + codeF + sc(1);
            if (comp && comp !== code) {
                var compText = '(' + comp + ')', compF = fit(compText, 18, 13, contentW, '800');
                ctx.font = '800 ' + compF + 'px ' + family; ctx.fillText(compText, x, y);
                y += compF + sc(2);
            }
            var descF = sc(12);
            ctx.font = '500 ' + descF + 'px ' + family; ctx.fillStyle = '#334155';
            ctx.fillText(oneLine(desc, descF, contentW, '500'), x, Math.min(y, sc(111)));

            var footerH = sc(25), footerY = H - pad - footerH;
            var boxTop = sc(130), boxBottom = footerY - sc(4), boxH = boxBottom - boxTop;
            var gap = sc(6), locW = Math.round((contentW - gap) * 0.57), qtyW = contentW - gap - locW;
            var locX = x, qtyX = x + locW + gap;
            ctx.strokeStyle = '#0f172a'; ctx.lineWidth = sc(2);
            roundRect(locX, boxTop, locW, boxH, sc(6)); ctx.stroke();
            roundRect(qtyX, boxTop, qtyW, boxH, sc(6)); ctx.stroke();

            ctx.fillStyle = '#0f172a'; ctx.font = '900 ' + sc(15) + 'px ' + family; ctx.fillText('LOC', locX + sc(8), boxTop + sc(7));
            var loc = cleanText(item.newLoc || item.oldLoc), locF = fit(loc || '-', 38, 23, locW - sc(16), '900');
            ctx.font = '900 ' + locF + 'px ' + family; ctx.fillText(loc || '-', locX + sc(8), boxTop + sc(29));

            ctx.font = '900 ' + sc(15) + 'px ' + family; ctx.fillText('QTY', qtyX + sc(8), boxTop + sc(7));
            var qty = cleanText(item.qty), qtyF = fit(qty || '-', 49, 27, qtyW - sc(14), '900');
            ctx.font = '900 ' + qtyF + 'px ' + family;
            var qtyTextW = ctx.measureText(qty || '-').width;
            ctx.fillText(qty || '-', qtyX + Math.max(sc(7), Math.round((qtyW - qtyTextW) / 2)), boxTop + sc(31));

            var batchText = 'BATCH ' + (cleanText(item.batch) || '—');
            var batchF = fit(batchText, 14, 10, contentW, '800');
            ctx.fillStyle = '#0f172a'; ctx.font = '800 ' + batchF + 'px ' + family;
            ctx.fillText(batchText, x, footerY + sc(4));
        };
    }

    return {
        parseTxt: parseTxt,
        parseHtml: parseHtml,
        parseFile: parseFile,
        validateItem: validateItem,
        validateDocument: validateDocument,
        install: install
    };
});

if (typeof window !== 'undefined' && window.app && window.PlasTopupSticker) {
    window.PlasTopupSticker.install(window.app);
}
