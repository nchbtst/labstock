/* ══════════════════════════════════════════════════════════════════════════
   pages/items.js — รายการของทั้งหมด: ค้นหา · กรอง · เรียง · ส่งออก CSV
   ค้นหาในเครื่อง (ไม่เรียกเซิร์ฟเวอร์) จึงตอบทันทีที่พิมพ์
   ══════════════════════════════════════════════════════════════════════════ */
import { can } from '../api.js';
import { M, onChange, placeOptions, opts, categoryType, unitCover } from '../data.js';
import { search } from '../search.js';
import {
  $, $$, esc, icon, kindTag, debounce, fmtNum, fmtDate, fmtDays, optionsHtml, downloadCsv,
  KIND_TH, todayYmd
} from '../ui.js';
import { photoImg } from '../photo.js';
import { openDetail } from '../detail.js';
import { openItemForm } from '../form.js';

const CFG = window.APP_CONFIG;

const PRESETS = [
  ['', 'ทั้งหมด', 'all'],
  ['soon', 'ใกล้หมดอายุ', 'soon'],
  ['expired', 'หมดอายุแล้ว', 'expired'],
  ['low', 'ใกล้หมด', 'low'],
  ['out', 'หมดแล้ว', 'out'],
  ['broken', 'ชำรุด', 'broken'],
  ['noplace', 'ไม่ระบุที่เก็บ', 'noplace'],
  ['disposed', 'จำหน่ายแล้ว', 'disposed'],
  ['archived', 'เก็บเข้าคลังเก่า', 'archived']
];

export function mount(root, params) {
  const p0 = params || {};
  const st = {
    q: p0.q || '', kind: p0.kind || '', preset: p0.preset || '',
    category: '', fiscalYear: '', supplier: '', placeId: p0.place || '',
    sort: { key: 'name', dir: 'asc' }, limit: CFG.PAGE_SIZE || 100
  };
  let last = null;

  /* ── โครงหน้า (สร้างครั้งเดียว / เมื่อข้อมูลเปลี่ยน) ─────────────────── */
  function shell() {
    const m = M();
    const years = [...new Set([...m.units.values()].map(u => u.fiscalYear).filter(Boolean))].sort().reverse();
    const sup = [...new Set([...m.units.values()].map(u => u.supplier).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'th'));
    const cats = st.kind ? opts(categoryType(st.kind))
      : [...new Set(['ChemCategory', 'ConsCategory', 'EquipCategory'].flatMap(t => opts(t)))];

    root.innerHTML = `
      <div class="page-head">
        <div><h1>รายการ</h1><p class="muted" id="sub"></p></div>
        <div class="head-acts">
          <button class="btn btn-ghost" id="exp">${icon.download} ส่งออก CSV</button>
          ${can('staff') ? `<button class="btn" id="add">${icon.plus} เพิ่มของ</button>` : ''}
        </div>
      </div>
      <div class="searchbar">${icon.search}
        <input id="q" type="search" placeholder="ค้นหา: ชื่อ · CAS · ยี่ห้อ · รุ่น · ที่เก็บ · ป้าย…" value="${esc(st.q)}" autocomplete="off" enterkeyhint="search">
      </div>
      <div class="chips" id="kinds"></div>
      <div class="chips" id="presets"></div>
      <div class="filters">
        <select id="f-cat" aria-label="หมวด">${optionsHtml(cats, st.category, 'ทุกหมวด')}</select>
        <select id="f-fy" aria-label="ปีงบประมาณ">${optionsHtml(years, st.fiscalYear, 'ทุกปีงบ')}</select>
        <select id="f-sup" aria-label="ผู้จำหน่าย">${optionsHtml(sup, st.supplier, 'ทุกผู้จำหน่าย')}</select>
        <select id="f-place" aria-label="ที่เก็บ">${placeOptions(st.placeId, { blank: 'ทุกที่เก็บ' })}</select>
      </div>
      <div id="res"></div>`;
    results();
  }

  /* ── ผลลัพธ์ ─────────────────────────────────────────────────────── */
  function results() {
    const r = search(st.q, st, st.sort);
    last = r;
    $('#sub', root).textContent = M().version === null ? 'กำลังโหลด …'
      : `${fmtNum(r.rows.length)} รายการ · ค้นใน ${r.ms} ms`;

    $('#kinds', root).innerHTML = [['', 'ทุกชนิด', r.kinds.CHEM + r.kinds.CONS + r.kinds.EQUIP],
      ['CHEM', KIND_TH.CHEM, r.kinds.CHEM], ['CONS', KIND_TH.CONS, r.kinds.CONS], ['EQUIP', KIND_TH.EQUIP, r.kinds.EQUIP]]
      .map(([k, l, n]) => `<button class="chip${st.kind === k ? ' on' : ''}" data-kind="${k}">${esc(l)} <em>${n}</em></button>`).join('');

    $('#presets', root).innerHTML = PRESETS
      .filter(([k, , c]) => k === '' || st.preset === k || r.counts[c] > 0)
      .map(([k, l, c]) => `<button class="chip chip-line${st.preset === k ? ' on' : ''}${k && (k === 'expired' || k === 'out' || k === 'broken') ? ' risk' : ''}" data-preset="${k}">${esc(l)} <em>${r.counts[c]}</em></button>`).join('');

    const rows = r.rows.slice(0, st.limit);
    const sh = key => st.sort.key === key ? (st.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    $('#res', root).innerHTML = r.rows.length ? `
      <table class="tbl">
        <thead><tr>
          <th class="c-thumb"></th>
          <th><button data-sort="name">ชื่อ${sh('name')}</button></th>
          <th><button data-sort="location">ที่เก็บ${sh('location')}</button></th>
          <th class="r"><button data-sort="balance">คงเหลือ${sh('balance')}</button></th>
          <th><button data-sort="expire">หมดอายุ${sh('expire')}</button></th>
        </tr></thead>
        <tbody>${rows.map(rowHtml).join('')}</tbody>
      </table>
      ${r.rows.length > rows.length ? `<div class="more"><button class="btn btn-ghost" id="more">แสดงเพิ่ม (เหลืออีก ${r.rows.length - rows.length})</button></div>` : ''}`
      : `<div class="empty"><b>ไม่พบรายการ</b>${st.q || st.kind || st.preset || st.placeId || st.category || st.fiscalYear || st.supplier
          ? 'ลองลบคำค้นหรือตัวกรองบางอย่างออก <br><br><button class="btn btn-ghost" id="clear">ล้างตัวกรองทั้งหมด</button>'
          : 'ยังไม่มีของในระบบ' + (can('staff') ? ' — กด "เพิ่มของ" เพื่อเริ่ม' : '')}</div>`;
  }

  function rowHtml(r) {
    const { item, unit } = r;
    const cov = unit ? unitCover(unit) : null;
    let qty = '<span class="muted">—</span>';
    if (unit && !r.disposed) {
      if (item.kind === 'EQUIP') qty = unit.condition === 'BROKEN' ? '<span class="tag tag-risk">ชำรุด</span>' : '<span class="tag tag-ok">ใช้ได้</span>';
      else {
        qty = `<span class="qty ${unit.balance <= 0 ? 'neg' : ''}">${esc(fmtNum(unit.balance))}</span> <small>${esc(item.unit)}</small>`;
        if (r.stock === 'low') qty += ' <span class="tag tag-warn">ใกล้หมด</span>';
      }
    } else if (r.disposed) qty = '<span class="tag tag-mute">จำหน่ายแล้ว</span>';
    else if (item.kind !== 'EQUIP') qty = '<span class="tag tag-risk">ไม่มีในคลัง</span>';

    let exp = '<span class="muted">—</span>';
    if (unit && unit.expireDate && !r.disposed) {
      const cls = unit.expiry === 'expired' ? 'tag-risk' : unit.expiry === 'soon' ? 'tag-warn' : '';
      exp = `<span class="${cls ? 'tag ' + cls : ''}" title="${esc(fmtDays(unit.daysLeft))}">${esc(fmtDate(unit.expireDate))}</span>`;
    }
    return `<tr data-key="${esc(r.key)}" tabindex="0" class="${r.disposed || r.archived ? 'dim' : ''}">
      <td class="c-thumb"><span class="thumb">${cov ? photoImg(cov, 120, { noRatio: true }) : icon.image}</span></td>
      <td data-l="ชื่อ"><b>${esc(item.name)}</b>
        <small>${kindTag(item.kind)} ${esc([item.nameEn, item.brand, item.model, item.cas && 'CAS ' + item.cas].filter(Boolean).join(' · '))}${unit && unit.label ? ' <span class="mono">' + esc(unit.label) + '</span>' : ''}</small></td>
      <td data-l="ที่เก็บ">${r.pathText ? esc(r.pathText) : (unit && !r.disposed ? '<span class="tag tag-warn">ไม่ระบุ</span>' : '<span class="muted">—</span>')}</td>
      <td class="r" data-l="คงเหลือ">${qty}</td>
      <td data-l="หมดอายุ">${exp}</td>
    </tr>`;
  }

  /* ── เหตุการณ์ ───────────────────────────────────────────────────── */
  const onInput = debounce(() => { st.limit = CFG.PAGE_SIZE || 100; results(); }, 90);

  root.addEventListener('input', e => {
    if (e.target.id === 'q') { st.q = e.target.value; onInput(); }
  });
  root.addEventListener('change', e => {
    const map = { 'f-cat': 'category', 'f-fy': 'fiscalYear', 'f-sup': 'supplier', 'f-place': 'placeId' };
    if (map[e.target.id]) { st[map[e.target.id]] = e.target.value; st.limit = CFG.PAGE_SIZE || 100; results(); }
  });
  root.addEventListener('click', e => {
    const t = e.target;
    const kind = t.closest('[data-kind]');
    if (kind) { st.kind = kind.dataset.kind; st.category = ''; st.limit = CFG.PAGE_SIZE || 100; shell(); return; }
    const pre = t.closest('[data-preset]');
    if (pre) { st.preset = pre.dataset.preset; st.limit = CFG.PAGE_SIZE || 100; results(); return; }
    const so = t.closest('[data-sort]');
    if (so) {
      const k = so.dataset.sort;
      st.sort = st.sort.key === k ? { key: k, dir: st.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' };
      results(); return;
    }
    if (t.closest('#more')) { st.limit += (CFG.PAGE_SIZE || 100); results(); return; }
    if (t.closest('#clear')) { Object.assign(st, { q: '', kind: '', preset: '', category: '', fiscalYear: '', supplier: '', placeId: '' }); shell(); return; }
    if (t.closest('#add')) { openItemForm({ mode: 'new', kind: st.kind || undefined, placeId: st.placeId || undefined }); return; }
    if (t.closest('#exp')) { exportCsv(); return; }
    const tr = t.closest('tr[data-key]');
    if (tr) openDetail(tr.dataset.key);
  });
  root.addEventListener('keydown', e => {
    const tr = e.target.closest && e.target.closest('tr[data-key]');
    if (tr && e.key === 'Enter') openDetail(tr.dataset.key);
  });

  function exportCsv() {
    if (!last) return;
    const header = ['ชนิด', 'ชื่อ', 'ชื่ออังกฤษ', 'CAS', 'ยี่ห้อ', 'รุ่น', 'หมวด', 'รหัสขวด/ชิ้น', 'ป้าย', 'ที่เก็บ',
      'คงเหลือ', 'หน่วย', 'วันที่รับ', 'หมดอายุ', 'ปีงบ', 'ผู้จำหน่าย', 'ราคา', 'สภาพ', 'สถานะ'];
    const rows = last.rows.map(r => [
      KIND_TH[r.kind], r.item.name, r.item.nameEn, r.item.cas, r.item.brand, r.item.model, r.item.category,
      r.unit ? r.unit.id : '', r.unit ? r.unit.label : '', r.pathText,
      r.unit && r.item.kind !== 'EQUIP' ? r.unit.balance : '', r.item.unit,
      r.unit ? r.unit.receiveDate : '', r.unit ? r.unit.expireDate : '', r.unit ? r.unit.fiscalYear : '',
      r.unit ? r.unit.supplier : '', r.unit && r.unit.price !== null ? r.unit.price : '',
      r.unit ? r.unit.condition : '', r.archived ? 'เก็บเข้าคลังเก่า' : r.disposed ? 'จำหน่ายแล้ว' : 'ใช้งาน'
    ]);
    downloadCsv('labstock-' + todayYmd().replace(/-/g, '') + '.csv', header, rows);
  }

  const unsub = onChange(() => {
    const act = document.activeElement;
    const typing = act && act.id === 'q';
    const pos = typing ? act.selectionStart : 0;
    shell();
    if (typing) { const q = $('#q', root); q.focus(); try { q.setSelectionRange(pos, pos); } catch { /* ไม่เป็นไร */ } }
  });
  shell();
  return () => { unsub(); };
}
