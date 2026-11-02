// Pack Excalidraw freedraw strokes into a compact form for replay (kept strokes only, in drawing order).
export function packStrokes(elements) {
  const list = (elements || []).filter((e) => e.type === "freedraw" && !e.isDeleted && e.points && e.points.length);
  if (!list.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of list) for (const [px, py] of e.points) {
    const x = e.x + px, y = e.y + py;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const r = (n) => Math.round(n * 10) / 10;
  const s = list.map((e) => {
    const p = [];
    for (const [px, py] of e.points) p.push(r(e.x + px - x0), r(e.y + py - y0));
    return { c: e.strokeColor, k: e.strokeWidth || 2, p };
  });
  return { v: 1, w: Math.max(1, r(x1 - x0)), h: Math.max(1, r(y1 - y0)), s };
}
