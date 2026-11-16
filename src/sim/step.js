// One tick of the simulation. Deterministic: the same state always produces the same next state,
// which lets every player's browser predict the game between updates from the host.
import { DIRS, BUILD, ITEMS, SHOPPERS, SUPERS, defOf, ST, TUNE, TICK_HZ, DT } from './constants.js';
import { rand, bump, resetWaveStats, earn, lose, shareCount } from './state.js';
import { getField, getFieldTo, modeOf, walkable, NORMAL, HOP, SMASH, GHOST, UNREACHABLE } from './path.js';
import { statsOf } from './upgrades.js';

const secs = (s) => Math.max(1, Math.round(s * TICK_HZ));

/** A shopper kind's own number if it has one (supers do), otherwise the general one from TUNE. */
const tv = (def, key) => def[key] ?? TUNE[key];

/**
 * Who turns up in wave n (1-based). Each group is { k: shopper kind, n: how many, gap: seconds
 * between arrivals, at: seconds after the doors open, sup: how many of them are super }.
 * Dads arrive as a "dad line": a tight single file of men who want to be done.
 * @param {number} [players] how many players share the store; more players, more shoppers
 */
export function waveSpec(n, players = 1) {
  const g = [{ k: 'hunter', n: 6 + 2 * n, gap: 0.9, at: 0 }];
  if (n >= 2) g.push({ k: 'dad', n: 1 + n, gap: 0.3, at: 10 });
  if (n >= 3) g.push({ k: 'clipper', n: 3 * (n - 1), gap: 0.35, at: 5 });
  if (n >= 5) g.push({ k: 'karen', n: Math.floor(n / 3), gap: 4, at: 8 });
  if (n >= 7) g.push({ k: 'scooter', n: Math.floor((n - 5) / 2) + 1, gap: 3, at: 15 });
  if (n >= 10) g.push({ k: 'dad', n: n - 4, gap: 0.3, at: 26 });
  if (n >= 13) g.push({ k: 'hunter', n: 2 * n, gap: 0.5, at: 20 });
  // The shoppers with a trick, introduced one kind at a time.
  if (n >= 3) g.push({ k: 'mom', n: 1 + Math.floor(n / 3), gap: 3, at: 6 });
  if (n >= 4) g.push({ k: 'teen', n: Math.floor(n / 2), gap: 2.5, at: 3 });
  if (n >= 6) g.push({ k: 'blind', n: Math.floor(n / 4), gap: 5, at: 12 });
  if (n >= 6) g.push({ k: 'gymbro', n: 1 + Math.floor((n - 6) / 3), gap: 6, at: 18 });

  // Later waves bring bigger crowds, and so do more players. A bigger group arrives over the
  // same length of time, just closer together.
  const grow = (1 + TUNE.lateGrowth * Math.max(0, n - TUNE.lateFrom + 1))
    * (1 + TUNE.crowdPerPlayer * (Math.max(1, players) - 1));
  for (const grp of g) {
    const many = Math.max(1, Math.round(grp.n * grow));
    grp.gap = (grp.gap * grp.n) / many;
    grp.n = many;
    // Once a kind's super version has arrived, a growing share of every group is super.
    const from = SHOPPERS[grp.k].sup.from;
    grp.sup = n < from ? 0
      : Math.max(1, Math.floor(grp.n * (TUNE.superShare + TUNE.superShareStep * (n - from))));
  }
  return g;
}

/**
 * Training mode: lines up the shoppers for the next wave. The wave starts when a player opens
 * the doors. Groups have the same shape as waveSpec() returns.
 */
export function queueTrainingWave(state, groups) {
  if (state.training) state.nextWave = groups;
}

/** Training mode: sets every player's cash, so a lesson can hand out what it needs. */
export function setTrainingCash(state, cash) {
  if (state.training) for (const p of state.players) p.cash = Math.max(0, Math.floor(cash));
}

/** Opens the doors for the next wave. */
export function beginWave(state, ev) {
  // Training waves do not count up: shoppers keep their starting patience.
  if (state.training) state.wave = 1; else state.wave++;
  state.phase = 'wave';
  state.phaseT = 0;
  resetWaveStats(state);
  const q = [];
  let dads = 0;
  const groups = state.training ? state.nextWave || [] : waveSpec(state.wave, shareCount(state));
  state.nextWave = null;
  const supers = new Set();
  for (const g of groups) {
    if (g.k === 'dad') dads += g.n;
    const sup = Math.min(g.n, g.sup || 0);
    if (sup) supers.add(g.k);
    for (let j = 0; j < g.n; j++) {
      // Spread the supers evenly through the group.
      const isSup = sup > 0 && ((j + 1) * sup) % g.n < sup ? 1 : 0;
      q.push([state.tick + secs(g.at + j * g.gap), g.k, isSup]);
    }
  }
  q.sort((a, b) => a[0] - b[0]);
  state.spawnQ = q;
  ev.push({
    e: 'waveStart', wave: state.wave, total: q.length, dads,
    kinds: [...new Set(groups.map((g) => g.k))], supers: [...supers],
  });
}

function endWave(state, ev) {
  if (state.training) {
    // Back to an untimed build phase; the lesson decides what happens next.
    state.phase = 'build';
    state.phaseT = -1;
    ev.push({ e: 'waveEnd', wave: state.wave, bonus: 0, training: true });
    return;
  }
  // Every player gets the whole bonus.
  const bonus = TUNE.waveBonus + TUNE.waveBonusStep * state.wave;
  earn(state, bonus * shareCount(state));
  ev.push({ e: 'waveEnd', wave: state.wave, bonus });
  if (state.wave >= TUNE.waves) {
    state.phase = 'won';
    ev.push({ e: 'won' });
  } else {
    state.phase = 'build';
    state.phaseT = secs(TUNE.buildSecs);
  }
}

function spawn(state) {
  const q = state.spawnQ;
  if (!q.length || q[0][0] > state.tick) return;
  const W = state.w;
  const doors = state.doors.slice(0, state.open).flat();
  while (q.length && q[0][0] <= state.tick) {
    const [, k, sup] = q.shift();
    const def = sup ? SUPERS[k] : SHOPPERS[k];
    const door = doors[(rand(state) * doors.length) | 0];
    // Dads walk in a strict single file. In training everyone does, so a lesson plays out the
    // same way every time.
    const single = k === 'dad' || state.training;
    const n = state.wave - 1;
    const hp = def.hp * (1 + TUNE.hpGrowth * n + TUNE.hpGrowth2 * n * n);
    const s = {
      id: state.nextId++, k,
      x: (door % W) + 0.5, y: ((door / W) | 0) + 0.5, vx: 0, vy: 0,
      hp, mhp: hp, st: ST.WALK, t: 0, cd: 0,
      ox: single ? 0 : (rand(state) - 0.5) * 0.5,
      oy: single ? 0 : (rand(state) - 0.5) * 0.5,
      lt: -1,
    };
    if (sup) s.sup = 1;
    // Extra fields for the shoppers with a trick (documented in state.js).
    if (def.messy) s.m = secs(tv(def, 'messEvery') * (0.4 + 0.6 * rand(state)));
    if (def.kid) { s.kd = 0; s.kx = s.x; s.ky = s.y; s.kvx = 0; s.kvy = 0; s.kr = 0; s.kc = secs(tv(def, 'kidRest') * 0.5); }
    if (def.bolts) s.bt = 0;
    if (def.smashes) s.sm = 0;
    state.shoppers.push(s);
  }
}

/** Index of the tile next to tile i in direction d, or -1 if off the map. */
function neighbour(state, i, d) {
  const W = state.w;
  const x = (i % W) + DIRS[d][0], y = ((i / W) | 0) + DIRS[d][1];
  return x < 0 || y < 0 || x >= W || y >= state.h ? -1 : y * W + x;
}

/** Tries to hand an item travelling in direction d to the building on tile ti. */
function offer(state, ti, kind, d, ev) {
  if (ti < 0) return false;
  const b = state.grid[ti];
  if (!b) return false;
  if (b.k === 'belt') {
    if (b.d === ((d + 2) & 3)) return false; // two belts facing each other
    const it = b.it;
    if (it.length >= 2 || (it.length && it[it.length - 1][1] < 0.5)) return false;
    it.push([kind, 0]);
    return true;
  }
  if (b.k === 'press' || b.k === 'packer') {
    // A machine takes its input from any side except the side it outputs to.
    if (kind !== BUILD[b.k].takes || b.n >= 2 || d === ((b.d + 2) & 3)) return false;
    b.n++;
    return true;
  }
  if (b.k === 'chute') {
    const v = ITEMS[kind].value;
    earn(state, v);
    state.ws.earned += v;
    bump(state, b.o, 'shipped');
    bump(state, b.o, 'earned', v);
    ev.push({ e: 'sale', i: ti, v, kind });
    return true;
  }
  return false;
}

function giveUp(state, s, by, why, ev) {
  s.st = ST.LEAVE;
  s.t = secs(TUNE.leaveSecs);
  s.hp = 0;
  state.ws.stopped++;
  if (by >= 0) bump(state, by, 'stopped');
  ev.push({ e: 'left', k: s.k, sup: s.sup | 0, x: s.x, y: s.y, by, why });
}

function hurt(state, s, dmg, by, ev) {
  if (s.st === ST.LEAVE) return;
  s.hp -= dmg;
  if (by >= 0) bump(state, by, 'annoy', dmg);
  if (s.hp <= 0) giveUp(state, s, by, 'annoyed', ev);
}

/** A hit that panics a guide dog: it bolts, dragging its owner along. */
function bolt(s, def, ev) {
  if (s.st === ST.LEAVE) return;
  if (s.bt <= 0) ev.push({ e: 'bolt', x: s.x, y: s.y });
  s.bt = secs(tv(def, 'boltSecs'));
}

function stepBuildings(state, fields, ev) {
  const grid = state.grid, S = state.shoppers, W = state.w;
  const stands = [];
  const karens = [];
  for (const s of S) if (s.st !== ST.LEAVE && SHOPPERS[s.k].nag) karens.push(s);
  const beltAdv = TUNE.beltSpeed * DT;

  for (let i = 0; i < grid.length; i++) {
    const b = grid[i];
    if (!b) continue;
    const def = BUILD[b.k];
    switch (b.k) {
      case 'belt': {
        const it = b.it;
        for (let j = 0; j < it.length; j++) {
          const cap = j === 0 ? 1 : it[j - 1][1] - 0.5;
          if (it[j][1] < cap) it[j][1] = Math.min(cap, it[j][1] + beltAdv);
        }
        if (it.length && it[0][1] >= 1 && offer(state, neighbour(state, i, b.d), it[0][0], b.d, ev)) it.shift();
        break;
      }
      case 'unpacker':
        if (b.t > 0) b.t--;
        if (b.t <= 0 && offer(state, neighbour(state, i, b.d), def.makes, b.d, ev)) b.t = secs(def.period);
        break;
      case 'press':
      case 'packer':
        if (b.out) {
          if (offer(state, neighbour(state, i, b.d), b.out, b.d, ev)) b.out = 0;
        } else if (b.t > 0) {
          if (--b.t === 0) b.out = def.makes;
        } else if (b.n > 0) {
          b.n--;
          b.t = secs(def.time);
        }
        break;
      case 'samples': {
        const st = statsOf(b);
        stands.push([i, st.range * st.range, secs(st.secs)]);
        break;
      }
      case 'sprinkler':
      case 'forklift': {
        const cx = (i % W) + 0.5, cy = ((i / W) | 0) + 0.5;
        // A Karen in earshot slows the tower down; the worst one counts.
        let rate = 1;
        for (const kn of karens) {
          const kdef = defOf(kn), r = tv(kdef, 'nagRange');
          if ((kn.x - cx) ** 2 + (kn.y - cy) ** 2 <= r * r) rate = Math.min(rate, tv(kdef, 'nagRate'));
        }
        b.cd -= rate;
        if (b.cd > 0) break;
        const st = statsOf(b);
        const r2 = st.range * st.range;
        if (def.aoe) {
          let hit = 0;
          for (const s of S) {
            if (s.st === ST.LEAVE || (s.x - cx) ** 2 + (s.y - cy) ** 2 > r2) continue;
            hurt(state, s, st.dmg, b.o, ev);
            hit++;
            // Pepper spray panics a guide dog.
            if (SHOPPERS[s.k].bolts) bolt(s, defOf(s), ev);
          }
          if (hit) { b.cd = secs(def.cd); ev.push({ e: 'spray', i }); }
        } else {
          let best = null, bd = UNREACHABLE + 1;
          for (const s of S) {
            if (s.st === ST.LEAVE || (s.x - cx) ** 2 + (s.y - cy) ** 2 > r2) continue;
            const d = fields[modeOf(s.k)][((s.y | 0) * W) + (s.x | 0)];
            if (d < bd) { bd = d; best = s; }
          }
          if (best) {
            b.cd = secs(def.cd);
            b.a = Math.atan2(best.y - cy, best.x - cx);
            ev.push({ e: 'shot', i, x: best.x, y: best.y });
            hurt(state, best, st.dmg, b.o, ev);
            const bdef = defOf(best);
            if (bdef.boltsOnAny) bolt(best, bdef, ev);
          }
        }
        break;
      }
      default:
    }
  }
  return stands;
}

function escape(state, s, ev) {
  const paid = lose(state, defOf(s).refund);
  state.refunds++;
  state.ws.escaped++;
  state.ws.refunded += paid;
  ev.push({ e: 'escape', k: s.k, sup: s.sup | 0, x: s.x, y: s.y, refund: paid });
  if (state.refunds >= state.refundLimit && state.phase !== 'lost' && !state.training) {
    state.phase = 'lost';
    ev.push({ e: 'lost' });
  }
}

/** Scratch result of moveAlong() and moveTo(), reused to avoid allocating on every step. */
const MV = { vx: 0, vy: 0 };

/** One tick of walking straight toward a point. Returns false if already there. */
function moveTo(x, y, tx, ty, speed) {
  const dx = tx - x, dy = ty - y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return false;
  const m = Math.min(1, (speed * DT) / len);
  MV.vx = dx * m;
  MV.vy = dy * m;
  return true;
}

/**
 * Works out one tick of walking downhill on a distance map (toward the tills, usually).
 * @returns {boolean} false if there is nowhere to go; otherwise the move is in MV
 */
function moveAlong(state, field, x, y, ox, oy, speed, id) {
  const W = state.w;
  const i = (y | 0) * W + (x | 0);
  let best = i, bd = field[i];
  for (let k = 0; k < 4; k++) {
    const ni = neighbour(state, i, (k + id) & 3); // vary the tie-break so crowds spread out
    if (ni >= 0 && field[ni] < bd) { bd = field[ni]; best = ni; }
  }
  if (best === i) return false; // arrived, or walled in (which cannot normally happen)
  return moveTo(x, y, (best % W) + 0.5 + ox, ((best / W) | 0) + 0.5 + oy, speed);
}

/**
 * A mom's child. In the cart it may escape at any moment. Loose, it runs for the tills straight
 * through everything in the way (only the store's walls stop a child), for a random distance,
 * and then waits at the first spot that is on its mother's route and further along it than she
 * is. She has to sprint round the maze to get there.
 */
function stepKid(state, s, def, dist, ev) {
  s.kvx = 0; s.kvy = 0;
  const W = state.w;
  if (s.kd === 0) {
    if (s.kc > 0) { s.kc--; return; }
    if (s.st === ST.WALK && rand(state) < tv(def, 'kidChance') * DT) {
      s.kd = 1;
      s.kx = s.x; s.ky = s.y;
      s.kr = tv(def, 'kidMin') + rand(state) * (tv(def, 'kidMax') - tv(def, 'kidMin'));
      ev.push({ e: 'kid', x: s.x, y: s.y });
    }
    return;
  }
  const mi = (s.y | 0) * W + (s.x | 0);
  let ki = (s.ky | 0) * W + (s.kx | 0);
  if (s.kd === 1) {
    const moved = state.tiles[ki] !== 'T'
      && moveAlong(state, getField(state, GHOST), s.kx, s.ky, s.ox, s.oy, tv(def, 'kidSpeed'), s.id);
    if (moved) {
      s.kvx = MV.vx; s.kvy = MV.vy;
      s.kx += MV.vx; s.ky += MV.vy;
      s.kr -= Math.hypot(MV.vx, MV.vy);
      ki = (s.ky | 0) * W + (s.kx | 0);
    }
    if (!moved || (s.kr <= 0 && walkable(state, ki, NORMAL) && dist[ki] < dist[mi])) s.kd = 2;
    return; // cannot be caught on the tick it runs
  }
  // Waiting. If somebody has built on him or walled him off, he runs on.
  if (!walkable(state, ki, NORMAL) || getFieldTo(state, ki)[mi] === UNREACHABLE) {
    s.kd = 1;
    s.kr = 0;
    return;
  }
  if ((s.x - s.kx) ** 2 + (s.y - s.ky) ** 2 < TUNE.kidCatch ** 2) {
    s.kd = 0;
    s.kc = secs(tv(def, 'kidRest'));
    ev.push({ e: 'caught', x: s.x, y: s.y });
  }
}

/**
 * A gym bro wrecks things. Any crate stack beside him goes; failing that, now and then, so does
 * whatever else is beside him. Of several, he picks the one most directly between him and the
 * tills.
 */
function smashAround(state, s, def, i, ev) {
  const grid = state.grid, ghost = getField(state, GHOST);
  let crate = -1, other = -1;
  for (let d = -1; d < 4; d++) {
    const ti = d < 0 ? i : neighbour(state, i, d);
    const b = ti < 0 ? 0 : grid[ti];
    if (!b) continue;
    if (b.k === 'crate') {
      if (crate < 0 || ghost[ti] < ghost[crate]) crate = ti;
    } else if (other < 0 || ghost[ti] < ghost[other]) other = ti;
  }
  if (crate < 0 && other < 0) return; // nothing in reach: look again next tick
  s.sm = secs(tv(def, 'smashEvery'));
  const ti = crate >= 0 ? crate : rand(state) < tv(def, 'smashOther') ? other : -1;
  if (ti >= 0) wreck(state, ti, s, ev);
}

/** Most rubble remembered; beyond this the oldest is forgotten. */
const RUBBLE_MAX = 400;

/**
 * Wrecks the building on a tile. An upgraded building is tougher: it loses a level instead of
 * being destroyed. What is destroyed is remembered as rubble so it can be rebuilt in one go.
 */
function wreck(state, ti, s, ev) {
  const b = state.grid[ti];
  state.ws.wrecked++;
  if (b.lv > 1) {
    if (--b.lv === 1) delete b.lv;
    ev.push({ e: 'smash', i: ti, x: s.x, y: s.y, k: b.k, owner: b.o, down: 1 });
    return;
  }
  state.grid[ti] = 0;
  state.gridVer++;
  state.rubble.push([ti, b.k, b.d | 0, b.o]);
  if (state.rubble.length > RUBBLE_MAX) state.rubble.shift();
  ev.push({ e: 'smash', i: ti, x: s.x, y: s.y, k: b.k, owner: b.o });
}

function stepShoppers(state, fields, stands, ev) {
  const S = state.shoppers, grid = state.grid, W = state.w;
  const dist = fields[NORMAL];
  // Which tiles have a mess on them right now.
  let messAt = null;
  if (state.messes.length) { messAt = new Set(); for (const m of state.messes) messAt.add(m[0]); }

  for (let n = 0; n < S.length; n++) {
    const s = S[n];
    const def = defOf(s);
    s.vx = 0; s.vy = 0;
    if (s.st === ST.LEAVE) {
      if (--s.t <= 0) S.splice(n--, 1);
      continue;
    }
    if (def.drain) {
      s.hp -= def.drain * DT;
      if (s.hp <= 0) { giveUp(state, s, -1, 'bored', ev); continue; }
    }
    if (def.kid) stepKid(state, s, def, dist, ev);
    if (s.cd > 0) s.cd--;
    if (s.st !== ST.WALK) {
      if (--s.t <= 0) s.st = ST.WALK;
      continue;
    }
    const i = (s.y | 0) * W + (s.x | 0);
    if (state.tiles[i] === 'T') {
      escape(state, s, ev);
      S.splice(n--, 1);
      continue;
    }

    let speed = def.speed;
    let here = grid[i];

    if (def.smashes) {
      // A gym bro does not go around a crate stack. He goes through it.
      if (here && here.k === 'crate') { wreck(state, i, s, ev); here = 0; }
      if (s.sm > 0) s.sm--; else { smashAround(state, s, def, i, ev); here = grid[i]; }
    }
    // A panicked guide dog drags its owner along.
    if (def.bolts && s.bt > 0) { s.bt--; speed *= tv(def, 'boltSpeed'); }
    // A mom whose child has run off sprints after him and has no time for anything else.
    const chasing = def.kid && s.kd > 0;
    if (chasing) speed *= tv(def, 'chaseSpeed');

    // A teenager leaves a mess behind every few seconds.
    if (def.messy && --s.m <= 0) {
      s.m = secs(tv(def, 'messEvery'));
      if (state.tiles[i] === '.' && !here) {
        const ticks = secs(tv(def, 'messSecs'));
        const old = state.messes.find((m) => m[0] === i);
        if (old) old[1] = Math.max(old[1], ticks); else state.messes.push([i, ticks]);
        ev.push({ e: 'mess', i });
      }
    }

    // Slippery floor: a wet floor sign, or a teenager's mess. Teenagers are used to their own mess.
    const wet = here && here.k === 'wetfloor';
    const messy = !wet && messAt !== null && messAt.has(i) && !def.messy;
    if ((wet || messy) && !def.steady) {
      const sign = wet ? statsOf(here) : null;
      if (!def.ignoresSigns) {
        speed *= sign ? sign.slow : TUNE.wetSlow;
      } else if (s.lt !== i && rand(state) < (sign ? sign.slip : TUNE.slipChance)) {
        s.lt = i;
        s.st = ST.STUN;
        s.t = secs(TUNE.slipSecs);
        ev.push({ e: 'slip', x: s.x, y: s.y });
        hurt(state, s, sign ? sign.slipDmg : TUNE.slipDmg, wet ? here.o : -1, ev);
        continue;
      }
    }
    s.lt = i;

    if (def.browses && s.cd === 0 && !chasing) {
      let stopped = false;
      for (const st of stands) {
        const sx = (st[0] % W) + 0.5, sy = ((st[0] / W) | 0) + 0.5;
        if ((s.x - sx) ** 2 + (s.y - sy) ** 2 <= st[1]) {
          s.st = ST.BROWSE;
          s.t = st[2];
          s.cd = secs(TUNE.browseCooldown);
          ev.push({ e: 'sample', x: s.x, y: s.y });
          stopped = true;
          break;
        }
      }
      for (let d = 0; d < 4 && !stopped; d++) {
        const ni = neighbour(state, i, d);
        const b = ni < 0 ? 0 : grid[ni];
        if (!b || b.k !== 'belt') continue;
        const j = b.it.findIndex((item) => item[0] !== 'box');
        if (j < 0 || rand(state) >= TUNE.grabChance * DT) continue;
        const kind = b.it.splice(j, 1)[0][0];
        state.ws.stolen++;
        s.st = ST.BROWSE;
        s.t = secs(TUNE.grabSecs);
        s.cd = secs(TUNE.browseCooldown);
        ev.push({ e: 'grab', x: s.x, y: s.y, kind });
        stopped = true;
      }
      if (stopped) continue;
    }

    // Walk toward whichever neighbouring tile is closest to the tills, on this shopper's own
    // map. A mom whose child is waiting somewhere walks to the child instead.
    let going;
    if (chasing && s.kd === 2) {
      const ki = (s.ky | 0) * W + (s.kx | 0);
      going = ki === i ? moveTo(s.x, s.y, s.kx, s.ky, speed)
        : moveAlong(state, getFieldTo(state, ki), s.x, s.y, s.ox, s.oy, speed, s.id);
    } else {
      going = moveAlong(state, fields[modeOf(s.k)], s.x, s.y, s.ox, s.oy, speed, s.id);
    }
    if (going) {
      s.vx = MV.vx;
      s.vy = MV.vy;
      s.x += MV.vx;
      s.y += MV.vy;
    }
  }
}

/**
 * Advances the game by one tick.
 * @returns {Array<Object>} events that happened this tick, each with an `e` type:
 *   waveStart {wave,total,dads,kinds,supers} · waveEnd {wave,bonus} · won · lost
 *   escape {k,sup,x,y,refund} a shopper reached the tills · left {k,sup,x,y,by,why} one gave up
 *   sale {i,v,kind} · spray {i} · shot {i,x,y} · slip {x,y} · sample {x,y} · grab {x,y,kind}
 *   mess {i} a teenager dropped a mess on tile i · kid {x,y} a child escaped · caught {x,y}
 *   bolt {x,y} a guide dog bolted
 *   smash {i,x,y,k,owner,down} a gym bro wrecked the building of kind k on tile i; with
 *     down: 1 it was upgraded and only lost a level
 * (Commands add: placed, removed, upgraded {k,x,y,by,lv}, gave {by,to,n}, rebuilt {by,n}.)
 */
export function step(state) {
  const ev = [];
  if (state.phase === 'won' || state.phase === 'lost') return ev;
  state.tick++;
  // Nothing runs before the first build. (In training the factory always runs.)
  const waiting = !state.training && state.phase === 'build' && state.phaseT === -1;
  if (state.phase === 'build') {
    if (state.phaseT > 0 && --state.phaseT === 0) beginWave(state, ev);
  } else {
    spawn(state);
  }
  if (waiting) return ev;
  for (let k = state.messes.length - 1; k >= 0; k--) {
    if (--state.messes[k][1] <= 0) state.messes.splice(k, 1);
  }
  // A gym bro can change the layout mid-tick; everyone else finishes this tick on the old maps.
  const fields = [getField(state, NORMAL), getField(state, HOP), getField(state, SMASH)];
  const stands = stepBuildings(state, fields, ev);
  stepShoppers(state, fields, stands, ev);
  if (state.phase === 'wave' && !state.spawnQ.length && !state.shoppers.length) endWave(state, ev);
  return ev;
}
