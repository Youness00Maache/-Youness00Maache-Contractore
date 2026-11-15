/**
 * Leads + appointments (roadmap batch D1). Pure logic and a lint of the migration; no database needed:
 *   npx tsx scripts/leads-check.ts
 *
 * Covers: stage mapping from old request rows (status -> stage, converted -> won, archived), status kept in step with
 * stage moves, allowed moves, follow-up states, stale leads, budgets, pipeline / win rate / sources summaries, board
 * grouping, sorting, search, the manual lead form, row mapping (old + new database), appointment overlap / next /
 * validation / ICS, calendar items, plan gating, and the migration (ADD COLUMN IF NOT EXISTS only on quote_requests,
 * nothing dropped / renamed / retyped, RLS owner-only on appointments, SECURITY DEFINER + search_path = '' + "as $$",
 * no anon grant, the public submit path can't set owner-only columns and a manual row can't look public).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    allowedStageMoves, canMoveStage, EMPTY_LEAD_FORM, followUpState, formatBudget, groupLeadsByStage, hasLeadErrors, isStaleLead,
    lastActivityAt, leadBudgetMid, leadFormToPatch, leadPipelineSummary, leadSourcesSummary, leadToConvertDraft, leadToForm,
    leadToolsForTier, leadWinRate, localYmd, needsFollowUp, originLabel, overdueFollowUps, parseBudget, searchLeads, sortLeads,
    stageAfterAppointment, stageAfterContact, stageFromRow, stageFromStatus, statusForStage, validateLeadForm, ymdDiff,
} from '../lib/leads/leadLogic.ts';
import {
    appointmentEnd, appointmentIcsFields, appointmentsOverlap, appointmentToIcs, calendarItemsOnDay, conflictsFor,
    countCalendarItemsByDay, findOverlaps, icsEscape, icsFold, isPastAppointment, leadCalendarItems, nextAppointment,
    validateAppointmentDraft,
} from '../lib/leads/appointmentLogic.ts';
import {
    appointmentInsertRow, appointmentPatchRow, LEAD_COLUMNS, LEGACY_LEAD_COLUMNS, leadInsertRow, leadPatchRow, mapAppointmentRow,
    mapLeadRow, parseAttachments,
} from '../lib/leads/leadRows.ts';
import { LEAD_STAGES, MANUAL_LEAD_ORIGINS, type Appointment, type Lead } from '../lib/leads/leadTypes.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks++; };
const eq = <T,>(a: T, b: T, msg: string) => { assert.deepEqual(a, b, msg); checks++; };

const TODAY = '2026-11-15';
const NOW = new Date(2026, 10, 15, 12, 0, 0); // local noon
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const lead = (over: Partial<Lead> = {}): Lead => ({
    ...mapLeadRow({
        id: 'l1', name: 'Ann', phone: '555 123 4567', email: '', status: 'new', stage: 'new', lead_source: 'request_page',
        created_at: daysAgo(1), attachments: [],
    }),
    ...over,
});

// ------------------------------------------------------------------------------------------------ stages from rows
eq(stageFromStatus('new'), 'new', 'status new -> new');
eq(stageFromStatus('seen'), 'new', 'status seen -> new');
eq(stageFromStatus('converted'), 'won', 'status converted -> won');
eq(stageFromStatus('archived'), 'lost', 'status archived -> lost');
eq(stageFromRow({ status: 'seen' }), 'new', 'old row without stage');
eq(stageFromRow({ status: 'converted' }), 'won', 'old converted row');
eq(stageFromRow({ status: 'seen', stage: 'new', job_id: 'j1' }), 'won', 'a linked job = won');
eq(stageFromRow({ status: 'converted', stage: 'quote_sent' }), 'won', 'converted wins over a stored stage');
eq(stageFromRow({ status: 'seen', stage: 'quote_sent' }), 'quote_sent', 'stored stage');
eq(stageFromRow({ status: 'archived', stage: 'new' }), 'lost', 'archived old row (default stage) -> lost');
eq(stageFromRow({ status: 'archived', stage: 'contacted' }), 'contacted', 'archived keeps an explicit stage');
eq(stageFromRow({ status: 'new', stage: 'weird' }), 'new', 'unknown stage falls back to status');
eq(stageFromRow(null), 'new', 'null row');

// ------------------------------------------------------------------------------------------------ status in step
eq(statusForStage('contacted', 'new'), 'seen', 'leaving new marks the request seen');
eq(statusForStage('new', 'new'), null, 'new stays new');
eq(statusForStage('lost', 'seen'), 'archived', 'lost archives');
eq(statusForStage('lost', 'archived'), null, 'already archived');
eq(statusForStage('contacted', 'archived'), 'seen', 'reopen un-archives');
eq(statusForStage('lost', 'converted'), null, 'never touches converted');
eq(statusForStage('quote_sent', 'seen'), null, 'seen stays seen');

// ------------------------------------------------------------------------------------------------ moves
eq(allowedStageMoves(lead({ stage: 'new' })), ['contacted', 'appointment_set', 'quote_sent', 'won', 'lost'], 'moves from new');
eq(allowedStageMoves(lead({ stage: 'won', jobId: 'j' })), [], 'a converted lead is locked');
eq(allowedStageMoves(lead({ status: 'converted', stage: 'won' })), [], 'converted status locked');
ok(canMoveStage(lead(), 'contacted').ok, 'can move');
ok(!canMoveStage(lead(), 'new').ok, 'same stage refused');
ok(!canMoveStage(lead({ jobId: 'j' }), 'lost').ok, 'job refused');
ok(!canMoveStage(lead({ hasLeadColumns: false }), 'contacted').ok, 'old database: only new / lost');
ok(canMoveStage(lead({ hasLeadColumns: false }), 'lost').ok, 'old database: lost = archive');
ok(!canMoveStage(lead(), 'lost', 'x'.repeat(301)).ok, 'lost reason too long');
eq(stageAfterAppointment('new'), 'appointment_set', 'booking advances new');
eq(stageAfterAppointment('contacted'), 'appointment_set', 'booking advances contacted');
eq(stageAfterAppointment('quote_sent'), null, 'booking keeps quote_sent');
eq(stageAfterContact('new'), 'contacted', 'contact advances new');
eq(stageAfterContact('appointment_set'), null, 'contact keeps later stages');

// ------------------------------------------------------------------------------------------------ follow-ups
eq(followUpState(lead({ followUpOn: null }), TODAY), 'none', 'no follow-up');
eq(followUpState(lead({ followUpOn: '2026-11-14' }), TODAY), 'overdue', 'overdue');
eq(followUpState(lead({ followUpOn: TODAY }), TODAY), 'today', 'today');
eq(followUpState(lead({ followUpOn: '2026-11-20' }), TODAY), 'upcoming', 'upcoming');
eq(followUpState(lead({ followUpOn: '2026-11-14', stage: 'won' }), TODAY), 'none', 'closed lead: none');
eq(followUpState(lead({ followUpOn: '2026-11-14', archived: true }), TODAY), 'none', 'archived: none');
ok(needsFollowUp(lead({ followUpOn: TODAY }), TODAY), 'needs follow-up today');
eq(overdueFollowUps([lead({ id: 'a', followUpOn: TODAY }), lead({ id: 'b', followUpOn: '2026-11-01' }), lead({ id: 'c', followUpOn: '2026-12-01' })], TODAY).map(l => l.id), ['b', 'a'], 'overdue list, oldest first');

// ------------------------------------------------------------------------------------------------ stale
eq(lastActivityAt(lead({ createdAt: daysAgo(10), stageChangedAt: daysAgo(5), lastContactAt: daysAgo(2) })), daysAgo(2), 'last activity = latest');
ok(isStaleLead(lead({ createdAt: daysAgo(10), stageChangedAt: daysAgo(9) }), NOW), 'stale after 7 days');
ok(!isStaleLead(lead({ createdAt: daysAgo(10), lastContactAt: daysAgo(3) }), NOW), 'recent contact: not stale');
ok(!isStaleLead(lead({ createdAt: daysAgo(10), stage: 'lost' }), NOW), 'closed: not stale');
ok(!isStaleLead(lead({ createdAt: daysAgo(10), followUpOn: '2026-11-30' }), NOW), 'future follow-up: not stale');
ok(isStaleLead(lead({ createdAt: daysAgo(4) }), NOW, 3), 'custom days');
eq(ymdDiff('2026-11-01', '2026-11-15'), 14, 'ymdDiff');
eq(localYmd(NOW), TODAY, 'localYmd');

// ------------------------------------------------------------------------------------------------ budgets + summaries
eq(leadBudgetMid(lead({ budgetMin: 4000, budgetMax: 6000 })), 5000, 'mid of range');
eq(leadBudgetMid(lead({ budgetMin: 4000, budgetMax: null })), 4000, 'min only');
eq(leadBudgetMid(lead({ budgetMin: null, budgetMax: null })), null, 'no budget');
eq(formatBudget(lead({ budgetMin: 5000, budgetMax: 8000 }), 'USD', 'en-US'), '$5,000 – $8,000', 'range text');
eq(formatBudget(lead({ budgetMin: 5000, budgetMax: null }), 'USD', 'en-US'), '$5,000+', 'min text');
eq(formatBudget(lead({ budgetMin: null, budgetMax: 8000 }), 'USD', 'en-US'), 'up to $8,000', 'max text');
eq(formatBudget(lead({ budgetMin: null, budgetMax: null })), '', 'no budget text');

const board: Lead[] = [
    lead({ id: '1', stage: 'new', budgetMin: 1000, budgetMax: 3000, origin: 'request_page' }),
    lead({ id: '2', stage: 'contacted', budgetMin: 5000, budgetMax: null, origin: 'phone', isManual: true }),
    lead({ id: '3', stage: 'won', budgetMin: 10000, budgetMax: 10000, origin: 'referral', isManual: true }),
    lead({ id: '4', stage: 'lost', origin: 'referral', isManual: true }),
    lead({ id: '5', stage: 'won', origin: 'phone', isManual: true }),
    lead({ id: '6', stage: 'new', archived: true, budgetMin: 99999, budgetMax: null }),
];
const summary = leadPipelineSummary(board);
eq(summary.stages.map(s => s.count), [1, 1, 0, 0, 2, 1], 'counts per stage (archived open lead left out)');
eq(summary.openCount, 2, 'open count');
eq(summary.openBudget, 7000, 'open budget = 2000 + 5000');
eq(summary.stages.find(s => s.stage === 'won')!.budgetTotal, 10000, 'won budget');
eq(summary.winRate, 2 / 3, 'win rate in summary');
eq(leadWinRate(board), 2 / 3, 'win rate');
eq(leadWinRate([lead()]), null, 'no decided lead');
const sources = leadSourcesSummary(board);
eq(sources.map(s => [s.origin, s.count, s.won, s.lost]), [['phone', 2, 1, 0], ['referral', 2, 1, 1], ['request_page', 2, 0, 0]], 'sources (most first, then by label)');
eq(sources.find(s => s.origin === 'referral')!.winRate, 0.5, 'source win rate');
eq(sources.find(s => s.origin === 'referral')!.wonBudget, 10000, 'source won budget');
const groups = groupLeadsByStage(board);
eq(groups.new.map(l => l.id), ['1'], 'board hides archived');
eq(groupLeadsByStage(board, { includeArchived: true }).new.map(l => l.id), ['1', '6'], 'board with archived');
eq(Object.keys(groups), [...LEAD_STAGES], 'board columns in order');
eq(sortLeads([lead({ id: 'a', budgetMin: 1 }), lead({ id: 'b', budgetMin: 9 }), lead({ id: 'c' })], 'budget').map(l => l.id), ['b', 'a', 'c'], 'sort by budget');
eq(sortLeads([lead({ id: 'a', followUpOn: '2026-12-01' }), lead({ id: 'b', followUpOn: '2026-11-20' }), lead({ id: 'c' })], 'follow_up').map(l => l.id), ['b', 'a', 'c'], 'sort by follow-up');
eq(sortLeads([lead({ id: 'a', createdAt: daysAgo(1) }), lead({ id: 'b', createdAt: daysAgo(0) })]).map(l => l.id), ['b', 'a'], 'newest first');
eq(searchLeads([lead({ id: 'a', name: 'Bob Roofing' }), lead({ id: 'b', name: 'Cara' })], 'roof').map(l => l.id), ['a'], 'search name');
eq(searchLeads([lead({ id: 'a', phone: '(555) 987-0000' }), lead({ id: 'b', phone: '' })], '987').map(l => l.id), ['a'], 'search phone digits');
eq(originLabel('phone'), 'Phone call', 'origin label');
eq(originLabel('request_page', 'qr'), 'Request page · QR code', 'request page + tag');
eq(originLabel('request_page', 'link'), 'Request page', 'request page + plain link');

// ------------------------------------------------------------------------------------------------ form
const form = { ...EMPTY_LEAD_FORM, name: 'Dan', phone: '555-111-2222' };
eq(validateLeadForm(form), {}, 'valid minimal form');
ok(validateLeadForm({ ...form, name: '' }).name, 'name required');
ok(validateLeadForm({ ...form, phone: '' }).contact, 'phone or email required');
ok(!validateLeadForm({ ...form, phone: '', email: 'dan@example.com' }).contact, 'email alone ok');
ok(validateLeadForm({ ...form, email: 'nope' }).email, 'bad email');
ok(validateLeadForm({ ...form, phone: '12' }).phone, 'bad phone');
ok(validateLeadForm({ ...form, budgetMin: 'abc' }).budget, 'bad budget');
ok(validateLeadForm({ ...form, budgetMin: '9000', budgetMax: '100' }).budget, 'min above max');
ok(validateLeadForm({ ...form, followUpOn: '2026-02-30' }).followUpOn, 'impossible date');
ok(validateLeadForm({ ...form, stage: 'won' }).stage, 'won only by convert');
ok(validateLeadForm({ ...form, origin: 'request_page' as any }).origin === undefined, 'request_page origin passes the form (the insert row replaces it)');
ok(!hasLeadErrors({}), 'no errors');
eq(parseBudget(''), null, 'empty budget');
eq(parseBudget('$5,000'), 5000, 'formatted budget');
eq(parseBudget('12.50'), 12.5, 'cents');
ok(Number.isNaN(parseBudget('1e5') as number), 'exponent refused');
const patch = leadFormToPatch({ ...form, email: ' Dan@Example.com ', budgetMin: '1,000', followUpOn: '2026-11-20', details: '  ' });
eq([patch.email, patch.budgetMin, patch.budgetMax, patch.followUpOn, patch.details, patch.origin], ['dan@example.com', 1000, null, '2026-11-20', null, 'phone'], 'form -> patch');
eq(leadToForm(lead({ budgetMin: 5, followUpOn: '2026-11-20' })).budgetMin, '5', 'lead -> form');
eq(leadToConvertDraft({ name: 'Ann', details: 'fix the deck railing' }, TODAY), { jobName: 'Fix the deck railing', startDate: TODAY }, 'convert draft');
eq(leadToConvertDraft({ name: 'Ann', details: '' }, TODAY).jobName, 'Quote request - Ann', 'convert draft without details');

// ------------------------------------------------------------------------------------------------ rows
const legacy = mapLeadRow({ id: 'r', name: 'Old', email: 'o@x.co', status: 'converted', job_id: 'j', created_at: daysAgo(30), source: 'qr' });
eq([legacy.hasLeadColumns, legacy.stage, legacy.origin, legacy.isManual, legacy.attachments, legacy.followUpOn], [false, 'won', 'request_page', false, [], null], 'old row maps');
const fresh = mapLeadRow({
    id: 'm', name: 'Man', phone: '555 000 1111', status: 'seen', source: 'manual', stage: 'contacted', lead_source: 'referral',
    budget_min: '1500.00', budget_max: null, follow_up_on: '2026-11-20', lost_reason: null, notes: 'n',
    attachments: [{ path: 'u/leads/m/a.pdf', name: 'a.pdf', type: 'application/pdf', size: 10, added_at: 'x' }, { bad: 1 }, 'x'],
    last_contact_at: daysAgo(1), stage_changed_at: daysAgo(2), created_at: daysAgo(3),
});
eq([fresh.hasLeadColumns, fresh.stage, fresh.origin, fresh.isManual, fresh.budgetMin, fresh.followUpOn, fresh.attachments.length], [true, 'contacted', 'referral', true, 1500, '2026-11-20', 1], 'new row maps');
eq(parseAttachments('[{"path":"p"}]')[0].name, 'p', 'attachments from text');
ok(LEAD_COLUMNS.startsWith(LEGACY_LEAD_COLUMNS) && LEAD_COLUMNS.includes('stage') && !LEGACY_LEAD_COLUMNS.includes('stage'), 'column lists');
const ins = leadInsertRow('u1', { ...leadFormToPatch(form), origin: 'request_page' as any, stage: 'won' });
eq([ins.user_id, ins.lead_source, ins.stage, 'source' in ins, 'status' in ins, 'photo_paths' in ins, 'attachments' in ins], ['u1', 'other', 'new', false, false, false, false], 'insert row: only granted columns, never request_page / won');
const GRANTED_INSERT = ['user_id', 'name', 'phone', 'email', 'address', 'details', 'stage', 'lead_source', 'budget_min', 'budget_max', 'follow_up_on', 'lost_reason', 'notes', 'attachments', 'last_contact_at'];
ok(Object.keys(ins).every(k => GRANTED_INSERT.includes(k)), 'insert row keys are granted');
const GRANTED_UPDATE = ['name', 'phone', 'email', 'address', 'details', 'stage', 'budget_min', 'budget_max', 'follow_up_on', 'lost_reason', 'notes', 'attachments', 'last_contact_at'];
const fullPatch = leadPatchRow({ name: 'a', phone: null, email: 'A@B.CO', address: '', details: 'd', stage: 'lost', budgetMin: 1, budgetMax: 2, followUpOn: 'bad', lostReason: ' Price ', notes: '', attachments: [], lastContactAt: null });
ok(Object.keys(fullPatch).every(k => GRANTED_UPDATE.includes(k)), 'patch row keys are granted');
eq([fullPatch.email, fullPatch.follow_up_on, fullPatch.lost_reason, fullPatch.notes, fullPatch.address], ['a@b.co', null, 'Price', null, null], 'patch cleaning');
eq(leadPatchRow({}), {}, 'empty patch');

const apptRow = mapAppointmentRow({ id: 'a', lead_id: 'l1', kind: 'nope', title: '', starts_at: '2026-11-16T15:00:00Z', status: 'x' });
eq([apptRow.kind, apptRow.title, apptRow.status, apptRow.endsAt], ['other', 'Appointment', 'scheduled', null], 'appointment row defaults');
const apptIns = appointmentInsertRow('u1', { title: ' Visit ', startsAt: '2026-11-16T15:00:00Z', leadId: 'l1' });
eq([apptIns.user_id, apptIns.status, apptIns.kind, apptIns.title, apptIns.starts_at, apptIns.lead_id], ['u1', 'scheduled', 'site_visit', 'Visit', '2026-11-16T15:00:00.000Z', 'l1'], 'appointment insert row');
eq(appointmentPatchRow({ status: 'done' }), { status: 'done' }, 'appointment status patch');
eq(appointmentPatchRow({ endsAt: null, jobId: '' }), { ends_at: null, job_id: null }, 'appointment clear patch');

// ------------------------------------------------------------------------------------------------ appointments
const at = (h: number, m = 0, day = 16) => new Date(2026, 10, day, h, m).toISOString();
const appt = (over: Partial<Appointment> = {}): Appointment => ({ ...mapAppointmentRow({ id: 'a', title: 'Visit', starts_at: at(9), status: 'scheduled', kind: 'site_visit' }), ...over });
eq(appointmentEnd(appt()).toISOString(), at(10), 'default 60 minutes');
eq(appointmentEnd(appt({ endsAt: at(11) })).toISOString(), at(11), 'explicit end');
ok(appointmentsOverlap(appt({ id: 'a' }), appt({ id: 'b', startsAt: at(9, 30) })), 'overlap');
ok(!appointmentsOverlap(appt({ id: 'a' }), appt({ id: 'b', startsAt: at(10) })), 'back to back is fine');
ok(!appointmentsOverlap(appt({ id: 'a' }), appt({ id: 'b', startsAt: at(9, 30), status: 'cancelled' })), 'cancelled never overlaps');
const list = [appt({ id: 'a' }), appt({ id: 'b', startsAt: at(9, 30) }), appt({ id: 'c', startsAt: at(14) }), appt({ id: 'd', startsAt: at(8), endsAt: at(12) })];
eq(findOverlaps(list).map(([x, y]) => `${x.id}${y.id}`).sort(), ['ab', 'da', 'db'], 'overlap pairs (earlier start first)');
eq(conflictsFor({ startsAt: at(13, 30), endsAt: at(14, 15) }, list).map(a => a.id), ['c'], 'conflicts for a new one');
eq(conflictsFor({ startsAt: at(14) }, list, 'c').map(a => a.id), [], 'moving one ignores itself');
eq(nextAppointment(list, new Date(2026, 10, 16, 10, 30).getTime())?.id, 'd', 'next = still running');
eq(nextAppointment(list, new Date(2026, 10, 16, 12, 30).getTime())?.id, 'c', 'next after noon');
eq(nextAppointment(list, NOW, { leadId: 'zzz' }), null, 'filter by lead');
ok(isPastAppointment(appt(), new Date(2026, 10, 16, 11).getTime()), 'past');
ok(!isPastAppointment(appt({ status: 'done' }), new Date(2026, 10, 17).getTime()), 'done is not "past to review"');
eq(validateAppointmentDraft({ title: 'X', startsAt: at(9) }), {}, 'valid draft');
ok(validateAppointmentDraft({ title: '', startsAt: at(9) }).title, 'title required');
ok(validateAppointmentDraft({ title: 'X', startsAt: 'nope' }).startsAt, 'start required');
ok(validateAppointmentDraft({ title: 'X', startsAt: at(9), endsAt: at(8) }).endsAt, 'end before start');
ok(validateAppointmentDraft({ title: 'X', startsAt: at(9), endsAt: at(9, 0, 30) }).endsAt, 'too long');

// ICS
eq(icsEscape('a, b; c\\d\ne'), 'a\\, b\\; c\\\\d\\ne', 'ics escape');
ok(icsFold('x'.repeat(200)).split('\r\n').every((l, i) => l.length <= 74 && (i === 0 || l.startsWith(' '))), 'ics folding');
const fields = appointmentIcsFields(appt({ id: 'abc', startsAt: '2026-11-16T15:00:00Z', endsAt: null, notes: 'Bring ladder', location: '1 Main St, Town' }), { now: new Date('2026-11-15T00:00:00Z') });
eq([fields.uid, fields.dtstart, fields.dtend, fields.dtstamp, fields.status], ['abc@contractordocs.app', '20261116T150000Z', '20261116T160000Z', '20261115T000000Z', 'CONFIRMED'], 'ics fields');
const ics = appointmentToIcs(appt({ id: 'abc', startsAt: '2026-11-16T15:00:00Z', location: '1 Main St, Town' }), { now: new Date('2026-11-15T00:00:00Z') });
ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n') && ics.includes('LOCATION:1 Main St\\, Town') && ics.includes('BEGIN:VEVENT'), 'ics document');
ok(appointmentToIcs(appt({ status: 'cancelled' })).includes('STATUS:CANCELLED'), 'cancelled ics');

// calendar
const calLeads = [lead({ id: 'f1', name: 'Fay', followUpOn: '2026-11-14' }), lead({ id: 'f2', name: 'Gus', followUpOn: '2026-11-16' }), lead({ id: 'f3', followUpOn: '2026-11-16', stage: 'won' })];
const calAppts = [appt({ id: 'x', leadId: 'f2', startsAt: at(9) }), appt({ id: 'y', startsAt: at(8), status: 'cancelled' }), appt({ id: 'z', startsAt: at(7, 0, 14) })];
const items = leadCalendarItems({ leads: calLeads, appointments: calAppts, today: TODAY, now: NOW, locale: 'en-US' });
eq(items.map(i => i.key), ['follow_up:f1', 'appointment:z', 'follow_up:f2', 'appointment:x'], 'calendar items: cancelled + closed left out, by day, follow-ups first');
ok(items.find(i => i.key === 'follow_up:f1')!.overdue, 'overdue follow-up');
ok(items.find(i => i.key === 'appointment:z')!.overdue, 'past scheduled appointment flagged');
ok(items.find(i => i.key === 'appointment:x')!.subtitle.includes('Gus'), 'appointment shows the lead');
eq(items.find(i => i.key === 'appointment:x')!.date, '2026-11-16', 'appointment local day');
eq(leadCalendarItems({ leads: calLeads, appointments: calAppts, today: TODAY, now: NOW, from: TODAY, to: TODAY }).map(i => i.key), ['follow_up:f1'], 'window keeps overdue follow-ups');
eq(calendarItemsOnDay(items, TODAY, TODAY).map(i => i.key), ['follow_up:f1'], 'overdue follow-up shows on today');
eq(countCalendarItemsByDay(items).get('2026-11-16'), 2, 'count per day');

// plan
eq(leadToolsForTier('free'), { leads: true, insights: false, reminders: false }, 'free plan: lead list');
eq(leadToolsForTier('premium'), { leads: true, insights: true, reminders: true }, 'premium plan');
ok(!MANUAL_LEAD_ORIGINS.includes('request_page'), 'manual origins never request_page');

// ------------------------------------------------------------------------------------------------ migration lint
const MIGRATION = 'supabase/migrations/20261116000500_leads_appointments.sql';
const sqlRaw = readFileSync(join(root, MIGRATION), 'utf8').replace(/\r\n/g, '\n');
const sql = sqlRaw.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const lower = sql.toLowerCase();
ok(/^-- Applied 2026-11-15 with the owner's OK/.test(sqlRaw.split('\n')[0]), 'header says applied with the owner OK');
ok(!/kelviq|merchant of record/i.test(sqlRaw), 'no billing provider names');

// quote_requests: only ADD COLUMN IF NOT EXISTS (+ the NOT VALID constraints, added once)
const qrAlters = lower.match(/alter table public\.quote_requests[^;]*/g) || [];
ok(qrAlters.length >= 10, 'quote_requests alters found');
for (const a of qrAlters) {
    ok(/^alter table public\.quote_requests add column if not exists /.test(a) || /add constraint %i %s not valid/.test(a), `only additive alters: ${a.slice(0, 80)}`);
}
for (const col of ['stage', 'lead_source', 'budget_min', 'budget_max', 'follow_up_on', 'lost_reason', 'notes', 'attachments', 'last_contact_at', 'stage_changed_at']) {
    ok(new RegExp(`add column if not exists ${col} `).test(lower), `adds ${col}`);
}
ok(/add column if not exists stage text not null default 'new'/.test(lower), "stage defaults to 'new'");
ok(/if not exists \(select 1 from pg_constraint where conname = c\.name/.test(lower), 'constraints added only once');
ok(!/\bdrop\s+(table|column|function|schema|constraint|index|view)\b/.test(lower), 'nothing dropped');
ok(!/\brename\b/.test(lower) && !/alter\s+column/.test(lower) && !/\btype\s+\w+\s+using\b/.test(lower), 'nothing renamed or retyped');
ok(!/^\s*(delete from|truncate|update public\.|insert into public\.)/m.test(lower), 'no data changed');
ok(!/function public\.(submit_quote_request|convert_quote_request|get_my_request_page|can_upload_request_photo)\b/.test(lower), 'old RPCs untouched');

// functions: definer, search_path '', body opens with as $$
const fnBlocks = sql.split(/create or replace function /i).slice(1);
eq(fnBlocks.length, 2, 'two functions');
for (const block of fnBlocks) {
    const head = block.slice(0, block.indexOf('$$') + 2);
    const name = block.slice(0, block.indexOf('(')).replace(/^public\./, '');
    ok(/security definer/i.test(head), `${name}: security definer`);
    ok(/set search_path = ''/i.test(head), `${name}: search_path ''`);
    ok(/\nas \$\$$/.test(head), `${name}: body opens with "as $$"`);
    ok(new RegExp(`revoke all on function public\\.${name}\\(\\) from public, anon, authenticated;`, 'i').test(sql), `${name}: revoked`);
}

// appointments: owner-only RLS
ok(/alter table public\.appointments enable row level security;/.test(lower), 'appointments RLS on');
for (const op of ['select', 'insert', 'update', 'delete']) {
    const m = new RegExp(`create policy appointments_${op}_own on public\\.appointments for ${op} to authenticated\\s+(using|with check) \\(user_id = \\(select auth\\.uid\\(\\)\\)\\)`).test(lower);
    ok(m, `appointments ${op} policy owner-only`);
}
ok(/create policy appointments_update_own[^;]*with check \(user_id = \(select auth\.uid\(\)\)\);/.test(lower), 'update policy has with check');
ok(/revoke all on public\.appointments from anon;/.test(lower), 'appointments: anon revoked');
ok(/lead_id\s+uuid references public\.quote_requests\(id\) on delete set null/.test(lower), 'lead FK set null');
ok(/job_id\s+uuid references public\.jobs\(id\) on delete set null/.test(lower), 'job FK set null');
ok(/check \(status in \('scheduled', 'done', 'cancelled', 'no_show'\)\)/.test(lower), 'appointment statuses');
ok(/trg_appointments_guard before insert or update on public\.appointments/.test(lower), 'appointment same-owner guard trigger');
const apGuard = fnBlocks.find(b => b.startsWith('public.guard_appointment'))!;
for (const t of ['quote_requests r where r.id = new.lead_id and r.user_id = new.user_id', 'jobs j where j.id = new.job_id and j.user_id = new.user_id', 'clients c where c.id = new.client_id and c.user_id = new.user_id']) {
    ok(apGuard.includes(t), `guard checks ${t.split(' ')[0]}`);
}

// no anon / public grants, no policy for anon
ok(!/grant[^;]*\bto\s+[^;]*\banon\b/.test(lower), 'no grant to anon');
ok(!/grant[^;]*\bto\s+public\b/.test(lower), 'no grant to public');
ok(!/create policy[^;]*\bto\s+[^;]*\b(anon|public)\b/.test(lower), 'no policy for anon / public');

// quote_requests: manual insert only, and the grants never expose public-only / link columns
ok(/create policy quote_requests_insert_own_manual on public\.quote_requests for insert to authenticated\s+with check \(user_id = \(select auth\.uid\(\)\) and lead_source <> 'request_page'\);/.test(lower), 'manual insert policy');
const insGrant = (lower.match(/grant insert \(([^)]*)\)\s+on public\.quote_requests to authenticated/) || [])[1] || '';
const updGrant = (lower.match(/grant update \(([^)]*)\)\s+on public\.quote_requests to authenticated/) || [])[1] || '';
const cols = (s: string) => s.split(',').map(c => c.trim()).filter(Boolean);
eq(cols(insGrant).sort(), [...GRANTED_INSERT].sort(), 'insert grant columns = leadInsertRow columns');
eq(cols(updGrant).sort(), [...GRANTED_UPDATE].sort(), 'update grant columns = leadPatchRow columns');
for (const c of ['id', 'source', 'status', 'photo_paths', 'client_id', 'job_id', 'converted_at', 'created_at', 'stage_changed_at']) {
    ok(!cols(insGrant).includes(c), `insert grant leaves out ${c}`);
}
for (const c of ['user_id', 'lead_source', 'source', 'photo_paths', 'client_id', 'job_id', 'converted_at', 'stage_changed_at']) {
    ok(!cols(updGrant).includes(c), `update grant leaves out ${c}`);
}
ok(!/grant (insert|update|all)\s+on public\.quote_requests/.test(lower), 'no table-wide insert / update grant');

// the lead guard: public rows get owner fields reset; manual rows can't look public
const leadGuard = fnBlocks.find(b => b.startsWith('public.guard_quote_request_lead'))!.toLowerCase();
const publicBranch = leadGuard.slice(leadGuard.indexOf("if new.lead_source = 'request_page' then"), leadGuard.indexOf('    else'));
for (const set of ["new.stage := 'new'", 'new.budget_min := null', 'new.budget_max := null', 'new.follow_up_on := null', 'new.lost_reason := null', 'new.notes := null', "new.attachments := '[]'::jsonb", 'new.last_contact_at := null']) {
    ok(publicBranch.includes(set), `public submission resets: ${set}`);
}
const manualBranch = leadGuard.slice(leadGuard.indexOf('    else'), leadGuard.indexOf("new.stage_changed_at := now();"));
for (const set of ["new.source := 'manual'", "new.photo_paths := '{}'::text[]", "new.status := 'seen'", 'new.client_id := null', 'new.job_id := null', 'new.converted_at := null']) {
    ok(manualBranch.includes(set), `manual lead forces: ${set}`);
}
ok(leadGuard.includes('new.lead_source := old.lead_source'), 'origin never changes');
ok(leadGuard.includes("raise exception 'a lead cannot change owner'"), 'owner never changes');
ok(/trg_quote_requests_lead_guard before insert or update on public\.quote_requests/.test(lower), 'lead guard trigger');
ok(/add column if not exists lead_source text not null default 'request_page'/.test(lower), "public rows default to 'request_page'");

// the old public submit RPC inserts only its own columns (none of the new ones) and stays granted as before
const oldSql = readFileSync(join(root, 'supabase/migrations/20261113000400_requests_and_job_photos.sql'), 'utf8').replace(/\r\n/g, '\n');
const submitInsert = (oldSql.match(/insert into public\.quote_requests \(([^)]*)\)/) || [])[1] || '';
eq(cols(submitInsert), ['id', 'user_id', 'name', 'phone', 'email', 'address', 'details', 'photo_paths', 'source'], 'public submit inserts the old columns only');
ok(/revoke all on public\.request_pages, public\.quote_requests,/.test(oldSql), 'anon still has no table privilege on quote_requests');

console.log(`leads-check: ${checks} checks passed`);
