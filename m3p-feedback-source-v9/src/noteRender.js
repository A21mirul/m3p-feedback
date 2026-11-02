// The ONE place a sticky note is drawn. The wall, the preview, the staff panel and every export use drawNote().
import { dims } from "./shapes.js";

export const PAPER = ["#FFE872", "#FFC2D1", "#BDF2D5", "#BFDDFF", "#FFD1A1", "#DCC8FF"];
export const STICKERS = ["🧬", "🦠", "🔬", "⭐", "💡", "🚀", "❤️", "😂"];
export const REACT_EMOJI = ["💡", "🔍", "🎮", "🏭", "🧬"];
export const PINS = ["tape", "red", "blue", "yellow", "green", "none"];
export const PIN_COL = { red: "#E5484D", blue: "#3E8EDE", yellow: "#F5C518", green: "#3CB371" };
export const PAD = 40; // room around a note for its shadow, pin and stickers
const FONT = 'Virgil, "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const INK = "#1b2a47";
const rad = (d) => (d * Math.PI) / 180;
const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
const keyOf = (c) => c.uid || "L" + c.id;

let fontP = null;
export function ensureFont() {
  if (!fontP) fontP = (async () => {
    try {
      const f = new FontFace("Virgil", `url(${new URL("./excalidraw-assets/fonts/Virgil/Virgil-Regular.woff2", document.baseURI).href})`);
      await f.load(); document.fonts.add(f);
    } catch (e) { /* system handwriting fonts */ }
  })();
  return fontP;
}

function rr(ctx, x, y, w, h, [tl, tr, br, bl]) {
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y); ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br); ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h); ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl); ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}
function paperPath(ctx, shape, w, h) {
  if (shape === "round") { ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); }
  else rr(ctx, 0, 0, w, h, [2, 2, 14, 2]);
}

function wrapLines(ctx, text, maxW) {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width <= maxW) { cur = test; continue; }
    if (cur) lines.push(cur);
    let word = w;
    while (ctx.measureText(word).width > maxW && word.length > 1) {
      let i = word.length;
      while (i > 1 && ctx.measureText(word.slice(0, i)).width > maxW) i--;
      lines.push(word.slice(0, i)); word = word.slice(i);
    }
    cur = word;
  }
  if (cur) lines.push(cur);
  return lines;
}
function ellipsis(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

// biggest font size in [lo, hi] that fits the box; `scale` < 1 shrinks it on purpose
function fitText(ctx, text, bw, bh, lo, hi, scale) {
  const fits = (s) => { ctx.font = `${s}px ${FONT}`; return wrapLines(ctx, text, bw).length * s * 1.15 <= bh; };
  let a = lo, b = hi;
  if (fits(hi)) a = hi;
  else if (fits(lo)) for (let i = 0; i < 9; i++) { const m = (a + b) / 2; if (fits(m)) a = m; else b = m; }
  const size = Math.max(lo * 0.8, a * (scale || 1));
  ctx.font = `${size}px ${FONT}`;
  let lines = wrapLines(ctx, text, bw);
  const maxLines = Math.max(1, Math.floor(bh / (size * 1.15)));
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = ellipsis(ctx, lines[maxLines - 1] + "…", bw); }
  return { size, lines };
}

// draws the note with its top-left corner at (0,0), unrotated; the caller sets the transform
export function drawNote(ctx, card, bmp, size) {
  const m = card.meta || {};
  const { w, h } = size || dims(m);
  const shape = m.shape || "square";
  const round = shape === "round";
  const u = Math.min(w, h) / 240;
  const paper = PAPER[(m.color != null ? m.color : hash(keyOf(card))) % PAPER.length];
  ctx.save();

  ctx.shadowColor = "rgba(20,40,75,.30)"; ctx.shadowBlur = 16 * u; ctx.shadowOffsetY = 6 * u;
  ctx.fillStyle = paper; paperPath(ctx, shape, w, h); ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.save();
  paperPath(ctx, shape, w, h); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "rgba(255,255,255,.30)"); g.addColorStop(1, "rgba(0,0,0,.07)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (!round) { // folded corner
    const f = Math.min(w, h) * 0.11;
    ctx.fillStyle = "rgba(0,0,0,.14)"; ctx.beginPath(); ctx.moveTo(w - f, h); ctx.lineTo(w, h - f); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  const fh = 30 * u;
  const C = round ? { x: w * 0.17, y: h * 0.17, w: w * 0.66, h: h * 0.5 } : { x: 16 * u, y: 30 * u, w: w - 32 * u, h: h - 78 * u };
  const F = round ? { x: w * 0.2, y: h * 0.7, w: w * 0.6, h: h * 0.2 } : { x: 16 * u, y: h - 12 * u - fh, w: w - 32 * u, h: fh };
  const text = (m.text || "").trim();
  let TR = null, DR = null;
  if (text && bmp) {
    // give the text as much room as it needs to stay readable (16u) before the drawing gets the rest
    const fits16 = (bw, bh) => { ctx.font = `${16 * u}px ${FONT}`; return wrapLines(ctx, text, bw).length * 16 * u * 1.15 <= bh; };
    const base = 0.28 + 0.2 * Math.min(1, text.length / 120);
    if (C.w > C.h * 1.45) { // wide card: text left, drawing right
      let sh = Math.max(0.36, base);
      while (sh < 0.7 && !fits16(C.w * sh - 6 * u, C.h)) sh += 0.04;
      const tw = C.w * sh;
      TR = { x: C.x, y: C.y, w: tw - 6 * u, h: C.h }; DR = { x: C.x + tw, y: C.y, w: C.w - tw, h: C.h };
    } else { // text on top, drawing below
      let sh = base;
      while (sh < 0.72 && !fits16(C.w, C.h * sh)) sh += 0.04;
      const th = C.h * sh;
      TR = { x: C.x, y: C.y, w: C.w, h: th }; DR = { x: C.x, y: C.y + th + 4 * u, w: C.w, h: C.h - th - 4 * u };
    }
  } else if (text) TR = C; else if (bmp) DR = C;

  if (TR) {
    const solo = !bmp;
    const { size: fs, lines } = fitText(ctx, text, TR.w, TR.h, 11 * u, (solo ? 62 : 44) * u, m.textScale || 1);
    const lh = fs * 1.15, bh = lines.length * lh, center = solo || round;
    ctx.font = `${fs}px ${FONT}`; ctx.fillStyle = INK; ctx.textBaseline = "top"; ctx.textAlign = center ? "center" : "left";
    const ty = solo ? TR.y + (TR.h - bh) / 2 : TR.y;
    lines.forEach((ln, i) => ctx.fillText(ln, center ? TR.x + TR.w / 2 : TR.x, ty + i * lh));
  }
  if (bmp && DR) {
    const s = Math.min(DR.w / bmp.width, DR.h / bmp.height), dw = bmp.width * s, dh = bmp.height * s;
    ctx.globalCompositeOperation = "multiply"; // ink sits on the paper, no white box
    ctx.drawImage(bmp, DR.x + (DR.w - dw) / 2, DR.y + (DR.h - dh) / 2, dw, dh);
    ctx.globalCompositeOperation = "source-over";
  }

  // footer: reactions + "other" on the left (capped), nickname on the right always keeps at least half
  const emo = (m.reactions || []).slice(0, 3).map((i) => REACT_EMOJI[i]).filter(Boolean).join("");
  const other = (m.other || "").trim();
  const name = "— " + (m.nickname || "Anonymous");
  const fe = Math.max(15, 22 * u), fo = Math.max(11, 15 * u), fnm = Math.max(12, 18 * u);
  ctx.textBaseline = "middle";
  if (round) { // two centred lines: reactions + "other", then the nickname
    const y1 = F.y + F.h * 0.28, y2 = F.y + F.h * 0.76;
    ctx.textAlign = "left";
    ctx.font = `${fe}px ${EMOJI}`; const ew = emo ? ctx.measureText(emo).width : 0;
    ctx.font = `italic ${fo}px ${FONT}`;
    const ot = other ? ellipsis(ctx, other, Math.max(0, F.w - ew - 6 * u)) : "";
    const ow = ot ? ctx.measureText(ot).width : 0;
    let x = F.x + (F.w - ew - (ot ? ow + 6 * u : 0)) / 2;
    if (emo) { ctx.font = `${fe}px ${EMOJI}`; ctx.fillStyle = "#000"; ctx.fillText(emo, x, y1); x += ew + 6 * u; }
    if (ot) { ctx.font = `italic ${fo}px ${FONT}`; ctx.fillStyle = "#4a5a78"; ctx.fillText(ot, x, y1); }
    ctx.font = `${fnm}px ${FONT}`; ctx.fillStyle = "#27406f"; ctx.textAlign = "center";
    ctx.fillText(ellipsis(ctx, name, F.w), F.x + F.w / 2, y2);
  } else { // one line: reactions + "other" on the left (capped), nickname on the right keeps the larger share
    const yMid = F.y + F.h / 2;
    let used = 0;
    if (emo) { ctx.font = `${fe}px ${EMOJI}`; ctx.textAlign = "left"; ctx.fillStyle = "#000"; ctx.fillText(emo, F.x, yMid); used = ctx.measureText(emo).width + 4 * u; }
    if (other) {
      const room = F.w * 0.36 - used;
      if (room > 24 * u) {
        ctx.font = `italic ${fo}px ${FONT}`; ctx.fillStyle = "#4a5a78"; ctx.textAlign = "left";
        const ot = ellipsis(ctx, other, room);
        ctx.fillText(ot, F.x + used, yMid); used += ctx.measureText(ot).width + 6 * u;
      }
    }
    ctx.font = `${fnm}px ${FONT}`; ctx.fillStyle = "#27406f"; ctx.textAlign = "right";
    ctx.fillText(ellipsis(ctx, name, Math.max(F.w - used, F.w * 0.58)), F.x + F.w, yMid);
  }

  // stickers overhang the corners
  const stk = (m.stickers || []).slice(0, 3);
  const ss = { s: 0.8, m: 1.2, l: 1.7 }[m.stickerSize || "m"] * 0.2 * Math.min(w, h);
  const spots = round ? [[0.84 * w, 0.2 * h, 12], [0.14 * w, 0.8 * h, -14], [0.84 * w, 0.82 * h, 10]] : [[w - 12 * u, 20 * u, 12], [12 * u, h - 14 * u, -14], [w - 14 * u, h - 16 * u, 10]];
  stk.forEach((e, i) => {
    ctx.save(); ctx.translate(spots[i][0], spots[i][1]); ctx.rotate(rad(spots[i][2]));
    ctx.font = `${ss}px ${EMOJI}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000"; ctx.fillText(e, 0, 0);
    ctx.restore();
  });

  // tape or thumbtack
  const pin = m.pin || "tape";
  if (pin === "tape") {
    ctx.save(); ctx.translate(w / 2, 4 * u); ctx.rotate(rad(-3));
    ctx.shadowColor = "rgba(0,0,0,.18)"; ctx.shadowBlur = 3 * u; ctx.shadowOffsetY = 1;
    ctx.fillStyle = "rgba(255,255,255,.62)"; ctx.fillRect(-52 * u, -15 * u, 104 * u, 30 * u);
    ctx.restore();
  } else if (pin !== "none") {
    const cx = w / 2, cy = 16 * u, r = 11 * u, col = PIN_COL[pin] || PIN_COL.red;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(cx + 5 * u, cy + 8 * u, 11 * u, 5 * u, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.28)"; ctx.lineWidth = 1.5 * u; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.ellipse(cx - 3.5 * u, cy - 4 * u, 3.6 * u, 2.4 * u, -0.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---- cached wall images (PNG with transparent padding) ----
const cache = new Map();
export function noteSig(card, big) {
  const m = card.meta || {};
  return [card.uid || card.id, big ? "B" : "S", m.text, m.nickname, (m.reactions || []).join(","), m.other, m.color, (m.stickers || []).join(""), m.stickerSize, m.pin, m.shape, m.size, m.textScale, card.thumbBlob ? 1 : 0, card.drawingBlob ? 1 : 0].join("|");
}
let running = 0;
const waiters = [];
const acquire = () => new Promise((res) => { if (running < 3) { running++; res(); } else waiters.push(res); });
const release = () => { running--; const n = waiters.shift(); if (n) { running++; n(); } };

export async function renderNoteCanvas(card, scale = 2, preferFull = true) {
  await ensureFont();
  const src = preferFull ? card.drawingBlob || card.thumbBlob : card.thumbBlob || card.drawingBlob;
  const bmp = src ? await createImageBitmap(src).catch(() => null) : null;
  const { w, h } = dims(card.meta);
  const cv = document.createElement("canvas");
  cv.width = Math.round((w + 2 * PAD) * scale); cv.height = Math.round((h + 2 * PAD) * scale);
  const ctx = cv.getContext("2d");
  ctx.scale(scale, scale); ctx.translate(PAD, PAD);
  drawNote(ctx, card, bmp, { w, h });
  if (bmp && bmp.close) bmp.close();
  return cv;
}

export async function noteURL(card, big = false) {
  const key = noteSig(card, big);
  if (cache.has(key)) return cache.get(key);
  await acquire();
  try {
    if (cache.has(key)) return cache.get(key);
    const cv = await renderNoteCanvas(card, big ? 3 : 1.6, big);
    const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    const url = URL.createObjectURL(blob);
    cache.set(key, url);
    return url;
  } finally { release(); }
}
