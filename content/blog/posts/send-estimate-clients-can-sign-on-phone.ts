import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'send-estimate-clients-can-sign-on-phone',
  answer:
    'To send an estimate clients can sign on their phone, save it in a tool that creates a secure approval link, send that link by email, text or WhatsApp, and let the client open it, read the estimate, type their name and draw a signature. The signed estimate should then lock, record who signed and when, and be ready to turn into a deposit invoice.',
  takeaways: [
    'Send a link, not just a PDF. A PDF attachment can be read on a phone, but signing it usually means printing or installing an app.',
    'The client shouldn’t need an account or a password to read and sign.',
    'A signed estimate must be locked, with the signer’s name, signature and time kept with the document.',
    'Follow up on a schedule, and make the next step (deposit, start date) part of the same message.',
  ],
  howTo: {
    name: 'How to send an estimate clients can sign on their phone',
    totalTime: 'PT10M',
    steps: [
      { name: 'Finish the estimate', text: 'Add the scope, line items, exclusions, deposit terms and a valid-until date, then save it.' },
      { name: 'Create the approval link', text: 'Copy the estimate’s approval link, or open the client’s portal link, which lists everything waiting for a signature.' },
      { name: 'Send it where the client reads messages', text: 'Email it from your own address, or text it or send it by WhatsApp with a one-line message and the link.' },
      { name: 'The client reviews and signs', text: 'The client opens the link on their phone, reads the estimate, types their full name, draws a signature and taps Approve & sign, or declines with a reason.' },
      { name: 'Follow up if there is no answer', text: 'Send a friendly reminder a few days after sending and again before the estimate expires.' },
      { name: 'Lock it and move to the deposit', text: 'Keep the signed copy unchanged, then send the deposit invoice and schedule the work.' },
    ],
  },
  body: `To get an estimate signed on a phone, send the client a secure link instead of a bare PDF. The link opens the estimate in their browser, they read it, type their name, draw a signature with a finger and tap approve. No printing, no scanning, no app to install, and you get a signed record with the name and time on it.

Most homeowners read your estimate on a phone, often the same evening you quote. If saying yes takes a printer, a pen and a scanner, the estimate sits in their inbox while they think about it, and sometimes while a competitor calls. Making the signature a two-minute job on the device they're already holding is one of the simplest ways to shorten the time from quote to start date.

## Why a link beats a PDF attachment

A PDF is fine for reading. It's poor for signing. Most clients can't sign a PDF on a phone without a separate app, and when they do, you get back a file you can't easily verify. A signing link solves both problems.

| Sending method | Client can read on a phone | Client can sign on a phone | You get a signing record |
| --- | --- | --- | --- |
| PDF by email | Yes | Rarely, needs an app | No |
| Print, sign, scan | No | No | A scan only |
| Separate e-signature service | Yes | Yes | Yes, in another system |
| Approval link from your estimating tool | Yes | Yes | Yes, on the estimate itself |

The last option keeps everything together: the estimate, the signature, the time it was signed and the job it belongs to.

## Step 1: Finish the estimate before you send it

A signature makes the estimate binding on both sides, so get it right first. Before sending, check:

- [ ] Line items describe the work specifically, in the order the crew will do it
- [ ] Exclusions say what isn't included (permits, painting, hidden conditions)
- [ ] Deposit amount and payment terms are on the estimate
- [ ] A valid-until date protects you from old prices
- [ ] The client's name, email or phone, and the job address are right

If you need a refresher on what belongs on an estimate, our [construction estimate template guide](/blog/construction-estimate-template) covers each part.

## Step 2: Create the approval link

In ContractorDocs, save the estimate, then in **Client approval** click **Copy approval link**. Or click **Share**, which saves the document and offers **Send with Gmail**, **Download PDF**, **Copy portal link**, the approval link, and text or WhatsApp.

Every client also has a private [client portal](/features#client-portal) that shows their balance, what's waiting for a signature and their documents. On the client's page, **Get approval** lists every estimate and change order for that client with **Copy link** and **Email link**. If you ever send a link to the wrong person, **New link** replaces it and the old one stops working.

## Step 3: Send it where the client actually reads

Use the channel the client answers. Some reply to email the same day; others only read texts.

- **Email:** with [Gmail connected](/features#gmail), the estimate goes from your own address, with the PDF attached and the link in the message, so replies come back to your inbox. ContractorDocs only asks Google for permission to send, not to read your inbox.
- **Text or WhatsApp:** the Text and WhatsApp buttons open your phone's own messaging app with the message and link filled in, so it comes from your real number and costs nothing extra.

Keep the message short: who you are, what the estimate is for, the total, and what to do. For example: "Hi Dana, here's the estimate for the deck at 14 Elm St: $7,550. You can review and sign here. Once it's signed I'll send the deposit invoice and lock in a start date."

## Step 4: The client reviews and signs

The client opens the link on their phone. No account or password is needed. They read the estimate, type their full name, draw their signature and tap **Approve & sign**. If they don't want to go ahead, they can tap **Decline** and give a reason, which is more useful than silence.

If you sent good, better and best options, the client taps the option they want before signing. Our guide to [good, better, best pricing](/blog/good-better-best-pricing-for-contractors) explains how to build them.

You'll see the result straight away: the bell shows that the client signed, approved or declined, and the estimate shows **Approved** with a **Client signed** badge in the job's document list.

## Step 5: Follow up without chasing

Many estimates go unsigned simply because the client got busy. A short reminder fixes most of them. In ContractorDocs, automatic estimate follow-ups go out from your own Gmail, by default 3 and 7 days after sending, and stop by themselves when the estimate is approved, declined or expires. You can change the days and the wording in Settings, or switch reminders off for one document. Our guide to [getting paid faster](/blog/how-contractors-get-paid-faster) covers follow-up timing in more detail.

## Step 6: Lock it, then move to the deposit

A signed estimate shouldn't change. If anyone can edit the lines after the client signed, the signature means little. In ContractorDocs, signed estimates and change orders are locked. If the scope changes, **Revise** starts a new revision as a draft, which needs a new signature, so the record always shows what the client actually agreed to.

Once it's signed, keep momentum:

1. Send the deposit invoice the same day.
2. Confirm the start date.
3. Use **Convert to invoice** when it's time to bill, so the invoice matches the estimate line for line.

Changes during the job deserve the same treatment: a [change order](/blog/change-order-form-guide) signed on the phone before the extra work starts.

## Are phone signatures legally valid?

In the US, the federal ESIGN Act and state laws based on UETA generally give electronic signatures the same effect as ink for most business documents, including estimates and change orders. What makes a signature hold up is the evidence around it: clear intent to sign, an unchanged signed copy, and a record of who signed and when. Some documents, such as certain lien or notarized documents, may need specific forms. Our article on [e-signatures for contractors](/blog/e-signatures-for-contractors) covers the details; check with a local attorney for anything unusual.

## What the signed record should show

Whatever tool you use, check that the signed estimate keeps these details together, because they're what you'll need if there's ever a dispute:

- The full estimate exactly as the client saw it, including exclusions and terms
- The signer's typed name and drawn signature
- The date and time of signing
- Which option the client chose, if you offered more than one
- A way to download the signed copy as a PDF for your records

## Common reasons phone signatures stall

- **The link asks the client to create an account.** Every extra step loses people.
- **The estimate is hard to read on a small screen.** Short line descriptions and a visible total help.
- **No clear next step.** Tell the client what happens after they sign.
- **The estimate expired.** Send a fresh one with current prices rather than signing an old number.

If you want to try it on your next quote, you can create the estimate with the [free estimate generator](/estimate-generator), or describe the job to the [AI estimate generator](/features#ai-assistant) and send the approval link from ContractorDocs.`,
  faq: [
    {
      q: 'Can a client sign an estimate on their phone without an app?',
      a: 'Yes, if you send a signing link. The client opens it in their phone’s browser, reads the estimate, types their name, draws a signature with a finger and taps approve. In ContractorDocs no account or password is needed.',
    },
    {
      q: 'Is a signature drawn on a phone legally binding?',
      a: 'In the US, the ESIGN Act and state laws based on UETA generally treat electronic signatures like ink signatures for most business documents. Keep an unchanged signed copy with the signer’s name and time. Read more in our [e-signature guide](/blog/e-signatures-for-contractors).',
    },
    {
      q: 'What happens if the client wants changes after signing?',
      a: 'Don’t edit the signed estimate. Create a revision or a change order and get a new signature. In ContractorDocs signed estimates are locked, and Revise starts a new draft revision that needs a new signature.',
    },
    {
      q: 'Can I text an estimate to a client?',
      a: 'Yes. ContractorDocs has Text and WhatsApp buttons that open your phone’s messaging app with the message and the approval link filled in, so it comes from your own number.',
    },
    {
      q: 'Does it cost anything to send estimates for signature?',
      a: 'E-signatures and the client portal are included on every ContractorDocs plan, including Free. The Free plan includes 10 Gmail emails a month; Premium removes that limit. See [pricing](/pricing).',
    },
  ],
  cta: {
    heading: 'Get your next estimate signed on a phone',
    text: 'Create the estimate, send the approval link by email, text or WhatsApp, and see the signature the moment it lands. Free plan, no credit card.',
    href: '/estimate-generator',
    label: 'Start an estimate',
  },
};

export default post;
