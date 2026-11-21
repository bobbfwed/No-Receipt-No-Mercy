// Tests for version 0.2.09: fewer, tougher shoppers (TUNE.crowdScale and TUNE.patienceScale), a
// refund limit of 20, and the Pregnant Lady, who pops into a dozen babies when her patience runs
// out, unless a Barcode Laser finishes her. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, step, queueTrainingWave, waveSpec, priceOf, canBuy, checkPlan, modeOf,
  patienceGrowth, patienceScaleAt, crowdShiftAt, bossPatience, shopperDef, defOf, perHead, babyPace, migrateSave, STATE_VERSION,
  SHOPPERS, SUPERS, BABY, BOSS, OFFICE, TUNE, SETTINGS, TICK_HZ, NORMAL,
} from '../src/sim/index.js';
import { HostSession } from '../src/net/session.js';
import { SHOPPER_ORDER, patienceAt, shopperFacts, shopperTraits, countIn } from '../src/content/facts.js';
import { SHOPPER_HELP } from '../src/content/help.js';

const NORMAL_HP = SETTINGS.difficulty.normal.hp;
const place = (s, k, x, y, d = 0) => applyCommand(s, 0, { c: 'place', k, x, y, d });

/** Temporarily changes tuning numbers for one test. */
function tune(t, changes) {
  const old = {};
  for (const k of Object.keys(changes)) { old[k] = TUNE[k]; TUNE[k] = changes[k]; }
  t.after(() => Object.assign(TUNE, old));
}

/**
 * A real (not training) solo game on the original 30 x 16 map, Normal difficulty, with the doors
 * open on wave n and only these shoppers to come: [kind, super] each, one a second. `build` places
 * whatever the test needs first.
 */
function real(n, who, build = () => {}, seed = 3) {
  const s = createGame({ seed });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e5;
  s.refundLimit = 1e9;
  s.wave = n - 1;
  build(s);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  s.spawnQ = who.map(([k, sup], i) => [s.tick + 1 + i * TICK_HZ, k, sup ? 1 : 0, -1]);
  s.shoppers = [];
  return s;
}

/** Steps until `until(events)` is true or the time runs out. Returns every event seen. */
function play(s, seconds, until = () => false, each = () => {}) {
  const all = [];
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    const ev = step(s);
    all.push(...ev);
    each(ev);
    if (until(ev)) break;
  }
  return all;
}

/** Waits until a shopper of kind k is in the store and returns him. */
function arrive(s, k) {
  let found = null;
  play(s, 5, () => (found = s.shoppers.find((m) => m.k === k)));
  assert.ok(found, `${k} walked in`);
  return found;
}

// ---------------------------------------------------------------------------------------------
// The Pregnant Lady

test('she is an ordinary kind: in SHOPPERS with a super, priced by Head Office, in the handbook, from sales event 8', () => {
  const d = SHOPPERS.preggo, sup = SUPERS.preggo;
  assert.equal(d.name, 'Pregnant Lady');
  assert.equal(sup.name, 'Octomom');
  assert.equal(d.pops, 12);
  assert.equal(sup.pops, 24);
  assert.equal(sup.hp, d.hp * 2.5);
  assert.equal(d.sup.from, 14);
  assert.ok(d.browses, 'she stops for free samples: eating for thirteen');
  assert.ok(d.speed < SHOPPERS.hunter.speed && d.hp > SHOPPERS.hunter.hp * 3, 'slow, with lots of patience');
  assert.equal(OFFICE.kinds.preggo.from, 8);
  assert.ok(canBuy('preggo', 0, 8) && !canBuy('preggo', 0, 7) && canBuy('preggo', 1, 14) && !canBuy('preggo', 1, 13));
  assert.ok(SHOPPER_ORDER.includes('preggo'));
  assert.equal(shopperFacts('preggo').first, 8);
  assert.ok(countIn('preggo', 8).all >= 1 && countIn('preggo', 7).all === 0);
  assert.ok(countIn('preggo', 14).sup >= 1, 'an Octomom from sales event 14');
  // The laser is the counter, and the handbook and help say so.
  assert.match(SHOPPER_HELP.preggo.beat, /Barcode Laser/);
  assert.ok(shopperTraits('preggo', 0).some(([label, v]) => label === 'Out of patience' && /12 babies/.test(v) && /Barcode Laser/.test(v)));
  assert.ok(shopperTraits('preggo', 1).some(([label, v]) => label === 'Out of patience' && /24 babies/.test(v)));
});

for (const [sup, n] of [[0, 12], [1, 24]]) {
  test(`out of patience from anything but a Barcode Laser, ${sup ? 'an Octomom' : 'she'} pops into exactly ${n} babies`, () => {
    // A forklift near the entrance; she walks in with one patience left.
    const s = real(14, [['preggo', sup]], (g) => assert.ok(place(g, 'forklift', 3, 4).ok));
    const her = arrive(s, 'preggo');
    her.hp = 1;
    const copy = JSON.parse(JSON.stringify(s));
    let tick = null;
    const ev = play(s, 10, (e) => e.some((x) => x.e === 'pop') && (tick = e));
    assert.ok(tick, 'she popped');
    const pop = tick.find((e) => e.e === 'pop');
    assert.deepEqual(Object.keys(pop).sort(), ['e', 'n', 'sup', 'x', 'y']);
    assert.equal(pop.n, n);
    assert.equal(pop.sup, sup);
    // 'left' (why 'pop') comes first, then 'pop'; no 'nopop'.
    const left = tick.find((e) => e.e === 'left');
    assert.equal(left.k, 'preggo');
    assert.equal(left.why, 'pop');
    assert.ok(tick.indexOf(left) < tick.indexOf(pop));
    assert.ok(!ev.some((e) => e.e === 'nopop'));
    // She is gone at once and counts as stopped; the babies are where she stood.
    assert.ok(!s.shoppers.some((m) => m.k === 'preggo'), 'she is gone');
    assert.equal(s.ws.stopped, 1);
    const babies = s.shoppers.filter((m) => m.k === 'baby');
    assert.equal(babies.length, n);
    for (const b of babies) {
      // (They appear round her, then take their first step in the same tick.)
      const step1 = BABY.speed / TICK_HZ;
      assert.ok(Math.hypot(b.x - pop.x, b.y - pop.y) <= TUNE.popSpread * Math.SQRT2 + step1 + 1e-9, 'round where she stood');
      assert.equal(b.sup, undefined, 'babies have no super version');
      assert.equal(defOf(b), BABY);
      // Patience: the baby's base, grown by wave, difficulty and the event's patience multiplier, like everyone's.
      assert.ok(Math.abs(b.mhp - BABY.hp * patienceGrowth(14) * NORMAL_HP * patienceScaleAt(14)) < 1e-9);
      assert.ok(Math.abs(b.mhp - patienceAt('baby', 0, 14, NORMAL_HP)) < 1e-9, 'as the handbook says');
    }
    assert.ok(new Set(babies.map((b) => `${b.x},${b.y}`)).size > n / 2, 'spread out, not one dot');
    assert.equal(new Set(babies.map((b) => b.id)).size, n, 'every baby is its own shopper');
    // The state is still plain JSON and the same on a client that kept simulating from a copy.
    copy.shoppers.find((m) => m.k === 'preggo').hp = 1;
    for (let i = 0; i < 400 && copy.tick < s.tick; i++) step(copy);
    assert.equal(JSON.stringify(copy), JSON.stringify(s));
  });
}

test("a Barcode Laser's finishing hit gives 'nopop' and no babies", () => {
  // Facing south from x = 3, its beam crosses the route just inside the entrance.
  const s = real(8, [['preggo', 1]], (g) => assert.ok(place(g, 'railgun', 3, 2, 1).ok));
  const her = arrive(s, 'preggo');
  her.hp = 1;
  let tick = null;
  const ev = play(s, 15, (e) => e.some((x) => x.e === 'left') && (tick = e));
  assert.ok(tick, 'she left');
  assert.ok(tick.some((e) => e.e === 'rail'), 'the laser did it');
  const nopop = tick.find((e) => e.e === 'nopop');
  assert.deepEqual(Object.keys(nopop).sort(), ['e', 'sup', 'x', 'y']);
  assert.equal(nopop.sup, 1);
  assert.equal(tick.find((e) => e.e === 'left').why, 'annoyed', 'she storms off like anyone');
  assert.ok(!ev.some((e) => e.e === 'pop'));
  assert.ok(!s.shoppers.some((m) => m.k === 'baby'), 'no babies');
  assert.equal(s.ws.stopped, 1);
});

test('reaching a till she takes one refund, per head, and nothing pops (with security that hurts her on the way)', () => {
  // Pepper sprinklers either side of the route, just inside the entrance: they wear her down but
  // cannot finish her.
  const s = real(8, [['preggo', 0]], (g) => assert.ok(place(g, 'sprinkler', 6, 6).ok && place(g, 'sprinkler', 6, 9).ok));
  const cash = s.players[0].cash;
  const her = arrive(s, 'preggo');
  let low = her.hp;
  const ev = play(s, 90, (e) => e.some((x) => x.e === 'waveEnd'), () => { low = Math.min(low, her.hp); });
  assert.ok(low < her.mhp && low > 0, `the sprinklers hurt her (${Math.round(her.mhp)} down to ${Math.round(low)}) but did not finish her`);
  const esc = ev.filter((e) => e.e === 'escape');
  assert.equal(esc.length, 1);
  assert.equal(esc[0].k, 'preggo');
  assert.equal(esc[0].n, 1);
  assert.equal(esc[0].refund, SHOPPERS.preggo.refund * perHead());
  assert.equal(s.refunds, 1);
  assert.equal(s.players[0].cash, cash - SHOPPERS.preggo.refund * perHead() + ev.find((e) => e.e === 'waveEnd').bonus);
  assert.ok(!ev.some((e) => e.e === 'pop' || e.e === 'nopop'));
  assert.ok(!ev.some((e) => e.e === 'escape' && e.k === 'baby'));
});

test('a baby at a till costs cash but no refund, and the sales event is not over while babies are in the store', () => {
  const s = real(8, [['preggo', 0]], (g) => assert.ok(place(g, 'forklift', 3, 4).ok));
  const her = arrive(s, 'preggo');
  her.hp = 1;
  play(s, 10, (e) => e.some((x) => x.e === 'pop'));
  // Take the forklift away, so every baby gets through.
  assert.ok(applyCommand(s, 0, { c: 'remove', x: 3, y: 4 }).ok);
  assert.equal(s.spawnQ.length, 0);
  assert.equal(s.shoppers.length, 12, 'only the babies are left');
  const cash = s.players[0].cash;
  const escapes = [];
  let ended = null;
  play(s, 30, () => ended, (ev) => {
    for (const e of ev) {
      if (e.e === 'escape') escapes.push(e);
      if (e.e === 'waveEnd') ended = { e, after: escapes.length };
    }
  });
  assert.equal(escapes.length, 12, 'every baby got through');
  for (const e of escapes) {
    assert.equal(e.k, 'baby');
    assert.equal(e.n, 0, 'no refund toward the limit');
    assert.equal(e.refund, BABY.refund, 'cash only, $5 each');
    assert.equal(e.sup, 0);
  }
  assert.equal(s.refunds, 0);
  assert.equal(s.ws.escaped, 0);
  assert.equal(s.ws.refunded, 12 * BABY.refund);
  assert.ok(ended && ended.after === 12, 'the event ended only once the last baby was out');
  assert.equal(s.players[0].cash, cash - 12 * BABY.refund + ended.e.bonus);
});

test('a baby that runs out of patience just leaves', () => {
  // Pepper sprinklers either side of the route, just inside the entrance.
  const s = real(8, [['preggo', 0]], (g) => assert.ok(place(g, 'sprinkler', 6, 6).ok && place(g, 'sprinkler', 6, 9).ok));
  arrive(s, 'preggo').hp = 1;
  assert.ok(play(s, 15, (e) => e.some((x) => x.e === 'pop')).some((e) => e.e === 'pop'), 'a sprinkler made her pop');
  for (const b of s.shoppers) if (b.k === 'baby') b.hp = 1;
  const left = [];
  const ev = play(s, 20, (e) => e.some((x) => x.e === 'waveEnd'), (e) => left.push(...e.filter((x) => x.e === 'left')));
  assert.ok(left.length >= 1, 'the sprinkler saw some off');
  for (const e of left) { assert.equal(e.k, 'baby'); assert.equal(e.why, 'annoyed'); }
  assert.ok(!ev.some((e) => e.e === 'pop' || e.e === 'nopop'), 'nothing more comes out of a baby');
  assert.equal(s.ws.stopped, 1, 'a baby is not counted as a shopper stopped (she was)');
  // Nor in the player's own count, which the end-of-event review ranks by.
  assert.equal(s.players[0].w.stopped, 1);
  assert.equal(s.players[0].all.stopped, 1);
  assert.equal(s.refunds, 0);
  assert.equal(ev.filter((e) => e.e === 'escape').length + left.length, 12, 'every baby either got through or left');
});

test('each baby runs at its own pace, from its id: a litter strings out, and a copy of the state stays in step', () => {
  assert.equal(BABY.paceMin, 0.85);
  assert.equal(BABY.paceMax, 1.15);
  // No security after the pop, so nothing but their own pace sets them apart.
  const s = real(8, [['preggo', 1]], (g) => assert.ok(place(g, 'forklift', 3, 4).ok));
  arrive(s, 'preggo').hp = 1;
  play(s, 10, (e) => e.some((x) => x.e === 'pop'));
  assert.ok(applyCommand(s, 0, { c: 'remove', x: 3, y: 4 }).ok);
  const babies = s.shoppers.filter((m) => m.k === 'baby');
  assert.equal(babies.length, 24);
  const paces = babies.map((b) => babyPace(b.id));
  assert.ok(Math.min(...paces) >= BABY.paceMin && Math.max(...paces) <= BABY.paceMax);
  assert.ok(Math.max(...paces) - Math.min(...paces) > 0.25, 'spread over most of the range');
  assert.ok(Object.keys(babies[0]).every((key) => ['id', 'k', 'x', 'y', 'vx', 'vy', 'hp', 'mhp', 'st', 't', 'cd', 'ox', 'oy', 'lt'].includes(key)), 'no new field on a baby');
  const copy = JSON.parse(JSON.stringify(s));
  const walked = new Map(babies.map((b) => [b.id, 0]));
  for (let i = 0; i < 2 * TICK_HZ; i++) {
    step(s);
    step(copy);
    for (const b of babies) walked.set(b.id, walked.get(b.id) + Math.hypot(b.vx, b.vy));
  }
  const dist = [...walked.values()];
  assert.ok(new Set(dist.map((d) => d.toFixed(3))).size > 12, 'they do not all cover the same distance');
  const top = BABY.speed * BABY.paceMax * 2, bottom = BABY.speed * BABY.paceMin * 2;
  for (const d of dist) assert.ok(d <= top + 1e-6, `no faster than the top of the range (${d.toFixed(2)})`);
  assert.ok(Math.max(...dist) / Math.min(...dist) <= top / bottom + 1e-6);
  assert.equal(JSON.stringify(copy), JSON.stringify(s), 'host and client agree');
});

test('finished while standing on a till, she storms off like anyone there, and nothing pops', () => {
  // A forklift by the tills; she is put on a till tile with one patience left, just before it fires.
  const s = real(8, [['preggo', 0]], (g) => assert.ok(place(g, 'forklift', 26, 7).ok));
  const her = arrive(s, 'preggo');
  her.x = 29.5; her.y = 7.5; her.hp = 1;
  assert.equal(s.tiles[7 * s.w + 29], 'T');
  s.grid[7 * s.w + 26].cd = 0;
  const ev = step(s);
  assert.ok(ev.some((e) => e.e === 'shot'), 'the forklift fired');
  const left = ev.find((e) => e.e === 'left');
  assert.ok(left && left.k === 'preggo' && left.why === 'annoyed', 'she storms off');
  assert.ok(!ev.some((e) => e.e === 'pop' || e.e === 'nopop' || e.e === 'escape'), 'no babies, and no refund');
  assert.ok(!s.shoppers.some((m) => m.k === 'baby'));
  assert.equal(s.refunds, 0);
  // That is what happens to an ordinary shopper finished on a till too.
  const o = real(8, [['hunter', 0]], (g) => assert.ok(place(g, 'forklift', 26, 7).ok));
  const h = arrive(o, 'hunter');
  h.x = 29.5; h.y = 7.5; h.hp = 1;
  o.grid[7 * o.w + 26].cd = 0;
  const ev2 = step(o);
  assert.ok(ev2.some((e) => e.e === 'left' && e.k === 'hunter') && !ev2.some((e) => e.e === 'escape'));
});

test('it is the last hit that counts: laser first then a forklift pops her; a forklift first then the laser does not', () => {
  // Laser facing south across the route near the entrance; a forklift further on.
  const a = real(8, [['preggo', 0]], (g) => assert.ok(place(g, 'railgun', 3, 2, 1).ok && place(g, 'forklift', 9, 4).ok));
  const her = arrive(a, 'preggo');
  play(a, 10, (e) => e.some((x) => x.e === 'rail'));
  assert.ok(her.hp > 0 && her.hp < her.mhp && her.st !== 3, 'the laser hit her and she is still in the store');
  her.hp = 1;
  assert.ok(applyCommand(a, 0, { c: 'remove', x: 3, y: 2 }).ok, 'the laser is taken away');
  let tick = null;
  play(a, 15, (e) => e.some((x) => x.e === 'left') && (tick = e));
  assert.ok(tick && tick.some((e) => e.e === 'shot') && tick.some((e) => e.e === 'pop'), 'the forklift finished her: she popped');

  // The other way round: a forklift wears her down, then the laser (further along) finishes her.
  const b = real(8, [['preggo', 0]], (g) => assert.ok(place(g, 'forklift', 4, 4).ok && place(g, 'railgun', 12, 2, 1).ok));
  const she = arrive(b, 'preggo');
  play(b, 10, (e) => e.some((x) => x.e === 'shot'));
  assert.ok(she.hp < she.mhp, 'the forklift hit her');
  assert.ok(applyCommand(b, 0, { c: 'remove', x: 4, y: 4 }).ok, 'the forklift is taken away');
  she.hp = 1;
  tick = null;
  const ev = play(b, 20, (e) => e.some((x) => x.e === 'left') && (tick = e));
  assert.ok(tick && tick.some((e) => e.e === 'rail') && tick.some((e) => e.e === 'nopop'), 'the laser finished her: no pop');
  assert.ok(!ev.some((e) => e.e === 'pop') && !b.shoppers.some((m) => m.k === 'baby'));
});

test('late in an endless game the crowd is at or just under the halved cap, for one player and for several', () => {
  for (const p of [1, 2, 4]) {
    for (const n of [50, 80, 120]) {
      // (The cap takes the event's crowd share, like the crowd: see TUNE.crowdCurves.)
      const most = Math.round(TUNE.maxCrowd * (1 + TUNE.crowdPerPlayer * (p - 1)) * TUNE.crowdScale * crowdShiftAt(n));
      const g = waveSpec(n, p).filter((x) => x.k !== 'boss');
      const total = g.reduce((sum, x) => sum + x.n, 0);
      assert.ok(total <= most && total >= most - g.length, `event ${n}, ${p} players: ${total} (cap ${most})`);
    }
  }
});

test('a save from before 0.2.09 is brought up to date once when resumed: the same share of a new limit', () => {
  const old = createGame({ seed: 3 });
  for (const n of ['Dave', 'Steve']) addPlayer(old, n);
  old.v = 3;
  old.refundLimit = 50; // 40 plus 10, the old formula
  old.refunds = 25;
  assert.equal(migrateSave(old), true);
  assert.equal(old.refundLimit, 25, '20 plus 5 for the second player');
  assert.equal(old.refunds, 12, 'half used before, still about half: 12.5 rounded down');
  assert.equal(old.v, STATE_VERSION);
  assert.equal(migrateSave(old), false, 'only once');
  assert.equal(old.refunds, 12);
  // A new friend joining afterwards keeps the same limit and count.
  addPlayer(old, 'Gaz');
  assert.equal(old.refundLimit, 30);
  assert.equal(old.refunds, 12);
  // A save from this version is left alone.
  const now = createGame({ seed: 3 });
  addPlayer(now, 'Dave');
  now.refunds = 7;
  assert.equal(migrateSave(now), false);
  assert.equal(now.refundLimit, 20);
  assert.equal(now.refunds, 7);
  // And it happens when a save is resumed.
  const again = createGame({ seed: 3 });
  addPlayer(again, 'Dave');
  again.v = 3; again.refundLimit = 40; again.refunds = 30; again.wave = 6;
  const host = new HostSession({ name: 'Dave', state: again, resume: true });
  assert.equal(host.state.refundLimit, 20);
  assert.equal(host.state.refunds, 15);
  assert.equal(host.state.v, STATE_VERSION);
});

test('babies are in none of the lists of kinds, and Head Office cannot buy them', () => {
  assert.equal(SHOPPERS.baby, undefined);
  assert.equal(SUPERS.baby, undefined);
  assert.equal(OFFICE.kinds.baby, undefined);
  assert.ok(!SHOPPER_ORDER.includes('baby'));
  assert.equal(shopperDef('baby'), BABY);
  assert.equal(shopperDef('baby', 1), BABY, 'there is no super baby');
  assert.equal(defOf({ k: 'baby' }), BABY);
  assert.equal(modeOf('baby'), NORMAL, 'they walk like most shoppers');
  // Very fast, very little patience, and nothing distracts them.
  for (const [k, d] of Object.entries(SHOPPERS)) assert.ok(BABY.speed > d.speed && BABY.speed > SUPERS[k].speed, `faster than ${k}`);
  assert.ok(BABY.hp <= SHOPPERS.hunter.hp / 8);
  assert.ok(!BABY.browses && !BABY.gawks && !BABY.steady && !BABY.ignoresSigns);
  assert.deepEqual(BABY.pitch, [0, 0]);
  for (let n = 1; n <= 30; n++) assert.ok(!waveSpec(n).some((g) => g.k === 'baby'));
  assert.equal(canBuy('baby', 0, 30), false);
  // A plan naming them is refused, through the command as well.
  const s = createGame({ seed: 4, map: { design: 'warehouse', size: 'm' }, zones: false });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  s.wave = 9;
  assert.ok(applyCommand(s, 1, { c: 'side', side: 'office' }).ok);
  assert.equal(checkPlan(s, [{ k: 'baby', n: 1, sup: 0, door: 0, at: 0 }]), 'bad');
  assert.equal(checkPlan(s, [{ k: 'constructor', n: 1, sup: 0, door: 0, at: 0 }]), 'bad');
  assert.equal(applyCommand(s, 1, { c: 'plan', groups: [{ k: 'baby', n: 1, sup: 0, door: 0, at: 0 }] }).ok, false);
  assert.ok(applyCommand(s, 1, { c: 'plan', groups: [{ k: 'preggo', n: 1, sup: 0, door: 0, at: 0 }] }).ok, 'but he can buy her');
});

// ---------------------------------------------------------------------------------------------
// Fewer, tougher shoppers

test('an ordinary event has half the shoppers (a half rounded down, never below one) arriving over the same time, every kind still there', (t) => {
  assert.equal(TUNE.crowdScale, 0.5);
  const now = {};
  for (const p of [1, 2, 3]) for (let n = 1; n <= 25; n++) now[`${p}:${n}`] = waveSpec(n, p);
  tune(t, { crowdScale: 1 });
  for (const p of [1, 2, 3]) {
    for (let n = 1; n <= 25; n++) {
      const g = now[`${p}:${n}`], full = waveSpec(n, p);
      assert.deepEqual(g.map((x) => x.k), full.map((x) => x.k), `wave ${n}, ${p} players: the same kinds`);
      for (let i = 0; i < g.length; i++) {
        if (g[i].k === 'boss') { assert.deepEqual(g[i], full[i], 'the boss is one man either way'); continue; }
        assert.equal(g[i].n, Math.max(1, Math.floor(full[i].n / 2)), `wave ${n}, ${p} players: ${g[i].k}`);
        assert.ok(Math.abs(g[i].n * g[i].gap - full[i].n * full[i].gap) < 1e-6, 'over the same length of time');
        assert.ok(g[i].sup <= g[i].n && (full[i].sup > 0) === (g[i].sup > 0), 'supers whenever there were');
      }
    }
  }
  // Dads still come as a line, half as long and twice as far apart.
  const dads = (list) => list.find((x) => x.k === 'dad');
  assert.ok(Math.abs(dads(now['1:6']).gap - 2 * dads(waveSpec(6, 1)).gap) < 0.15);
});

test('patience is phased in: unchanged early, a straight line, then double; a dad drains in step; the boss is as he was', () => {
  assert.equal(TUNE.patienceScale, 2);
  assert.equal(TUNE.patienceFrom, 5);
  assert.equal(TUNE.patienceFull, 20);
  for (let n = 1; n <= 5; n++) assert.equal(patienceScaleAt(n), 1, `event ${n}: unchanged`);
  for (let n = 6; n < 20; n++) assert.ok(Math.abs(patienceScaleAt(n) - (1 + (n - 5) / 15)) < 1e-12, `event ${n}: on the line`);
  for (const n of [20, 21, 30, 100]) assert.equal(patienceScaleAt(n), 2, `event ${n}: double`);
  for (const [n, mul] of [[3, 1], [12, 1 + 7 / 15], [20, 2], [25, 2]]) {
    const s = real(n, [['hunter', 0], ['dad', 0]]);
    const hunter = arrive(s, 'hunter');
    assert.ok(Math.abs(hunter.mhp - SHOPPERS.hunter.hp * mul * NORMAL_HP * patienceGrowth(n)) < 1e-9, `event ${n}`);
    assert.ok(Math.abs(hunter.mhp - patienceAt('hunter', 0, n, NORMAL_HP)) < 1e-9, `event ${n}: and the handbook says so`);
    const dad = arrive(s, 'dad');
    const before = dad.hp;
    play(s, 1);
    assert.ok(Math.abs(before - dad.hp - SHOPPERS.dad.drain * mul) < 0.01, `event ${n}: his drain follows the multiplier`);
  }
  // The boss is one man, not the flood: grown by event alone, whatever the multiplier.
  for (const n of [5, 10, 20]) {
    const s = real(n, [['boss', 0]]);
    const boss = arrive(s, 'boss');
    assert.ok(Math.abs(boss.mhp - bossPatience(n, NORMAL_HP)) < 1e-9, `event ${n}`);
    assert.ok(Math.abs(boss.mhp - BOSS.hp * patienceGrowth(n) * NORMAL_HP * (1 + TUNE.bossTierHp * (n / 5 - 1))) < 1e-9);
  }
});

test("Head Office's shoppers walk in with the same patience as the automatic wave's", () => {
  const s = createGame({ seed: 4, map: { design: 'warehouse', size: 'm' }, zones: false });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  s.wave = 11;
  assert.ok(applyCommand(s, 1, { c: 'side', side: 'office' }).ok);
  s.office.budget = 1e6;
  assert.ok(applyCommand(s, 1, { c: 'plan', groups: [{ k: 'karen', n: 1, sup: 0, door: 0, at: 0 }] }).ok);
  // Both sides ask for the doors to open.
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  assert.ok(applyCommand(s, 1, { c: 'start' }).ok);
  assert.equal(s.phase, 'wave');
  play(s, 5, () => s.shoppers.length > 0);
  assert.equal(s.wave, 12);
  assert.equal(s.shoppers[0].k, 'karen', 'the bought wave came');
  assert.ok(Math.abs(s.shoppers[0].mhp - patienceAt('karen', 0, 12, NORMAL_HP)) < 1e-9);
});

test('what is paid per shopper doubles: refunds and Head Office prices', () => {
  assert.equal(perHead(), 2);
  for (const k of Object.keys(SHOPPERS)) {
    for (const sup of [0, 1]) {
      const d = sup ? SUPERS[k] : SHOPPERS[k];
      assert.equal(priceOf(k, sup), 2 * Math.max(1, Math.round((d.hp * d.speed * OFFICE.kinds[k].weight) / OFFICE.patiencePerDollar)), `${k} ${sup}`);
    }
    assert.equal(shopperFacts(k).refund, SHOPPERS[k].refund * 2);
  }
  assert.equal(OFFICE.perRefund, 10);
  assert.equal(OFFICE.kinds.hunter.gap, 1.2);
  const s = real(1, [['hunter', 1]]);
  const ev = play(s, 60, (e) => e.some((x) => x.e === 'escape'));
  assert.equal(ev.find((e) => e.e === 'escape').refund, SUPERS.hunter.refund * 2);
});

test('a training game is unchanged: its own waves, patience, drain and refunds', () => {
  const s = createGame({ seed: 5, training: true });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1000;
  queueTrainingWave(s, [{ k: 'hunter', n: 3, gap: 1, at: 0 }, { k: 'dad', n: 2, gap: 1, at: 0 }]);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  assert.equal(s.spawnQ.length, 5, 'every shopper the lesson asked for');
  const hunter = arrive(s, 'hunter');
  // The patience the lessons were written for: 40 and 34, the base numbers before 0.2.10 folded
  // Normal's x0.9 into them (see TUNE.trainingPatienceDivisor).
  assert.equal(hunter.mhp, 40);
  assert.equal(hunter.mhp, SHOPPERS.hunter.hp / TUNE.trainingPatienceDivisor);
  const dad = arrive(s, 'dad');
  assert.equal(dad.mhp, 34);
  const before = dad.hp;
  play(s, 1);
  assert.ok(Math.abs(before - dad.hp - SHOPPERS.dad.drain) < 0.01);
  const ev = play(s, 60, (e) => e.some((x) => x.e === 'waveEnd'));
  const hunters = ev.filter((e) => e.e === 'escape' && e.k === 'hunter');
  assert.ok(hunters.length >= 1 && hunters.every((e) => e.refund === SHOPPERS.hunter.refund));
});

test('the refund limit is 20 for one player and 5 more for each extra player', () => {
  assert.equal(TUNE.refundLimit, 20);
  assert.equal(TUNE.refundPerPlayer, 5);
  assert.equal(TUNE.bossRefunds, 2);
  const s = createGame();
  const limits = [];
  for (const name of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) { addPlayer(s, name); limits.push(s.refundLimit); }
  assert.deepEqual(limits, [20, 25, 30, 35, 40, 45, 50]);
  // And the store closes on the 20th.
  const g = real(1, Array.from({ length: 21 }, () => ['clipper', 0]));
  g.refundLimit = 20;
  const ev = play(g, 120, (e) => e.some((x) => x.e === 'lost'));
  assert.ok(ev.some((e) => e.e === 'lost'));
  assert.equal(g.refunds, 20);
});
