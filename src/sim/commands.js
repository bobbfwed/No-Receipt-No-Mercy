// Player commands: the only way anything outside the simulation may change the game state.
// The host validates every command here, so a confused or cheating client cannot break the game.
import { W, BUILD, SHOPPERS, TUNE, TICK_HZ, ST, ROLES } from './constants.js';
import { inBounds, idxOf, bump } from './state.js';
import { computeDist, UNREACHABLE } from './path.js';
import { beginWave } from './step.js';

/** Seconds of build time before wave 1, counted from the first thing placed. */
const FIRST_BUILD_SECS = 90;

function tileOf(s) {
  return ((s.y | 0) * W) + (s.x | 0);
}

/**
 * Checks whether a building may go on a tile.
 * @returns {string|null} null if allowed, otherwise the reason:
 *   'over' game finished, 'kind' unknown building, 'bounds' not a floor tile, 'occupied',
 *   'cash' cannot afford it, 'shopper' someone is standing there, 'blocked' it would wall off the tills.
 */
export function canPlace(state, k, x, y) {
  if (state.phase === 'won' || state.phase === 'lost') return 'over';
  const def = BUILD[k];
  if (!def) return 'kind';
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(x, y)) return 'bounds';
  const i = idxOf(x, y);
  if (state.tiles[i] !== '.') return 'bounds';
  if (state.grid[i]) return 'occupied';
  if (state.cash < def.cost) return 'cash';
  if (def.blocks) {
    for (const s of state.shoppers) if (s.st !== ST.LEAVE && tileOf(s) === i) return 'shopper';
    const dist = computeDist(state, i);
    for (let t = 0; t < state.tiles.length; t++) {
      if (state.tiles[t] === 'D' && dist[t] === UNREACHABLE) return 'blocked';
    }
    let hop = null; // dads step over belts, so they are checked against their own map
    for (const s of state.shoppers) {
      if (s.st === ST.LEAVE) continue;
      const field = SHOPPERS[s.k].hopsBelts ? (hop ||= computeDist(state, i, true)) : dist;
      if (field[tileOf(s)] === UNREACHABLE) return 'blocked';
    }
  }
  return null;
}

function newBuilding(k, owner, d) {
  const b = { k, o: owner };
  const def = BUILD[k];
  if (def.rot) b.d = d & 3;
  if (k === 'belt') b.it = [];
  if (k === 'unpacker') b.t = Math.round(def.period * TICK_HZ);
  if (k === 'press' || k === 'packer') { b.n = 0; b.t = 0; b.out = 0; }
  if (def.tower) b.cd = 0;
  if (k === 'forklift') b.a = 0;
  return b;
}

/**
 * Applies one command from a player.
 * Commands:
 *   { c: 'place', k, x, y, d }  build something (d = facing 0-3, only for things that rotate)
 *   { c: 'remove', x, y }       sell a building back
 *   { c: 'rotate', x, y }       turn a building a quarter turn clockwise
 *   { c: 'start' }              open the doors now instead of waiting for the timer
 *   { c: 'role', role }         change your job title (cosmetic)
 *   { c: 'speed', n }           game speed 1, 2 or 3
 * @param {Array} ev events are appended here
 * @returns {{ok: true} | {ok: false, why: string}}
 */
export function applyCommand(state, pid, cmd, ev = []) {
  const player = state.players[pid];
  if (!player || !cmd || typeof cmd !== 'object') return { ok: false, why: 'bad' };
  switch (cmd.c) {
    case 'place': {
      const why = canPlace(state, cmd.k, cmd.x, cmd.y);
      if (why) return { ok: false, why };
      const def = BUILD[cmd.k];
      state.grid[idxOf(cmd.x, cmd.y)] = newBuilding(cmd.k, pid, cmd.d | 0);
      state.gridVer++;
      state.cash -= def.cost;
      bump(state, pid, 'spent', def.cost);
      bump(state, pid, 'built');
      if (state.phase === 'build' && state.phaseT === -1) state.phaseT = FIRST_BUILD_SECS * TICK_HZ;
      ev.push({ e: 'placed', k: cmd.k, x: cmd.x, y: cmd.y, by: pid });
      return { ok: true };
    }
    case 'remove': {
      if (state.phase === 'won' || state.phase === 'lost') return { ok: false, why: 'over' };
      if (!inBounds(cmd.x, cmd.y)) return { ok: false, why: 'bounds' };
      const i = idxOf(cmd.x, cmd.y);
      const b = state.grid[i];
      if (!b) return { ok: false, why: 'empty' };
      const back = Math.floor(BUILD[b.k].cost * TUNE.sellBack);
      state.grid[i] = 0;
      state.gridVer++;
      state.cash += back;
      bump(state, pid, 'sold');
      ev.push({ e: 'removed', k: b.k, x: cmd.x, y: cmd.y, by: pid, owner: b.o });
      return { ok: true };
    }
    case 'rotate': {
      if (!inBounds(cmd.x, cmd.y)) return { ok: false, why: 'bounds' };
      const b = state.grid[idxOf(cmd.x, cmd.y)];
      if (!b || !BUILD[b.k].rot) return { ok: false, why: 'empty' };
      b.d = (b.d + 1) & 3;
      return { ok: true };
    }
    case 'start': {
      if (state.phase !== 'build') return { ok: false, why: 'phase' };
      beginWave(state, ev);
      return { ok: true };
    }
    case 'role': {
      if (!ROLES.includes(cmd.role)) return { ok: false, why: 'bad' };
      player.role = cmd.role;
      return { ok: true };
    }
    case 'speed': {
      if (![1, 2, 3].includes(cmd.n)) return { ok: false, why: 'bad' };
      state.speed = cmd.n;
      return { ok: true };
    }
    default:
      return { ok: false, why: 'bad' };
  }
}
