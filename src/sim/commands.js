// Player commands: the only way anything outside the simulation may change the game state.
// The host validates every command here, so a confused or cheating client cannot break the game.
import { BUILD, BACK, TUNE, TICK_HZ, ST, ROLES, SPEEDS, buildDef } from './constants.js';
import { inBounds, idxOf, bump, setMap, setSettings, footprint, anchorOf, tilesOf, releaseOrder } from './state.js';
import { computeDist, banksOpen, modeOf, UNREACHABLE, NORMAL, SMASH } from './path.js';
import { beginWave, skipBuild } from './step.js';
import { spentOn, rebuildDeal } from './upgrades.js';
import { officePlayer, checkPlan, tidyPlan, refreshBudget } from './office.js';
import { buildPrice, cardStock, boozeRoll } from './cards.js';
import { canPlaceBack, newPart, syncLifts, dropTicks, takesSupply, addStock, itemCode } from './back.js';

/** Commands a Head Office player may not use: he does not touch the store. */
const STORE_ONLY = new Set(['place', 'remove', 'rotate', 'give', 'rebuild', 'endless', 'dropUp']);

/**
 * Commands that still work while the game is paused (0.3.02; state.pause). Everything else is
 * refused with 'paused': nothing can be built, sold, rebuilt, given or bought. The build
 * pause between sales events runs on a timer, and that timer stands still while the game is
 * paused; a pause that let players build would turn it into free building time and take the
 * pressure out of the timer and out of a sales event. (Players joining, leaving and coming back do
 * not go through commands at all: the session calls addPlayer and setPlayerOnline, which work as
 * ever while paused.)
 */
const WHILE_PAUSED = new Set(['pause', 'speed', 'role', 'skipCards']);

/** The phases a game may be paused in: the deal, a build pause and a sales event. */
const PAUSE_PHASES = new Set(['cards', 'build', 'wave']);

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

/**
 * Forgets any rubble under a set of tiles: something has been built over it. Money held for an
 * ordered rebuild there goes back to whoever paid it (0.3.04). A wreck rebuilt from its own order
 * has had its order taken off first (putBack), so it is not paid back as well.
 */
function clearRubble(state, tiles) {
  if (!state.rubble.length) return;
  const gone = [];
  state.rubble = state.rubble.filter((r) => {
    const under = footprint(state, r.k, r.i % state.w, (r.i / state.w) | 0, r.d | 0) || [r.i];
    if (!under.some((t) => tiles.includes(t))) return true;
    releaseOrder(state, r);
    gone.push(...under);
    return false;
  });
  // (Its Dumbwaiters, 0.4, go with it, except where the new building has its own.)
  if (gone.length) syncLifts(state, gone);
}

/**
 * Drops one wreck from the list if something has been built where it lay since (that hole is
 * already patched), giving back any money held for it (and taking away its Dumbwaiters, 0.4).
 * Returns true if it was dropped.
 */
function tidyRubble(state, r) {
  const tiles = footprint(state, r.k, r.i % state.w, (r.i / state.w) | 0, r.d | 0);
  if (tiles && !tiles.some((t) => state.grid[t])) return false;
  const j = state.rubble.indexOf(r);
  if (j >= 0) state.rubble.splice(j, 1);
  releaseOrder(state, r);
  syncLifts(state, tiles || [r.i]);
  return true;
}

/**
 * Checks whether a player may put a building with its top-left tile on (x, y), facing d.
 * Placing a kind on its own rubble puts it back where it was (see placement) at the rebuild
 * price, so only that much cash is needed.
 * @param {number} [pid] the player who would pay for it
 * @param {number} [d] facing 0-3 (it decides the footprint of a building bigger than one tile)
 * @returns {string|null} null if allowed, otherwise the reason:
 *   'over' game finished, 'lobby' the game has not started, 'cards' the cards are being dealt,
 *   'paused' the game is paused (state.pause), 'kind' unknown building, 'bounds' not a floor tile, 'occupied',
 *   'fit' part of a bigger building's footprint is off the floor or occupied,
 *   'zone' that machine only goes on its own marked floor,
 *   'cash' he cannot afford it, 'shopper' someone is standing there,
 *   'blocked' it would wall off the tills from an entrance or from a shopper,
 *   'bank' it would wall off one of the two banks of tills (the car park),
 *   'back' (0.4) a security building with Dumbwaiters over a part in The Back.
 */
export function canPlace(state, k, x, y, pid = 0, d = 0) {
  return placeCheck(state, k, x, y, pid, d, false);
}

/**
 * canPlace's checks. With `paid` true the cash check is left out: an ordered wreck (0.3.04) has
 * its money already, and must pass every other check (phase, pause, a shopper in the hole, the
 * route) before it may go back. Keeping them in one place means the two can never disagree.
 */
function placeCheck(state, k, x, y, pid, d, paid) {
  if (state.phase === 'won' || state.phase === 'lost') return 'over';
  if (state.phase === 'lobby') return 'lobby';
  if (state.phase === 'cards') return 'cards';
  if (state.pause) return 'paused';
  // (Only a real kind: buildDef refuses names every object has, like '__proto__'. The Back's parts,
  // 0.4, are placed with canPlaceBack and the `f: 1` commands.)
  const def = buildDef(k);
  if (!def || def.back) return 'kind';
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
  // (0.4) A building with Dumbwaiters needs The Back under it clear for them. Dumbwaiters already
  // there belong to rubble (nothing stands above them), which this building clears away.
  if (def.lift && state.back) for (const t of at.tiles) if (state.back[t] && state.back[t].k !== 'lift') return 'back';
  if (!paid) {
    const player = state.players[pid];
    // (The game's cards may change what a new building costs: buildPrice.)
    const price = at.rubble ? rebuildDeal(at.rubble, Infinity).pay : buildPrice(state, k);
    // Money he has already paid for this very wreck (pressing Rebuild, 0.3.04) counts as his: the
    // 'place' command gives it back to him before he pays.
    const held = at.rubble && at.rubble.by === pid ? at.rubble.res | 0 : 0;
    if (!player || player.cash + held < price) return 'cash';
  }
  if (def.blocks) {
    for (const s of state.shoppers) if (s.st !== ST.LEAVE && at.tiles.includes(tileOf(state, s))) return 'shopper';
    const block = at.tiles.length === 1 ? at.i : at.tiles;
    const dist = computeDist(state, block);
    // Every entrance must keep a way to the tills, including the ones that are still shut.
    for (const door of state.doors) for (const t of door) if (dist[t] === UNREACHABLE) return 'blocked';
    // In a store with two banks of tills, both stay open: walling one off would turn it back into
    // an ordinary store, and the crowd choosing between them is the point of it.
    if (!banksOpen(state, block)) return 'bank';
    // Dads get through things others cannot, so each is checked on his own map. A gym bro is
    // checked as an ordinary shopper: at any moment he may be resting after a hit, or spent, and
    // then he walks round crates like anyone else, so crates must not wall him in either.
    const fields = [dist, null, null];
    for (const s of state.shoppers) {
      if (s.st === ST.LEAVE) continue;
      const mode = modeOf(s.k) === SMASH ? NORMAL : modeOf(s.k);
      const field = (fields[mode] ||= computeDist(state, block, mode));
      if (field[tileOf(state, s)] === UNREACHABLE) return 'blocked';
    }
  }
  return null;
}

/**
 * A building as it is put down. `card` carries what a card gave it (see the Building fields in
 * state.js): `c` the price paid where it differs from the kind's, `bz` a Free Sample table that
 * hands out booze (the eightyproof card).
 */
function newBuilding(k, owner, d, card = null) {
  const b = { k, o: owner };
  const def = BUILD[k];
  if (def.rot) b.d = d & 3;
  if (card) {
    if (card.c !== undefined) b.c = card.c;
    if (card.bz) b.bz = 1;
  }
  if (k === 'belt') b.it = [];
  if (k === 'unpacker') b.t = Math.round(def.period * TICK_HZ);
  if (k === 'press' || k === 'packer') { b.n = 0; b.t = 0; b.out = 0; }
  if (def.tower) b.cd = 0;
  if (k === 'forklift') b.a = 0;
  return b;
}

/**
 * Puts a building on the grid: the anchor holds it, its other tiles point at the anchor. A security
 * building with `lift` (0.4) gets a Dumbwaiter under each tile.
 */
function put(state, tiles, b) {
  state.grid[tiles[0]] = b;
  for (let n = 1; n < tiles.length; n++) state.grid[tiles[n]] = { k: b.k, part: tiles[0] };
  state.gridVer++;
  syncLifts(state, tiles);
}

/** Takes a building off the grid, all of its tiles, and its Dumbwaiters with it. Returns it. */
function lift(state, ai) {
  const b = state.grid[ai];
  const tiles = tilesOf(state, ai);
  for (const t of tiles) state.grid[t] = 0;
  state.gridVer++;
  syncLifts(state, tiles);
  return b;
}

/**
 * Puts one ordered wreck back (0.3.04), if nothing is in the way: every canPlace check except the
 * cash, which was paid when Rebuild was pressed (r.res, held for it). It comes back as it was
 * built, a card's price and booze kept (not its stock: stock never survives a wreck). The money
 * counts as spent, and the building as built, now, not when it was held.
 * @returns {{done: true} | {done: false, why: string}}
 */
function putBack(state, r) {
  const pid = r.by, payer = state.players[pid];
  const x = r.i % state.w, y = (r.i / state.w) | 0;
  const no = placeCheck(state, r.k, x, y, pid, r.d | 0, true);
  if (no) return { done: false, why: no };
  const tiles = footprint(state, r.k, x, y, r.d | 0);
  const res = r.res | 0;
  const deal = rebuildDeal(r, res);
  // (Never happens: res is always the whole rebuild price. Kept so that held money can never
  // vanish if it somehow did.)
  if (!deal) return { done: false, why: 'cash' };
  // The order is used up here, before clearRubble, so the held money is not also paid back.
  delete r.by;
  delete r.res;
  // (res is always exactly the rebuild price, so nothing is left over; if anything were, it goes
  // back to him.)
  payer.cash += res - deal.pay;
  put(state, tiles, newBuilding(r.k, pid, r.d | 0, r));
  clearRubble(state, tiles);
  bump(state, pid, 'spent', deal.pay);
  bump(state, pid, 'built');
  return { done: true };
}

/**
 * The Rebuild button and the B key (0.3.04; before that it only put back what could go back at
 * that moment, and auto-rebuild did the rest). Goes through the player's wrecks oldest first
 * (everybody's with `all`), leaving out the ones already paid for: each one he can afford is
 * ordered, its whole rebuild price (rebuildDeal: all or nothing) taken from his cash at once and
 * held on the wreck (r.by, r.res); then it goes back at once if nothing is in the way, and
 * otherwise waits for stepRebuilds. A wreck he cannot afford is not ordered: he must press again
 * when he has the money (the owner's decision). There is no way to cancel an order.
 * @returns {{ok: true, n: number, held: number, paid: number} | {ok: false, why: string}}
 *   n: put back by this press; held: ordered and now waiting; paid: what this press took in all.
 *   Refused ('why') when it ordered nothing: 'cash' too broke for any of them, 'ordered'
 *   everything is already paid for and waiting, 'empty' nothing wrecked; 'over', 'paused' as for
 *   any command.
 */
function orderRebuilds(state, pid, all, ev) {
  if (state.phase === 'won' || state.phase === 'lost') return { ok: false, why: 'over' };
  if (state.phase !== 'build' && state.phase !== 'wave') return { ok: false, why: 'phase' };
  const player = state.players[pid];
  // paid: everything this press took; heldPaid: only what is held for the wrecks left waiting.
  let n = 0, held = 0, paid = 0, heldPaid = 0, broke = false, waiting = false;
  for (const r of state.rubble.slice()) {
    if (r.o !== pid && !all) continue;
    // Something has been built there since: that hole is already patched. (It still goes when the
    // press is refused, which is why the session sends a refused 'rebuild' on to its clients.)
    if (tidyRubble(state, r)) continue;
    if (r.by !== undefined) { waiting = true; continue; }
    const deal = rebuildDeal(r, player.cash);
    if (!deal) { broke = true; continue; }
    player.cash -= deal.pay;
    r.by = pid;
    r.res = deal.pay;
    paid += deal.pay;
    const back = putBack(state, r);
    if (back.done) n++; else { held++; heldPaid += r.res; }
  }
  if (!n && !held) return { ok: false, why: broke ? 'cash' : waiting ? 'ordered' : 'empty' };
  if (n) ev.push({ e: 'rebuilt', by: pid, n });
  if (held) ev.push({ e: 'rebuildHeld', by: pid, n: held, paid: heldPaid });
  return { ok: true, n, held, paid };
}

/**
 * Why an ordered wreck cannot go back right now (canPlace's reasons, the cash left out: it is paid
 * for), or null if it can. For the interface (the big REBUILD button says why it is waiting).
 */
export function canPutBack(state, r) {
  return placeCheck(state, r.k, r.i % state.w, (r.i / state.w) | 0, r.by ?? r.o, r.d | 0, true);
}

/** Whether any wreck has been paid for and is waiting (cheap: no path search). */
const anyOrdered = (state) => state.rubble.some((r) => r.by !== undefined);

/**
 * The wrecks players have paid for and that are waiting (0.3.04), run by step() every tick after
 * the shoppers move. Nothing to do unless something is ordered; then, every TUNE.rebuildEvery
 * seconds of game time (a refused rebuild costs a path search, too dear for every tick), oldest
 * first:
 *  1. a payer who has left the game or gone to Head Office has his order cancelled (and his money
 *     back, if he is still in the game);
 *  2. it goes back if nothing is in the way (putBack). A payer who is away (not connected) still
 *     gets what he paid for when the way clears; if his grace period runs out, expireAway cancels
 *     his orders and shares the held money out with the rest of his cash.
 * One `rebuilt` event per payer whose wrecks went back, with `late: 1`.
 * (Until 0.4 an order paid while short of the full price took more of the payer's cash as it
 * waited, to win back its upgrades. With bought upgrades gone, every order is paid in full.)
 */
export function stepRebuilds(state, ev) {
  if (!state.rubble.length || !anyOrdered(state)) return;
  if (state.phase !== 'build' && state.phase !== 'wave') return;
  if (state.tick % Math.max(1, Math.round(TUNE.rebuildEvery * TICK_HZ)) !== 0) return;
  const done = new Map();
  for (const r of state.rubble.slice()) {
    if (r.by === undefined) continue;
    if (tidyRubble(state, r)) continue;
    const payer = state.players[r.by];
    if (!payer || payer.side === 'office') { releaseOrder(state, r); continue; }
    const by = r.by;
    if (!putBack(state, r).done) continue;
    done.set(by, (done.get(by) | 0) + 1);
  }
  for (const p of state.players) {
    const n = done.get(p.id);
    if (n) ev.push({ e: 'rebuilt', by: p.id, n, late: 1 });
  }
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
 *   place, remove and rotate with f: 1 do the same on The Back (0.4; see backCommand)
 *   { c: 'dropUp', x, y }       pay for the next cash level of the Returns Drop on (x, y) in The
 *                               Back: junk comes down faster (0.4; see dropUp)
 *   { c: 'give', to, n }        hand n of your cash to player `to`
 *   { c: 'rebuild' }            order back what gym bros destroyed of yours, oldest first, at the
 *                               rebuild price, as far as your cash goes (with all: true, everybody's):
 *                               the money is taken now, and each goes back at once, or as soon as
 *                               nothing is in the way (see orderRebuilds and stepRebuilds)
 *   { c: 'map', design, size }  lobby only, host only (state.host): change the store
 *   { c: 'settings', waves, startCash, difficulty, cardsOn }  lobby only, host only: the game's
 *                               settings (see SETTINGS); anything left out keeps its value.
 *                               cardsOn false takes the game's cards away, true deals a hand
 *   { c: 'ready', on }          lobby only: say you are ready (or not). The game starts when
 *                               every connected player is
 *   { c: 'skipCards', on }      the deal only (phase 'cards'): ask to see the rest of the cards at
 *                               once (or not; without on: yes). When every connected store player
 *                               has asked, the rest are revealed and the build phase begins
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
 *   { c: 'speed', n }           game speed: one of SPEEDS (1, 2, 3 or 5)
 *   { c: 'pause', on }          pause (on true) or resume (on false) the whole game, for everyone;
 *                               without on: flip it. Any player may, Head Office too, during the
 *                               deal, a build pause or a sales event. Asking for what already is
 *                               (pausing a paused game) is a harmless yes. While paused, step() does
 *                               nothing at all, and every command but those in WHILE_PAUSED is
 *                               refused with 'paused' (see setPause)
 * @param {Array} ev events are appended here
 * @returns {{ok: true} | {ok: false, why: string}}
 */
/**
 * The 'pause' command (see applyCommand). state.pause is { by: the player who paused } while the
 * game is paused and absent otherwise, so a game that is never paused (every save from before it,
 * every scripted player) has no such field at all. Sends { e: 'pause', on, by } when it changes.
 */
function setPause(state, pid, cmd, ev) {
  if (state.phase === 'lobby') return { ok: false, why: 'lobby' };
  if (!PAUSE_PHASES.has(state.phase)) return { ok: false, why: 'over' };
  if (cmd.on !== undefined && typeof cmd.on !== 'boolean') return { ok: false, why: 'bad' };
  const on = cmd.on === undefined ? !state.pause : cmd.on;
  if (on === !!state.pause) return { ok: true };
  if (on) state.pause = { by: pid };
  else delete state.pause;
  ev.push({ e: 'pause', on, by: pid });
  return { ok: true };
}

/**
 * place, remove and rotate on The Back (0.4; the commands with `f: 1`). Bought, owned, sold back and
 * turned like buildings on the shop floor, with the same reasons, but nothing there blocks a
 * shopper, so there is no route check, and there is no rubble. The Returns Drops are
 * the map's: nobody can place or remove one ('fixed'), anybody can turn one. Every change to the
 * layout moves state.backVer on, which tells back.js to work its lane order out again.
 *   place: a belt laid on a belt turns it to face d, free, keeping what is on it. Sends placed
 *     {k, x, y, d, by, f: 1}.
 *   remove: whoever paid for it gets TUNE.sellBack of what he paid; whatever was on it is lost.
 *     Sends removed {k, x, y, by, owner, f: 1}.
 *   rotate: a quarter turn clockwise; 'empty' for nothing there or a part that does not turn.
 */
function backCommand(state, pid, cmd, ev) {
  const player = state.players[pid];
  if (cmd.c === 'place') {
    const why = canPlaceBack(state, cmd.k, cmd.x, cmd.y, pid, cmd.d | 0);
    if (why) return { ok: false, why };
    const i = idxOf(state, cmd.x, cmd.y);
    if (state.back[i]) {
      state.back[i].d = cmd.d & 3;
      state.backVer = (state.backVer | 0) + 1;
      return { ok: true, turned: true };
    }
    const def = BUILD[cmd.k];
    const paid = buildPrice(state, cmd.k);
    const p = newPart(cmd.k, pid, cmd.d | 0);
    // (A card changed the price: kept, so that selling it back returns the usual share of it.)
    if (paid !== def.cost) p.c = paid;
    state.back[i] = p;
    state.backVer = (state.backVer | 0) + 1;
    player.cash -= paid;
    bump(state, pid, 'spent', paid);
    bump(state, pid, 'built');
    if (state.phase === 'build' && state.phaseT === -1 && !state.training) state.phaseT = FIRST_BUILD_SECS * TICK_HZ;
    ev.push({ e: 'placed', k: cmd.k, x: cmd.x, y: cmd.y, d: p.d | 0, by: pid, f: 1 });
    return { ok: true };
  }
  if (!Number.isInteger(cmd.x) || !Number.isInteger(cmd.y) || !inBounds(state, cmd.x, cmd.y) || !state.back) return { ok: false, why: 'bounds' };
  const i = idxOf(state, cmd.x, cmd.y);
  const p = state.back[i];
  if (cmd.c === 'remove') {
    if (state.phase === 'won' || state.phase === 'lost') return { ok: false, why: 'over' };
    if (!p) return { ok: false, why: 'empty' };
    if (BUILD[p.k].fixed) return { ok: false, why: 'fixed' };
    state.back[i] = 0;
    state.backVer = (state.backVer | 0) + 1;
    const back = Math.floor(spentOn(p) * TUNE.sellBack);
    (state.players[p.o] || player).cash += back;
    bump(state, pid, 'sold');
    ev.push({ e: 'removed', k: p.k, x: cmd.x, y: cmd.y, by: pid, owner: p.o, f: 1 });
    return { ok: true };
  }
  // rotate
  if (!p || !BUILD[p.k].rot) return { ok: false, why: 'empty' };
  p.d = (p.d + 1) & 3;
  state.backVer = (state.backVer | 0) + 1;
  return { ok: true };
}

/**
 * What the next cash level of a Returns Drop at level lv costs (the dropUp command, 0.4), in whole
 * dollars: BACK.dropUpCost, times BACK.dropUpGrow for each level it has. 0 at the top level.
 */
export function dropUpCost(lv) {
  lv |= 0;
  return lv >= BACK.dropUpMax ? 0 : Math.round(BACK.dropUpCost * BACK.dropUpGrow ** lv);
}

/**
 * The dropUp command (0.4): any player pays for the Returns Drop on (x, y) to send junk down
 * faster, one cash level (`lv`) at a time, up to BACK.dropUpMax. Each level multiplies its time
 * between junk by BACK.dropMul (dropTicks); a wait already under way is cut to the new time if it is
 * longer. The drop belongs to nobody, so the money is simply spent: nothing sells it back.
 * Refused with 'over', 'bounds', 'empty' (no Returns Drop there), 'max' or 'cash'.
 * Sends dropUp {x, y, lv, by, paid}.
 */
function dropUp(state, pid, cmd, ev) {
  if (state.phase === 'won' || state.phase === 'lost') return { ok: false, why: 'over' };
  if (!Number.isInteger(cmd.x) || !Number.isInteger(cmd.y) || !inBounds(state, cmd.x, cmd.y) || !state.back) return { ok: false, why: 'bounds' };
  const p = state.back[idxOf(state, cmd.x, cmd.y)];
  if (!p || p.k !== 'drop') return { ok: false, why: 'empty' };
  const lv = p.lv | 0;
  if (lv >= BACK.dropUpMax) return { ok: false, why: 'max' };
  const cost = dropUpCost(lv), player = state.players[pid];
  if (player.cash < cost) return { ok: false, why: 'cash' };
  player.cash -= cost;
  bump(state, pid, 'spent', cost);
  p.lv = lv + 1;
  p.t = Math.min(p.t | 0, dropTicks(p.lv, state));
  ev.push({ e: 'dropUp', x: cmd.x, y: cmd.y, lv: p.lv, by: pid, paid: cost });
  return { ok: true };
}

export function applyCommand(state, pid, cmd, ev = []) {
  // (Every value in a command comes from a player's browser and may be anything. Any of them used to
  // look something up by name goes through Object.hasOwn or a list's includes, never a bare obj[x]:
  // '__proto__', 'constructor' and 'toString' are found on every object.)
  const player = Number.isInteger(pid) ? state.players[pid] : null;
  if (!player || !cmd || typeof cmd !== 'object') return { ok: false, why: 'bad' };
  if (cmd.c === 'pause') return setPause(state, pid, cmd, ev);
  if (state.pause && !WHILE_PAUSED.has(cmd.c)) return { ok: false, why: 'paused' };
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
      setSettings(state, { waves: cmd.waves, startCash: cmd.startCash, difficulty: cmd.difficulty, cardsOn: cmd.cardsOn });
      return { ok: true };
    }
    if (cmd.c === 'ready') {
      player.ready = cmd.on !== false;
      return { ok: true };
    }
    if (cmd.c !== 'role') return { ok: false, why: 'lobby' };
  }
  if (state.phase === 'cards') {
    // The deal: nothing can be built until the cards are on the table. Everyone may ask to skip
    // the rest; the game speed may be set (it does not shorten the deal).
    if (cmd.c === 'skipCards') {
      player.skip = cmd.on !== false;
      return { ok: true };
    }
    if (cmd.c !== 'role' && cmd.c !== 'speed') return { ok: false, why: 'cards' };
  }
  // The Back (0.4): `f: 1` on place, remove and rotate means the floor under the shop.
  if ((cmd.c === 'place' || cmd.c === 'remove' || cmd.c === 'rotate') && cmd.f !== undefined && cmd.f !== 0) {
    if (cmd.f !== 1) return { ok: false, why: 'bad' };
    return backCommand(state, pid, cmd, ev);
  }
  switch (cmd.c) {
    case 'skipCards':
      return { ok: false, why: 'phase' };
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
      // On its own rubble it comes back as it was, at the rebuild price. If somebody had already
      // paid to rebuild that wreck (0.3.04), the held money goes back to him first: when that is
      // the placer, it is part of what he pays with now, so he pays once.
      if (at.rubble) releaseOrder(state, at.rubble);
      const deal = at.rubble ? rebuildDeal(at.rubble, player.cash) : null;
      const paid = deal ? deal.pay : buildPrice(state, cmd.k);
      // What the game's cards gave it: another price (kept, for what it sells back for). A rebuild
      // keeps what it had.
      let card = deal ? at.rubble : null;
      if (!deal) {
        // (A Free Sample table may hand out booze: the eightyproof card, decided now and kept.)
        const booze = boozeRoll(state, cmd.k);
        if (paid !== def.cost || booze) card = {};
        if (paid !== def.cost) card.c = paid;
        if (booze) card.bz = 1;
      }
      const b = newBuilding(cmd.k, pid, at.d, card);
      // The mallcop card: bought new, it comes stocked with Store Brand of every supply it takes but
      // Razor Wire, as if that many units had come up its Dumbwaiter (takesSupply keeps to the cap).
      const units = deal ? 0 : cardStock(state, cmd.k);
      for (let type = 1; type <= 4; type++) {
        const code = itemCode(type, 1);
        for (let n = 0; n < units && takesSupply(b, code); n++) addStock(b, code);
      }
      put(state, at.tiles, b);
      clearRubble(state, at.tiles);
      player.cash -= paid;
      bump(state, pid, 'spent', paid);
      bump(state, pid, 'built');
      if (state.phase === 'build' && state.phaseT === -1 && !state.training) state.phaseT = FIRST_BUILD_SECS * TICK_HZ;
      const e = { e: 'placed', k: cmd.k, x: at.i % state.w, y: (at.i / state.w) | 0, d: at.d, by: pid };
      if (deal) e.rebuilt = 1;
      if (card && card.bz) e.booze = 1;
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
    case 'give': {
      // (A player's number, nothing else: players['constructor'] would be an array's own function.)
      const to = Number.isInteger(cmd.to) ? state.players[cmd.to] : null;
      const n = Math.floor(cmd.n);
      if (!to || to === player || !(n > 0)) return { ok: false, why: 'bad' };
      if (player.cash < n) return { ok: false, why: 'cash' };
      player.cash -= n;
      to.cash += n;
      ev.push({ e: 'gave', by: pid, to: to.id, n });
      return { ok: true };
    }
    case 'rebuild':
      return orderRebuilds(state, pid, !!cmd.all, ev);
    case 'dropUp':
      return dropUp(state, pid, cmd, ev);
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
        // Head Office builds nothing: what he had paid to rebuild is his again (0.3.04).
        for (const r of state.rubble) if (r.by === pid) releaseOrder(state, r);
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
      if (!SPEEDS.includes(cmd.n)) return { ok: false, why: 'bad' };
      state.speed = cmd.n;
      return { ok: true };
    }
    default:
      return { ok: false, why: 'bad' };
  }
}
