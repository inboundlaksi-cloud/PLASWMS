# Deploy PLAS WMS v5.8.0

1. สำรองเว็บชุดเดิมก่อนอัปโหลด
2. อัปโหลดไฟล์ทั้งหมดในชุด v5.8.0 ทับ Site เดิม
3. ปิดหน้าต่าง PLASWMS ทุกหน้าต่าง แล้วเปิดใหม่
4. กด `Ctrl + Shift + R` หนึ่งครั้งเพื่อโหลด Service Worker ชุดใหม่
5. เข้า Supervisor > Academy League และกด **ซิงก์งานปัจจุบัน** หากต้องการนำงานเดิมที่ยังอยู่ในระบบมาคำนวณ
6. ตรวจหน้า My Profile, Missions, Reward Shop และ Manage System

ระบบจะสร้าง Firestore collections ใหม่อัตโนมัติ:
`academyEvents`, `academyProfiles`, `academyRewards`, `academyRedemptions`, `academyPenalties`, `academyConfig`
