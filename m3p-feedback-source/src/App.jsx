import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, exportToCanvas } from "@excalidraw/excalidraw";
import { STR, THEME, EXPORT_SIZES } from "./i18n.js";
import { composeCard, composeSized, canvasToBlob } from "./composer.js";
import { addCard, allCards, deleteCard, clearCards, lsGet, lsSet } from "./storage.js";
import StaffPanel from "./StaffPanel.jsx";
import { download, pad3, todayStr } from "./util.js";

const PALETTE = ["#14284B", "#2F5FA8", "#2EC4B6", "#FFC857", "#FF6B6B", "#2F9E44", "#7048E8", "#F76707", "#E64980", "#000000"];
const SIZES = [2, 4, 8];
const ALLOWED_TOOLS = ["freedraw", "eraser", "hand", "selection"];
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const DEFAULT_SETTINGS = { defLang: "ms", idleSec: 60, handle: "", fmt: "png", size: "ig-portrait", scale: 1 };
const EMPTY_FORM = { text: "", nickname: "", visitor: "", reactions: [], other: "", consent: false };

export default function App() {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...lsGet("m3p-settings", {}) }));
  const draft = useMemo(() => lsGet("m3p-draft", null), []);
  const [lang, setLang] = useState(draft?.lang || settings.defLang);
  const [screen, setScreen] = useState(draft ? "main" : "welcome"); // welcome | main | preview | thanks
  const [form, setForm] = useState(draft?.form || EMPTY_FORM);
  const [api, setApi] = useState(null);
  const [tool, setTool] = useState("freedraw");
  const [color, setColor] = useState(PALETTE[0]);
  const [size, setSize] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [hasInk, setHasInk] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [idleLeft, setIdleLeft] = useState(null);
  const [backupDue, setBackupDue] = useState(false);
  const [resetKey, setResetKey] = useState(0);
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
      appState: { viewBackgroundColor: "#ffffff", currentItemStrokeColor: PALETTE[0], currentItemStrokeWidth: SIZES[1], activeTool: { type: "freedraw" } },
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
    setScreen("welcome");
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
    if (!api || screen === "welcome" || screen === "thanks") return;
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
      if (screen === "welcome" || screen === "thanks" || staffOpen) return;
      const idle = (Date.now() - lastActive.current) / 1000;
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

  const goPreview = async () => {
    const drawing = await exportDrawing();
    const number = lsGet("m3p-counter", 0) + 1;
    previewData.current = {
      lang, text: form.text, nickname: form.nickname, visitor: form.visitor,
      reactions: form.reactions, other: form.other, consent: form.consent,
      number, dateStr: todayStr(), handle: settings.handle, drawing,
    };
    setScreen("preview");
  };

  useEffect(() => {
    if (screen !== "preview" || !previewRef.current || !previewData.current) return;
    const c = composeCard({ ...previewData.current, lang }, 1);
    c.style.width = "100%"; c.style.height = "auto"; c.style.display = "block";
    previewRef.current.replaceChildren(c);
  }, [screen, lang]);

  const save = async () => {
    setSaving(true);
    try {
      const d = { ...previewData.current, lang };
      const card = composeCard(d, 1);
      const blob = await canvasToBlob(card);
      const drawingBlob = d.drawing ? await canvasToBlob(d.drawing) : null;
      const { drawing, ...meta } = d;
      await addCard({ createdAt: Date.now(), consent: d.consent, blob, drawingBlob, meta });
      lsSet("m3p-counter", d.number);
      download(blob, `M3P-Bioinfo_${pad3(d.number)}.png`);
      setScreen("thanks");
      lsSet("m3p-draft", null);
      setTimeout(() => fullReset(), 4500);
    } catch (err) {
      alert("Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleReaction = (i) =>
    setF({ reactions: form.reactions.includes(i) ? form.reactions.filter((x) => x !== i) : [...form.reactions, i] });

  const canPreview = hasInk || form.text.trim().length > 0;
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
          <button className="primary" onClick={nextVisitor}>{t.next}</button>
        </div>
      </header>

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
                  <span style={{ width: 6 + i * 6, height: 6 + i * 6 }} />
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

          <label className="consent">
            <input type="checkbox" checked={form.consent} onChange={(e) => setF({ consent: e.target.checked })} />
            <span>{t.consent}</span>
          </label>
          <button className="primary big" disabled={!canPreview} onClick={goPreview}>{t.preview}</button>
          <p className="privacy">{t.privacy}</p>
        </aside>
      </main>

      {backupDue && (
        <div className="backup" onClick={() => { setBackupDue(false); setStaffOpen(true); }}>
          💾 Backup due — Ctrl+Shift+S
        </div>
      )}

      {screen === "welcome" && (
        <div className="overlay welcome">
          <div className="card">
            <div className="bigdna">🧬</div>
            <h2>{STR.ms.welcomeTitle}</h2>
            <p>{STR.ms.welcomeText}</p>
            <h2 className="en">{STR.en.welcomeTitle}</h2>
            <p>{STR.en.welcomeText}</p>
            <div className="langbtns">
              <button className="primary big" onClick={() => { setLang("ms"); setScreen("main"); }}>Bahasa Melayu</button>
              <button className="primary big alt" onClick={() => { setLang("en"); setScreen("main"); }}>English</button>
            </div>
          </div>
        </div>
      )}

      {screen === "preview" && (
        <div className="overlay">
          <div className="card previewcard">
            <div className="previewimg" ref={previewRef} />
            <div className="previewbtns">
              <button className="ghost big" onClick={() => setScreen("main")}>← {t.back}</button>
              <button className="primary big" disabled={saving} onClick={save}>{saving ? t.saving : `✓ ${t.save}`}</button>
            </div>
          </div>
        </div>
      )}

      {screen === "thanks" && (
        <div className="overlay welcome">
          <div className="card">
            <div className="bigdna">✅</div>
            <h2>{t.thanks}</h2>
            <p>{t.thanksText}</p>
          </div>
        </div>
      )}

      {idleLeft !== null && screen !== "welcome" && screen !== "thanks" && (
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
          onClose={() => { setStaffOpen(false); setBackupDue(false); }}
        />
      )}
    </div>
  );
}
