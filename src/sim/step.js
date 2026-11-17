// One tick of the simulation. Deterministic: the same state always produces the same next state,
// which lets every player's browser predict the game between updates from the host.
import { DIRS, BUILD, ITEMS, SHOPPERS, SUPERS, defOf, ST, TUNE, TICK_HZ, DT } from './constants.js';
import { rand, bump, resetWaveStats, earn, lose, shareCount, difficultyOf, expireAway, anchorOf, tilesOf, centreOf } from './state.js';
import { getField, getFieldTo, modeOf, walkable, NORMAL, HOP, SMASH, GHOST, UNREACHABLE } from './path.js';
import { statsOf, spentOn } from './upgrades.js';
import { takeOfficeWave, refreshBudget } from './office.js';

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
  if (n >= 5) g.push({ k: 'drinker', n: 1 + Math.floor((n - 5) / 3), gap: 4, at: 9 });
  if (n >= 7) g.push({ k: 'dog', n: 2 + Math.floor((n - 7) / 2), gap: 1.2, at: 14 });
  if (n >= 8) g.push({ k: 'flasher', n: 1 + Math.floor((n - 8) / 4), gap: 6, at: 16 });
  if (n >= 9) g.push({ k: 'cosplay', n: 1 + Math.floor((n - 9) / 3), gap: 5, at: 11 });

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
  state.waveAt = state.tick;
  resetWaveStats(state);
  const q = [];
  let dads = 0;
  // A Head Office player's plan replaces the automatic wave, if he made one.
  const bought = state.training ? null : takeOfficeWave(state);
  state.storeReady = false;
  const groups = state.training ? state.nextWave || [] : bought || waveSpec(state.wave, shareCount(state));
  state.nextWave = null;
  const supers = new Set();
  for (const g of groups) {
    if (g.k === 'dad') dads += g.n;
    const sup = Math.min(g.n, g.sup || 0);
    if (sup) supers.add(g.k);
    for (let j = 0; j < g.n; j++) {
      // Spread the supers evenly through the group.
      const isSup = sup > 0 && ((j + 1) * sup) % g.n < sup ? 1 : 0;
      q.push([state.tick + secs(g.at + j * g.gap), g.k, isSup, g.door ?? -1]);
    }
  }
  q.sort((a, b) => a[0] - b[0]);
  state.spawnQ = q;
  ev.push({
    e: 'waveStart', wave: state.wave, total: q.length, dads,
    kinds: [...new Set(groups.map((g) => g.k))], supers: [...supers], office: bought ? 1 : 0,
  });
}

function endWave(state, ev) {
  // Gym bro damage only counts within a wave: every building is whole again for the next.
  for (const b of state.grid) if (b && b.hit) delete b.hit;
  if (state.training) {
    // Back to an untimed build phase; the lesson decides what happens next.
    state.phase = 'build';
    state.phaseT = -1;
    ev.push({ e: 'waveEnd', wave: state.wave, bonus: 0, training: true });
    return;
  }
  // Every player gets the whole bonus.
  const bonus = Math.round((TUNE.waveBonus + TUNE.waveBonusStep * state.wave) * difficultyOf(state).pay);
  earn(state, bonus * shareCount(state));
  ev.push({ e: 'waveEnd', wave: state.wave, bonus });
  if (state.wave >= state.waves) {
    state.phase = 'won';
    ev.push({ e: 'won' });
  } else {
    state.phase = 'build';
    state.phaseT = secs(TUNE.buildSecs);
    refreshBudget(state);
  }
}

function spawn(state) {
  const q = state.spawnQ;
  if (!q.length || q[0][0] > state.tick) return;
  const W = state.w;
  const anyDoor = state.doors.slice(0, state.open).flat();
  while (q.length && q[0][0] <= state.tick) {
    const [, k, sup, at] = q.shift();
    const def = sup ? SUPERS[k] : SHOPPERS[k];
    // Head Office picks the entrance for his groups; otherwise any open one.
    const doors = at >= 0 && at < state.open ? state.doors[at] : anyDoor;
    const door = doors[(rand(state) * doors.length) | 0];
    // Dads walk in a strict single file. In training everyone does, so a lesson plays out the
    // same way every time.
    const single = k === 'dad' || state.training;
    const n = state.wave - 1;
    const hp = def.hp * (1 + TUNE.hpGrowth * n + TUNE.hpGrowth2 * n * n) * (state.training ? 1 : difficultyOf(state).hp);
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
    if (def.kid) { s.kd = 0; s.kx = s.x; s.ky = s.y; s.kvx = 0; s.kvy = 0; s.kr = 0; s.kc = secs(tv(def, 'kidRest') * 0.5); s.kn = 0; }
    if (def.bolts) s.bt = 0;
    if (def.smashes) s.sm = 0;
    if (def.flashes) { s.m = secs(tv(def, 'flashEvery') * (0.4 + 0.6 * rand(state))); s.fl = 0; }
    if (def.sways) s.sv = 1;
    state.shoppers.push(s);
  }
}

/** Index of the tile next to tile i in direction d, or -1 if off the map. */
function neighbour(state, i, d) {
  const W = state.w;
  const x = (i % W) + DIRS[d][0], y = ((i / W) | 0) + DIRS[d][1];
  return x < 0 || y < 0 || x >= W || y >= state.h ? -1 : y * W + x;
}

/** The tile a shopper on tile i steps to next on a distance map (i itself if none is closer). */
function nextTile(state, field, i, id) {
  let best = i, bd = field[i];
  for (let k = 0; k < 4; k++) {
    const ni = neighbour(state, i, (k + id) & 3); // vary the tie-break so crowds spread out
    if (ni >= 0 && field[ni] < bd) { bd = field[ni]; best = ni; }
  }
  return best;
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
    // Whole dollars, and never nothing, whatever the difficulty does to the price.
    const v = Math.max(1, Math.round(ITEMS[kind].value * difficultyOf(state).pay));
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

/** True while a mom's child is out of her hands: running away, or waiting to be fetched. */
const kidLoose = (s) => s.kd === 1 || s.kd === 2;

function hurt(state, s, dmg, by, ev) {
  if (s.st === ST.LEAVE) return;
  // A mom crawling to her child soaks up everything thrown at her.
  if (s.cr === 1) return;
  s.hp -= dmg;
  if (by >= 0) bump(state, by, 'annoy', dmg);
  if (s.hp > 0) return;
  // Out of patience with her child loose: she is not going anywhere without him (once; a Soccer
  // Mom twice). The last time she may, she leaves the cart behind and will carry him after.
  const def = defOf(s);
  if (kidLoose(s) && (s.crn | 0) < tv(def, 'crawlTimes')) {
    s.cr = 1;
    s.hp = 0;
    s.st = ST.WALK;
    s.t = 0;
    if ((s.crn | 0) + 1 >= tv(def, 'crawlTimes')) s.nc = 1;
    ev.push({ e: 'crawl', x: s.x, y: s.y });
    return;
  }
  giveUp(state, s, by, 'annoyed', ev);
}

/** A hit that panics a guide dog: it bolts, dragging its owner along. */
function bolt(s, def, ev) {
  if (s.st === ST.LEAVE) return;
  if (s.bt <= 0) ev.push({ e: 'bolt', x: s.x, y: s.y });
  s.bt = secs(tv(def, 'boltSecs'));
}

/**
 * Who really takes a shot aimed at shopper s: a cosplayer close enough to him gets in the way
 * (the nearest one, if several). Returns the shopper hit and the share of the damage he takes.
 */
function takerOf(state, s, cosplayers) {
  if (!cosplayers.length || defOf(s).shields) return [s, 1];
  let best = null, bd = Infinity;
  for (const c of cosplayers) {
    if (c.st === ST.LEAVE) continue;
    const r = tv(defOf(c), 'shield'), d2 = (c.x - s.x) ** 2 + (c.y - s.y) ** 2;
    if (d2 <= r * r && d2 < bd) { bd = d2; best = c; }
  }
  return best ? [best, tv(defOf(best), 'soak')] : [s, 1];
}

/**
 * A tower's shot at shopper s, soaked up by a nearby cosplayer if there is one.
 * @returns {Object} the shopper who was hit
 */
function strike(state, s, dmg, by, cosplayers, ev) {
  const [who, share] = takerOf(state, s, cosplayers);
  if (who !== s && state.tick - (who.sh ?? -1e9) >= secs(TUNE.shieldEvery)) {
    who.sh = state.tick;
    ev.push({ e: 'shield', x: who.x, y: who.y });
  }
  hurt(state, who, dmg * share, by, ev);
  return who;
}

/**
 * Runs every building for one tick. Returns what the shoppers need to know about the security:
 * stands (free samples), salesmen (TV Salesmen) and posts (what a dog may pee on), all working.
 */
function stepBuildings(state, fields, ev) {
  const grid = state.grid, S = state.shoppers, W = state.w;
  const stands = [], salesmen = [], posts = [];
  const karens = [], cosplayers = [];
  for (const s of S) {
    if (s.st === ST.LEAVE) continue;
    if (SHOPPERS[s.k].nag) karens.push(s);
    if (SHOPPERS[s.k].shields) cosplayers.push(s);
  }
  const beltAdv = TUNE.beltSpeed * DT;
  const way = (s) => fields[modeOf(s.k)][((s.y | 0) * W) + (s.x | 0)];

  for (let i = 0; i < grid.length; i++) {
    const b = grid[i];
    // The other tiles of a big building only point at it; it works from its anchor tile.
    if (!b || b.part !== undefined) continue;
    const def = BUILD[b.k];
    // A dog peed on it: it does nothing until it dries off.
    if (b.off > 0) {
      if (--b.off > 0) continue;
      delete b.off;
    }
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
        if (b.t <= 0 && offer(state, neighbour(state, i, b.d), def.makes, b.d, ev)) b.t = secs(statsOf(b).period);
        break;
      case 'press':
      case 'packer':
        if (b.out) {
          if (offer(state, neighbour(state, i, b.d), b.out, b.d, ev)) b.out = 0;
        } else if (b.t > 0) {
          if (--b.t === 0) b.out = def.makes;
        } else if (b.n > 0) {
          b.n--;
          b.t = secs(statsOf(b).time);
        }
        break;
      case 'samples': {
        const st = statsOf(b);
        const [cx, cy] = centreOf(state, i, b);
        stands.push([cx, cy, st.range * st.range, secs(st.secs)]);
        posts.push(i);
        break;
      }
      case 'salesman': {
        const st = statsOf(b);
        const [cx, cy] = centreOf(state, i, b);
        salesmen.push([cx, cy, st.range * st.range, st, i]);
        posts.push(i);
        break;
      }
      case 'sprinkler':
      case 'forklift':
      case 'railgun': {
        posts.push(i);
        const [cx, cy] = centreOf(state, i, b);
        // A Karen in earshot slows the tower down; the worst one counts.
        let rate = 1;
        for (const kn of karens) {
          const kdef = defOf(kn), r = tv(kdef, 'nagRange');
          if ((kn.x - cx) ** 2 + (kn.y - cy) ** 2 <= r * r) rate = Math.min(rate, tv(kdef, 'nagRate'));
        }
        b.cd -= rate;
        if (b.cd > 0) break;
        const st = statsOf(b);
        if (def.beam) {
          // Straight out of the front end, through everything, as far as its range.
          const [dx, dy] = DIRS[b.d | 0];
          const mx = cx + dx * (def.size[0] / 2), my = cy + dy * (def.size[0] / 2);
          const hit = [];
          for (const s of S) {
            if (s.st === ST.LEAVE) continue;
            const along = (s.x - mx) * dx + (s.y - my) * dy;
            const off = Math.abs((s.x - mx) * dy - (s.y - my) * dx);
            if (along >= 0 && along <= st.range && off <= st.width) hit.push(s);
          }
          if (!hit.length) break;
          b.cd = secs(st.cd);
          ev.push({ e: 'rail', i, d: b.d | 0, len: st.range, n: hit.length });
          for (const s of hit) {
            const who = strike(state, s, st.dmg, b.o, cosplayers, ev);
            const wdef = defOf(who);
            if (wdef.boltsOnAny) bolt(who, wdef, ev);
          }
          break;
        }
        const r2 = st.range * st.range;
        if (def.aoe) {
          // It reaches only so many at once: the ones nearest the tills get it.
          const near = [];
          for (const s of S) {
            if (s.st === ST.LEAVE || (s.x - cx) ** 2 + (s.y - cy) ** 2 > r2) continue;
            near.push(s);
          }
          if (near.length > def.targets) {
            near.sort((p, q) => way(p) - way(q) || p.id - q.id);
            near.length = def.targets;
          }
          for (const s of near) {
            const who = strike(state, s, st.dmg, b.o, cosplayers, ev);
            // Pepper spray panics a guide dog.
            if (SHOPPERS[who.k].bolts) bolt(who, defOf(who), ev);
          }
          if (near.length) { b.cd = secs(st.cd); ev.push({ e: 'spray', i }); }
        } else {
          let best = null, bd = UNREACHABLE + 1;
          for (const s of S) {
            if (s.st === ST.LEAVE || (s.x - cx) ** 2 + (s.y - cy) ** 2 > r2) continue;
            const d = way(s);
            if (d < bd) { bd = d; best = s; }
          }
          if (best) {
            b.cd = secs(st.cd);
            b.a = Math.atan2(best.y - cy, best.x - cx);
            ev.push({ e: 'shot', i, x: best.x, y: best.y });
            const who = strike(state, best, st.dmg, b.o, cosplayers, ev);
            const wdef = defOf(who);
            if (wdef.boltsOnAny) bolt(who, wdef, ev);
          }
        }
        break;
      }
      default:
    }
  }
  return { stands, salesmen, posts };
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
  const best = nextTile(state, field, i, id);
  if (best === i) return false; // arrived, or walled in (which cannot normally happen)
  return moveTo(x, y, (best % W) + 0.5 + ox, ((best / W) | 0) + 0.5 + oy, speed);
}

/** True if a salesman (from stepBuildings) reaches the point (x, y) and is still switched on. */
function salesmanAt(state, salesmen, x, y) {
  for (const m of salesmen) {
    if (state.grid[m[4]].off > 0) continue;
    if ((x - m[0]) ** 2 + (y - m[1]) ** 2 <= m[2]) return m;
  }
  return null;
}

/**
 * The mom has her child back: he goes into the cart, or into her arms if she has left the cart
 * behind (and then he never runs again). If she was crawling to him, she gets up.
 */
function reunite(state, s, def, ev) {
  const carry = s.nc ? 1 : 0;
  s.kd = carry ? 3 : 0;
  s.kc = secs(tv(def, 'kidRest'));
  // Reaching him on her hands and knees puts her back on her feet, with some patience restored.
  if (s.cr === 1) { s.cr = 0; s.crn = (s.crn | 0) + 1; s.hp = s.mhp * TUNE.crawlBack; }
  ev.push({ e: 'caught', x: s.x, y: s.y, carry });
}

/**
 * A mom's child. In the cart he may escape (once; a Soccer Mom's twice). Loose, he runs for the
 * tills straight through everything in the way (only the store's walls stop a child), for a random
 * distance, and then waits at the first spot that is on his mother's route and further along it
 * than she is, but never closer than TUNE.kidTill tiles of walking to a till. A salesman's
 * television may stop him sooner. She has to sprint round the maze to get there.
 */
function stepKid(state, s, def, dist, salesmen, ev) {
  s.kvx = 0; s.kvy = 0;
  const W = state.w;
  const mi = (s.y | 0) * W + (s.x | 0);
  if (s.kd === 3) return; // in her arms for good
  if (s.kd === 0) {
    if (s.kc > 0) { s.kc--; return; }
    if ((s.kn | 0) >= tv(def, 'kidRuns')) return;
    // Not right by the tills: there would be nowhere left for him to run to.
    if (s.st === ST.WALK && dist[mi] !== UNREACHABLE && dist[mi] > TUNE.kidTill + 1 && rand(state) < tv(def, 'kidChance') * DT) {
      s.kd = 1;
      s.kn = (s.kn | 0) + 1;
      s.kt = 0;
      s.kl = mi;
      s.kx = s.x; s.ky = s.y;
      s.kr = tv(def, 'kidMin') + rand(state) * (tv(def, 'kidMax') - tv(def, 'kidMin'));
      ev.push({ e: 'kid', x: s.x, y: s.y });
    }
    return;
  }
  // Where he may wait: floor his mother can walk to, not too close to a till.
  const ok = (t) => state.tiles[t] !== 'T' && walkable(state, t, NORMAL) && dist[t] !== UNREACHABLE && dist[t] >= TUNE.kidTill;
  let ki = (s.ky | 0) * W + (s.kx | 0);
  if (s.kd === 1) {
    const ghost = getField(state, GHOST);
    // Is there anywhere further along his run where he may wait, before he gets too close?
    const onward = (from) => {
      for (let t = from, n = 0; n < W * state.h; n++) {
        const next = nextTile(state, ghost, t, s.id);
        if (next === t || state.tiles[next] === 'T') return false;
        if (ok(next)) return true;
        if (dist[next] !== UNREACHABLE && dist[next] < TUNE.kidTill) return false;
        t = next;
      }
      return false;
    };
    const moved = state.tiles[ki] !== 'T' && moveAlong(state, ghost, s.kx, s.ky, s.ox, s.oy, tv(def, 'kidSpeed'), s.id);
    if (moved) {
      s.kvx = MV.vx; s.kvy = MV.vy;
      s.kx += MV.vx; s.ky += MV.vy;
      s.kr -= Math.hypot(MV.vx, MV.vy);
      ki = (s.ky | 0) * W + (s.kx | 0);
    }
    if (ok(ki)) {
      s.kl = ki;
      // The salesman's television: he may stop to watch it (one chance per escape).
      if (!s.kt && salesmen.length && salesmanAt(state, salesmen, s.kx, s.ky)) {
        s.kt = 1;
        if (rand(state) < TUNE.kidTv) {
          s.kd = 2;
          ev.push({ e: 'kidtv', x: s.kx, y: s.ky });
          return;
        }
      }
      if ((s.kr <= 0 && dist[ki] < dist[mi]) || !moved || !onward(ki)) s.kd = 2;
      return; // cannot be caught on the tick it runs
    }
    if (moved && onward(ki)) return;
    // Nowhere ahead to wait (something was built in the way): back to the last good spot, or
    // failing that, back to his mother.
    if (s.kl !== undefined && ok(s.kl) && getFieldTo(state, s.kl)[mi] !== UNREACHABLE) {
      s.kx = (s.kl % W) + 0.5; s.ky = ((s.kl / W) | 0) + 0.5;
      s.kd = 2;
    } else {
      reunite(state, s, def, ev);
    }
    return;
  }
  // Waiting. If somebody has built on him or walled him off, he runs on.
  if (!walkable(state, ki, NORMAL) || getFieldTo(state, ki)[mi] === UNREACHABLE) {
    s.kd = 1;
    s.kr = 0;
    return;
  }
  if ((s.x - s.kx) ** 2 + (s.y - s.ky) ** 2 < TUNE.kidCatch ** 2) reunite(state, s, def, ev);
}

/** Most rubble remembered; beyond this the oldest is forgotten. */
const RUBBLE_MAX = 400;

/**
 * A gym bro hits the building on a tile (any tile of it). Each building survives statsOf().hits
 * hits in one wave; the last one destroys it, and it is remembered as rubble so it can be rebuilt.
 * @param {boolean} [flatten] destroy it outright (he is standing on it)
 */
function wreck(state, ti, s, ev, flatten = false) {
  const ai = anchorOf(state, ti);
  const b = state.grid[ai];
  if (!b) return;
  state.ws.wrecked++;
  const hits = statsOf(b).hits;
  b.hit = flatten ? hits : (b.hit | 0) + 1;
  const left = Math.max(0, hits - b.hit);
  ev.push({ e: 'smash', i: ai, x: s.x, y: s.y, k: b.k, owner: b.o, left });
  if (left > 0) return;
  for (const t of tilesOf(state, ai)) state.grid[t] = 0;
  state.gridVer++;
  state.rubble.push({ i: ai, k: b.k, d: b.d | 0, o: b.o, u: { ...(b.u || {}) }, spent: spentOn(b) });
  if (state.rubble.length > RUBBLE_MAX) state.rubble.shift();
}

/**
 * A gym bro wrecks things. Any crate stack beside him takes a hit; failing that, now and then, so
 * does whatever else is beside him. Of several, he picks the one most directly between him and
 * the tills.
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

/** The direction from tile a to the tile next to it, b (0-3), or -1 if they are not neighbours. */
function dirTo(state, a, b) {
  const W = state.w, dx = (b % W) - (a % W), dy = ((b / W) | 0) - ((a / W) | 0);
  if (Math.abs(dx) + Math.abs(dy) !== 1) return -1;
  return dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3;
}

/** A working piece of security (not a sign) within a dog's reach, nearest first, or -1. */
function postNear(state, posts, s, range) {
  const W = state.w;
  let best = -1, bd = range * range;
  for (const ai of posts) {
    const b = state.grid[ai];
    if (!b || b.off > 0) continue;
    for (const t of tilesOf(state, ai)) {
      const d2 = ((t % W) + 0.5 - s.x) ** 2 + (((t / W) | 0) + 0.5 - s.y) ** 2;
      if (d2 <= bd) { bd = d2; best = ai; }
    }
  }
  return best;
}

function stepShoppers(state, fields, sec, ev) {
  const { stands, salesmen, posts } = sec;
  const S = state.shoppers, grid = state.grid, W = state.w;
  const dist = fields[NORMAL];
  // Which tiles have a mess on them right now, and which a day drinker lying where he fell.
  let messAt = null, downAt = null;
  if (state.messes.length) { messAt = new Set(); for (const m of state.messes) messAt.add(m[0]); }
  for (const s of S) {
    if (s.st === ST.STUN && SHOPPERS[s.k].sways) (downAt ||= new Set()).add((s.y | 0) * W + (s.x | 0));
  }

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
    if (def.kid) stepKid(state, s, def, dist, salesmen, ev);
    if (s.cd > 0) s.cd--;
    if (s.pc > 0) s.pc--;
    if (s.ru > 0) s.ru--;
    if (s.gz > 0) s.gz--;
    if (s.fl > 0) s.fl--;
    if (s.st !== ST.WALK) {
      if (--s.t <= 0) s.st = ST.WALK;
      continue;
    }
    const i = (s.y | 0) * W + (s.x | 0);
    // A mom does not take her refund without her child: she has to have him first.
    const chasing = def.kid && kidLoose(s);
    if (state.tiles[i] === 'T' && !chasing) {
      escape(state, s, ev);
      S.splice(n--, 1);
      continue;
    }

    let speed = def.speed;
    let here = grid[i];

    if (def.smashes) {
      // A gym bro does not go around a crate stack. He goes through it: if one is in his way, he
      // stands there and hits it until it is gone.
      if (here && here.k === 'crate') { wreck(state, i, s, ev, true); here = 0; }
      if (s.sm > 0) s.sm--;
      const ahead = nextTile(state, fields[SMASH], i, s.id);
      if (ahead !== i && grid[ahead] && grid[ahead].k === 'crate') {
        if (s.sm <= 0) { s.sm = secs(tv(def, 'smashEvery')); wreck(state, ahead, s, ev); }
        if (grid[ahead]) continue; // still standing: he waits for his next swing
      } else if (s.sm <= 0) {
        smashAround(state, s, def, i, ev);
        here = grid[i];
      }
    }
    // A day drinker: his pace changes all the time, and a corner may be too much for him.
    if (def.sways) {
      if ((state.tick + s.id * 7) % secs(TUNE.swayEvery) === 0) {
        s.sv = tv(def, 'swayMin') + rand(state) * (tv(def, 'swayMax') - tv(def, 'swayMin'));
      }
      speed *= s.sv;
      if (s.lt >= 0 && s.lt !== i) {
        const dir = dirTo(state, s.lt, i);
        const turned = dir >= 0 && s.dr !== undefined && dir !== s.dr;
        if (dir >= 0) s.dr = dir;
        if (turned && rand(state) < tv(def, 'fallChance')) {
          s.lt = i;
          s.st = ST.STUN;
          s.t = secs(tv(def, 'fallSecs'));
          ev.push({ e: 'fall', x: s.x, y: s.y });
          continue;
        }
      }
    }
    // A panicked guide dog drags its owner along.
    if (def.bolts && s.bt > 0) { s.bt--; speed *= tv(def, 'boltSpeed'); }
    // A mom whose child has run off sprints after him and has no time for anything else.
    if (s.cr === 1) speed *= TUNE.crawlSpeed; else if (chasing) speed *= tv(def, 'chaseSpeed');
    // Hurrying away from a salesman.
    if (s.ru > 0) speed *= TUNE.rushSpeed;
    // Stepping round a drunk lying on the floor.
    if (downAt && downAt.has(i) && !def.steady) speed *= TUNE.fallSlow;

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
    // An exhibitionist opens her bathrobe now and then. Dads and teenagers nearby stop and stare.
    if (def.flashes && --s.m <= 0) {
      s.m = secs(tv(def, 'flashEvery') * (0.5 + rand(state)));
      const r = tv(def, 'flashRange');
      let seen = 0;
      for (const o of S) {
        if (o === s || o.st !== ST.WALK || o.gz > 0 || !defOf(o).gawks) continue;
        if ((o.x - s.x) ** 2 + (o.y - s.y) ** 2 > r * r) continue;
        o.st = ST.WATCH;
        o.t = secs(tv(def, 'gawkSecs'));
        o.gz = secs(TUNE.gawkCool);
        seen++;
      }
      s.st = ST.WATCH;
      s.t = s.fl = secs(TUNE.flashSecs);
      ev.push({ e: 'flash', x: s.x, y: s.y, n: seen });
      continue;
    }

    // Slippery floor: a wet floor sign, or a teenager's mess. Teenagers are used to their own mess.
    const wet = here && here.k === 'wetfloor';
    const messy = !wet && messAt !== null && messAt.has(i) && !def.messy;
    if ((wet || messy) && !def.steady && s.cr !== 1) {
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

    // A stray dog stops to pee on the security it passes, which switches it off for a while.
    if (def.pees && !(s.cd > 0) && posts.length) {
      const ai = postNear(state, posts, s, tv(def, 'peeRange'));
      if (ai >= 0) {
        const b = grid[ai];
        b.off = secs(tv(def, 'peeSecs'));
        s.st = ST.WATCH;
        s.t = secs(TUNE.peeStop);
        s.cd = secs(TUNE.peeStop + tv(def, 'peeCool'));
        ev.push({ e: 'pee', i: ai, x: s.x, y: s.y, k: b.k });
        continue;
      }
    }

    // The TV Salesman: in his reach, a shopper may stop to watch, or hurry past to get away.
    if (salesmen.length && !(s.pc > 0) && !chasing && s.cr !== 1) {
      const m = salesmanAt(state, salesmen, s.x, s.y);
      if (m) {
        const st = m[3], [stop0, rush0] = def.pitch || [0, 0];
        // Upgrades work on anyone who could be tempted at all (a blind man never sees the screen).
        const stop = stop0 > 0 ? 1 - (1 - stop0) * st.stopLeft : 0;
        const rush = rush0 * st.rushMul;
        const roll = rand(state);
        s.pc = secs(TUNE.pitchCool);
        if (roll < stop) {
          s.st = ST.WATCH;
          s.t = secs(st.secs);
          ev.push({ e: 'pitch', x: s.x, y: s.y, k: s.k, r: 'stop' });
          continue;
        }
        if (roll < stop + rush) {
          s.ru = secs(TUNE.rushSecs);
          speed *= TUNE.rushSpeed;
          ev.push({ e: 'pitch', x: s.x, y: s.y, k: s.k, r: 'rush' });
        }
      }
    }

    if (def.browses && s.cd === 0 && !chasing) {
      let stopped = false;
      for (const st of stands) {
        if ((s.x - st[0]) ** 2 + (s.y - st[1]) ** 2 <= st[2]) {
          s.st = ST.BROWSE;
          s.t = st[3];
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
 *   begun the lobby is over, everyone was ready · map {design,size} the host changed the store
 *   waveStart {wave,total,dads,kinds,supers} · waveEnd {wave,bonus} · won · lost
 *   escape {k,sup,x,y,refund} a shopper reached the tills · left {k,sup,x,y,by,why} one gave up
 *   sale {i,v,kind} · spray {i} · shot {i,x,y} · slip {x,y} · sample {x,y} · grab {x,y,kind}
 *   rail {i,d,len,n} the Rail Gun on anchor tile i fired facing d, a beam len tiles long, hitting n
 *   mess {i} a teenager dropped a mess on tile i · kid {x,y} a child escaped
 *   caught {x,y,carry} a mom has her child back (carry 1: in her arms, as she has no cart)
 *   kidtv {x,y} a running child stopped to watch a salesman's television
 *   bolt {x,y} a guide dog bolted · crawl {x,y} a mom ran out of patience with her child loose
 *     and is crawling to him, untouchable
 *   smash {i,x,y,k,owner,left} a gym bro hit the building of kind k on anchor tile i; left is how
 *     many more hits it takes this wave (0: destroyed, and now rubble)
 *   pitch {x,y,k,r} a salesman got to a shopper of kind k: r 'stop' (watches) or 'rush' (hurries)
 *   pee {i,x,y,k} a dog peed on the building of kind k on anchor tile i: it is off for a while
 *   shield {x,y} a cosplayer soaked up a shot meant for someone near him (at most once a second each)
 *   flash {x,y,n} an exhibitionist opened her bathrobe; n dads and teenagers stopped to stare
 *   fall {x,y} a day drinker fell over going round a corner
 * (Commands add: placed {k,x,y,d,by,rebuilt?,short?}, removed, upgraded {k,x,y,by,t,lv},
 *  gave {by,to,n}, rebuilt {by,n,short}.)
 */
export function step(state) {
  const ev = [];
  if (state.phase === 'won' || state.phase === 'lost') return ev;
  if (state.phase === 'lobby') {
    // Nothing runs in the lobby. The game starts when every connected player is ready.
    const here = state.players.filter((p) => p.on);
    if (here.length && here.every((p) => p.ready)) {
      state.phase = 'build';
      state.phaseT = -1;
      ev.push({ e: 'begun' });
    }
    return ev;
  }
  state.tick++;
  expireAway(state);
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
  const sec = stepBuildings(state, fields, ev);
  stepShoppers(state, fields, sec, ev);
  if (state.phase === 'wave' && !state.spawnQ.length && !state.shoppers.length) endWave(state, ev);
  return ev;
}
