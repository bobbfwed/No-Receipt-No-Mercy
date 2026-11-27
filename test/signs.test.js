// Tests for 0.4.01: the Wet Floor Sign is no longer fed from The Back; it is upgraded with cash,
// four levels, with the `upgrade` command.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, canUpgrade, canWire, upgradeCost, statsOf, levelIn, step, queueTrainingWave, newPart,
  carriesWire, takesSupply, itemCode, BUILD, BACK, TUNE, TICK_HZ,
} from '../src/sim/index.js';
import { checksum } from '../src/net/session.js';

function stage(seed = 5, more = {}) {
  const s = createGame({ seed, training: true, ...more });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  return s;
}
const at = (x, y) => y * 30 + x;
const place = (s, k, x, y, d = 0) => applyCommand(s, 0, { c: 'place', k, x, y, d });
const up = (s, x, y, pid = 0, ev = []) => applyCommand(s, pid, { c: 'upgrade', x, y }, ev);

test('the numbers: $30, 60, 120, 240, four levels, worth 2, 3, 5 and 6 levels; no Dumbwaiter, no stock, no wire', () => {
  assert.deepEqual(BUILD.wetfloor.upgrade, { cost: 30, grow: 2, max: 4, level: [0, 2, 3, 5, 6] });
  assert.equal(BUILD.wetfloor.lift, undefined);
  assert.equal(BUILD.wetfloor.shots, undefined);
  assert.equal(carriesWire('wetfloor'), false);
  assert.equal(takesSupply({ k: 'wetfloor', o: 0 }, itemCode(1, 1)), false);
  assert.deepEqual([0, 1, 2, 3, 4].map((u) => upgradeCost({ k: 'wetfloor', u })), [30, 60, 120, 240, 0]);
  for (const k of Object.keys(BUILD)) if (k !== 'wetfloor') assert.equal(BUILD[k].upgrade, undefined, `${k} has no cash upgrade`);
  assert.equal(upgradeCost({ k: 'sprinkler' }), 0);
  // The top level is as good as Premium stock was, not Platinum.
  assert.equal(BUILD.wetfloor.upgrade.level[4], BACK.tierLevel[3]);
});

test('each level works exactly as stock of that level did, on every track the sign has', () => {
  const up = BUILD.wetfloor.up.dmg;
  for (let u = 0; u <= 4; u++) {
    const L = BUILD.wetfloor.upgrade.level[u];
    const b = { k: 'wetfloor', u };
    assert.equal(levelIn(b, 'dmg'), L);
    const st = statsOf(b);
    assert.ok(Math.abs(st.slow - TUNE.wetSlow * up.slow ** L) < 1e-12, `slow at ${u}`);
    assert.ok(Math.abs(st.slip - Math.min(0.95, TUNE.slipChance + up.slip * L)) < 1e-12, `slip at ${u}`);
    assert.ok(Math.abs(st.slipDmg - TUNE.slipDmg * up.mul ** L) < 1e-12, `slipDmg at ${u}`);
  }
  // Stock on a sign (an old save) counts for nothing.
  assert.equal(levelIn({ k: 'wetfloor', s: { dmg: [4, 10] } }, 'dmg'), 0);
});

test('the upgrade command: anyone pays, the money counts as spent, the event; up to four; reasons', () => {
  const s = stage();
  addPlayer(s, 'Steve');
  s.players[1].cash = 1e6;
  assert.ok(place(s, 'wetfloor', 6, 6).ok);
  const b = s.grid[at(6, 6)];
  let paid = BUILD.wetfloor.cost;
  for (let u = 1; u <= 4; u++) {
    const pid = u % 2, cash = s.players[pid].cash, ev = [];
    const cost = upgradeCost(b, s);
    assert.deepEqual(up(s, 6, 6, pid, ev), { ok: true });
    assert.equal(s.players[pid].cash, cash - cost);
    assert.deepEqual(ev, [{ e: 'upgrade', i: at(6, 6), k: 'wetfloor', u, by: pid, paid: cost }]);
    paid += cost;
    assert.equal(b.u, u);
    assert.equal(b.c, paid);
  }
  assert.equal(paid, 30 + 30 + 60 + 120 + 240);
  assert.equal(canUpgrade(s, 0, 6, 6), 'max');
  assert.equal(up(s, 6, 6).why, 'max');
  // Reinforcing is a separate ladder.
  assert.ok(applyCommand(s, 0, { c: 'reinforce', x: 6, y: 6 }).ok);
  assert.equal(b.u, 4);
  assert.equal(b.r, 1);
  // Sold back: the usual share of everything spent, to its owner.
  const cash = s.players[0].cash;
  assert.ok(applyCommand(s, 1, { c: 'remove', x: 6, y: 6 }).ok);
  assert.equal(s.players[0].cash, cash + Math.floor(b.c * TUNE.sellBack));
  assert.equal(s.back[at(6, 6)], 0, 'nothing left behind in The Back');
});

test('the upgrade command refuses what it should, changing nothing', () => {
  const s = stage();
  assert.ok(place(s, 'wetfloor', 6, 6).ok);
  assert.ok(place(s, 'sprinkler', 8, 8).ok);
  const before = JSON.stringify(s);
  const no = (cmd, why, pid = 0) => {
    const r = applyCommand(s, pid, cmd);
    assert.equal(r.ok, false, JSON.stringify(cmd));
    if (why) assert.equal(r.why, why, JSON.stringify(cmd));
    assert.equal(JSON.stringify(s), before, JSON.stringify(cmd));
  };
  no({ c: 'upgrade', x: 8, y: 8 }, 'kind');
  no({ c: 'upgrade', x: 7, y: 7 }, 'empty');
  for (const [x, y] of [[6.5, 6], [6, '6'], [-1, 6], [30, 6], ['__proto__', 6], [6, undefined], [undefined, undefined], [null, 6]]) no({ c: 'upgrade', x, y }, 'bounds');
  no({ c: 'upgrade', x: 6, y: 6 }, 'bad', 7);
  s.players[0].cash = 29;
  const poor = JSON.stringify(s);
  assert.equal(applyCommand(s, 0, { c: 'upgrade', x: 6, y: 6 }).why, 'cash');
  assert.equal(JSON.stringify(s), poor);
  s.players[0].cash = 1e6;
  s.players[0].side = 'office';
  assert.equal(applyCommand(s, 0, { c: 'upgrade', x: 6, y: 6 }).why, 'office');
  s.players[0].side = 'store';
  s.pause = { by: 0 };
  assert.equal(applyCommand(s, 0, { c: 'upgrade', x: 6, y: 6 }).why, 'paused');
  delete s.pause;
  s.phase = 'lost';
  assert.equal(canUpgrade(s, 0, 6, 6), 'over');
});

test('the cards that change a sign\'s price change the price of an upgrade', () => {
  for (const card of ['shrinkflation', 'staffdiscount', 'rentacop', 'sweatshop']) {
    const s = createGame({ seed: 2, cards: [card] });
    addPlayer(s, 'Dave');
    s.players[0].cash = 1e6;
    // (The cards' multipliers for a security building: constants.js, CARDS.)
    const m = { shrinkflation: 1.08, staffdiscount: 0.9, rentacop: 0.8, sweatshop: 1.2 }[card];
    assert.deepEqual([0, 1, 2, 3].map((u) => upgradeCost({ k: 'wetfloor', u }, s)), [30, 60, 120, 240].map((c) => Math.max(1, Math.round(c * m))), card);
  }
});

test('a new sign has no Dumbwaiter and goes over Back parts, which stay; it carries no wire', () => {
  const s = stage();
  s.back[at(6, 6)] = newPart('conv', 0, 0);
  s.backVer++;
  const ver = s.backVer;
  assert.ok(place(s, 'wetfloor', 6, 6).ok);
  assert.equal(s.back[at(6, 6)].k, 'conv', 'the belt under it is untouched');
  assert.equal(s.backVer, ver);
  assert.ok(place(s, 'wetfloor', 9, 9).ok);
  assert.equal(s.back[at(9, 9)], 0, 'no Dumbwaiter');
  assert.equal(canWire(s, 0, 9, 9, 1), 'kind');
  assert.equal(applyCommand(s, 0, { c: 'wire', x: 9, y: 9, d: 1 }).why, 'kind');
});

test('a flattened sign\'s rubble keeps its upgrades, and a rebuild brings them back; the checksum sees u', (t) => {
  const old = { smashOther: TUNE.smashOther, smashWait: TUNE.smashWait };
  Object.assign(TUNE, { smashOther: 1, smashWait: 0 });
  t.after(() => Object.assign(TUNE, old));
  const s = stage();
  assert.ok(place(s, 'wetfloor', 6, 7).ok);
  assert.ok(up(s, 6, 7).ok);
  assert.ok(up(s, 6, 7).ok);
  const sum = checksum(s);
  const b = s.grid[at(6, 7)];
  b.u = 1;
  assert.notEqual(checksum(s), sum);
  b.u = 2;
  assert.equal(checksum(s), sum);
  const c = b.c;
  // A gym bro held on it hits what is under him.
  queueTrainingWave(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  for (let n = 0; n < 30 * TICK_HZ && s.grid[at(6, 7)]; n++) {
    for (const m of s.shoppers) { m.hp = m.mhp = 1e9; if (m.k === 'gymbro') { m.x = 6.5; m.y = 7.5; m.vx = m.vy = 0; m.sm = 0; } }
    step(s);
  }
  const r = s.rubble.find((x) => x.i === at(6, 7));
  assert.ok(r, 'flattened');
  assert.equal(r.u, 2);
  assert.equal(r.c, c);
  for (let n = 0; n < 200 * TICK_HZ && s.phase === 'wave'; n++) { for (const m of s.shoppers) m.x = 28.5; step(s); }
  assert.ok(place(s, 'wetfloor', 6, 7).ok);
  assert.equal(s.grid[at(6, 7)].u, 2, 'rebuilt with its upgrades');
});
