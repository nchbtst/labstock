/* ══════════════════════════════════════════════════════════════════════════
   data.js — แบบจำลองข้อมูลในเครื่อง (สร้างจาก snapshot) และการซิงก์

   snapshot เป็นตารางแบน {fields, rows} → ที่นี่แปลงเป็นวัตถุที่เชื่อมกันแล้ว:
   ที่เก็บเป็นต้นไม้ · ขวด/ชิ้นรู้จักของและที่เก็บของตัวเอง · มีจำนวนของในแต่ละที่เก็บ
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from './api.js';
import { loadSnapshot, saveSnapshot } from './store.js';
import { parseYmd, esc, KIND_TH } from './ui.js';

const CFG = window.APP_CONFIG;
const DAY = 86400000;

const empty = () => ({
  version: null, builtAt: null,
  items: new Map(), units: new Map(), places: new Map(), roots: [],
  photos: new Map(), unitsByPlace: new Map(), settings: {}, rows: [], itemTotals: new Map(),
  counts: { items: 0, units: 0, places: 0 }
});

let model = empty();
const listeners = new Set();

export function M() { return model; }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { listeners.forEach(fn => { try { fn(model); } catch (e) { console.error(e); } }); }

const collator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' });

const asObjs = t => t.rows.map(r => { const o = {}; t.fields.forEach((f, i) => { o[f] = r[i]; }); return o; });
const numOrNull = v => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);

/* ── สร้างแบบจำลอง ───────────────────────────────────────────────────────── */
export function buildModel(snap) {
  const m = empty();
  m.version = snap.version; m.builtAt = snap.builtAt; m.settings = snap.settings || {};

  const today = new Date(); today.setHours(0, 0, 0, 0);

  // ── ที่เก็บ ──
  for (const o of asObjs(snap.places)) {
    const hasGeom = o.X !== '' && o.W !== '' && !isNaN(Number(o.X)) && !isNaN(Number(o.W));
    m.places.set(o.PlaceID, {
      id: o.PlaceID, parentId: o.ParentID || '', kind: o.Kind, name: o.Name,
      geom: hasGeom ? { x: Number(o.X), y: Number(o.Y), w: Number(o.W), h: Number(o.H) } : null,
      color: o.Color || '', sort: Number(o.Sort) || 0, notes: o.Notes || '',
      children: [], direct: 0, deep: 0, pathText: '', depth: 0
    });
  }
  for (const p of m.places.values()) {
    const parent = p.parentId && m.places.get(p.parentId);
    if (parent) parent.children.push(p.id); else m.roots.push(p.id);
  }
  const bySort = (a, b) => {
    const pa = m.places.get(a), pb = m.places.get(b);
    return (pa.sort - pb.sort) || collator.compare(pa.name, pb.name);
  };
  m.roots.sort(bySort);
  for (const p of m.places.values()) p.children.sort(bySort);

  (function walk(ids, prefix, depth) {
    for (const id of ids) {
      const p = m.places.get(id);
      p.pathText = prefix ? prefix + ' › ' + p.name : p.name;
      p.depth = depth;
      walk(p.children, p.pathText, depth + 1);
    }
  })(m.roots, '', 0);

  // ── รูป ──
  for (const o of asObjs(snap.photos)) {
    const key = o.OwnerType + ':' + o.OwnerID;
    if (!m.photos.has(key)) m.photos.set(key, []);
    m.photos.get(key).push({
      id: o.PhotoID, fileId: o.DriveFileID, width: Number(o.Width) || 0, height: Number(o.Height) || 0,
      caption: o.Caption || '', sort: Number(o.Sort) || 0
    });
  }
  for (const list of m.photos.values()) list.sort((a, b) => a.sort - b.sort);

  // ── ของ ──
  for (const o of asObjs(snap.items)) {
    m.items.set(o.ItemID, {
      id: o.ItemID, kind: o.Kind, name: o.Name, nameEn: o.NameEn || '', brand: o.Brand || '', model: o.Model || '',
      cas: o.CASNo || '', grade: o.Grade || '', category: o.Category || '', unit: o.Unit || 'pcs',
      reorderPoint: numOrNull(o.ReorderPoint), defaultSupplier: o.DefaultSupplier || '', sdsUrl: o.SdsUrl || '',
      hazard: o.Hazard || '', storage: o.StorageCondition || '', notes: o.Notes || '',
      status: String(o.Status || 'ACTIVE').toUpperCase()
    });
  }

  // ── ขวด/ชิ้น ──
  for (const o of asObjs(snap.units)) {
    const bal = Number(snap.balances[o.UnitID] || 0);
    const status = String(o.Status || 'ACTIVE').toUpperCase();
    const exp = parseYmd(o.ExpireDate);
    const daysLeft = exp ? Math.round((exp.getTime() - today.getTime()) / DAY) : null;
    const u = {
      id: o.UnitID, itemId: o.ItemID, label: o.Label || '', placeId: o.PlaceID || '',
      qtyInitial: Number(o.QtyInitial) || 0, receiveDate: o.ReceiveDate || '', expireDate: o.ExpireDate || '',
      price: numOrNull(o.Price), supplier: o.Supplier || '', fiscalYear: String(o.FiscalYear || ''),
      condition: String(o.Condition || 'OK').toUpperCase(), notes: o.Notes || '', status,
      balance: bal, daysLeft,
      expiry: daysLeft === null ? 'none' : daysLeft < 0 ? 'expired' : daysLeft <= CFG.EXPIRE_WARN_DAYS ? 'soon' : 'ok'
    };
    m.units.set(u.id, u);
    if (u.placeId) {
      if (!m.unitsByPlace.has(u.placeId)) m.unitsByPlace.set(u.placeId, []);
      m.unitsByPlace.get(u.placeId).push(u);
    }
  }

  // ── ผลรวมคงเหลือต่อชนิด และจำนวนของต่อที่เก็บ (นับขวดที่ยังไม่จำหน่าย) ──
  for (const u of m.units.values()) {
    if (u.status !== 'ACTIVE') continue;
    m.itemTotals.set(u.itemId, (m.itemTotals.get(u.itemId) || 0) + u.balance);
    let p = m.places.get(u.placeId);
    if (p) p.direct++;
    while (p) { p.deep++; p = m.places.get(p.parentId); }
  }

  m.counts = { items: m.items.size, units: m.units.size, places: m.places.size };
  m.rows = buildRows(m);
  return m;
}

/* ── แถวสำหรับตารางรายการ/ค้นหา: 1 ขวด/ชิ้น = 1 แถว (ของที่ไม่มีขวดมี 1 แถวว่าง) ── */
function buildRows(m) {
  const rows = [];
  const byItem = new Map();
  for (const u of m.units.values()) {
    if (!byItem.has(u.itemId)) byItem.set(u.itemId, []);
    byItem.get(u.itemId).push(u);
  }

  const mk = (item, unit) => {
    const total = m.itemTotals.get(item.id) || 0;
    const disposed = !!unit && unit.status === 'DISPOSED';
    let stock = 'ok';
    if (item.kind !== 'EQUIP') {
      if (!unit) stock = 'out';
      else if (disposed) stock = 'none';
      else if (unit.balance <= 0) stock = 'out';
      else if (item.reorderPoint !== null && total <= item.reorderPoint) stock = 'low';
    }
    const place = unit && m.places.get(unit.placeId);
    const pathText = place ? place.pathText : '';
    const row = {
      key: unit ? unit.id : item.id, item, unit, kind: item.kind, disposed,
      archived: item.status === 'ARCHIVED', stock,
      expiry: unit ? unit.expiry : 'none',
      broken: !!unit && !disposed && unit.condition === 'BROKEN',
      noplace: !!unit && !disposed && !unit.placeId,
      placeId: unit ? unit.placeId : '', pathText, total
    };
    row.hay = [
      item.name, item.nameEn, item.brand, item.model, item.cas, item.category, item.grade, item.hazard,
      KIND_TH[item.kind], item.kind, item.id, item.notes,
      unit ? [unit.label, unit.supplier, unit.fiscalYear, unit.id, unit.notes].join(' ') : '',
      pathText
    ].join(' \u0001 ').toLowerCase();
    return row;
  };

  for (const item of m.items.values()) {
    const us = byItem.get(item.id) || [];
    if (!us.length) rows.push(mk(item, null));
    else for (const u of us) rows.push(mk(item, u));
  }
  return rows;
}

/* ── ตัวช่วยอ่านแบบจำลอง ─────────────────────────────────────────────────── */
export function placeOf(id)  { return model.places.get(id) || null; }
export function itemOf(id)   { return model.items.get(id) || null; }
export function unitOf(id)   { return model.units.get(id) || null; }

/** เส้นทางจากบนลงล่าง [room, cabinet, shelf] */
export function pathOf(id) {
  const out = [];
  let p = model.places.get(id), guard = 0;
  while (p && guard++ < 10) { out.unshift(p); p = model.places.get(p.parentId); }
  return out;
}

export function descendantIds(id) {
  const out = [];
  (function walk(pid) {
    const p = model.places.get(pid);
    if (!p) return;
    for (const c of p.children) { out.push(c); walk(c); }
  })(id);
  return out;
}

/** ขวดที่ยังไม่จำหน่ายในที่เก็บนี้ (deep = รวมที่เก็บข้างในทุกชั้น) */
export function unitsIn(placeId, deep) {
  const ids = deep ? [placeId, ...descendantIds(placeId)] : [placeId];
  const out = [];
  for (const id of ids) for (const u of (model.unitsByPlace.get(id) || [])) if (u.status === 'ACTIVE') out.push(u);
  return out;
}

export function photosOf(type, id) { return model.photos.get(type + ':' + id) || []; }
export function coverOf(type, id)  { return photosOf(type, id)[0] || null; }
/** รูปที่ใช้แสดงแทนขวด: รูปของขวดเอง ถ้าไม่มีใช้รูปของชนิดนั้น */
export function unitCover(unit) {
  if (!unit) return null;
  return coverOf('UNIT', unit.id) || coverOf('ITEM', unit.itemId);
}

/** <option> ของที่เก็บทั้งหมด เรียงตามเส้นทาง (value = PlaceID) */
export function placeOptions(selected, o) {
  const opts = o || {};
  const skip = new Set(opts.exclude || []);
  const list = [];
  (function walk(ids) {
    for (const id of ids) {
      const p = model.places.get(id);
      if (!skip.has(id) && (opts.maxRank === undefined || ['ROOM', 'CABINET', 'SHELF', 'BOX'].indexOf(p.kind) <= opts.maxRank)) list.push(p);
      walk(p.children);
    }
  })(model.roots);
  let h = opts.blank !== undefined ? `<option value="">${esc(opts.blank)}</option>` : '';
  for (const p of list) {
    h += `<option value="${esc(p.id)}"${p.id === selected ? ' selected' : ''}>${esc(p.pathText)}</option>`;
  }
  return h;
}

/** รายการตัวเลือกจาก Settings */
export function opts(type) { return (model.settings && model.settings[type]) || []; }
export function categoryType(kind) { return { CHEM: 'ChemCategory', CONS: 'ConsCategory', EQUIP: 'EquipCategory' }[kind]; }

/* ── ซิงก์ ───────────────────────────────────────────────────────────────── */
export const syncState = { at: null, offline: false, fromLocal: false };

export async function loadLocal() {
  const s = await loadSnapshot();
  if (!s || !s.items || !s.places) return false;
  try {
    model = buildModel(s);
  } catch (e) { console.warn('snapshot ในเครื่องใช้ไม่ได้', e); return false; }
  syncState.fromLocal = true;
  notify();
  return true;
}

/**
 * ถามเลขเวอร์ชันก่อน ถ้าเปลี่ยนจึงโหลด snapshot ใหม่
 * @param {boolean} force โหลดใหม่เลยโดยไม่ถามเลขเวอร์ชัน (หลังบันทึกข้อมูล)
 * @return {Promise<boolean>} true ถ้าข้อมูลเปลี่ยน
 */
export async function sync(force) {
  try {
    if (!force && model.version !== null) {
      const { version } = await api.version();
      if (version === model.version) {
        syncState.at = new Date(); syncState.offline = false; syncState.fromLocal = false;
        notify();
        return false;
      }
    }
    const snap = await api.snapshot();
    model = buildModel(snap);
    syncState.at = new Date(); syncState.offline = false; syncState.fromLocal = false;
    saveSnapshot(snap);
    notify();
    return true;
  } catch (e) {
    if (e.code === 'NETWORK') { syncState.offline = true; notify(); }
    throw e;
  }
}

export function resetModel() { model = empty(); }
