// The master chain every sound goes through:
//
//   money ------\
//   shoppers ----\
//   store ------- >-- effects bus --\
//   events ------/                   >-- master (volume) -- trim -- compressor -- soft limiter --> speakers
//   voice ------/                    |
//   music bus -- music (level) -----/
//
// Each group of effects (groups.js) has its own bus, whose gain is the player's level for it
// (0.3.03), so moving a slider changes a sound that is already playing. The effects bus mutes
// everything while the page is hidden; the music bus is where sound.js ducks the music (while DEB
// talks, while the game is paused), and the music's own level comes after it, so they multiply.
//
// The compressor evens out pile-ups (twenty sales and a wave chime at once); the soft limiter after
// it is a wave-shaper that leaves normal levels untouched and rounds anything louder off below
// full scale, so the output can never clip however many sounds overlap.
// Uses only BaseAudioContext features, so the test page can build it in an OfflineAudioContext.

/**
 * The browser's compressor adds automatic make-up gain. This trim takes it back off, so sounds
 * come out at about the level the test page measures them dry (within ~10 %, measured there).
 */
const TRIM = 0.7;

/** Transfer curve of the soft limiter: straight up to 0.7, then bends smoothly towards 0.98. */
function limiterCurve() {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 4 - 2; // the shaper sees input / 2, so the curve covers -2..2
    const ax = Math.abs(x);
    const y = ax < 0.7 ? ax : 0.7 + 0.28 * Math.tanh((ax - 0.7) / 0.28);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

/** The groups with a bus of their own (the same keys as GROUPS in groups.js). */
const BUSES = ['money', 'shoppers', 'store', 'events', 'voice', 'music'];

/** Glides a gain to `v` over 50 ms, so a slider moved while a sound plays does not click. */
function glide(param, v, now) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(v, now + 0.05);
}

/**
 * Builds the chain into `out` (default: the speakers).
 * Returns { sfx, music, buses, master, setVolume(v, now), setLevel(group, v, now), disconnect() }.
 * Connect each effect to its group's bus (`buses.money`...; `sfx` itself skips the group levels)
 * and the music to `music`. `levels` gives each bus its starting level (default 1).
 */
export function createChain(ctx, out = ctx.destination, volume = 1, levels = {}) {
  const sfx = ctx.createGain();
  const music = ctx.createGain();
  const buses = {};
  for (const g of BUSES) {
    buses[g] = ctx.createGain();
    buses[g].gain.value = Number.isFinite(levels[g]) ? levels[g] : 1;
  }
  const master = ctx.createGain();
  master.gain.value = volume;
  const trim = ctx.createGain();
  trim.gain.value = TRIM;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;

  // The wave-shaper only maps -1..1, so halve the signal into it; the curve doubles it back.
  const pre = ctx.createGain();
  pre.gain.value = 0.5;
  const limiter = ctx.createWaveShaper();
  limiter.curve = limiterCurve();

  for (const g of BUSES) if (g !== 'music') buses[g].connect(sfx);
  sfx.connect(master);
  music.connect(buses.music).connect(master);
  master.connect(trim).connect(comp).connect(pre).connect(limiter).connect(out);

  const nodes = [sfx, music, ...Object.values(buses), master, trim, comp, pre, limiter];
  return {
    sfx,
    music,
    buses,
    master,
    /** Glides the master volume (0..1) to `v` over 50 ms so slider moves do not crackle. */
    setVolume(v, now = ctx.currentTime) {
      glide(master.gain, v, now);
    },
    /** Glides one group's level (0..1) the same way. */
    setLevel(group, v, now = ctx.currentTime) {
      if (buses[group]) glide(buses[group].gain, v, now);
    },
    disconnect() {
      for (const n of nodes) {
        try { n.disconnect(); } catch { /* already gone */ }
      }
    },
  };
}
