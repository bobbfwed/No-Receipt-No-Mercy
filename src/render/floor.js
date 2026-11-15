// The warehouse itself: concrete floor, walls, pillars, the doors on the left and the tills on the
// right. Almost all of it never changes, so drawStatic() paints it once into a cached layer; only
// the doors (open during a wave) and the till displays (flash on a refund) are drawn every frame.
import { W, H } from '../sim/index.js';
import {
  TILE, INK, C, rr, paint, box, text, hazard, hash2,
} from './paint.js';

const T = TILE;

const isWall = (tiles, x, y) => x < 0 || y < 0 || x >= W || y >= H || tiles[y * W + x] === '#';

/** Tile rows of the doors and tills, found from the map once. */
export function findSpecial(tiles) {
  const doors = [], tills = [];
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === 'D') doors.push(i);
    if (tiles[i] === 'T') tills.push(i);
  }
  return { doors, tills };
}

/** Paints everything that never changes. The caller has set the world transform. */
export function drawStatic(ctx, tiles) {
  drawConcrete(ctx, tiles);
  drawWalls(ctx, tiles);
  for (let i = 0; i < tiles.length; i++) {
    const x = i % W, y = (i / W) | 0;
    if (tiles[i] === 'T') drawTill(ctx, x * T, y * T);
    if (tiles[i] === 'D') drawDoorMat(ctx, x * T, y * T);
  }
  drawSigns(ctx, tiles);
}

function drawConcrete(ctx, tiles) {
  ctx.fillStyle = C.floor;
  ctx.fillRect(0, 0, W * T, H * T);

  // Slightly lighter and darker concrete slabs, and the odd oil spot, so the floor is not flat.
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const r = hash2(x, y);
      if (r < 0.18) {
        ctx.fillStyle = r < 0.07 ? 'rgba(40,42,46,0.06)' : 'rgba(255,255,255,0.045)';
        ctx.fillRect(x * T, y * T, T, T);
      } else if (r > 0.965) {
        ctx.fillStyle = 'rgba(30,32,36,0.10)';
        ctx.beginPath();
        ctx.ellipse(x * T + 20, y * T + 22, 9, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(x * T + 27, y * T + 17, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Tile grid.
  ctx.beginPath();
  for (let x = 0; x <= W; x++) { ctx.moveTo(x * T + 0.5, 0); ctx.lineTo(x * T + 0.5, H * T); }
  for (let y = 0; y <= H; y++) { ctx.moveTo(0, y * T + 0.5); ctx.lineTo(W * T, y * T + 0.5); }
  ctx.strokeStyle = C.floorLine;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Expansion joints every five tiles, a little darker.
  ctx.beginPath();
  for (let x = 5; x < W; x += 5) { ctx.moveTo(x * T + 0.5, 0); ctx.lineTo(x * T + 0.5, H * T); }
  for (let y = 4; y < H; y += 4) { ctx.moveTo(0, y * T + 0.5); ctx.lineTo(W * T, y * T + 0.5); }
  ctx.strokeStyle = C.joint;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // A small dot in the middle of every tile helps judge positions.
  ctx.fillStyle = C.floorDot;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (tiles[y * W + x] === '.') ctx.fillRect(x * T + 19, y * T + 19, 3, 3);
    }
  }
  // Painted floor markings: a yellow safety line along the walls, and hatched "keep clear"
  // zones inside the doors and in front of the tills.
  ctx.strokeStyle = 'rgba(242,194,27,0.75)';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 8]);
  ctx.strokeRect(T + 6, T + 6, (W - 2) * T - 12, (H - 2) * T - 12);
  ctx.setLineDash([]);
  for (let i = 0; i < tiles.length; i++) {
    const x = i % W, y = (i / W) | 0;
    if (tiles[i] === 'D') hatch(ctx, (x + 1) * T, y * T, T, T);
    if (tiles[i] === 'T') hatch(ctx, (x - 1) * T, y * T, T, T);
  }
}

/** Faint diagonal yellow stripes painted on the floor. */
function hatch(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(242,194,27,0.42)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let s = -h; s < w; s += 13) { ctx.moveTo(x + s, y + h); ctx.lineTo(x + s + h, y); }
  ctx.stroke();
  ctx.restore();
}

function drawWalls(ctx, tiles) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (tiles[y * W + x] !== '#') continue;
      const inner = x > 0 && y > 0 && x < W - 1 && y < H - 1;
      if (inner) drawPillar(ctx, x * T, y * T);
      else {
        ctx.fillStyle = C.wall;
        ctx.fillRect(x * T, y * T, T, T);
      }
    }
  }
  // A lighter lip along every wall edge that faces the floor, then an ink line on that edge.
  ctx.beginPath();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (tiles[y * W + x] !== '#' || (x > 0 && y > 0 && x < W - 1 && y < H - 1)) continue;
      const px = x * T, py = y * T;
      ctx.fillStyle = C.wallLip;
      if (!isWall(tiles, x, y + 1)) { ctx.fillRect(px, py + T - 7, T, 7); ctx.moveTo(px, py + T); ctx.lineTo(px + T, py + T); }
      if (!isWall(tiles, x, y - 1)) { ctx.fillRect(px, py, T, 4); ctx.moveTo(px, py); ctx.lineTo(px + T, py); }
      if (!isWall(tiles, x + 1, y)) { ctx.fillRect(px + T - 6, py, 6, T); ctx.moveTo(px + T, py); ctx.lineTo(px + T, py + T); }
      if (!isWall(tiles, x - 1, y)) { ctx.fillRect(px, py, 6, T); ctx.moveTo(px, py); ctx.lineTo(px, py + T); }
    }
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Pallet racking along the top and bottom walls: orange beams and boxes, purely decoration.
  for (const wy of [0, H - 1]) {
    for (let x = 1; x < W - 1; x++) {
      if (tiles[wy * W + x] !== '#') continue;
      const px = x * T, py = wy * T + (wy === 0 ? 4 : 10);
      ctx.fillStyle = '#e8761a';
      ctx.fillRect(px, py + (wy === 0 ? 22 : 2), T, 4);
      if (x % 3 === 0) { ctx.fillStyle = '#2f6fbf'; ctx.fillRect(px - 2, py, 4, 28); }
      const r = hash2(x, wy + 50);
      if (r < 0.75) {
        const bw = 14 + r * 12, bh = 12 + r * 6;
        box(ctx, px + 4 + r * 6, py + (wy === 0 ? 22 - bh : 6), bw, bh, 1.5, r < 0.25 ? '#4b8fd0' : C.cardboard, 1.5);
        if (r >= 0.25) { ctx.fillStyle = C.cardboardLight; ctx.fillRect(px + 4 + r * 6 + bw / 2 - 2, py + (wy === 0 ? 22 - bh : 6) + 1, 4, bh - 2); }
      }
    }
  }
}

/** An inner wall tile: a concrete pillar wrapped in a hazard-striped guard. */
function drawPillar(ctx, px, py) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(px + 4, py + 6, T - 2, T - 2);
  hazard(ctx, px + 2, py + 2, T - 4, T - 4, 6);
  box(ctx, px + 8, py + 7, T - 16, T - 16, 2, '#9ea3a8', 2.5);
  ctx.fillStyle = '#b8bdc2';
  ctx.fillRect(px + 10, py + 9, T - 20, 5);
}

/** The floor of a door tile: a dark entrance mat with arrows pointing in. */
function drawDoorMat(ctx, px, py) {
  ctx.fillStyle = '#3a3f45';
  ctx.fillRect(px, py, T, T);
  ctx.strokeStyle = C.yellow;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + 12, py + 12); ctx.lineTo(px + 20, py + 20); ctx.lineTo(px + 12, py + 28);
  ctx.moveTo(px + 22, py + 12); ctx.lineTo(px + 30, py + 20); ctx.lineTo(px + 22, py + 28);
  ctx.stroke();
}

/** A red checkout till facing into the store. */
function drawTill(ctx, px, py) {
  ctx.fillStyle = C.floor;
  ctx.fillRect(px, py, T, T);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(px + 6, py + 6, 34, 34);
  // Counter body: top surface plus a darker front face (seen in three-quarter view).
  box(ctx, px + 3, py + 3, 35, 34, 4, C.red, 2.5);
  rr(ctx, px + 3, py + 27, 35, 10, 3);
  paint(ctx, C.redDark, 2.5);
  // Customer screen and the cash display.
  box(ctx, px + 7, py + 6, 13, 10, 2, C.screen, 1.8);
  box(ctx, px + 21, py + 8, 14, 16, 2, '#3a3a3a', 1.8);
  // Receipt printer slot.
  ctx.fillStyle = INK;
  ctx.fillRect(px + 8, py + 20, 10, 3);
  ctx.fillStyle = C.paper;
  ctx.fillRect(px + 10, py + 18, 6, 4);
}

/** Wall signs: ENTRANCE by the doors, RETURNS and NO RECEIPT NO REFUND by the tills. */
function drawSigns(ctx, tiles) {
  // Vertical signs on the 40-pixel-wide side walls, text rotated to read along the wall.
  verticalSign(ctx, 2, 2.3, 4.4, '#1f8f3a', '#ffffff', ['ENTRANCE']);
  verticalSign(ctx, W * T - 20, 0.8, 4.0, C.red, '#ffffff', ['RETURNS']);
  verticalSign(ctx, W * T - 20, 11.2, 14.4, C.yellow, INK, ['NO RECEIPT', 'NO REFUND']);
  // Hazard stripes on the door jambs, above and below the opening.
  const { doors } = findSpecial(tiles);
  if (doors.length) {
    const top = Math.min(...doors.map((i) => (i / W) | 0));
    const bot = Math.max(...doors.map((i) => (i / W) | 0)) + 1;
    hazard(ctx, 0, top * T - 14, T, 14, 6);
    hazard(ctx, 0, bot * T, T, 14, 6);
  }
}

function verticalSign(ctx, cx, y1, y2, bg, fg, lines) {
  const yTop = y1 * T, yBot = y2 * T;
  const x = cx === 2 ? 5 : cx - 15;
  box(ctx, x, yTop, 30, yBot - yTop, 5, bg, 2.5);
  ctx.save();
  ctx.translate(x + 15, (yTop + yBot) / 2);
  ctx.rotate(cx === 2 ? -Math.PI / 2 : Math.PI / 2);
  if (lines.length === 1) text(ctx, lines[0], 0, 1, 15, fg, 900);
  else { text(ctx, lines[0], 0, -6, 10, fg, 900); text(ctx, lines[1], 0, 7, 10, fg, 900); }
  ctx.restore();
}

/**
 * Parts of the warehouse that change: sliding doors (open while shoppers arrive) and till
 * displays (flash red right after a refund).
 * @param {number} open 0 closed .. 1 open
 * @param {Float64Array} tillAt per-row time (ms) of the last refund at that row's till
 */
export function drawDynamic(ctx, special, open, tillAt, now) {
  if (special.doors.length) {
    // Two sliding glass panels across the whole doorway; they slide into the walls on either
    // side while a wave is on. Door tiles are assumed to be one column, in consecutive rows.
    const px = (special.doors[0] % W) * T;
    const top = ((special.doors[0] / W) | 0) * T;
    const bot = ((special.doors[special.doors.length - 1] / W) | 0) * T + T;
    const half = (bot - top) / 2;
    const slide = open * (half - 6);
    box(ctx, px + 16, top - slide, 8, half, 2, C.glass, 2);
    box(ctx, px + 16, top + half + slide, 8, half, 2, C.glass, 2);
    // Green light over the doorway when open, red when shut.
    ctx.fillStyle = open > 0.5 ? '#4ade80' : '#ef4444';
    ctx.beginPath();
    ctx.arc(px + 33, top - 7, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  for (const i of special.tills) {
    const px = (i % W) * T, py = ((i / W) | 0) * T;
    const since = now - tillAt[(i / W) | 0];
    const hot = since < 900 && ((since / 150) | 0) % 2 === 0;
    box(ctx, px + 21, py + 8, 14, 16, 2, hot ? '#7a1010' : '#3a3a3a', 1.8);
    text(ctx, hot ? '-$' : '$', px + 28, py + 16.5, 11, hot ? '#ff6b5e' : '#7CFC00', 900);
  }
}
