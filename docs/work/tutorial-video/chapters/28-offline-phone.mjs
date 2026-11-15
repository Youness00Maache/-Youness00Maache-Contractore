// Chapter 28: The app on your phone, and working offline. The complete phone chapter (owner request 2026-11-15).
// Sources (checked in the code): lib/installPrompt.ts + components/InstallAppBanner.tsx (banner: from the 2nd visit or after a saved document, Android
// "Install" = the browser's install dialog, iPhone "How?" = Share > Add to Home Screen, never again after the cross, never when installed), public/sw.js
// (the app opens without a connection after one online visit), components/Dock.tsx + components/AppNav.tsx (bottom bar, middle button New job / New doc,
// More), components/MessageAppButtons.tsx + leads/LeadDetail.tsx + ClientDetails.tsx (call, text, WhatsApp, email), components/QRScannerModal.tsx
// (Inventory > Scan), components/AIVoiceInput.tsx, components/photos/JobPhotos.tsx (Take photo on touch screens), components/crew/CrewClockPage.tsx
// (location on each punch), components/ShareModal.tsx (navigator.share), NEXT_STEPS.md "OFFLINE AUDIT", components/offline/SyncStatusBar.tsx.
// Every scene runs in the phone-sized viewport (390 x 844): the motion scenes are portrait pages (motion/*.html).
export default {
  id: 'offline-phone',
  number: 28,
  title: 'The app on your phone, and working offline',
  summary: 'Everything works the same on a phone: install it as an app, use the bottom bar, the camera, your voice and tap-to-call, and keep working with no signal.',
  minutes: 7.5,
  covers: [],
  demoData: [
    'dashboard, job page, clients, inventory and AI Command in a 390 x 844 phone viewport with the bottom bar (Home, Clients, big middle button, Messages, Community, More) and the More sheet listing the Tools',
    'low stock items and one lead follow-up due so the red number on More is visible (already in the baseline demo data)',
    'the install banner, the camera, the crew location, the share sheet and everything offline are motion scenes (they depend on the real phone or on losing the signal)',
    'the final scene needs the Settings page with the Account section (Log out) at the bottom',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'phone', route: '/dashboard',
      say: [
        'This chapter is about using ContractorDocs on your phone, and about what happens when you lose your signal.',
        'Here is the big message: everything you learned in the other chapters on a computer works the same way on your phone.',
        'Your jobs, documents, clients, calendar, price book and Insights are all there, with the same buttons and the same names.',
        'You simply tap instead of click.',
        'On top of that, the phone adds an app for your home screen, a bar at the bottom, your camera and your voice.',
        'And your work keeps going, even when the signal drops.',
      ],
      do: [
        { with: 3, act: 'caption', text: 'Same app, same names: tap instead of click' },
        { with: 4, act: 'highlight', target: 'Home', patience: 25000 },
      ],
    },
    {
      id: 's02', kind: 'motion', template: 'phone-install-ios',
      say: [
        'First, let us put it on your home screen, so it opens like a real app.',
        'On an iPhone, open ContractorDocs in Safari.',
        'Tap the Share button at the bottom of the screen, then tap Add to Home Screen, and confirm.',
        'The icon lands among your other apps, and it opens full screen, without the browser bars.',
        'You may also see a small banner above the bottom bar: Add ContractorDocs to your home screen. It works offline.',
        'On an iPhone, tap How, and it shows you these same steps.',
        'The banner appears from your second visit, or after you save a document, and it never comes back once you close it.',
      ],
      visual: 'Portrait phone screen. A Safari page of ContractorDocs fills the screen with the Safari toolbar at the bottom; the Share icon (square with an arrow up) at the bottom is circled and tapped, a sheet slides up with Copy, Add to Favorites and a highlighted "Add to Home Screen" row, a finger taps it and an "Add" confirm appears. Then the iPhone home screen: the ContractorDocs icon drops in among the other icons, and the app opens full screen with no browser bars. A second variation shows the small banner above the bottom bar ("Add ContractorDocs to your home screen. It works offline." with a "How?" button and a small cross) and the three steps unfolding under it.',
      do: [{ with: 0, act: 'caption', text: 'iPhone: Share, then Add to Home Screen' }],
    },
    {
      id: 's03', kind: 'motion', template: 'phone-install-android',
      say: [
        'On Android, use Chrome.',
        'When the banner shows, tap Install, then confirm.',
        'If you do not see it, tap the three dots at the top of Chrome, then Install app, or Add to Home screen.',
        'The banner only shows where your phone can really add the app, and never once it is installed.',
        'From then on, tap the icon, and ContractorDocs opens full screen, ready to work, with or without a signal.',
      ],
      visual: 'Portrait phone screen with Chrome on Android. The ContractorDocs banner slides up above the bottom bar with a blue "Install" button; a finger taps it and a system dialog "Install app?" with Cancel and Install appears. Then a second variation: the three-dot menu at the top right of Chrome opens, with "Install app" (or "Add to Home screen") highlighted. Finally the home screen: the app icon drops into place and the app opens full screen.',
      do: [{ with: 0, act: 'caption', text: 'Android: Install, or the three-dot menu' }],
    },
    {
      id: 's04', kind: 'app', device: 'phone',
      say: [
        'Now, the phone layout.',
        'On a computer, the menu runs across the top of the screen. On your phone, it moves to a bar at the bottom, where your thumb reaches it.',
        'It has Home, Clients, Messages, Community and More.',
        'Tap Home from anywhere to come back to your dashboard.',
        'Clients opens your client list, Messages your inbox, and Community lets you ask other contractors.',
        'The big round button in the middle starts the most useful thing on that screen.',
        'On the dashboard, it says New job.',
      ],
      do: [
        { with: 2, act: 'highlight', target: 'Home', delay: 0.4 },
        { with: 4, act: 'highlight', target: 'Messages' },
        { with: 4, act: 'highlight', target: 'Community', delay: 3.2 },
        { with: 6, act: 'highlight', target: 'New job' },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'phone', route: '/jobs/5b0b0000-0000-4000-8000-00000000a001',
      say: [
        'Inside a job, the same button says New doc, and starts a new document for that job.',
        'Tap More to open everything else: the Tools, like Pipeline, Inventory, Price book and Crew, plus Leads and Settings.',
        'A red number on More tells you about low stock, and about leads waiting on you.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'New doc', patience: 25000 },
        { with: 1, act: 'click', target: 'More' },
        { with: 1, act: 'highlight', target: 'Inventory', delay: 2.4 },
        { with: 2, act: 'highlight', target: 'Settings' },
        { with: 2, act: 'click', target: 'Close', role: 'button', delay: 3 },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'phone', route: '/clients',
      say: [
        'Here is what the phone adds, starting with your phone itself.',
        'On a client, tap the phone number to call, or the email address to write.',
        'On a lead, the Call, Text and Email buttons do the same, and a Map button opens the address in your maps app.',
        'Text and WhatsApp, in the Share window, open your phone’s own apps with the message already typed.',
        'Nothing is sent by ContractorDocs, and there is no text message bill.',
      ],
      do: [
        { with: 1, act: 'click', target: 'Sarah Whitfield', patience: 25000 },
        { with: 1, act: 'highlight', target: 'Phone', delay: 1.2 },
        { with: 1, act: 'highlight', target: 'Email', delay: 2.6 },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'phone', route: '/inventory',
      say: [
        'In Inventory, tap Scan, and your camera reads a QR tag stuck on a shelf or a bin.',
        'It takes you straight to checking that item out to a job.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Scan', patience: 25000 },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'phone', route: '/dashboard',
      say: [
        'To talk instead of typing, tap the microphone.',
        'It is in AI Command, in daily reports and notes, and when you turn a note into tasks.',
        'Say what you did today, then read it over and fix any word before you save.',
        'Your phone asks for permission the first time, and it needs a browser that supports voice.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Open the AI assistant', patience: 25000 },
        { with: 0, act: 'highlight', target: 'Dictate with your voice', delay: 1.4 },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's09', kind: 'motion', template: 'phone-extras',
      say: [
        'The camera is the other big one: on a job, open Photos, tap Take photo, and the picture goes straight to the job.',
        'Give each photo a stage, like Before, During or After, and a caption.',
        'Your crew’s clock-in link asks the worker’s phone for its location, and stamps each punch if they allow it.',
        'When you share a document, the phone’s own share sheet opens, so you can send the PDF with any app you have.',
        'And your crew links work offline too: punches are saved on the worker’s phone, and sent in order.',
      ],
      visual: 'Portrait phone screen. Four cards slide in one after another, each with a simple drawing: 1 a camera viewfinder with the button "Take photo" and a picture dropping into a job; 2 a map pin over a job site with the text "Location on every punch, if the worker allows it"; 3 the phone share sheet (a row of app icons) over a PDF with the label "Share with any app"; 4 a crew phone with the word "Waiting" turning into a tick: "Punches saved on the phone, sent in order".',
      do: [{ with: 0, act: 'caption', text: 'What the phone adds' }],
    },
    {
      id: 's10', kind: 'motion', template: 'offline-strip',
      say: [
        'Now imagine you are in a basement with no signal. Keep working.',
        'A thin strip under the top bar says you are offline, and that your work saves on this device and syncs later.',
        'Whatever you create shows a Waiting to sync badge, on its job card and on the job page, so you can see what has not reached your account yet.',
      ],
      visual: 'Portrait phone screen. The signal bars drop to nothing and a thin amber strip appears under the top bar: "Offline: your work saves on this device and syncs later." The user adds a new job and a daily report; grey badges "Waiting to sync" appear on the job card and on the document, and the strip changes to "2 changes saved on this device" with a "View" link.',
      do: [{ with: 1, act: 'caption', text: 'Offline: your work saves on the phone' }],
    },
    {
      id: 's11', kind: 'motion', template: 'offline-works',
      say: [
        'With no signal, you can create jobs and change their status, and add or edit clients and notes.',
        'You can take job photos, and the phone holds up to 200 of them while it waits. They upload when you are back online.',
        'You can draft estimates and invoices, and write daily reports, time sheets, material logs, expense logs, notes and receipts.',
        'Stock changes and checking items out to a job work too, and so do your price book and your settings.',
        'Screens you opened before, like the dashboard, your jobs, your clients, the calendar and your price book, still open with their last copy.',
      ],
      visual: 'A checklist builds on the screen, green ticks appearing one by one next to short lines: "Jobs and status", "Clients and notes", "Job photos (up to 200)", "Estimate and invoice drafts", "Daily reports, time sheets, logs, notes, receipts", "Stock and check-out", "Price book and settings". At the bottom, small screen thumbnails (Dashboard, Jobs, Clients, Calendar, Price book) slide in with the label "Opens with the last copy".',
      do: [{ with: 0, act: 'caption', text: 'What works offline' }],
    },
    {
      id: 's12', kind: 'motion', template: 'offline-needs',
      say: [
        'A few things need a connection, and the app tells you so.',
        'That includes sending email, client links and the portal, recording payments, deleting things, and duplicating jobs or documents.',
        'Billing time and materials, purchase orders, importing and exporting files, the AI tools, Community and billing need a connection too.',
        'Those simply wait until you are back online.',
      ],
      visual: 'An amber list headed "Needs a connection": envelope "Sending email", link "Client links and portal", dollar "Payments", trash "Deleting", copy "Duplicating", clock "Billing time and materials", box "Purchase orders", file "Import and export", sparkle "AI tools", chat "Community". A toast slides in: "You are offline. This needs a connection; try again when you are back online."',
      do: [{ with: 0, act: 'caption', text: 'What needs a connection' }],
    },
    {
      id: 's13', kind: 'motion', template: 'offline-sync',
      say: [
        'When the signal returns, your work syncs by itself, in order: clients first, then jobs, then stock and price book, then documents.',
        'In a hurry? Tap Sync now, or View, to see exactly what is waiting.',
        'If something is refused, like a plan limit, it stays in the list with the reason, so you can fix it.',
      ],
      visual: 'The signal bars come back. The strip changes to "Syncing 2 changes..." with a pulsing dot, then the Waiting to sync badges fade out in the order clients, jobs, stock and price book, documents. "Sync now" and "View" are circled once. A last example shows one badge turning red with the reason "Free plan: 6 new jobs a month reached" staying in the list.',
      do: [{ with: 0, act: 'caption', text: 'Back online: it syncs by itself' }],
    },
    {
      id: 's14', kind: 'app', device: 'phone', route: '/settings',
      say: [
        'One tip before you head for a dead zone: sign in and open the app once while you are online, so your screens are ready.',
        'After that first visit, the app keeps itself on your phone, so it opens even with no connection at all.',
        'Log out clears your data from this phone, and if something is still waiting to sync, the app asks you to sync first.',
        'That is the phone. Two chapters are left: where to get help and meet the Community, and then your plan and your account.',
      ],
      do: [
        { with: 1, act: 'scroll', to: 'Log out', patience: 25000 },
        { with: 1, act: 'highlight', target: 'Log out', nth: 0 },
      ],
    },
  ],
};
