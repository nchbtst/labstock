/* ══════════════════════════════════════════════════════════════════════════
   pages/account.js — ตั้งค่า: บัญชีของฉัน · รายการตัวเลือก · ข้อมูลในเครื่อง
   ══════════════════════════════════════════════════════════════════════════ */
import { api, getUser, can, setSession } from '../api.js';
import { M, sync, syncState, opts } from '../data.js';
import { $, esc, icon, toast, run, confirmBox, fmtDateTime, fmtNum } from '../ui.js';
import { ROLE_TH } from './users.js';

const LISTS = [
  ['ChemCategory', 'หมวดสารเคมี'], ['ConsCategory', 'หมวดวัสดุสิ้นเปลือง'], ['EquipCategory', 'หมวดเครื่องมือ'],
  ['Unit', 'หน่วยนับ'], ['Supplier', 'ผู้จำหน่าย'], ['Hazard', 'ความอันตราย'], ['Storage', 'การเก็บรักษา']
];

export function mount(root, params, ctx) {
  function draw() {
    const u = getUser() || {};
    const m = M();
    root.innerHTML = `
      <div class="page-head"><div><h1>ตั้งค่า</h1></div></div>

      <div class="panel">
        <h2>บัญชีของฉัน</h2>
        <p><b>${esc(u.name)}</b> <span class="mono muted">${esc(u.username)}</span> <span class="tag tag-mute">${esc(ROLE_TH[u.role] || u.role)}</span></p>
        <form id="pw" autocomplete="off" class="form-narrow">
          <div class="field"><label>รหัสผ่านเดิม</label><input name="oldPassword" type="password" autocomplete="current-password" required></div>
          <div class="row-2">
            <div class="field"><label>รหัสผ่านใหม่</label><input name="newPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="72"></div>
            <div class="field"><label>พิมพ์รหัสใหม่อีกครั้ง</label><input name="again" type="password" autocomplete="new-password" required></div>
          </div>
          <div class="hint">อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข · เปลี่ยนแล้วเครื่องอื่นที่ล็อกอินอยู่จะถูกออกจากระบบ</div>
          <div class="row-gap"><button class="btn" id="pw-ok">เปลี่ยนรหัสผ่าน</button>
            <button class="btn btn-ghost" type="button" id="out-all">${icon.out} ออกจากระบบทุกเครื่อง</button></div>
        </form>
      </div>

      ${can('staff') ? `<div class="panel"><h2>รายการตัวเลือก</h2>
        <p class="muted">ตัวเลือกที่ขึ้นในฟอร์มเพิ่มของ · ลบออกแล้วของเดิมที่ใช้ค่านี้ยังอยู่ครบ</p>
        ${LISTS.map(([t, label]) => `
          <div class="set-block" data-type="${t}"><h3>${label}</h3>
            <div class="chips">${opts(t).map(v => `<span class="chip chip-del">${esc(v)}<button data-rm="${esc(v)}" aria-label="ลบ ${esc(v)}">×</button></span>`).join('') || '<span class="muted">ยังไม่มี</span>'}</div>
            <form class="add-row" data-add="${t}"><input maxlength="80" placeholder="เพิ่ม${label}…" required><button class="btn btn-ghost btn-sm">${icon.plus} เพิ่ม</button></form>
          </div>`).join('')}
      </div>` : ''}

      <div class="panel">
        <h2>ข้อมูลในเครื่องนี้</h2>
        <p class="muted">${fmtNum(m.counts.items)} ชนิด · ${fmtNum(m.counts.units)} ขวด/ชิ้น · ${fmtNum(m.counts.places)} ที่เก็บ
          · ซิงก์ล่าสุด ${syncState.at ? esc(fmtDateTime(syncState.at)) : '—'}${syncState.offline ? ' (ออฟไลน์)' : ''}</p>
        <button class="btn btn-ghost" id="resync">${icon.sync} โหลดข้อมูลใหม่ทั้งหมด</button>
      </div>`;
  }

  root.addEventListener('submit', async e => {
    e.preventDefault();
    if (e.target.id === 'pw') {
      const f = e.target;
      if (f.newPassword.value !== f.again.value) return toast('รหัสผ่านใหม่สองช่องไม่ตรงกัน', 'risk');
      const r = await run($('#pw-ok', root), () => api.changePassword(f.oldPassword.value, f.newPassword.value), 'เปลี่ยนรหัสผ่านแล้ว');
      if (r.ok) { setSession(r.value.session, r.value.user); f.reset(); }
      return;
    }
    const type = e.target.dataset.add;
    if (type) {
      const inp = e.target.querySelector('input');
      const r = await run(null, () => api.settingsAdd(type, inp.value.trim()), 'เพิ่มแล้ว');
      if (r.ok) { try { await sync(true); } catch (err) { toast(err.message, 'risk'); } draw(); }
    }
  });

  root.addEventListener('click', async e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      const type = rm.closest('[data-type]').dataset.type;
      const r = await run(null, () => api.settingsRemove(type, rm.dataset.rm), 'ลบตัวเลือกแล้ว');
      if (r.ok) { try { await sync(true); } catch (err) { toast(err.message, 'risk'); } draw(); }
      return;
    }
    if (e.target.closest('#out-all')) {
      if (!(await confirmBox({ title: 'ออกจากระบบทุกเครื่อง?', message: 'ทุกเครื่องรวมทั้งเครื่องนี้จะต้องล็อกอินใหม่', okText: 'ออกจากระบบ' }))) return;
      const r = await run(null, () => api.logoutAll());
      if (r.ok) ctx.signOut();
      return;
    }
    if (e.target.closest('#resync')) {
      const b = e.target.closest('#resync');
      const r = await run(b, () => sync(true), 'โหลดข้อมูลใหม่แล้ว');
      if (r.ok) draw();
    }
  });

  draw();
  return () => {};
}
