# Deploy PLAS WMS v5.3.2

การแก้ไขรอบนี้เป็น UI-only สำหรับหน้า TOPUP บนมือถือ

1. Deploy โฟลเดอร์ PLAS-WMS-v5.3.2 ทับไซต์ PLAS เดิม
2. ไม่ต้องแก้ Firebase Rules, Index หรือ Environment Variables
3. ปิดแท็บ/PWA เก่าทั้งหมดแล้วเปิดใหม่
4. ตรวจ Console ให้พบ `PLAS_WMS_V5.3.2_MOBILE_TOPUP_COMPACT_ACTIVE`
5. เปิดหน้า TOPUP บนมือถือ: หัวหน้าต้องเหลือหนึ่งแถว, สถิติอยู่ในแท็บ, และการ์ดงานแรกต้องเห็นเร็วขึ้น

Desktop และขั้นตอนรับ/จบงาน TOPUP ไม่เปลี่ยน
