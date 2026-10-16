/* ══════════════════════════════════════════════════════════════════════════
   auth.js — หน้าล็อกอิน (ชื่อผู้ใช้ + รหัสผ่านที่ Admin ตั้งให้)
   ══════════════════════════════════════════════════════════════════════════ */
import { api, setSession } from './api.js';
import { $, esc } from './ui.js';

const CFG = window.APP_CONFIG;

/**
 * @param {HTMLElement} el กรอบหน้าล็อกอิน
 * @param {{message?:string, onDone:Function}} o
 */
export function renderLogin(el, o) {
  el.innerHTML = `
    <form class="login-card" id="lf" autocomplete="on">
      <div class="login-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6.2L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 9.2V3"/><path d="M7.5 14h9"/></svg></div>
      <h1>${esc(CFG.APP_NAME)}</h1>
      <p class="muted">ระบบจัดการสารเคมี วัสดุ และเครื่องมือในห้องแลป</p>
      ${o.message ? `<div class="note note-warn">${esc(o.message)}</div>` : ''}
      <div class="field"><label for="lu">ชื่อผู้ใช้</label>
        <input id="lu" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required autofocus></div>
      <div class="field"><label for="lp">รหัสผ่าน</label>
        <div class="pw-row"><input id="lp" name="password" type="password" autocomplete="current-password" required>
          <button type="button" class="btn btn-ghost" id="lshow" aria-label="แสดงรหัสผ่าน">แสดง</button></div></div>
      <div class="err" id="lerr" role="alert" hidden></div>
      <button class="btn btn-block" id="lgo">เข้าสู่ระบบ</button>
      <p class="muted login-foot">ยังไม่มีบัญชี? ติดต่อผู้ดูแลระบบให้สร้างให้</p>
    </form>`;

  $('#lshow', el).addEventListener('click', e => {
    const inp = $('#lp', el);
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'ซ่อน' : 'แสดง';
  });

  $('#lf', el).addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#lerr', el), btn = $('#lgo', el);
    err.hidden = true; btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ …';
    try {
      const r = await api.login($('#lu', el).value.trim(), $('#lp', el).value);
      setSession(r.session, r.user);
      o.onDone(r.user);
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
      btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
      $('#lp', el).select();
    }
  });
}
