import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'how-to-estimate-a-painting-job',
  answer:
    'To estimate a painting job, measure the paintable surfaces, work out how much paint and prep material you need, estimate the labor hours for prep, priming and each coat, then add overhead and profit. Price the prep and the coats as separate lines, because prep is where most painting jobs lose money.',
  takeaways: [
    'Measure surfaces, not just floor area: walls, ceilings, trim and doors each take different time and paint.',
    'Prep usually takes as long as painting, so give it its own line in the estimate.',
    'Build the price from hours and materials you can defend, then add overhead and profit on top.',
    'Write down what is not included (furniture moving, repairs, color changes) before the client signs.',
  ],
  howTo: {
    name: 'How to estimate a painting job',
    totalTime: 'PT45M',
    steps: [
      { name: 'Walk and measure', text: 'Measure walls, ceilings, trim and doors room by room and note surface condition.' },
      { name: 'Calculate paint and materials', text: 'Convert square footage to gallons using the coverage on the can label, plus primer and supplies.' },
      { name: 'Estimate labor hours', text: 'Estimate hours for prep, priming and each coat separately, using your own past jobs.' },
      { name: 'Add overhead and profit', text: 'Add your overhead share and a profit margin to the direct cost.' },
      { name: 'Write the scope and exclusions', text: 'List what is included and what is not, then send a clear estimate for approval.' },
    ],
  },
  body: `A painting estimate looks simple: count the rooms, multiply by a number, done. That is also how painters end up working weekends on a job that paid for two days. The surface area is only half the story. Prep, repairs, drying time and the number of coats decide whether the job makes money.

This guide shows a method you can repeat on any interior or exterior job. Every number in the examples is an example, not a rate to copy: your labor cost, local paint prices and speed are yours to measure. If you want the same logic in a template, start from our [construction estimate template](/blog/construction-estimate-template) or the free [estimate generator](/estimate-generator).

## Step 1: Walk the job and measure

Never price from a phone call alone. Walk every room and write down:

- Wall height and length of each wall, or the room dimensions
- Ceiling area if it is being painted
- Linear feet of baseboard, crown and window trim
- Number of doors and windows, and whether doors are painted on both sides
- Condition of the surfaces: holes, cracks, peeling, stains, glossy finishes, previous dark colors
- Access problems: high ceilings, stairs, furniture that cannot be moved, occupied rooms

Photos of each room help later, and they protect you if the client says the walls were perfect before you started.

## Step 2: Calculate the paintable area

For a room, add up the wall lengths and multiply by the height. Many painters do not subtract a single door or window, because the waste and the cutting-in time roughly cancel the saving.

Example room (example numbers only): 12 ft by 14 ft, 8 ft ceiling.

| Item | Calculation | Result |
| --- | --- | --- |
| Walls | (12 + 14 + 12 + 14) x 8 ft | 416 sq ft |
| Ceiling | 12 x 14 | 168 sq ft |
| Baseboard | perimeter | 52 linear ft |
| One door, both sides | counted per door | priced per item |

Keep walls, ceilings and trim in separate lines. They need different paint, different tools and different time.

## Step 3: Convert area to paint

Read the coverage on the can you plan to use, usually given as square feet per gallon for one coat. Divide the area by that number, multiply by the number of coats, and round up. Then add a little for texture, porous walls and mistakes.

Example (assume the label says about 350 sq ft per gallon): 416 sq ft of wall with two coats is 832 sq ft of coverage, which is a bit over two gallons. Round to three gallons for waste and touch-ups. New drywall, bare wood or a big color change may need primer first, so add it as its own material line.

Do not forget the small things that add up: tape, plastic and drop cloths, caulk, patching compound, sandpaper, roller covers, brushes and disposal. Many painters add a flat supplies line per room or per job so the estimate does not turn into a shopping list.

## Step 4: Estimate labor hours (prep first)

Labor is where estimates go wrong, so split it into stages:

| Stage | What it includes |
| --- | --- |
| Prep | Moving and covering furniture, patching, sanding, caulking, taping, cleaning |
| Priming | Spot priming or a full primer coat, plus drying time |
| Coat 1 | Cutting in and rolling |
| Coat 2 | Same again |
| Trim and doors | Brushing or spraying, often slower per square foot than walls |
| Cleanup | Removing tape and plastic, touch-ups, final walkthrough |

The only honest source for how long each stage takes is your own history. Time a few jobs, note the hours per room or per 100 sq ft, and reuse those numbers. If you have no history, take a conservative guess, then compare it with the real hours after the job and correct it. The tracking habit in [how to calculate job profit margin](/blog/how-to-calculate-job-profit-margin) is the same one that keeps these numbers honest.

Example (hours are an example): prep 3 hours, priming 1, two coats on walls and ceiling 4, trim and door 2, cleanup 1. That is 11 hours for this one room.

Multiply the hours by your loaded labor rate, meaning wages plus the payroll costs and overhead you actually carry. If you are not sure what that number is, read [how to set your contractor labor rate](/blog/how-to-set-your-contractor-labor-rate) first.

## Step 5: Add overhead, profit and a contingency

Direct cost is labor plus materials. Your price must also cover the truck, insurance, phone, software, tools, estimating time and the days between jobs, and then leave a profit.

Example with made-up numbers:

| Line | Amount (example) |
| --- | --- |
| Labor, 11 hours at $45 loaded | $495 |
| Paint, primer, supplies | $140 |
| Direct cost | $635 |
| Price at a 35% margin | about $977 |

To get a price from a margin, divide the direct cost by one minus the margin: 635 divided by 0.65 is about 977. Adding 35% on top of the cost gives a lower price (about 857) and a smaller real margin, which surprises many people. Our guide on [profit margin](/blog/how-to-calculate-job-profit-margin) explains the difference.

If the walls are in rough shape or the client is vague about what they want, add a small contingency or write the repairs as an allowance, so a surprise does not come out of your pocket.

## Step 6: Write the scope and the exclusions

A good painting estimate says exactly what happens and what does not. List the rooms, the surfaces, the number of coats, the product or paint line, the colors (or that the client chooses them), and who moves furniture. Then add exclusions, for example:

- Repairs beyond minor patching
- Wallpaper removal
- Painting inside closets or cabinets unless listed
- Color changes after work has started
- Work over lead paint, which has its own rules

If any of that changes mid-job, handle it with a signed [change order](/blog/change-order-form-guide) so the extra work is priced before you do it. For the wording of the scope itself, see [how to write a construction scope of work](/blog/how-to-write-a-construction-scope-of-work).

## Painting estimate checklist

Before you send the estimate, check each of these:

- [ ] Every room measured, with photos taken
- [ ] Walls, ceilings, trim and doors priced as separate lines
- [ ] Prep time included, not guessed at the end
- [ ] Paint quantity based on the label coverage and number of coats
- [ ] Primer, tape, plastic, caulk and supplies included
- [ ] Labor priced at a loaded rate, not just wages
- [ ] Overhead and profit added
- [ ] Exclusions and the start date written down
- [ ] Estimate valid until a stated date

## Common painting estimate mistakes

The first is pricing by square foot of floor with one number for everything. A bare, clean room and a room with water stains and dark colors are not the same job. The second is forgetting drying time between coats, which affects the schedule and sometimes means a second day. The third is skipping the walkthrough, so the first time you see the damaged ceiling is on the day you start.

Finally, do not let a rough guess become a verbal promise. Put it in writing, get approval, and send the estimate in a form the client can sign on a phone. Our guide to [sending an estimate clients can sign on their phone](/blog/send-estimate-clients-can-sign-on-phone) covers that part, and the [page for painters](/for/painters) shows how the estimate, change orders and invoice fit together for a painting business.

## What this guide does not cover

It does not give local paint or labor prices, because those vary widely and change. It also does not cover specialty coatings, exterior work at height, lead-safe practices or licensing rules, all of which depend on your location. Check your local requirements.`,
  faq: [
    {
      q: 'How do you calculate how much paint you need for a room?',
      a: 'Multiply wall length by height to get wall area, divide by the coverage per gallon on the can, multiply by the number of coats, and round up. Add a little extra for texture and touch-ups. Ceilings and trim are calculated separately.',
    },
    {
      q: 'Should I charge by square foot or by the hour for painting?',
      a: 'Either works if the number comes from your real costs. Many painters build the price from hours and materials, then show the client a per-room or per-area price. A single per-square-foot rate hides prep and repair work, which is where margin gets lost.',
    },
    {
      q: 'How long does prep take compared with painting?',
      a: 'It depends on the surfaces, but prep often takes as long as the painting itself on older or damaged rooms. Time your own jobs and keep the hours per room so the next estimate is based on real data.',
    },
    {
      q: 'What should a painting estimate include?',
      a: 'The rooms and surfaces covered, the number of coats, the paint or product, who supplies it, prep and repair work, the total price, a payment schedule, the start date and what is not included. See the [estimate template](/blog/construction-estimate-template) for a layout.',
    },
    {
      q: 'How do I handle extra work the client asks for during a paint job?',
      a: 'Price it in writing and get a signed change order before doing it. Verbal extras are the most common source of unpaid work in painting.',
    },
  ],
  cta: {
    heading: 'Turn this estimate into a clean, signable document',
    text: 'Build the estimate with your labor, materials and exclusions, send it as a link, and let the client approve it on their phone. The free plan is enough to start.',
    href: '/estimate-generator',
    label: 'Open the estimate generator',
  },
};

export default post;
