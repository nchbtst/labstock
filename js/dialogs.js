/* ══════════════════════════════════════════════════════════════════════════
   dialogs.js — หน้าต่างย่อยที่ใช้ร่วมกัน: รูปภาพ · เบิก/คืน/ย้าย/จำหน่าย · ที่เก็บ
   ══════════════════════════════════════════════════════════════════════════ */
import { api, can } from './api.js';
import { M, sync, onChange, placeOf, itemOf, unitOf, photosOf, placeOptions, pathOf, descendantIds } from './data.js';
import {
  $, $$, esc, toast, run, openModal, confirmBox, readForm, optionsHtml, icon, fmtNum, todayYmd,
  PLACE_KIND_TH, MOVE_TH
} from './ui.js';
import { photoImg, photoSrc, resizeImage, pickImages } from './photo.js';

const CFG = window.APP_CONFIG;

/* ══════════════════════════════════════════════════════════════════════════
   ดูรูปขนาดใหญ่
   ══════════════════════════════════════════════════════════════════════════ */
export function lightbox(photo) {
  if (!photo) return;
  openModal({
    title: esc(photo.caption || 'รูปภาพ'), className: 'lightbox', wide: true,
    body: `<div class="lb-wrap"><img src="${esc(photoSrc(photo.fileId, 1600))}" data-fid="${esc(photo.fileId)}" data-w="1600" alt="${esc(photo.caption)}"></div>`
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   จัดการรูปของที่เก็บ / ของ / ขวด
   ══════════════════════════════════════════════════════════════════════════ */
export function photosDialog({ ownerType, ownerId, title }) {
  const editable = can('staff');
  const m = openModal({ title: esc(title || 'รูปภาพ'), wide: true, body: '<div id="pd"></div>' });
  const unsub = onChange(render);
  m.closed.then(unsub);
  let busy = false;

  function render() {
    const list = photosOf(ownerType, ownerId);
    const box = $('#pd', m.el);
    if (!box) return;
    box.innerHTML = `
      ${editable ? `
      <div class="pd-bar">
        <button class="btn" id="pd-cam">${icon.camera} ถ่ายรูป</button>
        <button class="btn btn-ghost" id="pd-file">${icon.image} เลือกรูปจากเครื่อง</button>
        <span class="muted" id="pd-note">รูปจะถูกย่อในเครื่องก่อนอัปโหลด · สูงสุด 8 รูป</span>
      </div>` : ''}
      ${ownerType === 'PLACE' ? `<div class="note note-info">รูปแรก (รูปหลัก) คือรูปที่ใช้วางปุ่มของที่เก็บข้างใน
        ถ้าเปลี่ยนรูปหลัก ตำแหน่งปุ่มที่วางไว้บนรูปเดิมอาจไม่ตรงกับรูปใหม่</div>` : ''}
      ${list.length ? `<div class="pd-grid">${list.map((p, i) => `
        <figure class="pd-item" data-id="${esc(p.id)}">
          <button class="pd-thumb" data-open="${esc(p.id)}" title="ดูรูปใหญ่">${photoImg(p, 400, { noRatio: true })}</button>
          ${i === 0 ? '<span class="pd-cover">รูปหลัก</span>' : ''}
          ${editable ? `<figcaption>
            <input class="pd-cap" data-cap="${esc(p.id)}" value="${esc(p.caption)}" maxlength="120" placeholder="คำบรรยาย (ไม่บังคับ)">
            <div class="pd-act">
              ${i !== 0 ? `<button class="btn btn-ghost btn-sm" data-cover="${esc(p.id)}">ตั้งเป็นรูปหลัก</button>` : ''}
              <button class="btn btn-ghost btn-sm" data-del="${esc(p.id)}">${icon.trash} ลบ</button>
            </div></figcaption>` : (p.caption ? `<figcaption><span class="muted">${esc(p.caption)}</span></figcaption>` : '')}
        </figure>`).join('')}</div>`
        : `<div class="empty"><b>ยังไม่มีรูป</b>${editable ? 'กด "ถ่ายรูป" หรือ "เลือกรูปจากเครื่อง" เพื่อเพิ่ม' : ''}</div>`}`;
  }
  render();

  async function upload(files) {
    if (!files.length || busy) return;
    busy = true;
    const note = $('#pd-note', m.el);
    const maxSide = ownerType === 'PLACE' ? CFG.PHOTO_MAX_SIDE_PLACE : CFG.PHOTO_MAX_SIDE_ITEM;
    let done = 0;
    for (const f of files) {
      if (note) note.textContent = `กำลังอัปโหลด ${done + 1}/${files.length} …`;
      try {
        const img = await resizeImage(f, maxSide, 0.82);
        await api.photoUpload({ ownerType, ownerId, data: img.data, width: img.width, height: img.height });
        done++;
      } catch (e) {
        toast(e.message, 'risk');
        break;
      }
    }
    busy = false;
    if (done) { toast(`อัปโหลด ${done} รูปแล้ว`, 'ok'); }
    try { await sync(true); } catch (e) { toast(e.message, 'risk'); }
  }

  m.el.addEventListener('click', async e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'pd-cam')  return upload(await pickImages({ capture: true }));
    if (t.id === 'pd-file') return upload(await pickImages({ multiple: true }));
    if (t.dataset.open) return lightbox(photosOf(ownerType, ownerId).find(p => p.id === t.dataset.open));
    if (t.dataset.del) {
      if (!(await confirmBox({ title: 'ลบรูปนี้?', message: 'รูปจะถูกลบออกจากระบบและย้ายไปถังขยะใน Google Drive', okText: 'ลบรูป', danger: true }))) return;
      const r = await run(t, () => api.photoDelete(t.dataset.del), 'ลบรูปแล้ว');
      if (r.ok) await sync(true);
    }
    if (t.dataset.cover) {
      if (ownerType === 'PLACE' && placeOf(ownerId) && placeOf(ownerId).children.some(c => placeOf(c).geom)) {
        if (!(await confirmBox({ title: 'เปลี่ยนรูปหลัก?', okText: 'เปลี่ยน',
          message: 'ปุ่มที่วางไว้บนรูปเดิมจะอยู่ตำแหน่งเดิม (เป็นสัดส่วนของรูป) ถ้ารูปใหม่มุมกล้องต่างกัน ต้องไล่ปรับปุ่มใหม่' }))) return;
      }
      const r = await run(t, () => api.photoUpdate({ photoId: t.dataset.cover, makeCover: true }), 'ตั้งเป็นรูปหลักแล้ว');
      if (r.ok) await sync(true);
    }
  });
  m.el.addEventListener('change', async e => {
    const inp = e.target.closest('[data-cap]');
    if (!inp) return;
    const r = await run(null, () => api.photoUpdate({ photoId: inp.dataset.cap, caption: inp.value }), 'บันทึกคำบรรยายแล้ว');
    if (r.ok) sync(true).catch(() => {});
  });
  return m;
}

/* ══════════════════════════════════════════════════════════════════════════
   เบิก · คืน · ปรับยอด · ย้ายที่ · จำหน่ายออก
   ══════════════════════════════════════════════════════════════════════════ */
export function moveDialog(unitId, type, user) {
  const u = unitOf(unitId), item = u && itemOf(u.itemId);
  if (!u || !item) { toast('ไม่พบรายการนี้', 'risk'); return null; }

  const unitLabel = esc(item.unit);
  const titles = { USE: 'เบิกใช้', RETURN: 'คืนของ', ADJUST: 'ปรับยอดคงเหลือ', MOVE: 'ย้ายที่เก็บ', DISPOSE: 'จำหน่ายออก' };
  const who = `
    <div class="field"><label>ผู้ทำรายการ</label>
      <input name="person" value="${esc(user ? user.name : '')}" maxlength="80"></div>`;

  let fields = '';
  if (type === 'USE') fields = `
    <div class="field"><label>จำนวนที่ใช้ (${unitLabel}) *</label>
      <input name="qty" type="number" inputmode="decimal" step="any" min="0" max="${u.balance}" required autofocus>
      <div class="hint">คงเหลือ ${fmtNum(u.balance)} ${unitLabel}</div></div>
    ${who}
    <div class="field"><label>ใช้เพื่อ</label><input name="purpose" maxlength="200" placeholder="เช่น เตรียมสารละลายบัฟเฟอร์"></div>`;
  else if (type === 'RETURN') fields = `
    <div class="field"><label>จำนวนที่คืน (${unitLabel}) *</label>
      <input name="qty" type="number" inputmode="decimal" step="any" min="0" required autofocus></div>
    ${who}
    <div class="field"><label>หมายเหตุ</label><input name="notes" maxlength="300"></div>`;
  else if (type === 'ADJUST') fields = `
    <div class="field"><label>นับได้จริง (${unitLabel}) *</label>
      <input name="newBalance" type="number" inputmode="decimal" step="any" min="0" required autofocus value="${u.balance}">
      <div class="hint">ระบบบันทึกส่วนต่างให้เอง · ยอดในระบบตอนนี้ ${fmtNum(u.balance)} ${unitLabel}</div></div>
    <div class="field"><label>เหตุผล</label><input name="notes" maxlength="300" placeholder="เช่น นับสต็อกประจำปี / ระเหย / หก"></div>`;
  else if (type === 'MOVE') fields = `
    <div class="field"><label>ย้ายไปที่ *</label>
      <select name="toPlaceId" required autofocus>${placeOptions('', { blank: '— เลือกที่เก็บปลายทาง —', exclude: [u.placeId] })}</select>
      <div class="hint">ตอนนี้อยู่ที่: ${u.placeId && placeOf(u.placeId) ? esc(placeOf(u.placeId).pathText) : 'ยังไม่ได้ระบุที่เก็บ'}</div></div>
    ${who}
    <div class="field"><label>หมายเหตุ</label><input name="notes" maxlength="300"></div>`;
  else if (type === 'DISPOSE') fields = `
    <div class="note note-warn">จะตัดยอด ${item.kind === 'EQUIP' ? 'ชิ้นนี้' : fmtNum(u.balance) + ' ' + unitLabel} ออกจากคลังทั้งหมด
      รายการจะไม่แสดงในหน้าปกติอีก (ดูได้ที่ตัวกรอง "จำหน่ายแล้ว") และยกเลิกย้อนหลังได้</div>
    <div class="field"><label>เหตุผล *</label>
      <input name="notes" maxlength="300" required autofocus placeholder="เช่น หมดอายุ / ชำรุดซ่อมไม่ได้ / บริจาค"></div>`;

  const m = openModal({
    title: esc(titles[type]) + ' · ' + esc(item.name),
    body: `<form id="mv-form" autocomplete="off">${fields}</form>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn ${type === 'DISPOSE' ? 'btn-risk' : ''}" id="mv-ok">${esc(titles[type])}</button>`
  });
  const submit = async () => {
    const f = readForm(m.el);
    const form = $('#mv-form', m.el);
    if (!form.reportValidity()) return;
    const payload = { unitId, type, ...f };
    if (type === 'USE' || type === 'RETURN') payload.qty = Number(f.qty);
    const r = await run($('#mv-ok', m.el), () => api.movePost(payload), titles[type] + 'แล้ว');
    if (r.ok) { m.close(true); try { await sync(true); } catch (e) { toast(e.message, 'risk'); } }
  };
  $('#mv-ok', m.el).addEventListener('click', submit);
  $('#mv-form', m.el).addEventListener('submit', e => { e.preventDefault(); submit(); });
  return m;
}

/* ══════════════════════════════════════════════════════════════════════════
   ที่เก็บ: สร้าง / แก้ชื่อ / สี / ย้าย / ลบ
   ══════════════════════════════════════════════════════════════════════════ */
const RANK = ['ROOM', 'CABINET', 'SHELF', 'BOX'];
export const ZONE_COLORS = ['#0b5d73', '#1e6b45', '#8a5a09', '#99202f', '#5b3f9e', '#a0436b', '#3b6fb0', '#5f6b72'];

/**
 * @param {Object} o { placeId?, parentId?, geom?, name?, kind?, onDone? }
 */
export function placeDialog(o) {
  const editing = !!o.placeId;
  const cur = editing ? placeOf(o.placeId) : null;
  if (editing && !cur) { toast('ไม่พบที่เก็บนี้', 'risk'); return null; }

  const parentId = editing ? cur.parentId : (o.parentId || '');
  const parent = parentId ? placeOf(parentId) : null;
  const minRank = parent ? RANK.indexOf(parent.kind) + 1 : 0;
  const maxRank = editing && cur.children.length
    ? Math.min(...cur.children.map(c => RANK.indexOf(placeOf(c).kind))) - 1 : 3;
  const kinds = RANK.filter((k, i) => i >= minRank && i <= maxRank);
  const defKind = editing ? cur.kind : (o.kind && kinds.includes(o.kind) ? o.kind : (kinds[0] || 'BOX'));
  const color = editing ? cur.color : (o.color || '');

  const m = openModal({
    title: editing ? 'แก้ไขที่เก็บ' : 'เพิ่มที่เก็บ' + (parent ? ' ใน ' + esc(parent.name) : ''),
    body: `<form id="pl-form" autocomplete="off">
      <div class="field"><label>ชื่อ *</label>
        <input name="name" value="${esc(editing ? cur.name : (o.name || ''))}" maxlength="80" required autofocus
               placeholder="เช่น ชั้น 2 · ตู้เหล็ก A · ห้อง 204"></div>
      <div class="row-2">
        <div class="field"><label>ชนิด</label>
          <select name="kind">${kinds.map(k => `<option value="${k}"${k === defKind ? ' selected' : ''}>${esc(PLACE_KIND_TH[k])}</option>`).join('')}</select></div>
        <div class="field"><label>สีของปุ่ม</label>
          <div class="swatches" id="pl-colors">
            <button type="button" class="sw sw-none${color ? '' : ' on'}" data-c="" title="อัตโนมัติ">∅</button>
            ${ZONE_COLORS.map(c => `<button type="button" class="sw${c === color ? ' on' : ''}" data-c="${c}" style="--c:${c}" title="${c}"></button>`).join('')}
          </div><input type="hidden" name="color" value="${esc(color)}"></div>
      </div>
      <div class="field"><label>หมายเหตุ</label><textarea name="notes" rows="2" maxlength="500">${esc(editing ? cur.notes : '')}</textarea></div>
      ${editing ? `<div class="field"><label>ย้ายไปไว้ใน</label>
        <select name="parentId">${placeOptions(parentId, { blank: '— ระดับบนสุด —', exclude: [cur.id, ...descendantIds(cur.id)] })}</select>
        <div class="hint">ถ้าย้ายไปที่อื่น ปุ่มบนรูปเดิมจะถูกเอาออก ต้องวางใหม่บนรูปของที่เก็บใหม่</div></div>` : ''}
    </form>`,
    foot: `${editing ? `<button class="btn btn-ghost btn-danger-text" id="pl-del">${icon.trash} ลบที่เก็บนี้</button><span class="spacer"></span>` : ''}
           <button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn" id="pl-ok">บันทึก</button>`
  });

  $('#pl-colors', m.el).addEventListener('click', e => {
    const b = e.target.closest('.sw'); if (!b) return;
    $$('.sw', m.el).forEach(x => x.classList.toggle('on', x === b));
    $('[name=color]', m.el).value = b.dataset.c;
  });

  const submit = async () => {
    const form = $('#pl-form', m.el);
    if (!form.reportValidity()) return;
    const f = readForm(m.el);
    const payload = { name: f.name, kind: f.kind, color: f.color, notes: f.notes };
    if (editing) { payload.placeId = cur.id; if (f.parentId !== parentId) payload.parentId = f.parentId; }
    else { payload.parentId = parentId; if (o.geom) payload.geom = o.geom; }
    const r = await run($('#pl-ok', m.el), () => api.placeSave(payload), 'บันทึกแล้ว');
    if (r.ok) {
      m.close(true);
      try { await sync(true); } catch (e) { toast(e.message, 'risk'); }
      if (o.onDone) o.onDone(r.value);
    }
  };
  $('#pl-ok', m.el).addEventListener('click', submit);
  $('#pl-form', m.el).addEventListener('submit', e => { e.preventDefault(); submit(); });

  if (editing) $('#pl-del', m.el).addEventListener('click', async () => {
    const n = cur.deep;
    if (!(await confirmBox({
      title: 'ลบ "' + cur.name + '" ?', danger: true, okText: 'ลบที่เก็บ',
      message: n ? `ที่เก็บนี้ยังมีของ ${n} รายการ — ระบบจะไม่ยอมให้ลบจนกว่าจะย้ายของออก` : 'รูปของที่เก็บนี้จะถูกลบด้วย (ลบแล้วเอากลับไม่ได้)'
    }))) return;
    const r = await run($('#pl-del', m.el), () => api.placeDelete(cur.id), 'ลบที่เก็บแล้ว');
    if (r.ok) {
      m.close(true);
      try { await sync(true); } catch (e) { toast(e.message, 'risk'); }
      if (o.onDeleted) o.onDeleted();
    }
  });
  return m;
}
