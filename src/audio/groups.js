// The sound groups a player can turn up or down on his own (0.3.03), and how his settings are read
// and kept. No audio code here, so the tests run it in Node and the sound menu (src/ui/hud.js)
// can load it without starting any sound.
//
// Every effect belongs to one group (GROUP_OF in effects.js, beside the table of effects). Each
// group has its own level from 0 to 1, on top of the overall Volume (`volume`), which stays the
// master. The settings live in the player's own browser (localStorage), never in the game state.

/** The groups, in the order the sound menu lists them, with the words the player sees. */
export const GROUPS = [
  { key: 'money', label: 'Money' },
  { key: 'shoppers', label: 'Shoppers' },
  { key: 'store', label: 'Security and machines' },
  { key: 'events', label: 'Announcements' },
  { key: 'music', label: 'Store music' },
  { key: 'voice', label: "DEB's voice" },
];
export const GROUP_KEYS = GROUPS.map((g) => g.key);
/** The groups the effects table uses (music is the loop in music.js; DEB's blips go with his voice). */
export const EFFECT_GROUPS = ['money', 'shoppers', 'store', 'events', 'voice'];
/** The four that the old "Sound effects" box switched on and off. */
const OLD_SFX = ['money', 'shoppers', 'store', 'events'];

/**
 * The settings as they are out of the box: everything at full, the master at 0.7 (as before
 * 0.3.03). With these every sound comes out exactly as it did before the groups existed.
 */
export const DEFAULTS = Object.freeze({ volume: 0.7, money: 1, shoppers: 1, store: 1, events: 1, music: 1, voice: 1 });
/** Every key a level can be set for. */
export const LEVEL_KEYS = ['volume', ...GROUP_KEYS];

/** A level from anything: a number clamped to 0..1, or null if it is not a number at all. */
export function clampLevel(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

/**
 * The settings from what was saved (the parsed JSON, or anything else, which gives the defaults).
 * Saves from before 0.3.03 held three switches: `sfx: false` turns the four effect groups off,
 * `music: false` the music and `voice: false` DEB's voice. A level saved since wins over them.
 * `last` remembers each level's last setting above zero, for the speaker marks in the menu.
 */
export function readSettings(saved) {
  const s = { ...DEFAULTS, last: {} };
  if (!saved || typeof saved !== 'object') return s;
  if (saved.sfx === false) for (const k of OLD_SFX) s[k] = 0;
  for (const k of LEVEL_KEYS) {
    const v = saved[k];
    if (typeof v === 'boolean') { if (k === 'music' || k === 'voice') s[k] = v ? 1 : 0; continue; }
    const n = clampLevel(v);
    if (n !== null) s[k] = n;
  }
  if (saved.last && typeof saved.last === 'object') {
    for (const k of LEVEL_KEYS) {
      const n = clampLevel(saved.last[k]);
      if (n !== null && n > 0) s.last[k] = n;
    }
  }
  return s;
}

/** What is written to the browser: the levels and the remembered ones, never the old switches. */
export function settingsToSave(s) {
  const out = {};
  for (const k of LEVEL_KEYS) out[k] = s[k];
  out.last = { ...s.last };
  return out;
}

/** Sets one level (clamped); returns false if the key or value is not one. */
export function setLevel(s, key, value) {
  if (!LEVEL_KEYS.includes(key)) return false;
  const n = clampLevel(value);
  if (n === null) return false;
  s[key] = n;
  if (n > 0) s.last[key] = n;
  return true;
}

/**
 * The speaker mark beside a row: at 0 it goes back to the last level it had above 0 (or the
 * default), otherwise to 0. Returns the new level.
 */
export function toggleLevel(s, key) {
  if (!LEVEL_KEYS.includes(key)) return 0;
  if (s[key] > 0) {
    s.last[key] = s[key];
    s[key] = 0;
  } else {
    s[key] = s.last[key] > 0 ? s.last[key] : DEFAULTS[key];
  }
  return s[key];
}

/** True if this group (or 'sfx': any of the four effect groups) can be heard at all. */
export function isOn(s, group) {
  if (!(s.volume > 0)) return false;
  if (group === 'sfx') return OLD_SFX.some((k) => s[k] > 0);
  return s[group] > 0;
}

/** The speaker button shows muted only when the master is 0 or every group is. */
export function allMuted(s) {
  return !(s.volume > 0) || GROUP_KEYS.every((k) => !(s[k] > 0));
}
