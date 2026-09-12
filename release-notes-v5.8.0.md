# PLAS WMS v5.8.0 — Academy League

## ระบบใหม่
- เปลี่ยนหน้า Rank เป็น **PLAS Academy League** พร้อม Leaderboard, Podium, กราฟ และโปรไฟล์พนักงานแบบตัวละคร
- เพิ่มตราแรงก์ธีมโรงเรียน 6 ระดับ: Hatchling, Little Explorers, School Scholars, Junior Aces, School Guards และ Apex Scholars
- เพิ่มซีซัน 3 เดือน พร้อม Season EXP และประวัติซีซันย้อนหลัง
- แยก Lifetime EXP, Season EXP, Reward Points และ Performance Score ออกจากกัน
- เพิ่ม Daily / Weekly Missions, Achievement และโบนัสงานหลากหลาย
- เพิ่ม Reward Shop, สต็อกรางวัล, คำขอแลก, อนุมัติ, ปฏิเสธพร้อมคืนแต้ม และยืนยันรับรางวัล
- เพิ่มระบบขีดความผิดพลาด 5 บาทต่อขีด พร้อมเหตุผล ประวัติ และยกเลิกขีดได้
- เพิ่มหน้าตั้งค่า EXP และ Reward Points ของแต่ละงาน

## งานที่เชื่อมคะแนนอัตโนมัติ
- รับทราบและปิดงาน Note Wall
- Written / เขียน Location
- Received / รับสินค้า
- Move
- Top Location
- Top Up
- ปิด Issue สินค้าและ Issue TOPUP
- พิมพ์ป้ายสินค้าครั้งแรก
- พิมพ์สติกเกอร์ TOPUP
- พิมพ์ใบคุม TOPUP
- ตรวจสอบข้อมูล Import TOPUP

## ความสมดุลและความปลอดภัย
- Soft Cap รายวันลดคะแนนงานชนิดเดียวเมื่อทำเกินช่วงที่กำหนด
- Performance Score ใช้ผลิตภาพ คุณภาพ ความหลากหลาย และความสม่ำเสมอ ไม่ใช่จำนวนงานดิบเพียงอย่างเดียว
- Event ID ป้องกันการกดซ้ำ พิมพ์ซ้ำ หรือ Retry เพื่อปั๊มคะแนน
- งานยกเลิกและ Reprint ไม่สร้างคะแนนใหม่
- รองรับซิงก์งานปัจจุบันและประวัติเดิมที่มีข้อมูลผู้ทำงาน
- ทุก EXP, แต้ม, การแลก และขีดมี Audit Trail ใน Firestore
