// Tests for placing a building with a finger (0.3.03): the lifted preview, tap or drag, the edge
// slide and the bar's scroll-or-pick-up decision, in src/ui/lift.js.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIFT, EDGE, TAP_SLOP_PX, BAR_PICK_PX, liftPx, liftFraction, shouldLift, createPress, liftedSpot,
  liftedAnchor, edgeVelocity, barGesture,
} from '../src/ui/lift.js';

test('0.3.03: the preview is lifted one and a half tiles, but at least 56 and at most 110 pixels', () => {
  assert.equal(LIFT.minPx, 56);
  assert.equal(LIFT.maxPx, 110);
  assert.equal(liftPx(48), 72); // 1.5 tiles of 48 pixels
  assert.equal(liftPx(20), 56); // zoomed out: still clears a fingertip
  assert.equal(liftPx(90), 110); // zoomed in: stays near the finger
});

test('0.3.03: the preview rises with a quick ease, not a jump', () => {
  assert.equal(liftFraction(0), 0);
  assert.equal(liftFraction(-5), 0);
  const half = liftFraction(LIFT.easeMs / 2);
  assert.ok(half > 0.3 && half < 0.7, `half way: ${half}`);
  assert.equal(liftFraction(LIFT.easeMs), 1);
  assert.equal(liftFraction(LIFT.easeMs * 5), 1);
  assert.ok(LIFT.easeMs <= 200);
});

test('0.3.03: a press that does not drag is a tap however long it rests; any drag lifts it', () => {
  assert.equal(TAP_SLOP_PX, 8);
  // A long still press (time plays no part: nothing to pass but where the finger is).
  const still = createPress(100, 200);
  for (let i = 0; i < 50; i++) still.move(100, 200);
  assert.equal(still.lifted, false);
  // A shaky tap: 3 pixels.
  const shaky = createPress(100, 200);
  shaky.move(102, 202); shaky.move(97, 200);
  assert.equal(shaky.lifted, false);
  assert.equal(shouldLift(3), false);
  assert.equal(shouldLift(TAP_SLOP_PX), true);
});

test('0.3.03: once lifted, the preview stays lifted for the rest of the touch', () => {
  const p = createPress(100, 200);
  assert.equal(p.move(100, 180), true); // 20 pixels up
  assert.equal(p.move(100, 200), true); // back to where it went down
  assert.equal(p.move(101, 201), true);
  assert.equal(p.lifted, true);
});

test('0.3.03: a press that drags 20 pixels and comes back places at the lifted tile, not under the finger', () => {
  const cam = { x: 10, y: 10, zoom: 40 }, rect = { left: 0, top: 0, width: 800, height: 800 };
  // The finger at the centre of the view, on tile (10, 10)... (the view's centre is tile 10.0)
  const fx = 400 + 20, fy = 400 + 20; // tile 10.5, 10.5: inside tile (10, 10)
  const p = createPress(fx, fy);
  p.move(fx, fy - 20); p.move(fx, fy);
  assert.ok(p.lifted);
  const spot = liftedSpot(fx, fy, cam, rect, 1, 1, 30, 30, 1);
  // 1.5 tiles of 40 pixels = 60 pixels up: from y 10.5 to 9.0, which is tile 9.
  assert.equal(spot.sy, fy - 60);
  assert.deepEqual(spot.tile, { x: 10, y: 9 });
  assert.notDeepEqual(spot.tile, { x: 10, y: 10 });
});

test('0.3.03: a bigger building is centred on the lifted point and kept inside the map', () => {
  // A 2 x 2 building centred on (5.3, 7.9): its tiles are 4-5 and 7-8.
  assert.deepEqual(liftedAnchor(5.3, 7.9, 2, 2, 20, 20), { x: 4, y: 7 });
  // A 3 x 1 laser centred on (5.6, 2.2): tiles 4-6, row 2.
  assert.deepEqual(liftedAnchor(5.6, 2.2, 3, 1, 20, 20), { x: 4, y: 2 });
  // A 1 x 1 building is on the tile the point is on.
  assert.deepEqual(liftedAnchor(5.99, 2.01, 1, 1, 20, 20), { x: 5, y: 2 });
  // Near a wall the footprint is moved inside the map, not refused.
  assert.deepEqual(liftedAnchor(0.2, 19.9, 2, 2, 20, 20), { x: 0, y: 18 });
  // Off the map: nothing.
  assert.equal(liftedAnchor(-0.1, 5, 1, 1, 20, 20), null);
  assert.equal(liftedAnchor(5, 20, 1, 1, 20, 20), null);
});

test('0.3.03: a finger near an edge of the floor slides the view that way, faster the deeper it is', () => {
  const rect = { left: 0, top: 50, right: 400, bottom: 750 };
  assert.deepEqual(edgeVelocity(200, 400, rect), { vx: 0, vy: 0 });
  assert.deepEqual(edgeVelocity(EDGE.bandPx + 1, 400, rect), { vx: 0, vy: 0 });
  const shallow = edgeVelocity(rect.right - EDGE.bandPx * 0.75, 400, rect).vx;
  const deep = edgeVelocity(rect.right - EDGE.bandPx * 0.25, 400, rect).vx;
  assert.ok(shallow > 0 && deep > shallow, `${shallow} then ${deep}`);
  assert.equal(edgeVelocity(rect.right, 400, rect).vx, EDGE.tilesPerSec);
  assert.equal(edgeVelocity(rect.right + 30, 400, rect).vx, EDGE.tilesPerSec); // beyond it: no faster
  assert.equal(EDGE.tilesPerSec, 8);
  assert.ok(edgeVelocity(5, 400, rect).vx < 0);
  assert.ok(edgeVelocity(200, 60, rect).vy < 0);
  assert.ok(edgeVelocity(200, 740, rect).vy > 0);
  // A drag from the bar that has not yet been up on the floor: the bottom edge does not count.
  assert.equal(edgeVelocity(200, 740, rect, { bottom: false }).vy, 0);
  assert.equal(edgeVelocity(200, 800, rect, { bottom: false }).vy, 0);
});

test('0.3.03: in the bar, a mostly upward drag picks the building up and a sideways swipe scrolls', () => {
  assert.equal(BAR_PICK_PX, 12);
  assert.equal(barGesture(0, 0), 'wait');
  assert.equal(barGesture(3, -6), 'wait');
  assert.equal(barGesture(2, -BAR_PICK_PX), 'pick');
  assert.equal(barGesture(8, -20), 'pick');
  assert.equal(barGesture(-30, -10), 'scroll');
  assert.equal(barGesture(20, 3), 'scroll');
  assert.equal(barGesture(15, -15), 'scroll'); // as much sideways as up: the bar keeps it
  assert.equal(barGesture(0, 25), 'wait'); // downward: nothing new (a tap still clicks)
  // Out of the bar onto the floor counts as picked up, however it got there.
  assert.equal(barGesture(4, -5, true), 'pick');
});
