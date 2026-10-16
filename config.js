/* ══════════════════════════════════════════════════════════════════════════
   config.js — ไฟล์เดียวที่ต้องแก้ตอนติดตั้ง (บรรทัดเดียว)

   GAS_URL ไม่ใช่ความลับ — ความปลอดภัยอยู่ที่การล็อกอินด้วยชื่อผู้ใช้/รหัสผ่านฝั่ง Apps Script
   (ใครรู้ URL นี้ก็เปิดหน้าล็อกอินได้ แต่ไม่มีบัญชีก็ดูหรือแก้อะไรไม่ได้)
   ══════════════════════════════════════════════════════════════════════════ */

window.APP_CONFIG = {

  /** URL ของ Web App ที่ deploy จาก Apps Script (ลงท้ายด้วย /exec) */
  GAS_URL: 'https://script.google.com/macros/s/AKfycbw5C-uCQ0D-9EXexQ_GZXIz5t_HFtgepH-fdGUEcZqubDwi_eiiG04IB-dRURoImQlAnQ/exec',

  /** ชื่อที่แสดงบนหน้าจอ */
  APP_NAME: 'Lab Stock',

  /** รูปจาก Google Drive — {id} = รหัสไฟล์, {w} = ความกว้างที่ขอ */
  PHOTO_URL: 'https://lh3.googleusercontent.com/d/{id}=w{w}',
  PHOTO_FALLBACK_URL: 'https://drive.google.com/thumbnail?id={id}&sz=w{w}',

  /** จำนวนแถวที่แสดงต่อครั้งในตาราง */
  PAGE_SIZE: 100,

  /** เตือนล่วงหน้ากี่วันก่อนหมดอายุ */
  EXPIRE_WARN_DAYS: 90,

  /** ขนาดรูปหลังย่อ (ด้านยาวสุด, พิกเซล) */
  PHOTO_MAX_SIDE_PLACE: 1600,
  PHOTO_MAX_SIDE_ITEM: 1100
};
