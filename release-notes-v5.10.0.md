# PLAS WMS v5.10.0 — Supervisor Operations Center

## ภาพรวมการทำงานที่ตัดสินใจได้ทันที

- เปลี่ยนหน้า Supervisor เป็น Operations Center โทน Navy–Teal บนพื้นสว่าง ลดสีม่วงและขนาดตัวอักษรที่เล็กเกินไป
- Operations Pulse แสดงงานเปิด, กำลังทำ, เสร็จ, เกิน SLA, ติดปัญหา และ Clean completion
- Module health รวม Receiving, Top Up, Move, Print และ Note Wall ในหน้าเดียว

## Work Queue, Aging และ Exception Center

- Work Queue รวมงานทุกระบบ ค้นหาจากรหัสสินค้า, Location และชื่อพนักงาน
- เรียงลำดับ Issue, เกิน SLA และอายุงานให้อัตโนมัติ
- Backlog & Aging แบ่ง 5 ช่วงอายุงาน และปรับ SLA แยกระบบได้
- Exception Center รวม Issue, Rejected, Waiting Admin และงานเกิน SLA พร้อมระดับความรุนแรง

## ทีมและการส่งต่องาน

- Team Activity แสดงภาระงาน, งานเสร็จ, ปัญหา, งานเกิน SLA และกิจกรรมล่าสุดของแต่ละคน
- Shift Handover สรุปงานเปิด/เกิน SLA/ติดปัญหาให้อัตโนมัติ บันทึกผู้ส่ง/ผู้รับและพิมพ์ย้อนหลังได้
- ตั้งค่า SLA และประวัติ Handover บันทึกใน Firestore พร้อม local fallback
- รองรับ CSV export, keyboard focus, reduced motion และ mobile bottom navigation

## การตรวจสอบ

- Service worker cache: `plas-wms-v5.10.0-supervisor-operations-center`
- ทดสอบ syntax, integration, responsive CSS, ชุดทดสอบเดิม และ Impeccable UI detector
