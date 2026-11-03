import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, exportToCanvas } from "@excalidraw/excalidraw";
import { STR } from "./i18n.js";
import { canvasToBlob } from "./composer.js";
import Wall from "./Wall.jsx";
import { bgIdFromSettings } from "./board.js";
import { PAGE_CAP } from "./shapes.js";
import { packStrokes } from "./strokes.js";
import { addCard, lsGet, lsSet } from "./storage.js";
import StaffPanel from "./StaffPanel.jsx";
import CardPreview from "./CardPreview.jsx";
import { eraseAt, beginErase, commitErase } from "./eraser.js";
import { pad3, todayStr } from "./util.js";

const PALETTE = ["#14284B", "#2F5FA8", "#2EC4B6", "#FFC857", "#FF6B6B", "#2F9E44", "#7048E8", "#F76707", "#E64980", "#000000"];
const SIZES = [1.5, 3, 5, 8, 14];
const ERASER_PX = [7, 12, 18, 28, 42]; // eraser radius on screen, follows the brush-size buttons
const ALLOWED_TOOLS = ["freedraw", "eraser", "hand", "selection"];
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const DEFAULT_SETTINGS = { defLang: "en", idleSec: 60, handle: "", laptop: "A", pageMax: 1, pageBg: {} };
const EMPTY_FORM = { text: "", nickname: "", tags: [] }; // tags: [{ k: phrase index, x, y, r }] dragged onto the note
const TAG_SLOTS = [[0.5, 0.6], [0.5, 0.76], [0.5, 0.44]];
const newColor = () => Math.floor(Math.random() * 6);

export default function App() {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...lsGet("m3p-settings", {}) }));
  const draft = useMemo(() => lsGet("m3p-draft", null), []);
  const [lang, setLang] = useState(draft?.lang || settings.defLang);
  const [screen, setScreen] = useState(draft ? "main" : "wall"); // wall | main
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, ...(draft?.form || {}), tags: draft?.form?.tags || [] }));
  const [baseColor, setBaseColor] = useState(newColor);
  const [previewBmp, setPreviewBmp] = useState(null);
  const [inkTick, setInkTick] = useState(0);
  const [eraserOn, setEraserOn] = useState(false);
  const eraserRef = useRef(false);
  const wrapRef = useRef(null);
  const ringRef = useRef(null);
  const sizeRef = useRef(2);
  const inkTimer = useRef(null);
  const [api, setApi] = useState(null);
  const [tool, setTool] = useState("freedraw");
  const [color, setColor] = useState(PALETTE[0]);
  const [size, setSize] = useState(2);
  const [zoom, setZoom] = useState(1);
  const [hasInk, setHasInk] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [idleLeft, setIdleLeft] = useState(null);
  const [backupDue, setBackupDue] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [wallVersion, setWallVersion] = useState(0);
  const [freshUid, setFreshUid] = useState(null);
  const [toast, setToast] = useState(false);
  const [pending, setPending] = useState(null);
  const [page, setPageState] = useState(() => lsGet("m3p-page", 1));
  const [pageCounts, setPageCounts] = useState({});
  const setPage = (p) => { setPageState(p); lsSet("m3p-page", p); };
  const lastActive = useRef(Date.now());
  const previewRef = useRef(null);
  const previewData = useRef(null);
  const t = STR[lang];

  const updateSettings = (patch) => {
    setSettings((s) => {
      const n = { ...s, ...patch };
      lsSet("m3p-settings", n);
      return n;
    });
  };
  const setF = (patch) => setForm((f) => ({ ...f, ...patch }));

  // ---------- Excalidraw helpers ----------
  const initialData = useMemo(
    () => ({
      elements: draft?.elements || [],
      appState: { viewBackgroundColor: "#ffffff", currentItemStrokeColor: PALETTE[0], currentItemStrokeWidth: SIZES[2], activeTool: { type: "freedraw" } },
      scrollToContent: !!draft?.elements?.length,
    }),
    [draft]
  );

  const applyStyle = useCallback((patch) => api && api.updateScene({ appState: patch }), [api]);
  const chooseTool = (type) => {
    // our own eraser rubs out part of a stroke; Excalidraw is parked on the hand tool underneath it
    eraserRef.current = type === "eraser"; setEraserOn(type === "eraser");
    api?.setActiveTool({ type: type === "eraser" ? "hand" : type }); setTool(type);
  };
  const chooseColor = (c) => { setColor(c); applyStyle({ currentItemStrokeColor: c }); if (tool === "eraser") chooseTool("freedraw"); };
  const chooseSize = (i) => { setSize(i); sizeRef.current = i; applyStyle({ currentItemStrokeWidth: SIZES[i] }); };

  const fireKey = (key, code, shift = false) => {
    const ev = new KeyboardEvent("keydown", { key, code, shiftKey: shift, ctrlKey: !IS_MAC, metaKey: IS_MAC, bubbles: true });
    document.dispatchEvent(ev);
  };
  const undo = () => fireKey("z", "KeyZ");
  const redo = () => fireKey("z", "KeyZ", true);

  const setZoomValue = useCallback((next) => {
    if (!api) return;
    const s = api.getAppState();
    const z = s.zoom.value;
    const nz = Math.min(4, Math.max(0.25, next));
    const cx = s.width / 2, cy = s.height / 2;
    api.updateScene({
      appState: {
        zoom: { value: nz },
        scrollX: s.scrollX + cx / nz - cx / z,
        scrollY: s.scrollY + cy / nz - cy / z,
      },
    });
  }, [api]);
  const zoomBy = useCallback((f) => api && setZoomValue(api.getAppState().zoom.value * f), [api, setZoomValue]);
  const fit = useCallback(() => {
    if (!api) return;
    const els = api.getSceneElements().filter((e) => !e.isDeleted);
    if (els.length) api.scrollToContent(els, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true });
    else api.updateScene({ appState: { zoom: { value: 1 }, scrollX: 0, scrollY: 0 } });
  }, [api]);

  const clearDrawing = () => {
    api?.resetScene();
    api?.history.clear();
    setHasInk(false);
    setConfirmClear(false);
  };

  const fullReset = useCallback((toLang) => {
    api?.resetScene();
    api?.history.clear();
    setForm(EMPTY_FORM);
    setBaseColor(newColor());
    setPreviewBmp(null);
    setHasInk(false);
    setZoom(1);
    setLang(toLang || settings.defLang);
    setScreen("wall");
    setIdleLeft(null);
    setConfirmClear(false);
    lsSet("m3p-draft", null);
    lastActive.current = Date.now();
    setResetKey((k) => k + 1);
  }, [api, settings.defLang]);

  const dirty = hasInk || form.text.trim() || form.nickname.trim() || form.tags.length;

  const nextVisitor = useCallback(() => {
    if (screen === "main" && dirty && !window.confirm(`${t.next}?`)) return;
    fullReset();
  }, [screen, dirty, t.next, fullReset]);

  // ---------- Excalidraw change handler ----------
  const onChange = useCallback((elements, appState) => {
    const live = elements.filter((e) => !e.isDeleted);
    setHasInk(live.length > 0);
    setZoom(appState.zoom.value);
    const type = appState.activeTool.type;
    if (type === "eraser") { // Excalidraw's own eraser (E key) -> use ours instead
      eraserRef.current = true; setEraserOn(true); api?.setActiveTool({ type: "hand" }); setTool("eraser");
    } else if (!ALLOWED_TOOLS.includes(type)) {
      eraserRef.current = false; setEraserOn(false);
      api?.setActiveTool({ type: "freedraw" });
      setTool("freedraw");
    } else if (eraserRef.current && type === "hand") setTool("eraser");
    else { eraserRef.current = false; setEraserOn(false); setTool(type); }
    lastActive.current = Date.now();
    clearTimeout(inkTimer.current);
    inkTimer.current = setTimeout(() => setInkTick((n) => n + 1), 450);
  }, [api]);

  // ---------- Partial eraser (captures pointer events before Excalidraw sees them) ----------
  useEffect(() => {
    const el = wrapRef.current;
    if (!api || !el) return;
    let erasing = false, last = null, before = null;
    const px = () => ERASER_PX[sizeRef.current];
    const at = (e) => {
      const st = api.getAppState(), z = st.zoom.value, b = el.getBoundingClientRect(); // the wrapper is exactly the Excalidraw area
      return { x: (e.clientX - b.left) / z - st.scrollX, y: (e.clientY - b.top) / z - st.scrollY, z };
    };
    const stroke = (e) => {
      const cur = at(e), r = px() / cur.z;
      const from = last || cur;
      const n = Math.max(1, Math.ceil(Math.hypot(cur.x - from.x, cur.y - from.y) / (r / 2)));
      for (let i = 1; i <= n; i++) eraseAt(api, from.x + ((cur.x - from.x) * i) / n, from.y + ((cur.y - from.y) * i) / n, r);
      last = cur;
    };
    const ring = (e) => {
      const g = ringRef.current;
      if (!g) return;
      const b = el.getBoundingClientRect(), d = px() * 2;
      g.style.display = eraserRef.current ? "block" : "none";
      g.style.width = g.style.height = d + "px";
      g.style.left = e.clientX - b.left - d / 2 + "px"; g.style.top = e.clientY - b.top - d / 2 + "px";
    };
    const down = (e) => {
      if (!eraserRef.current || e.button > 0) return;
      e.stopPropagation(); e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      erasing = true; last = null; before = beginErase(api); stroke(e); ring(e);
    };
    const move = (e) => {
      ring(e);
      if (!erasing) return;
      e.stopPropagation(); stroke(e);
    };
    const up = (e) => {
      if (!erasing) return;
      erasing = false; last = null; e.stopPropagation();
      commitErase(api, before); before = null;
    };
    const leave = () => { if (ringRef.current) ringRef.current.style.display = "none"; };
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move, true);
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up, true);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointerdown", down, true); el.removeEventListener("pointermove", move, true);
      el.removeEventListener("pointerup", up, true); el.removeEventListener("pointercancel", up, true); el.removeEventListener("pointerleave", leave);
    };
  }, [api]);

  // ---------- Draft autosave ----------
  useEffect(() => {
    if (!api || screen !== "main") return;
    const id = setTimeout(() => {
      const elements = api.getSceneElements().filter((e) => !e.isDeleted);
      lsSet("m3p-draft", { lang, form, elements });
    }, 800);
    return () => clearTimeout(id);
  }, [api, form, lang, hasInk, screen, zoom]);

  // ---------- Idle reset ----------
  useEffect(() => {
    const bump = () => { lastActive.current = Date.now(); setIdleLeft(null); };
    const evs = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, bump));
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      if (staffOpen) return;
      const idle = (Date.now() - lastActive.current) / 1000;
      if (screen === "place") { if (idle >= settings.idleSec) { setPending(null); setScreen("main"); } return; }
      if (screen !== "main") return;
      if (idle >= settings.idleSec) {
        if (!dirty) return fullReset();
        const left = 10 - Math.floor(idle - settings.idleSec);
        if (left <= 0) fullReset();
        else setIdleLeft(left);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [screen, staffOpen, settings.idleSec, dirty, fullReset]);

  // ---------- Hourly backup reminder ----------
  useEffect(() => {
    const id = setInterval(() => setBackupDue(true), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ---------- Global keys ----------
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); setStaffOpen((v) => !v); return; }
      if (e.key === "Escape") { setStaffOpen(false); setHelpOpen(false); return; }
      if (screen !== "main") return;
      if (tag === "input" || tag === "textarea" || tag === "select" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.isTrusted === false) return;
      if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(1.2); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomBy(1 / 1.2); }
      else if (e.key === "?") setHelpOpen((v) => !v);
      else if (e.key.toLowerCase() === "n" && screen === "main") nextVisitor();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoomBy, nextVisitor, screen]);

  // ---------- Card building ----------
  const exportDrawing = async () => {
    if (!api) return null;
    const els = api.getSceneElements().filter((e) => !e.isDeleted);
    if (!els.length) return null;
    return exportToCanvas({
      elements: els,
      appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
      files: api.getFiles(),
      exportPadding: 24,
      getDimensions: (w, h) => {
        const scale = Math.max(1, Math.min(3, 2400 / Math.max(w, h)));
        return { width: w * scale, height: h * scale, scale };
      },
    });
  };

  const shrink = (cv, max = 1400) => {
    const r = Math.min(1, max / Math.max(cv.width, cv.height));
    if (r === 1) return cv;
    const o = document.createElement("canvas");
    o.width = Math.round(cv.width * r); o.height = Math.round(cv.height * r);
    o.getContext("2d").drawImage(cv, 0, 0, o.width, o.height);
    return o;
  };

  // live preview: re-export the drawing (small) a moment after the visitor stops drawing
  useEffect(() => {
    if (!api || screen !== "main") return;
    let dead = false;
    (async () => {
      const cvs = await exportDrawing().catch(() => null);
      if (dead) return;
      if (!cvs) { setPreviewBmp(null); return; }
      const sm = shrink(cvs, 600);
      sm.__v = inkTick;
      setPreviewBmp(sm);
    })();
    return () => { dead = true; };
  }, [api, screen, inkTick]);

  const phrases = t.tagPhrases;
  const resolvedTags = form.tags.map((g) => ({ ...g, t: phrases[g.k] }));
  const previewNumber = lsGet("m3p-counter", 0) + 1;
  const previewMeta = { text: form.text, nickname: (form.nickname.trim() || `Guest ${pad3(previewNumber)}`).slice(0, 16), tags: resolvedTags, color: baseColor, pin: "tape", shape: "square", size: form.text.length > 100 ? "l" : "m", stickers: [], stickerSize: "m", textScale: 1 };

  const goPlace = async () => {
    setSaving(true);
    try {
      const strokes = api ? packStrokes(api.getSceneElements()) : null;
      const drawing = await exportDrawing();
      const drawingBlob = drawing ? await canvasToBlob(shrink(drawing)) : null;
      const thumbBlob = drawing ? await canvasToBlob(shrink(drawing, 400), "image/jpeg", 0.85) : null;
      const laptop = settings.laptop || "A";
      const number = lsGet("m3p-counter", 0) + 1;
      const uid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const nickname = form.nickname.trim() || `Guest ${pad3(number)}`;
      const meta = { lang, text: form.text, nickname: nickname.slice(0, 16), reactions: [], other: "", tags: resolvedTags.map(({ t: tx, x, y, r }) => ({ t: tx, x, y, r })), number, dateStr: todayStr(), color: baseColor, stickers: [], stickerSize: "m", pin: "tape", shape: "square", size: form.text.length > 100 ? "l" : "m", textScale: 1 };
      // post to the page being viewed; if it is full, to the first page with room (or a new one)
      let target = page;
      if ((pageCounts[target] || 0) >= PAGE_CAP) {
        const known = Object.keys(pageCounts).map(Number).sort((x, y) => x - y);
        target = known.find((pg) => (pageCounts[pg] || 0) < PAGE_CAP) || Math.max(settings.pageMax || 1, ...known, target) + 1;
      }
      setPending({ uid, laptop, number, meta, page: target, drawingBlob, thumbBlob, strokes, url: thumbBlob ? URL.createObjectURL(thumbBlob) : null, r: [-4, 0, 4][Math.floor(Math.random() * 3)] });
      setScreen("place");
    } catch (err) {
      alert("Preview failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const backEdit = () => { setPending(null); setScreen("main"); };

  const confirmPlace = async (pos) => {
    if (!pending) return;
    setSaving(true);
    try {
      const now = Date.now();
      await addCard({ uid: pending.uid, laptop: pending.laptop, createdAt: now, updatedAt: now, hidden: false, deleted: false, page: pending.page, drawingBlob: pending.drawingBlob, thumbBlob: pending.thumbBlob, strokes: pending.strokes, pos: { x: Math.round(pos.x), y: Math.round(pos.y), r: pos.r != null ? pos.r : pending.r }, meta: { ...pending.meta, ...(pos.meta || {}) } });
      setPage(pending.page);
      if ((settings.pageMax || 1) < pending.page) updateSettings({ pageMax: pending.page });
      lsSet("m3p-counter", pending.number);
      const uid = pending.uid;
      setPending(null);
      fullReset();
      setFreshUid(uid);
      setWallVersion((n) => n + 1);
      setToast(true);
      setTimeout(() => setToast(false), 4500);
      setTimeout(() => setFreshUid((u) => (u === uid ? null : u)), 8000);
    } catch (err) {
      alert("Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = (k) => {
    if (form.tags.some((g) => g.k === k)) return setF({ tags: form.tags.filter((g) => g.k !== k) });
    if (form.tags.length >= 3) return;
    const free = TAG_SLOTS.find(([sx, sy]) => form.tags.every((g) => Math.hypot(g.x - sx, g.y - sy) > 0.13)) || TAG_SLOTS[0];
    setF({ tags: [...form.tags, { k, x: free[0], y: free[1], r: [-3, 2, -2][form.tags.length] }] });
  };
  const canPost = hasInk || form.text.trim().length > 0 || form.tags.length > 0;
  const ZOOMPCT = Math.round(zoom * 100);

  return (
    <div className="app" data-lang={lang}>
      <header className="topbar">
        <div className="brand">
          <span className="dna" aria-hidden>🧬</span>
          <div>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
        </div>
        <div className="top-actions">
          <div className="langtoggle" role="group" aria-label={t.lang}>
            <button className={lang === "ms" ? "on" : ""} onClick={() => setLang("ms")}>BM</button>
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
          </div>
          <button className="ghost" onClick={() => setHelpOpen(true)} title={t.help}>?</button>
          {screen === "main" && <button className="primary" onClick={nextVisitor}>← {t.toWall}</button>}
        </div>
      </header>

      <div className="stage">
      <main className="main">
        <section className="drawcol">
          <div className="toolbar">
            <div className="grp">
              <button className={tool === "freedraw" ? "tool on" : "tool"} onClick={() => chooseTool("freedraw")} title={`${t.pen} (P)`}>✏️ {t.pen}</button>
              <button className={tool === "eraser" ? "tool on" : "tool"} onClick={() => chooseTool("eraser")} title={`${t.eraser} (E)`}>🧽 {t.eraser}</button>
              <button className={tool === "hand" ? "tool on" : "tool"} onClick={() => chooseTool("hand")} title={`${t.hand} (H)`}>✋ {t.hand}</button>
            </div>
            <div className="grp colours" aria-label={t.colour}>
              {PALETTE.map((c) => (
                <button key={c} className={"swatch" + (color === c && tool !== "eraser" ? " on" : "")} style={{ background: c }} onClick={() => chooseColor(c)} aria-label={c} />
              ))}
            </div>
            <div className="grp" aria-label={t.size}>
              {SIZES.map((s, i) => (
                <button key={s} className={"size" + (size === i ? " on" : "")} onClick={() => chooseSize(i)} title={t.size}>
                  <span style={{ width: Math.round(4 + s * 1.5), height: Math.round(4 + s * 1.5) }} />
                </button>
              ))}
            </div>
            <div className="grp">
              <button className="tool" onClick={undo} title={`${t.undo} (Ctrl+Z)`}>↶</button>
              <button className="tool" onClick={redo} title={`${t.redo} (Ctrl+Y)`}>↷</button>
              {confirmClear ? (
                <>
                  <button className="tool danger" onClick={clearDrawing}>{t.clearConfirm} ✓</button>
                  <button className="tool" onClick={() => setConfirmClear(false)}>✕</button>
                </>
              ) : (
                <button className="tool" onClick={() => hasInk && setConfirmClear(true)} title={t.clear}>🗑️</button>
              )}
            </div>
            <div className="grp zoom">
              <button className="tool" onClick={() => zoomBy(1 / 1.2)} title={`${t.zoomOut} (−)`}>−</button>
              <button className="tool pct" onClick={fit} title={`${t.fit} (Shift+1)`}>{ZOOMPCT}%</button>
              <button className="tool" onClick={() => zoomBy(1.2)} title={`${t.zoomIn} (+)`}>+</button>
            </div>
          </div>
          <div className={"canvaswrap" + (eraserOn ? " erasing" : "")} ref={wrapRef}>
            <div className="eraserring" ref={ringRef} />
            <Excalidraw
              excalidrawAPI={setApi}
              initialData={initialData}
              onChange={onChange}
              langCode="en"
              handleKeyboardGlobally
              UIOptions={{ tools: { image: false }, canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: false, clearCanvas: false, changeViewBackgroundColor: false, saveAsImage: false } }}
            />
          </div>
        </section>

        <aside className="formcol">
          <h2>{t.write}</h2>
          <div className="previewbox">
            <span className="previewlab">{t.previewTitle}</span>
            <CardPreview meta={previewMeta} bmp={previewBmp} tags={resolvedTags} onTags={(next) => setF({ tags: next.map(({ k, x, y, r }) => ({ k, x, y, r })) })} removeLabel={t.removeTag} />
          </div>
          <label>
            <span>{t.feedbackLabel}</span>
            <textarea
              rows={4}
              maxLength={150}
              value={form.text}
              placeholder={t.feedbackPh}
              onChange={(e) => setF({ text: e.target.value })}
            />
            <small className="counter">{form.text.length}/150</small>
          </label>

          <div className="field">
            <span>{t.tagsTitle}</span>
            <div className="chips">
              {phrases.map((r, i) => {
                const on = form.tags.some((g) => g.k === i);
                return <button key={i} className={"chip" + (on ? " on" : "")} disabled={!on && form.tags.length >= 3} onClick={() => toggleTag(i)}>{r}</button>;
              })}
            </div>
            <small className="hint">{t.tagsHint}</small>
          </div>

          <div className="row2">
            <label>
              <span>{t.nickname}</span>
              <input type="text" maxLength={16} value={form.nickname} placeholder={t.nicknamePh} onChange={(e) => setF({ nickname: e.target.value })} />
            </label>
          </div>

          <p className="notice">{t.privacy}</p>
          <button className="primary big" disabled={!canPost || saving} onClick={goPlace}>{saving ? t.saving : `${t.placeBtn} ➜`}</button>
        </aside>
      </main>
      {(screen === "wall" || screen === "place") && <Wall t={t} version={wallVersion} freshUid={freshUid} pending={screen === "place" ? pending : null} saving={saving} onWrite={() => { lastActive.current = Date.now(); setScreen("main"); }} onBack={backEdit} onConfirm={confirmPlace} moveAll={settings.moveAll !== false} bgId={bgIdFromSettings(settings, screen === "place" && pending ? pending.page : page)} page={screen === "place" && pending ? pending.page : page} pageMax={settings.pageMax || 1} onPage={setPage} onPages={setPageCounts} onMoved={() => setWallVersion((n) => n + 1)} />}
      </div>

      {backupDue && (
        <div className="backup" onClick={() => { setBackupDue(false); setStaffOpen(true); }}>
          💾 Backup due — Ctrl+Shift+S
        </div>
      )}

      {toast && <div className="toast">✅ {t.posted}</div>}

      {idleLeft !== null && screen === "main" && (
        <div className="overlay idle" onClick={() => { lastActive.current = Date.now(); setIdleLeft(null); }}>
          <div className="card">
            <h2>{t.idleWarn} {idleLeft}{t.sec}</h2>
            <button className="primary big">{t.idleKeep}</button>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="overlay" onClick={() => setHelpOpen(false)}>
          <div className="card help" onClick={(e) => e.stopPropagation()}>
            <h2>{t.shortcuts}</h2>
            <table>
              <tbody>{t.keys.map(([k, d]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{d}</td></tr>)}</tbody>
            </table>
            <button className="primary" onClick={() => setHelpOpen(false)}>{t.close}</button>
          </div>
        </div>
      )}

      {staffOpen && (
        <StaffPanel
          t={t}
          settings={settings}
          updateSettings={updateSettings}
          onChanged={() => setWallVersion((n) => n + 1)}
          onClose={() => { setStaffOpen(false); setBackupDue(false); }}
        />
      )}
    </div>
  );
}
