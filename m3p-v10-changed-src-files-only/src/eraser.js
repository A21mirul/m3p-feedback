// Partial eraser: removes only the part of a freedraw stroke under the eraser and keeps the rest as new strokes.
// Excalidraw's own eraser deletes whole elements, so we split the points ourselves.
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

const rid = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
const rint = () => Math.floor(Math.random() * 2 ** 31);

// insert points so no gap is longer than `max` (keeps the pressure list in step when the element has one)
function densify(abs, pressures, max) {
  const out = [], orig = [], pr = pressures ? [] : null;
  for (let i = 0; i < abs.length; i++) {
    if (i > 0) {
      const [ax, ay] = abs[i - 1], [bx, by] = abs[i];
      const n = Math.floor(Math.hypot(bx - ax, by - ay) / max);
      for (let j = 1; j <= n; j++) {
        const t = j / (n + 1);
        out.push([ax + (bx - ax) * t, ay + (by - ay) * t]); orig.push(false);
        if (pr) pr.push(pressures[i - 1] + (pressures[i] - pressures[i - 1]) * t);
      }
    }
    out.push(abs[i]); orig.push(true);
    if (pr) pr.push(pressures[i]);
  }
  return { pts: out, pr, orig };
}

function build(el, run, pr) {
  const x0 = run[0][0], y0 = run[0][1];
  const points = run.map(([x, y]) => [x - x0, y - y0]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return {
    ...el, id: rid(), seed: rint(), version: 1, versionNonce: rint(), updated: Date.now(), index: null,
    x: x0, y: y0, points, pressures: pr || [], width: maxX - minX, height: maxY - minY, isDeleted: false,
  };
}

// erase around one scene point; returns true if something changed. Does not record history (see commitErase).
export function eraseAt(api, cx, cy, radius) {
  const all = api.getSceneElementsIncludingDeleted();
  const next = [];
  let changed = false;
  for (const el of all) {
    if (el.type !== "freedraw" || el.isDeleted || !el.points || !el.points.length) { next.push(el); continue; }
    const reach = radius + (el.strokeWidth || 2) / 2;
    if (cx < el.x - reach || cx > el.x + el.width + reach || cy < el.y - reach || cy > el.y + el.height + reach) { next.push(el); continue; }
    const abs = el.points.map(([px, py]) => [el.x + px, el.y + py]);
    const hasPr = el.pressures && el.pressures.length === el.points.length && !el.simulatePressure;
    const { pts, pr, orig } = densify(abs, hasPr ? el.pressures : null, Math.max(1, reach / 3));
    const dead = pts.map(([x, y]) => Math.hypot(x - cx, y - cy) <= reach);
    if (!dead.some(Boolean)) { next.push(el); continue; }
    changed = true;
    next.push({ ...el, isDeleted: true, version: el.version + 1, versionNonce: rint(), updated: Date.now() });
    let run = [], rp = [];
    const flush = () => {
      if (run.length >= 2) next.push(build(el, run, hasPr ? rp : null));
      run = []; rp = [];
    };
    // keep the original sample points (so the stroke keeps its look) plus the new cut ends next to the eraser
    pts.forEach((p, i) => {
      if (dead[i]) return flush();
      if (orig[i] || dead[i - 1] || dead[i + 1]) { run.push(p); if (hasPr) rp.push(pr[i]); }
    });
    flush();
  }
  if (changed) api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.NEVER });
  return changed;
}

// Undo support: a gesture is many small scene updates that must become ONE undo step.
// begin: remember the scene; end: put the old scene back silently, then apply the final one as a single recorded update.
export function beginErase(api) { return api.getSceneElementsIncludingDeleted(); }
export function commitErase(api, before) {
  const after = api.getSceneElementsIncludingDeleted();
  if (after === before || !before) return;
  api.updateScene({ elements: before, captureUpdate: CaptureUpdateAction.NEVER });
  api.updateScene({ elements: after, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}
