/* ══════════════════════════════════════════════════════════════════════════
   store.js — เก็บ snapshot ไว้ในเครื่องด้วย IndexedDB
   เปิดครั้งถัดไปแสดงข้อมูลทันที แล้วค่อยถามเซิร์ฟเวอร์ว่าเลขเวอร์ชันเปลี่ยนไหม
   ══════════════════════════════════════════════════════════════════════════ */

const DB_NAME  = 'labstock';
const DB_VER   = 1;
const STORE    = 'kv';
const SNAP_KEY = 'snapshot';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('ไม่รองรับ IndexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }).catch(e => { dbPromise = null; throw e; });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : undefined);
    t.onerror    = () => reject(t.error);
    t.onabort    = () => reject(t.error);
  }));
}

export async function loadSnapshot() {
  try { return (await tx('readonly', s => s.get(SNAP_KEY))) || null; } catch { return null; }
}
export async function saveSnapshot(snap) {
  try { await tx('readwrite', s => s.put(snap, SNAP_KEY)); return true; } catch { return false; }
}
export async function clearSnapshot() {
  try { await tx('readwrite', s => s.delete(SNAP_KEY)); } catch { /* ไม่เป็นไร */ }
}
