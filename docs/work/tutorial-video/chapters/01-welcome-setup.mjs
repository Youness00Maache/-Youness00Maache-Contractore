// Chapter 1: Welcome and your first 10 minutes (source: help guide "setup-assistant", components/help/AppTour.tsx, Settings).
//
// This chapter needs a BRAND-NEW account (empty business, tour and setup sheet not seen). The recorder resets the demo backend
// without saying which chapter it records, so when the RECORDER (record/chapter.mjs) loads this file it asks for that state itself.
// (The validator and the voice step load this file too and must not touch the backend: hence the argv check.)
if (/record[\\/]chapter\.mjs$/.test(process.argv[1] || '')) {
  const backend = process.env.TUTORIAL_BACKEND || 'http://127.0.0.1:54329';
  await fetch(`${backend}/__reset?chapter=01`).catch(() => {});
}

export default {
  id: 'welcome-setup',
  number: 1,
  title: 'Welcome and your first 10 minutes',
  summary: 'Take the one-minute tour, fill in the setup checklist, and look around with an example project.',
  minutes: 3,
  covers: ['setup-assistant'],
  demoData: [
    'a "brand-new account" state: the first-login product tour and the setup sheet open by themselves (or a reset switch in the fake backend), with business details, tax and terms still empty',
    'the demo profile on Premium + AI so the "Your team" step of the setup sheet is visible',
    'no example project yet (scene s07 adds one and removes it again, leaving the demo data clean)',
    'a Settings page with the Company and Appearance & language sections and a Setup assistant row with Resume setup',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'Welcome to ContractorDocs, the app that keeps your jobs, clients and paperwork in one place.',
        'In this first chapter, you go from a brand-new account to your first professional estimate, in about ten minutes.',
        'We will take a quick tour, fill in your business details, and look around with an example project.',
      ],
      do: [
        { with: 0, act: 'caption', text: 'Chapter 1: Welcome and your first 10 minutes' },
        // a brand-new account gets the tour by itself; in the recording stack it is started from the help panel instead
        { with: 2, act: 'click', target: 'How it works' },
        { with: 2, act: 'click', target: 'Take the app tour' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'The first time you sign in, a one-minute tour shows you where everything lives.',
        'Click Show me to start, and each step lights up one part of the screen.',
        'Click Next to move along, or click Skip tour to explore on your own.',
        'You can replay the tour any time from your account menu, under Help and tutorials.',
      ],
      do: [
        { with: 1, act: 'click', target: 'Show me', role: 'button' },
        { with: 2, act: 'click', target: 'Next', role: 'button' },
        { with: 2, act: 'click', target: 'Next', role: 'button' },
        { with: 2, act: 'highlight', target: 'Skip tour' },
        { with: 3, act: 'key', key: 'ArrowRight' },
        { with: 3, act: 'wait', s: 0.6 },
        { with: 3, act: 'key', key: 'ArrowRight' },
        { with: 3, act: 'wait', s: 0.6 },
        { with: 3, act: 'key', key: 'ArrowRight' },
        { with: 3, act: 'wait', s: 0.6 },
        { with: 3, act: 'key', key: 'ArrowRight' },
        { with: 3, act: 'highlight', target: 'Account menu', label: 'Replay the tour: Help & tutorials' },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Right after the tour, a short setup sheet opens. It walks you to your first professional estimate.',
        'Every screen saves into the same place as Settings, so nothing is typed twice.',
        'Click Save and continue to move on, or Skip this step to come back to it later.',
        'A step you already filled in is marked Already set up.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Done', role: 'button' },
        { with: 2, act: 'highlight', target: 'Save and continue', patience: 20000 },
        { with: 2, act: 'highlight', target: 'Skip this step' },
        { with: 3, act: 'click', target: 'Contact and address' },
        { with: 3, act: 'highlight', target: 'Already set up' },
        { with: 3, act: 'click', target: 'Your business' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'The first steps are your business details. Type your company name, and add your logo.',
        'Check the phone and the address, because they are printed on every document you send.',
        'Next come your sales tax, how many days an invoice is due, and your deposit wording.',
        'These only change your new estimates and invoices. Documents you already saved are never touched.',
      ],
      do: [
        { with: 0, act: 'type', target: 'Company name', text: 'Northline Remodeling' },
        { with: 0, act: 'highlight', target: 'Logo' },
        { with: 1, act: 'click', target: 'Save and continue' },
        { with: 1, act: 'highlight', target: 'Phone' },
        { with: 1, act: 'highlight', target: 'Business address' },
        { with: 2, act: 'click', target: 'Save and continue' },
        { with: 2, act: 'type', target: 'Sales tax (%)', text: '7.5' },
        { with: 2, act: 'click', target: '30 days' },
        { with: 3, act: 'highlight', target: 'Deposit and payment terms on estimates' },
        { with: 3, act: 'click', target: 'Use 50% deposit wording' },
        { with: 3, act: 'click', target: 'Save and continue' },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'Next, pick your trades and type your hourly labor rate.',
        'Kits, job profit and time-and-materials bills all use that rate.',
        'The price book step lists starter kits for your trades, priced at your labor rate.',
        'Click Import to add them all, or Choose which ones, with details. They are starting prices, so change them to yours.',
        'On Document look, Free accounts use the Basic designs. Click Keep Classic Basic for now, and change it later.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Your trades (pick any)' },
        { with: 0, act: 'click', target: 'Kitchen' },
        { with: 0, act: 'click', target: 'Bathroom' },
        { with: 1, act: 'type', target: 'Hourly labor rate ($/hour)', text: '65' },
        { with: 1, act: 'click', target: 'Save and continue' },
        { with: 3, act: 'highlight', target: 'Choose which ones, with details' },
        { with: 3, act: 'click', target: 'Import', role: 'button' },
        { with: 4, act: 'highlight', target: 'Keep Classic (Basic) for now' },
        { with: 4, act: 'click', target: 'Keep Classic (Basic) for now' },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'On the Get paid step, paste your payment link from PayPal, Venmo, Square, Stripe, Cash App or your bank page.',
        'Your new invoices then get a Pay now button, and the money goes straight to you.',
        'Add your Google review link as well, for the thank-you message after an invoice is paid.',
        'On Premium, one more step is your team. Type a worker name, and click Add and get link for a private clock-in link.',
      ],
      do: [
        { with: 0, act: 'click', target: 'PayPal' },
        { with: 0, act: 'type', target: 'Payment link', text: 'https://paypal.me/northline' },
        { with: 2, act: 'type', target: 'Google review link (optional)', text: 'https://g.page/r/northline-demo/review' },
        { with: 2, act: 'click', target: 'Save and continue' },
        { with: 3, act: 'type', target: 'Their name', text: 'Jamal' },
        { with: 3, act: 'click', target: 'Add and get link' },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop',
      say: [
        'On the last screen, click Add an example project to create a sample client, job and draft estimate.',
        'Everything in it is marked Example, and the app never adds it by itself.',
        'When you have looked around, click Remove example data. It removes exactly those items and nothing else.',
        'Need to stop halfway? Click Skip for now. Everything you saved stays saved.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Continue', role: 'button' },
        { with: 0, act: 'click', target: 'Add an example project' },
        { with: 1, act: 'wait', s: 2 },
        { with: 2, act: 'click', target: 'Remove example data' },
        { with: 2, act: 'click', target: 'Yes, remove it' },
        { with: 3, act: 'highlight', target: 'Skip for now' },
        { with: 3, act: 'click', target: 'Skip for now' },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'desktop',
      say: [
        'Everything the checklist saved lives in Settings, so you can change it any time.',
        'Under Company, you find your company name, business email, phone, address and logo.',
        'Under Appearance and language, choose Light, Dark or Blue, and pick the language you want the app in.',
        'To bring the checklist back, click Resume setup under Setup assistant, or Review setup once every step is done.',
        'Your account is ready. Next, let us explore the dashboard and find your way around.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Account menu' },
        { with: 0, act: 'click', target: 'Settings', role: 'menuitem' },
        { with: 1, act: 'highlight', target: 'Company name', patience: 30000 },
        { with: 2, act: 'scroll', to: 'Appearance & language' },
        { with: 2, act: 'highlight', target: 'Theme' },
        { with: 2, act: 'highlight', target: 'Language' },
        { with: 3, act: 'highlight', target: 'Review setup', label: 'Resume setup' },
      ],
    },
  ],
};
