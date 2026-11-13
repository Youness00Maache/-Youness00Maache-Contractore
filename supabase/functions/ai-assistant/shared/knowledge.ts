/**
 * Product knowledge for the assistant: what every screen, button and feature of ContractorDocs is, and the
 * exact steps to use it. Written from the real app (components, lib/routes.ts, lib/plans.ts) and the in-app
 * help guides (components/help/helpContent.ts, copied into helpGuides.generated.ts).
 *
 * Pure TypeScript with imports from this folder only, so the edge function bundles it. The QA script
 * (scripts/document-ai-flow-qa.ts) fails when:
 *   - a route here is not a real app route / Settings section,
 *   - a [[Label]] here does not exist in the app's source,
 *   - the plan numbers differ from lib/plans.ts, or the guide copy differs from helpContent.ts.
 *
 * Markup: [[Label]] = the exact text of a button, menu item, tab or toggle on screen.
 */
import { HELP_GUIDES_SNAPSHOT, type GuideSnapshot } from './helpGuides.generated.ts';

// ───────────────────────────── navigation targets ─────────────────────────────

/** Every in-app screen and Settings section the assistant can open ("Take me there"). */
export const NAV_ROUTES = [
    '/dashboard', '/jobs/create', '/clients', '/communication', '/inventory', '/pricebook', '/calendar', '/analytics',
    '/calculator', '/forum', '/settings', '/settings#profile', '/settings#company', '/settings#payments', '/settings#requests',
    '/settings#signature', '/settings#appearance', '/settings#billing', '/settings#reminders', '/settings#account',
    '/profile', '/tutorials',
] as const;
export type NavRoute = typeof NAV_ROUTES[number];

/** Short name of each target (cards, "Take me there"). */
export const NAV_LABELS: Record<NavRoute, string> = {
    '/dashboard': 'Dashboard',
    '/jobs/create': 'New job',
    '/clients': 'Clients',
    '/communication': 'Messages',
    '/inventory': 'Inventory',
    '/pricebook': 'Price book',
    '/calendar': 'Calendar',
    '/analytics': 'Insights',
    '/calculator': 'Profit calculator',
    '/forum': 'Community',
    '/settings': 'Settings',
    '/settings#profile': 'Settings › Profile',
    '/settings#company': 'Settings › Company',
    '/settings#payments': 'Settings › Payments & reviews',
    '/settings#requests': 'Settings › Request-a-quote link',
    '/settings#signature': 'Settings › Signature',
    '/settings#appearance': 'Settings › Appearance & language',
    '/settings#billing': 'Plan & billing',
    '/settings#reminders': 'Settings › Reminders',
    '/settings#account': 'Settings › Account',
    '/profile': 'Profile',
    '/tutorials': 'Help & tutorials',
};

export const isNavRoute = (v: unknown): v is NavRoute => typeof v === 'string' && (NAV_ROUTES as readonly string[]).includes(v);

/** What "Do it for me" can run after a how-to answer (existing assistant actions). */
export const HOW_TO_DO_ACTIONS = [
    'CREATE_CLIENT', 'CREATE_JOB', 'GENERATE_DOCUMENT', 'RUN_PLAN', 'ADD_INVENTORY', 'ADD_PRICE_BOOK_ITEM', 'DRAFT_EMAIL_ONLY',
    'PREPARE_EMAIL_BATCH',
] as const;
export type HowToDoAction = typeof HOW_TO_DO_ACTIONS[number];

// ───────────────────────────── plans (same numbers as lib/plans.ts, checked by the QA script) ─────────────────────────────

export const PLAN_FACTS = {
    free: { name: 'Free', monthlyPrice: 0, jobs: 6, clients: 15, docs: 12, emails: 10, ai: 15 },
    premium: { name: 'Premium', monthlyPrice: 5, yearlyPrice: 50, ai: 60 },
    ai: { name: 'Premium + AI', monthlyPrice: 10, yearlyPrice: 100, ai: 600 },
} as const;

const F = PLAN_FACTS.free;
const P = PLAN_FACTS.premium;
const A = PLAN_FACTS.ai;

// ───────────────────────────── entries ─────────────────────────────

export interface KnowledgeEntry {
    id: string;
    title: string;
    /** Click path, as the user sees it. */
    where: string[];
    /** In-app target for "Take me there". */
    route?: NavRoute;
    /** Concepts (see LEXICON) this entry is about; they drive retrieval in every language. */
    concepts: string[];
    /** Extra English phrases that point here. */
    keywords?: string[];
    /** How it works. */
    facts: string[];
    /** Exact steps. */
    steps?: string[];
    /** Plan limits that apply (mentioned only when relevant). */
    limits?: string[];
    /** What "Do it for me" runs (opens / prepares with the existing assistant actions). */
    doAction?: HowToDoAction;
}

const FEATURES: KnowledgeEntry[] = [
    {
        id: 'overview',
        title: 'What ContractorDocs and the assistant can do',
        where: ['Dashboard', 'AI Command'],
        route: '/dashboard',
        concepts: ['ai', 'tutorial'],
        keywords: ['what can you do', 'what is this app', 'features', 'help me'],
        facts: [
            'ContractorDocs is paperwork for contractors: jobs, clients and 12 document types (Invoice, Estimate, Change Order, Purchase Order, Receipt, Work Order, Daily Job Report, Time Sheet, Material Log, Expense Log, Warranty, Note) with PDF designs, a client portal with e-signatures and a Pay now link, Gmail sending, automatic reminders, a request-a-quote link, job photos, inventory with QR labels, a price book, a profit calculator, a calendar, Insights and a community forum.',
            'The assistant can: create clients and jobs; draft any of the 12 documents (also many at once in one plan); prepare emails with documents attached (sent from your Gmail only after you press Send); write an email; add inventory or price book items; change stock; change a job status; duplicate a job; open any screen or Settings section; answer questions about your documents (paid? what is on it?) and explain how any feature works, step by step.',
            'Nothing is created, saved or sent until you click the button on the card the assistant shows.',
        ],
        steps: ['Type or dictate what you need in [[AI Command]] (dashboard) or [[AI Assistant]] (job page).', 'Type @ to pick a client and # to pick a document.', 'Check the card and click its button: [[Open & edit]], [[Save]], [[Review & create]], [[Review & add]], [[Do it all]] or a send button.'],
        limits: [`AI requests per month: ${F.ai} on Free, ${P.ai} on ${P.name}, ${A.ai} on ${A.name}.`],
    },
    {
        id: 'app-navigation',
        title: 'Where everything is (menus)',
        where: ['Dashboard'],
        route: '/dashboard',
        concepts: ['settings', 'navigation'],
        keywords: ['where is', 'menu', 'find', 'navigate'],
        facts: [
            'Computer: the top bar has [[Dashboard]], [[Clients]], [[Messages]], a [[Tools]] menu ([[Inventory]], [[Price book]], [[Calendar]], [[Insights]], [[Profit calculator]]) and [[Community]]. The avatar (top right) opens the [[Account menu]]: [[Profile]], [[Settings]], [[Plan & billing]], [[Upgrade]] (Free plan), [[Help & tutorials]], [[Contact support]], [[Log out]].',
            'Phone: the bottom bar has [[Home]], [[Clients]], a middle button ([[New job]] on the dashboard, [[New doc]] on a job), [[Messages]] and [[More]] (the tools, [[Community]], [[Settings]], [[Billing]]).',
            'Settings sections, in order: Profile, Company, Payments & reviews, Request-a-quote link, Signature, Appearance & language, Plan & billing, Reminders, Account.',
            'Public pages (no login, for your clients): the client portal, the approval page for signing, and your request-a-quote page.',
        ],
    },
    {
        id: 'pay-link',
        title: '“Pay now” link and the “Scan to pay” QR code on invoices',
        where: ['Settings', 'Payments & reviews'],
        route: '/settings#payments',
        concepts: ['pay', 'paylink', 'qr', 'invoice'],
        keywords: ['get paid online', 'online payment', 'qr code', 'pay now', 'payment link', 'card payment', 'accept payments'],
        facts: [
            'Clients pay you through your own payment page (PayPal.me, Square, Venmo, a Stripe Payment Link or your bank page). ContractorDocs never handles the money and does not process cards itself.',
            'With a pay link, the client sees a Pay now button with the amount due in the portal and in the email, and the invoice PDF prints a “Scan to pay” QR code. The QR code and button need a link starting with https://.',
            'New invoices get the default link from Settings automatically; each invoice can change it in its Payment section.',
            'In the portal the client can tap [[I’ve paid]]; you then see it on the dashboard under Payments reported by clients, and reminders stop.',
        ],
        steps: [
            'Open [[Settings]] (avatar, top right) and go to Payments & reviews.',
            'Paste your link in Payment link (it must start with https://) and, optionally, the service name in Shown as (optional), for example PayPal.',
            'Click [[Save changes]] in the bar at the bottom.',
            'On an invoice, open the Payment section and make sure [[Add a “Pay now” link]] is on (it is pre-filled from Settings), then [[Save]]. The PDF now shows the “Scan to pay” QR code.',
        ],
    },
    {
        id: 'mark-paid',
        title: 'Mark an invoice as paid, part payments and receipts',
        where: ['Invoice', 'Mark as paid'],
        route: '/dashboard',
        concepts: ['markpaid', 'pay', 'receipt', 'invoice'],
        keywords: ['mark as paid', 'record a payment', 'deposit', 'part payment', 'partial payment', 'paid invoice', 'balance due'],
        facts: [
            '[[Mark as paid]] is in the invoice header, in the job page document ⋮ menu (open invoices), and on the dashboard card Payments reported by clients.',
            'The dialog shows the amount due and asks for Amount received, Date received, Payment method and a Private note (optional). A smaller amount records a part payment and the rest stays due.',
            'Create a receipt is on by default: a Receipt is created and can be opened with [[Open receipt]]. Payments show under Payments recorded on the invoice and count as Collected in the job’s [[Financials]].',
            'A deposit received before the invoice goes in Paid / deposit ($) in the totals; it lowers the Balance due.',
            'If the client tapped I’ve paid, the invoice shows Payment reported by … with [[Not received]] and [[Mark as paid]].',
        ],
        steps: [
            'Open the invoice (job page, [[Project Documents]]) and click [[Mark as paid]] in the header.',
            'Check Amount received, Date received and Payment method.',
            'Leave [[Create a receipt]] on to get a receipt, then click the Mark paid button (or Record for a part payment).',
        ],
        limits: [`Asking for a Google review after the payment is part of ${P.name}.`],
    },
    {
        id: 'reviews-financing',
        title: 'Google review requests and financing on estimates',
        where: ['Settings', 'Payments & reviews'],
        route: '/settings#payments',
        concepts: ['review', 'financing'],
        keywords: ['google review', 'ask for reviews', 'financing', 'wisetack', 'loan'],
        facts: [
            'Financing: paste your application link (Wisetack, Hearth, GoodLeap or a local lender) in Financing link and choose Show on estimates from ($). Estimates from that amount show “Financing available” with [[Check your options]] in the portal and on the PDF. Each estimate can switch it with [[Show “Financing available”]] in its Financing section.',
            'Google review: paste your Google review link. After you mark an invoice as fully paid, the dialog offers to ask the client for a review ([[Send with Gmail]] or [[Copy text]]). The switch [[Send it automatically when I mark an invoice as paid]] sends it by itself through your Gmail.',
        ],
        steps: ['Open [[Settings]] › Payments & reviews.', 'Fill Financing link and/or Google review link.', 'Click [[Save changes]].'],
        limits: [`Review requests are part of ${P.name} ($${P.monthlyPrice}/month); on Free the switch shows [[Upgrade for review requests]].`],
    },
    {
        id: 'approval-signature',
        title: 'Send an estimate or change order for signature (Get approval)',
        where: ['Clients', 'Get approval'],
        route: '/clients',
        concepts: ['sign', 'estimate', 'change_order', 'share'],
        keywords: ['signature', 'e-signature', 'sign online', 'approval link', 'approve', 'send estimate', 'client approval'],
        facts: [
            'Only estimates and change orders can be signed. The client opens the approval link, reads the document, types Your full name, draws the Signature, ticks the consent box and clicks [[Approve & sign]], or clicks [[Decline]] with an optional reason.',
            'After signing, the document shows Approved by the client and a Client signed badge, a change order switches to Approved by itself, and the document is locked (see Revise).',
            'Approval links keep working with no end date. A Draft’s link works, but the portal only lists the document once it is Sent. On new estimates, a Valid until date in the past blocks signing.',
            'Three places give the link: the document’s Client approval section ([[Copy approval link]]), [[Share]] on the document ([[Copy approval link]] or [[Send with Gmail]]), and [[Get approval]] on the client (every estimate and change order of that client, with [[Copy link]], [[Email link]] and [[New link]]; signed or declined ones offer [[Copy view link]], declined ones [[Ask again]]).',
        ],
        steps: [
            'Create the estimate (job page › [[New Document]] › Estimate), add the items and click [[Save]].',
            'Click [[Share]] and choose [[Send with Gmail]] (the approval link is in the message) or [[Copy approval link]] to text it.',
            'Or from [[Clients]]: open the client, click [[Get approval]], then [[Copy link]] or [[Email link]] on the document.',
            'When the client signs, you see Approved by the client on the estimate; [[Convert to invoice]] then turns it into an invoice.',
        ],
        doAction: 'GENERATE_DOCUMENT',
    },
    {
        id: 'portal',
        title: 'Client portal',
        where: ['Clients', 'Client portal'],
        route: '/clients',
        concepts: ['portal', 'client', 'share'],
        keywords: ['client portal', 'portal link', 'what does the client see', 'client login'],
        facts: [
            'Each saved client has a private portal link (no login). It shows Outstanding balance, To sign and Documents, with the tabs Invoices, Estimates & change orders and Reports & other.',
            'The client can pay an invoice (Pay button, needs your pay link), tap [[I’ve paid]], [[Review & sign]] estimates and change orders, [[View]] and [[Download]] documents, and see the Job photos you chose to show.',
            'Shown: invoices, estimates, change orders, work orders, daily job reports, warranties and receipts. Hidden: drafts, expense logs, purchase orders, material logs, time sheets and notes.',
            'On the client card: [[Portal]] copies the link. On the client page: Client portal has [[Copy]], [[Open]], [[Email]], [[New link]], [[Text]] and [[WhatsApp]]; the ⋮ menu has [[Copy portal link]] and [[Email portal link]]. [[New link]] makes the old link stop working at once.',
            'Documents created from a job linked to a saved client appear there automatically.',
        ],
        steps: ['Open [[Clients]].', 'Click [[Portal]] on the client card to copy the link, or open the client and use [[Copy]], [[Email]], [[Text]] or [[WhatsApp]] under Client portal.'],
    },
    {
        id: 'temporary-clients',
        title: 'Temporary clients (walk-ins and one-off jobs)',
        where: ['Clients', 'Temporary'],
        route: '/clients',
        concepts: ['temporary', 'client'],
        keywords: ['temporary client', 'walk-in', 'one-off client', 'where are temporary clients'],
        facts: [
            'Tick [[Mark as temporary client]] when you add a client (Add client window) or type a new client on the New job form. Temporary clients are kept out of the normal list.',
            'Find them on [[Clients]]: the Temporary (N) button in the header (opens the Temporary clients window with search, [[View details]] and [[Convert to regular]]), or the Temporary filter next to the search.',
            '[[Convert to regular]] (client card, client page or the Temporary clients window) moves them back into the normal list.',
        ],
        steps: ['Open [[Clients]].', 'Click Temporary (N) at the top, or pick the Temporary filter.', 'Use [[Convert to regular]] to keep a client for good.'],
        doAction: 'CREATE_CLIENT',
    },
    {
        id: 'clients-import-export',
        title: 'Import or export clients (CSV)',
        where: ['Clients', 'Import / export'],
        route: '/clients',
        concepts: ['import_export', 'client'],
        keywords: ['import clients', 'export clients', 'csv', 'excel'],
        facts: [
            '[[Import / export]] on [[Clients]] has [[Import from CSV]] and [[Export all to CSV]].',
            'Import reads CSV files up to 5 MB and 5,000 rows (comma, semicolon or tab), joins First name + Last name, skips duplicates (same email, or same name without email) and shows every row before you confirm. [[Template]] downloads an example file.',
            'Export downloads every client with Name, Email, Phone, Address, Notes, Temporary and Client since.',
        ],
        steps: ['Open [[Clients]] and click [[Import / export]].', 'Choose [[Import from CSV]] and pick the file, check the rows, then click the Import button.'],
        limits: [`Free plan: ${F.clients} new clients a month; an import stops at the limit.`],
    },
    {
        id: 'gmail',
        title: 'Gmail: connect, send documents, several accounts',
        where: ['Messages', 'Connect Gmail'],
        route: '/communication',
        concepts: ['email', 'gmail'],
        keywords: ['connect gmail', 'send email', 'email a document', 'gmail account', 'outlook'],
        facts: [
            'Emails go out from your own Gmail address, so replies come to you. ContractorDocs asks for send-only permission and cannot read your inbox. Other providers (Outlook, Yahoo) cannot be connected; use [[Share]] › [[Open email app]] for those.',
            'On [[Messages]]: [[Connect Gmail]], then approve in Google. The account menu shows Send from, with [[Reconnect]], Make default (star) and Disconnect (bin) per account, and [[Add another Gmail account]].',
            'Sending: [[Choose a client (optional)]], To, [[Add Cc]], tick documents under Attach documents (sent as PDFs, about 18 MB total), [[Use suggested text]], Insert chips (client name, job name, document number, total, your company, your name, portal link, approval link), [[Email design]], then [[Send]].',
            'From a document, [[Share]] › [[Send with Gmail]] opens Messages with the PDF attached. Reminders and review requests also use the connected Gmail.',
        ],
        steps: ['Open [[Messages]].', 'Click [[Connect Gmail]] and approve in Google.', 'Pick the client, tick the documents, write or [[Use suggested text]], then [[Send]].'],
        limits: [`Free plan: ${F.emails} emails a month (reminders count too). ${P.name} is unlimited.`],
        doAction: 'PREPARE_EMAIL_BATCH',
    },
    {
        id: 'share',
        title: 'Share a document (email, link, text, WhatsApp)',
        where: ['Document', 'Share'],
        route: '/dashboard',
        concepts: ['share', 'email'],
        keywords: ['share', 'send pdf', 'whatsapp', 'text message', 'copy link'],
        facts: [
            '[[Share]] in a document header saves it, then offers [[Send with Gmail]], [[Download PDF]], [[Copy approval link]] (estimates and change orders) or [[Copy link]] (other client documents), [[Copy portal link]] (when the job has a saved client), [[Text message]], [[WhatsApp]], and a ready message with [[Copy message]] and [[Open email app]].',
            'Purchase orders, time sheets, logs and notes are internal: they get no client link.',
        ],
        steps: ['Open the document and click [[Share]].', 'Pick [[Send with Gmail]], [[Copy link]], [[Text message]] or [[WhatsApp]].'],
    },
    {
        id: 'recurring-invoices',
        title: 'Recurring invoices (Repeat this invoice)',
        where: ['Invoice', 'Repeat this invoice'],
        route: '/dashboard',
        concepts: ['recurring', 'invoice'],
        keywords: ['recurring invoice', 'repeat invoice', 'monthly invoice', 'automatic invoice', 'subscription'],
        facts: [
            'Every invoice has a Repeat this invoice section: switch on [[Create this invoice automatically]], pick the Frequency (Monthly, Quarterly, Bi-Annually, Annually) and the Next invoice on date (filled from the frequency).',
            'Each run adds a new draft copy of the invoice to the same job for you to check and send.',
        ],
        steps: ['Open the invoice (job page › [[Project Documents]]).', 'In Repeat this invoice, switch on [[Create this invoice automatically]].', 'Choose the Frequency and Next invoice on, then click [[Save]].'],
    },
    {
        id: 'progress-billing',
        title: 'Progress billing (bill a percentage of the work)',
        where: ['Invoice', 'Items', 'Progress billing'],
        route: '/dashboard',
        concepts: ['progress', 'invoice'],
        keywords: ['progress billing', 'percent complete', 'bill by percentage', 'milestone'],
        facts: [
            'In an invoice’s Items, switch from Standard to [[Progress billing]]. Each line gets % done, Prev. billed and This invoice, and the total becomes Total due for this invoice.',
        ],
        steps: ['Open the invoice and go to Items.', 'Click [[Progress billing]].', 'Fill % done on each line, then [[Save]].'],
    },
    {
        id: 'convert-estimate',
        title: 'Convert an estimate to an invoice',
        where: ['Estimate', 'Convert to invoice'],
        route: '/dashboard',
        concepts: ['convert', 'estimate', 'invoice'],
        keywords: ['convert estimate', 'estimate to invoice', 'turn estimate into invoice'],
        facts: [
            '[[Convert to invoice]] appears on an estimate once it is Accepted or signed by the client.',
            'The dialog asks for a Deposit already received (optional); [[Create invoice]] makes the invoice with the same lines. If the estimate was converted before, it warns Already converted and lets you open that invoice or create another one.',
        ],
        steps: ['Open the accepted or signed estimate.', 'Click [[Convert to invoice]].', 'Enter any deposit and click [[Create invoice]].'],
    },
    {
        id: 'signed-lock',
        title: 'Signed documents are locked: Revise, Create revision, Unlock',
        where: ['Estimate / Change order', 'Revise'],
        route: '/dashboard',
        concepts: ['revise', 'sign', 'estimate', 'change_order'],
        keywords: ['edit a signed estimate', 'locked', 'unlock', 'revision', 'change signed'],
        facts: [
            'A signed estimate or change order shows Signed by … — locked and cannot be edited.',
            '[[Revise]] offers New revision (recommended) — [[Create revision]] makes a new Draft numbered -R2 and keeps the signed one unchanged — or Unlock this one — [[Unlock this one]] then [[Remove signature and unlock]] removes the client’s signature, sets it back to Draft and makes a new approval link.',
        ],
        steps: ['Open the signed document and click [[Revise]].', 'Choose [[Create revision]] (keeps the signed copy) or [[Unlock this one]].'],
    },
    {
        id: 'change-orders',
        title: 'Change orders',
        where: ['Job', 'New Document', 'Change Order'],
        route: '/dashboard',
        concepts: ['change_order'],
        keywords: ['change order', 'extra work', 'scope change'],
        facts: [
            'A change order has Change order #, Status (Draft, Sent, Approved, Rejected), Date, Reason and Description of change, then Cost of the change with Current contract value ([[Use it]] fills it from the job’s accepted estimates and approved change orders) and the summary Current contract, This change, New contract total.',
            'It is signed like an estimate (Client approval › [[Copy approval link]]) and switches to Approved by itself when the client signs.',
        ],
        doAction: 'GENERATE_DOCUMENT',
    },
    {
        id: 'designs',
        title: 'PDF designs, colours, logo and paper size',
        where: ['Document', 'Design'],
        concepts: ['template', 'company'],
        keywords: ['template', 'design', 'change the look', 'logo', 'colors', 'a4', 'letter', 'font'],
        facts: [
            'Every document has a Design section: pick a template (tabs All, Featured, New, Standard, Premium; for example Classic Professional, Modern Minimal, Corporate Blue, Construction, Luxury Gold, Blueprint Tech), the [[Accent color]] ([[Template colors]] or a swatch), the [[Secondary color]], the [[Font]] and the [[Paper size]] (US Letter or A4). [[Preview]] shows the PDF. Every design is available on every plan.',
            'Your logo, company name, address, phone and website come from [[Settings]] › Company (logo: [[Upload]] or [[Replace]]) and print on every document.',
            'The AI can also set the design when you ask, for example “use the luxury template in navy and gold”.',
        ],
        steps: ['Open the document and scroll to Design.', 'Pick a template, [[Accent color]] and [[Paper size]].', 'Click [[Preview]], then [[Save]].'],
    },
    {
        id: 'doc-basics',
        title: 'Create, save, download and duplicate documents',
        where: ['Job', 'New Document'],
        route: '/dashboard',
        concepts: ['document', 'doctypes'],
        keywords: ['new document', 'create invoice', 'create estimate', 'download pdf', 'duplicate document', 'delete document'],
        facts: [
            'Open a job, click [[New Document]] and pick a type: Billing & purchasing (Invoice, Estimate, Change Order, Purchase Order, Receipt), On the job (Work Order, Daily Job Report, Time Sheet, Material Log), Records (Expense Log, Warranty, Note).',
            'Form header: [[Save]] (Ctrl/Cmd + S), [[PDF]], [[Save & PDF]], [[Preview]], [[AI fill]] and [[Share]]. Invoice quick due dates: [[On receipt]], [[Net 15]], [[Net 30]], [[Net 60]]. Totals: Discount ($), Tax (%), Shipping ($), Paid / deposit ($).',
            'In the job’s [[Project Documents]], the ⋮ menu of a document has [[Mark as paid]] (open invoices), [[Duplicate as draft]] and [[Delete]].',
            'Lines: [[Add line]]; the tag button on a line picks from the [[Price book]] or [[Inventory]].',
        ],
        steps: ['Open the job ([[View Project]] on the dashboard).', 'Click [[New Document]] and pick the type.', 'Fill it in, then click [[Save]] or [[PDF]].'],
        limits: [`Free plan: ${F.docs} new documents per job each month (deleted ones still count).`],
        doAction: 'GENERATE_DOCUMENT',
    },
    {
        id: 'job-manage',
        title: 'Job status, duplicate a job, delete a job',
        where: ['Dashboard', 'Job card ⋮'],
        route: '/dashboard',
        concepts: ['job', 'duplicate', 'delete', 'status'],
        keywords: ['duplicate job', 'copy job', 'delete job', 'job status', 'pause job', 'complete job'],
        facts: [
            'The job page has a status menu next to the name: Active, Paused, Completed, Inactive.',
            'On the dashboard, the ⋮ menu of a job card has [[Duplicate job]] (new name, client, and Copy documents to pick which documents to copy as drafts without signatures; then [[Duplicate]]) and [[Delete job]] (deletes the job and all its documents).',
        ],
        steps: ['On the dashboard, open the ⋮ menu of the job card.', 'Choose [[Duplicate job]] or [[Delete job]].'],
    },
    {
        id: 'job-financials',
        title: 'Job financials (profit of one job, labor rate)',
        where: ['Job', 'Financials'],
        route: '/dashboard',
        concepts: ['financials', 'calculator', 'job'],
        keywords: ['job profit', 'labor rate', 'job costs', 'how much did i make'],
        facts: [
            '[[Financials]] on a job page opens Job financials: Profit and % margin, Contract value, Invoiced, Collected, Materials, Expenses and Labor.',
            'Labor = time-sheet hours × Labor rate ($/h) (overtime counted at 1.5×). The rate you type is saved to your account.',
        ],
        steps: ['Open the job and click [[Financials]].', 'Type your Labor rate ($/h) if needed, then [[Done]].'],
    },
    {
        id: 'inventory-qr',
        title: 'Inventory: stock, kits, check out, QR labels, scan',
        where: ['Tools', 'Inventory'],
        route: '/inventory',
        concepts: ['inventory', 'label', 'qr'],
        keywords: ['qr label', 'print labels', 'scan', 'low stock', 'check out', 'kit', 'stock'],
        facts: [
            '[[Add item]]: [[Stock item]] or [[Kit (bundle of items)]], with Unit cost ($), Unit, Storage location, Low-stock alert at and Starting quantity.',
            'Item menu: [[Edit details]], [[Adjust stock]] (reasons: Restock / delivery, Returned from job, Stock count correction, Damaged / lost, Used (not on a job), then [[Save adjustment]]), [[Stock history]], [[Print labels]], [[Duplicate]], [[Delete]]. [[Check out]] takes stock to a job (or a client without a job); a kit takes all its parts.',
            '[[Labels]] (computer) prints QR labels on Avery 5160/5163/5164/L7160/L7163 or A4 sheets. The phone camera opens the item from a label; [[Scan]] in the app opens Check out for it. [[History]] lists every stock change.',
            'Lines picked from inventory on invoices, estimates and change orders take the stock off when the document is approved, accepted or paid. Low-stock items show on the dashboard.',
        ],
        steps: ['Open [[Tools]] › [[Inventory]] (phone: [[More]] › [[Inventory]]).', 'Click [[Add item]], fill it in and save.', 'Click [[Labels]] to print QR labels.'],
        doAction: 'ADD_INVENTORY',
    },
    {
        id: 'pricebook-items',
        title: 'Price book items, kits, markup and photos',
        where: ['Tools', 'Price book'],
        route: '/pricebook',
        concepts: ['pricebook', 'calculator'],
        keywords: ['price book', 'saved items', 'service list', 'markup', 'catalog'],
        facts: [
            '[[New item]]: type Service, Labor, Material or Bundle, unit, description, Taxable, Your cost ($), Markup (%) or Client price ($) (Margin and Markup update live), then [[Add to price book]].',
            '[[New kit]] bundles components ([[Custom line]] for one-off parts, Price override). Filters: All types, Services, Labor, Materials, Kits & bundles; sort includes Best margin.',
            'Photos on items ([[Choose photos]], up to 6, [[Make cover]]) are a paid-plan feature.',
        ],
        steps: ['Open [[Tools]] › [[Price book]].', 'Click [[New item]], fill it in and click [[Add to price book]].'],
        limits: [`Photos on price book items: ${P.name} and ${A.name} only.`],
        doAction: 'ADD_PRICE_BOOK_ITEM',
    },
    {
        id: 'calculator-modes',
        title: 'Profit calculator: Simple and Advanced',
        where: ['Tools', 'Profit calculator'],
        route: '/calculator',
        concepts: ['calculator'],
        keywords: ['profit calculator', 'target margin', 'markup vs margin', 'vat', 'simple', 'advanced'],
        facts: [
            '[[Simple]] shows lines (Your cost, Client price, [[Add line]]) and the Summary: Client price, Your cost, Profit, Margin, Markup, with a badge Healthy margin (30%+), Thin margin (15%+), Low margin or Loss.',
            '[[Advanced]] adds Target margin (%) (default 30) with [[Calculate pricing]] (price = cost ÷ (1 − margin)) and [[Tax / VAT]] with a Tax rate (%) (default 20); tax never changes the profit.',
            '[[Save]] keeps the calculation (lines, mode, target margin, tax) in your account on every device; Saved lists them; [[Export PDF]] downloads a profit report; [[Reset]] starts again.',
        ],
        steps: ['Open [[Tools]] › [[Profit calculator]].', 'Enter Your cost and Client price per line.', 'Click [[Advanced]], set Target margin (%) and click [[Calculate pricing]].', 'Click [[Save]].'],
    },
    {
        id: 'calendar-insights',
        title: 'Calendar (schedule) and Insights (business numbers)',
        where: ['Tools', 'Calendar / Insights'],
        route: '/calendar',
        concepts: ['calendar', 'insights'],
        keywords: ['schedule', 'calendar', 'revenue', 'reports', 'win rate', 'outstanding'],
        facts: [
            'Calendar (page title Schedule): [[Month]], [[Week]] and [[List]] views, [[Today]], [[New job]]; double-click a day (computer) or [[New job on this day]] to schedule. Jobs without a start date are listed separately.',
            'Insights (/analytics): Period presets (This month, Last 30 days, Last 90 days, This quarter, This year, Last year, Custom range) and cards Revenue collected, Outstanding, Costs, Profit, Average invoice, Estimate win rate, plus Collected vs costs, Invoices by status, Top clients and Jobs. [[Refresh]] reloads.',
        ],
        steps: ['Open [[Tools]] › [[Calendar]] or [[Tools]] › [[Insights]].'],
    },
    {
        id: 'quote-requests',
        title: 'Request-a-quote link, QR sign and the requests inbox',
        where: ['Settings', 'Request-a-quote link'],
        route: '/settings#requests',
        concepts: ['quote_request', 'qr'],
        keywords: ['request a quote', 'lead form', 'website form', 'qr sign', 'new customers'],
        facts: [
            'A public page where customers send you a job: name, phone or email, address, what they need and up to 5 photos, then [[Send request]].',
            'Settings › Request-a-quote link: [[Taking requests]] / [[Paused]] switch, [[Copy]], [[Share]], [[Open]], [[Print sign]] (QR sign), [[Save image]] (QR code), Intro on the page with [[Save intro]], and [[Change link]] (old links and printed QR codes stop working).',
            'Requests appear on the dashboard under Quote requests ([[Inbox]], [[Link & QR code]]). Each request has [[Call]], [[Text]], [[Email]], [[Map]], [[Archive]], [[Create client & job]] (photos become Before photos; then [[Open job]]) and [[Draft estimate with AI]].',
        ],
        steps: ['Open [[Settings]] › Request-a-quote link.', 'Click [[Copy]] or [[Print sign]] and share it.', 'Answer requests from the dashboard › Quote requests › [[Inbox]].'],
        limits: [`[[Draft estimate with AI]] needs ${A.name}.`],
    },
    {
        id: 'reminders-detail',
        title: 'Automatic reminders: what, when and when they stop',
        where: ['Settings', 'Reminders'],
        route: '/settings#reminders',
        concepts: ['reminder'],
        keywords: ['payment reminder', 'follow up', 'overdue invoice', 'stop reminders', 'when do reminders stop'],
        facts: [
            'Types: Unpaid invoices (on the due date, then 7 and 14 days after), Estimate follow-ups (3 and 7 days after sending), Visit reminders (the day before a job starts, off by default). Each has a switch and Add for extra days; plus Send at (9 AM by default) and Time zone.',
            'Message wording: Subject and Message per type with {placeholder} chips, a Preview box and [[Reset to default]]. Click [[Save reminders]] to keep changes. The switch at the top of the card pauses all reminders (then [[Save reminders]]).',
            'They are emailed from your connected Gmail ([[Connect Gmail]] / [[Reconnect Gmail]] on the card); nothing is sent without Gmail.',
            'Start: when the document is marked Sent. Stop: an invoice is paid or the client taps I’ve paid; an estimate is approved, declined or expires; or you switch them off.',
            'Per document: invoices and estimates have a Reminders section with an on/off switch, [[Schedule & wording]] and Never remind (that client).',
        ],
        steps: ['Open [[Settings]] › Reminders.', 'Switch on the types you want, set the days and Send at.', 'Click [[Save reminders]].'],
        limits: [`Free plan: each reminder email counts toward the ${F.emails} emails a month.`],
    },
    {
        id: 'photos-detail',
        title: 'Job photos and the before/after report',
        where: ['Job', 'Photos'],
        route: '/dashboard',
        concepts: ['photo'],
        keywords: ['photos', 'pictures', 'before and after', 'markup photo'],
        facts: [
            'On a job page open [[Photos]]. Pick the stage for New photos (Before, During, After, Issue), then [[Take photo]] / [[Upload]] (phone) or [[Add photos]] (computer).',
            'Tap a photo for a caption, the stage, [[Mark up]] (saved as a copy) and [[Show in client portal]]. [[Select]] several to [[Show in portal]], [[Hide]] or [[Delete]].',
            '[[Before/after report]] makes a PDF once photos are tagged Before or After. Portal photos show only when the job is linked to a saved client.',
        ],
        steps: ['Open the job and click [[Photos]].', 'Choose the stage and click [[Add photos]] (or [[Take photo]] on a phone).'],
        limits: ['Free: 30 photos per job and 250 MB in total; Premium 5 GB; Premium + AI 10 GB.'],
    },
    {
        id: 'data-sync',
        title: 'What follows your account across devices (data sync)',
        where: ['Settings'],
        concepts: ['sync'],
        keywords: ['other device', 'phone and computer', 'lost my data', 'offline', 'sync'],
        facts: [
            'Everything in the database follows your account: jobs, clients, documents, photos, inventory, price book, requests, reminder settings, payment settings.',
            'Also saved to the account: saved profit calculations, your default labor rate, your default signature, the label sheet choice, theme and language, and whether you saw the tour.',
            'Kept on this device only: the calculator’s last-used mode and the price book Grid/List choice. Changes made offline are uploaded at the next login or reconnect. [[Log out]] clears this device.',
        ],
    },
    {
        id: 'tutorials',
        title: 'Help, tutorials and the app tour',
        where: ['Account menu', 'Help & tutorials'],
        route: '/tutorials',
        concepts: ['tutorial'],
        keywords: ['tutorial', 'tour', 'guide', 'how it works', 'learn the app'],
        facts: [
            '[[Help & tutorials]] (avatar menu) lists every step-by-step guide with search and [[Open]], and [[Take the 1-minute tour]].',
            'Screens have a [[How it works]] button (the panel is How this works, with Related guides, All guides and [[Take the app tour]]).',
            'The tour runs once on the dashboard; [[Skip tour]], [[Back]], [[Next]] and [[Done]] move through it.',
        ],
        steps: ['Click your avatar (top right) › [[Help & tutorials]].', 'Click [[Take the 1-minute tour]] or open a guide.'],
    },
    {
        id: 'plans-billing',
        title: 'Plans, prices, limits and billing',
        where: ['Account menu', 'Plan & billing'],
        route: '/settings#billing',
        concepts: ['plan'],
        keywords: ['price', 'pricing', 'upgrade', 'cancel subscription', 'limit', 'free plan', 'premium'],
        facts: [
            `Free ($0): ${F.jobs} new jobs and ${F.clients} new clients a month, ${F.docs} new documents per job a month, ${F.emails} Gmail emails and ${F.ai} AI requests a month; every document type and design, the portal, e-signatures, inventory, price book and profit tracking are included.`,
            `${P.name}: $${P.monthlyPrice}/month or $${P.yearlyPrice}/year: no monthly limits, unlimited Gmail sending, photos on price book items, ${P.ai} AI requests a month, Google review requests.`,
            `${A.name}: $${A.monthlyPrice}/month or $${A.yearlyPrice}/year: everything in ${P.name}, ${A.ai} AI requests a month, Draft estimate with AI on quote requests, priority support.`,
            'Settings › Plan & billing shows this month’s usage (New jobs this month, Emails sent this month, AI requests this month, clients) with [[Upgrade]] or [[Manage billing]] (change plan, payment method, cancel). The upgrade window has a [[Monthly]] / [[Yearly]] switch.',
        ],
        steps: ['Click your avatar (top right) › [[Plan & billing]].', 'Click [[Upgrade]] (or [[Manage billing]] on a paid plan).'],
    },
    {
        id: 'account-profile',
        title: 'Profile, company details, signature, theme, language, account',
        where: ['Account menu', 'Settings'],
        route: '/settings',
        concepts: ['settings', 'company', 'account', 'language', 'sign'],
        keywords: ['change logo', 'company name', 'dark mode', 'language', 'delete account', 'log out', 'signature'],
        facts: [
            'Profile: name and photo ([[Change photo]]). Company: company name, email, phone, website, address and logo ([[Upload]] / [[Replace]]); they print on every document. A bar with [[Save changes]] / [[Discard]] appears after an edit.',
            'Signature: [[Add signature]] / [[Change signature]] / [[Remove]] saves a default signature offered when you sign a document.',
            'Appearance & language: [[Light]], [[Dark]] or [[Blue]] apply at once; Language is kept with [[Save changes]].',
            'Account: [[Log out]], and [[Delete account]] (type DELETE, then [[Permanently delete]]; this cannot be undone).',
        ],
        steps: ['Click your avatar (top right) › [[Settings]].', 'Change the section you need, then click [[Save changes]].'],
    },
    {
        id: 'community',
        title: 'Community forum',
        where: ['Community'],
        route: '/forum',
        concepts: ['community'],
        keywords: ['forum', 'community', 'other contractors', 'suggestion'],
        facts: ['[[Community]]: tabs General, Suggestion, Project Showcase, My Posts; [[New post]] (Section, Title, Details, a photo or YouTube link, then [[Publish]]). Posts are visible to every member; comments, votes and [[Report]].'],
        steps: ['Open [[Community]] and click [[New post]].'],
    },
    {
        id: 'ai-fill',
        title: 'AI fill inside a document',
        where: ['Document', 'AI fill'],
        route: '/dashboard',
        concepts: ['ai', 'document'],
        keywords: ['ai fill', 'fill the form', 'sample data', 'test data'],
        facts: [
            '[[AI fill]] in a document header opens Fill this … : describe the work (or pick an example, or Sample data in every box for testing), click [[Fill the form]], check the list of boxes, then Fill to put them in the form. Nothing is saved until you click [[Save]].',
        ],
        steps: ['Open the document and click [[AI fill]].', 'Describe the work and click [[Fill the form]].', 'Check the values, fill the form, then [[Save]].'],
    },
];

/** Concepts per help guide (the guides come from helpContent.ts). */
const GUIDE_CONCEPTS: Record<string, string[]> = {
    dashboard: ['dashboard'],
    jobs: ['job'],
    documents: ['document', 'doctypes'],
    estimates: ['estimate', 'sign'],
    payments: ['pay', 'paylink', 'markpaid', 'receipt'],
    ai: ['ai'],
    clients: ['client', 'portal'],
    messages: ['email', 'gmail'],
    reminders: ['reminder'],
    'quote-link': ['quote_request'],
    photos: ['photo'],
    inventory: ['inventory', 'label'],
    pricebook: ['pricebook'],
    calculator: ['calculator'],
    calendar: ['calendar', 'insights'],
    settings: ['settings', 'plan', 'company'],
};

const GUIDE_DO_ACTIONS: Partial<Record<string, HowToDoAction>> = {
    jobs: 'CREATE_JOB', documents: 'GENERATE_DOCUMENT', estimates: 'GENERATE_DOCUMENT', clients: 'CREATE_CLIENT',
    inventory: 'ADD_INVENTORY', pricebook: 'ADD_PRICE_BOOK_ITEM', messages: 'PREPARE_EMAIL_BATCH',
};

function guideEntry(g: GuideSnapshot): KnowledgeEntry {
    return {
        id: `guide-${g.id}`,
        title: g.title,
        where: g.where,
        route: isNavRoute(g.appPath) ? g.appPath : undefined,
        concepts: GUIDE_CONCEPTS[g.id] || [],
        facts: [g.summary, ...g.tips],
        steps: g.steps.map(s => `${s.title}: ${s.text}`),
        doAction: GUIDE_DO_ACTIONS[g.id],
    };
}

export const KNOWLEDGE: KnowledgeEntry[] = [...FEATURES, ...HELP_GUIDES_SNAPSHOT.map(guideEntry)];

/** Every [[Label]] an entry uses. */
export function entryLabels(e: KnowledgeEntry): string[] {
    const text = [...e.facts, ...(e.steps || []), ...(e.limits || [])].join('\n');
    return Array.from(text.matchAll(/\[\[([^\]]+)\]\]/g), m => m[1]);
}


// ───────────────────────────── retrieval ─────────────────────────────

/**
 * Concept lexicon in the app's 10 languages (English, Spanish, French, German, Italian, Portuguese, Chinese,
 * Japanese, Korean, Russian). Terms match at the start of a word (stems), a trailing "$" means whole word,
 * and CJK terms match anywhere. Weight: how specific the concept is (default 2).
 */
const LEXICON: Record<string, { w?: number; t: string }> = {
    invoice: { w: 1, t: 'invoice|bill$|bills$|factura|facture|rechnung|fattur|fatura|发票|請求書|インボイス|청구서|인보이스|счет|инвойс' },
    estimate: { w: 1, t: 'estimate|quote$|quotes$|quotation|bid$|presupuest|cotiza|devis|kostenvoranschlag|angebot|preventiv|orcamento|报价|估价|見積|견적|смет|коммерческ' },
    client: { w: 1, t: 'client|customer|cliente|kunde|kunden|客户|顾客|顧客|クライアント|お客|고객|клиент|заказчик' },
    job: { w: 1, t: 'job$|jobs$|project|proyecto|trabajo|obra$|chantier|projet|auftrag|baustelle|lavoro|progetto|cantiere|trabalho|projeto|工作|项目|工程|現場|案件|プロジェクト|작업|프로젝트|공사|работ|проект|объект' },
    pay: { t: 'pay$|paid$|payment|pagar|pago$|pagos$|cobrar|paiement|payer|zahlung|bezahl|pagament|pagare|付款|支付|收款|支払|入金|결제|지불|оплат|плат' },
    paylink: { w: 3, t: 'pay now|pay link|payment link|online payment|get paid online|paypal|venmo|square|stripe|zelle|credit card|card payment|enlace de pago|pago en linea|lien de paiement|zahlungslink|link di pagamento|link de pagamento|付款链接|在线支付|支払いリンク|オンライン決済|결제 링크|온라인 결제|ссылк.{0,4} на оплат|онлайн.оплат' },
    qr: { w: 3, t: 'qr|scan to pay|二维码|qrコード|qr 코드|qr-код' },
    markpaid: { w: 3, t: 'mark as paid|mark paid|marked paid|record a payment|record payment|deposit|partial payment|part payment|marcar como pagad|deposito|anticipo|acompte|marquer comme pay|anzahlung|als bezahlt|acconto|segna come pagat|sinal$|已付款|定金|定金|入金済|支払済|前金|선금|결제 완료|предоплат|отметить.{0,10}оплач' },
    receipt: { w: 2, t: 'receipt|recibo|recu$|quittung|beleg|ricevut|收据|領収書|영수증|квитанц' },
    reminder: { w: 3, t: 'remind|follow-up|follow up|chase|overdue|late payment|recordatorio|rappel|relance|erinnerung|mahnung|promemoria|sollecit|lembrete|cobranca|提醒|催款|リマインダ|督促|알림|리마인더|독촉|напомин' },
    sign: { w: 2, t: 'sign$|signs$|signed|signing|signature|approv|e-sign|esign|firma|firmar|aprobar|aprobaci|signer|approuv|unterschr|genehmig|freigabe|assin|aprova|签名|签字|批准|署名|承認|サイン|서명|승인|подпис|утвержд' },
    portal: { w: 3, t: 'portal|portail|门户|ポータル|포털|портал' },
    temporary: { w: 3, t: 'temporar|walk-in|one-off|temporal|provisoire|temporaire|vorubergehend|temporane|临时|一時|임시|временн' },
    photo: { w: 2, t: 'photo|picture|image|foto|bild$|bilder|照片|图片|写真|사진|фото' },
    inventory: { w: 2, t: 'inventor|stock|warehouse|existencia|almacen|bestand|lager|magazzino|estoque|库存|在庫|재고|склад|запас|остат' },
    label: { w: 2, t: 'label|scan$|scanner|scanning|etiqueta|etiquette|etikett|etichett|escanear|标签|扫码|ラベル|スキャン|라벨|스캔|этикет|сканир' },
    pricebook: { w: 3, t: 'price book|pricebook|price list|catalog|saved item|service list|lista de precios|catalogo|catalogue|preisliste|katalog|listino|tabela de precos|价目|价格表|価格表|カタログ|가격표|прайс|каталог' },
    calculator: { w: 2, t: 'calculat|profit|margin|markup|calculadora|ganancia|margen|calculatrice|marge|benefice|rechner|gewinn|calcolat|margine|lucro|计算|利润|利益|計算|마진|계산|이익|калькулятор|прибыл|маржа|наценк' },
    calendar: { w: 2, t: 'calendar|schedule|calendario|agenda|horario|calendrier|planning|kalender|zeitplan|日历|日程|排程|カレンダー|予定|캘린더|일정|календар|расписан' },
    insights: { w: 2, t: 'insight|analytic|statistic|stats$|revenue|win rate|estadistic|ingresos|statistique|chiffre d|statistik|umsatz|statistich|fatturato|estatistic|receita|统计|收入|分析|売上|統計|통계|매출|аналитик|статистик|выручк' },
    email: { w: 1, t: 'email|e-mail|mail$|message|correo|courriel|nachricht|posta$|messaggio|mensagem|邮件|电邮|メール|이메일|메일|почт|письм' },
    gmail: { w: 3, t: 'gmail|google account|outlook|cuenta de google|compte google|google-konto|account google|conta google|谷歌|グーグル|구글|аккаунт google' },
    settings: { w: 1, t: 'setting|configur|preferenc|ajustes|parametre|reglage|einstellung|impostazion|设置|設定|설정|настройк' },
    plan: { w: 2, t: 'plan$|plans$|upgrade|premium|pricing|price of the app|subscription|billing|limit|cancel my|suscripci|precio de la app|abonnement|tarif|preis|abbonament|assinatura|订阅|套餐|升级|プラン|料金|アップグレード|요금|플랜|업그레이드|구독|тариф|подписк|лимит' },
    template: { w: 2, t: 'template|design|layout|colou?r|font$|fonts$|paper size|a4$|letter size|plantilla|diseno|modele|vorlage|modello|modelo|模板|设计|颜色|テンプレート|デザイン|템플릿|디자인|шаблон|дизайн' },
    company: { w: 1, t: 'company|business|logo|empresa|negocio|entreprise|societe|unternehmen|azienda|公司|会社|회사|компан|логотип' },
    recurring: { w: 3, t: 'recurr|repeat|every month|each month|monthly invoice|automatic invoice|recurrente|repetir|recurrent|wiederkehr|ricorrent|recorrente|定期|循环|繰り返|毎月|반복|정기|매월|повтор|ежемесяч' },
    progress: { w: 3, t: 'progress billing|percent complete|percentage of the work|% done|milestone|facturacion por avance|situation de travaux|abschlagsrechnung|stato avanzamento|medicao|进度款|出来高|기성|поэтапн' },
    convert: { w: 3, t: 'convert|turn .{0,20}into|into an invoice|convertir|umwandeln|convertire|converter|转换|转成|変換|변환|преобраз|конверт' },
    revise: { w: 3, t: 'revis|unlock|locked|can.t edit|cannot edit|desbloque|deverrouill|entsperr|sblocc|解锁|锁定|ロック|잠금|разблок|заблок' },
    change_order: { w: 3, t: 'change order|orden de cambio|ordre de modification|nachtrag|ordine di modifica|ordem de alteracao|变更单|変更注文|변경 주문|изменени.{0,6}заказ|допсоглаш' },
    document: { w: 1, t: 'document|pdf$|documento|dokument|文档|文件|書類|문서|документ' },
    doctypes: { w: 1, t: 'work order|daily report|time sheet|timesheet|material log|expense|warranty|purchase order|note$|notes$|garant|gasto|depense|ausgabe|spesa|despesa|保修|保証|보증|гарант' },
    tutorial: { w: 2, t: 'tutorial|help$|guide|tour$|how it works|learn|ayuda|tutoriel|aide$|hilfe|anleitung|aiuto|guida|ajuda|帮助|教程|ヘルプ|チュートリアル|도움말|튜토리얼|помощ|обучени|справк' },
    import_export: { w: 3, t: 'import|export|csv|excel|spreadsheet|importar|exportar|exporter|importer|exportier|esportar|导入|导出|インポート|エクスポート|가져오기|내보내기|импорт|экспорт' },
    delete: { w: 1, t: 'delete|remove|erase|eliminar|borrar|supprimer|loschen|eliminare|excluir|apagar|删除|削除|삭제|удал' },
    duplicate: { w: 2, t: 'duplicat|clone|copy (?:a|the|this|my) job|copiar|dupliquer|kopieren|duplicare|复制|複製|복제|дублир|копир' },
    language: { w: 2, t: 'language|dark mode|theme|idioma|tema$|langue|theme|sprache|lingua|lingua|语言|主题|言語|テーマ|언어|테마|язык|тема$' },
    account: { w: 2, t: 'account|password|log out|logout|sign out|cuenta|contrasena|compte|mot de passe|konto|passwort|conta$|senha|账户|密码|アカウント|パスワード|계정|비밀번호|аккаунт|парол' },
    quote_request: { w: 3, t: 'request a quote|quote request|request link|quote link|request page|lead|leads$|inquir|new customers|solicitud de presupuesto|demande de devis|anfrage|richiesta di preventivo|solicitacao de orcamento|询价|見積依頼|問い合わせ|견적 요청|заявк' },
    review: { w: 3, t: 'google review|reviews?$|resena|avis client|bewertung|recension|avaliac|评价|好评|口コミ|レビュー|리뷰|отзыв' },
    financing: { w: 3, t: 'financ|loan|wisetack|hearth|goodleap|financiacion|financement|finanzierung|finanziament|financiamento|融资|分期|ローン|融資|금융|할부|финансир|кредит|рассроч' },
    sync: { w: 3, t: 'sync|other device|another device|second device|phone and (?:my )?computer|across devices|offline|lost my|sincroniz|synchronis|synchronisier|同步|同期|동기화|синхрон|другом устройств' },
    ai: { w: 1, t: 'ai$|a\\.i\\.|assistant|chatbot|ia$|asistente|assistent|ki$|助手|人工智能|アシスタント|어시스턴트|ассистент|ии$|what can you do' },
    community: { w: 3, t: 'community|forum|comunidad|communaute|gemeinschaft|comunita|comunidade|社区|论坛|コミュニティ|커뮤니티|сообществ|форум' },
    financials: { w: 3, t: 'financials|job profit|labor rate|labour rate|labor cost|how much did i make|costo de mano|cout de main|arbeitskosten|manodopera|mao de obra|人工费|人件費|인건비|трудозатрат|себестоимост' },
    share: { w: 2, t: 'share|whatsapp|text message|sms|compartir|partager|teilen|condivid|compartilh|分享|共有|공유|подел' },
    status: { w: 1, t: 'status|pause|paused|complete|estado|statut|stato|状态|ステータス|상태|статус' },
    navigation: { w: 1, t: 'where is|where are|where can i find|where do i find|donde esta|ou est|ou se trouve|wo ist|wo finde|dove si trova|dove trovo|onde fica|onde esta|在哪|どこ|어디|где ' },
    dashboard: { w: 1, t: 'dashboard|home screen|panel principal|tableau de bord|startseite|cruscotto|painel|仪表|ダッシュボード|대시보드|главн' },
};

const COMPILED = Object.entries(LEXICON).map(([concept, { w = 2, t }]) => {
    const terms = t.split('|').filter(Boolean);
    const cjk = terms.filter(x => /[぀-ヿ㐀-鿿가-힯]/.test(x));
    const latin = terms.filter(x => !cjk.includes(x)).map(x => (x.endsWith('$') ? `${x.slice(0, -1)}(?![\\p{L}\\p{N}])` : x));
    return {
        concept,
        weight: w,
        cjk,
        re: latin.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${latin.join('|')})`, 'iu') : null,
    };
});

/** Lowercase, no accents (é→e, ё→е), single spaces. */
export function normalizeQuery(text: string): string {
    return String(text || '').toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

/** Concepts a message talks about, with their weights. */
export function conceptsOf(text: string): Map<string, number> {
    const q = normalizeQuery(text);
    // CJK is compared without decomposition (NFKD splits Hangul into jamo and drops Japanese voicing marks).
    const raw = String(text || '').toLowerCase().normalize('NFC');
    const out = new Map<string, number>();
    for (const c of COMPILED) {
        if ((c.re && c.re.test(q)) || c.cjk.some(term => raw.includes(term))) out.set(c.concept, c.weight);
    }
    return out;
}

const GENERAL_RE = /\bwhat (?:can|do) you do\b|\bwhat (?:is|does) (?:this app|contractordocs)\b|\bwhat can (?:this app|contractordocs|i do here)\b|\bhow does (?:this app|contractordocs|the app) work\b|\b(?:list|show) (?:me )?(?:all )?(?:the )?features\b|^\s*(?:help|hi|hello|hey)\s*[!?.]*\s*$|que puedes hacer|que peux-tu faire|qu'est-ce que tu peux faire|was kannst du|cosa puoi fare|o que (?:voce|você) pode fazer|你能做什么|你可以做什么|何ができ|무엇을 할 수|뭘 할 수|что (?:ты )?умеешь|что ты можешь/i;

/** "What can you do?" and plain greetings. */
export const isGeneralQuestion = (text: string): boolean => GENERAL_RE.test(normalizeQuery(text)) || GENERAL_RE.test(text);

const STOP = new Set(['the', 'and', 'for', 'with', 'how', 'what', 'your', 'you', 'can', 'are', 'its', 'from', 'one', 'all', 'more', 'this', 'that', 'into', 'out', 'set']);
const titleWords = (e: KnowledgeEntry) => normalizeQuery(e.title).split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 3 && !STOP.has(w));

export interface ScoredEntry { entry: KnowledgeEntry; score: number }

/** Every entry with its relevance to the message (highest first, zero scores left out). */
export function scoreKnowledge(text: string): ScoredEntry[] {
    const q = normalizeQuery(text);
    const concepts = conceptsOf(text);
    const scored: ScoredEntry[] = [];
    for (const entry of KNOWLEDGE) {
        let score = 0;
        // the entry's first concept is what it is mainly about: it counts double
        entry.concepts.forEach((c, i) => { score += (concepts.get(c) || 0) * (i === 0 ? 2 : 1); });
        for (const k of entry.keywords || []) if (q.includes(k)) score += 4;
        for (const w of titleWords(entry)) if (q.includes(w)) score += 1;
        if (score > 0) scored.push({ entry, score: entry.id.startsWith('guide-') ? score - 0.5 : score });
    }
    return scored.sort((a, b) => b.score - a.score);
}

export interface RetrieveOptions {
    /** Most characters of knowledge text (≈ chars/4 tokens). */
    maxChars?: number;
    maxEntries?: number;
    /** Lowest score kept. */
    minScore?: number;
}

export const KNOWLEDGE_DEFAULTS = { maxChars: 7000, maxEntries: 5, minScore: 4 } as const;

/** Prompt text of one entry. */
export function renderEntry(e: KnowledgeEntry): string {
    const lines = [`### ${e.title} [id ${e.id}${e.route ? `; open ${e.route}` : ''}${e.doAction ? `; do_action ${e.doAction}` : ''}]`, `Where: ${e.where.join(' › ')}`];
    for (const f of e.facts) lines.push(`- ${f}`);
    if (e.steps?.length) lines.push('Steps:', ...e.steps.map((s, i) => `${i + 1}. ${s}`));
    if (e.limits?.length) lines.push(`Plan limits: ${e.limits.join(' ')}`);
    return lines.join('\n');
}

/**
 * The knowledge entries for one message, within the character budget: the best-scoring entries, plus the
 * overview for general questions (or when nothing matched). Earlier user turns count a little, so short
 * follow-ups ("and on a phone?") keep their topic.
 */
export function retrieveKnowledge(message: string, history: string[] = [], options: RetrieveOptions = {}): KnowledgeEntry[] {
    const { maxChars, maxEntries, minScore } = { ...KNOWLEDGE_DEFAULTS, ...options };
    const now = scoreKnowledge(message);
    const before = history.length ? scoreKnowledge(history.slice(-2).join('\n')) : [];
    const total = new Map<string, ScoredEntry>();
    for (const s of now) total.set(s.entry.id, { ...s });
    for (const s of before) {
        const cur = total.get(s.entry.id);
        if (cur) cur.score += s.score * 0.25;
        else if (s.score * 0.25 >= minScore) total.set(s.entry.id, { entry: s.entry, score: s.score * 0.25 });
    }
    const all = [...total.values()].sort((a, b) => b.score - a.score);
    // Nothing clearly relevant: the two closest entries still beat no context at all.
    const ranked = all.some(s => s.score >= minScore) ? all.filter(s => s.score >= minScore) : all.filter(s => s.score >= 1).slice(0, 2);
    const picked: KnowledgeEntry[] = [];
    const overview = KNOWLEDGE.find(e => e.id === 'overview')!;
    if (isGeneralQuestion(message) || !all.some(s => s.score >= minScore)) picked.push(overview);
    let used = picked.reduce((n, e) => n + renderEntry(e).length, 0);
    for (const { entry } of ranked) {
        if (picked.length >= maxEntries) break;
        if (picked.includes(entry)) continue;
        const size = renderEntry(entry).length;
        if (used + size > maxChars) continue;
        picked.push(entry);
        used += size;
    }
    return picked;
}

/** Compact app map (always in the prompt: every screen, where it is, and its route). */
export const APP_MAP_TEXT = [
    'Screens (route: how to get there):',
    ...NAV_ROUTES.map(r => `- ${r}: ${NAV_LABELS[r]}`),
    'Job page: [[View Project]] on a dashboard job card. Document: job page › [[Project Documents]] › the document, or [[New Document]] for a new one.',
    'Computer menus: [[Dashboard]], [[Clients]], [[Messages]], [[Tools]] ([[Inventory]], [[Price book]], [[Calendar]], [[Insights]], [[Profit calculator]]), [[Community]]; avatar (top right): [[Profile]], [[Settings]], [[Plan & billing]], [[Help & tutorials]], [[Log out]]. Phone bottom bar: [[Home]], [[Clients]], [[New job]] / [[New doc]], [[Messages]], [[More]].',
].join('\n');

/** All labels the knowledge uses (answers may only put these in [[ ]]). */
export const KNOWN_LABELS: ReadonlySet<string> = new Set([
    ...KNOWLEDGE.flatMap(entryLabels),
    ...Array.from(APP_MAP_TEXT.matchAll(/\[\[([^\]]+)\]\]/g), m => m[1]),
]);

/** The knowledge block placed in the system instruction for one request. */
export function buildKnowledgeBlock(message: string, history: string[] = [], options: RetrieveOptions = {}): { text: string; ids: string[] } {
    const entries = retrieveKnowledge(message, history, options);
    const text = [APP_MAP_TEXT, ...entries.map(renderEntry)].join('\n\n');
    return { text, ids: entries.map(e => e.id) };
}
