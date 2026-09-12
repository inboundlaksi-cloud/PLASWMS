# Deploy PLAS WMS v5.4.0

1. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้แทนชุดเดิมบน Netlify
2. ตรวจว่าไฟล์ใหม่ถูกอัปโหลดครบ:
   - `topup-sticker-printer.js`
   - `topup-sticker-printer.css`
3. หลัง Deploy ให้เปิดเว็บหนึ่งครั้งและรีเฟรช เพื่อให้ Service Worker เปลี่ยน cache เป็น v5.4.0
4. ทดสอบ Quick Hub > `พิมพ์สติกเกอร์ TOPUP`
5. Import ไฟล์ `.TXT` ตัวอย่าง แล้วตรวจเลข TFOR, เส้นทางสาขา และจำนวนรายการ
6. ทดสอบพิมพ์โดยตั้ง Scale 100% และปิด Header/Footer ของเบราว์เซอร์
