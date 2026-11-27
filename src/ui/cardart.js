// The cards on screen (0.3.01), the parts that need no browser: what picture each card carries,
// the words printed on it, and where every card of the hand is during the deal. src/ui/hand.js and
// src/ui/deal.js draw them; test/cards-ui.test.js checks them in plain Node.
//
// The deal is driven by the state alone (state.phase 'cards' and its clock, dealTicks), never by a
// timer started when a message arrives, so every player sees the same card at the same moment and
// a player who joins or reloads mid-deal lands in the right place.
import { CARDS, SHOPPERS, BUILD, TICK_HZ, cardParts, revealTick, dealTicks } from '../sim/index.js';
import { cardText } from '../content/cards.js';

/** Seconds a card takes to fly in from off screen and land in the middle. */
export const FLY = 0.7;
/** Seconds a card takes to shrink and slide up into its slot (as the next one flies in). */
export const SLIDE = 0.6;

/** What each side is stamped with, so the sides differ in words as well as colour. */
export const STAMPS = { bad: 'SCREWED', good: 'LUCKY', odd: 'WEIRD' };
/** The line along the bottom of a card. */
export const SIDE_LINES = { bad: 'Bad for you', good: 'Good for you', odd: 'Good luck working it out' };
/** A one-character mark for the tiny slot cards (a minus, a plus, a tilde; no emoji). */
export const MARKS = { bad: '−', good: '+', odd: '~' };

/**
 * The picture on each card: a shopper drawn with the renderer's own code (`shopper`, a key of
 * SHOPPERS or 'boss'; `kind: true` for the four cards that pick a kind, which show the kind they
 * picked), a building's own icon (`building`, a key of BUILD, with an optional `badge` icon in the
 * corner), or a drawn symbol for the cards about money or the whole crowd (`symbol`, a key of
 * SYMBOLS below). A test checks every card in CARDS has one that exists.
 */
export const CARD_ART = {
  // ---- Bad for the players
  litter: { shopper: 'preggo', sup: true },
  doubledip: { symbol: 'receipt' },
  freerange: { shopper: 'mom' },
  offleash: { shopper: 'mom', sup: true },
  preworkout: { shopper: 'gymbro', sup: true },
  spayed: { shopper: 'dog' },
  bde: { shopper: 'boss' },
  hardy: { kind: true },
  hurry: { kind: true },
  clearance: { symbol: 'tagDown' },
  // (0.4: the shoplifters steal stock from security now: the Doorbuster, the worst of them.)
  klepto: { shopper: 'hunter', sup: true },
  shrinkflation: { symbol: 'tagUp' },
  pissing: { shopper: 'dog', sup: true },
  doorbuster: { symbol: 'crowd' },
  sensibleshoes: { building: 'wetfloor' },
  dryjanuary: { shopper: 'drinker' },
  retreat: { shopper: 'boss' },
  // ---- Good for the players
  // (0.4: these cards show the parts of The Back they are about now.)
  lootbox: { building: 'bin', badge: 'boost' },
  asseenontv: { building: 'rebrand', badge: 'boost' },
  regifting: { symbol: 'gift' },
  offatruck: { building: 'drop', badge: 'boost' },
  mallcop: { building: 'forklift', badge: 'boost' },
  pulledout: { shopper: 'preggo' },
  eyesup: { shopper: 'flasher' },
  wrongway: { shopper: 'mom' },
  slushie: { shopper: 'teen' },
  eightyproof: { building: 'samples' },
  frail: { kind: true },
  slow: { kind: true },
  warranty: { building: 'salesman' },
  supportdog: { shopper: 'blind' },
  staffdiscount: { symbol: 'tagDown' },
  overtime: { symbol: 'coins' },
  mopmike: { building: 'wetfloor' },
  restocking: { symbol: 'coins' },
  firecode: { building: 'sprinkler' },
  happyhour: { shopper: 'drinker', sup: true },
  // ---- Neither
  convention: { shopper: 'cosplay' },
  bulkbuy: { symbol: 'crowd' },
  flashmob: { symbol: 'crowd' },
  // A craft distillery, hand-rubbed: the Spite Still (0.4).
  artisanal: { building: 'still' },
  premature: { building: 'railgun' },
  fathersday: { shopper: 'dad' },
  payday: { symbol: 'coins' },
  mallwalkers: { shopper: 'hunter' },
  openbar: { shopper: 'drinker' },
  rentacop: { building: 'forklift', badge: 'tagDown' },
  // Cheap labour in The Back: the Unpaid Intern with a price tag going down (0.4).
  sweatshop: { building: 'intern', badge: 'tagDown' },
};

const S = 'stroke="#111" stroke-width="2"';
/**
 * The drawn symbols (inline SVG, viewBox 0 0 40 40, static markup). No image files, no emoji.
 */
export const SYMBOLS = {
  // Two green chevrons going up: more for less (the offatruck and mallcop cards; it was the Upgrade
  // tool's icon until bought upgrades went in 0.4).
  boost: `<circle cx="20" cy="20" r="15" fill="#16a34a" ${S}/>
    <path d="M12 21l8-9 8 9M12 29l8-9 8 9" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  coins: `<ellipse cx="14" cy="31" rx="10" ry="4" fill="#ca8a04" ${S}/><rect x="4" y="25" width="20" height="6" fill="#facc15"/>
    <path d="M4 25v6M24 25v6" ${S}/><ellipse cx="14" cy="25" rx="10" ry="4" fill="#fde047" ${S}/>
    <ellipse cx="26" cy="21" rx="10" ry="4" fill="#ca8a04" ${S}/><rect x="16" y="13" width="20" height="8" fill="#facc15"/>
    <path d="M16 13v8M36 13v8" ${S}/><ellipse cx="26" cy="13" rx="10" ry="4" fill="#fde047" ${S}/>
    <text x="26" y="16" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="7" font-weight="900" fill="#78350f">$</text>`,
  tagUp: `<path d="M4 18L18 4h16v16L20 34z" fill="#fca5a5" ${S} stroke-linejoin="round"/><circle cx="28" cy="10" r="2.6" fill="#fff" ${S}/>
    <path d="M17 27V15M12 19.5l5-5 5 5" fill="none" stroke="#b91c1c" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  tagDown: `<path d="M4 18L18 4h16v16L20 34z" fill="#86efac" ${S} stroke-linejoin="round"/><circle cx="28" cy="10" r="2.6" fill="#fff" ${S}/>
    <path d="M17 14v12M12 21.5l5 5 5-5" fill="none" stroke="#15803d" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  crowd: `<circle cx="9" cy="14" r="4.5" fill="#f2c9a0" ${S}/><path d="M2 32q0-12 7-12t7 12z" fill="#2563eb" ${S}/>
    <circle cx="31" cy="14" r="4.5" fill="#c68642" ${S}/><path d="M24 32q0-12 7-12t7 12z" fill="#16a34a" ${S}/>
    <circle cx="20" cy="17" r="5" fill="#e0ac69" ${S}/><path d="M12 37q0-13 8-13t8 13z" fill="#dc2626" ${S}/>`,
  receipt: `<path d="M9 3h22v32l-3.7-2.5-3.7 2.5-3.6-2.5-3.7 2.5-3.6-2.5L9 35z" fill="#fff" ${S} stroke-linejoin="round"/>
    <path d="M13 10h14M13 15h10M13 20h14" stroke="#6b7280" stroke-width="2"/>
    <text x="20" y="30" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="8" font-weight="900" fill="#b91c1c">x2</text>`,
  gift: `<rect x="5" y="16" width="30" height="20" rx="1.5" fill="#c084fc" ${S}/><rect x="3" y="11" width="34" height="7" rx="1.5" fill="#a855f7" ${S}/>
    <path d="M20 11v25" stroke="#facc15" stroke-width="4"/><path d="M20 11q-11-9-11-1t11 1q11-9 11-1t-11 1" fill="#fde047" ${S}/>`,
};

/** The game's hand, or none (no cards, a training game). */
export const handOf = (state) => (state && !state.training && Array.isArray(state.cards) ? state.cards : []);

/**
 * The picture for one card id in a hand ('litter', 'hardy:karen').
 * @returns {{shopper?: string, sup?: boolean, building?: string, badge?: string, symbol?: string}}
 */
export function artOf(id) {
  const [card, kind] = cardParts(id);
  const a = Object.hasOwn(CARD_ART, card) ? CARD_ART[card] : null;
  if (!a) return { symbol: 'crowd' };
  if (a.kind) return SHOPPERS[kind] ? { shopper: kind } : { symbol: 'crowd' };
  return a;
}

/**
 * Everything printed on a card, as plain strings: its stamp, name, rule, joke and the line along
 * the bottom. A per-kind card's bottom line also names the kind. null for an id that is not a card.
 */
export function faceOf(id) {
  const t = cardText(id);
  if (!t) return null;
  const kindName = t.kind && SHOPPERS[t.kind] ? SHOPPERS[t.kind].name : '';
  return {
    id: t.id, side: t.side, stamp: STAMPS[t.side], mark: MARKS[t.side], name: t.name, rule: t.rule, joke: t.joke,
    foot: kindName ? `${SIDE_LINES[t.side]} · ${kindName}` : SIDE_LINES[t.side],
  };
}

/**
 * Where every card of the hand is, from the state alone.
 *   dealing   true while the deal is on (phase 'cards')
 *   secs      seconds into the deal (at normal speed; game speed does not shorten it)
 *   cards     one per card, in the order dealt: { id, i, place, since } where place is
 *             'waiting' (not dealt yet), 'centre' (large in the middle: from its reveal until the
 *             next card's, so it flies in for FLY seconds and then holds still) or 'slot' (gone
 *             up to its slot: the first SLIDE seconds of it are the slide), and `since` is the
 *             seconds it has been there
 *   centre    the card in the middle, or -1
 *   done      every card is in its slot (the short pause at the end of the deal, or after it)
 * In the lobby nothing is dealt yet; after the deal (and in a game whose hand was forced, which
 * has no deal) every card is in its slot. null in a game without cards.
 */
export function dealView(state) {
  const hand = handOf(state);
  if (!hand.length) return null;
  if (state.phase === 'lobby') {
    return { dealing: false, secs: 0, centre: -1, done: false, cards: hand.map((id, i) => ({ id, i, place: 'waiting', since: 0 })) };
  }
  if (state.phase !== 'cards') {
    return { dealing: false, secs: 0, centre: -1, done: true, cards: hand.map((id, i) => ({ id, i, place: 'slot', since: Infinity })) };
  }
  const secs = dealTicks(state) / TICK_HZ;
  let centre = -1;
  const cards = hand.map((id, i) => {
    const at = revealTick(i) / TICK_HZ, out = revealTick(i + 1) / TICK_HZ;
    if (secs < at) return { id, i, place: 'waiting', since: 0 };
    if (secs < out) { centre = i; return { id, i, place: 'centre', since: secs - at }; }
    return { id, i, place: 'slot', since: secs - out };
  });
  return { dealing: true, secs, centre, done: cards.every((c) => c.place === 'slot'), cards };
}

/** How many slots show their card: those whose card has finished sliding up (they fill in order). */
export function slotsFilled(view) {
  if (!view) return 0;
  let n = 0;
  for (const c of view.cards) if (c.place === 'slot' && c.since >= SLIDE) n++;
  return n;
}

/**
 * The stretches along the top of the floor where the strip of slots must not go: the entrances and
 * the tills (with a tile to spare round each) that are on screen in the band of rows the strip
 * covers. Positions are CSS pixels from the floor's top left; `cam` is the renderer's camera
 * ({x, y, zoom}: the tile at the middle of the floor, pixels a tile), `w` and `h` the floor's size,
 * `top` and `bottom` the band.
 * @returns {number[][]} [left, right] pairs
 */
export function blockedSpans(state, cam, w, h, top, bottom) {
  return blockedRects(state, cam, w, h, top, bottom).map(([x0, , x1]) => [x0, x1]);
}

/**
 * The same as blockedSpans, as boxes: [left, top, right, bottom] in CSS pixels from the floor's top
 * left, for the entrances and tills (a tile to spare round each) on screen between rows `top` and
 * `bottom`. `doors` says which entrances count (all of them unless given).
 * @returns {number[][]}
 */
export function blockedRects(state, cam, w, h, top = 0, bottom = h, doors = state.doors || []) {
  const rects = [];
  const z = cam.zoom || 30;
  const add = (t) => {
    const x = t % state.w, y = (t / state.w) | 0;
    const y0 = h / 2 + (y - 1 - cam.y) * z, y1 = h / 2 + (y + 2 - cam.y) * z;
    if (y1 < top || y0 > bottom) return;
    const x0 = w / 2 + (x - 1 - cam.x) * z, x1 = w / 2 + (x + 2 - cam.x) * z;
    if (x1 < 0 || x0 > w) return;
    rects.push([x0, y0, x1, y1]);
  };
  for (const door of doors) for (const t of door) add(t);
  const tiles = state.tiles || '';
  // Only the rows that can be on screen in the band.
  const r0 = Math.max(0, Math.floor(cam.y + (top - h / 2) / z) - 2), r1 = Math.min(state.h - 1, Math.ceil(cam.y + (bottom - h / 2) / z) + 2);
  for (let y = r0; y <= r1; y++) for (let x = 0; x < state.w; x++) if (tiles[y * state.w + x] === 'T') add(y * state.w + x);
  return rects;
}

/**
 * Where the strip of cards goes on a big screen (0.3.02, the owner: "by/below the ON SHIFT
 * window"): under the players panel, lined up with its left edge, so the two read as one column.
 * When that would cover an entrance, a till or anything else in `rects`, or run off the floor, it
 * goes beside the panel instead: to its right, top-aligned; then lower down in that place (under
 * the boss bar, say); then along to the right to the nearest clear place.
 * (Not used by the game since 0.4, stage 5a: the owner wants the strip and EVENT PAY always below,
 * and each panel folds instead; game.js no longer places them. Kept, with its test, in case a
 * panel ever needs to step aside again.)
 * @param {{x: number, y: number, w: number, h: number}|null} panel the players panel (CSS pixels
 *   from the floor's top left), or null when it is not shown
 * @param {{w: number, h: number}} size the strip
 * @param {{w: number, h: number}} area the floor
 * @param {number[][]} rects what it must not cover: [left, top, right, bottom]
 * @param {number} [gap] pixels between the panel and the strip, and from the floor's edges
 * @returns {{x: number, y: number, below: boolean}}
 */
export function sidePlace(panel, size, area, rects, gap = 8) {
  const { w, h } = size;
  const hits = (x, y) => rects.filter(([a, b, c, d]) => x < c && x + w > a && y < d && y + h > b);
  const fits = (x, y) => x >= gap - 0.5 && y >= gap - 0.5 && x + w <= area.w - gap + 0.5 && y + h <= area.h - gap + 0.5;
  const clear = (x, y) => fits(x, y) && !hits(x, y).length;
  if (!panel) {
    for (const y of [gap, ...rects.map((r) => r[3] + gap).sort((a, b) => a - b)]) if (clear(gap, y)) return { x: gap, y, below: true };
    return { x: gap, y: gap, below: true };
  }
  const under = { x: panel.x, y: panel.y + panel.h + gap, below: true };
  if (clear(under.x, under.y)) return under;
  const x0 = panel.x + panel.w + gap, y0 = panel.y;
  if (clear(x0, y0)) return { x: x0, y: y0, below: false };
  // Lower down beside the panel, just under whatever was in the way.
  for (const y of rects.filter(([a, , c]) => x0 < c && x0 + w > a).map((r) => r[3] + gap).filter((y) => y > y0).sort((a, b) => a - b)) {
    if (clear(x0, y)) return { x: x0, y, below: false };
  }
  // Along the top, to the right.
  for (const x of rects.filter(([, b, , d]) => y0 < d && y0 + h > b).map((r) => r[2] + gap).filter((x) => x > x0).sort((a, b) => a - b)) {
    if (clear(x, y0)) return { x, y: y0, below: false };
  }
  return { x: x0, y: y0, below: false };
}

/**
 * (How the strip was placed along the top of the floor before it moved beside the players panel;
 * the game screen no longer uses it, but it is kept with its test for a strip along the top.)
 * Where to put the strip's left edge: `want` (the middle) if that covers none of the spans, or else
 * the clear place nearest to it between `min` and `max`; `want` again if there is no clear place.
 */
export function clearLeft(spans, width, min, max, want) {
  const clear = (x) => x >= min - 0.5 && x <= max + 0.5 && spans.every(([a, b]) => x + width <= a || x >= b);
  if (clear(want)) return want;
  let best = null;
  for (const [a, b] of spans) {
    for (const x of [b + 4, a - width - 4]) if (clear(x) && (best === null || Math.abs(x - want) < Math.abs(best - want))) best = x;
  }
  return best ?? want;
}

/** True if the art for this card exists: a shopper the portrait code draws, a building, a symbol. */
export function artExists(a) {
  if (a.shopper) return a.shopper === 'boss' || Object.hasOwn(SHOPPERS, a.shopper);
  if (a.building) return Object.hasOwn(BUILD, a.building) && (!a.badge || Object.hasOwn(SYMBOLS, a.badge) || a.badge === 'remove');
  return Object.hasOwn(SYMBOLS, a.symbol);
}

/** Every card id a hand can hold: each card, and each per-kind card with each kind (for the tests). */
export function everyCardId() {
  const out = [];
  for (const [id, c] of Object.entries(CARDS)) {
    if (c.per === 'kind') for (const k of Object.keys(SHOPPERS)) out.push(`${id}:${k}`);
    else out.push(id);
  }
  return out;
}
