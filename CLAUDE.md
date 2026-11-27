# Project: No Receipt, No Mercy (browser game)

## What this is
A browser game the owner and his friends play together, each from his own house.
- **No permanent server.** One player acts as a temporary host for the session; the others join him from their browsers.
- **Players:** must work well for 1 to 7. Most sessions will be 1 to 3, so balance for that first.
- **Name:** "No Receipt, No Mercy", tagline "The customer is always a prick." (chosen by the owner). It is set in a store's returns department, and older files and comments call the game "Returns Department".
- **The game (from 0.4):** a tower defense on two floors that share one tile grid. On the shop floor, security buildings and Crate Stacks stop waves of shoppers reaching the tills. Underneath, in "The Back" (Tab switches floors, the other floor shows through faintly), a factory of belts and machines turns returned junk into supplies and delivers them to a Dumbwaiter under each security building. A stocked building is stronger; stock is used up as it works, and an empty building is plain again. The rules are in `docs/architecture.md`, section "The Back".
- **Money:** each player has his own cash and pays for what he builds. Everything the store earns or loses is split evenly between the connected players. The factory makes no money: money comes from beating a sales event (more for beating it quickly), boss bounties and pennies from the Clearance Bin.
- **Maps:** the store comes in several designs and sizes (`src/sim/maps.js`), with a recommended size per player count. Each player gets his own shopper entrance. Players move the view with WASD.
- **Late game:** cash upgrades are few: reinforcing (one more gym bro hit per level, on Crate Stacks and every security building), the Wet Floor Sign's four upgrade levels (it takes nothing from The Back), and Returns Drops (more junk). Everything else comes from supplies, of which there are four: Bottled Spite, Rage Cola, Extension Cord and Razor Wire (Duct Tape was removed in 0.4.01). Supplies come in four brand tiers, Store Brand to Platinum, made by Rebranders that are slower at each tier, and every shopper kind has a tougher "super" version, so there is always something to build and something to fear.
- **Roles:** each area (factory, security) must be deep enough that a player has to learn its layout and becomes the "expert" for it. A solo player switches back and forth between areas; a group splits them up.
- **Dads:** a shopper type the owner asked for. Men who just want to get through the line: single file, fast, ignore distractions, and from 0.4 walk straight through every building. Only walls and live Razor Wire stop them: a building can be given a wire direction, and the wire works while that building holds Razor Wire from The Back. From 0.4.01 live wire is also a wall to ordinary shoppers, who walk round it without using it up; only dads walk into it and use it. Keep them prominent.

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
- The version (`RELEASE` in `src/version.js`) goes up by one at most once per push to `main`, and only when the game's code changed since the last push (anything under `src/`, `index.html` or `vendor/`). The menu shows it ("0.1" large, ".07" small) so the players can tell when the published site has updated.
  - Before a commit that changes the game, compare with the pushed copy: `git show origin/main:src/version.js`. If `RELEASE` here is still the same as the pushed one, add one in that commit. If it is already one higher, leave it alone, however many commits follow. Never bump it more than once between two pushes.
  - Commits that change no game code (docs, tests, tools, `CLAUDE.md`) never bump it.
  - Everything done between two pushes belongs to one release, the one in progress: the pushed `RELEASE` plus one (if 0.3.03 is pushed, the work is for 0.3.04). Comments, `PLAN.md` and commit messages name that number, not a number per commit.
  - Every commit message ends with that number in brackets, for example `(0.3.04)`. This includes commits that change no game code and commits made before the one that bumps `RELEASE`. If a push carries no game code, the version does not go up, and the commits after it keep the same number.
- Each published release gets a git tag, so any earlier version of the game can be found and branched from later (`git branch <name> v0.3.03`).
  - Before the first commit of a piece of work, check that the pushed version has its tag. Read `RELEASE` with `git show origin/main:src/version.js`. If `git tag -l v0.3.NN` prints nothing, tag the pushed commit: `git tag -a v0.3.NN origin/main -m "Release 0.3.NN"`. The tag name is `v` plus the version text the menu shows.
  - Never move or delete a tag. A push with no game code keeps the existing tag where it is.
  - Tags reach GitHub only when the owner pushes them (`git push --follow-tags` sends them along with `main`).
- After changing `RELEASE`, a map design or a shopper, run `node tools/readme.mjs`, which puts the version, the store designs and the shoppers into `README.md` (a test fails if it is out of date); add `--shots` to retake the pictures in `docs/img/` when a map design or a shopper's drawing is added or changed.
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

## TO-DO
- Nothing left over. (The "2x2 factory buildings" card idea from 0.3 was dropped with the old factory in 0.4.) Open points from 0.4 are listed in `PLAN.md`, "Version 0.4".
