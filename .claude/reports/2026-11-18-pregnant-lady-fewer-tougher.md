# The Pregnant Lady, and fewer, tougher shoppers (2026-11-18, version 0.2.09)

## Needs your attention

- **"Double the patience" is phased in, not flat.** Done exactly as you asked (half the crowd, double patience from the first sales event), the scripted test players lost in sales event 4 or 5 instead of 11 to 16. You chose to keep the game about as hard as before, so: the crowd is half from event 1, and patience is unchanged up to event 5, then rises in a straight line to double at event 20 and stays double. The three numbers are in one place (`TUNE` in `src/sim/constants.js`: `crowdScale`, `patienceFrom`, `patienceFull`, `patienceScale`) for when you want to push it further.
- **Nobody has played this.** The balance is matched to scripted players on the open warehouse. They never build the Barcode Laser, so they say nothing about how the Pregnant Lady plays.
- **Decisions I made for you**, all easy to change:
  - The boss keeps his own patience (he is one man, not part of the flood) and now counts as **2 refunds of 20** (he was 5 of 40).
  - A shopper's refund cash and Head Office's prices are doubled, so money stays in proportion with half as many shoppers.
  - Halved groups round down (never below one). Rounding up left the crowd at 53 to 62% of its old size against a limit cut to 50%, which sank one test game by itself.
  - The training shift keeps its own scripted waves and patience.
  - A game saved before this version keeps the share of its refund limit it had used (25 of 50 becomes 12 of 25) when it is resumed.
  - Pregnant Lady: first in sales event 8; she stops for free samples; the TV Salesman stops her about half the time. Octomom from event 14.
  - Each baby runs at its own pace (85 to 115% of the baby speed), so a litter strings out instead of moving as one blob.
- **Watch for a Karen escorting the boss.** In the test games' event 5 a Karen ends up walking just ahead of him: security shoots her, she slows it, and his pep talks keep her topped up, so he gets through. It is not a bug and comes from the scripted players' fixed half-built maze, but a real maze could do the same. Later bosses are driven out more often than before.
- **Pushed to GitHub** (`main`) as you asked.

## What was done

### A new shopper: the Pregnant Lady (super: Octomom)
- Slow (0.85 tiles a second) with a lot of patience. When it runs out she pops, and **12 babies** (24 for Octomom) run for the tills from where she stood.
- **A Barcode Laser's finishing hit means no babies.** A "NOT TODAY" sign shows when it works. Any other security finishing her pops her.
- Babies are very fast (3.2 tiles a second; the Stray Dog is 2.6) with very little patience. **A baby at a till costs $5 and does not count toward the refund limit**, as you chose.
- If she reaches a till she takes one refund and nothing pops.
- Below 30% patience she clutches her bump and sweats, so players can see a pop coming.
- She is in the Employee Handbook, the README and Head Office's shop. Babies cannot be bought.
- DEB has an introduction for each of them and lines for the pop and for the laser stopping it.
- Pictures: [the lady in every state](img/2026-11-18-lady.png), [a pop](img/2026-11-18-pop.png), [24 babies on the whole map](img/2026-11-18-swarm.png), [the laser preventing it](img/2026-11-18-laser.png).

### Fewer, tougher shoppers
- **Half as many shoppers from the first sales event.** Gaps between arrivals doubled, so an event lasts about as long. A solo game's events 1 to 15 now bring 4, 6, 12, 15, 15, 25, 31, 39, 47, 38, 68, 83, 109, 128 and 88 shoppers.
- **Patience** is unchanged to event 5 and reaches double at event 20. The handbook shows the real numbers event by event.
- **Refund limit 20, plus 5 per extra player**, as you chose.
- Why flat doubling failed: early on, security spends much of its time with nobody to shoot, so each shopper takes the same damage as before but needs twice as much. Later, when security is busy all the time, half the crowd with double patience is the same total work. So the multiplier has to follow the game from 1 to 2.

### Balance results (scripted solo games, Normal, one-player open warehouse)
The sales event each scripted player loses in, as honest / keen / focus:

| Test game | Before | Flat, as first asked | As built |
|---|---|---|---|
| 11 | 11 / 16 / 14 | 5 / 5 / 5 | 11 / 16 / 15 |
| 5 | 11 / 14 / 14 | 5 / 5 / 5 | 11 / 16 / 15 |
| 23 | 11 / 15 / 14 | 4 / 4 / 4 | 11 / 15 / 15 |
| 7 | 11 / 16 / 15 | not run | 11 / 16 / 15 |
| 42 | 10 / 15 / 14 | not run | 10 / 14 / 15 |

- The "as built" column was measured before the last small fixes (baby pace, the till case). I reran test game 11 on the finished code: 10 / 16 / 15.
- Other fixes tried and rejected: phasing in the crowd as well (lost by event 6 to 11), and making security hit 1.5 or 2 times as hard (right at the start, far too easy later, and it halves the boss).

### Tests and review
- `node --test`: **259 pass, 0 fail** (19 new, in `test/preggo.test.js`).
- The sound test page reports ALL PASS with the five new sounds in it.
- An independent review of the rules found no problem with host and joined players staying in step. It found three smaller issues, all fixed: old saved games, the lady popping while standing on a till, and four tests that would have passed with the feature broken.

## Files changed
- **Rules:** `src/sim/constants.js`, `src/sim/step.js`, `src/sim/office.js`, `src/sim/state.js`, `src/sim/index.js`, one line in `src/net/session.js` and `src/ui/save.js` for old saves.
- **Dialogue and handbook:** `src/content/lines.js`, `director.js`, `facts.js`, `help.js`, `src/tutorial/lessons.js` (the text "20 refunds" only), `src/ui/planner.js`.
- **Drawing and sound:** `src/render/shoppers.js`, `effects.js`, `minimap.js`, `src/ui/portrait.js`, `src/audio/preggo.js` (new), `effects.js`, `shoppers.js`, `crowd.js`, `sound.js`, `boss.js`.
- **Tests:** `test/preggo.test.js` (new), and updates to the boss, director, endless, expansion, netsync, office, shoppers and v02 tests.
- **Docs and tools:** `README.md`, `docs/img/shopper-preggo.png` (new), `docs/architecture.md`, `PLAN.md`, `tools/render-harness.html`, `tools/sound-test.html`, `src/version.js` (0.2.09).

## How to check it
1. When the menu on the published site reads 0.2.09, play solo to sales event 8, or open the Employee Handbook and find the Pregnant Lady.
2. To see a pop straight away, locally: `node tools/serve.mjs`, then `http://localhost:5173/tools/render-harness.html?pop=sprinkler&size=s&fitview=1&after=60`. Replace `sprinkler` with `laser` to see the laser prevent it; add `&octo=1` for the Octomom.
3. `node --test` runs all the tests.

## Suggested next steps
1. Play a game and say whether the later events are now readable, and whether to push the numbers further (a third of the crowd, triple patience).
2. Say whether the Pregnant Lady is worth the laser, and whether babies should cost more than $5.
3. The shopper and boss ideas from yesterday's report are still waiting for your choices.

Workers: rules, tuning and fixes on Opus (one worker, continued four times); drawing and sound on Opus; an independent review on Opus. Scope, the choice of fix and integration on Fable.
