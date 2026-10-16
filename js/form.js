/* ══════════════════════════════════════════════════════════════════════════
   form.js — ฟอร์มรับของเข้า / เพิ่มขวด-ล็อตใหม่ / แก้ไขข้อมูล
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from './api.js';
import { M, sync, itemOf, unitOf, placeOf, placeOptions, opts, categoryType, unitCover, coverOf } from './data.js';
import {
  $, $$, esc, toast, run, openModal, readForm, optionsHtml, datalistHtml, debounce,
  KIND_TH, kindTag, todayYmd, fmtNum, icon
} from './ui.js';
import { photoImg, resizeImage, pickImages } from './photo.js';

const CFG = window.APP_CONFIG;

const KIND_HINT = {
  CHEM:  'ขวด/ภาชนะสารเคมี — ติดตามจำนวนคงเหลือ วันหมดอายุ CAS',
  CONS:  'ของใช้แล้วหมด เช่น ถุงมือ ปลายปิเปต กระดาษกรอง — ติดตามจำนวนคงเหลือ',
  EQUIP: 'เครื่องมือ/อุปกรณ์ที่ใช้ซ้ำ — ติดตามว่าอยู่ที่ไหน (ย้ายที่ได้ ไม่มีเบิก/คืน)'
};

/**
 * @param {Object} o
 *   mode   'new' | 'lot' | 'edit'
 *   itemId (lot / edit)   unitId (edit)   placeId (new / lot: ที่เก็บเริ่มต้น)   kind (new)
 *   onSaved({itemId, unitId})
 */
export function openItemForm(o) {
  const st = {
    mode: o.mode || 'new',
    kind: o.kind || 'CHEM',
    itemId: o.itemId || '',
    unitId: o.unitId || '',
    photo: null,
    v: { receiveDate: todayYmd(), placeId: o.placeId || '' }
  };

  if (st.mode === 'edit') {
    const u = st.unitId ? unitOf(st.unitId) : null;
    st.itemId = u ? u.itemId : st.itemId;
    const it = itemOf(st.itemId);
    if (!it) { toast('ไม่พบรายการ', 'risk'); return null; }
    st.kind = it.kind;
    st.v = {
      name: it.name, nameEn: it.nameEn, brand: it.brand, model: it.model, casNo: it.cas, grade: it.grade,
      category: it.category, unit: it.unit, reorderPoint: it.reorderPoint === null ? '' : it.reorderPoint,
      hazard: it.hazard, storageCondition: it.storage, sdsUrl: it.sdsUrl, defaultSupplier: it.defaultSupplier,
      itemNotes: it.notes
    };
    if (u) Object.assign(st.v, {
      label: u.label, receiveDate: u.receiveDate, expireDate: u.expireDate, supplier: u.supplier,
      price: u.price === null ? '' : u.price, fiscalYear: u.fiscalYear, notes: u.notes, condition: u.condition
    });
  } else if (st.mode === 'lot') {
    const it = itemOf(st.itemId);
    if (!it) { toast('ไม่พบรายการ', 'risk'); return null; }
    st.kind = it.kind;
    st.v.supplier = it.defaultSupplier || '';
  }

  const titles = { new: 'เพิ่มของใหม่', lot: 'รับเข้าเพิ่ม (ขวด/ล็อตใหม่)', edit: 'แก้ไขข้อมูล' };
  const m = openModal({ title: titles[st.mode], wide: true, body: '<form id="f" autocomplete="off"></form>',
    foot: `<span class="err" id="fe-err" role="alert"></span><span class="spacer"></span>
           <button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn" id="f-ok">${st.mode === 'edit' ? 'บันทึกการแก้ไข' : 'บันทึก'}</button>`
  });

  /* ── วาดฟอร์ม ───────────────────────────────────────────────────────── */
  function render() {
    const v = st.v, k = st.kind, it = st.mode !== 'new' ? itemOf(st.itemId) : null;
    const isEquip = k === 'EQUIP', isChem = k === 'CHEM';
    const showItemFields = st.mode !== 'lot';
    const showUnitFields = !(st.mode === 'edit' && !st.unitId);
    const val = key => esc(v[key] === undefined || v[key] === null ? '' : v[key]);

    $('#f', m.el).innerHTML = `
      ${st.mode === 'new' ? `
      <div class="kind-pick" role="radiogroup" aria-label="ชนิดของ">
        ${['CHEM', 'CONS', 'EQUIP'].map(x => `
          <label class="kind-card ${x === k ? 'on' : ''}">
            <input type="radio" name="kind" value="${x}" ${x === k ? 'checked' : ''}>
            <b>${esc(KIND_TH[x])}</b><span>${esc(KIND_HINT[x])}</span>
          </label>`).join('')}
      </div>` : ''}

      ${st.mode === 'lot' ? `
      <div class="note note-info itemline">
        <b>${esc(it.name)}</b> ${kindTag(it.kind)}
        <span class="muted">${esc([it.brand, it.model, it.cas].filter(Boolean).join(' · '))}</span>
        <div class="hint">เพิ่มเป็นขวด/ล็อตใหม่ของรายการเดิม — ข้อมูลของรายการ (ชื่อ ยี่ห้อ CAS) ใช้ตามเดิม</div>
      </div>` : ''}

      ${showItemFields ? `
      <fieldset class="fs">
        <legend>${st.mode === 'edit' ? 'ข้อมูลของรายการ' : 'รายการ'}</legend>
        <div class="field"><label>ชื่อ *</label>
          <input name="name" value="${val('name')}" maxlength="120" required ${st.mode === 'new' ? 'autofocus' : ''}
                 placeholder="${isChem ? 'เช่น Ethanol absolute' : isEquip ? 'เช่น เครื่องชั่งทศนิยม 4 ตำแหน่ง' : 'เช่น ถุงมือไนไตรล์ ไซส์ M'}">
          <div id="sugg" class="sugg"></div></div>
        <div class="row-2">
          <div class="field"><label>ชื่ออังกฤษ / ชื่อเรียกอื่น</label><input name="nameEn" value="${val('nameEn')}" maxlength="120"></div>
          <div class="field"><label>หมวดหมู่</label>
            <input name="category" value="${val('category')}" maxlength="60" list="dl-cat" placeholder="เลือกหรือพิมพ์ใหม่"></div>
        </div>
        <div class="row-3">
          <div class="field"><label>ยี่ห้อ</label><input name="brand" value="${val('brand')}" maxlength="80"></div>
          <div class="field"><label>รุ่น / เบอร์ / ขนาด</label><input name="model" value="${val('model')}" maxlength="80"></div>
          ${isChem ? `<div class="field"><label>เลข CAS</label><input name="casNo" class="mono" value="${val('casNo')}" maxlength="30" placeholder="64-17-5"></div>`
                   : `<div class="field"><label>หน่วยนับ</label><input name="unit" value="${val('unit') || 'pcs'}" maxlength="20" list="dl-unit"></div>`}
        </div>
        ${isChem ? `
        <div class="row-3">
          <div class="field"><label>หน่วยนับ</label><input name="unit" value="${val('unit') || 'mL'}" maxlength="20" list="dl-unit"></div>
          <div class="field"><label>เกรด</label><input name="grade" value="${val('grade')}" maxlength="40" placeholder="AR / HPLC / Technical"></div>
          <div class="field"><label>ความอันตราย</label><input name="hazard" value="${val('hazard')}" maxlength="120" list="dl-haz"></div>
        </div>
        <div class="row-2">
          <div class="field"><label>การเก็บรักษา</label><input name="storageCondition" value="${val('storageCondition')}" maxlength="60" list="dl-sto"></div>
          <div class="field"><label>ลิงก์เอกสาร SDS</label><input name="sdsUrl" type="url" value="${val('sdsUrl')}" maxlength="500" placeholder="https://…"></div>
        </div>` : ''}
        ${!isEquip ? `
        <div class="row-2">
          <div class="field"><label>แจ้งเมื่อคงเหลือรวมต่ำกว่า (${esc(v.unit || '')})</label>
            <input name="reorderPoint" type="number" inputmode="decimal" step="any" min="0" value="${val('reorderPoint')}" placeholder="ไม่ใส่ = ไม่แจ้ง">
            <div class="hint">รวมทุกขวดของรายการนี้</div></div>
          <div class="field"><label>ผู้จำหน่ายประจำ</label><input name="defaultSupplier" value="${val('defaultSupplier')}" maxlength="80" list="dl-sup"></div>
        </div>` : ''}
        ${st.mode === 'edit' ? `<div class="field"><label>หมายเหตุของรายการ</label><textarea name="itemNotes" rows="2" maxlength="1000">${val('itemNotes')}</textarea></div>` : ''}
      </fieldset>` : ''}

      ${showUnitFields ? `
      <fieldset class="fs">
        <legend>${st.mode === 'edit' ? 'ข้อมูลขวด/ชิ้นนี้' : isEquip ? 'เครื่องที่รับเข้า' : 'ขวด / ล็อตที่รับเข้า'}</legend>
        <div class="row-3">
          ${st.mode === 'edit' || isEquip ? '' : `
          <div class="field"><label>จำนวน (${esc((it ? it.unit : v.unit) || '')}) *</label>
            <input name="qty" type="number" inputmode="decimal" step="any" min="0" value="${val('qty')}" required></div>`}
          ${st.mode === 'edit' ? '' : `
          <div class="field ${isEquip ? 'span2' : 'span2'}"><label>เก็บที่</label>
            <select name="placeId">${placeOptions(v.placeId || '', { blank: '— ยังไม่ระบุที่เก็บ —' })}</select></div>`}
        </div>
        <div class="row-3">
          <div class="field"><label>${isEquip ? 'หมายเลขเครื่อง (Serial)' : 'เลขล็อต / ชื่อเรียก'}</label>
            <input name="label" value="${val('label')}" maxlength="80"></div>
          <div class="field"><label>วันที่รับเข้า</label><input name="receiveDate" type="date" value="${val('receiveDate')}"></div>
          ${isEquip ? `<div class="field"><label>สภาพ</label>
            <select name="condition">${optionsHtml([{ value: 'OK', label: 'ใช้งานได้' }, { value: 'BROKEN', label: 'ชำรุด' }], v.condition || 'OK')}</select></div>`
            : `<div class="field"><label>วันหมดอายุ</label><input name="expireDate" type="date" value="${val('expireDate')}"></div>`}
        </div>
        ${!isEquip && st.mode === 'edit' ? `<div class="field"><label>สภาพ</label>
            <select name="condition">${optionsHtml([{ value: 'OK', label: 'ปกติ' }, { value: 'BROKEN', label: 'ชำรุด / ภาชนะแตก' }], v.condition || 'OK')}</select></div>` : ''}
        <div class="row-3">
          <div class="field"><label>ผู้จำหน่าย</label><input name="supplier" value="${val('supplier')}" maxlength="80" list="dl-sup"></div>
          <div class="field"><label>ราคา (บาท)</label><input name="price" type="number" inputmode="decimal" step="any" min="0" value="${val('price')}"></div>
          <div class="field"><label>ปีงบประมาณ</label><input name="fiscalYear" value="${val('fiscalYear')}" maxlength="10" list="dl-fy" placeholder="อัตโนมัติ"></div>
        </div>
        <div class="field"><label>หมายเหตุ</label><textarea name="notes" rows="2" maxlength="1000">${val('notes')}</textarea></div>
      </fieldset>` : ''}

      ${st.mode !== 'edit' ? `
      <div class="photo-row">
        <button type="button" class="btn btn-ghost" id="f-photo">${icon.camera} ${st.photo ? 'เปลี่ยนรูป' : 'แนบรูป (ไม่บังคับ)'}</button>
        ${st.photo ? `<img class="photo-prev" src="${st.photo.dataUrl}" alt="รูปที่เลือก"><button type="button" class="link-btn" id="f-photo-x">เอาออก</button>` : ''}
        <span class="muted">${st.mode === 'new' ? 'รูปจะผูกกับรายการนี้' : 'รูปจะผูกกับขวด/ล็อตนี้'}</span>
      </div>` : ''}

      ${datalistHtml('dl-cat', opts(categoryType(k)))}
      ${datalistHtml('dl-unit', opts('Unit'))}
      ${datalistHtml('dl-sup', opts('Supplier'))}
      ${datalistHtml('dl-fy', opts('FiscalYear'))}
      ${datalistHtml('dl-haz', opts('Hazard'))}
      ${datalistHtml('dl-sto', opts('Storage'))}
    `;
  }

  /** เก็บค่าที่กรอกไว้ใน state ก่อนวาดใหม่ */
  function keep() {
    const f = readForm($('#f', m.el));
    delete f.kind;
    Object.assign(st.v, f);
  }
  render();

  /* ── ตอบสนองการกรอก ─────────────────────────────────────────────────── */
  const sugg = debounce(() => {
    const box = $('#sugg', m.el);
    if (!box || st.mode !== 'new') return;
    const q = ($('[name=name]', m.el).value || '').toLowerCase().trim();
    if (q.length < 2) { box.innerHTML = ''; return; }
    const toks = q.split(/\s+/);
    const hits = [...M().items.values()].filter(it =>
      it.kind === st.kind && it.status === 'ACTIVE' &&
      toks.every(t => (it.name + ' ' + it.nameEn + ' ' + it.brand + ' ' + it.model + ' ' + it.cas).toLowerCase().includes(t))
    ).slice(0, 5);
    box.innerHTML = hits.length ? `
      <div class="sugg-head">มีรายการนี้อยู่แล้วหรือไม่? กดเพื่อเพิ่มเป็นขวด/ล็อตใหม่ของรายการเดิม (ไม่ต้องสร้างซ้ำ)</div>
      ${hits.map(it => `<button type="button" class="sugg-item" data-use="${esc(it.id)}">
        <b>${esc(it.name)}</b> <span class="muted">${esc([it.brand, it.model, it.cas].filter(Boolean).join(' · '))}</span>
        <span class="sugg-go">เพิ่มเป็นล็อตใหม่ ${icon.chev}</span></button>`).join('')}` : '';
  }, 120);

  m.el.addEventListener('input', e => { if (e.target.name === 'name') sugg(); });

  m.el.addEventListener('change', e => {
    if (e.target.name === 'kind') {
      keep(); st.kind = e.target.value;
      st.v.unit = st.kind === 'CHEM' ? 'mL' : 'pcs'; st.v.category = '';
      render();
    }
  });

  m.el.addEventListener('click', async e => {
    const use = e.target.closest('[data-use]');
    if (use) { switchToLot(use.dataset.use); return; }
    if (e.target.closest('#f-photo')) {
      const [file] = await pickImages({});
      if (!file) return;
      try { keep(); st.photo = await resizeImage(file, CFG.PHOTO_MAX_SIDE_ITEM, 0.82); render(); }
      catch (err) { toast(err.message, 'risk'); }
    }
    if (e.target.closest('#f-photo-x')) { keep(); st.photo = null; render(); }
  });

  function switchToLot(itemId) {
    keep();
    const keepVals = { receiveDate: st.v.receiveDate, placeId: st.v.placeId, label: st.v.label,
      qty: st.v.qty, notes: st.v.notes, price: st.v.price };
    st.mode = 'lot'; st.itemId = itemId; st.kind = itemOf(itemId).kind;
    st.v = { ...keepVals, supplier: itemOf(itemId).defaultSupplier || '' };
    m.setTitle(titles.lot);
    render();
  }

  /* ── บันทึก ─────────────────────────────────────────────────────────── */
  const itemFields = f => ({
    name: f.name, nameEn: f.nameEn, brand: f.brand, model: f.model, category: f.category, unit: f.unit,
    casNo: f.casNo, grade: f.grade, hazard: f.hazard, storageCondition: f.storageCondition,
    sdsUrl: f.sdsUrl, reorderPoint: f.reorderPoint, defaultSupplier: f.defaultSupplier
  });
  const unitFields = f => ({
    label: f.label, receiveDate: f.receiveDate, expireDate: f.expireDate, supplier: f.supplier,
    price: f.price, fiscalYear: f.fiscalYear, notes: f.notes, condition: f.condition
  });
  const strip = obj => { Object.keys(obj).forEach(k => { if (obj[k] === undefined) delete obj[k]; }); return obj; };

  async function save() {
    const form = $('#f', m.el);
    const err = $('#fe-err', m.el);
    err.textContent = '';
    if (!form.reportValidity()) return;
    keep();
    const f = st.v;

    const btn = $('#f-ok', m.el);
    const r = await run(btn, async () => {
      let result;
      if (st.mode === 'edit') {
        await api.itemSave(strip({ itemId: st.itemId, kind: st.kind, ...itemFields(f), notes: f.itemNotes }));
        if (st.unitId) await api.unitSave(strip({ unitId: st.unitId, ...unitFields(f) }));
        result = { itemId: st.itemId, unitId: st.unitId };
      } else if (st.mode === 'lot') {
        result = await api.unitSave(strip({ itemId: st.itemId, qty: f.qty, placeId: f.placeId, ...unitFields(f) }));
      } else {
        result = await api.unitSave(strip({
          item: strip({ kind: st.kind, ...itemFields(f) }),
          qty: f.qty, placeId: f.placeId, ...unitFields(f)
        }));
      }
      if (st.photo && st.mode !== 'edit') {
        try {
          await api.photoUpload({
            ownerType: st.mode === 'new' ? 'ITEM' : 'UNIT', ownerId: st.mode === 'new' ? result.itemId : result.unitId,
            data: st.photo.data, width: st.photo.width, height: st.photo.height
          });
        } catch (pe) { toast('บันทึกแล้ว แต่แนบรูปไม่สำเร็จ: ' + pe.message, 'risk'); }
      }
      return result;
    }, 'บันทึกแล้ว');

    if (!r.ok) {
      const e = r.error;
      if (e && e.code === 'DUPLICATE_ITEM' && e.data && e.data.itemId) {
        err.innerHTML = `${esc(e.message)} <button type="button" class="link-btn" id="f-dup">ใช้รายการเดิม</button>`;
        $('#f-dup', m.el).addEventListener('click', () => switchToLot(e.data.itemId));
      } else err.textContent = e ? e.message : 'บันทึกไม่สำเร็จ';
      return;
    }
    m.close(r.value);
    try { await sync(true); } catch (e2) { toast(e2.message, 'risk'); }
    if (o.onSaved) o.onSaved(r.value);
  }

  $('#f-ok', m.el).addEventListener('click', save);
  $('#f', m.el).addEventListener('submit', e => { e.preventDefault(); save(); });
  return m;
}
