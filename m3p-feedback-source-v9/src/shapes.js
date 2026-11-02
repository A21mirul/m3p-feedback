// Card shapes and sizes, in board pixels. Shared by the wall, the renderer and the export.
export const SHAPES = ["square", "wide", "tall", "round"];
export const SIZE_KEYS = ["s", "m", "l"];
export const PAGE_CAP = 100; // a new wall page starts after this many cards
const D = {
  square: { s: [180, 180], m: [240, 240], l: [320, 320] },
  wide: { s: [240, 160], m: [320, 210], l: [420, 280] },
  tall: { s: [160, 240], m: [210, 320], l: [280, 420] },
  round: { s: [190, 190], m: [250, 250], l: [330, 330] },
};
export function dims(meta) {
  const m = meta || {};
  const d = (D[m.shape] || D.square)[m.size] || D.square.m;
  return { w: d[0], h: d[1] };
}
