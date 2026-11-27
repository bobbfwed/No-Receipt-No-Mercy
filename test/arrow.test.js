// The training shift's arrow (0.3.03): where it stands beside its target (src/ui/pointer.js), and
// what it points at in every lesson, in every state a lesson goes through (src/tutorial/target.js).
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeArrow, edgeArrow, boxOf, inside, ARROW, ARROW_SMALL, CONTROL_SPOTS } from '../src/ui/pointer.js';
import { arrowTarget, targetKey, CONTROLS } from '../src/tutorial/target.js';
import { createTutorial, STEPS } from '../src/tutorial/lessons.js';
import { HostSession } from '../src/net/session.js';
import { createDirector } from '../src/content/director.js';
import { createGame, BUILD } from '../src/sim/index.js';

const SCREEN = { x: 0, y: 0, w: 1280, h: 720 };
const within = (box, b) => box.x >= b.x - 0.01 && box.y >= b.y - 0.01 && box.x + box.w <= b.x + b.w + 0.01 && box.y + box.h <= b.y + b.h + 0.01;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---- Placement --------------------------------------------------------------------------------

test('the arrow stands above a bar button at the bottom and points down at its centre', () => {
  const btn = { x: 600, y: 650, w: 60, h: 56 };
  const a = placeArrow(btn, SCREEN, [], ['above', 'left', 'right', 'below']);
  assert.equal(a.dir, 'down');
  assert.equal(a.x, 630);
  assert.ok(a.y < btn.y && a.y >= btn.y - ARROW.gap - 0.01, 'the tip is just above the button');
  assert.ok(!overlaps(a.box, btn), 'it does not cover the button');
  assert.ok(within(a.box, SCREEN));
  assert.equal(a.fits, true);
});

test('below a top-bar button, pointing up', () => {
  const doors = { x: 500, y: 6, w: 160, h: 40 };
  const a = placeArrow(doors, SCREEN, [], ['below', 'left', 'right', 'above']);
  assert.equal(a.dir, 'up');
  assert.ok(a.y > doors.y + doors.h && !overlaps(a.box, doors));
});

test('above a floor tile, unless the tile is near the top of the floor', () => {
  const floor = { x: 0, y: 60, w: 1280, h: 560 };
  const mid = { x: 400, y: 300, w: 30, h: 30 };
  assert.equal(placeArrow(mid, floor).side, 'above');
  const high = { x: 400, y: 70, w: 30, h: 30 };
  const a = placeArrow(high, floor);
  assert.equal(a.side, 'below', 'no room above: it goes underneath, pointing up');
  assert.equal(a.dir, 'up');
  assert.ok(within(a.box, floor));
});

test('it never covers the lesson panel: it moves to another side', () => {
  const floor = { x: 0, y: 0, w: 1280, h: 720 };
  const panel = { x: 0, y: 0, w: 380, h: 300 };
  const tile = { x: 200, y: 330, w: 30, h: 30 }; // right under the panel
  const a = placeArrow(tile, floor, [panel]);
  assert.ok(!overlaps(a.box, panel), `side ${a.side}`);
  assert.notEqual(a.side, 'above');
  assert.equal(a.fits, true);
});

test('near the side of the screen it slides along the target, the tip still on it', () => {
  const btn = { x: 2, y: 650, w: 30, h: 56 }; // narrower than the arrow, at the left edge
  const a = placeArrow(btn, SCREEN, [], ['above']);
  assert.ok(a.box.x >= 0, 'not off the left edge');
  assert.ok(a.x >= btn.x && a.x <= btn.x + btn.w, 'the tip is over the button');
});

test('with no good side it still stays on screen', () => {
  const tiny = { x: 0, y: 0, w: 60, h: 60 };
  const a = placeArrow({ x: 10, y: 10, w: 40, h: 40 }, tiny, [], undefined, ARROW_SMALL);
  assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
  assert.equal(a.fits, false);
});

test('a tile off the floor: the arrow sits at the nearest edge and points out toward it', () => {
  const floor = { x: 0, y: 60, w: 390, h: 500 };
  const right = edgeArrow({ x: 900, y: 300 }, floor);
  assert.equal(right.dir, 'right');
  assert.ok(right.x <= floor.x + floor.w && right.x > floor.x + floor.w - 10, 'at the right edge');
  assert.equal(right.y, 300);
  assert.ok(within(right.box, floor));
  const up = edgeArrow({ x: 100, y: -400 }, floor);
  assert.equal(up.dir, 'up');
  assert.ok(within(up.box, floor));
  // Far off a corner: still on the floor, pointing along the way out.
  const corner = edgeArrow({ x: -5000, y: 5000 }, floor, ARROW_SMALL);
  assert.ok(within(corner.box, floor));
  assert.equal(inside({ x: corner.x, y: corner.y }, floor), true);
});

test('a bar button scrolled out of a phone bar: the arrow at the bar\'s edge, pointing sideways', () => {
  const bar = { x: 0, y: 760, w: 390, h: 70 };
  const a = edgeArrow({ x: 620, y: 795 }, bar, ARROW_SMALL);
  assert.equal(a.dir, 'right');
  assert.ok(a.x > 380 && a.x <= 390);
  assert.ok(a.box.x >= 0 && a.box.x + a.box.w <= 390);
});

test('the arrow\'s box includes its bounce, on the far side from the tip', () => {
  const b = boxOf(100, 100, 'down', ARROW);
  assert.equal(b.y + b.h, 100);
  assert.equal(b.h, ARROW.len + ARROW.bounce);
});

test('every named control has a place on screen', () => {
  for (const name of CONTROLS) assert.ok(CONTROL_SPOTS[name]?.sel, `pointer.js knows where "${name}" is`);
});


// ---- What it points at -------------------------------------------------------------------------

function trainingSession(seed = 9) {
  return new HostSession({ name: 'Dave', director: createDirector(() => 0.5), state: createGame({ seed, training: true }) });
}
const TOOLS = new Set(['rebuild', 'remove', 'wire', 'reinforce']);

/** A target the screen can show: a known kind, a real button, a tile on the map, a named control. */
function valid(t, s, label) {
  assert.ok(t && typeof t.kind === 'string', `${label}: has a kind`);
  const tile = (p) => assert.ok(p.x >= 0 && p.y >= 0 && p.x < s.w && p.y < s.h, `${label}: tile ${p.x},${p.y} is on the map`);
  switch (t.kind) {
    case 'none': assert.ok(['watch', 'wait', 'advancing'].includes(t.why), `${label}: says why there is nothing`); break;
    case 'button': assert.ok(BUILD[t.k] || TOOLS.has(t.k), `${label}: button ${t.k}`); break;
    case 'drag': assert.ok(BUILD[t.k], `${label}: drags a building`); tile(t); break;
    case 'tile': tile(t); break;
    case 'swipe': tile(t.from); tile(t.to); break;
    case 'control': assert.ok(CONTROLS.includes(t.name), `${label}: control ${t.name}`); break;
    default: assert.fail(`${label}: unknown kind ${t.kind}`);
  }
  assert.notEqual(targetKey(t), t.kind === 'none' ? 'x' : 'none');
}

test('every lesson has something to point at, in every state it goes through, on both floors', () => {
  const session = trainingSession();
  const s = () => session.state;
  const tut = createTutorial(session);
  const seen = {}; // lesson title -> the targets it went through, desktop and touch
  const ui = (o = {}) => ({ floor: tut.floor, ...o });
  const look = (o, label) => {
    const t = arrowTarget(tut.step, s(), tut.marks(), ui(o));
    valid(t, s(), `${tut.step.title} (${label})`);
    return t;
  };
  tut.start();
  while (true) {
    const st = tut.step;
    const desk = [], touch = [];
    const both = (o = {}) => {
      desk.push(targetKey(look({ ...o, touch: false }, 'desktop')));
      touch.push(targetKey(look({ ...o, touch: true }, 'touch')));
    };
    // At the start, nothing held: there is always something to press (a button, a tile, the doors,
    // Next, the floor switch).
    const first = [arrowTarget(st, s(), tut.marks(), ui()), arrowTarget(st, s(), tut.marks(), ui({ touch: true }))];
    for (const t of first) assert.notEqual(t.kind, 'none', `"${st.title}" points at something when it starts`);
    both();
    if (st.manual) {
      seen[st.title] = { desk, touch };
      if (st.last) break;
      tut.next();
      continue;
    }
    for (const cmd of st.solve(s())) {
      if (cmd.c === 'start') {
        assert.deepEqual(arrowTarget(st, s(), tut.marks(), ui()), { kind: 'control', name: 'doors' }, `"${st.title}": the doors once it is built`);
        both();
      }
      // Before each command: holding what the first mark on this floor wants points somewhere.
      const m = tut.marks().find((mk) => (mk.f | 0) === tut.floor);
      if (m && m.k && !m.fix && m.wd === undefined && m.r === undefined && !m.del) {
        const held = arrowTarget(st, s(), tut.marks(), ui({ tool: m.k }));
        assert.ok(['tile', 'swipe', 'button'].includes(held.kind), `"${st.title}": holding the ${m.k} points somewhere`);
        both({ tool: m.k });
      }
      tut.act(cmd);
      both();
      if (cmd.c === 'start' && s().phase === 'wave' && !tut.marks().length) {
        assert.equal(arrowTarget(st, s(), tut.marks(), ui()).kind, 'none', `"${st.title}": nothing to press while the wave is on`);
      }
    }
    let sent = false;
    for (let n = 0; n < 400 && !tut.check(); n++) {
      sent = tut.finish(sent);
      session.fastForward(15);
      both();
    }
    assert.equal(tut.check(), true, `"${st.title}" completes`);
    seen[st.title] = { desk: [...new Set(desk)], touch: [...new Set(touch)] };
    tut.next();
  }
  // A few lessons in full, so a change to them is seen.
  assert.deepEqual(seen['Welcome to the Returns Department'].desk, ['control:next']);
  assert.deepEqual(seen['Training complete'].desk, ['control:play']);
  // The Sprinkler goes where a crate of the wall stands: that crate first (its card removes it).
  assert.deepEqual(seen['Security: the Pepper Sprinkler'].desk.slice(0, 3), ['tile:10,13', 'button:sprinkler', 'control:doors']);
  assert.ok(seen['Build the maze: Crate Stacks'].desk.includes('swipe:10,1:10,13'), 'the wall is a drag along the tiles');
  assert.ok(seen['Build the maze: Crate Stacks'].touch.includes('drag:crate:10,1'), 'a phone places them one at a time');
  assert.ok(seen['Gym Bros'].desk.includes('button:rebuild'), 'the Rebuild button after the gym bro');
  // The Back (0.4): the floor switch first; then the parts; a line of belts is one drag.
  assert.equal(seen['Downstairs: The Back'].desk[0], 'control:floor');
  assert.ok(seen['Junk into a Spite Still'].desk.includes('button:still'));
  assert.ok(seen['Spite up the Dumbwaiter'].desk.includes('swipe:10,5:10,13'), 'the line is one drag, into the Dumbwaiter');
  assert.ok(seen['Spite up the Dumbwaiter'].touch.includes('swipe:10,5:10,13'), 'a finger lays a line of belts by dragging too');
  assert.ok(seen['Spite up the Dumbwaiter'].desk.includes('control:floor'), 'then back up');
  assert.ok(seen['An Unpaid Intern'].desk.includes('control:floor'), 'down again first');
  assert.ok(seen['Share a line: the Splitter'].desk.includes('tile:10,12'), 'the belt to take out');
  assert.ok(seen['Share a line: the Splitter'].touch.includes('button:remove'), 'a finger takes it out with the Remove tool');
  assert.ok(seen['Running dry'].desk.includes('control:doors'));
  assert.ok(seen['Razor Wire: pick a direction'].desk.includes('button:wire'));
  assert.ok(seen['Reinforce the crates'].desk.includes('button:reinforce'));
  assert.ok(seen['Money, and MORE JUNK'].desk.includes('control:floor'));
  // The two big buildings (0.3.03): the button, their top-left tile. A finger drags the Salesman,
  // and taps the Laser's button first so it can be turned to face down before it is placed.
  const laser = seen['Aim down the line: the Barcode Laser'];
  assert.deepEqual(laser.desk.slice(0, 2), ['button:railgun', 'tile:6,4']);
  assert.deepEqual(laser.touch.slice(0, 2), ['button:railgun', 'tile:6,4']);
  const sales = seen['Hold them up: the TV Salesman'];
  assert.deepEqual(sales.desk.slice(0, 2), ['button:salesman', 'tile:4,13']);
  assert.deepEqual(sales.touch.slice(0, 2), ['drag:salesman:4,13', 'tile:4,13']);
});

test('a lesson with two buildings to place goes on to the second once the first is down', () => {
  const check = (title, first, then) => {
    const session = trainingSession();
    const tut = createTutorial(session);
    tut.autoplay(STEPS.findIndex((st) => st.title === title));
    for (const cmd of first) assert.ok(session.send(cmd).ok);
    const at = (ui) => arrowTarget(tut.step, session.state, tut.marks(), ui);
    assert.deepEqual(at({}), { kind: 'button', k: then.k }, `${title}: the next button`);
    assert.deepEqual(at({ touch: true }), { kind: 'drag', ...then }, `${title}: the next drag`);
    assert.equal(tut.tool(), then.k, `${title}: the panel lights up the next button`);
  };
  check('Hold them up: the TV Salesman', [{ c: 'place', k: 'salesman', x: 4, y: 13, d: 0 }], { k: 'sprinkler', x: 5, y: 12 });
  check('Slow them down: the Wet Floor Sign', [{ c: 'place', k: 'wetfloor', x: 10, y: 14, d: 0 }], { k: 'sprinkler', x: 9, y: 13 });
  check('Aim down the line: the Barcode Laser', [{ c: 'place', k: 'railgun', x: 6, y: 4, d: 1 }], { k: 'sprinkler', x: 7, y: 13 });
});

test('several tiles: the one the held tool is for, else the first not yet done', () => {
  const session = trainingSession();
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === 'Slow them down: the Wet Floor Sign'));
  const st = tut.step, s = session.state;
  const at = (ui) => arrowTarget(st, s, tut.marks(), ui);
  assert.deepEqual(at({}), { kind: 'button', k: 'wetfloor' });
  assert.deepEqual(at({ tool: 'sprinkler' }), { kind: 'tile', x: 9, y: 13 }, 'holding a Sprinkler: the Sprinkler\'s tile');
  assert.deepEqual(at({ touch: true }), { kind: 'drag', k: 'wetfloor', x: 10, y: 14 });
  session.send({ c: 'place', k: 'wetfloor', x: 10, y: 14, d: 0 });
  assert.deepEqual(at({ tool: 'wetfloor' }), { kind: 'button', k: 'sprinkler' }, 'the sign is down: on to the Sprinkler');
});

test('an edge arrow slides along the edge, clear of DEB and the panel, when it can', () => {
  const floor = { x: 0, y: 0, w: 1000, h: 600 };
  const deb = { x: 600, y: 480, w: 400, h: 120 };
  const a = edgeArrow({ x: 950, y: 2000 }, floor, ARROW, [deb]);
  assert.equal(a.dir, 'down');
  assert.ok(!overlaps(a.box, deb), `slid clear (x ${a.x})`);
  assert.ok(a.x < 600 && a.x > 500, 'as close to the target\'s side as it can');
  assert.equal(a.fits, true);
});

test('a building facing the wrong way: the words and the arrow agree on the one thing to do next', async () => {
  // (Until 0.4 this was the Unpacker; the Barcode Laser is now the only shop building that turns.)
  const { forTouch } = await import('../src/content/touch.js');
  const session = trainingSession();
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === 'Aim down the line: the Barcode Laser'));
  const st = tut.step, s = session.state;
  // Three tiles down column 6, the top one saying what it wants; then the Sprinkler by the samples.
  assert.deepEqual(tut.marks().map((m) => [m.x, m.y]), [[6, 4], [6, 5], [6, 6], [7, 13]]);
  assert.deepEqual({ k: tut.marks()[0].k, d: tut.marks()[0].d }, { k: 'railgun', d: 1 });
  assert.ok(session.send({ c: 'place', k: 'railgun', x: 6, y: 4, d: 3 }).ok); // on the tiles, but pointing up
  const at = (ui) => arrowTarget(st, s, tut.marks(), ui);
  // A mouse still holding the Laser: click its button again to put it down (the words say so).
  assert.deepEqual(at({ tool: 'railgun' }), { kind: 'button', k: 'railgun' });
  assert.match(tut.hint(), /The Laser's arrow must point down\. Put down what you are holding \(Esc, or click its button again\), click the Laser, and click ⟳ Rotate on its card until the arrow points down\./);
  assert.deepEqual(at({}), { kind: 'tile', x: 6, y: 4 });
  assert.deepEqual(at({ selected: { x: 6, y: 4 } }), { kind: 'control', name: 'spin' });
  // A finger: DROP, the Laser, Rotate; and the words say exactly that, with no key in them.
  assert.deepEqual(at({ touch: true, tool: 'railgun' }), { kind: 'control', name: 'drop' });
  const touchHint = forTouch(tut.hint());
  assert.match(touchHint, /Tap DROP if you are holding something, tap the Laser, and tap ⟳ Rotate on its card/);
  assert.ok(!/\bEsc\b|click/i.test(touchHint), touchHint);
  // The touch lesson says it in that order: the button, the rotate button, then the tile.
  assert.match(st.touch[0], /^Do this: tap Laser in the bar, tap the rotate button at the end of the bar until its arrow points DOWN, then tap the top one of the three highlighted tiles\./);
  assert.ok(session.send({ c: 'rotate', x: 6, y: 4 }).ok);
  assert.deepEqual(tut.marks().map((m) => [m.x, m.y]), [[7, 13]], 'turned round: on to the Sprinkler');
});

test('the Barcode Laser: removed when it lies the wrong way or in the wrong place', async () => {
  const { forTouch } = await import('../src/content/touch.js');
  const session = trainingSession();
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === 'Aim down the line: the Barcode Laser'));
  const st = tut.step, s = session.state;
  const at = (ui) => arrowTarget(st, s, tut.marks(), ui);
  // Lying across the top tile (it cannot face right from there: a pillar is in the way): its card
  // removes it.
  assert.equal(session.send({ c: 'place', k: 'railgun', x: 6, y: 4, d: 0 }).ok, false, 'a pillar in the way');
  assert.ok(session.send({ c: 'place', k: 'railgun', x: 4, y: 4, d: 0 }).ok);
  assert.deepEqual(at({}), { kind: 'tile', x: 6, y: 4 });
  assert.deepEqual(at({ selected: { x: 4, y: 4 } }), { kind: 'control', name: 'remove' });
  assert.match(tut.hint(), /The Laser is not on the highlighted tiles\. Right-click it to remove it, press R until the arrow on the preview points down, and place it again/);
  assert.match(forTouch(tut.hint()), /Tap it and choose Remove, tap the rotate button at the end of the bar until its arrow points down, and place it again/);
  // One tile too high: its own top-left is (6, 3), and its card (opened there) removes it.
  session.send({ c: 'remove', x: 4, y: 4 });
  assert.ok(session.send({ c: 'place', k: 'railgun', x: 6, y: 3, d: 1 }).ok);
  assert.deepEqual(at({}), { kind: 'tile', x: 6, y: 4 });
  assert.deepEqual(at({ selected: { x: 6, y: 3 } }), { kind: 'control', name: 'remove' });
  // Something else on one of its other tiles: that is marked first, to be removed.
  session.send({ c: 'remove', x: 6, y: 3 });
  assert.ok(session.send({ c: 'place', k: 'crate', x: 6, y: 6, d: 0 }).ok);
  assert.deepEqual(tut.marks()[0], { x: 6, y: 6, label: 'Remove', k: 'railgun', d: 1 });
  assert.deepEqual(at({ selected: { x: 6, y: 6 } }), { kind: 'control', name: 'remove' });
  assert.match(tut.hint(), /Something else is on a highlighted tile/);
});

test('a wrong building on the tile: its sheet removes it, and a finger puts its tool down first', () => {
  // The Sprinkler lesson: a Crate Stack from the wall stands where the Sprinkler goes.
  const session = trainingSession();
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === 'Security: the Pepper Sprinkler'));
  const st = tut.step, s = session.state;
  const at = (ui) => arrowTarget(st, s, tut.marks(), ui);
  assert.equal(s.grid[13 * s.w + 10].k, 'crate');
  assert.deepEqual(at({}), { kind: 'tile', x: 10, y: 13 });
  assert.deepEqual(at({ selected: { x: 10, y: 13 } }), { kind: 'control', name: 'remove' });
  assert.deepEqual(at({ touch: true, tool: 'crate' }), { kind: 'control', name: 'drop' });
  assert.match(tut.hint(), /The Crate Stack is still there\. Right-click it to remove it, then place the Sprinkler\./);
  // Gone: on to the Sprinkler.
  assert.ok(session.send({ c: 'remove', x: 10, y: 13 }).ok);
  assert.deepEqual(at({ tool: 'sprinkler' }), { kind: 'tile', x: 10, y: 13 });
});

test('a wall of Crate Stacks is laid by one drag, carrying on from the first tile not yet done', () => {
  const session = trainingSession();
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === 'Build the maze: Crate Stacks'));
  const st = tut.step, s = session.state;
  const at = (ui) => arrowTarget(st, s, tut.marks(), ui);
  assert.deepEqual(at({ tool: 'crate' }), { kind: 'swipe', from: { x: 10, y: 1 }, to: { x: 10, y: 13 } });
  for (const y of [1, 2, 3]) session.send({ c: 'place', k: 'crate', x: 10, y });
  assert.deepEqual(at({}), { kind: 'button', k: 'crate' });
  assert.deepEqual(at({ tool: 'crate' }), { kind: 'swipe', from: { x: 10, y: 4 }, to: { x: 10, y: 13 } });
  // A finger places them one at a time: the next tile.
  assert.deepEqual(at({ touch: true }), { kind: 'drag', k: 'crate', x: 10, y: 4 });
  assert.deepEqual(at({ tool: 'crate', touch: true }), { kind: 'tile', x: 10, y: 4 });
});

test('The Back (0.4): the floor switch, then parts, belts by the run, and parts in the way', () => {
  const session = trainingSession();
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === 'Junk into a Spite Still'));
  const s = session.state;
  const at = (ui) => arrowTarget(tut.step, s, tut.marks(), ui);
  // Looking at the shop: the floor switch, whatever is held.
  assert.deepEqual(at({ floor: 0 }), { kind: 'control', name: 'floor' });
  assert.deepEqual(at({ floor: 0, tool: 'still' }), { kind: 'control', name: 'floor' });
  // In The Back: the Still (picked first on a finger too, since it must be turned to face down).
  assert.deepEqual(at({ floor: 1 }), { kind: 'button', k: 'still' });
  assert.deepEqual(at({ floor: 1, touch: true }), { kind: 'button', k: 'still' });
  assert.deepEqual(at({ floor: 1, tool: 'still' }), { kind: 'tile', x: 10, y: 4 });
  tut.act({ c: 'view', f: 1 });
  tut.act({ c: 'place', k: 'still', x: 10, y: 4, d: 1, f: 1 });
  // Then one belt: a drag from its tile onto the Still.
  assert.deepEqual(at({ floor: 1 }), { kind: 'button', k: 'conv' });
  assert.deepEqual(at({ floor: 1, tool: 'conv' }), { kind: 'swipe', from: { x: 10, y: 3 }, to: { x: 10, y: 4 } });
  assert.ok(tut.marks().every((m) => m.f === 1), 'the marks are in The Back');

  // A belt laid the wrong way is laid over again by the same drag.
  tut.act({ c: 'place', k: 'conv', x: 10, y: 3, d: 0, f: 1 });
  assert.deepEqual(at({ floor: 1, tool: 'conv' }), { kind: 'swipe', from: { x: 10, y: 3 }, to: { x: 10, y: 4 } });
  assert.match(tut.hint(), /arrow must point down/);
  // The wrong part on a tile: a right-click (the tile), or a finger with the Remove tool.
  tut.act({ c: 'remove', x: 10, y: 3, f: 1 });
  tut.act({ c: 'place', k: 'bin', x: 10, y: 3, d: 0, f: 1 });
  assert.deepEqual(at({ floor: 1 }), { kind: 'tile', x: 10, y: 3 });
  assert.deepEqual(at({ floor: 1, touch: true }), { kind: 'button', k: 'remove' });
  assert.deepEqual(at({ floor: 1, touch: true, tool: 'remove' }), { kind: 'tile', x: 10, y: 3 });
  assert.match(tut.hint(), /Right-click the highlighted part to take it out/);
});

test('the Wire and Reinforce tools, and the Returns Drop\'s MORE JUNK (0.4)', () => {
  const session = trainingSession();
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === 'Razor Wire: pick a direction'));
  const s = session.state;
  const at = (ui) => arrowTarget(tut.step, s, tut.marks(), ui);
  assert.deepEqual(at({}), { kind: 'button', k: 'wire' });
  assert.deepEqual(at({ touch: true }), { kind: 'button', k: 'wire' });
  assert.deepEqual(at({ tool: 'wire' }), { kind: 'tile', x: 8, y: 9 });
  // Pointed another way: the hint says to click on round.
  tut.act({ c: 'wire', x: 8, y: 9, d: 0 });
  assert.match(tut.hint(), /points east\. Click it again/);
  tut.act({ c: 'wire', x: 8, y: 9, d: 3 });
  assert.equal(tut.check(), true);

  const r = trainingSession();
  const tr = createTutorial(r);
  tr.autoplay(STEPS.findIndex((st) => st.title === 'Reinforce the crates'));
  const atr = (ui) => arrowTarget(tr.step, r.state, tr.marks(), ui);
  assert.deepEqual(atr({}), { kind: 'button', k: 'reinforce' });
  assert.deepEqual(atr({ tool: 'reinforce' }), { kind: 'tile', x: 2, y: 7 });
  r.send({ c: 'reinforce', x: 2, y: 7 });
  assert.deepEqual(atr({ tool: 'reinforce' }), { kind: 'tile', x: 2, y: 8 });

  const m = trainingSession();
  const tm = createTutorial(m);
  tm.autoplay(STEPS.findIndex((st) => st.title === 'Money, and MORE JUNK'));
  const atm = (ui) => arrowTarget(tm.step, m.state, tm.marks(), ui);
  assert.deepEqual(atm({ floor: 0 }), { kind: 'control', name: 'floor' });
  assert.deepEqual(atm({ floor: 1 }), { kind: 'tile', x: 10, y: 2 });
  assert.deepEqual(atm({ floor: 1, tool: 'conv' }), { kind: 'button', k: 'conv' }, 'put down what is held first');
  assert.deepEqual(atm({ floor: 1, tool: 'conv', touch: true }), { kind: 'control', name: 'drop' });
  assert.deepEqual(atm({ floor: 1, selected: { x: 10, y: 2 } }), { kind: 'control', name: 'more' });
});
