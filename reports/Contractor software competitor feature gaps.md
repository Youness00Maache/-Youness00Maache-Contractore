# Close the gap between documents and dollars

ContractorDocs already matches or beats its biggest rivals on the paperwork itself, at a fraction of their price. What it lacks is the layer that turns paperwork into money and new work. The market leaders are Procore and ServiceTitan at the large-company end, Jobber, Housecall Pro and Buildertrend in the small and mid-size market, and CompanyCam plus the roofing CRMs in their niches. They win small customers with automatic reminders and follow-ups, a pay button that marks invoices paid by itself, online request forms, job photo timelines, good/better/best options and job costing, and most of them lock these features behind tiers that cost **$99–$300 a month**. ContractorDocs has 12 document types, change orders, purchase orders, QR inventory, e-signed approvals, receipt OCR and a multi-step AI assistant for **$0–$10 a month**. But its payments are a pasted link with no automatic "paid" status, its emails go out only when someone presses send, and nothing captures a lead before it becomes a client. The ten builds below close most of that gap, and most of them reuse things the app already has: Gmail refresh tokens stored on the server, pg_cron for timed jobs, the client portal and approval links, the price book, and the AI assistant. The big-company features should be skipped, linked out or shrunk to a template: voice AI receptionists, aerial measurements, distributor catalogs, RFIs and submittals, full Gantt charts and fleet GPS. One caution applies throughout. No neutral survey ranks features for solo contractors, and most evidence about what customers value comes from vendors or from review roundups written by competitors. These priorities therefore rest on several sources pointing the same way, not on one decisive study.

## Ten builds would close most of the gap

The ranking weighs three things. First, how consistently competitors and reviewers treat a feature as a reason to buy or stay. Second, how directly it brings in money for a business of one to ten people. Third, how cheaply it can be built on the current app. Effort uses a rough scale for one developer who knows the codebase: **XS** is a day or two, **S** about a week, **M** two to four weeks, **L** one to three months. These sizes come from the research notes and a light look at the repository, not from a code-level estimate.

| # | Build | The ContractorDocs version | Impact | Effort | Plan | When |
|---|---|---|---|---|---|---|
| 1 | Automatic reminders and follow-ups | Overdue-invoice reminders, estimate follow-ups and visit reminders sent on a schedule from the user's own Gmail. They stop by themselves on approval or payment. AI writes the wording on the top plan | High | S–M | Free (counts toward email cap); unlimited on Premium; AI wording on Premium+AI | Now |
| 2 | A real "Pay now" button | Contractor links their own Stripe account; deposit, progress and balance amounts become pay buttons in the portal, email and a PDF QR code; a webhook marks the invoice paid | Highest | M | All plans | Now |
| 3 | Request-a-quote link and QR code | Public mobile form for the truck, yard sign or Google profile. It creates a temporary client and a draft job, and AI replies within minutes and drafts an estimate from the photos and price book | High | S–M | Free (branded); Premium unbranded; AI reply on Premium+AI | Now |
| 4 | Job photo timeline | Per-job photo stream tagged before/during/after, simple markup, one-tap before/after photo report, shared in the portal; AI walkthrough turns voice plus photos into a daily report or punch list | High | M | Free (storage cap); more on Premium; AI on Premium+AI | Now → Next |
| 5 | Good/better/best estimates | Up to three options built from price-book kits or by AI; client compares on a phone and signs one; the chosen option feeds the deposit, work order and invoice | High | M | Premium; AI-built options on Premium+AI | Next |
| 6 | Job budget vs actual, plus T&M billing | Budget = approved estimate + change orders; actual = POs, expenses, receipts, material logs and time sheets; an alert fires when costs outrun % complete; one tap turns unbilled time and materials into an invoice | High (teams) | M | Premium | Next |
| 7 | Text and WhatsApp from the contractor's own phone | Buttons that open the phone's own messaging app with the message and portal link filled in, so there is no SMS bill | Medium | XS | Free | Now |
| 8 | Review request after payment | One email or text with the contractor's Google review link when the invoice is paid | Medium | S | Premium | Now (after #2) |
| 9 | Pipeline board | Kanban over existing jobs. Cards move by themselves as document status changes (request → estimate sent → approved → invoiced → paid), with stale badges and one-tap follow-up | Medium | S | Free | Next |
| 10 | Crew clock-in links | A personal link per worker with no seat fee and a big clock in/out button. Location is stamped only at the punch, the punches fill the existing time sheet and feed job costing, and they queue offline | Medium–High (teams) | M–L | Premium | Next |

Just below the cut line are six more: offline drafting for field documents, recurring service plans, a "papers" vault with insurance and permit expiry reminders and lien-waiver templates, punch lists, a bookkeeper export that leads later to QuickBooks/Xero sync, and a financing link on large estimates. Throughout this report, **(vendor claim)** marks a number published by the company that sells the product. **(competitor-written)** marks a review or analysis published by a rival vendor. **(aggregator)** marks SEO or comparison sites, whose figures often conflict.

## Two public giants and a $29–$500 middle leave solo contractors underserved

At the large-company end, the market has two public anchors. **Procore**, the commercial construction platform, reported **$1.32B revenue in FY2025** from 17,850 customers, of which 2,710 pay more than $100K a year ([Procore](https://procore.com/press/procore-announces-fourth-quarter-and-full-year-2025-financial-results)). **ServiceTitan**, the anchor for big residential trade shops, reported **$961M revenue** for the year to January 2026 from about 10,800 customers and **$82.1B in payment volume** ([ServiceTitan](https://investors.servicetitan.com/news-releases/news-release-details/servicetitan-announces-fiscal-fourth-quarter-and-full-fiscal)). That works out to roughly $89K of revenue per customer, which shows who it serves. Further down the market, Jobber (100,000+ customers) and Housecall Pro ("200K+ pros") lead by headcount among small home-service firms (both vendor claims) ([Jobber release](https://hrtechedge.com/?p=52528); [PM Magazine](https://www.pmmag.com/articles/107237-housecall-pro-unveils-platform-upgrades)). Buildertrend says 20,000+ builders use it (vendor claim) ([Buildertrend release](https://www.financialcontent.com/article/newsfile-2026-9-29-buildertrend-expands-platform-with-ai-and-financial-tools-to-support-high-volume-and-complex-construction)). Roofing software drew big money. Verisk agreed to pay **$2.35B for AccuLynx**, then ended the deal in December 2025 after the FTC review missed its deadline, and AccuLynx disputes the termination ([Roofing Contractor](https://www.roofingcontractor.com/articles/101114-verisk-to-acquire-acculynx-in-235b-deal); [Business Insurance](https://www.businessinsurance.com/verisk-pulls-plug-on-2-4-billion-acculynx-deal/)). North American construction software passed **$4B in revenue in 2025** and is growing 9%+ a year ([Baird](https://www.rwbaird.com/corporations-and-institutions/investment-banking/insights/2025/10/the-durable-growth-opportunity-in-construction-software/)), with more than 10 major acquisitions since 2024 ([Verdantix](https://research.verdantix.com/insights/press-release/verdantix-green-quadrant-highlights-surge-in-construction-management-software-adoption-amid-profit-margin-pressures-and-tariff-hikes)). Autodesk Construction Cloud is a large commercial player too, but Autodesk does not report its numbers separately.

The money in this market is moving into payments and AI. Buildertrend launched Bill Pay in February 2026 and bought agentic-AI startup BizJet AI in July 2026 ([Bill Pay](https://buildertrend.com/press-releases/construction-bill-pay-launch-ibs-2026/); [BizJet](https://buildertrend.com/press-releases/buildertrend-acquires-bizjet-ai/)). CompanyCam bought the construction fintech Beam in March 2026 ([Silicon Prairie News](https://siliconprairienews.com/2026/03/companycam-acquires-california-construction-fintech-startup-beam/)). Procore built Datagrid's AI agents into its platform ([Procore](https://www.procore.com/blog/inside-procores-2025-innovation-summit-and-the-future-of-connected-construction)).

| Vendor | Who it serves | Size signal | Price, 2025–2026 | Why small teams struggle |
|---|---|---|---|---|
| Procore | Commercial GCs and subs | $1.32B revenue, 17,850 customers | Quote-only, priced on annual construction volume, unlimited users; third-party estimates run from ~$4,500/yr under $2M volume to $15K–$30K/yr (competitor-written, conflicting) ([OneCrew](https://www.getonecrew.com/post/procore-pricing)) | Reviewers say it is "too expensive for a small contractor" and "a sledgehammer for smaller projects", and that it feels heavy ([Capterra](https://www.capterra.com/p/56250/Procore/reviews/?page=3)) |
| ServiceTitan | Large HVAC, plumbing and electrical shops | $961M revenue, ~10,800 customers | Quote-only, per technician; users report $245–$500 per tech per month, $5K–$50K implementation and a 12-month minimum ([ContractorToolStack](https://contractortoolstack.com/reports/contractor-software-pricing-2026/)) | Shops under ~5 techs find it "too expensive and complex" (competitor-written) ([ServiceAgent](https://serviceagent.ai/blogs/servicetitan-pricing-explained/)); annual contracts; 2–12-month rollouts ([OneCrew](https://www.getonecrew.com/post/servicetitan-reviews)) |
| Buildertrend | Residential builders and remodelers | 20,000+ builders (vendor claim) | Quote-only; third parties estimate $339–$1,099/mo; a 20-person builder was quoted $9K–$14K/yr (competitor-written) ([Connecteam](https://connecteam.com/reviews/buildertrend/)) | Steep learning curve; "not your friend unless your volume exceeds two million dollars"; hard to export data; no free trial ([Connecteam](https://connecteam.com/reviews/buildertrend/)) |
| Jobber | Home-service firms, 1–15 users | 100,000+ customers (vendor claim) | Core $29–$49/mo for 1 user; Connect $99–$139; Grow $149–$199; Plus $399–$499 for 5 users; extra users $29 each ([Jobber pricing](https://www.getjobber.com/pricing/)) | Per-user cost "became absurd" around 8 staff; QuickBooks sync drops transactions; weak reports (competitor-written roundup quoting users) ([FieldCamp](https://fieldcamp.ai/reviews/jobber)) |
| Housecall Pro | Home-service firms | "200K+ pros" (vendor claim) | Basic $59–$79 (1 user), Essentials $149–$189 (5), MAX $299–$329 (8), extra users $35; add-on prices not published ([HCP pricing](https://www.housecallpro.com/pricing/)) | Capterra attributes 61% of 195 negative reviews to bugs; technicians can see revenue ([Capterra](https://www.capterra.com/p/140363/HouseCall-Pro/)) |
| JobTread | Residential builders and remodelers | G2 5.0 from 85 reviews ([G2](https://www.g2.com/compare/buildertrend-vs-jobtread)) | $199/mo + $20 per extra user; every feature in one plan ([JobTread](https://www.jobtread.com/pricing)) | $199 floor and no free trial |
| Contractor Foreman | Small GCs wanting all-in-one | 92% positive of 835 Capterra reviews, 99% from small firms ([Capterra](https://www.capterra.com/p/166113/Contractor-Foreman/reviews/?page=5)) | $49/mo for 1 user up to $332–$399 for unlimited users ([CF pricing](https://www.contractorforeman.com/pricing)) | Slow; time cards "needlessly complicated"; daily logs take too many clicks; no inventory ([Capterra](https://www.capterra.com/p/166113/Contractor-Foreman/reviews/?page=16)) |
| Houzz Pro | Remodelers and designers | 4.3 from 1,160 reviews (aggregator) ([Toolradar](https://toolradar.com/tools/houzz-pro)) | ~$99–$399+/mo, sources conflict; mostly 12-month contracts ([Hook Agency](https://hookagency.com/?p=3263)) | Price and fees; slow support |
| Fieldwire, Raken | Field crews of GCs and subs | Fieldwire G2 4.5 from 531 reviews ([G2](https://g2.com/products/fieldwire-by-hilti/reviews)) | Fieldwire free for up to 5 users, then $39–$89/user ([ProjectManager](https://www.projectmanager.com/blog/what-is-fieldwire)); Raken $23–$59/user, 3-user minimum ([Raken](https://www.rakenapp.com/pricing)) | Per-user cost; one Raken review is titled "Too Expensive for Smaller Contractors" ([G2](https://www.g2.com/products/RAKEN/reviews)) |
| AccuLynx, JobNimbus, Roofr | Roofing and exterior | AccuLynx deal valued at $2.35B; JobNimbus raised $330M (2024) ([Roofing Contractor](https://roofingcontractor.com/articles/100122-sumeru-equity-partners-invests-330-million-in-jobnimbus)) | AccuLynx and JobNimbus quote-only, ~$225–$300+/mo plus seats (aggregator) ([ContractorToolStack](https://contractortoolstack.com/guides/jobnimbus-ai-features-guide/)); Roofr $0 or $209–$349/mo plus $13–$19 per measurement report ([Roofr](https://roofr.com/pricing)) | Per-user pricing "penalizes small teams" ([RSG](https://roofingsoftwareguide.com/comparisons/acculynx-vs-jobnimbus/)); texting and e-sign sold as add-ons |
| CompanyCam | Photo documentation, all trades | App Store 4.8 from ~30,000 ratings ([FieldCompare](https://fieldcompare.com/companycam-review)) | $63–$199/mo plus $29 per extra user (vendor page; reviewers' figures conflict) ([CompanyCam](https://companycam.com/pricing)) | A 10-tech shop pays ~$322/mo "for photos alone"; no scheduling ([FieldCompare](https://fieldcompare.com/companycam-review)) |
| Joist, Invoice2go | Solo estimating and invoicing | Joist: ~12.6K Google Play reviews at 4.6 ([Workyard](https://www.workyard.com/compare/joist-review)) | Joist $8–$32/mo, Run plan $58–$100 ([Joist](https://www.joist.com/pricing)); Invoice2go ~$6–$40/mo ([Capterra](https://www.capterra.com/p/81858/Invoice2go/pricing/)) | Price hikes, features moved to pricier plans, records locked after cancelling |
| Tradify, Fergus, ServiceM8 | Trades (AU/NZ/UK roots) | — | Tradify $47–$61 per user ([Tradify](https://www.tradifyhq.com/pricing)); Fergus from $53–$75 ([Fergus](https://www.fergus.com/pricing)); ServiceM8 free for 30 jobs/mo, then ~$29–$349 (aggregator) ([FieldProxy](https://www.fieldproxy.ai/fsm-software-pricing/servicem8)) | Per-user pricing; ServiceM8's inventory called "of little use" (older reviews) ([Capterra](https://capterra.com/p/110711/ServiceM8/reviews/)) |

Mid-market field-service tools (FieldEdge, simPRO, Workiz) follow the ServiceTitan pattern of hidden prices and contracts. Workiz hid its prices in May 2026 ([PricingSaaS](https://pricingsaas.com/companies/workiz/diffs/2026W22)), and simPRO is estimated at $800–$3,000 a month plus implementation ([ERPResearch](https://erpresearch.com/erp-add-ons/field-service/simpro/pricing)).

Small teams struggle with these tools for the same few reasons, and missing features is rarely one of them. Pricing that scales with headcount is the biggest. A 2026 pricing study found four comparable tools within $50 of each other at one user but **$745 a month apart at 15 users** ([ContractorToolStack](https://contractortoolstack.com/reports/contractor-software-pricing-2026/)). The second is tier-gating. The features that make a small shop more money sit two tiers up: at Jobber, QuickBooks sync and automatic follow-ups start at $99/month, while two-way texting, job costing and optional line items start at $149 ([Jobber pricing](https://www.getjobber.com/pricing/)). Housecall Pro puts service plans only on its $299 MAX plan ([HCP pricing](https://www.housecallpro.com/pricing/)). The third is contracts, onboarding and complexity at the top end. The fourth is trust at the bottom end. In Workyard's coding of about 1,400 Joist reviews, "price increases and features moved to higher plans" was the top complaint with 279 mentions, and records locked after cancelling drew 88 (competitor-written) ([Workyard](https://www.workyard.com/compare/joist-review)). An Invoice2go reviewer's annual plan jumped about 50% at renewal ([Trustpilot](https://www.trustpilot.com/review/invoice.2go.com)).

ContractorDocs sits below every useful paid tier found. Its price peers, Joist and Invoice2go, cover estimates and invoices but not the rest of the job. Its breadth peer, Contractor Foreman, starts at $49. Its free-tier peers (ServiceM8 Free, Roofr Starter, Fieldwire Basic) each cover one slice. So ContractorDocs does not need to out-feature Buildertrend. It needs the six to eight features that rivals sell in their $99–$300 tiers, built simply enough to run at $5–$10.

## Customers stay for speed, getting paid and looking professional

The evidence on "most used" is thin, so this section reads converging signals rather than usage logs. No vendor publishes feature telemetry. No neutral 2025–2026 survey ranks features for solo or small contractors. The research tools could not reach Reddit, and G2 and Capterra were read mostly through search snippets. What remains is review-mention counts, reviewer importance ratings, vendor surveys, and the choices every vendor makes about which features go on entry tiers.

| What customers value | Strongest evidence | Where the leaders put it | ContractorDocs today |
|---|---|---|---|
| Fast, professional quotes and invoices on a phone | Of ~1,400 coded Joist reviews, 328 praise ease of use, 100 the professional look and 99 fast on-site quoting (competitor-written) ([Workyard](https://www.workyard.com/compare/joist-review)); 91% of GetApp reviewers rate billing and invoicing important ([GetApp](https://www.getapp.com/operations-management-software/contractor-management/f/electronic-payments)) | Entry tier everywhere | **Has**: 12 types, 57 designs, AI drafting |
| Getting paid online, fast | Online payments were 50% of Jobber-processed transactions in Q3 2025 (vendor claim) ([Webull/Jobber](https://www.webull.com/news/13793458394055680)); "Client Hub changed how we get paid" (competitor-written) ([FieldCamp](https://fieldcamp.ai/reviews/jobber)); AI reminders get businesses paid ~5 days faster (vendor claim, 2024 beta) ([Intuit](https://www.intuit.com/blog/innovative-thinking/delivering-done-for-you)) | Payments on entry tiers; reminders at $99+ (Jobber) | **Partial**: pasted pay link, no automatic "paid", no automatic reminders |
| Client portal: approve, sign, see progress | Buildertrend's Client Updates called "Buildertrend at its best" (competitor-written) ([Connecteam](https://connecteam.com/reviews/buildertrend/)) | Mid tier | **Has** approvals and e-sign; no progress feed |
| Scheduling and juggling several jobs | 92% of GetApp reviewers rate multi-project management important, 91% scheduling ([GetApp](https://www.getapp.com/operations-management-software/contractor-management/f/electronic-payments)) | Entry tier | **Has** calendar with worker scheduling |
| Photo proof for every job | CompanyCam: 4.8 from ~30,000 App Store ratings; photos used as proof in disputed invoices ([FieldCompare](https://fieldcompare.com/companycam-review)) | $63+/mo standalone | **Partial**: photos on documents only |
| Answering leads before a rival does | 40% of AI-using pros say they respond faster and lose fewer leads (vendor survey) ([Housecall Pro](https://www.housecallpro.com/resources/ai-in-the-trades/)); every leader sells an AI receptionist | Booking on entry tiers; AI answering as paid add-ons | **Not present** (win rate only) |
| Knowing job profit while the job is running | Jobber gates job costing to Grow ($149+); Buildertrend's budget tracking is praised (competitor-written) ([Connecteam](https://connecteam.com/reviews/buildertrend/)) | Mid and upper tiers | **Partial**: profit calculator and insights |
| Crew hours without retyping | Copying hours into invoices by hand is a top reason small contractors leave Joist (competitor-written) ([Workyard](https://www.workyard.com/compare/joist-review)) | Mid tier | **Partial**: time sheet document |
| Accounting sync | Vendor guides call it non-negotiable (vendor opinion) ([Knowify](https://knowify.com/resources/best-trade-contractor-software/)) | $99–$149 tiers | **Not present** |
| Upsell options on quotes | Sales Pro users raised average ticket 20% (vendor claim) ([ServiceTitan](https://www.servicetitan.com/blog/pantheon-2025-pro-products-automation)) | Upper tiers | **Not present** |
| Commercial document control (RFIs, submittals, drawings) | Procore reviewers praise these most ([G2](https://www.g2.com/survey_responses/procore-review-4803809)) | Enterprise | **Not present**, and not needed |

AI demand points to communication and quoting, not to new modules. In Housecall Pro's 2026 survey of 248 pros, 48% use AI. Their top uses are customer communication and follow-up (52%), estimating and pricing (51%) and reporting (43%) (vendor survey) ([Housecall Pro](https://www.housecallpro.com/resources/ai-in-the-trades/)). ServiceTitan's survey of 1,000+ contractors found that **59% of AI users rely on AI built into software they already have**. Lack of training and integration problems tie as the top barrier at 44%, and ServiceTitan says its sample does not represent the whole industry ([RoofersCoffeeShop](https://www.rooferscoffeeshop.com/post/majority-of-contractors-are-already-seeing-increased-efficiency-from-ai-adoption-servicetitan-industry-report-reveals)). Both results support ContractorDocs' embedded assistant. They also suggest the next step is AI that acts on a schedule, chasing invoices and following up quotes, rather than more drafting.

ContractorDocs already wins on several features that rivals gate or lack, and the roadmap should build on those rather than replace them. A competitor-written review says Jobber's quoting has no change-order support ([FieldCamp](https://fieldcamp.ai/reviews/jobber)), and Joist keeps change orders for its $27–$32 Elite plan ([Joist](https://www.joist.com/pricing)). Tradify puts purchase orders on its $61-per-user Plus plan ([Tradify](https://www.tradifyhq.com/pricing)). Contractor Foreman reviewers say they miss inventory control ([Capterra](https://www.capterra.com/p/166113/Contractor-Foreman/reviews/6195231/)). Invoice2go keeps recurring invoices for Premium ([Invoice2go](https://invoice.2go.com/pricing/)). Roofr puts e-signatures on its $209+ plan ([Roofr](https://roofr.com/pricing)). Tradify's AI bill capture is Plus-only, and Buildertrend shipped AI Bill Capture only in September 2026 ([Buildertrend release](https://www.financialcontent.com/article/newsfile-2026-9-29-buildertrend-expands-platform-with-ai-and-financial-tools-to-support-high-volume-and-complex-construction)). JobNimbus' voice CRM agent Scout was still in closed beta in May 2026 ([ContractorToolStack](https://contractortoolstack.com/guides/jobnimbus-ai-features-guide/)). ContractorDocs ships all of these today.

## Twenty-three gaps, each shrunk to fit a one-truck business

Each gap below says what competitors offer, why customers value it, and how ContractorDocs could build a smaller version for one person or a small crew. That version should be cheap to run, work on a phone, and reuse what the app already has. A light check of the repository informed the effort calls. The Gmail edge function stores encrypted refresh tokens with offline access and refreshes them on the server (`supabase/functions/gmail/index.ts`). pg_cron already runs hourly housekeeping (`supabase/migrations/20261112000300_billing_storage_privileges.sql`). Recurring invoices come from a database function that the browser triggers after login (`services/recurringService.ts`). A job's worker is stored as a name, not a login (`components/CalendarView.tsx`).

| # | Gap | Today | Impact | Effort | Plan | When |
|---|---|---|---|---|---|---|
| 1 | Automatic reminders and follow-ups | Not present | High | S–M | Free (within email cap) / Premium / AI wording | Now |
| 2 | Online payments with automatic "paid" | Partial | Highest | M | All plans | Now |
| 3 | Consumer financing | Not present | Medium | XS → M | Premium | Now (link), Later (partner) |
| 4 | QuickBooks / Xero | Not present | Medium–High | S → L | Export on all plans; sync on Premium | Now (export), Later (sync) |
| 5 | Online request form and booking | Not present | High | S–M | Free (branded) / Premium / AI | Now |
| 6 | Good/better/best options | Not present | High | M | Premium | Next |
| 7 | Review requests | Not present | Medium | S | Premium | Now |
| 8 | Lead pipeline | Partial | Medium | S | Free | Next |
| 9 | SMS and texting | Not present | Medium | XS → L | Free (own phone); paid credits later | Now / Later |
| 10 | AI receptionist | Not present | High for phone-heavy trades, poor cost fit | L + running costs | Text-only version via #5 | Voice: do not build |
| 11 | Per-job photo timeline, AI client updates | Partial | High | M | Free (capped) / Premium / AI | Now → Next |
| 12 | Budget vs actual job costing, T&M invoices | Not present | High (teams) | M | Premium | Next |
| 13 | GPS time clock | Not present | Medium–High (teams) | M–L | Premium | Next |
| 14 | Offline create and edit | Partial | Medium | L | All plans | Next |
| 15 | Recurring service plans | Partial | Medium | S–M | Premium | Next |
| 16 | Gantt scheduling | Not present | Low–Medium | M | Premium | Later |
| 17 | Lien waivers, COI and permit tracking | Not present | Medium | S–M | Document Free; vault Premium | Next |
| 18 | Punch lists and checklists | Not present | Medium | S | Free; AI on Premium+AI | Next |
| 19 | Selections and allowances | Not present | Medium (remodelers) | M | Premium | Later |
| 20 | Measurements | Not present | Low–Medium | S / M | Calculator Free; AI read on Premium+AI | Later |
| 21 | Supplier ordering | Not present | Low–Medium | S | Premium | Next / Later |
| 22 | RFIs and submittals | Not present | Low | XS | Free template | Template only |
| 23 | Connector for ChatGPT/Claude (MCP) | Not present | Low–Medium | M | Premium+AI | Later |

### Getting paid

#### 1. Automatic reminders and follow-ups (not present)

Competitors treat chasing payments and quotes as a core paid feature. Jobber adds automated client reminders and quote and invoice follow-ups on its Connect tier ($99/month annual for one user), not its $29 Core plan ([Jobber pricing](https://www.getjobber.com/pricing/)). Housecall Pro includes invoice reminders on every plan ([HCP pricing](https://www.housecallpro.com/pricing/)), and so does Invoice2go ([Invoice2go](https://invoice.2go.com/pricing/)). JobNimbus automations send estimate follow-ups and instant texts to new leads ([ContractorToolStack](https://contractortoolstack.com/guides/jobnimbus-ai-features-guide/)). The evidence that reminders pay off comes mostly from vendors, but it is consistent. Intuit says its AI-drafted reminders get businesses paid **about 5 days faster**, based on its own 2024 beta (vendor claim) ([Intuit](https://www.intuit.com/blog/innovative-thinking/delivering-done-for-you); [Accounting Today](https://www.accountingtoday.com/news/intuit-debuts-ai-agents-for-quickbooks)). It also reports that **59% of small businesses** have invoices more than 30 days overdue, up from 47% (vendor claim; survey date unclear) ([Newsfile](https://www.newsfilecorp.com/release/260641/QuickBooks-New-AI-Agents-Explained-What-Each-One-Does-Expert-Consumers-Report)). Communication and follow-up is the top AI use in Housecall Pro's survey at 52% (vendor survey) ([Housecall Pro](https://www.housecallpro.com/resources/ai-in-the-trades/)). Do not quote the widely repeated claim that follow-ups raise quote approvals by 25%: it could not be traced to Jobber ([pipeline-marketing](https://pipeline-marketing.pages.dev/blog/jobber-setup-guide-contractors/)). Complaints carry a design lesson. Housecall Pro reviewers find its reminder settings hard to configure ([Capterra](https://www.capterra.com/p/140363/HouseCall-Pro/)), so reminders should work with sensible defaults switched on.

**The ContractorDocs version** is a "Chase" switch, on by default, for every estimate, invoice and calendar visit:

- **Estimates:** a nudge two days after sending if not yet approved, and a final one at day seven.
- **Invoices:** a friendly note three days before the due date, one on the due date, and firmer notes at +7 and +14 days. Then chasing stops and the invoice is flagged on the dashboard.
- **Visits:** a reminder the day before.

Each message goes out from the contractor's own Gmail with the portal link, plus a pay button once #2 exists. Chasing stops by itself when the client approves in the portal or the invoice is paid. A morning digest ("3 reminders go out today") lets the owner skip any message with one tap. On Premium+AI, the assistant writes each message from the client's history, makes the tone gradually firmer, and writes in the client's language using the app's 10 languages.

The building blocks exist: server-side Gmail tokens and pg_cron. New work is a reminders table and a scheduled function. Recurring invoices are only generated when someone opens the app, so that browser-triggered approach cannot be reused here.

**Impact:** High · **Effort:** S–M · **Plan:** Free, counting toward the 10 emails a month (a natural upgrade trigger); unlimited on Premium; AI wording on Premium+AI.

#### 2. Online payments that mark themselves paid (partial)

Every small-business leader collects payments inside its product, and processing fees help pay for their cheap tiers. Jobber offers card (2.9% + 30¢), ACH (1%) and Tap to Pay on all plans ([Jobber pricing](https://www.getjobber.com/pricing/)). Online payments made up **50% of Jobber-processed transactions** in Q3 2025, up 7 points (vendor claim, from a syndicated release snippet) ([Webull/Jobber](https://www.webull.com/news/13793458394055680)). Housecall Pro charges from 2.59% on every plan ([HCP pricing](https://www.housecallpro.com/pricing/)). Buildertrend charges 2.99% per card payment and $15 per client ACH (competitor-written) ([Connecteam](https://connecteam.com/reviews/buildertrend/)). Roofr keeps payments off its free plan and puts them in its $209–$249 Essentials plan ([Roofr](https://roofr.com/pricing)). ContractorDocs already calculates deposits, progress bills and balances and shows a "Pay online" button. That button opens a pasted PayPal, Stripe or Square link, though, and nothing tells the app when the money arrives.

**The ContractorDocs version** uses Stripe Connect:

- **Setup:** each contractor links their own Stripe account in a few minutes. Money goes straight to them, and ContractorDocs never holds funds.
- **Where the button appears:** the deposit, progress amount or balance the app already calculates becomes a pay button in the portal and in emails, plus a QR code on the PDF for paper invoices.
- **Approval and deposit:** approving an estimate in the portal leads straight into "approve and pay deposit".
- **After payment:** a webhook records the payment, updates amount paid and balance due, marks the invoice paid, stops reminders (#1), sends a receipt, triggers the review request (#7) and updates insights.
- **Payment methods:** offer bank transfer (ACH) as well as card, because it is far cheaper on a $10,000 remodel. Keep the pasted-link option and manual "mark as paid" for PayPal and Square users.
- **In person:** Tap to Pay needs a native app; the QR code covers in-person payment until then.

One business decision belongs to the owner. Stripe Connect allows a small platform fee per payment, which is how competitors fund cheap plans. Charging a fee only on Free would keep the low-price promise while paying for free users. If a "pass the card fee to the client" option is added, local surcharge rules need checking first (this caution is not from the research notes).

**Impact:** Highest · **Effort:** M · **Plan:** All plans, with an optional platform fee on Free.

#### 3. Consumer financing (not present)

Housecall Pro includes consumer financing on every plan ([HCP pricing](https://www.housecallpro.com/pricing/)). Jobber and Housecall Pro both embed Wisetack, which added U.S. Bank as a lender in 2025 ([Business Wire](https://www.businesswire.com/news/home/20250113439351/en)). Joist offers homeowner financing even on its cheapest plan ([Joist](https://www.joist.com/pricing)), and Roofr offers GoodLeap on its paid plans ([Roofr](https://roofr.com/pricing)). The evidence that financing pays off comes entirely from lenders and vendors. Housecall Pro cites Wisetack data that financed jobs are **4.5x the size** of other jobs, without publishing the method (vendor claim) ([Housecall Pro](https://housecallpro.com/features/consumer-financing)). Hearth reports jobs won with financing average 15%+ larger, and calls its own analysis descriptive, not causal (vendor claim) ([Hearth](https://gethearth.com/roi-of-offering-financing/)). Wisetack's contractor fee is reported at a flat 3.9% (aggregator) ([ContractorToolStack](https://contractortoolstack.com/software/wisetack/)).

**The ContractorDocs version** starts as a settings field where the contractor pastes their own Wisetack, Hearth, GoodLeap or local-lender application link. A "Pay over time — apply" button then appears on estimates and invoices above an amount the contractor chooses, in the portal and on the PDF. It works like the existing pasted pay link. Do not show monthly-payment figures in ContractorDocs itself; let the lender's page show the terms, because advertised credit terms carry disclosure rules (verify with the partner). A formal partner integration with in-portal prequalification can come later if users ask for it.

**Impact:** Medium. High for HVAC, roofing and remodeling, low for handymen. · **Effort:** XS for the link, M for a partner integration · **Plan:** Premium.

#### 4. QuickBooks and Xero (not present)

Accounting sync is a mid-tier feature almost everywhere. It starts at Jobber Connect ($99+) ([Jobber pricing](https://www.getjobber.com/pricing/)), Housecall Pro Essentials ($149+) ([HCP pricing](https://www.housecallpro.com/pricing/)) and Invoice2go Professional ([Invoice2go](https://invoice.2go.com/pricing/)). Roofr offers it only on its $299–$349 Scale plan, still in beta ([RSG](https://roofingsoftwareguide.com/reviews/roofr-review/)). Tradify and Fergus include it on all plans ([Tradify](https://www.tradifyhq.com/pricing)). Vendor guides call it non-negotiable, and QuickBooks is said to hold about 62% of the accounting market, though that figure comes from a vendor blog quoting a weak source ([Knowify](https://knowify.com/resources/best-trade-contractor-software/)). Where rivals do offer sync, reliability is the complaint. A roundup quotes a Jobber user: "QuickBooks sync drops transactions. We've had to manually reconcile every week" (competitor-written) ([FieldCamp](https://fieldcamp.ai/reviews/jobber)). Knowify's sync is described as one-way ([Fervor Studio](https://fervorstudio.ca/news/knowify-review-pricing-alternatives/)). ContractorDocs has only a CSV import for clients.

**The ContractorDocs version** comes in two steps. **Now:** a "Send to my bookkeeper" export. On the first of each month, an email from the contractor's Gmail carries a ZIP of invoice and receipt PDFs plus CSVs of invoices, payments and expenses (with the receipt-OCR fields), laid out so QuickBooks Online and Xero can import them. **Later:** a one-way push to QuickBooks Online, then Xero, covering customers, invoices, payments and expenses. It would show a visible sync log and a retry button, so it is built for reliability, the very thing rivals get wrong. Production approval from Intuit and Xero adds calendar time.

**Impact:** Medium–High for anyone with a bookkeeper · **Effort:** S for the export, L for sync · **Plan:** Export on all plans; the automatic monthly email and sync on Premium.

### Winning work

#### 5. Online request form and booking (not present)

Online booking is an entry-tier feature at Jobber Core and every Housecall Pro plan ([Jobber pricing](https://www.getjobber.com/pricing/); [HCP pricing](https://www.housecallpro.com/pricing/)). Roofr sells an "Instant Estimator" website widget as a **$125–$149/month add-on** ([Roofr](https://roofr.com/pricing)). Its case studies claim Maven Roofing closes 25% of the leads it brings in, and that another roofer closes about 75% of them "when he follows up" (vendor claims, mixed metrics) ([Roofr case study](https://roofr.com/case-studies/amanda-veinott); [Roofr case study](https://roofr.com/case-studies/jesse-schreuder)). In the same masterclass, Maven's owner called the lift a "small amount of differential" ([Roofr masterclass](https://roofr.com/masterclass/instant-estimator-and-lead-tracking-with-amanda-veinott)). The stronger signal is that every vendor now competes on how fast leads get answered. Housecall Pro's survey says 40% of AI users lose fewer leads, and 53% of homeowners are comfortable with AI handling the first inquiry (vendor surveys) ([Housecall Pro](https://www.housecallpro.com/resources/ai-in-the-trades/)). Jobber AI now turns a request into a drafted quote (vendor claim) ([Jobber updates](https://productupdates.getjobber.com/111090-quote-faster-and-win-more-work-with-new-automations)).

**The ContractorDocs version** is a public "Request a quote" page per business, in the visitor's language:

- **The form:** a short mobile form with name, contact, address, job type (taken from price-book categories), description, photos and preferred days.
- **What happens on submit:** it creates a **temporary client** and a draft job, and alerts the contractor.
- **Instant reply:** a reply goes out within a minute from the contractor's Gmail.
- **On Premium+AI:** the assistant reads the request and photos, asks one clarifying question or offers visit slots from the calendar (the double-booking check already exists), and drafts an estimate from the price book. The contractor reviews that draft; prices are never sent automatically.
- **Sharing:** the existing QR generator prints the link for truck magnets, yard signs and business cards, and the plain link goes on the Google Business Profile and Facebook.
- **Protection:** a bot check and rate limiting keep out spam.

Whether request leads count toward Free's 15 new clients a month is a pricing call. Counting them only when converted encourages use.

**Impact:** High · **Effort:** S–M · **Plan:** Free with a "Powered by ContractorDocs" footer (a growth loop); Premium removes branding; AI reply and draft estimate on Premium+AI.

#### 6. Good/better/best options (not present)

Option quoting sits in upper tiers:

- **Jobber:** optional line items start at Grow ($149–$199/month for one user) ([Jobber pricing](https://www.getjobber.com/pricing/)).
- **Housecall Pro:** its proposal tool is on MAX ([HCP pricing](https://www.housecallpro.com/pricing/)).
- **Tradify:** quote options start at Pro ([Tradify](https://www.tradifyhq.com/pricing)).
- **Roofr:** good/better/best templates with material photos, warranty text, financing and e-signature, which a review publisher says users credit with higher close rates ([RSG](https://roofingsoftwareguide.com/reviews/roofr-review/)).
- **AccuLynx:** added good/better/best pricing to its Smart Docs in its Spring 2026 release ([AccuLynx](https://acculynx.com/spring-2026-product-updates/)).

ServiceTitan says Sales Pro users raised average ticket by 20% (vendor claim) ([ServiceTitan](https://www.servicetitan.com/blog/pantheon-2025-pro-products-automation)).

**The ContractorDocs version** adds an "Add options" button to the estimate. It copies the lines into Option A, B and C, renamed Good, Better and Best by default. Each option can be filled from a price-book kit in one tap, and on Premium+AI the assistant proposes three options such as repair, replace and premium replace. In the portal the client swipes through option cards on a phone, with photos, warranty differences, price and deposit. They tap one and sign, and the chosen option becomes the estimate. The deposit pay button (#2), work order and invoice then follow from it. The PDF gets a one-page comparison cover before the chosen option's detail. Insights then show which tier wins most often. The same option engine later powers selections (#19).

**Impact:** High; it raises ticket size without adding leads · **Effort:** M, mostly portal UI and the PDF cover across designs · **Plan:** Premium; AI-built options on Premium+AI.

#### 7. Review requests (not present)

Review requests are sold as a premium feature everywhere:

- **Housecall Pro:** review management on all plans ([HCP pricing](https://www.housecallpro.com/pricing/)).
- **Jobber:** reviews come with its $99/month Marketing Suite ([Jobber pricing](https://www.getjobber.com/pricing/)).
- **Joist:** Joist Reviews only on Elite ([Joist](https://www.joist.com/pricing)).
- **CompanyCam:** review requests inside a $79–$99 Marketing Suite ([CompanyCam](https://companycam.com/pricing)).

Independent evidence on the payoff is missing. The case rests on vendors consistently pricing this as a premium feature, and on how much local search matters to small trades.

**The ContractorDocs version** asks the contractor to paste their Google review link once. A day after an invoice is paid (automatic once #2 ships) or a job is marked complete, one short thank-you goes out by Gmail, or by text via #9. It includes the review link and a finished-job photo from #4. One reminder at most follows. Send the same request to every customer. Filtering out unhappy customers before showing the Google link ("review gating") conflicts with Google's review policies; check the current wording before shipping (not from the research notes). The client record notes that a review was requested. Free users get a manual "Ask for a review" button.

**Impact:** Medium · **Effort:** S · **Plan:** Premium (manual button on Free); AI-personalized wording on Premium+AI.

#### 8. Lead pipeline (partial)

Roofr includes a basic kanban job board even on its free Starter plan and seven boards on Scale ([Roofr](https://roofr.com/pricing)). JobNimbus is built around job boards ([ContractorToolStack](https://contractortoolstack.com/guides/jobnimbus-ai-features-guide/)). Jobber sells Pipeline as a $49/month add-on ([Jobber pricing](https://www.getjobber.com/pricing/)). ContractorDocs already shows estimate win rate and pending pipeline value in insights, but it has no board.

**The ContractorDocs version** is a board view of existing jobs, with no new data entry. Its columns are: New request (#5) → Visit booked → Estimate sent → Approved → In progress → Invoiced → Paid. Cards move by themselves as document status changes. A "Move to" menu covers manual moves, since dragging on a phone is fiddly. Column totals show pipeline value. A "stale" badge appears after seven quiet days, with a one-tap follow-up that reuses #1. A portal decline asks for a lost reason, which improves the win-rate insight.

**Impact:** Medium; it ties #1, #2 and #5 together visually · **Effort:** S · **Plan:** Free.

#### 9. SMS and texting (not present)

Two-way texting is expensive at every vendor:

- **Jobber:** starts at Grow, $149+ ([Jobber pricing](https://www.getjobber.com/pricing/)).
- **Fergus:** $15 per 100 texts ([Fergus](https://www.fergus.com/pricing)).
- **Roofr:** SMS is a $49 add-on ([Roofr](https://roofr.com/pricing)).
- **JobNimbus:** its Engage texting add-on costs $49–$249/month ([ContractorToolStack](https://contractortoolstack.com/guides/jobnimbus-ai-features-guide/)).
- **Housecall Pro:** its Basic plan offers only "quotes by text" ([HCP pricing](https://www.housecallpro.com/pricing/)).

The research found no direct complaints from solo users about missing SMS. The case for it rests on vendor tiering and on communication being the top AI use.

**The ContractorDocs version** follows the same idea as sending from the contractor's own Gmail. **Now:** "Text it" and "WhatsApp it" buttons open the phone's own messaging app with the message and portal link already filled in, using `sms:` links, WhatsApp share links and the browser's share sheet. That costs nothing and comes from the contractor's real number, and WhatsApp suits the app's non-US users across its 10 languages. The document timeline records "texted on [date]". **Later, only if users ask:** automated SMS as prepaid credits for reminders and "on my way" texts. US business texting needs carrier registration (10DLC), number fees and opt-out handling, so price these credits at cost (verify the current carrier rules).

**Impact:** Medium · **Effort:** XS now; L for automated SMS · **Plan:** Free now; paid credits later.

#### 10. AI receptionist (not present)

This is the most-marketed AI feature of 2025–2026, and every leader sells it as a paid add-on:

| Vendor | Product | Price |
|---|---|---|
| Jobber | Receptionist (generally available August 2025) | $29/month add-on ([Jobber pricing](https://www.getjobber.com/pricing/)) |
| Housecall Pro | CSR AI | Unpriced add-on ([HCP pricing](https://www.housecallpro.com/pricing/)) |
| ServiceTitan | Virtual Agents | Add-on ([ServiceTitan](https://www.servicetitan.com/blog/pantheon-2025-pro-products-automation)) |
| Roofr | AI receptionist (beta) | About $85–$99 ([Roofr](https://roofr.com/pricing)) |
| Joist | AI receptionist | From $49/month ([Joist](https://www.joist.com/pricing)) |
| JobNimbus | AssistAI | $0.15 per minute ([ContractorToolStack](https://contractortoolstack.com/guides/jobnimbus-ai-features-guide/)) |

Vendors report strong results. Housecall Pro says callers who engage rose from 15–20% with voicemail to 60–70% with CSR AI (vendor claim) ([Housecall Pro](https://www.housecallpro.com/resources/ai-in-the-trades/)). ServiceTitan claims a 10% higher booking rate (vendor claim). Independent reception is lukewarm: one competitor-written review scores Jobber's version 6.5/10, "promising but new" ([FieldCamp](https://fieldcamp.ai/reviews/jobber)), and another reviewer says older clients may find the voice robotic ([Stork.ai](https://www.stork.ai/en/jobber-ai-receptionist)).

**The ContractorDocs version** leaves voice out. Telephony costs per minute, and rivals charge $29–$200 a month for it, which cannot fit inside a $10 plan. Instead, an "AI front desk for written requests" is built into #5. It answers request-form submissions within a minute, asks the one question needed to price the job, offers open calendar slots and creates the draft job. Answering ordinary inbound emails would need a broader Gmail permission than sending, and Google reviews that more strictly, so start with form replies only. Revisit voice as a partner or reseller add-on if phone-heavy trades such as plumbing, locksmithing and garage doors ask for it.

**Impact:** High for phone-heavy trades, but a poor fit on cost · **Effort:** L plus running costs for voice; covered by #5 for text · **Plan:** Text version on Premium+AI; no voice now.

### Running the job

#### 11. Per-job photo timeline and AI client updates (partial)

CompanyCam built a funded standalone category on this. It holds **4.8 stars from about 30,000 App Store ratings**. Photos are timestamped, GPS-tagged and "file themselves under the project", capture works offline, and reviewers use before/after photos as proof in disputed invoices ([FieldCompare](https://fieldcompare.com/companycam-review)). A Capterra reviewer called its AI Walkthrough, which turns narration and photos into a document, the best feature they had "yet to see in a project management application" ([Capterra](https://www.capterra.com/p/171143/CompanyCam/reviews/)). It costs $63+/month plus $29 per extra user, about **$322/month for a 10-tech shop "for photos alone"** ([FieldCompare](https://fieldcompare.com/companycam-review)). Client updates built on photos are a second praised use. Buildertrend's Client Updates are called "Buildertrend at its best" (competitor-written) ([Connecteam](https://connecteam.com/reviews/buildertrend/)). Buildertrend claims "97% faster" AI client updates (vendor headline) ([Buildertrend](https://buildertrend.com/press-releases/buildertrend-launches-ai-tool-for-97-faster-client-updates/)), and Houzz Pro drafts updates from project photos ([Houzz](https://pro.houzz.com/pro-learn/blog/houzz-ai-knows-how-you-build)). ContractorDocs can attach photos to documents and add site photos to the daily job report. It has no per-job photo stream, no markup and no before/after pairing.

**The ContractorDocs version** adds a "Photos" tab on every job:

- **Capture:** a camera button takes several shots in a row. Each photo is stamped with time, optional location and a stage chip (Before, During, After or Issue), and compressed on the device to keep storage cheap.
- **Markup:** arrow, circle, text and blur.
- **Before/after:** pairs are shown side by side, and a one-tap "Photo report" PDF uses the existing PDF engine.
- **Sharing:** a per-photo "show in portal" switch.
- **On Premium+AI, walkthrough:** record your voice while taking photos, and the assistant drafts a daily job report, punch list (#18) or change order with the photos placed in it. This extends the existing voice dictation.
- **On Premium+AI, client update:** "Send today's update" turns today's photos and report into a three-sentence update. The contractor approves it, and it goes to the portal and by Gmail.

**Impact:** High; it protects against disputes, helps crews adopt the app and differentiates in the portal · **Effort:** M · **Plan:** Free with a storage cap; larger cap on Premium; walkthrough and AI updates on Premium+AI.

#### 12. Budget vs actual job costing and T&M invoices (not present)

Buildertrend's Job Costing Budget tracks original, revised, committed, actual and projected costs, and its change orders and budgets are "well integrated" (competitor-written) ([Connecteam](https://connecteam.com/reviews/buildertrend/)). Jobber puts job costing on Grow ($149+) and profit alerts on Plus ([Jobber pricing](https://www.getjobber.com/pricing/)). A JobTread reviewer says it helped their firm produce jobs "with higher profitability" ([Capterra](https://capterra.com/p/218503/JobTread/reviews/?page=4)). On the billing side, copying hours into invoices by hand is a top reason small contractors leave Joist (competitor-written) ([Workyard](https://www.workyard.com/compare/joist-review)), and Knowify is built around time-and-materials billing ([Knowify](https://knowify.com/resources/aia-contracts-and-invoicing/)). ContractorDocs already holds every input: estimates, change orders, POs, expense logs, OCR'd receipts, material logs, time sheets, and progress billing with % complete per line. It is missing only the roll-up.

**The ContractorDocs version** is a "Job money" card on every job:

- **Budget:** the approved estimate plus approved change orders.
- **Cost so far:** POs, expenses, receipts, material logs at cost, and time-sheet hours times each worker's cost rate.
- **Billed and collected:** invoiced amounts and payments received.
- **Grouping:** labor, materials, subs and other. There are no cost codes to learn.
- **Alert:** % complete comes from the progress-billing percentages. When costs reach 85% of budget on a job that is 60% complete, the morning digest raises it.
- **Bill T&M:** a button gathers unbilled time and material entries for a date range, applies the price-book markup, drafts an invoice and marks those entries billed.
- **On Premium+AI:** the assistant answers "why is this job over budget?"

A light search found no existing time-to-invoice conversion; confirm this in the code.

**Impact:** High for remodelers and crews, medium for solo service work · **Effort:** M · **Plan:** Premium; AI explanations on Premium+AI.

#### 13. GPS time clock (not present)

Buildertrend's time clock works offline, tags job and cost code, tracks overtime and records GPS at clock-in and clock-out with geofence flags ([Connecteam](https://connecteam.com/reviews/buildertrend/)). Raken charges $59 per user per month for geofenced time tracking ([Raken](https://www.rakenapp.com/pricing)). Housecall Pro's phone GPS starts at Essentials ([HCP pricing](https://www.housecallpro.com/pricing/)). Contractor Foreman reviewers call its time cards "confusing and needlessly complicated" ([Capterra](https://www.capterra.com/p/166113/Contractor-Foreman/reviews/?page=16)). Workyard's sales calls found small contractors leaving Joist because they needed crew time tracking (competitor-written) ([Workyard](https://www.workyard.com/compare/joist-review)). ContractorDocs has a time-sheet document. A worker is a name on the job, not a login, so the real gap is how crew members get into the app.

**The ContractorDocs version** is a "crew link" for each worker: a personal link or PIN, with no account and no seat fee. It opens a stripped-down field screen:

- **Today's jobs:** the jobs assigned to that worker on the calendar.
- **Clock button:** a big Clock in / Clock out button.
- **Field entry:** photo upload (#4), plus daily-report and material-log entry.
- **Hidden:** no prices or revenue. Housecall Pro reviewers complain that technicians can see revenue ([Capterra](https://www.capterra.com/p/140363/HouseCall-Pro/)).

Each punch stores the time and one location reading, taken with the worker's consent. The app flags the punch if it is far from the job address; no geofencing infrastructure is needed. There is no continuous tracking, which a web app cannot do reliably anyway. Punches build the weekly time sheet and feed job costing (#12), and they queue when offline (#14). At the end of the day the owner gets a nudge about any missed clock-out. The links need signed tokens limited to assigned jobs.

**Impact:** Medium–High for crews of 2–10, low for solo operators · **Effort:** M–L, because the crew-access model is new · **Plan:** Premium, with unlimited workers.

#### 14. Offline create and edit (partial)

CompanyCam's offline capture is part of its praise ([FieldCompare](https://fieldcompare.com/companycam-review)). Jobber markets an offline-capable app ([Jobber llm-info](https://www.getjobber.com/llm-info/)). Buildertrend gets criticized because its offline mode covers only the time clock and daily logs ([Connecteam](https://connecteam.com/reviews/buildertrend/)). Workyard counted 75 complaints about freezes, crashes and lost work among Joist reviews (competitor-written) ([Workyard](https://www.workyard.com/compare/joist-review)). No survey measures how much offline mode matters, so this rests on review signals. ContractorDocs caches data for reading offline but blocks creating and editing.

**The ContractorDocs version** starts with the field documents, because they are mostly append-only and rarely conflict: daily job report, time punches, material log, receipt photos, notes, job photos and punch-list items. These can be created offline and carry a "waiting to sync" chip. Estimates and invoices can be drafted offline with a temporary number, and the real number is assigned on sync so numbering stays unique. Sending waits until the device is back online. Edits use last-write-wins, with a visible "changed on another device" notice.

**Impact:** Medium, high for rural and basement work · **Effort:** L · **Plan:** All plans. Reliability is a baseline, not an upsell.

#### 15. Recurring service plans (partial)

An IFS study found **85% of trade contractors have maintenance contracts**, but only **14% say their software handles them "very well"** (study date unconfirmed) ([Field Service News](https://www.fieldservicenews.com/ifs-study-trade-contractors-struggle-to-realize-aftermarket-service-revenue-potential-due-to-obsolete-software/)). Housecall Pro puts service plans only on MAX at $299–$329 ([HCP pricing](https://www.housecallpro.com/pricing/)). Tradify puts recurring jobs on Pro ([Tradify](https://www.tradifyhq.com/pricing)). FieldEdge's agreement tracking is a core selling point ([Toolradar](https://toolradar.com/tools/fieldedge)). ContractorDocs has recurring invoices but no recurring visits.

**The ContractorDocs version** is a "Service plan" on a client. It records what is done (for example an HVAC tune-up), how often (every six months), the price, how it is billed (per visit, or yearly upfront using the recurring invoices) and the assigned worker. The engine creates each next work order and calendar visit, with the double-booking check. It sends the visit reminder (#1), invoices on schedule, and emails "renewal due in 30 days" with one-tap renewal through an approval link. Generation should move to pg_cron so visits appear even when the owner does not log in.

**Impact:** Medium. High for HVAC, lawn, pool, pest and cleaning; low for remodelers. · **Effort:** S–M · **Plan:** Premium.

#### 16. Gantt scheduling (not present)

Buildertrend's Gantt has dependencies, baselines, templates and conflict warnings. Even so, a review notes it "schedules the work, not the people" ([Connecteam](https://connecteam.com/reviews/buildertrend/)). Houzz Pro's AI builds a schedule from an approved estimate ([Houzz](https://pro.houzz.com/pro-learn/blog/houzz-ai-knows-how-you-build)). ContractorDocs has a calendar with worker scheduling and a double-booking check.

**The ContractorDocs version** is a "Job phases" strip, not a Gantt. It is a short list of phases (demo, rough-in, inspection, drywall, finish) with start dates and durations. It shows as a bar strip on the job, in the calendar and in the portal. A "push everything after this" button handles a slipping phase. Templates cover each trade, and on Premium+AI the assistant builds the phases from the approved estimate's lines. Skip critical path, baselines and resource leveling.

**Impact:** Low–Medium, mainly for multi-week remodels · **Effort:** M · **Plan:** Premium; AI-built phases on Premium+AI.

### Paperwork the big platforms charge for

#### 17. Lien waivers, insurance certificates and permit tracking (not present)

Baird lists lien and waiver management among core trade workflows ([Baird](https://www.rwbaird.com/corporations-and-institutions/investment-banking/insights/2025/10/the-durable-growth-opportunity-in-construction-software/)). Procore added lien-waiver tracking and joint-check management ([Procore](https://www.procore.com/blog/inside-procores-2025-innovation-summit-and-the-future-of-connected-construction)). Buildertrend is criticized for having no expiry dates on insurance certificates and permits ([Connecteam](https://connecteam.com/reviews/buildertrend/)). Joist stores licenses and insurance documents only on Elite ([Joist](https://www.joist.com/pricing)). No survey measures how much small contractors value these features.

**The ContractorDocs version** plays to its strength in documents and has three parts:

1. **Lien waiver document type:** conditional or unconditional, progress or final. It is filled automatically from the invoice and payment (amount, through-date, job address, owner) and signed through the existing approval link. Several US states prescribe exact statutory wording, so ship state-specific versions only after legal review (verify per state).
2. **"Papers" vault:** upload license, insurance certificate, permits and bonds with expiry dates. Reminders go out 30 and 7 days before expiry through the #1 scheduler. A "Licensed and insured" badge with a downloadable certificate appears in the portal and on estimates. Permit numbers and inspection dates go on the job and the calendar.
3. **Later, subcontractor certificates:** request insurance certificates from subs through the request-link plumbing from #5.

**Impact:** Medium; some jobs require these documents for subs and remodelers · **Effort:** S–M · **Plan:** Lien waiver document on all plans; vault and expiry reminders on Premium.

#### 18. Punch lists and checklists (not present)

Punch lists and plan markups are Fieldwire's core, and ease of use is its most-praised trait, with 92 mentions across 531 G2 reviews ([G2](https://g2.com/products/fieldwire-by-hilti/reviews); [Connecteam](https://connecteam.com/reviews/fieldwire/)). Jobber puts job checklists on Connect ([Jobber pricing](https://www.getjobber.com/pricing/)), and CompanyCam offers checklists, including AI checklists, on paid tiers ([CompanyCam](https://companycam.com/pricing)).

**The ContractorDocs version** adds a punch list as a 13th document type. Each item has a photo with markup (#4), a room or area, the person responsible and a status. The client can add items and sign off in the portal, and sign-off can prompt the final invoice. Reusable checklist templates attach to work orders (for example "Water heater install: 12 checks") and are filled in on a phone with photo proof. On Premium+AI, the walkthrough turns a spoken tour into punch items.

**Impact:** Medium · **Effort:** S · **Plan:** Document type on all plans; templates and AI on paid tiers.

#### 19. Selections and allowances (not present)

Selections with allowances were CoConstruct's best-known strength. CoConstruct no longer sells to new customers, and existing customers can add projects only until **March 31, 2027** (competitor-written, citing CoConstruct) ([Projul](https://projul.com/blog/coconstruct-shutdown-migration-guide/)). That leaves small builders shopping in 2026–2027. JobTread reworked its selections around rooms in February 2026 ([JobTread](https://www.jobtread.com/product-updates/2026-02-13-new-improved-selections-with-job-areas)), and Buildertrend keeps selections for its top Complete tier ([OneCrew](https://www.getonecrew.com/post/buildertrend-pricing)).

**The ContractorDocs version** reuses the option engine from #6. An "Allowance" line, such as tile at $1,500, gets two to four choices, each with a photo, price and supplier link. The client picks in the portal by a deadline. The difference from the allowance automatically drafts a change order for e-signature, and the chosen items flow into a PO. Lines can be grouped by room.

**Impact:** Medium for remodelers and custom builders, low for service trades · **Effort:** M after #6 · **Plan:** Premium.

#### 20. Measurements (not present)

Hover builds a measured 3D model from 8–10 phone photos for $29–$99 per project or $999 a year ([ContractorToolStack](https://contractortoolstack.com/software/hover/pricing/)). It added estimates generated from those models in January 2026 ([Construction Dive](https://www.constructiondive.com/press-release/20260113-hover-launches-connected-visual-platform-to-streamline-home-improvement-wor-1/)). Roofr's aerial reports cost $13–$19 each, and complex roofs sometimes need corrections ([RSG](https://roofingsoftwareguide.com/reviews/roofr-review/)). Every one of these has a cost per report that a $10 plan cannot absorb.

**The ContractorDocs version** has two parts. A quick-measure calculator inside estimate lines handles rooms (length × width × height, minus doors and windows), linear feet, roofing squares with a pitch factor, and waste %, and passes quantities into price-book items. An "Attach measurement report" option takes a Hover, Roofr or EagleView PDF; on Premium+AI, the assistant reads the totals and pre-fills quantities, much as receipt OCR already does.

**Impact:** Low–Medium · **Effort:** S for the calculator, M for the AI read · **Plan:** Calculator on Free; AI read on Premium+AI.

#### 21. Supplier ordering (not present)

Third-party reviews name AccuLynx's ordering from ABC Supply, QXO and SRS catalogs as its main differentiator ([RSG](https://roofingsoftwareguide.com/roundups/best-roofing-material-ordering-software/)). Roofr lists material ordering even on its free plan ([Roofr](https://roofr.com/pricing)). These depend on distributor partnerships and mostly serve roofers.

**The ContractorDocs version** adds "Send PO to supplier". Suppliers become contacts. The existing PO goes out by Gmail as a PDF, and the supplier confirms through the existing approve/decline link. A low-stock threshold on inventory items creates "Reorder" draft POs grouped by supplier, and the existing check-in updates stock when goods arrive.

**Impact:** Low–Medium · **Effort:** S · **Plan:** Premium.

#### 22. RFIs and submittals (not present)

These are Procore's most-praised tools ([G2](https://www.g2.com/survey_responses/procore-review-4803809)). Buildertrend's AI Submittals is described as "core to how we run a job now" in a vendor-selected quote ([Buildertrend release](https://www.financialcontent.com/article/newsfile-2026-9-29-buildertrend-expands-platform-with-ai-and-financial-tools-to-support-high-volume-and-complex-construction)). They serve commercial GCs, the same buyers who call Procore "a sledgehammer for smaller projects". **The ContractorDocs version** is just a template: an "RFI / question" layout under the Note document type, with the question, a photo, a needed-by date, and the answer and signature collected through the approval link. That covers the subcontractor who needs one occasionally.

**Impact:** Low · **Effort:** XS · **Plan:** All plans.

#### 23. Connector for ChatGPT and Claude (not present)

JobTread launched an official MCP server, the "AI Connector", in April 2026. It lets outside assistants build estimates and analyze budgets under the user's permissions, and JobTread calls it its fastest-growing integration ever (vendor claim) ([JobTread](https://jobtread.com/product-updates/2026-04-13-job-tread-ai-connector); [JobTread release](https://www.jobtread.com/news/jobtreads-ai-connector-becomes-the-companys-fastest-growing-integration-ever)). Jobber lists ChatGPT and Claude connectors on all plans ([Jobber llm-info](https://www.getjobber.com/llm-info/)). **The ContractorDocs version** would be a read-and-draft-only connector. Tools would include "list unpaid invoices", "draft estimate" and "create client", and nothing would be sent or charged without approval inside the app. Most solo contractors will not use it, but it is cheap marketing for the AI-curious.

**Impact:** Low–Medium · **Effort:** M · **Plan:** Premium+AI.

## Build the money loop now, the job loop next, and refuse the enterprise extras

The order follows dependencies, not just scores. The payment webhook (#2) is what lets reminders stop by themselves, triggers the review request and fills the "collected" figure in job costing, so it unlocks the most. The reminder scheduler (#1) then carries service-plan visits, expiry alerts for the papers vault and the monthly bookkeeper email. The photo timeline (#4/#11) feeds client updates, punch lists and the AI walkthrough. The option engine (#6) later becomes selections (#19). Crew links (#13) supply the labor costs that make job costing (#12) accurate. The "Now" group is roughly two months of focused work for one developer, by the rough sizes above.

| Phase | Build | Why now |
|---|---|---|
| **Now** | Pay button with automatic "paid" (#2); automatic reminders (#1); request link and QR with AI reply (#5); text/WhatsApp buttons (#9); review request (#7); financing link (#3); "Export everything" plus bookkeeper CSV (#4, step 1); photo timeline basics (#11) | Closes the get-paid and win-work loop on infrastructure that already exists; every item is entry- or mid-tier at rivals |
| **Next** | Good/better/best (#6); job budget vs actual and T&M (#12); pipeline board (#8); crew links and clock-in (#13); AI walkthrough and client updates (#11); service plans (#15); papers vault and lien waivers (#17); punch lists (#18); supplier POs and reorder (#21); offline field drafts (#14) | Raises ticket size and margin, and makes the app usable by a crew, not just the owner |
| **Later** | QuickBooks Online one-way sync, then Xero (#4); selections (#19); job phases strip (#16); measurement calculator and AI read (#20); MCP connector (#23); financing partner integration (#3); automated SMS credits (#9); voice receptionist via a partner (#10), only if users ask | Higher effort, narrower audience, or depends on partners and demand |

Two trust items cost almost nothing and belong in "Now". The first is an "Export everything" ZIP of all PDFs and CSVs, available on every plan including Free and after cancelling. The second is a written price promise. Locked records and surprise price hikes are the top complaints about Joist and Invoice2go ([Workyard](https://www.workyard.com/compare/joist-review); [Trustpilot](https://www.trustpilot.com/review/invoice.2go.com)), and Buildertrend is criticized for difficult data export ([Connecteam](https://connecteam.com/reviews/buildertrend/)). Answering those complaints publicly works as a feature.

Several things should be deliberately left alone. Each one serves large firms, carries a running cost per use, or depends on partnerships that do not fit a $10 product.

| Do not build | Why not, for this audience | Do this instead |
|---|---|---|
| Voice AI receptionist, phone system, call-tracking numbers | Per-minute telephony; rivals charge $29–$200/mo; mixed reception | AI replies to written requests (#5, #10) |
| Aerial or 3D measurement | $13–$99 imagery cost per report | Calculator plus AI reading of imported reports (#20) |
| Distributor catalog and price sync | Needs supplier partnerships; mostly roofing | Email POs and low-stock reorders (#21) |
| RFIs, submittals, drawing management, BIM | Commercial GC workflows; Procore's "sledgehammer" | Note template (#22) |
| Full Gantt with critical path and baselines | Complexity small teams reject | Job phases strip (#16) |
| Dispatch board, route optimization, fleet GPS, continuous tracking | Built for 10+ truck fleets (ServiceTitan, Housecall Pro MAX) | Calendar plus location stamped only at punch (#13) |
| Marketing suites (campaigns, postcards, ad autopilot, websites) | Sold as $79–$99/mo add-ons; a separate business | Request link plus review requests (#5, #7) |
| Payroll, commissions, contact center | ServiceTitan's top tier; regulated payroll | Time sheet export to the bookkeeper (#4) |
| AIA G702/G703 pay applications with retainage | Niche commercial-sub need ([Knowify](https://knowify.com/resources/aia-contracts-and-invoicing/)) | Existing progress billing; revisit if subs ask |
| In-house lending or contractor loans | Regulated; Joist uses a partner for this | Financing link (#3) |

The plan tiers should follow one rule. **Free** gets whatever helps a small business get paid and look professional at low volume: the pay button, reminders within the email cap, the branded request link, the pipeline board, text sharing and export. These are retention and growth loops, not upsells. **Premium ($5)** gets automation, volume and crew features: unlimited reminders, options, job costing, service plans, crew links, the papers vault, review requests and bookkeeper sync. **Premium+AI ($10)** gets AI that writes and acts: reminder wording, request replies, walkthroughs, client updates, options built by AI and budget explanations. Photo storage and AI tokens are the two costs that grow with use, so both need per-tier caps. Telephony is avoided entirely.

## Conclusion

The competitive picture changes what the main problem looks like. ContractorDocs is not behind on features in the usual sense. On documents, it is ahead of tools that cost ten times more. What it lacks is automation: things that happen without the owner pressing a button. Rivals earn their $99–$300 tiers mostly by sending the reminder, collecting the payment, answering the lead and asking for the review on their own. ContractorDocs already has the documents, the portal, the Gmail connection, the scheduler and an AI assistant that can plan several steps, so its cheapest route to parity is to let those parts run on a schedule. Pointed at a nightly routine (chase what is overdue, follow up what is stale, flag what is over budget), the existing AI becomes a $10 version of the AI "chief of staff" that ServiceTitan is still piloting in closed alpha ([ServiceTitan](https://www.servicetitan.com/blog/pantheon-max-atlas-homh-next-steps)).

The second takeaway is a positioning one: use the contractor's own channels. Rivals rent phone numbers, charge per text and hold the money. ContractorDocs already sends from the contractor's own Gmail, and the same idea extends to texting from their own phone, getting paid into their own Stripe account, and keeping their own data exportable at any time. That is cheaper to run, avoids carrier registration and holding customer funds, and answers the trust complaints (price hikes, locked records) that push solo contractors off Joist and Invoice2go. The open question the research could not settle is willingness to pay. No source shows which of these features solo contractors would upgrade for at $5–$10. Before the "Next" phase, the cheapest validation is to watch how Free users respond to the email cap once automatic reminders count toward it, and to ask in the community forum.

## Sources

Labels: **[V]** vendor-written (company describing its own product or results), **[C]** written by a competing vendor, **[A]** aggregator, SEO or comparison site, **[R]** review platform (mostly read via search snippets), **[I]** independent press, analyst or filing.

**Market, financials and deals**
- [I] Procore FY2025 results — https://procore.com/press/procore-announces-fourth-quarter-and-full-year-2025-financial-results
- [I] ServiceTitan FY2026 results — https://investors.servicetitan.com/news-releases/news-release-details/servicetitan-announces-fiscal-fourth-quarter-and-full-fiscal
- [V] Jobber 100,000 customers (syndicated release) — https://hrtechedge.com/?p=52528
- [V] Housecall Pro "200K+ pros" — https://www.pmmag.com/articles/107237-housecall-pro-unveils-platform-upgrades
- [V] Buildertrend Sept 2026 release (20,000 builders, AI features) — https://www.financialcontent.com/article/newsfile-2026-9-29-buildertrend-expands-platform-with-ai-and-financial-tools-to-support-high-volume-and-complex-construction
- [V] Buildertrend Bill Pay — https://buildertrend.com/press-releases/construction-bill-pay-launch-ibs-2026/
- [V] Buildertrend acquires BizJet AI — https://buildertrend.com/press-releases/buildertrend-acquires-bizjet-ai/
- [V] Buildertrend AI client updates ("97%", headline only) — https://buildertrend.com/press-releases/buildertrend-launches-ai-tool-for-97-faster-client-updates/
- [I] Verisk–AccuLynx deal — https://www.roofingcontractor.com/articles/101114-verisk-to-acquire-acculynx-in-235b-deal
- [I] Verisk terminates AccuLynx deal — https://www.businessinsurance.com/verisk-pulls-plug-on-2-4-billion-acculynx-deal/
- [I] JobNimbus $330M investment — https://roofingcontractor.com/articles/100122-sumeru-equity-partners-invests-330-million-in-jobnimbus
- [I] CompanyCam acquires Beam — https://siliconprairienews.com/2026/03/companycam-acquires-california-construction-fintech-startup-beam/
- [I] Baird, construction software market — https://www.rwbaird.com/corporations-and-institutions/investment-banking/insights/2025/10/the-durable-growth-opportunity-in-construction-software/
- [I] Verdantix Green Quadrant — https://research.verdantix.com/insights/press-release/verdantix-green-quadrant-highlights-surge-in-construction-management-software-adoption-amid-profit-margin-pressures-and-tariff-hikes
- [V] Procore 2025 Innovation Summit — https://www.procore.com/blog/inside-procores-2025-innovation-summit-and-the-future-of-connected-construction

**Pricing and feature pages**
- [V] Jobber pricing — https://www.getjobber.com/pricing/
- [V] Jobber feature summary (llm-info) — https://www.getjobber.com/llm-info/
- [V] Jobber AI quote drafting — https://productupdates.getjobber.com/111090-quote-faster-and-win-more-work-with-new-automations
- [V] Jobber online payments share (syndicated snippet) — https://www.webull.com/news/13793458394055680
- [V] Housecall Pro pricing — https://www.housecallpro.com/pricing/
- [V] Housecall Pro consumer financing — https://housecallpro.com/features/consumer-financing
- [V] ServiceTitan Pantheon 2025 — https://www.servicetitan.com/blog/pantheon-2025-pro-products-automation
- [V] ServiceTitan Pantheon 2026 — https://www.servicetitan.com/blog/pantheon-max-atlas-homh-next-steps
- [V] JobTread pricing — https://www.jobtread.com/pricing
- [V] JobTread selections update — https://www.jobtread.com/product-updates/2026-02-13-new-improved-selections-with-job-areas
- [V] JobTread AI Connector — https://jobtread.com/product-updates/2026-04-13-job-tread-ai-connector
- [V] JobTread AI Connector growth — https://www.jobtread.com/news/jobtreads-ai-connector-becomes-the-companys-fastest-growing-integration-ever
- [V] Contractor Foreman pricing — https://www.contractorforeman.com/pricing
- [V] Raken pricing — https://www.rakenapp.com/pricing
- [V] Houzz AI — https://pro.houzz.com/pro-learn/blog/houzz-ai-knows-how-you-build
- [V] Roofr pricing — https://roofr.com/pricing
- [V] Roofr case studies — https://roofr.com/case-studies/amanda-veinott ; https://roofr.com/case-studies/jesse-schreuder ; https://roofr.com/masterclass/instant-estimator-and-lead-tracking-with-amanda-veinott
- [V] AccuLynx Spring 2026 updates — https://acculynx.com/spring-2026-product-updates/
- [V] CompanyCam pricing — https://companycam.com/pricing
- [V] Joist pricing — https://www.joist.com/pricing
- [V] Invoice2go pricing — https://invoice.2go.com/pricing/
- [V] Tradify pricing — https://www.tradifyhq.com/pricing
- [V] Fergus pricing — https://www.fergus.com/pricing
- [V] Knowify, AIA invoicing — https://knowify.com/resources/aia-contracts-and-invoicing/
- [V] Knowify buyer guide (QuickBooks share, weak) — https://knowify.com/resources/best-trade-contractor-software/
- [V] Hearth financing ROI — https://gethearth.com/roi-of-offering-financing/
- [I] Wisetack adds U.S. Bank — https://www.businesswire.com/news/home/20250113439351/en
- [V] Intuit AI reminders — https://www.intuit.com/blog/innovative-thinking/delivering-done-for-you
- [I] Intuit AI agents — https://www.accountingtoday.com/news/intuit-debuts-ai-agents-for-quickbooks
- [V] Intuit late-payment figure (release coverage) — https://www.newsfilecorp.com/release/260641/QuickBooks-New-AI-Agents-Explained-What-Each-One-Does-Expert-Consumers-Report
- [V] Hover connected platform — https://www.constructiondive.com/press-release/20260113-hover-launches-connected-visual-platform-to-streamline-home-improvement-wor-1/

**Surveys**
- [V] Housecall Pro "AI Advantage" survey — https://www.housecallpro.com/resources/ai-in-the-trades/
- [V] ServiceTitan/Thrive AI in the Trades survey — https://www.rooferscoffeeshop.com/post/majority-of-contractors-are-already-seeing-increased-efficiency-from-ai-adoption-servicetitan-industry-report-reveals
- [R] GetApp reviewer importance ratings — https://www.getapp.com/operations-management-software/contractor-management/f/electronic-payments
- [I] IFS maintenance-contract study (date unconfirmed) — https://www.fieldservicenews.com/ifs-study-trade-contractors-struggle-to-realize-aftermarket-service-revenue-potential-due-to-obsolete-software/

**Reviews, comparisons and pricing analyses**
- [C] Connecteam review of Buildertrend — https://connecteam.com/reviews/buildertrend/
- [C] Connecteam review of Fieldwire — https://connecteam.com/reviews/fieldwire/
- [C] FieldCamp review roundup of Jobber — https://fieldcamp.ai/reviews/jobber
- [C] Workyard analysis of 1,400 Joist reviews — https://www.workyard.com/compare/joist-review
- [C] OneCrew Procore pricing — https://www.getonecrew.com/post/procore-pricing
- [C] OneCrew Buildertrend pricing — https://www.getonecrew.com/post/buildertrend-pricing
- [C] OneCrew ServiceTitan reviews — https://www.getonecrew.com/post/servicetitan-reviews
- [C] ServiceAgent on ServiceTitan pricing — https://serviceagent.ai/blogs/servicetitan-pricing-explained/
- [C] Projul on the CoConstruct shutdown — https://projul.com/blog/coconstruct-shutdown-migration-guide/
- [A] ContractorToolStack 2026 pricing report — https://contractortoolstack.com/reports/contractor-software-pricing-2026/
- [A] ContractorToolStack JobNimbus AI guide — https://contractortoolstack.com/guides/jobnimbus-ai-features-guide/
- [A] ContractorToolStack Hover pricing — https://contractortoolstack.com/software/hover/pricing/
- [A] ContractorToolStack Wisetack — https://contractortoolstack.com/software/wisetack/
- [A] FieldCompare CompanyCam review — https://fieldcompare.com/companycam-review
- [A] RoofingSoftwareGuide Roofr review — https://roofingsoftwareguide.com/reviews/roofr-review/
- [A] RoofingSoftwareGuide AccuLynx vs JobNimbus — https://roofingsoftwareguide.com/comparisons/acculynx-vs-jobnimbus/
- [A] RoofingSoftwareGuide material ordering — https://roofingsoftwareguide.com/roundups/best-roofing-material-ordering-software/
- [A] Fervor Studio Knowify review — https://fervorstudio.ca/news/knowify-review-pricing-alternatives/
- [A] Toolradar Houzz Pro — https://toolradar.com/tools/houzz-pro
- [A] Toolradar FieldEdge — https://toolradar.com/tools/fieldedge
- [A] Hook Agency on Houzz Pro — https://hookagency.com/?p=3263
- [A] ProjectManager on Fieldwire — https://www.projectmanager.com/blog/what-is-fieldwire
- [A] FieldProxy ServiceM8 pricing — https://www.fieldproxy.ai/fsm-software-pricing/servicem8
- [A] PricingSaaS Workiz — https://pricingsaas.com/companies/workiz/diffs/2026W22
- [A] ERPResearch simPRO — https://erpresearch.com/erp-add-ons/field-service/simpro/pricing
- [A] Stork.ai on Jobber Receptionist — https://www.stork.ai/en/jobber-ai-receptionist
- [A] Unverified 25% follow-up claim — https://pipeline-marketing.pages.dev/blog/jobber-setup-guide-contractors/
- [R] Capterra Procore reviews — https://www.capterra.com/p/56250/Procore/reviews/?page=3
- [R] G2 Procore review — https://www.g2.com/survey_responses/procore-review-4803809
- [R] Capterra Housecall Pro — https://www.capterra.com/p/140363/HouseCall-Pro/
- [R] Capterra Contractor Foreman reviews — https://www.capterra.com/p/166113/Contractor-Foreman/reviews/?page=16 ; https://www.capterra.com/p/166113/Contractor-Foreman/reviews/?page=5 ; https://www.capterra.com/p/166113/Contractor-Foreman/reviews/6195231/
- [R] Capterra CompanyCam reviews — https://www.capterra.com/p/171143/CompanyCam/reviews/
- [R] Capterra JobTread reviews — https://capterra.com/p/218503/JobTread/reviews/?page=4
- [R] Capterra Invoice2go pricing — https://www.capterra.com/p/81858/Invoice2go/pricing/
- [R] Capterra ServiceM8 reviews — https://capterra.com/p/110711/ServiceM8/reviews/
- [R] G2 Buildertrend vs JobTread — https://www.g2.com/compare/buildertrend-vs-jobtread
- [R] G2 Fieldwire reviews — https://g2.com/products/fieldwire-by-hilti/reviews
- [R] G2 Raken reviews — https://www.g2.com/products/RAKEN/reviews
- [R] Trustpilot Invoice2go — https://www.trustpilot.com/review/invoice.2go.com

**ContractorDocs repository (checked lightly for this report)**
- `supabase/functions/gmail/index.ts`: encrypted Gmail refresh tokens, offline access, server-side refresh
- `supabase/migrations/20261112000300_billing_storage_privileges.sql`: pg_cron hourly housekeeping
- `services/recurringService.ts`: recurring invoices generated by a database function the browser triggers after login
- `components/CalendarView.tsx`: a job's worker is stored as `worker_name`, not a login
