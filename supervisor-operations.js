(function () {
    'use strict';

    var app = window.app;
    if (!app) return;

    var CONFIG_KEY = 'plas_supervisor_ops_config_v1';
    var HANDOVER_KEY = 'plas_supervisor_handover_reports_v1';
    var SLA_DEFAULTS = { receiving: 30, topup: 45, move: 30, print: 15, notewall: 240 };
    var MODULES = {
        receiving: { label: 'Receiving', icon: 'ph-package', tone: 'blue' },
        topup: { label: 'Top Up', icon: 'ph-stack-plus', tone: 'teal' },
        move: { label: 'Move', icon: 'ph-arrows-left-right', tone: 'amber' },
        print: { label: 'Print', icon: 'ph-printer', tone: 'slate' },
        notewall: { label: 'Note Wall', icon: 'ph-note', tone: 'indigo' }
    };
    var OPS = {
        view: 'pulse',
        period: 'today',
        module: 'all',
        status: 'all',
        assignee: 'all',
        search: '',
        sla: readLocal(CONFIG_KEY, SLA_DEFAULTS),
        handovers: readLocal(HANDOVER_KEY, []),
        loadedRemote: false,
        lastRenderedAt: 0
    };

    function readLocal(key, fallback) {
        try {
            var parsed = JSON.parse(localStorage.getItem(key) || 'null');
            return parsed && typeof parsed === 'object' ? parsed : JSON.parse(JSON.stringify(fallback));
        } catch (e) {
            return JSON.parse(JSON.stringify(fallback));
        }
    }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function attr(value) { return esc(value).replace(/`/g, '&#96;'); }
    function arr(value) { return Array.isArray(value) ? value : []; }
    function num(value) { var n = Number(value); return isFinite(n) ? n : 0; }
    function lower(value) { return String(value == null ? '' : value).trim().toLowerCase(); }
    function now() { return Date.now(); }

    function toDate(value) {
        if (!value) return null;
        if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
        if (typeof value.toDate === 'function') {
            try { return value.toDate(); } catch (e) { return null; }
        }
        if (value.seconds) return new Date(Number(value.seconds) * 1000);
        if (typeof value === 'number') return new Date(value < 100000000000 ? value * 1000 : value);
        var text = String(value).trim();
        var thai = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (thai) {
            var year = Number(thai[3]);
            if (year > 2400) year -= 543;
            return new Date(year, Number(thai[2]) - 1, Number(thai[1]));
        }
        var parsed = new Date(text);
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    function firstDate(raw, fields) {
        for (var i = 0; i < fields.length; i++) {
            var date = toDate(raw && raw[fields[i]]);
            if (date) return date;
        }
        return null;
    }

    function minsBetween(start, end) {
        if (!start || !end) return 0;
        return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
    }

    function fmtNumber(value) { return num(value).toLocaleString('th-TH'); }
    function fmtDate(value, withTime) {
        var date = value instanceof Date ? value : toDate(value);
        if (!date) return '-';
        var options = { day: 'numeric', month: 'short', year: 'numeric' };
        if (withTime) { options.hour = '2-digit'; options.minute = '2-digit'; }
        return date.toLocaleString('th-TH', options);
    }

    function fmtAge(minutes) {
        minutes = Math.max(0, Math.round(num(minutes)));
        if (minutes < 60) return minutes + ' นาที';
        if (minutes < 1440) return Math.floor(minutes / 60) + ' ชม. ' + (minutes % 60) + ' นาที';
        return Math.floor(minutes / 1440) + ' วัน ' + Math.floor((minutes % 1440) / 60) + ' ชม.';
    }

    function currentUser() {
        var raw = app.state && ((app.state.ui && app.state.ui.currentUser) || app.state.currentUser);
        return String((raw && (raw.name || raw.username)) || raw || 'Supervisor').replace(/^Supervisor:\s*/i, '').trim();
    }

    function person(raw, fields) {
        for (var i = 0; i < fields.length; i++) {
            var value = raw && raw[fields[i]];
            if (value && typeof value === 'object') value = value.name || value.username;
            if (value) return String(value).replace(/^(Admin|User|Supervisor):\s*/i, '').trim();
        }
        return 'ยังไม่มอบหมาย';
    }

    function statusInfo(rawStatus, hasIssue, moduleKey, raw) {
        var status = lower(rawStatus);
        var issueOpen = hasIssue || ['issue', 'rejected', 'error', 'problem'].indexOf(status) >= 0;
        if (issueOpen) return { key: 'issue', label: status === 'rejected' ? 'ถูกตีกลับ' : 'ติดปัญหา' };
        if (['done', 'completed', 'complete', 'closed', 'finished', 'received'].indexOf(status) >= 0) return { key: 'done', label: 'เสร็จแล้ว' };
        if (moduleKey === 'receiving' && status === 'written') return { key: 'ready', label: 'พร้อมรับเข้า' };
        if (moduleKey === 'print') {
            if (status === 'printed') return { key: 'done', label: 'พิมพ์สติกเกอร์แล้ว' };
            if (status === 'applied') return { key: 'done', label: 'ติดป้ายแล้ว' };
            if (status === 'manual') return { key: 'done', label: 'เขียนมือ' };
            if (status === 'printed_pending' || (raw && raw.labelAwaitingConfirm)) return { key: 'waiting', label: 'พิมพ์แล้ว · รอติด' };
            if (status === 'legacy_unknown') return { key: 'waiting', label: 'รอตรวจข้อมูลเก่า' };
        }
        if (['waiting admin', 'waiting', 'hold', 'on hold', 'pending confirm'].indexOf(status) >= 0) return { key: 'waiting', label: 'รอดำเนินการ' };
        if (['in progress', 'active', 'working', 'admin assigned', 'claimed', 'assigned'].indexOf(status) >= 0) return { key: 'active', label: 'กำลังทำ' };
        return { key: 'queued', label: 'รอเริ่ม' };
    }

    function taskBase(moduleKey, raw, id, title, description, status, createdAt, completedAt, assignee, issueReason) {
        var sla = Math.max(1, num(OPS.sla[moduleKey] || SLA_DEFAULTS[moduleKey]));
        var end = status.key === 'done' ? (completedAt || firstDate(raw, ['lastModified', 'updatedAt']) || new Date()) : new Date();
        var age = minsBetween(createdAt || end, end);
        var uid = moduleKey + ':' + String(id == null ? Math.random() : id);
        return {
            uid: uid,
            id: id,
            module: moduleKey,
            moduleLabel: MODULES[moduleKey].label,
            title: title || '-',
            description: description || '',
            statusKey: status.key,
            statusLabel: status.label,
            assignee: assignee || 'ยังไม่มอบหมาย',
            createdAt: createdAt,
            completedAt: completedAt,
            updatedAt: firstDate(raw, ['lastModified', 'updatedAt', 'timestamp']) || completedAt || createdAt,
            ageMinutes: age,
            slaMinutes: sla,
            isDone: status.key === 'done',
            isIssue: status.key === 'issue',
            isWaiting: status.key === 'waiting',
            isOverdue: status.key !== 'done' && age > sla,
            issueReason: issueReason || '',
            hadCorrection: !!(raw && (num(raw.reworkCount) > 0 || num(raw.correctionCount) > 0 || num(raw.locationEditCount) > 0 || raw.wasRejected || raw.reopened || arr(raw.issueHistory).length || arr(raw.corrections).length)),
            qty: num(raw && raw.qty),
            fromLoc: raw && (raw.fromLoc || raw.oldLoc || ''),
            toLoc: raw && (raw.toLoc || raw.newLoc || ''),
            createdBy: person(raw, ['createdBy', 'importedBy', 'assignedBy', 'recordedBy', 'issueReportedBy']),
            raw: raw
        };
    }

    function normalizeTasks() {
        var data = (app.state && app.state.data) || {};
        var merged = null;
        try { merged = typeof app.getMergedSupervisorData === 'function' ? app.getMergedSupervisorData() : null; } catch (e) { merged = null; }
        var items = arr(merged && merged.items).length || (merged && merged.items) ? arr(merged.items) : arr(data.items);
        var topups = arr(merged && merged.topUp).length || (merged && merged.topUp) ? arr(merged.topUp) : arr(data.replenishmentJobs);
        var moves = arr(merged && merged.moves).length || (merged && merged.moves) ? arr(merged.moves) : arr(data.moveJobs);
        var tasks = [];

        items.forEach(function (item, index) {
            if (lower(item.status) === 'deleted' || item.deleted) return;
            var hasIssue = lower(item.status) === 'issue' || lower(item.status) === 'rejected';
            var status = statusInfo(item.status, hasIssue, 'receiving', item);
            var created = firstDate(item, ['createdAt', 'requestTime', 'date', 'timestamp', 'lastModified']);
            var completed = status.key === 'done' ? firstDate(item, ['doneAt', 'completedAt', 'receivedAt', 'lastModified']) : null;
            tasks.push(taskBase(
                'receiving', item, item.id != null ? item.id : index,
                item.code || item.comp || ('Receiving #' + (index + 1)),
                [item.comp, item.desc].filter(Boolean).join(' · '), status, created, completed,
                person(item, ['doneBy', 'assignedTo', 'locWrittenBy', 'writtenBy']),
                item.issueNote || item.rejectReason || ''
            ));

            if (item.labelPrintCount || item.labelLastPrintedAt || item.labelAwaitingConfirm || (item.labelPrintStatus && item.labelPrintStatus !== 'unprinted')) {
                var printStatus = statusInfo(item.labelPrintStatus || (item.labelAwaitingConfirm ? 'waiting' : 'done'), false, 'print', item);
                tasks.push(taskBase(
                    'print', item, item.id != null ? item.id : index,
                    item.code || ('Print #' + (index + 1)),
                    (item.labelPairCode ? item.labelPairCode + ' · ' : '') + 'พิมพ์ป้าย ' + fmtNumber(item.labelPrintCount || 0) + ' ครั้ง', printStatus,
                    firstDate(item, ['labelLastPrintedAt', 'labelPrintedAt', 'createdAt']),
                    printStatus.key === 'done' ? firstDate(item, ['labelAppliedAt', 'labelManualAt', 'labelLastPrintedAt']) : null,
                    person(item, ['labelAppliedBy', 'labelManualBy', 'labelPrintedBy', 'locWrittenBy', 'writtenBy']), item.labelReprintReason || ''
                ));
            }
        });

        topups.forEach(function (job, index) {
            if (lower(job.status) === 'deleted' || job.deleted) return;
            var openIssue = !!(job.topupIssue && lower(job.topupIssue.status || 'open') !== 'resolved');
            var status = statusInfo(job.status, openIssue, 'topup', job);
            var issue = job.topupIssue || {};
            tasks.push(taskBase(
                'topup', job, job.id != null ? job.id : index,
                job.item || job.code || ('Top Up #' + (index + 1)),
                [job.fromLoc, job.toLoc].filter(Boolean).join(' → '), status,
                firstDate(job, ['createdAt', 'startTime', 'timestamp', 'lastModified']),
                status.key === 'done' ? firstDate(job, ['finishTime', 'completedTime', 'completedAt', 'lastModified']) : null,
                person(job, ['assignedTo', 'completedBy', 'assignedBy']),
                issue.reasonLabel || issue.reason || issue.note || job.issueNote || ''
            ));
        });

        moves.forEach(function (job, index) {
            if (lower(job.status) === 'deleted' || job.deleted) return;
            var status = statusInfo(job.status, !!job.issueNote, 'move', job);
            tasks.push(taskBase(
                'move', job, job.id != null ? job.id : index,
                job.item || job.code || ('Move #' + (index + 1)),
                [job.fromLoc, job.toLoc].filter(Boolean).join(' → '), status,
                firstDate(job, ['createdAt', 'timestamp', 'startTime', 'lastModified']),
                status.key === 'done' ? firstDate(job, ['completedAt', 'finishTime', 'lastModified']) : null,
                person(job, ['assignedTo', 'completedBy', 'confirmedBy', 'recordedBy']), job.issueNote || ''
            ));
        });

        arr(app.state && app.state.noteWall && app.state.noteWall.notes).forEach(function (note, index) {
            if (note.deleted) return;
            var status = statusInfo(note.status || 'open', false, 'notewall', note);
            tasks.push(taskBase(
                'notewall', note, note.id != null ? note.id : index,
                note.title || note.text || ('Note #' + (index + 1)),
                note.type ? 'ประเภท ' + note.type : 'Note Wall', status,
                firstDate(note, ['createdAt', 'timestamp', 'updatedAt']),
                status.key === 'done' ? firstDate(note, ['closedAt', 'completedAt', 'updatedAt']) : null,
                person(note, ['claimedBy', 'targetUser', 'assignedTo', 'createdBy']), note.issueNote || ''
            ));
        });

        var deduped = {};
        tasks.forEach(function (task) {
            var existing = deduped[task.uid];
            if (!existing || (task.updatedAt && (!existing.updatedAt || task.updatedAt > existing.updatedAt))) deduped[task.uid] = task;
        });
        return Object.keys(deduped).map(function (key) { return deduped[key]; });
    }

    function periodStart(period) {
        var date = new Date();
        date.setHours(0, 0, 0, 0);
        if (period === '7d') date.setDate(date.getDate() - 6);
        else if (period === '30d') date.setDate(date.getDate() - 29);
        else if (period === 'all') return null;
        return date;
    }

    function tasksInPeriod(tasks) {
        var start = periodStart(OPS.period);
        if (!start) return tasks;
        return tasks.filter(function (task) {
            if (!task.isDone) return true;
            var date = task.completedAt || task.updatedAt || task.createdAt;
            return date && date >= start;
        });
    }

    function assigneeOptions(tasks) {
        var names = {};
        tasks.forEach(function (task) { if (task.assignee && task.assignee !== 'ยังไม่มอบหมาย') names[task.assignee] = true; });
        arr(app.state && app.state.data && app.state.data.users).forEach(function (user) {
            var name = typeof user === 'string' ? user : (user && (user.name || user.username));
            if (name) names[name] = true;
        });
        return Object.keys(names).sort(function (a, b) { return a.localeCompare(b, 'th'); });
    }

    function filteredTasks(allTasks) {
        var tasks = tasksInPeriod(allTasks);
        var query = lower(OPS.search);
        return tasks.filter(function (task) {
            if (OPS.module !== 'all' && task.module !== OPS.module) return false;
            if (OPS.status !== 'all') {
                if (OPS.status === 'overdue' && !task.isOverdue) return false;
                else if (OPS.status !== 'overdue' && task.statusKey !== OPS.status) return false;
            }
            if (OPS.assignee !== 'all' && task.assignee !== OPS.assignee) return false;
            if (query) {
                var haystack = [task.title, task.description, task.assignee, task.fromLoc, task.toLoc, task.issueReason, task.moduleLabel].join(' ').toLowerCase();
                if (haystack.indexOf(query) < 0) return false;
            }
            return true;
        });
    }

    function metrics(tasks) {
        var done = tasks.filter(function (t) { return t.isDone; }).length;
        var issues = tasks.filter(function (t) { return t.isIssue; }).length;
        var overdue = tasks.filter(function (t) { return t.isOverdue; }).length;
        var active = tasks.filter(function (t) { return t.statusKey === 'active' || t.statusKey === 'ready'; }).length;
        var queued = tasks.filter(function (t) { return t.statusKey === 'queued' || t.statusKey === 'waiting'; }).length;
        return {
            total: tasks.length, done: done, issues: issues, overdue: overdue, active: active, queued: queued,
            open: tasks.length - done,
            cleanRate: done ? Math.max(0, Math.round((done - tasks.filter(function (t) { return t.isDone && t.hadCorrection; }).length) / done * 100)) : 100
        };
    }

    function statusBadge(task) {
        var key = task.isOverdue && !task.isIssue ? 'overdue' : task.statusKey;
        var label = task.isOverdue && !task.isIssue ? 'เกินเวลาที่กำหนด' : task.statusLabel;
        return '<span class="ops-status ops-status--' + key + '"><i class="ph ' + (key === 'done' ? 'ph-check-circle' : key === 'issue' ? 'ph-warning-circle' : key === 'overdue' ? 'ph-timer' : 'ph-clock') + '"></i>' + esc(label) + '</span>';
    }

    function moduleBadge(task) {
        var meta = MODULES[task.module] || MODULES.receiving;
        return '<span class="ops-module ops-module--' + meta.tone + '"><i class="ph ' + meta.icon + '"></i>' + esc(meta.label) + '</span>';
    }

    function headerHtml(allTasks) {
        var users = assigneeOptions(allTasks);
        return '<section class="ops-command" aria-label="ตัวกรองศูนย์ควบคุมงาน">' +
            '<div class="ops-command__main">' +
                '<label class="ops-search"><i class="ph ph-magnifying-glass"></i><span class="sr-only">ค้นหางาน</span><input id="ops-search" value="' + attr(OPS.search) + '" placeholder="ค้นหารหัสสินค้า, Location หรือชื่อพนักงาน" autocomplete="off"></label>' +
                '<select data-ops-filter="module" aria-label="กรองโมดูล"><option value="all">ทุกโมดูล</option>' + Object.keys(MODULES).map(function (key) { return '<option value="' + key + '"' + (OPS.module === key ? ' selected' : '') + '>' + esc(MODULES[key].label) + '</option>'; }).join('') + '</select>' +
                '<select data-ops-filter="status" aria-label="กรองสถานะ">' +
                    option('all', 'ทุกสถานะ', OPS.status) + option('queued', 'รอเริ่ม', OPS.status) + option('active', 'กำลังทำ', OPS.status) + option('ready', 'พร้อมรับเข้า', OPS.status) + option('waiting', 'รอดำเนินการ', OPS.status) + option('overdue', 'เกินเวลาที่กำหนด', OPS.status) + option('issue', 'ติดปัญหา', OPS.status) + option('done', 'เสร็จแล้ว', OPS.status) +
                '</select>' +
                '<select data-ops-filter="assignee" aria-label="กรองผู้รับผิดชอบ"><option value="all">ทุกคน</option>' + users.map(function (name) { return '<option value="' + attr(name) + '"' + (OPS.assignee === name ? ' selected' : '') + '>' + esc(name) + '</option>'; }).join('') + '</select>' +
            '</div>' +
            '<div class="ops-command__meta">' +
                '<div class="ops-period" role="group" aria-label="ช่วงเวลา">' + periodButton('today', 'วันนี้') + periodButton('7d', '7 วัน') + periodButton('30d', '30 วัน') + periodButton('all', 'ทั้งหมด') + '</div>' +
                '<button type="button" class="ops-btn ops-btn--quiet" data-ops-action="refresh"><i class="ph ph-arrows-clockwise"></i>รีเฟรช</button>' +
                '<button type="button" class="ops-btn ops-btn--quiet" data-ops-action="export"><i class="ph ph-download-simple"></i>CSV</button>' +
                '<button type="button" class="ops-btn ops-btn--quiet" data-ops-action="sla"><i class="ph ph-sliders-horizontal"></i>ตั้งค่าเวลามาตรฐาน</button>' +
                '<span class="ops-updated"><span class="ops-live-dot"></span>ข้อมูลล่าสุด ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + '</span>' +
            '</div>' +
        '</section>';
    }

    function option(value, label, selected) { return '<option value="' + value + '"' + (selected === value ? ' selected' : '') + '>' + label + '</option>'; }
    function periodButton(value, label) { return '<button type="button" data-ops-period="' + value + '" class="' + (OPS.period === value ? 'active' : '') + '">' + label + '</button>'; }

    function internalNav() {
        var items = [
            ['pulse', 'ph-pulse', 'Operations Pulse'],
            ['queue', 'ph-list-checks', 'Work Queue'],
            ['aging', 'ph-hourglass-high', 'Backlog & Aging'],
            ['team', 'ph-users-three', 'Team Activity'],
            ['handover', 'ph-arrows-left-right', 'Shift Handover']
        ];
        return '<nav class="ops-tabs" aria-label="มุมมองการทำงาน">' + items.map(function (item) {
            return '<button type="button" data-ops-view="' + item[0] + '" class="' + (OPS.view === item[0] ? 'active' : '') + '"><i class="ph ' + item[1] + '"></i><span>' + item[2] + '</span></button>';
        }).join('') + '</nav>';
    }

    function kpiCard(icon, label, value, note, tone) {
        return '<article class="ops-kpi ops-kpi--' + tone + '"><div class="ops-kpi__icon"><i class="ph ' + icon + '"></i></div><div><span>' + label + '</span><strong>' + value + '</strong><small>' + note + '</small></div></article>';
    }

    function smartSummary(m) {
        var message;
        if (m.issues > 0) message = 'มีงานติดปัญหา ' + m.issues + ' รายการ ควรตรวจ Exception Center ก่อนเริ่มงานใหม่';
        else if (m.overdue > 0) message = 'ไม่มีปัญหาเปิด แต่มีงานที่ใช้เวลาเกินกำหนด ' + m.overdue + ' รายการ ควรจัดผู้รับผิดชอบทันที';
        else if (m.open > 0) message = 'สถานการณ์ปกติ เหลืองานเปิด ' + m.open + ' รายการ และยังไม่มีงานวิกฤต';
        else message = 'งานในช่วงเวลานี้เสร็จครบแล้ว ยังไม่มีงานค้างหรือปัญหาเปิด';
        return '<div class="ops-brief"><div class="ops-brief__icon"><i class="ph ph-sparkle"></i></div><div><strong>สรุปสถานการณ์</strong><p>' + esc(message) + '</p></div><button type="button" data-ops-view="queue">เปิด Work Queue <i class="ph ph-arrow-right"></i></button></div>';
    }

    function moduleRows(tasks) {
        return Object.keys(MODULES).map(function (key) {
            var list = tasks.filter(function (t) { return t.module === key; });
            var m = metrics(list);
            var within = list.filter(function (t) { return t.isDone && t.ageMinutes <= t.slaMinutes; }).length;
            var done = list.filter(function (t) { return t.isDone; }).length;
            var pct = done ? Math.round(within / done * 100) : (m.overdue ? 0 : 100);
            var meta = MODULES[key];
            return '<tr><td>' + moduleBadge({ module: key }) + '</td><td><strong>' + m.open + '</strong><span>งานเปิด</span></td><td><strong>' + m.done + '</strong><span>เสร็จแล้ว</span></td><td><strong class="' + (m.overdue ? 'ops-danger' : '') + '">' + m.overdue + '</strong><span>เกินเวลา</span></td><td><div class="ops-sla-cell"><span>' + pct + '%</span><div><i style="width:' + pct + '%"></i></div></div></td></tr>';
        }).join('');
    }

    function priorityRows(tasks, limit) {
        var list = tasks.filter(function (t) { return !t.isDone && (t.isIssue || t.isOverdue || t.isWaiting); })
            .sort(function (a, b) { return (Number(b.isIssue) - Number(a.isIssue)) || (b.ageMinutes / b.slaMinutes - a.ageMinutes / a.slaMinutes); })
            .slice(0, limit || 6);
        if (!list.length) return emptyState('ph-check-circle', 'ยังไม่มีงานเร่งด่วน', 'ทุกงานอยู่ในเวลามาตรฐานและไม่มีปัญหาเปิด');
        return '<div class="ops-priority-list">' + list.map(function (task) {
            return '<button type="button" class="ops-priority" data-ops-task="' + attr(task.uid) + '"><div>' + moduleBadge(task) + '<strong>' + esc(task.title) + '</strong><span>' + esc(task.assignee) + (task.description ? ' · ' + esc(task.description) : '') + '</span></div><div>' + statusBadge(task) + '<small>' + fmtAge(task.ageMinutes) + ' / กำหนด ' + task.slaMinutes + ' นาที</small></div><i class="ph ph-caret-right"></i></button>';
        }).join('') + '</div>';
    }

    function throughput(tasks) {
        var completed = tasks.filter(function (t) { return t.isDone && t.completedAt; });
        var hours = {};
        for (var h = 6; h <= 20; h += 2) hours[h] = 0;
        completed.forEach(function (task) {
            var hour = task.completedAt.getHours();
            var bucket = Math.max(6, Math.min(20, Math.floor(hour / 2) * 2));
            if (hours[bucket] != null) hours[bucket] += 1;
        });
        var max = Math.max.apply(Math, Object.keys(hours).map(function (key) { return hours[key]; }).concat([1]));
        return '<div class="ops-throughput" aria-label="จำนวนงานเสร็จตามช่วงเวลา">' + Object.keys(hours).map(function (key) {
            var value = hours[key];
            var height = Math.max(6, Math.round(value / max * 100));
            return '<div><span>' + value + '</span><i style="height:' + height + '%"></i><small>' + String(key).padStart(2, '0') + ':00</small></div>';
        }).join('') + '</div>';
    }

    function renderPulse(tasks) {
        var m = metrics(tasks);
        return smartSummary(m) +
            '<section class="ops-kpi-grid" aria-label="ตัวชี้วัดงาน">' +
                kpiCard('ph-briefcase', 'งานเปิด', fmtNumber(m.open), 'รวมงานที่ยังไม่เสร็จ', 'navy') +
                kpiCard('ph-play-circle', 'กำลังดำเนินการ', fmtNumber(m.active), 'กำลังทำและพร้อมรับเข้า', 'blue') +
                kpiCard('ph-check-circle', 'เสร็จแล้ว', fmtNumber(m.done), 'ตามช่วงเวลาที่เลือก', 'green') +
                kpiCard('ph-timer', 'เกินเวลาที่กำหนด', fmtNumber(m.overdue), m.overdue ? 'ต้องจัดลำดับก่อน' : 'ทุกงานอยู่ในเวลา', 'amber') +
                kpiCard('ph-warning-octagon', 'ติดปัญหา', fmtNumber(m.issues), m.issues ? 'ต้องมีผู้รับผิดชอบ' : 'ไม่มีปัญหาเปิด', 'red') +
                kpiCard('ph-shield-check', 'Clean completion', m.cleanRate + '%', 'งานเสร็จโดยไม่ติดปัญหา', 'teal') +
            '</section>' +
            '<div class="ops-layout ops-layout--wide">' +
                '<section class="ops-panel"><div class="ops-panel__head"><div><span>ภาพรวมแต่ละระบบ</span><h3>สุขภาพการทำงาน</h3></div><button type="button" data-ops-view="queue">ดูงานทั้งหมด</button></div><div class="ops-table-wrap"><table class="ops-health"><thead><tr><th>ระบบ</th><th>งานเปิด</th><th>เสร็จ</th><th>เกินเวลา</th><th>เสร็จภายในกำหนด</th></tr></thead><tbody>' + moduleRows(tasks) + '</tbody></table></div></section>' +
                '<section class="ops-panel"><div class="ops-panel__head"><div><span>ประสิทธิภาพวันนี้</span><h3>Throughput รายช่วงเวลา</h3></div></div>' + throughput(tasks) + '</section>' +
            '</div>' +
            '<section class="ops-panel"><div class="ops-panel__head"><div><span>ต้องตรวจสอบก่อน</span><h3>Priority work</h3></div><button type="button" data-ops-exceptions>เปิด Exception Center</button></div>' + priorityRows(tasks, 7) + '</section>';
    }

    function taskTable(tasks) {
        if (!tasks.length) return emptyState('ph-magnifying-glass', 'ไม่พบงานตามตัวกรอง', 'ลองเปลี่ยนสถานะ โมดูล หรือคำค้นหา');
        return '<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>งาน</th><th>ระบบ / สถานะ</th><th>ผู้รับผิดชอบ</th><th>Location</th><th>อายุงาน / เวลามาตรฐาน</th><th><span class="sr-only">รายละเอียด</span></th></tr></thead><tbody>' + tasks.map(function (task) {
            var ratio = Math.min(100, Math.round(task.ageMinutes / task.slaMinutes * 100));
            return '<tr data-ops-task="' + attr(task.uid) + '" tabindex="0"><td data-label="งาน"><strong>' + esc(task.title) + '</strong><span>' + esc(task.description || ('สร้างเมื่อ ' + fmtDate(task.createdAt, true))) + '</span></td><td data-label="ระบบ / สถานะ">' + moduleBadge(task) + statusBadge(task) + '</td><td data-label="ผู้รับผิดชอบ"><strong>' + esc(task.assignee) + '</strong><span>โดย ' + esc(task.createdBy) + '</span></td><td data-label="Location"><strong>' + esc(task.fromLoc || '-') + (task.toLoc ? ' → ' + esc(task.toLoc) : '') + '</strong><span>' + (task.qty ? fmtNumber(task.qty) + ' ชิ้น/ลัง' : '-') + '</span></td><td data-label="อายุงาน / เวลามาตรฐาน"><strong>' + fmtAge(task.ageMinutes) + '</strong><div class="ops-agebar ' + (task.isOverdue ? 'is-overdue' : '') + '"><i style="width:' + ratio + '%"></i></div><span>กำหนด ' + task.slaMinutes + ' นาที</span></td><td><button type="button" class="ops-icon-btn" aria-label="เปิดรายละเอียด"><i class="ph ph-caret-right"></i></button></td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    function renderQueue(tasks) {
        var m = metrics(tasks);
        return '<div class="ops-section-intro"><div><span>คิวงานกลาง</span><h3>งานจากทุกระบบในที่เดียว</h3><p>จัดลำดับจากปัญหา งานที่เกินเวลามาตรฐาน และอายุงานล่าสุดโดยอัตโนมัติ</p></div><div class="ops-section-count"><strong>' + fmtNumber(tasks.length) + '</strong><span>รายการที่แสดง</span></div></div>' +
            '<div class="ops-inline-stats"><span><i class="ph ph-circle"></i>รอ/กำลังทำ <b>' + (m.queued + m.active) + '</b></span><span class="warning"><i class="ph ph-timer"></i>เกินเวลาที่กำหนด <b>' + m.overdue + '</b></span><span class="danger"><i class="ph ph-warning-circle"></i>ติดปัญหา <b>' + m.issues + '</b></span><span class="success"><i class="ph ph-check-circle"></i>เสร็จแล้ว <b>' + m.done + '</b></span></div>' +
            '<section class="ops-panel ops-panel--flush">' + taskTable(tasks.slice().sort(taskSort)) + '</section>';
    }

    function taskSort(a, b) {
        return (Number(b.isIssue) - Number(a.isIssue)) || (Number(b.isOverdue) - Number(a.isOverdue)) || (Number(a.isDone) - Number(b.isDone)) || (b.ageMinutes - a.ageMinutes);
    }

    function agingBuckets(tasks) {
        var buckets = [
            { label: '≤ 15 นาที', min: 0, max: 15, tone: 'green' },
            { label: '16–30 นาที', min: 16, max: 30, tone: 'teal' },
            { label: '31–60 นาที', min: 31, max: 60, tone: 'amber' },
            { label: '61–120 นาที', min: 61, max: 120, tone: 'orange' },
            { label: '> 120 นาที', min: 121, max: Infinity, tone: 'red' }
        ];
        var open = tasks.filter(function (t) { return !t.isDone; });
        return '<div class="ops-aging-grid">' + buckets.map(function (bucket) {
            var list = open.filter(function (t) { return t.ageMinutes >= bucket.min && t.ageMinutes <= bucket.max; });
            var pct = open.length ? Math.round(list.length / open.length * 100) : 0;
            return '<article class="ops-aging ops-aging--' + bucket.tone + '"><span>' + bucket.label + '</span><strong>' + list.length + '</strong><div><i style="width:' + pct + '%"></i></div><small>' + pct + '% ของงานเปิด</small></article>';
        }).join('') + '</div>';
    }

    function renderAging(tasks) {
        var oldest = tasks.filter(function (t) { return !t.isDone; }).sort(function (a, b) { return b.ageMinutes - a.ageMinutes; }).slice(0, 12);
        return '<div class="ops-section-intro"><div><span>ควบคุมงานค้าง</span><h3>อายุงานและเวลามาตรฐาน</h3><p>เห็นงานค้างก่อนกลายเป็นปัญหา พร้อมเกณฑ์แยกตามประเภทงาน</p></div><button type="button" class="ops-btn ops-btn--primary" data-ops-action="sla"><i class="ph ph-sliders-horizontal"></i>ปรับเวลามาตรฐาน</button></div>' +
            agingBuckets(tasks) +
            '<div class="ops-layout ops-layout--aging"><section class="ops-panel"><div class="ops-panel__head"><div><span>เรียงจากค้างนานที่สุด</span><h3>Oldest backlog</h3></div></div>' + priorityRows(oldest, 12) + '</section>' +
            '<section class="ops-panel"><div class="ops-panel__head"><div><span>เกณฑ์แจ้งเตือนปัจจุบัน</span><h3>เวลามาตรฐานแต่ละระบบ</h3></div></div><div class="ops-sla-list">' + Object.keys(MODULES).map(function (key) {
                var list = tasks.filter(function (t) { return t.module === key && !t.isDone; });
                var overdue = list.filter(function (t) { return t.isOverdue; }).length;
                return '<div><span>' + moduleBadge({ module: key }) + '<small>' + list.length + ' งานเปิด</small></span><strong>' + OPS.sla[key] + ' นาที</strong><em class="' + (overdue ? 'danger' : '') + '">' + overdue + ' เกินเวลา</em></div>';
            }).join('') + '</div></section></div>';
    }

    function teamData(tasks) {
        var map = {};
        tasks.forEach(function (task) {
            var name = task.assignee;
            if (!name || name === 'ยังไม่มอบหมาย') return;
            if (!map[name]) map[name] = { name: name, tasks: [], modules: {}, last: null };
            map[name].tasks.push(task);
            map[name].modules[task.module] = true;
            if (task.updatedAt && (!map[name].last || task.updatedAt > map[name].last)) map[name].last = task.updatedAt;
        });
        return Object.keys(map).map(function (name) {
            var team = map[name];
            var m = metrics(team.tasks);
            team.open = m.open; team.done = m.done; team.issues = m.issues; team.overdue = m.overdue;
            team.cleanRate = m.cleanRate; team.moduleCount = Object.keys(team.modules).length;
            return team;
        }).sort(function (a, b) { return (b.open - a.open) || (b.done - a.done); });
    }

    function renderTeam(tasks) {
        var team = teamData(tasks);
        if (!team.length) return emptyState('ph-users-three', 'ยังไม่มีข้อมูลทีมในช่วงเวลานี้', 'เมื่อมีการมอบหมายงาน ระบบจะสร้าง Operational profile ให้อัตโนมัติ');
        return '<div class="ops-section-intro"><div><span>Operational profile</span><h3>กิจกรรมและภาระงานของทีม</h3><p>ใช้เพื่อกระจายงานและช่วยทีม ไม่ใช่ตัดสินจากจำนวนงานเพียงอย่างเดียว</p></div><div class="ops-section-count"><strong>' + team.length + '</strong><span>คนที่มีงาน</span></div></div>' +
            '<div class="ops-team-grid">' + team.map(function (member) {
                var initials = member.name.slice(0, 2).toUpperCase();
                return '<button type="button" class="ops-member" data-ops-member="' + attr(member.name) + '"><div class="ops-member__head"><span class="ops-avatar">' + esc(initials) + '</span><div><strong>' + esc(member.name) + '</strong><span>ทำงาน ' + member.moduleCount + ' ระบบ · ล่าสุด ' + fmtDate(member.last, true) + '</span></div><i class="ph ph-caret-right"></i></div><div class="ops-member__stats"><span><b>' + member.open + '</b>งานเปิด</span><span><b>' + member.done + '</b>เสร็จแล้ว</span><span class="' + (member.overdue ? 'danger' : '') + '"><b>' + member.overdue + '</b>เกินเวลา</span><span class="' + (member.issues ? 'danger' : '') + '"><b>' + member.issues + '</b>ปัญหา</span></div><div class="ops-member__quality"><span>งานเสร็จโดยไม่ต้องแก้</span><strong>' + member.cleanRate + '%</strong><div><i style="width:' + member.cleanRate + '%"></i></div></div></button>';
            }).join('') + '</div>';
    }

    function handoverSummary(tasks) {
        var open = tasks.filter(function (t) { return !t.isDone; });
        var m = metrics(tasks);
        return { open: open.length, overdue: m.overdue, issues: m.issues, waiting: open.filter(function (t) { return t.isWaiting; }).length };
    }

    function renderHandover(tasks) {
        var summary = handoverSummary(tasks);
        var priorities = tasks.filter(function (t) { return !t.isDone && (t.isIssue || t.isOverdue); }).sort(taskSort).slice(0, 8);
        return '<div class="ops-section-intro"><div><span>Shift continuity</span><h3>ส่งต่องานโดยไม่ตกหล่น</h3><p>ระบบสรุปงานค้างและปัญหาให้อัตโนมัติ เพิ่มเฉพาะบริบทที่กะถัดไปต้องรู้</p></div><button type="button" class="ops-btn ops-btn--quiet" data-ops-action="print-current"><i class="ph ph-printer"></i>พิมพ์ฉบับร่าง</button></div>' +
            '<div class="ops-layout ops-layout--handover"><section class="ops-panel"><div class="ops-panel__head"><div><span>รายงานฉบับใหม่</span><h3>Shift handover</h3></div><span class="ops-draft">ฉบับร่างอัตโนมัติ</span></div>' +
                '<div class="ops-handover-summary"><span><b>' + summary.open + '</b>งานเปิด</span><span><b>' + summary.overdue + '</b>เกินเวลา</span><span><b>' + summary.issues + '</b>ปัญหา</span><span><b>' + summary.waiting + '</b>รอดำเนินการ</span></div>' +
                '<div class="ops-field-grid"><label><span>กะที่ส่งต่อ</span><select id="ops-handover-shift"><option>กะเช้า → กะบ่าย</option><option>กะบ่าย → กะดึก</option><option>กะดึก → กะเช้า</option></select></label><label><span>ผู้รับช่วงต่อ</span><input id="ops-handover-owner" placeholder="ชื่อผู้รับช่วงต่อ"></label></div>' +
                '<label class="ops-field"><span>เรื่องที่กะถัดไปต้องรู้</span><textarea id="ops-handover-note" rows="5" placeholder="เช่น รอ Admin ยืนยัน Location, สินค้ามาถึงล่าช้า, ต้องติดตาม supplier..."></textarea></label>' +
                '<div class="ops-handover-priority"><strong>รายการสำคัญที่แนบอัตโนมัติ</strong>' + (priorities.length ? priorities.map(function (task) { return '<span>' + statusBadge(task) + '<b>' + esc(task.title) + '</b><small>' + esc(task.assignee) + ' · ' + fmtAge(task.ageMinutes) + '</small></span>'; }).join('') : '<p>ไม่มีงานเกินเวลาที่กำหนดหรือปัญหาเปิด</p>') + '</div>' +
                '<button type="button" class="ops-btn ops-btn--primary ops-btn--full" data-ops-action="save-handover"><i class="ph ph-floppy-disk"></i>บันทึกรายงานส่งต่องาน</button>' +
            '</section>' +
            '<section class="ops-panel"><div class="ops-panel__head"><div><span>ตรวจย้อนหลังได้</span><h3>ประวัติส่งต่องาน</h3></div></div><div class="ops-handover-history">' + handoverHistoryHtml() + '</div></section></div>';
    }

    function handoverHistoryHtml() {
        if (!OPS.handovers.length) return emptyState('ph-clock-counter-clockwise', 'ยังไม่มีประวัติส่งต่องาน', 'รายงานที่บันทึกจะอยู่ที่นี่และพิมพ์ย้อนหลังได้');
        return OPS.handovers.slice().sort(function (a, b) { return num(b.createdAt) - num(a.createdAt); }).slice(0, 12).map(function (report) {
            return '<button type="button" data-ops-handover="' + attr(report.id) + '"><span><strong>' + esc(report.shift) + '</strong><small>' + fmtDate(report.createdAt, true) + ' · โดย ' + esc(report.createdBy) + '</small></span><em>' + report.summary.open + ' งานเปิด</em><i class="ph ph-printer"></i></button>';
        }).join('');
    }

    function exceptionTasks(tasks) {
        return tasks.filter(function (t) { return !t.isDone && (t.isIssue || t.isOverdue || t.isWaiting); }).sort(taskSort);
    }

    function renderExceptions(tasks) {
        var exceptions = exceptionTasks(tasks);
        var critical = exceptions.filter(function (t) { return t.isIssue || t.ageMinutes > t.slaMinutes * 2; }).length;
        var high = exceptions.filter(function (t) { return !t.isIssue && t.isOverdue && t.ageMinutes <= t.slaMinutes * 2; }).length;
        var waiting = exceptions.filter(function (t) { return t.isWaiting && !t.isOverdue; }).length;
        return '<div class="ops-section-intro"><div><span>ศูนย์งานผิดปกติ</span><h3>ปัญหาและงานเสี่ยงในจุดเดียว</h3><p>รวมงานมีปัญหา งานยกเลิก งานรอผู้ดูแล และงานเกินเวลาที่กำหนดจากทุกระบบ</p></div><button type="button" class="ops-btn ops-btn--quiet" data-ops-action="export"><i class="ph ph-download-simple"></i>ส่งออก CSV</button></div>' +
            '<div class="ops-exception-kpis">' +
                kpiCard('ph-siren', 'วิกฤต', critical, 'มีปัญหาหรือใช้เวลาเกิน 2 เท่า', 'red') +
                kpiCard('ph-timer', 'เร่งด่วน', high, 'เกินเวลามาตรฐานแต่ยังไม่ถึง 2 เท่า', 'amber') +
                kpiCard('ph-hand-palm', 'รอการตัดสินใจ', waiting, 'รอ Admin หรือการยืนยัน', 'blue') +
                kpiCard('ph-shield-check', 'รวมทั้งหมด', exceptions.length, 'รายการที่ต้องติดตาม', 'navy') +
            '</div>' +
            '<section class="ops-panel ops-panel--flush">' + (exceptions.length ? '<div class="ops-exception-list">' + exceptions.map(function (task) {
                var severity = task.isIssue || task.ageMinutes > task.slaMinutes * 2 ? 'critical' : task.isOverdue ? 'high' : 'medium';
                var severityLabel = severity === 'critical' ? 'วิกฤต' : severity === 'high' ? 'เร่งด่วน' : 'ติดตาม';
                return '<article class="ops-exception ops-exception--' + severity + '"><div class="ops-exception__level"><strong>' + severityLabel + '</strong><span>' + moduleBadge(task) + '</span></div><div class="ops-exception__body"><div><strong>' + esc(task.title) + '</strong>' + statusBadge(task) + '</div><p>' + esc(task.issueReason || task.description || 'งานใช้เวลานานกว่าเกณฑ์ที่กำหนด') + '</p><span>ผู้รับผิดชอบ <b>' + esc(task.assignee) + '</b> · อายุงาน <b>' + fmtAge(task.ageMinutes) + '</b> · เวลามาตรฐาน ' + task.slaMinutes + ' นาที</span></div><button type="button" data-ops-task="' + attr(task.uid) + '">ตรวจสอบ <i class="ph ph-arrow-right"></i></button></article>';
            }).join('') + '</div>' : emptyState('ph-shield-check', 'ไม่มี Exception เปิดอยู่', 'งานทุกระบบอยู่ในเกณฑ์และไม่มีรายการติดปัญหา')) + '</section>';
    }

    function emptyState(icon, title, text) {
        return '<div class="ops-empty"><i class="ph ' + icon + '"></i><strong>' + title + '</strong><span>' + text + '</span></div>';
    }

    function shell(tasks, exceptionMode) {
        var filtered = filteredTasks(tasks);
        var content = exceptionMode ? renderExceptions(filtered) : OPS.view === 'queue' ? renderQueue(filtered) : OPS.view === 'aging' ? renderAging(filtered) : OPS.view === 'team' ? renderTeam(filtered) : OPS.view === 'handover' ? renderHandover(filtered) : renderPulse(filtered);
        return '<div class="ops-root">' + (!exceptionMode ? internalNav() : '') + headerHtml(tasks) + '<main class="ops-content">' + content + '</main></div>';
    }

    function renderDashboard() {
        var container = document.getElementById('sup-view-dashboard');
        if (!container) return;
        ['v4-live-ops-section', 'v4-daily-target-section', 'v4-sup-toolbar'].forEach(function (id) { var old = document.getElementById(id); if (old) old.remove(); });
        if (app.state && app.state.v4 && app.state.v4.liveOpsInterval) { clearInterval(app.state.v4.liveOpsInterval); app.state.v4.liveOpsInterval = null; }
        var title = document.getElementById('sup-page-title');
        if (title) title.textContent = 'Operations Center';
        container.innerHTML = shell(normalizeTasks(), false);
        OPS.lastRenderedAt = now();
    }

    function renderExceptionCenter() {
        var container = document.getElementById('sup-view-issues');
        if (!container) return;
        var title = document.getElementById('sup-page-title');
        if (title) title.textContent = 'Exception Center';
        container.innerHTML = shell(normalizeTasks(), true);
    }

    function activeContainerRender() {
        var current = app.state && app.state.ui && app.state.ui.supervisorTab;
        if (current === 'issues') renderExceptionCenter();
        else renderDashboard();
    }

    async function setPeriod(value) {
        OPS.period = value;
        if (!app.state || !app.state.ui || !app.state.data) { activeContainerRender(); return; }
        if (value === 'today') {
            app.state.ui.supervisorDateFilter = 'today';
            app.state.data.supervisorArchiveData = [];
            activeContainerRender();
            return;
        }
        if ((value === '7d' || value === '30d') && typeof app.loadSupervisorDataByRange === 'function') {
            var end = new Date();
            var start = new Date();
            start.setDate(start.getDate() - (value === '7d' ? 6 : 29));
            var ymd = function (date) { return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); };
            app.state.ui.supervisorDateFilter = 'custom';
            if (!app.state.filters) app.state.filters = {};
            app.state.filters.supervisorDateRange = { start: ymd(start), end: ymd(end) };
            try { await app.loadSupervisorDataByRange(ymd(start), ymd(end)); } catch (e) { console.warn('Supervisor archive range unavailable', e); }
        }
        activeContainerRender();
    }

    function findTask(uid) {
        return normalizeTasks().filter(function (task) { return task.uid === uid; })[0] || null;
    }

    function openTask(uid) {
        var task = findTask(uid);
        if (!task) return;
        var issueBlock = task.issueReason ? '<div class="ops-detail-alert"><i class="ph ph-warning-circle"></i><div><strong>รายละเอียดปัญหา</strong><p>' + esc(task.issueReason) + '</p></div></div>' : '';
        var actions = '';
        if (task.module === 'receiving' && typeof app.openModal === 'function') actions = '<button type="button" class="ops-btn ops-btn--primary" data-ops-open-source="' + attr(task.uid) + '">เปิดงาน Receiving</button>';
        showModal('<div class="ops-detail-head">' + moduleBadge(task) + statusBadge(task) + '<h2>' + esc(task.title) + '</h2><p>' + esc(task.description || 'ไม่มีคำอธิบายเพิ่มเติม') + '</p></div>' + issueBlock +
            '<dl class="ops-detail-grid"><div><dt>ผู้รับผิดชอบ</dt><dd>' + esc(task.assignee) + '</dd></div><div><dt>ผู้สร้างงาน</dt><dd>' + esc(task.createdBy) + '</dd></div><div><dt>เริ่มเมื่อ</dt><dd>' + fmtDate(task.createdAt, true) + '</dd></div><div><dt>อายุงาน</dt><dd>' + fmtAge(task.ageMinutes) + '</dd></div><div><dt>เวลามาตรฐาน</dt><dd>' + task.slaMinutes + ' นาที</dd></div><div><dt>จำนวน</dt><dd>' + (task.qty ? fmtNumber(task.qty) : '-') + '</dd></div><div><dt>ต้นทาง</dt><dd>' + esc(task.fromLoc || '-') + '</dd></div><div><dt>ปลายทาง</dt><dd>' + esc(task.toLoc || '-') + '</dd></div></dl>' +
            '<div class="ops-timeline"><strong>เส้นทางงาน</strong><span class="done"><i></i>สร้างงาน <small>' + fmtDate(task.createdAt, true) + '</small></span><span class="' + (task.statusKey !== 'queued' ? 'done' : '') + '"><i></i>รับงาน / ดำเนินการ</span><span class="' + (task.isDone ? 'done' : '') + '"><i></i>เสร็จสิ้น <small>' + fmtDate(task.completedAt, true) + '</small></span></div><div class="ops-modal-actions">' + actions + '<button type="button" class="ops-btn ops-btn--quiet" data-ops-close>ปิด</button></div>');
    }

    function openMember(name) {
        var tasks = normalizeTasks().filter(function (task) { return task.assignee === name; }).sort(taskSort);
        var m = metrics(tasks);
        showModal('<div class="ops-profile-head"><span class="ops-avatar ops-avatar--large">' + esc(name.slice(0, 2).toUpperCase()) + '</span><div><span>ข้อมูลการทำงาน</span><h2>' + esc(name) + '</h2><p>กิจกรรมจาก PLAS WMS ทุกระบบ</p></div></div><div class="ops-profile-kpis"><span><b>' + m.open + '</b>งานเปิด</span><span><b>' + m.done + '</b>เสร็จแล้ว</span><span><b>' + m.overdue + '</b>เกินเวลา</span><span><b>' + m.cleanRate + '%</b>งานเสร็จโดยไม่ต้องแก้</span></div><div class="ops-modal-list">' + (tasks.length ? tasks.slice(0, 15).map(function (task) { return '<button type="button" data-ops-task="' + attr(task.uid) + '">' + moduleBadge(task) + '<span><strong>' + esc(task.title) + '</strong><small>' + statusBadge(task) + ' · ' + fmtAge(task.ageMinutes) + '</small></span><i class="ph ph-caret-right"></i></button>'; }).join('') : emptyState('ph-user', 'ยังไม่มีรายการงาน', 'ไม่พบงานของพนักงานคนนี้')) + '</div><div class="ops-modal-actions"><button type="button" class="ops-btn ops-btn--quiet" data-ops-close>ปิด</button></div>');
    }

    function showModal(html) {
        closeModal();
        var overlay = document.createElement('div');
        overlay.id = 'ops-modal';
        overlay.className = 'ops-modal';
        overlay.innerHTML = '<div class="ops-modal__backdrop" data-ops-close></div><section class="ops-modal__dialog" role="dialog" aria-modal="true"><button type="button" class="ops-modal__close" data-ops-close aria-label="ปิด"><i class="ph ph-x"></i></button>' + html + '</section>';
        document.body.appendChild(overlay);
        var focusable = overlay.querySelector('button, input, select, textarea');
        if (focusable) focusable.focus();
    }

    function closeModal() { var old = document.getElementById('ops-modal'); if (old) old.remove(); }

    function openSlaSettings() {
        showModal('<div class="ops-detail-head"><span>เกณฑ์การแจ้งเตือน</span><h2>ตั้งค่าเวลามาตรฐาน</h2><p>กำหนดเวลามาตรฐานแยกตามประเภทงาน ระบบจะแจ้งเตือนเมื่อรายการที่ยังไม่เสร็จเกินเวลานี้</p></div><div class="ops-sla-form">' + Object.keys(MODULES).map(function (key) {
            return '<label><span>' + moduleBadge({ module: key }) + '</span><div><input type="number" id="ops-sla-' + key + '" min="1" max="10080" value="' + num(OPS.sla[key]) + '"><em>นาที</em></div></label>';
        }).join('') + '</div><div class="ops-modal-note"><i class="ph ph-info"></i>การเปลี่ยนเวลามาตรฐานมีผลกับการแสดงผล Supervisor เท่านั้น ไม่แก้สถานะงานต้นทาง</div><div class="ops-modal-actions"><button type="button" class="ops-btn ops-btn--primary" data-ops-save-sla>บันทึกเวลามาตรฐาน</button><button type="button" class="ops-btn ops-btn--quiet" data-ops-close>ยกเลิก</button></div>');
    }

    async function saveSla() {
        Object.keys(MODULES).forEach(function (key) {
            var input = document.getElementById('ops-sla-' + key);
            if (input) OPS.sla[key] = Math.max(1, Math.min(10080, num(input.value) || SLA_DEFAULTS[key]));
        });
        localStorage.setItem(CONFIG_KEY, JSON.stringify(OPS.sla));
        try {
            if (window.db) await window.db.collection('supervisorOpsConfig').doc('main').set({ sla: OPS.sla, updatedAt: new Date().toISOString(), updatedBy: currentUser() }, { merge: true });
        } catch (e) { console.warn('Supervisor standard-time remote save unavailable', e); }
        closeModal();
        activeContainerRender();
        toast('บันทึกเวลามาตรฐานแล้ว');
    }

    async function loadRemoteState() {
        if (OPS.loadedRemote || !window.db) return;
        OPS.loadedRemote = true;
        try {
            var configDoc = await window.db.collection('supervisorOpsConfig').doc('main').get();
            if (configDoc.exists && configDoc.data().sla) OPS.sla = Object.assign({}, SLA_DEFAULTS, configDoc.data().sla);
            var snap = await window.db.collection('supervisorHandoverReports').orderBy('createdAt', 'desc').limit(50).get();
            var reports = [];
            snap.forEach(function (doc) { reports.push(Object.assign({ id: doc.id }, doc.data())); });
            if (reports.length) OPS.handovers = reports;
            localStorage.setItem(CONFIG_KEY, JSON.stringify(OPS.sla));
            localStorage.setItem(HANDOVER_KEY, JSON.stringify(OPS.handovers));
            activeContainerRender();
        } catch (e) { console.warn('Supervisor operations remote state unavailable', e); }
    }

    async function saveHandover() {
        var shift = document.getElementById('ops-handover-shift');
        var owner = document.getElementById('ops-handover-owner');
        var note = document.getElementById('ops-handover-note');
        var tasks = filteredTasks(normalizeTasks());
        var priorities = exceptionTasks(tasks).slice(0, 12).map(function (task) {
            return { uid: task.uid, module: task.moduleLabel, title: task.title, status: task.statusLabel, assignee: task.assignee, ageMinutes: task.ageMinutes, slaMinutes: task.slaMinutes, issueReason: task.issueReason };
        });
        var report = {
            id: 'handover-' + now(),
            shift: shift ? shift.value : 'ส่งต่องาน',
            nextOwner: owner ? owner.value.trim() : '',
            note: note ? note.value.trim() : '',
            createdBy: currentUser(),
            createdAt: now(),
            summary: handoverSummary(tasks),
            priorities: priorities
        };
        OPS.handovers.unshift(report);
        OPS.handovers = OPS.handovers.slice(0, 50);
        localStorage.setItem(HANDOVER_KEY, JSON.stringify(OPS.handovers));
        try {
            if (window.db) await window.db.collection('supervisorHandoverReports').doc(report.id).set(report);
        } catch (e) { console.warn('Handover remote save unavailable', e); }
        renderDashboard();
        toast('บันทึกรายงานส่งต่องานแล้ว');
    }

    function printHandover(id) {
        var report = id ? OPS.handovers.filter(function (x) { return String(x.id) === String(id); })[0] : null;
        if (!report) {
            var tasks = filteredTasks(normalizeTasks());
            report = { shift: 'ฉบับร่างปัจจุบัน', nextOwner: '', note: '', createdBy: currentUser(), createdAt: now(), summary: handoverSummary(tasks), priorities: exceptionTasks(tasks).slice(0, 12).map(function (task) { return { module: task.moduleLabel, title: task.title, status: task.statusLabel, assignee: task.assignee, ageMinutes: task.ageMinutes, slaMinutes: task.slaMinutes, issueReason: task.issueReason }; }) };
        }
        var win = window.open('', '_blank', 'width=900,height=700');
        if (!win) { toast('กรุณาอนุญาต Pop-up เพื่อพิมพ์รายงาน', true); return; }
        var rows = arr(report.priorities).map(function (task, index) { return '<tr><td>' + (index + 1) + '</td><td>' + esc(task.module) + '</td><td><b>' + esc(task.title) + '</b><br>' + esc(task.issueReason || '') + '</td><td>' + esc(task.status) + '</td><td>' + esc(task.assignee) + '</td><td>' + fmtAge(task.ageMinutes) + ' / ' + task.slaMinutes + ' นาที</td></tr>'; }).join('');
        win.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>PLAS WMS Shift Handover</title><style>body{font-family:Sarabun,Tahoma,sans-serif;color:#142338;margin:32px}header{border-bottom:1px solid #8ca3b4;padding-bottom:16px;margin-bottom:20px}h1{margin:0;font-size:24px}p{margin:6px 0}.summary{display:flex;gap:12px;margin:18px 0}.summary span{border:1px solid #cbd5e1;padding:12px 18px;border-radius:8px}.summary b{font-size:22px;display:block}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;vertical-align:top}th{background:#eef6f5}.note{border:1px solid #cbd5e1;background:#f8fafc;padding:14px;margin:16px 0;min-height:50px}.sign{display:flex;justify-content:space-between;margin-top:48px}.sign span{width:40%;border-top:1px solid #475569;text-align:center;padding-top:8px}@media print{body{margin:12mm}}</style></head><body><header><h1>PLAS WMS — Shift Handover</h1><p>' + esc(report.shift) + ' · ' + fmtDate(report.createdAt, true) + '</p><p>ผู้ส่งต่อ: <b>' + esc(report.createdBy) + '</b> · ผู้รับช่วงต่อ: <b>' + esc(report.nextOwner || '-') + '</b></p></header><div class="summary"><span><b>' + report.summary.open + '</b>งานเปิด</span><span><b>' + report.summary.overdue + '</b>เกินเวลา</span><span><b>' + report.summary.issues + '</b>ปัญหา</span><span><b>' + report.summary.waiting + '</b>รอดำเนินการ</span></div><div class="note"><b>ข้อควรทราบ:</b><br>' + esc(report.note || '-') + '</div><h2>รายการที่ต้องติดตาม</h2><table><thead><tr><th>#</th><th>ระบบ</th><th>งาน / รายละเอียด</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>อายุงาน / เวลามาตรฐาน</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6">ไม่มีรายการเร่งด่วน</td></tr>') + '</tbody></table><div class="sign"><span>ผู้ส่งต่อ</span><span>ผู้รับช่วงต่อ</span></div><script>window.onload=function(){window.print()}<\/script></body></html>');
        win.document.close();
    }

    function exportCsv() {
        var tasks = filteredTasks(normalizeTasks()).sort(taskSort);
        var rows = [['ระบบ', 'งาน', 'สถานะ', 'ผู้รับผิดชอบ', 'ต้นทาง', 'ปลายทาง', 'จำนวน', 'อายุงาน (นาที)', 'เวลามาตรฐาน (นาที)', 'เกินเวลา', 'ปัญหา', 'สร้างเมื่อ']];
        tasks.forEach(function (t) { rows.push([t.moduleLabel, t.title, t.statusLabel, t.assignee, t.fromLoc, t.toLoc, t.qty, t.ageMinutes, t.slaMinutes, t.isOverdue ? 'Yes' : 'No', t.issueReason, fmtDate(t.createdAt, true)]); });
        var csv = '\ufeff' + rows.map(function (row) { return row.map(function (cell) { return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'PLAS-WMS-Operations-' + new Date().toISOString().slice(0, 10) + '.csv';
        link.click();
        setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    }

    function toast(message, danger) {
        var old = document.querySelector('.ops-toast');
        if (old) old.remove();
        var el = document.createElement('div');
        el.className = 'ops-toast' + (danger ? ' ops-toast--danger' : '');
        el.innerHTML = '<i class="ph ' + (danger ? 'ph-warning-circle' : 'ph-check-circle') + '"></i>' + esc(message);
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 3200);
    }

    function patchNavigationLabels() {
        var dashboard = document.getElementById('sup-sidebar-dashboard');
        var issues = document.getElementById('sup-sidebar-issues');
        if (dashboard) dashboard.innerHTML = '<i class="ph ph-pulse text-xl"></i> Operations Center';
        if (issues) issues.innerHTML = '<i class="ph ph-warning-octagon text-xl"></i> Exception Center';
    }

    document.addEventListener('click', function (event) {
        var target = event.target.closest('[data-ops-view],[data-ops-period],[data-ops-task],[data-ops-member],[data-ops-action],[data-ops-close],[data-ops-save-sla],[data-ops-open-source],[data-ops-handover],[data-ops-exceptions]');
        if (!target) return;
        if (target.hasAttribute('data-ops-view')) { OPS.view = target.getAttribute('data-ops-view'); renderDashboard(); }
        else if (target.hasAttribute('data-ops-period')) setPeriod(target.getAttribute('data-ops-period'));
        else if (target.hasAttribute('data-ops-task')) openTask(target.getAttribute('data-ops-task'));
        else if (target.hasAttribute('data-ops-member')) openMember(target.getAttribute('data-ops-member'));
        else if (target.hasAttribute('data-ops-close')) closeModal();
        else if (target.hasAttribute('data-ops-save-sla')) saveSla();
        else if (target.hasAttribute('data-ops-open-source')) {
            var task = findTask(target.getAttribute('data-ops-open-source'));
            closeModal();
            if (task && typeof app.openModal === 'function') app.openModal(task.id);
        }
        else if (target.hasAttribute('data-ops-handover')) printHandover(target.getAttribute('data-ops-handover'));
        else if (target.hasAttribute('data-ops-exceptions')) app.switchSupTab('issues');
        else if (target.hasAttribute('data-ops-action')) {
            var action = target.getAttribute('data-ops-action');
            if (action === 'refresh') activeContainerRender();
            else if (action === 'export') exportCsv();
            else if (action === 'sla') openSlaSettings();
            else if (action === 'save-handover') saveHandover();
            else if (action === 'print-current') printHandover();
        }
    });

    document.addEventListener('change', function (event) {
        var key = event.target && event.target.getAttribute('data-ops-filter');
        if (!key) return;
        OPS[key] = event.target.value;
        activeContainerRender();
    });

    document.addEventListener('input', function (event) {
        if (!event.target || event.target.id !== 'ops-search') return;
        OPS.search = event.target.value;
        clearTimeout(OPS.searchTimer);
        OPS.searchTimer = setTimeout(activeContainerRender, 180);
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeModal();
        var row = event.target && event.target.closest && event.target.closest('tr[data-ops-task]');
        if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openTask(row.getAttribute('data-ops-task')); }
    });

    var oldSwitch = app.switchSupTab;
    app.renderSupervisorDashboard = renderDashboard;
    app.initIssuesOverview = renderExceptionCenter;
    app.loadIssuesOverview = renderExceptionCenter;
    app.switchSupTab = function (tab) {
        var result = oldSwitch.call(this, tab);
        if (tab === 'dashboard') renderDashboard();
        else if (tab === 'issues') renderExceptionCenter();
        return result;
    };
    app.supervisorOps = {
        state: OPS,
        normalizeTasks: normalizeTasks,
        render: renderDashboard,
        renderExceptions: renderExceptionCenter,
        openTask: openTask,
        exportCsv: exportCsv,
        saveHandover: saveHandover,
        printHandover: printHandover,
        setFilter: function (key, value) { OPS[key] = value; activeContainerRender(); }
    };

    patchNavigationLabels();
    loadRemoteState();
    if (app.state && app.state.ui && app.state.ui.supervisorTab === 'dashboard') renderDashboard();
    console.log('✅ PLAS_WMS_V5.10.1_SUPERVISOR_OPERATIONS_CENTER_ACTIVE');
})();
