// The interface clean-up of 0.4 (stage 5a, the owner's requests after playing 0.3.04): reviews that
// go sooner and on a tap, the remembered screen switches (reviews, cards, the folded panels, the
// phone's sheet details), the card on a double click, the folded panels' one-line words, the cached
// dollar formatter, and DEB's lines for a host whose game is in the background.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPrefs, readPrefs, PREFS_KEY, PREF_DEFAULTS, FOLDS, barPress, DOUBLE_MS, shiftLine, handLine,
} from '../src/ui/prefs.js';
import { createToastList, REVIEW_MS, NOTICE_MS, MAX_REVIEWS } from '../src/ui/toasts.js';
import { money } from '../src/ui/dom.js';
import { HOST_AWAY, HOST_BACK, HOST_AWAY_NOTICE, hostAwayLine, hostBackLine, textOf, placeholders } from '../src/content/lines.js';

/** A stand-in for localStorage. */
function memoryStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), raw: m };
}

// ---- Reviews ---------------------------------------------------------------------------------------

test('a review stays 25% shorter than in 0.3 (6 s), a notice as before', () => {
  assert.equal(REVIEW_MS, 6000 * 0.75);
  assert.equal(NOTICE_MS, 4500);
  const list = createToastList();
  const a = {}, n = {};
  list.add(a, 'review', 1000, REVIEW_MS, MAX_REVIEWS);
  list.add(n, 'notice', 1000, NOTICE_MS, 3);
  assert.deepEqual(list.due(1000 + REVIEW_MS - 1), []);
  assert.deepEqual(list.due(1000 + REVIEW_MS), [a, n]);
  assert.equal(list.count(), 0);
});

test('a tap takes a review away at once; the others keep their time', () => {
  const list = createToastList();
  const a = { id: 'a' }, b = { id: 'b' };
  list.add(a, 'review', 0, REVIEW_MS, MAX_REVIEWS);
  list.add(b, 'review', 100, REVIEW_MS, MAX_REVIEWS);
  assert.equal(list.dismiss(a), true);
  assert.equal(list.dismiss(a), false, 'already gone');
  assert.equal(list.count('review'), 1);
  assert.deepEqual(list.due(REVIEW_MS + 50), [], 'b came later');
  assert.deepEqual(list.due(REVIEW_MS + 100), [b]);
});

test('no more than three reviews: the oldest makes way; hiding reviews clears them all', () => {
  const list = createToastList();
  const r = [1, 2, 3, 4].map((id) => ({ id }));
  let out = [];
  r.forEach((x, i) => { out = out.concat(list.add(x, 'review', i, REVIEW_MS, MAX_REVIEWS)); });
  assert.deepEqual(out, [r[0]]);
  const n = {};
  list.add(n, 'notice', 5, NOTICE_MS, 3);
  assert.deepEqual(list.clear('review'), [r[1], r[2], r[3]]);
  assert.equal(list.count('review'), 0);
  assert.equal(list.count('notice'), 1, 'notices are not reviews');
});

// ---- Remembered switches -----------------------------------------------------------------------------

test('the screen switches come on, and are read back from storage; nonsense falls back to the defaults', () => {
  assert.deepEqual(readPrefs(null), { reviews: true, cards: true, sheetMore: false, fold: { players: false, hand: false, pay: false } });
  assert.deepEqual(readPrefs(memoryStore({ [PREFS_KEY]: '{not json' })).fold, { players: false, hand: false, pay: false });
  const p = readPrefs(memoryStore({ [PREFS_KEY]: JSON.stringify({ reviews: false, cards: 'no', fold: { hand: true, nope: true } }) }));
  assert.equal(p.reviews, false);
  assert.equal(p.cards, true, 'not a true or false: the default');
  assert.deepEqual(p.fold, { players: false, hand: true, pay: false });
  assert.deepEqual(FOLDS, ['players', 'hand', 'pay']);
  assert.equal(PREF_DEFAULTS.reviews, true);
});

test('hiding reviews or cards is saved at once and survives a new page', () => {
  const store = memoryStore();
  const a = createPrefs(store);
  const heard = [];
  a.on((p) => heard.push(p.reviews));
  a.set('reviews', false);
  a.set('reviews', false); // no change: nobody told twice
  a.set('cards', false);
  assert.deepEqual(heard, [false, false]);
  const b = createPrefs(store);
  assert.equal(b.get('reviews'), false);
  assert.equal(b.get('cards'), false);
  b.set('reviews', true);
  assert.equal(createPrefs(store).get('reviews'), true, 'and back on from the settings menu');
  b.set('fold', true);
  assert.deepEqual(createPrefs(store).all().fold, { players: false, hand: false, pay: false }, 'fold is not a switch');
  // A browser that will not store anything (a private window) still works for this page.
  const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  const c = createPrefs(broken);
  c.set('cards', false);
  assert.equal(c.get('cards'), false);
});

test('each of the three panels folds on its own, remembered', () => {
  const store = memoryStore();
  const a = createPrefs(store);
  a.setFolded('pay', true);
  a.setFolded('players', true);
  a.setFolded('players', false);
  a.setFolded('chat', true); // not a panel that folds
  const b = createPrefs(store);
  assert.equal(b.folded('pay'), true);
  assert.equal(b.folded('players'), false);
  assert.equal(b.folded('hand'), false);
  assert.equal(b.folded('chat'), false);
});

test('a folded panel says in one line what it holds', () => {
  assert.equal(shiftLine(1), 'ON SHIFT · 1 player');
  assert.equal(shiftLine(3), 'ON SHIFT · 3 players');
  assert.equal(handLine(5), 'HAND · 5 cards');
  assert.equal(handLine(1), 'HAND · 1 card');
  assert.equal(handLine(0), 'HAND · 0 cards');
});

// ---- The card on a double click ---------------------------------------------------------------------

test('a press picks a building up and a press on the one held puts it down, as before', () => {
  assert.equal(barPress(null, 'sprinkler', 0, null, true), 'pick');
  assert.equal(barPress({ k: 'sprinkler', at: 0 }, 'sprinkler', 100, 'sprinkler', true), 'drop', 'cards on: a double click is two presses');
  assert.equal(barPress({ k: 'sprinkler', at: 0 }, 'forklift', 100, 'sprinkler', false), 'pick');
});

test('with cards off, a double click (or double tap) keeps the building held and shows its card once', () => {
  assert.equal(barPress(null, 'samples', 0, null, false), 'pick');
  assert.equal(barPress({ k: 'samples', at: 0 }, 'samples', DOUBLE_MS - 1, 'samples', false), 'card');
  assert.equal(barPress({ k: 'samples', at: 0 }, 'samples', DOUBLE_MS, 'samples', false), 'drop', 'too slow: a second press');
  assert.equal(barPress({ k: 'wire', at: 0 }, 'wire', 200, 'wire', false), 'card', 'the tools too');
  // Two quick presses on a button whose building is not held (it was put down meanwhile): a pick.
  assert.equal(barPress({ k: 'samples', at: 0 }, 'samples', 100, null, false), 'pick');
});

// ---- Money ----------------------------------------------------------------------------------------------

test('money is formatted as before, by one formatter made once (no new one per call)', () => {
  const was = Number.prototype.toLocaleString;
  const Made = Intl.NumberFormat;
  let made = 0;
  Number.prototype.toLocaleString = function () { throw new Error('a formatter per call'); };
  Intl.NumberFormat = function (...a) { made++; return new Made(...a); };
  try {
    assert.equal(money(0), '$0');
    assert.equal(money(1234.99), '$1,234');
    assert.equal(money(1234567), '$1,234,567');
    assert.equal(money(-5.5), '$-6');
    for (let i = 0; i < 2000; i++) money(i * 7.3);
    assert.equal(money(1234.2), '$1,234', 'the same answer from what is kept');
    assert.equal(made, 0);
  } finally {
    Number.prototype.toLocaleString = was;
    Intl.NumberFormat = Made;
  }
  assert.equal(money(98765), `$${(98765).toLocaleString('en-US')}`);
});

// ---- The host in the background ------------------------------------------------------------------------

test("DEB's lines for a host in the background, and back, name him and fill every placeholder", () => {
  for (const line of [...HOST_AWAY, ...HOST_BACK]) assert.deepEqual([...new Set(placeholders(textOf(line)))], ['p'], textOf(line));
  assert.ok(HOST_AWAY.length >= 3 && HOST_BACK.length >= 2);
  for (let i = 0; i < 20; i++) {
    const r = () => (i * 0.137) % 1;
    const a = hostAwayLine('Bobb', r), b = hostBackLine('Bobb', r);
    assert.match(a, /Bobb/);
    assert.match(b, /Bobb/);
    assert.doesNotMatch(a + b, /\{/);
  }
  assert.match(HOST_AWAY_NOTICE, /\{name\}/);
});

test('every host session the game makes, except the training shift, is told when its page is hidden', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const made = [...src.matchAll(/new HostSession\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
  assert.ok(made.length >= 4, 'found the host sessions');
  for (const args of made) {
    if (/training: true/.test(args)) assert.doesNotMatch(args, /visibility/, 'nobody joins a training shift');
    else assert.match(args, /visibility: pageVisibility\(\)/, args.trim().slice(0, 60));
  }
});
