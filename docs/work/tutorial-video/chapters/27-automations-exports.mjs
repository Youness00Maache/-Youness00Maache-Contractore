// Chapter 27: Automations, integrations and exports. Sources: help guides `automations`, `integrations`, `calendar-file`, `accounting-exports`.
// (The bell itself is chapter 2; here only the notification settings are shown.)
export default {
  id: 'automations-exports',
  number: 27,
  title: 'Automations, integrations and exports',
  summary: 'Switch on follow-up rules, connect Gmail, put your schedule in your phone calendar, and export files for QuickBooks or Xero.',
  minutes: 3.5,
  covers: ['automations', 'integrations', 'calendar-file', 'accounting-exports'],
  demoData: [
    'Settings Automations list with rules grouped as Money, Jobs, Leads and clients, Stock and supplies; "Estimate with no answer" off, most others on; "Estimate approved, invoice next" set to Just tell me',
    'Gmail shown as Connected on the Integrations & data page',
    'calendar data to count: 4 active jobs, 2 appointments, 3 lead follow-ups, 5 open task due dates, 3 invoice or estimate dates, so the Set up the file counts are non-zero',
    'accounting data: at least 4 sent or paid invoices and 3 expenses in the previous month so the QuickBooks / Xero preview shows rows and totals',
    'the bookkeeper CSV / Your data section visible at the bottom of Settings',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/settings#automations',
      say: [
        'This chapter is about letting ContractorDocs follow up for you, and moving your numbers out.',
        'Open Settings and find Automations. The rules are grouped as Money, Jobs, Leads and clients, and Stock and supplies.',
        'Each row says what happens when something happens, and has an on and off switch.',
      ],
      do: [
        { with: 1, act: 'scroll', to: 'Automations' },
        { with: 2, act: 'highlight', target: 'Estimate with no answer', unsure: true },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'The reminder email and bell switches are the same settings you have in Reminders and Notifications.',
        'Changing one here changes it there too.',
        'Most rules start on. Estimate with no answer starts off, and you pick 3, 7 or 14 days.',
        'It tells you once per estimate, so you can call the client.',
      ],
      do: [
        { with: 2, act: 'click', target: 'Estimate with no answer', unsure: true },
        { with: 2, act: 'select', target: 'Days', option: '7 days', unsure: true },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Estimate approved, invoice next, and Job completed, warranty next, can make a draft instead of only telling you.',
        'Choose Just tell me, or Do it for me, which is Premium.',
        'A draft is a normal Draft document. Tap its note in the bell, check it, and send it yourself.',
        'A rule never sends, signs or bills anything for you.',
        'Do it for me starts the moment you choose it, and never touches older estimates or jobs.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Estimate approved, invoice next' },
        { with: 1, act: 'highlight', target: 'Just tell me' },
        { with: 1, act: 'highlight', target: 'Do it for me' },
        { with: 3, act: 'zoom', target: 'Do it for me', scale: 1.1, unsure: true },
        { with: 4, act: 'zoom', out: true },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'Notes from these rules show in the bell, once each.',
        'In Settings, Notifications, switch each type on or off, turn on Quiet mode, or allow pop-up notifications on this device.',
        'The Automation rules switch turns all rule notes off at once. Free keeps every just-tell-me rule.',
      ],
      do: [
        { with: 1, act: 'scroll', to: 'Notifications' },
        { with: 1, act: 'highlight', target: 'Quiet mode' },
        { with: 2, act: 'highlight', target: 'Automation rules', unsure: true },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop', route: '/settings#integrations',
      say: [
        'Now Integrations and data. Each row says in one line what it does, and shows if it is connected.',
        'Click Connect Gmail and choose your address on Google’s page.',
        'ContractorDocs only asks to send email for you. It cannot read your inbox.',
        'Reconnect renews a connection that stopped working, and Disconnect removes it.',
      ],
      do: [
        { with: 0, act: 'scroll', to: 'Integrations & data' },
        { with: 1, act: 'highlight', target: 'Connect Gmail', unsure: true },
        { with: 3, act: 'highlight', target: 'Reconnect', unsure: true },
        { with: 3, act: 'highlight', target: 'Disconnect', unsure: true },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'On the Calendar row, click Set up the file. Pick 30 days, 90 days, or A year.',
        'Tick what to include: Jobs, Appointments, Lead follow-ups, Task due dates, and Invoice, estimate and order dates.',
        'Click Download calendar file to get a standard dot ics file.',
        'In Google Calendar, use Import. On an Apple device, open the file and tap Add All. In Outlook, choose Upload from file.',
        'The file is a snapshot, so download it again when your jobs change.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Set up the file' },
        { with: 0, act: 'click', target: '90 days' },
        { with: 1, act: 'highlight', target: 'Lead follow-ups' },
        { with: 2, act: 'highlight', target: 'Download calendar file' },
        { with: 4, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop',
      say: [
        'On the Accounting row, click Make a file. Choose QuickBooks Online or Xero, then Invoices, Customers, Expenses or Payments received.',
        'Pick a month or Custom dates, and a filter. Drafts and cancelled invoices are never included.',
        'Check the preview: how many rows, what they add up to, and the first five.',
        'Click Download file, then import it in your accounting app.',
        'Column names follow each app’s template as we last knew it. Compare them with the current template under Columns and settings.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Make a file' },
        { with: 0, act: 'click', target: 'QuickBooks Online' },
        { with: 0, act: 'click', target: 'Invoices' },
        { with: 1, act: 'highlight', target: 'Unpaid only', unsure: true },
        { with: 2, act: 'zoom', target: 'Download file', scale: 1.05, unsure: true },
        { with: 2, act: 'zoom', out: true },
        { with: 3, act: 'highlight', target: 'Download file' },
        { with: 4, act: 'click', target: 'Columns and settings for this file', unsure: true },
        { with: 4, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'desktop',
      say: [
        'Open Your data for one backup of everything you have made, and the monthly bookkeeper CSV.',
        'They work on every plan. Nothing on this page sends anything by itself.',
        'The Price list row is a Premium feature, which we covered in the price book chapter.',
        'Next, let us talk about working offline and on your phone.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Open Your data' },
        { with: 2, act: 'highlight', target: 'Import price list' },
      ],
    },
  ],
};
