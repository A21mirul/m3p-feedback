// Free-form wall geometry on the M3P poster. Positions are note top-left corners in board pixels.
export const BOARD_W = 4800;
export const BOARD_H = Math.round((BOARD_W * 1440) / 3240); // poster is 3240x1440
export const NOTE_W = 240, NOTE_H = 240, M = 40;
const K = BOARD_W / 3240; // poster pixel -> board pixel
export const TEMPLATE_URL = () => new URL("./template/m3p.jpg", document.baseURI).href;

// the tilted cork surface (fitted to the poster): centre, half size, angle
export const ZONE = { cx: 1584 * K, cy: 782 * K, hw: 1080 * K, hh: 596 * K, a: (-6.6 * Math.PI) / 180 };
// decorations we'd rather not auto-place on (logo, photo strips, magnifier); drag can still go there
const EX = [[540, 350, 890, 1420], [1300, 190, 1900, 540], [1780, 860, 2430, 1270], [2430, 850, 3100, 1400], [2100, 100, 3240, 640]]
  .map(([a, b, c, d]) => [a * K, b * K, c * K, d * K]);

export const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };

const local = (cx, cy) => {
  const dx = cx - ZONE.cx, dy = cy - ZONE.cy, c = Math.cos(ZONE.a), s = Math.sin(ZONE.a);
  return { lx: dx * c + dy * s, ly: -dx * s + dy * c, c, s };
};
const limits = () => ({ mx: ZONE.hw * 0.96 - NOTE_W / 2 - 40, my: ZONE.hh * 0.95 - NOTE_H / 2 - 40 }); // keep notes off the wooden frame
const inZone = (cx, cy) => { const { lx, ly } = local(cx, cy), { mx, my } = limits(); return Math.abs(lx) <= mx && Math.abs(ly) <= my; };
const inExcl = (cx, cy) => EX.some(([x0, y0, x1, y1]) => cx > x0 - 60 && cx < x1 + 60 && cy > y0 - 60 && cy < y1 + 60);

// keep a note on the cork (and on the board)
export function clampP(p) {
  const { lx, ly, c, s } = local(p.x + NOTE_W / 2, p.y + NOTE_H / 2), { mx, my } = limits();
  const ax = Math.max(-mx, Math.min(mx, lx)), ay = Math.max(-my, Math.min(my, ly));
  const nx = ZONE.cx + ax * c - ay * s, ny = ZONE.cy + ax * s + ay * c;
  return { x: Math.min(BOARD_W - NOTE_W, Math.max(0, nx - NOTE_W / 2)), y: Math.min(BOARD_H - NOTE_H, Math.max(0, ny - NOTE_H / 2)) };
}

// cards saved without a position get a stable pseudo-random spot on the cork
export function posOf(card) {
  if (card.pos && card.pos.x != null) return clampP({ x: card.pos.x, y: card.pos.y });
  const h = hash(card.uid || "L" + card.id);
  return clampP({ x: M + (h % (BOARD_W - NOTE_W - 2 * M)), y: M + ((h >> 7) % (BOARD_H - NOTE_H - 2 * M)) });
}
export const overlaps = (a, b) => Math.abs(a.x - b.x) < NOTE_W * 0.8 && Math.abs(a.y - b.y) < NOTE_H * 0.75;
export const overlapCount = (p, list) => list.reduce((n, q) => n + (overlaps(p, q) ? 1 : 0), 0);

// nearest spot on the cork to `anchor` that doesn't overlap anything (least overlap if it is full)
export function findFree(list, anchor, step = 60) {
  let best = { x: ZONE.cx - NOTE_W / 2, y: ZONE.cy - NOTE_H / 2 }, bestScore = Infinity;
  for (let x = 0; x <= BOARD_W - NOTE_W; x += step)
    for (let y = 0; y <= BOARD_H - NOTE_H; y += step) {
      const cx = x + NOTE_W / 2, cy = y + NOTE_H / 2;
      if (!inZone(cx, cy)) continue;
      const score = overlapCount({ x, y }, list) * 1e6 + (inExcl(cx, cy) ? 5e5 : 0) + Math.hypot(x - anchor.x, y - anchor.y);
      if (score < bestScore) { bestScore = score; best = { x, y }; }
    }
  return best;
}
