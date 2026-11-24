// Tests for the cards on screen (0.3.01), the parts that need no browser (src/ui/cardart.js): every
// card's picture exists and its words read without gaps; where each card is during the deal for a
// given state and moment (which one is large in the middle, which are in their slots); where the
// strip of slots may sit along the top of the floor; and the deal's sounds are in the effects table.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, applyCommand, step, cardsShown, revealTick, dealLength, CARDS, SHOPPERS, BUILD, TUNE, TICK_HZ } from '../src/sim/index.js';
import {
  CARD_ART, SYMBOLS, STAMPS, FLY, SLIDE, artOf, faceOf, handOf, dealView, slotsFilled, artExists, everyCardId, blockedSpans, clearLeft,
} from '../src/ui/cardart.js';
import { SOUNDS } from '../src/audio/effects.js';

test('every card has a picture that exists: a shopper, a building or a drawn symbol', () => {
  assert.deepEqual(Object.keys(CARD_ART).sort(), Object.keys(CARDS).sort(), 'one picture per card in CARDS, no more');
  for (const id of everyCardId()) {
    const a = artOf(id);
    assert.ok(artExists(a), `${id}: ${JSON.stringify(a)}`);
  }
  // A per-kind card shows the kind it picked.
  assert.deepEqual(artOf('hardy:karen'), { shopper: 'karen' });
  assert.deepEqual(artOf('slow:dad'), { shopper: 'dad' });
  for (const k of Object.keys(SYMBOLS)) assert.match(SYMBOLS[k], /^<[a-z]/, k);
  for (const a of Object.values(CARD_ART)) if (a.building) assert.ok(BUILD[a.building], a.building);
  assert.equal(artExists({ shopper: 'nobody' }), false);
  assert.equal(artExists({ symbol: 'nothing' }), false);
});

test('every card reads without gaps: stamp, name, rule, joke and bottom line, for every kind a card can pick', () => {
  for (const id of everyCardId()) {
    const f = faceOf(id);
    assert.ok(f, id);
    for (const key of ['stamp', 'mark', 'name', 'rule', 'joke', 'foot']) {
      assert.equal(typeof f[key], 'string', `${id}.${key}`);
      assert.ok(f[key].trim().length > 0, `${id}.${key} is empty`);
      assert.doesNotMatch(f[key], /undefined|NaN|null|\[object/, `${id}.${key}: ${f[key]}`);
    }
    assert.equal(f.stamp, STAMPS[CARDS[id.split(':')[0]].side]);
  }
  assert.equal(faceOf('nonsense'), null);
  // The bottom line of a per-kind card names the kind.
  assert.match(faceOf('hardy:karen').foot, /Karen/);
  // The three sides are told apart in words, not only by colour.
  assert.equal(new Set(Object.values(STAMPS)).size, 3);
});

test('no hand, no cards on screen: a game without cards, a training game', () => {
  assert.equal(dealView(createGame({ seed: 1 })), null);
  assert.equal(dealView(createGame({ seed: 1, training: true })), null);
  assert.deepEqual(handOf(createGame({ seed: 1, training: true, cards: ['litter'] })), []);
  assert.equal(slotsFilled(null), 0);
});

test('the deal on screen follows the rules\' clock: one card in the middle at a time, then up into its slot', () => {
  const s = createGame({ seed: 9, cards: true });
  addPlayer(s, 'Dave');
  assert.equal(s.phase, 'cards');
  const n = s.cards.length;
  let ticks = 0;
  while (s.phase === 'cards') {
    const v = dealView(s);
    assert.ok(v.dealing);
    const shown = v.cards.filter((c) => c.place !== 'waiting').length;
    assert.equal(shown, cardsShown(s), `tick ${ticks}: the cards on screen are the ones the rules have revealed`);
    assert.ok(v.cards.filter((c) => c.place === 'centre').length <= 1, 'never two in the middle');
    if (v.centre >= 0) {
      // The one in the middle is the newest, and every one before it has gone up.
      assert.equal(v.centre, shown - 1);
      for (const c of v.cards.slice(0, v.centre)) assert.equal(c.place, 'slot');
      const c = v.cards[v.centre];
      assert.ok(Math.abs(c.since - (ticks - revealTick(v.centre)) / TICK_HZ) < 1e-9, 'how long it has been there');
      assert.ok(c.since < TUNE.cardSecs);
    }
    // A slot fills when its card has finished sliding up, in order.
    const filled = slotsFilled(v);
    for (const c of v.cards) assert.equal(c.i < filled, c.place === 'slot' && c.since >= SLIDE, `tick ${ticks}, card ${c.i}`);
    if (v.done) assert.equal(v.centre, -1);
    step(s);
    ticks++;
  }
  assert.equal(ticks, dealLength(n));
  // After the deal: every card in its slot, for good.
  const after = dealView(s);
  assert.equal(after.dealing, false);
  assert.equal(after.done, true);
  assert.equal(slotsFilled(after), n);
  assert.deepEqual(after.cards.map((c) => c.id), s.cards);
});

test('the moments of the deal: lead-in, a card held, the slide, the closing pause', () => {
  const s = createGame({ seed: 4, cards: true });
  addPlayer(s, 'Dave');
  const at = (secs) => { s.dealT = Math.round(secs * TICK_HZ) * 60; return dealView(s); };
  let v = at(0);
  assert.equal(v.centre, -1);
  assert.ok(v.cards.every((c) => c.place === 'waiting'), 'nothing yet in the lead-in');
  v = at(TUNE.cardLead + FLY / 2);
  assert.equal(v.centre, 0, 'the first card is flying in');
  assert.ok(v.cards[0].since < FLY);
  v = at(TUNE.cardLead + TUNE.cardSecs - 0.2);
  assert.equal(v.centre, 0, 'and held still until the next one comes');
  v = at(TUNE.cardLead + TUNE.cardSecs + 0.2);
  assert.equal(v.centre, 1, 'the second flies in ...');
  assert.equal(v.cards[0].place, 'slot', '... as the first slides up');
  assert.ok(v.cards[0].since < SLIDE);
  assert.equal(slotsFilled(v), 0, 'its slot is not filled until it gets there');
  v = at(TUNE.cardLead + TUNE.cardSecs + SLIDE + 0.05);
  assert.equal(slotsFilled(v), 1);
  v = at(TUNE.cardLead + s.cards.length * TUNE.cardSecs + TUNE.cardPause / 2);
  assert.ok(v.done, 'the closing pause: all of them up');
  assert.equal(slotsFilled(v), s.cards.length);
  // The lobby shows nothing (the reveal is the point), even though the hand is already dealt.
  const l = createGame({ seed: 4, lobby: true, cards: true });
  addPlayer(l, 'A');
  assert.equal(l.cards.length, 5);
  const lv = dealView(l);
  assert.equal(lv.dealing, false);
  assert.ok(lv.cards.every((c) => c.place === 'waiting'));
  // A forced hand has no deal: straight into the slots.
  const f = createGame({ seed: 4, cards: ['litter', 'lootbox'] });
  assert.equal(slotsFilled(dealView(f)), 2);
});

test('a player who joins mid-deal sees what everyone else sees: the view is a function of the state', () => {
  const s = createGame({ seed: 12, cards: true });
  addPlayer(s, 'Dave');
  for (let i = 0; i < revealTick(2) + 40; i++) step(s);
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(dealView(copy), dealView(s));
  // Skipping ends it at once, everything in its slot.
  assert.ok(applyCommand(s, 0, { c: 'skipCards', on: true }).ok);
  step(s);
  assert.equal(s.phase, 'build');
  assert.equal(slotsFilled(dealView(s)), 5);
});

test('the strip keeps off entrances and tills along the top of the floor', () => {
  assert.equal(clearLeft([], 200, 0, 1000, 400), 400, 'nothing in the way: the middle');
  assert.equal(clearLeft([[380, 450]], 200, 0, 1000, 400), 454, 'moved along to the nearest clear place');
  assert.equal(clearLeft([[300, 420]], 200, 0, 1000, 400), 424);
  assert.equal(clearLeft([[350, 400]], 200, 0, 1000, 350), 404);
  assert.equal(clearLeft([[0, 1000]], 200, 0, 1000, 400), 400, 'nowhere clear: the middle anyway');
  assert.equal(clearLeft([[380, 900]], 200, 300, 700, 400), 400, 'not past the players list on the left');
  // A door in the top wall, seen by a camera at 30 pixels a tile on a 900 x 600 floor.
  const s = createGame({ seed: 1 });
  const top = s.doors.flat().find((t) => ((t / s.w) | 0) === 0);
  const cam = { x: s.w / 2, y: s.h / 2, zoom: 30 };
  const spans = blockedSpans(s, cam, 900, 600, 0, 60);
  if (top !== undefined) {
    const x = 450 + ((top % s.w) - cam.x) * 30;
    assert.ok(spans.some(([a, b]) => a <= x && b >= x + 30), 'the door in the top wall is blocked');
  }
  // Nothing far down the floor counts for a strip at the top.
  for (const [a, b] of blockedSpans(s, cam, 900, 600, 0, 10)) assert.ok(b > a);
  const tills = blockedSpans(s, cam, 900, 600, 0, 600).length;
  assert.ok(tills > 0, 'the tills are found');
});

test('the deal\'s sounds are in the effects table, one for each moment and side', () => {
  for (const name of ['cardDeal', 'cardIn', 'cardSlot', 'cardHand']) {
    const e = SOUNDS[name];
    assert.ok(e, name);
    assert.equal(typeof e.play, 'function');
    assert.ok(e.max > 0 && e.about.length > 20);
  }
  assert.deepEqual([...new Set(SOUNDS.cardIn.variants.map((v) => v.opts.side))].sort(), ['bad', 'good', 'odd']);
  // Every kind of shopper a per-kind card can show is drawn by the portrait code (a key of SHOPPERS).
  for (const id of everyCardId()) { const a = artOf(id); if (a.shopper && a.shopper !== 'boss') assert.ok(SHOPPERS[a.shopper], id); }
});
