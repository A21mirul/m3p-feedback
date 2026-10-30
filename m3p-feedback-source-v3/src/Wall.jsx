import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { allCards } from "./storage.js";
import { BOARD_W, BOARD_H, NOTE_W, NOTE_H, hash, posOf, clampP, overlapCount, findFree } from "./board.js";

const TINTS = ["#FFF4CC", "#DDF6F3", "#FFE1E1", "#E3ECFA", "#FFFFFF"];
export const keyOf = (c) => c.uid || "L" + c.id;

export function useCards(version) {
  const [state, setState] = useState({ cards: [], urls: {}, loaded: false });
  useEffect(() => {
    let dead = false;
    const made = [];
    (async () => {
      const list = (await allCards()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const urls = {};
      list.forEach((c) => { if (c.drawingBlob) { urls[keyOf(c)] = URL.createObjectURL(c.drawingBlob); made.push(urls[keyOf(c)]); } });
      if (dead) { made.forEach((u) => URL.revokeObjectURL(u)); return; }
      setState({ cards: list, urls, loaded: true });
    })();
    return () => { dead = true; setTimeout(() => made.forEach((u) => URL.revokeObjectURL(u)), 3000); };
  }, [version]);
  return state;
}

export function Note({ card, url, t, fresh }) {
  const m = card.meta || {};
  const h = hash(keyOf(card));
  const rot = card.pos && card.pos.r != null ? card.pos.r : (h % 5) - 2;
  const reacts = (m.reactions || []).map((i) => t.react[i]).filter(Boolean);
  if ((m.other || "").trim()) reacts.push(m.other.trim());
  return (
    <figure className={"note" + (fresh ? " fresh" : "") + (card.hidden ? " hid" : "")} style={{ background: TINTS[h % TINTS.length], "--rot": `${rot}deg` }}>
      <span className="pin" />
      {url && <img src={url} alt="" draggable={false} />}
      {m.text && <p>{m.text}</p>}
      {reacts.length > 0 && <div className="rchips">{reacts.map((r, i) => <span key={i}>{r}</span>)}</div>}
      <figcaption>— {m.nickname || t.anon}{m.visitor ? ` · ${m.visitor}` : ""}</figcaption>
    </figure>
  );
}

export default function Wall({ t, version, freshUid, pending, saving, onWrite, onBack, onConfirm }) {
  const { cards, urls, loaded } = useCards(version);
  const shown = cards.filter((c) => !c.hidden);
  const ordered = shown.slice().reverse(); // oldest first, so newer notes sit on top
  const others = shown.map(posOf);
  const [open, setOpen] = useState(null);
  const [bad, setBad] = useState(false);
  const [ready, setReady] = useState(false);
  const vp = useRef(null), bd = useRef(null), ghost = useRef(null);
  const view = useRef({ x: 0, y: 0, z: 0.8 });
  const gp = useRef({ x: 0, y: 0 });
  const ptrs = useRef(new Map());
  const drag = useRef(null);
  const touched = useRef(Date.now());
  const inited = useRef(false);
  const live = useRef({});
  live.current = { open, placing: !!pending };

  const apply = () => {
    const w = vp.current.clientWidth, h = vp.current.clientHeight, v = view.current;
    const zmin = Math.max(w / BOARD_W, h / BOARD_H);
    v.z = Math.min(1.6, Math.max(zmin, v.z));
    v.x = Math.min(0, Math.max(w - BOARD_W * v.z, v.x));
    v.y = Math.min(0, Math.max(h - BOARD_H * v.z, v.y));
    bd.current.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
  };
  const zoomAt = (f, cx, cy) => {
    const v = view.current;
    const bx = (cx - v.x) / v.z, by = (cy - v.y) / v.z;
    v.z *= f; apply();
    v.x = cx - bx * v.z; v.y = cy - by * v.z; apply();
  };
  const centerOn = (bx, by) => {
    const v = view.current;
    v.x = vp.current.clientWidth / 2 - bx * v.z;
    v.y = vp.current.clientHeight / 2 - by * v.z;
    apply();
  };
  const zoomBtn = (f) => { touched.current = Date.now(); zoomAt(f, vp.current.clientWidth / 2, vp.current.clientHeight / 2); };
  const fit = () => { touched.current = Date.now(); Object.assign(view.current, { z: 0, x: 0, y: 0 }); apply(); };
  const putGhost = () => {
    if (!ghost.current) return;
    ghost.current.style.left = gp.current.x + "px";
    ghost.current.style.top = gp.current.y + "px";
    setBad(overlapCount(gp.current, others) > 0);
  };

  useLayoutEffect(() => { apply(); const r = () => apply(); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, []);

  useEffect(() => {
    const el = vp.current;
    const onWheel = (e) => {
      e.preventDefault(); touched.current = Date.now();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // first load: look at the newest note; when placing, drop the ghost in the nearest empty spot
  useEffect(() => {
    if (!loaded || inited.current) return;
    inited.current = true;
    const p0 = shown[0] ? posOf(shown[0]) : { x: BOARD_W / 2 - NOTE_W / 2, y: BOARD_H / 2 - NOTE_H / 2 };
    centerOn(p0.x + NOTE_W / 2, p0.y + NOTE_H / 2);
    if (pending) {
      gp.current = findFree(others, p0);
      centerOn(gp.current.x + NOTE_W / 2, gp.current.y + NOTE_H / 2);
      setBad(false); setReady(true);
    }
  }, [loaded]);

  // after posting, jump to the new note
  useEffect(() => {
    if (!freshUid || !loaded) return;
    const c = cards.find((x) => keyOf(x) === freshUid);
    if (c) { const p = posOf(c); centerOn(p.x + NOTE_W / 2, p.y + 150); }
  }, [freshUid, loaded, cards]);

  // attract mode: slow drift around the board when nobody is touching it
  useEffect(() => {
    let raf; const dir = { x: -0.35, y: 0.2 };
    const step = () => {
      const L = live.current;
      if (!L.placing && !L.open && !drag.current && Date.now() - touched.current > 8000) {
        const v = view.current, nx = v.x + dir.x, ny = v.y + dir.y;
        v.x = nx; v.y = ny; apply();
        if (v.x !== nx) dir.x *= -1;
        if (v.y !== ny) dir.y *= -1;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const dist = () => { const [a, b] = [...ptrs.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const onDown = (e) => {
    touched.current = Date.now();
    vp.current.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) { drag.current = { mode: "pinch", d: dist() }; return; }
    const onGhost = !!e.target.closest(".holding");
    const noteEl = e.target.closest(".bnote:not(.holding)");
    const d = { mode: onGhost ? "ghost" : "pan", lx: e.clientX, ly: e.clientY, moved: 0, key: noteEl && noteEl.dataset.key };
    if (onGhost) {
      const r = vp.current.getBoundingClientRect(), v = view.current;
      d.off = { x: (e.clientX - r.left - v.x) / v.z - gp.current.x, y: (e.clientY - r.top - v.y) / v.z - gp.current.y };
    }
    drag.current = d;
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d || !ptrs.current.has(e.pointerId)) return;
    touched.current = Date.now();
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = view.current, r = vp.current.getBoundingClientRect();
    if (d.mode === "pinch") {
      if (ptrs.current.size < 2) return;
      const nd = dist(), [a, b] = [...ptrs.current.values()];
      zoomAt(nd / d.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      d.d = nd; return;
    }
    const dx = e.clientX - d.lx, dy = e.clientY - d.ly;
    d.lx = e.clientX; d.ly = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
    if (d.mode === "pan") { v.x += dx; v.y += dy; apply(); return; }
    // dragging the ghost note; pan the board when it nears the edge
    if (e.clientX - r.left < 70) v.x += 14; else if (r.right - e.clientX < 70) v.x -= 14;
    if (e.clientY - r.top < 70) v.y += 14; else if (r.bottom - e.clientY < 70) v.y -= 14;
    apply();
    gp.current = clampP({ x: (e.clientX - r.left - v.x) / v.z - d.off.x, y: (e.clientY - r.top - v.y) / v.z - d.off.y });
    putGhost();
  };
  const onUp = (e) => {
    const d = drag.current;
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) drag.current = null;
    if (d && d.mode === "pan" && d.moved < 6 && d.key) {
      const c = shown.find((x) => keyOf(x) === d.key);
      if (c) setOpen(c);
    }
  };
  const findSpot = () => {
    touched.current = Date.now();
    gp.current = findFree(others, gp.current);
    putGhost();
    centerOn(gp.current.x + NOTE_W / 2, gp.current.y + NOTE_H / 2);
  };

  return (
    <div className="wallview">
      <div className="wallhead">
        <h2>{t.wallTitle}</h2>
        <div className="wallcount"><b>{shown.length}</b>{t.wallCount}</div>
      </div>
      <div className="wallvp" ref={vp} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="board" ref={bd} style={{ width: BOARD_W, height: BOARD_H }}>
          {ordered.map((c, i) => {
            const p = posOf(c), k = keyOf(c);
            return (
              <div key={k} data-key={k} className="bnote" style={{ left: p.x, top: p.y, zIndex: i + 1 }}>
                <Note card={c} url={urls[k]} t={t} fresh={k === freshUid} />
              </div>
            );
          })}
          {pending && ready && (
            <div ref={ghost} className={"bnote holding" + (bad ? " bad" : "")} style={{ left: gp.current.x, top: gp.current.y, zIndex: 99999 }}>
              <Note card={{ uid: pending.uid, meta: pending.meta, pos: { r: pending.r } }} url={pending.url} t={t} />
            </div>
          )}
        </div>
      </div>
      {loaded && !shown.length && !pending && <p className="wallempty">{t.wallEmpty}</p>}
      <div className="zoomctl">
        <button className="ghost" onClick={() => zoomBtn(1.25)}>＋</button>
        <button className="ghost" onClick={() => zoomBtn(0.8)}>－</button>
        <button className="ghost" onClick={fit}>⤢</button>
      </div>
      {pending ? (
        <div className="placebar">
          <div className={"placehint" + (bad ? " bad" : "")}>{bad ? t.hintBad : t.hintDrag}</div>
          <div className="placebtns">
            <button className="ghost" onClick={onBack}>← {t.backEdit}</button>
            <button className="primary alt" onClick={findSpot}>🔍 {t.findSpot}</button>
            <button className="primary big" disabled={!ready || saving} onClick={() => onConfirm({ x: gp.current.x, y: gp.current.y })}>{saving ? t.saving : `📌 ${t.stick}`}</button>
          </div>
        </div>
      ) : (
        <button className="primary big fab" onClick={onWrite}>✏️ {t.writeBtn}</button>
      )}
      {open && (
        <div className="overlay" onClick={() => setOpen(null)}>
          <div className="card zoomnote" onClick={(e) => e.stopPropagation()}>
            <Note card={open} url={urls[keyOf(open)]} t={t} />
          </div>
        </div>
      )}
    </div>
  );
}
