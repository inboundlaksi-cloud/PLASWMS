# PLAS WMS v4.9.0 — BORNEO F-Zone Secure Bridge

PLAS WMS ชุดนี้ถูกปรับให้เป็นทางเข้า BORNEO F-Zone แบบแยกแอป โดยไม่ใช้ Firebase ของ PLAS เก็บข้อมูล F-Zone ชุดใหม่

## พฤติกรรมใหม่

- หลัง PLAS ตรวจ PIN สำเร็จ Browser จะขอ Bridge Session จาก Netlify Function
- เมื่อกด F-Zone ระบบขอ One-time Ticket อายุ 60 วินาที
- F-Zone แลก Ticket เป็น Firebase Custom Token ของ project `locationf-a46fc`
- Ticket ไม่มี PIN และใช้ซ้ำไม่ได้
- Legacy F-Zone Listener, Receiving Hook, Top Location Hook และการเขียน collection F-Zone ใน PLAS จะไม่เริ่มทำงานเมื่อ `fzone-bridge.js` โหลดสำเร็จ
- QuickHub และปุ่มค้นหา F-Zone จะเปิดเว็บไซต์แยกผ่าน Bridge

## Environment Variables ใน Netlify PLAS

```text
PLAS_FIREBASE_SERVICE_ACCOUNT_JSON=<Service Account JSON ของ Firebase PLAS>
PLAS_BRIDGE_SECRET=<สุ่มอย่างน้อย 32 ตัวอักษร และตรงกับ F-Zone>
FZONE_PUBLIC_URL=https://<โดเมน-FZONE-จริง>/
PLAS_ALLOWED_ORIGIN=https://<โดเมน-PLAS-จริง>
```

## การเปิดสิทธิ์รายคน

Bridge ตรวจข้อมูลปัจจุบันใน PLAS ทุกครั้งก่อนออก Ticket ผู้ใช้ได้รับอนุญาตเมื่อ:

- `users/main.userRoles.<username>.fzoneMove === true` หรือ
- `permissions.fzoneMove === true` หรือ
- เป็น PLAS Admin/Supervisor ตามโครงสร้างเดิม

สิทธิ์ Role, Floor Scope และ Permission ภายใน F-Zone จัดการแยกใน F-Zone

## Deploy

1. ตั้ง Environment Variables ให้ครบ
2. Deploy ไฟล์ชุดนี้ทับ Site PLAS เดิม
3. ตรวจว่า Netlify Functions สองตัวทำงาน:
   - `fzone-session`
   - `fzone-bridge-issue`
4. Hard refresh หรือถอน Service Worker เก่าหนึ่งครั้ง
5. Login PLAS ด้วย PIN แล้วกด F-Zone
6. ตรวจว่า URL F-Zone มี `ticket=` ชั่วคราวและถูกลบหลัง Login สำเร็จ

## TTL ที่ควรเปิดใน Firebase PLAS

ตั้ง TTL field `cleanupAt` สำหรับ collection:

- `fzone_bridge_attempts`

## ข้อจำกัดด้าน PIN เดิมของ PLAS

PLAS รุ่นปัจจุบันยังใช้โครงสร้าง PIN เดิมใน `profiles/user_profiles` ซึ่งเป็นข้อจำกัดของระบบเดิม Bridge ย้ายการตรวจ PIN ซ้ำไปฝั่ง Server และไม่ส่ง PIN ใน URL แต่ยังไม่ได้เปลี่ยนรูปแบบจัดเก็บ PIN ทั้งระบบ PLAS เป็น hash การย้าย PLAS Authentication ทั้งระบบควรเป็นโครงการแยก เพราะกระทบ Login และ Role เดิมทั้งหมด

## v4.9.3 All Accounts Bridge
บัญชี User/Writer, Admin และ Supervisor ใช้ Bridge ชุดเดียวกันทั้งหมด ไม่จำกัดเฉพาะ Supervisor

เงื่อนไข:
- บัญชีต้องเป็นชื่อบุคคลจริงใน PLAS
- ต้องมี PIN 4 หลักใน PLAS เพื่อให้ Server ตรวจสอบตัวตน
- User/Writer ต้องได้รับสิทธิ์ `fzoneMove`
- `PLAS_BRIDGE_SECRET` ฝั่ง PLAS และ F-Zone ต้องตรงกัน
