// Chapter 28: Working offline and on your phone. Source: NEXT_STEPS.md "OFFLINE AUDIT", components/Dock.tsx, components/AppNav.tsx,
// components/InstallAppBanner.tsx, components/offline/SyncStatusBar.tsx. No help guide: told in plain words, no technical terms.
export default {
  id: 'offline-phone',
  number: 28,
  title: 'Working offline and on your phone',
  summary: 'The phone bottom bar, installing the app, what keeps working with no signal, what needs a connection, and how syncing works.',
  minutes: 3.5,
  covers: [],
  demoData: [
    'dashboard in a 390 x 844 phone viewport with the bottom bar (Home, Clients, New job in the middle, Messages, Community, More) and the More sheet listing the Tools',
    'low stock items and one lead follow-up due so the red number on More is visible',
    'the Install banner and the offline strip are shown in motion scenes (they depend on the real phone), so no special data; the final app scene needs the Settings page with the Account section (Log out) at the bottom',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'phone', route: '/dashboard',
      say: [
        'This chapter is about using ContractorDocs on your phone, and what happens when you lose your signal.',
        'At the bottom of the screen is your bar: Home, Clients, Messages, Community and More.',
        'The big button in the middle starts a new job, or a new document when you are inside a job.',
        'Tap More to open everything else: Pipeline, Inventory, Price book, Papers, Crew and the rest.',
        'A red number on More tells you about low stock and leads waiting on you.',
      ],
      do: [
        { with: 1, act: 'highlight', target: 'Home' },
        { with: 2, act: 'highlight', target: 'New job' },
        { with: 3, act: 'click', target: 'More' },
        { with: 4, act: 'highlight', target: 'More', unsure: true },
        { with: 4, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's02', kind: 'motion',
      say: [
        'You may also see a banner that says Add ContractorDocs to your home screen. It works offline.',
        'On Android, tap Install. On an iPhone, tap How, then Share, then Add to Home Screen.',
        'After that, it opens like an app, full screen, and keeps working without a connection.',
        'The banner only shows where your phone can really add it.',
      ],
      visual: 'A phone frame with the app dashboard behind. A banner slides up above the bottom bar: the ContractorDocs logo, the text "Add ContractorDocs to your home screen. It works offline.", and a blue "Install" button. A finger taps it, the phone home screen appears and the app icon drops into place among the other icons. A second short variation shows the iPhone steps: a Safari share icon is circled, then the words "Add to Home Screen" are highlighted.',
      do: [{ with: 0, act: 'caption', text: 'Add it to your home screen' }],
    },
    {
      id: 's03', kind: 'motion',
      say: [
        'Now imagine you are in a basement with no signal. Keep working.',
        'A thin strip under the top bar says you are offline, and that your work saves on this device and syncs later.',
        'Whatever you create shows a Waiting to sync badge, so you can see what has not reached your account yet.',
      ],
      visual: 'A phone frame. The signal bars in the status area drop to nothing and a thin amber strip appears under the top bar: "Offline: your work saves on this device and syncs later." The user adds a new job and a daily report; small grey badges "Waiting to sync" appear on the job card and the document, and the strip changes to "2 changes waiting to sync" with a "View" link. Calm dark theme, large readable text.',
      do: [{ with: 1, act: 'caption', text: 'Offline: your work saves on the phone' }],
    },
    {
      id: 's04', kind: 'motion',
      say: [
        'Offline, you can create jobs and change their status, and add or edit clients and notes.',
        'You can take job photos, and the phone can hold up to 200 of them while it waits.',
        'You can draft estimates and invoices, and write daily reports, time sheets, material logs, expense logs and notes.',
        'Stock changes and checking items out to a job work too, and so do your price book and your settings.',
        'Screens you opened before, like the dashboard, your jobs, the calendar, the pipeline and Insights, still open with their last copy.',
      ],
      visual: 'A checklist card builds on the screen, green ticks appearing one by one next to short lines: "Create jobs and change status", "Clients and notes", "Job photos", "Estimate and invoice drafts", "Daily reports, time sheets, material and expense logs", "Stock and check-out", "Price book", "Settings". At the bottom a second row of small screen thumbnails (Dashboard, Jobs, Calendar, Pipeline, Insights) slide in with a label "Opens with the last copy".',
      do: [{ with: 0, act: 'caption', text: 'What works offline' }],
    },
    {
      id: 's05', kind: 'motion',
      say: [
        'Some things need a connection, and the app tells you so.',
        'That includes sending email, client links and the portal, recording payments, deleting things, duplicating jobs or documents, and billing time and materials.',
        'Purchase orders, importing and exporting files, Community, and the AI tools need a connection too.',
        'Those simply wait until you are back online.',
      ],
      visual: 'The same checklist card turns around to an amber list headed "Needs a connection": envelope "Sending email", link "Client links and portal", dollar "Payments", trash "Deleting", copy "Duplicating", clock "Billing time and materials", box "Purchase orders", file "Import and export", chat "Community", sparkle "AI tools". A small toast slides in that says "You are offline. This needs a connection; try again when you are back online."',
      do: [{ with: 0, act: 'caption', text: 'What needs a connection' }],
    },
    {
      id: 's06', kind: 'motion',
      say: [
        'When the signal returns, your work syncs by itself, in order: clients first, then jobs, then stock and price book, then documents.',
        'In a hurry? Tap Sync now, or View, to see exactly what is waiting.',
        'If something is refused, like a plan limit, it stays in the list with the reason, so you can fix it.',
      ],
      visual: 'The signal bars come back to full. The strip changes to "Syncing 2 changes..." with a pulsing dot, then the waiting badges on the job card and document fade out one after the other in the order clients, jobs, stock, documents. A second small example shows one badge turning red with the words "Free plan: 6 new jobs a month reached" staying in the list. A link "Sync now" and a link "View" are circled once.',
      do: [{ with: 0, act: 'caption', text: 'Back online: it syncs by itself' }],
    },
    {
      id: 's07', kind: 'app', device: 'phone', route: '/settings',
      say: [
        'Before you head to a dead zone, sign in and open the app once online, so your screens load in the background.',
        'Log out clears your data from this phone. If something is waiting to sync, the app asks you to sync first.',
        'Your crew links work offline too: punches are saved on the worker’s phone and sent in order.',
        'Next, let us see where to get help and meet the Community.',
      ],
      do: [
        { with: 1, act: 'scroll', to: 'Log out' },
        { with: 1, act: 'highlight', target: 'Log out' },
      ],
    },
  ],
};
