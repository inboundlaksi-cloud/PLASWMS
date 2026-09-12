# PLAS WMS v4.9.3 — F-Zone All Accounts Bridge Fix

## เป้าหมาย
ให้บัญชีที่ระบุตัวบุคคลใน PLAS WMS เชื่อมเข้า BORNEO F-Zone ได้ ไม่จำกัดเฉพาะ Supervisor

## รองรับ
- User / Writer
- Admin
- Supervisor
- ผู้ใช้ที่มีหลายบทบาท โดยส่งบทบาทที่เลือกเข้า Bridge

## พฤติกรรม
- หลัง PIN ของบัญชี PLAS ผ่าน ระบบสร้าง `fzone-session` สำหรับทุกบทบาท
- หาก Login สำเร็จแต่ Session ไม่ถูกสร้าง เมื่อกด F-Zone ระบบขอ PIN PLAS อีกครั้งแล้วสร้าง Session ให้ทันที
- ไม่ส่ง PIN ใน URL
- Worker ต้องเปิดสิทธิ์ `fzoneMove` ใน PLAS
- Admin และ Supervisor ได้สิทธิ์เปิด Bridge ตามกฎเดิม
- บัญชีที่ไม่มี PIN ยังเข้า PLAS ได้ตาม Flow เดิม แต่ไม่สามารถ Auto Login เข้า F-Zone จนกว่า Master Admin จะตั้ง PIN

## Cache version
- `script.js?v=4.9.3-all-accounts-bridge-fix`
- `fzone-bridge.js?v=2.0.3-all-accounts`
- Service Worker cache: `plas-wms-v4.9.3-all-accounts-bridge-fix`
