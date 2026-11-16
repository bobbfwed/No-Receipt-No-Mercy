// Tests that README.md's generated parts (version, stores, shoppers) match the game, and that
// the handbook's numbers come out of the rules correctly. Run with: node --test
// If the first test fails, run: node tools/readme.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fill, generated, pictures } from '../tools/readme.mjs';
import { versionText } from '../src/version.js';
import {
  createGame, addPlayer, applyCommand, step, queueTrainingWave, SHOPPERS, SUPERS, BUILD, TUNE, MAP_DESIGNS,
} from '../src/sim/index.js';
import {
  SHOPPER_ORDER, FACTORY_ORDER, SECURITY_ORDER, shopperFacts, shopperTraits, patienceAt, firstWave, countIn,
  sampleWaves, levelRows, factoryFacts,
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
  // Every picture the README shows is in the repository.
  for (const [file] of pictures()) assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), `${file} is missing: run "node tools/readme.mjs --shots"`);
  for (const m of readme.matchAll(/\]\((docs\/img\/[^)]+)\)/g)) assert.ok(fs.existsSync(new URL(`../${m[1]}`, import.meta.url)), m[1]);
  assert.equal(Object.keys(generated()).length, 3);
});

test('the handbook covers every shopper and building, with help text for each', () => {
  assert.deepEqual([...SHOPPER_ORDER].sort(), Object.keys(SHOPPERS).sort());
  assert.deepEqual([...FACTORY_ORDER, ...SECURITY_ORDER].sort(), Object.keys(BUILD).sort());
  assert.deepEqual(SHOPPER_ORDER.map(firstWave), [...SHOPPER_ORDER.map(firstWave)].sort((a, b) => a - b), 'listed in the order they first appear');
  for (const k of SHOPPER_ORDER) {
    assert.ok(SHOPPER_HELP[k] && SUPER_HELP[k], `help for ${k}`);
    const f = shopperFacts(k);
    assert.ok(f.first >= 1 && f.superFrom >= f.first && f.superHp >= f.hp * 2 && f.superPrice > f.price);
    assert.ok(shopperTraits(k, 0).length >= 2);
  }
  for (const k of [...FACTORY_ORDER, ...SECURITY_ORDER]) assert.ok(HOW[k], `help for ${k}`);
  for (const k of FACTORY_ORDER) assert.ok(factoryFacts(k).length >= 3);
  assert.deepEqual(sampleWaves(20), [1, 5, 10, 15, 20]);
  assert.deepEqual(sampleWaves(10), [1, 5, 10]);
  assert.deepEqual(sampleWaves(30), [1, 5, 10, 15, 20, 25, 30]);
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
    const mul = { easy: 0.75, normal: 1, hard: 1.3, brutal: 1.65 }[difficulty];
    assert.ok(Math.abs(seen.mhp - patienceAt(k, sup, wave, mul)) < 1e-6, `${k} wave ${wave} ${difficulty}: ${seen.mhp} vs ${patienceAt(k, sup, wave, mul)}`);
  }
  // And the head-counts are the wave's.
  const c = countIn('dad', 12, 1);
  assert.ok(c.all > 0 && c.sup > 0 && c.sup < c.all);
  assert.deepEqual(countIn('karen', 2, 1), { all: 0, sup: 0 });
});

test('the upgrade table matches what upgrading really costs and does', () => {
  for (const k of SECURITY_ORDER) {
    const rows = levelRows(k);
    assert.equal(rows.length, TUNE.maxLevel);
    const s = createGame({ training: true });
    addPlayer(s, 'Dave');
    s.players[0].cash = 1e9;
    applyCommand(s, 0, { c: 'place', k, x: 5, y: 5 });
    let spent = BUILD[k].cost;
    for (const row of rows) {
      assert.equal(row.total, spent, `${k} level ${row.lv}: spent in all`);
      if (row.lv === TUNE.maxLevel) { assert.equal(row.next, 0); break; }
      const before = s.players[0].cash;
      assert.ok(applyCommand(s, 0, { c: 'upgrade', x: 5, y: 5 }).ok);
      assert.equal(before - s.players[0].cash, row.next, `${k} level ${row.lv}: cost of the next level`);
      spent += row.next;
    }
  }
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
