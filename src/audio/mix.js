// The master chain every sound goes through:
//
//   effects bus --\
//                  >-- master (volume) -- trim -- compressor -- soft limiter --> speakers
//   music bus ----/
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

/**
 * Builds the chain into `out` (default: the speakers).
 * Returns { sfx, music, master, setVolume(v, now), disconnect() }; connect effects to `sfx` and the
 * music to `music`.
 */
export function createChain(ctx, out = ctx.destination, volume = 1) {
  const sfx = ctx.createGain();
  const music = ctx.createGain();
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

  sfx.connect(master);
  music.connect(master);
  master.connect(trim).connect(comp).connect(pre).connect(limiter).connect(out);

  const nodes = [sfx, music, master, trim, comp, pre, limiter];
  return {
    sfx,
    music,
    master,
    /** Glides the master volume (0..1) to `v` over 50 ms so slider moves do not crackle. */
    setVolume(v, now = ctx.currentTime) {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(v, now + 0.05);
    },
    disconnect() {
      for (const n of nodes) {
        try { n.disconnect(); } catch { /* already gone */ }
      }
    },
  };
}
