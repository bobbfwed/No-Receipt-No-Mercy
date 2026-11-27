// Tests for the pointer side of 0.4.01's input work: a belt line in The Back laid from a press to a
// release as one `line` command (mouse and finger), the Q key that puts everything down, and the
// Reinforce drag taking any building that can be reinforced. createInput runs here with a stand-in
// canvas, renderer and session (no browser): one tile is 30 pixels, the canvas starts at 0, 0.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, BUILD } from '../src/sim/index.js';
import { createInput, PUT_DOWN_KEY } from '../src/ui/input.js';
import { startReinforce } from '../src/ui/wiretool.js';

const Z = 30;

/** The window's own listeners (input.js listens there for keys and for drags from the bar). */
const winListeners = new Map();
globalThis.addEventListener ??= (type, fn) => { if (!winListeners.has(type)) winListeners.set(type, []); winListeners.get(type).push(fn); };
globalThis.removeEventListener ??= () => {};

/** A game in its build pause on a bare map (an outer wall only), with Dave. */
function game(cash = 1e6) {
  const s = createGame();
  let t = '';
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) t += x === 0 || y === 0 || x === s.w - 1 || y === s.h - 1 ? '#' : '.';
  s.tiles = t;
  addPlayer(s, 'Dave');
  s.players[0].cash = cash;
  s.phase = 'build';
  return s;
}

/** createInput with stand-ins; `sent` collects the commands it sends. */
function rig(s = game()) {
  const canvasListeners = new Map();
  const canvas = {
    dataset: {},
    addEventListener(type, fn) { canvasListeners.set(type, fn); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: s.w * Z, height: s.h * Z, right: s.w * Z, bottom: s.h * Z }),
    setPointerCapture() {}, releasePointerCapture() {},
    ownerDocument: { elementFromPoint: () => canvas },
  };
  const renderer = {
    cam: { x: s.w / 2, y: s.h / 2, zoom: Z },
    tileAt(cx, cy) { const x = Math.floor(cx / Z), y = Math.floor(cy / Z); return x >= 0 && y >= 0 && x < s.w && y < s.h ? { x, y } : null; },
    pan() {}, zoomBy() {}, centerOn() {},
  };
  const sent = [];
  const session = { state: s, me: 0, send(c) { sent.push(c); return { ok: true }; }, on: () => () => {}, sendCursor() {} };
  const input = createInput({ canvas, renderer, session });
  const fire = (type, o) => canvasListeners.get(type)({ preventDefault() {}, type, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, ...o });
  // (The centre of tile x, y in page pixels.)
  const px = (x) => x * Z + Z / 2;
  const mouse = {
    down: (x, y, o = {}) => fire('pointerdown', { clientX: px(x), clientY: px(y), ...o }),
    move: (x, y, o = {}) => fire('pointermove', { clientX: px(x), clientY: px(y), ...o }),
    up: (x, y, o = {}) => fire('pointerup', { clientX: px(x), clientY: px(y), buttons: 0, ...o }),
  };
  const finger = {
    down: (x, y, id = 5) => fire('pointerdown', { clientX: px(x), clientY: px(y), pointerType: 'touch', pointerId: id }),
    move: (x, y, id = 5) => fire('pointermove', { clientX: px(x), clientY: px(y), pointerType: 'touch', pointerId: id }),
    up: (x, y, id = 5) => fire('pointerup', { clientX: px(x), clientY: px(y), pointerType: 'touch', pointerId: id }),
  };
  const key = (k) => { for (const fn of winListeners.get('keydown') || []) fn({ key: k, code: '', preventDefault() {}, target: {}, repeat: false }); };
  return { s, input, sent, mouse, finger, key };
}

test('a belt line with the mouse: nothing until let go, then one line command along the way first dragged', () => {
  const r = rig();
  r.input.setFloor(1);
  r.input.setTool('conv');
  r.mouse.down(3, 3);
  r.mouse.move(4, 3); // left the start tile across: axis 0
  r.mouse.move(8, 6);
  assert.deepEqual(r.sent, [], 'nothing is placed while dragging');
  const v = r.input.view();
  assert.ok(v.line && v.line.plan && v.line.plan.steps.length, 'the floor is given the planned route');
  assert.equal(v.line.plan.steps.length, 5 + 3 + 1, 'an L: the shortest way');
  r.mouse.up(8, 6);
  assert.deepEqual(r.sent, [{ c: 'line', f: 1, x: 3, y: 3, x2: 8, y2: 6, a: 0 }]);
  assert.equal(r.input.view().line, null);
});

test('the axis is the way the drag first left the start tile, and is chosen again back on the start tile', () => {
  const r = rig();
  r.input.setFloor(1);
  r.input.setTool('conv');
  r.mouse.down(5, 5);
  r.mouse.move(5, 6); // down first: axis 1
  r.mouse.move(9, 8);
  r.mouse.up(9, 8);
  assert.equal(r.sent.at(-1).a, 1);
  // A jump to a diagonal tile takes the longer distance.
  r.mouse.down(5, 5);
  r.mouse.move(8, 6);
  r.mouse.up(8, 6);
  assert.equal(r.sent.at(-1).a, 0);
  // Back on the start tile the axis is free again.
  r.mouse.down(5, 5);
  r.mouse.move(6, 5);
  r.mouse.move(5, 5);
  r.mouse.move(5, 4);
  r.mouse.move(9, 2);
  r.mouse.up(9, 2);
  assert.equal(r.sent.at(-1).a, 1);
});

test('a click lays one belt the held way; a drag that comes back to its start lays nothing', () => {
  const r = rig();
  r.input.setFloor(1);
  r.input.setTool('conv');
  r.key('r'); // turn the held belt to face south
  r.mouse.down(4, 4);
  r.mouse.up(4, 4);
  assert.deepEqual(r.sent, [{ c: 'place', k: 'conv', x: 4, y: 4, d: 1, f: 1 }]);
  r.mouse.down(4, 4);
  r.mouse.move(6, 4);
  r.mouse.move(4, 4);
  r.mouse.up(4, 4);
  assert.equal(r.sent.length, 1);
});

test('Escape, the right button and Q give a line up without laying anything', () => {
  const r = rig();
  r.input.setFloor(1);
  r.input.setTool('conv');
  r.mouse.down(3, 3); r.mouse.move(7, 3); r.key('Escape'); r.mouse.up(7, 3);
  r.mouse.down(3, 3); r.mouse.move(7, 3); r.mouse.move(7, 3, { buttons: 3 }); r.mouse.up(7, 3);
  r.mouse.down(3, 3); r.mouse.move(7, 3); r.key(PUT_DOWN_KEY); r.mouse.up(7, 3);
  assert.deepEqual(r.sent, []);
  assert.equal(r.input.tool, null, 'Q puts the belt down too');
});

test('a finger: a drag lays a line when it lifts, a tap one belt, a second finger cancels', () => {
  const r = rig();
  r.input.setFloor(1);
  r.input.setTool('conv');
  r.finger.down(3, 3); r.finger.move(3, 5); r.finger.move(6, 7);
  assert.deepEqual(r.sent, []);
  assert.equal(r.input.view().line.touch, true);
  r.finger.up(6, 7);
  assert.deepEqual(r.sent, [{ c: 'line', f: 1, x: 3, y: 3, x2: 6, y2: 7, a: 1 }]);
  r.finger.down(9, 9); r.finger.up(9, 9);
  assert.deepEqual(r.sent.at(-1), { c: 'place', k: 'conv', x: 9, y: 9, d: 0, f: 1 });
  r.finger.down(3, 3, 7); r.finger.move(8, 3, 7); r.finger.down(10, 10, 8); r.finger.up(8, 3, 7); r.finger.up(10, 10, 8);
  assert.equal(r.sent.length, 2);
});

test('Q puts down what is held and closes a selected building\'s sheet; Q is no other key', () => {
  const r = rig();
  r.input.setTool('crate');
  assert.equal(r.input.tool, 'crate');
  r.key('Q');
  assert.equal(r.input.tool, null);
  r.input.setTool('wire');
  r.key('q');
  assert.equal(r.input.tool, null);
  r.s.grid[5 * r.s.w + 5] = { k: 'crate', o: 0, d: 0 };
  r.input.select({ x: 5, y: 5 });
  assert.ok(r.input.selected);
  r.key('q');
  assert.equal(r.input.selected, null);
  assert.deepEqual(r.sent, []);
});

test('a Back part held over a plain belt is sent to be placed there (it replaces the belt)', () => {
  const r = rig();
  r.input.setFloor(1);
  r.s.back[4 * r.s.w + 4] = { k: 'conv', o: 0, d: 0, it: [] };
  r.input.setTool('split');
  r.mouse.down(4, 4);
  r.mouse.up(4, 4);
  assert.deepEqual(r.sent, [{ c: 'place', k: 'split', x: 4, y: 4, d: 0, f: 1 }]);
});

test('the Reinforce drag counts every kind that can be reinforced, a big building once', () => {
  const s = game(1e6);
  const kinds = Object.keys(BUILD).filter((k) => BUILD[k].reinforce);
  assert.ok(kinds.includes('crate'));
  // A crate, then a second tile of the same building: the second is skipped.
  s.grid[5 * s.w + 5] = { k: 'crate', o: 0, d: 0 };
  const r = startReinforce(1e6);
  assert.deepEqual(r.at(s, 0, 5, 5), { c: 'reinforce', x: 5, y: 5 });
  assert.equal(r.at(s, 0, 5, 5), null);
  // Something that cannot be reinforced is passed over quietly after the first tile.
  assert.equal(r.at(s, 0, 9, 9), null);
});
