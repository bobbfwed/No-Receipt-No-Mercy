# No Receipt, No Mercy

*The customer is always a prick.*

**Play it now: https://bobbfwed.github.io/No-Receipt-No-Mercy/** (nothing to install; works in a browser on a computer, a tablet or a phone).

A co-op browser game for 1 to 7 players, set in the returns department of a discount warehouse. Shoppers pour into a discount warehouse wanting refunds. You and your friends each have your own cash (the store's income and refunds are split evenly between you), build a factory of belts and machines to earn more, and build security to make the shoppers give up before they reach the tills. The belts and machines are the maze they walk through. An HR chatbot called DEB insults you the whole time. Adults only.

## Play on this computer without the internet
The link above is the easy way. To run your own copy instead (for example to try changes), you need Node.js (any recent version) to serve the files.

Double-click `play.bat`. It starts a small local server and opens the game in your browser. Keep its window open while you play; closing it stops the server, and the page will then say "Unable to connect".

Or by hand: run `node tools/serve.mjs`, then open http://localhost:5173/ in Chrome, Edge or Firefox.

- **Training shift** teaches every building hands on, in about ten minutes. Start here.
- **Painted floor:** Unpackers, Presses, Packers and Shipping Chutes each only go on their own named patch of floor (Loading Bay, Press Shop, Gift Wrap, Shipping). The patches are apart, so belts carry the goods between them, and those belts are your maze.
- **The store** on the menu picks the map for Play solo and Host a game: a design (open warehouse, showroom of walled rooms, supermarket aisles) and a size. Each size says how many players it suits; every player gets his own shopper entrance.
- **Play solo** starts a real game straight away.
- The speaker button at the top right turns sound effects, music and DEB's voice on or off.
- To try multiplayer alone, open http://localhost:5173/tools/two-player.html : a host and a second player side by side.

## Play online with friends
The game is online multiplayer for up to seven players, wherever they are. Nobody runs a server: one player hosts in his browser and the others connect to him directly over the internet.

1. Everyone opens https://bobbfwed.github.io/No-Receipt-No-Mercy/ . (The site is this repository published with GitHub Pages from the `main` branch; every push to `main` updates it within a minute or two.)
2. The host enters a name and presses **Host a game**. A five-letter room code appears at the top.
3. The host presses **Copy link** and sends it to his friends (or reads them the code). They open the link, enter a name and press **Join a game**.
4. Everyone lands in the lobby, with the store drawn whole on the right. The host can change its design and size there, and the game's settings (how many sales events, the difficulty, and each player's starting cash), and everyone sees it change. The same settings can be chosen on the menu before hosting. Each player presses **READY**; the game starts when all of them have.
5. Friends can also join after the game has started, even mid-wave, and play at once. If someone drops out he can rejoin with the same name and gets his place back.
6. A player whose connection drops keeps his money for a minute and a half of game time; if he is back by then nothing is lost, and if not it is shared between the others. If the host leaves, the game carries on: another player's browser takes over as host within a few seconds (up to a minute), and everyone else reconnects by themselves. The player who left can come back with the same link and gets his place back. Only when the last player leaves is the game gone.
7. Once a game is under way, the browser asks before the page is closed, refreshed or left, so a stray Back button does not end it.

**Known limit: two players on the same network.** A player on the same wifi or home network as the host usually cannot join (tested: a phone joining a computer on one network fails, and the same phone on mobile data succeeds). Two browsers on one network can only reach each other through a relay server, and the game does not have a dependable one yet. Until it does, a player in the same house as the host should join over mobile data, or play from a different network. (For whoever runs the site: the fix is a relay account, whose details go in `src/net/relay.js`; the instructions are in that file.) The same message, "could not reach each other", can also mean a strict firewall or VPN. https://bobbfwed.github.io/No-Receipt-No-Mercy/tools/net-check.html shows what a given device's network allows.

The first connection goes through the free public PeerJS service, which only introduces the browsers to each other; the game data then travels directly between you. If that service is down, online games cannot start (solo still works).

## Head Office: one of you plays the shoppers
With two or more players, one can stop defending and run the other side. Between sales events, press **Run the shoppers** next to your name in the players list. Each build phase you then get a budget and buy the coming crowd: which kinds of shopper, how many, which entrance each group uses and when it arrives. Buy nothing and the usual crowd comes. You win if the store reaches its refund limit; the others win if it survives all 20 sales events. Somebody must always be left running the store.

## Controls
| Key or mouse | Does |
|---|---|
| 1 to 9, 0 | Pick a building (or click it in the bar) |
| Click | Build |
| Drag | Build a line; belts follow the drag |
| R | Rotate what you are holding, or the building under the mouse when holding nothing |
| U | Upgrade the security under the mouse (or pick the Upgrade tool and click). Each level costs nearly twice the last |
| B | Rebuild everything of yours that gym bros have wrecked |
| Right-click, or X then click | Remove (75% of what was spent on it back) |
| Esc | Put the tool down |
| W A S D, or arrow keys | Move the view around the map |
| Mouse wheel | Zoom. Middle-button drag also moves the view |
| F | Show the whole map |
| H | Go to your own entrance |
| Click the small map | Jump there (it appears when the store does not fit on screen) |
| Give $50 / $200 / $1,000 (players list) | Hand a colleague some of your cash |

## Carrying a game on another day
The host's browser saves the game by itself every few seconds while it is under way. Next time the host opens the game on the same device and browser, the menu offers **Resume saved game**, showing the sales event, the store, who was playing and when it was saved. Resuming makes him the host again. If others were in the game, a new room code appears: he sends it to them, and each gets his place and his money back by joining under the same name. There is one save per browser; a finished game clears it, and **Delete this save** throws it away. It is not saved online, so it cannot be resumed from a different device.

## On a phone or tablet
The game works by touch, in either orientation (a tablet, or a phone held sideways, is more comfortable).

| Touch | Does |
|---|---|
| Tap a button in the bar | Pick that building or tool; tap it again to put it down. Hold a button to read what it does |
| Tap the floor with a building picked | Build |
| Drag with a building picked | Build a line; belts follow your finger |
| Drag with nothing picked | Move the view |
| Two fingers | Move the view and pinch to zoom, whatever is picked |
| Tap a building with nothing picked | Opens its actions: rotate, upgrade, remove |
| Buttons at the end of the bar | Rotate, and put the tool down |
| MAP and HOME on the floor | Show the whole store; go to your entrance |
| The menu button at the top right | Speed, room code and link, sound, help |

The tutorial and the help text word their instructions for touch when the game is opened on a touch screen.

**Full screen.** The button at the top right (⛶, inside the menu button on a phone) switches full screen on and off on Android and on computers. To get an app icon that opens the game full screen:
- Android (Chrome): open the game, tap the browser's menu (three dots), then **Install app** or **Add to Home screen**.
- iPhone and iPad (Safari): tap the Share button, then **Add to Home Screen**. iPhones do not allow the full-screen button, so this is the only way there.
- Computer (Chrome or Edge): the install icon at the right of the address bar.

## Chat
With more than one player in the game, press Enter (or the Chat button) to type a line to everyone. It works in the lobby too.

## For developers
- `node --test` runs the tests.
- `PLAN.md` has the plan and the decisions taken so far.
- `docs/architecture.md` explains how the code is organised and the testing tools.
- `CLAUDE.md` has the project rules for AI assistants.
