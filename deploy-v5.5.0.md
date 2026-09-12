# Deploy PLAS WMS v5.5.0

1. อัปโหลดไฟล์ทั้งหมดจาก ZIP แทนเวอร์ชันเดิม
2. ตรวจว่า `topup-sticker-printer.js` และ `topup-sticker-printer.css` ถูกอัปโหลด
3. เปิดเว็บและ Hard refresh หนึ่งครั้งเพื่อเปลี่ยน Service Worker cache เป็น v5.5.0
4. ทดสอบ Import TXT, แก้ LOC/QTY, มอบหมายพนักงาน, พิมพ์ใบคุม และพิมพ์สติกเกอร์
