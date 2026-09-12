# Deploy PLAS WMS v5.6.0

1. อัปโหลดไฟล์ทั้งหมดแทนเวอร์ชันเดิม
2. ตรวจว่า `topup-sticker-printer.js` และ `topup-sticker-printer.css` เป็น query version `5.6.0`
3. Hard refresh หนึ่งครั้งเพื่อเปลี่ยน Service Worker cache
4. เปิด Quick Hub > พิมพ์สติกเกอร์ TOPUP
5. Import ไฟล์ตัวอย่างและตรวจว่ารหัสคุมเริ่มจาก 01 และ ITEM เดียวกันอยู่ติดกัน
6. พิมพ์ใบคุมและสติกเกอร์ แล้วตรวจว่ารหัสคุมตรงกัน
