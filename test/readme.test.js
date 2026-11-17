// Tests that README.md's generated parts (version, stores, shoppers) match the game, and that
// the handbook's numbers come out of the rules correctly. Run with: node --test
// If the first test fails, run: node tools/readme.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fill, generated, pictures } from '../tools/readme.mjs';
import { versionText } from '../src/version.js';
import {
  createGame, addPlayer, applyCommand, step, queueTrainingWave, statsOf, tracksOf, SHOPPERS, SUPERS, BUILD, TUNE, MAP_DESIGNS, SETTINGS, BOSS,
} from '../src/sim/index.js';
import {
  SHOPPER_ORDER, FACTORY_ORDER, SECURITY_ORDER, shopperFacts, shopperTraits, patienceAt, firstWave, countIn,
  sampleWaves, levelRows, trackRows, factoryFacts,
} from '../src/content/facts.js';
import { HOW, SHOPPER_HELP, SUPER_HELP } from '../src/content/help.js';

test('README.md shows the current version, every store design and every shopper', () => {
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.equal(fill(readme), readme, 'README.md is out of date: run "node tools/readme.mjs"');
  assert.ok(readme.includes(`Version ${versionText()}`));
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
  assert.equal(Object.keys(generated()).length, 3);
});

test('the handbook covers every shopper and building', () => {
  assert.deepEqual([...SHOPPER_ORDER].sort(), Object.keys(SHOPPERS).sort());
  assert.deepEqual([...FACTORY_ORDER, ...SECURITY_ORDER].sort(), Object.keys(BUILD).sort());
  assert.deepEqual(SHOPPER_ORDER.map(firstWave), [...SHOPPER_ORDER.map(firstWave)].sort((a, b) => a - b), 'listed in the order they first appear');
  for (const k of SHOPPER_ORDER) {
    const f = shopperFacts(k);
    assert.ok(f.first >= 1 && f.superFrom >= f.first && f.superHp >= f.hp * 2 && f.superPrice > f.price);
    assert.ok(shopperTraits(k, 0).length >= 2);
    assert.ok(shopperTraits(k, 0).some(([label]) => label === 'TV Salesman'), `${k}: what the salesman does to him`);
  }
  for (const k of FACTORY_ORDER) assert.ok(factoryFacts(k).length >= 3);
  assert.deepEqual(sampleWaves(20), [1, 5, 10, 15, 20]);
  assert.deepEqual(sampleWaves(10), [1, 5, 10]);
  assert.deepEqual(sampleWaves(30), [1, 5, 10, 15, 20, 25, 30]);
  assert.deepEqual(sampleWaves(0), [1, 5, 10, 20, 30, 40], 'an endless game has no last one to stop at');
});

test('every shopper and building has help text', () => {
  for (const k of SHOPPER_ORDER) assert.ok(SHOPPER_HELP[k] && SUPER_HELP[k], `help for ${k}`);
  for (const k of [...FACTORY_ORDER, ...SECURITY_ORDER]) assert.ok(HOW[k], `help for ${k}`);
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

test('the upgrade tables match what upgrading really costs and does, track by track', () => {
  let tables = 0;
  for (const k of [...SECURITY_ORDER, ...FACTORY_ORDER]) {
    for (const t of ['dmg', 'spd', 'rng', 'dur']) {
      const rows = trackRows(k, t);
      if (!tracksOf(k).includes(t)) { assert.deepEqual(rows, []); continue; }
      tables++;
      const s = createGame({ training: true });
      addPlayer(s, 'Dave');
      s.players[0].cash = 1e9;
      // (Factory machines go anywhere on this map: it has no marked floor.)
      assert.ok(applyCommand(s, 0, { c: 'place', k, x: 5, y: 5 }).ok);
      const b = s.grid[5 * s.w + 5];
      let spent = 0;
      for (const row of rows) {
        if (row.lv > 0) {
          const before = s.players[0].cash;
          assert.ok(applyCommand(s, 0, { c: 'upgrade', x: 5, y: 5, t }).ok, `${k} ${t} level ${row.lv}`);
          assert.equal(before - s.players[0].cash, row.cost, `${k} ${t} level ${row.lv}: what it cost`);
          spent += row.cost;
        }
        assert.equal(row.total, spent, `${k} ${t} level ${row.lv}: spent on the track`);
        // The numbers in the row are the building's real numbers.
        const st = statsOf(b);
        for (const [key, v] of Object.entries(row)) if (key in st) assert.ok(Math.abs(st[key] - v) < 1e-9, `${k} ${t} level ${row.lv}: ${key}`);
      }
      assert.equal(applyCommand(s, 0, { c: 'upgrade', x: 5, y: 5, t }).why, 'max', `${k} ${t}: the table ends at the top level`);
    }
  }
  assert.ok(tables >= 20);
  // The old single table still loads: the default track, numbered from level 1.
  const old = levelRows('sprinkler');
  assert.equal(old[0].lv, 1);
  assert.equal(old[0].total, BUILD.sprinkler.cost);
  assert.equal(old[0].next, trackRows('sprinkler', 'dmg')[1].cost);
  // A level-1 forklift takes exactly its "Hit" off a shopper.
  const s = createGame({ training: true });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e6;
  applyCommand(s, 0, { c: 'place', k: 'forklift', x: 3, y: 5 });
  queueTrainingWave(s, [{ k: 'karen', n: 1, gap: 1, at: 0 }]);
  applyCommand(s, 0, { c: 'start' });
  let hit = 0;
  for (let i = 0; i < 300 && !hit; i++) { step(s); const sh = s.shoppers[0]; if (sh && sh.hp < sh.mhp) hit = sh.mhp - sh.hp; }
  assert.ok(Math.abs(hit - levelRows('forklift')[0].dmg) < 1e-6);
});
