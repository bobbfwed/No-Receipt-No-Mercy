// Tests for the Car Park store design: its rows of parked cars, its two banks of tills, and the
// rule that both banks stay open. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, canPlace, step, queueTrainingWave, makeMap, getDist, computeDist, tillBanks, banksOpen,
  MAP_SIZES, MAP_DESIGNS, DECOR, UNREACHABLE,
} from '../src/sim/index.js';

const SIZES = Object.keys(MAP_SIZES);
const CAR_PARK = ['c', 'C', 'r', 'R', 'x', 'i', 'l', 'm', 'a', 'o', 'v'];
const count = (str, ch) => [...str].filter((c) => c === ch).length;

/** Walking distance from every tile to one bank of tills only (the other banks count as wall). */
function distTo(s, bank) {
  const only = [...s.tiles].map((ch, i) => (ch === 'T' && !bank.includes(i) ? '#' : ch)).join('');
  return computeDist({ ...s, tiles: only });
}

test('the Car Park is the fifth design, and its pieces are on the list', () => {
  assert.deepEqual(Object.keys(MAP_DESIGNS).slice(0, 5), ['warehouse', 'showroom', 'aisles', 'food', 'carpark']);
  assert.equal(MAP_DESIGNS.carpark.name, 'Car Park');
  assert.ok(MAP_DESIGNS.carpark.desc.length > 20);
  for (const ch of CAR_PARK) assert.ok(DECOR[ch], `DECOR has no '${ch}'`);
});

test('every size has rows of cars, all solid, each piece whole', () => {
  for (const size of SIZES) {
    const { w, h, tiles, decor } = makeMap('carpark', size);
    assert.equal(decor.length, w * h, size);
    const at = (x, y) => decor[y * w + x];
    for (let i = 0; i < decor.length; i++) {
      const ch = decor[i], x = i % w, y = (i / w) | 0;
      const where = `${size} at ${x},${y}`;
      if (ch === ' ') {
        // The only plain walls are the outer ones: the car park has no pillars.
        if (tiles[i] === '#') assert.ok(x === 0 || y === 0 || x === w - 1 || y === h - 1, `a bare wall, ${where}`);
        continue;
      }
      assert.ok(CAR_PARK.includes(ch), `'${ch}' is not a car park piece, ${where}`);
      assert.equal(tiles[i], '#', `not solid, ${where}`);
      // A car and a trolley shelter are two tiles side by side: small letter, then capital.
      if (ch === 'c' || ch === 'r') assert.equal(at(x + 1, y), ch.toUpperCase(), `half a car or shelter, ${where}`);
      if (ch === 'C' || ch === 'R') assert.equal(at(x - 1, y), ch.toLowerCase(), `half a car or shelter, ${where}`);
      // A lamp post and a pay machine stand on an island.
      if (ch === 'l' || ch === 'm') assert.ok(at(x - 1, y) === 'i' || at(x + 1, y) === 'i' || at(x - 1, y) === 'l' || at(x + 1, y) === 'l', `not on an island, ${where}`);
      // A trolley or a pothole in a lane touches nothing, so it can always be walked round.
      if (ch === 'a' || ch === 'o') {
        for (let ny = y - 1; ny <= y + 1; ny++) for (let nx = x - 1; nx <= x + 1; nx++) if (nx !== x || ny !== y) assert.equal(at(nx, ny), ' ', `something touches it, ${where}`);
      }
    }
    assert.ok(count(decor, 'c') >= 12, `${size}: only ${count(decor, 'c')} cars`);
    for (const ch of ['i', 'l', 'm']) assert.ok(count(decor, ch) >= 2, `${size}: no ${DECOR[ch]}`);
    // Not so full that there is nowhere to build.
    const floor = count(tiles, '.'), solid = decor.length - count(decor, ' ');
    assert.ok(solid / (solid + floor) > 0.1 && solid / (solid + floor) < 0.3, `${size}: cars are ${Math.round((100 * solid) / (solid + floor))}% of the floor`);
  }
});

test('a car across two bays is a block two tiles each way, and the burger van four by two', () => {
  for (const size of SIZES) {
    const { w, h, decor } = makeMap('carpark', size);
    const seen = new Uint8Array(w * h);
    let vans = 0;
    for (let i = 0; i < decor.length; i++) {
      const ch = decor[i];
      if ((ch !== 'x' && ch !== 'v') || seen[i]) continue;
      // Everything of that letter joined to this tile.
      const block = [], stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop();
        block.push(j);
        for (const n of [j - 1, j + 1, j - w, j + w]) if (decor[n] === ch && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
      const xs = block.map((j) => j % w), ys = block.map((j) => (j / w) | 0);
      const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1;
      assert.deepEqual([bw, bh, block.length], ch === 'x' ? [2, 2, 4] : [4, 2, 8], `${size}: a '${ch}' block at ${xs[0]},${ys[0]}`);
      if (ch === 'v') vans++;
    }
    // One van from the Superstore up, and none in the small stores.
    assert.equal(vans, MAP_SIZES[size].h >= MAP_SIZES.m.h ? 1 : 0, `${size}: burger vans`);
  }
});

test('the Car Park has two banks of tills, on the right and the bottom wall; the others have one', () => {
  for (const size of SIZES) {
    const s = createGame({ map: { design: 'carpark', size } });
    const banks = tillBanks(s);
    assert.equal(banks.length, 2, size);
    assert.ok(banks[0].every((t) => t % s.w === s.w - 1), `${size}: the first bank is in the right-hand wall`);
    assert.ok(banks[1].every((t) => ((t / s.w) | 0) === s.h - 1), `${size}: the second bank is in the bottom wall`);
    assert.equal(banks[0].length, banks[1].length, size);
    assert.ok(banks[0].length >= 4);
    assert.ok(banksOpen(s));
    for (const design of ['warehouse', 'showroom', 'aisles', 'food']) {
      const o = createGame({ map: { design, size } });
      assert.equal(tillBanks(o).length, 1, `${design} ${size}`);
      assert.ok(tillBanks(o)[0].length > banks[0].length, `${design} ${size}: its one bank is longer than either of the car park's`);
    }
  }
  assert.equal(tillBanks(createGame()).length, 1, 'the bare default map');
});

test('on the Car Park every floor tile and every entrance reaches both banks of tills', () => {
  for (const size of SIZES) for (const slots of [1, 3, 7]) {
    const s = createGame({ map: { design: 'carpark', size, slots } });
    for (const bank of tillBanks(s)) {
      const dist = distTo(s, bank);
      for (let i = 0; i < s.tiles.length; i++) {
        if (s.tiles[i] === '#' || s.tiles[i] === 'T') continue;
        assert.notEqual(dist[i], UNREACHABLE, `${size}: ${i % s.w},${(i / s.w) | 0} is sealed off`);
      }
    }
  }
});

test('the floor in front of every entrance and every till is clear, and never marked for a machine', () => {
  for (const size of SIZES) for (let slots = 1; slots <= 7; slots++) {
    const s = createGame({ map: { design: 'carpark', size, slots } });
    const { w, h } = s;
    const front = (t) => {
      const x = t % w, y = (t / w) | 0;
      const dx = x === 0 ? 1 : x === w - 1 ? -1 : 0, dy = y === 0 ? 1 : y === h - 1 ? -1 : 0;
      return [1, 2].map((k) => (y + dy * k) * w + x + dx * k);
    };
    assert.equal(s.doors.length, slots);
    for (const door of s.doors) for (const t of door) for (const f of front(t)) assert.equal(s.tiles[f], '.', `${size}: in front of the entrance at ${t % w},${(t / w) | 0}`);
    for (const bank of tillBanks(s)) {
      for (const t of bank) {
        for (const f of front(t)) {
          assert.equal(s.tiles[f], '.', `${size}: in front of the till at ${t % w},${(t / w) | 0}`);
          assert.equal(s.zones[f], ' ', `${size}: marked floor in front of the till at ${t % w},${(t / w) | 0}`);
        }
      }
    }
  }
});

test('the marked floor is never under or beside a car, however many entrances there are', () => {
  for (const size of SIZES) for (let slots = 1; slots <= 7; slots++) {
    const s = createGame({ map: { design: 'carpark', size, slots } });
    let marked = 0;
    for (let i = 0; i < s.zones.length; i++) {
      if (s.zones[i] === ' ') continue;
      marked++;
      const x = i % s.w, y = (i / s.w) | 0;
      assert.equal(s.tiles[i], '.', `${size}: marked floor at ${x},${y} is solid`);
      for (let ny = y - 1; ny <= y + 1; ny++) {
        for (let nx = x - 1; nx <= x + 1; nx++) assert.equal(s.decor[ny * s.w + nx], ' ', `${size}: a car beside marked floor at ${nx},${ny}`);
      }
    }
    assert.ok(marked > 0);
  }
});

test('the Car Park is the same every time, however many entrances are in use', () => {
  for (const size of SIZES) {
    assert.deepEqual(makeMap('carpark', size), makeMap('carpark', size));
    const one = makeMap('carpark', size, 1), all = makeMap('carpark', size, 7);
    assert.equal(one.decor, all.decor, `${size}: the cars do not move when fewer entrances are in use`);
    for (let i = 0; i < one.tiles.length; i++) {
      if (one.tiles[i] !== all.tiles[i]) assert.ok(one.tiles[i] === '#' && all.tiles[i] === 'd');
    }
  }
});

test('the entrances in the bottom wall, which are close to the bottom tills, open last', () => {
  for (const size of SIZES) {
    const { w, h, doors } = makeMap('carpark', size);
    const wallOf = (door) => (door[0] % w === 0 ? 'left' : ((door[0] / w) | 0) === 0 ? 'top' : 'bottom');
    assert.deepEqual(doors.map(wallOf), ['left', 'top', 'left', 'left', 'top', 'bottom', 'bottom'], size);
    // The other designs keep the order they always had.
    assert.deepEqual(makeMap('warehouse', size).doors.map(wallOf), ['left', 'top', 'bottom', 'left', 'left', 'top', 'bottom'], size);
    // Nobody among the first five players starts much nearer a till than the first player does.
    const s = createGame({ map: { design: 'carpark', size } });
    const dist = getDist(s);
    const far = (k) => Math.min(...s.doors[k].map((t) => dist[t]));
    for (let k = 1; k < 5; k++) assert.ok(far(k) >= far(0) * 0.75, `${size}: entrance ${k + 1} is ${far(k)} tiles from a till, the first is ${far(0)}`);
    assert.ok(h > 0);
  }
});

test('a solo player starts about as far from either bank, and no further than on the open warehouse', () => {
  for (const size of SIZES) {
    const s = createGame({ map: { design: 'carpark', size } });
    const [right, bottom] = tillBanks(s).map((bank) => { const d = distTo(s, bank); return Math.min(...s.doors[0].map((t) => d[t])); });
    assert.ok(Math.abs(right - bottom) <= Math.max(2, right * 0.06), `${size}: ${right} tiles to the right-hand tills, ${bottom} to the bottom ones`);
    // The walkway through the rows runs straight from the first entrance to the right-hand tills.
    const open = createGame({ map: { design: 'warehouse', size } });
    const od = getDist(open);
    assert.ok(right <= od[open.doors[0][0]] + 2, `${size}: ${right} tiles, ${od[open.doors[0][0]]} on the open warehouse`);
  }
});

test('walling off either bank of tills is refused, with a reason of its own', () => {
  for (const size of ['xs', 's', 'l']) {
    const s = createGame({ map: { design: 'carpark', size } });
    addPlayer(s, 'Dave');
    s.players[0].cash = 1e6;
    const banks = tillBanks(s);
    for (const bank of banks) {
      const g = createGame({ map: { design: 'carpark', size } });
      addPlayer(g, 'Dave');
      g.players[0].cash = 1e6;
      // A crate on the floor in front of each till in turn: all but the last are fine.
      const fronts = bank.map((t) => (t % g.w === g.w - 1 ? t - 1 : t - g.w));
      fronts.forEach((f, k) => {
        const x = f % g.w, y = (f / g.w) | 0;
        if (k < fronts.length - 1) {
          assert.equal(canPlace(g, 'crate', x, y, 0), null, `${size}: crate ${k + 1} in front of a bank`);
          assert.ok(applyCommand(g, 0, { c: 'place', k: 'crate', x, y }).ok);
        } else {
          assert.equal(canPlace(g, 'crate', x, y, 0), 'bank', `${size}: the last gap in front of a bank`);
          const r = applyCommand(g, 0, { c: 'place', k: 'crate', x, y });
          assert.equal(r.ok, false);
          assert.equal(r.why, 'bank');
          // A wet floor sign does not block anyone, so it may go there.
          assert.equal(canPlace(g, 'wetfloor', x, y, 0), null);
        }
      });
      assert.ok(banksOpen(g));
    }
  }
  // A store with one bank is as it was: sealing part of the bank is allowed, sealing all of it is 'blocked'.
  const o = createGame({ map: { design: 'warehouse', size: 's' } });
  addPlayer(o, 'Dave');
  o.players[0].cash = 1e6;
  const fronts = tillBanks(o)[0].map((t) => t - 1);
  fronts.forEach((f, k) => {
    const r = applyCommand(o, 0, { c: 'place', k: 'crate', x: f % o.w, y: (f / o.w) | 0 });
    if (k < fronts.length - 1) assert.ok(r.ok);
    else assert.equal(r.why, 'blocked');
  });
});

test('shoppers take their refund at whichever bank is nearer, and both count', () => {
  for (const longer of ['right', 'bottom']) {
    const s = createGame({ training: true, map: { design: 'carpark', size: 'xs' } });
    addPlayer(s, 'Dave');
    s.players[0].cash = 1e6;
    const [right, bottom] = tillBanks(s);
    // Make one bank a much longer walk: crates in front of all its tills but the furthest.
    const bank = longer === 'right' ? right : bottom;
    const fronts = bank.map((t) => (longer === 'right' ? t - 1 : t - s.w));
    const d0 = getDist(s);
    fronts.sort((a, b) => d0[a] - d0[b]);
    for (const f of fronts.slice(0, -1)) assert.ok(applyCommand(s, 0, { c: 'place', k: 'crate', x: f % s.w, y: (f / s.w) | 0 }).ok);
    const near = longer === 'right' ? bottom : right;
    const [dn, df] = [near, bank].map((b) => { const d = distTo(s, b); return Math.min(...s.doors[0].map((t) => d[t])); });
    assert.ok(dn < df, `the ${longer} bank is now the longer walk (${df} against ${dn})`);

    queueTrainingWave(s, [{ k: 'hunter', n: 3, gap: 1, at: 0 }]);
    applyCommand(s, 0, { c: 'start' });
    const got = [];
    for (let i = 0; i < 3000 && got.length < 3; i++) {
      for (const e of step(s)) if (e.e === 'escape') got.push(e);
    }
    assert.equal(got.length, 3, 'all three reached a till');
    for (const e of got) {
      const t = (e.y | 0) * s.w + (e.x | 0);
      assert.ok(near.includes(t), `refund taken at ${e.x | 0},${e.y | 0}, which is not in the nearer bank`);
    }
  }
});

test('the cars are in the game state, and changing the store in the lobby changes them', () => {
  const s = createGame({ map: { design: 'carpark', size: 's' } });
  assert.equal(s.decor, makeMap('carpark', 's').decor);
  assert.ok(s.decor.includes('c'));
  assert.equal(JSON.parse(JSON.stringify(s)).decor, s.decor);
  const dist = getDist(s);
  for (const door of s.doors) for (const t of door) assert.notEqual(dist[t], UNREACHABLE);
});
