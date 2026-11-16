// Plays the whole training shift automatically and checks that every step can be completed and
// that each lesson shows what it claims to show. Run with: node --test
import test from 'node:test';
import { nopeLine } from '../src/content/lines.js';
import assert from 'node:assert/strict';
import { HostSession } from '../src/net/session.js';
import { createDirector } from '../src/content/director.js';
import { createTutorial, STEPS, PART_TWO } from '../src/tutorial/lessons.js';
import { HOW } from '../src/content/help.js';
import { createGame, applyCommand, step, queueTrainingWave, levelOf, defOf, BUILD, TUNE, TICK_HZ, DT, ST } from '../src/sim/index.js';

function trainingSession(seed = 9) {
  return new HostSession({ name: 'Dave', director: createDirector(() => 0.5), state: createGame({ seed, training: true, zones: true }) });
}

const title = (t) => { const st = STEPS.find((x) => x.title === t); assert.ok(st, `there is a lesson called "${t}"`); return t; };
const TEENS = title('Teenagers'), KARENS = title('Karens'), STEADY = title('Shoppers you cannot slow down');
const GYM = title('Gym Bros'), MOMS = title('Mom and Kid'), MOMS_FIX = title('Finish her while the kid is in the cart');

/**
 * What happened on the floor during one lesson's wave, watched tick by tick: the things each part 2
 * lesson says the player will see.
 */
function newWatch() {
  return {
    shots: new Map(), // tile index of a tower -> shots it fired
    smashes: [], // smash events
    puddleWade: 0, // ticks a shopper other than a teenager spent walking through a puddle
    puddleSlow: 0, // ...of which he was moving at half his speed or less
    karenNear: new Set(), // tile indexes of towers that had a Karen within her reach at some point
    bolted: new Set(), // ids of guide dog owners whose dog bolted
    steadyOnSign: 0, // ticks a guide dog owner or scooter spent walking over a Wet Floor Sign...
    steadySlowed: 0, // ...moving slower than his own speed while not bolting
    kidThroughLine: false, // a loose child past the production line while his mom was still before it
    crawlHit: 0, // ticks a crawling mom lost patience (must stay 0: nothing can hurt her)
    gotUp: 0, // moms who reached their child on their hands and knees and got up again
  };
}

function watchTick(s, w, before) {
  const messes = new Set(s.messes.map((m) => m[0]));
  for (const m of s.shoppers) {
    if (m.st === ST.LEAVE) continue;
    const def = defOf(m);
    const i = (m.y | 0) * s.w + (m.x | 0);
    const moved = Math.hypot(m.vx, m.vy);
    const walking = m.st === ST.WALK && moved > 0;
    const was = before.get(m.id);
    if (walking && m.k !== 'teen' && messes.has(i) && !s.grid[i]) {
      w.puddleWade++;
      if (moved <= def.speed * DT * 0.51) w.puddleSlow++;
    }
    if (def.nag) {
      for (let t = 0; t < s.grid.length; t++) {
        const b = s.grid[t];
        if (!b || (b.k !== 'sprinkler' && b.k !== 'forklift')) continue;
        if ((m.x - (t % s.w) - 0.5) ** 2 + (m.y - ((t / s.w) | 0) - 0.5) ** 2 <= TUNE.nagRange ** 2) w.karenNear.add(t);
      }
    }
    if (def.bolts && m.bt > 0) w.bolted.add(m.id);
    // (A bolting dog only makes him faster, so any tick under his own speed would be the sign.)
    if (def.steady && walking && was && s.grid[was.i] && s.grid[was.i].k === 'wetfloor') {
      w.steadyOnSign++;
      if (moved < def.speed * DT * 0.99) w.steadySlowed++;
    }
    if (def.kid && m.kd > 0 && m.kx > 11 && m.x < 10) w.kidThroughLine = true;
    if (def.kid && was && was.cr === 1 && m.cr === 1 && m.hp < was.hp) w.crawlHit++;
    if (def.kid && was && was.cr === 1 && m.cr !== 1 && m.hp > 0) w.gotUp++;
  }
  before.clear();
  for (const m of s.shoppers) before.set(m.id, { cr: m.cr, hp: m.hp, i: (m.y | 0) * s.w + (m.x | 0) });
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
  for (let n = 0; n < 120 * TICK_HZ && copy.phase === 'wave'; n++) for (const e of step(copy)) if (e.e === 'escape') escapes.push(e);
  assert.equal(copy.phase, 'build', 'the what-if wave finished');
  return escapes;
}

/**
 * Plays the whole training shift the way the test player does: each lesson's solve(), then the
 * game runs (one tick at a time, watched) until the lesson is done, sending `after` commands once
 * its wave is over. Returns the wave results and what was seen, by lesson title.
 * @param {(tut: Object, st: Object) => void} [onStep] called before each step is solved
 * @param {(tut: Object, st: Object) => void} [onDone] called once each step has been completed
 */
function playAll(session, tut, { onStep = () => {}, onDone = () => {} } = {}) {
  const waves = {}, seen = {};
  let w = null;
  session.on('fx', (events) => {
    if (!w) return;
    for (const e of events) {
      if (e.e === 'shot') w.shots.set(e.i, (w.shots.get(e.i) || 0) + 1);
      if (e.e === 'smash') w.smashes.push(e);
    }
  });
  tut.start();
  while (tut.index < tut.total - 1) {
    const st = tut.step;
    onStep(tut, st);
    w = newWatch();
    const before = new Map();
    for (const cmd of st.solve(session.state)) session.send(cmd);
    if (!st.manual) {
      let sent = false;
      for (let n = 0; n < 240 * 15 && !tut.check(); n++) {
        sent = tut.finish(sent);
        session.fastForward(1);
        watchTick(session.state, w, before);
      }
      if (st.wave) waves[st.title] = tut.lastWave;
      seen[st.title] = { ...w, facts: { ...tut.facts } };
      onDone(tut, st);
    }
    tut.next();
  }
  return { waves, seen };
}

const tileOf = (s, x, y) => y * s.w + x;

/** What each part 2 lesson says happens. The same for every seed. */
function checkPartTwo(s, waves, seen, label) {
  // Teenagers: puddles, and the hunters behind them slowed down in them.
  assert.ok(seen[TEENS].facts.mess >= 2, `${label}: the teenagers spilled (${seen[TEENS].facts.mess} puddles)`);
  assert.ok(seen[TEENS].puddleWade > 0, `${label}: hunters walked through the puddles`);
  assert.ok(seen[TEENS].puddleSlow > 0, `${label}: and went at half speed in them`);
  assert.equal(waves[TEENS].escaped, 0, `${label}: the teenagers and hunters are all stopped`);

  // Karens: the sprinklers at the gap were in her reach; the new forklift never was, and it fired.
  const fork = tileOf(s, 16, 13);
  assert.ok(seen[KARENS].karenNear.has(tileOf(s, 9, 13)) && seen[KARENS].karenNear.has(tileOf(s, 11, 13)), `${label}: a Karen slowed the sprinklers at the gap`);
  assert.ok(!seen[KARENS].karenNear.has(fork), `${label}: the forklift past the gap was never in a Karen's reach`);
  assert.ok(seen[KARENS].shots.get(fork) > 0, `${label}: the new forklift fired at them`);
  assert.deepEqual(waves[KARENS], { stopped: 3, escaped: 0 }, `${label}: three Karens stopped`);

  // Guide dogs and scooters: every dog bolted, and the sign slowed nobody.
  assert.equal(seen[STEADY].bolted.size, 2, `${label}: both guide dogs bolted when sprayed`);
  assert.ok(seen[STEADY].steadyOnSign > 0, `${label}: they crossed the wet floor sign`);
  assert.equal(seen[STEADY].steadySlowed, 0, `${label}: and it did not slow them`);
  assert.ok(seen[STEADY].shots.get(fork) > 0, `${label}: the upgraded forklift hit them`);
  assert.equal(levelOf(s.grid[fork]), 3);
  assert.deepEqual(waves[STEADY], { stopped: 4, escaped: 0 }, `${label}: two guide dogs and two scooters stopped`);

  // Gym bro: he walked through a crate by the entrance, and Rebuild put everything back.
  const doorCrates = [[2, 7], [2, 8], [1, 9]].map(([x, y]) => tileOf(s, x, y));
  assert.ok(seen[GYM].smashes.some((e) => e.k === 'crate' && doorCrates.includes(e.i)), `${label}: the gym bro went through the crates by the entrance`);
  for (const e of seen[GYM].smashes) if (e.down) assert.ok(s.grid[e.i], `${label}: upgraded security only lost a level`);
  assert.ok(seen[GYM].facts.rebuilt >= 1, `${label}: Rebuild put things back`);
  for (const i of doorCrates) assert.equal(s.grid[i].k, 'crate', `${label}: the crates are back`);

  // Mom and Kid: a child ran through the line, a mom crawled, nothing hurt her, and she got up.
  // (Whether a kid gets loose before or after his mom is past the production line is chance, so
  // the lesson says "usually"; the seed test checks that it usually does.)
  assert.ok(seen[MOMS].facts.kid >= 1, `${label}: a kid escaped`);
  assert.ok(seen[MOMS].facts.crawl >= 1, `${label}: a mom crawled`);
  assert.equal(seen[MOMS].crawlHit, 0, `${label}: nothing hurt a crawling mom`);
  assert.ok(seen[MOMS].gotUp >= 1, `${label}: a crawling mom reached her kid and got up`);

  // Finishing her: the forklift by the entrance stops every mom before her child gets out.
  assert.equal(seen[MOMS_FIX].facts.kid, 0, `${label}: no kid got out of the cart`);
  assert.equal(seen[MOMS_FIX].facts.crawl, 0, `${label}: so no mom crawled`);
  assert.deepEqual(waves[MOMS_FIX], { stopped: 3, escaped: 0 }, `${label}: three moms stopped`);

  // The gap cluster stays as part 1 left it, for the practice at the end.
  for (const [x, y] of [[9, 13], [11, 13]]) assert.ok(levelOf(s.grid[tileOf(s, x, y)]) >= 3, `${label}: the sprinklers at the gap are still there`);
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

test('the whole training shift can be completed, and each lesson shows what it says', () => {
  const session = trainingSession();
  const says = [];
  session.on('say', (m) => says.push(m.text));
  const reports = [];
  session.on('report', (m) => reports.push(m));
  const tut = createTutorial(session);
  const { waves, seen } = playAll(session, tut, {
    onStep: (t, st) => {
      assert.ok(st.title && st.text.length && st.quip, `step ${t.index} has a title, text and a line from DEB`);
      if (!st.manual) assert.equal(t.check(), false, `step ${t.index} "${st.title}" is not done before the player acts`);
      if (st.marks && !st.manual) assert.ok(t.marks().length > 0, `step "${st.title}" highlights something`);
      if (st.tool) assert.ok(t.tool() in BUILD || ['upgrade', 'rebuild'].includes(t.tool()), `step "${st.title}" points at a real button`);
    },
    onDone: (t, st) => {
      assert.equal(t.check(), true, `step ${t.index} "${st.title}" completes`);
      if (st.marks) assert.equal(t.marks().length, 0, `step "${st.title}" clears its highlights`);
    },
  });
  assert.equal(tut.step.last, true);
  assert.equal(STEPS[PART_TWO].title, 'Part 2: The difficult customers');
  // The Gym Bro lesson points at Rebuild once there is something to rebuild.
  assert.ok(seen[GYM].facts.smashedCrate >= 1);
  checkPartTwo(session.state, waves, seen, 'seed 9');
  assert.equal(reports.length, 0, 'no performance reviews interrupt training');
  assert.ok(says.length >= STEPS.length, 'DEB speaks at every step');

  // What each wave lesson is meant to demonstrate.
  assert.deepEqual(waves['Security: the Pepper Sprinkler'], { stopped: 3, escaped: 0 }, 'one sprinkler stops three Coupon Clippers');
  assert.deepEqual(waves['Slow them down: the Wet Floor Sign'], { stopped: 4, escaped: 0 }, 'sign plus two sprinklers stops four Bargain Hunters');
  assert.equal(waves['Make them stop: Free Samples'].escaped, 0, 'the gap holds against a crowd');
  assert.deepEqual(waves.Dads, { stopped: 0, escaped: 4 }, 'all four dads walk straight through the belts');
  assert.ok(waves['Stopping dads'].stopped >= 3, `forklift and signs stop most dads (stopped ${waves['Stopping dads'].stopped} of 5)`);
  assert.deepEqual(waves['Upgrades, and super shoppers'], { stopped: 3, escaped: 0 }, 'upgraded sprinklers stop three super shoppers');
  assert.ok(session.state.players[0].cash >= 1000, 'money is never the obstacle in training');
});

test('the wave lessons play out the same whatever the random seed', () => {
  let kidsThroughLine = 0;
  const SEEDS = [1, 2, 3, 7, 11, 42, 99, 1234];
  for (const seed of SEEDS) {
    const session = trainingSession(seed);
    const tut = createTutorial(session);
    const { waves, seen } = playAll(session, tut, {
      onStep: (t, st) => {
        // "Your sprinklers cannot stop it on their own": without the forklift, the Turbo Scooter gets through.
        if (st.title === STEADY) {
          const got = whatIf(session.state, [{ c: 'remove', x: 16, y: 13 }], st.wave);
          assert.ok(got.some((e) => e.k === 'scooter' && e.sup), `seed ${seed}: the sprinklers alone let the Turbo Scooter through`);
        }
      },
      onDone: (t, st) => assert.equal(t.check(), true, `seed ${seed}: step "${st.title}" completes`),
    });
    assert.deepEqual(waves['Security: the Pepper Sprinkler'], { stopped: 3, escaped: 0 }, `seed ${seed}: clippers`);
    assert.deepEqual(waves['Slow them down: the Wet Floor Sign'], { stopped: 4, escaped: 0 }, `seed ${seed}: hunters`);
    assert.equal(waves['Make them stop: Free Samples'].escaped, 0, `seed ${seed}: crowd`);
    assert.deepEqual(waves.Dads, { stopped: 0, escaped: 4 }, `seed ${seed}: dads walk through`);
    assert.ok(waves['Stopping dads'].stopped >= 3, `seed ${seed}: dads stopped ${waves['Stopping dads'].stopped} of 5`);
    assert.deepEqual(waves['Upgrades, and super shoppers'], { stopped: 3, escaped: 0 }, `seed ${seed}: supers`);
    checkPartTwo(session.state, waves, seen, `seed ${seed}`);
    if (seen[MOMS].kidThroughLine) kidsThroughLine++;
  }
  assert.ok(kidsThroughLine >= SEEDS.length * 0.75, `a kid ran through the production line in ${kidsThroughLine} of ${SEEDS.length} games ("usually")`);
});

test('opening the doors too early lines the same shoppers up again', () => {
  const session = trainingSession(5);
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === KARENS));
  assert.equal(tut.step.title, KARENS);
  session.send({ c: 'start' }); // before building the forklift
  for (let n = 0; n < 240 && !tut.facts.waveEnds; n++) session.fastForward(15);
  assert.equal(tut.facts.waveEnds, 1);
  assert.equal(tut.check(), false, 'not done: the forklift is not there');
  assert.ok(session.state.nextWave, 'three more Karens are waiting');
  session.send({ c: 'place', k: 'forklift', x: 16, y: 13, d: 0 });
  assert.equal(tut.check(), true, 'built now, after seeing a wave: done');
  // A lesson without shoppers leaves nobody waiting outside.
  tut.back();
  tut.next();
  tut.next();
  assert.equal(tut.step.title, STEADY);
  tut.back();
  tut.back();
  assert.equal(tut.step.title, TEENS);
  tut.back();
  assert.equal(tut.step.manual, true);
  assert.equal(session.state.nextWave, null);
});

test('the Gym Bro lesson waits for the Rebuild button after its wave', () => {
  const session = trainingSession(3);
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === GYM));
  const st = tut.step;
  assert.equal(st.title, GYM);
  assert.equal(tut.tool(), 'crate');
  for (const cmd of st.solve(session.state)) session.send(cmd);
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

test('autoplay reaches any step, for screenshots and for Skip', () => {
  const session = trainingSession(4);
  const tut = createTutorial(session);
  assert.deepEqual(tut.autoplay(), []);
  assert.equal(tut.index, STEPS.length - 1);

  const other = trainingSession(4);
  const t2 = createTutorial(other);
  assert.deepEqual(t2.autoplay(7), []);
  assert.equal(t2.step.title, 'Close the gaps: Crates');
  t2.skip();
  assert.equal(t2.step.title, 'You can never block the route completely');
  assert.equal(t2.marks().length, 1);

  // Jumping to part 2 builds the part 1 layout, and only the lesson it lands on gets DEB's line.
  const third = trainingSession(4);
  const says = [];
  third.on('say', (m) => says.push(m.text));
  const t3 = createTutorial(third);
  assert.deepEqual(t3.autoplay(PART_TWO), []);
  assert.equal(t3.index, PART_TWO);
  const quips = new Set(STEPS.map((st) => st.quip));
  assert.deepEqual(says.filter((t) => quips.has(t)), [STEPS[PART_TWO].quip]);
  assert.ok(levelOf(third.state.grid[13 * third.state.w + 9]) >= 4, 'the upgraded sprinklers are in place');

  // The panel's jump keeps refusals off the screen; the "you cannot block the route" lesson
  // still counts its refusal.
  const fourth = trainingSession(4);
  const t4 = createTutorial(fourth);
  const emit = fourth.emit;
  fourth.emit = (type, msg) => { if (type !== 'nope' && type !== 'say') emit.call(fourth, type, msg); };
  assert.deepEqual(t4.autoplay(PART_TWO), []);
});

test('every building has a plain explanation', () => {
  for (const k of Object.keys(BUILD)) {
    assert.ok(HOW[k], `help for ${k}`);
    assert.ok(HOW[k].does.length > 20 && HOW[k].use.length > 20, `help for ${k} says what it does and how to use it`);
  }
  // Every building is taught by some tutorial step.
  const taught = new Set(STEPS.map((s) => s.tool).filter(Boolean));
  for (const k of Object.keys(BUILD)) {
    const inText = STEPS.some((s) => s.text.join(' ').includes(BUILD[k].name.split(' ')[0]));
    assert.ok(taught.has(k) || inText, `the tutorial covers ${k}`);
  }
});

test('the training floor is marked, and every machine the lessons ask for is on its own patch', () => {
  const session = trainingSession();
  const s = session.state;
  assert.ok(s.zones.length > 0, 'the training map has marked floor');
  const tut = createTutorial(session);
  tut.autoplay();
  let machines = 0;
  for (let i = 0; i < s.grid.length; i++) {
    const b = s.grid[i];
    if (!b || !BUILD[b.k].zone) continue;
    machines++;
    assert.equal(s.zones[i], BUILD[b.k].zone, `the ${b.k} is on its own floor`);
  }
  assert.ok(machines >= 4, 'unpacker, press, packer and chute were all built');
  // Trying a machine anywhere else is refused with a reason DEB has a line for.
  assert.equal(session.send({ c: 'place', k: 'press', x: 3, y: 3, d: 0 }).why, 'zone');
  assert.ok(nopeLine('zone', 'Dave').length > 10);
});

test('on a touch screen no lesson or help text mentions a key or the mouse', async () => {
  const { forTouch } = await import('../src/content/touch.js');
  const help = await import('../src/content/help.js');
  const texts = [];
  for (const st of STEPS) texts.push(...st.text);
  for (const v of Object.values(help.HOW)) texts.push(v.does, v.use);
  for (const v of [help.HOW_REMOVE, help.HOW_UPGRADE, help.HOW_REBUILD]) texts.push(v.does, v.use);
  // The live hints too, at the moments a player is most likely to see them.
  const session = trainingSession();
  const tut = createTutorial(session);
  tut.start();
  for (let n = 0; n < STEPS.length - 1; n++) {
    session.send({ c: 'place', k: 'crate', x: 10, y: 2 + n, d: 0 }); // something in the way
    session.send({ c: 'place', k: 'belt', x: 10, y: 2 + n, d: 0 });
    if (tut.hint()) texts.push(tut.hint());
    for (const m of tut.marks()) if (m.label) texts.push(m.label);
    tut.skip();
  }
  const keys = /\bpress(ing)? (the mouse|[0-9RUBFH]\b)|right-click|\bEsc\b|\bmouse\b|W, A, S|\bclick/i;
  let changed = 0;
  for (const t of texts) {
    const out = forTouch(t);
    if (out !== t) changed++;
    assert.ok(!keys.test(out), `still keyboard or mouse wording after forTouch: "${out}"`);
  }
  assert.ok(changed >= 15, `forTouch changed ${changed} texts`);
  // And it leaves desktop wording alone when there is nothing to change.
  assert.equal(forTouch('A Wet Floor Sign halves the speed of shoppers.'), 'A Wet Floor Sign halves the speed of shoppers.');
});
