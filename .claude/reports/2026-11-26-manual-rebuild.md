# Rebuild is asked for, not automatic (release 0.3.04)

Date: 2026-11-26. Task: the to-do item "Replace auto-rebuild with a rebuild the player has to ask for".

## Needs your attention

- **Nothing is pushed.** The work is committed on `main` as release 0.3.04 (`RELEASE` went from 3 to 4). Push it yourself when ready (`git push --follow-tags`); after the push the release needs its tag, `v0.3.04`.
- **A decision I made for you: players who disconnect.** A paid-for wreck does not take more money from a player who is away. If his grace period runs out, the money held for his wrecks is shared out with the rest of his cash, and those wrecks become plain rubble again. I took this from the game's existing rules ("while away he neither earns nor pays"; leaving must not keep money safe). Say so if you want it otherwise.
- **A consequence of "no cancel" worth knowing.** Held money comes back in full if anything else is built over the hole. So a player can get his money back by dropping a cheap building on the wreck and selling it (he loses 25% of that cheap building's price). I left this alone: it is the only way out when a rebuild would wall off the tills for good.
- **Not tested with real browsers joined together.** The rules are covered by tests and a randomised money check, and the screens were checked in one browser. A two-player session over the network was not played.

## What was done

**1. The auto-rebuild switch is gone, everywhere.**
The top-bar switch, the switch beside the big button, the "AUTO" badge on the build bar, Shift+B (B now does the same with or without Shift), the `autoRebuild` command, and every mention in the help screen, Employee Handbook, training shift and DEB's lines.

**2. Pressing Rebuild takes the money at once; the building goes back when it can.**
- Nothing in the way: it is back immediately, as B worked before.
- A shopper in the hole, or it would wall off the route: the money is held for that wreck and the game puts it back by itself as soon as the way is clear (it checks five times a second of game time). No second press.
- Wrecks are handled oldest first.

**3. Short of money, it is ordered at the level you can afford, then topped up.**
- If you can pay for the building but not all its upgrades, that much is taken. If nothing is in the way it goes back at once at that lower level.
- While it waits, more of your cash is taken automatically as it comes in, until the full price is held, so it comes back with its upgrades. Older wrecks get the money first.
- If you cannot afford even the bare building (half its base price), that wreck is refused and the button says "Too broke. Need $X". You press again when you have the money. (Your decision.)

**4. New wrecks need a new press.**
Anything broken after the press is not ordered. Pressing again when everything is already paid for takes nothing.

**5. The big REBUILD button stays on screen while anything of yours is wrecked.**
- Not paid yet: `REBUILD 3 · $47`, "Your shit is broken. Fix it".
- Paid and waiting: greyed with a dashed edge, `PAID $56 of $118 · 1 waiting`, and why ("Some idiot is standing in the hole", or "It would wall off the tills. Wait, or open a way through").
- Some of each: `REBUILD 1 · $2`, "1 more paid for and waiting".
- The Rebuild tile in the build bar shows the same ("3 for $47" / "1 waiting").
- A paid-for wreck is drawn with a small orange cone on the rubble. The cone is small (about 15 to 20 pixels at normal zoom) and would be hard to see zoomed far out.

**6. Held money is never lost.** (There is no cancel, your decision.)
It returns in full to whoever paid when: something else is built over the hole, the wreck falls off the end of the rubble list (400 wrecks), the payer takes the Head Office job, or the game is won or lost. Placing the same building by hand on a wreck you already paid for uses the held money and charges once.

**7. DEB has new lines** for "you paid, now it waits", and three for pressing when everything is already paid for. The lines about switching auto-rebuild on are removed.

**8. Old saved games load.** The old switch and the old "when it broke" field are dropped on loading.

## Verification

- **Tests:** `node --test` → 534 tests, 534 pass, 0 fail (run by me on the committed code). The old `test/autorebuild.test.js` was replaced by `test/rebuild-order.test.js` (28 tests of the new rules).
- **Independent review** (a separate reviewer, read-only): no blockers. It ran 60 randomised three-player games of 400 actions each (297 immediate rebuilds, 155 held orders, 72 late rebuilds); after every action each player's cash + held money + spending added up, and cash never went negative. Its four smaller findings were all fixed (the disconnect rule above, an overstated amount in the "paid" event, the wording for a walled-off route, and a rebuild sound that played on a joined player's browser when nothing could be ordered).
- **Balance bots** (`node tools/balance.mjs`, one player, Open Warehouse, Normal; last sales event reached, averaged over 8 seeds):

  | | honest | keen | focus |
  |---|---|---|---|
  | 0.3.03 | 9.4 | 12.4 | 12.25 |
  | 0.3.04 | 9.4 | 12.4 | 12.1 |

  One game in 24 changed (focus, seed 11: loses in event 15 instead of 16). The bots always pressed Rebuild by hand, so this change barely touches them. It does not measure how much harder the game is for a human who used to leave auto-rebuild on.
- **Screenshots** (one browser, desktop 1440×900 and phone 390×844; no layout problems, no console errors from the game):
  - [ready](img/2026-11-26-rebuild/ready.png), [too broke](img/2026-11-26-rebuild/dim.png), [paid and waiting](img/2026-11-26-rebuild/waiting.png), [partly paid](img/2026-11-26-rebuild/partial.png), [mixed](img/2026-11-26-rebuild/mixed.png)
  - phone: [ready](img/2026-11-26-rebuild/ready-phone.png), [waiting](img/2026-11-26-rebuild/waiting-phone.png)
  - [cones on paid-for wrecks](img/2026-11-26-rebuild/cones.png)
  - [top bar without the switch](img/2026-11-26-rebuild/topbar.png), [on a phone](img/2026-11-26-rebuild/topbar-phone.png), [help screen](img/2026-11-26-rebuild/help.png)

## Known limits

- A rebuild that would wall off the tills for good waits until the layout changes, and keeps topping up meanwhile. The button says so; the way out is to open a route or build something else on the hole.
- Money held for a rebuild is not touched by refunds (store losses come out of loose cash only), as noted in `PLAN.md`.
- The sound fix for joined players has no automated test.
- If another player pays for your wrecks (possible in the rules with `all: true`, but no button sends it), your own button does not show them.

## What changed (files)

- Rules: `src/sim/commands.js` (ordering, putting back, the waiting loop), `src/sim/state.js` (refunds, old-save clean-up, away players), `src/sim/step.js`, `src/sim/constants.js` (`rebuildEvery` replaces the two auto-rebuild numbers), `src/sim/index.js`, `src/net/session.js` (held money is part of the host/client check).
- Interface: `src/ui/rebuild.js` (rewritten), `buildbar.js`, `hud.js`, `game.js`, `input.js`, `overlays.js`, `handbook.js`, `src/style.css`; drawing in `src/render/buildings.js`, `renderer.js`; `src/audio/sound.js`.
- Text: `src/content/lines.js`, `director.js`, `help.js`, `touch.js`, `src/tutorial/lessons.js`.
- `src/version.js` (0.3.04), `README.md`, `docs/architecture.md`, `PLAN.md` (new 0.3.04 section; the 0.2.15 notes are marked superseded), `CLAUDE.md` (to-do removed).
- Tests: `test/rebuild-order.test.js` (new), and updates in `v02`, `cards`, `pause`, `expansion`, `director`.
- Tools: `tools/balance.mjs`, `tools/render-harness.html`, and new `tools/rebuild-states.html` (shows each button state).

## How to check it yourself

1. `node --test`
2. `node tools/serve.mjs`, then open `http://localhost:5173/tools/rebuild-states.html?state=ready` (also `dim`, `waiting`, `partial`, `mixed`).
3. Play `http://localhost:5173/?solo=1` until a gym bro wrecks something and press B, once with money and once nearly broke.

## Suggested next steps

- Play a session with a friend joined, to confirm the held money and the late rebuilds look right on a joined browser.
- Decide whether the cone on paid-for wrecks should be bigger.
- Push when satisfied, then tag `v0.3.04`.

Workers: one scout (Haiku) mapped the code; one engineer (Opus) implemented and fixed; one reviewer (Opus) checked the diff; one UI checker (Sonnet) took the screenshots. Conductor on Fable 5.2 did the design, the brief, the money-path read and the commits. No `fable-specialist` run.
