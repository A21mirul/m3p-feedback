// Wall geometry. Positions are note top-left corners in board pixels; every page has a background
// (a poster with a cork area, or a plain board) and notes are kept on its cork area.
import { dims } from "./shapes.js";

export const BOARD_W = 4800;
export const BOARD_H = Math.round((BOARD_W * 1440) / 3240); // both posters are 3240x1440
export const M = 40;
const K = BOARD_W / 3240; // poster pixel -> board pixel
const rad = (d) => (d * Math.PI) / 180;
const sc = (rects) => rects.map(([a, b, c, d]) => [a * K, b * K, c * K, d * K]);

// zone = the cork surface (centre, half size, tilt); excl = decorations we avoid when auto-placing
export const BGS = {
  m3p2: {
    label: "M3P poster (new)", file: "template/m3p2.jpg",
    zone: { cx: 1600 * K, cy: 736 * K, hw: 1120 * K, hh: 604 * K, a: 0, fx: 0.96, fy: 0.95, m: 40 },
    excl: sc([[1330, 150, 1990, 470], [2330, 980, 3040, 1440], [2150, 40, 3240, 500], [2440, 540, 2660, 670], [880, 320, 1080, 500]]),
  },
  m3p1: {
    label: "M3P poster (tilted cork)", file: "template/m3p.jpg",
    zone: { cx: 1584 * K, cy: 782 * K, hw: 1080 * K, hh: 596 * K, a: rad(-6.6), fx: 0.96, fy: 0.95, m: 40 },
    excl: sc([[540, 350, 890, 1420], [1300, 190, 1900, 540], [1780, 860, 2430, 1270], [2430, 850, 3100, 1400], [2100, 100, 3240, 640]]),
  },
  plain: {
    label: "Plain board", file: null,
    zone: { cx: BOARD_W / 2, cy: BOARD_H / 2, hw: BOARD_W / 2, hh: BOARD_H / 2, a: 0, fx: 1, fy: 1, m: 10 },
    excl: [],
  },
};
export const BG_IDS = Object.keys(BGS);
export const bgUrl = (id) => (BGS[id] && BGS[id].file ? new URL("./" + BGS[id].file, document.baseURI).href : null);
export function bgIdFromSettings(settings, page) {
  const m = (settings && settings.pageBg) || {};
  if (m[page] && BGS[m[page]]) return m[page];
  return page % 2 === 1 ? "m3p2" : "m3p1"; // default: odd pages new poster, even pages the older one
}
export function bgIdForPage(page) {
  try { return bgIdFromSettings(JSON.parse(localStorage.getItem("m3p-settings") || "{}"), page); } catch (e) { return bgIdFromSettings({}, page); }
}

export const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };

const zoneOf = (id) => (BGS[id] || BGS.plain).zone;
const local = (z, cx, cy) => {
  const dx = cx - z.cx, dy = cy - z.cy, c = Math.cos(z.a), s = Math.sin(z.a);
  return { lx: dx * c + dy * s, ly: -dx * s + dy * c, c, s };
};
const lim = (z, w, h) => ({ mx: z.hw * z.fx - w / 2 - z.m, my: z.hh * z.fy - h / 2 - z.m });

// keep a note of size {w,h} on the cork (and on the board)
export function clampP(p, size, bgId) {
  const z = zoneOf(bgId), { w, h } = size;
  const { lx, ly, c, s } = local(z, p.x + w / 2, p.y + h / 2), { mx, my } = lim(z, w, h);
  const ax = Math.max(-mx, Math.min(mx, lx)), ay = Math.max(-my, Math.min(my, ly));
  const nx = z.cx + ax * c - ay * s, ny = z.cy + ax * s + ay * c;
  return { x: Math.min(BOARD_W - w, Math.max(0, nx - w / 2)), y: Math.min(BOARD_H - h, Math.max(0, ny - h / 2)) };
}

// a card's rectangle on its page; cards saved without a position get a stable pseudo-random spot
export function rectOf(card, bgId) {
  const sz = dims(card.meta);
  let p;
  if (card.pos && card.pos.x != null) p = clampP({ x: card.pos.x, y: card.pos.y }, sz, bgId);
  else {
    const h = hash(card.uid || "L" + card.id);
    p = clampP({ x: M + (h % (BOARD_W - sz.w - 2 * M)), y: M + ((h >> 7) % (BOARD_H - sz.h - 2 * M)) }, sz, bgId);
  }
  return { x: p.x, y: p.y, w: sz.w, h: sz.h };
}
export const posOf = (card, bgId) => { const r = rectOf(card, bgId); return { x: r.x, y: r.y }; };

export const overlaps = (a, b) =>
  Math.abs(a.x + a.w / 2 - b.x - b.w / 2) < ((a.w + b.w) / 2) * 0.8 && Math.abs(a.y + a.h / 2 - b.y - b.h / 2) < ((a.h + b.h) / 2) * 0.75;
export const overlapCount = (r, list) => list.reduce((n, q) => n + (overlaps(r, q) ? 1 : 0), 0);

// nearest spot on the cork to `anchor` that doesn't overlap anything (least overlap if it is full)
export function findFree(list, anchor, size, bgId, step = 60) {
  const bg = BGS[bgId] || BGS.plain, z = bg.zone, { w, h } = size, { mx, my } = lim(z, w, h);
  let best = null, bestScore = Infinity;
  for (let x = 0; x <= BOARD_W - w; x += step)
    for (let y = 0; y <= BOARD_H - h; y += step) {
      const cx = x + w / 2, cy = y + h / 2, { lx, ly } = local(z, cx, cy);
      if (Math.abs(lx) > mx || Math.abs(ly) > my) continue;
      const ex = bg.excl.some(([x0, y0, x1, y1]) => cx > x0 - 60 && cx < x1 + 60 && cy > y0 - 60 && cy < y1 + 60);
      const score = overlapCount({ x, y, w, h }, list) * 1e6 + (ex ? 1.5e6 : 0) + Math.hypot(x - anchor.x, y - anchor.y);
      if (score < bestScore) { bestScore = score; best = { x, y }; }
    }
  return best || clampP({ x: z.cx - w / 2, y: z.cy - h / 2 }, size, bgId);
}
