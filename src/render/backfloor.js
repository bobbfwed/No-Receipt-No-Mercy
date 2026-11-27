// The Back's own floor (0.4, stage 5b): the basement under the shop, painted into cached chunks by
// the same mechanism as the shop floor (createFloorCache in floor.js, given this painter).
//
// What it shows, following the concept pictures (docs/mockups/0.4/back-basics.png):
//   - darker basement concrete than the shop's, with its own slab joints, oil stains, cracks, damp
//     patches and the odd drain, varied over several tiles so a big store does not look tiled;
//   - the store's walls and shelves, which block The Back too (any tile where tiles[i] === '#'),
//     drawn as what holds the shop up: the outer walls as concrete block with pipes and a cable
//     tray along them, a lone blocked tile as a square support pillar on a hazard-striped base, and
//     a run of them as a cast concrete foundation wall with pillars along it (shelves, partitions,
//     the food court's furniture and the car park's cars all stand on foundations down here);
//   - hazard paint on the floor round each Returns Drop;
//   - open floor under the tills and entrances, with a faint painted outline.
// Everything here is fixed for a map, so it is painted once per chunk and resolution.
import { TILE, INK, C, box, hazard, hash2 } from './paint.js';
import { OUTER } from './floor.js';

const T = TILE;

/** The basement's colours: darker and cooler than the shop floor, so the two are never confused. */
export const BK = {
  floor: '#575c62', joint: '#474b51', bigJoint: '#3c4045', light: 'rgba(255,255,255,0.05)',
  dark: 'rgba(16,18,22,0.10)', stain: 'rgba(14,16,20,0.22)', damp: 'rgba(20,34,44,0.08)',
  crack: 'rgba(22,24,28,0.55)',
  wall: '#262c33', wallCourse: '#1f242a', wallLip: '#3b444e',
  found: '#3f464e', foundTop: '#4b535c', foundLip: '#5d6670', tie: '#2c3238',
};

/**
 * Paints The Back's floor for tiles [x0, x1) x [y0, y1); the caller has set the world transform.
 * `info` is analyzeMap's, plus `drops` (the Returns Drops' tiles). Things that spill over a tile's
 * edge (shadows, pipes) are drawn for a margin round the chunk and clipped, as drawChunk does, so
 * neighbouring chunks agree at their edges.
 */
export function drawBackChunk(g, info, x0, y0, x1, y1, zoom = 40) {
  g.save();
  g.beginPath();
  g.rect(x0 * T, y0 * T, (x1 - x0) * T, (y1 - y0) * T);
  g.clip();
  const r = {
    x0: Math.max(0, x0 - 2), y0: Math.max(0, y0 - 2),
    x1: Math.min(info.w, x1 + 2), y1: Math.min(info.h, y1 + 2),
  };
  concrete(g, info, r, x0, y0, x1, y1, zoom);
  dropPaint(g, info, r);
  openings(g, info, r);
  shadows(g, info, r);
  outerWalls(g, info, r);
  foundations(g, info, r);
  g.restore();
}

const blockedAt = (info, x, y) => x < 0 || y < 0 || x >= info.w || y >= info.h || info.tiles[y * info.w + x] === '#';

/** The basement concrete: slabs, joints, stains, cracks, damp patches and drains. */
function concrete(g, info, r, x0, y0, x1, y1, zoom) {
  const { w, h } = info;
  g.fillStyle = BK.floor;
  g.fillRect(x0 * T, y0 * T, (x1 - x0) * T, (y1 - y0) * T);
  // Slabs a shade lighter or darker, in blocks of two by two tiles (a pour), so the shading does not
  // repeat tile by tile.
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (blockedAt(info, x, y)) continue;
      const v = hash2(x >> 1, (y >> 1) + 300);
      if (v < 0.3) { g.fillStyle = BK.dark; g.fillRect(x * T, y * T, T, T); }
      else if (v > 0.8) { g.fillStyle = BK.light; g.fillRect(x * T, y * T, T, T); }
    }
  }
  // Damp patches: soft dark blotches a few tiles across, a few to a large store.
  for (let by = Math.floor(r.y0 / 6) - 1; by <= Math.ceil(r.y1 / 6); by++) {
    for (let bx = Math.floor(r.x0 / 7) - 1; bx <= Math.ceil(r.x1 / 7); bx++) {
      const v = hash2(bx + 900, by + 77);
      if (v > 0.32) continue;
      const cx = (bx * 7 + 1 + hash2(bx, by + 5) * 5) * T, cy = (by * 6 + 1 + hash2(bx + 3, by) * 4) * T;
      const rx = (1.2 + v * 3) * T, ry = (0.8 + hash2(by, bx) * 1.6) * T;
      g.fillStyle = BK.damp;
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, v * 6, 0, Math.PI * 2);
      g.ellipse(cx + rx * 0.5, cy + ry * 0.3, rx * 0.55, ry * 0.6, v * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Oil stains, cracks and drains, tile by tile.
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (blockedAt(info, x, y)) continue;
      const px = x * T, py = y * T;
      const s = hash2(x * 7 + 3, y * 13 + 1), h2 = hash2(x + 41, y + 17);
      if (s > 0.9) {
        g.fillStyle = BK.stain;
        g.beginPath();
        g.ellipse(px + 10 + s * 18, py + 14 + h2 * 12, 9, 5, s * 3, 0, Math.PI * 2);
        g.ellipse(px + 6 + s * 20, py + 22 + h2 * 8, 3.5, 2.5, 0, 0, Math.PI * 2);
        g.fill();
      } else if (s < 0.07 && zoom >= 14) {
        g.beginPath();
        const ax = px + 5 + h2 * 6, ay = py + 7 + s * 40;
        g.moveTo(ax, ay); g.lineTo(ax + 9, ay + 6); g.lineTo(ax + 14, ay + 3); g.lineTo(ax + 24, ay + 13);
        g.moveTo(ax + 14, ay + 3); g.lineTo(ax + 17, ay - 4);
        g.strokeStyle = BK.crack; g.lineWidth = 1; g.stroke();
      } else if (s > 0.885 && s <= 0.9 && h2 < 0.5) {
        // A floor drain: a small round grate.
        const cx = px + 20, cy = py + 20;
        g.beginPath(); g.arc(cx, cy, 6.5, 0, Math.PI * 2);
        g.fillStyle = '#2a2e33'; g.fill();
        g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
        g.beginPath();
        for (let k = -4; k <= 4; k += 2.6) { g.moveTo(cx + k, cy - 5); g.lineTo(cx + k, cy + 5); }
        g.strokeStyle = '#6b7279'; g.lineWidth = 1; g.stroke();
      }
    }
  }
  // Tile joints, and saw-cut expansion joints every six tiles across and five down.
  const X0 = r.x0 * T, X1 = r.x1 * T, Y0 = r.y0 * T, Y1 = r.y1 * T;
  g.beginPath();
  for (let x = r.x0; x <= r.x1; x++) { g.moveTo(x * T + 0.5, Y0); g.lineTo(x * T + 0.5, Y1); }
  for (let y = r.y0; y <= r.y1; y++) { g.moveTo(X0, y * T + 0.5); g.lineTo(X1, y * T + 0.5); }
  g.strokeStyle = BK.joint;
  g.lineWidth = 1.5;
  g.stroke();
  g.beginPath();
  for (let x = Math.ceil(r.x0 / 6) * 6; x <= r.x1; x += 6) { if (x > 0 && x < w) { g.moveTo(x * T + 0.5, Y0); g.lineTo(x * T + 0.5, Y1); } }
  for (let y = Math.ceil(r.y0 / 5) * 5; y <= r.y1; y += 5) { if (y > 0 && y < h) { g.moveTo(X0, y * T + 0.5); g.lineTo(X1, y * T + 0.5); } }
  g.strokeStyle = BK.bigJoint;
  g.lineWidth = 2.5;
  g.stroke();
}

/**
 * Hazard paint round each Returns Drop: diagonal yellow stripes on the open floor of the tiles
 * round it (faint, so belts laid there still read) inside a painted yellow line.
 */
function dropPaint(g, info, r) {
  const { w } = info;
  for (const i of info.drops || []) {
    const dx = i % w, dy = (i / w) | 0;
    if (dx < r.x0 - 2 || dx > r.x1 + 1 || dy < r.y0 - 2 || dy > r.y1 + 1) continue;
    g.save();
    g.beginPath();
    for (let y = dy - 1; y <= dy + 1; y++) {
      for (let x = dx - 1; x <= dx + 1; x++) if (!blockedAt(info, x, y)) g.rect(x * T, y * T, T, T);
    }
    g.clip();
    g.strokeStyle = 'rgba(242,194,27,0.15)';
    g.lineWidth = 6;
    g.beginPath();
    const ox = (dx - 1) * T, oy = (dy - 1) * T;
    for (let s = -3 * T; s < 3 * T; s += 16) { g.moveTo(ox + s, oy + 3 * T); g.lineTo(ox + s + 3 * T, oy); }
    g.stroke();
    g.strokeStyle = 'rgba(242,194,27,0.5)';
    g.lineWidth = 2.5;
    g.setLineDash([10, 6]);
    g.strokeRect(ox + 4, oy + 4, 3 * T - 8, 3 * T - 8);
    g.setLineDash([]);
    g.restore();
  }
}

/** Under the tills and entrances, open floor with a faint painted outline (nothing stands there). */
function openings(g, info, r) {
  const { w, tiles } = info;
  g.setLineDash([6, 5]);
  g.strokeStyle = 'rgba(210,216,222,0.28)';
  g.lineWidth = 2;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const ch = tiles[y * w + x];
      if (ch === '.' || ch === '#') continue;
      g.strokeRect(x * T + 5, y * T + 5, T - 10, T - 10);
    }
  }
  g.setLineDash([]);
}

/** Every blocked tile throws a soft shadow down and to the right onto the floor. */
function shadows(g, info, r) {
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (!blockedAt(info, x, y)) continue;
      if (!blockedAt(info, x, y + 1)) g.fillRect(x * T + 4, (y + 1) * T, T, 7);
      if (!blockedAt(info, x + 1, y)) g.fillRect((x + 1) * T, y * T + 5, 6, T);
    }
  }
}

/**
 * The outer walls: dark concrete block, with a lighter lip where they meet the floor, and on the
 * inside face of each wall, services: two pipes along the top wall, a cable tray along the bottom,
 * a conduit up each side wall. They stop at entrances and tills (open floor here) with an end cap.
 */
function outerWalls(g, info, r) {
  const { w, h, wall } = info;
  const outer = (x, y) => x >= 0 && y >= 0 && x < w && y < h && wall[y * w + x] === OUTER;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (!outer(x, y)) continue;
      const px = x * T, py = y * T;
      g.fillStyle = BK.wall;
      g.fillRect(px, py, T, T);
      // Block courses: a joint every half tile, the vertical joints staggered course by course.
      g.fillStyle = BK.wallCourse;
      g.fillRect(px, py + 19, T, 2);
      g.fillRect(px, py + 39, T, 1);
      g.fillRect(px + ((x + y) & 1 ? 9 : 29), py, 2, 19);
      g.fillRect(px + ((x + y) & 1 ? 29 : 9), py + 20, 2, 19);
    }
  }
  // Lips and an ink line on every edge where a wall meets open floor.
  g.beginPath();
  g.fillStyle = BK.wallLip;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (!outer(x, y)) continue;
      const px = x * T, py = y * T;
      if (!blockedAt(info, x, y + 1)) { g.fillRect(px, py + T - 6, T, 6); g.moveTo(px, py + T); g.lineTo(px + T, py + T); }
      if (!blockedAt(info, x, y - 1)) { g.fillRect(px, py, T, 4); g.moveTo(px, py); g.lineTo(px + T, py); }
      if (!blockedAt(info, x + 1, y)) { g.fillRect(px + T - 5, py, 5, T); g.moveTo(px + T, py); g.lineTo(px + T, py + T); }
      if (!blockedAt(info, x - 1, y)) { g.fillRect(px, py, 5, T); g.moveTo(px, py); g.lineTo(px, py + T); }
    }
  }
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.stroke();

  // Services along the inside of the walls, a tile segment at a time so chunks join up.
  for (let x = Math.max(1, r.x0); x < Math.min(w - 1, r.x1); x++) {
    if (r.y0 === 0 && outer(x, 0)) {
      pipeRun(g, info, x, 0, 0, T - 13, 4.5, '#8f969d');
      pipeRun(g, info, x, 0, 0, T - 25, 3.5, '#b03a30');
    }
    if (r.y1 === h && outer(x, h - 1)) trayRun(g, info, x, h - 1);
  }
  for (let y = Math.max(1, r.y0); y < Math.min(h - 1, r.y1); y++) {
    if (r.x0 === 0 && outer(0, y)) pipeRun(g, info, 0, y, 1, T - 12, 4, '#6f8f5a');
    if (r.x1 === w && outer(w - 1, y)) pipeRun(g, info, w - 1, y, 1, 12, 4, '#6f8f5a');
  }
}

/**
 * One tile's length of pipe on the outer wall tile (x, y): along it (dir 0) at depth `at` from the
 * tile's top, or up and down it (dir 1) at `at` from its left. A wall tile next to an opening gets
 * an end cap instead of running on into it.
 */
function pipeRun(g, info, x, y, dir, at, rad, color) {
  const px = x * T, py = y * T;
  const ox = dir ? 0 : 1, oy = dir ? 1 : 0;
  const openBefore = !blockedAt(info, x - ox, y - oy), openAfter = !blockedAt(info, x + ox, y + oy);
  const a = openBefore ? 6 : 0, b = openAfter ? T - 6 : T;
  const rect = (s, e, c, d) => (dir ? g.fillRect(px + c, py + s, d, e - s) : g.fillRect(px + s, py + c, e - s, d));
  g.fillStyle = 'rgba(0,0,0,0.35)';
  rect(a, b, at + rad - 1, 3);
  g.fillStyle = color;
  rect(a, b, at - rad, rad * 2);
  g.fillStyle = 'rgba(255,255,255,0.3)';
  rect(a, b, at - rad + 1, 1.2);
  g.fillStyle = INK;
  rect(a, b, at - rad - 1, 1.5);
  rect(a, b, at + rad - 0.5, 1.5);
  // A bracket every few tiles, and caps at the ends.
  const along = dir ? y : x;
  if (along % 4 === 1) box(g, dir ? px + at - rad - 2 : px + 18, dir ? py + 18 : py + at - rad - 2, dir ? rad * 2 + 4 : 5, dir ? 5 : rad * 2 + 4, 1, C.steelDark, 1.4);
  for (const [open, e] of [[openBefore, a], [openAfter, b - 4]]) {
    if (open) box(g, dir ? px + at - rad - 1.5 : px + e, dir ? py + e : py + at - rad - 1.5, dir ? rad * 2 + 3 : 4, dir ? 4 : rad * 2 + 3, 1, C.steelDark, 1.4);
  }
}

/** One tile's length of cable tray on the bottom wall tile (x, y), cables in it. */
function trayRun(g, info, x, y) {
  const px = x * T, py = y * T + 6;
  const a = blockedAt(info, x - 1, y) ? 0 : 6, b = blockedAt(info, x + 1, y) ? T : T - 6;
  g.fillStyle = '#3d434a';
  g.fillRect(px + a, py, b - a, 9);
  for (const [dy, col] of [[2, '#2f8fe0'], [4.5, '#f2c21b'], [7, '#1d2125']]) { g.fillStyle = col; g.fillRect(px + a, py + dy - 0.7, b - a, 1.5); }
  g.fillStyle = INK;
  g.fillRect(px + a, py - 0.5, b - a, 1.5);
  g.fillRect(px + a, py + 8.5, b - a, 1.5);
  g.fillStyle = C.steelDark;
  if (x % 3 === 0) g.fillRect(px + 18, py - 1, 3, 11);
}

/**
 * Everything blocked inside the store. A tile with no blocked neighbour inside the store is a
 * square support pillar on a hazard-striped base; a run of them is a cast concrete foundation
 * wall, a pillar thickening it every fourth tile and at its ends, with hazard tape round the ends;
 * the middle of a big block (all four neighbours blocked) is the same concrete with no edges.
 */
function foundations(g, info, r) {
  const { w, h, wall } = info;
  const inner = (x, y) => x > 0 && y > 0 && x < w - 1 && y < h - 1 && wall[y * w + x] !== 0 && wall[y * w + x] !== OUTER;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (!inner(x, y)) continue;
      const n = inner(x, y - 1), s = inner(x, y + 1), wst = inner(x - 1, y), e = inner(x + 1, y);
      const px = x * T, py = y * T;
      if (!n && !s && !wst && !e) { pillar(g, px, py); continue; }
      // The middle of a big block (the Strip Mall's car park, a food stall): plain concrete.
      if (n && s && wst && e) { g.fillStyle = BK.foundTop; g.fillRect(px, py, T, T); continue; }
      // The wall's top face, its lit lip where it drops to open floor, and form-tie holes.
      g.fillStyle = BK.found;
      g.fillRect(px, py, T, T);
      g.fillStyle = BK.foundTop;
      g.fillRect(px + (wst ? 0 : 4), py + (n ? 0 : 4), T - (wst ? 0 : 4) - (e ? 0 : 4), T - (n ? 0 : 4) - (s ? 0 : 9));
      if (!s && !blockedAt(info, x, y + 1)) { g.fillStyle = BK.foundLip; g.fillRect(px, py + T - 9, T, 9); }
      g.fillStyle = BK.tie;
      const vert = n || s;
      for (const k of [10, 30]) {
        const tx = vert ? px + 12 : px + k, ty = vert ? py + k : py + 12;
        g.fillRect(tx - 1.5, ty - 1.5, 3, 3);
        g.fillRect((vert ? px + 28 : tx) - 1.5, (vert ? ty : py + 26) - 1.5, 3, 3);
      }
      // Pillars along the wall: every fourth tile of a run, and its ends.
      const along = vert ? y : x, end = vert ? (!n || !s) : (!wst || !e);
      if (end || along % 4 === 0) {
        box(g, px + 6, py + 6, T - 12, T - 12, 2, '#353c44', 2);
        g.fillStyle = BK.foundLip;
        g.fillRect(px + 9, py + 9, T - 18, 4);
      }
    }
  }
  // Edges: an ink line wherever foundation meets open floor or a wall of another kind.
  g.beginPath();
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (!inner(x, y)) continue;
      const n = inner(x, y - 1), s = inner(x, y + 1), wst = inner(x - 1, y), e = inner(x + 1, y);
      if (!n && !s && !wst && !e) continue;
      const px = x * T, py = y * T;
      if (!n) { g.moveTo(px, py); g.lineTo(px + T, py); }
      if (!s) { g.moveTo(px, py + T); g.lineTo(px + T, py + T); g.moveTo(px, py + T - 9); g.lineTo(px + T, py + T - 9); }
      if (!wst) { g.moveTo(px, py); g.lineTo(px, py + T); }
      if (!e) { g.moveTo(px + T, py); g.lineTo(px + T, py + T); }
    }
  }
  g.strokeStyle = INK;
  g.lineWidth = 2.5;
  g.stroke();
  // Hazard tape round the ends of each run, where a forklift driver would clip it.
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (!inner(x, y)) continue;
      const n = inner(x, y - 1), s = inner(x, y + 1), wst = inner(x - 1, y), e = inner(x + 1, y);
      const px = x * T, py = y * T;
      if ((n || s) && !wst && !e) {
        if (!n && !blockedAt(info, x, y - 1)) hazard(g, px + 1, py + 1, T - 2, 6, 4);
        if (!s && !blockedAt(info, x, y + 1)) hazard(g, px + 1, py + T - 7, T - 2, 6, 4);
      } else if ((wst || e) && !n && !s) {
        if (!wst && !blockedAt(info, x - 1, y)) hazard(g, px + 1, py + 1, 6, T - 2, 4);
        if (!e && !blockedAt(info, x + 1, y)) hazard(g, px + T - 7, py + 1, 6, T - 2, 4);
      }
    }
  }
}

/**
 * A square concrete support pillar seen from above and a little in front, as the shop's buildings
 * are: a pale concrete top, and its front face painted with hazard stripes at the base. (Light
 * concrete, not a dark square in a striped frame, so it never passes for a Dumbwaiter's hatch.)
 */
function pillar(g, px, py) {
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(px + 9, py + 8, T - 12, T - 9);
  // The front face first (the band at the bottom), then the top over it.
  hazard(g, px + 5, py + T - 14, T - 10, 11, 4);
  g.strokeStyle = INK; g.lineWidth = 2.5;
  g.strokeRect(px + 5, py + T - 14, T - 10, 11);
  box(g, px + 5, py + 3, T - 10, T - 16, 2, '#80878f', 2.5);
  g.fillStyle = '#959ca4';
  g.fillRect(px + 9, py + 6, T - 18, 4);
  g.fillStyle = '#6a7179';
  for (const [sx, sy] of [[11, 14], [T - 14, 14]]) g.fillRect(px + sx, py + sy, 3, 3);
}
