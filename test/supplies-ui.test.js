// The Back's supplies as the interface shows them (0.4, stage 3): the words and numbers on the
// sheets and warnings (src/content/supplies.js), The Back's build bar groups and keys, and DEB's
// lines when a building runs dry. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILD, BACK, STOCK_TRACKS, addStock, useStock, unitsIn, dropTicks, dropUpCost, TICK_HZ, createGame, addPlayer,
  applyDemoLayout, step, applyCommand,
} from '../src/sim/index.js';
import {
  SUPPLIES, TIER_NAMES, TIER_RINGS, outOfText, stockTracks, tierIn, stockGives, stockRows, junkPerMinute, dropInfo,
} from '../src/content/supplies.js';
import { BACK_GROUPS, BACK_KEYS, BACK_HOTKEYS, hotkeyOf, BUILD_KEYS, HOTKEYS } from '../src/ui/input.js';
import { BACK_HOW } from '../src/content/help.js';
import { LINES, NOPE, fill, textOf } from '../src/content/lines.js';
import { createDirector } from '../src/content/director.js';

test('every stock track has a supply with a name, a warning word and a colour', () => {
  for (const t of STOCK_TRACKS) {
    assert.ok(SUPPLIES[t]?.name && SUPPLIES[t].word && /^#[0-9a-f]{6}$/.test(SUPPLIES[t].color), t);
  }
  assert.equal(outOfText('dmg'), 'OUT OF SPITE');
  assert.equal(outOfText('spd'), 'OUT OF COLA');
  assert.equal(outOfText('rng'), 'OUT OF CORD');
  assert.equal(outOfText('dur'), 'OUT OF TAPE');
  assert.equal(outOfText('wire'), 'OUT OF WIRE');
  assert.equal(outOfText('nonsense'), 'OUT OF STOCK');
  assert.deepEqual(TIER_NAMES.slice(1), ['Store Brand', 'Name Brand', 'Premium', 'Platinum']);
  assert.equal(TIER_RINGS[1], null, 'Store Brand has no ring');
  assert.ok(TIER_RINGS[2] && TIER_RINGS[3] && TIER_RINGS[4]);
});

test('the tracks a building takes: its upgrade tracks and wire, only for kinds with Dumbwaiters', () => {
  assert.deepEqual(stockTracks('sprinkler'), ['dmg', 'spd', 'rng', 'dur', 'wire']);
  assert.deepEqual(stockTracks('wetfloor'), ['dmg', 'dur', 'wire']);
  assert.deepEqual(stockTracks('crate'), []);
  assert.deepEqual(stockTracks('conv'), []);
  assert.deepEqual(stockTracks('__proto__'), []);
  for (const k of Object.keys(BUILD)) if (BUILD[k].lift) assert.ok(stockTracks(k).includes('wire'), k);
});

test('a sheet row says what the stock gives now, or EMPTY', () => {
  const b = { k: 'sprinkler' };
  assert.ok(stockRows(b).every((r) => r.gives === 'EMPTY' && r.units === 0 && r.cap === BACK.stockUnits && r.tierName === ''));
  addStock(b, 12); // Name Brand Spite
  addStock(b, 41); // Store Brand Tape
  assert.equal(tierIn(b, 'dmg'), 2);
  assert.equal(stockGives(b, 'dmg'), `+${BACK.tierLevel[2]} levels of damage`);
  assert.equal(stockGives(b, 'dur'), `soaks up ${BACK.tapeHits[1]} gym bro hit${BACK.tapeHits[1] === 1 ? '' : 's'}`);
  const dmg = stockRows(b).find((r) => r.track === 'dmg');
  assert.equal(dmg.tierName, 'Name Brand');
  assert.equal(dmg.units, 1);
  // Bought levels at least as high: the stock adds nothing, and the row says so.
  const bought = { k: 'sprinkler', u: { dmg: 5 } };
  addStock(bought, 11);
  assert.match(stockGives(bought, 'dmg'), /nothing more than the 5 levels bought/);
  // Used up: empty again.
  while (useStock(b, 'dmg', 0, [])) { /* use it all */ }
  assert.equal(stockGives(b, 'dmg'), 'EMPTY');
  assert.equal(unitsIn(b, 'dmg'), 0);
});

test('a Returns Drop sheet: junk a minute, the next level, and why MORE JUNK cannot be pressed', () => {
  assert.equal(junkPerMinute(0), Math.round((600 * TICK_HZ) / dropTicks(0)) / 10);
  assert.ok(junkPerMinute(1) > junkPerMinute(0));
  const d = dropInfo({ lv: 1 }, 10000);
  assert.equal(d.why, '');
  assert.equal(d.cost, dropUpCost(1));
  assert.equal(d.next, junkPerMinute(2));
  assert.equal(dropInfo({ lv: 1 }, dropUpCost(1) - 40).why, '$40 short');
  const top = dropInfo({ lv: BACK.dropUpMax }, 1e9);
  assert.equal(top.why, 'Top level');
  assert.equal(top.next, 0);
});

test("The Back's build bar: two groups, every part a player can buy once, keys like the shop bar's", () => {
  assert.deepEqual(BACK_GROUPS.map((g) => g.label), ['BELTS', 'MACHINES']);
  assert.deepEqual(BACK_GROUPS[0].keys, ['conv', 'split', 'over', 'intern', 'bin']);
  assert.deepEqual(BACK_GROUPS[1].keys, ['still', 'cannery', 'spooler', 'winder', 'bender', 'rebrand']);
  const buyable = Object.keys(BUILD).filter((k) => BUILD[k].back && !BUILD[k].fixed);
  assert.deepEqual([...BACK_KEYS].sort(), [...buyable].sort());
  assert.deepEqual(BACK_HOTKEYS, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-']);
  assert.equal(new Set(BACK_HOTKEYS).size, BACK_HOTKEYS.length, 'no key twice');
  assert.equal(hotkeyOf('rebrand'), '-');
  assert.equal(hotkeyOf('still'), '6');
  assert.equal(hotkeyOf('belt'), HOTKEYS[BUILD_KEYS.indexOf('belt')]);
  for (const k of BACK_KEYS) {
    assert.ok(BACK_HOW[k] && BACK_HOW[k].does.length > 30 && BACK_HOW[k].use.length > 30, `card text for ${k}`);
  }
  // Each machine's card names what it makes, and says it takes junk.
  for (const k of BACK_GROUPS[1].keys.filter((k) => BUILD[k].supply)) {
    const name = Object.values(SUPPLIES).find((s) => s.type === BUILD[k].supply).name;
    assert.ok(BACK_HOW[k].does.includes(name) && /junk/.test(BACK_HOW[k].does), k);
  }
});

test('DEB moans when a building runs dry: about five lines a supply, naming it, and not every time', () => {
  for (const t of STOCK_TRACKS) assert.ok(LINES.stockOut[t]?.length >= 5, t);
  assert.ok(NOPE.back.length >= 4 && NOPE.back.length <= 6);
  const state = createGame({ seed: 1 });
  addPlayer(state, 'Dave');
  assert.ok(applyCommand(state, 0, { c: 'place', k: 'sprinkler', x: 5, y: 5, d: 0 }).ok);
  const i = 5 * state.w + 5;
  state.tick = 100 * TICK_HZ;
  const director = createDirector(() => 0);
  const said = (out) => out.filter((m) => m.t === 'say').map((m) => m.text);
  const first = said(director.handle([{ e: 'stockOut', i, t: 'rng' }], state));
  assert.equal(first.length, 1, 'the first one is always said');
  const lines = LINES.stockOut.rng.map((l) => fill(textOf(l), { p: 'Dave', k: 'Pepper Sprinkler' }));
  assert.ok(lines.includes(first[0]), first[0]);
  // Straight after, another track running dry is not worth another line.
  state.tick += 5 * TICK_HZ;
  assert.deepEqual(said(director.handle([{ e: 'stockOut', i, t: 'dmg' }], state)), []);
  // Nonsense is ignored.
  state.tick += 600 * TICK_HZ;
  assert.deepEqual(said(director.handle([{ e: 'stockOut', i: 3, t: 'dmg' }, { e: 'stockOut', i, t: 'toString' }], state)), []);
});

test('the demo store has a working supply chain that stocks its security, and a track that runs dry', () => {
  const s = createGame({ seed: 1 });
  addPlayer(s, 'Dave');
  assert.deepEqual(applyDemoLayout(s, 0), []);
  for (const k of ['still', 'cannery', 'rebrand', 'split', 'over', 'intern', 'bin']) assert.ok(s.back.some((p) => p && p.k === k), k);
  const outs = [];
  for (let t = 0; t < 3000; t++) {
    if (s.phase === 'build' && t % 30 === 0) applyCommand(s, 0, { c: 'start' });
    for (const e of step(s)) if (e.e === 'stockOut') outs.push(e);
  }
  const at = (x, y) => s.grid[y * s.w + x];
  assert.ok(unitsIn(at(12, 3), 'dmg') > 0 && unitsIn(at(14, 3), 'dmg') > 0, 'the interns stock both sprinklers with Spite');
  assert.equal(tierIn(at(9, 8), 'spd'), 3, 'the forklift gets Premium Rage Cola, twice rebranded');
  assert.ok(outs.length > 0, 'something runs dry');
});
