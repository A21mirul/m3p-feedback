// Whole-wall and per-card images. Notes are drawn by the shared renderer (noteRender.js), so they match the wall exactly.
import { BOARD_W, BOARD_H, BGS, bgUrl, hash, rectOf } from "./board.js";
import { dims } from "./shapes.js";
import { drawNote, ensureFont } from "./noteRender.js";

const UI = '"Trebuchet MS","Segoe UI",Nunito,Arial,sans-serif';
const rad = (d) => (d * Math.PI) / 180;
const keyOf = (c) => c.uid || "L" + c.id;

const bgCache = new Map();
export function loadBg(bgId) {
  const u = bgUrl(bgId);
  if (!u) return Promise.resolve(null);
  if (!bgCache.has(u)) bgCache.set(u, new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = u; }));
  return bgCache.get(u);
}

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

function drawBanner(ctx, W, bh, count) {
  ctx.fillStyle = "#14284B"; ctx.fillRect(0, 0, W, bh);
  const txt = `${count} feedback`;
  ctx.font = `800 ${bh * 0.26}px ${UI}`;
  const ph = bh * 0.5, pw = ctx.measureText(txt).width + bh * 0.5, px = W - pw - bh * 0.3, py = (bh - ph) / 2;
  const maxW = px - bh * 0.6;
  const fit = (str, size, weight) => { ctx.font = `${weight} ${size}px ${UI}`; const w = ctx.measureText(str).width; return w > maxW ? size * (maxW / w) : size; };
  const title = "Bioinformatics Club · UKM FST", sub = "M3P 2026 · 5 Nov 2026 · Feedback Wall";
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillStyle = "#F5F8FC"; ctx.font = `800 ${fit(title, bh * 0.34, 800)}px ${UI}`; ctx.fillText(title, bh * 0.3, bh * 0.4);
  ctx.fillStyle = "#2EC4B6"; ctx.font = `600 ${fit(sub, bh * 0.2, 600)}px ${UI}`; ctx.fillText(sub, bh * 0.3, bh * 0.74);
  ctx.fillStyle = "#FFC857"; rrPath(ctx, px, py, pw, ph, [ph / 2, ph / 2, ph / 2, ph / 2]); ctx.fill();
  ctx.fillStyle = "#14284B"; ctx.textAlign = "center"; ctx.font = `800 ${bh * 0.26}px ${UI}`; ctx.fillText(txt, px + pw / 2, py + ph / 2 + 1);
}
function drawFooter(ctx, W, H, fh, handle) {
  ctx.fillStyle = "#14284B"; ctx.fillRect(0, H - fh, W, fh);
  ctx.textBaseline = "middle"; ctx.font = `800 ${fh * 0.42}px ${UI}`;
  ctx.fillStyle = "#FFC857"; ctx.textAlign = "left"; ctx.fillText("#M3P2026", fh * 0.6, H - fh / 2);
  ctx.fillStyle = "#F5F8FC"; ctx.textAlign = "right";
  ctx.fillText(handle ? `Tag kami / Tag us ${handle}` : "Terima kasih / Thank you", W - fh * 0.6, H - fh / 2);
}

async function bitmapOf(c) {
  if (!c.drawingBlob) return null;
  try { return await createImageBitmap(c.drawingBlob); } catch (e) { return null; }
}

// size: "full" (2x), "std" (1x) or "ig". On a poster the whole poster is exported (ig = 1.91:1 crop of its sides);
// on the plain board it is cropped to the cards (ig = 4:5 with banner + footer).
export async function renderWall(cards, { size = "std", banner = false, handle = "", bgId = "plain", onProgress } = {}) {
  const vis = cards.filter((c) => !c.hidden && !c.deleted)
    .sort((a, b) => (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0));
  if (!vis.length) throw new Error("No cards to export");
  await ensureFont();
  const bg = await loadBg(bgId);
  const rects = vis.map((c) => rectOf(c, bgId));

  let x0, y0, x1, y1;
  if (bg) { x0 = 0; y0 = 0; x1 = BOARD_W; y1 = BOARD_H; }
  else {
    const PAD = 90;
    x0 = Math.min(...rects.map((r) => r.x)) - PAD; y0 = Math.min(...rects.map((r) => r.y)) - PAD;
    x1 = Math.max(...rects.map((r) => r.x + r.w)) + PAD; y1 = Math.max(...rects.map((r) => r.y + r.h)) + PAD;
  }
  let bw = x1 - x0, bh = y1 - y0;

  let W, H, sc, bannerH = 0, footH = 0, region;
  if (bg && size === "ig") {
    const cwid = BOARD_H * 1.91; // widest landscape ratio Instagram keeps
    x0 = (BOARD_W - cwid) / 2; x1 = x0 + cwid; bw = cwid;
    W = 2160; sc = W / cwid; H = Math.round(BOARD_H * sc);
    region = { x: 0, y: 0, w: W, h: H, r: 0 };
  } else if (size === "ig") {
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
  ctx.fillStyle = size === "ig" && !bg ? "#14284B" : "#F5F8FC"; ctx.fillRect(0, 0, W, H);
  ctx.save();
  rrPath(ctx, region.x, region.y, region.w, region.h, [region.r, region.r, region.r, region.r]); ctx.clip();
  ctx.fillStyle = "#F5F8FC"; ctx.fillRect(region.x, region.y, region.w, region.h);
  ctx.translate(region.x - x0 * sc, region.y - y0 * sc); ctx.scale(sc, sc);
  if (bg) ctx.drawImage(bg, 0, 0, BOARD_W, BOARD_H);
  else {
    ctx.fillStyle = "#C5D2E8";
    for (let gx = Math.ceil(x0 / 48) * 48; gx < x1; gx += 48)
      for (let gy = Math.ceil(y0 / 48) * 48; gy < y1; gy += 48) ctx.fillRect(gx - 1.5, gy - 1.5, 3, 3);
  }
  for (let i = 0; i < vis.length; i++) {
    const c = vis[i], r = rects[i];
    const rot = c.pos && c.pos.r != null ? c.pos.r : (hash(keyOf(c)) % 5) - 2;
    const bmp = await bitmapOf(c);
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(rad(rot)); ctx.translate(-r.w / 2, -r.h / 2);
    drawNote(ctx, c, bmp, { w: r.w, h: r.h });
    ctx.restore();
    if (bmp && bmp.close) bmp.close();
    if (onProgress && (i % 10 === 0 || i === vis.length - 1)) onProgress(i + 1, vis.length);
  }
  ctx.restore();
  if (bannerH) drawBanner(ctx, W, bannerH, vis.length);
  if (footH) drawFooter(ctx, W, H, footH, handle);
  return cv;
}

// 1080x1080 "ready to post" image: the note large on the cork
export async function renderPostImage(card, bgId) {
  await ensureFont();
  const bg = await loadBg(bgId), z = (BGS[bgId] || BGS.plain).zone;
  const S = 1080, cv = document.createElement("canvas");
  cv.width = S; cv.height = S;
  const ctx = cv.getContext("2d");
  if (bg) { const k = bg.width / BOARD_W, side = z.hh * 1.5; ctx.drawImage(bg, (z.cx - side / 2) * k, (z.cy + z.hh * 0.12 - side / 2) * k, side * k, side * k, 0, 0, S, S); }
  else { ctx.fillStyle = "#F5F8FC"; ctx.fillRect(0, 0, S, S); }
  const bmp = await bitmapOf(card);
  const { w, h } = dims(card.meta);
  const k = Math.min(680 / w, 680 / h);
  const rot = card.pos && card.pos.r != null ? card.pos.r : 0;
  ctx.save();
  ctx.translate(S / 2, S / 2 - 30); ctx.rotate(rad(rot)); ctx.scale(k, k); ctx.translate(-w / 2, -h / 2);
  drawNote(ctx, card, bmp, { w, h });
  ctx.restore();
  ctx.fillStyle = "rgba(20,40,75,.92)"; ctx.fillRect(0, S - 96, S, 96);
  ctx.fillStyle = "#FFC857"; ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.font = `800 40px ${UI}`;
  ctx.fillText("#M3P2026 · Bioinformatics Club UKM FST", S / 2, S - 48);
  if (bmp && bmp.close) bmp.close();
  return cv;
}
