/**
 * GENERATED from components/help/helpContent.ts (the in-app help guides) so the edge function can bundle them.
 * Do not edit by hand: change helpContent.ts, then run  npx tsx scripts/document-ai-flow-qa.ts --sync-knowledge
 * (the QA script fails when this copy and helpContent.ts differ).
 */
export interface GuideSnapshot {
    id: string;
    title: string;
    summary: string;
    where: string[];
    appPath: string;
    steps: Array<{ title: string; text: string }>;
    tips: string[];
}

export const HELP_GUIDES_SNAPSHOT: GuideSnapshot[] = [
    {
        "id": "dashboard",
        "title": "Your dashboard",
        "summary": "Everything that needs you today: jobs, numbers, client payments and quote requests.",
        "where": [
            "Dashboard"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Read the numbers at the top",
                "text": "Active jobs, Jobs this month and Clients, plus a fourth card: Low stock, Signed by clients, or (on the Free plan) an upgrade card."
            },
            {
                "title": "Find a job",
                "text": "Under Your Jobs, search by job, client or address, filter by client, sort (Newest first, Oldest first, Name A-Z, Start date) and tap a status chip: All, Active, Paused, Completed or Inactive."
            },
            {
                "title": "Open or manage a job",
                "text": "Click [[View Project]] on a job card. The ⋮ menu on the card has [[Duplicate job]] and [[Delete job]]."
            },
            {
                "title": "Start a new job",
                "text": "Click [[New Job]] at the top. On a phone, tap [[New job]] in the middle of the bottom bar."
            },
            {
                "title": "Act on what clients send you",
                "text": "When a client taps “I’ve paid” or sends a quote request, a card appears here: Payments reported by clients, or Quote requests with [[Inbox]] and [[Link & QR code]]."
            }
        ],
        "tips": [
            "Recent documents (your last 5) and the next job start are in the side column.",
            "Your search and filters are kept while the browser tab stays open.",
            "The Pipeline bar counts your jobs by stage and what needs you; click it to open the [[Pipeline]] board."
        ]
    },
    {
        "id": "jobs",
        "title": "Jobs",
        "summary": "A job holds the client, the address, the dates and every document and photo for one project.",
        "where": [
            "Dashboard",
            "New Job"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Create the job",
                "text": "Click [[New Job]] (on a phone, [[New job]] in the bottom bar). Enter the Job / project name."
            },
            {
                "title": "Pick the client",
                "text": "Choose a Saved client, or type a new Client name: it is added to your clients. Tick [[Mark as temporary client]] for a one-off job. Add the Job site address."
            },
            {
                "title": "Set the dates and crew",
                "text": "The Start date is today by default. Add an End date and an Assigned worker if you like, then click [[Create job]]."
            },
            {
                "title": "Work from the job page",
                "text": "Change the status (Active, Paused, Completed, Inactive) next to the job name. Documents are under [[Project Documents]], pictures under [[Photos]]."
            },
            {
                "title": "Check the job’s profit",
                "text": "[[Financials]] shows income from invoices minus materials, expenses and labor (time-sheet hours × your labor rate, overtime at 1.5×). The labor rate you type there is saved to your account. Budget vs actual and billing hours are in Job costing and T&M invoices."
            }
        ],
        "tips": [
            "Free plan: 6 new jobs a month.",
            "To reuse a job, open the ⋮ menu on its dashboard card and choose [[Duplicate job]]. You can copy its documents too."
        ]
    },
    {
        "id": "documents",
        "title": "Documents: invoices, estimates and 10 more",
        "summary": "Create, design, save, download and share any of the 12 document types from a job.",
        "where": [
            "Job",
            "New Document"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Pick a document type",
                "text": "Open a job and click [[New Document]] (on a phone, [[New doc]] in the bottom bar). Billing & purchasing: Invoice, Estimate, Change Order, Purchase Order, Receipt. On the job: Work Order, Daily Job Report, Time Sheet, Material Log. Records: Expense Log, Warranty, Note."
            },
            {
                "title": "Fill it in",
                "text": "Client and company details come from the job and your Settings. Under Items, [[Add line]] adds a row. The tag button on a line opens your [[Price book]] and [[Inventory]]; the save button keeps that line in your price book."
            },
            {
                "title": "Choose the design",
                "text": "In Design, pick a template, the [[Accent color]] and the [[Paper size]] (US Letter or A4). [[Preview]] shows the PDF before you send it."
            },
            {
                "title": "Save and download",
                "text": "Click [[Save]] (or Ctrl/Cmd + S). [[PDF]] downloads it, and [[Save & PDF]] does both. If you leave with unsaved changes, the app asks first."
            },
            {
                "title": "Send it",
                "text": "[[Share]] saves the document, then offers [[Send with Gmail]], [[Download PDF]], [[Copy portal link]], an approval link for estimates and change orders, and text or WhatsApp."
            },
            {
                "title": "Let AI fill it",
                "text": "[[AI fill]] fills the form from a description you type or say. It only fills fields: nothing is saved until you click [[Save]]."
            }
        ],
        "tips": [
            "Free plan: 12 new documents per job each month (deleted documents still count).",
            "Invoices can repeat on a schedule (Repeat this invoice) and switch to progress billing in Items.",
            "No signal on site? Daily job reports, time sheets, material and expense logs, notes and receipts still save on your device with a Waiting to sync badge, and new estimates and invoices can be drafted (their number is confirmed when they sync). They sync by themselves when you are back online, or tap [[Sync now]]. Sending and links wait until then; [[View]] lists what is waiting."
        ]
    },
    {
        "id": "estimates",
        "title": "Estimates, approvals and e-signatures",
        "summary": "Send an estimate or change order, and the client approves and signs it online.",
        "where": [
            "Job",
            "New Document",
            "Estimate"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Write the estimate",
                "text": "Create an Estimate from the job. Set Valid until, add the items and your Notes & terms. Turn on Profit tools to see your cost, profit and margin per line (never printed)."
            },
            {
                "title": "Send the approval link",
                "text": "Save it, then in Client approval click [[Copy approval link]], or use [[Share]] to email or text it."
            },
            {
                "title": "The client signs",
                "text": "The client opens the link, reads the document, types their full name, draws their signature and clicks [[Approve & sign]]. They can also [[Decline]] with a reason."
            },
            {
                "title": "See the result",
                "text": "The estimate shows Approved by the client and a Client signed badge in the job’s document list. An accepted estimate can become an invoice with [[Convert to invoice]]."
            },
            {
                "title": "Change a signed estimate",
                "text": "Signed documents are locked. [[Revise]] lets you unlock it or start a new revision."
            }
        ],
        "tips": [
            "Approval links keep working (no end date). [[Get approval]] on the client page can make a [[New link]] that replaces the old one.",
            "Estimate follow-up reminders can chase the client for you (see Automatic reminders)."
        ]
    },
    {
        "id": "estimate-options",
        "title": "Good / better / best options",
        "summary": "Offer 2 to 4 priced options on one estimate; the client picks one when they sign.",
        "where": [
            "Job",
            "Estimate",
            "Items"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Turn options on",
                "text": "In an estimate, click [[Good / better / best]] next to Items. Good, Better and Best start with your current lines, and Better is marked Recommended."
            },
            {
                "title": "Build each option",
                "text": "Click an option to rename it, add a short description and change its lines. Start from copies another option’s lines, Copy lines to adds them to another option, and [[Add option]] makes up to 4. Lines the client gets with any option go under In every option. Discount and tax apply to every option."
            },
            {
                "title": "Send it",
                "text": "The PDF lists every option with its lines and total, marks the Recommended one and asks the client to choose one. On the approval link or in the portal the client taps an option, then signs with [[Approve & sign]]."
            },
            {
                "title": "Apply the choice",
                "text": "The estimate shows which option the client chose. Click [[Apply chosen option]]: the estimate becomes that option with one total, ready for [[Convert to invoice]]. If the client told you by phone, pick it under Client told you?."
            }
        ],
        "tips": [
            "Until the client chooses, invoices, the job budget, the pipeline and Insights use the Recommended option (or the lowest total when none is Recommended).",
            "[[Use one total instead]] turns options off and keeps the option that counts; after applying, [[Back to options]] undoes it while the lines are unchanged.",
            "The AI assistant can draft them: in [[AI Command]] or a job’s [[AI Assistant]], ask for example “good / better / best estimate for a 12 × 14 deck” with each option’s lines and prices. The estimate opens with the options filled in: lines that are in your [[Price book]] get its prices, other prices you did not give stay empty. Nothing is saved until you click [[Save]]."
        ]
    },
    {
        "id": "quick-measure",
        "title": "Quick measure",
        "summary": "Measure a room, an area, lengths, a roof or a slab, and put the quantity on an estimate, invoice or change order line.",
        "where": [
            "Job",
            "Estimate, Invoice or Change Order",
            "Items"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Open it from a line",
                "text": "In the items, tap [[Measure]] next to Qty on a phone, or the ruler button next to the description on a computer."
            },
            {
                "title": "Choose what to measure",
                "text": "Room (length, width and height; doors and windows come off the walls), Area (rectangles and triangles, added or taken away), Linear (lengths added up), Roof (plan area × pitch in x/12 or degrees, plus roofing squares) or Volume (length × width × depth in cubic yards, for concrete)."
            },
            {
                "title": "Type the sizes",
                "text": "Use feet and inches, or metres: switch with ft-in / m at the top, and your choice is saved to your account. A door is 3' × 6' 8\" and a window 3' × 4' until you change its size."
            },
            {
                "title": "Add waste and packs",
                "text": "Tap a Waste % or type your own. For material sold by the box, set Packs (for example 1 box = 20 sq ft): the quantity is rounded up to whole boxes, and you choose whether the line gets the area or the number of boxes."
            },
            {
                "title": "Use it",
                "text": "Pick a result (floor, walls, squares…) and click [[Use this quantity]]. The line gets the quantity and its unit. Tick Add measurement to description to print how you measured it. It is off by default, so nothing else on the document changes."
            }
        ],
        "tips": [
            "[[Price book]] in the measure window puts a price book item on the line. An item priced per square or per cubic yard opens Roof or Volume.",
            "Measurements you used stay on this device under Recent on this job, ready to reuse.",
            "Free on every plan."
        ]
    },
    {
        "id": "payments",
        "title": "Getting paid",
        "summary": "A Pay now link on invoices, client “I’ve paid” notices, and one-click receipts.",
        "where": [
            "Settings",
            "Payments & reviews"
        ],
        "appPath": "/settings#payments",
        "steps": [
            {
                "title": "Add your payment link once",
                "text": "In Settings, Payments & reviews, paste the Payment link from your own provider (it must start with https://) and how it should be shown. Optional: a Financing link for larger estimates, and a Google review link."
            },
            {
                "title": "Turn it on for an invoice",
                "text": "In the invoice’s Payment section, switch on [[Add a “Pay now” link]]. It is pre-filled from Settings. Clients get a Pay now button in the portal and the email, and a Scan to pay code on the PDF."
            },
            {
                "title": "Hear when the client paid",
                "text": "In the portal the client can tap [[I’ve paid]]. You see it on the dashboard under Payments reported by clients."
            },
            {
                "title": "Record the payment",
                "text": "Click [[Mark as paid]] (invoice header, the job’s document ⋮ menu, or the dashboard card). Check the amount, date and method, then [[Mark paid · $…]], or [[Record $…]] for a part payment. Keep Create a receipt on to get a Receipt automatically."
            },
            {
                "title": "Ask for a review (Premium)",
                "text": "Right after marking an invoice paid, send your Google review link by Gmail, text or WhatsApp. You can make it automatic in Settings."
            }
        ],
        "tips": [
            "ContractorDocs never touches the money: the button opens your own payment provider."
        ]
    },
    {
        "id": "pipeline",
        "title": "Pipeline board",
        "summary": "Every job and quote request by stage, from request to paid. Cards move by themselves as your documents change.",
        "where": [
            "Tools",
            "Pipeline"
        ],
        "appPath": "/pipeline",
        "steps": [
            {
                "title": "Open the board",
                "text": "Click the Pipeline bar on the dashboard, or open [[Tools]] and choose [[Pipeline]] (on a phone: [[More]], then [[Pipeline]])."
            },
            {
                "title": "Read the columns",
                "text": "Requests (quote requests and jobs with nothing sent yet), Estimate sent, Approved, In progress, Invoiced and Paid. Each card shows the client, the value and the days in that stage; each column adds up its money."
            },
            {
                "title": "Let it move by itself",
                "text": "There is nothing to drag. Mark an estimate Sent and the job moves to Estimate sent; the client’s signature moves it to Approved. Once work is logged (a time sheet, daily report, material log or a work order In Progress) or the job is Completed, it is In progress. A sent invoice moves it to Invoiced, and [[Mark as paid]] to Paid."
            },
            {
                "title": "Catch what is stuck",
                "text": "A badge shows what waits too long: a quote request with no reply after 2 days, a job with nothing sent after 7, an estimate with no answer after 7 days (or expired), an approved job not started after 14, a finished job not invoiced, an overdue invoice. [[Needs attention]] shows only those."
            },
            {
                "title": "Act in one tap",
                "text": "[[Follow up]] opens the Share window to resend the estimate or invoice, [[Reminders]] shows its automatic reminders, [[Mark as paid]] records a payment, [[Create job]] turns a quote request into a client and a job, and [[Open job]] opens the job. [[Mark job completed]] and [[Move to Inactive]] (off the board) are in the card’s ⋯ menu."
            },
            {
                "title": "On a phone",
                "text": "You see one column at a time: swipe sideways, or tap a stage at the top."
            }
        ],
        "tips": [
            "Paid jobs stay on the board for 30 days; the Paid column can show the older ones.",
            "Inactive jobs and jobs whose estimates were all declined are left off the board. The board is on every plan, Free included."
        ]
    },
    {
        "id": "job-costing",
        "title": "Job costing and T&M invoices",
        "summary": "See what a job has cost against its budget, and turn unbilled hours and materials into an invoice in one tap.",
        "where": [
            "Job",
            "Financials"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Open the numbers",
                "text": "Open a job and click [[Financials]]. Budget vs actual is under the profit."
            },
            {
                "title": "Read the budget",
                "text": "The budget is the accepted estimate plus approved change orders, split into Labor, Materials, Expenses and Subs & other by the kind of each line (its price-book type, an inventory item, or words such as labor, install or permit). A line that mixes both stays Not split."
            },
            {
                "title": "Read what it has cost",
                "text": "Actual uses the same costs as profit (time sheets × your labor rate with overtime at 1.5×, material logs, expense logs) plus sent purchase orders. A purchase-order line that is also on a material log counts once."
            },
            {
                "title": "Say how far along the job is",
                "text": "With a progress-billing invoice, % complete comes from its lines. Otherwise type it in Job complete. When more of the budget is used than the job is complete, “Costs are ahead of the work” shows in red, with the profit you would end with at this pace."
            },
            {
                "title": "Bill time & materials",
                "text": "Click [[Bill time & materials]] on the job page (on a phone, [[Bill T&M]]) or under Not billed yet in Financials. Unbilled time sheets and material-log lines are listed and ticked; tick Bill expense logs too to add those. Set Labor $/h, the Materials markup (items in your price book keep their price) and Bill through, pick [[Per worker]] or [[Per day]], check the Invoice preview, then click [[Create draft invoice]]."
            },
            {
                "title": "After billing",
                "text": "The Draft invoice opens so you can check it and send it. The time sheets and material lines on it are marked billed and are not offered again; cancel or delete the invoice and they can be billed again."
            }
        ],
        "tips": [
            "Free plan: the T&M invoice is one of the 12 new documents per job each month.",
            "The billing rate and markups you use are remembered for next time. The labor rate in Financials is your cost, not what you bill."
        ]
    },
    {
        "id": "ai",
        "title": "AI assistant",
        "summary": "Describe the work in plain words; the assistant drafts documents, clients, jobs and emails for you to approve.",
        "where": [
            "Dashboard",
            "AI Command"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Open it",
                "text": "Click [[AI Command]] on the dashboard (on a phone, the sparkle button), or [[AI Assistant]] on a job page to work on that job."
            },
            {
                "title": "Ask",
                "text": "Type or dictate what you need, for example “draft an estimate for a 12 × 14 deck” or “good / better / best options for a new roof”. Type @ to pick a client and # to pick a document. You can attach up to 3 photos."
            },
            {
                "title": "Review before anything happens",
                "text": "The assistant proposes; nothing is created or sent until you click. Drafts show [[Open & edit]], [[Save]] and [[Discard]]. Other proposals show [[Review & create]], [[Review & add]] or a send button. Multi-step plans offer [[Do it all]]."
            },
            {
                "title": "Keep your chats",
                "text": "[[Past chats]] reopens earlier conversations; [[New chat]] starts fresh."
            },
            {
                "title": "Fill one form",
                "text": "Inside a document, [[AI fill]] fills just that form from your description."
            }
        ],
        "tips": [
            "When it drafts an estimate, invoice or change order, the assistant uses your [[Price book]]: a line that is one of your items gets its price, unit and kit parts, as if you picked it yourself (a price you type still wins). It never makes up prices for other lines. Only item names, units, client prices, short descriptions and kit parts are sent, never your costs or margins.",
            "Every plan includes AI: 15 requests a month on Free, 60 on Premium, 600 on Premium + AI."
        ]
    },
    {
        "id": "clients",
        "title": "Clients and the client portal",
        "summary": "Save clients once, then give each one a private portal to view, sign and pay.",
        "where": [
            "Clients"
        ],
        "appPath": "/clients",
        "steps": [
            {
                "title": "Add a client",
                "text": "On Clients, click [[Add client]]. Only the name is required; add email, phone, address and notes. Tick [[Mark as temporary client]] for one-off jobs and use [[Convert to regular]] later. [[Import / export]] reads and writes CSV."
            },
            {
                "title": "Share the portal",
                "text": "Each client has a private portal. Click [[Portal]] on the client card to copy the link, or open the client: Client portal has [[Copy]], [[Open]], [[Email]] and [[New link]], plus [[Text]] and [[WhatsApp]]."
            },
            {
                "title": "What the client sees",
                "text": "Their outstanding balance, what is waiting for a signature, and their documents. They can pay an invoice, [[Review & sign]], [[View]] and [[Download]] PDFs, tap [[I’ve paid]], and see the job photos you chose to share. Drafts and internal documents (expense logs, purchase orders, material logs, time sheets, notes) stay hidden."
            },
            {
                "title": "Ask for a signature",
                "text": "Click [[Get approval]] on the client. Every estimate and change order of that client is listed: [[Copy link]] or [[Email link]]."
            },
            {
                "title": "Replace a link",
                "text": "[[New link]] makes a fresh portal link, or a fresh approval link for a document that is not signed yet. The old one stops working, which is handy if it was sent to the wrong person."
            }
        ],
        "tips": [
            "Free plan: 15 new clients a month.",
            "[[Activity]] lists the estimates and change orders your clients signed or declined."
        ]
    },
    {
        "id": "messages",
        "title": "Messages (send from your Gmail)",
        "summary": "Email documents as PDFs from your own Gmail address, so replies come straight to you.",
        "where": [
            "Messages"
        ],
        "appPath": "/communication",
        "steps": [
            {
                "title": "Connect Gmail",
                "text": "Open Messages and click [[Connect Gmail]], then approve in Google. ContractorDocs only asks for permission to send: it cannot read your inbox."
            },
            {
                "title": "Choose who it goes to",
                "text": "Click [[Choose a client (optional)]] and fill To. [[Add Cc]] if needed."
            },
            {
                "title": "Attach documents",
                "text": "With a client selected, tick the documents under Attach documents. They are sent as PDFs."
            },
            {
                "title": "Write it",
                "text": "Type the subject and message, or (once a document is ticked) click [[Use suggested text]]. The Insert chips add the client name, job name, document number, total, your company, your name, the portal link or the approval link."
            },
            {
                "title": "Send",
                "text": "Click [[Send]]. [[Email design]] wraps the message in a designed template if you want a branded look."
            }
        ],
        "tips": [
            "Free plan: 10 emails a month. Premium is unlimited.",
            "Gmail accepts about 18 MB of attachments per email.",
            "You can connect more than one Gmail account ([[Add another Gmail account]]) and pick the default."
        ]
    },
    {
        "id": "reminders",
        "title": "Automatic reminders",
        "summary": "Polite follow-ups for unpaid invoices, unanswered estimates and upcoming visits, sent from your Gmail.",
        "where": [
            "Settings",
            "Reminders"
        ],
        "appPath": "/settings#reminders",
        "steps": [
            {
                "title": "Connect Gmail first",
                "text": "Reminders are emailed from your own Gmail: use [[Connect Gmail]] on the Reminders card or on Messages."
            },
            {
                "title": "Choose what to send",
                "text": "In Settings, Reminders: Unpaid invoices (due date, then 7 and 14 days after), Estimate follow-ups (3 and 7 days after sending) and Visit reminders (the day before a job starts, off by default). Change the days, the Send at time and the time zone."
            },
            {
                "title": "Set the wording",
                "text": "Under Message wording, edit each message. {placeholders} fill in the client, document and amount. The Preview box shows the result; [[Reset to default]] undoes your changes."
            },
            {
                "title": "Save",
                "text": "Click [[Save reminders]]."
            },
            {
                "title": "Per document",
                "text": "Invoices and estimates have a Reminders section to switch them on or off for that document, or never remind that client."
            },
            {
                "title": "When they stop",
                "text": "Reminders start once the document is marked Sent. They stop when the invoice is paid or the client reports a payment, and when an estimate is approved, declined or expires."
            }
        ],
        "tips": [
            "The switch at the top of the Reminders card pauses all reminders at once (then [[Save reminders]]).",
            "On Free, each reminder uses one of the 10 monthly emails."
        ]
    },
    {
        "id": "quote-link",
        "title": "Request-a-quote link",
        "summary": "A public page and QR code where customers send you jobs, with photos, straight into your inbox.",
        "where": [
            "Settings",
            "Request-a-quote link"
        ],
        "appPath": "/settings#requests",
        "steps": [
            {
                "title": "Get your link",
                "text": "In Settings, Request-a-quote link (or on the dashboard, Quote requests, [[Link & QR code]]). [[Copy]], [[Share]] or [[Open]] your link, and add a short intro for the page ([[Save intro]])."
            },
            {
                "title": "Put it everywhere",
                "text": "[[Print sign]] makes a QR sign for the van or the site; [[Save image]] gives you the QR code for flyers and your website."
            },
            {
                "title": "Customers ask",
                "text": "They enter their name, a phone or email, the address, what they need and up to 5 photos, then [[Send request]]."
            },
            {
                "title": "Answer from the inbox",
                "text": "Requests appear on the dashboard under Quote requests. Open the [[Inbox]] to call, text, email or map each one."
            },
            {
                "title": "Turn it into work",
                "text": "[[Create client & job]] adds the client (or matches one you have) and an active job; the photos become Before photos on the job. With Premium + AI, [[Draft estimate with AI]] writes the estimate."
            }
        ],
        "tips": [
            "The Taking requests / Paused switch turns the page off without losing your link.",
            "[[Change link]] makes old links and printed QR codes stop working."
        ]
    },
    {
        "id": "photos",
        "title": "Job photos",
        "summary": "Before, during and after pictures on each job, with markup, portal sharing and a PDF report.",
        "where": [
            "Job",
            "Photos"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Open the Photos tab",
                "text": "On a job page, switch to [[Photos]]."
            },
            {
                "title": "Add photos",
                "text": "Choose the stage for new photos (Before, During, After, Issue), then [[Take photo]] or [[Upload]] on a phone, or [[Add photos]] on a computer."
            },
            {
                "title": "Describe and mark up",
                "text": "Tap a photo to set its caption and stage, [[Mark up]] with arrows, circles, text or drawing (saved as a copy), or switch on Show in client portal."
            },
            {
                "title": "Work with many at once",
                "text": "[[Select]] several photos to show or hide them in the portal, or delete them."
            },
            {
                "title": "Make a report",
                "text": "[[Before/after report]] creates a PDF of the job’s photos (tag some photos Before or After first)."
            },
            {
                "title": "Send a client update",
                "text": "With Premium + AI, [[Write client update]] picks the photos added since your last update (up to 8; tap to change), you add a note or dictate one, then [[Write update]]. Edit the text, then [[Send with Gmail]], [[Text]] or [[WhatsApp]]; the portal link is included and each update is saved on the job as a Client update note."
            },
            {
                "title": "Turn a walkthrough into a report",
                "text": "With Premium + AI, [[AI walkthrough]] takes the day’s photos and what you say about them and drafts a Daily Job Report (or a Note). It opens in the editor: check it, then save it."
            }
        ],
        "tips": [
            "Shared photos appear in the portal only when the job is linked to a saved client.",
            "Free: 30 photos per job and 250 MB in total. Premium: 5 GB. Premium + AI: 10 GB.",
            "The AI only writes what your photos and note show: weather, crew size and hours appear in a report only when you say them."
        ]
    },
    {
        "id": "inventory",
        "title": "Inventory",
        "summary": "Track stock, check it out to jobs, get low-stock alerts and print QR labels.",
        "where": [
            "Tools",
            "Inventory"
        ],
        "appPath": "/inventory",
        "steps": [
            {
                "title": "Add items",
                "text": "Click [[Add item]] and pick Stock item or Kit (bundle of items). Fill the name, unit cost, unit, storage location, Low-stock alert at and Starting quantity."
            },
            {
                "title": "Change stock",
                "text": "Use [[Adjust stock]] from the item’s menu and pick a reason (restock, returned from job, count correction, damaged, used). Every change is listed in [[History]]."
            },
            {
                "title": "Use stock on a job",
                "text": "[[Check out]] an item, set the quantity and the job (or a client without a job). Checking out a kit takes out all its parts."
            },
            {
                "title": "Let documents do it",
                "text": "Lines picked from inventory on invoices, estimates and change orders take the stock off automatically when the document is approved, accepted or paid."
            },
            {
                "title": "Label your shelves",
                "text": "[[Labels]] (on a computer) prints QR labels on Avery or A4 sheets. Scanning a label with the phone camera opens the item; [[Scan]] in the app opens [[Check out]] for it."
            }
        ],
        "tips": [
            "Low-stock items also show on the dashboard.",
            "Print labels at 100% scale with no margins."
        ]
    },
    {
        "id": "suppliers",
        "title": "Suppliers, purchase orders and reorders",
        "summary": "Save your suppliers, send them purchase orders from your Gmail, reorder low stock in one tap and receive deliveries into stock.",
        "where": [
            "Tools",
            "Inventory",
            "Suppliers"
        ],
        "appPath": "/inventory",
        "steps": [
            {
                "title": "Save your suppliers",
                "text": "In Inventory, click [[Suppliers]], then [[Add supplier]]: the name, the email for orders, phone, your account # and notes. Click [[Save supplier]]."
            },
            {
                "title": "Fill a purchase order in one tap",
                "text": "On a Purchase Order, pick one from [[Saved suppliers…]] next to Vendor: the name, email, phone and address are filled, and your account # goes into the notes. Typed a new vendor? [[Save as supplier]] keeps it for next time."
            },
            {
                "title": "Send it to the supplier (Premium)",
                "text": "[[Send to supplier]] at the top of the order saves it and opens the Share window addressed to the supplier. [[Send with Gmail]] sends it from your own Gmail with the PDF attached and asks the supplier to confirm availability and the delivery date."
            },
            {
                "title": "Reorder low stock (Premium)",
                "text": "On each item set Low-stock alert at, the Supplier (a saved supplier’s name) and, if you like, a Reorder quantity. When items run low, Inventory says how many and what is already on order. [[Create reorder POs]] lists them by supplier with the quantity and unit cost (the item’s cost, else your price book). Untick or change quantities, choose the job (a Shop stock job by default), then create one Draft purchase order per supplier."
            },
            {
                "title": "Receive the delivery",
                "text": "When the goods arrive, open the order and click [[Mark received]]. Each line picked from Inventory (or named exactly like an item) is added to stock once, with a Received PO entry in the item’s [[History]]. The order becomes Received and can’t be received twice; if an item fails, [[Finish receiving]] adds only what is missing."
            }
        ],
        "tips": [
            "Purchase orders, [[Share]] and [[Mark received]] work on every plan. [[Send to supplier]] and reorder POs are part of Premium.",
            "Items on an open order show On order in the list, so you don’t order them twice."
        ]
    },
    {
        "id": "pricebook",
        "title": "Price book",
        "summary": "Your saved services, labor, materials and kits, ready to drop into any document.",
        "where": [
            "Tools",
            "Price book"
        ],
        "appPath": "/pricebook",
        "steps": [
            {
                "title": "Add an item",
                "text": "Click [[New item]]. Give it a name, type (Service, Labor, Material or Bundle), unit, a description (printed under the name) and whether it is taxable."
            },
            {
                "title": "Price it",
                "text": "Enter Your cost and a Markup (%), or the Client price. The margin and markup update as you type. Click [[Add to price book]]."
            },
            {
                "title": "Build kits",
                "text": "[[New kit]] bundles items: add the components, quantities and any price override. The kit’s cost comes from its parts."
            },
            {
                "title": "Use it in documents",
                "text": "On a document line, the tag button opens the catalog: pick from [[Price book]] or [[Inventory]]. The save button on any line adds it to the price book."
            },
            {
                "title": "Find things",
                "text": "Filter by category or type and switch between Grid and List."
            }
        ],
        "tips": [
            "Premium: up to 6 photos per item."
        ]
    },
    {
        "id": "calculator",
        "title": "Profit calculator",
        "summary": "Price a job before you quote it and see your profit, margin and markup. Advanced adds target-margin pricing and tax.",
        "where": [
            "Tools",
            "Profit calculator"
        ],
        "appPath": "/calculator",
        "steps": [
            {
                "title": "Enter the lines",
                "text": "One line per part of the job (it starts with Materials and Labor): Your cost and Client price. [[Add line]] adds more. Each line shows its own profit and margin."
            },
            {
                "title": "Read the summary",
                "text": "Client price minus your cost is your profit. The card turns green from a 30% margin, amber from 15%, red below, and shows margin and markup side by side."
            },
            {
                "title": "Switch to Advanced",
                "text": "Click [[Advanced]] at the top for the pricing tools. [[Simple]] hides them again."
            },
            {
                "title": "Price for a target margin",
                "text": "Enter the Target margin (%) and click [[Calculate pricing]]. Every line with a cost gets the price that gives that margin: cost ÷ (1 − margin)."
            },
            {
                "title": "Add tax / VAT",
                "text": "Switch on Tax / VAT and set the rate. The summary adds the tax and the Total with tax. Tax never changes your profit."
            },
            {
                "title": "Keep it",
                "text": "[[Save]] stores the calculation in your account, including the mode, target margin and tax, so it is there on every device. [[Saved]] (with the count) lists them and [[Export PDF]] downloads a profit report."
            }
        ],
        "tips": [
            "Margin = profit ÷ price. Markup = profit ÷ cost. A 50% markup is a 33.3% margin.",
            "[[Reset]] clears the lines; saved calculations are not affected."
        ]
    },
    {
        "id": "calendar",
        "title": "Calendar and Insights",
        "summary": "See when every job runs, and how the business is doing.",
        "where": [
            "Tools",
            "Calendar"
        ],
        "appPath": "/calendar",
        "steps": [
            {
                "title": "Plan the schedule",
                "text": "Tools, Calendar (the Schedule page) shows each job from its start to its end date, coloured by status. Switch between Month, Week and List."
            },
            {
                "title": "Schedule a job",
                "text": "Click [[New job]], or double-click a day in the month view on a computer."
            },
            {
                "title": "Check the numbers",
                "text": "Tools, Insights: pick a period to see revenue collected, outstanding, costs, profit, average invoice and estimate win rate, with charts."
            },
            {
                "title": "One job’s profit",
                "text": "On a job page, [[Financials]] shows that job’s income, costs and labor."
            }
        ],
        "tips": []
    },
    {
        "id": "settings",
        "title": "Settings, plan and billing",
        "summary": "Your company details, signature, look, plan and account.",
        "where": [
            "Account menu",
            "Settings"
        ],
        "appPath": "/settings",
        "steps": [
            {
                "title": "Open Settings",
                "text": "Click your avatar (top right) and choose [[Settings]]. On a phone it is also under More."
            },
            {
                "title": "Company details",
                "text": "Profile and Company hold your name, company name, email, phone, website, address and logo. They print on every document. After an edit, a bar with [[Save changes]] appears at the bottom."
            },
            {
                "title": "Signature",
                "text": "[[Add signature]] once and it is ready to drop into your documents."
            },
            {
                "title": "Look and language",
                "text": "Appearance & language: Light, Dark or Blue apply at once; a new Language is kept with [[Save changes]]."
            },
            {
                "title": "Plan and billing",
                "text": "Plan & billing shows this month’s usage, with [[Upgrade]] or [[Manage billing]]."
            },
            {
                "title": "Help any time",
                "text": "The account menu has [[Help & tutorials]]: every guide on this page, plus the 1-minute app tour."
            }
        ],
        "tips": [
            "Premium is $5/month and Premium + AI $10/month. Yearly billing saves two months."
        ]
    }
];
