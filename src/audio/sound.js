// Sound for the whole game: effects for simulation events, interface sounds, DEB's voice and the
// store muzak. Everything is synthesized (Web Audio API and the browser's speech synthesis); there
// are no audio files.
//
//   const sound = createSound();
//   sound.attach(session)   listen to 'fx', 'say', 'review', 'report', 'players'; returns an unsubscribe
//   sound.unlock()          call from a click or key press: browsers only allow audio after one
//   sound.play(name, opts)  interface sounds: select, place, remove, rotate, nope, click, tutorial,
//                           upgrade, rebuild, chat; and the deal of the cards (0.3.01): cardDeal,
//                           cardIn {side, i}, cardSlot {i}, cardHand
//                           (opts: passed to the effect, as the simulation's events are)
//   sound.get(key) / sound.set(key, value)   levels 0..1 (0.3.03): 'volume' (the master) and the
//                           groups 'money', 'shoppers', 'store', 'events', 'music', 'voice' (see
//                           groups.js). get('sfx') is true while any of the four effect groups is
//                           above 0, and set('sfx', false) turns those four off, as the old switch did.
//   sound.on(group)         can this group (or 'sfx') be heard at all: its level and the master above 0
//   sound.toggle(key)       the speaker mark beside a slider: 0, or back to its last level above 0
//   sound.preview(group)    a short sample of the group at its level (one at a time), for the menu
//   sound.destroy()
//
// Before unlock(), and in browsers without Web Audio or speech synthesis, every call is silent and
// harmless. The effects themselves live in effects.js (one table) and shoppers.js, how crowds of
// the same sound are thinned out in crowd.js, the music in music.js, the master chain in mix.js
// and DEB's voice in speech.js.
import { SOUNDS, GROUP_OF } from './effects.js';
import { musicBar, BAR, LOOP_BARS } from './music.js';
import { createChain } from './mix.js';
import { createDebVoice } from './speech.js';
import { hashText, built } from './synth.js';
import { createGate } from './crowd.js';
import { readSettings, settingsToSave, setLevel, toggleLevel, isOn, GROUP_KEYS } from './groups.js';
import { SOUND_CHECK } from '../content/lines.js';
import { maxIn } from '../sim/index.js';

const STORE_KEY = 'returnsDept.sound';
/** The four effect groups the old "Sound effects" switch stood for (get/set 'sfx'). */
const SFX_GROUPS = ['money', 'shoppers', 'store', 'events'];
/**
 * What the menu plays when a slider is let go, so the player hears the level he set: an effect and
 * its options per group. (Music has none: it is heard anyway. DEB also says a line of SOUND_CHECK.)
 */
const SAMPLES = {
  money: ['kerching', {}],
  shoppers: ['left', { k: 'karen' }],
  store: ['spray', {}],
  events: ['waveStart', {}],
  voice: ['deb', { mood: 'smug' }],
};

/** Interface sounds play() accepts. */
const UI_SOUNDS = new Set(['select', 'place', 'remove', 'rotate', 'nope', 'click', 'tutorial', 'upgrade', 'rebuild', 'chat']);
// The deal of the cards (0.3.01): played by the deal screen from the state (src/ui/deal.js).
for (const n of ['cardDeal', 'cardIn', 'cardSlot', 'cardHand']) UI_SOUNDS.add(n);

/** Big moments: never dropped for being busy, and DEB's blips step aside for them. */
const BIG = new Set(['waveStart', 'waveEnd', 'won', 'lost', 'report', 'begun', 'bossIn', 'bossOut', 'bossEscape', 'endless']);
/** Never thinned out or dropped for being busy (rare, and they mean something). */
const VIP = new Set([...BIG, ...UI_SOUNDS, 'ready', 'side', 'gave', 'crawl', 'pep', 'pause', 'unpause']);
/** Someone else's upgrade, rebuild or gift: still heard, but quieter than your own. */
const OTHERS = 0.6;
/**
 * The host hears his own upgrade and rebuild twice: the simulation event (which knows the new
 * level or how many came back) arrives during the click, then the interface asks for its button
 * sound. Whichever comes first plays; the other, within this many seconds, is skipped.
 */
const PAIR_SECS = 1.0;
/** How far ahead the music is scheduled, and how often the scheduler wakes up (seconds). */
const LOOKAHEAD = 0.6;
const TICK_MS = 120;
/** Music level while DEB is talking. */
const DUCK = 0.45;
/** Music level while the game is paused (on top of DUCK while she talks). */
const PAUSED = 0.3;

/**
 * Did this upgrade take its track to the top level? Tracks have different tops (TUNE.maxLevel,
 * or the track's own `max`), so the rules are asked; with no track in the event, level 10.
 */
function isTop(e) {
  try {
    const top = e.t ? maxIn(e.k, e.t) : 0;
    return top > 0 ? (e.lv | 0) >= top : (e.lv | 0) >= 10;
  } catch { return false; }
}

/** The settings saved in this browser (old saves with three on/off switches are read too). */
function loadSettings() {
  try {
    const raw = globalThis.localStorage && globalThis.localStorage.getItem(STORE_KEY);
    return readSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return readSettings(null); // storage blocked or corrupt: use the defaults
  }
}

function saveSettings(s) {
  try { globalThis.localStorage && globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(settingsToSave(s))); } catch { /* ignore */ }
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
  let paused = false; // the game is paused, so the music is turned down (pauseDuck)
  const unsubs = [];

  // Crowd control (see crowd.js). The seed only makes each game's variations differ.
  const gate = createGate((Math.random() * 2147483646) | 0);
  let lastBigAt = -10;
  let session = null;       // the last attached session, for session.me
  const unpaired = { ui: { upgrade: [], rebuild: [] }, fx: { upgrade: [], rebuild: [] } };

  // Music state.
  let music = null;         // { out: GainNode, timer, nextAt, bar } while playing
  let resumeBar = 0;        // where the loop picks up again after a pause

  const running = () => !!ctx && ctx.state === 'running';

  // ------------------------------------------------------------------ effects

  /**
   * Plays one effect from the table, unless it is switched off or the crowd gate says no (too
   * soon, too many, too crowded). how.sub: a sub-kind (shopper kind...) the gate lets through if
   * it has not been heard lately; how.gain: an extra level factor.
   */
  function fire(name, opts = {}, how = {}) {
    if (destroyed || !running() || hidden) return;
    const s = SOUNDS[name];
    if (!s) return;
    // A group turned down to 0 (or the master) costs nothing: nothing is built, and it takes no
    // turn at the crowd gate, so the groups still on are thinned exactly as before.
    const group = GROUP_OF[name] || 'events';
    if (!isOn(settings, group)) return;
    const now = ctx.currentTime;
    if (name === 'deb' && now - lastBigAt < 1) return; // let the chime / fanfare be heard
    const g = gate.admit(name, now, { vip: VIP.has(name), sub: how.sub, shapes: s.shapes });
    if (!g) return;
    if (BIG.has(name)) lastBigAt = now;
    try {
      const before = built.nodes;
      const end = s.play(ctx, chain.buses[group], g.at + 0.01, { seed: g.seed, ...opts, level: g.level * (how.gain ?? 1) });
      gate.started(name, end, built.nodes - before);
    } catch { /* a sound must never break the game */ }
    if (g.merge) fire(g.merge);
  }

  /**
   * Own upgrades and rebuilds arrive both as an event and as a button sound (see PAIR_SECS).
   * Returns true if the other one was already heard, so this one should stay quiet.
   */
  function heardAlready(from, key) {
    const now = (globalThis.performance ? performance.now() : Date.now()) / 1000;
    const other = unpaired[from === 'ui' ? 'fx' : 'ui'][key];
    while (other.length && now - other[0] > PAIR_SECS) other.shift();
    if (other.length) { other.shift(); return true; }
    const mine = unpaired[from][key];
    mine.push(now);
    if (mine.length > 8) mine.shift();
    return false;
  }

  const mine = (id) => !!session && id === session.me;

  /** One tick of simulation events from the session. */
  function onFx(list) {
    if (!Array.isArray(list) || !running()) return;
    const has = (type) => list.some((e) => e && e.e === type);
    const won = has('won');
    const lost = has('lost');
    // A boss driven out sends `left` and `bossOut` in the same tick; bossOut carries the sound
    // (his splutter, the door, the cash), so his ordinary walk-out voice would only muddy it.
    const bossOut = has('bossOut');
    for (const e of list) {
      if (!e || typeof e !== 'object') continue;
      switch (e.e) {
        case 'sale': fire('sale', { kind: e.kind }, { sub: e.kind }); break;
        case 'spray': fire('spray'); break;
        case 'shot': fire('shot'); break;
        case 'escape':
          if (lost) break;
          // The boss at the tills (two refunds) is a disaster of his own, not one more refund;
          // a Pregnant Lady's baby ($5, no refund) is much less than one.
          if (e.k === 'boss') fire('bossEscape', { tier: e.tier | 0 });
          else if (e.k === 'baby') fire('babyTill');
          else if (e.k === 'pup') fire('pupTill'); // (a pregnant dog's puppy: the spayed card)
          else fire('escape', { k: e.k, sup: e.sup | 0 }, { sub: e.k });
          break;
        case 'left':
          if (e.k === 'boss' && bossOut) break;
          // A Pregnant Lady who popped: the pop carries the sound.
          if (e.k === 'preggo' && e.why === 'pop') break;
          if (e.k === 'baby') { fire('waah'); break; }
          // (The cards: a pregnant dog bursting has its litter sound; one of her puppies whimpers.)
          if (e.k === 'dog' && e.why === 'pop') break;
          if (e.k === 'pup') { fire('whimper'); break; }
          fire('left', { k: e.k, sup: e.sup | 0 }, { sub: e.k });
          break;
        case 'pop': fire(e.pup ? 'litter' : 'pop', { n: e.n | 0, sup: e.sup | 0 }); break;
        case 'nopop': fire('nopop', { sup: e.sup | 0 }); break;
        case 'release': fire('release', { n: e.n | 0 }); break;
        case 'rip': fire('rip', { n: e.n | 0, sup: e.sup | 0 }); break;
        case 'bossIn': fire('bossIn', { tier: e.tier | 0 }); break;
        case 'pep': fire('pep', { n: e.n | 0 }); break;
        case 'bossOut': fire('bossOut', { tier: e.tier | 0, bounty: e.bounty | 0 }); break;
        case 'endless': fire('endless'); break;
        case 'slip': fire('slip'); break;
        case 'grab': fire('grab'); break;
        case 'sample': fire('sample'); break;
        case 'mess': fire('mess'); break;
        case 'kid': fire(e.back ? 'wrongway' : 'kid'); break;
        // The cards that change how shoppers behave (0.3.01).
        case 'drunk': fire('drunk', { sup: e.sup | 0 }); break;
        case 'bought': fire('bought', { v: e.v | 0 }); break;
        case 'trail': fire('trail'); break;
        case 'pet': fire('pet', { n: e.n | 0 }); break;
        case 'crawl': fire('crawl'); break;
        case 'bolt': fire('bolt'); break;
        case 'caught': fire('caught', { carry: e.carry | 0 }); break;
        // The Barcode Laser fired (the building's key is still 'railgun', the event still 'rail').
        case 'rail': fire('rail', { n: e.n | 0 }); break;
        // The doors opened early and the factory's takings for the skipped time arrived at once.
        case 'early': if (e.sold > 0) fire('kerching'); break;
        case 'pee': fire('pee'); break;
        case 'flash': fire('flash', { n: e.n | 0 }); break;
        case 'fall': fire('fall'); break;
        case 'pitch': fire('pitch', { r: e.r === 'rush' ? 'rush' : 'stop' }, { sub: e.r === 'rush' ? 'rush' : 'stop' }); break;
        case 'kidtv': fire('kidtv'); break;
        case 'shield': fire('shield'); break;
        // left > 0: the building took a hit and stands (the small clang); 0: destroyed (the wreck).
        case 'smash': fire('smash', { k: e.k, left: e.left | 0 }, { sub: e.left > 0 ? 'hit' : e.k }); break;
        case 'upgraded': {
          const o = { k: e.k, t: e.t, lv: e.lv, top: isTop(e) };
          if (!mine(e.by)) fire('upgraded', o, { gain: OTHERS });
          else if (!heardAlready('fx', 'upgrade')) fire('upgraded', o);
          break;
        }
        case 'rebuilt':
          if (!mine(e.by)) fire('rebuilt', { n: e.n, short: e.short | 0 }, { gain: OTHERS });
          else if (!heardAlready('fx', 'rebuild')) fire('rebuilt', { n: e.n, short: e.short | 0 });
          break;
        case 'gave': fire('gave', { n: e.n }, { gain: mine(e.by) || mine(e.to) ? 1 : OTHERS }); break;
        case 'begun': fire('begun'); break;
        // Somebody paused or resumed the game (0.3.02). The music follows by itself (pauseDuck).
        case 'pause': fire(e.on ? 'pause' : 'unpause'); pauseDuck(); break;
        case 'ready': fire('ready', { side: e.side }); break;
        case 'side': fire('side', { side: e.side }); break;
        case 'waveStart': fire('waveStart', { dads: e.dads | 0, boss: e.boss | 0 }); break;
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
    if (isOn(settings, 'voice') && unlocked && !hidden && !destroyed) speak(text);
  }

  /** DEB speaks a line at the master volume times her own level, ducking the music meanwhile. */
  function speak(text) {
    speech.say(text, settings.volume * settings.voice, { onStart: () => setDuck(true), onEnd: () => setDuck(false) });
  }

  // ------------------------------------------------------------------ music

  /**
   * The music's duck: lowered while DEB talks, and further while the game is paused. (The player's
   * own level for the music is the next gain along, chain.buses.music, so the two multiply.)
   */
  const musicLevel = () => (talking ? DUCK : 1) * (paused ? PAUSED : 1);

  /** Moves the music toward its level, with this time constant (seconds). */
  function applyMusicLevel(tc) {
    if (!chain || !ctx) return;
    const p = chain.music.gain;
    const now = ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.setTargetAtTime(musicLevel(), now, tc);
  }

  function setDuck(on) {
    talking = on;
    applyMusicLevel(on ? 0.08 : 0.3);
  }

  /**
   * The store's muzak is the only sound that loops, and it sinks to a murmur while the game is
   * paused (0.3.02). Asked on every pause event and every time the music is scheduled, so a game
   * joined or resumed from a save while paused is quiet too.
   */
  function pauseDuck() {
    const now = !!session?.state?.pause;
    if (now === paused) return;
    paused = now;
    applyMusicLevel(0.15);
  }

  function scheduleMusic() {
    pauseDuck();
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
    // (Turned down to 0, the music is not scheduled at all, so it costs nothing.)
    const want = isOn(settings, 'music') && running() && !hidden && !destroyed;
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
    p.linearRampToValueAtTime(hidden ? 0 : 1, now + 0.05);
    chain.setVolume(settings.volume, now);
    for (const g of GROUP_KEYS) chain.setLevel(g, settings[g], now);
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
        chain = createChain(ctx, ctx.destination, settings.volume, settings);
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

  function play(name, opts) {
    if (!UI_SOUNDS.has(name)) return;
    if ((name === 'upgrade' || name === 'rebuild') && heardAlready('ui', name)) return;
    fire(name, opts && typeof opts === 'object' ? opts : {});
  }

  function get(key) {
    if (key === 'sfx') return SFX_GROUPS.some((k) => settings[k] > 0);
    return settings[key];
  }

  /** After any level changed: save, move the buses, start or stop the music, hush DEB if muted. */
  function changed() {
    saveSettings(settings);
    applyBuses();
    updateMusic();
    if (!isOn(settings, 'voice')) {
      speech.cancel();
      if (talking) setDuck(false);
    }
  }

  function set(key, value) {
    if (typeof value === 'boolean') {
      // The old on/off switches ('sfx' stood for every effect): on puts a group back to its last level.
      const keys = key === 'sfx' ? SFX_GROUPS : key === 'music' || key === 'voice' ? [key] : null;
      if (!keys) return;
      for (const k of keys) setLevel(settings, k, value ? (settings.last[k] || 1) : 0);
    } else if (!setLevel(settings, key, value)) {
      return;
    }
    changed();
  }

  function toggle(key) {
    const v = toggleLevel(settings, key);
    changed();
    return v;
  }

  // ------------------------------------------------------------------ samples for the menu

  let sample = null; // { out, timer, spoke } while a sample from preview() is playing
  let checkLine = 0;

  /** Cuts the sample that is playing short (quickly, without a click). */
  function stopSample() {
    if (!sample) return;
    const s = sample;
    sample = null;
    clearTimeout(s.timer);
    if (s.spoke) speech.cancel();
    if (!s.out || !ctx) return;
    try {
      const now = ctx.currentTime;
      s.out.gain.cancelScheduledValues(now);
      s.out.gain.setValueAtTime(s.out.gain.value, now);
      s.out.gain.linearRampToValueAtTime(0, now + 0.03);
    } catch { /* ignore */ }
    setTimeout(() => { try { s.out.disconnect(); } catch { /* ignore */ } }, 80);
  }

  /**
   * Plays a short sample of one group at its level, through its own bus, so the player hears what
   * he has just set. Only ever one at a time: a new one cuts the last one off. It skips the crowd
   * gate (it is not a game event) but not the levels: a group at 0 plays nothing.
   */
  function preview(group) {
    if (destroyed) return;
    stopSample();
    if (!isOn(settings, group)) return;
    const pick = SAMPLES[group];
    const s = { out: null, timer: 0, spoke: false };
    if (group === 'voice' && unlocked && speech.available) {
      speak(SOUND_CHECK[checkLine++ % SOUND_CHECK.length]);
      s.spoke = true;
    }
    if (pick && ctx && chain && ctx.state !== 'closed') {
      try {
        s.out = ctx.createGain();
        s.out.connect(chain.buses[group]);
        const t = ctx.currentTime + 0.02;
        const end = SOUNDS[pick[0]].play(ctx, s.out, t, { seed: (Math.random() * 2147483646) | 0, ...pick[1] });
        s.timer = setTimeout(() => {
          if (sample === s) sample = null;
          try { s.out.disconnect(); } catch { /* ignore */ }
        }, Math.max(0, end - t) * 1000 + 400);
      } catch { /* a sound must never break the game */ }
    }
    sample = s;
  }

  function attach(ses) {
    if (!ses || typeof ses.on !== 'function') return () => {};
    session = ses; // for session.me: whose upgrade, rebuild or gift an event is
    const offs = [
      ses.on('fx', onFx),
      ses.on('say', onSay),
      ses.on('review', (m) => fire('review', { stars: m && m.stars, kind: m && m.kind })),
      ses.on('report', () => fire('report')),
      ses.on('players', () => fire('players')),
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
    stopSample();
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

  const on = (group) => isOn(settings, group);

  return { attach, unlock, play, get, set, on, toggle, preview, destroy };
}
