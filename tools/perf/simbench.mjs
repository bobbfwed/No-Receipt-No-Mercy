// Simulation cost on saved states (stutter investigation, 2026-11-26): milliseconds per step, the
// worst steps, the worst frame at each game speed (a frame runs several steps at 2x-5x), the first
// step after a state is loaded (a client adopting a full copy: every path map is worked out again,
// since they are cached per state object), and the checksum.
// Usage: node tools/perf/simbench.mjs [--states=e08,e11,e13,e16,e20,stress] [--secs=20] [--runs=5]
//   stress: the e16 state with every shopper copied three more times (4x the crowd)
import { readFileSync } from 'node:fs';
import { step, getField, NORMAL, TICK_HZ, canPlace } from '../../src/sim/index.js';
import { checksum } from '../../src/net/session.js';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const dir = arg('dir', 'tools/perf/out/states');
const secs = Number(arg('secs', 20));
const runs = Number(arg('runs', 5));
const hr = () => Number(process.hrtime.bigint()) / 1e6;
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r3 = (v) => +v.toFixed(3);

export function stress(state, times = 4) {
  const base = state.shoppers.slice();
  for (let k = 1; k < times; k++) {
    for (const s of base) {
      const c = JSON.parse(JSON.stringify(s));
      c.id = state.nextId++;
      for (let t = 0; t < 8; t++) {
        const nx = s.x + ((t * 7 + k * 3) % 5 - 2) * 0.6, ny = s.y + ((t * 3 + k * 5) % 5 - 2) * 0.6;
        const i = (ny | 0) * state.w + (nx | 0);
        if (nx > 0 && ny > 0 && nx < state.w && ny < state.h && state.tiles[i] !== '#' && !state.grid[i]) { c.x = nx; c.y = ny; break; }
      }
      state.shoppers.push(c);
    }
  }
  return state;
}

const load = (name) => name === 'stress' ? stress(JSON.parse(readFileSync(`${dir}/e16.json`, 'utf8'))) : JSON.parse(readFileSync(`${dir}/${name}.json`, 'utf8'));

const rows = [];
for (const name of arg('states', 'e08,e11,e13,e16,e20,stress').split(',')) {
  const raw = JSON.stringify(load(name));
  const times = [], cold = [];
  let shoppers = 0;
  for (let r = 0; r < runs; r++) {
    const s = JSON.parse(raw);
    shoppers = s.shoppers.length;
    // The first step on a fresh state object: the path maps are worked out again.
    const a = hr(); step(s); cold.push(hr() - a);
    for (let i = 0; i < secs * TICK_HZ && s.phase === 'wave'; i++) { const b = hr(); step(s); times.push(hr() - b); }
  }
  // A frame at speed k runs about k/2 steps (60 frames a second, 30 steps a second at 1x), up to
  // ceil(k * 16 / 33.3): the worst frame is the worst run of that many steps in a row.
  const worstFrame = (k) => { const n = Math.ceil((k * 16) / (1000 / TICK_HZ)); let w = 0; for (let i = 0; i + n <= times.length; i++) { let t = 0; for (let j = 0; j < n; j++) t += times[i + j]; w = Math.max(w, t); } return r3(w); };
  const s = JSON.parse(raw);
  const c = []; for (let i = 0; i < 200; i++) { const a = hr(); checksum(s); c.push(hr() - a); }
  const f = []; for (let i = 0; i < 50; i++) { const a = hr(); s.gridVer++; getField(s, NORMAL); f.push(hr() - a); }
  // What the placement preview asks every frame while a blocking building is held over open floor.
  let tile = -1; for (let i = s.w * 2; i < s.grid.length; i++) if (!s.grid[i] && s.tiles[i] === '.') { tile = i; break; }
  const p = []; s.players[0].cash = 1e6;
  for (let i = 0; i < 50; i++) { const a = hr(); canPlace(s, 'crate', tile % s.w, (tile / s.w) | 0, 0); p.push(hr() - a); }
  rows.push({
    state: name, shoppers, stepMean: r3(times.reduce((x, y) => x + y, 0) / times.length), stepP99: r3(pct(times, 0.99)), stepMax: r3(Math.max(...times)),
    cold: r3(pct(cold, 0.5)), frame1x: worstFrame(1), frame2x: worstFrame(2), frame3x: worstFrame(3), frame5x: worstFrame(5),
    perSec1x: r3((times.reduce((x, y) => x + y, 0) / times.length) * TICK_HZ), perSec5x: r3((times.reduce((x, y) => x + y, 0) / times.length) * TICK_HZ * 5),
    checksum: r3(pct(c, 0.5)), pathMap: r3(pct(f, 0.5)), canPlaceCrate: r3(pct(p, 0.5)),
  });
}
console.table(rows);
