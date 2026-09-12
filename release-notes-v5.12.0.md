# PLAS WMS v5.12.0 — PLAS Quest Bridge

## สิ่งที่เพิ่ม

- เพิ่มปุ่ม **PLAS Quest** ใน QuickHub สำหรับพนักงานทุกบทบาท
- เปิดเกมด้วยตั๋วอายุ 90 วินาทีและใช้ได้ครั้งเดียว ไม่ส่ง PIN หรือ Secret ไปใน URL
- สร้างบัญชีเกมจากตัวตน PLAS โดยอัตโนมัติหลังยืนยัน User/PIN
- คิวเหตุการณ์งานจริงจาก Academy League และส่งแบบตรวจสอบ Event ID ฝั่ง Server
- งานจริงที่นับเข้าระบบเกม: Written, Receiving, Move, Top Location, Top Up และ Issue ที่แก้สำเร็จ
- ปรับ QuickHub บนมือถือเป็นรายการแนวตั้ง เพื่อรองรับเมนูเพิ่มโดยไม่ให้ปุ่มซ้อนกัน

## Environment Variables ใหม่ในเว็บ PLAS WMS

- `GAME_PUBLIC_URL`
- `PLAS_GAME_BRIDGE_SECRET`
- `PLAS_GAME_EVENT_SECRET`
- `GAME_EVENT_INGEST_URL` (ไม่บังคับ)
- `PLAS_GAME_ALLOW_NO_PIN` (ไม่บังคับ ค่าเริ่มต้น `true`)

ค่า `PLAS_GAME_BRIDGE_SECRET` และ `PLAS_GAME_EVENT_SECRET` ต้องตรงกับฝั่งแอป PLAS Quest แต่ต้องเป็นคนละค่ากัน
