// Player commands: the only way anything outside the simulation may change the game state.
// The host validates every command here, so a confused or cheating client cannot break the game.
import { BUILD, TUNE, TICK_HZ, ST, ROLES } from './constants.js';
import { inBounds, idxOf, bump } from './state.js';
import { computeDist, modeOf, UNREACHABLE } from './path.js';
import { beginWave } from './step.js';
import { upgradeCost, spentOn, levelOf } from './upgrades.js';
import { officePlayer, checkPlan, tidyPlan, refreshBudget } from './office.js';

/** Commands a Head Office player may not use: he does not touch the store. */
const STORE_ONLY = new Set(['place', 'remove', 'rotate', 'upgrade', 'give', 'rebuild']);

/** Seconds of build time before wave 1, counted from the first thing placed. */
const FIRST_BUILD_SECS = 90;

function tileOf(state, s) {
  return ((s.y | 0) * state.w) + (s.x | 0);
}

/**
 * Checks whether a player may put a building on a tile.
 * @param {number} [pid] the player who would pay for it
 * @returns {string|null} null if allowed, otherwise the reason:
 *   'over' game finished, 'kind' unknown building, 'bounds' not a floor tile, 'occupied',
 *   'cash' he cannot afford it, 'shopper' someone is standing there,
 *   'blocked' it would wall off the tills from an entrance or from a shopper.
 */
export function canPlace(state, k, x, y, pid = 0) {
  if (state.phase === 'won' || state.phase === 'lost') return 'over';
  const def = BUILD[k];
  if (!def) return 'kind';
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(state, x, y)) return 'bounds';
  const i = idxOf(state, x, y);
  if (state.tiles[i] !== '.') return 'bounds';
  if (state.grid[i]) return 'occupied';
  const player = state.players[pid];
  if (!player || player.cash < def.cost) return 'cash';
  if (def.blocks) {
    for (const s of state.shoppers) if (s.st !== ST.LEAVE && tileOf(state, s) === i) return 'shopper';
    const dist = computeDist(state, i);
    // Every entrance must keep a way to the tills, including the ones that are still shut.
    for (const door of state.doors) for (const t of door) if (dist[t] === UNREACHABLE) return 'blocked';
    // Dads and gym bros get through things others cannot, so each is checked on his own map.
    const fields = [dist, null, null];
    for (const s of state.shoppers) {
      if (s.st === ST.LEAVE) continue;
      const mode = modeOf(s.k);
      const field = (fields[mode] ||= computeDist(state, i, mode));
      if (field[tileOf(state, s)] === UNREACHABLE) return 'blocked';
    }
  }
  return null;
}

/**
 * Checks whether a player may upgrade the building on a tile.
 * @returns {string|null} null if allowed, otherwise the reason: 'over', 'bounds', 'empty' nothing
 *   there, 'noup' that kind cannot be upgraded, 'max' already at the top level, 'cash'.
 */
export function canUpgrade(state, x, y, pid = 0) {
  if (state.phase === 'won' || state.phase === 'lost') return 'over';
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(state, x, y)) return 'bounds';
  const b = state.grid[idxOf(state, x, y)];
  if (!b) return 'empty';
  if (!BUILD[b.k].up) return 'noup';
  if (levelOf(b) >= TUNE.maxLevel) return 'max';
  const player = state.players[pid];
  if (!player || player.cash < upgradeCost(b)) return 'cash';
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
 *   { c: 'remove', x, y }       sell a building back (the money goes to whoever paid for it)
 *   { c: 'rotate', x, y }       turn a building a quarter turn clockwise
 *   { c: 'upgrade', x, y }      raise a security building one level
 *   { c: 'give', to, n }        hand n of your cash to player `to`
 *   { c: 'rebuild' }            put back what gym bros wrecked of yours, as far as your cash goes
 *                               (with all: true, everybody's)
 *   { c: 'side', side }         take the Head Office job ('office': run the shoppers) or go back
 *                               to the store ('store'). Only between waves, only one at a time,
 *                               and only if somebody is left to run the store
 *   { c: 'plan', groups }       Head Office only: the shoppers bought for the coming wave
 *                               (see office.js for the shape); replaces the plan so far
 *   { c: 'start' }              open the doors now instead of waiting for the timer. With a Head
 *                               Office player, both sides must ask before they open early
 *   { c: 'role', role }         change your job title (cosmetic)
 *   { c: 'speed', n }           game speed 1, 2 or 3
 * @param {Array} ev events are appended here
 * @returns {{ok: true} | {ok: false, why: string}}
 */
export function applyCommand(state, pid, cmd, ev = []) {
  const player = state.players[pid];
  if (!player || !cmd || typeof cmd !== 'object') return { ok: false, why: 'bad' };
  if (player.side === 'office' && STORE_ONLY.has(cmd.c)) return { ok: false, why: 'office' };
  switch (cmd.c) {
    case 'place': {
      const why = canPlace(state, cmd.k, cmd.x, cmd.y, pid);
      if (why) return { ok: false, why };
      const def = BUILD[cmd.k];
      const i = idxOf(state, cmd.x, cmd.y);
      state.grid[i] = newBuilding(cmd.k, pid, cmd.d | 0);
      state.gridVer++;
      if (state.rubble.length) state.rubble = state.rubble.filter((r) => r[0] !== i);
      player.cash -= def.cost;
      bump(state, pid, 'spent', def.cost);
      bump(state, pid, 'built');
      if (state.phase === 'build' && state.phaseT === -1 && !state.training) state.phaseT = FIRST_BUILD_SECS * TICK_HZ;
      ev.push({ e: 'placed', k: cmd.k, x: cmd.x, y: cmd.y, by: pid });
      return { ok: true };
    }
    case 'remove': {
      if (state.phase === 'won' || state.phase === 'lost') return { ok: false, why: 'over' };
      if (!inBounds(state, cmd.x, cmd.y)) return { ok: false, why: 'bounds' };
      const i = idxOf(state, cmd.x, cmd.y);
      const b = state.grid[i];
      if (!b) return { ok: false, why: 'empty' };
      const back = Math.floor(spentOn(b) * TUNE.sellBack);
      state.grid[i] = 0;
      state.gridVer++;
      (state.players[b.o] || player).cash += back;
      bump(state, pid, 'sold');
      ev.push({ e: 'removed', k: b.k, x: cmd.x, y: cmd.y, by: pid, owner: b.o });
      return { ok: true };
    }
    case 'rotate': {
      if (!inBounds(state, cmd.x, cmd.y)) return { ok: false, why: 'bounds' };
      const b = state.grid[idxOf(state, cmd.x, cmd.y)];
      if (!b || !BUILD[b.k].rot) return { ok: false, why: 'empty' };
      b.d = (b.d + 1) & 3;
      return { ok: true };
    }
    case 'upgrade': {
      const why = canUpgrade(state, cmd.x, cmd.y, pid);
      if (why) return { ok: false, why };
      const b = state.grid[idxOf(state, cmd.x, cmd.y)];
      const cost = upgradeCost(b);
      player.cash -= cost;
      b.lv = levelOf(b) + 1;
      bump(state, pid, 'spent', cost);
      ev.push({ e: 'upgraded', k: b.k, x: cmd.x, y: cmd.y, by: pid, lv: b.lv });
      return { ok: true };
    }
    case 'give': {
      const to = state.players[cmd.to];
      const n = Math.floor(cmd.n);
      if (!to || to === player || !(n > 0)) return { ok: false, why: 'bad' };
      if (player.cash < n) return { ok: false, why: 'cash' };
      player.cash -= n;
      to.cash += n;
      ev.push({ e: 'gave', by: pid, to: to.id, n });
      return { ok: true };
    }
    case 'rebuild': {
      // Oldest wreck first. Whatever cannot go back yet (no cash, a shopper in the way) stays as rubble.
      let n = 0, why = 'empty';
      for (const r of state.rubble.slice()) {
        const [i, k, d, owner] = r;
        if (owner !== pid && !cmd.all) continue;
        const x = i % state.w, y = (i / state.w) | 0;
        const no = canPlace(state, k, x, y, pid);
        if (no) { if (no === 'occupied') state.rubble.splice(state.rubble.indexOf(r), 1); else why = no; continue; }
        state.grid[i] = newBuilding(k, pid, d);
        state.gridVer++;
        state.rubble.splice(state.rubble.indexOf(r), 1);
        player.cash -= BUILD[k].cost;
        bump(state, pid, 'spent', BUILD[k].cost);
        bump(state, pid, 'built');
        n++;
      }
      if (!n) return { ok: false, why };
      ev.push({ e: 'rebuilt', by: pid, n });
      return { ok: true, n };
    }
    case 'side': {
      if (cmd.side !== 'office' && cmd.side !== 'store') return { ok: false, why: 'bad' };
      if (state.training) return { ok: false, why: 'bad' };
      if (state.phase !== 'build') return { ok: false, why: 'phase' };
      if (player.side === cmd.side) return { ok: true };
      if (cmd.side === 'office') {
        const holder = officePlayer(state);
        if (holder && holder !== player) return { ok: false, why: 'taken' };
        // Somebody has to be left running the store.
        if (!state.players.some((p) => p !== player && p.on && p.side === 'store')) return { ok: false, why: 'lonely' };
        // A previous holder who dropped out loses the job.
        if (state.office && state.players[state.office.pid]) state.players[state.office.pid].side = 'store';
        player.side = 'office';
        state.office = { pid, budget: 0, bank: 0, plan: [], ready: false };
        refreshBudget(state);
      } else {
        player.side = 'store';
        state.office = null;
      }
      state.storeReady = false;
      ev.push({ e: 'side', by: pid, side: cmd.side });
      return { ok: true };
    }
    case 'plan': {
      if (player.side !== 'office' || !state.office || state.office.pid !== pid) return { ok: false, why: 'bad' };
      if (state.phase !== 'build') return { ok: false, why: 'phase' };
      const why = checkPlan(state, cmd.groups);
      if (why) return { ok: false, why };
      state.office.plan = tidyPlan(cmd.groups);
      return { ok: true };
    }
    case 'start': {
      if (state.phase !== 'build') return { ok: false, why: 'phase' };
      // In training the doors only open when the lesson has a wave lined up.
      if (state.training && !state.nextWave) return { ok: false, why: 'notyet' };
      // With a Head Office player, the doors open early only when both sides have asked.
      if (officePlayer(state)) {
        if (player.side === 'office') state.office.ready = true; else state.storeReady = true;
        if (!state.office.ready || !state.storeReady) {
          ev.push({ e: 'ready', by: pid, side: player.side });
          return { ok: true, waiting: true };
        }
      }
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
