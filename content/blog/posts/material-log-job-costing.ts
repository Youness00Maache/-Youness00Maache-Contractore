import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'material-log-job-costing',
  takeaways: [
    'A material log records what the job received, used, returned or transferred, which is not the same as what you ordered or were billed for.',
    'Log quantities on site at delivery; fill in unit prices later from the PO, supplier invoice or price book.',
    'Returns, leftovers and transfers are negative entries. Skip them and every job looks more expensive than it was.',
    'Use the same cost codes on the estimate, the POs and the material log so estimate vs. actual is a quick check, not a project.',
  ],
  body: `Materials are the cost contractors think they know best and often track worst. The supplier invoice shows up weeks later, leftover boxes ride back to the shop, a few items get grabbed off your own shelves, and by closeout nobody can say what the job actually used. The estimate said one number, the bank account says another, and there's no trail to explain the gap.

A material log closes that gap. It's a running record, kept by job, of every material that arrives on site, comes out of your stock, gets returned or moves to another job. Combined with cost codes, it becomes job costing: a line-by-line comparison of what you estimated against what you spent.

This guide covers what to record, how to log on site without slowing the crew, how to handle returns and leftovers, how the log ties to purchase orders and inventory, and how to read an estimate-versus-actual comparison.

## What a material log is (and what it isn't)

A material log is the record of what went into the job. It's not the same as the paperwork around buying.

| Document | What it records | Created by |
| --- | --- | --- |
| Purchase order | What you ordered, at what price | You, before ordering |
| Delivery ticket | What the supplier dropped off | The supplier |
| Supplier invoice | What the supplier is billing | The supplier |
| Material log | What the job received, used, returned or transferred | You, on site |

The first three documents describe a transaction with a supplier. The material log describes the job. One supplier invoice might cover three jobs, and one job might draw from five invoices plus your own shelf. The log is where those get sorted out.

## What to record on every entry

Keep entries short, but complete enough that someone in the office can cost them without calling the site.

| Field | Example | Why it matters |
| --- | --- | --- |
| Date | March 14 | Matches deliveries and daily reports |
| Item | 2x10x12 pressure-treated | Ties back to the estimate line |
| Quantity and unit | 24 pieces | Unit mix-ups are common |
| Unit cost | $28.00 | From the PO, invoice or price book |
| Source | PO-2417-02 or shop stock | Lets you match the paperwork |
| Cost code | 03 Framing | Groups costs for comparison |
| Logged by | Initials | Someone to ask later |
| Notes | 2 boards cracked, set aside | Explains credits and extra trips |

Be precise about units. "10 drywall" could be sheets or bundles, and "5 wire" could be rolls or boxes. A mismatched unit is the fastest way to turn a correct log into a wrong cost.

## How to log materials on site without slowing the crew

The log only works if it gets filled in. Make it the easiest part of the day.

1. **Pick one person per job.** Usually the lead or foreman. Shared responsibility means nobody does it.
2. **Log at receipt, not at the end of the week.** Check the delivery against the ticket while the driver is still there, then log it.
3. **Photograph the paper.** Snap every delivery ticket and store receipt and attach it to the job the same day.
4. **Quantities in the field, prices in the office.** The crew records what and how many. Costs come from the PO, invoice or price book.
5. **Log shop and truck stock too.** Material from your own shelves is still a cost to this job, even if you paid for it months ago.
6. **Connect it to the daily report.** A line in the [daily job report](/blog/daily-job-report-template) such as "lumber package received, see material log" links the two records.

> **Tip:** Midday runs to the supply house are where material costs most often go missing. Make it a rule that every receipt gets photographed and assigned to a job before the truck leaves the parking lot.

## Returns, leftovers and transfers between jobs

What leaves the job matters as much as what arrives. Skip this part and every job looks more expensive than it was, and your next estimate gets padded with costs that never really happened.

### Returns to the supplier

Log a return as a negative entry with the same item, quantity and cost code, for example "−6 pieces 2x10x12, returned, credit pending." Then watch for the credit memo. A return without a credit is material you paid for and no longer have. Restocking fees, if any, stay on the job as a cost.

### Leftovers back to your stock

When leftover material goes back to the shop, log it out of the job and into inventory at the cost you paid. The original job gets credited, and the next job that uses it gets charged. Don't let half-boxes of tile disappear into a corner of the shop with their cost stuck to the job that bought them.

### Transfers between jobs

If the crew carries extra fittings from Job A to Job B, log it twice: a negative entry on Job A and a positive entry on Job B. It takes a minute and keeps both jobs honest.

### Damaged and wasted material

Log damage and over-cutting with a short note instead of hiding it. If one type of job keeps showing high waste, that's either a layout or training issue you can fix, or a waste factor you need to raise in your [estimates](/blog/construction-estimate-template).

## Tie the log to purchase orders and inventory

A material log on its own is a list. Linked to your other paperwork, it becomes a control system.

- **Purchase orders:** Every delivery entry should reference the PO it filled. That lets the office match the PO, delivery ticket and supplier invoice before paying. Our guide to [contractor purchase orders](/blog/contractor-purchase-orders) walks through that matching step.
- **Inventory:** Material pulled from stock should come off your inventory count when it's logged, and returns to stock should go back on. If the counts and the log drift apart, something is leaving the shop unrecorded.
- **Cost codes:** Use the same short list of codes on your estimate, your POs and your log. If the estimate says "03 Framing" and the log says "lumber," you'll be matching by hand at closeout.

### Keep cost codes simple

A small contractor doesn't need a hundred codes. A short list of phases that matches how you estimate is usually enough: site work, foundation, framing, roofing, rough mechanical, insulation and drywall, finishes, fixtures, cleanup. Adjust for your trade. An electrician might code by service, rough-in, trim and fixtures instead.

## Estimate vs. actual: reading the comparison

Here's a hypothetical 16 by 20 foot deck, comparing estimated material costs with what the log showed. The numbers are illustrative only.

| Cost code | Estimated | Actual | Variance |
| --- | --- | --- | --- |
| 02 Footings | $600 | $640 | +$40 |
| 03 Framing lumber | $2,400 | $2,950 | +$550 |
| 04 Decking | $3,200 | $3,150 | −$50 |
| 05 Railing | $1,800 | $1,800 | $0 |
| 06 Fasteners and connectors | $400 | $560 | +$160 |
| **Total** | **$8,400** | **$9,100** | **+$700** |

Materials came in $700 over, about 8% above the estimate. The log tells you why, which is the whole point.

- **Framing lumber, +$550.** The log shows the lumber was billed at a higher unit price than the estimate assumed, plus a second delivery for extra joists the client asked for mid-job. The price difference means your price book needs updating. The extra joists should have been billed on a change order.
- **Fasteners, +$160.** The takeoff missed the hidden fastener system for the decking. Add it to your standard deck items so it can't be missed again.
- **Decking, −$50.** A few boards went back for credit. Because the return was logged, the credit got checked.

Without the log, all you'd know is that the job made less than planned. With it, you have one cost to bill, one estimating habit to fix and one price list to update. To see what an overrun like this does to profit, read our guide to [calculating job profit margin](/blog/how-to-calculate-job-profit-margin).

## Common mistakes and a weekly review

- Logging big deliveries but skipping store runs
- Treating shop stock as free
- Leaving returns unlogged, so credits never get checked
- Using different item names and codes on the estimate and the log
- Reviewing materials only at closeout, when nothing can be changed

### Weekly material review checklist

- [ ] Every delivery ticket and store receipt from this week is logged
- [ ] Each delivery entry references a PO or shop stock
- [ ] Returns are logged as negative entries and credits are tracked
- [ ] Leftovers and transfers are moved to stock or the right job
- [ ] Supplier invoices are matched to POs and delivery tickets
- [ ] Material costs to date are compared with the estimate by cost code
- [ ] Extra material for added work is flagged for a change order

## How ContractorDocs helps

In ContractorDocs, the Material Log is one of 12 document types, and it sits in the same job as the estimate, purchase orders, receipts and invoices. Because the app runs in the browser on a phone, your lead can log a delivery [from the job site](/features#mobile) instead of saving paper for later. Items saved in your [inventory and price book](/features#inventory) carry their prices into documents, track stock levels and can get QR tags, which makes shop pulls easier to record. [Job profit tracking](/features#profit-tracking) then compares what you invoiced with materials, labor and expenses for each job. It doesn't connect to supplier systems, so prices still come from your own POs and invoices.`,
  faq: [
    {
      q: 'What’s the difference between a material log and an expense log?',
      a: 'A material log tracks materials by item and quantity for a specific job. An expense log covers other job spending such as permits, dump fees, fuel and rentals. Both feed job costing, and keeping them separate makes material overruns easier to spot. What matters most is that each cost is recorded once, under the right job.',
    },
    {
      q: 'Who should fill out the material log?',
      a: 'One person per job, usually the lead or foreman, records deliveries, shop pulls and returns on site. The office then adds unit costs and matches entries to POs and supplier invoices. Splitting the work this way means the crew isn’t asked for prices they don’t know.',
    },
    {
      q: 'Should leftover materials be charged to the next job?',
      a: 'If the material is usable and goes back to stock, credit the original job and charge the next job when it gets used. Small consumables that aren’t worth tracking can stay on the original job. Pick a simple threshold and apply it the same way every time.',
    },
    {
      q: 'How often should I compare material costs to the estimate?',
      a: 'Weekly on most jobs, and right after any large delivery. If you wait until closeout, you learn the lesson but can’t recover money on the current job, for example by writing a [change order](/blog/change-order-form-guide) for added work.',
    },
    {
      q: 'Do small contractors really need cost codes?',
      a: 'A short list helps even a one-truck operation. It doesn’t need to be formal; phase names that match your estimate line items are enough. The point is to compare like with like when you check actual costs against the estimate.',
    },
  ],
  cta: {
    heading: 'Keep every material cost tied to the job',
    text: 'Log deliveries, returns and shop pulls from your phone, right next to the job’s estimate, purchase orders and invoices. Start on the free plan.',
    href: '/auth/signup',
    label: 'Start free',
  },
};

export default post;
