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
                "text": "In Design, pick a template, the [[Accent color]] and the [[Paper size]] (US Letter or A4). [[Preview]] shows the PDF before you send it. To change the design new documents start with, go to Settings, Document design."
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
            },
            {
                "title": "Reuse it on another job",
                "text": "In the job’s document list, open the ⋮ menu of a document and choose [[Copy to another job]]. Pick the job (search by job or client, recent first). The copy is a Draft with the new job’s client and address, your lines, notes and design kept, and no signature, payments or stock change; tap [[Open]] to edit it."
            }
        ],
        "tips": [
            "Free plan: 12 new documents per job each month (deleted documents still count).",
            "Invoices can repeat on a schedule (Repeat this invoice) and switch to progress billing in Items.",
            "No signal on site? Daily job reports, time sheets, material and expense logs, notes and receipts still save on your device with a Waiting to sync badge, and new estimates and invoices can be drafted (their number is confirmed when they sync). Jobs, clients, job photos, stock changes, the price book and your settings work offline too. They sync by themselves when you are back online, or tap [[Sync now]]. Sending and links wait until then; [[View]] lists what is waiting."
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
            "The AI assistant can draft them: in [[AI Command]] or a job’s [[AI Assistant]], ask for example “good / better / best estimate for a 12 × 14 deck” with each option’s lines and prices. The estimate opens with the options filled in: lines that are in your [[Price book]] get its prices, other prices you did not give stay empty. Nothing is saved until you click [[Save]].",
            "On an estimate you already started, click [[AI fill]] and ask “turn this into good / better / best options” or “add a premium option”: the options are built from your current lines, which stay exactly as you typed them (with an added option your current lines stay Recommended, so the total does not change). Options you already have are kept; new lines without a price stay empty for you to fill."
        ]
    },
    {
        "id": "proposals",
        "title": "Proposals: optional add-ons, scope, payment schedule, photos",
        "summary": "Turn an estimate into a full proposal: extras the client can ask for, a clear scope, a payment schedule and project photos, printed in every design.",
        "where": [
            "Job",
            "Estimate",
            "Proposal"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Add optional add-ons",
                "text": "Under Items, open Optional add-ons and click [[Add an add-on]], or pick a line in Move a line here. Add-ons print with their price and an Optional tag, but are not in the subtotal, tax or total. Tick In the total when the client wants one: it then counts like a normal line. [[Make it a regular line]] moves it back."
            },
            {
                "title": "Write the scope",
                "text": "In the Proposal section, Scope tab, add Scope of work, Inclusions, Exclusions, Assumptions and Timeline / schedule. Type one item per line for a list, or switch Print as to Paragraphs. The arrows change the order they print in."
            },
            {
                "title": "Set the payment schedule",
                "text": "In the Payments tab pick 50 / 50, 30 / 40 / 30 or 10 / 40 / 40 / 10, or click [[Add payment]]. Each payment is a % of the total or a fixed amount (% → $ switches). The payments must add up to the total; amounts are rounded to the cent and the last payment takes the leftover cents."
            },
            {
                "title": "Add project photos",
                "text": "In the Photos tab click [[Upload photo]] or [[From job photos]] (up to 8, JPG, PNG or WebP) and add a caption. They print as a photo page with captions; hiding Photos in a Premium design leaves them out."
            },
            {
                "title": "Bill the schedule",
                "text": "On an accepted estimate, [[Convert to invoice]] asks What to invoice: the whole estimate, the deposit (one line for the exact amount) or a later payment (a progress billing invoice with the right % complete and what was billed before)."
            },
            {
                "title": "Reuse it",
                "text": "Click [[Save as template]] to keep the scope sections, payment schedule and terms. On the next estimate, Use a template fills them in. Free keeps one template; Premium keeps up to 20."
            }
        ],
        "tips": [
            "Clients see the scope, add-ons (marked not included in the total), payment schedule and photos on the approval link and in the portal. Choosing add-ons online comes later.",
            "Optional add-ons are left out of invoices, the job budget, Insights and the bookkeeper export until they are switched on.",
            "Once the client signs, the scope, schedule, photos and add-ons are locked with the rest of the estimate."
        ]
    },
    {
        "id": "estimate-review",
        "title": "Review an estimate before you send it",
        "summary": "A second look at an estimate: math, missing prices, odd quantities, margin, price book and tax, plus (Premium + AI) items and costs you may have forgotten.",
        "where": [
            "Job",
            "Estimate",
            "Items"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Open the review",
                "text": "Under the estimate total click [[Review estimate]]. The line next to it already says how many things there are to check."
            },
            {
                "title": "Read the checks",
                "text": "Each row says what looks wrong and on which line or option: a line without a price, a quantity of 0 or unusually high, decimals on items counted by the piece, a price below your cost or far from your [[Price book]], a margin below your usual, materials without labor, no tax when you usually charge it, a discount bigger than the subtotal, or two options with the same lines."
            },
            {
                "title": "AI check (Premium + AI)",
                "text": "The AI also looks for missing items (grout and adhesive on a tile job, primer for painting), missing expenses (permits, dump fees, delivery, travel) and risky assumptions. A suggested line gets your price-book price when it is one of your items; otherwise it has no price and you fill it in. If the AI is busy, the checks still show: click [[Try again]]."
            },
            {
                "title": "Fix or ignore",
                "text": "Fix the line yourself, click [[Add line]] on an AI suggestion (it goes at the end of the estimate, or into that option; nothing you typed changes), or click [[Ignore]]. The estimate never changes without your click. Save when you are done."
            }
        ],
        "tips": [
            "The checks are free on every plan and work offline. The AI check uses one AI request and runs again only when you ask after the estimate changed ([[Check again]]).",
            "When you click [[Share]] and important things were never looked at, the Share window shows “3 things to check” with a Review link. It never stops you from sending."
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
            "Every plan includes AI: 15 requests a month on Free, 60 on Premium, 600 on Premium + AI.",
            "AI credits (only when your Plan & billing shows an AI credits line): when the month’s requests run out, buy a one-time pack from $5 (100 credits; 1 credit = 1 request; they never expire) with [[Buy credits]] or [[Buy more credits]], and turn on [[Automatic top-up]] if you like."
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
                "title": "Client project dashboard",
                "text": "When the client has a job, their portal opens on [[Project]]: the job’s status and dates, a progress bar (“5 of 12 steps done”), the milestones as a timeline with the next one highlighted, what happens next (a document to sign, an invoice to pay), the balance with that job’s documents, and the photos you shared. Only milestones are shown, never your other tasks, notes or crew. [[All documents]] still has every document. Open the client and click [[What my client sees]] to preview it exactly as they will see it (read-only)."
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
            "[[Change link]] makes old links and printed QR codes stop working.",
            "Requests also appear in Leads, where you can follow them up by stage, book a visit and convert them to jobs."
        ]
    },
    {
        "id": "leads",
        "title": "Leads: from the first call to a job",
        "summary": "Every quote request and every call you get, by stage, with follow-up dates, until it becomes a job or you let it go.",
        "where": [
            "Leads"
        ],
        "appPath": "/leads",
        "steps": [
            {
                "title": "Open your leads",
                "text": "Click [[Leads]] at the top (on a phone: [[More]], then [[Leads]]). The Quote requests bar on the dashboard has a [[Leads]] button too. Every request from your link and QR code arrives in the New column."
            },
            {
                "title": "Add the people who call you",
                "text": "Click [[Add lead]]. Type a name and a phone number or an email, the job address and what they need. Choose where they came from (Phone call, Referral, Walk-in and so on) and, if you know them, a budget range and a [[Follow up on]] day. Then click [[Add lead]] again. Adding a lead needs an internet connection."
            },
            {
                "title": "Read the board",
                "text": "The columns are New, Contacted, Appointment set, Quote sent, Won and Lost. Each shows how many leads it holds and their budgets added up (the middle of each range). A coloured edge on a card means a follow-up is due: amber today, red when late. On a phone, tap a stage at the top to see one column at a time. [[List]] shows every lead in one list and [[Board]] goes back. The search box, the source menu and [[Needs follow-up]] narrow it down."
            },
            {
                "title": "Move a lead along",
                "text": "Tap a lead to open it. Under Stage, tap where it is now: Contacted, Appointment set or Quote sent. After you call or write, click [[Log contact]]: it saves the time and moves a New lead to Contacted. Booking an appointment moves a New or Contacted lead to Appointment set."
            },
            {
                "title": "Never forget a follow-up",
                "text": "In Follow-up, tap [[Tomorrow]], [[In 3 days]] or [[Next week]], or pick a day. When the day comes the lead gets a coloured edge and counts in [[Needs follow-up]]; the number also shows on the Leads link and on the dashboard bar. Follow-ups and appointments are on the Schedule too (Tools, Calendar); tap one to open the lead."
            },
            {
                "title": "Turn it into a job",
                "text": "Click [[Convert to job]], check the Job name, then [[Create client & job]]. It adds the client (or uses the one with the same email, phone or name), creates an active job and copies their photos as Before photos, the same as the old inbox. The lead moves to Won and [[Open job]] takes you to the job. With Premium + AI, [[Draft estimate with AI]] writes the estimate."
            },
            {
                "title": "When it does not work out",
                "text": "Click [[Mark lost]], pick a reason (Price too high, Went with another contractor and so on) and click [[Mark as lost]]. The lead moves to Lost. If they come back, open it and tap a stage under Reopen as."
            },
            {
                "title": "Notes and files",
                "text": "[[Edit lead]] changes the details, the budget and your notes (only you see them). [[Add file]] attaches photos or PDFs, up to 15 MB each; [[Open]] shows one and [[Remove]] deletes it."
            },
            {
                "title": "See how you are doing (Premium)",
                "text": "Premium adds a strip at the top: your win rate (won out of won and lost), what is still open, where your leads come from and how many have gone quiet for a week; click it to list them. The board, follow-ups and appointments are free."
            }
        ],
        "tips": [
            "Requests you archived in the old inbox show in the Lost column. [[Delete lead]] removes a lead and its files for good.",
            "You can read your leads offline; adding or changing one needs a connection."
        ]
    },
    {
        "id": "appointments",
        "title": "Appointments with leads",
        "summary": "Book a site visit or a call, avoid double-booking, add it to your own calendar and see it on your Schedule.",
        "where": [
            "Leads",
            "Book appointment"
        ],
        "appPath": "/leads",
        "steps": [
            {
                "title": "Book it",
                "text": "Open the lead and click [[Book appointment]]. Pick the Type (Site visit, Estimate meeting, Meeting or Call), the Day and Time, How long and Where (the job address is filled in). Then click [[Book appointment]] again."
            },
            {
                "title": "Watch for double-booking",
                "text": "If the time crosses another appointment, the window says which one. You can still book it."
            },
            {
                "title": "Put it in your own calendar",
                "text": "Click [[Add to my calendar]]. A calendar file is saved; open it on your phone or computer and the visit is in your Google, Apple or Outlook calendar. Nothing is sent to anyone."
            },
            {
                "title": "After the visit",
                "text": "Click [[Done]] or [[No-show]], or [[Cancel]] if it is off. An appointment whose time has passed asks Did it happen? [[Back to scheduled]] undoes a mistake and [[Delete]] removes it."
            },
            {
                "title": "See it on the Schedule",
                "text": "Tools, Calendar shows lead follow-up days and appointments next to your jobs: a small marker on the day in the month view, slim chips with a blue edge in the Week view, and under Leads in the List view. Tap one to open the lead."
            }
        ],
        "tips": [
            "Booking moves a New or Contacted lead to Appointment set. Appointments need a connection to book or change."
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
        "id": "punch-list",
        "title": "Punch lists",
        "summary": "What is left to finish on a job: quick to add on a phone, checked off with photo proof, approved by the client in the portal.",
        "where": [
            "Job",
            "Punch list"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Open the Punch list tab",
                "text": "On a job page, switch to [[Punch list]]. The number next to it is how many items are done."
            },
            {
                "title": "Walk the job and type",
                "text": "Type one item per line and press Enter or [[Add item]]. Start with the room to group it (“Kitchen: touch up paint”); the room sticks for the next items. End with @Name to assign it (“caulk tub @Mike”)."
            },
            {
                "title": "Check items off",
                "text": "Tap the ring in front of an item to mark it done (tap again to undo). In the ⋯ menu: [[Mark verified]] when you checked it, [[Reopen]] or [[Edit]] (room, assignee, due date, notes, before and after photo)."
            },
            {
                "title": "Show it to the client",
                "text": "Switch on [[Show in client portal]]. In their portal the client sees the progress and, on each finished item, taps [[Looks good]] or [[Needs work]] with a note. A sent-back item opens again with the client’s note, and the bell tells you."
            },
            {
                "title": "Print or keep it",
                "text": "The ⋯ menu at the top has [[Download PDF]] (with the photos) and [[Save as Note on the job]] (a Note in Documents you can email or share)."
            }
        ],
        "tips": [
            "Works offline: adding, checking off and editing items save on the phone and sync when you are back online. Photos, delete and sharing need a connection.",
            "Item photos are also added to the job’s photos (before = Issue, after = After) and count toward your photo storage.",
            "The pipeline board shows “Punch 3/8” on a job card while items are open. Punch lists are on every plan."
        ]
    },
    {
        "id": "job-tasks",
        "title": "Job tasks and timeline",
        "summary": "Plan a job step by step: who does what, by when, and what waits for what. See it as a list or a timeline, and your crew ticks tasks off on their phones.",
        "where": [
            "Job",
            "Tasks"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Open the Tasks tab",
                "text": "On a job page, switch to [[Tasks]]. The number next to it is how many tasks are done. Type a task and press Enter or [[Add]]. End a line with @Name to give it to a crew member (“Order windows @Mike”); [[Date]] sets a due day."
            },
            {
                "title": "Finish and open tasks",
                "text": "Tap the ring in front of a task to mark it done (tap again to undo). Tap the task to open it: notes, status ([[To do]], [[In progress]], [[Blocked]], [[Done]]), who does it, the start and due dates, and a [[Milestone]] switch for a date you must hit, like an inspection. Comments from you and your crew are in the same window, with the photo your worker took when they finished."
            },
            {
                "title": "What waits for what",
                "text": "In a task, [[Waits for]] picks the tasks that must be done first. A task waiting for an unfinished one shows “Waiting on 2” and counts as Blocked until they are done. A loop (A waits for B, B waits for A) is refused. The rows with a grey stripe are the longest chain of waiting tasks: if one of them is late, the finish moves."
            },
            {
                "title": "Move a date",
                "text": "When you change a date and other tasks wait for it, the app asks [[Move the tasks that follow too?]]. the first button (for example “Move the 3 tasks 2 days later”) shifts each of them by the same number of days; [[Only as far as needed]] moves just the ones that would now start before this task ends; [[No, leave them]] changes only this task."
            },
            {
                "title": "List, order or timeline",
                "text": "[[By date]] groups tasks as Overdue, Today, Coming up, Later, No date and Done. [[In order]] is your own order: use the arrows (or drag a row on a computer). [[Timeline]] draws each task as a bar from its first to its last day, milestones as diamonds, lines from a task to the ones that wait for it, late tasks in red and a line for today. Scroll sideways on a phone."
            },
            {
                "title": "Start from a template",
                "text": "⋯ › [[Add from a template]] (or [[From a template]]) has ready-made lists (bathroom remodel, deck build) and your own. Pick one, choose the day the first task starts, review the tasks (untick what this job does not need) and add them. On a job whose steps you repeat, ⋯ › [[Save these tasks as a template]] keeps them for next time, with dates as days after the first task."
            },
            {
                "title": "Turn a note into tasks (Premium + AI)",
                "text": "[[Note to tasks]] (or ⋯ › [[Turn a note into tasks (AI)]]): type or dictate what needs doing (“Pour footings Monday, Mike orders windows by Friday, inspection on the 20th”). The assistant lists the tasks with who and when. You see them first, fix or untick any, and only then add them. It uses one of your AI requests."
            },
            {
                "title": "From a work order",
                "text": "In a work order, the [[Tasks]] section has [[Create tasks from this work order]]: one task per line of the description, “Get materials” first when materials are listed, given to the person in Assigned to. Review, then add. It shows “Tasks: 2 of 5 done” and opens the job’s Tasks. Nothing is printed on the PDF."
            },
            {
                "title": "What your worker sees",
                "text": "On their clock-in link, [[My tasks]] lists the open tasks given to them with the job, address, due day and notes. They tap [[Start]] or [[Done]], and can add a photo and a short comment. Tasks finished in the last 14 days are folded away."
            },
            {
                "title": "On the Schedule",
                "text": "Tools › Calendar also shows your open tasks that have a date: a small marker on the day they are due (red when late). Tap one to open that job’s Tasks."
            }
        ],
        "tips": [
            "Job tasks, the timeline and templates are part of Premium. Turning a note into tasks is part of Premium + AI.",
            "Tasks need a connection: when you are offline the app says so and the list comes back when you are online again.",
            "Give your workers tasks by choosing them in [[Who]]. Add workers first in Tools › Crew."
        ]
    },
    {
        "id": "job-files",
        "title": "Job files and links",
        "summary": "Keep the plans, permits, contracts, specs and receipts of a job in one place, with versions, tags and a search. Show the ones your client should see.",
        "where": [
            "Job",
            "Files"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Open the Files tab",
                "text": "On a job page, switch to [[Files]]. Files are listed under their category (Plans, Permits, Contracts, Specs, Receipts, Visuals / renders, Other). Tap a file to open it."
            },
            {
                "title": "Add a file or a link",
                "text": "[[Add file]] takes PDFs and images (JPG, PNG, WebP, GIF) up to 15 MB. [[Take photo]] uses the camera. Pick several files at once and they are added with a category guessed from the name. For anything bigger, or a folder, a 3D walkthrough or a supplier page, use [[Add link]]."
            },
            {
                "title": "Name it, sort it, tag it",
                "text": "When you add one file, check its name, category, tags (separate with commas, like kitchen, rev B) and a note only you see. Later, open ⋯ › [[Details and versions]] to change them. The search box and the category and tag chips narrow the list."
            },
            {
                "title": "Keep every revision",
                "text": "In ⋯ › [[Upload new version]] (or inside the file) add the new drawing. The list shows the newest as v2, v3 and keeps its name, category and tags; the earlier ones fold under [[Older versions]] and can still be opened, downloaded or deleted one by one."
            },
            {
                "title": "Show a file to your client",
                "text": "Switch on [[Show in client portal]] (or ⋯ › [[Show to client]]). Images up to 5 MB and links can be shown; the client sees them under Files on their project page, images large and links in a new tab. A PDF cannot be shown yet: add a link to it (Google Drive, Dropbox) and show the link. When a shown file gets a new version, switch the new version on so the client sees it."
            },
            {
                "title": "Delete",
                "text": "⋯ › [[Delete]] removes the whole document with all its versions after you confirm. Inside the file you can delete a single version."
            }
        ],
        "tips": [
            "Job files, links and versions are part of Premium. Without it you can still open files you already have.",
            "Files need a connection: when you are offline the app says so and the list comes back when you are online again.",
            "Attach a file or link to a client question with [[Attach from this job]] in [[Questions]]."
        ]
    },
    {
        "id": "job-questions",
        "title": "Client questions and submittals",
        "summary": "Ask your client which tile or paint colour, or send a change order or product sheet for approval. They answer from their project link and you keep who said what and when.",
        "where": [
            "Job",
            "Questions"
        ],
        "appPath": "/dashboard",
        "steps": [
            {
                "title": "Open the Questions tab",
                "text": "On a job page, switch to [[Questions]]. The number next to it is how many are waiting for your client, and the job header shows the same. The job needs a client, because the client opens the questions from their project link."
            },
            {
                "title": "Write one",
                "text": "Tap [[New]] and start from a ready-made one (Which tile?, Paint colour, Approve the change order, Submittal: product data sheet) or from blank. A [[Question]] is answered in words. A [[Submittal]] is approved or rejected (the client needs a note to reject). Add a message, an optional date to answer by, and up to 10 attachments: files and links of this job with [[Attach from this job]], or a pasted link."
            },
            {
                "title": "Save it or send it",
                "text": "[[Save draft]] keeps it to yourself. [[Send to client]] puts it on their project link. Use [[Copy client link]] on the Questions tab to give the client the link. A client sees images you have shown in the client portal and links; a PDF or an unshared file is shown by its name only, so attach a link to it."
            },
            {
                "title": "See the answer",
                "text": "When the client answers, the row says Answered, Approved or Rejected with their name, the date and their words. Tap the row for the whole history: when it was sent, edited, answered and asked again. Waiting items that pass their date show in red as overdue."
            },
            {
                "title": "Ask again, close or reopen",
                "text": "In ⋯ or inside the item: [[Ask again]] sends it back to the client (the earlier answer stays in the history), [[Close it]] ends it, [[Reopen]] sends a closed one again, [[Change it]] fixes the text of one already sent, and [[Delete]] removes it. Nothing is deleted by a close."
            }
        ],
        "tips": [
            "Client questions and submittals are part of Premium.",
            "Questions need a connection: when you are offline the app says so and the list comes back when you are online again.",
            "The client can answer only once for each time you send it. To get a new answer use [[Ask again]]."
        ]
    },
    {
        "id": "client-questions-view",
        "title": "What your client sees: questions, approvals and files",
        "summary": "On their project link your client answers your questions, approves or rejects submittals and opens the files you chose to show.",
        "where": [
            "Client portal",
            "Project"
        ],
        "appPath": "/clients",
        "steps": [
            {
                "title": "A badge on Project",
                "text": "When something waits for the client, the Project tab of their link shows a small number, and [[Questions for you]] is the first thing on the page. Each item shows the job, the date it is due, your message and its attachments (links open in a new tab, shown images open large)."
            },
            {
                "title": "A question",
                "text": "The client types their answer in the box and taps [[Send answer]]. They cannot send an empty answer."
            },
            {
                "title": "A submittal",
                "text": "The client taps [[Approve]] or [[Reject]], types their name and, to reject, a note about what should change, then taps [[Send decision]]. Typing the name confirms the decision. You see it at once on the job, with the name and the date."
            },
            {
                "title": "After answering",
                "text": "The client sees what they said, a thank-you and the history. Finished items fold under [[Answered]] the next time they open the link. If you [[Ask again]], the item comes back to them as waiting."
            },
            {
                "title": "Files",
                "text": "Under Files on the Project page the client finds the links and images you switched on with [[Show in client portal]], by category. When you have shown nothing, the section is not there at all."
            }
        ],
        "tips": [
            "The client needs no account: the project link is enough. Use [[Copy client link]] on the Questions tab, or Copy portal link on the client.",
            "Drafts and closed items are never shown to the client."
        ]
    },
    {
        "id": "papers",
        "title": "Papers: insurance, licenses, permits and lien waivers",
        "summary": "Keep your COI, licenses, permits, bonds and W-9 with their expiry dates, get reminded before they expire, send them in two taps, and make lien waivers.",
        "where": [
            "Tools",
            "Papers"
        ],
        "appPath": "/papers",
        "steps": [
            {
                "title": "Open Papers",
                "text": "Open [[Tools]] › [[Papers]] (phone: [[More]] › [[Papers]])."
            },
            {
                "title": "Add a paper",
                "text": "Click [[Add paper]], pick the kind (COI, License, Permit, Bond, W-9, Other), type the number, who issued it and the dates, then [[Upload PDF or photo]] and [[Save]]. A permit can be linked to its job, with the next inspection date: it then shows on the job page."
            },
            {
                "title": "Get reminded",
                "text": "Each paper reminds you 30, 7 and 1 days before it expires (tap the chips to change the days): in the bell, and by email to yourself from your Gmail. The list puts what expires first at the top, in red once expired."
            },
            {
                "title": "Renew",
                "text": "In the ⋯ menu, [[Renew (new date and file)]] keeps the paper and starts the reminders again from the new date."
            },
            {
                "title": "Send a certificate",
                "text": "Click [[Send]] (or [[Send by email]] in the ⋯ menu), type the client’s or GC’s email, check the message and click [[Send with Gmail]]. The file is attached."
            },
            {
                "title": "Make a lien waiver",
                "text": "Click [[Lien waiver]] here or on a job page. Pick Conditional or Unconditional and Progress or Final; the invoice and the payment recorded with [[Mark as paid]] fill in the amount and dates. Check the names and address, then [[Create waiver]]: it is saved on the job as a document you can print, email or share."
            }
        ],
        "tips": [
            "The vault and its reminders are part of Premium. Lien waivers work on every plan.",
            "Switch on “Show in client portal” on a COI, license or bond: the portal shows “Licensed & insured” with the name, number and expiry date (never the file).",
            "Lien waivers use general wording. Some states (for example California, Texas, Florida and Georgia) require their own statutory form; use it where required."
        ]
    },
    {
        "id": "service-plans",
        "title": "Service plans (recurring maintenance visits)",
        "summary": "Plans like “HVAC tune-up twice a year”: each visit gets its work order, invoice and client reminder by itself.",
        "where": [
            "Tools",
            "Service plans"
        ],
        "appPath": "/service-plans",
        "steps": [
            {
                "title": "Open Service plans",
                "text": "Open [[Tools]] › [[Service plans]] (phone: [[More]] › [[Service plans]])."
            },
            {
                "title": "Create a plan",
                "text": "Click [[New plan]]: pick the client, name the plan, say what is done at each visit, choose how often (for example Twice a year), the first visit, the price and how it is billed, then [[Save plan]]."
            },
            {
                "title": "Let it run",
                "text": "A job is made for the plan. Each visit is created ahead of time (14 days by default) with a Work Order; with Invoice each visit, a Draft invoice too. The job moves to the visit date, so it shows on the calendar, and the client gets your visit reminder the day before."
            },
            {
                "title": "Bill by the month, quarter or year",
                "text": "Choose Monthly, Quarterly, Invoice every 6 months or Yearly invoice: one recurring invoice is added to the plan’s job and repeats by itself (like Repeat this invoice)."
            },
            {
                "title": "Mark visits",
                "text": "Under Next visits, tap [[Done]] when the visit is done (the work order becomes Completed), or in the ⋯ menu [[Skip this visit]], [[Open work order]] or [[Open invoice]]."
            },
            {
                "title": "Change a plan",
                "text": "The ⋯ menu of a plan has [[Edit]], [[Pause]], [[Resume]], [[End plan]] and [[Delete]] (its job and documents stay)."
            }
        ],
        "tips": [
            "Service plans are part of Premium. Visits are created every hour on our side, even when you don’t open the app.",
            "Visit reminders go out from your Gmail; Settings › Reminders sets the day and the wording. The client also sees the plan, the next visit and the last one in their portal."
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
                "text": "When goods arrive, open the order and click [[Record delivery]]: enter what arrived on each line (it starts at what is still to come), the date and a note. Each line picked from Inventory (or named exactly like an item) is added to stock once per delivery, with an entry in the item’s [[History]]. Part of the order? It shows Partially delivered and what is still to come; record the rest later. If a delivery stops half-way, [[Finish delivery]] adds only what is missing."
            },
            {
                "title": "Supplier invoice and payment",
                "text": "When the supplier bills you, enter the Supplier invoice # and amount (the order becomes Invoiced) and attach the supplier’s invoice (PDF or photo). Mark it paid when you pay. Job costing counts what was delivered or invoiced as spent and the rest of a sent order as ordered (committed)."
            },
            {
                "title": "More about each supplier",
                "text": "Open a supplier to add the contact person, payment terms, delivery lead time and website, and tap the star to make it a preferred supplier. [[Archive this supplier]] hides it instead of deleting it: orders already made keep its details, and [[Show archived]] brings it back."
            },
            {
                "title": "Supplier catalogue (Premium)",
                "text": "In a supplier, open [[Catalogue]] and add what it sells: SKU, name, unit, price and a product link. Every price change is remembered: a small history, an up or down badge with the percent, and [[Price changed]] to list only the big ones. Link an item to your price book to compare suppliers."
            },
            {
                "title": "Import a price list (Premium)",
                "text": "In a supplier, open [[Price list]] and choose a CSV file (columns like SKU, Description, Unit, Price). You review every row first: new prices with the old one and the percent (big changes in colour), items that match your price book, and rows that matched nothing. Untick what you don’t want, then click [[Apply]]. Nothing changes until you do."
            },
            {
                "title": "Suggested supplier and prices (Premium)",
                "text": "In [[Create reorder POs]], a group with no saved supplier shows a suggestion: the price book item’s preferred supplier, else the cheapest one in your catalogues; [[Use]] picks it. Lines show that supplier’s own price. On a purchase order, picking a saved supplier fills the unit, price and SKU of matching lines from its catalogue. You can change every line."
            }
        ],
        "tips": [
            "Purchase orders, [[Share]] and [[Record delivery]] work on every plan. [[Send to supplier]] and reorder POs are part of Premium.",
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
            },
            {
                "title": "Product link and specs",
                "text": "In an item, [[Product]] holds a link to the supplier’s page and a short list of specs (size, color, model…). They are for you: they don’t print on documents."
            },
            {
                "title": "Preferred supplier and cheapest price (Premium)",
                "text": "Pick a Preferred supplier on an item. When your suppliers’ catalogues list it, you see the cheapest known price, [[Use as my cost]] to copy it, and what a different supplier cost does to your margin."
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
                "title": "See your tasks",
                "text": "With job tasks switched on, the Schedule also marks the days your open tasks are due (a small diamond; red when late), under each day in the Week view, and under Tasks in the List view. Tap one to open that job’s Tasks."
            },
            {
                "title": "See your leads",
                "text": "With leads switched on, the Schedule also shows the days you planned to follow up with a lead and your booked appointments (a small blue marker on the day; red when a follow-up is late), under each day in the Week view and under Leads in the List view. Tap one to open the lead."
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
        "id": "crew",
        "title": "Crew clock-in links",
        "summary": "Your workers clock in and out of their jobs from their own phones with a private link: no app, no login, no seat fee. Their hours become time sheets.",
        "where": [
            "Tools",
            "Crew"
        ],
        "appPath": "/crew",
        "steps": [
            {
                "title": "Add your crew",
                "text": "Open [[Tools]] and choose [[Crew]] (on a phone: [[More]], then [[Crew]]). Click [[Add crew member]], type the name (phone, email and hourly cost are optional), tick the jobs they work on, then [[Add and get link]]."
            },
            {
                "title": "Send the link",
                "text": "[[Copy link]], [[Text it]] or [[Email it]], or let them scan the QR code. The link only works for the jobs you gave them. On a job page, the [[Crew]] tab adds people to that job ([[Add to job]] or [[New crew member]])."
            },
            {
                "title": "What your worker sees",
                "text": "Today’s jobs with a big [[Clock in]] button, then [[Clock out]] and [[Start break]] / [[End break]]; [[Switch here]] moves them to another job. They can add a note or a photo. No prices, no rates, no other workers."
            },
            {
                "title": "Tasks on the link",
                "text": "If you give a worker tasks (job page › [[Tasks]], choose them in Who), their link also lists [[My tasks]]: the job, address, due day and notes, with [[Start]] and [[Done]], an optional photo and a short comment. You see the photo and comments in the task."
            },
            {
                "title": "Location, only at the tap",
                "text": "The first time, the page asks “Save your location when you tap?”. With [[Allow location]], one reading is saved with each punch, never in between. With [[Not now]] (or no signal) the punch is still saved and marked No location."
            },
            {
                "title": "Far from the job",
                "text": "On the job’s [[Crew]] tab, click [[Set pin]] and choose [[Use my location (I’m at the site)]] or paste a map link. Punches farther than the distance you pick show “Far from job”."
            },
            {
                "title": "Check the week",
                "text": "[[Crew]] › [[Hours]] shows each worker’s week as a time card (jobs × days), with overtime and their cost. Shifts that need a look are flagged; click [[Add clock-out]] or [[Edit]] to fix one, or [[Add a shift]] for a forgotten day. Then [[Approve week]]."
            },
            {
                "title": "Turn hours into time sheets",
                "text": "Click [[Create time sheet]]: one Time Sheet per job is saved on the job, so Financials, job costing and [[Bill time & materials]] count the hours. After fixing a shift, [[Update time sheet]] rewrites the same sheet."
            },
            {
                "title": "Change or stop a link",
                "text": "[[Share link]] on a crew member opens the link. [[New link]] replaces it (the old one stops at once); [[Turn off link]] stops it. [[Archive]] someone who left: their hours stay."
            }
        ],
        "tips": [
            "Offline: punches are saved on the worker’s phone and sent in order when the connection is back.",
            "Missed clock-outs show in the bell at the end of the day (Settings › Notifications › Missed clock-outs).",
            "Crew clock-in links are part of Premium, with as many workers as you need."
        ]
    },
    {
        "id": "notifications",
        "title": "Notifications (the bell)",
        "summary": "One list of what happened while you were busy: signatures, payments, overdue invoices, low stock, quote requests and Community replies.",
        "where": [
            "Top bar",
            "Bell"
        ],
        "appPath": "/settings#notifications",
        "steps": [
            {
                "title": "Open the bell",
                "text": "Click the bell at the top, next to your avatar (on a phone too). The red number is how many you haven’t read; the list is split into Today and Earlier."
            },
            {
                "title": "What shows up",
                "text": "A client signs, approves or declines a document (and the option they chose), a client taps “I’ve paid”, an invoice becomes overdue, an estimate expires within 3 days, a new quote request, an item runs low or out of stock, a supplier confirms or can’t fill a purchase order or an order is received, likes, comments and replies in the Community, reminder emails sent or not sent, Gmail that needs reconnecting, a document saved offline that couldn’t sync, and plan limits."
            },
            {
                "title": "Open or clear",
                "text": "Tap a notification to open the document, item, post or request. The × removes one from the list; [[Mark all read]] clears the count."
            },
            {
                "title": "Choose what you get",
                "text": "At the bottom of the list, [[Notification settings]] opens Settings › Notifications: switch each type on or off, turn on Quiet mode (no pop-ups, a dot instead of a number), or Pop-up notifications on this device (off by default; your browser asks for permission)."
            }
        ],
        "tips": [
            "Read and removed notifications follow your account to every device. Nothing is emailed.",
            "The list checks for news every few minutes while the app is open, and right away when you open the bell.",
            "The Clients, Tools and Community badges still work as before.",
            "The rules in Settings › Automations (overdue tasks, lead follow-ups, client answers, drafts made for you) add their notes here too; the Automation rules switch turns them all off."
        ]
    },
    {
        "id": "automations",
        "title": "Automations",
        "summary": "Rules that follow up for you: they tell you what needs you, or make a draft that you check and send yourself.",
        "where": [
            "Account menu",
            "Settings",
            "Automations"
        ],
        "appPath": "/settings#automations",
        "steps": [
            {
                "title": "Open the list",
                "text": "Open Settings and find Automations. The rules are grouped as Money, Jobs, Leads & clients and Stock & supplies. Each row says what happens when something happens, and has an on/off switch."
            },
            {
                "title": "Switch what you want",
                "text": "The switches for reminder emails and for bell notes (overdue invoices, low stock, papers about to expire…) are the same settings you already had in Reminders and Notifications: changing one here changes it there too. The new rules start as shown (most are on, [[Estimate with no answer]] is off); change any of them."
            },
            {
                "title": "Tell me, or do it for me",
                "text": "[[Estimate approved, invoice next]] and [[Job completed, warranty next]] can make a draft instead of only telling you. Choose [[Just tell me]] or [[Do it for me]] (Premium). A draft is a normal Draft document: tap its note in the bell, check it, change it and send it yourself. A rule never sends, signs or bills anything."
            },
            {
                "title": "Only new things, never twice",
                "text": "[[Do it for me]] starts the moment you choose it: it never makes drafts for estimates approved or jobs completed before that, and never makes a second one for the same estimate or job. If you already converted the estimate yourself, it leaves it alone."
            },
            {
                "title": "Pick how long to wait",
                "text": "For [[Estimate with no answer]] choose 3 days, 7 days or 14 days. It tells you once per estimate, so you can call the client."
            },
            {
                "title": "Find the notes",
                "text": "Notes from these rules show in the bell, once each (what you read or remove stays gone on every device). In Settings, Notifications, the Automation rules switch turns them all off at once. Rules for tools that are not switched on for your account yet (tasks, leads, client questions) are not listed."
            }
        ],
        "tips": [
            "Free keeps every “just tell me” rule. Drafts made for you are part of Premium.",
            "Reminder emails still go from your own Gmail, on the schedule you set in Reminders ([[Days and wording]]).",
            "Always on: receiving a purchase order adds its items to your stock, and stock moves when an invoice is paid or an estimate is accepted."
        ]
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
            "Premium is $5/month and Premium + AI $10/month. Yearly billing saves two months.",
            "Where AI credits are offered, Plan & billing also has an AI credits line: your balance, [[Buy credits]] ($5, $10, $20 or $50) and [[Automatic top-up]]."
        ]
    }
];
