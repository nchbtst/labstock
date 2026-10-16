/* ══════════════════════════════════════════════════════════════════════════
   api.js — ชั้นกลางระหว่างหน้าเว็บกับหลังบ้าน (จุดเดียวที่รู้ว่าหลังบ้านคือ Apps Script)

   ข้อจำกัดของ Apps Script: ไม่รองรับ CORS preflight
     • ต้องใช้ Content-Type: text/plain (ส่ง JSON เป็น string)
     • ห้ามใส่ header เอง → session ส่งใน body
   ══════════════════════════════════════════════════════════════════════════ */

const CFG = window.APP_CONFIG;
const SESSION_KEY = 'labstock.session';
const USER_KEY    = 'labstock.user';

let session = null;
let user    = null;

function load() {
  try {
    session = localStorage.getItem(SESSION_KEY);
    const u = localStorage.getItem(USER_KEY);
    user = u ? JSON.parse(u) : null;
  } catch { session = null; user = null; }
}
load();

export function getUser()     { return user; }
export function hasSession()  { return !!session && !!user; }
export function isAdmin()     { return !!user && user.role === 'admin'; }
export function can(minRole) {
  const order = ['admin', 'staff', 'viewer'];
  if (!user) return false;
  return order.indexOf(user.role) <= order.indexOf(minRole);
}

export function setSession(s, u) {
  session = s; user = u;
  try {
    localStorage.setItem(SESSION_KEY, s);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  } catch { /* โหมดส่วนตัวอาจเขียนไม่ได้ — ยังใช้งานต่อในแท็บนี้ได้ */ }
}

export function clearSession() {
  session = null; user = null;
  try { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(USER_KEY); } catch { /* ไม่เป็นไร */ }
}

export class ApiError extends Error {
  constructor(message, code, data) {
    super(message);
    this.name = 'ApiError';
    this.code = code || 'ERROR';
    this.data = data;
  }
}

/** รหัสที่หมายถึง "ต้องล็อกอินใหม่" */
const REAUTH = ['NO_SESSION', 'BAD_SESSION', 'BAD_SIGNATURE', 'EXPIRED'];
export function needsReauth(code) { return REAUTH.indexOf(code) !== -1; }

let onReauth = null;
export function setReauthHandler(fn) { onReauth = fn; }

export async function call(action, payload) {
  if (!CFG.GAS_URL || CFG.GAS_URL.indexOf('PASTE-YOUR') !== -1) {
    throw new ApiError('ยังไม่ได้ตั้งค่า GAS_URL ในไฟล์ config.js\nดูวิธีตั้งค่าใน SETUP.md ขั้นที่ 6', 'NOT_CONFIGURED');
  }

  let res;
  try {
    res = await fetch(CFG.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload: payload || {}, session }),
      redirect: 'follow'
    });
  } catch {
    throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง', 'NETWORK');
  }

  if (!res.ok) throw new ApiError('เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ' + res.status + ')', 'HTTP_' + res.status);

  const text = await res.text();
  let body;
  try { body = JSON.parse(text); }
  catch {
    throw new ApiError(
      'เซิร์ฟเวอร์ไม่ได้ตอบเป็นข้อมูล JSON\n' +
      'สาเหตุที่พบบ่อย: Web App ไม่ได้ deploy เป็น "Anyone" (ดู SETUP.md ขั้นที่ 5) หรือ URL ไม่ถูกต้อง',
      'BAD_RESPONSE');
  }

  if (!body.ok) {
    const err = body.error || {};
    if (needsReauth(err.code)) {
      clearSession();
      if (onReauth) onReauth();
    }
    throw new ApiError(err.message || 'เกิดข้อผิดพลาด', err.code, err.data);
  }
  return body.data;
}

export const api = {
  ping:      ()    => call('ping'),
  login:     (username, password) => call('login', { username, password }),
  me:        ()    => call('me'),
  version:   ()    => call('version'),
  snapshot:  ()    => call('snapshot'),
  history:   (p)   => call('history', p),

  changePassword: (oldPassword, newPassword) => call('auth.changePassword', { oldPassword, newPassword }),
  logoutAll:      ()  => call('auth.logoutAll'),

  usersList:          ()  => call('users.list'),
  usersAdd:           (p) => call('users.add', p),
  usersUpdate:        (p) => call('users.update', p),
  usersSetStatus:     (username, status) => call('users.setStatus', { username, status }),
  usersResetPassword: (username, password) => call('users.resetPassword', { username, password }),
  usersDelete:        (username) => call('users.delete', { username }),

  settingsAdd:    (type, value) => call('settings.add', { type, value }),
  settingsRemove: (type, value) => call('settings.remove', { type, value }),

  placeSave:    (p)   => call('place.save', p),
  placeDelete:  (placeId) => call('place.delete', { placeId }),
  placeReorder: (ids) => call('place.reorder', { ids }),

  itemSave:      (p) => call('item.save', p),
  itemSetStatus: (itemId, status) => call('item.setStatus', { itemId, status }),
  unitSave:      (p) => call('unit.save', p),
  unitDelete:    (unitId) => call('unit.delete', { unitId }),
  unitMoveMany:  (unitIds, toPlaceId, notes) => call('unit.moveMany', { unitIds, toPlaceId, notes }),
  movePost:      (p) => call('move.post', p),
  moveCancel:    (moveId, reason) => call('move.cancel', { moveId, reason }),

  photoUpload: (p) => call('photo.upload', p),
  photoUpdate: (p) => call('photo.update', p),
  photoDelete: (photoId) => call('photo.delete', { photoId }),

  importPreview: (csv, createPlaces) => call('import.preview', { csv, createPlaces }),
  importCommit:  (csv, createPlaces) => call('import.commit', { csv, createPlaces })
};
