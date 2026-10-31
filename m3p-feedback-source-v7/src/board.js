// Free-form wall geometry. Positions are top-left corners in board pixels.
export const BOARD_W = 4800, BOARD_H = 3000, NOTE_W = 240, NOTE_H = 240, M = 40;

export const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };

// cards saved before positions existed get a stable pseudo-random spot
export function posOf(card) {
  if (card.pos && card.pos.x != null) return { x: card.pos.x, y: card.pos.y };
  const h = hash(card.uid || "L" + card.id);
  return { x: M + (h % (BOARD_W - NOTE_W - 2 * M)), y: M + ((h >> 7) % (BOARD_H - NOTE_H - 2 * M)) };
}
export const clampP = (p) => ({ x: Math.min(BOARD_W - NOTE_W, Math.max(0, p.x)), y: Math.min(BOARD_H - NOTE_H, Math.max(0, p.y)) });
export const overlaps = (a, b) => Math.abs(a.x - b.x) < NOTE_W * 0.8 && Math.abs(a.y - b.y) < NOTE_H * 0.75;
export const overlapCount = (p, list) => list.reduce((n, q) => n + (overlaps(p, q) ? 1 : 0), 0);

// nearest spot to `anchor` that doesn't overlap anything (or least overlap if the board is full)
export function findFree(list, anchor, step = 60) {
  let best = { x: M, y: M }, bestScore = Infinity;
  for (let x = M; x <= BOARD_W - NOTE_W - M; x += step)
    for (let y = M; y <= BOARD_H - NOTE_H - M; y += step) {
      const score = overlapCount({ x, y }, list) * 1e6 + Math.hypot(x - anchor.x, y - anchor.y);
      if (score < bestScore) { bestScore = score; best = { x, y }; }
    }
  return best;
}
