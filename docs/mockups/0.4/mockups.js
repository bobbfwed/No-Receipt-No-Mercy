// Concept mock-ups for the planned 0.4 redesign: belts and machines move down to "The Back", a
// second floor under the shop. These are static pictures for the owner to react to, not game code.
// The palette and small helpers come from the game's own renderer (paint.js has no game state in
// it); the belts, items and buildings are redrawn here by hand in the same style, because the
// game's belt and building painters are tied to the live game state.
import { INK, C, rr, paint, box, circle, line, label, text, hazard, hash2, font } from '../../../src/render/paint.js';

const T = 40, HALF = 20, SP = T / 3, TAU = Math.PI * 2;
const W = 720, H = 440;
/** Picture layout: a 40 px title strip, a 20 px wall all round, then 17 x 9 tiles. */
const OX = 20, OY = 60, COLS = 17, ROWS = 9;
const E = 0, S = 1, Wt = 2, N = 3;
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
/** The Back's basement concrete: darker than the shop floor so the two never get mixed up. */
const BK = { floor: '#565a5f', joint: '#494d52', patch: '#5d6166', dark: '#505459' };
const SUPPLY = [C.red, C.green, C.orange, '#e6eaee'];

const tx = (c) => OX + c * T + HALF;
const ty = (r) => OY + r * T + HALF;

// ---------------------------------------------------------------------------------------------
// Belts (same look as src/render/buildings.js: dark band, steel rails, yellow chevrons)

function straightLocal(ctx, back, front) {
  ctx.fillStyle = C.belt;
  ctx.fillRect(-HALF, -13, T, 26);
  ctx.save();
  ctx.beginPath(); ctx.rect(-HALF, -13, T, 26); ctx.clip();
  ctx.beginPath();
  for (let k = -1; k <= 3; k++) {
    const px = -HALF + k * SP + 4;
    ctx.moveTo(px - 5, -8); ctx.lineTo(px + 2, 0); ctx.lineTo(px - 5, 8);
  }
  ctx.strokeStyle = C.chevron; ctx.lineWidth = 3.5; ctx.lineJoin = 'miter'; ctx.stroke();
  ctx.restore();
  ctx.fillStyle = C.steel;
  ctx.fillRect(-HALF, -18, T, 5);
  ctx.fillRect(-HALF, 13, T, 5);
  ctx.fillStyle = C.steelDark;
  for (let bx = -15; bx < HALF; bx += 10) { ctx.fillRect(bx, -16.5, 2, 2); ctx.fillRect(bx, 14.5, 2, 2); }
  ctx.beginPath();
  ctx.moveTo(-HALF, -18); ctx.lineTo(HALF, -18); ctx.moveTo(-HALF, 18); ctx.lineTo(HALF, 18);
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-HALF, -13); ctx.lineTo(HALF, -13); ctx.moveTo(-HALF, 13); ctx.lineTo(HALF, 13);
  ctx.lineWidth = 1; ctx.stroke();
  if (!back) { rr(ctx, -HALF + 1, -18, 4, 36, 2); paint(ctx, C.steelDark, 2); }
  if (!front) { rr(ctx, HALF - 5, -18, 4, 36, 2); paint(ctx, C.steelDark, 2); }
}

function cornerLocal(ctx) {
  const cx = HALF, cy = HALF, A0 = Math.PI, A1 = Math.PI * 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, 38, A0, A1); ctx.lineTo(cx, cy); ctx.closePath();
  paint(ctx, C.steel, 0);
  ctx.beginPath(); ctx.arc(cx, cy, 33, A0, A1); ctx.arc(cx, cy, 7, A1, A0, true); ctx.closePath();
  ctx.fillStyle = C.belt; ctx.fill();
  ctx.save(); ctx.clip();
  const step = SP / 20;
  ctx.beginPath();
  for (let k = -1; k <= 3; k++) {
    const a = A0 + (k + 0.3) * step;
    const px = cx + 20 * Math.cos(a), py = cy + 20 * Math.sin(a);
    const vx = -Math.sin(a), vy = Math.cos(a), nx = -vy, ny = vx;
    ctx.moveTo(px - vx * 5 - nx * 8, py - vy * 5 - ny * 8);
    ctx.lineTo(px + vx * 2, py + vy * 2);
    ctx.lineTo(px - vx * 5 + nx * 8, py - vy * 5 + ny * 8);
  }
  ctx.strokeStyle = C.chevron; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, 38, A0, A1);
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 33, A0, A1); ctx.moveTo(cx - 7, cy); ctx.arc(cx, cy, 7, A0, A1);
  ctx.lineWidth = 1; ctx.stroke();
}

/** A straight belt on tile (c, r) running in direction d; back/front false draw an end roller. */
function belt(ctx, c, r, d, back = true, front = true) {
  ctx.save(); ctx.translate(tx(c), ty(r)); ctx.rotate(d * Math.PI / 2);
  straightLocal(ctx, back, front);
  ctx.restore();
}

/** A corner belt: goods come in over side `from` (a direction from the tile centre) and leave in direction d. */
function corner(ctx, c, r, from, d) {
  ctx.save(); ctx.translate(tx(c), ty(r)); ctx.rotate(d * Math.PI / 2);
  if (from === ((d + 3) & 3)) ctx.scale(1, -1);
  cornerLocal(ctx);
  ctx.restore();
}

const P3 = [1 / 6, 0.5, 5 / 6];
const P2 = [0.25, 0.75];

function beltItems(ctx, c, r, d, kind, tier = 0, ps = tier ? P2 : P3) {
  for (const p of ps) item(ctx, kind, tx(c) + DX[d] * (p - 0.5) * T, ty(r) + DY[d] * (p - 0.5) * T, tier);
}

function cornerItems(ctx, c, r, from, d, kind, tier = 0, ps = tier ? P2 : P3) {
  const px = tx(c) + HALF * (DX[d] + DX[from]), py = ty(r) + HALF * (DY[d] + DY[from]);
  const a0 = Math.atan2(-DY[d], -DX[d]), a1 = Math.atan2(-DY[from], -DX[from]);
  let da = a1 - a0;
  while (da > Math.PI) da -= TAU;
  while (da < -Math.PI) da += TAU;
  for (const p of ps) {
    const a = a0 + da * p;
    item(ctx, kind, px + 20 * Math.cos(a), py + 20 * Math.sin(a), tier);
  }
}

// ---------------------------------------------------------------------------------------------
// Items: about 14 px, drawn upright like the game's goods. Tier: 0 Store Brand, 1 Premium
// (silver ring), 2 Platinum (gold ring).

const ITEMS = {
  junk(g) {
    g.beginPath();
    g.moveTo(-7, -4.5); g.lineTo(-3, -6.5); g.lineTo(1, -5); g.lineTo(6.5, -6); g.lineTo(7, -0.5);
    g.lineTo(5.5, 5.5); g.lineTo(0.5, 4.5); g.lineTo(-4, 6); g.lineTo(-7, 3);
    g.closePath();
    g.lineJoin = 'round';
    paint(g, C.cardboard, 1.6);
    g.beginPath();
    g.moveTo(-3, -6.5); g.lineTo(-1, 0); g.lineTo(-4, 6); g.moveTo(-1, 0); g.lineTo(5.5, -1);
    g.strokeStyle = C.cardboardDark; g.lineWidth = 1; g.stroke();
    g.save();
    g.rotate(-0.25);
    rr(g, -1, -4.4, 8, 4.6, 0.8);
    paint(g, C.red, 1);
    g.fillStyle = '#fff';
    g.fillRect(0.3, -2.7, 5.4, 1.2);
    g.restore();
  },
  spite(g) {
    g.beginPath();
    g.moveTo(-1.7, -5); g.lineTo(1.7, -5); g.lineTo(1.7, -3);
    g.quadraticCurveTo(4.6, -2, 4.6, 1); g.lineTo(4.6, 6); g.quadraticCurveTo(4.6, 7.2, 3.4, 7.2);
    g.lineTo(-3.4, 7.2); g.quadraticCurveTo(-4.6, 7.2, -4.6, 6); g.lineTo(-4.6, 1);
    g.quadraticCurveTo(-4.6, -2, -1.7, -3);
    g.closePath();
    g.lineJoin = 'round';
    paint(g, C.red, 1.6);
    g.fillStyle = C.paper;
    g.fillRect(-3.9, 1.2, 7.8, 3.2);
    g.fillStyle = INK;
    g.fillRect(-1.2, 2.2, 2.4, 1.3);
    line(g, -2.9, -0.6, -2.9, 0.4, 'rgba(255,255,255,0.7)', 1.2);
    rr(g, -2.2, -8, 4.4, 3.4, 1);
    paint(g, '#2b2f34', 1.2);
  },
  cola(g) {
    rr(g, -4.6, -6.6, 9.2, 13.4, 2.2);
    paint(g, C.green, 1.6);
    g.fillStyle = C.steelLight;
    g.fillRect(-3.6, -5.7, 7.2, 1.7);
    g.beginPath();
    g.moveTo(1.6, -3.6); g.lineTo(-2.6, 1.4); g.lineTo(0, 1.4); g.lineTo(-1.2, 5.6);
    g.lineTo(3, 0); g.lineTo(0.4, 0); g.lineTo(1.9, -3.6);
    g.closePath();
    paint(g, C.yellow, 0.9);
  },
  cord(g) {
    g.lineCap = 'round';
    for (const [r, w] of [[5.4, 3.2], [2.2, 2.4]]) {
      g.beginPath(); g.arc(-0.5, -0.5, r, 0, TAU);
      g.strokeStyle = INK; g.lineWidth = w + 2; g.stroke();
      g.strokeStyle = C.orange; g.lineWidth = w; g.stroke();
    }
    g.beginPath(); g.moveTo(3.5, 3.5); g.lineTo(5.5, 5.5);
    g.strokeStyle = INK; g.lineWidth = 3.4; g.stroke();
    g.strokeStyle = C.orange; g.lineWidth = 1.6; g.stroke();
    rr(g, 4.5, 4, 4, 4, 0.8);
    paint(g, C.steelLight, 1.1);
  },
  tape(g) {
    circle(g, 0, 0, 6.6, C.steelLight, 1.6);
    g.beginPath(); g.arc(0, 0, 4.9, 0, TAU);
    g.strokeStyle = C.steel; g.lineWidth = 1; g.stroke();
    circle(g, 0, 0, 3, C.cardboardLight, 1.2);
    circle(g, 0, 0, 1.5, '#2a2d31', 0);
    g.beginPath();
    g.moveTo(4.6, 4.6); g.lineTo(7.8, 7); g.lineTo(6, 8.4); g.lineTo(3, 6);
    g.closePath();
    paint(g, C.steelLight, 1);
  },
};

function item(ctx, kind, x, y, tier = 0, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (tier) {
    ctx.beginPath(); ctx.arc(0, 0.5, 9, 0, TAU);
    ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = tier === 1 ? '#e8ecf0' : '#ffc928'; ctx.stroke();
  }
  ITEMS[kind](ctx);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Machines and the other Back buildings

function shadow(ctx, w = 34, h = 32) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rr(ctx, -w / 2 + 3, -h / 2 + 5, w, h, 6);
  ctx.fill();
}

/** White "in" triangle on side `side`, pointing into the tile (as on the game's machines). */
function inMark(ctx, side) {
  ctx.save();
  ctx.rotate(side * Math.PI / 2);
  ctx.beginPath(); ctx.moveTo(21, -5.5); ctx.lineTo(14, 0); ctx.lineTo(21, 5.5); ctx.closePath();
  ctx.lineJoin = 'round';
  paint(ctx, '#ffffff', 1.6);
  ctx.restore();
}

/** Yellow "out" arrow on side d, its tip just past the tile edge (as on the game's machines). */
function outMark(ctx, d) {
  ctx.save();
  ctx.rotate(d * Math.PI / 2);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(10, -3.5); ctx.lineTo(14, -3.5); ctx.lineTo(14, -8.5); ctx.lineTo(23, 0);
    ctx.lineTo(14, 8.5); ctx.lineTo(14, 3.5); ctx.lineTo(10, 3.5); ctx.closePath();
  };
  ctx.lineJoin = 'round';
  ctx.save(); ctx.rotate(-d * Math.PI / 2); ctx.translate(1.5, 2); ctx.rotate(d * Math.PI / 2);
  path(); ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill(); ctx.restore();
  path(); paint(ctx, '#ffe14a', 2.2);
  ctx.restore();
}

const MACH = {
  still: { body: C.red, dark: C.redDark, out: 'spite' },
  cannery: { body: C.green, dark: C.greenDark, out: 'cola' },
  spooler: { body: C.orange, dark: C.orangeDark, out: 'cord' },
  winder: { body: '#b9bfc6', dark: C.steelDark, out: 'tape' },
};

/** A 1-tile machine from above: steel housing, accent top, a window showing what it makes. */
function machine(ctx, c, r, kind, inSide, outDir) {
  const M = MACH[kind];
  ctx.save();
  ctx.translate(tx(c), ty(r));
  shadow(ctx);
  box(ctx, -17, -17, 34, 34, 5, '#4b5058', 2.5);
  box(ctx, -14.5, -14.5, 29, 29, 4, M.body, 2);
  // Vent slots and corner bolts.
  ctx.fillStyle = M.dark;
  for (let k = 0; k < 3; k++) ctx.fillRect(-9 + k * 7, 11, 4, 2);
  for (const sx of [-11, 11]) for (const sy of [-11, 11]) circle(ctx, sx, sy, 1.5, C.steelLight, 1);
  circle(ctx, 0, -1, 9.5, C.paper, 2);
  item(ctx, M.out, 0, -1, 0, 0.92);
  inMark(ctx, inSide);
  outMark(ctx, outDir);
  ctx.restore();
}

/** Rebrander: a big roll of labels on a blue machine, stencil PREMIUM; puts out the same supply one tier up. */
function rebrander(ctx, c, r, inSide, outDir) {
  ctx.save();
  ctx.translate(tx(c), ty(r));
  shadow(ctx);
  box(ctx, -17, -17, 34, 34, 5, '#4b5058', 2.5);
  box(ctx, -14.5, -14.5, 29, 29, 4, C.blue, 2);
  // The label roll lying across the top, with its paper running down into the machine.
  ctx.fillStyle = C.paper;
  ctx.fillRect(-6, -4, 12, 6);
  box(ctx, -12, -14, 24, 11, 5, C.paper, 2);
  ctx.fillStyle = '#d9d4c2';
  ctx.fillRect(-11, -7, 22, 2.5);
  box(ctx, -14, -12.5, 4, 8, 1.5, C.steelDark, 1.4);
  box(ctx, 10, -12.5, 4, 8, 1.5, C.steelDark, 1.4);
  // A gold star sticker on the roll: what it slaps on things.
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI) / 5 - Math.PI / 2, rad = k % 2 ? 1.8 : 4;
    const px = Math.cos(a) * rad, py = -9.5 + Math.sin(a) * rad;
    if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  paint(ctx, '#ffc928', 1);
  inMark(ctx, inSide);
  outMark(ctx, outDir);
  // The stencil plate sits below the arrows so they never cover it.
  box(ctx, -16, 8.5, 32, 9, 2, INK, 0);
  text(ctx, 'PREMIUM', 0, 13.2, 6.6, '#ffd23f', 900);
  ctx.restore();
}

/**
 * Splitter: belts from side `from` curve off to each direction in `outs`, and a steel Y-shaped
 * divider plate sits where the goods part ways.
 */
function splitter(ctx, c, r, from, outs) {
  const straight = (from + 2) & 3;
  if (outs.includes(straight)) belt(ctx, c, r, straight);
  for (const d of outs) if (d !== straight) corner(ctx, c, r, from, d);
  ctx.save();
  ctx.translate(tx(c), ty(r));
  ctx.rotate(((from + 2) & 3) * Math.PI / 2); // local +x points away from the input
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  const wedge = (ox, oy) => {
    ctx.beginPath();
    ctx.moveTo(-9 + ox, oy);
    ctx.lineTo(1 + ox, -4 + oy);
    ctx.lineTo(9 + ox, -15 + oy);
    ctx.lineTo(16 + ox, -11 + oy);
    ctx.lineTo(8 + ox, 0 + oy);
    ctx.lineTo(16 + ox, 11 + oy);
    ctx.lineTo(9 + ox, 15 + oy);
    ctx.lineTo(1 + ox, 4 + oy);
    ctx.closePath();
  };
  wedge(2, 3); ctx.fill();
  wedge(0, 0);
  ctx.lineJoin = 'round';
  paint(ctx, C.steelLight, 2.2);
  circle(ctx, 1.5, 0, 1.8, C.steelDark, 1);
  ctx.restore();
}

/** Overpass: belt `low` runs across the floor; belt `high` passes over it on a short steel bridge. */
function overpass(ctx, c, r, lowDir, highDir, lowItems = null) {
  belt(ctx, c, r, lowDir);
  if (lowItems) lowItems();
  const x = tx(c), y = ty(r);
  // The bridge's shadow on the lower belt.
  ctx.save();
  ctx.translate(x + 4, y + 6);
  ctx.rotate(highDir * Math.PI / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(-18, -13, 38, 26);
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(highDir * Math.PI / 2);
  // The deck: a narrower belt between raised steel walls, so the lower belt shows on both sides.
  ctx.fillStyle = C.belt;
  ctx.fillRect(-HALF, -7, T, 14);
  ctx.save();
  ctx.beginPath(); ctx.rect(-HALF, -7, T, 14); ctx.clip();
  ctx.beginPath();
  for (let k = -1; k <= 3; k++) {
    const px = -HALF + k * SP + 4;
    ctx.moveTo(px - 3.5, -5); ctx.lineTo(px + 2, 0); ctx.lineTo(px - 3.5, 5);
  }
  ctx.strokeStyle = C.chevron; ctx.lineWidth = 2.8; ctx.stroke();
  ctx.restore();
  // Hazard-striped bridge walls, so it reads as a structure standing over the lower belt.
  hazard(ctx, -HALF, -13, T, 6, 4);
  hazard(ctx, -HALF, 7, T, 6, 4);
  ctx.beginPath();
  ctx.moveTo(-HALF, -13); ctx.lineTo(HALF, -13); ctx.moveTo(-HALF, 13); ctx.lineTo(HALF, 13);
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();
}

/** Returns Drop against the left wall: a steel chute mouth in a hazard frame, junk coming out of it. */
function returnsDrop(ctx, c, r) {
  const x0 = OX + c * T, y0 = OY + r * T;
  // The duct it comes down, set into the wall.
  box(ctx, x0 - 16, y0 + 6, 18, 28, 2, C.steelDark, 2);
  hazard(ctx, x0 + 1, y0 + 1, 30, 38, 5);
  box(ctx, x0 + 4, y0 + 11, 24, 25, 3, C.steel, 2);
  box(ctx, x0 + 9, y0 + 14, 22, 19, 3, '#121417', 2);
  box(ctx, x0 + 29, y0 + 11, 7, 25, 2, C.steelLight, 2);
  box(ctx, x0 + 2, y0 + 2, 34, 9, 1.5, INK, 0);
  text(ctx, 'RETURNS', x0 + 19, y0 + 6.8, 7.5, '#ffd23f', 900);
  item(ctx, 'junk', x0 + 24, y0 + 24, 0, 0.95);
}

/** Dumbwaiter: a steel lift hatch with a hazard border and an up arrow; a gauge panel beside it. */
function dumbwaiter(ctx, c, r, levels, gaugeSide = E) {
  const x0 = OX + c * T, y0 = OY + r * T;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x0 + 5, y0 + 6, 36, 36);
  hazard(ctx, x0 + 2, y0 + 2, 36, 36, 5);
  box(ctx, x0 + 7, y0 + 7, 26, 26, 2, C.steelDark, 2);
  box(ctx, x0 + 9, y0 + 9, 22, 22, 1.5, C.steel, 1.5);
  line(ctx, x0 + 20, y0 + 9.5, x0 + 20, y0 + 30.5, C.steelDark, 1.5);
  ctx.beginPath();
  ctx.moveTo(x0 + 20, y0 + 10.5); ctx.lineTo(x0 + 28, y0 + 19); ctx.lineTo(x0 + 23.5, y0 + 19);
  ctx.lineTo(x0 + 23.5, y0 + 29); ctx.lineTo(x0 + 16.5, y0 + 29); ctx.lineTo(x0 + 16.5, y0 + 19);
  ctx.lineTo(x0 + 12, y0 + 19); ctx.closePath();
  ctx.lineJoin = 'round';
  paint(ctx, '#ffe14a', 1.8);
  if (levels) gauges(ctx, gaugeSide === E ? x0 + 38 : x0 - 18, y0 + 4, levels);
}

/** Four little vertical gauge bars (red, green, orange, silver), 20 x 32. */
function gauges(ctx, x, y, levels) {
  box(ctx, x, y, 20, 32, 3, '#262b31', 1.8);
  for (let k = 0; k < 4; k++) {
    const bx = x + 2.5 + k * 4, by = y + 3, bh = 26;
    ctx.fillStyle = '#0d1014';
    ctx.fillRect(bx, by, 3, bh);
    const f = Math.max(0, Math.min(1, levels[k] || 0));
    ctx.fillStyle = SUPPLY[k];
    ctx.fillRect(bx, by + bh * (1 - f), 3, bh * f);
  }
}

/** Clearance Bin: a wire bin with leftovers in it, a red tag, and a tiny sale floating up. */
function clearanceBin(ctx, c, r, sale = true) {
  ctx.save();
  ctx.translate(tx(c), ty(r));
  shadow(ctx, 34, 32);
  box(ctx, -16, -16, 32, 31, 4, '#9aa1a9', 2.4);
  box(ctx, -12.5, -12.5, 25, 24, 2, '#2f3439', 1.5);
  item(ctx, 'spite', -5, -3, 0, 0.85);
  item(ctx, 'spite', 4, 1, 0, 0.85);
  item(ctx, 'spite', -2, 5, 0, 0.8);
  ctx.save();
  ctx.beginPath(); ctx.rect(-12.5, -12.5, 25, 24); ctx.clip();
  ctx.beginPath();
  for (let k = -30; k <= 30; k += 6) { ctx.moveTo(k - 15, -15); ctx.lineTo(k + 15, 15); ctx.moveTo(k + 15, -15); ctx.lineTo(k - 15, 15); }
  ctx.strokeStyle = 'rgba(212,216,220,0.75)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.rotate(-0.08);
  box(ctx, -18, 9, 36, 11, 2, C.red, 1.8);
  text(ctx, 'CLEARANCE', 0, 14.8, 6.6, '#ffffff', 900);
  ctx.restore();
  if (sale) {
    label(ctx, '+$1', 31, -8, 13, '#7CFC00');
    ctx.globalAlpha = 0.45;
    label(ctx, '+$1', 29, -24, 10, '#7CFC00');
  }
  ctx.restore();
}

/** Unpaid Intern: a small cartoon man in a hi-vis vest, holding one item, passing it in direction d. */
function intern(ctx, c, r, d, kind, tier = 0) {
  const x = tx(c), y = ty(r);
  // The way he passes things: a white arrow beside him, from the belt behind him to the thing in front.
  if (d === N || d === S) {
    const s = d === N ? -1 : 1;
    arrow(ctx, x + 14, y - s * 11, x + 14, y + s * 11);
  } else {
    const s = d === E ? 1 : -1;
    arrow(ctx, x - s * 11, y + 16, x + s * 11, y + 16);
  }
  ctx.save();
  ctx.translate(x - 2, y + 12);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(1, 0, 9, 3, 0, 0, TAU); ctx.fill();
  limb(ctx, -2.5, -9, -3.2, -1.5, '#2e3b55');
  shoe(ctx, -3.2, -0.8, '#2a2a2a');
  limb(ctx, 2, -9, 2.8, -1.5, '#2e3b55');
  shoe(ctx, 2.8, -0.8, '#2a2a2a');
  // Hi-vis vest over a grey T-shirt, with reflective stripes.
  ctx.beginPath(); ctx.ellipse(0, -14, 7.2, 7.6, 0, 0, TAU);
  paint(ctx, C.orange, 2);
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, -14, 6.2, 6.6, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = '#f7f3b0';
  ctx.fillRect(-8, -15.5, 16, 2);
  ctx.fillRect(-8, -10.5, 16, 2);
  ctx.fillStyle = '#7b828a';
  ctx.fillRect(-1, -22, 2.4, 6);
  ctx.restore();
  circle(ctx, 1, -25.5, 6.6, C.skin, 2);
  hairCap(ctx, 1, -25.5, 6.6, '#6b4423');
  face(ctx, 1, -24.5, 1);
  // Arms and the item he is passing.
  if (d === N) {
    limb(ctx, -4.5, -17, -4, -31, C.orange, 3);
    limb(ctx, 5, -17, 6, -31, C.orange, 3);
    item(ctx, kind, 1, -35, tier, 0.9);
  } else if (d === S) {
    limb(ctx, -4, -16, -1, -9, C.orange, 3);
    limb(ctx, 5, -16, 3, -9, C.orange, 3);
    item(ctx, kind, 1, -8, tier, 0.9);
  } else {
    const s = d === E ? 1 : -1;
    limb(ctx, 1, -16, 1 + s * 9, -17, C.orange, 3);
    if (kind) item(ctx, kind, 1 + s * 13, -17, tier, 0.9);
  }
  ctx.restore();
}

function arrow(ctx, x1, y1, x2, y2, color = '#ffffff') {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hx = x2 - Math.cos(a) * 5, hy = y2 - Math.sin(a) * 5;
  ctx.save();
  ctx.lineCap = 'round';
  line(ctx, x1, y1, hx, hy, INK, 5);
  line(ctx, x1, y1, hx, hy, color, 2.5);
  ctx.translate(x2, y2);
  ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(-6, -4.5); ctx.lineTo(-6, 4.5); ctx.closePath();
  ctx.lineJoin = 'round';
  paint(ctx, color, 1.6);
  ctx.restore();
}

// Body parts in the shoppers' style (src/render/shoppers.js).
function limb(ctx, x1, y1, x2, y2, color, w = 3.4) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = w + 2.4; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
}
function shoe(ctx, x, y, color) {
  ctx.beginPath(); ctx.ellipse(x + 1, y, 2.8, 1.7, 0, 0, TAU);
  paint(ctx, color, 1.4);
}
function hairCap(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r + 0.6, Math.PI * 0.92, Math.PI * 2.08);
  ctx.quadraticCurveTo(x + 2, y - 5, x - r - 0.4, y + 0.4);
  ctx.closePath();
  paint(ctx, color, 2);
}
function face(ctx, x, y, mood) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x + 1.2, y - 0.4, 1.3, 0, TAU);
  ctx.arc(x + 5, y - 0.4, 1.3, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  if (mood === 1) {
    ctx.moveTo(x - 0.8, y - 3); ctx.lineTo(x + 2.6, y - 3);
    ctx.moveTo(x + 3.8, y - 3); ctx.lineTo(x + 6.6, y - 3);
  } else {
    ctx.moveTo(x - 0.8, y - 4); ctx.lineTo(x + 2.4, y - 2.5);
    ctx.moveTo(x + 6.8, y - 4); ctx.lineTo(x + 3.9, y - 2.5);
  }
  ctx.stroke();
  if (mood === 0 || mood === 2) {
    ctx.beginPath();
    ctx.ellipse(x + 3.4, y + 3.3, mood === 2 ? 2.4 : 1.8, mood === 2 ? 2.2 : 1.3, 0, 0, TAU);
    paint(ctx, '#7a1010', 1);
  }
}

// ---------------------------------------------------------------------------------------------
// Security buildings (simplified copies of the game's drawings)

function sprinklerArt(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.arc(3, 5, 15, 0, TAU); ctx.fill();
  circle(ctx, 0, 0, 15, C.steel, 2.5);
  circle(ctx, 0, 0, 11, '#7d848b', 1.5);
  circle(ctx, 0, -2, 8.5, C.red, 2.5);
  ctx.translate(0, -2);
  ctx.rotate(0.3);
  ctx.beginPath();
  ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.moveTo(0, -11); ctx.lineTo(0, 11);
  ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.fillStyle = '#444';
  ctx.fillRect(9, -2, 4, 4); ctx.fillRect(-13, -2, 4, 4); ctx.fillRect(-2, 9, 4, 4); ctx.fillRect(-2, -13, 4, 4);
  ctx.rotate(-0.3);
  circle(ctx, 0, 0, 3.5, '#ffd3cc', 1.5);
  ctx.restore();
}

function forkliftArt(ctx, x, y, aim = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.arc(3, 5, 17, 0, TAU); ctx.fill();
  circle(ctx, 0, 0, 17, '#4b5058', 2.5);
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.arc(0, 0, 13.5, 0, TAU);
  ctx.strokeStyle = C.yellow; ctx.lineWidth = 3; ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(aim);
  ctx.translate(-4, 0);
  box(ctx, -12, -14, 8, 5, 1.5, '#23272b', 1.2);
  box(ctx, -12, 9, 8, 5, 1.5, '#23272b', 1.2);
  box(ctx, 3, -14, 8, 5, 1.5, '#23272b', 1.2);
  box(ctx, 3, 9, 8, 5, 1.5, '#23272b', 1.2);
  box(ctx, 13, -7.5, 13, 3.5, 1, '#9aa0a6', 1.3);
  box(ctx, 13, 4, 13, 3.5, 1, '#9aa0a6', 1.3);
  box(ctx, 15, -6, 13, 11, 2, C.cardboard, 1.6);
  box(ctx, 10, -10.5, 4.5, 21, 1, '#5b6168', 1.8);
  box(ctx, -15, -11, 27, 22, 5, C.yellow, 2.5);
  rr(ctx, -17, -9, 7, 18, 3);
  paint(ctx, '#2b2f34', 2);
  box(ctx, -7, -5, 7, 10, 2, '#2b2f34', 1.5);
  circle(ctx, 4, 0, 3, '#2b2f34', 1.2);
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.strokeRect(-9, -8.5, 16, 17);
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(7, 0); ctx.stroke();
  circle(ctx, -12, -7, 2.2, C.orange, 1.2);
  ctx.restore();
}

const SCAN = '#2f343a', SCAN_EDGE = '#5d6670', LASER = '#ff2d2d';
const BARS = [2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2];

/** Barcode Laser lying along x, facing +x, centred on its 3-tile footprint (x -60..60). */
function laserArt(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  box(ctx, -58, 2, 116, 13, 3, '#3b4148', 2.4);
  hazard(ctx, -54, 6, 13, 5, 4);
  hazard(ctx, 41, 6, 13, 5, 4);
  box(ctx, -32, -6, 8, 11, 1.5, '#5b6168', 1.6);
  box(ctx, 18, -6, 8, 11, 1.5, '#5b6168', 1.6);
  ctx.beginPath();
  ctx.moveTo(-46, -22); ctx.lineTo(22, -22); ctx.quadraticCurveTo(30, -22, 34, -31);
  ctx.lineTo(55, -31); ctx.quadraticCurveTo(58, -31, 58, -27); ctx.lineTo(58, 0);
  ctx.quadraticCurveTo(58, 4, 54, 4); ctx.lineTo(36, 4); ctx.quadraticCurveTo(30, 4, 26, -4);
  ctx.lineTo(-46, -4); ctx.quadraticCurveTo(-54, -4, -54, -13); ctx.quadraticCurveTo(-54, -22, -46, -22);
  ctx.closePath();
  ctx.lineJoin = 'round';
  paint(ctx, SCAN, 2.6);
  ctx.fillStyle = SCAN_EDGE;
  ctx.fillRect(-46, -20.5, 66, 2.6);
  ctx.fillStyle = '#1f2327';
  ctx.fillRect(-49, -19, 5, 13);
  box(ctx, -40, -18.5, 52, 11.5, 1.5, '#f4f1e6', 1.6);
  const total = BARS.reduce((a, b) => a + b, 0) + BARS.length - 1, k = 46 / total;
  let bx = -37;
  for (const b of BARS) { ctx.fillStyle = INK; ctx.fillRect(bx, -16.5, b * k, 7.5); bx += (b + 1) * k; }
  ctx.beginPath(); ctx.moveTo(44, -20.5); ctx.lineTo(51, -9); ctx.lineTo(37, -9); ctx.closePath();
  paint(ctx, '#ffd23f', 1.3);
  circle(ctx, 30, -10, 2, '#4ade80', 1.1);
  box(ctx, 55, -28, 5, 29, 2, LASER, 1.8);
  ctx.fillStyle = '#ffd0d0';
  ctx.fillRect(56.3, -25, 1.6, 22);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Floors, walls and set dressing

function backFloor(ctx) {
  ctx.fillStyle = BK.floor;
  ctx.fillRect(OX, OY, COLS * T, ROWS * T);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const h = hash2(c + 11, r + 5);
      if (h < 0.16) { ctx.fillStyle = BK.dark; ctx.fillRect(OX + c * T, OY + r * T, T, T); }
      else if (h > 0.9) { ctx.fillStyle = BK.patch; ctx.fillRect(OX + c * T, OY + r * T, T, T); }
      // Oil stains and cracks, so it reads as a basement, not a shop.
      const g = hash2(c * 7 + 3, r * 13 + 1);
      if (g > 0.86) {
        ctx.fillStyle = 'rgba(20,22,26,0.22)';
        ctx.beginPath();
        ctx.ellipse(OX + c * T + 10 + g * 20, OY + r * T + 14 + h * 12, 9, 5, g * 3, 0, TAU);
        ctx.fill();
      } else if (g < 0.08) {
        ctx.beginPath();
        const x0 = OX + c * T + 6, y0 = OY + r * T + 8;
        ctx.moveTo(x0, y0); ctx.lineTo(x0 + 9, y0 + 6); ctx.lineTo(x0 + 13, y0 + 4); ctx.lineTo(x0 + 22, y0 + 13);
        ctx.strokeStyle = 'rgba(25,28,32,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = BK.joint;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) { ctx.moveTo(OX + c * T, OY); ctx.lineTo(OX + c * T, OY + ROWS * T); }
  for (let r = 1; r < ROWS; r++) { ctx.moveTo(OX, OY + r * T); ctx.lineTo(OX + COLS * T, OY + r * T); }
  ctx.stroke();
}

function walls(ctx, color = C.wall) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 40, W, 20);
  ctx.fillRect(0, H - 20, W, 20);
  ctx.fillRect(0, 40, 20, H - 40);
  ctx.fillRect(W - 20, 40, 20, H - 40);
  ctx.fillStyle = C.wallTop;
  ctx.fillRect(0, 40, W, 3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(OX, OY, COLS * T, ROWS * T);
}

/** Concrete-block walls with pipes and a cable tray running along them. */
function backWalls(ctx) {
  walls(ctx, '#2a3037');
  ctx.strokeStyle = '#232930';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < W; x += 24) { ctx.moveTo(x, 40); ctx.lineTo(x, 60); ctx.moveTo(x + 12, H - 20); ctx.lineTo(x + 12, H); }
  ctx.moveTo(0, 50); ctx.lineTo(W, 50); ctx.moveTo(0, H - 10); ctx.lineTo(W, H - 10);
  ctx.stroke();
  // Two pipes along the top wall: a grey water main and a red one (the sprinklers' feed, presumably).
  pipe(ctx, 20, W - 20, OY + 4, 4.5, '#8f969d');
  pipe(ctx, 20, W - 20, OY - 6, 3.5, '#b03a30');
  // A cable tray along the bottom wall, cables in it.
  const ty0 = H - 20 - 7;
  box(ctx, 22, ty0, W - 44, 8, 1.5, '#3d434a', 1.6);
  for (const [dy, col] of [[2, '#2f8fe0'], [4, '#f2c21b'], [6, '#1d2125']]) line(ctx, 24, ty0 + dy, W - 24, ty0 + dy, col, 1.4);
  ctx.fillStyle = C.steelDark;
  for (let x = 40; x < W - 30; x += 60) ctx.fillRect(x, ty0 - 1, 3, 10);
}

function pipe(ctx, x1, x2, y, r, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x1, y + r - 1, x2 - x1, 4);
  ctx.fillStyle = color;
  ctx.fillRect(x1, y - r, x2 - x1, r * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x1, y - r + 1, x2 - x1, 1.2);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
  ctx.strokeRect(x1, y - r, x2 - x1, r * 2);
  for (let x = x1 + 50; x < x2 - 10; x += 110) box(ctx, x, y - r - 1.5, 5, r * 2 + 3, 1, C.steelDark, 1.4);
}

/** A square support pillar (wall colour), with yellow corner guards. */
function pillar(ctx, c, r) {
  const x = OX + c * T, y = OY + r * T;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + 8, y + 9, 32, 32);
  box(ctx, x + 4, y + 4, 32, 32, 2, C.wall, 2.5);
  box(ctx, x + 9, y + 9, 22, 22, 1, C.wallTop, 1.2);
  ctx.fillStyle = C.yellow;
  for (const [sx, sy] of [[4, 4], [30, 4], [4, 30], [30, 30]]) ctx.fillRect(x + sx, y + sy, 6, 6);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
  for (const [sx, sy] of [[4, 4], [30, 4], [4, 30], [30, 30]]) ctx.strokeRect(x + sx, y + sy, 6, 6);
}

function shopFloor(ctx) {
  ctx.fillStyle = C.floor;
  ctx.fillRect(OX, OY, COLS * T, ROWS * T);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const h = hash2(c + 3, r + 17);
      if (h < 0.12) { ctx.fillStyle = '#85888b'; ctx.fillRect(OX + c * T, OY + r * T, T, T); }
      if (hash2(c * 5, r * 3 + 2) > 0.9) {
        ctx.fillStyle = '#7f8285';
        ctx.beginPath(); ctx.ellipse(OX + c * T + 14, OY + r * T + 22, 4, 2.5, 0.4, 0, TAU); ctx.fill();
      }
    }
  }
  ctx.strokeStyle = C.joint;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) { ctx.moveTo(OX + c * T + 0.5, OY); ctx.lineTo(OX + c * T + 0.5, OY + ROWS * T); }
  for (let r = 1; r < ROWS; r++) { ctx.moveTo(OX, OY + r * T + 0.5); ctx.lineTo(OX + COLS * T, OY + r * T + 0.5); }
  ctx.stroke();
}

/** A shop shelf rack, one tile wide, from row r0 to r1, like the game's SALE shelves. */
function shelf(ctx, c, r0, r1) {
  const x = OX + c * T + 7, y = OY + r0 * T + 3, w = 26, h = (r1 - r0 + 1) * T - 6;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 4, y + 5, w, h);
  box(ctx, x, y, w, h, 2, '#f1f2f0', 2.2);
  box(ctx, x, y, w, 10, 1.5, C.red, 1.6);
  text(ctx, 'SALE', x + w / 2, y + 5.5, 6.5, '#ffffff', 900);
  const cols = [C.red, C.blue, C.green, C.yellow, '#9b59b6', C.orange, '#e74c8c', '#2fbfbf'];
  for (let yy = y + 14, k = 0; yy < y + h - 16; yy += 8, k++) {
    for (let j = 0; j < 2; j++) {
      const col = cols[(hash2(c * 3 + j, k + r0 * 7) * cols.length) | 0];
      if (hash2(k, j + c) > 0.5) circle(ctx, x + 7 + j * 12, yy + 3, 2.8, col, 1.1);
      else box(ctx, x + 3.5 + j * 12, yy, 7, 6, 1, col, 1.1);
    }
  }
  box(ctx, x, y + h - 9, w, 9, 1.5, C.yellow, 1.6);
  text(ctx, '50%', x + w / 2, y + h - 4.3, 6, INK, 900);
}

/** The shopper route: dashed yellow with a dark edge, as in the game. */
function route(ctx, pts) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.setLineDash([10, 7]);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = INK; ctx.lineWidth = 5.5; ctx.stroke();
  ctx.strokeStyle = C.yellow; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
}

/** A shopper in the game's side-on cartoon style, feet at (x, y), facing f (1 right, -1 left). */
function shopper(ctx, x, y, o) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(o.f || 1, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(1, 0, 9, 3, 0, 0, TAU); ctx.fill();
  const sw = o.sw ?? 0.7;
  limb(ctx, -2.5, -9, -2.5 - sw * 2.6, -1.5, o.pants);
  shoe(ctx, -2.5 - sw * 2.6, -0.8, '#3a2a20');
  limb(ctx, 2, -9, 2 + sw * 2.6, -1.5, o.pants);
  shoe(ctx, 2 + sw * 2.6, -0.8, o.cap ? '#f4f4f4' : '#3a2a20');
  ctx.beginPath(); ctx.ellipse(0, -14, o.fat ? 8.5 : 7, 7.5, 0, 0, TAU);
  paint(ctx, o.shirt, 2);
  circle(ctx, 1, -25.5, 6.8, C.skin, 2);
  if (o.cap) {
    // Dad: a navy cap with the brim forward, and a receipt held out.
    ctx.beginPath(); ctx.arc(1, -26.5, 7.3, Math.PI, TAU); ctx.closePath();
    paint(ctx, '#1f2f5a', 2);
    rr(ctx, 4, -28.5, 8, 3, 1.5); paint(ctx, '#1f2f5a', 1.6);
    face(ctx, 1, -24, 1);
    limb(ctx, 1.5, -15, 7, -13, o.shirt, 3);
    rr(ctx, 6.5, -20, 5, 10, 0.8); paint(ctx, C.paper, 1.2);
  } else {
    hairCap(ctx, 1, -25.5, 6.8, o.hair);
    face(ctx, 1, -24.5, o.mood ?? 0);
    limb(ctx, 1.5, -15, 6, -12, o.shirt, 3);
    if (o.bag) { box(ctx, 5, -13, 8, 8, 1.5, o.bag, 1.4); }
  }
  ctx.restore();
}

/** Compact supply badge: four pips (red, green, orange, silver), lit when stocked. */
function supplyBadge(ctx, x, y, lit) {
  box(ctx, x - 21, y - 7, 42, 14, 7, '#1d2125', 1.6);
  for (let k = 0; k < 4; k++) {
    const px = x - 13.5 + k * 9;
    if (lit[k]) {
      circle(ctx, px, y, 3.4, SUPPLY[k], 1.1);
      circle(ctx, px - 1, y - 1, 1, 'rgba(255,255,255,0.8)', 0);
    } else {
      circle(ctx, px, y, 3.4, '#3b4046', 1.1);
    }
  }
}

/** A red warning bubble with its tail pointing at (x, y), styled as if it flashes. */
function warnBubble(ctx, x, y, str, bx, by) {
  ctx.font = font(12, 900);
  const w = ctx.measureText(str).width + 34, h = 24;
  // Flash rays.
  ctx.save();
  ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (const [dx, dy, ex, ey] of [[-w / 2 - 4, -6, -w / 2 - 11, -11], [-w / 2 - 4, 4, -w / 2 - 12, 6], [w / 2 + 4, -6, w / 2 + 11, -11], [w / 2 + 4, 4, w / 2 + 12, 6]]) {
    ctx.beginPath(); ctx.moveTo(bx + dx, by + dy); ctx.lineTo(bx + ex, by + ey); ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(bx - 7, by + h / 2 - 1); ctx.lineTo(x, y); ctx.lineTo(bx + 7, by + h / 2 - 1);
  ctx.closePath();
  paint(ctx, C.red, 2);
  ctx.fillStyle = 'rgba(255,60,40,0.35)';
  rr(ctx, bx - w / 2 - 4, by - h / 2 - 4, w + 8, h + 8, 9);
  ctx.fill();
  box(ctx, bx - w / 2, by - h / 2, w, h, 7, C.red, 2.2);
  ctx.fillStyle = C.red;
  ctx.fillRect(bx - 6, by + h / 2 - 3, 12, 3);
  circle(ctx, bx - w / 2 + 12, by, 7, '#ffd23f', 1.5);
  text(ctx, '!', bx - w / 2 + 12, by + 0.5, 11, INK, 900);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.font = font(12, 900);
  ctx.fillText(str, bx - w / 2 + 24, by + 1);
}

/** A plain label with a thin leader line to one or more points. ghost: the dark "upstairs" style. */
function callout(ctx, str, anchors, lx, ly, ghost = false) {
  ctx.save();
  for (const [ax, ay] of anchors) {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(lx, ly);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.strokeStyle = ghost ? '#f2c21b' : C.paper; ctx.lineWidth = 1.5; ctx.stroke();
  }
  for (const [ax, ay] of anchors) circle(ctx, ax, ay, 2.8, ghost ? '#f2c21b' : C.paper, 1.2);
  ctx.font = font(12, 800);
  const w = ctx.measureText(str).width + 14, h = 20;
  box(ctx, lx - w / 2, ly - h / 2, w, h, 4, ghost ? '#1d2125' : C.paper, 1.6);
  text(ctx, str, lx, ly + 0.5, 12, ghost ? '#f2c21b' : INK, 800);
  ctx.restore();
}

function titleStrip(ctx, str) {
  ctx.fillStyle = '#171b20';
  ctx.fillRect(0, 0, W, 40);
  hazard(ctx, -2, 35, W + 4, 5, 5);
  ctx.font = font(19, 900);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.strokeText(str, 14, 18);
  ctx.fillStyle = C.yellow;
  ctx.fillText(str, 14, 18);
  ctx.font = font(11, 700);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8a929b';
  ctx.fillText('0.4 CONCEPT MOCK-UP', W - 14, 18);
}

/** Draws into an offscreen canvas the size of a picture. */
function layer(draw) {
  const c = document.createElement('canvas');
  c.width = W * zoom; c.height = H * zoom;
  const g = c.getContext('2d');
  g.scale(zoom, zoom);
  draw(g);
  return c;
}

/** Puts a layer over the picture at an opacity, optionally darkened first. */
function overlay(ctx, c, alpha, darken = 0) {
  if (darken) {
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `rgba(12,14,18,${darken})`;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(c, 0, 0, W, H);
  ctx.restore();
}

/** Upstairs, seen from The Back: the security buildings above and the shopper route, faint. */
function ghostUpstairs(ctx, draw, routePts) {
  if (routePts) overlay(ctx, layer((g) => route(g, routePts)), 0.38);
  // A faint colour copy, then the same drawing as white outlines on top: at 30% in their own
  // colours alone the buildings vanish into the busy dumbwaiter drawing underneath.
  overlay(ctx, layer(draw), 0.22);
  overlay(ctx, layer((g) => draw(lineArt(g, '#ffffff'))), 0.6);
}

/**
 * Wraps a canvas context so everything drawn through it comes out as outlines in one colour:
 * fills are dropped, filled rectangles become outlined ones, and stroke colours are ignored.
 */
function lineArt(g, color) {
  g.strokeStyle = color;
  return new Proxy(g, {
    get(t, k) {
      if (k === 'fill' || k === 'fillText') return () => {};
      if (k === 'fillRect') return (x, y, w, h) => t.strokeRect(x, y, w, h);
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set(t, k, v) {
      if (k !== 'strokeStyle' && k !== 'fillStyle') t[k] = v;
      return true;
    },
  });
}

/** A faint dashed square marking a building's footprint upstairs. */
function footprint(g, c, r, w = 1, h = 1) {
  g.save();
  g.setLineDash([5, 4]);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  g.strokeRect(OX + c * T + 2, OY + r * T + 2, w * T - 4, h * T - 4);
  g.restore();
}

// ---------------------------------------------------------------------------------------------
// Picture 1: one supply line

function pic1(ctx) {
  backFloor(ctx);
  backWalls(ctx);
  pillar(ctx, 2, 2);
  pillar(ctx, 9, 7);
  pillar(ctx, 16, 4);

  belt(ctx, 1, 5, E); belt(ctx, 2, 5, E);
  for (let c = 4; c <= 13; c++) belt(ctx, c, 5, E);
  corner(ctx, 14, 5, Wt, S);
  belt(ctx, 14, 6, S);
  returnsDrop(ctx, 0, 5);
  machine(ctx, 3, 5, 'still', Wt, E);
  clearanceBin(ctx, 14, 7);
  dumbwaiter(ctx, 6, 3, [1, 0, 0, 0]);
  dumbwaiter(ctx, 11, 3, [0.5, 0, 0, 0]);

  beltItems(ctx, 1, 5, E, 'junk');
  beltItems(ctx, 2, 5, E, 'junk', 0, [1 / 6, 0.5]);
  for (let c = 4; c <= 13; c++) {
    // Gaps after each intern: he has taken a bottle off the belt.
    const ps = c === 6 || c === 11 ? [5 / 6] : c === 12 ? [0.5] : P3;
    beltItems(ctx, c, 5, E, 'spite', 0, ps);
  }
  cornerItems(ctx, 14, 5, Wt, S, 'spite', 0, [0.5]);
  beltItems(ctx, 14, 6, S, 'spite', 0, [0.6]);

  intern(ctx, 6, 4, N, 'spite');
  intern(ctx, 11, 4, N, 'spite');

  ghostUpstairs(ctx, (g) => {
    footprint(g, 6, 3);
    footprint(g, 11, 3);
    sprinklerArt(g, tx(6), ty(3));
    forkliftArt(g, tx(11), ty(3), -Math.PI / 2);
  }, [[OX, ty(1)], [W - OX, ty(1)]]);

  callout(ctx, 'Returns Drop', [[tx(0), ty(5) + 18]], 62, ty(7) + 2);
  callout(ctx, 'Spite Still', [[tx(3), ty(5) + 16]], tx(3) + 6, ty(8) - 2);
  callout(ctx, 'Unpaid Intern', [[tx(6) + 20, ty(4) + 2], [tx(11) - 10, ty(4) + 2]], tx(8) + 20, ty(4) + 2);
  callout(ctx, 'Dumbwaiter + supply gauges', [[tx(6) + 20, ty(3) - 14], [tx(11) + 20, ty(3) - 14]], tx(8) + 20, ty(2) - 4);
  callout(ctx, 'Clearance Bin', [[tx(14) + 15, ty(7) + 6]], tx(16) - 20, ty(8) + 4);
  callout(ctx, 'upstairs: Pepper Sprinkler', [[tx(6) - 12, ty(3) - 6]], tx(3) + 6, ty(1) - 2, true);
  callout(ctx, 'upstairs: Forklift Turret', [[tx(11) + 6, ty(3) - 12]], tx(13) + 6, ty(1) - 2, true);
  callout(ctx, 'upstairs: shopper route', [[tx(9), ty(1)]], tx(9) - 6, ty(0) - 2, true);
}

// ---------------------------------------------------------------------------------------------
// Picture 2: splitting, crossing, rebranding

function pic2(ctx) {
  backFloor(ctx);
  backWalls(ctx);
  pillar(ctx, 8, 4);
  pillar(ctx, 15, 7);
  pillar(ctx, 5, 7);

  // Junk in, split two ways.
  belt(ctx, 1, 4, E);
  splitter(ctx, 2, 4, Wt, [N, S]);
  // Branch A: up to the Spite Still, split again into two Rebranders, merged, over to the forklift.
  belt(ctx, 2, 3, N);
  corner(ctx, 2, 2, S, E);
  belt(ctx, 4, 2, E);
  splitter(ctx, 5, 2, Wt, [N, S]);
  corner(ctx, 5, 1, S, E);
  corner(ctx, 5, 3, N, E);
  corner(ctx, 7, 1, Wt, S);
  corner(ctx, 7, 3, Wt, N);
  corner(ctx, 7, 2, N, E);
  corner(ctx, 7, 2, S, E);
  belt(ctx, 8, 2, E); belt(ctx, 9, 2, E);
  belt(ctx, 11, 2, E); belt(ctx, 12, 2, E);
  corner(ctx, 13, 2, Wt, S);
  belt(ctx, 13, 3, S);
  belt(ctx, 13, 4, S, true, false);
  // Branch B: down to the Cord Spooler, along, up across branch A, over to the laser.
  belt(ctx, 2, 5, S);
  corner(ctx, 2, 6, N, E);
  for (let c = 4; c <= 9; c++) belt(ctx, c, 6, E);
  corner(ctx, 10, 6, Wt, N);
  for (let r = 3; r <= 5; r++) belt(ctx, 10, r, N);
  corner(ctx, 10, 1, S, E);
  belt(ctx, 11, 1, E);
  belt(ctx, 12, 1, E, true, false);

  returnsDrop(ctx, 0, 4);
  machine(ctx, 3, 2, 'still', Wt, E);
  machine(ctx, 3, 6, 'spooler', Wt, E);
  rebrander(ctx, 6, 1, Wt, E);
  rebrander(ctx, 6, 3, Wt, E);
  dumbwaiter(ctx, 13, 6, [0.8, 0, 0, 0]);
  dumbwaiter(ctx, 14, 1, [0, 0, 0.6, 0], E);

  // Goods.
  beltItems(ctx, 1, 4, E, 'junk');
  beltItems(ctx, 2, 3, N, 'junk', 0, [1 / 6, 5 / 6]);
  cornerItems(ctx, 2, 2, S, E, 'junk', 0, [0.5]);
  beltItems(ctx, 4, 2, E, 'spite');
  cornerItems(ctx, 5, 1, S, E, 'spite', 0, [0.4]);
  cornerItems(ctx, 5, 3, N, E, 'spite', 0, [0.6]);
  cornerItems(ctx, 7, 1, Wt, S, 'spite', 1, [0.45]);
  cornerItems(ctx, 7, 3, Wt, N, 'spite', 1, [0.3]);
  for (const c of [8, 9, 11, 12]) beltItems(ctx, c, 2, E, 'spite', 1);
  cornerItems(ctx, 13, 2, Wt, S, 'spite', 1, [0.5]);
  beltItems(ctx, 13, 3, S, 'spite', 1);
  beltItems(ctx, 13, 4, S, 'spite', 1, [0.3]);
  beltItems(ctx, 2, 5, S, 'junk', 0, [0.5]);
  cornerItems(ctx, 2, 6, N, E, 'junk', 0, [0.3, 0.8]);
  for (let c = 4; c <= 9; c++) beltItems(ctx, c, 6, E, 'cord');
  cornerItems(ctx, 10, 6, Wt, N, 'cord');
  for (let r = 3; r <= 5; r++) beltItems(ctx, 10, r, N, 'cord');
  cornerItems(ctx, 10, 1, S, E, 'cord');
  beltItems(ctx, 11, 1, E, 'cord');
  beltItems(ctx, 12, 1, E, 'cord', 0, [1 / 6, 0.5]);
  // The crossing: silver-ringed bottles under the bridge, coils on top of it.
  overpass(ctx, 10, 2, E, N, () => beltItems(ctx, 10, 2, E, 'spite', 1, [0.12, 0.88]));
  beltItems(ctx, 10, 2, N, 'cord', 0, [0.5]);

  intern(ctx, 13, 5, S, 'spite', 1);
  intern(ctx, 13, 1, E, 'cord');

  ghostUpstairs(ctx, (g) => {
    footprint(g, 13, 6);
    footprint(g, 14, 1, 3, 1);
    forkliftArt(g, tx(13), ty(6), 2.5);
    laserArt(g, tx(15), ty(1) + 6);
  }, [[OX, ty(8)], [tx(11), ty(8)], [tx(11), ty(4)], [W - OX, ty(4)]]);

  callout(ctx, 'Splitter', [[tx(2) + 6, ty(4) + 4]], 52, ty(6) + 8);
  callout(ctx, 'Splitter', [[tx(5) + 6, ty(2) + 4]], tx(4) + 4, ty(4) - 4);
  callout(ctx, 'Rebrander', [[tx(6), ty(1) - 14]], tx(7) + 4, ty(0) - 4);
  callout(ctx, 'Rebrander', [[tx(6), ty(3) + 20]], tx(6) + 4, ty(4) + 14);
  callout(ctx, 'Overpass', [[tx(10) + 10, ty(2) - 4]], tx(11) + 20, ty(3) + 4);
  callout(ctx, 'Cord Spooler', [[tx(3), ty(6) + 16]], tx(3) + 20, ty(8) - 4);
  callout(ctx, 'Spite Still', [[tx(3) - 4, ty(2) - 14]], tx(3) - 30, ty(0) - 4);
  callout(ctx, 'upstairs: Forklift Turret', [[tx(13) + 14, ty(6) + 12]], tx(14) + 6, ty(8) - 2, true);
  callout(ctx, 'upstairs: Barcode Laser', [[tx(15) + 4, ty(1) - 14]], tx(14) + 10, ty(0) - 4, true);
}

// ---------------------------------------------------------------------------------------------
// Picture 3: the shop floor, with The Back showing through

/** The Back under the shop in picture 3, drawn into its own layer. */
function backUnderShop(g) {
  pillar(g, 5, 2);
  pillar(g, 15, 2);
  // Red line along row 5: three interns feed three dumbwaiters; the far end has run dry.
  belt(g, 1, 5, E);
  for (let c = 3; c <= 10; c++) belt(g, c, 5, E, true, c !== 10);
  returnsDrop(g, 0, 5);
  machine(g, 2, 5, 'still', Wt, E);
  for (const c of [1, 3, 4, 5, 6]) beltItems(g, c, 5, E, c === 1 ? 'junk' : 'spite');
  beltItems(g, 7, 5, E, 'spite', 0, [0.5]);
  dumbwaiter(g, 2, 3, null);
  intern(g, 2, 4, N, 'spite');
  dumbwaiter(g, 8, 3, null);
  intern(g, 8, 4, N, 'spite');
  dumbwaiter(g, 12, 5, null);
  intern(g, 11, 5, E, null);
  // Green line along row 7, into a clearance bin for now.
  belt(g, 1, 7, E);
  for (let c = 3; c <= 5; c++) belt(g, c, 7, E);
  returnsDrop(g, 0, 7);
  machine(g, 2, 7, 'cannery', Wt, E);
  for (let c = 3; c <= 5; c++) beltItems(g, c, 7, E, 'cola');
  clearanceBin(g, 6, 7, false);
  // Orange and silver lines at the top right.
  machine(g, 9, 1, 'spooler', Wt, E);
  belt(g, 10, 1, E); belt(g, 11, 1, E, true, false);
  beltItems(g, 10, 1, E, 'cord'); beltItems(g, 11, 1, E, 'cord', 0, [1 / 6, 0.5]);
  machine(g, 12, 2, 'winder', N, Wt);
  belt(g, 11, 2, Wt); belt(g, 10, 2, Wt, true, false);
  beltItems(g, 11, 2, Wt, 'tape'); beltItems(g, 10, 2, Wt, 'tape', 0, [1 / 6]);
}

function pic3(ctx) {
  shopFloor(ctx);
  walls(ctx);
  // Entrance (left wall, row 1) and tills (right wall, row 7).
  hazard(ctx, 2, OY + 1 * T + 2, 16, 36, 5);
  box(ctx, 6, OY + 1 * T + 6, 8, 28, 1.5, C.steel, 1.5);
  for (const r of [5, 6, 7]) {
    box(ctx, W - 19, OY + r * T + 8, 17, 24, 3, C.red, 1.8);
    box(ctx, W - 16, OY + r * T + 11, 11, 7, 1.5, C.screen, 1.2);
    text(ctx, '$', W - 10.5, OY + r * T + 25, 9, '#7CFC00', 900);
  }
  // Boxes on the wall tops, like the game's map edges.
  for (let x = 40; x < W - 40; x += 34) {
    const h = hash2(x, 3);
    if (h < 0.55) box(ctx, x, 44, 12, 9, 1, h < 0.3 ? C.cardboard : C.blue, 1.2);
    if (h > 0.4) box(ctx, x + 10, H - 15, 12, 9, 1, h > 0.7 ? C.cardboard : C.blue, 1.2);
  }

  // The Back, faint and darkened, under the floor.
  overlay(ctx, layer(backUnderShop), 0.27, 0.45);

  shelf(ctx, 4, 5, 8);
  shelf(ctx, 14, 0, 4);
  route(ctx, [[OX - 6, ty(1)], [tx(7), ty(1)], [tx(7), ty(7)], [W - OX + 2, ty(7)]]);

  laserArt(ctx, tx(2), ty(3) + 6);
  sprinklerArt(ctx, tx(8), ty(3));
  forkliftArt(ctx, tx(12), ty(5), 2.2);

  // Shoppers on the route.
  shopper(ctx, tx(1) + 6, ty(1) + 13, { shirt: '#3a7bd5', pants: '#3b4a6b', hair: '#3a2a20', f: 1 });
  shopper(ctx, tx(4) + 4, ty(1) + 13, { shirt: '#c0392b', pants: '#c8b48a', cap: true, f: 1 });
  shopper(ctx, tx(7) + 2, ty(4) + 10, { shirt: '#8e44ad', pants: '#2c3e50', hair: '#f1d36b', f: 1, mood: 2, bag: '#e74c8c' });
  shopper(ctx, tx(10) + 4, ty(7) + 13, { shirt: '#27ae60', pants: '#4a4a4a', hair: '#7a4b22', f: 1, fat: true });
  shopper(ctx, tx(13) + 4, ty(7) + 13, { shirt: '#f39c12', pants: '#c8b48a', cap: true, f: 1, sw: -0.6 });

  // Supply badges, and the forklift has run out of spite.
  supplyBadge(ctx, tx(2), ty(3) - 37, [1, 1, 1, 1]);
  supplyBadge(ctx, tx(8), ty(3) - 26, [1, 1, 1, 0]);
  supplyBadge(ctx, tx(12), ty(5) - 27, [0, 1, 1, 1]);
  warnBubble(ctx, tx(12) - 13, ty(5) - 34, 'OUT OF SPITE', tx(12) - 14, ty(4) - 30);

  callout(ctx, 'The Back, seen through the floor', [[tx(9) + 6, ty(5)]], tx(8) + 14, ty(6) - 2);

  // The button that flips to The Back.
  const bx = 474, by = 390, bw = 236, bh = 40;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  rr(ctx, bx + 3, by + 4, bw, bh, 8); ctx.fill();
  box(ctx, bx, by, bw, bh, 8, '#2d343c', 2.5);
  hazard(ctx, bx + 6, by + 6, 10, bh - 12, 4);
  ctx.font = font(15, 900);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.yellow;
  ctx.fillText('CHECK IN THE BACK', bx + 24, by + bh / 2 + 1);
  box(ctx, bx + bw - 52, by + 9, 42, 22, 4, C.paper, 2);
  ctx.fillStyle = '#c9ccc4';
  ctx.fillRect(bx + bw - 50, by + 26, 38, 3);
  text(ctx, 'Tab', bx + bw - 31, by + 19.5, 12, INK, 900);
}

// ---------------------------------------------------------------------------------------------
// Picture 4: parts sheet, every new thing large enough to judge

function pic4(ctx) {
  backFloor(ctx);
  backWalls(ctx);
  // Supplies, three brand tiers each, drawn at twice the size.
  const names = [['junk', 'Returned junk'], ['spite', 'Bottled Spite'], ['cola', 'Rage Cola'], ['cord', 'Extension Cord'], ['tape', 'Duct Tape']];
  box(ctx, OX + 8, OY + 8, COLS * T - 16, 146, 6, 'rgba(23,27,32,0.75)', 2);
  text(ctx, 'SUPPLIES (x2 size)   tiers: Store Brand / Premium (silver ring) / Platinum (gold ring)', W / 2, OY + 22, 11, '#d4d8dc', 800);
  names.forEach(([k, n], i) => {
    const cx = OX + 66 + i * 134;
    for (let t = 0; t < 3; t++) {
      if (k === 'junk' && t) continue;
      item(ctx, k, cx - 42 + t * 42 + (k === 'junk' ? 42 : 0), OY + 74, t, 2);
    }
    text(ctx, n, cx, OY + 120, 12, C.paper, 800);
    text(ctx, ['raw material', 'damage', 'speed', 'range', 'durability'][i], cx, OY + 137, 10, '#9aa1a9', 700);
  });
  // Buildings at true size, each on a short belt where it takes one.
  const y = 5;
  const parts = [
    ['Spite Still', 1], ['Cola Cannery', 3], ['Cord Spooler', 5], ['Tape Winder', 7],
    ['Rebrander', 9], ['Splitter', 11], ['Overpass', 13], ['Clearance Bin', 15],
  ];
  machine(ctx, 1, y, 'still', Wt, E);
  machine(ctx, 3, y, 'cannery', Wt, E);
  machine(ctx, 5, y, 'spooler', Wt, E);
  machine(ctx, 7, y, 'winder', Wt, E);
  rebrander(ctx, 9, y, Wt, E);
  splitter(ctx, 11, y, Wt, [N, S, E]);
  overpass(ctx, 13, y, E, N, () => beltItems(ctx, 13, y, E, 'spite', 0, [0.12, 0.88]));
  beltItems(ctx, 13, y, N, 'cord', 0, [0.5]);
  clearanceBin(ctx, 15, y);
  parts.forEach(([n, c]) => text(ctx, n, tx(c), ty(y) + 30, 11, C.paper, 800));
  returnsDrop(ctx, 0, 7);
  dumbwaiter(ctx, 5, 7, [1, 0.6, 0.3, 0]);
  intern(ctx, 10, 7, E, 'tape', 2);
  text(ctx, 'Returns Drop', tx(0) + 14, ty(7) + 30, 11, C.paper, 800);
  text(ctx, 'Dumbwaiter + gauges', tx(5) + 14, ty(7) + 30, 11, C.paper, 800);
  text(ctx, '(red full, green 60%, orange 30%, silver empty)', tx(5) + 14, ty(7) + 45, 9.5, '#9aa1a9', 700);
  text(ctx, 'Unpaid Intern (holding Platinum tape)', tx(10), ty(7) + 30, 11, C.paper, 800);
}

// ---------------------------------------------------------------------------------------------

const PICS = [
  { title: 'THE BACK: one supply line', file: 'back-basics.png', draw: pic1 },
  { title: 'THE BACK: splitting, crossing, rebranding', file: 'back-split-cross.png', draw: pic2 },
  { title: 'SHOP FLOOR: The Back shows through', file: 'shop-floor-over-back.png', draw: pic3 },
  { title: 'THE BACK: parts sheet', file: 'back-parts.png', draw: pic4 },
];

const params = new URLSearchParams(location.search);
const one = Number(params.get('pic')) || 0;
/** ?zoom=2 draws at twice the size, for checking details. */
const zoom = Number(params.get('zoom')) || 1;
document.body.className = one ? 'one' : 'all';
PICS.forEach((p, i) => {
  if (one && one !== i + 1) return;
  if (!one) {
    const h = document.createElement('h2');
    h.textContent = `${i + 1}. ${p.file}`;
    document.body.appendChild(h);
  }
  const cv = document.createElement('canvas');
  // ?crop=x,y,w,h shows only that part of the picture (for checking details with zoom).
  const crop = (params.get('crop') || `0,0,${W},${H}`).split(',').map(Number);
  cv.width = crop[2] * zoom;
  cv.height = crop[3] * zoom;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.scale(zoom, zoom);
  ctx.translate(-crop[0], -crop[1]);
  p.draw(ctx);
  titleStrip(ctx, p.title);
});
