# Project: Browser Game (temporary name)

## What this is
A browser game the owner and his friends play together, each from his own house.
- **No permanent server.** One player acts as a temporary host for the session; the others join him from their browsers.
- **Players:** must work well for 1 to 6. Most sessions will be 1 to 3, so balance for that first.
- **Starting idea:** tower defense with shared resources, where players automate the production of building materials while defending against waves of enemies.
- **Roles:** each area (for example production and defense) must be deep enough that a player has to learn its layout and becomes the "expert" for it. A solo player switches back and forth between areas; a group splits them up.

## Tone
For adults only. The players are men aged 37 to 41 who grew up on South Park and Family Guy and do not get offended.
The game itself should be belligerent: it gets annoyed at the players, insults them, makes sexually charged jokes, and makes jokes at their expense. Write the humor crude and confident, not watered down.

## Current stage
Concept selection. Twelve rough concepts with mock-up screens live in `concepts/` (open `concepts/index.html` in a browser). The owner says yes, no, or "combine these" before any in-depth planning or game code is written. Do not start detailed design or pick a stack until he has chosen.

## Stack and layout
- Language/frameworks: not chosen yet. Decide after a concept is picked.
- Key folders:
  - `concepts/` - the concept gallery. `concepts.js` holds the text for all the concepts, `index.html` displays it, and each `NN-name/` folder holds that concept's two mock-up screens (SVG drawings).
  - `.claude/reports/` - end-of-task reports.

## Commands
- Build / Test / Lint: none yet.
- View the concept gallery: open `concepts/index.html` in a browser (no server needed).

## Git
- This folder must stay under git control. GitHub will be set up later by the owner.
- Commit after every round of code changes, with a clear message.
- Never push or pull. The owner manages push and pull himself.

## Ownership and change scope
You are the owner and long-term maintainer of this codebase, and its design is up to you. Game direction and important decisions belong to the owner (the user).

## Danger zones (always ask first)
- `git push` and `git pull`: never run them; the owner does.
- Deleting or rewriting git history.

## Conventions
- To be set once a stack is chosen.
