// Razor Wire (0.4): the one thing that stops a dad. Dads walk straight through every building; only
// the store's walls and live wire stop them (docs/architecture.md, "Razor Wire and dads").
//
// A security building (one with Dumbwaiters, BUILD[k].lift) may be given a wire direction `b.wd`
// (0 to 3, as DIRS; absent for none) with the `wire` command. Its wire covers the building's own
// tiles and a strip BACK.wireReach tiles long beyond its edge that way, as wide as that side of
// the building, each line of the strip stopping at the first wall and at the edge of the map. The
// wire is live while the building holds any Razor Wire (`b.s.wire`) and planned otherwise. Live
// wire stops dads on every tile it covers, open floor included; nobody else notices it.
//
// Which tiles are under wire is worked out from the layout and cached against state.gridVer, like
// the path maps, never stored in the state. So everything that changes it moves gridVer on: the
// wire command, a building put down, taken away, wrecked or turned, and a wire going live or dead
// (addStock and stealStock in back.js, useWire below).
import { BUILD, BACK, DIRS } from './constants.js';
import { footprint, anchorOf } from './state.js';
import { useStock } from './back.js';

/** True if a building of this kind can carry Razor Wire: it has Dumbwaiters (not a Crate Stack). */
export const carriesWire = (k) => !!(BUILD[k] && BUILD[k].lift && !BUILD[k].back);

/** True if building b's wire is live: it has a direction and holds Razor Wire. */
export const wireLive = (b) => !!(b && b.wd !== undefined && b.s && b.s.wire);

/**
 * The tiles a building's wire covers, given its footprint (`tiles`, from footprint() or tilesOf())
 * and a direction `wd`: the footprint itself, then from every tile on the side facing `wd` a line of
 * up to BACK.wireReach tiles outward, stopping before the first wall ('#') and at the map's edge.
 * @returns {number[]}
 */
export function wireCovers(state, tiles, wd) {
  const out = tiles.slice();
  if (!(wd >= 0 && wd <= 3)) return out;
  const W = state.w, H = state.h, [dx, dy] = DIRS[wd];
  const mine = new Set(tiles);
  for (const t of tiles) {
    let x = t % W, y = (t / W) | 0;
    // Only a tile on the edge facing that way starts a line (its neighbour that way is not its own).
    if (mine.has((y + dy) * W + x + dx) && x + dx >= 0 && x + dx < W) continue;
    for (let n = 0; n < BACK.wireReach; n++) {
      x += dx; y += dy;
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      const i = y * W + x;
      if (state.tiles[i] === '#') break;
      out.push(i);
    }
  }
  return out;
}

/**
 * The tiles the wire of the building on any tile (x, y) would cover in direction d (0 to 3), or by
 * default its own direction (none: just its footprint). For the interface, to draw a wire before the
 * command is sent. Empty if no building there can carry wire.
 * @returns {number[]}
 */
export function wireTiles(state, x, y, d) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= state.w || y >= state.h) return [];
  const ai = anchorOf(state, y * state.w + x), b = state.grid[ai];
  if (!b || !carriesWire(b.k)) return [];
  return wireCovers(state, buildingTiles(state, ai, b), d === undefined ? b.wd : d);
}

/** A standing building's footprint (anchor first), as footprint() gives it. */
export function buildingTiles(state, ai, b = state.grid[ai]) {
  return footprint(state, b.k, ai % state.w, (ai / state.w) | 0, b.d | 0) || [ai];
}

const cache = new WeakMap();

/**
 * Where the wire is, for the current layout (cached against gridVer; never stored in the state):
 *   live  Int32Array: per tile, the anchor of the building whose live wire covers it (the lowest
 *         anchor index if several), or -1
 *   plan  Uint16Array: per tile, how many buildings' wire covers it, live or planned
 * Read-only: callers must not change them.
 * @returns {{live: Int32Array, plan: Uint16Array}}
 */
export function wireMap(state) {
  const hit = cache.get(state);
  if (hit && hit.ver === state.gridVer && hit.n === state.grid.length) return hit;
  const n = state.grid.length, g = state.grid;
  const live = new Int32Array(n).fill(-1), plan = new Uint16Array(n);
  for (let ai = 0; ai < n; ai++) {
    const b = g[ai];
    if (!b || b.part !== undefined || b.wd === undefined || !carriesWire(b.k)) continue;
    const on = wireLive(b);
    for (const t of wireCovers(state, buildingTiles(state, ai, b), b.wd)) {
      plan[t]++;
      // (Anchors are visited in order, so the first to claim a tile is the lowest.)
      if (on && live[t] < 0) live[t] = ai;
    }
  }
  const out = { ver: state.gridVer, n, live, plan };
  cache.set(state, out);
  return out;
}

/**
 * The planned-wire counts as they would be if the building on anchor ai had its wire covering
 * `now` instead of what it covers today (`was`, empty if it has no wire). A fresh array: the
 * command's check floods it (dadPlanCheck in path.js) without touching the cache.
 */
export function planWith(state, was, now) {
  const plan = Uint16Array.from(wireMap(state).plan);
  for (const t of was) plan[t]--;
  for (const t of now) plan[t]++;
  return plan;
}

/**
 * Some building's wire has been laid differently: a `wire` command changed a direction, or a
 * building with wire was removed, wrecked or rebuilt with it. state.wireGen (absent reads as 0)
 * goes up, and every dad forgets which wires have charged him and that he was going round (dadMove
 * in step.js): flipping wire about to stall dads costs wire each time, and a wire built where an
 * old one stood cannot be skipped because the old one charged him.
 */
export function wireChanged(state) {
  state.wireGen = (state.wireGen | 0) + 1;
}

/**
 * A dad has been turned away by the live wire of the building on anchor ai (see the use rule in
 * step.js): one use of its Razor Wire. Spending the last use makes the wire planned again: gridVer
 * moves on so the dads' map is worked out again, and useStock sends `stockOut` with track 'wire'.
 */
export function useWire(state, ai, ev) {
  const b = state.grid[ai];
  if (!b || !b.s || !b.s.wire) return;
  useStock(b, 'wire', ai, ev);
  if (!b.s || !b.s.wire) state.gridVer++;
}
