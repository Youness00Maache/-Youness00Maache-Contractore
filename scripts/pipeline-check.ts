/**
 * Checks for the pipeline board (NEXT_STEPS 0c #8): stage mapping from document statuses, stale rules, values and
 * column totals, ordering, search, row mapping, and the route / help guide.
 *   npx tsx scripts/pipeline-check.ts
 *   TZ=Pacific/Auckland npx tsx scripts/pipeline-check.ts
 */
import {
    PAID_RECENT_DAYS, PIPELINE_STAGES, STALE_DAYS, approvalState, buildPipeline, compareCards, dayOf, daysSince, docKind, docTotal,
    filterCards, invoiceState, isWorkEvidence, mapPipelineRow, placeJob, requestCard, stageIndex,
    type PipelineCard, type PipelineDoc, type PipelineJobInput,
} from '../lib/pipeline.ts';
import { parseView } from '../lib/routes.ts';
import { getGuide } from '../components/help/helpContent.ts';
import { readFileSync } from 'node:fs';

let failures = 0;
let passes = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passes++;
    else {
        failures++;
        console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
    }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);

const TODAY = '2026-11-14';
/** YYYY-MM-DD n days before TODAY */
const ago = (n: number): string => {
    const d = new Date(2026, 10, 14 - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const inDays = (n: number) => ago(-n);

const line = (amount: number) => [{ quantity: 1, rate: amount }];
let seq = 0;
const doc = (type: string, fields: Partial<PipelineDoc> = {}): PipelineDoc => ({
    id: `d${++seq}`, type, jobId: 'j1', createdAt: `${ago(1)}T12:00:00`, ...fields,
});
const job = (fields: Partial<PipelineJobInput> = {}): PipelineJobInput => ({
    id: 'j1', name: 'Kitchen remodel', clientName: 'Morgan Client', status: 'active', createdAt: `${ago(2)}T12:00:00`, ...fields,
});
const place = (docs: PipelineDoc[], j: Partial<PipelineJobInput> = {}, fromRequest = false) => placeJob(job(j), docs, TODAY, fromRequest);
const cardOf = (docs: PipelineDoc[], j: Partial<PipelineJobInput> = {}, fromRequest = false): PipelineCard => {
    const p = place(docs, j, fromRequest);
    if (!('card' in p)) throw new Error(`expected a card, got hidden ${JSON.stringify(p)}`);
    return p.card;
};

// ======================================================================== stages / helpers
eq('six stages in order', PIPELINE_STAGES.map(s => s.id), ['request', 'estimate', 'approved', 'in_progress', 'invoiced', 'paid']);
eq('stage index of paid', stageIndex('paid'), 5);
eq('requests column has no money total', PIPELINE_STAGES[0].totalLabel, null);
eq('stale thresholds', STALE_DAYS, { request: 2, newJob: 7, estimate: 7, approved: 14, invoiceNoDueDate: 30 });
eq('paid window', PAID_RECENT_DAYS, 30);

eq('doc kind: Estimate', docKind({ type: 'Estimate' }), 'estimate');
eq('doc kind: change_order', docKind({ type: 'change_order' }), 'change_order');
eq('doc kind: Change Order', docKind({ type: 'Change Order' }), 'change_order');
eq('doc kind: Daily Job Report = work', docKind({ type: 'Daily Job Report' }), 'work');
eq('doc kind: expense log = work', docKind({ type: 'expense log' }), 'work');
eq('doc kind: Note = other', docKind({ type: 'Note' }), 'other');
ok('time sheet is work evidence', isWorkEvidence(doc('Time Sheet')));
ok('scheduled work order is not work yet', !isWorkEvidence(doc('Work Order', { status: 'Scheduled' })));
ok('work order in progress is work', isWorkEvidence(doc('Work Order', { status: 'In Progress' })));
ok('estimate is not work evidence', !isWorkEvidence(doc('Estimate', { status: 'Sent' })));

eq('approval: no status = draft', approvalState(doc('Estimate')), 'draft');
eq('approval: Sent', approvalState(doc('Estimate', { status: 'Sent' })), 'sent');
eq('approval: Accepted', approvalState(doc('Estimate', { status: 'Accepted' })), 'accepted');
eq('approval: Approved (change order)', approvalState(doc('Change Order', { status: 'Approved' })), 'accepted');
eq('approval: signed while Sent', approvalState(doc('Estimate', { status: 'Sent', clientSignedAt: '2026-11-10T15:00:00Z' })), 'accepted');
eq('approval: Rejected', approvalState(doc('Estimate', { status: 'Rejected' })), 'declined');
eq('approval: client declined while Sent', approvalState(doc('Estimate', { status: 'Sent', clientDeclinedAt: '2026-11-10T15:00:00Z' })), 'declined');
eq('approval: Draft with an old signature url stays draft', approvalState(doc('Estimate', { status: 'Draft', clientSignatureUrl: 'x' })), 'draft');

eq('total: lines + tax - discount + shipping', docTotal(doc('Invoice', { lineItems: line(1000), taxRate: 10, discount: 100, shipping: 50 })), 1040);
eq('total: receipt amount', docTotal(doc('Receipt', { amount: '250.50' })), 250.5);
eq('total: strings parse', docTotal(doc('Estimate', { lineItems: [{ quantity: '2', rate: '1,250' }] as any })), 2500);

{
    const s = invoiceState(doc('Invoice', { status: 'Sent', lineItems: line(500), dueDate: ago(3) }), TODAY);
    eq('invoice past due: open + overdue 3 days', [s.billed, s.open, s.overdue, s.overdueDays, s.balance], [true, true, true, 3, 500]);
    const p = invoiceState(doc('Invoice', { status: 'Sent', lineItems: line(500), amountPaid: 500 }), TODAY);
    eq('invoice fully paid by amountPaid counts as paid', [p.paid, p.open], [true, false]);
    const d = invoiceState(doc('Invoice', { status: 'Draft', lineItems: line(500) }), TODAY);
    eq('draft invoice is not billed', [d.billed, d.open], [false, false]);
    const c = invoiceState(doc('Invoice', { status: 'Cancelled', lineItems: line(500) }), TODAY);
    eq('cancelled invoice is not billed', c.billed, false);
    const o = invoiceState(doc('Invoice', { status: 'Overdue', lineItems: line(500) }), TODAY);
    eq('status Overdue without due date is overdue', [o.overdue, o.overdueDays], [true, 0]);
    const z = invoiceState(doc('Invoice', { status: 'Paid', lineItems: line(500) }), TODAY);
    eq('Paid status: nothing due', [z.paid, z.balance], [true, 0]);
}

eq('dayOf: business date kept', dayOf('2026-11-03'), '2026-11-03');
eq('dayOf: padded', dayOf('2026-1-3'), '2026-01-03');
eq('dayOf: local midnight instant', dayOf(new Date(2026, 10, 3, 0, 30).toISOString()), '2026-11-03');
eq('dayOf: garbage', dayOf('soon'), null);
eq('dayOf: empty', dayOf(''), null);
eq('daysSince: 5 days', daysSince(ago(5), TODAY), 5);
eq('daysSince: future is 0', daysSince(inDays(3), TODAY), 0);
eq('daysSince: unknown', daysSince(null, TODAY), null);

// ======================================================================== stage mapping: requests
{
    const c = cardOf([]);
    eq('no documents → Requests', c.stage, 'request');
    eq('no documents: detail', c.detail, 'Nothing sent yet');
    eq('no documents: value', c.value, null);
    eq('no documents, 2 days old: not stale', c.alert, null);
    eq('no documents: open job first', c.actions, ['open_job', 'set_inactive']);
    const old = cardOf([], { createdAt: `${ago(8)}T12:00:00` });
    eq('nothing sent after 8 days → stale', old.alert && [old.alert.reason, old.alert.tone, old.alert.label], ['nothing_sent', 'warning', 'Nothing sent · 8d']);
    const seven = cardOf([], { createdAt: `${ago(7)}T12:00:00` });
    eq('exactly 7 days → not stale yet (more than 7)', seven.alert, null);
    const draft = cardOf([doc('Estimate', { status: 'Draft', number: 'EST-7', lineItems: line(1800) })]);
    eq('draft estimate → Requests', draft.stage, 'request');
    eq('draft estimate: value is the draft', [draft.value, draft.valueNote], [1800, 'draft']);
    eq('draft estimate: open it first', draft.actions[0], 'open_doc');
    eq('draft estimate: detail', draft.detail, 'Draft EST-7');
    const fromReq = cardOf([], {}, true);
    eq('job from a quote request says so', fromReq.detail, 'Nothing sent yet · from a quote request');
}

// ======================================================================== estimate sent
{
    const c = cardOf([doc('Estimate', { status: 'Sent', number: 'EST-1', issueDate: ago(3), lineItems: line(4200) })]);
    eq('sent estimate → Estimate sent', c.stage, 'estimate');
    eq('sent estimate: value + age', [c.value, c.age], [4200, 3]);
    eq('sent estimate 3 days: no badge', c.alert, null);
    eq('sent estimate: follow up first', c.actions.slice(0, 2), ['follow_up', 'reminders']);
    const stale = cardOf([doc('Estimate', { status: 'Sent', issueDate: ago(8), lineItems: line(4200) })]);
    eq('no answer after 8 days → stale', stale.alert && [stale.alert.reason, stale.alert.label], ['no_answer', 'No answer · 8d']);
    const seven = cardOf([doc('Estimate', { status: 'Sent', issueDate: ago(7), lineItems: line(4200) })]);
    eq('estimate sent exactly 7 days ago: not stale yet', seven.alert, null);
    const expired = cardOf([doc('Estimate', { status: 'Sent', issueDate: ago(4), expiryDate: ago(2), lineItems: line(4200) })]);
    eq('expired estimate → expired badge', expired.alert && [expired.alert.reason, expired.alert.label], ['expired', 'Expired 2d ago']);
    const noIssue = cardOf([doc('Estimate', { status: 'Sent', createdAt: `${ago(9)}T12:00:00`, lineItems: line(10) })]);
    eq('no issue date: age from created', noIssue.age, 9);
    const two = cardOf([
        doc('Estimate', { status: 'Sent', number: 'EST-1', issueDate: ago(10), lineItems: line(1000) }),
        doc('Estimate', { status: 'Sent', number: 'EST-2', issueDate: ago(2), lineItems: line(1500) }),
    ]);
    eq('two sent estimates: the latest counts', [two.doc?.number, two.value, two.age, two.detail], ['EST-2', 1500, 2, 'EST-2 +1 more']);
    const sentAndDraft = cardOf([doc('Estimate', { status: 'Sent', issueDate: ago(1), lineItems: line(10) }), doc('Estimate', { status: 'Draft' })]);
    eq('sent + draft → Estimate sent', sentAndDraft.stage, 'estimate');
    const sentAndWork = cardOf([doc('Estimate', { status: 'Sent', issueDate: ago(1), lineItems: line(10) }), doc('Time Sheet')]);
    eq('sent (not approved) + time sheet stays in Estimate sent', sentAndWork.stage, 'estimate');
}

// ======================================================================== approved / in progress
{
    const c = cardOf([doc('Estimate', { status: 'Accepted', number: 'EST-3', issueDate: ago(5), lineItems: line(9000) })]);
    eq('accepted estimate → Approved', [c.stage, c.value, c.age], ['approved', 9000, 5]);
    const signed = cardOf([doc('Estimate', { status: 'Sent', issueDate: ago(20), clientSignedAt: new Date(2026, 10, 12, 15).toISOString(), lineItems: line(9000) })]);
    eq('client-signed → Approved, age from the signature', [signed.stage, signed.age, signed.alert], ['approved', 2, null]);
    const late = cardOf([doc('Estimate', { status: 'Accepted', issueDate: ago(15), lineItems: line(9000) })]);
    eq('approved 15 days, no work → not started', late.alert && [late.alert.reason, late.alert.label], ['not_started', 'Not started · 15d']);
    const working = cardOf([doc('Estimate', { status: 'Accepted', issueDate: ago(15), lineItems: line(9000) }), doc('Daily Job Report', { date: ago(4) })]);
    eq('approved + daily report → In progress, age from first work', [working.stage, working.age, working.alert], ['in_progress', 4, null]);
    eq('in progress (active): finish is offered', working.actions.includes('finish_job'), true);
    const scheduled = cardOf([doc('Estimate', { status: 'Accepted', issueDate: ago(1), lineItems: line(9000) }), doc('Work Order', { status: 'Scheduled' })]);
    eq('approved + scheduled work order stays Approved', scheduled.stage, 'approved');
    const done = cardOf([doc('Estimate', { status: 'Accepted', issueDate: ago(3), lineItems: line(9000) })], { status: 'completed' });
    eq('approved + job Completed → In progress, finished not invoiced', [done.stage, done.alert?.reason, done.alert?.label], ['in_progress', 'not_invoiced', 'Finished · not invoiced']);
    eq('finished job: no finish action', done.actions.includes('finish_job'), false);
    const draftInv = cardOf([doc('Estimate', { status: 'Accepted', issueDate: ago(3), lineItems: line(9000) }), doc('Invoice', { status: 'Draft', number: 'INV-4', lineItems: line(9000) })]);
    eq('approved + draft invoice: still Approved, draft is the card document', [draftInv.stage, draftInv.detail, draftInv.doc?.number], ['approved', 'Invoice draft ready', 'INV-4']);
    const co = cardOf([doc('Estimate', { status: 'Accepted', lineItems: line(9000) }), doc('Change Order', { status: 'Approved', lineItems: line(1200) }), doc('Change Order', { status: 'Sent', lineItems: line(500) })]);
    eq('approved change order adds to the contract (pending one does not)', co.value, 10200);
    const rev = cardOf([
        doc('Estimate', { id: 'e1', status: 'Accepted', lineItems: line(1000) }),
        doc('Estimate', { id: 'e2', status: 'Accepted', revisionOf: 'e1', lineItems: line(1200) }),
    ]);
    eq('accepted revision replaces the original', rev.value, 1200);
    const revDraft = cardOf([
        doc('Estimate', { id: 'e3', status: 'Accepted', lineItems: line(1000) }),
        doc('Estimate', { id: 'e4', status: 'Draft', revisionOf: 'e3', lineItems: line(1200) }),
    ]);
    eq('draft revision does not replace the signed original', [revDraft.stage, revDraft.value], ['approved', 1000]);
    const tm = cardOf([doc('Time Sheet', { date: ago(6) })]);
    eq('work without an estimate (T&M) → In progress, no value', [tm.stage, tm.value, tm.detail], ['in_progress', null, 'Work logged, no estimate']);
    const tmDone = cardOf([doc('Material Log', { date: ago(6) })], { status: 'completed' });
    eq('T&M job completed → not invoiced', tmDone.alert?.reason, 'not_invoiced');
}

// ======================================================================== invoiced
{
    const c = cardOf([
        doc('Estimate', { status: 'Accepted', lineItems: line(5000) }),
        doc('Invoice', { status: 'Sent', number: 'INV-1', issueDate: ago(4), dueDate: inDays(5), lineItems: line(5000), amountPaid: 1000 }),
    ]);
    eq('sent invoice → Invoiced, value is the balance due', [c.stage, c.value, c.valueNote], ['invoiced', 4000, 'due']);
    eq('invoice due later: detail + no badge', [c.detail, c.alert], ['INV-1 · due in 5d', null]);
    eq('invoice: follow up + mark paid first', c.actions.slice(0, 2), ['follow_up', 'mark_paid']);
    const dueToday = cardOf([doc('Invoice', { status: 'Sent', number: 'INV-2', dueDate: TODAY, lineItems: line(10) })]);
    eq('due today', dueToday.detail, 'INV-2 · due today');
    const overdue = cardOf([
        doc('Invoice', { status: 'Sent', number: 'INV-A', issueDate: ago(40), dueDate: ago(10), lineItems: line(700) }),
        doc('Invoice', { status: 'Sent', number: 'INV-B', issueDate: ago(5), dueDate: inDays(10), lineItems: line(300) }),
    ]);
    eq('overdue → danger badge with days, both balances add up', [overdue.alert?.reason, overdue.alert?.tone, overdue.alert?.label, overdue.value], ['overdue', 'danger', '10d overdue', 1000]);
    eq('overdue: the overdue invoice is the card document', [overdue.doc?.number, overdue.detail], ['INV-A', 'INV-A +1 more']);
    eq('invoiced age from the oldest open invoice', overdue.age, 40);
    const reported = cardOf([doc('Invoice', { status: 'Sent', number: 'INV-R', dueDate: ago(3), paymentReportedAt: '2026-11-13T10:00:00Z', lineItems: line(250) })]);
    eq('client says paid → success badge, Mark as paid first', [reported.alert?.reason, reported.alert?.tone, reported.actions[0]], ['payment_reported', 'success', 'mark_paid']);
    const noDue = cardOf([doc('Invoice', { status: 'Sent', issueDate: ago(31), lineItems: line(250) })]);
    eq('no due date, unpaid 31 days → stale', noDue.alert && [noDue.alert.reason, noDue.alert.label], ['unpaid', 'Unpaid · 31d']);
    const noDue30 = cardOf([doc('Invoice', { status: 'Sent', issueDate: ago(30), lineItems: line(250) })]);
    eq('no due date, 30 days → not yet', noDue30.alert, null);
    const overdueStatus = cardOf([doc('Invoice', { status: 'Overdue', lineItems: line(250) })]);
    eq('status Overdue → overdue badge', overdueStatus.alert?.label, 'Overdue');
    const paidPlusOpen = cardOf([doc('Invoice', { status: 'Paid', lineItems: line(100) }), doc('Invoice', { status: 'Sent', lineItems: line(200) })]);
    eq('one paid + one open → Invoiced', [paidPlusOpen.stage, paidPlusOpen.value], ['invoiced', 200]);
    const cancelled = cardOf([doc('Estimate', { status: 'Accepted', issueDate: ago(1), lineItems: line(10) }), doc('Invoice', { status: 'Cancelled', lineItems: line(10) })]);
    eq('cancelled invoice is ignored', cancelled.stage, 'approved');
}

// ======================================================================== paid
{
    const c = cardOf([doc('Invoice', { status: 'Paid', number: 'INV-9', issueDate: ago(20), paidAt: ago(3), lineItems: line(2500) })]);
    eq('paid invoice → Paid, age from paid date', [c.stage, c.value, c.age, c.older, c.alert], ['paid', 2500, 3, false, null]);
    const reportedButPaid = cardOf([doc('Invoice', { status: 'Paid', paymentReportedAt: '2026-11-13T10:00:00Z', lineItems: line(10) })]);
    eq('reported + Paid → Paid (no badge)', [reportedButPaid.stage, reportedButPaid.alert], ['paid', null]);
    const byAmount = cardOf([doc('Invoice', { status: 'Sent', lineItems: line(800), amountPaid: 800 })]);
    eq('balance 0 → Paid', byAmount.stage, 'paid');
    const old = cardOf([doc('Invoice', { status: 'Paid', paidAt: ago(31), lineItems: line(10) })]);
    eq('paid 31 days ago → older', old.older, true);
    const deposit = cardOf([
        doc('Estimate', { status: 'Accepted', lineItems: line(10000) }),
        doc('Invoice', { status: 'Paid', number: 'DEP-1', paidAt: ago(2), lineItems: line(3000) }),
    ]);
    eq('paid deposit, balance not invoiced → In progress', [deposit.stage, deposit.value, deposit.detail], ['in_progress', 10000, 'Deposit paid, balance not invoiced']);
    const depositDone = cardOf([
        doc('Estimate', { status: 'Accepted', lineItems: line(10000) }),
        doc('Invoice', { status: 'Paid', paidAt: ago(2), lineItems: line(3000) }),
    ], { status: 'completed' });
    eq('finished job with only the deposit billed → not invoiced badge', depositDone.alert?.reason, 'not_invoiced');
    const fullyBilled = cardOf([
        doc('Estimate', { status: 'Accepted', lineItems: line(10000) }),
        doc('Invoice', { status: 'Paid', lineItems: line(3000) }),
        doc('Invoice', { status: 'Paid', lineItems: line(7000) }),
    ]);
    eq('contract fully billed and paid → Paid', [fullyBilled.stage, fullyBilled.value], ['paid', 10000]);
    const receiptOnly = cardOf([doc('Receipt', { amount: 450, date: ago(1) })]);
    eq('receipt without invoice → Paid', [receiptOnly.stage, receiptOnly.value, receiptOnly.detail], ['paid', 450, 'Paid by receipt']);
}

// ======================================================================== off the board
eq('inactive job is hidden', place([doc('Invoice', { status: 'Sent', lineItems: line(1) })], { status: 'inactive' }), { hidden: 'inactive' });
eq('all estimates declined → lost', place([doc('Estimate', { status: 'Rejected' })]), { hidden: 'lost' });
eq('declined + a new draft → back in Requests', 'card' in place([doc('Estimate', { status: 'Rejected' }), doc('Estimate', { status: 'Draft' })]) ? 'request' : 'hidden', 'request');
eq('completed job with nothing → closed', place([], { status: 'completed' }), { hidden: 'closed' });
eq('paused job still on the board', 'card' in place([], { status: 'paused' }), true);
eq('notes and warranties do not move a job', cardOf([doc('Note'), doc('Warranty')]).stage, 'request');

// ======================================================================== quote requests
{
    const fresh = requestCard({ id: 'r1', name: 'Dana', details: 'Leaky roof over the garage\nsecond line', status: 'new', createdAt: `${ago(1)}T09:00:00`, photoCount: 2 }, TODAY);
    eq('new request card', fresh && [fresh.stage, fresh.kind, fresh.title, fresh.client, fresh.detail, fresh.alert, fresh.actions[0]],
        ['request', 'request', 'Leaky roof over the garage', 'Dana', 'New quote request · 2 photos', null, 'convert']);
    const waiting = requestCard({ id: 'r2', name: 'Lee', details: '', status: 'seen', createdAt: `${ago(3)}T09:00:00` }, TODAY);
    eq('request waiting 3 days → no reply badge', waiting && [waiting.title, waiting.alert?.reason, waiting.alert?.label], ['Quote request', 'no_reply', 'No reply · 3d']);
    eq('request exactly 2 days: no badge yet', requestCard({ id: 'r3', name: 'A', status: 'seen', createdAt: `${ago(2)}T09:00:00` }, TODAY)?.alert ?? null, null);
    eq('archived request: no card', requestCard({ id: 'r4', name: 'A', status: 'archived', createdAt: ago(1) }, TODAY), null);
    eq('converted request: no card of its own', requestCard({ id: 'r5', name: 'A', status: 'converted', jobId: 'j9', createdAt: ago(1) }, TODAY), null);
    const long = requestCard({ id: 'r6', name: 'A', status: 'new', createdAt: ago(0), details: 'Replace all of the old cedar siding on the north and east walls of the house please' }, TODAY);
    ok('long request text is cut at a word', !!long && long.title.endsWith('…') && long.title.length <= 61);
}

// ======================================================================== the board
{
    const jobs: PipelineJobInput[] = [
        { id: 'a', name: 'Deck', clientName: 'Ann', status: 'active', createdAt: `${ago(1)}T12:00:00` },
        { id: 'b', name: 'Roof', clientName: 'Bob', status: 'active', createdAt: `${ago(30)}T12:00:00` },
        { id: 'c', name: 'Bath', clientName: 'Cy', status: 'active', createdAt: `${ago(30)}T12:00:00` },
        { id: 'd', name: 'Fence', clientName: 'Di', status: 'active', createdAt: `${ago(30)}T12:00:00` },
        { id: 'e', name: 'Shed', clientName: 'Ed', status: 'inactive', createdAt: `${ago(30)}T12:00:00` },
        { id: 'f', name: 'Old porch', clientName: 'Fay', status: 'completed', createdAt: `${ago(90)}T12:00:00` },
        { id: 'g', name: 'Garage', clientName: 'Gus', status: 'active', createdAt: `${ago(5)}T12:00:00` },
        { id: 'h', name: 'Patio', clientName: 'Hal', status: 'active', createdAt: `${ago(60)}T12:00:00` },
    ];
    const docs: PipelineDoc[] = [
        doc('Estimate', { jobId: 'b', status: 'Sent', number: 'EST-B', issueDate: ago(9), lineItems: line(6000) }),
        doc('Estimate', { jobId: 'c', status: 'Accepted', number: 'EST-C', issueDate: ago(2), lineItems: line(12000) }),
        doc('Invoice', { jobId: 'd', status: 'Sent', number: 'INV-D', issueDate: ago(20), dueDate: ago(6), lineItems: line(2000) }),
        doc('Invoice', { jobId: 'h', status: 'Sent', number: 'INV-H', issueDate: ago(2), dueDate: inDays(12), lineItems: line(500) }),
        doc('Invoice', { jobId: 'f', status: 'Paid', number: 'INV-F', paidAt: ago(60), lineItems: line(900) }),
        doc('Invoice', { jobId: 'g', status: 'Paid', number: 'INV-G', paidAt: ago(1), lineItems: line(300) }),
        doc('Invoice', { jobId: 'zz', status: 'Sent', lineItems: line(99) }), // a deleted job's document
        doc('Note', { jobId: null }),
    ];
    const requests = [
        { id: 'r1', name: 'Rita', details: 'Gutters', status: 'new', createdAt: `${ago(4)}T09:00:00` },
        { id: 'r2', name: 'Ann', details: 'Deck', status: 'converted', jobId: 'a', createdAt: `${ago(1)}T09:00:00` },
        { id: 'r3', name: 'Gone', details: 'x', status: 'converted', jobId: 'deleted-job', createdAt: `${ago(1)}T09:00:00` },
        { id: 'r4', name: 'Arch', details: 'x', status: 'archived', createdAt: `${ago(1)}T09:00:00` },
    ];
    const board = buildPipeline({ jobs, docs, requests, today: TODAY });
    const ids = (stage: string) => board.columns.find(c => c.stage === stage)!.cards.map(c => c.key);
    eq('Requests column: the new request, then the converted job (oldest first, stale first)', ids('request'), ['request:r1', 'job:a']);
    eq('Estimate sent column', ids('estimate'), ['job:b']);
    eq('Approved column', ids('approved'), ['job:c']);
    eq('Invoiced: overdue first', ids('invoiced'), ['job:d', 'job:h']);
    eq('Paid: recent only', ids('paid'), ['job:g']);
    eq('hidden counts', board.hidden, { inactive: 1, lost: 0, closed: 0, olderPaid: 1 });
    eq('column totals', board.columns.map(c => c.total), [null, 6000, 12000, 0, 2500, 300]);
    eq('open value = sent + approved + in progress + due', board.openValue, 20500);
    eq('attention: stale request, stale estimate, overdue invoice', [board.attention, board.columns.map(c => c.attention)], [3, [1, 1, 0, 0, 1, 0]]);
    eq('converted job notes the request', board.cards.find(c => c.key === 'job:a')?.detail, 'Nothing sent yet · from a quote request');
    const all = buildPipeline({ jobs, docs, requests, today: TODAY }, { showOlderPaid: true });
    eq('show older paid: newest first', all.columns.find(c => c.stage === 'paid')!.cards.map(c => c.key), ['job:g', 'job:f']);
    eq('show older paid: none hidden', all.hidden.olderPaid, 0);
    const noFeature = buildPipeline({ jobs, docs, requests: null, today: TODAY });
    eq('request feature missing: jobs still placed', noFeature.columns[0].cards.map(c => c.key), ['job:a']);

    eq('search by client', filterCards(board.cards, 'bob').map(c => c.key), ['job:b']);
    eq('search by document number', filterCards(board.cards, 'inv-d').map(c => c.key), ['job:d']);
    eq('search by request text', filterCards(board.cards, 'gutters').map(c => c.key), ['request:r1']);
    eq('search: two words', filterCards(board.cards, 'roof est-b').map(c => c.key), ['job:b']);
    eq('needs attention only', filterCards(board.cards, '', true).map(c => c.key).sort(), ['job:b', 'job:d', 'request:r1']);
    eq('empty search keeps all', filterCards(board.cards, '  ').length, board.cards.length);

    const mk = (key: string, since: string, tone?: 'warning' | 'danger' | 'success'): PipelineCard => ({
        ...board.cards[0], key, title: key, stage: 'invoiced', since, alert: tone ? { reason: 'overdue', tone, label: '', days: 0 } : null,
    });
    eq('order: danger, success, warning, then oldest', [mk('w', ago(1), 'warning'), mk('plain-old', ago(9)), mk('d', ago(1), 'danger'), mk('s', ago(1), 'success'), mk('plain-new', ago(1))].sort(compareCards).map(c => c.key),
        ['d', 's', 'w', 'plain-old', 'plain-new']);
}

// ======================================================================== row mapping (JSON-path row, full row)
{
    const row = mapPipelineRow({
        id: 'x1', type: 'Invoice', job_id: 'j1', created_at: '2026-11-01T10:00:00Z', public_token: 'tok',
        status: 'Sent', invoiceNumber: 'INV-55', issueDate: '2026-11-01', dueDate: '2026-11-15', lineItems: [{ quantity: 2, rate: 50 }],
        taxRate: '10', amountPaid: null, isProgressBilling: false, paymentReportedAt: null, clientName: 'Zed',
    });
    eq('json-path row', [row.id, row.jobId, row.number, row.status, row.dueDate, row.publicToken, row.clientName, docTotal(row)], ['x1', 'j1', 'INV-55', 'Sent', '2026-11-15', 'tok', 'Zed', 110]);
    const full = mapPipelineRow({ id: 'x2', type: 'Estimate', job_id: 'j2', created_at: '2026-11-01T10:00:00Z', data: { status: 'Accepted', estimateNumber: 'EST-9', lineItems: [{ quantity: 1, rate: 75 }], revisionOf: 'x0', clientSignedAt: '2026-11-02T10:00:00Z' } });
    eq('full row with data', [full.number, full.status, full.revisionOf, approvalState(full), docTotal(full)], ['EST-9', 'Accepted', 'x0', 'accepted', 75]);
    const stringItems = mapPipelineRow({ id: 'x3', type: 'Estimate', lineItems: '[{"quantity":3,"rate":10}]' });
    eq('line items given as JSON text', docTotal(stringItems), 30);
    const junk = mapPipelineRow({ id: 'x4', type: 'Estimate', lineItems: 'not json' });
    eq('broken line items → no lines, total 0', [junk.lineItems, docTotal(junk)], [null, 0]);
    eq('empty row does not throw', mapPipelineRow(null).id, '');
}

// ======================================================================== route, nav, help
eq('/pipeline is a screen', parseView('/pipeline', '', null).screen, 'pipeline');
eq('/pipeline/ (trailing slash)', parseView('/pipeline/', '', null).screen, 'pipeline');
{
    const g = getGuide('pipeline');
    ok('help guide exists', !!g);
    eq('help guide opens the board', g?.appPath, '/pipeline');
    ok('help guide has 3+ steps', (g?.steps.length ?? 0) >= 3);
    const src = ['components/pipeline/PipelineView.tsx', 'components/pipeline/PipelineCard.tsx', 'components/AppNav.tsx', 'components/payments/MarkPaidDialog.tsx']
        .map(f => readFileSync(f, 'utf8')).join('\n');
    const labels = (JSON.stringify(g).match(/\[\[([^\]]+)\]\]/g) || []).map(l => l.slice(2, -2));
    const missing = labels.filter(l => !['Tools', 'More'].includes(l) && !src.includes(`'${l}'`) && !src.includes(`>${l}<`) && !src.includes(` ${l} `));
    eq('every [[label]] of the guide is on screen', missing, []);
    ok('dashboard tip names the board', JSON.stringify(getGuide('dashboard')).includes('[[Pipeline]] board'));
    const nav = readFileSync('components/AppNav.tsx', 'utf8');
    ok('Pipeline is in the Tools menu / More sheet', /dest: 'pipeline', label: 'Pipeline'/.test(nav));
    const app = readFileSync('App.tsx', 'utf8');
    ok('App renders the board', /case 'pipeline':\s*\n?\s*return <PipelineView/.test(app));
    ok('App navigates to /pipeline', app.includes("case 'pipeline': navigate('/pipeline')"));
    ok('dashboard shows the strip', /pipelineSlot=\{/.test(app) && readFileSync('components/DashboardScreen.tsx', 'utf8').includes('{!loading && pipelineSlot}'));
}

console.log(`pipeline-check: ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
