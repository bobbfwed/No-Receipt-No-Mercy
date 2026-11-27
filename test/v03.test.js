// Tests for the rules added in version 0.3: every shopper walks at his own pace, and some shoppers
// are weak or tough against certain security. Shoplifting (0.3.01) is here too, as 0.4 made it:
// browsing shoppers steal a unit of stock from the security they walk past (no more detours to
// goods on belts).
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createGame, addPlayer, applyCommand, step, queueTrainingWave, walkPace, babyPace, defOf, edgeMul,
  addStock, itemCode, unitsIn, statsOf, levelIn, STOCK_TRACKS,
  SHOPPERS, SUPERS, BUILD, BOSS, BABY, TUNE, TICK_HZ, DT, ST,
} from '../src/sim/index.js';
import { stealStock } from '../src/sim/back.js';
import { edgeFacts, edgeText, shopperTraits } from '../src/content/facts.js';
import { EDGE_HELP } from '../src/content/help.js';

/** An ordinary game on the original small map, one player, doors not yet open. */
function game(seed = 5) {
  const s = createGame({ seed });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  return s;
}

// ---------------------------------------------------------------- every shopper at his own pace

test('each shopper walks at his own pace: 10% either side of his kind, spread evenly, from his id alone', () => {
  const s = game();
  assert.equal(TUNE.paceSpread, 0.1);
  const paces = [];
  for (let id = 1; id <= 200; id++) paces.push(walkPace(s, { id, k: 'hunter' }));
  for (const p of paces) assert.ok(p >= 0.9 - 1e-12 && p <= 1.1 + 1e-12, `pace ${p}`);
  assert.ok(Math.min(...paces) < 0.905 && Math.max(...paces) > 1.095, 'uses the whole band');
  // Evenly: every tenth of the band gets roughly a tenth of 200 shoppers.
  const bins = new Array(10).fill(0);
  for (const p of paces) bins[Math.min(9, Math.floor(((p - 0.9) / 0.2) * 10))]++;
  for (const n of bins) assert.ok(n >= 15 && n <= 25, `bins ${bins}`);
  // A run of consecutive ids (a group arriving together) is spread out too, not bunched.
  const run = [11, 12, 13, 14, 15].map((id) => walkPace(s, { id, k: 'dad' }));
  assert.ok(Math.max(...run) - Math.min(...run) > 0.1, `run ${run}`);
  // The same id always gets the same pace, whatever else is in the state.
  assert.equal(walkPace(s, { id: 42, k: 'karen' }), walkPace(game(99), { id: 42, k: 'karen', sup: 1 }));
});

test('the boss, babies and a training game walk at exactly their speed; babies keep their own spread', () => {
  const s = game();
  assert.equal(walkPace(s, { id: 7, k: 'boss' }), 1);
  assert.equal(walkPace(s, { id: 7, k: 'baby' }), 1);
  const tr = createGame({ seed: 5, training: true });
  assert.equal(walkPace(tr, { id: 7, k: 'hunter' }), 1);
  // (babyPace is unchanged: still between BABY.paceMin and paceMax.)
  assert.ok(babyPace(3) >= BABY.paceMin && babyPace(3) <= BABY.paceMax);
});

/** The fastest step (in tiles) a shopper took over n ticks of walking on open floor. */
function topStep(s, sh, n) {
  let top = 0;
  for (let i = 0; i < n; i++) {
    step(s);
    if (!s.shoppers.includes(sh) || sh.st !== ST.WALK) continue;
    top = Math.max(top, Math.hypot(sh.vx, sh.vy));
  }
  return top;
}

test('in a real game a shopper really walks at his kind\'s speed times his own pace', () => {
  const s = game(3);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  // Let the first sales event's hunters arrive on the bare floor.
  let hunters = [];
  for (let i = 0; i < 8 * TICK_HZ && hunters.length < 3; i++) { step(s); hunters = s.shoppers.filter((m) => m.k === 'hunter'); }
  assert.ok(hunters.length >= 3);
  const sh = hunters[0];
  const want = SHOPPERS.hunter.speed * walkPace(s, sh) * DT;
  const got = topStep(s, sh, 20);
  assert.ok(Math.abs(got - want) < 1e-9, `step ${got}, want ${want}`);
  // Different ids, different paces: no two of the first three walk at the same speed.
  const p = hunters.map((m) => walkPace(s, m));
  assert.equal(new Set(p.map((v) => v.toFixed(6))).size, 3);
  // No field was added to the shopper for it (the state, a save and the checksum are untouched).
  for (const m of s.shoppers) for (const k of Object.keys(m)) assert.ok(!/pace/i.test(k), k);
});

test('a training game\'s shoppers walk at exactly their kind\'s speed (the lessons depend on it)', () => {
  const s = createGame({ seed: 5, training: true });
  addPlayer(s, 'Dave');
  queueTrainingWave(s, [{ k: 'hunter', n: 3, gap: 1, at: 0 }]);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  let sh = null;
  for (let i = 0; i < 60 && !sh; i++) { step(s); sh = s.shoppers[0]; }
  assert.ok(sh);
  const got = topStep(s, sh, 20);
  assert.ok(Math.abs(got - SHOPPERS.hunter.speed * DT) < 1e-9, `step ${got}`);
});

test('a dad and a super dad each walk at their own pace; the boss at exactly his', () => {
  const s = game(4);
  // Two dads with different paces, placed side by side on open floor of the small map.
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  s.spawnQ = [];
  s.nextId = 20;
  const mk = (k, sup) => {
    const def = sup ? defOf({ k, sup: 1 }) : SHOPPERS[k];
    const sh = { id: s.nextId++, k, x: 3.5, y: 7.5, vx: 0, vy: 0, hp: 1e6, mhp: 1e6, st: ST.WALK, t: 0, cd: 0, ox: 0, oy: 0, lt: -1 };
    if (sup) sh.sup = 1;
    s.shoppers.push(sh);
    return [sh, def];
  };
  const [dad, ddef] = mk('dad', 0);
  const [sdad, sdef] = mk('dad', 1);
  // (A dad drains patience by itself; plenty given above.)
  const a = topStep(s, dad, 1), b = Math.hypot(sdad.vx, sdad.vy);
  assert.ok(Math.abs(a - ddef.speed * walkPace(s, dad) * DT) < 1e-9);
  assert.ok(Math.abs(b - sdef.speed * walkPace(s, sdad) * DT) < 1e-9);
  assert.notEqual(walkPace(s, dad), walkPace(s, sdad));
  // The boss walks at exactly his speed.
  const boss = { id: 99, k: 'boss', x: 3.5, y: 8.5, vx: 0, vy: 0, hp: 1e6, mhp: 1e6, st: ST.WALK, t: 0, cd: 0, ox: 0, oy: 0, lt: -1, tr: 1, pp: 1e6 };
  s.shoppers.push(boss);
  step(s);
  assert.ok(Math.abs(Math.hypot(boss.vx, boss.vy) - BOSS.speed * DT) < 1e-9);
});

// ---------------------------------------------------------------- weak and tough

/** A training game on the original small map (no timer, cannot be lost) with plenty of cash. */
function stage(seed = 5) {
  const s = createGame({ seed, training: true });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  return s;
}
const place = (s, k, x, y, d = 0) => applyCommand(s, 0, { c: 'place', k, x, y, d });
/** Puts a shopper of kind k (super if sup) on the floor at (x, y), held there, with lots of patience. */
function held(s, k, x, y, sup = 0) {
  const sh = { id: s.nextId++, k, x, y, vx: 0, vy: 0, hp: 1e4, mhp: 1e4, st: ST.BROWSE, t: 1e6, cd: 1e6, ox: 0, oy: 0, lt: -1 };
  if (sup) sh.sup = 1;
  s.shoppers.push(sh);
  return sh;
}
/** Opens the doors on a training wave whose only shopper is far off, so buildings fire. */
function openDoors(s) {
  queueTrainingWave(s, [{ k: 'hunter', n: 1, gap: 1, at: 1000 }]);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
}

/** The owner's table: [weak to, tough against] for every kind. */
const TABLE = {
  clipper: ['railgun', undefined], dad: [undefined, 'sprinkler'], karen: ['sprinkler', 'railgun'],
  scooter: ['forklift', undefined], teen: ['sprinkler', undefined], blind: [undefined, 'railgun'],
  gymbro: ['sprinkler', 'forklift'], drinker: ['wetfloor', 'sprinkler'], dog: ['sprinkler', 'forklift'],
  cosplay: ['forklift', 'railgun'], hunter: [undefined, undefined], mom: [undefined, undefined],
  flasher: [undefined, undefined], preggo: [undefined, undefined],
  // (0.3.01: the Card Trader. Wet cards are not mint.)
  trader: ['sprinkler', undefined],
};

test('the weak-and-tough table is the owner\'s; supers have their base kind\'s, the boss and babies none', () => {
  assert.equal(TUNE.weakMul, 1.1);
  assert.equal(TUNE.toughMul, 0.9);
  assert.deepEqual(Object.keys(TABLE).sort(), Object.keys(SHOPPERS).sort());
  for (const [k, [weak, tough]] of Object.entries(TABLE)) {
    assert.equal(SHOPPERS[k].weak, weak, `${k} weak`);
    assert.equal(SHOPPERS[k].tough, tough, `${k} tough`);
    assert.equal(SUPERS[k].weak, weak, `${k} super weak`);
    assert.equal(SUPERS[k].tough, tough, `${k} super tough`);
    for (const b of [weak, tough]) if (b) assert.equal(BUILD[b].group, 'security');
  }
  for (const def of [BOSS, BABY]) assert.ok(!def.weak && !def.tough);
  assert.equal(edgeMul(SHOPPERS.teen, 'sprinkler'), 1.1);
  assert.equal(edgeMul(SHOPPERS.dad, 'sprinkler'), 0.9);
  assert.equal(edgeMul(SHOPPERS.dad, ''), 1, 'anything that is not a building\'s is untouched');
  assert.equal(edgeMul(BOSS, 'sprinkler'), 1);
});

test('a sprinkler takes 10% more from a teenager and 10% less from a dad than from a bargain hunter', () => {
  const s = stage(2);
  assert.ok(place(s, 'sprinkler', 15, 4).ok);
  openDoors(s);
  const hunter = held(s, 'hunter', 15.5, 5.5), teen = held(s, 'teen', 15.2, 5.5), dad = held(s, 'dad', 15.8, 5.5);
  // (A dad's own drain each tick goes on as before: nothing changes it.)
  const ticks = 3 * TICK_HZ;
  for (let i = 0; i < ticks; i++) step(s);
  const lost = (m) => m.mhp - m.hp;
  const hit = lost(hunter);
  assert.ok(hit > 0, 'the sprinkler fired');
  assert.ok(Math.abs(lost(teen) - hit * 1.1) < 1e-9, `teen ${lost(teen)} vs ${hit}`);
  assert.ok(Math.abs(lost(dad) - (hit * 0.9 + SHOPPERS.dad.drain * DT * ticks)) < 1e-6, `dad ${lost(dad)} vs ${hit}`);
});

test('a cosplayer who takes a shot meant for someone else loses it at his own rate (weak to forklifts)', () => {
  const s = stage(2);
  assert.ok(place(s, 'forklift', 15, 4).ok);
  openDoors(s);
  // A dog (tough against forklifts) nearest the tills, with a cosplayer right behind him.
  const dog = held(s, 'dog', 15.5, 7.5), cos = held(s, 'cosplay', 14.8, 7.5);
  let shots = 0;
  for (let i = 0; i < 2 * TICK_HZ; i++) shots += step(s).filter((e) => e.e === 'shot').length;
  assert.ok(shots >= 1);
  assert.equal(dog.hp, dog.mhp, 'the dog was shielded');
  assert.ok(Math.abs(cos.mhp - cos.hp - shots * BUILD.forklift.dmg * TUNE.weakMul) < 1e-9);
  // Without the cosplayer beside him the dog takes it himself, and less of it.
  cos.x = 3.5;
  const before = dog.hp, cosBefore = cos.hp;
  let more = 0;
  for (let i = 0; i < 2 * TICK_HZ; i++) more += step(s).filter((e) => e.e === 'shot').length;
  assert.ok(more >= 1);
  assert.equal(cos.hp, cosBefore);
  assert.ok(Math.abs(before - dog.hp - more * BUILD.forklift.dmg * TUNE.toughMul) < 1e-9);
});

test('a Pregnant Lady finished by a Barcode Laser still does not pop, and a Karen loses less to it', () => {
  const s = stage(3);
  assert.ok(place(s, 'railgun', 14, 1, 1).ok);
  openDoors(s);
  const her = held(s, 'preggo', 14.5, 9.5);
  her.hp = 1;
  const karen = held(s, 'karen', 14.5, 11.5);
  const ev = [];
  for (let i = 0; i < TICK_HZ; i++) ev.push(...step(s));
  assert.ok(ev.some((e) => e.e === 'nopop'));
  assert.ok(!ev.some((e) => e.e === 'pop'));
  const rails = ev.filter((e) => e.e === 'rail').length;
  assert.ok(rails >= 1);
  assert.ok(Math.abs(karen.mhp - karen.hp - rails * BUILD.railgun.dmg * TUNE.toughMul) < 1e-9);
});

test('a day drinker takes 10% longer to cross a wet floor sign than anyone else', () => {
  const s = stage(4);
  assert.ok(place(s, 'wetfloor', 5, 7).ok);
  openDoors(s);
  const walker = (k, y) => ({ id: s.nextId++, k, x: 5.5, y, vx: 0, vy: 0, hp: 1e4, mhp: 1e4, st: ST.WALK, t: 0, cd: 1e6, ox: 0, oy: 0, lt: -1 });
  const d = walker('drinker', 7.5), h = walker('hunter', 7.2);
  d.sv = 1;
  s.shoppers.push(d, h);
  step(s);
  // (A training game: everyone at exactly his kind's speed. The sign as built halves it.)
  const slow = 0.5;
  assert.ok(Math.abs(Math.hypot(h.vx, h.vy) - SHOPPERS.hunter.speed * slow * DT) < 1e-9);
  assert.ok(Math.abs(Math.hypot(d.vx, d.vy) - SHOPPERS.drinker.speed * d.sv * (slow / TUNE.weakMul) * DT) < 1e-9);
});

test('the handbook, the help and the README say what each kind is weak to and tough against, with the reason', () => {
  for (const k of Object.keys(SHOPPERS)) {
    const [weak, tough] = TABLE[k];
    const edges = edgeFacts(k);
    assert.equal(edges.length, (weak ? 1 : 0) + (tough ? 1 : 0), k);
    for (const e of edges) {
      assert.ok(e.why.length > 20, `${k} ${e.side} has a reason`);
      assert.ok(/10%/.test(e.effect), `${k}: ${e.effect}`);
    }
    const text = edgeText(k);
    if (weak) assert.ok(text.includes(`Weak to the ${BUILD[weak].name}`), text);
    if (tough) assert.ok(text.includes(`Tough against the ${BUILD[tough].name}`), text);
    if (!weak && !tough) assert.equal(text, '');
    // The handbook's Known offenders facts.
    const traits = new Map(shopperTraits(k, 0));
    if (weak) assert.ok(traits.get('Weak to').startsWith(BUILD[weak].name));
    if (tough) assert.ok(traits.get('Tough against').startsWith(BUILD[tough].name));
  }
  // Every reason written belongs to a kind that has that edge.
  for (const [k, o] of Object.entries(EDGE_HELP)) for (const side of Object.keys(o)) assert.ok(SHOPPERS[k][side], `${k} ${side}`);
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const k of Object.keys(SHOPPERS)) if (edgeText(k)) assert.ok(readme.includes(edgeText(k)), `README has ${k}`);
});

// ---------------------------------------------------------------- shoplifting stock (0.4)

/**
 * An ordinary game on the small map with the doors open and nobody else coming, and a forklift on
 * (10, 6), switched off so it shoots nobody, stocked with these supplies ([type, tier], a unit
 * each). The route to the tills runs east along rows 7 and 8, right past it.
 */
function shop(t, units = [[1, 1], [1, 1], [3, 2]], grabChance = 1e6) {
  // (Put back to the real number after the test, however many shops it made.)
  TUNE.grabChance = grabChance;
  t.after(() => { TUNE.grabChance = GRAB; });
  const s = game(6);
  assert.ok(place(s, 'forklift', 10, 6).ok);
  const b = s.grid[6 * s.w + 10];
  for (const [type, tier] of units) addStock(b, itemCode(type, tier), s);
  b.off = 1e9;
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  s.spawnQ = [];
  s.shoppers.length = 0;
  return { s, b };
}
/** A shopper of kind k walking from (x, y), with patience to spare. */
function walker(s, k, x, y) {
  const sh = { id: s.nextId++, k, x, y, vx: 0, vy: 0, hp: 1e5, mhp: 1e5, st: ST.WALK, t: 0, cd: 0, ox: 0, oy: 0, lt: -1 };
  s.shoppers.push(sh);
  return sh;
}
/** Steps until `until` is true (or the time runs out); returns every event. */
function run(s, seconds, until = () => false) {
  const all = [];
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    all.push(...step(s));
    if (until()) break;
  }
  return all;
}
const SHOTS = BUILD.forklift.shots;
const GRAB = TUNE.grabChance;

test('a bargain hunter walking past takes one unit of the supply the building holds most of, then carries on to the tills', (t) => {
  const { s, b } = shop(t);
  const h = walker(s, 'hunter', 8.5, 7.5);
  const ev = run(s, 30, () => !s.shoppers.includes(h));
  const grabs = ev.filter((e) => e.e === 'grab');
  assert.equal(grabs.length, 1, 'once: then he is not tempted for a while, and walks on');
  assert.deepEqual([grabs[0].i, grabs[0].t, grabs[0].tier], [6 * s.w + 10, 'dmg', 1]);
  assert.deepEqual(b.s, { dmg: [1, SHOTS], rng: [2, SHOTS] });
  assert.equal(s.ws.stolen, 1);
  assert.ok(ev.some((e) => e.e === 'escape' && e.k === 'hunter'), 'and took his refund like anyone else');
  // He stood there for TUNE.grabSecs and is not tempted again for TUNE.grabCooldown.
  assert.ok(TUNE.grabSecs > 0 && TUNE.grabCooldown === 5);
});

test('he takes from the newest run, a whole unit or what is left of it; a tie goes to the first supply in STOCK_TRACKS', () => {
  const s = game(6);
  assert.ok(place(s, 'forklift', 10, 6).ok);
  const i = 6 * s.w + 10, b = s.grid[i];
  // Two units of Store Brand then one of Premium Spite, one of Name Brand Cola: Spite has more.
  for (const c of [itemCode(1, 1), itemCode(1, 1), itemCode(1, 3), itemCode(2, 2)]) addStock(b, c, s);
  b.s.dmg[3] = 2; // (the newest run, the Premium unit, is mostly used: 2 uses left in it)
  const ev = [];
  assert.deepEqual(stealStock(s, b, i, false, ev), { t: 'dmg', tier: 3 });
  assert.deepEqual(b.s.dmg, [1, 2 * SHOTS], 'what was left of the newest run, and that run is gone');
  assert.deepEqual(stealStock(s, b, i, false, ev), { t: 'dmg', tier: 1 }, 'still two units of Spite against one of Cola');
  assert.deepEqual(b.s.dmg, [1, SHOTS], 'a whole unit\'s worth');
  // One of each now: the tie goes to Spite, the first in STOCK_TRACKS.
  assert.ok(STOCK_TRACKS.indexOf('dmg') < STOCK_TRACKS.indexOf('spd'));
  assert.deepEqual(stealStock(s, b, i, false, ev), { t: 'dmg', tier: 1 });
  assert.equal(b.s.dmg, undefined);
  assert.deepEqual(ev, [{ e: 'stockOut', i, t: 'dmg' }], 'the Spite ran dry: the usual warning');
  assert.deepEqual(stealStock(s, b, i, false, ev), { t: 'spd', tier: 2 });
  assert.equal(b.s, undefined, 'nothing left at all');
  assert.equal(stealStock(s, b, i, false, ev), null, 'and nothing to take');
  assert.deepEqual(ev.map((e) => e.t), ['dmg', 'spd']);
});

test('a Card Trader takes the highest tier in stock, from any supply and any run', () => {
  const s = game(6);
  assert.ok(place(s, 'forklift', 10, 6).ok);
  const i = 6 * s.w + 10, b = s.grid[i];
  // Spite: Store Brand, Platinum, Store Brand (the Platinum in the middle); Cola: Premium.
  for (const c of [itemCode(1, 1), itemCode(1, 4), itemCode(1, 1), itemCode(2, 3), itemCode(2, 3)]) addStock(b, c, s);
  assert.deepEqual(b.s.dmg, [1, SHOTS, 4, SHOTS, 1, SHOTS]);
  const ev = [];
  assert.deepEqual(stealStock(s, b, i, true, ev), { t: 'dmg', tier: 4 });
  assert.deepEqual(b.s.dmg, [1, 2 * SHOTS], 'the runs either side are one run again');
  assert.equal(levelIn(b, 'dmg'), 2);
  assert.deepEqual(stealStock(s, b, i, true, ev), { t: 'spd', tier: 3 });
  assert.deepEqual(b.s.spd, [3, SHOTS]);
  assert.deepEqual(ev, []);
});

test('a theft that empties a supply sends stockOut, and the building works as built again', (t) => {
  const { s, b } = shop(t, [[1, 4]]);
  const plain = statsOf({ k: 'forklift' }, s).dmg;
  assert.ok(statsOf(b, s).dmg > plain);
  walker(s, 'clipper', 8.5, 7.5);
  const ev = run(s, 20, () => !s.shoppers.length);
  assert.ok(ev.some((e) => e.e === 'grab'));
  assert.deepEqual(ev.filter((e) => e.e === 'stockOut'), [{ e: 'stockOut', i: 6 * s.w + 10, t: 'dmg' }]);
  assert.equal(b.s, undefined);
  assert.equal(statsOf(b, s).dmg, plain);
});

test('dads, the boss and babies never steal (they do not browse), and an empty building tempts nobody', (t) => {
  let { s, b } = shop(t);
  const dad = walker(s, 'dad', 8.5, 7.5), baby = walker(s, 'baby', 8.5, 8.5);
  const boss = walker(s, 'boss', 7.5, 7.5);
  boss.tr = 1; boss.pp = 1e6;
  let ev = run(s, 40, () => !s.shoppers.length);
  assert.ok(!ev.some((e) => e.e === 'grab' || e.e === 'rip'));
  assert.equal(unitsIn(b, 'dmg', s), 2);
  ({ s, b } = shop(t, []));
  const h = walker(s, 'hunter', 8.5, 7.5);
  ev = run(s, 30, () => !s.shoppers.includes(h));
  assert.ok(!ev.some((e) => e.e === 'grab'));
  assert.equal(h.cd, 0, 'never even stopped');
});

test('a theft as he passes uses the old numbers: a roll of TUNE.grabChance a second beside stock', (t) => {
  // At the real chance, about 1 - e^-chance of hunters standing beside stock for a second take some.
  const chance = GRAB;
  assert.equal(chance, 0.92, 'the number goods on belts were stolen at, kept');
  let took = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { s } = shop(t, [[1, 1]], chance);
    s.rng = seed;
    const h = walker(s, 'hunter', 10.5, 7.5);
    // Held right under the forklift for a second.
    let got = false;
    for (let n = 0; n < TICK_HZ; n++) { h.x = 10.5; h.y = 7.5; if (step(s).some((e) => e.e === 'grab')) { got = true; break; } }
    if (got) took++;
  }
  assert.ok(Math.abs(took / 60 - (1 - Math.exp(-chance))) < 0.2, `${took} of 60`);
});

test('a copy of the game made just after a theft plays on identically', (t) => {
  const { s } = shop(t, [[1, 2], [3, 1], [4, 3]]);
  assert.ok(place(s, 'sprinkler', 12, 6).ok);
  for (const k of ['hunter', 'clipper', 'preggo']) walker(s, k, 7.5, 7.5);
  run(s, 10, () => s.ws.stolen > 0);
  assert.ok(s.ws.stolen > 0);
  const copy = JSON.parse(JSON.stringify(s));
  for (let i = 0; i < 6 * TICK_HZ; i++) { step(s); step(copy); }
  assert.deepEqual(JSON.parse(JSON.stringify(copy)), JSON.parse(JSON.stringify(s)));
});

test('shoplifting: after a theft a shopper is tempted again sooner than after a sample, and the detour is gone', () => {
  assert.ok(TUNE.grabCooldown < 7);
  assert.equal(TUNE.browseCooldown, 7);
  for (const k of ['liftLook', 'liftMin', 'liftMax', 'liftChance', 'liftSecs', 'ripMax', 'ripChance']) assert.equal(TUNE[k], undefined, k);
});
