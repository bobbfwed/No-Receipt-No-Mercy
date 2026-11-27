// Tests for the cards (0.3.01): the deal (two bad, two good, one odd, in that order; pairs never
// dealt together; per-kind picks; the same seed, the same hand; a forced hand), the deal as a phase
// of the game (its timing, its events, nothing built during it, skipping, a player dropping out,
// game speed, then the build phase exactly as from the lobby), a copy made mid-deal, and one test
// for every card whose rule exists showing its number move by what the card says. The words on the
// cards are checked at the end.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, step, canPlace, setPlayerOnline, waveSpec, statsOf, spentOn,
  rebuildDeal, buildPrice, dropTicks, itemCode, unitsIn, usesPer, addStock, takesSupply, stockCap, makeTicks, rebrandTicks, eventPay, give, stepBack, BACK, STOCK_TRACKS, DIRS, dealCards, cleanHand, hasCard, cardKind, cardKinds, cardParts, cardsShown,
  revealTick, dealLength, idShare, smashReady, patienceFor, bossPatience, CARDS, DEALABLE, CARDS_APART,
  CARD_SKIP_KINDS, DEAL_ORDER, SHOPPERS, SUPERS, BUILD, SHOP_KINDS, BOSS, BABY, TUNE, TICK_HZ, ST, cleanSettings, cardsOn,
} from '../src/sim/index.js';
import { cardSlip, cardFall, cardGrabChance, cardGrabHeal, cardShield, cardPicks } from '../src/sim/cards.js';
import { HostSession } from '../src/net/session.js';
import { cardText, cardName, CARD_WORDS, PLURALS, cardsNote } from '../src/content/cards.js';
import { NOPE } from '../src/content/lines.js';

const secs = (x) => Math.max(1, Math.round(x * TICK_HZ));

/** A game with these cards (a list forces them, true deals), one rich player, no losing. */
function game(cards = null, seed = 5, more = {}) {
  const s = createGame({ seed, cards, ...more });
  addPlayer(s, 'Dave');
  for (const p of s.players) p.cash = 1e6;
  s.refundLimit = 1e9;
  return s;
}
/** Opens the doors on sales event n (the one before taken as played), with nobody coming. */
function openEmpty(s, n = 1) {
  s.wave = n - 1;
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  s.spawnQ = [];
}
/** A shopper of kind k standing at (x, y), with patience to spare. */
function walker(s, k, x, y, more = {}) {
  const sh = { id: s.nextId++, k, x, y, vx: 0, vy: 0, hp: 1e5, mhp: 1e5, st: ST.WALK, t: 0, cd: 0, ox: 0, oy: 0, lt: -1, ...more };
  s.shoppers.push(sh);
  return sh;
}
/** Steps until `until` (or the time runs out); returns every event. */
function run(s, seconds, until = () => false) {
  const all = [];
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    all.push(...step(s));
    if (until()) break;
  }
  return all;
}
/** The patience a shopper of kind k (super if sup) walks in with on sales event n. */
function arrival(s, k, sup = 0, n = 6) {
  openEmpty(s, n);
  s.spawnQ = [[s.tick + 1, k, sup, -1]];
  step(s);
  return s.shoppers[s.shoppers.length - 1];
}
/** Temporarily changes tuning numbers for one test. */
function tune(t, changes, obj = TUNE) {
  const old = {};
  for (const k of Object.keys(changes)) { old[k] = obj[k]; obj[k] = changes[k]; }
  t.after(() => Object.assign(obj, old));
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

// ---- The deal ------------------------------------------------------------------------------------

test('a deal is two bad, two good and one odd, in the order bad, good, bad, good, odd, never a pair kept apart', () => {
  const seen = new Set(), kinds = new Set();
  for (let seed = 1; seed <= 4000; seed++) {
    const hand = dealCards({ rng: seed });
    assert.equal(hand.length, 5, `seed ${seed}`);
    assert.deepEqual(hand.map((id) => CARDS[cardParts(id)[0]].side), DEAL_ORDER, `seed ${seed}: ${hand}`);
    assert.equal(new Set(hand.map((id) => cardParts(id)[0])).size, 5, `no card twice: ${hand}`);
    for (const id of hand) {
      const [card, kind] = cardParts(id);
      assert.ok(DEALABLE.includes(card), `${card} can be dealt`);
      seen.add(card);
      if (CARDS[card].per === 'kind') {
        assert.ok(SHOPPERS[kind] && !CARD_SKIP_KINDS.includes(kind), `${id} picks a kind it may`);
        kinds.add(kind);
      } else assert.equal(kind, null, id);
    }
    for (const [a, b] of CARDS_APART) {
      const has = (c) => hand.filter((id) => cardParts(id)[0] === c).map((id) => cardParts(id)[1]);
      for (const ka of has(a)) for (const kb of has(b)) {
        assert.ok(CARDS[a].per === 'kind' && ka !== kb, `seed ${seed}: ${a} with ${b} (${hand})`);
      }
    }
  }
  // Every card that can be dealt turns up, and every kind a per-kind card may pick.
  assert.deepEqual([...seen].sort(), [...DEALABLE].sort());
  assert.deepEqual([...kinds].sort(), cardKinds().sort());
  assert.ok(!cardKinds().includes('flasher') && !cardKinds().includes('trader'));
});

test('the same seed deals the same hand; a game made with cards: true is dealt at once', () => {
  const a = createGame({ seed: 77, cards: true }), b = createGame({ seed: 77, cards: true });
  assert.deepEqual(a.cards, b.cards);
  assert.equal(a.cards.length, 5);
  assert.equal(a.phase, 'cards');
  assert.equal(a.dealT, 0);
  assert.notDeepEqual(createGame({ seed: 78, cards: true }).cards, a.cards);
  // In the lobby: dealt already, shown when everyone is ready.
  const l = createGame({ seed: 77, cards: true, lobby: true });
  assert.deepEqual(l.cards, a.cards);
  assert.equal(l.phase, 'lobby');
  assert.equal(cardsShown(l), 0);
});

test('a forced hand keeps its order, drops anything that is not a card, and has no deal', () => {
  const s = createGame({ cards: ['payday', 'litter', 'nonsense', 'hardy', 'hardy:karen', 'hardy:flasher', 'litter:dad', 'litter', 'eyesup', 42] });
  assert.deepEqual(s.cards, ['payday', 'litter', 'hardy:karen', 'eyesup']);
  assert.equal(s.dealT, undefined);
  assert.equal(s.phase, 'build');
  assert.equal(cardsShown(s), 4);
  assert.deepEqual(cleanHand(['bde', 'bde']), ['bde']);
  assert.deepEqual(cleanHand('litter'), []);
  // An empty or junk hand is no hand at all, and left out of the state.
  assert.equal('cards' in createGame({ cards: ['junk'] }), false);
  assert.equal('cards' in createGame({ cards: [] }), false);
  assert.equal(hasCard(s, 'hardy'), true);
  assert.equal(hasCard(s, 'hardy:karen'), true);
  assert.equal(hasCard(s, 'hardy:dad'), false);
  assert.equal(cardKind(s, 'hardy'), 'karen');
  assert.equal(cardKind(s, 'frail'), null);
});

test('a game without cards has neither field, and a training game never has cards', () => {
  for (const s of [createGame(), createGame({ lobby: true }), createGame({ cards: false })]) {
    assert.equal('cards' in s, false);
    assert.equal('dealT' in s, false);
    assert.equal(cardsShown(s), 0);
    assert.equal(hasCard(s, 'litter'), false);
  }
  const t = createGame({ training: true, cards: true });
  assert.equal('cards' in t, false);
  assert.equal(t.phase, 'build');
  const f = createGame({ training: true, cards: ['litter'] });
  assert.equal('cards' in f, false);
  // And if one got there somehow, a training game would not use it.
  const g = createGame({ training: true });
  g.cards = ['litter'];
  assert.equal(hasCard(g, 'litter'), false);
});

// ---- The deal as a phase -------------------------------------------------------------------------

test('the deal: a lead-in, a card every TUNE.cardSecs, a pause, then the first build phase and begun', () => {
  const s = game(true, 9);
  assert.equal(s.phase, 'cards');
  const at = [];
  let n = 0;
  while (s.phase === 'cards' && n < 5000) {
    n++;
    for (const e of step(s)) at.push([n, e]);
    if (s.phase === 'cards') assert.equal(cardsShown(s), at.filter(([, e]) => e.e === 'card').length);
  }
  assert.deepEqual(at[0], [1, { e: 'deal', n: 5 }]);
  const cards = at.filter(([, e]) => e.e === 'card');
  assert.deepEqual(cards.map(([t]) => t), [0, 1, 2, 3, 4].map(revealTick));
  assert.deepEqual(cards.map(([, e]) => e), s.cards.map((id, i) => ({ e: 'card', i, id })));
  assert.deepEqual(at[at.length - 1], [dealLength(5), { e: 'begun' }]);
  assert.equal(revealTick(0), secs(TUNE.cardLead));
  assert.equal(revealTick(1) - revealTick(0), secs(TUNE.cardSecs));
  assert.equal(dealLength(5), secs(TUNE.cardLead + 5 * TUNE.cardSecs + TUNE.cardPause));
  // Then exactly the first build phase of a game from the lobby: untimed until something is built.
  assert.equal(s.phase, 'build');
  assert.equal(s.phaseT, -1);
  assert.equal('dealT' in s, false);
  assert.equal(cardsShown(s), 5);
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'crate', x: 5, y: 5 }).ok);
  assert.ok(s.phaseT > 0, 'the clock starts on the first build');
});

test('nothing can be built or started during the deal; skipping, speed and role can be set', () => {
  const s = game(true);
  step(s);
  assert.equal(canPlace(s, 'crate', 5, 5, 0), 'cards');
  for (const cmd of [{ c: 'place', k: 'crate', x: 5, y: 5 }, { c: 'start' }, { c: 'rebuild' },
    { c: 'side', side: 'office' }, { c: 'give', to: 0, n: 1 }, { c: 'remove', x: 5, y: 5 }, { c: 'ready', on: true }]) {
    assert.deepEqual(applyCommand(s, 0, cmd), { ok: false, why: 'cards' }, cmd.c);
  }
  assert.ok(applyCommand(s, 0, { c: 'speed', n: 2 }).ok);
  assert.ok(applyCommand(s, 0, { c: 'role', role: 'Floater' }).ok);
  // (Auto-rebuild's switch was allowed here until 0.3.04; there is no such command now.)
  assert.deepEqual(applyCommand(s, 0, { c: 'autoRebuild', on: true }), { ok: false, why: 'cards' });
  assert.ok(applyCommand(s, 0, { c: 'skipCards', on: false }).ok);
  assert.equal(s.players[0].skip, false);
  // Outside the deal there is nothing to skip.
  const b = game();
  assert.deepEqual(applyCommand(b, 0, { c: 'skipCards' }), { ok: false, why: 'phase' });
  const l = createGame({ lobby: true, cards: true });
  addPlayer(l, 'A');
  assert.deepEqual(applyCommand(l, 0, { c: 'skipCards' }), { ok: false, why: 'lobby' });
  assert.ok(NOPE.cards.length >= 3, 'DEB has something to say when a build is refused');
});

test('from the lobby, a game with cards goes to the deal when everyone is ready, then to building', () => {
  const s = createGame({ seed: 3, lobby: true, cards: true, map: { design: 'warehouse', size: 's' } });
  addPlayer(s, 'A'); addPlayer(s, 'B');
  for (let i = 0; i < 20; i++) assert.deepEqual(step(s), []);
  assert.equal(s.tick, 0);
  applyCommand(s, 0, { c: 'ready', on: true });
  applyCommand(s, 1, { c: 'ready', on: true });
  assert.deepEqual(step(s), [], 'no begun yet: the deal comes first');
  assert.equal(s.phase, 'cards');
  assert.equal(cardsShown(s), 0);
  assert.deepEqual(step(s), [{ e: 'deal', n: 5 }]);
  const ev = run(s, 60, () => s.phase !== 'cards');
  assert.equal(ev.filter((e) => e.e === 'card').length, 5);
  assert.deepEqual(ev[ev.length - 1], { e: 'begun' });
  assert.equal(s.phase, 'build');
});

test('skipping: once every connected store player has asked, the rest come at once, then building', () => {
  const s = game(true);
  addPlayer(s, 'Bob');
  run(s, TUNE.cardLead + TUNE.cardSecs + 0.1);
  assert.equal(cardsShown(s), 2);
  applyCommand(s, 0, { c: 'skipCards', on: true });
  run(s, 1);
  assert.equal(s.phase, 'cards', 'one of two is not enough');
  applyCommand(s, 0, { c: 'skipCards' });
  applyCommand(s, 1, { c: 'skipCards', on: true });
  const ev = step(s);
  assert.deepEqual(ev.map((e) => e.e), ['card', 'card', 'card', 'begun']);
  assert.deepEqual(ev.filter((e) => e.e === 'card').map((e) => e.i), [2, 3, 4]);
  assert.equal(s.phase, 'build');
  assert.ok(s.players.every((p) => !('skip' in p)), 'the wish is forgotten');
  // Skipped before the first card: every card event still comes, after 'deal'.
  const t = game(true);
  applyCommand(t, 0, { c: 'skipCards' });
  assert.deepEqual(step(t).map((e) => e.e), ['deal', 'card', 'card', 'card', 'card', 'card', 'begun']);
});

test('a player who drops out mid-deal cannot hold the skip up, and the deal ends on time without anyone', () => {
  const s = game(true);
  addPlayer(s, 'Bob');
  applyCommand(s, 0, { c: 'skipCards' });
  run(s, 1);
  assert.equal(s.phase, 'cards');
  setPlayerOnline(s, 1, false);
  step(s);
  assert.equal(s.phase, 'build', 'the one still here was enough');
  // Nobody asks, everybody leaves: the clock still runs out.
  const t = game(true);
  setPlayerOnline(t, 0, false);
  let n = 0;
  while (t.phase === 'cards' && n < 5000) { step(t); n++; }
  assert.equal(n, dealLength(5));
  // A player who joins mid-deal sees the same card as everyone, and has to agree to a skip too.
  const u = game(true);
  run(u, TUNE.cardLead + 0.1);
  const late = addPlayer(u, 'Late');
  assert.equal(cardsShown(u), 1);
  applyCommand(u, 0, { c: 'skipCards' });
  step(u);
  assert.equal(u.phase, 'cards');
  applyCommand(u, late, { c: 'skipCards' });
  step(u);
  assert.equal(u.phase, 'build');
});

test('game speed does not shorten the deal', () => {
  for (const speed of [2, 3, 5]) {
    const s = game(true);
    assert.ok(applyCommand(s, 0, { c: 'speed', n: speed }).ok);
    const cards = [];
    let n = 0;
    while (s.phase === 'cards' && n < 10000) {
      n++;
      for (const e of step(s)) if (e.e === 'card') cards.push(n);
    }
    assert.equal(n, dealLength(5) * speed, `x${speed}`);
    assert.deepEqual(cards, [0, 1, 2, 3, 4].map((i) => revealTick(i) * speed), `x${speed}`);
  }
});

test('a copy of the game made mid-deal plays on identically', () => {
  const s = game(true, 21);
  run(s, 7);
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(copy, s);
  // (Played on to a little past the end of the deal, however long TUNE makes it.)
  const rest = dealLength(5) / TICK_HZ - 7 + 1;
  const a = run(s, rest), b = run(copy, rest);
  assert.deepEqual(b, a);
  assert.deepEqual(copy, s);
  assert.equal(s.phase, 'build');
});

test('sessions: a host can make a game with cards, and Back to the lobby deals a fresh hand', () => {
  const host = new HostSession({ name: 'Dave', seed: 4, cards: true, lobby: true, map: { design: 'warehouse', size: 's' } });
  assert.equal(host.state.cards.length, 5);
  assert.equal(host.state.phase, 'lobby');
  host.send({ c: 'ready', on: true });
  host.fastForward(3);
  assert.equal(host.state.phase, 'cards');
  host.fastForward(dealLength(5) + 5);
  assert.equal(host.state.phase, 'build');
  host.state.phase = 'lost';
  assert.ok(host.backToLobby({ seed: 99 }));
  assert.equal(host.state.cards.length, 5, 'a game with cards goes round again with cards');
  assert.equal(host.state.dealT, 0);
  const none = new HostSession({ name: 'Dave', seed: 4, lobby: true, map: { design: 'warehouse', size: 's' } });
  assert.equal('cards' in none.state, false);
  none.state.phase = 'won';
  none.backToLobby({ seed: 9 });
  assert.equal('cards' in none.state, false);
  none.state.phase = 'won';
  none.backToLobby({ seed: 9, cards: true });
  assert.equal(none.state.cards.length, 5);
});

// ---- Picked by id --------------------------------------------------------------------------------

test('a share by id picks about that share, differently for each card, and needs no field', () => {
  for (const [card, share] of [['doubledip', 1 / 3], ['preworkout', 0.4]]) {
    let n = 0;
    for (let id = 1; id <= 3000; id++) if (idShare(id, card) < share) n++;
    assert.ok(Math.abs(n / 3000 - share) < 0.02, `${card}: ${n / 3000}`);
  }
  let same = 0;
  for (let id = 1; id <= 1000; id++) if ((idShare(id, 'doubledip') < 0.4) === (idShare(id, 'preworkout') < 0.4)) same++;
  assert.ok(same < 900, 'not the same shoppers for every card');
});

test('a share by id picks different shoppers in games with different seeds, and still about that share', () => {
  // Ids come out in the same order every game, so the pick has to turn with the seed or a card
  // would land on the same shoppers every time it was dealt.
  const picks = (seed) => [...Array(300).keys()].map((i) => idShare(i + 1, 'doubledip', seed) < 1 / 3);
  const seen = new Set();
  for (const seed of [1, 2, 3, 77, 1234, 987654321, 0x7fffffff]) {
    const p = picks(seed);
    const n = p.filter(Boolean).length;
    assert.ok(Math.abs(n / 300 - 1 / 3) < 0.03, `seed ${seed}: ${n / 300}`);
    seen.add(p.join());
    assert.deepEqual(picks(seed), p, 'the same seed picks the same shoppers');
  }
  assert.equal(seen.size, 7, 'each seed its own pick');
  // The rules ask with the game's seed: two games, same shopper id, different answers somewhere.
  const a = game(['doubledip'], 11), b = game(['doubledip'], 12);
  const differs = [...Array(60).keys()].some((i) => cardPicks(a, 'doubledip', { id: i + 1 }) !== cardPicks(b, 'doubledip', { id: i + 1 }));
  assert.ok(differs);
});

// ---- The simple cards ----------------------------------------------------------------------------

/** How many babies a Pregnant Lady (an Octomom if sup) pops, worn out by a sprinkler. */
function popCount(cards, sup = 0) {
  const s = game(cards);
  openEmpty(s, 9);
  applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 10, y: 8 });
  walker(s, 'preggo', 11.5, 8.5, { hp: 0.01, mhp: 100, ...(sup ? { sup: 1 } : {}) });
  const ev = run(s, 2, () => !!s.shoppers.find((x) => x.k === 'baby'));
  const pop = ev.find((e) => e.e === 'pop');
  assert.equal(s.shoppers.filter((x) => x.k === 'baby').length, pop.n);
  return pop.n;
}

test('litter and pulledout: twice and half as many babies, for the Octomom too', () => {
  assert.equal(popCount(null), SHOPPERS.preggo.pops);
  assert.equal(popCount(['litter']), SHOPPERS.preggo.pops * CARDS.litter.pops);
  assert.equal(popCount(['litter'], 1), SUPERS.preggo.pops * CARDS.litter.pops);
  assert.equal(popCount(['pulledout']), SHOPPERS.preggo.pops * CARDS.pulledout.pops);
  assert.equal(popCount(['pulledout'], 1), SUPERS.preggo.pops * CARDS.pulledout.pops);
});

/** The refund a shopper of kind k with this id takes at a till (event's refund). */
function refundOf(cards, k, id, more = {}) {
  const s = game(cards);
  openEmpty(s, 6);
  const sh = walker(s, k, 29.5, 6.5, more);
  sh.id = id;
  const e = run(s, 1).find((x) => x.e === 'escape');
  return e.refund;
}

test('doubledip: the shoppers it picks by id take twice the cash, still as one refund; not the boss or babies', () => {
  const ids = [...Array(60).keys()].map((i) => i + 100);
  const picked = ids.find((id) => idShare(id, 'doubledip', 5) < CARDS.doubledip.share);
  const spared = ids.find((id) => idShare(id, 'doubledip', 5) >= CARDS.doubledip.share);
  assert.equal(refundOf(['doubledip'], 'hunter', picked), refundOf(null, 'hunter', picked) * CARDS.doubledip.cash);
  assert.equal(refundOf(['doubledip'], 'hunter', spared), refundOf(null, 'hunter', spared));
  assert.equal(refundOf(['doubledip'], 'baby', picked), BABY.refund);
  assert.equal(refundOf(['doubledip'], 'boss', picked, { tr: 1, pp: 1e5 }), BOSS.refund);
  const s = game(['doubledip']);
  openEmpty(s, 6);
  walker(s, 'hunter', 29.5, 6.5).id = picked;
  assert.equal(run(s, 1).find((e) => e.e === 'escape').n, 1);
  assert.equal(s.refunds, 1);
});

/** What the end of sales event n pays (the waveEnd event) in a game with these cards, nobody having come in. */
function endOf(cards, n, more = {}) {
  const s = game(cards, 5, more);
  openEmpty(s, n);
  return step(s).find((e) => e.e === 'waveEnd');
}

test('payday: every sales event pays 20% more, its speed bonus too, and every refund costs 60% more (whole dollars)', () => {
  for (const k of ['hunter', 'teen', 'dad']) {
    assert.equal(refundOf(['payday'], k, 7), Math.round(refundOf(null, k, 7) * CARDS.payday.refund), k);
  }
  assert.equal(refundOf(['payday'], 'baby', 7), Math.round(BABY.refund * CARDS.payday.refund));
  for (const n of [1, 4, 10]) {
    const e = endOf(['payday'], n), plain = endOf(null, n);
    assert.equal(e.pay, Math.round((TUNE.payBase + TUNE.payStep * n) * CARDS.payday.pay), `event ${n}`);
    assert.equal(plain.pay, TUNE.payBase + TUNE.payStep * n);
    assert.equal(e.speed, Math.round(e.pay * TUNE.speedShare), 'the bonus is worked out from the card\'s pay');
  }
});

test('clearance and overtime: the event pay, and the speed bonus from it; with payday they multiply', () => {
  for (const [cards, m] of [[null, 1], [['clearance'], CARDS.clearance.pay], [['overtime'], CARDS.overtime.pay],
    [['overtime', 'clearance', 'payday'], CARDS.overtime.pay * CARDS.clearance.pay * CARDS.payday.pay]]) {
    for (const n of [1, 7]) {
      const e = endOf(cards, n);
      const pay = Math.round((TUNE.payBase + TUNE.payStep * n) * m);
      assert.equal(e.pay, pay, `${cards} event ${n}`);
      assert.equal(e.speed, Math.round(pay * TUNE.speedShare), `${cards} event ${n}`);
      assert.equal(eventPay(game(cards), n), pay);
    }
  }
  // On top of the difficulty's pay.
  const hard = endOf(['overtime'], 3, { settings: { difficulty: 'hard' } });
  assert.equal(hard.pay, Math.round((TUNE.payBase + TUNE.payStep * 3) * 0.85 * CARDS.overtime.pay));
});

/** A game with these cards and a Back belt (1, 2) east into a Clearance Bin (2, 2), owned by Dave. */
function binGame(cards) {
  const s = game(cards);
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'conv', x: 1, y: 2, d: 0, f: 1 }).ok);
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'bin', x: 2, y: 2, f: 1 }).ok);
  return s;
}

test('lootbox: a Clearance Bin pays three times as much for leftover supplies; junk still nothing', () => {
  for (const tier of [1, 2, 3, 4]) {
    const got = {};
    for (const cards of [null, ['lootbox']]) {
      const s = binGame(cards);
      const cash = s.players[0].cash, ev = [];
      assert.ok(give(s, 2 * s.w + 2, itemCode(1, tier), 0));
      give(s, 2 * s.w + 2, 1, 0);
      stepBack(s, ev);
      got[cards ? 'card' : 'plain'] = s.players[0].cash - cash;
    }
    assert.ok(Math.abs(got.plain - BACK.binPay[tier]) < 1e-9, `tier ${tier}`);
    assert.ok(Math.abs(got.card - BACK.binPay[tier] * CARDS.lootbox.bin) < 1e-9, `tier ${tier} with the card`);
  }
});

test('asseenontv: Rebranders work 30% faster; artisanal: machines and Rebranders 25% slower', () => {
  const ticks = (x) => Math.max(1, Math.round(x * TICK_HZ));
  for (const tier of [1, 2, 3]) {
    const base = BACK.rebrandSecs[tier];
    assert.equal(rebrandTicks(game(), tier), ticks(base));
    assert.equal(rebrandTicks(game(['asseenontv']), tier), ticks(base / CARDS.asseenontv.rebrand), `tier ${tier}`);
    assert.equal(rebrandTicks(game(['artisanal']), tier), ticks(base * CARDS.artisanal.work), `tier ${tier}`);
    assert.equal(rebrandTicks(game(['artisanal', 'asseenontv']), tier), ticks((base * CARDS.artisanal.work) / CARDS.asseenontv.rebrand));
  }
  assert.equal(makeTicks(game()), ticks(BACK.makeSecs));
  assert.equal(makeTicks(game(['artisanal'])), ticks(BACK.makeSecs * CARDS.artisanal.work));
  assert.equal(makeTicks(game(['asseenontv'])), ticks(BACK.makeSecs), 'machines are not Rebranders');
  // In play: a Spite Still fed junk starts its work at the card's time, and so does a Rebrander.
  for (const [cards, k, code, want] of [[['artisanal'], 'still', 1, makeTicks(game(['artisanal']))],
    [['asseenontv'], 'rebrand', itemCode(2, 1), rebrandTicks(game(['asseenontv']), 1)]]) {
    const g = game(cards);
    assert.ok(applyCommand(g, 0, { c: 'place', k, x: 5, y: 5, d: 0, f: 1 }).ok);
    const i = 5 * g.w + 5;
    assert.ok(give(g, i, code, 0));
    stepBack(g, []);
    assert.equal(g.back[i].t, want, `${k}`);
  }
});

test('regifting: every Dumbwaiter holds two more units of each supply', () => {
  const s = game(['regifting']), plain = game();
  assert.equal(stockCap(plain), BACK.stockUnits);
  assert.equal(stockCap(s), BACK.stockUnits + CARDS.regifting.units);
  for (const [g, cap] of [[plain, BACK.stockUnits], [s, BACK.stockUnits + CARDS.regifting.units]]) {
    assert.ok(applyCommand(g, 0, { c: 'place', k: 'forklift', x: 5, y: 5 }).ok);
    const b = g.grid[5 * g.w + 5];
    let n = 0;
    while (takesSupply(b, itemCode(1, 1), g)) { addStock(b, itemCode(1, 1), g); n++; }
    assert.equal(n, cap);
    assert.equal(unitsIn(b, 'dmg', g), cap);
    // Up its Dumbwaiter too: full is full.
    assert.equal(give(g, 5 * g.w + 5, itemCode(1, 1), 0), false);
  }
});

test('artisanal: every unit of supply lasts 25% longer (uses rounded up), counted as one unit', () => {
  const s = game(['artisanal']);
  for (const k of ['sprinkler', 'forklift', 'railgun', 'samples']) {
    for (const t of ['dmg', 'dur', 'wire']) {
      for (const tier of [1, 2, 3, 4]) {
        assert.equal(usesPer(k, t, tier, s), Math.ceil(usesPer(k, t, tier) * CARDS.artisanal.uses), `${k} ${t} ${tier}`);
        assert.equal(usesPer(k, t, tier, game()), usesPer(k, t, tier));
      }
    }
  }
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'forklift', x: 5, y: 5 }).ok);
  const b = s.grid[5 * s.w + 5];
  addStock(b, itemCode(1, 2), s);
  assert.deepEqual(b.s.dmg, [2, Math.ceil(BUILD.forklift.shots * CARDS.artisanal.uses)]);
  assert.equal(unitsIn(b, 'dmg', s), 1, 'still one unit');
});

test('premature: security fires faster and reaches less far', () => {
  const s = game(['artisanal', 'premature']), plain = game();
  assert.deepEqual(statsOf({ k: 'crate' }, s), statsOf({ k: 'crate' }), 'a Crate Stack has nothing to change');
  for (const k of ['sprinkler', 'forklift', 'railgun']) {
    near(statsOf({ k }, s).cd, statsOf({ k }).cd / CARDS.premature.rate, k);
    near(statsOf({ k }, s).range, statsOf({ k }).range * CARDS.premature.range, k);
    assert.deepEqual(statsOf({ k }, plain), statsOf({ k }));
  }
  assert.deepEqual(statsOf({ k: 'samples' }, s), statsOf({ k: 'samples' }), 'not a tower');
  // In play: a forklift reloads in the card's time.
  const g = game(['premature']);
  openEmpty(g, 3);
  applyCommand(g, 0, { c: 'place', k: 'forklift', x: 10, y: 8 });
  walker(g, 'hunter', 12.5, 8.5, { st: ST.STUN, t: 1e6 });
  const ev = step(g);
  assert.ok(ev.some((e) => e.e === 'shot'));
  assert.equal(g.grid[8 * g.w + 10].cd, secs(BUILD.forklift.cd / CARDS.premature.rate));
});

test('preworkout: the gym bros it picks by id land twice as many hits, the Roid Rager too', () => {
  const s = game(['preworkout']);
  const ids = [...Array(80).keys()].map((i) => i + 1);
  const picked = ids.find((id) => idShare(id, 'preworkout', s.seed) < CARDS.preworkout.share);
  const spared = ids.find((id) => idShare(id, 'preworkout', s.seed) >= CARDS.preworkout.share);
  const bro = (id, hn, sup = 0) => ({ id, k: 'gymbro', hn, hw: 0, ...(sup ? { sup: 1 } : {}) });
  const max = TUNE.smashMax, rage = SUPERS.gymbro.smashMax;
  assert.equal(smashReady(bro(picked, max), SHOPPERS.gymbro, s), true);
  assert.equal(smashReady(bro(picked, max * CARDS.preworkout.hits - 1), SHOPPERS.gymbro, s), true);
  assert.equal(smashReady(bro(picked, max * CARDS.preworkout.hits), SHOPPERS.gymbro, s), false);
  assert.equal(smashReady(bro(picked, rage * CARDS.preworkout.hits - 1, 1), SUPERS.gymbro, s), true);
  assert.equal(smashReady(bro(spared, max), SHOPPERS.gymbro, s), false);
  assert.equal(smashReady(bro(picked, max), SHOPPERS.gymbro, game()), false);
});

test('bde and retreat: bosses walk in with 20% more patience; a pep talk gives back half as much again', () => {
  const plain = arrival(game(), 'boss', 0, 10), big = arrival(game(['bde']), 'boss', 0, 10);
  near(big.mhp, plain.mhp * CARDS.bde.hp, 'boss');
  near(plain.mhp, bossPatience(10), 'unchanged without the card');
  for (const [cards, m] of [[null, 1], [['retreat'], CARDS.retreat.pep]]) {
    const s = game(cards);
    openEmpty(s, 5);
    walker(s, 'boss', 10.5, 8.5, { tr: 1, pp: 1 });
    const o = walker(s, 'hunter', 11.5, 8.5, { hp: 100, mhp: 1000, st: ST.STUN, t: 1e6 });
    assert.ok(step(s).some((e) => e.e === 'pep'));
    near(o.hp, 100 + 1000 * BOSS.pepHeal * m, `pep ${cards}`);
  }
});

test('hardy and frail: the picked kind and its super walk in with 30% more or 25% less patience; others do not', () => {
  for (const [card, m] of [['hardy', CARDS.hardy.hp], ['frail', CARDS.frail.hp]]) {
    for (const sup of [0, 1]) {
      near(arrival(game([`${card}:karen`]), 'karen', sup).mhp, arrival(game(), 'karen', sup).mhp * m, `${card} karen ${sup}`);
    }
    near(arrival(game([`${card}:karen`]), 'hunter').mhp, arrival(game(), 'hunter').mhp, `${card} leaves others`);
  }
  // Babies are not their mother's kind.
  const s = game(['hardy:preggo']), plain = game();
  s.wave = plain.wave = 6;
  near(patienceFor(s, BABY, 'baby'), patienceFor(plain, BABY, 'baby'), 'babies');
});

/** How far a shopper of kind k (with this id) walks in one tick in an open store. */
function stride(cards, k, sup = 0, id = 11) {
  const s = game(cards);
  openEmpty(s, 3);
  const sh = walker(s, k, 4.5, 2.5, sup ? { sup: 1 } : {});
  sh.id = id;
  if (k === 'drinker') sh.sv = 1;
  step(s);
  return Math.hypot(sh.vx, sh.vy);
}

test('hurry, slow and mallwalkers: walking speed, on top of each shopper\'s own pace; not the boss', () => {
  for (const sup of [0, 1]) {
    near(stride(['hurry:dad'], 'dad', sup), stride(null, 'dad', sup) * CARDS.hurry.speed, `hurry ${sup}`);
    near(stride(['slow:dad'], 'dad', sup), stride(null, 'dad', sup) * CARDS.slow.speed, `slow ${sup}`);
  }
  near(stride(['hurry:dad'], 'hunter'), stride(null, 'hunter'), 'another kind');
  near(stride(['mallwalkers'], 'hunter'), stride(null, 'hunter') * CARDS.mallwalkers.speed, 'mall walkers');
  near(stride(['mallwalkers', 'hurry:hunter'], 'hunter'), stride(null, 'hunter') * CARDS.mallwalkers.speed * CARDS.hurry.speed, 'two cards multiply');
  near(stride(['mallwalkers'], 'boss'), stride(null, 'boss'), 'not the boss');
  near(stride(['mallwalkers'], 'baby'), stride(null, 'baby') * CARDS.mallwalkers.speed, 'babies too');
});

test('mallwalkers, bulkbuy, flashmob: patience for the crowd (mall walkers: everyone but the boss)', () => {
  for (const [card, kinds, spared] of [['mallwalkers', ['hunter', 'trader'], []], ['bulkbuy', ['hunter', 'dad'], ['trader']], ['flashmob', ['karen'], ['trader']]]) {
    for (const k of kinds) near(arrival(game([card]), k).mhp, arrival(game(), k).mhp * CARDS[card].hp, `${card} ${k}`);
    for (const k of spared) near(arrival(game([card]), k).mhp, arrival(game(), k).mhp, `${card} spares ${k}`);
    near(arrival(game([card]), 'boss', 0, 10).mhp, arrival(game(), 'boss', 0, 10).mhp, `${card}: not the boss`);
  }
  const s = game(['mallwalkers']), b = game(['bulkbuy']), plain = game();
  s.wave = b.wave = plain.wave = 6;
  near(patienceFor(s, BABY, 'baby'), patienceFor(plain, BABY, 'baby') * CARDS.mallwalkers.hp, 'babies');
  near(patienceFor(b, BABY, 'baby'), patienceFor(plain, BABY, 'baby'), 'bulkbuy: not babies');
});

/** How many of each kind are queued when sales event n opens. */
function crowdOf(cards, n) {
  const s = game(cards);
  s.wave = n - 1;
  applyCommand(s, 0, { c: 'start' });
  const out = {};
  for (const q of s.spawnQ) out[q[1]] = (out[q[1]] || 0) + 1;
  return out;
}

test('doorbuster, bulkbuy, flashmob, fathersday, openbar: the crowd, never the boss or a Midnight Release mob', () => {
  for (const n of [10, 12]) {
    const groups = waveSpec(n, 1);
    const expect = (m, only = null) => {
      const out = {};
      for (const g of groups) {
        const many = g.k === 'boss' || g.mob || (only && g.k !== only) ? g.n : Math.max(1, Math.round(g.n * m));
        out[g.k] = (out[g.k] || 0) + many;
      }
      return out;
    };
    assert.deepEqual(crowdOf(null, n), expect(1), `event ${n}`);
    for (const card of ['doorbuster', 'bulkbuy', 'flashmob']) assert.deepEqual(crowdOf([card], n), expect(CARDS[card].crowd), `${card} ${n}`);
    assert.deepEqual(crowdOf(['fathersday'], n), expect(CARDS.fathersday.crowd, 'dad'), `fathersday ${n}`);
    assert.deepEqual(crowdOf(['openbar'], n), expect(CARDS.openbar.crowd, 'drinker'), `openbar ${n}`);
  }
  // Their patience: dads and drinkers only.
  near(arrival(game(['fathersday']), 'dad').mhp, arrival(game(), 'dad').mhp * CARDS.fathersday.hp, 'dads');
  near(arrival(game(['fathersday']), 'hunter').mhp, arrival(game(), 'hunter').mhp, 'not hunters');
  near(arrival(game(['openbar']), 'drinker', 1).mhp, arrival(game(), 'drinker', 1).mhp * CARDS.openbar.hp, 'drinkers');
  // Supers keep their share.
  const s = game(['fathersday']);
  s.wave = 11;
  applyCommand(s, 0, { c: 'start' });
  const dads = s.spawnQ.filter((q) => q[1] === 'dad');
  assert.ok(dads.some((q) => q[2]) && dads.some((q) => !q[2]));
});

test('convention: a Cosplayer walks at 0.8 tiles a second, has 25% less patience and shields from 1.5 tiles', () => {
  const s = game(['convention']);
  const pace = stride(['convention'], 'cosplay') / stride(null, 'cosplay');
  near(pace, CARDS.convention.speed / SHOPPERS.cosplay.speed, 'speed');
  near(stride(['convention'], 'cosplay', 1) / stride(null, 'cosplay', 1), CARDS.convention.speed / SUPERS.cosplay.speed, 'the mech suit too');
  near(arrival(game(['convention']), 'cosplay').mhp, arrival(game(), 'cosplay').mhp * CARDS.convention.hp, 'patience');
  near(TUNE.shield + cardShield(s, SHOPPERS.cosplay), CARDS.convention.shield, 'reach');
  near(SUPERS.cosplay.shield + cardShield(s, SUPERS.cosplay), SUPERS.cosplay.shield + CARDS.convention.shield - TUNE.shield, 'the mech suit reaches as much further');
  assert.equal(cardShield(s, SHOPPERS.hunter), 0);
  // In play: a shot at a shopper 1.35 tiles from him is his to take.
  for (const [cards, takes] of [[null, false], [['convention'], true]]) {
    const g = game(cards);
    openEmpty(g, 3);
    applyCommand(g, 0, { c: 'place', k: 'forklift', x: 5, y: 8 });
    const target = walker(g, 'hunter', 9.5, 8.5, { st: ST.STUN, t: 1e6 });
    const cos = walker(g, 'cosplay', 8.5, 9.4, { st: ST.STUN, t: 1e6 });
    step(g);
    assert.equal(cos.hp < cos.mhp, takes, `${cards}: cosplayer hit`);
    assert.equal(target.hp < target.mhp, !takes, `${cards}: target hit`);
  }
});

test('klepto: ordinary shoplifters steal stock twice as often as they pass; not Card Traders', (t) => {
  const s = game(['klepto']);
  assert.equal(cardGrabChance(s, SHOPPERS.hunter), CARDS.klepto.chance);
  assert.equal(cardGrabHeal(s, SHOPPERS.hunter), CARDS.klepto.heal);
  assert.equal(cardGrabChance(s, SHOPPERS.trader), 1);
  assert.equal(cardGrabHeal(s, SHOPPERS.trader), 0);
  assert.equal(cardGrabChance(game(), SHOPPERS.hunter), 1);
  assert.equal(cardGrabHeal(game(), SHOPPERS.hunter), 0);
  // In play: one tick beside a stocked forklift; returns whether he took a unit.
  const takes = (cards, seed) => {
    const g = game(cards, seed);
    openEmpty(g, 3);
    applyCommand(g, 0, { c: 'place', k: 'forklift', x: 20, y: 8 });
    addStock(g.grid[8 * g.w + 20], itemCode(1, 1), g);
    walker(g, 'hunter', 19.5, 8.5);
    return step(g).some((e) => e.e === 'grab');
  };
  // Twice as often: at half a tick's worth of chance, the card makes it certain.
  tune(t, { grabChance: TICK_HZ / CARDS.klepto.chance });
  let plain = 0;
  for (let seed = 1; seed <= 40; seed++) {
    assert.equal(takes(['klepto'], seed), true, `seed ${seed}`);
    if (takes(null, seed)) plain++;
  }
  assert.ok(plain > 8 && plain < 32, `${plain} of 40 without the card`);
});

test('shrinkflation, staffdiscount, rentacop, sweatshop: what a building costs, and what it sells back for', () => {
  const price = (cards, k) => buildPrice(game(cards), k);
  for (const k of SHOP_KINDS) {
    assert.equal(price(null, k), BUILD[k].cost);
    assert.equal(price(['shrinkflation'], k), Math.round(BUILD[k].cost * CARDS.shrinkflation.cost), k);
    assert.equal(price(['staffdiscount'], k), Math.round(BUILD[k].cost * CARDS.staffdiscount.cost), k);
    for (const card of ['rentacop', 'sweatshop']) {
      // (Crate Stacks, the walls group, count as security for these two.)
      const m = k === 'crate' ? CARDS[card].cost.security : CARDS[card].cost[BUILD[k].group];
      assert.equal(price([card], k), m === 1 ? BUILD[k].cost : Math.round(BUILD[k].cost * m), `${card} ${k}`);
    }
  }
  // The Back's parts: the back group (0.4), never under a dollar.
  for (const k of Object.keys(BUILD).filter((kind) => BUILD[kind].back && !BUILD[kind].fixed)) {
    assert.equal(price(['sweatshop'], k), Math.max(1, Math.round(BUILD[k].cost * CARDS.sweatshop.cost.back)), k);
    assert.equal(price(['rentacop'], k), Math.max(1, Math.round(BUILD[k].cost * CARDS.rentacop.cost.back)), k);
  }
  assert.equal(price(['sweatshop'], 'crate'), Math.round(BUILD.crate.cost * CARDS.sweatshop.cost.security));
  // Paid, sold back at the usual share of what was paid, and rebuilt for half of what was paid.
  const s = game(['shrinkflation']);
  const cash = s.players[0].cash;
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'forklift', x: 5, y: 5 }).ok);
  assert.equal(cash - s.players[0].cash, price(['shrinkflation'], 'forklift'));
  const b = s.grid[5 * s.w + 5];
  assert.equal(b.c, price(['shrinkflation'], 'forklift'));
  assert.equal(spentOn(b), b.c);
  assert.equal(rebuildDeal({ k: 'forklift', c: b.c }, Infinity).pay, Math.floor(b.c * TUNE.rebuildShare));
  const before = s.players[0].cash;
  applyCommand(s, 0, { c: 'remove', x: 5, y: 5 });
  assert.equal(s.players[0].cash - before, Math.floor(b.c * TUNE.sellBack));
  // Too dear with the card, though affordable without.
  const poor = game(['shrinkflation']);
  poor.players[0].cash = BUILD.forklift.cost;
  assert.equal(canPlace(poor, 'forklift', 5, 5, 0), 'cash');
  // No card: no new field on the building.
  const plain = game();
  applyCommand(plain, 0, { c: 'place', k: 'forklift', x: 5, y: 5 });
  assert.equal('c' in plain.grid[5 * plain.w + 5], false);
});

test('mallcop: security bought new arrives with Store Brand of every supply it takes but Razor Wire', () => {
  const units = CARDS.mallcop.units;
  for (const k of SHOP_KINDS.filter((kind) => BUILD[kind].lift)) {
    const s = game(['mallcop']);
    const cash = s.players[0].cash, rng = s.rng;
    assert.ok(applyCommand(s, 0, { c: 'place', k, x: 5, y: 5, d: 0 }).ok, k);
    assert.equal(cash - s.players[0].cash, BUILD[k].cost, `${k}: paid the usual price`);
    assert.equal(s.rng, rng, 'no random number drawn for it (the old card picked a track at random)');
    const b = s.grid[5 * s.w + 5];
    assert.equal(spentOn(b), BUILD[k].cost, 'the stock is never money: worth only what was paid');
    for (const t of STOCK_TRACKS) {
      const takes = t !== 'wire' && !!BUILD[k].up[t];
      assert.equal(unitsIn(b, t), takes ? units : 0, `${k} ${t}`);
      if (takes) assert.equal(b.s[t][0], 1, `${k} ${t}: Store Brand`);
    }
  }
  // Not a Crate Stack (no Dumbwaiter), not a Back part, and nothing without the card.
  const s = game(['mallcop']);
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'crate', x: 5, y: 5 }).ok);
  assert.equal(s.grid[5 * s.w + 5].s, undefined);
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'conv', x: 9, y: 9, d: 0, f: 1 }).ok);
  assert.equal(s.back[9 * s.w + 9].s, undefined);
  const plain = game();
  assert.ok(applyCommand(plain, 0, { c: 'place', k: 'forklift', x: 5, y: 5 }).ok);
  assert.equal(plain.grid[5 * plain.w + 5].s, undefined);
  // Rebuilt from rubble: no new stock (only a building bought new gets it).
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'forklift', x: 12, y: 5 }).ok);
  s.grid[5 * s.w + 12] = 0;
  s.gridVer++;
  s.rubble.push({ i: 5 * s.w + 12, k: 'forklift', d: 0, o: 0 });
  assert.equal(applyCommand(s, 0, { c: 'rebuild' }).n, 1);
  assert.equal(s.grid[5 * s.w + 12].k, 'forklift');
  assert.equal(s.grid[5 * s.w + 12].s, undefined);
  // Never past what a Dumbwaiter holds, whatever the card's number.
  const was = CARDS.mallcop.units;
  try {
    CARDS.mallcop.units = BACK.stockUnits + 4;
    const big = game(['mallcop']);
    assert.ok(applyCommand(big, 0, { c: 'place', k: 'sprinkler', x: 5, y: 5 }).ok);
    assert.equal(unitsIn(big.grid[5 * big.w + 5], 'dmg'), BACK.stockUnits);
  } finally {
    CARDS.mallcop.units = was;
  }
});

test('offatruck: every Returns Drop puts out junk faster by the card\'s number', () => {
  const card = game(['offatruck']), plain = game();
  for (let lv = 0; lv <= BACK.dropUpMax; lv++) {
    const raw = BACK.dropSecs * BACK.dropMul ** lv * TICK_HZ, base = Math.max(1, Math.round(raw));
    assert.equal(dropTicks(lv), base, 'without a game, the plain time');
    assert.equal(dropTicks(lv, plain), base, 'without the card, unchanged');
    assert.equal(dropTicks(lv, card), Math.max(1, Math.round(raw / CARDS.offatruck.drop)), `level ${lv}`);
    assert.ok(dropTicks(lv, card) < base, `level ${lv} is faster`);
  }
  // In play: a drop with a Clearance Bin in front of it waits the card's shorter time between junk.
  const waits = (cards) => {
    const s = createGame({ seed: 5, cards, map: { design: 'warehouse', size: 's' } });
    addPlayer(s, 'Dave');
    s.players[0].cash = 1e6;
    const i = s.back.findIndex((x) => x && x.k === 'drop');
    const drop = s.back[i];
    const [dx, dy] = DIRS[drop.d];
    const fx = (i % s.w) + dx, fy = ((i / s.w) | 0) + dy;
    assert.ok(applyCommand(s, 0, { c: 'place', k: 'bin', x: fx, y: fy, d: 0, f: 1 }).ok);
    const seen = new Set();
    let last = drop.t;
    for (let n = 0; n < 10 * TICK_HZ; n++) {
      step(s);
      if (drop.t > last) seen.add(drop.t);
      last = drop.t;
    }
    return [...seen];
  };
  assert.deepEqual(waits(null), [dropTicks(0)]);
  assert.deepEqual(waits(['offatruck']), [dropTicks(0, card)]);
});

test('pissing: a dog\'s pee keeps security off half as long again', () => {
  for (const [cards, m] of [[null, 1], [['pissing'], CARDS.pissing.pee]]) {
    const s = game(cards);
    openEmpty(s, 8);
    applyCommand(s, 0, { c: 'place', k: 'forklift', x: 10, y: 8 });
    walker(s, 'dog', 11.5, 8.5);
    const ev = run(s, 2, () => s.grid[8 * s.w + 10].off > 0);
    assert.ok(ev.some((e) => e.e === 'pee'));
    assert.equal(s.grid[8 * s.w + 10].off, secs(TUNE.peeSecs * m));
  }
});

/** Of `n` dads each stepping onto a teenager's mess, how many slip (each in a game of his own). */
function slips(cards, n = 20) {
  let k = 0;
  for (let seed = 1; seed <= n; seed++) {
    const s = game(cards, seed);
    openEmpty(s, 3);
    s.messes.push([8 * s.w + 12, 1e6]);
    walker(s, 'dad', 11.9, 8.5);
    if (run(s, 1).some((e) => e.e === 'slip')) k++;
  }
  return k;
}

test('sensibleshoes and mopmike: slipping 30% less, 40% more often', (t) => {
  assert.equal(cardSlip(game(['sensibleshoes'])), CARDS.sensibleshoes.slip);
  assert.equal(cardSlip(game(['mopmike'])), CARDS.mopmike.slip);
  assert.equal(cardSlip(game()), 1);
  // A chance that is certain without the card is not with it, and the other way round.
  tune(t, { slipChance: 1 });
  assert.equal(slips(null), 20);
  assert.ok(slips(['sensibleshoes']) < 20);
  TUNE.slipChance = 1 / CARDS.mopmike.slip;
  assert.ok(slips(null) < 20);
  assert.equal(slips(['mopmike']), 20);
});

/** Of `n` Day Drinkers each turning a corner, how many fall (each in a game of his own). */
function falls(cards, n = 20) {
  let k = 0;
  for (let seed = 1; seed <= n; seed++) {
    const s = game(cards, seed);
    openEmpty(s, 3);
    // He has just come round a corner: north last time, east into this tile.
    const sh = walker(s, 'drinker', 12.5, 8.5, { sv: 1, dr: 3, lt: 8 * s.w + 11 });
    sh.id = 2; // (his speed does not change on this tick)
    if (step(s).some((e) => e.e === 'fall')) k++;
  }
  return k;
}

test('dryjanuary and happyhour: Day Drinkers fall half as often, twice as often', (t) => {
  assert.equal(cardFall(game(['dryjanuary'])), CARDS.dryjanuary.fall);
  assert.equal(cardFall(game(['happyhour'])), CARDS.happyhour.fall);
  tune(t, { fallChance: 1 });
  assert.equal(falls(null), 20);
  assert.ok(falls(['dryjanuary']) < 20);
  TUNE.fallChance = 1 / CARDS.happyhour.fall;
  assert.ok(falls(null) < 20);
  assert.equal(falls(['happyhour']), 20);
});

test('restocking: a shopper who storms out pays the store $2 on his way; a baby does not', () => {
  for (const [k, pays] of [['dad', true], ['baby', false]]) {
    const s = game(['restocking']);
    openEmpty(s, 4);
    walker(s, k, 10.5, 8.5, { hp: 1e-9, mhp: 10 });
    if (k === 'baby') {
      applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 10, y: 9 });
    }
    const cash = s.players[0].cash;
    const left = run(s, 1, () => s.shoppers[0].st === ST.LEAVE).find((e) => e.e === 'left');
    assert.ok(left, k);
    assert.equal(left.fee, pays ? CARDS.restocking.fee : undefined, k);
    if (pays) assert.equal(s.players[0].cash - cash, CARDS.restocking.fee);
  }
  const s = game();
  openEmpty(s, 4);
  walker(s, 'dad', 10.5, 8.5, { hp: 1e-9, mhp: 10 });
  assert.equal('fee' in run(s, 1).find((e) => e.e === 'left'), false);
});

test('firecode: a Pepper Sprinkler sprays 5 shoppers at once instead of 4', () => {
  for (const [cards, most] of [[null, BUILD.sprinkler.targets], [['firecode'], CARDS.firecode.targets]]) {
    const s = game(cards);
    openEmpty(s, 3);
    applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 10, y: 8 });
    const crowd = [[9.5, 7.5], [10.5, 7.5], [11.5, 7.5], [9.5, 9.5], [10.5, 9.5], [11.5, 9.5], [11.5, 8.5]]
      .map(([x, y]) => walker(s, 'hunter', x, y, { st: ST.STUN, t: 1e6 }));
    step(s);
    assert.equal(crowd.filter((c) => c.hp < c.mhp).length, most, `${cards}`);
  }
});

// ---- The words -----------------------------------------------------------------------------------

/** Every number in a card's data, as [path, value]. */
function numbersOf(obj, path = []) {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') out.push([[...path, k], v]);
    else if (v && typeof v === 'object') out.push(...numbersOf(v, [...path, k]));
  }
  return out;
}

test('every card has a name, a rule built from its numbers and a joke; a per-kind card names its kind', () => {
  assert.deepEqual([...CARD_WORDS].sort(), Object.keys(CARDS).sort());
  assert.equal(Object.keys(CARDS).length, 48);
  assert.deepEqual(Object.keys(PLURALS).sort(), Object.keys(SHOPPERS).sort());
  for (const card of Object.keys(CARDS)) {
    const per = CARDS[card].per === 'kind';
    const id = per ? `${card}:karen` : card;
    const t = cardText(id);
    assert.ok(t.name && t.rule && t.joke, card);
    assert.equal(t.side, CARDS[card].side);
    assert.ok(t.rule.length < 320 && t.joke.length < 200, `${card} is short enough to read`);
    assert.ok(/[.!?]$/.test(t.rule) && /[.!?]$/.test(t.joke), card);
    assert.ok(!/undefined|NaN|\{/.test(t.rule), `${card}: ${t.rule}`);
    if (per) {
      for (const k of cardKinds()) assert.ok(cardText(`${card}:${k}`).rule.includes(PLURALS[k][0]), `${card} names ${k}`);
    }
    // Built from the numbers: change any one of them and the sentence changes with it.
    for (const [path, v] of numbersOf(CARDS[card])) {
      const holder = path.slice(0, -1).reduce((o, k) => o[k], CARDS[card]), key = path[path.length - 1];
      holder[key] = v === 1 / 3 ? 0.2 : v * 1.37 + 0.11;
      try {
        assert.notEqual(cardText(id).rule, t.rule, `${card}.${path.join('.')} shows in the rule`);
      } finally {
        holder[key] = v;
      }
    }
  }
  // Spot checks that the numbers read as they should.
  assert.match(cardText('hardy:karen').rule, /Karens and Karen Supremes have 25% more patience/);
  assert.match(cardText('slow:dad').rule, /Dads and Dads on a Mission walk 15% slower/);
  assert.match(cardText('litter').rule, /twice as many babies/);
  assert.match(cardText('pulledout').rule, /half as many babies/);
  assert.match(cardText('doubledip').rule, /^One in 5 shoppers takes twice the cash/);
  assert.match(cardText('lootbox').rule, /Clearance Bin pays 3 times as much/);
  assert.match(cardText('clearance').rule, /^Every sales event pays 15% less/);
  assert.match(cardText('overtime').rule, /^Every sales event pays 50% more/);
  assert.match(cardText('asseenontv').rule, /Rebranders work 30% faster/);
  assert.match(cardText('regifting').rule, /2 more units of each supply \(8 instead of 6\)/);
  assert.match(cardText('artisanal').rule, /take 25% longer, and every unit of supply lasts 25% longer/);
  assert.match(cardText('payday').rule, /pays 20% more .* every refund costs 60% more/);
  assert.match(cardText('rentacop').rule, /Security buildings and Crate Stacks cost 20% less, parts for The Back 20% more/);
  assert.match(cardText('sweatshop').rule, /^Parts for The Back cost 20% less, security buildings and Crate Stacks 20% more/);
  assert.match(cardText('firecode').rule, /5 shoppers at once instead of 4/);
  assert.match(cardText('fathersday').rule, /^Twice as many Dads, each with 28% less patience/);
  assert.match(cardText('preworkout').rule, /\(4; a Roid Rager 6\)/);
  assert.equal(cardText('nonsense'), null);
  assert.equal(cardName('bde'), 'Big Dick Energy');
});

test('the handbook\'s line in a game with cards names them; none without', () => {
  assert.equal(cardsNote(game()), '');
  assert.equal(cardsNote(null), '');
  const note = cardsNote(game(['bde', 'hardy:karen']));
  assert.match(note, /Big Dick Energy, Little Blue Pills/);
  assert.match(note, /standard/);
});

// ---- The host's "Cards: On / Off" setting (0.3.01) ------------------------------------------------

/** A lobby game with two players (the host is player 0), on a small warehouse. */
function lobbyGame(seed = 6, settings = null) {
  const s = createGame({ seed, lobby: true, cards: true, settings, map: { design: 'warehouse', size: 's' } });
  addPlayer(s, 'Host');
  addPlayer(s, 'Dave');
  return s;
}
/** Everyone presses Ready and the game runs until it leaves the lobby (and, with cards, the deal). */
function readyUp(s) {
  for (const p of s.players) applyCommand(s, p.id, { c: 'ready', on: true });
  const ev = [];
  for (let i = 0; i < dealLength(5) + 10 && s.phase !== 'build'; i++) ev.push(...step(s));
  return ev;
}

test('Cards setting: on by default; Off through createGame deals nothing, a forced hand stays', () => {
  assert.equal(cleanSettings().cardsOn, true);
  assert.equal(cleanSettings({ cardsOn: 'no' }).cardsOn, true, 'anything but false is on');
  assert.equal(cleanSettings({ cardsOn: false }).cardsOn, false);
  assert.equal(cardsOn(lobbyGame()), true);
  const off = createGame({ seed: 6, lobby: true, cards: true, settings: { cardsOn: false } });
  assert.equal('cards' in off, false);
  assert.equal('dealT' in off, false);
  assert.equal(cardsOn(off), false);
  // Without a lobby too: straight into the first build phase.
  assert.equal(createGame({ seed: 6, cards: true, settings: { cardsOn: false } }).phase, 'build');
  // A forced hand (tests, the URL option) is not the setting's business.
  assert.deepEqual(createGame({ seed: 6, cards: ['litter'], settings: { cardsOn: false } }).cards, ['litter']);
  // Nor is a training game ever dealt any.
  assert.equal(cardsOn(createGame({ training: true, cards: true })), false);
});

test('Cards setting: the host switches it in the lobby; nobody else, and not once the game is on', () => {
  const s = lobbyGame();
  applyCommand(s, 1, { c: 'ready', on: true });
  assert.deepEqual(applyCommand(s, 1, { c: 'settings', cardsOn: false }), { ok: false, why: 'host' });
  assert.equal(cardsOn(s), true);
  assert.ok(applyCommand(s, 0, { c: 'settings', cardsOn: false }).ok);
  assert.equal('cards' in s, false);
  assert.equal('dealT' in s, false);
  assert.equal(s.players[1].ready, false, 'everyone presses Ready again, as for any setting');
  // Other settings changed later leave it off; a value that is not true or false leaves it alone.
  assert.ok(applyCommand(s, 0, { c: 'settings', waves: 10 }).ok);
  assert.ok(applyCommand(s, 0, { c: 'settings', cardsOn: 'yes' }).ok);
  assert.equal(cardsOn(s), false);
  assert.equal(s.waves, 10);
  // Off, the lobby goes straight to the first build phase, with begun, like a game without cards.
  const ev = readyUp(s);
  assert.equal(s.phase, 'build');
  assert.equal(s.phaseT, -1);
  assert.ok(ev.some((e) => e.e === 'begun'));
  assert.ok(!ev.some((e) => e.e === 'deal' || e.e === 'card'));
  assert.equal(buildPrice(s, 'crate'), BUILD.crate.cost);
  // Once the game is on it cannot be changed.
  assert.equal(applyCommand(s, 0, { c: 'settings', cardsOn: true }).ok, false);
  assert.equal(cardsOn(s), false);
  const on = lobbyGame();
  readyUp(on);
  assert.equal(applyCommand(on, 0, { c: 'settings', cardsOn: false }).ok, false);
  assert.equal(on.cards.length, 5);
});

test('Cards setting: switched back on, a fresh legal hand is dealt and the deal runs', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = lobbyGame(seed);
    applyCommand(s, 0, { c: 'settings', cardsOn: false });
    assert.ok(applyCommand(s, 0, { c: 'settings', cardsOn: true }).ok);
    assert.equal(s.cards.length, 5);
    assert.equal(s.dealT, 0);
    assert.deepEqual(s.cards.map((id) => CARDS[cardParts(id)[0]].side), DEAL_ORDER);
    for (const id of s.cards) assert.ok(DEALABLE.includes(cardParts(id)[0]), id);
    assert.equal(new Set(s.cards.map((id) => cardParts(id)[0])).size, 5);
    if (seed <= 3) {
      const ev = readyUp(s);
      assert.equal(ev.filter((e) => e.e === 'card').length, 5);
      assert.equal(s.phase, 'build');
    }
  }
});

test('Cards setting: created off, a game is tick for tick one without cards; switched off, an ordinary game', () => {
  // Created with cards off: no hand was ever dealt, so the random stream is untouched.
  const none = createGame({ seed: 8, lobby: true, map: { design: 'warehouse', size: 's' } });
  const off = createGame({ seed: 8, lobby: true, cards: true, settings: { cardsOn: false }, map: { design: 'warehouse', size: 's' } });
  assert.deepEqual(off, none);
  // Switched off in the lobby: the hand was dealt (and drew random numbers) when the game was made,
  // so the stream is further along than in a game made without cards. It is still a plain game:
  // no hand, no deal, the standard numbers.
  const s = lobbyGame(8);
  applyCommand(s, 0, { c: 'settings', cardsOn: false });
  const plain = createGame({ seed: 8, lobby: true, map: { design: 'warehouse', size: 's' } });
  addPlayer(plain, 'Host');
  addPlayer(plain, 'Dave');
  assert.notEqual(s.rng, plain.rng, 'dealing the hand moved the random stream on');
  assert.deepEqual({ ...s, rng: 0 }, { ...plain, rng: 0 }, 'otherwise the same game');
  readyUp(s);
  assert.equal(cardsShown(s), 0);
  assert.equal(hasCard(s, 'litter'), false);
  assert.equal(statsOf({ k: 'sprinkler' }, s).range, statsOf({ k: 'sprinkler' }).range);
  // JSON round trip, both ways.
  for (const g of [s, lobbyGame(9)]) {
    const copy = JSON.parse(JSON.stringify(g));
    assert.deepEqual(copy, g);
    assert.equal(cardsOn(copy), cardsOn(g));
  }
});

test('Cards setting: Back to the lobby carries it over, and the host can turn them back on', () => {
  const host = new HostSession({ name: 'Dave', seed: 4, cards: true, lobby: true, settings: { cardsOn: false }, map: { design: 'warehouse', size: 's' } });
  assert.equal(cardsOn(host.state), false);
  host.send({ c: 'ready', on: true });
  host.fastForward(3);
  assert.equal(host.state.phase, 'build');
  host.state.phase = 'lost';
  assert.ok(host.backToLobby({ seed: 99 }));
  assert.equal(cardsOn(host.state), false, 'played without cards, the next lobby starts without');
  host.send({ c: 'settings', cardsOn: true });
  assert.equal(host.state.cards.length, 5);
  assert.equal(host.state.dealT, 0);
  host.send({ c: 'ready', on: true });
  host.fastForward(3);
  assert.equal(host.state.phase, 'cards');
  host.fastForward(dealLength(5) + 5);
  host.state.phase = 'won';
  assert.ok(host.backToLobby({ seed: 7 }));
  assert.equal(cardsOn(host.state), true, 'played with cards, the next lobby deals again');
});
