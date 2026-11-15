// Shopper pathfinding. One flood fill from the tills gives every tile its walking distance to
// the nearest till; shoppers simply step to the neighbour with the smallest number.
import { W, H, DIRS, BUILD } from './constants.js';

export const UNREACHABLE = 65535;

const cache = new WeakMap();

/** True if a shopper can stand on this tile. */
export function walkable(state, i) {
  if (state.tiles[i] === '#') return false;
  const b = state.grid[i];
  return !(b && BUILD[b.k].blocks);
}

/**
 * Distance in tiles from every tile to the nearest till.
 * @param {number} extraBlocked a tile index to treat as blocked (to test a placement), or -1
 * @returns {Uint16Array}
 */
export function computeDist(state, extraBlocked = -1) {
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
      if (dist[n] !== UNREACHABLE || n === extraBlocked || !walkable(state, n)) continue;
      dist[n] = d;
      queue[tail++] = n;
    }
  }
  return dist;
}

/** The distance field for the current layout, recomputed only when the layout changes. */
export function getDist(state) {
  const hit = cache.get(state);
  if (hit && hit.ver === state.gridVer) return hit.dist;
  const dist = computeDist(state);
  cache.set(state, { ver: state.gridVer, dist });
  return dist;
}
