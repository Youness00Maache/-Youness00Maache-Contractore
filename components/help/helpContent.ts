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
  | 'quote-link' | 'photos' | 'inventory' | 'pricebook' | 'calculator' | 'calendar' | 'settings' | 'pipeline' | 'job-costing'
  | 'suppliers' | 'estimate-options' | 'quick-measure' | 'notifications' | 'crew' | 'punch-list' | 'papers' | 'service-plans'
  | 'estimate-review';

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
    tips: ['Recent documents (your last 5) and the next job start are in the side column.', 'Your search and filters are kept while the browser tab stays open.', 'The Pipeline bar counts your jobs by stage and what needs you; click it to open the [[Pipeline]] board.'],
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
      { title: 'Check the job’s profit', text: '[[Financials]] shows income from invoices minus materials, expenses and labor (time-sheet hours × your labor rate, overtime at 1.5×). The labor rate you type there is saved to your account. Budget vs actual and billing hours are in Job costing and T&M invoices.' },
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
      { title: 'Choose the design', text: 'In Design, pick a template, the [[Accent color]] and the [[Paper size]] (US Letter or A4). [[Preview]] shows the PDF before you send it. To change the design new documents start with, go to Settings, Document design.' },
      { title: 'Save and download', text: 'Click [[Save]] (or Ctrl/Cmd + S). [[PDF]] downloads it, and [[Save & PDF]] does both. If you leave with unsaved changes, the app asks first.' },
      { title: 'Send it', text: '[[Share]] saves the document, then offers [[Send with Gmail]], [[Download PDF]], [[Copy portal link]], an approval link for estimates and change orders, and text or WhatsApp.' },
      { title: 'Let AI fill it', text: '[[AI fill]] fills the form from a description you type or say. It only fills fields: nothing is saved until you click [[Save]].' },
      { title: 'Reuse it on another job', text: 'In the job’s document list, open the ⋮ menu of a document and choose [[Copy to another job]]. Pick the job (search by job or client, recent first). The copy is a Draft with the new job’s client and address, your lines, notes and design kept, and no signature, payments or stock change; tap [[Open]] to edit it.' },
    ],
    tips: [
      `Free plan: ${FREE_LIMITS.docs} new documents per job each month (deleted documents still count).`,
      'Invoices can repeat on a schedule (Repeat this invoice) and switch to progress billing in Items.',
      'No signal on site? Daily job reports, time sheets, material and expense logs, notes and receipts still save on your device with a Waiting to sync badge, and new estimates and invoices can be drafted (their number is confirmed when they sync). Jobs, clients, job photos, stock changes, the price book and your settings work offline too. They sync by themselves when you are back online, or tap [[Sync now]]. Sending and links wait until then; [[View]] lists what is waiting.',
    ],
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
    id: 'estimate-options',
    title: 'Good / better / best options',
    summary: 'Offer 2 to 4 priced options on one estimate; the client picks one when they sign.',
    where: ['Job', 'Estimate', 'Items'],
    group: 'Documents & getting paid',
    appPath: '/dashboard',
    steps: [
      { title: 'Turn options on', text: 'In an estimate, click [[Good / better / best]] next to Items. Good, Better and Best start with your current lines, and Better is marked Recommended.' },
      { title: 'Build each option', text: 'Click an option to rename it, add a short description and change its lines. Start from copies another option’s lines, Copy lines to adds them to another option, and [[Add option]] makes up to 4. Lines the client gets with any option go under In every option. Discount and tax apply to every option.' },
      { title: 'Send it', text: 'The PDF lists every option with its lines and total, marks the Recommended one and asks the client to choose one. On the approval link or in the portal the client taps an option, then signs with [[Approve & sign]].' },
      { title: 'Apply the choice', text: 'The estimate shows which option the client chose. Click [[Apply chosen option]]: the estimate becomes that option with one total, ready for [[Convert to invoice]]. If the client told you by phone, pick it under Client told you?.' },
    ],
    tips: [
      'Until the client chooses, invoices, the job budget, the pipeline and Insights use the Recommended option (or the lowest total when none is Recommended).',
      '[[Use one total instead]] turns options off and keeps the option that counts; after applying, [[Back to options]] undoes it while the lines are unchanged.',
      'The AI assistant can draft them: in [[AI Command]] or a job’s [[AI Assistant]], ask for example “good / better / best estimate for a 12 × 14 deck” with each option’s lines and prices. The estimate opens with the options filled in: lines that are in your [[Price book]] get its prices, other prices you did not give stay empty. Nothing is saved until you click [[Save]].',
      'On an estimate you already started, click [[AI fill]] and ask “turn this into good / better / best options” or “add a premium option”: the options are built from your current lines, which stay exactly as you typed them (with an added option your current lines stay Recommended, so the total does not change). Options you already have are kept; new lines without a price stay empty for you to fill.',
    ],
  },
  {
    id: 'estimate-review',
    title: 'Review an estimate before you send it',
    summary: 'A second look at an estimate: math, missing prices, odd quantities, margin, price book and tax, plus (Premium + AI) items and costs you may have forgotten.',
    where: ['Job', 'Estimate', 'Items'],
    group: 'Documents & getting paid',
    appPath: '/dashboard',
    steps: [
      { title: 'Open the review', text: 'Under the estimate total click [[Review estimate]]. The line next to it already says how many things there are to check.' },
      { title: 'Read the checks', text: 'Each row says what looks wrong and on which line or option: a line without a price, a quantity of 0 or unusually high, decimals on items counted by the piece, a price below your cost or far from your [[Price book]], a margin below your usual, materials without labor, no tax when you usually charge it, a discount bigger than the subtotal, or two options with the same lines.' },
      { title: 'AI check (Premium + AI)', text: 'The AI also looks for missing items (grout and adhesive on a tile job, primer for painting), missing expenses (permits, dump fees, delivery, travel) and risky assumptions. A suggested line gets your price-book price when it is one of your items; otherwise it has no price and you fill it in. If the AI is busy, the checks still show: click [[Try again]].' },
      { title: 'Fix or ignore', text: 'Fix the line yourself, click [[Add line]] on an AI suggestion (it goes at the end of the estimate, or into that option; nothing you typed changes), or click [[Ignore]]. The estimate never changes without your click. Save when you are done.' },
    ],
    tips: [
      'The checks are free on every plan and work offline. The AI check uses one AI request and runs again only when you ask after the estimate changed ([[Check again]]).',
      'When you click [[Share]] and important things were never looked at, the Share window shows “3 things to check” with a Review link. It never stops you from sending.',
    ],
  },
  {
    id: 'quick-measure',
    title: 'Quick measure',
    summary: 'Measure a room, an area, lengths, a roof or a slab, and put the quantity on an estimate, invoice or change order line.',
    where: ['Job', 'Estimate, Invoice or Change Order', 'Items'],
    group: 'Documents & getting paid',
    appPath: '/dashboard',
    steps: [
      { title: 'Open it from a line', text: 'In the items, tap [[Measure]] next to Qty on a phone, or the ruler button next to the description on a computer.' },
      { title: 'Choose what to measure', text: 'Room (length, width and height; doors and windows come off the walls), Area (rectangles and triangles, added or taken away), Linear (lengths added up), Roof (plan area × pitch in x/12 or degrees, plus roofing squares) or Volume (length × width × depth in cubic yards, for concrete).' },
      { title: 'Type the sizes', text: 'Use feet and inches, or metres: switch with ft-in / m at the top, and your choice is saved to your account. A door is 3\' × 6\' 8" and a window 3\' × 4\' until you change its size.' },
      { title: 'Add waste and packs', text: 'Tap a Waste % or type your own. For material sold by the box, set Packs (for example 1 box = 20 sq ft): the quantity is rounded up to whole boxes, and you choose whether the line gets the area or the number of boxes.' },
      { title: 'Use it', text: 'Pick a result (floor, walls, squares…) and click [[Use this quantity]]. The line gets the quantity and its unit. Tick Add measurement to description to print how you measured it. It is off by default, so nothing else on the document changes.' },
    ],
    tips: ['[[Price book]] in the measure window puts a price book item on the line. An item priced per square or per cubic yard opens Roof or Volume.', 'Measurements you used stay on this device under Recent on this job, ready to reuse.', 'Free on every plan.'],
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
    id: 'pipeline',
    title: 'Pipeline board',
    summary: 'Every job and quote request by stage, from request to paid. Cards move by themselves as your documents change.',
    where: ['Tools', 'Pipeline'],
    group: 'Documents & getting paid',
    appPath: '/pipeline',
    steps: [
      { title: 'Open the board', text: 'Click the Pipeline bar on the dashboard, or open [[Tools]] and choose [[Pipeline]] (on a phone: [[More]], then [[Pipeline]]).' },
      { title: 'Read the columns', text: 'Requests (quote requests and jobs with nothing sent yet), Estimate sent, Approved, In progress, Invoiced and Paid. Each card shows the client, the value and the days in that stage; each column adds up its money.' },
      { title: 'Let it move by itself', text: 'There is nothing to drag. Mark an estimate Sent and the job moves to Estimate sent; the client’s signature moves it to Approved. Once work is logged (a time sheet, daily report, material log or a work order In Progress) or the job is Completed, it is In progress. A sent invoice moves it to Invoiced, and [[Mark as paid]] to Paid.' },
      { title: 'Catch what is stuck', text: 'A badge shows what waits too long: a quote request with no reply after 2 days, a job with nothing sent after 7, an estimate with no answer after 7 days (or expired), an approved job not started after 14, a finished job not invoiced, an overdue invoice. [[Needs attention]] shows only those.' },
      { title: 'Act in one tap', text: '[[Follow up]] opens the Share window to resend the estimate or invoice, [[Reminders]] shows its automatic reminders, [[Mark as paid]] records a payment, [[Create job]] turns a quote request into a client and a job, and [[Open job]] opens the job. [[Mark job completed]] and [[Move to Inactive]] (off the board) are in the card’s ⋯ menu.' },
      { title: 'On a phone', text: 'You see one column at a time: swipe sideways, or tap a stage at the top.' },
    ],
    tips: ['Paid jobs stay on the board for 30 days; the Paid column can show the older ones.', 'Inactive jobs and jobs whose estimates were all declined are left off the board. The board is on every plan, Free included.'],
  },
  {
    id: 'job-costing',
    title: 'Job costing and T&M invoices',
    summary: 'See what a job has cost against its budget, and turn unbilled hours and materials into an invoice in one tap.',
    where: ['Job', 'Financials'],
    group: 'Documents & getting paid',
    appPath: '/dashboard',
    steps: [
      { title: 'Open the numbers', text: 'Open a job and click [[Financials]]. Budget vs actual is under the profit.' },
      { title: 'Read the budget', text: 'The budget is the accepted estimate plus approved change orders, split into Labor, Materials, Expenses and Subs & other by the kind of each line (its price-book type, an inventory item, or words such as labor, install or permit). A line that mixes both stays Not split.' },
      { title: 'Read what it has cost', text: 'Actual uses the same costs as profit (time sheets × your labor rate with overtime at 1.5×, material logs, expense logs) plus sent purchase orders. A purchase-order line that is also on a material log counts once.' },
      { title: 'Say how far along the job is', text: 'With a progress-billing invoice, % complete comes from its lines. Otherwise type it in Job complete. When more of the budget is used than the job is complete, “Costs are ahead of the work” shows in red, with the profit you would end with at this pace.' },
      { title: 'Bill time & materials', text: 'Click [[Bill time & materials]] on the job page (on a phone, [[Bill T&M]]) or under Not billed yet in Financials. Unbilled time sheets and material-log lines are listed and ticked; tick Bill expense logs too to add those. Set Labor $/h, the Materials markup (items in your price book keep their price) and Bill through, pick [[Per worker]] or [[Per day]], check the Invoice preview, then click [[Create draft invoice]].' },
      { title: 'After billing', text: 'The Draft invoice opens so you can check it and send it. The time sheets and material lines on it are marked billed and are not offered again; cancel or delete the invoice and they can be billed again.' },
    ],
    tips: [`Free plan: the T&M invoice is one of the ${FREE_LIMITS.docs} new documents per job each month.`, 'The billing rate and markups you use are remembered for next time. The labor rate in Financials is your cost, not what you bill.'],
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
      { title: 'Ask', text: 'Type or dictate what you need, for example “draft an estimate for a 12 × 14 deck” or “good / better / best options for a new roof”. Type @ to pick a client and # to pick a document. You can attach up to 3 photos.' },
      { title: 'Review before anything happens', text: 'The assistant proposes; nothing is created or sent until you click. Drafts show [[Open & edit]], [[Save]] and [[Discard]]. Other proposals show [[Review & create]], [[Review & add]] or a send button. Multi-step plans offer [[Do it all]].' },
      { title: 'Keep your chats', text: '[[Past chats]] reopens earlier conversations; [[New chat]] starts fresh.' },
      { title: 'Fill one form', text: 'Inside a document, [[AI fill]] fills just that form from your description.' },
    ],
    tips: [
      'When it drafts an estimate, invoice or change order, the assistant uses your [[Price book]]: a line that is one of your items gets its price, unit and kit parts, as if you picked it yourself (a price you type still wins). It never makes up prices for other lines. Only item names, units, client prices, short descriptions and kit parts are sent, never your costs or margins.',
      `Every plan includes AI: ${FREE_LIMITS.ai} requests a month on Free, ${PAID_AI_LIMITS.premium} on ${premium.name}, ${PAID_AI_LIMITS.ai} on ${ai.name}.`,
      'AI credits (only when your Plan & billing shows an AI credits line): when the month’s requests run out, buy a one-time pack from $5 (100 credits; 1 credit = 1 request; they never expire) with [[Buy credits]] or [[Buy more credits]], and turn on [[Automatic top-up]] if you like.',
    ],
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
      { title: 'Send a client update', text: `With ${ai.name}, [[Write client update]] picks the photos added since your last update (up to 8; tap to change), you add a note or dictate one, then [[Write update]]. Edit the text, then [[Send with Gmail]], [[Text]] or [[WhatsApp]]; the portal link is included and each update is saved on the job as a Client update note.` },
      { title: 'Turn a walkthrough into a report', text: `With ${ai.name}, [[AI walkthrough]] takes the day’s photos and what you say about them and drafts a Daily Job Report (or a Note). It opens in the editor: check it, then save it.` },
    ],
    tips: [
      'Shared photos appear in the portal only when the job is linked to a saved client.',
      `Free: 30 photos per job and 250 MB in total. ${premium.name}: 5 GB. ${ai.name}: 10 GB.`,
      'The AI only writes what your photos and note show: weather, crew size and hours appear in a report only when you say them.',
    ],
  },
  {
    id: 'punch-list',
    title: 'Punch lists',
    summary: 'What is left to finish on a job: quick to add on a phone, checked off with photo proof, approved by the client in the portal.',
    where: ['Job', 'Punch list'],
    group: 'Tools',
    appPath: '/dashboard',
    steps: [
      { title: 'Open the Punch list tab', text: 'On a job page, switch to [[Punch list]]. The number next to it is how many items are done.' },
      { title: 'Walk the job and type', text: 'Type one item per line and press Enter or [[Add item]]. Start with the room to group it (“Kitchen: touch up paint”); the room sticks for the next items. End with @Name to assign it (“caulk tub @Mike”).' },
      { title: 'Check items off', text: 'Tap the ring in front of an item to mark it done (tap again to undo). In the ⋯ menu: [[Mark verified]] when you checked it, [[Reopen]] or [[Edit]] (room, assignee, due date, notes, before and after photo).' },
      { title: 'Show it to the client', text: 'Switch on [[Show in client portal]]. In their portal the client sees the progress and, on each finished item, taps [[Looks good]] or [[Needs work]] with a note. A sent-back item opens again with the client’s note, and the bell tells you.' },
      { title: 'Print or keep it', text: 'The ⋯ menu at the top has [[Download PDF]] (with the photos) and [[Save as Note on the job]] (a Note in Documents you can email or share).' },
    ],
    tips: [
      'Works offline: adding, checking off and editing items save on the phone and sync when you are back online. Photos, delete and sharing need a connection.',
      'Item photos are also added to the job’s photos (before = Issue, after = After) and count toward your photo storage.',
      'The pipeline board shows “Punch 3/8” on a job card while items are open. Punch lists are on every plan.',
    ],
  },
  {
    id: 'papers',
    title: 'Papers: insurance, licenses, permits and lien waivers',
    summary: 'Keep your COI, licenses, permits, bonds and W-9 with their expiry dates, get reminded before they expire, send them in two taps, and make lien waivers.',
    where: ['Tools', 'Papers'],
    group: 'Tools',
    appPath: '/papers',
    steps: [
      { title: 'Open Papers', text: 'Open [[Tools]] › [[Papers]] (phone: [[More]] › [[Papers]]).' },
      { title: 'Add a paper', text: 'Click [[Add paper]], pick the kind (COI, License, Permit, Bond, W-9, Other), type the number, who issued it and the dates, then [[Upload PDF or photo]] and [[Save]]. A permit can be linked to its job, with the next inspection date: it then shows on the job page.' },
      { title: 'Get reminded', text: 'Each paper reminds you 30, 7 and 1 days before it expires (tap the chips to change the days): in the bell, and by email to yourself from your Gmail. The list puts what expires first at the top, in red once expired.' },
      { title: 'Renew', text: 'In the ⋯ menu, [[Renew (new date and file)]] keeps the paper and starts the reminders again from the new date.' },
      { title: 'Send a certificate', text: 'Click [[Send]] (or [[Send by email]] in the ⋯ menu), type the client’s or GC’s email, check the message and click [[Send with Gmail]]. The file is attached.' },
      { title: 'Make a lien waiver', text: 'Click [[Lien waiver]] here or on a job page. Pick Conditional or Unconditional and Progress or Final; the invoice and the payment recorded with [[Mark as paid]] fill in the amount and dates. Check the names and address, then [[Create waiver]]: it is saved on the job as a document you can print, email or share.' },
    ],
    tips: [
      `The vault and its reminders are part of ${premium.name}. Lien waivers work on every plan.`,
      'Switch on “Show in client portal” on a COI, license or bond: the portal shows “Licensed & insured” with the name, number and expiry date (never the file).',
      'Lien waivers use general wording. Some states (for example California, Texas, Florida and Georgia) require their own statutory form; use it where required.',
    ],
  },
  {
    id: 'service-plans',
    title: 'Service plans (recurring maintenance visits)',
    summary: 'Plans like “HVAC tune-up twice a year”: each visit gets its work order, invoice and client reminder by itself.',
    where: ['Tools', 'Service plans'],
    group: 'Tools',
    appPath: '/service-plans',
    steps: [
      { title: 'Open Service plans', text: 'Open [[Tools]] › [[Service plans]] (phone: [[More]] › [[Service plans]]).' },
      { title: 'Create a plan', text: 'Click [[New plan]]: pick the client, name the plan, say what is done at each visit, choose how often (for example Twice a year), the first visit, the price and how it is billed, then [[Save plan]].' },
      { title: 'Let it run', text: 'A job is made for the plan. Each visit is created ahead of time (14 days by default) with a Work Order; with Invoice each visit, a Draft invoice too. The job moves to the visit date, so it shows on the calendar, and the client gets your visit reminder the day before.' },
      { title: 'Bill by the month, quarter or year', text: 'Choose Monthly, Quarterly, Invoice every 6 months or Yearly invoice: one recurring invoice is added to the plan’s job and repeats by itself (like Repeat this invoice).' },
      { title: 'Mark visits', text: 'Under Next visits, tap [[Done]] when the visit is done (the work order becomes Completed), or in the ⋯ menu [[Skip this visit]], [[Open work order]] or [[Open invoice]].' },
      { title: 'Change a plan', text: 'The ⋯ menu of a plan has [[Edit]], [[Pause]], [[Resume]], [[End plan]] and [[Delete]] (its job and documents stay).' },
    ],
    tips: [
      `Service plans are part of ${premium.name}. Visits are created every hour on our side, even when you don’t open the app.`,
      'Visit reminders go out from your Gmail; Settings › Reminders sets the day and the wording. The client also sees the plan, the next visit and the last one in their portal.',
    ],
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
    id: 'suppliers',
    title: 'Suppliers, purchase orders and reorders',
    summary: 'Save your suppliers, send them purchase orders from your Gmail, reorder low stock in one tap and receive deliveries into stock.',
    where: ['Tools', 'Inventory', 'Suppliers'],
    group: 'Tools',
    appPath: '/inventory',
    steps: [
      { title: 'Save your suppliers', text: 'In Inventory, click [[Suppliers]], then [[Add supplier]]: the name, the email for orders, phone, your account # and notes. Click [[Save supplier]].' },
      { title: 'Fill a purchase order in one tap', text: 'On a Purchase Order, pick one from [[Saved suppliers…]] next to Vendor: the name, email, phone and address are filled, and your account # goes into the notes. Typed a new vendor? [[Save as supplier]] keeps it for next time.' },
      { title: 'Send it to the supplier (Premium)', text: '[[Send to supplier]] at the top of the order saves it and opens the Share window addressed to the supplier. [[Send with Gmail]] sends it from your own Gmail with the PDF attached and asks the supplier to confirm availability and the delivery date.' },
      { title: 'Reorder low stock (Premium)', text: 'On each item set Low-stock alert at, the Supplier (a saved supplier’s name) and, if you like, a Reorder quantity. When items run low, Inventory says how many and what is already on order. [[Create reorder POs]] lists them by supplier with the quantity and unit cost (the item’s cost, else your price book). Untick or change quantities, choose the job (a Shop stock job by default), then create one Draft purchase order per supplier.' },
      { title: 'Receive the delivery', text: 'When the goods arrive, open the order and click [[Mark received]]. Each line picked from Inventory (or named exactly like an item) is added to stock once, with a Received PO entry in the item’s [[History]]. The order becomes Received and can’t be received twice; if an item fails, [[Finish receiving]] adds only what is missing.' },
    ],
    tips: [
      'Purchase orders, [[Share]] and [[Mark received]] work on every plan. [[Send to supplier]] and reorder POs are part of Premium.',
      'Items on an open order show On order in the list, so you don’t order them twice.',
    ],
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
    id: 'crew',
    title: 'Crew clock-in links',
    summary: 'Your workers clock in and out of their jobs from their own phones with a private link: no app, no login, no seat fee. Their hours become time sheets.',
    where: ['Tools', 'Crew'],
    group: 'Tools',
    appPath: '/crew',
    steps: [
      { title: 'Add your crew', text: 'Open [[Tools]] and choose [[Crew]] (on a phone: [[More]], then [[Crew]]). Click [[Add crew member]], type the name (phone, email and hourly cost are optional), tick the jobs they work on, then [[Add and get link]].' },
      { title: 'Send the link', text: '[[Copy link]], [[Text it]] or [[Email it]], or let them scan the QR code. The link only works for the jobs you gave them. On a job page, the [[Crew]] tab adds people to that job ([[Add to job]] or [[New crew member]]).' },
      { title: 'What your worker sees', text: 'Today’s jobs with a big [[Clock in]] button, then [[Clock out]] and [[Start break]] / [[End break]]; [[Switch here]] moves them to another job. They can add a note or a photo. No prices, no rates, no other workers.' },
      { title: 'Location, only at the tap', text: 'The first time, the page asks “Save your location when you tap?”. With [[Allow location]], one reading is saved with each punch, never in between. With [[Not now]] (or no signal) the punch is still saved and marked No location.' },
      { title: 'Far from the job', text: 'On the job’s [[Crew]] tab, click [[Set pin]] and choose [[Use my location (I’m at the site)]] or paste a map link. Punches farther than the distance you pick show “Far from job”.' },
      { title: 'Check the week', text: '[[Crew]] › [[Hours]] shows each worker’s week as a time card (jobs × days), with overtime and their cost. Shifts that need a look are flagged; click [[Add clock-out]] or [[Edit]] to fix one, or [[Add a shift]] for a forgotten day. Then [[Approve week]].' },
      { title: 'Turn hours into time sheets', text: 'Click [[Create time sheet]]: one Time Sheet per job is saved on the job, so Financials, job costing and [[Bill time & materials]] count the hours. After fixing a shift, [[Update time sheet]] rewrites the same sheet.' },
      { title: 'Change or stop a link', text: '[[Share link]] on a crew member opens the link. [[New link]] replaces it (the old one stops at once); [[Turn off link]] stops it. [[Archive]] someone who left: their hours stay.' },
    ],
    tips: [
      'Offline: punches are saved on the worker’s phone and sent in order when the connection is back.',
      'Missed clock-outs show in the bell at the end of the day (Settings › Notifications › Missed clock-outs).',
      `Crew clock-in links are part of ${premium.name}, with as many workers as you need.`,
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications (the bell)',
    summary: 'One list of what happened while you were busy: signatures, payments, overdue invoices, low stock, quote requests and Community replies.',
    where: ['Top bar', 'Bell'],
    group: 'Account',
    appPath: '/settings#notifications',
    steps: [
      { title: 'Open the bell', text: 'Click the bell at the top, next to your avatar (on a phone too). The red number is how many you haven’t read; the list is split into Today and Earlier.' },
      { title: 'What shows up', text: 'A client signs, approves or declines a document (and the option they chose), a client taps “I’ve paid”, an invoice becomes overdue, an estimate expires within 3 days, a new quote request, an item runs low or out of stock, a supplier confirms or can’t fill a purchase order or an order is received, likes, comments and replies in the Community, reminder emails sent or not sent, Gmail that needs reconnecting, a document saved offline that couldn’t sync, and plan limits.' },
      { title: 'Open or clear', text: 'Tap a notification to open the document, item, post or request. The × removes one from the list; [[Mark all read]] clears the count.' },
      { title: 'Choose what you get', text: 'At the bottom of the list, [[Notification settings]] opens Settings › Notifications: switch each type on or off, turn on Quiet mode (no pop-ups, a dot instead of a number), or Pop-up notifications on this device (off by default; your browser asks for permission).' },
    ],
    tips: [
      'Read and removed notifications follow your account to every device. Nothing is emailed.',
      'The list checks for news every few minutes while the app is open, and right away when you open the bell.',
      'The Clients, Tools and Community badges still work as before.',
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
    tips: [
      `${premium.name} is $${premium.monthlyPrice}/month and ${ai.name} $${ai.monthlyPrice}/month. Yearly billing saves two months.`,
      'Where AI credits are offered, Plan & billing also has an AI credits line: your balance, [[Buy credits]] ($5, $10, $20 or $50) and [[Automatic top-up]].',
    ],
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
