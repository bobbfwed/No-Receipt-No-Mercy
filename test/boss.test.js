// Tests for the boss: one comes in every fifth sales event, slow, patient, impossible to slow
// down, cheering on the shoppers around him. Also the carts moms leave behind (state.carts).
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, canPlace, step, queueTrainingWave, waveSpec, waveValue, canBuy, modeOf,
  bossTier, bossTitle, bossPatience, patienceGrowth, defOf, shopperDef,
  BOSS, SHOPPERS, SUPERS, OFFICE, TUNE, TICK_HZ, ST, NORMAL,
} from '../src/sim/index.js';
import { checksum } from '../src/net/session.js';

/** A training game (no timer, cannot be lost) with plenty of cash, on the original 30 x 16 map. */
function stage(seed = 5) {
  const s = createGame({ seed, training: true });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  return s;
}
const place = (s, k, x, y, d = 0, pid = 0) => applyCommand(s, pid, { c: 'place', k, x, y, d });
function send(s, groups) {
  queueTrainingWave(s, groups);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
}
/** Steps for up to `seconds`, calling `each` with every tick's events. Returns all events. */
function play(s, seconds, each = () => {}, stopAt = ['waveEnd', 'lost']) {
  const all = [];
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    const ev = step(s);
    all.push(...ev);
    if (each(ev) === false) break;
    if (ev.some((e) => stopAt.includes(e.e))) break;
  }
  return all;
}
/** Temporarily changes tuning numbers for one test. */
function tune(t, changes, obj = TUNE) {
  const old = {};
  for (const k of Object.keys(changes)) { old[k] = obj[k]; obj[k] = changes[k]; }
  t.after(() => Object.assign(obj, old));
}
/** A real (not training) solo game about to open the doors on wave n. */
function before(n, { seed = 3, players = ['Dave'], map } = {}) {
  const s = createGame({ seed, map });
  for (const p of players) addPlayer(s, p);
  for (const p of s.players) p.cash = 1e5;
  s.wave = n - 1;
  return s;
}
/** Opens the doors and returns the waveStart event. */
function open(s) {
  const ev = [];
  assert.ok(applyCommand(s, 0, { c: 'start' }, ev).ok);
  return ev.find((e) => e.e === 'waveStart');
}
/** Only the boss is left to arrive this wave. */
const bossOnly = (s) => { s.spawnQ = s.spawnQ.filter((q) => q[1] === 'boss'); };

test('the boss is kept apart from the shopper kinds, but plays by his own definition', () => {
  assert.equal(SHOPPERS.boss, undefined, 'nothing that lists the shoppers lists him');
  assert.equal(SUPERS.boss, undefined, 'he has no super version');
  assert.equal(OFFICE.kinds.boss, undefined, 'and no Head Office price');
  assert.equal(defOf({ k: 'boss' }), BOSS);
  assert.equal(defOf({ k: 'boss', sup: 1 }), BOSS);
  assert.equal(shopperDef('boss'), BOSS);
  assert.equal(shopperDef('hunter', 1), SUPERS.hunter);
  assert.equal(modeOf('boss'), NORMAL, 'he walks round belts like anyone else');
  assert.equal(BOSS.name, 'Regional Manager');
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(bossTitle), ['Regional Manager', 'Area Director', 'Vice President of Returns', 'The CEO', 'The CEO', 'The CEO']);
});

test('the boss comes on waves 5, 10, 15 ... only, at the right tier, about 12 seconds in', () => {
  for (let n = 1; n <= 40; n++) {
    const bosses = waveSpec(n).filter((g) => g.k === 'boss');
    if (n % 5 === 0) {
      assert.equal(bosses.length, 1, `wave ${n} has a boss`);
      assert.deepEqual({ ...bosses[0], gap: 0 }, { k: 'boss', n: 1, gap: 0, at: TUNE.bossAt, sup: 0, tr: n / 5 });
      assert.equal(bossTier(n), n / 5);
    } else {
      assert.equal(bosses.length, 0, `wave ${n} has none`);
      assert.equal(bossTier(n), 0);
    }
    // However many players: still one boss.
    assert.equal(waveSpec(n, 5).filter((g) => g.k === 'boss').length, n % 5 === 0 ? 1 : 0);
  }

  for (const n of [4, 5, 6, 10]) {
    const s = before(n);
    const start = open(s);
    const tier = n % 5 === 0 ? n / 5 : 0;
    assert.equal(start.boss, tier, `waveStart says so in wave ${n}`);
    assert.equal(start.kinds.includes('boss'), tier > 0);
    assert.equal(s.spawnQ.filter((q) => q[1] === 'boss').length, tier ? 1 : 0);
    if (!tier) continue;
    const opened = s.tick;
    let came = null;
    play(s, 20, (ev) => { came ||= ev.find((e) => e.e === 'bossIn'); return !came; });
    assert.ok(came, `the boss walked in on wave ${n}`);
    assert.ok(Math.abs(s.tick - opened - TUNE.bossAt * TICK_HZ) <= 2, 'about 12 seconds after the doors opened');
    const boss = s.shoppers.find((m) => m.k === 'boss');
    assert.equal(boss.tr, tier);
    assert.equal(came.tier, tier);
    assert.equal(s.tiles[(came.y | 0) * s.w + (came.x | 0)], 'D', 'through an entrance');
    // His patience: grown by wave and difficulty like everyone's, and by half again for each tier.
    const want = BOSS.hp * patienceGrowth(n) * 0.9 * (1 + 0.5 * (tier - 1));
    assert.ok(Math.abs(boss.mhp - want) < 1e-6 && Math.abs(bossPatience(n, 0.9) - want) < 1e-6);
  }

  // Never in training, whatever is queued.
  const t = stage();
  send(t, [{ k: 'hunter', n: 3, gap: 1, at: 0 }]);
  assert.ok(!t.spawnQ.some((q) => q[1] === 'boss'));
});

test('in a boss wave every other group is a smaller share of its usual size, over the same time', (t) => {
  assert.equal(TUNE.bossCrowd, 0.6);
  const share = TUNE.bossCrowd;
  const real = waveSpec(10).filter((g) => g.k !== 'boss');
  const nine = waveSpec(9);
  tune(t, { bossCrowd: 1 });
  const full = waveSpec(10).filter((g) => g.k !== 'boss');
  assert.equal(full.length, real.length);
  let a = 0, b = 0;
  for (let i = 0; i < real.length; i++) {
    assert.equal(real[i].k, full[i].k);
    assert.ok(real[i].n <= full[i].n, real[i].k);
    assert.ok(Math.abs(real[i].n - full[i].n * share) <= 1, `${real[i].k}: ${real[i].n} of ${full[i].n}`);
    assert.ok(Math.abs(real[i].gap * real[i].n - full[i].gap * full[i].n) < 1e-9, 'the group takes as long to arrive');
    a += real[i].n; b += full[i].n;
  }
  assert.ok(Math.abs(a / b - share) < 0.05, `the crowd is ${a} instead of ${b}`);
  // A wave without him is untouched.
  assert.deepEqual(waveSpec(9), nine);
});

/**
 * Times a boss and a Bargain Hunter across the store, with or without every distraction there is
 * on their way: wet floor signs, messes, day drinkers lying down, free samples, a TV Salesman and
 * an exhibitionist who opens her bathrobe every half second.
 */
function race(distractions) {
  const s = stage(8);
  if (distractions) {
    for (let x = 3; x <= 25; x++) for (const y of [7, 8]) assert.ok(place(s, 'wetfloor', x, y).ok);
    assert.ok(place(s, 'samples', 12, 5).ok);
    assert.ok(place(s, 'samples', 14, 10).ok);
    assert.ok(place(s, 'salesman', 16, 4).ok);
    applyCommand(s, 0, { c: 'upgrade', x: 16, y: 4, t: 'dmg' });
    for (let x = 1; x <= 27; x++) for (let y = 6; y <= 9; y++) s.messes.push([y * s.w + x, 1e6]);
    // Day drinkers lying across the way.
    let id = 9000;
    for (const x of [10, 11]) for (const y of [7, 8]) {
      s.shoppers.push({ id: id++, k: 'drinker', x: x + 0.5, y: y + 0.5, vx: 0, vy: 0, hp: 50, mhp: 50, st: ST.STUN, t: 1e6, cd: 0, ox: 0, oy: 0, lt: -1, sv: 1 });
    }
  }
  const groups = [{ k: 'boss', n: 1, gap: 1, at: 0 }, { k: 'hunter', n: 1, gap: 1, at: 0.1 }];
  if (distractions) groups.push({ k: 'flasher', n: 1, gap: 1, at: 0.2 });
  send(s, groups);
  const from = s.tick;
  const got = {};
  let flashedNear = 0, notWalking = 0;
  play(s, 150, (ev) => {
    const boss = s.shoppers.find((m) => m.k === 'boss');
    if (boss && boss.st !== ST.WALK) notWalking++;
    for (const e of ev) {
      if (e.e === 'escape') got[e.k] = s.tick - from;
      if (e.e === 'flash' && boss && (e.x - boss.x) ** 2 + (e.y - boss.y) ** 2 < TUNE.flashRange ** 2) flashedNear++;
      assert.ok(!(e.e === 'pitch' && e.k === 'boss'), 'the salesman never gets to him');
    }
    return !(got.boss && got.hunter);
  }, []);
  return { ...got, flashedNear, notWalking };
}

test('nothing slows or stops the boss: signs, messes, drunks, samples, the salesman or a flasher', (t) => {
  assert.ok(BOSS.steady && !BOSS.browses && !BOSS.gawks && !BOSS.drain);
  assert.deepEqual(BOSS.pitch, [0, 0]);
  tune(t, { flashEvery: 0.5 });
  const clear = race(false), busy = race(true);
  assert.ok(clear.boss && busy.boss, 'he got to the tills both times');
  assert.ok(busy.hunter > clear.hunter * 1.3, `the same things held a Bargain Hunter up (${clear.hunter} -> ${busy.hunter} ticks)`);
  assert.ok(Math.abs(busy.boss - clear.boss) <= clear.boss * 0.02, `but not him (${clear.boss} -> ${busy.boss} ticks)`);
  assert.equal(busy.notWalking, 0, 'he never stopped');
  assert.ok(busy.flashedNear > 0, 'the exhibitionist did flash him');
  // He walks at his own slow pace.
  const tiles = 28;
  assert.ok(clear.boss / TICK_HZ > tiles / BOSS.speed * 0.9, `crossed in ${clear.boss / TICK_HZ} s`);
});

test('his pep talk gives nearby shoppers a fifth of their patience back, never above full', () => {
  const s = stage(9);
  send(s, [{ k: 'boss', n: 1, gap: 1, at: 0 }, { k: 'hunter', n: 3, gap: 0.1, at: 0 }]);
  play(s, 5, () => s.shoppers.length < 4, []);
  const boss = s.shoppers.find((m) => m.k === 'boss');
  const [a, b, c] = s.shoppers.filter((m) => m.k === 'hunter');
  a.x = boss.x + 1; a.y = boss.y; a.hp = a.mhp * 0.5;
  b.x = boss.x + 2; b.y = boss.y; b.hp = b.mhp * 0.95;
  c.x = boss.x + 8; c.y = boss.y; c.hp = c.mhp * 0.5; // too far to hear him
  boss.hp = boss.mhp * 0.5;
  boss.pp = 1;
  const ev = step(s);
  const pep = ev.find((e) => e.e === 'pep');
  assert.ok(pep);
  assert.equal(pep.n, 2, 'two shoppers in reach needed it');
  assert.ok(Math.abs(a.hp - a.mhp * 0.7) < 1e-9, 'a fifth of his full patience back');
  assert.equal(b.hp, b.mhp, 'never above full');
  assert.equal(c.hp, c.mhp * 0.5, 'out of reach, nothing');
  assert.equal(boss.hp, boss.mhp * 0.5, 'he does not cheer himself up');
  assert.equal(boss.pp, BOSS.pepEvery * TICK_HZ);
  // Then every 7 seconds, needed or not.
  const more = play(s, 22, () => {}, []).filter((e) => e.e === 'pep');
  assert.equal(more.length, 3);
});

test('a boss who reaches a till counts as two refunds and takes a big one', () => {
  const s = stage(4);
  send(s, [{ k: 'boss', n: 1, gap: 1, at: 0 }]);
  const cash = s.players[0].cash;
  const ev = play(s, 120);
  const esc = ev.filter((e) => e.e === 'escape');
  assert.equal(esc.length, 1);
  assert.equal(esc[0].k, 'boss');
  assert.equal(esc[0].n, TUNE.bossRefunds);
  assert.equal(esc[0].tier, 1);
  assert.equal(esc[0].refund, BOSS.refund);
  assert.equal(TUNE.bossRefunds, 2, 'two of a limit of 20 since 0.2.09 (it was five of 40)');
  assert.equal(s.refunds, 2);
  assert.equal(s.ws.escaped, 1);
  assert.equal(s.players[0].cash, cash - BOSS.refund, 'his refund is his own: not scaled with the crowd');

  // Two refunds can close the store.
  const g = before(10);
  open(g);
  bossOnly(g);
  g.refunds = g.refundLimit - 1;
  const end = play(g, 200);
  assert.equal(g.phase, 'lost');
  assert.equal(g.refunds, g.refundLimit + 1);
  const last = end.filter((e) => e.e === 'escape');
  assert.equal(last.length, 1);
  assert.equal(last[0].tier, 2);
  assert.equal(last[0].refund, Math.min(1e5, BOSS.refund * 2), 'the refund is his times his tier');
  // Everyone else's escape counts one.
  const h = stage(4);
  send(h, [{ k: 'hunter', n: 1, gap: 1, at: 0 }]);
  assert.equal(play(h, 60).find((e) => e.e === 'escape').n, 1);
});

test('driving the boss out pays a bounty, shared like any income, and says so', () => {
  const s = before(10, { players: ['Dave', 'Steve'] });
  assert.ok(place(s, 'forklift', 3, 5).ok);
  open(s);
  bossOnly(s);
  play(s, 20, (ev) => !ev.some((e) => e.e === 'bossIn'), []);
  const boss = s.shoppers.find((m) => m.k === 'boss');
  boss.hp = 1;
  const cash = s.players.map((p) => p.cash);
  let out = null;
  const ev = play(s, 30, (tick) => {
    if (!tick.some((e) => e.e === 'bossOut')) return true;
    out = tick;
    return false;
  });
  assert.ok(out, 'he stormed off');
  const bounty = Math.round(TUNE.bossBounty * 2 * 1.1);
  const i = out.findIndex((e) => e.e === 'left');
  assert.ok(i >= 0 && out[i].k === 'boss' && out[i].by === 0);
  assert.deepEqual(out[i + 1], { e: 'bossOut', tier: 2, x: boss.x, y: boss.y, bounty }, 'the usual "left", then the bounty');
  assert.deepEqual(s.players.map((p, n) => Math.round((p.cash - cash[n]) * 1000) / 1000), [bounty / 2, bounty / 2], 'split between the players');
  assert.equal(s.ws.stopped, 1);
  assert.ok(!ev.some((e) => e.e === 'escape'));
});

test('Head Office cannot buy the boss, and he comes anyway', (t) => {
  const s = createGame({ seed: 4, map: { design: 'warehouse', size: 'm' }, zones: false });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  s.wave = 4;
  assert.ok(applyCommand(s, 1, { c: 'side', side: 'office' }).ok);
  assert.equal(canBuy('boss', 0, 5), false);
  const bad = applyCommand(s, 1, { c: 'plan', groups: [{ k: 'boss', n: 1, sup: 0, door: 0, at: 0 }] });
  assert.deepEqual(bad, { ok: false, why: 'bad' });
  assert.ok(applyCommand(s, 1, { c: 'plan', groups: [{ k: 'hunter', n: 5, sup: 0, door: 0, at: 0 }] }).ok);
  const ev = [];
  assert.ok(applyCommand(s, 0, { c: 'start' }, ev).ok);
  assert.ok(applyCommand(s, 1, { c: 'start' }, ev).ok);
  const start = ev.find((e) => e.e === 'waveStart');
  assert.equal(start.office, 1, 'his plan was used');
  assert.equal(start.boss, 1);
  assert.equal(start.total, 6);
  assert.deepEqual(s.spawnQ.map((q) => q[1]).sort(), ['boss', 'hunter', 'hunter', 'hunter', 'hunter', 'hunter']);
  // His budget is worked out without the boss, from the smaller crowd of a boss wave.
  const worth = waveValue(5);
  tune(t, { bossCrowd: 1 });
  const full = waveValue(5);
  assert.ok(worth < full * 0.9 && worth > full * 0.6, `worth ${worth} instead of ${full}`);
});

test('a game with a boss in it stays identical on a copy made mid-wave', () => {
  const g = createGame({ seed: 31, map: { design: 'warehouse', size: 'm' } });
  addPlayer(g, 'Dave');
  addPlayer(g, 'Steve');
  for (const p of g.players) p.cash = 1e6;
  for (let x = 6; x <= 34; x += 7) {
    place(g, 'crate', x, 5); place(g, 'belt', x, 6);
    place(g, 'sprinkler', x, 12, 0, 1); place(g, 'samples', x + 1, 15, 0, 1); place(g, 'wetfloor', x + 2, 11, 0, 1);
  }
  assert.ok(place(g, 'salesman', 14, 9).ok);
  g.wave = 9;
  open(g);
  const seen = new Set();
  for (let i = 0; i < 20 * TICK_HZ; i++) for (const e of step(g)) seen.add(e.e);
  assert.ok(seen.has('bossIn'));
  const b = JSON.parse(JSON.stringify(g));
  for (let i = 0; i < 40 * TICK_HZ; i++) { for (const e of step(g)) seen.add(e.e); step(b); }
  assert.equal(JSON.stringify(g), JSON.stringify(b));
  assert.equal(checksum(g), checksum(b));
  assert.ok(seen.has('pep'));
});

// ---------------------------------------------------------------- carts

/** A mom whose child is loose and waiting, about to run out of patience, with a forklift on her. */
function momGoingDown(t, sup) {
  tune(t, { kidChance: 100, kidMin: 8, kidMax: 8 });
  const s = stage(6);
  send(s, [{ k: 'mom', n: 1, gap: 1, at: 0, sup: sup ? 1 : 0 }]);
  let mom = null;
  for (let i = 0; i < 20 * TICK_HZ && !(mom && mom.kd === 2); i++) { step(s); mom = s.shoppers[0] || mom; }
  assert.equal(mom.kd, 2);
  let spot = null;
  for (const dy of [-2, 2, -3, 3, -4, 4]) for (const dx of [0, -1, 1, -2, 2]) {
    const x = (mom.x | 0) + dx, y = (mom.y | 0) + dy;
    if (!spot && canPlace(s, 'forklift', x, y) === null) spot = [x, y];
  }
  assert.ok(place(s, 'forklift', spot[0], spot[1]).ok);
  if (sup) mom.crn = 1; // a Soccer Mom's second time down is her last
  mom.hp = 1;
  return { s, mom };
}

test('a mom who leaves her cart leaves it in the game state, until the wave ends', (t) => {
  for (const sup of [0, 1]) {
    const { s, mom } = momGoingDown(t, sup);
    assert.deepEqual(s.carts, []);
    let crawl = null, carts = null;
    const ev = play(s, 200, (tick) => {
      if (crawl) return;
      crawl = tick.find((e) => e.e === 'crawl');
      if (crawl) carts = JSON.parse(JSON.stringify(s.carts));
    });
    assert.ok(crawl);
    assert.equal(mom.nc, 1);
    assert.equal(carts.length, 1);
    const [x, y, isSup, face] = carts[0];
    assert.ok(Math.abs(x - crawl.x) < 0.001 && Math.abs(y - crawl.y) < 0.001, 'where she went down');
    assert.equal(isSup, sup);
    assert.ok(face === 1 || face === -1);
    assert.ok(ev.some((e) => e.e === 'waveEnd'));
    assert.deepEqual(s.carts, [], 'gone when the wave is over');
  }
});

test('the multiplayer checksum notices a missing cart', () => {
  const s = stage();
  const a = checksum(s);
  s.carts.push([3.5, 7.5, 0, 1]);
  assert.notEqual(checksum(s), a);
});
