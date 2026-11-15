// Game state: creation, random numbers, players. The state is a plain JSON-safe object so the
// host can send it to the other players as-is.
import { W, H, MAP, TUNE, MAX_PLAYERS, PLAYER_COLORS, ROLES } from './constants.js';

/**
 * @typedef {Object} Building
 * @property {string} k   kind, a key of BUILD
 * @property {number} o   owner player id
 * @property {number} [d] facing direction 0-3
 * @property {Array<[string, number]>} [it] belt only: items as [itemKind, progress 0..1], front item first
 * @property {number} [t]   machines: ticks left on the current job; unpacker: ticks until next box
 * @property {number} [n]   press/packer: inputs waiting
 * @property {string|0} [out] press/packer: finished item waiting to leave
 * @property {number} [cd]  towers: ticks until it can fire again
 * @property {number} [a]   forklift: aim angle in radians (for drawing)
 */

/**
 * @typedef {Object} Shopper
 * @property {number} id
 * @property {string} k   kind, a key of SHOPPERS
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
 */
export function createGame({ seed = 1, training = false } = {}) {
  return {
    v: 1,
    seed,
    training,
    /** Training mode only: the groups for the next wave, or null. */
    nextWave: null,
    rng: (seed >>> 0) || 1,
    tick: 0,
    tiles: MAP.join(''),
    /** @type {Array<Building|0>} */
    grid: new Array(W * H).fill(0),
    gridVer: 0,
    /** @type {Shopper[]} */
    shoppers: [],
    nextId: 1,
    /** Shoppers still to arrive this wave, as [tick, kind], soonest first. */
    spawnQ: [],
    cash: TUNE.startCash,
    refunds: 0,
    wave: 0,
    /** 'build' | 'wave' | 'won' | 'lost' */
    phase: 'build',
    /** Ticks left in the build phase; -1 means wait until a player starts the wave. */
    phaseT: -1,
    speed: 1,
    /** Totals for the current wave, shown in the performance review. */
    ws: { escaped: 0, stopped: 0, stolen: 0, earned: 0, refunded: 0 },
    players: [],
  };
}

/** Deterministic random number in [0, 1). The generator's state lives in the game state. */
export function rand(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const idxOf = (x, y) => y * W + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

/**
 * Adds a player, or brings back a player of the same name who dropped out.
 * @returns {number} the player's id, or -1 if the game is full
 */
export function addPlayer(state, name) {
  const clean = String(name || 'Player').trim().slice(0, 14) || 'Player';
  const back = state.players.find((p) => !p.on && p.name === clean);
  if (back) { back.on = true; return back.id; }
  if (state.players.length >= MAX_PLAYERS) return -1;
  const id = state.players.length;
  state.players.push({
    id, name: clean, color: PLAYER_COLORS[id % PLAYER_COLORS.length],
    role: ROLES[Math.min(id, ROLES.length - 1)], on: true,
    w: blankStats(), // this wave
    all: blankStats(), // whole game
  });
  return id;
}

export function setPlayerOnline(state, id, on) {
  const p = state.players[id];
  if (p) p.on = on;
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
  state.ws = { escaped: 0, stopped: 0, stolen: 0, earned: 0, refunded: 0 };
}
