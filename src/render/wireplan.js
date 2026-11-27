// Razor Wire and the dads' routes as the floor shows them (0.4, stage 4b). Pure: no DOM and no
// canvas, so the tests read it too. Everything here is worked out from the layout and cached
// against state.gridVer (and, for a preview, the direction being tried), never every frame.
//
//   wireLayout(s)          every building with a wire direction: its footprint, the strip its wire
//                          covers beyond it, and whether the wire is live (it holds Razor Wire)
//   dadRoutes(s, preview)  per open entrance: the route shoppers walk, the route dads walk now
//                          (only stocked wire counts), and the stretches where dads would walk
//                          differently if every planned wire were stocked (the owner's two dad
//                          lines). With a preview ({x, y, d}: a building and a wire direction being
//                          tried in the sheet's picker or with the Wire tool), as they would be
//                          with that wire.
//   diffRuns(plan, live)   the stretches of one route that leave another, for the second dad line
//
// How a dad walks is the rules' business: both dad lines come from the rules' dadRoute (path.js:
// a dad heads the way he would with no wire, bumps into live wire, and only then goes round it).
// A preview is a wire the rules have not been told about, so its routes come from dadRoute on a
// copy of the state with that one building's direction changed (withWire); the real state is never
// touched.
import {
  BUILD, DIRS, UNREACHABLE, DAD, DADPLAN, getField, getDist, dadRoute, wireCovers, carriesWire, footprint,
  sizeOf, anchorOf,
} from '../sim/index.js';

/** The labels on the routes. */
export const SHOPPER_LABEL = 'SHOPPER ROUTE';
export const DAD_LABEL = 'DADS';
export const DAD_PLAN_LABEL = 'DADS, IF WIRED';

/** A standing building's footprint, anchor first. */
const footOf = (s, ai, b) => footprint(s, b.k, ai % s.w, (ai / s.w) | 0, b.d | 0) || [ai];

const layoutCache = new WeakMap();

/**
 * Every building with a wire direction, for drawing: { ai, d, live, x, y, w, h, strip }, where x, y,
 * w, h are its footprint in tiles and `strip` the tiles its wire covers beyond the footprint, in the
 * order wireCovers gives them (line by line outward). `live`: it holds Razor Wire, so the wire works.
 * Cached against gridVer, which the rules move on whenever wire is laid, taken away, or goes live or
 * dead. Read-only.
 */
export function wireLayout(s) {
  const hit = layoutCache.get(s);
  if (hit && hit.ver === s.gridVer && hit.n === s.grid.length) return hit.list;
  const list = [];
  const g = s.grid;
  for (let ai = 0; ai < g.length; ai++) {
    const b = g[ai];
    if (!b || b.part !== undefined || b.wd === undefined || !carriesWire(b.k)) continue;
    const foot = footOf(s, ai, b);
    const [w, h] = sizeOf(b.k, BUILD[b.k].rot ? b.d | 0 : 0);
    list.push({
      ai, d: b.wd, live: !!(b.s && b.s.wire), x: ai % s.w, y: (ai / s.w) | 0, w, h,
      strip: wireCovers(s, foot, b.wd).slice(foot.length),
    });
  }
  layoutCache.set(s, { ver: s.gridVer, n: g.length, list });
  return list;
}

/**
 * The building a preview is for, and the direction tried: { ai, d }, or null if (x, y) has no
 * building that can carry wire, or d is not -1 to 3.
 */
export function previewTarget(s, preview) {
  if (!preview || !s) return null;
  const { x, y, d } = preview;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= s.w || y >= s.h) return null;
  if (!Number.isInteger(d) || d < -1 || d > 3) return null;
  const ai = anchorOf(s, y * s.w + x), b = s.grid[ai];
  if (!b || !carriesWire(b.k)) return null;
  return { ai, d };
}

/**
 * A copy of the state in which the building on anchor `ai` has wire direction d (-1 none) and
 * nothing else differs: a new object with its own grid array and its own copy of that one
 * building, so the rules' caches (kept per state object) work it all out afresh for the copy and the
 * real state is untouched. For the routes of a wire direction being tried.
 */
export function withWire(s, ai, d) {
  const grid = s.grid.slice();
  const b = { ...grid[ai] };
  if (d >= 0 && d <= 3) b.wd = d; else delete b.wd;
  grid[ai] = b;
  return { ...s, grid };
}

/**
 * Follows a distance map downhill from a tile to a till, as shoppers do. Returns the tiles along
 * the way. Where two neighbours are equally good, one in `prefer` (a Set of tiles) wins, so a second
 * route drawn beside a first one only leaves it where it really has to.
 */
export function traceTiles(s, field, start, prefer = null) {
  const W = s.w, H = s.h;
  const out = [];
  let i = start;
  for (let guard = 0; guard < W * H; guard++) {
    out.push(i);
    if (field[i] === 0) break;
    let best = i, bd = field[i], liked = false;
    for (let k = 0; k < 4; k++) {
      const x = (i % W) + DIRS[k][0], y = ((i / W) | 0) + DIRS[k][1];
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const n = y * W + x, f = field[n];
      const on = !!prefer && prefer.has(n);
      if (f < bd || (f === bd && best !== i && on && !liked)) { bd = f; best = n; liked = on; }
    }
    if (best === i) break;
    i = best;
  }
  return out;
}

/** The tile of an entrance nearest the tills by a distance map, or -1. */
export function bestTile(door, field) {
  let best = -1;
  for (const i of door) if (field[i] !== UNREACHABLE && (best < 0 || field[i] < field[best])) best = i;
  return best;
}

/**
 * The stretches of route `plan` (tiles, door to till) that are not on route `live`, each with the
 * tile where it leaves `live` before it and the tile where it rejoins after it, so a stretch drawn
 * on its own joins the other line at both ends. Empty when `plan` never leaves `live`.
 * @returns {number[][]}
 */
export function diffRuns(plan, live) {
  const on = new Set(live);
  const runs = [];
  let cur = null;
  for (let k = 0; k < plan.length; k++) {
    const t = plan[k];
    if (!on.has(t)) {
      if (!cur) cur = k > 0 ? [plan[k - 1]] : [];
      cur.push(t);
    } else if (cur) {
      cur.push(t);
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);
  return runs;
}

/** Tiles as points in world pixels (tile centres), [x0, y0, x1, y1, ...], for drawing. */
export function toPoints(tiles, w, T) {
  const pts = new Array(tiles.length * 2);
  for (let k = 0; k < tiles.length; k++) {
    pts[2 * k] = ((tiles[k] % w) + 0.5) * T;
    pts[2 * k + 1] = (((tiles[k] / w) | 0) + 0.5) * T;
  }
  return pts;
}

const routeCache = new WeakMap(); // state -> { base: entry, prev: entry }

/**
 * The routes from every open entrance (the first one in a game that has not opened any):
 *   { normal: [tiles], dads: [{ live: [tiles], runs: [[tiles]], cut }] }
 * normal is the shoppers' route (empty if none); live the dads' route now; runs the stretches where
 * the dads' route with every planned wire stocked leaves it (diffRuns); cut: with that planned wire
 * this entrance would have no way to the tills (only a refused preview can do that). With
 * `preview` ({ x, y, d }), the dads' routes are as they would be with that wire direction.
 * Cached against gridVer, the map and the preview.
 */
export function dadRoutes(s, preview = null) {
  const target = previewTarget(s, preview);
  const key = target ? `${target.ai},${target.d}` : '';
  let c = routeCache.get(s);
  if (!c || c.ver !== s.gridVer || c.tiles !== s.tiles || c.open !== s.open) {
    c = { ver: s.gridVer, tiles: s.tiles, open: s.open, base: null, prev: null, prevKey: '' };
    routeCache.set(s, c);
  }
  if (!key) return (c.base ||= routesWith(s, null));
  if (c.prevKey !== key) { c.prev = routesWith(s, target); c.prevKey = key; }
  return c.prev;
}

function routesWith(s, target) {
  const dist = getDist(s);
  // A preview: the same questions asked of a copy with the direction tried (withWire).
  const st = target ? withWire(s, target.ai, target.d) : s;
  const live = getField(st, DAD), plan = getField(st, DADPLAN);
  const normal = [], dads = [];
  const doors = s.doors ? s.doors.slice(0, Math.max(1, s.open | 0)) : [];
  for (const door of doors) {
    if (s.tiles[door[0]] !== 'D') continue;
    const a = bestTile(door, dist);
    if (a >= 0) normal.push(traceTiles(s, dist, a));
    // Both lines start from the same entrance tile where they can, so they only part where the
    // wire makes them.
    const b = bestTile(door, live);
    if (b < 0) continue;
    const liveTiles = dadRoute(st, b, false);
    const p = plan[b] !== UNREACHABLE ? b : bestTile(door, plan);
    const planTiles = p >= 0 ? dadRoute(st, p, true) : null;
    dads.push({ live: liveTiles, runs: planTiles ? diffRuns(planTiles, liveTiles) : [], cut: !planTiles });
  }
  return { normal, dads };
}
