import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { allCards, putCard } from "./storage.js";
import StrokePlayer from "./Replay.jsx";
import { BOARD_W, BOARD_H, BGS, bgUrl, hash, rectOf, clampP, overlapCount, findFree } from "./board.js";
import { dims, SHAPES } from "./shapes.js";
import { PAPER, STICKERS, PINS, PIN_COL, PAD, noteURL, noteSig } from "./noteRender.js";

export const keyOf = (c) => c.uid || "L" + c.id;
const SHAPE_ICON = { square: "◻", wide: "▭", tall: "▯", round: "◯" };

export function useCards(version) {
  const [state, setState] = useState({ cards: [], loaded: false });
  useEffect(() => {
    let dead = false;
    (async () => {
      const list = (await allCards()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (!dead) setState({ cards: list, loaded: true });
    })();
    return () => { dead = true; };
  }, [version]);
  return state;
}

export function useNoteURL(card, big) {
  const [url, setUrl] = useState(null);
  const sig = noteSig(card, big);
  useEffect(() => {
    let dead = false;
    noteURL(card, big).then((u) => { if (!dead) setUrl(u); });
    return () => { dead = true; };
  }, [sig]);
  return url;
}

// a note on the board: the shared renderer's image, offset by the padding it carries
export const NoteImg = React.memo(function NoteImg({ card }) {
  const url = useNoteURL(card, false);
  const { w, h } = dims(card.meta);
  const paper = PAPER[((card.meta && card.meta.color) != null ? card.meta.color : hash(keyOf(card))) % PAPER.length];
  return url
    ? <img className="nimg" src={url} alt="" draggable={false} decoding="async" style={{ width: w + 2 * PAD, height: h + 2 * PAD, left: -PAD, top: -PAD }} />
    : <div className="nph" style={{ width: w, height: h, background: paper }} />;
});

// a note in a grid (staff panel): same image, scaled to `width`
export function NoteThumb({ card, width = 150 }) {
  const url = useNoteURL(card, false);
  return url ? <img className="thumb" src={url} alt="" draggable={false} style={{ width }} /> : <div className="thumb ph" style={{ width, height: width }} />;
}

export function CardView({ card, t }) {
  const url = useNoteURL(card, true);
  const [replay, setReplay] = useState(false);
  const [rk, setRk] = useState(0);
  return (
    <div className="cardview">
      {replay && card.strokes ? <StrokePlayer key={rk} strokes={card.strokes} /> : (url ? <img className="bigimg" src={url} alt="" /> : <div className="bigph">…</div>)}
      {card.strokes && <button className="primary alt" onClick={() => { setRk((k) => k + 1); setReplay(true); }}>▶ {t.replay}</button>}
      {replay && <button className="ghost" onClick={() => setReplay(false)}>{t.closeReplay}</button>}
    </div>
  );
}

function Customize({ o, set, t }) {
  const [more, setMore] = useState(false);
  const tog = (st) => set({ stickers: o.stickers.includes(st) ? o.stickers.filter((x) => x !== st) : [...o.stickers, st].slice(-3) });
  const shuffle = () => {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    set({ color: Math.floor(Math.random() * PAPER.length), pin: pick(PINS), r: pick([-4, 0, 4]), stickers: Math.random() < 0.6 ? [pick(STICKERS)] : [] });
  };
  return (
    <div className="optpanel">
      <div className="optrow">
        <span className="optlab">{t.custColor}</span>
        {PAPER.map((c, i) => <button key={c} className={"sw" + (o.color === i ? " on" : "")} style={{ background: c }} onClick={() => set({ color: i })} aria-label={c} />)}
        <span className="optlab">{t.custShape}</span>
        {SHAPES.map((s) => <button key={s} className={"tl" + (o.shape === s ? " on" : "")} title={t["shape_" + s]} onClick={() => set({ shape: s })}>{SHAPE_ICON[s]}</button>)}
        <span className="optlab">{t.custSize}</span>
        {["s", "m", "l"].map((z) => <button key={z} className={"tl" + (o.size === z ? " on" : "")} onClick={() => set({ size: z })}>{z.toUpperCase()}</button>)}
        <button className="ghost mini" onClick={() => setMore(!more)}>{more ? "▲" : "▼"} {t.custMore}</button>
        <button className="ghost mini" onClick={shuffle} title={t.shuffle}>🎲</button>
      </div>
      {more && (
        <>
          <div className="optrow">
            <span className="optlab">{t.custPin}</span>
            {PINS.map((p) => (
              <button key={p} className={"tl pinb" + (o.pin === p ? " on" : "")} title={t["pin_" + p]} onClick={() => set({ pin: p })}>
                {p === "tape" ? "▬" : p === "none" ? "✕" : <span className="pdot" style={{ background: PIN_COL[p] }} />}
              </button>
            ))}
            <span className="optlab">{t.optTilt}</span>
            {[[-4, "↺"], [0, "▬"], [4, "↻"]].map(([r, ic]) => <button key={r} className={"tl" + (o.r === r ? " on" : "")} onClick={() => set({ r })}>{ic}</button>)}
            <span className="optlab">{t.custText}</span>
            {[[1, t.txt_auto], [0.8, t.txt_80], [0.6, t.txt_60]].map(([v, lab]) => <button key={v} className={"tl wide" + (o.textScale === v ? " on" : "")} onClick={() => set({ textScale: v })}>{lab}</button>)}
          </div>
          <div className="optrow">
            <span className="optlab">{t.optSticker}</span>
            {STICKERS.map((st) => <button key={st} className={"tl stk" + (o.stickers.includes(st) ? " on" : "")} onClick={() => tog(st)}>{st}</button>)}
            <span className="optlab">{t.custStickerSize}</span>
            {["s", "m", "l"].map((z) => <button key={z} className={"tl" + (o.stickerSize === z ? " on" : "")} onClick={() => set({ stickerSize: z })}>{z.toUpperCase()}</button>)}
          </div>
        </>
      )}
    </div>
  );
}

export default function Wall({ t, version, freshUid, pending, saving, moveAll, bgId, page, pageMax, onPage, onPages, onWrite, onBack, onConfirm, onMoved }) {
  const { cards, loaded } = useCards(version);
  const live = cards.filter((c) => !c.hidden && !c.deleted);
  const shown = live.filter((c) => (c.page || 1) === page);
  const ordered = shown.slice().sort((a, b) => (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0)); // most recently touched on top
  const rects = shown.map((c) => rectOf(c, bgId));
  const counts = {};
  live.forEach((c) => { const p = c.page || 1; counts[p] = (counts[p] || 0) + 1; });
  const pageList = Array.from({ length: Math.max(pageMax || 1, page, ...Object.keys(counts).map(Number)) }, (_, i) => i + 1);

  const [open, setOpen] = useState(null);
  const [bad, setBad] = useState(false);
  const [ready, setReady] = useState(false);
  const [vis, setVis] = useState(null);
  const [opt, setOpt] = useState(() => (pending ? {
    color: pending.meta.color || 0, shape: pending.meta.shape || "square", size: pending.meta.size || "m", pin: pending.meta.pin || "tape",
    stickers: [], stickerSize: "m", textScale: 1, r: pending.r,
  } : null));
  const o = opt || { color: 0, shape: "square", size: "m", pin: "tape", stickers: [], stickerSize: "m", textScale: 1, r: 0 };
  const setO = (patch) => setOpt({ ...o, ...patch });
  const gs = dims(o);

  const vp = useRef(null), bd = useRef(null), ghost = useRef(null);
  const view = useRef({ x: 0, y: 0, z: 0.8 });
  const gp = useRef({ x: 0, y: 0 });
  const ptrs = useRef(new Map());
  const drag = useRef(null);
  const inited = useRef(false);
  const live2 = useRef({});
  live2.current = { placing: !!pending };
  const dirty = useRef(true);
  const shownRef = useRef([]);
  shownRef.current = shown;

  const apply = () => {
    const w = vp.current.clientWidth, h = vp.current.clientHeight, v = view.current;
    const zmin = Math.max(w / BOARD_W, h / BOARD_H);
    v.z = Math.min(1.6, Math.max(zmin, v.z));
    v.x = Math.min(0, Math.max(w - BOARD_W * v.z, v.x));
    v.y = Math.min(0, Math.max(h - BOARD_H * v.z, v.y));
    bd.current.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
    dirty.current = true;
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
  // only render notes near the viewport
  const calcVis = () => {
    if (!vp.current) return;
    const v = view.current, w = vp.current.clientWidth, h = vp.current.clientHeight, m = 500;
    const x0 = -v.x / v.z - m, y0 = -v.y / v.z - m, x1 = (w - v.x) / v.z + m, y1 = (h - v.y) / v.z + m;
    const set = new Set();
    for (const c of shownRef.current) {
      const r = rectOf(c, bgId);
      if (r.x + r.w > x0 && r.x < x1 && r.y + r.h > y0 && r.y < y1) set.add(keyOf(c));
    }
    setVis((old) => (old && old.size === set.size && [...set].every((k) => old.has(k)) ? old : set));
  };
  const zone = (BGS[bgId] || BGS.plain).zone;
  const recenter = () => {
    const c0 = shown[0];
    if (c0) { const r = rectOf(c0, bgId); centerOn(r.x + r.w / 2, r.y + r.h / 2); } else centerOn(zone.cx, zone.cy);
  };
  const putGhost = () => {
    if (!ghost.current) return;
    ghost.current.style.left = gp.current.x + "px";
    ghost.current.style.top = gp.current.y + "px";
    setBad(overlapCount({ x: gp.current.x, y: gp.current.y, w: gs.w, h: gs.h }, rects) > 0);
  };

  useLayoutEffect(() => { apply(); const r = () => apply(); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, []);
  useEffect(() => { dirty.current = true; }, [cards, page, bgId]);
  useEffect(() => {
    const id = setInterval(() => { if (dirty.current) { dirty.current = false; calcVis(); } }, 150);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { onPages && onPages(counts); }, [cards]);
  useEffect(() => {
    const el = vp.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // first load of this page: look at its newest note; when placing, drop the ghost in the nearest empty spot
  useEffect(() => {
    if (!loaded) return;
    recenter();
    if (pending && !inited.current) {
      inited.current = true;
      const p0 = shown[0] ? rectOf(shown[0], bgId) : { x: zone.cx - gs.w / 2, y: zone.cy - gs.h / 2 };
      gp.current = findFree(rects, p0, gs, bgId);
      centerOn(gp.current.x + gs.w / 2, gp.current.y + gs.h / 2);
      setBad(false); setReady(true);
    }
    calcVis();
  }, [loaded, page]);

  // keep the ghost on the cork when its shape or size changes
  useEffect(() => {
    if (!ready || !pending) return;
    gp.current = clampP(gp.current, gs, bgId);
    putGhost();
  }, [o.shape, o.size]);

  // after posting, jump to the new note
  useEffect(() => {
    if (!freshUid || !loaded) return;
    const c = cards.find((x) => keyOf(x) === freshUid);
    if (c) { const r = rectOf(c, bgId); centerOn(r.x + r.w / 2, r.y + r.h / 2); }
  }, [freshUid, loaded, cards]);

  const dist = () => { const [a, b] = [...ptrs.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const onDown = (e) => {
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
    if (!onGhost && noteEl && moveAll && !live2.current.placing) {
      // press & hold a note to pick it up, then drag it
      d.timer = setTimeout(() => {
        if (drag.current !== d || d.moved > 8) return;
        const c = shownRef.current.find((x) => keyOf(x) === d.key);
        if (!c) return;
        const r = vp.current.getBoundingClientRect(), v = view.current, rc = rectOf(c, bgId);
        d.mode = "carry"; d.card = c; d.el = noteEl; d.pos = { x: rc.x, y: rc.y }; d.size = { w: rc.w, h: rc.h };
        d.off = { x: (d.lx - r.left - v.x) / v.z - rc.x, y: (d.ly - r.top - v.y) / v.z - rc.y };
        noteEl.classList.add("lifted");
        noteEl.style.zIndex = 99998;
      }, 400);
    }
    drag.current = d;
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d || !ptrs.current.has(e.pointerId)) return;
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
    if (d.mode === "pan") {
      if (d.timer) { if (d.moved <= 8) return; clearTimeout(d.timer); d.timer = null; }
      v.x += dx; v.y += dy; apply(); return;
    }
    // carrying a note, or dragging the ghost: pan the board when it nears the edge
    if (e.clientX - r.left < 70) v.x += 14; else if (r.right - e.clientX < 70) v.x -= 14;
    if (e.clientY - r.top < 70) v.y += 14; else if (r.bottom - e.clientY < 70) v.y -= 14;
    apply();
    const raw = { x: (e.clientX - r.left - v.x) / v.z - d.off.x, y: (e.clientY - r.top - v.y) / v.z - d.off.y };
    if (d.mode === "carry") {
      d.pos = clampP(raw, d.size, bgId);
      d.el.style.left = d.pos.x + "px"; d.el.style.top = d.pos.y + "px";
      return;
    }
    gp.current = clampP(raw, gs, bgId);
    putGhost();
  };
  const onUp = (e) => {
    const d = drag.current;
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) drag.current = null;
    if (d && d.timer) { clearTimeout(d.timer); d.timer = null; }
    if (d && d.mode === "carry") {
      d.el.classList.remove("lifted");
      const c = d.card, p = d.pos;
      putCard({ ...c, pos: { x: Math.round(p.x), y: Math.round(p.y), r: c.pos && c.pos.r != null ? c.pos.r : (hash(keyOf(c)) % 5) - 2 }, updatedAt: Date.now() })
        .then(() => onMoved && onMoved());
    }
    if (d && d.mode === "pan" && d.moved < 6 && d.key) {
      const c = shown.find((x) => keyOf(x) === d.key);
      if (c) setOpen(c);
    }
  };
  const findSpot = () => {
    gp.current = findFree(rects, gp.current, gs, bgId);
    putGhost();
    centerOn(gp.current.x + gs.w / 2, gp.current.y + gs.h / 2);
  };
  const zoomBtn = (f) => zoomAt(f, vp.current.clientWidth / 2, vp.current.clientHeight / 2);
  const fit = () => { Object.assign(view.current, { z: 0, x: 0, y: 0 }); apply(); };

  const ghostCard = pending ? {
    uid: pending.uid, thumbBlob: pending.thumbBlob,
    meta: { ...pending.meta, color: o.color, shape: o.shape, size: o.size, pin: o.pin, stickers: o.stickers, stickerSize: o.stickerSize, textScale: o.textScale },
    pos: { r: o.r },
  } : null;
  const longHint = pending && (pending.meta.text || "").length > 90 && o.size !== "l" && o.shape !== "wide";
  const bg = bgUrl(bgId);

  return (
    <div className="wallview">
      <div className="wallhead">
        <h2>{t.wallTitle}</h2>
        <div className="ptabs">
          {pageList.map((p) => (
            <button key={p} className={"ptab" + (p === page ? " on" : "")} disabled={!!pending} onClick={() => onPage(p)}>
              {t.pageWord} {p}<small>{counts[p] || 0}</small>
            </button>
          ))}
        </div>
        {moveAll && !pending && <span className="holdhint">{t.holdHint}</span>}
        <div className="wallcount"><b>{live.length}</b>{t.wallCount}</div>
      </div>
      <div className="wallvp" ref={vp} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="board" ref={bd} style={{ width: BOARD_W, height: BOARD_H, ...(bg ? { backgroundImage: `url(${bg})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" } : {}) }}>
          {ordered.map((c, i) => {
            const k = keyOf(c);
            if (!vis || (!vis.has(k) && k !== freshUid)) return null;
            const r = rectOf(c, bgId), rot = c.pos && c.pos.r != null ? c.pos.r : (hash(k) % 5) - 2;
            return (
              <div key={k} data-key={k} className={"bnote" + (k === freshUid ? " fresh" : "") + (c.meta && c.meta.shape === "round" ? " rnd" : "")}
                style={{ left: r.x, top: r.y, width: r.w, height: r.h, zIndex: i + 1, "--rot": `${rot}deg` }}>
                <NoteImg card={c} />
              </div>
            );
          })}
          {pending && ready && (
            <div ref={ghost} className={"bnote holding" + (bad ? " bad" : "") + (o.shape === "round" ? " rnd" : "")}
              style={{ left: gp.current.x, top: gp.current.y, width: gs.w, height: gs.h, zIndex: 99999, "--rot": `${o.r}deg` }}>
              <NoteImg card={ghostCard} />
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
          <div className={"placehint" + (bad ? " bad" : "")}>{bad ? t.hintBad : longHint ? t.hintLong : t.hintDrag}</div>
          <Customize o={o} set={setO} t={t} />
          <div className="placebtns">
            <button className="ghost" onClick={onBack}>← {t.backEdit}</button>
            <button className="primary alt" onClick={findSpot}>🔍 {t.findSpot}</button>
            <button className="primary big" disabled={!ready || saving}
              onClick={() => onConfirm({ x: gp.current.x, y: gp.current.y, r: o.r, meta: { color: o.color, shape: o.shape, size: o.size, pin: o.pin, stickers: o.stickers, stickerSize: o.stickerSize, textScale: o.textScale } })}>
              {saving ? t.saving : `📌 ${t.stick}`}
            </button>
          </div>
        </div>
      ) : (
        <button className="primary big fab" onClick={onWrite}>✏️ {t.writeBtn}</button>
      )}
      {open && (
        <div className="overlay" onClick={() => setOpen(null)}>
          <div className="card zoomnote" onClick={(e) => e.stopPropagation()}>
            <CardView card={open} t={t} />
          </div>
        </div>
      )}
    </div>
  );
}
