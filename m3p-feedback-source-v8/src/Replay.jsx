import React, { useEffect, useRef } from "react";

// draw the first `frac` (0..1) of all recorded points
export function drawStrokes(ctx, st, W, H, frac) {
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  const pad = 20, sc = Math.min((W - 2 * pad) / st.w, (H - 2 * pad) / st.h);
  const ox = (W - st.w * sc) / 2, oy = (H - st.h * sc) / 2;
  const total = st.s.reduce((n, s) => n + s.p.length / 2, 0);
  let left = Math.max(1, Math.floor(total * frac));
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const s of st.s) {
    if (left <= 0) break;
    const n = s.p.length / 2, take = Math.min(n, left);
    left -= take;
    ctx.strokeStyle = s.c; ctx.lineWidth = Math.max(1.5, s.k * sc * 1.2);
    ctx.beginPath();
    for (let i = 0; i < take; i++) {
      const x = ox + s.p[2 * i] * sc, y = oy + s.p[2 * i + 1] * sc;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    if (take === 1) ctx.lineTo(ox + s.p[0] * sc + 0.1, oy + s.p[1] * sc);
    ctx.stroke();
  }
}

export default function StrokePlayer({ strokes, ms = 3000 }) {
  const ref = useRef(null);
  const W = 480, H = Math.round(Math.min(640, Math.max(240, (W * strokes.h) / strokes.w)));
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext("2d");
    let raf, t0 = null, dead = false;
    const loop = (t) => {
      if (dead) return;
      if (t0 == null) t0 = t;
      const f = Math.min(1, (t - t0) / ms);
      drawStrokes(ctx, strokes, W, H, f);
      if (f < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, [strokes]);
  return <canvas ref={ref} width={W} height={H} className="replaycv" />;
}
