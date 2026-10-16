/* ══════════════════════════════════════════════════════════════════════════
   pages/import.js — นำเข้ารายการจากไฟล์ CSV (เฉพาะ Admin)
   ขั้นตอน: เลือกไฟล์ → ตรวจ (ยังไม่บันทึก) → ยืนยันนำเข้า
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../api.js';
import { sync } from '../data.js';
import { $, esc, icon, toast, run, confirmBox, fmtNum } from '../ui.js';

export const TEMPLATE_HEADER = ['kind', 'name', 'nameEn', 'brand', 'model', 'cas', 'grade', 'category', 'unit', 'qty',
  'place', 'label', 'receiveDate', 'expireDate', 'supplier', 'fiscalYear', 'price', 'notes', 'reorderPoint', 'hazard', 'storage'];
const TEMPLATE_ROWS = [
  ['สารเคมี', 'เอทานอล 95%', 'Ethanol', 'RCI Labscan', '', '64-17-5', 'AR', 'ตัวทำละลาย', 'mL', '2500',
    'ห้องแลป › ตู้เก็บสารไวไฟ › ชั้น 1', 'LOT-A123', '2026-01-15', '2028-01-15', 'ร้านเคมีภัณฑ์', '2569', '850', '', '1000', 'ไวไฟ', 'เก็บห่างความร้อน'],
  ['วัสดุ', 'ปลายไปเปตต์ 1000 µL', '', 'Eppendorf', '', '', '', 'พลาสติก', 'กล่อง', '5',
    'ห้องแลป › ตู้เก็บของใช้ › ชั้น 2', '', '2026-02-01', '', '', '2569', '420', '', '2', '', ''],
  ['เครื่องมือ', 'เครื่องชั่งละเอียด 4 ตำแหน่ง', '', 'Mettler Toledo', 'ME204', '', '', 'เครื่องชั่ง', 'เครื่อง', '1',
    'ห้องแลป › โต๊ะชั่ง', 'SN-12345', '2025-06-10', '', '', '2568', '68000', '', '', '', '']
];

export function mount(root) {
  let csv = '', fileName = '', prev = null;

  function draw() {
    root.innerHTML = `
      <div class="page-head"><div><h1>นำเข้าจาก CSV</h1>
        <p class="muted">เหมาะกับการย้ายรายการเก่าจาก Excel เข้ามาทีเดียว · ระบบตรวจก่อน ยังไม่บันทึกจนกว่าจะกดยืนยัน</p></div>
        <div class="head-acts"><button class="btn btn-ghost" id="tpl">${icon.download} ดาวน์โหลดไฟล์ตัวอย่าง</button></div></div>
      <div class="panel">
        <div class="field"><label>1. เลือกไฟล์ CSV (UTF-8)</label>
          <input type="file" id="file" accept=".csv,text/csv">
          <div class="hint">ต้องมีหัวตารางอย่างน้อย <code>kind</code> และ <code>name</code> · ที่เก็บเขียนเป็นเส้นทาง เช่น <code>ห้องแลป › ตู้ A › ชั้น 2</code>
            · เครื่องมือที่ใส่ qty = N จะสร้าง N ชิ้น</div></div>
        <label class="check"><input type="checkbox" id="mk" checked> สร้างห้อง/ตู้/ชั้นที่ยังไม่มีในระบบให้อัตโนมัติ</label>
        <div class="row-gap"><button class="btn" id="chk" ${csv ? '' : 'disabled'}>2. ตรวจไฟล์${fileName ? ' · ' + esc(fileName) : ''}</button></div>
      </div>
      <div id="out">${prev ? result() : ''}</div>`;
  }

  function result() {
    const s = prev.stats;
    const lvl = { error: 'tag-risk', warning: 'tag-warn' };
    return `
      <div class="panel">
        <h2>ผลการตรวจ</h2>
        <div class="stat-row">
          <div><b>${fmtNum(s.rows)}</b><span>แถวในไฟล์</span></div>
          <div><b>${fmtNum(s.units)}</b><span>ขวด/ชิ้นที่จะนำเข้า</span></div>
          <div><b>${fmtNum(s.itemsNew)}</b><span>ของชนิดใหม่</span></div>
          <div><b>${fmtNum(s.itemsExisting)}</b><span>ใช้ชนิดที่มีอยู่</span></div>
          <div><b>${fmtNum(s.placesNew)}</b><span>ที่เก็บใหม่</span></div>
          <div class="${s.error ? 'bad' : ''}"><b>${fmtNum(s.error)}</b><span>ผิดพลาด (ข้าม)</span></div>
          <div><b>${fmtNum(s.skipped)}</b><span>ซ้ำ (ข้าม)</span></div>
        </div>
        ${prev.newPlaces.length ? `<p class="muted"><b>ที่เก็บที่จะสร้าง:</b> ${prev.newPlaces.map(esc).join(' · ')}</p>` : ''}
        ${prev.sample.length ? `<details><summary>ตัวอย่างรายการที่จะนำเข้า</summary>
          <ul class="plain">${prev.sample.map(x => `<li>แถว ${x.line}: ${esc(x.item)} × ${esc(x.qty)}${x.label ? ' (' + esc(x.label) + ')' : ''}</li>`).join('')}</ul></details>` : ''}
        ${prev.issues.length ? `<details ${s.error ? 'open' : ''}><summary>ข้อสังเกต ${prev.issuesTotal} รายการ</summary>
          <ul class="plain">${prev.issues.map(i => `<li><span class="tag ${lvl[i.level] || ''}">${i.level === 'error' ? 'ผิดพลาด' : 'เตือน'}</span> แถว ${i.line}: ${esc(i.message)}</li>`).join('')}</ul></details>` : ''}
        <div class="row-gap">
          <button class="btn" id="go" ${s.units ? '' : 'disabled'}>3. ยืนยันนำเข้า ${fmtNum(s.units)} รายการ</button>
          ${s.error ? '<span class="muted">แถวที่ผิดพลาดจะถูกข้าม</span>' : ''}
        </div>
      </div>`;
  }

  root.addEventListener('change', e => {
    if (e.target.id === 'file') {
      const f = e.target.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => { csv = String(fr.result || '').replace(/^﻿/, ''); fileName = f.name; prev = null; draw(); };
      fr.onerror = () => toast('อ่านไฟล์ไม่ได้', 'risk');
      fr.readAsText(f, 'utf-8');
    }
    if (e.target.id === 'mk') prev = null, $('#out', root).innerHTML = '';
  });

  root.addEventListener('click', async e => {
    if (e.target.closest('#tpl')) {
      const { downloadCsv } = await import('../ui.js');
      return downloadCsv('labstock-import-template.csv', TEMPLATE_HEADER, TEMPLATE_ROWS);
    }
    const chk = e.target.closest('#chk');
    if (chk) {
      const mk = $('#mk', root).checked;
      const r = await run(chk, () => api.importPreview(csv, mk));
      if (r.ok) { prev = r.value; draw(); $('#mk', root).checked = mk; }
      return;
    }
    const go = e.target.closest('#go');
    if (go) {
      const mk = $('#mk', root).checked;
      if (!(await confirmBox({ title: 'ยืนยันนำเข้า?', message: `จะเพิ่ม ${fmtNum(prev.stats.units)} ขวด/ชิ้น เข้าระบบ\n(แก้ไขทีหลังได้ทีละรายการ แต่ไม่มีปุ่มยกเลิกทั้งชุด)`, okText: 'นำเข้าเลย' }))) return;
      const r = await run(go, () => api.importCommit(csv, mk));
      if (r.ok) {
        const v = r.value;
        toast(`นำเข้าแล้ว ${v.units} ขวด/ชิ้น · ของใหม่ ${v.items} · ที่เก็บใหม่ ${v.places}`, 'ok');
        csv = ''; fileName = ''; prev = null; draw();
        try { await sync(true); } catch (err) { toast(err.message, 'risk'); }
        location.hash = '#/items';
      }
    }
  });

  draw();
  return () => {};
}
