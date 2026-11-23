import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'how-to-estimate-a-deck-job',
  answer:
    'Estimate a deck job from the bottom up: footings and posts, then beams and joists, then decking, railing and stairs, then labor, permit and disposal, and finally overhead and profit. Do a material takeoff from a simple framing sketch instead of a price per square foot, because two decks of the same size can need very different framing, stairs and railing.',
  takeaways: [
    'Sketch the framing first: the takeoff comes from the sketch, not from the deck area alone.',
    'Railing and stairs often cost as much as the deck surface, so price them by the linear foot and by the step.',
    'Count hardware and fasteners as real lines: hangers, post bases, ledger fasteners and screws add up.',
    'Build labor from your own crew-days on similar decks and adjust for height, access and demolition.',
    'Write the permit, the inspections and what happens with rot found under an old deck into the estimate.',
  ],
  howTo: {
    name: 'How to estimate a deck job',
    totalTime: 'PT1H',
    steps: [
      { name: 'Measure and sketch', text: 'Measure the deck size, height above grade, stair run and railing length, and sketch the footings, beams and joists.' },
      { name: 'Take off the framing', text: 'Count footings, posts, beams, joists, rim joists, blocking and the ledger from the sketch.' },
      { name: 'Take off the surface', text: 'Work out the decking boards with waste, plus fascia and the fasteners for the surface.' },
      { name: 'Price railing and stairs', text: 'Price railing by the linear foot and stairs by the number of steps, including posts, stringers and treads.' },
      { name: 'Add hardware, permit and disposal', text: 'Add hangers, post bases, ledger fasteners and flashing, the permit fee, and tear-off and disposal if there is an old deck.' },
      { name: 'Price labor, overhead and profit', text: 'Build labor from your own production, then add overhead and profit and list inclusions and exclusions.' },
    ],
  },
  body: `Deck clients usually ask for a price per square foot. It is a fair question, and a bad way to build your own number. A low 12 by 14 deck with two steps and a short rail is a very different job from the same size deck eight feet off the ground with a full staircase and railing on three sides.

This guide walks through a deck estimate in the order you would build the deck: from the footings up. Every number below is an example only. Lumber and composite prices move often and differ by area, so use your supplier's current prices and your own labor data. Deck codes, permits and inspections vary by city and county, and this is not engineering or legal advice: spans, footing sizes and ledger attachment must follow your local code.

## Step 1: Measure and sketch before you count anything

On the site visit, write down:

- Deck length and width, and which side attaches to the house (ledger) or whether it is freestanding
- Height of the deck surface above the ground at its highest point
- Number of steps and where the stairs land
- Railing length: every open side plus both sides of the stairs
- What is there now: an old deck to tear out, a patio, soft ground, a slope
- Access: can material reach the back yard, or does everything get carried around the house

Then sketch the framing on paper or on a photo: where the footings go, which way the joists run, where the beam sits. You do not need a drawing for the permit yet; you need enough to count pieces. In ContractorDocs, the Measure button next to an estimate line ([documents](/features#documents)) adds up areas and linear feet with a waste percentage and puts the quantity straight on the line, on every plan.

## Step 2: Take off the framing

Count from the sketch, from the ground up:

| Item | How to count it | Notes |
| --- | --- | --- |
| Footings | One per post | Size and depth follow local code and soil |
| Posts | One per footing, length from footing to beam | Taller decks need longer posts and bracing |
| Beams | Total beam length, built-up plies counted separately | Span tables in your code decide the size |
| Joists | Deck width divided by joist spacing, plus one | Spacing depends on the decking you choose |
| Rim and end joists | Deck perimeter on the open sides | Often doubled where railing posts attach |
| Blocking | Rows between joists | Count rows times bays |
| Ledger | Length along the house | Flashing and fasteners are separate lines |

Joist spacing is worth checking before you count: some decking products need closer spacing than others, which adds joists. That is one of the reasons the same deck costs more in one material than another.

## Step 3: Take off the surface

For the decking boards, work in linear feet:

1. Deck area divided by the board's coverage width gives the linear feet of boards.
2. Add waste for cuts, ends and bad boards. Picture-frame borders and diagonal layouts waste more.
3. Round up to the board lengths your supplier stocks, planning the joints so they land on joists.

Add fascia boards if the rim is covered, and the surface fasteners: screws or hidden clips, counted from the number of joist crossings, plus the right screws for fascia.

## Step 4: Price railing and stairs on their own lines

Railing and stairs are where deck estimates go wrong. Price them separately so the client can see them and you can check them:

- Railing by the linear foot: posts (count them from your post spacing), top and bottom rails, balusters or infill panels, post caps and the hardware to fix the posts to the framing.
- Stairs by the step: stringers, treads, risers if closed, a landing pad at the bottom, and the stair railing on both sides if your code requires it.

If the deck is high enough that local code requires a guard, the railing is not optional, so it belongs in the base price, not in an add-on.

## Step 5: Hardware, permit and disposal

These are small lines that disappear into "miscellaneous" if you let them:

- Joist hangers, post bases, post-to-beam connectors and hurricane ties
- Ledger fasteners and flashing tape or metal flashing at the house
- Concrete for footings, or footing forms and gravel
- Permit fee and the time for inspections (footing, framing, final are common, but your jurisdiction decides)
- Tear-out of an old deck, dumpster or dump fees, and hauling

## Example: a 12 by 14 deck, all lines together

Example numbers only, for a low deck attached to the house with one short stair. Replace every figure with your own.

| Line | Amount (example) |
| --- | --- |
| Footings, posts, beam, joists, ledger, blocking | $1,450 |
| Decking boards and fascia with waste | $1,600 |
| Fasteners and structural hardware | $380 |
| Railing, 26 linear feet | $1,040 |
| Stairs, 3 steps with railings | $420 |
| Permit (example fee) | $150 |
| Labor, crew of two, 4 days | $3,200 |
| Direct cost | $8,240 |
| Overhead at 15% | $1,236 |
| Profit at 12% on cost plus overhead | $1,137 |
| Estimate total | $10,613 |

Look at the shape of it rather than the numbers: railing plus stairs is close to the cost of the deck surface itself. That is why a price per square foot quoted on the phone so often turns into a loss.

## Step 6: Build the labor from your own decks

Labor is the line you know best and record least. Use crew-days from decks you have already built:

1. How many crew-days did a similar size and height take, from layout to cleanup?
2. Adjust up for height, a slope, digging in hard ground, a long carry, demolition of an old deck and complicated stairs.
3. Multiply crew-days by the loaded daily cost of the crew (wages plus payroll costs).

If you do not have a loaded rate yet, [how to set your contractor labor rate](/blog/how-to-set-your-contractor-labor-rate) has the formula. After the job, compare estimated and real hours from your [time sheets](/blog/construction-time-sheet-tracking): that comparison is how your next deck price gets closer.

## Step 7: Write inclusions and exclusions

Deck disputes are usually about what was not said. Put it in writing:

- Included: footings, framing, decking, railing, stairs, hardware, permit, cleanup.
- Excluded: staining or sealing (or included, say which), lighting, electrical, landscaping repair after the work.
- Hidden conditions: rot in the house rim board behind the ledger, found only after the old deck comes off, priced as extra work and approved by the client first.
- Material changes: a switch from wood to composite after signing goes through a written [change order](/blog/change-order-form-guide).
- Schedule: inspection dates are set by the building department, not by you.

The same thinking applies to any job; [how to write a scope of work](/blog/how-to-write-a-construction-scope-of-work) shows how to phrase inclusions and exclusions so they hold up.

## Deck estimate checklist

- [ ] Size, height, stair run and railing length measured on site
- [ ] Framing sketched: footings, posts, beam, joists, ledger
- [ ] Joist spacing checked against the decking product
- [ ] Decking boards counted in linear feet with waste, rounded to stock lengths
- [ ] Railing priced by the linear foot, stairs by the step
- [ ] Hangers, connectors, ledger fasteners and flashing listed
- [ ] Permit fee and inspection time included
- [ ] Tear-out and disposal priced if there is an old deck
- [ ] Labor from your own crew-days, adjusted for height and access
- [ ] Overhead and profit added as separate lines
- [ ] Exclusions, hidden-rot rule and expiry date written down

## Sending the estimate

Put the lines into a clear estimate with the framing, surface, railing and stairs as separate sections, so the client can see where the money goes. With ContractorDocs you can build it on your phone, save your usual deck lines in the price book and let the client approve and sign from a link without an account. The [estimate generator](/estimate-generator) is a quick way to try the format, and [good, better, best pricing](/blog/good-better-best-pricing-for-contractors) works well for decks: pressure-treated, mid-range composite and premium composite as three options.

## What this does not cover

Structural design, footing sizes, span tables, guard heights and ledger attachment details are set by your local code and, for tall or unusual decks, by an engineer. Use this guide for the estimate, not for the design.`,
  faq: [
    {
      q: 'Should I price a deck per square foot?',
      a: 'A price per square foot is fine as a rough range on the phone, but build the real estimate from a material takeoff and your labor. Height, stairs and railing change the cost more than the area does.',
    },
    {
      q: 'What do deck estimates usually forget?',
      a: 'Railing on the stair sides, structural hardware and ledger flashing, the permit and inspection time, tear-out of an old deck and the rule for rot found behind the ledger.',
    },
    {
      q: 'How much waste should I add for decking boards?',
      a: 'It depends on the layout. Straight runs waste less than diagonal boards or a picture-frame border. Use the waste you have seen on your own decks and round up to stock board lengths.',
    },
    {
      q: 'How do I price a composite deck versus a wood deck?',
      a: 'Do the same takeoff twice. Besides the board price, composite can need closer joist spacing, different fasteners and its own trim. Offering both as options works well, as in [good, better, best pricing](/blog/good-better-best-pricing-for-contractors).',
    },
    {
      q: 'Who pulls the permit for a deck?',
      a: 'Usually the contractor doing the work, but rules vary by city and county. Say in the estimate who pulls it, who pays the fee and who is present for inspections.',
    },
  ],
  cta: {
    heading: 'Turn your deck takeoff into an estimate',
    text: 'Build the estimate on your phone, save your deck lines in a price book and let the client sign from a link. Free plan available.',
    href: '/estimate-generator',
    label: 'Try the free estimate generator',
  },
};

export default post;
