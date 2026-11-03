import React, { useEffect, useRef, useState } from "react";
import { dims } from "./shapes.js";
import { PAD, drawNote, ensureFont, tagBox } from "./noteRender.js";

// Live preview of the note being written. Reaction labels are drawn by the shared renderer and
// get invisible drag handles on top, so a visitor can move a label onto the card or drag it off to remove it.
export default function CardPreview({ meta, bmp, tags, onTags, removeLabel }) {
  const cv = useRef(null);
  const box = useRef(null);
  const [drag, setDrag] = useState(null); // { i, out }
  const { w, h } = dims(meta);
  const full = w + 2 * PAD, fullH = h + 2 * PAD;
  const DISPLAY = 270;
  const k = DISPLAY / Math.max(full, fullH); // card px -> css px
  const sig = JSON.stringify(meta) + "|" + (bmp ? bmp.width + "x" + bmp.height + ":" + (bmp.__v || 0) : "");

  useEffect(() => {
    let dead = false;
    ensureFont().then(() => {
      if (dead || !cv.current) return;
      const S = 2;
      cv.current.width = Math.round(full * S); cv.current.height = Math.round(fullH * S);
      const ctx = cv.current.getContext("2d");
      ctx.clearRect(0, 0, cv.current.width, cv.current.height);
      ctx.scale(S, S); ctx.translate(PAD, PAD);
      drawNote(ctx, { uid: "preview", meta }, bmp, { w, h });
    });
    return () => { dead = true; };
  }, [sig]);

  const toCard = (e) => {
    const r = box.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / k - PAD) / w, y: ((e.clientY - r.top) / k - PAD) / h };
  };
  const onDown = (i) => (e) => {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ i, out: false });
  };
  const onMove = (i) => (e) => {
    if (!drag || drag.i !== i) return;
    const p = toCard(e);
    const out = p.x < -0.12 || p.x > 1.12 || p.y < -0.12 || p.y > 1.12;
    if (out !== drag.out) setDrag({ i, out });
    onTags(tags.map((g, j) => (j === i ? { ...g, x: Math.min(0.96, Math.max(0.04, p.x)), y: Math.min(0.96, Math.max(0.04, p.y)) } : g)));
  };
  const onUp = (i) => () => {
    if (drag && drag.i === i && drag.out) onTags(tags.filter((_, j) => j !== i));
    setDrag(null);
  };

  return (
    <div className="cprev" ref={box} style={{ width: full * k, height: fullH * k }}>
      <canvas ref={cv} style={{ width: full * k, height: fullH * k }} />
      {tags.map((g, i) => {
        const b = tagBox(g, w, h);
        const cx = (PAD + g.x * w) * k, cy = (PAD + g.y * h) * k;
        return (
          <div
            key={i}
            className={"tghandle" + (drag && drag.i === i ? (drag.out ? " out" : " on") : "")}
            style={{ left: cx - (b.w * k) / 2, top: cy - (b.h * k) / 2, width: b.w * k, height: b.h * k, transform: `rotate(${g.r || 0}deg)` }}
            onPointerDown={onDown(i)} onPointerMove={onMove(i)} onPointerUp={onUp(i)} onPointerCancel={onUp(i)}
          >
            <button className="tgx" title={removeLabel} aria-label={removeLabel} onPointerDown={(e) => e.stopPropagation()} onClick={() => onTags(tags.filter((_, j) => j !== i))}>✕</button>
          </div>
        );
      })}
    </div>
  );
}
