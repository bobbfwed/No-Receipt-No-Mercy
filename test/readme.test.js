// Tests that README.md's generated parts (version, stores, shoppers) match the game, and that
// the handbook's numbers come out of the rules correctly. Run with: node --test
// If the first test fails, run: node tools/readme.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fill, generated, pictures } from '../tools/readme.mjs';
import { versionText } from '../src/version.js';
import {
  createGame, addPlayer, applyCommand, step, queueTrainingWave, statsOf, tracksOf, levelIn, itemCode, addStock, takesSupply, usesIn, SHOPPERS, SUPERS, BUILD, SHOP_KINDS, TUNE, MAP_DESIGNS, SETTINGS, BOSS,
  BACK, TICK_HZ, makeTicks, rebrandTicks, dropUpCost, reinforceCost,
} from '../src/sim/index.js';
import {
  SHOPPER_ORDER, WALL_ORDER, SECURITY_ORDER, BACK_ORDER, shopperFacts, shopperTraits, patienceAt, firstWave, countIn,
  sampleWaves, bossWaves, LONGEST, tierRows, crateFacts, backFacts, supplyFacts, tierFacts, unitFacts, wireText, reinforceText,
} from '../src/content/facts.js';
import { SUPPLIES, junkPerMinute } from '../src/content/supplies.js';
import { HOW, BACK_HOW, SHOPPER_HELP, SUPER_HELP } from '../src/content/help.js';

test('README.md shows the current version, every store design, The Back and every shopper', () => {
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.equal(fill(readme), readme, 'README.md is out of date: run "node tools/readme.mjs"');
  assert.ok(readme.includes(`Play version ${versionText()} now: https://`));
  // The play link opens the README once, not twice in a row.
  assert.equal(readme.split('\n').slice(0, 12).join('\n').match(/https:\/\/bobbfwed\.github\.io/g).length, 1);
  for (const d of Object.values(MAP_DESIGNS)) assert.ok(readme.includes(`### ${d.name}`), d.name);
  for (const k of Object.keys(SHOPPERS)) {
    assert.ok(readme.includes(`**${SHOPPERS[k].name}**`), SHOPPERS[k].name);
    assert.ok(readme.includes(SUPERS[k].name), SUPERS[k].name);
  }
  // The boss is not one of SHOPPERS, but he is in the list, with every title he goes by.
  assert.ok(readme.includes(`**${BOSS.name}** (the boss)`));
  for (const t of BOSS.titles) assert.ok(readme.includes(t), t);
  assert.ok(readme.includes('docs/img/shopper-boss.png'));
  // Every picture the README shows is in the repository.
  for (const [file] of pictures()) assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), `${file} is missing: run "node tools/readme.mjs --shots"`);
  for (const m of readme.matchAll(/\]\((docs\/img\/[^)]+)\)/g)) assert.ok(fs.existsSync(new URL(`../${m[1]}`, import.meta.url)), m[1]);
  // The Back (0.4): every part and every supply, by name.
  for (const k of BACK_ORDER) assert.ok(readme.includes(`**${BUILD[k].name}**`), BUILD[k].name);
  for (const s of Object.values(SUPPLIES)) assert.ok(readme.includes(`**${s.name}**`), s.name);
  assert.equal(Object.keys(generated()).length, 4);
});

test('the handbook covers every shopper and building, on both floors', () => {
  assert.deepEqual([...SHOPPER_ORDER].sort(), Object.keys(SHOPPERS).sort());
  assert.deepEqual([...WALL_ORDER, ...SECURITY_ORDER].sort(), [...SHOP_KINDS].sort());
  assert.deepEqual([...BACK_ORDER].sort(), Object.keys(BUILD).filter((k) => BUILD[k].back).sort(), 'every part of The Back');
  assert.deepEqual(SHOPPER_ORDER.map(firstWave), [...SHOPPER_ORDER.map(firstWave)].sort((a, b) => a - b), 'listed in the order they first appear');
  for (const k of SHOPPER_ORDER) {
    const f = shopperFacts(k);
    assert.ok(f.first >= 1 && f.superFrom >= f.first && f.superHp >= f.hp * 2);
    // (Head Office cannot buy a Card Trader: he has no price at all.)
    assert.ok(f.releaseOnly ? f.price === 0 && f.superPrice === 0 : f.superPrice > f.price, k);
    assert.ok(shopperTraits(k, 0).length >= 2);
    assert.ok(shopperTraits(k, 0).some(([label]) => label === 'TV Salesman'), `${k}: what the salesman does to him`);
  }
  assert.ok(crateFacts().length >= 2);
  for (const k of BACK_ORDER) assert.ok(backFacts(k).length >= 2, k);
  // Every game length shows up to the longest the length drop-down offers (taken from SETTINGS);
  // an endless game goes further.
  const longest = Math.max(...SETTINGS.waves.filter((n) => n > 0));
  assert.equal(LONGEST, longest);
  for (const waves of SETTINGS.waves) {
    const sample = sampleWaves(waves);
    if (waves > 0) {
      assert.equal(sample[sample.length - 1], longest, `a ${waves}-event game's handbook reaches event ${longest}`);
      assert.equal(bossWaves(waves).at(-1), Math.floor(longest / TUNE.bossEvery) * TUNE.bossEvery);
    } else {
      assert.ok(sample.at(-1) > longest && bossWaves(waves).at(-1) > longest, 'an endless game goes further');
    }
    assert.ok(sample.length <= 7, 'the table stays readable');
  }
  assert.deepEqual(sampleWaves(10), [1, 5, 10, 15, 20, 25, 30]);
  assert.deepEqual(sampleWaves(30), [1, 5, 10, 15, 20, 25, 30]);
  assert.deepEqual(sampleWaves(0), [1, 5, 10, 20, 30, 40], 'an endless game has no last one to stop at');
});

test('every shopper and building has help text', () => {
  for (const k of SHOPPER_ORDER) assert.ok(SHOPPER_HELP[k] && SUPER_HELP[k], `help for ${k}`);
  for (const k of [...WALL_ORDER, ...SECURITY_ORDER]) assert.ok(HOW[k], `help for ${k}`);
  for (const k of BACK_ORDER) assert.ok(BACK_HOW[k] && BACK_HOW[k].does && BACK_HOW[k].use, `help for ${k}`);
});

test('the patience the handbook quotes is the patience shoppers really walk in with', () => {
  for (const [k, sup, wave, difficulty] of [['hunter', 0, 1, 'normal'], ['karen', 0, 10, 'hard'], ['dad', 1, 14, 'easy'], ['mom', 1, 20, 'brutal']]) {
    const s = createGame({ seed: 4, settings: { difficulty } });
    addPlayer(s, 'Dave');
    // Put one of them at the head of the wave, as Head Office would.
    s.wave = wave - 1;
    s.office = null;
    applyCommand(s, 0, { c: 'start' });
    s.spawnQ = [[s.tick + 1, k, sup, -1]];
    s.shoppers = [];
    let seen = null;
    for (let i = 0; i < 10 && !seen; i++) { step(s); seen = s.shoppers.find((sh) => sh.k === k); }
    const mul = SETTINGS.difficulty[difficulty].hp;
    assert.ok(Math.abs(seen.mhp - patienceAt(k, sup, wave, mul)) < 1e-6, `${k} wave ${wave} ${difficulty}: ${seen.mhp} vs ${patienceAt(k, sup, wave, mul)}`);
  }
  // And the head-counts are the wave's.
  const c = countIn('dad', 12, 1);
  assert.ok(c.all > 0 && c.sup > 0 && c.sup < c.all);
  assert.deepEqual(countIn('karen', 2, 1), { all: 0, sup: 0 });
});

test('the supply tables match what each tier of stock really does, track by track', () => {
  let tables = 0;
  for (const k of [...SECURITY_ORDER, ...WALL_ORDER]) {
    for (const t of ['dmg', 'spd', 'rng', 'dur']) {
      const rows = tierRows(k, t);
      if (!tracksOf(k).includes(t)) { assert.deepEqual(rows, []); continue; }
      tables++;
      assert.deepEqual(rows.map((r) => r.tier), [0, 1, 2, 3, 4], `${k} ${t}: as built, then every tier`);
      const s = createGame({ training: true });
      addPlayer(s, 'Dave');
      s.players[0].cash = 1e9;
      assert.ok(applyCommand(s, 0, { c: 'place', k, x: 5, y: 5 }).ok);
      const b = s.grid[5 * s.w + 5];
      for (const row of rows) {
        // One unit of that tier of the track's supply, sent up the building's Dumbwaiter.
        delete b.s;
        if (row.tier) {
          const code = itemCode(SUPPLIES[t].type, row.tier);
          assert.ok(takesSupply(b, code), `${k} takes ${t} tier ${row.tier}`);
          addStock(b, code);
        }
        assert.equal(usesIn(b, t), row.uses, `${k} ${t} tier ${row.tier}: what one unit lasts`);
        // The numbers in the row are the building's real numbers.
        const st = statsOf(b);
        for (const [key, v] of Object.entries(row)) if (key in st) assert.ok(Math.abs(st[key] - v) < 1e-9, `${k} ${t} tier ${row.tier}: ${key}`);
        if (t !== 'dur') assert.equal(levelIn(b, t), row.level, `${k} ${t} tier ${row.tier}: the levels it counts as`);
      }
    }
  }
  assert.ok(tables >= 18);
  // An unstocked forklift takes exactly its "Hit" as built off a shopper, and one on Store Brand
  // Bottled Spite exactly that tier's.
  for (const tier of [0, 1]) {
    const s = createGame({ training: true });
    addPlayer(s, 'Dave');
    s.players[0].cash = 1e6;
    applyCommand(s, 0, { c: 'place', k: 'forklift', x: 3, y: 5 });
    if (tier) addStock(s.grid[5 * s.w + 3], itemCode(SUPPLIES.dmg.type, tier));
    queueTrainingWave(s, [{ k: 'karen', n: 1, gap: 1, at: 0 }]);
    applyCommand(s, 0, { c: 'start' });
    let hit = 0;
    for (let i = 0; i < 300 && !hit; i++) { step(s); const sh = s.shoppers[0]; if (sh && sh.hp < sh.mhp) hit = sh.mhp - sh.hp; }
    assert.ok(Math.abs(hit - tierRows('forklift', 'dmg')[tier].dmg) < 1e-6, `tier ${tier}`);
  }
});

test("The Back's numbers in the handbook are the rules' own (0.4)", () => {
  const plain = createGame({ seed: 1 });
  const find = (k, label) => backFacts(k).find(([l]) => l === label)?.[1] || '';
  // A belt: its speed and how many items a tile holds.
  assert.ok(find('conv', 'Carries').startsWith(`${(BACK.step * TICK_HZ) / BACK.sub} tiles a second, ${Math.floor(BACK.sub / BACK.gap)} items`));
  // A machine's time, the Rebrander's for each tier, and the Returns Drop's rate and prices.
  const t = makeTicks(plain) / TICK_HZ;
  for (const k of ['still', 'cannery', 'spooler', 'winder', 'bender']) assert.ok(find(k, 'Makes').includes(`every ${t} s`), k);
  for (const tier of [1, 2, 3]) assert.ok(find('rebrand', 'Raises').includes(`in ${rebrandTicks(plain, tier) / TICK_HZ} s`), `tier ${tier}`);
  assert.ok(find('drop', 'Junk').startsWith(String(junkPerMinute(0))));
  for (let lv = 0; lv < BACK.dropUpMax; lv++) assert.ok(find('drop', 'MORE JUNK').includes(`$${dropUpCost(lv).toLocaleString('en-US')} (${junkPerMinute(lv + 1)} a minute)`), `level ${lv + 1}`);
  // The supplies: one each, made by the machine whose supply it is, taken by the buildings that take it.
  const sup = supplyFacts();
  assert.deepEqual(sup.map((s) => s.name), Object.values(SUPPLIES).map((s) => s.name));
  for (const s of sup) {
    const maker = Object.keys(BUILD).find((k) => BUILD[k].name === s.maker);
    assert.equal(BUILD[maker].supply, SUPPLIES[s.track].type, s.name);
    for (const name of s.takers) {
      const k = SECURITY_ORDER.find((c) => BUILD[c].name === name);
      const b = { k };
      assert.ok(takesSupply(b, itemCode(SUPPLIES[s.track].type, 1)), `${name} takes ${s.name}`);
    }
  }
  // Razor Wire works since 0.4's dads stage: its rule in words carries the rules' numbers.
  const wt = wireText();
  assert.ok(wt.includes(`the ${BACK.wireReach} tiles beyond`), wt);
  for (const n of BACK.wireTurns.slice(1)) assert.ok(wt.includes(String(n)), `${n} in: ${wt}`);
  // So does reinforcing a Crate Stack (0.4): every price, from the rules.
  const rt = reinforceText();
  for (let r = 0; r < BUILD.crate.reinforce.max; r++) assert.ok(rt.includes(`${reinforceCost({ k: 'crate', r })}`), rt);
  // The tiers: the levels, the tape and wire uses, the bin's pay.
  const tiers = tierFacts();
  assert.deepEqual(tiers.map((r) => r.level), BACK.tierLevel.slice(1));
  assert.deepEqual(tiers.map((r) => r.tape), BACK.tapeHits.slice(1));
  assert.deepEqual(tiers.map((r) => r.wire), BACK.wireTurns.slice(1));
  assert.deepEqual(tiers.map((r) => r.bin), BACK.binPay.slice(1));
  assert.deepEqual(unitFacts().map((u) => u.uses), SECURITY_ORDER.map((k) => BUILD[k].shots));
});
