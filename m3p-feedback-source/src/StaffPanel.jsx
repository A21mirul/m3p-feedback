import React, { useCallback, useEffect, useState } from "react";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { EXPORT_SIZES } from "./i18n.js";
import { composeSized, canvasToBlob } from "./composer.js";
import { allCards, deleteCard, clearCards } from "./storage.js";
import { download, pad3 } from "./util.js";

async function renderCard(card, settings) {
  const { w, h } = EXPORT_SIZES[settings.size];
  const drawing = card.drawingBlob ? await createImageBitmap(card.drawingBlob) : null;
  return composeSized({ ...card.meta, drawing }, w, h, settings.scale);
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

export default function StaffPanel({ t, settings, updateSettings, onClose }) {
  const [cards, setCards] = useState([]);
  const [onlyOk, setOnlyOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thumbs, setThumbs] = useState({});

  const load = useCallback(async () => {
    const list = (await allCards()).sort((a, b) => a.id - b.id);
    setCards(list);
    const th = {};
    list.forEach((c) => { th[c.id] = URL.createObjectURL(c.blob); });
    setThumbs((old) => { Object.values(old).forEach(URL.revokeObjectURL); return th; });
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => Object.values(thumbs).forEach(URL.revokeObjectURL), []); // eslint-disable-line

  const shown = onlyOk ? cards.filter((c) => c.consent) : cards;
  const ext = settings.fmt === "jpg" ? "jpg" : settings.fmt === "pdf" ? "pdf" : "png";
  const name = (c) => `M3P-Bioinfo_${pad3(c.meta.number)}.${ext}`;

  const one = async (card) => {
    setBusy(true);
    try {
      const cv = await renderCard(card, settings);
      if (settings.fmt === "pdf") download(pdfFromCanvases([cv]), name(card));
      else download(await canvasToBlob(cv, settings.fmt === "jpg" ? "image/jpeg" : "image/png"), name(card));
    } finally { setBusy(false); }
  };

  const zipAll = async () => {
    if (!shown.length) return;
    setBusy(true);
    try {
      const zip = new JSZip();
      for (const c of shown) {
        const cv = await renderCard(c, settings);
        const blob = settings.fmt === "pdf" ? pdfFromCanvases([cv]) : await canvasToBlob(cv, settings.fmt === "jpg" ? "image/jpeg" : "image/png");
        zip.file((c.consent ? "ok-to-post/" : "private/") + name(c), blob);
      }
      download(await zip.generateAsync({ type: "blob" }), `M3P-Bioinfo_cards_${new Date().toISOString().slice(0, 10)}.zip`);
    } finally { setBusy(false); }
  };

  const pdfAll = async () => {
    if (!shown.length) return;
    setBusy(true);
    try {
      const cvs = [];
      for (const c of shown) cvs.push(await renderCard(c, settings));
      download(pdfFromCanvases(cvs), `M3P-Bioinfo_feedback-book_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setBusy(false); }
  };

  const del = async (id) => { await deleteCard(id); load(); };
  const delAll = async () => { if (window.confirm(t.deleteConfirm)) { await clearCards(); load(); } };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card staff" onClick={(e) => e.stopPropagation()}>
        <div className="staffhead">
          <h2>{t.staffTitle} · {cards.length} {t.cards}</h2>
          <button className="ghost" onClick={onClose}>✕ {t.close}</button>
        </div>

        <div className="settings">
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
              {Object.entries(EXPORT_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></label>
          <label><span>{t.scale}</span>
            <select value={settings.scale} onChange={(e) => updateSettings({ scale: +e.target.value })}>
              <option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option>
            </select></label>
        </div>

        <div className="staffbar">
          <label className="inline"><input type="checkbox" checked={onlyOk} onChange={(e) => setOnlyOk(e.target.checked)} /> {t.onlyOk}</label>
          <button className="primary" disabled={busy || !shown.length} onClick={zipAll}>{busy ? "…" : t.zipAll}</button>
          <button className="primary alt" disabled={busy || !shown.length} onClick={pdfAll}>{busy ? "…" : t.pdfAll}</button>
          <button className="ghost danger" disabled={!cards.length} onClick={delAll}>{t.deleteAll}</button>
        </div>

        <div className="grid">
          {!shown.length && <p>{t.empty}</p>}
          {shown.map((c) => (
            <figure key={c.id}>
              <img src={thumbs[c.id]} alt="" />
              <figcaption>
                #{pad3(c.meta.number)} {c.consent ? "✅" : "🔒"}
                <span>
                  <button className="mini" disabled={busy} onClick={() => one(c)}>{t.redownload}</button>
                  <button className="mini danger" onClick={() => del(c.id)}>{t.delete}</button>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
