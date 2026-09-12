# PLAS WMS v5.13.0 — PLAS Quest Academy Settlement

## สิ่งที่เพิ่ม

- เพิ่ม Netlify Function `game-season-settlement` สำหรับรับ Reward Points จบซีซันจาก PLAS Quest
- ตรวจ HMAC ด้วย `PLAS_GAME_EVENT_SECRET` เดิม หรือกุญแจที่แตกจาก `PLAS_BRIDGE_SECRET` เดิม จึงไม่ต้องเพิ่ม Secret ใหม่
- กันส่งซ้ำด้วย `academyGameSettlements/{settlementId}` และ Event ID เฉพาะรายคน
- เพิ่มคะแนนเข้า `academyProfiles.rewardPoints` และเขียนประวัติ `academyEvents` หมวด `game_season`
- หน้า PLAS Academy League อธิบายแหล่งคะแนนจากเกมและแสดงรายการจบซีซันแยกอย่างชัดเจน
- คะแนนจากเกมไม่นำไปคำนวณ Performance, Quality, Diversity หรืออันดับผลงาน WMS

## ลำดับ Deploy

1. Deploy PLAS WMS v5.13.0 ไปยังเว็บ PLAS WMS
2. Deploy PLAS Quest v2.0.0 ไปยังเว็บเกม
3. ในศูนย์ควบคุมเกม ใส่ URL หลักของเว็บ PLAS WMS
4. เมื่อจบซีซัน ให้หยุดรับคะแนน สร้าง Preview และใช้บัญชี Admin ยืนยันส่ง

ไม่ต้องเปลี่ยน Firebase project และไม่ต้องเพิ่ม Environment Variable ใหม่
