# Deploy PLAS WMS v5.7.0

1. อัปโหลดไฟล์ทั้งหมดจากโฟลเดอร์นี้แทนชุดเดิม
2. ตรวจว่าไฟล์ใหม่ถูกอัปโหลดครบ:
   - `label-print-workflow.js`
   - `label-print-workflow.css`
   - `topup-production-v570.js`
   - `topup-production-v570.css`
3. รีเฟรชแบบล้างแคช หรือปิด/เปิดแอปใหม่หนึ่งครั้ง
4. ตรวจ Console ให้พบ `PLAS_WMS_V5.7.0_COMPLETE_PRINT_WORKFLOW_ACTIVE`
5. ทดสอบ QuickHub > ปริ้นป้าย: พิมพ์หนึ่งรอบ, ดูสถานะรอยืนยัน, ยืนยันรอบล่าสุด
6. ทดสอบ QuickHub > พิมพ์สติกเกอร์ TOPUP: Import ตัวอย่าง, พิมพ์ใบคุมแนวตั้ง, พิมพ์สติกเกอร์

Service Worker ใช้ cache ใหม่ `plas-wms-v5.7.0-complete-print-workflow` และจะล้าง cache รุ่นเก่าเมื่อ activate.
