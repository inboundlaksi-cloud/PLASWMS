# PLAS WMS v5.0.0

- เชื่อมงาน TopUp กับสินค้าใน BORNEO F-Zone ผ่าน API ที่เซ็นลายเซ็นฝั่ง server
- แนะนำทุกพาเลทที่ ITEM หลัก, ITEM รอง หรือชื่อตรงกัน พร้อม Zone และจุดวาง
- พนักงานเลือก Pallet ID เอง และระบบยอมรับเฉพาะยอดรวมที่ตรงกับงาน
- ล็อกพาเลท 15 นาที ป้องกันผู้ใช้สองคนเลือกของชุดเดียวกัน
- จบงาน PLAS และ TOP ออกจาก F-Zone เป็น workflow เดียว พร้อมป้องกันการตัดซ้ำ
- เปิดตำแหน่งสินค้าบนแผนผัง F-Zone ได้จากการ์ดพาเลท
- UI ใหม่แบบ Operational Calm: พื้นหลังพาสเทล, การ์ดข้อมูลเป็นลำดับ,
  ปุ่มสัมผัสง่าย, dialog สำหรับงานจริง และ responsive
- ใช้ฟอนต์และ Phosphor Icons แบบ local พร้อม compiled Tailwind แทน Play CDN
- เพิ่ม PWA cache, security headers และชุดทดสอบ integration
