// A ready-made warehouse layout. Used by tests, by the balance bot, and by the "?demo" page
// option so the game can be looked at without building anything by hand.
import { applyCommand } from './commands.js';
import { makeDrops } from './maps.js';
import { newDrop } from './back.js';

const E = 0, S = 1, W = 2, N = 3;

/** Two production lines that form walls with gaps, and security around the gaps. */
export const DEMO_LAYOUT = [
  // Line 1: a wall down column 6, open at the bottom.
  ['unpacker', 6, 1, S], ['belt', 6, 2, S], ['belt', 6, 3, S], ['belt', 6, 4, S], ['belt', 6, 5, S],
  ['press', 6, 6, S], ['belt', 6, 7, S], ['belt', 6, 8, S], ['packer', 6, 9, S], ['belt', 6, 10, S],
  ['chute', 6, 11, 0],
  // Line 2: a wall up column 13, open at the top.
  ['unpacker', 13, 14, N], ['belt', 13, 13, N], ['belt', 13, 12, N], ['belt', 13, 11, N], ['belt', 13, 10, N],
  ['press', 13, 9, N], ['belt', 13, 8, N], ['belt', 13, 7, N], ['packer', 13, 6, N], ['belt', 13, 5, N],
  ['chute', 13, 4, 0],
  // Line 3: a short wall in column 21, open at the bottom.
  ['unpacker', 21, 1, S], ['belt', 21, 2, S], ['belt', 21, 3, S], ['belt', 21, 4, S], ['press', 21, 5, S],
  ['belt', 21, 6, S], ['belt', 21, 7, S], ['belt', 21, 8, S], ['belt', 21, 9, S], ['chute', 21, 10, 0],
  ['crate', 21, 11, 0], ['crate', 21, 12, 0],
  // Security.
  ['sprinkler', 7, 11, 0], ['sprinkler', 5, 13, 0], ['wetfloor', 6, 13, 0], ['forklift', 9, 8, 0],
  ['samples', 9, 13, 0], ['sprinkler', 12, 3, 0], ['sprinkler', 14, 3, 0], ['wetfloor', 13, 2, 0],
  ['forklift', 17, 7, 0], ['sprinkler', 20, 13, 0], ['sprinkler', 22, 13, 0], ['wetfloor', 21, 13, 0],
  ['forklift', 25, 8, 0],
];

/**
 * The Back (0.4) under the demo store: one of every part, working. The Returns Drop at 10,2 feeds a
 * belt round a corner into a Splitter at 12,5. Its front branch runs east through an Overpass into
 * a Clearance Bin; its left branch goes up, along and down over that Overpass, and an Unpaid Intern
 * at 13,8 lifts its items onto its right branch, which runs south into another bin. The second drop
 * (20,12) empties into a bin of its own.
 */
export const DEMO_BACK = [
  ['conv', 10, 3, S], ['conv', 10, 4, S], ['conv', 10, 5, E], ['conv', 11, 5, E], ['split', 12, 5, E],
  ['conv', 13, 5, E], ['conv', 14, 5, E], ['over', 15, 5, 0], ['conv', 16, 5, E], ['bin', 17, 5, 0],
  ['conv', 12, 4, N], ['conv', 12, 3, E], ['conv', 13, 3, E], ['conv', 14, 3, E], ['conv', 15, 3, S],
  ['conv', 15, 4, S], ['conv', 15, 6, S], ['conv', 15, 7, S], ['conv', 15, 8, W], ['conv', 14, 8, W],
  ['intern', 13, 8, W],
  ['conv', 12, 6, S], ['conv', 12, 7, S], ['conv', 12, 8, S], ['conv', 12, 9, S], ['conv', 12, 10, S],
  ['bin', 12, 11, 0],
  ['conv', 19, 12, W], ['conv', 18, 12, W], ['bin', 17, 12, 0],
];

/**
 * A ring of belts in the top left corner of The Back carrying one of each of the five supplies at
 * each of the four tiers, round and round, so how they look can be judged before anything in the
 * game makes them (machines come in a later stage of 0.4). Clockwise from 1,1; two items a tile.
 */
const SHOWCASE = [
  [1, 1, E], [2, 1, E], [3, 1, E], [4, 1, S], [4, 2, S], [4, 3, S],
  [4, 4, W], [3, 4, W], [2, 4, W], [1, 4, N], [1, 3, N], [1, 2, N],
];

/**
 * Builds the demo's Back for a player: its Returns Drops where the map's would be (the bare default
 * map has none of its own yet; makeDrops gives the positions a warehouse of this size has), the
 * parts in DEMO_BACK and the ring of supplies. Free: his cash is put back as it was, so the shop
 * floor's demo plays exactly as before. @returns {string[]} problems, empty if all was placed
 */
export function applyDemoBack(state, pid = 0) {
  const problems = [];
  if (!state.back) return ['no Back in this state'];
  for (const { i, d } of makeDrops(state.w, state.h, state.tiles, state.doors, 'warehouse')) {
    // (Four cash levels, which a later stage sells: junk every 0.8 seconds, so the demo's belts are busy.)
    if (!state.back[i]) { state.back[i] = newDrop(d); state.back[i].lv = 4; }
  }
  state.backVer = (state.backVer | 0) + 1;
  const p = state.players[pid];
  const cash = p.cash;
  p.cash += 5000;
  const place = (k, x, y, d) => {
    const r = applyCommand(state, pid, { c: 'place', k, x, y, d, f: 1 });
    if (!r.ok) problems.push(`Back ${k} at ${x},${y}: ${r.why}`);
  };
  for (const [k, x, y, d] of DEMO_BACK) place(k, x, y, d);
  for (const [x, y, d] of SHOWCASE) place('conv', x, y, d);
  let n = 0;
  for (const [x, y] of SHOWCASE.slice(0, 10)) {
    const b = state.back[y * state.w + x];
    if (!b || b.k !== 'conv') continue;
    for (const pos of [200, 80]) {
      const type = 1 + ((n / 4) | 0), tier = 1 + (n % 4);
      b.it.push(10 * type + tier, pos);
      n++;
    }
  }
  p.cash = cash;
  return problems;
}

/**
 * Builds the demo layout for a player, giving him enough cash to pay for it.
 * @returns {string[]} problems, empty if everything was placed
 */
export function applyDemoLayout(state, pid = 0) {
  const problems = [];
  const p = state.players[pid];
  p.cash += 5000;
  for (const [k, x, y, d] of DEMO_LAYOUT) {
    const r = applyCommand(state, pid, { c: 'place', k, x, y, d });
    if (!r.ok) problems.push(`${k} at ${x},${y}: ${r.why}`);
  }
  p.cash = Math.max(0, p.cash - 5000) + 300;
  return problems.concat(applyDemoBack(state, pid));
}

export { E, S, W, N };
