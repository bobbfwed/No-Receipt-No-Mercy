// Plays the whole training shift automatically and checks that every step can be completed and
// that each lesson shows what it claims to show. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { HostSession } from '../src/net/session.js';
import { createDirector } from '../src/content/director.js';
import { createTutorial, STEPS, PART_TWO } from '../src/tutorial/lessons.js';
import { HOW } from '../src/content/help.js';
import { createGame, applyCommand, step, queueTrainingWave, statsOf, BUILD, SHOP_KINDS, SHOPPERS, TUNE, TICK_HZ } from '../src/sim/index.js';

function trainingSession(seed = 9) {
  return new HostSession({ name: 'Dave', director: createDirector(() => 0.5), state: createGame({ seed, training: true }) });
}

const title = (t) => { const st = STEPS.find((x) => x.title === t); assert.ok(st, `there is a lesson called "${t}"`); return t; };
const SALES = title('Hold them up: the TV Salesman'), SUPERS_LESSON = title('Super shoppers');
const DADS = title('Dads'), STOP_DADS = title('Stopping dads: the Forklift Turret'), LASER = title('Aim down the line: the Barcode Laser');
const GYM = title('Gym Bros'), WET = title('Slow them down: the Wet Floor Sign');
/** The only kinds of shopper the training shift sends in (0.3.03, the owner's request). */
const SHIFT_KINDS = ['clipper', 'dad', 'gymbro'];

/**
 * What happened on the floor during one lesson's wave, watched tick by tick: the things each
 * lesson says the player will see.
 */
function newWatch() {
  return {
    shots: new Map(), // tile index of a tower -> shots it fired
    smashes: [], // smash events
    beams: [], // shoppers hit by each Barcode Laser beam, in order
    watching: [], // where shoppers stood to watch the TV Salesman, as [x, y]
    escapes: [], // escape events: who reached a till (kind, and 1 if super)
    kinds: new Set(), // kinds of shopper that walked in
    dadThrough: false, // a dad was seen inside a building that blocks everyone else (0.4)
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
      if (e.e === 'rail') w.beams.push(e.n);
      if (e.e === 'watching') w.watching.push([e.x, e.y]);
      if (e.e === 'escape') w.escapes.push(e);
    }
  });
  tut.start();
  while (tut.index < tut.total - 1) {
    const st = tut.step;
    onStep(tut, st);
    w = newWatch();
    for (const cmd of st.solve(session.state)) session.send(cmd);
    if (!st.manual) {
      let sent = false;
      for (let n = 0; n < 240 * 15 && !tut.check(); n++) {
        sent = tut.finish(sent);
        session.fastForward(1);
        watchTick(session.state, w);
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

/** What the lessons from the TV Salesman on say happens. The same for every seed. */
function checkLessons(s, waves, seen, label) {
  // The TV Salesman: some Coupon Clippers stopped to watch, standing in the Sprinkler above him.
  assert.ok(seen[SALES].facts.watched >= 1, `${label}: Coupon Clippers stopped to watch the salesman`);
  const reach = statsOf(s.grid[tileOf(s, 5, 12)]).range;
  assert.ok(seen[SALES].watching.some(([x, y]) => (x - 5.5) ** 2 + (y - 12.5) ** 2 <= reach ** 2),
    `${label}: a shopper watched him from inside the Sprinkler's reach`);
  assert.deepEqual(waves[SALES], { stopped: 30, escaped: 0 }, `${label}: the whole coach party stopped`);

  // Super shoppers: a third sprinkler, by the samples, stops the Extreme Couponers.
  assert.deepEqual(waves[SUPERS_LESSON], { stopped: 8, escaped: 0 }, `${label}: three sprinklers stop eight super shoppers`);

  // The Barcode Laser, down column 6: the first one in sets it off alone, the next beam takes most
  // of the queue, and the whole crowd is stopped.
  const beams = seen[LASER].beams;
  assert.equal(beams[0], 1, `${label}: the first beam hits the first shopper alone (${beams})`);
  assert.ok(Math.max(...beams) >= 15, `${label}: a later beam hits most of the queue (${beams})`);
  assert.equal(seen[LASER].facts.beam, Math.max(...beams));
  assert.deepEqual(waves[LASER], { stopped: 30, escaped: 0 }, `${label}: all thirty Extreme Couponers stopped`);
  assert.equal(s.grid[tileOf(s, 6, 4)].k, 'railgun');
  assert.equal(s.grid[tileOf(s, 6, 4)].d, 1, `${label}: the laser faces down`);

  // Dads (0.4): they walk straight through the maze, so most of the eight reach a till, the three
  // Dads on a Mission at the back among them.
  assert.equal(waves[DADS].stopped + waves[DADS].escaped, 8, `${label}: eight dads came in`);
  assert.ok(seen[DADS].dadThrough, `${label}: a dad walked through a building`);
  assert.ok(seen[DADS].escapes.length > 4, `${label}: most of the dads got a refund`);
  for (const e of seen[DADS].escapes) assert.equal(e.k, 'dad');
  assert.equal(seen[DADS].escapes.filter((e) => e.sup).length, 3, `${label}: the Dads on a Mission all got through`);
  // The forklift gets one of the two Dads on a Mission (without it both get through: see the seeds).
  assert.deepEqual(waves[STOP_DADS], { stopped: 1, escaped: 1 }, `${label}: the forklift gets one of the two Dads on a Mission`);

  // Gym bro: he walked through a crate by the entrance, and Rebuild put everything back.
  const doorCrates = [[2, 7], [2, 8], [1, 9]].map(([x, y]) => tileOf(s, x, y));
  assert.ok(seen[GYM].smashes.some((e) => e.k === 'crate' && doorCrates.includes(e.i)), `${label}: the gym bro went through the crates by the entrance`);
  for (const e of seen[GYM].smashes) if (e.left > 0) assert.ok(s.grid[e.i], `${label}: a building with hits left is still standing`);
  assert.ok(seen[GYM].facts.rebuilt >= 1, `${label}: Rebuild put things back`);
  for (const i of doorCrates) assert.equal(s.grid[i].k, 'crate', `${label}: the crates are back`);

  // Nobody but the three kinds came in, all shift long.
  const kinds = new Set(Object.values(seen).flatMap((x) => [...x.kinds]));
  for (const k of kinds) assert.ok(SHIFT_KINDS.includes(k), `${label}: a ${k} walked in`);

  // The gap cluster stays as part 1 left it, for the practice at the end.
  for (const [x, y] of [[7, 13], [9, 13], [10, 13]]) assert.equal(s.grid[tileOf(s, x, y)]?.k, 'sprinkler', `${label}: the sprinklers at the gap are still there`);
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
      if (st.tool) assert.ok(t.tool() in BUILD || t.tool() === 'rebuild', `step "${st.title}" points at a real button`);
    },
    onDone: (t, st) => {
      assert.equal(t.check(), true, `step ${t.index} "${st.title}" completes`);
      if (st.marks) assert.equal(t.marks().length, 0, `step "${st.title}" clears its highlights`);
    },
  });
  assert.equal(tut.step.last, true);
  assert.equal(STEPS[PART_TWO].title, 'Part 2: The difficult customers');
  assert.ok(STEPS.length <= 23, `the shift is no longer than it was (${STEPS.length} lessons)`);
  // The Gym Bro lesson points at Rebuild once there is something to rebuild.
  assert.ok(seen[GYM].facts.smashedCrate >= 1);
  checkLessons(session.state, waves, seen, 'seed 9');
  assert.equal(reports.length, 0, 'no performance reviews interrupt training');
  assert.ok(says.length >= STEPS.length, 'DEB speaks at every step');

  // What each wave lesson is meant to demonstrate.
  assert.deepEqual(waves['Security: the Pepper Sprinkler'], { stopped: 3, escaped: 0 }, 'one sprinkler stops three Coupon Clippers');
  assert.deepEqual(waves[WET], { stopped: 10, escaped: 0 }, 'sign plus two sprinklers stops ten Coupon Clippers');
  assert.deepEqual(waves['Make them stop: Free Samples'], { stopped: 16, escaped: 0 }, 'the gap holds against a crowd');
  assert.ok(session.state.players[0].cash >= 1000, 'money is never the obstacle in training');
});

test('the wave lessons play out the same whatever the random seed', () => {
  const SEEDS = [1, 2, 3, 7, 11, 42, 99, 1234];
  for (const seed of SEEDS) {
    const session = trainingSession(seed);
    const tut = createTutorial(session);
    const { waves, seen } = playAll(session, tut, {
      onStep: (t, st) => {
        // What each lesson says its new building is needed for: without it, some get through.
        // "Ten Coupon Clippers in a bunch are more than one Sprinkler can wear down."
        if (st.title === WET) assert.ok(whatIf(session.state, [], st.wave).length > 0, `seed ${seed}: one sprinkler lets some of the ten through`);
        // "A crowd this big swamps your gap."
        if (st.title === SALES) assert.ok(whatIf(session.state, [], st.wave).length > 0, `seed ${seed}: the gap alone lets some of the coach party through`);
        // "As they are, your two Sprinklers at the gap cannot stop the eight Extreme Couponers."
        if (st.title === SUPERS_LESSON) assert.ok(whatIf(session.state, [], st.wave).length > 0, `seed ${seed}: without the third sprinkler some Extreme Couponers get through`);
        // "Without it, your gap cannot take 30 of them."
        if (st.title === LASER) assert.ok(whatIf(session.state, [], st.wave).length > 0, `seed ${seed}: without the laser some Extreme Couponers get through`);
        // "Without it both of them walk out with a refund."
        if (st.title === STOP_DADS) assert.equal(whatIf(session.state, [], st.wave).length, 2, `seed ${seed}: without the forklift both Dads on a Mission get through`);
      },
      onDone: (t, st) => assert.equal(t.check(), true, `seed ${seed}: step "${st.title}" completes`),
    });
    assert.deepEqual(waves['Security: the Pepper Sprinkler'], { stopped: 3, escaped: 0 }, `seed ${seed}: clippers`);
    assert.deepEqual(waves[WET], { stopped: 10, escaped: 0 }, `seed ${seed}: ten clippers at the sign`);
    assert.equal(waves['Make them stop: Free Samples'].escaped, 0, `seed ${seed}: crowd`);
    checkLessons(session.state, waves, seen, `seed ${seed}`);
  }
});

test('opening the doors too early lines the same shoppers up again', () => {
  const session = trainingSession(5);
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === STOP_DADS));
  assert.equal(tut.step.title, STOP_DADS);
  session.send({ c: 'start' }); // before building the forklift
  for (let n = 0; n < 240 && !tut.facts.waveEnds; n++) session.fastForward(15);
  assert.equal(tut.facts.waveEnds, 1);
  assert.equal(tut.check(), false, 'not done: the forklift is not there');
  assert.ok(session.state.nextWave, 'two more Dads on a Mission are waiting');
  session.send({ c: 'place', k: 'forklift', x: 8, y: 9, d: 0 });
  assert.equal(tut.check(), true, 'built now, after seeing a wave: done');
  // A lesson without shoppers leaves nobody waiting outside.
  tut.back();
  assert.equal(tut.step.title, DADS);
  assert.ok(session.state.nextWave);
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
  assert.deepEqual(t2.autoplay(1), []);
  assert.equal(t2.step.title, 'Build the maze: Crate Stacks');
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
  assert.equal(third.state.grid[13 * third.state.w + 7].k, 'sprinkler', 'the third sprinkler, by the samples, is in place');
  assert.equal(third.state.grid[13 * third.state.w + 4].k, 'salesman', 'and the TV Salesman');
  assert.equal(third.state.grid[4 * third.state.w + 6].k, 'railgun', 'and the Barcode Laser, which part 1 ends with');

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

test('every building has a plain explanation', () => {
  for (const k of SHOP_KINDS) {
    assert.ok(HOW[k], `help for ${k}`);
    assert.ok(HOW[k].does.length > 20 && HOW[k].use.length > 20, `help for ${k} says what it does and how to use it`);
  }
});

test('the player places every building at least once, and uses Rebuild and Remove (0.3.03; the Upgrade tool went in 0.4)', () => {
  // Played through, gathering what each lesson's marks ask for at the start and as it goes.
  const session = trainingSession();
  const tut = createTutorial(session);
  const asked = new Map(); // kind of building -> titles of the lessons whose marks ask for it
  const tools = { rebuild: new Set(), remove: new Set() };
  const look = () => {
    const st = tut.step;
    for (const m of tut.marks()) {
      if (m.fix === 'rebuild') tools.rebuild.add(st.title);
      if (!m.k) continue;
      if (!asked.has(m.k)) asked.set(m.k, new Set());
      asked.get(m.k).add(st.title);
      // A mark on a tile that holds something else asks for that to be removed first.
      const g = session.state.grid[m.y * session.state.w + m.x];
      if (g && g.k !== m.k && g.part === undefined) tools.remove.add(st.title);
    }
  };
  playAll(session, tut, {
    onStep: () => look(),
    onDone: () => {},
  });
  // (playAll does not look between ticks; the Gym Bro lesson's wrecks show after its wave, so
  // play that lesson once more by hand to see its Rebuild marks.)
  const again = trainingSession();
  const t2 = createTutorial(again);
  t2.autoplay(STEPS.findIndex((st) => st.title === GYM));
  for (const cmd of t2.step.solve(again.state)) again.send(cmd);
  for (let n = 0; n < 240 && !t2.facts.waveEnds; n++) again.fastForward(15);
  assert.ok(t2.marks().some((m) => m.fix === 'rebuild'), 'the Gym Bro lesson marks the wrecks for Rebuild');
  tools.rebuild.add(GYM);

  const buildable = SHOP_KINDS;
  assert.equal(buildable.length, 7, 'every building on the shop floor (a new one needs a lesson)');
  for (const k of buildable) {
    assert.ok(asked.has(k), `some lesson's marks ask the player to place a ${BUILD[k].name}`);
    // ...and that lesson's own commands place it (the player does it, not the shift).
    const placed = [...asked.get(k)].some((t) => STEPS.find((st) => st.title === t).solve(createGame({ training: true })).some((c) => c.c === 'place' && c.k === k));
    assert.ok(placed, `a lesson that asks for a ${BUILD[k].name} has the player place it`);
  }
  assert.ok(tools.remove.size >= 1, 'a lesson has the player remove something');
  assert.ok(STEPS.some((st) => st.after && st.after(createGame({ training: true })).some((c) => c.c === 'rebuild')), 'a lesson waits for Rebuild');
  assert.ok(STEPS.some((st) => st.solve(createGame({ training: true })).some((c) => c.c === 'remove')), 'a lesson removes something');
  assert.ok(!STEPS.some((st) => st.solve(createGame({ training: true })).some((c) => c.c === 'upgrade')), 'no lesson buys an upgrade');
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
  assert.ok(ownWords >= 10, 'the lessons that place buildings have touch wording of their own');
  for (const v of Object.values(help.HOW)) texts.push(v.does, v.use);
  // (The Back's parts, 0.4, on their own build bar.)
  for (const v of Object.values(help.BACK_HOW)) texts.push(v.does, v.use);
  for (const v of [help.HOW_REMOVE, help.HOW_REBUILD, help.HOW_WIRE, help.HOW_REINFORCE]) texts.push(v.does, v.use);
  // The live hints too, at the moments a player is most likely to see them.
  const session = trainingSession();
  const tut = createTutorial(session);
  tut.start();
  for (let n = 0; n < STEPS.length - 1; n++) {
    session.send({ c: 'place', k: 'wetfloor', x: 10, y: 2 + n, d: 0 }); // something in the way
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
  }
});
