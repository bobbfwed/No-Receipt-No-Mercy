# More factory upgrade levels and "Back to the lobby" (releases 0.2.16 and 0.2.17)
> Note added later: the per-commit release numbers in this report (0.2.13 to 0.2.17) were collapsed. Everything here ships as release 0.2.13.

This finishes the to-do list that was at the bottom of `CLAUDE.md`; that section is now removed. The first three items are covered in `2026-11-23-salesman-machines-late-surge.md`.

## Needs your attention
- **Nothing is pushed.** Five commits (0.2.13 to 0.2.17) sit on local `main`.
- **"Back to the lobby" has never been tried in a real browser.** It is covered by automated tests on the session code (host plus two clients), but not the screens. Please run the two-browser check below before a session with friends.
- **Belts now move about 2.6 times faster** (5.25 tiles a second, up from 2). This was needed so a belt can carry two fully upgraded machines. Nobody has looked at it on screen yet.
- **A backed-up belt is robbed more often.** To keep a moving item as likely to be stolen as before on the faster belts, the per-pass steal chance went from 0.35 to 0.92. Items standing still on a jammed belt are therefore taken about 2.6 times as often. Tell me if that feels wrong in play.
- **Factory income can now triple in the late game** ($56 a second for a maxed line on Normal, against $18). That is the point of the request, but it pulls against the new harder waves after event 30, so the two need a play test together.

## What was done
1. **After a multiplayer game ends, the host's button reads "Back to the lobby" and takes everyone there.** Same connections, same 5-digit code, same join link. The host can change store, size, length and difficulty and start again; a new friend can still join with the old link. Clients cannot trigger it: they see a rude "the host decides" line and a "Quit to the menu" button. Players who left during the game are not brought back but can rejoin with the link. Late messages from the finished game are ignored. Solo games are unchanged.
2. **Machine speed upgrades now go to level 10 instead of 5.** Levels 1 to 5 are unchanged. Levels 6 to 10 each add 25% speed and cost 1.4 times the level before (not 1.8), so each pays for itself in about an hour of play, as level 5 does. Levels 6 to 10 for one whole line cost about $151,000.

   | Machine | Price of levels 1 to 10 |
   |---|---|
   | Unpacker | 100, 180, 324, 583, 1050, 1470, 2058, 2881, 4033, 5646 |
   | Press | 300, 540, 972, 1750, 3149, 4409, 6173, 8642, 12098, 16938 |
   | Packer | 540, 972, 1750, 3149, 5669, 7936, 11111, 15555, 21777, 30488 |

3. **Two small fixes found on the way.** The Press and Packer were losing 2 ticks per item, which would have made them a fifth slower than the Unpacker at level 10; fixed. The game's commentary called a building "maxed" at level 8; it now uses each track's real top level.

## Test results
- `node --test`: 278 pass, 0 fail (rerun by me after the last commit).
- `node tools/balance.mjs`, seed 11, after the factory change: bots reach events 11 / 17 / 16 (was 11 / 16 / 16; the small gain comes from the Press/Packer fix).

## Two-browser check for the lobby
1. Host an online game, join from a second browser, play until the game ends.
2. The host's button reads "Back to the lobby"; the friend sees the waiting line and "Quit to the menu".
3. Host clicks it: both browsers land in the lobby with the same room code.
4. Host changes store, size and difficulty; the friend sees each change.
5. A third tab joins with the old link.
6. Everyone presses Ready and the new game starts clean (also listen for music left over from the old game; that was not checked).

## Files changed
- Factory (`7153cc1`, 0.2.16): `src/sim/constants.js`, `src/sim/upgrades.js`, `src/sim/step.js`, `src/content/director.js`, `src/ui/handbook.js`, two test files.
- Lobby (`7df475c`, 0.2.17): `src/net/session.js`, `src/ui/game.js`, `src/ui/overlays.js`, `src/ui/save.js`, `src/main.js`, `docs/architecture.md`, new `test/lobby-return.test.js`.
- Both: `src/version.js`, `README.md`, `PLAN.md`, `CLAUDE.md`.

## Suggested next steps
Do the two-browser check, then play an endless game to events 40 to 50 with the new upgrades and tell me how the difficulty and the belt speed feel. Push when you are happy.

Workers: two general-purpose workers on Opus, one per item (the factory one used about 126,000 tokens in 6 minutes). The conductor (Fable) wrote the scopes and reran the tests; it did not read these two diffs line by line, to save usage.
