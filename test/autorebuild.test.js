// Tests for auto-rebuild (0.2.15, the owner's request): a switch per player that puts his wrecked
// buildings back for him, exactly as the B key would, but never sooner than TUNE.autoRebuildSecs
// of game time after each broke, so the shoppers behind a gym bro still get through the gap.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, step, queueTrainingWave, rebuildDeal, migrateSave, spentOn,
  BUILD, TUNE, TICK_HZ, ST,
} from '../src/sim/index.js';
import { checksum } from '../src/net/session.js';
import { rebuildStatus } from '../src/ui/rebuild.js';

// The original small map, 30 tiles by 16: entrance on the left at rows 7-8, tills on the right.
const W = 30;
const at = (x, y) => y * W + x;
const WAIT = 2 * TICK_HZ; // 2 seconds of game time, in ticks
const CRATE_HALF = Math.floor(BUILD.crate.cost * TUNE.rebuildShare);

/** A training game (no timer, cannot be lost): Dave with plenty of cash. */
function stage(seed = 5) {
  const s = createGame({ seed, training: true });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  return s;
}
const place = (s, k, x, y, pid = 0) => applyCommand(s, pid, { c: 'place', k, x, y, d: 0 });
/** Rubble as a gym bro leaves it, broken this very tick unless told otherwise. */
const crateRubble = (s, x, y, o = 0, ago = 0) => ({ i: at(x, y), k: 'crate', d: 0, o, u: {}, spent: BUILD.crate.cost, at: s.tick - ago });
const steps = (s, n) => { const ev = []; for (let i = 0; i < n; i++) ev.push(...step(s)); return ev; };

test('the numbers: 2 seconds of game time before an auto-rebuild, retries every 0.2 s', () => {
  assert.equal(TUNE.autoRebuildSecs, 2);
  assert.equal(TUNE.autoRebuildEvery, 0.2);
});

test('auto-rebuild is off by default, and the switch changes only the sender\'s own', () => {
  const s = stage();
  addPlayer(s, 'Steve');
  assert.ok(!s.players[0].autoRebuild && !s.players[1].autoRebuild);
  const ev = [];
  assert.ok(applyCommand(s, 1, { c: 'autoRebuild', on: true }, ev).ok);
  assert.equal(s.players[1].autoRebuild, true);
  assert.ok(!s.players[0].autoRebuild, 'Dave\'s is untouched');
  assert.deepEqual(ev, [{ e: 'autoRebuild', by: 1, on: true }]);
  // Without `on` it flips.
  applyCommand(s, 1, { c: 'autoRebuild' });
  assert.equal(s.players[1].autoRebuild, false);
  applyCommand(s, 0, { c: 'autoRebuild' });
  assert.equal(s.players[0].autoRebuild, true);
  assert.equal(s.players[1].autoRebuild, false);
  // It is JSON-safe (it travels in the state to every client).
  assert.deepEqual(JSON.parse(JSON.stringify(s)).players.map((p) => p.autoRebuild), [true, false]);
});

test('it may be switched on in the lobby, and Head Office may not use it', () => {
  const lobby = createGame({ lobby: true });
  addPlayer(lobby, 'Dave');
  assert.ok(applyCommand(lobby, 0, { c: 'autoRebuild', on: true }).ok);
  const s = createGame({ seed: 2 });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  assert.ok(applyCommand(s, 1, { c: 'side', side: 'office' }).ok);
  assert.equal(applyCommand(s, 1, { c: 'autoRebuild', on: true }).why, 'office');
});

test('a wreck is not put back before 2 seconds of game time, and is at the first tick after, at the normal price', () => {
  const s = stage();
  applyCommand(s, 0, { c: 'autoRebuild', on: true });
  const r = crateRubble(s, 5, 5);
  s.rubble.push(r);
  const cash = s.players[0].cash;
  const price = rebuildDeal(r, Infinity).pay;
  assert.equal(price, CRATE_HALF);
  steps(s, WAIT - 1);
  assert.equal(s.grid[at(5, 5)], 0, 'still rubble one tick before the 2 seconds are up');
  assert.equal(s.players[0].cash, cash);
  const ev = step(s);
  assert.equal(s.tick - r.at, WAIT);
  assert.equal(s.grid[at(5, 5)].k, 'crate', 'back at the first tick it may be');
  assert.equal(s.grid[at(5, 5)].o, 0);
  assert.equal(s.rubble.length, 0);
  assert.equal(s.players[0].cash, cash - price, 'he paid what the B key charges');
  assert.deepEqual(ev.filter((e) => e.e === 'rebuilt'), [{ e: 'rebuilt', by: 0, n: 1, short: 0, auto: 1 }]);
});

test('the delay is in game time: the same number of ticks at 5x speed', () => {
  const s = stage();
  applyCommand(s, 0, { c: 'speed', n: 5 });
  applyCommand(s, 0, { c: 'autoRebuild', on: true });
  s.rubble.push(crateRubble(s, 5, 5));
  steps(s, WAIT - 1);
  assert.equal(s.grid[at(5, 5)], 0);
  step(s);
  assert.equal(s.grid[at(5, 5)].k, 'crate');
});

test('with it off nothing is rebuilt, and the B key still works at once, with no delay', () => {
  const s = stage();
  s.rubble.push(crateRubble(s, 5, 5));
  steps(s, 5 * TICK_HZ);
  assert.equal(s.grid[at(5, 5)], 0);
  s.rubble.push(crateRubble(s, 7, 5));
  applyCommand(s, 0, { c: 'autoRebuild', on: true });
  // The one broken 5 seconds ago went back when the switch went on; the fresh one waits...
  assert.equal(s.grid[at(5, 5)].k, 'crate');
  assert.equal(s.grid[at(7, 5)], 0);
  // ...but B does not wait.
  assert.ok(applyCommand(s, 0, { c: 'rebuild' }).ok);
  assert.equal(s.grid[at(7, 5)].k, 'crate');
});

test('switching it on tries at once anything broken for longer than the delay, including rubble from an old save', () => {
  const s = stage();
  s.rubble.push(crateRubble(s, 5, 5, 0, WAIT + 30));
  const old = crateRubble(s, 7, 5);
  delete old.at; // a save from before 0.2.15 does not know when it broke
  s.rubble.push(old);
  s.rubble.push(crateRubble(s, 9, 5, 0, WAIT - 10));
  const ev = [];
  applyCommand(s, 0, { c: 'autoRebuild', on: true }, ev);
  assert.ok(s.grid[at(5, 5)] && s.grid[at(7, 5)], 'both old ones are back');
  assert.equal(s.grid[at(9, 5)], 0, 'the young one waits out its 2 seconds');
  assert.deepEqual(ev.filter((e) => e.e === 'rebuilt'), [{ e: 'rebuilt', by: 0, n: 2, short: 0, auto: 1 }]);
  steps(s, 9);
  assert.equal(s.grid[at(9, 5)], 0);
  step(s);
  assert.equal(s.grid[at(9, 5)].k, 'crate');
});

test('an old save without the new fields loads and plays: auto-rebuild off, its rubble counted as long broken', () => {
  const s = stage();
  s.rubble.push(crateRubble(s, 5, 5));
  const saved = JSON.parse(JSON.stringify(s));
  for (const p of saved.players) delete p.autoRebuild;
  for (const r of saved.rubble) delete r.at;
  assert.equal(migrateSave(saved), false, 'nothing to migrate: the new fields are optional');
  steps(saved, WAIT + 10);
  assert.equal(saved.grid[at(5, 5)], 0, 'off, as it was before');
  applyCommand(saved, 0, { c: 'autoRebuild', on: true });
  assert.equal(saved.grid[at(5, 5)].k, 'crate');
});

test('a refused rebuild waits: a shopper on the tile, a route it would block, too little cash; then it happens', () => {
  const retry = Math.round(TUNE.autoRebuildEvery * TICK_HZ);
  const s = stage();
  applyCommand(s, 0, { c: 'autoRebuild', on: true });

  // A shopper lying on the tile (a fallen drunk, who stays put).
  s.shoppers.push({ id: 900, k: 'drinker', x: 5.5, y: 5.5, vx: 0, vy: 0, hp: 50, mhp: 50, st: ST.STUN, t: 1e6, cd: 0, ox: 0, oy: 0, lt: -1, sv: 1 });
  s.rubble.push(crateRubble(s, 5, 5));
  steps(s, WAIT + 3 * retry);
  assert.equal(s.grid[at(5, 5)], 0, 'not on top of him');
  s.shoppers.length = 0;
  steps(s, retry);
  assert.equal(s.grid[at(5, 5)].k, 'crate', 'back within one retry of him going');

  // A wall of crates down column 15 with one gap: putting the wreck back in the gap would wall
  // the entrance off from the tills.
  for (let y = 1; y <= 14; y++) if (y !== 7) assert.ok(place(s, 'crate', 15, y).ok, `crate at 15,${y}`);
  s.rubble.push(crateRubble(s, 15, 7));
  steps(s, WAIT + 3 * retry);
  assert.equal(s.grid[at(15, 7)], 0, 'it would block the route');
  assert.ok(applyCommand(s, 0, { c: 'remove', x: 15, y: 3 }).ok, 'another way through opens');
  steps(s, retry);
  assert.equal(s.grid[at(15, 7)].k, 'crate');

  // Too little cash.
  s.players[0].cash = CRATE_HALF - 1;
  s.rubble.push(crateRubble(s, 9, 5));
  steps(s, WAIT + 3 * retry);
  assert.equal(s.grid[at(9, 5)], 0);
  assert.equal(s.players[0].cash, CRATE_HALF - 1);
  s.players[0].cash = CRATE_HALF + 1;
  steps(s, retry);
  assert.equal(s.grid[at(9, 5)].k, 'crate');
  assert.equal(s.players[0].cash, 1, 'he paid the rebuild price');
});

test('short of money, the wreck that broke first is rebuilt first; younger ones do not take the money', () => {
  const s = stage();
  applyCommand(s, 0, { c: 'autoRebuild', on: true });
  const fork = { i: at(5, 5), k: 'forklift', d: 0, o: 0, u: {}, spent: BUILD.forklift.cost, at: s.tick };
  s.rubble.push(fork, crateRubble(s, 9, 5));
  const forkHalf = rebuildDeal(fork, Infinity).pay;
  s.players[0].cash = forkHalf - 1;
  steps(s, WAIT + 30);
  assert.equal(s.grid[at(5, 5)], 0);
  assert.equal(s.grid[at(9, 5)], 0, 'the crate is affordable, but it waits behind the forklift');
  s.players[0].cash = forkHalf + CRATE_HALF;
  steps(s, 6);
  assert.equal(s.grid[at(5, 5)].k, 'forklift');
  assert.equal(s.grid[at(9, 5)].k, 'crate');
  assert.equal(s.players[0].cash, 0);
});

test('one player\'s switch does not rebuild another player\'s buildings', () => {
  const s = stage();
  addPlayer(s, 'Steve');
  s.players[1].cash = 1000;
  applyCommand(s, 0, { c: 'autoRebuild', on: true });
  s.rubble.push(crateRubble(s, 5, 5, 1));
  const dave = s.players[0].cash;
  steps(s, WAIT + 30);
  assert.equal(s.grid[at(5, 5)], 0, 'Steve\'s crate stays down: his switch is off');
  assert.equal(s.players[0].cash, dave);
  assert.equal(s.players[1].cash, 1000);
  applyCommand(s, 1, { c: 'autoRebuild', on: true });
  assert.equal(s.grid[at(5, 5)].k, 'crate');
  assert.equal(s.players[1].cash, 1000 - CRATE_HALF, 'paid by Steve');
});

/** Gym bros through a corridor of crates with auto-rebuild on; returns the final state and what happened. */
function gymBroRun() {
  const s = stage(9);
  for (let x = 2; x <= 27; x++) { place(s, 'crate', x, 6); place(s, 'crate', x, 8); }
  applyCommand(s, 0, { c: 'autoRebuild', on: true });
  queueTrainingWave(s, [{ k: 'gymbro', n: 4, gap: 2, at: 0 }, { k: 'hunter', n: 6, gap: 1, at: 1 }]);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  let broke = 0, autos = 0, early = 0;
  for (let i = 0; i < 90 * TICK_HZ; i++) {
    const before = new Map(s.rubble.map((r) => [r.i, r.at]));
    const ev = step(s);
    for (const e of ev) {
      if (e.e === 'smash' && e.left === 0) {
        broke++;
        assert.equal(s.rubble.find((r) => r.i === e.i)?.at, s.tick, 'rubble remembers the tick it broke');
      }
      if (e.e === 'rebuilt' && e.auto) autos += e.n;
    }
    for (const [ti, t] of before) {
      if (!s.rubble.some((r) => r.i === ti) && s.grid[ti] && s.tick - t < WAIT) early++;
    }
    if (ev.some((e) => e.e === 'waveEnd')) break;
  }
  return { s, broke, autos, early };
}

test('real gym bros: every wreck waits out its 2 seconds, then comes back; and the game is deterministic', () => {
  const a = gymBroRun(), b = gymBroRun();
  assert.ok(a.broke > 0, 'the gym bros broke something');
  assert.ok(a.autos > 0, 'and auto-rebuild put it back');
  assert.equal(a.early, 0, 'nothing came back sooner than 2 seconds after it broke');
  assert.equal(checksum(a.s), checksum(b.s), 'two runs end the same');
  assert.equal(JSON.stringify(a.s), JSON.stringify(b.s));
});

// ---------------------------------------------------------------- the big REBUILD button (0.2.15)

test('the big REBUILD button: hidden with nothing wrecked; count and price; dimmed with the reason when B would be refused', () => {
  const s = stage();
  addPlayer(s, 'Steve');
  assert.equal(rebuildStatus(s, 0), null, 'nothing wrecked: no button');
  const fork = { i: at(5, 5), k: 'forklift', d: 0, o: 0, u: { dmg: 1 }, spent: spentOn({ k: 'forklift', u: { dmg: 1 } }), at: s.tick };
  s.rubble.push(fork, crateRubble(s, 9, 5), crateRubble(s, 11, 5, 1));
  const full = rebuildDeal(fork, Infinity).pay + CRATE_HALF;
  assert.deepEqual(rebuildStatus(s, 0), { n: 2, cost: full, can: true, why: '', auto: false }, 'his two, not Steve\'s');
  assert.equal(rebuildStatus(s, 1).n, 1);

  // Too little cash for anything: dimmed, and what the oldest needs.
  s.players[0].cash = CRATE_HALF - 1;
  const forkHalf = Math.floor(BUILD.forklift.cost * TUNE.rebuildShare);
  assert.deepEqual(rebuildStatus(s, 0), { n: 2, cost: full, can: false, why: `Too broke. Need $${forkHalf}`, auto: false });
  // Enough for the crate: B would put that back, so the button is lit.
  s.players[0].cash = CRATE_HALF;
  assert.equal(rebuildStatus(s, 0).can, true);
  assert.equal(applyCommand(s, 0, { c: 'rebuild' }).n, 1, 'and B agrees');

  // Someone lying in the last hole.
  s.players[0].cash = 1e6;
  s.rubble.length = 0;
  s.rubble.push(crateRubble(s, 5, 5, 0, WAIT)); // broke 2 seconds ago
  s.shoppers.push({ id: 900, k: 'drinker', x: 5.5, y: 5.5, vx: 0, vy: 0, hp: 50, mhp: 50, st: ST.STUN, t: 1e6, cd: 0, ox: 0, oy: 0, lt: -1, sv: 1 });
  const st = rebuildStatus(s, 0);
  assert.equal(st.can, false);
  assert.match(st.why, /standing in the hole/);
  assert.equal(applyCommand(s, 0, { c: 'rebuild' }).why, 'shopper', 'B is refused for the same reason');
  s.shoppers.length = 0;

  // The switch shows in it, and something built over the hole does not count.
  applyCommand(s, 0, { c: 'autoRebuild', on: true });
  s.rubble.push(crateRubble(s, 7, 7));
  assert.equal(rebuildStatus(s, 0).auto, true);
  assert.equal(rebuildStatus(s, 0).n, 1, 'the crate at 5,5 went back when the switch went on');
  assert.ok(place(s, 'sprinkler', 7, 7).ok);
  assert.equal(rebuildStatus(s, 0), null, 'built over: nothing left to rebuild');
});

test('the big REBUILD button: never for Head Office, or when the game is over', () => {
  const s = createGame({ seed: 2 });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  s.rubble.push(crateRubble(s, 5, 5, 1));
  assert.equal(rebuildStatus(s, 1).n, 1);
  assert.ok(applyCommand(s, 1, { c: 'side', side: 'office' }).ok);
  assert.equal(rebuildStatus(s, 1), null);
  s.phase = 'lost';
  assert.equal(rebuildStatus(s, 0), null);
});
