import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'punch-list-template-for-contractors',
  answer:
    'A punch list template needs one row per item with the room or area, a specific description of what is wrong, who fixes it, a due date, its status and a photo, plus a sign-off line for the client. Walk the job with the client before the final invoice, write every item in that format, fix them in a set order and get the list approved in writing.',
  takeaways: [
    'One item per line, always with the location: "Kitchen: touch up paint left of window", not "paint touch-ups".',
    'Give every item an owner and a due date, or it will still be open in three weeks.',
    'Separate "done" from "verified": the person who did the fix should not be the one who closes it.',
    'Agree on what counts as a punch item before the walkthrough, so new requests become change orders.',
    'Close the list with the client in writing, then send the final invoice.',
  ],
  body: `The punch list is the last stretch of a job, and often the slowest. Ten small items can hold up a final payment for weeks if nobody owns them, nobody can tell which closet "the door that sticks" is in, or the client keeps adding new requests to the list.

Below is a punch list template you can copy, a filled-in example, the walkthrough routine that keeps the list short, and the rules that stop it from turning into free extra work. If you want the full end-of-job routine (final invoice, warranty, lien waivers), see the [job closeout checklist](/blog/job-closeout-checklist-for-contractors); this page is only about the punch list itself.

## Punch list template (copy this)

Copy the table into a document or spreadsheet. One row per item.

| # | Room or area | Item (what is wrong, exactly where) | Trade or person | Due | Status | Photo |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | Open | |
| 2 | | | | | Open | |
| 3 | | | | | Open | |

Header fields to put above the table:

- Job name and address
- Date of the walkthrough and who was there
- Contract or estimate number the list belongs to
- Target date to finish all items

Footer to put below the table:

- "Items above are the complete punch list agreed at the walkthrough on (date). New requests after this date are handled as change orders."
- Client signature and date when all items are complete
- Contractor signature and date

That footer line is the most useful sentence in the whole template. It turns an endless list into a fixed one.

## Example: a filled-in punch list

Example from a kitchen remodel; names and dates are examples only.

| # | Room or area | Item | Trade or person | Due | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Kitchen | Touch up paint on the wall left of the window, 6 inches above the counter | Painter, Ana | Tue | Verified |
| 2 | Kitchen | Upper cabinet door right of the hood rubs the frame, adjust hinge | Carpenter, Mike | Tue | Done |
| 3 | Kitchen | Caulk gap between backsplash and counter at the sink end | Mike | Tue | Open |
| 4 | Dining | Light fixture cover missing one screw | Electrician | Wed | Open |
| 5 | Hallway | Scuff on baseboard near the kitchen doorway | Ana | Tue | Verified |
| 6 | Exterior | Remove leftover drywall scraps from side yard | Crew | Mon | Verified |

Notice what each item has: a room, an exact location, a verb (adjust, caulk, remove) and a person. "Fix cabinets" is not a punch item. "Upper door right of the hood rubs the frame" is.

## Status: open, done, verified

Use three states, not two:

1. Open: the item is on the list and not fixed.
2. Done: the person who fixed it says it is fixed.
3. Verified: someone else (you, the lead or the client) checked it and agrees.

The gap between done and verified is where callbacks come from. A painter marks the touch-up done; the client sees a different sheen in daylight. Verifying in person closes that gap before the client finds it.

## How to run the punch walkthrough

1. Do your own walk first. A day before the client walkthrough, walk the job with your lead and fix what you find. A short client list looks professional; a long one looks unfinished.
2. Walk room by room in a fixed order. Start at the front door and go clockwise, so nothing is skipped and the list is grouped by room.
3. Write it as you walk. Type each item on your phone while standing in front of it, not from memory in the truck.
4. Photograph each item. A photo of the scuff with the doorway in the shot settles "which scuff?" later. See [what to photograph and when](/blog/job-site-photos-for-contractors) for the habits that make photos useful.
5. Read the list back. At the end, read every item aloud and ask the client: "Is this everything?" Then write the date on the list.
6. Assign and date. Before you leave, give each item a name and a day.

## In what order to fix punch items

The order matters more than it looks. Fix things in the wrong sequence and you create new punch items: a painter touches up a wall, then the electrician scuffs it putting the cover plate back.

A sequence that avoids most rework:

1. Anything that affects safety or use first: a loose railing, a missing cover plate, a door that does not latch.
2. Rough and dirty fixes next: adjusting doors, re-setting a tile, cutting or drilling.
3. Caulk and fill after that, once nothing else will move.
4. Paint and touch-ups near the end, so nobody marks them again.
5. Cleaning last, then the verify walk.

Group items by trade so each person comes back once, not three times. If the electrician has two items in different rooms, put both on the same day. A single visit per trade is usually what decides whether a punch list takes three days or three weeks.

Keep the client informed while you work through the list. A short message such as "8 of 11 items done, the rest on Thursday" heads off most "is anyone still working on my house?" calls.

## Punch items versus new work

Clients often use the walkthrough to ask for things that were never in the contract: "while you are here, could you also add a shelf in the pantry?" That is a fair request, and it is new work.

| It is a punch item if... | It is a change if... |
| --- | --- |
| It was in the scope and is not finished or not right | It was never in the scope |
| It is damage caused during the job | It is an existing problem you did not touch |
| The fix brings the work up to what was agreed | The fix upgrades the work beyond what was agreed |

New work goes on a written [change order](/blog/change-order-form-guide) with its own price, not on the punch list. Being clear about this at the walkthrough, politely, is much easier than arguing about it after the final invoice. A clear [scope of work](/blog/how-to-write-a-construction-scope-of-work) at the start makes this conversation short.

## Punch list checklist

- [ ] Your own walk done the day before the client walkthrough
- [ ] Every item has a room, an exact location and a verb
- [ ] Every item has a person and a due date
- [ ] Every item has a photo
- [ ] List read back to the client and dated
- [ ] New requests moved to change orders, not the punch list
- [ ] Each item marked done, then verified by someone else
- [ ] Client sign-off on the completed list
- [ ] Final invoice sent after sign-off

## Doing it on a phone

A paper punch list works, but it gets wet, lost and retyped. In ContractorDocs, every job has a Punch list tab on every plan: you type one item per line while you walk (start with the room and it sticks for the next items, end with @Name to assign it), mark items done and then verified, and attach a before and after photo to each one. Adding and checking off items works without signal and syncs later. You can show the list in the client portal, where the client taps Looks good or Needs work on each finished item, and download the list as a PDF with photos. The [features page](/features#client-portal) shows the client portal, and [work order examples](/blog/work-order-examples-for-contractors) include a punch list work order for a subcontractor.

When the last item is verified, send the final invoice the same day; the [invoice generator](/invoice-generator) is a quick way to see the format.

## What this does not cover

Formal punch lists on commercial projects (architect inspections, certificates of substantial completion, retainage release) follow the contract documents and the owner's process. Rules about final payment timing vary by state and contract, and this is not legal advice.`,
  faq: [
    {
      q: 'What is a punch list in construction?',
      a: 'A punch list is the list of small items that are unfinished or not right near the end of a job, such as touch-up paint, a sticking door or missing caulk. The job is complete when every item is fixed and checked.',
    },
    {
      q: 'What should a punch list template include?',
      a: 'Job name and address, walkthrough date, and one row per item with the room, an exact description, the person responsible, a due date, the status and a photo, plus a client sign-off line.',
    },
    {
      q: 'Who creates the punch list, the contractor or the client?',
      a: 'Usually the contractor writes it during a walkthrough with the client. Doing your own walk first keeps the client list short. Both sign the final list.',
    },
    {
      q: 'Can a client keep adding items to the punch list?',
      a: 'Agree in writing that the list is complete as of the walkthrough date. Later requests that are new work go on a [change order](/blog/change-order-form-guide) with a price.',
    },
    {
      q: 'When should I send the final invoice?',
      a: 'Right after the punch list is verified and signed off. See the [job closeout checklist](/blog/job-closeout-checklist-for-contractors) for the full end-of-job steps.',
    },
  ],
  cta: {
    heading: 'Run your punch list from your phone',
    text: 'Add items as you walk, assign them, attach photos and let the client approve each one in the portal. Punch lists are on the free plan.',
    href: '/auth/signup',
    label: 'Start free',
  },
};

export default post;
