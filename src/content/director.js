// The director turns simulation events into jokes: what DEB the HR chatbot says, which customer
// reviews pop up, and the end-of-wave performance review. It runs on the host only, and its
// output is sent to every player, so everyone sees the same insult at the same time, with the
// same name in it.
//
// How DEB decides whether to speak (all the numbers are in TALK and TOPICS below):
// - Every kind of remark is a "topic". "Must" topics are always said: a wave starting, the first
//   appearance of a kind of shopper, the ten-second warning, the refund limit getting close, a
//   player arriving or leaving, winning and losing.
// - Anything else is optional. The first time DEB comments on a topic she nearly always does;
//   every comment after that makes the next one on that topic less likely (down to a floor) and
//   the topic's own quiet time longer. On top of that, DEB keeps a gap after any optional remark,
//   and that gap grows over the game. So late in a game she talks mainly about things that matter.
// - Within a bank, a line that has been used is much less likely to be used again (its weight is
//   divided by TALK.repeatPenalty each time), and lines carry weights so some are rare.
// - The three friends (see FRIENDS in lines.js): when a line would name one of them and he is
//   connected, a share of the time it is one of his own lines instead, and now and then DEB has a
//   go at one of them unprompted between waves.
import { TICK_HZ, TUNE, BUILD, SUPERS, MAP_SIZES, teamCash, officePlayer } from '../sim/index.js';
import {
  LINES, INTRO, SUPER_INTRO, ESCAPE_REVIEWS, LEFT_REVIEWS, STAMPS, EMPLOYEES_OF_THE_WAVE, FRIENDS,
  BUILDING_NAMES, SHOPPER_NOUNS, fill, choose, textOf, friendOf,
} from './lines.js';

const DEB = 'DEB (HR)';

/** How often DEB talks. Change these to make her chattier or quieter. */
export const TALK = {
  /** Each time a line is used, its weight is divided by this, for the rest of the game. */
  repeatPenalty: 8,
  /** Chance of an optional comment the first time DEB comments on a topic. */
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
  /** Fewest shoppers hit by one rail gun shot for it to be worth a comment. */
  railHits: 5,
};

/**
 * Per topic: `must` always said; `chance` the base chance of an optional comment (after the first);
 * `gap` seconds before DEB comments on this topic again (it grows; see TALK); `important` uses
 * the higher floor and is always said the first time; `loud` ignores DEB's quiet time after other
 * remarks (for things that happen at the same moment as a must, like the dad line); `steady` is
 * never thinned out; `friend` which of a friend's banks can stand in for the line (see FRIENDS).
 * A topic written 'placed:belt' uses the settings of 'placed' but is counted on its own.
 */
export const TOPICS = {
  waveStart: { must: true, friend: 'any' },
  officeWave: { must: true },
  officeNoPlan: { must: true },
  superArrive: { must: true },
  dadLine: { important: true, loud: true },
  nearLimit: { must: true, friend: 'losing' },
  manyEscapes: { important: true, gap: 9, friend: 'losing' },
  buildEnding: { must: true, friend: 'any' },
  begun: { must: true, friend: 'any' },
  side: { must: true },
  joined: { must: true, friend: 'joined' },
  quit: { must: true, friend: 'quit' },
  cramped: { must: true },
  won: { must: true, friend: 'winning' },
  lost: { must: true, friend: 'losing' },
  waiting: { steady: true, gap: 8 },
  idle: { steady: true },
  sale: { chance: 0.05, gap: 60 },
  placed: { chance: 0.12, gap: 12, friend: 'built' },
  upgraded: { chance: 0.2, gap: 15, friend: 'built' },
  maxed: { important: true, gap: 10, friend: 'built' },
  removed: { chance: 0.5, gap: 10, friend: 'sold' },
  removedOther: { gap: 8, friend: 'sold' },
  gave: { gap: 10, friend: 'any' },
  rebuilt: { gap: 25, friend: 'built' },
  crawl: { gap: 12 },
  kid: { gap: 20 },
  caught: { chance: 0.5, gap: 25 },
  smash: { gap: 10 },
  smashOther: { important: true, gap: 8, friend: 'losing' },
  dented: { chance: 0.6, gap: 12 },
  mess: { gap: 45 },
  bolt: { gap: 20 },
  grab: { gap: 14 },
  slip: { gap: 10 },
  pee: { gap: 20 },
  flash: { gap: 25 },
  fall: { gap: 20 },
  pitch: { chance: 0.04, gap: 45 },
  kidtv: { chance: 0.6, gap: 30 },
  rail: { chance: 0.5, gap: 30 },
  shield: { chance: 0.6, gap: 25 },
};

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
  let lastSay = -1e9; // tick of DEB's last remark
  let remarks = 0; // optional remarks made this game
  let lastReview = -1e9;
  let escapes = []; // ticks of recent refunds
  let warned = -1; // wave whose "ten seconds" warning has been given
  let jabbed = -1; // wave after which DEB last considered an unprompted go at a friend
  const nearSaid = new Set(); // shares of the refund limit already warned about
  const lastPlaced = new Map(); // "x,y" -> { tick, by }
  const met = new Set(); // kinds of shopper DEB has already introduced
  const metSuper = new Set(); // and the super versions

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

  /** How likely an optional comment is, after `n` comments on the same topic. */
  function chanceOf(t, n) {
    const base = t.chance ?? 1;
    if (t.steady) return base;
    if (n === 0) return t.important ? 1 : TALK.first;
    return base * Math.max(t.important ? TALK.floorImportant : TALK.floor, TALK.decay ** n);
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
      if (random() >= chanceOf(t, n)) return false;
    }
    const player = pid !== undefined ? state.players[pid] : anyone(state);
    const name = player?.name || 'Someone';
    let text = null;
    const own = friendBank(player, friend ?? t.friend, leaving);
    if (own && random() < TALK.friendShare) text = line(own, { p: name });
    if (text === null && bank) text = line(bank, { p: name, ...vars });
    if (text === null) return false;
    if (!t.must) remarks++;
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
      if (met.has(k)) continue;
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
        const introduced = introduce(out, state, e);
        const boss = officePlayer(state);
        if (boss && e.office) say(out, state, 'officeWave', LINES.officeWave, { n: e.total }, { pid: boss.id, mood: 'smug' });
        else if (boss) say(out, state, 'officeNoPlan', LINES.officeNoPlan, {}, { pid: boss.id });
        else if (!introduced) say(out, state, 'waveStart', LINES.waveStart, { w: e.wave ?? state.wave }, { friend: standing(state) });
        if (e.dads > 0) say(out, state, 'dadLine', LINES.dadLine, { n: e.dads }, { mood: 'smug' });
        break;
      }
      case 'crawl':
        say(out, state, 'crawl', LINES.crawl, {}, { mood: 'angry' });
        break;
      case 'kid':
        say(out, state, 'kid', LINES.kid);
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
        if (e.lv >= TUNE.maxLevel) say(out, state, 'maxed', LINES.maxed, vars, { pid, mood: 'smug' });
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
      case 'begun':
        say(out, state, 'begun', LINES.begun);
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
      case 'escape':
        escapes.push(state.tick);
        escapes = escapes.filter((t) => state.tick - t < 6 * TICK_HZ);
        nearLimit(out, state);
        if (escapes.length >= 5 && say(out, state, 'manyEscapes', LINES.manyEscapes, { n: escapes.length }, { mood: 'angry' })) escapes = [];
        // Dads get their smug five-star review in more often than anyone else.
        review(out, state, own(ESCAPE_REVIEWS, e.k), e.k, e.k === 'dad' ? 1 : 4);
        break;
      case 'left':
        if (random() < 0.35) review(out, state, own(LEFT_REVIEWS, e.k), e.k, 6);
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
          out.push({ t: 'say', who: DEB, mood: 'flat', text: line(LINES.firstSale, { p: anyone(state)?.name || 'Someone' }) });
          lastSay = state.tick;
        } else say(out, state, 'sale', LINES.sale);
        break;
      case 'placed': {
        lastPlaced.set(`${e.x},${e.y}`, { tick: state.tick, by: e.by });
        const bank = own(LINES.placed, e.k);
        if (bank) say(out, state, `placed:${e.k}`, bank, {}, { pid: state.players[e.by] ? e.by : undefined });
        break;
      }
      case 'removed': {
        const was = lastPlaced.get(`${e.x},${e.y}`);
        const pid = state.players[e.by] ? e.by : undefined;
        if (e.owner !== e.by && state.players[e.owner]?.on) {
          say(out, state, 'removedOther', LINES.removedOther, {}, { pid, mood: 'angry' });
        } else if (was && state.tick - was.tick < 8 * TICK_HZ) {
          say(out, state, 'removed', LINES.removed, {}, { pid });
        }
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
     * Call about once a second. Gives the "ten seconds" warning before the doors open, and now
     * and then has a go at one of the friends between waves.
     * @returns {Array<Object>} messages to announce
     */
    idle(state) {
      const out = [];
      if (state.phase !== 'build' || !(state.phaseT > 0)) return out;
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
