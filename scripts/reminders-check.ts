/**
 * Checks for automatic reminders (pure logic, no network): due-date math and time zones, stop conditions,
 * switches, the email cap and "never sent twice".
 * Run: npx tsx scripts/reminders-check.ts   (also with TZ=Pacific/Auckland: results must not depend on the machine)
 */
import {
  addDays, canSendEmail, decideDue, DEFAULT_REMINDER_SETTINGS, dedupeKey, diffDays, effectiveTier, eligibility, instantYmd,
  isRetryable, normalizeOffsets, planSteps, planTarget, safeTimezone, settingsFromRow, settingsToRow, stepKeyFor, stopReason,
  toYmd, zonedNow, type DecisionInput, type RecordedReminder, type ReminderSettings, type TargetFacts,
} from '../supabase/functions/reminders/shared/schedule.ts';
import { buildValues, DEFAULT_TEMPLATES, fillTemplate, renderReminder, resolveTemplate } from '../supabase/functions/reminders/shared/messages.ts';
import { computeTotals, invoiceBalance, receiptsForInvoice } from '../supabase/functions/reminders/shared/money.ts';
import { factsFromDoc, recipientOf, reminderLink, resolveClient, type DocRow } from '../supabase/functions/reminders/shared/targets.ts';
import { dispatchReminders, SendFailure, type Claim, type DispatchDeps, type OutgoingReminder } from '../supabase/functions/reminders/shared/dispatch.ts';
import { constantTimeEqual, verifyCronSecret } from '../supabase/functions/reminders/shared/cronAuth.ts';
import { computeDocumentTotals } from '../utils/money.ts';
import { docRowFromForm } from '../lib/reminders.ts';

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
const ok = (label: string, cond: unknown) => eq(label, !!cond, true);

const NY = 'America/New_York';
/** An instant given as New York wall-clock time (EST/EDT handled by the offset argument). */
const at = (iso: string) => new Date(iso);
const settings = (patch: Partial<ReminderSettings> = {}): ReminderSettings => ({ ...DEFAULT_REMINDER_SETTINGS, templates: {}, ...patch });
const LAUNCH = '2026-11-01T00:00:00Z';

const invoice = (patch: Partial<TargetFacts> = {}): TargetFacts => ({
  kind: 'invoice', id: 'inv-1', createdAt: '2026-11-02T15:00:00Z', status: 'Sent', dueDate: '2026-11-20', issueDate: '2026-11-02',
  sentAt: '2026-11-02T15:00:00Z', total: 1000, balanceDue: 1000, ...patch,
});
const estimate = (patch: Partial<TargetFacts> = {}): TargetFacts => ({
  kind: 'estimate', id: 'est-1', createdAt: '2026-11-05T14:00:00Z', status: 'Sent', issueDate: '2026-11-05', sentAt: '2026-11-05T14:00:00Z',
  expiryDate: '2026-12-31', total: 5000, ...patch,
});
const visit = (patch: Partial<TargetFacts> = {}): TargetFacts => ({
  kind: 'visit', id: 'job-1', createdAt: '2026-11-01T12:00:00Z', startDate: '2026-11-20', jobStatus: 'active', ...patch,
});
const decide = (facts: TargetFacts, now: string, extra: Partial<DecisionInput> = {}) =>
  decideDue({ facts, settings: settings(), overrides: {}, launchedAt: LAUNCH, recorded: [], now: at(now), ...extra });

/* ================================================================ 1. dates and time zones */
eq('addDays month end', addDays('2026-01-31', 1), '2026-02-01');
eq('addDays leap year', addDays('2028-02-28', 1), '2028-02-29');
eq('addDays negative across year', addDays('2027-01-01', -1), '2026-12-31');
eq('addDays across US DST', addDays('2026-03-07', 2), '2026-03-09');
eq('diffDays', diffDays('2026-11-27', '2026-11-20'), 7);
eq('diffDays negative', diffDays('2026-11-13', '2026-11-20'), -7);
eq('toYmd ISO timestamp', toYmd('2026-11-20T00:00:00+00:00'), '2026-11-20');
eq('toYmd rejects overflow', toYmd('2026-02-30'), null);
eq('toYmd rejects junk', toYmd('next friday'), null);
eq('zonedNow NY morning (EST)', zonedNow(at('2026-11-20T14:05:00Z'), NY), { ymd: '2026-11-20', hour: 9 });
eq('zonedNow NY before midnight', zonedNow(at('2026-11-21T04:30:00Z'), NY), { ymd: '2026-11-20', hour: 23 });
eq('zonedNow NY summer (EDT)', zonedNow(at('2026-07-01T13:00:00Z'), NY), { ymd: '2026-07-01', hour: 9 });
eq('zonedNow spring-forward day', zonedNow(at('2026-03-08T13:00:00Z'), NY), { ymd: '2026-03-08', hour: 9 });
eq('zonedNow fall-back day', zonedNow(at('2026-11-01T14:00:00Z'), NY), { ymd: '2026-11-01', hour: 9 });
eq('zonedNow Auckland is already tomorrow', zonedNow(at('2026-11-20T14:05:00Z'), 'Pacific/Auckland'), { ymd: '2026-11-21', hour: 3 });
eq('zonedNow UTC midnight hour is 0', zonedNow(at('2026-11-20T00:30:00Z'), 'UTC'), { ymd: '2026-11-20', hour: 0 });
eq('safeTimezone invalid -> default', safeTimezone('Mars/Olympus'), NY);
eq('safeTimezone injection -> default', safeTimezone("UTC'; drop table x"), NY);
eq('safeTimezone valid', safeTimezone('Europe/Paris'), 'Europe/Paris');
eq('instantYmd local day of a late UTC timestamp', instantYmd('2026-11-21T03:00:00Z', NY), '2026-11-20');
eq('instantYmd plain date stays', instantYmd('2026-11-21', 'Pacific/Auckland'), '2026-11-21');

/* ================================================================ 2. settings */
eq('normalizeOffsets sorts, dedupes, clamps', normalizeOffsets('invoice', [14, 7, 0, 7, 500, -100, '3', 'x']), [0, 3, 7, 14]);
eq('normalizeOffsets estimate drops 0 and negatives', normalizeOffsets('estimate', [0, -2, 3, 61]), [3]);
eq('normalizeOffsets visit only before', normalizeOffsets('visit', [-1, 0, 1, -3]), [-3, -1]);
eq('normalizeOffsets max count', normalizeOffsets('invoice', [1, 2, 3, 4, 5, 6, 7, 8]).length, 6);
{
  const d = settingsFromRow(null);
  eq('no row = defaults on', [d.enabled, d.invoice.enabled, d.estimate.enabled, d.visit.enabled], [true, true, true, false]);
  eq('default schedules', [d.invoice.offsets, d.estimate.offsets, d.visit.offsets], [[0, 7, 14], [3, 7], [-1]]);
  const custom: ReminderSettings = { ...d, invoice: { enabled: true, offsets: [-3, 0, 10] }, sendHour: 7, timezone: 'America/Chicago', templates: { estimate: { subject: 'Hi {client}', body: 'Body' } } };
  const back = settingsFromRow({ user_id: 'u', ...settingsToRow(custom) });
  eq('settings round trip', [back.invoice.offsets, back.sendHour, back.timezone, back.templates.estimate?.subject], [[-3, 0, 10], 7, 'America/Chicago', 'Hi {client}']);
  eq('bad hour falls back', settingsFromRow({ send_hour: 99 }).sendHour, 9);
  eq('templates strip line breaks from subjects', settingsFromRow({ templates: { visit: { subject: 'a\r\nBcc: x@y.z', body: 'b' } } }).templates.visit?.subject, 'a Bcc: x@y.z');
}

/* ================================================================ 3. steps */
{
  const steps = planSteps(invoice(), [0, 7, 14], { tz: NY });
  eq('invoice steps', steps.map((s) => [s.stepKey, s.sendDate, s.templateKey]), [
    ['due+0', '2026-11-20', 'invoice_due'], ['due+7', '2026-11-27', 'invoice_overdue'], ['due+14', '2026-12-04', 'invoice_overdue']]);
  const before = planSteps(invoice({ dueDate: '2026-11-04' }), [-3, 0, 7], { tz: NY });
  eq('steps on/before the sent day are dropped', before.map((s) => s.stepKey), ['due+0', 'due+7']);
  const sameDay = planSteps(invoice({ dueDate: '2026-11-02' }), [0, 7], { tz: NY });
  eq('due on receipt: no reminder the day it was sent', sameDay.map((s) => s.stepKey), ['due+7']);
  const est = planSteps(estimate({ sentAt: '2026-11-10T20:00:00Z', issueDate: '2026-11-01' }), [3, 7], { tz: NY });
  eq('estimate counts from the day it was marked Sent', est.map((s) => s.sendDate), ['2026-11-13', '2026-11-17']);
  const estNoState = planSteps(estimate({ sentAt: null, issueDate: '2026-11-05', createdAt: '2026-11-05T14:00:00Z' }), [3, 7], { tz: NY });
  eq('estimate without sent time uses the issue date', estNoState.map((s) => s.sendDate), ['2026-11-08', '2026-11-12']);
  const v = planSteps(visit({ createdAt: '2026-11-19T15:00:00Z' }), [-1], { tz: NY });
  eq('visit booked the day before still gets its reminder', v.map((s) => [s.stepKey, s.sendDate]), [['start-1', '2026-11-19']]);
  const shifted = planSteps(invoice({ dueDate: '2026-09-01', createdAt: '2026-08-01T12:00:00Z', sentAt: null }), [0, 7, 14], { tz: NY, optInDate: '2026-11-13' });
  eq('opt-in moves past steps to the opt-in day and keeps only the latest', shifted.map((s) => [s.stepKey, s.date, s.sendDate, s.shifted]), [['due+14', '2026-09-15', '2026-11-13', true]]);
  const mixed = planSteps(invoice({ dueDate: '2026-11-10', sentAt: '2026-11-01T12:00:00Z' }), [0, 7, 14], { tz: NY, optInDate: '2026-11-13' });
  eq('opt-in keeps future steps', mixed.map((s) => [s.stepKey, s.sendDate]), [['due+0', '2026-11-13'], ['due+7', '2026-11-17'], ['due+14', '2026-11-24']]);
  eq('no due date = no steps', planSteps(invoice({ dueDate: '' }), [0], { tz: NY }), []);
  eq('step keys', [stepKeyFor('invoice', 0), stepKeyFor('invoice', -3), stepKeyFor('estimate', 3), stepKeyFor('visit', -1)], ['due+0', 'due-3', 'sent+3', 'start-1']);
  const key = dedupeKey('invoice', '7d0c2d7e-0000-4000-8000-000000000001', 'due+7', '2026-11-27');
  eq('dedupe key = SQL formula kind:id:step:date', key, 'invoice:7d0c2d7e-0000-4000-8000-000000000001:due+7:2026-11-27');
  ok('step key matches the SQL check', /^(due|sent|start)[+-][0-9]{1,3}$/.test(stepKeyFor('invoice', 120)));
}

/* ================================================================ 4. due-date decisions */
{
  eq('before the send hour: not yet', decide(invoice(), '2026-11-20T13:59:00Z'), { action: 'none', why: 'not_yet' });
  const d0 = decide(invoice(), '2026-11-20T14:00:00Z');
  eq('due date at 9 AM New York: send due+0', d0.action === 'send' && [d0.step.stepKey, d0.dedupeKey], ['due+0', 'invoice:inv-1:due+0:2026-11-20']);
  const d7 = decide(invoice(), '2026-11-27T15:00:00Z');
  eq('+7 days (nothing sent before): only the latest step', d7.action === 'send' && d7.step.stepKey, 'due+7');
  eq('next day still sends (catch-up)', decide(invoice(), '2026-11-21T20:00:00Z').action, 'send');
  eq('3 days late: missed, never a late burst', decide(invoice(), '2026-11-23T20:00:00Z'), { action: 'none', why: 'missed' });
  eq('a day before due: not yet', decide(invoice(), '2026-11-19T20:00:00Z'), { action: 'none', why: 'not_yet' });
  // Auckland user: their 9 AM comes 18 hours before New York's
  const auck = settings({ timezone: 'Pacific/Auckland' });
  eq('time zone of the user decides', decideDue({ facts: invoice(), settings: auck, overrides: {}, launchedAt: LAUNCH, recorded: [], now: at('2026-11-19T20:30:00Z') }).action, 'send');
  eq('send hour 7', decide(invoice(), '2026-11-20T12:10:00Z', { settings: settings({ sendHour: 7 }) }).action, 'send');
  eq('estimate +3 after sending', (() => { const d = decide(estimate(), '2026-11-08T15:00:00Z'); return d.action === 'send' && d.step.stepKey; })(), 'sent+3');
  eq('visit: day before', (() => { const d = decide(visit(), '2026-11-19T15:00:00Z', { settings: settings({ visit: { enabled: true, offsets: [-1] } }) }); return d.action === 'send' && d.step.stepKey; })(), 'start-1');
  eq('visit off by default', decide(visit(), '2026-11-19T15:00:00Z'), { action: 'none', why: 'off' });
}

/* ================================================================ 5. stop conditions */
{
  const at20 = '2026-11-20T15:00:00Z';
  const stopped = (f: TargetFacts, now = at20) => { const d = decide(f, now); return d.action === 'none' && d.why === 'stopped' ? d.stop : d.action; };
  eq('Paid stops', stopped(invoice({ status: 'Paid' })), 'paid');
  eq('Cancelled stops', stopped(invoice({ status: 'Cancelled' })), 'cancelled');
  eq('Draft never starts', stopped(invoice({ status: 'Draft' })), 'not_sent');
  eq('no status = draft', stopped(invoice({ status: '' })), 'not_sent');
  eq('Overdue status keeps going', stopped(invoice({ status: 'Overdue' })), 'send');
  eq('client reported a payment', stopped(invoice({ paymentReported: true })), 'payment_reported');
  eq('balance 0 = paid', stopped(invoice({ balanceDue: 0 })), 'paid');
  eq('empty invoice: nothing due', stopped(invoice({ total: 0, balanceDue: 0 })), 'nothing_due');
  eq('estimate approved', stopped(estimate({ status: 'Accepted' }), '2026-11-08T15:00:00Z'), 'approved');
  eq('estimate signed (status not updated)', stopped(estimate({ signed: true }), '2026-11-08T15:00:00Z'), 'approved');
  eq('estimate declined', stopped(estimate({ declined: true }), '2026-11-08T15:00:00Z'), 'declined');
  eq('estimate Rejected status', stopped(estimate({ status: 'Rejected' }), '2026-11-08T15:00:00Z'), 'declined');
  eq('estimate expired', stopped(estimate({ expiryDate: '2026-11-07' }), '2026-11-08T15:00:00Z'), 'expired');
  eq('estimate still Draft', stopped(estimate({ status: 'Draft' }), '2026-11-08T15:00:00Z'), 'not_sent');
  const vs = settings({ visit: { enabled: true, offsets: [-1] } });
  eq('visit: job completed', (() => { const d = decide(visit({ jobStatus: 'completed' }), '2026-11-19T15:00:00Z', { settings: vs }); return d.action === 'none' && d.stop; })(), 'job_inactive');
  eq('visit: never on/after the start day', stopReason(visit(), '2026-11-20'), 'visit_passed');
}

/* ================================================================ 6. payments -> balance */
{
  const doc = { lineItems: [{ quantity: 2, rate: 250 }, { quantity: 1, rate: 500 }], taxRate: 10, discount: 0 };
  eq('balance with nothing paid', invoiceBalance(doc), { total: 1100, paid: 0, balanceDue: 1100 });
  eq('amountPaid counts', invoiceBalance({ ...doc, amountPaid: 100 }).balanceDue, 1000);
  eq('payments recorded with Mark as paid count', invoiceBalance({ ...doc, payments: [{ amount: 600 }, { amount: 500 }] }).balanceDue, 0);
  eq('the same payment in two places is not added twice', invoiceBalance({ ...doc, amountPaid: 600, payments: [{ amount: 600 }] }, 600).balanceDue, 500);
  eq('receipts count', invoiceBalance(doc, 1100).balanceDue, 0);
  eq('receipts linked by id', receiptsForInvoice({ id: 'i1', invoiceNumber: 'INV-1' }, [{ invoiceId: 'i1', amount: 300 }, { invoiceId: 'i2', amount: 999 }]), 300);
  eq('receipts linked by number on the same job', receiptsForInvoice({ id: 'i1', jobId: 'j1', invoiceNumber: 'INV-1' }, [{ invoiceNumber: 'inv-1', jobId: 'j1', amount: 50 }, { invoiceNumber: 'INV-1', jobId: 'j2', amount: 70 }]), 50);
  const row: DocRow = { id: 'i1', type: 'Invoice', status: 'Sent', dueDate: '2026-11-20', created_at: '2026-11-02T00:00:00Z', lineItems: doc.lineItems, taxRate: '10', amountPaid: '1100' };
  eq('fully paid invoice row stops', stopReason(factsFromDoc(row), '2026-11-20'), 'paid');
  const partial = factsFromDoc({ ...row, amountPaid: '100' });
  eq('partial payment: reminders continue for the balance', [stopReason(partial, '2026-11-20'), partial.amount], [null, 1000]);
  eq('payment reported in data stops', stopReason(factsFromDoc({ ...row, amountPaid: null, paymentReportedAt: '2026-11-15T10:00:00Z' }), '2026-11-20'), 'payment_reported');
  // money parity with utils/money.ts (the app's single source of truth)
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let same = true;
  for (let i = 0; i < 300; i++) {
    const d = {
      lineItems: Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => ({ quantity: Math.round(rnd() * 40) / 4, rate: Math.round(rnd() * 99999) / 100, percentComplete: Math.round(rnd() * 100), previouslyBilled: Math.round(rnd() * 5000) / 100 })),
      taxRate: Math.round(rnd() * 1500) / 100, discount: rnd() < 0.3 ? Math.round(rnd() * 20000) / 100 : 0, shipping: rnd() < 0.2 ? Math.round(rnd() * 5000) / 100 : 0,
      isProgressBilling: rnd() < 0.25, amountPaid: rnd() < 0.3 ? Math.round(rnd() * 100000) / 100 : 0,
    };
    if (JSON.stringify(computeTotals(d)) !== JSON.stringify(computeDocumentTotals(d))) { same = false; console.error('money mismatch', JSON.stringify(d)); break; }
  }
  ok('computeTotals == utils/money computeDocumentTotals (300 random documents)', same);
}

/* ================================================================ 7. switches and launch cutoff */
{
  const now = '2026-11-20T15:00:00Z';
  const older = invoice({ createdAt: '2026-10-15T12:00:00Z', sentAt: '2026-10-15T12:00:00Z' });
  eq('documents from before the launch are not chased', decide(older, now), { action: 'none', why: 'off' });
  eq('...unless switched on for that document', decide(older, now, { overrides: { document: { enabled: true, updatedAt: '2026-11-18T12:00:00Z' } } }).action, 'send');
  eq('document switched off', decide(invoice(), now, { overrides: { document: { enabled: false } } }), { action: 'none', why: 'off' });
  eq('client switched off', decide(invoice(), now, { overrides: { client: { enabled: false } } }), { action: 'none', why: 'off' });
  eq('document on beats client off', decide(invoice(), now, { overrides: { document: { enabled: true, updatedAt: '2026-11-03T00:00:00Z' }, client: { enabled: false } } }).action, 'send');
  eq('master off beats everything', decide(invoice(), now, { settings: settings({ enabled: false }), overrides: { document: { enabled: true } } }), { action: 'none', why: 'off' });
  eq('invoices off in settings', decide(invoice(), now, { settings: settings({ invoice: { enabled: false, offsets: [0] } }) }), { action: 'none', why: 'off' });
  eq('document on beats invoices off', decide(invoice(), now, { settings: settings({ invoice: { enabled: false, offsets: [0, 7] } }), overrides: { document: { enabled: true, updatedAt: '2026-11-03T00:00:00Z' } } }).action, 'send');
  eq('eligibility source older', eligibility(older, settings(), {}, LAUNCH, NY).source, 'older');
  // turning it on for an invoice that is long overdue: one reminder today, then the schedule
  const longOverdue = invoice({ createdAt: '2026-08-01T12:00:00Z', sentAt: null, dueDate: '2026-09-01' });
  const optIn = decide(longOverdue, '2026-11-13T16:00:00Z', { overrides: { document: { enabled: true, updatedAt: '2026-11-13T15:00:00Z' } } });
  eq('opt-in on a long overdue invoice sends one now', optIn.action === 'send' && [optIn.step.stepKey, optIn.step.shifted], ['due+14', true]);
}

/* ================================================================ 8. never twice */
{
  const now = '2026-11-27T15:00:00Z';
  const key = 'invoice:inv-1:due+7:2026-11-27';
  const rec = (patch: Partial<RecordedReminder>): RecordedReminder[] => [{ id: 'r1', dedupeKey: key, status: 'sent', attempts: 1, sentAt: '2026-11-27T14:00:00Z', ...patch }];
  eq('already sent: done', decide(invoice(), now, { recorded: rec({}) }), { action: 'none', why: 'done' });
  eq('being sent by another run: wait', decide(invoice(), now, { recorded: rec({ status: 'sending', sentAt: null }) }), { action: 'none', why: 'in_flight' });
  eq('skipped by the user: done', decide(invoice(), now, { recorded: rec({ status: 'skipped', reason: 'skipped_by_user', sentAt: null }) }), { action: 'none', why: 'done' });
  eq('cap reached (skipped): not retried', decide(invoice(), now, { recorded: rec({ status: 'skipped', reason: 'email_limit', sentAt: null }) }), { action: 'none', why: 'done' });
  const retry = decide(invoice(), now, { recorded: rec({ status: 'failed', reason: 'gmail_rate_limit', attempts: 1, sentAt: null }) });
  eq('Gmail busy: retried', retry.action === 'send' && retry.retry?.id, 'r1');
  eq('retries stop after 3 attempts', decide(invoice(), now, { recorded: rec({ status: 'failed', reason: 'gmail_error', attempts: 3, sentAt: null }) }), { action: 'none', why: 'done' });
  eq('interrupted send is never retried', decide(invoice(), now, { recorded: rec({ status: 'failed', reason: 'interrupted', attempts: 1, sentAt: null }) }), { action: 'none', why: 'done' });
  ok('isRetryable', isRetryable({ dedupeKey: 'k', status: 'failed', reason: 'refresh_failed', attempts: 2 }) && !isRetryable({ dedupeKey: 'k', status: 'failed', reason: 'gmail_reconnect', attempts: 1 }));
  // the due date moved: a new key, but never two emails within 20 hours
  const moved = decide(invoice({ dueDate: '2026-11-21' }), '2026-11-21T15:00:00Z', { recorded: [{ dedupeKey: 'invoice:inv-1:due+0:2026-11-20', status: 'sent', sentAt: '2026-11-20T23:00:00Z' }] });
  eq('min gap between two reminders of one document', moved, { action: 'none', why: 'gap' });
  // a full month simulated hour by hour: each step goes out exactly once
  const recorded: RecordedReminder[] = [];
  const sentKeys: string[] = [];
  for (let h = 0; h < 24 * 30; h++) {
    const t = new Date(Date.parse('2026-11-15T00:00:00Z') + h * 3_600_000);
    const d = decideDue({ facts: invoice(), settings: settings(), overrides: {}, launchedAt: LAUNCH, recorded, now: t });
    if (d.action === 'send') {
      sentKeys.push(`${d.step.stepKey}@${zonedNow(t, NY).ymd}T${zonedNow(t, NY).hour}`);
      recorded.push({ dedupeKey: d.dedupeKey, status: 'sent', sentAt: t.toISOString() });
    }
  }
  eq('30 days hour by hour: due, +7, +14 once each at 9 AM', sentKeys, ['due+0@2026-11-20T9', 'due+7@2026-11-27T9', 'due+14@2026-12-04T9']);
}

/* ================================================================ 9. dispatch: cap, blocks, concurrency */
const item = (n: number, patch: Partial<OutgoingReminder> = {}): OutgoingReminder => ({
  userId: 'u1', kind: 'invoice', documentId: `d${n}`, jobId: 'j1', clientId: 'c1', stepKey: 'due+0', scheduledFor: '2026-11-20',
  dedupeKey: `invoice:d${n}:due+0:2026-11-20`, retry: null, to: 'client@example.com', block: null, accountId: 'a1',
  subject: 'Reminder', text: 'Hi', html: '<p>Hi</p>', ...patch,
});

/** In-memory `reminders` table with the UNIQUE (user_id, dedupe_key) constraint and an outbox. */
function memoryStore(opts: { send?: (it: OutgoingReminder) => Promise<{ messageId: string }>; allowances?: Record<string, { paid: boolean; used: number; limit: number | null }> } = {}) {
  const rows = new Map<string, { id: string; status: string; reason: string | null; attempts: number }>();
  const outbox: string[] = [];
  const usage: string[] = [];
  let seq = 0;
  const allowances = opts.allowances ?? {};
  const deps: DispatchDeps = {
    allowance: (u) => (allowances[u] ??= { paid: true, used: 0, limit: null }),
    async recordSkip(it, reason) {
      const k = `${it.userId}|${it.dedupeKey}`;
      if (!rows.has(k)) rows.set(k, { id: `r${++seq}`, status: 'skipped', reason, attempts: 0 });
    },
    async claim(it): Promise<Claim | null> {
      await new Promise((r) => setTimeout(r, Math.random() * 3)); // interleave concurrent runs
      const k = `${it.userId}|${it.dedupeKey}`;
      const row = rows.get(k);
      if (it.retry) {
        if (row && row.id === it.retry.id && row.status === 'failed' && row.attempts === it.retry.attempts) {
          row.status = 'sending';
          row.attempts++;
          return { id: row.id, attempts: row.attempts };
        }
        return null;
      }
      if (row) return null; // unique violation
      const created = { id: `r${++seq}`, status: 'sending', reason: null, attempts: 1 };
      rows.set(k, created);
      return { id: created.id, attempts: 1 };
    },
    send: opts.send ?? (async (it) => { outbox.push(it.dedupeKey); return { messageId: `m${outbox.length}` }; }),
    async markSent(c) { for (const r of rows.values()) if (r.id === c.id) r.status = 'sent'; },
    async markFailed(c, _it, f) { for (const r of rows.values()) if (r.id === c.id) { r.status = 'failed'; r.reason = f.reason; } },
    async recordUsage(c) { usage.push(c.id); },
  };
  return { deps, rows, outbox, usage, allowances };
}

const main = async () => {
  {
    const s = memoryStore({ allowances: { u1: { paid: false, used: 8, limit: 10 } } });
    const sum = await dispatchReminders([item(1), item(2), item(3), item(4)], s.deps);
    eq('free plan: stops at the monthly cap', [sum.sent, sum.skipped, sum.reasons.email_limit], [2, 2, 2]);
    eq('cap: emails counted', [s.usage.length, s.allowances.u1.used], [2, 10]);
    eq('cap: skips are logged', [...s.rows.values()].filter((r) => r.reason === 'email_limit').length, 2);
    ok('canSendEmail', canSendEmail({ paid: true, used: 999, limit: 10 }) && !canSendEmail({ paid: false, used: 10, limit: 10 }));
  }
  {
    const s = memoryStore({ allowances: { u1: { paid: true, used: 500, limit: null } } });
    eq('Premium: unlimited', (await dispatchReminders([item(1), item(2), item(3)], s.deps)).sent, 3);
  }
  {
    const s = memoryStore();
    const sum = await dispatchReminders([item(1, { to: null }), item(2, { block: 'no_gmail' }), item(3, { block: 'gmail_reconnect' })], s.deps);
    eq('no email / no Gmail / reconnect: skipped and logged', [sum.sent, sum.reasons.no_email, sum.reasons.no_gmail, sum.reasons.gmail_reconnect], [0, 1, 1, 1]);
  }
  {
    // two runs at the same time over the same due reminders
    const s = memoryStore();
    const items = [1, 2, 3, 4, 5, 6].map((n) => item(n));
    const [a, b] = await Promise.all([dispatchReminders(items, s.deps), dispatchReminders(items.map((x) => ({ ...x })), s.deps)]);
    eq('overlapping runs: each reminder sent once', [s.outbox.length, new Set(s.outbox).size, a.sent + b.sent, a.taken + b.taken], [6, 6, 6, 6]);
    const again = await dispatchReminders(items, s.deps);
    eq('a later run sends nothing again', [again.sent, s.outbox.length], [0, 6]);
    const dup = await dispatchReminders([item(9), item(9)], memoryStore().deps);
    eq('the same reminder twice in one batch', [dup.sent, dup.taken], [1, 1]);
  }
  {
    // Gmail busy -> failed (retryable) -> the retry claims the row once
    let calls = 0;
    const s = memoryStore({ send: async (it) => { calls++; if (calls === 1) throw new SendFailure('gmail_rate_limit', 'busy', true); return { messageId: it.dedupeKey }; } });
    const first = await dispatchReminders([item(1), item(2)], s.deps);
    eq('rate limit: failed once, the rest of that user waits', [first.failed, first.deferred, first.sent], [1, 1, 0]);
    const row = [...s.rows.values()][0];
    const retryItem = item(1, { retry: { id: row.id, attempts: row.attempts } });
    const [r1, r2] = await Promise.all([dispatchReminders([retryItem], s.deps), dispatchReminders([{ ...retryItem }], s.deps)]);
    eq('retry claimed by one run only', [r1.sent + r2.sent, r1.taken + r2.taken], [1, 1]);
  }
  {
    // crash after Gmail may have accepted the message: failed 'interrupted', never retried
    const s = memoryStore({ send: async () => { throw new Error('socket hang up'); } });
    const sum = await dispatchReminders([item(1)], s.deps);
    const row = [...s.rows.values()][0];
    eq('unknown send error = interrupted', [sum.failed, row.status, row.reason], [1, 'failed', 'interrupted']);
    ok('interrupted is not retryable', !isRetryable({ dedupeKey: 'k', status: 'failed', reason: row.reason, attempts: row.attempts }));
  }
  {
    // reconnect needed mid-run: the user's other reminders are skipped, not attempted
    let calls = 0;
    const s = memoryStore({ send: async () => { calls++; throw new SendFailure('gmail_reconnect', 'reconnect', false); } });
    const sum = await dispatchReminders([item(1), item(2), item(3, { userId: 'u2', dedupeKey: 'x' })], s.deps);
    eq('reconnect: one Gmail call per user', [calls, sum.failed, sum.reasons.gmail_reconnect], [2, 2, 3]);
  }
  {
    // database error after a successful send: the row stays 'sending' and the planner never resends it
    const s = memoryStore();
    s.deps.markSent = async () => { throw new Error('db down'); };
    const sum = await dispatchReminders([item(1)], s.deps);
    eq('sent but not marked: counted once, row left sending', [sum.sent, s.outbox.length, [...s.rows.values()][0].status], [1, 1, 'sending']);
    eq('...which the planner treats as in flight', decide(invoice({ id: 'd1' }), '2026-11-20T15:00:00Z', { recorded: [{ dedupeKey: 'invoice:d1:due+0:2026-11-20', status: 'sending' }] }), { action: 'none', why: 'in_flight' });
  }
  {
    let t = 0;
    const s = memoryStore();
    s.deps.hasTime = () => ++t <= 2;
    const sum = await dispatchReminders([item(1), item(2), item(3), item(4)], s.deps);
    eq('time budget: the rest waits for the next run', [sum.sent, sum.deferred], [2, 2]);
  }

  /* ============================================================== 9b. cron authentication */
  {
    // the secret lives only in the database (Vault); the function asks reminders_check_secret()
    const dbSecret = 'f'.repeat(64);
    let dbCalls = 0;
    const check = async (s: string) => { dbCalls++; return s === dbSecret; };
    eq('right header: ok (asked the database)', [await verifyCronSecret(dbSecret, { checkInDatabase: check }), dbCalls], ['ok', 1]);
    eq('wrong header: denied', await verifyCronSecret('e'.repeat(64), { checkInDatabase: check }), 'denied');
    dbCalls = 0;
    eq('missing / short / huge header: denied without asking', [
      await verifyCronSecret(null, { checkInDatabase: check }),
      await verifyCronSecret('', { checkInDatabase: check }),
      await verifyCronSecret('short-secret', { checkInDatabase: check }),
      await verifyCronSecret('x'.repeat(600), { checkInDatabase: check }),
      dbCalls,
    ], ['denied', 'denied', 'denied', 'denied', 0]);
    eq('header whitespace is trimmed', await verifyCronSecret(`  ${dbSecret}\n`, { checkInDatabase: check }), 'ok');
    eq('database down / not migrated: unavailable (503), never ok', await verifyCronSecret(dbSecret, { checkInDatabase: async () => { throw new Error('function does not exist'); } }), 'unavailable');
    eq('optional env override works without the database', await verifyCronSecret('o'.repeat(40), { override: 'o'.repeat(40), checkInDatabase: async () => { throw new Error('down'); } }), 'ok');
    eq('override set but header differs: falls back to the database', await verifyCronSecret(dbSecret, { override: 'o'.repeat(40), checkInDatabase: check }), 'ok');
    eq('empty override is ignored', await verifyCronSecret('a'.repeat(40), { override: '', checkInDatabase: async () => false }), 'denied');
    ok('constantTimeEqual', constantTimeEqual('abc', 'abc') && !constantTimeEqual('abc', 'abd') && !constantTimeEqual('abc', 'abcd') && !constantTimeEqual('', ''));
  }

  /* ============================================================== 10. wording */
  {
    const values = buildValues({
      kind: 'invoice', today: '2026-11-27', clientName: 'Jane Doe', number: 'INV-1042', amount: 1250.5, currency: 'USD',
      link: 'https://www.contractordocs.app/?portal=abc', payLink: '', dueDate: '2026-11-20', company: 'Acme Builders', myName: 'Sam Lee',
    });
    eq('values', [values.client, values.amount, values.due_date, values.days_overdue, values.pay_link], ['Jane Doe', '$1,250.50', 'November 20, 2026', '7', '']);
    const r = renderReminder(DEFAULT_TEMPLATES.invoice_overdue, values);
    eq('overdue subject', r.subject, 'Invoice INV-1042 is 7 days past due');
    ok('empty pay link line is dropped', !/Pay online/.test(r.text) && /View the invoice: https:\/\/www\.contractordocs\.app\/\?portal=abc/.test(r.text));
    ok('sign-off', r.text.endsWith('Sam Lee\nAcme Builders'));
    ok('html escapes and links', /<a href="https:\/\/www\.contractordocs\.app\/\?portal=abc"/.test(r.html) && !/<script/.test(renderReminder({ subject: 's', body: '<script>x</script> {client}' }, values).html));
    eq('unknown placeholders stay as typed', fillTemplate('Hi {client}, {nope}', { client: 'A' }), 'Hi A, {nope}');
    eq('line of empty placeholders dropped', fillTemplate('Thanks\n{my_name}\n{company}', { my_name: '', company: 'Acme' }), 'Thanks\nAcme');
    eq('my_name hidden when equal to company', buildValues({ kind: 'visit', today: '2026-11-19', company: 'Sam', myName: 'Sam' }).my_name, '');
    eq('no client name reads "there"', buildValues({ kind: 'estimate', today: '2026-11-19' }).client, 'there');
    eq('visit date', buildValues({ kind: 'visit', today: '2026-11-19', visitDate: '2026-11-20' }).visit_date, 'Friday, November 20');
    eq('custom template used, empty falls back', [resolveTemplate({ templates: { estimate: { subject: 'Quick check', body: '' } } }, 'estimate').subject,
      resolveTemplate({ templates: { estimate: { subject: 'Quick check', body: '' } } }, 'estimate').body === DEFAULT_TEMPLATES.estimate.body], ['Quick check', true]);
    ok('javascript: links are never used', buildValues({ kind: 'invoice', today: '2026-11-19', link: 'javascript:alert(1)', payLink: 'http://evil.example' }).link === '');
  }

  /* ============================================================== 11. rows, links, recipients */
  {
    const now = at('2026-11-20T15:00:00Z');
    const doc = { public_token: '11111111-2222-4333-8444-555555555555', approval_expires_at: '2027-01-01T00:00:00Z', approval_used_at: null };
    const client = { portal_key: 'a'.repeat(32) };
    eq('estimate link: approval page', reminderLink('estimate', 'https://www.contractordocs.app', doc, client, now), 'https://www.contractordocs.app/?approval_token=11111111-2222-4333-8444-555555555555');
    eq('invoice link: client portal', reminderLink('invoice', 'https://www.contractordocs.app/', doc, client, now), `https://www.contractordocs.app/?portal=${'a'.repeat(32)}`);
    eq('expired approval link -> portal', reminderLink('estimate', 'https://x.app', { ...doc, approval_expires_at: '2026-11-20T16:00:00Z' }, client, now), `https://x.app/?portal=${'a'.repeat(32)}`);
    eq('no link at all', reminderLink('visit', 'https://x.app', null, null, now), '');
    eq('recipient: first valid address', recipientOf('', 'not-an-email, jane@example.com; bob@example.com'), 'jane@example.com');
    eq('recipient: none', recipientOf(null, 'nope'), null);
    const clients = [{ id: 'c1', user_id: 'u1', name: 'Jane Doe', email: 'j@x.com' }, { id: 'c2', user_id: 'u2', name: 'Jane Doe', email: 'other@x.com' }];
    eq('client by job link', resolveClient({ jobClientId: 'c1', userId: 'u1' }, clients)?.id, 'c1');
    eq('legacy client by name, same user only', resolveClient({ name: ' jane doe ', userId: 'u2' }, clients)?.id, 'c2');
    const form = docRowFromForm('Estimate', 'e1', { status: 'Sent', estimateNumber: 'E-7', clientSignatureUrl: 'data:image/png;base64,x', lineItems: [{ quantity: 1, rate: 10 }] });
    eq('form data -> row (signed estimate stops)', stopReason(factsFromDoc(form), '2026-11-20'), 'approved');
    const p = planTarget({ facts: invoice(), settings: settings(), overrides: {}, launchedAt: LAUNCH, recorded: [{ dedupeKey: 'invoice:inv-1:due+0:2026-11-20', status: 'sent', sentAt: '2026-11-20T14:00:00Z' }], now: at('2026-11-22T15:00:00Z') });
    eq('plan for the app', p.steps.map((s) => s.state), ['sent', 'planned', 'planned']);
    eq('plan next', p.next?.stepKey, 'due+7');
    eq('effective tier', [effectiveTier('premium', 'active', null), effectiveTier('ai', 'cancelled', '2099-01-01'), effectiveTier('premium', 'cancelled', '2020-01-01'), effectiveTier('free', 'active', null)], ['premium', 'ai', 'free', 'free']);
  }

  console.log(`${failures === 0 ? 'OK' : 'FAILED'}: ${passes} passed, ${failures} failed`);
  if (failures) process.exit(1);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
