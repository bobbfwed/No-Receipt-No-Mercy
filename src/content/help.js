// Plain explanations of what each building does and how to use it. Shown in the info card when a
// building is picked in the build bar, and used by the tutorial. These are the "manual": keep them
// clear first and funny second. If a number in src/sim/constants.js changes, update the text here.

/** Per building: `does` = what it is for, `use` = how to place it so it works. */
export const HOW = {
  belt: {
    does: 'Carries goods one way, in the direction of its arrows.',
    use: 'Drag to lay a line: the belts follow your drag. Goods wait on the belt if the next tile cannot take them. Point at a belt and press R to turn it.',
    maze: 'Blocks shoppers, except dads, who step over it.',
  },
  unpacker: {
    does: 'The start of every production line. Makes a Mystery Box ($2) every 2.5 seconds, for free.',
    use: 'It pushes boxes out of the side with the arrow. Put a belt on that side. Press R before placing to choose the side.',
    maze: 'Blocks all shoppers.',
  },
  press: {
    does: 'Turns a Mystery Box ($2) into a Gadget ($7).',
    use: 'Run a belt of boxes into its back or either side. The Gadget comes out of the side with the arrow, so put a belt there.',
    maze: 'Blocks all shoppers.',
  },
  packer: {
    does: 'Turns a Gadget ($7) into a Gift Set ($16).',
    use: 'It only accepts Gadgets, so it goes after a Press. Feed it from the back or either side; the Gift Set comes out of the side with the arrow.',
    maze: 'Blocks all shoppers.',
  },
  chute: {
    does: 'The end of every production line. Anything pushed into it is sold on the spot and the cash goes into the shared pot.',
    use: 'Point the last belt of a line at it. It accepts goods from all four sides. Nothing earns money until it reaches a chute.',
    maze: 'Blocks all shoppers.',
  },
  crate: {
    does: 'A wall, and nothing else.',
    use: 'Use it to shape the route shoppers must walk. It is the cheapest way to stop a dad, who steps over belts but not crates.',
    maze: 'Blocks all shoppers, dads included.',
  },
  sprinkler: {
    does: 'Wears down the patience of every shopper within about 2 tiles, twice a second.',
    use: 'Short range, so put it right beside the route, best of all where shoppers are slowed or stopped.',
    maze: 'Blocks all shoppers.',
  },
  forklift: {
    does: 'Hits one shopper hard from up to 5 tiles away. It always picks the shopper closest to the tills.',
    use: 'Put it where its circle covers a long stretch of the route.',
    maze: 'Blocks all shoppers.',
  },
  wetfloor: {
    does: 'Shoppers crossing it walk at half speed. Dads ignore the sign and have a 1 in 3 chance of slipping and lying stunned.',
    use: 'It does not block the way, so it can sit right in a gap, next to a sprinkler. Mobility scooters are not affected.',
    maze: 'Does not block anyone.',
  },
  samples: {
    does: 'Bargain Hunters and Coupon Clippers within about 2 tiles stop for 2 seconds to eat.',
    use: 'Put sprinklers beside it so they are sprayed while they stand there. Dads, Karens and scooters do not stop.',
    maze: 'Blocks all shoppers.',
  },
};

/** What the Remove tool does, for the same info card. */
export const HOW_REMOVE = {
  does: 'Removes a building and gives back 75% of its price.',
  use: 'Click or drag over buildings. Right-clicking does the same without picking this tool.',
  maze: '',
};
