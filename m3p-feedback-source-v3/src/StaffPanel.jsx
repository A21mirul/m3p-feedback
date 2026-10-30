import React, { useState } from "react";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { EXPORT_SIZES } from "./i18n.js";
import { composeSized, canvasToBlob } from "./composer.js";
import { deleteCard, clearCards, putCard, importCards } from "./storage.js";
import { download, pad3 } from "./util.js";
import { Note, useCards, keyOf } from "./Wall.jsx";

const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

async function renderCard(card, number, settings) {
  const { w, h } = EXPORT_SIZES[settings.size];
  const drawing = card.drawingBlob ? await createImageBitmap(card.drawingBlob) : null;
  return composeSized({ ...card.meta, number, handle: settings.handle, consent: false, drawing }, w, h, settings.scale);
}

function pdfFromCanvases(canvases) {
  const first = canvases[0];
  const pdf = new jsPDF({ unit: "px", format: [first.width, first.height], orientation: first.width > first.height ? "l" : "p", compress: true });
  canvases.forEach((c, i) => {
    if (i > 0) pdf.addPage([c.width, c.height], c.width > c.height ? "l" : "p");
    pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, c.width, c.height);
  });
  return pdf.output("blob");
}

export default function StaffPanel({ t, settings, updateSettings, onClose, onChanged }) {
  const [v, setV] = useState(0);
  const { cards, urls } = useCards(v);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const reload = () => { setV((x) => x + 1); onChanged && onChanged(); };

  // visible cards, oldest first; their position becomes the card number on export
  const ordered = cards.filter((c) => !c.hidden).slice().reverse();
  const numOf = (c) => ordered.indexOf(c) + 1;
  const ext = settings.fmt === "jpg" ? "jpg" : settings.fmt === "pdf" ? "pdf" : "png";
  const name = (c) => `M3P-Bioinfo_${pad3(numOf(c))}.${ext}`;
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const toBlob = async (c) => {
    const cv = await renderCard(c, numOf(c), settings);
    return settings.fmt === "pdf" ? pdfFromCanvases([cv]) : canvasToBlob(cv, settings.fmt === "jpg" ? "image/jpeg" : "image/png");
  };
  const run = async (fn) => { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg(String(e.message || e)); } finally { setBusy(false); } };

  const exportBundle = () => run(async () => {
    const list = [];
    for (const c of cards.filter((x) => x.uid)) {
      const { id, drawingBlob, blob, ...rest } = c;
      list.push({ ...rest, drawing: drawingBlob ? await blobToDataURL(drawingBlob) : null });
    }
    const json = JSON.stringify({ app: "m3p-feedback", v: 1, laptop: settings.laptop, exportedAt: Date.now(), cards: list });
    download(new Blob([json], { type: "application/json" }), `m3p-bundle_${settings.laptop || "X"}_${stamp()}.json`);
    setMsg(`${list.length} ${t.cards}`);
  });

  const onImport = (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    return run(async () => {
      let added = 0;
      for (const f of files) {
        const data = JSON.parse(await f.text());
        if (data.app !== "m3p-feedback") throw new Error("Bukan fail M3P / not an M3P file: " + f.name);
        const list = [];
        for (const c of data.cards) {
          const { drawing, ...rest } = c;
          list.push({ ...rest, drawingBlob: drawing ? await (await fetch(drawing)).blob() : null });
        }
        added += await importCards(list);
      }
      setMsg(`${t.imported}: ${added}`);
      reload();
    });
  };

  const zipAll = () => run(async () => {
    const zip = new JSZip();
    for (const c of ordered) zip.file(name(c), await toBlob(c));
    download(await zip.generateAsync({ type: "blob" }), `M3P-Bioinfo_cards_${stamp()}.zip`);
  });
  const pdfAll = () => run(async () => {
    const cvs = [];
    for (const c of ordered) cvs.push(await renderCard(c, numOf(c), settings));
    download(pdfFromCanvases(cvs), `M3P-Bioinfo_feedback-book_${stamp()}.pdf`);
  });
  const toggleHide = (c) => run(async () => { await putCard({ ...c, hidden: !c.hidden }); reload(); });
  const del = (c) => run(async () => { await deleteCard(c.id); reload(); });
  const delAll = () => { if (window.confirm(t.deleteConfirm)) run(async () => { await clearCards(); reload(); }); };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card staff" onClick={(e) => e.stopPropagation()}>
        <div className="staffhead">
          <h2>{t.staffTitle} · {ordered.length}/{cards.length} {t.cards}</h2>
          <button className="ghost" onClick={onClose}>✕ {t.close}</button>
        </div>

        <div className="settings">
          <label><span>{t.laptop}</span>
            <input type="text" maxLength={8} value={settings.laptop || ""} onChange={(e) => updateSettings({ laptop: e.target.value.toUpperCase() })} /></label>
          <label><span>{t.defLang}</span>
            <select value={settings.defLang} onChange={(e) => updateSettings({ defLang: e.target.value })}>
              <option value="ms">Bahasa Melayu</option><option value="en">English</option>
            </select></label>
          <label><span>{t.idleSec}</span>
            <input type="number" min={15} max={600} value={settings.idleSec} onChange={(e) => updateSettings({ idleSec: Math.max(15, +e.target.value || 60) })} /></label>
          <label><span>{t.handle}</span>
            <input type="text" placeholder="@bioinfo_ukm" value={settings.handle} onChange={(e) => updateSettings({ handle: e.target.value })} /></label>
          <label><span>{t.fmt}</span>
            <select value={settings.fmt} onChange={(e) => updateSettings({ fmt: e.target.value })}>
              <option value="png">PNG</option><option value="jpg">JPG</option><option value="pdf">PDF</option>
            </select></label>
          <label><span>{t.size_}</span>
            <select value={settings.size} onChange={(e) => updateSettings({ size: e.target.value })}>
              {Object.entries(EXPORT_SIZES).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
            </select></label>
          <label><span>{t.scale}</span>
            <select value={settings.scale} onChange={(e) => updateSettings({ scale: +e.target.value })}>
              <option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option>
            </select></label>
        </div>

        <div className="staffbar">
          <button className="primary" disabled={busy || !cards.length} onClick={exportBundle}>{busy ? "…" : `💾 ${t.exportBundle}`}</button>
          <label className="filebtn">📥 {t.importBundle}
            <input type="file" accept=".json,application/json" multiple hidden disabled={busy} onChange={onImport} /></label>
          <button className="primary alt" disabled={busy || !ordered.length} onClick={zipAll}>{t.zipAll}</button>
          <button className="primary alt" disabled={busy || !ordered.length} onClick={pdfAll}>{t.pdfAll}</button>
          <button className="ghost danger" disabled={!cards.length} onClick={delAll}>{t.deleteAll}</button>
        </div>
        {msg && <p className="staffmsg">{msg}</p>}

        {!cards.length && <p>{t.empty}</p>}
        <div className="notes">
          {cards.map((c) => (
            <div className="sitem" key={keyOf(c)}>
              <Note card={c} url={urls[keyOf(c)]} t={t} />
              <span>
                <button className="mini" disabled={busy} onClick={() => toggleHide(c)}>{c.hidden ? t.show : t.hide}</button>
                <button className="mini danger" disabled={busy} onClick={() => del(c)}>{t.delete}</button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
