// Chapter 6: Estimates, approvals and e-signatures (help guide "estimates"; Sections.tsx "Client approval"; SignedLock.tsx).
export default {
  id: 'estimates-signatures',
  number: 6,
  title: 'Estimates, approvals and e-signatures',
  summary: 'Write an estimate, send the approval link, see the client sign, then convert it to an invoice or revise it.',
  minutes: 3,
  covers: ['estimates'],
  demoData: [
    'job "Halvorsen Deck Estimate" (Greg Halvorsen) with no documents yet, for writing a new estimate',
    'job "Whitfield Kitchen Remodel" with the signed estimate EST-1042 (status Accepted, client signature image, signed by Sarah Whitfield, signed date) so the Client signed badge and Approved by the client box show',
    'a bell notification and a "Signed by clients" count for that signature',
    'an estimate with a Valid until date within 3 days (for the bell reminder mention)',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'An estimate is how you win the job. In this chapter you write one, and get it signed online.',
        'Open the job and click New Document, then choose Estimate.',
        'Set Valid until, so your client knows how long your price holds.',
        'Add your items, and write your payment terms under Notes and terms.',
        'Turn on Profit tools to see your cost, profit and margin on each line. These are never printed.',
      ],
      do: [
        { with: 0, act: 'caption', text: 'Chapter 6: Estimates and e-signatures' },
        { with: 1, act: 'click', target: 'Halvorsen Deck Estimate' },
        { with: 1, act: 'click', target: 'New Document' },
        { with: 1, act: 'click', target: 'Estimate' },
        { with: 2, act: 'highlight', target: 'Valid until' },
        { with: 3, act: 'click', target: 'Add line' },
        { with: 3, act: 'highlight', target: 'Notes & terms' },
        { with: 4, act: 'click', target: 'Profit tools' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Click Save first. Then, in the Client approval box, click Copy approval link.',
        'Paste it into a text or an email. Or click Share, and send it from there.',
        'The link needs no login and no app, so your client can open it on any phone.',
        'It does not stop working on its own, so your client can come back to it.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Save', role: 'button' },
        { with: 0, act: 'scroll', to: 'Client approval' },
        { with: 0, act: 'click', target: 'Copy approval link' },
        { with: 1, act: 'highlight', target: 'Share' },
      ],
    },
    {
      id: 's03', kind: 'motion',
      say: [
        'This is what your client sees on their phone.',
        'They open the link, read the estimate, and type their full name.',
        'Then they draw their signature with a finger, and tap Approve and sign.',
        'If the price is not right for them, they can tap Decline and tell you why.',
      ],
      visual: 'A phone frame slides up over the dark app background. On the screen is a clean estimate page with the Northline Remodeling logo, "Halvorsen Deck Estimate", a few line items and a total. The page scrolls down to a signature area: a name field types "Greg Halvorsen" letter by letter, then a finger draws a loopy signature on a pad, and a big green button "Approve & sign" gets tapped. A green check and a short thank-you message appear. For the last sentence, a small "Decline" link is tapped and a box opens where a short reason is typed.',
      do: [
        { with: 0, act: 'caption', text: 'What your client sees' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'When the client signs, you see it right away.',
        'In the job document list, the estimate carries a green Client signed badge.',
        'Open it, and you see Approved by the client, with the signature, the name and the date.',
        'The bell tells you too, and the dashboard counts it under Signed by clients.',
        'Now click Convert to invoice to bill it, without typing anything twice. The next chapter shows its choices.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Whitfield Kitchen Remodel' },
        { with: 1, act: 'highlight', target: 'Client signed' },
        { with: 2, act: 'click', target: 'EST-1042', unsure: true },
        { with: 2, act: 'highlight', target: 'Approved by the client' },
        { with: 4, act: 'highlight', target: 'Convert to invoice' },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'Signed documents are locked, so what the client agreed to cannot change by accident.',
        'If the price really has to change, click Revise.',
        'Create revision starts a new version, and Unlock this one reopens the signed estimate.',
        'To send a fresh approval link, open the client, click Get approval, then New link. The old link stops working.',
      ],
      do: [
        { with: 1, act: 'click', target: 'Revise' },
        { with: 2, act: 'highlight', target: 'Create revision' },
        { with: 2, act: 'highlight', target: 'Unlock this one' },
        { with: 2, act: 'key', key: 'Escape' },
        { with: 3, act: 'highlight', target: 'Client approval', unsure: true },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'Every estimate has a Valid until date, so you are never stuck with an old price.',
        'Three days before an estimate runs out, the bell reminds you.',
        'And if you turn on estimate follow-ups, the app can nudge the client by email, after three and seven days.',
        'Those reminders stop on their own when the estimate is approved, declined or expires.',
        'Next, let us look at offering your client choices, and at building full proposals.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Valid until' },
        { with: 1, act: 'click', target: 'Notifications', unsure: true },
        { with: 1, act: 'key', key: 'Escape' },
      ],
    },
  ],
};
