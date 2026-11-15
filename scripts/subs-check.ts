/**
 * Subcontractors + sub commitments + quote comparison (roadmap D7, phase A): pure-logic checks (lib/subs, including
 * quote comparison on random data) and a lint of supabase/migrations/20261116000800_subs_quotes.sql (only ADD COLUMN IF
 * NOT EXISTS on crew_members, nothing destructive, owner-only RLS on both tables, security definer + search_path '',
 * bodies open with `as $$`, anon grants only on the two sub-link functions, the sub-link JSON never carries other subs,
 * quotes or owner notes). No database needed:
 *   npx tsx scripts/subs-check.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    OWNER_TRANSITIONS, SUB_LINK_MISSING, appendPayment, canDelete, canRecordPayment, canSubAccept, canTransition, commitmentInsertRow, commitmentMoney,
    commitmentPatchRow, daysBetween, mapCommitmentRow, mapSubLinkView, mapSubMemberRow, ownerActions, parseAmount, parseRetainage, scheduleInfo,
    sortCommitments, subDisplayName, subLinkProgress, subMemberPatchRow, subNameOf, summarizeCommitments, termsResetAcceptance,
    validateAcceptName, validateCommitmentDraft, validatePayment,
} from '../lib/subs/subLogic.ts';
import {
    QUOTE_TRANSITIONS, canSetQuoteStatus, chooseQuotePlan, commitmentDraftFromQuote, compareQuotes, comparisonMatrix, groupQuotesByScope,
    mapQuoteRow, quoteFileStoragePath, quoteInsertRow, quotePatchRow, scopeKeyOf, validateHttpsUrl, validateQuoteDraft, validateQuoteFile,
} from '../lib/subs/quoteCompare.ts';
import { subcontractBudget, withSubcontracts } from '../lib/subs/subBudget.ts';
import { COMMITMENT_STATUSES, QUOTE_STATUSES, SUB_LIMITS, type CommitmentStatus, type JobQuote, type SubCommitment } from '../lib/subs/subTypes.ts';
import { READ_ONLY_RPCS } from '../lib/offline/writePathScan.ts';
import { WRITE_PATHS } from '../lib/offline/writePathAudit.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

let passes = 0;
let failures = 0;
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
const throws = (label: string, fn: () => unknown, re?: RegExp) => {
    try { fn(); failures++; console.error(`FAIL ${label}: did not throw`); } catch (e) {
        if (re && !re.test(e instanceof Error ? e.message : String(e))) { failures++; console.error(`FAIL ${label}: wrong error ${String(e)}`); } else passes++;
    }
};

// deterministic random
let seed = 20261116;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

const U = '11111111-1111-4111-8111-111111111111';
const J = '22222222-2222-4222-8222-222222222222';
const M = '33333333-3333-4333-8333-333333333333';

const commitment = (over: Partial<SubCommitment> = {}): SubCommitment => ({
    id: 'c1', jobId: J, crewMemberId: M, subName: 'Volt Co', title: 'Electrical rough-in', description: null, amount: 10000, retainagePct: 10,
    startDate: null, dueDate: null, status: 'in_progress', payments: [], paidTotal: 0, issuedAt: null, acceptedAt: null, acceptedBy: null,
    completedAt: null, cancelledAt: null, quoteId: null, notes: null, createdAt: '2026-11-01T00:00:00Z', updatedAt: null, ...over,
});

// ============================================================================================ status machine
eq('statuses', COMMITMENT_STATUSES, ['draft', 'issued', 'accepted', 'in_progress', 'completed', 'cancelled']);
ok('owner never sets accepted', COMMITMENT_STATUSES.every(s => !canTransition(s, 'accepted')));
ok('owner actions are allowed transitions', COMMITMENT_STATUSES.every(s => ownerActions({ status: s }).every(a => canTransition(s, a.to))));
ok('every transition has an action', COMMITMENT_STATUSES.every(s => OWNER_TRANSITIONS[s].every(t => ownerActions({ status: s }).some(a => a.to === t))));
ok('draft -> issued', canTransition('draft', 'issued'));
ok('completed -> in_progress only', OWNER_TRANSITIONS.completed.join() === 'in_progress');
ok('delete: drafts / cancelled without payments', canDelete(commitment({ status: 'draft' })) && !canDelete(commitment({ status: 'issued' }))
    && !canDelete(commitment({ status: 'cancelled', payments: [{ id: 'p', at: '2026-11-01', amount: 5, note: null }] })));
ok('payments only once sent', !canRecordPayment({ status: 'draft' }) && !canRecordPayment({ status: 'cancelled' }) && canRecordPayment({ status: 'accepted' }));
ok('accepted + new amount resets acceptance', termsResetAcceptance(commitment({ status: 'accepted' }), { amount: 9000 }));
ok('accepted + same amount does not', !termsResetAcceptance(commitment({ status: 'accepted' }), { amount: 10000, notes: 'x' }));
ok('in progress: no reset', !termsResetAcceptance(commitment({ status: 'in_progress' }), { amount: 9000 }));

// ============================================================================================ money
eq('parseAmount', [parseAmount('$1,234.567'), parseAmount(-1), parseAmount(''), parseAmount(100_000_000)], [1234.57, null, null, null]);
eq('parseRetainage', [parseRetainage('10%'), parseRetainage(''), parseRetainage(51), parseRetainage(-1)], [10, 0, null, null]);
{
    const c = commitment({ payments: [{ id: 'a', at: '2026-11-01', amount: 4000, note: null }, { id: 'b', at: '2026-11-02', amount: 5000, note: null }] });
    const m = commitmentMoney(c);
    eq('money: in progress', [m.paid, m.remaining, m.pctPaid, m.retainageTotal, m.payableBeforeRelease, m.retainageHeld, m.retainageReleasable, m.payableNow, m.intoRetainage],
        [9000, 1000, 90, 1000, 9000, 1000, 0, 0, false]);
    const done = commitmentMoney({ ...c, status: 'completed' });
    eq('money: completed releases retainage', [done.retainageReleasable, done.payableNow], [1000, 1000]);
    eq('validatePayment: over the amount', validatePayment(c, { amount: 1500 }), "Payments can't add up to more than the agreed amount.");
    eq('validatePayment: below zero', validatePayment(c, { amount: -9500 }), "Payments can't add up to less than zero.");
    eq('validatePayment: zero', validatePayment(c, { amount: '0' }), "A payment can't be zero.");
    eq('validatePayment: draft', validatePayment({ ...c, status: 'draft' }, { amount: 5 }), 'Send the commitment before recording payments.');
    const next = appendPayment(c, { amount: '250.555', at: '2026-11-03', note: '  check 12 ' }, 'pid');
    eq('appendPayment keeps old entries', next.slice(0, 2), c.payments);
    eq('appendPayment new entry', next[2], { id: 'pid', at: '2026-11-03', amount: 250.56, note: 'check 12' });
    throws('appendPayment refuses invalid', () => appendPayment(c, { amount: 99999 }), /more than/);
}
// random money invariants
for (let i = 0; i < 400; i++) {
    const amount = Math.round(rnd() * 5_000_000) / 100;
    const pct = Math.round(rnd() * 5000) / 100;
    const payments = Array.from({ length: Math.floor(rnd() * 6) }, (_, k) => ({ id: `p${k}`, at: '2026-11-01', amount: Math.round(rnd() * amount * 30) / 100, note: null }));
    const status = pick(['issued', 'accepted', 'in_progress', 'completed'] as const);
    const m = commitmentMoney(commitment({ amount, retainagePct: pct, payments, status }));
    const okInv = m.remaining >= 0 && m.retainageHeld <= m.retainageTotal + 1e-9 && m.retainageHeld <= m.remaining + 1e-9
        && Math.abs(m.payableBeforeRelease + m.retainageTotal - m.amount) < 0.011 && m.payableNow >= 0 && m.payableNow <= m.remaining + 1e-9
        && (status === 'completed' ? m.retainageReleasable === m.retainageHeld : m.retainageReleasable === 0)
        && (m.paid > m.amount || Math.abs(m.paid + m.remaining - m.amount) < 0.011);
    if (!okInv) { ok(`money invariants #${i} ${JSON.stringify(m)}`, false); break; }
    if (i === 399) ok('money invariants hold on 400 random commitments', true);
}

// ============================================================================================ schedule + summary
eq('daysBetween', [daysBetween('2026-11-01', '2026-11-15'), daysBetween('2026-03-01', '2026-02-28')], [14, -1]);
eq('overdue', scheduleInfo(commitment({ status: 'accepted', dueDate: '2026-11-10' }), '2026-11-15'), { state: 'overdue', overdue: true, daysLate: 5, startsInDays: null, daysLeft: -5 });
eq('upcoming', scheduleInfo(commitment({ status: 'issued', startDate: '2026-11-20', dueDate: '2026-11-30' }), '2026-11-15').state, 'upcoming');
eq('draft past due is not overdue', scheduleInfo(commitment({ status: 'draft', dueDate: '2026-11-01' }), '2026-11-15').overdue, false);
eq('completed = done', scheduleInfo(commitment({ status: 'completed', dueDate: '2026-11-01' }), '2026-11-15').state, 'done');
eq('no dates', scheduleInfo(commitment({ status: 'issued' }), '2026-11-15').state, 'not_scheduled');
{
    const list = [
        commitment({ id: 'a', status: 'draft', amount: 500 }),
        commitment({ id: 'b', status: 'issued', amount: 1000, dueDate: '2026-11-01' }),
        commitment({ id: 'c', status: 'completed', amount: 2000, retainagePct: 10, payments: [{ id: 'x', at: '2026-11-01', amount: 1800, note: null }] }),
        commitment({ id: 'd', status: 'cancelled', amount: 3000, payments: [{ id: 'y', at: '2026-11-01', amount: 300, note: null }] }),
        commitment({ id: 'e', status: 'cancelled', amount: 999 }),
    ];
    const s = summarizeCommitments(list, '2026-11-15');
    eq('summary', [s.count, s.awaitingAcceptance, s.overdue, s.committed, s.paid, s.outstanding, s.retainageHeld, s.retainageReleasable, s.draftTotal],
        [5, 1, 1, 3300, 2100, 1200, 300, 200, 500]);
    eq('sort: open first', sortCommitments(list).map(c => c.id), ['b', 'a', 'c', 'd', 'e']);
    const b = subcontractBudget(list);
    eq('budget', [b.committed, b.paid, b.outstanding, b.retainageHeld, b.retainageReleasable, b.pendingDrafts, b.count], [3300, 2100, 1200, 300, 200, 500, 3]);
    eq('budget: cancelled counts only what was paid', b.items.find(i => i.id === 'd'), { id: 'd', title: 'Electrical rough-in', subName: 'Volt Co', status: 'cancelled', amount: 300, paid: 300, outstanding: 0 });
    eq('budget: no subs = nothing added', [subcontractBudget([]).committed, withSubcontracts(1234.5, subcontractBudget([]))], [0, 1234.5]);
    eq('withSubcontracts', withSubcontracts(1000, b), 4300);
}

// ============================================================================================ rows
{
    const row = commitmentInsertRow({ crewMemberId: M, title: '  Framing ', amount: 1200.555, retainagePct: 5, startDate: '2026-11-20', dueDate: '2026-12-01' }, U, J, true);
    eq('insert row', [row.status, row.title, row.amount, row.retainage_pct, row.sub_name, row.payments], ['issued', 'Framing', 1200.56, 5, '', []]);
    ok('insert row never writes acceptance / paid total', !('accepted_at' in row) && !('accepted_by' in row) && !('paid_total' in row) && !('status' in commitmentPatchRow({ title: 'x' })));
    throws('insert: needs a title', () => commitmentInsertRow({ crewMemberId: M, title: ' ', amount: 1 }, U, J), /scope/);
    throws('insert: needs who', () => commitmentInsertRow({ title: 'x', amount: 1 }, U, J), /subcontractor/);
    eq('dates order', validateCommitmentDraft({ subName: 'x', title: 'x', amount: 1, startDate: '2026-12-02', dueDate: '2026-12-01' }), 'The start date is after the due date.');
    eq('patch row', commitmentPatchRow({ amount: 50, retainagePct: null, dueDate: '' }), { amount: 50, retainage_pct: 0, due_date: null });
    const mapped = mapCommitmentRow({ id: 'x', job_id: J, sub_name: 'S', title: 'T', amount: '1500.50', retainage_pct: '5.00', status: 'accepted', paid_total: '100',
        payments: [{ id: 'p', at: '2026-11-01', amount: '100', note: null }, 'junk'], accepted_by: 'Sam', start_date: '2026-11-20T00:00:00' });
    eq('map row', [mapped.amount, mapped.retainagePct, mapped.status, mapped.payments.length, mapped.payments[0].amount, mapped.acceptedBy, mapped.startDate], [1500.5, 5, 'accepted', 1, 100, 'Sam', '2026-11-20']);
    const mem = mapSubMemberRow({ id: M, name: 'Sam', kind: 'subcontractor', company: 'Volt Co', trade: 'Electrical', link_nonce: 'abc' });
    eq('member map', [mem.kind, mem.linkOn, subDisplayName(mem), subNameOf(mem)], ['subcontractor', true, 'Volt Co (Sam)', 'Volt Co']);
    eq('member map default employee', mapSubMemberRow({ id: M, name: 'Ann' }).kind, 'employee');
    eq('member patch', subMemberPatchRow({ kind: 'subcontractor', company: ' Volt ', trade: '' }), { kind: 'subcontractor', company: 'Volt', trade: null });
    throws('member patch: bad kind', () => subMemberPatchRow({ kind: 'boss' as any }));
}

// ============================================================================================ quotes
eq('scope key', scopeKeyOf('  Electrical\t Rough-in  '), 'electrical rough-in');
eq('quote statuses', QUOTE_STATUSES, ['received', 'shortlisted', 'rejected', 'chosen']);
ok('rejected cannot jump to chosen', !canSetQuoteStatus('rejected', 'chosen') && QUOTE_TRANSITIONS.received.includes('chosen'));
eq('https only', [validateHttpsUrl('http://x.com').ok, validateHttpsUrl('example.com/q.pdf'), validateHttpsUrl('https://a b').ok],
    [false, { ok: true, url: 'https://example.com/q.pdf' }, false]);
eq('quote file types', [validateQuoteFile({ name: 'q.pdf', size: 10 }), validateQuoteFile({ name: 'q.docx', size: 10 }), validateQuoteFile({ name: 'q.png', size: 16 * 1024 * 1024 })],
    [null, 'Quotes can be PDF, JPG, PNG or WebP files.', 'Files can be up to 15 MB.']);
{
    const path = quoteFileStoragePath(U, J, 'Volt Co quote (final).PDF', 'application/pdf', 'abc123def456');
    eq('quote file path', path, `${U}/quotes/${J}/abc123def456-Volt-Co-quote-final.pdf`);
    ok('quote file path matches SQL', /^[0-9a-f-]{36}\/quotes\/[0-9a-f-]{36}\/[a-z0-9]{8,32}-[A-Za-z0-9_-]{1,80}\.(pdf|jpg|jpeg|png|webp)$/.test(path));
    ok('random quote paths match SQL', Array.from({ length: 50 }, () => quoteFileStoragePath(U, J, pick(['a.jpg', 'É x.png', '...webp', 'scan']), null))
        .every(p => /^[0-9a-f-]{36}\/quotes\/[0-9a-f-]{36}\/[a-z0-9]{8,32}-[A-Za-z0-9_-]{1,80}\.(pdf|jpg|jpeg|png|webp)$/.test(p)));
    const row = quoteInsertRow({ scope: ' Electrical ', crewMemberId: M, amount: 9000, url: 'volt.example/q', leadTimeDays: 10 }, U, J);
    eq('quote insert row', [row.status, row.scope, row.vendor_name, row.url, row.lead_time_days], ['received', 'Electrical', '', 'https://volt.example/q', 10]);
    ok('quote insert never sets file / chosen fields', !('file_path' in row) && !('chosen_at' in row) && !('scope_key' in row));
    eq('quote needs who', validateQuoteDraft({ scope: 'x', amount: 5 }), 'Add who the quote is from.');
    eq('quote lead time', validateQuoteDraft({ scope: 'x', vendorName: 'v', amount: 5, leadTimeDays: 4000 }), 'Lead time is 0 to 3650 days.');
    eq('quote patch', quotePatchRow({ url: null, validUntil: '' }), { valid_until: null, url: null });
    const q = mapQuoteRow({ id: 'q', job_id: J, scope: 'Electrical Rough-in', amount: '9000.10', status: 'chosen', lead_time_days: 5 });
    eq('quote map', [q.scopeKey, q.amount, q.status, q.leadTimeDays], ['electrical rough-in', 9000.1, 'chosen', 5]);
}

const quote = (over: Partial<JobQuote>): JobQuote => ({
    id: 'q', jobId: J, scope: 'Electrical rough-in', scopeKey: 'electrical rough-in', vendorName: 'V', crewMemberId: null, supplierId: null, amount: 1000,
    inclusions: 'wire, boxes', exclusions: 'fixtures', notes: null, leadTimeDays: 10, validUntil: '2026-12-31', receivedOn: '2026-11-10', url: null,
    filePath: `${U}/quotes/${J}/abcdefgh-q.pdf`, fileName: 'q.pdf', sizeBytes: 10, status: 'received', chosenAt: null, createdAt: '2026-11-10T00:00:00Z', ...over,
});
{
    const qs = [
        quote({ id: 'a', vendorName: 'A', amount: 10000 }),
        quote({ id: 'b', vendorName: 'B', amount: 9500, inclusions: null, leadTimeDays: 30 }),
        quote({ id: 'c', vendorName: 'C', amount: 10400, leadTimeDays: 3 }),
        quote({ id: 'd', vendorName: 'D', amount: 8000, validUntil: '2026-11-01' }),
        quote({ id: 'e', vendorName: 'E', amount: 7000, status: 'rejected' }),
        quote({ id: 'f', vendorName: 'F', amount: 12000, receivedOn: '2026-08-01', filePath: null, fileName: null, validUntil: '2026-11-18' }),
    ];
    const rows = compareQuotes(qs, { today: '2026-11-15' });
    const by = (id: string) => rows.find(r => r.quote.id === id)!;
    eq('compare: order by amount', rows.map(r => r.quote.id), ['e', 'd', 'b', 'a', 'c', 'f']);
    eq('compare: ranks (active only)', rows.map(r => r.rank), [null, null, 1, 2, 3, 4]);
    ok('compare: lowest active', by('b').flags.includes('lowest') && !by('d').flags.includes('lowest') && !by('e').flags.includes('lowest'));
    ok('compare: expired / rejected flags', by('d').flags.includes('expired') && by('e').flags.includes('rejected'));
    ok('compare: near lowest (10%)', by('a').flags.includes('near_lowest') && by('c').flags.includes('near_lowest') && !by('f').flags.includes('near_lowest'));
    ok('compare: highest', by('f').flags.includes('highest'));
    ok('compare: missing inclusions', by('b').flags.includes('missing_inclusions'));
    ok('compare: stale / no document / expiring soon', by('f').flags.includes('stale') && by('f').flags.includes('no_document') && by('f').flags.includes('expiring_soon'));
    ok('compare: fastest', by('c').flags.includes('fastest'));
    eq('compare: best value (cheapest after adjustments)', rows.filter(r => r.flags.includes('best_value')).map(r => r.quote.id), ['a']);
    eq('compare: diff / pct', [by('a').diffFromLowest, by('a').pctAboveLowest], [500, 5.3]);
    const matrix = comparisonMatrix(rows);
    ok('matrix: one cell per quote per row', matrix.length === 10 && matrix.every(r => r.cells.length === rows.length && r.cells.every((c, i) => c.quoteId === rows[i].quote.id)));
    ok('matrix: best amount cell', matrix.find(r => r.key === 'amount')!.cells.filter(c => c.best).map(c => c.quoteId).join() === 'b');
    ok('matrix: missing inclusions warn', matrix.find(r => r.key === 'inclusions')!.cells.find(c => c.quoteId === 'b')!.warn);
    const groups = groupQuotesByScope([...qs, quote({ id: 'g', scope: 'Plumbing', scopeKey: 'plumbing', amount: 50, status: 'chosen' })]);
    eq('groups', groups.map(g => [g.scopeKey, g.quotes.length, g.activeCount, g.lowest, g.chosen?.id ?? null]).sort(),
        [['electrical rough-in', 6, 5, 8000, null], ['plumbing', 1, 1, 50, 'g']]);
    const plan = chooseQuotePlan([...qs.map(q => q.id === 'a' ? { ...q, status: 'chosen' as const } : q)], 'b');
    eq('choose plan: previous chosen back to shortlist', plan, { choose: 'b', unchoose: ['a'] });
    throws('choose plan: not a rejected quote', () => chooseQuotePlan(qs, 'e'), /rejected/);
    const draft = commitmentDraftFromQuote(quote({ id: 'a', crewMemberId: M, amount: 10000 }), { id: M, kind: 'subcontractor', name: 'Sam', company: 'Volt Co' }, { retainagePct: 10 });
    eq('draft from quote', [draft.crewMemberId, draft.subName, draft.title, draft.amount, draft.retainagePct, draft.quoteId, draft.description],
        [M, 'Volt Co', 'Electrical rough-in', 10000, 10, 'a', 'Includes: wire, boxes\n\nExcludes: fixtures']);
    eq('draft from vendor quote', [commitmentDraftFromQuote(quote({ vendorName: 'Supply Inc' })).crewMemberId, commitmentDraftFromQuote(quote({ vendorName: 'Supply Inc' })).subName], [null, 'Supply Inc']);
    eq('draft from quote is a valid draft', validateCommitmentDraft(draft), null);
}
// random comparison invariants
for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(rnd() * 8);
    const qs = Array.from({ length: n }, (_, k) => quote({
        id: `q${k}`, amount: Math.round(rnd() * 20) * 500, status: pick(['received', 'shortlisted', 'rejected', 'received'] as const),
        validUntil: rnd() < 0.2 ? '2026-11-01' : rnd() < 0.3 ? null : '2027-01-01', leadTimeDays: rnd() < 0.3 ? null : Math.floor(rnd() * 60),
        inclusions: rnd() < 0.3 ? null : 'x', exclusions: rnd() < 0.3 ? null : 'y', filePath: rnd() < 0.3 ? null : `${U}/quotes/${J}/abcdefgh-q.pdf`,
    }));
    const rows = compareQuotes(qs, { today: '2026-11-15', nearPct: 10 });
    const active = rows.filter(r => r.rank !== null);
    const minActive = active.length ? Math.min(...active.map(r => r.quote.amount)) : null;
    const problems: string[] = [];
    if (rows.length !== n) problems.push('length');
    for (let k = 1; k < rows.length; k++) if (rows[k].quote.amount < rows[k - 1].quote.amount) problems.push('order');
    for (const r of rows) {
        const expired = !!r.quote.validUntil && r.quote.validUntil < '2026-11-15';
        if ((r.rank === null) !== (r.quote.status === 'rejected' || expired)) problems.push('active');
        if (r.flags.includes('lowest') !== (r.rank !== null && r.quote.amount === minActive)) problems.push('lowest');
        if (r.flags.includes('lowest') && r.rank !== 1) problems.push('rank1');
        if (r.flags.includes('lowest') && r.flags.includes('near_lowest')) problems.push('both');
        if (r.flags.includes('near_lowest') && !(minActive !== null && r.quote.amount <= minActive * 1.1)) problems.push('near');
        if (r.rank !== null && minActive !== null && r.diffFromLowest !== r.quote.amount - minActive) problems.push('diff');
    }
    for (let k = 1; k < active.length; k++) if (active[k].rank! < active[k - 1].rank! || active[k].rank! - active[k - 1].rank! > 1) problems.push('dense');
    const best = rows.filter(r => r.flags.includes('best_value'));
    if (best.length !== (active.length >= 2 ? 1 : 0)) problems.push('best count');
    if (best.length && best[0].adjustedAmount! > Math.min(...active.map(r => r.adjustedAmount!))) problems.push('best min');
    if (best.length && best[0].rank === null) problems.push('best inactive');
    if (rows.some(r => r.adjustedAmount !== null && r.adjustedAmount < r.quote.amount)) problems.push('adjusted');
    if (comparisonMatrix(rows).some(m => m.cells.length !== n)) problems.push('matrix');
    if (problems.length) { ok(`random comparison #${i}: ${[...new Set(problems)].join(', ')}`, false); break; }
    if (i === 299) ok('quote comparison invariants hold on 300 random scopes', true);
}

// ============================================================================================ crew link view
{
    const v = mapSubLinkView({ server_now: 'now', member: { name: 'Sam', company: 'Volt', trade: 'Electrical', is_subcontractor: true }, commitments: [
        { id: 'c', job_id: J, job_name: 'Kitchen', job_address: '1 Main', job_status: 'active', title: 'Rough-in', amount: '1000', retainage_pct: '10', status: 'issued', paid_total: 0, tasks_done: 3, tasks_total: 4 },
        { nope: true },
    ] });
    eq('link view', [v.available, v.member?.isSubcontractor, v.commitments.length, v.commitments[0].amount, canSubAccept(v.commitments[0]), subLinkProgress(v.commitments[0])], [true, true, 1, 1000, true, 75]);
    eq('missing view', [SUB_LINK_MISSING.available, SUB_LINK_MISSING.commitments.length], [false, 0]);
    eq('accept name', [validateAcceptName(' '), validateAcceptName('Sam')], ['Type your name to accept.', null]);
    eq('no tasks = no progress', subLinkProgress({ tasksDone: 0, tasksTotal: 0 }), null);
}

// ============================================================================================ limits mirror SQL
const SQL = read('supabase/migrations/20261116000800_subs_quotes.sql');
const code = SQL.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const lower = code.toLowerCase();
ok('limits: 200 commitments / 300 quotes per job', lower.includes('v_count >= 200') && lower.includes('v_count >= 300') && SUB_LIMITS.commitmentsPerJob === 200 && SUB_LIMITS.quotesPerJob === 300);
ok('limits: amounts / retainage / payments / lead time', lower.includes('amount between 0 and 99999999') && lower.includes('retainage_pct between 0 and 50')
    && lower.includes('jsonb_array_length(payments) <= 100') && lower.includes('lead_time_days between 0 and 3650') && SUB_LIMITS.maxAmount === 99_999_999 && SUB_LIMITS.payments === 100);
// the owner transitions in SQL == OWNER_TRANSITIONS
{
    const flow = (code.match(/create or replace function public\.guard_sub_commitment_flow\(\)[\s\S]*?\n\$\$;/) || [''])[0];
    const sqlT: Record<string, string[]> = {};
    for (const m of flow.matchAll(/\(old\.status = '(\w+)' and new\.status (?:in \(([^)]*)\)|= '(\w+)')\)/g)) {
        sqlT[m[1]] = m[2] ? [...m[2].matchAll(/'(\w+)'/g)].map(x => x[1]) : [m[3]];
    }
    eq('SQL transitions == OWNER_TRANSITIONS', sqlT, Object.fromEntries(Object.entries(OWNER_TRANSITIONS).map(([k, v]) => [k, [...v]])));
}

// ============================================================================================ SQL lint
ok('header: not applied yet, needs owner OK', /^-- Applied: NOT YET \(needs owner OK\)/.test(SQL));
ok('no Kelviq / merchant of record', !/kelviq|merchant of record/i.test(SQL));
for (const re of [/\bdrop\s+table\b/, /\bdrop\s+column\b/, /\btruncate\s+(table\s+)?public\./, /\bdelete\s+from\b/, /\bdrop\s+function\b/, /\bdrop\s+schema\b/,
    /\bupdate\s+storage\./, /\binsert\s+into\s+storage\./, /\bon\s+storage\.objects/, /\balter\s+type\b/, /\bstorage\.buckets\b/, /\bdrop\s+index\b/,
    /\bdrop\s+constraint\b/, /\balter\s+column\b/, /\brename\b/, /\bupdate\s+public\.(?!sub_commitments\b|crew_members\b)/, /\binsert\s+into\s+public\.(?!crew_rate_events\b)/,
    /\balter\s+table\s+public\.(?!crew_members\b|job_quotes\b|sub_commitments\b)/]) {
    ok(`no destructive / out-of-scope statement ${re}`, !re.test(lower));
}
const crewAlters = [...lower.matchAll(/alter table public\.crew_members ([^;]*);/g)].map(m => m[1].replace(/\s+/g, ' '));
ok('crew_members: only ADD COLUMN IF NOT EXISTS', crewAlters.length === 3 && crewAlters.every(a => a.startsWith('add column if not exists ')));
eq('crew_members: the 3 approved columns', crewAlters.map(a => a.split(' ')[5]), ['kind', 'company', 'trade']);
ok('crew_members.kind defaults to employee (existing rows unchanged)', /add column if not exists kind text not null default 'employee'\s+check \(kind in \('employee', 'subcontractor'\)\)/.test(lower));
ok('existing crew functions untouched', !/create or replace function public\.(crew_portal_get|crew_punch|crew_tasks_get|crew_task_update|guard_crew_member|_crew_member_id|_crew_rate_guard|crew_links|crew_member_link)\(/.test(lower));
ok('existing crew trigger untouched', !lower.includes('trg_crew_members_guard on'));
eq('tables: only the two approved', [...lower.matchAll(/create table if not exists (public\.[a-z_]+)/g)].map(m => m[1]), ['public.job_quotes', 'public.sub_commitments']);
eq('no plain create table', (lower.match(/create table (?!if not exists)/g) || []).length, 0);
ok('indexes: if not exists', (lower.match(/create (unique )?index (?!if not exists)/g) || []).length === 0);
const policies = [...lower.matchAll(/create policy (\w+) on (public\.\w+)/g)].map(m => m[1]);
ok('every policy dropped first', policies.every(p => lower.includes(`drop policy if exists ${p} on`)));
const triggers = [...lower.matchAll(/create trigger (\w+)/g)].map(m => m[1]);
ok('every trigger dropped first', triggers.length === 6 && triggers.every(t => lower.includes(`drop trigger if exists ${t} on`)));
ok('flow trigger runs before the guard (name order)', 'trg_sub_commitments_flow' < 'trg_sub_commitments_guard');
ok('new crew trigger runs after the existing guard (name order)', 'trg_crew_members_guard' < 'trg_crew_members_sub');
for (const t of ['job_quotes', 'sub_commitments']) {
    ok(`${t}: RLS enabled`, lower.includes(`alter table public.${t} enable row level security`));
    for (const op of ['select', 'insert', 'update', 'delete']) {
        const m = new RegExp(`create policy ${t}_${op}_own on public\\.${t} for ${op} to authenticated\\s+([^;]*);`).exec(lower);
        ok(`${t}: ${op} policy exists`, !!m);
        ok(`${t}: ${op} policy owner-only`, (m?.[1] || '').replace(/\s+/g, ' ').split(/using|with check/).slice(1)
            .every(part => part.trim().replace(/[()]/g, '').trim().startsWith('user_id = select auth.uid')));
    }
    eq(`${t}: exactly 4 policies`, policies.filter(p => p.startsWith(`${t}_`)).length, 4);
}
eq('no policy on other tables', policies.filter(p => !/^(job_quotes|sub_commitments)_/.test(p)), []);
ok('tables: anon has nothing', /revoke all on public\.job_quotes, public\.sub_commitments from anon/.test(lower));
ok('no table grant to anon', !/grant [^;]* on (table )?public\.[^;]* to [^;]*\banon\b/.test(lower.replace(/grant execute on function[^;]*;/g, '')));

const fnRe = /create or replace function (public\.\w+)\(([^)]*)\)([\s\S]*?)\n\$\$;/g;
const fns = [...code.matchAll(fnRe)].map(m => ({ name: m[1], args: m[2], text: m[0] }));
eq('functions', fns.map(f => f.name).sort(), [
    'public._crew_sub_commitment_json', 'public.crew_sub_accept', 'public.crew_sub_get', 'public.guard_crew_member_sub', 'public.guard_job_quote',
    'public.guard_sub_commitment', 'public.guard_sub_commitment_flow',
].sort());
for (const f of fns) {
    const head = f.text.slice(0, f.text.indexOf('$$'));
    ok(`${f.name}: set search_path = ''`, /set search_path = ''/.test(head));
    ok(`${f.name}: body opens with "as $$"`, /\nas \$\$\n/.test(f.text));
    if (f.name === 'public.guard_sub_commitment_flow') {
        ok(`${f.name}: invoker on purpose`, !/security definer/.test(head) && /current_user in \('authenticated', 'anon'\)/.test(f.text));
        ok(`${f.name}: reads no table`, !/\b(from|join)\s+public\./.test(f.text.toLowerCase()));
    } else {
        ok(`${f.name}: security definer`, /security definer/.test(head));
    }
    ok(`${f.name}: schema-qualified tables`, ![...f.text.matchAll(/\b(from|join|update|into)\s+(?!public\.|auth\.|jsonb_|unnest|v_|new\.|old\.|x\b|p\b|\()(\w+)/gi)]
        .some(m => /^(job_quotes|sub_commitments|crew_members|jobs|job_tasks|suppliers|crew_rate_events|clients|documents)$/.test(m[2])));
    ok(`${f.name}: revoked from public / anon / authenticated`, new RegExp(`revoke all on function ${f.name.replace('.', '\\.')}\\([^)]*\\) from public, anon, authenticated`).test(lower));
}
eq('every $$ body opens with "as $$"', (code.match(/\$\$/g) || []).length, (code.match(/\nas \$\$\n/g) || []).length * 2);
ok('no DO blocks', !/\bdo \$\$/.test(lower));
const granted = [...lower.matchAll(/grant execute on function (public\.\w+)\([^)]*\)\s+to ([^;]+);/g)].map(m => ({ fn: m[1], to: m[2].trim() }));
eq('anon grants only on the two sub-link functions', granted.filter(g => /\banon\b/.test(g.to)).map(g => g.fn).sort(), ['public.crew_sub_accept', 'public.crew_sub_get']);
eq('no other execute grants', granted.length, 2);

const fnText = (name: string) => fns.find(f => f.name === name)?.text || '';
for (const name of ['public.crew_sub_get', 'public.crew_sub_accept']) {
    const t = fnText(name);
    ok(`${name}: crew pattern (flag, rate guard, token, bad-link log)`, t.includes("perform set_config('cd.crew_rpc', 'on', true);") && t.includes('public._crew_rate_guard(v_hash, null,')
        && t.includes('v_id := public._crew_member_id(p_token);') && t.includes("insert into public.crew_rate_events (ip_hash, kind) values (v_hash, 'bad');")
        && t.includes("return jsonb_build_object('error', 'invalid_link');") && t.includes('public._crew_rate_guard(v_hash, v_m.id,'));
    ok(`${name}: paused account`, t.includes("if public.user_effective_tier(v_m.user_id) = 'free' then") && t.includes("return jsonb_build_object('error', 'paused');"));
    ok(`${name}: only the link's own commitments`, t.includes('c.user_id = v_m.user_id') && t.includes('c.crew_member_id = v_m.id'));
}
ok('crew_sub_get: no drafts / cancelled', fnText('public.crew_sub_get').includes("c.status in ('issued', 'accepted', 'in_progress')") && !/'draft'|'cancelled'/.test(fnText('public.crew_sub_get')));
ok('crew_sub_get: never reads quotes or other tables of the owner', !/job_quotes|public\.clients|public\.documents|public\.suppliers|time_punches/.test(fnText('public.crew_sub_get') + fnText('public._crew_sub_commitment_json')));
// JSON keys returned to the sub (a key = a string literal followed by a comma, not after -> / ->>)
const OWNER_ONLY = ['user_id', 'notes', 'payments', 'quote_id', 'sub_name', 'vendor_name', 'supplier_id', 'inclusions', 'exclusions', 'crew_member_id',
    'client_name', 'client_email', 'client_phone', 'client_id', 'cost_rate', 'phone', 'email', 'link_nonce', 'price', 'total', 'budget', 'cancelled_at', 'members', 'quotes'];
for (const name of ['public._crew_sub_commitment_json', 'public.crew_sub_get']) {
    const t = fnText(name).slice(fnText(name).indexOf('jsonb_build_object'));
    const keys = [...t.matchAll(/(?<!->>?)'([a-z_]+)',/g)].map(m => m[1]);
    ok(`${name}: has json keys`, keys.length >= 4);
    eq(`${name}: no owner-only json keys`, keys.filter(k => OWNER_ONLY.includes(k)), []);
}
ok('sub json: job facts = what crew_portal_get shows (name, address, status)', /'job_name', j\.name/.test(fnText('public._crew_sub_commitment_json'))
    && fnText('public._crew_sub_commitment_json').includes("'job_address', coalesce(j.client_address, '')") && !/j\.client_(name|email|phone|id)|j\.(budget|price|total|notes)/.test(fnText('public._crew_sub_commitment_json')));
// the accept function writes only the acceptance fields
const accept = fnText('public.crew_sub_accept');
const updates = [...accept.matchAll(/update public\.(\w+)\s+set([\s\S]*?)\n\s*where/g)];
eq('accept: updates only sub_commitments (+ last seen)', updates.map(u => u[1]), ['sub_commitments']);
ok('accept: last seen like the crew calls', accept.includes('update public.crew_members set last_seen_at = now() where id = v_m.id;') && (accept.match(/update public\./g) || []).length === 2);
eq('accept: writes only the acceptance fields', (updates[0]?.[2] || '').split('\n').map(l => /^\s*(\w+)\s*=/.exec(l)?.[1]).filter(Boolean), ['status', 'accepted_at', 'accepted_by']);
ok('accept: issued -> accepted once', accept.includes("if v_c.status <> 'issued' then") && accept.includes('ALREADY_ACCEPTED') && accept.includes("hint = 'already_accepted'") && accept.includes("set status = 'accepted'"));
ok('accept: locks the row, caps the name', accept.includes('for update') && accept.includes('public._clean_text(p_name, 120)'));
ok('accept: no delete', !/\bdelete from\b/i.test(accept));
// the browser cannot write the acceptance
const flow = fnText('public.guard_sub_commitment_flow');
for (const f of ['accepted_at', 'accepted_by', 'issued_at', 'completed_at', 'cancelled_at']) ok(`flow: browser keeps ${f}`, flow.includes(`new.${f} := old.${f};`));
ok('flow: browser insert as draft / issued only', /if v_browser then\s+if new\.status not in \('draft', 'issued'\)/.test(flow));
ok('flow: accepted never a browser target', !/new\.status in \([^)]*'accepted'/.test(flow) && !/new\.status = 'accepted'/.test(flow));
ok('flow: new terms send an accepted commitment back to issued', /elsif old\.status = 'accepted'[\s\S]*new\.status := 'issued';[\s\S]*new\.accepted_at := null;/.test(flow));
// guards
const gq = fnText('public.guard_job_quote');
const gc = fnText('public.guard_sub_commitment');
const gm = fnText('public.guard_crew_member_sub');
ok('guards: Premium on insert', gq.includes("not in ('premium', 'ai')") && gc.includes("not in ('premium', 'ai')") && gq.includes('is_service_context') && gc.includes('is_service_context'));
ok('guards: same-owner job', gq.includes('j.user_id = new.user_id') && gc.includes('j.user_id = new.user_id'));
ok('guards: same-owner crew member / supplier / quote', gq.includes('m.user_id = new.user_id') && gq.includes('s.user_id = new.user_id')
    && gc.includes("m.user_id = new.user_id and m.kind = 'subcontractor'") && gc.includes('q.user_id = new.user_id and q.job_id = new.job_id'));
ok('guards: jobs cannot move', gq.includes('new.job_id is distinct from old.job_id') && gc.includes('new.job_id is distinct from old.job_id'));
ok('guards: https links only', gq.includes("'^https://[^[:space:]]+$'") && !/https\?:/.test(code));
ok('guards: quote files in <user>/quotes/<job>/', gq.includes("new.user_id::text || '/quotes/' || new.job_id::text || '/'"));
ok('guards: payments append-only + total range', gc.includes('Payments can be added, not changed or removed') && gc.includes('new.paid_total > new.amount') && gc.includes('new.paid_total < 0')
    && gc.includes("errcode = '42501'") && lower.includes('paid_total >= 0 and paid_total <= amount'));
ok('guards: paid_total derived by the database', gc.includes('new.paid_total := coalesce((select sum('));
ok('guards: OLD read only in the UPDATE branch', [gq, gc, gm].every(t => !/tg_op = 'insert' or [^\n]*old\./i.test(t) && !/tg_op = 'update' and old\./i.test(t)));
ok('crew guard: no switch back while commitments are open', gm.includes("old.kind = 'subcontractor' and new.kind = 'employee'"));
ok('one chosen quote per scope', lower.includes("create unique index if not exists ux_job_quotes_chosen_scope on public.job_quotes (job_id, scope_key) where status = 'chosen'"));

// ============================================================================================ wiring
const api = read('lib/subs/subsApi.ts');
const pub = read('lib/subs/subPublicApi.ts');
ok('feature probe checks both tables and the new columns', api.includes("from('sub_commitments').select('id')") && api.includes("from('job_quotes').select('id')") && api.includes("select('id, kind, company, trade')"));
ok('feature hidden until ready', api.includes("createBackendFeature('cd.subs.feature'") && api.includes('export const useSubsFeature'));
ok('public api: missing functions keep the crew link as before', (pub.match(/return SUB_LINK_MISSING;/g) || []).length === 2);
ok('public api: same conventions as tasksPublicApi', pub.includes('crewAnswerError(data)') && pub.includes('classifyCrewError'));
for (const f of ['lib/subs/subLogic.ts', 'lib/subs/quoteCompare.ts', 'lib/subs/subBudget.ts', 'lib/subs/subTypes.ts']) ok(`${f} is pure`, !/supabase|from 'react'/.test(read(f).split('\n').filter(l => l.startsWith('import')).join('\n')));
ok('lib/costing.ts unchanged (no subs in it)', !/sub_commitments|lib\/subs|subcontractBudget/.test(read('lib/costing.ts')));
ok('offline: crew_sub_get is a read', READ_ONLY_RPCS.has('crew_sub_get'));
ok('offline: sub accept is public', WRITE_PATHS.some(w => w.file === 'lib/subs/subPublicApi.ts' && w.match.includes('crew_sub_accept') && w.offline === 'public'));
ok('offline: every subsApi write needs a connection', WRITE_PATHS.filter(w => w.file === 'lib/subs/subsApi.ts').length >= 14 && WRITE_PATHS.filter(w => w.file === 'lib/subs/subsApi.ts').every(w => w.offline === 'needs_connection'));
ok('no Kelviq anywhere in lib/subs', !/kelviq|merchant of record/i.test(['subLogic', 'quoteCompare', 'subBudget', 'subTypes', 'subsApi', 'subPublicApi'].map(f => read(`lib/subs/${f}.ts`)).join('\n')));

console.log(`subs-check: ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
