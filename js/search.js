/* ══════════════════════════════════════════════════════════════════════════
   search.js — ค้นหาและกรองรายการในเครื่อง (< 10 ms)
   คำค้นหลายคำคั่นด้วยช่องว่าง = ต้องเจอทุกคำ · ค้นกลางคำได้ ("cerin" เจอ "Glycerin")
   ══════════════════════════════════════════════════════════════════════════ */
import { M, descendantIds } from './data.js';

const collator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' });

/**
 * @param {string} query
 * @param {Object} f  { kind, preset, category, fiscalYear, supplier, placeId }
 * @param {Object} sort { key: name|location|balance|expire|receive, dir }
 * @return {{rows:Array, counts:Object, ms:number}}
 */
export function search(query, f, sort) {
  const t0 = performance.now();
  const tokens = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const flt = f || {};
  const rows = [];
  const counts = { all: 0, soon: 0, expired: 0, low: 0, out: 0, broken: 0, noplace: 0, disposed: 0, archived: 0 };
  const kinds = { CHEM: 0, CONS: 0, EQUIP: 0 };

  let placeSet = null;
  if (flt.placeId) placeSet = new Set([flt.placeId, ...descendantIds(flt.placeId)]);

  const all = M().rows;
  for (let i = 0; i < all.length; i++) {
    const r = all[i];

    // คำค้น
    let hit = true;
    for (let t = 0; t < tokens.length; t++) {
      if (r.hay.indexOf(tokens[t]) === -1) { hit = false; break; }
    }
    if (!hit) continue;

    // ตัวกรองจากรายการเลือก (ไม่รวมชนิดและ preset ซึ่งนับแยก)
    if (flt.category   && r.item.category !== flt.category)     continue;
    if (flt.fiscalYear && (!r.unit || r.unit.fiscalYear !== flt.fiscalYear)) continue;
    if (flt.supplier   && (!r.unit || r.unit.supplier !== flt.supplier))     continue;
    if (placeSet && (!r.placeId || !placeSet.has(r.placeId))) continue;

    // ตัวเลขบนปุ่ม preset: นับหลังกรองตามชนิด (ตามที่เห็นอยู่) แต่ก่อนกรองด้วย preset เอง
    if (!flt.kind || r.kind === flt.kind) {
      if (r.archived) counts.archived++;
      else if (r.disposed) counts.disposed++;
      else {
        counts.all++;
        if (r.expiry === 'soon' && r.unit.balance > 0) counts.soon++;
        if (r.expiry === 'expired' && r.unit.balance > 0) counts.expired++;
        if (r.stock === 'low') counts.low++;
        if (r.stock === 'out') counts.out++;
        if (r.broken) counts.broken++;
        if (r.noplace) counts.noplace++;
      }
    }
    // ตัวเลขบนปุ่มชนิด: นับตาม preset ที่เลือกอยู่
    if (matchPreset(r, flt.preset)) kinds[r.kind]++;

    if (flt.kind && r.kind !== flt.kind) continue;
    if (!matchPreset(r, flt.preset)) continue;
    rows.push(r);
  }

  sortRows(rows, sort);
  return { rows, counts, kinds, ms: Math.round((performance.now() - t0) * 10) / 10 };
}

/** ค่าเริ่มต้น (ไม่เลือก preset) = ไม่รวมของที่จำหน่ายแล้ว/เก็บเข้าคลังเก่า */
export function matchPreset(r, preset) {
  switch (preset) {
    case 'soon':     return !r.archived && !r.disposed && r.expiry === 'soon' && r.unit.balance > 0;
    case 'expired':  return !r.archived && !r.disposed && r.expiry === 'expired' && r.unit.balance > 0;
    case 'low':      return !r.archived && !r.disposed && r.stock === 'low';
    case 'out':      return !r.archived && !r.disposed && r.stock === 'out';
    case 'broken':   return !r.archived && r.broken;
    case 'noplace':  return !r.archived && r.noplace;
    case 'disposed': return !r.archived && r.disposed;
    case 'archived': return r.archived;
    default:         return !r.archived && !r.disposed;
  }
}

const tval = d => (d ? new Date(d).getTime() : 8.64e15);   // วันที่ว่างไปท้ายสุด

function sortRows(rows, sort) {
  const key = (sort && sort.key) || 'name';
  const dir = (sort && sort.dir === 'desc') ? -1 : 1;
  rows.sort((a, b) => {
    let r = 0;
    switch (key) {
      case 'balance':  r = (a.unit ? a.unit.balance : -1) - (b.unit ? b.unit.balance : -1); break;
      case 'expire':   r = tval(a.unit && a.unit.expireDate) - tval(b.unit && b.unit.expireDate); break;
      case 'receive':  r = tval(a.unit && a.unit.receiveDate) - tval(b.unit && b.unit.receiveDate); break;
      case 'location': r = collator.compare(a.pathText || '￿', b.pathText || '￿'); break;
      default:         r = collator.compare(a.item.name, b.item.name);
    }
    if (r === 0) r = collator.compare(a.item.name, b.item.name);
    if (r === 0) r = a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
    return r * dir;
  });
}
