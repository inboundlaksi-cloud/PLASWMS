# PLAS WMS v5.12.1 — PLAS Quest แบบไม่เพิ่ม Secret

## แก้ข้อจำกัด Netlify

- PLAS Quest ใช้ `PLAS_BRIDGE_SECRET` เดิมของ PLAS WMS
- แตกกุญแจสำหรับตั๋วเข้าเกมและการส่งเหตุการณ์งานคนละวัตถุประสงค์อัตโนมัติ
- ไม่ต้องเพิ่ม `PLAS_GAME_BRIDGE_SECRET` หรือ `PLAS_GAME_EVENT_SECRET` ในเว็บ PLAS
- ยังรองรับ Secret แยกแบบ optional override สำหรับการหมุนกุญแจในอนาคต

## ค่าที่ต้องตั้ง

ฝั่ง PLAS WMS ไม่ต้องเพิ่ม Secret ใหม่ ส่วนเว็บเกมแยกให้ตั้งเพียง:

- `GAME_FIREBASE_SERVICE_ACCOUNT_JSON`
- `PLAS_BRIDGE_SECRET` — ค่าเดียวกับที่ใช้อยู่ใน PLAS WMS

หาก URL เกมไม่ใช่ `https://borneo-plas-quest.netlify.app/` ให้ตั้ง `GAME_PUBLIC_URL` หรือแก้ URL คงที่ก่อน Deploy
