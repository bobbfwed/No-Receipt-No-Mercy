// Your own relay server, for when two players cannot reach each other directly.
//
// Why: browsers in two houses usually find each other with the free public helper servers
// already listed in transports.js. But two players on the SAME network (the same house, the same
// wifi), or behind strict routers, office or mobile networks, need a relay (a "TURN server") to
// pass their traffic along, and the free public relays are often down. A relay of your own fixes
// that. Leave everything below empty and the game works as it always has.
//
// How to get one:
//   1. Sign up with a company that rents out TURN relays. Several have a free allowance that is
//      plenty for a few friends (for example Metered, metered.ca, under "TURN Server"; or
//      ExpressTURN, expressturn.com). Any provider that gives you a fixed username and password
//      for its TURN servers will do.
//   2. In its dashboard, find the page that shows your "ICE servers" or "TURN credentials". It
//      shows a list of addresses that start with turn: or turns: (for example
//      "turn:standard.relay.metered.ca:80" or "turns:standard.relay.metered.ca:443?transport=tcp"),
//      a username, and a password (often called "credential").
//   3. Paste them in below:
//        urls        every turn: and turns: address it lists, each in quotes, separated by commas
//        username    the username, in quotes
//        credential  the password, in quotes
//      Example of the shape (made-up values, these do not work):
//        urls: ['turn:relay.example.com:80', 'turn:relay.example.com:443?transport=tcp'],
//        username: 'a1b2c3d4e5',
//        credential: 'XyZ123secret',
//      All three are needed. If any is missing, the game ignores the relay altogether (a browser
//      refuses a relay without a username and password, and would refuse everything else with it).
//   4. Open http://localhost:5173/tools/net-check.html (or the same page on the published site).
//      It should list "your relay" and say it answered. If it says the relay is not used, it
//      says why.
//
// Be aware: this file is sent to every player's browser, so anyone who plays can read these
// details. Use the provider's own limits (a monthly cap) so nobody can run up a bill on you, and
// do not reuse a password you use anywhere else.

export const RELAY = {
  urls: [],
  username: '',
  credential: '',
};
