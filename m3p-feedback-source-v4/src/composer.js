import { THEME as C, STR } from "./i18n.js";

export const CARD_W = 1080;
export const CARD_H = 1350;
const FONT = '"Trebuchet MS","Segoe UI",Nunito,Arial,sans-serif';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      let w = word;
      // break very long words by characters
      while (ctx.measureText(w).width > maxW) {
        let i = w.length;
        while (i > 1 && ctx.measureText(w.slice(0, i)).width > maxW) i--;
        if (line) { lines.push(line); line = ""; }
        lines.push(w.slice(0, i));
        w = w.slice(i);
      }
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width <= maxW) line = test;
      else { lines.push(line); line = w; }
    }
    lines.push(line);
  }
  return lines;
}

function fitText(ctx, text, maxW, maxH, maxSize = 46, minSize = 22) {
  for (let s = maxSize; s >= minSize; s -= 2) {
    ctx.font = `600 ${s}px ${FONT}`;
    const lines = wrap(ctx, text, maxW);
    if (lines.length * s * 1.25 <= maxH) return { size: s, lines };
  }
  ctx.font = `600 ${minSize}px ${FONT}`;
  const max = Math.floor(maxH / (minSize * 1.25));
  const lines = wrap(ctx, text, maxW).slice(0, max);
  if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/.{0,2}$/, "…");
  return { size: minSize, lines };
}

function stamp(ctx, label, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-10 * Math.PI) / 180);
  ctx.font = `800 30px ${FONT}`;
  const tw = ctx.measureText(label).width;
  const w = tw + 110, h = 86;
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = C.yellow;
  rr(ctx, -w / 2, -h / 2, w, h, 16);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = C.navy;
  ctx.stroke();
  // check mark
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const kx = -w / 2 + 44;
  ctx.beginPath();
  ctx.moveTo(kx - 16, 2);
  ctx.lineTo(kx - 4, 15);
  ctx.lineTo(kx + 18, -14);
  ctx.stroke();
  ctx.fillStyle = C.navy;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, -w / 2 + 78, 2);
  ctx.restore();
}

/**
 * Compose the feedback card at 1080x1350 (times `scale`).
 * data: { lang, text, nickname, visitor, reactions[], other, consent, number, dateStr, handle, drawing (ImageBitmap|HTMLCanvasElement|null) }
 */
export function composeCard(data, scale = 1) {
  const t = STR[data.lang];
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * scale;
  canvas.height = CARD_H * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.textBaseline = "alphabetic";

  // background
  ctx.fillStyle = C.white;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  // faint dot grid
  ctx.fillStyle = "rgba(47,95,168,0.07)";
  for (let y = 20; y < CARD_H; y += 36) for (let x = 20; x < CARD_W; x += 36) ctx.fillRect(x, y, 3, 3);

  // header
  ctx.fillStyle = C.blue;
  ctx.fillRect(0, 0, CARD_W, 170);
  ctx.fillStyle = C.white;
  ctx.textAlign = "left";
  ctx.font = `800 58px ${FONT}`;
  ctx.fillText(t.title, 56, 86);
  ctx.font = `500 28px ${FONT}`;
  ctx.fillStyle = "#CFE3FF";
  ctx.fillText(t.subtitle, 56, 134);
  // M3P pill
  ctx.fillStyle = C.yellow;
  rr(ctx, 850, 40, 174, 56, 28);
  ctx.fill();
  ctx.fillStyle = C.navy;
  ctx.font = `800 30px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("M3P 2026", 937, 78);

  // conveyor strip
  ctx.fillStyle = C.navy;
  ctx.fillRect(0, 170, CARD_W, 44);
  ctx.strokeStyle = C.teal;
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 12]);
  ctx.beginPath();
  ctx.moveTo(30, 192);
  ctx.lineTo(CARD_W - 30, 192);
  ctx.stroke();
  ctx.setLineDash([]);
  [0.12, 0.37, 0.63, 0.88].forEach((p, i) => {
    ctx.fillStyle = i === 3 ? C.yellow : C.teal;
    ctx.beginPath();
    ctx.arc(CARD_W * p, 192, 13, 0, Math.PI * 2);
    ctx.fill();
  });

  // drawing zone
  const zx = 60, zy = 240, zw = 960, zh = 670;
  ctx.save();
  ctx.shadowColor = "rgba(20,40,75,0.18)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#fff";
  rr(ctx, zx, zy, zw, zh, 24);
  ctx.fill();
  ctx.restore();
  if (data.drawing) {
    const iw = data.drawing.width, ih = data.drawing.height;
    const pad = 16;
    const r = Math.min((zw - pad * 2) / iw, (zh - pad * 2) / ih);
    const dw = iw * r, dh = ih * r;
    ctx.save();
    rr(ctx, zx, zy, zw, zh, 24);
    ctx.clip();
    ctx.drawImage(data.drawing, zx + (zw - dw) / 2, zy + (zh - dh) / 2, dw, dh);
    ctx.restore();
  }
  ctx.lineWidth = 6;
  ctx.strokeStyle = C.navy;
  rr(ctx, zx, zy, zw, zh, 24);
  ctx.stroke();
  stamp(ctx, t.approved, zx + zw - 320, zy + zh - 70);

  // feedback box
  const bx = 60, by = 945, bw = 960, bh = 200;
  ctx.fillStyle = "#fff";
  rr(ctx, bx, by, bw, bh, 20);
  ctx.fill();
  ctx.fillStyle = C.teal;
  rr(ctx, bx, by, 14, bh, 7);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(20,40,75,0.25)";
  rr(ctx, bx, by, bw, bh, 20);
  ctx.stroke();

  const text = (data.text || "").trim() || t.noText;
  const nick = (data.nickname || "").trim() || t.anon;
  const who = data.visitor ? `${nick} · ${data.visitor}` : nick;
  const fit = fitText(ctx, text, bw - 70, bh - 62);
  ctx.fillStyle = C.navy;
  ctx.textAlign = "left";
  ctx.font = `600 ${fit.size}px ${FONT}`;
  fit.lines.forEach((ln, i) => ctx.fillText(ln, bx + 40, by + 14 + fit.size + i * fit.size * 1.25));
  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = C.blue;
  ctx.textAlign = "right";
  let whoTxt = who;
  while (ctx.measureText("— " + whoTxt).width > bw - 70 && whoTxt.length > 4) whoTxt = whoTxt.slice(0, -2);
  ctx.fillText("— " + whoTxt, bx + bw - 28, by + bh - 16);

  // reaction badges
  const reacts = (data.reactions || []).map((i) => t.react[i]).filter(Boolean);
  if ((data.other || "").trim()) reacts.push(data.other.trim().slice(0, 24));
  ctx.textAlign = "left";
  ctx.font = `700 24px ${FONT}`;
  let px = bx, py = 1165;
  const colours = [C.teal, C.blue, C.coral, C.yellow, C.teal, C.blue];
  reacts.forEach((r, i) => {
    const w = ctx.measureText(r).width + 40;
    if (px + w > bx + bw) { px = bx; py += 48; }
    if (py > 1212) return;
    ctx.fillStyle = colours[i % colours.length];
    rr(ctx, px, py, w, 40, 20);
    ctx.fill();
    ctx.fillStyle = colours[i % colours.length] === C.yellow || colours[i % colours.length] === C.teal ? C.navy : "#fff";
    ctx.fillText(r, px + 20, py + 28);
    px += w + 12;
  });

  // footer
  ctx.fillStyle = C.navy;
  ctx.fillRect(0, 1250, CARD_W, 100);
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(t.footer1, 40, 1290);
  ctx.fillStyle = "#CFE3FF";
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(t.footer2, 40, 1324);
  ctx.textAlign = "center";
  ctx.fillStyle = C.teal;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(t.footer3, 600, 1290);
  ctx.fillStyle = "#CFE3FF";
  ctx.font = `500 20px ${FONT}`;
  const num = String(data.number || 0).padStart(3, "0");
  ctx.fillText(`${t.cardNo} #${num} ${t.processed} · ${data.dateStr || ""}`, 600, 1324);
  ctx.textAlign = "right";
  ctx.fillStyle = C.yellow;
  ctx.font = `800 26px ${FONT}`;
  ctx.fillText("#M3P2026", CARD_W - 40, 1290);
  ctx.fillStyle = "#CFE3FF";
  ctx.font = `500 20px ${FONT}`;
  const tag = data.handle ? `${t.tag} ${data.handle}` : data.consent ? t.shared : "";
  ctx.fillText(tag, CARD_W - 40, 1324);
  if (data.handle && data.consent) {
    ctx.font = `500 16px ${FONT}`;
    ctx.fillText(t.shared, CARD_W - 40, 1342);
  }
  return canvas;
}

/** Fit the standard card into another export size (contain, themed background). */
export function composeSized(data, w, h, scale = 1) {
  const card = composeCard(data, scale);
  if (w === CARD_W && h === CARD_H) return card;
  const out = document.createElement("canvas");
  out.width = w * scale;
  out.height = h * scale;
  const ctx = out.getContext("2d");
  ctx.fillStyle = C.navy;
  ctx.fillRect(0, 0, out.width, out.height);
  const r = Math.min(out.width / card.width, out.height / card.height);
  const dw = card.width * r, dh = card.height * r;
  ctx.drawImage(card, (out.width - dw) / 2, (out.height - dh) / 2, dw, dh);
  return out;
}

export const canvasToBlob = (canvas, type = "image/png", q = 0.92) =>
  new Promise((res) => canvas.toBlob(res, type, q));
