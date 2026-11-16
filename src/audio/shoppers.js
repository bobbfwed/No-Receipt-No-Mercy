// The noises of shoppers leaving the store: storming out with no refund (`left`), or getting one
// at the tills (`escape`). Each of the nine kinds has its own voice and a few versions of it, and
// the "super" version of each is bigger: lower, louder, and with an extra prop at the end.
//
// Each function draws into a voice `v` (see synth.js) from time `t`, with `x` the variation for
// this play (see vary() in synth.js: x.shape picks the version, x.j() jitters).
import { tone, noise, formant, say, babble, mtof } from './synth.js';

/** How many versions each kind has (the table entry's `shapes`). */
export const SHAPES = 3;

/** What each kind sounds like storming out, in plain words (for the test page): [normal, super]. */
export const LEFT_ABOUT = {
  hunter: ['Bargain Hunter: "hmph", a raspberry, or "uh... nah".', 'Doorbuster: lower and louder, then slams the glass door.'],
  clipper: ['Coupon Clipper: mutters under her breath and tears the coupon in half.', 'Extreme Couponer: the same, then the scissors come out, snip-snip.'],
  dad: ['Dad: a deep groan, a disapproving "mm-mm" or a long "pfff", and his car keys jangle.', 'Dad on a Mission: deeper, and the car is already unlocking, "bip-bip".'],
  karen: ['Karen: an indignant "ex-CUSE", "un-BE-lievable" or a sharp "hmph!", then her heels clack off.', 'Karen Supreme: "MAN-a-GER!" (falling, or rising like a threat) or "WHERE is your MAN-ager", and a stomp.'],
  scooter: ['Mobility Scooter: the motor winds down and she reverses out, "beep... beep... beep", or toots a feeble horn.', 'Turbo Scooter: the motor revs up and goes "meep meep" (or three, or squeals her tyres).'],
  teen: ['Teenager: a long bored sigh, a vocal-fry "uuugh", or "ugh, whatever".', 'Teen Influencer: a phone-camera selfie on the way out, then the sigh.'],
  mom: ['Mom and Kid: an exasperated huff and the kid whining "muuum", a "come ON", or "tsk" and a huff.', 'Soccer Mom: blows her referee\'s whistle first.'],
  blind: ['Man with Guide Dog: a gruff "hmph" and the dog barks, or whines, or the white cane taps off and the dog barks.', 'Two Guide Dogs: a big dog and a small one barking over each other.'],
  gymbro: ['Gym Bro: a deep grunt, a long "brooo" or a lifting "hup-HAH", sometimes his protein shaker rattles.', 'Roid Rager: a roar and chest thumps.'],
};

// ---------------------------------------------------------------- small props

/** One dog bark ("wuf"): a buzzy voice that drops in pitch, with a puff of air. `low` for a deep one. */
export function bark(v, t, peak = 0.5, low = 1) {
  return formant(v, { t, f: 270 * low, f1: 170 * low, glide: 0.09, type: 'sawtooth', formants: [[650 * low, 3, 1], [1400 * low, 4, 0.5]],
    breath: 0.4, peak, a: 0.006, h: 0.03, d: 0.07 });
}

/** A dull thump: a falling low tone with a puff of low noise. */
export function thud(v, t, peak = 0.3, f = 110) {
  tone(v, { t, f, f1: f * 0.4, glide: 0.1, peak, a: 0.003, d: 0.12 });
  noise(v, { t, type: 'lowpass', f: 500, q: 0.7, peak: peak * 0.6, a: 0.002, d: 0.05 });
}

/** A short electronic beep. */
function beep(v, t, f, len = 0.07, peak = 0.09) {
  tone(v, { t, f, type: 'square', lp: 2600, peak, a: 0.004, h: len, d: 0.02 });
}

/** Car keys coming out of a pocket: a few small bright clinks. */
function keys(v, t, x, n = 3, peak = 0.06) {
  for (let i = 0; i < n; i++) {
    tone(v, { t: t + i * 0.04 * x.j(0.4), f: x.between(2600, 4800), type: 'triangle', peak: peak * x.j(0.3), a: 0.002, d: 0.05 });
  }
}

/** A high heel on a shop floor: a hard little clack. */
function heel(v, t, peak = 0.2) {
  noise(v, { t, type: 'bandpass', f: 3000, q: 2, peak, a: 0.002, d: 0.025 });
  tone(v, { t, f: 1900, f1: 1400, glide: 0.02, peak: peak * 0.5, a: 0.002, d: 0.03 });
}

/** A glass shop door slammed: a thump and the glass rattling in its frame. */
function slam(v, t, peak = 0.4) {
  thud(v, t, peak, 95);
  noise(v, { t: t + 0.01, type: 'bandpass', f: 2200, q: 5, peak: peak * 0.35, a: 0.003, d: 0.14 });
}

/** A coupon torn in half: two rough bursts of bright noise. */
function rip(v, t, x, peak = 0.22) {
  noise(v, { t, type: 'bandpass', f: 2600 * x.j(0.15), f1: 4200, glide: 0.06, q: 1.2, peak, a: 0.004, d: 0.06 });
  noise(v, { t: t + 0.065, type: 'bandpass', f: 3400 * x.j(0.15), f1: 2400, glide: 0.06, q: 1.2, peak: peak * 0.8, a: 0.004, d: 0.07 });
}

/** Scissors: a metallic snip. */
function snip(v, t, peak = 0.16) {
  noise(v, { t, type: 'highpass', f: 5000, q: 0.7, peak, a: 0.002, d: 0.02 });
  tone(v, { t, f: 3600, f1: 3000, glide: 0.03, type: 'triangle', peak: peak * 0.4, a: 0.002, d: 0.04 });
}

/** A phone camera shutter: "chk-chk". */
function shutter(v, t, peak = 0.2) {
  noise(v, { t, type: 'bandpass', f: 2800, q: 1, peak, a: 0.002, d: 0.025 });
  noise(v, { t: t + 0.06, type: 'bandpass', f: 2200, q: 1, peak: peak * 0.8, a: 0.002, d: 0.035 });
}

/** A tongue "tsk". */
function tsk(v, t, peak = 0.18) {
  noise(v, { t, type: 'highpass', f: 4000, q: 0.7, peak, a: 0.002, d: 0.012 });
}

/** A woody knock (a white cane, a hammer, a plank). */
export function knock(v, t, f = 1200, peak = 0.16) {
  tone(v, { t, f, f1: f * 0.8, glide: 0.04, peak, a: 0.002, d: 0.05 });
  noise(v, { t, type: 'bandpass', f: f * 2, q: 3, peak: peak * 1.4, a: 0.002, d: 0.03 });
}

// ---------------------------------------------------------------- storming out

/**
 * Each kind of shopper giving up. `big` is the super version. Kept under about 0.6 s (super 0.95)
 * because late waves have dozens of these.
 */
const LEFT = {
  // Bargain Hunter: "hmph", a raspberry, or "uh... nah". The Doorbuster slams the door on his way out.
  hunter(v, t, x, big) {
    const p = x.j(0.08) * (big ? 0.8 : 1);
    if (x.shape === 0) {
      say(v, { t, vowel: 'mm', type: 'sawtooth', f: 170 * p, f1: 112 * p, glide: 0.2, peak: 0.5, a: 0.015, h: 0.05 * x.j(0.4), d: 0.13, breath: 0.3 });
      noise(v, { t: t + 0.02, type: 'bandpass', f: 1300, q: 0.9, peak: 0.1, a: 0.004, d: 0.08 }); // out through the nose
    } else if (x.shape === 1) {
      noise(v, { t, type: 'bandpass', f: 900 * x.j(0.2), q: 0.8, peak: 0.2, a: 0.006, h: 0.05, d: 0.08 });
      tone(v, { t, f: 34 * p, f1: 26 * p, glide: 0.18, type: 'sawtooth', lp: 800, peak: 0.4, a: 0.01, h: 0.07 * x.j(0.4), d: 0.09 });
    } else {
      babble(v, { sylls: [
        { t, len: 0.09, f: 150 * p, vowel: 'uh', peak: 0.4 },
        { t: t + 0.14 * x.j(0.15), len: 0.24, f: 165 * p, f1: 105 * p, vowel: 'ah', peak: 0.5 },
      ] });
    }
    if (big) slam(v, t + 0.42, 0.45);
  },

  // Coupon Clipper: mutters under her breath and tears up the coupon. The Extreme Couponer gets
  // the scissors out as well.
  clipper(v, t, x, big) {
    const p = x.j(0.08);
    const n = x.shape === 2 ? 6 : 4;
    if (x.shape !== 1) {
      const sylls = [];
      for (let i = 0; i < n; i++) {
        sylls.push({ t: t + i * 0.06 * x.j(0.15), len: 0.045, f: 235 * p * x.j(0.12), vowel: x.pick(['eh', 'mm', 'ih', 'uh']), peak: 0.32 });
      }
      babble(v, { sylls, scale: 1.15 });
    }
    if (x.shape !== 2) rip(v, t + (x.shape === 1 ? 0 : 0.26), x);
    if (x.shape === 1) say(v, { t: t + 0.17, vowel: 'mm', scale: 1.15, f: 265 * p, f1: 200 * p, peak: 0.45, a: 0.01, h: 0.04, d: 0.1 });
    if (big) { snip(v, t + 0.45); snip(v, t + 0.56); }
  },

  // Dad: a deep groan, a disapproving "mm-mm" or a long "pfff", and the car keys come out.
  // Dad on a Mission is already unlocking the car: "bip-bip".
  dad(v, t, x, big) {
    const p = x.j(0.07) * (big ? 0.85 : 1);
    if (x.shape === 0) {
      say(v, { t, vowel: 'uh', f: 105 * p, f1: 72 * p, glide: 0.3, peak: 0.55, a: 0.03, h: 0.1 * x.j(0.3), d: 0.15, breath: 0.25 });
    } else if (x.shape === 1) {
      babble(v, { sylls: [
        { t, len: 0.12, f: 122 * p, vowel: 'mm', peak: 0.5 },
        { t: t + 0.16, len: 0.2, f: 100 * p, f1: 86 * p, vowel: 'mm', peak: 0.55 },
      ] });
    } else {
      noise(v, { t, type: 'bandpass', f: 1000 * x.j(0.15), q: 0.7, peak: 0.16, a: 0.03, h: 0.12, d: 0.12 });
      say(v, { t: t + 0.24, vowel: 'ah', f: 112 * p, f1: 92 * p, peak: 0.42, a: 0.012, h: 0.04, d: 0.08 });
    }
    keys(v, t + 0.12 + x.r() * 0.1, x, 3 + Math.floor(x.r() * 3));
    if (big) { beep(v, t + 0.5, 2100, 0.04, 0.08); beep(v, t + 0.62, 2100, 0.04, 0.08); }
  },

  // Karen: an indignant "ex-CUSE", "un-BE-lievable" or a sharp "hmph", then her heels clack off.
  // Karen Supreme: "MAN-a-GER!" and a proper stomp.
  karen(v, t, x, big) {
    const p = x.j(0.06);
    if (big) {
      if (x.shape === 1) {
        // "WHERE is your MAN-ager", quick and rising.
        babble(v, { scale: 1.15, sylls: [
          { t, len: 0.1, f: 300 * p, vowel: 'eh', peak: 0.5 },
          { t: t + 0.11, len: 0.06, f: 280 * p, vowel: 'ih', peak: 0.35 },
          { t: t + 0.18, len: 0.06, f: 290 * p, vowel: 'er', peak: 0.35 },
          { t: t + 0.26, len: 0.13, f: 420 * p, vowel: 'ah', peak: 0.6 },
          { t: t + 0.4, len: 0.16, f: 360 * p, f1: 300 * p, vowel: 'er', peak: 0.5 },
        ] });
        [0.64, 0.8].forEach((dt) => heel(v, t + dt * x.j(0.04), 0.24));
      } else {
        // "MAN-a-GER!", falling (or, the other version, rising like a question she knows the answer to).
        const up = x.shape === 2;
        babble(v, { scale: 1.15, sylls: [
          { t, len: 0.16, f: (up ? 330 : 400) * p, f1: (up ? 340 : 440) * p, vowel: 'ah', peak: 0.6 },
          { t: t + 0.18, len: 0.09, f: 330 * p, vowel: 'eh', peak: 0.45 },
          { t: t + 0.29, len: 0.24, f: (up ? 360 : 380) * p, f1: (up ? 520 : 290) * p, vowel: 'er', peak: 0.6 },
        ] });
        [0.58, 0.68, 0.78].forEach((dt) => heel(v, t + dt * x.j(0.04), 0.24));
      }
      return;
    }
    if (x.shape === 0) {
      babble(v, { scale: 1.15, sylls: [
        { t, len: 0.08, f: 250 * p, vowel: 'eh', peak: 0.4 },
        { t: t + 0.11, len: 0.2, f: 300 * p, f1: 430 * p, vowel: 'oo', peak: 0.6 },
      ] });
    } else if (x.shape === 1) {
      babble(v, { scale: 1.15, sylls: [
        { t, len: 0.06, f: 260 * p, vowel: 'uh', peak: 0.4 },
        { t: t + 0.07, len: 0.12, f: 390 * p, vowel: 'ee', peak: 0.6 },
        { t: t + 0.2, len: 0.06, f: 300 * p, vowel: 'ih', peak: 0.4 },
        { t: t + 0.27, len: 0.1, f: 240 * p, f1: 215 * p, vowel: 'uh', peak: 0.45 },
      ] });
    } else {
      say(v, { t, vowel: 'mm', scale: 1.15, f: 310 * p, f1: 220 * p, glide: 0.14, peak: 0.5, a: 0.008, h: 0.03, d: 0.1, breath: 0.3 });
    }
    heel(v, t + 0.38 * x.j(0.05));
    heel(v, t + 0.5 * x.j(0.05), 0.16);
  },

  // Mobility Scooter: the motor winds down and she reverses out ("beep... beep"), or toots a feeble
  // horn. The Turbo Scooter revs up and goes "meep meep".
  scooter(v, t, x, big) {
    if (big) {
      const rev = x.j(0.15);
      tone(v, { t, f: 90 * rev, f1: 380 * rev, glide: 0.3, type: 'sawtooth', lp: 1200, peak: 0.2, a: 0.03, h: 0.25, d: 0.15 });
      if (x.shape === 2) {
        // A long "meeeep" and the tyres squealing away.
        noise(v, { t: t + 0.2, type: 'bandpass', f: 2600 * x.j(0.1), q: 8, peak: 0.12, a: 0.02, h: 0.2, d: 0.15 });
        tone(v, { t: t + 0.36, f: 900 * x.j(0.05), type: 'square', lp: 2400, peak: 0.08, a: 0.004, h: 0.2, d: 0.05 });
        tone(v, { t: t + 0.36, f: 1130 * x.j(0.05), type: 'square', lp: 2400, peak: 0.06, a: 0.004, h: 0.2, d: 0.05 });
        return;
      }
      const meeps = x.shape === 1 ? [0.34, 0.46, 0.58] : [0.36, 0.52];
      const k = x.j(0.06);
      meeps.forEach((dt) => {
        tone(v, { t: t + dt, f: 880 * k, f1: 1000 * k, glide: 0.05, type: 'square', lp: 2400, peak: 0.08, a: 0.004, h: 0.06, d: 0.03 });
        tone(v, { t: t + dt, f: 1100 * k, f1: 1250 * k, glide: 0.05, type: 'square', lp: 2400, peak: 0.06, a: 0.004, h: 0.06, d: 0.03 });
      });
      return;
    }
    tone(v, { t, f: 150 * x.j(0.1), f1: 70, glide: 0.4, type: 'sawtooth', lp: 700, peak: 0.18, a: 0.04, h: 0.1, d: 0.2 });
    if (x.shape === 2) {
      tone(v, { t: t + 0.18, f: 470 * x.j(0.05), type: 'square', lp: 1600, peak: 0.08, a: 0.006, h: 0.07, d: 0.04 });
      tone(v, { t: t + 0.18, f: 590 * x.j(0.05), type: 'square', lp: 1600, peak: 0.06, a: 0.006, h: 0.07, d: 0.04 });
    } else {
      const n = x.shape === 0 ? 3 : 2;
      const f = 1040 * x.j(0.03);
      for (let i = 0; i < n; i++) beep(v, t + 0.08 + i * 0.16, f);
    }
  },

  // Teenager: a long bored sigh, a vocal-fry "uuugh", or "ugh, whatever". The Teen Influencer
  // takes a selfie on the way out.
  teen(v, t, x, big) {
    const s = big ? t + 0.14 : t;
    if (big) shutter(v, t);
    const p = x.j(0.08);
    if (x.shape === 0) {
      say(v, { t: s, vowel: 'ah', f: 190 * p, f1: 130 * p, glide: 0.35, peak: 0.3, a: 0.07, h: 0.08 * x.j(0.4), d: 0.22, breath: 1.1 });
    } else if (x.shape === 1) {
      say(v, { t: s, vowel: 'uh', f: 50 * p, f1: 38 * p, glide: 0.35, peak: 0.7, a: 0.03, h: 0.15, d: 0.13 });
    } else {
      babble(v, { scale: 1.1, sylls: [
        { t: s, len: 0.1, f: 210 * p, vowel: 'uh', peak: 0.4 },
        { t: s + 0.16, len: 0.07, f: 235 * p, vowel: 'eh', peak: 0.35 },
        { t: s + 0.24, len: 0.06, f: 210 * p, vowel: 'eh', peak: 0.3 },
        { t: s + 0.31, len: 0.14, f: 180 * p, f1: 150 * p, vowel: 'er', peak: 0.35 },
      ] });
    }
  },

  // Mom with kid: an exasperated huff and the kid whining "muuum", or "come ON", or "tsk" and a
  // huff. The Soccer Mom blows her referee's whistle first.
  mom(v, t, x, big) {
    const s = big ? t + 0.3 : t;
    if (big) {
      tone(v, { t, f: 2900, type: 'sine', peak: 0.14, a: 0.01, h: 0.17, d: 0.05, vib: { rate: 28, depth: 90 } });
      noise(v, { t, type: 'bandpass', f: 2900, q: 3, peak: 0.05, a: 0.01, h: 0.17, d: 0.05 });
    }
    const p = x.j(0.07);
    if (x.shape === 1) {
      babble(v, { scale: 1.15, sylls: [
        { t: s, len: 0.09, f: 240 * p, vowel: 'uh', peak: 0.4 },
        { t: s + 0.12, len: 0.2, f: 300 * p, f1: 230 * p, vowel: 'ah', peak: 0.55 },
      ] });
      return;
    }
    if (x.shape === 2) tsk(v, s);
    const h = x.shape === 2 ? s + 0.06 : s;
    say(v, { t: h, vowel: 'ah', scale: 1.15, f: 235 * p, f1: 165 * p, glide: 0.25, peak: 0.55, a: 0.02, h: 0.03, d: 0.12 * x.j(0.2), breath: 0.6 });
    if (x.shape === 0) {
      say(v, { t: s + 0.2, vowel: 'oo', scale: 1.4, type: 'triangle', f: 520 * x.j(0.06), f1: 400, glide: 0.3, peak: 0.32, a: 0.03, h: 0.12, d: 0.1,
        vib: { rate: 7, depth: 35 } });
    }
  },

  // Man with guide dog: a gruff "hmph" and the dog barks, or whines, or the cane taps away.
  // Two guide dogs: one big bark and a small "yip yip".
  blind(v, t, x, big) {
    const p = x.j(0.07);
    if (x.shape !== 2 || big) say(v, { t, vowel: 'mm', f: 130 * p, f1: 95 * p, glide: 0.15, peak: 0.42, a: 0.02, h: 0.04, d: 0.1 });
    if (big) {
      const lo = 0.72 * x.j(0.08), hi = 1.42 * x.j(0.08);
      if (x.shape === 0) { bark(v, t + 0.16, 0.38, lo); bark(v, t + 0.24, 0.26, hi); bark(v, t + 0.38, 0.24, hi * 1.03); }
      else if (x.shape === 1) { bark(v, t + 0.14, 0.26, hi); bark(v, t + 0.24, 0.38, lo); bark(v, t + 0.31, 0.24, hi); bark(v, t + 0.42, 0.34, lo * 0.97); }
      else { bark(v, t + 0.15, 0.36, lo); bark(v, t + 0.16, 0.22, hi); tone(v, { t: t + 0.32, f: 1100 * x.j(0.08), f1: 800, glide: 0.18, peak: 0.1, a: 0.02, h: 0.06, d: 0.08, vib: { rate: 10, depth: 40 } }); }
      return;
    }
    if (x.shape === 0) bark(v, t + 0.17, 0.36, 0.8 * x.j(0.08));
    else if (x.shape === 1) tone(v, { t: t + 0.13, f: 950 * x.j(0.08), f1: 700, glide: 0.25, peak: 0.12, a: 0.03, h: 0.12, d: 0.1, vib: { rate: 9, depth: 40 } });
    else {
      knock(v, t, 1300 * x.j(0.05), 0.14);
      knock(v, t + 0.15, 1250 * x.j(0.05), 0.12);
      bark(v, t + 0.27, 0.34, 0.85 * x.j(0.08));
    }
  },

  // Gym Bro: a deep grunt, a long "brooo", or a lifting "hup-HAH", sometimes with his protein
  // shaker rattling. The Roid Rager roars and beats his chest.
  gymbro(v, t, x, big) {
    const p = x.j(0.07);
    if (big) {
      const vowel = ['ah', 'eh', 'oh'][x.shape];
      const roar = x.shape === 1 ? 0.12 : 0.2;
      say(v, { t, vowel, f: 78 * p, f1: 58 * p, glide: 0.4, peak: 0.6, a: 0.03, h: roar * x.j(0.2), d: 0.18, breath: 0.6, vib: { rate: 11 * x.j(0.2), depth: 60 } });
      const beats = x.shape === 1 ? [0.38, 0.48, 0.58, 0.68] : [0.5, 0.63];
      beats.forEach((dt, i) => thud(v, t + dt, 0.32 - i * 0.03, 85 * x.j(0.1)));
      return;
    }
    if (x.shape === 0) {
      say(v, { t, vowel: 'uh', f: 82 * p, f1: 62 * p, glide: 0.25, peak: 0.62, a: 0.015, h: 0.07, d: 0.12, breath: 0.25 });
    } else if (x.shape === 1) {
      say(v, { t, vowel: 'oh', f: 98 * p, f1: 80 * p, glide: 0.3, peak: 0.55, a: 0.03, h: 0.12, d: 0.15, breath: 0.2 });
    } else {
      babble(v, { sylls: [
        { t, len: 0.07, f: 92 * p, vowel: 'uh', peak: 0.45 },
        { t: t + 0.12, len: 0.2, f: 115 * p, f1: 82 * p, vowel: 'ah', peak: 0.6 },
      ] });
    }
    if (x.r() < 0.5) {
      for (let i = 0; i < 3; i++) noise(v, { t: t + 0.3 + i * 0.07, type: 'bandpass', f: 4200, q: 1.5, peak: 0.12, a: 0.003, d: 0.03 });
    }
  },
};

/** A shopper storms out with no refund: o.k is the kind, o.sup the super version. */
export function leftVoice(v, t, o, x) {
  (LEFT[o.k] || LEFT.hunter)(v, t, x, !!o.sup);
}

// ---------------------------------------------------------------- refunds

/**
 * A refund paid: coins tumbling and a sad "bloop", in a different order and pitch each time.
 * Dads get a smug kazoo instead; Karen a satisfied "mm-HM"; the guide dog barks. A super shopper
 * takes twice the refund: more coins and the till drawer slams.
 */
export function escapeVoice(v, t, o, x) {
  const big = !!o.sup;
  if (o.k === 'dad') {
    const kazoo = { type: 'sawtooth', formants: [[1100, 3, 1], [2500, 4, 0.5]], breath: 0.15 };
    const tunes = [[[67, 0, 0.08], [72, 0.17, 0.3]], [[67, 0, 0.05], [67, 0.11, 0.05], [72, 0.22, 0.28]], [[72, 0, 0.06], [67, 0.12, 0.06], [76, 0.26, 0.26]]];
    const tune = tunes[x.shape];
    const k = (big ? 0.5 : 1) * x.j(0.02);
    tune.forEach(([m, dt, h], i) => {
      const last = i === tune.length - 1;
      formant(v, { ...kazoo, t: t + dt, f: mtof(m) * k, peak: last ? 0.38 : 0.34, a: 0.015, h, d: last ? 0.18 : 0.05,
        vib: last ? { rate: 6, depth: 35, delay: 0.08 } : undefined });
    });
    if (big) coins(v, t + 0.55, x, 3);
    return;
  }
  const n = coins(v, t, x, (big ? 5 : 3) + Math.floor(x.r() * 2));
  const b = t + n * 0.065 + 0.04;
  if (x.shape === 2) {
    tone(v, { t: b, f: 200 * x.j(0.08), f1: 130, glide: 0.2, type: 'square', lp: 600, peak: 0.18, a: 0.01, h: 0.06, d: 0.15 }); // womp
  } else {
    tone(v, { t: b, f: 420 * x.j(0.12), f1: 140 * x.j(0.1), glide: 0.25, peak: 0.24, a: 0.01, d: 0.26 }); // bloop
    if (x.shape === 1) tone(v, { t: b + 0.14, f: 300 * x.j(0.1), f1: 110, glide: 0.2, peak: 0.16, a: 0.01, d: 0.18 });
  }
  if (o.k === 'blind') bark(v, b + 0.02, 0.35);
  if (o.k === 'karen') {
    babble(v, { scale: 1.15, sylls: [
      { t: b, len: 0.1, f: 250 * x.j(0.05), vowel: 'mm', peak: 0.45 },
      { t: b + 0.13, len: 0.16, f: 330 * x.j(0.05), f1: 360, vowel: 'mm', peak: 0.5 },
    ] });
  }
  if (big) {
    noise(v, { t: b + 0.2, type: 'bandpass', f: 1500, q: 1, peak: 0.25, a: 0.003, d: 0.06 }); // the drawer
    tone(v, { t: b + 0.2, f: 2093, type: 'triangle', peak: 0.12, a: 0.002, d: 0.25 });
  }
}

/** Coins tumbling down a pentatonic scale, skipping notes at random. Returns how many. */
function coins(v, t, x, n) {
  const scale = [72, 74, 76, 79, 81, 84, 86, 88];
  let i = scale.length - 1 - Math.floor(x.r() * 2);
  for (let c = 0; c < n; c++) {
    tone(v, { t: t + c * 0.065 * x.j(0.2), f: mtof(scale[Math.max(0, i)]), type: 'triangle', peak: 0.19 * x.j(0.1), a: 0.003, d: 0.09 * x.j(0.2) });
    i -= 1 + Math.floor(x.r() * 2);
  }
  return n;
}

/**
 * A crowd storming out at once (played instead of more single "hmph"s when many leave together):
 * three people grumbling over each other and the automatic doors.
 */
export function walkout(v, t, x) {
  const people = [[105, 1], [150, 1], [235, 1.15]];
  people.forEach(([f0, scale], k) => {
    const sylls = [];
    let s = t + k * 0.06 + x.r() * 0.06;
    const n = 3 + Math.floor(x.r() * 3);
    for (let i = 0; i < n; i++) {
      const len = x.between(0.06, 0.13);
      sylls.push({ t: s, len, f: f0 * x.j(0.15), vowel: x.pick(['uh', 'ah', 'eh', 'mm', 'oh']), peak: 0.32 });
      s += len + x.between(0.01, 0.05);
    }
    babble(v, { sylls, scale });
  });
  noise(v, { t, type: 'bandpass', f: 600, f1: 1600, glide: 0.35, q: 0.8, peak: 0.07, a: 0.08, h: 0.1, d: 0.2 });
}
