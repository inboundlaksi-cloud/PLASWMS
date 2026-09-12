# PLASWMS — PLAS Quest Online Warehouse Update

ชุดนี้คงระบบ PLASWMS และหลังบ้านเดิมทั้งหมด แก้เฉพาะ `plas-game-bridge.js` รุ่น 5.13.1 เพื่อเพิ่มหน้าจอโหลดแบบคลังสินค้าระหว่างออก Launch Ticket และเปิดเกม

- URL เกมยังเป็น `https://borneo-plas-quest.netlify.app/`
- ใช้ `game-plas-session` และ `game-launch-issue` เดิม
- ไม่เปลี่ยนบัญชี บทบาท PIN QuickHub หรือระบบส่งงาน
- ชื่อผู้เล่นและสิทธิ์จะถูกส่งไปยังเกมผ่าน Launch Ticket เดิม

ควร Deploy ชุดเกม PLAS Quest Online 8 ที่ Site เกมก่อน แล้วจึง Deploy ชุด PLASWMS นี้ เพื่อไม่ให้ผู้ใช้เปิดเกมเก่าระหว่างอัปเดต
