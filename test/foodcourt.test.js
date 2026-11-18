// Tests for the Food Court store design: its furniture, and that it never gets in the way of
// the rules (shoppers reach the tills, the entrances and tills stay clear, marked floor is free).
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, setMap, makeMap, getDist, MAP_SIZES, MAP_DESIGNS, DECOR, UNREACHABLE,
} from '../src/sim/index.js';

const SIZES = Object.keys(MAP_SIZES);
const count = (str, ch) => [...str].filter((c) => c === ch).length;

test('the Food Court is the fourth design', () => {
  assert.deepEqual(Object.keys(MAP_DESIGNS).slice(0, 4), ['warehouse', 'showroom', 'aisles', 'food']);
  assert.equal(MAP_DESIGNS.food.name, 'Food Court');
  assert.ok(MAP_DESIGNS.food.desc.length > 20);
  for (const ch of [' ', 'b', 'f', 'k', 'n', 'p', 't']) assert.ok(DECOR[ch], `DECOR has no '${ch}'`);
});

test('every size has furniture of every kind, all of it solid, in a sensible amount', () => {
  for (const size of SIZES) {
    const { w, h, tiles, decor } = makeMap('food', size);
    assert.equal(decor.length, w * h, size);
    for (let i = 0; i < decor.length; i++) {
      assert.ok(' bfknpt'.includes(decor[i]), `${size}: '${decor[i]}' is not food court furniture`);
      if (decor[i] !== ' ') assert.equal(tiles[i], '#', `${size}: furniture at ${i % w},${(i / w) | 0} is not solid`);
    }
    const floor = count(tiles, '.');
    const furniture = decor.length - count(decor, ' ');
    const share = furniture / (furniture + floor);
    assert.ok(share > 0.05 && share < 0.13, `${size}: furniture is ${(share * 100).toFixed(1)}% of the floor`);
    // Lots of little tables, and some of everything else.
    assert.ok(count(decor, 't') >= Math.max(10, floor / 50), `${size}: only ${count(decor, 't')} tables`);
    for (const ch of ['b', 'p', 'n', 'k']) assert.ok(count(decor, ch) >= 1, `${size}: no ${DECOR[ch]}`);
    // A fountain in the middle from the Superstore up, and none in the small stores.
    const big = MAP_SIZES[size].h >= MAP_SIZES.m.h;
    assert.equal(count(decor, 'f') > 0, big, `${size}: fountain`);
    // The only plain walls are the outer ones: the food court has no pillars.
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (tiles[i] === '#') assert.notEqual(decor[i], ' ', `${size}: a bare wall at ${x},${y}`);
      }
    }
  }
});

test('stalls and the fountain are solid blocks of several tiles', () => {
  for (const size of SIZES) {
    const { w, decor } = makeMap('food', size);
    const is = (x, y, ch) => decor[y * w + x] === ch;
    for (let i = 0; i < decor.length; i++) {
      const ch = decor[i];
      if (ch !== 'k' && ch !== 'f') continue;
      const x = i % w, y = (i / w) | 0;
      assert.ok(is(x - 1, y, ch) || is(x + 1, y, ch), `${size}: ${DECOR[ch]} at ${x},${y} is one tile wide`);
      assert.ok(is(x, y - 1, ch) || is(x, y + 1, ch), `${size}: ${DECOR[ch]} at ${x},${y} is one tile tall`);
    }
    // There is one fountain, and it fills the box around it.
    const f = [];
    for (let i = 0; i < decor.length; i++) if (decor[i] === 'f') f.push([i % w, (i / w) | 0]);
    if (!f.length) continue;
    const xs = f.map((p) => p[0]), ys = f.map((p) => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1;
    assert.equal(f.length, bw * bh, `${size}: the fountain is one block`);
    assert.ok(f.length >= 9);
  }
});

test('on the Food Court every floor tile and every entrance reaches a till', () => {
  for (const size of SIZES) {
    const s = createGame({ map: { design: 'food', size } });
    const dist = getDist(s);
    for (let i = 0; i < s.tiles.length; i++) {
      if (s.tiles[i] === '#' || s.tiles[i] === 'T') continue;
      assert.notEqual(dist[i], UNREACHABLE, `${size}: ${i % s.w},${(i / s.w) | 0} is sealed off`);
    }
    for (const door of s.doors) for (const t of door) assert.notEqual(dist[t], UNREACHABLE);
  }
});

test('the floor in front of every entrance and every till is clear', () => {
  for (const size of SIZES) {
    const { w, h, tiles, doors } = makeMap('food', size);
    assert.equal(doors.length, 7);
    for (const door of doors) {
      for (const t of door) {
        const x = t % w, y = (t / w) | 0;
        const dx = x === 0 ? 1 : 0, dy = y === 0 ? 1 : y === h - 1 ? -1 : 0;
        for (let k = 1; k <= 2; k++) assert.equal(tiles[(y + dy * k) * w + x + dx * k], '.', `${size}: in front of the entrance at ${x},${y}`);
      }
    }
    for (let y = 1; y < h - 1; y++) {
      for (const x of [w - 2, w - 3, w - 4]) assert.equal(tiles[y * w + x], '.', `${size}: ${x},${y} in front of the tills`);
    }
  }
});

test('the marked floor is never under or beside furniture, however many entrances there are', () => {
  for (const size of SIZES) for (let slots = 1; slots <= 7; slots++) {
    const s = createGame({ map: { design: 'food', size, slots } });
    let marked = 0;
    for (let i = 0; i < s.zones.length; i++) {
      if (s.zones[i] === ' ') continue;
      marked++;
      const x = i % s.w, y = (i / s.w) | 0;
      assert.equal(s.tiles[i], '.', `${size}: marked floor at ${x},${y} is solid`);
      // A tile all round, for belts and for the machines' own fronts.
      for (let ny = y - 1; ny <= y + 1; ny++) {
        for (let nx = x - 1; nx <= x + 1; nx++) assert.equal(s.decor[ny * s.w + nx], ' ', `${size}: furniture beside marked floor at ${nx},${ny}`);
      }
    }
    assert.ok(marked > 0);
  }
});

test('the Food Court is the same every time, however many entrances are in use', () => {
  for (const size of SIZES) {
    assert.deepEqual(makeMap('food', size), makeMap('food', size));
    const one = makeMap('food', size, 1), all = makeMap('food', size, 7);
    assert.equal(one.decor, all.decor, `${size}: the furniture does not move when fewer entrances are in use`);
    // The tiles differ only where the unused entrances would be.
    for (let i = 0; i < one.tiles.length; i++) {
      if (one.tiles[i] !== all.tiles[i]) assert.ok(one.tiles[i] === '#' && all.tiles[i] === 'd');
    }
  }
});

test('shoppers weave through the tables rather than going the long way round', () => {
  for (const size of SIZES) {
    const food = createGame({ map: { design: 'food', size } });
    const open = createGame({ map: { design: 'warehouse', size } });
    const fd = getDist(food), wd = getDist(open);
    for (let d = 0; d < food.doors.length; d++) {
      const a = fd[food.doors[d][0]], b = wd[open.doors[d][0]];
      assert.ok(a <= b * 1.15 + 1, `${size}: entrance ${d} is ${a} tiles from a till, ${b} on the open warehouse`);
    }
  }
});

test('the other designs have no furniture', () => {
  for (const design of ['warehouse', 'showroom', 'aisles']) {
    for (const size of SIZES) assert.equal(makeMap(design, size).decor, '', `${design} ${size}`);
  }
  assert.equal(createGame().decor, '', 'nor does the bare default map');
});

test('the furniture is in the game state, and changing the store in the lobby changes it', () => {
  const s = createGame({ map: { design: 'food', size: 's' } });
  assert.equal(s.decor, makeMap('food', 's').decor);
  assert.equal(s.decor.length, s.w * s.h);
  assert.ok(s.decor.includes('t'));
  // It survives the trip to the other players as JSON.
  assert.equal(JSON.parse(JSON.stringify(s)).decor, s.decor);

  const lobby = createGame({ lobby: true, map: { design: 'warehouse', size: 's' } });
  addPlayer(lobby, 'Dave');
  assert.equal(lobby.decor, '');
  assert.ok(setMap(lobby, 'food', 'm'));
  assert.equal(lobby.decor, makeMap('food', 'm').decor);
  assert.equal(lobby.decor.length, lobby.w * lobby.h);
  assert.ok(setMap(lobby, 'aisles', 'm'));
  assert.equal(lobby.decor, '');
});
