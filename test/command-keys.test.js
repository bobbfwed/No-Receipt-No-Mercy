// Tests that a command naming '__proto__', 'constructor' and the like, in any field the rules look
// something up by, is refused and changes nothing. A client may send anything.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, applyCommand, canPlace, canPlaceBack, buildDef, cleanSettings } from '../src/sim/index.js';

const NAMES = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];

/** A game under way (build phase, something placed), two players with money. */
function game() {
  const s = createGame({ map: { design: 'warehouse', size: 's' } });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 5, y: 5 }).ok, true);
  assert.equal(applyCommand(s, 0, { c: 'place', k: 'conv', x: 6, y: 6, d: 0, f: 1 }).ok, true);
  return s;
}

/** Sends cmd and checks it was refused and nothing changed; cash stays a real number. */
function refused(s, cmd, pid = 0) {
  const before = JSON.stringify(s);
  const r = applyCommand(s, pid, cmd);
  assert.equal(r.ok, false, `${JSON.stringify(cmd)} refused`);
  assert.equal(JSON.stringify(s), before, `${JSON.stringify(cmd)} changed nothing`);
  for (const p of s.players) assert.ok(Number.isFinite(p.cash));
  assert.equal({}.cash, undefined, 'nothing leaked onto every object');
  assert.equal([].cash, undefined, 'nothing leaked onto every array');
}

test('a building kind is only ever a real kind', () => {
  const s = game();
  for (const k of NAMES) {
    assert.equal(buildDef(k), null);
    assert.equal(canPlace(s, k, 8, 8, 0), 'kind');
    assert.equal(canPlaceBack(s, k, 8, 8, 0), 'kind');
    refused(s, { c: 'place', k, x: 8, y: 8, d: 0 });
    refused(s, { c: 'place', k, x: 8, y: 8, d: 0, f: 1 });
  }
  refused(s, { c: 'place', k: { toString: () => 'crate' }, x: 8, y: 8 });
});

test('a player to give to, a command name, the floor flag: only real ones', () => {
  const s = game();
  for (const to of [...NAMES, '1', 1.5, -1, null]) refused(s, { c: 'give', to, n: 10 });
  for (const c of NAMES) refused(s, { c });
  for (const f of [...NAMES, 2, '1']) refused(s, { c: 'place', k: 'conv', x: 9, y: 9, f });
  for (const role of NAMES) refused(s, { c: 'role', role });
  for (const n of NAMES) refused(s, { c: 'speed', n });
  for (const side of NAMES) refused(s, { c: 'side', side });
  for (const pid of NAMES) assert.equal(applyCommand(s, pid, { c: 'speed', n: 2 }).ok, false);
  // Head Office's plan names shopper kinds.
  assert.equal(applyCommand(s, 1, { c: 'side', side: 'office' }).ok, true);
  for (const k of NAMES) refused(s, { c: 'plan', groups: [{ k, n: 1, at: 0, door: 0 }] }, 1);
});

test('in the lobby: a store design and size, and the settings, only real ones', () => {
  const s = createGame({ lobby: true, map: { design: 'warehouse', size: 's' } });
  addPlayer(s, 'Dave');
  for (const x of NAMES) {
    refused(s, { c: 'map', design: x, size: 's' });
    refused(s, { c: 'map', design: 'warehouse', size: x });
  }
  // Settings left as they were where a value is not on the list (as for any unknown value: the
  // command itself is a yes, like any other settings change, and puts everyone back to not ready).
  for (const x of NAMES) {
    const r = applyCommand(s, 0, { c: 'settings', difficulty: x, waves: x, startCash: x });
    assert.equal(r.ok, true);
    assert.equal(s.difficulty, 'normal');
    assert.ok(Number.isFinite(s.startCash) && Number.isFinite(s.waves));
    assert.ok(Number.isFinite(s.players[0].cash));
    assert.equal(cleanSettings({ difficulty: x }).difficulty, 'normal');
  }
});
