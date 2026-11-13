/**
 * Step-by-step guides for every feature. One source for:
 *   - the "How this works" panels on each screen (components/help/HelpButton.tsx),
 *   - the in-app Help & tutorials page (/tutorials, components/help/HelpCenter.tsx),
 *   - the public help page (/help, pages/HelpPage.tsx, prerendered).
 * Marketing-safe: no Supabase, no app imports (plan numbers come from lib/plans.ts so they stay in sync).
 *
 * Text markup: [[Label]] renders as a button chip that looks like the real control (components/help/HelpText.tsx).
 * Keep labels identical to the UI. When a screen changes, update its guide here.
 */
import { FREE_LIMITS, PAID_AI_LIMITS, PLANS } from '../../lib/plans.ts';

export type HelpTopicId =
  | 'dashboard' | 'jobs' | 'documents' | 'estimates' | 'payments' | 'ai' | 'clients' | 'messages' | 'reminders'
  | 'quote-link' | 'photos' | 'inventory' | 'pricebook' | 'calculator' | 'calendar' | 'settings';

export interface HelpStep {
  title: string;
  text: string;
}

export interface HelpGuide {
  id: HelpTopicId;
  title: string;
  /** one line under the title */
  summary: string;
  /** where to find it, as the user clicks it */
  where: string[];
  group: HelpGroup;
  /** in-app screen for "Open" (app paths only; a #hash scrolls to that Settings section) */
  appPath: string;
  steps: HelpStep[];
  tips?: string[];
}

export type HelpGroup = 'Start here' | 'Documents & getting paid' | 'Clients & messages' | 'Tools' | 'Account';
export const HELP_GROUPS: HelpGroup[] = ['Start here', 'Documents & getting paid', 'Clients & messages', 'Tools', 'Account'];

const premium = PLANS.premium;
const ai = PLANS.ai;

export const HELP_GUIDES: HelpGuide[] = [
  {
    id: 'dashboard',
    title: 'Your dashboard',
    summary: 'Everything that needs you today: jobs, numbers, client payments and quote requests.',
    where: ['Dashboard'],
    group: 'Start here',
    appPath: '/dashboard',
    steps: [
      { title: 'Read the numbers at the top', text: 'Active jobs, Jobs this month and Clients, plus a fourth card: Low stock, Signed by clients, or (on the Free plan) an upgrade card.' },
      { title: 'Find a job', text: 'Under Your Jobs, search by job, client or address, filter by client, sort (Newest first, Oldest first, Name A-Z, Start date) and tap a status chip: All, Active, Paused, Completed or Inactive.' },
      { title: 'Open or manage a job', text: 'Click [[View Project]] on a job card. The ⋮ menu on the card has [[Duplicate job]] and [[Delete job]].' },
      { title: 'Start a new job', text: 'Click [[New Job]] at the top. On a phone, tap [[New job]] in the middle of the bottom bar.' },
      { title: 'Act on what clients send you', text: 'When a client taps “I’ve paid” or sends a quote request, a card appears here: Payments reported by clients, or Quote requests with [[Inbox]] and [[Link & QR code]].' },
    ],
    tips: ['Recent documents (your last 5) and the next job start are in the side column.', 'Your search and filters are kept while the browser tab stays open.'],
  },
  {
    id: 'jobs',
    title: 'Jobs',
    summary: 'A job holds the client, the address, the dates and every document and photo for one project.',
    where: ['Dashboard', 'New Job'],
    group: 'Start here',
    appPath: '/dashboard',
    steps: [
      { title: 'Create the job', text: 'Click [[New Job]] (on a phone, [[New job]] in the bottom bar). Enter the Job / project name.' },
      { title: 'Pick the client', text: 'Choose a Saved client, or type a new Client name: it is added to your clients. Tick [[Mark as temporary client]] for a one-off job. Add the Job site address.' },
      { title: 'Set the dates and crew', text: 'The Start date is today by default. Add an End date and an Assigned worker if you like, then click [[Create job]].' },
      { title: 'Work from the job page', text: 'Change the status (Active, Paused, Completed, Inactive) next to the job name. Documents are under [[Project Documents]], pictures under [[Photos]].' },
      { title: 'Check the job’s profit', text: '[[Financials]] shows income from invoices minus materials, expenses and labor (time-sheet hours × your labor rate, overtime at 1.5×). The labor rate you type there is saved to your account.' },
    ],
    tips: [`Free plan: ${FREE_LIMITS.jobs} new jobs a month.`, 'To reuse a job, open the ⋮ menu on its dashboard card and choose [[Duplicate job]]. You can copy its documents too.'],
  },
  {
    id: 'documents',
    title: 'Documents: invoices, estimates and 10 more',
    summary: 'Create, design, save, download and share any of the 12 document types from a job.',
    where: ['Job', 'New Document'],
    group: 'Documents & getting paid',
    appPath: '/dashboard',
    steps: [
      { title: 'Pick a document type', text: 'Open a job and click [[New Document]] (on a phone, [[New doc]] in the bottom bar). Billing & purchasing: Invoice, Estimate, Change Order, Purchase Order, Receipt. On the job: Work Order, Daily Job Report, Time Sheet, Material Log. Records: Expense Log, Warranty, Note.' },
      { title: 'Fill it in', text: 'Client and company details come from the job and your Settings. Under Items, [[Add line]] adds a row. The tag button on a line opens your [[Price book]] and [[Inventory]]; the save button keeps that line in your price book.' },
      { title: 'Choose the design', text: 'In Design, pick a template, the [[Accent color]] and the [[Paper size]] (US Letter or A4). [[Preview]] shows the PDF before you send it.' },
      { title: 'Save and download', text: 'Click [[Save]] (or Ctrl/Cmd + S). [[PDF]] downloads it, and [[Save & PDF]] does both. If you leave with unsaved changes, the app asks first.' },
      { title: 'Send it', text: '[[Share]] saves the document, then offers [[Send with Gmail]], [[Download PDF]], [[Copy portal link]], an approval link for estimates and change orders, and text or WhatsApp.' },
      { title: 'Let AI fill it', text: '[[AI fill]] fills the form from a description you type or say. It only fills fields: nothing is saved until you click [[Save]].' },
    ],
    tips: [`Free plan: ${FREE_LIMITS.docs} new documents per job each month (deleted documents still count).`, 'Invoices can repeat on a schedule (Repeat this invoice) and switch to progress billing in Items.'],
  },
  {
    id: 'estimates',
    title: 'Estimates, approvals and e-signatures',
    summary: 'Send an estimate or change order, and the client approves and signs it online.',
    where: ['Job', 'New Document', 'Estimate'],
    group: 'Documents & getting paid',
    appPath: '/dashboard',
    steps: [
      { title: 'Write the estimate', text: 'Create an Estimate from the job. Set Valid until, add the items and your Notes & terms. Turn on Profit tools to see your cost, profit and margin per line (never printed).' },
      { title: 'Send the approval link', text: 'Save it, then in Client approval click [[Copy approval link]], or use [[Share]] to email or text it.' },
      { title: 'The client signs', text: 'The client opens the link, reads the document, types their full name, draws their signature and clicks [[Approve & sign]]. They can also [[Decline]] with a reason.' },
      { title: 'See the result', text: 'The estimate shows Approved by the client and a Client signed badge in the job’s document list. An accepted estimate can become an invoice with [[Convert to invoice]].' },
      { title: 'Change a signed estimate', text: 'Signed documents are locked. [[Revise]] lets you unlock it or start a new revision.' },
    ],
    tips: ['Approval links keep working (no end date). [[Get approval]] on the client page can make a [[New link]] that replaces the old one.', 'Estimate follow-up reminders can chase the client for you (see Automatic reminders).'],
  },
  {
    id: 'payments',
    title: 'Getting paid',
    summary: 'A Pay now link on invoices, client “I’ve paid” notices, and one-click receipts.',
    where: ['Settings', 'Payments & reviews'],
    group: 'Documents & getting paid',
    appPath: '/settings#payments',
    steps: [
      { title: 'Add your payment link once', text: 'In Settings, Payments & reviews, paste the Payment link from your own provider (it must start with https://) and how it should be shown. Optional: a Financing link for larger estimates, and a Google review link.' },
      { title: 'Turn it on for an invoice', text: 'In the invoice’s Payment section, switch on [[Add a “Pay now” link]]. It is pre-filled from Settings. Clients get a Pay now button in the portal and the email, and a Scan to pay code on the PDF.' },
      { title: 'Hear when the client paid', text: 'In the portal the client can tap [[I’ve paid]]. You see it on the dashboard under Payments reported by clients.' },
      { title: 'Record the payment', text: 'Click [[Mark as paid]] (invoice header, the job’s document ⋮ menu, or the dashboard card). Check the amount, date and method, then [[Mark paid · $…]], or [[Record $…]] for a part payment. Keep Create a receipt on to get a Receipt automatically.' },
      { title: 'Ask for a review (Premium)', text: 'Right after marking an invoice paid, send your Google review link by Gmail, text or WhatsApp. You can make it automatic in Settings.' },
    ],
    tips: ['ContractorDocs never touches the money: the button opens your own payment provider.'],
  },
  {
    id: 'ai',
    title: 'AI assistant',
    summary: 'Describe the work in plain words; the assistant drafts documents, clients, jobs and emails for you to approve.',
    where: ['Dashboard', 'AI Command'],
    group: 'Start here',
    appPath: '/dashboard',
    steps: [
      { title: 'Open it', text: 'Click [[AI Command]] on the dashboard (on a phone, the sparkle button), or [[AI Assistant]] on a job page to work on that job.' },
      { title: 'Ask', text: 'Type or dictate what you need, for example “draft an estimate for a 12 × 14 deck”. Type @ to pick a client and # to pick a document. You can attach up to 3 photos.' },
      { title: 'Review before anything happens', text: 'The assistant proposes; nothing is created or sent until you click. Drafts show [[Open & edit]], [[Save]] and [[Discard]]. Other proposals show [[Review & create]], [[Review & add]] or a send button. Multi-step plans offer [[Do it all]].' },
      { title: 'Keep your chats', text: '[[Past chats]] reopens earlier conversations; [[New chat]] starts fresh.' },
      { title: 'Fill one form', text: 'Inside a document, [[AI fill]] fills just that form from your description.' },
    ],
    tips: [`Every plan includes AI: ${FREE_LIMITS.ai} requests a month on Free, ${PAID_AI_LIMITS.premium} on ${premium.name}, ${PAID_AI_LIMITS.ai} on ${ai.name}.`],
  },
  {
    id: 'clients',
    title: 'Clients and the client portal',
    summary: 'Save clients once, then give each one a private portal to view, sign and pay.',
    where: ['Clients'],
    group: 'Clients & messages',
    appPath: '/clients',
    steps: [
      { title: 'Add a client', text: 'On Clients, click [[Add client]]. Only the name is required; add email, phone, address and notes. Tick [[Mark as temporary client]] for one-off jobs and use [[Convert to regular]] later. [[Import / export]] reads and writes CSV.' },
      { title: 'Share the portal', text: 'Each client has a private portal. Click [[Portal]] on the client card to copy the link, or open the client: Client portal has [[Copy]], [[Open]], [[Email]] and [[New link]], plus [[Text]] and [[WhatsApp]].' },
      { title: 'What the client sees', text: 'Their outstanding balance, what is waiting for a signature, and their documents. They can pay an invoice, [[Review & sign]], [[View]] and [[Download]] PDFs, tap [[I’ve paid]], and see the job photos you chose to share. Drafts and internal documents (expense logs, purchase orders, material logs, time sheets, notes) stay hidden.' },
      { title: 'Ask for a signature', text: 'Click [[Get approval]] on the client. Every estimate and change order of that client is listed: [[Copy link]] or [[Email link]].' },
      { title: 'Replace a link', text: '[[New link]] makes a fresh portal link, or a fresh approval link for a document that is not signed yet. The old one stops working, which is handy if it was sent to the wrong person.' },
    ],
    tips: [`Free plan: ${FREE_LIMITS.clients} new clients a month.`, '[[Activity]] lists the estimates and change orders your clients signed or declined.'],
  },
  {
    id: 'messages',
    title: 'Messages (send from your Gmail)',
    summary: 'Email documents as PDFs from your own Gmail address, so replies come straight to you.',
    where: ['Messages'],
    group: 'Clients & messages',
    appPath: '/communication',
    steps: [
      { title: 'Connect Gmail', text: 'Open Messages and click [[Connect Gmail]], then approve in Google. ContractorDocs only asks for permission to send: it cannot read your inbox.' },
      { title: 'Choose who it goes to', text: 'Click [[Choose a client (optional)]] and fill To. [[Add Cc]] if needed.' },
      { title: 'Attach documents', text: 'With a client selected, tick the documents under Attach documents. They are sent as PDFs.' },
      { title: 'Write it', text: 'Type the subject and message, or (once a document is ticked) click [[Use suggested text]]. The Insert chips add the client name, job name, document number, total, your company, your name, the portal link or the approval link.' },
      { title: 'Send', text: 'Click [[Send]]. [[Email design]] wraps the message in a designed template if you want a branded look.' },
    ],
    tips: [`Free plan: ${FREE_LIMITS.emails} emails a month. ${premium.name} is unlimited.`, 'Gmail accepts about 18 MB of attachments per email.', 'You can connect more than one Gmail account ([[Add another Gmail account]]) and pick the default.'],
  },
  {
    id: 'reminders',
    title: 'Automatic reminders',
    summary: 'Polite follow-ups for unpaid invoices, unanswered estimates and upcoming visits, sent from your Gmail.',
    where: ['Settings', 'Reminders'],
    group: 'Documents & getting paid',
    appPath: '/settings#reminders',
    steps: [
      { title: 'Connect Gmail first', text: 'Reminders are emailed from your own Gmail: use [[Connect Gmail]] on the Reminders card or on Messages.' },
      { title: 'Choose what to send', text: 'In Settings, Reminders: Unpaid invoices (due date, then 7 and 14 days after), Estimate follow-ups (3 and 7 days after sending) and Visit reminders (the day before a job starts, off by default). Change the days, the Send at time and the time zone.' },
      { title: 'Set the wording', text: 'Under Message wording, edit each message. {placeholders} fill in the client, document and amount. The Preview box shows the result; [[Reset to default]] undoes your changes.' },
      { title: 'Save', text: 'Click [[Save reminders]].' },
      { title: 'Per document', text: 'Invoices and estimates have a Reminders section to switch them on or off for that document, or never remind that client.' },
      { title: 'When they stop', text: 'Reminders start once the document is marked Sent. They stop when the invoice is paid or the client reports a payment, and when an estimate is approved, declined or expires.' },
    ],
    tips: ['The switch at the top of the Reminders card pauses all reminders at once (then [[Save reminders]]).', `On Free, each reminder uses one of the ${FREE_LIMITS.emails} monthly emails.`],
  },
  {
    id: 'quote-link',
    title: 'Request-a-quote link',
    summary: 'A public page and QR code where customers send you jobs, with photos, straight into your inbox.',
    where: ['Settings', 'Request-a-quote link'],
    group: 'Clients & messages',
    appPath: '/settings#requests',
    steps: [
      { title: 'Get your link', text: 'In Settings, Request-a-quote link (or on the dashboard, Quote requests, [[Link & QR code]]). [[Copy]], [[Share]] or [[Open]] your link, and add a short intro for the page ([[Save intro]]).' },
      { title: 'Put it everywhere', text: '[[Print sign]] makes a QR sign for the van or the site; [[Save image]] gives you the QR code for flyers and your website.' },
      { title: 'Customers ask', text: 'They enter their name, a phone or email, the address, what they need and up to 5 photos, then [[Send request]].' },
      { title: 'Answer from the inbox', text: 'Requests appear on the dashboard under Quote requests. Open the [[Inbox]] to call, text, email or map each one.' },
      { title: 'Turn it into work', text: '[[Create client & job]] adds the client (or matches one you have) and an active job; the photos become Before photos on the job. With Premium + AI, [[Draft estimate with AI]] writes the estimate.' },
    ],
    tips: ['The Taking requests / Paused switch turns the page off without losing your link.', '[[Change link]] makes old links and printed QR codes stop working.'],
  },
  {
    id: 'photos',
    title: 'Job photos',
    summary: 'Before, during and after pictures on each job, with markup, portal sharing and a PDF report.',
    where: ['Job', 'Photos'],
    group: 'Tools',
    appPath: '/dashboard',
    steps: [
      { title: 'Open the Photos tab', text: 'On a job page, switch to [[Photos]].' },
      { title: 'Add photos', text: 'Choose the stage for new photos (Before, During, After, Issue), then [[Take photo]] or [[Upload]] on a phone, or [[Add photos]] on a computer.' },
      { title: 'Describe and mark up', text: 'Tap a photo to set its caption and stage, [[Mark up]] with arrows, circles, text or drawing (saved as a copy), or switch on Show in client portal.' },
      { title: 'Work with many at once', text: '[[Select]] several photos to show or hide them in the portal, or delete them.' },
      { title: 'Make a report', text: '[[Before/after report]] creates a PDF of the job’s photos (tag some photos Before or After first).' },
    ],
    tips: ['Shared photos appear in the portal only when the job is linked to a saved client.', `Free: 30 photos per job and 250 MB in total. ${premium.name}: 5 GB. ${ai.name}: 10 GB.`],
  },
  {
    id: 'inventory',
    title: 'Inventory',
    summary: 'Track stock, check it out to jobs, get low-stock alerts and print QR labels.',
    where: ['Tools', 'Inventory'],
    group: 'Tools',
    appPath: '/inventory',
    steps: [
      { title: 'Add items', text: 'Click [[Add item]] and pick Stock item or Kit (bundle of items). Fill the name, unit cost, unit, storage location, Low-stock alert at and Starting quantity.' },
      { title: 'Change stock', text: 'Use [[Adjust stock]] from the item’s menu and pick a reason (restock, returned from job, count correction, damaged, used). Every change is listed in [[History]].' },
      { title: 'Use stock on a job', text: '[[Check out]] an item, set the quantity and the job (or a client without a job). Checking out a kit takes out all its parts.' },
      { title: 'Let documents do it', text: 'Lines picked from inventory on invoices, estimates and change orders take the stock off automatically when the document is approved, accepted or paid.' },
      { title: 'Label your shelves', text: '[[Labels]] (on a computer) prints QR labels on Avery or A4 sheets. Scanning a label with the phone camera opens the item; [[Scan]] in the app opens [[Check out]] for it.' },
    ],
    tips: ['Low-stock items also show on the dashboard.', 'Print labels at 100% scale with no margins.'],
  },
  {
    id: 'pricebook',
    title: 'Price book',
    summary: 'Your saved services, labor, materials and kits, ready to drop into any document.',
    where: ['Tools', 'Price book'],
    group: 'Tools',
    appPath: '/pricebook',
    steps: [
      { title: 'Add an item', text: 'Click [[New item]]. Give it a name, type (Service, Labor, Material or Bundle), unit, a description (printed under the name) and whether it is taxable.' },
      { title: 'Price it', text: 'Enter Your cost and a Markup (%), or the Client price. The margin and markup update as you type. Click [[Add to price book]].' },
      { title: 'Build kits', text: '[[New kit]] bundles items: add the components, quantities and any price override. The kit’s cost comes from its parts.' },
      { title: 'Use it in documents', text: 'On a document line, the tag button opens the catalog: pick from [[Price book]] or [[Inventory]]. The save button on any line adds it to the price book.' },
      { title: 'Find things', text: 'Filter by category or type and switch between Grid and List.' },
    ],
    tips: [`${premium.name}: up to 6 photos per item.`],
  },
  {
    id: 'calculator',
    title: 'Profit calculator',
    summary: 'Price a job before you quote it and see your profit, margin and markup. Advanced adds target-margin pricing and tax.',
    where: ['Tools', 'Profit calculator'],
    group: 'Tools',
    appPath: '/calculator',
    steps: [
      { title: 'Enter the lines', text: 'One line per part of the job (it starts with Materials and Labor): Your cost and Client price. [[Add line]] adds more. Each line shows its own profit and margin.' },
      { title: 'Read the summary', text: 'Client price minus your cost is your profit. The card turns green from a 30% margin, amber from 15%, red below, and shows margin and markup side by side.' },
      { title: 'Switch to Advanced', text: 'Click [[Advanced]] at the top for the pricing tools. [[Simple]] hides them again.' },
      { title: 'Price for a target margin', text: 'Enter the Target margin (%) and click [[Calculate pricing]]. Every line with a cost gets the price that gives that margin: cost ÷ (1 − margin).' },
      { title: 'Add tax / VAT', text: 'Switch on Tax / VAT and set the rate. The summary adds the tax and the Total with tax. Tax never changes your profit.' },
      { title: 'Keep it', text: '[[Save]] stores the calculation in your account, including the mode, target margin and tax, so it is there on every device. [[Saved]] (with the count) lists them and [[Export PDF]] downloads a profit report.' },
    ],
    tips: ['Margin = profit ÷ price. Markup = profit ÷ cost. A 50% markup is a 33.3% margin.', '[[Reset]] clears the lines; saved calculations are not affected.'],
  },
  {
    id: 'calendar',
    title: 'Calendar and Insights',
    summary: 'See when every job runs, and how the business is doing.',
    where: ['Tools', 'Calendar'],
    group: 'Tools',
    appPath: '/calendar',
    steps: [
      { title: 'Plan the schedule', text: 'Tools, Calendar (the Schedule page) shows each job from its start to its end date, coloured by status. Switch between Month, Week and List.' },
      { title: 'Schedule a job', text: 'Click [[New job]], or double-click a day in the month view on a computer.' },
      { title: 'Check the numbers', text: 'Tools, Insights: pick a period to see revenue collected, outstanding, costs, profit, average invoice and estimate win rate, with charts.' },
      { title: 'One job’s profit', text: 'On a job page, [[Financials]] shows that job’s income, costs and labor.' },
    ],
  },
  {
    id: 'settings',
    title: 'Settings, plan and billing',
    summary: 'Your company details, signature, look, plan and account.',
    where: ['Account menu', 'Settings'],
    group: 'Account',
    appPath: '/settings',
    steps: [
      { title: 'Open Settings', text: 'Click your avatar (top right) and choose [[Settings]]. On a phone it is also under More.' },
      { title: 'Company details', text: 'Profile and Company hold your name, company name, email, phone, website, address and logo. They print on every document. After an edit, a bar with [[Save changes]] appears at the bottom.' },
      { title: 'Signature', text: '[[Add signature]] once and it is ready to drop into your documents.' },
      { title: 'Look and language', text: 'Appearance & language: Light, Dark or Blue apply at once; a new Language is kept with [[Save changes]].' },
      { title: 'Plan and billing', text: 'Plan & billing shows this month’s usage, with [[Upgrade]] or [[Manage billing]].' },
      { title: 'Help any time', text: 'The account menu has [[Help & tutorials]]: every guide on this page, plus the 1-minute app tour.' },
    ],
    tips: [`${premium.name} is $${premium.monthlyPrice}/month and ${ai.name} $${ai.monthlyPrice}/month. Yearly billing saves two months.`],
  },
];

export const getGuide = (id: HelpTopicId): HelpGuide => HELP_GUIDES.find((g) => g.id === id) as HelpGuide;

/** Plain text of a guide (search and word counts): chips become their label. */
export const guidePlainText = (g: HelpGuide): string =>
  [g.title, g.summary, ...g.steps.flatMap((s) => [s.title, s.text]), ...(g.tips || [])].join(' ').replace(/\[\[([^\]]+)\]\]/g, '$1');

/** Guides matching a search (title, summary, steps, tips). */
export const searchGuides = (query: string): HelpGuide[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return HELP_GUIDES;
  return HELP_GUIDES.filter((g) => {
    const text = guidePlainText(g).toLowerCase();
    return words.every((w) => text.includes(w));
  });
};
