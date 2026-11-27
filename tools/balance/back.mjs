// The Back for the scripted players of tools/balance.mjs (0.4, stage 7): supply lines from the
// Returns Drops to the security buildings, laid only with real commands (`place`, `remove` and
// `rotate` with `f: 1`, through applyCommand), so the bots play by the same rules as a person.
//
// The shape of what it builds, kept simple rather than clever:
//  - A "cell" at each Returns Drop: a Splitter on the tile in front of the drop shares its junk among
//    three machines, on its left, its right and in front of it (the drop is turned first if the cell
//    fits better another way). Each machine's product runs along a short private stretch of belt,
//    where Rebranders can be put in later (raise()).
//  - Two of the machines (Bottled Spite and Rage Cola, or whatever the bot asks for) join one belt,
//    the drop's main "bus", which visits the buildings it serves one after the other and ends in a
//    Clearance Bin. At each building an Unpaid Intern stands between the bus and a Dumbwaiter and
//    takes whatever that building wants, so one Intern serves both supplies. The bin keeps the bus
//    moving: a supply nobody on it wants right now is sold for pennies instead of blocking the ones
//    behind it.
//  - The third machine, the Barb Bender, has a bus of its own for the buildings that carry Razor
//    Wire. It ends at its last Intern, with no bin: when they are all full it backs up and the
//    Bender stops, so the Splitter gives its junk to the other two. (On a shared bus every building
//    would take six units of wire first, since any security building accepts it, wired or not.)
//  - A building joins the nearest drop's buses when it is built: a breadth-first search over The
//    Back's free floor from the bus's end to a tile from which an Intern can reach the building (a
//    main bus's bin is taken up and put down again after the new stretch). Failing that, a branch: a
//    Splitter put into a straight stretch of the bus sends part of what passes down a new belt to
//    the building, which ends in a bin of its own on a main bus. The search may cross another bus's
//    straight belt with an Overpass (that belt is taken up and the Overpass put in its place). Tiles
//    under the maze's planned security buildings are kept clear, since a security building cannot go
//    over a part of The Back.
import { applyCommand, buildPrice, footprint, DIRS } from '../../src/sim/index.js';

/** The machine that makes each supply (by the track it stocks). */
export const MACHINE = { dmg: 'still', spd: 'cannery', rng: 'spooler', dur: 'winder', wire: 'bender' };
export const SUPPLIES = ['dmg', 'spd', 'rng', 'dur', 'wire'];

const LEFT = (d) => (d + 3) & 3, RIGHT = (d) => (d + 1) & 3;

export class Backroom {
  /**
   * @param s the game state (read only; every change goes through applyCommand)
   * @param {number} pid the player who pays
   * @param {object} o
   *   reserved   tiles that must stay clear (under the maze's planned security buildings)
   *   prefix     how many Rebranders each machine's private stretch can take later (raise())
   *   main       the two supplies of each drop's main bus (the third machine makes Razor Wire)
   *   comb       (the greedy player) Rebranders in parallel on each main bus, before its first
   *              building: [n1, n2, n3] Rebranders for each step up (see planComb), or none
   *   fences     walls of fence posts, [{x, ys}] (the wall's column and the posts' rows): each gets a
   *              "wire lane", a straight belt down the column beside the wall with a Splitter level
   *              with each post, which hands Razor Wire sideways into the post's Dumbwaiter. Planned
   *              before the cells, so nothing else can cut it off.
   */
  constructor(s, pid, { reserved = new Set(), prefix = 0, main = ['dmg', 'spd'], fences = [], comb = null } = {}) {
    this.s = s;
    this.pid = pid;
    this.reserved = reserved;
    this.prefix = prefix;
    this.main = main;
    this.cellTiles = new Set(); // every tile the cells will take, built or not
    this.noBelt = new Set(); // free tiles something points into: a belt there would be fed by it
    this.info = new Map(); // bus tile -> { bus, inD, outD, tap, end, fixed, kind }
    this.cells = [];
    this.wanted = new Map(); // anchor -> the supplies the bot wants it to have
    this.log = { parts: {}, failed: 0, crossings: 0, raised: 0, branches: 0, why: {} };
    this.drops = s.back.map((p, i) => (p && p.k === 'drop' ? i : -1)).filter((i) => i >= 0);
    this.lanes = [];
    for (const f of fences) this.planLane(f.x, f.ys);
    for (const di of this.drops) this.planCell(di);
    if (comb) for (const c of this.cells) this.planComb(c, comb);
    // Walls-only distance from each cell, to give a building to the nearest drop.
    for (const c of this.cells) c.dist = this.flood(c.split);
  }

  // ------------------------------------------------------------------ geometry helpers
  nb(i, d) {
    const { w, h } = this.s;
    const x = (i % w) + DIRS[d][0], y = ((i / w) | 0) + DIRS[d][1];
    return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
  }
  wall(i) { return i < 0 || this.s.tiles[i] === '#'; }
  /** A tile a new part may go on: empty in The Back, not a wall, not kept clear. */
  free(i) { return i >= 0 && !this.wall(i) && !this.s.back[i] && !this.reserved.has(i) && !this.cellTiles.has(i); }
  dirTo(a, b) {
    const w = this.s.w;
    const dx = (b % w) - (a % w), dy = ((b / w) | 0) - ((a / w) | 0);
    return DIRS.findIndex(([x, y]) => x === dx && y === dy);
  }
  flood(from) {
    const n = this.s.tiles.length, d = new Int32Array(n).fill(-1);
    d[from] = 0;
    const q = [from];
    for (let k = 0; k < q.length; k++) {
      for (let e = 0; e < 4; e++) {
        const t = this.nb(q[k], e);
        if (t < 0 || d[t] >= 0 || this.wall(t)) continue;
        d[t] = d[q[k]] + 1;
        q.push(t);
      }
    }
    return d;
  }

  /**
   * Works out (does not build) the cell at drop di. In the drop's own frame, v forward (the way the
   * drop faces; v = 0 is the tile in front of it), u across, with P Rebranders' room (prefix):
   *   the Splitter (0,0);
   *   main machines B (1,0) and E (0,1), facing forward, their stretches in columns 1 and 0 up to row
   *     R = P + 1; the main bus along row R + 1 from u = 0 to 1, its bin at u = 2;
   *   the Barb Bender W (-1,0) facing -u, its stretch in column -2 from row 0 to P (forward); its bus
   *     goes on from there.
   * Tried with u either way across, then with the drop turned the other ways (anyone may turn a
   * Returns Drop: the bot does so when it builds the cell), then with less room for Rebranders.
   */
  planCell(di) {
    const s = this.s, D = s.back[di].d | 0;
    for (let P = this.prefix; P >= 0; P--) for (const F of [D, (D + 1) & 3, (D + 3) & 3, (D + 2) & 3]) {
      for (const U of [RIGHT(F), LEFT(F)]) {
        const at = ([u, v]) => {
          let i = di;
          for (let n = 0; n < v + 1; n++) { i = this.nb(i, F); if (i < 0) return -1; }
          const side = u < 0 ? (U + 2) & 3 : U;
          for (let n = 0; n < Math.abs(u); n++) { i = this.nb(i, side); if (i < 0) return -1; }
          return i;
        };
        const R = P + 1;
        const tiles = [];
        const add = (p) => { const t = at(p); tiles.push(t); return t; };
        const col = (u, from, to) => { const out = []; for (let v = from; v <= to; v++) out.push(add([u, v])); return out; };
        const split = add([0, 0]);
        const slots = [
          { supply: this.main[0], tile: add([1, 0]), d: F, chain: col(1, 1, R) },
          { supply: this.main[1], tile: add([0, 1]), d: F, chain: col(0, 2, R) },
          { supply: 'wire', tile: add([-1, 0]), d: (U + 2) & 3, chain: col(-2, 0, P) },
        ];
        const row = [add([0, R + 1]), add([1, R + 1])];
        const bin = add([2, R + 1]);
        const face = add([-2, P + 1]); // where the wire stretch points until its bus is laid
        if (tiles.some((t) => t < 0 || !this.free(t))) continue;
        for (const t of tiles) this.cellTiles.add(t);
        // (The bin's tile and the tile the wire stretch points at are for the buses to use.)
        this.cellTiles.delete(bin);
        this.cellTiles.delete(face);
        this.noBelt.add(face);
        const wireStart = slots[2].chain.pop();
        for (const sl of slots) Object.assign(sl, { built: false, raised: 0, on: false });
        const c = { drop: di, F, U, P, split, slots, row, built: false };
        c.main = { cell: c, wire: false, tiles: row.slice(), binAt: bin, pending: [], served: new Map(), failed: new Set() };
        c.wire = { cell: c, wire: true, tiles: [wireStart], binAt: -1, face, pending: [], served: new Map(), failed: new Set() };
        this.cells.push(c);
        return;
      }
    }
  }

  /**
   * Works out (does not build) the wire lane for a wall of fence posts in column x, posts on rows
   * ys: the column beside the wall (whichever side is clear from the first post's row to the last's),
   * a Splitter on each post's row; the tile beyond each Splitter's far side is kept empty.
   */
  planLane(x, ys) {
    const lo = Math.min(...ys), hi = Math.max(...ys), w = this.s.w;
    for (const dx of [1, -1]) {
      const lx = x + dx;
      if (lx < 0 || lx >= w) continue;
      // (One plain belt past each end post where the floor allows, so the lane can be entered there:
      // a Splitter only takes from behind.)
      const tiles = [];
      for (let y = lo - 1; y <= hi + 1; y++) if (y >= 0 && y < this.s.h && !this.wall(y * w + lx)) tiles.push(y * w + lx);
      const far = ys.map((y) => y * w + lx + dx);
      if (tiles.some((i) => !this.free(i))) continue;
      for (const i of tiles) this.cellTiles.add(i);
      for (const i of far) if (i >= 0 && !this.wall(i)) this.noBelt.add(i);
      // (Each end, in case the lane is fed from the other: kept clear of other belts too.)
      for (const i of [tiles[0] - w, tiles[tiles.length - 1] + w]) if (i >= 0 && i < this.s.tiles.length && !this.wall(i)) this.noBelt.add(i);
      this.lanes.push({ x, dx, tiles, posts: new Set(ys.map((y) => y * w + x)), splits: new Set(ys.map((y) => y * w + lx)), on: false, built: false });
      return;
    }
  }

  /**
   * (The greedy player.) Works out a "comb" for cell c's main bus: Rebranders side by side, so that
   * everything on the bus comes out Platinum at the rate the drop's junk allows. Rows run east, in
   * a free rectangle as near the cell as there is one: row 0 the belt in, a dead end; row 1 Unpaid
   * Interns facing south, each taking what the Rebrander below him wants from the belt above; row 2
   * the first step's Rebranders, facing south onto row 3, a belt that is the next step's way in; and
   * so on for each step, the last belt (row 3 x steps) being where the bus goes on to the buildings.
   * Step k has widths[k] Rebranders, from the west end. Each dead end points at a tile kept empty.
   */
  planComb(c, widths) {
    const s = this.s, w = s.w, h = s.h;
    const steps = widths.length, wide = Math.max(...widths) + 1, high = 3 * steps + 1;
    const from = this.flood(c.main.binAt);
    // (Every bus's bin and the tile a wire stretch points at are the buses' to use.)
    const busy = new Set(this.cells.flatMap((x) => [x.main.binAt, x.wire.face]));
    let best = null;
    // Any of four ways round: rows running east or west (sx), steps going south or north (sy).
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      for (let y0 = 0; y0 < h; y0++) {
        for (let x0 = 0; x0 < w; x0++) {
          const at = (x, y) => {
            const X = x0 + sx * x, Y = y0 + sy * y;
            return X < 0 || Y < 0 || X >= w || Y >= h ? -1 : Y * w + X;
          };
          const tiles = [];
          for (let y = 0; y < high; y++) for (let x = 0; x <= wide; x++) tiles.push(at(x, y));
          const entry = at(-1, 0);
          if (entry < 0 || busy.has(entry) || !this.free(entry)) continue;
          if (!tiles.every((i) => i >= 0 && this.free(i) && !this.noBelt.has(i) && !busy.has(i))) continue;
          const d = from[entry];
          if (d >= 0 && (!best || d < best.d)) best = { d, at };
        }
      }
      if (best) best.sx = best.sx || sx, best.sy = best.sy || sy;
    }
    if (process.env.BACKDEBUG) console.log('comb for drop', c.drop % w, (c.drop / w) | 0, best ? 'found' : 'NO ROOM');
    if (!best) return;
    const { at } = best;
    // (Directions from the tiles themselves: the way the rows run, and the way the steps go.)
    const rowD = this.dirTo(at(0, 0), at(1, 0)), stepD = this.dirTo(at(0, 0), at(0, 1));
    const parts = []; // [kind, tile, facing], in the order to lay them
    for (let k = 0; k < steps; k++) {
      const n = widths[k], top = 3 * k;
      // The belt in (a dead end), as long as this step's Interns and the last step's Rebranders reach.
      const len = Math.max(n, k ? widths[k - 1] : 1);
      for (let x = 0; x < len; x++) parts.push(['conv', at(x, top), rowD]);
      this.noBelt.add(at(len, top));
      for (let x = 0; x < n; x++) parts.push(['intern', at(x, top + 1), stepD], ['rebrand', at(x, top + 2), stepD]);
    }
    // The last belt: under the last step, and one tile on, where the bus goes on.
    const out = [];
    for (let x = 0; x <= widths[steps - 1]; x++) out.push(at(x, 3 * steps));
    for (const [, i] of parts) this.cellTiles.add(i);
    for (const i of out) this.cellTiles.add(i);
    c.comb = { first: at(0, 0), parts, out, rowD, laid: false };
  }

  /** Lays cell c's comb and the main bus's stretch to it. 'ok', 'cash' or 'none'. */
  layComb(c) {
    const cb = c.comb, bus = c.main, s = this.s;
    // From the end of the main bus to the comb's way in (its first belt counts as the goal).
    this.cellTiles.delete(cb.first);
    const found = this.search(bus, new Map([[cb.first, { I: -1, d: 0 }]]), false, true);
    this.cellTiles.add(cb.first);
    if (!found) return 'none';
    const ts = found.path.map((p) => p.t);
    ts.pop(); // (the comb's own first belt is laid with the comb)
    let cost = cb.parts.reduce((n, [k]) => n + this.price(k), 0) + this.price('conv') * (ts.length + cb.out.length);
    for (const p of found.path) if (p.over) cost += this.price('over');
    if (this.cash() < cost) return 'cash';
    const end = bus.tiles[bus.tiles.length - 1];
    if (bus.binAt >= 0) this.take(bus.binAt);
    bus.binAt = -1;
    const chain = [end, ...ts, cb.first];
    for (let n = 0; n < chain.length - 1; n++) {
      const x = chain[n], d = this.dirTo(x, chain[n + 1]);
      if (n && found.path[n - 1].over) { this.take(x); this.place('over', x, 0); this.info.get(x).kind = 'over'; continue; }
      this.place('conv', x, d);
      const inf = this.info.get(x) || {};
      this.info.set(x, { ...inf, bus, inD: n ? this.dirTo(chain[n - 1], x) : inf.inD, outD: d, end: false, fixed: true });
    }
    for (const [k, i, d] of cb.parts) this.place(k, i, d);
    cb.out.forEach((i, n) => {
      this.place('conv', i, cb.rowD);
      this.info.set(i, { bus, inD: cb.rowD, outD: cb.rowD, fixed: n < cb.out.length - 1, end: n === cb.out.length - 1 });
    });
    bus.tiles = cb.out.slice();
    cb.laid = true;
    return 'ok';
  }

  /** Tiles the cells will take (so the shop floor's plan can stay off them). */
  get keepClear() { return this.cellTiles; }

  // ------------------------------------------------------------------ wanting
  /**
   * Building on anchor tile ai should get `supply`. Every building is served by its nearest drop
   * (Razor Wire by that drop's wire bus, everything else by its main bus, if it makes it). This
   * switches the machine on and puts the building on the bus. Asking twice does nothing.
   */
  want(ai, supply) {
    if (!this.wanted.has(ai)) this.wanted.set(ai, new Set());
    this.wanted.get(ai).add(supply);
    let c = this.cells.find((x) => [x.main, x.wire].some((b) => b.served.has(ai) || b.pending.includes(ai) || b.failed.has(ai)));
    if (!c) {
      let bd = Infinity;
      for (const x of this.cells) if (x.dist[ai] >= 0 && x.dist[ai] < bd) { bd = x.dist[ai]; c = x; }
    }
    if (!c) return;
    const sl = c.slots.find((x) => x.supply === supply);
    if (!sl) return;
    sl.on = true;
    // A fence post with a wire lane: the lane serves it, and the wire bus goes to the lane.
    const lane = supply === 'wire' && this.lanes.find((l) => l.posts.has(ai));
    if (lane) {
      if (!lane.on) { lane.on = true; lane.cell = c; c.wire.pending.push(lane); }
      return;
    }
    const bus = supply === 'wire' ? c.wire : c.main;
    if (!bus.served.has(ai) && !bus.pending.includes(ai) && !bus.failed.has(ai)) bus.pending.push(ai);
  }

  /** Every building served, with the supplies it is meant to get that reach it: Map ai -> Set. */
  servedMap() {
    const m = new Map();
    for (const c of this.cells) {
      for (const bus of [c.main, c.wire]) {
        for (const ai of bus.served.keys()) {
          if (!m.has(ai)) m.set(ai, new Set());
          for (const sl of c.slots) if (sl.built && (sl.supply === 'wire') === bus.wire && (this.wanted.get(ai) || new Set()).has(sl.supply)) m.get(ai).add(sl.supply);
        }
      }
    }
    return m;
  }

  // ------------------------------------------------------------------ building
  cmd(c) {
    const r = applyCommand(this.s, this.pid, c);
    if (r.ok && c.c === 'place') this.log.parts[c.k] = (this.log.parts[c.k] || 0) + 1;
    if (r.ok && c.c === 'remove' && this.log.parts[this.lastRemoved]) this.log.parts[this.lastRemoved]--;
    return r.ok;
  }
  cash() { return this.s.players[this.pid].cash; }
  price(k) { return buildPrice(this.s, k); }
  place(k, i, d) { return this.cmd({ c: 'place', k, x: i % this.s.w, y: (i / this.s.w) | 0, d, f: 1 }); }
  take(i) {
    const p = this.s.back[i];
    this.lastRemoved = p && p.k;
    return this.cmd({ c: 'remove', x: i % this.s.w, y: (i / this.s.w) | 0, f: 1 });
  }

  /**
   * Does what it can afford, cell by cell: the Splitter, a machine and its stretch for each supply
   * wanted, the start of the main bus, then the buses out to each building waiting. Stops at the
   * first thing it cannot pay for, so cash is not spread thinly.
   */
  work() {
    for (const c of this.cells) {
      if (!c.slots.some((sl) => sl.on)) continue;
      if (!c.built) {
        if (this.cash() < this.price('split')) return;
        // (Turn the drop to face the cell, a quarter turn at a time: free.)
        for (let n = 0; n < 4 && (this.s.back[c.drop].d | 0) !== c.F; n++) {
          this.cmd({ c: 'rotate', x: c.drop % this.s.w, y: (c.drop / this.s.w) | 0, f: 1 });
        }
        this.place('split', c.split, c.F);
        c.built = true;
      }
      for (const sl of c.slots) {
        if (!sl.on || sl.built) continue;
        const wire = sl.supply === 'wire';
        const tiles = wire ? [...sl.chain, c.wire.tiles[0]] : sl.chain;
        // The main bus's first row and bin come with its first machine.
        const first = !wire && !c.slots.some((x) => x.built && x.supply !== 'wire');
        const cost = this.price(MACHINE[sl.supply]) + tiles.length * this.price('conv') + (first ? 2 * this.price('conv') + this.price('bin') : 0);
        if (this.cash() < cost) return;
        this.place(MACHINE[sl.supply], sl.tile, sl.d);
        for (const t of tiles) this.place('conv', t, c.F);
        if (wire) this.info.set(c.wire.tiles[0], { bus: c.wire, inD: c.F, outD: c.F, end: true, fixed: true });
        if (first) {
          c.row.forEach((t, n) => {
            this.place('conv', t, c.U);
            this.info.set(t, { bus: c.main, inD: n ? c.U : c.F, outD: c.U, fixed: true, end: n === c.row.length - 1 });
          });
          this.place('bin', c.main.binAt, 0);
        }
        sl.built = true;
      }
      // (The greedy player: the main bus goes through its comb of Rebranders before any building.)
      if (c.comb && !c.comb.laid && c.slots.some((sl) => sl.built && sl.supply !== 'wire')) {
        const r = this.layComb(c);
        if (r === 'cash') return;
        if (r !== 'ok') c.comb = null;
      }
      for (const bus of [c.main, c.wire]) {
        if (!c.slots.some((sl) => sl.built && (sl.supply === 'wire') === bus.wire)) continue;
        if (!bus.wire && c.comb && !c.comb.laid) continue;
        while (bus.pending.length) {
          const ai = bus.pending[0];
          if (typeof ai === 'object') {
            const r = this.connect(bus, ai);
            if (r === 'cash') return;
            bus.pending.shift();
            if (r !== 'ok') { this.log.failed++; this.log.why['lane: ' + r] = (this.log.why['lane: ' + r] || 0) + 1; }
            continue;
          }
          const b = this.s.grid[ai];
          if (!b || b.part !== undefined) {
            // Not standing (wrecked, or not built yet): try the others first.
            if (bus.pending.length > 1) bus.pending.push(bus.pending.shift());
            break;
          }
          const r = this.extend(bus, ai);
          if (r === 'cash') return;
          bus.pending.shift();
          if (r !== 'ok') {
            bus.failed.add(ai);
            this.log.failed++;
            this.log.why[r] = (this.log.why[r] || 0) + 1;
            if (process.env.BACKDEBUG) console.log('no line to', b.k, ai % this.s.w, (ai / this.s.w) | 0, bus.wire ? 'wire' : 'main', 'from drop', c.drop % this.s.w, (c.drop / this.s.w) | 0, r, 'event', this.s.wave);
          }
        }
      }
    }
  }

  /** Lays bus on to building ai. 'ok', 'cash' (waits), or why there is no way. */
  extend(bus, ai) {
    const s = this.s, b = s.grid[ai];
    const tiles = footprint(s, b.k, ai % s.w, (ai / s.w) | 0, b.d | 0) || [ai];
    const lifts = tiles.filter((t) => s.back[t] && s.back[t].k === 'lift');
    if (!lifts.length) return 'no lift';
    // (I, B) pairs: an Intern on I facing the Dumbwaiter, taking from the bus belt on B behind him.
    const goal = new Map();
    for (const L of lifts) {
      for (let e = 0; e < 4; e++) {
        const I = this.nb(L, e);
        if (!(this.free(I) && !this.noBelt.has(I)) && I !== bus.binAt) continue;
        const B = this.nb(I, e);
        if (B >= 0 && !goal.has(B)) goal.set(B, { I, d: (e + 2) & 3 });
      }
    }
    if (!goal.size) return 'no room for an Intern';
    // A stretch of this bus already passing a good spot: just an Intern.
    for (const [B, g] of goal) {
      const inf = this.info.get(B);
      if (inf && inf.bus === bus && !inf.fixed && !inf.kind && g.I !== bus.binAt && !inf.end) {
        if (this.cash() < this.price('intern')) return 'cash';
        if (!this.place('intern', g.I, g.d)) return 'refused';
        inf.tap = true;
        bus.served.set(ai, g.I);
        return 'ok';
      }
    }
    // On from the end of the bus; failing that, a branch from a Splitter put into a straight stretch.
    const found = (!bus.closed && this.search(bus, goal, false)) || this.search(bus, goal, true);
    if (!found) return 'no way';
    const { path, binAt, split } = found;
    const bin = binAt >= 0;
    let cost = this.price('intern') + (bin ? this.price('bin') : 0) + (split >= 0 ? this.price('split') : 0);
    for (const p of path) cost += this.price(p.over ? 'over' : 'conv');
    if (this.cash() < cost) return 'cash';
    const ts = path.map((p) => p.t);
    const last = ts[ts.length - 1];
    const gl = goal.get(last);
    let from;
    if (split >= 0) {
      // The Splitter takes the belt's place, facing the way it ran; its far side must stay empty.
      const inf = this.info.get(split);
      this.take(split);
      this.place('split', split, inf.outD);
      inf.kind = 'split';
      const far = this.nb(split, (this.dirTo(split, ts[0]) + 2) & 3);
      if (far >= 0) this.noBelt.add(far);
      from = split;
      this.log.branches++;
    } else {
      // Take up the old bin, point the old end on to the new stretch (a belt laid on a belt only turns it).
      from = bus.tiles[bus.tiles.length - 1];
      if (bus.binAt >= 0) this.take(bus.binAt);
      const d0 = this.dirTo(from, ts[0]);
      this.place('conv', from, d0);
      const inf = this.info.get(from);
      inf.outD = d0;
      inf.end = false;
    }
    for (let n = 0; n < ts.length; n++) {
      const x = ts[n];
      // (The last belt points at the bin, or on a wire bus at the Intern, who never takes from it.)
      const next = n + 1 < ts.length ? ts[n + 1] : bin ? binAt : gl.I;
      const d = this.dirTo(x, next);
      const inD = this.dirTo(n > 0 ? ts[n - 1] : from, x);
      if (path[n].over) {
        // Cross another bus's straight belt: take it up and put an Overpass in its place.
        this.take(x);
        this.place('over', x, 0);
        this.info.get(x).kind = 'over';
        this.log.crossings++;
        continue;
      }
      this.place('conv', x, d);
      this.info.set(x, { bus, inD, outD: d });
      if (split < 0) bus.tiles.push(x);
    }
    this.info.get(last).end = true;
    if (bin) this.place('bin', binAt, 0);
    if (split < 0) bus.binAt = binAt;
    if (!this.place('intern', gl.I, gl.d)) return 'refused';
    this.info.get(last).tap = true;
    bus.served.set(ai, gl.I);
    return 'ok';
  }

  /**
   * Lays a wire lane and the wire bus's stretch to it: from the end of the bus to the nearer end of
   * the lane, then down the lane, a Splitter level with each post. 'ok', 'cash' or why not.
   */
  connect(bus, lane) {
    const s = this.s;
    let best = null;
    for (const [ends, order] of [[lane.tiles[0], lane.tiles], [lane.tiles[lane.tiles.length - 1], lane.tiles.slice().reverse()]]) {
      if (lane.splits.has(ends)) continue;
      // (The lane's end counts as free for this search only, and the path must arrive along the lane.)
      this.cellTiles.delete(ends);
      const goal = new Map([[ends, { I: -1, d: 0 }]]);
      const found = (!bus.closed && this.search(bus, goal, false)) || this.search(bus, goal, true);
      this.cellTiles.add(ends);
      if (found && (!best || found.path.length < best.found.path.length)) best = { found, order };
    }
    if (!best) return 'no way';
    const { found: { path, split }, order } = best;
    const ts = path.map((p) => p.t).concat(order.slice(1));
    let cost = this.price('split') * (lane.splits.size + (split >= 0 ? 1 : 0)) + this.price('conv') * ts.length;
    for (const p of path) if (p.over) cost += this.price('over');
    if (this.cash() < cost) return 'cash';
    let from;
    if (split >= 0) {
      const inf = this.info.get(split);
      this.take(split);
      this.place('split', split, inf.outD);
      inf.kind = 'split';
      const far = this.nb(split, (this.dirTo(split, ts[0]) + 2) & 3);
      if (far >= 0) this.noBelt.add(far);
      from = split;
      this.log.branches++;
    } else {
      from = bus.tiles[bus.tiles.length - 1];
      const d0 = this.dirTo(from, ts[0]);
      this.place('conv', from, d0);
      const inf = this.info.get(from);
      inf.outD = d0;
      inf.end = false;
    }
    for (let n = 0; n < ts.length; n++) {
      const x = ts[n];
      const d = n + 1 < ts.length ? this.dirTo(x, ts[n + 1]) : this.dirTo(ts[n - 1], x);
      const inD = this.dirTo(n > 0 ? ts[n - 1] : from, x);
      if (n < path.length && path[n].over) {
        this.take(x);
        this.place('over', x, 0);
        this.info.get(x).kind = 'over';
        this.log.crossings++;
        continue;
      }
      // (A post's row on the lane gets a Splitter: its side hands wire into the post.)
      this.place(lane.splits.has(x) ? 'split' : 'conv', x, d);
      this.info.set(x, { bus, inD, outD: d, fixed: n >= path.length - 1, kind: lane.splits.has(x) ? 'split' : undefined });
      if (split < 0) bus.tiles.push(x);
    }
    const last = ts[ts.length - 1];
    this.info.get(last).end = true;
    // The bus now ends at the lane's far end: nothing goes on from there (the next lane branches off).
    bus.closed = true;
    lane.built = true;
    for (const p of lane.posts) bus.served.set(p, -1);
    return 'ok';
  }

  /**
   * Breadth-first search for a new stretch of `bus` to any tile of `goal` (with, on a main bus, a
   * free tile beside it for the bin): from the tiles beside the bus's end (`branch` false), or from
   * the free tiles beside any straight belt of the bus or its branches, where a Splitter would go
   * (true). Steps over free floor (the end's bin's tile counts as free); may jump across another
   * bus's straight belt, at right angles, with an Overpass.
   * Returns { path: [{t, over}], binAt (-1 on a wire bus), split (the Splitter's tile, or -1) }, or null.
   */
  search(bus, goal, branch, noBin = false) {
    const s = this.s, n = s.tiles.length;
    const from = new Int32Array(n).fill(-2), over = new Uint8Array(n), seed = new Map();
    const goalI = new Set([...goal.values()].map((x) => x.I));
    const mine = (x) => !branch && (x === bus.binAt || x === bus.face);
    const ok = (x) => ((this.free(x) && !this.noBelt.has(x)) || mine(x)) && !goalI.has(x);
    const straight = (inf) => inf && !inf.tap && !inf.fixed && !inf.end && !inf.kind && inf.inD === inf.outD;
    const q = [];
    if (!branch) {
      const end = bus.tiles[bus.tiles.length - 1];
      for (let e = 0; e < 4; e++) {
        const x = this.nb(end, e);
        if (x < 0 || !ok(x)) continue;
        from[x] = -1; q.push(x);
      }
    } else {
      for (const [S, inf] of this.info) {
        if (inf.bus !== bus || !straight(inf) || !s.back[S] || s.back[S].k !== 'conv') continue;
        for (const e of [LEFT(inf.outD), RIGHT(inf.outD)]) {
          const x = this.nb(S, e), y = this.nb(S, (e + 2) & 3);
          if (x < 0 || from[x] !== -2 || !ok(x)) continue;
          // (The Splitter's other side: empty, something that never takes from it, or a Dumbwaiter,
          // which it then feeds as well.)
          if (y >= 0 && s.back[y] && !['intern', 'drop', 'lift'].includes(s.back[y].k)) continue;
          from[x] = -1; seed.set(x, S); q.push(x);
        }
      }
    }
    for (let k = 0; k < q.length; k++) {
      const u = q[k];
      if (goal.has(u)) {
        const gl = goal.get(u);
        const path = [];
        let x = u;
        for (; ; x = from[x]) { path.unshift({ t: x, over: !!over[x] }); if (from[x] === -1) break; }
        const split = branch ? seed.get(x) : -1;
        if (bus.wire || noBin) return { path, binAt: -1, split };
        const on = new Set(path.map((p) => p.t));
        // Somewhere beside it for the bin: free, not the Intern's tile, not on the new stretch.
        for (let e = 0; e < 4; e++) {
          const z = this.nb(u, e);
          if (z < 0 || z === gl.I || on.has(z) || !ok(z)) continue;
          return { path, binAt: z, split };
        }
      }
      for (let e = 0; e < 4; e++) {
        const v = this.nb(u, e);
        if (v < 0 || from[v] !== -2) continue;
        if (ok(v)) { from[v] = u; q.push(v); continue; }
        // A jump: v another bus's straight belt at right angles, w beyond it free.
        const inf = this.info.get(v);
        const p = s.back[v];
        if (!straight(inf) || !p || p.k !== 'conv' || (inf.outD & 1) === (e & 1)) continue;
        const w = this.nb(v, e);
        if (w < 0 || from[w] !== -2 || !ok(w)) continue;
        from[v] = u; over[v] = 1;
        from[w] = v; q.push(w);
      }
    }
    return null;
  }

  /**
   * One more Rebrander in the private stretch of the machine making `supply` in cell c (the next
   * belt from the machine's side). 'ok', 'cash' or 'none'.
   */
  raise(c, supply) {
    const sl = c.slots.find((x) => x.supply === supply && x.built);
    if (!sl || sl.raised >= Math.min(this.prefix, sl.chain.length)) return 'none';
    const t = sl.chain[sl.raised];
    if (this.cash() < this.price('rebrand')) return 'cash';
    this.take(t);
    if (!this.place('rebrand', t, c.F)) return 'none';
    sl.raised++;
    this.log.raised++;
    return 'ok';
  }
}
