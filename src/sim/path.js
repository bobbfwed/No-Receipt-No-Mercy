// Shopper pathfinding. One flood fill from the tills gives every tile its walking distance to
// the nearest till; shoppers simply step to the neighbour with the smallest number.
// There are four such maps, because some shoppers get through things others cannot:
//   NORMAL  most shoppers: belts, machines and crates all block
//   HOP     dads: they step over conveyor belts
//   SMASH   gym bros: they walk through crate stacks (and wreck them)
//   GHOST   runaway children: only the store's own walls stop them
import { DIRS, BUILD, SHOPPERS } from './constants.js';

export const UNREACHABLE = 65535;
export const NORMAL = 0, HOP = 1, SMASH = 2, GHOST = 3;

const cache = new WeakMap();

/** Which map a kind of shopper walks by. */
export function modeOf(kind) {
  // (The boss is not in SHOPPERS; he walks like anyone else.)
  const def = SHOPPERS[kind];
  if (!def) return NORMAL;
  return def.hopsBelts ? HOP : def.smashes ? SMASH : NORMAL;
}

/**
 * True if a shopper can stand on this tile.
 * @param {number} [mode] NORMAL, HOP, SMASH or GHOST
 */
export function walkable(state, i, mode = NORMAL) {
  // (A shut entrance counts as floor, so the check that the maze leaves every entrance a way
  // to the tills covers the ones that have not opened yet.)
  if (state.tiles[i] === '#') return false;
  if (mode === GHOST) return true;
  const b = state.grid[i];
  if (!b || !BUILD[b.k].blocks) return true;
  return (mode === HOP && b.k === 'belt') || (mode === SMASH && b.k === 'crate');
}

/**
 * Flood fill: the walking distance from every tile to the nearest of some starting tiles.
 * @param {(i: number) => boolean} isStart
 */
function flood(state, isStart, extraBlocked, mode) {
  const W = state.w, H = state.h, n = W * H;
  const dist = new Uint16Array(n).fill(UNREACHABLE);
  const queue = new Int32Array(n);
  // A building bigger than one tile is tested by blocking all of its tiles at once.
  const many = Array.isArray(extraBlocked) ? new Set(extraBlocked) : null;
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) {
    if (isStart(i)) { dist[i] = 0; queue[tail++] = i; }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % W, y = (i / W) | 0, d = dist[i] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const t = ny * W + nx;
      if (dist[t] !== UNREACHABLE || t === extraBlocked || (many && many.has(t)) || !walkable(state, t, mode)) continue;
      dist[t] = d;
      queue[tail++] = t;
    }
  }
  return dist;
}

/**
 * Distance in tiles from every tile to the nearest till.
 * @param {number|number[]} extraBlocked a tile index, or a list of them, to treat as blocked (to
 *   test a placement), or -1
 * @param {number} [mode] NORMAL, HOP, SMASH or GHOST
 * @returns {Uint16Array}
 */
export function computeDist(state, extraBlocked = -1, mode = NORMAL) {
  const tiles = state.tiles;
  return flood(state, (i) => tiles[i] === 'T', extraBlocked, mode);
}

const bankCache = new WeakMap();

/**
 * The banks of tills: each run of till tiles side by side along a wall, as a list of tile
 * indexes. Most stores have one bank; the car park has two, on different walls.
 * @returns {number[][]}
 */
export function tillBanks(state) {
  const hit = bankCache.get(state);
  if (hit && hit.tiles === state.tiles) return hit.banks;
  const W = state.w, tiles = state.tiles;
  const banks = [], bankOf = new Map();
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== 'T') continue;
    // A till joins the bank of the till to its left or above it, if there is one.
    const near = i % W && tiles[i - 1] === 'T' ? i - 1 : tiles[i - W] === 'T' ? i - W : -1;
    const bank = near < 0 ? banks[banks.push([]) - 1] : bankOf.get(near);
    bank.push(i);
    bankOf.set(i, bank);
  }
  bankCache.set(state, { tiles, banks });
  return banks;
}

/**
 * True if every bank of tills can still be walked to from the first one, so that (as every
 * entrance has a way to some till) every entrance has a way to every bank. Only matters on a
 * store with more than one bank.
 * @param {number|number[]} [extraBlocked] tiles to treat as blocked, as for computeDist
 */
export function banksOpen(state, extraBlocked = -1) {
  const banks = tillBanks(state);
  if (banks.length < 2) return true;
  const first = new Set(banks[0]);
  const dist = flood(state, (i) => first.has(i), extraBlocked, NORMAL);
  return banks.every((bank) => bank.some((t) => dist[t] !== UNREACHABLE));
}

function cacheOf(state) {
  let hit = cache.get(state);
  if (!hit || hit.ver !== state.gridVer) {
    hit = { ver: state.gridVer, fields: [null, null, null, null], to: new Map() };
    cache.set(state, hit);
  }
  return hit;
}

/**
 * The distance map for the current layout, worked out only when the layout changes.
 * @param {number} [mode] NORMAL, HOP, SMASH or GHOST
 */
export function getField(state, mode = NORMAL) {
  const hit = cacheOf(state);
  return (hit.fields[mode] ||= computeDist(state, -1, mode));
}

/**
 * Walking distance (as most shoppers walk) from every tile to one tile. A mom uses it to run to
 * where her child is waiting.
 */
export function getFieldTo(state, tile) {
  const hit = cacheOf(state);
  let f = hit.to.get(tile);
  if (!f) {
    f = flood(state, (i) => i === tile, -1, NORMAL);
    hit.to.set(tile, f);
  }
  return f;
}

/** The map most shoppers walk by. */
export const getDist = (state) => getField(state, NORMAL);
/** The map for dads, who step over belts. */
export const getHopDist = (state) => getField(state, HOP);
