// Plays the whole training shift automatically and checks that every step can be completed and
// that each lesson shows what it claims to show. Run with: node --test
import test from 'node:test';
import { nopeLine } from '../src/content/lines.js';
import assert from 'node:assert/strict';
import { HostSession } from '../src/net/session.js';
import { createDirector } from '../src/content/director.js';
import { createTutorial, STEPS } from '../src/tutorial/lessons.js';
import { HOW } from '../src/content/help.js';
import { createGame, applyCommand, step, queueTrainingWave, BUILD, TUNE, TICK_HZ } from '../src/sim/index.js';

function trainingSession(seed = 9) {
  return new HostSession({ name: 'Dave', director: createDirector(() => 0.5), state: createGame({ seed, training: true, zones: true }) });
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
  tut.start();
  const waves = {};
  while (tut.index < tut.total - 1) {
    const st = tut.step;
    assert.ok(st.title && st.text.length && st.quip, `step ${tut.index} has a title, text and a line from DEB`);
    if (!st.manual) assert.equal(tut.check(), false, `step ${tut.index} "${st.title}" is not done before the player acts`);
    if (st.marks && !st.manual) assert.ok(tut.marks().length > 0, `step "${st.title}" highlights something`);
    for (const cmd of st.solve(session.state)) session.send(cmd);
    if (!st.manual) {
      for (let n = 0; n < 240 && !tut.check(); n++) session.fastForward(15);
      assert.equal(tut.check(), true, `step ${tut.index} "${st.title}" completes`);
      if (st.marks) assert.equal(tut.marks().length, 0, `step "${st.title}" clears its highlights`);
      if (st.wave) waves[st.title] = tut.lastWave;
    }
    tut.next();
  }
  assert.equal(tut.step.last, true);
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
  for (const seed of [1, 2, 3, 7, 11, 42, 99, 1234]) {
    const session = trainingSession(seed);
    const tut = createTutorial(session);
    tut.start();
    const waves = {};
    while (tut.index < tut.total - 1) {
      const st = tut.step;
      for (const cmd of st.solve(session.state)) session.send(cmd);
      if (!st.manual) {
        for (let n = 0; n < 240 && !tut.check(); n++) session.fastForward(15);
        if (st.wave) waves[st.title] = tut.lastWave;
      }
      tut.next();
    }
    assert.deepEqual(waves['Security: the Pepper Sprinkler'], { stopped: 3, escaped: 0 }, `seed ${seed}: clippers`);
    assert.deepEqual(waves['Slow them down: the Wet Floor Sign'], { stopped: 4, escaped: 0 }, `seed ${seed}: hunters`);
    assert.equal(waves['Make them stop: Free Samples'].escaped, 0, `seed ${seed}: crowd`);
    assert.deepEqual(waves.Dads, { stopped: 0, escaped: 4 }, `seed ${seed}: dads walk through`);
    assert.ok(waves['Stopping dads'].stopped >= 3, `seed ${seed}: dads stopped ${waves['Stopping dads'].stopped} of 5`);
    assert.deepEqual(waves['Upgrades, and super shoppers'], { stopped: 3, escaped: 0 }, `seed ${seed}: supers`);
  }
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
