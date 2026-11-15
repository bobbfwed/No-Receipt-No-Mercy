// Shopper pathfinding. One flood fill from the tills gives every tile its walking distance to
// the nearest till; shoppers simply step to the neighbour with the smallest number.
// There are two such maps: the normal one, and one for dads, who step over conveyor belts.
import { W, H, DIRS, BUILD } from './constants.js';

export const UNREACHABLE = 65535;

const cache = new WeakMap();

/**
 * True if a shopper can stand on this tile.
 * @param {boolean} [hops] true for a shopper who steps over belts (a dad)
 */
export function walkable(state, i, hops = false) {
  if (state.tiles[i] === '#') return false;
  const b = state.grid[i];
  if (!b || !BUILD[b.k].blocks) return true;
  return hops && b.k === 'belt';
}

/**
 * Distance in tiles from every tile to the nearest till.
 * @param {number} extraBlocked a tile index to treat as blocked (to test a placement), or -1
 * @param {boolean} [hops] compute the map for shoppers who step over belts
 * @returns {Uint16Array}
 */
export function computeDist(state, extraBlocked = -1, hops = false) {
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
      if (dist[n] !== UNREACHABLE || n === extraBlocked || !walkable(state, n, hops)) continue;
      dist[n] = d;
      queue[tail++] = n;
    }
  }
  return dist;
}

function cached(state) {
  let hit = cache.get(state);
  if (!hit || hit.ver !== state.gridVer) {
    hit = { ver: state.gridVer, dist: computeDist(state), hop: null };
    cache.set(state, hit);
  }
  return hit;
}

/** The distance map for the current layout, recomputed only when the layout changes. */
export function getDist(state) {
  return cached(state).dist;
}

/** The distance map for dads, who step over belts. */
export function getHopDist(state) {
  const hit = cached(state);
  return (hit.hop ||= computeDist(state, -1, true));
}
