import { posOf, overlapCount, findFree } from "./board.js";
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
  const placed = all.filter((c) => !c.deleted).map(posOf);
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
    let p = posOf(rest);
    if (!rest.deleted && overlapCount(p, placed) > 0) p = findFree(placed, p);
    if (!rest.deleted) placed.push(p);
    await addCard({ ...rest, pos: { x: p.x, y: p.y, r: (rest.pos && rest.pos.r) || 0 } });
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
