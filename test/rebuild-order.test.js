// Tests for the Rebuild button as an order (0.3.04, the owner's request: "The auto rebuild makes
// the game too easy... not having to do anything is too easy and passive"). Auto-rebuild is gone.
// Pressing Rebuild (or B) takes the money at once and puts each wreck back at once if it can,
// otherwise as soon as nothing is in the way, with no further press. A wreck he cannot afford even
// the bare building for is not ordered (the owner's decision), and there is no cancel (the owner's
// decision): held money goes back only when the wreck stops being rubble some other way.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, step, queueTrainingWave, rebuildDeal, migrateSave, spentOn,
  heldFor, anchorOf, tilesOf, setPlayerOnline, BUILD, TUNE, TICK_HZ, ST,
} from '../src/sim/index.js';
import { checksum } from '../src/net/session.js';
import { rebuildStatus, rebuildWords } from '../src/ui/rebuild.js';

// The original small map, 30 tiles by 16: entrance on the left at rows 7-8, tills on the right.
const W = 30;
const at = (x, y) => y * W + x;
/** How often step() looks at the waiting orders, in ticks (0.2 s). */
const EVERY = Math.round(TUNE.rebuildEvery * TICK_HZ);
const CRATE_HALF = Math.floor(BUILD.crate.cost * TUNE.rebuildShare);
const FORK_HALF = Math.floor(BUILD.forklift.cost * TUNE.rebuildShare);

/** A training game (no timer, cannot be lost): Dave with plenty of cash. */
function stage(seed = 5) {
  const s = createGame({ seed, training: true });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  return s;
}
const place = (s, k, x, y, pid = 0) => applyCommand(s, pid, { c: 'place', k, x, y, d: 0 });
/** Rubble as a gym bro leaves it. */
const crateRubble = (x, y, o = 0) => ({ i: at(x, y), k: 'crate', d: 0, o, u: {}, spent: BUILD.crate.cost });
/** A forklift's rubble: base 200, rng 80, dmg 120 + 192: full deal 296, bare 100, then rng 40, dmg 60, dmg 96. */
const forkRubble = (x, y, o = 0, u = { dmg: 2, rng: 1 }) => ({ i: at(x, y), k: 'forklift', d: 0, o, u, spent: spentOn({ k: 'forklift', u }) });
const steps = (s, n) => { const ev = []; for (let i = 0; i < n; i++) ev.push(...step(s)); return ev; };
/** A fallen drunk lying on a tile (he stays put), so nothing that blocks may be built there. */
function lieDown(s, x, y, id = 900 + s.shoppers.length) {
  const sh = { id, k: 'drinker', x: x + 0.5, y: y + 0.5, vx: 0, vy: 0, hp: 50, mhp: 50, st: ST.STUN, t: 1e6, cd: 0, ox: 0, oy: 0, lt: -1, sv: 1 };
  s.shoppers.push(sh);
  return sh;
}
const getUp = (s, sh) => s.shoppers.splice(s.shoppers.indexOf(sh), 1);
/** Wrecks the building on a tile exactly as a gym bro's last hit does (see wreck() in step.js). */
function wreckAt(s, x, y) {
  const ai = anchorOf(s, at(x, y)), b = s.grid[ai];
  for (const t of tilesOf(s, ai)) s.grid[t] = 0;
  s.gridVer++;
  s.rubble.push({ i: ai, k: b.k, d: b.d | 0, o: b.o, u: { ...(b.u || {}) }, spent: spentOn(b) });
}
const rebuilt = (ev) => ev.filter((e) => e.e === 'rebuilt');
const heldEv = (ev) => ev.filter((e) => e.e === 'rebuildHeld');

test('the numbers: waiting orders are looked at every 0.2 s; auto-rebuild\'s numbers are gone', () => {
  assert.equal(TUNE.rebuildEvery, 0.2);
  assert.equal(TUNE.autoRebuildSecs, undefined);
  assert.equal(TUNE.autoRebuildEvery, undefined);
  assert.equal(TUNE.rebuildShare, 0.5, 'unchanged');
});

test('there is no auto-rebuild command any more', () => {
  const s = stage();
  assert.deepEqual(applyCommand(s, 0, { c: 'autoRebuild', on: true }), { ok: false, why: 'bad' });
  assert.equal('autoRebuild' in s.players[0], false);
});

test('pressing Rebuild takes the money at once, and with nothing in the way the building is back at once', () => {
  const s = stage();
  s.rubble.push(crateRubble(5, 5));
  const cash = s.players[0].cash, spent = s.players[0].all.spent;
  const ev = [];
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild' }, ev), { ok: true, n: 1, short: 0, held: 0, paid: CRATE_HALF });
  assert.equal(s.grid[at(5, 5)].k, 'crate');
  assert.equal(s.grid[at(5, 5)].o, 0);
  assert.equal(s.rubble.length, 0);
  assert.equal(s.players[0].cash, cash - CRATE_HALF);
  assert.equal(s.players[0].all.spent, spent + CRATE_HALF);
  assert.deepEqual(ev, [{ e: 'rebuilt', by: 0, n: 1, short: 0 }]);
});

test('a shopper in the hole: the money is taken, nothing is built, and step() builds it once he goes, with no further press', () => {
  const s = stage();
  const drunk = lieDown(s, 5, 5);
  s.rubble.push(crateRubble(5, 5));
  const cash = s.players[0].cash, spent = s.players[0].all.spent, built = s.players[0].all.built;
  const ev = [];
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild' }, ev), { ok: true, n: 0, short: 0, held: 1, paid: CRATE_HALF });
  assert.deepEqual(ev, [{ e: 'rebuildHeld', by: 0, n: 1, paid: CRATE_HALF }]);
  assert.equal(s.grid[at(5, 5)], 0, 'not on top of him');
  assert.equal(s.players[0].cash, cash - CRATE_HALF, 'paid now');
  assert.equal(s.rubble[0].by, 0);
  assert.equal(s.rubble[0].res, CRATE_HALF);
  assert.equal(heldFor(s, 0), CRATE_HALF);
  assert.equal(s.players[0].all.spent, spent, 'counted as spent when it is built, not when it is held');
  assert.deepEqual(JSON.parse(JSON.stringify(s.rubble)), s.rubble, 'JSON-safe');
  steps(s, 5 * EVERY);
  assert.equal(s.grid[at(5, 5)], 0, 'still waiting while he lies there');
  assert.equal(s.players[0].cash, cash - CRATE_HALF, 'and nothing more is taken');
  getUp(s, drunk);
  const later = steps(s, EVERY);
  assert.equal(s.grid[at(5, 5)].k, 'crate', 'back within one look of him going');
  assert.equal(s.rubble.length, 0);
  assert.equal(s.players[0].cash, cash - CRATE_HALF, 'charged once');
  assert.equal(s.players[0].all.spent, spent + CRATE_HALF);
  assert.equal(s.players[0].all.built, built + 1);
  assert.deepEqual(rebuilt(later), [{ e: 'rebuilt', by: 0, n: 1, short: 0, late: 1 }]);
});

test('a mixed press: the event says only what is held for the wreck left waiting; the result says what the press took in all', () => {
  const s = stage();
  lieDown(s, 5, 5);
  s.rubble.push(crateRubble(5, 5), forkRubble(9, 5, 0, {}));
  const ev = [];
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild' }, ev), { ok: true, n: 1, short: 0, held: 1, paid: CRATE_HALF + FORK_HALF });
  assert.deepEqual(ev, [{ e: 'rebuilt', by: 0, n: 1, short: 0 }, { e: 'rebuildHeld', by: 0, n: 1, paid: CRATE_HALF }]);
  assert.equal(s.grid[at(9, 5)].k, 'forklift');
});

test('when it would wall the route: paid for, held, and built by step() once another way opens', () => {
  const s = stage();
  // A wall of crates down column 15 with one gap: the wreck in the gap would wall the entrance off.
  for (let y = 1; y <= 14; y++) if (y !== 7) assert.ok(place(s, 'crate', 15, y).ok, `crate at 15,${y}`);
  s.rubble.push(crateRubble(15, 7));
  const r = applyCommand(s, 0, { c: 'rebuild' });
  assert.equal(r.held, 1);
  steps(s, 5 * EVERY);
  assert.equal(s.grid[at(15, 7)], 0, 'it would block the route');
  assert.ok(applyCommand(s, 0, { c: 'remove', x: 15, y: 3 }).ok, 'another way through opens');
  steps(s, EVERY);
  assert.equal(s.grid[at(15, 7)].k, 'crate');
});

test('too broke for the bare building: not ordered, refused with "cash", nothing taken; a later press works', () => {
  const s = stage();
  s.rubble.push(crateRubble(5, 5));
  s.players[0].cash = CRATE_HALF - 1;
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild' }), { ok: false, why: 'cash' });
  assert.equal(s.players[0].cash, CRATE_HALF - 1);
  assert.equal(s.rubble[0].by, undefined);
  // The money arriving later does nothing by itself: he must press again.
  s.players[0].cash = CRATE_HALF + 3;
  steps(s, 5 * EVERY);
  assert.equal(s.grid[at(5, 5)], 0);
  assert.equal(s.players[0].cash, CRATE_HALF + 3);
  assert.equal(applyCommand(s, 0, { c: 'rebuild' }).n, 1);
  assert.equal(s.players[0].cash, 3);
});

test('pressed with money for a lower level while it waits: more is taken as cash arrives, and it comes back with every upgrade', () => {
  const s = stage();
  const drunk = lieDown(s, 5, 5);
  const r = forkRubble(5, 5);
  s.rubble.push(r);
  assert.equal(rebuildDeal(r, Infinity).pay, 296);
  s.players[0].cash = 140;
  assert.equal(applyCommand(s, 0, { c: 'rebuild' }).held, 1);
  assert.equal(r.res, 140, 'the bare forklift and its cheapest level');
  assert.equal(s.players[0].cash, 0);
  // 50 more does not buy the next level (60): nothing moves.
  s.players[0].cash = 50;
  steps(s, EVERY);
  assert.equal(r.res, 140);
  assert.equal(s.players[0].cash, 50);
  // 60 does.
  s.players[0].cash = 60;
  steps(s, EVERY);
  assert.equal(r.res, 200);
  assert.equal(s.players[0].cash, 0);
  // Then plenty: up to the full deal and no further.
  s.players[0].cash = 1000;
  steps(s, EVERY);
  assert.equal(r.res, 296);
  assert.equal(s.players[0].cash, 1000 - 96);
  steps(s, 3 * EVERY);
  assert.equal(r.res, 296, 'never more than the full deal');
  assert.equal(s.players[0].cash, 1000 - 96);
  getUp(s, drunk);
  const ev = steps(s, EVERY);
  assert.deepEqual(s.grid[at(5, 5)].u, { dmg: 2, rng: 1 }, 'every upgrade');
  assert.equal(s.players[0].cash, 1000 - 96, 'nothing more charged, nothing given back');
  assert.deepEqual(rebuilt(ev), [{ e: 'rebuilt', by: 0, n: 1, short: 0, late: 1 }]);
});

test('pressed with money for a lower level and nothing in the way: back at once at that level', () => {
  const s = stage();
  s.rubble.push(forkRubble(5, 5));
  s.players[0].cash = 140;
  const ev = [];
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild' }, ev), { ok: true, n: 1, short: 1, held: 0, paid: 140 });
  assert.deepEqual(s.grid[at(5, 5)].u, { rng: 1 });
  assert.equal(s.players[0].cash, 0);
  assert.deepEqual(ev, [{ e: 'rebuilt', by: 0, n: 1, short: 1 }]);
});

test('a wreck that breaks after the press is not ordered; pressing again orders only it, and with everything ordered a press is refused "ordered"', () => {
  const s = stage();
  lieDown(s, 5, 5);
  s.rubble.push(crateRubble(5, 5));
  assert.equal(applyCommand(s, 0, { c: 'rebuild' }).held, 1);
  const cash = s.players[0].cash;
  // Everything of his is paid for: a second press takes nothing.
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild' }), { ok: false, why: 'ordered' });
  assert.equal(s.players[0].cash, cash);
  // A new wreck, with nothing in its way, is not put back by itself.
  s.rubble.push(crateRubble(9, 5));
  steps(s, 5 * EVERY);
  assert.equal(s.grid[at(9, 5)], 0);
  assert.equal(s.rubble[1].by, undefined);
  assert.equal(s.players[0].cash, cash);
  // Another press: only the new one is paid for, and it goes back at once.
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild' }), { ok: true, n: 1, short: 0, held: 0, paid: CRATE_HALF });
  assert.equal(s.grid[at(9, 5)].k, 'crate');
  assert.equal(s.players[0].cash, cash - CRATE_HALF);
  assert.equal(s.grid[at(5, 5)], 0, 'the first still waits');
});

test('oldest first: the press orders the oldest it can afford, and waiting orders take new money oldest first', () => {
  // The press: money for the forklift (the oldest) and nothing left for the crate.
  const s = stage();
  s.rubble.push(forkRubble(5, 5, 0, {}), crateRubble(9, 5));
  s.players[0].cash = FORK_HALF;
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild' }), { ok: true, n: 1, short: 0, held: 0, paid: FORK_HALF });
  assert.equal(s.grid[at(5, 5)].k, 'forklift');
  assert.equal(s.grid[at(9, 5)], 0, 'the crate is not ordered');
  assert.equal(s.rubble[0].by, undefined);
  // ...but a wreck he cannot afford does not stop younger ones he can.
  const t = stage();
  t.rubble.push(forkRubble(5, 5, 0, {}), crateRubble(9, 5));
  t.players[0].cash = FORK_HALF - 1;
  assert.equal(applyCommand(t, 0, { c: 'rebuild' }).n, 1);
  assert.equal(t.grid[at(9, 5)].k, 'crate');
  assert.equal(t.rubble.length, 1);
  assert.equal(t.rubble[0].by, undefined);

  // The top-up: two forklifts waiting, each ordered bare.
  const u = stage();
  lieDown(u, 5, 5);
  lieDown(u, 9, 5);
  const a = forkRubble(5, 5), b = forkRubble(9, 5);
  u.rubble.push(a);
  u.players[0].cash = FORK_HALF;
  applyCommand(u, 0, { c: 'rebuild' });
  u.rubble.push(b);
  u.players[0].cash = FORK_HALF;
  applyCommand(u, 0, { c: 'rebuild' });
  assert.deepEqual([a.res, b.res, u.players[0].cash], [100, 100, 0]);
  // 40: the older one's next level (rng, 40) gets it.
  u.players[0].cash = 40;
  steps(u, EVERY);
  assert.deepEqual([a.res, b.res, u.players[0].cash], [140, 100, 0]);
  // 40 more: the older one's next level costs 60, so it cannot use it; the younger's can.
  u.players[0].cash = 40;
  steps(u, EVERY);
  assert.deepEqual([a.res, b.res, u.players[0].cash], [140, 140, 0]);
  // 60: the older one first.
  u.players[0].cash = 60;
  steps(u, EVERY);
  assert.deepEqual([a.res, b.res, u.players[0].cash], [200, 140, 0]);
});

test('one player\'s press never touches another\'s wrecks or money; with all: true it pays for everybody\'s', () => {
  const s = stage();
  addPlayer(s, 'Steve');
  s.players[1].cash = 1000;
  s.rubble.push(crateRubble(5, 5, 1));
  const dave = s.players[0].cash;
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild' }), { ok: false, why: 'empty' });
  assert.equal(s.grid[at(5, 5)], 0);
  assert.equal(s.rubble[0].by, undefined);
  assert.equal(s.players[0].cash, dave);
  assert.equal(s.players[1].cash, 1000);
  // Steve's order waits behind a drunk; Dave's press still does not touch it.
  lieDown(s, 5, 5);
  assert.equal(applyCommand(s, 1, { c: 'rebuild' }).held, 1);
  s.rubble.push(crateRubble(9, 5, 1));
  assert.equal(applyCommand(s, 0, { c: 'rebuild' }).why, 'empty');
  // With all: Dave pays for Steve's new wreck, but not again for the one Steve already paid.
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild', all: true }), { ok: true, n: 1, short: 0, held: 0, paid: CRATE_HALF });
  assert.equal(s.players[0].cash, dave - CRATE_HALF);
  assert.equal(s.players[1].cash, 1000 - CRATE_HALF);
  assert.equal(s.rubble.length, 1);
  assert.equal(s.rubble[0].by, 1);
});

test('held money comes back in full when something else is built over the hole', () => {
  const s = stage();
  addPlayer(s, 'Steve');
  lieDown(s, 5, 5);
  s.rubble.push(crateRubble(5, 5));
  const cash = s.players[0].cash;
  applyCommand(s, 0, { c: 'rebuild' });
  assert.equal(s.players[0].cash, cash - CRATE_HALF);
  // A Wet Floor sign does not block, so it may go down beside the drunk, over the hole.
  assert.ok(place(s, 'wetfloor', 5, 5).ok);
  assert.equal(s.rubble.length, 0);
  assert.equal(s.players[0].cash, cash - BUILD.wetfloor.cost, 'his crate money is back; the sign is paid for');
  // Built over by somebody else: the money still goes back to whoever paid it.
  s.players[1].cash = 1000;
  lieDown(s, 7, 5);
  s.rubble.push(crateRubble(7, 5));
  const before = s.players[0].cash;
  applyCommand(s, 0, { c: 'rebuild' });
  assert.ok(place(s, 'wetfloor', 7, 5, 1).ok);
  assert.equal(s.players[0].cash, before);
  assert.equal(s.players[1].cash, 1000 - BUILD.wetfloor.cost);
});

test('held money comes back in full when the wreck falls off the end of the rubble list', () => {
  const s = stage(9);
  for (let x = 2; x <= 27; x++) { place(s, 'crate', x, 6); place(s, 'crate', x, 8); }
  // The oldest wreck is ordered and waiting (a drunk lies in it); 399 more fill the list.
  lieDown(s, 5, 12);
  s.rubble.push(crateRubble(5, 12));
  const cash = s.players[0].cash;
  assert.equal(applyCommand(s, 0, { c: 'rebuild' }).held, 1);
  for (let n = 0; n < 399; n++) s.rubble.push(crateRubble(1, 1));
  queueTrainingWave(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  let broke = false;
  for (let i = 0; i < 90 * TICK_HZ && !broke; i++) broke = step(s).some((e) => e.e === 'smash' && e.left === 0);
  assert.ok(broke, 'the gym bro wrecked something');
  assert.equal(s.rubble.length, 400);
  assert.ok(!s.rubble.some((r) => r.i === at(5, 12)), 'the oldest fell off');
  assert.equal(heldFor(s, 0), 0);
  assert.equal(s.players[0].cash, cash, 'and its money came back');
});

test('placing the same kind by hand on a paid-for wreck uses the held money and charges once', () => {
  const s = stage();
  const drunk = lieDown(s, 5, 5);
  const r = forkRubble(5, 5);
  s.rubble.push(r);
  s.players[0].cash = 200;
  applyCommand(s, 0, { c: 'rebuild' });
  assert.equal(r.res, 200);
  assert.equal(s.players[0].cash, 0);
  getUp(s, drunk);
  // Before step() gets to it, he places it by hand with no loose cash at all.
  assert.ok(place(s, 'forklift', 5, 5).ok, 'the held money counts as his');
  assert.deepEqual(s.grid[at(5, 5)].u, { rng: 1, dmg: 1 });
  assert.equal(s.players[0].cash, 0, 'charged once, from what was held');
  assert.equal(s.rubble.length, 0);
  steps(s, 2 * EVERY);
  assert.equal(s.players[0].cash, 0);

  // Paid for by Steve, placed by Dave: Steve gets his money back and Dave pays.
  const t = stage();
  addPlayer(t, 'Steve');
  t.players[1].cash = 1000;
  const sh = lieDown(t, 5, 5);
  t.rubble.push(crateRubble(5, 5, 1));
  applyCommand(t, 1, { c: 'rebuild' });
  assert.equal(t.players[1].cash, 1000 - CRATE_HALF);
  getUp(t, sh);
  const dave = t.players[0].cash;
  assert.ok(place(t, 'crate', 5, 5).ok);
  assert.equal(t.players[1].cash, 1000);
  assert.equal(t.players[0].cash, dave - CRATE_HALF);
});

test('no rebuilding while paused: the press is refused, the order survives and completes once the game carries on', () => {
  const s = stage();
  const drunk = lieDown(s, 5, 5);
  s.rubble.push(crateRubble(5, 5));
  applyCommand(s, 0, { c: 'rebuild' });
  assert.ok(applyCommand(s, 0, { c: 'pause', on: true }).ok);
  s.rubble.push(crateRubble(9, 5));
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild' }), { ok: false, why: 'paused' });
  getUp(s, drunk);
  steps(s, 5 * EVERY);
  assert.equal(s.grid[at(5, 5)], 0, 'nothing is built while paused');
  assert.equal(s.rubble[0].by, 0);
  assert.ok(applyCommand(s, 0, { c: 'pause', on: false }).ok);
  steps(s, EVERY);
  assert.equal(s.grid[at(5, 5)].k, 'crate');
  assert.equal(s.grid[at(9, 5)], 0, 'the one wrecked after the press was never ordered');
});

test('no rebuilding during the deal of the cards: the press is refused, and an order completes once building starts', () => {
  const s = createGame({ seed: 2, cards: true });
  addPlayer(s, 'Dave');
  assert.equal(s.phase, 'cards');
  s.rubble.push(crateRubble(5, 5));
  assert.deepEqual(applyCommand(s, 0, { c: 'rebuild' }), { ok: false, why: 'cards' });
  // (An order left over from before, as in a save: it waits through the deal.)
  Object.assign(s.rubble[0], { by: 0, res: CRATE_HALF });
  s.players[0].cash -= CRATE_HALF;
  steps(s, 5 * EVERY);
  assert.equal(s.grid[at(5, 5)], 0);
  applyCommand(s, 0, { c: 'skipCards', on: true });
  for (let i = 0; i < 30 * TICK_HZ && s.phase === 'cards'; i++) step(s);
  assert.equal(s.phase, 'build');
  assert.ok(place(s, 'crate', 9, 3).ok, 'the build timer starts');
  const cash = s.players[0].cash;
  steps(s, EVERY);
  assert.equal(s.grid[at(5, 5)].k, 'crate');
  assert.equal(s.players[0].cash, cash, 'nothing more for the rebuild');
});

test('Head Office may not press Rebuild, and a player who takes the job gets his held money back', () => {
  const s = createGame({ seed: 2 });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  assert.ok(place(s, 'crate', 9, 3).ok);
  lieDown(s, 5, 5);
  s.rubble.push(crateRubble(5, 5, 1));
  const cash = s.players[1].cash;
  assert.equal(applyCommand(s, 1, { c: 'rebuild' }).held, 1);
  assert.equal(s.players[1].cash, cash - CRATE_HALF);
  assert.ok(applyCommand(s, 1, { c: 'side', side: 'office' }).ok);
  assert.equal(s.players[1].cash, cash, 'his money is back');
  assert.equal(s.rubble[0].by, undefined);
  assert.equal(applyCommand(s, 1, { c: 'rebuild' }).why, 'office');
  // (And an order whose payer is Head Office however it happened is cancelled by step().)
  Object.assign(s.rubble[0], { by: 1, res: CRATE_HALF });
  s.players[1].cash -= CRATE_HALF;
  steps(s, EVERY);
  assert.equal(s.rubble[0].by, undefined);
  assert.equal(s.players[1].cash, cash);
});

test('an old save carrying the auto-rebuild switch and rubble with the tick it broke loads and plays', () => {
  const s = stage();
  s.rubble.push({ ...crateRubble(5, 5), at: 0 });
  const saved = JSON.parse(JSON.stringify(s));
  saved.players[0].autoRebuild = true;
  assert.equal(migrateSave(saved), true, 'the dead fields are dropped');
  assert.equal('autoRebuild' in saved.players[0], false);
  assert.equal('at' in saved.rubble[0], false);
  assert.equal(migrateSave(saved), false, 'only once');
  steps(saved, 5 * EVERY);
  assert.equal(saved.grid[at(5, 5)], 0, 'nothing rebuilds by itself');
  assert.equal(applyCommand(saved, 0, { c: 'rebuild' }).n, 1);
  // Even without migrateSave (a joined client's copy), the old fields do no harm.
  const raw = JSON.parse(JSON.stringify(s));
  raw.players[0].autoRebuild = true;
  steps(raw, 5 * EVERY);
  assert.equal(raw.grid[at(5, 5)], 0);
  assert.equal(applyCommand(raw, 0, { c: 'rebuild' }).n, 1);
});

test('the game ending gives back every held dollar (the end screen counts cash)', () => {
  const s = createGame({ seed: 4 });
  addPlayer(s, 'Dave');
  assert.ok(place(s, 'crate', 9, 3).ok);
  lieDown(s, 5, 5);
  s.rubble.push(crateRubble(5, 5));
  const cash = s.players[0].cash;
  applyCommand(s, 0, { c: 'rebuild' });
  assert.equal(heldFor(s, 0), CRATE_HALF);
  // The last refund the store can take: a shopper reaching a till.
  s.refunds = s.refundLimit - 1;
  s.phase = 'wave';
  s.shoppers.push({ id: 950, k: 'hunter', x: W - 1.5, y: 7.5, vx: 0, vy: 0, hp: 1e6, mhp: 1e6, st: ST.WALK, t: 0, cd: 0, ox: 0, oy: 0, lt: -1, sv: 1 });
  let refund = 0;
  for (let i = 0; i < 10 * TICK_HZ && s.phase !== 'lost'; i++) for (const e of step(s)) if (e.e === 'escape') refund += e.refund;
  assert.equal(s.phase, 'lost');
  assert.equal(heldFor(s, 0), 0);
  assert.equal(s.rubble[0].by, undefined);
  assert.equal(s.players[0].cash, cash - refund, 'the crate money is back; only the refund is gone');
});

test('money is conserved: cash plus held plus spent never changes across a scripted run', () => {
  const s = stage(3);
  addPlayer(s, 'Steve');
  s.players[0].cash = 2000;
  s.players[1].cash = 500;
  const total = (pid) => s.players[pid].cash + heldFor(s, pid) + s.players[pid].all.spent;
  const start = [total(0), total(1)];
  const check = (what) => assert.deepEqual([total(0), total(1)], start, what);
  for (let y = 2; y <= 12; y += 2) { place(s, 'crate', 4, y); place(s, 'forklift', 6, y); place(s, 'crate', 8, y, 1); }
  applyCommand(s, 0, { c: 'upgrade', x: 6, y: 4, t: 'dmg' });
  applyCommand(s, 0, { c: 'upgrade', x: 6, y: 4, t: 'rng' });
  check('after building');
  wreckAt(s, 4, 2); wreckAt(s, 6, 4); wreckAt(s, 8, 6); wreckAt(s, 6, 8);
  const d1 = lieDown(s, 6, 4), d2 = lieDown(s, 8, 6);
  applyCommand(s, 0, { c: 'rebuild' });
  applyCommand(s, 1, { c: 'rebuild' });
  check('after the presses');
  steps(s, 4 * EVERY);
  getUp(s, d1);
  steps(s, 2 * EVERY);
  check('after one went back late');
  wreckAt(s, 4, 10);
  lieDown(s, 4, 10);
  applyCommand(s, 0, { c: 'rebuild' });
  assert.ok(place(s, 'wetfloor', 4, 10, 1).ok, 'Steve builds over Dave\'s paid-for hole');
  check('after something was built over a paid-for hole');
  getUp(s, d2);
  steps(s, 3 * EVERY);
  check('at the end');
  assert.equal(heldFor(s, 0) + heldFor(s, 1), 0, 'nothing is left waiting');
});

/** Gym bros through a corridor of crates, Rebuild pressed every second; the final state and counts. */
function gymBroRun() {
  const s = stage(9);
  for (let x = 2; x <= 27; x++) { place(s, 'crate', x, 6); place(s, 'crate', x, 8); }
  queueTrainingWave(s, [{ k: 'gymbro', n: 4, gap: 2, at: 0 }, { k: 'hunter', n: 6, gap: 1, at: 1 }]);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  let broke = 0, now = 0, late = 0, held = 0;
  for (let i = 0; i < 90 * TICK_HZ; i++) {
    if (i % TICK_HZ === 0 && s.rubble.length) {
      const r = applyCommand(s, 0, { c: 'rebuild' });
      if (r.ok) { now += r.n; held += r.held; }
    }
    const ev = step(s);
    for (const e of ev) {
      if (e.e === 'smash' && e.left === 0) broke++;
      if (e.e === 'rebuilt' && e.late) late += e.n;
    }
    if (ev.some((e) => e.e === 'waveEnd')) break;
  }
  return { s, broke, now, late, held };
}

test('real gym bros with Rebuild pressed every second: wrecks go back, and the game is deterministic', () => {
  const a = gymBroRun(), b = gymBroRun();
  assert.ok(a.broke > 0, 'the gym bros broke something');
  assert.ok(a.now + a.late > 0, 'and presses put it back');
  assert.equal(a.late, a.held - a.s.rubble.filter((r) => r.by !== undefined).length, 'every held wreck went back late, or still waits');
  assert.equal(checksum(a.s), checksum(b.s), 'two runs end the same');
  assert.equal(JSON.stringify(a.s), JSON.stringify(b.s));
});

test('the checksum sees money held for a rebuild', () => {
  const s = stage();
  lieDown(s, 5, 5);
  s.rubble.push(crateRubble(5, 5));
  applyCommand(s, 0, { c: 'rebuild' });
  const c = checksum(s);
  const t = JSON.parse(JSON.stringify(s));
  t.rubble[0].res += 10;
  assert.notEqual(checksum(t), c);
});

// ---------------------------------------------------------------- the big REBUILD button

test('the big REBUILD button: hidden with nothing wrecked; count and price; dimmed when too broke; waiting when all is paid for', () => {
  const s = stage();
  addPlayer(s, 'Steve');
  assert.equal(rebuildStatus(s, 0), null, 'nothing wrecked: no button');
  const fork = forkRubble(5, 5);
  s.rubble.push(fork, crateRubble(9, 5), crateRubble(11, 5, 1));
  const full = 296 + CRATE_HALF;
  const ready = { n: 2, cost: full, can: true, why: '', held: 0, paid: 0, full: 0, wait: '' };
  assert.deepEqual(rebuildStatus(s, 0), ready, 'his two, not Steve\'s');
  assert.deepEqual(rebuildWords(ready), { look: 'ready', count: `REBUILD 2 · $${full}`, sub: 'Your shit is broken. Fix it', label: `Rebuild 2 wrecks for $${full}` });
  assert.equal(rebuildStatus(s, 1).n, 1);

  // Too little cash for anything: dimmed, and what the cheapest needs.
  s.players[0].cash = CRATE_HALF - 1;
  const broke = rebuildStatus(s, 0);
  assert.equal(broke.can, false);
  assert.equal(broke.why, `Too broke. Need $${CRATE_HALF}`);
  assert.equal(rebuildWords(broke).look, 'dim');
  assert.equal(rebuildWords(broke).sub, `Too broke. Need $${CRATE_HALF}`);
  // Enough for the crate: B would order it, so the button is lit.
  s.players[0].cash = CRATE_HALF;
  assert.equal(rebuildStatus(s, 0).can, true);

  // Someone lying in the forklift's hole; money for the bare forklift and a level, so it waits.
  s.players[0].cash = 140;
  lieDown(s, 5, 5);
  const r = applyCommand(s, 0, { c: 'rebuild' });
  assert.equal(r.held, 1);
  const some = rebuildStatus(s, 0);
  assert.deepEqual(some, { n: 1, cost: CRATE_HALF, can: false, why: `Too broke. Need $${CRATE_HALF}`, held: 1, paid: 140, full: 296, wait: 'Some idiot is standing in the hole' });
  s.players[0].cash = 1000;
  assert.equal(rebuildWords(rebuildStatus(s, 0)).sub, '1 more paid for and waiting');
  applyCommand(s, 0, { c: 'rebuild' });
  // Everything of his paid for: dimmed, how much is paid, why it waits.
  steps(s, 1);
  const waiting = rebuildStatus(s, 0);
  assert.equal(waiting.n, 0);
  assert.equal(waiting.held, 1);
  assert.equal(waiting.wait, 'Some idiot is standing in the hole');
  s.players[0].cash = 0;
  const words = rebuildWords({ ...waiting, paid: 140 });
  assert.equal(words.look, 'waiting');
  assert.equal(words.count, 'PAID $140 of $296 · 1 waiting');
  assert.equal(words.sub, 'Some idiot is standing in the hole');
  assert.equal(rebuildWords({ ...waiting, paid: 296 }).count, 'PAID $296 · 1 waiting');
  // Once it has gone back, nothing of his is left.
  s.shoppers.length = 0;
  steps(s, EVERY);
  assert.equal(rebuildStatus(s, 0), null, 'it went back: nothing left');
});

test('the big REBUILD button: never for Head Office, or when the game is over', () => {
  const s = createGame({ seed: 2 });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  s.rubble.push(crateRubble(5, 5, 1));
  assert.equal(rebuildStatus(s, 1).n, 1);
  assert.ok(applyCommand(s, 1, { c: 'side', side: 'office' }).ok);
  assert.equal(rebuildStatus(s, 1), null);
  s.phase = 'lost';
  assert.equal(rebuildStatus(s, 0), null);
});

// ---------------------------------------------------------------- players who are away

/** Dave and Steve; Steve has paid for a bare forklift that waits behind a drunk. */
function awayStage() {
  const s = stage();
  addPlayer(s, 'Steve');
  const drunk = lieDown(s, 5, 5);
  const r = forkRubble(5, 5, 1);
  s.rubble.push(r);
  s.players[1].cash = FORK_HALF;
  assert.equal(applyCommand(s, 1, { c: 'rebuild' }).held, 1);
  assert.equal(r.res, FORK_HALF);
  return { s, r, drunk };
}

test('a payer who is away is not topped up, but what he already paid for still goes back when the way clears', () => {
  const { s, r, drunk } = awayStage();
  setPlayerOnline(s, 1, false);
  s.players[1].cash = 1000; // (as if it had been his before he left)
  steps(s, 3 * EVERY);
  assert.equal(r.res, FORK_HALF, 'nothing more taken while he is away');
  assert.equal(s.players[1].cash, 1000);
  getUp(s, drunk);
  const ev = steps(s, EVERY);
  assert.equal(s.grid[at(5, 5)].k, 'forklift');
  assert.equal(s.grid[at(5, 5)].o, 1);
  assert.equal(s.grid[at(5, 5)].u, undefined, 'bare, as paid');
  assert.deepEqual(rebuilt(ev), [{ e: 'rebuilt', by: 1, n: 1, short: 1, late: 1 }]);
  assert.equal(s.players[1].cash, 1000);
});

test('when an away player\'s grace period runs out, his held money is shared out with his cash and his wrecks are plain rubble again', () => {
  const { s, r } = awayStage();
  s.players[1].cash = 95;
  const dave = s.players[0].cash;
  setPlayerOnline(s, 1, false);
  s.players[1].gone = Math.round(TUNE.graceSecs * TICK_HZ) - 1;
  step(s);
  assert.equal(s.players[1].gone, undefined, 'his grace period is over');
  assert.equal(s.players[1].cash, 0);
  assert.equal(s.players[0].cash, dave + 95 + FORK_HALF, 'Dave, the only one left, gets all of it, held money included');
  assert.equal(r.by, undefined);
  assert.equal(r.res, undefined);
  assert.equal(heldFor(s, 1), 0);
  assert.equal(s.rubble.length, 1, 'still a wreck, nobody\'s order');
});

test('a player who comes back within his grace period keeps his orders', () => {
  const { s, r } = awayStage();
  setPlayerOnline(s, 1, false);
  steps(s, 10 * EVERY);
  setPlayerOnline(s, 1, true);
  s.players[1].cash = 0;
  steps(s, Math.round(TUNE.graceSecs * TICK_HZ) + EVERY);
  assert.equal(r.by, 1);
  assert.equal(r.res, FORK_HALF);
  assert.equal(heldFor(s, 1), FORK_HALF);
});
