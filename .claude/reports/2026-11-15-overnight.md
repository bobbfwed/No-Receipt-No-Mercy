# Overnight work: less data, grace period, sound, tutorial part 2, saving

Date: night of 2026-11-15. Releases 0.1.12 to 0.1.14, all pushed.

## Needs your attention

- **Task 1 (the relay) is not finished and cannot be without you.** The place for the details exists (`src/net/relay.js`, with instructions inside) and is empty. Two players on the same network still cannot connect. I need a server address, a username and a password from a relay (TURN) provider that issues fixed credentials. The password will be readable by anyone, because the game is a public static site.
- **Nobody has heard the new sounds.** They pass every measurement, but whether they are funny or irritating needs your ears. Open `tools/sound-test.html`; it has a play button for each sound and a "crowd of 30" player. What to listen to first is listed under Sound below.
- **Players other than the host now see the game about a quarter of a second behind him.** That is the price of sending 47 times less data. Building still feels immediate for the host; a joined player's own building appears after that short delay.
- **A dropped player's grace period is counted in game time,** so it is 90 seconds at normal speed and 30 seconds at 3x speed.
- **Old saves:** a save made by an older version is ignored if it does not look right. That check is blunt; after a rules change, an old save could still load and behave oddly. Use "Delete this save" if one does.

## Outline

### 1. The host sends about 47 times less data (task 2)
- Before, the host sent the whole game to every player about five times a second. Now it sends ten small messages a second: the commands players gave and a checksum. Every browser replays them on its own copy and asks for a fresh copy if its checksum differs.
- Measured on a busy three-player game (wave 10, 84 buildings, 205 shoppers, 30 seconds): about 130 KB a second per player before, about 2.8 KB after.
- A full copy is sent only when someone joins or leaves, on a mismatch, when a player falls more than three seconds behind, and every ten seconds as a safety net.
- Messages too big for a connection are split and rejoined. The old scheme probably dropped online players once the game state passed 16 KB (large maps or big crowds); that limit is in the network library, and I did not reproduce the drop.
- Checked: Edge to Edge side by side; three players with the host leaving and coming back; and a Firefox host with an Edge player through the real internet broker (422 checksum comparisons, no mismatches, with towers firing).
- Not checked: a phone as a player under the new scheme, and long games.

### 2. A dropped player gets a grace period (task 3)
- A player who goes offline keeps his money for 90 seconds of game time. Back within that, nothing is lost. Otherwise his money is shared between the others and he returns with none, as before.
- While away he takes no share of income and pays no share of refunds.
- A host who leaves gets the same grace. So do the other players during the few seconds a host hand-over takes.

### 3. Sound: variety, a voice per shopper, and crowds (task 6)
- Every frequent sound has three versions and changes pitch, length and timbre on each play. The same version never plays twice running.
- Each of the nine shoppers storms out in its own way; the super versions are bigger and have a prop (a slammed door, a referee's whistle, two dogs barking over each other).
- When many happen at once they are spaced a few milliseconds apart, thinned out and turned down. More than seven shoppers leaving in a second becomes one "walkout"; a run of sales becomes one till "ka-ching".
- New sounds: upgrades (rising with the level), wrecking each kind of building, rebuilding, the crawling mom, giving money, the game beginning, both sides asking for the doors, taking or leaving Head Office, and chat.
- Measured: 86 sounds and 17 crowd cases, all passing. Thirty of one sound in two seconds is now 1.0 to 1.7 times as loud as one alone (it was 1.6 to 2.3).
- **Listen to these first,** most doubtful first: the muttered voices (Karen's "MAN-a-GER", the teenager's "whatever") may sound like a kazoo instead of words; the teenager's "uuugh" and the bargain hunter's raspberry; a late-wave storm may now feel too sparse; the super scooter's and super dad's beeps are plain; the dad's and gym bro's grunts are the two most alike.

### 4. Training shift part 2: the difficult customers (task 7)
- Seven new lessons: teenagers, Karens, the shoppers who cannot be slowed (guide dog and scooter), mom and kid (first watching her crawl, then finishing her before the kid gets out), and gym bros with the Rebuild button.
- 23 lessons in all, about 20 minutes. "Jump to part 2" skips the buildings. The menu button says so.
- Every claim a lesson makes is tested on eight random seeds, and a test page played all of part 2 with simulated mouse and keyboard to "Training complete".
- Weak spots: the teenager lesson is watch-only; the scooter lesson needs a super scooter to make its point; the gym bro is finished at the door, so the player does not see him wreck much.

### 5. Save and resume (task 8)
- The host's browser saves the game every 15 seconds, at the end of each wave and when the page closes.
- The menu shows "Resume saved game" with the sales event, the store, who was playing and when it was saved, and "Delete this save".
- Resuming makes that browser the host again. If others were playing, a new room code appears; each gets his place and money back by joining under the same name, with no time limit.
- One save per browser, on that device only. After a host hand-over the new host's browser holds it. A finished game clears it. Training, the lobby and finished games are not saved.
- Checked in the browser: played, returned to the menu, resumed, and the buildings and countdown came back.

### 6. Tests and checks
- `node --test`: 131 passed, 0 failed (it was 106).
- Browser checks, all with no page errors: three players with a host hand-over and return; the touch checks at phone size (33 of 33); the mouse-and-keyboard page; Head Office; both halves of the tutorial with simulated input; the sound measuring page; the Firefox and Edge game.

## Decisions I made that you may want to change
- Grace period: 90 seconds of game time (`TUNE.graceSecs`).
- A partly filled-in relay is ignored, because a browser refused to connect at all with one.
- The tutorial's second half is appended to the first, not a separate menu entry.
- The number of sounds that may play at once is capped at 12; if a busy wave sounds thin, the number to raise is `NODE_RATE` in `src/audio/crowd.js`.

## How the work was split
I built saving, wired the pieces together, tested across browsers, and checked each helper's work. Three Opus helpers built the networking (about 289,000 tokens), the sound (about 319,000) and the tutorial (about 345,000).

## What changed (files)
- `src/net/session.js`, `transports.js`, new `relay.js`; `src/sim/state.js`, `step.js`, `constants.js` (grace period).
- `src/audio/` (all), new `crowd.js` and `shoppers.js`; `tools/sound-test.html`.
- `src/tutorial/lessons.js`, `src/ui/tutorial.js`, `src/content/touch.js`; new `tools/tutorial-test-2.html`.
- New `src/ui/save.js`; `src/main.js`, `src/ui/menu.js`, `src/style.css`.
- Tests: new `test/netsync.test.js` and `test/save.test.js`; `net`, `tutorial` and `expansion` tests updated.
- `PLAN.md`, `README.md`, `docs/architecture.md`.

## How to verify
1. Reload the live site (Ctrl+F5); the menu should read 0.1.14.
2. Sound: open `tools/sound-test.html`, press play on a few shoppers, then try the "crowd of 30" buttons.
3. Tutorial: Training shift, then "Jump to part 2".
4. Saving: play a solo game for 20 seconds, reload the page, and press Resume saved game.
5. Two players: `tools/two-player.html?autostart=1&say=1`.

## Suggested next steps
1. Give me relay details, or tell me to drop the relay.
2. Listen to the sounds and say which to change.
3. Play a game with a friend on the new networking and say whether the quarter-second delay is noticeable.
