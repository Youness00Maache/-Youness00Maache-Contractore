import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'construction-time-sheet-tracking',
  takeaways: [
    'Track hours per job and per task, not just per week. Payroll needs totals; job costing needs to know where the hours went.',
    'A short list of cost codes that matches your estimate is enough to see which tasks run over.',
    'Record actual start, end and break times every day, and have the foreman approve before the week closes.',
    'Overtime and break rules depend on federal and state law. Check the rules that apply to your crew, or ask your payroll provider.',
  ],
  body: `Labor is usually the biggest cost on a job and the hardest one to see. Materials come with receipts. Hours come from whatever your crew remembers on Friday afternoon, written on the back of a delivery ticket or texted to you as "40 again this week."

That is enough to cut paychecks, but not enough to know whether the bathroom you bid at 80 hours took 80 or 130. Without per-job time sheets, you find out a job lost money when the bank balance tells you, long after you could have done anything about it.

This guide covers what a construction time sheet should contain, how to set up simple cost codes, the basics of breaks and overtime, a weekly approval routine, the errors to catch, and how the same hours feed both payroll and job costing.

## Why per-job time sheets beat a weekly total

A weekly total answers one question: how much do I owe this person? A per-job, per-task time sheet answers the questions that decide whether you make money:

- Which jobs are over their labor budget, and by how much?
- Which tasks (demo, framing, tile, punch list) blow up most often?
- Is change order work being tracked, or disappearing into base scope?
- Are you charging enough for travel and shop time?

The extra effort is small. Instead of "Monday: 8 hours," the entry becomes "Monday: 6 hours Lee kitchen (drywall), 2 hours Patel deck (punch list)."

## What a construction time sheet needs

Whether it is paper, a spreadsheet or an app, every entry should capture the same fields.

| Field | Why it matters |
| --- | --- |
| Worker name | Ties hours to the right paycheck |
| Date | Daily records, not weekly guesses |
| Job | Charges hours to the right customer |
| Cost code or task | Shows where labor actually went |
| Start and end time | Actual times, not rounded totals |
| Meal and rest breaks | Paid vs. unpaid time, wage rule compliance |
| Total hours | Regular and overtime separated |
| Change order reference | Keeps extra work billable |
| Notes | Travel, shop time, weather stops |
| Signatures | Worker confirms, foreman approves |

### Actual times, not round numbers

Write 6:58 to 3:34, not "8." Round numbers every day for every worker usually mean the sheet was filled in from memory. Record actual times and let your payroll process apply whatever rounding rules are lawful and consistent.

### Separate change order work

When the crew works on a signed change order, record those hours against the change order number. Otherwise your base job looks over budget and the change order looks profitable, and neither picture is true. Our [change order guide](/blog/change-order-form-guide) covers how to set those up.

## Cost codes: keep them simple

Cost codes are short labels for the type of work. You do not need the long code lists large general contractors use. For most small contractors, 8 to 15 codes that match the line items on your estimates are plenty.

| Code | Task |
| --- | --- |
| 01 | Demo and prep |
| 02 | Framing and carpentry |
| 03 | Rough plumbing and electrical |
| 04 | Drywall |
| 05 | Tile and flooring |
| 06 | Finish carpentry and trim |
| 07 | Paint |
| 08 | Punch list and cleanup |
| 90 | Travel and material runs |
| 91 | Shop and equipment |

The rule that makes cost codes useful: **use the same categories on your estimate.** If your estimate says "Tile: 40 hours," your time sheets need a tile code, or you can never compare the two. If you are still building your estimating process, start with our [estimate template guide](/blog/construction-estimate-template).

## Breaks, overtime and pay rules (the basics)

This section is general information, not legal advice. Wage and hour rules come from federal law, state law and sometimes local ordinances, and they change. Check with the US Department of Labor, your state labor agency, your payroll provider or an employment attorney before setting policy.

That said, a few basics shape how you design time sheets:

- **Overtime.** Federal law generally requires overtime at one and a half times the regular rate for non-exempt employees who work more than 40 hours in a workweek. Some states add daily overtime or other rules. Your time sheet should make it easy to see daily and weekly totals.
- **Meal and rest breaks.** Federal law does not generally require meal breaks for adults, but many states do, with specific timing rules. Record actual break times so you can show compliance.
- **Travel time.** Travel between job sites during the workday is generally treated as work time; an ordinary commute from home to the first site generally is not. The details have exceptions, so confirm how they apply to your situation.
- **Public and prevailing wage work.** Government-funded jobs often come with extra wage rates and reporting requirements. Read the contract carefully and get advice before the first payroll.
- **Subcontractors are different.** Independent subs bill you; they do not go on your payroll time sheets. Whether someone is truly a contractor or an employee is a legal question with real consequences, so get it right.

## A weekly approval routine

Time sheets are only as good as the review behind them. A simple rhythm:

1. **Daily:** each worker (or the foreman for the crew) records times, job and cost code before leaving the site.
2. **Daily:** the foreman compares the time sheet with the [daily job report](/blog/daily-job-report-template). Same people, same hours, same job.
3. **End of week:** each worker reviews and signs their own week.
4. **End of week:** the foreman or owner approves and flags anything odd.
5. **Payroll day:** the office locks the approved sheets and sends totals to payroll. Changes after this point get a dated correction, not an overwrite.

> **Tip:** Fix problems on Monday, not Friday. A question about Tuesday's hours is easy to answer on Wednesday and nearly impossible two weeks later.

## Common time sheet errors (and how to catch them)

| Error | How to catch it |
| --- | --- |
| Hours charged to the wrong job | Compare with daily reports |
| 8.0 hours every day for everyone | Require actual start and end times |
| Missing or unrecorded breaks | Make break times a required field |
| Week filled in on Friday from memory | Daily entry, foreman checks daily |
| Travel and shop time not recorded | Give them their own cost codes |
| Change order hours in base scope | Require a CO number for extra work |
| Overtime not separated | Show daily and weekly totals |

## How hours feed payroll and job costing

The same approved time sheet does two jobs.

**Payroll** needs each worker's total regular and overtime hours for the pay period, plus anything else your payroll provider asks for. It does not care which job the hours were on.

**Job costing** needs hours by job and by task, multiplied by a *burdened* labor rate: the wage plus payroll taxes, workers' comp, insurance and other costs that come with every paid hour. Using the bare wage understates what labor really costs you.

### Worked example (hypothetical numbers)

Say a carpenter earns $30 an hour and your labor burden adds roughly 30%, for a burdened rate of $39 an hour. You estimated a bathroom remodel at 120 labor hours. Approved time sheets show:

| Cost code | Estimated hours | Actual hours |
| --- | --- | --- |
| 01 Demo | 16 | 18 |
| 02 Framing | 24 | 38 |
| 05 Tile | 50 | 62 |
| 08 Punch list | 30 | 32 |
| **Total** | **120** | **150** |

The job used 30 extra hours, or about $1,170 at the burdened rate, coming straight out of profit. And because hours were coded, you can see where: framing and tile. Maybe the framing surprise was a hidden condition that should have been a change order. Maybe your tile production rate in the estimate is too optimistic. Either way, you now have something specific to fix on the next bid. Our guide to [calculating job profit margin](/blog/how-to-calculate-job-profit-margin) shows how this rolls into the full picture.

### Friday time sheet review

- [ ] Every worker has an entry for every day worked
- [ ] Each entry has a job and a cost code
- [ ] Start, end and break times recorded
- [ ] Hours match the daily job reports
- [ ] Change order hours tagged with the CO number
- [ ] Daily and weekly overtime clearly shown
- [ ] Travel and shop time recorded
- [ ] Worker signature and foreman approval
- [ ] Approved sheets locked and sent to payroll

## How ContractorDocs helps

ContractorDocs is not payroll software and does not have a GPS time clock. What it does well is the paperwork around the hours. A Time Sheet is one of 12 [document types](/features#documents), created under the job it belongs to, so a job's time sheets sit next to its estimate, daily reports and invoices. The foreman can fill it in from a phone browser, or describe the day and let the AI assistant draft it for review. Approved sheets export as PDFs for your records or your payroll provider. And [job profit tracking](/features#profit-tracking) compares what you have invoiced on each job with the costs you have recorded, so overruns show up while the job is still running. Plans start free; see [pricing](/pricing).`,
  faq: [
    {
      q: 'How often should crews fill out time sheets?',
      a: 'Daily, before leaving the site. Weekly time sheets filled in from memory are where most errors come from. A daily entry takes a minute or two and is far more accurate.',
    },
    {
      q: 'Do I need cost codes if I’m a small contractor?',
      a: 'You don’t need a long list, but a handful of codes that match your estimate line items is worth it. Without them, you know a job ran over but not which task caused it, so you can’t fix your next estimate.',
    },
    {
      q: 'Should travel time go on the time sheet?',
      a: 'Record it, under its own code. Whether a particular trip counts as paid work time depends on federal and state rules, so check with your payroll provider or labor agency. For job costing, travel between sites is a real cost of the job and should be tracked.',
    },
    {
      q: 'What is a burdened labor rate?',
      a: 'It is the hourly wage plus the costs that come with each paid hour, such as payroll taxes, workers’ comp and insurance. Use it, not the bare wage, when you calculate what labor cost a job. See our guide to [job profit margin](/blog/how-to-calculate-job-profit-margin).',
    },
    {
      q: 'Can a time sheet be signed electronically?',
      a: 'Many contractors have workers and foremen sign time sheets electronically. Whatever method you use, keep the approved version unchanged and record corrections separately with a date.',
    },
  ],
  cta: {
    heading: 'Put every hour on the right job',
    text: 'Create time sheets under each job, keep them next to the daily reports, and see labor costs against what you’ve invoiced.',
    href: '/auth/signup',
    label: 'Start free',
  },
};

export default post;
