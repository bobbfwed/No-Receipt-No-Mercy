// Short-lived effects driven by simulation events: floating cash, speech blips, "WHOA" pops,
// forklift shots and sprinkler bursts. A fixed pool of effect objects is reused so a big wave
// does not allocate, and every kind has a cap so the screen stays readable.
import { W, H, BUILD } from '../sim/index.js';
import { TILE, INK, C, rr, paint, label, starPath, font } from './paint.js';
import { drawItem } from './items.js';

const T = TILE;
const TEXT = 1, BLIP = 2, POP = 3, SHOT = 4, SPRAY = 5;
/** At most this many of each kind on screen at once; extra events are skipped. */
const CAP = [0, 24, 6, 12, 16, 24];
/** Lifetime of each kind in ms. */
const DUR = [0, 1100, 1900, 850, 280, 420];
const POOL = 90;
/**
 * Events processed per frame at most. Normally a frame brings a handful; after a fast-forward or
 * a hidden tab thousands may arrive at once, and only the latest are worth showing.
 */
const MAX_EVENTS = 48;

const DAD_LINES = ["I'll come back Tuesday", 'Forget it', 'I have a lawn'];
const ANGRY = ['#@!', '%$#!', '>:(', '!!!'];
const SPRAY_DROPS = 12;

export function createEffects() {
  const pool = [];
  for (let k = 0; k < POOL; k++) {
    pool.push({ type: 0, t0: 0, x: 0, y: 0, x2: 0, y2: 0, text: '', color: '', w: 0, r: 0 });
  }
  const count = new Int32Array(CAP.length);
  /** Times (ms) of the latest event per tile or row, read by buildings and the tills. */
  const timers = {
    sprayAt: new Float64Array(W * H).fill(-1e9),
    shotAt: new Float64Array(W * H).fill(-1e9),
    saleAt: new Float64Array(W * H).fill(-1e9),
    tillAt: new Float64Array(H).fill(-1e9),
  };
  let pick = 0; // rotates through the line banks

  function add(type, now, x, y) {
    if (count[type] >= CAP[type]) return null;
    let slot = null, oldest = null;
    for (let k = 0; k < POOL; k++) {
      const e = pool[k];
      if (!e.type) { if (!slot) slot = e; continue; }
      // Words and shots do not stack: skip one that would land on a live one of the same kind.
      if (e.type === type && type !== TEXT && type !== SPRAY && now - e.t0 < DUR[type] &&
          Math.abs(e.x - x) < (type === SHOT ? 1 : 40) && Math.abs(e.y - y) < (type === SHOT ? 1 : 22)) return null;
      if (!oldest || e.t0 < oldest.t0) oldest = e;
    }
    if (!slot) { slot = oldest; count[slot.type]--; }
    slot.type = type; slot.t0 = now; slot.x = x; slot.y = y; slot.w = 0;
    count[type]++;
    return slot;
  }

  /** Turns simulation events into effects. */
  function handle(events, now) {
    for (let n = Math.max(0, events.length - MAX_EVENTS); n < events.length; n++) {
      const e = events[n];
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
            f.text = e.k === 'dad' ? DAD_LINES[pick % DAD_LINES.length] : ANGRY[pick % ANGRY.length];
            f.color = e.k === 'dad' ? INK : '#d9372b';
          }
          break;
        case 'slip':
          f = add(POP, now, e.x * T, e.y * T - 26);
          if (f) { f.text = 'WHOA!'; f.color = C.yellow; f.r = -0.15; }
          break;
        case 'grab':
          f = add(POP, now, e.x * T, e.y * T - 30);
          if (f) { f.text = 'yoink'; f.color = '#ff8c1a'; f.r = 0.1; }
          break;
        case 'sample':
          f = add(POP, now, e.x * T, e.y * T - 30);
          if (f) { f.text = 'ooh'; f.color = '#ff8fc4'; f.r = 0; }
          break;
        case 'spray':
          timers.sprayAt[e.i] = now;
          add(SPRAY, now, (e.i % W) * T + T / 2, ((e.i / W) | 0) * T + T / 2);
          break;
        case 'shot':
          timers.shotAt[e.i] = now;
          f = add(SHOT, now, (e.i % W) * T + T / 2, ((e.i / W) | 0) * T + T / 2);
          if (f) { f.x2 = e.x * T; f.y2 = e.y * T; }
          break;
        default:
      }
    }
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
        case BLIP: blip(ctx, e, k01); break;
        case POP: pop(ctx, e, k01); break;
        case SHOT: shot(ctx, e, k01, sprites); break;
        case SPRAY: spray(ctx, e, k01); break;
        default:
      }
    }
    ctx.globalAlpha = 1;
  }

  return { handle, draw, timers };
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
function blip(ctx, e, k) {
  ctx.globalAlpha = fadeOut(k, 0.8);
  const size = e.color === INK ? 11 : 13;
  ctx.font = font(size);
  if (!e.w) e.w = ctx.measureText(e.text).width + 12;
  const w = e.w, h = size + 9;
  const x = Math.max(w / 2 + 4, Math.min(W * T - w / 2 - 4, e.x));
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
  if (e.text === 'WHOA!') {
    starPath(ctx, 0, 0, 22, 0);
    paint(ctx, '#ffffff', 2);
  }
  label(ctx, e.text, 0, 0, e.text === 'ooh' ? 13 : 14, e.color, INK, 3.5);
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
  const R = BUILD.sprinkler.range * T;
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
