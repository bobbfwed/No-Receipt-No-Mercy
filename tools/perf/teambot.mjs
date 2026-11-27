// A scripted TEAM of players for the perf tools (stutter investigation, 2026-11-26; 0.4 rules).
// The shop floor is the "keen" bot of tools/balance.mjs (walls of Crate Stacks ten tiles apart
// with the gap at alternate ends, security round each gap, then forklifts on a loose grid), each
// purchase made by whichever connected store player has the most cash. Once the first security is
// up, it also lays a supply line in The Back from every Returns Drop to the nearest Dumbwaiter
// (backchain.mjs), so the state carries belts, items and stock as a real 0.4 game does. Wrecks are
// put back with the Rebuild order. Every change goes through `act(pid, cmd)`, so the same bot can
// drive a bare state (applyCommand) or a host and client session pair (a client's commands then
// reach the host a little later, as a real player's do).
import { applyCommand, canPlace, buildPrice } from '../../src/sim/index.js';
import { chain, drops } from './backchain.mjs';

function wallColumns(s) {
  const out = [];
  let k = 0;
  for (let x0 = 9; x0 + 3 <= s.w - 4; x0 += 10, k++) {
    const gy = k % 2 ? 1 : s.h - 2;
    out.push({ x: x0 + 2, gy, s: gy === 1 ? 1 : -1 });
  }
  return out;
}

function plan(s) {
  const list = [];
  for (const [k, { x, gy, s: d }] of wallColumns(s).entries()) {
    for (let y = gy + d * (s.h - 3); y !== gy; y -= d) list.push(['crate', x, y, 0]);
    list.push(['sprinkler', x - 1, gy + d, 0], ['sprinkler', x + 1, gy + d, 0], ['wetfloor', x, gy, 0]);
    list.push(['wetfloor', x - 1, gy, 0], ['wetfloor', x + 1, gy, 0]);
    list.push([k > 0 ? 'samples' : 'sprinkler', x - 2, gy + d, 0], ['sprinkler', x + 2, gy + d, 0]);
    list.push(['forklift', x + 2, gy + 3 * d, 0]);
    if (k > 0) list.push(['forklift', x - 2, gy + 3 * d, 0]);
  }
  return list;
}

function extras(s) {
  const out = [];
  for (let y = 2; y <= s.h - 3; y += 3) for (let x = 2; x <= s.w - 3; x += 3) out.push(['forklift', x, y, 0]);
  return out;
}

/**
 * @param {() => Object} getState the authoritative state (the host's)
 * @param {(pid: number, cmd: Object) => {ok: boolean}|void} act issues a command as that player
 *   (a client's returns nothing: the answer comes later)
 */
export function createTeamBot(getState, act, { back = true } = {}) {
  let list = null, next = 0;
  const chained = new Set(); // drops that have a line already
  const stats = { bought: 0, rebuilt: 0, lines: 0 };
  const store = (s) => s.players.filter((p) => p.on && p.side === 'store');
  const richest = (s) => store(s).reduce((a, b) => (b.cash > a.cash ? b : a));
  const ok = (r) => r === undefined || (r && r.ok);

  function shop() {
    const s = getState();
    if (s.phase !== 'build' && s.phase !== 'wave') return;
    if (!list) list = plan(s).concat(extras(s));
    // Each player orders his own wrecks put back.
    for (const p of store(s)) if (s.rubble.some((r) => r.o === p.id && r.by === undefined)) { act(p.id, { c: 'rebuild' }); stats.rebuilt++; }
    const price = (k) => buildPrice(s, k);
    while (next < list.length) {
      const [k, x, y, d] = list[next];
      const p = richest(s);
      if (p.cash < price(k)) break;
      const why = canPlace(s, k, x, y, p.id, d);
      if (why === 'shopper' || why === 'cash') break;
      if (why === 'blocked' && k === 'crate' && s.phase === 'wave') break;
      if (!why && ok(act(p.id, { c: 'place', k, x, y, d }))) stats.bought++;
      next++;
    }
    // The Back: one line per drop, once there is security to feed and money for it.
    if (back && next > 12) {
      for (const [n, i] of drops(s).entries()) {
        if (chained.has(i)) continue;
        const tracks = ['dmg', 'spd', 'rng'];
        const cmds = chain(s, i, tracks[n % 3]);
        chained.add(i);
        if (!cmds) continue;
        const p = richest(s);
        if (p.cash < cmds.length * 2 + 40) { chained.delete(i); break; }
        for (const c of cmds) act(p.id, c);
        stats.lines++;
      }
    }
  }
  return { shop, stats };
}

/** The bot driving a bare state: commands applied at once. */
export const direct = (s) => (pid, cmd) => applyCommand(s, pid, cmd);
