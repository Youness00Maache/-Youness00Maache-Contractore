import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'certificate-of-completion-construction',
  answer:
    'A construction certificate of completion is a short signed document saying the work in a contract is finished, on what date, and what is still open. It should name the client, contractor and job address, describe the work, give the completion date, list any remaining punch items and money still due, and carry both signatures.',
  takeaways: [
    'Tie the certificate to one contract or estimate number, so nobody argues about which work it covers.',
    'Say whether it is substantial completion (usable, small items left) or final completion (nothing left).',
    'Write open punch items and the unpaid balance on the certificate instead of leaving them out.',
    'It is not a certificate of occupancy and not a lien waiver: those are separate documents.',
    'Check the contract first, because the signature date can start warranty, retainage and payment deadlines.',
  ],
  howTo: {
    name: 'How to issue a certificate of completion',
    totalTime: 'PT30M',
    steps: [
      { name: 'Read the contract', text: 'Check how the contract defines completion, who has to sign and what the date starts.' },
      { name: 'Walk the job', text: 'Walk the work with the client and write every open item on a punch list.' },
      { name: 'Pick the type', text: 'Use substantial completion if the space is usable with minor items left, or final completion if nothing is left.' },
      { name: 'Fill in the certificate', text: 'Add the parties, address, contract number, work description, dates, open items and balance.' },
      { name: 'Get both signatures', text: 'Both sides sign and date it, and each keeps a copy with the job records.' },
      { name: 'Send the closeout papers', text: 'Send the final invoice, the warranty and any lien waiver the payment calls for.' },
    ],
  },
  body: `The last day of a job usually ends with a handshake. Two months later someone asks when the work was actually finished: the client because something stopped working, you because the final payment never arrived. A certificate of completion answers that question with one signed page.

Below is a construction certificate of completion template you can copy, a filled-in example, and the points to settle before anyone signs.

## What is a certificate of completion in construction?

It is a written statement that the work described in a contract is complete as of a certain date. The contractor prepares it, and the client (or the general contractor, owner or architect, depending on the job) signs to accept it.

On a small residential job it does four practical things:

- Fixes the date the work was finished.
- Records that the client saw the work and what they had left to complain about.
- Gives the final invoice something to point to.
- Gives the warranty period a clear starting point, if the contract or warranty ties it to completion.

What it does legally depends on your contract and your state. Do not assume a signature waives anything unless the wording and the law say so.

## Certificate of completion template (copy this)

Copy the fields into a document. Delete the lines that do not apply to your job.

| Field | What to write |
| --- | --- |
| Title | Certificate of Completion |
| Certificate date | The day it is prepared |
| Contractor | Business name, address, phone, license number if you have one |
| Client | Name and address |
| Job address | Where the work was done |
| Contract reference | Contract or estimate number and its date, plus approved change order numbers |
| Description of work | Two to five lines summarizing the scope |
| Type of completion | Substantial or final |
| Completion date | The date the work reached that stage |
| Open items | The punch list with a target date, or "None" |
| Payment status | Contract total, approved changes, paid to date, balance due and when |
| Warranty | Which warranty applies and the date it starts |
| Handover | Manuals, keys, permits closed, product information given to the client |
| Signatures | Name, signature and date for each side |

Statement to put above the signatures:

> The work described above, under the contract referenced, was (substantially / finally) complete on (date), except for the open items listed. Signing this certificate does not change the contract, the warranty or the amounts owed, except as written here.

That last sentence keeps the certificate from quietly turning into a new agreement. If you want it to do more, such as release a claim or accept a credit, have a lawyer write that wording.

## Filled-in example

Example only: the business, client, numbers and dates are invented.

| Field | Entry |
| --- | --- |
| Contractor | Example Remodeling, 14 Sample Street |
| Client | J. Rivera |
| Job address | 220 Example Avenue |
| Contract reference | Estimate 1042 dated March 3, change orders 1 and 2 |
| Description of work | Hall bathroom remodel: demolition, tub to shower, tile, vanity, fan, paint |
| Type of completion | Substantial |
| Completion date | April 18 |
| Open items | Replace one chipped tile trim piece; adjust shower door. Target April 25 |
| Contract total | 14,000 |
| Approved changes | 900 |
| Paid to date | 11,900 |
| Balance due | 3,000, due when the open items are verified |
| Warranty | Workmanship warranty starting April 18 |

The arithmetic is on the page: 14,000 plus 900 is 14,900, and 14,900 minus 11,900 leaves 3,000. A client who can check the numbers has less to dispute.

## What is the difference between substantial and final completion?

Substantial completion generally means the client can use the work for its purpose even though small items remain. Final completion means every item in the contract, including the punch list, is done. Larger contracts define both terms precisely, and that definition wins over any general one.

| Question | Substantial completion | Final completion |
| --- | --- | --- |
| Can the client use the space? | Yes | Yes |
| Open punch items? | Minor ones, listed | None |
| Typical next step | Finish and verify the list | Final payment and closeout |
| What to put on the certificate | The list and a target date | "No open items" |

Two certificates are fine on a job where weeks pass between the stages. On a one-day repair, a single final sign-off is enough.

Use your [punch list](/blog/punch-list-template-for-contractors) as the attachment for open items. One list with a date stops new requests from sliding in afterwards. New work belongs on a [change order](/blog/change-order-form-guide).

## How do you issue a certificate of completion?

1. Read the contract. Look for the definition of completion, who must sign, notice requirements and what the date starts.
2. Walk the job with the client and write down every open item.
3. Pick substantial or final.
4. Fill in the certificate, attaching the punch list and a few dated [job site photos](/blog/job-site-photos-for-contractors).
5. Get both signatures. Send each side a copy the same day.
6. Send the closeout papers: final invoice, warranty and any lien waiver the payment calls for.

## What if the client will not sign?

Find out why before you argue about the paper.

- If they point to real unfinished work, add it to the open items with a date. They can then sign a certificate that tells the truth.
- If they ask for new work, price it separately and keep it off the certificate.
- If they simply do not answer, send the completed certificate in writing with the date you consider the work complete, and ask them to sign or list specific items by a stated day.

Do not write that silence counts as acceptance unless your contract says it does. If payment stops along with the signature, follow the steps for [a client who will not pay](/blog/what-to-do-when-a-client-wont-pay-a-contractor).

## Is it the same as a certificate of occupancy or a lien waiver?

No. The names sound alike and get mixed up.

| Document | Who issues it | What it is about |
| --- | --- | --- |
| Certificate of completion | Contractor, signed by client or owner | The contracted work is finished |
| Certificate of occupancy | Local building authority | The building may be occupied |
| Lien waiver | The party being paid | Giving up lien rights for a payment, as worded |
| Warranty | Contractor or manufacturer | What gets fixed later, and for how long |
| Final invoice | Contractor | What is still owed |

Some states also have a recorded notice of completion, which is a separate filing that can change lien deadlines. Ask a local attorney or your county recorder how it works where you build. Read [lien waivers explained](/blog/lien-waivers-explained) before you sign one with the final check.

## Checklist before anyone signs

- [ ] Contract checked for its definition of completion
- [ ] Contract, estimate and change order numbers written on the certificate
- [ ] Substantial or final clearly marked
- [ ] Every open item listed with a target date, or "None"
- [ ] Payment numbers add up
- [ ] Warranty named with its start date
- [ ] Permit inspections passed or their status noted
- [ ] Photos taken and saved with the job
- [ ] Both sides signed, dated and sent a copy

## Where ContractorDocs fits

ContractorDocs does not have a separate certificate of completion document type, so use the template above for the certificate itself. The papers around it are covered: every job has a punch list tab where items can be marked done and then verified, there is a warranty document with a coverage period, and the final bill comes from the same job as the estimate and change orders. See the [features page](/features#documents), try the [invoice generator](/invoice-generator), and use the [job closeout checklist](/blog/job-closeout-checklist-for-contractors) so nothing is left behind.

## What this does not cover

Public and commercial projects often require specific completion forms from the owner, architect or lender. Use theirs. Rules on completion, notices, retainage and lien deadlines vary by state and contract. This article is general information, not legal advice.`,
  faq: [
    {
      q: 'Who signs a construction certificate of completion?',
      a: 'The contractor and the person accepting the work, usually the property owner. On larger projects the contract may also require a general contractor, architect or lender to sign.',
    },
    {
      q: 'Is a certificate of completion legally required?',
      a: 'It depends on the contract, the project and the state. Many small jobs have no requirement, while some contracts and public projects demand a specific form. This is not legal advice.',
    },
    {
      q: 'Can a certificate of completion have open items?',
      a: 'Yes, if it is a substantial completion certificate. List each item with a target date, using a [punch list](/blog/punch-list-template-for-contractors) as the attachment.',
    },
    {
      q: 'Does signing a certificate of completion start the warranty?',
      a: 'Only if the contract or the warranty says the period starts at completion. Write the warranty start date on the certificate so both sides see the same date.',
    },
    {
      q: 'Is a certificate of completion the same as a certificate of occupancy?',
      a: 'No. A certificate of occupancy comes from the local building authority. A certificate of completion is between the parties to the construction contract.',
    },
  ],
  cta: {
    heading: 'Close out jobs without loose ends',
    text: 'Keep the estimate, change orders, punch list, warranty and final invoice together on one job. Start on the free plan.',
    href: '/auth/signup',
    label: 'Start free',
  },
};

export default post;
