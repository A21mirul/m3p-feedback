import React, { useEffect, useRef, useState } from "react";
import { allCards } from "./storage.js";

const TINTS = ["#FFF4CC", "#DDF6F3", "#FFE1E1", "#E3ECFA", "#FFFFFF"];
const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
export const keyOf = (c) => c.uid || "L" + c.id;

export function useCards(version) {
  const [state, setState] = useState({ cards: [], urls: {} });
  useEffect(() => {
    let dead = false;
    const made = [];
    (async () => {
      const list = (await allCards()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const urls = {};
      list.forEach((c) => { if (c.drawingBlob) { urls[keyOf(c)] = URL.createObjectURL(c.drawingBlob); made.push(urls[keyOf(c)]); } });
      if (dead) { made.forEach((u) => URL.revokeObjectURL(u)); return; }
      setState({ cards: list, urls });
    })();
    return () => { dead = true; setTimeout(() => made.forEach((u) => URL.revokeObjectURL(u)), 3000); };
  }, [version]);
  return state;
}

export function Note({ card, url, t, fresh, onClick }) {
  const m = card.meta || {};
  const h = hash(keyOf(card));
  const reacts = (m.reactions || []).map((i) => t.react[i]).filter(Boolean);
  if ((m.other || "").trim()) reacts.push(m.other.trim());
  return (
    <figure className={"note" + (fresh ? " fresh" : "") + (card.hidden ? " hid" : "")} style={{ background: TINTS[h % TINTS.length], "--rot": `${(h % 5) - 2}deg` }} onClick={onClick}>
      <span className="pin" />
      {url && <img src={url} alt="" />}
      {m.text && <p>{m.text}</p>}
      {reacts.length > 0 && <div className="rchips">{reacts.map((r, i) => <span key={i}>{r}</span>)}</div>}
      <figcaption>— {m.nickname || t.anon}{m.visitor ? ` · ${m.visitor}` : ""}</figcaption>
    </figure>
  );
}

export default function Wall({ t, version, freshUid, onWrite }) {
  const { cards, urls } = useCards(version);
  const shown = cards.filter((c) => !c.hidden);
  const [open, setOpen] = useState(null);
  const box = useRef(null);
  const touched = useRef(Date.now());

  useEffect(() => { if (freshUid && box.current) box.current.scrollTop = 0; }, [freshUid, cards.length]);

  // slow auto-scroll when nobody is touching the wall
  useEffect(() => {
    const el = box.current;
    const bump = () => { touched.current = Date.now(); };
    const evs = ["pointerdown", "wheel", "touchstart"];
    evs.forEach((e) => el.addEventListener(e, bump, { passive: true }));
    let raf, acc = 0;
    const step = () => {
      if (!open && Date.now() - touched.current > 8000 && el.scrollHeight > el.clientHeight + 8) {
        acc += 0.6;
        if (acc >= 1) { el.scrollTop += Math.floor(acc); acc -= Math.floor(acc); }
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) { el.scrollTop = 0; touched.current = Date.now() - 6000; }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); evs.forEach((e) => el.removeEventListener(e, bump)); };
  }, [open]);

  return (
    <div className="wallview">
      <div className="wallhead">
        <h2>{t.wallTitle}</h2>
        <div className="wallcount"><b>{shown.length}</b>{t.wallCount}</div>
      </div>
      <div className="wallscroll" ref={box}>
        {!shown.length && <p className="wallempty">{t.wallEmpty}</p>}
        <div className="notes">
          {shown.map((c) => <Note key={keyOf(c)} card={c} url={urls[keyOf(c)]} t={t} fresh={keyOf(c) === freshUid} onClick={() => setOpen(c)} />)}
        </div>
      </div>
      <button className="primary big fab" onClick={onWrite}>✏️ {t.writeBtn}</button>
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
