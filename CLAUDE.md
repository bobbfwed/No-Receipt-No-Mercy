# Project: No Receipt, No Mercy (browser game)

## What this is
A browser game the owner and his friends play together, each from his own house.
- **No permanent server.** One player acts as a temporary host for the session; the others join him from their browsers.
- **Players:** must work well for 1 to 7. Most sessions will be 1 to 3, so balance for that first.
- **Name:** "No Receipt, No Mercy", tagline "The customer is always a prick." (chosen by the owner). It is set in a store's returns department, and older files and comments call the game "Returns Department".
- **The game:** a tower defense where players run a factory (belts and machines that make goods) while security stops waves of shoppers reaching the tills. The factory is the maze the shoppers walk through.
- **Money:** each player has his own cash and pays for what he builds. Everything the store earns or loses is split evenly between the connected players.
- **Maps:** the store comes in several designs and sizes (`src/sim/maps.js`), with a recommended size per player count. Each player gets his own shopper entrance. Players move the view with WASD.
- **Late game:** every building can be upgraded along separate tracks (damage, speed, range, durability; each level costs more than the last) and every shopper kind has a tougher "super" version, so there is always something to spend on and something to fear.
- **Roles:** each area (factory, security) must be deep enough that a player has to learn its layout and becomes the "expert" for it. A solo player switches back and forth between areas; a group splits them up.
- **Dads:** a shopper type the owner asked for. Men who just want to get through the line: single file, fast, ignore distractions, step over conveyor belts. Keep them prominent.

## Tone
For adults only. The players are men aged 37 to 41 who grew up on South Park and Family Guy and do not get offended.
The game itself should be belligerent: it gets annoyed at the players, insults them, makes sexually charged jokes, and makes jokes at their expense. Write the humor crude and confident, not watered down. All dialogue lives in `src/content/lines.js`.

## Current stage
Building the first playable version. `PLAN.md` has the plan, the decisions made on the owner's behalf, and what is done. Read `docs/architecture.md` before changing code: it is the contract between the parts.

## Stack and layout
- Plain JavaScript ES modules. No build step, no packages, no framework. Canvas for the game, plain DOM and CSS for the interface. Node 24 for tests and tools only.
- Key folders:
  - `src/sim/` - the rules. Pure and deterministic: no DOM, no network, no clock, no `Math.random()`. All tuning numbers are in `src/sim/constants.js`.
  - `src/net/` - host and client sessions, and the transports that link browsers.
  - `src/content/` - every joke, and the director that chooses them.
  - `src/render/` - canvas drawing. `src/ui/`, `src/main.js`, `index.html`, `src/style.css` - menu and interface.
  - `test/` - tests. `tools/` - dev server, screenshot script, balance bots.
  - `vendor/peerjs.min.js` - third-party network library (PeerJS 1.5.4, MIT licence). Do not edit.
  - `LICENSE.md` - the game is under the PolyForm Noncommercial License 1.0.0 (owner's choice), with a "Required Notice" line crediting Brandon Nimon. PeerJS keeps its MIT licence, listed at the end of that file.
  - `concepts/` - the earlier concept gallery. Kept for reference; not part of the game.
  - `.claude/reports/` - end-of-task reports.

## Commands
- Test: `node --test`
- Run locally: `node tools/serve.mjs` then open `http://localhost:5173/` (modules do not load from a double-clicked file).
- Screenshot a page for UI checks: `tools/shot.ps1` (usage is in the file). Useful URLs: `/?demo=1&ff=600` (ready-made layout, mid-wave), `/?solo=1`.
- Difficulty check: `node tools/balance.mjs` (options are in the file)
- Lint/format: none.

## Git
- This folder must stay under git control. The GitHub repository is https://github.com/bobbfwed/No-Receipt-No-Mercy (branch `main`; the game is meant to be served from it with GitHub Pages).
- Commits are authored as `bobbfwed <bnimon@gmail.com>` (set in this repository's git config). The owner's work email must not appear in the history.
- Commit after every round of code changes, with a clear message.
- Every commit that changes the game (anything under `src/`, `index.html` or `vendor/`) must add one to `RELEASE` in `src/version.js`. The menu shows it ("0.1" large, ".07" small) so the owner can tell when the published site has updated. Only the owner changes `VERSION`. Then run `node tools/readme.mjs`, which puts the version, the store designs and the shoppers into `README.md` (a test fails if it is out of date); add `--shots` to retake the pictures in `docs/img/` when a map design or a shopper's drawing is added or changed. Do not change the version in ordinary commits. It goes up only when the owner asks, or once per push to `main` when every change is committed: bump the patch number in its own commit just before that push, and update the version named at the top of `README.md` in the same commit. Never bump it more than once between two pushes.
- The in-game Employee Handbook (`src/ui/handbook.js`) and the README lists both take their numbers from `src/content/facts.js`, which reads the rules. A new shopper, building or upgradeable number must show up there.
- Never push or pull unless the owner asks for that specific push. The owner manages push and pull himself.

## Ownership and change scope
You are the owner and long-term maintainer of this codebase, and its design is up to you. Game direction and important decisions belong to the owner (the user).

## Danger zones (always ask first)
- `git push` and `git pull`: never run them; the owner does.
- Deleting or rewriting git history.

## Conventions
- Edit files with the editor tools, not PowerShell `Get-Content`/`Set-Content`: Windows PowerShell 5.1 corrupts non-ASCII characters and adds a byte-order mark.
- The simulation must stay deterministic and JSON-safe; the host sends the whole state to clients, who keep simulating from it.
- Anything a player can do goes through `applyCommand` in `src/sim/commands.js`, validated on the host.
- New rules need a test in `test/`. After changing numbers in `constants.js`, run `node tools/balance.mjs` and compare with the results noted in `PLAN.md`.
- Comments explain why, in plain words. Commit messages say what changed for a reader who has not seen the work.