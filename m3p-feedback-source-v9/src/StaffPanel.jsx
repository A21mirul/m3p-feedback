import React, { useState } from "react";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { canvasToBlob } from "./composer.js";
import { putCard, purgeCard, tombstoneAll, importCards, lsGet, lsSet } from "./storage.js";
import { seedCards } from "./seed.js";
import { renderWall, renderPostImage } from "./exportWall.js";
import { renderNoteCanvas } from "./noteRender.js";
import { rectOf, bgIdFromSettings, BG_IDS } from "./board.js";
import { PAGE_CAP } from "./shapes.js";
import { download, pad3 } from "./util.js";
import { NoteThumb, CardView, useCards, keyOf } from "./Wall.jsx";

const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
const toBlobFromURL = async (u) => (u ? (await fetch(u)).blob() : null);

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
  const { cards } = useCards(v);
  const [tab, setTab] = useState("cards");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [fPage, setFPage] = useState("all");
  const [fStatus, setFStatus] = useState("shown");
  const [sel, setSel] = useState(null);
  const [ePage, setEPage] = useState("all");
  const [efmt, setEfmt] = useState("png");
  const [esize, setEsize] = useState("std");
  const [ebanner, setEbanner] = useState(false);
  const [cardMode, setCardMode] = useState("transparent");
  const reload = () => { setV((x) => x + 1); onChanged && onChanged(); };

  const live = cards.filter((c) => !c.deleted);
  const shownAll = live.filter((c) => !c.hidden);
  const hiddenAll = live.filter((c) => c.hidden);
  const trash = cards.filter((c) => c.deleted && !c.purged);
  const testCards = cards.filter((c) => c.test && !c.purged);
  const pageMax = settings.pageMax || 1;
  const pageNums = [...new Set([...live.map((c) => c.page || 1), ...Array.from({ length: pageMax }, (_, i) => i + 1)])].sort((a, b) => a - b);
  const bgFor = (p) => bgIdFromSettings(settings, p);
  const bgLabel = { m3p2: t.bgNew, m3p1: t.bgOld, plain: t.bgPlain };
  const numMap = new Map(shownAll.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map((c, i) => [keyOf(c), i + 1]));
  const num = (c) => numMap.get(keyOf(c)) || 0;
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const run = async (fn) => { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg(String(e.message || e)); } finally { setBusy(false); } };
  const edit = (c, patch) => run(async () => { await putCard({ ...c, ...patch, updatedAt: Date.now() }); setSel(null); reload(); });
  const purge = (c) => run(async () => { await purgeCard(c); setSel(null); reload(); });

  const list = (fStatus === "shown" ? shownAll : fStatus === "hidden" ? hiddenAll : trash).filter((c) => fPage === "all" || (c.page || 1) === Number(fPage));

  // ---- downloads ----
  const dlCard = (c) => run(async () => { download(await canvasToBlob(await renderNoteCanvas(c, 2, true), "image/png"), `M3P-card_${pad3(num(c))}.png`); });
  const dlPost = (c) => run(async () => { download(await canvasToBlob(await renderPostImage(c, bgFor(c.page || 1)), "image/jpeg", 0.92), `M3P-post_${pad3(num(c))}.jpg`); });
  const doExportWall = () => run(async () => {
    const todo = ePage === "all" ? pageNums : [Number(ePage)];
    const files = [];
    for (const p of todo) {
      const pageCards = shownAll.filter((c) => (c.page || 1) === p);
      if (!pageCards.length) continue;
      const cv = await renderWall(pageCards, { size: esize, banner: ebanner, handle: settings.handle, bgId: bgFor(p), onProgress: (k, n) => setMsg(`${t.pageWord} ${p}: ${k}/${n}`) });
      const blob = efmt === "pdf" ? pdfFromCanvases([cv]) : await canvasToBlob(cv, efmt === "jpg" ? "image/jpeg" : "image/png", 0.92);
      files.push([`M3P_wall_page${p}_${esize}.${efmt}`, blob, cv]);
    }
    if (!files.length) throw new Error(t.noCards);
    if (files.length === 1) { download(files[0][1], files[0][0]); setMsg(`${files[0][2].width}×${files[0][2].height}`); }
    else {
      const zip = new JSZip();
      files.forEach(([n, b]) => zip.file(n, b));
      download(await zip.generateAsync({ type: "blob" }), `M3P_wall_${stamp()}.zip`);
      setMsg(`${files.length} ${t.cards}`);
    }
  });
  const doExportCards = () => run(async () => {
    const items = shownAll.filter((c) => ePage === "all" || (c.page || 1) === Number(ePage));
    if (!items.length) throw new Error(t.noCards);
    const zip = new JSZip(), post = cardMode === "post";
    for (let i = 0; i < items.length; i++) {
      const c = items[i];
      const cv = post ? await renderPostImage(c, bgFor(c.page || 1)) : await renderNoteCanvas(c, 2, true);
      zip.file(`M3P-${post ? "post" : "card"}_${pad3(num(c))}.${post ? "jpg" : "png"}`, await canvasToBlob(cv, post ? "image/jpeg" : "image/png", 0.92));
      setMsg(`${i + 1}/${items.length}`);
    }
    download(await zip.generateAsync({ type: "blob" }), `M3P_cards_${stamp()}.zip`);
    setMsg(`${items.length} ${t.cards}`);
  });

  // ---- backup ----
  const exportBundle = () => run(async () => {
    const out = [];
    for (const c of cards.filter((x) => x.uid)) {
      const { id, drawingBlob, thumbBlob, blob, ...rest } = c;
      out.push({ ...rest, drawing: drawingBlob ? await blobToDataURL(drawingBlob) : null, thumb: thumbBlob ? await blobToDataURL(thumbBlob) : null });
    }
    const json = JSON.stringify({ app: "m3p-feedback", v: 3, laptop: settings.laptop, exportedAt: Date.now(), cards: out });
    download(new Blob([json], { type: "application/json" }), `m3p-bundle_${settings.laptop || "X"}_${stamp()}.json`);
    lsSet("m3p-last-backup", Date.now());
    setMsg(`${out.length} ${t.cards}`);
  });
  const onImport = (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    return run(async () => {
      let added = 0, updated = 0;
      for (const f of files) {
        const data = JSON.parse(await f.text());
        if (data.app !== "m3p-feedback") throw new Error("Not an M3P file: " + f.name);
        const items = [];
        for (const c of data.cards) {
          const { drawing, thumb, ...rest } = c;
          items.push({ ...rest, drawingBlob: await toBlobFromURL(drawing), thumbBlob: await toBlobFromURL(thumb) });
        }
        const r = await importCards(items);
        added += r.added; updated += r.updated;
      }
      setMsg(`${t.imported}: ${added} (↻ ${updated})`);
      reload();
    });
  };

  // ---- test tools / danger ----
  const doSeed = () => {
    if (!window.confirm(t.seedConfirm)) return;
    run(async () => {
      const existing = {};
      live.forEach((c) => { const p = c.page || 1; (existing[p] = existing[p] || []).push(rectOf(c, bgFor(p))); });
      const mp = await seedCards(150, existing, bgFor, (k) => setMsg(`${k}/150`));
      if (mp > pageMax) updateSettings({ pageMax: mp });
      setMsg(""); reload();
    });
  };
  const delSeed = () => { if (window.confirm(t.seedConfirm2)) run(async () => { for (const c of testCards) await purgeCard(c); reload(); }); };
  const emptyTrash = () => { if (window.confirm(t.emptyConfirm)) run(async () => { for (const c of trash) await purgeCard(c); reload(); }); };
  const delAll = () => { if (window.confirm(t.deleteConfirm)) run(async () => { await tombstoneAll(); reload(); }); };

  const last = lsGet("m3p-last-backup", 0);
  const pageSelect = (value, onChange, withAll) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {withAll && <option value="all">{t.allPages}</option>}
      {pageNums.map((p) => <option key={p} value={p}>{t.pageWord} {p}</option>)}
    </select>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card staff sp" onClick={(e) => e.stopPropagation()}>
        <div className="sp-head">
          <h2>{t.staffTitle}</h2>
          <button className="ghost" onClick={onClose}>✕ {t.close}</button>
        </div>
        <div className="sp-tabs">
          {["cards", "export", "backup", "settings"].map((k) => <button key={k} className={"sp-tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{t["tab_" + k]}</button>)}
        </div>
        {testCards.length > 0 && <p className="staffmsg warn">⚠ {t.seedWarn.replace("{n}", testCards.length)}</p>}
        {msg && <p className="staffmsg">{msg}</p>}

        {tab === "cards" && (
          <>
            <div className="sp-filters">
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                <option value="shown">{t.stShown} ({shownAll.length})</option>
                <option value="hidden">{t.stHidden} ({hiddenAll.length})</option>
                <option value="trash">{t.trash} ({trash.length})</option>
              </select>
              {pageSelect(fPage, setFPage, true)}
              {fStatus === "trash" && trash.length > 0 && <button className="ghost danger" disabled={busy} onClick={emptyTrash}>{t.emptyTrash}</button>}
            </div>
            {!list.length && <p>{t.empty}</p>}
            <div className="sp-grid">
              {list.map((c) => (
                <button key={keyOf(c)} className="sp-tile" onClick={() => setSel(c)}>
                  <NoteThumb card={c} width={150} />
                  <small>#{num(c) || "–"} · {t.pageWord} {c.page || 1}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "export" && (
          <>
            <section className="sp-sec">
              <h3>{t.exWallTitle}</h3>
              <div className="sp-form">
                <label><span>{t.pageWord}</span>{pageSelect(ePage, setEPage, true)}</label>
                <label><span>{t.fmt}</span>
                  <select value={efmt} onChange={(e) => setEfmt(e.target.value)}><option value="png">PNG</option><option value="jpg">JPG</option><option value="pdf">PDF</option></select></label>
                <label><span>{t.exVersion}</span>
                  <select value={esize} onChange={(e) => setEsize(e.target.value)}>
                    <option value="ig">{t.vIg}</option><option value="std">{t.vStd}</option><option value="full">{t.vFull}</option>
                  </select></label>
              </div>
              <details className="sp-more"><summary>{t.moreOpts}</summary>
                <label className="chk"><input type="checkbox" checked={ebanner} onChange={(e) => setEbanner(e.target.checked)} /> {t.bannerOpt}</label>
              </details>
              <button className="primary big" disabled={busy || !shownAll.length} onClick={doExportWall}>{busy ? "…" : `🖼 ${t.wallExport}`}</button>
            </section>
            <section className="sp-sec">
              <h3>{t.exCardsTitle}</h3>
              <div className="sp-form">
                <label><span>{t.pageWord}</span>{pageSelect(ePage, setEPage, true)}</label>
                <label><span>{t.fmt}</span>
                  <select value={cardMode} onChange={(e) => setCardMode(e.target.value)}>
                    <option value="transparent">{t.exCardTransparent}</option><option value="post">{t.exCardPost}</option>
                  </select></label>
              </div>
              <button className="primary alt big" disabled={busy || !shownAll.length} onClick={doExportCards}>{busy ? "…" : `⬇ ${t.dlZip}`}</button>
              <p className="sp-help">{t.exCardsHelp}</p>
            </section>
          </>
        )}

        {tab === "backup" && (
          <section className="sp-sec">
            <h3>{t.bkTitle}</h3>
            <p className="sp-help">{t.bkHelp}</p>
            <p className="sp-help"><b>{t.bkLast}:</b> {last ? new Date(last).toLocaleString() : t.bkNever}</p>
            <button className="primary big" disabled={busy || !cards.length} onClick={exportBundle}>💾 {t.bkSave}</button>
            <label className="filebtn big">📥 {t.bkLoad}
              <input type="file" accept=".json,application/json" multiple hidden disabled={busy} onChange={onImport} /></label>
          </section>
        )}

        {tab === "settings" && (
          <>
            <section className="sp-sec">
              <h3>{t.setBooth}</h3>
              <div className="sp-form">
                <label><span>{t.laptop}</span>
                  <input type="text" maxLength={8} value={settings.laptop || ""} onChange={(e) => updateSettings({ laptop: e.target.value.toUpperCase() })} /></label>
                <label><span>{t.defLang}</span>
                  <select value={settings.defLang} onChange={(e) => updateSettings({ defLang: e.target.value })}><option value="en">English</option><option value="ms">Bahasa Melayu</option></select></label>
                <label><span>{t.idleSec}</span>
                  <input type="number" min={15} max={600} value={settings.idleSec} onChange={(e) => updateSettings({ idleSec: Math.max(15, +e.target.value || 60) })} /></label>
                <label><span>{t.handle}</span>
                  <input type="text" placeholder="@bioinfo_ukm" value={settings.handle} onChange={(e) => updateSettings({ handle: e.target.value })} /></label>
              </div>
            </section>
            <section className="sp-sec">
              <h3>{t.setWall}</h3>
              <label className="chk"><input type="checkbox" checked={settings.moveAll !== false} onChange={(e) => updateSettings({ moveAll: e.target.checked })} /> {t.moveAll}</label>
              <h4>{t.pageBgs}</h4>
              {pageNums.map((p) => (
                <label key={p} className="sp-row"><span>{t.pageWord} {p}</span>
                  <select value={bgFor(p)} onChange={(e) => updateSettings({ pageBg: { ...(settings.pageBg || {}), [p]: e.target.value } })}>
                    {BG_IDS.map((id) => <option key={id} value={id}>{bgLabel[id]}</option>)}
                  </select></label>
              ))}
              <button className="ghost" onClick={() => updateSettings({ pageMax: pageNums.length + 1 })}>＋ {t.addPage}</button>
              <p className="sp-help">{t.capInfo.replace("{n}", PAGE_CAP)}</p>
            </section>
            <details className="sp-sec sp-danger"><summary>{t.dangerZone}</summary>
              <div className="sp-actions">
                <button className="ghost" disabled={busy} onClick={doSeed}>🧪 {t.seedBtn}</button>
                {testCards.length > 0 && <button className="ghost danger" disabled={busy} onClick={delSeed}>{t.delSeed} ({testCards.length})</button>}
                <button className="ghost danger" disabled={!cards.length} onClick={delAll}>{t.deleteAll}</button>
              </div>
            </details>
          </>
        )}

        {sel && (
          <div className="sp-modal" onClick={() => setSel(null)}>
            <div className="sp-modalcard" onClick={(e) => e.stopPropagation()}>
              <CardView card={sel} t={t} />
              <div className="sp-actions">
                <button className="primary" disabled={busy} onClick={() => dlCard(sel)}>⬇ {t.cDownload}</button>
                <button className="primary alt" disabled={busy} onClick={() => dlPost(sel)}>⬇ {t.cDownloadPost}</button>
                {!sel.deleted ? (
                  <>
                    <button className="ghost" disabled={busy} onClick={() => edit(sel, { hidden: !sel.hidden })}>{sel.hidden ? t.show : t.hide}</button>
                    <button className="ghost danger" disabled={busy} onClick={() => edit(sel, { deleted: true })}>🗑 {t.trash}</button>
                  </>
                ) : (
                  <>
                    <button className="ghost" disabled={busy} onClick={() => edit(sel, { deleted: false })}>{t.restore}</button>
                    <button className="ghost danger" disabled={busy} onClick={() => purge(sel)}>{t.delete}</button>
                  </>
                )}
              </div>
              <label className="sp-row"><span>{t.cMove}</span>
                <select value={sel.page || 1} onChange={(e) => edit(sel, { page: Number(e.target.value) })}>
                  {pageNums.map((p) => <option key={p} value={p}>{t.pageWord} {p}</option>)}
                </select></label>
              <button className="ghost" onClick={() => setSel(null)}>{t.close}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
