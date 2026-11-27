// Plays the whole training shift automatically and checks that every step can be completed and
// that each lesson shows what it claims to show, against the rules (0.4: the shop floor, The Back
// and the dads' Razor Wire). Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { HostSession } from '../src/net/session.js';
import { createDirector } from '../src/content/director.js';
import { createTutorial, STEPS, PART_TWO, TRAINING_DROPS } from '../src/tutorial/lessons.js';
import { HOW, BACK_HOW } from '../src/content/help.js';
import { arrowTarget } from '../src/tutorial/target.js';
import { tierRows } from '../src/content/facts.js';
import {
  createGame, applyCommand, step, queueTrainingWave, statsOf, BUILD, SHOP_KINDS, SHOPPERS, TUNE, TICK_HZ,
  addTrainingDrops, dropTicks, makeTicks, rebrandTicks, wireLive, dadRoute, itemTier, stockCap, unitsIn,
} from '../src/sim/index.js';

function trainingSession(seed = 9) {
  return new HostSession({ name: 'Dave', director: createDirector(() => 0.5), state: createGame({ seed, training: true }) });
}

const title = (t) => { const st = STEPS.find((x) => x.title === t); assert.ok(st, `there is a lesson called "${t}"`); return t; };
const SPRINKLER = title('Security: the Pepper Sprinkler'), WET = title('Slow them down: the Wet Floor Sign');
const SAMPLES = title('Make them stop: Free Samples'), SALES = title('Hold them up: the TV Salesman');
const LASER = title('Aim down the line: the Barcode Laser'), DADS = title('Dads, and the Forklift Turret');
const DOWN = title('Downstairs: The Back'), STILL = title('Junk into a Spite Still'), LIFT = title('Spite up the Dumbwaiter');
const INTERN = title('An Unpaid Intern'), SPLIT = title('Share a line: the Splitter'), DRY = title('Running dry');
const REBRAND = title('A better label: the Rebrander'), WIRE = title('Razor Wire: pick a direction');
const BENDER = title('Razor Wire: the Barb Bender'), GYM = title('Gym Bros'), REINFORCE = title('Reinforce the crates');
const MONEY = title('Money, and MORE JUNK');
/** The only kinds of shopper the training shift sends in (0.3.03, the owner's request). */
const SHIFT_KINDS = ['clipper', 'dad', 'gymbro'];
const tileOf = (s, x, y) => y * s.w + x;
const G = [10, 13], S2 = [9, 13], F = [8, 9], DOOR_CRATES = [[2, 7], [2, 8], [1, 9]];
const bAt = (s, [x, y]) => s.grid[tileOf(s, x, y)];

/**
 * What happened on the floor during one lesson, watched tick by tick: the things each lesson says
 * the player will see.
 */
function newWatch() {
  return {
    smashes: [], // smash events
    beams: [], // shoppers hit by each Barcode Laser beam, in order
    watching: [], // where shoppers stood to watch the TV Salesman, as [x, y]
    escapes: [], // escape events: who reached a till (kind, and 1 if super)
    kinds: new Set(), // kinds of shopper that walked in
    dadThrough: false, // a dad was seen inside a building that blocks everyone else (0.4)
    made: [], // made events (0.4): [tick, tile, item]
    outs: [], // stockOut events (0.4)
    turned: [], // turned events (0.4)
  };
}

function watchTick(s, w) {
  for (const m of s.shoppers) {
    w.kinds.add(m.k);
    const b = m.k === 'dad' && s.grid[(m.y | 0) * s.w + (m.x | 0)];
    if (b && BUILD[b.k].blocks) w.dadThrough = true;
  }
}

/**
 * What would happen instead: runs a wave on a copy of the game (the state is plain JSON) after
 * some other commands, and returns the shoppers who reached the tills.
 */
function whatIf(state, cmds, wave) {
  const copy = structuredClone(state);
  for (const cmd of cmds) assert.ok(applyCommand(copy, 0, cmd).ok, `what-if command ${cmd.c}`);
  queueTrainingWave(copy, wave);
  assert.ok(applyCommand(copy, 0, { c: 'start' }).ok);
  const escapes = [];
  for (let n = 0; n < 200 * TICK_HZ && copy.phase === 'wave'; n++) for (const e of step(copy)) if (e.e === 'escape') escapes.push(e);
  assert.equal(copy.phase, 'build', 'the what-if wave finished');
  return escapes;
}

/**
 * Plays the whole training shift the way the test player does: each lesson's solve() (through
 * tut.act, which also looks at a floor), then the game runs (one tick at a time, watched) until the
 * lesson is done, sending `after` commands once its wave is over. Returns the wave results and what
 * was seen, by lesson title.
 * @param {(tut: Object, st: Object) => void} [onStep] called before each step is solved
 * @param {(tut: Object, st: Object) => void} [onDone] called once each step has been completed
 */
function playAll(session, tut, { onStep = () => {}, onDone = () => {} } = {}) {
  const waves = {}, seen = {};
  let w = null;
  session.on('fx', (events) => {
    if (!w) return;
    for (const e of events) {
      if (e.e === 'smash') w.smashes.push(e);
      if (e.e === 'rail') w.beams.push(e.n);
      if (e.e === 'watching') w.watching.push([e.x, e.y]);
      if (e.e === 'escape') w.escapes.push(e);
      if (e.e === 'made') w.made.push([session.state.tick, e.i, e.c]);
      if (e.e === 'stockOut') w.outs.push(e);
      if (e.e === 'turned') w.turned.push(e);
    }
  });
  tut.start();
  while (tut.index < tut.total - 1) {
    const st = tut.step;
    onStep(tut, st);
    w = newWatch();
    for (const cmd of st.solve(session.state)) tut.act(cmd);
    if (!st.manual) {
      let sent = false;
      for (let n = 0; n < 240 * 15 && !tut.check(); n++) {
        sent = tut.finish(sent);
        session.fastForward(1);
        watchTick(session.state, w);
      }
      if (st.wave) waves[st.title] = tut.lastWave;
      seen[st.title] = { ...w, facts: { ...tut.facts }, ticks: session.state.tick };
      onDone(tut, st);
    }
    tut.next();
  }
  return { waves, seen };
}

/** What every lesson says happens. The same for every seed. */
function checkLessons(s, waves, seen, label) {
  // The TV Salesman: some Coupon Clippers stopped to watch, standing in the Sprinkler above him.
  assert.ok(seen[SALES].facts.watched >= 1, `${label}: Coupon Clippers stopped to watch the salesman`);
  const reach = statsOf(s.grid[tileOf(s, 5, 12)]).range;
  assert.ok(seen[SALES].watching.some(([x, y]) => (x - 5.5) ** 2 + (y - 12.5) ** 2 <= reach ** 2),
    `${label}: a shopper watched him from inside the Sprinkler's reach`);
  assert.deepEqual(waves[SALES], { stopped: 30, escaped: 0 }, `${label}: the whole coach party stopped`);

  // The Barcode Laser, down column 6: the next beam after the first takes most of the queue, and the
  // whole crowd of super shoppers is stopped.
  const beams = seen[LASER].beams;
  assert.ok(Math.max(...beams) >= 10, `${label}: a beam hits most of the queue (${beams})`);
  assert.deepEqual(waves[LASER], { stopped: 30, escaped: 0 }, `${label}: all thirty Extreme Couponers stopped`);
  assert.equal(s.grid[tileOf(s, 6, 4)].k, 'railgun');
  assert.equal(s.grid[tileOf(s, 6, 4)].d, 1, `${label}: the laser faces down`);

  // Dads (0.4): they walk straight through the maze; the forklift gets some, the rest reach a till.
  assert.equal(waves[DADS].stopped + waves[DADS].escaped, 6, `${label}: six dads came in`);
  assert.ok(seen[DADS].dadThrough, `${label}: a dad walked through a building`);
  assert.ok(waves[DADS].stopped >= 1, `${label}: the forklift got some`);
  assert.ok(waves[DADS].escaped >= 1, `${label}: the rest walked out with a refund`);
  for (const e of seen[DADS].escapes) assert.equal(e.k, 'dad');

  // The Back: "a piece every N seconds" is the rule's drop time.
  // The Still made Bottled Spite; "every N seconds" (the rule's time) between two of its units.
  const still = tileOf(s, 10, 4);
  const stillMade = [...seen[STILL].made, ...seen[LIFT].made].filter(([, i]) => i === still).map(([t]) => t);
  assert.ok(stillMade.length >= 1, `${label}: the Still made Spite`);
  assert.equal(itemTier(seen[STILL].made.find(([, i]) => i === still)[2]), 1, `${label}: Store Brand`);
  // The Sprinkler with Spite hits as hard as the lesson says (the rules' Store Brand numbers).
  // (Its stock at the end may be another brand: what matters is what it did when the lesson ended.)
  assert.ok(seen[LIFT].facts.stocked >= 1, `${label}: Spite went up a Dumbwaiter`);
  // The Intern stocked the Forklift; the Splitter both Sprinklers.
  assert.ok(seen[INTERN].facts.stocked >= 1, `${label}: the intern sent Spite up`);
  assert.ok(bAt(s, G).s?.dmg && bAt(s, S2).s?.dmg, `${label}: both gap Sprinklers hold Spite`);
  // Running dry: the Forklift's Spite ran out (OUT OF SPITE over it).
  assert.ok(seen[DRY].outs.some((e) => e.i === tileOf(s, ...F) && e.t === 'dmg'), `${label}: the forklift ran out of Spite`);
  // The Rebrander: the Forklift now works at Name Brand, which hits harder than Store Brand.
  assert.ok(seen[REBRAND].facts.made >= 1);
  // Razor Wire: dads walked into the live wire and were turned away.
  assert.ok(seen[BENDER].facts.turned >= 1, `${label}: the wire turned dads away`);
  assert.ok(seen[BENDER].turned.every((e) => e.i === tileOf(s, ...F)), `${label}: the forklift's wire`);
  // Gym bro: he walked through a crate by the entrance, and Rebuild put everything back.
  const doorCrates = DOOR_CRATES.map(([x, y]) => tileOf(s, x, y));
  assert.ok(seen[GYM].smashes.some((e) => e.k === 'crate' && doorCrates.includes(e.i)), `${label}: the gym bro went through the crates by the entrance`);
  assert.ok(seen[GYM].facts.rebuilt >= 1, `${label}: Rebuild put things back`);
  // Reinforced: he hit one and it held.
  assert.ok(seen[REINFORCE].smashes.some((e) => e.k === 'crate' && doorCrates.includes(e.i) && e.left >= 1), `${label}: a reinforced crate took his hit and stood`);
  for (const i of doorCrates) assert.equal(s.grid[i].k, 'crate', `${label}: the crates are standing`);
  // Money: the first drop works faster.
  const drop = s.back[tileOf(s, TRAINING_DROPS[0][0], TRAINING_DROPS[0][1])];
  assert.equal(drop.lv, 1, `${label}: MORE JUNK bought a level`);

  // Nobody but the three kinds came in, all shift long.
  const kinds = new Set(Object.values(seen).flatMap((x) => [...x.kinds]));
  for (const k of kinds) assert.ok(SHIFT_KINDS.includes(k), `${label}: a ${k} walked in`);

  // The gap cluster stays as part 1 left it, for the practice at the end.
  for (const [x, y] of [G, S2, [5, 12]]) assert.equal(s.grid[tileOf(s, x, y)]?.k, 'sprinkler', `${label}: the sprinklers are still there`);
}

test('training mode: no timer, no losing, waves only when lined up', () => {
  const s = createGame({ seed: 3, training: true });
  s.players.push({ id: 0, name: 'Dave', color: '#fff', role: 'x', on: true, w: {}, all: {} });
  assert.equal(applyCommand(s, 0, { c: 'start' }).why, 'notyet');
  queueTrainingWave(s, [{ k: 'hunter', n: TUNE.refundLimit + 5, gap: 0.1, at: 0 }]);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  let ended = null;
  for (let i = 0; i < 120 * TICK_HZ && !ended; i++) ended = step(s).find((e) => e.e === 'waveEnd') || null;
  assert.ok(ended && ended.training);
  assert.equal(s.phase, 'build', 'more refunds than the limit, and still not lost');
  assert.equal(s.phaseT, -1, 'the build phase waits for the lesson');
  assert.ok(s.refunds > TUNE.refundLimit);
  assert.equal(s.wave, 1, 'training waves do not count up');
});

test('the shift puts down its own Returns Drops, in a training game only (0.4)', () => {
  const session = trainingSession();
  createTutorial(session);
  const s = session.state;
  const drops = s.back.map((p, i) => (p && p.k === 'drop' ? [i % s.w, (i / s.w) | 0, p.d] : null)).filter(Boolean);
  assert.deepEqual(drops, TRAINING_DROPS.map(([x, y, d]) => [x, y, d]).sort((a, b) => a[1] * s.w + a[0] - (b[1] * s.w + b[0])));
  for (const [x, y] of TRAINING_DROPS) assert.notEqual(s.tiles[tileOf(s, x, y)], '#', 'on open floor');
  // A second tutorial on the same game adds nothing.
  assert.equal(addTrainingDrops(s, TRAINING_DROPS), 0);
  // A real game cannot be given extra junk.
  const real = createGame({ seed: 1 });
  assert.equal(addTrainingDrops(real, TRAINING_DROPS), 0);
  assert.ok(!real.back.some((p) => p && p.k === 'drop'));
});

test('the whole training shift can be completed, and each lesson shows what it says', () => {
  const session = trainingSession();
  const says = [];
  session.on('say', (m) => says.push(m.text));
  const reports = [];
  session.on('report', (m) => reports.push(m));
  const tut = createTutorial(session);
  const start = session.state.tick;
  const { waves, seen } = playAll(session, tut, {
    onStep: (t, st) => {
      assert.ok(st.title && st.text.length && st.quip, `step ${t.index} has a title, text and a line from DEB`);
      if (!st.manual) assert.equal(t.check(), false, `step ${t.index} "${st.title}" is not done before the player acts`);
      if (st.marks && !st.manual) assert.ok(t.marks().length > 0, `step "${st.title}" highlights something`);
      if (st.tool) assert.ok(t.tool() in BUILD || ['rebuild', 'wire', 'reinforce', 'remove'].includes(t.tool()), `step "${st.title}" points at a real button`);
    },
    onDone: (t, st) => {
      assert.equal(t.check(), true, `step ${t.index} "${st.title}" completes`);
      if (st.marks) assert.equal(t.marks().length, 0, `step "${st.title}" clears its highlights`);
    },
  });
  assert.equal(tut.step.last, true);
  assert.equal(STEPS[PART_TWO].title, DOWN);
  // Short (0.4, stage 6): about twenty lessons, and the game itself runs a few minutes of the shift.
  assert.ok(STEPS.length <= 23, `the shift is no longer than it was (${STEPS.length} lessons)`);
  const gameSecs = (session.state.tick - start) / TICK_HZ;
  assert.ok(gameSecs < 240, `the waves and the waiting take ${Math.round(gameSecs)} s of game time`);
  checkLessons(session.state, waves, seen, 'seed 9');
  assert.equal(reports.length, 0, 'no performance reviews interrupt training');
  assert.ok(says.length >= STEPS.length, 'DEB speaks at every step');

  // What each early wave lesson is meant to demonstrate.
  assert.deepEqual(waves[SPRINKLER], { stopped: 3, escaped: 0 }, 'one sprinkler stops three Coupon Clippers');
  assert.deepEqual(waves[WET], { stopped: 10, escaped: 0 }, 'sign plus two sprinklers stops ten Coupon Clippers');
  assert.deepEqual(waves[SAMPLES], { stopped: 16, escaped: 0 }, 'the gap holds against a crowd');
  assert.ok(session.state.players[0].cash >= 1000, 'money is never the obstacle in training');
});

test('every number a lesson on The Back states is the rules\' own', () => {
  const words = (t) => STEPS.find((st) => st.title === t).text.join(' ');
  const f1 = (v) => (Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1));
  // (The numbers go through facts.js's fmt; the text has them as printed.)
  assert.ok(words(DOWN).includes(`every ${f1(dropTicks(0) / TICK_HZ)} seconds`), 'the drop\'s time');
  assert.ok(words(STILL).includes(`every ${f1(makeTicks({}) / TICK_HZ)} seconds`), 'the Still\'s time');
  const spr = tierRows('sprinkler', 'dmg'), fork = tierRows('forklift', 'dmg');
  assert.ok(words(LIFT).includes(`from ${f1(spr[0].dmg)} to ${f1(spr[1].dmg)}`), 'a Sprinkler\'s hit with Store Brand Spite');
  assert.ok(spr[1].dmg > spr[0].dmg && fork[2].dmg > fork[1].dmg && fork[1].dmg > fork[0].dmg, 'each brand hits harder');
  assert.ok(words(INTERN).includes(`from ${f1(fork[0].dmg)} to ${f1(fork[1].dmg)}`), 'the Forklift\'s hit with Store Brand');
  assert.ok(words(REBRAND).includes(`to ${f1(fork[2].dmg)}`), 'the Forklift\'s hit with Name Brand');
  assert.ok(words(REBRAND).includes([1, 2, 3].map((t) => f1(rebrandTicks({}, t) / TICK_HZ)).join(', ')), 'the Rebrander\'s times');
  assert.ok(rebrandTicks({}, 1) > makeTicks({}) && rebrandTicks({}, 2) > rebrandTicks({}, 1), 'a pass is slower each brand up');
  assert.ok(words(LIFT).includes(`up to ${stockCap(null)} units`));
});

test('the wave lessons play out the same whatever the random seed, and each lesson\'s claims hold', () => {
  const SEEDS = [1, 2, 3, 7, 11, 42, 99, 1234];
  for (const seed of SEEDS) {
    const session = trainingSession(seed);
    const tut = createTutorial(session);
    const s = () => session.state;
    const { waves, seen } = playAll(session, tut, {
      onStep: (t, st) => {
        // What each lesson says its new building is needed for: without it, some get through.
        // "Ten Coupon Clippers in a bunch are more than one Sprinkler can wear down."
        if (st.title === WET) assert.ok(whatIf(s(), [], st.wave).length > 0, `seed ${seed}: one sprinkler lets some of the ten through`);
        // "A crowd this big swamps your gap."
        if (st.title === SALES) assert.ok(whatIf(s(), [], st.wave).length > 0, `seed ${seed}: the gap alone lets some of the coach party through`);
        if (st.title === LASER) assert.ok(whatIf(s(), [], st.wave).length > 0, `seed ${seed}: without the laser some Extreme Couponers get through`);
        // "It gets some of them": without it, more dads walk out with a refund.
        if (st.title === DADS) {
          const without = whatIf(s(), [], st.wave).length;
          const withIt = whatIf(s(), [{ c: 'place', k: 'forklift', x: F[0], y: F[1], d: 0 }], st.wave).length;
          assert.ok(withIt < without, `seed ${seed}: the forklift gets some (${withIt} through with it, ${without} without)`);
        }
        // "Running dry": with the line intact, the forklift does not run out in this wave.
        if (st.title === DRY) {
          const copy = structuredClone(s());
          queueTrainingWave(copy, st.wave);
          applyCommand(copy, 0, { c: 'start' });
          let out = false;
          for (let n = 0; n < 200 * TICK_HZ && copy.phase === 'wave'; n++) for (const e of step(copy)) if (e.e === 'stockOut' && e.i === tileOf(copy, ...F)) out = true;
          assert.equal(out, false, `seed ${seed}: kept fed, the forklift never runs dry`);
        }
      },
      onDone: (t, st) => {
        assert.equal(t.check(), true, `seed ${seed}: step "${st.title}" completes`);
        const state = s();
        // "Store Brand takes a Sprinkler's hit from 6 to 9.4": as the building is now.
        if (st.title === LIFT) {
          assert.equal(statsOf(bAt(state, G)).dmg, tierRows('sprinkler', 'dmg')[1].dmg, `seed ${seed}: the stocked sprinkler hits as the lesson says`);
          assert.ok(statsOf(bAt(state, G)).dmg > statsOf({ k: 'sprinkler' }).dmg);
        }
        if (st.title === INTERN) assert.equal(statsOf(bAt(state, F)).dmg, tierRows('forklift', 'dmg')[1].dmg, `seed ${seed}: the forklift with Store Brand`);
        if (st.title === REBRAND) {
          assert.equal(bAt(state, F).s.dmg[0], 2, `seed ${seed}: the forklift works at Name Brand`);
          assert.equal(statsOf(bAt(state, F)).dmg, tierRows('forklift', 'dmg')[2].dmg, `seed ${seed}: and hits as the lesson says`);
        }
        // "Planned (dashed)": a direction, no wire in stock; the DADS, IF WIRED route differs.
        if (st.title === WIRE) {
          const b = bAt(state, F);
          assert.equal(b.wd, 3);
          assert.equal(wireLive(b), false, `seed ${seed}: the wire is only planned`);
          const door = state.doors[0][0];
          assert.notDeepEqual(dadRoute(state, door, true), dadRoute(state, door, false), `seed ${seed}: the two dad routes differ`);
        }
        if (st.title === BENDER) assert.ok(wireLive(bAt(state, F)), `seed ${seed}: the wire is live`);
        if (st.title === MONEY) assert.ok(dropTicks(1) < dropTicks(0), 'MORE JUNK makes it faster');
      },
    });
    assert.deepEqual(waves[SPRINKLER], { stopped: 3, escaped: 0 }, `seed ${seed}: clippers`);
    assert.deepEqual(waves[WET], { stopped: 10, escaped: 0 }, `seed ${seed}: ten clippers at the sign`);
    assert.equal(waves[SAMPLES].escaped, 0, `seed ${seed}: crowd`);
    checkLessons(s(), waves, seen, `seed ${seed}`);
    // The Rebrander is slower than the Still: the units it puts out are further apart.
    const rb = tileOf(s(), 10, 8);
    const times = seen[REBRAND].made.filter(([, i]) => i === rb).map(([t]) => t);
    for (let n = 1; n < times.length; n++) assert.ok(times[n] - times[n - 1] >= rebrandTicks({}, 1), `seed ${seed}: a Name Brand unit takes its time`);
  }
});

test('opening the doors too early lines the same shoppers up again', () => {
  const session = trainingSession(5);
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === DADS));
  assert.equal(tut.step.title, DADS);
  session.send({ c: 'start' }); // before building the forklift
  for (let n = 0; n < 240 && !tut.facts.waveEnds; n++) session.fastForward(15);
  assert.equal(tut.facts.waveEnds, 1);
  assert.equal(tut.check(), false, 'not done: the forklift is not there');
  assert.ok(session.state.nextWave, 'the dads are waiting again');
  session.send({ c: 'place', k: 'forklift', x: 8, y: 9, d: 0 });
  assert.equal(tut.check(), true, 'built now, after seeing a wave: done');
  // A lesson without shoppers leaves nobody waiting outside.
  tut.next();
  assert.equal(tut.step.title, DOWN);
  assert.equal(session.state.nextWave, null);
});

test('running dry: the doors opened before the line is cut, then the cut, then it runs dry', () => {
  const session = trainingSession(7);
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === DRY));
  assert.equal(tut.step.title, DRY);
  assert.deepEqual(tut.marks().map((m) => [m.x, m.y, m.f, !!m.del]), [[10, 9, 1, true]]);
  // In the wrong order: the doors first. Kept fed, nothing runs out, and the crowd lines up again.
  tut.act({ c: 'start' });
  for (let n = 0; n < 400 && !tut.facts.waveEnds; n++) session.fastForward(15);
  assert.equal(tut.check(), false);
  assert.ok(session.state.nextWave, 'the crowd is waiting again');
  assert.match(tut.hint(), /Right-click the highlighted belt/);
  // Then as the lesson says.
  for (const cmd of tut.step.solve(session.state)) tut.act(cmd);
  for (let n = 0; n < 400 && !tut.check(); n++) session.fastForward(15);
  assert.equal(tut.check(), true);
});

test('the Rebrander lesson cannot stall: a Forklift full of Store Brand gets the doors', () => {
  const session = trainingSession(3);
  const tut = createTutorial(session);
  const at = STEPS.findIndex((st) => st.title === REBRAND);
  tut.autoplay(at - 1); // up to Running dry, then put the belt back instead of cutting it
  // (Played out as written, so the forklift is dry; refill it with Store Brand by putting the belt back.)
  for (const cmd of tut.step.solve(session.state)) tut.act(cmd);
  for (let n = 0; n < 400 && !tut.check(); n++) session.fastForward(15);
  tut.next();
  assert.equal(tut.step.title, REBRAND);
  // The cut belt goes back first: the forklift fills up with the Store Brand waiting on the line.
  tut.act({ c: 'place', k: 'conv', x: 10, y: 9, d: 1, f: 1 });
  for (let n = 0; n < 60; n++) session.fastForward(15);
  const b = session.state.grid[tileOf(session.state, ...F)];
  assert.ok(unitsIn(b, 'dmg', session.state) >= stockCap(session.state), 'the forklift filled up with Store Brand');
  assert.deepEqual(tut.marks().map((m) => [m.x, m.y, m.k]), [[10, 8, 'rebrand']], 'only the Rebrander is left to do');
  // The belt is in the way: take it out, and put the Rebrander there.
  tut.act({ c: 'remove', x: 10, y: 8, f: 1 });
  tut.act({ c: 'place', k: 'rebrand', x: 10, y: 8, d: 1, f: 1 });
  tut.act({ c: 'view', f: 0 });
  assert.equal(tut.check(), false);
  assert.ok(session.state.nextWave, 'a crowd is waiting');
  assert.match(tut.hint(), /OPEN THE DOORS/);
  tut.act({ c: 'start' });
  for (let n = 0; n < 400 && !tut.check(); n++) session.fastForward(15);
  assert.equal(tut.check(), true, 'once it has fired some, Name Brand goes up');
  assert.ok(session.state.grid[tileOf(session.state, ...F)].s.dmg.some((v, n) => n % 2 === 0 && v === 2));
});

test('the Gym Bro lesson waits for the Rebuild button after its wave', () => {
  const session = trainingSession(3);
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === GYM));
  const st = tut.step;
  assert.equal(st.title, GYM);
  assert.equal(tut.tool(), 'crate');
  for (const cmd of st.solve(session.state)) tut.act(cmd);
  for (let n = 0; n < 240 && !tut.facts.waveEnds; n++) session.fastForward(15);
  assert.ok(session.state.rubble.length > 0, 'he wrecked something');
  assert.equal(tut.check(), false, 'not done until it is rebuilt');
  assert.equal(tut.tool(), 'rebuild', 'the panel now points at the Rebuild button');
  assert.ok(tut.marks().length > 0 && tut.marks()[0].label === 'Wrecked', 'the wrecks are highlighted');
  assert.equal(tut.marks().length, session.state.rubble.length);
  assert.match(tut.hint(), /Press B/);
  assert.ok(session.send({ c: 'rebuild' }).ok);
  assert.equal(tut.check(), true);
  assert.equal(tut.marks().length, 0);
});

test('lessons on The Back survive extra building and another order', () => {
  // Laying the whole line before the Still: the Still's lesson still completes once it makes Spite.
  const session = trainingSession(11);
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === STILL));
  tut.act({ c: 'view', f: 1 });
  for (let y = 5; y <= 12; y++) tut.act({ c: 'place', k: 'conv', x: 10, y, d: 1, f: 1 });
  tut.act({ c: 'place', k: 'conv', x: 15, y: 5, d: 0, f: 1 }); // a stray belt somewhere else
  for (const cmd of tut.step.solve(session.state)) tut.act(cmd);
  for (let n = 0; n < 200 && !tut.check(); n++) session.fastForward(15);
  assert.equal(tut.check(), true);
  tut.next();
  // The next lesson's belts are already down: only the trip back up is left.
  assert.equal(tut.step.title, LIFT);
  for (let n = 0; n < 200 && !session.state.grid[tileOf(session.state, ...G)].s; n++) session.fastForward(15);
  assert.equal(tut.marks().length, 0);
  assert.equal(tut.check(), false, 'still looking at The Back');
  assert.match(tut.hint(), /Press Tab/);
  tut.act({ c: 'view', f: 0 });
  assert.equal(tut.check(), true);
});

test('autoplay reaches any step, for screenshots and for Skip', () => {
  const session = trainingSession(4);
  const tut = createTutorial(session);
  assert.deepEqual(tut.autoplay(), []);
  assert.equal(tut.index, STEPS.length - 1);

  const other = trainingSession(4);
  const t2 = createTutorial(other);
  assert.deepEqual(t2.autoplay(1), []);
  assert.equal(t2.step.title, 'Build the maze: Crate Stacks');
  t2.skip();
  assert.equal(t2.step.title, 'You can never block the route completely');
  assert.equal(t2.marks().length, 1);

  // Jumping to part 2 builds the shop floor, and only the lesson it lands on gets DEB's line.
  const third = trainingSession(4);
  const says = [];
  third.on('say', (m) => says.push(m.text));
  const t3 = createTutorial(third);
  assert.deepEqual(t3.autoplay(PART_TWO), []);
  assert.equal(t3.index, PART_TWO);
  const quips = new Set(STEPS.map((st) => st.quip));
  assert.deepEqual(says.filter((t) => quips.has(t)), [STEPS[PART_TWO].quip]);
  assert.equal(third.state.grid[13 * third.state.w + 4].k, 'salesman', 'the TV Salesman is in place');
  assert.equal(third.state.grid[4 * third.state.w + 6].k, 'railgun', 'and the Barcode Laser');
  assert.equal(third.state.grid[9 * third.state.w + 8].k, 'forklift', 'and the Forklift, which part 1 ends with');

  // The panel's jump keeps refusals off the screen; the "you cannot block the route" lesson
  // still counts its refusal.
  const fourth = trainingSession(4);
  const t4 = createTutorial(fourth);
  const emit = fourth.emit;
  fourth.emit = (type, msg) => { if (type !== 'nope' && type !== 'say') emit.call(fourth, type, msg); };
  assert.deepEqual(t4.autoplay(PART_TWO), []);

  // Each lesson can be opened straight from the URL (?tutorial=1&step=N): autoplay to it, and it
  // is not done yet.
  for (let n = 1; n < STEPS.length; n++) {
    const sn = trainingSession(4);
    const tn = createTutorial(sn);
    assert.deepEqual(tn.autoplay(n), [], `step=${n} is reached`);
    assert.equal(tn.index, n);
    if (!STEPS[n].manual) assert.equal(tn.check(), false, `step=${n} "${STEPS[n].title}" still waits for the player`);
  }
});

test('every building and part has a plain explanation', () => {
  for (const k of SHOP_KINDS) {
    assert.ok(HOW[k], `help for ${k}`);
    assert.ok(HOW[k].does.length > 20 && HOW[k].use.length > 20, `help for ${k} says what it does and how to use it`);
  }
  for (const k of ['conv', 'split', 'over', 'intern', 'bin', 'still', 'cannery', 'spooler', 'bender', 'rebrand']) assert.ok(BACK_HOW[k], `help for ${k}`);
});

test('the player places every building and the parts that matter, and uses every tool (0.4)', () => {
  // Played through, gathering what each lesson's marks ask for at the start and as it goes.
  const session = trainingSession();
  const tut = createTutorial(session);
  const asked = new Map(); // kind -> titles of the lessons whose marks ask for it
  const tools = { rebuild: new Set(), remove: new Set(), wire: new Set(), reinforce: new Set(), more: new Set() };
  const look = () => {
    const st = tut.step;
    for (const m of tut.marks()) {
      if (m.fix === 'rebuild') tools.rebuild.add(st.title);
      if (m.wd !== undefined) tools.wire.add(st.title);
      if (m.r !== undefined) tools.reinforce.add(st.title);
      if (m.act === 'more') tools.more.add(st.title);
      if (m.del) tools.remove.add(st.title);
      if (!m.k) continue;
      if (!asked.has(m.k)) asked.set(m.k, new Set());
      asked.get(m.k).add(st.title);
      // A mark on a tile that holds something else asks for that to be removed first.
      const g = m.f ? session.state.back[m.y * session.state.w + m.x] : session.state.grid[m.y * session.state.w + m.x];
      if (g && g.k !== m.k && g.part === undefined) tools.remove.add(st.title);
    }
  };
  playAll(session, tut, { onStep: () => look() });
  tools.rebuild.add(GYM); // (its wrecks show after its wave: the Gym Bro test checks the marks)

  const solves = STEPS.flatMap((st) => st.solve(createGame({ training: true })));
  assert.equal(SHOP_KINDS.length, 7, 'every building on the shop floor (a new one needs a lesson)');
  for (const k of [...SHOP_KINDS, 'conv', 'still', 'intern', 'split', 'rebrand', 'bender']) {
    assert.ok(asked.has(k), `some lesson's marks ask the player to place a ${BUILD[k].name}`);
    assert.ok(solves.some((c) => c.c === 'place' && c.k === k), `a lesson has the player place a ${BUILD[k].name}`);
  }
  for (const [tool, lessons] of Object.entries(tools)) assert.ok(lessons.size >= 1, `a lesson has the player use ${tool}`);
  assert.ok(solves.some((c) => c.c === 'wire') && solves.some((c) => c.c === 'reinforce') && solves.some((c) => c.c === 'dropUp'));
  assert.ok(solves.some((c) => c.c === 'view' && c.f === 1) && solves.some((c) => c.c === 'view' && c.f === 0), 'both floors');
  assert.ok(!solves.some((c) => c.c === 'upgrade'), 'no lesson buys an upgrade');
});

test('the whole shift sends in Coupon Clippers, Dads and a Gym Bro, and nobody else (0.3.03)', () => {
  const kinds = new Set(STEPS.flatMap((st) => (st.wave || []).map((g) => g.k)));
  assert.deepEqual([...kinds].sort(), [...SHIFT_KINDS].sort(), 'exactly these three kinds, no fourth by accident');
  // And the words name no other kind of shopper (the last lesson only says that there are more).
  for (const st of STEPS) {
    const words = [...st.text, ...(st.touch || []), st.quip].join(' ');
    for (const [k, def] of Object.entries(SHOPPERS)) {
      if (SHIFT_KINDS.includes(k)) continue;
      assert.ok(!words.includes(def.name), `"${st.title}" mentions ${def.name}`);
    }
  }
});

test('on a touch screen no lesson or help text mentions a key or the mouse', async () => {
  const { forTouch } = await import('../src/content/touch.js');
  const help = await import('../src/content/help.js');
  const texts = [];
  // A lesson with its own touch wording (0.3.03) shows that instead; it still goes through forTouch.
  let ownWords = 0;
  for (const st of STEPS) {
    if (st.touch) {
      ownWords++;
      assert.ok(st.touch.length && st.touch[0].startsWith('Do this:'), `"${st.title}": its touch wording starts with what to do`);
    }
    texts.push(...(st.touch || st.text));
  }
  assert.ok(ownWords >= 16, 'the lessons that place things have touch wording of their own');
  for (const v of Object.values(help.HOW)) texts.push(v.does, v.use);
  // (The Back's parts, 0.4, on their own build bar.)
  for (const v of Object.values(help.BACK_HOW)) texts.push(v.does, v.use);
  for (const v of [help.HOW_REMOVE, help.HOW_REBUILD, help.HOW_WIRE, help.HOW_REINFORCE]) texts.push(v.does, v.use);
  // The live hints too, at the moments a player is most likely to see them: something in the way
  // on both floors, and looking at the wrong floor.
  const session = trainingSession();
  const tut = createTutorial(session);
  tut.start();
  for (let n = 0; n < STEPS.length - 1; n++) {
    for (const m of tut.marks()) {
      if (m.f) session.send({ c: 'place', k: 'bin', x: m.x, y: m.y, d: 0, f: 1 });
      else session.send({ c: 'place', k: 'wetfloor', x: m.x, y: m.y, d: 0 });
      break;
    }
    for (const f of [0, 1]) {
      tut.act({ c: 'view', f });
      if (tut.hint()) texts.push(tut.hint());
      for (const m of tut.marks()) if (m.label) texts.push(m.label);
    }
    for (const m of tut.marks()) session.send({ c: 'remove', x: m.x, y: m.y, f: m.f });
    tut.skip();
  }
  // (0.4.01: Q puts down whatever is held.)
  const keys = /\bpress(ing)? (the mouse|[0-9RUBFHZQ]\b|Tab\b)|\bQ puts\b|right-click|\bEsc\b|\bmouse\b|W, A, S|\bclick/i;
  let changed = 0;
  for (const t of texts) {
    const out = forTouch(t);
    if (out !== t) changed++;
    assert.ok(!keys.test(out), `still keyboard or mouse wording after forTouch: "${out}"`);
  }
  assert.ok(changed >= 8, `forTouch changed ${changed} texts`);
  // And it leaves desktop wording alone when there is nothing to change.
  assert.equal(forTouch('A Wet Floor Sign halves the speed of shoppers.'), 'A Wet Floor Sign halves the speed of shoppers.');
});

test('every lesson leads with what to do, and DEB says what to do before any joke', () => {
  for (const st of STEPS) {
    assert.ok(st.text[0].startsWith('Do this:'), `"${st.title}" starts with its "Do this:" line`);
    // The first sentence alone says what to press (a lesson that teaches a key may add it).
    assert.ok(/\b(press|click|put|drag|tap|try|read|find|look)\b/i.test(st.text[0].split('. ')[0]), `"${st.title}": the first sentence is an instruction`);
    assert.ok(st.quip && st.quip.length < 170, `"${st.title}": DEB's line is short`);
    // Short (the owner's guidance in 0.3.03: fewer words): no lesson runs past four paragraphs.
    assert.ok(st.text.length <= 4, `"${st.title}" is short`);
  }
});

// ---- Unhappy paths (0.4.00): what the player took out, turned or cleared ------------------------

/** Carries out what one mark asks for, as a player following the highlights would. */
function doMark(session, m) {
  const s = session.state;
  if (m.fix === 'rebuild') return session.send({ c: 'rebuild' });
  if (m.wd !== undefined) return session.send({ c: 'wire', x: m.x, y: m.y, d: m.wd });
  if (m.r !== undefined) return session.send({ c: 'reinforce', x: m.x, y: m.y });
  if (m.act === 'more') return session.send({ c: 'dropUp', x: m.x, y: m.y });
  if (m.del) return session.send({ c: 'remove', x: m.x, y: m.y, f: m.f });
  if (!m.k) return null;
  if (m.k === 'drop') {
    for (let n = 0; n < 4 && s.back[tileOf(s, m.x, m.y)].d !== m.d; n++) session.send({ c: 'rotate', x: m.x, y: m.y, f: 1 });
    return null;
  }
  const here = m.f ? s.back[tileOf(s, m.x, m.y)] : s.grid[tileOf(s, m.x, m.y)];
  if (here && (here.k !== m.k || (m.d !== undefined && here.d !== m.d))) session.send({ c: 'remove', x: m.x, y: m.y, f: m.f });
  return session.send({ c: 'place', k: m.k, x: m.x, y: m.y, d: m.d ?? 0, f: m.f });
}

/**
 * A player who does only what the lesson highlights, looks at the floor it wants and opens the
 * doors when the arrow points at them. Plays the current lesson until it is done or `secs` of game
 * time have passed; returns whether it is done.
 */
function followMarks(session, tut, secs = 400) {
  for (let n = 0; n < (secs * TICK_HZ) / 15 && !tut.check(); n++) {
    const st = tut.step;
    if (session.state.phase !== 'wave') for (const m of tut.marks()) doMark(session, m);
    const marks = tut.marks();
    if (!marks.length) {
      const want = typeof st.view === 'function' ? st.view(session.state) : st.view;
      if (want !== undefined && want !== tut.floor) tut.act({ c: 'view', f: want });
    } else if ((marks[0].f | 0) !== tut.floor) tut.act({ c: 'view', f: marks[0].f | 0 });
    const t = arrowTarget(st, session.state, tut.marks(), { floor: tut.floor });
    if (t.kind === 'control' && t.name === 'doors') tut.act({ c: 'start' });
    if (tut.check()) break;
    session.fastForward(15);
  }
  return tut.check();
}

/** A lesson's marks, as [x, y, what, floor] ('wd' for a wire mark, 'del' to take out), for comparing. */
const markList = (tut) => tut.marks().map((m) => [m.x, m.y, m.wd !== undefined ? 'wd' : m.del ? 'del' : m.k, m.f | 0]);
const hasMark = (tut, x, y, k, f) => markList(tut).some((m) => m[0] === x && m[1] === y && m[2] === k && m[3] === f);
const lessonAt = (t) => STEPS.findIndex((st) => st.title === t);

test('Running dry with the Intern taken out instead of his belt: it counts, and the Rebrander lesson has him put back (0.4.00)', () => {
  const session = trainingSession(9);
  const tut = createTutorial(session);
  tut.autoplay(lessonAt(DRY));
  assert.equal(tut.step.title, DRY);
  tut.act({ c: 'view', f: 1 });
  assert.ok(session.send({ c: 'remove', x: 9, y: 9, f: 1 }).ok, 'the Intern comes out');
  assert.deepEqual(tut.marks(), [], 'the Forklift is starved either way: nothing more to take out');
  assert.ok(followMarks(session, tut), 'the Forklift ran dry all the same');
  tut.next();
  assert.equal(tut.step.title, REBRAND);
  assert.ok(hasMark(tut, 9, 9, 'intern', 1), 'the Intern is marked to be put back');
  for (const cmd of tut.step.solve(session.state)) tut.act(cmd);
  assert.deepEqual(markList(tut), [[9, 9, 'intern', 1]], 'only the Intern is left to do');
  assert.equal(tut.tool(), 'intern');
  assert.match(tut.hint(), /Press Tab/, 'he is in The Back');
  tut.act({ c: 'view', f: 1 });
  assert.match(tut.hint(), /Unpaid Intern back on the highlighted tile/);
  assert.doesNotMatch(tut.hint(), /on its way up/);
  assert.ok(followMarks(session, tut), 'with him back, Name Brand reaches the Forklift');
  assert.equal(tut.marks().length, 0);
});

test('the Barb Bender lesson with the Forklift\'s wire direction cleared shows the wire mark again (0.4.00)', () => {
  const session = trainingSession(9);
  const tut = createTutorial(session);
  tut.autoplay(lessonAt(BENDER));
  assert.equal(tut.step.title, BENDER);
  // One more click with the Wire tool after north turns it off.
  assert.ok(session.send({ c: 'wire', x: F[0], y: F[1], d: -1 }).ok);
  assert.equal(bAt(session.state, F).wd, undefined);
  for (const cmd of tut.step.solve(session.state)) tut.act(cmd);
  assert.ok(hasMark(tut, F[0], F[1], 'wd', 0), 'the last lesson\'s wire mark is back');
  assert.equal(tut.marks().find((m) => m.wd !== undefined).wd, 3, 'north');
  assert.equal(tut.tool(), 'wire');
  assert.match(tut.hint(), /no wire direction/);
  assert.match(tut.hint(), /until its wire points north/);
  // Turned another way: the same mark, and the hint says which way it points.
  assert.ok(session.send({ c: 'wire', x: F[0], y: F[1], d: 1 }).ok);
  assert.match(tut.hint(), /points south/);
  assert.ok(followMarks(session, tut), 'set north again, the wire goes live and turns dads away');
  assert.equal(bAt(session.state, F).wd, 3);
  assert.equal(tut.marks().length, 0);
});

test('a belt taken out of the line, the Still taken out, the Forklift sold: each lesson marks it and can still be finished (0.4.00)', () => {
  // A belt out of the line in the Intern lesson, before he is placed.
  let session = trainingSession(9), tut = createTutorial(session);
  tut.autoplay(lessonAt(INTERN));
  assert.ok(session.send({ c: 'remove', x: 10, y: 6, f: 1 }).ok);
  for (const cmd of tut.step.solve(session.state)) tut.act(cmd);
  if (!tut.check()) assert.ok(hasMark(tut, 10, 6, 'conv', 1), 'the belt is marked');
  assert.ok(followMarks(session, tut));
  // The Still out before the line goes down: nothing more comes.
  session = trainingSession(9); tut = createTutorial(session);
  tut.autoplay(lessonAt(LIFT));
  assert.ok(session.send({ c: 'remove', x: 10, y: 4, f: 1 }).ok);
  for (const cmd of tut.step.solve(session.state)) tut.act(cmd);
  assert.ok(hasMark(tut, 10, 4, 'still', 1), 'the Still is marked');
  tut.act({ c: 'view', f: 1 });
  assert.match(tut.hint(), /Spite Still back on the highlighted tile, its arrow pointing down/);
  assert.ok(followMarks(session, tut));
  // The Forklift sold, in each lesson that needs it.
  for (const t of [INTERN, DRY, REBRAND, WIRE, BENDER]) {
    session = trainingSession(9); tut = createTutorial(session);
    tut.autoplay(lessonAt(t));
    assert.ok(session.send({ c: 'remove', x: F[0], y: F[1] }).ok);
    assert.ok(hasMark(tut, F[0], F[1], 'forklift', 0), `${t}: the Forklift is marked`);
    if (t !== WIRE) {
      // (The lesson's own work first, which its hint asks for before anything else.)
      if (t !== DRY) for (const cmd of tut.step.solve(session.state)) if (cmd.c !== 'start') tut.act(cmd);
      tut.act({ c: 'view', f: 0 });
      assert.match(tut.hint(), /Forklift Turret back on the highlighted tile/, t);
    }
    assert.ok(followMarks(session, tut), `${t}: finished with a new Forklift`);
  }
  // Running dry with a new, empty Forklift and its belt already out: the belt goes back first.
  session = trainingSession(9); tut = createTutorial(session);
  tut.autoplay(lessonAt(DRY));
  assert.ok(session.send({ c: 'remove', x: 10, y: 9, f: 1 }).ok);
  assert.ok(session.send({ c: 'remove', x: F[0], y: F[1] }).ok);
  assert.ok(session.send({ c: 'place', k: 'forklift', x: F[0], y: F[1], d: 0 }).ok);
  assert.deepEqual(markList(tut), [[10, 9, 'conv', 1]], 'an empty Forklift has nothing to run out of');
  assert.match(tut.hint(), /Belt back on the highlighted tile/);
  assert.ok(followMarks(session, tut));
});

test('whatever a player takes out, turns or clears, every lesson from The Back on can be finished by following its marks (0.4.00)', () => {
  // What a player might undo, at the start of each lesson (the same as undoing it in an earlier one).
  const UNDO = {
    intern: [{ c: 'remove', x: 9, y: 9, f: 1 }],
    still: [{ c: 'remove', x: 10, y: 4, f: 1 }],
    belt: [{ c: 'remove', x: 10, y: 6, f: 1 }],
    cut: [{ c: 'remove', x: 10, y: 9, f: 1 }],
    drop: [{ c: 'rotate', x: 10, y: 2, f: 1 }],
    wireDrop: [{ c: 'rotate', x: 6, y: 9, f: 1 }],
    forklift: [{ c: 'remove', x: F[0], y: F[1] }],
    wire: [{ c: 'wire', x: F[0], y: F[1], d: -1 }],
    sprinklers: [{ c: 'remove', x: G[0], y: G[1] }, { c: 'remove', x: S2[0], y: S2[1] }],
  };
  // The game as it is at the start of each lesson, played once.
  const first = lessonAt(STILL), last = lessonAt(MONEY);
  const base = trainingSession(9), bt = createTutorial(base);
  const snaps = [];
  for (let i = first; i <= last; i++) { assert.deepEqual(bt.autoplay(i), []); snaps.push([i, JSON.parse(JSON.stringify(base.state))]); }
  const stuck = [];
  for (const [i, snap] of snaps) {
    for (const [what, cmds] of Object.entries(UNDO)) {
      const session = new HostSession({ name: 'Dave', director: createDirector(() => 0.5), state: structuredClone(snap) });
      const tut = createTutorial(session);
      tut.start();
      while (tut.index < i) tut.next();
      for (const cmd of cmds) session.send(cmd);
      if (!followMarks(session, tut)) stuck.push(`${STEPS[i].title} after "${what}": hint "${tut.hint()}", marks ${JSON.stringify(markList(tut))}`);
    }
  }
  assert.deepEqual(stuck, []);
});

test('the Splitter and the Rebrander go straight on the belt, and the lessons still finish if the belt is taken out first (0.4.01)', () => {
  for (const title of ['Share a line: the Splitter', 'A better label: the Rebrander']) {
    const at = STEPS.findIndex((st) => st.title === title);
    assert.ok(at > 0, title);
    for (const removeFirst of [false, true]) {
      const session = trainingSession();
      const tut = createTutorial(session);
      assert.deepEqual(tut.autoplay(at), [], `${title}: reached`);
      const place = STEPS[at].solve(session.state).filter((c) => c.c === 'place');
      const part = place[0];
      const tile = session.state.back[part.y * session.state.w + part.x];
      assert.equal(tile && tile.k, 'conv', `${title}: the marked tile holds a belt`);
      // The arrow points at the part's button (or the tile once it is held), never at taking the belt out.
      const m = tut.marks().find((mk) => mk.x === part.x && mk.y === part.y && mk.f);
      assert.equal(m.k, part.k);
      if (!removeFirst) {
        assert.deepEqual(arrowTarget(STEPS[at], session.state, tut.marks(), { floor: 1 }), { kind: 'button', k: part.k }, `${title}: the arrow asks for the part`);
        assert.deepEqual(arrowTarget(STEPS[at], session.state, tut.marks(), { floor: 1, tool: part.k }), { kind: 'tile', x: part.x, y: part.y }, `${title}: then the belt's tile`);
      }
      if (removeFirst) assert.equal(session.send({ c: 'remove', x: part.x, y: part.y, f: 1 }).ok, true);
      for (const cmd of STEPS[at].solve(session.state)) tut.act(cmd);
      assert.equal(session.state.back[part.y * session.state.w + part.x].k, part.k, `${title}: placed${removeFirst ? ' after the belt came out' : ' on the belt'}`);
      for (let n = 0; n < 400 && !tut.check(); n++) { tut.finish(); session.fastForward(15); }
      if (!tut.check() && STEPS[at].wave) {
        tut.act({ c: 'start' });
        for (let n = 0; n < 400 && !tut.check(); n++) session.fastForward(15);
      }
      assert.ok(tut.check(), `${title}${removeFirst ? ', belt taken out first' : ''}: completes`);
    }
  }
});
