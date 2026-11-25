// The canvas renderer: draws the store, everything built in it, the shoppers, effects, the
// placement and upgrade previews and the other players' pointers, through a camera that the
// interface moves around (maps run up to 99 x 55 tiles and do not fit the screen).
//
//   const renderer = createRenderer(canvas, session);
//   renderer.resize();                   after the canvas element changes size (also noticed by itself)
//   renderer.tileAt(clientX, clientY);   -> {x, y} tile under a mouse position, or null
//   renderer.draw(view);                 once per animation frame
// Camera:
//   renderer.cam                         read-only { x, y, zoom }: view centre in tiles, CSS pixels per tile
//   renderer.pan(dxTiles, dyTiles)       move the view
//   renderer.centerOn(xTiles, yTiles)    put a point in the middle of the view
//   renderer.zoomBy(factor, clientX?, clientY?)  zoom, keeping the tile under that point still
//                                        (no point: about the view centre)
//   renderer.fit()                       zoom out to show the whole map
//   renderer.viewRect()                  -> {x0, y0, x1, y1} visible area in tiles (fractional)
// The camera never zooms out past the whole map or in past MAX_ZOOM, never lets the view leave
// the map by more than a tile, and centres the map in a direction where it is smaller than the
// view. A new map starts fully zoomed out if that gives at least START_MIN pixels per tile,
// otherwise at START_ZOOM, centred.
//
// Everything is drawn in logical world pixels, TILE (40) per tile; the camera turns that into a
// canvas transform. The parts are split by layer:
//   floor.js      walls, shelving, the food court's furniture, entrances, tills, the machines'
//                 marked floor (static parts cached in chunks)
//   buildings.js  belts, machines, security, the flow arrows on factory buildings, level badges
//                 (moved to the corner away from a flow arrow), wreckage left by gym bros
//   items.js      goods on belts (pre-rendered sprites)
//   messes.js     slushie spills teenagers leave on the floor
//   shoppers.js   every kind of shopper, their super versions, the boss (and his name plate, drawn
//                 after everyone), a mom's runaway child, and the carts moms leave behind
//                 (state.carts)
//   effects.js    floating cash, speech blips, shots, beams, sprays, wreckage, upgrade sparkles
//   guides.js     route guides and tutorial marks
//   minimap.js    the whole map small, for the interface's corner (a separate canvas)
// Buildings bigger than a tile are drawn once, from their anchor, when the loop reaches the
// bottom-left tile of their footprint (so what stands in front of them is drawn after them);
// their other tiles (`part`) are skipped everywhere.
import {
  BUILD, ZONES, TUNE, TICK_HZ, ST, DIRS, SHOPPERS, defOf, canPlace, canUpgrade, statsOf, levelOf,
  levelIn, maxIn, tracksOf, defaultTrack, upgradeCost, sizeOf, footprint, hasCard, supportDog, CARDS,
} from '../sim/index.js';
import { TILE, INK, rr, paint, label, font } from './paint.js';
import { analyzeMap, mapChanged, createFloorCache, drawDynamic } from './floor.js';
import {
  beltShape, drawBelt, drawBeltItems, drawBuilding, createBeltSprites, createBuildingSprites, SP,
  drawBadge, drawRubble, drawWear, rectOf, BIG, FLOW, drawFlow, badgeCorner,
} from './buildings.js';
import { buildItemSprites } from './items.js';
import {
  drawShopper, shadowPath, drawKid, kidShadowPath, createShopperSprites, drawCart, drawDownTile,
  drawBossTag,
} from './shoppers.js';
import { createMessSprites, drawMesses } from './messes.js';
import { createEffects } from './effects.js';
import { drawRoutes, drawMarks } from './guides.js';
import { selectedReach, drawnBySelection } from './reach.js';

const T = TILE;
/** Closest zoom, in CSS pixels per tile. */
const MAX_ZOOM = 72;
/** A new map starts zoomed right out if that gives at least this many pixels per tile... */
const START_MIN = 24;
/** ...and otherwise at this zoom. */
const START_ZOOM = 30;
/** How far (in tiles) the view may go past the edge of the map. */
const EDGE = 1;
const RANGE_DASH = [7, 5];
const NO_DASH = [];

const byY = (a, b) => a.y - b.y;

/**
 * Sprites and floor chunks are painted at a few fixed resolutions (steps of the square root of
 * two), not at every zoom, so zooming smoothly does not repaint everything every frame.
 * @returns {number} the step for a scale (device pixels per logical pixel)
 */
const resStep = (scale) => Math.ceil(Math.log2(Math.max(1e-3, scale)) * 2 - 1e-6) + 16;
const stepScale = (step) => 2 ** ((step - 16) / 2);

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Object} session a HostSession or ClientSession
 */
export function createRenderer(canvas, session) {
  const ctx = canvas.getContext('2d');
  // Canvas size in CSS pixels, and device pixels per CSS pixel.
  let cssW = 1, cssH = 1, dpr = 1;
  let seenW = -1, seenH = -1, seenDpr = 0;
  /** The camera: view centre in tiles, zoom in CSS pixels per tile. Read-only from outside. */
  const cam = { x: 0, y: 0, zoom: START_ZOOM };
  let mapW = 0, mapH = 0, mapKey = '';
  let viewPending = false; // the starting view still has to be worked out once the canvas has a size
  /** World-to-device transform: device pixels per logical pixel, and the offset. */
  let scale = 1, ox = 0, oy = 0;
  const base = { s: 1, ox: 0, oy: 0 };
  let step = -999;
  let sprites = buildItemSprites(1);
  const beltSprites = createBeltSprites();
  const buildingSprites = createBuildingSprites();
  const shopperSprites = createShopperSprites();
  const messSprites = createMessSprites();
  const fx = createEffects();
  const floor = createFloorCache();
  let info = null;
  const order = []; // shoppers (and loose children) sorted for drawing, reused every frame
  const kids = []; // reusable stand-ins for loose children in `order`: { kid: true, y, m: mom }
  const facing = new Map(); // shopper id -> 1 or -1, so a stopped shopper keeps facing the same way
  let shapes = new Int8Array(0); // belt bend per tile, worked out for visible belts each frame
  let doorOpen = 0;
  let lastNow = 0;
  let heldAlpha = 0; // the fraction between ticks last drawn, held while the game is paused
  let lastZoom = -1, zoomedAt = -1e9;
  let frames = 0;
  /** Everything a building or shopper drawing needs about the current frame. */
  const F = { time: 0, now: 0, alpha: 0, sprites, fx: fx.timers, w: 30, dress: undefined };
  /** A fake building used to draw the placement ghost. */
  const ghost = { k: '', o: 0, d: 0, it: [], t: 0, n: 0, out: 0, cd: 0, a: 0 };
  const nameWidths = new Map();
  /** Visible tiles this frame, with a margin (exclusive end). */
  const vis = { x0: 0, y0: 0, x1: 0, y1: 0 };
  /** Context for one shopper's drawing (see drawShopper): reused. */
  const how = { pee: null, gawk: false, tv: false, pack: false, pet: false };
  const peeAt = [0, 0];
  /** Exhibitionists with the bathrobe open this frame, for who is staring at whom. */
  const flashing = [];

  // --- camera ----------------------------------------------------------------------------------

  function measure() {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, rect.width || canvas.clientWidth || 1);
    cssH = Math.max(1, rect.height || canvas.clientHeight || 1);
    dpr = globalThis.devicePixelRatio || 1;
    seenW = canvas.clientWidth; seenH = canvas.clientHeight; seenDpr = dpr;
    return rect;
  }

  const fitZoom = () => (mapW ? Math.min(cssW / mapW, cssH / mapH) : START_ZOOM);
  const maxZoom = () => Math.max(MAX_ZOOM, fitZoom());

  function clampCam() {
    if (!mapW) return;
    cam.zoom = Math.min(maxZoom(), Math.max(fitZoom(), cam.zoom));
    const hx = cssW / 2 / cam.zoom, hy = cssH / 2 / cam.zoom;
    cam.x = 2 * hx >= mapW - 1e-6 ? mapW / 2 : Math.min(mapW - hx + EDGE, Math.max(hx - EDGE, cam.x));
    cam.y = 2 * hy >= mapH - 1e-6 ? mapH / 2 : Math.min(mapH - hy + EDGE, Math.max(hy - EDGE, cam.y));
  }

  function startView() {
    const fz = fitZoom();
    cam.zoom = fz >= START_MIN ? fz : START_ZOOM;
    cam.x = mapW / 2;
    cam.y = mapH / 2;
    clampCam();
    // A canvas that is not laid out yet (hidden, size 0) gives a meaningless fit: try again later.
    viewPending = cssW < 50 || cssH < 50;
  }

  /** Follows the state's map: a new map (or new game) gets the starting view. */
  function sync() {
    const s = session.state;
    if (!s) return false;
    const key = `${s.w}x${s.h}:${s.map ? s.map.design + '/' + s.map.size : ''}`;
    if (key !== mapKey) {
      mapKey = key;
      mapW = s.w; mapH = s.h;
      startView();
    }
    return true;
  }

  function resize() {
    const wasFit = mapW && !viewPending && Math.abs(cam.zoom - fitZoom()) <= fitZoom() * 0.01;
    const rect = measure();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    if (!mapW) return;
    if (viewPending) startView();
    else {
      // Keep the centre; someone looking at the whole map keeps seeing the whole map.
      if (wasFit) cam.zoom = fitZoom();
      clampCam();
    }
  }

  /** Works out the world-to-device transform from the camera. */
  function place() {
    const k = canvas.width / cssW; // device pixels per CSS pixel, as the canvas really is
    scale = (cam.zoom * k) / T;
    ox = Math.round(canvas.width / 2 - cam.x * T * scale);
    oy = Math.round(canvas.height / 2 - cam.y * T * scale);
    base.s = scale; base.ox = ox; base.oy = oy;
  }

  /** A mouse position as CSS pixels inside the canvas. */
  function local(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (cssW / Math.max(1, rect.width)),
      y: (clientY - rect.top) * (cssH / Math.max(1, rect.height)),
    };
  }

  function pan(dx, dy) {
    if (!sync()) return;
    cam.x += Number(dx) || 0;
    cam.y += Number(dy) || 0;
    clampCam();
  }

  function centerOn(x, y) {
    if (!sync()) return;
    if (Number.isFinite(x)) cam.x = x;
    if (Number.isFinite(y)) cam.y = y;
    clampCam();
  }

  function zoomBy(factor, clientX, clientY) {
    if (!sync() || !(factor > 0)) return;
    let px = cssW / 2, py = cssH / 2;
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) ({ x: px, y: py } = local(clientX, clientY));
    const z0 = cam.zoom;
    const z1 = Math.min(maxZoom(), Math.max(fitZoom(), z0 * factor));
    // The tile under the point stays under the point.
    const tx = cam.x + (px - cssW / 2) / z0, ty = cam.y + (py - cssH / 2) / z0;
    cam.zoom = z1;
    cam.x = tx - (px - cssW / 2) / z1;
    cam.y = ty - (py - cssH / 2) / z1;
    clampCam();
  }

  function fit() {
    if (!sync()) return;
    cam.zoom = fitZoom();
    cam.x = mapW / 2;
    cam.y = mapH / 2;
    clampCam();
  }

  function viewRect() {
    sync();
    const hx = cssW / 2 / cam.zoom, hy = cssH / 2 / cam.zoom;
    return { x0: cam.x - hx, y0: cam.y - hy, x1: cam.x + hx, y1: cam.y + hy };
  }

  function tileAt(clientX, clientY) {
    if (!sync()) return null;
    const p = local(clientX, clientY);
    const x = Math.floor(cam.x + (p.x - cssW / 2) / cam.zoom);
    const y = Math.floor(cam.y + (p.y - cssH / 2) / cam.zoom);
    return x >= 0 && y >= 0 && x < mapW && y < mapH ? { x, y } : null;
  }

  // --- drawing -----------------------------------------------------------------------------------

  /** Repaints sprites when the zoom crosses a resolution step. */
  function setStep(st) {
    if (st === step) return;
    step = st;
    const r = stepScale(st);
    sprites = buildItemSprites(r);
    F.sprites = sprites;
    beltSprites.setScale(r);
    buildingSprites.setScale(r);
    shopperSprites.setScale(r);
    messSprites.setScale(r);
  }

  function draw(view = {}) {
    // Follow size changes even if the page forgets to call resize().
    if (canvas.clientWidth !== seenW || canvas.clientHeight !== seenH || (globalThis.devicePixelRatio || 1) !== seenDpr) resize();
    const s = session.state;
    const events = session.drainFx();
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!s) return;
    sync();
    if (mapChanged(info, s)) {
      info = analyzeMap(s);
      floor.reset(info);
      if (shapes.length !== s.w * s.h) shapes = new Int8Array(s.w * s.h);
    }
    F.w = s.w;
    F.zoom = cam.zoom;
    // The holiday the bosses dress up for (0.3), or undefined for none: see drawShopper.
    F.dress = s.holiday;
    // The game itself, for drawing code that reads a building's numbers (statsOf with the state,
    // so the game's cards count), and the cards that change how things are drawn (0.3.01): pregnant
    // dogs (spayed), support dogs (supportdog), bigger bosses (bde).
    F.game = s;
    F.seed = s.seed; // who a card picks by id turns with the game's seed (idShare)
    F.spayed = hasCard(s, 'spayed');
    F.esa = hasCard(s, 'supportdog');
    F.bde = hasCard(s, 'bde');
    fx.handle(events, now, s);

    // While the game is paused (0.3.01) the host's clock still runs its empty steps, so the fraction
    // between ticks keeps cycling; held at its last value, shoppers stand still instead of jogging
    // back and forth on the spot, and every animation that runs off F.time stops with them.
    if (!s.pause) heldAlpha = session.alpha();
    const alpha = heldAlpha;
    F.alpha = alpha;
    F.now = now;
    F.time = (s.tick + alpha) / TICK_HZ;

    place();
    setStep(resStep(scale));
    // While the zoom is changing, paint the floor at fixed steps; once it settles, at the exact zoom.
    if (cam.zoom !== lastZoom) { if (lastZoom >= 0) zoomedAt = now; lastZoom = cam.zoom; }
    const floorRes = now - zoomedAt > 250 ? scale : stepScale(step);
    const vr = viewRect();
    vis.x0 = Math.max(0, Math.floor(vr.x0) - 1);
    vis.y0 = Math.max(0, Math.floor(vr.y0) - 1);
    vis.x1 = Math.min(s.w, Math.ceil(vr.x1) + 1);
    vis.y1 = Math.min(s.h, Math.ceil(vr.y1) + 2); // tall things on the row below reach up

    floor.draw(ctx, scale, floorRes, ox, oy, vis);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, s.w * T, s.h * T);
    ctx.clip();

    // Doors slide open while a wave is on.
    doorOpen += ((s.phase === 'wave' ? 1 : 0) - doorOpen) * Math.min(1, dt * 4);
    drawDynamic(ctx, info, doorOpen, fx.timers.tillAt, now);
    // Holding a machine: light up the marked floor it may go on.
    const zch = view.tool && BUILD[view.tool] && BUILD[view.tool].zone;
    if (zch && info.patches.length) drawZoneGlow(zch, now);
    // Teenagers' slushie spills and wrecked buildings, on the floor under everything else.
    if (s.messes && s.messes.length) drawMesses(ctx, s.messes, alpha, messSprites, s.w);
    if (s.rubble && s.rubble.length) drawWreckage(s);

    drawBuildings(s, now);

    if (view.route) drawRoutes(ctx, s, now / 1000);
    const bossGrow = F.bde ? CARDS.bde.size : 1;
    fx.draw(ctx, now, 0, sprites, cam.zoom, bossGrow);
    drawShoppers(s, alpha);
    fx.draw(ctx, now, 1, sprites, cam.zoom, bossGrow);
    if (view.aim) drawAim(s, view.hover);
    // The building whose sheet is open: its reach, and the reach after a Range upgrade while that
    // button is pointed at (see reach.js). The hover preview then leaves that building's reach out.
    const sel = selectedReach(s, view);
    if (sel) drawSelected(s, sel);
    drawPreview(s, view, sel);
    if (view.marks && view.marks.length) drawMarks(ctx, view.marks, now, s.w, s.h);
    ctx.restore();

    // Labels that stay the same size on screen whatever the zoom. (Entrances have no name tags:
    // the owner's ruling, "it's not their door".)
    const k = canvas.width / cssW;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (view.cursors) drawCursors(s, view.cursors);
    // A boss got his refund: the edges of the screen throb red for a moment, wherever you are looking.
    const esc = now - fx.timers.bossEscAt;
    if (esc >= 0 && esc < 1800) bossAlarm(esc / 1800);
  }

  /** The red alarm round the edges of the screen after a boss reaches a till (k 0..1). */
  function bossAlarm(k) {
    const a = (1 - k) * (0.55 + 0.45 * Math.abs(Math.sin(k * Math.PI * 4)));
    const edge = Math.min(cssW, cssH) * 0.18;
    for (const [x0, y0, x1, y1, w, h] of [
      [0, 0, 0, edge, cssW, edge], [0, cssH, 0, cssH - edge, cssW, edge],
      [0, 0, edge, 0, edge, cssH], [cssW, 0, cssW - edge, 0, edge, cssH],
    ]) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(220,20,20,${0.75 * a})`);
      g.addColorStop(1, 'rgba(220,20,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x0 === cssW ? cssW - edge : 0, y0 === cssH ? cssH - edge : 0, w, h);
    }
  }

  /**
   * The patches of marked floor a held machine may be built on, pulsing: a soft wash over them and
   * a glowing outline in their colour with a white line through it. Nothing else is dimmed.
   */
  function drawZoneGlow(ch, now) {
    const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 1.8);
    // Line widths are given in screen pixels, so the glow looks the same at any zoom.
    const thick = T / cam.zoom;
    const { x0, y0, x1, y1 } = vis;
    ctx.beginPath();
    let any = false;
    for (const p of info.patches) {
      if (p.ch !== ch || p.x1 < x0 || p.x0 > x1 || p.y1 < y0 || p.y0 > y1) continue;
      for (const i of p.cells) ctx.rect((i % p.width) * T, ((i / p.width) | 0) * T, T, T);
      any = true;
    }
    if (!any) return;
    const rgb = zoneRgb(ch);
    ctx.fillStyle = `rgba(${rgb},${0.1 + 0.14 * pulse})`;
    ctx.fill();
    ctx.beginPath();
    for (const p of info.patches) {
      if (p.ch !== ch || p.x1 < x0 || p.x0 > x1 || p.y1 < y0 || p.y0 > y1) continue;
      const e = p.edges;
      for (let k = 0; k < e.length; k += 4) { ctx.moveTo(e[k] * T, e[k + 1] * T); ctx.lineTo(e[k + 2] * T, e[k + 3] * T); }
    }
    ctx.lineCap = 'square';
    ctx.strokeStyle = `rgba(${rgb},${0.45 + 0.35 * pulse})`;
    ctx.lineWidth = (8 + 6 * pulse) * thick;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.75 + 0.25 * pulse})`;
    ctx.lineWidth = 2.5 * thick;
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  const zoneRgbs = new Map();
  /** A zone's colour as "r,g,b" for building rgba() strings. */
  function zoneRgb(ch) {
    let v = zoneRgbs.get(ch);
    if (!v) {
      const n = parseInt(ZONES[ch].color.slice(1), 16);
      v = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
      zoneRgbs.set(ch, v);
    }
    return v;
  }

  /** What gym bros have wrecked and nobody has rebuilt: a heap of bits where it stood. */
  function drawWreckage(s) {
    for (const r of s.rubble) {
      // Rubble entries are { i, k, d, ... }; (very old saves had [i, k, d, o]).
      const i = Array.isArray(r) ? r[0] : r.i, k = Array.isArray(r) ? r[1] : r.k, d = (Array.isArray(r) ? r[2] : r.d) | 0;
      if (s.grid[i] || !BUILD[k]) continue; // rebuilt
      const x = i % s.w, y = (i / s.w) | 0;
      // A big building's rubble starts up to two tiles before the visible area.
      if (x < vis.x0 - 2 || x >= vis.x1 || y < vis.y0 - 2 || y >= vis.y1) continue;
      drawRubble(ctx, i, k, s.w, d);
    }
  }

  function drawBuildings(s, now) {
    const grid = s.grid, w = s.w;
    const { y0, x1, y1 } = vis;
    // Start two tiles further left: a big building is drawn from the bottom-left of its footprint,
    // which may be off screen while the rest of it shows.
    const x0 = Math.max(0, vis.x0 - 2);
    // Belts first (flat on the floor), then the goods riding on them, then everything else.
    const phase = (((F.time * TUNE.beltSpeed * T) % SP) + SP) % SP;
    for (let y = y0; y < y1; y++) {
      for (let x = x0, i = y * w + x0; x < x1; x++, i++) {
        const b = grid[i];
        if (!b || b.k !== 'belt') continue;
        const sh = beltShape(s, x, y, b.d);
        shapes[i] = sh;
        drawBelt(ctx, s, x, y, b.d, sh, phase, beltSprites, base);
      }
    }
    for (let y = y0; y < y1; y++) {
      for (let x = x0, i = y * w + x0; x < x1; x++, i++) {
        const b = grid[i];
        if (b && b.k === 'belt') drawBeltItems(ctx, b, x, y, shapes[i], F.alpha, sprites);
      }
    }
    // Level badges grow when zoomed out so the number stays readable (in steps, as they are cached).
    const bk = Math.round(Math.max(1, Math.min(1.6, 34 / cam.zoom)) * 10) / 10;
    const bres = stepScale(step);
    const upAt = fx.timers.upAt;
    for (let y = y0; y < y1; y++) {
      for (let x = x0, i = y * w + x0; x < x1; x++, i++) {
        let b = grid[i];
        if (!b) continue;
        let ai = i;
        if (b.part !== undefined) {
          ai = b.part;
          b = grid[ai];
          if (!b || !BIG[b.k]) continue;
        }
        // A big building is drawn when the loop reaches the bottom-left tile of its footprint.
        if (BIG[b.k]) {
          const fh = sizeOf(b.k, BUILD[b.k].rot ? b.d | 0 : 0)[1];
          if (i !== ai + (fh - 1) * w) continue;
        } else if (ai !== i) continue;
        if (b.k !== 'belt') drawBuilding(ctx, b, ai, F, buildingSprites);
        drawWear(ctx, b, ai, F);
        // Which way the goods go, over any damage (belts show it with their chevrons).
        if (b.k !== 'belt' && FLOW[b.k] !== undefined) drawFlow(ctx, b, ai, F, buildingSprites);
        const r = rectOf(b, ai, w);
        const since = now - upAt[ai];
        if (since < 450) {
          // A flash of light over a building that has just been upgraded.
          ctx.globalAlpha = 0.75 * (1 - since / 450);
          rr(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8);
          ctx.fillStyle = '#fff3b0';
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        const lv = b.u ? levelOf(b) : 1;
        if (lv > 1) drawBadge(ctx, r.x + r.w - T / 2, r.y + T / 2, lv, bk, bres, maxedOut(b), badgeCorner(b));
      }
    }
  }

  const trackLists = {};
  /** True if every upgrade track a building has is at its top level. */
  function maxedOut(b) {
    const ts = trackLists[b.k] || (trackLists[b.k] = tracksOf(b.k));
    if (!ts.length) return false;
    for (const t of ts) if (levelIn(b, t) < maxIn(b.k, t)) return false;
    return true;
  }

  /** Which way a shopper faces, remembered so one who stops keeps facing the same way. */
  function faceOf(key, vx) {
    let f = facing.get(key);
    if (vx > 0.002 && f !== 1) { f = 1; facing.set(key, 1); } else if (vx < -0.002 && f !== -1) { f = -1; facing.set(key, -1); }
    return f || 1;
  }

  function drawShoppers(s, alpha) {
    order.length = 0;
    flashing.length = 0;
    let nk = 0;
    // Only the ones on screen (a margin of two tiles for trolleys, dogs and bubbles).
    const ax = vis.x0 - 2, bx = vis.x1 + 2, ay = vis.y0 - 2, by = vis.y1 + 2;
    for (const sh of s.shoppers) {
      if (sh.fl > 0 && sh.st !== ST.LEAVE) flashing.push(sh);
      if (sh.x >= ax && sh.x <= bx && sh.y >= ay && sh.y <= by) order.push(sh);
      // A mom's loose child is a figure of its own on the floor, sorted in with everyone else.
      // It runs straight through buildings, and like every shopper is drawn over them.
      if ((sh.kd === 1 || sh.kd === 2) && sh.st !== ST.LEAVE && sh.kx >= ax && sh.kx <= bx && sh.ky >= ay && sh.ky <= by) {
        let p = kids[nk];
        if (!p) { p = { kid: true, y: 0, m: null }; kids.push(p); }
        p.y = sh.ky; p.m = sh;
        order.push(p);
        nk++;
      }
    }
    order.sort(byY);
    // On the floor first: carts moms abandoned this wave (state.carts: [x, y, sup, face], kept by
    // the rules so a player who joins mid-wave sees them too), and the tiles drunks are lying across.
    const carts = s.carts;
    if (carts) {
      for (const c of carts) {
        if (c[0] >= ax && c[0] <= bx && c[1] >= ay && c[1] <= by) drawCart(ctx, c[0] * T, c[1] * T, c[3] < 0 ? -1 : 1, shopperSprites, c[2]);
      }
    }
    for (let n = 0; n < order.length; n++) {
      const sh = order[n];
      if (!sh.kid && sh.st === ST.STUN && SHOPPERS[sh.k] && SHOPPERS[sh.k].sways) drawDownTile(ctx, sh.x | 0, sh.y | 0, F.time);
    }
    // All ground shadows in one path, then the figures back to front.
    ctx.beginPath();
    for (let n = 0; n < order.length; n++) {
      const sh = order[n];
      if (sh.kid) {
        const m = sh.m;
        kidShadowPath(ctx, (m.kx + m.kvx * alpha) * T, (m.ky + m.kvy * alpha) * T);
      } else if (sh.st !== ST.LEAVE) {
        shadowPath(ctx, sh, (sh.x + sh.vx * alpha) * T, (sh.y + sh.vy * alpha) * T, faceOf(sh.id, sh.vx), F);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    let bosses = 0;
    for (let n = 0; n < order.length; n++) {
      const sh = order[n];
      if (sh.kid) {
        const m = sh.m;
        // Running: faces where it runs. Waiting: turns round to pull faces at its mother.
        const f = m.kd === 2 ? (m.x >= m.kx ? 1 : -1) : faceOf(-m.id, m.kvx);
        drawKid(ctx, m, (m.kx + m.kvx * alpha) * T, (m.ky + m.kvy * alpha) * T, f, F, shopperSprites);
        continue;
      }
      const px = (sh.x + sh.vx * alpha) * T, py = (sh.y + sh.vy * alpha) * T;
      let face = faceOf(sh.id, sh.vx);
      how.pee = null; how.gawk = false; how.tv = false; how.pack = false; how.pet = false;
      if (sh.st === ST.WATCH) face = watching(s, sh, face);
      drawShopper(ctx, sh, px, py, face, F, shopperSprites, how);
      if (sh.k === 'boss') bosses++;
    }
    // The boss's name plate and patience bar go over everyone, so the crowd never hides them.
    if (bosses) {
      for (let n = 0; n < order.length; n++) {
        const sh = order[n];
        if (!sh.kid && sh.k === 'boss') drawBossTag(ctx, sh, (sh.x + sh.vx * alpha) * T, (sh.y + sh.vy * alpha) * T, F);
      }
    }
    for (let k = 0; k < nk; k++) kids[k].m = null;
    // Forget shoppers who have gone, now and then.
    if (++frames % 600 === 0 && facing.size > s.shoppers.length * 2 + 20) {
      const live = new Set();
      for (const sh of s.shoppers) { live.add(sh.id); live.add(-sh.id); }
      for (const id of facing.keys()) if (!live.has(id)) facing.delete(id);
    }
  }

  /**
   * A shopper standing still to watch something (ST.WATCH): works out what, for the drawing (fills
   * in `how`), and turns him toward it. A dog beside security that is switched off is peeing on it
   * (rear end toward it); a dad or teenager near an exhibitionist with her robe open is staring at
   * her; anyone else near a TV Salesman is watching the television.
   * @returns {number} the facing to draw him with
   */
  function watching(s, sh, face) {
    const def = defOf(sh);
    // Petting an emotional support dog (the supportdog card): `pd` is the dog's owner he last
    // petted; while that dog is still near him, that is what he has stopped for.
    if (sh.pd !== undefined && F.esa) {
      const r = CARDS.supportdog.range + 1.5;
      for (const o of s.shoppers) {
        if (o.id !== sh.pd || o.st === ST.LEAVE || !supportDog(s, o)) continue;
        if ((o.x - sh.x) ** 2 + (o.y - sh.y) ** 2 > r * r) break;
        how.pet = true;
        // (The dog walks out in front of him.)
        const dx = o.x + (faceOf(o.id, o.vx) * 0.6) - sh.x;
        return Math.abs(dx) < 0.05 ? face : dx > 0 ? 1 : -1;
      }
    }
    if (def.flashes) return face;
    // A Card Trader stopped to see what another one is pulling out of a pack (TUNE.ripLook).
    if (def.rips) {
      const r = TUNE.ripLook + 0.5;
      for (const o of s.shoppers) {
        if (o === sh || o.st !== ST.BROWSE || !defOf(o).rips) continue;
        if ((o.x - sh.x) ** 2 + (o.y - sh.y) ** 2 > r * r) continue;
        how.pack = true;
        return Math.abs(o.x - sh.x) < 0.05 ? face : o.x > sh.x ? 1 : -1;
      }
    }
    const W = s.w, H = s.h, grid = s.grid;
    const tx = sh.x | 0, ty = sh.y | 0;
    if (def.pees) {
      // As far as the rules let him reach (peeRange from the middle of a tile), and a little more.
      const reach = (def.peeRange || TUNE.peeRange) + 0.5;
      let best = -1, bd = reach * reach;
      for (let y = Math.max(0, ty - 3); y <= Math.min(H - 1, ty + 3); y++) {
        for (let x = Math.max(0, tx - 3); x <= Math.min(W - 1, tx + 3); x++) {
          const g = grid[y * W + x];
          if (!g) continue;
          const b = g.part !== undefined ? grid[g.part] : g;
          if (!b || !(b.off > 0)) continue;
          const d2 = (x + 0.5 - sh.x) ** 2 + (y + 0.5 - sh.y) ** 2;
          if (d2 < bd) { bd = d2; best = y * W + x; }
        }
      }
      if (best >= 0) {
        const bx = best % W, by = (best / W) | 0;
        // Aim at the edge of that tile nearest the dog.
        peeAt[0] = Math.max(bx + 0.15, Math.min(bx + 0.85, sh.x));
        peeAt[1] = Math.max(by + 0.25, Math.min(by + 0.95, sh.y));
        how.pee = peeAt;
        if (Math.abs(peeAt[0] - sh.x) > 0.05) return peeAt[0] < sh.x ? 1 : -1;
        return face;
      }
    }
    if (def.gawks) {
      for (const f of flashing) {
        const r = (defOf(f).flashRange || TUNE.flashRange) + 0.5;
        if ((f.x - sh.x) ** 2 + (f.y - sh.y) ** 2 <= r * r) {
          how.gawk = true;
          return Math.abs(f.x - sh.x) < 0.05 ? face : f.x > sh.x ? 1 : -1;
        }
      }
    }
    let cx = 0, bd = Infinity;
    for (let y = Math.max(0, ty - 8); y <= Math.min(H - 1, ty + 8); y++) {
      for (let x = Math.max(0, tx - 8); x <= Math.min(W - 1, tx + 8); x++) {
        const b = grid[y * W + x];
        if (!b || b.k !== 'salesman' || b.part !== undefined) continue;
        const d2 = (x + 1 - sh.x) ** 2 + (y + 1 - sh.y) ** 2;
        const r = statsOf(b, s).range + 0.5;
        if (d2 <= r * r && d2 < bd) { bd = d2; cx = x + 1; }
      }
    }
    if (bd < Infinity) {
      how.tv = true;
      return Math.abs(cx - sh.x) < 0.05 ? face : cx > sh.x ? 1 : -1;
    }
    return face;
  }

  /**
   * A range circle. style: 'ok' placement allowed, 'bad' not allowed, 'faint' a tower's range
   * shown on hover, 'sel' the reach of the building whose sheet is open (a solid white edge over
   * a dark one, so it reads on any floor without looking like "you may place it here"), 'next'
   * (dashed gold outline) the range after an upgrade.
   */
  function rangeCircle(cx, cy, range, style) {
    if (!(range > 0)) return;
    ctx.beginPath();
    ctx.arc(cx, cy, range * T, 0, Math.PI * 2);
    if (style === 'sel') {
      ctx.fillStyle = 'rgba(255,255,255,0.11)';
      ctx.fill();
      ctx.lineWidth = 4.5; ctx.strokeStyle = 'rgba(17,24,39,0.55)'; ctx.stroke();
      ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.stroke();
      return;
    }
    if (style === 'next') {
      ctx.setLineDash(RANGE_DASH);
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffd23f';
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      return;
    }
    const faint = style === 'faint', ok = style !== 'bad';
    ctx.fillStyle = faint ? 'rgba(255,255,255,0.07)' : ok ? 'rgba(255,255,255,0.13)' : 'rgba(239,68,68,0.12)';
    ctx.fill();
    if (!faint) ctx.setLineDash(RANGE_DASH);
    ctx.lineWidth = faint ? 1.5 : 2.5;
    ctx.strokeStyle = faint ? 'rgba(255,255,255,0.45)' : ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,120,110,0.9)';
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
  }

  /**
   * The Barcode Laser's beam: a straight strip `range` tiles long and `2 * width` wide from its front
   * end, through everything. Same styles as rangeCircle.
   */
  function beamStrip(fx, fy, d, range, width, style) {
    const [dx, dy] = DIRS[d & 3];
    const len = range * T, half = width * T;
    const x = Math.min(fx, fx + dx * len) - (dy ? half : 0);
    const y = Math.min(fy, fy + dy * len) - (dx ? half : 0);
    const w = dx ? len : half * 2, h = dy ? len : half * 2;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    if (style === 'next') {
      ctx.setLineDash(RANGE_DASH);
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
      ctx.setLineDash(NO_DASH);
      return;
    }
    if (style === 'sel') {
      // The beam it fires now: solid edges, and the centre line with its arrowhead.
      ctx.fillStyle = 'rgba(255,70,70,0.14)';
      ctx.fill();
      ctx.lineWidth = 4.5; ctx.strokeStyle = 'rgba(17,24,39,0.55)'; ctx.stroke();
      ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(255,215,215,0.95)'; ctx.stroke();
    }
    const faint = style === 'faint', ok = style !== 'bad';
    if (style !== 'sel') {
      // The scanner's red laser when it may go here; grey-white with a red fill when it may not.
      ctx.fillStyle = faint ? 'rgba(255,60,60,0.08)' : ok ? 'rgba(255,70,70,0.16)' : 'rgba(239,68,68,0.14)';
      ctx.fill();
      if (!faint) ctx.setLineDash(RANGE_DASH);
      ctx.lineWidth = faint ? 1.5 : 2.5;
      ctx.strokeStyle = faint ? 'rgba(255,190,190,0.5)' : ok ? 'rgba(255,210,210,0.95)' : 'rgba(170,170,170,0.9)';
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
    }
    // The centre line, with an arrowhead at the far end.
    if (!faint) {
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      const ex = fx + dx * len, ey = fy + dy * len;
      ctx.lineTo(ex, ey);
      ctx.moveTo(ex - dx * 10 - dy * 7, ey - dy * 10 - dx * 7);
      ctx.lineTo(ex, ey);
      ctx.lineTo(ex - dx * 10 + dy * 7, ey - dy * 10 + dx * 7);
      ctx.lineWidth = 2;
      ctx.strokeStyle = ok ? 'rgba(255,80,80,0.9)' : 'rgba(170,170,170,0.8)';
      ctx.stroke();
    }
  }

  /**
   * What a building reaches, drawn for building b (any { k, d, u }) with its anchor at tile ai:
   * the Barcode Laser's beam, or a circle round the middle of its footprint for anything with a range.
   */
  function showRange(s, b, ai, style) {
    const st = statsOf(b, s);
    if (!(st.range > 0)) return;
    const r = rectOf(b, ai, s.w);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (BUILD[b.k].beam) {
      const d = b.d | 0, [dx, dy] = DIRS[d];
      beamStrip(cx + dx * r.w / 2, cy + dy * r.h / 2, d, st.range, st.width, style);
    } else {
      rangeCircle(cx, cy, st.range, style);
    }
  }

  function tileOutline(px, py, color, width, pw = T, ph = T) {
    rr(ctx, px + 1, py + 1, pw - 2, ph - 2, 5);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  /** A scratch building for range previews: { k, d, u }. */
  const probe = { k: '', d: 0, u: null };
  const probeU = {};
  const TRACK_NAME = { dmg: 'DAMAGE', spd: 'SPEED', rng: 'RANGE', dur: 'TOUGHER' };

  const AIM_REACH = 5; // tiles each arm of the crosshair reaches out from the aimed tile
  const AIM_DASH = [8, 6];
  /**
   * A finger placing something covers the tile it is on (view.aim, touch only): dashed lines
   * along its row and column, stopping short of the tile itself, show where it is from outside
   * the finger.
   */
  function drawAim(s, h) {
    if (!h || !(h.x >= 0 && h.y >= 0 && h.x < s.w && h.y < s.h)) return;
    const px = T / (cam.zoom || 32); // one screen pixel, in floor units
    const cx = (h.x + 0.5) * T, cy = (h.y + 0.5) * T;
    const gap = T * 0.65, reach = AIM_REACH * T;
    const arms = [
      [cx - gap, cy, Math.max(0, cx - reach), cy], [cx + gap, cy, Math.min(s.w * T, cx + reach), cy],
      [cx, cy - gap, cx, Math.max(0, cy - reach)], [cx, cy + gap, cx, Math.min(s.h * T, cy + reach)],
    ];
    ctx.save();
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of arms) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
    ctx.setLineDash(AIM_DASH.map((d) => d * px));
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(17,24,39,0.75)';
    ctx.lineWidth = 4.5 * px;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2 * px;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The building whose sheet is open (view.selected, from selectedReach): its reach now, in the
   * 'sel' style, and, while the sheet's Range button is pointed at (view.track 'rng') and Range is
   * not at its top, the reach after one more level, dashed gold, on top.
   */
  function drawSelected(s, sel) {
    showRange(s, sel.b, sel.ai, 'sel');
    if (sel.next) showNext(s, sel.b, sel.ai);
  }

  /** The reach building b (anchor ai) would have with one more Range level: dashed gold. */
  function showNext(s, b, ai) {
    const ts = tracksOf(b.k);
    for (const t of ts) probeU[t] = levelIn(b, t);
    probeU.rng = levelIn(b, 'rng') + 1;
    probe.k = b.k; probe.d = b.d | 0; probe.u = probeU;
    showRange(s, probe, ai, 'next');
    for (const t of ts) delete probeU[t];
  }

  /**
   * Ghost of the selected building at the hovered tile, the remove highlight, or the upgrade
   * preview. `sel` is the building whose sheet is open (selectedReach): its reach is drawn
   * already, so it is not drawn again here when the mouse (or a finger) is on it.
   */
  function drawPreview(s, view, sel = null) {
    const h = view.hover;
    if (!h || !(h.x >= 0 && h.y >= 0 && h.x < s.w && h.y < s.h)) return;
    const i = h.y * s.w + h.x;
    const px = h.x * T, py = h.y * T;
    // The building under the mouse, whichever of its tiles it is on.
    const g = s.grid[i];
    const ai = g && g.part !== undefined ? g.part : i;
    const here = g ? s.grid[ai] : 0;
    const tool = view.tool;
    let hr = null;
    if (here) { const r = rectOf(here, ai, s.w); hr = { x: r.x, y: r.y, w: r.w, h: r.h }; }

    if (tool === 'remove') {
      const x = hr ? hr.x : px, y = hr ? hr.y : py, w = hr ? hr.w : T, hh = hr ? hr.h : T;
      const cx = x + w / 2, cy = y + hh / 2;
      rr(ctx, x + 1, y + 1, w - 2, hh - 2, 5);
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

    if (tool === 'upgrade') {
      if (!here) { tileOutline(px, py, 'rgba(255,255,255,0.5)', 2); return; }
      // The track being bought: the one the interface names, or the kind's default.
      const ts = tracksOf(here.k);
      const track = view.track && ts.includes(view.track) ? view.track : defaultTrack(here.k);
      const why = track ? canUpgrade(s, h.x, h.y, session.me, track) : 'noup';
      const ok = why === null;
      const mine = drawnBySelection(sel, ai);
      if (!mine) showRange(s, here, ai, ok ? 'ok' : 'faint');
      // Only a range upgrade changes what it reaches: show the reach it would have after (unless
      // the selection has just drawn it).
      if (track === 'rng' && levelIn(here, 'rng') < maxIn(here.k, 'rng') && !(mine && sel.next)) showNext(s, here, ai);
      rr(ctx, hr.x + 1, hr.y + 1, hr.w - 2, hr.h - 2, 5);
      ctx.fillStyle = ok ? 'rgba(74,222,128,0.22)' : 'rgba(239,68,68,0.25)';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = ok ? '#22c55e' : '#ef4444';
      ctx.stroke();
      // What the click would do: the track's next level and its price, or why not.
      let txt;
      if (!track) txt = 'NO UPGRADES';
      else if (levelIn(here, track) >= maxIn(here.k, track)) txt = `${TRACK_NAME[track]} MAXED`;
      else txt = `${TRACK_NAME[track]} ${levelIn(here, track) + 1}  $${upgradeCost(here, track)}`;
      label(ctx, txt, hr.x + hr.w / 2, hr.y - 10, 12, ok ? '#86efac' : '#ff8a80', INK, 3.5);
      return;
    }

    const def = tool ? BUILD[tool] : null;
    if (def) {
      const d = def.rot ? (view.dir | 0) & 3 : 0;
      const why = canPlace(s, tool, h.x, h.y, session.me, d);
      const ok = why === null;
      // Placing a kind on its own rubble puts it back where and how it was (as the rules do).
      let gi = i, gd = d;
      for (const r of s.rubble || []) {
        if (Array.isArray(r) || r.k !== tool) continue;
        const under = footprint(s, tool, r.i % s.w, (r.i / s.w) | 0, r.d | 0);
        if (under && under.includes(i)) { gi = r.i; gd = r.d | 0; break; }
      }
      ghost.k = tool;
      ghost.d = gd;
      ghost.o = session.me;
      ghost.a = gd * Math.PI / 2;
      ghost.u = null;
      const fr = rectOf(ghost, gi, s.w);
      const gx = fr.x, gy = fr.y, gw = fr.w, gh = fr.h;
      showRange(s, ghost, gi, ok ? 'ok' : 'bad');
      rr(ctx, gx + 1, gy + 1, gw - 2, gh - 2, 5);
      ctx.fillStyle = ok ? 'rgba(74,222,128,0.35)' : 'rgba(239,68,68,0.4)';
      ctx.fill();
      ctx.globalAlpha = 0.7;
      if (tool === 'belt') drawBelt(ctx, s, h.x, h.y, ghost.d, beltShape(s, h.x, h.y, ghost.d), 0, beltSprites, base);
      else drawBuilding(ctx, ghost, gi, F, buildingSprites);
      ctx.globalAlpha = 1;
      rr(ctx, gx + 1, gy + 1, gw - 2, gh - 2, 5);
      ctx.fillStyle = ok ? 'rgba(74,222,128,0.18)' : 'rgba(239,68,68,0.3)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = ok ? '#22c55e' : '#ef4444';
      ctx.stroke();
      // The flow arrow at full strength, so the facing is plain before it is built.
      if (tool === 'belt' || FLOW[tool] !== undefined) drawFlow(ctx, ghost, gi, F, buildingSprites, tool);
      const cx = gx + gw / 2;
      // Off its marked floor: say where it does go, in that floor's colour. Grows when zoomed out
      // so it stays readable (about 11 screen pixels at least).
      if (why === 'zone' && ZONES[def.zone]) {
        const k = Math.max(1, 36 / cam.zoom);
        const name = ZONES[def.zone].name.toUpperCase() + ' ONLY';
        const ly = gy > T ? gy - 10 * k : gy + gh + 10 * k;
        // Kept inside the map at the side walls.
        ctx.font = font(12 * k);
        const half = ctx.measureText(name).width / 2 + 4 * k;
        const lx = Math.max(half, Math.min(s.w * T - half, cx));
        label(ctx, name, lx, ly, 12 * k, ZONES[def.zone].color, INK, 3.5 * k);
      }
      return;
    }

    // No tool: show the reach of security under the mouse faintly, and a light hover outline
    // round the whole building.
    if (here && BUILD[here.k]) {
      if (!drawnBySelection(sel, ai)) showRange(s, here, ai, 'faint');
      tileOutline(hr.x, hr.y, 'rgba(255,255,255,0.7)', 2, hr.w, hr.h);
    } else tileOutline(px, py, 'rgba(255,255,255,0.7)', 2);
  }

  // --- screen-space labels (CSS pixel transform) -------------------------------------------------

  const sx = (wx) => (ox + wx * scale) * (cssW / canvas.width);
  const sy = (wy) => (oy + wy * scale) * (cssH / canvas.height);

  function nameWidth(name) {
    let w = nameWidths.get(name);
    if (!w) { ctx.font = font(11); w = ctx.measureText(name).width + 12; nameWidths.set(name, w); }
    return w;
  }

  /** Other players' pointers: an arrow in the player's colour with the name beside it. */
  function drawCursors(s, cursors) {
    for (const [pid, c] of cursors) {
      if (pid === session.me || !c) continue;
      const p = s.players[pid];
      if (!p || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
      const x = sx(c.x * T), y = sy(c.y * T);
      if (x < -40 || y < -40 || x > cssW + 10 || y > cssH + 10) continue;
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
      const w = nameWidth(p.name) - 2;
      rr(ctx, x + 12, y + 18, w, 16, 5);
      paint(ctx, p.color, 1.8);
      label(ctx, p.name, x + 12 + w / 2, y + 26.5, 11, '#ffffff', INK, 2.5);
    }
  }

  resize();
  sync();
  return { resize, tileAt, draw, cam, pan, centerOn, zoomBy, fit, viewRect };
}
