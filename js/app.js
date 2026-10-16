/* ══════════════════════════════════════════════════════════════════════════
   app.js — จุดเริ่มต้น: ล็อกอิน · เมนู · เปลี่ยนหน้า · ซิงก์ข้อมูล
   ══════════════════════════════════════════════════════════════════════════ */
import { api, hasSession, getUser, clearSession, setReauthHandler, isAdmin } from './api.js';
import { sync, loadLocal, onChange, syncState, resetModel, M } from './data.js';
import { clearSnapshot } from './store.js';
import { $, esc, icon, toast, installImgFallback } from './ui.js';
import { renderLogin } from './auth.js';
import * as mapPage from './pages/map.js';
import * as itemsPage from './pages/items.js';
import * as importPage from './pages/import.js';
import * as usersPage from './pages/users.js';
import * as accountPage from './pages/account.js';

const CFG = window.APP_CONFIG;
const PAGES = {
  map:     { mod: mapPage,     label: 'แผนผัง',  icon: icon.map },
  items:   { mod: itemsPage,   label: 'รายการ',  icon: icon.list },
  import:  { mod: importPage,  label: 'นำเข้า',  icon: icon.upload, admin: true },
  users:   { mod: usersPage,   label: 'ผู้ใช้',   icon: icon.users,  admin: true },
  account: { mod: accountPage, label: 'ตั้งค่า',  icon: icon.gear }
};

let destroy = null;
let timer = null;

/* ── แสดงหน้าล็อกอิน / แอป ─────────────────────────────────────────────── */
function showLogin(message) {
  stopSync();
  if (destroy) { try { destroy(); } catch { /* ไม่เป็นไร */ } destroy = null; }
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  $('#app').hidden = true;
  const box = $('#login');
  box.hidden = false;
  renderLogin(box, { message, onDone: () => { box.hidden = true; startApp(true); } });
}

export async function signOut() {
  clearSession();
  resetModel();
  try { await clearSnapshot(); } catch { /* ไม่เป็นไร */ }
  location.hash = '';
  showLogin();
}

function startApp(fresh) {
  const u = getUser();
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#who').textContent = u.name || u.username;
  $('#who').title = u.username;

  $('#nav').innerHTML = Object.entries(PAGES)
    .filter(([, p]) => !p.admin || isAdmin())
    .map(([k, p]) => `<a href="#/${k}" data-nav="${k}">${p.icon}<span>${esc(p.label)}</span></a>`).join('');

  route();
  (async () => {
    if (!fresh && M().version === null) await loadLocal();
    route();
    try { await sync(!fresh ? false : true); } catch (e) { if (e.code !== 'NETWORK') toast(e.message, 'risk'); }
    if (!fresh) api.me().catch(() => {});          // ตรวจว่า session ยังใช้ได้ (หมดอายุจะเด้งไปหน้าล็อกอินเอง)
  })();
  startSync();
}

/* ── เปลี่ยนหน้าด้วย hash:  #/<page>/<id>?k=v ─────────────────────────── */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const [page, id] = path.split('/');
  const params = {};
  new URLSearchParams(qs || '').forEach((v, k) => { params[k] = v; });
  if (id) params.id = decodeURIComponent(id);
  return { page: page || 'map', params };
}

function route() {
  if (!hasSession()) return;
  let { page, params } = parseHash();
  if (!PAGES[page] || (PAGES[page].admin && !isAdmin())) { page = 'map'; params = {}; }

  if (destroy) { try { destroy(); } catch (e) { console.error(e); } destroy = null; }
  // กรอบใหม่ทุกครั้ง เพื่อให้ตัวรับเหตุการณ์ของหน้าเดิมหายไปพร้อมกรอบ
  const main = document.createElement('div');
  main.className = 'page';
  $('#main').replaceChildren(main);
  window.scrollTo(0, 0);
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === page));
  try {
    destroy = PAGES[page].mod.mount(main, params, { signOut }) || null;
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="empty"><b>เปิดหน้านี้ไม่ได้</b>${esc(e.message)}</div>`;
  }
}
window.addEventListener('hashchange', route);

/* "ดูบนแผนผัง" จากหน้ารายละเอียด */
window.addEventListener('labstock:goto', e => {
  const d = e.detail || {};
  if (d.page !== 'map') return;
  const h = mapPage.routeFor(d.placeId);
  if (location.hash === h) route(); else location.hash = h;
});

/* ── ซิงก์ ──────────────────────────────────────────────────────────── */
function paintSync() {
  const b = $('#sync');
  if (!b) return;
  b.classList.toggle('off', !!syncState.offline);
  b.title = syncState.offline ? 'ออฟไลน์ — ใช้ข้อมูลล่าสุดที่เก็บในเครื่อง (กดเพื่อลองใหม่)'
    : syncState.at ? 'ซิงก์ล่าสุด ' + syncState.at.toLocaleTimeString('th-TH') + ' (กดเพื่อซิงก์ตอนนี้)' : 'ซิงก์';
  $('#sync-txt').textContent = syncState.offline ? 'ออฟไลน์' : '';
}
onChange(paintSync);

function startSync() {
  stopSync();
  timer = setInterval(() => { if (!document.hidden && hasSession()) sync(false).catch(() => {}); }, 60000);
}
function stopSync() { if (timer) clearInterval(timer); timer = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && hasSession()) sync(false).catch(() => {}); });

/* ── เริ่มระบบ ──────────────────────────────────────────────────────── */
function boot() {
  document.title = CFG.APP_NAME;
  $('#brand-name').textContent = CFG.APP_NAME;
  installImgFallback(CFG.PHOTO_FALLBACK_URL);
  setReauthHandler(() => { resetModel(); showLogin('เซสชันหมดอายุหรือถูกยกเลิก กรุณาเข้าสู่ระบบอีกครั้ง'); });

  $('#sync').addEventListener('click', async () => {
    try { const ch = await sync(false); toast(ch ? 'อัปเดตข้อมูลแล้ว' : 'ข้อมูลเป็นปัจจุบัน', 'ok'); }
    catch (e) { toast(e.message, 'risk'); }
  });
  $('#signout').addEventListener('click', signOut);
  $('#icon-sync').innerHTML = icon.sync;
  $('#icon-out').innerHTML = icon.out;

  if (hasSession()) startApp(false); else showLogin();
}
boot();
