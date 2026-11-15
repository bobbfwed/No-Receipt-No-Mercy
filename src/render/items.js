// Goods that ride on belts: Mystery Box, Gadget, Gift Set. Each is pre-rendered into a small
// sprite on resize, because a busy factory can have hundreds of them on screen.
import { C, INK, box, rr, paint, text, makeSprite } from './paint.js';

/** Sprite size in logical pixels (items are about 16 x 14 inside it). */
const SIZE = 24;

const DRAW = {
  box(g) {
    box(g, -8, -6.5, 16, 13, 2, C.cardboard, 2);
    g.fillStyle = C.cardboardLight;
    g.fillRect(-1.8, -5.5, 3.6, 11);
    g.lineWidth = 1;
    g.strokeStyle = C.cardboardDark;
    g.beginPath();
    g.moveTo(-8, -3); g.lineTo(-2, -3); g.moveTo(2, -3); g.lineTo(8, -3);
    g.stroke();
    text(g, '?', -4.6, 1.8, 8, '#5a3510', 900);
    text(g, '?', 4.6, 1.8, 8, '#5a3510', 900);
  },
  gadget(g) {
    box(g, -8, -6, 16, 12.5, 3, '#5f7fa3', 2);
    box(g, -6, -3.8, 8.5, 7, 1.5, C.screen, 1.2);
    g.beginPath();
    g.arc(5, 0, 1.8, 0, Math.PI * 2);
    paint(g, '#ff4b3a', 1);
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-4, -6); g.lineTo(-6, -9.5);
    g.stroke();
  },
  giftset(g) {
    box(g, -8, -5.5, 16, 12.5, 2, '#f472b6', 2);
    g.fillStyle = C.yellow;
    g.fillRect(-1.8, -4.5, 3.6, 10.5);
    g.fillRect(-7, -0.6, 14, 3.2);
    // Bow: two loops on top.
    g.beginPath();
    g.ellipse(-3.4, -7, 3.4, 2.2, -0.4, 0, Math.PI * 2);
    paint(g, C.yellow, 1.5);
    g.beginPath();
    g.ellipse(3.4, -7, 3.4, 2.2, 0.4, 0, Math.PI * 2);
    paint(g, C.yellow, 1.5);
    rr(g, -1.6, -8.4, 3.2, 3, 1);
    paint(g, '#e0a800', 1.2);
  },
};

/** Builds the item sprites for the current screen scale. */
export function buildItemSprites(scale) {
  const out = {};
  for (const k of Object.keys(DRAW)) out[k] = makeSprite(SIZE, scale, DRAW[k]);
  return out;
}

/** Draws an item centred at (x, y). `size` shrinks it (e.g. inside a machine). */
export function drawItem(ctx, sprites, kind, x, y, size = SIZE) {
  const s = sprites[kind];
  if (!s) return;
  ctx.drawImage(s.canvas, x - size / 2, y - size / 2, size, size);
}
