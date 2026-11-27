// The canvas renderer: draws the store, everything built in it, the shoppers, effects, the
// placement previews and the other players' pointers, through a camera that the
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
//   floor.js      walls, shelving, the food court's furniture, entrances, tills (static parts
//                 cached in chunks)
//   buildings.js  Crate Stacks, security, level badges, wreckage left by gym bros; the belt
//                 sprites and the out arrow, which The Back uses
//   items.js      the Forklift Turret's box (a pre-rendered sprite)
//   messes.js     slushie spills teenagers leave on the floor
//   shoppers.js   every kind of shopper, their super versions, the boss (and his name plate, drawn
//                 after everyone), a mom's runaway child, and the carts moms leave behind
//                 (state.carts)
//   effects.js    floating cash, speech blips, shots, beams, sprays, wreckage
//   guides.js     route guides and tutorial marks
//   back.js       The Back (0.4), the floor under the shop: its belts, items and parts
//   minimap.js    the whole map small, for the interface's corner (a separate canvas)
// Which floor is drawn is view.floor (0 the shop, 1 The Back): the screen's own choice, never in
// the game state. The floor not being looked at shows through faintly: drawn into an offscreen
// layer of its own and laid over at low opacity, so overlapping parts do not add up into darker
// patches and drawing code that resets globalAlpha cannot undo the faintness.
// Buildings bigger than a tile are drawn once, from their anchor, when the loop reaches the
// bottom-left tile of their footprint (so what stands in front of them is drawn after them);
// their other tiles (`part`) are skipped everywhere.
import {
  BUILD, BACK, TUNE, TICK_HZ, ST, DIRS, SHOPPERS, defOf, canPlace, statsOf, levelOf,
  levelIn, tracksOf, sizeOf, footprint, hasCard, supportDog, CARDS, canPlaceBack,
  carriesWire, reinforceCost, canReinforce,
} from '../sim/index.js';
import { TILE, INK, rr, paint, label, font } from './paint.js';
import { analyzeMap, mapChanged, createFloorCache, drawDynamic } from './floor.js';
import {
  drawBuilding, createBeltSprites, createBuildingSprites,
  drawBadge, drawRubble, drawWear, rectOf, BIG, drawOutArrow,
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
import { createBackArt } from './back.js';
import { createWireArt } from './wire.js';
import { SUPPLIES, TIER_RINGS, stockTracks, tierIn, outOfText } from '../content/supplies.js';

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
  const main = canvas.getContext('2d');
  // Where everything is drawn: the canvas, or for a moment the faint layer (see beginLayer).
  let ctx = main;
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
  const backArt = createBackArt();
  const wireArt = createWireArt();
  // The faint floor's layer (see beginLayer), and whether it holds anything from the last frame.
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d');
  let layerUsed = false;
  const fx = createEffects();
  const floor = createFloorCache();
  let info = null;
  const order = []; // shoppers (and loose children) sorted for drawing, reused every frame
  const kids = []; // reusable stand-ins for loose children in `order`: { kid: true, y, m: mom }
  const facing = new Map(); // shopper id -> 1 or -1, so a stopped shopper keeps facing the same way
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
    backArt.setScale(r);
    wireArt.setScale(r);
  }

  /**
   * Sends everything drawn from now until endLayer() into the faint layer, with the world transform
   * and the map's clip, emptied first if it was used last frame.
   */
  function beginLayer(s) {
    if (layer.width !== canvas.width || layer.height !== canvas.height) {
      layer.width = canvas.width;
      layer.height = canvas.height;
    } else if (layerUsed) {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, layer.width, layer.height);
    }
    layerUsed = true;
    lctx.setTransform(scale, 0, 0, scale, ox, oy);
    lctx.save();
    lctx.beginPath();
    lctx.rect(0, 0, s.w * T, s.h * T);
    lctx.clip();
    ctx = lctx;
  }

  /**
   * Lays the faint layer over the canvas at `alpha`, darkened first by `darken` (0 to 1) if given.
   * `used` false: nothing was drawn into it, so nothing is laid over (and it need not be emptied).
   */
  function endLayer(alpha, darken = 0, used = true) {
    lctx.restore();
    ctx = main;
    layerUsed = used;
    if (!used) return;
    if (darken) {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'source-atop';
      lctx.fillStyle = `rgba(12,14,18,${darken})`;
      lctx.fillRect(0, 0, layer.width, layer.height);
      lctx.globalCompositeOperation = 'source-over';
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
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
    backArt.handle(events, now);
    if (events) for (const e of events) if (e && e.e === 'stockOut') warn(e.i, e.t, now);
    const floorNo = view.floor === 1 ? 1 : 0;

    // While the game is paused (0.3.02) the host's clock still runs its empty steps, so the fraction
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
    if (floorNo === 1) drawBackView(s, view, now, alpha);
    else drawShopView(s, view, now, alpha);
    if (view.aim) drawAim(s, view.hover);
    if (view.lift) drawLift(s, view);
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

  /**
   * The shop floor (view.floor 0): as it has always been, with The Back showing through faintly
   * (darkened, about a quarter strength) on the floor and under the buildings, and the shopper
   * routes, which are always drawn (the owner, 0.4), a little fainter while shoppers are about.
   */
  function drawShopView(s, view, now, alpha) {
    // Teenagers' slushie spills and wrecked buildings, on the floor under everything else.
    if (s.messes && s.messes.length) drawMesses(ctx, s.messes, alpha, messSprites, s.w);
    if (s.rubble && s.rubble.length) drawWreckage(s);
    // Holding a security building, which needs a Dumbwaiter under every tile: The Back shows more
    // strongly, and the tiles where a part below is in the way are marked in red.
    const needsLift = !!(view.tool && BUILD[view.tool] && BUILD[view.tool].lift);
    if (s.back) {
      beginLayer(s);
      const n = backArt.draw(ctx, s, vis, F, base, beltSprites, now);
      endLayer(needsLift ? 0.6 : 0.27, needsLift ? 0.15 : 0.45, n > 0);
      if (needsLift && n > 0) markBlocked(s);
    }

    drawBuildings(s, now);
    // Razor Wire (0.4): over the floor and the buildings it crosses, under the shoppers, so a dad
    // can be seen stopping at it. A wire direction being tried shows over the rest.
    wireArt.draw(ctx, s, vis, F);
    if (view.wirePreview) wireArt.drawPreview(ctx, s, view.wirePreview, session.me);
    // In the lobby, where the store is chosen, the Returns Drops below stand out: where the junk
    // comes in decides where The Back's supply lines start.
    if (s.phase === 'lobby' && s.back) drawDropMarks(s);

    if (view.route) drawRoutes(ctx, s, now / 1000, view.routeFaint ? 0.6 : 1, true, view.wirePreview || null);
    const bossGrow = F.bde ? CARDS.bde.size : 1;
    fx.draw(ctx, now, 0, sprites, cam.zoom, bossGrow);
    drawShoppers(s, alpha);
    fx.draw(ctx, now, 1, sprites, cam.zoom, bossGrow);
    drawWarnings(s, now);
    // The building whose sheet is open: its reach (see reach.js). The hover preview then leaves
    // that building's reach out.
    const sel = selectedReach(s, view);
    if (sel) showRange(s, sel.b, sel.ai, 'sel');
    drawPreview(s, view, sel);
  }

  /**
   * The Back (view.floor 1): the store's floor darkened (its walls and shelves go all the way down,
   * so they must still read), The Back's parts at full strength, and the shop above faintly, so the
   * fight can be followed from below: the routes, then the buildings and shoppers at about 30%, and
   * a dashed outline round each security building. The shop's effects and floating money are left
   * out: from down here they are noise.
   */
  function drawBackView(s, view, now, alpha) {
    ctx.fillStyle = 'rgba(10,12,18,0.52)';
    ctx.fillRect(0, 0, s.w * T, s.h * T);
    backArt.draw(ctx, s, vis, F, base, beltSprites, now, true);
    if (view.route) drawRoutes(ctx, s, now / 1000, 0.45, false);
    beginLayer(s);
    drawBuildings(s, now);
    wireArt.draw(ctx, s, vis, F);
    drawShoppers(s, alpha);
    endLayer(0.3, 0.25);
    drawFootprints(s);
    drawWarnings(s, now);
    // The Returns Drop whose sheet is open.
    const sl = view.selected;
    if (sl && s.back && s.back[sl.y * s.w + sl.x]) tileOutline(sl.x * T, sl.y * T, 'rgba(255,255,255,0.95)', 3);
    drawBackPreview(s, view);
  }

  /**
   * A small yellow mark on each Returns Drop's tile, for the lobby's look at the store: a yellow
   * square with a dark arrow pointing down (junk comes down into The Back there).
   */
  function drawDropMarks(s) {
    const back = s.back, w = s.w;
    for (let i = 0; i < back.length; i++) {
      const p = back[i];
      if (!p || p.k !== 'drop') continue;
      const cx = (i % w) * T + T / 2, cy = ((i / w) | 0) * T + T / 2;
      rr(ctx, cx - 11, cy - 11, 22, 22, 4);
      paint(ctx, '#facc15', 2.5);
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 3); ctx.lineTo(cx + 6, cy - 3); ctx.lineTo(cx, cy + 6);
      ctx.closePath();
      ctx.fillStyle = INK;
      ctx.fill();
    }
  }

  /** A dashed white outline round every security building on screen, for the view from The Back. */
  function drawFootprints(s) {
    const grid = s.grid, w = s.w;
    const { y0, x1, y1 } = vis, x0 = Math.max(0, vis.x0 - 2);
    ctx.beginPath();
    for (let y = y0; y < y1; y++) {
      for (let x = x0, i = y * w + x0; x < x1; x++, i++) {
        const b = grid[i];
        if (!b || b.part !== undefined || BUILD[b.k]?.group !== 'security') continue;
        const r = rectOf(b, i, w);
        ctx.rect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
      }
    }
    ctx.setLineDash(RANGE_DASH);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
  }

  /**
   * The placement preview in The Back: the held part's ghost, green or red as canPlaceBack says
   * (with its out arrow when it turns), or the Remove tool's red cross (none on a Returns Drop,
   * which nobody can remove), or a plain outline round the tile under the mouse.
   */
  function drawBackPreview(s, view) {
    const h = view.hover;
    if (!h || !(h.x >= 0 && h.y >= 0 && h.x < s.w && h.y < s.h)) return;
    const i = h.y * s.w + h.x;
    const px = h.x * T, py = h.y * T;
    const here = s.back ? s.back[i] : 0;
    const tool = view.tool;
    if (tool === 'remove') {
      const can = !!here && !BUILD[here.k].fixed;
      rr(ctx, px + 1, py + 1, T - 2, T - 2, 5);
      ctx.fillStyle = can ? 'rgba(239,68,68,0.45)' : 'rgba(239,68,68,0.12)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ef4444';
      ctx.stroke();
      if (can) {
        const cx = px + T / 2, cy = py + T / 2;
        ctx.beginPath();
        ctx.moveTo(cx - 9, cy - 9); ctx.lineTo(cx + 9, cy + 9);
        ctx.moveTo(cx + 9, cy - 9); ctx.lineTo(cx - 9, cy + 9);
        ctx.lineCap = 'round';
        ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.stroke();
        ctx.strokeStyle = '#ff4b3a'; ctx.lineWidth = 4; ctx.stroke();
        ctx.lineCap = 'butt';
      }
      return;
    }
    const def = tool ? BUILD[tool] : null;
    if (!def || !def.back) { tileOutline(px, py, 'rgba(255,255,255,0.7)', 2); return; }
    const d = def.rot ? (view.dir | 0) & 3 : 0;
    const ok = canPlaceBack(s, tool, h.x, h.y, session.me, d) === null;
    rr(ctx, px + 1, py + 1, T - 2, T - 2, 5);
    ctx.fillStyle = ok ? 'rgba(74,222,128,0.35)' : 'rgba(239,68,68,0.4)';
    ctx.fill();
    ctx.globalAlpha = 0.75;
    backArt.drawGhost(ctx, s, tool, h.x, h.y, d, F, base, beltSprites);
    ctx.globalAlpha = 1;
    rr(ctx, px + 1, py + 1, T - 2, T - 2, 5);
    ctx.fillStyle = ok ? 'rgba(74,222,128,0.18)' : 'rgba(239,68,68,0.3)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ok ? '#22c55e' : '#ef4444';
    ctx.stroke();
    // Which way it puts things out, at full strength, before it is built.
    if (def.rot) {
      drawOutArrow(ctx, d, i, F, buildingSprites);
    }
  }

  /**
   * The tiles of The Back where a part is in the way of a security building's Dumbwaiter, for a
   * player holding one on the shop floor: a red wash and outline on each (on screen only).
   */
  function markBlocked(s) {
    const back = s.back, w = s.w;
    const { x0, y0, x1, y1 } = vis;
    ctx.beginPath();
    let any = false;
    for (let y = y0; y < y1; y++) {
      for (let x = x0, i = y * w + x0; x < x1; x++, i++) {
        const q = back[i];
        if (!q || q.k === 'lift') continue;
        ctx.rect(x * T + 2, y * T + 2, T - 4, T - 4);
        any = true;
      }
    }
    if (!any) return;
    ctx.fillStyle = 'rgba(239,68,68,0.28)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,110,100,0.85)';
    ctx.stroke();
  }

  /**
   * The supply pips over a security building (0.4): a dark strip straddling its top edge with a pip
   * for each supply it takes, in that supply's colour while it has some (its tier as the items show
   * it: no ring for Store Brand, then bronze, silver, gold), dark when it has none.
   */
  function drawPips(b, r) {
    const tracks = stockTracks(b.k), n = tracks.length;
    if (!n) return;
    const gap = 7.2, w = n * gap + 3, cx = r.x + r.w / 2, cy = r.y + 1;
    rr(ctx, cx - w / 2, cy - 5, w, 10, 5);
    ctx.fillStyle = 'rgba(20,24,28,0.88)';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    for (let k = 0; k < n; k++) {
      const t = tracks[k], tier = tierIn(b, t), px = cx - ((n - 1) * gap) / 2 + k * gap;
      ctx.beginPath();
      ctx.arc(px, cy, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = tier ? SUPPLIES[t].color : '#3a4048';
      ctx.fill();
      const ring = TIER_RINGS[tier];
      if (ring) {
        ctx.beginPath();
        ctx.arc(px, cy, 3.5, 0, Math.PI * 2);
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = ring;
        ctx.stroke();
      }
    }
  }

  /** "OUT OF ..." warnings over buildings: { i, t, at }, newest last (see warn). */
  const warnings = [];
  const WARN_MS = 4500;
  /**
   * A security building on anchor tile i has run out of a track's supply (a stockOut event, or a
   * test page): a red bubble pops up over it for a few seconds, on either floor.
   */
  function warn(i, track, now = performance.now()) {
    for (let k = warnings.length - 1; k >= 0; k--) if (warnings[k].i === i) warnings.splice(k, 1);
    warnings.push({ i, t: track, at: now });
    if (warnings.length > 24) warnings.shift();
  }

  /** The "OUT OF SPITE" bubbles: red, with a ! and a tail down to the building; they pop and fade. */
  function drawWarnings(s, now) {
    if (!warnings.length) return;
    // Readable when zoomed out too (about 11 screen pixels at least).
    const k = Math.max(1, 30 / cam.zoom);
    for (let n = warnings.length - 1; n >= 0; n--) {
      const wn = warnings[n], age = now - wn.at;
      if (age > WARN_MS || age < 0) { warnings.splice(n, 1); continue; }
      const b = s.grid[wn.i];
      if (!b || b.part !== undefined || !BUILD[b.k]) { warnings.splice(n, 1); continue; }
      const r = rectOf(b, wn.i, s.w);
      const pop = age < 160 ? 0.6 + 0.4 * (age / 160) : 1;
      ctx.globalAlpha = age > WARN_MS - 600 ? (WARN_MS - age) / 600 : 1;
      const txt = outOfText(wn.t), size = 11 * k * pop;
      ctx.font = font(size, 900);
      const tw = ctx.measureText(txt).width, h = 17 * k * pop, bw = tw + 26 * k * pop;
      const cx = Math.max(bw / 2 + 2, Math.min(s.w * T - bw / 2 - 2, r.x + r.w / 2));
      const by = r.y - 10 * k - h;
      // The tail, then the bubble.
      ctx.beginPath();
      ctx.moveTo(r.x + r.w / 2 - 5 * k, by + h - 1); ctx.lineTo(r.x + r.w / 2, r.y - 3); ctx.lineTo(r.x + r.w / 2 + 5 * k, by + h - 1);
      ctx.closePath();
      ctx.fillStyle = '#dc2626'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      rr(ctx, cx - bw / 2, by, bw, h, h / 2);
      ctx.fillStyle = '#dc2626'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - bw / 2 + h / 2, by + h / 2, h * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd23f'; ctx.fill();
      ctx.fillStyle = INK;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = font(size * 0.9, 900);
      ctx.fillText('!', cx - bw / 2 + h / 2, by + h / 2 + 0.5);
      ctx.font = font(size, 900);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(txt, cx + 7 * k * pop, by + h / 2 + 0.5);
    }
    ctx.globalAlpha = 1;
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
   * What gym bros have wrecked and nobody has rebuilt: a heap of bits where it stood, with a cone
   * on it once somebody has paid to rebuild it (0.3.04: it goes back when the way is clear).
   */
  function drawWreckage(s) {
    for (const r of s.rubble) {
      // Rubble entries are { i, k, d, ... }; (very old saves had [i, k, d, o]).
      const i = Array.isArray(r) ? r[0] : r.i, k = Array.isArray(r) ? r[1] : r.k, d = (Array.isArray(r) ? r[2] : r.d) | 0;
      if (s.grid[i] || !BUILD[k]) continue; // rebuilt
      const x = i % s.w, y = (i / s.w) | 0;
      // A big building's rubble starts up to two tiles before the visible area.
      if (x < vis.x0 - 2 || x >= vis.x1 || y < vis.y0 - 2 || y >= vis.y1) continue;
      drawRubble(ctx, i, k, s.w, d, !Array.isArray(r) && r.by !== undefined);
    }
  }

  function drawBuildings(s, now) {
    const grid = s.grid, w = s.w;
    const { y0, x1, y1 } = vis;
    // Start two tiles further left: a big building is drawn from the bottom-left of its footprint,
    // which may be off screen while the rest of it shows.
    const x0 = Math.max(0, vis.x0 - 2);
    // Level badges grow when zoomed out so the number stays readable (in steps, as they are cached).
    const bk = Math.round(Math.max(1, Math.min(1.6, 34 / cam.zoom)) * 10) / 10;
    const bres = stepScale(step);
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
        drawBuilding(ctx, b, ai, F, buildingSprites);
        drawWear(ctx, b, ai, F);
        const r = rectOf(b, ai, w);
        // The level it is working at: 1 plus what its stock gives every track (levelOf).
        const lv = b.s ? levelOf(b) : 1;
        if (lv > 1) drawBadge(ctx, r.x + r.w - T / 2, r.y + T / 2, lv, bk, bres, maxedOut(b));
        // A reinforced Crate Stack (0.4): its level, pink at the top one.
        else if (b.r > 0) drawBadge(ctx, r.x + r.w - T / 2, r.y + T / 2, b.r, bk, bres, b.r >= CRATE_TOP);
        if (BUILD[b.k].lift) drawPips(b, r);
      }
    }
  }

  /** A Crate Stack's top level of reinforcement. */
  const CRATE_TOP = BUILD.crate.reinforce.max;
  /** The level the best tier (Platinum) stands for in a track. */
  const TOP_LEVEL = BACK.tierLevel[BACK.tierLevel.length - 1];
  /**
   * True if every track a building works at by levels is stocked at the best tier (Duct Tape is
   * never counted as levels, so durability is left out). The badge then turns pink.
   */
  function maxedOut(b) {
    let any = false;
    for (const t of tracksOf(b.k)) {
      if (t === 'dur') continue;
      if (levelIn(b, t) < TOP_LEVEL) return false;
      any = true;
    }
    return any;
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
   * a dark one, so it reads on any floor without looking like "you may place it here").
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
   * A building's preview lifted above the finger placing it (view.lift: the finger, in tiles; touch
   * only, 0.3.03): a thin line from the finger up to the bottom of the preview and a small dot where
   * the finger is, so the eye ties the two together.
   */
  function drawLift(s, view) {
    const h = view.hover, k = view.tool, f = view.lift;
    if (!h || !BUILD[k]) return;
    const [w, hh] = sizeOf(k, BUILD[k].rot ? (view.dir | 0) & 3 : 0);
    const px = T / (cam.zoom || 32); // one screen pixel, in floor units
    const fx = f.x * T, fy = f.y * T;
    const tx = (h.x + w / 2) * T, ty = (h.y + hh) * T - 2 * px;
    ctx.save();
    ctx.lineCap = 'round';
    if (fy - ty > 6 * px) {
      ctx.beginPath();
      ctx.moveTo(fx, fy); ctx.lineTo(tx, ty);
      ctx.strokeStyle = 'rgba(17,24,39,0.7)'; ctx.lineWidth = 3.5 * px; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5 * px; ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(fx, fy, 4 * px, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    ctx.strokeStyle = 'rgba(17,24,39,0.8)'; ctx.lineWidth = 1.5 * px; ctx.stroke();
    ctx.restore();
  }

  /**
   * Ghost of the selected building at the hovered tile, or the remove highlight. `sel` is the
   * building whose sheet is open (selectedReach): its reach is drawn
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

    if (tool === 'wire') { wireHover(s, view, here, hr, px, py); return; }
    if (tool === 'reinforce') { reinforceHover(s, h, here, hr, px, py); return; }

    const def = tool ? BUILD[tool] : null;
    if (def) {
      const d = def.rot ? (view.dir | 0) & 3 : 0;
      const ok = canPlace(s, tool, h.x, h.y, session.me, d) === null;
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
      const fr = rectOf(ghost, gi, s.w);
      const gx = fr.x, gy = fr.y, gw = fr.w, gh = fr.h;
      showRange(s, ghost, gi, ok ? 'ok' : 'bad');
      rr(ctx, gx + 1, gy + 1, gw - 2, gh - 2, 5);
      ctx.fillStyle = ok ? 'rgba(74,222,128,0.35)' : 'rgba(239,68,68,0.4)';
      ctx.fill();
      ctx.globalAlpha = 0.7;
      drawBuilding(ctx, ghost, gi, F, buildingSprites);
      ctx.globalAlpha = 1;
      rr(ctx, gx + 1, gy + 1, gw - 2, gh - 2, 5);
      ctx.fillStyle = ok ? 'rgba(74,222,128,0.18)' : 'rgba(239,68,68,0.3)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = ok ? '#22c55e' : '#ef4444';
      ctx.stroke();
      return;
    }

    // No tool: show the reach of security under the mouse faintly, and a light hover outline
    // round the whole building.
    if (here && BUILD[here.k]) {
      if (!drawnBySelection(sel, ai)) showRange(s, here, ai, 'faint');
      tileOutline(hr.x, hr.y, 'rgba(255,255,255,0.7)', 2, hr.w, hr.h);
    } else tileOutline(px, py, 'rgba(255,255,255,0.7)', 2);
  }

  /** Words over a tile or building on the floor, readable however far out the view is zoomed. */
  function tagOver(text, cx, top, color) {
    const k = Math.max(1, 30 / cam.zoom);
    label(ctx, text, cx, top - 9 * k, 11 * k, color, INK, 3.5 * k);
  }

  const WIRE_WORDS = ['→ EAST', '↓ SOUTH', '← WEST', '↑ NORTH'];
  /**
   * The Wire tool over the floor (0.4), before it is pressed: a building that can carry wire is
   * outlined, with what a click would do; anything else gets a red outline (and a word on a crate).
   * While pressed and dragged, the preview (view.wirePreview) says it all.
   */
  function wireHover(s, view, here, hr, px, py) {
    if (view.wirePreview) return;
    if (here && carriesWire(here.k)) {
      tileOutline(hr.x, hr.y, 'rgba(216,180,254,0.95)', 3, hr.w, hr.h);
      const n = view.wireNext;
      if (n !== null && n !== undefined) tagOver(n >= 0 ? `CLICK: WIRE ${WIRE_WORDS[n]}` : 'CLICK: NO WIRE', hr.x + hr.w / 2, hr.y, '#e9d5ff');
      return;
    }
    const x = hr ? hr.x : px, y = hr ? hr.y : py, w = hr ? hr.w : T, hh = hr ? hr.h : T;
    tileOutline(x, y, 'rgba(239,68,68,0.9)', 2.5, w, hh);
    if (here) tagOver('NO DUMBWAITER, NO WIRE', x + w / 2, y, '#fca5a5');
  }

  /**
   * The Reinforce tool over the floor (0.4): a Crate Stack is outlined green with the price of its
   * next level and the level it would reach, red if this player cannot pay; at the top level it
   * says so; anything else gets a red outline.
   */
  function reinforceHover(s, h, here, hr, px, py) {
    if (here && here.k === 'crate') {
      const cost = reinforceCost(here, s), why = canReinforce(s, session.me, h.x, h.y);
      const ok = !why;
      tileOutline(hr.x, hr.y, ok ? '#22c55e' : '#ef4444', 3, hr.w, hr.h);
      const text = !cost ? `TOP LEVEL (${here.r | 0})` : `$${cost} → LEVEL ${(here.r | 0) + 1}${why === 'cash' ? ': SHORT' : ''}`;
      tagOver(text, hr.x + hr.w / 2, hr.y, ok ? '#bbf7d0' : '#fca5a5');
      return;
    }
    const x = hr ? hr.x : px, y = hr ? hr.y : py, w = hr ? hr.w : T, hh = hr ? hr.h : T;
    tileOutline(x, y, 'rgba(239,68,68,0.9)', 2.5, w, hh);
    if (here) tagOver('CRATES ONLY', x + w / 2, y, '#fca5a5');
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
  return { resize, tileAt, draw, cam, pan, centerOn, zoomBy, fit, viewRect, warn };
}
