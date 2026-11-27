// The cards (0.3.01, the owner's request): five changes to the rules, dealt to each game from the
// menu when everyone is ready. Two are bad for the players, two good, one neither, revealed in that
// order (bad, good, bad, good, odd) during the deal, a phase of its own ('cards') between the lobby
// and the first build phase. The cards' numbers are CARDS in constants.js.
//
// A game's hand is `state.cards`: plain card ids in the order they are revealed, a per-kind card
// carrying its kind after a colon ('hardy:karen'). Absent or empty: no cards (every game before
// 0.3.01, the tutorial, the URL test options, the tests). Cards never apply in a training game.
//
// The rules ask the helpers at the bottom of this file at the one place each number is worked out
// (patienceFor, the speed line in stepShoppers, eventPay, escape, statsOf, the price check in
// commands.js, where beginWave turns waveSpec() into the arrival queue, The Back's machines, bins
// and Dumbwaiters in back.js), so each rule site stays one readable line. Every helper gives exactly 1 (or 0 for an amount added) in a game without the card,
// so such a game plays tick for tick as it did before the cards existed.
import { CARDS, DEALABLE, CARDS_APART, CARD_SKIP_KINDS, SHOPPERS, BUILD, TUNE, TICK_HZ } from './constants.js';
import { rand } from './state.js';

// ---- The hand -------------------------------------------------------------------------------------

/** The order cards are dealt and revealed in, by side. */
export const DEAL_ORDER = ['bad', 'good', 'bad', 'good', 'odd'];

/** The kinds of shopper a per-kind card may pick (every kind but CARD_SKIP_KINDS). */
export const cardKinds = () => Object.keys(SHOPPERS).filter((k) => !CARD_SKIP_KINDS.includes(k));

/** A card id in a hand split into its card ('hardy') and its kind ('karen', or null). */
export function cardParts(id) {
  const s = String(id), at = s.indexOf(':');
  return at < 0 ? [s, null] : [s.slice(0, at), s.slice(at + 1)];
}

/** True if two cards in a hand clash: the same card twice, or a pair in CARDS_APART (per-kind: same kind). */
function clash(a, b) {
  const [ca, ka] = cardParts(a), [cb, kb] = cardParts(b);
  if (ca === cb) return true;
  const apart = CARDS_APART.some(([x, y]) => (x === ca && y === cb) || (x === cb && y === ca));
  if (!apart) return false;
  return CARDS[ca].per === 'kind' || CARDS[cb].per === 'kind' ? ka === kb : true;
}

/**
 * Deals a game's hand with rand(state): one card for each side in DEAL_ORDER, from DEALABLE, never
 * one that clashes with a card already dealt (CARDS_APART, and no card twice). A per-kind card then
 * picks its kind from cardKinds(), never one that would clash. Does not change the hand in the
 * state: createGame keeps what it returns.
 * @returns {string[]} the card ids, in the order they are revealed
 */
export function dealCards(state) {
  const hand = [];
  const kinds = cardKinds();
  for (const side of DEAL_ORDER) {
    // Every card of this side that can still go in, with the kinds a per-kind one could still pick.
    const pool = [];
    for (const id of DEALABLE) {
      const c = CARDS[id];
      if (!c || c.side !== side) continue;
      if (c.per === 'kind') {
        const ok = kinds.filter((k) => !hand.some((h) => clash(h, `${id}:${k}`)));
        if (ok.length) pool.push([id, ok]);
      } else if (!hand.some((h) => clash(h, id))) pool.push([id, null]);
    }
    if (!pool.length) continue;
    const [id, ok] = pool[Math.floor(rand(state) * pool.length)];
    hand.push(ok ? `${id}:${ok[Math.floor(rand(state) * ok.length)]}` : id);
  }
  return hand;
}

/**
 * A hand given from outside (tests, the balance tool, the URL option), tidied: anything that is not
 * a card in CARDS is dropped, as is a per-kind card without a kind it may pick, a card that is not
 * per-kind but names a kind, and a second copy of a card. Any card in CARDS may be forced, dealable
 * or not, and clashing pairs are allowed: a forced hand is what the tester asked for.
 * @returns {string[]}
 */
export function cleanHand(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  const kinds = cardKinds();
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const [id, kind] = cardParts(raw.trim());
    const c = Object.hasOwn(CARDS, id) ? CARDS[id] : null;
    if (!c) continue;
    if (c.per === 'kind' ? !kinds.includes(kind) : kind !== null) continue;
    const full = kind ? `${id}:${kind}` : id;
    if (out.some((h) => cardParts(h)[0] === id && (c.per !== 'kind' || h === full))) continue;
    out.push(full);
  }
  return out;
}

// Each hand parsed once (it never changes in a game), keyed by the array itself.
const PARSED = new WeakMap();
function parsed(state) {
  const hand = state.cards;
  let p = PARSED.get(hand);
  if (!p) { p = hand.map(cardParts); PARSED.set(hand, p); }
  return p;
}

/** True if the game's cards are in force: it has some, and it is not a training game. */
const inForce = (state) => !!(state.cards && state.cards.length && !state.training);

/**
 * True if the game has this card. `id` is a card ('hardy': any kind) or a card with its kind
 * ('hardy:karen'). Always false in a training game.
 */
export function hasCard(state, id) {
  if (!inForce(state)) return false;
  const [c, k] = cardParts(id);
  for (const [pc, pk] of parsed(state)) if (pc === c && (k === null || pk === k)) return true;
  return false;
}

/** The kind a per-kind card picked in this game ('karen'), or null if the game does not have it. */
export function cardKind(state, id) {
  if (!inForce(state)) return null;
  for (const [pc, pk] of parsed(state)) if (pc === id) return pk;
  return null;
}

// ---- The deal -------------------------------------------------------------------------------------

/**
 * The deal's clock, `state.dealT`, counts sixtieths of a tick at normal speed: each step adds
 * FINE / speed, a whole number at every speed in SPEEDS (60, 30, 20, 12), so game speed does not
 * shorten the deal and nothing drifts.
 */
const FINE = 60;

/** The tick of the deal (at normal speed) at which card i is revealed. */
export const revealTick = (i) => Math.round((TUNE.cardLead + i * TUNE.cardSecs) * TICK_HZ);

/** How many ticks (at normal speed) the deal of n cards lasts. */
export const dealLength = (n) => Math.round((TUNE.cardLead + n * TUNE.cardSecs + TUNE.cardPause) * TICK_HZ);

/** How far into the deal the game is, in ticks at normal speed (0 before it starts). */
export const dealTicks = (state) => (state.dealT || 0) / FINE;

/**
 * How many of the game's cards have been revealed: none in the lobby of a game still to be dealt,
 * then one by one during the deal, all of them after it (and in a game whose hand was forced,
 * which has no deal). 0 in a game without cards.
 */
export function cardsShown(state) {
  const n = state.cards ? state.cards.length : 0;
  if (!n || state.dealT === undefined) return n;
  if (state.phase === 'lobby') return 0;
  const t = dealTicks(state);
  let shown = 0;
  while (shown < n && t >= revealTick(shown)) shown++;
  return shown;
}

/**
 * One step of the deal (the 'cards' phase; step() calls it). The first step sends `deal` {n}.
 * Each card sends `card` {i, id} as it is revealed. When every connected store player has asked to
 * skip (`player.skip`, the skipCards command), the rest are revealed at once, their `card` events
 * still sent. When it is over the game goes into its first build phase exactly as a game without
 * cards does from the lobby: phase 'build', untimed until something is built, and the `begun` event.
 */
export function stepDeal(state, ev) {
  const n = state.cards ? state.cards.length : 0;
  if (!(state.dealT > 0)) {
    state.dealT = 0;
    ev.push({ e: 'deal', n });
  }
  const before = cardsShown(state);
  const end = dealLength(n) * FINE;
  const store = state.players.filter((p) => p.on && p.side !== 'office');
  if (store.length && store.every((p) => p.skip)) state.dealT = end;
  else state.dealT = Math.min(end, state.dealT + Math.max(1, Math.round(FINE / (state.speed || 1))));
  const after = state.dealT >= end ? n : cardsShown(state);
  for (let i = before; i < after; i++) ev.push({ e: 'card', i, id: state.cards[i] });
  if (state.dealT < end) return;
  delete state.dealT;
  for (const p of state.players) delete p.skip;
  state.phase = 'build';
  state.phaseT = -1;
  ev.push({ e: 'begun' });
}

// ---- Helpers for the rules ------------------------------------------------------------------------

/** That number of a card if the game has it, otherwise 1. */
const mul = (state, id, key) => (hasCard(state, id) ? CARDS[id][key] : 1);

/** A salt for each card, so different cards pick different shoppers by id. */
function saltOf(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 9973) / 9973;
}

/**
 * A game's own turn of the wheel, in [0, 1), from its seed. Shoppers' ids come out in the same
 * order in every game, so without this a card would pick the very same shoppers every time it was
 * dealt (the playtest found Double Dipping always doubling the same dad in event 2). No seed
 * gives no turn.
 */
const seedTurn = (seed) => (((seed >>> 0) % 1000003) * 0.6180339887498949) % 1;

/**
 * Where a shopper (by id) falls for one card in one game, in [0, 1): his id stepped through by the
 * plastic number's reciprocal (neither the golden ratio of babyPace and kidFirst nor the silver of
 * walkPace, so it lines up with neither), plus a salt for the card, plus the game's own turn (its
 * seed, so each game picks different shoppers). A share of the shoppers is those below it: no
 * field in the state, no random draw, the same on every computer.
 */
export function idShare(id, card, seed = 0) {
  const f = (id * 0.7548776662466927 + saltOf(card) + seedTurn(seed)) % 1;
  return f < 0 ? f + 1 : f;
}

/** True if the game has a card with a `share`, and this shopper (by id) is in it. */
export const cardPicks = (state, id, s) => hasCard(state, id) && idShare(s.id, id, state.seed) < CARDS[id].share;

/**
 * The cards' multiplier on the patience a shopper of kind k walks in with (k is 'baby' for a
 * Pregnant Lady's babies; the boss has his own, cardBoss). hardy, frail: the kind they picked.
 * bulkbuy, flashmob: the ordinary crowd (not babies, not Card Traders). fathersday, openbar: their
 * kind. mallwalkers: everyone. convention: Cosplayers.
 */
export function cardPatience(state, k) {
  if (!inForce(state)) return 1;
  let m = 1;
  for (const [c, kind] of parsed(state)) {
    const card = CARDS[c];
    if (!card) continue;
    if (c === 'hardy' || c === 'frail') { if (kind === k) m *= card.hp; }
    else if (c === 'bulkbuy' || c === 'flashmob') { if (k !== 'baby' && k !== 'pup' && k !== 'trader') m *= card.hp; }
    else if (c === 'fathersday' || c === 'openbar') { if (k === card.who) m *= card.hp; }
    else if (c === 'mallwalkers') m *= card.hp;
    else if (c === 'convention') { if (k === 'cosplay') m *= card.hp; }
  }
  return m;
}

/** The boss's patience multiplier (bde). */
export const cardBoss = (state) => mul(state, 'bde', 'hp');

/**
 * The cards' multiplier on a shopper's walking speed, on top of his own pace. hurry, slow: the kind
 * they picked. mallwalkers: everyone but the boss. convention: a Cosplayer walks at the card's
 * speed in tiles a second, whatever his kind's.
 */
export function cardSpeed(state, s, def) {
  if (!inForce(state) || s.k === 'boss') return 1;
  let m = 1;
  for (const [c, kind] of parsed(state)) {
    if (c === 'hurry' || c === 'slow') { if (kind === s.k) m *= CARDS[c].speed; }
    else if (c === 'mallwalkers') m *= CARDS.mallwalkers.speed;
    else if (c === 'convention') { if (s.k === 'cosplay' && def.speed > 0) m *= CARDS.convention.speed / def.speed; }
  }
  return m;
}

/**
 * The cards' multiplier on how many of a group of kind k turn up in an ordinary sales event
 * (beginWave asks for every group but the boss and a Midnight Release mob). doorbuster, bulkbuy,
 * flashmob: every group. fathersday, openbar: their kind.
 */
export function cardCrowd(state, k) {
  if (!inForce(state)) return 1;
  let m = 1;
  for (const [c] of parsed(state)) {
    const card = CARDS[c];
    if (c === 'doorbuster' || c === 'bulkbuy' || c === 'flashmob') m *= card.crowd;
    else if ((c === 'fathersday' || c === 'openbar') && k === card.who) m *= card.crowd;
  }
  return m;
}

/** How many babies a Pregnant Lady pops, times (litter, pulledout). */
export const cardPops = (state) => mul(state, 'litter', 'pops') * mul(state, 'pulledout', 'pops');

/**
 * The cards' multiplier on the cash a shopper takes at a till: doubledip (a share of shoppers by
 * id; not the boss, not babies), payday (every refund).
 */
export function cardRefund(state, s, def) {
  if (!inForce(state)) return 1;
  let m = 1;
  if (!def.boss && !def.baby && cardPicks(state, 'doubledip', s)) m *= CARDS.doubledip.cash;
  return m * mul(state, 'payday', 'refund');
}

/**
 * The cards' multiplier on the event pay (eventPay in step.js), and so on the speed bonus worked
 * out from it: overtime, clearance, payday. (Until 0.4 clearance and payday changed what goods
 * sold for instead.)
 */
export const cardPay = (state) => mul(state, 'overtime', 'pay') * mul(state, 'clearance', 'pay') * mul(state, 'payday', 'pay');

/**
 * The group a building's price is in for rentacop and sweatshop: 'security' (Crate Stacks count:
 * they are the security side's wall), 'back' (The Back's parts), or the kind's own group (the old
 * shop-floor factory, which neither card touches any more).
 */
const priceGroup = (k, def) => (k === 'crate' ? 'security' : def.group);

/**
 * What a building of kind k costs to put down in this game (not to rebuild):
 * shrinkflation and staffdiscount every building, rentacop and sweatshop by its group (priceGroup).
 * Whole dollars, never under one.
 */
export function buildPrice(state, k) {
  const def = BUILD[k];
  if (!def) return 0;
  if (!inForce(state)) return def.cost;
  let m = 1;
  for (const [c] of parsed(state)) {
    const card = CARDS[c];
    if (c === 'shrinkflation' || c === 'staffdiscount') m *= card.cost;
    else if (c === 'rentacop' || c === 'sweatshop') m *= card.cost[priceGroup(k, def)] ?? 1;
  }
  return m === 1 ? def.cost : Math.max(1, Math.round(def.cost * m));
}

// ---- The Back (0.4): the cards that were about goods prices or the old factory -------------------
// Each is 1 (or 0 for an amount added) without its card.

/** What a Clearance Bin pays for a supply, times (lootbox). */
export const cardBin = (state) => mul(state, 'lootbox', 'bin');

/** How many times as fast a Rebrander works (asseenontv; artisanal slows it, see cardWork). */
export const cardRebrand = (state) => mul(state, 'asseenontv', 'rebrand');

/** Units of each supply a Dumbwaiter holds on top of BACK.stockUnits (regifting). */
export const cardUnits = (state) => (hasCard(state, 'regifting') ? CARDS.regifting.units : 0);

/** A machine's or Rebrander's time in The Back, times (artisanal). */
export const cardWork = (state) => mul(state, 'artisanal', 'work');

/** The uses one unit of supply gives, times (artisanal; usesPer rounds the result up). */
export const cardUses = (state) => mul(state, 'artisanal', 'uses');

/**
 * mallcop (0.4; until then it gave free upgrade levels): how many units of Store Brand of each
 * supply it takes, Razor Wire left out, a building of kind k comes with when it is bought new
 * (not rebuilt from rubble). 0 without the card, and for anything without Dumbwaiters.
 */
export const cardStock = (state, k) => (BUILD[k] && BUILD[k].lift && hasCard(state, 'mallcop') ? CARDS.mallcop.units : 0);

/**
 * offatruck (0.4; until then it gave the factory free upgrade levels): how many times as fast every
 * Returns Drop puts out junk (dropTicks in back.js divides its time by this). 1 without the card.
 */
export const cardDrop = (state) => (hasCard(state, 'offatruck') ? CARDS.offatruck.drop : 1);

/**
 * The cards' changes to a building's working numbers (statsOf with the state): premature (towers
 * fire faster and reach less far).
 * @returns {Object} st, changed in place
 */
export function cardStats(state, b, st) {
  if (!inForce(state)) return st;
  if (BUILD[b.k].tower && hasCard(state, 'premature')) {
    st.cd /= CARDS.premature.rate;
    st.range *= CARDS.premature.range;
  }
  return st;
}

/** How many shoppers an area tower of kind k reaches at once (`n` without a card): firecode. */
export const cardTargets = (state, k, n) => (k === 'sprinkler' && hasCard(state, 'firecode') ? CARDS.firecode.targets : n);

/** A gym bro's hits in a visit, times (preworkout: a share of them, by id). */
export const cardSmash = (state, s) => (cardPicks(state, 'preworkout', s) ? CARDS.preworkout.hits : 1);

/** How long a dog's pee switches security off, times (pissing). */
export const cardPee = (state) => mul(state, 'pissing', 'pee');

/** The chance to slip on a wet floor or a mess, times (sensibleshoes, mopmike). */
export const cardSlip = (state) => mul(state, 'sensibleshoes', 'slip') * mul(state, 'mopmike', 'slip');

/** A Day Drinker's chance to fall at a corner, times (dryjanuary, happyhour). */
export const cardFall = (state) => mul(state, 'dryjanuary', 'fall') * mul(state, 'happyhour', 'fall');

/** What a boss's pep talk gives back, times (retreat). */
export const cardPep = (state) => mul(state, 'retreat', 'pep');

/** Tiles added to a Cosplayer's shield reach (convention: from TUNE.shield to the card's). */
export const cardShield = (state, def) => (def.shields && hasCard(state, 'convention') ? CARDS.convention.shield - TUNE.shield : 0);

/**
 * The klepto card (ordinary shoplifters, never a Card Trader): a shoplifter's chance to steal a
 * unit of stock as he passes, times; and the share of his full patience every theft gives him back
 * (the thrill of it), 0 without the card. Reworked on the owner's decision (2026-11-24): it used
 * to send him from further away too, but a longer detour only kept him in reach of security. (Until
 * 0.4 the chance was his chance to go out of his way for goods on a belt; that detour is gone.)
 */
export const cardGrabChance = (state, def) => (def.rips ? 1 : mul(state, 'klepto', 'chance'));
export const cardGrabHeal = (state, def) => (!def.rips && hasCard(state, 'klepto') ? CARDS.klepto.heal : 0);

/** What a shopper who storms out pays the store on his way (restocking; not babies or puppies). */
export const cardFee = (state, s) => (s.k !== 'baby' && s.k !== 'pup' && hasCard(state, 'restocking') ? CARDS.restocking.fee : 0);

// ---- The cards that change how shoppers behave (0.3.01, second round) ----------------------------
// Each is asked only where its rule lives in step.js; each answers "no" (or 1, or 0) in a game
// without the card, without drawing a random number, so such a game plays as before.

/** How many times as often a mom's child may run off (offleash: a share of moms, by id). */
export const cardKidRuns = (state, s) => (cardPicks(state, 'offleash', s) ? CARDS.offleash.runs : 1);

/**
 * True if this run of a mom's child is back toward the entrance (wrongway: a share of the runs,
 * not of the kids). Worked out from her id and how many times he has run (`kn`, already counted
 * for this run), so every run is its own chance, and nothing new is stored or drawn.
 */
export const kidBack = (state, s) => hasCard(state, 'wrongway') && idShare(s.id * 31 + (s.kn | 0), 'wrongway', state.seed) < CARDS.wrongway.share;

/** True if a runaway child runs on along the shoppers' own route, further than usual (freerange). */
export const kidAlong = (state) => hasCard(state, 'freerange');

/**
 * How many puppies this shopper bursts into when her patience runs out: 0 unless she is a pregnant
 * Stray Dog (spayed: a share of dogs, by id), else CARDS.spayed.pups, or supPups for a Great Dane.
 */
export const pupsOf = (state, s) => (s.k === 'dog' && cardPicks(state, 'spayed', s) ? (s.sup ? CARDS.spayed.supPups : CARDS.spayed.pups) : 0);

/** True if this dad is one of those who fall in behind an Exhibitionist (eyesup: a share, by id). */
export const trailsFlasher = (state, s) => s.k === 'dad' && cardPicks(state, 'eyesup', s);

/** True if this Man with Guide Dog has an emotional support dog instead (supportdog: a share, by id). */
export const supportDog = (state, s) => s.k === 'blind' && cardPicks(state, 'supportdog', s);

/**
 * True if a shopper of this definition may stop to pet a support dog: not dads, the boss, babies
 * or puppies (they never stop), and not the men with dogs of their own.
 */
export const stopsToPet = (def) => !def.boss && !def.baby && !def.bolts && !def.hopsBelts;

/**
 * Whether a Free Sample table being put down hands out booze (eightyproof: a share of tables,
 * with rand(), decided once when it is bought new and kept on the building as `bz`). False, with
 * no random number drawn, in a game without the card.
 */
export const boozeRoll = (state, k) => k === 'samples' && hasCard(state, 'eightyproof') && rand(state) < CARDS.eightyproof.share;

/**
 * True if a shopper of this definition can be turned into a Day Drinker by a booze table: an
 * adult who stops at sample tables, so not moms, Pregnant Ladies or babies (and not Teenagers,
 * who never stop anyway).
 */
export const drinks = (def) => !!def.browses && !def.kid && !def.pops && !def.baby;

/** The chance a shopper turns into a Day Drinker at a booze table, after `n` others (eightyproof). */
export const boozeChance = (n) => Math.min(1, CARDS.eightyproof.chance + CARDS.eightyproof.step * n);

/** True if a Teenager's mess also covers the four tiles beside it (slushie). */
export const wideMess = (state) => hasCard(state, 'slushie');
