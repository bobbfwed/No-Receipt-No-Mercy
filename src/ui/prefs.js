// The player's own choices about what the screen shows (0.4, the owner's interface clean-up):
// whether customer reviews pop up, whether picking a building opens its information card, which of
// the three panels at the top left are folded, and whether a phone's building sheet shows its
// details. Kept in the player's browser the way the sound levels and the folded card are
// (localStorage, one key, quietly forgotten in a private window), never in the game state: each
// player chooses for himself.
//
// Pure apart from the storage it is handed, so the tests run it in Node with a stand-in.

export const PREFS_KEY = 'returns-dept.screen';

/** How the game comes. */
export const PREF_DEFAULTS = Object.freeze({
  reviews: true, // customer reviews pop up at the top right
  cards: true, // picking a building or tool opens its information card
  sheetMore: false, // a phone's building sheet shows its numbers and stock rows
  fold: Object.freeze({ players: false, hand: false, pay: false }), // the top left panels on a big screen
});

/** The panels that fold, in the order they stand in the column. */
export const FOLDS = ['players', 'hand', 'pay'];

/** Reads the saved choices, falling back to the defaults for anything missing or odd. */
export function readPrefs(store) {
  let raw = null;
  try { raw = JSON.parse(store?.getItem(PREFS_KEY) || 'null'); } catch { raw = null; }
  const o = raw && typeof raw === 'object' ? raw : {};
  const bool = (v, d) => (typeof v === 'boolean' ? v : d);
  const f = o.fold && typeof o.fold === 'object' ? o.fold : {};
  return {
    reviews: bool(o.reviews, PREF_DEFAULTS.reviews),
    cards: bool(o.cards, PREF_DEFAULTS.cards),
    sheetMore: bool(o.sheetMore, PREF_DEFAULTS.sheetMore),
    fold: Object.fromEntries(FOLDS.map((k) => [k, bool(f[k], false)])),
  };
}

/**
 * The choices, with a way to change them that saves at once and tells whoever is listening.
 * @param {{getItem: Function, setItem: Function}|null} [store] localStorage, or a stand-in
 * @returns {{get: (key: string) => any, set: (key: string, v: any) => void, folded: (panel: string) => boolean,
 *   setFolded: (panel: string, on: boolean) => void, on: (fn: (prefs: Object) => void) => () => void, all: () => Object}}
 */
export function createPrefs(store = defaultStore()) {
  let p = readPrefs(store);
  const listeners = new Set();
  function save() {
    try { store?.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* not remembered, no harm */ }
    for (const fn of [...listeners]) fn(p);
  }
  return {
    get: (key) => p[key],
    set(key, v) {
      if (!(key in PREF_DEFAULTS) || key === 'fold' || p[key] === !!v) return;
      p = { ...p, [key]: !!v };
      save();
    },
    folded: (panel) => !!p.fold[panel],
    setFolded(panel, on) {
      if (!FOLDS.includes(panel) || p.fold[panel] === !!on) return;
      p = { ...p, fold: { ...p.fold, [panel]: !!on } };
      save();
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    all: () => p,
  };
}

function defaultStore() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/** One set of choices for the whole page: the game screen and its settings menu share it. */
let shared = null;
export function prefs() {
  if (!shared) shared = createPrefs();
  return shared;
}

// ---- Panel folding: what a folded panel says in its one line -----------------------------------

/** ON SHIFT folded: how many are on shift. */
export function shiftLine(online) {
  const n = Math.max(0, online | 0);
  return `ON SHIFT · ${n} player${n === 1 ? '' : 's'}`;
}

/** The hand folded: how many cards it holds. */
export function handLine(cards) {
  const n = Math.max(0, cards | 0);
  return `HAND · ${n} card${n === 1 ? '' : 's'}`;
}

// ---- The information card on a double click (0.4) -----------------------------------------------

/** Two presses on the same bar button closer together than this are a double click (or tap). */
export const DOUBLE_MS = 400;

/**
 * What a press on a build bar button does. Normally a press picks the building (or tool) up, and
 * a press on the one already held puts it down. With the cards turned off, a second press on the
 * same button soon after the first is a double click: it keeps the building held and shows its
 * card, this once.
 * @param {{k: string|null, at: number}|null} last the previous press (button and time), or null
 * @param {string} k the button pressed
 * @param {number} now the time, in milliseconds
 * @param {string|null} held what is held now (after the previous press)
 * @param {boolean} cardsOn whether cards open by themselves
 * @returns {'pick'|'drop'|'card'}
 */
export function barPress(last, k, now, held, cardsOn) {
  const twice = !!last && last.k === k && now - last.at < DOUBLE_MS;
  if (!cardsOn && twice && held === k) return 'card';
  return held === k ? 'drop' : 'pick';
}
