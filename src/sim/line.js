// Belt lines (0.4.01, the owner's request): the player presses on a start tile in The Back, drags to
// an end tile and gets a whole line of belts at once, the shortest way with the fewest turns. This
// file only plans the line; the `line` command in commands.js applies it. Pure and deterministic,
// like the rest of the rules: the host plans it again from the same state and gets the same line.
// docs/architecture.md, "The Back", is the contract.
import { BUILD } from './constants.js';
import { beltShape, backPrice } from './back.js';
import { buildPrice } from './cards.js';

/** The tile next to tile i in direction d (0 east, 1 south, 2 west, 3 north), or -1 off the map. */
function nb(W, H, i, d) {
  const x = (i % W) + (d === 0 ? 1 : d === 2 ? -1 : 0), y = ((i / W) | 0) + (d === 1 ? 1 : d === 3 ? -1 : 0);
  return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
}

/**
 * Whether a part is one a line may start or end beside (a part a belt cannot go on, but that takes
 * or gives items): a machine, a Rebrander, a Returns Drop, a Dumbwaiter, a Splitter, a Clearance Bin
 * or an Unpaid Intern.
 */
function isEndPart(p) {
  return !!p && (p.k === 'drop' || p.k === 'lift' || p.k === 'split' || p.k === 'bin' || p.k === 'intern' || p.k === 'rebrand' || !!(BUILD[p.k] && BUILD[p.k].supply));
}

/**
 * The ways a line may leave a start part: the ways it puts items out (a machine's, Rebrander's or
 * Intern's front; a Splitter's three; a Returns Drop's four). A part that only takes (a Clearance
 * Bin, a Dumbwaiter) may be left any way: the line is the player's to judge.
 */
function startWays(p) {
  if (p.k === 'split') return [p.d, (p.d + 1) & 3, (p.d + 3) & 3];
  if (p.k === 'intern' || p.k === 'rebrand' || BUILD[p.k].supply) return [p.d];
  return [0, 1, 2, 3];
}

/**
 * Whether a line may end going into an end part travelling in direction h: the ways it takes items
 * (back.js, wants): a machine or a Rebrander from anywhere but its front; a Splitter and an Unpaid
 * Intern from behind; a Clearance Bin and a Dumbwaiter from anywhere. A Returns Drop takes nothing,
 * so no line ends at one.
 */
function endTakes(p, h) {
  if (p.k === 'bin' || p.k === 'lift') return true;
  if (p.k === 'split' || p.k === 'intern') return h === p.d;
  if (p.k === 'drop') return false;
  return h !== ((p.d + 2) & 3);
}

/** A refused plan. */
const no = (why) => ({ steps: [], cost: 0, cut: false, why });

/**
 * Plans a line of belts in The Back for player pid from tile `from` to tile `to` (tile indexes).
 * `axis` 0 prefers to leave the start horizontally, 1 vertically (where two routes are otherwise as
 * good: an L either way).
 *
 * The route: the shortest 4-connected way, then the fewest turns, then the first move along `axis`;
 * after that the first found, the directions tried in the fixed order east, south, west, north. It
 * may use empty tiles where a belt may go, existing belts (below) and existing Overpasses crossed
 * straight (free and untouched). A start or end tile holding a part a belt cannot go on that takes
 * or gives items (isEndPart) moves the route's end to the tile beside it, on the side it puts out
 * from (start) or takes in from (end), and the last belt points into it.
 *
 * Existing belts on the route:
 *   first tile: turned to the route's heading (free), as laying a belt on a belt does;
 *   middle tile crossed straight along the same axis: turned to the route's heading (free);
 *   middle tile crossed straight across it, when it is a straight belt (beltShape 0): replaced by an
 *     Overpass, so the lines cross without mixing, for the Overpass's price less what was spent on
 *     the belt (never below 0). A corner across the route, or any existing belt or Overpass where
 *     the route would turn, is never used: the search goes round;
 *   last tile (no end part): along the same axis turned to the heading; across it left untouched,
 *     the new line feeding it from the side.
 *
 * Money: the steps are paid for in route order; the line stops before the first the player cannot
 * pay for (`cut` true). Nothing to pay for at all, or not even the first paid step: 'cash'.
 *
 * @returns {{steps: Array<{i: number, k: string, d: number, cost: number, keep?: boolean,
 *   turn?: boolean, cross?: boolean}>, cost: number, cut: boolean, why: string|null}}
 *   steps in route order, every tile of the route: `keep` where nothing changes (an Overpass, a belt
 *   already facing that way or fed from the side at the end), `turn` an existing belt turned,
 *   `cross` a belt replaced by an Overpass; otherwise a new belt. `why`, with no steps: 'over',
 *   'lobby', 'cards', 'paused' as for canPlaceBack; 'bad' no such player or axis; 'bounds' a tile off
 *   the map; 'same' from is to; 'blocked' a start or end that is a wall or a part no line can use,
 *   or no route; 'cash'.
 */
export function planLine(state, pid, from, to, axis) {
  if (state.phase === 'won' || state.phase === 'lost') return no('over');
  if (state.phase === 'lobby') return no('lobby');
  if (state.phase === 'cards') return no('cards');
  if (state.pause) return no('paused');
  const player = Number.isInteger(pid) ? state.players[pid] : null;
  if (!player) return no('bad');
  if (axis !== 0 && axis !== 1) return no('bad');
  const back = state.back, W = state.w, H = state.h, N = W * H;
  if (!back || back.length !== N) return no('bounds');
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= N || to >= N) return no('bounds');
  if (from === to) return no('same');

  const tiles = state.tiles;
  /** Whether a line may go over tile t at all: open floor, a belt or an Overpass. */
  const open = (t) => t >= 0 && tiles[t] !== '#' && (!back[t] || back[t].k === 'conv' || back[t].k === 'over');
  const startPart = back[from] && back[from].k !== 'conv' && back[from].k !== 'over' ? back[from] : null;
  const endPart = back[to] && back[to].k !== 'conv' && back[to].k !== 'over' ? back[to] : null;
  if (tiles[from] === '#' || (startPart && !isEndPart(startPart))) return no('blocked');
  if (tiles[to] === '#' || (endPart && (!isEndPart(endPart) || endPart.k === 'drop'))) return no('blocked');

  // A search over (tile, heading it arrived with) states, ordered by (tiles on the route, turns,
  // 1 if the first move is not along `axis`), packed into one number. State s = t * 5 + arrival + 1
  // (arrival -1: the start tile itself, arrived at from nowhere); the four after N * 5 are the end
  // part reached going each way.
  const S = N * 5, GOAL = S;
  const best = new Float64Array(S + 4).fill(Infinity);
  const prev = new Int32Array(S + 4).fill(-2); // -1: comes straight from the start
  const LEN = 1 << 20; // more than any (turns * 2 + 1) on the largest store
  // A binary heap of states, smallest key first and the lower state number first on a tie, so the
  // order things are tried in never depends on how the heap happens to be arranged.
  const hk = [], hs = [];
  const less = (k1, s1, k2, s2) => k1 < k2 || (k1 === k2 && s1 < s2);
  const push = (key, s) => {
    let k = hk.length;
    hk.push(key); hs.push(s);
    while (k > 0) {
      const u = (k - 1) >> 1;
      if (!less(key, s, hk[u], hs[u])) break;
      hk[k] = hk[u]; hs[k] = hs[u]; k = u;
    }
    hk[k] = key; hs[k] = s;
  };
  /** Takes the smallest off the heap into top.key and top.s. */
  const top = { key: 0, s: 0 };
  const pop = () => {
    top.key = hk[0]; top.s = hs[0];
    const lk = hk.pop(), ls = hs.pop(), n = hk.length;
    if (!n) return;
    let k = 0;
    for (;;) {
      const l = k * 2 + 1, r = l + 1;
      let m = -1, mk = lk, ms = ls;
      if (l < n && less(hk[l], hs[l], mk, ms)) { m = l; mk = hk[l]; ms = hs[l]; }
      if (r < n && less(hk[r], hs[r], mk, ms)) { m = r; mk = hk[r]; ms = hs[r]; }
      if (m < 0) break;
      hk[k] = mk; hs[k] = ms; k = m;
    }
    hk[k] = lk; hs[k] = ls;
  };
  const offer = (key, s, from) => {
    if (key >= best[s]) return;
    best[s] = key;
    prev[s] = from;
    push(key, s);
  };
  const pen = (h) => ((h & 1) === axis ? 0 : 1);

  if (startPart) {
    for (const h of startWays(startPart)) {
      const t = nb(W, H, from, h);
      if (t < 0) continue;
      if (endPart && t === to) continue;
      if (open(t)) offer(LEN + pen(h), t * 5 + h + 1, -1);
    }
  } else if (open(from)) {
    offer(LEN, from * 5, -1);
  } else return no('blocked');

  let goal = -1;
  while (hk.length) {
    pop();
    const key = top.key, s = top.s;
    if (key > best[s]) continue;
    if (s >= GOAL) { goal = s; break; }
    const t = (s / 5) | 0, arr = (s % 5) - 1;
    if (!endPart && t === to) { goal = s; break; }
    const first = prev[s] === -1;
    const p = back[t];
    for (let h = 0; h < 4; h++) {
      if (arr >= 0 && h === ((arr + 2) & 3)) continue;
      // What this tile allows: anything on open floor or on the first tile; an Overpass and an
      // existing belt only straight on, a belt across the route only if it is straight itself.
      // (An Overpass cannot turn even as the first tile, if something feeds it from the start part.)
      if (p && arr >= 0 && (!first || p.k === 'over')) {
        if (h !== arr) continue;
        if (p.k === 'conv' && (p.d & 1) !== (h & 1) && beltShape(state, t) !== 0) continue;
      }
      let k = key + (arr >= 0 && h !== arr ? 2 : 0) + (arr < 0 ? pen(h) : 0);
      const n = nb(W, H, t, h);
      if (n < 0) continue;
      if (endPart && n === to) {
        if (endTakes(endPart, h)) offer(k, GOAL + h, s);
        continue;
      }
      if (!open(n) || n === from) continue;
      offer(k + LEN, n * 5 + h + 1, s);
    }
  }
  if (goal < 0) return no('blocked');

  // The route, start first: tile, and the way its belt points.
  const route = [], ways = [];
  let s = goal, out = goal >= GOAL ? goal - GOAL : -1;
  if (goal >= GOAL) s = prev[goal];
  for (; s >= 0; s = prev[s]) {
    const t = (s / 5) | 0, arr = (s % 5) - 1;
    route.push(t);
    // (The last tile with no end part keeps the heading it arrived with.)
    ways.push(out >= 0 ? out : arr);
    out = arr;
  }
  route.reverse();
  ways.reverse();
  // (A route that comes back over its own tile can only be one forced round by the rules on belts
  // and Overpasses; a line cannot be laid like that.)
  if (new Set(route).size !== route.length) return no('blocked');

  const beltPrice = buildPrice(state, 'conv');
  const steps = [];
  let cost = 0, cut = false;
  for (let n = 0; n < route.length; n++) {
    const i = route[n], d = ways[n], p = back[i];
    let step;
    if (!p) step = { i, k: 'conv', d, cost: beltPrice };
    else if (p.k === 'over') step = { i, k: 'over', d, cost: 0, keep: true };
    else if (n > 0 && (p.d & 1) !== (d & 1)) {
      // Across the route: fed from the side at the end of a line with no end part; crossed by an
      // Overpass anywhere else.
      if (n === route.length - 1 && !endPart) step = { i, k: 'conv', d: p.d, cost: 0, keep: true };
      else step = { i, k: 'over', d, cost: backPrice(state, 'over', i), cross: true };
    } else if (p.d === d) step = { i, k: 'conv', d, cost: 0, keep: true };
    else step = { i, k: 'conv', d, cost: 0, turn: true };
    if (step.cost > 0 && cost + step.cost > player.cash) { cut = true; break; }
    cost += step.cost;
    steps.push(step);
  }
  if (cut && !steps.some((st) => st.cost > 0)) return no('cash');
  return { steps, cost, cut, why: null };
}
