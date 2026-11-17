// Sounds for the second round of rules: the Barcode Laser, a dog peeing on security, the exhibitionist,
// the day drinker falling over, the TV Salesman's patter, a child watching his television, the
// cosplayer's foam armour, and the wreck sounds of the two newest buildings. Each is a play
// function with the same shape as the entries in effects.js (ctx, dest, t, opts) and returns the
// time it ends. They all use opts.seed the way the older sounds do: seed % shapes picks the
// version, and the pitch, length and timbre are nudged on every play.
import { voice, tone, noise, bell, brass, formant, mtof, vary, say, babble } from './synth.js';
import { thud, knock, glass } from './shoppers.js';

/** A metal clang (the same recipe as in effects.js). */
function clang(v, t, f, peak = 0.14, d = 0.35, index = 2.5) {
  bell(v, { t, f, ratio: 1.41, index, peak, d });
}

// ------------------------------------------------------------------------- Barcode Laser

/**
 * The Barcode Laser fires. It is a supermarket checkout scanner turned up far too high: a motor
 * whine climbs for about half a second while the red line "scans" (a rising buzz), then the
 * checkout BEEP, very loud, with a laser zap going away down the line and a sizzle behind it.
 * The three versions are a single beep, a quick "bi-bip" and a low-high beep. `n` (how many it
 * hit) adds sparkles: a few high ticks, and a bell when the beam went through a crowd.
 */
export function barcodeLaser(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.05);
  const charge = [0.46, 0.38, 0.52][x.shape] * x.j(0.08);
  // The motor climbing, the scanning line's buzz speeding up, and a hiss of air through the lens.
  tone(v, { t, f: 110 * p, f1: 900 * p, glide: charge, type: 'sawtooth', lp: 1800, peak: 0.1, a: 0.05, h: charge - 0.05, d: 0.03,
    vib: x.shape === 2 ? { rate: 12, depth: 60, delay: 0.1 } : undefined });
  tone(v, { t, f: 600 * p, f1: 3000 * p, glide: charge, type: 'square', lp: 3500, peak: 0.035, a: 0.05, h: charge - 0.05, d: 0.03, vib: { rate: 26, depth: 120 } });
  noise(v, { t, type: 'bandpass', f: 500, f1: 5000, glide: charge, q: 4, peak: 0.07, a: 0.08, h: charge - 0.08, d: 0.03 });
  const c = t + charge + 0.03;
  // The BEEP.
  const f = [2700, 3150, 2450][x.shape] * p;
  const beep = (at, hz, len, peak) => {
    tone(v, { t: at, f: hz, type: 'sine', peak, a: 0.002, h: len, d: 0.03 });
    tone(v, { t: at, f: hz, type: 'square', lp: 5000, peak: peak * 0.42, a: 0.002, h: len, d: 0.03 });
  };
  if (x.shape === 0) beep(c, f, 0.2, 0.28);
  else if (x.shape === 1) { beep(c, f, 0.07, 0.26); beep(c + 0.11, f * 1.26, 0.1, 0.28); }
  else { beep(c, f * 0.78, 0.08, 0.26); beep(c + 0.12, f * 1.25, 0.14, 0.28); }
  // The laser zap, a thump of air and the sizzle of the beam going away.
  tone(v, { t: c, f: 5600 * p, f1: 260, glide: 0.16, type: 'sawtooth', lp: 6500, peak: 0.13, a: 0.003, d: 0.06 });
  tone(v, { t: c, f: 80 * p, f1: 40, glide: 0.2, peak: 0.2, a: 0.003, d: 0.2 });
  noise(v, { t: c, type: 'highpass', f: 4500, q: 0.7, peak: 0.12, a: 0.004, h: 0.06, d: 0.28 });
  for (let i = 0; i < 4; i++) noise(v, { t: c + 0.05 + i * 0.06 * x.j(0.3), type: 'bandpass', f: x.between(5000, 8000), q: 4, peak: 0.08, a: 0.002, d: 0.015 });
  const n = o.n | 0;
  const sparks = Math.min(4, n - 1);
  for (let i = 0; i < sparks; i++) tone(v, { t: c + 0.14 + i * 0.055 * x.j(0.2), f: x.between(3200, 5200), type: 'triangle', peak: 0.05, a: 0.002, d: 0.08 });
  if (n >= 4) bell(v, { t: c + 0.22, f: 3900 * x.j(0.05), peak: 0.07, d: 0.35, ratio: 3.1, index: 0.6 });
  return v.end;
}

/**
 * The Barcode Laser wrecked: the casing cracks, the lens goes, and the scanner dies the way a
 * scanner does: a shattered lens and a failing beep, an error buzzer, or sad slowing beeps and steam.
 */
export function scannerWreck(v, t, x) {
  noise(v, { t, type: 'lowpass', f: 1500 * x.j(0.2), q: 0.7, peak: 0.34, a: 0.002, d: 0.12 }); // the casing
  noise(v, { t, type: 'bandpass', f: 2500 * x.j(0.1), q: 1, peak: 0.16, a: 0.002, d: 0.04 }); // plastic cracking
  tone(v, { t, f: 90 * x.j(0.12), f1: 32, glide: 0.22, peak: 0.28, a: 0.003, d: 0.28 });
  clang(v, t, 160 * x.j(0.12), 0.12, 0.5, 4);
  const beep = (at, hz, len, peak = 0.07) => tone(v, { t: at, f: hz, type: 'square', lp: 4000, peak, a: 0.003, h: len, d: 0.03 });
  if (x.shape === 0) {
    noise(v, { t: t + 0.03, type: 'highpass', f: 5000, q: 0.7, peak: 0.14, a: 0.002, d: 0.15 }); // the lens shatters
    for (let i = 0; i < 5; i++) bell(v, { t: t + 0.06 + i * x.between(0.04, 0.08), f: x.between(3000, 5200), ratio: 3.1, index: 1, peak: 0.06, d: 0.15 });
    tone(v, { t: t + 0.2, f: 2700 * x.j(0.05), f1: 700, glide: 0.45, type: 'square', lp: 3500, peak: 0.07, a: 0.004, h: 0.05, d: 0.2 }); // the beep failing
  } else if (x.shape === 1) {
    [0.14, 0.34].forEach((dt) => tone(v, { t: t + dt, f: 105 * x.j(0.06), type: 'square', lp: 900, peak: 0.11, a: 0.004, h: 0.13, d: 0.03 })); // error buzzer
    [0.58, 0.72, 0.9].forEach((dt, i) => beep(t + dt, 2700 * x.j(0.03) - i * 350, 0.03, 0.06));
  } else {
    [[2700, 0.14], [2200, 0.33], [1700, 0.58]].forEach(([hz, dt]) => beep(t + dt, hz * x.j(0.03), 0.07)); // sad slowing beeps
    noise(v, { t: t + 0.08, type: 'highpass', f: 3500 * x.j(0.15), q: 0.7, peak: 0.1, a: 0.02, h: 0.15, d: 0.25 }); // steam
    for (let i = 0; i < 3; i++) noise(v, { t: t + 0.12 + i * 0.09, type: 'bandpass', f: x.between(5000, 7500), q: 4, peak: 0.09, a: 0.002, d: 0.015 }); // sparks
  }
}

// ------------------------------------------------------------------------- a dog pees on security

/**
 * A trickle (a run of little splashes), then the machine reacts: a fizzing short-circuit, a
 * power-down whine, or a zap and a puff of smoke.
 */
export function pee(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const n = 5 + (x.r() < 0.5 ? 1 : 0);
  let at = t;
  for (let i = 0; i < n; i++) {
    noise(v, { t: at, type: 'bandpass', f: 3200 * x.j(0.2), q: 2, peak: 0.07 * x.j(0.2), a: 0.008, h: 0.02, d: 0.05 });
    if (i % 2 === 0) tone(v, { t: at + 0.01, f: 1700 * x.j(0.2), f1: 2300, glide: 0.03, peak: 0.025, a: 0.003, d: 0.035 });
    at += 0.058 * x.j(0.25);
  }
  const s = at + 0.05;
  if (x.shape === 0) {
    noise(v, { t: s, type: 'highpass', f: 5000 * x.j(0.1), q: 0.7, peak: 0.14, a: 0.005, d: 0.32 }); // fizz
    for (let i = 0; i < 4; i++) noise(v, { t: s + 0.04 + i * 0.07 * x.j(0.3), type: 'bandpass', f: x.between(4000, 7000), q: 3, peak: 0.1, a: 0.002, d: 0.015 });
  } else if (x.shape === 1) {
    tone(v, { t: s, f: 320 * x.j(0.1), f1: 40, glide: 0.5, type: 'sawtooth', lp: 900, peak: 0.09, a: 0.01, h: 0.05, d: 0.3 }); // powering down
    tone(v, { t: s, f: 1300 * x.j(0.1), f1: 180, glide: 0.4, type: 'square', lp: 2000, peak: 0.04, a: 0.01, d: 0.3 });
  } else {
    noise(v, { t: s, type: 'highpass', f: 3000, q: 0.7, peak: 0.11, a: 0.002, d: 0.04 }); // zap
    tone(v, { t: s, f: 800 * x.j(0.1), f1: 100, glide: 0.12, type: 'sawtooth', lp: 1800, peak: 0.12, a: 0.002, d: 0.12 });
    noise(v, { t: s + 0.05, type: 'highpass', f: 2800 * x.j(0.1), q: 0.5, peak: 0.07, a: 0.04, h: 0.1, d: 0.3 }); // smoke
  }
  return v.end;
}

// ------------------------------------------------------------------------- the exhibitionist

/**
 * She opens the robe and `n` men and boys stop to stare: a brassy "ta-DAAA" with a cymbal, a wolf
 * whistle, or both; with an "ooooh" from the crowd (more of them when more are watching).
 */
export function flash(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.04);
  const n = Math.max(1, o.n | 0 || 1);
  let last = t;
  if (x.shape !== 1) {
    brass(v, { t, f: mtof(72) * p, peak: 0.1, a: 0.015, h: 0.06, d: 0.05, bright: 4 });
    brass(v, { t: t + 0.14, f: mtof(79) * p, peak: 0.12, a: 0.02, h: 0.28, d: 0.2, bright: 4, vib: { rate: 5.5, depth: 18, delay: 0.1 } });
    noise(v, { t: t + 0.14, type: 'highpass', f: 7000, peak: 0.06, a: 0.003, d: 0.35 });
    last = t + 0.55;
  }
  if (x.shape !== 0) {
    const w = x.shape === 1 ? t : t + 0.5;
    tone(v, { t: w, f: 900 * p, f1: 2200 * p, glide: 0.17, peak: 0.16, a: 0.008, h: 0.1, d: 0.05, vib: { rate: 14, depth: 25, delay: 0.1 } });
    tone(v, { t: w + 0.32, f: 2200 * p, f1: 850 * p, glide: 0.28, peak: 0.16, a: 0.008, h: 0.17, d: 0.06 });
    last = w + 0.62;
  }
  // The audience: one low "ooh" per three watchers, up to two.
  const voices = Math.min(2, 1 + Math.floor((n - 1) / 3));
  for (let i = 0; i < voices; i++) {
    const f = [118, 150][i] * x.j(0.08);
    say(v, { t: t + 0.2 + i * 0.07, vowel: i ? 'ee' : 'oh', f, f1: f * 0.85, glide: 0.3, peak: 0.22, a: 0.04, h: 0.15, d: 0.15, breath: 0.15 });
  }
  return Math.max(v.end, last);
}

// ------------------------------------------------------------------------- the day drinker falls

/** A stumble, a thud on the floor and a bottle rolling away; sometimes the bottle smashes instead. */
export function fall(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.08);
  let g = t + 0.34;
  if (x.shape === 1) {
    [0, 0.1, 0.17].forEach((dt) => noise(v, { t: t + dt, type: 'bandpass', f: 700 * x.j(0.15), q: 1, peak: 0.14, a: 0.004, d: 0.04 }));
    say(v, { t: t + 0.2, vowel: 'uh', f: 130 * p, f1: 80 * p, peak: 0.35, a: 0.01, h: 0.05, d: 0.08 }); // "oof"
    g = t + 0.3;
  } else {
    say(v, { t, vowel: x.shape === 0 ? 'oh' : 'ah', f: 240 * p, f1: 130 * p, glide: 0.22, peak: 0.3, a: 0.02, h: 0.05, d: 0.1 }); // "whoa..."
  }
  thud(v, g, 0.4, 100 * p);
  const b = g + 0.1;
  if (x.shape === 2) {
    noise(v, { t: b, type: 'highpass', f: 4000, q: 0.7, peak: 0.28, a: 0.002, d: 0.15 }); // the bottle breaks
    for (let i = 0; i < 3; i++) glass(v, b + 0.03 + i * x.between(0.04, 0.09), x.between(2600, 4600), 0.06);
    say(v, { t: g + 0.18, vowel: 'ah', f: 200 * p, f1: 110 * p, glide: 0.2, peak: 0.25, a: 0.02, h: 0.04, d: 0.1 }); // "aw..."
  } else {
    noise(v, { t: b, type: 'lowpass', f: 700, q: 0.7, peak: 0.07, a: 0.05, h: 0.3, d: 0.1 }); // rolling
    let at = b;
    let gap = 0.07;
    for (let i = 0; i < 5; i++) { glass(v, at, x.between(1600, 2500), 0.05); at += gap; gap *= 1.35; }
  }
  return v.end;
}

// ------------------------------------------------------------------------- the TV Salesman

/**
 * He pitches a shopper. 'stop': a snatch of fast patter (with a knife "shing" or a barbecue sizzle
 * now and then). 'rush': a "no thanks" swish and quick footsteps. Tiny and short, because a busy
 * store has several a second.
 */
export function pitch(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  if (o.r === 'rush') {
    noise(v, { t, type: 'bandpass', f: 500 * x.j(0.2), f1: 3000, glide: 0.1, q: 2, peak: 0.1, a: 0.01, d: 0.05 });
    if (x.shape === 0) {
      babble(v, { scale: 1.1, sylls: [
        { t: t + 0.03, len: 0.05, f: 240 * x.j(0.1), vowel: 'uh', peak: 0.28 },
        { t: t + 0.1, len: 0.09, f: 270 * x.j(0.1), f1: 210, vowel: 'ah', peak: 0.3 },
      ] });
    } else if (x.shape === 1) {
      for (let i = 0; i < 3; i++) noise(v, { t: t + 0.06 + i * 0.05, type: 'bandpass', f: 1800, q: 2, peak: 0.1, a: 0.002, d: 0.02 }); // quick footsteps
    } else {
      noise(v, { t: t + 0.05, type: 'highpass', f: 4000, q: 0.7, peak: 0.1, a: 0.002, d: 0.012 }); // "tsk"
      say(v, { t: t + 0.09, vowel: 'mm', scale: 1.1, f: 230 * x.j(0.1), f1: 190, peak: 0.25, a: 0.01, h: 0.03, d: 0.05 });
    }
    return v.end;
  }
  const n = 3 + (x.shape === 2 ? 1 : 0);
  const sylls = [];
  let s = t;
  for (let i = 0; i < n; i++) {
    const len = x.between(0.035, 0.055);
    sylls.push({ t: s, len, f: 165 * x.j(0.18), vowel: x.pick(['ah', 'eh', 'ee', 'ih', 'oh']), peak: 0.26 });
    s += len + x.between(0.008, 0.02);
  }
  babble(v, { sylls, scale: 1.05 });
  if (x.shape === 1) tone(v, { t: s, f: 4800 * x.j(0.1), type: 'triangle', peak: 0.04, a: 0.002, d: 0.08 }); // knife "shing"
  if (x.shape === 2) noise(v, { t: t + 0.05, type: 'highpass', f: 5500, q: 0.7, peak: 0.03, a: 0.02, h: 0.1, d: 0.08 }); // barbecue sizzle
  return v.end;
}

/** A runaway child stops for the salesman's television: a short cartoon jingle sting. */
export function kidtv(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.03);
  if (x.shape === 0) {
    [79, 83, 86, 91, 86].forEach((m, i) => bell(v, { t: t + i * 0.07, f: mtof(m) * p, peak: 0.11, d: 0.18, ratio: 3, index: 0.3 }));
    tone(v, { t: t + 0.38, f: 500 * p, f1: 900, glide: 0.1, peak: 0.1, a: 0.005, d: 0.1, vib: { rate: 16, depth: 80 } }); // boing
  } else if (x.shape === 1) {
    const tune = [[72, 0.08], [76, 0.08], [79, 0.08], [76, 0.08], [84, 0.2]];
    let s = t;
    const sylls = tune.map(([m, len]) => { const sy = { t: s, len, f: mtof(m + 12) * p, vowel: 'ah', peak: 0.26 }; s += len + 0.015; return sy; });
    babble(v, { sylls, scale: 1.5 }); // a bouncy "da-da-da-da-DAA"
  } else {
    [72, 76, 79, 84, 79, 84].forEach((m, i, a) => {
      const last = i === a.length - 1;
      tone(v, { t: t + i * 0.06, f: mtof(m) * p, type: 'square', lp: 2400, peak: 0.06, a: 0.004, h: last ? 0.12 : 0.02, d: last ? 0.15 : 0.03, vib: last ? { rate: 8, depth: 30, delay: 0.05 } : undefined });
    });
  }
  return v.end;
}

// ------------------------------------------------------------------------- the cosplayer

/** The cosplayer soaks up shots: a dull foam "bonk" or a quick force-field hum. Quiet and short. */
export function shield(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.12);
  if (x.shape === 1) {
    tone(v, { t, f: 330 * p, type: 'sine', peak: 0.09, a: 0.02, h: 0.08, d: 0.12, vib: { rate: 22, depth: 45 } });
    tone(v, { t, f: 495 * p, type: 'triangle', peak: 0.04, a: 0.02, h: 0.06, d: 0.1 });
    return v.end;
  }
  tone(v, { t, f: 230 * p, f1: 90 * p, glide: 0.09, peak: 0.22, a: 0.003, d: 0.1 });
  noise(v, { t, type: 'lowpass', f: 420 * x.j(0.2), q: 0.7, peak: 0.13, a: 0.002, d: 0.05 });
  if (x.shape === 2) tone(v, { t: t + 0.06, f: 950 * p, f1: 600, glide: 0.06, type: 'triangle', peak: 0.04, a: 0.004, d: 0.05 }); // foam squeak
  return v.end;
}

// ------------------------------------------------------------------------- the TV Salesman wrecked

/** A television imploding: the glass cracks, a "fwump" of air, the tube whining down, sparks. */
export function tvWreck(v, t, x) {
  const G = [[3500, 1500, 4200, 0.35], [2200, 2600, 2000, 0.6], [5000, 800, 7000, 0.2]][x.shape];
  noise(v, { t, type: 'highpass', f: G[0] * x.j(0.15), q: 0.7, peak: 0.4, a: 0.002, d: 0.1 }); // the screen cracks
  noise(v, { t: t + 0.02, type: 'lowpass', f: G[1], f1: 200, glide: 0.12, q: 0.7, peak: 0.4, a: 0.004, d: 0.1 }); // fwump
  tone(v, { t: t + 0.02, f: 140 * x.j(0.12), f1: 40, glide: 0.15, peak: 0.3, a: 0.003, d: 0.2 });
  tone(v, { t: t + 0.05, f: G[2] * x.j(0.1), f1: 300, glide: G[3], peak: 0.05, a: 0.005, h: 0.1, d: 0.12 }); // the tube whines down
  if (x.shape === 0) {
    for (let i = 0; i < 4; i++) noise(v, { t: t + 0.12 + i * 0.07 * x.j(0.3), type: 'highpass', f: 6000, q: 0.7, peak: 0.1, a: 0.002, d: 0.025 }); // sparks
  } else if (x.shape === 1) {
    for (let i = 0; i < 4; i++) bell(v, { t: t + 0.08 + i * x.between(0.05, 0.1), f: x.between(3000, 5000), ratio: 3.1, index: 1, peak: 0.06, d: 0.15 }); // glass tinkling
  } else {
    noise(v, { t: t + 0.12, type: 'highpass', f: 2000, q: 0.5, peak: 0.14, a: 0.005, h: 0.2, d: 0.15 }); // static
    tone(v, { t: t + 0.12, f: 1200 * x.j(0.05), type: 'sine', peak: 0.05, a: 0.005, h: 0.18, d: 0.05 }); // a last tinny "ding"
  }
}

// ------------------------------------------------------------------------- upgrades by track

/**
 * What each track of upgrade adds to the rising "ding-ding-DING": `dmg` hits harder, `spd` whirrs,
 * `rng` pings upward, `dur` tightens a bolt. Returns when the chord should start (seconds after t).
 */
export function trackIntro(v, t, x, track, base) {
  if (track === 'dmg') {
    knock(v, t, 240 * x.j(0.1), 0.22);
    tone(v, { t, f: 150 * x.j(0.1), f1: 60, glide: 0.08, peak: 0.24, a: 0.003, d: 0.1 });
    noise(v, { t, type: 'lowpass', f: 900, q: 0.7, peak: 0.15, a: 0.002, d: 0.05 });
    tone(v, { t: t + 0.1, f: mtof(base - 12), type: 'sawtooth', lp: 500, peak: 0.07, a: 0.01, h: 0.05, d: 0.22 });
    return 0.1;
  }
  if (track === 'spd') {
    noise(v, { t, type: 'bandpass', f: 400 * x.j(0.15), f1: 3500, glide: 0.22, q: 5, peak: 0.13, a: 0.02, h: 0.1, d: 0.06 });
    tone(v, { t, f: 120 * x.j(0.1), f1: 760, glide: 0.22, type: 'sawtooth', lp: 1500, peak: 0.06, a: 0.02, h: 0.1, d: 0.06, vib: { rate: 30, depth: 60 } });
    return 0.14;
  }
  if (track === 'rng') {
    tone(v, { t, f: mtof(base + 7), f1: mtof(base + 19), glide: 0.12, peak: 0.09, a: 0.005, d: 0.18 });
    bell(v, { t: t + 0.1, f: mtof(base + 19), peak: 0.06, d: 0.3, ratio: 2, index: 0.4 });
    return 0.1;
  }
  if (track === 'dur') {
    // A bolt being tightened: slow clicks that bunch up, then a solid clunk.
    [0, 0.07, 0.125, 0.165].forEach((dt, i) => {
      noise(v, { t: t + dt, type: 'bandpass', f: (2200 - i * 150) * x.j(0.05), q: 3, peak: 0.3, a: 0.002, d: 0.014 });
      tone(v, { t: t + dt, f: 900 - i * 60, peak: 0.05, a: 0.002, d: 0.014 });
    });
    thud(v, t + 0.2, 0.2, 95);
    return 0.2;
  }
  return 0.08;
}

/** The deflating note: some buildings came back with fewer upgrades than they had. */
export function deflate(v, t, x) {
  tone(v, { t, f: mtof(76) * x.j(0.03), f1: mtof(64), glide: 0.35, type: 'triangle', peak: 0.16, a: 0.01, h: 0.12, d: 0.15, vib: { rate: 6, depth: 25, delay: 0.1 } });
  tone(v, { t, f: mtof(76) * x.j(0.03), f1: mtof(64), glide: 0.35, type: 'square', lp: 1200, peak: 0.03, a: 0.01, h: 0.12, d: 0.15 });
  return t + 0.35;
}

/** "Oof, up you get": a mom picks up the child she just caught (she has lost her cart). */
export function carryUp(v, t, x) {
  const p = x.j(0.06);
  say(v, { t, vowel: 'uh', scale: 1.15, f: 260 * p, f1: 150 * p, glide: 0.12, peak: 0.32, a: 0.01, h: 0.04, d: 0.08 });
  thud(v, t + 0.04, 0.12, 130);
  tone(v, { t: t + 0.18, f: 300 * p, f1: 620 * p, glide: 0.15, type: 'triangle', peak: 0.09, a: 0.01, h: 0.04, d: 0.08 });
}
