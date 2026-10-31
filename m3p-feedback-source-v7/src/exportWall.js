// Draw the whole wall (every visible card at its board position) onto one canvas.
import { NOTE_W, NOTE_H, hash, posOf } from "./board.js";

const PAPER = ["#FFE872", "#FFC2D1", "#BDF2D5", "#BFDDFF", "#FFD1A1", "#DCC8FF"];
const REACT_EMOJI = ["💡", "🔍", "🎮", "🏭", "🧬"];
const FONT = 'Virgil, "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const UI = '"Trebuchet MS","Segoe UI",Nunito,Arial,sans-serif';
const keyOf = (c) => c.uid || "L" + c.id;
const rad = (d) => (d * Math.PI) / 180;

function rrPath(ctx, x, y, w, h, r) {
  const [tl, tr, br, bl] = r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y); ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br); ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h); ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl); ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

function wrapLines(ctx, text, maxW) {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width <= maxW) { cur = test; continue; }
    if (cur) lines.push(cur);
    let word = w;
    while (ctx.measureText(word).width > maxW && word.length > 1) {
      let i = word.length;
      while (i > 1 && ctx.measureText(word.slice(0, i)).width > maxW) i--;
      lines.push(word.slice(0, i)); word = word.slice(i);
    }
    cur = word;
  }
  if (cur) lines.push(cur);
  return lines;
}

function ellipsis(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

// one sticky note, laid out like the CSS version on the wall
function drawNote(ctx, c, bmp) {
  const m = c.meta || {};
  const h = hash(keyOf(c));
  const rot = c.pos && c.pos.r != null ? c.pos.r : (h % 5) - 2;
  const paper = PAPER[(m.color != null ? m.color : h) % PAPER.length];
  const p = posOf(c), W = NOTE_W, H = NOTE_H;
  ctx.save();
  ctx.translate(p.x + W / 2, p.y + H / 2);
  ctx.rotate(rad(rot));
  ctx.translate(-W / 2, -H / 2);

  ctx.shadowColor = "rgba(20,40,75,.28)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
  ctx.fillStyle = paper; rrPath(ctx, 0, 0, W, H, [2, 2, 14, 2]); ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  ctx.save(); // folded corner
  rrPath(ctx, 0, 0, W, H, [2, 2, 14, 2]); ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,.14)"; ctx.beginPath(); ctx.moveTo(W - 26, H); ctx.lineTo(W, H - 26); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  ctx.restore();

  const L = 19, R = W - 19, top = 31, bottom = H - 14 - 30, cw = R - L;
  const text = (m.text || "").trim();
  let textBottom = top;
  if (text) {
    const len = text.length;
    const fs = (len <= 40 ? 1 : len <= 80 ? 0.85 : len <= 120 ? 0.72 : 0.62) * 24;
    ctx.font = `${fs}px ${FONT}`; ctx.fillStyle = "#1b2a47"; ctx.textBaseline = "top";
    const lines = wrapLines(ctx, text, cw), lh = fs * 1.15;
    const maxH = bmp ? (bottom - top) * 0.6 : bottom - top;
    const shown = lines.slice(0, Math.max(1, Math.floor(maxH / lh)));
    const blockH = shown.length * lh;
    const ty = bmp ? top : top + (bottom - top - blockH) / 2;
    ctx.textAlign = bmp ? "left" : "center";
    shown.forEach((ln, i) => ctx.fillText(ln, bmp ? L : W / 2, ty + i * lh));
    textBottom = ty + blockH;
  }
  if (bmp) {
    const areaTop = text ? textBottom + 4 : top, areaH = bottom - areaTop;
    if (areaH > 8) {
      const s = Math.min(cw / bmp.width, areaH / bmp.height), dw = bmp.width * s, dh = bmp.height * s;
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(bmp, L + (cw - dw) / 2, areaTop + (areaH - dh) / 2, dw, dh);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  const emo = (m.reactions || []).map((i) => REACT_EMOJI[i]).filter(Boolean).join(" ");
  ctx.textBaseline = "bottom"; ctx.textAlign = "left";
  if (emo) { ctx.font = `21px ${EMOJI}`; ctx.fillStyle = "#000"; ctx.fillText(emo, L, H - 12); }
  ctx.font = `20px ${FONT}`; ctx.fillStyle = "#27406f"; ctx.textAlign = "right";
  ctx.fillText(ellipsis(ctx, "— " + (m.nickname || "Anonymous"), 125), R, H - 12);

  if ((m.stickers || []).length) {
    ctx.save(); ctx.translate(W - 28, 42); ctx.rotate(rad(10));
    ctx.font = `41px ${EMOJI}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000";
    ctx.fillText(m.stickers.join(""), 0, 0); ctx.restore();
  }

  ctx.save(); // tape
  ctx.translate(W / 2, 5); ctx.rotate(rad(-3));
  ctx.shadowColor = "rgba(0,0,0,.15)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
  ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillRect(-60, -18, 120, 36);
  ctx.restore();
  ctx.restore();
}

function drawBanner(ctx, W, bh, count) {
  ctx.fillStyle = "#14284B"; ctx.fillRect(0, 0, W, bh);
  const txt = `${count} feedback`;
  ctx.font = `800 ${bh * 0.26}px ${UI}`;
  const ph = bh * 0.5, pw = ctx.measureText(txt).width + bh * 0.5, px = W - pw - bh * 0.3, py = (bh - ph) / 2;
  const maxW = px - bh * 0.6; // room left for the title next to the pill
  const fit = (str, size, weight) => {
    ctx.font = `${weight} ${size}px ${UI}`;
    const w = ctx.measureText(str).width;
    return w > maxW ? size * (maxW / w) : size;
  };
  const title = "Bioinformatics Club · UKM FST", sub = "M3P 2026 · 5 Nov 2026 · Feedback Wall";
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillStyle = "#F5F8FC"; ctx.font = `800 ${fit(title, bh * 0.34, 800)}px ${UI}`;
  ctx.fillText(title, bh * 0.3, bh * 0.4);
  ctx.fillStyle = "#2EC4B6"; ctx.font = `600 ${fit(sub, bh * 0.2, 600)}px ${UI}`;
  ctx.fillText(sub, bh * 0.3, bh * 0.74);
  ctx.fillStyle = "#FFC857"; rrPath(ctx, px, py, pw, ph, [ph / 2, ph / 2, ph / 2, ph / 2]); ctx.fill();
  ctx.fillStyle = "#14284B"; ctx.textAlign = "center"; ctx.font = `800 ${bh * 0.26}px ${UI}`;
  ctx.fillText(txt, px + pw / 2, py + ph / 2 + 1);
}

function drawFooter(ctx, W, H, fh, handle) {
  ctx.fillStyle = "#14284B"; ctx.fillRect(0, H - fh, W, fh);
  ctx.textBaseline = "middle"; ctx.font = `800 ${fh * 0.42}px ${UI}`;
  ctx.fillStyle = "#FFC857"; ctx.textAlign = "left"; ctx.fillText("#M3P2026", fh * 0.6, H - fh / 2);
  ctx.fillStyle = "#F5F8FC"; ctx.textAlign = "right";
  ctx.fillText(handle ? `Tag kami / Tag us ${handle}` : "Terima kasih / Thank you", W - fh * 0.6, H - fh / 2);
}

// size: "full" (2x), "std" (1x) or "ig" (4:5 poster, 2160x2700 with banner + footer)
export async function renderWall(cards, { size = "std", banner = true, handle = "", onProgress } = {}) {
  const vis = cards.filter((c) => !c.hidden && !c.deleted)
    .sort((a, b) => (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0));
  if (!vis.length) throw new Error("No cards to export");
  try { await document.fonts.load("24px Virgil"); } catch (e) { /* system fallback */ }

  const PAD = 90;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of vis) {
    const p = posOf(c);
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + NOTE_W); y1 = Math.max(y1, p.y + NOTE_H);
  }
  x0 -= PAD; y0 -= PAD; x1 += PAD; y1 += PAD;
  const bw = x1 - x0, bh = y1 - y0;

  let W, H, sc, bannerH = 0, footH = 0, region;
  if (size === "ig") {
    W = 2160; H = 2700; bannerH = 300; footH = 150;
    const m = 60, aw = W - 2 * m, ah = H - bannerH - footH - 2 * m;
    sc = Math.min(2.5, aw / bw, ah / bh);
    const rw = bw * sc, rh = bh * sc;
    region = { x: (W - rw) / 2, y: bannerH + m + (ah - rh) / 2, w: rw, h: rh, r: 24 };
  } else {
    sc = size === "full" ? 2 : 1;
    while (bw * bh * sc * sc > 90e6 || Math.max(bw, bh + 600) * sc > 16000) sc *= 0.9; // stay inside canvas limits
    const Wr = Math.round(bw * sc);
    bannerH = banner ? Math.round(Math.min(420, Math.max(120, Wr * 0.07))) : 0;
    footH = banner ? Math.round(bannerH * 0.5) : 0;
    W = Wr; H = Math.round(bh * sc) + bannerH + footH;
    region = { x: 0, y: bannerH, w: W, h: Math.round(bh * sc), r: 0 };
  }

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = size === "ig" ? "#14284B" : "#F5F8FC"; ctx.fillRect(0, 0, W, H);

  ctx.save();
  rrPath(ctx, region.x, region.y, region.w, region.h, [region.r, region.r, region.r, region.r]); ctx.clip();
  ctx.fillStyle = "#F5F8FC"; ctx.fillRect(region.x, region.y, region.w, region.h);
  ctx.translate(region.x - x0 * sc, region.y - y0 * sc); ctx.scale(sc, sc);
  ctx.fillStyle = "#C5D2E8";
  for (let gx = Math.ceil(x0 / 48) * 48; gx < x1; gx += 48)
    for (let gy = Math.ceil(y0 / 48) * 48; gy < y1; gy += 48) ctx.fillRect(gx - 1.5, gy - 1.5, 3, 3);
  for (let i = 0; i < vis.length; i++) {
    const c = vis[i];
    let bmp = null;
    if (c.drawingBlob) { try { bmp = await createImageBitmap(c.drawingBlob); } catch (e) { bmp = null; } }
    drawNote(ctx, c, bmp);
    if (bmp && bmp.close) bmp.close();
    if (onProgress && (i % 10 === 0 || i === vis.length - 1)) onProgress(i + 1, vis.length);
  }
  ctx.restore();

  if (bannerH) drawBanner(ctx, W, bannerH, vis.length);
  if (footH) drawFooter(ctx, W, H, footH, handle);
  return cv;
}
