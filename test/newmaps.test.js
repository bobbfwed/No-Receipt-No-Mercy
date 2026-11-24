// Tests for the store designs added in version 0.3: the Back Passage (long corridors). Run with:
// node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, canPlace, step, makeMap, getDist, mapSize,
  MAP_SIZES, MAP_DESIGNS, ZONES, UNREACHABLE,
} from '../src/sim/index.js';
import { createDirector, PLACE_BANKS } from '../src/content/director.js';
import { LINES, fill, textOf } from '../src/content/lines.js';

const SIZES = Object.keys(MAP_SIZES);
const NEW = ['corridors'];

/** Walking distance from each entrance (in the order they open) to the nearest till. */
function walks(s) {
  const dist = getDist(s);
  return s.doors.map((door) => Math.min(...door.map((t) => dist[t])));
}

/** The number of '.' tiles: floor that can be built on. */
const floorOf = (s) => [...s.tiles].filter((c) => c === '.').length;

test('the new designs come after the old ones, with names and descriptions', () => {
  assert.deepEqual(Object.keys(MAP_DESIGNS).slice(5, 5 + NEW.length), NEW);
  assert.equal(MAP_DESIGNS.corridors.name, 'The Back Passage');
  for (const k of NEW) assert.ok(MAP_DESIGNS[k].desc.length > 40, k);
});

test('every new design, every size: seven entrances in the outer wall, each opening onto floor and reaching a till', () => {
  for (const design of NEW) for (const size of SIZES) {
    const s = createGame({ map: { design, size } });
    const { w, h } = s;
    assert.deepEqual({ w, h }, mapSize(design, size));
    assert.equal(s.doors.length, 7, `${design} ${size}`);
    const dist = getDist(s);
    for (const door of s.doors) {
      for (const t of door) {
        const x = t % w, y = (t / w) | 0;
        assert.ok(x === 0 || y === 0 || y === h - 1, `${design} ${size}: entrance at ${x},${y} is not in the outer wall`);
        // The two tiles inside it are floor.
        const dx = x === 0 ? 1 : 0, dy = y === 0 ? 1 : y === h - 1 ? -1 : 0;
        for (const k of [1, 2]) assert.equal(s.tiles[(y + dy * k) * w + x + dx * k], '.', `${design} ${size}: inside the entrance at ${x},${y}`);
        assert.notEqual(dist[t], UNREACHABLE, `${design} ${size}: the entrance at ${x},${y} cannot reach the tills`);
      }
    }
    // Every floor tile can be walked to the tills from: nothing is sealed off.
    for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i] === '.') assert.notEqual(dist[i], UNREACHABLE, `${design} ${size}: ${i % w},${(i / w) | 0} is sealed off`);
  }
});

test('marked floor on the new designs: on floor, patches never touching each other, a wall or an entrance', () => {
  for (const design of NEW) for (const size of SIZES) for (const slots of [1, 7]) {
    const s = createGame({ map: { design, size, slots } });
    const { w, h } = s;
    for (const ch of Object.keys(ZONES)) assert.ok(s.zones.includes(ch), `${design} ${size}: no ${ZONES[ch].name}`);
    for (let i = 0; i < s.zones.length; i++) {
      const ch = s.zones[i];
      if (ch === ' ') continue;
      const x = i % w, y = (i / w) | 0;
      assert.equal(s.tiles[i], '.', `${design} ${size}: marked floor at ${x},${y} is not floor`);
      // Nothing solid and no other kind of marked floor anywhere round it, corners included.
      for (let ny = y - 1; ny <= y + 1; ny++) {
        for (let nx = x - 1; nx <= x + 1; nx++) {
          const j = ny * w + nx;
          assert.notEqual(s.tiles[j], '#', `${design} ${size}: ${ZONES[ch].name} at ${x},${y} touches a wall`);
          assert.ok(s.zones[j] === ' ' || s.zones[j] === ch, `${design} ${size}: ${ZONES[ch].name} at ${x},${y} touches other marked floor`);
        }
      }
    }
    // Clear of every entrance (open or shut): nothing within a tile of one, nor in the two rows in
    // front of one in the top or bottom wall; and clear of the two tiles in front of every till.
    for (const door of s.doors) {
      for (const t of door) {
        const tx = t % w, ty = (t / w) | 0, deep = ty === 0 || ty === h - 1 ? 2 : 1;
        for (let y = ty - deep; y <= ty + deep; y++) {
          for (let x = tx - 1; x <= tx + 1; x++) if (x >= 0 && y >= 0 && x < w && y < h) assert.equal(s.zones[y * w + x], ' ', `${design} ${size}: marked floor in front of the entrance at ${tx},${ty}`);
        }
      }
    }
    for (let i = 0; i < s.tiles.length; i++) {
      if (s.tiles[i] !== 'T') continue;
      for (const k of [1, 2]) assert.equal(s.zones[i - k], ' ', `${design} ${size}: marked floor in front of a till`);
    }
  }
});

test('the new designs are the same every time, however many entrances are in use', () => {
  for (const design of NEW) for (const size of SIZES) {
    assert.deepEqual(makeMap(design, size), makeMap(design, size));
    const one = makeMap(design, size, 1), all = makeMap(design, size, 7);
    assert.equal(one.decor, all.decor);
    for (let i = 0; i < one.tiles.length; i++) {
      if (one.tiles[i] !== all.tiles[i]) assert.ok(one.tiles[i] === '#' && all.tiles[i] === 'd');
    }
  }
});

test('the first entrance is no more than 30% further from the tills than on the Open Warehouse', () => {
  for (const design of NEW) for (const size of SIZES) {
    const here = walks(createGame({ map: { design, size } }))[0];
    const open = walks(createGame({ map: { design: 'warehouse', size } }))[0];
    assert.ok(here <= open * 1.3, `${design} ${size}: ${here} tiles, ${open} on the Open Warehouse`);
  }
});

test('every entrance is between 0.7 and 1.3 times as far from the tills as the first one', () => {
  for (const design of NEW) for (const size of SIZES) {
    const d = walks(createGame({ map: { design, size } }));
    for (let k = 1; k < d.length; k++) assert.ok(d[k] >= d[0] * 0.7 && d[k] <= d[0] * 1.3, `${design} ${size}: entrance ${k + 1} is ${d[k]} tiles away, the first ${d[0]}`);
  }
});

test('canPlace still refuses walling in an entrance or the tills', () => {
  for (const design of NEW) for (const size of ['xs', 's', 'l']) {
    // The tills: a crate in front of every till but the last is fine; the last is refused.
    const g = createGame({ map: { design, size } });
    addPlayer(g, 'Dave');
    g.players[0].cash = 1e6;
    const fronts = [];
    for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === 'T') fronts.push(i - 1);
    fronts.forEach((f, k) => {
      const x = f % g.w, y = (f / g.w) | 0;
      const r = applyCommand(g, 0, { c: 'place', k: 'crate', x, y });
      if (k < fronts.length - 1) assert.ok(r.ok, `${design} ${size}: crate ${k + 1} in front of the tills`);
      else assert.equal(r.why, 'blocked', `${design} ${size}: the last gap in front of the tills`);
    });
    // Each entrance, open or still shut: a crate on one of the two tiles inside it is fine, on the
    // second it is refused.
    for (const d of [0, 3]) {
      const s = createGame({ map: { design, size } });
      addPlayer(s, 'Dave');
      s.players[0].cash = 1e6;
      const [a, b] = s.doors[d].map((t) => t + 1);
      assert.equal(canPlace(s, 'crate', a % s.w, (a / s.w) | 0, 0), null, `${design} ${size}: one tile inside entrance ${d + 1}`);
      assert.ok(applyCommand(s, 0, { c: 'place', k: 'crate', x: a % s.w, y: (a / s.w) | 0 }).ok);
      assert.equal(canPlace(s, 'crate', b % s.w, (b / s.w) | 0, 0), 'blocked', `${design} ${size}: walling in entrance ${d + 1}`);
    }
  }
});

test('a few sales events with nothing built end the same on a fresh state and on its copy made mid-wave', () => {
  for (const design of NEW) {
    const s = createGame({ seed: 9, map: { design, size: 's' } });
    addPlayer(s, 'Dave');
    const run = (g, ticks) => {
      for (let t = 0; t < ticks && g.phase !== 'lost' && g.phase !== 'won'; t++) {
        if (g.phase === 'build') applyCommand(g, 0, { c: 'start' });
        step(g);
      }
    };
    run(s, 2500);
    assert.ok(s.wave >= 1);
    const copy = JSON.parse(JSON.stringify(s));
    run(s, 9000);
    run(copy, 9000);
    assert.ok(s.wave >= 3, `${design}: reached sales event ${s.wave}`);
    assert.equal(JSON.stringify(copy), JSON.stringify(s), design);
  }
});

// ---------------------------------------------------------------- the Back Passage

/** The rows of the Back Passage's walls (rows that are mostly wall), and its corridor of each row. */
function corridorsOf(s) {
  const wallRow = [];
  for (let y = 1; y < s.h - 1; y++) {
    let n = 0;
    for (let x = 1; x < s.w - 1; x++) if (s.tiles[y * s.w + x] === '#') n++;
    wallRow[y] = n > (s.w - 2) / 2;
  }
  const band = [];
  for (let y = 1, k = 0; y < s.h - 1; y++) {
    if (wallRow[y]) { if (!wallRow[y - 1]) k++; band[y] = -1; } else band[y] = k;
  }
  return { wallRow, band, count: Math.max(...band.filter((b) => b >= 0)) + 1 };
}

test('the Back Passage is long corridors: walls right across, few openings, more corridors on bigger stores', () => {
  let last = 0;
  for (const size of SIZES) {
    const s = createGame({ map: { design: 'corridors', size } });
    const { wallRow, count } = corridorsOf(s);
    assert.ok(count >= 3, `${size}: ${count} corridors`);
    assert.ok(count >= last, `${size}: fewer corridors than the size below`);
    last = count;
    const sections = Math.floor((s.w - 4 - 3 - 9) / 10) + 1;
    for (let y = 1; y < s.h - 1; y++) {
      if (!wallRow[y]) continue;
      // The wall leaves a hall three wide at each end, and its openings are few.
      const row = s.tiles.slice(y * s.w, (y + 1) * s.w);
      assert.equal(row.slice(1, 4), '...', `${size}: the hall in front of the entrances, row ${y}`);
      const gaps = row.slice(4, s.w - 4).split(/#+/).filter(Boolean).length;
      assert.ok(gaps >= 1 && gaps <= Math.ceil(sections / 2), `${size}: ${gaps} openings in the wall in row ${y}`);
      const longest = Math.max(...row.slice(4, s.w - 4).split('.').map((r) => r.length));
      assert.ok(longest >= 10, `${size}: the longest stretch of wall in row ${y} is ${longest}`);
    }
  }
  assert.ok(last >= 9, 'the biggest store has plenty of corridors');
});

test('in the Back Passage the four kinds of marked floor of a section are in different corridors', () => {
  for (const size of SIZES) {
    const s = createGame({ map: { design: 'corridors', size } });
    const { band, count } = corridorsOf(s);
    for (let x0 = 9; x0 + 3 <= s.w - 4; x0 += 10) {
      const at = {};
      for (let y = 1; y < s.h - 1; y++) for (let x = x0; x < x0 + 4; x++) if (s.zones[y * s.w + x] !== ' ') at[s.zones[y * s.w + x]] = band[y];
      assert.deepEqual(Object.keys(at).sort(), ['c', 'k', 'p', 'u'], `${size} x${x0}`);
      if (count === 3) {
        assert.ok(at.u !== at.p && at.c !== at.k && at.u !== at.c, `${size} x${x0}: ${JSON.stringify(at)}`);
      } else {
        assert.equal(new Set(Object.values(at)).size, 4, `${size} x${x0}: ${JSON.stringify(at)}`);
        // ...one corridor after another, so every belt goes through just one wall.
        assert.equal(Math.abs(at.u - at.p) + Math.abs(at.p - at.k) + Math.abs(at.k - at.c), 3, `${size} x${x0}`);
      }
    }
  }
});

test('DEB has lines of her own for the doors opening on each new design, about a third of the time, and nowhere else', () => {
  const seeded = (seed) => { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), t | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
  const openings = (design, seed) => {
    const state = createGame({ map: { design, size: 'm' } });
    addPlayer(state, 'Dave');
    addPlayer(state, 'Steve');
    const said = [];
    for (let wave = 1; wave <= 30; wave++) {
      state.wave = wave;
      state.tick += 200 * 30;
      const director = createDirector(seeded(seed * 100 + wave));
      for (const m of director.handle([{ e: 'waveStart', wave, kinds: [], supers: [], dads: 0 }], state)) if (m.t === 'say') said.push(m.text);
    }
    return said;
  };
  for (const [design, key] of Object.entries(PLACE_BANKS)) {
    assert.ok(NEW.includes(design), design);
    const bank = LINES[key];
    assert.ok(bank.length >= 8 && bank.length <= 12, `${key} has ${bank.length} lines`);
    const own = new Set();
    for (const name of ['Dave', 'Steve']) for (const l of bank) for (let w = 1; w <= 30; w++) own.add(fill(textOf(l), { p: name, w }));
    for (const other of ['warehouse', 'showroom', 'aisles', 'food', 'carpark', ...NEW.filter((d) => d !== design)]) {
      assert.deepEqual(openings(other, 23).filter((t) => own.has(t)), [], `${key} on ${other}`);
    }
    const there = openings(design, 23);
    const n = there.filter((t) => own.has(t)).length;
    assert.equal(there.length, 30);
    assert.ok(n >= 5 && n <= 18, `${n} of 30 openings on ${design} were its own`);
  }
  assert.deepEqual(Object.keys(PLACE_BANKS).sort(), [...NEW].sort());
});
