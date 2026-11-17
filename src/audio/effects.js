// Every sound effect in the game, in one table.
//
// Each entry has:
//   about     what it is meant to sound like, in plain words
//   max       the longest it may ring, in seconds (tools/sound-test.html fails it if longer)
//   variants  optional: named option sets the test page renders as separate rows
//   shapes    optional: the sound is different on every play. opts.seed (a whole number, chosen
//             by sound.js for each play) picks one of `shapes` versions (seed % shapes) and
//             jitters pitch, length and timbre a little, so fifty in a row are a texture, not a
//             loop. The test page renders several seeds of every such sound.
//   play(ctx, dest, t, opts)  schedules the sound into `dest` starting at time `t` and returns the
//             time it ends. A pure function of a BaseAudioContext, so it runs the same live and in
//             an OfflineAudioContext. opts.level (default 1) scales the whole sound.
//
// Loudness plan (peak at level 1, measured by the test page): frequent sounds (sale, spray, shot,
// UI ticks) stay small and short; rare moments (waveStart, won, lost) are the loudest and longest.
// The shoppers' own voices are in shoppers.js.
import { voice, tone, noise, bell, brass, formant, gain, mtof, rng, vary, say, babble } from './synth.js';
import { SHAPES, LEFT_ABOUT, bark, thud, knock, leftVoice, escapeVoice, walkout } from './shoppers.js';
import { barcodeLaser, scannerWreck, pee, flash, fall, pitch, kidtv, shield, tvWreck, trackIntro, deflate, carryUp } from './newfx.js';
import { bossWave, bossIn, pep, bossOut, bossEscape, endless } from './boss.js';

/**
 * The thirteen kinds of shopper (SHOPPERS in src/sim/constants.js) and the boss (BOSS, which is not
 * in SHOPPERS), for the test page's rows. Only the boss has no super version.
 */
export const KINDS = ['hunter', 'clipper', 'dad', 'karen', 'scooter', 'teen', 'mom', 'blind', 'gymbro', 'dog', 'cosplay', 'flasher', 'drinker', 'boss'];

/** What a gym bro can wreck, grouped by what it sounds like. */
const WRECK = {
  belt: 'belt', unpacker: 'machine', press: 'machine', packer: 'machine', chute: 'machine',
  crate: 'crate', sprinkler: 'sprinkler', forklift: 'forklift', wetfloor: 'wetfloor', samples: 'samples',
  railgun: 'scanner', salesman: 'tv', // (the key 'railgun' is the Barcode Laser's)
};

/** A wrench ratchet: a few quick clicks. */
function ratchet(v, t, x, n = 2) {
  for (let i = 0; i < n; i++) {
    const dt = i * 0.03 * x.j(0.15);
    noise(v, { t: t + dt, type: 'bandpass', f: 3000 - i * 250, q: 3, peak: 0.3, a: 0.002, d: 0.012 });
    tone(v, { t: t + dt, f: 1600 - i * 120, peak: 0.05, a: 0.002, d: 0.012 });
  }
}

/** A metal clang: an inharmonic struck tone. */
function clang(v, t, f, peak = 0.14, d = 0.35, index = 2.5) {
  bell(v, { t, f, ratio: 1.41, index, peak, d });
}

/** Coins handed over: one small two-tone clink. */
function clink(v, t, x, peak = 0.12) {
  const f = x.between(2800, 3600);
  tone(v, { t, f, type: 'triangle', peak, a: 0.002, d: 0.06 });
  tone(v, { t, f: f * 1.47, type: 'triangle', peak: peak * 0.5, a: 0.002, d: 0.05 });
}

const TRACKS = ['dmg', 'spd', 'rng', 'dur'];

/** The upgrade sound for a level (0: not known, a middle pitch). */
function upgradeSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  // The level sets the pitch; the version sets the instrument (or the run, at the top level). The
  // track (damage, speed, range, durability) sets the colour of the first half second.
  const x = vary(o.seed, 3);
  const lv = Math.max(0, Math.min(10, o.lv | 0));
  const base = lv ? 62 + lv * 2 : 68;
  let c0 = 0.08;
  if (TRACKS.includes(o.t)) c0 = trackIntro(v, t, x, o.t, base);
  else ratchet(v, t, x, 2 + (x.r() < 0.5 ? 1 : 0));
  if (o.top || lv >= 10) {
    // The top level: a fast arpeggio up two octaves, a brass stab and a sparkle.
    const runs = [[72, 76, 79, 84, 88, 91], [72, 79, 76, 84, 79, 88], [67, 72, 76, 79, 84, 91]];
    runs[x.shape].forEach((m, i) => {
      tone(v, { t: t + 0.06 + i * 0.045 * x.j(0.1), f: mtof(m), type: 'triangle', peak: 0.14, a: 0.003, d: 0.1 });
    });
    const s = t + 0.36;
    const chords = [[72, 76, 79, 84], [67, 72, 76, 79], [76, 79, 84, 88]];
    for (const m of chords[x.shape]) {
      brass(v, { t: s, f: mtof(m), peak: 0.09, a: 0.02, h: 0.25, d: 0.35, bright: 4 + x.shape, vib: { rate: 5.5 * x.j(0.15), depth: 15, delay: 0.15 } });
    }
    bell(v, { t: s, f: mtof([96, 91, 100][x.shape]), peak: 0.1, d: 0.9, ratio: 3.5, index: 0.8 });
    noise(v, { t: s, type: 'highpass', f: 7000, peak: 0.07, a: 0.003, d: 0.6 });
    return v.end;
  }
  // One whole tone higher for every level: level 1 starts on E4, level 9 on G#5.
  [0, 4, 7].forEach((st, i) => {
    const last = i === 2;
    const at = t + c0 + i * 0.06 * x.j(0.1);
    const f = mtof(base + st);
    if (x.shape === 1) {
      bell(v, { t: at, f, peak: last ? 0.16 : 0.13, d: last ? 0.35 : 0.12, ratio: 2, index: 0.6 }); // "ding ding DING"
    } else {
      tone(v, { t: at, f, type: 'triangle', peak: 0.17, a: 0.003, h: last ? 0.06 : 0.01, d: last ? 0.28 : 0.07 });
      tone(v, { t: at, f, type: x.shape === 2 ? 'sawtooth' : 'square', lp: x.shape === 2 ? 1500 : 2500, peak: 0.035, a: 0.003, h: last ? 0.06 : 0.01, d: last ? 0.2 : 0.06 });
    }
  });
  if (x.shape === 2) tone(v, { t: t + 0.05, f: mtof(base - 5), f1: mtof(base + 12), glide: 0.2, peak: 0.06, a: 0.02, h: 0.1, d: 0.1 }); // power-up sweep
  else bell(v, { t: t + 0.2, f: mtof(base + 12), peak: 0.08, d: 0.35, ratio: 2, index: 0.5 });
  return v.end;
}

/** Wrecked buildings put back: a hammer knock for each (up to six), then "ta-DA". */
function rebuildSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed);
  const n = Math.max(1, Math.min(6, Math.round(o.n) || 3));
  let at = t;
  for (let i = 0; i < n; i++) {
    knock(v, at, x.between(450, 750), 0.2);
    tone(v, { t: at, f: 160 * x.j(0.1), peak: 0.12, a: 0.002, d: 0.05 });
    at += 0.075 * x.j(0.15);
  }
  const e = at + 0.04;
  if (o.short > 0) {
    // Some came back with fewer upgrades (no money for the rest): the "ta-DA" sags into a sad slide.
    bell(v, { t: e, f: mtof(84), peak: 0.1, d: 0.25, ratio: 2, index: 0.6 });
    deflate(v, e + 0.1, x);
    return v.end;
  }
  bell(v, { t: e, f: mtof(84), peak: 0.12, d: 0.3, ratio: 2, index: 0.6 });
  bell(v, { t: e + 0.08, f: mtof(91), peak: 0.14, d: 0.33, ratio: 2, index: 0.6 });
  return v.end;
}

export const SOUNDS = {
  // ---------------------------------------------------------------- simulation events
  sale: {
    about: 'A tiny cash-register "bli-ding" on a random note of the scale, so a line of sales plays a little tune. Box low, gadget higher, gift set highest with a sparkle.',
    max: 0.3,
    shapes: 3,
    variants: [
      { label: 'box', opts: { kind: 'box' } },
      { label: 'gadget', opts: { kind: 'gadget' } },
      { label: 'giftset', opts: { kind: 'giftset' } },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 3);
      // The version is the note, so two sales in a row are never on the same one.
      const notes = { box: [84, 86, 88], gadget: [89, 91, 93], giftset: [96, 98, 100] }[o.kind] || [84, 86, 88];
      const f = mtof(notes[x.shape]) * x.j(0.004);
      if (x.r() < 0.75) tone(v, { t, f: f * 0.75, type: 'triangle', peak: 0.1, a: 0.002, d: 0.03 }); // the "bli"
      bell(v, { t: t + 0.035 * x.j(0.2), f, peak: 0.17 * x.j(0.1), d: 0.17 * x.j(0.2), ratio: 2, index: x.between(0.4, 0.8) }); // the "ding"
      if (o.kind === 'giftset') bell(v, { t: t + 0.075, f: f * 1.5, peak: 0.07, d: 0.13, ratio: 2, index: 0.4 });
      return v.end;
    },
  },

  kerching: {
    about: 'Many sales at once (played over the single dings when they pile up): an old till going "ka-CHING", drawer flying open, coins rattling.',
    max: 0.7,
    shapes: 1,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed);
      noise(v, { t, type: 'bandpass', f: 1800, q: 2, peak: 0.2, a: 0.002, d: 0.03 }); // the key
      noise(v, { t: t + 0.05, type: 'bandpass', f: 900, f1: 400, glide: 0.1, q: 1, peak: 0.22, a: 0.003, d: 0.08 }); // the drawer
      bell(v, { t: t + 0.07, f: mtof(96) * x.j(0.004), peak: 0.16, d: 0.45, ratio: 2, index: 0.9 });
      bell(v, { t: t + 0.07, f: mtof(100) * x.j(0.004), peak: 0.1, d: 0.4, ratio: 2, index: 0.6 });
      for (let i = 0; i < 3; i++) clink(v, t + 0.14 + i * 0.05 * x.j(0.3), x, 0.07);
      return v.end;
    },
  },

  spray: {
    about: 'Pepper spray: a "pssht" that dulls as it fades. Sometimes a double "psst-psst", sometimes the victim coughs.',
    max: 0.3,
    shapes: 3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 3);
      const f = 4000 * x.j(0.2);
      const len = x.j(0.3);
      if (x.shape === 1) {
        for (const dt of [0, 0.09 * x.j(0.15)]) {
          noise(v, { t: t + dt, type: 'highpass', f, q: 0.5, peak: 0.1, a: 0.008, h: 0.015, d: 0.06 });
          noise(v, { t: t + dt, type: 'bandpass', f: 6500 * x.j(0.1), f1: 3800, q: 1.2, peak: 0.07, a: 0.008, h: 0.01, d: 0.06 });
        }
        return v.end;
      }
      noise(v, { t, type: 'highpass', f, q: 0.5, peak: 0.11, a: 0.012, h: 0.03 * len, d: 0.13 * len });
      noise(v, { t, type: 'bandpass', f: 6500 * x.j(0.15), f1: 3500 * x.j(0.15), q: 1.2, peak: 0.08, a: 0.01, h: 0.02, d: 0.14 * len });
      if (x.shape === 2) {
        noise(v, { t: t + 0.17, type: 'bandpass', f: 1100 * x.j(0.15), q: 1.4, peak: 0.12, a: 0.004, d: 0.05 });
        tone(v, { t: t + 0.17, f: 190 * x.j(0.15), f1: 140, glide: 0.05, type: 'sawtooth', lp: 900, peak: 0.06, a: 0.004, d: 0.05 });
      }
      return v.end;
    },
  },

  shot: {
    about: 'Forklift turret "thunk-whoosh": a dull knock (sometimes a metal clank), a pallet swishing through the air, sometimes landing with a clack.',
    max: 0.4,
    shapes: 3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 3);
      const p = x.j(0.15);
      tone(v, { t, f: 150 * p, f1: 55 * p, glide: 0.1, peak: 0.22, a: 0.003, d: 0.12 }); // thunk
      if (x.shape === 2) clang(v, t, 520 * x.j(0.1), 0.07, 0.12, 2);
      else noise(v, { t, type: 'lowpass', f: 900 * x.j(0.2), q: 0.7, peak: 0.18, a: 0.002, d: 0.05 }); // knock
      noise(v, { t: t + 0.04 * x.j(0.25), type: 'bandpass', f: 500 * x.j(0.2), f1: 2400 * x.j(0.2), q: 1.4, peak: 0.12, a: 0.06, d: 0.14 }); // whoosh
      if (x.shape === 1) knock(v, t + 0.2 * x.j(0.1), 700 * x.j(0.15), 0.1);
      return v.end;
    },
  },

  escape: {
    about: 'A refund paid: coins tumbling (a different run each time) and a sad "bloop" or "womp". Karen adds a satisfied "mm-HM", the guide dog barks, a dad gets a smug kazoo "da-DAAA" instead. Super shoppers: more coins and the till drawer slams.',
    max: 0.8,
    shapes: SHAPES,
    variants: [
      { label: 'hunter', opts: { k: 'hunter' }, about: 'Most shoppers: coins tumbling (a different run each time) and a sad "bloop", a double bloop or a "womp".' },
      { label: 'dad', opts: { k: 'dad' }, about: 'A dad: a smug kazoo, "da-DAAA", "da-da-DAA" or "ta-da-DAA".' },
      { label: 'karen', opts: { k: 'karen' }, about: 'Karen: coins, then a satisfied "mm-HM".' },
      { label: 'blind', opts: { k: 'blind' }, about: 'Man with guide dog: coins, then the dog barks.' },
      { label: 'hunter super', opts: { k: 'hunter', sup: 1 }, max: 1.1, about: 'A super shopper (double refund): more coins and the till drawer slams.' },
      { label: 'dad super', opts: { k: 'dad', sup: 1 }, max: 1.1, about: 'Dad on a Mission: the kazoo an octave down, then coins.' },
      { label: 'karen super', opts: { k: 'karen', sup: 1 }, max: 1.1, about: 'Karen Supreme: more coins, "mm-HM" and the drawer.' },
      { label: 'blind super', opts: { k: 'blind', sup: 1 }, max: 1.1, about: 'Two guide dogs: more coins, a bark and the drawer.' },
      { label: 'dog', opts: { k: 'dog' }, about: 'Stray Dog: coins, then a happy yelp.' },
      { label: 'cosplay', opts: { k: 'cosplay' }, about: 'Cosplayer: coins, then a muffled "yay" from inside the foam head.' },
      { label: 'flasher', opts: { k: 'flasher' }, about: 'Exhibitionist: coins, then a smug "mm-hm" and the robe flapping.' },
      { label: 'drinker', opts: { k: 'drinker' }, about: 'Day Drinker: coins, a hiccup and a bottle clink.' },
      { label: 'dog super', opts: { k: 'dog', sup: 1 }, max: 1.1, about: 'Great Dane: more coins, a deep woof and the drawer.' },
      { label: 'cosplay super', opts: { k: 'cosplay', sup: 1 }, max: 1.1, about: 'Full Mech Suit: more coins, a muffled "yay", servo whirr and the drawer.' },
      { label: 'flasher super', opts: { k: 'flasher', sup: 1 }, max: 1.1, about: 'Nudist Nan: more coins, a cackle and the drawer.' },
      { label: 'drinker super', opts: { k: 'drinker', sup: 1 }, max: 1.1, about: 'Bottomless Bruncher: more coins, a hiccup, a cork and the drawer.' },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      escapeVoice(v, t, o, vary(o.seed, SHAPES));
      return v.end;
    },
  },

  left: {
    about: 'A shopper storms out. Each kind has its own voice (three versions each); the super version is bigger. See shoppers.js.',
    max: 0.65,
    shapes: SHAPES,
    variants: KINDS.flatMap((k) => [
      { label: k, opts: { k }, about: LEFT_ABOUT[k][0] },
      ...(LEFT_ABOUT[k][1] ? [{ label: k + ' super', opts: { k, sup: 1 }, max: 0.95, about: LEFT_ABOUT[k][1] }] : []),
    ]),
    // (every kind of shopper above, normal and super; sound.js passes e.k and e.sup)
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, (o.level ?? 1) * (o.sup ? 1.15 : 1));
      leftVoice(v, t, o, vary(o.seed, SHAPES));
      return v.end;
    },
  },

  walkout: {
    about: 'Many shoppers storming out at once (played over the single ones when they pile up): three people grumbling over each other and the automatic doors.',
    max: 1.0,
    shapes: 1,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      walkout(v, t, vary(o.seed));
      return v.end;
    },
  },

  slip: {
    about: 'A dad slips: a comic slide whistle down, then a bum hitting the floor. Sometimes a cartoon "boing", sometimes an "oof".',
    max: 0.9,
    shapes: 3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 3);
      const f0 = 1800 * x.j(0.15), f1 = 330 * x.j(0.2), g = 0.42 * x.j(0.2) * (x.shape === 2 ? 0.7 : 1);
      tone(v, { t, f: f0, f1, glide: g, peak: 0.2, a: 0.02, h: g - 0.1, d: 0.08, vib: { rate: 9 * x.j(0.2), depth: 25 } });
      noise(v, { t, type: 'bandpass', f: f0, f1, glide: g, q: 4, peak: 0.04, a: 0.02, h: g - 0.1, d: 0.08 }); // breath
      const L = t + g + 0.05;
      tone(v, { t: L, f: 130 * x.j(0.1), f1: 45, glide: 0.15, peak: 0.45, a: 0.003, d: 0.2 }); // thud
      noise(v, { t: L, type: 'lowpass', f: 500, q: 0.7, peak: 0.3, a: 0.002, d: 0.07 });
      if (x.shape === 1) {
        tone(v, { t: L + 0.02, f: 160 * x.j(0.1), f1: 260, glide: 0.25, type: 'triangle', peak: 0.18, a: 0.005, h: 0.04, d: 0.17, vib: { rate: 16, depth: 250 } });
      } else if (x.shape === 2) {
        say(v, { t: L + 0.04, vowel: 'oo', f: 120 * x.j(0.1), f1: 85, peak: 0.4, a: 0.01, h: 0.04, d: 0.1 });
      }
      return v.end;
    },
  },

  grab: {
    about: 'A shopper nicks something off a belt: a quick rising "yoink", a sly swipe and pop, or a tiptoe "tip-tip-yoink".',
    max: 0.25,
    shapes: 3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 3);
      const p = x.j(0.12);
      if (x.shape === 1) {
        noise(v, { t, type: 'bandpass', f: 800 * p, f1: 4000 * p, glide: 0.08, q: 1.5, peak: 0.14, a: 0.005, d: 0.07 });
        tone(v, { t: t + 0.07, f: 600 * p, f1: 1200 * p, glide: 0.03, peak: 0.12, a: 0.003, d: 0.04 });
        return v.end;
      }
      let s = t;
      if (x.shape === 2) {
        tone(v, { t, f: 660 * p, type: 'triangle', peak: 0.08, a: 0.002, d: 0.03 });
        tone(v, { t: t + 0.06, f: 880 * p, type: 'triangle', peak: 0.08, a: 0.002, d: 0.03 });
        s = t + 0.12;
      }
      const h = x.shape === 2 ? 0.03 : 0.05;
      tone(v, { t: s, f: 280 * p, f1: 1300 * p, glide: 0.11, type: 'square', lp: 2200, peak: 0.1, a: 0.004, h, d: 0.06 });
      tone(v, { t: s, f: 140 * p, f1: 650 * p, glide: 0.11, peak: 0.1, a: 0.004, h, d: 0.06 });
      return v.end;
    },
  },

  sample: {
    about: 'A shopper takes a free sample: a satisfied "mm", a two-note "mm-MM", or a "nom" and a lip smack.',
    max: 0.3,
    shapes: 3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 3);
      const p = x.j(0.1);
      if (x.shape === 0) {
        formant(v, { t, f: 190 * p, f1: 235 * p, glide: 0.15, type: 'triangle', formants: [[280, 1.5, 1], [2200, 8, 0.15]],
          peak: 0.36, a: 0.025, h: 0.07, d: 0.1, vib: { rate: 7, depth: 20, delay: 0.04 } });
      } else if (x.shape === 1) {
        babble(v, { type: 'triangle', sylls: [
          { t, len: 0.09, f: 200 * p, vowel: 'mm', peak: 0.5 },
          { t: t + 0.12, len: 0.14, f: 240 * p, f1: 265 * p, vowel: 'mm', peak: 0.55 },
        ] });
      } else {
        babble(v, { sylls: [
          { t, len: 0.05, f: 210 * p, vowel: 'mm', peak: 0.4 },
          { t: t + 0.055, len: 0.06, f: 230 * p, vowel: 'ah', peak: 0.45 },
          { t: t + 0.12, len: 0.06, f: 200 * p, vowel: 'mm', peak: 0.4 },
        ] });
        noise(v, { t: t + 0.21, type: 'bandpass', f: 2200 * x.j(0.15), q: 2, peak: 0.14, a: 0.002, d: 0.015 }); // smack
      }
      return v.end;
    },
  },

  mess: {
    about: 'A teenager drops a slushie: a wet "splat" and a drip or two. Sometimes a slurp first.',
    max: 0.3,
    shapes: 3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 3);
      const p = x.j(0.15);
      let s = t;
      if (x.shape === 2) {
        noise(v, { t, type: 'bandpass', f: 400 * p, f1: 1500 * p, glide: 0.07, q: 4, peak: 0.14, a: 0.01, d: 0.06 }); // slurp
        s = t + 0.09;
      }
      noise(v, { t: s, type: 'bandpass', f: 1100 * p, f1: 300 * p, glide: 0.08, q: 1.2, peak: 0.35, a: 0.003, d: 0.09 }); // splat
      tone(v, { t: s, f: 320 * p, f1: 110 * p, glide: 0.06, peak: 0.1, a: 0.003, d: 0.07 }); // body
      const drips = x.shape === 1 ? [0.1, 0.17] : [0.1];
      for (const dt of drips) {
        const f = 1100 * x.j(0.2);
        tone(v, { t: s + dt * x.j(0.1), f, f1: f * 1.6, glide: 0.03, peak: 0.05, a: 0.003, d: 0.04 }); // drip
      }
      return v.end;
    },
  },

  kid: {
    about: 'A child escapes his mother: a mischievous "hee-hee-WHEEE", a "nyah-nyah nyah-nyah-nyah" taunt, or a giggle and a short "wheee".',
    max: 0.75,
    shapes: 3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 3);
      const p = x.j(0.06);
      if (x.shape === 1) {
        const tune = [[79, 0.1], [76, 0.1], [81, 0.08], [79, 0.08], [76, 0.15]];
        let s = t;
        const sylls = tune.map(([m, len]) => { const syl = { t: s, len, f: mtof(m) * p, vowel: 'ah', peak: 0.28 }; s += len + 0.02; return syl; });
        babble(v, { sylls, scale: 1.5 });
        return v.end;
      }
      const n = x.shape === 0 ? 3 : 5;
      const step = x.shape === 0 ? 0.075 : 0.045;
      for (let i = 0; i < n; i++) {
        const f = (x.shape === 0 ? 880 + i * 115 : x.between(950, 1300)) * p;
        tone(v, { t: t + i * step, f, f1: f * 0.92, type: 'triangle', peak: 0.16, a: 0.004, h: 0.02, d: 0.03, vib: { rate: 22, depth: 60 } });
      }
      const w = t + n * step + 0.005;
      const h = x.shape === 0 ? 0.13 : 0.06;
      tone(v, { t: w, f: 700 * p, f1: 1600 * p, glide: h + 0.09, type: 'triangle', peak: 0.2, a: 0.01, h, d: 0.1, vib: { rate: 14, depth: 40 } }); // wheee
      return v.end;
    },
  },

  caught: {
    about: 'Mum catches the kid: a short relieved "got-CHA", an "AH-ha!", or a grab and a "hm". Quieter than the kid.',
    max: 0.45,
    shapes: 3,
    variants: [
      { label: 'cart', opts: {} },
      { label: 'carried', opts: { carry: 1 }, max: 0.8, about: 'She has lost her cart: the catch, then "oof", a small thump and an "up you get" lift.' },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 3);
      const p = x.j(0.06);
      if (o.carry) carryUp(v, t + 0.2, x);
      if (x.shape === 0) {
        tone(v, { t, f: 660 * p, f1: 520 * p, glide: 0.08, type: 'triangle', peak: 0.13, a: 0.005, h: 0.03, d: 0.06 });
        tone(v, { t: t + 0.12, f: 560 * p, f1: 760 * p, glide: 0.06, type: 'triangle', peak: 0.13, a: 0.005, h: 0.06, d: 0.14 });
      } else if (x.shape === 1) {
        babble(v, { scale: 1.15, sylls: [
          { t, len: 0.08, f: 330 * p, vowel: 'ah', peak: 0.3 },
          { t: t + 0.12, len: 0.16, f: 420 * p, f1: 470 * p, vowel: 'ah', peak: 0.32 },
        ] });
      } else {
        tone(v, { t, f: 500 * p, f1: 900 * p, glide: 0.04, peak: 0.12, a: 0.003, d: 0.04 });
        say(v, { t: t + 0.08, vowel: 'mm', scale: 1.15, f: 290 * p, f1: 250 * p, peak: 0.3, a: 0.01, h: 0.04, d: 0.1 });
      }
      return v.end;
    },
  },

  crawl: {
    about: 'A mom runs out of patience with her kid loose and crawls after him: a long wail ("nooo..." or "oh for f-"), both knees hitting the floor, and a shuffle.',
    max: 1.2,
    shapes: 2,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 2);
      const p = x.j(0.06);
      if (x.shape === 0) {
        say(v, { t, vowel: 'oh', scale: 1.15, f: 430 * p, f1: 210 * p, glide: 0.45, peak: 0.5, a: 0.03, h: 0.3, d: 0.15, breath: 0.2,
          vib: { rate: 6, depth: 40, delay: 0.1 } });
      } else {
        babble(v, { scale: 1.15, sylls: [
          { t, len: 0.14, f: 330 * p, f1: 300 * p, vowel: 'oh', peak: 0.5 },
          { t: t + 0.17, len: 0.1, f: 360 * p, vowel: 'oh', peak: 0.45 },
        ] });
        noise(v, { t: t + 0.3, type: 'bandpass', f: 5000, q: 1, peak: 0.16, a: 0.02, h: 0.08, d: 0.02 }); // "fff-", cut off
      }
      thud(v, t + 0.5, 0.35, 120);
      thud(v, t + 0.62, 0.3, 115);
      for (let i = 0; i < 3; i++) noise(v, { t: t + 0.78 + i * 0.1 * x.j(0.15), type: 'lowpass', f: 900, q: 0.7, peak: 0.12, a: 0.02, d: 0.06 });
      return v.end;
    },
  },

  bolt: {
    about: 'A pepper-sprayed guide dog bolts: two or three barks, or a bark and a yelp.',
    max: 0.5,
    shapes: 3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 3);
      const low = x.j(0.08);
      if (x.shape === 1) {
        [0, 0.12, 0.24].forEach((dt, i) => bark(v, t + dt * x.j(0.1), 0.48 - i * 0.05, low * (1 - i * 0.03)));
      } else if (x.shape === 2) {
        bark(v, t, 0.5, low);
        bark(v, t + 0.15, 0.35, low * 1.5);
      } else {
        bark(v, t, 0.5, low);
        bark(v, t + 0.16 * x.j(0.1), 0.45, low * 0.94);
      }
      return v.end;
    },
  },

  smash: {
    about: 'A gym bro wrecks something. Crates: wood cracking and planks clattering. Belts: a rubber slap and metal rollers. Machines: a crunch, a clang, sparks and the motor dying. Sprinklers: a clank and a gush of water. Forklift: a heavy crash and its horn dying. Wet floor sign: plastic clattering flat. Samples: the table and the plates. An upgraded building only losing a level: one clang and a bolt bouncing away.',
    max: 0.9,
    shapes: 3,
    variants: [
      { label: 'crate', opts: { k: 'crate' }, about: 'Crate stack: wood cracking, a thump, planks clattering down.' },
      { label: 'belt', opts: { k: 'belt' }, about: 'Belt: a rubber slap and metal rollers rattling away.' },
      { label: 'machine', opts: { k: 'press' }, about: 'Unpacker, press, packer, chute: a crunch and a clang, then the motor dying with sparks, gears spilling with steam, or its error beep slowing down.' },
      { label: 'sprinkler', opts: { k: 'sprinkler' }, about: 'Pepper sprinkler: a clank and a gush of water (with a glug), or the pepper escaping and somebody coughing.' },
      { label: 'forklift', opts: { k: 'forklift' }, about: 'Forklift turret: a heavy crash, then its horn dying, its reversing beeper giving up, or a tyre going down.' },
      { label: 'wetfloor', opts: { k: 'wetfloor' }, about: 'Wet floor sign: plastic clattering flat.' },
      { label: 'samples', opts: { k: 'samples' }, about: 'Free samples: the table cracks and the plates smash (sometimes the cheese lands with a splat).' },
      { label: 'barcode laser', opts: { k: 'railgun' }, max: 1.2, about: 'Barcode Laser: the casing cracks, then the scanner dies like a scanner: the lens shatters and the beep fails, an error buzzer, or sad slowing beeps with steam.' },
      { label: 'salesman', opts: { k: 'salesman' }, max: 1.0, about: 'TV Salesman: the television implodes: cracking glass, a "fwump", the tube whining down, sparks or tinkling or static.' },
      { label: 'hit (hits left)', opts: { k: 'forklift', left: 2 }, about: 'A building took a hit and can take more: one clang and a bolt bouncing away.' },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 3);
      if (o.left > 0 || o.down) {
        clang(v, t, 900 * x.j(0.1), 0.16, 0.25);
        noise(v, { t, type: 'bandpass', f: 2500, q: 1, peak: 0.15, a: 0.002, d: 0.03 });
        [0.12, 0.2, 0.26, 0.3].forEach((dt, i) => {
          tone(v, { t: t + dt * x.j(0.08), f: 3200 * x.j(0.1), type: 'triangle', peak: 0.08 * (1 - i * 0.2), a: 0.002, d: 0.03 });
        });
        return v.end;
      }
      const kind = WRECK[o.k] || 'crate';
      if (kind === 'scanner') {
        scannerWreck(v, t, x);
      } else if (kind === 'tv') {
        tvWreck(v, t, x);
      } else if (kind === 'belt') {
        noise(v, { t, type: 'lowpass', f: 450, q: 0.7, peak: 0.35, a: 0.002, d: 0.07 }); // rubber slap
        tone(v, { t, f: 95 * x.j(0.1), f1: 50, glide: 0.1, peak: 0.28, a: 0.003, d: 0.12 });
        for (let i = 0; i < 4; i++) clang(v, t + 0.06 + i * x.between(0.06, 0.11), x.between(1200, 2400), 0.09 * (1 - i * 0.15), 0.09, 1.2);
      } else if (kind === 'machine') {
        noise(v, { t, type: 'bandpass', f: 900 * x.j(0.2), q: 0.7, peak: 0.5, a: 0.002, d: 0.12 }); // crunch
        tone(v, { t, f: 100 * x.j(0.15), f1: 40, glide: 0.12, peak: 0.3, a: 0.003, d: 0.14 });
        clang(v, t + 0.02, 330 * x.j(0.15), 0.14, 0.4, 3);
        if (x.shape === 0) {
          tone(v, { t: t + 0.05, f: 240 * x.j(0.1), f1: 40, glide: 0.55, type: 'sawtooth', lp: 900, peak: 0.12, a: 0.01, h: 0.1, d: 0.42 }); // motor dying
          noise(v, { t: t + 0.05, type: 'highpass', f: 6000, q: 0.7, peak: 0.08, a: 0.002, h: 0.05, d: 0.1 }); // sparks
        } else if (x.shape === 1) {
          // Gears spilling out, and a hiss of steam.
          for (let i = 0; i < 4; i++) clang(v, t + 0.1 + i * x.between(0.05, 0.09), x.between(700, 1500), 0.07, 0.1, 1.5);
          noise(v, { t: t + 0.08, type: 'highpass', f: 3500 * x.j(0.15), q: 0.7, peak: 0.1, a: 0.02, h: 0.15, d: 0.2 });
        } else {
          // The machine's error beep, slowing and dropping as it dies.
          [[880, 0.12], [740, 0.3], [560, 0.5]].forEach(([f, dt]) => {
            tone(v, { t: t + dt, f: f * x.j(0.04), type: 'square', lp: 2000, peak: 0.06, a: 0.004, h: 0.07, d: 0.04 });
          });
        }
      } else if (kind === 'sprinkler') {
        noise(v, { t, type: 'bandpass', f: 1400 * x.j(0.2), q: 0.8, peak: 0.4, a: 0.002, d: 0.08 });
        clang(v, t, 700 * x.j(0.15), 0.12, 0.3);
        if (x.shape === 2) {
          // The pepper gets out: a big hiss and somebody coughing.
          noise(v, { t: t + 0.03, type: 'highpass', f: 3000 * x.j(0.15), q: 0.5, peak: 0.13, a: 0.01, h: 0.15, d: 0.2 });
          [0.32, 0.45].forEach((dt) => noise(v, { t: t + dt, type: 'bandpass', f: 1100 * x.j(0.15), q: 1.4, peak: 0.13, a: 0.004, d: 0.06 }));
        } else {
          const len = x.shape === 1 ? 0.35 : 0.2;
          noise(v, { t: t + 0.04, type: 'bandpass', f: 1600 * x.j(0.15), f1: 900, glide: 0.4, q: 0.8, peak: 0.16, a: 0.01, h: len, d: 0.3 }); // water gush
          if (x.shape === 0) [0.15, 0.28].forEach((dt) => tone(v, { t: t + dt * x.j(0.1), f: 300 * x.j(0.1), f1: 520, glide: 0.04, peak: 0.08, a: 0.004, d: 0.04 })); // glug
        }
      } else if (kind === 'forklift') {
        noise(v, { t, type: 'lowpass', f: 1200 * x.j(0.2), q: 0.7, peak: 0.5, a: 0.002, d: 0.1 });
        noise(v, { t: t + 0.09 * x.j(0.2), type: 'lowpass', f: 900, q: 0.7, peak: 0.35, a: 0.002, d: 0.1 });
        clang(v, t, 180 * x.j(0.15), 0.16, 0.5, 4);
        if (x.shape === 0) {
          tone(v, { t: t + 0.15, f: 420 * x.j(0.05), f1: 240, glide: 0.5, type: 'square', lp: 1500, peak: 0.07, a: 0.02, h: 0.25, d: 0.2 }); // horn dying
        } else if (x.shape === 1) {
          // Its reversing beeper giving up: "beep... beep... beeeoww".
          [0.15, 0.33].forEach((dt) => tone(v, { t: t + dt, f: 1040, type: 'square', lp: 2600, peak: 0.07, a: 0.004, h: 0.07, d: 0.02 }));
          tone(v, { t: t + 0.51, f: 1040, f1: 300, glide: 0.3, type: 'square', lp: 2600, peak: 0.07, a: 0.004, h: 0.2, d: 0.1 });
        } else {
          // A tyre going down.
          noise(v, { t: t + 0.12, type: 'bandpass', f: 4000 * x.j(0.1), f1: 2000, glide: 0.5, q: 1, peak: 0.12, a: 0.01, h: 0.3, d: 0.2 });
        }
      } else if (kind === 'wetfloor') {
        [0, 0.14, 0.23, 0.29, 0.33].forEach((dt, i) => {
          const k = 1 - i * 0.16;
          const f = x.between(900, 1400);
          tone(v, { t: t + dt * x.j(0.05), f, f1: f * 0.85, glide: 0.03, type: 'triangle', peak: 0.16 * k, a: 0.002, d: 0.04 });
          noise(v, { t: t + dt * x.j(0.05), type: 'bandpass', f: 2000, q: 2, peak: 0.2 * k, a: 0.002, d: 0.025 });
        });
      } else if (kind === 'samples') {
        noise(v, { t, type: 'bandpass', f: 1600 * x.j(0.2), q: 0.8, peak: 0.45, a: 0.002, d: 0.08 }); // table cracks
        thud(v, t, 0.25, 120 * x.j(0.15));
        const plates = 2 + x.shape * 2;
        for (let i = 0; i < plates; i++) {
          noise(v, { t: t + 0.04 + i * x.between(0.03, 0.08), type: 'highpass', f: x.between(3000, 6000), q: 0.7, peak: 0.2, a: 0.002, d: 0.06 }); // plates
        }
        for (let i = 0; i < 3; i++) bell(v, { t: t + 0.06 + i * x.between(0.05, 0.1), f: x.between(3000, 5000), ratio: 3.1, index: 1, peak: 0.05, d: 0.15 });
        if (x.shape === 0) {
          // The cheese cubes land: a wet splat.
          noise(v, { t: t + 0.2, type: 'bandpass', f: 900 * x.j(0.15), f1: 300, glide: 0.08, q: 1.2, peak: 0.25, a: 0.003, d: 0.09 });
        }
      } else {
        // Crate stack: a woody crack and thump, then planks clattering down.
        noise(v, { t, type: 'bandpass', f: 1600 * x.j(0.15), q: 0.8, peak: 0.55, a: 0.002, d: 0.09 }); // crack
        noise(v, { t, type: 'lowpass', f: 600, q: 0.7, peak: 0.3, a: 0.002, d: 0.08 });
        tone(v, { t, f: 130 * x.j(0.1), f1: 55, glide: 0.12, peak: 0.3, a: 0.003, d: 0.14 }); // thump
        let dt = 0.16 * x.j(0.15);
        for (let i = 0; i < 4 + (x.shape === 1 ? 1 : 0); i++) {
          const k = 1 - i * 0.17;
          const f = x.between(480, 720);
          tone(v, { t: t + dt, f, f1: f * 0.8, glide: 0.05, peak: 0.22 * k, a: 0.002, d: 0.06 });
          noise(v, { t: t + dt, type: 'bandpass', f: f * 2.2, q: 3, peak: 0.35 * k, a: 0.002, d: 0.035 });
          dt += x.between(0.07, 0.12);
        }
      }
      return v.end;
    },
  },

  upgraded: {
    about: 'Security upgraded: a wrench ratchet and a rising "ding-ding-DING", a step higher for every level (on one of three instruments). Level 10, the top, gets a flourish: an arpeggio, a brass stab and a sparkle.',
    max: 0.75,
    shapes: 3,
    variants: [
      { label: 'level 1', opts: { lv: 1 } },
      { label: 'level 5', opts: { lv: 5 } },
      { label: 'level 9', opts: { lv: 9 } },
      { label: 'level 10', opts: { lv: 10 }, max: 1.6 },
      { label: 'damage 3', opts: { t: 'dmg', lv: 3 }, about: 'Damage track: a heavy knock and a low growl under the chord.' },
      { label: 'speed 3', opts: { t: 'spd', lv: 3 }, about: 'Speed track: a quick rising whirr.' },
      { label: 'range 3', opts: { t: 'rng', lv: 3 }, about: 'Range track: a ping that rises.' },
      { label: 'durability 3', opts: { t: 'dur', lv: 3 }, about: 'Durability track: a bolt being tightened, clicks bunching up, then a clunk.' },
      { label: 'damage top (8)', opts: { t: 'dmg', lv: 8, top: 1 }, max: 1.6, about: 'The top level of a track: the flourish.' },
      { label: 'range top (5)', opts: { t: 'rng', lv: 5, top: 1 }, max: 1.6, about: 'A track with its own lower maximum, at the top: the flourish at a lower pitch.' },
    ],
    play: upgradeSound,
  },

  rebuilt: {
    about: 'Wrecked buildings put back in one go: a quick hammer knock for each one (up to six), then a cheerful "ta-DA".',
    max: 1.0,
    shapes: 1,
    variants: [
      { label: '1', opts: { n: 1 } },
      { label: '3', opts: { n: 3 } },
      { label: '8', opts: { n: 8 } },
      { label: '3, 2 short', opts: { n: 3, short: 2 }, max: 1.2, about: 'Two of the three came back with fewer upgrades (no money): the "ta-DA" deflates into a sad slide.' },
      { label: '8, all short', opts: { n: 8, short: 8 }, max: 1.2, about: 'The same after a big rebuild.' },
    ],
    play: rebuildSound,
  },

  rail: {
    about: 'The Barcode Laser fires (a checkout scanner turned up far too high): a motor whine and a scanning buzz climbing for half a second, then a very loud checkout BEEP (one, a quick "bi-bip", or low-high) with a laser zap and a sizzle. More sparkle when it hit a crowd.',
    max: 1.3,
    shapes: 3,
    variants: [
      { label: 'hit 1', opts: { n: 1 } },
      { label: 'hit 5', opts: { n: 5 }, about: 'The beam went through five shoppers: high sparkles and a bell on the end.' },
    ],
    play: barcodeLaser,
  },

  pee: {
    about: 'A stray dog pees on a piece of security: a little trickle, then the machine fizzes and crackles, powers down with a falling whine, or zaps and smokes.',
    max: 1.1,
    shapes: 3,
    play: pee,
  },

  flash: {
    about: 'The exhibitionist opens her robe: a brassy "ta-DAAA" with a cymbal, a wolf whistle, or both, and an "ooooh" from the men watching (more voices when more stop).',
    max: 1.2,
    shapes: 3,
    variants: [
      { label: '1 watcher', opts: { n: 1 } },
      { label: '5 watchers', opts: { n: 5 }, about: 'A second, higher "ooh" joins in.' },
    ],
    play: flash,
  },

  fall: {
    about: 'The day drinker falls over at a corner: a "whoa" or a few scuffs, a thud, then a bottle rolling away clinking (or breaking).',
    max: 1.2,
    shapes: 3,
    play: fall,
  },

  pitch: {
    about: 'The TV Salesman works a shopper. Stop: a quick snatch of patter (sometimes a knife "shing" or a barbecue sizzle). Rush: a "no thanks" swish with a mutter, footsteps or a "tsk". Tiny, because there are many a second.',
    max: 0.35,
    shapes: 3,
    variants: [
      { label: 'stop', opts: { r: 'stop' } },
      { label: 'rush', opts: { r: 'rush' } },
    ],
    play: pitch,
  },

  kidtv: {
    about: 'A runaway child stops to watch the salesman\'s television: a short cartoon jingle sting (xylophone, "da-da-da-da-DAA", or a squeaky run).',
    max: 0.9,
    shapes: 3,
    play: kidtv,
  },

  shield: {
    about: 'A cosplayer soaks up shots meant for those around him: a dull foam-armour "bonk" (sometimes with a squeak) or a quick force-field hum.',
    max: 0.35,
    shapes: 3,
    play: shield,
  },

  gave: {
    about: 'One player gives another money: coins clinking over (more coins for more money) and a till "ka-ching" for a big handout.',
    max: 0.9,
    shapes: 1,
    variants: [
      { label: '10', opts: { n: 10 } },
      { label: '100', opts: { n: 100 } },
      { label: '1000', opts: { n: 1000 } },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed);
      const cash = Math.max(1, Number(o.n) || 10);
      const n = Math.max(1, Math.min(6, Math.round(1 + Math.log2(cash / 10))));
      for (let i = 0; i < n; i++) clink(v, t + i * 0.07 * x.j(0.2), x);
      if (cash >= 100) {
        const e = t + n * 0.07 + 0.03;
        noise(v, { t: e, type: 'bandpass', f: 1500, q: 1, peak: 0.2, a: 0.003, d: 0.05 });
        bell(v, { t: e + 0.02, f: 2093, peak: 0.14, d: 0.35, ratio: 2, index: 0.7 });
        bell(v, { t: e + 0.02, f: 2637, peak: 0.1, d: 0.3, ratio: 2, index: 0.5 });
      }
      return v.end;
    },
  },

  begun: {
    about: 'The lobby is over and the store opens: the metal shutter rattles up and bangs at the top, then the shop-door bell jingles.',
    max: 1.8,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      // The shutter: noise chopped by a square wave that speeds up as it rolls.
      const chop = gain(v, 0.5);
      const lf = ctx.createOscillator();
      lf.type = 'square';
      lf.frequency.setValueAtTime(20, t);
      lf.frequency.linearRampToValueAtTime(34, t + 0.8);
      lf.connect(gain(v, 0.5)).connect(chop.gain);
      noise(v, { t, type: 'bandpass', f: 500, f1: 1400, glide: 0.8, q: 2, peak: 0.25, a: 0.05, h: 0.6, d: 0.12, to: chop });
      chop.connect(v.out);
      v.run(lf, t, t + 0.9);
      thud(v, t + 0.86, 0.25, 140);
      clang(v, t + 0.86, 260, 0.1, 0.3, 2);
      [0, 0.07, 0.14].forEach((dt, i) => bell(v, { t: t + 1.05 + dt, f: mtof(i % 2 ? 93 : 96), peak: 0.1, d: 0.45, ratio: 3.5, index: 0.8 }));
      return v.end;
    },
  },

  ready: {
    about: 'A side asks for the doors to open: an impatient service-desk bell, "ding! ding!". Head Office rings three times.',
    max: 1.0,
    variants: [
      { label: 'store', opts: { side: 'store' } },
      { label: 'office', opts: { side: 'office' } },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const n = o.side === 'office' ? 3 : 2;
      for (let i = 0; i < n; i++) bell(v, { t: t + i * 0.16, f: 1975, ratio: 2.76, index: 1.4, peak: 0.15 + i * 0.03, d: 0.45 });
      return v.end;
    },
  },

  side: {
    about: 'Someone takes the Head Office job (he runs the shoppers now): a villain\'s "dun dun DUNNN". Someone quits it: a deflating brass "wah-waaah".',
    max: 1.6,
    variants: [
      { label: 'office', opts: { side: 'office' } },
      { label: 'store', opts: { side: 'store' } },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      if (o.side === 'office') {
        brass(v, { t, f: mtof(50), peak: 0.22, a: 0.02, h: 0.08, d: 0.06, bright: 4 });
        brass(v, { t: t + 0.18, f: mtof(53), peak: 0.22, a: 0.02, h: 0.08, d: 0.06, bright: 4 });
        brass(v, { t: t + 0.36, f: mtof(49), peak: 0.26, a: 0.03, h: 0.55, d: 0.4, bright: 4, vib: { rate: 5, depth: 18, delay: 0.2 } });
        tone(v, { t: t + 0.36, f: 65, f1: 48, glide: 0.4, peak: 0.2, a: 0.005, d: 0.6 });
      } else {
        brass(v, { t, f: mtof(58), peak: 0.22, a: 0.03, h: 0.12, d: 0.06, bright: 4 });
        brass(v, { t: t + 0.25, f: mtof(56), f1: mtof(46), glide: 0.7, peak: 0.24, a: 0.03, h: 0.5, d: 0.25, bright: 4,
          wah: { rate: 5, depth: 200, delay: 0.1 } });
      }
      return v.end;
    },
  },

  waveStart: {
    about: 'Store PA "ding-dong". With dads coming: a low ominous "dun... DUNNN" afterwards. With a boss coming (boss = his tier): no ding-dong, but a funeral toll a tritone apart, a sour low brass chord and timpani.',
    max: 1.8,
    variants: [
      { label: 'plain', opts: { dads: 0 } },
      { label: 'dads', opts: { dads: 4 }, max: 2.9 },
      { label: 'boss 1', opts: { boss: 1 }, max: 3.2, about: 'A boss event (Regional Manager): the funeral toll and a sour chord.' },
      { label: 'boss 4', opts: { boss: 4, dads: 4 }, max: 3.2, about: 'The CEO event: the same, a little heavier (the boss toll replaces the dads\' dun-DUNNN).' },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      if (o.boss > 0) return bossWave(v, t, { tier: o.boss });
      // Two vibraphone-like chimes, a major third apart, like a shop tannoy.
      [[mtof(76), 0], [mtof(72), 0.45]].forEach(([f, dt]) => {
        bell(v, { t: t + dt, f, peak: 0.32, d: 1.1, ratio: 4, index: 0.5 });
        tone(v, { t: t + dt, f: f / 2, peak: 0.1, a: 0.004, d: 0.9 });
      });
      if (o.dads > 0) {
        const s = t + 1.25;
        brass(v, { t: s, f: mtof(48), peak: 0.2, a: 0.02, h: 0.12, d: 0.12, bright: 3 });
        brass(v, { t: s + 0.35, f: mtof(42), peak: 0.24, a: 0.03, h: 0.5, d: 0.5, bright: 3, vib: { rate: 4, depth: 12, delay: 0.2 } });
        tone(v, { t: s + 0.35, f: 70, f1: 50, glide: 0.4, peak: 0.2, a: 0.005, d: 0.6 }); // timpani-ish boom
      }
      return v.end;
    },
  },

  bossIn: {
    about: 'The boss walks in: a pompous corporate fanfare that grows with his tier. 1 Regional Manager: brisk brass "ta-ta-ta-TAA" and a cymbal. 2: timpani and a bigger chord. 3: a choir, a harp run and a snare roll. 4 (the CEO): all that plus an air horn, kazoos, a slide whistle, a till and a cheering crowd.',
    max: 1.6,
    shapes: 1,
    variants: [
      { label: 'tier 1', opts: { tier: 1 }, max: 1.4 },
      { label: 'tier 2', opts: { tier: 2 }, max: 2.2 },
      { label: 'tier 3', opts: { tier: 3 }, max: 2.5 },
      { label: 'tier 4 (the CEO)', opts: { tier: 4 }, max: 3.6 },
    ],
    play: bossIn,
  },

  pep: {
    about: 'The boss gives a pep talk (every 7 seconds): a blustering baritone of four or five syllables ending in a bellow, then a referee whistle, an air horn or two claps; if n shoppers were encouraged, the crowd answers "yeah!" (up to three voices, with applause from five). Short and quiet.',
    max: 1.1,
    shapes: 3,
    variants: [
      { label: 'nobody', opts: { n: 0 }, about: 'Nobody was near enough to be encouraged: just him.' },
      { label: '2 cheer', opts: { n: 2 }, about: 'One voice answers "yeah!".' },
      { label: '8 cheer', opts: { n: 8 }, about: 'Three voices and applause.' },
    ],
    play: pep,
  },

  bossOut: {
    about: 'The players drove the boss out: his outraged splutter (a strangled "buh-buh-BUH-bweh", a raspberry and "you\'ll hear from my lawyers", or a long "NNNGH" and a whimper), the shop door slammed, then the cash: a run of coins up the scale, a till "ka-CHING" (more for higher tiers). Plays instead of his ordinary walk-out voice.',
    max: 1.9,
    shapes: 3,
    variants: [
      { label: 'tier 1', opts: { tier: 1, bounty: 150 }, max: 1.9 },
      { label: 'tier 4', opts: { tier: 4, bounty: 600 }, max: 2.4, about: 'The CEO: more coins, a second till and a cymbal.' },
    ],
    play: bossOut,
  },

  bossEscape: {
    about: 'The boss reached the tills and counts as five refunds: a rubber stamp thump, five till drawers slamming open one after another, each with a cash-register bell, then a smug chuckle ("heh heh heh", a deep "hoo-hoo-hoo", or an evil "ha-HAAA"). From tier 3 a low rumble underneath.',
    max: 2.1,
    shapes: 3,
    variants: [
      { label: 'tier 1', opts: { tier: 1 } },
      { label: 'tier 4', opts: { tier: 4 }, about: 'The CEO gets away with it: the same, with a rumble.' },
    ],
    play: bossEscape,
  },

  endless: {
    about: 'A won game is carried on: a tape rewinding, then a weary low-brass "da-DUM, da-DUUUM" with timpani and a tannoy ding. "Here we go again."',
    max: 1.8,
    shapes: 1,
    play: endless,
  },

  waveEnd: {
    about: 'A short cheerful "da-da-da-DING" jingle: the sales event is over.',
    max: 1.0,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      [72, 76, 79, 84].forEach((m, i) => {
        const last = i === 3;
        tone(v, { t: t + i * 0.09, f: mtof(m), type: 'triangle', peak: 0.25, a: 0.004, h: last ? 0.1 : 0.02, d: last ? 0.4 : 0.1 });
        tone(v, { t: t + i * 0.09, f: mtof(m), type: 'square', lp: 2500, peak: 0.05, a: 0.004, h: last ? 0.1 : 0.02, d: last ? 0.3 : 0.08 });
      });
      bell(v, { t: t + 0.27, f: mtof(96), peak: 0.08, d: 0.5, ratio: 2, index: 0.5 });
      return v.end;
    },
  },

  won: {
    about: 'Victory fanfare: cheap brass "ta-ta-ta TAAA" then a big held major chord with vibrato.',
    max: 3.0,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const b = { peak: 0.2, a: 0.02, bright: 5 };
      [0, 0.13, 0.26].forEach((dt) => brass(v, { ...b, t: t + dt, f: mtof(67), h: 0.05, d: 0.06 }));
      brass(v, { ...b, t: t + 0.39, f: mtof(72), h: 0.35, d: 0.1 });
      brass(v, { ...b, t: t + 0.9, f: mtof(69), h: 0.1, d: 0.06 });
      brass(v, { ...b, t: t + 1.06, f: mtof(71), h: 0.1, d: 0.06 });
      for (const m of [72, 76, 79, 84]) {
        brass(v, { ...b, peak: 0.13, t: t + 1.22, f: mtof(m), a: 0.03, h: 0.8, d: 0.6, vib: { rate: 5.5, depth: 15, delay: 0.3 } });
      }
      bell(v, { t: t + 1.22, f: mtof(96), peak: 0.1, d: 1.2, ratio: 3.5, index: 0.8 }); // cymbal-ish sparkle
      noise(v, { t: t + 1.22, type: 'highpass', f: 7000, peak: 0.08, a: 0.003, d: 0.9 });
      return v.end;
    },
  },

  lost: {
    about: 'The sad trombone: "wah... wah... wah... waaaaah", sliding down, the last one wobbling.',
    max: 3.0,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const notes = [58, 57, 56];
      notes.forEach((m, i) => {
        brass(v, { t: t + i * 0.42, f: mtof(m), peak: 0.32, a: 0.05, h: 0.2, d: 0.12, bright: 6 });
      });
      brass(v, { t: t + 1.26, f: mtof(55), f1: mtof(54.3), glide: 1.2, peak: 0.34, a: 0.05, h: 0.85, d: 0.35, bright: 5,
        vib: { rate: 6, depth: 40, delay: 0.25 }, wah: { rate: 6, depth: 250, delay: 0.25 } });
      return v.end;
    },
  },

  // ---------------------------------------------------------------- session messages
  deb: {
    about: 'DEB the HR chatbot starts talking: robot blips. Flat = monotone; angry = fast, low and falling; smug = rising to a "hmm?".',
    max: 0.6,
    variants: [
      { label: 'flat', opts: { mood: 'flat', seed: 1 } },
      { label: 'angry', opts: { mood: 'angry', seed: 2 } },
      { label: 'smug', opts: { mood: 'smug', seed: 3 } },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const r = rng(o.seed || 1);
      if (o.mood === 'angry') {
        for (let i = 0; i < 7; i++) {
          const f = 330 * (1.12 - i * 0.04) * (0.94 + r() * 0.12);
          tone(v, { t: t + i * 0.048, f, f1: f * 0.85, type: 'sawtooth', lp: 1500, peak: 0.13, a: 0.003, h: 0.018, d: 0.02 });
        }
      } else if (o.mood === 'smug') {
        [440, 494, 554].forEach((f, i) => {
          tone(v, { t: t + i * 0.075, f, type: 'square', lp: 2400, peak: 0.11, a: 0.003, h: 0.03, d: 0.025 });
        });
        tone(v, { t: t + 0.24, f: 660, f1: 820, glide: 0.18, type: 'square', lp: 2400, peak: 0.11, a: 0.005, h: 0.1, d: 0.1,
          vib: { rate: 9, depth: 30, delay: 0.05 } });
      } else {
        for (let i = 0; i < 5; i++) {
          const f = 520 * (1 + (r() - 0.5) * 0.12);
          tone(v, { t: t + i * 0.068, f, type: 'square', lp: 2200, peak: 0.11, a: 0.003, h: 0.03, d: 0.02 });
        }
      }
      return v.end;
    },
  },

  review: {
    about: 'A customer review pops up: a phone-notification "di-ding". Five stars (a dad) adds a smug sparkly flourish.',
    max: 0.7,
    variants: [
      { label: '1 star', opts: { stars: 1 } },
      { label: '5 stars', opts: { stars: 5 }, max: 1.2 },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      bell(v, { t, f: mtof(88), peak: 0.16, d: 0.35, ratio: 2, index: 0.7 });
      bell(v, { t: t + 0.09, f: mtof(93), peak: 0.18, d: 0.5, ratio: 2, index: 0.7 });
      if (o.stars >= 5) {
        [84, 88, 91, 96, 100].forEach((m, i) => {
          tone(v, { t: t + 0.3 + i * 0.045, f: mtof(m), type: 'triangle', peak: 0.08, a: 0.003, d: 0.14 });
        });
        bell(v, { t: t + 0.55, f: mtof(103), peak: 0.07, d: 0.55, ratio: 3.5, index: 0.6 });
      }
      return v.end;
    },
  },

  report: {
    about: 'Performance review: a rubber stamp "THUMP", then an office printer chattering out the page.',
    max: 1.4,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      // Stamp: low body, papery slap, and the small click of the handle.
      tone(v, { t, f: 110, f1: 45, glide: 0.12, peak: 0.5, a: 0.003, d: 0.16 });
      noise(v, { t, type: 'lowpass', f: 700, q: 0.7, peak: 0.35, a: 0.002, d: 0.06 });
      noise(v, { t: t + 0.005, type: 'bandpass', f: 2500, q: 1, peak: 0.15, a: 0.002, d: 0.02 });
      // Printer: three chattering lines (noise chopped by a fast square wave), then the page ejects.
      for (let i = 0; i < 3; i++) {
        const s = t + 0.32 + i * 0.16;
        const chop = gain(v, 0.5);
        const lf = ctx.createOscillator();
        lf.type = 'square';
        lf.frequency.value = 38;
        lf.connect(gain(v, 0.5)).connect(chop.gain);
        noise(v, { t: s, type: 'bandpass', f: 2200 + i * 150, q: 2.5, peak: 0.22, a: 0.005, h: 0.08, d: 0.03, to: chop });
        chop.connect(v.out);
        v.run(lf, s, s + 0.13);
      }
      noise(v, { t: t + 0.82, type: 'bandpass', f: 1200, f1: 5000, glide: 0.18, q: 2, peak: 0.15, a: 0.02, h: 0.1, d: 0.06 });
      return v.end;
    },
  },

  players: {
    about: 'Someone joins or leaves: a time-clock card punch "ch-CHUNK" with a little bell.',
    max: 0.6,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      noise(v, { t, type: 'highpass', f: 2500, q: 0.7, peak: 0.18, a: 0.002, d: 0.02 }); // card in
      tone(v, { t: t + 0.08, f: 220, f1: 100, glide: 0.08, peak: 0.35, a: 0.003, d: 0.1 }); // CHUNK
      noise(v, { t: t + 0.08, type: 'bandpass', f: 900, q: 1, peak: 0.3, a: 0.002, d: 0.05 });
      bell(v, { t: t + 0.13, f: 1760, peak: 0.08, d: 0.35, ratio: 2.4, index: 1 });
      return v.end;
    },
  },

  chat: {
    about: 'A chat line from another player: a soft little "blip-bloop", like a phone in the next room.',
    max: 0.25,
    shapes: 1,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed);
      const f = 700 * x.j(0.06);
      tone(v, { t, f, f1: f * 1.4, glide: 0.04, peak: 0.12, a: 0.004, d: 0.05 });
      tone(v, { t: t + 0.07, f: f * 1.5, peak: 0.08, a: 0.004, d: 0.07 });
      return v.end;
    },
  },

  // ---------------------------------------------------------------- interface
  select: {
    about: 'A tool is picked: a soft upward "bip".',
    max: 0.15,
    shapes: 1,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const p = vary(o.seed).j(0.04);
      tone(v, { t, f: 880 * p, f1: 1320 * p, glide: 0.03, peak: 0.13, a: 0.003, d: 0.06 });
      tone(v, { t, f: 440 * p, f1: 660 * p, glide: 0.03, type: 'triangle', peak: 0.06, a: 0.003, d: 0.05 });
      return v.end;
    },
  },

  place: {
    about: 'A building goes down: a solid, satisfying "clunk", sometimes woodier, sometimes a two-step "ka-chunk".',
    max: 0.3,
    shapes: 3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 3);
      const p = x.j(0.1);
      let s = t;
      if (x.shape === 2) {
        noise(v, { t, type: 'bandpass', f: 3000 * x.j(0.1), q: 2, peak: 0.12, a: 0.002, d: 0.01 });
        s = t + 0.035;
      }
      tone(v, { t: s, f: 200 * p, f1: 85 * p, glide: 0.08, peak: 0.28, a: 0.003, d: 0.12 });
      noise(v, { t: s, type: 'lowpass', f: 1400 * x.j(0.2), q: 0.7, peak: 0.2, a: 0.002, d: 0.04 });
      if (x.shape === 1) knock(v, s + 0.005, 900 * p, 0.1);
      else tone(v, { t: s, f: 110 * p, type: 'square', lp: 600, peak: 0.08, a: 0.003, d: 0.06 });
      return v.end;
    },
  },

  remove: {
    about: 'A building is removed: a bubbly "pop", sometimes a double pop or a pop with a little whistle.',
    max: 0.2,
    shapes: 3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const x = vary(o.seed, 3);
      const p = x.j(0.1);
      tone(v, { t, f: 320 * p, f1: 950 * p, glide: 0.045, peak: 0.3, a: 0.003, d: 0.07 });
      noise(v, { t, type: 'highpass', f: 3000, q: 0.7, peak: 0.06, a: 0.002, d: 0.015 });
      if (x.shape === 1) tone(v, { t: t + 0.06 * x.j(0.2), f: 420 * p, f1: 1200 * p, glide: 0.04, peak: 0.18, a: 0.003, d: 0.06 });
      if (x.shape === 2) tone(v, { t: t + 0.03, f: 1200 * p, f1: 2400 * p, glide: 0.06, peak: 0.06, a: 0.005, d: 0.05 });
      return v.end;
    },
  },

  upgrade: {
    about: 'The upgrade button. The host hears the level-aware "upgraded" sound instead; this is for a player in someone else\'s game, whose browser does not know the new level: the same sound at a middle pitch.',
    max: 0.75,
    shapes: 3,
    play: (ctx, dest, t, o = {}) => upgradeSound(ctx, dest, t, { ...o, lv: 0 }),
  },

  rebuild: {
    about: 'The rebuild button (when the browser does not know how many came back): three hammer knocks and "ta-DA".',
    max: 1.0,
    shapes: 1,
    play: (ctx, dest, t, o = {}) => rebuildSound(ctx, dest, t, { ...o, n: 3 }),
  },

  rotate: {
    about: 'Rotating a building: a quick ratchet "tik-tik-tik".',
    max: 0.15,
    shapes: 1,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const p = vary(o.seed).j(0.06);
      for (let i = 0; i < 3; i++) {
        noise(v, { t: t + i * 0.028, type: 'bandpass', f: (3200 - i * 300) * p, q: 3, peak: 0.45, a: 0.002, d: 0.014 });
        tone(v, { t: t + i * 0.028, f: (1700 - i * 150) * p, peak: 0.05, a: 0.002, d: 0.012 });
      }
      return v.end;
    },
  },

  nope: {
    about: 'Refused: a soft, low game-show buzzer "eh-ehh". Muffled so it is not harsh.',
    max: 0.45,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      [[150, 0, 0.06], [128, 0.15, 0.1]].forEach(([f, dt, h]) => {
        tone(v, { t: t + dt, f, type: 'sawtooth', lp: 650, q: 1, peak: 0.2, a: 0.008, h, d: 0.06 });
        tone(v, { t: t + dt, f: f / 2, peak: 0.1, a: 0.008, h, d: 0.06 });
      });
      return v.end;
    },
  },

  click: {
    about: 'A button press: a tiny dry "tick".',
    max: 0.08,
    shapes: 1,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const p = vary(o.seed).j(0.08);
      tone(v, { t, f: 1500 * p, f1: 1100 * p, glide: 0.02, peak: 0.12, a: 0.002, d: 0.025 });
      noise(v, { t, type: 'highpass', f: 4000, q: 0.7, peak: 0.08, a: 0.002, d: 0.008 });
      return v.end;
    },
  },

  tutorial: {
    about: 'A tutorial step done: a pleasant two-note "ding-DING" up a fifth.',
    max: 0.8,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      bell(v, { t, f: mtof(84), peak: 0.18, d: 0.4, ratio: 2, index: 0.6 });
      bell(v, { t: t + 0.1, f: mtof(91), peak: 0.2, d: 0.6, ratio: 2, index: 0.6 });
      tone(v, { t: t + 0.1, f: mtof(79), type: 'triangle', peak: 0.07, a: 0.004, d: 0.4 });
      return v.end;
    },
  },
};

/** The same sounds as plain functions: sfx.sale(ctx, dest, t, opts). */
export const sfx = Object.fromEntries(Object.entries(SOUNDS).map(([k, s]) => [k, s.play]));
