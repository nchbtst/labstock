/* ══════════════════════════════════════════════════════════════════════════
   ui.js — ส่วนประกอบหน้าจอที่ใช้ร่วมกันทุกหน้า
   ══════════════════════════════════════════════════════════════════════════ */

export const $  = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

/** กันข้อความจากผู้ใช้ไปเป็น HTML */
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** ลิงก์ที่แสดงได้ต้องเป็น http(s) เท่านั้น */
export function safeUrl(u) {
  const s = String(u || '').trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : '';
}

export function debounce(fn, ms) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ── ชนิด ─────────────────────────────────────────────────────────────────── */
export const KIND_TH = { CHEM: 'สารเคมี', CONS: 'วัสดุ', EQUIP: 'เครื่องมือ' };
export const KIND_CLS = { CHEM: 'k-chem', CONS: 'k-cons', EQUIP: 'k-equip' };
export const PLACE_KIND_TH = { ROOM: 'ห้อง', CABINET: 'ตู้/โต๊ะ', SHELF: 'ชั้น', BOX: 'กล่อง' };
export const MOVE_TH = {
  RECEIVE: 'รับเข้า', USE: 'เบิกใช้', RETURN: 'คืน', ADJUST: 'ปรับยอด', DISPOSE: 'จำหน่ายออก', MOVE: 'ย้ายที่'
};

export function kindTag(kind) {
  return `<span class="kind ${KIND_CLS[kind] || ''}">${esc(KIND_TH[kind] || kind)}</span>`;
}

/* ── แจ้งผลลัพธ์มุมจอ ─────────────────────────────────────────────────────── */
export function toast(message, kind) {
  const wrap = $('#toasts');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' is-' + kind : '');
  el.setAttribute('role', kind === 'risk' ? 'alert' : 'status');
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), kind === 'risk' ? 7000 : 3200);
}

/* ── แถบโหลดด้านบนจอ ──────────────────────────────────────────────────────── */
let busy = 0;
export function startBusy() {
  busy++;
  const b = $('#bar');
  if (b) { b.classList.remove('off'); b.classList.add('on'); }
}
export function endBusy() {
  busy = Math.max(0, busy - 1);
  if (busy === 0) {
    const b = $('#bar');
    if (b) { b.classList.remove('on'); b.classList.add('off'); }
  }
}
export async function withBusy(fn) {
  startBusy();
  try { return await fn(); } finally { endBusy(); }
}

/** รันงานพร้อมปิดปุ่มกันกดซ้ำ + แสดงข้อผิดพลาดเป็น toast */
export async function run(btn, fn, okMsg) {
  if (btn) btn.disabled = true;
  try {
    const r = await withBusy(fn);
    if (okMsg) toast(okMsg, 'ok');
    return { ok: true, value: r };
  } catch (e) {
    toast(e.message || 'เกิดข้อผิดพลาด', 'risk');
    return { ok: false, error: e };
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
}

/* ── วันที่ / ตัวเลข ──────────────────────────────────────────────────────── */
const dFmt  = new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
const dtFmt = new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const nFmt  = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 4 });

export function parseYmd(s) {
  if (!s) return null;
  if (s instanceof Date) return isNaN(s.getTime()) ? null : s;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
export function fmtDate(d) {
  const dt = parseYmd(d);
  return dt ? dFmt.format(dt) : '—';
}
export function fmtDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dtFmt.format(dt);
}
export function fmtNum(n) {
  const v = Number(n);
  return isNaN(v) ? '—' : nFmt.format(v);
}
export function fmtDays(days) {
  if (days === null || days === undefined) return '—';
  if (days < 0)  return 'เลยมา ' + fmtNum(-days) + ' วัน';
  if (days === 0) return 'วันนี้';
  return 'อีก ' + fmtNum(days) + ' วัน';
}
export function todayYmd() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ── ฟอร์ม ────────────────────────────────────────────────────────────────── */
export function optionsHtml(list, selected, blankLabel) {
  let h = blankLabel !== undefined ? `<option value="">${esc(blankLabel)}</option>` : '';
  for (const v of list) {
    const val = typeof v === 'object' ? v.value : v;
    const lab = typeof v === 'object' ? v.label : v;
    h += `<option value="${esc(val)}"${String(val) === String(selected) ? ' selected' : ''}>${esc(lab)}</option>`;
  }
  return h;
}

export function datalistHtml(id, list) {
  return `<datalist id="${esc(id)}">${list.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
}

/** อ่านค่าฟอร์มทั้งกรอบเป็น object (ใช้ name="") */
export function readForm(root) {
  const out = {};
  $$('[name]', root).forEach(el => {
    if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; return; }
    if (el.type === 'checkbox') { out[el.name] = el.checked; return; }
    if (el.type === 'file') return;
    out[el.name] = el.value;
  });
  return out;
}

/* ── Modal (ใช้ <dialog> ของเบราว์เซอร์: จัดการโฟกัส + Esc ให้เอง) ───────────── */
export function openModal({ title, body, foot, wide, className, onClose }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal' + (wide ? ' wide' : '') + (className ? ' ' + className : '');
  dlg.innerHTML = `
    <div class="modal-card">
      <header class="modal-head">
        <h2>${title || ''}</h2>
        <button type="button" class="x" data-close aria-label="ปิด">×</button>
      </header>
      <div class="modal-body">${body || ''}</div>
      ${foot !== undefined ? `<footer class="modal-foot">${foot}</footer>` : ''}
    </div>`;
  document.body.appendChild(dlg);

  let result;
  const handle = {
    el: dlg,
    body: $('.modal-body', dlg),
    foot: $('.modal-foot', dlg),
    close(r) { result = r; if (dlg.open) dlg.close(); },
    setTitle(t) { $('.modal-head h2', dlg).innerHTML = t; }
  };
  handle.closed = new Promise(resolve => {
    dlg.addEventListener('close', () => { dlg.remove(); if (onClose) onClose(result); resolve(result); });
  });
  dlg.addEventListener('click', e => {
    if (e.target === dlg) handle.close();                 // คลิกพื้นหลังเพื่อปิด
    if (e.target.closest('[data-close]')) handle.close();
  });
  dlg.showModal();
  return handle;
}

export function confirmBox({ title, message, okText, danger, cancelText }) {
  return new Promise(resolve => {
    const m = openModal({
      title: esc(title || 'ยืนยัน'),
      body: `<p class="pre">${esc(message || '')}</p>`,
      foot: `<button class="btn btn-ghost" data-close>${esc(cancelText || 'ยกเลิก')}</button>
             <button class="btn ${danger ? 'btn-risk' : ''}" id="cf-ok">${esc(okText || 'ตกลง')}</button>`
    });
    $('#cf-ok', m.el).addEventListener('click', () => m.close(true));
    m.closed.then(r => resolve(!!r));
  });
}

/* ── CSV ──────────────────────────────────────────────────────────────────── */
export function downloadCsv(filename, header, rows) {
  const cell = v => {
    const s = (v === null || v === undefined) ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const body = [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── ไอคอน (เส้นเรียบ ขนาดเท่ากัน) ───────────────────────────────────────── */
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const icon = {
  map:     svg('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.5h17M3.5 15h17M12 3.5v17"/>'),
  list:    svg('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
  upload:  svg('<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>'),
  users:   svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5.5a3 3 0 0 1 0 5.6M18 20c0-2-.6-3.5-1.6-4.6"/>'),
  gear:    svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>'),
  plus:    svg('<path d="M12 5v14M5 12h14"/>'),
  camera:  svg('<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.4"/>'),
  edit:    svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>'),
  search:  svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-4.3-4.3"/>'),
  pin:     svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>'),
  back:    svg('<path d="M15 5l-7 7 7 7"/>'),
  chev:    svg('<path d="M9 5l7 7-7 7"/>'),
  trash:   svg('<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/>'),
  copy:    svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  download: svg('<path d="M12 4v12m0 0 5-5m-5 5-5-5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>'),
  out:     svg('<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"/><path d="M15 8l4 4-4 4M19 12H9"/>'),
  image:   svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>'),
  sync:    svg('<path d="M20 11a8 8 0 0 0-14.5-3.5L4 9M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.5 3.5L20 15M20 19v-4h-4"/>')
};

/* ── รูปที่โหลดไม่ได้ → ลองลิงก์สำรอง แล้วค่อยแสดงกรอบว่าง ───────────────── */
export function installImgFallback(fallbackUrl) {
  document.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.fid) return;
    if (!img.dataset.tried && fallbackUrl) {
      img.dataset.tried = '1';
      img.src = fallbackUrl.replace('{id}', img.dataset.fid).replace('{w}', img.dataset.w || '400');
    } else {
      img.classList.add('broken');
    }
  }, true);
}
