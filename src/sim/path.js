// Shopper pathfinding. One flood fill from the tills gives every tile its walking distance to
// the nearest till; shoppers simply step to the neighbour with the smallest number.
// There are three such maps, because some shoppers get through things others cannot:
//   NORMAL  most shoppers: belts, machines and crates all block
//   HOP     dads: they step over conveyor belts
//   SMASH   gym bros: they walk through crate stacks (and wreck them)
import { W, H, DIRS, BUILD, SHOPPERS } from './constants.js';

export const UNREACHABLE = 65535;
export const NORMAL = 0, HOP = 1, SMASH = 2;

const cache = new WeakMap();

/** Which map a kind of shopper walks by. */
export function modeOf(kind) {
  const def = SHOPPERS[kind];
  return def.hopsBelts ? HOP : def.smashes ? SMASH : NORMAL;
}

/**
 * True if a shopper can stand on this tile.
 * @param {number} [mode] NORMAL, HOP or SMASH
 */
export function walkable(state, i, mode = NORMAL) {
  if (state.tiles[i] === '#') return false;
  const b = state.grid[i];
  if (!b || !BUILD[b.k].blocks) return true;
  return (mode === HOP && b.k === 'belt') || (mode === SMASH && b.k === 'crate');
}

/**
 * Distance in tiles from every tile to the nearest till.
 * @param {number} extraBlocked a tile index to treat as blocked (to test a placement), or -1
 * @param {number} [mode] NORMAL, HOP or SMASH
 * @returns {Uint16Array}
 */
export function computeDist(state, extraBlocked = -1, mode = NORMAL) {
  const dist = new Uint16Array(W * H).fill(UNREACHABLE);
  const queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  for (let i = 0; i < W * H; i++) {
    if (state.tiles[i] === 'T') { dist[i] = 0; queue[tail++] = i; }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % W, y = (i / W) | 0, d = dist[i] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (dist[n] !== UNREACHABLE || n === extraBlocked || !walkable(state, n, mode)) continue;
      dist[n] = d;
      queue[tail++] = n;
    }
  }
  return dist;
}

/**
 * The distance map for the current layout, worked out only when the layout changes.
 * @param {number} [mode] NORMAL, HOP or SMASH
 */
export function getField(state, mode = NORMAL) {
  let hit = cache.get(state);
  if (!hit || hit.ver !== state.gridVer) {
    hit = { ver: state.gridVer, fields: [null, null, null] };
    cache.set(state, hit);
  }
  return (hit.fields[mode] ||= computeDist(state, -1, mode));
}

/** The map most shoppers walk by. */
export const getDist = (state) => getField(state, NORMAL);
/** The map for dads, who step over belts. */
export const getHopDist = (state) => getField(state, HOP);
