import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, exportToCanvas } from "@excalidraw/excalidraw";
import { STR } from "./i18n.js";
import { canvasToBlob } from "./composer.js";
import Wall from "./Wall.jsx";
import { packStrokes } from "./strokes.js";
import { addCard, lsGet, lsSet } from "./storage.js";
import StaffPanel from "./StaffPanel.jsx";
import { pad3, todayStr } from "./util.js";

const PALETTE = ["#14284B", "#2F5FA8", "#2EC4B6", "#FFC857", "#FF6B6B", "#2F9E44", "#7048E8", "#F76707", "#E64980", "#000000"];
const SIZES = [1.5, 3, 5, 8, 14];
const ALLOWED_TOOLS = ["freedraw", "eraser", "hand", "selection"];
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const DEFAULT_SETTINGS = { defLang: "ms", idleSec: 60, handle: "", fmt: "png", size: "ig-portrait", scale: 1, laptop: "A" };
const EMPTY_FORM = { text: "", nickname: "", visitor: "", reactions: [], other: "" };

export default function App() {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...lsGet("m3p-settings", {}) }));
  const draft = useMemo(() => lsGet("m3p-draft", null), []);
  const [lang, setLang] = useState(draft?.lang || settings.defLang);
  const [screen, setScreen] = useState(draft ? "main" : "wall"); // wall | main
  const [form, setForm] = useState(draft?.form || EMPTY_FORM);
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
  const chooseTool = (type) => { api?.setActiveTool({ type }); setTool(type); };
  const chooseColor = (c) => { setColor(c); applyStyle({ currentItemStrokeColor: c }); if (tool === "eraser") chooseTool("freedraw"); };
  const chooseSize = (i) => { setSize(i); applyStyle({ currentItemStrokeWidth: SIZES[i] }); };

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

  const dirty = hasInk || form.text.trim() || form.nickname.trim() || form.reactions.length || form.other.trim();

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
    if (!ALLOWED_TOOLS.includes(type)) {
      api?.setActiveTool({ type: "freedraw" });
      setTool("freedraw");
    } else setTool(type);
    lastActive.current = Date.now();
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
      const nickname = form.nickname.trim() || `Operator ${laptop}-${pad3(number)}`;
      const meta = { lang, text: form.text, nickname, visitor: form.visitor, reactions: form.reactions, other: form.other, number, dateStr: todayStr(), color: Math.floor(Math.random() * 6), stickers: [] };
      setPending({ uid, laptop, number, meta, drawingBlob, thumbBlob, strokes, url: thumbBlob ? URL.createObjectURL(thumbBlob) : null, r: [-4, 0, 4][Math.floor(Math.random() * 3)] });
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
      await addCard({ uid: pending.uid, laptop: pending.laptop, createdAt: now, updatedAt: now, hidden: false, deleted: false, drawingBlob: pending.drawingBlob, thumbBlob: pending.thumbBlob, strokes: pending.strokes, pos: { x: Math.round(pos.x), y: Math.round(pos.y), r: pos.r != null ? pos.r : pending.r }, meta: { ...pending.meta, color: pos.color != null ? pos.color : pending.meta.color, stickers: pos.stickers || [] } });
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

  const toggleReaction = (i) =>
    setF({ reactions: form.reactions.includes(i) ? form.reactions.filter((x) => x !== i) : [...form.reactions, i] });

  const canPost = hasInk || form.text.trim().length > 0 || form.reactions.length > 0 || form.other.trim().length > 0;
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
          <div className="canvaswrap">
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
            <span>{t.reactions}</span>
            <div className="chips">
              {t.react.map((r, i) => (
                <button key={i} className={"chip" + (form.reactions.includes(i) ? " on" : "")} onClick={() => toggleReaction(i)}>{r}</button>
              ))}
            </div>
            <input
              type="text"
              maxLength={24}
              value={form.other}
              placeholder={`${t.other}: ${t.otherPh}`}
              onChange={(e) => setF({ other: e.target.value })}
            />
          </div>

          <div className="row2">
            <label>
              <span>{t.nickname}</span>
              <input type="text" maxLength={24} value={form.nickname} placeholder={t.nicknamePh} onChange={(e) => setF({ nickname: e.target.value })} />
            </label>
            <label>
              <span>{t.visitor}</span>
              <select value={form.visitor} onChange={(e) => setF({ visitor: e.target.value })}>
                <option value="">—</option>
                {t.visitorOpts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </div>

          <p className="notice">{t.privacy}</p>
          <button className="primary big" disabled={!canPost || saving} onClick={goPlace}>{saving ? t.saving : `${t.placeBtn} ➜`}</button>
        </aside>
      </main>
      {(screen === "wall" || screen === "place") && <Wall t={t} version={wallVersion} freshUid={freshUid} pending={screen === "place" ? pending : null} saving={saving} onWrite={() => { lastActive.current = Date.now(); setScreen("main"); }} onBack={backEdit} onConfirm={confirmPlace} moveAll={settings.moveAll !== false} template={settings.template !== false} onMoved={() => setWallVersion((n) => n + 1)} />}
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
