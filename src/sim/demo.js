// A ready-made warehouse layout. Used by tests, by the balance bot, and by the "?demo" page
// option so the game can be looked at without building anything by hand.
import { applyCommand } from './commands.js';
import { makeDrops } from './maps.js';
import { newDrop, takesSupply, addStock } from './back.js';
import { BUILD } from './constants.js';

const E = 0, S = 1, W = 2, N = 3;

/** A column of Crate Stacks from row y0 to row y1 in column x. */
const crates = (x, y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, n) => ['crate', x, y0 + n, 0]);

/**
 * Three walls of Crate Stacks with gaps, making the shoppers zigzag, and security around the gaps.
 * (Until 0.4 the walls were the old shop-floor factory's production lines, on the same tiles.)
 */
export const DEMO_LAYOUT = [
  // A wall down column 6, open at the bottom.
  ...crates(6, 1, 11),
  // A wall up column 13, open at the top.
  ...crates(13, 4, 14),
  // A shorter wall in column 21, open at the bottom.
  ...crates(21, 1, 12),
  // Security.
  ['sprinkler', 7, 11, 0], ['sprinkler', 5, 13, 0], ['wetfloor', 6, 13, 0], ['forklift', 9, 8, 0],
  ['samples', 9, 13, 0], ['sprinkler', 12, 3, 0], ['sprinkler', 14, 3, 0], ['wetfloor', 13, 2, 0],
  ['forklift', 17, 7, 0], ['sprinkler', 20, 13, 0], ['sprinkler', 22, 13, 0], ['wetfloor', 21, 13, 0],
  ['forklift', 25, 8, 0],
];

/**
 * The Back (0.4) under the demo store: a working supply chain feeding the demo's security.
 *   Spite: the Returns Drop at 10,2 drops junk down a belt into a Spite Still at 10,5, whose Bottled
 *   Spite runs east along row 5 past two Unpaid Interns (12,4 and 14,4), each lifting it up to the
 *   Dumbwaiter of the Pepper Sprinkler above him, to a Splitter at 16,5: straight on into a
 *   Clearance Bin, and right, down column 16 over an Overpass, into another bin.
 *   Cola: the drop at 20,12 feeds a Cola Cannery at 19,12, then two Rebranders in a row (Name Brand,
 *   then Premium), and a belt west along row 9, under that Overpass, that ends pointing straight
 *   into the Dumbwaiter of the Forklift Turret at 9,8.
 * Nothing in it sits on a Dumbwaiter (the security buildings' tiles).
 */
export const DEMO_BACK = [
  ['conv', 10, 3, S], ['conv', 10, 4, S], ['still', 10, 5, E],
  ['conv', 11, 5, E], ['conv', 12, 5, E], ['conv', 13, 5, E], ['conv', 14, 5, E], ['conv', 15, 5, E],
  ['intern', 12, 4, N], ['intern', 14, 4, N],
  ['split', 16, 5, E], ['bin', 17, 5, 0],
  ['conv', 16, 6, S], ['conv', 16, 7, S], ['conv', 16, 8, S], ['over', 16, 9, 0], ['conv', 16, 10, S], ['bin', 16, 11, 0],
  ['cannery', 19, 12, N], ['rebrand', 19, 11, N], ['rebrand', 19, 10, N],
  ['conv', 19, 9, W], ['conv', 18, 9, W], ['conv', 17, 9, W], ['conv', 15, 9, W], ['conv', 14, 9, W],
  ['conv', 13, 9, W], ['conv', 12, 9, W], ['conv', 11, 9, W], ['conv', 10, 9, N], ['conv', 10, 8, W],
];

/**
 * Stock the demo's buildings start with, as [x, y, supply code, units], so the shop floor's supply
 * pips have something to show from the first frame: one unit of Name Brand Bottled Spite in the
 * Sprinkler by the entrance, which it fires off in twenty shots (so its damage runs dry early in the
 * first sales event and the "OUT OF SPITE" warning is seen), one of Name Brand Extension Cord in the
 * far Forklift Turret, which it uses up in six shots (so its range runs dry in the first sales
 * event and the "OUT OF CORD" warning is seen), and Duct Tape in the Sprinkler at the bottom.
 */
const DEMO_STOCK = [[7, 11, 12, 1], [25, 8, 32, 1], [20, 13, 41, 2]];

/**
 * A ring of belts in the top left corner of The Back carrying one of each of the five supplies at
 * each of the four tiers, round and round, so how they look can be judged before anything in the
 * a Rebrander can raise them that far. Clockwise from 1,1; two items a tile.
 */
const SHOWCASE = [
  [1, 1, E], [2, 1, E], [3, 1, E], [4, 1, S], [4, 2, S], [4, 3, S],
  [4, 4, W], [3, 4, W], [2, 4, W], [1, 4, N], [1, 3, N], [1, 2, N],
];

/**
 * Builds the demo's Back for a player: its Returns Drops where the map's would be (the bare default
 * map has none of its own yet; makeDrops gives the positions a warehouse of this size has), the
 * parts in DEMO_BACK, the stock in DEMO_STOCK and the ring of supplies. Free: his cash is put back as it was, so the shop
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
  for (const [x, y, code, units] of DEMO_STOCK) {
    const b = state.grid[y * state.w + x];
    if (!b || !BUILD[b.k].lift) { problems.push(`stock at ${x},${y}: no security building`); continue; }
    for (let u = 0; u < units; u++) if (takesSupply(b, code, state)) addStock(b, code, state);
  }
  p.cash = cash;
  return problems;
}

/**
 * Builds the demo layout for a player, giving him enough cash to pay for it.
 * @param {Object} [o]
 * @param {boolean} [o.back] also build The Back's supply chain (applyDemoBack); true by default.
 *   A test about the shop floor alone can leave it out, so stocked security does not change who
 *   reaches what.
 * @returns {string[]} problems, empty if everything was placed
 */
export function applyDemoLayout(state, pid = 0, { back = true } = {}) {
  const problems = [];
  const p = state.players[pid];
  p.cash += 5000;
  for (const [k, x, y, d] of DEMO_LAYOUT) {
    const r = applyCommand(state, pid, { c: 'place', k, x, y, d });
    if (!r.ok) problems.push(`${k} at ${x},${y}: ${r.why}`);
  }
  p.cash = Math.max(0, p.cash - 5000) + 300;
  return back ? problems.concat(applyDemoBack(state, pid)) : problems;
}


