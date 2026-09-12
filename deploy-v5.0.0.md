# PLAS WMS v5.0.0 — Deployment

รุ่นนี้เพิ่มการเลือกพาเลท F-Zone จากงาน TopUp และปรับ UI แบบ Operational Calm
สำหรับ PC, Tablet และ Mobile

## ลำดับการ Deploy

1. Deploy BORNEO F-Zone v3.3.0 ก่อน
2. ตั้ง Environment Variables ของ F-Zone
3. Deploy PLAS WMS v5.0.0
4. ตั้ง Environment Variables ของ PLAS
5. Clear deploy cache แล้ว deploy production ทั้งสองระบบ
6. เปิด PLAS ด้วยบัญชีพนักงานจริงและทดสอบงาน TopUp หนึ่งรายการ

หาก Deploy ด้วย **Netlify Drop** ให้ใช้ไฟล์ที่ลงท้าย `netlify-build.zip`
เท่านั้น แพ็กเกจนี้มี build command ใน `netlify.toml` เพื่อให้ Netlify ติดตั้ง
production dependencies ด้วย `npm ci` ก่อน bundle Functions จึงไม่ต้องใส่
`node_modules` ใน ZIP และสามารถแตกไฟล์ด้วย Windows Explorer ได้

## Environment Variables ที่ต้องตรงกัน

สร้าง secret สองค่าแยกกัน โดยแต่ละค่าควรสุ่มอย่างน้อย 32 ตัวอักษร

| Variable | PLAS | F-Zone | หน้าที่ |
| --- | --- | --- | --- |
| `PLAS_BRIDGE_SECRET` | ค่าเดียวกัน | ค่าเดียวกัน | ออก one-time ticket เพื่อเปิด F-Zone |
| `PLAS_FZONE_SYNC_SECRET` | ค่าเดียวกัน | ค่าเดียวกัน | เซ็นคำขอค้นหา/จอง/TOP ระหว่าง server |

PLAS ต้องตั้ง `PLAS_FIREBASE_SERVICE_ACCOUNT_JSON`, `FZONE_PUBLIC_URL`,
`FZONE_SYNC_URL` และ `PLAS_ALLOWED_ORIGIN` ตาม `.env.example`

F-Zone ต้องตั้ง `FIREBASE_SERVICE_ACCOUNT_JSON`,
`FZONE_BRIDGE_DEFAULT_ROLE` และ `ALLOWED_ORIGIN` ตาม `.env.example`

## สิทธิ์พนักงาน

บัญชี Writer ที่ต้องใช้ F-Zone ต้องมีค่าใดค่าหนึ่ง:

- `users/main.userRoles.<username>.fzoneMove = true`
- `users/main.userRoles.<username>.permissions.fzoneMove = true`

Admin และ Supervisor ได้สิทธิ์เชื่อมต่ออยู่แล้ว

## Acceptance Test

ใช้ตัวอย่างงาน 144 ชิ้น และเตรียม 4 พาเลท พาเลทละ 72 ชิ้น:

1. PLAS แสดงป้าย “พบ 4 พาเลท · 288 ชิ้น”
2. กดป้ายแล้วเห็นจุดวางและ Pallet ID ทั้ง 4
3. เลือกพาเลทใดก็ได้ 2 พาเลท ยอดต้องเป็น 144
4. เลือก 1 หรือ 3 พาเลท ปุ่มยืนยันต้องใช้งานไม่ได้
5. กด “เปิดจุดบนแผนผัง” แล้ว F-Zone ต้องเปิด Zone/จุดที่ตรงกัน
6. ยืนยันจบงานแล้ว 2 พาเลทต้องออกจาก F-Zone
7. งาน PLAS ต้องเป็น Done และ Location ต้องตรงกับ `toLoc`
8. กดยืนยันซ้ำหรือ retry หลังอินเทอร์เน็ตสะดุด ยอดต้องไม่ถูกตัดซ้ำ
9. ตรวจรายการใน F-Zone > ศูนย์การพิมพ์ > รายงาน TOP Location

## Rollback

หากต้อง rollback ให้ย้อน PLAS ก่อน แล้วจึงย้อน F-Zone การนำ PLAS กลับรุ่นเดิมจะ
หยุดการ TOP อัตโนมัติ แต่ไม่ลบ movement/history ที่บันทึกสำเร็จไปแล้ว
