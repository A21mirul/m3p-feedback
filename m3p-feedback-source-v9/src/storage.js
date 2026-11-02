import { rectOf, overlapCount, findFree, bgIdForPage } from "./board.js";
// Tiny IndexedDB wrapper. Cards are stored as { id, createdAt, blob, meta }.
const DB = "m3p-feedback";
const STORE = "cards";

function open() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => res(r.result);
    t.onerror = () => rej(t.error);
  });
}
export const addCard = (card) => tx("readwrite", (s) => s.add(card));
export const allCards = () => tx("readonly", (s) => s.getAll());
export const deleteCard = (id) => tx("readwrite", (s) => s.delete(id));
export const clearCards = () => tx("readwrite", (s) => s.clear());
export const countCards = () => tx("readonly", (s) => s.count());

export function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export const putCard = (card) => tx("readwrite", (s) => s.put(card));
// merge cards from another laptop's bundle; skips ones we already have (matched by uid)
// merge cards from another laptop's bundle: new uids are added (nudged off overlaps),
// known uids are replaced only when the incoming copy is newer (updatedAt)
export async function importCards(list) {
  const all = await allCards();
  const byUid = new Map(all.filter((c) => c.uid).map((c) => [c.uid, c]));
  const placed = new Map(); // page -> rectangles already on it
  const on = (pg) => { if (!placed.has(pg)) placed.set(pg, []); return placed.get(pg); };
  for (const c of all) if (!c.deleted) { const pg = c.page || 1; on(pg).push(rectOf(c, bgIdForPage(pg))); }
  const ts = (c) => c.updatedAt || c.createdAt || 0;
  let added = 0, updated = 0;
  for (const c of list) {
    if (!c.uid) continue;
    const { id, ...rest } = c;
    const have = byUid.get(c.uid);
    if (have) {
      if (ts(rest) > ts(have)) { await putCard({ ...rest, id: have.id }); byUid.set(c.uid, rest); updated++; }
      continue;
    }
    const pg = rest.page || 1, bg = bgIdForPage(pg);
    let r = rectOf(rest, bg);
    if (!rest.deleted) {
      const L = on(pg);
      if (overlapCount(r, L) > 0) { const p = findFree(L, r, { w: r.w, h: r.h }, bg); r = { ...r, x: p.x, y: p.y }; } // nudge off overlaps
      L.push(r);
    }
    await addCard({ ...rest, page: pg, pos: { x: r.x, y: r.y, r: (rest.pos && rest.pos.r) || 0 } });
    byUid.set(c.uid, rest);
    added++;
  }
  return { added, updated };
}

// permanent delete keeps a tiny tombstone so a stale copy on another laptop can't bring the card back
export const purgeCard = (c) => c.uid
  ? putCard({ id: c.id, uid: c.uid, laptop: c.laptop, createdAt: c.createdAt, updatedAt: Date.now(), hidden: true, deleted: true, purged: true })
  : deleteCard(c.id);
export async function tombstoneAll() { for (const c of await allCards()) await purgeCard(c); }
