// Game state: creation, random numbers, players, money. The state is a plain JSON-safe object so
// the host can send it to the other players as-is.
import { TUNE, MAX_PLAYERS, PLAYER_COLORS, ROLES, SETTINGS, TICK_HZ, BUILD, HOLIDAYS } from './constants.js';
import { makeMap, makeZones, makeDrops, MAP_DESIGNS, MAP_SIZES } from './maps.js';
// (cards.js imports rand from this file. That is safe: neither uses the other while loading.)
import { dealCards, cleanHand } from './cards.js';
// (back.js imports from this file too; the same holds.)
import { newDrop, syncAllLifts } from './back.js';

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
 * @property {number} [c]   what it cost to put down, only where a card made that differ from its
 *   kind's price (see buildPrice in cards.js); spentOn counts this instead of the price
 * @property {string} [f]   the track of its free upgrade levels (the offatruck and mallcop cards):
 *   they are in `u` like any, but spentOn leaves them out
 * @property {number} [fn]  ...how many of them, if not 1
 * @property {number} [bz]  Free Sample table only: 1 if it hands out booze (the eightyproof card;
 *   decided when it is bought new, and kept through wrecking and rebuilding: rubble carries it too)
 * @property {Object<string, number[]>} [s] (0.4) a building with Dumbwaiters (BUILD[k].lift): its
 *   stock of supplies from The Back, by track ('dmg', 'spd', 'rng', 'dur', 'wire'), each as runs
 *   [tier, uses, tier, uses, ...] in the order they arrived; absent with none. Lost when it is
 *   wrecked or removed (see back.js)
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
 *                        fields below and are never super), or 'pup' (one of a pregnant Stray
 *                        Dog's puppies, the spayed card; see PUP: the same as a baby). A shopper
 *                        a booze table turned into a Day Drinker (the eightyproof card) has
 *                        'drinker' from then on.
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
 * @property {number} [ro]  Card Trader: ticks before he will stop to watch another one rip a pack
 *                          (TUNE.ripCool); absent reads as 0
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
 * The game's cards (0.3.01) add a few, all absent in a game without them:
 * @property {number} [pd]  anyone who stops to pet an emotional support dog (the supportdog card):
 *                          the id of the dog's owner he last petted, so he does not stop for that
 *                          dog again
 * @property {number} [ex]  dad (the eyesup card): the id of the Exhibitionist he has fallen in
 *                          behind, while he trails her
 * @property {number} [bq]  a shopper who drinks (the eightyproof card): how many booze tables he
 *                          has stopped at (each makes the next likelier to turn him)
 */

/**
 * @typedef {Object} Player
 * @property {number} id     index into state.players
 * @property {string} name
 * @property {string} color
 * @property {string} role   job title (cosmetic)
 * @property {boolean} on    connected right now
 * @property {boolean} ready  lobby only: he has pressed Ready
 * @property {boolean} [skip] the deal only (the 'cards' phase): he wants the rest of the cards shown
 *   at once (the skipCards command); absent means no, and it is removed when the deal ends
 * @property {string} side   'store' (builds and defends) or 'office' (runs the shoppers; see office.js)
 * @property {number} cash   this player's own money. Everything the store earns or loses is
 *                           split evenly between the connected players.
 * @property {number} [gone] how long he has been away, while his grace period runs, in ticks at
 *                          normal speed (so it measures real time at any game speed; see
 *                           setPlayerOnline). Absent when he is here, or away with nothing pending.
 * @property {Object} w     statistics for this wave
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
 * @param {{waves?: number, startCash?: number, difficulty?: string, cardsOn?: boolean}} [o.settings]
 *   the host's choices (see SETTINGS in constants.js); anything left out or not on the list is the
 *   default. cardsOn false (0.3.01, the host's "Cards: Off") means no deal even when `cards` is
 *   true; it does not touch a forced hand.
 * @param {boolean} [o.lobby] start in the lobby: nothing runs and nothing can be built until
 *   every connected player has said he is ready. The host may change the map there.
 * @param {string|null} [o.holiday] the holiday this game is played in (a key of HOLIDAYS; the
 *   host works it out from his computer's date, see src/content/holidays.js). Anything else is
 *   no holiday. Kept as `state.holiday`, absent for none.
 * @param {boolean|string[]} [o.cards] the game's cards (see cards.js): true deals a hand now, with
 *   rand(), to be revealed in the deal (the 'cards' phase) when the game begins: at once, or when
 *   everyone in the lobby is ready. A list of card ids is a forced hand (tests, the balance tool,
 *   the URL option), tidied by cleanHand, with no deal phase. Left out (or anything else): no cards.
 *   A training game never has any.
 */
export function createGame({ seed = 1, training = false, map = null, zones = !!map, lobby = false, settings = null, holiday = null, cards = null } = {}) {
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
    zones: zones ? makeZones(plan.w, plan.h, plan.tiles, plan.doors, design) : '',
    /** Entrances in the order they open, each a list of tile indexes; `open` of them are open. */
    doors: plan.doors,
    open: 0,
    /** @type {Array<Building|0>} */
    grid: new Array(plan.w * plan.h).fill(0),
    gridVer: 0,
    /** The Back (0.4), the floor under the shop: like `grid`, one entry per tile, a Back part or 0
     *  (the parts' shapes are in back.js and docs/architecture.md, "The Back"). A game made with a
     *  map has its Returns Drops in it from the start (makeDrops in maps.js); the bare default map
     *  has none for now. A save from before it loads with an empty one (migrateSave). */
    back: blankBack(plan, map ? design : null),
    /** Goes up whenever a Back part is added, removed or turned; back.js caches its lane order
     *  against it, as path maps are cached against gridVer. */
    backVer: 0,
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
     *  { i, k, d, o, u, spent }: anchor tile, kind, facing, owner, upgrade levels (as on a
     *  building, possibly {}), what had been spent on it (spentOn); plus `c`, `f`, `fn`, `bz` when
     *  a card gave it those. The 'rebuild' command, or placing the same kind there, puts them back
     *  at TUNE.rebuildShare of that.
     *  Ordered (0.3.04): a wreck somebody has pressed Rebuild for also has `by` (the id of the
     *  player who pressed and paid) and `res` (whole dollars already taken from his cash and held
     *  for it). Without `by` it is not ordered. step() puts an ordered wreck back as soon as nothing
     *  is in the way (stepRebuilds in commands.js); if it stops being rubble any other way, the
     *  held money goes back to him (releaseOrder). Saves from before 0.2.15 to 0.3.03 may carry
     *  `at` (the tick it broke, for the old auto-rebuild's delay): nothing reads it any more. */
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
    /** 'lobby' | 'cards' (the deal: see cards.js) | 'build' | 'wave' | 'won' | 'lost' */
    phase: lobby ? 'lobby' : 'build',
    /** Ticks left in the build phase; -1 means wait until a player starts the wave. */
    phaseT: -1,
    speed: 1,
    // (state.pause, 0.3.02: { by: the id of the player who paused } while the game is paused, and
    // absent the rest of the time, as in every save from before it. While it is set, step() does
    // nothing at all, not even the clock, and applyCommand refuses everything but pausing, speed,
    // job titles and skipping the cards (see setPause in commands.js). It is
    // saved and sent with the state, so a game saved or joined while paused is paused.)
    /** The player running the shoppers, if any: see office.js. */
    office: null,
    /** With a Head Office player: the store side has said the doors may open early. */
    storeReady: false,
    /** Totals for the current wave, shown in the performance review. */
    ws: { escaped: 0, stopped: 0, stolen: 0, earned: 0, refunded: 0, wrecked: 0 },
    /** (0.3.03) Dollars paid for goods reaching a Shipping Chute over the whole game, before they
     *  are split: only `offer`'s sales as the game is played. Not the bonus at the end of a sales
     *  event, a boss's bounty, a shopper buying at a stand (the warranty card), the restocking fee,
     *  nor the factory's takings paid in one go when the doors open early (skipBuild leaves it as
     *  it was). Never reset during a game; a new game starts at 0. Nothing in the rules reads it:
     *  the interface turns it into the income-per-minute panel (src/ui/rate.js). Absent in a save
     *  from before it existed, which reads as 0. */
    sales: 0,
    /** @type {Player[]} */
    players: [],
    /** The player whose browser runs the game. Changes if the host leaves and another takes over. */
    host: 0,
  };
  // The holiday (0.3): the bosses' outfits and DEB's holiday jokes. Decoration only: no rule reads
  // it. Left out altogether when there is none, as in saves from before it existed.
  if (HOLIDAYS.includes(holiday)) state.holiday = holiday;
  // The cards (0.3.01). Both fields are left out altogether in a game without them, as in every
  // save from before they existed.
  //   cards  the hand: card ids in the order they are revealed (see cards.js)
  //   dealT  only while the deal is still to come (in the lobby) or under way (the 'cards' phase):
  //          how far into it the game is, in sixtieths of a tick at normal speed (see stepDeal)
  // The host's "Cards: On / Off" setting has no field of its own: cards are on exactly when there
  // is a hand (cardsOn below). In the lobby the 'settings' command with cardsOn deals a hand or
  // takes it away (setSettings), and "Back to the lobby" deals again only if the last game had one.
  if (!training && cards === true && set.cardsOn) {
    state.cards = dealCards(state);
    state.dealT = 0;
    if (!lobby) state.phase = 'cards';
  } else if (!training && Array.isArray(cards)) {
    const hand = cleanHand(cards);
    if (hand.length) state.cards = hand;
  }
  openDoors(state);
  return state;
}

/**
 * A fresh Back (0.4) for a floor plan: empty, with a Returns Drop under each Loading Bay patch when
 * a design is given (see makeDrops). `design` null means the bare default map: no drops yet.
 */
function blankBack(plan, design) {
  const back = new Array(plan.w * plan.h).fill(0);
  if (design) for (const { i, d } of makeDrops(plan.w, plan.h, plan.tiles, plan.doors, design)) back[i] = newDrop(d);
  return back;
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
 * Any version (0.3.04): auto-rebuild is gone, so a player's old `autoRebuild` switch and the
 * tick a wreck broke (`at`, only its delay read it) are dropped. Neither changes how the game
 * plays; it only keeps dead fields out of the state.
 * @returns {boolean} whether anything was changed
 */
export function migrateSave(state) {
  if (!state) return false;
  let changed = false;
  for (const p of state.players || []) if ('autoRebuild' in p) { delete p.autoRebuild; changed = true; }
  for (const r of state.rubble || []) if ('at' in r) { delete r.at; changed = true; }
  // Any version (0.4): a save from before The Back has none; it gets an empty one (no drops: the
  // marked floor it would place them by is part of the old factory such a save still runs).
  if (!Array.isArray(state.back) || state.back.length !== state.w * state.h) {
    state.back = new Array(state.w * state.h).fill(0);
    state.backVer = 0;
    changed = true;
  }
  // Any version (0.4, stage 3): every security building with `lift`, and the rubble of one, gets its
  // Dumbwaiters, as one placed now would.
  if (Array.isArray(state.grid) && state.grid.length === state.w * state.h && syncAllLifts(state)) changed = true;
  if ((state.v | 0) >= STATE_VERSION) return changed;
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

/**
 * Settings with anything missing or not on the list replaced by the default. cardsOn (0.3.01):
 * whether the game is dealt cards; anything but false is on.
 */
export function cleanSettings(o) {
  const d = SETTINGS.defaults, s = o || {};
  return {
    waves: SETTINGS.waves.includes(s.waves) ? s.waves : d.waves,
    startCash: SETTINGS.startCash.includes(s.startCash) ? s.startCash : d.startCash,
    // (Its own keys only: '__proto__' or 'toString' are found on every object.)
    difficulty: typeof s.difficulty === 'string' && Object.hasOwn(SETTINGS.difficulty, s.difficulty) ? s.difficulty : d.difficulty,
    cardsOn: s.cardsOn !== false,
  };
}

/** True if the game has cards (a hand, dealt or still to be dealt): the host's "Cards" setting. */
export const cardsOn = (state) => !!(state.cards && state.cards.length);

/**
 * Lobby only: changes the host's settings. Nothing has been spent yet, so every player's cash
 * becomes the new starting cash, and everyone has to press Ready again.
 * cardsOn (0.3.01, true or false; anything else leaves it as it is): switched off, the hand and the
 * deal still to come are taken away, so the game goes from the lobby straight to its first build
 * phase like any game without cards; switched back on, a fresh hand is dealt with rand() (nobody
 * has seen the old one). Never in a training game.
 * @returns {boolean} false if the game has started
 */
export function setSettings(state, o) {
  if (state.phase !== 'lobby') return false;
  // Anything not mentioned keeps the value it has.
  const now = { waves: state.waves, startCash: state.startCash, difficulty: state.difficulty, cardsOn: cardsOn(state) };
  for (const k of ['waves', 'startCash', 'difficulty']) if (o && o[k] !== undefined) now[k] = o[k];
  if (o && typeof o.cardsOn === 'boolean') now.cardsOn = o.cardsOn;
  const set = cleanSettings(now);
  state.waves = set.waves;
  state.startCash = set.startCash;
  state.difficulty = set.difficulty;
  if (set.cardsOn !== cardsOn(state) && !state.training) {
    if (set.cardsOn) {
      state.cards = dealCards(state);
      state.dealT = 0;
    } else {
      delete state.cards;
      delete state.dealT;
    }
  }
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
  if (state.phase !== 'lobby' || typeof design !== 'string' || typeof size !== 'string' || !Object.hasOwn(MAP_DESIGNS, design) || !Object.hasOwn(MAP_SIZES, size)) return false;
  const plan = makeMap(design, size, state.doors.length);
  state.map = { design, size };
  state.w = plan.w;
  state.h = plan.h;
  state.tiles = plan.tiles;
  state.decor = plan.decor;
  state.doors = plan.doors;
  state.open = 0;
  if (state.zones) state.zones = makeZones(plan.w, plan.h, plan.tiles, plan.doors, design);
  state.grid = new Array(plan.w * plan.h).fill(0);
  state.gridVer++;
  state.back = blankBack(plan, design);
  state.backVer = (state.backVer | 0) + 1;
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
 * money; the clock keeps running for him in case someone else turns up. Money he had paid for
 * rebuilds still waiting (0.3.04) is part of it: those orders are cancelled first and shared out
 * with his cash, so no later refund of an order can hand money to someone who has gone.
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
    for (const r of state.rubble) if (r.by === p.id) releaseOrder(state, r);
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

/**
 * Cancels the order on one wreck (0.3.04): the money held for it (`res`) goes back in full to the
 * player who paid it (`by`), if he is still in the game, and the wreck is plain rubble again. Used
 * whenever an ordered wreck stops being rubble without being rebuilt from it (something else built
 * over it, the rubble list overflowing, its payer gone to Head Office, the game ending), so held
 * money is never lost. Does nothing to a wreck nobody ordered.
 */
export function releaseOrder(state, r) {
  if (r.by === undefined) return;
  const p = state.players[r.by];
  if (p) p.cash += r.res | 0;
  delete r.by;
  delete r.res;
}

/**
 * Gives back all the money held for ordered wrecks (0.3.04), when the game is won or lost: the end
 * screen and DEB's final count read the players' cash, and money waiting for a rebuild that will
 * never happen is still theirs.
 */
export function releaseAllOrders(state) {
  for (const r of state.rubble) releaseOrder(state, r);
}

/** The money held for rebuilds a player has paid for and that are waiting (0.3.04). */
export function heldFor(state, pid) {
  let sum = 0;
  for (const r of state.rubble) if (r.by === pid) sum += r.res | 0;
  return sum;
}

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
