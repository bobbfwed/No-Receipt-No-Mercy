// Crowd control for sound effects. Late waves fire dozens of the same event a second (twenty
// shoppers giving up at once, a line of sales, every sprinkler spraying). Played one for one that
// is a wall of noise that gets louder and louder. The gate decides, for each request, whether it
// plays now, a few milliseconds later, or not at all, and how loud:
//
//   spread    the same sound never starts twice within its `gap`; a request that comes too soon is
//             moved a little later (by a slightly random amount, so a burst becomes a ripple), or
//             dropped if that would be more than `delay` late
//   thin      once more than `soft` of one sound were asked for in the last second, only some of
//             the rest play: about sqrt(soft x asked) a second instead of all of them. A kind
//             (`sub`, e.g. the kind of shopper) not heard for a while always gets through
//   quieter   each play's level falls with how many were asked for (about 1 / sqrt(asked)), so
//             thinned-out plays times their level stay about as loud as one or two
//   merge     past `merge.at` asked in a second, a richer "crowd" sound (a walkout, a till going
//             ka-ching) is added now and then, and the single ones duck under it
//   cap       at most MAX_VOICES effects ringing, `per` of any one sound, and an allowance of
//             NODE_RATE audio nodes a second (saved up to NODE_BURST), each sound charged what it
//             actually built, so a phone is never asked to build hundreds of nodes a second.
//             When the allowance runs short, a sound heard less lately gets the next turn, and
//             background sounds (`common`) give way to the rest.
//
// VIP requests (big moments, interface sounds, the merged crowd sounds) skip the thinning and the
// caps, but not the spreading.
// Pure: it only uses the times it is given and its own seeded random numbers, so the test page
// runs exactly the same logic offline.
import { rng } from './synth.js';

/** Requests of one sound within this many seconds count as one crowd. */
export const WINDOW = 1.0;
/** At most this many effects ringing at once (VIP sounds may exceed it). */
export const MAX_VOICES = 12;
/**
 * Audio nodes a second the effects may build on average (VIP sounds not counted), and the most
 * that can be saved up for a burst. A typical effect builds about UNIT nodes.
 */
export const NODE_RATE = 120;
export const NODE_BURST = 80;
const UNIT = 12;
/**
 * Background sounds (`common`: sales, sprays, shots...) leave this many voices, and wait for one
 * more UNIT of the allowance, so in a storm the shoppers, slips and wrecks are heard over the
 * machinery.
 */
const RESERVE = 1;
/**
 * Fair shares: a sound that had all of the plays in the last SHARE_SECS waits for SHARE_WAIT more
 * UNITs of the allowance than one that had none (only while other sounds are playing too). In a
 * simulated late-wave storm this gives every kind of event a turn instead of the first in the
 * list taking everything.
 */
const SHARE_SECS = 2;
const SHARE_WAIT = 5;
/** The quietest a crowded sound gets. */
const FLOOR = 0.26;
/** While a merged crowd sound is playing, the single ones are this much quieter. */
const UNDER_MERGE = 0.7;
/** A sub-kind not heard for this long gets through the thinning. */
const FRESH = 1.5;

const DEFAULT = { gap: 0.05, soft: 3, per: 3, delay: 0.12 };

/**
 * Per sound: gap (s between starts), soft (how many a second play at full rate), per (voices of
 * this sound at once), delay (latest it may be moved; 0 drops instead), merge, common
 * (background noise, gives way to the rest), always (skips the thinning and caps).
 */
export const RULES = {
  sale: { gap: 0.06, soft: 4, per: 4, common: true, merge: { at: 9, sound: 'kerching', every: 1.3 } },
  spray: { gap: 0.08, soft: 3, per: 3, common: true },
  shot: { gap: 0.08, soft: 3, per: 3, common: true },
  left: { gap: 0.07, soft: 3, per: 4, merge: { at: 7, sound: 'walkout', every: 1.5 } },
  escape: { gap: 0.1, soft: 3, per: 3 },
  slip: { gap: 0.15, soft: 2, per: 2 },
  grab: { gap: 0.08, soft: 3, per: 3, common: true },
  sample: { gap: 0.08, soft: 3, per: 3, common: true },
  mess: { gap: 0.07, soft: 3, per: 3, common: true },
  kid: { gap: 0.25, soft: 2, per: 2 },
  caught: { gap: 0.2, soft: 2, per: 2 },
  bolt: { gap: 0.3, soft: 2, per: 2 },
  smash: { gap: 0.12, soft: 3, per: 3 },
  crawl: { gap: 0.4, soft: 2, per: 2 },
  // The newer events. The salesman's pitches and the cosplayers' shields happen many times a
  // second in a crowd, so they are tiny, thinned hard and give way to the rest (`common`); the
  // rest are rare, but a late wave can still have several at once.
  pitch: { gap: 0.12, soft: 2, per: 2, common: true },
  shield: { gap: 0.2, soft: 2, per: 2, common: true },
  kidtv: { gap: 0.3, soft: 2, per: 2 },
  rail: { gap: 0.4, soft: 2, per: 2 },
  pee: { gap: 0.3, soft: 2, per: 2 },
  flash: { gap: 0.4, soft: 2, per: 2 },
  fall: { gap: 0.3, soft: 2, per: 2 },
  upgraded: { gap: 0.1, soft: 3, per: 3 },
  rebuilt: { gap: 0.3, soft: 2, per: 2 },
  gave: { gap: 0.2, soft: 2, per: 2 },
  // The boss. There is only ever one of him, so these are rare; they are `always` (never thinned
  // or dropped for being busy: they are what the players must hear in a storm) but still spaced.
  // The boss's pep talk comes every 7 s and his walk-out voice (`left`, k 'boss') is skipped by
  // sound.js when `bossOut` (which carries the sound) arrives in the same tick.
  bossIn: { gap: 2, delay: 0, always: true },
  pep: { gap: 1.5, delay: 0, always: true },
  bossOut: { gap: 1, delay: 0, always: true },
  bossEscape: { gap: 0.8, delay: 0, always: true },
  endless: { gap: 3, delay: 0, always: true },
  // The Pregnant Lady. A pop and the laser stopping one are `always` (never thinned or dropped for
  // being busy: they tell the players what just happened), but several ladies can go in one event,
  // so they are spaced. Her babies come in packs of 12 or 24: a baby giving up (`waah`) or taking
  // its $5 at a till (`babyTill`) is tiny, thinned hard, and past a handful a second merges into
  // `nursery`. A baby giving up is background (`common`); babies at the tills cost money, so they
  // are not, or a late-wave storm would swallow a whole pack of them without a sound.
  pop: { gap: 0.35, delay: 0.2, always: true },
  nopop: { gap: 0.3, delay: 0.15, always: true },
  waah: { gap: 0.09, soft: 2, per: 2, common: true, merge: { at: 5, sound: 'nursery', every: 1.4 } },
  babyTill: { gap: 0.08, soft: 2, per: 2, merge: { at: 5, sound: 'nursery', every: 1.4 } },
  nursery: { gap: 1.2, delay: 0, always: true },
  // The merged crowd sounds stand in for many single ones, so they skip the caps (`always`).
  kerching: { gap: 1.0, delay: 0, always: true },
  walkout: { gap: 1.2, delay: 0, always: true },
  deb: { gap: 0.15, delay: 0 }, review: { gap: 0.3, delay: 0 }, report: { gap: 0.5, delay: 0 }, players: { gap: 0.3, delay: 0 },
  begun: { gap: 1, delay: 0 }, ready: { gap: 0.4, delay: 0 }, side: { gap: 0.4, delay: 0 },
  waveStart: { gap: 1, delay: 0 }, waveEnd: { gap: 1, delay: 0 }, won: { gap: 2, delay: 0 }, lost: { gap: 2, delay: 0 },
  rotate: { gap: 0.03, delay: 0 }, click: { gap: 0.03, delay: 0 }, select: { gap: 0.04, delay: 0 }, place: { gap: 0.04, delay: 0 },
  remove: { gap: 0.04, delay: 0 }, nope: { gap: 0.15, delay: 0 }, tutorial: { gap: 0.2, delay: 0 }, chat: { gap: 0.12, delay: 0 },
  upgrade: { gap: 0.08, delay: 0 }, rebuild: { gap: 0.2, delay: 0 },
};

/** The level of one play when `n` of the same sound were asked for in the last second. */
export function crowdLevel(n) {
  return Math.max(FLOOR, Math.min(1, 1.6 / Math.sqrt(n + 1.5)));
}

/**
 * A gate. admit(name, now, { vip, sub, shapes }) returns null (do not play) or
 * { at, level, seed, merge, asked }: start at time `at` (>= now) at `level` with this `seed`;
 * if `merge` is set, also play that crowd sound. After starting a sound, call
 * started(name, endTime, nodes) so the gate can count the voices still ringing and charge the
 * audio nodes the sound built (`built.nodes` in synth.js, before and after).
 */
export function createGate(seed = 1) {
  const r = rng(seed);
  const st = {};
  const subAt = {};
  let ringing = []; // [end time, name]
  let plays = []; // [start time, name] of non-VIP plays in the last SHARE_SECS
  let tokens = NODE_BURST; // the node allowance
  let tokenAt = -1;

  function admit(name, now, o = {}) {
    const rule = RULES[name] ? { ...DEFAULT, ...RULES[name] } : DEFAULT;
    const s = (st[name] ||= { asked: [], last: -10, acc: 0, mergeAt: -10, seed: -1, cost: UNIT * 1.5, charged: 0 });
    s.charged = 0;
    const vip = !!o.vip || !!rule.always;
    const asked = s.asked;
    while (asked.length && now - asked[0] > WINDOW) asked.shift();
    asked.push(now);
    const n = asked.length;

    // Spread: never two starts of the same sound within its gap.
    let at = now;
    if (s.last + rule.gap > now) {
      if (!rule.delay) return null;
      at = Math.max(now, s.last + rule.gap * (0.7 + 0.6 * r()));
      if (at - now > rule.delay) return null;
    }
    // Thin: past `soft` a second, only some get through (a kind not heard lately always does).
    const subKey = o.sub != null ? name + '/' + o.sub : null;
    const fresh = subKey && now - (subAt[subKey] ?? -10) > FRESH;
    if (!vip && !fresh && n > rule.soft) {
      s.acc += Math.sqrt(rule.soft / n);
      if (s.acc < 1) return null;
      s.acc -= 1;
    }
    // Caps: voices ringing, voices of this sound, and audio nodes a second.
    ringing = ringing.filter(([end]) => end > now);
    if (tokenAt < 0) tokenAt = now;
    tokens = Math.min(NODE_BURST, tokens + (now - tokenAt) * NODE_RATE);
    tokenAt = now;
    if (rule.always) {
      // A merged crowd sound always plays, but it uses up the allowance the single ones share.
      tokens -= s.cost;
      s.charged = s.cost;
    } else if (!vip) {
      if (ringing.length >= MAX_VOICES - (rule.common ? RESERVE : 0)) return null;
      let mine = 0;
      for (const [, nm] of ringing) if (nm === name) mine++;
      if (mine >= rule.per) return null;
      // Fair shares: when other sounds are playing too, a sound that has had more than its share
      // lately waits for a fuller allowance, so the next turn goes to one heard less.
      plays = plays.filter(([t0]) => now - t0 < SHARE_SECS);
      let share = 0;
      for (const [, nm] of plays) if (nm === name) share++;
      const wait = share < plays.length ? UNIT * ((rule.common ? 1 : 0) + SHARE_WAIT * share / Math.max(4, plays.length)) : 0;
      if (tokens < s.cost + wait) return null;
      // Charge what it cost last time; started() corrects it to what it really built.
      tokens -= s.cost;
      s.charged = s.cost;
      plays.push([now, name]);
    }

    s.last = at;
    if (subKey) subAt[subKey] = now;
    // A new seed every time, never the same version (seed % shapes) twice running.
    let sd = Math.floor(r() * 2147483646);
    if (o.shapes > 1 && s.seed >= 0 && sd % o.shapes === s.seed % o.shapes) sd += 1;
    s.seed = sd;
    let merge = null;
    if (rule.merge && n >= rule.merge.at && now - s.mergeAt >= rule.merge.every) {
      s.mergeAt = now;
      merge = rule.merge.sound;
    }
    let level = vip ? 1 : crowdLevel(n);
    if (rule.merge && now - s.mergeAt < WINDOW) level *= UNDER_MERGE;
    return { at, level, seed: sd, merge, asked: n };
  }

  function started(name, end, nodes) {
    if (Number.isFinite(end)) ringing.push([end, name]);
    const s = st[name];
    if (s && Number.isFinite(nodes) && nodes > 0) {
      if (s.charged) tokens += s.charged - nodes;
      s.charged = 0;
      s.cost = 0.5 * s.cost + 0.5 * nodes; // sounds vary a little in size from play to play
    }
  }

  return { admit, started };
}
