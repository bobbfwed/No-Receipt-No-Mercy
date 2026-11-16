// Building blocks shared by every synthesized sound: envelopes, oscillators, filtered noise, bells.
//
// Everything here takes a BaseAudioContext, so the same code runs in a live AudioContext and in an
// OfflineAudioContext (tools/sound-test.html renders every sound offline to measure it).
//
// A sound is built inside a "voice": a small group of nodes feeding one output gain. The voice
// counts its sources (oscillators, noise players) and, when the last one has stopped, disconnects
// every node it made, so nothing piles up over a 30-minute game.

/** MIDI note number to frequency in Hz (69 = A4 = 440 Hz). */
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** A small seeded random generator (mulberry32): the same seed always gives the same sounds. */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The small differences between two plays of the same sound. `seed` (a whole number, from
 * opts.seed) picks one of `shapes` versions of the sound (seed % shapes, so seeds 0, 1, 2...
 * go through every version in turn: the test page relies on that) and drives the jitter.
 *   x.shape        which version to play
 *   x.r()          a random number 0..1
 *   x.j(amt)       a factor near 1: 1 +- amt
 *   x.between(a,b) a number between a and b
 *   x.pick(list)   one item of a list
 */
export function vary(seed, shapes = 1) {
  const s = (seed ?? 0) >>> 0;
  // Mixed up, so neighbouring seeds do not give neighbouring jitter.
  const r = rng(Math.imul(s + 1, 2654435761) ^ 0x5bd1e995);
  return {
    shape: shapes > 1 ? s % shapes : 0,
    r,
    j: (amt) => 1 + (r() * 2 - 1) * amt,
    between: (a, b) => a + (b - a) * r(),
    pick: (list) => list[Math.floor(r() * list.length) % list.length],
  };
}

/** A short whole number made from a string, used as a seed (so DEB's blips match her line). */
export function hashText(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** One second of white noise per context, made once and looped by every noisy sound. */
const noiseBuffers = new WeakMap();
export function noiseBuffer(ctx) {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    const n = Math.floor(ctx.sampleRate);
    b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    const r = rng(7);
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/**
 * Audio nodes built by every voice so far. Read it before and after a sound to know what that
 * sound cost; the crowd gate (crowd.js) budgets nodes a second with it.
 */
export const built = { nodes: 0 };

/**
 * Starts a new voice: an output gain (at `level`, default 1) connected to `dest`.
 * v.node(n)            remember a node so it is disconnected when the voice ends
 * v.run(src, t0, t1)   start a source at t0 and stop it at t1 (the voice ends after the last one)
 * v.end                the latest stop time so far (the length of the sound)
 */
export function voice(ctx, dest, level = 1) {
  const nodes = [];
  let live = 0;
  let end = 0;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(dest);
  nodes.push(out);
  built.nodes++;
  const done = () => {
    if (--live > 0) return;
    for (const n of nodes) {
      try { n.disconnect(); } catch { /* already disconnected */ }
    }
    nodes.length = 0;
  };
  return {
    ctx,
    out,
    get end() { return end; },
    node(n) { nodes.push(n); built.nodes++; return n; },
    run(src, t0, t1, offset = 0) {
      nodes.push(src);
      built.nodes++;
      live++;
      src.onended = done;
      src.start(t0, offset);
      src.stop(t1);
      if (t1 > end) end = t1;
      return src;
    },
  };
}

/**
 * Volume envelope on a gain parameter: silent at t, up to `peak` in `a` seconds (never instant,
 * so no click), held for `h` seconds, then an exponential fade over `d` seconds down to -60 dB,
 * and a last 5 ms to true silence. Returns the time it reaches zero.
 */
export function env(p, t, peak, a = 0.005, h = 0, d = 0.2) {
  a = Math.max(0.002, a);
  p.setValueAtTime(0, t);
  if (peak <= 0) return t;
  p.linearRampToValueAtTime(peak, t + a);
  if (h > 0) p.setValueAtTime(peak, t + a + h);
  p.exponentialRampToValueAtTime(peak * 0.001, t + a + h + d);
  p.linearRampToValueAtTime(0, t + a + h + d + 0.005);
  return t + a + h + d + 0.005;
}

/** A filter node belonging to the voice. */
export function filter(v, type, f, q = 0.7) {
  const n = v.node(v.ctx.createBiquadFilter());
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}

/** A gain node belonging to the voice. */
export function gain(v, g) {
  const n = v.node(v.ctx.createGain());
  n.gain.value = g;
  return n;
}

/**
 * A slow wobble added to a parameter (vibrato on a detune param in cents, a "wah" on a filter
 * frequency in Hz...). Fades in after `delay` seconds so notes start clean.
 */
export function lfo(v, param, { t, end, rate = 5, depth = 10, delay = 0, type = 'sine' }) {
  const o = v.ctx.createOscillator();
  o.type = type;
  o.frequency.value = rate;
  const g = gain(v, 0);
  g.gain.setValueAtTime(0, t + delay);
  g.gain.linearRampToValueAtTime(depth, t + delay + 0.12);
  o.connect(g).connect(param);
  v.run(o, t, end);
}

/**
 * One oscillator note with an envelope.
 * { t, f, f1 (slide to this pitch), glide (slide time), type, peak, a, h, d, lp (low-pass cutoff),
 *   detune (cents), vib: {rate, depth (cents), delay}, to (node to feed, default the voice output) }
 */
export function tone(v, o) {
  const { t, f, type = 'sine', peak = 0.3, a = 0.005, h = 0, d = 0.2, to = v.out } = o;
  const ctx = v.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? a + h + d));
  if (o.detune) osc.detune.value = o.detune;
  const g = gain(v, 0);
  const end = env(g.gain, t, peak, a, h, d);
  if (o.lp) osc.connect(filter(v, 'lowpass', o.lp, o.q ?? 0.7)).connect(g);
  else osc.connect(g);
  g.connect(to);
  if (o.vib) lfo(v, osc.detune, { t, end, ...o.vib });
  v.run(osc, t, end + 0.01);
  return end;
}

/**
 * A burst of filtered noise with an envelope: hisses, whooshes, thuds, clicks, shakers.
 * { t, peak, a, h, d, type (filter type), f, f1 (filter sweep target), glide, q, offset, to }
 */
export function noise(v, o) {
  const { t, peak = 0.2, a = 0.005, h = 0, d = 0.1, type = 'bandpass', f = 1000, q = 1, to = v.out } = o;
  const ctx = v.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const flt = filter(v, type, f, q);
  flt.frequency.setValueAtTime(f, t);
  if (o.f1) flt.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? a + h + d));
  const g = gain(v, 0);
  const end = env(g.gain, t, peak, a, h, d);
  src.connect(flt).connect(g).connect(to);
  v.run(src, t, end + 0.01, o.offset ?? 0);
  return end;
}

/**
 * A struck bell or chime (two-operator FM): a sine whose pitch is wobbled very fast by a second
 * sine. The wobble fades quickly, so it starts bright and rings out pure.
 * { t, f, peak, d (ring time), ratio (modulator / carrier), index (brightness), to }
 */
export function bell(v, { t, f, peak = 0.3, d = 1, ratio = 3.5, index = 1.5, a = 0.003, to = v.out }) {
  const ctx = v.ctx;
  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f * ratio;
  const mg = gain(v, 0);
  mg.gain.setValueAtTime(f * index, t);
  mg.gain.exponentialRampToValueAtTime(f * index * 0.03, t + Math.max(0.05, d * 0.4));
  mod.connect(mg).connect(car.frequency);
  const g = gain(v, 0);
  const end = env(g.gain, t, peak, a, 0, d);
  car.connect(g).connect(to);
  v.run(car, t, end + 0.01);
  v.run(mod, t, end + 0.01);
  return end;
}

/**
 * A cheap brass note: two slightly detuned sawtooth waves through a low-pass filter that opens on
 * the attack (the "blat") and closes a little while held. `bright` sets how far it opens
 * (multiples of the pitch); `wah` adds a slow filter wobble (the sad-trombone "wah").
 * { t, f, f1, glide, peak, a, h, d, bright, wah: {rate, depth}, vib, to }
 */
export function brass(v, o) {
  const { t, f, peak = 0.2, a = 0.03, h = 0.2, d = 0.12, bright = 4, to = v.out } = o;
  const ctx = v.ctx;
  const flt = filter(v, 'lowpass', f, 1.5);
  const top = Math.min(f * bright, 9000);
  flt.frequency.setValueAtTime(f * 1.2, t);
  flt.frequency.linearRampToValueAtTime(top, t + a + 0.03);
  flt.frequency.exponentialRampToValueAtTime(Math.max(f * 1.1, top * 0.5), t + a + h + d);
  const g = gain(v, 0);
  const end = env(g.gain, t, peak, a, h, d);
  flt.connect(g).connect(to);
  for (const cents of [-7, 7]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? a + h + d));
    osc.detune.value = cents;
    osc.connect(flt);
    if (o.vib) lfo(v, osc.detune, { t, end, ...o.vib });
    v.run(osc, t, end + 0.01);
  }
  if (o.wah) lfo(v, flt.frequency, { t, end, ...o.wah });
  return end;
}

/**
 * A buzzy source through parallel band-pass "formants": cheap voice-like noises (huffs, hums,
 * grumbles) and kazoo tones. `formants` is a list of [centre Hz, Q, level]; `breath` adds a
 * little air (noise) at that fraction of the level.
 * { t, f, f1, glide, type, peak, a, h, d, formants, breath, vib, to }
 */
export function formant(v, o) {
  const { t, f, type = 'sawtooth', peak = 0.3, a = 0.01, h = 0, d = 0.2, to = v.out } = o;
  const formants = o.formants || [[700, 5, 1], [1200, 7, 0.5]];
  const ctx = v.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? a + h + d));
  const g = gain(v, 0);
  const end = env(g.gain, t, peak, a, h, d);
  for (const [ff, q, lvl] of formants) osc.connect(filter(v, 'bandpass', ff, q)).connect(gain(v, lvl)).connect(g);
  g.connect(to);
  if (o.vib) lfo(v, osc.detune, { t, end, ...o.vib });
  v.run(osc, t, end + 0.01);
  if (o.breath) {
    noise(v, { t, peak: peak * o.breath, a, h, d, type: 'bandpass', f: formants[0][0] * 1.6, q: 0.8, to });
  }
  return end;
}

/**
 * Rough vowel shapes for formant() and babble(): [centre Hz, Q, level] for a man's voice. Scale the
 * centres up (about 1.15 for a woman, 1.4 for a child) with `scale`. 'mm' is a closed-mouth hum.
 */
export const VOWELS = {
  ah: [[750, 5, 1], [1200, 7, 0.5]],
  eh: [[550, 5, 1], [1800, 8, 0.45]],
  ee: [[300, 5, 1], [2300, 9, 0.4]],
  ih: [[420, 5, 1], [2000, 8, 0.45]],
  oh: [[500, 5, 1], [850, 7, 0.5]],
  oo: [[330, 5, 1], [800, 7, 0.4]],
  uh: [[640, 4, 1], [1150, 6, 0.5]],
  er: [[480, 5, 1], [1350, 7, 0.5]],
  mm: [[260, 1.5, 1], [2200, 8, 0.12]],
};

/** One voice-like syllable: formant() with a named vowel ({ vowel, scale, ...formant options }). */
export function say(v, o) {
  const scale = o.scale || 1;
  const formants = (VOWELS[o.vowel] || VOWELS.uh).map(([f, q, l]) => [f * scale, q, l]);
  return formant(v, { ...o, formants });
}

/**
 * Muttering: several quick syllables from one buzzy source, the pitch and the vowel changing on
 * each. Costs the same handful of nodes however many syllables there are, so crowds stay cheap.
 * { sylls: [{ t, len, f, f1 (slide to), vowel, peak }...] in time order, not overlapping;
 *   type, scale (formant shift), to }
 */
export function babble(v, { sylls, type = 'sawtooth', scale = 1, to = v.out }) {
  const ctx = v.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  const f1 = filter(v, 'bandpass', 700, 5);
  const f2 = filter(v, 'bandpass', 1200, 7);
  const g2 = gain(v, 0.5);
  const g = gain(v, 0);
  osc.connect(f1).connect(g);
  osc.connect(f2).connect(g2).connect(g);
  g.connect(to);
  const p = g.gain;
  const t0 = sylls[0].t;
  p.setValueAtTime(0, t0);
  let end = t0;
  for (const s of sylls) {
    const t = Math.max(s.t, end);
    const len = Math.max(0.03, s.len);
    const [[a], [b, , lb]] = VOWELS[s.vowel] || VOWELS.uh;
    f1.frequency.setValueAtTime(a * scale, t);
    f2.frequency.setValueAtTime(b * scale, t);
    g2.gain.setValueAtTime(lb, t);
    osc.frequency.setValueAtTime(s.f, t);
    if (s.f1) osc.frequency.exponentialRampToValueAtTime(s.f1, t + len);
    const pk = s.peak ?? 0.4;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(pk, t + Math.min(0.015, len * 0.3));
    p.linearRampToValueAtTime(pk * 0.6, t + len * 0.6);
    p.linearRampToValueAtTime(0, t + len);
    end = t + len;
  }
  v.run(osc, t0, end + 0.01);
  return end;
}
