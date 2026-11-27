// The director turns simulation events into jokes: what DEB the HR chatbot says, which customer
// reviews pop up, and the end-of-wave performance review. It runs on the host only, and its
// output is sent to every player, so everyone sees the same insult at the same time, with the
// same name in it.
//
// How DEB decides whether to speak (all the numbers are in TALK and TOPICS below):
// - Every kind of remark is a "topic". "Must" topics are always said: the first appearance of a
//   kind of shopper, the refund limit getting close, a player arriving or leaving, Head Office
//   taking or leaving his side, winning and losing, the boss walking in, storming off or getting
//   through, and a won game being carried on as an endless one.
// - "Note" topics tell the players that something is happening (a dad slipping, a building
//   smashed, the doors about to open). The first one of each topic is always said; every one said
//   makes the next one on that topic less likely (TALK.noteDecay), down to a small floor. So a
//   thing seen for the first time at event 25 is still announced, but the twentieth slip is not.
// - "Joke" topics carry no news (a remark about something a player built or sold, a go at one of
//   the friends). They thin out as before, and on top of that every joke told this game makes
//   any further joke less likely (TALK.jokeDecay), down to TALK.jokeFloor.
// - The boss is announced when he walks in (bossIn, 12 seconds after the doors open), not when the
//   doors open, with a bank for each of his titles; the first time, his trick is explained too.
// - On the Food Court map a share of the wave openings (TALK.foodShare) come from its own bank,
//   and the same on the Car Park map (TALK.carParkShare) and the designs in PLACE_BANKS.
// - Anything not "must" is optional. Each comment on a topic makes the topic's own quiet time
//   longer, and DEB keeps a gap after any optional remark, which grows over the game. So late in
//   a game she talks mainly about things that matter.
// - Within a bank, a line that has been used is much less likely to be used again (its weight is
//   divided by TALK.repeatPenalty each time), and lines carry weights so some are rare.
// - The three friends (see FRIENDS in lines.js): when a line would name one of them and he is
//   connected, a share of the time it is one of his own lines instead, and now and then DEB has a
//   go at one of them unprompted between waves.
// - Holidays (0.3): in a game with state.holiday, the boss's walk-in, storming off and getting
//   through come from that holiday's bank in HOLIDAY_LINES (always the first time each, then
//   TALK.holidayBoss of the time), and once each build pause DEB may tell a holiday joke (the
//   'holiday' topic), which fades over the game like any other joke. With no holiday, none of it.
import {
  TICK_HZ, TUNE, BUILD, SUPERS, MAP_SIZES, teamCash, officePlayer, isEndless, bossTier, bossTitle, maxIn,
} from '../sim/index.js';
import { releaseNo, releaseSize, shareCount } from '../sim/index.js';
import {
  LINES, INTRO, SUPER_INTRO, ESCAPE_REVIEWS, LEFT_REVIEWS, STAMPS, EMPLOYEES_OF_THE_WAVE, FRIENDS,
  BUILDING_NAMES, SHOPPER_NOUNS, HOLIDAY_LINES, fill, choose, textOf, friendOf,
} from './lines.js';

const DEB = 'DEB (HR)';

/**
 * Store designs (added in 0.3) whose doors opening have a bank of DEB's lines of their own, used a
 * share of the time there (TALK.placeShare): design key -> key of LINES.
 */
export const PLACE_BANKS = { corridors: 'backPassage', horseshoe: 'stripMall' };

/** How often DEB talks. Change these to make her chattier or quieter. */
export const TALK = {
  /** Each time a line is used, its weight is divided by this, for the rest of the game. */
  repeatPenalty: 8,
  /**
   * Chance of an optional comment the first time DEB comments on a topic. This and the next
   * three are for jokes and the boss's pep talk; notes have their own (noteDecay below).
   */
  first: 0.95,
  /** Each comment DEB has made on a topic multiplies the chance of the next one by this... */
  decay: 0.65,
  /** ...but never below this (times the topic's own chance)... */
  floor: 0.05,
  /** ...or this, for topics marked important. */
  floorImportant: 0.5,
  /** Each comment on a topic makes that topic's quiet time this much longer (0.6 = 60%)... */
  gapGrowth: 0.6,
  /** ...up to this many times its starting length. */
  gapMax: 6,
  /** Seconds after any remark before an optional one (topics marked loud ignore this)... */
  quiet: 6,
  /** ...plus this many seconds for every optional remark made so far in the game... */
  quietGrowth: 0.12,
  /** ...up to this many seconds. */
  quietMax: 18,
  /** When a line would name one of the three friends, the share of times it is one of his own. */
  friendShare: 1 / 3,
  /** Chance, each break between waves, that DEB has a go at one of the friends unprompted. */
  friendIdle: 0.45,
  /** Shares of the refund limit at which DEB warns that the store is about to close. */
  nearLimit: [0.75, 0.9],
  /** Fewest shoppers hit by one barcode laser shot for it to be worth a comment. */
  railHits: 5,
  /** On the Food Court map, the share of wave openings taken from its own bank. */
  foodShare: 0.35,
  /** The same on the Car Park map. */
  carParkShare: 0.35,
  /** The same on the designs added in 0.3 (the Back Passage and the Strip Mall), each from its own bank (PLACE_BANKS). */
  placeShare: 0.35,
  /** In an endless game, every this-many-th sales event from endlessFrom on gets a remark. */
  endlessEvery: 10,
  endlessFrom: 20,
  /** Least the factory must have earned while the doors were opened early to be worth a word. */
  earlyCash: 50,
  // Version 0.2.14: the owner found DEB far too chatty late in a game. Notifications start at a
  // sure thing and fade each time one is said, so by event 30 only new or important things get a
  // word; jokes fade with every joke told, to about a quarter of what she told before.
  /** A "note" topic is always said the first time; each one said multiplies the next one's chance by this... */
  noteDecay: 0.8,
  /**
   * ...and each time one is passed over, by this. Without it something that happens all game
   * keeps getting a word every minute or two: fading only when said slows down as it gets rarer.
   */
  notePassed: 0.85,
  /** ...down to this, never zero, so something rare still gets a word now and then... */
  noteFloor: 0.02,
  /** ...or this, for notes marked important (dads coming, a building destroyed, a popped Pregnant Lady). */
  noteFloorImportant: 0.25,
  /** Every joke told this game multiplies the chance of any further joke by this... */
  jokeDecay: 0.92,
  /** ...down to this share of what it would have been. */
  jokeFloor: 0.15,
  // Holidays (0.3; see HOLIDAY_LINES in lines.js).
  /**
   * In a holiday game, the share of the boss's walk-ins, exits and refunds that get a holiday line
   * instead of the usual one, after the first of each (which always does).
   */
  holidayBoss: 0.6,
  /**
   * A holiday joke in a build pause is tried once a pause, this many seconds after the pause
   * starts (so the performance review has been read)...
   */
  holidayDelay: 5,
  /** ...and not with fewer than this many seconds left (the friends' jabs and the warning come then). */
  holidayLast: 31,
};

/**
 * Per topic: `must` always said; `note` a notification, `joke` a remark with no news in it (see
 * the top of this file; a topic that is neither keeps the older rules alone); `chance` the base
 * chance of an optional comment (after the first); `gap` seconds before DEB comments on this topic
 * again (it grows; see TALK); `important` uses the higher floor and is always said the first time;
 * `loud` ignores DEB's quiet time after other remarks (for things that happen at the same moment
 * as a must, like the dad line); `steady` is never thinned out by the topic's own count; `friend`
 * which of a friend's banks can stand in for the line (see FRIENDS).
 * A topic written 'placed:belt' uses the settings of 'placed' but is counted on its own.
 */
export const TOPICS = {
  // The doors opening and the ten-second warning are news, but they come every event, so they
  // fade like any other note (the screen shows both anyway).
  waveStart: { note: true, loud: true, friend: 'any' },
  officeWave: { must: true },
  officeNoPlan: { must: true },
  superArrive: { must: true },
  dadLine: { note: true, important: true, loud: true },
  nearLimit: { must: true, friend: 'losing' },
  manyEscapes: { note: true, important: true, gap: 9, friend: 'losing' },
  buildEnding: { note: true, loud: true, friend: 'any' },
  begun: { must: true, friend: 'any' },
  side: { must: true },
  joined: { must: true, friend: 'joined' },
  quit: { must: true, friend: 'quit' },
  cramped: { must: true },
  won: { must: true, friend: 'winning' },
  lost: { must: true, friend: 'losing' },
  // Head Office and the store waiting on each other: an answer to someone pressing Ready.
  waiting: { steady: true, gap: 8 },
  idle: { joke: true, steady: true },
  sale: { joke: true, chance: 0.05, gap: 60 },
  placed: { joke: true, chance: 0.12, gap: 12, friend: 'built' },
  upgraded: { joke: true, chance: 0.2, gap: 15, friend: 'built' },
  maxed: { joke: true, important: true, gap: 10, friend: 'built' },
  removed: { joke: true, chance: 0.5, gap: 10, friend: 'sold' },
  removedOther: { note: true, gap: 8, friend: 'sold' },
  gave: { joke: true, gap: 10, friend: 'any' },
  rebuilt: { joke: true, gap: 25, friend: 'built' },
  rebuildHeld: { joke: true, gap: 60, friend: 'built' },
  crawl: { note: true, gap: 12 },
  kid: { note: true, gap: 20 },
  caught: { note: true, chance: 0.5, gap: 25 },
  smash: { note: true, gap: 10 },
  smashOther: { note: true, important: true, gap: 8, friend: 'losing' },
  dented: { note: true, chance: 0.6, gap: 12 },
  mess: { note: true, gap: 45 },
  bolt: { note: true, gap: 20 },
  grab: { note: true, gap: 14 },
  slip: { note: true, gap: 10 },
  pee: { note: true, gap: 20 },
  // A security building ran out of a supply from The Back (0.4): a moan now and then, never a
  // stream of them (a busy store runs dry somewhere every few seconds).
  stockOut: { note: true, gap: 40 },
  flash: { note: true, gap: 25 },
  fall: { note: true, gap: 20 },
  pitch: { note: true, chance: 0.04, gap: 45 },
  kidtv: { note: true, chance: 0.6, gap: 30 },
  rail: { note: true, chance: 0.5, gap: 30 },
  shield: { note: true, chance: 0.6, gap: 25 },
  bossIn: { must: true, friend: 'boss' },
  bossOut: { must: true },
  bossEscape: { must: true },
  // His pep talk comes every 7 seconds, so it is thinned hard: a handful of remarks a game. It is
  // about the boss, so the newer fading leaves it alone.
  pep: { chance: 0.1, gap: 90 },
  endless: { must: true },
  // Said at round-numbered events of an endless game, instead of the usual opening.
  endlessMark: { note: true, important: true, loud: true },
  early: { joke: true, chance: 0.5, gap: 120 },
  // A Pregnant Lady popping is the thing to learn from, so it is said more than most.
  pop: { note: true, important: true, gap: 20 },
  nopop: { note: true, gap: 25 },
  // A holiday joke in a build pause (0.3): tried once a pause, fading like any joke.
  holiday: { joke: true, chance: 0.7, gap: 90 },
  // The Midnight Release (0.3.01): announced in the build pause before one (it comes on a fixed
  // schedule, so it is news the first time and then fades like any note; the boss bar says so
  // every time), and remarked on when the mob walks in. A ripped pack is news too, but a mob rips
  // a lot of them.
  releaseNext: { note: true, important: true, loud: true },
  releaseIn: { note: true, important: true, loud: true },
  rip: { note: true, gap: 15 },
  // The cards that change how shoppers behave (0.3.01): each only happens in a game with that card,
  // and fades like any other note. A litter is the thing to learn from (the laser), so it is
  // important; a petting or a sale at a stand can happen many times a minute, so they wait longer.
  litter: { note: true, important: true, gap: 20 },
  drunk: { note: true, gap: 25 },
  bought: { note: true, gap: 30 },
  trail: { note: true, gap: 30 },
  wrongway: { note: true, gap: 25 },
  pet: { note: true, gap: 35 },
  // Somebody paused or resumed the game (0.3.02): one line each time, the first always, then fading
  // like any note. Loud, because a pause and its resume often come at the same tick of play (the
  // clock stands still while paused), and the topic's gap, counted in ticks of play, keeps a player
  // pressing P over and over from getting a line every time.
  paused: { note: true, loud: true, gap: 20 },
  resumed: { note: true, loud: true, gap: 20 },
};

/** The LINES.bossIn and LINES.bossOutBy bank for each boss tier (4 and above are all the last). */
const BOSS_BANKS = ['manager', 'director', 'vp', 'ceo'];
const bossBank = (tier) => BOSS_BANKS[Math.min(BOSS_BANKS.length, Math.max(1, tier)) - 1];

/** A boss tier from an event field: a whole number from 1, or 0 if it is not one. */
const tierOf = (v) => (Number.isFinite(v) && v >= 1 ? Math.floor(v) : 0);

/** The boss's title for {k}, without "The", so every line can say "the {k}" ("the CEO"). */
const titleOf = (tier) => String(bossTitle(tier) || '').replace(/^the\s+/i, '') || undefined;

/** obj[k], but only for the object's own keys: event fields are not trusted to be sensible. */
const own = (obj, k) => (obj && typeof k === 'string' && Object.hasOwn(obj, k) ? obj[k] : undefined);

/** The display name of a kind of building, or undefined if it is not known. */
const thing = (k) => own(BUILD, k)?.name || own(BUILDING_NAMES, k);

/**
 * @param {() => number} [random] source of randomness, replaceable in tests
 */
export function createDirector(random = Math.random) {
  const used = new Map(); // line text -> times used this game (see TALK.repeatPenalty)
  const said = new Map(); // topic -> comments made on it this game
  const topicAt = new Map(); // topic -> tick of the last comment on it
  const passed = new Map(); // note topic -> times DEB could have said it and did not
  let lastSay = -1e9; // tick of DEB's last remark
  let remarks = 0; // optional remarks made this game
  let jokes = 0; // jokes told this game (see TALK.jokeDecay)
  let lastReview = -1e9;
  let escapes = []; // ticks of recent refunds
  let warned = -1; // wave whose "ten seconds" warning has been given
  let jabbed = -1; // wave after which DEB last considered an unprompted go at a friend
  let heralded = -1; // wave after which DEB last announced a coming Midnight Release
  const nearSaid = new Set(); // shares of the refund limit already warned about
  const lastPlaced = new Map(); // "x,y,floor" -> { tick, by } (floor 0 the shop, 1 The Back)
  const met = new Set(); // kinds of shopper DEB has already introduced
  const metSuper = new Set(); // and the super versions
  let bossNow = 0; // the tier of this wave's boss, 0 if none (pep talks do not say)
  const holidayBossSaid = new Set(); // which of the boss's holiday banks DEB has used this game
  let pauseWave = -1, pauseFrom = 0; // the build pause idle() last saw start, and its tick
  let holidayTried = -1; // the build pause in which a holiday joke was last tried

  /** Picks a line from a bank and fills it in; null if no line fits the variables given. */
  function line(bank, vars) {
    const got = choose(bank, random, { used, penalty: TALK.repeatPenalty, vars });
    return got === null ? null : fill(textOf(got), vars);
  }
  function pick(bank) {
    const got = choose(bank, random, { used, penalty: TALK.repeatPenalty });
    return got === null ? '' : textOf(got);
  }

  const nameOf = (state, pid) => state.players[pid]?.name || 'Someone';
  function anyone(state) {
    const on = state.players.filter((p) => p.on);
    return on.length ? on[(random() * on.length) | 0] : null;
  }

  /** The bank of one of the friends' own lines to use instead, or null. */
  function friendBank(player, situation, leaving) {
    if (!player || !situation || !(player.on || leaving)) return null;
    return friendOf(player.name)?.[situation] || null;
  }

  /** How likely an optional comment is, after `n` comments on the same topic and `p` passed over. */
  function chanceOf(t, n, p = 0) {
    const base = t.chance ?? 1;
    // A note: certain the first time, then fading with every one said or passed over. A topic
    // with a low base chance (the salesman's pitch, several a minute) fades from that, not from 1.
    if (t.note) {
      if (n === 0) return 1;
      const floor = t.important ? TALK.noteFloorImportant : TALK.noteFloor;
      return base * Math.max(floor, TALK.noteDecay ** n * TALK.notePassed ** p);
    }
    let c;
    if (t.steady) c = base;
    else if (n === 0) c = t.important ? 1 : TALK.first;
    else c = base * Math.max(t.important ? TALK.floorImportant : TALK.floor, TALK.decay ** n);
    return t.joke ? c * Math.max(TALK.jokeFloor, TALK.jokeDecay ** jokes) : c;
  }

  /**
   * DEB speaks, if the topic's rules allow it.
   * @param {string} topic a key of TOPICS, optionally followed by ':' and a detail
   * @param {Array} bank the lines to choose from
   * @param {Object} vars placeholders other than {p}
   * @param {Object} o pid: the player the line is about (default: anyone connected);
   *   friend: overrides the topic's friend bank; leaving: he may be named although he has just gone
   * @returns {boolean} whether she said something
   */
  function say(out, state, topic, bank, vars = {}, { pid, mood = 'flat', friend, leaving = false } = {}) {
    const t = TOPICS[topic.split(':')[0]] || {};
    const n = said.get(topic) || 0;
    if (!t.must) {
      const quiet = Math.min(TALK.quietMax, TALK.quiet + TALK.quietGrowth * remarks);
      if (!t.loud && state.tick - lastSay < quiet * TICK_HZ) return false;
      const gap = (t.gap || 0) * (t.steady ? 1 : Math.min(TALK.gapMax, 1 + TALK.gapGrowth * n));
      if (state.tick - (topicAt.get(topic) ?? -1e9) < gap * TICK_HZ) return false;
      if (random() >= chanceOf(t, n, passed.get(topic) || 0)) {
        // A note passed over still waits out its topic's gap before the next try. Otherwise
        // something that happens every few seconds (a mess, a flasher) would win a small chance
        // within moments of each gap ending, and the fading would make no difference.
        if (t.note) { topicAt.set(topic, state.tick); passed.set(topic, (passed.get(topic) || 0) + 1); }
        return false;
      }
    }
    const player = pid !== undefined ? state.players[pid] : anyone(state);
    const name = player?.name || 'Someone';
    let text = null;
    const own = friendBank(player, friend ?? t.friend, leaving);
    // A friend's line gets the same values (his boss lines name the boss with {k}).
    if (own && random() < TALK.friendShare) text = line(own, { ...vars, p: name });
    if (text === null && bank) text = line(bank, { p: name, ...vars });
    if (text === null) return false;
    if (!t.must) remarks++;
    if (t.joke) jokes++;
    lastSay = state.tick;
    said.set(topic, n + 1);
    topicAt.set(topic, state.tick);
    out.push({ t: 'say', who: DEB, mood, text });
    return true;
  }

  function review(out, state, bank, kind, gap) {
    if (!bank || state.tick - lastReview < gap * TICK_HZ) return;
    const got = choose(bank, random, { used, penalty: TALK.repeatPenalty });
    if (!got) return;
    lastReview = state.tick;
    const who = anyone(state);
    out.push({ t: 'review', stars: got[0], kind, text: fill(got[1], { p: who?.name || 'Someone' }) });
  }

  /** How the store is doing, for choosing which of a friend's banks fits a wave starting. */
  function standing(state) {
    const share = state.refundLimit ? (state.refunds || 0) / state.refundLimit : 0;
    if (share >= 0.5) return 'losing';
    if (state.wave > 3 && share < 0.2) return 'winning';
    return 'any';
  }

  function report(out, state, e) {
    // Head Office is not reviewed: he does not work here any more.
    const players = state.players.filter((p) => p.on && p.side !== 'office');
    // Rank by a rough contribution score so the stamps go to the right people.
    const score = (p) => (p.w?.earned || 0) + (p.w?.stopped || 0) * 12 + (p.w?.annoy || 0) * 0.2;
    const ranked = [...players].sort((a, b) => score(b) - score(a));
    const rows = players.map((p) => {
      const place = ranked.indexOf(p);
      const tier = players.length === 1 ? ['top', 'middle', 'bottom'][(random() * 3) | 0]
        : place === 0 ? 'top' : place === ranked.length - 1 ? 'bottom' : 'middle';
      return {
        pid: p.id, name: p.name, role: p.role, color: p.color,
        shipped: p.w.shipped, earned: p.w.earned, stopped: p.w.stopped, spent: p.w.spent,
        stamp: pick(STAMPS[tier]),
      };
    });
    const worst = ranked[ranked.length - 1];
    let bank = LINES.report, who = anyone(state);
    const ws = state.ws || {};
    if (ws.escaped === 0 && ws.stopped > 0) bank = LINES.reportPerfect;
    else if (worst && random() < 0.5) {
      if (worst.w.stopped === 0 && worst.w.shipped > 0) { bank = LINES.reportNoStops; who = worst; }
      else if (worst.w.shipped === 0 && worst.w.stopped > 0) { bank = LINES.reportNoShips; who = worst; }
    }
    const name = who?.name || 'Someone';
    let deb = null;
    const own = friendBank(who, 'report');
    if (own && random() < TALK.friendShare) deb = line(own, { p: name });
    if (deb === null) deb = line(bank, { p: name }) || '';
    out.push({
      t: 'report', wave: e.wave, bonus: e.bonus, rows,
      employee: pick(EMPLOYEES_OF_THE_WAVE),
      deb,
      totals: { ...ws, cash: teamCash(state), refunds: state.refunds, refundLimit: state.refundLimit },
    });
  }

  /** A first-appearance line: a string, or a list to choose from. */
  function intro(v, state) {
    if (!v) return null;
    const who = anyone(state);
    const vars = { p: who?.name || 'Someone' };
    return typeof v === 'string' ? fill(v, vars) : line(v, vars);
  }

  /** The first time each kind of shopper (and each super) turns up, DEB explains its trick. */
  function introduce(out, state, e) {
    let introduced = false;
    for (const k of Array.isArray(e.kinds) ? e.kinds : []) {
      // The boss is explained when he walks in (see bossIn), not when the doors open.
      if (k === 'boss' || met.has(k)) continue;
      met.add(k);
      const text = intro(own(INTRO, k), state);
      if (text) { out.push({ t: 'say', who: DEB, mood: 'flat', text }); lastSay = state.tick; introduced = true; }
    }
    for (const k of Array.isArray(e.supers) ? e.supers : []) {
      if (metSuper.has(k)) continue;
      metSuper.add(k);
      // A super with no introduction of its own gets a general one.
      const text = own(SUPER_INTRO, k) ? intro(SUPER_INTRO[k], state)
        : line(LINES.superArrive, { p: anyone(state)?.name || 'Someone', k: own(SUPERS, k)?.name });
      if (text) { out.push({ t: 'say', who: DEB, mood: 'angry', text }); lastSay = state.tick; introduced = true; }
    }
    return introduced;
  }

  /**
   * The doors opening: a remark at round-numbered events of an endless game (when DEB feels like
   * it), else the usual opening, from the Food Court's or the Car Park's own bank a share of the
   * time on those maps.
   */
  function opening(out, state, w) {
    const mark = isEndless(state) && Number.isInteger(w) && w >= TALK.endlessFrom && w % TALK.endlessEvery === 0;
    if (mark && say(out, state, 'endlessMark', LINES.endlessMark, { w }, { mood: 'smug' })) return;
    const food = state.map?.design === 'food' && random() < TALK.foodShare;
    // (The two smallest food courts have no fountain, so there the fountain jokes are left out.)
    const foodBank = () => (String(state.decor || '').includes('f') ? LINES.foodCourt : LINES.foodCourt.filter((l) => !/fountain/i.test(textOf(l))));
    // The Car Park has a bank of its own as well. (Its two smallest sizes have no burger van.)
    const lot = !food && state.map?.design === 'carpark' && random() < TALK.carParkShare;
    const lotBank = () => (String(state.decor || '').includes('v') ? LINES.carPark : LINES.carPark.filter((l) => !/burger van/i.test(textOf(l))));
    // So do the designs added in 0.3. (No dice are thrown on the other designs, so their openings
    // come out as they always have.)
    const place = !food && !lot && PLACE_BANKS[state.map?.design] && random() < TALK.placeShare ? LINES[PLACE_BANKS[state.map.design]] : null;
    say(out, state, 'waveStart', food ? foodBank() : lot ? lotBank() : place || LINES.waveStart, { w }, { friend: standing(state) });
  }

  /** This game's holiday lines (see HOLIDAY_LINES), or null when it has no holiday. */
  const holidayOf = (state) => own(HOLIDAY_LINES, state.holiday) || null;

  /**
   * One of the boss's events in a holiday game: says a line from the holiday's bank `part` (in,
   * out or through) the first time, and TALK.holidayBoss of the time after that.
   * @returns {boolean} whether it did; if not, the usual line is said instead
   */
  function holidayBoss(out, state, topic, part, vars, mood) {
    const bank = own(holidayOf(state), part);
    if (!bank) return false;
    if (holidayBossSaid.has(part) && random() >= TALK.holidayBoss) return false;
    if (!say(out, state, topic, bank, vars, { mood })) return false;
    holidayBossSaid.add(part);
    return true;
  }

  /**
   * Once each build pause of a holiday game, a while after it starts and well before it ends, DEB
   * may tell a holiday joke. It is a joke topic, so it fades over the game.
   */
  function holidayPause(out, state) {
    const bank = holidayOf(state)?.pause;
    if (!bank || state.training || holidayTried === state.wave) return;
    if (pauseWave !== state.wave) { pauseWave = state.wave; pauseFrom = state.tick; }
    if (state.tick - pauseFrom < TALK.holidayDelay * TICK_HZ || state.phaseT <= TALK.holidayLast * TICK_HZ) return;
    holidayTried = state.wave;
    say(out, state, 'holiday', bank, {}, { mood: 'smug' });
  }

  /** Warns once as refunds pass each share of the limit in TALK.nearLimit. */
  function nearLimit(out, state) {
    const limit = state.refundLimit, got = state.refunds || 0;
    if (!limit || got >= limit) return;
    for (const share of TALK.nearLimit) {
      if (got < limit * share || nearSaid.has(share)) continue;
      // Passing several marks at once (a player left, say) gets one warning.
      for (const s of TALK.nearLimit) if (s <= share) nearSaid.add(s);
      say(out, state, 'nearLimit', LINES.nearLimit, { n: limit - got }, { mood: 'angry' });
    }
  }

  function handleOne(out, state, e) {
    switch (e.e) {
      case 'waveStart': {
        escapes = [];
        if (state.training) break; // the tutorial does its own talking
        bossNow = tierOf(e.boss);
        const introduced = introduce(out, state, e);
        const boss = officePlayer(state);
        if (boss && e.office) say(out, state, 'officeWave', LINES.officeWave, { n: e.total }, { pid: boss.id, mood: 'smug' });
        else if (boss) say(out, state, 'officeNoPlan', LINES.officeNoPlan, {}, { pid: boss.id });
        else if (!introduced) opening(out, state, e.wave ?? state.wave);
        if (e.dads > 0) say(out, state, 'dadLine', LINES.dadLine, { n: e.dads }, { mood: 'smug' });
        break;
      }
      case 'bossIn': {
        const tier = tierOf(e.tier) || bossNow || bossTier(state.wave | 0) || 1;
        bossNow = tier;
        // In a holiday game, his outfit is announced instead (those lines name him too).
        if (!holidayBoss(out, state, 'bossIn', 'in', { k: titleOf(tier) }, 'angry')) {
          say(out, state, 'bossIn', own(LINES.bossIn, bossBank(tier)), { k: titleOf(tier) }, { mood: 'angry' });
        }
        // The first boss of the game: what he does, after who he is.
        if (!met.has('boss')) {
          met.add('boss');
          const text = intro(INTRO.boss, state);
          if (text) { out.push({ t: 'say', who: DEB, mood: 'flat', text }); lastSay = state.tick; }
        }
        break;
      }
      case 'bossOut': {
        const tier = tierOf(e.tier) || bossNow || 1;
        const bank = [...LINES.bossOut, ...(own(LINES.bossOutBy, bossBank(tier)) || [])];
        const vars = { k: titleOf(tier), n: e.bounty > 0 ? Math.round(e.bounty) : undefined };
        if (!holidayBoss(out, state, 'bossOut', 'out', vars, 'smug')) say(out, state, 'bossOut', bank, vars, { mood: 'smug' });
        break;
      }
      case 'pep': {
        const tier = bossNow || bossTier(state.wave | 0);
        say(out, state, 'pep', LINES.pep, { k: tier ? titleOf(tier) : undefined, n: e.n >= 2 ? e.n : undefined }, { mood: 'angry' });
        break;
      }
      case 'endless':
        say(out, state, 'endless', LINES.endless, {}, { pid: state.players[e.by] ? e.by : undefined, mood: 'smug' });
        break;
      case 'early':
        if (e.cash >= TALK.earlyCash) {
          say(out, state, 'early', LINES.early, { n: Math.round(e.cash), m: e.secs > 0 ? Math.round(e.secs) : undefined }, { mood: 'smug' });
        }
        break;
      case 'crawl':
        say(out, state, 'crawl', LINES.crawl, {}, { mood: 'angry' });
        break;
      // (A child running back toward the entrance, the wrongway card, has his own lines.)
      case 'kid':
        if (e.back) say(out, state, 'wrongway', LINES.wrongway, {}, { mood: 'smug' });
        else say(out, state, 'kid', LINES.kid);
        break;
      case 'caught':
        say(out, state, 'caught', e.carry ? LINES.caughtCarry : LINES.caught);
        break;
      case 'smash': {
        // Whoever owned it hears about it by name. Destroyed and merely dented get different lines.
        const destroyed = e.left !== undefined ? !(e.left > 0) : !e.down;
        const pid = state.players[e.owner] ? e.owner : undefined;
        if (e.k === 'crate' && destroyed) say(out, state, 'smash', LINES.smash, {}, { mood: 'angry' });
        else if (destroyed) say(out, state, 'smashOther', LINES.smashOther, { k: thing(e.k) }, { pid, mood: 'angry' });
        else say(out, state, 'dented', LINES.dented, { k: thing(e.k), n: e.left > 0 ? e.left : undefined }, { pid, mood: 'angry' });
        break;
      }
      case 'upgraded': {
        const vars = { k: thing(e.k), n: e.lv };
        const pid = state.players[e.by] ? e.by : undefined;
        // Each track has its own top (a factory machine's speed goes to 10, most others to 8).
        if (e.lv >= (e.t ? maxIn(e.k, e.t) : TUNE.maxLevel)) say(out, state, 'maxed', LINES.maxed, vars, { pid, mood: 'smug' });
        else {
          // Lines about the kind of upgrade join the general ones. Factory machines only get faster.
          const group = own(BUILD, e.k)?.group === 'factory' ? 'factory' : e.t;
          const extra = own(LINES.upgradedBy, group);
          const bank = extra ? [...LINES.upgraded, ...extra] : LINES.upgraded;
          say(out, state, 'upgraded', bank, vars, { pid, mood: 'smug' });
        }
        break;
      }
      case 'rebuilt': {
        const pid = state.players[e.by] ? e.by : undefined;
        if (e.short > 0) say(out, state, 'rebuilt', LINES.rebuiltShort, { n: e.n, m: e.short }, { pid, mood: 'smug' });
        else if (e.n >= 3) say(out, state, 'rebuilt', LINES.rebuilt, { n: e.n }, { pid, mood: 'smug' });
        break;
      }
      // A Rebuild press that paid for wrecks that must wait (0.3.04).
      case 'rebuildHeld':
        if (state.players[e.by]) say(out, state, 'rebuildHeld', LINES.rebuildHeld, { n: e.n }, { pid: e.by, mood: 'smug' });
        break;
      case 'begun':
        say(out, state, 'begun', LINES.begun);
        break;
      case 'pause':
        // Named: the one who paused (or resumed) gets the blame.
        if (e.on) say(out, state, 'paused', LINES.paused, {}, { pid: state.players[e.by] ? e.by : undefined, mood: 'angry' });
        else say(out, state, 'resumed', LINES.resumed, {}, { pid: state.players[e.by] ? e.by : undefined, mood: 'smug' });
        break;
      case 'side':
        say(out, state, 'side', e.side === 'office' ? LINES.officeTaken : LINES.officeLeft, {}, { pid: e.by, mood: 'smug' });
        break;
      case 'ready': {
        // One side is waiting for the other: name the one holding things up.
        const boss = officePlayer(state);
        if (!boss) break;
        say(out, state, 'waiting', e.side === 'store' ? LINES.officeWaiting : LINES.storeWaiting, {}, { pid: boss.id });
        break;
      }
      case 'gave':
        say(out, state, 'gave', LINES.gave, { q: nameOf(state, e.to), n: e.n }, { pid: e.by, mood: 'smug' });
        break;
      case 'mess':
        say(out, state, 'mess', LINES.mess);
        break;
      case 'bolt':
        say(out, state, 'bolt', LINES.bolt, {}, { mood: 'angry' });
        break;
      case 'pop':
        // (A pregnant Stray Dog's litter, the spayed card, has its own lines.)
        if (e.pup) say(out, state, 'litter', LINES.litter, { n: e.n > 0 ? Math.round(e.n) : undefined }, { mood: 'angry' });
        else say(out, state, 'pop', LINES.pop, { n: e.n > 0 ? Math.round(e.n) : undefined }, { mood: 'angry' });
        break;
      case 'nopop':
        // (The nopop lines are about the Pregnant Lady; a dog stopped by the laser goes unremarked.)
        if (!e.pup) say(out, state, 'nopop', LINES.nopop, {}, { mood: 'smug' });
        break;
      case 'drunk':
        say(out, state, 'drunk', LINES.drunk, {}, { mood: 'smug' });
        break;
      case 'bought':
        // The stand by name; a Free Sample table reads better as a table.
        say(out, state, 'bought', LINES.bought, { n: e.v > 0 ? Math.round(e.v) : undefined, k: e.k === 'samples' ? 'sample table' : thing(e.k) }, { mood: 'smug' });
        break;
      case 'trail':
        say(out, state, 'trail', LINES.trail, {}, { mood: 'smug' });
        break;
      case 'pet':
        say(out, state, 'pet', LINES.pet, { n: e.n >= 2 ? e.n : undefined }, { mood: 'flat' });
        break;
      case 'escape':
        // A Pregnant Lady's baby at a till takes cash but is no refund (its n is 0): it does not
        // count toward a run of refunds, and babies do not write reviews.
        // (Nor do a pregnant dog's puppies, the spayed card.)
        if (e.k === 'baby' || e.k === 'pup') break;
        escapes.push(state.tick);
        escapes = escapes.filter((t) => state.tick - t < 6 * TICK_HZ);
        if (e.k === 'boss') {
          const tier = tierOf(e.tier) || bossNow || 1;
          const vars = { k: titleOf(tier), n: e.n > 0 ? e.n : undefined, m: e.refund > 0 ? Math.round(e.refund) : undefined };
          if (!holidayBoss(out, state, 'bossEscape', 'through', vars, 'angry')) say(out, state, 'bossEscape', LINES.bossEscape, vars, { mood: 'angry' });
        }
        nearLimit(out, state);
        if (escapes.length >= 5 && say(out, state, 'manyEscapes', LINES.manyEscapes, { n: escapes.length }, { mood: 'angry' })) escapes = [];
        // Dads get their smug five-star review in more often than anyone else; the boss always.
        review(out, state, own(ESCAPE_REVIEWS, e.k), e.k, e.k === 'dad' ? 1 : e.k === 'boss' ? 0 : 4);
        break;
      case 'left':
        // Babies write no reviews, and a Pregnant Lady who popped has DEB's pop line instead.
        if (e.k === 'baby' || e.k === 'pup' || e.why === 'pop') break;
        // The boss storming off always gets his review; anyone else only now and then.
        if (e.k === 'boss') review(out, state, LEFT_REVIEWS.boss, e.k, 0);
        else if (random() < 0.35) review(out, state, own(LEFT_REVIEWS, e.k), e.k, 6);
        break;
      case 'grab':
        say(out, state, 'grab', LINES.grab);
        break;
      case 'slip':
        say(out, state, 'slip', LINES.slip, {}, { mood: 'smug' });
        break;
      case 'sale':
        // The first sale of the game is always remarked on; after that, only now and then.
        if (!said.get('sale')) {
          said.set('sale', 1);
          topicAt.set('sale', state.tick);
          jokes++;
          out.push({ t: 'say', who: DEB, mood: 'flat', text: line(LINES.firstSale, { p: anyone(state)?.name || 'Someone' }) });
          lastSay = state.tick;
        } else say(out, state, 'sale', LINES.sale);
        break;
      case 'placed': {
        // Keyed by floor too (0.4): a part laid in The Back and a shop building removed from the
        // tile above it are different things, and that is no "changed his mind" joke.
        lastPlaced.set(`${e.x},${e.y},${e.f | 0}`, { tick: state.tick, by: e.by });
        const bank = own(LINES.placed, e.k);
        if (bank) say(out, state, `placed:${e.k}`, bank, {}, { pid: state.players[e.by] ? e.by : undefined });
        break;
      }
      case 'removed': {
        const was = lastPlaced.get(`${e.x},${e.y},${e.f | 0}`);
        const pid = state.players[e.by] ? e.by : undefined;
        if (e.owner !== e.by && state.players[e.owner]?.on) {
          say(out, state, 'removedOther', LINES.removedOther, {}, { pid, mood: 'angry' });
        } else if (was && state.tick - was.tick < 8 * TICK_HZ) {
          say(out, state, 'removed', LINES.removed, {}, { pid });
        }
        break;
      }
      case 'stockOut': {
        const b = Number.isInteger(e.i) ? state.grid[e.i] : null;
        const bank = own(LINES.stockOut, e.t);
        if (!bank || !b || !thing(b.k)) break;
        say(out, state, 'stockOut', bank, { k: thing(b.k) }, { pid: state.players[b.o] ? b.o : undefined, mood: 'angry' });
        break;
      }
      case 'pee':
        say(out, state, 'pee', LINES.pee, { k: thing(e.k) }, { mood: 'angry' });
        break;
      case 'flash':
        // A head count reads badly for one person, so it is only given for two or more.
        say(out, state, 'flash', LINES.flash, { n: e.n >= 2 ? e.n : undefined }, { mood: 'smug' });
        break;
      case 'fall':
        say(out, state, 'fall', LINES.fall, {}, { mood: 'smug' });
        break;
      case 'pitch':
        say(out, state, 'pitch', e.r === 'rush' ? LINES.pitchRush : LINES.pitchStop, { k: own(SHOPPER_NOUNS, e.k) });
        break;
      case 'kidtv':
        say(out, state, 'kidtv', LINES.kidtv);
        break;
      case 'rail':
        if (e.n >= TALK.railHits) say(out, state, 'rail', LINES.rail, { n: e.n }, { mood: 'smug' });
        break;
      case 'shield':
        say(out, state, 'shield', LINES.shield, {}, { mood: 'angry' });
        break;
      case 'waveEnd':
        if (!e.training) report(out, state, e);
        break;
      case 'won':
        say(out, state, 'won', LINES.won, {}, { mood: 'smug' });
        break;
      case 'lost':
        say(out, state, 'lost', LINES.lost, {}, { mood: 'angry' });
        break;
      case 'release':
        // A Midnight Release's mob has walked in.
        say(out, state, 'releaseIn', LINES.releaseIn, { n: e.n > 0 ? Math.round(e.n) : undefined }, { mood: 'angry' });
        break;
      case 'rip':
        // A head count reads badly for one, so it is only given for two or more.
        say(out, state, 'rip', LINES.rip, { n: e.n >= 2 ? e.n : undefined }, { mood: 'smug' });
        break;
      case 'joined': {
        say(out, state, 'joined', LINES.joined, {}, { pid: e.by });
        // More players than the map was sized for: say so once per arrival.
        const fits = MAP_SIZES[state.map?.size]?.players || 1;
        const here = state.players.filter((p) => p.on).length;
        if (here > fits && here > 1 && !state.training) say(out, state, 'cramped', LINES.cramped, { n: fits, m: here });
        break;
      }
      case 'quit':
        // He has just gone, but this one line is still about him: everyone left gets to hear it.
        say(out, state, 'quit', LINES.quit, {}, { pid: e.by, leaving: true });
        break;
      default:
    }
  }

  return {
    /**
     * @param {Array<Object>} events simulation events from step() or applyCommand(), plus
     *   'joined' and 'quit' from the session. Unknown events are ignored.
     * @param {Object} state the game state after those events
     * @returns {Array<Object>} messages to announce: 'say', 'review' and 'report'
     */
    handle(events, state) {
      const out = [];
      for (const e of events || []) if (e && typeof e === 'object') handleOne(out, state, e);
      return out;
    },

    /**
     * Call about once a second. Gives the "ten seconds" warning before the doors open, now and
     * then has a go at one of the friends between waves, and in a holiday game now and then tells
     * a holiday joke early in the pause.
     * @returns {Array<Object>} messages to announce
     */
    idle(state) {
      const out = [];
      if (state.phase !== 'build' || !(state.phaseT > 0)) return out;
      // A holiday joke, at most once a pause. It comes first so that it notes when the pause
      // started; it never speaks in the pause's first seconds (TALK.holidayDelay), which is when
      // a coming Midnight Release is announced, so the two do not get in each other's way.
      holidayPause(out, state);
      // The next sales event is a Midnight Release: said once, early in the build pause.
      if (!state.training && heralded !== state.wave && releaseNo(state.wave + 1)) {
        heralded = state.wave;
        const n = releaseSize(state.wave + 1, shareCount(state));
        if (say(out, state, 'releaseNext', LINES.releaseNext, { n, w: state.wave + 1 }, { mood: 'angry' })) return out;
      }
      if (state.phaseT <= 10 * TICK_HZ && warned !== state.wave) {
        warned = state.wave;
        say(out, state, 'buildEnding', LINES.buildEnding);
      } else if (!state.training && state.wave >= 1 && jabbed !== state.wave
        && state.phaseT <= 30 * TICK_HZ && state.phaseT > 12 * TICK_HZ) {
        jabbed = state.wave;
        const friends = state.players.filter((p) => p.on && friendOf(p.name));
        if (friends.length && random() < TALK.friendIdle) {
          const p = friends[(random() * friends.length) | 0];
          say(out, state, 'idle', friendOf(p.name).idle, {}, { pid: p.id });
        }
      }
      return out;
    },
  };
}
