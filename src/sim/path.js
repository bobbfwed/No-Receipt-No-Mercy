// Shopper pathfinding. One flood fill from the tills gives every tile its walking distance to
// the nearest till; shoppers simply step to the neighbour with the smallest number.
// There are five such maps, because some shoppers get through things others cannot:
//   NORMAL  most shoppers: security buildings (but Wet Floor Signs) and crates block
//   DAD     dads (0.4): they walk through every building; only the store's walls and live Razor
//           Wire stop them (wire.js). (Until 0.4 they only stepped over the old factory's belts.)
//   SMASH   gym bros: they walk through crate stacks (and wreck them), while they still can hit
//           things; resting after a hit, or spent, they walk by NORMAL (see routeOf)
//   GHOST   runaway children: only the store's own walls stop them
//   DADPLAN nobody walks it: the dads' map as it would be if every planned wire were stocked
//           (walls and all wire block). The wire command is refused if it cuts a way on it, and
//           the interface draws the route it gives.
import { DIRS, BUILD, SHOPPERS, TUNE, defOf } from './constants.js';
import { cardSmash } from './cards.js';
import { wireMap } from './wire.js';

export const UNREACHABLE = 65535;
export const NORMAL = 0, DAD = 1, SMASH = 2, GHOST = 3, DADPLAN = 4;

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
 * @param {number} [mode] NORMAL, DAD, SMASH, GHOST or DADPLAN
 */
export function walkable(state, i, mode = NORMAL) {
  // (A shut entrance counts as floor, so the check that the maze leaves every entrance a way
  // to the tills covers the ones that have not opened yet.)
  if (state.tiles[i] === '#') return false;
  if (mode === GHOST) return true;
  // Dads walk through every building (0.4): only wire stops them, live wire on their own map.
  if (mode === DAD) return wireMap(state).live[i] < 0;
  if (mode === DADPLAN) return !wireMap(state).plan[i];
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
 * Flood fill: the walking distance from every tile to the nearest of some starting tiles.
 * @param {(i: number) => boolean} isStart
 * @param {Int32Array|Uint16Array|null} [wire] the dads' maps (0.4): wire that blocks, as wireBlock
 *   gives it (live anchors, -1 for none; or planned counts, 0 for none). With it, only the store's
 *   walls and that wire block, and a till under wire is no way out.
 */
function flood(state, isStart, extraBlocked, mode, wire = wireBlock(state, mode)) {
  const W = state.w, H = state.h, n = W * H;
  const dist = new Uint16Array(n).fill(UNREACHABLE);
  const queue = new Int32Array(n);
  const tiles = state.tiles;
  // (Live wire is kept as the anchor covering each tile, -1 for none; planned wire as a count.)
  const none = wire instanceof Int32Array ? -1 : 0;
  // A building bigger than one tile is tested by blocking all of its tiles at once.
  const many = Array.isArray(extraBlocked) ? new Set(extraBlocked) : null;
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) {
    if (isStart(i) && (!wire || wire[i] === none)) { dist[i] = 0; queue[tail++] = i; }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % W, y = (i / W) | 0, d = dist[i] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const t = ny * W + nx;
      if (dist[t] !== UNREACHABLE || t === extraBlocked || (many && many.has(t))) continue;
      if (wire ? tiles[t] === '#' || wire[t] !== none : !walkable(state, t, mode)) continue;
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
 * @param {number} [mode] NORMAL, DAD, SMASH, GHOST or DADPLAN
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

/** banksOpen on any map (with `wire` as flood takes it, for the dads' planned map). */
function banksJoined(state, extraBlocked, mode, wire) {
  const banks = tillBanks(state);
  if (banks.length < 2) return true;
  const first = new Set(banks[0]);
  const dist = flood(state, (i) => first.has(i), extraBlocked, mode, wire);
  return banks.every((bank) => bank.some((t) => dist[t] !== UNREACHABLE));
}

function cacheOf(state) {
  let hit = cache.get(state);
  if (!hit || hit.ver !== state.gridVer) {
    hit = { ver: state.gridVer, fields: [null, null, null, null, null], to: new Map() };
    cache.set(state, hit);
  }
  return hit;
}

/**
 * The distance map for the current layout, worked out only when the layout changes.
 * @param {number} [mode] NORMAL, DAD, SMASH or GHOST
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

/** The map most shoppers walk by. */
export const getDist = (state) => getField(state, NORMAL);
/** The map dads walk by: only walls and live Razor Wire block it (0.4; see DAD at the top). */
export const getDadDist = (state) => getField(state, DAD);
/** The map dads would walk by if every planned wire were stocked (DADPLAN at the top). */
export const getDadPlanDist = (state) => getField(state, DADPLAN);
