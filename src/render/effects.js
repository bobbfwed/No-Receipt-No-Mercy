// Short-lived effects driven by simulation events: floating cash, speech blips, "WHOA" pops,
// forklift shots, rail gun beams, sprinkler bursts, wreckage when a gym bro smashes something,
// shield flashes round cosplayers, and sparkles when something is upgraded. A fixed pool of effect
// objects is reused so a big wave does not allocate, and every kind has a cap so the screen stays
// readable.
import { BUILD, DIRS, statsOf, sizeOf } from '../sim/index.js';
import { TILE, INK, C, rr, paint, label, starPath, burstPath, font, hash2 } from './paint.js';
import { drawItem } from './items.js';
import { KIND_COLOURS } from './buildings.js';

const T = TILE;
const TEXT = 1, BLIP = 2, POP = 3, SHOT = 4, SPRAY = 5, DEBRIS = 6, UPGRADE = 7, DENT = 8;
const BEAM = 9, MARK = 10, SHIELD = 11;
/** At most this many of each kind on screen at once; extra events are skipped. */
const CAP = [0, 24, 6, 12, 16, 24, 6, 8, 8, 8, 10, 8];
/** Lifetime of each kind in ms. */
const DUR = [0, 1100, 1900, 850, 280, 420, 950, 1000, 550, 480, 700, 420];
/** Upgrade tracks: the colour of the flash and the word on it. */
const TRACK_LOOK = {
  dmg: ['#ff6b5e', 'DMG'], spd: ['#5cc8ff', 'SPD'], rng: ['#4ade80', 'RNG'], dur: ['#ffd23f', 'DUR'],
};
/** What the TV Salesman shouts now and then, from his stand. */
const PITCH_LINES = ['ONLY $19.99', 'BUT WAIT!', 'LOOK AT THAT MEAT', 'CUTS LIKE YOUR EX', 'NO MONEY DOWN', 'CALL NOW, LOSER'];
/** Ms between the salesman's shouts (pitch events come several a second in a crowd). */
const PITCH_GAP = 2600;
const POOL = 90;
/**
 * Events processed per frame at most. Normally a frame brings a handful; after a fast-forward or
 * a hidden tab thousands may arrive at once, and only the latest are worth showing.
 */
const MAX_EVENTS = 48;

const DAD_LINES = ["I'll come back Tuesday", 'Forget it', 'I have a lawn'];
const ANGRY = ['#@!', '%$#!', '>:(', '!!!'];
/** What each kind says as it storms out, and in what colour (kinds not listed just swear). */
const LEFT_LINES = {
  dad: [DAD_LINES, INK],
  teen: [['whatever'], '#7c3aed'],
  mom: [['we are LEAVING'], '#c2307a'],
  blind: [['come on, boy'], '#1a5fa0'],
  gymbro: [['bro.'], '#d9372b'],
};
const KID_LINES = ['WHEEE', "CAN'T CATCH ME", 'NO'];
/** Pop styles: plain word, white star (WHOA), jagged burst (WOOF, CRUNCH), flying droplets. */
const PLAIN = 0, STAR = 1, JAGGED = 2, SPLASH = 3;
const DEBRIS_BITS = 9;
const SPRAY_DROPS = 12;

export function createEffects() {
  const pool = [];
  for (let k = 0; k < POOL; k++) {
    pool.push({ type: 0, t0: 0, x: 0, y: 0, x2: 0, y2: 0, text: '', color: '', w: 0, r: 0, st: PLAIN, sz: 0 });
  }
  const count = new Int32Array(CAP.length);
  /** Times (ms) of the latest event per tile or row, read by buildings and the tills. */
  const timers = { sprayAt: null, shotAt: null, railAt: null, saleAt: null, upAt: null, tillAt: null };
  let W = 0, H = 0;
  let pitchAt = -1e9; // when the salesman last shouted
  /** Sizes the per-tile timers for a map (they are kept if the size has not changed). */
  function setMap(w, h) {
    if (w === W && h === H) return;
    W = w; H = h;
    timers.sprayAt = new Float64Array(W * H).fill(-1e9);
    timers.shotAt = new Float64Array(W * H).fill(-1e9);
    timers.railAt = new Float64Array(W * H).fill(-1e9);
    timers.saleAt = new Float64Array(W * H).fill(-1e9);
    timers.upAt = new Float64Array(W * H).fill(-1e9);
    timers.tillAt = new Float64Array(H).fill(-1e9);
  }
  setMap(30, 16);
  let pick = 0; // rotates through the line banks

  function add(type, now, x, y) {
    if (count[type] >= CAP[type]) return null;
    let slot = null, oldest = null;
    for (let k = 0; k < POOL; k++) {
      const e = pool[k];
      if (!e.type) { if (!slot) slot = e; continue; }
      // Words and shots do not stack: skip one that would land on a live one of the same kind.
      if (e.type === type && type !== TEXT && type !== SPRAY && type !== BEAM && now - e.t0 < DUR[type] &&
          Math.abs(e.x - x) < (type === SHOT ? 1 : 40) && Math.abs(e.y - y) < (type === SHOT ? 1 : 22)) return null;
      if (!oldest || e.t0 < oldest.t0) oldest = e;
    }
    if (!slot) { slot = oldest; count[slot.type]--; }
    slot.type = type; slot.t0 = now; slot.x = x; slot.y = y; slot.w = 0; slot.r = 0; slot.st = PLAIN; slot.sz = 0;
    count[type]++;
    return slot;
  }

  /**
   * Turns simulation events into effects.
   * @param {Object} [s] the game state: its size places tile-indexed events, and its buildings
   *   give the sprinklers' ranges
   */
  function handle(events, now, s) {
    if (s) setMap(s.w, s.h);
    for (let n = Math.max(0, events.length - MAX_EVENTS); n < events.length; n++) {
      const e = events[n];
      if (e.i >= W * H) continue; // from a different map
      let f;
      switch (e.e) {
        case 'sale':
          timers.saleAt[e.i] = now;
          f = add(TEXT, now, (e.i % W) * T + T / 2, ((e.i / W) | 0) * T + 4);
          if (f) { f.text = '+$' + e.v; f.color = '#4ade80'; }
          break;
        case 'escape':
          timers.tillAt[Math.max(0, Math.min(H - 1, e.y | 0))] = now;
          f = add(TEXT, now, e.x * T - 22, e.y * T - 6);
          if (f) { f.text = '-$' + e.refund; f.color = '#ff5a4e'; }
          break;
        case 'left':
          f = add(BLIP, now, e.x * T, e.y * T - 30);
          if (f) {
            pick++;
            const said = LEFT_LINES[e.k];
            f.text = said ? said[0][pick % said[0].length] : ANGRY[pick % ANGRY.length];
            f.color = said ? said[1] : '#d9372b';
            f.sz = f.text.length > 5 ? 11 : 13;
          }
          break;
        case 'slip':
          f = add(POP, now, e.x * T, e.y * T - 26);
          if (f) { f.text = 'WHOA!'; f.color = C.yellow; f.r = -0.15; f.st = STAR; }
          break;
        case 'grab':
          f = add(POP, now, e.x * T, e.y * T - 30);
          if (f) { f.text = 'yoink'; f.color = '#ff8c1a'; f.r = 0.1; }
          break;
        case 'sample':
          f = add(POP, now, e.x * T, e.y * T - 30);
          if (f) { f.text = 'ooh'; f.color = '#ff8fc4'; f.r = 0; }
          break;
        case 'spray': {
          timers.sprayAt[e.i] = now;
          f = add(SPRAY, now, (e.i % W) * T + T / 2, ((e.i / W) | 0) * T + T / 2);
          const b = s && s.grid[e.i];
          if (f) f.w = (b && b.k === 'sprinkler' ? statsOf(b).range : BUILD.sprinkler.range) * T;
          break;
        }
        case 'shot':
          timers.shotAt[e.i] = now;
          f = add(SHOT, now, (e.i % W) * T + T / 2, ((e.i / W) | 0) * T + T / 2);
          if (f) { f.x2 = e.x * T; f.y2 = e.y * T; }
          break;
        case 'mess':
          f = add(POP, now, (e.i % W) * T + T / 2, ((e.i / W) | 0) * T + 8);
          if (f) { f.text = 'splat'; f.color = '#3fc6ff'; f.r = -0.1; f.st = SPLASH; f.sz = 12; }
          break;
        case 'kid':
          f = add(BLIP, now, e.x * T + 6, e.y * T - 24);
          if (f) { pick++; f.text = KID_LINES[pick % KID_LINES.length]; f.color = '#e8590c'; f.sz = 12; }
          break;
        case 'caught':
          f = add(POP, now, e.x * T, e.y * T - 34);
          if (f) { f.text = e.carry ? 'UP YOU GET' : 'gotcha'; f.color = '#4ade80'; f.r = 0.08; f.sz = e.carry ? 11 : 13; }
          break;
        case 'crawl':
          f = add(BLIP, now, e.x * T, e.y * T - 22);
          if (f) { f.text = "MOMMY'S COMING"; f.color = '#c2307a'; f.sz = 11; }
          break;
        case 'rail': {
          // The beam: from the gun's front end, straight out along its facing, the full length.
          timers.railAt[e.i] = now;
          const [cx, cy, fw] = centre(s, e.i, 'railgun', e.d);
          const [dx, dy] = DIRS[e.d & 3];
          f = add(BEAM, now, cx + dx * fw * T / 2, cy + dy * fw * T / 2);
          if (f) {
            f.x2 = f.x + dx * (e.len || 10) * T; f.y2 = f.y + dy * (e.len || 10) * T;
            const b = s && s.grid[e.i];
            f.w = (b && b.k === 'railgun' ? statsOf(b).width : BUILD.railgun.width) * 2 * T;
            f.sz = e.n | 0;
          }
          break;
        }
        case 'pee': {
          // A spritz of yellow over the building the dog went for.
          const [cx, cy] = centre(s, e.i, e.k);
          f = add(POP, now, cx, cy - 24);
          if (f) { f.text = 'PSSSST'; f.color = '#f2d21b'; f.r = -0.08; f.st = SPLASH; f.sz = 11; }
          break;
        }
        case 'flash':
          f = add(POP, now, e.x * T, e.y * T - 48);
          if (f) { f.text = 'TA-DA!'; f.color = '#ff5fa8'; f.r = -0.1; f.st = STAR; f.sz = 13; }
          if (e.n > 0) {
            f = add(MARK, now, e.x * T + 26, e.y * T - 30);
            if (f) { f.text = e.n > 1 ? `PHWOAR x${e.n}` : 'PHWOAR'; f.color = '#ff3d7f'; f.st = 1; }
          }
          break;
        case 'fall':
          f = add(POP, now, e.x * T, e.y * T - 20);
          if (f) { f.text = 'THUD'; f.color = '#e0a33a'; f.r = 0.12; f.st = JAGGED; f.sz = 13; }
          break;
        case 'pitch': {
          // A little mark over the shopper every time; a shout from the stand only now and then.
          f = add(MARK, now, e.x * T, e.y * T - 44);
          if (f) {
            f.text = e.r === 'rush' ? 'NOPE' : 'ooh';
            f.color = e.r === 'rush' ? '#cbd5e1' : '#7dd3fc';
            f.st = e.r === 'rush' ? 2 : 0;
          }
          if (now - pitchAt < PITCH_GAP || !s) break;
          const stand = nearestSalesman(s, e.x, e.y);
          if (stand < 0) break;
          const [cx, cy] = centre(s, stand, 'salesman');
          f = add(BLIP, now, cx + 10, cy - 52);
          if (f) { pitchAt = now; pick++; f.text = PITCH_LINES[pick % PITCH_LINES.length]; f.color = '#b8860b'; f.sz = 11; }
          break;
        }
        case 'kidtv':
          f = add(BLIP, now, e.x * T + 4, e.y * T - 22);
          if (f) { f.text = 'OOH, KNIVES!'; f.color = '#e8590c'; f.sz = 11; }
          break;
        case 'shield':
          f = add(SHIELD, now, e.x * T, e.y * T - 18);
          if (f) f.r = hash2(now | 0, 3) * 6;
          break;
        case 'bolt':
          f = add(POP, now, e.x * T + 14, e.y * T - 30);
          if (f) { f.text = 'WOOF!'; f.color = '#d9372b'; f.r = -0.12; f.st = JAGGED; f.sz = 15; }
          break;
        case 'smash': {
          // A building still standing (left > 0) is still on the grid; a destroyed one is in the
          // rubble list, which remembers its facing.
          let d = 0;
          if (s && e.left === 0 && s.rubble) {
            for (let k = s.rubble.length - 1; k >= 0; k--) if (s.rubble[k].i === e.i) { d = s.rubble[k].d | 0; break; }
          }
          const [x, y, fw, fh] = centre(s, e.i, e.k || 'crate', d);
          if (e.left > 0) {
            // It took the hit and is still standing: a dent, a few chips and a smaller word.
            f = add(DENT, now, x, y);
            if (f) { f.x2 = e.i; f.text = e.k || 'crate'; }
            f = add(POP, now, x + 8, y - fh * T / 2 - 2);
            if (f) { f.text = e.left === 1 ? 'CLANG!' : 'BONK'; f.color = '#ffd23f'; f.r = -0.12; f.st = PLAIN; f.sz = 11; }
            break;
          }
          f = add(DEBRIS, now, x, y);
          if (f) { f.x2 = e.i; f.text = e.k || 'crate'; f.sz = Math.max(fw, fh); }
          f = add(POP, now, x, y - fh * T / 2 - 6);
          if (f) {
            const crate = !e.k || e.k === 'crate';
            f.text = crate ? 'CRUNCH' : 'CRASH!'; f.color = crate ? C.orange : '#ff5a4e'; f.r = 0.1; f.st = JAGGED; f.sz = 14;
          }
          break;
        }
        case 'upgraded': {
          if (!(e.x >= 0 && e.y >= 0 && e.x < W && e.y < H)) break;
          const ai = e.y * W + e.x;
          timers.upAt[ai] = now;
          const b = s && s.grid[ai];
          const [cx, cy] = centre(s, ai, e.k, b ? b.d | 0 : 0);
          f = add(UPGRADE, now, cx, cy);
          if (f) {
            const look = TRACK_LOOK[e.t];
            f.text = look ? `${look[1]} ${e.lv | 0}` : 'LV ' + (e.lv | 0);
            f.color = look ? look[0] : '#ffd23f';
            f.r = (e.x * 7 + e.y * 3) % 10;
          }
          break;
        }
        default:
      }
    }
  }

  /**
   * The centre of a building's footprint in logical pixels, and its size in tiles: [cx, cy, w, h].
   * The building on the anchor tile decides the facing if it is still there; otherwise `d`.
   */
  function centre(s, ai, k, d = 0) {
    const g = s && s.grid && s.grid[ai];
    const b = g && g.part === undefined ? g : null;
    const kind = b ? b.k : k;
    const def = BUILD[kind];
    const [fw, fh] = def ? sizeOf(kind, def.rot ? (b ? b.d | 0 : d) : 0) : [1, 1];
    return [(ai % W) * T + (fw * T) / 2, ((ai / W) | 0) * T + (fh * T) / 2, fw, fh];
  }

  /** The anchor tile of the TV Salesman nearest (x, y) in tiles, or -1. */
  function nearestSalesman(s, x, y) {
    let best = -1, bd = Infinity;
    const g = s.grid;
    // Only near the shopper: his reach is a few tiles, upgraded a few more.
    const r = 10, x0 = Math.max(0, (x | 0) - r), x1 = Math.min(W - 1, (x | 0) + r);
    const y0 = Math.max(0, (y | 0) - r), y1 = Math.min(H - 1, (y | 0) + r);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const b = g[ty * W + tx];
        if (!b || b.k !== 'salesman' || b.part !== undefined || b.off > 0) continue;
        const d2 = (tx + 1 - x) ** 2 + (ty + 1 - y) ** 2;
        if (d2 < bd) { bd = d2; best = ty * W + tx; }
      }
    }
    return best;
  }

  /**
   * Draws live effects. layer 0 is under the shoppers (sprinkler bursts), layer 1 above them.
   */
  function draw(ctx, now, layer, sprites) {
    for (let k = 0; k < POOL; k++) {
      const e = pool[k];
      if (!e.type) continue;
      const k01 = (now - e.t0) / DUR[e.type];
      if (k01 >= 1 || k01 < 0) { count[e.type]--; e.type = 0; continue; }
      if ((e.type === SPRAY) !== (layer === 0)) continue;
      switch (e.type) {
        case TEXT: floatText(ctx, e, k01); break;
        case BLIP: blip(ctx, e, k01, W * T); break;
        case POP: pop(ctx, e, k01); break;
        case SHOT: shot(ctx, e, k01, sprites); break;
        case SPRAY: spray(ctx, e, k01); break;
        case DEBRIS: if (e.text === 'crate') debris(ctx, e, k01); else wreckage(ctx, e, k01); break;
        case DENT: dent(ctx, e, k01); break;
        case UPGRADE: upgrade(ctx, e, k01); break;
        case BEAM: beam(ctx, e, k01); break;
        case MARK: mark(ctx, e, k01); break;
        case SHIELD: shield(ctx, e, k01); break;
        default:
      }
    }
    ctx.globalAlpha = 1;
  }

  return { handle, draw, timers, setMap };
}

function fadeOut(k, from = 0.7) {
  return k < from ? 1 : 1 - (k - from) / (1 - from);
}

function floatText(ctx, e, k) {
  ctx.globalAlpha = fadeOut(k);
  const grow = k < 0.12 ? 0.6 + (k / 0.12) * 0.4 : 1;
  label(ctx, e.text, e.x, Math.max(12, e.y - k * 28), 17 * grow, e.color, INK, 4);
  ctx.globalAlpha = 1;
}

/** A speech bubble with a tail, kept inside the world so it is never cut off. */
function blip(ctx, e, k, worldW) {
  ctx.globalAlpha = fadeOut(k, 0.8);
  const size = e.sz || 13;
  ctx.font = font(size);
  if (!e.w) e.w = ctx.measureText(e.text).width + 12;
  const w = e.w, h = size + 9;
  const x = Math.max(w / 2 + 4, Math.min(worldW - w / 2 - 4, e.x));
  const y = Math.max(h + 4, e.y - k * 8);
  const pin = k < 0.1 ? 0.7 + k * 3 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pin, pin);
  rr(ctx, -w / 2, -h, w, h, 6);
  ctx.moveTo(-4, 0);
  ctx.lineTo(-7, 7);
  ctx.lineTo(3, 0);
  paint(ctx, '#ffffff', 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-4.5, -2, 7, 3); // hide the outline where the tail joins
  label(ctx, e.text, 0, -h / 2, size, e.color, null);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** A comic word that pops up with a little starburst. */
function pop(ctx, e, k) {
  ctx.globalAlpha = fadeOut(k, 0.6);
  const s = k < 0.15 ? 0.5 + (k / 0.15) * 0.6 : k < 0.25 ? 1.1 - (k - 0.15) : 1;
  ctx.save();
  ctx.translate(e.x, e.y - k * 12);
  ctx.rotate(e.r);
  ctx.scale(s, s);
  if (e.st === STAR) {
    starPath(ctx, 0, 0, 22, 0);
    paint(ctx, '#ffffff', 2);
  } else if (e.st === JAGGED) {
    burstPath(ctx, 0, 0, 22, 11, 0.2);
    paint(ctx, '#fff3a8', 2);
  } else if (e.st === SPLASH) {
    // Droplets thrown up out of the splat, falling back.
    ctx.beginPath();
    for (let j = 0; j < 7; j++) {
      const a = -Math.PI * (0.08 + 0.84 * (j / 6));
      const d = 10 + k * 20;
      const x = Math.cos(a) * d * 1.3, y = 10 + Math.sin(a) * d + k * k * 26;
      ctx.moveTo(x + 2.2, y);
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    }
    paint(ctx, e.color, 1.2);
  }
  label(ctx, e.text, 0, 0, e.sz || (e.text === 'ooh' ? 13 : 14), e.color, INK, 3.5);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Forklift shot: a box flies along a tracer to the target, then a starburst on impact. */
function shot(ctx, e, k, sprites) {
  const dx = e.x2 - e.x, dy = e.y2 - e.y;
  const len = Math.hypot(dx, dy) || 1;
  const sx = e.x + (dx / len) * 16, sy = e.y + (dy / len) * 16; // from the fork tips
  const p = Math.min(1, k * 2.2);
  const px = sx + (e.x2 - sx) * p, py = sy + (e.y2 - sy) * p;
  ctx.globalAlpha = 1 - k * 0.6;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(px, py);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,225,74,0.95)';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  if (p < 1) drawItem(ctx, sprites, 'box', px, py, 16);
  else {
    const q = (k - 1 / 2.2) / (1 - 1 / 2.2);
    ctx.globalAlpha = 1 - q;
    starPath(ctx, e.x2, e.y2 - 6, 9 + q * 6, q);
    paint(ctx, C.orange, 2);
  }
  ctx.globalAlpha = 1;
}

/** Pepper sprinkler burst: an orange cloud and droplets reaching out to its range. */
function spray(ctx, e, k) {
  const R = e.w || BUILD.sprinkler.range * T; // the range of the sprinkler at its level
  const r = R * (0.3 + 0.7 * Math.sqrt(k));
  // A soft cloud of pepper...
  ctx.globalAlpha = 0.32 * (1 - k);
  ctx.beginPath();
  ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
  ctx.fillStyle = C.orange;
  ctx.fill();
  // ...jets streaking outward from the head...
  const rot = e.t0 * 0.0013;
  ctx.globalAlpha = 0.85 * (1 - k);
  ctx.beginPath();
  for (let j = 0; j < SPRAY_DROPS; j++) {
    const a = rot + (j * Math.PI * 2) / SPRAY_DROPS;
    const c = Math.cos(a), s = Math.sin(a);
    ctx.moveTo(e.x + c * r * 0.45, e.y + s * r * 0.45);
    ctx.lineTo(e.x + c * r * 0.8, e.y + s * r * 0.8);
  }
  ctx.strokeStyle = '#ff7a1a';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();
  // ...ending in droplets.
  ctx.beginPath();
  for (let j = 0; j < SPRAY_DROPS; j++) {
    const a = rot + (j * Math.PI * 2) / SPRAY_DROPS;
    const x = e.x + Math.cos(a) * r * 0.9, y = e.y + Math.sin(a) * r * 0.9;
    ctx.moveTo(x + 2.4, y);
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
  }
  ctx.fillStyle = '#ff5a1a';
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A crate stack smashed apart: planks and splinters flung outward, and a puff of dust. */
// (Other kinds of building fly apart in their own colours: see wreckage below.)
function debris(ctx, e, k) {
  const seed = e.x2 | 0;
  ctx.globalAlpha = 0.55 * (1 - k);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 4, 12 + k * 26, 7 + k * 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#d8c7a6';
  ctx.fill();
  ctx.globalAlpha = fadeOut(k, 0.6);
  for (let j = 0; j < DEBRIS_BITS; j++) {
    const h1 = hash2(seed, j), h2 = hash2(j, seed + 7);
    const a = (j / DEBRIS_BITS) * Math.PI * 2 + h1 * 0.6;
    const v = 30 + h2 * 34;
    // Out along the angle, thrown up and falling back down.
    const x = e.x + Math.cos(a) * v * k;
    const y = e.y + Math.sin(a) * v * k * 0.6 - 40 * k + 46 * k * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + k * (h1 > 0.5 ? 9 : -9));
    if (j % 3 !== 2) {
      ctx.beginPath();
      ctx.rect(-6, -1.8, 12, 3.6);
      paint(ctx, j % 2 ? '#b57a3c' : C.wood, 1.3);
      ctx.fillStyle = '#7a4f22';
      ctx.fillRect(-4, -0.4, 2, 0.9);
    } else {
      ctx.beginPath();
      ctx.moveTo(-4, 0); ctx.lineTo(4, -1.2); ctx.lineTo(3, 1.2);
      ctx.closePath();
      paint(ctx, C.cardboardLight, 1);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/**
 * Anything else a gym bro wrecks: shards and panels in the building's own colours flung outward,
 * a few sparks, and the same puff of dust. Crates keep their planks (debris above).
 */
function wreckage(ctx, e, k) {
  const seed = e.x2 | 0;
  const col = KIND_COLOURS[e.text] || KIND_COLOURS.crate;
  // A big building (sz = its longer side in tiles) goes up in a bigger burst.
  const sc = e.sz > 1 ? 1 + (e.sz - 1) * 0.55 : 1;
  const bits = DEBRIS_BITS + 2 + (sc > 1 ? 6 : 0);
  ctx.globalAlpha = 0.55 * (1 - k);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 4, (12 + k * 26) * sc, (7 + k * 12) * sc, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#cfcac0';
  ctx.fill();
  ctx.globalAlpha = fadeOut(k, 0.6);
  for (let j = 0; j < bits; j++) {
    const h1 = hash2(seed, j), h2 = hash2(j, seed + 7);
    const a = (j / bits) * Math.PI * 2 + h1 * 0.6;
    const v = (30 + h2 * 38) * sc;
    const x = e.x + Math.cos(a) * v * k;
    const y = e.y + Math.sin(a) * v * k * 0.6 - 40 * k + 46 * k * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + k * (h1 > 0.5 ? 10 : -10));
    ctx.beginPath();
    if (j % 4 === 3) {
      // A bolt or spring.
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      paint(ctx, '#5b6168', 1);
    } else if (j % 2) {
      ctx.moveTo(-5, 1.5); ctx.lineTo(3, -3); ctx.lineTo(5, 2.5);
      ctx.closePath();
      paint(ctx, col[j % 3], 1.2);
    } else {
      ctx.rect(-5.5, -2.5, 11, 5);
      paint(ctx, col[(j >> 1) % 3], 1.3);
    }
    ctx.restore();
  }
  // Sparks in the first moment.
  if (k < 0.35) {
    ctx.globalAlpha = 1 - k / 0.35;
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const a = hash2(seed + 3, j) * Math.PI * 2, r0 = 6 + k * 40, r1 = r0 + 7;
      ctx.moveTo(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0);
      ctx.lineTo(e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1);
    }
    ctx.strokeStyle = '#ffe14a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** An upgraded building that was hit and lost a level: a jolt of stars and a few chips. */
function dent(ctx, e, k) {
  const seed = e.x2 | 0;
  const col = KIND_COLOURS[e.text] || KIND_COLOURS.crate;
  ctx.globalAlpha = fadeOut(k, 0.5);
  starPath(ctx, e.x, e.y - 4, 10 + k * 8, k * 2);
  paint(ctx, '#fff3a8', 1.6);
  for (let j = 0; j < 4; j++) {
    const a = -Math.PI * (0.15 + 0.7 * hash2(seed, j));
    const v = 18 + hash2(j, seed) * 14;
    const x = e.x + Math.cos(a) * v * k, y = e.y - 4 + Math.sin(a) * v * k + 30 * k * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(k * 8 + j);
    ctx.beginPath();
    ctx.rect(-3, -1.5, 6, 3);
    paint(ctx, col[j % 3], 1);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** Upgraded: a gold ring bursting out, sparkles spinning off, and the new level rising. */
function upgrade(ctx, e, k) {
  const r = 10 + k * 26;
  ctx.globalAlpha = Math.max(0, 1 - k * 1.3);
  ctx.beginPath();
  ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = e.color || '#ffd23f';
  ctx.lineWidth = 4 * (1 - k) + 1;
  ctx.stroke();
  ctx.globalAlpha = fadeOut(k, 0.55);
  for (let j = 0; j < 6; j++) {
    const a = e.r + (j * Math.PI * 2) / 6 + k * 2;
    const d = 8 + k * 30;
    starPath(ctx, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.8, 4.5 * (1 - k * 0.5), a);
    paint(ctx, j % 2 ? '#ffffff' : '#ffe14a', 1.1);
  }
  ctx.globalAlpha = fadeOut(k, 0.6);
  const grow = k < 0.15 ? 0.5 + (k / 0.15) * 0.5 : 1;
  label(ctx, e.text, e.x, e.y - 24 - k * 18, 15 * grow, e.color || '#ffd23f', INK, 4);
  ctx.globalAlpha = 1;
}

/**
 * The rail gun's beam: a white-hot core in a cyan glow, the full length at once, thinning and
 * fading fast; a flash at the muzzle and a ring of sparks where it starts. (x, y) is the gun's
 * front end, (x2, y2) the far end, w the width it hits.
 */
function beam(ctx, e, k) {
  const fade = 1 - k;
  const w = Math.max(6, e.w || 48);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineTo(e.x2, e.y2);
  ctx.globalAlpha = 0.35 * fade;
  ctx.strokeStyle = '#38e1ff';
  ctx.lineWidth = w * (1 + k * 0.4);
  ctx.stroke();
  ctx.globalAlpha = 0.9 * fade;
  ctx.strokeStyle = '#7df9ff';
  ctx.lineWidth = w * 0.45 * (1 - k * 0.6);
  ctx.stroke();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, w * 0.18 * (1 - k));
  ctx.stroke();
  // Crackles along the beam.
  const dx = e.x2 - e.x, dy = e.y2 - e.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  ctx.beginPath();
  for (let j = 0; j < 7; j++) {
    const p = (j + 0.5) / 7, off = (hash2(j, e.t0 | 0) - 0.5) * w * 0.9;
    const px = e.x + dx * p, py = e.y + dy * p;
    ctx.moveTo(px - dx / len * 8, py - dy / len * 8);
    ctx.lineTo(px + nx * off, py + ny * off);
    ctx.lineTo(px + dx / len * 8, py + dy / len * 8);
  }
  ctx.globalAlpha = 0.8 * fade;
  ctx.strokeStyle = '#e0ffff';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // Muzzle flash.
  ctx.globalAlpha = Math.max(0, 1 - k * 1.8);
  starPath(ctx, e.x, e.y, 14 + k * 10, k * 3);
  paint(ctx, '#e0ffff', 1.6);
  if (e.sz > 1 && k < 0.8) {
    ctx.globalAlpha = fadeOut(k, 0.5);
    label(ctx, 'x' + e.sz, e.x + dx / len * 34 + nx * 22, e.y + dy / len * 34 + ny * 22 - 6, 13, '#7df9ff', INK, 3.5);
  }
  ctx.globalAlpha = 1;
}

/** A small word over a shopper: st 0 plain, 1 with wolf-whistle marks, 2 with speed lines. */
function mark(ctx, e, k) {
  ctx.globalAlpha = fadeOut(k, 0.6);
  const y = e.y - k * 10;
  const sz = e.st === 1 ? 12 : 10;
  label(ctx, e.text, e.x, y, sz, e.color, INK, 3);
  if (e.st === 1) {
    // Two little whistle marks either side.
    ctx.beginPath();
    for (const sgn of [-1, 1]) {
      ctx.font = font(sz);
      const hw = ctx.measureText(e.text).width / 2 + 4;
      ctx.moveTo(e.x + sgn * hw, y - 4); ctx.lineTo(e.x + sgn * (hw + 5), y - 9);
      ctx.moveTo(e.x + sgn * hw, y + 1); ctx.lineTo(e.x + sgn * (hw + 7), y + 1);
    }
    ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
  } else if (e.st === 2) {
    ctx.beginPath();
    for (let j = 0; j < 3; j++) { ctx.moveTo(e.x - 16 - j * 2, y - 4 + j * 4); ctx.lineTo(e.x - 24 - j * 2 - k * 6, y - 4 + j * 4); }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A cosplayer soaking up a shot: a bubble shield flashing round him, and a TINK. */
function shield(ctx, e, k) {
  const r = 20 + k * 8;
  ctx.globalAlpha = 0.5 * (1 - k);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, r, r * 1.15, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#7df9ff';
  ctx.fill();
  ctx.globalAlpha = 1 - k;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#e0ffff';
  ctx.stroke();
  // Hexagon facets on the bubble.
  ctx.beginPath();
  for (let j = 0; j < 6; j++) {
    const a = e.r + (j * Math.PI) / 3;
    ctx.moveTo(e.x + Math.cos(a) * r * 0.45, e.y + Math.sin(a) * r * 0.5);
    ctx.lineTo(e.x + Math.cos(a) * r * 0.95, e.y + Math.sin(a) * r * 1.08);
  }
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.stroke();
  if (k < 0.7) label(ctx, 'TINK', e.x + r * 0.9, e.y - r * 0.9, 10, '#e0ffff', INK, 3);
  ctx.globalAlpha = 1;
}
