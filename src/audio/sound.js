// Sound for the whole game: effects for simulation events, interface sounds, DEB's voice and the
// store muzak. Everything is synthesized (Web Audio API and the browser's speech synthesis); there
// are no audio files.
//
//   const sound = createSound();
//   sound.attach(session)   listen to 'fx', 'say', 'review', 'report', 'players'; returns an unsubscribe
//   sound.unlock()          call from a click or key press: browsers only allow audio after one
//   sound.play(name)        interface sounds: select, place, remove, rotate, nope, click, tutorial
//   sound.get(key) / sound.set(key, value)   'sfx', 'music', 'voice' (booleans), 'volume' (0..1)
//   sound.destroy()
//
// Before unlock(), and in browsers without Web Audio or speech synthesis, every call is silent and
// harmless. The effects themselves live in effects.js (one table), the music in music.js, the
// master chain in mix.js and DEB's voice in speech.js.
import { SOUNDS } from './effects.js';
import { musicBar, BAR, LOOP_BARS } from './music.js';
import { createChain } from './mix.js';
import { createDebVoice } from './speech.js';
import { hashText } from './synth.js';

const STORE_KEY = 'returnsDept.sound';
const DEFAULTS = { sfx: true, music: true, voice: true, volume: 0.7 };

/** Interface sounds play() accepts. */
const UI_SOUNDS = new Set(['select', 'place', 'remove', 'rotate', 'nope', 'click', 'tutorial']);

/**
 * Shortest gap between two plays of the same sound, in seconds. Anything sooner is dropped:
 * late waves fire dozens of sprays, shots and sales a second.
 */
const MIN_GAP = {
  sale: 0.07, spray: 0.09, shot: 0.09, grab: 0.08, sample: 0.08, left: 0.08, escape: 0.12, slip: 0.15,
  deb: 0.15, review: 0.3, report: 0.5, players: 0.3, waveStart: 1, waveEnd: 1, won: 2, lost: 2,
  mess: 0.07, kid: 0.25, caught: 0.2, bolt: 0.4, smash: 0.15,
  rotate: 0.03, click: 0.03, select: 0.04, place: 0.04, remove: 0.04, nope: 0.15, tutorial: 0.2,
};

/** Big moments: never dropped for being busy, and DEB's blips step aside for them. */
const BIG = new Set(['waveStart', 'waveEnd', 'won', 'lost', 'report']);
/** At most this many effects ringing at once (big moments and interface sounds may exceed it). */
const MAX_VOICES = 14;
/** Plays of one sound within this window make each further play quieter. */
const CROWD_WINDOW = 0.5;
/** How far ahead the music is scheduled, and how often the scheduler wakes up (seconds). */
const LOOKAHEAD = 0.6;
const TICK_MS = 120;
/** Music level while DEB is talking. */
const DUCK = 0.45;

function loadSettings() {
  const s = { ...DEFAULTS };
  try {
    const raw = globalThis.localStorage && globalThis.localStorage.getItem(STORE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && typeof saved === 'object') {
      for (const k of ['sfx', 'music', 'voice']) if (typeof saved[k] === 'boolean') s[k] = saved[k];
      if (Number.isFinite(saved.volume)) s.volume = Math.max(0, Math.min(1, saved.volume));
    }
  } catch { /* storage blocked or corrupt: use the defaults */ }
  return s;
}

function saveSettings(s) {
  try { globalThis.localStorage && globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function createSound() {
  const settings = loadSettings();
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  const doc = typeof document !== 'undefined' ? document : null;
  const speech = createDebVoice();

  let ctx = null;
  let chain = null;
  let unlocked = false;
  let destroyed = false;
  let hidden = !!(doc && doc.hidden);
  let talking = false;
  const unsubs = [];

  // Rate limiting state.
  const lastAt = {};        // sound name -> ctx time of the last play
  const recent = {};        // sound name -> ctx times of plays in the last CROWD_WINDOW
  let ringing = [];         // end times of effects still sounding
  let lastBigAt = -10;

  // Music state.
  let music = null;         // { out: GainNode, timer, nextAt, bar } while playing
  let resumeBar = 0;        // where the loop picks up again after a pause

  const running = () => !!ctx && ctx.state === 'running';

  // ------------------------------------------------------------------ effects

  /** Plays one effect from the table now, unless it is switched off, rate-limited or too crowded. */
  function fire(name, opts = {}) {
    if (destroyed || !running() || !settings.sfx || hidden) return;
    const s = SOUNDS[name];
    if (!s) return;
    const now = ctx.currentTime;
    if (now - (lastAt[name] ?? -10) < (MIN_GAP[name] ?? 0.05)) return;
    ringing = ringing.filter((end) => end > now);
    const vip = BIG.has(name) || UI_SOUNDS.has(name);
    if (!vip && ringing.length >= MAX_VOICES) return;
    if (name === 'deb' && now - lastBigAt < 1) return; // let the chime / fanfare be heard
    lastAt[name] = now;
    if (BIG.has(name)) lastBigAt = now;
    // The more of the same sound in the last half second, the quieter each one.
    const r = (recent[name] ||= []);
    while (r.length && now - r[0] > CROWD_WINDOW) r.shift();
    r.push(now);
    const level = Math.max(0.35, 1 / Math.sqrt(r.length));
    try {
      const end = s.play(ctx, chain.sfx, now + 0.01, { ...opts, level });
      ringing.push(end);
    } catch { /* a sound must never break the game */ }
  }

  /** One tick of simulation events from the session. */
  function onFx(list) {
    if (!Array.isArray(list) || !running()) return;
    const has = (type) => list.some((e) => e && e.e === type);
    const won = has('won');
    const lost = has('lost');
    for (const e of list) {
      if (!e || typeof e !== 'object') continue;
      switch (e.e) {
        case 'sale': fire('sale', { kind: e.kind }); break;
        case 'spray': fire('spray'); break;
        case 'shot': fire('shot'); break;
        case 'escape': if (!lost) fire('escape', { k: e.k }); break;
        case 'left': fire('left', { k: e.k }); break;
        case 'slip': fire('slip'); break;
        case 'grab': fire('grab'); break;
        case 'sample': fire('sample'); break;
        case 'mess': fire('mess'); break;
        case 'kid': fire('kid'); break;
        case 'caught': fire('caught'); break;
        case 'bolt': fire('bolt'); break;
        case 'smash': fire('smash'); break;
        case 'waveStart': fire('waveStart', { dads: e.dads | 0 }); break;
        case 'waveEnd': if (!won) fire('waveEnd'); break;
        case 'won': fire('won'); break;
        case 'lost': fire('lost'); break;
        default: break; // placed / removed: the interface plays its own build sounds
      }
    }
  }

  function onSay(m) {
    if (!m) return;
    const text = String(m.text ?? '');
    fire('deb', { mood: m.mood, seed: hashText(text) });
    if (settings.voice && unlocked && !hidden && !destroyed) {
      speech.say(text, settings.volume, { onStart: () => setDuck(true), onEnd: () => setDuck(false) });
    }
  }

  // ------------------------------------------------------------------ music

  function setDuck(on) {
    talking = on;
    if (!chain || !ctx) return;
    const p = chain.music.gain;
    const now = ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.setTargetAtTime(on ? DUCK : 1, now, on ? 0.08 : 0.3);
  }

  function scheduleMusic() {
    if (!music || !running()) return;
    const now = ctx.currentTime;
    // If the page stalled and we fell behind, pick up from now instead of firing a burst of bars.
    if (music.nextAt < now) music.nextAt = now + 0.05;
    while (music.nextAt < now + LOOKAHEAD) {
      try { musicBar(ctx, music.out, music.nextAt, music.bar); } catch { /* ignore */ }
      music.nextAt += BAR;
      music.bar = (music.bar + 1) % LOOP_BARS;
    }
  }

  function startMusic() {
    const out = ctx.createGain();
    const now = ctx.currentTime;
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(1, now + 0.6);
    out.connect(chain.music);
    music = { out, timer: setInterval(scheduleMusic, TICK_MS), nextAt: now + 0.08, bar: resumeBar };
    scheduleMusic();
  }

  function stopMusic() {
    if (!music) return;
    const m = music;
    music = null;
    clearInterval(m.timer);
    resumeBar = m.bar;
    if (!ctx) return;
    // Fade out, then cut the run off. Notes already scheduled play into a silent, disconnected
    // node and clean themselves up when they end (at most a bar later).
    const now = ctx.currentTime;
    try {
      m.out.gain.cancelScheduledValues(now);
      m.out.gain.setValueAtTime(m.out.gain.value, now);
      m.out.gain.linearRampToValueAtTime(0, now + 0.3);
    } catch { /* ignore */ }
    setTimeout(() => { try { m.out.disconnect(); } catch { /* ignore */ } }, 400);
  }

  /** Starts or stops the music to match the settings, the page visibility and the context. */
  function updateMusic() {
    const want = settings.music && running() && !hidden && !destroyed;
    if (want && !music) startMusic();
    else if (!want && music) stopMusic();
  }

  // ------------------------------------------------------------------ buses and settings

  function applyBuses() {
    if (!chain || !ctx) return;
    const now = ctx.currentTime;
    const p = chain.sfx.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(settings.sfx && !hidden ? 1 : 0, now + 0.05);
    chain.setVolume(settings.volume, now);
  }

  function onVisibility() {
    hidden = !!(doc && doc.hidden);
    applyBuses();
    updateMusic();
  }
  if (doc) doc.addEventListener('visibilitychange', onVisibility);

  function onState() {
    updateMusic();
  }

  function unlock() {
    if (destroyed) return;
    unlocked = true;
    if (!AC) return;
    try {
      if (!ctx) {
        ctx = new AC({ latencyHint: 'interactive' });
        chain = createChain(ctx, ctx.destination, settings.volume);
        applyBuses();
        ctx.addEventListener && ctx.addEventListener('statechange', onState);
      }
      if (ctx.state !== 'running' && ctx.state !== 'closed') {
        const p = ctx.resume();
        if (p && p.then) p.then(updateMusic, () => {});
      }
    } catch {
      ctx = null;
      chain = null;
    }
    updateMusic();
  }

  function play(name) {
    if (UI_SOUNDS.has(name)) fire(name);
  }

  function get(key) {
    return settings[key];
  }

  function set(key, value) {
    if (key === 'volume') {
      const v = Number(value);
      if (!Number.isFinite(v)) return;
      settings.volume = Math.max(0, Math.min(1, v));
    } else if (key === 'sfx' || key === 'music' || key === 'voice') {
      settings[key] = !!value;
    } else {
      return;
    }
    saveSettings(settings);
    applyBuses();
    updateMusic();
    if (key === 'voice' && !settings.voice) {
      speech.cancel();
      if (talking) setDuck(false);
    }
  }

  function attach(session) {
    if (!session || typeof session.on !== 'function') return () => {};
    const offs = [
      session.on('fx', onFx),
      session.on('say', onSay),
      session.on('review', (m) => fire('review', { stars: m && m.stars, kind: m && m.kind })),
      session.on('report', () => fire('report')),
      session.on('players', () => fire('players')),
    ];
    const off = () => {
      for (const f of offs.splice(0)) {
        try { f(); } catch { /* ignore */ }
      }
    };
    unsubs.push(off);
    return off;
  }

  function destroy() {
    if (destroyed) return;
    for (const off of unsubs.splice(0)) off();
    stopMusic();
    destroyed = true;
    speech.destroy();
    if (doc) doc.removeEventListener('visibilitychange', onVisibility);
    if (ctx) {
      try { ctx.removeEventListener && ctx.removeEventListener('statechange', onState); } catch { /* ignore */ }
      try { chain.disconnect(); } catch { /* ignore */ }
      try { const p = ctx.close(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
    }
    ctx = null;
    chain = null;
  }

  return { attach, unlock, play, get, set, destroy };
}
