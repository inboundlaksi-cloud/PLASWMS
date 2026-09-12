# PLAS WMS v4.9.4 — F-Zone No-PIN Bridge

- บัญชี Writer, Admin และ Supervisor ที่มี PIN ใช้ Bridge แบบตรวจ PIN เหมือนเดิม
- บัญชี PLAS ที่ไม่ได้ตั้ง PIN สามารถสร้าง F-Zone session หลังเลือกชื่อและบทบาทได้
- ไม่สร้างหรือบันทึก “PIN หลอก” ลงฐานข้อมูล
- บัญชีต้องมีสิทธิ์ fzoneMove หรือเป็น Admin/Supervisor จึงเปิด F-Zone ได้
- สามารถปิดโหมดบัญชีไม่มี PIN ภายหลังด้วย PLAS_BRIDGE_ALLOW_NO_PIN=false
- อัปเดต Service Worker cache เป็น v4.9.4
