// Tests for: map sizes and designs, an entrance per player, each player's own money, upgrades,
// super shoppers, gym bros wrecking things, and runaway children running through everything.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, setPlayerOnline, applyCommand, canPlace, canUpgrade, step, queueTrainingWave,
  waveSpec, getField, getDist, makeMap, recommendedSize, teamCash, upgradeCost, statsOf, levelOf,
  MAP_SIZES, MAP_DESIGNS, SHOPPERS, SUPERS, BUILD, ITEMS, TUNE, TICK_HZ, NORMAL, UNREACHABLE,
} from '../src/sim/index.js';

/** A training game (no timer, cannot be lost) with plenty of cash, on the original small map. */
function stage(seed = 5) {
  const s = createGame({ seed, training: true });
  addPlayer(s, 'Dave');
  s.players[0].cash = 100000;
  return s;
}
const at = (x, y) => y * 30 + x; // the original small map is 30 tiles wide
const place = (s, k, x, y, d = 0, pid = 0) => applyCommand(s, pid, { c: 'place', k, x, y, d });
function send(s, groups) {
  queueTrainingWave(s, groups);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
}
function play(s, seconds, each = () => {}) {
  const all = [];
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    const ev = step(s);
    all.push(...ev);
    each(ev);
    if (ev.some((e) => e.e === 'waveEnd')) break;
  }
  return all;
}
/** Temporarily changes tuning numbers for one test. */
function tune(t, changes) {
  const old = {};
  for (const k of Object.keys(changes)) { old[k] = TUNE[k]; TUNE[k] = changes[k]; }
  t.after(() => Object.assign(TUNE, old));
}

// ---------------------------------------------------------------- maps

test('the default map is the original warehouse, unchanged', () => {
  const classic = [
    '##############################',
    '#............................#',
    '#............................#',
    '#............................#',
    '#.......#...........#........#',
    '#............................T',
    '#............................T',
    'D............................T',
    'D............................T',
    '#............................T',
    '#............................T',
    '#.......#...........#........#',
    '#............................#',
    '#............................#',
    '#............................#',
    '##############################',
  ].join('');
  const s = createGame();
  assert.equal(s.w, 30);
  assert.equal(s.h, 16);
  assert.equal(s.tiles, classic);
  assert.equal(s.doors.length, 1);
});

test('every design in every size has six entrances that all reach the tills', () => {
  for (const design of Object.keys(MAP_DESIGNS)) {
    for (const size of Object.keys(MAP_SIZES)) {
      const s = createGame({ map: { design, size } });
      const { w, h } = MAP_SIZES[size];
      assert.equal(s.w, w);
      assert.equal(s.h, h);
      assert.equal(s.tiles.length, w * h);
      assert.equal(s.grid.length, w * h);
      assert.equal(s.doors.length, 6, `${design} ${size}`);
      const dist = getDist(s);
      const seen = new Set();
      for (const door of s.doors) {
        assert.equal(door.length, 2);
        for (const i of door) {
          assert.ok(!seen.has(i), `${design} ${size}: entrances overlap`);
          seen.add(i);
          const x = i % w, y = (i / w) | 0;
          assert.ok(x === 0 || y === 0 || y === h - 1, 'entrances are in the outer wall');
          assert.notEqual(dist[i], UNREACHABLE, `${design} ${size}: entrance at ${x},${y} cannot reach the tills`);
        }
      }
      assert.ok(s.tiles.includes('T'));
      // Most entrances are on the left wall; a few are on the top and bottom.
      const left = s.doors.filter((d) => d[0] % w === 0).length;
      assert.equal(left, 3);
      // Plenty of floor left to build on.
      const floor = [...s.tiles].filter((c) => c === '.').length;
      assert.ok(floor > w * h * 0.55, `${design} ${size}: only ${floor} floor tiles`);
    }
  }
});

test('map sizes step up by about half each time, and one is recommended per player count', () => {
  const area = (k) => MAP_SIZES[k].w * MAP_SIZES[k].h;
  let last = area('xs');
  for (let n = 1; n <= 6; n++) {
    const k = recommendedSize(n);
    assert.equal(MAP_SIZES[k].players, n);
    const ratio = area(k) / last;
    assert.ok(ratio > 1.4 && ratio < 1.6, `size for ${n} players is ${ratio.toFixed(2)} times the one before`);
    last = area(k);
  }
});

test('makeMap gives the same plan every time', () => {
  assert.deepEqual(makeMap('showroom', 'l'), makeMap('showroom', 'l'));
});

// ---------------------------------------------------------------- entrances

test('each player who joins opens another entrance', () => {
  const s = createGame({ map: { design: 'warehouse', size: 'm' } });
  const count = (ch) => [...s.tiles].filter((c) => c === ch).length;
  assert.equal(s.open, 1, 'one entrance is open before anyone joins');
  addPlayer(s, 'Dave');
  assert.equal(s.open, 1);
  assert.equal(count('D'), 2);
  assert.equal(count('d'), 10);
  addPlayer(s, 'Steve');
  addPlayer(s, 'Gaz');
  assert.equal(s.open, 3);
  assert.equal(count('D'), 6);
  // A player who drops out and comes back does not open another.
  setPlayerOnline(s, 1, false);
  assert.equal(addPlayer(s, 'Steve'), 1);
  assert.equal(s.open, 3);
});

test('shoppers come in through every open entrance', () => {
  const s = createGame({ seed: 4, map: { design: 'warehouse', size: 'm' } });
  for (const n of ['Dave', 'Steve', 'Gaz']) addPlayer(s, n);
  applyCommand(s, 0, { c: 'start' });
  const used = new Set();
  const seen = new Set();
  for (let i = 0; i < 40 * TICK_HZ; i++) {
    step(s);
    for (const sh of s.shoppers) {
      if (seen.has(sh.id)) continue;
      seen.add(sh.id);
      const tile = (sh.y | 0) * s.w + (sh.x | 0);
      used.add(s.doors.findIndex((d) => d.includes(tile)));
    }
  }
  assert.deepEqual([...used].sort(), [0, 1, 2]);
});

test('the maze may not wall off an entrance, even one that has not opened yet', () => {
  const s = createGame({ map: { design: 'warehouse', size: 's' } });
  addPlayer(s, 'Dave');
  s.players[0].cash = 100000;
  // The second entrance is in the top wall and still shut. Box it in.
  const [a, b] = s.doors[1];
  const ax = a % s.w, bx = b % s.w;
  assert.equal(s.tiles[a], 'd');
  assert.ok(place(s, 'crate', ax - 1, 1).ok);
  assert.ok(place(s, 'crate', bx + 1, 1).ok);
  assert.ok(place(s, 'crate', ax, 2).ok);
  assert.equal(canPlace(s, 'crate', bx, 2), 'blocked');
});

test('more players means more shoppers and more refunds allowed', () => {
  const total = (n, players) => waveSpec(n, players).reduce((sum, g) => sum + g.n, 0);
  assert.ok(total(5, 2) > total(5, 1) * 1.3);
  assert.ok(total(5, 6) > total(5, 2) * 1.5);
  const s = createGame();
  addPlayer(s, 'Dave');
  assert.equal(s.refundLimit, TUNE.refundLimit);
  addPlayer(s, 'Steve');
  assert.equal(s.refundLimit, TUNE.refundLimit + TUNE.refundPerPlayer);
});

// ---------------------------------------------------------------- money

test('each player has his own money and pays for his own buildings', () => {
  const s = createGame();
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  assert.equal(s.players[0].cash, TUNE.startCash);
  assert.equal(s.players[1].cash, TUNE.startCash);
  assert.ok(place(s, 'forklift', 5, 5, 0, 1).ok);
  assert.equal(s.players[0].cash, TUNE.startCash, 'Dave paid nothing');
  assert.equal(s.players[1].cash, TUNE.startCash - BUILD.forklift.cost);
  assert.equal(teamCash(s), 2 * TUNE.startCash - BUILD.forklift.cost);

  // A broke player cannot spend a rich player's money.
  s.players[1].cash = 3;
  assert.equal(canPlace(s, 'belt', 6, 6, 1), 'cash');
  assert.equal(canPlace(s, 'belt', 6, 6, 0), null);

  // Selling pays whoever bought it, whoever does the selling.
  assert.ok(applyCommand(s, 0, { c: 'remove', x: 5, y: 5 }).ok);
  assert.equal(s.players[0].cash, TUNE.startCash);
  assert.equal(s.players[1].cash, 3 + Math.floor(BUILD.forklift.cost * TUNE.sellBack));
});

test('sales, wave bonuses and refunds are split evenly between the players', () => {
  const s = createGame({ seed: 3 });
  for (const n of ['Dave', 'Steve', 'Gaz']) addPlayer(s, n);
  // Dave alone builds a line; everyone earns from it.
  place(s, 'unpacker', 3, 3, 0);
  place(s, 'belt', 4, 3, 0);
  place(s, 'chute', 5, 3);
  const before = s.players.map((p) => p.cash);
  let sales = 0;
  for (let i = 0; i < 20 * TICK_HZ; i++) sales += step(s).filter((e) => e.e === 'sale').length;
  assert.ok(sales >= 5);
  const share = (sales * ITEMS.box.value) / 3;
  for (const p of s.players) assert.ok(Math.abs(p.cash - before[p.id] - share) < 0.01, `${p.name} got a third`);

  // A wave with no defence: every refund is split three ways, and the bonus is paid to each.
  applyCommand(s, 0, { c: 'start' });
  const mid = s.players.map((p) => p.cash);
  let refunded = 0, earned = 0, bonus = 0;
  for (let i = 0; i < 120 * TICK_HZ; i++) {
    const ev = step(s);
    for (const e of ev) {
      if (e.e === 'escape') refunded += e.refund;
      if (e.e === 'sale') earned += e.v;
      if (e.e === 'waveEnd') bonus = e.bonus;
    }
    if (bonus) break;
  }
  assert.ok(refunded > 0 && bonus > 0);
  for (const p of s.players) {
    const want = mid[p.id] + (earned - refunded) / 3 + bonus;
    assert.ok(Math.abs(p.cash - want) < 0.05, `${p.name}: ${p.cash} vs ${want}`);
  }

  // A player who has dropped out neither earns nor pays.
  setPlayerOnline(s, 2, false);
  const gaz = s.players[2].cash, dave = s.players[0].cash;
  let more = 0;
  for (let i = 0; i < 10 * TICK_HZ; i++) more += step(s).filter((e) => e.e === 'sale').length;
  assert.equal(s.players[2].cash, gaz);
  assert.ok(Math.abs(s.players[0].cash - dave - (more * ITEMS.box.value) / 2) < 0.01);
});

test('a player can give money to another, but not more than he has', () => {
  const s = createGame();
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  assert.ok(applyCommand(s, 0, { c: 'give', to: 1, n: 200 }).ok);
  assert.equal(s.players[0].cash, TUNE.startCash - 200);
  assert.equal(s.players[1].cash, TUNE.startCash + 200);
  assert.equal(applyCommand(s, 0, { c: 'give', to: 1, n: 5000 }).why, 'cash');
  assert.equal(applyCommand(s, 0, { c: 'give', to: 0, n: 5 }).why, 'bad');
  assert.equal(applyCommand(s, 0, { c: 'give', to: 1, n: -5 }).why, 'bad');
  assert.equal(applyCommand(s, 0, { c: 'give', to: 9, n: 5 }).why, 'bad');
});

test('a player who joins late gets starting money plus something for the waves he missed', () => {
  const s = createGame();
  addPlayer(s, 'Dave');
  s.wave = 6;
  addPlayer(s, 'Steve');
  assert.equal(s.players[1].cash, TUNE.startCash + 6 * TUNE.joinCash);
});

// ---------------------------------------------------------------- upgrades

test('upgrades cost more each level and make a tower stronger', () => {
  const s = createGame();
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e9;
  place(s, 'forklift', 5, 5);
  const b = s.grid[at(5, 5)];
  let last = 0, spent = 0;
  const base = statsOf(b);
  for (let lv = 2; lv <= TUNE.maxLevel; lv++) {
    const cost = upgradeCost(b);
    assert.ok(cost > last * 1.5, `level ${lv} costs ${cost}, the one before ${last}`);
    last = cost;
    spent += cost;
    const cash = s.players[0].cash;
    assert.ok(applyCommand(s, 0, { c: 'upgrade', x: 5, y: 5 }).ok);
    assert.equal(s.players[0].cash, cash - cost);
    assert.equal(levelOf(b), lv);
  }
  assert.equal(upgradeCost(b), 0);
  assert.equal(canUpgrade(s, 5, 5), 'max');
  assert.equal(applyCommand(s, 0, { c: 'upgrade', x: 5, y: 5 }).why, 'max');
  const top = statsOf(b);
  assert.ok(top.dmg > base.dmg * 10);
  assert.ok(top.range > base.range);
  assert.ok(last > BUILD.forklift.cost * 50, 'the last level is very expensive');

  // Selling gives back the same share of everything spent on it.
  const cash = s.players[0].cash;
  applyCommand(s, 0, { c: 'remove', x: 5, y: 5 });
  assert.equal(s.players[0].cash, cash + Math.floor((BUILD.forklift.cost + spent) * TUNE.sellBack));
});

test('only security can be upgraded, and only with enough money', () => {
  const s = createGame();
  addPlayer(s, 'Dave');
  place(s, 'belt', 4, 4);
  place(s, 'sprinkler', 5, 5);
  assert.equal(canUpgrade(s, 4, 4), 'noup');
  assert.equal(canUpgrade(s, 9, 9), 'empty');
  assert.equal(canUpgrade(s, 5, 5), null);
  s.players[0].cash = 10;
  assert.equal(canUpgrade(s, 5, 5), 'cash');
  for (const k of ['sprinkler', 'forklift', 'wetfloor', 'samples']) assert.ok(BUILD[k].up, `${k} can be upgraded`);
});

test('an upgraded sprinkler stops shoppers a plain one lets through', () => {
  const run = (levels) => {
    const s = stage(9);
    place(s, 'sprinkler', 14, 6);
    for (let i = 0; i < levels; i++) assert.ok(applyCommand(s, 0, { c: 'upgrade', x: 14, y: 6 }).ok);
    send(s, [{ k: 'hunter', n: 6, gap: 1, at: 0 }]);
    return play(s, 90).filter((e) => e.e === 'left').length;
  };
  assert.equal(run(0), 0, 'one plain sprinkler stops nobody');
  assert.equal(run(5), 6, 'at level 6 it stops them all');
});

test('upgraded samples hold shoppers longer and an upgraded sign slows them more', () => {
  const s = stage();
  place(s, 'samples', 5, 5);
  place(s, 'wetfloor', 6, 6);
  const stand = s.grid[at(5, 5)], sign = s.grid[at(6, 6)];
  const a = statsOf(stand), b = statsOf(sign);
  applyCommand(s, 0, { c: 'upgrade', x: 5, y: 5 });
  applyCommand(s, 0, { c: 'upgrade', x: 6, y: 6 });
  assert.ok(statsOf(stand).secs > a.secs && statsOf(stand).range > a.range);
  assert.ok(statsOf(sign).slow < b.slow && statsOf(sign).slip > b.slip);
});

// ---------------------------------------------------------------- super shoppers

test('every shopper has a super version at least twice as strong', () => {
  for (const [k, def] of Object.entries(SHOPPERS)) {
    const sup = SUPERS[k];
    assert.ok(sup.hp >= def.hp * 2, `super ${k} has at least twice the patience`);
    assert.ok(sup.speed >= def.speed);
    assert.equal(sup.refund, def.refund * 2);
    assert.notEqual(sup.name, def.name);
  }
  assert.equal(SUPERS.karen.hp, SHOPPERS.karen.hp * 4, 'a super Karen has four times the patience');
  assert.ok(Math.abs(SUPERS.mom.chaseSpeed - TUNE.chaseSpeed * 3) < 1e-9, 'a super mom chases three times as fast');
});

test('supers arrive from the middle of the game and grow in number', () => {
  const supers = (n) => waveSpec(n).reduce((sum, g) => sum + g.sup, 0);
  for (let n = 1; n <= 5; n++) assert.equal(supers(n), 0, `no supers in wave ${n}`);
  assert.ok(supers(6) >= 1);
  assert.ok(supers(20) > supers(12) && supers(12) > supers(6));
  const kinds = new Set(waveSpec(20).filter((g) => g.sup > 0).map((g) => g.k));
  for (const k of Object.keys(SHOPPERS)) assert.ok(kinds.has(k), `wave 20 has a super ${k}`);

  // The game makes exactly as many as the wave asks for.
  const s = stage();
  send(s, [{ k: 'hunter', n: 10, gap: 0.2, at: 0, sup: 3 }]);
  const ids = new Map();
  play(s, 5, () => { for (const sh of s.shoppers) ids.set(sh.id, sh); });
  const made = [...ids.values()];
  assert.equal(made.length, 10);
  assert.equal(made.filter((sh) => sh.sup).length, 3);
  const plain = made.find((sh) => !sh.sup), sup = made.find((sh) => sh.sup);
  assert.equal(sup.mhp, plain.mhp * 3);
});

test('later waves have many more shoppers than the early growth alone would give', () => {
  const total = (n) => waveSpec(n).reduce((sum, g) => sum + g.n, 0);
  assert.equal(waveSpec(1)[0].n, 8, 'wave 1 is unchanged');
  assert.ok(total(20) > total(10) * 3);
});

test('a super shopper takes a double refund', () => {
  const s = createGame({ training: true });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1000;
  send(s, [{ k: 'karen', n: 1, gap: 1, at: 0, sup: 1 }]);
  const ev = play(s, 90);
  const out = ev.find((e) => e.e === 'escape');
  assert.equal(out.sup, 1);
  assert.equal(out.refund, SHOPPERS.karen.refund * 2);
  assert.equal(s.players[0].cash, 1000 - SHOPPERS.karen.refund * 2);
});

// ---------------------------------------------------------------- gym bro

/** A one-tile corridor along row 7, lined on both sides with one kind of building. */
function corridor(s, kind) {
  for (let x = 3; x <= 26; x++) { place(s, kind, x, 6); place(s, kind, x, 8); }
}

test('a gym bro wrecks things next to his route: crates always, other things sometimes', (t) => {
  const wrecked = (kind, seed) => {
    const s = stage(seed);
    corridor(s, kind);
    send(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
    const ev = play(s, 120).filter((e) => e.e === 'smash');
    for (const e of ev) {
      assert.equal(e.k, kind);
      assert.equal(s.grid[e.i], 0, 'what he wrecks is gone');
    }
    return ev.length;
  };
  let crates = 0, belts = 0;
  for (let seed = 1; seed <= 6; seed++) { crates += wrecked('crate', seed); belts += wrecked('belt', seed); }
  assert.ok(crates >= 6 * 6, `wrecked ${crates} crate stacks in six walks`);
  assert.ok(belts >= 3, `wrecked ${belts} belts in six walks`);
  assert.ok(crates > belts * 2, 'crates go far more often than other things');

  // The chance for other things is a tuning number: at zero he leaves them alone.
  tune(t, { smashOther: 0 });
  assert.equal(wrecked('belt', 3), 0);
});

test('a super gym bro wrecks far more than a normal one', () => {
  const wrecked = (sup) => {
    let n = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = stage(seed);
      corridor(s, 'belt');
      send(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0, sup }]);
      n += play(s, 120).filter((e) => e.e === 'smash').length;
    }
    return n;
  };
  const normal = wrecked(0), big = wrecked(1);
  assert.ok(big >= normal * 2 && big >= 18, `super wrecked ${big}, normal ${normal}`);
});

test('an upgraded tower loses a level instead of being wrecked', (t) => {
  tune(t, { smashOther: 1 });
  const s = stage(3);
  for (let x = 3; x <= 26; x++) { place(s, 'sprinkler', x, 6); place(s, 'sprinkler', x, 8); }
  for (let x = 3; x <= 26; x++) for (const y of [6, 8]) for (let n = 0; n < 2; n++) applyCommand(s, 0, { c: 'upgrade', x, y });
  // Shoppers in training keep their starting patience, so give this one enough to get through.
  send(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
  step(s);
  s.shoppers[0].hp = s.shoppers[0].mhp = 1e9;
  const ev = [];
  for (let i = 0; i < 20 * TICK_HZ; i++) ev.push(...step(s).filter((e) => e.e === 'smash'));
  assert.ok(ev.length >= 5);
  assert.ok(ev.every((e) => e.down === 1), 'every hit only knocked a level off');
  let lower = 0;
  for (let x = 3; x <= 26; x++) for (const y of [6, 8]) {
    const b = s.grid[at(x, y)];
    assert.ok(b, 'nothing was destroyed');
    if (levelOf(b) < 3) lower++;
  }
  assert.ok(lower >= 3);
  assert.equal(s.rubble.length, 0);
});

test('what a gym bro wrecks can be rebuilt in one go by its owner', () => {
  const s = stage(2);
  addPlayer(s, 'Steve');
  s.players[1].cash = 1000;
  for (let x = 3; x <= 14; x++) for (const y of [6, 8]) place(s, 'crate', x, y, 0, x <= 8 ? 0 : 1);
  send(s, [{ k: 'gymbro', n: 1, gap: 1, at: 0 }]);
  play(s, 120);
  const mine = s.rubble.filter((r) => r[3] === 0).length, his = s.rubble.filter((r) => r[3] === 1).length;
  assert.ok(mine >= 2 && his >= 2, `rubble: ${mine} of Dave's, ${his} of Steve's`);

  // Building on a wrecked tile by hand clears that bit of rubble.
  const [tile] = s.rubble.find((r) => r[3] === 0);
  assert.ok(place(s, 'crate', tile % 30, (tile / 30) | 0).ok);
  assert.equal(s.rubble.filter((r) => r[3] === 0).length, mine - 1);

  // Rebuilding puts back only your own, and you pay for it.
  const cash = s.players[0].cash;
  const r = applyCommand(s, 0, { c: 'rebuild' });
  assert.ok(r.ok);
  assert.equal(r.n, mine - 1);
  assert.equal(s.players[0].cash, cash - (mine - 1) * BUILD.crate.cost);
  assert.equal(s.rubble.length, his);
  for (let x = 3; x <= 14; x++) assert.equal(s.grid[at(x, 6)].k, 'crate');
  assert.equal(applyCommand(s, 0, { c: 'rebuild' }).why, 'empty', 'nothing left of his to rebuild');

  // A player with no money gets nothing rebuilt and is told why.
  s.players[1].cash = 0;
  assert.equal(applyCommand(s, 1, { c: 'rebuild' }).why, 'cash');
  s.players[1].cash = 1000;
  assert.equal(applyCommand(s, 1, { c: 'rebuild' }).n, his);
  assert.equal(s.rubble.length, 0);
});

// ---------------------------------------------------------------- mom and kid

/** A wall of crates down column 12 with one gap at the bottom, so the walking route is long. */
function longWayRound(s) {
  for (let y = 1; y <= 13; y++) assert.ok(place(s, 'crate', 12, y).ok);
}

test('a runaway child runs straight through the maze and waits further along the route', (t) => {
  tune(t, { kidChance: 100, kidMin: 6, kidMax: 6 }); // escapes at once, runs six tiles
  const s = stage(6);
  longWayRound(s);
  send(s, [{ k: 'mom', n: 1, gap: 1, at: 0 }]);
  let mom = null, throughWall = false, waitedAt = null, momDistThen = 0;
  const ev = play(s, 120, () => {
    mom = s.shoppers[0] || mom;
    if (!mom || !mom.kd) return;
    const tile = (mom.ky | 0) * s.w + (mom.kx | 0);
    if (s.grid[tile] && s.grid[tile].k === 'crate') throughWall = true;
    if (mom.kd === 2 && waitedAt === null) {
      waitedAt = tile;
      momDistThen = getDist(s)[(mom.y | 0) * s.w + (mom.x | 0)];
    }
  });
  assert.ok(ev.some((e) => e.e === 'kid'));
  assert.ok(throughWall, 'the child went through the crate wall');
  assert.notEqual(waitedAt, null);
  assert.equal(s.grid[waitedAt], 0, 'he waits on open floor');
  assert.ok(getDist(s)[waitedAt] < momDistThen, 'at a spot nearer the tills than his mother is');
  assert.ok(ev.some((e) => e.e === 'caught'), 'she catches him');
  for (let y = 1; y <= 13; y++) assert.equal(s.grid[at(12, y)].k, 'crate', 'the wall is untouched');
});

test('chasing her child gets a mom through the maze sooner; a super mom much sooner', (t) => {
  const cross = (kidChance, sup = 0) => {
    const old = TUNE.kidChance;
    TUNE.kidChance = kidChance;
    try {
      const s = stage(6);
      longWayRound(s);
      send(s, [{ k: 'mom', n: 1, gap: 1, at: 0, sup }]);
      const ev = play(s, 200);
      assert.equal(ev.filter((e) => e.e === 'escape').length, 1);
      return s.tick;
    } finally { TUNE.kidChance = old; }
  };
  const calm = cross(0), chasing = cross(100);
  assert.ok(chasing < calm * 0.9, `chasing ${chasing} ticks, calm ${calm}`);
  // (The super mom's child has his own escape chance, so the tuning above does not apply to her.)
  const superMom = cross(100, 1);
  assert.ok(superMom < chasing * 0.75, `super ${superMom} ticks, normal ${chasing}`);
});

test('building on a waiting child sends him running again instead of stranding his mother', (t) => {
  tune(t, { kidChance: 100, kidMin: 4, kidMax: 4 });
  const s = stage(6);
  send(s, [{ k: 'mom', n: 1, gap: 1, at: 0 }]);
  let done = false;
  const ev = play(s, 120, () => {
    const mom = s.shoppers[0];
    if (done || !mom || mom.kd !== 2) return;
    const x = mom.kx | 0, y = mom.ky | 0;
    if (canPlace(s, 'crate', x, y) === null) { place(s, 'crate', x, y); done = true; }
  });
  assert.ok(done, 'a crate was put on the child');
  assert.equal(ev.filter((e) => e.e === 'escape').length, 1, 'she still gets through');
});

test('a game with everything in it stays identical on a copy made mid-wave', () => {
  const make = () => {
    const g = createGame({ seed: 21, map: { design: 'showroom', size: 'm' } });
    addPlayer(g, 'Dave');
    addPlayer(g, 'Steve');
    for (const p of g.players) p.cash = 100000;
    for (let x = 6; x <= 30; x += 4) {
      place(g, 'crate', x, 5); place(g, 'belt', x, 6); place(g, 'sprinkler', x, 12, 0, 1);
      place(g, 'samples', x + 1, 15, 0, 1); place(g, 'wetfloor', x + 2, 11, 0, 1);
      applyCommand(g, 1, { c: 'upgrade', x, y: 12 });
    }
    g.wave = 14;
    applyCommand(g, 0, { c: 'start' });
    return g;
  };
  const a = make();
  const seen = new Set();
  for (let i = 0; i < 30 * TICK_HZ; i++) for (const e of step(a)) seen.add(e.e);
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 40 * TICK_HZ; i++) { for (const e of step(a)) seen.add(e.e); step(b); }
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.shoppers.some((s) => s.sup) || seen.has('escape'));
  for (const e of ['kid', 'smash', 'mess', 'spray']) assert.ok(seen.has(e), `saw ${e}`);
});
