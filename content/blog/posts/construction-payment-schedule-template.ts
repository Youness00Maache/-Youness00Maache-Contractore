import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'construction-payment-schedule-template',
  answer:
    'A construction payment schedule lists each payment on a job, what milestone triggers it, its share of the contract and its amount, from the deposit to the final payment. Tie every payment to a milestone the client can see, keep payments ahead of your costs, and put the schedule in the signed estimate or contract.',
  takeaways: [
    'One row per payment: milestone, percent, amount, when it is due and when it was paid.',
    'Tie payments to visible milestones (framing done, cabinets set), not to calendar dates.',
    'Keep your cash ahead of your costs: the payment before a big material order should cover it.',
    'Keep the final payment small enough that a punch list cannot hold up most of your profit.',
    'Approved change orders get their own payment line or are added to the next milestone.',
  ],
  body: `Most payment fights on a job come from one gap: the client thought the next payment was due later, or for a different milestone, than you did. A written payment schedule closes that gap before work starts. Both sides know what has to be done for each payment, and you know your cash will keep up with your costs.

Below is a payment schedule template you can copy, examples for common job types, the rules that keep a schedule fair and safe, and the contract wording that goes with it.

## What is a construction payment schedule?

A construction payment schedule is the part of an estimate or contract that splits the price into payments and says when each one is due. On a small job it might be two payments. On a remodel it is usually four or five, each tied to a stage of the work. It is also called a contractor payment schedule, a draw schedule or milestone billing.

## Construction payment schedule template (copy this)

| # | Milestone (what must be done) | % of contract | Amount | Due | Invoice # | Paid on |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Deposit on signing | | | On signing | | |
| 2 | | | | Within 7 days of milestone | | |
| 3 | | | | Within 7 days of milestone | | |
| 4 | Substantial completion | | | Within 7 days of milestone | | |
| 5 | Final: punch list complete | | | On completion | | |
| | Total | 100% | (contract total) | | | |

Above the table, add the job name and address, the client, the contract or estimate number and the contract total. Below it, add the change order rule, the payment methods you accept and the late payment terms, if you use them.

Two rules for filling it in: the percentages must add up to 100%, and every milestone must be something both of you can see and agree on. "Rough-in inspection passed" is a milestone. "Halfway through" is not.

## Payment schedule examples

Examples only; the splits are illustrations, not recommendations, and deposit limits differ by state (see [how much deposit a contractor can ask for](/blog/how-much-deposit-can-a-contractor-ask-for)).

Small repair or service job, under a few thousand dollars:

| Payment | Milestone | Share |
| --- | --- | --- |
| 1 | On completion | 100% |

Deck or fence, one to two weeks:

| Payment | Milestone | Share |
| --- | --- | --- |
| 1 | Deposit on signing | 30% |
| 2 | Framing or posts complete | 40% |
| 3 | Completion and walkthrough | 30% |

Bathroom remodel, four to six weeks:

| Payment | Milestone | Share |
| --- | --- | --- |
| 1 | Deposit on signing | 10% |
| 2 | Demolition done, rough-in inspection passed | 30% |
| 3 | Tile and fixtures set | 30% |
| 4 | Substantial completion | 20% |
| 5 | Punch list complete | 10% |

Notice the pattern in each example. The deposit covers the first material order and scheduling the crew. The middle payments land right after the stages that cost you the most, so you are never paying for weeks of labor and materials out of your own account. The last payment is the smallest, because it depends on the punch list and the client's final walkthrough, which are the parts of a job most likely to slip.

Example with numbers: on a $32,000 bathroom remodel, that schedule gives $3,200, $9,600, $9,600, $6,400 and $3,200. If the tile and fixtures cost you $11,000 and are ordered after the rough-in, payment 2 has already covered most of that order before you place it.

## How do you set up a payment schedule that protects your cash flow?

1. List your big costs in the order you pay them: materials orders, subs, crew weeks.
2. Place a payment just before each big cost, so client money arrives before your money leaves.
3. Tie each payment to a milestone the client can check in person or in photos.
4. Keep the final payment modest. If 30% waits on the punch list, a few touch-ups can hold up your whole profit.
5. Add the rule for changes: "Approved change orders are billed with the next scheduled payment" or as their own line.
6. Say when each payment is due after the milestone (for example within 7 days) and how the client can pay.

If you find yourself funding a job for weeks, the schedule is too back-loaded. Move weight to earlier milestones, within what your state allows for deposits.

## Payment schedule mistakes to avoid

- Milestones nobody can check. "Electrical 50% done" invites an argument; "rough-in inspection passed" does not. If the client cannot see it or read it on an inspection card, rewrite the milestone.
- A big payment waiting on someone else. If a payment depends on a county inspector, a cabinet supplier or the client's own tile choice, a delay you do not control holds your money. Split it, or tie it to your own work.
- Back-loading the job. Asking for most of the money at the end feels friendly, but it means you finance materials and labor for weeks. If something goes wrong, you are the one who is exposed.
- Forgetting the change orders. Extra work done without a payment line tends to be argued about at the end. Write down when each approved change is paid.
- No due date after the milestone. "Due at framing" without "within 7 days" lets a payment drift for weeks while the job keeps going.
- Changing the schedule by text message. If a payment moves, update the schedule in writing and have the client confirm it, so the record matches what you both agreed.

## Milestone, monthly or percent complete?

| Method | How it works | Fits |
| --- | --- | --- |
| Milestone schedule | Fixed payments at named stages | Residential jobs, remodels, decks, roofs |
| Monthly draws | An invoice each month for work done | Longer jobs, lender-funded work |
| Percent complete (progress billing) | Each invoice bills the % finished per line of a schedule of values | Larger or commercial jobs, retainage contracts |

Many small contractors start with milestones and move to [progress billing with a schedule of values](/blog/progress-billing-schedule-of-values-for-contractors) on bigger jobs. If the client holds back part of each payment, read the guide to [retainage in construction](/blog/retainage-in-construction) before you sign.

## What to write in the contract about payments

- [ ] The full payment schedule: milestone, percent and amount for each payment
- [ ] When each payment is due after its milestone
- [ ] Accepted payment methods
- [ ] How change orders are paid
- [ ] What happens if a payment is late (work may pause, late fee if your state allows it)
- [ ] Who confirms a milestone is reached, and how (walkthrough, photos, inspection)
- [ ] That the final payment is due when the punch list is complete, not "when the client is happy"

## Sending a payment schedule in ContractorDocs

In ContractorDocs, the payment schedule lives in the estimate. In the Proposal section's Payments tab you pick 50/50, 30/40/30 or 10/40/40/10, or add your own payments, each as a percentage or a fixed amount, and the app checks that they add up to the total. The client sees the schedule on the approval link and signs it with the estimate. When a milestone is reached, Convert to invoice bills the deposit or a later payment as a progress invoice that shows what was billed before. Save the estimate as a template and the schedule is ready for the next job of that type. You can see how an estimate looks in the free [estimate generator](/estimate-generator), and the [pricing page](/pricing) shows what each plan includes.

If a payment comes in late anyway, the [past-due invoice letters](/blog/past-due-invoice-letter-templates-for-contractors) give you the wording for a friendly, a firm and a final reminder.

## What this does not cover

Many states regulate deposits, payment terms and late fees for home improvement contracts, and lender-funded jobs follow the lender's draw process. Rules vary by state, and this is not legal advice.`,
  faq: [
    {
      q: 'What is a typical payment schedule for a contractor?',
      a: 'There is no single standard. Small jobs are often paid on completion or 50/50; remodels often use a deposit plus three or four milestone payments. Fit it to your costs and your state\'s deposit rules.',
    },
    {
      q: 'Should payments be tied to dates or milestones?',
      a: 'Milestones, in most residential work. A date-based payment comes due even if the job is delayed, which leads to disputes; a milestone payment is due when the work is visibly done.',
    },
    {
      q: 'How big should the final payment be?',
      a: 'Large enough to keep both sides motivated to finish, small enough that a short punch list cannot hold up most of your profit. For example, 10% of the contract on a remodel; choose what fits your job and costs.',
    },
    {
      q: 'How do change orders fit into a payment schedule?',
      a: 'State it in the contract: either each approved [change order](/blog/change-order-form-guide) is paid on its own, or it is added to the next scheduled payment.',
    },
    {
      q: 'Is a payment schedule the same as progress billing?',
      a: 'They are related. A payment schedule sets fixed payments at milestones; progress billing invoices the percentage of each part of the job that is complete. See the [progress billing guide](/blog/progress-billing-schedule-of-values-for-contractors).',
    },
  ],
  cta: {
    heading: 'Put the payment schedule in the estimate',
    text: 'Pick a split or build your own, let the client sign it online and bill each payment in a tap. Free plan included.',
    href: '/auth/signup',
    label: 'Start free',
  },
};

export default post;
