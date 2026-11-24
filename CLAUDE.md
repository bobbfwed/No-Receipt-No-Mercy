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
  - Everything done between two pushes belongs to that one release: comments, `PLAN.md` and commit messages name that release number, not a number per commit.
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

## TO-DO for v0.3 (remove each item as they are finished and remove this section once it is empty):
- Add 5 randomly chosen modifications to each game. 2 negative cards (add difficulty for the players), 2 possitive cards (makes things easier for the player), and 1 \[generally\] neutral variation. I'm picturing something that looks like trading cards fly in and drop one-by-one into slots.
  - The cards are prominantly chosen as soon as all players have readied up, and before players are allowed to build buildings. Add sound effect and visual effects for each modification. They need to come in slow enough so that on mobile each one is readable before the next one comes in. On mobile it should take up most of the screen for the new card. Then slide up to 5 empty slots at the top of the screen.
  - Once they all have been chosen, there needs to be a place for the player to click on to read the cards in detail about what each does.
  - Some card ideas, but I need you to come up several more so there is plenty of variation (especially neutral cards):
    - Add difficulty (where applicable, they apply to the shopper and the super version of the shopper):
      - Pregnant women (and octomoms) spawn twice as many babies
      - Random refunds are twice the amount they usually are
      - Mom and kids: the kid will run to a place further forward in the maze (on the path the shoppers normally take), rather than a random place on the map
      - A percentage of moms and kids will be allowed to run away twice as many times
      - A percentage of gym bros can break through twice as many things
      - A percentage of stray dogs are pregnant and will burst with smaller dogs (like the pregnant lady)
      - Bosses have 20% more patience (also make them 50% larger on screen)
      - Random variations of increased patience
      - Random variations of increased speed
    - Makes things easier (where applicable, they apply to the shopper and the super version of the shopper):
      - Mystery boxes sell for more money (maybe 3x)
      - Gadgets sell for more money (maybe 1.7x)
      - Gift sets sell for more money (maybe 1.5x)
      - All factory buildings are built with one random upgrade
      - All security buildings are built with one random upgrade
      - Pregnant women spawn half as many babies
      - 50% of dads follow around exhibitionists at a distance (behind) so the exhibitionist must make it to the return teller before a dad will make a return. Only applies when within a given range of the exhibitionist. Once the exhibitionist leaves the store, the dad continues on.
      - Mom and kids: kids occassionally run backwards (towards the entrance) in the store
      - Teenager messes cover a wider area on the floor.
      - Random free sample buildings become free samples of alcoholic drinks (have a different look to the table). Meaning if an adult stops at a sample table they have a chance to become day drinkers. The likelihood of it happening increases with each alcohol free sample table they stop at.
      - Random variations of reduced patience
      - Random variations of reduced speed
      - Random shoppers make purchases at sample and salesmen buildings (uncommon, but they give the store/players a lot: $50 at free samples, $100-400 at salesmen)
      - Add a variation of the man with guide dog that are support animals (not for blind people). Other shoppers stop and try to pet the dog.
    - Neutral variation:
      - Factory buildings are 4x as big (2x2) but make 4x as much money.
      - Cosplayers have a wider area of effect, but are slower (0.8 tiles/s) and have less patience.
  - Play test the different cards to make sure none wildy change the difficulty. I believe the last time you mentioned play tests, your tests ended generally around round 16. Failure around round 12-19. If things fall outside of that range, we need to evaluate the modifier. I understand that play testing every combination would take a long time (correct me if I'm wrong), so test each card once, along with other cards. Test all cards at least once, while testing 5 cards at a time. This will likely cause some unknown interraction between the modifiers, but that's part of the game.
  - Come up with names of the cards that are appropriate for the humor in this game (inappropriate and dumb jokes preferable)
- Add a new map. One with lots of long corridors that will make factory paths difficult.
- Add a new map that is a completely different shape. I'm thinking horseshoe shapped. It needs to be larger to compensate for the missing/unusable area.