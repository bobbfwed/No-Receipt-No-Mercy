# Returns Department

A co-op browser game for 1 to 6 players. Shoppers pour into a discount warehouse wanting refunds. You and your friends share one pot of cash, build a factory of belts and machines to earn more, and build security to make the shoppers give up before they reach the tills. The belts and machines are the maze they walk through. An HR chatbot called DEB insults you the whole time. Adults only.

## Play on this computer
You need Node.js (any recent version) to serve the files.

Double-click `play.bat`. It starts a small local server and opens the game in your browser. Keep its window open while you play; closing it stops the server, and the page will then say "Unable to connect".

Or by hand: run `node tools/serve.mjs`, then open http://localhost:5173/ in Chrome, Edge or Firefox.

- **Training shift** teaches every building hands on, in about ten minutes. Start here.
- **Play solo** starts a real game straight away.
- The speaker button at the top right turns sound effects, music and DEB's voice on or off.
- To try multiplayer alone, open http://localhost:5173/tools/two-player.html : a host and a second player side by side.

## Play with friends in other houses
Nobody runs a server. One player hosts in his browser and the others connect to him directly.

1. The game's files must be on a web address everyone can open. The simplest is GitHub Pages: push this repository to GitHub, then in the repository's Settings, under Pages, publish from the main branch (root folder). The game is then at `https://<your-user>.github.io/<repository>/`.
2. The host opens that address, enters a name and presses **Host a game**. A five-letter room code appears at the top.
3. The host presses **Copy link** and sends it to his friends (or reads them the code). They open the link, enter a name and press **Join a game**.
4. Friends can join at any time. If someone drops out he can rejoin with the same name and gets his place back.
5. When the host closes the tab, the game ends for everyone.

The first connection goes through the free public PeerJS service, which only introduces the browsers to each other; the game data then travels directly between you. If that service is down, online games cannot start (solo still works).

## Controls
| Key or mouse | Does |
|---|---|
| 1 to 9, 0 | Pick a building (or click it in the bar) |
| Click | Build |
| Drag | Build a line; belts follow the drag |
| R | Rotate what you are holding, or the building under the mouse when holding nothing |
| Right-click, or X then click | Remove (75% of the price back) |
| Esc | Put the tool down |

## For developers
- `node --test` runs the tests.
- `PLAN.md` has the plan and the decisions taken so far.
- `docs/architecture.md` explains how the code is organised and the testing tools.
- `CLAUDE.md` has the project rules for AI assistants.
