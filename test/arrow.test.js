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
  return new HostSession({ name: 'Dave', director: createDirector(() => 0.5), state: createGame({ seed, training: true, zones: true }) });
}
const TOOLS = new Set(['upgrade', 'rebuild']);

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

test('every lesson has something to point at, in every state it goes through', () => {
  const session = trainingSession();
  const s = () => session.state;
  const tut = createTutorial(session);
  const seen = {}; // lesson title -> the targets it went through, desktop and touch
  const look = (ui, label) => {
    const t = arrowTarget(tut.step, s(), tut.marks(), ui);
    valid(t, s(), `${tut.step.title} (${label})`);
    return t;
  };
  tut.start();
  while (true) {
    const st = tut.step;
    const desk = [], touch = [];
    const both = (ui = {}) => {
      desk.push(targetKey(look({ ...ui, touch: false }, 'desktop')));
      touch.push(targetKey(look({ ...ui, touch: true }, 'touch')));
    };
    // At the start, nothing held: there is always something to press (a button, a tile, the doors, Next).
    const first = [arrowTarget(st, s(), tut.marks(), {}), arrowTarget(st, s(), tut.marks(), { touch: true })];
    for (const t of first) assert.notEqual(t.kind, 'none', `"${st.title}" points at something when it starts`);
    both();
    // Holding what the first mark wants: its tile (or the line of belts).
    const m = tut.marks()[0];
    if (m && m.k && !m.up && !m.fix) {
      const held = arrowTarget(st, s(), tut.marks(), { tool: m.k });
      assert.ok(['tile', 'swipe'].includes(held.kind), `"${st.title}": holding the ${m.k} points at the floor`);
      both({ tool: m.k });
    }
    if (st.manual) {
      seen[st.title] = { desk, touch };
      if (st.last) break;
      tut.next();
      continue;
    }
    for (const cmd of st.solve(s())) {
      if (cmd.c === 'start') {
        assert.deepEqual(arrowTarget(st, s(), tut.marks(), {}), { kind: 'control', name: 'doors' }, `"${st.title}": the doors once it is built`);
        both();
      }
      session.send(cmd);
      if (cmd.c === 'start' && s().phase === 'wave' && !tut.marks().length) {
        assert.equal(arrowTarget(st, s(), tut.marks(), {}).kind, 'none', `"${st.title}": nothing to press while the wave is on`);
        both();
      }
    }
    let sent = false;
    for (let n = 0; n < 240 && !tut.check(); n++) {
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
  assert.deepEqual(seen['Security: the Pepper Sprinkler'].desk.slice(0, 3), ['button:sprinkler', 'tile:9,13', 'control:doors']);
  assert.deepEqual(seen['Security: the Pepper Sprinkler'].touch.slice(0, 3), ['drag:sprinkler:9,13', 'tile:9,13', 'control:doors']);
  assert.ok(seen['Belts carry goods'].desk.includes('swipe:10,3:10,10'), 'the belt line is a drag along the tiles');
  assert.ok(seen['Belts carry goods'].touch.includes('button:belt'), 'a phone taps the Belt first, then drags on the floor');
  assert.ok(seen['Gym Bros'].desk.includes('button:rebuild'), 'the Rebuild button after the gym bro');
  assert.ok(seen.Dads.desk.includes('control:doors'));
});

test('a wrong building on the tile: its sheet fixes it (Remove, or Rotate), and a finger puts its tool down first', () => {
  const session = trainingSession();
  const tut = createTutorial(session);
  tut.start();
  tut.next(); // the Unpacker
  const st = tut.step, s = session.state;
  session.send({ c: 'place', k: 'unpacker', x: 10, y: 2, d: 0 }); // facing east, not down
  const at = (ui) => arrowTarget(st, s, tut.marks(), ui);
  assert.deepEqual(at({}), { kind: 'tile', x: 10, y: 2 });
  assert.deepEqual(at({ selected: { x: 10, y: 2 } }), { kind: 'control', name: 'spin' });
  assert.deepEqual(at({ touch: true, tool: 'unpacker' }), { kind: 'control', name: 'drop' });
  session.send({ c: 'remove', x: 10, y: 2 });
  session.send({ c: 'place', k: 'crate', x: 10, y: 2, d: 0 });
  assert.deepEqual(at({ selected: { x: 10, y: 2 } }), { kind: 'control', name: 'remove' });
});

test('an upgrade: the Upgrade tool (with a mouse), then the building, then the Damage button in its sheet', () => {
  const session = trainingSession();
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === 'Upgrades, and super shoppers'));
  const st = tut.step, s = session.state;
  const at = (ui) => arrowTarget(st, s, tut.marks(), ui);
  assert.deepEqual(at({}), { kind: 'button', k: 'upgrade' });
  assert.deepEqual(at({ tool: 'upgrade' }), { kind: 'tile', x: 9, y: 13 });
  assert.deepEqual(at({ tool: 'upgrade', selected: { x: 9, y: 13 } }), { kind: 'control', name: 'dmg' });
  // A finger needs no tool: the building, then its sheet.
  assert.deepEqual(at({ touch: true }), { kind: 'tile', x: 9, y: 13 });
  assert.deepEqual(at({ touch: true, selected: { x: 9, y: 13 } }), { kind: 'control', name: 'dmg' });
  // The first one done: on to the second, even with the first one's sheet still open.
  for (let n = 0; n < 3; n++) session.send({ c: 'upgrade', x: 9, y: 13, t: 'dmg' });
  assert.deepEqual(at({ selected: { x: 9, y: 13 } }), { kind: 'tile', x: 11, y: 13 });
  for (let n = 0; n < 3; n++) session.send({ c: 'upgrade', x: 11, y: 13, t: 'dmg' });
  assert.deepEqual(at({}), { kind: 'control', name: 'doors' });
});

test('several tiles: the one the held tool is for, else the first not yet done', () => {
  const session = trainingSession();
  const tut = createTutorial(session);
  tut.autoplay(STEPS.findIndex((st) => st.title === 'Slow them down: the Wet Floor Sign'));
  const st = tut.step, s = session.state;
  const at = (ui) => arrowTarget(st, s, tut.marks(), ui);
  assert.deepEqual(at({}), { kind: 'button', k: 'wetfloor' });
  assert.deepEqual(at({ tool: 'sprinkler' }), { kind: 'tile', x: 11, y: 13 }, 'holding a Sprinkler: the Sprinkler\'s tile');
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
