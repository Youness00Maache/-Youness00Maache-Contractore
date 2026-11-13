import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'contractor-purchase-orders',
  takeaways: [
    'A purchase order puts price, quantity, delivery details and the job number in writing before anything ships.',
    'Use POs for delivered, special-order, quoted or large purchases; log small counter buys as receipts instead.',
    'Before paying a supplier, match the PO, the signed delivery ticket and the invoice line by line.',
    'When an order changes, issue a revised PO, and if the client caused the change, send them a change order too.',
  ],
  body: `Most material problems don't start on site. They start with a phone call: "Send me the usual for the Miller job." Nobody writes down the price, the quantity, the delivery date or which job it's for. Three weeks later an invoice arrives that doesn't match what showed up, and you pay it because you can't prove otherwise.

A purchase order fixes that by putting the order in writing before anything ships. It sets the price, the quantity and the job, and it gives you something to check both the delivery and the invoice against. For a small contractor, it doesn't need to be bureaucratic. It needs to be quick, consistent and tied to the job.

This guide covers when a PO is worth the effort, what to put on one, how to number and approve them, how to match a PO against the delivery ticket and supplier invoice, and how to handle changes and backorders.

## What a purchase order does for a contractor

A PO is your written offer to buy specific items at specific prices. Once the supplier accepts it, it becomes the reference point for everything that follows. In practice it does four jobs:

- **Locks the price.** If the invoice comes in higher than the PO, you have a document that says otherwise.
- **Ties cost to a job.** Every PO carries a job name or number, so the cost lands on the right job instead of a general supplies pile.
- **Gives the crew something to check.** The lead can compare the delivery against the PO before signing the ticket.
- **Controls who spends.** With a simple approval rule, you know who committed the money and why.

None of that requires special software, but it does require doing it the same way every time.

## When a PO is worth it (and when it's overkill)

Not every purchase needs a PO. A box of screws at the counter isn't worth the paperwork; a lumber package delivered to site is. A practical rule is to require a PO when an order is large, delivered, special-ordered or priced from a quote.

| Situation | PO? | Why |
| --- | --- | --- |
| Material package delivered to site | Yes | Big dollars, partial deliveries |
| Special-order windows, cabinets, fixtures | Yes | Long lead times, often non-returnable |
| Price quoted by a supplier | Yes | Locks the quoted number |
| Multi-day equipment rental | Usually | Sets rate, dates and pickup |
| Small counter purchase | No | Log the receipt to the job |
| Emergency part on a service call | Optional | Photograph the receipt, assign it to the job |

The threshold is yours to set. Some shops use a dollar amount; others require a PO for anything delivered. Pick one rule the crew can remember.

## What to put on a purchase order

A good PO answers every question a supplier, a driver or your bookkeeper might ask.

### Header

- **PO number:** unique and never reused
- **Date issued** and **date needed on site**
- **Your company:** name, address, phone and the person placing the order
- **Supplier:** name, branch, contact and phone
- **Job name or number:** the link to job costing

### Delivery details

- **Ship-to address**, usually the job site rather than your office
- **Site contact and phone** for the driver
- **Instructions:** gate code, drop location, call ahead, forklift or hand unload
- **Delivery window**, if the site has noise or access restrictions

### Line items

- Description with size, grade, color or SKU
- Quantity and unit: pieces, sheets, boxes, linear feet
- Unit price as quoted
- Line total

### Totals and terms

- Subtotal, delivery charge, tax and total
- Payment terms agreed with the supplier
- Quote reference number, if the prices came from a quote
- A substitution rule, such as "no substitutions without written approval"

Sales tax on construction materials depends on your state, the type of contract and sometimes the project, so confirm with your accountant how it should be handled on your POs.

## PO numbering and approvals

### A numbering system that stays useful

Use a format that tells you the job at a glance. One simple pattern is job number plus a sequence: PO-2417-01, PO-2417-02 and so on for job 2417. Another is year plus a running count, such as PO-26-0142, with the job listed on the PO. Whichever you choose, follow three rules:

1. Every PO gets a number before it's sent.
2. Numbers are never reused, even when a PO is cancelled.
3. The PO number appears on the delivery ticket and the supplier invoice. Ask your suppliers to reference it.

### A simple approval rule

Small shops don't need a committee, just a clear limit. As an example policy: a lead can issue POs up to $1,000 for their own job, while anything larger, any special order and any non-returnable item needs the owner's approval first. Write the rule down so it doesn't depend on who happens to be on the phone.

## Matching the PO, delivery ticket and supplier invoice

This is where POs pay for themselves. Before you pay a supplier invoice, compare three documents: what you ordered (the PO), what arrived (the delivery ticket, counted and noted by your crew) and what you're being billed (the invoice). Accountants call this three-way matching. On a job site it's just checking the paperwork.

### A worked example

Here's a hypothetical lumber order for job 2417. The numbers are illustrative only.

PO-2417-03 ordered 120 pieces of 2x6x12 at $9.00, 40 sheets of subfloor at $45.00, 10 boxes of screws at $40.00 and a $75 delivery charge, for a total of $3,355. The crew counted the delivery and noted 4 subfloor sheets on backorder.

| Item | Ordered on PO | Delivered | Invoiced |
| --- | --- | --- | --- |
| 2x6x12 | 120 at $9.00 | 120 | 120 at $9.00 |
| Subfloor | 40 at $45.00 | 36 | 40 at $47.00 |
| Screws | 10 boxes at $40.00 | 10 | 10 at $40.00 |
| Delivery | $75 | Yes | $75 |
| **Total** | **$3,355** | 4 sheets short | **$3,435** |

Two problems show up on the subfloor line. The invoice bills 4 sheets that haven't arrived, and the price is $2 per sheet higher than the PO. What you owe for this delivery is 36 sheets at $45.00, or $1,620, not $1,880. The correct total is $3,175, so the invoice is $260 too high.

You call the supplier, quote the PO number, ask for a corrected invoice and pay the right amount. When the backordered sheets arrive, they're billed at the PO price.

### The matching steps

1. On delivery, the crew counts items against the PO and writes shortages, damage and substitutions on the ticket before signing.
2. The ticket is photographed and attached to the job the same day, and the delivery is entered in the [material log](/blog/material-log-job-costing).
3. When the invoice arrives, compare it line by line with the PO and the ticket: item, quantity, unit price and total.
4. Resolve differences with the supplier before paying, and note the outcome on the PO.
5. File all three documents under the job, where they feed your [job profit numbers](/blog/how-to-calculate-job-profit-margin).

## Handling changes, backorders and cancellations

Orders change. The point is to change them on paper, not just on the phone.

- **Changed quantities or items:** issue a revised PO with the same number and a revision mark, such as PO-2417-03 Rev 1, and send it to the supplier with a note on what changed.
- **Client-driven changes:** if the client changes the scope, the supplier gets a revised PO and the client gets a [change order](/blog/change-order-form-guide). One without the other means you pay for material you never bill.
- **Backorders:** keep the PO open until everything arrives or you cancel the remaining items in writing.
- **Substitutions:** if the supplier sends a different product, the lead notes it on the ticket and checks with you before it's installed.
- **Cancellations:** cancel in writing and mark the PO as cancelled, but keep its number in the sequence so nothing looks missing. Special-order items often can't be cancelled or returned, which is exactly why they deserve approval up front.

## Common PO mistakes and a checklist

- Ordering by phone with no written price
- Leaving the job number off, so the cost lands on the wrong job
- Signing delivery tickets without counting
- Paying invoices that don't reference a PO
- Leaving POs open for months after a job closes

### Purchase order checklist

- [ ] PO number assigned and the job named
- [ ] Supplier, contact and quote reference listed
- [ ] Ship-to address, site contact and delivery instructions included
- [ ] Every item has a size or SKU, quantity, unit and unit price
- [ ] Delivery charge and tax shown
- [ ] Approval obtained if the order is over your limit or special-order
- [ ] Delivery counted and noted against the PO
- [ ] Invoice matched to the PO and delivery ticket before payment

## How ContractorDocs helps

Purchase Order is one of the [12 document types](/features#documents) in ContractorDocs, so your POs live in the same job as the estimate, material logs, receipts and invoices. You fill in the supplier, delivery address, site contact, delivery instructions and line items, then export a clean PDF with your logo. With [Gmail connected](/features#gmail), you can send the PO to the supplier as a PDF attachment from your own address, which leaves a record in your sent mail. Items saved in your [price book](/features#inventory) can be reused on POs so descriptions and prices stay consistent. ContractorDocs doesn't connect to supplier systems or pay invoices; it gives you clean, numbered paperwork to order from and match against.`,
  faq: [
    {
      q: 'Is a purchase order a legally binding contract?',
      a: 'Once a supplier accepts a PO, it generally forms an agreement on the items, prices and terms listed, but the details depend on your state, the supplier’s own terms and what was agreed. Read the supplier’s terms on quotes and invoices, especially for special-order items. For contract questions, talk to an attorney who works with contractors.',
    },
    {
      q: 'Do small contractors really need purchase orders?',
      a: 'Not for every purchase. They’re most useful for delivered material packages, special orders, quoted prices and anything expensive or non-returnable. Small counter purchases can simply be logged as receipts against the job.',
    },
    {
      q: 'What’s the difference between a purchase order and a work order?',
      a: 'A purchase order goes to a supplier and says what you’re buying. A work order goes to your crew or a sub and says what work to do, where and when. See our [work order guide](/blog/work-order-template) for the fields that belong on one.',
    },
    {
      q: 'What should I do if the supplier invoice doesn’t match the PO?',
      a: 'Don’t pay the difference and sort it out later. Compare the invoice with the PO and the signed delivery ticket, then contact the supplier with the PO number and the specific lines that don’t match. Pay the matched amount, or the corrected invoice, and note the outcome on the PO.',
    },
    {
      q: 'Should the PO show sales tax?',
      a: 'Show tax as its own line if it applies, so the total you expect matches what the supplier will bill. Whether tax applies to construction materials, and who pays it, varies by state and contract type, so confirm the rules with your accountant.',
    },
  ],
  cta: {
    heading: 'Send cleaner POs to your suppliers',
    text: 'Create numbered purchase orders with delivery instructions and line items, export them as branded PDFs and keep them with the job. Free to start.',
    href: '/auth/signup',
    label: 'Start free',
  },
};

export default post;
