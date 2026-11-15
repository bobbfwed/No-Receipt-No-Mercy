// The canvas renderer: draws the warehouse, everything built in it, the shoppers, effects, the
// placement preview and the other players' pointers. Interface (see docs/architecture.md):
//   const renderer = createRenderer(canvas, session);
//   renderer.resize();                  after the canvas element changes size
//   renderer.tileAt(clientX, clientY);  -> {x, y} tile under a mouse position, or null
//   renderer.draw(view);                once per animation frame
//
// The world is W x H tiles of TILE logical pixels (1200 x 640). It is scaled to fit the canvas,
// keeping its aspect ratio, and centred; the letterbox around it is left transparent so the page
// background shows through. The parts are split by layer:
//   floor.js      walls, doors, tills (mostly cached in an offscreen layer)
//   buildings.js  belts, machines, security
//   items.js      goods on belts (pre-rendered sprites)
//   shoppers.js   the five kinds of shopper
//   effects.js    floating cash, speech blips, shots and sprays from session.drainFx()
import { W, H, MAP, BUILD, TUNE, TICK_HZ, ST, canPlace } from '../sim/index.js';
import { TILE, INK, rr, paint, label, font } from './paint.js';
import { drawStatic, drawDynamic, findSpecial } from './floor.js';
import {
  beltShape, drawBelt, drawBeltItems, drawBuilding, createBeltSprites, createBuildingSprites, SP,
} from './buildings.js';
import { buildItemSprites } from './items.js';
import { drawShopper, shadowPath, createShopperSprites } from './shoppers.js';
import { createEffects } from './effects.js';

const T = TILE;
const WORLD_W = W * T, WORLD_H = H * T;
const RANGE_DASH = [7, 5];
const NO_DASH = [];

const byY = (a, b) => a.y - b.y;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Object} session a HostSession or ClientSession
 */
export function createRenderer(canvas, session) {
  const ctx = canvas.getContext('2d');
  let scale = 1, ox = 0, oy = 0;
  let cssW = -1, cssH = -1, dprSeen = 0;
  /** World-to-screen transform, handed to code that sets its own transforms. */
  const base = { s: 1, ox: 0, oy: 0 };
  /** Cached floor/walls layer, at screen resolution. */
  let floorLayer = null;
  let floorTiles = '';
  let sprites = buildItemSprites(1);
  const beltSprites = createBeltSprites();
  const buildingSprites = createBuildingSprites();
  const shopperSprites = createShopperSprites();
  const fx = createEffects();
  const special = findSpecial(MAP.join(''));
  const order = []; // shoppers sorted for drawing, reused every frame
  const facing = new Map(); // shopper id -> 1 or -1, so a stopped shopper keeps facing the same way
  const shapes = new Int8Array(W * H); // belt bend per tile, worked out once per frame
  let doorOpen = 0;
  let lastNow = 0;
  let frames = 0;
  /** Everything a building or shopper drawing needs about the current frame. */
  const F = { time: 0, now: 0, alpha: 0, sprites, fx: fx.timers };
  /** A fake building used to draw the placement ghost. */
  const ghost = { k: '', o: 0, d: 0, it: [], t: 0, n: 0, out: 0, cd: 0, a: 0 };
  const nameWidths = new Map();

  function resize() {
    const dpr = globalThis.devicePixelRatio || 1;
    dprSeen = dpr;
    const rect = canvas.getBoundingClientRect();
    cssW = canvas.clientWidth;
    cssH = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    scale = Math.min(canvas.width / WORLD_W, canvas.height / WORLD_H);
    ox = Math.round((canvas.width - WORLD_W * scale) / 2);
    oy = Math.round((canvas.height - WORLD_H * scale) / 2);
    base.s = scale; base.ox = ox; base.oy = oy;
    floorLayer = null;
    sprites = buildItemSprites(scale);
    F.sprites = sprites;
    beltSprites.setScale(scale);
    buildingSprites.setScale(scale);
    shopperSprites.setScale(scale);
  }

  function tileAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const kx = canvas.width / Math.max(1, rect.width);
    const ky = canvas.height / Math.max(1, rect.height);
    const px = (clientX - rect.left) * kx - ox;
    const py = (clientY - rect.top) * ky - oy;
    const x = Math.floor(px / (T * scale));
    const y = Math.floor(py / (T * scale));
    return x >= 0 && y >= 0 && x < W && y < H ? { x, y } : null;
  }

  /** Paints the floor, walls, doors mats and tills once into an offscreen canvas. */
  function buildFloor(tiles) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(WORLD_W * scale));
    c.height = Math.max(1, Math.round(WORLD_H * scale));
    const g = c.getContext('2d');
    g.setTransform(c.width / WORLD_W, 0, 0, c.height / WORLD_H, 0, 0);
    drawStatic(g, tiles);
    floorLayer = c;
    floorTiles = tiles;
  }

  function draw(view = {}) {
    // Follow size changes even if the page forgets to call resize().
    if (canvas.clientWidth !== cssW || canvas.clientHeight !== cssH || (globalThis.devicePixelRatio || 1) !== dprSeen) resize();
    const s = session.state;
    const events = session.drainFx();
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!s) return;
    fx.handle(events, now);

    const alpha = session.alpha();
    F.alpha = alpha;
    F.now = now;
    F.time = (s.tick + alpha) / TICK_HZ;

    if (!floorLayer || floorTiles !== s.tiles) buildFloor(s.tiles);
    ctx.drawImage(floorLayer, ox, oy);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_W, WORLD_H);
    ctx.clip();

    // Doors slide open while a wave is on.
    doorOpen += ((s.phase === 'wave' ? 1 : 0) - doorOpen) * Math.min(1, dt * 4);
    drawDynamic(ctx, special, doorOpen, fx.timers.tillAt, now);

    const grid = s.grid;
    // Belts first (flat on the floor), then the goods riding on them, then everything else.
    const phase = (((F.time * TUNE.beltSpeed * T) % SP) + SP) % SP;
    for (let i = 0; i < grid.length; i++) {
      const b = grid[i];
      if (!b || b.k !== 'belt') continue;
      const x = i % W, y = (i / W) | 0;
      const sh = beltShape(grid, x, y, b.d);
      shapes[i] = sh;
      drawBelt(ctx, grid, x, y, b.d, sh, phase, beltSprites, base);
    }
    for (let i = 0; i < grid.length; i++) {
      const b = grid[i];
      if (b && b.k === 'belt') drawBeltItems(ctx, b, i % W, (i / W) | 0, shapes[i], alpha, sprites);
    }
    for (let i = 0; i < grid.length; i++) {
      const b = grid[i];
      if (b && b.k !== 'belt') drawBuilding(ctx, b, i, F, buildingSprites);
    }

    fx.draw(ctx, now, 0, sprites);
    drawShoppers(s, alpha);
    fx.draw(ctx, now, 1, sprites);
    drawPreview(s, view);
    if (view.cursors) drawCursors(s, view.cursors);
    ctx.restore();
  }

  function drawShoppers(s, alpha) {
    order.length = 0;
    for (const sh of s.shoppers) order.push(sh);
    order.sort(byY);
    // All ground shadows in one path, then the figures back to front.
    ctx.beginPath();
    for (let n = 0; n < order.length; n++) {
      const sh = order[n];
      if (sh.st !== ST.LEAVE) shadowPath(ctx, sh, (sh.x + sh.vx * alpha) * T, (sh.y + sh.vy * alpha) * T);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    for (let n = 0; n < order.length; n++) {
      const sh = order[n];
      let f = facing.get(sh.id);
      if (sh.vx > 0.002 && f !== 1) { f = 1; facing.set(sh.id, 1); } else if (sh.vx < -0.002 && f !== -1) { f = -1; facing.set(sh.id, -1); }
      drawShopper(ctx, sh, (sh.x + sh.vx * alpha) * T, (sh.y + sh.vy * alpha) * T, f || 1, F, shopperSprites);
    }
    // Forget shoppers who have gone, now and then.
    if (++frames % 600 === 0 && facing.size > order.length + 20) {
      const live = new Set();
      for (const sh of order) live.add(sh.id);
      for (const id of facing.keys()) if (!live.has(id)) facing.delete(id);
    }
  }

  function rangeCircle(cx, cy, range, ok) {
    ctx.beginPath();
    ctx.arc(cx, cy, range * T, 0, Math.PI * 2);
    ctx.fillStyle = ok ? 'rgba(255,255,255,0.13)' : 'rgba(239,68,68,0.12)';
    ctx.fill();
    ctx.setLineDash(RANGE_DASH);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,120,110,0.9)';
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
  }

  /** Ghost of the selected building at the hovered tile, or the remove highlight. */
  function drawPreview(s, view) {
    const h = view.hover;
    if (!h || h.x < 0 || h.y < 0 || h.x >= W || h.y >= H) return;
    const i = h.y * W + h.x;
    const px = h.x * T, py = h.y * T, cx = px + T / 2, cy = py + T / 2;
    const here = s.grid[i];
    const tool = view.tool;

    if (tool === 'remove') {
      rr(ctx, px + 1, py + 1, T - 2, T - 2, 5);
      ctx.fillStyle = here ? 'rgba(239,68,68,0.45)' : 'rgba(239,68,68,0.12)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ef4444';
      ctx.stroke();
      if (here) {
        ctx.beginPath();
        ctx.moveTo(cx - 9, cy - 9); ctx.lineTo(cx + 9, cy + 9);
        ctx.moveTo(cx + 9, cy - 9); ctx.lineTo(cx - 9, cy + 9);
        ctx.lineCap = 'round';
        ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.stroke();
        ctx.strokeStyle = '#ff4b3a'; ctx.lineWidth = 4; ctx.stroke();
      }
      return;
    }

    const def = tool ? BUILD[tool] : null;
    if (def) {
      const ok = canPlace(s, tool, h.x, h.y) === null;
      if (def.range) rangeCircle(cx, cy, def.range, ok);
      rr(ctx, px + 1, py + 1, T - 2, T - 2, 5);
      ctx.fillStyle = ok ? 'rgba(74,222,128,0.35)' : 'rgba(239,68,68,0.4)';
      ctx.fill();
      ghost.k = tool;
      ghost.d = (view.dir | 0) & 3;
      ghost.o = session.me;
      ghost.a = ((view.dir | 0) & 3) * Math.PI / 2;
      ctx.globalAlpha = 0.7;
      if (tool === 'belt') drawBelt(ctx, s.grid, h.x, h.y, ghost.d, beltShape(s.grid, h.x, h.y, ghost.d), 0, beltSprites, base);
      else drawBuilding(ctx, ghost, i, F, buildingSprites);
      ctx.globalAlpha = 1;
      rr(ctx, px + 1, py + 1, T - 2, T - 2, 5);
      ctx.fillStyle = ok ? 'rgba(74,222,128,0.18)' : 'rgba(239,68,68,0.3)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = ok ? '#22c55e' : '#ef4444';
      ctx.stroke();
      return;
    }

    // No tool: show the range of a tower under the mouse, and a light hover outline.
    if (here && BUILD[here.k] && BUILD[here.k].range) rangeCircle(cx, cy, BUILD[here.k].range, true);
    rr(ctx, px + 1, py + 1, T - 2, T - 2, 5);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.stroke();
  }

  /** Other players' pointers: an arrow in the player's colour with the name beside it. */
  function drawCursors(s, cursors) {
    for (const [pid, c] of cursors) {
      if (pid === session.me || !c) continue;
      const p = s.players[pid];
      if (!p || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
      const x = c.x * T, y = c.y * T;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 18);
      ctx.lineTo(x + 4.5, y + 14);
      ctx.lineTo(x + 8, y + 21);
      ctx.lineTo(x + 11.5, y + 19.5);
      ctx.lineTo(x + 8, y + 12.5);
      ctx.lineTo(x + 13.5, y + 12.5);
      ctx.closePath();
      ctx.lineJoin = 'round';
      paint(ctx, p.color, 2);
      ctx.font = font(11);
      let w = nameWidths.get(p.name);
      if (!w) { w = ctx.measureText(p.name).width + 10; nameWidths.set(p.name, w); }
      rr(ctx, x + 12, y + 18, w, 16, 5);
      paint(ctx, p.color, 1.8);
      label(ctx, p.name, x + 12 + w / 2, y + 26.5, 11, '#ffffff', INK, 2.5);
    }
  }

  resize();
  return { resize, tileAt, draw };
}
