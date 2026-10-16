/* ══════════════════════════════════════════════════════════════════════════
   pages/map.js — แผนผังที่เก็บ: ห้อง → ตู้ → ชั้น → กล่อง

   • หน้าห้อง/ตู้แสดงรูปหลักของที่เก็บนั้น แล้ววางปุ่ม (zone) ของที่เก็บข้างในทับบนรูป
   • กดปุ่ม = ดูรายการของที่อยู่ในปุ่มนั้น · กด "เข้าไปดู" = ลงไปอีกชั้น
   • โหมดจัดวางปุ่ม: ลากบนรูปเพื่อสร้างปุ่มใหม่ · ลากปุ่มเพื่อย้าย · ลากมุมเพื่อปรับขนาด
   ตำแหน่งปุ่มเก็บเป็นสัดส่วน (0–1) ของรูป จึงตรงเสมอไม่ว่าจอจะกว้างเท่าไร
   ══════════════════════════════════════════════════════════════════════════ */
import { api, can } from '../api.js';
import { M, sync, onChange, placeOf, pathOf, unitsIn, itemOf, coverOf, unitCover } from '../data.js';
import { $, $$, esc, icon, kindTag, toast, run, fmtNum, fmtDays, PLACE_KIND_TH } from '../ui.js';
import { photoImg } from '../photo.js';
import { placeDialog, photosDialog, ZONE_COLORS } from '../dialogs.js';
import { openDetail } from '../detail.js';
import { openItemForm } from '../form.js';

const MIN_DRAW = 0.025;      // ปุ่มที่ลากเล็กกว่านี้ถือว่าเป็นแค่การแตะ
const MIN_SIZE = 0.02;
const MAX_ROWS = 150;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ค่าที่ส่งต่อมาจากหน้าอื่น เช่น "ดูบนแผนผัง" ในหน้ารายละเอียด */
let pending = { select: '', flash: '' };

/** หาปลายทางบนแผนผังของที่เก็บหนึ่ง → hash ของหน้า และจำว่าจะเลือก/กะพริบปุ่มไหน */
export function routeFor(placeId) {
  const p = placeOf(placeId);
  if (!p) return '#/map';
  if (p.parentId && p.geom && coverOf('PLACE', p.parentId)) {
    pending = { select: p.id, flash: p.id };
    return '#/map/' + p.parentId;
  }
  pending = { select: '', flash: '' };
  return '#/map/' + p.id;
}

const rankOf = k => ['ROOM', 'CABINET', 'SHELF', 'BOX'].indexOf(k);

function nextName(name) {
  const m = String(name).match(/^(.*?)(\d+)\s*$/);
  return m ? m[1] + (parseInt(m[2], 10) + 1) : name + ' 2';
}

export function mount(root, params) {
  let placeId = (params && params.id) || '';
  let sel = pending.select || '';
  let flashId = pending.flash || '';
  pending = { select: '', flash: '' };
  let edit = false;
  let assign = '';           // รหัสที่เก็บที่กำลังจะวางลงบนรูป (ลากเพื่อกำหนดตำแหน่ง)
  let drag = null;

  const staff = () => can('staff');
  const zoneColor = (c, i) => c.color || ZONE_COLORS[i % ZONE_COLORS.length];

  /* ── ส่วนประกอบย่อย ─────────────────────────────────────────────────── */
  const unitRow = u => {
    const item = itemOf(u.itemId);
    if (!item) return '';
    const cov = unitCover(u);
    const qty = item.kind === 'EQUIP'
      ? (u.condition === 'BROKEN' ? '<span class="tag tag-risk">ชำรุด</span>' : '1 ชิ้น')
      : `${esc(fmtNum(u.balance))} ${esc(item.unit)}`;
    const exp = u.expiry === 'expired' ? `<span class="tag tag-risk">หมดอายุ</span>`
      : u.expiry === 'soon' ? `<span class="tag tag-warn" title="${esc(fmtDays(u.daysLeft))}">ใกล้หมดอายุ</span>` : '';
    return `<button class="u-row" data-unit="${esc(u.id)}">
      <span class="u-thumb">${cov ? photoImg(cov, 120, { noRatio: true }) : icon.image}</span>
      <span class="u-main"><b>${esc(item.name)}</b>
        <small>${kindTag(item.kind)}${u.label ? ' ' + esc(u.label) : ''}</small></span>
      <span class="u-qty${item.kind !== 'EQUIP' && u.balance <= 0 ? ' neg' : ''}">${qty}${exp}</span>
    </button>`;
  };

  const unitList = (units, basePath) => {
    if (!units.length) return '<div class="empty small"><b>ยังไม่มีของ</b></div>';
    const groups = new Map();
    for (const u of units) {
      if (!groups.has(u.placeId)) groups.set(u.placeId, []);
      groups.get(u.placeId).push(u);
    }
    const keys = [...groups.keys()].sort((a, b) =>
      (placeOf(a) ? placeOf(a).pathText : '').localeCompare(placeOf(b) ? placeOf(b).pathText : '', 'th', { numeric: true }));
    let shown = 0, html = '';
    for (const k of keys) {
      const pl = placeOf(k);
      const list = groups.get(k).sort((a, b) => (itemOf(a.itemId).name).localeCompare(itemOf(b.itemId).name, 'th'));
      let head = '';
      if (keys.length > 1 || (pl && pl.pathText !== basePath)) {
        head = `<div class="grp">${esc(pl ? pl.pathText.replace(basePath ? basePath + ' › ' : '', '') || pl.name : '')}</div>`;
      }
      let rows = '';
      for (const u of list) {
        if (shown >= MAX_ROWS) break;
        rows += unitRow(u); shown++;
      }
      if (rows) html += head + rows;
    }
    if (units.length > shown) {
      html += `<div class="muted note-small">แสดง ${shown} จาก ${units.length} รายการ — เข้าไปดูข้างในเพื่อดูที่เหลือ</div>`;
    }
    return `<div class="u-list">${html}</div>`;
  };

  /* ── หน้าแรก: รายการห้อง ────────────────────────────────────────────── */
  function drawRoot() {
    const m = M();
    const roots = m.roots.map(id => placeOf(id));
    const noplace = [...m.units.values()].filter(u => u.status === 'ACTIVE' && !u.placeId).length;
    root.innerHTML = `
      <div class="page-head">
        <div><h1>แผนผังที่เก็บ</h1>
          <p class="muted">เลือกห้อง ตู้ หรือโต๊ะ เพื่อดูว่าอะไรอยู่ตรงไหน</p></div>
        <div class="head-acts">${staff() ? `<button class="btn" data-act="add-root">${icon.plus} เพิ่มห้อง/ที่เก็บ</button>` : ''}</div>
      </div>
      ${noplace ? `<div class="note note-warn">มีของ ${noplace} รายการที่ยังไม่ได้ระบุที่เก็บ — <a href="#/items?preset=noplace">ดูรายการ</a></div>` : ''}
      ${roots.length ? `<div class="room-grid">${roots.map(p => {
        const cov = coverOf('PLACE', p.id);
        return `<a class="room-card" href="#/map/${esc(p.id)}">
          <span class="room-photo">${cov ? photoImg(cov, 640, { noRatio: true }) : icon.map}</span>
          <span class="room-body"><span class="muted">${esc(PLACE_KIND_TH[p.kind])}</span>
            <b>${esc(p.name)}</b>
            <span class="muted">${p.deep} รายการ${p.children.length ? ' · ' + p.children.length + ' ที่เก็บข้างใน' : ''}</span></span>
        </a>`;
      }).join('')}</div>`
      : `<div class="empty"><b>ยังไม่มีที่เก็บ</b>เริ่มจากเพิ่มห้อง (เช่น "ห้องแลป 204") แล้วถ่ายรูปตู้เข้าไปวางปุ่มทีละชั้น
         ${staff() ? '<br><br><button class="btn" data-act="add-root">' + icon.plus + ' เพิ่มห้อง/ที่เก็บ</button>' : ''}</div>`}`;
  }

  /* ── หน้าที่เก็บหนึ่งแห่ง ───────────────────────────────────────────── */
  function drawPlace(p) {
    const cover = coverOf('PLACE', p.id);
    const canZone = !!cover && p.kind !== 'BOX';
    if (!canZone) { edit = false; assign = ''; }
    if (sel && !p.children.includes(sel)) sel = '';

    const crumbs = pathOf(p.id).map((x, i, a) => i === a.length - 1
      ? `<span>${esc(x.name)}</span>` : `<a href="#/map/${esc(x.id)}">${esc(x.name)}</a>`).join('<i>›</i>');

    const kids = p.children.map(placeOf);
    const placed = kids.filter(c => c.geom);
    const unplaced = kids.filter(c => !c.geom);

    /* รูป + ปุ่ม */
    let stage;
    if (cover) {
      stage = `
        ${edit ? `<div class="edit-bar">${assign
          ? `ลากบนรูปเพื่อกำหนดตำแหน่งของ <b>${esc(placeOf(assign).name)}</b> <button class="btn btn-ghost btn-sm" data-act="cancel-assign">ยกเลิก</button>`
          : 'ลากบนรูปเพื่อสร้างปุ่มใหม่ · ลากปุ่มเพื่อย้าย · ลากมุมเพื่อปรับขนาด'}</div>` : ''}
        <div class="stage-wrap"><div class="stage${edit ? ' editing' : ''}" id="stage"${cover.width && cover.height ? ` style="--ar:${(cover.width / cover.height).toFixed(4)}"` : ''}>
          ${photoImg(cover, 1600, { cls: 'stage-img', eager: true })}
          ${placed.map(c => {
            const i = p.children.indexOf(c.id), g = c.geom;
            const on = sel === c.id;
            return `<div class="zone${on ? ' sel' : ''}${flashId === c.id ? ' flash' : ''}" role="button" tabindex="0"
                data-zone="${esc(c.id)}" title="${esc(c.name)}"
                style="left:${g.x * 100}%;top:${g.y * 100}%;width:${g.w * 100}%;height:${g.h * 100}%;--c:${esc(zoneColor(c, i))}">
              <span class="zone-name">${esc(c.name)}</span><span class="zone-n">${c.deep}</span>
              ${edit && on ? '<i class="hd hd-nw" data-h="nw"></i><i class="hd hd-ne" data-h="ne"></i><i class="hd hd-sw" data-h="sw"></i><i class="hd hd-se" data-h="se"></i>' : ''}
            </div>`;
          }).join('')}
          <div class="draw-box" id="drawbox" hidden></div>
        </div></div>`;
    } else {
      stage = `<div class="stage-empty">${icon.camera}
        <b>ยังไม่มีรูปของ "${esc(p.name)}"</b>
        <span class="muted">${p.kind === 'BOX' ? 'กล่องเป็นระดับลึกสุด ไม่ต้องวางปุ่มข้างใน'
          : 'ถ่ายรูปด้านหน้า' + esc(PLACE_KIND_TH[p.kind]) + 'นี้เพื่อวางปุ่มของที่เก็บข้างในลงบนรูปได้'}</span>
        ${staff() ? `<button class="btn" data-act="photos">${icon.camera} เพิ่มรูป</button>` : ''}</div>`;
    }

    root.innerHTML = `
      <nav class="crumbs"><a href="#/map">${icon.map} แผนผัง</a><i>›</i>${crumbs}</nav>
      <div class="page-head">
        <div><div class="eyebrow">${esc(PLACE_KIND_TH[p.kind])}</div><h1>${esc(p.name)}</h1>
          <p class="muted">${p.deep} รายการ${p.notes ? ' · ' + esc(p.notes) : ''}</p></div>
        <div class="head-acts">
          ${staff() ? `
            <button class="btn btn-ghost" data-act="photos">${icon.camera} รูป</button>
            <button class="btn btn-ghost" data-act="edit-place">${icon.edit} แก้ไข</button>
            ${p.kind !== 'BOX' ? `<button class="btn btn-ghost" data-act="add-child">${icon.plus} เพิ่มที่เก็บข้างใน</button>` : ''}
            ${canZone ? `<button class="btn ${edit ? '' : 'btn-ghost'}" data-act="toggle-edit">${edit ? '✓ เสร็จสิ้น' : 'จัดวางปุ่ม'}</button>` : ''}
            <button class="btn" data-act="add-item">${icon.plus} เพิ่มของที่นี่</button>` : ''}
        </div>
      </div>
      <div class="map-layout">
        <section class="map-main">${stage}</section>
        <aside class="map-side" id="side">${sideHtml(p, kids, unplaced)}</aside>
      </div>`;

    if (flashId) {
      const z = $('.zone.flash', root);
      if (z) z.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const fid = flashId; flashId = '';
      setTimeout(() => { const el = $('[data-zone="' + fid + '"]', root); if (el) el.classList.remove('flash'); }, 3000);
    }
  }

  function sideHtml(p, kids, unplaced) {
    /* โหมดจัดวางปุ่ม */
    if (edit) {
      const c = sel && placeOf(sel);
      return `
        ${c ? `<div class="side-card">
          <div class="side-head"><b>${esc(c.name)}</b>${kindTag2(c)}</div>
          <div class="side-acts">
            <button class="btn btn-ghost btn-sm" data-act="edit-child">${icon.edit} ชื่อ/สี</button>
            <button class="btn btn-ghost btn-sm" data-act="dup-child">${icon.copy} ทำสำเนา</button>
            <button class="btn btn-ghost btn-sm" data-act="unplace-child">เอาปุ่มออกจากรูป</button>
            <button class="btn btn-ghost btn-sm" data-act="open-child">เข้าไปดู ${icon.chev}</button>
          </div></div>` : '<div class="note note-info">แตะปุ่มบนรูปเพื่อแก้ไข · หรือลากบนพื้นที่ว่างของรูปเพื่อสร้างปุ่มใหม่</div>'}
        ${unplaced.length ? `<div class="side-card"><div class="side-head"><b>ยังไม่มีปุ่มบนรูป</b></div>
          <div class="chips">${unplaced.map(u => `<button class="chip${assign === u.id ? ' on' : ''}" data-assign="${esc(u.id)}">${esc(u.name)}</button>`).join('')}</div>
          <p class="muted note-small">แตะชื่อ แล้วลากบนรูปเพื่อวางปุ่ม</p></div>` : ''}
        <button class="btn btn-ghost btn-block" data-act="add-child">${icon.plus} เพิ่มที่เก็บข้างใน (ไม่วางบนรูป)</button>`;
    }

    /* เลือกปุ่มอยู่ → รายการของในปุ่มนั้น */
    if (sel && placeOf(sel)) {
      const c = placeOf(sel);
      return `
        <div class="side-card">
          <button class="link-btn" data-act="clear-sel">${icon.back} ทั้งหมดใน ${esc(p.name)}</button>
          <div class="side-head"><b>${esc(c.name)}</b>${kindTag2(c)}</div>
          <p class="muted">${c.deep} รายการ${c.children.length ? ' · ' + c.children.length + ' ที่เก็บข้างใน' : ''}</p>
          <div class="side-acts">
            <button class="btn btn-sm" data-act="open-child">เข้าไปดู ${icon.chev}</button>
            ${staff() ? `<button class="btn btn-ghost btn-sm" data-act="add-item-child">${icon.plus} เพิ่มของ</button>` : ''}
          </div>
        </div>
        ${unitList(unitsIn(c.id, true), c.pathText)}`;
    }

    /* ภาพรวม */
    const direct = unitsIn(p.id, false);
    return `
      ${kids.length ? `<div class="side-card"><div class="side-head"><b>ภายใน${esc(p.name)}</b><span class="muted">${kids.length} แห่ง</span></div>
        <div class="kid-list">${kids.map((c, i) => `
          <button class="kid" data-pick="${esc(c.id)}">
            <span class="dot" style="--c:${esc(zoneColor(c, i))}"></span>
            <span class="kid-name">${esc(c.name)}${c.geom ? '' : ' <small class="muted">(ไม่มีปุ่มบนรูป)</small>'}</span>
            <span class="kid-n">${c.deep}</span>
          </button>`).join('')}</div></div>` : ''}
      <div class="side-card"><div class="side-head"><b>วางอยู่ที่${esc(PLACE_KIND_TH[p.kind])}นี้โดยตรง</b><span class="muted">${direct.length}</span></div></div>
      ${unitList(direct, p.pathText)}`;
  }
  const kindTag2 = c => `<span class="tag tag-mute">${esc(PLACE_KIND_TH[c.kind])}</span>`;

  /* ── วาด ─────────────────────────────────────────────────────────── */
  function draw() {
    if (M().version === null) { root.innerHTML = '<div class="empty"><b>กำลังโหลดข้อมูล …</b></div>'; return; }
    if (!placeId) return drawRoot();
    const p = placeOf(placeId);
    if (!p) {
      root.innerHTML = '<div class="empty"><b>ไม่พบที่เก็บนี้</b>อาจถูกลบหรือย้ายไปแล้ว<br><br><a class="btn" href="#/map">กลับไปแผนผัง</a></div>';
      return;
    }
    drawPlace(p);
  }

  /* ── คำสั่งจากปุ่ม ──────────────────────────────────────────────────── */
  const goUp = () => { const p = placeOf(placeId); location.hash = p && p.parentId ? '#/map/' + p.parentId : '#/map'; };

  async function saveGeom(id, geom) {
    const r = await run(null, () => api.placeSave({ placeId: id, geom }));
    if (!r.ok) { draw(); return; }
    try { await sync(true); } catch (e) { toast(e.message, 'risk'); draw(); }
  }

  root.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      const p = placeId && placeOf(placeId);
      if (act === 'add-root') return placeDialog({ parentId: '', onDone: r => { if (r && r.placeId) location.hash = '#/map/' + r.placeId; } });
      if (!p) return;
      if (act === 'photos') return photosDialog({ ownerType: 'PLACE', ownerId: p.id, title: 'รูปของ ' + p.name });
      if (act === 'edit-place') return placeDialog({ placeId: p.id, onDeleted: goUp });
      if (act === 'add-child') return placeDialog({ parentId: p.id, onDone: r => { if (r && r.placeId && !edit) sel = r.placeId; } });
      if (act === 'toggle-edit') { edit = !edit; assign = ''; return draw(); }
      if (act === 'cancel-assign') { assign = ''; return draw(); }
      if (act === 'clear-sel') { sel = ''; return draw(); }
      if (act === 'add-item') return openItemForm({ mode: 'new', placeId: p.id });
      if (act === 'add-item-child') return openItemForm({ mode: 'new', placeId: sel });
      if (act === 'open-child') { if (sel) location.hash = '#/map/' + sel; return; }
      const c = sel && placeOf(sel);
      if (act === 'edit-child' && c) return placeDialog({ placeId: c.id, onDeleted: () => { sel = ''; } });
      if (act === 'unplace-child' && c) { run(a, async () => { await api.placeSave({ placeId: c.id, geom: null }); await sync(true); }, 'เอาปุ่มออกจากรูปแล้ว'); return; }
      if (act === 'dup-child' && c && c.geom) {
        const g = c.geom;
        let ng = { x: g.x, y: g.y + g.h + 0.01, w: g.w, h: g.h };
        if (ng.y + ng.h > 1) ng = { x: clamp(g.x + g.w + 0.01, 0, 1 - g.w), y: g.y, w: g.w, h: g.h };
        if (ng.x + ng.w > 1 || (ng.x === g.x && ng.y === g.y)) ng = { x: clamp(g.x + 0.03, 0, 1 - g.w), y: clamp(g.y + 0.03, 0, 1 - g.h), w: g.w, h: g.h };
        return placeDialog({ parentId: p.id, kind: c.kind, color: c.color, name: nextName(c.name), geom: ng, onDone: r => { if (r && r.placeId) sel = r.placeId; } });
      }
      return;
    }

    const u = e.target.closest('[data-unit]');
    if (u) return openDetail(u.dataset.unit);

    const pick = e.target.closest('[data-pick]');
    if (pick) { sel = pick.dataset.pick; return draw(); }

    const as = e.target.closest('[data-assign]');
    if (as) { assign = assign === as.dataset.assign ? '' : as.dataset.assign; return draw(); }

    const z = e.target.closest('[data-zone]');
    if (z && !edit) {
      sel = z.dataset.zone;
      draw();
      const side = $('#side', root);
      if (side && window.matchMedia('(max-width: 880px)').matches) side.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  root.addEventListener('dblclick', e => {
    const z = e.target.closest('[data-zone]');
    if (z && !edit) location.hash = '#/map/' + z.dataset.zone;
  });

  root.addEventListener('keydown', e => {
    const z = e.target.closest && e.target.closest('[data-zone]');
    if (z && (e.key === 'Enter' || e.key === ' ') && e.target === z) {
      e.preventDefault(); sel = z.dataset.zone; draw();
      const again = $('[data-zone="' + sel + '"]', root); if (again) again.focus();
    }
  });

  /* ── ลาก: สร้าง / ย้าย / ปรับขนาด ─────────────────────────────────────── */
  const fracOf = (e, stage) => {
    const r = stage.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  };
  const setBox = (el, g) => {
    el.style.left = g.x * 100 + '%'; el.style.top = g.y * 100 + '%';
    el.style.width = g.w * 100 + '%'; el.style.height = g.h * 100 + '%';
  };

  root.addEventListener('pointerdown', e => {
    if (!edit || e.button > 0) return;
    const stage = e.target.closest('#stage');
    if (!stage) return;
    const pt = fracOf(e, stage);
    const handle = e.target.closest('[data-h]');
    const zone = e.target.closest('[data-zone]');

    if (handle && zone) {
      const c = placeOf(zone.dataset.zone);
      drag = { mode: 'resize', h: handle.dataset.h, id: c.id, el: zone, g0: { ...c.geom }, stage };
    } else if (zone) {
      const c = placeOf(zone.dataset.zone);
      if (sel !== c.id) { sel = c.id; assign = ''; draw(); }          // เลือกก่อน แล้วค่อยลากได้ในการกดครั้งถัดไป
      const z2 = $('[data-zone="' + c.id + '"]', root);
      drag = { mode: 'move', id: c.id, el: z2, g0: { ...c.geom }, p0: pt, stage: $('#stage', root), moved: false };
    } else {
      drag = { mode: 'draw', p0: pt, g: null, el: $('#drawbox', stage), stage };
    }
    e.preventDefault();
    try { drag.stage.setPointerCapture(e.pointerId); } catch { /* ไม่เป็นไร */ }
  });

  root.addEventListener('pointermove', e => {
    if (!drag) return;
    const pt = fracOf(e, drag.stage);
    if (drag.mode === 'draw') {
      const x = Math.min(drag.p0.x, pt.x), y = Math.min(drag.p0.y, pt.y);
      drag.g = { x, y, w: Math.abs(pt.x - drag.p0.x), h: Math.abs(pt.y - drag.p0.y) };
      drag.el.hidden = false; setBox(drag.el, drag.g);
    } else if (drag.mode === 'move') {
      const g0 = drag.g0;
      const dx = pt.x - drag.p0.x, dy = pt.y - drag.p0.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.004) drag.moved = true;
      drag.g = { x: clamp(g0.x + dx, 0, 1 - g0.w), y: clamp(g0.y + dy, 0, 1 - g0.h), w: g0.w, h: g0.h };
      setBox(drag.el, drag.g);
    } else {
      const g0 = drag.g0, h = drag.h;
      let x1 = g0.x, y1 = g0.y, x2 = g0.x + g0.w, y2 = g0.y + g0.h;
      if (h.includes('w')) x1 = clamp(pt.x, 0, x2 - MIN_SIZE); else x2 = clamp(pt.x, x1 + MIN_SIZE, 1);
      if (h.includes('n')) y1 = clamp(pt.y, 0, y2 - MIN_SIZE); else y2 = clamp(pt.y, y1 + MIN_SIZE, 1);
      drag.g = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      setBox(drag.el, drag.g);
    }
  });

  const endDrag = async e => {
    if (!drag) return;
    const d = drag; drag = null;
    try { d.stage.releasePointerCapture(e.pointerId); } catch { /* ไม่เป็นไร */ }
    if (e.type === 'pointercancel') { draw(); return; }

    if (d.mode === 'draw') {
      if (d.el) d.el.hidden = true;
      if (!d.g || d.g.w < MIN_DRAW || d.g.h < MIN_DRAW) {
        if (sel) { sel = ''; draw(); }                                  // แตะพื้นที่ว่าง = เลิกเลือก
        return;
      }
      const geom = d.g;
      if (assign) {
        const id = assign; assign = '';
        sel = id;
        return saveGeom(id, geom);
      }
      const dlg = placeDialog({
        parentId: placeId, geom,
        onDone: r => { if (r && r.placeId) sel = r.placeId; }
      });
      if (dlg) dlg.closed.then(() => draw()); else draw();
      return;
    }
    if (!d.g || (d.mode === 'move' && !d.moved)) { draw(); return; }
    saveGeom(d.id, d.g);
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  const unsub = onChange(() => { if (!drag) draw(); });
  draw();
  return () => { unsub(); };
}
