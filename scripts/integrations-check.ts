/**
 * Checks for Settings > Integrations & data (roadmap N10): the calendar file, the QuickBooks / Xero import files and the
 * price-list import into the price book. Pure logic + static wiring checks; no browser, no network, no database:
 *   npx tsx scripts/integrations-check.ts
 *
 *  1. calendar file: golden output, escaping, folding at 75 octets (multi-byte safe), all-day vs timed, time zones,
 *     which items fall in the next 30 / 90 / 365 days
 *  2. accounting files: column maps, CSV escaping + formula guard, dates, filters, and on 300 random invoices (discounts,
 *     tax, shipping, progress billing, optional add-ons) the file adds up to documentTotals to the cent
 *  3. price list into the price book: matching, review ticks, writes, the old-prices file that undoes an import
 *  4. wiring: Settings section, offline audit, help, forbidden words, old features untouched
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    addDaysYmd, buildIcsCalendar, calendarFileName, collectCalendarEvents, describeCounts, icsDateTimeUtc, icsEscapeText, icsFoldLine, isYmdString,
    type CalendarOptions, type IcsEvent,
} from '../lib/integrations/icsCalendar.ts';
import { appointmentIcsFields } from '../lib/leads/appointmentLogic.ts';
import {
    ACCOUNTING_APPS, DATE_FORMATS, EXPORT_KINDS, LAYOUTS, allocateCents, buildAccountingExport, buildContactRecords, formatDate, invoiceLines, layoutFor,
    layoutHeader, makeContext, resolveVariables, splitAddress, standardTerms, type AccountingApp, type AccountingDoc, type AccountingFilters, type ExportKind,
} from '../lib/integrations/accountingExport.ts';
import {
    applyOutcomeText, cleanSelection, defaultSelection, diffHeadline, diffPriceBook, isBigChange, onlyBigChanges, parsePriceList, planPriceBookApply, priceBackupCsv,
    reviewSummary, setKind, summaryText, toggleKey, type BookItem, type PriceBookDiff,
} from '../lib/integrations/priceBookImport.ts';
import { documentTotals, expenseTotal } from '../lib/finance.ts';
import { roundMoney, toNumber } from '../utils/money.ts';
import { BOOKKEEPER_HEADER, buildBookkeeperRows, bookkeeperCsv } from '../lib/export/bookkeeper.ts';
import { CSV_BOM, csvCell } from '../lib/export/csv.ts';
import { WRITE_PATHS } from '../lib/offline/writePathAudit.ts';
import { scanWrites } from '../lib/offline/writePathScan.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
let passed = 0;
let failed = 0;
const check = (name: string, cond: unknown, detail?: unknown) => {
    if (cond) { passed++; return; }
    failed++;
    console.error(`FAIL ${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
};
const eq = (name: string, a: unknown, b: unknown) => check(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });

/** RFC 4180 reader (quotes, doubled quotes, CRLF inside quotes, BOM). */
const parseCsv = (text: string): string[][] => {
    const s = text.startsWith(CSV_BOM) ? text.slice(1) : text;
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quoted) {
            if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { row.push(cell); cell = ''; }
        else if (c === '\r' && s[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
        else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
};

// =====================================================================================================================
// 1. calendar file
// =====================================================================================================================
const NOW = new Date('2026-11-15T12:00:00Z');
const CRLF = '\r\n';

{
    // text escaping
    eq('escape: comma, semicolon, backslash, newline', icsEscapeText('a,b;c\\d\ne\r\nf'), 'a\\,b\\;c\\\\d\\ne\\nf');
    eq('escape: control characters are dropped, tab stays', icsEscapeText('x\u0000y\u0007z\tw'), 'xyz\tw');
    eq('escape: null and numbers', [icsEscapeText(null), icsEscapeText(12)], ['', '12']);

    // folding at 75 OCTETS
    const octets = (s: string) => new TextEncoder().encode(s).length;
    const long = `DESCRIPTION:${'abcdefghij'.repeat(30)}`;
    const folded = icsFoldLine(long);
    const phys = folded.split(CRLF);
    check('fold: a long line is cut', phys.length >= 4, phys.length);
    check('fold: every physical line is at most 75 octets', phys.every((l) => octets(l) <= 75), phys.map(octets));
    check('fold: continuation lines start with one space', phys.slice(1).every((l) => l.startsWith(' ') && !l.startsWith('  ')));
    eq('fold: unfolding gives the original line', folded.replace(/\r\n /g, ''), long);
    eq('fold: a short line is untouched', icsFoldLine('SUMMARY:Short'), 'SUMMARY:Short');
    eq('fold: exactly 75 octets is not folded', icsFoldLine('x'.repeat(75)), 'x'.repeat(75));
    check('fold: 76 octets is folded', icsFoldLine('x'.repeat(76)).includes(CRLF));
    // multi-byte characters are never split: 2-byte (é), 3-byte (日本) and 4-byte (emoji) runs
    for (const unit of ['é', '日本語', '🔨', 'aé日🔨']) {
        const line = `SUMMARY:${unit.repeat(60)}`;
        const f = icsFoldLine(line);
        const parts = f.split(CRLF);
        const decoder = new TextDecoder('utf-8', { fatal: true });
        let valid = true;
        try { parts.forEach((p) => decoder.decode(new TextEncoder().encode(p))); } catch { valid = false; }
        check(`fold: ${unit} keeps whole characters, lines <= 75 octets`, valid && parts.every((p) => octets(p) <= 75) && f.replace(/\r\n /g, '') === line, parts.map(octets));
    }

    // dates
    eq('utc stamp', icsDateTimeUtc(new Date('2026-11-16T14:30:00.000Z')), '20261116T143000Z');
    eq('addDaysYmd: month, year and leap-day boundaries', [addDaysYmd('2026-11-30', 1), addDaysYmd('2026-12-31', 1), addDaysYmd('2028-02-28', 1), addDaysYmd('2026-03-01', -1), addDaysYmd('2026-11-15', 365)], ['2026-12-01', '2027-01-01', '2028-02-29', '2026-02-28', '2027-11-15']);
    check('isYmdString', isYmdString('2026-02-28') && !isYmdString('2026-02-30') && !isYmdString('2026-2-3') && !isYmdString(null));

    // golden file
    const events: IcsEvent[] = [
        { kind: 'allday', uid: 'job-1@contractordocs.app', startYmd: '2026-11-17', endYmd: '2026-11-19', summary: 'Job: Kitchen remodel', description: 'Client: Smith, John\nAssigned to: Ana', location: '12 Oak St, Springfield', categories: ['Job'] },
        { kind: 'timed', uid: 'appt-1@contractordocs.app', start: new Date('2026-11-16T15:30:00Z'), end: new Date('2026-11-16T16:30:00Z'), summary: 'Site visit', description: 'Bring ladder; call first', location: '12 Oak St, Springfield', categories: ['Appointment'] },
        { kind: 'allday', uid: 'followup-9-2026-11-20@contractordocs.app', startYmd: '2026-11-20', summary: 'Follow up: Lee' },
    ];
    const golden = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ContractorDocs//Calendar file//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:ContractorDocs',
        'BEGIN:VEVENT', 'UID:appt-1@contractordocs.app', 'DTSTAMP:20261115T120000Z', 'DTSTART:20261116T153000Z', 'DTEND:20261116T163000Z', 'SUMMARY:Site visit',
        'DESCRIPTION:Bring ladder\\; call first', 'LOCATION:12 Oak St\\, Springfield', 'CATEGORIES:Appointment', 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:job-1@contractordocs.app', 'DTSTAMP:20261115T120000Z', 'DTSTART;VALUE=DATE:20261117', 'DTEND;VALUE=DATE:20261120', 'SUMMARY:Job: Kitchen remodel',
        'DESCRIPTION:Client: Smith\\, John\\nAssigned to: Ana', 'LOCATION:12 Oak St\\, Springfield', 'CATEGORIES:Job', 'STATUS:CONFIRMED', 'TRANSP:TRANSPARENT', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:followup-9-2026-11-20@contractordocs.app', 'DTSTAMP:20261115T120000Z', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261121', 'SUMMARY:Follow up: Lee',
        'STATUS:CONFIRMED', 'TRANSP:TRANSPARENT', 'END:VEVENT',
        'END:VCALENDAR', '',
    ].join(CRLF);
    const built = buildIcsCalendar(events, { now: NOW });
    eq('golden calendar file', built, golden);
    eq('same input, same file', buildIcsCalendar([...events].reverse(), { now: NOW }), golden);
    check('only CRLF line ends', !/(^|[^\r])\n/.test(built) && built.endsWith(CRLF));

    // a tiny reader: unfold, then every VEVENT has UID, DTSTAMP, DTSTART, DTEND and the file nests properly
    const unfold = (t: string) => t.replace(/\r\n[ \t]/g, '').split(CRLF).filter(Boolean);
    const lines = unfold(built);
    eq('reader: starts and ends', [lines[0], lines[lines.length - 1]], ['BEGIN:VCALENDAR', 'END:VCALENDAR']);
    const vevents: string[][] = [];
    let cur: string[] | null = null;
    for (const l of lines) { if (l === 'BEGIN:VEVENT') cur = []; else if (l === 'END:VEVENT') { vevents.push(cur!); cur = null; } else if (cur) cur.push(l); }
    check('reader: three events, each with UID / DTSTAMP / DTSTART / DTEND / SUMMARY', vevents.length === 3 && vevents.every((v) => ['UID:', 'DTSTAMP:', 'DTSTART', 'DTEND', 'SUMMARY:'].every((p) => v.some((l) => l.startsWith(p)))));
    check('all-day events have no time and no zone, timed ones end in Z',
        vevents.every((v) => v.some((l) => l.startsWith('DTSTART;VALUE=DATE:') && /:\d{8}$/.test(l)) !== v.some((l) => /^DTSTART:\d{8}T\d{6}Z$/.test(l))));

    // robustness
    const odd = buildIcsCalendar([
        { kind: 'timed', uid: 'x1', start: new Date('2026-11-16T10:00:00Z'), end: new Date('2026-11-16T09:00:00Z'), summary: 'End before start' },
        { kind: 'allday', uid: 'x2', startYmd: '2026-11-18', endYmd: '2026-11-17', summary: 'Last day before first day' },
        { kind: 'allday', uid: 'x3', startYmd: '2026-02-30', summary: 'Not a date' },
        { kind: 'timed', uid: 'x4', start: new Date('nope'), end: new Date('nope'), summary: 'Bad time' },
        { kind: 'allday', uid: 'x1', startYmd: '2026-11-18', summary: 'Same UID again' },
        { kind: 'allday', uid: 'x5', startYmd: '2026-12-31', summary: '' },
    ], { now: NOW });
    check('end before start becomes one hour', odd.includes('DTSTART:20261116T100000Z') && odd.includes('DTEND:20261116T110000Z'));
    check('last day before first day becomes a one-day event', odd.includes('DTSTART;VALUE=DATE:20261118') && odd.includes('DTEND;VALUE=DATE:20261119'));
    check('bad dates are dropped, a repeated UID is kept once', !odd.includes('Not a date') && !odd.includes('Bad time') && !odd.includes('Same UID again') && (odd.match(/BEGIN:VEVENT/g) || []).length === 3);
    check('all-day on the last day of the year ends on 1 January', odd.includes('DTSTART;VALUE=DATE:20261231') && odd.includes('DTEND;VALUE=DATE:20270101'));
    check('an empty summary gets a name', odd.includes('SUMMARY:Untitled'));
    const longSummary = buildIcsCalendar([{ kind: 'allday', uid: 'l1', startYmd: '2026-11-18', summary: `Rénovation ${'日本語'.repeat(40)} 🔨`, description: 'é'.repeat(200) }], { now: NOW });
    check('a whole file with long multi-byte text stays within 75 octets per line', longSummary.split(CRLF).every((l) => new TextEncoder().encode(l).length <= 75));
    check('a whole file with long multi-byte text unfolds back to the text', unfold(longSummary).some((l) => l === `SUMMARY:Rénovation ${'日本語'.repeat(40)} 🔨`));

    // which items are in the window
    const TODAY = '2026-11-16';
    const include = { jobs: true, appointments: true, followUps: true, tasks: true, dueDates: true };
    const opts = (over: Partial<CalendarOptions> = {}): CalendarOptions => ({ today: TODAY, days: 30, include, dayOf: (d) => d.toISOString().slice(0, 10), ...over });
    const appt = (id: string, startsAt: string, over: Record<string, unknown> = {}) => ({ id, title: `Appt ${id}`, notes: '', location: '', startsAt, endsAt: null, status: 'scheduled' as const, kind: 'site_visit' as const, leadId: null, ...over });
    const lead = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Lead ${id}`, phone: '555-0100', email: '', details: 'Needs a deck', stage: 'contacted' as const, archived: false, followUpOn: '2026-11-20', ...over });
    const input = {
        jobs: [
            { id: 'j-run', name: 'Running now', startDate: '2026-11-10', endDate: '2026-11-20', status: 'active', clientName: 'Smith', clientAddress: '1 Main St' },
            { id: 'j-soon', name: 'Starts soon', startDate: '2026-12-01', endDate: null, status: 'paused' },
            { id: 'j-far', name: 'Far away', startDate: '2027-03-01', endDate: '2027-03-05', status: 'active' },
            { id: 'j-over', name: 'Already over', startDate: '2026-10-01', endDate: '2026-11-01', status: 'active' },
            { id: 'j-old-open', name: 'Old, no end date', startDate: '2026-09-01', endDate: null, status: 'active' },
            { id: 'j-done', name: 'Completed', startDate: '2026-11-17', endDate: '2026-11-18', status: 'completed' },
            { id: 'j-nodate', name: 'No dates', startDate: null, endDate: null, status: 'active' },
        ],
        appointments: [
            appt('a1', '2026-11-17T15:00:00Z', { leadId: 'l1', location: '9 Pine Rd' }),
            appt('a2', '2026-11-18T15:00:00Z', { status: 'cancelled' }),
            appt('a3', '2026-12-20T15:00:00Z'),
            appt('a4', '2026-11-15T20:00:00Z'),
        ],
        leads: [lead('l1'), lead('l2', { stage: 'won' }), lead('l3', { archived: true }), lead('l4', { followUpOn: '2026-11-01' }), lead('l5', { followUpOn: null })],
        tasks: [
            { id: 't1', title: 'Order tile', notes: '', status: 'todo' as const, dueDate: '2026-11-18', jobId: 'j-run' },
            { id: 't2', title: 'Already done', notes: '', status: 'done' as const, dueDate: '2026-11-18', jobId: 'j-run' },
            { id: 't3', title: 'Too late', notes: '', status: 'doing' as const, dueDate: '2027-02-01', jobId: 'j-run' },
        ],
        documents: [
            { id: 'd1', type: 'Invoice', job_id: 'j-run', data: { status: 'Sent', invoiceNumber: 'INV-7', dueDate: '2026-11-25', clientName: 'Smith', lineItems: [{ description: 'Work', quantity: 1, rate: 1000 }], taxRate: 10, amountPaid: 100 } },
            { id: 'd2', type: 'Invoice', data: { status: 'Paid', invoiceNumber: 'INV-8', dueDate: '2026-11-25', lineItems: [{ quantity: 1, rate: 50 }] } },
            { id: 'd3', type: 'Invoice', data: { status: 'Draft', invoiceNumber: 'INV-9', dueDate: '2026-11-25', lineItems: [{ quantity: 1, rate: 50 }] } },
            { id: 'd4', type: 'Estimate', data: { status: 'Sent', estimateNumber: 'EST-3', expiryDate: '2026-11-30', clientName: 'Lee' } },
            { id: 'd5', type: 'Estimate', data: { status: 'Accepted', estimateNumber: 'EST-4', expiryDate: '2026-11-30' } },
            { id: 'd6', type: 'Purchase Order', data: { status: 'Confirmed', poNumber: 'PO-5', deliveryDate: '2026-11-22', supplier: 'Lumber Co' } },
            { id: 'd7', type: 'Purchase Order', data: { status: 'Received', poNumber: 'PO-6', deliveryDate: '2026-11-22' } },
            { id: 'd8', type: 'Invoice', data: { status: 'Overdue', invoiceNumber: 'INV-1', dueDate: '2026-10-01', lineItems: [{ quantity: 1, rate: 50 }] } },
        ],
    };
    const col = collectCalendarEvents(input as any, opts());
    eq('window of 30 days: counts', col.counts, { jobs: 2, appointments: 1, followUps: 1, tasks: 1, dueDates: 3 });
    eq('window end', col.windowEnd, '2026-12-16');
    const uids = col.events.map((e) => e.uid).sort();
    check('jobs: running now and starting soon only (not over, not completed, no dates, not far away, old open job not shown)',
        uids.includes('job-j-run@contractordocs.app') && uids.includes('job-j-soon@contractordocs.app') && !uids.some((u) => /job-j-(far|over|done|nodate|old-open)/.test(u)));
    const runJob = col.events.find((e) => e.uid === 'job-j-run@contractordocs.app') as any;
    eq('a running job keeps its whole span (not cut to the window)', [runJob.startYmd, runJob.endYmd], ['2026-11-10', '2026-11-20']);
    check('job event carries client and address', /Client: Smith/.test(runJob.description) && runJob.location === '1 Main St');
    const soon = col.events.find((e) => e.uid === 'job-j-soon@contractordocs.app') as any;
    eq('a job with no end date is one day', [soon.startYmd, soon.endYmd], ['2026-12-01', '2026-12-01']);
    const a1 = col.events.find((e) => e.uid.startsWith('a1@')) as any;
    check('appointment keeps the app’s own UID (same as its single .ics)', a1 && a1.uid === appointmentIcsFields(input.appointments[0] as any).uid);
    check('appointment is a timed UTC event with place and lead name', a1.kind === 'timed' && a1.location === '9 Pine Rd' && /With: Lead l1/.test(a1.description));
    check('cancelled, past and far appointments are left out', !col.events.some((e) => /^a[234]@/.test(e.uid)));
    eq('follow-ups: only open leads with a day inside the window', col.events.filter((e) => e.uid.startsWith('followup-')).map((e) => e.uid), ['followup-l1-2026-11-20@contractordocs.app']);
    check('tasks: only the open one due inside the window, with its job', col.events.filter((e) => e.uid.startsWith('task-')).length === 1 && /Job: Running now/.test((col.events.find((e) => e.uid.startsWith('task-t1')) as any).description));
    const inv = col.events.find((e) => e.uid.startsWith('doc-d1')) as any;
    check('unpaid invoice: due date, number and balance after the part payment', inv && inv.summary === 'Invoice INV-7 due' && /Balance due: \$1,000\.00/.test(inv.description), inv);
    check('paid, draft and past-due invoices, accepted estimates and received orders are left out', !col.events.some((e) => /doc-d(2|3|5|7|8)-/.test(e.uid)));
    check('estimate expiry and order delivery are listed', col.events.some((e) => e.summary === 'Estimate EST-3 expires') && col.events.some((e) => e.summary === 'Order PO-5 delivery'));
    eq('90 days: the December appointment joins (the cancelled and the past ones never do)', collectCalendarEvents(input as any, opts({ days: 90 })).counts.appointments, 2);
    check('365 days brings the far job and the late task', collectCalendarEvents(input as any, opts({ days: 365 })).counts.jobs === 3 && collectCalendarEvents(input as any, opts({ days: 365 })).counts.tasks === 2);
    const none = collectCalendarEvents(input as any, opts({ include: { jobs: false, appointments: false, followUps: false, tasks: false, dueDates: false } }));
    eq('nothing ticked, nothing listed', [none.events.length, describeCounts(none.counts)], [0, 'Nothing in this period']);
    const onlyJobs = collectCalendarEvents(input as any, opts({ include: { ...include, appointments: false, followUps: false, tasks: false, dueDates: false } }));
    check('only the ticked kinds', onlyJobs.events.length === 2 && onlyJobs.counts.jobs === 2);
    eq('describeCounts', describeCounts(col.counts), '8 items: 2 jobs, 1 appointment, 1 lead follow-up, 1 task due date, 3 invoice, estimate and order dates');

    // time zones: the window is decided in the OWNER'S local day, not UTC
    const lateNight = { appointments: [appt('tz1', '2026-11-16T03:30:00Z')] };
    const utcDay = (d: Date) => d.toISOString().slice(0, 10);
    const chicago = (d: Date) => new Date(d.getTime() - 6 * 3_600_000).toISOString().slice(0, 10); // UTC-6 (CST)
    eq('03:30 UTC on the 16th is the evening of the 15th in Chicago: before the window there, inside it in UTC',
        [collectCalendarEvents(lateNight as any, opts({ dayOf: chicago })).counts.appointments, collectCalendarEvents(lateNight as any, opts({ dayOf: utcDay })).counts.appointments], [0, 1]);
    const lastDay = { appointments: [appt('tz2', '2026-12-17T03:30:00Z')] };
    eq('03:30 UTC on 17 December is still the 16th in Chicago: the last day of the window there',
        [collectCalendarEvents(lastDay as any, opts({ dayOf: chicago })).counts.appointments, collectCalendarEvents(lastDay as any, opts({ dayOf: utcDay })).counts.appointments], [1, 0]);
    const tzFile = buildIcsCalendar(collectCalendarEvents(lateNight as any, opts({ dayOf: utcDay })).events, { now: NOW });
    check('the timed event is written as the same instant in UTC (no local-time offset baked in)', tzFile.includes('DTSTART:20261116T033000Z'));
    check('file name', calendarFileName('2026-11-16', 90) === 'ContractorDocs-calendar-2026-11-16-next-90-days.ics');
    // the real file for the realistic data set is a valid, folded, CRLF file
    const real = buildIcsCalendar(col.events, { now: NOW });
    check('realistic data: valid file', real.startsWith('BEGIN:VCALENDAR\r\n') && real.endsWith('END:VCALENDAR\r\n') && (real.match(/BEGIN:VEVENT/g) || []).length === col.events.length && (real.match(/END:VEVENT/g) || []).length === col.events.length);
}

// =====================================================================================================================
// 2. accounting files
// =====================================================================================================================
let seed = 20261115;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];

const RANGE = { start: '2026-03-01', end: '2026-03-31' };
const FILTERS: AccountingFilters = { range: RANGE, invoiceStatus: 'billed', contacts: 'all', category: 'all', paymentSource: 'all' };

const doc = (id: string, type: string, data: Record<string, any>, extra: Partial<AccountingDoc> = {}): AccountingDoc =>
    ({ id, type, job_id: null, client_id: null, created_at: '2026-03-10T12:00:00Z', data, ...extra });

const CLIENTS = [
    { id: 'c1', name: 'Smith, John', email: 'john@example.com', phone: '555-0101', address: '12 Oak St, Springfield, IL 62701', notes: 'Gate code 1234' },
    { id: 'c2', name: 'Acme "Roofing" Co', email: 'bills@acme.test', phone: '555-0102', address: 'PO Box 9', notes: '' },
    { id: 'c3', name: '=HYPERLINK("http://evil","x")', email: '', phone: '', address: '', notes: '' },
    { id: 'c4', name: 'smith, john', email: 'dup@example.com', phone: '', address: '', notes: '' },
];
const JOBS = [{ id: 'j1', name: 'Kitchen remodel', client_id: 'c1', client_name: 'Smith, John' }, { id: 'j2', name: 'Roof', client_id: 'c2', client_name: 'Acme "Roofing" Co' }];

{
    // column maps are plain data and complete
    const GOLDEN_XERO_INVOICE_HEADER = ['*ContactName', 'EmailAddress', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate', 'InventoryItemCode', '*Description', '*Quantity', '*UnitAmount', '*AccountCode', '*TaxType', 'TrackingName1', 'TrackingOption1', 'TrackingName2', 'TrackingOption2'];
    const GOLDEN_QBO_INVOICE_HEADER = ['InvoiceNo', 'Customer', 'InvoiceDate', 'DueDate', 'Terms', 'Location', 'Memo', 'Item(Product/Service)', 'ItemDescription', 'ItemQuantity', 'ItemRate', 'ItemAmount', 'ItemTaxCode', 'ItemTaxAmount', 'Service Date'];
    eq('Xero invoice columns', layoutHeader(layoutFor('xero', 'invoices')), GOLDEN_XERO_INVOICE_HEADER);
    eq('QuickBooks invoice columns', layoutHeader(layoutFor('quickbooks', 'invoices')), GOLDEN_QBO_INVOICE_HEADER);
    check('2 apps x 4 files = 8 layouts', Object.keys(LAYOUTS).length === 8 && ACCOUNTING_APPS.length === 2 && EXPORT_KINDS.length === 4);
    for (const app of ['quickbooks', 'xero'] as AccountingApp[]) {
        for (const kind of EXPORT_KINDS.map((k) => k.id)) {
            const l = layoutFor(app, kind);
            check(`${app}.${kind}: headers are unique and non-empty`, l.columns.length >= 3 && new Set(l.columns.map((c) => c[0])).size === l.columns.length && l.columns.every((c) => c[0].trim() && c[1]));
            check(`${app}.${kind}: names the place to import and says how amounts are treated`, l.importAt.length > 20 && l.note.length > 20 && DATE_FORMATS.some((f) => f.id === l.dateFormat));
            check(`${app}.${kind}: variables have a default and a help line`, l.variables.every((v) => v.key && v.value && v.help.length > 10));
        }
    }
    eq('variables: defaults, then the owner’s edits, blanks fall back', [resolveVariables(layoutFor('xero', 'invoices')), resolveVariables(layoutFor('xero', 'invoices'), { accountCode: ' 260 ', taxedType: '' })],
        [{ accountCode: '200', taxedType: 'Tax on Sales', untaxedType: 'Tax Exempt' }, { accountCode: '260', taxedType: 'Tax on Sales', untaxedType: 'Tax Exempt' }]);

    // every field a layout asks for is produced by the builder (no silently empty required column)
    const sampleDocs: AccountingDoc[] = [
        doc('i1', 'Invoice', { status: 'Sent', invoiceNumber: 'INV-1001', issueDate: '2026-03-04', dueDate: '2026-04-03', clientName: 'Smith, John', title: 'Kitchen', lineItems: [{ description: 'Demo wall', quantity: 2, rate: 150 }], taxRate: 8, discount: 10, shipping: 5 }, { job_id: 'j1', client_id: 'c1' }),
        doc('e1', 'Expense Log', { date: '2026-03-06', vendor: 'Home Depot', item: 'Lumber', category: 'Material', amount: 108, tax: 8 }),
        doc('r1', 'Receipt', { date: '2026-03-12', receiptNumber: 'RC-1', clientName: 'Smith, John', amount: 100, paymentMethod: 'Check', invoiceNumber: 'INV-1001', description: 'Deposit' }),
    ];
    for (const app of ['quickbooks', 'xero'] as AccountingApp[]) {
        for (const kind of EXPORT_KINDS.map((k) => k.id)) {
            const out = buildAccountingExport({ app, kind, documents: sampleDocs, jobs: JOBS, clients: CLIENTS, filters: FILTERS });
            const l = layoutFor(app, kind);
            check(`${app}.${kind}: has rows for the sample data`, out.rowCount >= 1, out.rowCount);
            const requiredEmpty = l.columns.map((c, i) => ({ c, i })).filter(({ c }) => c[0].startsWith('*') && c[1] !== 'blank').filter(({ i }) => out.rows.some((r) => r[i] === ''));
            check(`${app}.${kind}: every * (required) column is filled on every row`, requiredEmpty.length === 0, requiredEmpty.map((x) => x.c[0]));
            const unknownFields = l.columns.filter((c) => c[1] !== 'blank').filter((c) => !out.rows.length || out.rows.every((_, ri) => out.rows[ri][l.columns.indexOf(c)] === '') && !['email', 'notes', 'street', 'city', 'state', 'zip', 'country', 'terms', 'phone', 'taxAmount', 'taxCode', 'reference', 'memo'].includes(c[1]));
            check(`${app}.${kind}: no column is always empty by mistake`, unknownFields.length === 0, unknownFields.map((c) => c[0]));
            check(`${app}.${kind}: csv = BOM + header + CRLF rows`, out.csv.startsWith(CSV_BOM) && parseCsv(out.csv)[0].join('|') === out.header.join('|') && parseCsv(out.csv).length === out.rowCount + 1 && out.csv.endsWith('\r\n'));
            check(`${app}.${kind}: file name says app, kind and period`, new RegExp(`^ContractorDocs-${app}-${kind}-2026-03\\.csv$`).test(out.fileName), out.fileName);
        }
    }

    // golden invoice file (hand-checked numbers): 2 x 150 + 99.99 = 399.99; -20 discount -> 379.99; tax 8.25% = 31.35; +10 shipping = 421.34
    const goldenInvoice = doc('g1', 'Invoice', {
        status: 'Sent', invoiceNumber: 'INV-1001', issueDate: '2026-03-04', dueDate: '2026-04-03', clientName: 'Smith, John', title: 'Kitchen remodel',
        lineItems: [{ description: 'Demo wall', quantity: 2, rate: 150 }, { description: 'Paint', quantity: 1, rate: 99.99 }], taxRate: 8.25, discount: 20, shipping: 10,
    }, { job_id: 'j1', client_id: 'c1' });
    const x = buildAccountingExport({ app: 'xero', kind: 'invoices', documents: [goldenInvoice], jobs: JOBS, clients: CLIENTS, filters: FILTERS });
    eq('golden Xero invoices', x.csv, `${CSV_BOM}${GOLDEN_XERO_INVOICE_HEADER.join(',')}\r\n`
        + '"Smith, John",john@example.com,INV-1001,Kitchen remodel,2026-03-04,2026-04-03,,Demo wall,2,150.00,200,Tax on Sales,,,,\r\n'
        + '"Smith, John",john@example.com,INV-1001,Kitchen remodel,2026-03-04,2026-04-03,,Paint,1,99.99,200,Tax on Sales,,,,\r\n'
        + '"Smith, John",john@example.com,INV-1001,Kitchen remodel,2026-03-04,2026-04-03,,Discount,1,-20.00,200,Tax on Sales,,,,\r\n'
        + '"Smith, John",john@example.com,INV-1001,Kitchen remodel,2026-03-04,2026-04-03,,Shipping,1,10.00,200,Tax Exempt,,,,\r\n');
    const q = buildAccountingExport({ app: 'quickbooks', kind: 'invoices', documents: [goldenInvoice], jobs: JOBS, clients: CLIENTS, filters: FILTERS, dateFormat: 'MM/DD/YYYY' });
    eq('golden QuickBooks invoices (month-first dates, tax split by cents, standard terms)', q.csv, `${CSV_BOM}${GOLDEN_QBO_INVOICE_HEADER.join(',')}\r\n`
        + 'INV-1001,"Smith, John",03/04/2026,04/03/2026,Net 30,,Kitchen remodel,Services,Demo wall,2,150.00,300.00,TAX,24.75,\r\n'
        + 'INV-1001,"Smith, John",03/04/2026,04/03/2026,Net 30,,Kitchen remodel,Services,Paint,1,99.99,99.99,TAX,8.25,\r\n'
        + 'INV-1001,"Smith, John",03/04/2026,04/03/2026,Net 30,,Kitchen remodel,Services,Discount,1,-20.00,-20.00,TAX,-1.65,\r\n'
        + 'INV-1001,"Smith, John",03/04/2026,04/03/2026,Net 30,,Kitchen remodel,Services,Shipping,1,10.00,10.00,NON,0.00,\r\n');
    check('summary: 1 invoice, total 421.34, tax 31.35, net 390', x.invoiceSummary!.invoices === 1 && x.invoiceSummary!.total === 421.34 && x.invoiceSummary!.tax === 31.35 && x.invoiceSummary!.net === 389.99, x.invoiceSummary);
    check('document math agrees: total 421.34', documentTotals({ id: 'g1', type: 'Invoice', ...goldenInvoice.data } as any).total === 421.34);
    eq('rows and records are counted separately (4 rows, 1 invoice)', [x.rowCount, x.records], [4, 1]);
    check('edited variables show up in the file', buildAccountingExport({ app: 'xero', kind: 'invoices', documents: [goldenInvoice], jobs: JOBS, clients: CLIENTS, filters: FILTERS, variables: { accountCode: '260', taxedType: 'Sales Tax' } }).csv.includes(',260,Sales Tax'));

    // escaping and the formula guard
    const nasty = doc('n1', 'Invoice', {
        status: 'Sent', invoiceNumber: 'INV-2', issueDate: '2026-03-05', dueDate: '2026-03-05', clientName: '=HYPERLINK("http://evil","x")', title: '+cmd|calc',
        lineItems: [{ description: 'Say "hello", world\nsecond line', quantity: 1, rate: 10 }, { description: '-5% friend discount', quantity: 1, rate: 20 }, { description: '@SUM(A1)', quantity: 1, rate: 30 }, { description: '<b>Bold</b> &amp; tidy', quantity: 1, rate: 5 }],
    });
    const nn = buildAccountingExport({ app: 'xero', kind: 'invoices', documents: [nasty], jobs: [], clients: [], filters: FILTERS });
    const nrows = parseCsv(nn.csv);
    eq('escaping: quotes, commas and line breaks survive a round trip', nrows[1][7], 'Say "hello", world\nsecond line');
    check('formula guard: =, +, -, @ at the start get an apostrophe', nrows[1][0] === '\'=HYPERLINK("http://evil","x")' && nrows[2][7] === "'-5% friend discount" && nrows[3][7] === "'@SUM(A1)", [nrows[1][0], nrows[2][7], nrows[3][7]]);
    check('formula guard: negative money stays a plain number', csvCell('-20.00') === '-20.00' && csvCell('0.00') === '0.00');
    eq('html in descriptions is plain text', nrows[4][7], 'Bold & tidy');
    check('no raw formula start in any cell of any file', ['quickbooks', 'xero'].every((app) => EXPORT_KINDS.every((k) => parseCsv(buildAccountingExport({ app: app as AccountingApp, kind: k.id, documents: [nasty], jobs: [], clients: CLIENTS, filters: FILTERS }).csv).slice(1).every((r) => r.every((c) => !/^[=+@\t]/.test(c))))));
    check('amounts have 2 decimals and no currency sign anywhere', nrows.slice(1).every((r) => /^-?\d+\.\d{2}$/.test(r[9]) && !/[$€£,]/.test(r[9])));

    // dates
    eq('date formats', [formatDate('2026-03-04', 'YYYY-MM-DD'), formatDate('2026-03-04', 'MM/DD/YYYY'), formatDate('2026-03-04', 'DD/MM/YYYY'), formatDate('nope', 'MM/DD/YYYY'), formatDate(null, 'YYYY-MM-DD')], ['2026-03-04', '03/04/2026', '04/03/2026', '', '']);
    check('default date format is YYYY-MM-DD in every layout (a documented setting)', Object.values(LAYOUTS).every((l) => l.dateFormat === 'YYYY-MM-DD'));
    check('Xero dates in day-first format', buildAccountingExport({ app: 'xero', kind: 'invoices', documents: [goldenInvoice], jobs: [], clients: [], filters: FILTERS, dateFormat: 'DD/MM/YYYY' }).csv.includes(',04/03/2026,03/04/2026,'));
    eq('terms', [standardTerms('2026-03-04', '2026-03-04'), standardTerms('2026-03-04', '2026-04-03'), standardTerms('2026-03-04', '2026-03-19'), standardTerms('2026-03-04', '2026-05-03'), standardTerms('2026-03-04', '2026-03-14'), standardTerms('', '2026-03-14')],
        ['Due on receipt', 'Net 30', 'Net 15', 'Net 60', '', '']);

    // filters
    const mk = (id: string, status: string, date: string) => doc(id, 'Invoice', { status, invoiceNumber: id.toUpperCase(), issueDate: date, dueDate: date, lineItems: [{ description: id, quantity: 1, rate: 10 }] });
    const pool = [mk('draft', 'Draft', '2026-03-10'), mk('canc', 'Cancelled', '2026-03-10'), mk('sent', 'Sent', '2026-03-10'), mk('over', 'Overdue', '2026-03-10'), mk('paid', 'Paid', '2026-03-10'),
        mk('first', 'Sent', '2026-03-01'), mk('last', 'Sent', '2026-03-31'), mk('before', 'Sent', '2026-02-28'), mk('after', 'Sent', '2026-04-01'), doc('x', 'Estimate', { status: 'Sent', estimateNumber: 'E' })];
    const numbers = (status: 'billed' | 'unpaid' | 'paid') => buildAccountingExport({ app: 'xero', kind: 'invoices', documents: pool, jobs: [], clients: [], filters: { ...FILTERS, invoiceStatus: status } }).rows.map((r) => r[2]).sort();
    eq('status billed: no drafts, cancelled or estimates; both ends of the range are included', numbers('billed'), ['FIRST', 'LAST', 'OVER', 'PAID', 'SENT']);
    eq('status unpaid', numbers('unpaid'), ['FIRST', 'LAST', 'OVER', 'SENT']);
    eq('status paid', numbers('paid'), ['PAID']);
    eq('empty period gives an empty file with just the header', buildAccountingExport({ app: 'xero', kind: 'invoices', documents: pool, jobs: [], clients: [], filters: { ...FILTERS, range: { start: '2025-01-01', end: '2025-01-31' } } }).rowCount, 0);

    // THE BIG ONE: random invoices add up to the documents, to the cent
    const money2 = (n: number) => Math.round(n * 100) / 100;
    const randomInvoice = (i: number): AccountingDoc => {
        const progress = rnd() < 0.25;
        const items = Array.from({ length: Math.floor(rnd() * 6) }, (_, k) => {
            const quantity = pick([1, 2, 3.5, 0.125, 12, 7.25, 100, 0.0005, 3, 0.3333]);
            const rate = pick([10, 19.99, 0.1, 1234.5, 0.333, 75, 4.5, 0.07, 249.995]);
            const scheduled = quantity * rate;
            const item: Record<string, unknown> = { description: pick(['Tile', 'Paint, 2 coats', 'Labor "rough-in"', 'Permit', 'Cabinets', '']), quantity, rate };
            if (progress) { item.percentComplete = pick([0, 10, 25, 33.3, 50, 100]); item.previouslyBilled = money2(scheduled * pick([0, 0.05, 0.2]) ); }
            if (rnd() < 0.18) { item.optional = true; item.selected = rnd() < 0.5; }
            return item;
        });
        const subtotalGuess = items.reduce((s, it: any) => s + it.quantity * it.rate, 0);
        const data: Record<string, any> = {
            status: pick(['Sent', 'Overdue', 'Paid', 'Sent']), invoiceNumber: `INV-${3000 + i}`, issueDate: `2026-03-${String(1 + Math.floor(rnd() * 31)).padStart(2, '0')}`, dueDate: '2026-04-15',
            clientName: pick(['Smith, John', 'Acme "Roofing" Co', 'Lee']), lineItems: items, taxRate: pick([0, 6, 7.5, 8.25, 10.5, 0]),
            discount: rnd() < 0.4 ? money2(subtotalGuess * pick([0.05, 0.2, 0.9, 1.3])) : 0, shipping: rnd() < 0.3 ? 12.5 : 0, isProgressBilling: progress,
        };
        return doc(`id-${i}-aaaaaa`, 'Invoice', data, { job_id: pick(['j1', 'j2', null]) });
    };
    const randoms = Array.from({ length: 300 }, (_, i) => randomInvoice(i));
    let moneyChecked = 0;
    let withTax = 0;
    let withDiscount = 0;
    let withProgress = 0;
    let withOptional = 0;
    let withShipping = 0;
    for (const app of ['xero', 'quickbooks'] as AccountingApp[]) {
        const out = buildAccountingExport({ app, kind: 'invoices', documents: randoms, jobs: JOBS, clients: CLIENTS, filters: FILTERS });
        const rows = parseCsv(out.csv);
        const header = rows[0];
        const col = (name: string) => header.indexOf(name);
        const iNo = col(app === 'xero' ? '*InvoiceNumber' : 'InvoiceNo');
        const iQty = col(app === 'xero' ? '*Quantity' : 'ItemQuantity');
        const iUnit = col(app === 'xero' ? '*UnitAmount' : 'ItemRate');
        const iAmt = app === 'quickbooks' ? col('ItemAmount') : -1;
        const iTax = app === 'quickbooks' ? col('ItemTaxAmount') : -1;
        const byInvoice = new Map<string, string[][]>();
        for (const r of rows.slice(1)) byInvoice.set(r[iNo], [...(byInvoice.get(r[iNo]) || []), r]);
        const expected = randoms.filter((d) => d.data.status !== 'Draft' && d.data.status !== 'Cancelled' && d.data.issueDate >= RANGE.start && d.data.issueDate <= RANGE.end);
        check(`${app}: every billed invoice in the period is in the file once`, byInvoice.size === expected.length, [byInvoice.size, expected.length]);
        let sumTotals = 0;
        for (const d of expected) {
            const t = documentTotals({ id: d.id, type: 'Invoice', ...d.data } as any);
            sumTotals = roundMoney(sumTotals + t.total);
            const lines = byInvoice.get(d.data.invoiceNumber) || [];
            // the cents the importing app adds up from the file: quantity x unit amount of each line, rounded per line
            const net = roundMoney(lines.reduce((s, r) => s + roundMoney(toNumber(r[iQty]) * toNumber(r[iUnit])), 0));
            const wantNet = roundMoney(t.total - t.tax);
            if (net !== wantNet) check(`${app}: ${d.data.invoiceNumber} lines add up to total - tax`, false, { net, wantNet, total: t.total, tax: t.tax, lines });
            else moneyChecked++;
            if (app === 'quickbooks') {
                const amountSum = roundMoney(lines.reduce((s, r) => s + toNumber(r[iAmt]), 0));
                const taxSum = roundMoney(lines.reduce((s, r) => s + toNumber(r[iTax]), 0));
                if (amountSum !== wantNet || taxSum !== t.tax || roundMoney(amountSum + taxSum) !== t.total) check(`${app}: ${d.data.invoiceNumber} amounts + tax = total`, false, { amountSum, taxSum, t });
                else moneyChecked++;
            }
            if (t.tax > 0) withTax++;
            if (t.discount > 0) withDiscount++;
            if (t.shipping > 0) withShipping++;
            if (d.data.isProgressBilling) withProgress++;
            if ((d.data.lineItems as any[]).some((l) => l.optional)) withOptional++;
        }
        check(`${app}: summary total equals the sum of documentTotals`, out.invoiceSummary!.total === sumTotals, [out.invoiceSummary!.total, sumTotals]);
        check(`${app}: summary net + tax = total`, roundMoney(out.invoiceSummary!.net + out.invoiceSummary!.tax) === out.invoiceSummary!.total, out.invoiceSummary);
        check(`${app}: every money cell has exactly 2 decimals`, rows.slice(1).every((r) => /^-?\d+\.\d{2}$/.test(r[iUnit])));
    }
    check(`300 random invoices x 2 apps: ${moneyChecked} per-invoice sums matched documentTotals`, moneyChecked >= 400, moneyChecked);
    check('the random set covers tax, discount, shipping, progress billing and optional add-ons', withTax > 20 && withDiscount > 20 && withShipping > 20 && withProgress > 20 && withOptional > 20, { withTax, withDiscount, withShipping, withProgress, withOptional });

    // explicit cases: optional add-ons and progress billing as the document shows them
    const addon = doc('ad1', 'Invoice', { status: 'Sent', invoiceNumber: 'INV-ADD', issueDate: '2026-03-05', dueDate: '2026-03-20', clientName: 'Lee', taxRate: 10,
        lineItems: [{ description: 'Base', quantity: 1, rate: 1000 }, { description: 'Sunroom add-on', quantity: 1, rate: 500, optional: true }, { description: 'Gutters add-on', quantity: 1, rate: 200, optional: true, selected: true }] });
    const addonOut = buildAccountingExport({ app: 'quickbooks', kind: 'invoices', documents: [addon], jobs: [], clients: [], filters: FILTERS });
    const addonRows = parseCsv(addonOut.csv).slice(1);
    check('optional add-on: not selected is left out, selected is counted', !addonOut.csv.includes('Sunroom') && addonOut.csv.includes('Gutters') && addonRows.length === 2 && addonOut.invoiceSummary!.total === 1320, [addonRows.length, addonOut.invoiceSummary]);
    const prog = doc('pg1', 'Invoice', { status: 'Sent', invoiceNumber: 'INV-PRG', issueDate: '2026-03-05', dueDate: '2026-03-20', clientName: 'Lee', taxRate: 0, isProgressBilling: true,
        lineItems: [{ description: 'Framing', quantity: 1, rate: 10000, percentComplete: 60, previouslyBilled: 2500 }, { description: 'Roofing', quantity: 1, rate: 8000, percentComplete: 0, previouslyBilled: 0 }] });
    const progOut = buildAccountingExport({ app: 'xero', kind: 'invoices', documents: [prog], jobs: [], clients: [], filters: FILTERS });
    const progRows = parseCsv(progOut.csv).slice(1);
    check('progress billing: what THIS invoice bills (60% of 10,000 minus 2,500 = 3,500), zero lines left out, % in the description', progRows.length === 1 && progRows[0][7] === 'Framing (60% complete)' && progRows[0][8] === '1' && progRows[0][9] === '3500.00' && progOut.invoiceSummary!.total === 3500, progRows);
    const credit = doc('cr1', 'Invoice', { status: 'Sent', invoiceNumber: 'INV-CR', issueDate: '2026-03-05', dueDate: '2026-03-20', clientName: 'Lee', taxRate: 0, lineItems: [{ description: 'Credit', quantity: 1, rate: -50 }, { description: 'Work', quantity: 2, rate: 100 }] });
    check('negative lines (credits) are exported as they are', buildAccountingExport({ app: 'xero', kind: 'invoices', documents: [credit], jobs: [], clients: [], filters: FILTERS }).csv.includes(',Credit,1,-50.00,') );
    const empty = doc('em1', 'Invoice', { status: 'Sent', invoiceNumber: 'INV-EMPTY', issueDate: '2026-03-05', dueDate: '2026-03-20', clientName: 'Lee', lineItems: [] });
    check('an invoice with no lines is not lost', parseCsv(buildAccountingExport({ app: 'xero', kind: 'invoices', documents: [empty], jobs: [], clients: [], filters: FILTERS }).csv).length === 2);
    const noNumber = doc('abc123-def', 'Invoice', { status: 'Sent', issueDate: '2026-03-05', lineItems: [{ description: 'A', quantity: 1, rate: 5 }] });
    const nnOut = buildAccountingExport({ app: 'xero', kind: 'invoices', documents: [noNumber], jobs: [], clients: [], filters: FILTERS });
    check('no number / no client: a stable temporary number, "Unknown customer" and a note for each', nnOut.rows[0][2] === 'INV-abc123' && nnOut.rows[0][0] === 'Unknown customer' && nnOut.notes.length === 2, [nnOut.rows[0], nnOut.notes]);
    const sub = invoiceLines({ lineItems: [{ description: 'Pipe', quantity: 3, rate: 0.333 }], taxRate: 0 });
    check('sub-cent rates fall back to 1 x the line amount (the app can’t multiply it back exactly)', sub.lines[0].quantity === 1 && sub.lines[0].unitAmount === 1 && sub.lines[0].amount === 1, sub.lines);

    // allocateCents: always adds up
    let allocOk = true;
    for (let k = 0; k < 500; k++) {
        const n = 1 + Math.floor(rnd() * 6);
        const weights = Array.from({ length: n }, () => Math.round((rnd() * 2000 - (rnd() < 0.2 ? 500 : 0)) * 100));
        if (weights.reduce((s, w) => s + w, 0) <= 0) continue;
        const total = Math.round(rnd() * 100000);
        const shares = allocateCents(total, weights);
        if (shares.reduce((s, v) => s + v, 0) !== total || !shares.every(Number.isInteger)) allocOk = false;
    }
    check('allocateCents: shares are whole cents and add up to the total', allocOk);
    eq('allocateCents: even split of 100 cents over 3', allocateCents(100, [1, 1, 1]), [34, 33, 33]);
    eq('allocateCents: no weight, no shares', allocateCents(100, [0, 0]), [0, 0]);

    // the same invoices as the bookkeeper CSV sees them (that file is untouched)
    const flat = randoms.map((d) => ({ id: d.id, type: d.type, job_id: d.job_id, created_at: d.created_at, ...d.data }));
    const bk = buildBookkeeperRows(flat as any, RANGE, new Map(JOBS.map((j) => [j.id, { name: j.name, clientName: j.client_name }])));
    const bkTotal = roundMoney(bk.filter((r) => r.type === 'Invoice').reduce((s, r) => s + r.total, 0));
    const ours = buildAccountingExport({ app: 'xero', kind: 'invoices', documents: randoms, jobs: JOBS, clients: CLIENTS, filters: FILTERS });
    check('the bookkeeper CSV and the Xero file agree on the invoice total', bkTotal === ours.invoiceSummary!.total, [bkTotal, ours.invoiceSummary!.total]);
    eq('bookkeeper CSV columns unchanged', [...BOOKKEEPER_HEADER], ['Date', 'Type', 'Number', 'Client / Vendor', 'Description', 'Net', 'Tax', 'Total', 'Status', 'Paid date', 'Category', 'Job']);
    check('bookkeeper CSV still builds', bookkeeperCsv(bk).startsWith(CSV_BOM + BOOKKEEPER_HEADER.join(',')));

    // contacts
    eq('address split: US shape', splitAddress('12 Oak St, Springfield, IL 62701'), { street: '12 Oak St', city: 'Springfield', state: 'IL', zip: '62701', country: '' });
    eq('address split: with ZIP+4 and country', splitAddress('12 Oak St, Apt 3, Springfield, il 62701-1234, USA'), { street: '12 Oak St, Apt 3', city: 'Springfield', state: 'IL', zip: '62701-1234', country: 'USA' });
    eq('address split: anything else stays whole', splitAddress('PO Box 9'), { street: 'PO Box 9', city: '', state: '', zip: '', country: '' });
    eq('address split: empty', splitAddress(null).street, '');
    const ctx = makeContext(JOBS, CLIENTS);
    const allContacts = buildContactRecords(CLIENTS, [], ctx, { ...FILTERS, contacts: 'all' });
    check('contacts: duplicate names listed once (case-insensitive), sorted, none lost', allContacts.records.length === 3 && allContacts.duplicates === 1, allContacts);
    const invoiced = buildContactRecords(CLIENTS, [goldenInvoice, mk('x1', 'Draft', '2026-03-10')], ctx, { ...FILTERS, contacts: 'invoiced' });
    eq('contacts: only clients invoiced in the period', invoiced.records.map((r) => r.name), ['Smith, John']);
    const cx = buildAccountingExport({ app: 'quickbooks', kind: 'contacts', documents: [], jobs: [], clients: CLIENTS, filters: FILTERS });
    check('contacts file: formula-looking names are guarded, address split into columns', cx.rows.some((r) => r[0] === '=HYPERLINK("http://evil","x")') && parseCsv(cx.csv).some((r) => r[0] === '\'=HYPERLINK("http://evil","x")') && cx.rows.some((r) => r[3] === '12 Oak St' && r[5] === 'IL' && r[6] === '62701'));
    check('Xero contacts use the contact name column', buildAccountingExport({ app: 'xero', kind: 'contacts', documents: [], jobs: [], clients: CLIENTS, filters: FILTERS }).header[0] === '*ContactName');

    // expenses
    const ex = [
        doc('e1', 'Expense Log', { date: '2026-03-02', vendor: 'Home Depot', item: 'Lumber', category: 'Material', amount: 216.5, tax: 16.5 }, { job_id: 'j1' }),
        doc('e2', 'Expense Log', { date: '2026-03-03', vendor: '', category: 'Fuel', lineItems: [{ description: 'Diesel', quantity: 1, rate: 80 }, { description: 'Wash', quantity: 2, rate: 5 }], tax: 0 }),
        doc('e3', 'Expense Log', { date: '2026-04-03', vendor: 'Late', category: 'Other', amount: 10 }),
        doc('e4', 'Expense Log', { date: '2026-03-31', vendor: '=cmd', item: '-x', category: 'Food', amount: 12.34 }),
    ];
    const expOut = buildAccountingExport({ app: 'quickbooks', kind: 'expenses', documents: ex, jobs: JOBS, clients: [], filters: FILTERS });
    const wantExp = roundMoney(expenseTotal(ex[0].data as any) + expenseTotal(ex[1].data as any) + expenseTotal(ex[3].data as any));
    check('expenses: in the period only, total = the Expense Log math (amount incl. tax, or lines + tax)', expOut.records === 3 && expOut.total === wantExp && wantExp === 216.5 + 90 + 12.34, [expOut.records, expOut.total, wantExp]);
    check('expenses: no vendor -> "Unknown vendor" with a note; lines summarised; bill number is stable', expOut.rows[1][1] === 'Unknown vendor' && expOut.rows[1][8] === 'Diesel; Wash' && expOut.notes.length === 1 && /^EXP-20260302-e1/.test(expOut.rows[0][0]), [expOut.rows, expOut.notes]);
    eq('expenses: category filter', buildAccountingExport({ app: 'xero', kind: 'expenses', documents: ex, jobs: [], clients: [], filters: { ...FILTERS, category: 'fuel' } }).records, 1);
    check('expenses: Xero bill has account code and tax type from the layout variables', buildAccountingExport({ app: 'xero', kind: 'expenses', documents: ex, jobs: [], clients: [], filters: FILTERS }).csv.includes(',429,Tax Exempt,'));
    check('expenses: amounts keep 2 decimals', expOut.rows.every((r) => /^\d+\.\d{2}$/.test(r[9])));

    // payments
    const pay = [
        doc('inv1', 'Invoice', { status: 'Sent', invoiceNumber: 'INV-1', clientName: 'Smith, John', issueDate: '2026-02-20', lineItems: [{ quantity: 1, rate: 1000 }], payments: [
            { id: 'p1', amount: 200, date: '2026-03-02', method: 'Check', receiptId: 'rc1', receiptNumber: 'RC-1' },
            { id: 'p2', amount: 300, date: '2026-03-09', method: 'Cash' },
            { id: 'p3', amount: 100, date: '2026-04-09', method: 'Cash' },
        ] }),
        doc('rc1', 'Receipt', { date: '2026-03-02', receiptNumber: 'RC-1', clientName: 'Smith, John', amount: 200, paymentMethod: 'Check', invoiceNumber: 'INV-1', invoiceId: 'inv1' }),
        doc('rc2', 'Receipt', { date: '2026-03-15', receiptNumber: 'RC-2', clientName: 'Lee', amount: 75.5, paymentMethod: 'Zelle', description: '=1+1' }),
        doc('rc3', 'Receipt', { date: '2026-05-15', receiptNumber: 'RC-3', clientName: 'Lee', amount: 10 }),
        doc('inv2', 'Invoice', { status: 'Draft', invoiceNumber: 'INV-2', payments: [{ id: 'p9', amount: 50, date: '2026-03-04', method: 'Cash' }] }),
    ];
    const payOut = buildAccountingExport({ app: 'xero', kind: 'payments', documents: pay, jobs: [], clients: [], filters: FILTERS });
    check('payments: receipts + payments marked as paid, a payment that has its receipt is listed once, other months and drafts left out', payOut.records === 3 && payOut.total === 575.5, [payOut.records, payOut.total, payOut.rows]);
    eq('payments: sorted by date, money in is positive', payOut.rows.map((r) => [r[0], r[1]]), [['2026-03-02', '200.00'], ['2026-03-09', '300.00'], ['2026-03-15', '75.50']]);
    check('payments: Xero statement columns *Date,*Amount,Payee,Description,Reference,Check Number', payOut.header.join(',') === '*Date,*Amount,Payee,Description,Reference,Check Number' && payOut.rows[1][2] === 'Smith, John' && /Payment for invoice INV-1/.test(payOut.rows[1][3]));
    const payQ = buildAccountingExport({ app: 'quickbooks', kind: 'payments', documents: pay, jobs: [], clients: [], filters: FILTERS });
    check('payments: QuickBooks bank-upload columns Date,Description,Amount; the client is in the description', payQ.header.join(',') === 'Date,Description,Amount' && /^Smith, John - Payment for invoice INV-1/.test(payQ.rows[0][1]));
    eq('payments: source filter', [buildAccountingExport({ app: 'xero', kind: 'payments', documents: pay, jobs: [], clients: [], filters: { ...FILTERS, paymentSource: 'receipts' } }).records, buildAccountingExport({ app: 'xero', kind: 'payments', documents: pay, jobs: [], clients: [], filters: { ...FILTERS, paymentSource: 'invoices' } }).records], [2, 1]);
    check('payments: description starting with = is guarded in the file', parseCsv(payOut.csv).every((r) => r.every((c) => !/^[=+@]/.test(c))));
    const bkPay = bk.filter((r) => r.type === 'Payment');
    check('payments: same receipts as the bookkeeper CSV for the same data', buildBookkeeperRows(pay.map((d) => ({ id: d.id, type: d.type, created_at: d.created_at, ...d.data })) as any, RANGE).filter((r) => r.type === 'Payment').reduce((s, r) => roundMoney(s + r.total), 0) === payOut.total && bkPay.length >= 0);
}

// =====================================================================================================================
// 3. price list into the price book
// =====================================================================================================================
{
    const item = (id: string, name: string, over: Partial<BookItem> = {}): BookItem => ({ id, name, sku: '', unit: 'each', rate: 100, cost: 60, isAssembly: false, ...over });
    const bookItems: BookItem[] = [
        item('b1', 'Drywall sheet 4x8', { sku: 'DW-48', rate: 15, cost: 9 }),
        item('b2', 'Interior paint, gallon', { sku: '', rate: 40, cost: 22 }),
        item('b3', 'Labor: carpenter', { sku: 'LAB-1', unit: 'hr', rate: 65, cost: 30 }),
        item('b4', 'Kit: bathroom', { sku: 'KIT-1', rate: 5000, isAssembly: true }),
        item('b5', 'Duplicate name', { rate: 10 }),
        item('b6', 'duplicate  NAME', { rate: 11 }),
        item('b7', 'Left alone', { sku: 'LEFT', rate: 8 }),
        item('b8', 'Untouched', { sku: 'UNT', rate: 3 }),
    ];
    const csv = [
        'Acme price list 2026', '',
        'SKU,Description,Unit,Price',
        'dw 48,"Drywall sheet, 4x8 (new price)",sheet,$16.50',       // by SKU (case, space), price up 10%
        ',"  INTERIOR  paint,  gallon",gal,"$39.00"',                // by name (case, spacing), price down 2.5%
        'left,Left alone,each,8.00',                                 // by SKU, same price -> unchanged
        'LAB-1,Labor: carpenter,hr,62.00',                           // down 4.6%
        'KIT-1,Kit: bathroom,each,4000',                             // a kit: never changed, never copied
        ',Duplicate name,each,12',                                   // two items have this name -> unmatched
        'NEW-9,Brand new item,each,"1,234.50"',                      // new
        ',Drywall sheet 4x8,each,99',                                // the item is already taken by the SKU row above
        'BAD,No price here,each,abc',                                // problem line
    ].join('\n');
    const parsed = parsePriceList(csv);
    check('the importer’s own reader is reused: title line skipped, a bad price is reported', parsed.rows.length === 8 && parsed.problems.length === 1 && parsed.problems[0].reason === 'no-price' && parsed.columns !== null, parsed.problems);
    const diff = diffPriceBook(parsed.rows, bookItems, 'rate');
    const kind = (name: string) => diff.changes.find((c) => c.row.name === name || c.row.sku === name || c.row.name.toLowerCase() === name.toLowerCase());
    eq('SKU match (case, spaces), price up', [kind('dw 48')!.kind, kind('dw 48')!.matchedBy, kind('dw 48')!.change.flag, kind('dw 48')!.change.pct, kind('dw 48')!.item!.id], ['update', 'sku', 'up', 10, 'b1']);
    eq('name match is trimmed, single-spaced and case-insensitive (price down 2.5%)', [kind('INTERIOR paint, gallon')?.kind, kind('INTERIOR paint, gallon')?.matchedBy, kind('INTERIOR paint, gallon')?.change.pct], ['update', 'name', -2.5]);
    eq('same price by SKU is unchanged', [kind('left')!.kind, kind('left')!.matchedBy], ['unchanged', 'sku']);
    eq('price down', [kind('LAB-1')!.kind, kind('LAB-1')!.change.flag, kind('LAB-1')!.change.pct], ['update', 'down', -4.6]);
    eq('a kit is never changed and never copied as a look-alike new item', [kind('KIT-1')!.kind, kind('KIT-1')!.reason, kind('KIT-1')!.item], ['unmatched', 'kit', null]);
    eq('two items with the same name: not guessed', [kind('Duplicate name')!.kind, kind('Duplicate name')!.reason], ['unmatched', 'several']);
    eq('thousands separator and brand-new item', [kind('NEW-9')!.kind, kind('NEW-9')!.row.price], ['new', 1234.5]);
    eq('an item already matched by an earlier row is not matched twice', [kind('Drywall sheet 4x8')!.kind, kind('Drywall sheet 4x8')!.reason], ['unmatched', 'taken']);
    check('price-book items the file does not mention are listed, never touched (kits are not listed)', diff.notInList.some((i) => i.id === 'b8') && !diff.notInList.some((i) => i.id === 'b4'));
    eq('counts add up to the rows', Object.values(diff.counts).reduce((s, n) => s + n, 0), parsed.rows.length);
    check('headline mentions changes, new items and unchanged', /price.* changed/.test(diffHeadline(diff)) && /new item/.test(diffHeadline(diff)) && /unchanged/.test(diffHeadline(diff)), diffHeadline(diff));
    check('10% is big, 4.6% is not', isBigChange(kind('dw 48')!) === true && isBigChange(kind('LAB-1')!) === false);

    // cost list: only existing items, never new ones
    const costDiff = diffPriceBook(parsed.rows, bookItems, 'cost');
    check('cost list: no new items, those rows are not usable; the cost is compared, not the price', costDiff.counts.new === 0 && costDiff.changes.find((c) => c.row.sku === 'NEW-9')!.kind === 'unmatched' && costDiff.changes.find((c) => c.row.sku === 'NEW-9')!.reason === 'cost-list'
        && costDiff.changes.find((c) => c.row.sku === 'dw 48')!.change.oldPrice === 9);

    // review ticks: nothing applies silently
    let sel = defaultSelection(diff);
    eq('default ticks: price changes only, new items are NOT ticked', [...sel].sort(), diff.changes.filter((c) => c.kind === 'update').map((c) => c.key).sort());
    eq('nothing ticked writes nothing', planPriceBookApply(diff, new Set()), { updates: [], inserts: [] });
    sel = toggleKey(sel, kind('LAB-1')!.key);
    check('untick one price change', !sel.has(kind('LAB-1')!.key) && sel.has(kind('dw 48')!.key));
    sel = setKind(sel, diff, 'new', true);
    check('tick all new items', changesOf(diff, 'new').every((c) => sel.has(c.key)));
    sel = onlyBigChanges(sel, diff);
    check('big changes only keeps new-item ticks and the big price changes', sel.has(kind('dw 48')!.key) && !sel.has(kind('LAB-1')!.key) && sel.has(kind('NEW-9')!.key));
    check('cleanSelection drops unknown keys and unchanged rows', cleanSelection(diff, new Set(['line:9999', ...[...diff.changes.filter((c) => c.kind === 'unchanged').map((c) => c.key)], kind('dw 48')!.key])).size === 1);
    const sum = reviewSummary(diff, sel);
    check('review summary counts what Apply would do', sum.updates === 1 && sum.newItems === 1 && sum.writes === 2 && sum.up === 1 && sum.big === 1, sum);
    eq('summary text', summaryText(sum), '1 price update, 1 new item');
    eq('nothing ticked says so', summaryText(reviewSummary(diff, new Set())), 'Nothing ticked');

    // the writes: only ticked rows, only the one price field
    const writes = planPriceBookApply(diff, sel, { newItemType: 'material' });
    eq('updates: only the price field changes', writes.updates.map((u) => [u.id, u.patch, u.before, u.after]), [['b1', { rate: 16.5 }, 15, 16.5]]);
    eq('new items: the same fields the price book’s Add dialog saves', Object.keys(writes.inserts[0]).sort(), ['assembly_items', 'category', 'description', 'images', 'is_assembly', 'name', 'rate', 'sku', 'taxable', 'type', 'unit', 'unit_cost', 'markup'].sort());
    check('new item values', writes.inserts.some((r) => r.name === 'Brand new item' && r.rate === 1234.5 && r.sku === 'NEW-9' && r.type === 'material' && r.is_assembly === false && r.taxable === true && r.category === 'General'), writes.inserts);
    const costWrites = planPriceBookApply(costDiff, defaultSelection(costDiff));
    eq('cost list writes unit_cost only', costWrites.updates.map((u) => Object.keys(u.patch)), costWrites.updates.map(() => ['unit_cost']));
    check('a cost list never inserts', planPriceBookApply(costDiff, new Set(costDiff.changes.map((c) => c.key))).inserts.length === 0);
    eq('outcome text', [applyOutcomeText({ updated: 2, created: 1, queued: 0, failed: [] }), applyOutcomeText({ updated: 1, created: 0, queued: 1, failed: [{ name: 'x', error: 'y' }] }), applyOutcomeText({ updated: 0, created: 0, queued: 0, failed: [] })],
        ['2 prices updated and 1 item added.', '1 price updated. It is saved on this device and will sync when you are back online. 1 item could not be saved.', 'Nothing was changed.']);

    // the old-prices file undoes an import: apply in memory, then import the backup and apply again
    const backup = priceBackupCsv(diff, defaultSelection(diff));
    const backupParsed = parsePriceList(backup);
    check('backup file is read by the same importer and lists the items about to change at their CURRENT price', backupParsed.problems.length === 0 && backupParsed.rows.length === 3 && backupParsed.rows.find((r) => r.sku === 'DW-48')!.price === 15, backupParsed);
    const applied = bookItems.map((b) => { const u = planPriceBookApply(diff, defaultSelection(diff)).updates.find((x) => x.id === b.id); return u ? { ...b, rate: u.after } : b; });
    const undo = diffPriceBook(backupParsed.rows, applied, 'rate');
    const undone = applied.map((b) => { const u = planPriceBookApply(undo, defaultSelection(undo)).updates.find((x) => x.id === b.id); return u ? { ...b, rate: u.after } : b; });
    eq('importing the old-prices file puts every price back', undone.map((b) => b.rate), bookItems.map((b) => b.rate));
    check('backup is a normal CSV (BOM, CRLF, header)', backup.startsWith(`${CSV_BOM}SKU,Description,Unit,Price\r\n`));

    // a re-import of the same file finds nothing to change
    const again = diffPriceBook(parsed.rows, applied, 'rate');
    eq('importing the same file again changes nothing', [again.counts.update, again.counts.new > 0], [0, true]);
}
function changesOf(diff: PriceBookDiff, k: 'new' | 'update' | 'unchanged' | 'unmatched') { return diff.changes.filter((c) => c.kind === k); }

// =====================================================================================================================
// 4. wiring
// =====================================================================================================================
{
    const settings = read('components/Settings.tsx');
    const sections = settings.slice(settings.indexOf('const SECTIONS'), settings.indexOf('const editableKeys'));
    check('Settings: the section is in the type and the list, between Notifications and Your data', /'notifications' \| 'integrations' \| 'data'/.test(settings) && sections.includes("{ id: 'integrations', label: 'Integrations & data' }")
        && sections.indexOf("'notifications'") < sections.indexOf("'integrations'") && sections.indexOf("'integrations'") < sections.indexOf("'data'"));
    check('Settings: the old Your data card and the other cards are still there', settings.includes('<DataExportSection') && settings.includes('<AutomationsSettings') && settings.includes('<ReminderSettingsCard') && settings.includes('<NotificationSettingsCard') && sections.includes("{ id: 'data', label: 'Your data' }"));
    const ids = Array.from(settings.matchAll(/\{ id: '(\w+)', label: '/g), (m) => m[1]);
    check('the /settings#integrations anchor the QA script validates exists in the section list', ids.includes('integrations'));
    check('Settings renders the new section before Your data', settings.includes('<IntegrationsSettings') && settings.indexOf('<IntegrationsSettings') < settings.indexOf('<DataExportSection'));
    for (const f of ['components/integrations/IntegrationsSettings.tsx', 'components/integrations/CalendarFilePanel.tsx', 'components/integrations/AccountingExportPanel.tsx', 'components/integrations/PriceListImportPanel.tsx', 'components/integrations/priceBookImportApi.ts']) check(`exists: ${f}`, existsSync(join(root, f)));
    const ui = read('components/integrations/IntegrationsSettings.tsx');
    check('section anchor and help button', ui.includes('id="settings-integrations"') && ui.includes('HelpButton topic="integrations"'));
    check('Gmail row uses the existing connect / disconnect flow, never shows tokens', /startGmailConnect/.test(ui) && /disconnectGmailAccount/.test(ui) && /listGmailAccounts/.test(ui) && !/access_token|refresh_token/.test(ui));
    check('no generic icon-in-a-tinted-square cards', !/rounded-(xl|2xl) bg-primary\/10[^"]*(flex|inline-flex)[^"]*h-(9|10|11|12) w-(9|10|11|12)/.test(ui) && !/grid-cols-3[^"]*gap-[0-9]/.test(ui));

    // offline audit: every write of the new API file is listed (offline-drafts-check.ts enforces the same)
    const api = read('components/integrations/priceBookImportApi.ts');
    const hits = scanWrites('components/integrations/priceBookImportApi.ts', api);
    check('price-book import: its writes are found by the scanner', hits.length >= 2, hits);
    check('price-book import: every write is in the offline audit', hits.every((h) => WRITE_PATHS.some((w) => w.file === h.file && h.text.includes(w.match))), hits.filter((h) => !WRITE_PATHS.some((w) => w.file === h.file && h.text.includes(w.match))));
    check('price-book import: audit rows say it queues offline', WRITE_PATHS.filter((w) => w.file === 'components/integrations/priceBookImportApi.ts').every((w) => w.offline === 'queue') && WRITE_PATHS.some((w) => w.file === 'components/integrations/priceBookImportApi.ts'));
    check('price-book import: offline it uses the price book’s own outbox, online the same schema fallback', api.includes("queue('price_item'") && api.includes('offlineEntityQueueFor') && api.includes('withSchemaFallback'));
    check('the read-only data layer never writes', scanWrites('lib/integrations/integrationsApi.ts', read('lib/integrations/integrationsApi.ts')).length === 0);

    // gating like the supplier price list: Premium
    const panel = read('components/integrations/PriceListImportPanel.tsx');
    check('price list import is Premium, Free sees the upgrade prompt (same PremiumPrompt as suppliers)', /PremiumPrompt/.test(panel) && /paid/.test(panel));

    // help
    const help = read('components/help/helpContent.ts');
    for (const id of ['integrations', 'calendar-file', 'accounting-exports', 'import-price-list']) check(`help guide: ${id}`, help.includes(`id: '${id}'`));
    check('help names the controls that are on screen', ['Download calendar file', 'Import price list', 'Download file'].every((l) => help.includes(`[[${l}]]`)) && ['Download calendar file', 'Import price list', 'Download file'].every((l) => (read('components/integrations/CalendarFilePanel.tsx') + read('components/integrations/AccountingExportPanel.tsx') + read('components/integrations/PriceListImportPanel.tsx') + ui).includes(l)));

    // house rules
    const mine = ['lib/integrations/icsCalendar.ts', 'lib/integrations/accountingExport.ts', 'lib/integrations/priceBookImport.ts', 'lib/integrations/integrationsApi.ts', 'components/integrations/IntegrationsSettings.tsx',
        'components/integrations/CalendarFilePanel.tsx', 'components/integrations/AccountingExportPanel.tsx', 'components/integrations/PriceListImportPanel.tsx', 'components/integrations/priceBookImportApi.ts'].map(read).join('\n');
    check('no forbidden words', !/kelviq|merchant of record/i.test(mine));
    check('no database or edge-function files are part of this feature', !/supabase\/(migrations|functions)/.test(mine) && !/\.rpc\(|functions\.invoke/.test(mine));
    check('the column names are said to need a check against the app’s current template', /current import template/i.test(read('components/integrations/AccountingExportPanel.tsx')));
    check('the calendar file says it is a snapshot with no live sync and how to import it', /snapshot/i.test(read('components/integrations/CalendarFilePanel.tsx')) && /Google/.test(read('components/integrations/CalendarFilePanel.tsx')) && /Apple/.test(read('components/integrations/CalendarFilePanel.tsx')) && /Outlook/.test(read('components/integrations/CalendarFilePanel.tsx')));
}

console.log(`integrations-check: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
