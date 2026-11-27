// The Back (0.4): the floor under the shop, where belts carry returned junk and supplies between
// its parts. docs/architecture.md, "The Back", is the contract this file keeps.
//
// The parts live in state.back (one entry per tile, like state.grid). Their shapes:
//   belt          { k: 'conv', o, d, it: [code, pos, code, pos, ...] }  front item first
//   Splitter      { k: 'split', o, d, h, r }   h: the item it holds (0 when empty); r: which way took
//                                              the last one (0 front, 1 left, 2 right)
//   Overpass      { k: 'over', o, a: [...], b: [...] }  two lanes like a belt's `it`: a east-west,
//                                              b north-south; which way each runs is read from the
//                                              layout (see overpassDirs), never stored
//   Unpaid Intern { k: 'intern', o, d, h, t }  h: the item in his hand; t: ticks before he hands it on
//   Returns Drop  { k: 'drop', d, t, lv }      t: ticks to the next junk; lv: its cash level (a later
//                                              stage buys them); owned by nobody
//   Clearance Bin { k: 'bin', o }
// An item is a small whole number (itemCode). A position on a belt is a whole number from 0 (just
// come on) to BACK.sub (leaving), so every browser moves items exactly alike.
//
// Every hand-over goes through wants() and give(), so a new part only has to answer those two.
// Lanes and parts are stepped downstream first (a part after whatever it hands to), so a full line
// moves as one and nothing moves twice in a tick. That order is worked out from the layout and kept
// in a WeakMap against state.backVer: it is never part of the state.
import { BACK, BUILD, TICK_HZ, buildDef } from './constants.js';
// (state.js and cards.js import from this file too. That is safe: none uses another while loading.)
import { earn, bump, inBounds, idxOf } from './state.js';
import { buildPrice } from './cards.js';

const SUB = BACK.sub, GAP = BACK.gap, STEP = BACK.step, END = BACK.end;
/** Where an item lands when it comes onto a belt from the side. */
const MID = SUB / 2;

// ---------------------------------------------------------------------------------------------
// Items

/** Returned junk, the only thing a Returns Drop puts out. */
export const JUNK = 1;

/**
 * An item's number: 1 for junk; a supply is 10 * type + tier (type 1 Bottled Spite, 2 Rage Cola,
 * 3 Extension Cord, 4 Duct Tape, 5 Razor Wire; tier 1 Store Brand to 4 Platinum).
 */
export const itemCode = (type, tier) => (type ? 10 * type + tier : JUNK);
/** A supply's type (1 to 5), or 0 for junk. */
export const itemType = (code) => (code / 10) | 0;
/** A supply's tier (1 to 4), or 0 for junk. */
export const itemTier = (code) => (code >= 10 ? code % 10 : 0);

/** Ticks between two pieces of junk from a Returns Drop with `lv` cash levels. */
export const dropTicks = (lv = 0) => Math.max(1, Math.round(BACK.dropSecs * BACK.dropMul ** (lv | 0) * TICK_HZ));

/** A Returns Drop as the map puts it down (makeDrops in maps.js), facing d. */
export const newDrop = (d) => ({ k: 'drop', d: d & 3, t: dropTicks(0), lv: 0 });

/** A Back part as a player puts it down: kind k, owned by o, facing d. */
export function newPart(k, o, d = 0) {
  const p = { k, o };
  if (BUILD[k].rot) p.d = d & 3;
  if (k === 'conv') p.it = [];
  else if (k === 'split') { p.h = 0; p.r = 2; } // (r 2: the first item goes to the front)
  else if (k === 'over') { p.a = []; p.b = []; }
  else if (k === 'intern') { p.h = 0; p.t = 0; }
  return p;
}

// ---------------------------------------------------------------------------------------------
// The lane order, derived from the layout and cached against state.backVer.

// What a node in the order is. A belt is one lane; an Overpass is two (a and b); the parts that
// pass items on are one node each. Clearance Bins only take, so they need no turn of their own.
const CONV = 1, OVA = 2, OVB = 3, SPLIT = 4, INTERN = 5, DROP = 6;

const CACHE = new WeakMap();

/** The tile next to tile i in direction d (0 east, 1 south, 2 west, 3 north), or -1 off the map. */
function nb(W, H, i, d) {
  const x = (i % W) + (d === 0 ? 1 : d === 2 ? -1 : 0), y = ((i / W) | 0) + (d === 1 ? 1 : d === 3 ? -1 : 0);
  return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
}

/** Whether a part (not an Overpass) puts items out in direction dir. */
function sendsToward(p, dir) {
  if (!p) return false;
  if (p.k === 'conv' || p.k === 'drop' || p.k === 'intern') return p.d === dir;
  if (p.k === 'split') return dir !== ((p.d + 2) & 3);
  return false;
}

/**
 * Which way each Overpass lane runs, for every Overpass tile: od[2i] its east-west lane a (0 east
 * or 2 west), od[2i + 1] its north-south lane b (1 south or 3 north). A row of Overpasses side by
 * side is one long lane, so it is decided once for the whole row by what is at its two ends: it
 * runs the way the part feeding it sends, and east (south) when both ends or neither feed it.
 */
function overpassLanes(back, W, H) {
  const od = new Int8Array(back.length * 2);
  for (let i = 0; i < back.length; i++) {
    if (!back[i] || back[i].k !== 'over') continue;
    for (const axis of [0, 1]) {
      const fwd = axis ? 1 : 0, rev = axis ? 3 : 2;
      const prev = nb(W, H, i, rev);
      if (prev >= 0 && back[prev] && back[prev].k === 'over') continue; // not the row's first tile
      const row = [i];
      let j = nb(W, H, i, fwd);
      while (j >= 0 && back[j] && back[j].k === 'over') { row.push(j); j = nb(W, H, j, fwd); }
      const fromBack = prev >= 0 && sendsToward(back[prev], fwd);
      const fromFront = j >= 0 && sendsToward(back[j], rev);
      const dir = fromFront && !fromBack ? rev : fwd;
      for (const t of row) od[t * 2 + axis] = dir;
    }
  }
  return od;
}

/**
 * Whether the part on tile j puts items out in direction dir into the next tile, for working out a
 * belt's shape: a belt, a Returns Drop, a Splitter's three ways, an Overpass lane. Not an Unpaid
 * Intern: he puts things down where there is room and does not make a belt a corner.
 */
function feeds(back, od, j, dir) {
  const p = back[j];
  if (!p) return false;
  if (p.k === 'conv' || p.k === 'drop') return p.d === dir;
  if (p.k === 'split') return dir !== ((p.d + 2) & 3);
  if (p.k === 'over') return od[j * 2 + (dir & 1)] === dir;
  return false;
}

/**
 * Every belt's shape, by tile: 0 straight, 1 a corner fed from its right, -1 a corner fed from its
 * left (the shop floor's belts use the same numbers, beltShape in src/render/buildings.js). A belt
 * with nothing feeding it from behind and exactly one feeder at one side is a corner: what comes in
 * from that side comes in as if from behind, so a line goes round it without a jump. With a feeder
 * behind as well, or one at each side, it is a merge, and the sides drop items in at the middle.
 */
function beltShapes(back, W, H, od) {
  const shape = new Int8Array(back.length);
  for (let i = 0; i < back.length; i++) {
    const p = back[i];
    if (!p || p.k !== 'conv') continue;
    const d = p.d, behind = nb(W, H, i, (d + 2) & 3);
    if (behind >= 0 && feeds(back, od, behind, d)) continue;
    const r = nb(W, H, i, (d + 1) & 3), l = nb(W, H, i, (d + 3) & 3);
    const fromR = r >= 0 && feeds(back, od, r, (d + 3) & 3), fromL = l >= 0 && feeds(back, od, l, (d + 1) & 3);
    if (fromR !== fromL) shape[i] = fromR ? 1 : -1;
  }
  return shape;
}

/**
 * The shape of the belt on tile i: 0 straight (or a merge), 1 a corner fed from its right, -1 a
 * corner fed from its left; 0 for anything that is not a belt. For drawing.
 */
export function beltShape(state, i) {
  const p = state.back && state.back[i];
  if (!p || p.k !== 'conv') return 0;
  return cacheOf(state).shape[i];
}

/**
 * True if an item travelling in direction dir comes onto the belt p on tile i as if from behind:
 * straight along it, or round it when it is a corner fed from that side.
 */
function fromBehind(c, i, p, dir) {
  if (dir === p.d) return true;
  const s = c.shape[i];
  return s === 1 ? dir === ((p.d + 3) & 3) : s === -1 && dir === ((p.d + 1) & 3);
}

/**
 * Works out the order every lane and part is stepped in: downstream first. The parts and what each
 * hands to form a graph; its strongly connected groups (Tarjan's method) come out with every group
 * after the groups it hands to. Inside a group (a ring), the order is a depth-first walk from its
 * lowest tile index, so the ring is broken at that tile: its feeder hands into it before it has
 * moved that tick. Everything depends on the layout alone, never on the order things were built in.
 */
function build(state) {
  const back = state.back, W = state.w, H = state.h, N = back.length;
  const od = overpassLanes(back, W, H);
  const shape = beltShapes(back, W, H, od);
  const nodeAt = new Int32Array(N * 2).fill(-1);
  const kinds = [], tiles = [], dirs = [];
  const add = (kind, i, d, slot) => { nodeAt[i * 2 + slot] = kinds.length; kinds.push(kind); tiles.push(i); dirs.push(d); };
  for (let i = 0; i < N; i++) {
    const p = back[i];
    if (!p) continue;
    if (p.k === 'conv') add(CONV, i, p.d, 0);
    else if (p.k === 'over') { add(OVA, i, od[i * 2], 0); add(OVB, i, od[i * 2 + 1], 1); }
    else if (p.k === 'split') add(SPLIT, i, p.d, 0);
    else if (p.k === 'intern') add(INTERN, i, p.d, 0);
    else if (p.k === 'drop') add(DROP, i, p.d, 0);
  }
  const M = kinds.length;
  // For each node, up to three tiles it hands to (a Splitter's front, left, right; everyone else's
  // front) and the nodes on them (for the order).
  const to = new Int32Array(M * 3).fill(-1), outs = new Int32Array(M * 3).fill(-1);
  const entry = (t, dir) => {
    const q = back[t];
    if (!q) return -1;
    if (q.k === 'conv' || q.k === 'split') return nodeAt[t * 2];
    if (q.k === 'over') return nodeAt[t * 2 + (dir & 1)];
    return -1;
  };
  for (let m = 0; m < M; m++) {
    const d = dirs[m];
    const ways = kinds[m] === SPLIT ? [d, (d + 3) & 3, (d + 1) & 3] : [d];
    for (let k = 0; k < ways.length; k++) {
      const t = nb(W, H, tiles[m], ways[k]);
      to[m * 3 + k] = t;
      if (t >= 0) outs[m * 3 + k] = entry(t, ways[k]);
    }
  }
  // An Unpaid Intern also needs the tile behind him (he takes from it).
  const from = new Int32Array(M).fill(-1);
  for (let m = 0; m < M; m++) if (kinds[m] === INTERN) from[m] = nb(W, H, tiles[m], (dirs[m] + 2) & 3);

  // Tarjan's strongly connected groups, without recursion (a line can be thousands of tiles long).
  const index = new Int32Array(M).fill(-1), low = new Int32Array(M), on = new Uint8Array(M), ei = new Uint8Array(M);
  const stk = [], call = [], order = [];
  const group = new Int32Array(M).fill(-1);
  const seen = new Uint8Array(M), ei2 = new Uint8Array(M);
  let next = 0, groups = 0;
  for (let s = 0; s < M; s++) {
    if (index[s] !== -1) continue;
    index[s] = low[s] = next++; stk.push(s); on[s] = 1; call.push(s);
    while (call.length) {
      const v = call[call.length - 1];
      if (ei[v] < 3) {
        const w = outs[v * 3 + ei[v]++];
        if (w < 0) continue;
        if (index[w] === -1) { index[w] = low[w] = next++; stk.push(w); on[w] = 1; call.push(w); }
        else if (on[w] && index[w] < low[v]) low[v] = index[w];
        continue;
      }
      call.pop();
      if (call.length) { const u = call[call.length - 1]; if (low[v] < low[u]) low[u] = low[v]; }
      if (low[v] !== index[v]) continue;
      // v is the root of a group: everything above it on the stack belongs to it.
      const members = [];
      for (;;) { const w = stk.pop(); on[w] = 0; group[w] = groups; members.push(w); if (w === v) break; }
      if (members.length === 1) order.push(v);
      else {
        // A ring: walk it depth first from its lowest tile (lane a before lane b on an Overpass,
        // which are numbered in that order) and step it in the order the walk finishes.
        let start = members[0];
        for (const w of members) if (tiles[w] < tiles[start] || (tiles[w] === tiles[start] && w < start)) start = w;
        const walk = [start];
        seen[start] = 1;
        while (walk.length) {
          const u = walk[walk.length - 1];
          if (ei2[u] < 3) {
            const w = outs[u * 3 + ei2[u]++];
            if (w >= 0 && group[w] === groups && !seen[w]) { seen[w] = 1; walk.push(w); }
            continue;
          }
          walk.pop();
          order.push(u);
        }
      }
      groups++;
    }
  }
  return {
    ver: state.backVer, back, w: W,
    kinds: Uint8Array.from(kinds), tiles: Int32Array.from(tiles), dirs: Int8Array.from(dirs),
    nodeAt, to, from, od, shape, order: Int32Array.from(order),
    // Scratch for one stepBack (see give): the pass number, the pass each lane was last stepped in,
    // and the positions (-1 for none) of up to two items handed into a lane before its turn in this
    // pass (only at the break of a ring), which must not move again in the same tick (for a
    // Splitter, freshA 0 means what it holds came this tick); and the allowance for the one hand-over
    // across a ring's break being made right now (see leanFor).
    pass: 0, stamp: new Int32Array(M), freshA: new Int32Array(M).fill(-1), freshB: new Int32Array(M).fill(-1),
    lean: 0, leanAt: -1, running: false, ev: null,
  };
}

/** The cached order and lookups for this state's Back, made again when the layout has changed. */
function cacheOf(state) {
  const c = CACHE.get(state);
  if (c && c.ver === state.backVer && c.back === state.back && c.w === state.w) return c;
  const fresh = build(state);
  CACHE.set(state, fresh);
  return fresh;
}

/**
 * Which way the two lanes of the Overpass on tile i run, as [a, b] (a: 0 east or 2 west; b: 1 south
 * or 3 north), or null if there is no Overpass there. For drawing and tests.
 */
export function overpassDirs(state, i) {
  const p = state.back && state.back[i];
  if (!p || p.k !== 'over') return null;
  const c = cacheOf(state);
  return [c.od[i * 2], c.od[i * 2 + 1]];
}

/** The lane array of a lane node on tile t. */
const laneOf = (back, kind, t) => (kind === CONV ? back[t].it : kind === OVA ? back[t].a : back[t].b);

// ---------------------------------------------------------------------------------------------
// Handing over

/** True if an item may come onto lane `it` from behind at position `over`. */
const roomBehind = (it, over) => it.length === 0 || it[it.length - 1] - over >= GAP;

/** True if no item on lane `it` is within GAP of position `at`. */
function roomAt(it, at) {
  for (let k = 1; k < it.length; k += 2) if (Math.abs(it[k] - at) < GAP) return false;
  return true;
}

/**
 * Would tile i take item `code`, arriving travelling in direction `dir`, right now? `over` is how
 * far past the tile's edge the item already is (a belt handing straight on passes its overshoot; 0
 * for everything else). No side effects.
 *   belt: from behind (or, on a corner, from the side that feeds it: see beltShapes), if the last
 *         item is at least GAP ahead of where it would land; from a side otherwise, at the middle
 *         (MID), if no item is within GAP of it; never head-on
 *   Overpass: on the lane running the way it travels, from behind, as a belt
 *   Splitter: from behind, when its hand is empty
 *   Clearance Bin: anything, from any side
 */
export function wants(state, i, code, dir, over = 0) {
  const p = state.back && state.back[i];
  if (!p) return false;
  if (p.k !== 'conv' && p.k !== 'over') return p.k === 'bin' || (p.k === 'split' && dir === p.d && !p.h);
  const c = cacheOf(state);
  // (The allowance at a ring's break, while that one hand-over is being made: see leanFor.)
  const lean = c.leanAt === i ? c.lean : 0;
  switch (p.k) {
    case 'conv':
      if (fromBehind(c, i, p, dir)) return roomBehind(p.it, over - lean);
      if (dir === ((p.d + 2) & 3)) return false;
      return roomAt(p.it, MID);
    case 'over': {
      const axis = dir & 1;
      if (c.od[i * 2 + axis] !== dir) return false;
      return roomBehind(axis ? p.b : p.a, over - lean);
    }
    default:
      return false;
  }
}

/** Puts item `code` on lane `it` at position `at`, keeping the lane in order, front first. */
function insert(it, code, at) {
  let k = it.length;
  it.push(0, 0);
  while (k > 0 && it[k - 1] < at) { it[k] = it[k - 2]; it[k + 1] = it[k - 1]; k -= 2; }
  it[k] = code;
  it[k + 1] = at;
}

/** Takes the item at array index k (even) off lane `it`, without making a new array. */
function takeOff(it, k) {
  for (let j = k + 2; j < it.length; j++) it[j - 2] = it[j];
  it.length -= 2;
}

/**
 * Hands item `code` to tile i, arriving travelling in direction `dir` (see wants; `over` as there).
 * Returns false, changing nothing, if the tile does not want it right now.
 */
export function give(state, i, code, dir, over = 0) {
  if (!wants(state, i, code, dir, over)) return false;
  const p = state.back[i];
  switch (p.k) {
    case 'conv':
    case 'over': {
      const lane = p.k === 'conv' ? p.it : dir & 1 ? p.b : p.a;
      const side = p.k === 'conv' && !fromBehind(cacheOf(state), i, p, dir), pos = side ? MID : over;
      if (side) insert(lane, code, pos); else lane.push(code, pos);
      // Only at the break of a ring: the lane it joins has not had its turn yet this tick, and the
      // item has already moved; it is marked so that it is not moved twice.
      const c = CACHE.get(state);
      if (c && c.running) {
        const n = c.nodeAt[i * 2 + (p.k === 'over' ? dir & 1 : 0)];
        if (n >= 0 && c.stamp[n] !== c.pass) {
          if (c.freshA[n] < 0) c.freshA[n] = pos; else c.freshB[n] = pos;
        }
      }
      return true;
    }
    case 'split': {
      p.h = code;
      // At the break of a ring the Splitter may get an item before its own turn this tick: it
      // must not pass it on in the same tick, or the item would move twice.
      const c = CACHE.get(state);
      if (c && c.running) {
        const n = c.nodeAt[i * 2];
        if (n >= 0 && c.stamp[n] !== c.pass) c.freshA[n] = 0;
      }
      return true;
    }
    case 'bin': {
      // Leftover supplies fetch pennies, shared like any income; junk nothing.
      const v = BACK.binPay[itemTier(code)] || 0;
      if (v > 0) {
        earn(state, v);
        state.ws.earned = Math.round((state.ws.earned + v) * 1000) / 1000;
        bump(state, p.o, 'earned', v);
        const c = CACHE.get(state);
        if (c && c.running && c.ev) c.ev.push({ e: 'binned', i, v, by: p.o });
      }
      return true;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------------------------
// One tick

/**
 * Moves the items of one lane (`it`, front first) one tick along, heading in direction `dir` toward
 * tile `to` (-1 off the map), and hands the front one on when it gets there. Written over a single lane array so a
 * belt can be given a second lane later. Items at positions f1 and f2 (-1 for none) were handed
 * into it earlier this tick, before its turn (only at the break of a ring), and stay put.
 *   Heading straight into another belt (or round a corner belt fed from this side, or into an
 *   Overpass lane running the same way), the front item
 *   may go as far as SUB + (that lane's last item - GAP), which keeps the gap across the join; past
 *   SUB it is handed over with the overshoot as its new position.
 *   Heading into anything else, it goes as far as END and is offered there every tick.
 *   Every other item stays at least GAP behind the one in front of it.
 */
function stepLane(state, c, it, dir, to, f1, f2) {
  if (!it.length) return;
  const back = state.back;
  // The lane it joins as if from behind, if any (a belt straight on or round a corner, or an
  // Overpass lane running the same way).
  let next = null, nn = -1;
  const q = to >= 0 ? back[to] : 0;
  if (q && q.k === 'conv' && fromBehind(c, to, q, dir)) { next = q.it; nn = c.nodeAt[to * 2]; }
  else if (q && q.k === 'over' && c.od[to * 2 + (dir & 1)] === dir) { next = dir & 1 ? q.b : q.a; nn = c.nodeAt[to * 2 + (dir & 1)]; }
  // The front item first, so that when it is handed over the one behind it moves up the same tick:
  // a line that was held up starts again all together. (Two items are never at one position, so a
  // position names an item: f1 and f2 are those of items that came on this tick and stay put.)
  if (it[1] !== f1 && it[1] !== f2) {
    const lean = next ? leanFor(c, next, nn, it[1]) : 0;
    advance(it, 1, frontCap(next, lean));
    if (to >= 0 && (next ? it[1] >= SUB : it[1] >= END)) {
      c.lean = lean;
      c.leanAt = to;
      const gone = give(state, to, it[0], dir, next ? it[1] - SUB : 0);
      c.lean = 0;
      c.leanAt = -1;
      if (gone) {
        takeOff(it, 0);
        if (!it.length) return;
        // (The new front item is at least GAP behind where the old one was, so it cannot reach the
        // end of the tile this tick: one hand-over a tick at most. The item just handed over has not
        // moved in its new lane yet, so no allowance now.)
        if (it[1] !== f1 && it[1] !== f2) advance(it, 1, frontCap(next, 0));
      }
    }
  }
  for (let k = 3; k < it.length; k += 2) if (it[k] !== f1 && it[k] !== f2) advance(it, k, it[k - 2] - GAP);
}

/**
 * How far a lane's front item may go: into the lane `next` it joins straight on, up to GAP behind
 * that lane's last item (anywhere if it is empty); with no such lane (null), END.
 */
function frontCap(next, lean) {
  if (!next) return END;
  return next.length ? SUB + next[next.length - 1] + lean - GAP : SUB + STEP;
}

/**
 * The allowance at the break of a ring. The lane that hands into the ring's first tile (node nn,
 * lane `next`) is stepped before that tile has moved this tick, so measured against where its last
 * item is now, a ring with no space anywhere would never move at all. So the hand-over across the
 * break may assume that last item will move one STEP on this tick: the front item (at `front`) may
 * come up to GAP - STEP of where it is now. If it then does not move (the ring is held up
 * somewhere), those two sit up to one STEP closer than GAP until it moves again. Never more, and
 * never a second pair: the allowance is given only while the pair across the join is at least GAP
 * apart, the last item has not just come on and is itself at least GAP behind the item ahead of it.
 * Anywhere but a ring's break the lane handed into has already moved, and there is no allowance.
 * @returns {number} STEP or 0
 */
function leanFor(c, next, nn, front) {
  const n = next.length;
  if (!c.running || nn < 0 || c.stamp[nn] === c.pass || !n) return 0;
  const last = next[n - 1];
  if (last === c.freshA[nn] || last === c.freshB[nn]) return 0;
  if (n >= 4 && next[n - 3] - last < GAP) return 0;
  if (SUB - front + last < GAP) return 0;
  return STEP;
}

/** Moves the item at position index k (odd) of a lane STEP on, but not past `cap`, never back. */
function advance(it, k, cap) {
  const p = it[k] + STEP < cap ? it[k] + STEP : cap;
  if (p > it[k]) it[k] = p;
}

/**
 * One tick of The Back: every lane and part in the cached order, downstream first. Runs once per
 * tick in the build pause and during sales events, before the security buildings fire (step.js).
 * `ev`, if given, collects its events: binned {i, v, by} when a Clearance Bin is paid for a supply.
 */
export function stepBack(state, ev = null) {
  const back = state.back;
  if (!back) return;
  const c = cacheOf(state);
  const { order, kinds, tiles, dirs, to } = c;
  if (!order.length) return;
  c.pass++;
  c.running = true;
  c.ev = ev;
  for (let q = 0; q < order.length; q++) {
    const m = order[q], i = tiles[m], d = dirs[m], kind = kinds[m];
    const p = back[i];
    switch (kind) {
      case CONV:
      case OVA:
      case OVB: {
        const f1 = c.freshA[m], f2 = c.freshB[m];
        c.freshA[m] = c.freshB[m] = -1;
        c.stamp[m] = c.pass;
        stepLane(state, c, laneOf(back, kind, i), d, to[m * 3], f1, f2);
        break;
      }
      case SPLIT: {
        // Offers what it holds to the front, left and right in turn, starting after the way that
        // took the last item and skipping any that do not want it: shared evenly among those open.
        // Not what it was handed earlier this tick, before its turn (a ring's break: see give).
        const now = c.freshA[m] >= 0;
        c.freshA[m] = -1;
        c.stamp[m] = c.pass;
        if (!p.h || now) break;
        for (let n = 1; n <= 3; n++) {
          const k = (p.r + n) % 3;
          const t = to[m * 3 + k];
          const way = k === 0 ? d : k === 1 ? (d + 3) & 3 : (d + 1) & 3;
          if (t >= 0 && give(state, t, p.h, way, 0)) { p.h = 0; p.r = k; break; }
        }
        break;
      }
      case INTERN: {
        const front = to[m * 3];
        if (p.h) {
          if (p.t > 0) p.t--;
          if (p.t <= 0 && front >= 0 && give(state, front, p.h, d, 0)) p.h = 0;
        }
        if (!p.h && front >= 0) {
          // Takes the front-most item on the belt behind him that the tile in front wants now.
          const s = c.from[m], b = s >= 0 ? back[s] : null;
          if (b && b.k === 'conv') {
            for (let k = 0; k < b.it.length; k += 2) {
              if (!wants(state, front, b.it[k], d)) continue;
              p.h = b.it[k];
              p.t = Math.max(1, Math.round(BACK.internSecs * TICK_HZ));
              takeOff(b.it, k);
              break;
            }
          }
        }
        break;
      }
      case DROP: {
        // A piece of junk every dropTicks; it waits while the tile in front will not take it.
        if (p.t > 0) p.t--;
        const front = to[m * 3];
        if (p.t <= 0 && front >= 0 && give(state, front, JUNK, d, 0)) p.t = dropTicks(p.lv);
        break;
      }
    }
  }
  c.running = false;
  c.ev = null;
}

// ---------------------------------------------------------------------------------------------
// Placing

/**
 * Checks whether a player may put a Back part of kind k on (x, y) (canPlace's partner for The
 * Back). Nothing in The Back blocks shoppers, so no route check is needed.
 * @returns {string|null} null if allowed, otherwise the reason: 'over', 'lobby', 'cards', 'paused'
 *   as for canPlace; 'kind' not a Back part a player may buy (the Returns Drop is the map's);
 *   'bounds' off the map or a wall (the store's walls and shelves go all the way down);
 *   'occupied'; 'cash'. A belt laid on a belt just turns it, free, as on the shop floor.
 */
export function canPlaceBack(state, k, x, y, pid = 0, d = 0) {
  if (state.phase === 'won' || state.phase === 'lost') return 'over';
  if (state.phase === 'lobby') return 'lobby';
  if (state.phase === 'cards') return 'cards';
  if (state.pause) return 'paused';
  const def = buildDef(k);
  if (!def || !def.back || def.fixed) return 'kind';
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(state, x, y) || !state.back) return 'bounds';
  const i = idxOf(state, x, y);
  if (state.tiles[i] === '#') return 'bounds';
  const q = state.back[i];
  if (q) return k === 'conv' && q.k === 'conv' ? null : 'occupied';
  const player = state.players[pid];
  if (!player || player.cash < buildPrice(state, k)) return 'cash';
  return null;
}
