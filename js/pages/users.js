/* ══════════════════════════════════════════════════════════════════════════
   pages/users.js — จัดการบัญชีผู้ใช้ (เฉพาะ Admin)
   Admin เป็นคนตั้งทั้งชื่อผู้ใช้และรหัสผ่านให้ทุกคน แล้วแจ้งผู้ใช้เอง
   ══════════════════════════════════════════════════════════════════════════ */
import { api, getUser } from '../api.js';
import {
  $, $$, esc, icon, toast, run, openModal, confirmBox, readForm, fmtDateTime
} from '../ui.js';

export const ROLE_TH = { admin: 'ผู้ดูแลระบบ', staff: 'ผู้ใช้งาน', viewer: 'ดูอย่างเดียว' };
const ROLE_HELP = {
  admin: 'ทำได้ทุกอย่าง รวมถึงจัดการผู้ใช้และนำเข้าข้อมูล',
  staff: 'เพิ่ม/แก้ไขของ เบิก ย้ายที่ ถ่ายรูป จัดวางปุ่มบนแผนผัง',
  viewer: 'ดูและค้นหาได้อย่างเดียว แก้ไขอะไรไม่ได้'
};

/** สุ่มรหัสผ่านอ่านง่าย (ไม่มี 0/O/1/l/I) ยาว 12 ตัว มีทั้งตัวอักษรและตัวเลข */
export function genPassword() {
  const L = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', D = '23456789';
  const all = L + D;
  const pick = s => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  const out = [pick(L), pick(D)];
  while (out.length < 12) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) {                       // สลับตำแหน่ง
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

function pwField(id, label, value) {
  return `<div class="field"><label for="${id}">${label}</label>
    <div class="pw-row">
      <input id="${id}" name="${id}" type="text" value="${esc(value || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" class="mono" required minlength="8" maxlength="72">
      <button type="button" class="btn btn-ghost" data-gen="${id}">สุ่ม</button>
    </div>
    <div class="hint">อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข</div></div>`;
}

function showCredentials(username, password, title) {
  const text = `ชื่อผู้ใช้: ${username}\nรหัสผ่าน: ${password}`;
  const m = openModal({
    title: esc(title),
    body: `<div class="note note-warn">จดหรือส่งข้อมูลนี้ให้ผู้ใช้ตอนนี้ — ระบบเก็บรหัสผ่านแบบเข้ารหัส จึงเปิดดูย้อนหลังไม่ได้</div>
      <pre class="cred mono" id="cred">${esc(text)}</pre>`,
    foot: `<button class="btn btn-ghost" id="cred-copy">${icon.copy} คัดลอก</button><button class="btn" data-close>เรียบร้อย</button>`
  });
  $('#cred-copy', m.el).addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); toast('คัดลอกแล้ว', 'ok'); }
    catch { toast('คัดลอกอัตโนมัติไม่ได้ — เลือกข้อความแล้วคัดลอกเอง', 'risk'); }
  });
}

export function mount(root) {
  let data = { users: [], max: 5 };
  let loaded = false, err = '';
  const me = () => (getUser() || {}).username;

  async function load() {
    try { data = await api.usersList(); err = ''; }
    catch (e) { err = e.message; }
    loaded = true;
    draw();
  }

  function draw() {
    const n = data.users.length;
    root.innerHTML = `
      <div class="page-head">
        <div><h1>ผู้ใช้งาน</h1><p class="muted">${loaded && !err ? `${n} จาก ${data.max} บัญชี` : ''}</p></div>
        <div class="head-acts"><button class="btn" id="u-add" ${n >= data.max ? 'disabled title="ครบจำนวนบัญชีสูงสุดแล้ว"' : ''}>${icon.plus} เพิ่มผู้ใช้</button></div>
      </div>
      ${err ? `<div class="note note-risk">${esc(err)}</div>` : ''}
      ${!loaded ? '<div class="empty"><b>กำลังโหลด …</b></div>' : `
      <div class="user-list">${data.users.map(u => `
        <div class="user-card${u.status !== 'ACTIVE' ? ' off' : ''}" data-u="${esc(u.username)}">
          <div class="uc-main">
            <b>${esc(u.name || u.username)}</b>
            <span class="mono muted">${esc(u.username)}</span>
            <span class="tag ${u.role === 'admin' ? 'tag-ok' : 'tag-mute'}">${esc(ROLE_TH[u.role] || u.role)}</span>
            ${u.status !== 'ACTIVE' ? '<span class="tag tag-risk">ปิดใช้งาน</span>' : ''}
            ${u.username === me() ? '<span class="tag tag-mute">คุณ</span>' : ''}
          </div>
          <div class="uc-meta muted">เข้าล่าสุด ${esc(fmtDateTime(u.lastLogin))} · ${u.loginCount} ครั้ง${u.notes ? ' · ' + esc(u.notes) : ''}</div>
          <div class="uc-acts">
            <button class="btn btn-ghost btn-sm" data-a="edit">${icon.edit} แก้ไข</button>
            <button class="btn btn-ghost btn-sm" data-a="pw">ตั้งรหัสผ่านใหม่</button>
            ${u.username !== me() ? `
              <button class="btn btn-ghost btn-sm" data-a="toggle">${u.status === 'ACTIVE' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
              <button class="btn btn-ghost btn-sm btn-danger-text" data-a="del">${icon.trash} ลบ</button>` : ''}
          </div>
        </div>`).join('')}</div>`}`;
  }

  /* ── เพิ่มผู้ใช้ ──────────────────────────────────────────────────── */
  function addDialog() {
    const m = openModal({
      title: 'เพิ่มผู้ใช้',
      body: `<form id="uf" autocomplete="off">
        <div class="row-2">
          <div class="field"><label>ชื่อผู้ใช้ (ใช้ล็อกอิน) *</label>
            <input name="username" required pattern="[A-Za-z0-9._\\-]{3,30}" maxlength="30" autocapitalize="off" spellcheck="false" class="mono" autofocus>
            <div class="hint">a–z ตัวเลข . _ - ยาว 3–30 ตัว</div></div>
          <div class="field"><label>ชื่อที่แสดง *</label><input name="name" required maxlength="80"></div>
        </div>
        <div class="field"><label>สิทธิ์</label>
          <select name="role">${['staff', 'viewer', 'admin'].map(r => `<option value="${r}">${ROLE_TH[r]}</option>`).join('')}</select>
          <div class="hint" id="role-help">${esc(ROLE_HELP.staff)}</div></div>
        ${pwField('password', 'รหัสผ่านเริ่มต้น *', genPassword())}
        <div class="field"><label>หมายเหตุ</label><input name="notes" maxlength="300"></div>
      </form>`,
      foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn" id="uf-ok">สร้างบัญชี</button>`
    });
    $('[name=role]', m.el).addEventListener('change', e => { $('#role-help', m.el).textContent = ROLE_HELP[e.target.value]; });
    const submit = async () => {
      const form = $('#uf', m.el);
      if (!form.reportValidity()) return;
      const f = readForm(m.el);
      const r = await run($('#uf-ok', m.el), () => api.usersAdd(f), 'สร้างบัญชีแล้ว');
      if (r.ok) { m.close(true); showCredentials(f.username.toLowerCase(), f.password, 'บัญชีใหม่'); load(); }
    };
    $('#uf-ok', m.el).addEventListener('click', submit);
    $('#uf', m.el).addEventListener('submit', e => { e.preventDefault(); submit(); });
  }

  function editDialog(u) {
    const self = u.username === me();
    const m = openModal({
      title: 'แก้ไข ' + esc(u.username),
      body: `<form id="uf" autocomplete="off">
        <div class="field"><label>ชื่อที่แสดง *</label><input name="name" required maxlength="80" value="${esc(u.name)}" autofocus></div>
        <div class="field"><label>สิทธิ์</label>
          <select name="role" ${self ? 'disabled' : ''}>${['admin', 'staff', 'viewer'].map(r => `<option value="${r}"${r === u.role ? ' selected' : ''}>${ROLE_TH[r]}</option>`).join('')}</select>
          <div class="hint">${self ? 'เปลี่ยนสิทธิ์ของตัวเองไม่ได้' : 'ถ้าเปลี่ยนสิทธิ์ ผู้ใช้ต้องล็อกอินใหม่'}</div></div>
        <div class="field"><label>หมายเหตุ</label><input name="notes" maxlength="300" value="${esc(u.notes)}"></div>
      </form>`,
      foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn" id="uf-ok">บันทึก</button>`
    });
    const submit = async () => {
      const form = $('#uf', m.el);
      if (!form.reportValidity()) return;
      const f = readForm(m.el);
      const payload = { username: u.username, name: f.name, notes: f.notes };
      if (!self && f.role !== u.role) payload.role = f.role;
      const r = await run($('#uf-ok', m.el), () => api.usersUpdate(payload), 'บันทึกแล้ว');
      if (r.ok) { m.close(true); load(); }
    };
    $('#uf-ok', m.el).addEventListener('click', submit);
    $('#uf', m.el).addEventListener('submit', e => { e.preventDefault(); submit(); });
  }

  function resetDialog(u) {
    const m = openModal({
      title: 'ตั้งรหัสผ่านใหม่ · ' + esc(u.username),
      body: `<form id="uf" autocomplete="off">
        <div class="note note-info">ผู้ใช้จะถูกออกจากระบบทุกเครื่อง และต้องล็อกอินด้วยรหัสใหม่นี้</div>
        ${pwField('password', 'รหัสผ่านใหม่ *', genPassword())}</form>`,
      foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button><button class="btn" id="uf-ok">ตั้งรหัสผ่าน</button>`
    });
    const submit = async () => {
      const form = $('#uf', m.el);
      if (!form.reportValidity()) return;
      const pw = $('[name=password]', m.el).value;
      const r = await run($('#uf-ok', m.el), () => api.usersResetPassword(u.username, pw), 'ตั้งรหัสผ่านใหม่แล้ว');
      if (r.ok) { m.close(true); showCredentials(u.username, pw, 'รหัสผ่านใหม่'); load(); }
    };
    $('#uf-ok', m.el).addEventListener('click', submit);
    $('#uf', m.el).addEventListener('submit', e => { e.preventDefault(); submit(); });
  }

  /* ── เหตุการณ์ ───────────────────────────────────────────────────── */
  document.addEventListener('click', onGen);
  function onGen(e) {      // ปุ่ม "สุ่ม" อยู่ในหน้าต่างย่อย (นอก root)
    const g = e.target.closest('[data-gen]');
    if (g) { const inp = document.getElementById(g.dataset.gen); if (inp) inp.value = genPassword(); }
  }

  root.addEventListener('click', async e => {
    if (e.target.closest('#u-add')) return addDialog();
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const u = data.users.find(x => x.username === b.closest('[data-u]').dataset.u);
    if (!u) return;
    const a = b.dataset.a;
    if (a === 'edit') return editDialog(u);
    if (a === 'pw') return resetDialog(u);
    if (a === 'toggle') {
      const to = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      if (to === 'DISABLED' && !(await confirmBox({ title: 'ปิดใช้งาน ' + u.username + ' ?', message: 'ผู้ใช้จะล็อกอินไม่ได้และถูกออกจากระบบทุกเครื่อง (เปิดกลับมาใช้ได้ภายหลัง)', okText: 'ปิดใช้งาน', danger: true }))) return;
      const r = await run(b, () => api.usersSetStatus(u.username, to), to === 'ACTIVE' ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว');
      if (r.ok) load();
    }
    if (a === 'del') {
      if (!(await confirmBox({ title: 'ลบบัญชี ' + u.username + ' ?', message: 'ลบถาวร ประวัติที่เคยบันทึกไว้ยังอยู่ แต่บัญชีนี้จะเข้าระบบอีกไม่ได้\nถ้าแค่ต้องการหยุดใช้ชั่วคราว ให้ใช้ "ปิดใช้งาน" แทน', okText: 'ลบบัญชี', danger: true }))) return;
      const r = await run(b, () => api.usersDelete(u.username), 'ลบบัญชีแล้ว');
      if (r.ok) load();
    }
  });

  draw();
  load();
  return () => document.removeEventListener('click', onGen);
}
