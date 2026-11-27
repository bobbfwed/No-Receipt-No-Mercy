// Tests for the sound groups and their levels (0.3.03): every effect has a group, the settings are
// read from old saves and clamped, the speaker marks remember the last level, and a group turned
// down to 0 builds no sound at all. The audio itself is checked by tools/sound-test.html; here the
// browser's AudioContext is a stand-in that only counts. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDS, GROUP_OF } from '../src/audio/effects.js';
import {
  GROUPS, GROUP_KEYS, EFFECT_GROUPS, DEFAULTS, readSettings, settingsToSave, setLevel, toggleLevel, isOn, allMuted, clampLevel,
} from '../src/audio/groups.js';
import { createSound } from '../src/audio/sound.js';
import { built } from '../src/audio/synth.js';
import { RULES } from '../src/audio/crowd.js';

// ---------------------------------------------------------------------------------------------
// A stand-in for the browser's audio: every node and parameter accepts every call and does nothing.

function fakeParam() {
  const p = { value: 0 };
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime',
    'cancelScheduledValues', 'setValueCurveAtTime', 'cancelAndHoldAtTime']) p[m] = () => p;
  return p;
}

function fakeNode() {
  const t = { connect: (d) => d, disconnect() {}, start() {}, stop() {}, onended: null };
  return new Proxy(t, {
    get(o, k) {
      if (k in o || typeof k === 'symbol' || k === 'then') return o[k];
      return (o[k] = fakeParam()); // gain, frequency, Q, detune, threshold...
    },
  });
}

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 1;
    this.sampleRate = 8000;
    this.destination = fakeNode();
  }
  createGain() { return fakeNode(); }
  createOscillator() { return fakeNode(); }
  createBiquadFilter() { return fakeNode(); }
  createBufferSource() { return fakeNode(); }
  createWaveShaper() { return fakeNode(); }
  createDynamicsCompressor() { return fakeNode(); }
  createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n) }; }
  addEventListener() {}
  removeEventListener() {}
  resume() { return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

/** A browser's localStorage, kept in a Map. */
function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** Runs `fn` with the stand-ins in place of the browser's audio and storage, then puts things back. */
async function withBrowser(storage, fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const hadAC = globalThis.AudioContext;
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  globalThis.AudioContext = FakeAudioContext;
  try {
    return await fn();
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had);
    else delete globalThis.localStorage;
    if (hadAC) globalThis.AudioContext = hadAC; else delete globalThis.AudioContext;
  }
}

/** A session that only lets the test fire its messages. */
function fakeSession() {
  const hs = {};
  return { me: 0, state: {}, on(type, fn) { hs[type] = fn; return () => { delete hs[type]; }; }, emit: (type, m) => hs[type] && hs[type](m) };
}

const KEY = 'returnsDept.sound';

// ---------------------------------------------------------------------------------------------

test('every effect belongs to exactly one known group, and every group has effects', () => {
  for (const name of Object.keys(SOUNDS)) {
    assert.ok(GROUP_OF[name], `${name} has no group: add it to GROUP_OF in src/audio/effects.js`);
    assert.ok(EFFECT_GROUPS.includes(GROUP_OF[name]), `${name}: unknown group "${GROUP_OF[name]}"`);
  }
  for (const name of Object.keys(GROUP_OF)) assert.ok(SOUNDS[name], `GROUP_OF.${name} is not an effect`);
  for (const g of EFFECT_GROUPS) assert.ok(Object.values(GROUP_OF).includes(g), `no effect in ${g}`);
  // A crowd sound that stands in for many single ones is in the same group as they are, so one
  // slider turns down the whole crowd.
  for (const [name, rule] of Object.entries(RULES)) {
    if (rule.merge) assert.equal(GROUP_OF[rule.merge.sound], GROUP_OF[name], `${name} merges into ${rule.merge.sound}, in another group`);
  }
  // The menu's six rows, in order, with the words the player sees.
  assert.deepEqual(GROUPS.map((g) => g.label), ['Money', 'Shoppers', 'Security and machines', 'Announcements', 'Store music', "DEB's voice"]);
  for (const g of EFFECT_GROUPS) assert.ok(GROUP_KEYS.includes(g));
  // The ones the owner named.
  assert.equal(GROUP_OF.bought, 'money'); // (the owner named sales; the old factory's sale sound went in 0.4)
  assert.equal(GROUP_OF.escape, 'money');
  assert.equal(GROUP_OF.left, 'shoppers');
  assert.equal(GROUP_OF.spray, 'store');
  assert.equal(GROUP_OF.waveStart, 'events');
  assert.equal(GROUP_OF.deb, 'voice');
});

test('the defaults are everything at full under the old master volume', () => {
  const s = readSettings(null);
  assert.equal(s.volume, 0.7);
  for (const k of GROUP_KEYS) assert.equal(s[k], 1, k);
  assert.deepEqual(readSettings('rubbish'), readSettings(null));
  assert.deepEqual({ ...readSettings({}), last: undefined }, { ...DEFAULTS, last: undefined });
});

test('old saves with three switches are read as levels', () => {
  const a = readSettings({ sfx: false, music: true, voice: true, volume: 0.4 });
  assert.deepEqual([a.money, a.shoppers, a.store, a.events, a.music, a.voice, a.volume], [0, 0, 0, 0, 1, 1, 0.4]);
  const b = readSettings({ sfx: true, music: false, voice: false, volume: 0.7 });
  assert.deepEqual([b.money, b.shoppers, b.store, b.events, b.music, b.voice], [1, 1, 1, 1, 0, 0]);
  // A level saved since wins over an old switch.
  const c = readSettings({ sfx: false, money: 0.5 });
  assert.equal(c.money, 0.5);
  assert.equal(c.shoppers, 0);
  // And what is written back has no switches in it, only levels.
  const out = settingsToSave(a);
  assert.equal('sfx' in out, false);
  for (const k of ['volume', ...GROUP_KEYS]) assert.equal(typeof out[k], 'number', k);
  assert.deepEqual(readSettings(JSON.parse(JSON.stringify(out))), a);
});

test('levels are clamped to 0..1, and anything that is not a number is refused', () => {
  const s = readSettings({ money: 7, shoppers: -2, store: 'loud', events: null, music: 0.25, volume: Infinity });
  assert.deepEqual([s.money, s.shoppers, s.store, s.events, s.music, s.volume], [1, 0, 1, 1, 0.25, 0.7]);
  assert.equal(setLevel(s, 'store', 1.5), true);
  assert.equal(s.store, 1);
  assert.equal(setLevel(s, 'store', -0.1), true);
  assert.equal(s.store, 0);
  assert.equal(setLevel(s, 'store', 'abc'), false);
  assert.equal(setLevel(s, 'store', NaN), false);
  assert.equal(setLevel(s, 'nonsense', 0.5), false);
  assert.equal(s.nonsense, undefined);
  assert.equal(clampLevel('0.35'), 0.35);
  assert.equal(clampLevel(''), null);
});

test('the speaker mark mutes a row and brings back its last level', () => {
  const s = readSettings(null);
  setLevel(s, 'shoppers', 0.35);
  assert.equal(toggleLevel(s, 'shoppers'), 0);
  assert.equal(isOn(s, 'shoppers'), false);
  assert.equal(toggleLevel(s, 'shoppers'), 0.35);
  // Dragged to 0 by hand: the mark still remembers the level before.
  setLevel(s, 'money', 0.6);
  setLevel(s, 'money', 0);
  assert.equal(toggleLevel(s, 'money'), 0.6);
  // Never set at all: back to the default.
  const t = readSettings({ music: false });
  assert.equal(toggleLevel(t, 'music'), 1);
  // The remembered level is saved too.
  const back = readSettings(JSON.parse(JSON.stringify(settingsToSave(s))));
  toggleLevel(back, 'shoppers');
  assert.equal(toggleLevel(back, 'shoppers'), 0.35);
});

test('the speaker button shows muted only when the master or all six are at 0', () => {
  const s = readSettings(null);
  assert.equal(allMuted(s), false);
  for (const k of GROUP_KEYS.slice(0, 5)) setLevel(s, k, 0);
  assert.equal(allMuted(s), false);
  setLevel(s, 'voice', 0);
  assert.equal(allMuted(s), true);
  const t = readSettings({ volume: 0 });
  assert.equal(allMuted(t), true);
  assert.equal(isOn(t, 'money'), false);
});

test('the sound module reads an old save, keeps levels, and writes no switches', async () => {
  const store = fakeStorage({ [KEY]: JSON.stringify({ sfx: false, music: true, voice: false, volume: 0.5 }) });
  await withBrowser(store, () => {
    const sound = createSound();
    assert.equal(sound.get('money'), 0);
    assert.equal(sound.get('events'), 0);
    assert.equal(sound.get('voice'), 0);
    assert.equal(sound.get('music'), 1);
    assert.equal(sound.get('sfx'), false);
    assert.equal(sound.on('music'), true);
    assert.equal(sound.on('voice'), false);
    sound.set('shoppers', 0.4);
    sound.set('store', 3);
    sound.set('volume', 'loud'); // refused
    assert.equal(sound.get('store'), 1);
    assert.equal(sound.get('volume'), 0.5);
    assert.equal(sound.get('sfx'), true);
    const saved = JSON.parse(store.getItem(KEY));
    assert.equal('sfx' in saved, false);
    assert.equal(saved.shoppers, 0.4);
    assert.equal(saved.voice, 0);
    // The old switch still works for anything that uses it.
    sound.set('sfx', false);
    assert.equal(sound.get('shoppers'), 0);
    sound.set('sfx', true);
    assert.equal(sound.get('shoppers'), 0.4);
    assert.equal(sound.toggle('shoppers'), 0);
    assert.equal(sound.toggle('shoppers'), 0.4);
    sound.destroy();
  });
});

test('a group turned down to 0 builds no sound at all; turned up, it does', async () => {
  await withBrowser(fakeStorage(), () => {
    const sound = createSound();
    const ses = fakeSession();
    sound.attach(ses);
    sound.set('shoppers', 0);
    sound.unlock();
    let before = built.nodes;
    ses.emit('fx', [{ e: 'left', k: 'karen' }, { e: 'slip' }, { e: 'grab' }]);
    assert.equal(built.nodes, before, 'shoppers at 0 built audio nodes');
    sound.preview('shoppers');
    assert.equal(built.nodes, before, 'the menu sample of a silent group built audio nodes');
    // The other groups are not affected.
    ses.emit('fx', [{ e: 'bought', v: 50 }]);
    assert.ok(built.nodes > before, 'money at 1 built nothing');
    before = built.nodes;
    sound.set('shoppers', 0.5);
    ses.emit('fx', [{ e: 'left', k: 'karen' }]);
    assert.ok(built.nodes > before, 'shoppers at 0.5 built nothing');
    // DEB's blips follow her voice's level.
    sound.set('voice', 0);
    before = built.nodes;
    ses.emit('say', { mood: 'angry', text: 'Nobody hears this.' });
    assert.equal(built.nodes, before, 'DEB at 0 built her blips');
    // The master at 0 silences everything the same way.
    sound.set('voice', 1);
    sound.set('volume', 0);
    before = built.nodes;
    ses.emit('fx', [{ e: 'won' }, { e: 'bought', v: 120 }]);
    sound.preview('money');
    assert.equal(built.nodes, before, 'the master at 0 built audio nodes');
    sound.set('volume', 0.7);
    sound.preview('money');
    assert.ok(built.nodes > before, 'the money sample built nothing');
    sound.destroy();
  });
});
