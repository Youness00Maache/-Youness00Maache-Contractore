/**
 * Job timeline (roadmap N11): pure-logic checks. Every source adapter on realistic fixtures (missing / partial fields,
 * time zones around midnight, same-day grouping of photos), the aggregator (merge, sort, group by local day, de-dupe),
 * filters / search / date ranges, paging, the conversation-note mapping, and a guard that nothing in the Timeline writes
 * to the database on its own. No database, no network:
 *   npx tsx scripts/timeline-check.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JobPhoto } from '../components/photos/photoLogic.ts';
import type { PunchItem } from '../lib/punchList.ts';
import type { Punch } from '../lib/crew/crewLogic.ts';
import type { JobTask } from '../lib/tasks/taskTypes.ts';
import type { JobQuestion } from '../lib/questions/questionTypes.ts';
import type { JobSelection } from '../lib/selections/selectionTypes.ts';
import type { JobQuote, SubCommitment } from '../lib/subs/subTypes.ts';
import type { FeedbackResponse } from '../lib/feedback/feedbackTypes.ts';
import type { RecordRow } from '../lib/reminders.ts';
import {
    PAGE_SIZE, applyFilters, buildEvents, buildView, dedupeEvents, groupByDay, groupCounts, pageEvents, rangeStart, searchText, sortEvents, weekStart,
} from '../lib/timeline/aggregate.ts';
import { dailyReportEvents } from '../lib/timeline/sources/dailyReports.ts';
import { documentEvents } from '../lib/timeline/sources/documents.ts';
import { emailEvents } from '../lib/timeline/sources/email.ts';
import { expenseEvents } from '../lib/timeline/sources/expenses.ts';
import { crewEvents } from '../lib/timeline/sources/crew.ts';
import { feedbackEvents } from '../lib/timeline/sources/feedback.ts';
import { isConversationNote, noteEvents } from '../lib/timeline/sources/notes.ts';
import { orderEvents } from '../lib/timeline/sources/orders.ts';
import { photoEvents, PHOTOS_PER_ENTRY } from '../lib/timeline/sources/photos.ts';
import { punchEvents } from '../lib/timeline/sources/punch.ts';
import { questionEvents } from '../lib/timeline/sources/questions.ts';
import { quoteEvents } from '../lib/timeline/sources/quotes.ts';
import { reminderEvents } from '../lib/timeline/sources/reminders.ts';
import { selectionEvents } from '../lib/timeline/sources/selections.ts';
import { subEvents } from '../lib/timeline/sources/subs.ts';
import { taskEvents } from '../lib/timeline/sources/tasks.ts';
import { warrantyEvents } from '../lib/timeline/sources/warranty.ts';
import { buildConversationNote, conversationNoteDoc, conversationNoteHtml, conversationNoteTitle, CONVERSATION_NOTE_MAX, followUpTaskDraft, noteTextProblem } from '../lib/timeline/noteInput.ts';
import { dayLabel, shortDate, timeLabel } from '../lib/timeline/timelineFormat.ts';
import { atLocal, dayOf, isoOf, plainText, whenOf } from '../lib/timeline/timelineHelpers.ts';
import { docFromRow, TIMELINE_COLUMNS } from '../lib/timeline/timelineApi.ts';
import { GROUP_LABELS, TIMELINE_GROUPS, type TimelineContext, type TimelineDoc, type TimelineEvent } from '../lib/timeline/timelineTypes.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

// ---------------------------------------------------------------------------------------------------- fixtures
const TZ = 'America/Los_Angeles'; // UTC-8 in November (daylight time ended on 2026-11-01)
const NOW = Date.parse('2026-11-10T20:00:00Z'); // Tue 2026-11-10, noon in Los Angeles
const ctx: TimelineContext = { tz: TZ, now: NOW, clientName: 'Jane Smith', memberNames: { m1: 'Mike Ross', m2: 'Sam Lee' } };

const doc = (id: string, type: string, createdAt: string, data: Record<string, any> = {}): TimelineDoc => ({ id, jobId: 'j1', type, createdAt, data });
const byKind = (events: TimelineEvent[], kind: string) => events.filter(e => e.kind === kind);
const titles = (events: TimelineEvent[]) => events.map(e => e.title);

// ======================================================================================================= helpers
eq('atLocal noon in LA', atLocal('2026-11-03', 12, TZ), '2026-11-03T20:00:00.000Z');
eq('atLocal across DST end (Nov 1 is PDT, Nov 2 is PST)', [atLocal('2026-11-01', 0, TZ), atLocal('2026-11-02', 0, TZ)], ['2026-11-01T07:00:00.000Z', '2026-11-02T08:00:00.000Z']);
eq('atLocal east of UTC', atLocal('2026-11-03', 12, 'Pacific/Auckland'), '2026-11-02T23:00:00.000Z');
eq('dayOf 23:30 local is still that evening', dayOf('2026-11-04T07:30:00Z', TZ), '2026-11-03');
eq('dayOf 00:30 local is the next day', dayOf('2026-11-04T08:30:00Z', TZ), '2026-11-04');
eq('dayOf plain date stays', dayOf('2026-11-04', TZ), '2026-11-04');
eq('dayOf Auckland (UTC+13)', dayOf('2026-11-03T12:00:00Z', 'Pacific/Auckland'), '2026-11-04');
eq('isoOf odd values', [isoOf(''), isoOf(null), isoOf('nonsense'), isoOf('2026-11-03T10:00:00Z')], [null, null, null, '2026-11-03T10:00:00.000Z']);
eq('whenOf date only = noon, day only', whenOf('2026-11-03', TZ), { at: '2026-11-03T20:00:00.000Z', dayOnly: true });
eq('whenOf instant', whenOf('2026-11-03T10:00:00Z', TZ), { at: '2026-11-03T10:00:00.000Z', dayOnly: false });
eq('whenOf nothing', whenOf('', TZ), null);
eq('plainText strips tags and cuts', plainText('<p>Hello&nbsp;<b>world</b> &amp; more</p><p>Second</p>', 200), 'Hello world & more Second');
eq('plainText ellipsis', plainText('a'.repeat(50), 10), `${'a'.repeat(9)}…`);
eq('shortDate', shortDate('2026-11-03', 2026), 'Tue, Nov 3');
eq('shortDate other year', shortDate('2025-11-03', 2026), 'Mon, Nov 3, 2025');
eq('dayLabel today / yesterday / other', [dayLabel('2026-11-10', '2026-11-10'), dayLabel('2026-11-09', '2026-11-10'), dayLabel('2026-11-03', '2026-11-10')], ['Today', 'Yesterday', 'Tue, Nov 3']);
eq('timeLabel in zone', timeLabel('2026-11-04T07:30:00Z', TZ), '11:30 PM');

// ================================================================================================ documents source
const lines = [{ id: 'l1', description: 'Tile', quantity: 10, rate: 100 }];
const docs: TimelineDoc[] = [
    doc('est1', 'Estimate', '2026-11-02T17:00:00Z', { estimateNumber: 'E-1042', status: 'Accepted', clientName: 'Jane Smith', lineItems: lines, clientSignedAt: '2026-11-03T18:15:00Z', clientSignedBy: 'Jane Smith', expiryDate: '2026-12-01', clientOptionChoice: { optionId: 'o2', optionName: 'Better', by: 'client' } }),
    doc('est2', 'Estimate', '2026-10-20T17:00:00Z', { estimateNumber: 'E-1043', status: 'Sent', clientName: 'Jane Smith', lineItems: lines, expiryDate: '2026-11-05' }),
    doc('est3', 'Estimate', '2026-11-03T17:00:00Z', { estimateNumber: 'E-1044', status: 'Sent', lineItems: lines, clientDeclinedAt: '2026-11-04T10:00:00Z', clientDeclineReason: 'Too expensive', expiryDate: '2026-11-04' }),
    doc('est4', 'Estimate', '2026-11-04T17:00:00Z', { estimateNumber: 'E-1042-R2', status: 'Draft', lineItems: lines, revisionOf: 'est1' }),
    doc('inv1', 'Invoice', '2026-11-05T16:00:00Z', {
        invoiceNumber: 'INV-77', status: 'Paid', clientName: 'Jane Smith', lineItems: lines, sourceEstimateId: 'est1', sourceEstimateNumber: 'E-1042', amountPaid: 1000,
        paymentReportedAt: '2026-11-08T12:00:00Z', paymentReportAmount: 600, paymentReportNote: 'Sent a check',
        payments: [
            { id: 'p2', amount: 600, date: '2026-11-09', recordedAt: '2026-11-09T21:00:00Z' },
            { id: 'p1', amount: 400, date: '2026-11-06', method: 'Check', receiptId: 'r1', receiptNumber: 'R-1', recordedAt: '2026-11-06T19:00:00Z' },
        ],
    }),
    doc('inv2', 'Invoice', '2026-11-07T16:00:00Z', { invoiceNumber: 'INV-78', status: 'Paid', lineItems: [{ id: 'l', description: 'Service', quantity: 1, rate: 250 }], paidAt: '2026-11-09' }),
    doc('inv3', 'Invoice', '2026-11-07T17:00:00Z', { invoiceNumber: 'INV-79', status: 'Sent', lineItems: [{ id: 'l', description: 'Deposit', quantity: 1, rate: 500 }], amountPaid: 100, payments: [{ id: 'd1', amount: 150, date: '2026-11-08' }] }),
    doc('r1', 'Receipt', '2026-11-06T19:00:01Z', { receiptNumber: 'R-1', amount: 400, invoiceId: 'inv1' }),
    doc('r2', 'Receipt', '2026-11-07T10:00:00Z', { receiptNumber: 'R-2', amount: 50, paymentMethod: 'Cash', description: 'Dumpster rental' }),
    doc('co1', 'Change Order', '2026-11-06T09:00:00Z', { changeOrderNumber: 'CO-1', status: 'Accepted', lineItems: [{ id: 'l', description: 'Extra outlet', quantity: 2, rate: 75 }], clientSignedAt: '2026-11-06T15:00:00Z', clientSignerName: 'Jane Smith' }),
    doc('bare', 'Estimate', '2026-11-01T12:00:00Z', {}),
    doc('bad', 'Estimate', 'not a date', { estimateNumber: 'E-bad' }),
];
const sentAt = { est1: '2026-11-02T17:30:00Z', inv1: '2026-11-05T16:30:00Z', nope: 'x' };
const dEvents = documentEvents({ docs, sentAt }, ctx);
const dTitles = titles(dEvents);
ok('docs: estimate created with its total', dEvents.some(e => e.id === 'doc:est1:created' && e.title === 'Estimate E-1042 created' && e.amount === 1000 && e.actor === 'you'));
ok('docs: sent to the first name, at the reminder time', dEvents.some(e => e.id === 'doc:est1:sent' && e.title === 'Estimate E-1042 sent to Jane' && e.at === '2026-11-02T17:30:00.000Z'));
ok('docs: signed by the client, with the chosen option, in the Client group', dEvents.some(e => e.kind === 'doc_signed' && e.title === 'Jane signed Estimate E-1042 and chose Better' && e.group === 'client' && e.actor === 'client'));
ok('docs: change order is "approved"', dTitles.includes('Jane approved Change Order CO-1'));
eq('docs: change order amount is its net change', dEvents.find(e => e.id.startsWith('doc:co1:created'))?.amount, 150);
ok('docs: declined with the reason', dEvents.some(e => e.kind === 'doc_declined' && e.title === 'Jane declined Estimate E-1044' && e.detail === '“Too expensive”'));
ok('docs: an unanswered sent estimate expires the day after its expiry date', dEvents.some(e => e.id === 'doc:est2:expired:2026-11-05' && e.dayOnly === true && dayOf(e.at, TZ) === '2026-11-06'));
ok('docs: a declined estimate does not also expire', !dEvents.some(e => e.id.startsWith('doc:est3:expired')));
ok('docs: a signed estimate does not expire', !dEvents.some(e => e.id.startsWith('doc:est1:expired')));
ok('docs: a revision replaces "created"', dEvents.some(e => e.id === 'doc:est4:revised' && e.title === 'Estimate E-1042-R2 started as a new version of Estimate E-1042') && !dEvents.some(e => e.id === 'doc:est4:created'));
ok('docs: an invoice made from an estimate replaces "created"', dEvents.some(e => e.id === 'doc:inv1:converted' && e.title === 'Estimate E-1042 turned into Invoice INV-77' && e.amount === 1000) && !dEvents.some(e => e.id === 'doc:inv1:created'));
ok('docs: "I\'ve paid" from the client', dEvents.some(e => e.kind === 'payment_reported' && e.title === 'Jane says they paid Invoice INV-77' && e.amount === 600 && e.detail === 'Sent a check' && e.group === 'money'));
const paid1 = dEvents.filter(e => e.id.startsWith('doc:inv1:paid')).sort((a, b) => a.at.localeCompare(b.at));
eq('docs: two payments in time order, the last one pays it in full', paid1.map(e => [e.title, e.amount]), [['Payment received on Invoice INV-77', 400], ['Invoice INV-77 paid in full', 600]]);
eq('docs: payment detail shows method and receipt', paid1[0].detail, 'check · receipt R-1');
ok('docs: the receipt of a recorded payment has no entry of its own', !dEvents.some(e => e.id === 'doc:r1:created'));
ok('docs: a standalone receipt', dEvents.some(e => e.id === 'doc:r2:created' && e.title === 'Receipt R-2 made out to Jane' && e.amount === 50 && e.detail === 'Dumpster rental'));
ok('docs: paid status without payments = one entry on the paid date (day only)', dEvents.some(e => e.id === 'doc:inv2:paid:status' && e.dayOnly === true && e.amount === 250 && dayOf(e.at, TZ) === '2026-11-09'));
const inv3 = dEvents.filter(e => e.id.startsWith('doc:inv3:paid'));
ok('docs: a deposit already on the invoice is not one of the payments, and does not fake "in full"', inv3.length === 1 && inv3[0].title === 'Payment received on Invoice INV-79');
ok('docs: a document with no fields still gets "created"', dTitles.includes('Estimate created'));
ok('docs: an unreadable date is skipped, not thrown', !dEvents.some(e => e.id.includes('E-bad') || e.id.startsWith('doc:bad')));
ok('docs: every document event links to its document', dEvents.every(e => e.link?.type === 'document'));
ok('docs: other types are left to their own adapters', documentEvents({ docs: [doc('n', 'Note', '2026-11-01T10:00:00Z', {}), doc('d', 'Daily Job Report', '2026-11-01T10:00:00Z', {})] }, ctx).length === 0);
eq('docs: pending flag is kept', documentEvents({ docs: [{ ...doc('p', 'Invoice', '2026-11-09T10:00:00Z', { invoiceNumber: 'INV-1' }), pending: true }] }, ctx)[0].pending, true);
eq('docs: garbage in gives nothing', documentEvents({ docs: [null as any, undefined as any] }, ctx), []);

// ===================================================================================== daily reports (hours + materials)
const field: TimelineDoc[] = [
    doc('dr1', 'Daily Job Report', '2026-11-04T01:30:00Z', { date: '2026-11-03', reportNumber: 'DR-1', weather: 'Sunny', temperature: '64F', crewSize: 3, laborHours: 20, content: '<p>Demo done in the <b>kitchen</b>.</p><p>Found a leak.</p>' }), // created 5:30 PM on Nov 3 in LA
    doc('ts1', 'Time Sheet', '2026-11-04T02:00:00Z', { date: '2026-11-03', workerName: 'Mike Ross', hoursWorked: 8, overtimeHours: 1.5 }),
    doc('ts2', 'Time Sheet', '2026-11-04T02:05:00Z', { date: '2026-11-03', workerName: 'Sam Lee', hoursWorked: 8 }),
    doc('ml1', 'Material Log', '2026-11-04T02:10:00Z', { date: '2026-11-03', items: [{ id: 'a', name: 'Thinset', supplier: 'Home Depot', quantity: 4, unitCost: 22.5 }, { id: 'b', name: 'Grout', supplier: '', quantity: 2, unitCost: 15 }] }),
    doc('ts3', 'Time Sheet', '2026-11-08T20:00:00Z', { date: '2026-11-06', workerName: 'Mike Ross', hoursWorked: 6 }), // typed in later for an earlier day
    doc('dr2', 'Daily Job Report', '2026-11-09T18:00:00Z', {}), // no date field: its creation day
];
const fEvents = dailyReportEvents({ docs: field }, ctx);
eq('field: one entry per day', fEvents.map(e => e.id).sort(), ['day:2026-11-03:report', 'day:2026-11-06:report', 'day:2026-11-09:report']);
const day3 = fEvents.find(e => e.id === 'day:2026-11-03:report')!;
eq('field: title names the day', day3.title, 'Daily report for Tue, Nov 3');
eq('field: hours from the time sheets (not the report), people, materials with cost', day3.detail, '17.5 h · 2 people · 2 materials ($120.00)');
ok('field: rows list weather, each worker and each material', day3.rows!.some(r => r.label === 'Weather' && r.value === 'Sunny, 64F') && day3.rows!.some(r => r.label === 'Mike Ross' && r.value === '8 h + 1.5 h overtime') && day3.rows!.some(r => r.label === 'Material' && r.value === '4 × Thinset (Home Depot)'));
eq('field: report text is plain text', day3.body, 'Demo done in the kitchen. Found a leak.');
ok('field: saved the same evening = exact time, not day-only', day3.at === '2026-11-04T02:10:00.000Z' && !day3.dayOnly && dayOf(day3.at, TZ) === '2026-11-03');
const day6 = fEvents.find(e => e.id === 'day:2026-11-06:report')!;
ok('field: hours without a report', day6.title === 'Hours and materials for Fri, Nov 6' && day6.detail === '6 h · 1 person' && day6.dayOnly === true && dayOf(day6.at, TZ) === '2026-11-06');
const day9 = fEvents.find(e => e.id === 'day:2026-11-09:report')!;
ok('field: a bare report still shows', day9.title === 'Daily report for Mon, Nov 9' && day9.detail === undefined);
eq('field: report-only labour hours when there are no time sheets', dailyReportEvents({ docs: [doc('x', 'Daily Job Report', '2026-11-09T18:00:00Z', { date: '2026-11-09', laborHours: 12, crewSize: 3 })] }, ctx)[0].detail, '12 h · 3 people');
eq('field: two reports one day', dailyReportEvents({ docs: [doc('a', 'Daily Job Report', '2026-11-09T18:00:00Z', { date: '2026-11-09' }), doc('b', 'Daily Job Report', '2026-11-09T19:00:00Z', { date: '2026-11-09' })] }, ctx)[0].title, '2 daily reports for Mon, Nov 9');
eq('field: midnight in the zone: created 2026-11-04T07:30Z with date 2026-11-03 stays on Nov 3', dailyReportEvents({ docs: [doc('m', 'Daily Job Report', '2026-11-04T07:30:00Z', { date: '2026-11-03' })] }, ctx).map(e => [e.dayOnly, dayOf(e.at, TZ)]), [[undefined, '2026-11-03']]);
eq('field: odd data does not throw', dailyReportEvents({ docs: [doc('o', 'Material Log', '2026-11-04T07:30:00Z', { date: 'x', items: 'nope' })] }, ctx).length, 1);

// ============================================================================================================= photos
const photo = (id: string, takenAt: string, tag: JobPhoto['tag'] = 'during', caption = '', extra: Partial<JobPhoto> = {}): JobPhoto => ({
    id, jobId: 'j1', storagePath: `u/j1/${id}.jpg`, thumbPath: `u/j1/${id}_t.jpg`, tag, caption, takenAt, width: null, height: null, sizeBytes: 1, sharedInPortal: false, portalPath: null, sourcePhotoId: null, requestId: null, createdAt: takenAt, ...extra,
});
const photos: JobPhoto[] = [
    ...Array.from({ length: 9 }, (_, i) => photo(`a${i}`, `2026-11-03T1${i % 10}:00:00Z`, 'before', i === 0 ? 'Cracked tile' : '')), // 9 on Nov 3 morning (LA)
    photo('b1', '2026-11-03T22:00:00Z', 'after', 'Finished floor'), // 2 PM Nov 3
    photo('c1', '2026-11-04T07:30:00Z', 'during'), // 11:30 PM Nov 3 (LA)
    photo('c2', '2026-11-04T08:30:00Z', 'during'), // 12:30 AM Nov 4 (LA): next day
    photo('d1', '2026-11-05T18:00:00Z', 'issue', 'Water stain'),
    photo('e1', 'garbage', 'during'),
    photo('f1', '2026-11-06T18:00:00Z', 'during', '', { thumbPath: null }),
    photo('g1', '2026-11-07T18:00:00Z', 'during', '', { requestId: 'req1' }),
];
const pEvents = photoEvents({ photos }, ctx);
const before = pEvents.find(e => e.id === 'photos:2026-11-03|before')!;
ok('photos: same day and stage = one entry', !!before && before.photoCount === 9 && before.title === '9 photos added' && before.detail === 'Before stage · Cracked tile');
eq('photos: at most 6 small pictures, the rest counted', [before.photos!.length, PHOTOS_PER_ENTRY], [6, 6]);
ok('photos: newest picture first, thumbnail path used', before.photos![0].thumbPath.endsWith('_t.jpg'));
ok('photos: another stage on the same day is its own entry', pEvents.some(e => e.id === 'photos:2026-11-03|after' && e.title === 'Photo added: Finished floor'));
ok('photos: 11:30 PM and 12:30 AM (local) are different days', pEvents.some(e => e.id === 'photos:2026-11-03|during' && e.title === 'Photo added') && pEvents.some(e => e.id === 'photos:2026-11-04|during'));
ok('photos: issue photos are named so', pEvents.some(e => e.id === 'photos:2026-11-05|issue' && e.title === 'Issue photo added: Water stain'));
ok('photos: an unreadable date is skipped', !pEvents.some(e => e.photos?.some(p => p.id === 'e1')));
ok('photos: no thumbnail falls back to the picture', pEvents.find(e => e.id === 'photos:2026-11-06|during')!.photos![0].thumbPath === 'u/j1/f1.jpg');
eq('photos: from a client request = client', pEvents.find(e => e.id === 'photos:2026-11-07|during')!.actor, 'client');
ok('photos: all link to the Photos tab', pEvents.every(e => e.link?.type === 'tab' && (e.link as any).tab === 'photos'));

// ============================================================================================================== notes
const note = buildConversationNote('Client called, wants the tile in grey\nWill send a sample Friday', new Date('2026-11-10T19:42:00Z'))!;
const noteDoc = conversationNoteDoc({ id: 'n1', jobId: 'j1', note });
const nEvents = noteEvents({ docs: [noteDoc, doc('n2', 'Note', '2026-11-02T15:00:00Z', { title: 'Permit numbers', content: '<p>Electrical #4471, plumbing #8812</p>', tags: [] }), doc('n3', 'Note', '2026-11-03T15:00:00Z', { title: '', content: '' }), doc('n4', 'Note', '2026-11-04T15:00:00Z', {})] }, ctx);
const conv = nEvents.find(e => e.id === 'note:n1')!;
eq('notes: conversation note mapping (title, time, group, body, link)', [conv.title, conv.at, conv.group, conv.actor, conv.body, conv.link], ['Conversation: Client called, wants the tile in grey', '2026-11-10T19:42:00.000Z', 'notes', 'you', 'Client called, wants the tile in grey Will send a sample Friday', { type: 'document', docId: 'n1', formType: 'Note' }]);
ok('notes: a note is named by its title, its text is the body', nEvents.some(e => e.id === 'note:n2' && e.title === 'Note: Permit numbers' && e.body === 'Electrical #4471, plumbing #8812'));
ok('notes: empty notes still show', nEvents.some(e => e.id === 'note:n3' && e.title === 'Note added') && nEvents.some(e => e.id === 'note:n4'));
eq('notes: noteAt wins over the creation time (offline note synced later)', noteEvents({ docs: [doc('n5', 'Note', '2026-11-12T09:00:00Z', { title: 'x', noteAt: '2026-11-09T10:00:00Z' })] }, ctx)[0].at, '2026-11-09T10:00:00.000Z');
ok('notes: conversation detection by flag or tag', isConversationNote({ data: { conversationNote: true } }) && isConversationNote({ data: { tags: ['conversation'] } }) && !isConversationNote({ data: { tags: ['permit'] } }));
eq('notes: pending (offline) note is flagged', noteEvents({ docs: [conversationNoteDoc({ id: 'n6', jobId: 'j1', note, pending: true })] }, ctx)[0].pending, true);

// ============================================================================== the conversation note (quick-add)
eq('note input: empty / blank', [noteTextProblem(''), noteTextProblem('   \n ')].map(Boolean), [true, true]);
eq('note input: ok', noteTextProblem('Called'), null);
ok('note input: too long', /long note/.test(noteTextProblem('x'.repeat(CONVERSATION_NOTE_MAX + 1)) || ''));
eq('note input: nothing to save', buildConversationNote('  '), null);
eq('note input: title is the first line', conversationNoteTitle('Client called\nsecond line'), 'Client called');
eq('note input: long title cut at a word', conversationNoteTitle('Client called about the grey tile and the schedule for next week and more words here', 40), 'Client called about the grey tile and…');
eq('note input: html is escaped, one paragraph per line', conversationNoteHtml('Tile <b>grey</b> & white\n\nSecond'), '<p>Tile &lt;b&gt;grey&lt;/b&gt; &amp; white</p><p>Second</p>');
eq('note input: tag, flag, noteAt', [note.tags, note.extra], [['Conversation'], { conversationNote: true, noteAt: '2026-11-10T19:42:00.000Z' }]);
eq('note input: the saved note shows at once with its own time', buildEvents({ docs: [noteDoc] }, ctx).map(e => [e.title, e.at]), [['Conversation: Client called, wants the tile in grey', '2026-11-10T19:42:00.000Z']]);
const task = followUpTaskDraft('Client called, wants the tile in grey', [{ sortOrder: 10 }, { sortOrder: 30 }]);
eq('follow-up task: one draft, title + notes + end of list', [task.title, task.notes, task.source, task.sortOrder], ['Follow up: Client called, wants the tile in grey', 'Client called, wants the tile in grey', 'manual', 40]);
eq('follow-up task: title fits the task limit', followUpTaskDraft('x'.repeat(1900)).title.length <= 200, true);

// ============================================================================================================== punch list
const punch = (id: string, o: Partial<PunchItem> = {}): PunchItem => ({
    id, jobId: 'j1', title: id, area: '', assignee: '', dueOn: '', status: 'open', position: 0, notes: '', beforePhotoId: null, afterPhotoId: null, doneAt: null, verifiedAt: null, verifiedBy: null,
    clientNote: '', clientNoteAt: null, createdAt: '2026-11-04T18:00:00Z', updatedAt: '2026-11-04T18:00:00Z', ...o,
});
const puEvents = punchEvents({ items: [
    punch('p1', { title: 'Touch up paint', area: 'Hall', createdAt: '2026-11-04T18:00:10Z', doneAt: '2026-11-07T17:00:00Z', status: 'done' }),
    punch('p2', { title: 'Fix door', createdAt: '2026-11-04T18:00:40Z', status: 'verified', doneAt: '2026-11-07T17:10:00Z', verifiedAt: '2026-11-08T17:00:00Z', verifiedBy: 'client' }),
    punch('p3', { title: 'Caulk tub', createdAt: '2026-11-05T09:00:00Z', verifiedAt: '2026-11-08T18:00:00Z', verifiedBy: 'contractor', clientNote: 'Still leaks', clientNoteAt: '2026-11-09T09:00:00Z' }),
] }, ctx);
ok('punch: two items added in the same minute are one entry', puEvents.some(e => e.id.startsWith('punch:added:2026-11-04T18:00') && e.title === '2 punch list items added' && e.rows!.length === 2));
ok('punch: a single item added', puEvents.some(e => e.id === 'punch:p3:added' && e.title === 'Punch list item added: Caulk tub'));
ok('punch: done with its area', puEvents.some(e => e.id === 'punch:p1:done' && e.title === 'Punch list item done: Touch up paint (Hall)'));
ok('punch: checked off by the client is a Client entry', puEvents.some(e => e.id === 'punch:p2:verified' && e.group === 'client' && e.actor === 'client' && e.title === 'The client checked off “Fix door”'));
ok('punch: checked off by you stays in Field', puEvents.some(e => e.id === 'punch:p3:verified' && e.group === 'field' && e.title === 'You checked off “Caulk tub”'));
ok('punch: the client\'s note', puEvents.some(e => e.id === 'punch:p3:clientnote' && e.detail === '“Still leaks”'));

// ============================================================================================================== tasks
const jt = (id: string, o: Partial<JobTask> = {}): JobTask => ({
    id, userId: 'u', jobId: 'j1', title: id, notes: null, status: 'todo', crewMemberId: null, startDate: null, dueDate: null, isMilestone: false, dependsOn: [], sortOrder: 10,
    completedAt: null, completedPhotoPath: null, source: 'manual', workOrderDocId: null, createdAt: '2026-11-02T10:00:00Z', updatedAt: '2026-11-02T10:00:00Z', ...o,
});
const tEvents = taskEvents({ tasks: [
    ...['Demo', 'Frame', 'Plumb', 'Wire', 'Drywall'].map((t, i) => jt(`t${i}`, { title: t, source: 'template', createdAt: `2026-11-02T10:00:0${i}Z` })),
    jt('t9', { title: 'Order windows', crewMemberId: 'm1', dueDate: '2026-11-12', createdAt: '2026-11-03T10:00:00Z', status: 'done', completedAt: '2026-11-05T22:00:00Z', completedPhotoPath: 'x/y.jpg' }),
    jt('t10', { title: 'Call inspector', status: 'done', completedAt: '2026-11-06T22:00:00Z', createdAt: '2026-11-03T10:05:00Z' }),
    jt('t11', { title: 'No time', status: 'done', completedAt: null, createdAt: '2026-11-03T11:00:00Z' }),
] }, ctx);
ok('tasks: a template\'s tasks are one entry', tEvents.some(e => e.title === '5 tasks added from a template' && e.rows!.length === 5));
ok('tasks: one task added, with who and when', tEvents.some(e => e.id === 'task:t9:added' && e.title === 'Task added: Order windows' && e.detail === 'For Mike Ross · due Thu, Nov 12'));
ok('tasks: done by a worker with a photo', tEvents.some(e => e.id === 'task:t9:done' && e.actor === 'crew' && e.detail === 'By Mike Ross · with a photo'));
ok('tasks: done by you', tEvents.some(e => e.id === 'task:t10:done' && e.actor === 'you'));
ok('tasks: done without a time has no "done" entry', !tEvents.some(e => e.id === 'task:t11:done'));

// ============================================================================================================ questions
const jq = (id: string, o: Partial<JobQuestion> = {}): JobQuestion => ({
    id, userId: 'u', jobId: 'j1', kind: 'question', title: 'Which tile?', body: null, dueDate: null, status: 'answered', attachments: [], answer: 'Grey porcelain', answeredBy: 'Jane Smith', answeredAt: '2026-11-04T16:00:00Z',
    decision: null, history: [], sharedInPortal: true, sentAt: '2026-11-03T16:00:00Z', closedAt: null, createdAt: '2026-11-03T15:00:00Z', updatedAt: '2026-11-04T16:00:00Z', ...o,
});
const qEvents = questionEvents({ questions: [
    jq('q1', { history: [{ at: '2026-11-03T15:00:00Z', by: 'owner', action: 'created', note: null }, { at: '2026-11-03T16:00:00Z', by: 'owner', action: 'sent', note: null }, { at: '2026-11-04T16:00:00Z', by: 'client', action: 'answered', note: 'Grey porcelain' }, { at: '2026-11-05T16:00:00Z', by: 'owner', action: 'closed', note: null }] }),
    jq('q2'),
    jq('q3', { kind: 'submittal', title: 'Window drawings', answer: null, decision: 'approved', answeredAt: '2026-11-06T16:00:00Z', status: 'approved', sentAt: '2026-11-05T09:00:00Z' }),
    jq('q4', { kind: 'submittal', title: 'Door hardware', answer: null, decision: 'rejected', answeredAt: '2026-11-06T17:00:00Z', status: 'rejected', sentAt: null, history: [{ at: '2026-11-06T17:00:00Z', by: 'client', action: 'rejected', note: 'Wrong finish' }] }),
    jq('q5', { sentAt: null, answeredAt: null, answer: null, status: 'draft' }),
] }, ctx);
ok('questions: sent, answered and closed from the history; "created" is not an entry', qEvents.filter(e => e.id.startsWith('question:q1:')).map(e => e.kind).sort().join() === 'question_answered,question_closed,question_sent');
ok('questions: sent sentence', qEvents.some(e => e.title === 'Question sent to Jane: “Which tile?”'));
ok('questions: answered, with the answer', qEvents.some(e => e.id.startsWith('question:q1:answered') && e.title === 'Jane answered “Which tile?”' && e.detail === '“Grey porcelain”' && e.group === 'client'));
ok('questions: no history falls back to the times', qEvents.some(e => e.id.startsWith('question:q2:sent')) && qEvents.some(e => e.id.startsWith('question:q2:answered')));
ok('questions: submittal approved / not approved', qEvents.some(e => e.title === 'Jane approved the submittal “Window drawings”') && qEvents.some(e => e.title === 'Jane did not approve the submittal “Door hardware”' && e.detail === '“Wrong finish”'));
ok('questions: a draft has no entries', !qEvents.some(e => e.id.startsWith('question:q5')));

// ========================================================================================================== selections
const js = (id: string, o: Partial<JobSelection> = {}): JobSelection => ({
    id, userId: 'u', jobId: 'j1', title: 'Bathroom tile', category: null, room: null, body: null, dueDate: null, allowance: null,
    options: [{ id: 'o1', name: 'White subway', description: null, imagePath: null, portalPath: null, url: null, sku: null, supplierId: null, unit: null, qty: 40, unitPrice: 4.5, unitCost: null }, { id: 'o2', name: 'Grey porcelain', description: null, imagePath: null, portalPath: null, url: null, sku: null, supplierId: null, unit: null, qty: 40, unitPrice: 6, unitCost: null }],
    status: 'ordered', chosenOptionId: 'o2', clientComment: 'Love it', chosenBy: 'Jane Smith', chosenAt: '2026-11-04T18:00:00Z', history: [], poDocumentId: 'po1', sentAt: '2026-11-03T18:00:00Z', approvedAt: '2026-11-05T18:00:00Z', orderedAt: '2026-11-06T18:00:00Z', closedAt: null,
    createdAt: '2026-11-03T17:00:00Z', updatedAt: '2026-11-06T18:00:00Z', ...o,
});
const sEvents = selectionEvents({ selections: [js('s1'), js('s2', { history: [{ at: '2026-11-03T18:00:00Z', by: 'owner', action: 'sent', note: null }, { at: '2026-11-04T18:00:00Z', by: 'client', action: 'changes_requested', note: 'Different grout' }] }), js('s3', { chosenOptionId: null, chosenAt: null, approvedAt: null, orderedAt: null, sentAt: null })] }, ctx);
ok('selections: sent with its options', sEvents.some(e => e.id.startsWith('selection:s1:sent') && e.title === 'Selection “Bathroom tile” sent to Jane' && e.detail === '2 options'));
ok('selections: chosen, with option, comment and price', sEvents.some(e => e.id.startsWith('selection:s1:chosen') && e.title === 'Jane chose “Grey porcelain” for “Bathroom tile”' && e.detail === '“Love it”' && e.amount === 240));
ok('selections: approved and ordered (ordered links to the purchase order)', sEvents.some(e => e.id.startsWith('selection:s1:approved')) && sEvents.some(e => e.id.startsWith('selection:s1:ordered') && e.link?.type === 'document' && (e.link as any).formType === 'Purchase Order'));
ok('selections: changes asked for, from history', sEvents.some(e => e.id.startsWith('selection:s2:changes_requested') && e.title === 'Jane asked for changes on “Bathroom tile”' && e.detail === '“Different grout”'));
ok('selections: nothing happened = no entries', !sEvents.some(e => e.id.startsWith('selection:s3')));

// ================================================================================================ subs + quotes
const commit = (o: Partial<SubCommitment> = {}): SubCommitment => ({
    id: 'c1', jobId: 'j1', crewMemberId: null, subName: "Mike's Plumbing", title: 'Rough plumbing', description: null, amount: 4500, retainagePct: 0, startDate: null, dueDate: null, status: 'in_progress',
    payments: [{ id: 'sp1', at: '2026-11-08', amount: 1500, note: 'Deposit' }, { id: 'sp2', at: '2026-11-09', amount: -100, note: 'Fix' }], paidTotal: 1400, issuedAt: '2026-11-03T17:00:00Z', acceptedAt: '2026-11-04T17:00:00Z', acceptedBy: 'Mike Ross',
    completedAt: null, cancelledAt: null, quoteId: null, notes: null, createdAt: '2026-11-03T16:00:00Z', updatedAt: '2026-11-04T17:00:00Z', ...o,
});
const sbEvents = subEvents({ commitments: [commit(), commit({ id: 'c2', title: 'Old job', issuedAt: null, acceptedAt: null, payments: [], completedAt: '2026-11-07T17:00:00Z', cancelledAt: '2026-11-08T17:00:00Z' })] }, ctx);
ok('subs: issued with amount, accepted with who signed', sbEvents.some(e => e.id === 'sub:c1:issued' && e.title === "Subcontract “Rough plumbing” issued to Mike's Plumbing" && e.amount === 4500) && sbEvents.some(e => e.id === 'sub:c1:accepted' && e.actor === 'sub' && e.detail === 'Signed by Mike Ross'));
ok('subs: payments are Money entries, a negative one is a correction', sbEvents.some(e => e.id === 'sub:c1:paid:sp1' && e.group === 'money' && e.title === "Paid Mike's Plumbing $1,500.00 on “Rough plumbing”") && sbEvents.some(e => e.id === 'sub:c1:paid:sp2' && e.title === "Payment to Mike's Plumbing corrected by $100.00"));
ok('subs: finished and cancelled', sbEvents.some(e => e.id === 'sub:c2:completed') && sbEvents.some(e => e.id === 'sub:c2:cancelled'));
const quote = (o: Partial<JobQuote> = {}): JobQuote => ({
    id: 'qt1', jobId: 'j1', scope: 'Electrical rough-in', scopeKey: 'electrical rough-in', vendorName: 'Volt Co', crewMemberId: null, supplierId: null, amount: 3200, inclusions: null, exclusions: null, notes: null, leadTimeDays: null,
    validUntil: null, receivedOn: '2026-11-04', url: null, filePath: null, fileName: null, sizeBytes: null, status: 'chosen', chosenAt: '2026-11-06T17:00:00Z', createdAt: '2026-11-05T10:00:00Z', ...o,
});
const qtEvents = quoteEvents({ quotes: [quote(), quote({ id: 'qt2', vendorName: 'Amp Inc', status: 'received', chosenAt: null, receivedOn: null })] }, ctx);
ok('quotes: received on the day typed, chosen by you', qtEvents.some(e => e.id === 'quote:qt1:received' && e.dayOnly === true && dayOf(e.at, TZ) === '2026-11-04' && e.title === 'Quote from Volt Co for Electrical rough-in' && e.amount === 3200) && qtEvents.some(e => e.id === 'quote:qt1:chosen' && e.title === "You chose Volt Co's quote for Electrical rough-in"));
ok('quotes: no received day uses the time it was entered; not chosen = no "chosen"', qtEvents.some(e => e.id === 'quote:qt2:received' && !e.dayOnly) && !qtEvents.some(e => e.id === 'quote:qt2:chosen'));

// ================================================================================================ warranty + feedback
const wDoc = doc('w1', 'Warranty', '2026-11-02T10:00:00Z', {
    warrantyNumber: 'W-1', completedDate: '2026-11-01', duration: '1 year',
    warrantyTracking: { v: 1, startDate: '2026-11-02', expiresOn: '2027-11-02', claims: [
        { id: 'k1', date: '2026-11-08', description: 'Grout cracking', status: 'resolved', resolution: 'Regrouted', resolvedOn: '2026-11-09', photos: [], createdAt: 1, updatedAt: 1 },
        { id: 'k2', date: '2026-11-09', description: 'Squeaky floor', status: 'open', resolution: '', resolvedOn: null, photos: [], createdAt: 2, updatedAt: 2 },
    ] },
});
const wEvents = warrantyEvents({ docs: [wDoc, doc('w2', 'Warranty', '2026-11-03T10:00:00Z', {})] }, ctx);
ok('warranty: coverage start with its end', wEvents.some(e => e.id === 'warranty:w1:start' && e.title === 'Warranty W-1 coverage starts (until Tue, Nov 2, 2027)' && e.dayOnly === true));
ok('warranty: a claim reported (client) and resolved (you)', wEvents.some(e => e.id === 'warranty:w1:claim:k1' && e.group === 'client' && e.title === 'Warranty claim reported: Grout cracking') && wEvents.some(e => e.id === 'warranty:w1:claim:k1:resolved' && e.detail === 'Regrouted'));
ok('warranty: an open claim has no "resolved"', !wEvents.some(e => e.id.startsWith('warranty:w1:claim:k2:')));
ok('warranty: a warranty without tracking still starts on its creation day', wEvents.some(e => e.id === 'warranty:w2:start'));
const fb = (o: Partial<FeedbackResponse> = {}): FeedbackResponse => ({
    id: 'f1', jobId: 'j1', clientId: null, jobName: null, clientFirstName: 'Jane', token: 't', status: 'submitted', requestedAt: '2026-11-09T10:00:00Z', submittedAt: '2026-11-09T22:00:00Z', rating: 5, comment: 'Great job', clientName: 'Jane Smith',
    testimonial: false, testimonialName: null, testimonialText: null, ownerNote: null, hidden: false, createdAt: '2026-11-09T10:00:00Z', updatedAt: '2026-11-09T22:00:00Z', ...o,
});
const fbEvents = feedbackEvents({ responses: [fb(), fb({ id: 'f2', status: 'requested', submittedAt: null, rating: null })] }, ctx);
ok('feedback: asked and received with stars + comment', fbEvents.some(e => e.id === 'feedback:f1:requested' && e.title === 'Asked Jane for feedback') && fbEvents.some(e => e.id === 'feedback:f1:received' && e.title === 'Jane left feedback: 5 stars' && e.detail === '“Great job”'));
ok('feedback: not answered yet = only the request', fbEvents.filter(e => e.id.startsWith('feedback:f2')).length === 1);

// ===================================================================================== reminders, crew, expenses, orders
const rec = (o: Partial<RecordRow> = {}): RecordRow => ({ id: 'rm1', kind: 'invoice', document_id: 'inv1', job_id: 'j1', client_id: null, step_key: 'due', scheduled_for: '2026-11-09', dedupe_key: 'k', status: 'sent', to_email: 'jane@example.com', subject: 'Invoice INV-77 is due', sent_at: '2026-11-09T17:00:00Z', ...o });
const rmEvents = reminderEvents({ records: [rec(), rec({ id: 'rm2', status: 'skipped' }), rec({ id: 'rm3', status: 'failed' }), rec({ id: 'rm4', sent_at: null }), rec({ id: 'rm5', kind: 'estimate', document_id: 'zzz' })], docs }, ctx);
eq('reminders: only the ones really sent', rmEvents.map(e => e.id), ['reminder:rm1', 'reminder:rm5']);
ok('reminders: names the document and the address', rmEvents[0].title === 'Invoice reminder emailed to jane@example.com about Invoice INV-77' && rmEvents[0].actor === 'system' && rmEvents[0].group === 'client');
ok('reminders: unknown document still reads well', rmEvents[1].title === 'Estimate follow-up emailed to jane@example.com');

const pn = (id: string, memberId: string, kind: Punch['kind'], at: string): Punch => ({ id, memberId, jobId: 'j1', kind, at });
const cEvents = crewEvents({ punches: [
    pn('1', 'm1', 'in', '2026-11-03T15:30:00Z'), pn('2', 'm1', 'out', '2026-11-03T23:00:00Z'), // 7:30 - 3:00 PM
    pn('3', 'm2', 'in', '2026-11-03T16:00:00Z'), pn('4', 'm2', 'out', '2026-11-03T22:00:00Z'),
    pn('5', 'm1', 'in', '2026-11-04T07:00:00Z'), pn('6', 'm1', 'out', '2026-11-04T09:00:00Z'), // 11 PM Nov 3 -> 1 AM Nov 4: the shift counts on the day it started
] }, ctx);
const crewDay3 = cEvents.find(e => e.id === 'crew:2026-11-03')!;
eq('crew: a day is one entry with everyone on site', [crewDay3.title, crewDay3.detail], ['2 workers on site: 15h 30m in all', 'Mike Ross, Sam Lee']);
ok('crew: rows show hours and clock times in the zone', crewDay3.rows!.some(r => r.label === 'Mike Ross' && r.value.startsWith('9h 30m')) && crewDay3.rows!.some(r => r.value.includes('7:30 AM')));
ok('crew: a shift that crosses midnight counts on the day it started', cEvents.some(e => e.id === 'crew:2026-11-03' && e.rows!.some(r => r.label === 'Mike Ross' && r.value.startsWith('9h 30m'))) === true);
eq('crew: unknown member id reads as a worker', crewEvents({ punches: [pn('7', 'zz', 'in', '2026-11-05T15:00:00Z'), pn('8', 'zz', 'out', '2026-11-05T17:00:00Z')] }, ctx)[0].title, 'A worker on site: 2h');

const xEvents = expenseEvents({ docs: [
    doc('x1', 'Expense Log', '2026-11-06T22:00:00Z', { date: '2026-11-06', vendor: 'Home Depot', amount: '84.20', category: 'Material', notes: 'Screws' }),
    doc('x2', 'Expense Log', '2026-11-08T22:00:00Z', { date: '2026-11-05', lineItems: [{ id: 'a', description: 'Gas', quantity: 2, rate: 30 }], tax: 5 }),
    doc('x3', 'Expense Log', '2026-11-09T22:00:00Z', {}),
] }, ctx);
ok('expenses: vendor, amount and category', xEvents.some(e => e.id === 'expense:x1' && e.title === 'Expense logged at Home Depot: $84.20' && e.detail === 'Material · Screws' && e.group === 'money' && e.amount === 84.2));
ok('expenses: total from the lines when there is no amount; its own date, day only when saved later', xEvents.some(e => e.id === 'expense:x2' && e.amount === 65 && e.dayOnly === true && dayOf(e.at, TZ) === '2026-11-05'));
ok('expenses: an empty one still shows', xEvents.some(e => e.id === 'expense:x3' && e.title === 'Expense logged'));

const po = doc('po1', 'Purchase Order', '2026-11-03T17:00:00Z', {
    poNumber: 'PO-12', vendorName: 'Acme Supply', lineItems: [{ id: 'l', description: 'Tile', quantity: 40, rate: 5 }], clientSignedAt: '2026-11-04T10:00:00Z',
    internalDeliveries: { v: 1, rev: 'r1', list: [
        { id: 'dlv_abc123', date: '2026-11-06', note: 'Left at the gate', at: '2026-11-06T20:00:00Z', claimedAt: '2026-11-06T20:00:00Z', state: 'done', lines: [{ lineId: 'l', index: 0, description: 'Tile', qty: 40 }], items: [], applied: [], doneAt: '2026-11-06T20:05:00Z' },
        { id: 'dlv_def456', date: '', note: '', at: '2026-11-07T20:00:00Z', claimedAt: '2026-11-07T20:00:00Z', state: 'receiving', lines: [], items: [], applied: [] },
    ] },
});
const oEvents = orderEvents({ docs: [po, doc('po2', 'Purchase Order', '2026-11-05T17:00:00Z', { clientDeclinedAt: '2026-11-05T19:00:00Z', clientDeclineReason: 'Out of stock', vendorName: 'Bolt LLC', poNumber: 'PO-13' })] }, ctx);
ok('orders: created with vendor and total', oEvents.some(e => e.id === 'po:po1:created' && e.title === 'Purchase order PO-12 to Acme Supply created' && e.amount === 200));
ok('orders: confirmed by the supplier (Client group), turned down with a reason', oEvents.some(e => e.id === 'po:po1:confirmed' && e.title === 'Acme Supply confirmed Purchase order PO-12' && e.group === 'client') && oEvents.some(e => e.id === 'po:po2:declined' && e.title === "Bolt LLC can't fill Purchase order PO-13" && e.detail === 'Out of stock'));
ok('orders: a finished delivery is an entry, one still being received is not', oEvents.some(e => e.id === 'po:po1:delivery:dlv_abc123' && e.title === 'Delivery received on Purchase order PO-12 from Acme Supply' && e.detail === '1 item · Left at the gate') && !oEvents.some(e => e.id.includes('dlv_def456')));

eq('email: slot reserved for the email log (D11), returns nothing', emailEvents({ rows: [{ id: 'e1', sent_at: '2026-11-09T10:00:00Z' }] }, ctx), []);

// =========================================================================================================== aggregator
const all = buildEvents({
    docs: [...docs, ...field, noteDoc, wDoc, po, ...[doc('x1', 'Expense Log', '2026-11-06T22:00:00Z', { date: '2026-11-06', vendor: 'Home Depot', amount: '84.20', category: 'Material' })]], sentAt, photos,
    punchItems: [punch('p3', { title: 'Caulk tub', createdAt: '2026-11-05T09:00:00Z' })], tasks: [jt('t9', { title: 'Order windows', createdAt: '2026-11-03T10:00:00Z' })], questions: [jq('q2')], selections: [js('s1')],
    commitments: [commit()], quotes: [quote()], feedback: [fb()], reminders: [rec()], punches: [pn('1', 'm1', 'in', '2026-11-03T15:30:00Z'), pn('2', 'm1', 'out', '2026-11-03T23:00:00Z')],
}, ctx);
ok('aggregate: events from every source are merged', new Set(all.map(e => e.source)).size >= 15);
const sources = new Set(all.map(e => e.source));
for (const s of ['documents', 'dailyReports', 'photos', 'notes', 'punch', 'tasks', 'questions', 'selections', 'subs', 'quotes', 'warranty', 'feedback', 'reminders', 'crew', 'expenses', 'orders']) ok(`aggregate: source ${s} present`, sources.has(s as any));
ok('aggregate: ids are unique', new Set(all.map(e => e.id)).size === all.length);
ok('aggregate: every event has a group, a title and a valid time', all.every(e => TIMELINE_GROUPS.includes(e.group) && e.title.length > 0 && Number.isFinite(Date.parse(e.at))));
ok('aggregate: nothing from the future (the expired-estimate day, payments after today)', all.every(e => (dayOf(e.at, TZ) || '') <= '2026-11-10'));
const futureDocs = buildEvents({ docs: [doc('fut', 'Invoice', '2026-11-12T10:00:00Z', { invoiceNumber: 'INV-F' })] }, ctx);
eq('aggregate: a document dated tomorrow is left out', futureDocs, []);
// a day-only entry of today (noon) that is later than the clock is placed at "now"; yesterday's noon stays at noon
const clamp = buildEvents({ docs: [doc('cl1', 'Expense Log', '2026-11-09T19:00:00Z', { date: '2026-11-10', amount: 5 }), doc('cl2', 'Expense Log', '2026-11-10T16:00:00Z', { date: '2026-11-09', amount: 6 })] }, { ...ctx, now: Date.parse('2026-11-10T17:00:00Z') }); // 9 AM in LA
eq('aggregate: day-only entry later today is placed at now, an earlier day keeps its noon', clamp.map(e => [e.id, e.at, e.dayOnly]).sort(), [['expense:cl1', '2026-11-10T17:00:00.000Z', true], ['expense:cl2', '2026-11-09T20:00:00.000Z', true]]);
ok('aggregate: one failing source never blanks the rest', buildEvents({ docs, photos: 'bad' as any, tasks: [null as any] }, ctx).length > 10);
eq('aggregate: no data = no events', buildEvents({}, ctx), []);
const dupes = dedupeEvents([...all.slice(0, 5), ...all.slice(0, 5), { ...all[0], id: 'other-id' }]);
eq('dedupe: same id once, same sentence at the same instant once', dupes.length, 5);
ok('dedupe: drops events without an id or a real time', dedupeEvents([{ ...all[0], id: '' }, { ...all[1], at: 'nope' }]).length === 0);

const newest = sortEvents(all, 'newest');
ok('sort: newest first', newest.every((e, i) => i === 0 || Date.parse(newest[i - 1].at) >= Date.parse(e.at)));
const oldest = sortEvents(all, 'oldest');
ok('sort: oldest first', oldest.every((e, i) => i === 0 || Date.parse(oldest[i - 1].at) <= Date.parse(e.at)));
eq('sort: stable for the same instant (by id)', sortEvents([{ ...all[0], id: 'b', at: '2026-11-03T10:00:00Z' }, { ...all[1], id: 'a', at: '2026-11-03T10:00:00Z' }]).map(e => e.id), ['a', 'b']);
eq('sort: does not change the input', all === sortEvents(all), false);

const days = groupByDay(newest, TZ);
ok('group: days are local days, in order, and every event is in its own day', days.every((d, i) => d.events.every(e => dayOf(e.at, TZ) === d.day) && (i === 0 || days[i - 1].day > d.day)));
eq('group: counts add up', days.reduce((s, d) => s + d.events.length, 0), all.length);
const midnight = groupByDay(sortEvents([
    { ...all[0], id: 'late', at: '2026-11-04T07:59:00Z' }, { ...all[1], id: 'early', at: '2026-11-04T08:01:00Z' },
], 'newest'), TZ);
eq('group: 11:59 PM and 12:01 AM local fall on different days', midnight.map(d => [d.day, d.events.map(e => e.id)]), [['2026-11-04', ['early']], ['2026-11-03', ['late']]]);
eq('group: the same two instants in UTC share one day', groupByDay(sortEvents([{ ...all[0], id: 'late', at: '2026-11-04T07:59:00Z' }, { ...all[1], id: 'early', at: '2026-11-04T08:01:00Z' }], 'newest'), 'UTC').length, 1);
eq('group: oldest first goes the other way', groupByDay(sortEvents(all, 'oldest'), TZ).map(d => d.day), [...days.map(d => d.day)].reverse());

// filters ----------------------------------------------------------------------------------------------------------
eq('weekStart: Monday of the week', [weekStart('2026-11-10'), weekStart('2026-11-08'), weekStart('2026-11-09')], ['2026-11-09', '2026-11-02', '2026-11-09']);
eq('rangeStart', [rangeStart('week', '2026-11-10'), rangeStart('month', '2026-11-10'), rangeStart('all', '2026-11-10'), rangeStart(undefined, '2026-11-10')], ['2026-11-09', '2026-11-01', null, null]);
const groupsOf = (events: TimelineEvent[]) => [...new Set(events.map(e => e.group))].sort();
eq('filter: no filters = everything', applyFilters(all, {}, ctx).length, all.length);
eq('filter: Photos only', groupsOf(applyFilters(all, { groups: ['photos'] }, ctx)), ['photos']);
eq('filter: two groups', groupsOf(applyFilters(all, { groups: ['photos', 'notes'] }, ctx)), ['notes', 'photos']);
ok('filter: this week = from Monday', applyFilters(all, { range: 'week' }, ctx).every(e => (dayOf(e.at, TZ) || '') >= '2026-11-09') && applyFilters(all, { range: 'week' }, ctx).length > 0);
const inNovember = all.filter(e => (dayOf(e.at, TZ) || '') >= '2026-11-01').length;
ok('filter: this month = from the 1st (the October estimate is out)', all.length > inNovember && applyFilters(all, { range: 'month' }, ctx).length === inNovember);
ok('filter: an older month is left out of "this month"', applyFilters([{ ...all[0], id: 'old', title: 'old', at: '2026-10-31T10:00:00Z' }, ...all], { range: 'month' }, ctx).length === inNovember);
ok('filter: search finds a word anywhere in the entry', applyFilters(all, { query: 'thinset' }, ctx).some(e => e.id === 'day:2026-11-03:report') && applyFilters(all, { query: 'thinset' }, ctx).length === 1);
ok('filter: search is case-insensitive and needs every word', applyFilters(all, { query: 'JANE signed' }, ctx).some(e => e.kind === 'doc_signed') && applyFilters(all, { query: 'jane zzzzz' }, ctx).length === 0);
ok('filter: search finds an amount, with or without the sign', applyFilters(all, { query: '$84.20' }, ctx).some(e => e.id === 'expense:x1') && applyFilters(all, { query: '84.2' }, ctx).some(e => e.id === 'expense:x1'));
ok('filter: search finds text in a note body and a photo caption', applyFilters(all, { query: 'sample friday' }, ctx).some(e => e.id === 'note:n1') && applyFilters(all, { query: 'cracked tile' }, ctx).some(e => e.kind === 'photos'));
ok('filter: search finds a group name', applyFilters(all, { query: 'money' }, ctx).length > 0);
eq('filter: blank search = no filter', applyFilters(all, { query: '   ' }, ctx).length, all.length);
ok('searchText: lower case', searchText(all[0]) === searchText(all[0]).toLowerCase());
const counts = groupCounts(all, {}, ctx);
eq('counts: they add up to the events', Object.values(counts).reduce((s, n) => s + n, 0), all.length);
eq('counts: every group has a label', TIMELINE_GROUPS.every(g => !!GROUP_LABELS[g]), true);
const photoOnly = groupCounts(all, { query: 'photo' }, ctx);
ok('counts: follow the search and the range (but not the group chips)', photoOnly.photos > 0 && photoOnly.photos <= counts.photos && groupCounts(all, { groups: ['photos'] }, ctx).money === counts.money);
eq('counts: the date range changes them', groupCounts(all, { range: 'week' }, ctx).photos <= counts.photos, true);

// paging ------------------------------------------------------------------------------------------------------------
const many: TimelineEvent[] = Array.from({ length: 120 }, (_, i) => ({ ...all[0], id: `m${i}`, title: `Event ${i}`, at: new Date(NOW - i * 3_600_000).toISOString() }));
eq('page: 50 at a time', [pageEvents(many).items.length, pageEvents(many).hasMore, pageEvents(many).remaining], [50, true, 70]);
eq('page: the last page', [pageEvents(many, 150).items.length, pageEvents(many, 150).hasMore, pageEvents(many, 150).remaining], [120, false, 0]);
eq('page: never negative', pageEvents(many, -5).items.length, 0);
const view1 = buildView(many, { filters: {}, order: 'newest', limit: PAGE_SIZE }, ctx);
eq('view: first page', [view1.shown, view1.total, view1.hasMore, view1.remaining, view1.days.reduce((s, d) => s + d.events.length, 0)], [50, 120, true, 70, 50]);
const view2 = buildView(many, { filters: {}, order: 'newest', limit: PAGE_SIZE * 3 }, ctx);
eq('view: "Show earlier" twice shows everything', [view2.shown, view2.hasMore], [120, false]);
eq('view: newest first starts with the newest', view1.days[0].events[0].id, 'm0');
eq('view: oldest first starts with the oldest', buildView(many, { filters: {}, order: 'oldest', limit: 10 }, ctx).days[0].events[0].id, 'm119');
eq('view: a filter changes the total, paging applies after it', buildView(many, { filters: { query: 'event 11' }, order: 'newest', limit: 5 }, ctx).total, 11);
ok('view: counts come from the whole list, not the page', view1.counts[many[0].group] === 120);

// ============================================================================================ rows from the database
const row = docFromRow({ id: 'r1', job_id: 'j1', type: 'Invoice', created_at: '2026-11-01T10:00:00Z', status: 'Sent', paidAt: null, payments: [{ id: 'p' }], invoiceNumber: 'INV-1', clientSignedAt: undefined });
eq('row: mapped, nulls dropped, id/type/created kept out of data', [row.id, row.type, row.createdAt, row.jobId, row.data], ['r1', 'Invoice', '2026-11-01T10:00:00Z', 'j1', { status: 'Sent', payments: [{ id: 'p' }], invoiceNumber: 'INV-1' }]);
ok('row: the column list asks for JSON paths only, never the whole data', !/(^|,\s*)data(\s*,|$)/.test(TIMELINE_COLUMNS) && TIMELINE_COLUMNS.includes('clientSignedAt:data->>clientSignedAt') && TIMELINE_COLUMNS.includes('payments:data->payments'));

// ===================================================================================== no new write paths (owner rule)
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const files = [
    ...readdirSync(join(ROOT, 'lib/timeline')).filter(f => f.endsWith('.ts')).map(f => `lib/timeline/${f}`),
    ...readdirSync(join(ROOT, 'lib/timeline/sources')).map(f => `lib/timeline/sources/${f}`),
    ...readdirSync(join(ROOT, 'components/timeline')).map(f => `components/timeline/${f}`),
];
const WRITE_RE = /\.from\([^)]*\)[^;]*?\.(insert|update|upsert|delete)\(|\.rpc\(|\.storage\.from\([^)]*\)\.(upload|remove)/;
ok('guard: nothing in the Timeline writes to the database itself', files.every(f => !WRITE_RE.test(read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))));
const adapterFiles = files.filter(f => f.startsWith('lib/timeline/sources/'));
ok('guard: adapters are pure (no supabase, no React, no fetch)', adapterFiles.every(f => !/from '.*(supabase|react)(\.ts)?'|fetch\(/.test(read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))));
ok('guard: the note path is the audited one (saveJobNote online, the outbox offline) and the task path is createTask', /saveJobNote/.test(read('lib/timeline/noteSave.ts')) && /input\.queue\(/.test(read('lib/timeline/noteSave.ts')) && /createTask\(/.test(read('lib/timeline/noteSave.ts')));
ok('guard: no model call and no database file touched', files.every(f => !/ai-assistant|supabase\/functions|src\/ai\//.test(read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').replace(/supabase\/functions\/reminders\/shared/g, ''))));

console.log(`timeline-check: ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
