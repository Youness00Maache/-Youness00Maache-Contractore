// Chapter 9: Getting paid (help guides "payments" and "reminders"; InvoiceForm.tsx "Add a Pay now link").
export default {
  id: 'get-paid',
  number: 9,
  title: 'Getting paid',
  summary: 'Add your payment link, record payments and part payments, get receipts, and let reminders chase late invoices.',
  minutes: 3,
  covers: ['payments', 'reminders'],
  demoData: [
    'Settings > Payments & reviews filled in: payment link https://pay.example/northline shown as PayPal, a Google review link',
    'invoice INV-2081 (Sarah Whitfield, Whitfield Kitchen Remodel, 7,200 deposit, status Sent) with the Pay now link switched on',
    'a client-reported payment: Sarah tapped "I\'ve paid" on INV-2081, so the dashboard shows "Payments reported by clients"',
    'Gmail shown as connected so the Reminders card can be configured',
    'the overdue invoice INV-2072 (Tom Alvarez) with a reminder history',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/settings',
      say: [
        'This chapter is about getting paid: your payment link, recording payments, and automatic reminders.',
        'In Settings, under Payments and reviews, paste the payment link from your own provider. It must start with https.',
        'You can also add a financing link for larger estimates, and your Google review link.',
      ],
      do: [
        { with: 0, act: 'caption', text: 'Chapter 9: Getting paid' },
        { with: 1, act: 'scroll', to: 'Payments & reviews' },
        { with: 1, act: 'highlight', target: 'Payment link', unsure: true },
        { with: 2, act: 'highlight', target: 'Financing for larger jobs', unsure: true },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Now open an invoice. In its Payment section, switch on Add a Pay now link.',
        'It is filled in from Settings, and you can change it on each invoice.',
        'Your client gets a Pay now button in the portal and in the email, and a Scan to pay code on the PDF.',
        'ContractorDocs never touches the money. The button opens your own payment provider.',
      ],
      do: [
        { with: 0, act: 'goto', route: '/dashboard' },
        { with: 0, act: 'click', target: 'Whitfield Kitchen Remodel' },
        { with: 0, act: 'click', target: 'INV-2081', unsure: true },
        { with: 0, act: 'scroll', to: 'Payment' },
        { with: 0, act: 'highlight', target: 'Add a “Pay now” link' },
        { with: 3, act: 'zoom', target: 'Add a “Pay now” link', scale: 1.2 },
        { with: 3, act: 'zoom', out: true },
      ],
    },
    {
      id: 's03', kind: 'motion',
      say: [
        'On their phone, your client taps Pay now, and lands on your payment page, like PayPal.',
        'After paying, they come back and tap I have paid.',
        'You get a notice right away, so you know to check your account.',
      ],
      visual: 'A phone frame showing the client portal with an invoice card and a big green "Pay now" button. The button is tapped and the screen swipes to a generic payment page with a PayPal-style header (no real logo, just a neutral colored banner). The screen swipes back to the portal, where a second button "I\'ve paid" is tapped and a short confirmation message appears. On the right, a desktop bell icon gets a red dot.',
      do: [
        { with: 0, act: 'caption', text: 'What your client does' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'On your dashboard, that shows under Payments reported by clients.',
        'Check your bank or payment app, then click Mark as paid.',
        'Check the amount, the date and the method, then click Mark paid.',
        'For a part payment, type the smaller amount and click Record.',
        'You can also click Mark as paid in the invoice header, or in the job document menu.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Payments reported by clients' },
        { with: 1, act: 'click', target: 'Mark as paid' },
        { with: 2, act: 'highlight', target: 'Mark paid', unsure: true },
        { with: 3, act: 'highlight', target: 'Record', unsure: true },
        { with: 4, act: 'highlight', target: 'Mark as paid' },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'Keep Create a receipt switched on, and a Receipt is made for you automatically.',
        'It is saved with the job documents, ready to send.',
        'On Premium, right after you mark an invoice paid, you can send your Google review link by Gmail, text or WhatsApp.',
        'You can make that automatic in Settings.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Create a receipt' },
        { with: 0, act: 'click', target: 'Mark paid', unsure: true },
        { with: 1, act: 'state', note: 'The new Receipt for INV-2081 appears in the job document list' },
        { with: 2, act: 'highlight', target: 'Send with Gmail', unsure: true },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop', route: '/settings',
      say: [
        'Chasing late payments is awkward, so let the app do it. In Settings, find Reminders.',
        'They go out from your own Gmail, so connect Gmail first.',
        'Choose what to send. Unpaid invoice reminders go on the due date, then seven and fourteen days after.',
        'Estimate follow-ups go out three and seven days after you send. Visit reminders go the day before a job, and are off by default.',
        'Pick the time of day and your time zone, edit the wording, check the Preview, and click Save reminders.',
      ],
      do: [
        { with: 0, act: 'scroll', to: 'Reminders' },
        { with: 1, act: 'highlight', target: 'Connect Gmail', unsure: true },
        { with: 2, act: 'highlight', target: 'Unpaid invoices', unsure: true },
        { with: 3, act: 'highlight', target: 'Visit reminders', unsure: true },
        { with: 4, act: 'highlight', target: 'Preview', unsure: true },
        { with: 4, act: 'click', target: 'Save reminders' },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop',
      say: [
        'Each invoice and estimate has a Reminders section, to switch them off for that document, or for that client.',
        'Reminders start once a document is marked Sent. They stop when the invoice is paid, or the client reports a payment.',
        'On the Free plan, each reminder uses one of your ten monthly emails.',
        'Next, let us bring in new work with leads.',
      ],
      do: [
        { with: 0, act: 'goto', route: '/dashboard' },
        { with: 0, act: 'click', target: 'Whitfield Kitchen Remodel' },
        { with: 0, act: 'click', target: 'INV-2081', unsure: true },
        { with: 0, act: 'scroll', to: 'Reminders' },
        { with: 1, act: 'highlight', target: 'Reminders' },
      ],
    },
  ],
};
