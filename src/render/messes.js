// Messes: the slushie spills teenagers leave on the floor (state.messes, as [tile index, ticks
// left]). Each is a bright splat with the tipped-over cup, pre-rendered in a few variants and
// stamped on its tile above the floor and under everything else. A new one splashes in; an old
// one fades out over its last second. With the slushie card (0.3.01) a mess also spills onto the
// tiles beside it ([tile, ticks, 1]): those are a wider blue-raspberry puddle without a cup, big
// enough to run into the next one, so the five tiles read as one spill.
import { TUNE, TICK_HZ } from '../sim/index.js';
import { TILE, INK, paint, hash2, makeSprite } from './paint.js';
import { createPaintBudget, createSpriteCache } from './spritecache.js';

const T = TILE;
const TAU = Math.PI * 2;
const SIZE = 48; // logical pixels, a little more than a tile so the drips spill over
const FADE = 30; // ticks: fades out over the last second
const LIFE = Math.max(1, Math.round(TUNE.messSecs * TICK_HZ));
const VARIANTS = 4;
/** Sprites from VARIANTS on are the cupless spill round a big mess (two shapes). */
const SPILLS = 2;
/** The spill sprites are bigger than a tile and a half, so the five tiles join up into one puddle. */
const SPILL_SIZE = 64;
/** How far (logical pixels) a spill is drawn toward the mess it came from. */
const SPILL_PULL = 7;
/** Blue raspberry and cherry: [main, edge, highlight]. */
const FLAVOURS = [['#3fc6ff', '#1d8fd6', '#c9f3ff'], ['#ff4f7a', '#c92a52', '#ffd0dc']];

/** Mess sprites at the current screen scale. Call setScale() on resize; made on first use. */
export function createMessSprites(budget = createPaintBudget({ ms: Infinity })) {
  let scale = 1;
  // (0.4, stage 5b) A new scale keeps the old splats to draw meanwhile (spritecache.js).
  const make = (v) => makeSprite(v >= VARIANTS ? SPILL_SIZE : SIZE, scale, (g) => paintMess(g, v));
  const cache = createSpriteCache(budget, make);
  return {
    setScale(s) { if (s !== scale) { scale = s; cache.rescale(); } },
    idle: () => cache.idle(),
    get(v) {
      let sp = cache.have(v);
      if (!sp) {
        budget.begin();
        sp = make(v);
        budget.end();
        cache.put(v, sp, v);
      }
      return sp;
    },
  };
}

/** A wobbly closed blob through n points around (x, y), radius r +- jitter (smoothed). */
function blob(g, x, y, r, jitter, n, seed, squash = 0.78) {
  const px = [], py = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    const rad = r + (hash2(seed, k) - 0.5) * 2 * jitter + (k % 2 ? -jitter * 0.5 : jitter * 0.5);
    px.push(x + Math.cos(a) * rad);
    py.push(y + Math.sin(a) * rad * squash);
  }
  g.beginPath();
  g.moveTo((px[n - 1] + px[0]) / 2, (py[n - 1] + py[0]) / 2);
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    g.quadraticCurveTo(px[k], py[k], (px[k] + px[j]) / 2, (py[k] + py[j]) / 2);
  }
  g.closePath();
}

function paintMess(g, v) {
  if (v >= VARIANTS) { paintSpill(g, v); return; }
  const [col, edge, light] = FLAVOURS[v % 2];
  // Drips flung out around the splat.
  for (let k = 0; k < 6; k++) {
    const a = hash2(v + 11, k) * TAU;
    const d = 15 + hash2(v + 23, k) * 6;
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d * 0.78, 1.3 + hash2(v + 5, k) * 1.6, 0, TAU);
    paint(g, col, 1.1);
  }
  // The splat, a darker rim and a glossy highlight.
  blob(g, 0, 1, 13, 3.2, 16, v * 7 + 3);
  paint(g, col, 1.8);
  blob(g, -1, 1.5, 9.5, 1.6, 12, v * 7 + 4);
  g.strokeStyle = edge;
  g.lineWidth = 1.4;
  g.stroke();
  g.beginPath();
  g.ellipse(-4, -2, 4, 1.8, -0.3, 0, TAU);
  g.fillStyle = light;
  g.fill();
  // The cup, tipped over at the edge with its mouth toward the spill, and the straw.
  const pa = v * 1.7 + 0.6;
  const cx = Math.cos(pa) * 10, cy = Math.sin(pa) * 7 - 1;
  g.save();
  g.translate(cx, cy);
  g.rotate(Math.atan2(-cy, -cx));
  g.beginPath();
  g.moveTo(-6.5, -3.2); g.lineTo(5.5, -5); g.lineTo(5.5, 5); g.lineTo(-6.5, 3.2);
  g.closePath();
  paint(g, '#e8303a', 1.5);
  g.fillStyle = '#ffffff';
  g.fillRect(-1.5, -4.1, 2.6, 8.2);
  g.beginPath();
  g.ellipse(5.5, 0, 1.6, 5, 0, 0, TAU);
  paint(g, col, 1.3);
  g.beginPath();
  g.moveTo(3, 6.5); g.lineTo(12, 9);
  g.lineCap = 'round';
  g.strokeStyle = INK; g.lineWidth = 2.8; g.stroke();
  g.strokeStyle = '#ffe14a'; g.lineWidth = 1.3; g.stroke();
  g.restore();
}

/** The spill round a big mess (the slushie card): a wide blue puddle with drips, no cup. */
function paintSpill(g, v) {
  const [col, edge, light] = FLAVOURS[0];
  for (let k = 0; k < 5; k++) {
    const a = hash2(v + 41, k) * TAU;
    const d = 25 + hash2(v + 43, k) * 4;
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d * 0.8, 1.2 + hash2(v + 47, k) * 1.4, 0, TAU);
    paint(g, col, 1.1);
  }
  blob(g, 0, 0, 23, 3.4, 18, v * 13 + 5, 0.86);
  paint(g, col, 1.6);
  blob(g, 1, 0.5, 16, 2, 14, v * 13 + 6, 0.86);
  g.strokeStyle = edge;
  g.lineWidth = 1.2;
  g.stroke();
  g.beginPath();
  g.ellipse(-5, -4, 4.5, 1.8, -0.3, 0, TAU);
  g.fillStyle = light;
  g.fill();
}

/**
 * Draws every mess on its tile. The caller has set the world transform.
 * @param {Array<[number, number]>} messes state.messes
 * @param {number} alpha fraction of the current tick (ticks left run down smoothly)
 * @param {number} w the map's width in tiles
 */
export function drawMesses(ctx, messes, alpha, sprites, w) {
  // (Spills first, so the cup in the middle of a big mess is never painted over.)
  for (let pass = 0; pass < 2; pass++) drawPass(ctx, messes, alpha, sprites, w, pass === 0);
  ctx.globalAlpha = 1;
}

/** One pass of drawMesses: the spills round big messes, or every other mess. */
function drawPass(ctx, messes, alpha, sprites, w, spills) {
  for (let n = 0; n < messes.length; n++) {
    if ((messes[n][2] === 1) !== spills) continue;
    const i = messes[n][0], left = messes[n][1] - alpha;
    const k = Math.min(1, left / FADE);
    if (k <= 0) continue;
    const age = LIFE - left;
    const grow = age < 5 ? 0.35 + 0.65 * Math.max(0, age) / 5 : 1;
    let x = (i % w) * T + T / 2, y = ((i / w) | 0) * T + T / 2;
    if (spills) {
      // Drawn a little toward the mess it spilt from, so they run together.
      for (const m of messes) {
        if (m.length > 2) continue;
        const d = m[0] - i;
        if (d === 1 || d === -1 || d === w || d === -w) {
          x += (d === 1 ? 1 : d === -1 ? -1 : 0) * SPILL_PULL;
          y += (d === w ? 1 : d === -w ? -1 : 0) * SPILL_PULL;
          break;
        }
      }
    }
    const sp = sprites.get(messes[n][2] === 1 ? VARIANTS + ((hash2(i, 93) * SPILLS) | 0) : (hash2(i, 91) * VARIANTS) | 0);
    const size = sp.size * grow;
    ctx.globalAlpha = k;
    ctx.drawImage(sp.canvas, x - size / 2, y - size / 2, size, size);
  }
}
