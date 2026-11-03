// Staff-only: generate fake cards to test performance, pages and exports. They carry test:true so they can be bulk-deleted.
import { addCard } from "./storage.js";
import { BOARD_W, BOARD_H, findFree, BGS } from "./board.js";
import { dims, SHAPES, SIZE_KEYS, PAGE_CAP } from "./shapes.js";
import { PINS, STICKERS } from "./noteRender.js";
import { drawStrokes } from "./Replay.jsx";
import { canvasToBlob } from "./composer.js";

const TEXTS = ["Seronok betul game ni!", "Learned a lot about AMR today", "Nak tahu lebih lanjut pasal bioinformatik", "Cool booth, great explanation", "Mockup kilang tu kreatif", "Can't wait to join the club", "Terbaik! Teruskan usaha", "DNA sequencing is amazing", "Best sangat, thank you!", "Interesting pipeline from DNA to report", "Baru tahu bakteria boleh rintang antibiotik. Menarik sungguh, saya nak belajar lebih lanjut tentang bagaimana data genom digunakan untuk kesan gen rintangan.", "Fun and educational", "Nice drawing board idea", "Hebat la bioinformatik", "Great job team! I really enjoyed the game and the explanation of how a report is made from bacterial DNA."];
const TAGS = ["I learned something new!", "Saya suka permainan ni!", "Cool mockup!", "I want to know more!"];
const INK = ["#14284B", "#2F5FA8", "#2EC4B6", "#FF6B6B", "#E8A600"];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function fakeStrokes() {
  const w = 420, h = 300, s = [];
  const n = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const p = [];
    let x = rnd(30, w - 30), y = rnd(30, h - 30), a = rnd(0, 6.28);
    for (let j = 0; j < 40; j++) {
      a += rnd(-0.5, 0.5);
      x = Math.min(w - 10, Math.max(10, x + Math.cos(a) * 7));
      y = Math.min(h - 10, Math.max(10, y + Math.sin(a) * 7));
      p.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    }
    s.push({ c: pick(INK), k: pick([3, 5, 8]), p });
  }
  return { v: 1, w, h, s };
}

// existing: { page: [rects] }, bgFor(page) -> background id. Returns the highest page used.
export async function seedCards(n, existing, bgFor, onProgress) {
  const placed = {};
  Object.keys(existing).forEach((p) => { placed[p] = existing[p].slice(); });
  const now = Date.now();
  let maxPage = 1;
  for (let i = 0; i < n; i++) {
    let page = 1;
    while ((placed[page] || []).length >= PAGE_CAP) page++;
    maxPage = Math.max(maxPage, page);
    const strokes = Math.random() < 0.8 ? fakeStrokes() : null;
    let drawingBlob = null, thumbBlob = null;
    if (strokes) {
      const cv = document.createElement("canvas");
      cv.width = 840; cv.height = 600;
      drawStrokes(cv.getContext("2d"), strokes, 840, 600, 1);
      drawingBlob = await canvasToBlob(cv);
      const th = document.createElement("canvas");
      th.width = 400; th.height = 286;
      th.getContext("2d").drawImage(cv, 0, 0, 400, 286);
      thumbBlob = await canvasToBlob(th, "image/jpeg", 0.85);
    }
    const meta = {
      lang: pick(["ms", "en"]), text: Math.random() < 0.9 ? pick(TEXTS) : "", nickname: `Test ${String(i + 1).padStart(3, "0")}`,
      reactions: [...new Set(Array.from({ length: 1 + Math.floor(Math.random() * 2) }, () => Math.floor(Math.random() * 5)))],
      other: Math.random() < 0.2 ? "so cool!" : "", number: i + 1, dateStr: "",
      tags: Math.random() < 0.5 ? [pick(TAGS)].map((t) => ({ t, x: rnd(0.3, 0.7), y: rnd(0.5, 0.8), r: pick([-4, 0, 3]) })) : [],
      color: Math.floor(Math.random() * 6), pin: pick(PINS), shape: pick(SHAPES), size: pick(SIZE_KEYS), textScale: 1,
      stickers: Math.random() < 0.5 ? [pick(STICKERS)] : [], stickerSize: pick(["s", "m", "l"]),
    };
    const bgId = bgFor(page), sz = dims(meta), z = (BGS[bgId] || BGS.plain).zone;
    const list = placed[page] || (placed[page] = []);
    const p = findFree(list, { x: z.cx + rnd(-1500, 1500) - sz.w / 2, y: z.cy + rnd(-800, 800) - sz.h / 2 }, sz, bgId);
    list.push({ x: p.x, y: p.y, w: sz.w, h: sz.h });
    const t0 = now - (n - i) * 90000;
    await addCard({
      uid: crypto.randomUUID ? crypto.randomUUID() : `t${now}-${i}`,
      laptop: "T", test: true, page, createdAt: t0, updatedAt: t0, hidden: false, deleted: false,
      drawingBlob, thumbBlob, strokes, pos: { x: p.x, y: p.y, r: [-4, 0, 4][i % 3] }, meta,
    });
    if (onProgress) onProgress(i + 1);
  }
  return maxPage;
}
