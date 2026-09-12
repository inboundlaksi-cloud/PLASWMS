(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.PLAS_AX_COPY = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
    'use strict';

    var HEADER_ALIASES = {
        warehouse: ['warehouse'],
        lineNo: ['line no', 'line number'],
        autoLocation: ['auto location'],
        po: ['purchase order', 'purchaseorder'],
        itemNumber: ['item number', 'itemnumber'],
        externalItemNumber: ['external item number', 'external item', 'externalitemnumber'],
        text: ['text', 'description', 'item text'],
        quantity: ['quantity', 'qty'],
        location: ['location'],
        batchNumber: ['batch number', 'batch'],
        qtyOnhand: ['qty onhand', 'qty on hand', 'quantity onhand', 'quantity on hand'],
        inventQty: ['inventqty', 'invent qty', 'inventory qty'],
        itemClass: ['itemclass', 'item class'],
        engName: ['eng name', 'english name'],
        unit: ['unit'],
        inventUnit: ['invent unit', 'inventory unit'],
        site: ['site'],
        batchNumberGroup: ['batch number group', 'batch group'],
        itemOpenBoxType: ['btl itemopenboxtype', 'item open box type', 'open box type']
    };

    function cleanCell(value) {
        return String(value == null ? '' : value)
            .replace(/^\uFEFF/, '')
            .replace(/(?:&#x0*9;|&#0*9;)/gi, '\t')
            .replace(/\\_/g, '_')
            .replace(/\u00a0/g, ' ')
            .trim();
    }

    function normalizeHeader(value) {
        return cleanCell(value)
            .toLowerCase()
            .replace(/[_./-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function parseTsv(text) {
        var source = String(text == null ? '' : text).replace(/^\uFEFF/, '');
        var rows = [];
        var row = [];
        var cell = '';
        var quoted = false;

        function pushCell() {
            row.push(cell);
            cell = '';
        }

        function pushRow() {
            pushCell();
            if (row.some(function (value) { return cleanCell(value) !== ''; })) rows.push(row);
            row = [];
        }

        for (var i = 0; i < source.length; i++) {
            var ch = source.charAt(i);
            if (quoted) {
                if (ch === '"' && source.charAt(i + 1) === '"') {
                    cell += '"';
                    i++;
                } else if (ch === '"') {
                    quoted = false;
                } else {
                    cell += ch;
                }
                continue;
            }
            if (ch === '"' && cell === '') {
                quoted = true;
            } else if (ch === '\t') {
                pushCell();
            } else if (ch === '\n') {
                pushRow();
            } else if (ch !== '\r') {
                cell += ch;
            }
        }
        if (cell !== '' || row.length) pushRow();
        return rows;
    }

    function buildHeaderMap(row) {
        var normalized = row.map(normalizeHeader);
        var map = {};
        Object.keys(HEADER_ALIASES).forEach(function (key) {
            var aliases = HEADER_ALIASES[key];
            for (var i = 0; i < normalized.length; i++) {
                if (aliases.indexOf(normalized[i]) !== -1) {
                    map[key] = i;
                    break;
                }
            }
        });
        return map;
    }

    function isAxHeader(map) {
        return map.po !== undefined &&
            map.itemNumber !== undefined &&
            map.quantity !== undefined &&
            map.warehouse !== undefined &&
            map.lineNo !== undefined;
    }

    function findAxHeader(rows) {
        for (var i = 0; i < Math.min(rows.length, 12); i++) {
            var map = buildHeaderMap(rows[i]);
            if (isAxHeader(map)) return { index: i, map: map };
        }
        return null;
    }

    function valueAt(row, map, key) {
        return map[key] === undefined ? '' : cleanCell(row[map[key]]);
    }

    function parseNumber(value) {
        var raw = cleanCell(value).replace(/,/g, '').replace(/\s+/g, '');
        if (!raw) return null;
        var negative = /^\(.*\)$/.test(raw);
        if (negative) raw = raw.slice(1, -1);
        var number = Number(raw);
        if (!Number.isFinite(number)) return null;
        return negative ? -number : number;
    }

    function normalizeKeyPart(value) {
        return cleanCell(value).toUpperCase().replace(/\s+/g, ' ');
    }

    function normalizeLineNo(value) {
        var raw = cleanCell(value);
        if (!raw) return '';
        var number = Number(raw.replace(/,/g, ''));
        return Number.isFinite(number) ? String(number) : normalizeKeyPart(raw);
    }

    function normalizeNumberKey(value) {
        var raw = cleanCell(value).replace(/,/g, '');
        if (!raw) return '-';
        var number = Number(raw);
        return Number.isFinite(number) ? String(number) : normalizeKeyPart(raw);
    }

    // AX สามารถแยก Line No เดียวกันออกเป็นหลาย Location/จำนวนได้
    // จึงต้องใช้รายละเอียดของแถวร่วมกัน ไม่เช่นนั้นยอดจะหายเหลือแค่แถวแรกของ Line
    function makeAxImportKey(warehouse, po, lineNo, itemCode, location, batch, quantity) {
        var wh = normalizeKeyPart(warehouse);
        var order = normalizeKeyPart(po);
        var line = normalizeLineNo(lineNo);
        var item = normalizeKeyPart(itemCode);
        var loc = normalizeKeyPart(location) || '-';
        var lot = normalizeKeyPart(batch) || '-';
        var qty = normalizeNumberKey(quantity);
        return wh && order && line && item ? ['AX2', wh, order, line, item, loc, lot, qty].join('|') : '';
    }

    function importKeyFromExisting(item) {
        if (!item) return '';
        var storedKey = cleanCell(item.axImportKey).toUpperCase();
        if (storedKey.indexOf('AX2|') === 0) return storedKey;
        // รองรับข้อมูลที่นำเข้าด้วย v5.11.5 ซึ่งเก็บคีย์แบบ AX|WH|PO|LINE
        // โดยสร้างคีย์ละเอียดจากข้อมูลจริงบนการ์ด เพื่อให้วางซ้ำแล้วเติมเฉพาะแถวที่ขาด
        return makeAxImportKey(
            item.axWarehouse || item.warehouse,
            item.po,
            item.axLineNo !== undefined ? item.axLineNo : item.lineNo,
            item.axExternalItemNumber || item.code || item.comp,
            item.oldLoc,
            item.batch,
            item.qty
        );
    }

    function existingKeySet(items) {
        var keys = new Set();
        (items || []).forEach(function (item) {
            var key = importKeyFromExisting(item);
            if (key) keys.add(key);
        });
        return keys;
    }

    function uniqueValues(items, key) {
        return Array.from(new Set(items.map(function (item) { return cleanCell(item[key]); }).filter(Boolean)));
    }

    function parseAxRows(rows, header, existingItems) {
        var parsed = [];
        var invalidRows = [];
        var duplicateRows = [];
        var warnings = [];
        var map = header.map;

        for (var i = header.index + 1; i < rows.length; i++) {
            var row = rows[i];
            var repeatedHeader = buildHeaderMap(row);
            if (isAxHeader(repeatedHeader)) continue;

            var warehouse = valueAt(row, map, 'warehouse');
            var lineNo = valueAt(row, map, 'lineNo');
            var po = valueAt(row, map, 'po');
            var itemNumber = valueAt(row, map, 'itemNumber');
            var externalItemNumber = valueAt(row, map, 'externalItemNumber');
            var text = valueAt(row, map, 'text') || valueAt(row, map, 'engName');
            var rawQty = valueAt(row, map, 'quantity');
            var qty = parseNumber(rawQty);
            var rawQtyOnhand = valueAt(row, map, 'qtyOnhand');
            var rawInventQty = valueAt(row, map, 'inventQty');
            // Business rule: On Hand is the stock currently available in AX.
            // Never fall back to InventQty/Quantity because those fields may be
            // the incoming purchase quantity rather than warehouse stock.
            var qtyOnhand = parseNumber(rawQtyOnhand);
            var qtyHand = qtyOnhand === null ? 0 : qtyOnhand;
            var code = externalItemNumber || itemNumber;
            var location = valueAt(row, map, 'location');
            var batchNumber = valueAt(row, map, 'batchNumber');
            var importKey = makeAxImportKey(warehouse, po, lineNo, code, location, batchNumber, qty);
            var missing = [];

            if (!warehouse) missing.push('Warehouse');
            if (!lineNo) missing.push('Line No');
            if (!po) missing.push('Purchase order');
            if (!itemNumber) missing.push('Item number');
            if (!code) missing.push('รหัสสินค้า');
            if (qty === null) missing.push('Quantity');
            if (!importKey) missing.push('รหัสอ้างอิง AX');
            if (missing.length) {
                invalidRows.push({ rowNumber: i + 1, reason: 'ข้อมูลไม่ครบ: ' + missing.join(', ') });
                continue;
            }

            if (!externalItemNumber) warnings.push({ rowNumber: i + 1, reason: 'External item number ว่าง จึงใช้ Item number เป็นรหัสหลัก' });

            parsed.push({
                format: 'AX',
                warehouse: warehouse,
                lineNo: lineNo,
                autoLocation: valueAt(row, map, 'autoLocation'),
                po: po,
                comp: itemNumber,
                code: code,
                externalItemNumber: externalItemNumber,
                desc: text || '-',
                qty: qty,
                oldLoc: location || '-',
                batch: batchNumber,
                qtyHand: qtyHand,
                qtyOnhand: qtyOnhand,
                inventQty: parseNumber(rawInventQty),
                qtyHandFrom: rawQtyOnhand !== '' ? 'Qty Onhand' : 'Qty Onhand (blank = 0)',
                itemClass: valueAt(row, map, 'itemClass'),
                engName: valueAt(row, map, 'engName'),
                unit: valueAt(row, map, 'unit'),
                inventUnit: valueAt(row, map, 'inventUnit'),
                site: valueAt(row, map, 'site'),
                batchNumberGroup: valueAt(row, map, 'batchNumberGroup'),
                itemOpenBoxType: valueAt(row, map, 'itemOpenBoxType'),
                importKey: importKey,
                sourceRow: i + 1
            });
        }

        return {
            format: 'AX',
            items: parsed,
            invalidRows: invalidRows,
            duplicateRows: duplicateRows,
            warnings: warnings,
            warehouses: uniqueValues(parsed, 'warehouse'),
            purchaseOrders: uniqueValues(parsed, 'po'),
            totalDataRows: Math.max(0, rows.length - header.index - 1)
        };
    }

    function looksLikeLegacyHeader(row) {
        var first = normalizeHeader(row[0]);
        return first.indexOf('purchase') !== -1 || first === 'po' || first.indexOf('order') !== -1;
    }

    function parseLegacyRows(rows) {
        var parsed = [];
        var invalidRows = [];
        rows.forEach(function (row, index) {
            if (index === 0 && looksLikeLegacyHeader(row)) return;
            var qty = parseNumber(row[4]);
            var qtyHand = parseNumber(row[7]);
            var po = cleanCell(row[0]);
            var comp = cleanCell(row[1]);
            var code = cleanCell(row[2]);
            if (row.length < 5 || !po || !code || qty === null) {
                invalidRows.push({ rowNumber: index + 1, reason: 'รูปแบบเดิมต้องมี PO, รหัสสินค้า และ Quantity' });
                return;
            }
            parsed.push({
                format: 'LEGACY',
                warehouse: '',
                lineNo: '',
                po: po,
                comp: comp || '-',
                code: code,
                desc: cleanCell(row[3]).replace(/^"|"$/g, '') || '-',
                qty: qty,
                oldLoc: cleanCell(row[5]) || '-',
                batch: cleanCell(row[6]),
                qtyHand: qtyHand === null ? 0 : qtyHand,
                importKey: '',
                sourceRow: index + 1
            });
        });
        return {
            format: 'LEGACY',
            items: parsed,
            invalidRows: invalidRows,
            duplicateRows: [],
            warnings: [],
            warehouses: [],
            purchaseOrders: uniqueValues(parsed, 'po'),
            totalDataRows: rows.length - (rows.length && looksLikeLegacyHeader(rows[0]) ? 1 : 0)
        };
    }

    function parse(text, options) {
        var rows = parseTsv(text);
        if (!rows.length) {
            return { format: 'UNKNOWN', items: [], invalidRows: [], duplicateRows: [], warnings: [], warehouses: [], purchaseOrders: [], totalDataRows: 0 };
        }
        var header = findAxHeader(rows);
        return header ? parseAxRows(rows, header, (options || {}).existingItems || []) : parseLegacyRows(rows);
    }

    return {
        parse: parse,
        parseTsv: parseTsv,
        normalizeHeader: normalizeHeader,
        makeAxImportKey: makeAxImportKey,
        existingKeySet: existingKeySet,
        importKeyFromExisting: importKeyFromExisting
    };
});
