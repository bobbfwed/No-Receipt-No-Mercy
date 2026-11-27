// Supply lines in The Back for the scripted players of the perf tools (stutter investigation,
// 2026-11-26). Everything is laid through ordinary `place` commands with `f: 1`, so it can be sent
// by a client as well as applied on the host, and replays exactly on every copy.
import { DIRS } from '../../src/sim/index.js';

/** The machine for each upgrade track a security building takes. */
// (Duct Tape and its Tape Winder went in 0.4.01.)
export const MACHINE = { dmg: 'still', spd: 'cannery', rng: 'spooler', wire: 'bender' };

/** The facing (0 east, 1 south, 2 west, 3 north) that points from tile a to its neighbour b. */
export function facing(state, a, b) {
  const dx = (b % state.w) - (a % state.w), dy = ((b / state.w) | 0) - ((a / state.w) | 0);
  return DIRS.findIndex(([x, y]) => x === dx && y === dy);
}

/**
 * One supply line: from a Returns Drop to the nearest Dumbwaiter, by the shortest way over free
 * floor of The Back (a breadth-first search; never through another part or a wall). The tile in
 * front of the drop gets a belt, the next a machine making `track`'s supply, then belts to the
 * Dumbwaiter, the last one pointing into it. Null if there is no such way (or it is too short).
 * @param {number} dropIndex the drop's tile
 * @param {string} track 'dmg', 'spd', 'rng' or 'wire'
 * @param {Set<number>} [avoid] tiles not to lay on
 * @param {number} [target] the Dumbwaiter to reach (any tile of its building); left out, the nearest
 * @returns {{k, x, y, d, f}[] | null} place commands, in the order to send them
 */
export function chain(state, dropIndex, track = 'dmg', avoid = new Set(), target = -1) {
  const { w, h, back, tiles } = state;
  const drop = back[dropIndex];
  if (!drop || drop.k !== 'drop') return null;
  // (A drop deals out to all four sides since 0.4.01: the line starts on the first open one.)
  let start = -1;
  for (const [dx, dy] of DIRS) {
    const x = (dropIndex % w) + dx, y = ((dropIndex / w) | 0) + dy, t = y * w + x;
    if (x >= 0 && y >= 0 && x < w && y < h && !back[t] && tiles[t] !== '#' && !avoid.has(t)) { start = t; break; }
  }
  if (start < 0) return null;
  const from = new Int32Array(back.length).fill(-1);
  from[start] = start;
  const queue = [start];
  let goal = -1;
  for (let q = 0; q < queue.length && goal < 0; q++) {
    const i = queue[q], x = i % w, y = (i / w) | 0;
    for (const [ex, ey] of DIRS) {
      const nx = x + ex, ny = y + ey;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const t = ny * w + nx;
      if (from[t] !== -1 || tiles[t] === '#' || avoid.has(t)) continue;
      const p = back[t];
      if (p && p.k === 'lift' && q > 1 && (target < 0 || p.a === target)) { from[t] = i; goal = t; break; }
      if (p) continue;
      from[t] = i;
      queue.push(t);
    }
  }
  if (goal < 0) return null;
  const path = [];
  for (let t = from[goal]; ; t = from[t]) { path.unshift(t); if (t === start) break; }
  if (path.length < 3) return null;
  const out = [];
  for (let n = 0; n < path.length; n++) {
    const i = path[n], next = n + 1 < path.length ? path[n + 1] : goal;
    out.push({ c: 'place', k: n === 1 ? MACHINE[track] : 'conv', x: i % w, y: (i / w) | 0, d: facing(state, i, next), f: 1 });
  }
  return out;
}

/** Every Returns Drop's tile. */
export const drops = (state) => state.back.map((p, i) => (p && p.k === 'drop' ? i : -1)).filter((i) => i >= 0);
