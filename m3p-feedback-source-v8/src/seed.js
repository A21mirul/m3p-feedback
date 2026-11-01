// Staff-only: generate fake cards to test performance and exports. They carry test:true so they can be bulk-deleted.
import { addCard } from "./storage.js";
import { NOTE_W, NOTE_H, BOARD_W, BOARD_H, findFree } from "./board.js";
import { drawStrokes } from "./Replay.jsx";
import { canvasToBlob } from "./composer.js";

const TEXTS = ["Seronok betul game ni!", "Learned a lot about AMR today", "Nak tahu lebih lanjut pasal bioinformatik", "Cool booth, great explanation", "Mockup kilang tu kreatif", "Can't wait to join the club", "Terbaik! Teruskan usaha", "DNA sequencing is amazing", "Best sangat, thank you!", "Interesting pipeline from DNA to report", "Baru tahu bakteria boleh rintang antibiotik", "Fun and educational", "Nice drawing board idea", "Hebat la bioinformatik", "Great job team"];
const INK = ["#14284B", "#2F5FA8", "#2EC4B6", "#FF6B6B", "#E8A600"];
const STK = ["🧬", "🦠", "🔬", "⭐", "💡", "🚀"];
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

export async function seedCards(n, existingPos, onProgress) {
  const placed = existingPos.slice();
  const now = Date.now();
  for (let i = 0; i < n; i++) {
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
    const p = findFree(placed, { x: BOARD_W / 2 + rnd(-1600, 1600) - NOTE_W / 2, y: BOARD_H / 2 + rnd(-900, 900) - NOTE_H / 2 });
    placed.push(p);
    const t0 = now - (n - i) * 90000;
    const reactions = [...new Set(Array.from({ length: 1 + Math.floor(Math.random() * 2) }, () => Math.floor(Math.random() * 5)))];
    await addCard({
      uid: crypto.randomUUID ? crypto.randomUUID() : `t${now}-${i}`,
      laptop: "T", test: true, createdAt: t0, updatedAt: t0, hidden: false, deleted: false,
      drawingBlob, thumbBlob, strokes,
      pos: { x: p.x, y: p.y, r: [-4, 0, 4][i % 3] },
      meta: {
        lang: pick(["ms", "en"]), text: Math.random() < 0.9 ? pick(TEXTS) : "", nickname: `Ujian ${String(i + 1).padStart(3, "0")}`,
        visitor: "", reactions, other: "", number: i + 1, dateStr: "",
        color: Math.floor(Math.random() * 6), stickers: Math.random() < 0.5 ? [pick(STK)] : [],
      },
    });
    if (onProgress) onProgress(i + 1);
  }
}
