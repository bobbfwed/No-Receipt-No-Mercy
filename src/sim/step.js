// One tick of the simulation. Deterministic: the same state always produces the same next state,
// which lets every player's browser predict the game between updates from the host.
import { W, H, DIRS, BUILD, ITEMS, SHOPPERS, ST, TUNE, TICK_HZ, DT } from './constants.js';
import { rand, bump, resetWaveStats } from './state.js';
import { getDist, getHopDist, UNREACHABLE } from './path.js';

const secs = (s) => Math.max(1, Math.round(s * TICK_HZ));

/** Door tile indexes, where shoppers appear. */
const DOORS = [];
function doorsOf(state) {
  if (!DOORS.length) for (let i = 0; i < state.tiles.length; i++) if (state.tiles[i] === 'D') DOORS.push(i);
  return DOORS;
}

/**
 * Who turns up in wave n (1-based). Each group is { k: shopper kind, n: how many, gap: seconds
 * between arrivals, at: seconds after the doors open }.
 * Dads arrive as a "dad line": a tight single file of men who want to be done.
 */
export function waveSpec(n) {
  const g = [{ k: 'hunter', n: 6 + 2 * n, gap: 0.9, at: 0 }];
  if (n >= 2) g.push({ k: 'dad', n: 1 + n, gap: 0.3, at: 10 });
  if (n >= 3) g.push({ k: 'clipper', n: 3 * (n - 1), gap: 0.35, at: 5 });
  if (n >= 5) g.push({ k: 'karen', n: Math.floor(n / 3), gap: 4, at: 8 });
  if (n >= 7) g.push({ k: 'scooter', n: Math.floor((n - 5) / 2) + 1, gap: 3, at: 15 });
  if (n >= 10) g.push({ k: 'dad', n: n - 4, gap: 0.3, at: 26 });
  if (n >= 13) g.push({ k: 'hunter', n: 2 * n, gap: 0.5, at: 20 });
  return g;
}

/**
 * Training mode: lines up the shoppers for the next wave. The wave starts when a player opens
 * the doors. Groups have the same shape as waveSpec() returns.
 */
export function queueTrainingWave(state, groups) {
  if (state.training) state.nextWave = groups;
}

/** Training mode: sets the team's cash, so a lesson can hand out what it needs. */
export function setTrainingCash(state, cash) {
  if (state.training) state.cash = Math.max(0, Math.floor(cash));
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
  const groups = state.training ? state.nextWave || [] : waveSpec(state.wave);
  state.nextWave = null;
  for (const g of groups) {
    if (g.k === 'dad') dads += g.n;
    for (let j = 0; j < g.n; j++) q.push([state.tick + secs(g.at + j * g.gap), g.k]);
  }
  q.sort((a, b) => a[0] - b[0]);
  state.spawnQ = q;
  ev.push({ e: 'waveStart', wave: state.wave, total: q.length, dads });
}

function endWave(state, ev) {
  if (state.training) {
    // Back to an untimed build phase; the lesson decides what happens next.
    state.phase = 'build';
    state.phaseT = -1;
    ev.push({ e: 'waveEnd', wave: state.wave, bonus: 0, training: true });
    return;
  }
  const bonus = TUNE.waveBonus + TUNE.waveBonusStep * state.wave;
  state.cash += bonus;
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
  const doors = doorsOf(state);
  while (q.length && q[0][0] <= state.tick) {
    const k = q.shift()[1];
    const def = SHOPPERS[k];
    const door = doors[(rand(state) * doors.length) | 0];
    // Dads walk in a strict single file. In training everyone does, so a lesson plays out the
    // same way every time.
    const single = k === 'dad' || state.training;
    const n = state.wave - 1;
    const hp = def.hp * (1 + TUNE.hpGrowth * n + TUNE.hpGrowth2 * n * n);
    state.shoppers.push({
      id: state.nextId++, k,
      x: (door % W) + 0.5, y: ((door / W) | 0) + 0.5, vx: 0, vy: 0,
      hp, mhp: hp, st: ST.WALK, t: 0, cd: 0,
      ox: single ? 0 : (rand(state) - 0.5) * 0.5,
      oy: single ? 0 : (rand(state) - 0.5) * 0.5,
      lt: -1,
    });
  }
}

/** Index of the tile next to tile i in direction d, or -1 if off the map. */
function neighbour(i, d) {
  const x = (i % W) + DIRS[d][0], y = ((i / W) | 0) + DIRS[d][1];
  return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
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
    state.cash += v;
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
  ev.push({ e: 'left', k: s.k, x: s.x, y: s.y, by, why });
}

function hurt(state, s, dmg, by, ev) {
  if (s.st === ST.LEAVE) return;
  s.hp -= dmg;
  if (by >= 0) bump(state, by, 'annoy', dmg);
  if (s.hp <= 0) giveUp(state, s, by, 'annoyed', ev);
}

function stepBuildings(state, dist, hop, ev) {
  const grid = state.grid, S = state.shoppers;
  const stands = [];
  const karens = [];
  for (const s of S) if (s.st !== ST.LEAVE && SHOPPERS[s.k].nag) karens.push(s);
  const beltAdv = TUNE.beltSpeed * DT;
  const nag2 = TUNE.nagRange * TUNE.nagRange;

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
        if (it.length && it[0][1] >= 1 && offer(state, neighbour(i, b.d), it[0][0], b.d, ev)) it.shift();
        break;
      }
      case 'unpacker':
        if (b.t > 0) b.t--;
        if (b.t <= 0 && offer(state, neighbour(i, b.d), def.makes, b.d, ev)) b.t = secs(def.period);
        break;
      case 'press':
      case 'packer':
        if (b.out) {
          if (offer(state, neighbour(i, b.d), b.out, b.d, ev)) b.out = 0;
        } else if (b.t > 0) {
          if (--b.t === 0) b.out = def.makes;
        } else if (b.n > 0) {
          b.n--;
          b.t = secs(def.time);
        }
        break;
      case 'samples':
        stands.push(i);
        break;
      case 'sprinkler':
      case 'forklift': {
        const cx = (i % W) + 0.5, cy = ((i / W) | 0) + 0.5;
        let rate = 1;
        for (const kn of karens) {
          if ((kn.x - cx) ** 2 + (kn.y - cy) ** 2 <= nag2) { rate = 0.5; break; }
        }
        b.cd -= rate;
        if (b.cd > 0) break;
        const r2 = def.range * def.range;
        if (def.aoe) {
          let hit = 0;
          for (const s of S) {
            if (s.st !== ST.LEAVE && (s.x - cx) ** 2 + (s.y - cy) ** 2 <= r2) { hurt(state, s, def.dmg, b.o, ev); hit++; }
          }
          if (hit) { b.cd = secs(def.cd); ev.push({ e: 'spray', i }); }
        } else {
          let best = null, bd = UNREACHABLE + 1;
          for (const s of S) {
            if (s.st === ST.LEAVE || (s.x - cx) ** 2 + (s.y - cy) ** 2 > r2) continue;
            const d = (SHOPPERS[s.k].hopsBelts ? hop : dist)[((s.y | 0) * W) + (s.x | 0)];
            if (d < bd) { bd = d; best = s; }
          }
          if (best) {
            b.cd = secs(def.cd);
            b.a = Math.atan2(best.y - cy, best.x - cx);
            ev.push({ e: 'shot', i, x: best.x, y: best.y });
            hurt(state, best, def.dmg, b.o, ev);
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
  const refund = SHOPPERS[s.k].refund;
  const paid = Math.min(state.cash, refund);
  state.cash -= paid;
  state.refunds++;
  state.ws.escaped++;
  state.ws.refunded += paid;
  ev.push({ e: 'escape', k: s.k, x: s.x, y: s.y, refund: paid });
  if (state.refunds >= TUNE.refundLimit && state.phase !== 'lost' && !state.training) {
    state.phase = 'lost';
    ev.push({ e: 'lost' });
  }
}

function stepShoppers(state, dist, hop, stands, ev) {
  const S = state.shoppers, grid = state.grid;
  const standR2 = BUILD.samples.range ** 2;
  for (let n = 0; n < S.length; n++) {
    const s = S[n];
    const def = SHOPPERS[s.k];
    s.vx = 0; s.vy = 0;
    if (s.st === ST.LEAVE) {
      if (--s.t <= 0) S.splice(n--, 1);
      continue;
    }
    if (def.drain) {
      s.hp -= def.drain * DT;
      if (s.hp <= 0) { giveUp(state, s, -1, 'bored', ev); continue; }
    }
    if (s.cd > 0) s.cd--;
    if (s.st !== ST.WALK) {
      if (--s.t <= 0) s.st = ST.WALK;
      continue;
    }
    const tx = s.x | 0, ty = s.y | 0, i = ty * W + tx;
    if (state.tiles[i] === 'T') {
      escape(state, s, ev);
      S.splice(n--, 1);
      continue;
    }

    let speed = def.speed;
    const here = grid[i];
    if (here && here.k === 'wetfloor' && !def.steady) {
      if (!def.ignoresSigns) {
        speed *= TUNE.wetSlow;
      } else if (s.lt !== i && rand(state) < TUNE.slipChance) {
        s.lt = i;
        s.st = ST.STUN;
        s.t = secs(TUNE.slipSecs);
        ev.push({ e: 'slip', x: s.x, y: s.y });
        hurt(state, s, TUNE.slipDmg, here.o, ev);
        continue;
      }
    }
    s.lt = i;

    if (def.browses && s.cd === 0) {
      let stopped = false;
      for (const st of stands) {
        const sx = (st % W) + 0.5, sy = ((st / W) | 0) + 0.5;
        if ((s.x - sx) ** 2 + (s.y - sy) ** 2 <= standR2) {
          s.st = ST.BROWSE;
          s.t = secs(TUNE.sampleSecs);
          s.cd = secs(TUNE.browseCooldown);
          ev.push({ e: 'sample', x: s.x, y: s.y });
          stopped = true;
          break;
        }
      }
      for (let d = 0; d < 4 && !stopped; d++) {
        const ni = neighbour(i, d);
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

    // Walk toward whichever neighbouring tile is closest to the tills. Dads use their own map,
    // on which conveyor belts count as floor.
    const field = def.hopsBelts ? hop : dist;
    let best = i, bd = field[i];
    for (let k = 0; k < 4; k++) {
      const ni = neighbour(i, (k + s.id) & 3); // vary the tie-break so crowds spread out
      if (ni >= 0 && field[ni] < bd) { bd = field[ni]; best = ni; }
    }
    if (best === i) continue; // walled in; cannot normally happen
    const gx = (best % W) + 0.5 + s.ox, gy = ((best / W) | 0) + 0.5 + s.oy;
    const dx = gx - s.x, dy = gy - s.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      const m = Math.min(1, (speed * DT) / len);
      s.vx = dx * m;
      s.vy = dy * m;
      s.x += s.vx;
      s.y += s.vy;
    }
  }
}

/**
 * Advances the game by one tick.
 * @returns {Array<Object>} events that happened this tick, each with an `e` type:
 *   waveStart {wave,total,dads} · waveEnd {wave,bonus} · won · lost
 *   escape {k,x,y,refund} a shopper reached the tills · left {k,x,y,by,why} a shopper gave up
 *   sale {i,v,kind} · spray {i} · shot {i,x,y} · slip {x,y} · sample {x,y} · grab {x,y,kind}
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
  const dist = getDist(state);
  const hop = getHopDist(state);
  const stands = stepBuildings(state, dist, hop, ev);
  stepShoppers(state, dist, hop, stands, ev);
  if (state.phase === 'wave' && !state.spawnQ.length && !state.shoppers.length) endWave(state, ev);
  return ev;
}
