// Shopper pathfinding. One flood fill from the tills gives every tile its walking distance to
// the nearest till; shoppers simply step to the neighbour with the smallest number.
// There are seven such maps, because some shoppers get through things others cannot:
//   NORMAL  most shoppers: security buildings (but Wet Floor Signs), crates and, since 0.4.01, live
//           Razor Wire block (the owner: ordinary people would not walk into razor wire either;
//           they see it and go round, so they never use it up)
//   DAD     dads (0.4): they walk through every building; only the store's walls and live Razor
//           Wire stop them (wire.js). (Until 0.4 they only stepped over the old factory's belts.)
//   SMASH   gym bros: they walk through crate stacks (and wreck them), while they still can hit
//           things; resting after a hit, or spent, they walk by NORMAL (see routeOf). Live wire
//           stops them as it stops everyone else (0.4.01): a crate under live wire is not in reach
//   GHOST   runaway children: only the store's own walls stop them
//   DADPLAN nobody walks it: the dads' map as it would be if every planned wire were stocked
//           (walls and all wire block). The wire command is refused if it cuts a way on it, and
//           the interface draws the route it gives.
//   PLAN    nobody walks it (0.4.01): NORMAL as it would be if every planned wire were stocked. Every
//           check that a change does not shut shoppers off uses it (shopPlanCheck), so wire that
//           goes live later can never close the last way through.
//   FREE    NORMAL without any wire (0.4.01): the way out for a shopper caught on wire that went
//           live under him, or shut in by it, until he is somewhere with a way to the tills again.
import { DIRS, BUILD, SHOPPERS, TUNE, ST, defOf } from './constants.js';
import { cardSmash } from './cards.js';
import { wireMap } from './wire.js';

export const UNREACHABLE = 65535;
export const NORMAL = 0, DAD = 1, SMASH = 2, GHOST = 3, DADPLAN = 4, PLAN = 5, FREE = 6;

const cache = new WeakMap();

/** Which map a kind of shopper walks by (a gym bro's when he can hit things: see routeOf). */
export function modeOf(kind) {
  // (The boss is not in SHOPPERS; he walks like anyone else.)
  const def = SHOPPERS[kind];
  if (!def) return NORMAL;
  return def.dad ? DAD : def.smashes ? SMASH : NORMAL;
}

/**
 * True if a gym bro may hit something right now: he has hits left this visit (TUNE.smashMax) and
 * is not resting after his last one (TUNE.smashWait). A shopper saved before these limits existed
 * has neither field, which reads as no hits made and no rest.
 * @param {Object} s a shopper from the game state
 * @param {Object} [def] his definition, if the caller already has it
 * @param {Object} [state] the game, so its cards count (the preworkout card: cardSmash); the
 *   simulation always passes it
 */
export function smashReady(s, def = defOf(s), state = null) {
  return !(s.hw > 0) && (s.hn | 0) < (def.smashMax ?? TUNE.smashMax) * (state ? cardSmash(state, s) : 1);
}

/**
 * The map one shopper in the game walks by right now. A gym bro who is resting after a hit, or
 * has used up his hits, walks round crates like anyone else.
 * @param {Object} s a shopper from the game state
 * @param {Object} [state] the game (see smashReady)
 */
export function routeOf(s, state = null) {
  const mode = modeOf(s.k);
  return mode === SMASH && !smashReady(s, defOf(s), state) ? NORMAL : mode;
}

/**
 * True if a shopper can stand on this tile.
 * @param {number} [mode] NORMAL, DAD, SMASH, GHOST, DADPLAN, PLAN or FREE
 */
export function walkable(state, i, mode = NORMAL) {
  // (A shut entrance counts as floor, so the check that the maze leaves every entrance a way
  // to the tills covers the ones that have not opened yet.)
  if (state.tiles[i] === '#') return false;
  if (mode === GHOST) return true;
  // Dads walk through every building (0.4): only wire stops them, live wire on their own map.
  if (mode === DAD) return wireMap(state).live[i] < 0;
  if (mode === DADPLAN) return !wireMap(state).plan[i];
  // Everyone else goes round live wire (0.4.01), and the checks round every planned wire.
  if ((mode === NORMAL || mode === SMASH) && wireMap(state).live[i] >= 0) return false;
  if (mode === PLAN && wireMap(state).plan[i]) return false;
  const b = state.grid[i];
  if (!b || !BUILD[b.k].blocks) return true;
  return mode === SMASH && b.k === 'crate';
}

/**
 * The wire a dads' map treats as blocked, for flood: a per-tile array where anything but 0 (or -1
 * for live wire's anchors) blocks, or null for the other maps.
 */
function wireBlock(state, mode) {
  if (mode === DAD) return wireMap(state).live;
  if (mode === DADPLAN) return wireMap(state).plan;
  return null;
}

/**
 * Flood fill: the walking distance from every tile to the nearest of some starting tiles. A
 * starting tile the map does not let anyone stand on (a till under wire) is no way out.
 * @param {(i: number) => boolean} isStart
 * @param {Int32Array|Uint16Array|null} [wire] the dads' maps (0.4): wire that blocks, as wireBlock
 *   gives it (live anchors, -1 for none; or planned counts, 0 for none). With it, only the store's
 *   walls and that wire block.
 * @param {Uint16Array} [plan] the PLAN map (0.4.01): the planned wire to treat as blocked, counts per
 *   tile as wireMap's plan (or a changed copy, from planWith, to test a wire command)
 */
function flood(state, isStart, extraBlocked, mode, wire = wireBlock(state, mode), plan = mode === PLAN ? wireMap(state).plan : null) {
  const W = state.w, H = state.h, n = W * H;
  const dist = new Uint16Array(n).fill(UNREACHABLE);
  const queue = new Int32Array(n);
  const tiles = state.tiles;
  // (Live wire is kept as the anchor covering each tile, -1 for none; planned wire as a count.)
  const none = wire instanceof Int32Array ? -1 : 0;
  // A building bigger than one tile is tested by blocking all of its tiles at once.
  const many = Array.isArray(extraBlocked) ? new Set(extraBlocked) : null;
  const grid = state.grid;
  const pass = wire ? (t) => tiles[t] !== '#' && wire[t] === none
    : plan ? (t) => tiles[t] !== '#' && !plan[t] && (!grid[t] || !BUILD[grid[t].k].blocks)
      : (t) => walkable(state, t, mode);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) {
    if (isStart(i) && pass(i)) { dist[i] = 0; queue[tail++] = i; }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % W, y = (i / W) | 0, d = dist[i] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const t = ny * W + nx;
      if (dist[t] !== UNREACHABLE || t === extraBlocked || (many && many.has(t))) continue;
      if (!pass(t)) continue;
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
 * @param {number} [mode] NORMAL, DAD, SMASH, GHOST, DADPLAN, PLAN or FREE
 * @returns {Uint16Array}
 */
export function computeDist(state, extraBlocked = -1, mode = NORMAL) {
  const tiles = state.tiles;
  return flood(state, (i) => tiles[i] === 'T', extraBlocked, mode);
}

/**
 * The check the `wire` command makes (0.4): with `plan` as the planned wire (counts per tile, as
 * wireMap's `plan`, usually from planWith), does every entrance, open or shut, keep a way to the
 * tills on the dads' planned map, and every bank of tills a way to the others? The same guarantees
 * canPlace gives ordinary shoppers on NORMAL. Live wire is always part of planned wire, so passing
 * this means the live map cannot be cut off either.
 * @returns {string|null} null if it does, otherwise 'blocked'
 */
export function dadPlanCheck(state, plan) {
  const tiles = state.tiles;
  const dist = flood(state, (i) => tiles[i] === 'T', -1, DADPLAN, plan);
  for (const door of state.doors) for (const t of door) if (dist[t] === UNREACHABLE) return 'blocked';
  return banksJoined(state, -1, DADPLAN, plan) ? null : 'blocked';
}

/**
 * The check every change that could shut shoppers off makes (0.4.01: placing or rebuilding a
 * building, turning one, the wire command, a wreck's wire coming back): on the PLAN map with
 * `plan` as the planned wire (counts per tile; the store's own by default, or a changed copy from
 * planWith) and `extraBlocked` as for computeDist (a building being tested), does every entrance,
 * open or shut, keep a way to the tills, every bank of tills a way to the others, and every shopper
 * in the store who has a way out now keep one? (A dad is left out: he walks by his own map. A
 * shopper standing on planned wire is left out: if it goes live under him he walks off it.)
 * Live wire is always part of planned wire, so passing this means stock arriving later can never
 * close the last way through.
 * @returns {string|null} null if it does; 'blocked' (an entrance or a shopper cut off) or 'bank'
 */
export function shopPlanCheck(state, plan = wireMap(state).plan, extraBlocked = -1) {
  const tiles = state.tiles;
  const dist = flood(state, (i) => tiles[i] === 'T', extraBlocked, PLAN, null, plan);
  for (const door of state.doors) for (const t of door) if (dist[t] === UNREACHABLE) return 'blocked';
  if (!banksJoined(state, extraBlocked, PLAN, null, plan)) return 'bank';
  let before = null;
  const W = state.w;
  for (const s of state.shoppers) {
    if (s.st === ST.LEAVE || modeOf(s.k) === DAD) continue;
    const t = ((s.y | 0) * W) + (s.x | 0);
    if (dist[t] !== UNREACHABLE || plan[t]) continue;
    // (Only one this change would shut in: one already without a way out on the planned map, who
    // came in over wire that is not stocked yet, is not this change's doing.)
    before ||= getField(state, PLAN);
    if (before[t] !== UNREACHABLE) return 'blocked';
  }
  return null;
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
  return banksJoined(state, extraBlocked, NORMAL);
}

/** banksOpen on any map (with `wire` and `plan` as flood takes them, for the planned maps). */
function banksJoined(state, extraBlocked, mode, wire, plan) {
  const banks = tillBanks(state);
  if (banks.length < 2) return true;
  const first = new Set(banks[0]);
  const dist = flood(state, (i) => first.has(i), extraBlocked, mode, wire ?? undefined, plan ?? undefined);
  return banks.every((bank) => bank.some((t) => dist[t] !== UNREACHABLE));
}

function cacheOf(state) {
  let hit = cache.get(state);
  if (!hit || hit.ver !== state.gridVer) {
    hit = { ver: state.gridVer, fields: [null, null, null, null, null, null, null], to: new Map() };
    cache.set(state, hit);
  }
  return hit;
}

/**
 * The distance map for the current layout, worked out only when the layout changes (gridVer: wire
 * going live or dead moves it on too).
 * @param {number} [mode] NORMAL, DAD, SMASH, GHOST, DADPLAN, PLAN or FREE
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

/**
 * Distance from every tile to the nearest open entrance, as a runaway child runs (only the store's
 * walls stop him). A child who runs the wrong way (the wrongway card) runs down it. Worked out
 * when the layout or the number of open entrances changes.
 */
export function getBackField(state) {
  const hit = cacheOf(state);
  if (!hit.back || hit.back.open !== state.open) {
    const doors = new Set(state.doors.slice(0, state.open).flat());
    hit.back = { open: state.open, f: flood(state, (i) => doors.has(i), -1, GHOST) };
  }
  return hit.back.f;
}

/**
 * The tile a shopper on tile i steps to next on a distance map: the neighbour with the smallest
 * number, i itself if none is smaller. Neighbours are tried in DIRS order starting at `id & 3`, so
 * a crowd spreads out over equal ways (step.js has the same walk for everyone else); id 0 is the
 * fixed tie-break of the dad route traces (dadRoute).
 */
export function nextOn(state, field, i, id = 0) {
  const W = state.w, H = state.h, x = i % W, y = (i / W) | 0;
  let best = i, bd = field[i];
  for (let k = 0; k < 4; k++) {
    const dir = DIRS[(k + id) & 3], nx = x + dir[0], ny = y + dir[1];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const ni = ny * W + nx;
    if (field[ni] < bd) { bd = field[ni]; best = ni; }
  }
  return best;
}

/** dadDecide's answer, reused so that a dad's step makes no garbage. */
const DD = { next: -1, bump: -1, test: -1, dm: 0 };

/**
 * Which way a dad goes from tile t (0.4: dads are dumb, they walk into the wire). `dad` is his map
 * with the wire that counts (the DAD map, or DADPLAN for "if every wire were stocked"), `ghost` the
 * walls-only map, `wire` that wire per tile (live anchors with -1 for none, or planned counts with
 * 0), `dm` whether he is already going round. He is obstructed when dad(t) > ghost(t): wire makes
 * his way longer.
 *   0. No way to a till from t on his map (under wire, or shut in by it): he climbs out by the
 *      walls-only map; nothing else changes.
 *   1. Not obstructed: a step by his map, and he is no longer going round.
 *   2. Obstructed, not yet going round: g, his next walls-only step. If g is not under wire he
 *      steps to it (he walks on toward where his straight way is blocked). If it is, he bumps into
 *      the wire there (`bump` is g), is going round from now on, and steps by his map instead.
 *   3. Obstructed and going round: if g is under wire he tests that stretch of fence (`test` is g),
 *      then steps by his map.
 * Each step makes progress: walking toward the wire the walls-only distance falls, going round and
 * walking free his own distance falls, and once free he never becomes obstructed again on the same
 * layout. Returns DD: { next, bump, test (tiles or -1), dm (0 or 1) }.
 */
export function dadDecide(state, t, dm, dad, ghost, wire, id = 0) {
  const none = wire instanceof Int32Array ? -1 : 0;
  DD.bump = -1;
  DD.test = -1;
  DD.dm = dm ? 1 : 0;
  if (dad[t] === UNREACHABLE) { DD.next = nextOn(state, ghost, t, id); return DD; }
  if (dad[t] <= ghost[t]) { DD.dm = 0; DD.next = nextOn(state, dad, t, id); return DD; }
  const g = nextOn(state, ghost, t, id);
  const fenced = g !== t && wire[g] !== none;
  if (!dm) {
    if (!fenced) { DD.next = g; return DD; }
    DD.bump = g;
    DD.dm = 1;
  } else if (fenced) DD.test = g;
  DD.next = nextOn(state, dad, t, id);
  return DD;
}

const routes = new WeakMap();

/**
 * The tiles a dad who walks in at tile `from` would walk, to a till, under the dads' rule
 * (dadDecide), with the fixed tie-break (the first choice in DIRS order: what a dad whose id is a
 * multiple of 4 does). `planned` false: with the live wire, as dads walk now; true: as if every
 * planned wire were stocked. The wire is not used up along the way. For the interface's two dad
 * routes. Cached against the layout (gridVer); the result is shared: do not change it.
 * @returns {number[]} tile indexes, `from` first
 */
export function dadRoute(state, from, planned = false) {
  let hit = routes.get(state);
  if (!hit || hit.ver !== state.gridVer) {
    hit = { ver: state.gridVer, live: new Map(), plan: new Map() };
    routes.set(state, hit);
  }
  const memo = planned ? hit.plan : hit.live;
  let out = memo.get(from);
  if (out) return out;
  const dad = getField(state, planned ? DADPLAN : DAD), ghost = getField(state, GHOST);
  const wire = planned ? wireMap(state).plan : wireMap(state).live;
  out = [from];
  let t = from, dm = 0;
  // (Each step makes progress, so a route is never longer than the floor; the guard is a belt and braces.)
  for (let n = 0; n < state.tiles.length && state.tiles[t] !== 'T'; n++) {
    const d = dadDecide(state, t, dm, dad, ghost, wire, 0);
    dm = d.dm;
    if (d.next === t) break;
    t = d.next;
    out.push(t);
  }
  memo.set(from, out);
  return out;
}

/** The map most shoppers walk by. */
export const getDist = (state) => getField(state, NORMAL);
/** The map dads walk by: only walls and live Razor Wire block it (0.4; see DAD at the top). */
export const getDadDist = (state) => getField(state, DAD);
/** The map dads would walk by if every planned wire were stocked (DADPLAN at the top). */
export const getDadPlanDist = (state) => getField(state, DADPLAN);
