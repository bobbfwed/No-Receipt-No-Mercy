// Checks whether production lines can actually be built on each map: for every section of
// marked floor it tries to lay a full line (Unpacker, belts, Press, belts, Packer, belts, Chute),
// routing the belts by the shortest way over free floor, and reports how many lines fit before
// the "you cannot wall off the tills" rule or lack of room stops it.
// Usage: node tools/line-check.mjs [design] [size]     (default: every design and size)
import {
  createGame, addPlayer, applyCommand, canPlace, getDist, ZONES, MAP_DESIGNS, MAP_SIZES, UNREACHABLE,
} from '../src/sim/index.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Shortest path over empty floor from any tile in `from` to any tile in `to`, as tile indexes. */
function route(s, from, to, used) {
  const prev = new Int32Array(s.w * s.h).fill(-2);
  const goal = new Set(to);
  const queue = [];
  for (const i of from) { prev[i] = -1; queue.push(i); }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (goal.has(i)) { const path = []; for (let t = i; t !== -1; t = prev[t]) path.push(t); return path.reverse(); }
    const x = i % s.w, y = (i / s.w) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= s.w - 1 || ny >= s.h - 1) continue;
      const n = ny * s.w + nx;
      if (prev[n] !== -2 || s.tiles[n] !== '.' || s.grid[n] || used.has(n)) continue;
      prev[n] = i;
      queue.push(n);
    }
  }
  return null;
}

const dirOf = (s, a, b) => (b - a === 1 ? 0 : b - a === s.w ? 1 : b - a === -1 ? 2 : 3);

/** Tries to build one whole line in the section whose patches start at column x0. */
function buildLine(s, x0) {
  const patch = (ch) => { const out = []; for (let i = 0; i < s.zones.length; i++) if (s.zones[i] === ch && Math.abs((i % s.w) - x0 - 1.5) <= 2 && !s.grid[i]) out.push(i); return out; };
  const stops = ['u', 'p', 'k', 'c'].map(patch);
  if (stops.some((t) => !t.length)) return 'no free marked floor';
  let at = stops[0];
  const tiles = [];
  const used = new Set(); // tiles this line already runs over, so it never crosses itself
  for (let leg = 1; leg < 4; leg++) {
    const path = route(s, at, stops[leg].filter((t) => !used.has(t)), used);
    if (!path) return `no way from ${ZONES['upkc'[leg - 1]].name} to ${ZONES['upkc'[leg]].name}`;
    if (leg === 1) tiles.push(...path); else tiles.push(...path.slice(1));
    for (const t of path) used.add(t);
    at = [path[path.length - 1]];
  }
  const kinds = tiles.map((i) => (ZONES[s.zones[i]] && tiles.filter((t) => s.zones[t] === s.zones[i]).pop() === i && i !== tiles[0] ? ZONES[s.zones[i]].kind : 'belt'));
  kinds[0] = 'unpacker';
  // The last tile reached on each kind of floor holds that floor's machine.
  for (let n = 0; n < tiles.length; n++) {
    const i = tiles[n];
    const d = n < tiles.length - 1 ? dirOf(s, i, tiles[n + 1]) : 0;
    const k = kinds[n];
    const why = canPlace(s, k, i % s.w, (i / s.w) | 0, 0);
    if (why) return `${k} refused (${why}) after ${n} of ${tiles.length} tiles`;
    applyCommand(s, 0, { c: 'place', k, x: i % s.w, y: (i / s.w) | 0, d });
  }
  return null;
}

const [designArg, sizeArg] = process.argv.slice(2);
for (const design of designArg ? [designArg] : Object.keys(MAP_DESIGNS)) {
  for (const size of sizeArg ? [sizeArg] : Object.keys(MAP_SIZES)) {
    const s = createGame({ map: { design, size } });
    const players = Math.max(1, MAP_SIZES[size].players);
    for (let p = 0; p < players; p++) addPlayer(s, `P${p}`);
    s.players[0].cash = 1e9;
    let sections = 0, built = 0;
    const fails = [];
    // Two passes: a second line in each section shows whether there is room to grow.
    for (let pass = 0; pass < 2; pass++) {
      for (let x0 = 9; x0 + 3 <= s.w - 4; x0 += 10) {
        if (pass === 0) sections++;
        const why = buildLine(s, x0);
        if (why) fails.push(`pass ${pass + 1} x${x0}: ${why}`); else built++;
      }
    }
    const dist = getDist(s);
    const open = s.doors.slice(0, s.open).every((d) => d.every((t) => dist[t] !== UNREACHABLE));
    console.log(`${design.padEnd(10)} ${size.padEnd(5)} ${players} player(s): ${built} of ${sections * 2} lines built (${sections} sections, two tries each)${open ? '' : '  ENTRANCE CUT OFF'}`);
    for (const f of fails.slice(0, 4)) console.log(`      ${f}`);
  }
}
