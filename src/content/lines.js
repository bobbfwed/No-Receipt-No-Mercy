// Every line of dialogue in the game. Adults only, by design: see the Tone section of CLAUDE.md.
// Placeholders: {p} a player's name, {n} a number, {w} the wave number.

export const LINES = {
  waveStart: [
    'Sales event {w}. Doors open. Try to look employed.',
    'Here they come. Remember: the customer is always right, and you are always wrong.',
    'Doors open. {p}, stop adjusting yourself and look at the floor plan.',
    'Sales event {w}. Corporate is watching. So am I. Mostly {p}, and mostly out of pity.',
    "Opening the doors. If anyone needs me, I'll be updating your files. Negatively.",
    "Event {w}. I've seen better defensive setups at a retirement home singles night.",
    'Sales event {w}. Please keep your hands on the merchandise and off each other.',
    "Doors open. {p}, whatever that layout is, I hope it's a cry for help.",
  ],
  dadLine: [
    'Dad line incoming: {n} men who parked in the fire lane and left the engine running.',
    '{n} dads inbound. They have receipts, they know where the desk is, and they will not be making eye contact.',
    "Heads up: {n} dads. Each one told his wife 'two minutes'. Make liars of them.",
    "A line of {n} dads. Don't bother with free samples. These men haven't been tempted by anything but a nap since 2014.",
    '{n} dads, single file, like ducks with back problems.',
    "Dad line: {n}. They won't fight you. They'll just sigh until someone dies.",
    '{n} dads coming through. The only thing that stops a dad is time. Waste his.',
    "{n} dads. They don't walk around a conveyor belt. They step over it, mutter \"'scuse me\", and keep going.",
    'Dad line, {n} strong. Your belts are not a wall to these men. They are a mild inconvenience, like their children.',
  ],
  manyEscapes: [
    "That's {n} refunds in a row. {p}, were the towers decorative?",
    "They're just... walking through. Like {p}'s boundaries.",
    '{n} more refunds. At this rate corporate will replace you with a sign. The sign would keep better hours.',
    "I've seen tighter security at a nudist beach.",
    '{n} refunds. {p}, I\'ve had firmer resistance from a wet paper bag, and I\'ve had better conversation.',
    'Refund desk is slammed. The only thing getting stopped today is my respect for you.',
  ],
  grab: [
    'A shopper just lifted stock straight off the belt. {p}, guard your goods like you guard your browser history.',
    "Shoplifting on the line. I'd say which belt, but I don't respect them enough to number them.",
    "Stock is walking out the door. Much like {p}'s last three girlfriends.",
    "Someone's fondling the merchandise. For once it isn't {p}.",
  ],
  slip: [
    "Dad down. He ignored the sign. They always ignore the sign. It's how most of them became dads.",
    "A dad slipped on the wet floor. He says he's fine. He will mention his back for the next nine years.",
    "Man down in aisle six. He's lying there saying 'I'm good' in a voice that isn't.",
    'A dad just hit the floor. Nobody saw. He looked around to check. That\'s the part that hurts.',
  ],
  removed: [
    '{p} just sold something he bought a moment ago. Decisive. Like a man choosing a paint colour.',
    "Buying it and selling it again, {p}? That's not a strategy, that's a divorce.",
    '{p} removed his own work. First good call all shift.',
    '{p} tore it out. Pulling out at the last second is a habit with him, I\'m told.',
  ],
  removedOther: [
    "{p} just ripped out someone else's work. Bold. Wrong, but bold.",
    "{p} is dismantling a colleague's build. This is why you all eat lunch alone.",
  ],
  placed: {
    forklift: ['{p} bought a forklift turret. Finally, something on this floor with a working lift.'],
    samples: ['Free samples. {p} knows the way to slow anyone down is cheese on a stick.'],
    crate: ['{p}, crates are not a personality.', 'More crates. {p} is building a fort. He is forty.'],
    sprinkler: ['Another pepper sprinkler. HR would object, but HR is me, and I enjoy it.'],
    packer: ['A Packer. Same Gadget, nicer box, triple the price. {p} finally understands retail. And dating.'],
    wetfloor: ["A wet floor sign. {p}'s most effective security measure is a piece of yellow plastic."],
    belt: ['{p} is laying belt. It\'s the most action that floor has seen in years.'],
  },
  firstSale: [
    "A product has shipped. I'm as surprised as you are.",
    'First sale of the day. Frame the receipt. It may be the last.',
  ],
  buildEnding: [
    "Doors open in ten seconds. Whatever {p} is building, it won't help.",
    'Ten seconds. {p}, finish up. A phrase you hear a lot, I imagine.',
  ],
  joined: [
    '{p} has clocked in. Standards have clocked out.',
    '{p} joins the shift. I\'ve lowered expectations accordingly. They were on the floor already.',
  ],
  quit: [
    '{p} has left. Productivity is unchanged.',
    '{p} walked out. The team is now smarter on average.',
  ],
  won: [
    'Twenty sales events survived. Corporate is thrilled. Your bonus is a pizza party. You are bringing the pizza.',
    "You did it. I've checked the footage twice for cheating. Found other things. We'll talk Monday.",
  ],
  lost: [
    "That's the refund limit. Corporate has closed the store. I've never seen so many men fail to stop something they started.",
    'Store closed. You are all fired. Please return your lanyards, your dignity is already in lost property.',
  ],
  report: [
    'Reminder: the stockroom is not for crying. Or the other thing. We have cameras, {p}.',
    'I have attached your performance to your permanent record. And to the break room wall.',
    'Overall: adequate, in the way a gas station sandwich is adequate.',
    "I've forwarded this review to your mothers. Two of them replied 'sounds right'.",
    'Team synergy is at an all-time low. Team hygiene, lower.',
    "I ran the numbers. Then I ran them again sober. They're still bad.",
    '{p}, your results this event were short, disappointing and over quickly. No further comment.',
  ],
  reportNoStops: ['{p} stopped nobody this event. A wet floor sign stopped more, and it has no pension.'],
  reportNoShips: ['{p} shipped nothing this event. In fairness, that matches his output at home.'],
  reportPerfect: ["No refunds this event. I checked the cameras for cheating. I found something worse. {p}, we'll talk."],
};

/** Customer reviews when a shopper reaches the tills and gets a refund. */
export const ESCAPE_REVIEWS = {
  hunter: [
    [1, "Walked straight through. Staff were too busy touching each other's conveyor belts."],
    [1, 'Got a full refund on a thing I found in the car park. Would exploit again.'],
    [1, 'No one stopped me. No one even looked up. Like being married.'],
    [1, 'Security was a wet floor sign and a man called {p}. I feared neither.'],
    [1, 'Refund desk had no queue, because nothing here works.'],
  ],
  clipper: [
    [1, 'Used nine coupons on one refund. The staff member cried. Five stars for me, one for him.'],
    [1, "Fast, easy, unsupervised. Like {p}'s childhood."],
    [1, 'They owe ME money now. I do not know how. I will not be asking.'],
  ],
  dad: [
    [5, 'In and out in four minutes. Nobody spoke to me. Perfect.'],
    [5, "Got my refund, didn't have to talk about my feelings. Outstanding."],
    [5, "Wife said it'd take an hour. Took three minutes. Sat in the car for the other fifty-seven."],
    [5, 'Efficient. Staff too incompetent to slow me down.'],
    [5, 'Returned the pressure washer. Kept the pressure.'],
    [5, 'Did not have to ask for directions. Would not have anyway.'],
  ],
  karen: [
    [1, 'Spoke to four managers. All of them were {p}. None of them were men.'],
    [1, "I was SPRAYED. I got my refund AND a voucher AND {p}'s job."],
    [1, 'The forklift driver made eye contact with my chest. Refund accepted.'],
  ],
  scooter: [
    [1, 'Nothing could stop me. I am eighty-four and I am inevitable.'],
    [1, "Ran over a young man's foot. He apologised. Refund processed."],
  ],
};

/** Reviews from shoppers who gave up and left without a refund. */
export const LEFT_REVIEWS = {
  hunter: [
    [1, 'Pepper sprayed in housewares. Again.'],
    [1, 'A forklift shot at me. I only wanted to return a blender.'],
    [1, 'Stood at the free samples so long I forgot why I came.'],
  ],
  clipper: [[1, 'They sprayed my coupons.'], [1, 'Chased out by a forklift. Still had a 2-for-1.']],
  dad: [
    [1, "Forget it. I'll come back Tuesday."],
    [1, 'Line was too long. Went home and fixed it myself. Badly.'],
    [1, "Twenty minutes in that maze. I've had shorter marriages."],
    [1, 'Gave up. Told the wife they were closed.'],
    [1, 'Not waiting. I have a lawn.'],
  ],
  karen: [[1, 'I have never been so insulted, and I have been to a book club.']],
  scooter: [[1, 'Battery died in aisle nine. So did my will.']],
};

export const STAMPS = {
  top: ['ADEQUATE', 'TOLERABLE', 'LEAST BAD', 'SUSPICIOUSLY COMPETENT'],
  middle: ['PRESENT', 'MEDIOCRE', 'FINE, I GUESS', 'BREATHING'],
  bottom: ['LIABILITY', 'WHY IS HE HERE', 'SEE ME', 'HR RISK', 'DEAD WEIGHT'],
};

export const EMPLOYEES_OF_THE_WAVE = [
  'Nobody', 'Nobody (again)', 'The forklift', 'A wet floor sign', 'The vending machine', 'A dad who left',
];

/** What DEB says to you alone when your command is refused. Keyed by the reason from canPlace. */
export const NOPE = {
  cash: ["You can't afford that. Add it to the list, {p}.", 'Insufficient funds. A phrase {p} knows from dating.'],
  blocked: [
    "You can't wall the customers out, {p}. Legal checked. Twice.",
    'That would block the way to the tills. Tempting, but illegal.',
  ],
  occupied: ["There's already something in there. Two things can't go in one slot, {p}. Ask anyone."],
  shopper: ["There's a customer standing there. Dropping a machine on him is 'assault', apparently."],
  bounds: ["You can't build there. That's a wall. It's doing more work than you."],
  over: ['The store is closed. Building now would just be sad.'],
  phase: ['The doors are already open, {p}. Do keep up.'],
  notyet: ["Not yet, {p}. Do the thing I asked first. It's called foreplay."],
  empty: ["There's nothing there, {p}. Like your Friday nights."],
};

/** Fills {p}, {n}, {w} in a line. */
export function fill(text, vars = {}) {
  return text.replace(/\{(\w)\}/g, (m, key) => (vars[key] !== undefined ? String(vars[key]) : m));
}

/** A refusal line for the local player. */
export function nopeLine(why, name, random = Math.random) {
  const bank = NOPE[why] || NOPE.bounds;
  return fill(bank[(random() * bank.length) | 0], { p: name });
}
