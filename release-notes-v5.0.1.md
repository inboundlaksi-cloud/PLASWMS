# PLAS WMS v5.0.1

- แยก Netlify Functions ของ PLAS ไปที่ `netlify/plas-functions`
- Netlify bundle เฉพาะ Functions ของ PLAS ทั้ง 5 รายการ
- ป้องกันไฟล์ Function เก่าของ FZONE เช่น `_lib.js` ถูกนำมารวมจาก deployment workspace เดิม
- ยังคงชื่อ endpoint เดิม จึงไม่กระทบหน้าเว็บหรือ FZONE integration
