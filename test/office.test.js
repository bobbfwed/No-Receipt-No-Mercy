// Tests for Head Office: a player who runs the shoppers instead of the store.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, setPlayerOnline, applyCommand, step, waveSpec, priceOf, waveValue, officePlayer,
  canBuy, planCost, shareCount, SHOPPERS, OFFICE, TUNE, TICK_HZ,
} from '../src/sim/index.js';

/** Dave runs the store, Steve has taken the Head Office job. */
function withOffice(seed = 4, map = { design: 'warehouse', size: 'm' }) {
  const s = createGame({ seed, map, zones: false }); // these tests are not about where machines go
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  assert.ok(applyCommand(s, 1, { c: 'side', side: 'office' }).ok);
  return s;
}
const plan = (s, groups) => applyCommand(s, 1, { c: 'plan', groups });
/** Both sides ask for the doors to open. */
function open(s) {
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  assert.ok(applyCommand(s, 1, { c: 'start' }).ok);
  assert.equal(s.phase, 'wave');
}
function playWave(s, each = () => {}) {
  const all = [];
  for (let i = 0; i < 400 * TICK_HZ; i++) {
    const ev = step(s);
    all.push(...ev);
    each();
    if (ev.some((e) => e.e === 'waveEnd' || e.e === 'lost')) break;
  }
  return all;
}

test('prices follow how tough, fast and tricky a shopper is', () => {
  assert.ok(priceOf('clipper') < priceOf('hunter'));
  assert.ok(priceOf('hunter') < priceOf('dad'));
  assert.ok(priceOf('dad') < priceOf('karen'));
  for (const k of Object.keys(SHOPPERS)) {
    assert.ok(OFFICE.kinds[k], `${k} has a price`);
    assert.ok(priceOf(k, 1) >= priceOf(k, 0) * 2, `a super ${k} costs at least twice as much`);
  }
  assert.ok(waveValue(10) > waveValue(5) * 2);
  // (Event 6, not 5: since the crowd was halved in 0.2.09, most groups of the boss's event 5 are a
  // single shopper whatever the number of players.)
  assert.ok(waveValue(6, 3) > waveValue(6, 1) * 1.5);
});

test('the first wave a kind can be bought for is the wave the automatic waves first use it', () => {
  for (const [k, kind] of Object.entries(OFFICE.kinds)) {
    let first = 0;
    for (let n = 1; n <= 20 && !first; n++) if (waveSpec(n).some((g) => g.k === k)) first = n;
    assert.equal(kind.from, first, k);
    assert.equal(canBuy(k, 0, first), true);
    if (first > 1) assert.equal(canBuy(k, 0, first - 1), false);
    assert.equal(canBuy(k, 1, SHOPPERS[k].sup.from - 1), false);
    assert.equal(canBuy(k, 1, SHOPPERS[k].sup.from), true);
  }
});

test('the job needs somebody left in the store, and only one player can hold it', () => {
  const solo = createGame();
  addPlayer(solo, 'Dave');
  assert.equal(applyCommand(solo, 0, { c: 'side', side: 'office' }).why, 'lonely');

  const s = createGame();
  for (const n of ['Dave', 'Steve', 'Gaz']) addPlayer(s, n);
  assert.ok(applyCommand(s, 1, { c: 'side', side: 'office' }).ok);
  assert.equal(officePlayer(s).name, 'Steve');
  assert.equal(applyCommand(s, 2, { c: 'side', side: 'office' }).why, 'taken');
  // The last store player cannot leave it empty.
  setPlayerOnline(s, 2, false);
  assert.equal(applyCommand(s, 0, { c: 'side', side: 'office' }).why, 'taken');
  // He can hand the job back, and then someone else may take it.
  assert.ok(applyCommand(s, 1, { c: 'side', side: 'store' }).ok);
  assert.equal(s.office, null);
  assert.ok(applyCommand(s, 0, { c: 'side', side: 'office' }).ok);
  // Not while the doors are open.
  const t = withOffice();
  open(t);
  assert.equal(applyCommand(t, 1, { c: 'side', side: 'store' }).why, 'phase');

  const training = createGame({ training: true });
  addPlayer(training, 'Dave');
  addPlayer(training, 'Steve');
  assert.equal(applyCommand(training, 1, { c: 'side', side: 'office' }).ok, false);
});

test('Head Office cannot touch the store and takes no share of its money', () => {
  const s = withOffice();
  assert.equal(applyCommand(s, 1, { c: 'place', k: 'crate', x: 5, y: 5 }).why, 'office');
  assert.equal(applyCommand(s, 1, { c: 'give', to: 0, n: 10 }).why, 'office');
  assert.equal(applyCommand(s, 1, { c: 'rebuild' }).why, 'office');
  assert.equal(shareCount(s), 1, 'the crowd and the bonus are sized for one store player');
  for (const [k, x, y] of [['unpacker', 3, 3], ['belt', 4, 3], ['chute', 5, 3]]) applyCommand(s, 0, { c: 'place', k, x, y, d: 0 });
  const dave = s.players[0].cash, steve = s.players[1].cash;
  let sales = 0;
  for (let i = 0; i < 15 * TICK_HZ; i++) sales += step(s).filter((e) => e.e === 'sale').length;
  assert.ok(sales > 0);
  assert.ok(s.players[0].cash > dave, 'Dave gets all of it');
  assert.equal(s.players[1].cash, steve);
});

test('his budget is a share of what the automatic wave is worth, and a plan must fit it', () => {
  const s = withOffice();
  assert.equal(s.office.budget, Math.round(waveValue(1, 1) * OFFICE.share));
  const each = priceOf('hunter');
  const most = Math.floor(s.office.budget / each);
  assert.equal(plan(s, [{ k: 'hunter', n: most + 1, sup: 0, door: 0, at: 0 }]).why, 'budget');
  assert.ok(plan(s, [{ k: 'hunter', n: most, sup: 0, door: 0, at: 0 }]).ok);
  assert.equal(planCost(s.office.plan), most * each);

  // Kinds that have not arrived yet, entrances that are not open, and nonsense are refused.
  assert.equal(plan(s, [{ k: 'karen', n: 1, sup: 0, door: 0, at: 0 }]).why, 'locked');
  assert.equal(plan(s, [{ k: 'hunter', n: 1, sup: 1, door: 0, at: 0 }]).why, 'locked');
  assert.equal(plan(s, [{ k: 'hunter', n: 1, sup: 0, door: 4, at: 0 }]).why, 'door');
  for (const bad of [
    [{ k: 'ghost', n: 1, sup: 0, door: 0, at: 0 }], [{ k: 'hunter', n: 0, sup: 0, door: 0, at: 0 }],
    [{ k: 'hunter', n: 1.5, sup: 0, door: 0, at: 0 }], [{ k: 'hunter', n: 1, sup: 0, door: 0, at: 999 }],
    [{ k: 'hunter', n: 1, sup: 0, door: -1, at: 0 }], 'hunters', null,
  ]) assert.equal(plan(s, bad).why, 'bad');
  assert.equal(planCost(s.office.plan), most * each, 'a refused plan leaves the old one in place');
  // The store side cannot write his plan for him.
  assert.equal(applyCommand(s, 0, { c: 'plan', groups: [] }).why, 'bad');
});

test('the doors open early only when both sides ask', () => {
  const s = withOffice();
  const r = applyCommand(s, 0, { c: 'start' });
  assert.ok(r.ok && r.waiting);
  assert.equal(s.phase, 'build');
  assert.ok(applyCommand(s, 1, { c: 'start' }).ok);
  assert.equal(s.phase, 'wave');
  assert.equal(s.storeReady, false, 'the flags reset for the next wave');
  assert.equal(s.office.ready, false);
});

test('his plan replaces the automatic wave: right shoppers, right entrances, right times', () => {
  const s = withOffice();
  s.wave = 6; // so the next wave is 7 and there is money for something interesting
  applyCommand(s, 1, { c: 'side', side: 'store' });
  applyCommand(s, 1, { c: 'side', side: 'office' });
  const budget = s.office.budget;
  assert.equal(budget, Math.round(waveValue(7, 1) * OFFICE.share));
  const groups = [
    { k: 'dad', n: 6, sup: 0, door: 1, at: 0 },
    { k: 'hunter', n: 2, sup: 1, door: 0, at: 5 },
  ];
  assert.ok(plan(s, groups).ok);
  const cost = planCost(groups);
  const startEv = [];
  applyCommand(s, 0, { c: 'start' }, startEv);
  applyCommand(s, 1, { c: 'start' }, startEv);
  assert.equal(startEv.find((e) => e.e === 'waveStart').office, 1);
  assert.equal(s.spawnQ.length, 8);
  const seen = new Map();
  let firstSuperTick = 0;
  const start = s.tick;
  const ev = playWave(s, () => {
    for (const sh of s.shoppers) {
      if (seen.has(sh.id)) continue;
      const tile = (sh.y | 0) * s.w + (sh.x | 0);
      seen.set(sh.id, { k: sh.k, sup: sh.sup | 0, door: s.doors.findIndex((d) => d.includes(tile)) });
      if (sh.sup && !firstSuperTick) firstSuperTick = s.tick;
    }
  });
  const made = [...seen.values()];
  assert.equal(made.length, 8);
  assert.equal(made.filter((m) => m.k === 'dad' && !m.sup && m.door === 1).length, 6, 'six dads through the second entrance');
  assert.equal(made.filter((m) => m.k === 'hunter' && m.sup && m.door === 0).length, 2, 'two Doorbusters through the first');
  assert.ok(Math.abs((firstSuperTick - start) / TICK_HZ - 5) < 0.2, 'the second group started five seconds in');

  // Afterwards: half of what he did not spend carries over, plus a little per refund.
  const escaped = ev.filter((e) => e.e === 'escape').length;
  assert.ok(escaped > 0);
  const want = Math.round(waveValue(8, 1) * OFFICE.share + Math.round((budget - cost) * OFFICE.carry) + OFFICE.perRefund * escaped);
  assert.equal(s.office.budget, want);
  assert.deepEqual(s.office.plan, [], 'the plan is used up');
});

test('with no plan, or with Head Office gone, the usual wave comes', () => {
  const s = withOffice();
  open(s);
  assert.equal(s.spawnQ.length, waveSpec(1, 1).reduce((n, g) => n + g.n, 0));

  const t = withOffice();
  assert.ok(plan(t, [{ k: 'hunter', n: 1, sup: 0, door: 0, at: 0 }]).ok);
  setPlayerOnline(t, 1, false);
  assert.equal(officePlayer(t), null);
  // With him gone the store opens the doors by itself again.
  assert.ok(applyCommand(t, 0, { c: 'start' }).ok);
  assert.equal(t.phase, 'wave');
  assert.equal(t.spawnQ.length, waveSpec(1, 1).reduce((n, g) => n + g.n, 0));
});

test('Head Office wins by closing the store, and a game with him stays identical on a copy', () => {
  const s = withOffice(9);
  const b = JSON.parse(JSON.stringify(s));
  for (const g of [s, b]) {
    for (let w = 0; w < 30 && g.phase !== 'lost'; w++) {
      const n = Math.floor(g.office.budget / priceOf('hunter'));
      assert.ok(applyCommand(g, 1, { c: 'plan', groups: [{ k: 'hunter', n: Math.min(n, OFFICE.maxSize), sup: 0, door: w % 2, at: 0 }] }).ok);
      applyCommand(g, 0, { c: 'start' });
      applyCommand(g, 1, { c: 'start' });
      playWave(g);
    }
  }
  assert.equal(s.phase, 'lost', 'an undefended store closes');
  assert.equal(s.refunds, s.refundLimit);
  assert.equal(s.refundLimit, TUNE.refundLimit + TUNE.refundPerPlayer);
  assert.equal(JSON.stringify(s), JSON.stringify(b));
});

test('editing the plan takes back his ready, and he returns to the store if nobody else is in it', () => {
  const s = withOffice();
  assert.ok(applyCommand(s, 1, { c: 'start' }).ok);
  assert.equal(s.office.ready, true);
  assert.ok(plan(s, [{ k: 'hunter', n: 2, sup: 0, door: 0, at: 0 }]).ok);
  assert.equal(s.office.ready, false);
  // The store asks; the doors stay shut until he asks again.
  applyCommand(s, 0, { c: 'start' });
  assert.equal(s.phase, 'build');
  applyCommand(s, 1, { c: 'start' });
  assert.equal(s.phase, 'wave');
  assert.equal(s.waveAt, s.tick, 'the state records when the doors opened');

  const t = withOffice();
  setPlayerOnline(t, 0, false); // Dave, the only store player, drops out
  assert.equal(t.office, null);
  assert.equal(t.players[1].side, 'store');
  assert.ok(applyCommand(t, 1, { c: 'place', k: 'crate', x: 5, y: 5 }).ok, 'Steve can build again');
});
