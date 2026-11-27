// Tests for the Card Trader and the Midnight Release (0.3.01): the fixed schedule, the size of the
// mob, all of it through one entrance at once, the Scalpers, ripping the best-branded stock out of
// security (0.4; Mystery Boxes off belts until then), the onlookers and their cooldown, a mob never
// getting stuck, Head Office unable to buy or stop it, a saved copy playing on identically, and
// DEB's lines.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, step, waveSpec, releaseNo, releaseSize, releaseDoor, bossTier, canBuy,
  checkPlan, waveValue, priceOf, addStock, itemCode, SHOPPERS, SUPERS, OFFICE, TUNE, TICK_HZ, ST,
} from '../src/sim/index.js';
import { createDirector } from '../src/content/director.js';
import { LINES, INTRO, SUPER_INTRO, ESCAPE_REVIEWS, LEFT_REVIEWS, textOf, fill } from '../src/content/lines.js';
import { shopperFacts, shopperTraits, countIn, firstWave, releaseWaves, releaseText } from '../src/content/facts.js';

const secs = (x) => Math.max(1, Math.round(x * TICK_HZ));
/** Uses in a unit of stock for a forklift's damage, speed and range (its shots). */
const BUILD_SHOTS = 6;

/** An ordinary game, `players` players, on a store with that many entrances open. */
function game(players = 1, seed = 5, map = undefined) {
  const s = createGame({ seed, map });
  for (let p = 0; p < players; p++) addPlayer(s, `P${p}`);
  for (const p of s.players) p.cash = 1e6;
  s.refundLimit = 1e9; // a mob at the tills must not close the store in the middle of a test
  return s;
}
/** Opens the doors on sales event n (the wave before is taken as played). */
function openOn(s, n) {
  s.wave = n - 1;
  const ev = [];
  assert.ok(applyCommand(s, 0, { c: 'start' }, ev).ok);
  return ev;
}
/** Steps until `until` is true (or the time runs out); returns every event. */
function run(s, seconds, until = () => false, each = () => {}) {
  const all = [];
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    all.push(...step(s));
    each();
    if (until()) break;
  }
  return all;
}
/** Temporarily changes tuning numbers for one test. */
function tune(t, changes, obj = TUNE) {
  const old = {};
  for (const k of Object.keys(changes)) { old[k] = obj[k]; obj[k] = changes[k]; }
  t.after(() => Object.assign(obj, old));
}
const place = (s, k, x, y, d = 0) => applyCommand(s, 0, { c: 'place', k, x, y, d });
/** A shopper of kind k walking from (x, y), with patience to spare. */
function walker(s, k, x, y, more = {}) {
  const sh = { id: s.nextId++, k, x, y, vx: 0, vy: 0, hp: 1e5, mhp: 1e5, st: ST.WALK, t: 0, cd: 0, ox: 0, oy: 0, lt: -1, ...more };
  s.shoppers.push(sh);
  return sh;
}
/** A forklift on tile (x, y), stocked with these supplies ([type, tier] a unit each) and switched off, so it shoots nobody. */
function stocked(s, x, y, units) {
  assert.ok(place(s, 'forklift', x, y).ok);
  const b = s.grid[y * s.w + x];
  for (const [type, tier] of units) addStock(b, itemCode(type, tier), s);
  b.off = 1e9;
  return b;
}
/**
 * The doors open on the small map with nobody coming, and a stocked forklift on (12, 6), switched
 * off. The route to the tills runs east just below it.
 */
function shelf(units = [[1, 1], [1, 1], [2, 4]]) {
  const s = game(1, 6);
  const b = stocked(s, 12, 6, units);
  openOn(s, 1);
  s.spawnQ = [];
  s.shoppers.length = 0;
  return { s, b };
}

// ---------------------------------------------------------------- the schedule

test('a Midnight Release comes at sales events 7, 12, 17 and every fifth after, never with the boss, in an endless game too', () => {
  assert.equal(TUNE.releaseFrom, 7);
  assert.equal(TUNE.releaseEvery, 5);
  const seen = [];
  for (let n = 1; n <= 120; n++) {
    if (releaseNo(n)) seen.push(n);
    if (releaseNo(n)) assert.equal(bossTier(n), 0, `event ${n} is not a boss event`);
    // The automatic wave has the mob exactly when it is a release, and only then.
    assert.equal(waveSpec(n).some((g) => g.k === 'trader'), !!releaseNo(n), `event ${n}`);
    assert.equal(waveSpec(n).filter((g) => g.mob).length, releaseNo(n) ? 1 : 0);
  }
  assert.deepEqual(seen.slice(0, 5), [7, 12, 17, 22, 27]);
  assert.equal(seen.length, 23, 'every fifth event from 7 up to 120 (an endless game goes on for ever)');
  assert.deepEqual(seen.map(releaseNo).slice(0, 4), [1, 2, 3, 4]);
  assert.equal(firstWave('trader'), 7);
  // Two events after each boss.
  for (const n of seen) assert.equal(bossTier(n - 2) > 0, true, `${n} is two after a boss`);
  // An endless game really sends one.
  const s = game();
  s.waves = 0;
  const ev = openOn(s, 52);
  assert.equal(ev.find((e) => e.e === 'waveStart').release, releaseSize(52, 1));
  assert.equal(s.spawnQ.filter((q) => q[1] === 'trader').length, releaseSize(52, 1));
  // A training game never has one.
  const tr = createGame({ training: true });
  addPlayer(tr, 'Dave');
  tr.wave = 6;
  assert.ok(!(tr.nextWave || []).some((g) => g.k === 'trader'));
});

test('the mob is 12, 16, 20 and 4 more each time for one player; each extra player adds half; the rest of the crowd is smaller', () => {
  assert.deepEqual([7, 12, 17, 22, 27].map((n) => releaseSize(n, 1)), [12, 16, 20, 24, 28]);
  assert.deepEqual([1, 2, 3, 4, 7].map((p) => releaseSize(7, p)), [12, 18, 24, 30, 48]);
  assert.deepEqual([1, 2, 3].map((p) => releaseSize(12, p)), [16, 24, 32]);
  assert.equal(releaseSize(8, 1), 0);
  for (const p of [1, 2, 3]) {
    for (const n of [7, 12, 17, 22]) {
      const mob = waveSpec(n, p).find((g) => g.k === 'trader');
      assert.equal(mob.n, releaseSize(n, p), `event ${n}, ${p} players: not halved, not shaped`);
      assert.equal(countIn('trader', n, p).all, mob.n);
    }
  }
  // The rest of a release event is TUNE.releaseCrowd of its usual size.
  const old = TUNE.releaseCrowd;
  const rest = (n) => waveSpec(n).filter((g) => !g.mob).reduce((a, g) => a + g.n, 0);
  const smaller = rest(12);
  TUNE.releaseCrowd = 1;
  const full = rest(12);
  TUNE.releaseCrowd = old;
  assert.ok(TUNE.releaseCrowd < 1 && smaller < full && smaller >= full * TUNE.releaseCrowd - 12, `${smaller} of ${full}`);
});

test('the whole mob comes through one entrance within two seconds, about twenty seconds in, a different entrance each release', () => {
  for (const n of [7, 12]) {
    const s = game(3, 9, { design: 'warehouse', size: 'm' });
    assert.ok(s.open >= 3);
    const ev = openOn(s, n);
    const start = s.tick;
    const door = releaseDoor(n, s.open);
    const arrived = new Map();
    const all = run(s, 40, () => arrived.size >= releaseSize(n, 3), () => {
      for (const m of s.shoppers) {
        if (m.k !== 'trader' || arrived.has(m.id)) continue;
        const tile = ((m.y - m.oy) | 0) * s.w + ((m.x - m.ox) | 0);
        arrived.set(m.id, { tick: s.tick, door: s.doors.findIndex((d) => d.includes(tile)), sup: m.sup | 0 });
      }
    });
    const list = [...arrived.values()];
    assert.equal(list.length, releaseSize(n, 3), `event ${n}: all ${releaseSize(n, 3)} came`);
    assert.ok(list.every((a) => a.door === door), `event ${n}: all through entrance ${door}`);
    const first = Math.min(...list.map((a) => a.tick)), last = Math.max(...list.map((a) => a.tick));
    assert.ok(Math.abs((first - start) / TICK_HZ - TUNE.releaseAt) <= 0.2, 'about twenty seconds after the doors open');
    assert.ok((last - first) / TICK_HZ <= TUNE.releaseSecs + 0.05, 'within two seconds');
    const rel = all.find((e) => e.e === 'release');
    assert.ok(rel && rel.n === releaseSize(n, 3) && rel.door === door, 'the release event says how many and where');
    assert.equal(all.filter((e) => e.e === 'release').length, 1);
    assert.equal(ev.find((e) => e.e === 'waveStart').release, releaseSize(n, 3));
    // Scalpers from the second release.
    const sup = list.filter((a) => a.sup).length;
    if (n === 7) assert.equal(sup, 0, 'no Scalpers at the first');
    else assert.ok(sup >= 1 && sup < list.length, 'some Scalpers at the second');
  }
  assert.notEqual(releaseDoor(7, 3), releaseDoor(12, 3), 'the entrance changes');
  assert.equal(releaseDoor(17, 3), 2);
  assert.equal(releaseDoor(22, 3), 0, 'and goes round the open ones');
  assert.equal(releaseDoor(12, 1), 0, 'one entrance: always that one');
  // Their patience grows by event like anyone's.
  const s = game();
  openOn(s, 12);
  run(s, 25, () => s.shoppers.some((m) => m.k === 'trader' && !m.sup));
  const m = s.shoppers.find((x) => x.k === 'trader' && !x.sup);
  const s2 = game();
  openOn(s2, 7);
  run(s2, 25, () => s2.shoppers.some((x) => x.k === 'trader'));
  assert.ok(m.mhp > s2.shoppers.find((x) => x.k === 'trader').mhp * 1.5);
});

test('Scalpers: from the second release, a growing share; tougher and a double refund like every super', () => {
  const sup = (n) => waveSpec(n).find((g) => g.k === 'trader').sup;
  assert.equal(SHOPPERS.trader.sup.from, 12);
  assert.equal(sup(7), 0);
  assert.ok(sup(12) >= 1 && sup(22) > sup(12) && sup(52) > sup(22));
  assert.equal(SUPERS.trader.name, 'Scalper');
  assert.ok(SUPERS.trader.hp >= SHOPPERS.trader.hp * 2);
  assert.equal(SUPERS.trader.refund, SHOPPERS.trader.refund * 2);
  assert.equal(SUPERS.trader.weak, 'sprinkler');
});

// ---------------------------------------------------------------- ripping stock

test('a Card Trader rips out the best-branded unit; a shoplifter takes from the fullest supply; the rest steal nothing', (t) => {
  tune(t, { grabChance: 1e6 }); // whoever steals, steals the moment he is beside it
  // Two units of Store Brand Spite and one of Platinum Cola. The bargain hunter takes a Spite
  // (the supply it holds most of), once, then walks on to the tills.
  let { s, b } = shelf();
  walker(s, 'hunter', 10.5, 7.5);
  let ev = run(s, 60, () => !s.shoppers.length);
  const grabs = ev.filter((e) => e.e === 'grab');
  assert.equal(grabs.length, 1);
  assert.deepEqual([grabs[0].i, grabs[0].t, grabs[0].tier], [6 * s.w + 12, 'dmg', 1]);
  assert.deepEqual(b.s, { dmg: [1, BUILD_SHOTS], spd: [4, BUILD_SHOTS] });
  assert.equal(s.ws.stolen, 1);
  assert.ok(ev.some((e) => e.e === 'escape' && e.k === 'hunter'));
  // Dads, teenagers and Karens walk past and leave it.
  ({ s, b } = shelf());
  for (const k of ['dad', 'teen', 'karen']) walker(s, k, 10.5, 7.5);
  ev = run(s, 90, () => !s.shoppers.length);
  assert.ok(!ev.some((e) => e.e === 'grab' || e.e === 'rip'));
  assert.equal(s.ws.stolen, 0);
  // A Card Trader goes for the Platinum Cola: a rip, not a grab, and his track runs dry.
  ({ s, b } = shelf());
  walker(s, 'trader', 10.5, 7.5);
  ev = run(s, 60, () => !s.shoppers.length);
  const rip = ev.find((e) => e.e === 'rip');
  assert.ok(rip, 'he ripped one out');
  assert.deepEqual([rip.i, rip.t, rip.tier], [6 * s.w + 12, 'spd', 4]);
  assert.ok(!ev.some((e) => e.e === 'grab'), 'a rip, not a grab');
  assert.deepEqual(b.s, { dmg: [1, 2 * BUILD_SHOTS] });
  assert.ok(ev.some((e) => e.e === 'stockOut' && e.t === 'spd' && e.i === 6 * s.w + 12), 'the Cola ran out');
  assert.equal(s.ws.stolen, 1);
  assert.ok(ev.some((e) => e.e === 'escape' && e.k === 'trader'), 'then he went on to the tills');
  // An empty building is left alone. And he ignores free samples.
  ({ s, b } = shelf([]));
  assert.ok(place(s, 'samples', 10, 9).ok);
  walker(s, 'trader', 8.5, 8.5);
  ev = run(s, 60, () => !s.shoppers.length);
  assert.ok(!ev.some((e) => e.e === 'sample' || e.e === 'rip'));
});

test('thieves steal only from what they walk past: stock a few tiles off the route is safe', (t) => {
  tune(t, { grabChance: 1e6 });
  // A stocked forklift three rows above the route: in reach of a 0.3 detour, not of a hand.
  const s = game(1, 6);
  const b = stocked(s, 12, 4, [[1, 4], [1, 4]]);
  openOn(s, 1);
  s.spawnQ = [];
  s.shoppers.length = 0;
  for (const k of ['hunter', 'trader', 'clipper']) walker(s, k, 8.5, 7.5);
  const ev = run(s, 60, () => !s.shoppers.length);
  assert.ok(!ev.some((e) => e.e === 'grab' || e.e === 'rip'));
  assert.deepEqual(b.s, { dmg: [4, 2 * BUILD_SHOTS] });
  assert.equal(ev.filter((e) => e.e === 'escape').length, 3);
});

test('a rip stops him for three seconds and the Card Traders round him for a second and a half, each with a cooldown', (t) => {
  tune(t, { grabChance: 1e6 }); // he takes it the moment he is beside it
  const { s, b } = shelf([[3, 2]]);
  const ripper = walker(s, 'trader', 12.5, 7.5);
  const near = [walker(s, 'trader', 12.5, 8.5), walker(s, 'trader', 11.6, 7.6), walker(s, 'trader', 13.4, 8.3, { sup: 1 })];
  const tired = walker(s, 'trader', 12.0, 8.0, { ro: secs(2) }); // watched one a moment ago
  const far = walker(s, 'trader', 12.5, 11.5);
  const hunter = walker(s, 'hunter', 12.2, 8.2);
  const ev = step(s);
  const rip = ev.find((e) => e.e === 'rip');
  assert.ok(rip, 'ripped at once');
  assert.equal(rip.n, 3);
  assert.equal(ripper.st, ST.BROWSE);
  assert.equal(ripper.t, secs(TUNE.ripSecs));
  assert.ok(ripper.cd >= secs(TUNE.ripSecs + TUNE.grabCooldown) - 1, 'not tempted again for a while');
  for (const m of near) {
    assert.equal(m.st, ST.WATCH, 'stopped to look');
    assert.ok(Math.abs(m.t - secs(TUNE.ripWatch)) <= 1);
    assert.ok(m.ro >= secs(TUNE.ripCool) - 1);
  }
  assert.equal(tired.st, ST.WALK, 'one who has just watched one keeps walking');
  assert.equal(far.st, ST.WALK, 'too far to see');
  assert.notEqual(hunter.st, ST.WATCH, 'a bargain hunter does not care');
  // After a second and a half they walk on; a second rip straight after does not stop them again.
  run(s, TUNE.ripWatch + 0.1);
  for (const m of near) assert.equal(m.st, ST.WALK);
  addStock(b, itemCode(3, 2), s);
  const again = walker(s, 'trader', 12.5, 7.5);
  for (const m of near) { m.x = 12.5; m.y = 8.2; m.cd = 1e6; }
  const ev2 = step(s);
  const rip2 = ev2.find((e) => e.e === 'rip');
  assert.ok(rip2 && again.st === ST.BROWSE);
  assert.equal(rip2.n, 0, 'nobody stops: they all watched one too lately');
  for (const m of near) assert.notEqual(m.st, ST.WATCH);
  assert.equal(TUNE.ripSecs, 3);
  assert.equal(TUNE.ripWatch, 1.5);
  assert.equal(TUNE.ripLook, 1.5);
  assert.ok(TUNE.ripCool > TUNE.ripWatch);
});

test('a mob never gets stuck: stocked security taken away and put back, all of them leave the store', () => {
  const s = game(1, 11);
  // Stocked (switched off) forklifts all along the way in from the entrance.
  for (let x = 3; x <= 14; x++) stocked(s, x, 6, [[1, 4], [2, 3], [3, 2]]);
  openOn(s, 7);
  // Only the mob.
  s.spawnQ = s.spawnQ.filter((q) => q[1] === 'trader');
  const start = s.tick;
  const stillSince = new Map();
  let k = 0;
  const ev = run(s, 240, () => !s.shoppers.length && !s.spawnQ.length, () => {
    // Every few seconds, take a building away or put one back.
    if (s.tick > start + secs(TUNE.releaseAt + 4) && s.tick % 90 === 0) {
      const x = 3 + (k++ % 12);
      if (s.grid[6 * s.w + x]) applyCommand(s, 0, { c: 'remove', x, y: 6 });
      else if (place(s, 'forklift', x, 6).ok) { addStock(s.grid[6 * s.w + x], itemCode(1, 4), s); s.grid[6 * s.w + x].off = 1e9; }
    }
    for (const m of s.shoppers) {
      if (m.k !== 'trader') continue;
      const was = stillSince.get(m.id);
      if (m.st !== ST.WALK || !was || Math.hypot(m.x - was.x, m.y - was.y) > 0.05) stillSince.set(m.id, { x: m.x, y: m.y, tick: s.tick });
      else assert.ok(s.tick - was.tick < 12 * TICK_HZ, `trader ${m.id} stuck at ${m.x.toFixed(2)}, ${m.y.toFixed(2)}`);
    }
  });
  const ripped = ev.filter((e) => e.e === 'rip').length;
  assert.equal(s.shoppers.length, 0, 'every one of them left the store');
  const out = ev.filter((e) => (e.e === 'escape' || e.e === 'left') && e.k === 'trader').length;
  assert.equal(out, releaseSize(7, 1));
  assert.ok(ripped >= 1, `they ripped stock out (${ripped})`);
  assert.equal(s.ws.stolen, ripped + ev.filter((e) => e.e === 'grab').length, 'every theft is one unit');
});

// ---------------------------------------------------------------- Head Office

test('Head Office cannot buy a Card Trader, and the release comes whatever he planned', () => {
  assert.equal(OFFICE.kinds.trader, undefined);
  for (const n of [7, 12, 30]) for (const sup of [0, 1]) assert.equal(canBuy('trader', sup, n), false);
  const s = game(2);
  s.wave = 6;
  assert.equal(checkPlan(s, [{ k: 'trader', n: 5, sup: 0, door: 0, at: 0 }]), 'locked');
  // His budget is worth the wave without the mob (the mob has no price).
  assert.doesNotThrow(() => waveValue(7, 2));
  assert.ok(waveValue(7, 1) > 0);
  assert.throws(() => priceOf('trader', 0));
  assert.deepEqual([shopperFacts('trader').price, shopperFacts('trader').superPrice], [0, 0]);
});

// ---------------------------------------------------------------- saving

test('a copy of the game made mid-release, with stock being ripped, plays on identically', (t) => {
  const s = game(1, 4);
  for (let x = 3; x <= 14; x++) stocked(s, x, 5, [[1, 4], [3, 2]]);
  assert.ok(place(s, 'sprinkler', 8, 7).ok);
  openOn(s, 12);
  // Until one of them is gloating over what he ripped and another is watching him.
  const ev = run(s, 90, () => s.shoppers.some((m) => m.k === 'trader' && m.st === ST.BROWSE)
    && s.shoppers.some((m) => m.k === 'trader' && m.st === ST.WATCH));
  assert.ok(ev.some((e) => e.e === 'rip'), 'mid-release, mid-rip');
  const copy = JSON.parse(JSON.stringify(s));
  for (let i = 0; i < 20 * TICK_HZ; i++) { step(s); step(copy); }
  assert.deepEqual(JSON.parse(JSON.stringify(copy)), JSON.parse(JSON.stringify(s)));
  // An older save's shoppers have no `ro`: it reads as no cooldown.
  const { s: old } = shelf();
  const tr = walker(old, 'trader', 12.5, 7.5);
  const watcher = walker(old, 'trader', 12.5, 8.4);
  delete watcher.ro;
  tune(t, { grabChance: 1e6 });
  const ev2 = step(old);
  assert.ok(ev2.some((e) => e.e === 'rip') && tr.st === ST.BROWSE && watcher.st === ST.WATCH);
});

// ---------------------------------------------------------------- words

test('the handbook, the help and DEB know about him: schedule, rip, lines that taper', () => {
  const f = shopperFacts('trader');
  assert.ok(f.releaseOnly && f.first === 7 && f.superFrom === 12);
  const traits = new Map(shopperTraits('trader', 0));
  assert.match(traits.get('When'), /Midnight Release events only/);
  assert.match(traits.get('Ripping'), /Card Trader/);
  assert.match(traits.get('Free samples and stock'), /best-branded stock/);
  assert.match(releaseText(), /7, 12, 17/);
  assert.deepEqual(releaseWaves(20), [7, 12, 17, 22, 27]);
  assert.ok(releaseWaves(0).length > releaseWaves(20).length);
  // Every other kind does not get the release's text.
  assert.ok(!shopperFacts('hunter').releaseOnly);
  // The lines the brief asks for.
  assert.ok(INTRO.trader && SUPER_INTRO.trader);
  assert.ok(ESCAPE_REVIEWS.trader.length >= 8 && LEFT_REVIEWS.trader.length >= 6);
  assert.ok(LINES.releaseNext.length >= 10 && LINES.rip.length >= 8 && LINES.releaseIn.length >= 5);
  // No real card game is named anywhere in the lines.
  const all = [...LINES.releaseNext, ...LINES.releaseIn, ...LINES.rip, ...ESCAPE_REVIEWS.trader, ...LEFT_REVIEWS.trader].map(textOf)
    .concat(INTRO.trader, SUPER_INTRO.trader).join(' ');
  assert.ok(!/pok[eé]mon|magic: the gathering|yu-?gi-?oh|lorcana|hearthstone/i.test(all));

  // DEB: the build pause before a release announces it, once; the mob arriving and a rip get a line.
  const s = game(1);
  s.phase = 'build'; s.wave = 6; s.phaseT = 40 * TICK_HZ;
  const director = createDirector(() => 0);
  const said = director.idle(s).filter((m) => m.t === 'say').map((m) => m.text);
  assert.equal(said.length, 1);
  assert.ok(LINES.releaseNext.some((l) => fill(textOf(l), { p: 'P0', n: 12, w: 7 }) === said[0]), said[0]);
  assert.ok(!director.idle(s).some((m) => LINES.releaseNext.some((l) => fill(textOf(l), { p: 'P0', n: 12, w: 7 }) === m.text)), 'once');
  s.wave = 7; // the next is not a release
  assert.equal(createDirector(() => 0).idle(s).filter((m) => m.t === 'say').length, 0);
  const d2 = createDirector(() => 0);
  const arrive = d2.handle([{ e: 'release', n: 16, door: 0, x: 1, y: 1, wave: 12 }], s).filter((m) => m.t === 'say');
  assert.equal(arrive.length, 1);
  assert.match(arrive[0].text, /16/);
  s.tick += 120 * TICK_HZ;
  const ripped = d2.handle([{ e: 'rip', x: 1, y: 1, sup: 0, n: 0, i: 4, t: 'dmg', tier: 4 }], s).filter((m) => m.t === 'say');
  assert.equal(ripped.length, 1);
  assert.ok(!/\{\w\}|undefined/.test(ripped[0].text));
  // The first release introduces the kind; the second the Scalper.
  const d3 = createDirector(() => 0);
  const intro = d3.handle([{ e: 'waveStart', wave: 7, kinds: ['hunter', 'trader'], supers: [], release: 12 }], s).map((m) => m.text);
  assert.ok(intro.includes(fill(INTRO.trader, { p: 'P0' })));
  const sintro = d3.handle([{ e: 'waveStart', wave: 12, kinds: ['trader'], supers: ['trader'], release: 16 }], s).map((m) => m.text);
  assert.ok(sintro.includes(fill(SUPER_INTRO.trader, { p: 'P0' })));
  // A run of rips fades like any note.
  const d4 = createDirector(() => 0.5);
  let n = 0;
  for (let i = 0; i < 40; i++) { s.tick += 60 * TICK_HZ; n += d4.handle([{ e: 'rip', x: 1, y: 1, sup: 0, n: 2 }], s).length; }
  assert.ok(n >= 1 && n < 20, `${n} of 40 rips remarked on`);
});
