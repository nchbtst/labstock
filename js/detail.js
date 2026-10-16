/* ══════════════════════════════════════════════════════════════════════════
   detail.js — หน้าต่างรายละเอียดของขวด/ชิ้น: ข้อมูล · รูป · ประวัติ · คำสั่ง
   ══════════════════════════════════════════════════════════════════════════ */
import { api, can, getUser } from './api.js';
import { M, sync, onChange, itemOf, unitOf, placeOf, photosOf, unitCover } from './data.js';
import {
  $, $$, esc, safeUrl, toast, run, openModal, confirmBox, icon, kindTag, fmtNum, fmtDate, fmtDateTime, fmtDays,
  MOVE_TH, KIND_TH, parseYmd
} from './ui.js';
import { photoImg } from './photo.js';
import { moveDialog, photosDialog, lightbox } from './dialogs.js';
import { openItemForm } from './form.js';

function reasonBox(title, label) {
  return new Promise(resolve => {
    const m = openModal({
      title: esc(title),
      body: `<div class="field"><label>${esc(label)}</label><input id="rb-in" maxlength="120" autofocus></div>`,
      foot: `<button class="btn btn-ghost" data-close>ไม่ยกเลิก</button><button class="btn btn-risk" id="rb-ok">ยืนยันยกเลิกรายการ</button>`
    });
    const done = () => m.close($('#rb-in', m.el).value.trim() || 'ไม่ระบุเหตุผล');
    $('#rb-ok', m.el).addEventListener('click', done);
    $('#rb-in', m.el).addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
    m.closed.then(r => resolve(r || null));
  });
}

function stockTag(item, unit) {
  if (!unit) return '<span class="tag tag-mute">ไม่มีในคลัง</span>';
  if (unit.status === 'DISPOSED') return '<span class="tag tag-mute">จำหน่ายแล้ว</span>';
  if (item.kind === 'EQUIP') return unit.condition === 'BROKEN' ? '<span class="tag tag-risk">ชำรุด</span>' : '<span class="tag tag-ok">ใช้งานได้</span>';
  if (unit.balance <= 0) return '<span class="tag tag-risk">หมด</span>';
  const total = M().itemTotals.get(item.id) || 0;
  if (item.reorderPoint !== null && total <= item.reorderPoint) return '<span class="tag tag-warn">ใกล้หมด</span>';
  return '<span class="tag tag-ok">มีของ</span>';
}
function expiryTag(unit) {
  if (!unit || unit.status === 'DISPOSED' || unit.daysLeft === null) return '';
  if (unit.expiry === 'expired') return `<span class="tag tag-risk">หมดอายุแล้ว (${esc(fmtDays(unit.daysLeft))})</span>`;
  if (unit.expiry === 'soon') return `<span class="tag tag-warn">ใกล้หมดอายุ (${esc(fmtDays(unit.daysLeft))})</span>`;
  return '';
}

/**
 * @param {string} key  รหัสขวด/ชิ้น (U-…) หรือรหัสของ (IT-…) กรณียังไม่มีขวดเลย
 */
export function openDetail(key) {
  let unitId = String(key).startsWith('U-') ? key : '';
  let itemId = unitId ? (unitOf(unitId) || {}).itemId : key;
  if (!itemOf(itemId)) { toast('ไม่พบรายการนี้', 'risk'); return null; }

  const m = openModal({ title: '', wide: true, className: 'detail-modal', body: '<div id="dt"></div>' });
  let tab = 'info', hist = null, histErr = '', photoIdx = 0;

  const unsub = onChange(() => {
    if (unitId && !unitOf(unitId)) { m.close(); return; }
    render();
    if (tab === 'hist') loadHistory();
  });
  m.closed.then(unsub);

  async function loadHistory() {
    try { hist = await api.history(unitId ? { unitId, limit: 200 } : { itemId, limit: 200 }); histErr = ''; }
    catch (e) { histErr = e.message; }
    if (tab === 'hist') render();
  }

  function render() {
    const item = itemOf(itemId), unit = unitId ? unitOf(unitId) : null;
    if (!item) { m.close(); return; }
    const staff = can('staff');
    const live = unit && unit.status === 'ACTIVE';
    const place = unit && placeOf(unit.placeId);
    const photos = [...(unit ? photosOf('UNIT', unit.id) : []), ...photosOf('ITEM', item.id)];
    if (photoIdx >= photos.length) photoIdx = 0;
    const others = [...M().units.values()].filter(u => u.itemId === item.id && u.id !== unitId && u.status === 'ACTIVE');

    m.setTitle(esc(item.name));
    const row = (k, v) => v === '' || v === null || v === undefined ? '' : `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`;
    const sds = safeUrl(item.sdsUrl);

    $('#dt', m.el).innerHTML = `
      <div class="detail">
        <div class="detail-media">
          ${photos.length ? `
            <button class="dm-main" data-big="${photoIdx}" title="ดูรูปใหญ่">${photoImg(photos[photoIdx], 800, { noRatio: true, eager: true })}</button>
            ${photos.length > 1 ? `<div class="dm-thumbs">${photos.map((p, i) => `<button data-pi="${i}" class="${i === photoIdx ? 'on' : ''}">${photoImg(p, 200, { noRatio: true })}</button>`).join('')}</div>` : ''}`
          : `<div class="dm-none">${icon.image}<span>ยังไม่มีรูป</span></div>`}
          ${staff ? `<div class="dm-btns">
              <button class="btn btn-ghost btn-sm" data-act="photos-item">${icon.camera} รูปของรายการ</button>
              ${unit ? `<button class="btn btn-ghost btn-sm" data-act="photos-unit">${icon.camera} รูปเฉพาะขวด/ชิ้นนี้</button>` : ''}
            </div>` : ''}
        </div>

        <div class="detail-main">
          <div class="detail-tags">${kindTag(item.kind)} ${stockTag(item, unit)} ${expiryTag(unit)}
            ${unit && unit.condition === 'BROKEN' && item.kind !== 'EQUIP' ? '<span class="tag tag-risk">ภาชนะชำรุด</span>' : ''}
            ${item.status === 'ARCHIVED' ? '<span class="tag tag-mute">คลังเก่า</span>' : ''}</div>
          ${item.nameEn ? `<div class="muted">${esc(item.nameEn)}</div>` : ''}
          <dl class="kv">
            ${row('ยี่ห้อ / รุ่น', esc([item.brand, item.model].filter(Boolean).join(' · ')))}
            ${row('เลข CAS', item.cas ? `<span class="mono">${esc(item.cas)}</span>` : '')}
            ${row('เกรด', esc(item.grade))}
            ${row('หมวดหมู่', esc(item.category))}
            ${unit ? row('ที่เก็บ', place
                ? `${esc(place.pathText)} <button class="link-btn" data-act="show-map" data-place="${esc(place.id)}">${icon.pin} ดูบนแผนผัง</button>`
                : '<span class="muted">ยังไม่ได้ระบุที่เก็บ</span>') : ''}
            ${unit && item.kind !== 'EQUIP' ? row('คงเหลือ', `<b class="qty big">${esc(fmtNum(unit.balance))}</b> ${esc(item.unit)}
                <span class="muted">(รับเข้า ${esc(fmtNum(unit.qtyInitial))})</span>`) : ''}
            ${unit && item.kind !== 'EQUIP' ? row('รวมทุกขวดของรายการนี้', `${esc(fmtNum(M().itemTotals.get(item.id) || 0))} ${esc(item.unit)}${item.reorderPoint !== null ? ` <span class="muted">· แจ้งเมื่อต่ำกว่า ${esc(fmtNum(item.reorderPoint))}</span>` : ''}`) : ''}
            ${unit ? row(item.kind === 'EQUIP' ? 'Serial' : 'เลขล็อต', esc(unit.label)) : ''}
            ${unit ? row('วันที่รับเข้า', unit.receiveDate ? esc(fmtDate(unit.receiveDate)) : '') : ''}
            ${unit && item.kind !== 'EQUIP' ? row('หมดอายุ', unit.expireDate ? `${esc(fmtDate(unit.expireDate))} <span class="muted">(${esc(fmtDays(unit.daysLeft))})</span>` : '') : ''}
            ${unit ? row('ปีงบประมาณ', esc(unit.fiscalYear)) : ''}
            ${unit ? row('ผู้จำหน่าย', esc(unit.supplier)) : ''}
            ${unit ? row('ราคา', unit.price !== null ? esc(fmtNum(unit.price)) + ' บาท' : '') : ''}
            ${row('ความอันตราย', esc(item.hazard))}
            ${row('การเก็บรักษา', esc(item.storage))}
            ${row('SDS', sds ? `<a href="${esc(sds)}" target="_blank" rel="noopener noreferrer">เปิดเอกสาร SDS ↗</a>` : '')}
            ${row('หมายเหตุ', item.notes ? `<span class="pre">${esc(item.notes)}</span>` : '')}
            ${unit ? row('หมายเหตุขวด/ชิ้น', unit.notes ? `<span class="pre">${esc(unit.notes)}</span>` : '') : ''}
          </dl>

          ${staff ? `<div class="actions">${actionsHtml(item, unit, live)}</div>` : ''}
        </div>
      </div>

      <div class="tabs" role="tablist">
        <button role="tab" data-tab="info" aria-selected="${tab === 'info'}">ขวด/ชิ้นอื่นของรายการนี้ <span class="count">${others.length}</span></button>
        <button role="tab" data-tab="hist" aria-selected="${tab === 'hist'}">ประวัติ</button>
      </div>
      <div class="tabpane">${tab === 'info' ? othersHtml(others, item) : histHtml()}</div>`;
  }

  function actionsHtml(item, unit, live) {
    const b = [];
    if (live) {
      if (item.kind !== 'EQUIP') b.push(`<button class="btn" data-act="USE">เบิกใช้</button>`,
        `<button class="btn btn-ghost" data-act="RETURN">คืน</button>`,
        `<button class="btn btn-ghost" data-act="ADJUST">ปรับยอด</button>`);
      b.push(`<button class="btn ${item.kind === 'EQUIP' ? '' : 'btn-ghost'}" data-act="MOVE">${icon.pin} ย้ายที่</button>`);
    }
    if (unit) b.push(`<button class="btn btn-ghost" data-act="edit">${icon.edit} แก้ไขข้อมูล</button>`);
    else b.push(`<button class="btn btn-ghost" data-act="edit">${icon.edit} แก้ไขข้อมูล</button>`);
    if (item.status === 'ACTIVE') b.push(`<button class="btn btn-ghost" data-act="lot">${icon.plus} รับเข้าเพิ่ม (ล็อต/ชิ้นใหม่)</button>`);
    if (live) b.push(`<button class="btn btn-ghost" data-act="DISPOSE">จำหน่ายออก</button>`);
    if (unit) b.push(`<button class="btn btn-ghost btn-danger-text" data-act="delete">${icon.trash} ลบรายการที่ลงผิด</button>`);
    if (!unit || unit.status !== 'ACTIVE') {
      b.push(item.status === 'ARCHIVED'
        ? `<button class="btn btn-ghost" data-act="unarchive">นำกลับมาใช้งาน</button>`
        : `<button class="btn btn-ghost" data-act="archive">เก็บเข้าคลังเก่า</button>`);
    }
    return b.join('');
  }

  function othersHtml(others, item) {
    if (!others.length) return '<div class="empty small">รายการนี้ไม่มีขวด/ชิ้นอื่นอยู่ในคลัง</div>';
    return `<ul class="mini-list">${others.map(u => {
      const p = placeOf(u.placeId);
      return `<li><button data-switch="${esc(u.id)}">
        <b>${esc(u.label || u.id)}</b>
        <span>${item.kind === 'EQUIP' ? '' : esc(fmtNum(u.balance) + ' ' + item.unit)}</span>
        <span class="muted">${p ? esc(p.pathText) : 'ยังไม่ระบุที่เก็บ'}</span>
        ${u.expireDate && item.kind !== 'EQUIP' ? `<span class="muted">หมดอายุ ${esc(fmtDate(u.expireDate))}</span>` : ''}
      </button></li>`;
    }).join('')}</ul>`;
  }

  function histHtml() {
    if (histErr) return `<div class="note note-risk">${esc(histErr)}</div>`;
    if (!hist) return '<div class="empty small">กำลังโหลดประวัติ …</div>';
    if (!hist.moves.length) return '<div class="empty small">ยังไม่มีประวัติ</div>';
    const staff = can('staff');
    return `<ul class="hist">${hist.moves.map(h => {
      const cancelled = h.status === 'CANCELLED';
      const sign = h.qty > 0 ? '+' : '';
      const detail = [
        h.type === 'MOVE' ? `${esc(h.from || 'ไม่ระบุ')} → ${esc(h.to)}` : '',
        h.type === 'RECEIVE' && h.to ? `เก็บที่ ${esc(h.to)}` : '',
        h.purpose ? esc(h.purpose) : '', h.notes ? esc(h.notes) : ''
      ].filter(Boolean).join(' · ');
      return `<li class="h-${esc(h.type)}${cancelled ? ' cancelled' : ''}">
        <div class="h-top"><b>${esc(MOVE_TH[h.type] || h.type)}</b>
          ${h.qty !== 0 ? `<span class="qty ${h.qty > 0 ? 'pos' : 'neg'}">${sign}${esc(fmtNum(h.qty))}</span><span class="muted">→ คงเหลือ ${esc(fmtNum(h.balanceAfter))}</span>` : ''}
          ${cancelled ? '<span class="tag tag-mute">ยกเลิกแล้ว</span>' : ''}
          ${!unitId ? `<span class="muted">${esc(h.label || h.unitId)}</span>` : ''}
          <span class="h-when">${esc(fmtDateTime(h.recordedAt || h.at))}</span></div>
        <div class="h-sub">${esc(h.person)}${detail ? ' · ' + detail : ''}</div>
        ${staff && !cancelled && h.type !== 'RECEIVE' ? `<button class="link-btn h-cancel" data-cancel="${esc(h.moveId)}">ยกเลิกรายการนี้</button>` : ''}
      </li>`;
    }).join('')}</ul>${hist.total > hist.moves.length ? `<div class="muted">แสดง ${hist.moves.length} จาก ${hist.total} รายการล่าสุด</div>` : ''}`;
  }

  /* ── คำสั่ง ─────────────────────────────────────────────────────────── */
  m.el.addEventListener('click', async e => {
    const t = e.target.closest('button');
    if (!t) return;
    const item = itemOf(itemId), unit = unitId ? unitOf(unitId) : null;

    if (t.dataset.tab) { tab = t.dataset.tab; render(); if (tab === 'hist') loadHistory(); return; }
    if (t.dataset.pi !== undefined) { photoIdx = Number(t.dataset.pi); render(); return; }
    if (t.dataset.big !== undefined) {
      const photos = [...(unit ? photosOf('UNIT', unit.id) : []), ...photosOf('ITEM', item.id)];
      lightbox(photos[Number(t.dataset.big)]); return;
    }
    if (t.dataset.switch) { unitId = t.dataset.switch; photoIdx = 0; hist = null; render(); if (tab === 'hist') loadHistory(); return; }
    if (t.dataset.cancel) {
      const reason = await reasonBox('ยกเลิกรายการนี้?', 'เหตุผลที่ยกเลิก');
      if (!reason) return;
      const r = await run(t, () => api.moveCancel(t.dataset.cancel, reason), 'ยกเลิกรายการแล้ว');
      if (r.ok) { try { await sync(true); } catch (er) { toast(er.message, 'risk'); } loadHistory(); }
      return;
    }

    const act = t.dataset.act;
    if (!act) return;
    if (['USE', 'RETURN', 'ADJUST', 'MOVE', 'DISPOSE'].includes(act)) {
      const mm = moveDialog(unitId, act, getUser());
      if (mm) mm.closed.then(r => { if (r && tab === 'hist') loadHistory(); else if (r) hist = null; });
    }
    else if (act === 'edit') openItemForm({ mode: 'edit', itemId, unitId });
    else if (act === 'lot') openItemForm({ mode: 'lot', itemId, placeId: unit ? unit.placeId : '' });
    else if (act === 'photos-item') photosDialog({ ownerType: 'ITEM', ownerId: itemId, title: 'รูปของ ' + item.name });
    else if (act === 'photos-unit') photosDialog({ ownerType: 'UNIT', ownerId: unitId, title: 'รูปเฉพาะขวด/ชิ้นนี้' });
    else if (act === 'show-map') {
      m.close();
      window.dispatchEvent(new CustomEvent('labstock:goto', { detail: { page: 'map', placeId: t.dataset.place, flash: true } }));
    }
    else if (act === 'delete') {
      if (!(await confirmBox({ title: 'ลบรายการนี้?', danger: true, okText: 'ลบรายการ',
        message: 'ใช้เมื่อลงข้อมูลผิดเท่านั้น รายการจะหายจากระบบ (ประวัติยังเก็บในชีต)\nถ้าของถูกใช้หมดหรือทิ้งแล้ว ให้ใช้ "จำหน่ายออก" แทน' }))) return;
      const r = await run(t, () => api.unitDelete(unitId), 'ลบรายการแล้ว');
      if (r.ok) { m.close(); try { await sync(true); } catch (er) { toast(er.message, 'risk'); } }
    }
    else if (act === 'archive' || act === 'unarchive') {
      const r = await run(t, () => api.itemSetStatus(itemId, act === 'archive' ? 'ARCHIVED' : 'ACTIVE'),
        act === 'archive' ? 'เก็บเข้าคลังเก่าแล้ว' : 'นำกลับมาใช้งานแล้ว');
      if (r.ok) { try { await sync(true); } catch (er) { toast(er.message, 'risk'); } }
    }
  });

  render();
  return m;
}
