// Every sound effect in the game, in one table.
//
// Each entry has:
//   about     what it is meant to sound like, in plain words
//   max       the longest it may ring, in seconds (tools/sound-test.html fails it if longer)
//   variants  optional: named option sets the test page renders as separate rows
//   play(ctx, dest, t, opts)  schedules the sound into `dest` starting at time `t` and returns the
//             time it ends. A pure function of a BaseAudioContext, so it runs the same live and in
//             an OfflineAudioContext. opts.level (default 1) scales the whole sound.
//
// Loudness plan (peak at level 1, measured by the test page): frequent sounds (sale, spray, shot,
// UI ticks) stay small and short; rare moments (waveStart, won, lost) are the loudest and longest.
import { voice, tone, noise, bell, brass, formant, gain, mtof, rng } from './synth.js';

/** One dog bark ("wuf"): a buzzy voice that drops in pitch, with a puff of air. `low` for a deep one. */
function bark(v, t, peak = 0.5, low = 1) {
  return formant(v, { t, f: 270 * low, f1: 170 * low, glide: 0.09, type: 'sawtooth', formants: [[650 * low, 3, 1], [1400 * low, 4, 0.5]],
    breath: 0.4, peak, a: 0.006, h: 0.03, d: 0.07 });
}

export const SOUNDS = {
  // ---------------------------------------------------------------- simulation events
  sale: {
    about: 'A tiny cash-register "bli-ding". Box low, gadget higher, gift set highest with a sparkle.',
    max: 0.3,
    variants: [
      { label: 'box', opts: { kind: 'box' } },
      { label: 'gadget', opts: { kind: 'gadget' } },
      { label: 'giftset', opts: { kind: 'giftset' } },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const f = { box: 1319, gadget: 1568, giftset: 2093 }[o.kind] || 1319; // E6, G6, C7
      tone(v, { t, f: f * 0.75, type: 'triangle', peak: 0.1, a: 0.002, d: 0.03 }); // the "bli"
      bell(v, { t: t + 0.035, f, peak: 0.17, d: 0.17, ratio: 2, index: 0.6 }); // the "ding"
      if (o.kind === 'giftset') bell(v, { t: t + 0.075, f: f * 1.5, peak: 0.07, d: 0.13, ratio: 2, index: 0.4 });
      return v.end;
    },
  },

  spray: {
    about: 'A short pepper-spray "pssht": high hiss that dulls as it fades.',
    max: 0.3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      noise(v, { t, type: 'highpass', f: 4000, q: 0.5, peak: 0.11, a: 0.012, h: 0.03, d: 0.13 });
      noise(v, { t, type: 'bandpass', f: 6500, f1: 3500, q: 1.2, peak: 0.08, a: 0.01, h: 0.02, d: 0.14 });
      return v.end;
    },
  },

  shot: {
    about: 'Forklift turret "thunk-whoosh": a dull low knock, then a pallet swishing through the air.',
    max: 0.4,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      tone(v, { t, f: 150, f1: 55, glide: 0.1, peak: 0.22, a: 0.003, d: 0.12 }); // thunk
      noise(v, { t, type: 'lowpass', f: 900, q: 0.7, peak: 0.18, a: 0.002, d: 0.05 }); // knock
      noise(v, { t: t + 0.04, type: 'bandpass', f: 500, f1: 2400, q: 1.4, peak: 0.12, a: 0.06, d: 0.14 }); // whoosh
      return v.end;
    },
  },

  escape: {
    about: 'A refund paid: coins tumbling down four notes and a sad "bloop" (the guide dog adds a bark). A dad gets a smug kazoo "da-DAAA" instead.',
    max: 0.8,
    variants: [
      { label: 'hunter', opts: { k: 'hunter' } },
      { label: 'dad', opts: { k: 'dad' } },
      { label: 'blind', opts: { k: 'blind' } },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      if (o.k === 'dad') {
        const kazoo = { type: 'sawtooth', formants: [[1100, 3, 1], [2500, 4, 0.5]], breath: 0.15 };
        formant(v, { ...kazoo, t, f: mtof(67), peak: 0.35, a: 0.015, h: 0.08, d: 0.06 });
        formant(v, { ...kazoo, t: t + 0.17, f: mtof(72), peak: 0.38, a: 0.02, h: 0.3, d: 0.2, vib: { rate: 6, depth: 35, delay: 0.08 } });
        return v.end;
      }
      [988, 784, 659, 523].forEach((f, i) => { // B5 G5 E5 C5, falling
        tone(v, { t: t + i * 0.07, f, type: 'triangle', peak: 0.2, a: 0.003, d: 0.1 });
      });
      tone(v, { t: t + 0.3, f: 420, f1: 140, glide: 0.25, peak: 0.24, a: 0.01, d: 0.28 }); // bloop
      if (o.k === 'blind') bark(v, t + 0.32, 0.35);
      return v.end;
    },
  },

  left: {
    about: 'A shopper storms out: a short "hmph". Dad deeper; Karen sharper; teen a bored sigh; mom an exasperated huff; gym bro a deep grunt; the guide dog barks once.',
    max: 0.5,
    variants: [
      { label: 'hunter', opts: { k: 'hunter' } },
      { label: 'dad', opts: { k: 'dad' } },
      { label: 'karen', opts: { k: 'karen' } },
      { label: 'teen', opts: { k: 'teen' } },
      { label: 'mom', opts: { k: 'mom' } },
      { label: 'blind', opts: { k: 'blind' } },
      { label: 'gymbro', opts: { k: 'gymbro' } },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      const kinds = {
        dad: { f: 100, f1: 70, formants: [[450, 4, 1], [900, 6, 0.4]], h: 0.1, d: 0.2 },
        karen: { f: 250, f1: 185, formants: [[900, 4, 1], [1600, 6, 0.5]], h: 0.04, d: 0.13 },
        // A long breathy "hhhaaah" with hardly any voice in it.
        teen: { f: 190, f1: 130, formants: [[550, 2, 0.35]], breath: 1.1, peak: 0.3, a: 0.07, h: 0.08, d: 0.22, glide: 0.35 },
        mom: { f: 235, f1: 165, formants: [[850, 4, 1], [1500, 6, 0.5]], breath: 0.6, h: 0.03, d: 0.12 },
        gymbro: { f: 82, f1: 62, formants: [[380, 4, 1], [760, 6, 0.5]], peak: 0.62, a: 0.015, h: 0.07, d: 0.12 },
      };
      const k = kinds[o.k] || { f: 160, f1: 110, formants: [[650, 4, 1], [1100, 6, 0.5]], h: 0.06, d: 0.15 };
      formant(v, { t, type: 'sawtooth', peak: 0.55, a: 0.02, breath: 0.25, glide: 0.25, ...k });
      if (o.k === 'blind') bark(v, t + 0.18, 0.35, 0.8);
      return v.end;
    },
  },

  slip: {
    about: 'A comic slide whistle down, then a bum hitting the floor.',
    max: 0.9,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      tone(v, { t, f: 1800, f1: 330, glide: 0.42, peak: 0.2, a: 0.02, h: 0.32, d: 0.08, vib: { rate: 9, depth: 25 } });
      noise(v, { t, type: 'bandpass', f: 1800, f1: 330, glide: 0.42, q: 4, peak: 0.04, a: 0.02, h: 0.32, d: 0.08 }); // breath
      tone(v, { t: t + 0.47, f: 130, f1: 45, glide: 0.15, peak: 0.45, a: 0.003, d: 0.2 }); // thud
      noise(v, { t: t + 0.47, type: 'lowpass', f: 500, q: 0.7, peak: 0.3, a: 0.002, d: 0.07 });
      return v.end;
    },
  },

  grab: {
    about: 'A shopper nicks something off a belt: a quick rising "yoink".',
    max: 0.25,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      tone(v, { t, f: 280, f1: 1300, glide: 0.11, type: 'square', lp: 2200, peak: 0.1, a: 0.004, h: 0.05, d: 0.06 });
      tone(v, { t, f: 140, f1: 650, glide: 0.11, peak: 0.1, a: 0.004, h: 0.05, d: 0.06 });
      return v.end;
    },
  },

  sample: {
    about: 'A shopper takes a free sample: a small satisfied "mm".',
    max: 0.3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      formant(v, { t, f: 190, f1: 235, glide: 0.15, type: 'triangle', formants: [[280, 1.5, 1], [2200, 8, 0.15]],
        peak: 0.36, a: 0.025, h: 0.07, d: 0.1, vib: { rate: 7, depth: 20, delay: 0.04 } });
      return v.end;
    },
  },

  mess: {
    about: 'A teenager drops a slushie: a small wet "splat" and a drip.',
    max: 0.3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      noise(v, { t, type: 'bandpass', f: 1100, f1: 300, glide: 0.08, q: 1.2, peak: 0.35, a: 0.003, d: 0.09 }); // splat
      tone(v, { t, f: 320, f1: 110, glide: 0.06, peak: 0.1, a: 0.003, d: 0.07 }); // body
      tone(v, { t: t + 0.1, f: 1100, f1: 1800, glide: 0.03, peak: 0.05, a: 0.003, d: 0.04 }); // drip
      return v.end;
    },
  },

  kid: {
    about: 'A child escapes his mother: a mischievous "hee-hee-WHEEE" squeak.',
    max: 0.6,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      [880, 990, 1110].forEach((f, i) => { // hee-hee-hee
        tone(v, { t: t + i * 0.075, f, f1: f * 0.92, type: 'triangle', peak: 0.16, a: 0.004, h: 0.02, d: 0.03, vib: { rate: 22, depth: 60 } });
      });
      tone(v, { t: t + 0.23, f: 700, f1: 1600, glide: 0.22, type: 'triangle', peak: 0.2, a: 0.01, h: 0.13, d: 0.1, vib: { rate: 14, depth: 40 } }); // wheee
      return v.end;
    },
  },

  caught: {
    about: 'Mum catches the kid: a short relieved "got-CHA", down then up. Quieter than the kid.',
    max: 0.45,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      tone(v, { t, f: 660, f1: 520, glide: 0.08, type: 'triangle', peak: 0.13, a: 0.005, h: 0.03, d: 0.06 });
      tone(v, { t: t + 0.12, f: 560, f1: 760, glide: 0.06, type: 'triangle', peak: 0.13, a: 0.005, h: 0.06, d: 0.14 });
      return v.end;
    },
  },

  bolt: {
    about: 'A pepper-sprayed guide dog bolts: "woof-woof", two short barks.',
    max: 0.5,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      bark(v, t, 0.5);
      bark(v, t + 0.16, 0.45, 0.94);
      return v.end;
    },
  },

  smash: {
    about: 'A gym bro walks through a crate stack: a woody crack and thump, then planks clattering down.',
    max: 0.9,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      noise(v, { t, type: 'bandpass', f: 1600, q: 0.8, peak: 0.55, a: 0.002, d: 0.09 }); // crack
      noise(v, { t, type: 'lowpass', f: 600, q: 0.7, peak: 0.3, a: 0.002, d: 0.08 });
      tone(v, { t, f: 130, f1: 55, glide: 0.12, peak: 0.3, a: 0.003, d: 0.14 }); // thump
      // Planks landing: hollow wooden knocks, each a bit later and quieter.
      [[0.16, 620, 1], [0.27, 480, 0.8], [0.35, 700, 0.65], [0.47, 540, 0.5], [0.55, 650, 0.35]].forEach(([dt, f, k]) => {
        tone(v, { t: t + dt, f, f1: f * 0.8, glide: 0.05, peak: 0.22 * k, a: 0.002, d: 0.06 });
        noise(v, { t: t + dt, type: 'bandpass', f: f * 2.2, q: 3, peak: 0.35 * k, a: 0.002, d: 0.035 });
      });
      return v.end;
    },
  },

  waveStart: {
    about: 'Store PA "ding-dong". With dads coming: a low ominous "dun... DUNNN" afterwards.',
    max: 1.8,
    variants: [
      { label: 'plain', opts: { dads: 0 } },
      { label: 'dads', opts: { dads: 4 }, max: 2.9 },
    ],
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
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

  // ---------------------------------------------------------------- interface
  select: {
    about: 'A tool is picked: a soft upward "bip".',
    max: 0.15,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      tone(v, { t, f: 880, f1: 1320, glide: 0.03, peak: 0.13, a: 0.003, d: 0.06 });
      tone(v, { t, f: 440, f1: 660, glide: 0.03, type: 'triangle', peak: 0.06, a: 0.003, d: 0.05 });
      return v.end;
    },
  },

  place: {
    about: 'A building goes down: a solid, satisfying "clunk".',
    max: 0.3,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      tone(v, { t, f: 200, f1: 85, glide: 0.08, peak: 0.28, a: 0.003, d: 0.12 });
      noise(v, { t, type: 'lowpass', f: 1400, q: 0.7, peak: 0.2, a: 0.002, d: 0.04 });
      tone(v, { t, f: 110, type: 'square', lp: 600, peak: 0.08, a: 0.003, d: 0.06 });
      return v.end;
    },
  },

  remove: {
    about: 'A building is removed: a bubbly "pop".',
    max: 0.2,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      tone(v, { t, f: 320, f1: 950, glide: 0.045, peak: 0.3, a: 0.003, d: 0.07 });
      noise(v, { t, type: 'highpass', f: 3000, q: 0.7, peak: 0.06, a: 0.002, d: 0.015 });
      return v.end;
    },
  },

  rotate: {
    about: 'Rotating a building: a quick ratchet "tik-tik-tik".',
    max: 0.15,
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      for (let i = 0; i < 3; i++) {
        noise(v, { t: t + i * 0.028, type: 'bandpass', f: 3200 - i * 300, q: 3, peak: 0.45, a: 0.002, d: 0.014 });
        tone(v, { t: t + i * 0.028, f: 1700 - i * 150, peak: 0.05, a: 0.002, d: 0.012 });
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
    play(ctx, dest, t, o = {}) {
      const v = voice(ctx, dest, o.level);
      tone(v, { t, f: 1500, f1: 1100, glide: 0.02, peak: 0.12, a: 0.002, d: 0.025 });
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
