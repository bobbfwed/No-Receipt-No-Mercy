// Player commands: the only way anything outside the simulation may change the game state.
// The host validates every command here, so a confused or cheating client cannot break the game.
import { BUILD, TUNE, TICK_HZ, ST, ROLES } from './constants.js';
import { inBounds, idxOf, bump, setMap, setSettings, footprint, anchorOf, tilesOf } from './state.js';
import { computeDist, modeOf, UNREACHABLE } from './path.js';
import { beginWave, skipBuild } from './step.js';
import { upgradeCost, spentOn, levelIn, maxIn, defaultTrack, rebuildDeal, TRACKS } from './upgrades.js';
import { officePlayer, checkPlan, tidyPlan, refreshBudget } from './office.js';

/** Commands a Head Office player may not use: he does not touch the store. */
const STORE_ONLY = new Set(['place', 'remove', 'rotate', 'upgrade', 'give', 'rebuild', 'endless']);

/** Seconds of build time before wave 1, counted from the first thing placed. */
const FIRST_BUILD_SECS = 90;

function tileOf(state, s) {
  return ((s.y | 0) * state.w) + (s.x | 0);
}

/**
 * Where a placement of kind k at (x, y) facing d really goes. If that kind's rubble covers the
 * tile, the building goes back where and how it was (the rubble's anchor and facing) at the
 * rebuild price; otherwise its footprint's top-left tile is (x, y).
 * @returns {{i: number, d: number, tiles: number[]|null, rubble: Object|null}}
 */
function placement(state, k, x, y, d) {
  const def = BUILD[k];
  const i = idxOf(state, x, y);
  for (const r of state.rubble) {
    if (r.k !== k) continue;
    const tiles = footprint(state, k, r.i % state.w, (r.i / state.w) | 0, r.d | 0);
    if (tiles && tiles.includes(i)) return { i: r.i, d: r.d | 0, tiles, rubble: r };
  }
  const dd = def.rot ? d & 3 : 0;
  return { i, d: dd, tiles: footprint(state, k, x, y, dd), rubble: null };
}

/** Forgets any rubble under a set of tiles: something has been built over it. */
function clearRubble(state, tiles) {
  if (!state.rubble.length) return;
  state.rubble = state.rubble.filter((r) => {
    const under = footprint(state, r.k, r.i % state.w, (r.i / state.w) | 0, r.d | 0) || [r.i];
    return !under.some((t) => tiles.includes(t));
  });
}

/**
 * Checks whether a player may put a building with its top-left tile on (x, y), facing d.
 * Placing a kind on its own rubble puts it back where it was (see placement) at the rebuild
 * price, so only that much cash is needed.
 * @param {number} [pid] the player who would pay for it
 * @param {number} [d] facing 0-3 (it decides the footprint of a building bigger than one tile)
 * @returns {string|null} null if allowed, otherwise the reason:
 *   'over' game finished, 'lobby' the game has not started, 'kind' unknown building, 'bounds' not a floor tile, 'occupied',
 *   'fit' part of a bigger building's footprint is off the floor or occupied,
 *   'zone' that machine only goes on its own marked floor,
 *   'cash' he cannot afford it, 'shopper' someone is standing there,
 *   'blocked' it would wall off the tills from an entrance or from a shopper.
 */
export function canPlace(state, k, x, y, pid = 0, d = 0) {
  if (state.phase === 'won' || state.phase === 'lost') return 'over';
  if (state.phase === 'lobby') return 'lobby';
  const def = BUILD[k];
  if (!def) return 'kind';
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(state, x, y)) return 'bounds';
  const at = placement(state, k, x, y, d | 0);
  const own = idxOf(state, x, y); // the tile pointed at
  if (state.tiles[own] !== '.') return 'bounds';
  if (!at.tiles) return 'fit';
  for (const t of at.tiles) {
    if (state.tiles[t] !== '.') return 'fit';
    // The four factory machines only go on their own marked floor (on maps that have it).
    if (def.zone && state.zones && state.zones[t] !== def.zone) return 'zone';
  }
  // Laying a belt over a belt just turns it, which is free and always allowed.
  if (k === 'belt' && state.grid[at.i] && state.grid[at.i].k === 'belt') return null;
  for (const t of at.tiles) if (state.grid[t]) return t === own ? 'occupied' : 'fit';
  const player = state.players[pid];
  const price = at.rubble ? Math.floor(def.cost * TUNE.rebuildShare) : def.cost;
  if (!player || player.cash < price) return 'cash';
  if (def.blocks) {
    for (const s of state.shoppers) if (s.st !== ST.LEAVE && at.tiles.includes(tileOf(state, s))) return 'shopper';
    const block = at.tiles.length === 1 ? at.i : at.tiles;
    const dist = computeDist(state, block);
    // Every entrance must keep a way to the tills, including the ones that are still shut.
    for (const door of state.doors) for (const t of door) if (dist[t] === UNREACHABLE) return 'blocked';
    // Dads and gym bros get through things others cannot, so each is checked on his own map.
    const fields = [dist, null, null];
    for (const s of state.shoppers) {
      if (s.st === ST.LEAVE) continue;
      const mode = modeOf(s.k);
      const field = (fields[mode] ||= computeDist(state, block, mode));
      if (field[tileOf(state, s)] === UNREACHABLE) return 'blocked';
    }
  }
  return null;
}

/**
 * Checks whether a player may upgrade one track of the building on a tile (any of its tiles).
 * @param {string} [track] 'dmg', 'spd', 'rng' or 'dur'; left out, the kind's default track
 *   (damage if it has it, otherwise its first)
 * @returns {string|null} null if allowed, otherwise the reason: 'over', 'bounds', 'empty' nothing
 *   there, 'noup' that kind has no such track (or no tracks), 'max' that track is at the top, 'cash'.
 */
export function canUpgrade(state, x, y, pid = 0, track = undefined) {
  if (state.phase === 'won' || state.phase === 'lost') return 'over';
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(state, x, y)) return 'bounds';
  const b = state.grid[anchorOf(state, idxOf(state, x, y))];
  if (!b) return 'empty';
  const t = track ?? defaultTrack(b.k);
  if (!TRACKS.includes(t) || !BUILD[b.k].up || !BUILD[b.k].up[t]) return 'noup';
  if (levelIn(b, t) >= maxIn(b.k, t)) return 'max';
  const player = state.players[pid];
  if (!player || player.cash < upgradeCost(b, t)) return 'cash';
  return null;
}

function newBuilding(k, owner, d, u) {
  const b = { k, o: owner };
  const def = BUILD[k];
  if (def.rot) b.d = d & 3;
  if (u && Object.keys(u).length) b.u = { ...u };
  if (k === 'belt') b.it = [];
  if (k === 'unpacker') b.t = Math.round((def.period / (def.up.spd.mul ** levelIn(b, 'spd'))) * TICK_HZ);
  if (k === 'press' || k === 'packer') { b.n = 0; b.t = 0; b.out = 0; }
  if (def.tower) b.cd = 0;
  if (k === 'forklift') b.a = 0;
  return b;
}

/** Puts a building on the grid: the anchor holds it, its other tiles point at the anchor. */
function put(state, tiles, b) {
  state.grid[tiles[0]] = b;
  for (let n = 1; n < tiles.length; n++) state.grid[tiles[n]] = { k: b.k, part: tiles[0] };
  state.gridVer++;
}

/** Takes a building off the grid, all of its tiles. Returns it. */
function lift(state, ai) {
  const b = state.grid[ai];
  for (const t of tilesOf(state, ai)) state.grid[t] = 0;
  state.gridVer++;
  return b;
}

/**
 * Applies one command from a player.
 * Commands (x, y may be any tile of a building bigger than one tile, except for 'place'):
 *   { c: 'place', k, x, y, d }  build something with the top-left of its footprint on (x, y)
 *                               (d = facing 0-3, only for things that rotate; it also decides a
 *                               bigger building's footprint). A belt placed on a belt turns it to
 *                               face d, free of charge. Placed on rubble of the same kind, it goes
 *                               back where and how it was, at the rebuild price (see rebuildDeal)
 *   { c: 'remove', x, y }       sell a building back (the money goes to whoever paid for it)
 *   { c: 'rotate', x, y }       turn a building a quarter turn clockwise (half a turn if it is
 *                               bigger than one tile, so it keeps its footprint)
 *   { c: 'upgrade', x, y, t }   buy the next level of track t ('dmg', 'spd', 'rng', 'dur');
 *                               without t, damage if the kind has it, otherwise its first track
 *   { c: 'give', to, n }        hand n of your cash to player `to`
 *   { c: 'rebuild' }            put back what gym bros destroyed of yours, oldest first, at the
 *                               rebuild price, as far as your cash goes (with all: true, everybody's)
 *   { c: 'map', design, size }  lobby only, host only (state.host): change the store
 *   { c: 'settings', waves, startCash, difficulty }  lobby only, host only: the game's
 *                               settings (see SETTINGS); anything left out keeps its value
 *   { c: 'ready', on }          lobby only: say you are ready (or not). The game starts when
 *                               every connected player is
 *   { c: 'side', side }         take the Head Office job ('office': run the shoppers) or go back
 *                               to the store ('store'). Only between waves, only one at a time,
 *                               and only if somebody is left to run the store
 *   { c: 'plan', groups }       Head Office only: the shoppers bought for the coming wave
 *                               (see office.js for the shape); replaces the plan so far
 *   { c: 'start' }              open the doors now instead of waiting for the timer. With a Head
 *                               Office player, both sides must ask before they open early
 *   { c: 'endless' }            only once the game is won, by a connected store player: carry on
 *                               as an endless game (state.waves becomes 0), starting with the
 *                               usual build pause before the next sales event
 *   { c: 'role', role }         change your job title (cosmetic)
 *   { c: 'speed', n }           game speed 1, 2 or 3
 * @param {Array} ev events are appended here
 * @returns {{ok: true} | {ok: false, why: string}}
 */
export function applyCommand(state, pid, cmd, ev = []) {
  const player = state.players[pid];
  if (!player || !cmd || typeof cmd !== 'object') return { ok: false, why: 'bad' };
  if (player.side === 'office' && STORE_ONLY.has(cmd.c)) return { ok: false, why: 'office' };
  if (state.phase === 'lobby') {
    // Before the game starts there are only two things to do: pick the store, and say you are ready.
    if (cmd.c === 'map') {
      if (pid !== (state.host | 0)) return { ok: false, why: 'host' };
      if (!setMap(state, cmd.design, cmd.size)) return { ok: false, why: 'bad' };
      ev.push({ e: 'map', design: cmd.design, size: cmd.size });
      return { ok: true };
    }
    if (cmd.c === 'settings') {
      if (pid !== (state.host | 0)) return { ok: false, why: 'host' };
      setSettings(state, { waves: cmd.waves, startCash: cmd.startCash, difficulty: cmd.difficulty });
      return { ok: true };
    }
    if (cmd.c === 'ready') {
      player.ready = cmd.on !== false;
      return { ok: true };
    }
    if (cmd.c !== 'role') return { ok: false, why: 'lobby' };
  }
  switch (cmd.c) {
    case 'place': {
      const why = canPlace(state, cmd.k, cmd.x, cmd.y, pid, cmd.d | 0);
      if (why) return { ok: false, why };
      const def = BUILD[cmd.k];
      const at = placement(state, cmd.k, cmd.x, cmd.y, cmd.d | 0);
      if (state.grid[at.i]) {
        // A belt laid over a belt: turn the one that is there. Nothing is charged, and the goods
        // on it stay on it.
        state.grid[at.i].d = cmd.d & 3;
        return { ok: true, turned: true };
      }
      // On its own rubble it comes back as it was, with what upgrades the player can afford.
      const deal = at.rubble ? rebuildDeal(at.rubble, player.cash) : null;
      const paid = deal ? deal.pay : def.cost;
      put(state, at.tiles, newBuilding(cmd.k, pid, at.d, deal && deal.u));
      clearRubble(state, at.tiles);
      player.cash -= paid;
      bump(state, pid, 'spent', paid);
      bump(state, pid, 'built');
      if (state.phase === 'build' && state.phaseT === -1 && !state.training) state.phaseT = FIRST_BUILD_SECS * TICK_HZ;
      const e = { e: 'placed', k: cmd.k, x: at.i % state.w, y: (at.i / state.w) | 0, d: at.d, by: pid };
      if (deal) { e.rebuilt = 1; e.short = deal.lost > 0 ? 1 : 0; }
      ev.push(e);
      return { ok: true };
    }
    case 'remove': {
      if (state.phase === 'won' || state.phase === 'lost') return { ok: false, why: 'over' };
      if (!Number.isInteger(cmd.x) || !Number.isInteger(cmd.y) || !inBounds(state, cmd.x, cmd.y)) return { ok: false, why: 'bounds' };
      const ai = anchorOf(state, idxOf(state, cmd.x, cmd.y));
      if (!state.grid[ai]) return { ok: false, why: 'empty' };
      const b = lift(state, ai);
      const back = Math.floor(spentOn(b) * TUNE.sellBack);
      (state.players[b.o] || player).cash += back;
      bump(state, pid, 'sold');
      ev.push({ e: 'removed', k: b.k, x: ai % state.w, y: (ai / state.w) | 0, by: pid, owner: b.o });
      return { ok: true };
    }
    case 'rotate': {
      if (!Number.isInteger(cmd.x) || !Number.isInteger(cmd.y) || !inBounds(state, cmd.x, cmd.y)) return { ok: false, why: 'bounds' };
      const b = state.grid[anchorOf(state, idxOf(state, cmd.x, cmd.y))];
      if (!b || !BUILD[b.k].rot) return { ok: false, why: 'empty' };
      // A long building turns end for end, so it never needs room it does not already have.
      b.d = (b.d + (BUILD[b.k].size ? 2 : 1)) & 3;
      return { ok: true };
    }
    case 'upgrade': {
      const why = canUpgrade(state, cmd.x, cmd.y, pid, cmd.t);
      if (why) return { ok: false, why };
      const ai = anchorOf(state, idxOf(state, cmd.x, cmd.y));
      const b = state.grid[ai];
      const t = cmd.t ?? defaultTrack(b.k);
      const cost = upgradeCost(b, t);
      player.cash -= cost;
      b.u ||= {};
      b.u[t] = levelIn(b, t) + 1;
      bump(state, pid, 'spent', cost);
      ev.push({ e: 'upgraded', k: b.k, x: ai % state.w, y: (ai / state.w) | 0, by: pid, t, lv: b.u[t] });
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
      // Oldest wreck first, each at the rebuild price with as many of its upgrades as the cash
      // covers. Whatever cannot go back yet (no cash, a shopper in the way) stays as rubble.
      let n = 0, short = 0, why = 'empty';
      for (const r of state.rubble.slice()) {
        if (r.o !== pid && !cmd.all) continue;
        const x = r.i % state.w, y = (r.i / state.w) | 0;
        const tiles = footprint(state, r.k, x, y, r.d | 0);
        // Something has been built there since: that hole is already patched.
        if (!tiles || tiles.some((t) => state.grid[t])) {
          const j = state.rubble.indexOf(r);
          if (j >= 0) state.rubble.splice(j, 1);
          continue;
        }
        const no = canPlace(state, r.k, x, y, pid, r.d | 0);
        if (no) { why = no; continue; }
        const deal = rebuildDeal(r, player.cash);
        if (!deal) { why = 'cash'; continue; }
        put(state, tiles, newBuilding(r.k, pid, r.d | 0, deal.u));
        clearRubble(state, tiles);
        player.cash -= deal.pay;
        bump(state, pid, 'spent', deal.pay);
        bump(state, pid, 'built');
        n++;
        if (deal.lost > 0) short++;
      }
      if (!n) return { ok: false, why };
      ev.push({ e: 'rebuilt', by: pid, n, short });
      return { ok: true, n, short };
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
      // Changing the plan takes back his "ready": the doors must not open on a plan he is still editing.
      state.office.ready = false;
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
      // Opening early must not cost the players what the factory would have sold meanwhile.
      skipBuild(state, ev);
      beginWave(state, ev);
      return { ok: true };
    }
    case 'endless': {
      if (state.phase !== 'won') return { ok: false, why: 'phase' };
      if (!player.on) return { ok: false, why: 'bad' };
      state.waves = 0;
      state.phase = 'build';
      state.phaseT = Math.max(1, Math.round(TUNE.buildSecs * TICK_HZ));
      state.storeReady = false;
      // Head Office's budget was not worked out for a next wave that was not coming.
      refreshBudget(state);
      ev.push({ e: 'endless', by: pid });
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
