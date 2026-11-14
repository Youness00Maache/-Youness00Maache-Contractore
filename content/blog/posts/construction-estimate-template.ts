import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'construction-estimate-template',
  answer:
    'To price a construction job without guessing, build every estimate in the same order: scope and takeoff, labor at a burdened rate, materials with waste, subcontractors, equipment, overhead, contingency and profit. Then add exclusions, allowances and a validity date so the number still holds after the client signs.',
  takeaways: [
    'Price every job in the same order: scope, labor, materials, subs, equipment, overhead, contingency, profit.',
    'Put labor on the estimate at a burdened rate that includes payroll costs, insurance and non-billable time, not at the bare wage.',
    'A 10% markup is only about a 9.1% margin, so know which one you’re using before you set a price.',
    'Exclusions, allowances and a validity date protect the number after the client signs.',
  ],
  body: `Most underpriced jobs aren't caused by bad math. They're caused by a missing line: the dumpster nobody priced, the drive time, the second coat of paint, the overhead that quietly eats the profit. When an estimate is built from memory and a gut feeling, those gaps show up later as a job that felt busy but paid almost nothing.

The fix is a repeatable method: price every job in the same order, with the same categories. This guide walks through that order, from scope and takeoff to labor, materials, overhead and profit, and the exclusions and validity date that protect the number after you send it.

You'll also get a worked example with round, hypothetical numbers and a template structure you can reuse on every bid.

## Step 1: Define the scope and do the takeoff

You can't price what you haven't defined. Before you touch a number, write down exactly what you will remove, build, install and clean up.

### Write the scope as work items

Break the job into tasks a crew would recognize: demo, framing, rough plumbing, drywall, tile, trim, paint, cleanup. Rooms are a bad unit, because a "bathroom" can mean a vanity swap or a full gut. Work items force you to think through every phase, and they become the line items on your estimate later.

For each item, note what's included. "Tile shower walls to 7 feet, including waterproofing membrane" is a priceable sentence. "Tile shower" is an argument waiting to happen.

### Measure everything

The takeoff turns the scope into quantities: square feet of floor and wall, linear feet of trim, number of fixtures, sheets of drywall, yards of concrete. Measure on site or from plans and write down the individual measurements, not just the totals, so you can check your work later.

> **Tip:** Measure once for the estimate and again right before you order. The extra half hour costs far less than a short tile order or a second concrete truck.

## Step 2: Price labor with a burdened rate

Labor is where most estimates go wrong, because it's the hardest cost to see.

### Estimate hours per task

Estimate hours for each work item, not for the job as a whole. A job-level guess like "about two weeks" hides mistakes; a task list exposes them. The best source for hours is your own history: what did the last three tile jobs actually take? If you keep [crew time sheets by job](/blog/construction-time-sheet-tracking), you already have this data.

Don't forget hours that produce nothing visible: setup, floor protection, material runs, drive time, cleanup and the punch list.

### Build your burdened labor rate

The wage you pay is not what an hour of labor costs you. A burdened rate adds what you pay on top of wages:

- Employer payroll taxes
- Workers' compensation insurance
- Liability insurance priced on payroll
- Benefits, paid holidays and paid time off
- Paid hours that can't be billed to a job, like shop time and training

Add up those annual costs per worker, divide by the hours that worker actually spends on jobs, and add the result to the hourly wage. Burden varies widely by state, trade and insurance class, so calculate your own instead of borrowing someone else's. Your accountant or payroll provider can help you pull the real figures.

Labor cost is estimated hours times the burdened rate. If you work alone, price your own hours the same way. Otherwise your "profit" is really just your wage, and there's nothing left to grow the business.

## Step 3: Materials, subcontractors and equipment

### Materials plus waste

Price materials from current supplier quotes or your price book, not from last year's memory. Then add a waste factor for anything that gets cut: tile, drywall, lumber, flooring, siding. The right factor depends on the material, the layout and your crew, so track it on real jobs. A diagonal tile pattern wastes more than a straight lay, and a room full of angles wastes more than a rectangle.

Don't forget the small stuff: fasteners, adhesives, caulk, tape, blades, plastic sheeting and delivery fees. They're easy to leave off, and a [material log](/blog/material-log-job-costing) will show you how much they really add up to on a typical job.

### Subcontractors

Get written quotes from subs and read what they exclude. If the plumber's price doesn't include the permit or patching the wall they open, that cost lands on you unless it's in your estimate. Carry the sub price into your estimate as a cost, then apply overhead and profit to it like any other cost.

### Equipment and disposal

Include rentals (tile saws, lifts, compactors), fuel, dumpsters or dump fees, and portable toilets on longer jobs. If you own the equipment, charge a daily rate that covers upkeep and eventual replacement.

## Step 4: Overhead, markup and contingency

Everything so far is direct cost. Now add the cost of running the business and the profit that makes the work worth doing.

### Overhead

Overhead is everything you pay that isn't tied to one job: truck payments, office, phone, software, accounting, advertising, general insurance and the owner's time spent estimating and managing. A simple way to recover it:

1. Total your overhead for the year, using last year's actual numbers adjusted for known changes.
2. Estimate your direct job costs for the year.
3. Divide overhead by direct costs to get an overhead rate.
4. Apply that rate to the direct cost of every job.

### Markup and margin

Markup is added to cost; margin is the share of the price that's profit. They are not the same number. A 10% markup produces about a 9.1% margin. If you price with markup but think in margin, you'll consistently earn less than you planned. Our guide to [markup vs. margin](/blog/how-to-calculate-job-profit-margin) has the formulas and a conversion table.

### Contingency

Contingency covers unknowns you can reasonably expect but can't measure: an out-of-level floor, an extra trip, a fitting that doesn't match. It's not a substitute for exclusions. Rotted subfloor or old wiring behind a wall should be excluded and handled with a [change order](/blog/change-order-form-guide), not buried in contingency. How much to carry depends on the age of the building and how much you can see before you start.

## Worked example: a hypothetical hall bath remodel

Here's how the steps come together. All numbers are round, hypothetical figures for illustration, not recommended prices.

The scope: gut a small hall bath, install cement board and waterproofing, tile the floor and shower walls, set a new vanity, toilet and fixtures, and paint. Plumbing and electrical are subcontracted.

- **Labor:** 90 hours (demo 12, framing and blocking 6, board and waterproofing 10, tile 40, fixtures and trim 8, paint 8, cleanup and punch 6) at a $40 burdened rate.
- **Materials:** $2,800 from supplier quotes, plus 10% waste on the $2,000 of tile, board and setting materials, which is $200.
- **Subs:** plumber $2,000, electrician $800.
- **Equipment and disposal:** dumpster $450, tile saw rental $150.
- **Overhead rate:** 20% of direct cost, for example $80,000 of yearly overhead on $400,000 of yearly direct costs.
- **Contingency:** 5% of direct cost, because the house is older.
- **Profit:** 10% markup on total cost.

| Line | Calculation | Amount |
| --- | --- | --- |
| Labor | 90 hrs × $40 | $3,600 |
| Materials | $2,800 + $200 waste | $3,000 |
| Subcontractors | $2,000 + $800 | $2,800 |
| Equipment and disposal | $450 + $150 | $600 |
| **Direct cost** | Sum of the four lines | **$10,000** |
| Contingency | 5% × $10,000 | $500 |
| Overhead | 20% × $10,000 | $2,000 |
| **Total cost** | Direct + contingency + overhead | **$12,500** |
| Profit | 10% × $12,500 | $1,250 |
| **Estimate total** | Before sales tax | **$13,750** |

Check the margin: $1,250 ÷ $13,750 is about 9.1%, not 10%. If you need a true 10% margin, divide total cost by 0.90 instead: $12,500 ÷ 0.90 ≈ $13,889.

If the job runs smoothly and the contingency isn't used, that $500 becomes profit. If something comes up, your margin holds. Sales tax on materials and labor follows different rules from state to state, so ask your accountant how it should appear on your estimates.

## Exclusions, allowances and the validity date

The number is only half the estimate. The other half is the language that keeps the number honest after the client signs.

### Exclusions

List what's not included in plain words. For the bath example: repair of rotted subfloor or framing found after demo, relocating supply or drain lines, mold remediation, painting outside the bathroom, and permit fees if the client is pulling the permit. An exclusion isn't a refusal. It's a promise that the work will be priced separately if it turns out to be needed.

### Allowances

When the client hasn't picked a product yet, use an allowance: a set amount for that item, with any difference billed or credited later. For example: "Vanity allowance $800. Tile allowance $6 per square foot for material." If they choose a $1,400 vanity, the extra $600 goes on a change order. Allowances let you send the estimate now without guessing the client's taste.

### Validity date

Material prices move. State how long the price is good for, such as 30 days, and what happens after: the estimate may be revised for current costs. Add a target start window too, so a client can't sign six months later at today's prices.

## A reusable estimate template structure

Use the same structure on every estimate so nothing gets skipped.

| Section | What goes in it |
| --- | --- |
| Header | Logo, company name, license number, contact info |
| Estimate details | Estimate number, date, valid-until date |
| Client and site | Client name, phone, email, job address |
| Scope summary | Two or three sentences on what you'll do |
| Line items | Work item, quantity, unit, unit price, total |
| Allowances | Item, amount, how overages are handled |
| Exclusions | What's not included and priced separately |
| Totals | Subtotal, discount, tax, total |
| Payment terms | Deposit, progress payments, final payment |
| Acceptance | Signature, printed name, date |

### Before you send it

- [ ] Every work item in the scope has a line
- [ ] Labor hours are estimated per task, not for the whole job
- [ ] Waste is added to every cut material
- [ ] Sub quotes are in writing and their exclusions are reviewed
- [ ] Dumpster, rentals and delivery fees are included
- [ ] Overhead and profit are applied, and you know the margin
- [ ] Exclusions and allowances are spelled out
- [ ] The validity date and payment terms are on the page
- [ ] Someone has checked the math a second time

### Common mistakes

- Pricing labor at the wage instead of the burdened rate
- Treating markup and margin as the same number
- Leaving out drive time, material runs and cleanup
- Hiding known risks in contingency instead of excluding them
- Sending a single total with no line items, which invites the client to negotiate the whole number

## How ContractorDocs helps

ContractorDocs is built around this kind of structured estimate. The estimate document lets you enter line items with quantities and prices, then add tax, a flat discount and a deposit (or try the free [estimate generator](/estimate-generator) first), with your exclusions, allowances and validity terms in the notes. Save the items you price often in the [price book](/features#inventory) so the next estimate starts from your real numbers instead of memory. If you'd rather describe the job in plain words or by voice, the [AI assistant](/features#ai-assistant) drafts the estimate for you to review and edit before saving. Clients open it through a secure link, approve it and sign electronically, and once the job is done you can compare what you invoiced with what the job actually cost.`,
  faq: [
    {
      q: 'How much should a contractor mark up a job?',
      a: 'There’s no single right number. It depends on your overhead, your trade, job size, risk and local competition. Start from your overhead rate and the net profit you need, then work backward to the markup, as shown in our [markup vs. margin guide](/blog/how-to-calculate-job-profit-margin).',
    },
    {
      q: 'Should I show my overhead and markup on the estimate?',
      a: 'Usually not. Most contractors show work items with a selling price that already includes overhead and profit, and keep the cost breakdown internal. Cost-plus contracts are the exception, because there the client has agreed to see your costs plus a fee.',
    },
    {
      q: 'What’s the difference between an estimate, a quote and a bid?',
      a: 'The terms are used loosely and can carry different weight depending on your contract and your state. What matters most is what the document says: whether the price is fixed, what’s excluded, how long it’s valid and how changes are handled. If you’re unsure how a document will be treated, ask an attorney who works with contractors in your state.',
    },
    {
      q: 'How long should an estimate be valid?',
      a: 'Many contractors use 30 days or less, and shorter when material prices are moving quickly. Put the valid-until date on the estimate itself and say that prices may be revised after it, so an old estimate can’t be signed at outdated numbers.',
    },
    {
      q: 'How much contingency should I add to an estimate?',
      a: 'It depends on how much you can see before you start. A new build with open walls needs less than an older home where the framing and wiring are hidden. Track how much contingency you actually use on each job and adjust your default from your own results.',
    },
  ],
  cta: {
    heading: 'Price your next job with a real template',
    text: 'Line items, tax, deposit, exclusions and a signature line, exported as a branded PDF. Free to start, no credit card needed.',
    href: '/estimate-generator',
    label: 'Open the estimate generator',
  },
};

export default post;
