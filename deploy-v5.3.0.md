# วิธีอัปเดต PLAS WMS v5.3.0 ร่วมกับ BORNEO F-ZONE v3.4.0

วันที่จัดทำ: 1 สิงหาคม 2026

> F-ZONE และ PLAS ใช้ Firebase คนละ Project การเปลี่ยน Pallet ID จึงต้องรัน Migration สองฝั่งใน Maintenance Window เดียวกัน

## 1. ก่อนเริ่ม

1. สำรอง Firestore ของ F-ZONE และ PLAS แยกกัน
2. เก็บ ZIP เวอร์ชันเดิมของทั้งสองระบบ
3. ปิดการใช้งานชั่วคราว ห้ามสร้างพาเลท ย้ายสินค้า หรือทำ TOPUP ระหว่าง Migration
4. ตรวจ Environment ของ PLAS ให้มี `PLAS_FIREBASE_SERVICE_ACCOUNT_JSON`
5. ตรวจ Environment ฝั่ง F-ZONE ตามเอกสาร `DEPLOY-v3.4.0.md`

## 2. รัน F-ZONE Pallet ID Dry Run

ในโฟลเดอร์ F-ZONE v3.4.0:

```bash
npm ci --omit=dev --ignore-scripts
npm run migrate:pallet-ids
```

ตรวจไฟล์ที่สร้างใน `migration-output/` โดยเฉพาะ:

- `pallet-id-mapping-*.json`
- `pallet-id-mapping-*.csv`
- `pre-migration-backup-*.json`

## 3. รัน PLAS Reference Dry Run

นำ path ของ Mapping JSON จากขั้นตอนก่อนมาใช้:

```bash
npm ci --omit=dev --ignore-scripts
npm run migrate:fzone-pallet-refs -- --mapping=/absolute/path/to/pallet-id-mapping-....json
```

สคริปต์จะสแกน Root Collections ทั้งหมดใน Firebase PLAS และแก้เฉพาะข้อความ `FZP-...` ที่ตรงกับ Mapping จึงครอบคลุมงาน TOPUP, Move, History, Archive และข้อมูลอ้างอิงอื่นที่อาจซ้อนอยู่ใน Object/Array

Dry Run จะสร้างไฟล์ `migration-output/plas-fzone-ref-backup-*.json` ซึ่งมีเฉพาะเอกสารที่ต้องแก้ พร้อม Before/After

## 4. Deploy โค้ดทั้งสองระบบ

1. Deploy BORNEO F-ZONE v3.4.0
2. Deploy PLAS WMS v5.3.0
3. ยังไม่เปิดให้ผู้ใช้ทำงาน

## 5. รัน F-ZONE Migration จริง

```bash
PALLET_ID_MIGRATION_CONFIRM=YES npm run migrate:pallet-ids -- --apply
npm run verify:pallet-ids
```

## 6. รัน PLAS Reference Migration จริง

```bash
PLAS_FZONE_REF_MIGRATION_CONFIRM=YES npm run migrate:fzone-pallet-refs -- --mapping=/absolute/path/to/pallet-id-mapping-....json --apply
npm run verify:fzone-pallet-refs -- --mapping=/absolute/path/to/pallet-id-mapping-....json
```

หาก Dry Run รายงาน `Unknown legacy tokens` ให้ตรวจว่าเป็น FZP ที่ถูกลบจาก F-ZONE มาก่อนหรือไม่ ห้ามเดาเลขใหม่เอง

## 7. ทดสอบก่อนเปิดใช้งาน

1. Login PLAS แล้วเปิด F-ZONE ผ่าน QuickHub
2. ทดสอบ Deep Link `/p/YYMMDD-######`
3. รับงาน TOPUP และตรวจว่าพาเลทที่เสนอใช้ ID ใหม่
4. แจ้งปัญหา TOPUP จากเครื่องพนักงาน และตรวจหน้า Admin อีกเครื่อง
5. แก้ Location/ยกเลิก/ส่งกลับคิว แล้วตรวจ Audit
6. ทดสอบสถานะ ยังไม่รับ / กำลังทำ / รอแก้ปัญหา / เสร็จแล้ว / ยกเลิก
7. ทดสอบเครื่องคิดเลขลอย: สมการว่าง ทศนิยมซ้ำ หารศูนย์ และ Backspace
8. ตรวจ History และ Archive ที่เคยมี FZP ว่าแสดง ID ใหม่

## 8. Cache

- ปิดแท็บเดิมแล้วเปิดใหม่
- Hard refresh หนึ่งครั้งบนเครื่อง Admin และพนักงาน
- iPhone/iPad ให้ปิด Safari จาก App Switcher หากยังเห็นหน้าเก่า
- Service Worker v5.3.0 จะเปลี่ยน Cache namespace

## Rollback

หาก Verification ฝั่งใดไม่ผ่าน:

1. ปิดระบบต่อทันที
2. เก็บไฟล์ใน `migration-output/` และ Log ทั้งหมด
3. คืน Firestore ของ F-ZONE และ PLAS จาก Backup ก่อน Migrationทั้งคู่
4. Deploy ZIP รุ่นเดิมทั้งสองระบบ
5. ตรวจ active TOPUP jobs, reservations, pallets และ placements ก่อนเปิดใช้งาน

อย่า Rollback เพียงระบบเดียว เพราะ Pallet ID จะไม่ตรงกันข้าม Project
