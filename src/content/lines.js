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
  kid: [
    'A child is loose. His mother is now the fastest thing in the building, and free samples will not slow her. Nothing slows a woman who has lost a toddler.',
    'Runaway kid on the floor. Reminder: you may not spray the child. I checked. I was disappointed too.',
    "Kid's out of the cart. {p} knows all about things getting loose when nobody's supervising.",
  ],
  // A mom ran out of patience with her child loose, and is crawling to him. Nothing can touch her.
  crawl: [
    "She's down, but the kid's still loose, so she's CRAWLING to him. You can't touch her now. Every shot you fire at her is wasted. Stop wasting them.",
    'A mother on her hands and knees going after a toddler. Unstoppable. Your security is now shooting at a force of nature.',
    "Mom's on the floor and still coming. {p}, that's more commitment than you've shown to anything.",
  ],
  smash: [
    "A gym bro just walked through your crate wall. {p}, your defence was beaten by a man who can't reach his own back.",
    "Crate stack down. He didn't go around it. Men like that never go around anything.",
    "That's a hole in your wall, {p}. Fill it. A sentence I never enjoy saying to you.",
  ],
  // A gym bro wrecked something that is not a crate stack. {k} is what it was.
  smashOther: [
    "A gym bro just put his fist through your {k}. No refund. He doesn't do refunds, he does 'reps'.",
    'There goes a {k}. {p}, a man in a vest two sizes too small is dismantling your life\'s work.',
    "He wrecked the {k}. Rebuild it, {p}. Out of your own pocket. I'd say sorry, but I'm enjoying this.",
    "Your {k} is now scrap. He called it 'functional training'. I call it Tuesday.",
  ],
  upgraded: [
    '{p} upgraded a {k} to level {n}. Throwing money at a problem. Finally, a strategy he can sustain.',
    "Level {n} {k}. {p} is compensating for something. We've all seen the staff shower.",
    "{p} paid for an upgrade. It's bigger and it lasts longer. Don't tell his wife that's available.",
  ],
  maxed: [
    "{p} has a level {n} {k}. That's the limit. Nothing gets bigger than that, however hard he pulls on it.",
  ],
  gave: [
    '{p} just handed {q} ${n}. Paying a man to do your job for you. Management material.',
    '{p} gave {q} ${n}. I assume this is for services rendered. I do not want details.',
  ],
  rebuilt: [
    '{p} rebuilt {n} things a man in a vest knocked over. Paying twice for the same wall. Just like his wedding.',
    '{p} put {n} things back up. If only that worked at home.',
  ],
  // Head Office: a player has gone over to the shoppers' side. {p} is him.
  officeTaken: [
    "{p} has been promoted to Head Office. He now sends the shoppers. He always wanted to screw the rest of you and get paid for it.",
    "{p} has gone over to Head Office. Same incompetence, bigger budget. He'll fit right in.",
  ],
  officeLeft: [
    '{p} is back on the shop floor. Head Office found someone who could count.',
    "{p} has given up the Head Office job. Turns out being the villain takes effort.",
  ],
  // He bought this wave himself. {n} is how many shoppers.
  officeWave: [
    "This crowd was hand-picked by {p}. {n} of them. If they get through, a man you know personally did this to you.",
    '{p} is sending in {n} shoppers he chose himself. He had a budget and a grudge. Mostly the grudge.',
    "{n} shoppers, courtesy of {p}. He's spent longer planning this than his own wedding.",
  ],
  // He planned nothing, so the usual wave came.
  officeNoPlan: [
    "{p} bought nothing, so here's the usual crowd. Head Office: where doing nothing is called 'strategy'.",
  ],
  // One side has asked for the doors to open and is waiting for the other.
  officeWaiting: [
    "The store is ready. {p}, we're all waiting on you to finish. Not for the first time.",
  ],
  storeWaiting: [
    '{p} is ready to send them in. The store is still fiddling with itself.',
  ],
  begun: [
    "Everyone's ready. That's a first. The clock starts when one of you builds something.",
    'All present and ready. I use both words loosely. Build something.',
  ],
  cramped: [
    'This store was built for {n}. There are now {m} of you in it. Try not to touch. Some of you will enjoy that too much.',
  ],
  superArrive: [
    'A {k} is in the building. Bigger, meaner, and takes a double refund. Like your ex with a lawyer.',
  ],
  mess: [
    'A teenager has spilled a slushie. It is slowing everyone else down. First useful thing a teenager has ever done.',
    'Mess in the aisle. Leave it. It is working harder than {p}.',
  ],
  bolt: [
    'You pepper-sprayed a guide dog. It is now dragging its owner to the tills at speed. Use a forklift, you animals.',
    'The dog bolted. Sprinklers make that one FASTER, {p}. Read the manual. Have someone read it to you.',
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
    packer: ['A Packer. Same Gadget, nicer box, more than twice the price. {p} finally understands retail. And dating.'],
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

/**
 * What DEB says the first time a kind of shopper turns up: one line that explains its trick.
 * (Dads have their own announcement every wave, in LINES.dadLine.)
 */
export const INTRO = {
  clipper: 'New today: Coupon Clippers. Lots of them, fast, and each one easily discouraged. Like your exes.',
  mom: 'New today: moms with kids. The kid escapes and runs straight through your machines; she sprints round the maze after him and will not stop for your free samples.',
  teen: "New today: teenagers. They spill slushies that slow everyone else down. Don't thank them. They hate that.",
  karen: 'New today: Karens. Security near one works at half speed, because she is asking it for the manager.',
  blind: 'New today: a man with a guide dog. Pepper spray makes the dog bolt, so sprinklers speed him UP. Use forklifts.',
  scooter: 'New today: mobility scooters. Nothing slows them. Not wet floors, not free samples, not shame.',
  gymbro: 'New today: gym bros. They walk through crate stacks and wreck whatever is next to them: crates always, your machines when the mood takes them. Stop them early. Or use a mirror.',
};

/** What DEB says the first time the super version of a kind turns up. */
export const SUPER_INTRO = {
  hunter: 'New and worse: the Doorbuster. A Bargain Hunter with three times the patience. She camped outside since Tuesday. She has nothing to go home to. You two should talk.',
  dad: "New and worse: Dad on a Mission. Faster, far more patient, and he does not slip. He has the receipt, the box and a tee time. God help you.",
  clipper: 'New and worse: the Extreme Couponer. Faster, tougher, and she has a binder. Nobody with a binder has ever been reasoned with.',
  mom: 'New and worse: the Soccer Mom. Her kid escapes twice as often and she chases him three times as fast. Nothing in this building moves like a woman late for practice.',
  karen: 'New and worse: Karen Supreme. Four times the patience, and security slows to a crawl twice as far away. She does not want the manager. She wants the owner. And his mother.',
  teen: 'New and worse: the Teen Influencer. Three times the mess and he is filming it. Smile, {p}, you are content now.',
  gymbro: "New and worse: the Roid Rager. He wrecks nearly everything he passes. It isn't anger, he says. It's 'pre-workout'.",
  scooter: 'New and worse: the Turbo Scooter. Still cannot be slowed, now nearly twice as fast. He removed the limiter himself. He removed the brakes by accident.',
  blind: 'New and worse: a man with TWO guide dogs. They bolt from forklift hits as well, further and faster. You are being outrun by a blind man. Reflect on that.',
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
  teen: [
    [1, 'Spilled a slushie in aisle four. Nobody said anything. Nobody ever says anything.'],
    [1, "Got a refund on shoes I'm literally wearing."],
    [1, 'The staff are, like, forty. It was sad.'],
  ],
  mom: [
    [1, 'Lost my son twice. Found him both times. Refund processed between incidents.'],
    [1, "Free samples? I haven't sat down since 2019."],
    [1, 'My child licked a conveyor belt. Nobody stopped him. One star, and a tetanus shot.'],
  ],
  blind: [
    [1, "Couldn't see what all the fuss was about."],
    [1, "Someone pepper-sprayed my dog. He's fine. He's eaten worse. I've smelled this store."],
    [1, 'The dog chose the route. The dog was right. The dog should be running this place.'],
  ],
  gymbro: [
    [1, "Walked through a wall of crates, bro. Didn't feel a thing. Refund on the protein, it was mostly sawdust."],
    [1, "Staff wouldn't spot me. Couldn't stop me either."],
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
  teen: [[1, 'Got forklifted. Whatever.'], [1, 'This place is cringe. Leaving.']],
  mom: [
    [1, 'Pepper-sprayed while holding a toddler. We are LEAVING.'],
    [1, 'I do not have time for this. I do not have time for anything.'],
  ],
  blind: [[1, 'The dog wanted to leave. I trust the dog.']],
  gymbro: [
    [1, 'Got hit by a forklift. Counting it as cardio.'],
    [1, "Leaving, bro. It's leg day anyway. It is never leg day."],
  ],
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
  cash: ["You can't afford that. Add it to the list, {p}.", 'Insufficient funds. A phrase {p} knows from dating.', "Not with YOUR money, {p}. Beg a colleague. You're good on your knees, I hear."],
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
  lobby: ["We haven't opened yet, {p}. Press Ready. It's the big button. I made it big specially."],
  host: ['Only the host picks the store, {p}. You just get to complain about it.'],
  zone: [
    "Not there, {p}. That machine only goes on its own painted floor. The floor has words on it. Sound them out.",
    "Wrong floor, {p}. Each machine has its own marked patch. It's colour-coded, for people exactly like you.",
    "That goes on the painted floor with its name on it, {p}. Putting things in the wrong place is how you ended up with three kids.",
  ],
  office: ["You're Head Office now, {p}. You don't touch the store. You just ruin it from a distance."],
  taken: ["Someone already has the Head Office job, {p}. One villain at a time. HR policy."],
  lonely: ["Somebody has to run the store, {p}. You can't play with yourself. Not here, anyway."],
  budget: ["You can't afford that crowd, {p}. Even imaginary people are out of your price range."],
  locked: ["They haven't turned up yet, {p}. You can't order what isn't on the menu. Ask your wife."],
  door: ["That entrance isn't open, {p}. Find one that is. You've had practice."],
  noup: ["That can't be upgraded, {p}. Only security can. Some things just stay the size they are. You'd know."],
  max: ["It's at the top level, {p}. It will not get any bigger. I know you've heard that before."],
};

/** Fills {p}, {n}, {w} and other one-letter placeholders in a line. */
export function fill(text, vars = {}) {
  return text.replace(/\{(\w)\}/g, (m, key) => (vars[key] !== undefined ? String(vars[key]) : m));
}

/** A refusal line for the local player. */
export function nopeLine(why, name, random = Math.random) {
  const bank = NOPE[why] || NOPE.bounds;
  return fill(bank[(random() * bank.length) | 0], { p: name });
}
