import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'work-order-template',
  takeaways: [
    'An estimate proposes the work to the client, a work order directs the work in the field, and an invoice asks for payment.',
    'Write the scope as specific tasks a crew can follow without calling the office.',
    'The completion section, with work performed, hours, materials and a signature, is the half of the work order that gets you paid.',
    'Turn completed work orders into invoices within a day, while the details are still fresh.',
  ],
  body: `A job can be sold, scheduled and paid for and still go sideways in the middle, because the person doing the work didn't have the same picture as the person who sold it. The tech shows up without the part. The crew paints the wrong room. Nobody writes down the extra hour spent tracing a leak, so it never gets billed.

A work order is the document that carries the job from the office to the field and back. It tells your crew or sub what to do, where, when and with what, and it comes back with what was actually done: hours, materials, notes and a signature. That return trip is what makes it valuable, because it's the raw material for an accurate invoice.

This guide explains how a work order differs from an estimate and an invoice, which fields to include, how service calls differ from project work, and a simple workflow from first request to final invoice.

## Work order vs. estimate vs. invoice

The three documents often share line items, which is why people mix them up. They have different readers and different jobs.

| Document | Who it's for | What it does | When |
| --- | --- | --- | --- |
| Estimate | The client | Proposes scope and price | Before approval |
| Work order | Your crew or sub | Authorizes and directs the work | After approval, before work |
| Invoice | The client | Requests payment | After the work or at milestones |

Some shops also use the work order as the client's authorization, especially on service calls, where the client signs before the tech starts. That works, as long as the price or rates are on it. What matters is that every job has one document that says "this work is authorized, here's what to do," and that it comes back filled in.

## What to put on a work order

### Header and job details

- **Work order number**, linked to the client and job
- **Date created** and **scheduled date or window**
- **Client name, phone and job address**
- **Site notes:** access, gate codes, pets, parking, occupied or vacant
- **Priority:** emergency, this week or scheduled

### Scope of work

Write the scope as tasks, in plain language a crew member can follow without calling you: "Replace 40-gallon gas water heater in garage. Haul away old unit. Install expansion tank and drain pan." Avoid lines like "fix water heater." If the scope came from an estimate, reference the estimate number so the crew knows exactly what the client approved.

### Assignment

- Who's assigned: crew lead, tech or subcontractor
- Estimated hours or a budget for the task
- Materials to bring, or what will be delivered to site
- Special tools or equipment

### Completion section, filled in on site

- Work actually performed, including anything different from the scope
- Time in and time out, or hours by person
- Materials used, with quantities
- Conditions found, recommendations and follow-up needed
- Before and after photos where they help
- Client signature and date confirming the work was done

The completion section is the half most templates skimp on, and it's the half that pays you. Extra work that isn't written down on site is very hard to bill later.

## Service calls vs. project work

Work orders look different depending on the kind of work.

### Service calls

Service calls are short, often reactive, and billed by time and materials or a flat rate. Here the work order usually is the main document: the client calls, you create the work order, the tech goes out, diagnoses, does the work and gets a signature. Speed matters, so keep it to one page. The rates, such as a service call fee and an hourly labor rate, should be agreed or printed on the work order before the tech starts, so there's no surprise at billing.

### Project work

On a remodel or build, the estimate and contract define the overall job. Work orders break it into assignments: "Frame basement walls per plan, Monday to Wednesday" for your crew, or "Rough-in plumbing for second-floor bath" for a sub. Each work order references the job and the relevant estimate lines. Progress gets recorded in [daily job reports](/blog/daily-job-report-template) and hours on [time sheets](/blog/construction-time-sheet-tracking). Anything outside the agreed scope goes on a [change order](/blog/change-order-form-guide) before it's built, not after.

## The workflow from request to invoice

1. **Take the request.** Record the client, address, problem or request, and how urgent it is.
2. **Price it if needed.** For project work or bigger repairs, send an estimate and get it approved. For a simple service call, confirm your service fee and rates.
3. **Create the work order.** Fill in the scope, schedule, assignment and materials. Order anything special in advance.
4. **Dispatch.** Send the work order to the crew or tech and confirm the time with the client.
5. **Do the work and complete the form.** The tech records what was done, hours, materials and notes, takes photos and gets the client's signature.
6. **Review.** Someone checks the completed work order the same day for missing hours, materials or extra work.
7. **Invoice.** Turn the completed work order into an invoice while the details are fresh. Our guide to [writing a construction invoice](/blog/how-to-write-a-construction-invoice) covers the invoice itself.
8. **Close it out.** Mark the work order complete, file it under the job and schedule any follow-up.

> **Tip:** The gap between steps 5 and 7 is where money leaks. Make it a rule that completed work orders are invoiced within one business day.

### When the job changes on site

Techs often find more than the work order describes: a corroded shutoff valve, a second leak, rotted trim behind the fixture. Train the crew to stop, write it in the completion section and get approval before doing the extra work. On a service call, that can be the client's signature next to a priced line added to the work order. On project work, it's a change order. Either way, the approval happens before the work, not when the client sees the invoice.

## Worked example: a service call from work order to invoice

Here's a hypothetical electrical service call. All rates and prices are examples only.

A homeowner reports that the outlets along one kitchen wall are dead. The office creates work order WO-1045 with the address, the problem, a scheduled window and the agreed rates: a $95 service call fee plus $110 per hour of labor on site.

The tech finds a failed GFCI receptacle feeding the downstream outlets, replaces it and tests the circuit. They also note that the bathroom GFCI is old and worth replacing at the next visit. Time on site: 1.5 hours. Material used: one GFCI receptacle at $28. The homeowner signs the completed work order.

| Invoice line | Calculation | Amount |
| --- | --- | --- |
| Service call | Flat fee | $95 |
| Labor | 1.5 hrs × $110 | $165 |
| GFCI receptacle | 1 × $28 | $28 |
| **Total before tax** | Fee + labor + material | **$288** |

Every number on the invoice comes straight from the completed work order, so there's nothing to reconstruct and nothing for the client to question. The note about the bathroom GFCI gives the office a reason to follow up with a quote. Without it on the work order, that next job would probably never happen.

## Common work order mistakes

- Vague scope lines that force the crew to guess
- No rates on service call work orders, which invites billing disputes
- A completion section left blank or filled in from memory days later
- Extra work done on a verbal OK with nothing written down
- Completed work orders sitting for a week before anyone invoices them

### Work order checklist

- [ ] Number, client, job address and schedule filled in
- [ ] Scope written as specific tasks, with the estimate referenced
- [ ] Crew, tech or sub assigned, with estimated hours
- [ ] Special materials ordered or listed
- [ ] Rates or price shown on service call work orders
- [ ] Work performed, hours and materials recorded on site
- [ ] Extra work noted and approved before it's done
- [ ] Client signature collected at completion
- [ ] Invoice sent within one business day

## How ContractorDocs helps

Work Order is one of the 12 [document types](/features#documents) in ContractorDocs, and it's organized under the same client and job as your estimates, daily reports, time sheets and invoices. Because the app runs in the browser on a phone or tablet, the tech can record the work performed and materials used and capture a signature [right on site](/features#mobile). The [AI assistant](/features#ai-assistant) can draft a work order from a plain-language or voice description for you to review and edit before saving. When the work is done, the [invoice generator](/invoice-generator) handles line items, tax and the balance due, and you can choose from 13 [template designs](/templates) for a professional PDF with your logo.`,
  faq: [
    {
      q: 'Does the client need to sign a work order?',
      a: 'On service calls it’s good practice to get a signature before starting, to authorize the rates, and at completion, to confirm the work was done. On project work under a signed contract, internal work orders for your crew may not need the client’s signature. Any change to the agreed scope still needs a signed [change order](/blog/change-order-form-guide).',
    },
    {
      q: 'Can a work order replace an estimate?',
      a: 'On small service calls with agreed rates, the work order often does the job on its own. For larger work, the client should approve an estimate first, and the work order then references it so the crew builds exactly what was sold.',
    },
    {
      q: 'Who fills out the work order?',
      a: 'The office or owner usually creates the top half: client, scope, schedule and assignment. The tech or crew lead fills in the completion section on site with the work performed, hours, materials and signature. Someone should review it before it becomes an invoice.',
    },
    {
      q: 'Should I use work orders for subcontractors?',
      a: 'Yes. A written work order with the scope, schedule and agreed price reduces disputes over what the sub was supposed to do. It complements your subcontract agreement and insurance requirements rather than replacing them.',
    },
    {
      q: 'How should work orders be numbered?',
      a: 'Use one running sequence, such as WO-1045, WO-1046, and never reuse a number. Link each work order to its client and job, and put the work order number on the invoice so the two can always be matched.',
    },
  ],
  cta: {
    heading: 'Run every job from work order to invoice',
    text: 'Create work orders, complete them on site from your phone and turn them into invoices, all organized by client and job. The free plan includes all 12 document types.',
    href: '/auth/signup',
    label: 'Start free',
  },
};

export default post;
