// Game state: creation, random numbers, players, money. The state is a plain JSON-safe object so
// the host can send it to the other players as-is.
import { TUNE, MAX_PLAYERS, PLAYER_COLORS, ROLES, SETTINGS, TICK_HZ, BUILD } from './constants.js';
import { makeMap, makeZones, MAP_DESIGNS, MAP_SIZES } from './maps.js';

/**
 * A building. One bigger than a tile (BUILD[k].size) is held by the top-left tile of its
 * footprint, the "anchor"; every other tile of it holds only `{ k, part }`, where `part` is the
 * anchor's tile index. All the building's state lives on the anchor, so anything that acts once
 * per building must skip tiles with `part` set.
 * @typedef {Object} Building
 * @property {string} k   kind, a key of BUILD
 * @property {number} [part] only on the other tiles of a big building: the anchor's tile index
 * @property {number} o   owner player id
 * @property {number} [d] facing direction 0-3
 * @property {{dmg?: number, spd?: number, rng?: number, dur?: number}} [u] upgrade levels bought
 *   in each track (absent or 0 = none; absent altogether until the first upgrade)
 * @property {number} [hit] gym bro hits taken this wave (cleared when a wave ends)
 * @property {number} [off] ticks it stays switched off (a dog peed on it); absent when working
 * @property {Array<[string, number]>} [it] belt only: items as [itemKind, progress 0..1], front item first
 * @property {number} [t]   machines: ticks left on the current job; unpacker: ticks until next box
 * @property {number} [n]   press/packer: inputs waiting
 * @property {string|0} [out] press/packer: finished item waiting to leave
 * @property {number} [cd]  towers: ticks until it can fire again
 * @property {number} [a]   forklift: aim angle in radians (for drawing)
 */

/** A kind's footprint in tiles, [w, h], for a facing: turned on its side facing north or south. */
export function sizeOf(k, d = 0) {
  const s = (BUILD[k] && BUILD[k].size) || [1, 1];
  return d & 1 ? [s[1], s[0]] : [s[0], s[1]];
}

/**
 * The tile indexes a building of kind k would cover with its top-left tile at (x, y), facing d,
 * anchor first; or null if any of them is off the map.
 */
export function footprint(state, k, x, y, d = 0) {
  const [w, h] = sizeOf(k, BUILD[k] && BUILD[k].rot ? d : 0);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + w > state.w || y + h > state.h) return null;
  const out = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push((y + dy) * state.w + x + dx);
  return out;
}

/** The anchor tile of the building on tile i (i itself for a 1 x 1 building or an empty tile). */
export function anchorOf(state, i) {
  const b = state.grid[i];
  return b && b.part !== undefined ? b.part : i;
}

/** The tiles a building covers, from its anchor tile. */
export function tilesOf(state, ai) {
  const b = state.grid[ai];
  if (!b) return [ai];
  return footprint(state, b.k, ai % state.w, (ai / state.w) | 0, b.d | 0) || [ai];
}

/** The centre of a building's footprint, in tiles, from its anchor tile. */
export function centreOf(state, ai, b = state.grid[ai]) {
  const [w, h] = sizeOf(b.k, BUILD[b.k].rot ? b.d | 0 : 0);
  return [(ai % state.w) + w / 2, ((ai / state.w) | 0) + h / 2];
}

/**
 * @typedef {Object} Shopper
 * @property {number} id
 * @property {string} k   kind, a key of SHOPPERS, or 'boss' (see BOSS in constants.js), or 'baby'
 *                        (one of a Pregnant Lady's babies, see BABY; they have none of the extra
 *                        fields below and are never super)
 * @property {number} [sup] 1 if this is the super version of its kind (see SUPERS in constants.js)
 * @property {number} x   position in tiles (tile centre is n + 0.5)
 * @property {number} y
 * @property {number} vx  movement during the last tick, in tiles (for smooth drawing)
 * @property {number} vy
 * @property {number} hp  patience left
 * @property {number} mhp starting patience
 * @property {number} st  state, one of ST
 * @property {number} t   ticks left in the current non-walking state
 * @property {number} cd  ticks until this shopper can be distracted again
 * @property {number} ox  personal offset inside a tile, so crowds do not walk in one line
 * @property {number} oy
 * @property {number} lt  index of the tile the shopper was on last tick
 * @property {number} [m]   teenager: ticks until the next mess
 * @property {number} [bt]  man with guide dog: ticks left of the dog bolting (he moves fast)
 * @property {number} [sm]  gym bro: ticks until he next tries to wreck something beside him
 * @property {number} [hn]  gym bro: hits he has landed this visit (he stops at TUNE.smashMax, or his
 *                          super's own number); absent reads as 0
 * @property {number} [hw]  gym bro: ticks left of his rest after a hit (TUNE.smashWait); while it
 *                          runs, and once hn is used up, he walks round crates like anyone else;
 *                          absent reads as 0
 * @property {number} [kd]  mom: where the child is. 0 in the cart, 1 running away, 2 waiting to be
 *                          caught, 3 carried in her arms (she lost the cart; he never runs again)
 * @property {number} [kx]  mom: the loose child's position in tiles (only meaningful when kd is 1 or 2)
 * @property {number} [ky]
 * @property {number} [kvx] mom: the child's movement during the last tick (for smooth drawing)
 * @property {number} [kvy]
 * @property {number} [kr]  mom: tiles the child will still run
 * @property {number} [kc]  mom: ticks before the child may escape again
 * @property {number} [kn]  mom: how many times the child has run away
 * @property {number} [kl]  mom: the last tile the running child passed where he may wait
 * @property {number} [kt]  mom: 1 once this escape's chance to stop at a salesman's television is used
 * @property {number} [cr]  mom: 1 while she is crawling to her child (nothing can hurt her)
 * @property {number} [crn] mom: how many times she has crawled to him and got up again
 * @property {number} [nc]  mom: 1 once she has left her cart behind (she then carries the child)
 * @property {number} [pc]  ticks before a salesman can pitch to this shopper again
 * @property {Object<string, number>} [pn] how many times each salesman (keyed by his tile) has
 *   pitched to this shopper; each pitch after the first works TUNE.pitchRepeat times as well
 * @property {number} [sa]  the tile of the salesman's stand he is walking over to (then he watches)
 * @property {number} [sw]  ...how many ticks he will watch for when he gets there
 * @property {number} [sl]  ...and how many ticks he has left to get there
 * @property {number} [ru]  ticks left hurrying away from a salesman (moves faster)
 * @property {number} [lf]  browsing shoppers: the floor tile beside a belt he has left his route to
 *                          steal from (see liftLook in step.js); absent when he is not doing it
 * @property {number} [lw]  ...and the ticks he will still give it, getting there and waiting
 *                          (absent with lf)
 * @property {number} [gz]  dads and teenagers: ticks before an exhibitionist can catch his eye again
 * @property {number} [fl]  exhibitionist: ticks left with her bathrobe open (for drawing)
 *                          (her `m` is the ticks until she next opens it)
 * @property {number} [sh]  cosplayer: the tick of his last 'shield' event
 * @property {number} [sv]  day drinker: his speed multiplier right now
 * @property {number} [dr]  day drinker: the direction he last walked in, 0-3
 * @property {number} [tr]  boss: his tier, 1 in wave 5, 2 in wave 10 ... (BOSS.titles[min(tr, 4) - 1]
 *                          is what he is called)
 * @property {number} [pp]  boss: ticks until his next pep talk
 *                          (a dog's `cd` is the ticks until it can pee again)
 */

/**
 * @typedef {Object} Player
 * @property {number} id     index into state.players
 * @property {string} name
 * @property {string} color
 * @property {string} role   job title (cosmetic)
 * @property {boolean} on    connected right now
 * @property {boolean} ready  lobby only: he has pressed Ready
 * @property {string} side   'store' (builds and defends) or 'office' (runs the shoppers; see office.js)
 * @property {number} cash   this player's own money. Everything the store earns or loses is
 *                           split evenly between the connected players.
 * @property {number} [gone] how long he has been away, while his grace period runs, in ticks at
 *                          normal speed (so it measures real time at any game speed; see
 *                           setPlayerOnline). Absent when he is here, or away with nothing pending.
 * @property {boolean} [autoRebuild] his auto-rebuild switch (0.2.15; absent, as in older saves,
 *                          means off): step() puts back his wrecks for him (see autoRebuild in
 *                          commands.js)
 * @property {Object} w      statistics for this wave
 * @property {Object} all    statistics for the whole game
 */

function blankStats() {
  return { spent: 0, built: 0, sold: 0, shipped: 0, earned: 0, stopped: 0, annoy: 0 };
}

/**
 * Creates a new game in the first build phase.
 * @param {Object} [o]
 * @param {number} [o.seed]
 * @param {boolean} [o.training] training mode, used by the tutorial: the build phase never times
 *   out, the game cannot be lost, and waves are whatever queueTrainingWave() lines up.
 * @param {{design?: string, size?: string, slots?: number}} [o.map] the floor plan (see maps.js).
 *   Left out, it is the original small warehouse with a single entrance, which the tutorial and
 *   most tests are written for.
 * @param {boolean} [o.zones] mark out the floor areas the factory machines must be built on.
 *   On by default when a map is given; off for the bare default map.
 * @param {{waves?: number, startCash?: number, difficulty?: string}} [o.settings] the host's
 *   choices (see SETTINGS in constants.js); anything left out or not on the list is the default.
 * @param {boolean} [o.lobby] start in the lobby: nothing runs and nothing can be built until
 *   every connected player has said he is ready. The host may change the map there.
 */
export function createGame({ seed = 1, training = false, map = null, zones = !!map, lobby = false, settings = null } = {}) {
  const design = (map && map.design) || 'warehouse', size = (map && map.size) || 'xs';
  const plan = makeMap(design, size, map ? map.slots ?? MAX_PLAYERS : 1);
  const set = cleanSettings(settings);
  const state = {
    /** The version of the state's shape and rules (see STATE_VERSION and migrateSave). */
    v: STATE_VERSION,
    seed,
    training,
    /** Training mode only: the groups for the next wave, or null. */
    nextWave: null,
    rng: (seed >>> 0) || 1,
    tick: 0,
    /** The floor plan: which design and size, its width and height in tiles, and the tiles as
     *  one string, row by row (the characters are explained in maps.js). */
    map: { design, size },
    w: plan.w,
    h: plan.h,
    tiles: plan.tiles,
    /** What each solid tile looks like (the food court's tables, stalls and so on), one character
     *  per tile as listed in DECOR in maps.js, or '' for a design without furniture. Furniture is
     *  '#' in `tiles`; this is only for drawing. */
    decor: plan.decor,
    /** Marked floor for the factory machines: one character per tile, a key of ZONES or a
     *  space. An empty string means the map has no marked floor and machines go anywhere. */
    zones: zones ? makeZones(plan.w, plan.h, plan.tiles, plan.doors) : '',
    /** Entrances in the order they open, each a list of tile indexes; `open` of them are open. */
    doors: plan.doors,
    open: 0,
    /** @type {Array<Building|0>} */
    grid: new Array(plan.w * plan.h).fill(0),
    gridVer: 0,
    /** @type {Shopper[]} */
    shoppers: [],
    /** Messes teenagers have left on the floor, as [tile index, ticks left]. */
    messes: [],
    /** Carts moms have left behind this wave (when one goes down for the last time with her child
     *  loose; see the shopper's `nc`), as [x, y, sup, face]: where she fell, in tiles as decimals;
     *  1 if she was a Soccer Mom, else 0; 1 if she was facing right, else -1. Kept in the state so
     *  a player who joins mid-wave sees them too. Emptied when the wave ends. (A save from before
     *  it existed lacks it; the simulation makes it when first needed.) */
    carts: [],
    /** What gym bros have destroyed and nobody has rebuilt yet, oldest first, as
     *  { i, k, d, o, u, spent, at }: anchor tile, kind, facing, owner, upgrade levels (as on a
     *  building, possibly {}), what had been spent on it (spentOn), and the tick it broke (since
     *  0.2.15, for auto-rebuild's delay; rubble in an older save lacks it and counts as long
     *  broken). The 'rebuild' command, or placing the same kind there, puts them back at
     *  TUNE.rebuildShare of that. */
    rubble: [],
    nextId: 1,
    /** Shoppers still to arrive this wave, as [tick, kind, super 0|1, entrance or -1 for any],
     *  soonest first. */
    spawnQ: [],
    refunds: 0,
    /** Refunds that close the store. Grows with the number of players. */
    refundLimit: TUNE.refundLimit,
    wave: 0,
    /** The host's settings: how many waves (0: endless, see isEndless), each player's starting
     *  cash, and the difficulty (a key of SETTINGS.difficulty). */
    waves: set.waves,
    startCash: set.startCash,
    difficulty: set.difficulty,
    /** The tick the doors last opened. */
    waveAt: 0,
    /** 'lobby' | 'build' | 'wave' | 'won' | 'lost' */
    phase: lobby ? 'lobby' : 'build',
    /** Ticks left in the build phase; -1 means wait until a player starts the wave. */
    phaseT: -1,
    speed: 1,
    /** The player running the shoppers, if any: see office.js. */
    office: null,
    /** With a Head Office player: the store side has said the doors may open early. */
    storeReady: false,
    /** Totals for the current wave, shown in the performance review. */
    ws: { escaped: 0, stopped: 0, stolen: 0, earned: 0, refunded: 0, wrecked: 0 },
    /** @type {Player[]} */
    players: [],
    /** The player whose browser runs the game. Changes if the host leaves and another takes over. */
    host: 0,
  };
  openDoors(state);
  return state;
}

/**
 * The version of the game state. 4 since 0.2.09, when the refund limit was halved (20, plus 5 a
 * player) with the crowd; saves of version 3 are brought up to date by migrateSave.
 */
export const STATE_VERSION = 4;

/**
 * Brings a saved game from an older version up to this one, once, when it is resumed. A save
 * from this version on is left alone.
 * From 3: the refund limit was 40 plus 10 a player, and the state keeps it (it is recalculated
 * only when a new player joins, which would then drop it to the new formula with the old count:
 * 25 of 40 would become 25 of 25). So the limit is set from today's formula for the save's
 * players and the refunds are scaled by the same ratio, rounded down: the save keeps the share of
 * its limit it had used.
 * @returns {boolean} whether anything was changed
 */
export function migrateSave(state) {
  if (!state || (state.v | 0) >= STATE_VERSION) return false;
  const limit = TUNE.refundLimit + TUNE.refundPerPlayer * Math.max(0, state.players.length - 1);
  if (state.refundLimit > 0) state.refunds = Math.floor(((state.refunds || 0) * limit) / state.refundLimit);
  state.refundLimit = limit;
  state.v = STATE_VERSION;
  return true;
}

/** Deterministic random number in [0, 1). The generator's state lives in the game state. */
export function rand(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const idxOf = (state, x, y) => y * state.w + x;
export const inBounds = (state, x, y) => x >= 0 && y >= 0 && x < state.w && y < state.h;

/** Opens one entrance per player (always at least one). */
function openDoors(state) {
  const want = Math.max(1, Math.min(state.doors.length, state.players.length));
  if (want <= state.open) return;
  const t = state.tiles.split('');
  for (let d = state.open; d < want; d++) for (const i of state.doors[d]) t[i] = 'D';
  state.tiles = t.join('');
  state.open = want;
  state.gridVer++; // routes are drawn from the entrances
}

/** Settings with anything missing or not on the list replaced by the default. */
export function cleanSettings(o) {
  const d = SETTINGS.defaults, s = o || {};
  return {
    waves: SETTINGS.waves.includes(s.waves) ? s.waves : d.waves,
    startCash: SETTINGS.startCash.includes(s.startCash) ? s.startCash : d.startCash,
    difficulty: SETTINGS.difficulty[s.difficulty] ? s.difficulty : d.difficulty,
  };
}

/**
 * Lobby only: changes the host's settings. Nothing has been spent yet, so every player's cash
 * becomes the new starting cash, and everyone has to press Ready again.
 * @returns {boolean} false if the game has started
 */
export function setSettings(state, o) {
  if (state.phase !== 'lobby') return false;
  // Anything not mentioned keeps the value it has.
  const now = { waves: state.waves, startCash: state.startCash, difficulty: state.difficulty };
  for (const k of Object.keys(now)) if (o && o[k] !== undefined) now[k] = o[k];
  const set = cleanSettings(now);
  state.waves = set.waves;
  state.startCash = set.startCash;
  state.difficulty = set.difficulty;
  for (const p of state.players) { p.cash = set.startCash; p.ready = false; }
  return true;
}

/**
 * True in an endless game (state.waves is 0): there is no last sales event, the game is never
 * won, and it ends only when the refund limit is reached. A won game can be carried on as one with
 * the 'endless' command.
 */
export const isEndless = (state) => state.waves === 0;

/** The difficulty the game is played at: { hp, pay } multipliers. */
export const difficultyOf = (state) => SETTINGS.difficulty[state.difficulty] || SETTINGS.difficulty.normal;

/**
 * Lobby only: swaps the store for another design and size. The floor is empty in the lobby, so
 * nothing is lost. Everyone has to press Ready again, since it is not the map they agreed to.
 * @returns {boolean} false if the design or size is unknown, or the game has started
 */
export function setMap(state, design, size) {
  if (state.phase !== 'lobby' || !MAP_DESIGNS[design] || !MAP_SIZES[size]) return false;
  const plan = makeMap(design, size, state.doors.length);
  state.map = { design, size };
  state.w = plan.w;
  state.h = plan.h;
  state.tiles = plan.tiles;
  state.decor = plan.decor;
  state.doors = plan.doors;
  state.open = 0;
  if (state.zones) state.zones = makeZones(plan.w, plan.h, plan.tiles, plan.doors);
  state.grid = new Array(plan.w * plan.h).fill(0);
  state.gridVer++;
  for (const p of state.players) p.ready = false;
  openDoors(state);
  return true;
}

/** The entrance that belongs to a player: players beyond the last entrance share. */
export function doorOf(state, pid) {
  return state.doors[Math.min(Math.max(0, pid), state.open - 1)] || state.doors[0];
}

/**
 * Adds a player, or brings back a player of the same name who dropped out.
 * A new player gets his own money and his own entrance.
 * @returns {number} the player's id, or -1 if the game is full
 */
export function addPlayer(state, name) {
  const clean = String(name || 'Player').trim().slice(0, 14) || 'Player';
  const back = state.players.find((p) => !p.on && p.name === clean);
  if (back) { back.on = true; delete back.gone; return back.id; }
  if (state.players.length >= MAX_PLAYERS) return -1;
  const id = state.players.length;
  state.players.push({
    id, name: clean, color: PLAYER_COLORS[id % PLAYER_COLORS.length],
    role: ROLES[Math.min(id, ROLES.length - 1)], on: true, side: 'store', ready: false,
    cash: state.startCash + (id > 0 ? TUNE.joinCash * state.wave : 0),
    w: blankStats(), // this wave
    all: blankStats(), // whole game
  });
  state.refundLimit = TUNE.refundLimit + TUNE.refundPerPlayer * (state.players.length - 1);
  openDoors(state);
  return id;
}

/**
 * Marks a player as connected or not.
 * A player who drops out once the game is under way keeps his money for a grace period
 * (TUNE.graceSecs of real time), so a brief network blip costs him nothing. If he is still away
 * when it runs out, step() hands his money to those who stay (see expireAway). While away he
 * neither earns nor pays, like any absent player. In the lobby nothing is at stake.
 */
export function setPlayerOnline(state, id, on) {
  const p = state.players[id];
  if (!p) return;
  const was = p.on;
  p.on = on;
  if (on) delete p.gone;
  else if (was && state.phase !== 'lobby') p.gone = 0;
  // If nobody is left running the store, the Head Office player has to come back and do it.
  const o = state.office;
  if (o && !state.players.some((q) => q.on && q.side === 'store')) {
    if (state.players[o.pid]) state.players[o.pid].side = 'store';
    state.office = null;
    state.storeReady = false;
  }
}

/**
 * Called by step() every tick: anyone whose grace period has run out without his coming back
 * hands his money to those who stay, split evenly, and returns (if ever) with none. Leaving and
 * rejoining must not be a way to keep money safe from refunds. The last player left keeps his
 * money; the clock keeps running for him in case someone else turns up.
 */
export function expireAway(state) {
  const limit = Math.max(1, Math.round(TUNE.graceSecs * TICK_HZ));
  // At 2x, 3x or 5x speed the game runs that many ticks in the time of one, so each tick counts
  // for a half, a third or a fifth: the grace period is the same length on the clock at any speed.
  const passed = 1 / (state.speed || 1);
  for (const p of state.players) {
    if (p.gone === undefined || p.on) continue;
    p.gone += passed;
    if (p.gone < limit - 1e-6) continue;
    const stay = state.players.filter((q) => q.on && q.side !== 'office');
    if (!stay.length) continue;
    if (p.cash > 0) {
      for (const q of stay) q.cash = tidy(q.cash + p.cash / stay.length);
      p.cash = 0;
    }
    delete p.gone;
  }
}

/**
 * The players who share income and losses: everyone connected who is running the store (or
 * everyone running it, if nobody is connected). Head Office has no part in the store's money.
 */
function sharers(state) {
  const store = state.players.filter((p) => p.side !== 'office');
  const on = store.filter((p) => p.on);
  return on.length ? on : store.length ? store : state.players;
}

/** How many players are sharing right now (at least 1). */
export const shareCount = (state) => Math.max(1, sharers(state).length);

// Shares are rarely whole numbers; keep them to a thousandth so sums do not drift.
const tidy = (n) => Math.round(n * 1000) / 1000;

/** All the players' money added up. */
export function teamCash(state) {
  let sum = 0;
  for (const p of state.players) sum += p.cash;
  return Math.floor(sum + 1e-6);
}

/** Splits money the store earned evenly between the players. */
export function earn(state, amount) {
  const who = sharers(state);
  for (const p of who) p.cash = tidy(p.cash + amount / who.length);
}

/**
 * Splits a loss evenly between the players. Nobody goes below zero.
 * @returns {number} how much was actually paid
 */
export function lose(state, amount) {
  const who = sharers(state);
  let paid = 0;
  for (const p of who) {
    const part = Math.min(p.cash, amount / who.length);
    p.cash = tidy(p.cash - part);
    paid += part;
  }
  return tidy(paid);
}

/** Adds to one of a player's statistics, both for this wave and for the whole game. */
export function bump(state, pid, key, amount = 1) {
  const p = state.players[pid];
  if (!p) return;
  p.w[key] += amount;
  p.all[key] += amount;
}

export function resetWaveStats(state) {
  for (const p of state.players) p.w = blankStats();
  state.ws = { escaped: 0, stopped: 0, stolen: 0, earned: 0, refunded: 0, wrecked: 0 };
}
