/* ══════════════════════════════════════════════════════════════════════════
   photo.js — รูปภาพ: สร้างลิงก์, ย่อรูปในเบราว์เซอร์ก่อนอัปโหลด, เลือกไฟล์
   ══════════════════════════════════════════════════════════════════════════ */
import { esc } from './ui.js';

const CFG = window.APP_CONFIG;

export function photoSrc(fileId, w) {
  return CFG.PHOTO_URL.replace('{id}', encodeURIComponent(fileId)).replace('{w}', String(w || 400));
}

/** แท็ก <img> ที่ลองลิงก์สำรองเองถ้าโหลดไม่ได้ (ดู installImgFallback ใน ui.js) */
export function photoImg(photo, w, opts) {
  if (!photo) return '';
  const o = opts || {};
  const ratio = photo.width && photo.height ? ` style="aspect-ratio:${photo.width}/${photo.height}"` : '';
  return `<img class="${esc(o.cls || '')}" src="${esc(photoSrc(photo.fileId, w))}" data-fid="${esc(photo.fileId)}" data-w="${w}"
              alt="${esc(o.alt || photo.caption || '')}" loading="${o.eager ? 'eager' : 'lazy'}" decoding="async"${o.noRatio ? '' : ratio}>`;
}

/** อ่านไฟล์ภาพ → ย่อด้านยาวสุดไม่เกิน maxSide → JPEG base64 (ไม่มี prefix data:) */
export async function resizeImage(file, maxSide, quality) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('ไฟล์นี้ไม่ใช่รูปภาพ');
  let bmp = null, imgEl = null, url = null;
  try {
    if ('createImageBitmap' in window) {
      try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch { bmp = await createImageBitmap(file); }
    }
  } catch { bmp = null; }

  let w, h, source;
  if (bmp) { w = bmp.width; h = bmp.height; source = bmp; }
  else {
    url = URL.createObjectURL(file);
    imgEl = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('เปิดรูปนี้ไม่ได้ (รูปแบบไฟล์ที่เบราว์เซอร์ไม่รองรับ เช่น HEIC — ลองถ่ายใหม่หรือบันทึกเป็น JPEG)'));
      im.src = url;
    });
    w = imgEl.naturalWidth; h = imgEl.naturalHeight; source = imgEl;
  }

  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';                                  // PNG โปร่งใส → พื้นขาว (JPEG ไม่มีความโปร่งใส)
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(source, 0, 0, cw, ch);
  if (bmp && bmp.close) bmp.close();
  if (url) URL.revokeObjectURL(url);

  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality || 0.82));
  if (!blob) throw new Error('ย่อรูปไม่สำเร็จ');
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('อ่านรูปไม่สำเร็จ'));
    fr.readAsDataURL(blob);
  });
  return { data: String(dataUrl).split(',')[1], dataUrl, width: cw, height: ch, bytes: blob.size };
}

/** เปิดหน้าต่างเลือกไฟล์ภาพ (capture = เปิดกล้องบนมือถือ) */
export function pickImages({ multiple, capture } = {}) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = !!multiple;
    if (capture) inp.setAttribute('capture', 'environment');
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', () => { const f = [...inp.files]; inp.remove(); resolve(f); });
    inp.addEventListener('cancel', () => { inp.remove(); resolve([]); });
    inp.click();
  });
}
